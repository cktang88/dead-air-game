// SPRITE-STACK ENGINE for the Canvas 2D renderer. Full guide: docs/art/STACKING.md.
//
// A "stack" is a 3D-looking object stored as a pile of 2D horizontal slices (voxel layers). Each slice is baked once
// to an offscreen canvas; a composite of the whole pile is baked per yaw bucket (rotate every slice about the model
// pivot, shift slice k up the screen by k * layerH * STACK_TILT px, edge-light / edge-shade each slice, add a dark
// outline). Per frame an object is ONE drawImage per part. Because slices are rotated and then lifted in SCREEN space
// (the camera tilt never rotates), the volume, parallax and the fixed light (LIGHT in sprites2d.js) stay correct at
// every facing.
//
// MODEL FORMAT (all three authoring forms produce the same thing):
//   {
//     id: 'player.torso',            // unique; part of the cache key
//     unit: 0.8,                     // world units (px at zoom 1) per cell; default 1
//     layerH: 0.8,                   // world units of height per slice; default = unit
//     pivot: {x, y},                 // cell coords of the rotation centre (0,0 = top-left corner of the grid); default centre
//     palette: {'a': '#rrggbb', 'L': {c: '#7fe8ff', emit: true}},   // char -> colour; emit = ignores shading (lenses, LEDs)
//     buckets: 48,                   // yaw buckets baked lazily; 32-64
//     // 1) voxel grid built in code (best for detailed models):
//     grid: VoxelGrid,
//     // 2) voxel strings: layers[k] = array of rows (y), chars (x). ' ' or '.' is empty. layers[0] is the bottom.
//     layers: [['.aa.', 'aaaa'], ...],
//     // 3) procedural slices: size {w,h} in WORLD UNITS, pivot defaults to the centre (units here), z = layer index.
//     size: {w, h}, slices: [{z, draw(g, c)}]   // g is a 2D ctx where 1 = 1 world unit and (0,0) = pivot; c = {col(hex), z, zFrac, unit}
//   }
// Axes: +x is the model's FRONT (yaw 0 faces screen-right), +y is its right-hand side (screen-down at yaw 0), z is up.
//
// Drawing: drawStack(ctx, model, x, y, {yaw, z, variant, flash, sx, sy, alpha}). (x, y) is the ground point under the
// pivot, z lifts it (world units of height). Cost per call: one drawImage (two while flashing).
import {makeCanvas, shade, getSpriteScale, onSpriteScale, TAU} from './sprites2d.js';
import {bakeComposite, bakeVoxSlices, spreadOrder, layerShade, voxelColor, INK_OUTLINE, bucketYaw} from './stack-bake.js';
export {layerShade, voxelColor, INK_OUTLINE, bucketYaw};

/** Screen pixels (world units) a point rises per world unit of height. The ONE camera tilt shared by every stack. */
export const STACK_TILT = 0.72;

// ---------------------------------------------------------------- pure helpers (unit tested)
export const bucketIndex = (yaw, n) => ((Math.round(yaw / TAU * n) % n) + n) % n;
/** Circular distance between two bucket indices. */
export const bucketDist = (a, b, n) => { const d = Math.abs(a - b) % n; return Math.min(d, n - d); };
/** The nearest baked bucket to bi (ties: the higher index) within maxD, or -1. Pure; `have(i)` says whether bucket i is baked. */
export function nearestBucket(bi, n, have, maxD = n >> 1) {
  for (let d = 1; d <= maxD; d++) { const a = (bi + d) % n, b = (bi - d + n) % n; if (have(a)) return a; if (have(b)) return b; }
  return -1;
}

