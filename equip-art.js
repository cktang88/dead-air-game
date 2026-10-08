// Equipment-UI item art: the real stacked (voxel) item and gun models, baked once into small canvases so the
// loadout rack, supply foam, shell bins and in-world inspection tray show true silhouettes instead of icon cut-outs.
// DOM canvases are painted once (no animation loop); the in-world tray draws straight into the game canvas.
import {VoxelGrid, normalizeModel} from './stack2d.js';
import {bakeVoxSlices, bakeComposite} from './stack-bake.js';
import {gunStack} from './models2d.js';
import {UI_MODELS} from './item-stack2d.js';
import {GUNS} from './catalog.js';

const U = 0.5;
const mk = (id, grid, palette, pivot, opts = {}) => ({id, unit: opts.unit ?? U, layerH: opts.layerH ?? opts.unit ?? U, pivot, palette, grid, buckets: opts.buckets ?? 16});
const memo = new Map();
const once = (key, build) => { let m = memo.get(key); if (!m) { m = build(); memo.set(key, m); } return m; };

/* ------------------------------------------------------------------ models that only the equipment UI needs */
/** A shotgun shell lying along x: brass head, coloured hull, crimped tip. */
export const shellModel = id => once('shell.' + id, () => {
  const slug = id === 'slug', g = new VoxelGrid(34, 14, 12), cy = 7, cz = 5;
  const pal = {r: slug ? '#c9792e' : '#b8362b', R: slug ? '#8d521c' : '#7d2119', y: '#d8b45a', Y: '#a98638', k: '#17141c', s: '#c9c4b0', t: slug ? '#e7b27a' : '#d86a5c'};
  g.rod(2, 9, cy, cz, 5.2, 5.2, 'y'); g.rod(2, 4, cy, cz, 5.6, 5.6, 'Y');                 // brass head and rim
  g.rod(9, 29, cy, cz, 4.8, 4.8, 'r'); g.rod(9, 29, cy - 2.6, cz + 3, 1.2, 1.2, 't');       // plastic hull, highlight
  g.rod(29, 32, cy, cz, 4.2, 4.2, 'R');                                                      // crimp
  if (slug) { g.ellipsoid(32, cy, cz, 2.2, 3, 3, 's'); } else { for (const a of [0, 2.1, 4.2]) g.set(32, cy + Math.cos(a) * 2, cz + Math.sin(a) * 2, 'k'); }
  g.rod(6, 7, cy, cz, 5.4, 5.4, 'k');                                                        // primer ring seam
  return mk('ui.shell.' + id, g, pal, {x: 17, y: cy});
});

/** Hand grenades stand on their base; the lever and pin ring are what you see from above. */
export const throwableModel = id => once('thr.' + id, () => {
  const g = new VoxelGrid(24, 24, 22), c = 12;
  const P = {
    smoke: {a: '#8a9088', A: '#aab1a8', b: '#d8d4c4', c: '#5d6a63'},
    flash: {a: '#cbbd94', A: '#e5d9b4', b: '#d8412f', c: '#2b2a2e'},
    frag: {a: '#566340', A: '#707f55', b: '#c9c4a8', c: '#2a3322'},
  }[id] || {a: '#8a9088', A: '#aab1a8', b: '#d8d4c4', c: '#5d6a63'};
  const pal = {...P, k: '#17141c', m: '#c8c3b4', M: '#e8e4d6', y: '#d3ac55'};
  if (id === 'frag') {
    g.ellipsoid(c, c, 8, 8.6, 8.6, 8, 'a', 2.2);
    for (let z = 1; z < 16; z += 3) for (let a = 0; a < 20; a++) { const th = (a / 20) * Math.PI * 2, r = 8.6 * Math.sqrt(Math.max(0, 1 - ((z - 8) / 8) ** 2)); g.set(c + Math.cos(th) * r, c + Math.sin(th) * r, z, 'c'); }
    g.cyl(c, c, 15, 18, 3.2, 3.2, 'm');
  } else {
    g.cyl(c, c, 1, 15, 7.6, 7.6, 'a'); g.cyl(c, c, 1, 3, 8, 8, 'c'); g.cyl(c, c, 6, 9, 7.9, 7.9, 'b'); g.cyl(c, c, 15, 17, 6.2, 6.2, 'A');
    g.cyl(c, c, 17, 19, 3.4, 3.4, 'm');
  }
  g.box(c - 1, c - 1, 17, c + 8, c + 1, 18, 'M'); g.box(c + 6, c - 1, 14, c + 8, c + 1, 18, 'M');            // spoon lever
  for (let a = 0; a < 16; a++) { const th = (a / 16) * Math.PI * 2; g.set(c - 6 + Math.cos(th) * 3.2, c + Math.sin(th) * 3.2, 17, 'y'); }  // pin ring
  return mk('ui.throw.' + id, g, pal, {x: c, y: c});
});

/** Resolve a stack spec to a drawable model. kinds: gun, ammo, med, armor, mod, radio, supply, shell, throwable. */
export function modelFor(spec) {
  switch (spec.kind) {
    case 'gun': return spec.gun ? gunStack(spec.gun) : null;
    case 'shell': return shellModel(spec.id);
    case 'throwable': return throwableModel(spec.id);
    case 'mod': return UI_MODELS.mod(spec.color || '#d38ff5');
    default: return UI_MODELS[spec.kind] ? UI_MODELS[spec.kind]() : null;
  }
}
const yawFor = spec => (spec.kind === 'gun' || spec.kind === 'shell' || spec.kind === 'throwable' ? 0 : (spec.yaw ?? -0.4));
const keyOf = spec => `${spec.kind}|${spec.gun?.id || ''}|${spec.id || ''}|${spec.color || ''}`;

