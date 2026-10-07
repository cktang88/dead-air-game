// Voxel models for the three heavy humanoids on the shared rig: WARDEN (guard), MARKSMAN (sniper), RIOT, each with an
// ELITE trim variant. Everything is built from a colour SPEC + flags (same kit shape as models2d.js humanoidKit), plus
// the extra parts only these types have: guns with separate moving parts (pump, bolt), the riot shield (4 crack
// levels, upright and flat), the baton, the marksman's ghillie strips. Authoring guide: docs/art/STACKING.md.
import {VoxelGrid} from './stack2d.js';
import {humanoidKit, gunGeometry, BODY_UNIT as U, GUN_UNIT} from './models2d.js';

export const HEAVY_TYPES = ['guard', 'sniper', 'riot'];

// ---------------------------------------------------------------- specs (colours; elite swaps the accent for gold/orange)
const BASE = {
  guard: {
    pants: '#37424e', pantsHi: '#4d5c6c', boot: '#262a33', bootHi: '#454a58', sole: '#14121a', belt: '#262b35', buckle: '#d9b45a', pouch: '#7a6038', pouchHi: '#a98a4e',
    vest: '#3a7088', plate: '#4f9bb8', plateHi: '#97d9ee', accentDark: '#2c6178', accent: '#e9b84a', cloth: '#2e4350', strap: '#1c2229', glove: '#2b3036', gloveHi: '#4a525c',
    skin: '#c79574', helmet: '#4d97b4', visor: '#10242c', lens: '#4fd6e6', lensHi: '#c8fbff', pack: '#3a4552', packDark: '#252d37', led: '#ff4a5e', brass: '#e8c978', glass: '#2a4856',
  },
  sniper: {
    pants: '#26363a', pantsHi: '#3d5256', boot: '#1d2326', bootHi: '#38444a', sole: '#101416', belt: '#2a2a22', buckle: '#c9a85a', pouch: '#4f5a46', pouchHi: '#70805f',
    vest: '#2a4a46', plate: '#4a6a52', plateHi: '#8fb08a', accentDark: '#245652', accent: '#6fe0d2', cloth: '#2d4a4a', strap: '#1c2422', glove: '#252e30', gloveHi: '#424f50',
    skin: '#c79574', helmet: '#2a4846', visor: '#071315', lens: '#7ff8ee', lensHi: '#ffffff', pack: '#3a4a40', packDark: '#26332b', led: '#ff4a5e', brass: '#e8c978', glass: '#1c3a3d',
  },
  riot: {
    pants: '#3b4552', pantsHi: '#56657a', boot: '#252830', bootHi: '#464c5a', sole: '#14121a', belt: '#1f232b', buckle: '#d9b45a', pouch: '#4e5a68', pouchHi: '#7289a0',
    vest: '#46586a', plate: '#7890a6', plateHi: '#c0d4e4', accentDark: '#4a5c6e', accent: '#ffd36e', cloth: '#394655', strap: '#1c2229', glove: '#24282f', gloveHi: '#454d58',
    skin: '#c79574', helmet: '#8aa2b8', visor: '#162430', lens: '#bfe6ff', lensHi: '#ffffff', pack: '#3a4654', packDark: '#252d37', led: '#ff4a5e', brass: '#e8c978', glass: '#9fcfe8',
  },
};
const ELITE_ACCENT = {guard: ['#ffb43a', '#c9701e'], sniper: ['#ffcf5a', '#c98a24'], riot: ['#ff8a3a', '#b8501c']};
export function heavySpec(type, elite) {
  const c = {mic: '#8d8b92', ...BASE[type]}; c.helmetHi = c.plateHi;
  if (elite) { c.accent = ELITE_ACCENT[type][0]; c.accentDark = ELITE_ACCENT[type][1]; c.buckle = '#ffd36e'; }
  return {id: type + (elite ? '+' : ''), helmet: 'cap', bandolier: false, pack: 'sack', shoulders: 'soft', c};
}

function pal(c) {
  return {
    p: c.pants, q: c.pantsHi, b: c.boot, B: c.bootHi, s: c.sole, T: c.belt, Y: c.buckle, P: c.pouch, Q: c.pouchHi,
    W: c.plate, H: c.plateHi, a: c.accentDark, A: c.accent, c: c.cloth, S: c.strap, g: c.glove, G: c.gloveHi, n: c.skin, N: '#a47656',
    h: c.helmet, D: c.visor, L: {c: c.lens, emit: true}, l: {c: c.lensHi, emit: true}, Z: c.glass, z: '#d4eefa', K: c.pack, k: c.packDark,
    E: {c: c.led, emit: true}, y: c.brass, m: '#3a3e48', M: '#8d8b92', V: c.vest, x: '#241f2a', o: '#14141a', w: '#6a4a34', u: c.accentDark,
  };
}

// ---------------------------------------------------------------- grid helpers
/** Octagon-ish slab: |dx|<=1, |dy|<=1 and |dx|+|dy|<=k (k = 2 square ... 1 diamond), layers z0..z1 (exclusive). */
function oct(g, cx, cy, z0, z1, hx, hy, k, ch, keep = false) {
  for (let z = z0; z < z1; z++) for (let y = 0; y < g.d; y++) for (let x = 0; x < g.w; x++) {
    const dx = Math.abs(x + 0.5 - cx) / hx, dy = Math.abs(y + 0.5 - cy) / hy;
    if (dx <= 1 && dy <= 1 && dx + dy <= k && !(keep && g.has(x, y, z))) g.set(x, y, z, ch);
  }
}
const frontmost = (g, y, z, ch) => { for (let x = g.w - 1; x >= 0; x--) if (g.get(x, y, z) === ch.charCodeAt(0) || (ch === '*' && g.has(x, y, z))) return x; return -1; };

