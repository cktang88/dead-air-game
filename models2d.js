// Stacked (voxel) models: the humanoid kit (legs, torso, head, arm, glove, mag) built from a colour/style SPEC, plus a
// procedural gun builder driven by GUN_ART so the muzzle lands exactly on gunMuzzle(). Cell = 0.8 world units for
// bodies, 0.6 for guns. Authoring guide: docs/art/STACKING.md.
import {VoxelGrid} from './stack2d.js';
import {GUN_ART} from './sprites2d.js';

export const BODY_UNIT = 0.8;
export const GUN_UNIT = 0.6;
const CELL = BODY_UNIT;

// ---------------------------------------------------------------- humanoid specs
/** Everything a humanoid model needs; copy one, change colours / flags, call buildHumanoid. */
export const PLAYER_SPEC = {
  id: 'player', helmet: 'visor', bandolier: false, pack: 'radio', shoulders: 'plates',
  c: {
    pants: '#2e3b46', pantsHi: '#46586a', boot: '#2a2630', bootHi: '#4a4452', sole: '#16131b',
    belt: '#2a2320', buckle: '#d9b45a', pouch: '#4a4a3c', pouchHi: '#6a6a54',
    vest: '#36424e', plate: '#62788a', cloth: '#2f5c56', accent: '#62e1ad', accentDark: '#2f8f70', strap: '#1c222a',
    glove: '#2a2530', gloveHi: '#4a4350', skin: '#c79574', helmet: '#4fb996', helmetHi: '#a6f0d2',
    visor: '#0d242a', lens: '#7fe8ff', lensHi: '#ffffff', mic: '#8d8b92', pack: '#34404a', packDark: '#222a32', led: '#ff4a5e', brass: '#e8c978',
  },
};
export const GUNNER_SPEC = {
  id: 'gunner', helmet: 'cap', bandolier: true, pack: 'sack', shoulders: 'soft',
  c: {
    pants: '#4b3d3a', pantsHi: '#65524b', boot: '#2d2226', bootHi: '#523b36', sole: '#17110f',
    belt: '#3a281c', buckle: '#d9b45a', pouch: '#7a5230', pouchHi: '#a06c3c',
    vest: '#d98f45', plate: '#8b5a30', cloth: '#e9a45a', accent: '#f3b568', accentDark: '#a96a2c', strap: '#5a3a24',
    glove: '#3a2c26', gloveHi: '#5a463c', skin: '#c79574', helmet: '#8a5a38', helmetHi: '#cf9a5c',
    visor: '#1c1417', lens: '#ffc261', lensHi: '#fff1c4', mic: '#8d8b92', pack: '#5a4636', packDark: '#3a2c20', led: '#ff4a5e', brass: '#e8c978',
  },
};

function mixc(a, b, t) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function palette(c) {
  return {
    p: c.pants, q: c.pantsHi, b: c.boot, B: c.bootHi, s: c.sole,
    T: c.belt, Y: c.buckle, P: c.pouch, Q: c.pouchHi,
    V: c.vest, W: c.plate, c: c.cloth, A: c.accent, a: c.accentDark, S: c.strap,
    g: c.glove, G: c.gloveHi, n: c.skin, N: '#a47656',
    h: c.helmet, H: c.helmetHi, D: c.visor, L: {c: c.lens, emit: true}, l: {c: c.lensHi, emit: true}, M: c.mic,
    K: c.pack, k: c.packDark, E: {c: c.led, emit: true}, y: c.brass, u: c.accentDark, m: '#3a3e48', r: c.skin, Z: mixc(c.visor, c.lens, 0.22),
  };
}

