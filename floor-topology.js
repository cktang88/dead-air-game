// Floor topology helpers: optional flank loops between rooms. Pure functions on the raw ROT.js
// grid (0 floor, 1 wall, 2 door) so they can be tested without ROT.
import {shortestFloorPath} from './layout.js';

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const passable = (cells, x, y) => cells[y]?.[x] === 0 || cells[y]?.[x] === 2;
const LOOP_MIN_GAP = 4, LOOP_MAX_GAP = 10;

function candidateBridges(cells, rooms) {
  const out = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    for (const [first, second] of [[a, b], [b, a]]) {
      // first is left of / above second
      const yLo = Math.max(first.y1 + 1, second.y1 + 1), yHi = Math.min(first.y2 - 1, second.y2 - 1);
      const gapX = second.x1 - first.x2 - 1;
      if (gapX >= LOOP_MIN_GAP && gapX <= LOOP_MAX_GAP && yHi - yLo >= 2) {
        const line = Math.floor((yLo + yHi) / 2);
        out.push({a: first, b: second, axis: 'x', line, from: first.x2 + 1, to: second.x1 - 1, gap: gapX});
      }
      const xLo = Math.max(first.x1 + 1, second.x1 + 1), xHi = Math.min(first.x2 - 1, second.x2 - 1);
      const gapY = second.y1 - first.y2 - 1;
      if (gapY >= LOOP_MIN_GAP && gapY <= LOOP_MAX_GAP && xHi - xLo >= 2) {
        const line = Math.floor((xLo + xHi) / 2);
        out.push({a: first, b: second, axis: 'y', line, from: first.y2 + 1, to: second.y1 - 1, gap: gapY});
      }
    }
  }
  return out;
}

function stripTiles(bridge) {
  const tiles = [];
  for (let path = bridge.from; path <= bridge.to; path++) for (const side of [0, 1]) {
    tiles.push(bridge.axis === 'x' ? {x: path, y: bridge.line + side} : {x: bridge.line + side, y: path});
  }
  return tiles;
}

// Carves up to maxLoops short connectors between rooms whose current walking route is much longer
// than the direct hop. Returns the carved bridges. Deterministic for a given seed.
export function addFlankLoops(cells, rooms, seed, maxLoops = 2) {
  const random = seededRandom(seed ^ 0x51ed270b);
  const carved = [];
  for (let round = 0; round < maxLoops; round++) {
    const scored = [];
    for (const bridge of candidateBridges(cells, rooms)) {
      const tiles = stripTiles(bridge);
      if (!tiles.every(({x, y}) => cells[y]?.[x] === 1)) continue;
      const touchesRoom = rooms.some(r => r !== bridge.a && r !== bridge.b && tiles.some(({x, y}) =>
        x >= r.x1 - 1 && x <= r.x2 + 1 && y >= r.y1 - 1 && y <= r.y2 + 1));
      if (touchesRoom) continue;
      const start = {x: bridge.a.cx, y: bridge.a.cy}, goal = {x: bridge.b.cx, y: bridge.b.cy};
      const route = shortestFloorPath(cells, start, goal, (x, y) => passable(cells, x, y)).length;
      if (!route) continue;
      const direct = Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y);
      const saving = route - direct;
      if (saving < 14) continue;
      scored.push({bridge, saving: saving + random() * 4});
    }
    if (!scored.length) break;
    scored.sort((a, b) => b.saving - a.saving);
    const {bridge} = scored[0];
    for (const {x, y} of stripTiles(bridge)) cells[y][x] = 0;
    carved.push(bridge);
  }
  return carved;
}

// Removes dead-end corridor stubs (corridor/door cells outside every room rectangle that touch at most
// one walkable neighbour), repeatedly, so corridors always connect two rooms. Returns the cells removed.
export function pruneDeadEnds(cells, rooms) {
  const inRoom = (x, y) => rooms.some(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
  let removed = 0, changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < cells.length - 1; y++) for (let x = 1; x < cells[y].length - 1; x++) {
      if (!passable(cells, x, y) || inRoom(x, y)) continue;
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => passable(cells, x + dx, y + dy)).length;
      if (open <= 1) { cells[y][x] = 1; removed++; changed = true; }
    }
  }
  return removed;
}