/* ------------------------------------------------------------------ private hi-res bake
 * The world cache bakes at the camera's scale (2-3 px per unit), which is blurry when a gun is shown 6x bigger in a menu.
 * The UI bakes its own copy once per item at 6-8 px per unit, with a steeper tilt so the side of the gun shows. The pixel
 * work is the game's own (stack-bake.js), so it reads as the same object. Cached forever; a few hundred KB in all. */
const baked = new Map();
const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const UI_TILT = 1.0, BUCKETS = 64;
function bake(spec, model) {
  const key = keyOf(spec);
  let r = baked.get(key);
  if (r) return r;
  const n = normalizeModel(model);
  if (n.kind !== 'vox') return null;
  const PX = spec.kind === 'gun' ? 8 : 6, cell = n.unit * PX, o = Math.max(1, Math.round(PX * 0.5));
  const dzPx = n.layerH * UI_TILT * PX, R = Math.ceil(n.radius * PX) + o + 2, up = Math.ceil(n.count * dzPx) + 1, pad = o + 1;
  const W = 2 * R + 2 * pad, H = 2 * R + up + 2 * pad;
  const e = {W, H, ax: W / 2, ay: pad + up + R, o, dzPx, nBuckets: BUCKETS,
    slices: bakeVoxSlices({grid: {w: n.grid.w, d: n.grid.d, h: n.grid.h, v: n.grid.v}, palette: n.palette, count: n.count, pivot: n.pivot}, cell, makeCanvas)};
  const bi = ((Math.round(yawFor(spec) / (Math.PI * 2) * BUCKETS) % BUCKETS) + BUCKETS) % BUCKETS;
  const out = bakeComposite(makeCanvas, e, bi);
  r = {cv: out.cv, w: out.cv.width, h: out.cv.height};
  baked.set(key, r);
  return r;
}

/**
 * Draw one item fitted into the box (bx, by, bw, bh) of ctx (CSS px), keeping its proportions. Always succeeds.
 * opts: fit (0..1 of the box, default .86), maxScale (cap on the up-scale), shadow, alpha, rotate (radians).
 */
export function drawFitted(ctx, spec, bx, by, bw, bh, opts = {}) {
  const model = modelFor(spec);
  const img = model && bake(spec, model);
  if (!img) return true;
  const fit = opts.fit ?? 0.86;
  let k = Math.min((bw * fit) / img.w, (bh * fit) / img.h);
  if (opts.maxScale) k = Math.min(k, opts.maxScale);
  ctx.save();
  if (opts.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 5 * (opts.shadowK || 1); ctx.shadowOffsetY = 3 * (opts.shadowK || 1); }
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.translate(bx + bw / 2, by + bh / 2);
  if (opts.rotate) ctx.rotate(opts.rotate);
  if (opts.cavity) {
    // the cut in the foam: a soft dark silhouette a little bigger than the item (only its shadow is drawn, shifted in from off-canvas)
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.95)'; ctx.shadowBlur = 9; ctx.shadowOffsetX = 4000; ctx.shadowOffsetY = 2;
    ctx.drawImage(img.cv, (-img.w * k * 1.1) / 2 - 4000, (-img.h * k * 1.12) / 2, img.w * k * 1.1, img.h * k * 1.12); ctx.restore();
  }
  ctx.drawImage(img.cv, (-img.w * k) / 2, (-img.h * k) / 2, img.w * k, img.h * k);
  ctx.restore();
  return true;
}

/* ------------------------------------------------------------------ DOM canvases */
const readK = () => {
  try { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-k')); return v > 0 ? v : 1; } catch { return 1; }
};

/** Paint every `canvas[data-stack]` under root. Retries a few frames while the first bake lands. */
export function paintStacks(root = document, tries = 0) {
  if (!root || typeof document === 'undefined') return;
  let again = false;
  const pr = Math.min(3, (window.devicePixelRatio || 1)) * readK();
  for (const c of root.querySelectorAll('canvas[data-stack]')) {
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) { again = tries < 8; continue; }
    const W = Math.round(w * pr), H = Math.round(h * pr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.setTransform(pr, 0, 0, pr, 0, 0);
    const kind = c.dataset.stack, n = Math.max(1, Number(c.dataset.n) || 1);
    const spec = {kind, id: c.dataset.id, color: c.dataset.color, gun: c.dataset.gun !== undefined ? GUNS[Number(c.dataset.gun)] : null};
    const dim = c.dataset.dim === '1';
    let ok = true;
    if (n === 1) ok = drawFitted(ctx, spec, 0, 0, w, h, {alpha: dim ? 0.35 : 1, cavity: c.classList.contains('foam-art') || c.dataset.cavity === '1', fit: Number(c.dataset.fit) || 0.86, maxScale: Number(c.dataset.max) || 0});
    else {
      // a handful of the same item laid in the bin, slightly staggered
      const per = w / n;
      for (let i = 0; i < n && ok; i++) ok = drawFitted(ctx, spec, i * per, 0, per, h, {fit: 0.9, alpha: dim ? 0.35 : 1, rotate: ((i % 2) - 0.5) * 0.1});
    }
    if (!ok) again = true;
  }
  if (again && tries < 40) requestAnimationFrame(() => paintStacks(root, tries + 1));
}

/** Set the needle angle of every analog meter that has a `data-a`, so the needles swing in from rest when a panel opens. */
export function sweepNeedles(root = document) {
  if (!root) return;
  const set = () => { for (const n of root.querySelectorAll('.needle[data-a]')) n.style.setProperty('--a', n.dataset.a + 'deg'); };
  if (typeof requestAnimationFrame === 'undefined') { set(); return; }
  requestAnimationFrame(() => requestAnimationFrame(set));
}