function legModel(spec) {
  const g = new VoxelGrid(12, 6, 10);
  g.ellipsoid(6.5, 3, 0.5, 5.2, 2.7, 0.6, 's', 3);
  g.ellipsoid(6.2, 3, 1.5, 4.8, 2.5, 0.7, 'b', 3);
  g.ellipsoid(9.6, 3, 1.4, 1.7, 2.2, 0.6, 'B', 3);            // toe cap
  g.cyl(5, 3, 2, 4, 2.2, 2.4, 'b', 2.4);                      // boot shaft
  g.cyl(5, 3, 4, 5, 2.4, 2.5, 'B', 2.4);                      // cuff
  g.cyl(5, 3, 5, 7, 2.1, 2.3, 'p', 2.4);                      // shin
  g.ellipsoid(6, 3, 7, 2.2, 2.5, 0.9, 'q', 2.6);              // knee pad
  g.cyl(5, 3, 8, 10, 2.5, 2.7, 'p', 2.4);                     // thigh
  g.set(8, 3, 2, 'B'); g.set(8, 2, 2, 'B'); g.set(8, 4, 2, 'B'); // laces
  return {id: `${spec.id}.leg`, unit: CELL, layerH: CELL, pivot: {x: 5.5, y: 3}, palette: palette(spec.c), grid: g, buckets: 32};
}

function torsoModel(spec) {
  const W = 15, D = 24, H = 13, cy = D / 2, cx = 7.5;
  const g = new VoxelGrid(W, D, H);
  const soft = spec.shoulders === 'soft';
  // hips + belt
  g.ellipsoid(cx, cy, 1.0, 5.2, 8.2, 1.0, 'p', 3);
  g.ellipsoid(cx, cy, 2.5, 5.8, 9, 0.55, 'T', 3.2);
  g.box(cx + 4.6, cy - 1, 2, cx + 6.6, cy + 1, 3, 'Y');
  // pouches (front hip), sidearm holster
  for (const s of [-1, 1]) { const y0 = cy + s * 4.4; g.box(cx + 1.5, y0 - 1.5, 2, cx + 5, y0 + 1.5, 4, 'P'); g.box(cx + 1.5, y0 - 1.5, 4, cx + 5, y0 + 1.5, 5, 'Q'); g.set(cx + 5, y0, 3, 'y'); }
  g.box(cx - 3, cy + 8.2, 1, cx + 2, cy + 10.4, 5, 'm'); g.box(cx - 3, cy + 8.2, 5, cx + 2, cy + 10.4, 6, 'P');
  g.ellipsoid(cx - 2, cy - 9, 3, 2, 1.2, 1.3, 'M');          // canteen / flashlight on the left hip
  // torso: cloth sides, vest front, per-layer taper (chest wider than waist)
  for (let z = 3; z < 10; z++) {
    const t = (z - 3) / 6, rx = 5.2 + 0.7 * t, ry = 8.4 + 1.8 * t;
    g.ellipsoid(cx, cy, z + 0.5, rx, ry, 0.56, 'c', 3.2);
    g.ellipsoid(cx, cy, z + 0.5, rx + 0.1, ry - 1.6, 0.56, soft ? 'V' : 'V', 3.2);
  }
  if (spec.shoulders === 'plates') {
    g.ellipsoid(cx + 4, cy, 6.8, 2.4, 4.3, 3.0, 'W', 3.6);   // chest plate
    g.box(cx + 5.6, cy - 0.5, 4, cx + 7, cy + 0.5, 9, 'A');   // centre stripe
    g.ellipsoid(cx + 4.4, cy, 4.2, 2.0, 3.2, 0.7, 'V', 3);    // plate shelf
    for (const s of [-1, 1]) { g.box(cx - 1, cy + s * 4.6 - 0.8, 9, cx + 5, cy + s * 4.6 + 0.8, 10, 'S'); }  // shoulder straps
  } else {
    g.ellipsoid(cx + 3.6, cy, 6.6, 2.2, 5.2, 3.2, 'V', 3);    // open jacket front
  }
  if (spec.bandolier) {
    // brown strap running from the right shoulder to the left hip, studded with brass rounds
    for (let i = 0; i < 24; i++) {
      const u = i / 23, y = cy + 6.5 - u * 13, z = 9 - u * 5.4;
      for (let dx = 0; dx < 3; dx++) { const x = cx + 3.4 + dx - u * 0.6; g.set(x, y, z, 'S'); g.set(x, y + 1, z, 'S'); }
      if (i % 3 === 1) { g.set(cx + 5.2 - u * 0.6, y, z, 'y'); g.set(cx + 5.2 - u * 0.6, y + 1, z, 'y'); }
    }
  }
  // pauldrons
  for (const s of [-1, 1]) {
    const y = cy + s * 9.6;
    if (spec.shoulders === 'plates') { g.ellipsoid(cx + 0.5, y, 8.9, 3.3, 2.7, 2.5, 'a', 2.4); g.ellipsoid(cx + 0.5, y, 10.0, 2.5, 2.0, 1.2, 'A', 2.4); }
    else { g.ellipsoid(cx + 0.5, y, 8.6, 3.0, 2.6, 2.3, 'c', 2.4); g.ellipsoid(cx + 0.5, y, 9.8, 2.2, 1.9, 1.0, 'V', 2.4); }
  }
  // backpack (rear)
  if (spec.pack === 'radio') {
    g.ellipsoid(2.6, cy, 6.4, 2.8, 6.6, 3.6, 'K', 3.2);
    g.box(0, cy + 2, 4, 2, cy + 6.4, 8, 'k');                  // radio brick
    for (let i = 0; i < 3; i++) g.set(0, cy + 3 + i * 1.3, 7, 'y');   // dials
    g.set(0, cy + 3, 5, 'E');
    g.box(2.5, cy - 6.6, 9, 4.5, cy - 4.6, 10, 'k');            // strap buckle
    g.cyl(3.6, cy + 3.6, 9, 11, 1.1, 1.1, 'M');                 // antenna socket
  } else {
    g.ellipsoid(2.4, cy, 6.2, 2.8, 6.0, 3.4, 'K', 3);
    g.ellipsoid(1.4, cy, 8.8, 2.0, 3.8, 1.4, 'k', 2.6);         // rolled blanket
    g.box(1, cy - 5, 4, 2, cy - 3.6, 7, 'k'); g.box(1, cy + 3.6, 4, 2, cy + 5, 7, 'k');
    g.cyl(3.4, cy + 3.8, 9, 10.5, 1.0, 1.0, 'M');
  }
  // collar + neck
  g.cyl(cx, cy, 9, 13, 3.3, 3.6, 'T', 2.6);
  g.cyl(cx + 0.4, cy, 11, 13, 2.4, 2.4, 'n');
  return {id: `${spec.id}.torso`, unit: CELL, layerH: CELL, pivot: {x: cx, y: cy}, palette: palette(spec.c), grid: g, buckets: 48};
}