// ---------------------------------------------------------------- WARDEN
function wardenLeg(spec) {
  const g = new VoxelGrid(12, 7, 10), cy = 3.5;
  g.ellipsoid(6.4, cy, 0.5, 5.4, 3.1, 0.6, 's', 3);
  g.ellipsoid(6.2, cy, 1.6, 5.0, 2.9, 0.9, 'b', 3);
  g.ellipsoid(9.8, cy, 1.5, 1.7, 2.5, 0.7, 'B', 3);              // toe cap
  g.cyl(5, cy, 2, 4, 2.5, 2.6, 'b', 2.4);
  g.cyl(5, cy, 4, 5, 2.8, 2.9, 'B', 2.4);                       // boot cuff
  g.cyl(5.4, cy, 5, 8, 2.5, 2.7, 'W', 2.6);                     // shin guard
  g.box(7.2, cy - 1.5, 5, 8.2, cy + 1.5, 8, 'H');               // shin ridge
  g.ellipsoid(6.4, cy, 8, 2.9, 3.0, 1.2, 'W', 2.6);             // knee guard
  g.ellipsoid(7.2, cy, 8.9, 1.8, 2.0, 0.6, 'H', 2.6);
  g.set(8, cy - 2, 8, 'y'); g.set(8, cy + 1, 8, 'y');            // rivets
  g.cyl(5, cy, 9, 10, 2.7, 2.9, 'p', 2.4);
  return {id: `${spec.id}.leg2`, unit: U, layerH: U, pivot: {x: 5.5, y: cy}, palette: pal(spec.c), grid: g, buckets: 32};
}
function wardenTorso(spec, elite) {
  const W = 15, D = 28, H = 16, cx = 7.5, cy = 14, g = new VoxelGrid(W, D, H);
  oct(g, cx, cy, 0, 2, 5.4, 8.4, 1.55, 'p');                                    // hips
  oct(g, cx, cy, 2, 3, 6.2, 9.2, 1.55, 'T');                                    // belt
  g.box(cx + 5.3, cy - 1.5, 2, cx + 6.8, cy + 1.5, 3, 'Y'); g.set(cx + 6, cy, 2, 'y');
  for (const s of [-1, 1]) {                                                    // ammo drum pouches on the hips
    const y = cy + s * 7.6;
    g.cyl(cx + 2.0, y, 1, 5, 2.2, 2.2, 'P', 2.2); g.cyl(cx + 2.0, y, 4, 5, 2.2, 2.2, 'Q', 2.2);
    g.set(cx + 2.0, y, 4, 'y'); g.set(cx + 1, y, 4, 'y'); g.set(cx + 3, y, 4, 'y');
    g.box(cx + 0.4, y - 2.4, 2, cx + 3.6, y + 2.4, 3, 'S');
  }
  for (let z = 3; z < 10; z++) {                                               // octagonal plated torso
    const low = z < 5, hx = 6.0 + 0.35 * (z - 3) * 0.3, hy = 9.0 + 0.25 * (z - 3) * 0.3;
    oct(g, cx, cy, z, z + 1, hx, hy, 1.5, low ? 'a' : 'W');
    if (z >= 5) oct(g, cx + 1.6, cy, z, z + 1, hx - 1.6, hy - 2.6, 1.5, 'W');
  }
  oct(g, cx + 1.8, cy, 9, 10, 4.2, 6.6, 1.5, 'H');                              // chest plate top face
  g.box(cx + 4.8, cy - 0.5, 5, cx + 6.4, cy + 0.5, 10, 'A');                    // hazard centre stripe
  for (let i = 0; i < 4; i++) { g.set(cx + 5.5 - i * 0.2, cy - 3.5 + i * 2.2, 9, 'y'); }  // rivets along the plate
  g.box(0, cy - 5.4, 3, 3, cy + 5.4, 10, 'k'); g.box(0, cy - 5.4, 9, 3, cy + 5.4, 10, 'K');   // ammo box on the back
  g.box(0, cy - 0.5, 4, 1, cy + 0.5, 9, 'A'); g.set(1, cy - 3, 9, 'y'); g.set(1, cy + 3, 9, 'y');
  for (const s of [-1, 1]) {                                                    // shoulder yoke + big layered pauldrons
    const y = cy + s * 10.3;
    g.ellipsoid(cx + 0.3, y, 7.0, 3.9, 3.4, 1.3, 'a', 2.6);
    g.ellipsoid(cx + 0.3, y, 8.6, 3.9, 3.5, 2.4, 'W', 2.6);
    g.ellipsoid(cx + 0.3, y, 10.2, 3.1, 2.7, 1.2, 'H', 2.6);
    g.box(cx + 1.8, y - 2.6, 10, cx + 2.8, y + 2.6, 11, 'A');                   // hazard band across the pad
    g.set(cx - 1.5, y, 11, 'y'); g.set(cx - 1.5, y + s * 1.2, 11, 'y');
  }
  g.cyl(cx, cy, 9, 13, 4.6, 5.2, 'a', 2.6);                                     // gorget ring
  g.cyl(cx, cy, 11, 13, 4.2, 4.8, 'W', 2.6);
  g.cyl(cx + 0.3, cy, 12, 14, 2.6, 2.8, 'n');
  if (elite) {
    oct(g, cx + 2.4, cy, 10, 11, 3.2, 5.0, 1.5, 'A');                           // gold chest crest
    g.box(cx + 4, cy - 3.5, 10, cx + 5, cy + 3.5, 11, 'a');
    for (const s of [-1, 1]) { const y = cy + s * 10.3; for (let k = 0; k < 4; k++) g.cyl(cx + 0.3, y, 11 + k, 12 + k, 1.6 - k * 0.38, 1.6 - k * 0.38, 'A', 2.2); }   // pauldron spikes
    g.cyl(1.2, cy, 10, 16, 1.0, 1.0, 'M');                                      // banner pole socket
  }
  return {id: `${spec.id}.torso2`, unit: U, layerH: U, pivot: {x: cx, y: cy}, palette: pal(spec.c), grid: g, buckets: 48};
}
function wardenHead(spec, elite) {
  const g = new VoxelGrid(14, 14, 12), cx = 6.6, cy = 7;
  g.cyl(cx, cy, 0, 3, 2.4, 2.4, 'a');
  g.ellipsoid(cx - 0.2, cy, 5.0, 5.2, 5.4, 4.6, 'h', 2.3);                      // helmet shell
  g.ellipsoid(cx + 2.3, cy, 2.6, 3.3, 4.2, 2.3, 'W', 2.6);                      // chin / face guard
  g.ellipsoid(cx - 1.4, cy, 8.9, 3.4, 0.9, 1.2, 'H', 2.4);                      // crest ridge
  g.ellipsoid(cx - 1.4, cy, 8.2, 3.6, 1.6, 0.8, 'W', 2.4);
  for (const s of [-1, 1]) { g.ellipsoid(cx - 0.4, cy + s * 5.1, 3.6, 2.6, 1.1, 2.2, 'a', 2.4); g.set(cx + 0.6, cy + s * 5.9, 3, 'y'); }   // cheek plates
  // visor slit: a dark band with a faint glowing line, on the front slope so it reads from above
  for (let y = 2; y <= 11; y++) {
    const r = Math.abs(y - 6.5);
    for (const z of [5, 4, 3]) {
      let x = frontmost(g, y, z, '*');
      if (x < 0) continue;
      if (z === 5) g.set(x, y, z, r < 4.2 ? 'D' : 'h');
      else if (z === 4) g.set(x, y, z, r < 3.6 ? 'L' : 'D');
      else g.set(x, y, z, 'D');
    }
  }
  g.set(cx + 4, cy, 10, 'y');
  if (elite) { g.ellipsoid(cx - 1.4, cy, 10.2, 2.6, 0.7, 0.9, 'A', 2.4); g.box(cx - 5, cy - 5.4, 5, cx - 3, cy + 5.4, 6, 'A'); g.set(cx + 3, cy, 8, 'A'); g.set(cx + 2, cy, 9, 'A'); }
  return {id: `${spec.id}.head2`, unit: U, layerH: U, pivot: {x: cx, y: cy}, palette: pal(spec.c), grid: g, buckets: 48};
}

