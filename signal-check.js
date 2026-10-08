// THE SIGNAL CHECK: a hand-built five-room onboarding floor (DESIGN_DIRECTION 5c). Pure data + pure rules.
// The layout comes out in the same shape generateDungeon() returns (cells, rooms, doors, lockedDoors, start) plus
// `glass` tiles, `doorPlans`, and a `script` that game.js executes. Nothing here touches the DOM or physics.
//
//   R1 BREATH   a ghost round hangs in the air; it only moves when you do. Door opens as you walk up.
//   R2 SHOT     a sleeper behind a window. Shoot it through the glass; the glass shatters, the way opens.
//   R3 DODGE    a fixed warden fires slow telegraphed shots down a corridor. A pillar gives cover.
//   R4 DOOR     a closed door: hold E to peek. A guard facing away, a sleeper in the south lane. Clear it or sneak.
//   R5 CHOICE   three reward alcoves with icons. Walk into one. Then SIGNAL CHECK COMPLETE.
//
// Rules of the floor: every failure resets only the room you are in; text is keycaps and single words.

export const TILE = 32;
export const T_FLOOR = 0, T_WALL = 1, T_GLASS = 4;
export const WIDTH = 92, HEIGHT = 14;

const rect = (x1, y1, x2, y2) => ({x1, y1, x2, y2});

function carve(cells, r, value = T_FLOOR) {
  for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) cells[y][x] = value;
}

/** Room geometry (inclusive tile rects) and the passages that join them. */
export const ROOM_RECTS = [
  rect(2, 3, 15, 10),    // R1 BREATH
  rect(18, 3, 33, 10),   // R2 SHOT
  rect(36, 4, 52, 9),    // R3 DODGE
  rect(56, 3, 71, 10),   // R4 DOOR
  rect(74, 3, 87, 10),   // R5 CHOICE
];
export const PASSAGES = [
  rect(16, 6, 17, 7),    // R1 -> R2  (gate door at x=16)
  rect(34, 6, 35, 7),    // R2 -> R3  (open once the glass is gone)
  rect(53, 8, 55, 9),    // R3 -> R4  (gate door at x=53, peek door at x=55)
  rect(72, 8, 73, 9),    // R4 -> R5
];
/** Reward alcoves cut into R5's east wall (2 deep, 2 tall, one wall tile between them). */
export const ALCOVES = [
  {id: 'freq', rect: rect(88, 3, 89, 4), reward: 'freq'},
  {id: 'scrap', rect: rect(88, 6, 89, 7), reward: 'scrap'},
  {id: 'supply', rect: rect(88, 9, 89, 10), reward: 'supply'},
];
export const GLASS_TILES = Array.from({length: 8}, (_, i) => ({x: 26, y: 3 + i}));
/** Zones decide which room a position belongs to (checkpoint and reset). Contiguous, left to right. */
export const ZONES = [
  {room: 0, x0: 0, x1: 17},
  {room: 1, x0: 17, x1: 35},
  {room: 2, x0: 35, x1: 54},
  {room: 3, x0: 54, x1: 73},
  {room: 4, x0: 73, x1: 100},
];

export const REWARD_INFO = {
  freq: {id: 'freq', label: 'UPGRADE', color: '#9ad8ff', glyph: 'upgrade'},
  scrap: {id: 'scrap', label: 'SCRAP', color: '#f4c66d', glyph: 'hex'},
  supply: {id: 'supply', label: 'SUPPLY', color: '#ffd27a', glyph: 'crate'},
};

/**
 * R1's frozen firefight: a field of rounds hanging in the air, flanking the lane you walk. Every one rides world time,
 * so standing still freezes the field and each step sets it streaming (the renderer lengthens their streaks and warms
 * their colour with the world rate). `fade` rounds wrap from endX back to resetX without a pop. Tile units.
 */
export const GHOST_FIELD = [
  {x: 9.5, y: 5.5, vx: 190, vy: 0}, {x: 7.0, y: 4.3, vx: 150, vy: 0}, {x: 11.6, y: 4.6, vx: 235, vy: 0}, {x: 13.6, y: 5.3, vx: 170, vy: 0},
  {x: 5.9, y: 8.2, vx: 205, vy: 0}, {x: 10.2, y: 8.9, vx: 160, vy: 0}, {x: 13.2, y: 7.9, vx: 250, vy: 0}, {x: 8.4, y: 7.5, vx: 180, vy: -10},
  {x: 12.1, y: 6.9, vx: 215, vy: 6}, {x: 14.2, y: 6.2, vx: 140, vy: 0}, {x: 6.6, y: 5.6, vx: 260, vy: 0}, {x: 9.0, y: 9.7, vx: 175, vy: 0},
].map((p, i) => ({kind: 'ghost-round', seed: i, ...p, resetX: 3.4, endX: 15.1, fade: true}));

