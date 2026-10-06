// Closable doors at the entrances of combat rooms. Pure: tile data in, plain objects out. No DOM, no physics.
//
// A door is a thin steel panel across a doorway. Closed, it blocks walking, sight and bullets (game.js writes its
// cells into solidMap and adds a collider). It opens for good when the player taps E, walks into it, or an aware
// enemy reaches it. Holding E at a closed door is a PEEK: the sim freezes and the camera looks through (game.js).
//
// Rules the player can read in the world: opening is a quiet noise ring, kicking it open at a sprint is a loud one.
// A door never locks and never seals the route: it always opens, and the nav grid treats it as passable.

export const TILE = 32;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const floor = (cells, x, y) => cells[y]?.[x] === 0;

/** How a door was opened, and the noise ring that makes. Radii are px. */
export const DOOR_NOISE = Object.freeze({
  tap: {radius: 70, kind: 'door'},     // pressed E / walked into it: quiet
  walk: {radius: 70, kind: 'door'},
  kick: {radius: 230, kind: 'kick'},   // hit it at a sprint: loud
  enemy: {radius: 0, kind: 'door'},    // an enemy opening its own door makes no extra noise
  script: {radius: 0, kind: 'door'},
});
export const doorNoise = how => DOOR_NOISE[how] ?? DOOR_NOISE.tap;

/** Prompt copy (kept here so interaction.js and the tests agree). */
export const DOOR_PROMPT = Object.freeze({tap: 'OPEN', hold: 'HOLD · PEEK', peeking: 'PEEKING'});
/** Seconds E must be held at a closed door before it becomes a peek instead of a tap. */
export const PEEK_HOLD = 0.2;
/** Player must be this close (px, from door centre) for E to act on it. */
export const DOOR_RANGE = 62;

/**
 * Full cross-section of the passage at a doorway: the 2-tile door pair, grown along the span while the neighbours are
 * floor. Returns null when the line is not a true choke (walls must cap both ends, width 2..4).
 */
export function crossSection(cells, door) {
  const x = Math.floor(door.x), y = Math.floor(door.y), alongX = door.axis === 'x';
  const [sx, sy] = alongX ? [1, 0] : [0, 1];
  const start = alongX ? {x, y} : {x, y};
  if (!floor(cells, start.x, start.y) || !floor(cells, start.x + sx, start.y + sy)) return null;
  const tiles = [{x: start.x, y: start.y}, {x: start.x + sx, y: start.y + sy}];
  let lo = {x: start.x - sx, y: start.y - sy}, hi = {x: start.x + 2 * sx, y: start.y + 2 * sy};
  while (floor(cells, lo.x, lo.y) && tiles.length < 6) { tiles.unshift(lo); lo = {x: lo.x - sx, y: lo.y - sy}; }
  while (floor(cells, hi.x, hi.y) && tiles.length < 6) { tiles.push(hi); hi = {x: hi.x + sx, y: hi.y + sy}; }
  if (tiles.length > 4 || floor(cells, lo.x, lo.y) || floor(cells, hi.x, hi.y)) return null;
  // A real passage: every tile has floor on at least one side along the passage direction (not a closet corner).
  const [px, py] = alongX ? [0, 1] : [1, 0];
  const through = tiles.every(t => floor(cells, t.x + px, t.y + py) || floor(cells, t.x - px, t.y - py));
  return through ? tiles : null;
}

const inRect = (room, x, y, pad = 0) => x >= room.x1 - pad && x <= room.x2 + pad && y >= room.y1 - pad && y <= room.y2 + pad;

/**
 * Choose doorways to close. `eligible` = Set of room indices that hold living enemies and are not the entry.
 * `links` is door-rewards.computeDoorLinks output (index-aligned with `doors`). Doors are spaced apart and never
 * overlap `blocked` cells (reward gates). Deterministic: iteration order of `doors` only.
 */
export function planDoors({cells, rooms, doors, links = [], eligible, blocked = [], spacing = 3}) {
  const plans = [], used = new Set(blocked.map(c => `${c.x},${c.y}`));
  doors.forEach((door, index) => {
    const link = links[index];
    const candidates = [];
    if (link && link.from !== null && eligible.has(link.from)) candidates.push(link.from);
    if (link && link.to !== null && link.to !== link.from && eligible.has(link.to) && inRect(rooms[link.to], door.x, door.y, 1.6)) candidates.push(link.to);
    if (!candidates.length) return;
    const tiles = crossSection(cells, door);
    if (!tiles) return;
    if (tiles.some(t => used.has(`${t.x},${t.y}`))) return;
    const cx = tiles.reduce((s, t) => s + t.x, 0) / tiles.length + 0.5, cy = tiles.reduce((s, t) => s + t.y, 0) / tiles.length + 0.5;
    if (plans.some(p => Math.hypot(p.x - cx, p.y - cy) < spacing)) return;
    const room = rooms[candidates[0]];
    // dir = unit step along the passage from the player's side into the room.
    const alongX = door.axis === 'x';
    const dir = alongX ? {x: 0, y: Math.sign(room.cy + 0.5 - cy) || 1} : {x: Math.sign(room.cx + 0.5 - cx) || 1, y: 0};
    for (const t of tiles) used.add(`${t.x},${t.y}`);
    plans.push({id: `door:${plans.length}`, x: cx, y: cy, axis: door.axis, cells: tiles, roomIndex: candidates[0], dir});
  });
  return plans;
}