/** Mutable voxel grid. x = front, y = right, z = up. Cells hold a palette char code (0 = empty). */
export class VoxelGrid {
  constructor(w, d, h) { this.w = w; this.d = d; this.h = h; this.v = new Uint16Array(w * d * h); }
  idx(x, y, z) { return (z * this.d + y) * this.w + x; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.d && z < this.h; }
  set(x, y, z, ch) { x |= 0; y |= 0; z |= 0; if (this.inside(x, y, z)) this.v[this.idx(x, y, z)] = typeof ch === 'string' ? (ch === ' ' || ch === '.' ? 0 : ch.charCodeAt(0)) : ch; return this; }
  get(x, y, z) { return this.inside(x, y, z) ? this.v[this.idx(x, y, z)] : 0; }
  has(x, y, z) { return this.get(x, y, z) !== 0; }
  count() { let n = 0; for (const c of this.v) if (c) n++; return n; }
  /** Fills [x0,x1) x [y0,y1) x [z0,z1). */
  box(x0, y0, z0, x1, y1, z1, ch) { for (let z = Math.max(0, Math.floor(z0)); z < Math.min(this.h, z1); z++) for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.d, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, x1); x++) this.set(x, y, z, ch); return this; }
  /** Superellipsoid centred at (cx,cy,cz) with radii; p = 2 is an ellipsoid, 3-4 a rounded box. keep = only paint over empty cells. */
  ellipsoid(cx, cy, cz, rx, ry, rz, ch, p = 2, keep = false) {
    for (let z = Math.max(0, Math.floor(cz - rz)); z <= Math.min(this.h - 1, Math.ceil(cz + rz)); z++)
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.d - 1, Math.ceil(cy + ry)); y++)
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(this.w - 1, Math.ceil(cx + rx)); x++) {
          const a = Math.abs((x + 0.5 - cx) / rx) ** p + Math.abs((y + 0.5 - cy) / ry) ** p + Math.abs((z + 0.5 - cz) / rz) ** p;
          if (a <= 1 && !(keep && this.has(x, y, z))) this.set(x, y, z, ch);
        }
    return this;
  }
  /** Vertical (z axis) elliptical cylinder from layer z0 up to z1 (exclusive). */
  cyl(cx, cy, z0, z1, rx, ry, ch, p = 2) { for (let z = Math.max(0, z0); z < Math.min(this.h, z1); z++) this.ellipsoid(cx, cy, z + 0.5, rx, ry, 0.5, ch, p); return this; }
  /** Cylinder along x from x0 to x1 (exclusive) centred at (cy,cz), radius ry/rz. */
  rod(x0, x1, cy, cz, ry, rz, ch, p = 2) { for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, x1); x++) this.ellipsoid(x + 0.5, cy, cz, 0.5, ry, rz, ch, p); return this; }
  /** Replaces every cell holding `from` with `to` (e.g. recolour the top layer). */
  replace(from, to) { const f = typeof from === 'string' ? from.charCodeAt(0) : from, t = typeof to === 'string' ? to.charCodeAt(0) : to; for (let i = 0; i < this.v.length; i++) if (this.v[i] === f) this.v[i] = t; return this; }
  /** Mirrors cells across the y centre (writes into empty cells only), so you can author one half. */
  mirrorY() { for (let z = 0; z < this.h; z++) for (let y = 0; y < this.d; y++) for (let x = 0; x < this.w; x++) { const c = this.get(x, y, z); if (c && !this.has(x, this.d - 1 - y, z)) this.set(x, this.d - 1 - y, z, c); } return this; }
  /** Paints a character on every exposed-from-above cell of the given chars (e.g. lighter top plates). */
  topCoat(from, to) { for (let z = 0; z < this.h; z++) for (let y = 0; y < this.d; y++) for (let x = 0; x < this.w; x++) if (this.get(x, y, z) === from.charCodeAt(0) && !this.has(x, y, z + 1)) this.set(x, y, z, to); return this; }
  /** Layer k as rows of chars (debug / round trip). */
  layerRows(k) { const rows = []; for (let y = 0; y < this.d; y++) { let s = ''; for (let x = 0; x < this.w; x++) { const c = this.get(x, y, k); s += c ? String.fromCharCode(c) : '.'; } rows.push(s); } return rows; }
  static fromLayers(layers) {
    const h = layers.length, d = Math.max(...layers.map((l) => l.length)), w = Math.max(...layers.flatMap((l) => l.map((r) => r.length)));
    const g = new VoxelGrid(w, d, h);
    layers.forEach((rows, z) => rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) g.set(x, y, z, row[x]); }));
    return g;
  }
}