// ---------------------------------------------------------------- MARKSMAN
function sniperLeg(spec) {
  const g = new VoxelGrid(12, 6, 10), cy = 3;
  g.ellipsoid(6.4, cy, 0.5, 5.0, 2.5, 0.6, 's', 3);
  g.ellipsoid(6.2, cy, 1.5, 4.6, 2.3, 0.8, 'b', 3);
  g.ellipsoid(9.4, cy, 1.4, 1.6, 2.0, 0.6, 'B', 3);
  g.cyl(5, cy, 2, 5, 2.0, 2.2, 'b', 2.4);
  for (let z = 3; z < 6; z += 2) g.cyl(5, cy, z, z + 1, 2.3, 2.4, 'S', 2.4);       // boot wraps
  g.cyl(5, cy, 5, 10, 1.9, 2.1, 'p', 2.4);                                     // slim trouser leg
  g.ellipsoid(6.2, cy, 7, 1.6, 2.0, 0.8, 'q', 2.6);                            // knee pad
  return {id: `${spec.id}.leg2`, unit: U, layerH: U, pivot: {x: 5.5, y: cy}, palette: pal(spec.c), grid: g, buckets: 32};
}
function sniperTorso(spec, elite) {
  const W = 15, D = 24, H = 14, cx = 7.5, cy = 12, g = new VoxelGrid(W, D, H);
  g.ellipsoid(cx, cy, 1.0, 4.8, 6.6, 1.0, 'p', 3);
  g.ellipsoid(cx, cy, 2.4, 5.0, 7.0, 0.55, 'T', 3.2);
  g.box(cx + 4.2, cy - 1, 2, cx + 5.6, cy + 1, 3, 'Y');
  // long coat: the skirt flares out behind and below the belt
  for (let z = 0; z < 4; z++) g.ellipsoid(cx - 1.6, cy, z + 0.5, 5.4 + (3 - z) * 0.25, 7.6 + (3 - z) * 0.4, 0.5, z < 2 ? 'k' : 'c', 2.6);
  for (let z = 3; z < 10; z++) {
    const t = (z - 3) / 6, rx = 4.9 + 0.4 * t, ry = 6.7 + 1.0 * t;
    g.ellipsoid(cx, cy, z + 0.5, rx, ry, 0.56, 'c', 3);
    g.ellipsoid(cx, cy, z + 0.5, rx - 0.2, ry - 1.5, 0.56, 'V', 3);
  }
  g.ellipsoid(cx + 3.4, cy, 7.4, 2.0, 4.0, 2.0, 'V', 3);                          // chest rig
  for (let i = 0; i < 20; i++) { const u = i / 19, y = cy + 5.2 - u * 10.4, z = 9 - u * 5; g.set(cx + 3.2 - u * 0.4, y, z, 'S'); g.set(cx + 4.2 - u * 0.4, y, z, 'S'); if (i % 3 === 1) g.set(cx + 4.8 - u * 0.4, y, z, 'y'); }  // cartridge bandolier
  for (const s of [-1, 1]) { g.box(cx + 3.2, cy + s * 4.5 - 1.2, 3, cx + 5.4, cy + s * 4.5 + 1.2, 5, 'P'); g.box(cx + 3.2, cy + s * 4.5 - 1.2, 5, cx + 5.4, cy + s * 4.5 + 1.2, 6, 'Q'); }
  // cloak mantle over the shoulders (the arms sit wider than a slim body, so the cape closes the gap)
  for (const s of [-1, 1]) {
    const y = cy + s * 9.6;
    g.ellipsoid(cx + 0.3, y, 8.6, 3.2, 2.7, 2.4, 'c', 2.4);
    g.ellipsoid(cx + 0.3, y, 9.8, 2.5, 2.0, 1.1, 'W', 2.4);
    g.ellipsoid(cx - 0.6, cy + s * 7.4, 8.9, 3.6, 2.8, 1.8, 'c', 2.4);
  }
  // ghillie tufts stitched on the mantle and back (static; the long strips are separate swaying parts)
  for (let i = 0; i < 26; i++) { const a = i * 2.4, x = cx - 2.5 - (i % 5) * 0.7, y = cy + Math.sin(a) * 8; g.set(x, y, 10 + (i % 3), i % 3 ? 'W' : 'H'); }
  // bedroll + quiver tube on the back
  g.ellipsoid(2.2, cy, 7.4, 2.4, 6.8, 2.2, 'K', 2.6);
  g.cyl(2.6, cy - 3, 9, 11, 1.5, 1.5, 'k'); g.set(2, cy - 3, 11, 'M');
  g.box(1, cy - 6.5, 6, 2, cy - 5, 9, 'S'); g.box(1, cy + 5, 6, 2, cy + 6.5, 9, 'S');
  // scarf + collar
  g.cyl(cx, cy, 9, 12, 3.8, 4.4, 'A', 2.6); g.cyl(cx, cy, 11, 13, 3.4, 3.8, 'a', 2.6);
  g.cyl(cx + 0.4, cy, 12, 14, 2.4, 2.4, 'n');
  g.box(cx - 3, cy + 3, 9, cx - 1, cy + 4.4, 12, 'A');                          // scarf tail
  if (elite) {
    for (const s of [-1, 1]) { g.ellipsoid(cx + 0.3, cy + s * 9.6, 10.9, 2.0, 1.6, 0.8, 'A', 2.4); g.set(cx + 3, cy + s * 9.6, 11, 'y'); }
    g.cyl(1.4, cy + 4, 9, 14, 0.9, 0.9, 'M');                                    // pennant socket
    g.box(cx + 3, cy - 0.5, 9, cx + 6, cy + 0.5, 10, 'A'); g.box(cx + 4, cy - 1.5, 3, cx + 6, cy + 1.5, 4, 'A');
  }
  return {id: `${spec.id}.torso2`, unit: U, layerH: U, pivot: {x: cx, y: cy}, palette: pal(spec.c), grid: g, buckets: 48};
}
function sniperHead(spec, elite) {
  const g = new VoxelGrid(16, 14, 12), cx = 7.2, cy = 7;
  g.cyl(cx, cy, 0, 3, 2.2, 2.2, 'A');
  g.ellipsoid(cx + 0.6, cy, 3.4, 3.6, 3.8, 2.4, 'N');                           // shadowed face
  g.ellipsoid(cx - 0.8, cy, 5.2, 5.4, 5.6, 4.6, 'c', 2.3);                      // the hood
  g.ellipsoid(cx - 4.4, cy, 4.0, 3.6, 3.4, 3.2, 'c', 2.6);                      // hood peak draping behind
  g.ellipsoid(cx - 6.4, cy, 2.8, 2.0, 2.0, 2.0, 'W', 2.6);                      // hanging tip
  g.ellipsoid(cx + 4.0, cy, 4.2, 2.4, 3.2, 2.4, 'D', 2.4);                      // dark face opening, front
  g.ellipsoid(cx + 1.6, cy, 7.8, 3.0, 3.2, 1.2, 'W', 2.4);                      // lighter ridge on top
  for (let i = 0; i < 18; i++) { const a = i * 2.3; g.set(cx - 2 + Math.cos(a) * 3.6, cy + Math.sin(a) * 4.2, 8 + (i % 2), i % 2 ? 'H' : 'W'); }   // ghillie flecks
  // the single scope-eye lens, on the front slope of the hood opening so it reads from above
  for (const [y, z, ch] of [[6, 5, 'L'], [7, 5, 'L'], [6, 4, 'L'], [7, 4, 'L'], [6, 6, 'l']]) { const x = frontmost(g, y, z, '*'); if (x >= 0) g.set(x, y, z, ch); }
  for (const y of [5, 8]) for (const z of [4, 5]) { const x = frontmost(g, y, z, '*'); if (x >= 0) g.set(x, y, z, 'D'); }
  if (elite) { for (const [y, z] of [[5, 5], [8, 5], [5, 6], [8, 6], [6, 7], [7, 7]]) { const x = frontmost(g, y, z, '*'); if (x >= 0) g.set(x, y, z, 'A'); } g.ellipsoid(cx - 0.8, cy, 9.4, 2.6, 0.7, 0.8, 'A', 2.4); }
  return {id: `${spec.id}.head2`, unit: U, layerH: U, pivot: {x: cx, y: cy}, palette: pal(spec.c), grid: g, buckets: 48};
}
function sniperArm(spec) {
  const g = new VoxelGrid(8, 4, 3);
  g.rod(0, 8, 2, 1.5, 1.5, 1.3, 'c', 2.4);
  for (let x = 5; x < 8; x += 1) g.cyl(x + 0.5, 2, 0, 3, 0.8, 1.7, x % 2 ? 'A' : 'S', 2.2);   // bandage wraps on the forearm
  g.rod(5, 8, 2, 1.5, 1.7, 1.4, 'S', 2.4);
  for (let x = 5; x < 8; x += 2) g.cyl(x + 0.5, 2, 0, 3, 0.7, 1.8, 'W', 2.2);
  g.ellipsoid(3.6, 2, 2.4, 1.3, 1.3, 0.6, 'q', 2.6);
  return {id: `${spec.id}.arm2`, unit: U, layerH: U, pivot: {x: 0.5, y: 2}, palette: pal(spec.c), grid: g, buckets: 48};
}
function ghillieStrip(spec) {
  const g = new VoxelGrid(14, 3, 2);
  for (let x = 0; x < 14; x++) { g.set(x, 1, 0, x % 3 === 2 ? 'W' : 'c'); g.set(x, 1, 1, x % 4 === 1 ? 'H' : x % 4 === 3 ? 'W' : 'c'); if (x > 3 && x < 13 && x % 3 === 1) g.set(x, x % 2 ? 0 : 2, 0, x % 2 ? 'W' : 'H'); }
  g.set(0, 1, 0, 'S'); g.set(1, 1, 0, 'S');
  return {id: `${spec.id}.strip`, unit: 0.7, layerH: 0.7, pivot: {x: 0.5, y: 1.5}, palette: pal(spec.c), grid: g, buckets: 32};
}

