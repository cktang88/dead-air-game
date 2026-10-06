import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {crossSection, planDoors, createDoor, openDoor, closeDoor, bumpOpens, enemyOpens, peekFocus, createPeekMachine, stepDoorAnim, doorNoise, floorReachable, PEEK_HOLD} from './doors.js';

// 12x9 map: a room (x2..8,y2..6) with a 2-wide doorway on its west wall at y3..4 leading to a corridor x0..1.
const grid = () => {
  const cells = Array.from({length: 9}, () => Array(12).fill(1));
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 8; x++) cells[y][x] = 0;
  for (let y = 3; y <= 4; y++) for (let x = 0; x <= 1; x++) cells[y][x] = 0;
  return cells;
};
const rooms = [{index: 0, x1: 2, x2: 8, y1: 2, y2: 6, cx: 5, cy: 4}];
const doorway = {x: 1, y: 3.5, axis: 'y', kind: 'corridor'};   // 2 tiles along y: (1,3),(1,4)
const mk = () => createDoor({id: 'd', x: 1.5, y: 4, axis: 'y', cells: [{x: 1, y: 3}, {x: 1, y: 4}], dir: {x: 1, y: 0}, roomIndex: 0});

test('cross section spans the passage and is capped by walls', () => {
  const t = crossSection(grid(), doorway);
  assert.deepEqual(t.map(c => `${c.x},${c.y}`), ['1,3', '1,4']);
});
test('a doorway in the middle of an open room is not a choke', () => {
  assert.equal(crossSection(grid(), {x: 5, y: 3.5, axis: 'y'}), null);
});
test('planDoors closes eligible rooms only, deterministically, and never overlaps blocked cells', () => {
  const cells = grid(), links = [{index: 0, from: 0, to: null}];
  const a = planDoors({cells, rooms, doors: [doorway], links, eligible: new Set([0])});
  const b = planDoors({cells, rooms, doors: [doorway], links, eligible: new Set([0])});
  assert.equal(a.length, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(a[0].dir, {x: 1, y: 0}, 'dir points from the corridor into the room');
  assert.equal(planDoors({cells, rooms, doors: [doorway], links, eligible: new Set()}).length, 0);
  assert.equal(planDoors({cells, rooms, doors: [doorway], links, eligible: new Set([0]), blocked: [{x: 1, y: 3}]}).length, 0);
});
test('doors never seal the route: opening is always possible and the cells count as passable', () => {
  const cells = grid(), [plan] = planDoors({cells, rooms, doors: [doorway], links: [{index: 0, from: 0, to: null}], eligible: new Set([0])});
  const closedCells = cells.map(r => r.slice()); for (const c of plan.cells) closedCells[c.y][c.x] = 1;
  assert.equal(floorReachable(closedCells, {x: 0, y: 3}, {x: 5, y: 4}), false, 'a closed door really blocks');
  assert.equal(floorReachable(closedCells, {x: 0, y: 3}, {x: 5, y: 4}, plan.cells), true, 'but it is passable by opening');
});
test('door state machine: closed -> open once, noise by how it was opened', () => {
  const door = mk();
  assert.equal(door.state, 'closed');
  const kick = openDoor(door, 'kick');
  assert.equal(kick.opened, true);
  assert.equal(kick.noise.kind, 'kick');
  assert.ok(kick.noise.radius > doorNoise('tap').radius, 'a kick is louder than a tap');
  assert.deepEqual(openDoor(door, 'tap'), {opened: false, noise: null}, 'idempotent');
  closeDoor(door); assert.equal(door.state, 'closed');
  assert.equal(openDoor(door, 'enemy').noise, null, 'enemies make no extra noise');
});
test('walking into a door opens it; sprinting kicks it; standing near does nothing', () => {
  const door = mk(), at = {x: 1 * 32 - 8, y: 4 * 32};
  assert.equal(bumpOpens(door, at, {x: 0, y: 0}), null);
  assert.equal(bumpOpens(door, at, {x: 100, y: 0}, {speedRatio: 0.9}), 'walk');
  assert.equal(bumpOpens(door, at, {x: 160, y: 0}, {speedRatio: 1.4}), 'kick');
  assert.equal(bumpOpens(door, at, {x: -100, y: 0}, {speedRatio: 0.9}), null, 'moving away');
});
test('aware enemies open doors they reach; unaware ones do not', () => {
  const door = mk(), e = {alive: true, aware: true, x: 56, y: 4.5 * 32};
  assert.equal(enemyOpens(door, e), true);
  assert.equal(enemyOpens(door, {...e, aware: false}), false);
  assert.equal(enemyOpens(door, {...e, x: 400}), false);
});
test('peek focus looks through the door into the room', () => {
  const f = peekFocus(mk());
  assert.ok(f.x > 1.5 * 32 + 100 && Math.abs(f.y - 4 * 32) < 1);
});
test('peek machine: a tap opens, a hold peeks and ends on release, leaving range cancels', () => {
  const door = mk();
  let m = createPeekMachine();
  m.press(door); m.tick(PEEK_HOLD / 4);
  assert.equal(m.release().action, 'open');
  m = createPeekMachine(); m.press(door);
  assert.equal(m.tick(PEEK_HOLD / 2).peeking, false);
  assert.equal(m.tick(PEEK_HOLD).peeking, true);
  assert.equal(m.release().action, 'end-peek');
  assert.equal(m.release(), null);
  m.press(door); m.tick(PEEK_HOLD * 2);
  assert.equal(m.tick(0.01, false).peeking, false, 'walking out of range ends the peek');
  openDoor(door);
  m.press(door); assert.equal(m.state.door, null, 'cannot peek an open door');
});
test('door animation reaches its target', () => {
  const door = mk();
  openDoor(door); let t = 0; for (let i = 0; i < 100; i++) t = stepDoorAnim(door, 0.05);
  assert.equal(t, 1);
});

let ROT = null;
try { ROT = await import(process.env.ROT_PATH ? pathToFileURL(process.env.ROT_PATH).href : 'rot-js'); } catch { /* skipped below */ }
test('generated floors: planned doors sit on true chokes and never block the route', {skip: !ROT}, async () => {
  const {generateDungeon} = await import('./dungeon.js');
  const {computeDoorLinks} = await import('./door-rewards.js');
  let total = 0;
  for (let i = 0; i < 25; i++) {
    const d = generateDungeon(ROT, 1 + i * 977);
    const eligible = new Set(d.rooms.filter((r, k) => k > 0 && k < d.rooms.length - 1 && r.role === 'combat').map(r => r.index));
    const links = computeDoorLinks({cells: d.cells, rooms: d.rooms, doors: d.doors});
    const plans = planDoors({cells: d.cells, rooms: d.rooms, doors: d.doors, links, eligible, blocked: d.lockedDoors.flatMap(g => g.cells)});
    total += plans.length;
    const shut = d.cells.map(r => r.slice());
    for (const p of plans) for (const c of p.cells) { assert.equal(d.cells[c.y][c.x], 0, 'door cell is floor'); shut[c.y][c.x] = 1; }
    const all = plans.flatMap(p => p.cells), start = {x: d.rooms[0].cx, y: d.rooms[0].cy}, exit = {x: d.rooms.at(-1).cx, y: d.rooms.at(-1).cy};
    assert.ok(floorReachable(shut, start, exit, all), `seed ${i}: route stays passable through doors`);
  }
  assert.ok(total > 10, `doors are planned on most floors (${total})`);
});

import {collectInteractables, activeInteraction, promptParts, RANGE} from './interaction.js';
test('closed doors are interactables: OPEN, with a HOLD · PEEK note; open doors and scripted gates are not', () => {
  const player = {x: 1.5 * 32, y: 4 * 32}, door = mk(), gate = {...mk(), id: 'g', gate: true};
  const base = {player, pickups: [], rooms: [], enemies: [], gates: [], scrap: 0, tile: 32};
  const targets = collectInteractables({...base, doorProps: [door, gate]});
  const t = targets.find(x => x.kind === 'door');
  assert.ok(t && t.inRange && t.keyed);
  assert.equal(targets.filter(x => x.kind === 'door').length, 1, 'the scripted gate has no prompt');
  assert.equal(promptParts(t).head, 'OPEN DOOR');
  assert.equal(t.note, 'HOLD · PEEK');
  assert.equal(activeInteraction(targets).kind, 'door');
  assert.equal(collectInteractables({...base, doorProps: [door], peeking: true}).find(x => x.kind === 'door').verb, 'PEEKING');
  openDoor(door);
  assert.equal(collectInteractables({...base, doorProps: [door]}).some(x => x.kind === 'door'), false);
  assert.ok(RANGE.door > 40);
});
