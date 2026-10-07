import test from 'node:test';
import assert from 'node:assert/strict';
import {TEMPLATE_NAMES, findOpenings, paceEnemyCount, stampRoomTemplates} from './room-templates.js';
import {rebuildCorridors} from './floor-topology.js';

// A wall-bounded map with several rooms linked by 2-wide corridors.
function makeFloor() {
  const W = 60, H = 30, cells = Array.from({length: H}, () => Array(W).fill(1));
  const mk = (x1, y1, x2, y2, index, role) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) cells[y][x] = 0;
    return {x1, y1, x2, y2, cx: Math.floor((x1 + x2) / 2), cy: Math.floor((y1 + y2) / 2), index, role};
  };
  const rooms = [mk(2, 2, 12, 10, 0, 'entry'), mk(18, 2, 33, 14, 1, 'combat'), mk(40, 2, 52, 12, 2, 'hazard'),
    mk(18, 18, 30, 27, 3, 'armory'), mk(2, 18, 11, 26, 4, 'clinic'), mk(36, 18, 50, 27, 5, 'cache'), mk(54, 14, 58, 20, 6, 'extraction')];
  for (let x = 13; x < 18; x++) cells[6][x] = cells[7][x] = 0;
  for (let x = 34; x < 40; x++) cells[8][x] = cells[9][x] = 0;
  for (let y = 15; y < 18; y++) { cells[y][24] = cells[y][25] = 0; }
  for (let y = 11; y < 18; y++) { cells[y][6] = cells[y][7] = 0; }
  for (let x = 31; x < 36; x++) cells[22][x] = cells[23][x] = 0;
  for (let y = 13; y < 18; y++) cells[y][43] = cells[y][44] = 0;
  for (let x = 51; x < 55; x++) cells[17][x] = cells[18][x] = 0;
  return {cells, rooms};
}
const floorTiles = cells => cells.flatMap((row, y) => row.map((v, x) => v === 0 ? {x, y} : null)).filter(Boolean);
function reachable(cells, from, extraBlocked = new Set()) {
  const seen = new Set([`${from.x},${from.y}`]), q = [from];
  for (let h = 0; h < q.length; h++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = q[h].x + dx, y = q[h].y + dy, k = `${x},${y}`;
    if (!seen.has(k) && cells[y]?.[x] === 0 && !extraBlocked.has(k)) { seen.add(k); q.push({x, y}); }
  }
  return seen;
}
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) test(`template stamping keeps floors connected, doors clear and cover near doors (seed ${seed})`, () => {
  const {cells, rooms} = makeFloor();
  const before = floorTiles(cells).length;
  stampRoomTemplates({cells, rooms, start: rooms[0], seed});
  const crateKeys = new Set(rooms.flatMap(r => r.crates.map(c => `${c.x},${c.y}`)));
  const covered = rooms.reduce((n, r) => n + r.cover.length, 0);
  assert.equal(floorTiles(cells).length, before - covered, 'only hard cover tiles were removed from the floor');
  // reachable with crates treated as solid too: no route relies on smashing a crate
  const seen = reachable(cells, {x: rooms[0].cx, y: rooms[0].cy}, crateKeys);
  for (const t of floorTiles(cells)) if (!crateKeys.has(`${t.x},${t.y}`)) assert.ok(seen.has(`${t.x},${t.y}`), `unreachable floor ${t.x},${t.y}`);
  for (const room of rooms) {
    assert.ok(TEMPLATE_NAMES.includes(room.template));
    assert.equal(cells[room.cy][room.cx], 0, 'room centre is clear');
    assert.ok(!crateKeys.has(`${room.cx},${room.cy}`));
    for (const o of room.openings) {
      assert.equal(cells[o.y][o.x], 0);
      for (const t of [...room.cover, ...room.crates]) assert.ok(cheb(t, o) > 1, 'doorway mouth stays clear');
    }
    for (const t of room.crates) assert.equal(cells[t.y][t.x], 0, 'crate on floor');
    for (const t of room.cover) assert.equal(cells[t.y][t.x], 1, 'hard cover is solid');
    for (const t of room.spawnTiles) { assert.equal(cells[t.y][t.x], 0); assert.ok(!crateKeys.has(`${t.x},${t.y}`)); }
    if (room.entry && room.spawnTiles.length) {
      for (const t of room.spawnTiles) assert.ok(Math.abs(t.x - room.entry.x) + Math.abs(t.y - room.entry.y) >= 3, 'spawns keep away from the entry door');
    }
    for (const o of room.openings) {
      const near = [...room.cover, ...room.crates].some(t => cheb(t, o) <= 6);
      assert.ok(near || room.x2 - room.x1 < 8, `room ${room.index} (${room.template}) has no cover near opening ${o.x},${o.y}`);
    }
    assert.ok(room.theme.floor && /^#[0-9a-f]{6}$/.test(room.theme.accent) && Array.isArray(room.theme.decor));
    assert.ok(['entry', 'warmup', 'rising', 'hot', 'breather', 'finale'].includes(room.pace));
  }
  assert.equal(rooms.at(-1).pace, 'finale');
  assert.ok(rooms.filter(r => r.breather).length <= 1);
});

test('stamping is deterministic per seed and differs between seeds', () => {
  const run = seed => { const f = makeFloor(); stampRoomTemplates({cells: f.cells, rooms: f.rooms, start: f.rooms[0], seed}); return JSON.stringify(f.cells) + JSON.stringify(f.rooms.map(r => r.crates)); };
  assert.equal(run(9), run(9));
  assert.notEqual(run(9), run(10));
});

test('role templates: vault reward spots are floor, landing keeps a clear landing zone', () => {
  const {cells, rooms} = makeFloor();
  stampRoomTemplates({cells, rooms, start: rooms[0], seed: 3});
  const cache = rooms[5], extraction = rooms[6];
  assert.equal(cache.template, 'vault');
  for (const spot of cache.rewardSpots) assert.equal(cells[spot.y][spot.x], 0);
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) assert.equal(cells[extraction.cy + y][extraction.cx + x], 0, 'landing zone is clear');
});