// ---------------------------------------------------------------- RIOT
function riotLeg(spec) {
  const g = new VoxelGrid(12, 7, 10), cy = 3.5;
  g.ellipsoid(6.4, cy, 0.5, 5.4, 3.2, 0.6, 's', 3);
  g.ellipsoid(6.2, cy, 1.6, 5.0, 3.0, 0.9, 'b', 3);
  g.ellipsoid(9.8, cy, 1.5, 1.6, 2.6, 0.7, 'B', 3);
  g.cyl(5, cy, 2, 5, 2.6, 2.8, 'b', 2.4);
  g.cyl(5.2, cy, 5, 8, 2.6, 2.8, 'p', 2.5);
  g.ellipsoid(6.6, cy, 7.2, 3.2, 3.2, 1.6, 'W', 3);                             // big knee guard
  g.ellipsoid(7.4, cy, 8.5, 2.0, 2.2, 0.6, 'H', 3);
  g.box(7.2, cy - 2.4, 5, 8.4, cy + 2.4, 6, 'A');                               // shin stripe
  g.cyl(5, cy, 8, 10, 2.8, 3.0, 'p', 2.4);
  return {id: `${spec.id}.leg2`, unit: U, layerH: U, pivot: {x: 5.5, y: cy}, palette: pal(spec.c), grid: g, buckets: 32};
}
const FONT = {R: ['11.', '1.1', '11.', '1.1', '1.1'], I: ['111', '.1.', '.1.', '.1.', '111'], O: ['111', '1.1', '1.1', '1.1', '111'], T: ['111', '.1.', '.1.', '.1.', '.1.']};
/** Stamps a word in 3x5 cells onto the grid; fn(i, j, col) gets the cell (i along the word, j down the letter). */
function stencil(word, fn) { let o = 0; for (const ch of word) { const f = FONT[ch]; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (f[j][i] === '1') fn(o + i, j); o += 4; } return o - 1; }
function riotTorso(spec, elite) {
  const W = 16, D = 28, H = 15, cx = 8, cy = 14, g = new VoxelGrid(W, D, H);
  oct(g, cx, cy, 0, 2, 6.0, 8.6, 1.8, 'p');
  oct(g, cx, cy, 2, 3, 6.6, 9.4, 1.8, 'T');
  g.box(cx + 5.4, cy - 1.5, 2, cx + 7, cy + 1.5, 3, 'Y');
  for (const s of [-1, 1]) {                                                    // cuffs, radio, mag pouch on the belt
    g.box(cx + 1, cy + s * 6.2 - 1.6, 2, cx + 5, cy + s * 6.2 + 1.6, 4, 'P'); g.set(cx + 5, cy + s * 6.2, 3, 'y');
  }
  g.box(cx - 3, cy + 7.6, 1, cx, cy + 9.6, 6, 'm'); g.set(cx - 2, cy + 8.6, 6, 'E');
  for (let z = 3; z < 10; z++) oct(g, cx, cy, z, z + 1, 6.7, 9.6, 1.8, z < 5 ? 'V' : 'W');    // square torso
  oct(g, cx + 1.6, cy, 7, 10, 4.4, 7.4, 1.7, 'V', false);
  oct(g, cx + 1.6, cy, 9, 10, 4.2, 7.0, 1.7, 'H');
  g.box(cx + 5.2, cy - 5.5, 5, cx + 6.6, cy + 5.5, 6, 'A');                      // hazard stripe across the chest
  // back plate with RIOT stencil lying on the top of the back (reads when it faces away)
  g.box(0, cy - 6.8, 3, 3, cy + 6.8, 10, 'k');
  g.box(0, cy - 6.8, 9, 3, cy + 6.8, 10, 'a');
  { const w = stencil('RIOT', () => {}); const y0 = Math.round(cy - w / 2); stencil('RIOT', (i, j) => g.set(1 + (4 - j), y0 + i, 9, 'A')); }
  for (const s of [-1, 1]) {                                                    // padded shoulder / bicep guards
    const y = cy + s * 10.4;
    g.ellipsoid(cx + 0.2, y, 8.0, 3.8, 3.4, 2.8, 'a', 2.4);
    g.ellipsoid(cx + 0.2, y, 9.6, 3.2, 2.8, 1.5, 'W', 2.4);
    g.box(cx + 1.4, y - 2.4, 10, cx + 2.6, y + 2.4, 11, 'A');
  }
  g.cyl(cx, cy, 9, 12, 4.2, 4.6, 'V', 2.6);                                       // collar
  g.cyl(cx + 0.3, cy, 11, 14, 2.6, 2.8, 'n');
  if (elite) {
    oct(g, cx + 2, cy, 10, 11, 3.6, 5.8, 1.6, 'A');
    for (const s of [-1, 1]) { const y = cy + s * 10.4; g.box(cx - 1, y - 3, 10.5, cx + 3, y + 3, 11.5, 'A'); g.set(cx + 3, y, 11, 'y'); }
    g.cyl(1.4, cy, 10, 15, 1.0, 1.0, 'M');
    g.box(cx + 4, cy - 6, 7, cx + 5.5, cy + 6, 8, 'A');
  }
  return {id: `${spec.id}.torso2`, unit: U, layerH: U, pivot: {x: cx, y: cy}, palette: pal(spec.c), grid: g, buckets: 48};
}
function riotHead(spec, elite) {
  const g = new VoxelGrid(15, 14, 12), cx = 6.8, cy = 7;
  g.cyl(cx, cy, 0, 3, 2.4, 2.4, 'n');
  g.ellipsoid(cx + 0.8, cy, 3.4, 3.4, 3.6, 2.4, 'n');                           // the face, seen through the shield
  g.ellipsoid(cx - 0.6, cy, 5.2, 5.2, 5.4, 4.6, 'h', 2.2);                      // helmet shell
  g.ellipsoid(cx - 1.6, cy, 9.0, 3.0, 2.6, 1.0, 'H', 2.4);
  g.box(cx - 2, cy - 0.7, 9, cx + 4.5, cy + 0.7, 10, 'A');                        // stripe along the crown
  for (const s of [-1, 1]) g.ellipsoid(cx - 0.8, cy + s * 5.2, 3.4, 2.0, 1.2, 2.2, 'a', 2.4);
  g.ellipsoid(cx + 4.4, cy, 4.0, 2.5, 4.9, 3.0, 'Z', 2.6);                      // clear face shield, wrapping around the front
  g.ellipsoid(cx + 3.6, cy, 3.4, 2.2, 4.2, 2.4, 'n', 2.6);                      // face visible inside it
  g.topCoat('Z', 'z');
  for (let y = 2; y <= 11; y++) { const x = frontmost(g, y, 6, 'Z'); if (x >= 0 && (y % 3 === 0)) g.set(x, y, 6, 'Z'); }
  g.box(cx + 4, cy - 5, 7, cx + 6, cy + 5, 8, 'a');                                // shield hinge band
  g.set(cx + 6, cy - 2, 5, 'D'); g.set(cx + 6, cy + 2, 5, 'D');
  if (elite) { g.ellipsoid(cx - 1.6, cy, 10.2, 2.0, 2.2, 0.8, 'A', 2.4); g.box(cx - 5.5, cy - 5.4, 5, cx - 3.5, cy + 5.4, 6, 'A'); }
  return {id: `${spec.id}.head2`, unit: U, layerH: U, pivot: {x: cx, y: cy}, palette: pal(spec.c), grid: g, buckets: 48};
}

