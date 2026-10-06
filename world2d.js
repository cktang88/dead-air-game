// Static world art: floor, walls, shadows and door frames baked into offscreen canvas chunks.
// A frame only blits the visible chunks; persistent decals (blood, scorch, casings) are stamped onto the floor chunks.
import {TILE} from './catalog.js';
import {INK, TAU, actorSprite, corpseSprite, hash2, makeCanvas, mix, rgba, seeded, shade} from './sprites2d.js';
import {blotch, grimeTile, steelPlateTile, voidTile, wallTile} from './textures2d.js';

export const CHUNK_TILES = 12;
const CW = CHUNK_TILES * TILE;
const CS = 1.75; // chunk pixels per world unit (TILE * CS is an integer so tile edges never blur)
const CPX = CW * CS;
const FLOOR = '#544c47';
const WALL_LIP = 5;
const WALL_LIP_E = 3.4;
const SHADOW_DX = 24, SHADOW_DY = 31;

export const ROLE_TINT = {
  entry: ['#4fd1a8', 0.10], extraction: ['#d8e060', 0.11], elite: ['#ff4a4a', 0.17], hazard: ['#ffb020', 0.14],
  clinic: ['#7fe8e0', 0.14], armory: ['#6a8cff', 0.14], merchant: ['#ffb04a', 0.17], cache: ['#f4c66d', 0.14],
};
const COMBAT_TINTS = ['#ff5367', '#eaaa66', '#79d6ae', '#a888e8'];
export const roomTint = (room, index) => ROLE_TINT[room.role] || [COMBAT_TINTS[index % 4], 0.075];

export class WorldLayer {
  constructor() {
    this.level = null;
    this.chunks = new Map();
    this.queue = [];
    this.patterns = null;
    this.version = 0;
    this.bakeMs = 0;
  }

  textures() {
    if (this.sources) return this.sources;
    this.sources = {grime: grimeTile(192, 5, 1), grime2: grimeTile(160, 9, 1.4), wall: wallTile(128, 11), void: voidTile(128, 3), plate: steelPlateTile(64, 9)};
    return this.sources;
  }

  pattern(g, name) {
    this.textures();
    const p = g.createPattern(this.sources[name], 'repeat');
    p.setTransform(new DOMMatrix().scale(1 / CS));
    return p;
  }