/** Per-room script. Positions are tiles; game.js turns them into px. `idle` is the single word shown when stuck. */
export const SCRIPT = [
  {
    id: 'breath', name: 'BREATH', start: {x: 4.5, y: 6.5}, idleHint: {after: 1.2, keys: 'move', word: 'MOVE'},
    goal: {type: 'reach', x: 13},                     // player x (tiles) >= 13 opens the gate
    unlock: 'gate:breath',
    props: GHOST_FIELD,
    enemies: [],
    card: {id: 'time.breath', title: 'BREATH', line: 'time follows your feet'},
  },
  {
    id: 'shot', name: 'SHOT', start: {x: 22.5, y: 6.5}, idleHint: {after: 6, keys: 'fire', word: 'FIRE'},
    goal: {type: 'kill'},                             // every enemy of the room dead shatters the glass
    unlock: 'glass',
    props: [],
    enemies: [{type: 'gunner', x: 29.5, y: 6.5, posture: 'sleep', face: {x: -1, y: 0}}],
    card: {id: 'time.shot', title: 'SHOT', line: 'every shot lets time through'},
  },
  {
    id: 'dodge', name: 'DODGE', start: {x: 36.5, y: 6.5}, idleHint: null,
    goal: {type: 'reach', x: 50},
    unlock: 'gate:dodge',
    props: [],
    enemies: [{type: 'guard', x: 51.5, y: 4.5, posture: 'guard', face: {x: -1, y: 0}, fixed: true, range: 360}],
    cause: 'KILLED BY WARDEN · STOOD IN A LANE',
    card: {id: 'enemy.guard', title: 'WARDEN', line: 'step out of the red line'},
  },
  {
    id: 'door', name: 'DOOR', start: {x: 54.5, y: 8.5}, idleHint: null,
    goal: {type: 'reach', x: 72.2},
    unlock: null,
    props: [],
    enemies: [
      {type: 'gunner', x: 60.5, y: 5.5, posture: 'guard', face: {x: 1, y: 0}},
      {type: 'chaser', x: 65.5, y: 10.5, posture: 'sleep', face: {x: 0, y: -1}},
    ],
    flash: 2,
    card: {id: 'mech.door', title: 'DOOR', line: 'hold E to peek'},
  },
  {
    id: 'choice', name: 'CHOICE', start: {x: 79.5, y: 6.5}, idleHint: null,
    goal: {type: 'pick'},
    unlock: null,
    props: [], enemies: [],
    card: {id: 'mech.choice', title: 'CHOICE', line: 'walk into one'},
  },
];

/** Gate doors (scripted: no prompt, open on the room's `unlock`). The peek door is the real, closable one. */
export const DOOR_PLANS = [
  {id: 'gate:breath', gate: true, x: 16.5, y: 7, axis: 'y', cells: [{x: 16, y: 6}, {x: 16, y: 7}], dir: {x: 1, y: 0}, roomIndex: 0},
  {id: 'gate:dodge', gate: true, x: 53.5, y: 9, axis: 'y', cells: [{x: 53, y: 8}, {x: 53, y: 9}], dir: {x: 1, y: 0}, roomIndex: 2},
  {id: 'door:peek', gate: false, x: 55.5, y: 9, axis: 'y', cells: [{x: 55, y: 8}, {x: 55, y: 9}], dir: {x: 1, y: 0}, roomIndex: 3},
];

/** Cover stamped into tile map: pillars in the dodge corridor, a sandbag wall that hides the south lane in R4. */
export const COVER = [
  {room: 2, kind: 'pillar', tiles: [{x: 44, y: 6}, {x: 44, y: 7}]},
  {room: 3, kind: 'wall', tiles: [62, 63, 64, 65, 66, 67, 68].map(x => ({x, y: 7}))},
];

