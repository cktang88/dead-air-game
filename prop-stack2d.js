// STACKED COVER PROPS for the baked world chunks (cover tiles: pillars, sandbag / jersey / partition / vault walls,
// shelving, server and broadcast racks, desks, hospital beds). Same engine conventions as stack2d.js (STACK_TILT lift,
// upper-left light, ink outline, layer shading) but baked once per (style, join mask, scale) at a FIXED yaw into a flat
// tile image, because cover never rotates. A tile image is cropped on the sides where the prop continues into its
// neighbour, so runs (sandbag walls, server rows, shelf aisles) are seamless, and chunks just blit them.
//
// Collision footprints never change: every prop lives inside its tile (desks 2x1, beds 1x2). Animated parts
// (LEDs, CRT flicker, fans, tape reels, heart monitor) are NOT baked: propLive() lists them and drawPropsLive() draws them.
import {VoxelGrid, STACK_TILT, INK_OUTLINE, voxelColor, hexMix, hexMul, drawStack} from './stack2d.js';
import {hash2, makeCanvas, TAU, LIGHT} from './sprites2d.js';

export const M = 3;                       // margin cells on every side (the neighbour's continuation, cropped away on join)
const L_X = LIGHT.x > 0.3 ? 1 : 0, L_Y = LIGHT.y > 0.3 ? 1 : 0;
const TILE = 32;
/** Visual heights in layers (1 layer = 1 world unit of height). */
export const PROP_H = {concrete: 19, hazard: 19, vault: 19, beacon: 20, sandbag: 9, jersey: 11, 'jersey-hazard': 11, partition: 15, vaultwall: 17, rack: 22, server: 19, desk: 11, bed: 9};

// ------------------------------------------------------------------ tile grid (local coords, margin handled here)
class TG {
  constructor(w, d, h) { this.w = w; this.d = d; this.h = h; this.g = new VoxelGrid(w + 2 * M, d + 2 * M, h); }
  box(x0, y0, z0, x1, y1, z1, ch) { this.g.box(x0 + M, y0 + M, z0, x1 + M, y1 + M, z1, ch); return this; }
  set(x, y, z, ch) { this.g.set(Math.floor(x + M), Math.floor(y + M), z, ch); return this; }
  get(x, y, z) { return this.g.get(Math.floor(x + M), Math.floor(y + M), z); }
  has(x, y, z) { return this.get(x, y, z) !== 0; }
  ell(cx, cy, cz, rx, ry, rz, ch, p = 2, keep = false) { this.g.ellipsoid(cx + M, cy + M, cz, rx, ry, rz, ch, p, keep); return this; }
  cyl(cx, cy, z0, z1, rx, ry, ch, p = 2) { this.g.cyl(cx + M, cy + M, z0, z1, rx, ry, ch, p); return this; }
  /** Highest occupied y at column x, layer z (the front face), or -1. */
  frontY(x, z) { for (let y = this.d + M - 1; y >= -M; y--) if (this.has(x, y, z)) return y; return -1; }
  /** Erase everything outside [x0,x1) x [y0,y1) (trims run ends). */
  clip(x0, x1, y0, y1) {
    for (let z = 0; z < this.h; z++) for (let y = -M; y < this.d + M; y++) for (let x = -M; x < this.w + M; x++) if (x < x0 || x >= x1 || y < y0 || y >= y1) this.set(x, y, z, 0);
    return this;
  }
}
const ext = (j, w = TILE, d = TILE, inset = 1) => ({x0: j.w ? -M : inset, x1: j.e ? w + M : w - inset, y0: j.n ? -M : inset, y1: j.s ? d + M : d - inset});
const pk = (v, list) => list[Math.floor(v * list.length) % list.length];
const rn = (c, salt) => hash2(c.tx, c.ty, c.seed + salt);

// ------------------------------------------------------------------ builders: each returns {t: TG, pal, tw, td}
function pillar(c, o) {
  const t = new TG(TILE, TILE, 26), cx = 16, cy = 16;
  const pal = {p: o.plinth, b: o.body, c: o.cap, B: o.bolt, r: '#b4602c', R: '#e08a4a', k: '#2a2730', n: '#3a3740', l: {c: o.lamp || '#ff5a4a', emit: true}, y: '#e9b92a', d: '#17141a', g: o.trim || o.body, w: '#e8e8ec', t: '#cfc9bd', Q: '#d8402f'};
  t.cyl(cx, cy, 0, 2, 15, 15, 'p', 5);
  t.cyl(cx, cy, 2, 16, 13.4, 13.4, 'b', 5.5);
  t.cyl(cx, cy, 14, 17, 14.2, 14.2, 'p', 5);          // collar
  t.cyl(cx, cy, 17, 19, 12.6, 12.6, 'c', 5);          // cap
  // painted bands (hazard / vault / beacon)
  if (o.band) {
    const [a, b] = o.band;
    for (let z = 6; z < 12; z++) for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (t.get(x, y, z) === 'b'.charCodeAt(0)) t.set(x, y, z, (Math.floor((x + y * 0.4 + z * 1.6) / 3.2) & 1) ? a : b);
  }
  if (o.rings) for (const z of o.rings) for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (t.get(x, y, z) === 'b'.charCodeAt(0)) t.set(x, y, z, 'g');
  // top inlay + bolts
  t.box(10, 10, 18, 22, 22, 19, 'p'); t.box(11, 11, 18, 21, 21, 19, 'c');
  for (const [bx, by] of [[7, 7], [24, 7], [7, 24], [24, 24]]) t.set(bx, by, 18, 'B');
  if (o.lamp) { t.cyl(cx, cy, 19, 20, 4.5, 4.5, 'k', 3); t.ell(cx, cy, 20.5, 3.2, 3.2, 1.8, 'l'); }
  if (o.chips) {
    // chipped edges: carve bites out of the upper rim, expose rebar
    for (let i = 0; i < 6; i++) {
      const a = rn(c, 20 + i) * TAU, rr = 13 - rn(c, 30 + i) * 1.5, zc = 16 + Math.floor(rn(c, 40 + i) * 3), s = 1.6 + rn(c, 50 + i) * 1.6;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      const had = t.has(px, py, zc);
      if (had) { t.ell(px, py, zc, s, s, s * 0.9, 'n'); t.ell(px, py, zc, s * 0.8, s * 0.8, s * 0.7, 0); }
      if (i < 3 && had) { // rebar rods
        const rx = Math.round(px - Math.cos(a) * 1.2), ry = Math.round(py - Math.sin(a) * 1.2);
        for (let z = zc - 1; z < zc + 4 + (i % 2) * 2; z++) t.set(rx + (z > zc + 2 ? Math.sign(Math.cos(a)) : 0), ry, z, z % 3 === 0 ? 'R' : 'r');
      }
    }
    // hairline crack down the front face
    let x = 12 + Math.floor(rn(c, 60) * 8);
    for (let z = 13; z >= 3; z--) { const y = t.frontY(x, z); if (y >= 0) t.set(x, y, z, 'k'); if (rn(c, 70 + z) < 0.4) x += rn(c, 90 + z) < 0.5 ? -1 : 1; }
    // stain / spall on the plinth edge
    for (let i = 0; i < 5; i++) { const x2 = 5 + Math.floor(rn(c, 100 + i) * 22), y2 = t.frontY(x2, 2); if (y2 >= 0) t.set(x2, y2, 2, 'k'); }
  }
  if (o.dot) { t.ell(cx, cy, 19.5, 2.6, 2.6, 1.4, 'l'); }
  return {t, pal, tw: TILE, td: TILE};
}

