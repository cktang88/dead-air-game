// BRUTE voxel kit: a hunched hulk in a gas mask with a sledgehammer. Cell = BU (0.95) world units, about 1.35x the humanoid kit.
// Parts: leg x2, torso (pauldrons, harness, gas tanks), head (mask, lenses, canister), arm beads (upper / gauntlet), fist, hammer (baked at pitch variants).
import {VoxelGrid} from './stack2d.js';
import {BU, mixc, pitchedGrid} from './creature-models.js';

export const BRUTE_SPEC = {
  id: 'brute', elite: false,
  c: {
    skin: '#9b8296', skinDark: '#6f5a73', cloth: '#4b3d57', leather: '#5d3f36', leatherHi: '#7e5848', plate: '#6f7788', plateHi: '#b3bccd', rust: '#a1593a',
    hazard: '#e0b83c', hazardDark: '#2a2430', mask: '#34383f', lens: '#ff9a3a', lensHi: '#fff0b0', steel: '#8f95a3', wood: '#7a5638', pants: '#3b3441', boot: '#2b2630',
    bootHi: '#4d4556', brass: '#d6b45f', tank: '#7d8a6e', tankHi: '#b2c19a', led: '#ff4a5e',
  },
};
export const ELITE_BRUTE_SPEC = {
  id: 'brute.elite', elite: true,
  c: {
    skin: '#a07a6e', skinDark: '#6e4e48', cloth: '#3a2230', leather: '#4a2a28', leatherHi: '#74423a', plate: '#9a3c26', plateHi: '#f08a58', rust: '#c0552a',
    hazard: '#f2c453', hazardDark: '#2a1418', mask: '#2c2226', lens: '#ff3a2a', lensHi: '#ffd0a0', steel: '#b4a090', wood: '#5e3a28', pants: '#2e222c', boot: '#241a20',
    bootHi: '#4a3238', brass: '#f0c870', tank: '#8a4a3a', tankHi: '#d98a6a', led: '#ff4a5e',
  },
};
function bPal(c) {
  return {
    n: c.skin, N: c.skinDark, c: c.cloth, V: c.leather, v: c.leatherHi, a: c.plate, W: c.plateHi, r: c.rust, Y: c.hazard, y: c.brass, z: c.hazardDark,
    m: c.mask, L: {c: c.lens, emit: true}, l: {c: c.lensHi, emit: true}, s: c.steel, w: c.wood, p: c.pants, b: c.boot, B: c.bootHi, G: c.tank, H: c.tankHi, k: '#2a252e', K: '#4a4452',
    E: {c: c.led, emit: true}, S: '#241d22', T: '#3a2a22', h: mixc(c.plate, '#000000', 0.35),
  };
}

