// Voxel models for the NON-humanoid and oversized bodies: the RUSHER (an insectoid crawler: carapace segments, six jointed
// legs, mandibles, raptorial blade forearms) and the BRUTE (a hunched hulk in a gas mask with a sledgehammer).
// Authoring conventions are in docs/art/STACKING.md: +x = the model's front, +y = its right-hand side, z up, pivot on the joint.
// Anything that must lean / reach in 3D (blades, the hammer) is baked at a few PITCH variants (see `pitched`).
import {VoxelGrid} from './stack2d.js';

export const RU = 0.6;     // rusher cell, world units
export const BU = 0.95;    // brute cell

// ---------------------------------------------------------------- shared helpers
/** Flip a grid across its y centre (left-hand copy of a right-hand part). */
export function flipY(g) {
  const o = new VoxelGrid(g.w, g.d, g.h);
  for (let z = 0; z < g.h; z++) for (let y = 0; y < g.d; y++) for (let x = 0; x < g.w; x++) o.set(x, g.d - 1 - y, z, g.get(x, y, z));
  return o;
}
/** Flip a grid upside down (z reversed): the belly-up corpse is the same body turned over. */
export function flipZ(g) {
  const o = new VoxelGrid(g.w, g.d, g.h);
  for (let z = 0; z < g.h; z++) for (let y = 0; y < g.d; y++) for (let x = 0; x < g.w; x++) o.set(x, y, g.h - 1 - z, g.get(x, y, z));
  return o;
}
export function mixc(a, b, t) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

/**
 * Rotates a list of cells [[a, b, c, ch], ...] (a along the part, b across, c up, in cells, a = 0 at the joint) about the
 * y axis by `pitch` radians (positive raises the far end) and returns {grid, pivot:{x,y}, pz} where pz is the joint's height
 * in cells above the grid floor. Sampled at half cells so rotated shapes stay solid.
 */
export function pitchedGrid(cells, pitch, width) {
  const cs = Math.cos(pitch), sn = Math.sin(pitch), pts = [];
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [a, b, c, ch] of cells) for (let da = 0; da < 2; da++) for (let dc = 0; dc < 2; dc++) {
    const A = a + da * 0.5, C = c + dc * 0.5, x = A * cs - C * sn, z = A * sn + C * cs;
    pts.push([x, b, z, ch]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, b); y1 = Math.max(y1, b);
  }
  const ox = Math.floor(x0) - 0, oz = Math.floor(z0), oy = Math.floor(y0);
  const g = new VoxelGrid(Math.ceil(x1 - ox) + 1, Math.max(width || 0, Math.ceil(y1 - oy) + 1), Math.ceil(z1 - oz) + 1);
  for (const [x, y, z, ch] of pts) g.set(Math.floor(x - ox), Math.floor(y - oy), Math.floor(z - oz), ch);
  return {grid: g, pivot: {x: -ox, y: -oy}, pz: -oz};
}

// ================================================================ RUSHER
export const RUSHER_SPEC = {
  id: 'rusher', elite: false, spikes: 3,
  c: {
    shell: '#a23a4a', plate: '#cf5663', groove: '#58202f', bone: '#ecdfc4', boneDark: '#b8a98a', belly: '#e0aa94', bellyDark: '#a56a62', flesh: '#7d2b3b',
    glow: '#ff9a3a', eye: '#ffe45a', vein: '#ff4a6a', mandible: '#3b2630', tooth: '#f6eeda', steel: '#f2eee4',
  },
};
export const ELITE_RUSHER_SPEC = {
  id: 'rusher.elite', elite: true, spikes: 5,
  c: {
    shell: '#6a2a52', plate: '#a0467f', groove: '#2e1230', bone: '#e6d2f0', boneDark: '#a893b8', belly: '#c79ab8', bellyDark: '#7c5a82', flesh: '#5a1f46',
    glow: '#ff6ad0', eye: '#9afcff', vein: '#ff3aa8', mandible: '#2a1830', tooth: '#fbe8ff', steel: '#f6f0ff',
  },
};
function rPal(c) {
  return {
    c: c.shell, C: c.plate, d: c.groove, k: c.bone, K: c.boneDark, b: c.belly, B: c.bellyDark, f: c.flesh,
    q: mixc(c.steel, c.bone, 0.2), e: {c: c.glow, emit: true}, E: {c: c.eye, emit: true}, v: {c: c.vein, emit: true}, m: c.mandible, t: c.tooth, w: {c: c.steel, emit: true}, g: mixc(c.flesh, '#ff8aa0', 0.35),
    s: mixc(c.groove, '#000000', 0.5), P: mixc(c.shell, c.bone, 0.25), F: mixc(c.shell, c.groove, 0.55),
  };
}