/** Turns any of the three authoring forms into one normalised description. Pure. */
export function normalizeModel(m) {
  const unit = m.unit || 1, layerH = m.layerH || unit, palette = {};
  for (const [k, v] of Object.entries(m.palette || {})) palette[k] = typeof v === 'string' ? {c: v, emit: false} : {c: v.c, emit: !!v.emit};
  let grid = m.grid || (m.layers ? VoxelGrid.fromLayers(m.layers) : null);
  if (grid) {
    const pivot = m.pivot || {x: grid.w / 2, y: grid.d / 2};
    let rad = 0;
    for (let z = 0; z < grid.h; z++) for (let y = 0; y < grid.d; y++) for (let x = 0; x < grid.w; x++) if (grid.has(x, y, z)) rad = Math.max(rad, Math.hypot(Math.max(Math.abs(x - pivot.x), Math.abs(x + 1 - pivot.x)), Math.max(Math.abs(y - pivot.y), Math.abs(y + 1 - pivot.y))));
    return {id: m.id, kind: 'vox', unit, layerH, palette, grid, pivot, count: grid.h, radius: rad * unit, height: grid.h * layerH, buckets: m.buckets || 48};
  }
  const size = m.size || {w: 16, h: 16}, pivotU = m.pivot || {x: size.w / 2, y: size.h / 2};
  const slices = (m.slices || []).slice().sort((a, b) => a.z - b.z);
  const rad = Math.hypot(Math.max(pivotU.x, size.w - pivotU.x), Math.max(pivotU.y, size.h - pivotU.y));
  return {id: m.id, kind: 'draw', unit, layerH, palette, size, pivot: pivotU, slices, count: slices.length ? slices[slices.length - 1].z + 1 : 0, radius: rad, height: (slices.length ? slices[slices.length - 1].z + 1 : 0) * layerH, buckets: m.buckets || 48};
}
// ---------------------------------------------------------------- scale (shared with sprites2d) and the cache
let PX = 2;                  // device px per world unit the stacks are baked at (quantised, with hysteresis)
const cache = new Map();     // key -> entry
let bytes = 0;
export const STACK_CONFIG = {
  enabled: true,
  props: true,                            // stacked world props (cover, crates, pickups, doors); ?props=0 reverts to the painted art
  kinds: new Set(['player', 'gunner', 'guard', 'sniper', 'riot']),   // actor kinds drawn as stacks; everything else keeps the legacy sprites
  cacheBytes: 56 * 1024 * 1024,           // hard cap on baked composites
  bakeBudgetMs: 2.5,                      // per-frame lazy bake allowance (main-thread path); over budget we reuse the nearest baked angle
  coldBudgetMs: 8,                        // a part with NOTHING baked yet may bake one angle here until the frame has spent this long
  worker: true,                           // bake yaw buckets in a Worker (OffscreenCanvas); ?worker=0 bakes on the main thread
  prefetchFrac: 0.62,                     // warmStack stops queueing buckets once the cache is this full
  prefetchStep: 2,                        // warmStack bakes every Nth bucket up front; the rest are baked on demand (nearest baked is drawn meanwhile)
  neighbours: 1,                          // on a demand miss also queue the +-N neighbouring buckets
};
try {
  if (typeof location !== 'undefined') { const q = new URLSearchParams(location.search); if (q.get('stack') === '0') STACK_CONFIG.enabled = false; if (q.get('props') === '0') STACK_CONFIG.props = false; if (q.get('worker') === '0') STACK_CONFIG.worker = false; }
} catch { /* no location */ }
export const stackStats = {bakes: 0, bakeMs: 0, draws: 0, entries: 0, mb: 0, syncBakes: 0, workerBakes: 0, workerMs: 0, pending: 0, builds: 0, buildMs: 0, fallbacks: 0};
const LEVELS = [1, 1.5, 2, 2.75, 3.75, 5];
function pickLevel(px) { let best = LEVELS[0]; for (const l of LEVELS) if (Math.abs(Math.log(l / px)) < Math.abs(Math.log(best / px))) best = l; return best; }
export function setStackScale(pxPerUnit) {
  // hysteresis: keep the current bake level until the real scale is >22% away, so a zoom breath never re-bakes
  if (Math.abs(Math.log(pxPerUnit / PX)) < 0.2 && cache.size) return;
  const lv = pickLevel(pxPerUnit);
  if (lv !== PX) { PX = lv; clearStackCache(); }
}
export function clearStackCache() {
  for (const e of cache.values()) { e.dead = true; for (const b of e.buckets) if (b && b.close) { try { b.close(); } catch { /* ok */ } } }
  cache.clear(); byId.clear(); bytes = 0; stackStats.pending = 0; if (worker) worker.postMessage({t: 'clear'});
}
onSpriteScale(setStackScale);
{ const px0 = getSpriteScale(); if (px0) PX = pickLevel(px0); }
export const stackScale = () => PX;

