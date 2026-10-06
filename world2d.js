// Static world art: floor, walls, shadows and door frames baked into offscreen canvas chunks.
// A frame only blits the visible chunks; persistent decals (blood, scorch, casings) are stamped onto the floor chunks.
import {TILE} from './catalog.js';
import {INK, TAU, actorSprite, corpseSprite, hash2, makeCanvas, mix, rgba, seeded, shade} from './sprites2d.js';
import {blotch, carpetTile, dirtTile, grimeTile, steelPlateTile, voidTile, wallTile} from './textures2d.js';
import {paintFloorTile} from './floors2d.js';
import {LIGHT, coverStyle, lampPool, paintCover, paintDecor, shadowKey, COVER_HEIGHT} from './props2d.js';

export const CHUNK_TILES = 12;
const CW = CHUNK_TILES * TILE;
const FLOOR = '#6a5f56';
const WALL_LIP = 5;
const WALL_LIP_E = 3.4;
const WALL_SHADOW = COVER_HEIGHT.wall;
const isOpen = (k) => k === 0 || k === 3; // floor, or floor under a piece of hard cover

export const ROLE_TINT = {
  entry: ['#4fd1a8', 0.10], extraction: ['#d8e060', 0.11], elite: ['#ff4a4a', 0.17], hazard: ['#ffb020', 0.14],
  clinic: ['#7fe8e0', 0.14], armory: ['#6a8cff', 0.14], cache: ['#f4c66d', 0.14],
};
const COMBAT_TINTS = ['#ff5367', '#eaaa66', '#79d6ae', '#a888e8'];
export const roomTint = (room, index) => ROLE_TINT[room.role] || [COMBAT_TINTS[index % 4], 0.075];

export class WorldLayer {
  constructor() {
    this.level = null;
    this.chunks = new Map();
    this.queue = [];
    this.queueDone = false;
    this.pendingDecals = new Map(); // chunk key -> decals waiting for a bake or the next flush
    this.patterns = null;
    this.version = 0;
    this.bakeMs = 0;
    this.cs = 2; // chunk pixels per world unit, quantised to quarters so TILE * cs is an integer
  }

  // Bake at (roughly) the on-screen scale so a frame blits chunks 1:1.
  setScale(pxPerUnit) {
    const cs = Math.max(1.25, Math.min(2.5, Math.round(pxPerUnit * 4) / 4));
    if (cs === this.cs) return;
    if (Math.abs(cs - this.cs) / this.cs < 0.2 && this.chunks.size) return;
    this.cs = cs;
    if (this.level) { const lv = this.level; this.chunks.clear(); this.queue = []; this.queueDone = false; this.pendingDecals = new Map(); this.level = lv; }
  }

  textures() {
    if (this.sources) return this.sources;
    this.sources = {grime: grimeTile(192, 5, 1), grime2: grimeTile(160, 9, 1.4), wall: wallTile(128, 11), void: voidTile(128, 3), plate: steelPlateTile(64, 9), carpet: carpetTile(64, 4), dirt: dirtTile(128, 8)};
    return this.sources;
  }

  pattern(g, name) {
    this.textures();
    const p = g.createPattern(this.sources[name], 'repeat');
    p.setTransform(new DOMMatrix().scale(1 / this.cs));
    return p;
  }

