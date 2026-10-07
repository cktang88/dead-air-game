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
import {makeCanvas, shade, tint, getSpriteScale, onSpriteScale, LIGHT, TAU} from './sprites2d.js';

/** Screen pixels (world units) a point rises per world unit of height. The ONE camera tilt shared by every stack. */
export const STACK_TILT = 0.72;
export const INK_OUTLINE = '#120f18';

// ---------------------------------------------------------------- pure helpers (unit tested)
export const bucketIndex = (yaw, n) => ((Math.round(yaw / TAU * n) % n) + n) % n;
export const bucketYaw = (i, n) => i * TAU / n;
/** Lower slices are darker: 0.72 at the floor, 1.0 at the top. */
export const layerShade = (zFrac) => 0.72 + 0.28 * Math.min(1, Math.max(0, zFrac));
/** Colour of one voxel: base hex, height fraction 0..1, whether nothing sits on top of it. */
export function voxelColor(hex, zFrac, exposed) {
  const c = shade(hex, layerShade(zFrac));
  return exposed ? tint(rgbToHex(c), 0.13) : c;
}
function rgbToHex(rgb) { const m = /(\d+),(\d+),(\d+)/.exec(rgb); return '#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join(''); }

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
  kinds: new Set(['player', 'gunner']),   // actor kinds drawn as stacks; everything else keeps the legacy sprites
  cacheBytes: 56 * 1024 * 1024,           // hard cap on baked composites
  bakeBudgetMs: 2.5,                      // per-frame lazy bake allowance; over budget we reuse the nearest baked angle
};
try {
  if (typeof location !== 'undefined') { const q = new URLSearchParams(location.search); if (q.get('stack') === '0') STACK_CONFIG.enabled = false; }
} catch { /* no location */ }
export const stackStats = {bakes: 0, bakeMs: 0, draws: 0, entries: 0, mb: 0};
const LEVELS = [1, 1.5, 2, 2.75, 3.75, 5];
function pickLevel(px) { let best = LEVELS[0]; for (const l of LEVELS) if (Math.abs(Math.log(l / px)) < Math.abs(Math.log(best / px))) best = l; return best; }
export function setStackScale(pxPerUnit) {
  // hysteresis: keep the current bake level until the real scale is >22% away, so a zoom breath never re-bakes
  if (Math.abs(Math.log(pxPerUnit / PX)) < 0.2 && cache.size) return;
  const lv = pickLevel(pxPerUnit);
  if (lv !== PX) { PX = lv; clearStackCache(); }
}
export function clearStackCache() { cache.clear(); bytes = 0; }
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

function entryFor(model, variant) {
  const key = model.id + '|' + variantKey(variant) + '|' + PX;
  let e = cache.get(key);
  if (!e) { e = buildEntry(model, variant, key); cache.set(key, e); stackStats.entries = cache.size; }
  e.used = frameStart + 1; e.tick = ++tickCounter;
  return e;
}
let tickCounter = 0;

function buildEntry(model, variant, key) {
  const n = model._n || (model._n = normalizeModel(model));
  const unit = n.unit, cell = unit * PX, o = Math.max(1, Math.round(PX * 0.6));
  const dzPx = n.layerH * STACK_TILT * PX;
  const R = Math.ceil(n.radius * PX) + o + 2, up = Math.ceil((n.count * dzPx)) + 1, pad = o + 1;
  const W = 2 * R + 2 * pad, H = 2 * R + up + 2 * pad;
  const slices = [];
  const col = (hex) => (variant ? variant.fn(hex) : hex);
  for (let k = 0; k < n.count; k++) {
    const zFrac = n.count > 1 ? k / (n.count - 1) : 1;
    if (n.kind === 'vox') {
      const s = bakeVoxSlice(n, k, zFrac, cell, col);
      if (s) slices.push({k, cv: s, ox: n.pivot.x * cell, oy: n.pivot.y * cell});
    } else {
      const sl = n.slices.filter((q) => q.z === k);
      if (!sl.length) continue;
      const cv = makeCanvas(n.size.w * PX, n.size.h * PX), g = cv.getContext('2d');
      g.scale(PX, PX); g.translate(n.pivot.x, n.pivot.y); g.lineJoin = 'round'; g.lineCap = 'round';
      const c = {col: (hex) => shade(col(hex), layerShade(zFrac)), raw: col, z: k, zFrac, unit};
      for (const q of sl) q.draw(g, c);
      slices.push({k, cv, ox: n.pivot.x * PX, oy: n.pivot.y * PX});
    }
  }
  return {key, n, model, variant, PX, W, H, R, up, pad, o, dzPx, ax: W / 2, ay: pad + up + R, slices, buckets: new Array(n.buckets).fill(null), whites: new Array(n.buckets).fill(null), tmpA: null, tmpB: null, nBuckets: n.buckets, used: 0, tick: 0, size: 0};
}