function abdomenGrid(spec, inv) {
  const g = new VoxelGrid(14, 11, 10), cy = 5.5;
  // teardrop: pinched to the stinger at the back, fullest just behind the thorax
  for (let x = 0; x < 14; x++) {
    const t = (x + 0.5) / 14, w = 0.9 + 3.9 * Math.sin(Math.min(1, t * 1.15) * 1.57) ** 1.3, hh = 0.9 + 2.5 * Math.sin(Math.min(1, t * 1.15) * 1.57) ** 1.2;
    g.ellipsoid(x + 0.5, cy, 3.6 + (1 - t) * 0.7, 0.5, w, hh, 'c', 2.4);
    g.ellipsoid(x + 0.5, cy, 1.0, 0.5, w * 0.85, Math.min(1.1, hh * 0.45), 'b', 3);
  }
  for (let x = 1; x < 13; x += 2) for (let y = 0; y < 11; y++) for (let z = 0; z < 3; z++) if (g.get(x, y, z) === 'b'.charCodeAt(0)) g.set(x, y, z, 'B');
  g.topCoat('c', 'C');
  // segment rings: dark grooves between plates
  for (const gx of [4, 7, 10]) for (let y = 0; y < 11; y++) for (let z = 9; z >= 0; z--) if (g.has(gx, y, z)) { const c = g.get(gx, y, z); if (c !== 'b'.charCodeAt(0) && c !== 'B'.charCodeAt(0)) { g.set(gx, y, z, 'd'); if (z > 0) g.set(gx, y, z - 1, 'd'); } break; }
  // dorsal spine: bone spikes, rising towards the thorax; glowing vent slits between
  const sp = spec.spikes;
  for (let i = 0; i < sp; i++) { const x = 3 + i * (spec.elite ? 2 : 3); if (x > 12) break; let top = 5; for (let z = 9; z >= 0; z--) if (g.has(x, 5, z)) { top = z + 1; break; } const h = 2 + (i % 2) + (spec.elite ? 1 : 0); for (let k = 0; k < h; k++) { g.set(x, 5, top + k, 'k'); if (k === 0) { g.set(x, 4, top, 'K'); g.set(x, 6, top, 'K'); } } }
  for (const x of [5, 8, 11]) for (let z = 9; z >= 0; z--) if (g.has(x, 5, z)) { if (g.get(x, 5, z) !== 'k'.charCodeAt(0)) g.set(x, 5, z, 'e'); break; }
  for (const x of [6, 9]) { g.set(x, 1, 3, 'e'); g.set(x, 9, 3, 'e'); }   // glowing pores on the flanks
  g.ellipsoid(0.6, cy, 3.9, 1.5, 0.9, 0.9, 'k', 2); g.set(0, 5, 4, 'w');  // stinger
  if (spec.elite) { for (const y of [3, 7]) for (const x of [6, 9]) { let top = 5; for (let z = 9; z >= 0; z--) if (g.has(x, y, z)) { top = z + 1; break; } g.set(x, y, top, 'k'); g.set(x, y, top + 1, 'k'); } }
  return inv ? flipZ(g) : g;
}
function thoraxGrid(spec, inv) {
  const g = new VoxelGrid(11, 11, 10), cy = 5.5;
  g.ellipsoid(5.5, cy, 4.3, 5.0, 4.8, 3.6, 'c', 2.3);
  g.ellipsoid(5.6, cy, 1.4, 4.4, 4.0, 1.4, 'b', 3);
  g.ellipsoid(7.0, cy, 6.7, 3.0, 3.2, 2.0, 'c', 2.4);                      // shoulder hump
  g.ellipsoid(3.0, cy, 6.4, 2.4, 2.6, 1.6, 'c', 2.4);
  g.topCoat('c', 'C');
  for (let y = 0; y < 11; y++) for (let z = 9; z >= 0; z--) if (g.has(5, y, z)) { g.set(5, y, z, 'd'); break; }
  for (const x of [2, 5, 8]) { g.ellipsoid(x + 0.5, 0.8, 2.6, 1.1, 1.0, 1.1, 'K'); g.ellipsoid(x + 0.5, 10.2, 2.6, 1.1, 1.0, 1.1, 'K'); }   // leg sockets
  for (const x of [3, 4, 7, 8]) { g.set(x, 5, 9, 'k'); }                    // dorsal ridge
  g.set(6, 5, 9, 'k'); g.set(6, 5, 10, 'k'); g.set(7, 5, 10, 'k');
  for (const s of [3, 7]) { g.set(6, s, 8, 'v'); }                           // veins glowing under the shell
  if (spec.elite) for (const y of [1, 9]) for (const x of [4, 7]) { g.set(x, y, 7, 'k'); g.set(x, y, 8, 'k'); }
  return inv ? flipZ(g) : g;
}
function headGrid(spec, inv) {
  const g = new VoxelGrid(10, 10, 8), cy = 5;
  g.ellipsoid(4.8, cy, 3.4, 4.5, 4.3, 3.0, 'c', 2.3);
  g.ellipsoid(8.0, cy, 2.4, 2.1, 2.6, 1.8, 'f', 2.4);                      // snout
  g.ellipsoid(4.8, cy, 1.2, 4.0, 3.6, 1.2, 'b', 3);
  g.topCoat('c', 'C');
  for (const s of [-1, 1]) {
    g.ellipsoid(6.2, cy + s * 2.9, 5.1, 1.6, 1.5, 1.2, 'E', 2);            // compound eyes on the crown (visible from above)
    g.set(6, cy + s * 2.9 - 1 * (s > 0 ? 0 : 0), 6, 'w');
    g.ellipsoid(8.6, cy + s * 1.2, 3.2, 0.7, 0.7, 0.7, 'E', 2);             // smaller front eyes
    g.set(3, cy + s * 3.4, 6, 'k');                                          // horns
    g.set(2, cy + s * 3.8, 7, 'k');
    g.set(8, cy + s * 0.9, 1, 't'); g.set(9, cy + s * 1.2, 1, 't');         // fangs
  }
  for (let y = 3; y <= 6; y++) g.set(7, y, 6, 'd');                          // brow
  g.set(9, 4, 2, 'g'); g.set(9, 5, 2, 'g');                                  // glistening mouth
  g.set(4, 5, 6, 'k'); g.set(3, 5, 7, 'k');                                  // crest
  if (spec.elite) { g.set(5, 5, 7, 'k'); g.set(5, 5, 8, 'k'); g.set(2, 3, 7, 'k'); g.set(2, 7, 7, 'k'); }
  return inv ? flipZ(g) : g;
}
function mandibleGrid(side) {
  const g = new VoxelGrid(8, 5, 3);
  // right-hand mandible (+y): a sickle that bows outward then hooks in
  const path = [[0, 0.5], [1, 0.5], [2, 0.7], [3, 1.1], [4, 1.7], [5, 2.4], [6, 3.0], [7, 3.1]];
  path.forEach(([x, y], i) => { g.set(x, y, 0, i > 5 ? 't' : 'm'); g.set(x, y, 1, i > 5 ? 't' : 'm'); g.set(x, y + 1, 0, i > 4 ? 't' : 'm'); if (i < 5) g.set(x, y + 1, 1, 'm'); });
  g.set(4, 1, 2, 't'); g.set(5, 2, 2, 't');                                  // inner teeth
  return side > 0 ? g : flipY(g);
}
/** Blade forearm cells for the RIGHT hand (+y side), curved inward (towards -y). len in cells. */
function bladeCells(len, spec) {
  const cells = [];
  for (let a = 0; a < len; a += 0.5) {
    const u = a / len, hw = Math.max(0.5, 2.3 * (1 - u ** 1.4) + 0.3), bc = -3.2 * u * u, thick = u < 0.4 ? 3 : u < 0.75 ? 2 : 1;
    for (let b = -3.4; b <= 3.4; b += 0.5) {
      const off = b - bc; if (Math.abs(off) > hw) continue;
      const edge = off < -hw + 0.9;                                 // inner (cutting) edge
      const back = off > hw - 0.8;
      const tip = u > 0.93;
      for (let c = 0; c < thick; c++) cells.push([a, b, c, tip ? 'w' : edge ? 'q' : back ? 'K' : (u < 0.28 ? 'c' : 'k')]);
    }
  }
  for (let a = 3; a < len - 3; a += 1.5) cells.push([a, 2.0 - 3.2 * (a / len) ** 2, 2.5, 'K']);   // spine serrations
  void spec;
  return cells;
}
const _bladeCache = new Map();
/** Blade model: side +1 right / -1 left, pitch in radians. Returns {model, pz} (pz = joint height in world units above model layer 0). */
export function bladeModel(spec, side, pitch) {
  const key = `${spec.id}.blade${side}.${Math.round(pitch * 20)}`;
  let m = _bladeCache.get(key);
  if (!m) {
    const len = spec.elite ? 19 : 16, r = pitchedGrid(bladeCells(len, spec), pitch, 9);
    const g = side > 0 ? r.grid : flipY(r.grid);
    const pivY = side > 0 ? r.pivot.y : g.d - 1 - r.pivot.y;
    m = {model: {id: key, unit: RU, layerH: RU, pivot: {x: r.pivot.x, y: pivY + 0.5}, palette: rPal(spec.c), grid: g, buckets: 32}, pz: r.pz * RU, len: len * RU};
    _bladeCache.set(key, m);
  }
  return m;
}
export const BLADE_PITCHES = [-0.7, -0.25, 0.25, 0.7, 1.15];
export function nearestPitch(p) { let b = 0; for (let i = 1; i < BLADE_PITCHES.length; i++) if (Math.abs(BLADE_PITCHES[i] - p) < Math.abs(BLADE_PITCHES[b] - p)) b = i; return b; }

