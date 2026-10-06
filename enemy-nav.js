// Tile-grid navigation for enemies. Pure data in, pure data out: no DOM, no Rapier, no THREE.
//
// Static walls come from `solidMap` (0 = open, anything else = solid). Dynamic obstacles
// such as crates are registered with `blockCircle(key, x, y, r)` and removed with
// `unblock(key)`; every change bumps `nav.version`, which invalidates cached flow fields
// and tells brains to repath.
//
// World units are px, +y down, origin top-left, like game.js.

const SQRT2 = Math.SQRT2;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

class MinHeap {
  constructor() { this.keys = []; this.vals = []; }
  get size() { return this.keys.length; }
  clear() { this.keys.length = 0; this.vals.length = 0; }
  push(val, key) {
    const {keys, vals} = this;
    let i = keys.length;
    keys.push(key); vals.push(val);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (keys[up] <= key) break;
      keys[i] = keys[up]; vals[i] = vals[up]; i = up;
    }
    keys[i] = key; vals[i] = val;
  }
  pop() {
    const {keys, vals} = this;
    const top = vals[0];
    const key = keys.pop(), val = vals.pop();
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = -1, mk = key;
        if (l < n && keys[l] < mk) { m = l; mk = keys[l]; }
        if (r < n && keys[r] < mk) { m = r; mk = keys[r]; }
        if (m < 0) break;
        keys[i] = keys[m]; vals[i] = vals[m]; i = m;
      }
      keys[i] = key; vals[i] = val;
    }
    return top;
  }
}