  setLevel({tileMap, rooms, doors, seed}) {
    this.chunks.clear(); this.queue = []; this.version++;
    const h = tileMap.length, w = tileMap[0].length;
    const kind = new Uint8Array(w * h).fill(2);
    const tileRoom = new Int16Array(w * h).fill(-1);
    const isFloor = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tileMap[y][x] === 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (isFloor(x, y)) { kind[y * w + x] = 0; continue; }
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloor(x + dx, y + dy)) { near = true; break; }
      kind[y * w + x] = near ? 1 : 2;
    }
    rooms.forEach((room, index) => {
      for (let y = room.y1; y <= room.y2; y++) for (let x = room.x1; x <= room.x2; x++) if (isFloor(x, y)) tileRoom[y * w + x] = index;
    });
    const rnd = seeded((seed >>> 0) + 991);
    const floorTiles = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (kind[y * w + x] === 0) floorTiles.push([x, y]);
    const stains = [];
    const stainCount = Math.floor(floorTiles.length / 7);
    for (let i = 0; i < stainCount; i++) {
      const [tx, ty] = floorTiles[Math.floor(rnd() * floorTiles.length)];
      const t = rnd();
      stains.push({x: (tx + rnd()) * TILE, y: (ty + rnd()) * TILE, r: 10 + rnd() * 34, kind: t < 0.42 ? 'oil' : t < 0.7 ? 'rust' : t < 0.88 ? 'damp' : 'pale'});
    }
    this.level = {tileMap, rooms, doors, seed, w, h, kind, tileRoom, stains, isFloor};
    this.cw = CW;
  }

  chunkAt(cx, cy) {
    const L = this.level;
    if (!L || cx < 0 || cy < 0 || cx * CHUNK_TILES >= L.w || cy * CHUNK_TILES >= L.h) return null;
    const key = cy * 1000 + cx;
    let chunk = this.chunks.get(key);
    if (!chunk) this.chunks.set(key, chunk = {cx, cy, floor: null, walls: null, baked: false});
    return chunk;
  }

  bake(chunk) {
    if (chunk.baked) return;
    const t0 = performance.now();
    chunk.baked = true;
    this.bakeFloor(chunk);
    this.bakeWalls(chunk);
    this.bakeMs += performance.now() - t0;
  }

  // Bake a few not-yet-ready chunks nearest to (x,y) when there is spare frame time.
  idleBake(x, y, budgetMs = 6) {
    const L = this.level;
    if (!L) return;
    if (!this.queue.length) {
      const list = [];
      for (let cy = 0; cy * CHUNK_TILES < L.h; cy++) for (let cx = 0; cx * CHUNK_TILES < L.w; cx++) list.push({cx, cy, d: Math.hypot((cx + 0.5) * CW - x, (cy + 0.5) * CW - y)});
      list.sort((a, b) => a.d - b.d);
      this.queue = list;
    }
    const end = performance.now() + budgetMs;
    while (this.queue.length && performance.now() < end) {
      const {cx, cy} = this.queue.shift();
      const chunk = this.chunkAt(cx, cy);
      if (chunk && !chunk.baked && this.chunkHasContent(cx, cy)) this.bake(chunk);
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
    const c = makeCanvas(CPX, CPX), g = c.getContext('2d');
    g.setTransform(CS, 0, 0, CS, -x0 * CS, -y0 * CS);
    const tx0 = chunk.cx * CHUNK_TILES, ty0 = chunk.cy * CHUNK_TILES, tx1 = Math.min(L.w, tx0 + CHUNK_TILES), ty1 = Math.min(L.h, ty0 + CHUNK_TILES);
    const floorAt = (x, y) => x >= 0 && y >= 0 && x < L.w && y < L.h && L.kind[y * L.w + x] === 0;
    const tint = this.pattern(g, 'grime');
    // base slabs with per-tile variation
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (!floorAt(x, y)) continue;
      const n = hash2(x, y, L.seed), f = 0.9 + n * 0.2;
      g.fillStyle = shade(FLOOR, f);
      g.fillRect(x * TILE, y * TILE, TILE, TILE);
      const room = L.tileRoom[y * L.w + x];
      if (room >= 0) { const [col, a] = roomTint(L.rooms[room], room); g.fillStyle = rgba(col, a); g.fillRect(x * TILE, y * TILE, TILE, TILE); }
    }
    // grime over everything
    g.beginPath();
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) if (floorAt(x, y)) g.rect(x * TILE, y * TILE, TILE, TILE);
    g.fillStyle = tint; g.fill();
    g.globalAlpha = 0.6; g.fillStyle = this.pattern(g, 'grime2'); g.fill(); g.globalAlpha = 1;
    // clip following details to floor tiles
    g.save();
    g.beginPath();
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) if (floorAt(x, y)) g.rect(x * TILE, y * TILE, TILE, TILE);
    g.clip();
    for (const s of L.stains) {
      if (s.x + s.r < x0 || s.x - s.r > x0 + CW || s.y + s.r < y0 || s.y - s.r > y0 + CW) continue;
      if (s.kind === 'oil') { blotch(g, s.x, s.y, s.r, '6,6,12', 0.5); blotch(g, s.x - s.r * 0.15, s.y - s.r * 0.15, s.r * 0.45, '80,90,130', 0.08); }
      else if (s.kind === 'rust') blotch(g, s.x, s.y, s.r * 1.1, '120,62,30', 0.26);
      else if (s.kind === 'damp') blotch(g, s.x, s.y, s.r * 1.3, '20,24,40', 0.3);
      else blotch(g, s.x, s.y, s.r, '255,240,220', 0.07);
    }
    // seams: faint grid + heavier slab joints
    g.lineWidth = 0.8; g.strokeStyle = 'rgba(8,6,12,0.34)'; g.beginPath();
    for (let y = ty0; y < ty1 + 1; y++) for (let x = tx0; x < tx1 + 1; x++) {
      if (floorAt(x, y) && floorAt(x - 1, y) && x % 4 !== 0) { g.moveTo(x * TILE, y * TILE); g.lineTo(x * TILE, (y + 1) * TILE); }
      if (floorAt(x, y) && floorAt(x, y - 1) && y % 4 !== 0) { g.moveTo(x * TILE, y * TILE); g.lineTo((x + 1) * TILE, y * TILE); }
    }
    g.stroke();
    g.lineWidth = 1.4; g.strokeStyle = 'rgba(6,4,10,0.5)'; g.beginPath();
    for (let y = ty0; y < ty1 + 1; y++) for (let x = tx0; x < tx1 + 1; x++) {
      if (floorAt(x, y) && floorAt(x - 1, y) && x % 4 === 0) { g.moveTo(x * TILE, y * TILE); g.lineTo(x * TILE, (y + 1) * TILE); }
      if (floorAt(x, y) && floorAt(x, y - 1) && y % 4 === 0) { g.moveTo(x * TILE, y * TILE); g.lineTo((x + 1) * TILE, y * TILE); }
    }
    g.stroke();
    g.lineWidth = 0.8; g.strokeStyle = 'rgba(255,240,225,0.07)'; g.beginPath();
    for (let y = ty0; y < ty1 + 1; y++) for (let x = tx0; x < tx1 + 1; x++) {
      if (floorAt(x, y) && floorAt(x - 1, y)) { g.moveTo(x * TILE + 1, y * TILE); g.lineTo(x * TILE + 1, (y + 1) * TILE); }
      if (floorAt(x, y) && floorAt(x, y - 1)) { g.moveTo(x * TILE, y * TILE + 1); g.lineTo((x + 1) * TILE, y * TILE + 1); }
    }
    g.stroke();
    // cracks, drains, bolts
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (!floorAt(x, y)) continue;
      const n = hash2(x, y, L.seed + 17);
      if (n < 0.07) {
        const r = seeded(Math.floor(n * 1e7)); let px = (x + r()) * TILE, py = (y + r()) * TILE, a = r() * TAU;
        g.strokeStyle = 'rgba(8,6,12,0.55)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(px, py);
        for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 1.2; px += Math.cos(a) * 6; py += Math.sin(a) * 6; g.lineTo(px, py); }
        g.stroke();
        g.strokeStyle = 'rgba(255,240,225,0.1)'; g.lineWidth = 0.6; g.stroke();
      } else if (n > 0.985) {
        const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
        g.fillStyle = '#17141c'; g.fillRect(cx - 8, cy - 8, 16, 16);
        g.strokeStyle = '#4b4553'; g.lineWidth = 1; g.strokeRect(cx - 8, cy - 8, 16, 16);
        g.strokeStyle = '#2a2631'; g.lineWidth = 1.2; g.beginPath(); for (let k = -5; k <= 5; k += 3.3) { g.moveTo(cx - 6, cy + k); g.lineTo(cx + 6, cy + k); } g.stroke();
      }
    }
    for (const [index, room] of L.rooms.entries()) this.paintRoom(g, room, index, x0, y0);
    g.restore();
    // ambient room lamp pools (additive)
    g.globalCompositeOperation = 'lighter';
    for (const [index, room] of L.rooms.entries()) {
      const cx = (room.cx + 0.5) * TILE, cy = (room.cy + 0.5) * TILE, r = Math.min(room.x2 - room.x1, room.y2 - room.y1) * TILE * 0.62 + 40;
      if (cx + r < x0 || cx - r > x0 + CW || cy + r < y0 || cy - r > y0 + CW) continue;
      const [col] = roomTint(room, index);
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, rgba(mix(col, '#ffe8c8', 0.5), 0.17)); grad.addColorStop(0.6, rgba(col, 0.05)); grad.addColorStop(1, rgba(col, 0));
      g.fillStyle = grad; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    // clip lamp light to floor: cheap approach is to leave it; walls are drawn on top.
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
    } else if (role === 'merchant' && near(150)) {
      g.fillStyle = 'rgba(110,22,28,0.5)'; g.fillRect(cx - 100, cy - 66, 200, 132);
      g.strokeStyle = 'rgba(255,196,110,0.5)'; g.lineWidth = 3; g.strokeRect(cx - 94, cy - 60, 188, 120);
      g.strokeStyle = 'rgba(255,196,110,0.25)'; g.lineWidth = 1; g.strokeRect(cx - 86, cy - 52, 172, 104);
      g.strokeStyle = 'rgba(255,196,110,0.18)'; g.beginPath(); for (let i = -80; i <= 80; i += 20) { g.moveTo(cx + i, cy - 50); g.lineTo(cx + i + 14, cy + 50); } g.stroke();
    } else if (role === 'cache' && near(100)) {
      g.strokeStyle = 'rgba(244,198,109,0.3)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 44, 0, TAU); g.stroke();
      g.beginPath(); g.arc(cx, cy, 36, 0, TAU); g.setLineDash([3, 6]); g.stroke(); g.setLineDash([]);
    } else if (role === 'armory' && near(120)) {
      g.strokeStyle = 'rgba(120,150,255,0.22)'; g.lineWidth = 2; g.strokeRect(cx - 64, cy - 40, 128, 80);
      g.strokeStyle = 'rgba(255,220,100,0.2)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 64, cy - 40); g.lineTo(cx + 64, cy + 40); g.moveTo(cx + 64, cy - 40); g.lineTo(cx - 64, cy + 40); g.stroke();
    }
  }

  // ---- walls
  bakeWalls(chunk) {
    const L = this.level, x0 = chunk.cx * CW, y0 = chunk.cy * CW;
    const tx0 = chunk.cx * CHUNK_TILES, ty0 = chunk.cy * CHUNK_TILES, tx1 = Math.min(L.w, tx0 + CHUNK_TILES), ty1 = Math.min(L.h, ty0 + CHUNK_TILES);
    const kindAt = (x, y) => x < 0 || y < 0 || x >= L.w || y >= L.h ? 2 : L.kind[y * L.w + x];
    // include tiles up-left of the chunk, which can throw shadows into it
    const sx0 = tx0 - 2, sy0 = ty0 - 2;
    let any = false;
    for (let y = sy0; y < ty1 && !any; y++) for (let x = sx0; x < tx1; x++) if (kindAt(x, y) !== 0) { any = true; break; }
    if (!any) { chunk.walls = null; return; }
    const c = makeCanvas(CPX, CPX), g = c.getContext('2d');
    g.setTransform(CS, 0, 0, CS, -x0 * CS, -y0 * CS);
    const hasFilter = 'filter' in g;
    // soft long shadow + contact occlusion on the floor
    const hullPath = () => {
      g.beginPath();
      for (let y = sy0; y < ty1; y++) for (let x = sx0; x < tx1; x++) {
        if (kindAt(x, y) !== 1) continue;
        const a = x * TILE, b = y * TILE, w = TILE;
        g.moveTo(a, b); g.lineTo(a + w, b); g.lineTo(a + w + SHADOW_DX, b + SHADOW_DY); g.lineTo(a + w + SHADOW_DX, b + w + SHADOW_DY); g.lineTo(a + SHADOW_DX, b + w + SHADOW_DY); g.lineTo(a, b + w); g.closePath();
      }
    };
    if (hasFilter) {
      g.filter = `blur(${11}px)`; g.fillStyle = 'rgba(4,3,8,0.5)'; hullPath(); g.fill();
      g.filter = `blur(${15}px)`; g.fillStyle = 'rgba(4,3,8,0.32)';
      g.beginPath(); for (let y = sy0; y < ty1; y++) for (let x = sx0; x < tx1; x++) if (kindAt(x, y) === 1) g.rect(x * TILE - 3, y * TILE - 3, TILE + 6, TILE + 6); g.fill();
      g.filter = 'none';
    } else {
      g.fillStyle = 'rgba(4,3,8,0.1)';
      for (let i = 0; i < 5; i++) { g.save(); g.translate(i * 1.5 - 3, i * 1.2 - 2); hullPath(); g.fill(); g.restore(); }
    }
    // void
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
      g.fillStyle = n > 0.5 ? `rgba(255,246,235,${(n - 0.5) * 0.14})` : `rgba(10,6,16,${(0.5 - n) * 0.22})`;
      g.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    // inner darkening fading toward the void so walls look thick
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (kindAt(x, y) !== 1) continue;
      const a = x * TILE, b = y * TILE;
      const fl = (dx, dy) => kindAt(x + dx, y + dy) === 0;
      // edges that face void get darker
      const vd = (dx, dy) => kindAt(x + dx, y + dy) === 2;
      for (const [dx, dy, gx0, gy0, gx1, gy1] of [[1, 0, a + TILE, b, a + TILE - 12, b], [-1, 0, a, b, a + 12, b], [0, 1, a, b + TILE, a, b + TILE - 12], [0, -1, a, b, a, b + 12]]) {
        if (!vd(dx, dy)) continue;
        const grad = g.createLinearGradient(gx0, gy0, gx1, gy1); grad.addColorStop(0, 'rgba(6,4,12,0.55)'); grad.addColorStop(1, 'rgba(6,4,12,0)');
        g.fillStyle = grad; g.fillRect(a, b, TILE, TILE);
      }
      void fl;
    }
    // lips (visible faces), highlights and ink
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (kindAt(x, y) !== 1) continue;
      const a = x * TILE, b = y * TILE;
      if (kindAt(x, y + 1) === 0) {
        const grad = g.createLinearGradient(0, b + TILE - WALL_LIP - 3, 0, b + TILE);
        grad.addColorStop(0, 'rgba(18,13,26,0)'); grad.addColorStop(0.45, 'rgba(18,13,26,0.7)'); grad.addColorStop(1, '#1d1726');
        g.fillStyle = grad; g.fillRect(a, b + TILE - WALL_LIP - 3, TILE, WALL_LIP + 3);
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(a, b + TILE - WALL_LIP - 1, TILE, 0.8);
        if (hash2(x, y, 41) > 0.45) { g.fillStyle = 'rgba(210,190,150,0.42)'; for (let k = 6; k < TILE; k += 12) g.fillRect(a + k, b + TILE - 3.3, 1.3, 1.3); }
      }
      if (kindAt(x + 1, y) === 0) {
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
      if (kindAt(x, y - 1) === 0) { g.moveTo(a, b + 1.2); g.lineTo(a + TILE, b + 1.2); }
      if (kindAt(x - 1, y) === 0) { g.moveTo(a + 1.2, b); g.lineTo(a + 1.2, b + TILE); }
    }
    g.stroke();
    g.strokeStyle = 'rgba(16,12,22,0.95)'; g.lineWidth = 1.5; g.beginPath();
    for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
      if (kindAt(x, y) !== 1) continue;
      const a = x * TILE, b = y * TILE;
      if (kindAt(x, y - 1) === 0) { g.moveTo(a, b); g.lineTo(a + TILE, b); }
      if (kindAt(x, y + 1) === 0) { g.moveTo(a, b + TILE); g.lineTo(a + TILE, b + TILE); }
      if (kindAt(x - 1, y) === 0) { g.moveTo(a, b); g.lineTo(a, b + TILE); }
      if (kindAt(x + 1, y) === 0) { g.moveTo(a + TILE, b); g.lineTo(a + TILE, b + TILE); }
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
    // door frames
    for (const door of L.doors) this.paintDoor(g, door, x0, y0);
    chunk.walls = c;
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

  // ---- decals
  stamp(bounds, draw) {
    if (!this.level) return;
    const cx0 = Math.floor(bounds.x0 / CW), cx1 = Math.floor(bounds.x1 / CW), cy0 = Math.floor(bounds.y0 / CW), cy1 = Math.floor(bounds.y1 / CW);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const chunk = this.chunkAt(cx, cy);
      if (!chunk) continue;
      if (!chunk.baked) this.bake(chunk);
      if (!chunk.floor) continue;
      const g = chunk.floor.getContext('2d');
      g.save(); g.setTransform(CS, 0, 0, CS, -cx * CW * CS, -cy * CW * CS); draw(g); g.restore();
    }
  }

  stampDecal(d) {
    const L = this.level;
    if (!L) return;
    const tx = Math.floor(d.x / TILE), ty = Math.floor(d.y / TILE);
    if (L.kind[ty * L.w + tx] !== 0) return;
    const R = (d.r || 12) + 6;
    this.stamp({x0: d.x - R, y0: d.y - R, x1: d.x + R, y1: d.y + R}, (g) => drawDecal(g, d));
  }

  // ---- drawing
  draw(ctx, cam, bounds, dpr) {
    const L = this.level;
    if (!L) return;
    const cx0 = Math.max(0, Math.floor(bounds.x0 / CW)), cx1 = Math.floor(bounds.x1 / CW), cy0 = Math.max(0, Math.floor(bounds.y0 / CW)), cy1 = Math.floor(bounds.y1 / CW);
    const s = cam.scale * dpr, ox = cam.w / 2 * dpr - cam.x * s, oy = cam.h / 2 * dpr - cam.y * s;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const layer of ['floor', 'walls']) {
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.chunkAt(cx, cy);
        if (!chunk) continue;
        if (!chunk.baked) this.bake(chunk);
        const img = chunk[layer];
        if (!img) continue;
        const l = Math.round(ox + cx * CW * s), t = Math.round(oy + cy * CW * s), r = Math.round(ox + (cx + 1) * CW * s), b = Math.round(oy + (cy + 1) * CW * s);
        ctx.drawImage(img, 0, 0, img.width, img.height, l, t, r - l, b - t);
      }
    }
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