  setLevel({tileMap, rooms, doors, seed}) {
    this.chunks.clear(); this.queue = []; this.queueDone = false; this.pendingDecals = new Map(); this.version++;
    const h = tileMap.length, w = tileMap[0].length;
    const kind = new Uint8Array(w * h).fill(2);
    const tileRoom = new Int16Array(w * h).fill(-1);
    const isFloor = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (tileMap[y][x] === 0 || tileMap[y][x] === 4); // 4 = glass, drawn live over the floor
    // hard cover stamped by room templates: solid in the tile map, but drawn as a prop standing on the room floor
    const cover = new Map();
    rooms.forEach((room, index) => {
      for (const c of room.cover || []) if (tileMap[c.y]?.[c.x] === 1) cover.set(c.y * w + c.x, {kind: c.kind, style: coverStyle(room, c.kind), room: index});
    });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (isFloor(x, y)) { kind[y * w + x] = 0; continue; }
      if (cover.has(y * w + x)) { kind[y * w + x] = 3; continue; }
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (isFloor(x + dx, y + dy)) { near = true; break; }
      kind[y * w + x] = near ? 1 : 2;
    }
    rooms.forEach((room, index) => {
      for (let y = room.y1; y <= room.y2; y++) for (let x = room.x1; x <= room.x2; x++) if (kind[y * w + x] === 0 || kind[y * w + x] === 3) tileRoom[y * w + x] = index;
    });
    const rnd = seeded((seed >>> 0) + 991);
    const floorTiles = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (kind[y * w + x] === 0) floorTiles.push([x, y]);
    const stains = [];
    const stainCount = Math.floor(floorTiles.length / 28);
    for (let i = 0; i < stainCount; i++) {
      const [tx, ty] = floorTiles[Math.floor(rnd() * floorTiles.length)];
      const t = rnd();
      stains.push({x: (tx + rnd()) * TILE, y: (ty + rnd()) * TILE, r: 10 + rnd() * 30, kind: t < 0.42 ? 'oil' : t < 0.7 ? 'rust' : t < 0.88 ? 'damp' : 'pale'});
    }
    // animated / lighting extras: server LEDs, flickering lamps, beacons
    const live = {leds: [], lamps: [], beacons: []};
    for (const [idx, c] of cover) {
      const tx = idx % w, ty = (idx / w) | 0;
      if (c.style === 'server') for (let i = 0; i < 6; i++) {
        const hv = hash2(tx * 6 + i, ty, seed + 4);
        live.leds.push({x: tx * TILE + 3.5 + i * 4.6, y: ty * TILE + 28.6, ph: hv * 40, rate: 0.6 + hash2(tx, ty * 6 + i, seed) * 3.2, col: hv < 0.55 ? '90,255,170' : hv < 0.8 ? '255,180,70' : '90,210,255', room: c.room});
      } else if (c.style === 'beacon') live.beacons.push({x: tx * TILE + 16, y: ty * TILE + 13, ph: hash2(tx, ty, seed) * 6, room: c.room});
    }
    rooms.forEach((room, index) => {
      const accent = room.theme?.accent || '#ffb070', emergency = room.role === 'hazard';
      for (const d of room.theme?.decor || []) {
        if (d.kind !== 'light') continue;
        if (emergency) live.lamps.push({x: d.x * TILE, y: d.y * TILE, r: 84, col: '#ff3a3a', mode: 'pulse', ph: hash2(d.x * 8, d.y * 8, seed) * 6, a: 0.2, room: index});
        else if (d.steady) live.lamps.push({x: d.x * TILE, y: d.y * TILE, r: 120, col: accent, mode: 'steady', ph: 0, a: 0.2, room: index});   // fixed-lit rooms (the Signal Check)
        else if (d.flicker) live.lamps.push({x: d.x * TILE, y: d.y * TILE, r: 74, col: accent, mode: 'flicker', ph: hash2(d.x * 8, d.y * 8, seed) * 50, a: 0.16, room: index});
      }
    });
    this.level = {tileMap, rooms, doors, seed, w, h, kind, tileRoom, stains, isFloor, cover, live};
    this.cw = CW;
  }

  chunkAt(cx, cy) {
    const L = this.level;
    if (!L || cx < 0 || cy < 0 || cx * CHUNK_TILES >= L.w || cy * CHUNK_TILES >= L.h) return null;
    const key = cy * 1000 + cx;
    let chunk = this.chunks.get(key);
    if (!chunk) this.chunks.set(key, chunk = {cx, cy, floor: null, g: null, baked: false, step: 0});
    return chunk;
  }

  // Cached 2D context of a chunk's floor canvas (getContext on every stamp was measurable).
  ctxOf(chunk) { return chunk.g || (chunk.g = chunk.floor.getContext('2d')); }

  // One bake step per call: 0 floor, 1 walls + shadows, 2 props + doors. Returns true when the chunk is complete.
  bakeStep(chunk) {
    if (chunk.baked) return true;
    const t0 = performance.now();
    const step = chunk.step || 0;
    if (step === 0) { this.bakeFloor(chunk); chunk.step = chunk.floor ? 1 : 3; }
    else if (step === 1) { this.bakeWalls(chunk); chunk.step = 2; }
    else { this.bakeProps(chunk); chunk.step = 3; }
    if (chunk.step >= 3) { chunk.baked = true; this.flushPending(chunk); }
    this.bakeMs += performance.now() - t0;
    return chunk.baked;
  }

  bake(chunk) { while (!chunk.baked) this.bakeStep(chunk); }

  // Level start: bake the chunks around (x,y) synchronously (behind the title / loading screen) so the first frames don't hitch.
  prewarm(x, y, radius = 1) {
    const L = this.level;
    if (!L) return;
    const cx = Math.floor(x / CW), cy = Math.floor(y / CW);
    for (let j = cy - radius; j <= cy + radius; j++) for (let i = cx - radius; i <= cx + radius; i++) {
      const chunk = this.chunkAt(i, j);
      if (chunk && this.chunkHasContent(i, j)) this.bake(chunk);
    }
  }

  // Spend up to budgetMs baking chunk steps: first the neighbourhood around the player's look-ahead point
  // (velocity vx,vy in world px/s), then everything else nearest-first. Budget is checked between steps.
  idleBake(x, y, budgetMs = 6, vx = 0, vy = 0) {
    const L = this.level;
    if (!L) return;
    if (!this.queue.length && !this.queueDone) {
      const list = [];
      for (let cy = 0; cy * CHUNK_TILES < L.h; cy++) for (let cx = 0; cx * CHUNK_TILES < L.w; cx++) list.push({cx, cy, d: Math.hypot((cx + 0.5) * CW - x, (cy + 0.5) * CW - y)});
      list.sort((a, b) => a.d - b.d);
      this.queue = list;
      this.queueDone = true;
    }
    const end = performance.now() + budgetMs;
    const ax = x + vx * 0.7, ay = y + vy * 0.7;
    const pending = [];
    for (let cy = Math.floor((ay - CW * 1.2) / CW); cy <= Math.floor((ay + CW * 1.2) / CW); cy++) for (let cx = Math.floor((ax - CW * 1.2) / CW); cx <= Math.floor((ax + CW * 1.2) / CW); cx++) {
      const chunk = this.chunkAt(cx, cy);
      if (chunk && !chunk.baked && this.chunkHasContent(cx, cy)) pending.push({chunk, d: Math.hypot((cx + 0.5) * CW - ax, (cy + 0.5) * CW - ay)});
    }
    pending.sort((a, b) => a.d - b.d);
    for (const {chunk} of pending) {
      while (!chunk.baked) { if (performance.now() >= end) return; this.bakeStep(chunk); }
    }
    while (this.queue.length) {
      const {cx, cy} = this.queue[0];
      const chunk = this.chunkAt(cx, cy);
      if (!chunk || chunk.baked || !this.chunkHasContent(cx, cy)) { this.queue.shift(); continue; }
      if (performance.now() >= end) return;
      this.bakeStep(chunk);
    }
  }

  chunkHasContent(cx, cy) {
    const L = this.level;
    for (let y = cy * CHUNK_TILES; y < Math.min(L.h, (cy + 1) * CHUNK_TILES); y++) for (let x = cx * CHUNK_TILES; x < Math.min(L.w, (cx + 1) * CHUNK_TILES); x++) if (L.kind[y * L.w + x] !== 2) return true;
    return false;
  }

  // ---- floor
  bakeFloor(chunk) {
    const L = this.level, x0 = chunk.cx * CW, y0 = chunk.cy * CW;
    if (!this.chunkHasContent(chunk.cx, chunk.cy)) { chunk.floor = null; return; }
    const CS = this.cs, c = makeCanvas(CW * CS, CW * CS), g = c.getContext('2d');
    g.setTransform(CS, 0, 0, CS, -x0 * CS, -y0 * CS);
    const tx0 = chunk.cx * CHUNK_TILES, ty0 = chunk.cy * CHUNK_TILES, tx1 = Math.min(L.w, tx0 + CHUNK_TILES), ty1 = Math.min(L.h, ty0 + CHUNK_TILES);
    const floorAt = (x, y) => x >= 0 && y >= 0 && x < L.w && y < L.h && isOpen(L.kind[y * L.w + x]);
    const wallAt = (x, y) => x < 0 || y < 0 || x >= L.w || y >= L.h || (L.kind[y * L.w + x] >= 1 && L.kind[y * L.w + x] !== 3);
    const matOf = (x, y) => { const r = L.tileRoom[y * L.w + x]; return r >= 0 ? (L.rooms[r].theme?.floor || 'concrete') : 'corridor'; };
    const paths = {};
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (!floorAt(x, y)) continue;
      const room = L.tileRoom[y * L.w + x], mat = matOf(x, y);
      paintFloorTile(g, mat, x, y, {seed: L.seed, accent: room >= 0 ? L.rooms[room].theme?.accent : null, wallN: wallAt(x, y - 1), wallS: wallAt(x, y + 1), wallE: wallAt(x + 1, y), wallW: wallAt(x - 1, y)});
      (paths[mat] ||= []).push(x, y);
      if (room >= 0) { const [col, a] = roomTint(L.rooms[room], room); g.fillStyle = rgba(col, a); g.fillRect(x * TILE, y * TILE, TILE, TILE); }
    }
    // material overlays: grime everywhere, fibres on carpet, grit on dirt
    const overlay = (mat, name, alpha) => {
      const list = paths[mat]; if (!list || !alpha) return;
      g.beginPath(); for (let i = 0; i < list.length; i += 2) g.rect(list[i] * TILE, list[i + 1] * TILE, TILE, TILE);
      g.globalAlpha = alpha; g.fillStyle = this.pattern(g, name); g.fill(); g.globalAlpha = 1;
    };
    const GRIME = {concrete: 1, tile: 0.45, metal: 0.7, carpet: 0.35, grate: 0.4, wood: 0.6, dirt: 0.3, vault: 0.5, hazard: 0.9, corridor: 0.9};
    for (const mat of Object.keys(paths)) overlay(mat, 'grime', GRIME[mat] ?? 0.8);
    overlay('concrete', 'grime2', 0.3); overlay('hazard', 'grime2', 0.3); overlay('corridor', 'grime2', 0.25);
    overlay('carpet', 'carpet', 0.7); overlay('dirt', 'dirt', 0.5);
    // clip following details to floor tiles
    g.save();
    g.beginPath();
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) if (floorAt(x, y)) g.rect(x * TILE, y * TILE, TILE, TILE);
    g.clip();
    for (const s of L.stains) {
      if (s.x + s.r < x0 || s.x - s.r > x0 + CW || s.y + s.r < y0 || s.y - s.r > y0 + CW) continue;
      if (s.kind === 'oil') { blotch(g, s.x, s.y, s.r, '6,6,12', 0.3); blotch(g, s.x - s.r * 0.15, s.y - s.r * 0.15, s.r * 0.45, '80,90,130', 0.07); }
      else if (s.kind === 'rust') blotch(g, s.x, s.y, s.r * 1.1, '120,62,30', 0.22);
      else if (s.kind === 'damp') blotch(g, s.x, s.y, s.r * 1.3, '20,24,40', 0.15);
      else blotch(g, s.x, s.y, s.r, '255,240,220', 0.06);
    }
    // cracks on the plainer floors
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (L.kind[y * L.w + x] !== 0) continue;
      const mat = matOf(x, y);
      if (mat === 'grate' || mat === 'carpet' || mat === 'vault' || mat === 'tile') continue;
      const n = hash2(x, y, L.seed + 17);
      if (n < 0.05) {
        const r = seeded(Math.floor(n * 1e7)); let px = (x + r()) * TILE, py = (y + r()) * TILE, a = r() * TAU;
        g.strokeStyle = 'rgba(8,6,12,0.55)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(px, py);
        for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 1.2; px += Math.cos(a) * 6; py += Math.sin(a) * 6; g.lineTo(px, py); }
        g.stroke();
        g.strokeStyle = 'rgba(255,240,225,0.1)'; g.lineWidth = 0.6; g.stroke();
      }
    }
    for (const [index, room] of L.rooms.entries()) {
      if (room.x2 * TILE + TILE < x0 - 40 || room.x1 * TILE > x0 + CW + 40 || room.y2 * TILE + TILE < y0 - 40 || room.y1 * TILE > y0 + CW + 40) continue;
      for (const d of room.theme?.decor || []) {
        if (d.kind === 'light') continue;
        const px = d.x * TILE, py = d.y * TILE, reach = ((d.len || 0) + (d.w || 0)) * TILE + 40;
        if (px + reach < x0 || px - 40 > x0 + CW || py + reach < y0 || py - 40 > y0 + CW) continue;
        paintDecor(g, d, room.theme.accent, L.seed);
      }
      this.paintRoom(g, room, index, x0, y0);
    }
    g.restore();
    // practical lamps and ambient room glow (additive)
    g.globalCompositeOperation = 'lighter';
    for (const [index, room] of L.rooms.entries()) {
      const accent = room.theme?.accent || roomTint(room, index)[0];
      for (const d of room.theme?.decor || []) {
        if (d.kind !== 'light' || d.flicker || room.role === 'hazard') continue;
        const px = d.x * TILE, py = d.y * TILE;
        if (px + 90 < x0 || px - 90 > x0 + CW || py + 90 < y0 || py - 90 > y0 + CW) continue;
        lampPool(g, px, py, 84, accent, 0.15 * (room.theme.lights?.intensity ?? 0.6) + 0.04);
      }
      const cx = (room.cx + 0.5) * TILE, cy = (room.cy + 0.5) * TILE, r = Math.min(room.x2 - room.x1, room.y2 - room.y1) * TILE * 0.62 + 40;
      if (cx + r < x0 || cx - r > x0 + CW || cy + r < y0 || cy - r > y0 + CW) continue;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, rgba(mix(accent, '#ffe8c8', 0.5), 0.1)); grad.addColorStop(0.6, rgba(accent, 0.03)); grad.addColorStop(1, rgba(accent, 0));
      g.fillStyle = grad; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    chunk.floor = c;
  }

  paintRoom(g, room, index, x0, y0) {
    const L = this.level, cx = (room.cx + 0.5) * TILE, cy = (room.cy + 0.5) * TILE;
    const near = (r) => cx + r > x0 && cx - r < x0 + CW && cy + r > y0 && cy - r < y0 + CW;
    const role = room.role;
    if (role === 'entry' && near(130)) {
      g.strokeStyle = 'rgba(210,255,240,0.2)'; g.lineWidth = 2; g.setLineDash([9, 7]);
      g.beginPath(); g.arc(cx, cy, TILE * 3.2, 0, TAU); g.stroke(); g.setLineDash([]);
      g.strokeStyle = 'rgba(210,255,240,0.13)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, TILE * 2.7, 0, TAU); g.stroke();
      for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + Math.PI / 4; g.save(); g.translate(cx + Math.cos(a) * TILE * 3.2, cy + Math.sin(a) * TILE * 3.2); g.rotate(a); g.fillStyle = 'rgba(210,255,240,0.2)'; g.beginPath(); g.moveTo(5, 0); g.lineTo(-4, -5); g.lineTo(-4, 5); g.fill(); g.restore(); }
    } else if (role === 'extraction' && near(130)) {
      g.save(); g.translate(cx, cy);
      const half = TILE * 2.3;
      g.fillStyle = 'rgba(190,230,90,0.05)'; g.fillRect(-half, -half, half * 2, half * 2);
      g.beginPath(); g.rect(-half, -half, half * 2, 6); g.rect(-half, half - 6, half * 2, 6); g.rect(-half, -half, 6, half * 2); g.rect(half - 6, -half, 6, half * 2); g.clip();
      g.fillStyle = 'rgba(8,6,10,0.5)'; g.fillRect(-half, -half, half * 2, half * 2);
      g.strokeStyle = 'rgba(255,205,60,0.55)'; g.lineWidth = 5; g.beginPath(); for (let i = -half * 2; i < half * 2; i += 14) { g.moveTo(i, -half); g.lineTo(i + 12, half); } g.stroke();
      g.restore();
    } else if (role === 'hazard' && near(200)) {
      const hw = (room.x2 - room.x1 + 1) * TILE / 2, hh = (room.y2 - room.y1 + 1) * TILE / 2, mx = (room.x1 + room.x2 + 1) * TILE / 2, my = (room.y1 + room.y2 + 1) * TILE / 2;
      g.save(); g.beginPath(); g.rect(mx - hw, my - hh, hw * 2, 7); g.rect(mx - hw, my + hh - 7, hw * 2, 7); g.rect(mx - hw, my - hh, 7, hh * 2); g.rect(mx + hw - 7, my - hh, 7, hh * 2); g.clip();
      g.strokeStyle = 'rgba(255,176,32,0.32)'; g.lineWidth = 4; g.beginPath(); for (let i = -hw - hh; i < hw + hh; i += 12) { g.moveTo(mx + i, my - hh); g.lineTo(mx + i + hh * 2, my + hh); } g.stroke(); g.restore();
    } else if (role === 'elite' && near(200)) {
      g.globalAlpha = 0.32; g.fillStyle = this.pattern(g, 'plate'); g.beginPath(); for (let y = room.y1; y <= room.y2; y++) for (let x = room.x1; x <= room.x2; x++) if (L.isFloor(x, y)) g.rect(x * TILE, y * TILE, TILE, TILE); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,70,70,0.28)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 52, 0, TAU); g.stroke();
      g.beginPath(); for (let i = 0; i < 3; i++) { const a = i * TAU / 3 - Math.PI / 2; g.lineTo(cx + Math.cos(a) * 36, cy + Math.sin(a) * 36); } g.closePath(); g.stroke();
    } else if (role === 'clinic' && near(80)) {
      g.fillStyle = 'rgba(235,255,250,0.2)'; g.fillRect(cx - 7, cy - 22, 14, 44); g.fillRect(cx - 22, cy - 7, 44, 14);
      g.fillStyle = 'rgba(255,90,100,0.18)'; g.fillRect(cx - 4, cy - 19, 8, 38); g.fillRect(cx - 19, cy - 4, 38, 8);
    } else if (role === 'cache' && near(100)) {
      g.strokeStyle = 'rgba(244,198,109,0.3)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 44, 0, TAU); g.stroke();
      g.beginPath(); g.arc(cx, cy, 36, 0, TAU); g.setLineDash([3, 6]); g.stroke(); g.setLineDash([]);
    } else if (role === 'armory' && near(120)) {
      g.strokeStyle = 'rgba(120,150,255,0.22)'; g.lineWidth = 2; g.strokeRect(cx - 64, cy - 40, 128, 80);
      g.strokeStyle = 'rgba(255,220,100,0.2)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 64, cy - 40); g.lineTo(cx + 64, cy + 40); g.moveTo(cx + 64, cy - 40); g.lineTo(cx - 64, cy + 40); g.stroke();
    }
  }

  // ---- walls, cover props and shadows
  bakeWalls(chunk) {
    const L = this.level, x0 = chunk.cx * CW, y0 = chunk.cy * CW;
    const tx0 = chunk.cx * CHUNK_TILES, ty0 = chunk.cy * CHUNK_TILES, tx1 = Math.min(L.w, tx0 + CHUNK_TILES), ty1 = Math.min(L.h, ty0 + CHUNK_TILES);
    const kindAt = (x, y) => x < 0 || y < 0 || x >= L.w || y >= L.h ? 2 : L.kind[y * L.w + x];
    // cover tiles can throw shadows into this chunk from up-left
    const sx0 = tx0 - 3, sy0 = ty0 - 3;
    if (!chunk.floor) return;
    const CS = this.cs, g = this.ctxOf(chunk);
    g.setTransform(CS, 0, 0, CS, -x0 * CS, -y0 * CS);
    const hasFilter = 'filter' in g;
    // crisp directional cast shadows: one union hull per height, small blur, uniform alpha
    const solids = [];
    for (let y = sy0; y < ty1; y++) for (let x = sx0; x < tx1; x++) {
      const k = kindAt(x, y);
      if (k === 1) solids.push({x: x * TILE, y: y * TILE, w: TILE, h: TILE, len: WALL_SHADOW});
      else if (k === 3) {
        const c = L.cover.get(y * L.w + x);
        const same = (dx, dy) => L.cover.get((y + dy) * L.w + x + dx)?.style === c.style;
        let fx = x * TILE, fy = y * TILE, fw = TILE, fh = TILE;
        if (c.style === 'sandbag' || c.style === 'jersey' || c.style === 'jersey-hazard' || c.style === 'partition') {
          const vertical = (same(0, -1) || same(0, 1)) && !(same(1, 0) || same(-1, 0));
          if (vertical) { fx += 7; fw = 18; } else { fy += 7; fh = 17; }
        } else if (c.style === 'bed') { fx += 3; fw = 26; }
        else if (c.style === 'rack') { fx += 2; fw = 28; }
        solids.push({x: fx, y: fy, w: fw, h: fh, len: COVER_HEIGHT[shadowKey(c.style, c.kind)] || 12});
      }
    }
    const lens = [...new Set(solids.map((s) => s.len))].sort((a, b) => b - a);
    g.save();
    g.beginPath(); for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) if (isOpen(kindAt(x, y))) g.rect(x * TILE, y * TILE, TILE, TILE); g.clip();
    for (const len of lens) {
      const dx = LIGHT.x * len, dy = LIGHT.y * len;
      g.beginPath();
      for (const s of solids) {
        if (s.len !== len) continue;
        const {x, y, w, h} = s;
        g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w + dx, y + dy); g.lineTo(x + w + dx, y + h + dy); g.lineTo(x + dx, y + h + dy); g.lineTo(x, y + h); g.closePath();
      }
      if (hasFilter) g.filter = `blur(${1.1 * CS}px)`;
      g.fillStyle = 'rgba(4,3,10,0.3)'; g.fill();
    }
    if (hasFilter) {
      g.filter = `blur(${3.2 * CS}px)`; g.fillStyle = 'rgba(4,3,10,0.28)';
      g.beginPath(); for (const s of solids) g.rect(s.x - 2, s.y - 2, s.w + 4, s.h + 5); g.fill();
      g.filter = 'none';
    }
    g.restore();
    // bedrock
    g.beginPath();
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) if (kindAt(x, y) === 2) g.rect(x * TILE, y * TILE, TILE, TILE);
    g.fillStyle = this.pattern(g, 'void'); g.fill();
    // wall tops
    g.beginPath();
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) if (kindAt(x, y) === 1) g.rect(x * TILE, y * TILE, TILE, TILE);
    g.fillStyle = this.pattern(g, 'wall'); g.fill();
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (kindAt(x, y) !== 1) continue;
      const n = hash2(x, y, L.seed + 5);
      g.fillStyle = n > 0.5 ? `rgba(255,246,235,${(n - 0.5) * 0.07})` : `rgba(10,6,16,${(0.5 - n) * 0.12})`;
      g.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    // inner darkening fading toward the void so walls look thick
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (kindAt(x, y) !== 1) continue;
      const a = x * TILE, b = y * TILE;
      const vd = (dx, dy) => kindAt(x + dx, y + dy) === 2;
      for (const [dx, dy, gx0, gy0, gx1, gy1] of [[1, 0, a + TILE, b, a + TILE - 12, b], [-1, 0, a, b, a + 12, b], [0, 1, a, b + TILE, a, b + TILE - 12], [0, -1, a, b, a, b + 12]]) {
        if (!vd(dx, dy)) continue;
        const grad = g.createLinearGradient(gx0, gy0, gx1, gy1); grad.addColorStop(0, 'rgba(6,4,12,0.55)'); grad.addColorStop(1, 'rgba(6,4,12,0)');
        g.fillStyle = grad; g.fillRect(a, b, TILE, TILE);
      }
    }
    // lips (visible faces), highlights and ink
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (kindAt(x, y) !== 1) continue;
      const a = x * TILE, b = y * TILE;
      if (isOpen(kindAt(x, y + 1))) {
        const grad = g.createLinearGradient(0, b + TILE - WALL_LIP - 3, 0, b + TILE);
        grad.addColorStop(0, 'rgba(18,13,26,0)'); grad.addColorStop(0.45, 'rgba(18,13,26,0.7)'); grad.addColorStop(1, '#1d1726');
        g.fillStyle = grad; g.fillRect(a, b + TILE - WALL_LIP - 3, TILE, WALL_LIP + 3);
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(a, b + TILE - WALL_LIP - 1, TILE, 0.8);
        if (hash2(x, y, 41) > 0.45) { g.fillStyle = 'rgba(210,190,150,0.42)'; for (let k = 6; k < TILE; k += 12) g.fillRect(a + k, b + TILE - 3.3, 1.3, 1.3); }
      }
      if (isOpen(kindAt(x + 1, y))) {
        const grad = g.createLinearGradient(a + TILE - WALL_LIP_E - 3, 0, a + TILE, 0);
        grad.addColorStop(0, 'rgba(18,13,26,0)'); grad.addColorStop(1, 'rgba(18,13,26,0.85)');
        g.fillStyle = grad; g.fillRect(a + TILE - WALL_LIP_E - 3, b, WALL_LIP_E + 3, TILE);
      }
    }
    g.lineCap = 'butt';
    g.strokeStyle = 'rgba(255,245,230,0.5)'; g.lineWidth = 1; g.beginPath();
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (kindAt(x, y) !== 1) continue;
      const a = x * TILE, b = y * TILE;
      if (isOpen(kindAt(x, y - 1))) { g.moveTo(a, b + 1.2); g.lineTo(a + TILE, b + 1.2); }
      if (isOpen(kindAt(x - 1, y))) { g.moveTo(a + 1.2, b); g.lineTo(a + 1.2, b + TILE); }
    }
    g.stroke();
    g.strokeStyle = 'rgba(16,12,22,0.95)'; g.lineWidth = 1.5; g.beginPath();
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (kindAt(x, y) !== 1) continue;
      const a = x * TILE, b = y * TILE;
      if (isOpen(kindAt(x, y - 1))) { g.moveTo(a, b); g.lineTo(a + TILE, b); }
      if (isOpen(kindAt(x, y + 1))) { g.moveTo(a, b + TILE); g.lineTo(a + TILE, b + TILE); }
      if (isOpen(kindAt(x - 1, y))) { g.moveTo(a, b); g.lineTo(a, b + TILE); }
      if (isOpen(kindAt(x + 1, y))) { g.moveTo(a + TILE, b); g.lineTo(a + TILE, b + TILE); }
    }
    g.stroke();
    // conduits and vents on the wall tops
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (kindAt(x, y) !== 1) continue;
      const a = x * TILE, b = y * TILE, n = hash2(x, y, 99);
      if (n < 0.06 && kindAt(x - 1, y) === 1 && kindAt(x + 1, y) === 1) {
        g.fillStyle = '#2a2631'; g.fillRect(a, b + 12, TILE, 7); g.strokeStyle = INK; g.lineWidth = 0.9; g.strokeRect(a, b + 12, TILE, 7);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(a, b + 13.2, TILE, 1.4);
        g.fillStyle = '#4a4552'; g.fillRect(a + 14, b + 10, 4, 11);
      } else if (n > 0.95) {
        g.fillStyle = '#25212c'; g.fillRect(a + 8, b + 8, 16, 12); g.strokeStyle = '#6b6575'; g.lineWidth = 0.9; g.strokeRect(a + 8, b + 8, 16, 12);
        g.strokeStyle = '#100d16'; g.lineWidth = 1.3; g.beginPath(); for (let k = 11; k < 19; k += 2.6) { g.moveTo(a + 10, b + k); g.lineTo(a + 22, b + k); } g.stroke();
      }
    }
  }

  // ---- props: interior cover, doorway frames and doors (third bake step)
  bakeProps(chunk) {
    const L = this.level, x0 = chunk.cx * CW, y0 = chunk.cy * CW;
    const tx0 = chunk.cx * CHUNK_TILES, ty0 = chunk.cy * CHUNK_TILES, tx1 = Math.min(L.w, tx0 + CHUNK_TILES), ty1 = Math.min(L.h, ty0 + CHUNK_TILES);
    const kindAt = (x, y) => x < 0 || y < 0 || x >= L.w || y >= L.h ? 2 : L.kind[y * L.w + x];
    if (!chunk.floor) return;
    const CS = this.cs, g = this.ctxOf(chunk);
    g.setTransform(CS, 0, 0, CS, -x0 * CS, -y0 * CS);
    // interior cover: props standing on the floor
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (kindAt(x, y) !== 3) continue;
      const c = L.cover.get(y * L.w + x), room = L.rooms[c.room];
      const same = (dx, dy) => L.cover.get((y + dy) * L.w + x + dx)?.style === c.style;
      paintCover(g, {tx: x, ty: y, kind: c.kind, style: c.style, accent: room.theme?.accent || '#eaaa66', room, seed: L.seed, j: {n: same(0, -1), s: same(0, 1), e: same(1, 0), w: same(-1, 0)}});
    }
    // doorway frames: threshold plates and jambs at every opening of every room
    for (const room of L.rooms) {
      for (const o of room.openings || []) {
        if (o.x < tx0 - 1 || o.x > tx1 || o.y < ty0 - 1 || o.y > ty1) continue;
        this.paintOpening(g, o, room.theme?.accent || '#eaaa66', kindAt);
      }
    }
    for (const door of L.doors) this.paintDoor(g, door, x0, y0);
  }

  paintOpening(g, o, accent, kindAt) {
    const X = o.x * TILE, Y = o.y * TILE, side = o.side;
    g.save(); g.beginPath(); g.rect(X, Y, TILE, TILE); g.clip();
    const horiz = side === 'n' || side === 's', th = 5;
    const px = side === 'w' ? X : side === 'e' ? X + TILE - th : X, py = side === 'n' ? Y : side === 's' ? Y + TILE - th : Y;
    const w = horiz ? TILE : th, h = horiz ? th : TILE;
    g.fillStyle = '#17141d'; g.fillRect(px, py, w, h);
    g.fillStyle = rgba(accent, 0.55); if (horiz) g.fillRect(px, py + (side === 'n' ? th - 1.6 : 0), TILE, 1.6); else g.fillRect(px + (side === 'w' ? th - 1.6 : 0), py, 1.6, TILE);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.8; g.strokeRect(px + 0.4, py + 0.4, w - 0.8, h - 0.8);
    const jamb = (jx, jy, jw, jh) => { g.fillStyle = '#58505f'; g.fillRect(jx, jy, jw, jh); g.strokeStyle = INK; g.lineWidth = 0.9; g.strokeRect(jx, jy, jw, jh); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(jx, jy, jw, 1); };
    const solid = (x, y) => kindAt(x, y) === 1;
    if (horiz) {
      const jy = side === 'n' ? Y : Y + TILE - 6;
      if (solid(o.x - 1, o.y)) jamb(X, jy, 4, 6);
      if (solid(o.x + 1, o.y)) jamb(X + TILE - 4, jy, 4, 6);
    } else {
      const jx = side === 'w' ? X : X + TILE - 6;
      if (solid(o.x, o.y - 1)) jamb(jx, Y, 6, 4);
      if (solid(o.x, o.y + 1)) jamb(jx, Y + TILE - 4, 6, 4);
    }
    g.restore();
  }

  paintDoor(g, door, x0, y0) {
    const cx = (door.x + 0.5) * TILE, cy = (door.y + 0.5) * TILE, horizontal = door.axis === 'x';
    if (cx < x0 - 60 || cx > x0 + CW + 60 || cy < y0 - 60 || cy > y0 + CW + 60) return;
    g.save(); g.translate(cx, cy); if (!horizontal) g.rotate(Math.PI / 2);
    // threshold plate across the passage
    g.fillStyle = 'rgba(14,11,20,0.62)'; g.fillRect(-TILE, -5, TILE * 2, 10);
    g.save(); g.beginPath(); g.rect(-TILE + 1, -5, TILE * 2 - 2, 10); g.clip();
    g.strokeStyle = 'rgba(255,196,70,0.34)'; g.lineWidth = 3; g.beginPath(); for (let i = -TILE - 10; i < TILE + 10; i += 9) { g.moveTo(i, 5); g.lineTo(i + 8, -5); } g.stroke(); g.restore();
    g.strokeStyle = 'rgba(14,10,20,0.9)'; g.lineWidth = 1; g.strokeRect(-TILE, -5, TILE * 2, 10);
    // posts and header
    for (const s of [-1, 1]) {
      g.fillStyle = '#7a5f45'; g.strokeStyle = INK; g.lineWidth = 1; g.fillRect(s * TILE - 3.5, -4.5, 7, 9); g.strokeRect(s * TILE - 3.5, -4.5, 7, 9);
      g.fillStyle = 'rgba(255,230,190,0.35)'; g.fillRect(s * TILE - 3, -4, 6, 1.2);
      g.fillStyle = '#ff5a4a'; g.beginPath(); g.arc(s * TILE, 0, 1.2, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(90,70,52,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-TILE + 3, -1); g.lineTo(TILE - 3, -1); g.stroke();
    g.restore();
  }

  // Cheap animated extras drawn each frame on top of the baked floor: blinking server LEDs, flickering lamps, beacons.
  drawLive(ctx, cam, bounds, dpr, t) {
    const L = this.level;
    if (!L) return;
    const s = cam.scale * dpr, ox = cam.w / 2 * dpr - cam.x * s, oy = cam.h / 2 * dpr - cam.y * s;
    const inB = (x, y, r) => x + r > bounds.x0 && x - r < bounds.x1 && y + r > bounds.y0 && y - r < bounds.y1;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
    const glow = this.glowSprite || (this.glowSprite = new Map());
    const sprite = (col) => {
      let c = glow.get(col);
      if (!c) { c = makeCanvas(64, 64); const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, rgba(mix(col, '#ffffff', 0.35), 1)); gr.addColorStop(0.45, rgba(col, 0.32)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glow.set(col, c); }
      return c;
    };
    for (const l of L.live.lamps) {
      if (!inB(l.x, l.y, l.r)) continue;
      const v = l.mode === 'steady' ? 1 : l.mode === 'pulse' ? 0.35 + 0.65 * Math.max(0, Math.sin(t * 3.2 + l.ph)) ** 2 : (Math.sin(t * 23 + l.ph) * Math.sin(t * 7.3 + l.ph * 2) > 0.62 ? 0.25 : 1) * (0.85 + 0.15 * Math.sin(t * 11 + l.ph));
      ctx.globalAlpha = Math.min(1, l.a * v * 3.2);
      const r = l.r * s; ctx.drawImage(sprite(l.col), l.x * s + ox - r, l.y * s + oy - r, r * 2, r * 2);
    }
    for (const b of L.live.beacons) {
      if (!inB(b.x, b.y, 40)) continue;
      const v = Math.max(0, Math.sin(t * 4 + b.ph)); ctx.globalAlpha = 0.25 + 0.75 * v;
      const r = 22 * s; ctx.drawImage(sprite('#ff3a2a'), b.x * s + ox - r, b.y * s + oy - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    const byCol = {};
    for (const l of L.live.leds) {
      if (!inB(l.x, l.y, 4)) continue;
      const ph = t * l.rate + l.ph, on = ph % 1 < 0.55 ? 1 : 0.12, k = on * (0.55 + 0.45 * Math.sin(ph * 6.3));
      if (k < 0.08) continue;
      (byCol[l.col] ||= []).push(l.x, l.y, k);
    }
    for (const col in byCol) {
      const a = byCol[col];
      for (let i = 0; i < a.length; i += 3) {
        ctx.fillStyle = `rgba(${col},${Math.min(1, a[i + 2] + 0.2).toFixed(2)})`;
        ctx.fillRect(a[i] * s + ox - 0.4 * s, a[i + 1] * s + oy - 0.4 * s, 2.2 * s, 1.7 * s);
        ctx.fillStyle = `rgba(${col},${(a[i + 2] * 0.16).toFixed(3)})`;
        ctx.fillRect(a[i] * s + ox - 2 * s, a[i + 1] * s + oy - 2 * s, 6 * s, 5.5 * s);
      }
    }
    ctx.restore();
  }

  // Lamps in the room the player stands in carve a little light out of the darkness layer.
  lights(bounds, room) {
    const L = this.level, out = [];
    if (!L || room < 0) return out;
    for (const l of L.live.lamps) if (l.room === room && l.x > bounds.x0 - 100 && l.x < bounds.x1 + 100 && l.y > bounds.y0 - 100 && l.y < bounds.y1 + 100) out.push({x: l.x, y: l.y, r: l.r * 0.8, a: 0.22});
    return out;
  }

  // ---- decals
  // stampDecal only queues; flushDecals (start of draw) paints every queued decal of a chunk in one pass
  // with one clip path, and decals aimed at a chunk that is still baking wait until it is done.
  stampDecal(d) {
    const L = this.level;
    if (!L) return;
    const tx = Math.floor(d.x / TILE), ty = Math.floor(d.y / TILE);
    if (L.kind[ty * L.w + tx] !== 0) return;
    const R = (d.r || 12) + 6;
    const rect = {x0: d.x - R, y0: d.y - R, x1: d.x + R, y1: d.y + R, d};
    const cx0 = Math.floor(rect.x0 / CW), cx1 = Math.floor(rect.x1 / CW), cy0 = Math.floor(rect.y0 / CW), cy1 = Math.floor(rect.y1 / CW);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (!this.chunkAt(cx, cy)) continue;
      const key = cy * 1000 + cx;
      let list = this.pendingDecals.get(key);
      if (!list) this.pendingDecals.set(key, list = []);
      list.push(rect);
      if (list.length > 400) list.splice(0, list.length - 400);
    }
  }

  flushDecals() {
    if (!this.pendingDecals.size) return;
    for (const [key, list] of this.pendingDecals) {
      const chunk = this.chunks.get(key);
      if (chunk && chunk.baked) this.paintDecals(chunk, list);
      if (!chunk || chunk.baked) this.pendingDecals.delete(key);
    }
  }

  flushPending(chunk) {
    const key = chunk.cy * 1000 + chunk.cx, list = this.pendingDecals.get(key);
    if (!list) return;
    this.pendingDecals.delete(key);
    this.paintDecals(chunk, list);
  }

  paintDecals(chunk, list) {
    if (!chunk.floor) return;
    const L = this.level, CS = this.cs, g = this.ctxOf(chunk);
    g.save();
    g.setTransform(CS, 0, 0, CS, -chunk.cx * CW * CS, -chunk.cy * CW * CS);
    const seen = new Set();
    g.beginPath();
    for (const r of list) {
      for (let ty = Math.floor(r.y0 / TILE); ty <= Math.floor(r.y1 / TILE); ty++) for (let tx = Math.floor(r.x0 / TILE); tx <= Math.floor(r.x1 / TILE); tx++) {
        if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) continue;
        const k = ty * L.w + tx;
        if (L.kind[k] !== 0 || seen.has(k)) continue;
        seen.add(k); g.rect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    g.clip();
    for (const r of list) drawDecal(g, r.d);
    g.restore();
  }

  // ---- drawing
  draw(ctx, cam, bounds, dpr) {
    const L = this.level;
    if (!L) return;
    this.flushDecals();
    const cx0 = Math.max(0, Math.floor(bounds.x0 / CW)), cx1 = Math.floor(bounds.x1 / CW), cy0 = Math.max(0, Math.floor(bounds.y0 / CW)), cy1 = Math.floor(bounds.y1 / CW);
    const s = cam.scale * dpr, ox = cam.w / 2 * dpr - cam.x * s, oy = cam.h / 2 * dpr - cam.y * s;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = Math.abs(s - this.cs) > 0.02;
    let covered = bounds.x0 >= 0 && bounds.y0 >= 0 && bounds.x1 <= L.w * TILE && bounds.y1 <= L.h * TILE;
    const draws = [], bakeEnd = performance.now() + 8;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const chunk = this.chunkAt(cx, cy);
      if (!chunk) { covered = false; continue; }
      // A visible chunk that is not ready is baked now, a step at a time within a small frame budget
      // (prebaking ahead of the player keeps this rare); past the budget it shows what it has.
      while (!chunk.baked && performance.now() < bakeEnd) this.bakeStep(chunk);
      const img = chunk.floor;
      if (!img) { covered = false; continue; }
      draws.push([img, Math.round(ox + cx * CW * s), Math.round(oy + cy * CW * s), Math.round(ox + (cx + 1) * CW * s), Math.round(oy + (cy + 1) * CW * s)]);
    }
    if (!covered) { // outside the dungeon (and chunks without content): solid bedrock instead of flat black
      const p = this.pattern(ctx, 'void'), k = s / this.cs;
      p.setTransform(new DOMMatrix([k, 0, 0, k, ox, oy]));
      ctx.imageSmoothingEnabled = true; ctx.fillStyle = p; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.imageSmoothingEnabled = Math.abs(s - this.cs) > 0.02;
    }
    for (const [img, l, t, r, b] of draws) ctx.drawImage(img, 0, 0, img.width, img.height, l, t, r - l, b - t);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
  }
}

// ---------------------------------------------------------------- decal painters (world units)
const BLOOD = ['#4a0f1c', '#5f1424', '#7b1c30'];
export function drawDecal(g, d) {
  const rnd = seeded(d.seed || Math.floor(d.x * 7 + d.y * 13));
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (d.kind === 'blood') {
    const col = d.color || BLOOD[0];
    g.globalAlpha = d.alpha ?? 0.85;
    const n = 6 + Math.floor((d.r || 12) / 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, dist = rnd() * d.r * 0.7, r = d.r * (0.22 + rnd() * 0.34);
      g.fillStyle = i % 3 === 0 ? BLOOD[1] : col; g.beginPath(); g.arc(d.x + Math.cos(a) * dist, d.y + Math.sin(a) * dist, r, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(190,60,80,0.18)'; g.beginPath(); g.arc(d.x - d.r * 0.15, d.y - d.r * 0.15, d.r * 0.3, 0, TAU); g.fill();
    if (d.dir !== undefined) { // streak thrown by the killing shot
      g.strokeStyle = col; g.lineWidth = Math.max(1.2, d.r * 0.2);
      for (let i = 0; i < 3; i++) { const a = d.dir + (rnd() - 0.5) * 0.6, len = d.r * (1.2 + rnd() * 1.6); g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x + Math.cos(a) * len, d.y + Math.sin(a) * len); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(d.x + Math.cos(a) * len, d.y + Math.sin(a) * len, g.lineWidth * 0.8, 0, TAU); g.fill(); }
    }
    g.globalAlpha = 1;
  } else if (d.kind === 'drop') {
    g.globalAlpha = 0.8; g.fillStyle = d.color || BLOOD[0]; g.beginPath(); g.ellipse(d.x, d.y, d.r, d.r * 0.8, d.a || 0, 0, TAU); g.fill(); g.globalAlpha = 1;
  } else if (d.kind === 'casing') {
    g.save(); g.translate(d.x, d.y); g.rotate(d.a || 0);
    g.fillStyle = '#c9a24e'; g.strokeStyle = 'rgba(20,14,8,0.8)'; g.lineWidth = 0.5; g.fillRect(-2, -0.9, 4, 1.8); g.strokeRect(-2, -0.9, 4, 1.8);
    g.fillStyle = '#f0d58a'; g.fillRect(-2, -0.9, 1.1, 1.8);
    g.restore();
  } else if (d.kind === 'chip') {
    g.save(); g.translate(d.x, d.y); g.rotate(d.a || 0); g.fillStyle = d.color || '#6a6068'; g.globalAlpha = 0.9; g.fillRect(-d.r, -d.r * 0.6, d.r * 2, d.r * 1.2); g.restore(); g.globalAlpha = 1;
  } else if (d.kind === 'plank') {
    g.save(); g.translate(d.x, d.y); g.rotate(d.a || 0); g.fillStyle = '#6d4c36'; g.strokeStyle = INK; g.lineWidth = 0.7; g.fillRect(-d.r, -1.7, d.r * 2, 3.4); g.strokeRect(-d.r, -1.7, d.r * 2, 3.4); g.fillStyle = 'rgba(255,220,170,0.25)'; g.fillRect(-d.r, -1.7, d.r * 2, 0.8); g.restore();
  } else if (d.kind === 'scorch') {
    const grad = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
    grad.addColorStop(0, 'rgba(4,3,6,0.75)'); grad.addColorStop(0.55, 'rgba(10,8,12,0.45)'); grad.addColorStop(1, 'rgba(10,8,12,0)');
    g.fillStyle = grad; g.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.9;
    for (let i = 0; i < 9; i++) { const a = rnd() * TAU, r0 = d.r * 0.2, r1 = d.r * (0.55 + rnd() * 0.45); g.beginPath(); g.moveTo(d.x + Math.cos(a) * r0, d.y + Math.sin(a) * r0); g.lineTo(d.x + Math.cos(a) * r1, d.y + Math.sin(a) * r1); g.stroke(); }
  } else if (d.kind === 'corpse') {
    const sprite = corpseSprite(d.type);
    g.save(); g.translate(d.x, d.y); g.rotate(d.a || 0); g.scale(d.sx || 0.94, d.sy || 0.9);
    g.globalAlpha = 0.5; g.fillStyle = '#05030a'; g.beginPath(); g.arc(1.5, 1.8, sprite.half * 0.62, 0, TAU); g.fill(); g.globalAlpha = 1;
    g.drawImage(sprite.img, -sprite.half, -sprite.half, sprite.half * 2, sprite.half * 2);
    g.restore();
  } else if (d.kind === 'burn') {
    const grad = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
    grad.addColorStop(0, 'rgba(30,14,6,0.5)'); grad.addColorStop(1, 'rgba(30,14,6,0)');
    g.fillStyle = grad; g.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
  }
}

void actorSprite;