function sandbag(c) {
  const j = c.j, vertical = (j.n || j.s) && !(j.e || j.w), t = new TG(TILE, TILE, 10);
  const pal = {a: '#b5a073', b: '#a8946a', c: '#bfab7e', d: '#9f8c63', e: '#4a3d27', f: '#dccfa6', g: '#85734d', s: '#e9e3cf', m: '#6c7a52', x: '#7a6a45', L: {c: '#ff4a3a', emit: true}};
  const cols = ['a', 'b', 'c', 'd'];
  const abs = vertical ? c.ty : c.tx;                // absolute 32-cell index along the run, keeps neighbouring tiles in phase
  const E = ext(j, TILE, TILE, 1);
  const lo = vertical ? E.y0 : E.x0, hi = vertical ? E.y1 : E.x1;
  const course = [{u: 0, rows: [10.2, 21.8], w: 10.8, ry: 5.4}, {u: 8, rows: [11.4, 20.6], w: 10, ry: 5}, {u: 0, rows: [16], w: 11, ry: 5.5}];
  const put = (u0, u1, vc, vr, zc) => {
    const cu = (u0 + u1) / 2, ru = (u1 - u0) / 2;
    return vertical ? [vc, cu, vr, ru] : [cu, vc, ru, vr];
  };
  for (let ci = 0; ci < 3; ci++) {
    const cr = course[ci], z0 = ci * 3;
    cr.rows.forEach((vc, ri) => {
      for (let k = Math.floor((lo - cr.u - 16) / 16); k * 16 + cr.u < hi + 16; k++) {
        const u0 = k * 16 + cr.u + 0.6, u1 = u0 + 14.8;
        if (u1 < lo - 2 || u0 > hi + 2) continue;
        const ka = Math.floor(abs * 2) + k, hh = hash2(((ka % 8) + 8) % 8, ci * 5 + ri, c.seed + 3);
        const ch = cols[Math.floor(hh * 4)];
        const [x, y, rx, ry] = put(u0, u1, vc, cr.ry, z0);
        const dx = vertical ? 0 : 0;
        // dark crevice slab under the bag (shows between bags), then the bag itself
        t.ell(x + dx, y, z0 + 1.2, rx - 0.9, ry - 0.8, 1.2, 'e', 3);
        t.ell(x, y, z0 + 1.5, rx, ry, 1.6, ch, 2.8);
        // stitched seam on top + tied ends
        for (let s = -rx + 2.5; s <= rx - 2.5; s += 2) { const sx = vertical ? x : x + s, sy = vertical ? y + s : y; if (t.has(sx, sy, z0 + 2)) t.set(sx, sy, z0 + 2, hh > 0.5 ? 'g' : 'f'); }
        const kx = vertical ? x : x + rx - 1.4, ky = vertical ? y + ry * 0 + rx - 1.4 : y;
        if (t.has(kx, ky, z0 + 2)) t.set(kx, ky, z0 + 2, 'f');
        if (hash2(ka, ci * 7 + ri, c.seed + 9) > 0.93 && ci < 2) { // stencilled mark on a bag
          const mx = vertical ? x : x - 1, my = vertical ? y - 1 : y;
          for (let q = 0; q < 3; q++) { const px2 = vertical ? mx : mx + q, py2 = vertical ? my + q : my; if (t.has(px2, py2, z0 + 2)) t.set(px2, py2, z0 + 2, 's'); }
        }
      }
    });
  }
  // moss / dirt scuffs along the low course, and a rare dead-air easter egg: a tiny red ON AIR bulb tucked in the top row
  for (let i = 0; i < 6; i++) { const u = lo + 1 + rn(c, 130 + i) * (hi - lo - 2), v = 5 + rn(c, 140 + i) * 22; const x = vertical ? v : u, y = vertical ? u : v; const yy = t.frontY(Math.floor(x), 0); if (yy >= 0 && rn(c, 150 + i) < 0.5) t.set(x, yy, 0, 'm'); }
  if (rn(c, 160) > 0.965) { const u = 16, x = vertical ? 16 : u, y = vertical ? u : 16; for (let z = 8; z >= 3; z--) if (t.has(x, y, z)) { t.set(x, y, z, 'L'); break; } }
  // trim run ends to the tile (bags overhang the cut)
  t.clip(E.x0 - (j.w ? 0 : 0), E.x1, E.y0, E.y1);
  return {t, pal, tw: TILE, td: TILE};
}

function jersey(c, hazard) {
  const j = c.j, vertical = (j.n || j.s) && !(j.e || j.w), t = new TG(TILE, TILE, 13);
  const pal = {j: '#b4b6bd', J: '#8e9098', k: '#16141a', y: '#e5b524', A: c.accent || '#ffb04a', g: '#52545c', s: {c: hazard ? '#ff4a3a' : '#ffb04a', emit: true}, w: '#d9dbe0'};
  const E = ext(j, TILE, TILE, 1), lo = vertical ? E.y0 : E.x0, hi = vertical ? E.y1 : E.x1;
  const halfW = (z) => (z < 3 ? 8 : z < 10 ? 8 - (z - 3) * 0.62 : 3.6 - (z > 11 ? 0.8 : 0));
  for (let z = 0; z < 12; z++) {
    const hw = halfW(z);
    for (let u = Math.floor(lo); u < Math.ceil(hi); u++) for (let v = Math.floor(16 - hw); v < Math.ceil(16 + hw); v++) {
      const x = vertical ? v : u, y = vertical ? u : v;
      let ch = z > 9 ? 'w' : (z < 3 ? 'J' : 'j');
      if (hazard && z >= 2 && z <= 11) ch = (Math.floor((u + v + z * 1.4) / 4) & 1) ? 'y' : 'k';
      else if (!hazard && z >= 5 && z <= 6) ch = 'A';
      t.set(x, y, z, ch);
    }
  }
  // joint groove + bolts where segments meet
  if (vertical ? j.n : j.w) for (let z = 1; z < 12; z++) for (let v = 16 - 8; v < 24; v++) if (t.has(vertical ? v : 0, vertical ? 0 : v, z)) t.set(vertical ? v : 0, vertical ? 0 : v, z, 'g');
  // reflector studs at free ends
  const ends = vertical ? [[!j.n, 16, E.y0 + 1.5], [!j.s, 16, E.y1 - 2.5]] : [[!j.w, E.x0 + 1.5, 16], [!j.e, E.x1 - 2.5, 16]];
  for (const [on, x, y] of ends) if (on) { t.set(x, y, 6, 's'); t.set(x + (vertical ? 0 : 0), y, 7, 's'); }
  return {t, pal, tw: TILE, td: TILE};
}

function partition(c) {
  const j = c.j, vertical = (j.n || j.s) && !(j.e || j.w), t = new TG(TILE, TILE, 18);
  const pal = {f: '#323846', p: '#c6ccd6', q: '#a3abbb', k: '#2a2f3a', A: c.accent || '#5ad0e6', w: '#ffffff', L: {c: c.accent || '#5ad0e6', emit: true}, b: '#59627a'};
  const E = ext(j, TILE, TILE, 1), lo = vertical ? E.y0 : E.x0, hi = vertical ? E.y1 : E.x1;
  const put = (u0, u1, v0, v1, z0, z1, ch) => (vertical ? t.box(v0, u0, z0, v1, u1, z1, ch) : t.box(u0, v0, z0, u1, v1, z1, ch));
  put(lo, hi, 10.5, 21.5, 0, 3, 'f');                         // kick plate
  put(lo, hi, 11.5, 20.5, 3, 14, 'p');                        // fabric panel
  put(lo, hi, 13, 19, 4, 13, 'q');                            // inset
  put(lo, hi, 10.5, 21.5, 14, 15, 'f');                       // top rail
  put(lo, hi, 15.2, 16.8, 14, 15, 'A');                       // accent strip on the rail
  // frame posts at tile joints and free ends
  const posts = [];
  if (!(vertical ? j.n : j.w)) posts.push(lo); else posts.push(0);
  if (!(vertical ? j.s : j.e)) posts.push(hi - 2); else posts.push(TILE - 1);
  for (const pu of posts) { put(pu - 0.3, pu + 2, 9.5, 22.5, 0, 17, 'k'); put(pu + 0.2, pu + 1.4, 10.5, 21.5, 17, 18, 'b'); }
  // pins of light: a small status LED on the post
  if (hash2(c.tx, c.ty, c.seed + 5) > 0.6) { const pu = posts[0] + 0.8; (vertical ? t.set(15.8, pu, 15, 'L') : t.set(pu, 21.8, 15, 'L')); }
  return {t, pal, tw: TILE, td: TILE};
}