// ---------------------------------------------------------------- kits
const kits = new Map();
/** The cached part kit: the shared humanoid kit (arms, gloves) with this type's torso / head / legs swapped in. */
export function heavyKit(type, elite = false) {
  const key = type + (elite ? '+' : '');
  let k = kits.get(key);
  if (!k) {
    const spec = heavySpec(type, elite), base = humanoidKit(spec);
    const fn = {guard: [wardenLeg, wardenTorso, wardenHead], sniper: [sniperLeg, sniperTorso, sniperHead], riot: [riotLeg, riotTorso, riotHead]}[type];
    k = {...base, type, elite, leg: fn[0](spec), torso: fn[1](spec, elite), head: fn[2](spec, elite)};
    if (type === 'sniper') { k.arm = sniperArm(spec); k.strip = ghillieStrip(spec); }
    kits.set(key, k);
  }
  return k;
}

// ---------------------------------------------------------------- guns with separate moving parts
// Model x = 0 is the gun origin (the rig's `reach` ahead of the body); the muzzle ends exactly at +L like gunStack's.
const GUN_DESC = {
  guard: {category: 'SHOTGUN', visual: {length: 27, width: 8.2, art: 'SHOTGUN'}, color: 0x58aeca},
  sniper: {category: 'SNIPER', visual: {length: 52, width: 5.2, art: 'SNIPER'}, color: 0x4fd0c4},
};
const GUN_L = {guard: 27 * 0.7, sniper: 52 * 0.7};
const gunCache = new Map();
function gunPal(elite, accent) {
  return {b: '#3c3844', a: '#585165', m: '#aeacb6', k: '#555a63', x: '#2b2a33', o: '#17171d', w: '#6a4a34', A: accent, y: '#d3ac55', E: {c: '#ff5a4a', emit: true}, L: {c: '#7fe0ff', emit: true}, l: {c: '#ffffff', emit: true}, t: {c: '#fff', emit: true}};
}
export function heavyGun(type, elite = false) {
  const key = type + (elite ? '+' : '');
  let m = gunCache.get(key);
  if (m) return m;
  const u = GUN_UNIT, L = GUN_L[type], Lc = Math.round(L / u), padC = Math.ceil(0.24 * Lc) + 2, d = 15, h = 10, cy = d / 2, Z0 = 2;
  const g = new VoxelGrid(padC + Lc + 3, d, h), xf = (f) => padC + f * Lc;
  const accent = elite ? '#ffb43a' : type === 'guard' ? '#58aeca' : '#4fd0c4', pal2 = gunPal(elite, accent);
  const id = `heavygun.${key}`;
  let aux = null;
  if (type === 'guard') {
    g.ellipsoid((xf(0.0) + xf(0.34)) / 2, cy, Z0 + 2.5, (xf(0.34) - xf(0.0)) / 2, 2.5, 2.5, 'b', 3.4);       // receiver
    g.ellipsoid((xf(-0.26) + xf(0.06)) / 2, cy, Z0 + 2.2, (xf(0.06) - xf(-0.26)) / 2, 1.9, 2.1, 'x', 3);      // stock
    g.box(xf(-0.26), cy - 1.7, Z0 + 0.4, xf(-0.26) + 1.2, cy + 1.7, Z0 + 3.9, 'A');                          // butt pad
    for (const s of [-1, 1]) { g.rod(xf(0.34), xf(1), cy + s * 1.4, Z0 + 2.4, 1.3, 1.3, 'm', 2.2); }          // twin barrels
    g.rod(xf(0.34), xf(0.9), cy, Z0 + 0.7, 1.0, 0.9, 'k', 2.2);                                              // magazine tube
    g.box(xf(0.4), cy - 0.6, Z0 + 3.6, xf(0.92), cy + 0.6, Z0 + 4.6, 'k');                                   // heat rib
    g.box(xf(1) - 1.5, cy - 2.4, Z0 + 1.2, xf(1), cy + 2.4, Z0 + 3.6, 'k');                                  // muzzle band
    for (const s of [-1, 1]) g.set(xf(1) - 1, cy + s * 1.4, Z0 + 2, 'o');
    g.set(xf(1) - 2, cy, Z0 + 4, 'y');                                                                        // bead sight
    g.box(xf(0.1), cy - 0.6, Z0 + 5, xf(0.3), cy + 0.6, Z0 + 6, 'A');                                         // accent stripe
    for (let i = 0; i < 4; i++) { g.set(xf(0.06) + i * 1.3, cy - 2.3, Z0 + 5, i % 2 ? 'y' : 'E'); g.set(xf(0.06) + i * 1.3, cy - 2.3, Z0 + 4, 'E'); }   // loaded shells in a saddle
    for (let z = 0; z < Z0 + 1; z++) g.ellipsoid(xf(0.12) - (Z0 - z) * 0.5 + 1, cy, z + 0.5, 1.6, 1.8, 0.5, 'x', 2.4);   // pistol grip
    g.rod(xf(0.18), xf(0.26), cy, 1.2, 0.8, 0.6, 'k');
    g.topCoat('b', 'a');
    // the pump slide is its own part (rides back and forth on the barrel pair)
    const pg = new VoxelGrid(13, 7, 5);
    pg.ellipsoid(6.5, 3.5, 2.2, 6.4, 3.2, 2.0, 'x', 3);
    for (let i = 1; i < 12; i += 2) pg.box(i, 0, 1, i + 1, 7, 3, 'k');
    pg.box(0, 2, 3, 13, 5, 4, 'w');
    pg.topCoat('x', 'A');
    aux = {id: id + '.pump', unit: u, layerH: u, pivot: {x: 0, y: 3.5}, palette: pal2, grid: pg, buckets: 64};
  } else {
    g.ellipsoid((xf(0.02) + xf(0.3)) / 2, cy, Z0 + 2.5, (xf(0.3) - xf(0.02)) / 2, 2.1, 2.4, 'b', 3.4);        // receiver
    g.ellipsoid((xf(-0.2) + xf(0.06)) / 2, cy, Z0 + 2.4, (xf(0.06) - xf(-0.2)) / 2, 1.9, 2.4, 'w', 3);        // wooden stock
    g.ellipsoid(xf(-0.1), cy, Z0 + 4.4, 3.4, 1.6, 1.0, 'x', 3);                                              // cheek rest
    g.box(xf(-0.2), cy - 1.8, Z0 + 0.4, xf(-0.2) + 1.2, cy + 1.8, Z0 + 4.4, 'A');
    g.rod(xf(0.3), xf(1), cy, Z0 + 2.4, 0.95, 0.95, 'm', 2.2);                                               // long barrel
    g.ellipsoid((xf(0.3) + xf(0.64)) / 2, cy, Z0 + 2.4, (xf(0.64) - xf(0.3)) / 2, 1.8, 1.7, 'a', 2.6);       // handguard
    g.box(xf(1) - 3, cy - 1.4, Z0 + 1.0, xf(1), cy + 1.4, Z0 + 3.8, 'k');                                    // muzzle brake
    g.set(xf(1) - 2, cy - 1.5, Z0 + 2, 'o'); g.set(xf(1) - 2, cy + 1.5, Z0 + 2, 'o'); g.set(xf(1) - 1, cy, Z0 + 2, 'o');
    // scope: tube, bell, rings, turrets, emissive lens
    const s0 = xf(0.1), s1 = xf(0.5);
    g.ellipsoid((s0 + s1) / 2, cy, Z0 + 6.2, (s1 - s0) / 2, 1.5, 1.5, 'o', 2.2);
    g.ellipsoid(s1 - 2, cy, Z0 + 6.2, 2.4, 2.0, 2.0, 'o', 2.2);
    g.box(s0 + 3, cy - 0.7, Z0 + 4.4, s0 + 4.5, cy + 0.7, Z0 + 5.6, 'k'); g.box(s1 - 5, cy - 0.7, Z0 + 4.4, s1 - 3.5, cy + 0.7, Z0 + 5.6, 'k');
    g.set(s0 + 8, cy, Z0 + 8, 'k'); g.set(s0 + 8, cy + 2, Z0 + 6, 'k');
    g.set(s1 - 0.5, cy, Z0 + 7, 'L'); g.set(s1 - 0.5, cy - 1, Z0 + 7, 'L'); g.set(s1 - 0.5, cy + 1, Z0 + 7, 'L'); g.set(s1 - 1.5, cy, Z0 + 8, 'l');   // front lens (top slope)
    g.set(s0 - 0.5, cy, Z0 + 7, 'L'); g.set(s0 - 0.5, cy, Z0 + 6, 'l');                                      // eyepiece
    g.set(xf(1) - 2, cy, Z0 + 4, 'y');
    g.box(xf(0.1), cy - 0.6, Z0 + 4.4, xf(0.5), cy + 0.6, Z0 + 4.8, 'A');
    // bipod, folded forward under the handguard
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) g.set(xf(0.58) + i, cy + s * 2.2, 1 - (i > 4 ? 0 : 0), 'k');
    g.box(xf(0.58) - 1, cy - 2.6, 1, xf(0.58), cy + 2.6, 2, 'k');
    for (let z = 0; z < Z0 + 1; z++) g.ellipsoid(xf(0.14) - (Z0 - z) * 0.5 + 1, cy, z + 0.5, 1.5, 1.6, 0.5, 'x', 2.4);   // grip
    g.topCoat('b', 'a');
    // bolt handle + body as its own part: cycles after every shot
    const bg = new VoxelGrid(9, 6, 4);
    bg.rod(0, 7, 3, 1.2, 1.1, 1.1, 'm', 2.2);
    bg.box(6, 3, 1, 8, 6, 2, 'm'); bg.ellipsoid(8, 5, 1.5, 1.2, 1.2, 1.2, 'y', 2);
    aux = {id: id + '.bolt', unit: u, layerH: u, pivot: {x: 0, y: 3}, palette: pal2, grid: bg, buckets: 64};
  }
  m = {key, L, body: {id, unit: u, layerH: u, pivot: {x: padC, y: cy}, palette: pal2, grid: g, buckets: 64}, aux, auxX: type === 'guard' ? 0.5 * Lc * u : 0.24 * Lc * u, auxZ: type === 'guard' ? 0.9 : 2.7 * u};
  // grip data (class, trigger / support / bolt points) comes from GUN_ART via gunGeometry; the pump is animated here, so the rig's own rack is off
  m.geo = {...gunGeometry(GUN_DESC[type]), pump: false};
  gunCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------- riot gear: baton + shield