function headModel(spec) {
  const g = new VoxelGrid(14, 14, 11), cx = 6.6, cy = 7;
  g.cyl(cx, cy, 0, 2, 2.1, 2.1, 'n');
  g.ellipsoid(cx + 0.6, cy, 3.2, 4.2, 4.3, 2.6, 'n');
  const glass = (rx, ry, rz, zc, xc) => {
    g.ellipsoid(xc, cy, zc, rx, ry, rz, 'D', 2.6);
    // glass reads as a lighter, cooler plate on its exposed faces, with a lens glint
    g.topCoat('D', 'Z');
  };
  if (spec.helmet === 'visor') {
    g.ellipsoid(cx - 0.9, cy, 4.8, 5.0, 5.2, 4.2, 'h', 2.4);   // dome
    g.ellipsoid(cx - 1.6, cy, 8.0, 3.2, 1.0, 0.9, 'H', 2.4);    // ridge
    g.box(cx - 5, cy - 5.2, 5, cx - 3, cy + 5.2, 6, 'A');       // rear band
    glass(3.6, 4.5, 3.5, 5.1, cx + 2.7);                      // wrap-around visor, rising onto the dome so it reads from above
    for (let y = 2; y <= 11; y++) for (let z = 2; z <= 7; z++) for (let x = 13; x >= 0; x--) if (g.get(x, y, z) === 'D'.charCodeAt(0)) { g.set(x, y, z, z === 4 ? 'L' : 'D'); break; }
    for (let x = 13; x >= 3; x--) { let hit = false; for (let z = 8; z >= 3; z--) { const c = g.get(x, 4, z); if (c === 'Z'.charCodeAt(0)) { g.set(x, 4, z, 'l'); hit = true; break; } } if (hit) break; }
    for (const s of [-1, 1]) g.ellipsoid(cx - 0.8, cy + s * 5, 3.3, 1.6, 1.2, 1.6, 'M');    // ear cups
    g.set(cx + 4, cy - 4.4, 2, 'M'); g.set(cx + 5, cy - 4.4, 2, 'M'); g.set(cx + 5, cy - 3.4, 2, 'M'); // mic boom
  } else {
    g.ellipsoid(cx - 0.3, cy, 4.9, 5.0, 5.0, 3.8, 'h', 2.2);
    g.ellipsoid(cx + 4.8, cy, 4.0, 2.4, 4.4, 0.9, 'h', 3);       // brim
    g.ellipsoid(cx - 0.4, cy, 8.4, 2.2, 2.2, 0.9, 'H', 2.4);     // cap button
    g.cyl(cx - 3.2, cy, 5, 6, 3.0, 3.6, 'a');                    // rolled band
    glass(2.2, 4.2, 1.2, 3.6, cx + 4.2);                        // goggle band
    for (let y = 2; y <= 11; y++) for (let x = 13; x >= 0; x--) if (g.get(x, y, 3) === 'D'.charCodeAt(0) || g.get(x, y, 3) === 'Z'.charCodeAt(0)) { g.set(x, y, 3, 'L'); break; }
    for (const y of [4, 5]) for (let x = 13; x >= 0; x--) if (g.get(x, y, 3) === 'L'.charCodeAt(0)) { g.set(x, y, 3, 'l'); break; }
  }
  return {id: `${spec.id}.head`, unit: CELL, layerH: CELL, pivot: {x: cx, y: cy}, palette: palette(spec.c), grid: g, buckets: 48};
}