let frameStart = 0;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** Call once per frame before drawing stacks so the lazy bake budget resets. */
export function beginStackFrame() { frameStart = now(); stackStats.draws = 0; }

const variantKey = (v) => (v ? v.key : '');
/** Palette variants: map every non-emissive colour. tintVariant('elite', '#ff7a3a', 0.25) mixes towards a colour. */
export function tintVariant(key, color, amount) { return {key: `${key}:${color}:${amount}`, fn: (hex) => hexMix(hex, color, amount)}; }
export function darkVariant(key, f) { return {key: `${key}:${f}`, fn: (hex) => hexMul(hex, f)}; }
function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
const h2 = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export function hexMix(a, b, t) { const p = rgb(a), q = rgb(b); return h2(p.map((v, i) => v + (q[i] - v) * t)); }
export function hexMul(a, f) { return h2(rgb(a).map((v) => v * f)); }

// ---------------------------------------------------------------- the worker (off-thread bucket baking)
const byId = new Map();      // entry id -> entry (results come back by id)
let worker = null, workerFailed = false, nextId = 1;
const workerOk = () => STACK_CONFIG.worker && !workerFailed && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof document !== 'undefined';
function getWorker() {
  if (worker || !workerOk()) return worker;
  try {
    worker = new Worker(new URL('./stack-worker.js', import.meta.url), {type: 'module'});
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.t === 'imgs') {
        for (const r of m.list) {
          const e = byId.get(r.id);
          if (!e) { try { r.bm.close(); } catch { /* ok */ } continue; }
          e.pend[r.bi] = 0; stackStats.pending--;
          if (e.buckets[r.bi]) { try { r.bm.close(); } catch { /* ok */ } continue; }
          e.buckets[r.bi] = r.bm; e.have++; e.cx[r.bi] = r.cx; e.cy[r.bi] = r.cy;
          const sz = r.bm.width * r.bm.height * 4; e.size += sz; bytes += sz;
          stackStats.bakes++; stackStats.workerBakes++; stackStats.workerMs += r.ms;
          if (bytes > STACK_CONFIG.cacheBytes) evict(e);
        }
        stackStats.mb = bytes / 1048576;
      } else if (m.t === 'err') fail(m.message);
    };
    worker.onerror = (ev) => fail(ev && ev.message);
  } catch (err) { fail(err && err.message); }
  return worker;
}
function fail(msg) {
  // never break the game over a baking worker: fall back to the main-thread baker
  workerFailed = true; if (typeof console !== 'undefined') console.warn('[stack2d] worker disabled:', msg);
  try { if (worker) worker.terminate(); } catch { /* ok */ }
  worker = null;
  for (const e of cache.values()) { e.pend.fill(0); e.wreg = false; }
  stackStats.pending = 0;
}

function entryFor(model, variant) {
  // fast path: the last entry this (model, variant, scale) resolved to (no string building / map lookup per part per frame)
  let e = model._ee;
  if (e && model._ev === variant && !e.dead && e.PX === PX) { e.tick = ++tickCounter; return e; }
  const key = model.id + '|' + variantKey(variant) + '|' + PX;
  e = cache.get(key);
  if (!e) { const t0 = now(); e = buildEntry(model, variant, key); cache.set(key, e); stackStats.entries = cache.size; stackStats.builds++; stackStats.buildMs += now() - t0; }
  e.tick = ++tickCounter;
  model._ee = e; model._ev = variant;
  return e;
}
let tickCounter = 0;

