// Hidden things the level generator tucks away, all deterministic from the floor seed and all pure (no DOM, no Rapier).
//
//   planSecret   a CRACKED WALL: one wall tile of some room is visibly cracked. Shoot it open and a sealed 3x3 pocket
//                behind it holds a cosmetic reward (a hat) or a field tape. The rule is visible: the crack is drawn.
//   planTape     a hidden TAPE lying in an odd corner of a room (plays a short operator transmission when picked up)
//   planDecor    wall-mounted storytelling props for a room: the stopped clock, the broken TV, the logbook shelf, call-sign stencils
//   numberStationRooms   which rooms carry the rare "number station" room tone
//
// Tile codes follow the dungeon tile map: 0 floor, 1 wall, 4 glass. Rooms are {index, x1, y1, x2, y2, cover?, role}.

export const mulberry = (seed) => {
  let a = (seed | 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const mix = (...n) => {
  let h = 0x811c9dc5;
  for (const v of n) { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; h ^= h >>> 13; }
  return h >>> 0;
};

// ------------------------------------------------------------------ the stopped clock
// Every wall clock in the station stopped at the moment the signal died (shift log 14: "Doors sealed ... at 03:12").
export const SIGNAL_DIED = {h: 3, m: 12, label: '03:12'};

// ------------------------------------------------------------------ cracked wall + secret pocket
export const SECRET = {chance: 0.5, hits: 3, pocket: 3, depth: 3};
const DIRS = [{x: 0, y: -1}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 1, y: 0}];

const inRoomBox = (rooms, x, y) => rooms.some((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);

/**
 * Plan at most one secret per floor. Returns null (most floors with chance < 1) or
 * {room, crack:{x,y}, dir:{x,y}, pocket:{x1,y1,x2,y2}, cells:[{x,y}], reward:{x,y}, hits}.
 * `cells` is every tile that is hollowed out when the wall opens (the crack tile + the pocket). The 5-wide ring around the
 * pocket must be solid rock so the room never touches anything else.
 */
export function planSecret({tileMap, rooms, seed = 1, floor = 1, chance = SECRET.chance, skipRooms = []}) {
  if (!tileMap?.length || !rooms?.length) return null;
  const rng = mulberry(mix(seed, floor, 0x5ec12e7));
  if (rng() >= chance) return null;
  const h = tileMap.length, w = tileMap[0].length, P = SECRET.pocket, D = SECRET.depth;
  const skip = new Set(skipRooms);
  const order = rooms.map((r, i) => ({r, k: rng(), i})).filter(({r, i}) => !skip.has(r.index ?? i) && r.role !== 'entry').sort((a, b) => a.k - b.k);
  const cover = new Set();
  for (const r of rooms) for (const c of r.cover || []) cover.add(c.y * w + c.x);
  const solid = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1 && tileMap[y][x] === 1 && !cover.has(y * w + x);
  for (const {r} of order) {
    const cands = [];
    for (const d of DIRS) {
      const lat = {x: -d.y, y: d.x};
      // floor edge tiles whose neighbour in direction d is a wall: the crack sits there
      const edge = d.y < 0 ? {y: r.y1, xs: range(r.x1 + 1, r.x2 - 1)} : d.y > 0 ? {y: r.y2, xs: range(r.x1 + 1, r.x2 - 1)} : null;
      const edgeX = d.x < 0 ? {x: r.x1, ys: range(r.y1 + 1, r.y2 - 1)} : d.x > 0 ? {x: r.x2, ys: range(r.y1 + 1, r.y2 - 1)} : null;
      const starts = edge ? edge.xs.map((x) => ({x, y: edge.y})) : edgeX.ys.map((y) => ({x: edgeX.x, y}));
      for (const s of starts) {
        if (tileMap[s.y]?.[s.x] !== 0) continue;
        const crack = {x: s.x + d.x, y: s.y + d.y};
        if (!solid(crack.x, crack.y) || inRoomBox(rooms, crack.x, crack.y)) continue;
        // ring: lateral -2..2 across, depth 1..D+1 (crack tile row included). Everything solid, nothing inside another room.
        let ok = true;
        for (let dep = 1; dep <= D + 1 && ok; dep++) for (let l = -2; l <= 2 && ok; l++) {
          const x = crack.x + d.x * (dep - 1) + lat.x * l, y = crack.y + d.y * (dep - 1) + lat.y * l;
          if (!solid(x, y) || inRoomBox(rooms, x, y)) ok = false;
        }
        if (!ok) continue;
        cands.push({crack, d, lat});
      }
    }
    if (!cands.length) continue;
    const pick = cands[Math.floor(rng() * cands.length)];
    const {crack, d, lat} = pick;
    const cells = [{x: crack.x, y: crack.y}];
    for (let dep = 1; dep <= D; dep++) for (let l = -1; l <= 1; l++) cells.push({x: crack.x + d.x * dep + lat.x * l, y: crack.y + d.y * dep + lat.y * l});
    const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
    const mid = {x: crack.x + d.x * 2, y: crack.y + d.y * 2};
    void P;
    return {room: r.index, crack, dir: d, pocket: {x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys)}, cells, reward: mid, hits: SECRET.hits};
  }
  return null;
}
const range = (a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; };

/** How cracked the wall looks: 0 pristine crack .. hits-1 about to go; `hp` counts down from `hits`. */
export const crackStage = (hp, hits = SECRET.hits) => Math.max(0, Math.min(hits - 1, hits - hp));
/** Apply one hit; returns {hp, broke}. */
export function hitCrack(hp, damage = 1) { const next = Math.max(0, hp - damage); return {hp: next, broke: next <= 0}; }
/** True when the bullet's last position is inside tile (tx, ty) or just short of it travelling along (vx, vy). */
export function bulletHitsTile(x, y, vx, vy, tx, ty, tile = 32) {
  const len = Math.hypot(vx, vy) || 1, px = x + (vx / len) * 3, py = y + (vy / len) * 3;
  return Math.floor(px / tile) === tx && Math.floor(py / tile) === ty;
}
/** Is (px, py) inside any hollowed cell of the secret? */
export function inSecret(secret, px, py, tile = 32) {
  if (!secret) return false;
  const tx = Math.floor(px / tile), ty = Math.floor(py / tile);
  return secret.cells.some((c) => c.x === tx && c.y === ty);
}

// ------------------------------------------------------------------ hidden tape
export const TAPE_CHANCE = 0.55;
/** An odd corner: a floor tile of some room with a wall on one side AND one end, not by a door and not on cover. */
export function planTape({tileMap, rooms, doors = [], seed = 1, floor = 1, chance = TAPE_CHANCE, avoid = [], tile = 32}) {
  if (!tileMap?.length || !rooms?.length) return null;
  const rng = mulberry(mix(seed, floor, 0x7a9e));
  if (rng() >= chance) return null;
  const skip = new Set(avoid);
  const order = rooms.map((r, i) => ({r, k: rng(), i})).filter(({r, i}) => !skip.has(r.index ?? i) && r.role !== 'entry').sort((a, b) => a.k - b.k);
  const w = tileMap[0].length;
  const cover = new Set();
  for (const r of rooms) for (const c of r.cover || []) cover.add(c.y * w + c.x);
  const open = (x, y) => tileMap[y]?.[x] === 0 && !cover.has(y * w + x);
  const wall = (x, y) => tileMap[y]?.[x] === 1 || cover.has(y * w + x);
  for (const {r} of order) {
    const corners = [[r.x1, r.y1], [r.x2, r.y1], [r.x1, r.y2], [r.x2, r.y2]];
    const spots = [];
    for (const [cx, cy] of corners) {
      if (!open(cx, cy)) continue;
      if (doors.some((d) => Math.abs(d.x - cx) <= 2 && Math.abs(d.y - cy) <= 2)) continue;
      const sx = cx === r.x1 ? 1 : -1, sy = cy === r.y1 ? 1 : -1;
      if (!wall(cx - sx, cy) || !wall(cx, cy - sy)) continue;
      spots.push({tx: cx, ty: cy, sx, sy});
    }
    if (!spots.length) continue;
    const s = spots[Math.floor(rng() * spots.length)];
    return {room: r.index, tx: s.tx, ty: s.ty, x: (s.tx + 0.5 - s.sx * 0.12) * tile, y: (s.ty + 0.5 - s.sy * 0.12) * tile, variant: Math.floor(rng() * 1000)};
  }
  return null;
}

// ------------------------------------------------------------------ wall storytelling (north walls only, never on a door or crack)
export const DECOR_KINDS = ['clock', 'tv', 'desk', 'stencil', 'poster'];
export const CALLSIGNS = ['WDAD 1190', 'MERIDIAN RELAY', 'KDOA-7', 'SECTOR 4 · STAND BY', 'CH 00 · NO SIGNAL', 'ON AIR', 'W3AIR · TEST', 'DO NOT TOUCH THE DIAL'];

/**
 * Wall props for one room. Returns [{kind, tx, ty, x, y, variant}] where (x, y) is the centre on the wall face in world
 * px and (tx, ty) the wall tile. Props never share a tile neighbourhood, so two never overlap.
 */
export function planDecor({room, tileMap, seed = 1, floor = 1, avoidTiles = [], tile = 32}) {
  if (!room || !tileMap?.length || room.role === 'entry' && floor === 0) return [];
  const rng = mulberry(mix(seed, floor, room.index ?? 0, 0xdec02));
  const y = room.y1 - 1;
  if (y < 1) return [];
  const spots = [];
  for (let x = room.x1 + 1; x <= room.x2 - 1; x++) {
    if (tileMap[y]?.[x] !== 1 || tileMap[y + 1]?.[x] !== 0) continue;
    if (avoidTiles.some((a) => Math.abs(a.x - x) <= 1 && Math.abs(a.y - y) <= 1)) continue;
    spots.push(x);
  }
  if (spots.length < 2) return [];
  const kinds = [];
  if (rng() < 0.55) kinds.push('clock');
  if (rng() < 0.22) kinds.push('tv');
  if (rng() < 0.2) kinds.push('desk');
  if (rng() < 0.4) kinds.push('stencil');
  if (rng() < 0.2) kinds.push('poster');
  if (room.role === 'combat' && !kinds.length && rng() < 0.5) kinds.push('stencil');
  const out = [], taken = [];
  for (const kind of kinds) {
    const span = kind === 'desk' ? 2 : 1, free = spots.filter((x) => taken.every((t) => Math.abs(t - x) > 2 + (span - 1)) && (span === 1 || spots.includes(x + 1)));
    if (!free.length) continue;
    const x = free[Math.floor(rng() * free.length)];
    taken.push(x);
    out.push({kind, tx: x, ty: y, x: (x + (span === 2 ? 1 : 0.5)) * tile, y: (y + 0.5) * tile, variant: Math.floor(rng() * 1000)});
  }
  return out;
}

// ------------------------------------------------------------------ number station
export const NUMBER_STATION_CHANCE = 1 / 9;
/** Rooms (by index) that carry the rare number station tone this floor. Never the entry, never the boss room. */
export function numberStationRooms({rooms, seed = 1, floor = 1, chance = NUMBER_STATION_CHANCE}) {
  const out = [];
  (rooms || []).forEach((r, i) => {
    if (r.role === 'entry' || r.role === 'boss') return;
    const rng = mulberry(mix(seed, floor, r.index ?? i, 0x9a5));
    if (rng() < chance) out.push(r.index ?? i);
  });
  return out;
}
/** The countdown a number station reads out: nine digits, each a short run of beeps (digit = beep count, 0 = a long tone). */
export function numberStationDigits(seed = 1, n = 9) {
  const rng = mulberry(mix(seed, 0x4e57));
  return Array.from({length: n}, () => Math.floor(rng() * 10));
}