function bakeVoxSlice(n, k, zFrac, cell, col) {
  const {grid} = n;
  if (!grid.w) return null;
  const cv = makeCanvas(grid.w * cell + 1, grid.d * cell + 1), g = cv.getContext('2d');
  let any = false;
  const colorOf = new Map();
  for (let y = 0; y < grid.d; y++) {
    let x = 0;
    while (x < grid.w) {
      const ch = grid.get(x, y, k);
      if (!ch) { x++; continue; }
      const exposed = !grid.has(x, y, k + 1);
      const key = ch * 2 + (exposed ? 1 : 0);
      let c = colorOf.get(key);
      if (c === undefined) {
        const pal = n.palette[String.fromCharCode(ch)];
        const base = pal ? col(pal.c) : '#ff00ff';
        c = pal && pal.emit ? base : voxelColor(base, zFrac, exposed);
        colorOf.set(key, c);
      }
      let x2 = x + 1;
      while (x2 < grid.w && grid.get(x2, y, k) === ch && (!grid.has(x2, y, k + 1)) === exposed) x2++;
      const px0 = Math.round(x * cell), px1 = Math.round(x2 * cell), py0 = Math.round(y * cell), py1 = Math.round((y + 1) * cell);
      g.fillStyle = c; g.fillRect(px0, py0, px1 - px0 + 0.6, py1 - py0 + 0.6);
      any = true; x = x2;
    }
  }
  return any ? cv : null;
}

const L_X = LIGHT.x > 0.3 ? 1 : 0, L_Y = LIGHT.y > 0.3 ? 1 : 0;
function bakeBucket(e, bi) {
  const t0 = now();
  const {W, H, ax, ay} = e;
  const comp = makeCanvas(W, H), g = comp.getContext('2d');
  const tmpA = e.tmpA || (e.tmpA = makeCanvas(W, H)), tmpB = e.tmpB || (e.tmpB = makeCanvas(W, H));
  const ta = tmpA.getContext('2d'), tb = tmpB.getContext('2d');
  const yaw = bucketYaw(bi, e.nBuckets);
  g.imageSmoothingEnabled = true; ta.imageSmoothingEnabled = true;
  for (const s of e.slices) {
    const dy = Math.round(s.k * e.dzPx);
    ta.clearRect(0, 0, W, H);
    ta.save(); ta.translate(ax, ay - dy); ta.rotate(yaw); ta.drawImage(s.cv, -s.ox, -s.oy); ta.restore();
    g.drawImage(tmpA, 0, 0);
    // light-facing edge of the slice (upper-left) and its far edge (lower-right)
    tb.globalCompositeOperation = 'source-over'; tb.clearRect(0, 0, W, H); tb.drawImage(tmpA, 0, 0);
    tb.globalCompositeOperation = 'destination-out'; tb.drawImage(tmpA, L_X, L_Y);
    tb.globalCompositeOperation = 'source-atop'; tb.fillStyle = 'rgba(255,248,235,0.2)'; tb.fillRect(0, 0, W, H);
    g.drawImage(tmpB, 0, 0);
    tb.globalCompositeOperation = 'source-over'; tb.clearRect(0, 0, W, H); tb.drawImage(tmpA, 0, 0);
    tb.globalCompositeOperation = 'destination-out'; tb.drawImage(tmpA, -L_X, -L_Y);
    tb.globalCompositeOperation = 'source-atop'; tb.fillStyle = 'rgba(8,5,16,0.24)'; tb.fillRect(0, 0, W, H);
    g.drawImage(tmpB, 0, 0);
  }
  // outline: the silhouette stamped in 8 directions behind the composite
  tb.globalCompositeOperation = 'source-over'; tb.clearRect(0, 0, W, H); tb.drawImage(comp, 0, 0);
  tb.globalCompositeOperation = 'source-in'; tb.fillStyle = INK_OUTLINE; tb.fillRect(0, 0, W, H); tb.globalCompositeOperation = 'source-over';
  const out = makeCanvas(W, H), og = out.getContext('2d'), o = e.o;
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; og.drawImage(tmpB, Math.round(Math.cos(a) * o), Math.round(Math.sin(a) * o)); }
  og.drawImage(comp, 0, 0);
  e.buckets[bi] = out;
  const sz = W * H * 4; e.size += sz; bytes += sz;
  stackStats.bakes++; stackStats.bakeMs += now() - t0; stackStats.mb = bytes / 1048576;
  if (bytes > STACK_CONFIG.cacheBytes) evict(e);
  return out;
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
  for (const v of list) { if (bytes <= STACK_CONFIG.cacheBytes * 0.7) break; bytes -= v.size; cache.delete(v.key); }
  stackStats.entries = cache.size;
}