/** Runtime door from a plan. `openT` animates 0..1 in the renderer; `state` is the only rule-relevant field. */
export function createDoor(plan) {
  return {...plan, state: 'closed', openT: 0, openedBy: null, body: null, peekT: 0};
}
export const isClosed = door => door.state === 'closed';
export const doorCenterPx = (door, tile = TILE) => ({x: door.x * tile, y: door.y * tile});

/** Open a closed door. Returns {opened, noise}; noise is null when nothing should ring. Idempotent. */
export function openDoor(door, how = 'tap') {
  if (door.state !== 'closed') return {opened: false, noise: null};
  door.state = 'open'; door.openedBy = how;
  const n = doorNoise(how);
  return {opened: true, noise: n.radius > 0 ? {...n} : null};
}
/** Close it again (scripted rooms that reset). */
export function closeDoor(door) { door.state = 'closed'; door.openT = 0; door.openedBy = null; return door; }

/** Advance the visual opening (real seconds). */
export function stepDoorAnim(door, dt, rate = 4.5) {
  const target = door.state === 'open' ? 1 : 0, d = target - door.openT;
  door.openT = Math.abs(d) <= rate * dt ? target : door.openT + Math.sign(d) * rate * dt;
  return door.openT;
}

/**
 * Walking into a door: the player (px, velocity px/s) must be close to the panel and moving into it.
 * Returns null | 'walk' | 'kick' (kick = sprinting, speedRatio >= kickRatio).
 */
export function bumpOpens(door, player, vel, {speedRatio = 0, reach = 24, kickRatio = 1.15, minSpeed = 28, tile = TILE} = {}) {
  if (!isClosed(door)) return null;
  const sp = Math.hypot(vel.x, vel.y);
  if (sp < minSpeed) return null;
  let best = Infinity;
  for (const c of door.cells) best = Math.min(best, Math.hypot(player.x - (c.x + 0.5) * tile, player.y - (c.y + 0.5) * tile));
  if (best > reach + tile * 0.5) return null;
  const c = doorCenterPx(door, tile), tx = c.x - player.x, ty = c.y - player.y, tl = Math.hypot(tx, ty) || 1;
  if ((vel.x * tx + vel.y * ty) / (sp * tl) < 0.45) return null;
  return speedRatio >= kickRatio ? 'kick' : 'walk';
}

/** An aware enemy walking up to a closed door opens it. */
export function enemyOpens(door, enemy, {reach = TILE * 1.15, tile = TILE} = {}) {
  if (!isClosed(door) || !enemy.alive || !enemy.aware) return false;
  return door.cells.some(c => Math.hypot(enemy.x - (c.x + 0.5) * tile, enemy.y - (c.y + 0.5) * tile) < reach);
}

/** Where the camera looks while peeking: through the door, `reach` tiles into the room. */
export function peekFocus(door, {reach = 4.2, tile = TILE} = {}) {
  const c = doorCenterPx(door, tile);
  return {x: c.x + door.dir.x * reach * tile, y: c.y + door.dir.y * reach * tile};
}

/**
 * Peek hold state machine. Feed it key events and real time; it answers what the game should do.
 *   press(target)  -> E went down while a closed door was in range
 *   tick(dt)       -> {peeking: bool}
 *   release()      -> 'open' (it was a tap) | 'end-peek' | null
 */
export function createPeekMachine(hold = PEEK_HOLD) {
  const m = {door: null, held: 0, peeking: false};
  return {
    get state() { return m; },
    press(door) { if (door && isClosed(door)) { m.door = door; m.held = 0; m.peeking = false; } },
    tick(dt, inRange = true) {
      if (!m.door) return {peeking: false, door: null};
      if (!isClosed(m.door) || !inRange) { m.door = null; m.held = 0; const was = m.peeking; m.peeking = false; return {peeking: false, door: null, ended: was}; }
      m.held += Math.max(0, dt);
      if (m.held >= hold) m.peeking = true;
      return {peeking: m.peeking, door: m.door};
    },
    release() {
      if (!m.door) { m.peeking = false; return null; }
      const result = m.peeking ? 'end-peek' : 'open', door = m.door;
      m.door = null; m.held = 0; m.peeking = false;
      return {action: result, door};
    },
    cancel() { m.door = null; m.held = 0; m.peeking = false; },
  };
}

/** Closing every door still leaves the level connected when doors count as passable. Used by the tests. */
export function floorReachable(cells, from, to, passableExtra = []) {
  const extra = new Set(passableExtra.map(c => `${c.x},${c.y}`));
  const seen = new Set([`${from.x},${from.y}`]), q = [from];
  for (let h = 0; h < q.length; h++) {
    const p = q[h];
    if (p.x === to.x && p.y === to.y) return true;
    for (const [dx, dy] of DIRS4) {
      const n = {x: p.x + dx, y: p.y + dy}, k = `${n.x},${n.y}`;
      if (seen.has(k) || !(floor(cells, n.x, n.y) || extra.has(k))) continue;
      seen.add(k); q.push(n);
    }
  }
  return false;
}