function armModel(spec) {
  const g = new VoxelGrid(8, 4, 3);
  g.rod(0, 8, 2, 1.5, 1.7, 1.4, 'c', 2.4);
  g.rod(6, 8, 2, 1.5, 1.6, 1.3, 'u', 2.4);
  g.ellipsoid(3.6, 2, 2.4, 1.3, 1.3, 0.6, 'q', 2.6);
  return {id: `${spec.id}.arm`, unit: CELL, layerH: CELL, pivot: {x: 0.5, y: 2}, palette: palette(spec.c), grid: g, buckets: 48};
}
function gloveModel(spec, side) {
  const g = new VoxelGrid(6, 6, 3);
  g.ellipsoid(3, 3, 1.4, 2.5, 2.3, 1.4, 'g', 2.6);
  g.ellipsoid(3.8, 3, 2.4, 1.2, 1.7, 0.6, 'G', 2.6);
  g.ellipsoid(2.2, side > 0 ? 1.0 : 5.0, 1.5, 1.3, 0.8, 0.9, 'g');
  return {id: `${spec.id}.glove${side > 0 ? 'R' : 'L'}`, unit: CELL, layerH: CELL, pivot: {x: 3, y: 3}, palette: palette(spec.c), grid: g, buckets: 48};
}
function magModel() {
  const g = new VoxelGrid(7, 4, 3);
  g.box(0, 0.5, 0, 6, 3.5, 3, 'm'); g.box(5, 0.5, 0, 7, 3.5, 3, 'y'); g.box(0, 1, 2, 5, 3, 3, 'y');
  return {id: 'mag', unit: 0.6, layerH: 0.6, pivot: {x: 3, y: 2}, palette: {m: '#3a3e48', y: '#d3ac55'}, grid: g, buckets: 32};
}

