import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSignalLayout, SCRIPT, ZONES, ROOM_RECTS, ALCOVES, GLASS_TILES, DOOR_PLANS, TILE, T_FLOOR, T_GLASS, T_WALL, zoneOf, alcoveAt, goalMet, idleHint, resetPlan, connected, createSignalProgress} from './signal-check.js';

const L = buildSignalLayout();
const tile = p => ({x: Math.floor(p.x), y: Math.floor(p.y)});
const floorAt = (x, y) => L.cells[y]?.[x] === T_FLOOR;

test('layout is the data shape makeLevel consumes', () => {
  assert.equal(L.rooms.length, 5);
  assert.equal(L.cells.length, L.height);
  assert.ok(L.cells.every(r => r.length === L.width));
  for (const k of ['cells', 'rooms', 'doors', 'lockedDoors', 'start', 'width', 'height']) assert.ok(k in L, k);
  L.rooms.forEach((r, i) => { assert.equal(r.index, i); assert.ok(floorAt(r.cx, r.cy) || L.cells[r.cy][r.cx] === T_WALL); });
  assert.equal(L.start, L.rooms[0]);
});
test('every room start, enemy and prop sits on open floor inside its own zone', () => {
  SCRIPT.forEach((s, i) => {
    assert.ok(floorAt(Math.floor(s.start.x), Math.floor(s.start.y)), `start ${i}`);
    assert.equal(zoneOf(s.start.x * TILE), i, `start ${i} is in zone ${i}`);
    for (const e of s.enemies) { assert.ok(floorAt(Math.floor(e.x), Math.floor(e.y)), `enemy ${e.type} in room ${i}`); assert.equal(zoneOf(e.x * TILE), i); }
    for (const p of s.props) assert.ok(floorAt(Math.floor(p.x), Math.floor(p.y)));
  });
});
test('zones tile the x axis with no gaps', () => {
  for (let i = 1; i < ZONES.length; i++) assert.equal(ZONES[i].x0, ZONES[i - 1].x1);
  for (let x = 0; x < L.width * TILE; x += 37) assert.ok(zoneOf(x) >= 0 && zoneOf(x) <= 4);
});
test('the floor is connected to every alcove once the glass breaks; glass blocks walking, not sight', () => {
  const start = tile(SCRIPT[0].start), broken = new Set(GLASS_TILES.map(g => `${g.x},${g.y}`));
  for (const a of ALCOVES) {
    const to = {x: a.rect.x1, y: a.rect.y1};
    assert.equal(connected(L.cells, start, to), false, 'glass splits the shot room');
    assert.equal(connected(L.cells, start, to, broken), true, `alcove ${a.id} reachable after the glass shatters`);
  }
  for (const g of GLASS_TILES) assert.equal(L.cells[g.y][g.x], T_GLASS);
});
test('doors are 2-wide chokes capped by walls on both ends (they really seal)', () => {
  assert.equal(DOOR_PLANS.filter(d => d.gate).length, 2);
  assert.equal(DOOR_PLANS.filter(d => !d.gate).length, 1);
  for (const d of DOOR_PLANS) {
    assert.equal(d.cells.length, 2);
    for (const c of d.cells) assert.equal(L.cells[c.y][c.x], T_FLOOR);
    const ends = d.axis === 'y' ? [{x: d.cells[0].x, y: d.cells[0].y - 1}, {x: d.cells[1].x, y: d.cells[1].y + 1}] : [{x: d.cells[0].x - 1, y: d.cells[0].y}, {x: d.cells[1].x + 1, y: d.cells[1].y}];
    for (const e of ends) assert.notEqual(L.cells[e.y][e.x], T_FLOOR, 'wall caps the door');
  }
});
test('the dodge room has cover and a fixed long-range warden; the door room hides its south lane', () => {
  assert.ok(L.rooms[2].cover.some(c => c.kind === 'pillar'));
  assert.ok(L.rooms[3].cover.length >= 5);
  const warden = SCRIPT[2].enemies[0];
  assert.equal(warden.fixed, true);
  assert.ok(warden.range >= 300, 'the warden reaches down the corridor');
});
test('room 4 offers three routes: backstab the guard, peek and flash, or sneak the south lane past the sleeper', () => {
  const s = SCRIPT[3];
  const guard = s.enemies.find(e => e.type === 'gunner'), sleeper = s.enemies.find(e => e.posture === 'sleep');
  assert.equal(guard.posture, 'guard');
  assert.ok(guard.face.x > 0, 'the guard faces away from the door');
  assert.ok(sleeper && sleeper.y > 9, 'the sleeper lies in the south lane');
  assert.ok(s.flash >= 1, 'a flash is offered');
  const wallRow = L.rooms[3].cover.filter(c => c.y === 7).map(c => c.x);
  assert.ok(wallRow.includes(65) && wallRow.includes(63), 'sandbags break the guard’s line to the south lane');
});
test('goals: reach opens at the right x, kill needs a clear room, pick needs a choice', () => {
  assert.deepEqual(goalMet({room: 0, player: {x: 5 * TILE, y: 200}}), {met: false, unlock: null});
  assert.deepEqual(goalMet({room: 0, player: {x: 13.2 * TILE, y: 200}}), {met: true, unlock: 'gate:breath'});
  assert.equal(goalMet({room: 1, player: {x: 0, y: 0}, living: 1}).met, false);
  assert.deepEqual(goalMet({room: 1, player: {x: 0, y: 0}, living: 0}), {met: true, unlock: 'glass'});
  assert.equal(goalMet({room: 4, player: {x: 0, y: 0}, picked: null}).met, false);
  assert.equal(goalMet({room: 4, player: {x: 0, y: 0}, picked: 'scrap'}).met, true);
  assert.equal(goalMet({room: 2, player: {x: 50.5 * TILE, y: 0}}).unlock, 'gate:dodge');
});
test('alcoves: three icons, one per reward, found by position', () => {
  assert.deepEqual(ALCOVES.map(a => a.reward), ['freq', 'scrap', 'supply']);
  assert.equal(alcoveAt(88.5 * TILE, 3.5 * TILE).id, 'freq');
  assert.equal(alcoveAt(88.5 * TILE, 6.5 * TILE).id, 'scrap');
  assert.equal(alcoveAt(80 * TILE, 6 * TILE), null);
  for (const a of ALCOVES) assert.ok(floorAt(a.rect.x1, a.rect.y1) && floorAt(a.rect.x2, a.rect.y2));
});
test('text is limited to keycaps and single words', () => {
  for (const s of SCRIPT) {
    if (s.idleHint) { assert.ok(!/\s/.test(s.idleHint.word)); assert.ok(s.idleHint.after >= 4); }
    assert.ok(s.card.line.split(' ').length <= 6);
  }
  assert.equal(idleHint(0, 3), null);
  assert.equal(idleHint(0, 4.5).word, 'MOVE');
  assert.equal(idleHint(1, 7, 1), null, 'no FIRE hint once you have fired');
  assert.equal(idleHint(2, 99), null);
});
test('every failure resets only the current room, instantly, with the cause line', () => {
  for (let i = 0; i < 5; i++) {
    const plan = resetPlan(i);
    assert.equal(zoneOf(plan.start.x), i);
    assert.equal(plan.enemies.length, SCRIPT[i].enemies.length);
  }
  assert.equal(resetPlan(2).cause, 'KILLED BY WARDEN · STOOD IN A LANE');
  assert.equal(resetPlan(3).closePeekDoor, true);
  const prog = createSignalProgress();
  assert.equal(prog.active, true); assert.equal(prog.room, 0);
});
test('room rects do not overlap', () => {
  for (let i = 0; i < ROOM_RECTS.length; i++) for (let j = i + 1; j < ROOM_RECTS.length; j++) {
    const a = ROOM_RECTS[i], b = ROOM_RECTS[j];
    assert.ok(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);
  }
});