function vaultwall(c) {
  const t = new TG(TILE, TILE, 19), gold = c.accent || '#e8c46b';
  const pal = {s: '#4a4854', S: '#3b3944', d: '#2a2830', G: gold, g: hexMix(gold, '#000000', 0.35), k: '#17151c', r: '#6c6a76', L: {c: gold, emit: true}};
  t.cyl(16, 16, 0, 17, 15.4, 15.4, 's', 6);
  t.cyl(16, 16, 0, 3, 15.8, 15.8, 'S', 6);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { if (t.get(x, y, 8) === 's'.charCodeAt(0)) t.set(x, y, 8, 'G'); if (t.get(x, y, 9) === 's'.charCodeAt(0)) t.set(x, y, 9, 'g'); }
  // recessed top plate with gold border and rivets
  for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) { const edge = x < 5 || x > 26 || y < 5 || y > 26; t.set(x, y, 16, edge ? 'G' : 'd'); if (!edge) t.set(x, y, 15, 'S'); }
  for (const [x, y] of [[6, 6], [25, 6], [6, 25], [25, 25]]) { t.set(x, y, 16, 'L'); }
  if (hash2(c.tx, c.ty, c.seed + 11) > 0.45) { // combination dial
    t.cyl(16, 16, 15, 17, 5.2, 5.2, 'k', 2); t.cyl(16, 16, 17, 18, 4.2, 4.2, 'r', 2);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; t.set(16 + Math.cos(a) * 3.6, 16 + Math.sin(a) * 3.6, 18, i === 0 ? 'L' : 'G'); }
    for (let k = 0; k < 5; k++) t.set(16 + k * 0.8, 16 - k * 0.55, 18, 'G');
  } else { t.box(13, 14, 16, 19, 18, 17, 'k'); t.box(14, 15, 17, 18, 17, 18, 'g'); }
  return {t, pal, tw: TILE, td: TILE};
}

// shelving: uprights every 16 cells along the run, boards, boxes / canisters / files / drums / tapes
function rack(c) {
  const j = c.j, t = new TG(TILE, TILE, 24), v = rn(c, 1);
  const variant = v < 0.1 ? 'drums' : v < 0.22 ? 'files' : v < 0.3 ? 'tapes' : 'shelf';
  const pal = {o: '#d6862f', O: '#a8601c', k: '#2b2e37', K: '#3c4049', n: '#16181e', w: '#eae4cf', W: '#f2efe3', t: '#c9bba2',
    a: '#b48a56', b: '#a37a47', c: '#c39a66', d: '#8f6c40', e: '#b99461', R: '#c0392b', B: '#3a6ea5', Y: '#d9b030', G: '#4d9a63', z: '#d0d3d9', q: '#8b6b4a', m: '#7c8a84', M: '#9aa8a2', p: '#e6e1cf', Z: '#fff7d6',
    y: '#e5b524', x: '#16141a', u: {c: '#7fe8ff', emit: true}, T: '#2a2327', U: '#8c7ab8'};
  const y0 = j.n ? -M : 0, y1 = j.s ? TILE + M : TILE - 1;
  if (variant === 'drums') {
    const cols = ['B', 'R', 'G', 'Y', 'z'];
    [[9.5, 9], [22.5, 9], [9.5, 22], [22.5, 22]].forEach(([bx, by], i) => {
      const hz = hash2(c.tx * 4 + i, c.ty, c.seed + 71) > 0.5, col = pk(hash2(c.tx + i, c.ty * 3, c.seed + 72), cols);
      if (!j.n && by < 14 && false) return;
      t.cyl(bx, by, 0, 16, 6.2, 6.2, col, 2);
      t.cyl(bx, by, 0, 1, 6.5, 6.5, 'K', 2); t.cyl(bx, by, 8, 9, 6.5, 6.5, 'K', 2); t.cyl(bx, by, 15, 17, 6.6, 6.6, 'K', 2);
      if (hz) for (let z = 3; z < 8; z++) for (let a = 0; a < 40; a++) { const th = a * TAU / 40, x = bx + Math.cos(th) * 6.2, y = by + Math.sin(th) * 6.2; if (t.has(x, y, z)) t.set(x, y, z, (Math.floor((th * 3.2 + z * 1.1)) & 1) ? 'y' : 'x'); }
      t.cyl(bx, by, 16, 17, 5, 5, 'k', 2); t.set(bx - 2, by - 1.4, 16, 'z'); t.set(bx + 2, by + 1.4, 16, 'z'); t.set(bx - 2, by - 1.4, 17, 'z'); t.set(bx + 1, by, 17, 'z');
      if (hz && i % 2 === 0) for (let k = 0; k < 3; k++) t.set(bx - 1 + k, t.frontY(bx - 1 + k, 12), 12, 'w'); // stencilled label
    });
    // a couple of drips on the floor tile
    return {t, pal, tw: TILE, td: TILE};
  }
  // uprights
  for (let k = Math.floor(y0 / 16) - 1; k <= Math.ceil(y1 / 16) + 1; k++) {
    const uy = k * 16 - 1;
    for (const ux of [2, 27]) t.box(ux, uy, 0, ux + 3, uy + 2.4, 22, 'o');
    t.box(2, uy, 0, 5, uy + 2.4, 1, 'O'); t.box(27, uy, 0, 30, uy + 2.4, 1, 'O');
  }
  t.clip(0, TILE, y0, y1);
  const levels = variant === 'files' ? [] : [0, 7, 14];
  for (const z of levels) { t.box(2, y0, z, 30, y1, z + 1, 'k'); t.box(2, y0, z, 5, y1, z + 1, 'o'); t.box(27, y0, z, 30, y1, z + 1, 'o'); if (z < 21) { t.box(3, y0, z + 1, 4.2, y1, z + 2, 'O'); t.box(27.8, y0, z + 1, 29, y1, z + 2, 'O'); } }
  if (variant !== 'files') { t.box(2, y0, 21, 5, y1, 22, 'o'); t.box(27, y0, 21, 30, y1, 22, 'o'); for (let k = Math.floor(y0 / 16); k * 16 < y1; k++) t.box(2, k * 16 - 1, 21, 30, k * 16 + 1.4, 22, 'O'); }
  const bays = [];
  for (let k = Math.floor(y0 / 16); k * 16 < y1; k++) bays.push(k);
  if (variant === 'files') {
    // two rows of filing cabinets with open top clutter
    for (const [cx0, cx1] of [[3, 15.5], [16.5, 29]]) for (const k of bays) {
      const cy0 = k * 16 + 0.6, cy1 = cy0 + 14.8;
      t.box(cx0, cy0, 0, cx1, cy1, 14, 'm'); t.box(cx0, cy0, 14, cx1, cy1, 15, 'M');
      for (const dz of [2, 6, 10]) { const fy = Math.floor(cy1 - 0.5); for (let x = cx0 + 2; x < cx1 - 2; x++) t.set(x, fy, dz + 3, 'n'); t.set((cx0 + cx1) / 2 - 1, fy, dz + 2, 'z'); t.set((cx0 + cx1) / 2, fy, dz + 2, 'z'); }
      if (hash2(k, cx0, c.seed + 77 + c.ty) > 0.35) { t.box(cx0 + 2, cy0 + 2, 15, cx0 + 8, cy0 + 8, 17, 'p'); t.box(cx0 + 3, cy0 + 3, 17, cx0 + 7, cy0 + 7, 18, 'w'); }
      if (hash2(k, cx1, c.seed + 78 + c.ty) > 0.7) { t.cyl(cx1 - 4, cy0 + 9, 15, 18, 1.9, 1.9, 'R', 2); t.cyl(cx1 - 4, cy0 + 9, 18, 19, 1.2, 1.2, 'n', 2); }
    }
    return {t, pal, tw: TILE, td: TILE};
  }
  const brown = ['a', 'b', 'c', 'd', 'e'], can = ['R', 'B', 'Y', 'G'];
  for (let li = 0; li < 3; li++) {
    const z0 = li * 7 + 1;
    for (const k of bays) for (let col = 0; col < 2; col++) {
      const bx0 = 6 + col * 11.2, bx1 = bx0 + 10, by0 = k * 16 + 1.4, by1 = by0 + 13.2, cell = hash2(c.tx * 2 + col + k * 3, li * 7 + c.ty, c.seed + 21);
      if (cell < 0.12) { t.box(bx0 + 2, by0 + 3, z0, bx1 - 2, by1 - 3, z0 + 1, 'n'); continue; }
      if (variant === 'tapes') {
        // rows of flat reel boxes with a coloured spine each
        for (let r2 = 0; r2 < 3; r2++) { const yy = by0 + r2 * 4.4; t.box(bx0, yy, z0, bx1, yy + 3.8, z0 + 5, 'w'); t.box(bx0 + 1, yy + 3.8 - 1, z0 + 1, bx1 - 1, yy + 3.8, z0 + 4, pk(hash2(col + r2, k + li, c.seed + 5), ['R', 'B', 'Y', 'G', 'U'])); t.set(bx0 + 4, yy + 1.6, z0 + 5, 'n'); t.set(bx0 + 5, yy + 1.6, z0 + 5, 'n'); }
        continue;
      }
      if (cell > 0.78) { // canisters
        for (let q = 0; q < 2; q++) { const ccol = pk(hash2(col + q, li + k * 5, c.seed + 31), can), cx = bx0 + 2.6 + q * 5; for (let r2 = 0; r2 < 2; r2++) { const cy = by0 + 3.3 + r2 * 6.6; t.cyl(cx, cy, z0, z0 + 5, 2.4, 2.4, ccol, 2); t.cyl(cx, cy, z0 + 5, z0 + 6, 1.4, 1.4, 'n', 2); t.set(cx - 1, cy, z0 + 3, 'W'); t.set(cx, cy, z0 + 3, 'W'); } }
        continue;
      }
      const h = 4 + Math.floor(cell * 3) % 3, jw = cell > 0.6 ? 0.8 + (cell - 0.6) * 4 : 0;
      const col2 = brown[Math.floor(cell * 5) % 5];
      t.box(bx0, by0, z0, bx1 - jw, by1, z0 + h, col2);
      t.box(bx0 + (bx1 - bx0) / 2 - 1, by0, z0 + h - 1, bx0 + (bx1 - bx0) / 2 + 0.6, by1, z0 + h, 't'); // packing tape
      if (cell > 0.5) { t.box(bx0 + 1.2, by1 - 3.2, z0 + 1, bx0 + 4.6, by1, z0 + 3, 'p'); } // label on the face
      if (cell > 0.88) t.box(bx0 + 2, by0 + 2, z0 + h, bx1 - 3, by1 - 3, z0 + h + 2, brown[(Math.floor(cell * 9)) % 5]);
    }
  }
  // dust-sheet flapping over the top shelf in some bays
  if (rn(c, 90) > 0.82) { t.box(6, 2, 22, 27, 14, 23, 'Z'); t.box(8, 3, 23, 25, 12, 24, 'Z'); }
  return {t, pal, tw: TILE, td: TILE, variant};
}

