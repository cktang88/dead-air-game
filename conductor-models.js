// THE CONDUCTOR, as voxel parts: a tall figure in a long tattered tailcoat, a broadcast mast for a spine, a CRT for a head.
// Everything exists in three DAMAGE LEVELS (= boss phase 1..3): the coat frays, the casing cracks, the mast bends and sparks.
// Cell = CU (0.9 world units). Axes as everywhere: +x front, +y right, z up. Long things (the mast, coat tails) are baked at
// pitch variants so they can lean, fly and topple. Animation lives in conductor-pose.js.
import {VoxelGrid} from './stack2d.js';
import {pitchedGrid, flipY, mixc} from './creature-models.js';

export const CU = 0.9;
export const CONDUCTOR_PAL = {
  c: '#4b2459', C: '#74408c', d: '#2b1337', g: '#ecc98a', G: '#a8803f', s: '#efe6ee', S: '#b9aebb', T: '#e8467f', p: '#2b2133', b: '#16111b', B: '#4f4259',
  w: '#f4eef4', k: '#aaa4b6', K: '#5a5566', z: '#16131c', Z: '#0c0d14', v: '#3b3645', x: '#2e2838', y: '#d9b25f',
  m: '#6f7587', M: '#b4bccd', N: '#3a3f4e', i: '#e9dcc4', E: {c: '#ff4a8a', emit: true}, F: {c: '#fff0f6', emit: true}, U: {c: '#7fe8ff', emit: true}, e: {c: '#ff9a3a', emit: true},
};
const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function torsoGrid(level) {
  const W = 15, D = 22, H = 17, cx = 6.5, cy = 11, g = new VoxelGrid(W, D, H);
  g.ellipsoid(cx, cy, 2.2, 4.4, 6.0, 2.2, 'd', 3);                          // hips
  g.ellipsoid(cx, cy, 3.6, 4.8, 6.6, 0.8, 'g', 3.2);                         // gold waist band
  for (let z = 4; z < 14; z++) { const t = (z - 4) / 9; g.ellipsoid(cx + 0.4 * t, cy, z + 0.5, 4.2 + 0.7 * t, 5.4 + 3.4 * t, 0.58, 'c', 3); }   // V taper
  g.ellipsoid(cx + 2.4, cy, 11.4, 2.6, 5.8, 3.6, 'C', 2.6);                  // chest plate of the coat
  g.box(cx + 4.4, cy - 2, 9, cx + 6.4, cy + 2, 14, 's'); g.set(cx + 6, cy, 13, 'S');   // shirt front
  g.ellipsoid(cx + 5.6, cy, 13.4, 1.4, 2.6, 0.8, 'T', 2.4); g.set(cx + 6, cy, 14, 'E');  // bow tie + LED
  for (const z of [9, 10.5, 12]) g.set(cx + 6, cy, z, 'g');                  // buttons
  for (let i = 0; i < 18; i++) { const u = i / 17; const y = cy + 7 - u * 14, z = 14 - u * 9; for (let k = 0; k < 2; k++) g.set(cx + 4.6 + k * 0.4, y, z, 'g'); if (i % 4 === 0) g.set(cx + 5.4, y, z - 1, 'G'); }   // gold braid sash
  for (const s of [-1, 1]) {                                                 // epaulettes, with a fringe
    const y = cy + s * 8.6;
    g.ellipsoid(cx, y, 13.6, 2.6, 2.2, 1.5, 'g', 2.4); g.ellipsoid(cx, y, 14.8, 1.6, 1.4, 0.7, 'G', 2.4);
    for (let k = 0; k < 4; k++) g.set(cx - 1 + k * 0.8, y + s * 1.8, 12.4 - (k % 2) * 0.8, 'G');
  }
  g.cyl(cx + 0.4, cy, 13, 17, 3.9, 4.0, 'C', 2.6);                           // high collar
  g.cyl(cx + 0.4, cy, 14, 17, 2.5, 2.5, 'N', 2);                              // neck stub
  for (let a = 0; a < 12; a++) { const an = a / 12 * Math.PI * 2; g.set(cx + 0.4 + Math.cos(an) * 3.6, cy + Math.sin(an) * 4.0, 16, a % 2 ? 'T' : 'C'); }   // collar piping
  // back: mast socket plate with bolts and cable ports
  g.box(0, cy - 3.2, 5, 2.4, cy + 3.2, 13, 'K'); g.box(0, cy - 2, 6, 1.2, cy + 2, 12, 'N');
  for (const [y, z] of [[-2.6, 6], [2.6, 6], [-2.6, 12], [2.6, 12]]) g.set(0, cy + y, z, 'M');
  for (const y of [-1.2, 0, 1.2]) g.set(0, cy + y, 8, 'E');
  g.ellipsoid(2.0, cy, 3.4, 2.6, 6.2, 2.6, 'c', 2.6);                        // coat tail roots
  // damage: holes, wires, glow
  if (level >= 1) {
    for (let z = 3; z < 15; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
      if (!g.has(x, y, z)) continue;
      const hsh = hash(x, y, z + 7), edge = y < cy - 6 || y > cy + 6;
      if (edge && hsh < (level === 1 ? 0.2 : 0.4) && g.get(x, y, z) === 'c'.charCodeAt(0)) g.set(x, y, z, 0);
    }
    for (const [y, z] of [[-4, 8], [4, 10], [-5, 11]]) { g.set(cx + 5.4, cy + y, z, 'S'); g.set(cx + 5.4, cy + y, z - 1, 'S'); }
    g.set(cx + 5.4, cy - 4, 11, 'K'); g.set(cx + 6.4, cy - 4, 11.6, 'E');    // a wire sparks out of the chest
  }
  if (level >= 2) {
    for (let k = 0; k < 14; k++) { const y = cy - 7 + hash(k, 3, 3) * 14, z = 4 + hash(k, 5, 1) * 8; g.set(cx + 3 + hash(k, 1, 1) * 3, y, z, 'e'); }
    g.box(cx + 4.4, cy - 2, 9, cx + 6.4, cy + 2, 14, 'S');                    // shirt gone grey
    g.set(cx + 6, cy, 13, 'x'); g.set(cx + 6, cy + 1, 13, 'x');                // bow tie hanging
    for (let z = 3; z < 7; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (g.has(x, y, z) && hash(x, y, z) < 0.35 && (y < 4 || y > D - 5)) g.set(x, y, z, 0);   // ragged skirt
  }
  g.topCoat('c', 'C');
  return g;
}
function headGrid(level) {
  const W = 17, D = 15, H = 13, cx = 6, cy = 7.5, g = new VoxelGrid(W, D, H);
  g.cyl(cx, cy, 0, 3, 2.7, 2.7, 'N');
  g.ellipsoid(5.4, cy, 7.0, 5.6, 6.6, 4.8, 'k', 3.4);                         // rear tube housing
  g.ellipsoid(9.8, cy, 6.6, 4.8, 6.9, 4.6, 'k', 4);                           // front casing
  g.ellipsoid(4.2, cy, 5.2, 3.6, 5.2, 4.0, 'K', 3, true);                    // darker rear shoulder
  // the screen: a dark bezel on the top face (so it faces the camera whatever way the head turns), glass inside it
  for (let y = 1; y < 14; y++) for (let x = 5; x < 16; x++) { if (!g.has(x, y, 10)) { for (let z = 11; z >= 7; z--) if (g.has(x, y, z)) { const ex = (x - 10.2) / 5.2, ey = (y - 7) / 6.3; if (ex * ex + ey * ey < 1) g.set(x, y, z, ex * ex + ey * ey < 0.62 ? 'Z' : 'z'); break; } } }
  for (const s of [-1, 1]) { for (let i = 0; i < 4; i++) { g.set(3 + i, cy + s * 6.4, 5 + (i % 2), 'v'); g.set(3 + i, cy + s * 6.4, 8, 'v'); } g.set(13, cy + s * 6.8, 4, 'y'); g.set(14, cy + s * 6.2, 3, 'y'); }   // vents + knobs
  g.box(3, cy - 2.4, 4, 6, cy + 2.4, 5, 'x'); g.set(2, cy, 9, 'K'); g.set(1, cy + 2, 10, 'K'); g.set(1, cy - 2, 10, 'K');   // rear cable bundle + ear sockets
  g.set(14, cy + 5.4, 6, 'E'); g.set(14, cy - 5.4, 6, 'U');                  // power LED + signal LED
  g.set(cx, cy, 0, 'N');
  if (level >= 1) { for (const [x, y, z] of [[11, 3, 10], [12, 4, 10], [12, 10, 10], [11, 11, 10]]) g.set(x, y, z, 'x'); }
  if (level >= 2) {
    for (let i = 0; i < 9; i++) { const x = 9 + i % 6, y = 1 + i, z = 9 + (i % 2); for (let zz = 12; zz >= 6; zz--) if (g.has(x, y, zz)) { g.set(x, y, zz, i % 3 ? 'x' : 'e'); break; } }
    for (let z = 4; z < 9; z++) for (let y = 12; y < 15; y++) g.set(13 + (z % 2), y, z, 0);   // a chunk of casing gone
    g.set(13, 13, 6, 'e'); g.set(12, 13, 7, 'e');
  }
  g.topCoat('k', 'M');
  return g;
}
function skirtGrid(level) {
  // the long frock coat: a bell that flares towards the hem, hiding the legs; split at the front, pleated, trimmed in gold, ragged when damaged
  const W = 24, D = 26, H = 15, cx = 11.5, cy = 13, g = new VoxelGrid(W, D, H);
  for (let z = 0; z < H; z++) {
    const t = (H - 1 - z) / (H - 1), rx = 5.2 + t * 4.4, ry = 6.0 + t * 4.8;
    g.ellipsoid(cx - 0.4 * t, cy, z + 0.5, rx, ry, 0.5, 'c', 2.4);
  }
  for (let z = 0; z < H; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    if (!g.has(x, y, z)) continue;
    const a = Math.atan2(y - cy, x - cx), pleat = Math.floor((a + Math.PI) / (Math.PI * 2) * 22);
    if (pleat % 3 === 0 && z > 1) g.set(x, y, z, 'd');
    if (x > cx + 1.5 && Math.abs(y + 0.5 - cy) < 1.2 + (H - z) * 0.05) { g.set(x, y, z, z > 11 ? 0 : 'T'); }            // front split with a pink lining
    if (z < 2 && g.get(x, y, z) !== 0 && g.get(x, y, z) !== 'T'.charCodeAt(0)) g.set(x, y, z, level === 0 ? 'g' : 'd');   // hem
    if (level >= 1 && z < (level === 1 ? 4 : 7) && hash(x, y, z + 3) < (level === 1 ? 0.22 : 0.42) - z * 0.03) g.set(x, y, z, 0);   // ragged
  }
  if (level >= 2) for (let k = 0; k < 10; k++) g.set(4 + hash(k, 2, 2) * 16, 3 + hash(k, 4, 2) * 20, 1 + (k % 4), 'e');
  g.topCoat('c', 'C');
  return g;
}
function legGrid() {
  const g = new VoxelGrid(11, 8, 18);
  g.ellipsoid(6.4, 4, 1.2, 4.6, 3.1, 1.2, 'b', 3);                           // shoe
  g.ellipsoid(8.4, 4, 1.8, 2.2, 2.6, 0.9, 'B', 3);
  g.cyl(5, 4, 2, 4, 2.4, 2.4, 'w', 2.4);                                      // spats
  g.cyl(5, 4, 4, 18, 2.6, 2.9, 'p', 2.4);                                     // trouser leg
  g.box(2, 0.4, 5, 8, 1.4, 17, 'g');                                          // gold stripe on the outer side
  return g;
}
function armBead(kind) {
  const g = new VoxelGrid(5, 4, 4);
  if (kind === 'upper') { g.ellipsoid(2.5, 2, 2, 2.4, 1.9, 1.8, 'c', 2.2); g.set(2, 2, 3, 'C'); }
  else { g.ellipsoid(2.5, 2, 2, 2.4, 1.9, 1.8, 'c', 2.2); g.ellipsoid(3.6, 2, 2, 1.3, 2, 1.8, 'g', 2.4); g.set(2, 2, 3, 'C'); }
  return g;
}
function handGrid() {
  const g = new VoxelGrid(6, 6, 5);
  g.ellipsoid(3, 3, 2.2, 2.6, 2.4, 2.0, 'w', 2.4); g.ellipsoid(3.4, 3, 3.4, 1.8, 2, 0.9, 'w', 2.4); g.set(2, 3, 4, 'S');
  return g;
}
function batonBead(tip) {
  const g = new VoxelGrid(4, 3, 3);
  g.rod(0, 4, 1.5, 1.5, 1.2, 1.2, tip ? 'F' : 'w', 2);
  return g;
}
const _tailCache = new Map();
/** A coat tail: a long sheet hanging from the waist (+x here = along the tail, away from the body), at one pitch. side +/-1. */
export function tailModel(level, side, pitch) {
  const key = `cond.tail${level}.${side}.${Math.round(pitch * 20)}`;
  let m = _tailCache.get(key);
  if (!m) {
    const len = 17, cells = [];
    for (let b = 0; b <= 6; b += 0.5) {
      const rag = level === 0 ? 0 : (hash(Math.round(b * 2), level, 5) * (level === 1 ? 3 : 6.5));
      const hem = len - rag - Math.abs(b - 3) * 0.7;
      for (let a = 0; a < hem; a += 0.5) {
        const edge = b < 0.8 || b > 5.2, isHem = a > hem - 1.2, torn = level > 0 && hash(Math.round(a * 2), Math.round(b * 2), level + 9) < 0.07 * level && a > 5;
        if (torn) continue;
        const ch = isHem ? (level >= 1 ? 'd' : 'g') : (edge ? 'C' : (a < 3 ? 'c' : (Math.round(a) % 5 === 0 ? 'd' : 'c')));
        cells.push([a, b, 0, ch]); if (a < 10) cells.push([a, b, 1, 'd']);
      }
    }
    if (level >= 2) for (let i = 0; i < 6; i++) cells.push([4 + i * 2, 3 + (i % 2 ? 1.5 : -1.5), 1, 'e']);   // ember threads in the shreds
    const r = pitchedGrid(cells, pitch, 8);
    const g = side > 0 ? r.grid : flipY(r.grid);
    m = {model: {id: key, unit: CU, layerH: CU, pivot: {x: r.pivot.x, y: side > 0 ? r.pivot.y + 3.5 : g.d - (r.pivot.y + 3.5)}, palette: CONDUCTOR_PAL, grid: g, buckets: 32}, pz: r.pz * CU};
    _tailCache.set(key, m);
  }
  return m;
}
export const TAIL_PITCHES = [-1.35, -0.95, -0.55, -0.2];
export function nearestTail(p) { let b = 0; for (let i = 1; i < TAIL_PITCHES.length; i++) if (Math.abs(TAIL_PITCHES[i] - p) < Math.abs(TAIL_PITCHES[b] - p)) b = i; return b; }

const _mastCache = new Map();
export const MAST_LEN = 42;      // cells
export const MAST_PITCHES = [0.12, 0.4, 0.7, 1.0, 1.3, 1.5, 1.62, 1.75, 1.88, 2.02];
export function nearestMast(p) { let b = 0; for (let i = 1; i < MAST_PITCHES.length; i++) if (Math.abs(MAST_PITCHES[i] - p) < Math.abs(MAST_PITCHES[b] - p)) b = i; return b; }
function mastCells(level) {
  const c = [], L = MAST_LEN;
  const add = (a, b, cc, ch) => c.push([a, b, cc, ch]);
  // generator housing at the base
  for (let a = 0; a < 6; a += 0.5) for (let b = -3; b <= 3; b += 0.5) for (let cc = -1.5; cc < 1.5; cc += 0.5) add(a, b, cc, a > 4.5 ? 'K' : 'N');
  for (const b of [-2, -0.7, 0.7, 2]) add(3.2, b, 1.7, b > 0 ? 'E' : 'U');
  // lattice: three rods + zig-zag braces
  for (let a = 5; a < L - 5; a += 0.5) for (const b of [-1.5, 0, 1.5]) { add(a, b, 0, b === 0 ? 'm' : 'N'); }
  for (let k = 0; k < 12; k++) { const a0 = 6 + k * 2.8, dir = k % 2 ? 1 : -1; for (let t = 0; t <= 1; t += 0.2) add(a0 + t * 2.8, dir > 0 ? -1.5 + 3 * t : 1.5 - 3 * t, 0, 'N'); }
  // cross arms with emitters
  for (const [a, w, em] of [[14, 6, 'E'], [22, 4.6, 'U'], [29, 3.6, 'E'], [35, 2.6, 'F']]) {
    for (let b = -w; b <= w; b += 0.5) { add(a, b, 0, 'M'); if (Math.abs(b) > w - 1.2) add(a, b, 0.5, 'i'); }
    for (const s of [-1, 1]) { add(a, s * w, 0.6, em); add(a, s * w, 1.1, em); }
  }
  // top dish with a feed horn
  for (let a = L - 5; a < L; a += 0.5) { const r = 0.8 + (a - (L - 5)) * 0.55; for (let b = -r; b <= r; b += 0.5) for (let cc = -r; cc <= r; cc += 0.5) { const rr = Math.hypot(b, cc); if (rr <= r && rr > r - 0.9) add(a, b, cc, a > L - 1.2 ? 'M' : 'm'); } }
  add(L - 1, 0, 0, 'F'); add(L, 0, 0, 'F'); add(L - 3, 0, 0, 'E');
  if (level >= 1) { for (let a = 8; a < L; a += 6) add(a, 2.2, 0.5, 'e'); }
  if (level >= 2) { for (let a = L - 8; a < L; a += 0.5) for (let b = -4; b <= 4; b += 0.5) for (let cc = -4; cc <= 4; cc += 0.5) { if (Math.hypot(b, cc) > 3.5 && (b > 0.5)) { /* bitten dish */ } } }
  return c;
}
/** The mast at one lean (pitch from horizontal-forward; 1.57 = straight up). Returns {model, pz}. */
export function mastModel(level, pitch) {
  const key = `cond.mast${level}.${Math.round(pitch * 100)}`;
  let m = _mastCache.get(key);
  if (!m) {
    const cells = mastCells(level);
    // level 2: the top bends over (cells beyond a = 26 are re-based along a bent axis)
    const bent = level >= 2 ? cells.map(([a, b, c, ch]) => (a > 26 ? [26 + (a - 26) * 0.8, b - (a - 26) * 0.55, c, ch] : [a, b, c, ch])) : cells;
    const r = pitchedGrid(bent, pitch, 14);
    m = {model: {id: key, unit: CU, layerH: CU, pivot: {x: r.pivot.x, y: r.pivot.y}, palette: CONDUCTOR_PAL, grid: r.grid, buckets: 48}, pz: r.pz * CU};
    _mastCache.set(key, m);
  }
  return m;
}

const kits = new Map();
export function conductorKit(level = 0) {
  let k = kits.get(level);
  if (!k) {
    const mk = (id, g, pv, b = 48, u = CU) => ({id: `cond${level}.${id}`, unit: u, layerH: u, pivot: pv, palette: CONDUCTOR_PAL, grid: g, buckets: b});
    k = {
      level, skirt: mk('skirt', skirtGrid(level), {x: 11.5, y: 13}, 48),
      torso: mk('torso', torsoGrid(level), {x: 6.5, y: 11}), head: mk('head', headGrid(level), {x: 6, y: 7.5}, 48, 0.82), leg: mk('leg', legGrid(), {x: 5, y: 4}, 32),
      upper: mk('upper', armBead('upper'), {x: 2.5, y: 2}, 32, 0.8), fore: mk('fore', armBead('fore'), {x: 2.5, y: 2}, 32, 0.8), hand: mk('hand', handGrid(), {x: 3, y: 3}, 32, 0.8),
      batonBead: mk('baton', batonBead(false), {x: 2, y: 1.5}, 32, 0.6), batonTip: mk('batonTip', batonBead(true), {x: 2, y: 1.5}, 32, 0.6),
    };
    kits.set(level, k);
  }
  return k;
}
void mixc;
