// Shared plumbing for the non-humanoid stacked bodies: the preallocated item pool (drawRig draws it), depth sort, a 3D two-bone solver
// and a "bead chain" helper that lays small stacks along a 3D line (a steep limb reads as a smooth column instead of stair-stepped slabs).
import {lerp} from './anim.js';

export const hump = (u) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u));
const POOL = 96;
export function newCreatureOut() {
  const items = [];
  for (let i = 0; i < POOL; i++) items.push({model: null, x: 0, y: 0, z: 0, yaw: 0, sx: 1, sy: 1, flash: 0, key: 0, draw: null, a: 0, b: 0, c: 0, d: 0, pts: null, o: null});
  return {items, n: 0, variant: null, fidget: ''};
}
export function add(out, model, x, y, z, yaw, flash = 0, sx = 1, sy = 1) {
  const it = out.items[out.n++];
  it.model = model; it.x = x; it.y = y; it.z = z; it.yaw = yaw; it.sx = sx; it.sy = sy; it.flash = flash; it.draw = null;
  it.key = y + z * 0.03;
  return it;
}
export function sortItems(out) {
  const a = out.items, n = out.n;
  for (let i = 1; i < n; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j].key > v.key) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
}

// ------------------------------------------------------------------ two-bone leg solve (3D, knee pole = up)
/** Knee position for a hip->foot chain of bones L1, L2. Writes {x,y,z} into out and returns the (clamped) hip-foot distance. Pure. */
export function solveLeg(hx, hy, hz, fx, fy, fz, L1, L2, out, qx = 0, qy = 0, qz = 1) {
  const vx = fx - hx, vy = fy - hy, vz = fz - hz;
  let d = Math.hypot(vx, vy, vz);
  const reach = L1 + L2 - 0.05;
  if (d > reach) { const k = reach / d; fx = hx + vx * k; fy = hy + vy * k; fz = hz + vz * k; d = reach; }
  d = Math.max(d, 0.4);
  const ux = (fx - hx) / d, uy = (fy - hy) / d, uz = (fz - hz) / d;
  const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  // pole: the bend hint (default world up), made perpendicular to the limb axis
  const dq = qx * ux + qy * uy + qz * uz;
  let px = qx - dq * ux, py = qy - dq * uy, pz = qz - dq * uz;
  const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
  out.x = hx + ux * along + px * h; out.y = hy + uy * along + py * h; out.z = hz + uz * along + pz * h;
  out.fx = fx; out.fy = fy; out.fz = fz;
  return d;
}


// bones: bead centres lie on the 3D line; each bead is drawn flat at its own height with the bone's heading
export function pieceChain(out, model, x0, y0, z0, x1, y1, z1, n, fl, tipModel, drop = 0.85) {
  const yaw = Math.atan2(y1 - y0, x1 - x0);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, last = i === n - 1;
    const it = add(out, last && tipModel ? tipModel : model, lerp(x0, x1, u), lerp(y0, y1, u), lerp(z0, z1, u) - drop, yaw, fl);
    it.key = (y0 + y1) * 0.5 + lerp(z0, z1, u) * 0.03;
  }
}