function server(c) {
  const j = c.j, v = rn(c, 1), variant = v < 0.62 ? 'rack' : v < 0.86 ? 'tape' : 'speaker';
  const h = variant === 'tape' ? 15 : variant === 'speaker' ? 24 : 20, t = new TG(TILE, TILE, h + 6);
  const acc = c.accent || '#5ad0e6';
  const pal = {g: '#2c313b', G: '#39404b', k: '#12151b', K: '#232830', n: '#0e1015', f: '#4b5361', F: '#2f3540', A: acc, R: '#d14a3a', B: '#3d7bd0', Y: '#e5b524', w: '#d8dbe2', W: '#f0f2f5', l: '#25503f', s: '#10303a', q: '#1a1c22', Q: '#2c2f38',
    e: {c: '#7fe8ff', emit: true}, E: {c: '#ff5a4a', emit: true}, m: '#8d939e', p: '#c8bda4', P: '#a99f88', t: '#5a3b26', T: '#8a5a38'};
  const x0 = j.w ? -M : 1, x1 = j.e ? TILE + M : TILE - 1;
  const front = 29;
  if (variant === 'rack') {
    t.box(x0, 3, 0, x1, 30, 19, 'g'); t.box(x0, 3, 17, x1, 30, 19, 'G');
    t.box(x0, 3, 0, x1, 30, 2, 'k');                                            // plinth
    // vent slots + fan well on top
    for (let i = 0; i < 3; i++) t.box(4, 6 + i * 2.6, 19, 13, 7.3 + i * 2.6, 20, 'n');
    t.cyl(22, 12, 18, 20, 6.4, 6.4, 'k', 2); t.cyl(22, 12, 18, 19, 5.2, 5.2, 'n', 2); t.cyl(22, 12, 19, 20, 6.4, 6.4, 'f', 2); t.cyl(22, 12, 19, 20, 5.4, 5.4, 'n', 2);
    // cable bundle across the top, with a coil
    for (let x = x0; x < x1; x++) { const yy = 19.5 + Math.sin(x * 0.35) * 0.6; t.set(x, yy, 19, 'k'); t.set(x, yy + 1, 19, x % 6 < 3 ? 'A' : 'B'); t.set(x, yy + 2, 19, 'R'); t.set(x, yy + 1, 20, x % 6 < 3 ? 'A' : 'k'); }
    for (let a = 0; a < 20; a++) { const th = a * TAU / 20; t.set(8 + Math.cos(th) * 3.6, 25 + Math.sin(th) * 3.2, 19, a % 3 ? 'k' : 'A'); t.set(8 + Math.cos(th) * 3.6, 25 + Math.sin(th) * 3.2, 20, a % 2 ? 'k' : 'B'); }
    t.set(14, 20, 20, 'e'); t.set(14, 19, 20, 'e');
    // front: bays, LED row (lit live), vent lines, handles
    for (let x = x0; x < x1; x++) { t.set(x, front, 15, 'K'); t.set(x, front, 16, 'K'); }
    for (let i = 0; i < 4; i++) for (let z = 10; z < 13; z++) for (let x = 3 + i * 7; x < 8.4 + i * 7; x++) if (x >= x0 && x < x1) t.set(x, front, z, 'Q');
    for (let i = 0; i < 6; i++) t.set(3.5 + i * 4.6, front, 15, 'l');
    for (let z = 4; z < 8; z += 2) for (let x = 3; x < 29; x++) t.set(x, front, z, 'n');
    for (let i = 0; i < 4; i++) t.set(4 + i * 7 + 2, front, 11, 'w');            // drive handles
    return {t, pal, tw: TILE, td: TILE, variant, h: 19};
  }
  if (variant === 'tape') {
    // reel-to-reel deck: low cabinet, sloped brushed top plate, two reel hubs (spinning discs are live), head block, VU meters
    t.box(x0, 3, 0, x1, 30, 11, 'g'); t.box(x0, 3, 0, x1, 30, 2, 'k');
    t.box(x0, 3, 11, x1, 30, 13, 'm'); t.box(x0 + 1, 4, 13, x1 - 1, 29, 14, 'f');
    // deck plate details
    t.box(14.5, 8, 14, 17.5, 15, 15, 'k');                                       // head block
    t.set(15.5, 8, 15, 'e'); t.set(16.5, 8, 15, 'E');
    t.cyl(8, 11, 14, 15, 7.6, 7.6, 'F', 2); t.cyl(24, 11, 14, 15, 7.6, 7.6, 'F', 2); // reel wells
    t.cyl(8, 11, 15, 16, 1.4, 1.4, 'w', 2); t.cyl(24, 11, 15, 16, 1.4, 1.4, 'w', 2);  // hubs
    for (let x = 9; x < 24; x++) { t.set(x, 17 + Math.round(Math.sin((x - 9) / 15 * 3.14) * -1.5), 14, 't'); }   // tape path
    t.cyl(12, 19, 14, 17, 0.9, 0.9, 'w', 2); t.cyl(20, 19, 14, 17, 0.9, 0.9, 'w', 2); t.cyl(16, 22, 14, 18, 0.9, 0.9, 'm', 2); // guides + capstan
    // front panel: VU meters, knobs, transport buttons
    for (let z = 6; z < 11; z++) for (let x = 4; x < 12; x++) t.set(x, front, z, 's');
    for (let z = 6; z < 11; z++) for (let x = 20; x < 28; x++) t.set(x, front, z, 's');
    for (let i = 0; i < 4; i++) { t.set(5 + i * 2, front, 7 + (i % 2), 'e'); }
    for (let i = 0; i < 5; i++) t.set(21 + i * 1.4, front, 7, i === 4 ? 'E' : 'e');
    for (let i = 0; i < 5; i++) { t.cyl(13 + i * 1.9, front - 0.5, 4, 6, 0.8, 0.8, 'w', 2); }
    for (let i = 0; i < 4; i++) t.set(13 + i * 2, front, 3, i === 1 ? 'R' : 'Y');
    t.box(2, front - 1, 14, 5, front + 1, 15, 'A'); // on-air plate edge
    return {t, pal, tw: TILE, td: TILE, variant, h: 14};
  }
  // speaker stack: cabinet with a woofer + tweeter in the front face, metal corners, handle slot on top
  t.box(x0, 3, 0, x1, 30, 24, 'q'); t.box(x0, 3, 22, x1, 30, 24, 'Q');
  t.box(x0, 3, 0, x1, 30, 2, 'k');
  t.box(11, 10, 24, 21, 12, 25, 'n'); t.box(11, 11, 24, 21, 12, 25, 'k');       // handle slot
  for (const [cx, cz, r, ch] of [[16, 8, 8, 'k'], [16, 19, 4.4, 'k']]) {
    for (let z = 0; z < 26; z++) for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d < r && x >= x0 && x < x1) { const ring = Math.floor(d / 1.6) & 1; t.set(x, front, z, d < 1.8 ? 'm' : d > r - 1.2 ? 'f' : ring ? 'n' : 'F'); t.set(x, front - 1, z, 'n'); }
    }
  }
  for (const [cx, cz] of [[x0 + 2, 3], [x1 - 3, 3], [x0 + 2, 21], [x1 - 3, 21]]) if (cx >= 0 && cx < TILE) t.box(cx - 1, front - 1, cz - 1, cx + 1, front + 1, cz + 1, 'm');
  t.set(4, front, 14, 'w'); t.set(5, front, 14, 'w'); t.set(27, front, 14, 'e');
  return {t, pal, tw: TILE, td: TILE, variant, h: 24};
}