export function riotBaton(elite = false) {
  const key = 'riot.baton' + (elite ? '+' : '');
  let m = gunCache.get(key);
  if (m) return m;
  const u = GUN_UNIT, Lc = 24, padC = 7, g = new VoxelGrid(padC + Lc + 2, 7, 6), cy = 3.5;
  g.rod(padC - 6, padC + Lc, cy, 2.4, 1.3, 1.3, 'x', 2.2);
  g.rod(padC - 6, padC - 1, cy, 2.4, 1.5, 1.5, 'S', 2.2);                           // rubber grip
  g.box(padC - 1, cy - 2.2, 1, padC, cy + 2.2, 4, 'k');                             // side-handle guard
  g.rod(padC + Lc - 7, padC + Lc - 2, cy, 2.4, 1.5, 1.5, elite ? 'A' : 'y', 2.2);   // reflective band
  g.rod(padC + Lc - 1, padC + Lc + 1, cy, 2.4, 1.7, 1.7, 'k', 2.2);
  g.topCoat('x', 'a');
  const L = (Lc - 0) * u;
  m = {key, L, body: {id: 'heavygun.' + key, unit: u, layerH: u, pivot: {x: padC, y: cy}, palette: {x: '#2b2530', a: '#4b4358', S: '#15131a', k: '#555a63', y: '#ffd36e', A: '#ff8a3a'}, grid: g, buckets: 48}, aux: null};
  m.geo = {L, rear: 1.2, front: 4, cls: 'pistol', trig: {x: 1.2, y: 0}, sup: {x: 4, y: 0}, mag: {x: 3, y: 0}, bolt: {x: 3, y: 0.5}, pump: false};
  gunCache.set(key, m);
  return m;
}