function legPiece(kind, spec) {
  // small rounded "beads": a steep bone is a column of beads, so the 3D line reads smoothly instead of as stair-stepped slabs
  const g = new VoxelGrid(6, 3, 3);
  if (kind === 'femur') { g.rod(0, 6, 1.5, 1.4, 1.5, 1.4, 'f', 2); g.set(2, 1, 2, 'c'); g.set(3, 1, 2, 'c'); }
  else if (kind === 'tibia') { g.rod(0, 6, 1.5, 1.3, 1.2, 1.2, 'F', 2); }
  else { for (let x = 0; x < 6; x++) { const r = Math.max(0.45, 1.3 * (1 - x / 6.5)); g.ellipsoid(x + 0.5, 1.5, 1.3, 0.6, r, r, x > 3 ? 'k' : 'F', 2); } }
  return {id: `${spec.id}.leg.${kind}`, unit: RU, layerH: RU, pivot: {x: 3, y: 1.5}, palette: rPal(spec.c), grid: g, buckets: 32};
}
function jointKnob(spec) { const g = new VoxelGrid(4, 4, 4); g.ellipsoid(2, 2, 2, 1.8, 1.8, 1.8, 'K', 2); g.set(2, 2, 3, 'k'); return {id: `${spec.id}.knob`, unit: RU, layerH: RU, pivot: {x: 2, y: 2}, palette: rPal(spec.c), grid: g, buckets: 16}; }
function armPiece(spec) { const g = new VoxelGrid(7, 4, 3); g.rod(0, 7, 2, 1.4, 1.6, 1.4, 'c', 2.2); g.rod(1, 6, 2, 2.4, 1.0, 0.6, 'C', 2.2); return {id: `${spec.id}.arm`, unit: RU, layerH: RU, pivot: {x: 3.5, y: 2}, palette: rPal(spec.c), grid: g, buckets: 32}; }