function desk(c, pair) {
  const w = pair ? 64 : TILE, t = new TG(w, TILE, 24), seed = c.seed;
  const pr = hash2(Math.floor(c.tx / 2), c.ty, seed + 31), v2 = hash2(c.tx, c.ty, seed + 32), v3 = hash2(c.tx, c.ty, seed + 33);
  const acc = c.accent || '#5ad0e6';
  const pal = {w: '#a47a4c', W: '#b98d58', d: '#6d5238', D: '#4d3b2b', k: '#222', n: '#0d1016', b: '#d3d7de', B: '#9ea3ad', p: '#d4cdb2', P: '#8a826a', S: '#0f2e30', s: '#1f5a50', e: {c: acc, emit: true},
    f: '#f1efe6', q: '#e9e6dc', c: '#4b2e1a', h: '#3d7bb8', y: '#ffd86a', m: '#2c3038', r: '#c9402f', g: '#3a4a40', x: '#58646c', u: '#3b4a8a', U: '#2c3868'};
  const top = 9;
  // legs / side panels, modesty panel, drawer pedestal, tabletop
  t.box(2, 12, 0, 6, 29, 8, 'D'); t.box(w - 6, 12, 0, w - 2, 29, 8, 'D');
  t.box(2, 27, 3, w - 2, 29, 8, 'D');
  if (pair) { t.box(26, 12, 0, 38, 29, 8, 'd'); for (const z of [2, 5]) { t.box(28, 29, z, 36, 30, z + 2, 'D'); t.set(31, 29, z, 'b'); t.set(32, 29, z, 'b'); } }
  t.box(1, 9, 8, w - 1, 30, 9, 'd');
  t.box(1, 9, 9, w - 1, 30, 11, 'w'); t.box(1, 9, 11, w - 1, 30, 12, 'W');       // top slab, lit edge
  t.box(2, 10, 12, w - 2, 29, 12.01, 'W');
  // wood grain lines on the top surface
  for (let i = 0; i < 5; i++) for (let x = 2; x < w - 2; x++) if (((x * 7 + i * 13) % 9) < 6) t.set(x, 12 + i * 3.6 > 29 ? 28 : 12 + i * 3.6 - 3, 11, i % 2 ? 'W' : 'w');
  const cx0 = pair ? 22 : 8;
  // CRT monitor on a swivel foot: tube housing behind a bezel; the glass faces the room (south)
  const crt = pair ? true : v3 > 0.35;
  if (crt) {
    t.cyl(cx0 + 10, 17, 12, 13, 5, 3.4, 'B', 2);
    t.box(cx0 + 1, 13, 13, cx0 + 19, 19, 25, 'p');                              // bezel box
    t.box(cx0 + 3, 9.5, 14, cx0 + 17, 14, 23, 'P');                              // tube taper behind
    t.box(cx0 + 5, 7.5, 15, cx0 + 15, 10, 21, 'P');
    for (let z = 15; z < 23; z++) for (let x = cx0 + 3; x < cx0 + 17; x++) t.set(x, 18, z, 'S');  // glass
    for (let z = 16; z < 22; z++) for (let x = cx0 + 4; x < cx0 + 16; x++) t.set(x, 18, z, (z + x) % 5 === 0 ? 's' : 'S');
    t.set(cx0 + 16, 18, 14, 'e'); t.set(cx0 + 4, 18, 14, 'k');
    t.box(cx0 + 2, 13, 24, cx0 + 18, 19, 25, 'B');                               // top vents
    for (let x = cx0 + 4; x < cx0 + 17; x += 2) t.set(x, 15, 25, 'n');
  } else { // desk lamp + radio set
    t.cyl(cx0 + 4, 20, 12, 13, 4, 3, 'm', 2); t.box(cx0 + 3.6, 19.6, 13, cx0 + 4.8, 20.8, 22, 'k'); t.box(cx0 + 4, 19, 21, cx0 + 14, 20.4, 22.4, 'k'); t.ell(cx0 + 14, 19.7, 20.4, 3, 2.4, 1.6, 'm'); t.ell(cx0 + 14, 19.7, 19.4, 1.4, 1.2, 0.8, 'y');
    t.box(cx0 + 12, 12, 12, cx0 + 24, 20, 17, 'x'); t.box(cx0 + 13, 20, 14, cx0 + 23, 21, 16, 'n'); t.set(cx0 + 15, 20, 15, 'e'); t.box(cx0 + 21, 11, 17, cx0 + 22, 12, 28, 'k'); // transistor radio + antenna
  }
  // keyboard (keys as a checker) + mouse
  t.box(cx0 + 2, 22, 12, cx0 + 17, 27, 13, 'b');
  for (let x = cx0 + 3; x < cx0 + 16; x += 2) for (let y = 23; y < 27; y += 1.5) t.set(x, y, 13, 'B');
  t.cyl(cx0 + 21, 24, 12, 13.5, 1.6, 2.2, 'k', 2);
  // clutter
  if (pr > 0.3) { t.box(4, 14, 12, 12, 24, 13, 'f'); t.box(5, 15, 13, 11, 23, 13.5, 'q'); for (let i = 0; i < 4; i++) t.box(6, 16 + i * 1.7, 13.5, 10, 16.4 + i * 1.7, 14, 'P'); }
  if (v2 > 0.35) { t.cyl(w - 9, 18, 12, 16, 3, 3, 'q', 2); t.cyl(w - 9, 18, 15, 16, 2.2, 2.2, 'c', 2); t.set(w - 6, 18, 14, 'q'); t.set(w - 5.5, 18, 13, 'q'); }
  else { t.box(w - 13, 18, 12, w - 5, 24, 14, 'h'); t.box(w - 12, 19, 14, w - 6, 23, 14.4, 'f'); t.set(w - 10, 20, 14, 'r'); }
  if (pair && pr < 0.5) { t.cyl(w - 22, 20, 12, 14, 3, 3, 'm', 2); t.cyl(w - 22, 20, 14, 15, 1.5, 1.5, 'y', 2); } // paperweight / ash tray
  // swivel chair tucked behind the desk (north, partly under the top): seat + curved back + star base; blue or green cloth
  if (rn(c, 4) > 0.35) {
    const chx = pair ? 14 + Math.floor(rn(c, 5) * 30) : 16, cloth = rn(c, 6) > 0.5 ? 'u' : 'g';
    t.cyl(chx, 6, 0, 3, 0.9, 0.9, 'k', 2); for (let a = 0; a < 5; a++) { const th = a * TAU / 5 + 0.4; for (let r2 = 1; r2 < 5; r2++) t.set(chx + Math.cos(th) * r2, 6 + Math.sin(th) * r2 * 0.8, 0, 'k'); t.set(chx + Math.cos(th) * 5, 6 + Math.sin(th) * 4, 1, 'm'); }
    t.cyl(chx, 6, 3, 9, 0.8, 0.8, 'm', 2);
    t.cyl(chx, 6, 9, 11, 6, 5.2, cloth, 3);
    for (let x = chx - 6; x <= chx + 6; x++) { const yy = 1.4 + Math.abs(x - chx) * 0.16; for (let z = 11; z < 20; z++) { t.set(x, yy, z, cloth === 'u' ? 'U' : 'g'); t.set(x, yy + 1, z, cloth); } }
    t.set(chx, 8, 11, 'm');
  }
  return {t, pal, tw: w, td: TILE, crt, cx0};
}

