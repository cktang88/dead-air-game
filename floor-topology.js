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

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class Heap {
  constructor() { this.a = []; }
  push(cost, val) {
    const a = this.a; a.push([cost, val]);
    let i = a.length - 1;
    while (i > 0) { const up = (i - 1) >> 1; if (a[up][0] <= a[i][0]) break; [a[up], a[i]] = [a[i], a[up]]; i = up; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

// Cheapest 1-wide corridor between the wall rings of rooms a and b that never crosses another room.
// Starts/ends on a non-corner ring cell (the door). Existing corridor cells are cheap so routes merge,
// turns are expensive so corridors run straight. Returns [{x,y}...] or null.
function routeCorridor(cells, rooms, a, b) {
  const h = cells.length, w = cells[0].length;
  const ring = r => ({x1: r.x1 - 1, x2: r.x2 + 1, y1: r.y1 - 1, y2: r.y2 + 1});
  const rects = rooms.map(r => ({r, e: ring(r)}));
  const forbidden = new Uint8Array(w * h);
  for (const {r, e} of rects) {
    for (let y = e.y1; y <= e.y2; y++) for (let x = e.x1; x <= e.x2; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const border = x === e.x1 || x === e.x2 || y === e.y1 || y === e.y2;
      const corner = (x === e.x1 || x === e.x2) && (y === e.y1 || y === e.y2);
      if (!border || corner || (r !== a && r !== b)) forbidden[y * w + x] = 1;
    }
  }
  const isDoorOf = (r, x, y) => {
    const e = ring(r);
    if (x < e.x1 || x > e.x2 || y < e.y1 || y > e.y2) return false;
    const border = x === e.x1 || x === e.x2 || y === e.y1 || y === e.y2;
    return border && !((x === e.x1 || x === e.x2) && (y === e.y1 || y === e.y2));
  };
  const key = (x, y, d) => (y * w + x) * 5 + d;
  const dist = new Map(), prev = new Map(), heap = new Heap();
  const ea = ring(a);
  for (let y = ea.y1; y <= ea.y2; y++) for (let x = ea.x1; x <= ea.x2; x++) {
    if (!isDoorOf(a, x, y) || x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    dist.set(key(x, y, 4), 0); heap.push(0, {x, y, d: 4});
  }
  while (heap.size) {
    const [cost, cur] = heap.pop();
    if (cost > (dist.get(key(cur.x, cur.y, cur.d)) ?? Infinity)) continue;
    if (isDoorOf(b, cur.x, cur.y) && cost > 0) {
      const path = [];
      let k = key(cur.x, cur.y, cur.d);
      while (k !== undefined) { const c = Math.floor(k / 5); path.push({x: c % w, y: Math.floor(c / w)}); k = prev.get(k); }
      return path.reverse();
    }
    for (let d = 0; d < 4; d++) {
      const nx = cur.x + DIRS[d][0], ny = cur.y + DIRS[d][1];
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1 || forbidden[ny * w + nx] && !isDoorOf(b, nx, ny)) continue;
      const step = (cells[ny][nx] === 0 ? 0.4 : 1) + (cur.d !== 4 && cur.d !== d ? 3 : 0);
      const nk = key(nx, ny, d), nc = cost + step;
      if (nc < (dist.get(nk) ?? Infinity)) { dist.set(nk, nc); prev.set(nk, key(cur.x, cur.y, cur.d)); heap.push(nc, {x: nx, y: ny, d}); }
    }
  }
  return null;
}

// Discards ROT's own corridors and rebuilds the connections: a minimum spanning tree over nearby rooms
// (short, straight, 1-wide corridors that never cut through other rooms) plus up to maxLoops flank
// connections between rooms that are far apart in the graph but physically close.
// Door cells on room rings are written as 2 (shapeDungeon turns them into doorways).
// Returns {loops, edges}.
export function rebuildCorridors(cells, rooms, seed, maxLoops = 2) {
  const random = seededRandom(seed ^ 0x51ed270b);
  const h = cells.length, w = cells[0].length;
  const inRect = (x, y) => rooms.some(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!inRect(x, y)) cells[y][x] = 1;
  const centerDist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const edges = [], joined = new Set([0]), carve = path => {
    path.forEach(({x, y}, i) => { cells[y][x] = i === 0 || i === path.length - 1 ? 2 : 0; });
  };
  const adjacency = rooms.map(() => new Set());
  const connect = (i, j, path) => { carve(path); edges.push({a: i, b: j, length: path.length}); adjacency[i].add(j); adjacency[j].add(i); };
  const attempts = new Set();
  while (joined.size < rooms.length) {
    let best = null;
    for (const i of joined) for (let j = 0; j < rooms.length; j++) {
      if (joined.has(j) || attempts.has(`${i}-${j}`)) continue;
      const d = centerDist(rooms[i], rooms[j]);
      if (!best || d < best.d) best = {i, j, d};
    }
    if (!best) break;
    const path = routeCorridor(cells, rooms, rooms[best.i], rooms[best.j]);
    attempts.add(`${best.i}-${best.j}`);
    if (!path) continue;
    connect(best.i, best.j, path); joined.add(best.j);
  }
  const hops = from => {
    const d = new Map([[from, 0]]), q = [from];
    for (let head = 0; head < q.length; head++) for (const n of adjacency[q[head]]) if (!d.has(n)) { d.set(n, d.get(q[head]) + 1); q.push(n); }
    return d;
  };
  const pairs = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) pairs.push({i, j, d: centerDist(rooms[i], rooms[j]) + random() * 6});
  pairs.sort((p, q) => p.d - q.d);
  let loops = 0;
  for (const {i, j} of pairs) {
    if (loops >= maxLoops) break;
    if (adjacency[i].has(j) || (hops(i).get(j) ?? 9) < 3) continue;
    const path = routeCorridor(cells, rooms, rooms[i], rooms[j]);
    if (!path || path.length > 16) continue;
    connect(i, j, path); loops++;
  }
  return {loops, edges};
}