function bootLeg(spec) {
  const g = new VoxelGrid(14, 10, 14), cy = 5;
  g.ellipsoid(7.6, cy, 1.0, 6.2, 4.4, 1.1, 'S', 3);                     // sole
  g.ellipsoid(7.4, cy, 2.6, 5.8, 4.2, 1.7, 'b', 3);                      // boot body
  g.ellipsoid(11.2, cy, 2.4, 2.4, 3.9, 1.5, 'a', 3);                     // steel toe cap
  g.cyl(6, cy, 3, 6, 3.7, 3.9, 'b', 2.6);                                // shaft
  g.cyl(6, cy, 6, 7, 4.0, 4.2, 'B', 2.6);                                // cuff
  g.cyl(6, cy, 7, 9, 3.6, 3.9, 'p', 2.5);                                // shin
  g.box(8.4, 3, 6, 9.6, 7, 10, 'a');                                     // greave plate
  g.ellipsoid(8.2, cy, 10.2, 1.8, 3.5, 1.1, 'W', 2.6);                   // knee cap
  g.cyl(6, cy, 10, 14, 4.2, 4.4, 'p', 2.4);                              // thigh
  g.box(3, 0.6, 11, 9, 1.8, 12.4, 'S'); g.box(3, 8.2, 11, 9, 9.4, 12.4, 'S');   // thigh straps
  for (let x = 4; x < 12; x += 3) { g.set(x, 1, 3, 'y'); g.set(x, 9, 3, 'y'); }  // buckles
  g.topCoat('b', 'B');
  if (spec.elite) { g.ellipsoid(8.2, cy, 10.2, 2.4, 4.0, 1.6, 'W', 2.6); g.set(9, 5, 12, 'k'); g.set(9, 5, 13, 'k'); }
  return g;
}
function bruteTorso(spec) {
  const W = 20, D = 30, H = 20, cx = 9, cy = 15, g = new VoxelGrid(W, D, H);
  g.ellipsoid(cx, cy, 2.4, 6.4, 9.6, 2.4, 'p', 3);                       // pelvis
  g.ellipsoid(cx, cy, 4.0, 7.2, 10.6, 0.9, 'T', 3.2);                    // belt
  g.box(cx + 6.3, cy - 1.6, 3, cx + 8.2, cy + 1.6, 5, 'Y'); g.box(cx + 6.6, cy - 0.8, 3.5, cx + 8.4, cy + 0.8, 4.5, 'k');  // hazard buckle
  for (const s of [-1, 1]) { g.box(cx + 4, cy + s * 6 - 1.8, 3, cx + 7, cy + s * 6 + 1.8, 6, 'V'); g.box(cx + 4, cy + s * 6 - 1.8, 6, cx + 7, cy + s * 6 + 1.8, 7, 'v'); }  // hip pouches
  // body mass: broad gut, barrel chest, heavy hump of trapezius; everything leans forward (the brute is hunched)
  for (let z = 4; z < 12; z++) { const t = (z - 4) / 7; g.ellipsoid(cx + 0.5 + t * 1.6, cy, z + 0.5, 6.8 + 1.1 * t, 10 + 2.2 * t, 0.58, 'c', 3.1); }
  g.ellipsoid(cx + 2.0, cy, 7.0, 6.2, 8.8, 3.6, 'V', 2.9);               // leather vest over the gut
  g.ellipsoid(cx + 2.4, cy, 12.4, 6.2, 11.0, 4.4, 'c', 2.8);              // chest
  g.ellipsoid(cx + 4.4, cy, 11.8, 3.2, 6.4, 3.6, 'V', 2.8);               // vest front
  g.ellipsoid(cx - 0.8, cy, 15.8, 5.4, 8.2, 3.0, 'N', 2.6);              // trapezius hump
  // plates: riveted chest plate with hazard stripes, harness straps
  g.ellipsoid(cx + 6.2, cy, 10.8, 2.0, 5.0, 4.4, 'a', 3.4);
  g.box(cx + 7.6, cy - 4.6, 10, cx + 8.4, cy - 3.6, 14, 'Y'); g.box(cx + 7.6, cy + 3.6, 10, cx + 8.4, cy + 4.6, 14, 'Y');
  for (let i = 0; i < 16; i++) { const u = i / 15, y = cy - 8 + u * 16; for (const z of [16.2 - u * 7, 9.2 + u * 7]) { g.set(cx + 5, y, z, 'S'); g.set(cx + 5, y + 1, z, 'S'); } }
  for (const [y, z] of [[cy - 3, 14], [cy + 3, 14], [cy, 12], [cy - 5, 10.5], [cy + 5, 10.5]]) g.set(cx + 8, y, z, 'y');
  // pauldrons: huge, spiked; two tiers
  for (const s of [-1, 1]) {
    const y = cy + s * 12.2;
    g.ellipsoid(cx + 1.6, y, 13.2, 4.8, 4.0, 3.8, 'a', 2.4);
    g.ellipsoid(cx + 1.4, y, 15.4, 3.6, 3.0, 1.8, 'W', 2.4);
    g.ellipsoid(cx + 1.8, y + s * 1.4, 12.0, 4.4, 4.4, 2.0, 'h', 2.4);
    const sp = spec.elite ? 3 : 2;
    for (let i = 0; i < sp; i++) { const sx = cx + 0.6 + i * 2.2 - (sp - 1), sy = y + s * (i * 0.6 - 0.4); for (let k = 0; k < (spec.elite ? 4 : 3); k++) g.set(sx, sy, 16 + k, k < 2 ? 'W' : 'k'); }
  }
  // back: a pair of gas tanks, strapped
  for (const s of [-1, 1]) { g.cyl(cx - 6.2, cy + s * 3.4, 6, 17, 2.5, 2.5, 'G'); g.cyl(cx - 6.2, cy + s * 3.4, 17, 18, 1.4, 1.4, 'y'); g.cyl(cx - 6.2, cy + s * 3.4, 9, 10, 2.7, 2.7, 'Y'); g.cyl(cx - 6.2, cy + s * 3.4, 12, 13, 2.7, 2.7, 'z'); }
  g.box(cx - 7.6, cy - 6, 8, cx - 6, cy + 6, 9, 'S');
  g.set(cx - 6, cy, 18, 'E'); g.box(cx - 5.4, cy - 1, 16, cx - 3.4, cy + 1, 17, 'k');
  g.cyl(cx + 1, cy, 15, 18, 3.6, 4.0, 'N', 2.6);                          // neck stump
  if (spec.elite) { g.ellipsoid(cx - 8, cy, 12, 1.2, 10, 5, 'r', 3); g.ellipsoid(cx - 8.4, cy, 12, 0.8, 8, 4, 'z', 3); }   // ragged cape
  g.topCoat('c', 'v'); g.topCoat('V', 'v');
  return g;
}
function bruteHead(spec) {
  const g = new VoxelGrid(15, 15, 13), cx = 6.5, cy = 7.5;
  g.cyl(cx - 0.5, cy, 0, 3, 3.2, 3.4, 'N');
  g.ellipsoid(cx, cy, 6.0, 5.4, 5.6, 4.6, 'n', 2.2);                       // skull
  g.ellipsoid(cx - 0.6, cy, 7.2, 5.4, 5.7, 4.2, 'c', 2.4);                  // rubber hood
  g.box(cx - 5, cy - 0.7, 8, cx + 4, cy + 0.7, 12, 'S');                   // head strap seam
  for (const s of [-1, 1]) g.ellipsoid(cx - 0.2, cy + s * 5.4, 5.2, 1.4, 1.2, 1.7, 'm');   // ear cups
  // gas mask: snout, lenses on the top face, canister, hose ports
  g.ellipsoid(cx + 3.6, cy, 4.2, 3.4, 4.4, 3.2, 'm', 2.4);
  for (const s of [-1, 1]) { g.ellipsoid(cx + 3.8, cy + s * 2.6, 6.2, 1.9, 1.9, 1.3, 'L', 2.2); g.set(cx + 3.8, cy + s * 2.6, 7, 'l'); g.set(cx + 4.8, cy + s * 2.6 - s * 0.6, 7, 'l'); }
  g.rod(cx + 6, cx + 10, cy, 3.4, 2.1, 2.1, 'G', 2.2);                       // filter canister
  g.rod(cx + 9, cx + 10.6, cy, 3.4, 2.4, 2.4, 'y', 2.2);
  for (let i = 0; i < 4; i++) g.set(cx + 10, cy - 1 + (i % 2) * 2, 3 + (i >> 1), 'k');
  for (const s of [-1, 1]) { g.rod(cx + 1, cx + 4, cy + s * 4.7, 2.2, 1.0, 1.0, 'k'); g.set(cx + 2, cy + s * 5.6, 2, 'y'); }
  g.ellipsoid(cx + 1.2, cy, 8.6, 3.0, 4.6, 0.8, 'N', 2.6, true);            // heavy brow / scalp scar plate
  if (spec.elite) { for (const s of [-1, 1]) { for (let k = 0; k < 5; k++) g.set(cx - 0.5 - k * 0.2, cy + s * (4.6 + k * 0.5), 9 + k * 0.8, 'W'); } for (let k = 0; k < 3; k++) g.set(cx + 2, cy, 10 + k, 'W'); }
  g.topCoat('m', 'K');
  return g;
}
function bruteArmBead(kind) {
  const g = new VoxelGrid(6, 6, 5);
  if (kind === 'upper') { g.ellipsoid(3, 3, 2.5, 2.9, 2.9, 2.4, 'n', 2.2); g.ellipsoid(3, 3, 3.6, 2.2, 2.3, 1.2, 'n', 2.2); g.set(1, 3, 4, 'N'); }
  else { g.ellipsoid(3, 3, 2.5, 2.9, 2.9, 2.4, 'a', 2.6); g.box(1, 1, 4, 5, 5, 5, 'W'); g.set(0, 3, 2, 'y'); g.set(5, 3, 2, 'y'); }
  return g;
}
function bruteFist() {
  const g = new VoxelGrid(8, 8, 6);
  g.ellipsoid(4, 4, 2.6, 3.4, 3.2, 2.5, 'n', 2.4);
  g.ellipsoid(4.6, 4, 4.6, 2.2, 2.6, 0.9, 'N', 2.4);
  for (const y of [2.2, 3.4, 4.6, 5.8]) g.set(6, y, 2, 'W');                // knuckle plates
  return g;
}

