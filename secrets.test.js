import test from 'node:test';
import assert from 'node:assert/strict';
import {planSecret, planTape, planDecor, numberStationRooms, numberStationDigits, hitCrack, crackStage, bulletHitsTile, SIGNAL_DIED} from './secrets.js';
import {createCodeMatcher, KONAMI, BIGHEAD, hatFor, HATS, parseCosmetics, unlockHat, cycleHat, emptyCosmetics, toggleMode} from './easter.js';
import {fidgetAt, IDLE_FIDGETS} from './rig2d.js';
import {guardAct, sleepMumble} from './details2d.js';
import {hitBullet, sceneBullets, tickPhase} from './title-scene-core.js';
import {fieldTapeFor, FIELD_TAPES} from './story.js';

// a 40x30 solid map with one open 10x8 room at (5..14, 5..12)
function world() {
  const w = 40, h = 30, tileMap = Array.from({length: h}, () => Array(w).fill(1));
  const room = {index: 1, x1: 5, y1: 5, x2: 14, y2: 12, role: 'combat', cx: 9, cy: 8};
  for (let y = room.y1; y <= room.y2; y++) for (let x = room.x1; x <= room.x2; x++) tileMap[y][x] = 0;
  return {tileMap, rooms: [{index: 0, x1: 1, y1: 1, x2: 2, y2: 2, role: 'entry'}, room], room};
}

test('secret plan is deterministic, sealed, and hollow cells match the pocket', () => {
  const {tileMap, rooms} = world();
  let plan = null, seed = 0;
  while (!plan && seed < 50) plan = planSecret({tileMap, rooms, seed: ++seed, floor: 1, chance: 1});
  assert.ok(plan);
  assert.deepEqual(plan, planSecret({tileMap, rooms, seed, floor: 1, chance: 1}));
  assert.equal(plan.cells.length, 1 + 3 * 3);
  // the crack touches the room floor; the pocket never does
  const {crack, dir} = plan;
  assert.equal(tileMap[crack.y - dir.y][crack.x - dir.x], 0);
  for (const c of plan.cells.slice(1)) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = tileMap[c.y + dy][c.x + dx];
      const isCell = plan.cells.some((q) => q.x === c.x + dx && q.y === c.y + dy);
      assert.ok(n === 1 || isCell, 'pocket is enclosed by rock');
    }
  }
  assert.equal(plan.room, 1);
});

test('secret chance 0 never plans one, and the entry room is never used', () => {
  const {tileMap, rooms} = world();
  assert.equal(planSecret({tileMap, rooms, seed: 5, chance: 0}), null);
  const only = [rooms[0]];
  assert.equal(planSecret({tileMap, rooms: only, seed: 5, chance: 1}), null);
});

test('crack hits count down and the stage grows', () => {
  let hp = 3;
  const stages = [];
  for (let i = 0; i < 3; i++) { stages.push(crackStage(hp)); const r = hitCrack(hp); hp = r.hp; if (i < 2) assert.equal(r.broke, false); else assert.equal(r.broke, true); }
  assert.deepEqual(stages, [0, 1, 2 - 0 > 2 ? 2 : 2]);
  assert.equal(bulletHitsTile(32 * 5 - 2, 32 * 3 + 5, 100, 0, 5, 3), true);
  assert.equal(bulletHitsTile(32 * 2, 32 * 3 + 5, 100, 0, 5, 3), false);
});

test('hidden tape sits in a room corner with walls on two sides', () => {
  const {tileMap, rooms} = world();
  let tape = null, seed = 0;
  while (!tape && seed < 50) tape = planTape({tileMap, rooms, seed: ++seed, chance: 1});
  assert.ok(tape);
  assert.ok([5, 14].includes(tape.tx) && [5, 12].includes(tape.ty));
  assert.equal(planTape({tileMap, rooms, seed: 1, chance: 0}), null);
});

test('wall decor stays on the north wall, one per neighbourhood, deterministic', () => {
  const {tileMap, room} = world();
  const a = planDecor({room, tileMap, seed: 9, floor: 2}), b = planDecor({room, tileMap, seed: 9, floor: 2});
  assert.deepEqual(a, b);
  for (const d of a) { assert.equal(d.ty, room.y1 - 1); assert.equal(tileMap[d.ty][d.tx], 1); }
  const xs = a.map((d) => d.tx).sort((p, q) => p - q);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 2);
});

test('number station rooms are rare, deterministic and skip the entry', () => {
  const {rooms} = world();
  const many = Array.from({length: 400}, (_, i) => ({index: i, role: i === 0 ? 'entry' : 'combat'}));
  const hits = numberStationRooms({rooms: many, seed: 3, floor: 1});
  assert.ok(hits.length > 15 && hits.length < 90);
  assert.ok(!hits.includes(0));
  assert.deepEqual(hits, numberStationRooms({rooms: many, seed: 3, floor: 1}));
  assert.equal(numberStationDigits(4).length, 9);
  void rooms;
});

test('the signal died at 03:12', () => { assert.equal(SIGNAL_DIED.label, '03:12'); });