function bed(c) {
  const t = new TG(TILE, 64, 32), accent = hexMix(c.accent || '#5ad0e6', '#24343a', 0.5), blood = hash2(c.tx, c.ty, c.seed + 5) > 0.5;
  const pal = {m: '#c8d1d8', M: '#8b97a1', k: '#4a525a', W: '#eef6f5', w: '#ffffff', A: accent, a: hexMix(accent, '#ffffff', 0.25), r: '#8c1424', t: '#9aa5ad', c: '#9edecf', C: '#5fa89b', i: '#e6f4ff', I: {c: '#9fe8ff', emit: true},
    g: '#3b3f46', G: '#6a7780', l: '#2d3a40', e: {c: '#6dffb0', emit: true}, p: '#e5e9ec', y: '#d8c46a'};
  const side = c.tx < (c.room?.cx ?? 0) ? 1 : -1;
  // wheels, frame, bed deck
  for (const [x, y] of [[5, 5], [27, 5], [5, 58], [27, 58]]) { t.cyl(x, y, 0, 2, 2, 2, 'k', 2); t.cyl(x, y, 2, 4, 1.1, 1.1, 'M', 2); }
  t.box(4, 4, 4, 28, 60, 5, 'M');
  t.box(3, 2, 5, 29, 62, 7, 'm');
  // mattress with rounded top, pillow, blanket (folded back), rails
  t.ell(16, 32, 7.3, 11.4, 28, 2.4, 'W', 4);
  t.ell(16, 11, 9.6, 7.4, 4.8, 2.3, 'w', 2.4);                                    // pillow
  t.box(5.2, 24, 7, 26.8, 58, 10, 'A'); t.box(5.2, 24, 9, 26.8, 28, 10.4, 'a');   // blanket and folded hem
  for (let i = 0; i < 5; i++) t.box(6, 31 + i * 5.8, 10, 26, 31.7 + i * 5.8, 10.3, 'a');
  if (blood) { t.ell(18, 40, 10, 3.2, 2.2, 0.5, 'r'); t.set(20, 44, 10, 'r'); }
  t.box(3, 0, 5, 29, 3, 14, 'g'); t.box(3, 0, 13, 29, 3, 14, 'G');             // headboard
  t.box(3, 61, 5, 29, 64, 11, 'g'); t.box(3, 61, 10, 29, 64, 11, 'G');         // footboard
  for (const rx of [3, 26.4]) { t.box(rx, 18, 7, rx + 2.6, 20, 12, 't'); t.box(rx, 38, 7, rx + 2.6, 40, 12, 't'); t.box(rx, 18, 11, rx + 2.6, 40, 12, 't'); }
  // privacy curtain on the room side: pleated, hung from a rail
  const cx0 = side > 0 ? 29.2 : 0.2;
  for (let y = 0; y < 64; y++) for (let z = 4; z < 17; z++) t.set(cx0, y, z, (Math.floor(y / 2.7) & 1) ? 'c' : 'C'), t.set(cx0 + 1, y, z, (Math.floor((y + 1) / 2.7) & 1) ? 'c' : 'C');
  t.box(cx0 - 0.4, 0, 17, cx0 + 2.4, 64, 18, 't');
  // IV drip stand at the head on the curtain side: pole, base star, saline bag with an emissive drip, tube down to the bed
  const px = side > 0 ? 27 : 5;
  t.cyl(px, 6, 0, 1, 3, 3, 'k', 2); t.cyl(px, 6, 1, 28, 0.7, 0.7, 't', 2);
  for (let a = 0; a < 4; a++) { const th = a * TAU / 4 + 0.5; for (let r2 = 1; r2 < 4; r2++) t.set(px + Math.cos(th) * r2, 6 + Math.sin(th) * r2, 0, 'k'); }
  t.box(px - 3, 5.5, 27, px + 3, 6.5, 28, 't');
  t.ell(px - 2.4, 6, 24, 1.8, 1.2, 3.2, 'i'); t.ell(px + 2.4, 6, 24.6, 1.6, 1.1, 2.8, 'i');
  t.set(px + 2.4, 6, 22, 'I'); t.set(px - 2.4, 6, 21, 'I');
  for (let k = 0; k < 14; k++) t.set(px + (side > 0 ? -1 : 1) * (0.7 + k * 0.45), 6.5 + k * 1.1, Math.max(8, 20 - k * 0.9), 'i');
  // bedside monitor on a bracket at the head (screen live)
  t.box(px - 4, 4, 20, px + 2, 8, 26, 'k'); for (let z = 21; z < 25; z++) for (let x = px - 3; x < px + 1; x++) t.set(x, 8, z, 'l');
  t.set(px - 3, 8, 21, 'e');
  return {t, pal, tw: TILE, td: 64, side, mx: px - 1.5, mz: 23};
}

// ------------------------------------------------------------------ style table
const kpow = (j) => (j.n ? 1 : 0) | (j.s ? 2 : 0) | (j.e ? 4 : 0) | (j.w ? 8 : 0);
const PILLAR_OPTS = {
  concrete: {plinth: '#53555e', body: '#8e8f99', cap: '#a9aab3', bolt: '#c8c9d0', chips: true, rings: [10]},
  hazard: {plinth: '#3a3438', body: '#6c6a72', cap: '#35323a', bolt: '#d8b030', band: ['y', 'd'], lamp: '#ff5367', dot: false},
  vault: {plinth: '#25232b', body: '#4a4754', cap: '#2e2c36', bolt: '#e8c46b', band: ['y', 'd'], trim: '#e8c46b', rings: [4, 15]},
  beacon: {plinth: '#4a4c54', body: '#a9aab2', cap: '#55565f', bolt: '#33343c', band: ['w', 'Q'], lamp: '#ff5a4a'},
};
/** The spec for a cover tile: a stable cache key and the build function. null = keep the painted fallback. */
export function propSpec(c) {
  const style = c.style, j = c.j, acc = c.accent || '';
  switch (style) {
    case 'concrete': case 'hazard': case 'beacon': {
      const o = PILLAR_OPTS[style];
      return {key: `${style}|${acc}|${Math.floor(rn(c, 20) * 4)}`, joins: {}, h: 26, build: () => pillar(c, {...o, band: o.band})};
    }
    case 'vault': {
      if (c.kind === 'pillar') return {key: `vp|${acc}|${Math.floor(rn(c, 20) * 4)}`, joins: {}, build: () => pillar(c, {...PILLAR_OPTS.vault, trim: acc || '#e8c46b'})};
      return {key: `vw|${acc}|${rn(c, 11) > 0.45 ? 1 : 0}`, joins: {}, build: () => vaultwall(c)};
    }
    case 'sandbag': { const vert = (j.n || j.s) && !(j.e || j.w); return {key: `sb|${kpow(j)}|${(vert ? c.ty : c.tx) & 3}|${rn(c, 160) > 0.965 ? 1 : 0}|${rn(c, 3) > 0.5 ? 1 : 0}`, joins: j, build: () => sandbag(c)}; }
    case 'jersey': case 'jersey-hazard': return {key: `${style}|${kpow(j)}|${acc}`, joins: j, build: () => jersey(c, style === 'jersey-hazard')};
    case 'partition': return {key: `pt|${kpow(j)}|${acc}|${hash2(c.tx, c.ty, c.seed + 5) > 0.6 ? 1 : 0}`, joins: j, build: () => partition(c)};
    case 'rack': { const v = rn(c, 1), var1 = v < 0.1 ? 'd' : v < 0.22 ? 'f' : v < 0.3 ? 't' : 's'; return {key: `rk|${var1}|${kpow(j)}|${c.ty & 1}|${c.tx & 3}`, joins: {n: j.n, s: j.s}, build: () => rack(c)}; }
    case 'server': { const v = rn(c, 1), var1 = v < 0.62 ? 'r' : v < 0.86 ? 't' : 's'; return {key: `sv|${var1}|${kpow(j)}|${acc}`, joins: {w: j.w, e: j.e}, build: () => server(c)}; }
    case 'desk': {
      const run = c.run ?? 0;                       // index within the horizontal run of desks
      if (run % 2 === 1) return {skip: true};
      const pair = !!j.e;
      return {key: `dk|${pair ? 2 : 1}|${acc}|${Math.floor(hash2(Math.floor(c.tx / 2), c.ty, c.seed + 31) * 4)}|${Math.floor(hash2(c.tx, c.ty, c.seed + 32) * 4)}|${Math.floor(rn(c, 33) * 3)}|${rn(c, 4) > 0.35 ? 1 : 0}|${Math.floor(rn(c, 5) * 3)}|${Math.floor(rn(c, 6) * 2)}`, joins: {}, build: () => desk(c, pair)};
    }
    case 'bed': {
      if ((c.run ?? 0) % 2 === 1) return {skip: true};
      if (!j.s) return null;
      return {key: `bd|${acc}|${hash2(c.tx, c.ty, c.seed + 5) > 0.5 ? 1 : 0}|${c.tx < (c.room?.cx ?? 0) ? 1 : 0}`, joins: {}, build: () => bed(c)};
    }
    default: return null;
  }
}