const _hamCache = new Map();
export const HAMMER_PITCHES = [-0.55, -0.25, 0.05, 0.4, 0.75, 1.1, 1.4, 1.57];
export function nearestHammerPitch(p) { let b = 0; for (let i = 1; i < HAMMER_PITCHES.length; i++) if (Math.abs(HAMMER_PITCHES[i] - p) < Math.abs(HAMMER_PITCHES[b] - p)) b = i; return b; }
export const HAMMER_LEN = 28 * BU;
/** The sledgehammer baked at one pitch: {model, pz, grip, len}. pz = grip joint height above the model's layer 0, in world units. */
export function hammerModel(spec, pitch) {
  const key = `${spec.id}.hammer.${Math.round(pitch * 100)}`;
  let m = _hamCache.get(key);
  if (!m) {
    const cells = [], big = spec.elite ? 1.2 : 1, L = 25, hx0 = 21, hl = 10 * big, hw = 5 * big, hh = 4.2 * big;
    for (let a = -3; a < L; a += 0.5) for (let b = -1; b <= 1; b += 0.5) for (let c = -1; c <= 1; c += 0.5) if (b * b + c * c <= 1.3) cells.push([a + 3, b + 6, c + 6, a < 6 ? 'S' : (a < 7 ? 'y' : 'w')]);
    for (let a = hx0 - 1; a < hx0 + hl; a += 0.5) for (let b = -hw; b < hw; b += 0.5) for (let c = -hh; c < hh; c += 0.5) {
      const end = a < hx0 + 0.9 || a > hx0 + hl - 1.1, edge = Math.abs(b) > hw - 0.8 || Math.abs(c) > hh - 0.8;
      const ch = end ? 'W' : (a > hx0 + hl * 0.4 && a < hx0 + hl * 0.6 ? (Math.floor((b + hw) / 1.5) % 2 ? 'Y' : 'z') : (edge ? 'a' : 's'));
      cells.push([a + 3, b + 6, c + 6 + 0, ch]);
    }
    if (spec.elite) for (const b of [-3, 0, 3]) for (let k = 0; k < 4; k++) cells.push([hx0 + hl / 2 + 3, b + 6, hh + 6 + k * 0.5, k < 2 ? 'W' : 'k']);
    for (const [a, b] of [[hx0 + 2, hw], [hx0 + 2, -hw], [hx0 + hl - 2.5, hw], [hx0 + hl - 2.5, -hw]]) cells.push([a + 3, b + 6, 6, 'y']);
    const r = pitchedGrid(cells, pitch, 14);
    // joint = the grip, 8 cells along the shaft (a = 3 + 5) at shaft height c = 6
    const gripA = 8, px = r.pivot.x + gripA * Math.cos(pitch) - 6 * Math.sin(pitch), pz = r.pz + gripA * Math.sin(pitch) + 6 * Math.cos(pitch);
    m = {model: {id: key, unit: BU, layerH: BU, pivot: {x: px, y: r.pivot.y + 6}, palette: bPal(spec.c), grid: r.grid, buckets: 64}, pz: pz * BU, grip: gripA * BU, len: (L + 3) * BU};
    _hamCache.set(key, m);
  }
  return m;
}
const bruteKits = new Map();
/** {leg, torso, head, upper, fore, fist, spec} */
export function bruteKit(spec = BRUTE_SPEC) {
  let k = bruteKits.get(spec.id);
  if (!k) {
    const pal = bPal(spec.c), mk = (id, g, pv, b = 48) => ({id: `${spec.id}.${id}`, unit: BU, layerH: BU, pivot: pv, palette: pal, grid: g, buckets: b});
    k = {
      spec, leg: mk('leg', bootLeg(spec), {x: 6.5, y: 5}, 32), torso: mk('torso', bruteTorso(spec), {x: 9, y: 15}), head: mk('head', bruteHead(spec), {x: 6.5, y: 7.5}),
      upper: mk('upper', bruteArmBead('upper'), {x: 3, y: 3}, 32), fore: mk('fore', bruteArmBead('fore'), {x: 3, y: 3}, 32), fist: mk('fist', bruteFist(), {x: 4, y: 4}, 32),
    };
    bruteKits.set(spec.id, k);
  }
  return k;
}