test('konami and big-head codes complete; a wrong key restarts', () => {
  const m = createCodeMatcher();
  let done = null;
  for (const k of KONAMI) done = m.push(k) || done;
  assert.equal(done, 'vhs');
  done = null;
  for (const k of ['ArrowUp', 'ArrowUp', 'KeyX', ...BIGHEAD]) done = m.push(k) || done;
  assert.equal(done, 'bighead');
  const m2 = createCodeMatcher();
  for (const k of KONAMI.slice(0, 5)) m2.push(k);
  m2.push('KeyZ');
  assert.equal(m2.progress()[0], 0);
  // a wrong key that is itself the first key keeps one step
  const m3 = createCodeMatcher();
  m3.push('ArrowUp'); m3.push('ArrowUp'); m3.push('ArrowUp');
  assert.equal(m3.progress()[0], 1);
});

test('hats: deterministic pick, unlock re-equips, cosmetics parse defensively', () => {
  assert.equal(hatFor(12, 1), hatFor(12, 1));
  assert.ok(HATS.some((h) => h.id === hatFor(99, 3)));
  let c = emptyCosmetics();
  let r = unlockHat(c, 'tophat'); assert.equal(r.isNew, true); c = r.cosmetics;
  r = unlockHat(c, 'tophat'); assert.equal(r.isNew, false);
  r = unlockHat(c, 'nope'); assert.equal(r.isNew, false);
  c = unlockHat(c, 'crown').cosmetics;
  assert.equal(cycleHat(c).hat, '');
  assert.equal(parseCosmetics('{bad').hat, '');
  assert.equal(parseCosmetics({hats: ['tophat', 'zzz'], hat: 'zzz'}).hat, '');
  assert.equal(toggleMode(emptyCosmetics(), 'vhs').vhs, true);
});

test('idle fidgets: the rare one plays once at a minute; the others rotate among those unlocked', () => {
  assert.ok(IDLE_FIDGETS.some((f) => f.id === 'radio') && IDLE_FIDGETS.some((f) => f.id === 'spin'));
  assert.equal(fidgetAt(61, 1).fidget.id, 'tune');
  assert.equal(fidgetAt(70, 1)?.fidget.id === 'tune', false);
  for (let t = 4; t < 58; t += 0.25) { const f = fidgetAt(t, 1); if (f) assert.ok(f.fidget.from <= t && !f.fidget.once); }
});

test('guard acts and sleeper mumbles are deterministic and periodic', () => {
  assert.deepEqual(guardAct(7, 3.3), guardAct(7, 3.3));
  const acts = new Set(); for (let t = 0; t < 400; t += 1) acts.add(guardAct(3, t).act);
  assert.ok(acts.has('watch') && acts.has('radio') && acts.has(''));
  let on = 0; for (let t = 0; t < 170; t += 0.5) if (sleepMumble(2, t).on) on++;
  assert.ok(on > 0 && on < 170);
});

test('title bullets can be shot', () => {
  const bullets = sceneBullets(), t = 3, ph = tickPhase(t), popped = new Map();
  const b0 = bullets[0], adv = b0.drift * 9 * Math.sin(t * 0.11) + ph.lurch * b0.lurch;
  const pt = {x: b0.x + Math.cos(b0.ang) * adv, y: b0.y + Math.sin(b0.ang) * adv};
  assert.equal(hitBullet(bullets, t, ph, pt, popped), 0);
  popped.set(0, t);
  assert.notEqual(hitBullet(bullets, t, ph, pt, popped), 0);
  assert.equal(hitBullet(bullets, t, ph, {x: 9999, y: 9999}, popped), -1);
});

test('field tapes are picked deterministically', () => {
  assert.equal(fieldTapeFor(5, 2), fieldTapeFor(5, 2));
  assert.ok(FIELD_TAPES.length >= 5);
});

test('secret crack is never planned behind a door or blocked tile', () => {
  const {tileMap, rooms, room} = world();
  const solidMap = tileMap.map((r) => r.slice());
  // block every floor tile along the room edge facing each direction: edge cells solid (locked-door style)
  const doorCells = [];
  for (let y = room.y1; y <= room.y2; y++) for (let x = room.x1; x <= room.x2; x++) {
    if (x === room.x1 || x === room.x2 || y === room.y1 || y === room.y2) { solidMap[y][x] = 1; doorCells.push({x, y}); }
  }
  for (let seed = 1; seed < 40; seed++) {
    assert.equal(planSecret({tileMap, solidMap, rooms, seed, chance: 1}), null);
    assert.equal(planSecret({tileMap, doorCells, rooms, seed, chance: 1}), null);
  }
  // a single blocked tile just in front of the edge tile also rejects that start
  const open = world();
  for (let seed = 1; seed < 40; seed++) {
    const p = planSecret({tileMap: open.tileMap, rooms: open.rooms, seed, chance: 1});
    if (!p) continue;
    const sm = open.tileMap.map((r) => r.slice());
    sm[p.crack.y - 2 * p.dir.y][p.crack.x - 2 * p.dir.x] = 1;
    const q = planSecret({tileMap: open.tileMap, solidMap: sm, rooms: open.rooms, seed, chance: 1});
    if (q) assert.ok(!(q.crack.x === p.crack.x && q.crack.y === p.crack.y));
  }
});

test('eggs.unlock updates in-memory cosmetics and saves', async () => {
  const store = {};
  globalThis.localStorage = {getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }};
  const {createEggs} = await import('./easter-game.js');
  const state = {};
  const eggs = createEggs({state, toast() {}, TILE: 32});
  assert.equal(eggs.unlock('cone'), true);
  assert.equal(state.cosmetics.hat, 'cone');
  assert.ok(Object.values(store).some((v) => v.includes('cone')));
  delete globalThis.localStorage;
});
