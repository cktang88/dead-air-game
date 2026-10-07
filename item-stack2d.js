// STACKED WORLD ITEMS: destructible crates (with damage stages and a tumbling-planks break), pickups (scrap, ammo, medkit,
// armor, mod, floor gun, supply drop, frequency radio), door / gate leaves and jamb posts, and the exit radio mast with its
// rotating light. Same engine, tilt, light and ink as the stacked characters (stack2d.js). Visual only: no collision change.
import {VoxelGrid, drawStack, drawContactShadow, STACK_TILT, hexMix} from './stack2d.js';
import {hash2, TAU} from './sprites2d.js';
import {gunStack, gunGeometry} from './models2d.js';

const mk = (id, grid, palette, pivot, opts = {}) => ({id, unit: opts.unit ?? 1, layerH: opts.layerH ?? opts.unit ?? 1, pivot, palette, grid, buckets: opts.buckets ?? 48});
const models = new Map();
const memo = (key, build) => { let m = models.get(key); if (!m) { m = build(); models.set(key, m); } return m; };
const pick = (v, list) => list[Math.floor(v * list.length) % list.length];

// ------------------------------------------------------------------ crates
const CRATE_PAL = ['#8a6244', '#7a5640', '#66473a'];
function buildCrate(stage, variant) {
  const g = new VoxelGrid(28, 28, 22), r = (s) => hash2(variant * 31 + s, stage * 7 + 3, 77);
  const dim = stage === 0 ? 1 : stage === 1 ? 0.92 : 0.84;
  const pal = {a: hexMix('#b07a48', '#000000', 1 - dim), b: hexMix('#a06c3c', '#000000', 1 - dim), c: hexMix('#8c5a34', '#000000', 1 - dim), d: hexMix('#bc8650', '#000000', 1 - dim),
    f: hexMix('#5a3520', '#000000', 1 - dim), k: '#140b07', n: '#d4c8b2', s: '#ddd6c2', h: '#e6cfa4', m: '#2a1a12', r: '#b8923a'};
  const wood = ['a', 'b', 'c', 'd'];
  // dark core so gaps and missing slats show the inside
  g.box(3, 3, 1, 25, 25, 18, 'k');
  // skids and rims
  g.box(1, 1, 0, 27, 4, 1, 'f'); g.box(1, 24, 0, 27, 27, 1, 'f'); g.box(1, 1, 0, 4, 27, 1, 'f'); g.box(24, 1, 0, 27, 27, 1, 'f');
  const missing = new Set();
  if (stage >= 1) missing.add('S1');
  if (stage >= 1 && r(1) > 0.5) missing.add('E0');
  if (stage >= 2) { missing.add('S0'); missing.add('S2'); missing.add('E1'); missing.add('N1'); }
  const sides = [['S', 24, 27, null], ['N', 1, 4, null], ['E', null, null, 24], ['W', null, null, 1]];
  for (const [sid, y0, y1, x0] of sides) {
    for (let lv = 0; lv < 3; lv++) {
      const z0 = 1 + lv * 5, id = sid + lv;
      if (missing.has(id)) {
        // splintered stubs where the slat tore off
        for (let i = 0; i < 4; i++) { const t = 4 + Math.floor(r(10 + lv * 4 + i) * 20); if (y0 !== null) g.set(t, y0 + 1, z0 + (i % 2), 'h'); else g.set(x0 + 1, t, z0 + (i % 2), 'h'); }
        continue;
      }
      const col = wood[Math.floor(r(20 + lv * 5 + sid.charCodeAt(0)) * 4)];
      if (y0 !== null) g.box(2, y0, z0, 26, y1 - 1, z0 + 4, col); else g.box(x0, 2, z0, x0 + 2, 26, z0 + 4, col);
      // grain streaks and a knot
      for (let i = 0; i < 5; i++) { const t = 3 + Math.floor(r(40 + i + lv * 9) * 22), zz = z0 + 1 + (i % 3); if (y0 !== null) g.set(t, y1 - 2, zz, 'f'); else g.set(x0 + 1, t, zz, 'f'); }
      if (stage >= 1 && lv === 1 && sid === 'S') for (let i = 0; i < 6; i++) g.set(5 + i * 2.2, y1 - 2 + 0, z0 + 2 - (i % 2 === 0 ? 0 : 1), 'm'); // split crack
    }
  }
  // posts
  for (const [px, py] of [[1, 1], [24, 1], [1, 24], [24, 24]]) g.box(px, py, 0, px + 3, py + 3, 17, 'f');
  // nails on the south face posts
  for (const px of [2, 25]) for (const z of [3, 8, 13]) g.set(px, 26, z, 'n');
  // top rim
  g.box(1, 1, 16, 27, 4, 18, 'f'); g.box(1, 24, 16, 27, 27, 18, 'f'); g.box(1, 1, 16, 4, 27, 18, 'f'); g.box(24, 1, 16, 27, 27, 18, 'f');
  // lid planks (run along y) with two cross battens
  const lidMissing = stage >= 2 ? new Set([1, 3]) : new Set();
  for (let i = 0; i < 5; i++) {
    const x0 = 4 + i * 4.4;
    if (lidMissing.has(i)) { g.box(x0 + 0.4, 4, 17, x0 + 3.6, 24, 18, 0); continue; }
    const col = wood[Math.floor(r(60 + i) * 4)], drop = stage >= 1 && i === 2 ? 1 : 0;
    g.box(x0, 4, 17 - drop, x0 + 3.9, 24, 19 - drop, col);
    if (stage >= 2 && i === 4) for (let y = 4; y < 24; y++) g.set(x0 + 1, y, 19 - Math.floor(y / 8) + 2, 'a');
  }
  g.box(3, 5, 19, 25, 7.6, 20, 'f'); g.box(3, 20.4, 19, 25, 23, 20, 'f');
  for (let i = 0; i < 5; i++) { const nx = 5.2 + i * 4.4; g.set(nx, 6, 20, 'n'); g.set(nx, 21.6, 20, 'n'); }
  // stencil on the lid between the battens
  const st = (x, y) => g.set(x, y, 19, 's');
  if (variant === 0) { for (let y = 10; y < 19; y++) { st(13, y); st(14, y); } for (let k = 0; k < 4; k++) { st(13 - k, 9 + k + 1); st(14 + k, 9 + k + 1); } for (let x = 9; x < 19; x++) st(x, 19); }
  else if (variant === 1) { for (const rad of [3, 5.5, 8]) for (let a = -2.4; a < -0.74; a += 0.12) st(14 + Math.cos(a) * rad, 19 + Math.sin(a) * rad * 0.95); for (let y = 17; y < 20; y++) st(14, y); }
  else { for (let k = 0; k < 4; k++) { st(10 + k, 10 + k); st(18 - k, 10 + k); } for (let y = 14; y < 18; y++) st(14, y); for (let x = 11; x < 18; x++) st(x, 18); }
  // chipped paint
  for (let i = 0; i < 8; i++) { const x = 9 + Math.floor(r(80 + i) * 11), y = 9 + Math.floor(r(90 + i) * 10); if (g.get(x, y, 19) === 's'.charCodeAt(0) && r(100 + i) > 0.4) g.set(x, y, 19, 'a'); }
  // stencilled batch number on the south face
  for (let i = 0; i < 4; i++) { const x = 8 + i * 3; if (!missing.has('S1')) { g.set(x, 26, 8, 's'); g.set(x, 26, 9, 's'); if (r(110 + i) > 0.5) g.set(x + 1, 26, 8, 's'); } }
  // splinters bristling off the edges
  if (stage >= 1) for (let i = 0; i < 3 + stage * 3; i++) { const x = 3 + Math.floor(r(120 + i) * 21), y = 3 + Math.floor(r(130 + i) * 21); if (g.has(x, y, 19)) g.set(x, y, 20, 'h'); }
  if (stage >= 1) { let x = 8, y = 8; for (let i = 0; i < 12; i++) { g.set(x, y, 19, 'm'); y += 1; x += r(140 + i) > 0.5 ? 1 : -1; } }
  return mk(`crate.${stage}.${variant}`, g, pal, {x: 14, y: 14}, {buckets: 48});
}
export const crateModel = (stage, variant) => memo(`crate.${stage}.${variant}`, () => buildCrate(stage, variant));