export function buildSignalLayout() {
  const cells = Array.from({length: HEIGHT}, () => Array(WIDTH).fill(T_WALL));
  ROOM_RECTS.forEach(r => carve(cells, r));
  PASSAGES.forEach(r => carve(cells, r));
  ALCOVES.forEach(a => carve(cells, a.rect));
  for (const g of GLASS_TILES) cells[g.y][g.x] = T_GLASS;
  const rooms = ROOM_RECTS.map((r, index) => ({
    index, x1: r.x1, x2: r.x2, y1: r.y1, y2: r.y2, cx: Math.floor((r.x1 + r.x2) / 2), cy: Math.floor((r.y1 + r.y2) / 2),
    role: 'combat', name: SCRIPT[index].name, template: 'signal', shape: 'rectangle', cover: [], crates: [], spawnTiles: [], visited: index === 0, cleared: false, signal: true,
    theme: {floor: 'concrete', tint: '#2a3340', accent: ['#6dd5ff', '#ffd27a', '#ff8a6a', '#b49bff', '#6dffb0'][index], lights: {color: '#9ad8ff', intensity: 1.0, flicker: false},
      decor: lightGrid(r)},
  }));
  for (const c of COVER) for (const t of c.tiles) { cells[t.y][t.x] = T_WALL; rooms[c.room].cover.push({x: t.x, y: t.y, kind: c.kind}); }
  return {
    cells, width: WIDTH, height: HEIGHT, rooms, doors: [], lockedDoors: [], loops: 0, start: rooms[0],
    glass: GLASS_TILES.map(t => ({...t})), alcoves: ALCOVES, doorPlans: DOOR_PLANS.map(d => ({...d, cells: d.cells.map(c => ({...c}))})), script: SCRIPT,
  };
}

function lightGrid(r) {
  const out = [];
  for (let y = r.y1 + 2; y < r.y2; y += 4) for (let x = r.x1 + 3; x < r.x2; x += 6) out.push({kind: 'light', x: x + 0.5, y: y + 0.5, rot: 0, color: '#9ad8ff', flicker: false, steady: true});
  return out;
}

// ------------------------------------------------------------------------------------------------ rules
/** Which room a position (px) belongs to. Zones are contiguous so every x maps to exactly one room. */
export function zoneOf(xPx) {
  const tx = xPx / TILE;
  for (const z of ZONES) if (tx >= z.x0 && tx < z.x1) return z.room;
  return tx < 0 ? 0 : ZONES.length - 1;
}

/** Start position (px) of a room. */
export const roomStartPx = index => ({x: SCRIPT[index].start.x * TILE, y: SCRIPT[index].start.y * TILE});

/** Which alcove (if any) a position is inside. */
export function alcoveAt(xPx, yPx) {
  const tx = Math.floor(xPx / TILE), ty = Math.floor(yPx / TILE);
  return ALCOVES.find(a => tx >= a.rect.x1 && tx <= a.rect.x2 && ty >= a.rect.y1 && ty <= a.rect.y2) || null;
}

/**
 * Evaluate the current room's goal. ctx = {room, player:{x,y} px, living: living enemies in this room, picked}.
 * Returns {met, unlock} where unlock names what opens (a gate id, 'glass') or null.
 */
export function goalMet(ctx) {
  const s = SCRIPT[ctx.room];
  if (!s) return {met: false, unlock: null};
  let met = false;
  if (s.goal.type === 'reach') met = ctx.player.x / TILE >= s.goal.x;
  else if (s.goal.type === 'kill') met = ctx.living === 0;
  else if (s.goal.type === 'pick') met = !!ctx.picked;
  return {met, unlock: met ? s.unlock : null};
}

/** Fresh progress object for a run through the Signal Check. */
export function createSignalProgress() {
  return {active: true, room: 0, attempts: [0, 0, 0, 0, 0], opened: new Set(), done: false, picked: null, idle: 0, props: [], glassBroken: false};
}

/** The one word to show when the player seems stuck in a room (keycaps / single words only). */
export function idleHint(room, idleSeconds, shotsFired = 0) {
  const h = SCRIPT[room]?.idleHint;
  if (!h || idleSeconds < h.after) return null;
  if (h.keys === 'fire' && shotsFired > 0) return null;
  return {keys: h.keys, word: h.word};
}

/** Where the player respawns and what must be rebuilt when a room is reset. */
export function resetPlan(room) {
  const s = SCRIPT[room];
  return {start: roomStartPx(room), enemies: s.enemies.map(e => ({...e, face: {...e.face}})), props: s.props.map(p => ({...p})), closePeekDoor: room === 3, cause: s.cause || null};
}

// ------------------------------------------------------------------------------------------------ validation
/** Floor-connectivity check used by the tests: true when `to` is reachable from `from` over floor tiles (+ `extra`). */
export function connected(cells, from, to, extra = new Set()) {
  const key = (x, y) => `${x},${y}`, seen = new Set([key(from.x, from.y)]), q = [from];
  for (let h = 0; h < q.length; h++) {
    const p = q[h];
    if (p.x === to.x && p.y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = {x: p.x + dx, y: p.y + dy}, k = key(n.x, n.y);
      if (seen.has(k) || !(cells[n.y]?.[n.x] === T_FLOOR || extra.has(k))) continue;
      seen.add(k); q.push(n);
    }
  }
  return false;
}
