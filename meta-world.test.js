import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProgress, parseProgress} from './progression.js';
import {emptyStats} from './goals.js';
import {REWARDS, assignRoomRewards, computeDoorLinks, doorPreviews} from './door-rewards.js';
import {TAPES, collectTape, nextTape, operatorLines} from './story.js';
import {INTERFERENCE, interferenceStats, interferenceUnlocked, toggleInterference} from './interference.js';

const seq = (seed = .3) => { let v = seed; return () => (v = (v * 9301 + .49297) % 1); };

function fakeRooms(roles) {
  return roles.map((role, index) => ({index, role, x1: index * 12, x2: index * 12 + 6, y1: 2, y2: 8, cx: index * 12 + 3, cy: 5, cleared: false, visited: false}));
}

test('every ordinary room gets a reward, specials keep theirs, entry and extraction get none', () => {
  const rooms = fakeRooms(['entry', 'combat', 'combat', 'elite', 'armory', 'clinic', 'combat', 'combat', 'extraction']);
  assignRoomRewards(rooms, seq());
  assert.equal(rooms[0].reward, null);
  assert.equal(rooms[8].reward, null);
  assert.equal(rooms[3].reward, 'elite');
  assert.equal(rooms[4].reward, 'gun');
  assert.equal(rooms[5].reward, 'heal');
  for (const i of [1, 2, 6, 7]) assert.ok(REWARDS[rooms[i].reward], rooms[i].reward);
  assert.ok(rooms.filter(r => r.reward === 'freq' || r.reward === 'elite').length >= 2);
});

test('door links: a corridor door leads to the next room and a direct link joins two rooms', () => {
  const cells = Array.from({length: 12}, () => Array(30).fill(1));
  const room = (x1, x2) => { for (let y = 2; y <= 8; y++) for (let x = x1; x <= x2; x++) cells[y][x] = 0; };
  room(1, 6); room(12, 17);
  for (let x = 7; x <= 11; x++) cells[5][x] = 0;
  const rooms = [{index: 0, x1: 1, x2: 6, y1: 2, y2: 8, cx: 3, cy: 5}, {index: 1, x1: 12, x2: 17, y1: 2, y2: 8, cx: 14, cy: 5}];
  const links = computeDoorLinks({cells, rooms, doors: [{x: 7.5, y: 5, axis: 'x'}]});
  assert.deepEqual([links[0].from, links[0].to], [0, 1]);
  assert.deepEqual(computeDoorLinks({cells, rooms, doors: [{x: 25, y: 5, axis: 'x'}]})[0], {index: 0, from: null, to: null});
});

test('door previews appear only from a cleared room, point at unvisited rewards, and skip taken ones', () => {
  const rooms = fakeRooms(['entry', 'combat', 'combat']);
  rooms[1].reward = 'freq'; rooms[2].reward = 'scrap';
  const doors = [{x: 6.5, y: 5, axis: 'x'}, {x: 18.5, y: 5, axis: 'x'}];
  const links = [{index: 0, from: 0, to: 1}, {index: 1, from: 1, to: 2}];
  assert.deepEqual(doorPreviews({rooms, doors, links, currentRoom: 0}).map(m => m.reward), ['freq']);
  rooms[1].hadEncounter = true;
  assert.deepEqual(doorPreviews({rooms, doors, links, currentRoom: 1}), [], 'current room still hostile');
  rooms[1].cleared = true;
  assert.deepEqual(doorPreviews({rooms, doors, links, currentRoom: 1}).map(m => m.reward), ['scrap']);
  rooms[2].rewardTaken = true;
  assert.deepEqual(doorPreviews({rooms, doors, links, currentRoom: 1}), []);
});

test('operator reacts to how you died, to unlocks and to recovered tapes', () => {
  const dead = operatorLines({outcome: 'dead', cause: 'sniper', floor: 2, runs: 4, seed: 3, newUnlocks: ['VECTOR 9'], newTape: TAPES[0]});
  assert.ok(dead.length >= 3);
  assert.ok(dead.every(l => l.speaker === 'OPERATOR' && l.text.length > 10));
  assert.ok(dead.some(l => /marksmen/i.test(l.text)));
  assert.ok(dead.some(l => /VECTOR 9/.test(l.text)));
  assert.ok(operatorLines({outcome: 'dead', runs: 1, seed: 0})[0].text.length > 10);
  assert.ok(operatorLines({outcome: 'won', firstBossKill: true, runs: 9})[0].text.includes('baton'));
});

test('tapes unspool one at a time in story order as requirements are met', () => {
  let progress = {...emptyProgress(), stats: {...emptyStats(), runs: 1, totalKills: 130, deepestFloor: 3}};
  const first = collectTape(progress);
  assert.equal(first.tape.id, 't01');
  progress = first.progress;
  assert.equal(collectTape(progress).tape.id, 't02');
  progress = collectTape(collectTape(progress).progress).progress;
  assert.deepEqual(progress.tapes, ['t01', 't02', 't03']);
  progress = {...progress, stats: {...emptyStats()}, tapes: TAPES.map(t => t.id)};
  assert.equal(nextTape(progress), null);
  assert.deepEqual(parseProgress(JSON.stringify({...progress, tapes: ['t01', 'bogus']})).tapes, ['t01']);
});

test('interference unlocks after the first win and stacks coin bonuses', () => {
  const fresh = emptyProgress();
  assert.equal(interferenceUnlocked(fresh), false);
  assert.equal(toggleInterference(fresh, 'armored'), fresh);
  const won = {...fresh, stats: {...emptyStats(), wins: 1}};
  let progress = toggleInterference(toggleInterference(won, 'armored'), 'thin_air');
  const stats = interferenceStats(progress);
  assert.equal(stats.enemyHpMult, 1.3);
  assert.equal(stats.noHeals, true);
  assert.ok(Math.abs(stats.coinBonus - .4) < 1e-9);
  progress = toggleInterference(progress, 'armored');
  assert.equal(interferenceStats(progress).enemyHpMult, 1);
  assert.equal(interferenceStats({...progress, stats: emptyStats()}).active.length, 0, 'locked profiles get no effects');
  assert.ok(INTERFERENCE.length >= 5);
  assert.deepEqual(parseProgress(JSON.stringify(progress)).interference, ['thin_air']);
});