// ------------------------------------------------------------------ baking
function sliceCanvas(grid, k, zFrac, pal, px) {
  const cv = makeCanvas(grid.w * px + 1, grid.d * px + 1), g = cv.getContext('2d');
  const colorOf = new Map();
  let any = false;
  for (let y = 0; y < grid.d; y++) {
    let x = 0;
    while (x < grid.w) {
      const ch = grid.get(x, y, k);
      if (!ch) { x++; continue; }
      const exposed = !grid.has(x, y, k + 1), key = ch * 2 + (exposed ? 1 : 0);
      let col = colorOf.get(key);
      if (col === undefined) { const p = pal[String.fromCharCode(ch)]; col = p ? (p.emit ? p.c : voxelColor(p.c || p, zFrac, exposed)) : '#ff00ff'; colorOf.set(key, col); }
      let x2 = x + 1;
      while (x2 < grid.w && grid.get(x2, y, k) === ch && (!grid.has(x2, y, k + 1)) === exposed) x2++;
      const a0 = Math.round(x * px), a1 = Math.round(x2 * px), b0 = Math.round(y * px), b1 = Math.round((y + 1) * px);
      g.fillStyle = col; g.fillRect(a0, b0, a1 - a0 + 0.6, b1 - b0 + 0.6); any = true; x = x2;
    }
  }
  return any ? cv : null;
}

/** Bakes a built prop to one cropped tile image. Returns {cv, dx, dy, w, h} (dx/dy in world units from the tile's top-left). */
export function bakeProp(built, joins, px) {
  const {t, pal, tw, td} = built, grid = t.g, o = Math.max(1, Math.round(px * 0.6)), dz = STACK_TILT * px;
  const H = grid.h, up = Math.ceil(H * dz) + 1, pad = o + 2;
  const FW = Math.ceil(grid.w * px) + 2 * pad, FH = Math.ceil(grid.d * px) + up + 2 * pad;
  const comp = makeCanvas(FW, FH), g = comp.getContext('2d'), tA = makeCanvas(FW, FH), ta = tA.getContext('2d'), tB = makeCanvas(FW, FH), tb = tB.getContext('2d');
  for (let k = 0; k < H; k++) {
    const sc = sliceCanvas(grid, k, H > 1 ? k / (H - 1) : 1, normPal(pal), px);
    if (!sc) continue;
    const dy = Math.round(k * dz);
    ta.clearRect(0, 0, FW, FH); ta.drawImage(sc, pad, pad + up - dy);
    g.drawImage(tA, 0, 0);
    tb.globalCompositeOperation = 'source-over'; tb.clearRect(0, 0, FW, FH); tb.drawImage(tA, 0, 0);
    tb.globalCompositeOperation = 'destination-out'; tb.drawImage(tA, L_X, L_Y);
    tb.globalCompositeOperation = 'source-atop'; tb.fillStyle = 'rgba(255,248,235,0.2)'; tb.fillRect(0, 0, FW, FH);
    g.drawImage(tB, 0, 0);
    tb.globalCompositeOperation = 'source-over'; tb.clearRect(0, 0, FW, FH); tb.drawImage(tA, 0, 0);
    tb.globalCompositeOperation = 'destination-out'; tb.drawImage(tA, -L_X, -L_Y);
    tb.globalCompositeOperation = 'source-atop'; tb.fillStyle = 'rgba(8,5,16,0.24)'; tb.fillRect(0, 0, FW, FH);
    g.drawImage(tB, 0, 0);
  }
  tb.globalCompositeOperation = 'source-over'; tb.clearRect(0, 0, FW, FH); tb.drawImage(comp, 0, 0);
  tb.globalCompositeOperation = 'source-in'; tb.fillStyle = INK_OUTLINE; tb.fillRect(0, 0, FW, FH); tb.globalCompositeOperation = 'source-over';
  const out = makeCanvas(FW, FH), og = out.getContext('2d');
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; og.drawImage(tB, Math.round(Math.cos(a) * o), Math.round(Math.sin(a) * o)); }
  og.drawImage(comp, 0, 0);
  // crop to the tile; sides that continue into a neighbour are cut exactly on the tile boundary
  const Tx = pad + M * px, Ty = pad + up + M * px, topY = Ty - Math.round((H - 1) * dz);
  const cx0 = Math.round(Tx - (joins.w ? 0 : o + 1)), cx1 = Math.round(Tx + tw * px + (joins.e ? 0 : o + 1));
  const cy0 = Math.round(topY - (joins.n ? 1 : o + 1)), cy1 = Math.round(Ty + td * px + (joins.s ? 0 : o + 1));
  const cv = makeCanvas(cx1 - cx0, cy1 - cy0);
  cv.getContext('2d').drawImage(out, cx0, cy0, cx1 - cx0, cy1 - cy0, 0, 0, cx1 - cx0, cy1 - cy0);
  return {cv, dx: (cx0 - Tx) / px, dy: (cy0 - Ty) / px, w: cv.width / px, h: cv.height / px};
}
const palCache = new WeakMap();
function normPal(p) {
  let n = palCache.get(p);
  if (!n) { n = {}; for (const [k, v] of Object.entries(p)) n[k] = typeof v === 'string' ? {c: v, emit: false} : {c: v.c, emit: !!v.emit}; palCache.set(p, n); }
  return n;
}

const cache = new Map();
export const propStats = {bakes: 0, bakeMs: 0, entries: 0};
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** Image + placement for a cover tile at bake scale px (device px per world unit). null = no stacked art for this style. */
export function propImage(c, px) {
  const spec = propSpec(c);
  if (!spec) return null;
  if (spec.skip) return {skip: true};
  const key = spec.key + '|' + px;
  let e = cache.get(key);
  if (!e) {
    const t0 = now();
    const built = spec.build();
    e = bakeProp(built, spec.joins || {}, px);
    e.built = {variant: built.variant, crt: built.crt, cx0: built.cx0, h: built.h, side: built.side, mx: built.mx, mz: built.mz};
    if (cache.size > 400) cache.clear();
    cache.set(key, e);
    propStats.bakes++; propStats.bakeMs += now() - t0; propStats.entries = cache.size;
  }
  return e;
}
export const clearPropCache = () => cache.clear();

/** Draws the tile's prop onto a chunk context (transform already set). Returns false when the style has no stacked art. */
export function paintPropStack(g, c, px) {
  const e = propImage(c, px);
  if (!e) return false;
  if (e.skip) return true;
  g.drawImage(e.cv, c.tx * TILE + e.dx, c.ty * TILE + e.dy, e.w, e.h);
  return true;
}

// ------------------------------------------------------------------ live (animated) parts
/** World-space anchor of a cell on a prop's front: screen y of the layer centre. */
const zy = (y, z) => y - (z + 0.5) * STACK_TILT;

/**
 * The animated bits of a cover tile: [{type, x, y, ...}] in world coords (already lifted for height).
 * types: led (blinking additive pixel), crt (screen flicker rect), fan / reel (spinning stacks), beep (heart monitor trace).
 */