const kits = new Map();
/** The cached kit for a spec: {legs, torso, head, arm, gloveL, gloveR, mag, spec}. */
export function humanoidKit(spec) {
  let k = kits.get(spec.id);
  if (!k) { k = {spec, leg: legModel(spec), torso: torsoModel(spec), head: headModel(spec), arm: armModel(spec), gloveL: gloveModel(spec, -1), gloveR: gloveModel(spec, 1), mag: magModel()}; kits.set(spec.id, k); }
  return k;
}
export const KIT_SPECS = {player: PLAYER_SPEC, gunner: GUNNER_SPEC};
export const kitFor = (kind) => (KIT_SPECS[kind] ? humanoidKit(KIT_SPECS[kind]) : null);

// ---------------------------------------------------------------- guns
// Gun model: x grows along the barrel from `reach` (model x=0 is where drawGun started: stock sits behind it).
// The muzzle ends exactly at +L where L = gun.visual.length * 0.7, matching gunMuzzle(gun, reach).
const gunCache = new Map();
export function gunStack(gun, {enemy = false, noMag = false} = {}) {
  const vis = gun.visual, key = `${vis.art || gun.category}|${vis.length}|${vis.width}|${gun.color}|${enemy ? 1 : 0}|${noMag ? 1 : 0}`;
  let m = gunCache.get(key);
  if (!m) { m = buildGun(gun, enemy, noMag, key); gunCache.set(key, m); }
  return m;
}
export function gunGeometry(gun) {
  const L = gun.visual.length * 0.7, art = GUN_ART[gun.visual?.art] || GUN_ART[gun.category] || GUN_ART.SMG;
  return {L, rear: L * 0.18, front: L * (art.scope ? 0.5 : 0.58), art};
}
/** World units from a gun model's layer 0 up to the centre of its receiver (rigs lift the model by anchorZ minus this). */
export const GUN_RECEIVER_Z = 4.5 * GUN_UNIT;
function buildGun(gun, enemy, noMag, key) {
  const u = GUN_UNIT, art = GUN_ART[gun.visual?.art] || GUN_ART[gun.category] || GUN_ART.SMG;
  const L = gun.visual.length * 0.7, W = Math.max(3.2, gun.visual.width * 0.78);
  const Lc = Math.round(L / u), padC = Math.ceil(0.24 * Lc) + 2, Wc = W / u;
  const d = Math.ceil(Wc * 1.5) + 6 | 1, h = 10, cy = d / 2;
  const g = new VoxelGrid(padC + Lc + 3, d, h);
  const xf = (f) => padC + f * Lc;
  const accent = '#' + (gun.color & 0xffffff).toString(16).padStart(6, '0');
  const pal = {
    b: enemy ? '#403a49' : '#2a2c33', a: enemy ? '#5a5266' : '#3d4049', m: enemy ? '#b4b2bb' : '#8d8b92', A: accent, x: '#33363e', w: '#4a3a30',
    o: '#1f2128', L: {c: '#7fe0ff', emit: true}, y: '#d3ac55', k: '#555a63', t: {c: '#fff', emit: true}, G: enemy ? '#6b6377' : '#4b4f59',
  };
  const kindCh = {b: 'b', a: 'a', m: 'm'};
  const Z0 = 2;   // receiver base layer
  for (const [a, t, b, kind] of art.parts) {
    if (art.twin && kind === 'm') continue;
    const x0 = xf(Math.min(a, b)), x1 = xf(Math.max(a, b)), th = Math.max(1.2, W * t / u);
    if (x1 - x0 < 0.5) continue;
    if (kind === 'm') {
      g.ellipsoid((x0 + x1) / 2, cy, Z0 + 1.6, (x1 - x0) / 2, Math.min(th / 2, 2.2), Math.min(th / 2, 1.5), 'm', 2.2);  // barrel tube
    } else {
      const hz = kind === 'b' ? 2.5 : 2.0;
      g.ellipsoid((x0 + x1) / 2, cy, Z0 + hz, (x1 - x0) / 2, th / 2, hz, kindCh[kind], 3.4);
    }
  }
  if (art.twin) for (const s of [-1, 1]) g.ellipsoid((xf(0.46) + xf(1)) / 2, cy + s * Wc * 0.2, Z0 + 1.6, (xf(1) - xf(0.46)) / 2, 1.4, 1.2, 'm', 2.2);
  // accent stripe on top of the receiver, rear sight, front sight
  const sx0 = xf(0.2), sx1 = xf(0.42);
  g.box(sx0, cy - 0.6, Z0 + 4, sx1, cy + 0.6, Z0 + 5, 'A');
  g.set(xf(0.3), cy, Z0 + 5, 'b'); g.set(xf(0.3) - 1, cy, Z0 + 5, 'b');
  g.set(Lc + padC - 2, cy, Z0 + 3, 'b'); g.set(Lc + padC - 2, cy, Z0 + 4, 'b');
  // pistol grip + trigger guard (below the receiver)
  const gx = xf(art.parts.length > 1 ? 0.2 : 0.1);
  for (let z = 0; z < Z0 + 1; z++) g.ellipsoid(gx - (Z0 - z) * 0.5 + 1, cy, z + 0.5, 1.6, Math.min(2.2, Wc * 0.3), 0.5, 'x', 2.4);
  g.rod(gx + 3, gx + 6, cy, 1.0, 0.7, 0.5, 'k');
  // charging handle / bolt
  g.box(xf(0.34), cy - 0.5, Z0 + 4, xf(0.34) + 2, cy + 0.5, Z0 + 5, 'm');
  if (art.mag && !noMag) {
    const mx = xf(art.mag[0]), mw = Math.max(2, art.mag[1] * Lc), mt = Math.max(2, Wc * 0.55);
    for (let z = 0; z < Z0 + 2; z++) g.box(mx + (Z0 - z) * 0.5 - (z === 0 ? 0 : 0), cy - mt / 2, z, mx + mw + (Z0 - z) * 0.5, cy + mt / 2, z + 1, z === 0 ? 'y' : 'x');
  }
  if (art.extra === 'drum' && !noMag) g.cyl(xf(0.38), cy, 0, Z0 + 1, Wc * 0.55, Wc * 0.55, 'x');
  if (art.pump) { const px0 = xf(art.pump[0]), px1 = xf(art.pump[0] + art.pump[1]); g.ellipsoid((px0 + px1) / 2, cy, Z0 + 1.6, (px1 - px0) / 2, Math.max(2, Wc * art.pump[2] / 2), 2.2, 'w', 2.6); g.box(px0 + 1, cy - 0.5, Z0 + 3, px1 - 1, cy + 0.5, Z0 + 4, 'b'); }
  if (art.scope) {
    const s0 = xf(art.scope[0]), s1 = xf(art.scope[0] + art.scope[1]);
    g.box(s0 + 1, cy - 0.6, Z0 + 4, s0 + 2, cy + 0.6, Z0 + 6, 'k'); g.box(s1 - 2, cy - 0.6, Z0 + 4, s1 - 1, cy + 0.6, Z0 + 6, 'k');
    g.ellipsoid((s0 + s1) / 2, cy, Z0 + 6.4, (s1 - s0) / 2, 1.6, 1.4, 'o', 2.2);
    g.ellipsoid(s1 - 0.5, cy, Z0 + 6.4, 1.2, 1.4, 1.2, 'L');         // front lens
    g.set(s0 - 1, cy, Z0 + 6, 'b'); g.set(s0 - 1, cy, Z0 + 7, 'L');
    g.set(s1 - 1, cy, Z0 + 7, 't');
  }
  if (art.bipod) for (const s of [-1, 1]) { const bx = xf(0.66); for (let z = 0; z < Z0 + 1; z++) g.set(bx + (Z0 - z) * 0.6, cy + s * (Wc * 0.5 + (Z0 - z) * 0.9), z, 'k'); }
  g.topCoat('b', 'G');
  return {id: 'gun|' + key, unit: u, layerH: u, pivot: {x: padC, y: cy}, palette: pal, grid: g, buckets: 64};
}