// ------------------------------------------------------------------ debris (stacked planks tumbling and settling)
function buildPlank(len, w, tone) {
  const g = new VoxelGrid(len, w, 2), cols = ['#9a7050', '#8a6244', '#a47a58'], col = cols[tone % 3];
  g.box(0, 0, 0, len, w, 2, 'a');
  for (let x = 2; x < len - 1; x += 3) g.set(x, 1 % w, 1, 'f');
  g.set(len - 2, w / 2, 1, 'n'); g.set(1, w / 2, 1, 'n');
  for (let y = 0; y < w; y++) { g.set(0, y, 0, y % 2 ? 0 : 'h'); g.set(len - 1, y, 0, y % 2 ? 'h' : 0); } // ragged ends
  return mk(`deb.plank.${len}.${w}.${tone}`, g, {a: col, f: '#4f3524', n: '#d4c8b2', h: '#e6cfa4'}, {x: len / 2, y: w / 2}, {buckets: 32});
}
const debrisModel = (kind, tone) => memo(`deb.${kind}.${tone}`, () => kind === 'plank' ? buildPlank(15, 3, tone) : kind === 'short' ? buildPlank(8, 3, tone) : kind === 'slat' ? buildPlank(11, 2, tone) : buildPlank(4, 1, tone));
const POOL = 72;
const debris = [];
export const debrisState = {live: 0};
function newPiece() { for (const p of debris) if (!p.on) return p; if (debris.length < POOL) { const p = {on: false}; debris.push(p); return p; } return null; }
/** One airborne piece. Pure data; stepDebris advances it. */
export function spawnPiece(kind, x, y, z, vx, vy, vz, rnd = Math.random) {
  const p = newPiece(); if (!p) return null;
  Object.assign(p, {on: true, kind, tone: Math.floor(rnd() * 3), x, y, z, vx, vy, vz, yaw: rnd() * TAU, spin: (rnd() - 0.5) * 22, flip: rnd() * TAU, flipRate: 8 + rnd() * 10, bounces: 0, rest: 0, age: 0, life: 7 + rnd() * 3});
  return p;
}
/** Break burst: planks, slats and splinters fly out, bounce and settle. */
export function spawnCrateDebris(x, y, stage = 2, rnd = Math.random) {
  const n = [['plank', 3], ['short', 2], ['slat', 3], ['chip', 7]];
  for (const [kind, c] of n) for (let i = 0; i < c; i++) {
    const a = rnd() * TAU, sp = kind === 'chip' ? 70 + rnd() * 150 : 55 + rnd() * 120;
    spawnPiece(kind, x + Math.cos(a) * 5, y + Math.sin(a) * 5, 6 + rnd() * 12, Math.cos(a) * sp, Math.sin(a) * sp, 90 + rnd() * 140, rnd);
  }
}
/** A hit knocks a few chips loose. */
export function spawnCrateChips(x, y, n = 3, rnd = Math.random) {
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, sp = 40 + rnd() * 90; spawnPiece(rnd() > 0.6 ? 'slat' : 'chip', x + Math.cos(a) * 9, y + Math.sin(a) * 9, 10 + rnd() * 5, Math.cos(a) * sp, Math.sin(a) * sp, 70 + rnd() * 80, rnd); }
}
export function stepDebris(dt) {
  dt = Math.min(dt, 1 / 30); let live = 0;
  for (const p of debris) {
    if (!p.on) continue;
    p.age += dt; live++;
    if (p.age > p.life) { p.on = false; continue; }
    if (p.z > 0 || p.vz > 0) {
      p.vz -= 560 * dt; p.z += p.vz * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.yaw += p.spin * dt; p.flip += p.flipRate * dt;
      if (p.z <= 0) {
        p.z = 0;
        if (Math.abs(p.vz) > 55 && p.bounces < 3) { p.vz = -p.vz * 0.36; p.vx *= 0.55; p.vy *= 0.55; p.spin *= 0.5; p.flipRate *= 0.5; p.bounces++; }
        else { p.vz = 0; p.rest = 1; }
      }
    } else {
      p.vx *= Math.max(0, 1 - 9 * dt); p.vy *= Math.max(0, 1 - 9 * dt); p.spin *= Math.max(0, 1 - 10 * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.yaw += p.spin * dt; p.flip = 0;
    }
  }
  debrisState.live = live;
}
export function drawDebris(ctx, b) {
  for (const p of debris) {
    if (!p.on || p.x < b.x0 - 30 || p.x > b.x1 + 30 || p.y < b.y0 - 30 || p.y > b.y1 + 30) continue;
    const fade = p.age > p.life - 1.2 ? Math.max(0, (p.life - p.age) / 1.2) : 1, air = p.z > 0.1;
    if (air) drawContactShadow(ctx, p.x + p.z * 0.1, p.y + 1, 4, 2, 0.35 * fade);
    const sy = air ? 0.4 + 0.6 * Math.abs(Math.cos(p.flip)) : 1;
    drawStack(ctx, debrisModel(p.kind, p.tone), p.x, p.y, {yaw: p.yaw, z: p.z, sy, alpha: fade});
  }
}

const sortBuf = [];
/** Draws the visible crates back to front. `now` = seconds. */
export function drawCrates(ctx, crates, b, now, bar) {
  sortBuf.length = 0;
  for (const c of crates) if (c.x > b.x0 - 40 && c.x < b.x1 + 40 && c.y > b.y0 - 50 && c.y < b.y1 + 40) sortBuf.push(c);
  sortBuf.sort((a, c) => a.y - c.y);
  for (const crate of sortBuf) {
    const stage = crate.damageStage || 0, variant = Math.floor(hash2(Math.round(crate.x), Math.round(crate.y), 5) * 3), w = crate.wob;
    const v = crate.vis ??= {stage};
    if (stage > v.stage) { spawnCrateChips(crate.x, crate.y, 4 + stage * 2); v.stage = stage; }
    const x = crate.x + (w ? w.x : 0), y = crate.y + (w ? w.y : 0);
    drawContactShadow(ctx, x + 1.5, y + 2, 17, 15, 0.55);
    drawStack(ctx, crateModel(stage, variant), x, y, {yaw: w ? w.r * 0.12 : 0, flash: crate.flash > 0 ? crate.flash * 0.6 : 0, flashColor: '#fff4e0'});
    if (crate.healthBarTimer > 0) bar(crate, stage);
  }
}

// ------------------------------------------------------------------ pickups (unit 0.5 world units per cell)
const U = 0.5, NOTE = (t) => t;
function hexIn(cx, cy, x, y, R) { const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy); return dy <= R * 0.866 && dx * 0.866 + dy * 0.5 <= R * 0.866; }
function scrapModel(color) {
  return memo('pk.scrap.' + color, () => {
    const g = new VoxelGrid(42, 42, 12), c = 21;
    const pal = {n: color, N: hexMix(color, '#ffffff', 0.45), d: hexMix(color, '#000000', 0.5), g: '#7b7a82', G: '#a3a2aa', k: '#17141c'};
    // gear underneath: 8 teeth
    for (let y = 0; y < 42; y++) for (let x = 0; x < 42; x++) { const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), tooth = Math.cos(a * 8) > 0.2 ? 20 : 17; if (d < tooth && d > 5) { g.set(x, y, 0, 'g'); g.set(x, y, 1, d < 17 ? 'g' : 'G'); } }
    // hex nut on top, chamfered, with a threaded hole
    for (let z = 2; z < 9; z++) for (let y = 0; y < 42; y++) for (let x = 0; x < 42; x++) { const R = z >= 8 ? 10.4 : z >= 7 ? 11.4 : 12.4; if (hexIn(c, c, x, y, R) && Math.hypot(x + 0.5 - c, y + 0.5 - c) > 5.4) g.set(x, y, z, z >= 8 ? 'N' : z === 2 ? 'd' : 'n'); }
    for (let z = 2; z < 9; z++) for (let y = 0; y < 42; y++) for (let x = 0; x < 42; x++) { const d = Math.hypot(x + 0.5 - c, y + 0.5 - c); if (d < 5.4 && d > 4.2 && z % 2) g.set(x, y, z, 'k'); }
    return mk('pk.scrap.' + color, g, pal, {x: c, y: c}, {unit: U, buckets: 32});
  });
}
function ammoModel() {
  return memo('pk.ammo', () => {
    const g = new VoxelGrid(40, 30, 16), pal = {b: '#3f6f7c', B: '#2f5560', l: '#52879a', y: '#d9b45a', c: '#8fe0ff', k: '#17141c', g: '#c9c4b0', w: '#e8e4d0'};
    g.ellipsoid(20, 15, 6.4, 18.4, 12.4, 6.4, 'b', 5); g.box(2, 3, 0, 38, 27, 2, 'B');
    g.box(1.5, 2.5, 7, 38.5, 27.5, 12, 'l');                       // lid
    g.box(2, 24, 3, 38, 27, 6, 'c');                              // cyan band on the front
    g.box(2, 4, 11, 38, 5, 12, 'B'); g.box(2, 25, 11, 38, 26, 12, 'B');
    for (let i = 0; i < 3; i++) { g.box(8 + i * 9, 8, 12, 12 + i * 9, 20, 13, 'y'); g.box(8 + i * 9, 8, 13, 12 + i * 9, 11, 14, 'g'); }  // three cartridges stencilled on the lid
    g.box(15, 12, 12, 25, 18, 14, 'k'); g.box(16, 13, 14, 24, 17, 15, 'k');  // folding handle
    g.set(4, 26, 5, 'w'); g.set(36, 26, 5, 'w');
    return mk('pk.ammo', g, pal, {x: 20, y: 15}, {unit: U, buckets: 32});
  });
}
function medModel() {
  return memo('pk.med', () => {
    const g = new VoxelGrid(34, 28, 16), pal = {w: '#f4fff9', s: '#bde8d2', G: '#25b673', g: '#17935a', k: '#2a3236', h: '#ffffff', r: '#c9d8d0'};
    g.ellipsoid(17, 14, 5.4, 16.2, 12.6, 5.4, 'w', 4.5);
    g.box(1.5, 13, 5, 32.5, 15, 6, 's');                          // lid seam
    g.box(14, 5, 10, 20, 23, 12, 'G'); g.box(8, 11, 10, 26, 17, 12, 'G'); g.box(14.6, 5.6, 12, 19.4, 22.4, 12.6, 'g'); g.box(8.6, 11.6, 12, 25.4, 16.4, 12.6, 'g');
    g.box(12, 11, 11, 22, 14, 12, 'G');
    g.box(10, 2, 10, 24, 4, 14, 'k'); g.box(10, 2, 13, 24, 3, 15, 'k');       // carry handle
    g.set(4, 27, 4, 'r'); g.set(29, 27, 4, 'r');
    return mk('pk.med', g, pal, {x: 17, y: 14}, {unit: U, buckets: 32});
  });
}
function inPoly(poly, x, y) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }
function armorModel() {
  return memo('pk.armor', () => {
    const g = new VoxelGrid(40, 44, 12), pal = {p: '#75cfe0', P: '#a9ecf7', d: '#3f8fa1', k: '#17141c', r: '#d6e6ea', y: '#e5b524'};
    const poly = [[20, 2], [38, 11], [34, 31], [20, 42], [6, 31], [2, 11]];
    for (let z = 0; z < 6; z++) for (let y = 0; y < 44; y++) for (let x = 0; x < 40; x++) {
      if (!inPoly(poly, x + 0.5, y + 0.5)) continue;
      let inner = true; if (z >= 2) { const k = (z - 1) * 0.9; for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) if (!inPoly(poly, x + 0.5 + dx, y + 0.5 + dy)) inner = false; }
      if (inner) g.set(x, y, z, z < 1 ? 'd' : z < 2 ? 'p' : 'p');
    }
    for (let y = 8; y < 36; y++) for (let x = 18; x < 22; x++) if (g.has(x, y, 3)) { g.set(x, y, 4, 'P'); g.set(x, y, 5, y % 6 === 0 ? 'k' : 'P'); }
    for (const [x, y] of [[8, 13], [32, 13], [10, 28], [30, 28], [20, 36]]) if (g.has(x, y, 3)) g.set(x, y, 4, 'r');
    for (let x = 8; x < 32; x++) { const y = 16 + Math.abs(x - 20) * 0.5; if (g.has(x, Math.floor(y), 3)) g.set(x, Math.floor(y), 4, 'y'); }
    return mk('pk.armor', g, pal, {x: 20, y: 22}, {unit: U, buckets: 32});
  });
}
function modModel(color) {
  return memo('pk.mod.' + color, () => {
    const g = new VoxelGrid(38, 38, 13), c = 19, pal = {c: color, C: hexMix(color, '#ffffff', 0.4), d: hexMix(color, '#000000', 0.6), D: hexMix(color, '#000000', 0.78), k: '#17141c', y: '#d3ac55', g: '#8d8b92'};
    g.ellipsoid(c, c, 3, 16, 16, 3, 'D', 4.5);                          // dark housing
    g.ellipsoid(c, c, 6, 14.2, 14.2, 2, 'd', 4);                         // coloured top plate
    g.ellipsoid(c, c, 8.5, 12.6, 12.6, 1.2, 'c', 4);
    for (let a = 0; a < 24; a++) { const th = a * TAU / 24; g.set(c + Math.cos(th) * 10.4, c + Math.sin(th) * 10.4, 9, 'C'); }
    for (const [x, y] of [[6, 6], [32, 6], [6, 32], [32, 32]]) { g.set(x, y, 8, 'g'); g.set(x, y, 9, 'g'); }
    for (let i = 0; i < 8; i++) { g.box(8 + i * 3, 33, 1, 9.6 + i * 3, 37, 3, 'y'); }  // gold contact fingers on the south edge
    return mk('pk.mod.' + color, g, pal, {x: c, y: c}, {unit: U, buckets: 32});
  });
}
function supplyModel() {
  return memo('pk.supply', () => {
    const g = new VoxelGrid(46, 40, 34), pal = {w: '#d9a04a', W: '#b57e35', d: '#7c5528', f: '#4a3218', k: '#17141c', y: '#ffe28a', o: '#e8742c', c: '#f3efe2', C: '#d95f1c', t: '#cdbfa0', L: {c: '#ff5a5a', emit: true}, g: '#8d8b92'};
    g.box(8, 8, 0, 38, 32, 14, 'w'); g.box(7, 7, 0, 39, 9, 14, 'd'); g.box(7, 31, 0, 39, 33, 14, 'd');
    for (const x of [14, 31]) { g.box(x, 6.5, 0, x + 2.4, 33.5, 14.6, 'f'); }                       // straps
    g.box(9, 9, 13, 37, 31, 15, 'W'); g.box(18, 14, 15, 28, 26, 16, 'f'); g.box(19, 15, 16, 27, 25, 17, 'y'); g.box(21, 18, 17, 25, 22, 18, 'k');
    for (let z = 3; z < 11; z += 4) g.box(9, 32, z, 37, 33, z + 1, 'f');
    // folded parachute draped over the back of the crate
    for (let a = 0; a < 6; a++) { const th = -2.6 + a * 0.35; g.ellipsoid(15 + a * 3.2, 10 + Math.sin(a * 1.1) * 2, 16.5 + (a % 2) * 0.8, 4.4, 5.6, 2.6, a % 2 ? 'c' : 'C', 2.4); }
    g.ellipsoid(10, 20, 9, 4, 8, 6, 'c', 2.3); g.ellipsoid(7, 14, 4, 3.4, 5, 3, 'C', 2.3);
    for (let k = 0; k < 6; k++) { g.set(14 + k * 3.4, 10 + k, 16 - (k % 3), 't'); }
    // beacon mast with a red lamp
    g.box(35, 11, 15, 36.2, 12.2, 31, 'g'); g.ellipsoid(35.6, 11.6, 32, 1.8, 1.8, 1.8, 'L');
    g.box(33, 11, 22, 38.4, 12, 23, 'g');
    return mk('pk.supply', g, pal, {x: 23, y: 20}, {unit: U, buckets: 32});
  });
}
function radioModel() {
  return memo('pk.radio', () => {
    const g = new VoxelGrid(38, 26, 30), pal = {w: '#7a5436', W: '#946a46', k: '#17141c', K: '#2c2a31', m: '#c8c3b4', M: '#e4dfcf', e: {c: '#9ad8ff', emit: true}, E: {c: '#e8fbff', emit: true}, r: '#d14a3a', g: '#8d8b92', y: '#e5b524'};
    g.ellipsoid(19, 13, 8, 17.4, 11.4, 8, 'w', 4.2);
    g.box(2, 3, 0, 36, 24, 2, 'k');
    // front: speaker grille left, glowing dial window right
    for (let z = 3; z < 13; z++) for (let x = 4; x < 17; x++) g.set(x, 24, z, (x + z) % 2 ? 'K' : 'W');
    for (let z = 4; z < 11; z++) for (let x = 21; x < 33; x++) g.set(x, 24, z, 'e');
    for (let x = 21; x < 33; x++) { g.set(x, 24, 4, 'm'); g.set(x, 24, 10, 'm'); } for (const z of [4, 5, 6, 7, 8, 9, 10]) { g.set(21, 24, z, 'm'); g.set(32, 24, z, 'm'); }
    g.set(27, 24, 7, 'r'); g.set(27, 24, 8, 'r'); g.set(27, 24, 6, 'r');
    // top: tuning knobs, dial glow strip, handle and telescoping antenna with an emissive tip
    g.cyl(8, 10, 14, 17, 2.4, 2.4, 'm', 2); g.cyl(30, 10, 14, 17, 2.4, 2.4, 'm', 2); g.set(8, 8.4, 17, 'r'); g.set(30, 8.4, 17, 'r');
    g.box(13, 9, 15, 25, 17, 16, 'e');
    g.box(33, 4, 15, 34.2, 5.2, 29, 'g'); g.ellipsoid(33.6, 4.6, 29, 1.6, 1.6, 1.6, 'E');
    g.box(12, 20, 15, 26, 22, 17, 'K');
    return mk('pk.radio', g, pal, {x: 19, y: 13}, {unit: U, buckets: 32});
  });
}
const hashPos = (x, y) => { let h = Math.imul(Math.round(x) * 73856093 ^ Math.round(y) * 19349663, 1274126177); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
/**
 * Draws a pickup as a stacked object at the ctx origin (callers translate to the pickup and apply bob / pop).
 * Returns false for kinds that keep their flat art (locker, claimed supply).
 */
export function drawPickupStack(ctx, pk, t, ph, color, drawIcon, MOD_ICON, GUNS) {
  const spin = Math.sin(t * 1.4 + ph) * 0.45, base = 5.5;
  switch (pk.kind) {
    case 'scrap': drawStack(ctx, scrapModel(color), 0, base, {yaw: t * 0.9 + ph, z: 1.4, sx: 1.18, sy: 1.18}); return true;
    case 'ammo': drawStack(ctx, ammoModel(), 0, base, {yaw: spin * 0.9 - 0.2, z: 1.2, sx: 1.3, sy: 1.3}); return true;
    case 'heal': drawStack(ctx, medModel(), 0, base, {yaw: spin * 0.9, z: 1.2, sx: 1.25, sy: 1.25}); return true;
    case 'armor': drawStack(ctx, armorModel(), 0, base + 1, {yaw: t * 0.7 + ph, z: 1.2, sx: 1.2, sy: 1.2}); return true;
    case 'freq': drawStack(ctx, radioModel(), 0, base + 1, {yaw: spin - 0.15, z: 1.6, sx: 1.25, sy: 1.25}); return true;
    case 'supply': if (pk.claimed) return false; drawStack(ctx, supplyModel(), 0, base + 2, {yaw: 0.12 + spin * 0.25, z: 0.5, sx: 1.2, sy: 1.2}); return true;
    case 'mod': {
      ctx.strokeStyle = color + '8c'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.lineDashOffset = -t * 8; ctx.beginPath(); ctx.arc(0, 1, 13, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      drawStack(ctx, modModel(color), 0, base + 1, {yaw: spin * 0.35, z: 1.2, sx: 1.2, sy: 1.2});
      drawIcon(ctx, MOD_ICON[pk.modId] || 'pickup-mod', 0, -3.4, 10, '#fff');
      return true;
    }
    case 'gun': {
      const gun = GUNS[pk.gunIndex]; if (!gun) return false;
      ctx.strokeStyle = color + '8c'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.lineDashOffset = -t * 8; ctx.beginPath(); ctx.arc(0, 2, 15, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const yaw = -0.3 + spin * 0.55, L = gunGeometry(gun).L * 0.9;
      drawContactShadow(ctx, 0, base + 1, L * 0.5, 3.5, 0.4);
      drawStack(ctx, gunStack(gun), -Math.cos(yaw) * L / 2, base - Math.sin(yaw) * L / 2, {yaw, z: 1.8, sx: 0.9, sy: 0.9});
      return true;
    }
    default: return false;
  }
}
void NOTE; void hashPos; void STACK_TILT; void pick;

// ------------------------------------------------------------------ door / gate leaves, jambs, exit mast
function panelModel(len, kind, col) {
  return memo(`panel.${kind}.${Math.round(len)}.${col}`, () => {
    const L = Math.round(len), D = 12, H = kind === 'gate' ? 16 : 15, g = new VoxelGrid(L, D, H);
    const pal = {a: kind === 'gate' ? '#3a3340' : '#4a5160', A: kind === 'gate' ? '#4b4452' : '#5c6578', d: '#221d28', k: '#17141c', y: col, b: '#8d8b92', e: {c: col, emit: true}, g: '#2a2f3a'};
    g.box(0, 0, 0, L, D, H - 2, 'a'); g.box(1, 1, H - 2, L - 1, D - 1, H - 1, 'A'); g.box(2, 2, H - 1, L - 2, D - 2, H, 'A');
    g.box(0, 0, 0, L, D, 2, 'd');
    // ribs
    for (let x = Math.round(L / 3); x < L - 2; x += Math.round(L / 3)) g.box(x - 0.5, 0, 2, x + 0.5, D, H - 2, 'k');
    if (kind === 'gate') {
      // hazard chevrons on the front face rows and the top
      for (let z = 3; z < H - 2; z++) for (let x = 0; x < L; x++) if (((x + z * 1.6) / 6 | 0) % 2 === 0) { g.set(x, D - 1, z, 'y'); g.set(x, D - 2, z, 'y'); }
      for (let y = 2; y < D - 2; y++) for (let x = 2; x < L - 2; x++) if (((x + y) / 5 | 0) % 2 === 0) g.set(x, y, H - 1, 'y'); else g.set(x, y, H - 1, 'k');
    } else {
      g.box(3, D - 1, H - 6, L - 3, D, H - 5, 'e');                // status light slit on the front
      for (let x = 4; x < L - 3; x += 7) { g.set(x, D - 1, 4, 'b'); g.set(x, D - 1, 5, 'b'); }
      g.box(4, 3, H - 1, L - 4, 4, H, 'g');
    }
    for (let x = 3; x < L - 2; x += 6) { g.set(x, 1, H - 1, 'b'); g.set(x, D - 2, H - 1, 'b'); }
    return mk(`panel.${kind}.${L}.${col}`, g, pal, {x: L / 2, y: D / 2}, {buckets: 16});
  });
}
/** A sliding leaf centred at world (x,y): vertical rotates it a quarter turn. */
export function drawPanel(ctx, x, y, vertical, len, kind, col, alpha = 1, z = 0) {
  drawStack(ctx, panelModel(len, kind, col), x, y, {yaw: vertical ? Math.PI / 2 : 0, alpha, z});
}
function postModel(col) {
  return memo('post.' + col, () => {
    const g = new VoxelGrid(8, 8, 17), pal = {a: '#59527a', k: '#17141c', e: {c: col, emit: true}, A: '#7a738f'};
    g.box(0, 0, 0, 8, 8, 16, 'a'); g.box(1, 1, 16, 7, 7, 17, 'A'); g.box(0, 0, 0, 8, 8, 2, 'k'); g.box(3, 7, 9, 5, 8, 12, 'e'); g.box(3, 3, 16, 5, 5, 17, 'e');
    return mk('post.' + col, g, pal, {x: 4, y: 4}, {buckets: 1});
  });
}
export const drawPost = (ctx, x, y, col, alpha = 1) => drawStack(ctx, postModel(col), x, y, {yaw: 0, alpha});

function mastModels(col) {
  return memo('mast.' + col, () => {
    const pal = {s: '#3d3847', S: '#5a5466', k: '#17141c', y: '#e5b524', L: {c: col, emit: true}, w: '#cfc9bd', g: '#8d8b92'};
    const base = new VoxelGrid(28, 28, 40), c = 14;
    base.cyl(c, c, 0, 2, 13, 13, 'S', 3); base.cyl(c, c, 2, 3, 11, 11, 's', 3);
    for (let a = 0; a < 16; a++) { const th = a * TAU / 16; base.set(c + Math.cos(th) * 11.6, c + Math.sin(th) * 11.6, 2, a % 2 ? 'y' : 'k'); }
    // four tapering legs, cross braces
    for (let z = 3; z < 34; z++) { const r = 5 - (z - 3) * 0.11; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) base.set(c + sx * r - 0.5, c + sy * r - 0.5, z, 'g'); if (z % 7 === 3) for (let k = -r; k <= r; k++) { base.set(c + k, c - r, z, 's'); base.set(c + k, c + r, z, 's'); base.set(c - r, c + k, z, 's'); base.set(c + r, c + k, z, 's'); } }
    for (let z = 3; z < 31; z++) { const r = 5 - (z - 3) * 0.11, k = ((z - 3) % 7) / 7 * 2 * r - r; base.set(c + k, c + r, z, 'k'); }
    base.cyl(c, c, 34, 36, 3.4, 3.4, 'S', 2);
    const head = new VoxelGrid(16, 16, 4), h = 8;   // yagi-style antenna head, rotates
    head.box(0.5, 7.4, 0, 15.5, 8.6, 1.5, 'g');
    for (let i = 0; i < 5; i++) { const x = 2 + i * 3, hl = 6 - i * 0.9; head.box(x, h - hl, 1, x + 1, h + hl, 2, i === 0 ? 'w' : 'S'); }
    head.cyl(h, h, 0, 3, 1.2, 1.2, 'k');
    const lamp = new VoxelGrid(12, 12, 7);   // rotating beacon drum with a lit slit
    lamp.cyl(6, 6, 0, 2, 4.4, 4.4, 'k'); lamp.cyl(6, 6, 2, 6, 3.6, 3.6, 's'); lamp.box(6.2, 4.2, 2, 11.6, 7.8, 5.6, 'L'); lamp.cyl(6, 6, 6, 7, 2.4, 2.4, 'S');
    return {base: mk('mast.base.' + col, base, pal, {x: c, y: c}, {buckets: 1}), head: mk('mast.head.' + col, head, pal, {x: h, y: h}, {buckets: 32}), lamp: mk('mast.lamp.' + col, lamp, pal, {x: 6, y: 6}, {buckets: 32})};
  });
}
/** The exit's radio mast: lattice tower, spinning antenna, rotating light. (x,y) = ground point under the mast. */
export function drawExitMast(ctx, x, y, t, ready, col) {
  const m = mastModels(col), sw = t * (ready ? 2.0 : 1.1);
  drawContactShadow(ctx, x + 2, y + 2, 13, 9, 0.5);
  drawStack(ctx, m.base, x, y, {yaw: 0});
  drawStack(ctx, m.head, x, y, {yaw: sw * 0.5, z: 36});
  drawStack(ctx, m.lamp, x, y, {yaw: sw * 1.6, z: 39});
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const a = 0.35 + 0.35 * Math.max(0, Math.sin(sw * 1.6 * 1)), ly = y - 40 * STACK_TILT;
  ctx.fillStyle = col; ctx.globalAlpha = a * 0.5; ctx.beginPath(); ctx.arc(x + Math.cos(sw * 1.6) * 5, ly, 5, 0, TAU); ctx.fill(); ctx.restore();
}