const rusherKits = new Map();
/** {abdomen, abdomenInv, thorax, thoraxInv, head, headInv, mandL, mandR, femur, tibia, tip, knob, arm, spec} */
export function rusherKit(spec = RUSHER_SPEC) {
  let k = rusherKits.get(spec.id);
  if (!k) {
    const pal = rPal(spec.c), mk = (id, g, pv, b = 48, u = RU) => ({id: `${spec.id}.${id}`, unit: u, layerH: u, pivot: pv, palette: pal, grid: g, buckets: b});
    k = {
      spec,
      abdomen: mk('abdomen', abdomenGrid(spec, false), {x: 13.5, y: 5.5}), abdomenInv: mk('abdomenInv', abdomenGrid(spec, true), {x: 13.5, y: 5.5}),
      thorax: mk('thorax', thoraxGrid(spec, false), {x: 5.5, y: 5.5}), thoraxInv: mk('thoraxInv', thoraxGrid(spec, true), {x: 5.5, y: 5.5}),
      head: mk('head', headGrid(spec, false), {x: 1, y: 5}, 48, 0.7), headInv: mk('headInv', headGrid(spec, true), {x: 1, y: 5}, 48, 0.7),
      mandL: mk('mandL', mandibleGrid(-1), {x: 0.5, y: 4.5}, 32, 0.7), mandR: mk('mandR', mandibleGrid(1), {x: 0.5, y: 0.5}, 32, 0.7),
      femur: legPiece('femur', spec), tibia: legPiece('tibia', spec), tip: legPiece('tip', spec), knob: jointKnob(spec), arm: armPiece(spec),
      bladeH: RU * 3,
    };
    rusherKits.set(spec.id, k);
  }
  return k;
}