function buildEntry(model, variant, key) {
  const n = model._n || (model._n = normalizeModel(model));
  const unit = n.unit, cell = unit * PX, o = Math.max(1, Math.round(PX * 0.6));
  const dzPx = n.layerH * STACK_TILT * PX;
  const R = Math.ceil(n.radius * PX) + o + 2, up = Math.ceil((n.count * dzPx)) + 1, pad = o + 1;
  const W = 2 * R + 2 * pad, H = 2 * R + up + 2 * pad;
  const col = (hex) => (variant ? variant.fn(hex) : hex);
  const e = {id: nextId++, key, n, model, variant, PX, W, H, R, up, pad, o, dzPx, ax: W / 2, ay: pad + up + R, cell, slices: null, vox: null, buckets: new Array(n.buckets).fill(null), pend: new Uint8Array(n.buckets), cx: new Int16Array(n.buckets), cy: new Int16Array(n.buckets), have: 0, dem: 0, whites: new Array(n.buckets).fill(null), tmpA: null, tmpB: null, nBuckets: n.buckets, tick: 0, size: 0, wreg: false, warm: false};
  if (n.kind === 'vox') {
    // the variant-mapped palette is all a baker needs besides the grid; the worker builds the slices itself
    const palette = {};
    for (const [k, v] of Object.entries(n.palette)) palette[k] = {c: col(v.c), emit: v.emit};
    e.vox = {n: {grid: {w: n.grid.w, d: n.grid.d, h: n.grid.h, v: n.grid.v}, palette, count: n.count, pivot: n.pivot}, cell};
  }
  byId.set(e.id, e);
  return e;
}

/** Main-thread slices (the sync baker, and procedural models, which can only be drawn here). Built lazily. */
function slicesOf(e) {
  if (e.slices) return e.slices;
  const n = e.n, col = (hex) => (e.variant ? e.variant.fn(hex) : hex);
  if (e.vox) { e.slices = bakeVoxSlices(e.vox.n, e.cell, makeCanvas); return e.slices; }
  const slices = [];
  for (let k = 0; k < n.count; k++) {
    const zFrac = n.count > 1 ? k / (n.count - 1) : 1;
    const sl = n.slices.filter((q) => q.z === k);
    if (!sl.length) continue;
    const cv = makeCanvas(n.size.w * e.PX, n.size.h * e.PX), g = cv.getContext('2d');
    g.scale(e.PX, e.PX); g.translate(n.pivot.x, n.pivot.y); g.lineJoin = 'round'; g.lineCap = 'round';
    const c = {col: (hex) => shade(col(hex), layerShade(zFrac)), raw: col, z: k, zFrac, unit: n.unit};
    for (const q of sl) q.draw(g, c);
    slices.push({k, cv, ox: n.pivot.x * e.PX, oy: n.pivot.y * e.PX});
  }
  e.slices = slices;
  return slices;
}