function bucketImage(e, bi) {
  let img = e.buckets[bi];
  if (img) return {img, bi};
  // over the per-frame bake budget: reuse the nearest baked angle instead of hitching
  if (now() - frameStart > STACK_CONFIG.bakeBudgetMs) {
    const n = e.nBuckets;
    for (let d = 1; d <= n >> 1; d++) { const a = e.buckets[(bi + d) % n], b = e.buckets[(bi - d + n) % n]; if (a) return {img: a, bi: (bi + d) % n}; if (b) return {img: b, bi: (bi - d + n) % n}; }
  }
  return {img: bakeBucket(e, bi), bi};
}

/** Bakes every yaw bucket of a model now (loading screens / idle). Returns the number of buckets baked. */
export function prebake(model, variant, count) {
  const e = entryFor(model, variant); let c = 0;
  for (let i = 0; i < e.nBuckets && (count === undefined || c < count); i++) if (!e.buckets[i]) { bakeBucket(e, i); c++; }
  return c;
}

const _r = {img: null, bi: 0};
/**
 * Draws a stack. (x, y) = ground point under the pivot, opts.z = extra height in world units, opts.yaw = facing.
 * opts: {yaw, z, variant, flash (0..1 white overlay), flashColor, sx, sy (squash about the pivot), alpha}
 */
export function drawStack(ctx, model, x, y, opts = {}) {
  const e = entryFor(model, opts.variant);
  const yaw = opts.yaw || 0, bi = bucketIndex(yaw, e.nBuckets);
  const r = bucketImage(e, bi), img = r.img;
  const inv = 1 / e.PX, z = opts.z || 0, sx = opts.sx ?? 1, sy = opts.sy ?? 1, alpha = opts.alpha ?? 1;
  const gy = y - z * STACK_TILT;
  stackStats.draws++;
  const a0 = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = a0 * alpha;
  if (sx !== 1 || sy !== 1) {
    ctx.save(); ctx.translate(x, gy); ctx.scale(sx, sy);
    ctx.drawImage(img, -e.ax * inv, -e.ay * inv, img.width * inv, img.height * inv);
    if (opts.flash > 0) { ctx.globalAlpha = ctx.globalAlpha * Math.min(1, opts.flash); ctx.drawImage(whiteOf(e, r.bi, img, opts.flashColor), -e.ax * inv, -e.ay * inv, img.width * inv, img.height * inv); }
    ctx.restore();
  } else {
    ctx.drawImage(img, x - e.ax * inv, gy - e.ay * inv, img.width * inv, img.height * inv);
    if (opts.flash > 0) { ctx.globalAlpha = ctx.globalAlpha * Math.min(1, opts.flash); ctx.drawImage(whiteOf(e, r.bi, img, opts.flashColor), x - e.ax * inv, gy - e.ay * inv, img.width * inv, img.height * inv); }
  }
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
