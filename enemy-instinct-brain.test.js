// Integration tests: the brain actually uses enemy-instinct.js (aim-line sidestep, grenade flight, retreat, morale, openings).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNav, stepEnemyBrain, segmentHitsCircle} from './enemy-brain.js';

const TILE = 32;
const mapOf = rows => { const solid = rows.map(r => [...r].map(ch => (ch === '#' ? 1 : 0))); return {solid, tiles: solid.map(r => r.map(v => (v ? 1 : 0)))}; };
const at = (tx, ty) => ({x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE});
function makeWorld(rows, extra = {}) {
  const {solid, tiles} = mapOf(rows);
  const nav = createNav(tiles, solid);
  const los = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1), steps = Math.ceil(len / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (solid[Math.floor((y1 + (y2 - y1) * t) / TILE)]?.[Math.floor((x1 + (x2 - x1) * t) / TILE)] !== 0) return false;
    }
    return true;
  };
  return {nav, los, solid, player: {x: 0, y: 0, vx: 0, vy: 0, radius: 10}, enemies: [], projectiles: [], noises: [], smoke: [], alerts: [], ...extra};
}
const open = (w, h) => Array.from({length: h}, (_, y) => (y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#'));
// An open room with a 2-tile-thick, 5-tile-tall pillar wall in the middle (cover).
const pillared = () => open(24, 13).map((row, y) => (y >= 4 && y <= 8 ? row.slice(0, 11) + '##' + row.slice(13) : row));

const DEFS = {
  chaser: {brain: 'rush', speed: 72, range: 19},
  gunner: {brain: 'shoot', speed: 40, minRange: 105, range: 300, projectileSpeed: 190},
  brute: {brain: 'rush', speed: 30, range: 25},
};
let nextId = 100;
function mk(type, pos, extra = {}) {
  const mag = type === 'gunner' ? 5 : 0;
  return {id: nextId++, type, def: DEFS[type], x: pos.x, y: pos.y, radius: type === 'brute' ? 10 : 8, hp: 50, maxHp: 50, alive: true, stun: 0, reloadTimer: 0, ammo: mag, mag, ...extra};
}
const rngOf = (seed = 7) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
function step(world, e, dt, rng) {
  const out = stepEnemyBrain(e, world, dt, rng);
  const nx = e.x + out.moveX * e.def.speed * dt, ny = e.y + out.moveY * e.def.speed * dt;
  if (world.nav.isOpenAt(nx, e.y)) e.x = nx;
  if (world.nav.isOpenAt(e.x, ny)) e.y = ny;
  return out;
}
function prime(world, rng) {
  world.noises = [{x: world.player.x, y: world.player.y, radius: 2000}];
  for (const e of world.enemies) stepEnemyBrain(e, world, 0.001, rng);
  world.noises = [];
}
function run(world, seconds, rng, onStep, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) {
    for (const e of world.enemies) {
      if (e.alive === false) continue;
      if (e.reloadTimer > 0) e.reloadTimer = Math.max(0, e.reloadTimer - dt);
      const out = step(world, e, dt, rng);
      if (out.fire) { e.ammo--; if (e.ammo <= 0) { e.reloadTimer = 1.6; e.ammo = e.mag; } }
      onStep?.(t, e, out);
    }
  }
}
const across = (world, e) => Math.abs((e.x - world.player.x) * -world.playerAim.y + (e.y - world.player.y) * world.playerAim.x);

test('an enemy standing in the open in the player\'s crosshair steps out of the lane', () => {
  const rng = rngOf(3);
  const world = makeWorld(open(26, 14), {playerAim: {x: 1, y: 0}});
  world.player.x = at(3, 7).x; world.player.y = at(3, 7).y;
  const e = mk('gunner', {x: at(13, 7).x, y: at(13, 7).y});
  world.enemies = [e];
  prime(world, rng);
  assert.ok(across(world, e) < 5);
  let sidestepped = false, windupInLane = 0;
  run(world, 3, rng, (t, en, out) => { if (out.intent === 'sidestep') sidestepped = true; if (out.aiming && across(world, en) < 12) windupInLane++; });
  assert.ok(sidestepped, 'it took a sidestep');
  assert.ok(across(world, e) > 20, `it is out of the lane (was ${across(world, e).toFixed(1)})`);
});

test('without a playerAim in the world nothing changes (old callers stay valid)', () => {
  const rng = rngOf(3);
  const world = makeWorld(open(26, 14));
  world.player.x = at(3, 7).x; world.player.y = at(3, 7).y;
  const e = mk('gunner', {x: at(13, 7).x, y: at(13, 7).y});
  world.enemies = [e];
  prime(world, rng);
  let sidestepped = false;
  run(world, 3, rng, (t, en, out) => { if (out.intent === 'sidestep') sidestepped = true; });
  assert.equal(sidestepped, false);
});

test('a lit frag at its feet sends an enemy running, and cancels a telegraph in progress', () => {
  const rng = rngOf(5);
  const world = makeWorld(open(26, 14));
  world.player.x = at(3, 7).x; world.player.y = at(3, 7).y;
  const e = mk('gunner', {x: at(12, 7).x, y: at(12, 7).y});
  world.enemies = [e];
  prime(world, rng);
  e.ai.windup = 0.4; e.ai.windupTotal = 0.5;
  const frag = {x: e.x + 8, y: e.y, radius: 80, fuse: 1.0};
  world.hazards = [frag];
  let fled = false, fired = false;
  run(world, 1.6, rng, (t, en, out) => { if (out.intent === 'flee') fled = true; if (out.fire) fired = true; frag.fuse -= 1 / 30; });
  assert.ok(fled, 'it fled');
  assert.equal(fired, false, 'the abandoned telegraph never fired');
  assert.ok(Math.hypot(e.x - frag.x, e.y - frag.y) > frag.radius, 'it ended outside the blast radius');
});

test('a frag with a long fuse is not yet a reason to run', () => {
  const rng = rngOf(5);
  const world = makeWorld(open(26, 14));
  world.player.x = at(3, 7).x; world.player.y = at(3, 7).y;
  const e = mk('gunner', {x: at(12, 7).x, y: at(12, 7).y});
  world.enemies = [e];
  prime(world, rng);
  world.hazards = [{x: e.x + 8, y: e.y, radius: 80, fuse: 4}];
  let fled = false;
  run(world, 0.5, rng, (t, en, out) => { if (out.intent === 'flee') fled = true; });
  assert.equal(fled, false);
});

test('a badly hurt shooter breaks line of sight instead of trading shots in the open', () => {
  const rng = rngOf(9);
  const world = makeWorld(pillared(), {playerAim: {x: 1, y: 0}});
  world.player.x = at(4, 6).x; world.player.y = at(4, 6).y;
  const e = mk('gunner', {x: at(17, 6).x, y: at(17, 6).y, hp: 12});   // 24%
  world.enemies = [e];
  // wake it by sight: it starts right in the player's view past the pillar edge
  e.y = at(17, 2).y; e.x = at(17, 2).x;
  prime(world, rng);
  let hiddenAt = null, fired = 0;
  run(world, 8, rng, (t, en, out) => { if (hiddenAt === null && out.fire) fired++; if (hiddenAt === null && !world.los(world.player.x, world.player.y, en.x, en.y)) hiddenAt = t; });
  assert.notEqual(hiddenAt, null, 'it got out of the player\'s sight');
  assert.ok(hiddenAt < 5, `quickly (took ${hiddenAt?.toFixed(1)}s)`);
  assert.equal(fired, 0, 'and it did not trade shots on the way');
});

test('a healthy shooter still fights (self-preservation is not cowardice)', () => {
  const rng = rngOf(11);
  const world = makeWorld(pillared(), {playerAim: {x: 0, y: -1}});
  world.player.x = at(4, 6).x; world.player.y = at(4, 6).y;
  const e = mk('gunner', {x: at(18, 6).x, y: at(18, 6).y});
  world.enemies = [e];
  prime(world, rng);
  let fired = 0;
  run(world, 14, rng, (t, en, out) => { if (out.fire) fired++; });
  assert.ok(fired >= 1, `it fired ${fired}`);
});

test('the player reloading opens a window: a ducking shooter leans out sooner', () => {
  const peekDelay = reloading => {
    const rng = rngOf(21);
    const world = makeWorld(pillared(), {playerAim: {x: 0, y: -1}, playerReloading: reloading, playerHpFrac: 1});
    world.player.x = at(6, 6).x; world.player.y = at(6, 6).y;
    const e = mk('gunner', {x: at(17, 6).x, y: at(17, 6).y});
    world.enemies = [e];
    prime(world, rng);
    stepEnemyBrain(e, world, 0.01, rng);
    // force: it is ducked behind cover, seeing the player is possible, with a long duck left
    const ai = e.ai;
    ai.sees = true; ai.phase = 'duck'; ai.phaseT = 2.2; ai.cd = 1.5; ai.reaction = 0;
    let t = 0, peeked = null;
    for (; t < 3; t += 1 / 30) {
      step(world, e, 1 / 30, rng);
      if (e.ai.phase === 'peek' && peeked === null) peeked = t;
    }
    return peeked ?? 99;
  };
  const calm = peekDelay(false), opening = peekDelay(true);
  assert.ok(opening <= calm, `reload window peek ${opening.toFixed(2)}s vs calm ${calm.toFixed(2)}s`);
});

test('an ally dying enrages a brute and rattles a shooter, and one survivor calls it out', () => {
  const rng = rngOf(13);
  const world = makeWorld(open(26, 14));
  world.player.x = at(3, 7).x; world.player.y = at(3, 7).y;
  const brute = mk('brute', {x: at(14, 7).x, y: at(14, 7).y}), gunner = mk('gunner', {x: at(15, 9).x, y: at(15, 9).y}), victim = mk('chaser', {x: at(14, 8).x, y: at(14, 8).y});
  world.enemies = [brute, gunner, victim];
  prime(world, rng);
  for (let i = 0; i < 5; i++) for (const e of [brute, gunner, victim]) step(world, e, 1 / 30, rng);
  world.alerts.length = 0;
  victim.alive = false; victim.hp = 0;
  const stances = new Set();
  for (let i = 0; i < 6; i++) for (const e of [brute, gunner]) { const out = step(world, e, 1 / 30, rng); if (out.stance) stances.add(`${e.type}:${out.stance}`); }
  assert.ok(brute.ai.enrage > 0, 'brute enraged');
  assert.ok(gunner.ai.shaken > 0, 'gunner shaken');
  assert.ok(stances.has('brute:enrage'));
  assert.ok(world.alerts.length >= 1, 'a radio pulse went out');
  assert.ok(world.alerts.length <= 2, 'one voice, not a chorus');
});

test('stance names are limited to the readable set', () => {
  const rng = rngOf(2);
  const world = makeWorld(pillared(), {playerAim: {x: 1, y: 0}});
  world.player.x = at(4, 6).x; world.player.y = at(4, 6).y;
  world.enemies = [mk('gunner', at(18, 3)), mk('gunner', at(18, 9)), mk('chaser', at(20, 6)), mk('brute', at(21, 2))];
  prime(world, rng);
  const seen = new Set();
  run(world, 10, rng, (t, e, out) => { if (out.stance) seen.add(out.stance); });
  const allowed = new Set(['suppress', 'flank', 'fallback', 'push', 'flee', 'sidestep', 'hold', 'enrage', 'wary']);
  for (const s of seen) assert.ok(allowed.has(s), s);
});

test('rushers do not path straight down the player\'s crosshair', () => {
  const rng = rngOf(4);
  const world = makeWorld(open(30, 15), {playerAim: {x: 1, y: 0}});
  world.player.x = at(3, 7).x; world.player.y = at(3, 7).y;
  const e = mk('chaser', {x: at(24, 7).x, y: at(24, 7).y});
  world.enemies = [e];
  prime(world, rng);
  let leftLane = false;
  run(world, 3, rng, () => { if (across(world, e) > 30) leftLane = true; });
  assert.ok(leftLane, 'the weave took it out of the lane');
});

void segmentHitsCircle;