function bakeBucket(e, bi) {
  const t0 = now();
  e.slices = slicesOf(e);
  const r = bakeComposite(makeCanvas, e, bi), out = r.cv;
  e.buckets[bi] = out; e.have++; e.cx[bi] = r.cx; e.cy[bi] = r.cy;
  const sz = out.width * out.height * 4; e.size += sz; bytes += sz;
  (stackStats.cold || (stackStats.cold = [])).push(e.n.id + '|' + (e.variant ? e.variant.key : ''));
  stackStats.bakes++; stackStats.syncBakes++; stackStats.bakeMs += now() - t0; stackStats.mb = bytes / 1048576;
  if (bytes > STACK_CONFIG.cacheBytes) evict(e);
  return out;
}
/** Ask the worker for buckets (demand = jump the queue, lo = prefetch). Registers the entry with it first. */
function request(e, list, lo) {
  const w = getWorker();
  if (!w || !e.vox) return false;
  if (!e.wreg) {
    const {n, cell} = e.vox;
    w.postMessage({t: 'reg', id: e.id, W: e.W, H: e.H, ax: e.ax, ay: e.ay, o: e.o, dzPx: e.dzPx, nBuckets: e.nBuckets, vox: {n, cell}});
    e.wreg = true;
  }
  // pend[bi]: 0 idle, 1 queued as demand, 2 queued as a low-priority prefetch
  const out = [], promote = [];
  for (const bi of list) {
    if (e.buckets[bi]) continue;
    if (!e.pend[bi]) { e.pend[bi] = lo ? 2 : 1; stackStats.pending++; out.push(bi); }
    else if (!lo && e.pend[bi] === 2) { e.pend[bi] = 1; promote.push(bi); }   // demand miss on a bucket stuck in the prefetch queue
  }
  if (out.length) w.postMessage({t: 'bake', id: e.id, list: out, lo});
  // the worker skips jobs already done, so whichever copy runs second is a no-op (one bitmap, one pending decrement)
  if (promote.length) w.postMessage({t: 'bake', id: e.id, list: promote, lo: false});
  return true;
}
function whiteOf(e, bi, img, color) {
  const key = bi;
  let w = e.whites[key];
  if (!w) {
    w = makeCanvas(img.width, img.height); const g = w.getContext('2d');
    g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = color || '#fff'; g.fillRect(0, 0, w.width, w.height);
    e.whites[key] = w; const sz = w.width * w.height * 4; e.size += sz; bytes += sz;
  }
  return w;
}
function evict(keep) {
  const list = [...cache.values()].filter((v) => v !== keep).sort((a, b) => a.tick - b.tick);
  const dropped = [];
  for (const v of list) {
    if (bytes <= STACK_CONFIG.cacheBytes * 0.7) break;
    bytes -= v.size; v.dead = true; cache.delete(v.key); byId.delete(v.id); dropped.push(v.id);
    for (const p of v.pend) if (p) stackStats.pending--;
    if (v.model._ee === v) v.model._ee = null;
    for (const b of v.buckets) if (b && b.close) { try { b.close(); } catch { /* ok */ } }
  }
  if (dropped.length && worker) worker.postMessage({t: 'drop', ids: dropped});
  stackStats.entries = cache.size;
}

/**
 * The image to draw for bucket bi, or null (nothing baked at all and nothing can be baked this frame). A missing bucket is requested
 * from the worker (plus its neighbours) and the nearest baked angle is drawn meanwhile; without a worker the old budgeted sync bake runs.
 */
function bucketImage(e, bi) {
  const img = e.buckets[bi];
  if (img) { _r.bi = bi; return img; }
  const n = e.nBuckets;
  const fresh = !e.pend[bi];
  if (e.vox && request(e, [bi], false)) {
    const nb = STACK_CONFIG.neighbours;
    if (fresh) e.dem++;   // a model only ever seen at one angle (props) does not get its neighbours baked
    if (nb > 0 && e.dem > 1) { const l = []; for (let d = 1; d <= nb; d++) l.push((bi + d) % n, (bi - d + n) % n); request(e, l, true); }
    if (e.have) { const j = nearestBucket(bi, n, (i) => !!e.buckets[i]); if (j >= 0) { stackStats.fallbacks++; _r.bi = j; return e.buckets[j]; } }
    // cold entry: nothing to show yet. Bake this one angle here so a part never vanishes (only the hard cap stops it: a whole squad
    // appearing on one frame must not take the frame down; the rest pop in as the worker's buckets arrive)
    if (now() - frameStart > STACK_CONFIG.coldBudgetMs) return null;
    _r.bi = bi; return bakeBucket(e, bi);
  }
  // main-thread baking: over the per-frame budget reuse the nearest baked angle instead of hitching
  if (now() - frameStart > STACK_CONFIG.bakeBudgetMs && e.have) { const j = nearestBucket(bi, n, (i) => !!e.buckets[i]); if (j >= 0) { _r.bi = j; return e.buckets[j]; } }
  _r.bi = bi; return bakeBucket(e, bi);
}