export function createNav(tileMap, solidMap, options = {}) {
  const tile = options.tile ?? 32;
  const h = solidMap?.length ?? tileMap?.length ?? 0;
  let w = 0;
  for (let y = 0; y < h; y++) w = Math.max(w, solidMap?.[y]?.length ?? tileMap?.[y]?.length ?? 0);
  const solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) solid[y * w + x] = solidMap?.[y]?.[x] === 0 ? 0 : 1;
  const dyn = new Uint16Array(w * h);
  const circles = new Map();
  const heap = new MinHeap();
  const fields = new Map();

  const nav = {tile, w, h, version: 0};
  const inBounds = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h;
  const blocked = i => solid[i] !== 0 || dyn[i] !== 0;
  const bump = () => { nav.version++; fields.clear(); };

  nav.isOpen = (tx, ty) => inBounds(tx, ty) && !blocked(ty * w + tx);
  nav.isOpenAt = (x, y) => nav.isOpen(Math.floor(x / tile), Math.floor(y / tile));
  nav.isStaticSolid = (tx, ty) => !inBounds(tx, ty) || solid[ty * w + tx] !== 0;
  nav.tileOf = (x, y) => ({x: Math.floor(x / tile), y: Math.floor(y / tile)});
  nav.centerOf = (tx, ty) => ({x: (tx + 0.5) * tile, y: (ty + 0.5) * tile});

  nav.setSolid = (tx, ty, value) => {
    if (!inBounds(tx, ty)) return;
    const next = value ? 1 : 0;
    if (solid[ty * w + tx] === next) return;
    solid[ty * w + tx] = next;
    bump();
  };

  // Dynamic circular obstacle. Tiles whose centre is within r of (x, y) become impassable.
  nav.blockCircle = (key, x, y, r) => {
    nav.unblock(key, true);
    const cells = [];
    const x0 = Math.floor((x - r) / tile), x1 = Math.floor((x + r) / tile);
    const y0 = Math.floor((y - r) / tile), y1 = Math.floor((y + r) / tile);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!inBounds(tx, ty)) continue;
      if (Math.hypot((tx + 0.5) * tile - x, (ty + 0.5) * tile - y) < r) { dyn[ty * w + tx]++; cells.push(ty * w + tx); }
    }
    circles.set(key, cells);
    bump();
  };
  nav.unblock = (key, quiet = false) => {
    const cells = circles.get(key);
    if (!cells) return false;
    for (const i of cells) dyn[i] = Math.max(0, dyn[i] - 1);
    circles.delete(key);
    if (!quiet) bump();
    return true;
  };
  // Replace the whole dynamic obstacle set (e.g. after crates broke) in one version bump.
  nav.setBlockers = list => {
    for (const cells of circles.values()) for (const i of cells) dyn[i] = Math.max(0, dyn[i] - 1);
    circles.clear();
    for (const [index, c] of list.entries()) {
      const key = c.key ?? `b${index}`;
      const cells = [];
      const r = c.r;
      for (let ty = Math.floor((c.y - r) / tile); ty <= Math.floor((c.y + r) / tile); ty++) {
        for (let tx = Math.floor((c.x - r) / tile); tx <= Math.floor((c.x + r) / tile); tx++) {
          if (inBounds(tx, ty) && Math.hypot((tx + 0.5) * tile - c.x, (ty + 0.5) * tile - c.y) < r) { dyn[ty * w + tx]++; cells.push(ty * w + tx); }
        }
      }
      circles.set(key, cells);
    }
    bump();
  };
  nav.invalidate = () => bump();

  nav.nearestOpen = (x, y, maxRadius = 4) => {
    const tx = Math.floor(x / tile), ty = Math.floor(y / tile);
    if (nav.isOpen(tx, ty)) return {x: tx, y: ty};
    let best = null, bestD = Infinity;
    for (let dy = -maxRadius; dy <= maxRadius; dy++) for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      if (!nav.isOpen(tx + dx, ty + dy)) continue;
      const cx = (tx + dx + 0.5) * tile, cy = (ty + dy + 0.5) * tile;
      const d = Math.hypot(cx - x, cy - y);
      if (d < bestD) { bestD = d; best = {x: tx + dx, y: ty + dy}; }
    }
    return best;
  };

  // Can a body of `radius` slide from a to b in a straight line without touching blocked tiles?
  nav.walkable = (a, b, radius = 0) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / 6));
    const r = Math.min(radius, tile * 0.45);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (!nav.isOpenAt(x, y)) return false;
      if (r > 0 && (!nav.isOpenAt(x - r, y - r) || !nav.isOpenAt(x + r, y - r) || !nav.isOpenAt(x - r, y + r) || !nav.isOpenAt(x + r, y + r))) return false;
    }
    return true;
  };

  const wallNear = (tx, ty) => {
    let n = 0;
    if (nav.isStaticSolid(tx + 1, ty)) n++;
    if (nav.isStaticSolid(tx - 1, ty)) n++;
    if (nav.isStaticSolid(tx, ty + 1)) n++;
    if (nav.isStaticSolid(tx, ty - 1)) n++;
    return n;
  };

  // A* from `from` to `to` over open tiles with 8-way movement (no corner cutting), then
  // string-pulled into a short list of world waypoints (start excluded, goal last).
  // `avoid` is an optional list of {x, y, r, cost} circles that make tiles costly (not impassable);
  // squads use it to route flankers away from where an ally already is.
  nav.findPath = (from, to, opts = {}) => {
    const radius = opts.radius ?? 8;
    const maxExpand = opts.maxExpand ?? 6000;
    const avoid = opts.avoid;
    const start = nav.nearestOpen(from.x, from.y), goal = nav.nearestOpen(to.x, to.y);
    if (!start || !goal) return null;
    const goalPoint = nav.isOpenAt(to.x, to.y) ? {x: to.x, y: to.y} : nav.centerOf(goal.x, goal.y);
    if (!avoid && nav.walkable(from, goalPoint, radius)) return [goalPoint];
    const s = start.y * w + start.x, g = goal.y * w + goal.x;
    if (s === g) return [goalPoint];
    const gScore = new Float32Array(w * h).fill(Infinity);
    const came = new Int32Array(w * h).fill(-1);
    const closed = new Uint8Array(w * h);
    const hx = goal.x, hy = goal.y;
    const heur = (x, y) => { const dx = Math.abs(x - hx), dy = Math.abs(y - hy); return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy); };
    heap.clear();
    gScore[s] = 0;
    heap.push(s, heur(start.x, start.y));
    let expanded = 0, found = false;
    while (heap.size > 0) {
      const c = heap.pop();
      if (closed[c]) continue;
      closed[c] = 1;
      if (c === g) { found = true; break; }
      if (++expanded > maxExpand) break;
      const cx = c % w, cy = (c / w) | 0;
      for (const [dx, dy] of NEIGHBORS) {
        const x = cx + dx, y = cy + dy;
        if (!inBounds(x, y)) continue;
        const n = y * w + x;
        if (closed[n] || blocked(n)) continue;
        if (dx !== 0 && dy !== 0 && (blocked(cy * w + x) || blocked(y * w + cx))) continue;
        let step = dx !== 0 && dy !== 0 ? SQRT2 : 1;
        step += wallNear(x, y) * 0.18;
        if (avoid) for (const a of avoid) {
          const d = Math.hypot((x + 0.5) * tile - a.x, (y + 0.5) * tile - a.y);
          if (d < a.r) step += (a.cost ?? 3) * (1 - d / a.r);
        }
        const ng = gScore[c] + step;
        if (ng < gScore[n]) { gScore[n] = ng; came[n] = c; heap.push(n, ng + heur(x, y)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = g; c !== s; c = came[c]) cells.push(nav.centerOf(c % w, (c / w) | 0));
    cells.reverse();
    cells[cells.length - 1] = goalPoint;
    // String-pull: keep the farthest waypoint still reachable in a straight line.
    const out = [];
    let at = {x: from.x, y: from.y};
    for (let i = 0; i < cells.length;) {
      let j = i;
      while (j + 1 < cells.length && nav.walkable(at, cells[j + 1], radius)) j++;
      out.push(cells[j]);
      at = cells[j];
      i = j + 1;
    }
    return out;
  };

  nav.pathLength = (from, path) => {
    if (!path) return Infinity;
    let total = 0, at = from;
    for (const p of path) { total += Math.hypot(p.x - at.x, p.y - at.y); at = p; }
    return total;
  };

  // Dijkstra distance field from a goal point. Shared by every enemy chasing the same target,
  // so a whole room of rushers costs one search per player tile. Cached until the nav changes.
  nav.flowField = goal => {
    const target = nav.nearestOpen(goal.x, goal.y, 6);
    if (!target) return null;
    const key = target.y * w + target.x;
    const cached = fields.get(key);
    if (cached) { fields.delete(key); fields.set(key, cached); return cached; }
    const dist = new Float32Array(w * h).fill(Infinity);
    heap.clear();
    dist[key] = 0;
    heap.push(key, 0);
    while (heap.size > 0) {
      const c = heap.pop();
      const cx = c % w, cy = (c / w) | 0;
      const base = dist[c];
      for (const [dx, dy] of NEIGHBORS) {
        const x = cx + dx, y = cy + dy;
        if (!inBounds(x, y)) continue;
        const n = y * w + x;
        if (blocked(n)) continue;
        if (dx !== 0 && dy !== 0 && (blocked(cy * w + x) || blocked(y * w + cx))) continue;
        const nd = base + (dx !== 0 && dy !== 0 ? SQRT2 : 1) + wallNear(x, y) * 0.18;
        if (nd < dist[n]) { dist[n] = nd; heap.push(n, nd); }
      }
    }
    const field = {
      goal: target,
      dist,
      // Path cost in px from a world point to the goal (Infinity if unreachable).
      distAt(x, y) {
        const tx = Math.floor(x / tile), ty = Math.floor(y / tile);
        return inBounds(tx, ty) ? dist[ty * w + tx] * tile : Infinity;
      },
      // Unit direction of steepest descent from a world point, or null at the goal / when cut off.
      dirAt(x, y) {
        let tx = Math.floor(x / tile), ty = Math.floor(y / tile);
        if (!inBounds(tx, ty)) return null;
        if (!Number.isFinite(dist[ty * w + tx])) {
          const near = nav.nearestOpen(x, y, 2);
          if (!near) return null;
          tx = near.x; ty = near.y;
        }
        const here = dist[ty * w + tx];
        if (here === 0) return null;
        let best = null, bestD = here;
        for (const [dx, dy] of NEIGHBORS) {
          const nx = tx + dx, ny = ty + dy;
          if (!inBounds(nx, ny)) continue;
          if (dx !== 0 && dy !== 0 && (blocked(ty * w + nx) || blocked(ny * w + tx))) continue;
          const d = dist[ny * w + nx];
          if (d < bestD) { bestD = d; best = {x: nx, y: ny}; }
        }
        if (!best) return null;
        const cx = (best.x + 0.5) * tile - x, cy = (best.y + 0.5) * tile - y;
        const len = Math.hypot(cx, cy) || 1;
        return {x: cx / len, y: cy / len};
      },
    };
    fields.set(key, field);
    if (fields.size > 6) fields.delete(fields.keys().next().value);
    return field;
  };

  return nav;
}
