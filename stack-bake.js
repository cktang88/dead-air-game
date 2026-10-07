// The pixel-pushing half of the stack baker, free of DOM globals so the SAME code runs on the main thread (sync fallback,
// canvas factory = document.createElement) and inside stack-worker.js (OffscreenCanvas). stack2d.js owns the cache.
//
// bakeVoxSlice(n, k, zFrac, cell, mk): one voxel layer to a canvas (n.palette must already be variant-mapped).
// bakeComposite(mk, e, bi): all slices of an entry rotated to yaw bucket `bi`, edge-lit / edge-shaded, outlined.
import {shade, tint, LIGHT, TAU} from './sprites2d.js';

export const INK_OUTLINE = '#120f18';
/** Lower slices are darker: 0.72 at the floor, 1.0 at the top. */
export const layerShade = (zFrac) => 0.72 + 0.28 * Math.min(1, Math.max(0, zFrac));
function rgbToHex(rgb) { const m = /(\d+),(\d+),(\d+)/.exec(rgb); return '#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join(''); }
/** Colour of one voxel: base hex, height fraction 0..1, whether nothing sits on top of it. */
export function voxelColor(hex, zFrac, exposed) {
  const c = shade(hex, layerShade(zFrac));
  return exposed ? tint(rgbToHex(c), 0.13) : c;
}
export const bucketYaw = (i, n) => i * TAU / n;

/** n.palette: char -> {c, emit} with colours ALREADY mapped through the variant. */
export function bakeVoxSlice(n, k, zFrac, cell, mk) {
  const {grid} = n;
  if (!grid.w) return null;
  const cv = mk(grid.w * cell + 1, grid.d * cell + 1), g = cv.getContext('2d');
  let any = false;
  const colorOf = new Map();
  for (let y = 0; y < grid.d; y++) {
    let x = 0;
    while (x < grid.w) {
      const ch = grid.v[(k * grid.d + y) * grid.w + x];
      if (!ch) { x++; continue; }
      const exposed = !(k + 1 < grid.h && grid.v[((k + 1) * grid.d + y) * grid.w + x]);
      const key = ch * 2 + (exposed ? 1 : 0);
      let c = colorOf.get(key);
      if (c === undefined) {
        const pal = n.palette[String.fromCharCode(ch)];
        const base = pal ? pal.c : '#ff00ff';
        c = pal && pal.emit ? base : voxelColor(base, zFrac, exposed);
        colorOf.set(key, c);
      }
      let x2 = x + 1;
      while (x2 < grid.w && grid.v[(k * grid.d + y) * grid.w + x2] === ch && !(k + 1 < grid.h && grid.v[((k + 1) * grid.d + y) * grid.w + x2]) === exposed) x2++;
      const px0 = Math.round(x * cell), px1 = Math.round(x2 * cell), py0 = Math.round(y * cell), py1 = Math.round((y + 1) * cell);
      g.fillStyle = c; g.fillRect(px0, py0, px1 - px0 + 0.6, py1 - py0 + 0.6);
      any = true; x = x2;
    }
  }
  return any ? cv : null;
}

/** All voxel slices of a normalised voxel model: [{k, cv, ox, oy}]. */
export function bakeVoxSlices(n, cell, mk) {
  const slices = [];
  for (let k = 0; k < n.count; k++) {
    const zFrac = n.count > 1 ? k / (n.count - 1) : 1;
    const cv = bakeVoxSlice(n, k, zFrac, cell, mk);
    if (cv) slices.push({k, cv, ox: n.pivot.x * cell, oy: n.pivot.y * cell});
  }
  return slices;
}

const L_X = LIGHT.x > 0.3 ? 1 : 0, L_Y = LIGHT.y > 0.3 ? 1 : 0;
/**
 * Composite of one yaw bucket. e: {W, H, ax, ay, o, dzPx, nBuckets, slices: [{k, cv, ox, oy}], tmpA?, tmpB?} (tmp canvases are
 * cached on e). Every per-slice pass only touches that slice's rotated bounding box. Returns {cv, cx, cy}: the canvas is cropped,
 * (cx, cy) is its top-left in the entry's W x H frame.
 */
export function bakeComposite(mk, e, bi) {
  const {W, H, ax, ay} = e;
  const comp = mk(W, H), g = comp.getContext('2d');
  const tmpA = e.tmpA || (e.tmpA = mk(W, H)), tmpB = e.tmpB || (e.tmpB = mk(W, H));
  const ta = tmpA.getContext('2d'), tb = tmpB.getContext('2d');
  const yaw = bucketYaw(bi, e.nBuckets);
  g.imageSmoothingEnabled = true; ta.imageSmoothingEnabled = true;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  let ux0 = 1e9, uy0 = 1e9, ux1 = -1e9, uy1 = -1e9;
  for (const s of e.slices) {
    const dy = Math.round(s.k * e.dzPx);
    // dirty rect: the rotated slice's bounding box (+2px for the edge lighting offsets)
    const w0 = s.cv.width, h0 = s.cv.height, px = -s.ox, py = -s.oy;
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (let c = 0; c < 4; c++) {
      const lx = px + (c & 1 ? w0 : 0), ly = py + (c & 2 ? h0 : 0), rx = ax + lx * cy - ly * sy, ry = ay - dy + lx * sy + ly * cy;
      if (rx < mnx) mnx = rx; if (rx > mxx) mxx = rx; if (ry < mny) mny = ry; if (ry > mxy) mxy = ry;
    }
    const bx = Math.max(0, Math.floor(mnx) - 2), by = Math.max(0, Math.floor(mny) - 2), bw = Math.min(W, Math.ceil(mxx) + 3) - bx, bh = Math.min(H, Math.ceil(mxy) + 3) - by;
    if (bw <= 0 || bh <= 0) continue;
    if (bx < ux0) ux0 = bx; if (by < uy0) uy0 = by; if (bx + bw > ux1) ux1 = bx + bw; if (by + bh > uy1) uy1 = by + bh;
    ta.clearRect(bx, by, bw, bh);
    ta.save(); ta.translate(ax, ay - dy); ta.rotate(yaw); ta.drawImage(s.cv, -s.ox, -s.oy); ta.restore();
    g.drawImage(tmpA, bx, by, bw, bh, bx, by, bw, bh);
    // light-facing edge of the slice (upper-left) and its far edge (lower-right)
    tb.globalCompositeOperation = 'source-over'; tb.clearRect(bx, by, bw, bh); tb.drawImage(tmpA, bx, by, bw, bh, bx, by, bw, bh);
    tb.globalCompositeOperation = 'destination-out'; tb.drawImage(tmpA, bx, by, bw, bh, bx + L_X, by + L_Y, bw, bh);
    tb.globalCompositeOperation = 'source-atop'; tb.fillStyle = 'rgba(255,248,235,0.2)'; tb.fillRect(bx, by, bw, bh);
    g.drawImage(tmpB, bx, by, bw, bh, bx, by, bw, bh);
    tb.globalCompositeOperation = 'source-over'; tb.clearRect(bx, by, bw, bh); tb.drawImage(tmpA, bx, by, bw, bh, bx, by, bw, bh);
    tb.globalCompositeOperation = 'destination-out'; tb.drawImage(tmpA, bx, by, bw, bh, bx - L_X, by - L_Y, bw, bh);
    tb.globalCompositeOperation = 'source-atop'; tb.fillStyle = 'rgba(8,5,16,0.24)'; tb.fillRect(bx, by, bw, bh);
    g.drawImage(tmpB, bx, by, bw, bh, bx, by, bw, bh);
  }
  // outline: the silhouette stamped in 8 directions behind the composite. Only the used region is touched and returned: the
  // result is cropped to the slices' union box (+ the outline), so an arm bucket is a thin sliver instead of a full 2R x 2R square.
  const o = e.o;
  if (ux1 <= ux0 || uy1 <= uy0) return {cv: mk(1, 1), cx: 0, cy: 0};
  const rx = Math.max(0, ux0 - o - 1), ry = Math.max(0, uy0 - o - 1), rw = Math.min(W, ux1 + o + 1) - rx, rh = Math.min(H, uy1 + o + 1) - ry;
  tb.globalCompositeOperation = 'source-over'; tb.clearRect(rx, ry, rw, rh); tb.drawImage(comp, rx, ry, rw, rh, rx, ry, rw, rh);
  tb.globalCompositeOperation = 'source-in'; tb.fillStyle = INK_OUTLINE; tb.fillRect(rx, ry, rw, rh); tb.globalCompositeOperation = 'source-over';
  const out = mk(rw, rh), og = out.getContext('2d');
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; og.drawImage(tmpB, rx, ry, rw, rh, Math.round(Math.cos(a) * o), Math.round(Math.sin(a) * o), rw, rh); }
  og.drawImage(comp, rx, ry, rw, rh, 0, 0, rw, rh);
  return {cv: out, cx: rx, cy: ry};
}

/** Bit-reversal-ish visiting order of n buckets (0, n/2, n/4, 3n/4, ...): any prefix is spread evenly round the circle. */
export function spreadOrder(n, step = 1) {
  const out = [], seen = new Uint8Array(n);
  let gap = 1; while (gap < n) gap <<= 1;
  for (let g = gap; g >= 1; g >>= 1) for (let i = 0; i < n; i += g) if (!seen[i]) { seen[i] = 1; if (step === 1 || i % step === 0) out.push(i); }
  return out;
}