/** Bakes every yaw bucket of a model now (loading screens / idle). Returns the number of buckets baked. */
export function prebake(model, variant, count) {
  const e = entryFor(model, variant); let c = 0;
  for (let i = 0; i < e.nBuckets && (count === undefined || c < count); i++) if (!e.buckets[i]) { bakeBucket(e, i); c++; }
  return c;
}
/**
 * Queues a model's yaw buckets for the background baker (every STACK_CONFIG.prefetchStep-th one, spread round the circle) so the
 * first fight does not bake. A no-op without a worker or when the cache is already prefetchFrac full. Safe to call every frame.
 */
/** True when warmStack can do anything (stacks on, a baking worker is possible). */
export const warmAvailable = () => STACK_CONFIG.enabled && workerOk();
export function warmStack(model, variant, step = STACK_CONFIG.prefetchStep) {
  if (!model || !warmAvailable()) return false;
  const e = entryFor(model, variant);
  if (e.warm || !e.vox) return false;
  if (bytes > STACK_CONFIG.cacheBytes * STACK_CONFIG.prefetchFrac) return false;
  e.warm = true;
  return request(e, spreadOrder(e.nBuckets, step), true);
}

const _r = {bi: 0};
/**
 * Draws a stack. (x, y) = ground point under the pivot, opts.z = extra height in world units, opts.yaw = facing.
 * opts: {yaw, z, variant, flash (0..1 white overlay), flashColor, sx, sy (squash about the pivot), alpha}
 */
export function drawStack(ctx, model, x, y, opts = {}) {
  const e = entryFor(model, opts.variant);
  const yaw = opts.yaw || 0, bi = bucketIndex(yaw, e.nBuckets);
  const img = bucketImage(e, bi);
  if (!img) return;
  const inv = 1 / e.PX, z = opts.z || 0, sx = opts.sx ?? 1, sy = opts.sy ?? 1, alpha = opts.alpha ?? 1;
  const gy = y - z * STACK_TILT, bj = _r.bi, ox = (e.ax - e.cx[bj]) * inv, oy = (e.ay - e.cy[bj]) * inv;
  stackStats.draws++;
  // squash is applied to the destination rectangle (same result as save/translate/scale/restore, minus the state churn)
  const dx = x - ox * sx, dy = gy - oy * sy, dw = img.width * inv * sx, dh = img.height * inv * sy;
  if (alpha === 1 && !(opts.flash > 0)) { ctx.drawImage(img, dx, dy, dw, dh); return; }
  const a0 = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = a0 * alpha;
  ctx.drawImage(img, dx, dy, dw, dh);
  if (opts.flash > 0) { ctx.globalAlpha = ctx.globalAlpha * Math.min(1, opts.flash); ctx.drawImage(whiteOf(e, bj, img, opts.flashColor), dx, dy, dw, dh); }
  ctx.globalAlpha = a0;
}

/** Soft contact shadow ellipse under a stack's base. Use under feet / props; cheap radial gradient cached by size. */
const shadowCache = new Map();
export function drawContactShadow(ctx, x, y, rx, ry, alpha = 0.5) {
  const key = `${rx}|${ry}|${PX}`;
  let s = shadowCache.get(key);
  if (!s) {
    const w = Math.ceil(rx * 2 * PX) + 4, h = Math.ceil(ry * 2 * PX) + 4, c = makeCanvas(w, h), g = c.getContext('2d');
    g.translate(w / 2, h / 2); g.scale(rx * PX, ry * PX);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(6,4,10,0.85)'); gr.addColorStop(0.6, 'rgba(6,4,10,0.45)'); gr.addColorStop(1, 'rgba(6,4,10,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
    s = {c, w: w / PX, h: h / PX}; if (shadowCache.size > 64) shadowCache.clear(); shadowCache.set(key, s);
  }
  const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * alpha; ctx.drawImage(s.c, x - s.w / 2, y - s.h / 2, s.w, s.h); ctx.globalAlpha = a0;
}
onSpriteScale(() => { if (shadowCache.size && !cache.size) shadowCache.clear(); });
// boot the baking worker as soon as the engine loads (the title screen hides its start-up), so the first fight finds it ready
if (typeof document !== 'undefined' && typeof setTimeout !== 'undefined') setTimeout(() => { if (STACK_CONFIG.enabled) getWorker(); }, 0);
