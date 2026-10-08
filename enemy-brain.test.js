import test from 'node:test';
import assert from 'node:assert/strict';
import {createNav, stepEnemyBrain, findCover, leadAim, segmentHitsCircle, brainState} from './enemy-brain.js';

const TILE = 32;
// '#' wall, '.' floor. Rows are y.
const parse = rows => rows.map(r => [...r].map(ch => (ch === '#' ? 1 : 0)));
const mapOf = rows => { const solid = parse(rows); return {solid, tiles: solid.map(r => r.map(v => (v ? 1 : 0)))}; };
const at = (tx, ty) => ({x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE});

// Tile + crate aware line of sight, like game.js lineBlocked.
function makeWorld(rows, extra = {}) {
  const {solid, tiles} = mapOf(rows);
  const nav = createNav(tiles, solid);
  const crates = extra.crates ?? [];
  const los = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1), steps = Math.ceil(len / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      if (solid[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] !== 0) return false;
    }
    return !crates.some(c => segmentHitsCircle(x1, y1, x2, y2, c.x, c.y, 17));
  };
  return {nav, los, solid, player: {x: 0, y: 0, vx: 0, vy: 0, radius: 10}, enemies: [], projectiles: [], noises: [], smoke: [], ...extra};
}
const open = (w, h) => Array.from({length: h}, (_, y) => (y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#'));

const DEFS = {
  chaser: {brain: 'rush', speed: 72, range: 19},
  gunner: {brain: 'shoot', speed: 40, minRange: 105, range: 300, projectileSpeed: 190},
  brute: {brain: 'rush', speed: 30, range: 25},
  guard: {brain: 'guard', speed: 28, minRange: 88, range: 210, projectileSpeed: 215},
};
let nextId = 1;
function mk(type, pos, extra = {}) {
  const def = DEFS[type];
  const mag = type === 'gunner' ? 5 : type === 'guard' ? 3 : 0;
  return {id: nextId++, type, def, x: pos.x, y: pos.y, radius: type === 'brute' ? 10 : 8, hp: 50, maxHp: 50, alive: true, stun: 0, reloadTimer: 0, ammo: mag, mag, roomIndex: 0, ...extra};
}
function rngOf(seed = 7) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// Minimal sim: applies the brain's velocity with tile collision. Returns the outputs of the last step.
function step(world, enemy, dt, rng) {
  const out = stepEnemyBrain(enemy, world, dt, rng);
  const vx = out.moveX * enemy.def.speed, vy = out.moveY * enemy.def.speed;
  const nx = enemy.x + vx * dt, ny = enemy.y + vy * dt;
  if (world.nav.isOpenAt(nx, enemy.y)) enemy.x = nx;
  if (world.nav.isOpenAt(enemy.x, ny)) enemy.y = ny;
  return out;
}
function prime(world, rng) {
  world.noises = [{x: world.player.x, y: world.player.y, radius: 2000}];
  for (const e of world.enemies) stepEnemyBrain(e, world, 0.001, rng);
  world.noises = [];
}
function run(world, enemies, seconds, dt, rng, onStep) {
  const log = [];
  for (let t = 0; t < seconds; t += dt) {
    for (const e of enemies) {
      if (e.reloadTimer > 0) e.reloadTimer = Math.max(0, e.reloadTimer - dt);
      const out = step(world, e, dt, rng);
      if (out.fire) { e.ammo--; if (e.ammo <= 0) { e.reloadTimer = 1.6; e.ammo = e.mag; } }
      log.push({t, e, out});
      onStep?.(t, e, out);
    }
  }
  return log;
}

// ---------------------------------------------------------------- nav
test('nav paths around a wall instead of through it', () => {
  const {solid, tiles} = mapOf([
    '##########',
    '#...#....#',
    '#...#....#',
    '#...#....#',
    '#........#',
    '##########',
  ]);
  const nav = createNav(tiles, solid);
  const path = nav.findPath(at(1, 1), at(8, 1), {radius: 8});
  assert.ok(path && path.length >= 2);
  // Must dip below the wall (y tile 4) to get across.
  assert.ok(path.some(p => Math.floor(p.y / TILE) === 4));
  let prev = at(1, 1);
  for (const p of path) { assert.ok(nav.walkable(prev, p, 8)); prev = p; }
  assert.equal(nav.findPath(at(1, 1), at(1, 1))?.length, 1);
});

test('nav returns null when the goal is sealed off', () => {
  const {solid, tiles} = mapOf(['#######', '#..#..#', '#..#..#', '#######']);
  const nav = createNav(tiles, solid);
  assert.equal(nav.findPath(at(1, 1), at(5, 1)), null);
});

test('nav does not cut corners diagonally', () => {
  const {solid, tiles} = mapOf(['#####', '#.#.#', '##..#', '#####']);
  const nav = createNav(tiles, solid);
  const path = nav.findPath(at(1, 1), at(3, 1), {radius: 4});
  assert.equal(path, null); // (1,1) is only diagonally adjacent to the rest
});

test('crates block tiles, can be removed, and invalidate paths and flow fields', () => {
  const {solid, tiles} = mapOf(['#######', '#.....#', '#######']);
  const nav = createNav(tiles, solid);
  const v0 = nav.version;
  const field0 = nav.flowField(at(5, 1));
  assert.ok(Number.isFinite(field0.distAt(at(1, 1).x, at(1, 1).y)));
  nav.blockCircle('crate', at(3, 1).x, at(3, 1).y, 17);
  assert.ok(nav.version > v0);
  assert.equal(nav.isOpen(3, 1), false);
  assert.equal(nav.findPath(at(1, 1), at(5, 1)), null);
  const field1 = nav.flowField(at(5, 1));
  assert.notEqual(field1, field0);
  assert.equal(field1.distAt(at(1, 1).x, at(1, 1).y), Infinity);
  nav.unblock('crate');
  assert.equal(nav.isOpen(3, 1), true);
  assert.ok(nav.findPath(at(1, 1), at(5, 1)));
  assert.ok(Number.isFinite(nav.flowField(at(5, 1)).distAt(at(1, 1).x, at(1, 1).y)));
});

test('setBlockers replaces the whole crate set', () => {
  const {solid, tiles} = mapOf(['#######', '#.....#', '#######']);
  const nav = createNav(tiles, solid);
  nav.setBlockers([{x: at(2, 1).x, y: at(2, 1).y, r: 17}, {x: at(4, 1).x, y: at(4, 1).y, r: 17}]);
  assert.equal(nav.isOpen(2, 1) || nav.isOpen(4, 1), false);
  nav.setBlockers([]);
  assert.ok(nav.isOpen(2, 1) && nav.isOpen(4, 1));
});

test('flow field direction leads around a wall to the goal', () => {
  const {solid, tiles} = mapOf(['#######', '#..#..#', '#..#..#', '#.....#', '#######']);
  const nav = createNav(tiles, solid);
  const field = nav.flowField(at(5, 1));
  let pos = at(1, 1);
  for (let i = 0; i < 400 && Math.hypot(pos.x - at(5, 1).x, pos.y - at(5, 1).y) > 20; i++) {
    const dir = field.dirAt(pos.x, pos.y);
    if (!dir) break;
    pos = {x: pos.x + dir.x * 6, y: pos.y + dir.y * 6};
    assert.ok(nav.isOpenAt(pos.x, pos.y), 'stays on open tiles');
  }
  assert.ok(Math.hypot(pos.x - at(5, 1).x, pos.y - at(5, 1).y) <= 20);
});

// ---------------------------------------------------------------- math
test('leadAim hits a constant-velocity target', () => {
  const from = {x: 0, y: 0}, target = {x: 200, y: 0}, v = {x: 0, y: 60}, speed = 190;
  const lead = leadAim(from, target, v.x, v.y, speed, 1);
  const flight = Math.hypot(lead.x, lead.y) / speed;
  assert.ok(Math.abs(target.x + v.x * flight - lead.x) < 1e-6 && Math.abs(target.y + v.y * flight - lead.y) < 1e-6);
  assert.deepEqual([lead.x, lead.y].map(Math.round), [200, Math.round(60 * flight)]);
  const none = leadAim(from, target, 0, 0, speed, 1);
  assert.equal(Math.round(none.x), 200); assert.equal(Math.round(none.y), 0);
});

// ---------------------------------------------------------------- awareness
test('enemies stay idle until they see or hear the player', () => {
  const world = makeWorld(['##########', '#....#...#', '#....#...#', '#....#...#', '##########']);
  const e = mk('gunner', at(1, 1));
  world.enemies = [e];
  world.player = {...at(7, 2), vx: 0, vy: 0, radius: 10};
  const rng = rngOf();
  for (let i = 0; i < 20; i++) assert.equal(step(world, e, 0.05, rng).intent, 'idle');
  assert.equal(e.ai.aware, false);
  world.noises = [{...at(7, 2), radius: 400}];
  const out = step(world, e, 0.05, rng);
  assert.equal(e.ai.aware, true, 'heard through the wall');
  assert.equal(out.sees, false);
  world.noises = [];
});

test('hearing is attenuated by walls and limited by radius', () => {
  const world = makeWorld(open(30, 5));
  const e = mk('chaser', at(2, 2));
  world.enemies = [e];
  world.player = {...at(25, 2), vx: 0, vy: 0, radius: 10};
  world.los = () => true;
  world.noises = [{...at(25, 2), radius: 200}];
  world.player = {...at(25, 2), vx: 0, vy: 0, radius: 10};
  world.los = (a, b, c, d) => false; // sight and sound blocked
  step(world, e, 0.05, rngOf());
  assert.equal(e.ai.aware, false);
});

test('a noticing enemy alerts squadmates in earshot, who then investigate the last known spot', () => {
  const world = makeWorld(open(24, 12));
  const seer = mk('gunner', at(3, 5)), mate = mk('chaser', at(5, 8)), far = mk('chaser', at(21, 10), {roomIndex: 9});
  world.enemies = [seer, mate, far];
  world.player = {...at(8, 5), vx: 0, vy: 0, radius: 10};
  const rng = rngOf();
  for (let i = 0; i < 6; i++) { step(world, seer, 0.05, rng); }
  assert.ok(mate.ai?.pending, 'mate queued an alert');
  assert.equal(far.ai?.pending ?? null, null, 'far enemy in another room is not alerted');
  // Block sight for the mate and make the player vanish: it still heads to the reported position.
  const blocked = {...world, los: () => false};
  mate.ai.pending.t = 0;
  for (let i = 0; i < 10; i++) step(blocked, mate, 0.05, rng);
  assert.equal(mate.ai.aware, true);
  assert.ok(mate.ai.last);
});

test('losing sight sends the enemy to the last known position, then it searches instead of freezing', () => {
  const world = makeWorld(['#############', '#...........#', '#...........#', '#...........#', '#############']);
  const e = mk('chaser', at(1, 2));
  world.enemies = [e];
  world.player = {...at(10, 2), vx: 90, vy: 0, radius: 10};
  const rng = rngOf(3);
  for (let i = 0; i < 30; i++) step(world, e, 0.05, rng);
  assert.equal(e.ai.sees, true);
  const lastSeen = {x: e.ai.last.x, y: e.ai.last.y};
  const blind = {...world, los: () => false, player: {...at(2, 1), vx: 0, vy: 0, radius: 10}};
  const intents = new Set();
  let closest = Infinity;
  for (let i = 0; i < 400; i++) {
    const out = step(blind, e, 0.05, rng);
    intents.add(out.intent);
    closest = Math.min(closest, Math.hypot(e.x - lastSeen.x, e.y - lastSeen.y));
  }
  assert.ok(closest < 40, `got within ${closest} of last seen`);
  assert.ok(intents.has('search') || intents.has('investigate'), [...intents].join());
  assert.ok(!(intents.size === 1 && intents.has('idle')));
});

test('smoke between enemy and player blocks sight', () => {
  const world = makeWorld(open(20, 6));
  const e = mk('gunner', at(2, 3));
  world.enemies = [e];
  world.player = {...at(14, 3), vx: 0, vy: 0, radius: 10};
  world.smoke = [{...at(8, 3), radius: 60}];
  const out = stepEnemyBrain(e, world, 0.05, rngOf());
  assert.equal(out.sees, false);
  world.smoke = [];
  assert.equal(stepEnemyBrain(e, world, 0.05, rngOf()).sees, true);
});

// ---------------------------------------------------------------- ranged
test('findCover returns a hidden hide spot with a visible peek spot in range', () => {
  const world = makeWorld([
    '####################',
    '#..................#',
    '#..................#',
    '#........##........#',
    '#........##........#',
    '#..................#',
    '#..................#',
    '####################',
  ]);
  const e = mk('gunner', at(12, 4));
  const player = at(3, 3);
  world.enemies = [e];
  const cover = findCover(e, player, world, {minRange: 105, maxRange: 264});
  assert.ok(cover, 'cover found');
  assert.equal(world.los(player.x, player.y, cover.hide.x, cover.hide.y), false);
  assert.equal(world.los(player.x, player.y, cover.peek.x, cover.peek.y), true);
  const dp = Math.hypot(cover.peek.x - player.x, cover.peek.y - player.y);
  assert.ok(dp >= 105 && dp <= 264);
});

const coverRoom = [
  '######################',
  '#....................#',
  '#....................#',
  '#....................#',
  '#.........##.........#',
  '#.........##.........#',
  '#....................#',
  '#....................#',
  '#....................#',
  '######################',
];

test('gunner uses cover: ducks hidden, peeks, telegraphs, then fires', () => {
  const world = makeWorld(coverRoom);
  const e = mk('gunner', at(14, 5));
  world.enemies = [e];
  world.player = {...at(4, 4), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(11);
  prime(world, rng);
  const intents = new Set(), hiddenFrames = [];
  let fires = 0;
  run(world, [e], 25, 0.05, rng, (t, en, out) => {
    intents.add(out.intent);
    if (out.fire) fires++;
    if (out.intent === 'cover' && !out.sees) hiddenFrames.push(t);
  });
  assert.ok(fires >= 2, `fires ${fires}`);
  assert.ok(intents.has('peek') && intents.has('cover') && intents.has('aim'), [...intents].join());
  assert.ok(hiddenFrames.length > 10, 'spent time hidden');
});

test('telegraph is required: fire is never true unless a windup ran first, and it lasts the profile time', () => {
  const world = makeWorld(open(24, 10));
  const e = mk('gunner', at(15, 4));
  world.enemies = [e];
  world.player = {...at(4, 4), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(5);
  let windupFrames = 0, shots = 0, windupBefore = 0;
  run(world, [e], 20, 0.02, rng, (t, en, out) => {
    if (out.aiming) windupFrames++;
    if (out.fire) {
      shots++;
      assert.ok(windupFrames * 0.02 >= 0.16, `windup ${windupFrames * 0.02}`);
      windupFrames = 0;
    }
    if (!out.aiming && !out.fire) windupFrames = 0;
  });
  assert.ok(shots >= 2);
  void windupBefore;
});

test('telegraph scales with the time scale (same number of scaled seconds)', () => {
  const measure = dt => {
    const world = makeWorld(open(24, 10));
    const e = mk('gunner', at(15, 4));
    world.enemies = [e];
    world.player = {...at(4, 4), vx: 0, vy: 0, radius: 10};
    const rng = rngOf(21);
    let firstAim = null, firstFire = null, t = 0;
    for (; t < 15; t += dt) {
      const out = step(world, e, dt, rng);
      if (out.aiming && firstAim === null) firstAim = t;
      if (out.fire) { firstFire = t; break; }
    }
    return firstFire - firstAim;
  };
  const a = measure(0.05), b = measure(0.01);
  assert.ok(Math.abs(a - b) < 0.1, `${a} vs ${b}`);
});

test('never fires through walls', () => {
  const world = makeWorld(['##########', '#...#....#', '#...#....#', '#...#....#', '##########']);
  const e = mk('gunner', at(2, 2));
  world.enemies = [e];
  world.player = {...at(7, 2), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(2);
  world.noises = [{...at(7, 2), radius: 500}];
  let fired = false;
  run(world, [e], 10, 0.05, rng, (t, en, out) => { if (out.fire) fired = true; world.noises = []; });
  assert.equal(fired, false);
});

test('never fires through an ally standing in the line of fire', () => {
  const world = makeWorld(open(24, 8));
  const shooter = mk('gunner', at(18, 3));
  const ally = mk('chaser', {x: at(11, 3).x, y: at(11, 3).y + 1});
  // Pin both in place: only check the fire decision on the straight line.
  world.enemies = [shooter, ally];
  world.player = {...at(4, 3), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(8);
  let fired = false;
  for (let i = 0; i < 400; i++) {
    const out = stepEnemyBrain(shooter, world, 0.02, rng);
    if (out.fire) { fired = true; const a = {x: out.aimX, y: out.aimY}; assert.ok(!segmentHitsCircle(shooter.x, shooter.y, shooter.x + a.x * 300, shooter.y + a.y * 300, ally.x, ally.y, ally.radius)); }
    // hold the shooter still so the ally stays on the line
    shooter.x = at(18, 3).x; shooter.y = at(18, 3).y;
  }
  assert.equal(fired, false);
});

test('shots lead a strafing player and the aim error tightens the longer the player stays visible', () => {
  const errAfter = lock => {
    const errs = [];
    for (let seed = 1; seed <= 60; seed++) {
      const world = makeWorld(open(30, 12));
      const e = mk('gunner', at(13, 5));
      world.enemies = [e];
      world.player = {...at(6, 5), vx: 0, vy: 80, radius: 10};
      const ai = brainState(e, rngOf(seed));
      ai.lockTime = lock;
      ai.aware = true; ai.sees = true;
      const out = stepEnemyBrain(e, world, 0.001, rngOf(seed));
      ai.windup = 0;
      // Force a fresh aim computation via a ready shooter.
      ai.cd = 0; ai.reaction = 0; ai.lockTime = lock;
      for (let k = 0; k < 40 && !ai.windup; k++) { ai.lockTime = lock; ai.cd = 0; stepEnemyBrain(e, world, 0.001, rngOf(seed + k)); if (ai.windup > 0) break; }
      if (!(ai.windup > 0)) continue;
      const t = Math.hypot(world.player.x - e.x, world.player.y - e.y) / 190;
      const truth = {x: world.player.x, y: world.player.y + 80 * t};
      const want = Math.atan2(truth.y - e.y, truth.x - e.x), got = Math.atan2(ai.aim.y, ai.aim.x);
      errs.push(Math.abs(got - want));
      void out;
    }
    return errs.reduce((s, v) => s + v, 0) / errs.length;
  };
  const fresh = errAfter(0), settled = errAfter(3);
  assert.ok(settled < fresh, `settled ${settled} < fresh ${fresh}`);
  // Naive (non-leading) aim would be off by roughly atan(80*t/d); leading must beat that clearly.
  const naive = Math.atan2(80 * (224 / 190), 224);
  assert.ok(settled < naive * 0.6, `lead error ${settled} vs naive ${naive}`);
});

test('fire tokens: at most two enemies telegraph at once and starts are staggered', () => {
  const world = makeWorld(open(30, 14));
  const squad = [0, 1, 2, 3].map(i => mk('gunner', at(22 + (i % 2), 3 + i * 2)));
  world.enemies = squad;
  world.player = {...at(14, 7), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(13);
  let maxConcurrent = 0, simultaneousStarts = 0, fires = 0;
  const startedAt = new Map();
  for (let t = 0; t < 20; t += 0.05) {
    let concurrent = 0;
    for (const e of squad) {
      if (e.reloadTimer > 0) e.reloadTimer = Math.max(0, e.reloadTimer - 0.05);
      const out = step(world, e, 0.05, rng);
      if (out.fire) { fires++; e.ammo--; if (e.ammo <= 0) { e.reloadTimer = 1.6; e.ammo = e.mag; } }
      if (out.aiming) { concurrent++; if (!startedAt.has(e.id)) startedAt.set(e.id, t); }
      else startedAt.delete(e.id);
    }
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    const starts = [...startedAt.values()].filter(s => Math.abs(s - t) < 1e-9).length;
    if (starts > 1) simultaneousStarts++;
  }
  assert.ok(fires >= 3, `fires ${fires}`);
  assert.ok(maxConcurrent <= 2, `max concurrent ${maxConcurrent}`);
  assert.equal(simultaneousStarts, 0);
});

test('strafes perpendicular and holds the range band when no cover is available', () => {
  const world = makeWorld(open(30, 12));
  const e = mk('gunner', at(14, 5));
  world.enemies = [e];
  world.player = {...at(6, 5), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(4);
  let lateral = 0, minD = Infinity;
  run(world, [e], 14, 0.05, rng, (t, en, out) => {
    lateral += Math.abs(out.moveY) * 0.05 * en.def.speed;
    minD = Math.min(minD, Math.hypot(en.x - world.player.x, en.y - world.player.y));
  });
  assert.ok(lateral > 20, `lateral ${lateral}`);
  assert.ok(minD >= 100, `stayed out of min range, min ${minD}`);
});

test('retreats when the player is inside min range', () => {
  const world = makeWorld(open(30, 12));
  const e = mk('guard', at(12, 5));
  world.enemies = [e];
  world.player = {...at(10, 5), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(6);
  e.ai = null;
  for (let i = 0; i < 10; i++) step(world, e, 0.05, rng);
  const before = Math.hypot(e.x - world.player.x, e.y - world.player.y);
  for (let i = 0; i < 40; i++) step(world, e, 0.05, rng);
  const after = Math.hypot(e.x - world.player.x, e.y - world.player.y);
  assert.ok(after > before + 20, `${before} -> ${after}`);
});

test('reloading or low hp sends a ranged enemy to cover and keeps it there', () => {
  const world = makeWorld(coverRoom);
  const e = mk('gunner', at(14, 3), {reloadTimer: 1.6, ammo: 0});
  world.enemies = [e];
  world.player = {...at(4, 4), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(17);
  prime(world, rng);
  const intents = [];
  for (let i = 0; i < 60; i++) { intents.push(step(world, e, 0.05, rng).intent); }
  assert.ok(intents.includes('cover') || intents.includes('reload'), intents.join());
  assert.ok(!intents.includes('aim'), 'does not shoot while reloading');
  const hurt = mk('guard', at(12, 6), {hp: 10});
  world.enemies = [hurt];
  world.player = {...at(5, 3), vx: 0, vy: 0, radius: 10};
  prime(world, rng);
  const out = [];
  for (let i = 0; i < 80; i++) out.push(step(world, hurt, 0.05, rng).intent);
  assert.ok(out.includes('cover'), out.join());
});

test('stunned enemies do not move, aim or fire', () => {
  const world = makeWorld(open(24, 10));
  const e = mk('gunner', at(15, 4), {stun: 1});
  world.enemies = [e];
  world.player = {...at(4, 4), vx: 0, vy: 0, radius: 10};
  for (let i = 0; i < 20; i++) {
    const out = stepEnemyBrain(e, world, 0.05, rngOf(i));
    assert.equal(out.moveX, 0); assert.equal(out.moveY, 0); assert.equal(out.fire, false); assert.equal(out.aiming, false);
  }
});

// ---------------------------------------------------------------- squad
test('a flanker routes to an approach angle away from the suppressor', () => {
  const world = makeWorld([
    '##############################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '##############################',
  ]);
  const sup = mk('gunner', at(22, 4)), flanker = mk('gunner', at(22, 6));
  world.enemies = [sup, flanker];
  world.player = {...at(14, 4), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(9);
  // Let the suppressor claim the role while the flanker cannot see the player.
  const blind = {...world, los: (ax, ay, bx, by) => (Math.abs(ax - sup.x) < 1 && Math.abs(ay - sup.y) < 1) || (Math.abs(bx - sup.x) < 1 && Math.abs(by - sup.y) < 1) ? world.los(ax, ay, bx, by) : false};
  for (let i = 0; i < 15; i++) stepEnemyBrain(sup, world, 0.05, rng);
  assert.equal(sup.ai.role, 'suppress');
  stepEnemyBrain(flanker, world, 0.05, rng);
  assert.equal(flanker.ai.role, 'flank');
  // Force the flanker to plan a flank (it cannot see the player).
  flanker.ai.sees = false;
  const out = stepEnemyBrain(flanker, {...blind, enemies: [sup, flanker]}, 0.05, rng);
  assert.ok(['flank', 'peek', 'cover', 'approach', 'aim'].includes(out.intent), out.intent);
  if (flanker.ai.flank) {
    const supAngle = Math.atan2(sup.y - world.player.y, sup.x - world.player.x);
    const fAngle = Math.atan2(flanker.ai.flank.y - world.player.y, flanker.ai.flank.x - world.player.x);
    let delta = Math.abs(supAngle - fAngle); if (delta > Math.PI) delta = 2 * Math.PI - delta;
    assert.ok(delta > 0.85, `flank angle ${delta}`);
  }
});

test('only one enemy holds the suppress role', () => {
  const world = makeWorld(open(30, 12));
  const squad = [0, 1, 2].map(i => mk('gunner', at(20 + i, 3 + i * 3)));
  world.enemies = squad;
  world.player = {...at(12, 6), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(23);
  for (let i = 0; i < 30; i++) for (const e of squad) step(world, e, 0.05, rng);
  assert.equal(squad.filter(e => e.ai.role === 'suppress').length, 1);
  assert.ok(squad.some(e => e.ai.role === 'flank'));
});

test('enemies do not stack on one cover tile', () => {
  const world = makeWorld(coverRoom);
  const a = mk('gunner', at(14, 3)), b = mk('gunner', at(14, 6));
  world.enemies = [a, b];
  world.player = {...at(4, 4), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(31);
  for (let i = 0; i < 80; i++) { step(world, a, 0.05, rng); step(world, b, 0.05, rng); }
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 14, 'separated');
});

// ---------------------------------------------------------------- rushers and brutes
test('rusher paths around a wall to reach the player', () => {
  const world = makeWorld(['###########', '#....#....#', '#....#....#', '#....#....#', '#.........#', '###########']);
  const e = mk('chaser', at(1, 1));
  world.enemies = [e];
  world.player = {...at(9, 1), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(41);
  prime(world, rng);
  let reached = false;
  run(world, [e], 12, 0.05, rng, () => { if (Math.hypot(e.x - world.player.x, e.y - world.player.y) < 30) reached = true; });
  assert.ok(reached);
});

test('rusher zig-zags on approach and circles in when close', () => {
  const world = makeWorld(open(40, 12));
  const e = mk('chaser', at(16, 5));
  world.enemies = [e];
  world.player = {...at(4, 5), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(51);
  prime(world, rng);
  const intents = new Set(); const signs = new Set();
  run(world, [e], 8, 0.05, rng, (t, en, out) => { intents.add(out.intent); if (out.intent === 'zigzag') signs.add(Math.sign(Math.round(out.moveY * 10))); });
  assert.ok(intents.has('zigzag'), [...intents].join());
  assert.ok(signs.has(1) && signs.has(-1), 'zigzag alternates sides');
  const e2 = mk('chaser', {x: world.player.x + 100, y: world.player.y});
  world.enemies = [e2];
  prime(world, rng);
  const seen = new Set();
  for (let i = 0; i < 10; i++) seen.add(step(world, e2, 0.05, rng).intent);
  assert.ok(seen.has('circle'), [...seen].join());
});

test('brute commits to a charge with a visible wind-up, then dashes in a locked direction', () => {
  const world = makeWorld(open(30, 10));
  const e = mk('brute', at(14, 4));
  world.enemies = [e];
  world.player = {...at(6, 4), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(61);
  const phases = [];
  let windupFrames = 0, dashSpeed = 0;
  for (let t = 0; t < 12; t += 0.02) {
    const out = step(world, e, 0.02, rng);
    if (out.aiming && out.intent === 'charge') { windupFrames++; assert.equal(out.moveX, 0); assert.ok(out.windupTotal > 0); }
    else if (out.intent === 'charge' && out.speed > 1.5) dashSpeed = Math.max(dashSpeed, out.speed);
    phases.push(out.intent);
  }
  assert.ok(windupFrames * 0.02 >= 0.5, `windup ${windupFrames * 0.02}`);
  assert.ok(dashSpeed > 1.5, 'dashes');
  assert.ok(phases.indexOf('charge') < phases.lastIndexOf('charge'));
});

test('brute does not charge or move during its melee wind-up', () => {
  const world = makeWorld(open(30, 10));
  const e = mk('brute', at(8, 4), {meleeWindup: 0.3});
  world.enemies = [e];
  world.player = {...at(7, 4), vx: 0, vy: 0, radius: 10};
  prime(world, rngOf(1));
  e.ai.reaction = 0;
  const out = stepEnemyBrain(e, world, 0.05, rngOf(1));
  assert.equal(out.intent, 'attack');
  assert.equal(out.moveX, 0);
});

// ---------------------------------------------------------------- dodge
function dodgeSetup(type, shotFrom = -60, seed = 1) {
  const world = makeWorld(open(30, 12));
  const e = mk(type, at(15, 5));
  world.enemies = [e];
  world.player = {...at(4, 5), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(seed);
  for (let k = 0; k < 10; k++) step(world, e, 0.1, rng);
  const shot = {x: e.x + shotFrom, y: e.y, vx: shotFrom < 0 ? 600 : -600, vy: 0, radius: 2};
  world.projectiles = [shot];
  return {world, e, rng, shot};
}

test('an aware enemy facing the shot always sidesteps it, perpendicular to its path (deterministic)', () => {
  for (const type of ['chaser', 'gunner']) for (let seed = 1; seed <= 20; seed++) {
    const {world, e, rng} = dodgeSetup(type, -60, seed);
    const out = stepEnemyBrain(e, world, 0.02, rng);
    assert.equal(out.intent, 'dodge', `${type} seed ${seed}`);
    assert.ok(Math.abs(out.moveY) > Math.abs(out.moveX) * 3, 'sidestep is perpendicular to the shot');
    assert.equal(out.dodging, true);
  }
});

test('dodging has a cooldown: the next shot right after hits', () => {
  const {world, e, rng} = dodgeSetup('gunner');
  stepEnemyBrain(e, world, 0.02, rng);
  for (let k = 0; k < 20; k++) stepEnemyBrain(e, world, 0.02, rng);   // dodge finishes (0.3 s)
  world.projectiles = [{x: e.x - 60, y: e.y, vx: 600, vy: 0, radius: 2}];
  assert.ok(e.ai.dodgeCd > 0);
  const out = stepEnemyBrain(e, world, 0.02, rng);
  assert.notEqual(out.intent, 'dodge');
});

test('no dodge when the shot comes from behind, or while winding up, or when unaware, or for brutes', () => {
  {
    const {world, e, rng} = dodgeSetup('gunner', +60);   // bullet arrives from the east, enemy faces the player (west)
    assert.notEqual(stepEnemyBrain(e, world, 0.02, rng).intent, 'dodge');
  }
  {
    const {world, e, rng} = dodgeSetup('gunner');
    e.ai.windup = 0.3;
    assert.notEqual(stepEnemyBrain(e, world, 0.02, rng).intent, 'dodge');
  }
  {
    const {world, e, rng} = dodgeSetup('chaser');
    e.ai.aware = false; e.posture = 'guard'; e.ai.suspicion = 0;
    assert.notEqual(stepEnemyBrain(e, world, 0.02, rng).intent, 'dodge');
  }
  {
    const {world, e, rng} = dodgeSetup('brute');
    assert.notEqual(stepEnemyBrain(e, world, 0.02, rng).intent, 'dodge');
  }
  {
    const {world, e, rng} = dodgeSetup('guard');
    assert.notEqual(stepEnemyBrain(e, world, 0.02, rng).intent, 'dodge');
  }
});

// ---------------------------------------------------------------- determinism / robustness
test('brain is deterministic for a given rng and tolerates bad dt', () => {
  const trace = () => {
    const world = makeWorld(coverRoom);
    const e = mk('gunner', at(14, 5), {id: 99});
    world.enemies = [e];
    world.player = {...at(4, 4), vx: 30, vy: 0, radius: 10};
    const rng = rngOf(123);
    const out = [];
    for (let i = 0; i < 200; i++) { const o = step(world, e, 0.05, rng); out.push([o.intent, Math.round(e.x), Math.round(e.y), o.fire]); }
    return JSON.stringify(out);
  };
  assert.equal(trace(), trace());
  const world = makeWorld(open(10, 6));
  const e = mk('chaser', at(2, 2));
  world.enemies = [e];
  world.player = {...at(7, 2), vx: 0, vy: 0, radius: 10};
  for (const bad of [NaN, -1, Infinity, 0]) assert.doesNotThrow(() => stepEnemyBrain(e, world, bad, rngOf(1)));
});

test('a squad fight in a room with cover: enemies stay on open tiles and eventually shoot', () => {
  const world = makeWorld(coverRoom);
  const squad = [mk('gunner', at(18, 2)), mk('guard', at(18, 7)), mk('chaser', at(19, 4)), mk('brute', at(19, 6))];
  world.enemies = squad;
  world.player = {...at(3, 4), vx: 0, vy: 0, radius: 10};
  const rng = rngOf(2024);
  prime(world, rng);
  let fires = 0;
  run(world, squad, 30, 0.05, rng, (t, e, out) => {
    if (out.fire) fires++;
    assert.ok(world.nav.isOpenAt(e.x, e.y), `${e.type} on open ground at t=${t.toFixed(2)}`);
  });
  assert.ok(fires >= 3, `fires ${fires}`);
});

test('flow field expansion is capped by radius and falls back beyond it', () => {
  const row = '#' + '.'.repeat(60) + '#';
  const {solid, tiles} = mapOf(['#'.repeat(62), row, '#'.repeat(62)]);
  const nav = createNav(tiles, solid);
  const field = nav.flowField(at(1, 1), 10);
  assert.ok(Number.isFinite(field.distAt(at(8, 1).x, at(8, 1).y)));
  assert.equal(field.distAt(at(30, 1).x, at(30, 1).y), Infinity);
  assert.equal(field.dirAt(at(30, 1).x, at(30, 1).y), null);
  const def = nav.flowField(at(1, 1));
  assert.ok(Number.isFinite(def.distAt(at(25, 1).x, at(25, 1).y)));
  assert.equal(def.distAt(at(55, 1).x, at(55, 1).y), Infinity);
  assert.notEqual(def, field);
});