const shields = new Map();
const CRACKS = [
  [],
  [[8, 12, 0, -1], [9, 11, 1, -1], [10, 10, 1, -1]],
  [[8, 12, 0, -1], [9, 11, 1, -1], [10, 10, 1, -1], [14, 13, -1, 0], [15, 12, -1, 1], [16, 11, -1, 1], [17, 11, -1, 1]],
  [[8, 12, 0, -1], [9, 11, 1, -1], [10, 10, 1, -1], [14, 13, -1, 0], [15, 12, -1, 1], [16, 11, -1, 1], [17, 11, -1, 1], [7, 6, 1, 1], [8, 7, 1, 1], [9, 8, 1, 1], [10, 9, 1, 1], [11, 10, 1, 1], [12, 5, -1, -1], [12, 4, -1, 0], [12, 3, -1, 0]],
];
/** The riot shield: a framed polycarbonate slab (curved), viewport slot, scuffs, RIOT stencil. `crack` 0..3 adds cracks. Upright: x = front. */
export function riotShield(crack = 0, elite = false) {
  const key = `${crack}${elite ? '+' : ''}`;
  let m = shields.get(key);
  if (m) return m;
  const W = 8, D = 24, H = 21, cy = 12, g = new VoxelGrid(W, D, H);
  const curve = (y) => Math.round(((y + 0.5 - cy) / 12) ** 2 * 2.6);       // edges sweep back
  for (let y = 1; y < D - 1; y++) {
    const x0 = 4 - curve(y), edge = y < 2 || y > D - 3;
    for (let z = 0; z < H; z++) {
      const rim = z < 1 || z > H - 2 || edge;
      for (let t = 0; t < 2; t++) g.set(x0 + t, y, z, rim ? 'F' : 'P');
    }
  }
  const front = (y) => 5 - curve(y);
  // viewport slot
  for (let y = 7; y < 17; y++) for (let z = 15; z < 18; z++) { g.set(front(y) - 1, y, z, 'V'); g.set(front(y), y, z, 'V'); }
  for (let y = 7; y < 17; y++) { g.set(front(y), y, 18, 'F'); g.set(front(y), y, 14, 'F'); }
  g.set(front(9), 9, 16, 'G'); g.set(front(10), 10, 17, 'G');
  // RIOT stencil (3x5 letters) across the lower half
  { const w = stencil('RIOT', () => {}), y0 = Math.round(cy - w / 2); stencil('RIOT', (i, j) => { const yy = y0 + w - 1 - i; g.set(front(yy), yy, 10 - j, 'S'); }); }
  // hazard chevrons on the bottom rim, a station tag, scuffs
  for (let y = 2; y < D - 2; y++) if ((y >> 1) % 2) g.set(front(y), y, 1, 'A');
  g.box(front(4), 4, 4, front(4) + 1, 6, 6, 'A');
  for (const [y, z] of [[5, 12], [18, 8], [6, 9], [17, 5], [12, 13], [14, 18], [8, 3], [16, 12]]) g.set(front(y) - (y % 2 ? 0 : 0), y, z, 'U');
  // grip handle: behind the slab
  g.box(1, 9, 9, 4, 11, 11, 'k'); g.box(1, 13, 9, 4, 15, 11, 'k'); g.box(1, 9, 10, 2, 15, 11, 'S');
  for (const [y, z, dy, dz] of CRACKS[crack]) { g.set(front(y), y, z, 'C'); if (dy) g.set(front(y + dy), y + dy, z, 'C'); if (dz) g.set(front(y), y, z + dz, 'C'); }
  g.topCoat('F', 'H');
  if (elite) for (let y = 2; y < D - 2; y += 2) { g.set(front(y), y, H - 1, 'A'); g.set(front(y), y, 0, 'A'); }
  const palette = {F: '#56667a', H: '#9fb4c8', P: {c: '#8fb8cf', emit: false}, V: '#17222b', S: '#e8f0f6', A: elite ? '#ff8a3a' : '#ffd36e', U: '#c9dcea', G: {c: '#dff5ff', emit: true}, C: '#1a2630', k: '#2c3038'};
  m = {id: `riot.shield.${key}`, unit: U, layerH: U, pivot: {x: 3, y: cy}, palette, grid: g, buckets: 48};
  shields.set(key, m);
  return m;
}
const shieldsFlat = new Map();
/** The shield lying face-up (dropped): the stencil reads from above. */
export function riotShieldFlat(crack = 0, elite = false) {
  const key = `${crack}${elite ? '+' : ''}`;
  let m = shieldsFlat.get(key);
  if (m) return m;
  const W = 18, D = 24, H = 3, g = new VoxelGrid(W, D, H), cx = 9, cy = 12;
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    const ex = Math.max(0, Math.abs(x + 0.5 - cx) - (cx - 4)), ey = Math.max(0, Math.abs(y + 0.5 - cy) - (cy - 4));
    if (Math.hypot(ex, ey) > 4) continue;
    const rim = x < 1 || x > W - 2 || y < 1 || y > D - 2 || Math.hypot(ex, ey) > 3;
    for (let z = 0; z < 2; z++) g.set(x, y, z, rim ? 'F' : 'P');
  }
  for (let y = 7; y < 17; y++) for (let x = 3; x < 6; x++) g.set(x, y, 1, 'V');                        // viewport slot
  { const w = stencil('RIOT', () => {}), x0 = 7, y0 = Math.round(cy - w / 2); stencil('RIOT', (i, j) => g.set(x0 + j, y0 + w - 1 - i, 1, 'S')); }
  for (let y = 2; y < D - 2; y++) if ((y >> 1) % 2) g.set(W - 2, y, 1, 'A');
  for (const [x, y] of [[12, 5], [14, 18], [8, 3], [10, 20], [5, 14]]) if (g.get(x, y, 1)) g.set(x, y, 1, 'U');
  for (let i = 0; i < crack * 5; i++) { const a = i * 0.9; g.set(cx + Math.cos(a) * (2 + i * 0.5), cy + Math.sin(a) * (2 + i * 0.5), 1, 'C'); }
  g.topCoat('F', 'H');
  const palette = {F: '#56667a', H: '#9fb4c8', P: '#8fb8cf', S: '#e8f0f6', U: '#c9dcea', C: '#1a2630', V: '#17222b', A: elite ? '#ff8a3a' : '#ffd36e'};
  m = {id: `riot.shieldflat.${key}`, unit: U, layerH: U, pivot: {x: cx, y: cy}, palette, grid: g, buckets: 48};
  shieldsFlat.set(key, m);
  return m;
}