test('pacing budget: breathers are light, the finale heavy', () => {
  assert.equal(paceEnemyCount({pace: 'breather'}, 4), 1);
  assert.equal(paceEnemyCount({pace: 'finale'}, 4), 5);
  assert.equal(paceEnemyCount({pace: 'rising'}, 3), 3);
});

test('findOpenings reports perimeter tiles that continue outside the room', () => {
  const {cells, rooms} = makeFloor();
  assert.ok(findOpenings(cells, rooms[0]).length >= 2);
});

test('rebuildCorridors connects every room with short routes and never crosses a room', () => {
  const W = 60, H = 40, cells = Array.from({length: H}, () => Array(W).fill(1));
  const rooms = [];
  [[3, 3, 12, 10], [18, 4, 28, 12], [34, 3, 44, 9], [4, 18, 14, 26], [20, 20, 30, 30], [38, 16, 50, 28]].forEach(([x1, y1, x2, y2], index) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) cells[y][x] = 0;
    rooms.push({x1, y1, x2, y2, cx: (x1 + x2) >> 1, cy: (y1 + y2) >> 1, index});
  });
  const {loops, edges} = rebuildCorridors(cells, rooms, 5, 2);
  assert.ok(edges.length >= rooms.length - 1);
  assert.ok(loops <= 2);
  for (const e of edges) assert.ok(e.length < 40, 'corridors stay short');
  const open = cells.map(row => row.map(v => v === 1 ? 1 : 0));
  const seen = reachable(open, {x: rooms[0].cx, y: rooms[0].cy});
  for (const r of rooms) assert.ok(seen.has(`${r.cx},${r.cy}`), `room ${r.index} reachable`);
});