export function propLive(c) {
  const spec = propSpec(c);
  if (!spec || spec.skip) return null;
  const X = c.tx * TILE, Y = c.ty * TILE, out = [], r = (s) => hash2(c.tx, c.ty, c.seed + s);
  const key = spec.key;
  if (c.style === 'server') {
    const v = rn(c, 1);
    if (v < 0.62) {
      for (let i = 0; i < 6; i++) { const hv = hash2(c.tx * 6 + i, c.ty, c.seed + 4); out.push({type: 'led', x: X + 3.5 + i * 4.6 + 0.5, y: Y + zy(29.5, 15), ph: hv * 40, rate: 0.6 + hash2(c.tx, c.ty * 6 + i, c.seed) * 3.2, col: hv < 0.55 ? '90,255,170' : hv < 0.8 ? '255,180,70' : '90,210,255'}); }
      out.push({type: 'fan', x: X + 22, y: Y + zy(12, 19.2), r: 5.2, ph: r(7) * TAU, rate: 9 + r(8) * 6});
    } else if (v < 0.86) {
      out.push({type: 'reel', x: X + 8, y: Y + zy(11, 15), r: 6.6, ph: r(7) * TAU, rate: 3.1, rev: 1});
      out.push({type: 'reel', x: X + 24, y: Y + zy(11, 15), r: 6.6, ph: r(9) * TAU, rate: 2.2, rev: -1});
      for (let i = 0; i < 5; i++) out.push({type: 'led', x: X + 21 + i * 1.4 + 0.4, y: Y + zy(29.5, 7), ph: r(20 + i) * 40, rate: 1.4 + i * 0.5, col: i === 4 ? '255,80,70' : '120,255,200'});
      out.push({type: 'vu', x: X + 8, y: Y + zy(29.5, 8), w: 8, h: 3.4, ph: r(30) * 7});
      out.push({type: 'vu', x: X + 20, y: Y + zy(29.5, 8), w: 8, h: 3.4, ph: r(31) * 7});
    } else {
      out.push({type: 'led', x: X + 27.5, y: Y + zy(29.5, 14), ph: r(40) * 7, rate: 0.8, col: '120,230,255'});
    }
  } else if (c.style === 'desk') {
    const pair = !!c.j.e, d = desk_meta(c, pair);
    if (d.crt) out.push({type: 'crt', x: X + d.cx0 + 3, y: Y + zy(18.6, 15), w: 14, h: 8 * STACK_TILT, ph: r(50) * 20});
  } else if (c.style === 'beacon') {
    out.push({type: 'led', x: X + 16, y: Y + 16 - 21 * STACK_TILT, ph: 0, rate: 0.5, col: '255,90,74', big: true});
  } else if (c.style === 'hazard') {
    out.push({type: 'led', x: X + 16, y: Y + 16 - 20.5 * STACK_TILT, ph: r(51) * 5, rate: 1.1, col: '255,83,103', big: true});
  } else if (c.style === 'bed') {
    const e = {side: c.tx < (c.room?.cx ?? 0) ? 1 : -1}, px2 = e.side > 0 ? 27 : 5;
    out.push({type: 'beep', x: X + px2 - 3, y: Y + zy(8.6, 22), w: 4, h: 4 * STACK_TILT + 0.6, ph: r(60) * 5});
  } else if (c.style === 'jersey' || c.style === 'jersey-hazard') { /* static */ }
  return out.length ? out : null;
}
function desk_meta(c, pair) { return {crt: pair ? true : hash2(c.tx, c.ty, c.seed + 33) > 0.35, cx0: pair ? 22 : 8}; }

// two spinner models (fan blades, tape reel) drawn live as real stacks at a time-driven yaw
let fanModel = null, reelModel = null;
function spinnerModels() {
  if (fanModel) return;
  const mk = (id, build, pal) => { const g = new VoxelGrid(16, 16, 3); build(g); return {id, unit: 0.8, layerH: 0.8, pivot: {x: 8, y: 8}, palette: pal, grid: g, buckets: 24}; };
  fanModel = mk('prop.fan', (g) => { g.cyl(8, 8, 0, 1, 7.6, 7.6, 'r'); for (let a = 0; a < 4; a++) { const th = a * TAU / 4; for (let r2 = 1; r2 < 7; r2++) { const x = 8 + Math.cos(th) * r2 + Math.cos(th + 1.57) * r2 * 0.18, y = 8 + Math.sin(th) * r2 + Math.sin(th + 1.57) * r2 * 0.18; g.set(x, y, 1, 'b'); g.set(x + 0.5, y, 1, 'b'); g.set(x, y + 0.5, 1, 'b'); } } g.cyl(8, 8, 1, 3, 1.3, 1.3, 'h'); }, {r: '#12151b', b: '#59616f', h: '#8b94a3'});
  reelModel = mk('prop.reel', (g) => { g.cyl(8, 8, 0, 1, 7.7, 7.7, 'f'); g.cyl(8, 8, 1, 2, 7, 7, 't'); g.cyl(8, 8, 1, 2, 3.2, 3.2, 'f'); for (let a = 0; a < 3; a++) { const th = a * TAU / 3; for (let r2 = 1.2; r2 < 7; r2 += 1) g.set(8 + Math.cos(th) * r2, 8 + Math.sin(th) * r2, 2, 'w'); } g.cyl(8, 8, 2, 3, 1.6, 1.6, 'h'); g.set(14.2, 8.4, 2, 'w'); g.set(14.2, 8.4, 1, 'w'); }, {f: '#cfd3da', t: '#5a3b26', w: '#f2f0e6', h: '#8b94a3'});
}
const _col = {};
/** Draws every animated part of the given tiles. ctx: world-space transform. */
export function drawPropsLive(ctx, items, t, view) {
  if (!items.length) return;
  spinnerModels();
  ctx.save();
  const ph = (it) => it.ph;
  let additive = false;
  const addOn = () => { if (!additive) { ctx.globalCompositeOperation = 'lighter'; additive = true; } };
  const addOff = () => { if (additive) { ctx.globalCompositeOperation = 'source-over'; additive = false; } };
  // stacks first (normal blend), then additive glows
  for (const it of items) {
    if (it.x < view.x0 - 20 || it.x > view.x1 + 20 || it.y < view.y0 - 30 || it.y > view.y1 + 20) continue;
    if (it.type === 'fan') drawStack(ctx, fanModel, it.x, it.y + it.r * 0, {yaw: t * it.rate + it.ph, z: 0});
    else if (it.type === 'reel') drawStack(ctx, reelModel, it.x, it.y, {yaw: (t * it.rate * it.rev) + it.ph});
  }
  for (const it of items) {
    if (it.x < view.x0 - 20 || it.x > view.x1 + 20 || it.y < view.y0 - 30 || it.y > view.y1 + 20) continue;
    if (it.type === 'led') {
      addOn();
      const p = t * (it.rate || 1) + it.ph, on = it.big ? (0.35 + 0.65 * Math.max(0, Math.sin(p * 4)) ** 2) : (p % 1 < 0.55 ? 1 : 0.12) * (0.55 + 0.45 * Math.sin(p * 6.3));
      if (on < 0.08) continue;
      ctx.fillStyle = `rgba(${it.col},${Math.min(1, on + 0.2).toFixed(2)})`; ctx.fillRect(it.x - 0.5, it.y - 0.5, it.big ? 3 : 2.2, it.big ? 2.4 : 1.6);
    } else if (it.type === 'crt') {
      addOn();
      const f = 0.55 + 0.25 * Math.sin(t * 30 + it.ph) * Math.sin(t * 7.1 + it.ph * 2) + (Math.sin(t * 2.3 + it.ph) > 0.93 ? 0.35 : 0);
      ctx.fillStyle = `rgba(70,230,180,${(0.22 * f).toFixed(3)})`; ctx.fillRect(it.x, it.y, it.w, it.h);
      const sw = ((t * 0.7 + it.ph) % 1) * it.h; ctx.fillStyle = `rgba(190,255,230,${(0.28 * f).toFixed(3)})`; ctx.fillRect(it.x, it.y + sw, it.w, 0.7);
      for (let i = 0; i < 3; i++) { const lw = 4 + ((Math.floor(t * 1.5 + i * 3 + it.ph) * 7 + i * 5) % 7); ctx.fillStyle = `rgba(150,255,210,${(0.5 * f).toFixed(3)})`; ctx.fillRect(it.x + 1, it.y + 0.7 + i * 1.5, lw, 0.6); }
      ctx.fillStyle = `rgba(70,230,180,${(0.05 * f).toFixed(3)})`; ctx.fillRect(it.x - 3, it.y - 3, it.w + 6, it.h + 7);
    } else if (it.type === 'vu') {
      addOn();
      const lv = 0.35 + 0.35 * Math.sin(t * 5.3 + it.ph) * Math.sin(t * 1.7 + it.ph) + 0.25 * Math.max(0, Math.sin(t * 11 + it.ph * 3));
      for (let i = 0; i < 6; i++) { const on = i / 6 < lv; ctx.fillStyle = on ? (i > 4 ? 'rgba(255,90,70,0.85)' : 'rgba(120,255,190,0.8)') : 'rgba(30,70,60,0.35)'; ctx.fillRect(it.x + i * 1.3, it.y, 1, it.h); }
    } else if (it.type === 'beep') {
      addOn();
      ctx.strokeStyle = 'rgba(110,255,176,0.85)'; ctx.lineWidth = 0.55; ctx.beginPath();
      const u = (t * 0.8 + it.ph) % 1;
      for (let i = 0; i <= 8; i++) { const x = i / 8, d = Math.abs(x - u), y = d < 0.07 ? -Math.sin(d / 0.07 * 3.14) * (x < u ? 1 : -1) * 0.9 : 0; ctx.lineTo(it.x + x * it.w, it.y + it.h * 0.5 + y * it.h * 0.45); }
      ctx.stroke();
    }
  }
  addOff();
  ctx.restore();
}
void hexMul; void _col;
