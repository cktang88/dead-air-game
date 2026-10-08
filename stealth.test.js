import test from 'node:test';
import assert from 'node:assert/strict';
import {inCone, turnFacing, suspicionRate, stepSuspicion, suspicionStage, hearingReach, noiseRingRadius, shotNoiseRadius,
  choosePostures, damageModifier, strikeFromBehind, hitsToKill, LETHALITY, PLAYER, shouldDodge, deathCause, visionFor} from './stealth.js';
import {ENEMY_TYPES, GUNS, GEAR} from './catalog.js';
import {stepEnemyBrain, createNav} from './enemy-brain.js';

const DEG = Math.PI / 180;
const east = {x: 1, y: 0};

test('cone check: range, half-angle and body slack', () => {
  const from = {x: 0, y: 0};
  assert.ok(inCone(from, east, 50 * DEG, 420, {x: 200, y: 0}));
  assert.ok(inCone(from, east, 50 * DEG, 420, {x: 200, y: 150}));        // ~37 deg
  assert.ok(!inCone(from, east, 50 * DEG, 420, {x: 200, y: 300}));       // ~56 deg
  assert.ok(!inCone(from, east, 50 * DEG, 420, {x: -100, y: 0}));        // behind
  assert.ok(!inCone(from, east, 50 * DEG, 420, {x: 500, y: 0}));         // too far
  assert.ok(visionFor('sniper').range > visionFor('gunner').range && visionFor('sniper').half < visionFor('gunner').half);
});

test('turnFacing is rate limited and keeps a unit vector', () => {
  const f = turnFacing(east, {x: -1, y: 0.0001}, 2, 0.1);
  assert.ok(Math.abs(Math.atan2(f.y, f.x)) > 0.19 && Math.abs(Math.atan2(f.y, f.x)) < 0.21);
  assert.ok(Math.abs(Math.hypot(f.x, f.y) - 1) < 1e-9);
});

test('suspicion fills faster when close and moving fast, never while out of view, and decays', () => {
  const slow = suspicionRate({inView: true, d: 300, range: 420, speed: 0});
  const walk = suspicionRate({inView: true, d: 300, range: 420, speed: 60});
  const run = suspicionRate({inView: true, d: 300, range: 420, speed: 150});
  const close = suspicionRate({inView: true, d: 100, range: 420, speed: 60});
  assert.ok(slow < walk && walk < run && walk < close);
  assert.equal(suspicionRate({inView: false, d: 10, range: 420, speed: 200}), 0);
  assert.ok(suspicionRate({inView: true, d: 20, range: 420, speed: 0}) >= 6);   // underfoot: instant
  let s = 0; for (let i = 0; i < 100; i++) s = stepSuspicion(s, {inView: true, d: 300, range: 420, speed: 60, dt: 0.02});
  assert.equal(s, 1);
  s = 0.5; s = stepSuspicion(s, {inView: false, d: 300, range: 420, speed: 0, dt: 0.5});
  assert.ok(s < 0.5 && s > 0);
  assert.equal(suspicionStage(0.05), 'calm'); assert.equal(suspicionStage(0.4), 'question'); assert.equal(suspicionStage(1), 'alert');
});

test('noise: suppressed is half, walls trim the reach, sleepers hear less, ring shape matches the hearing rule', () => {
  assert.equal(shotNoiseRadius({}), 560);
  assert.equal(shotNoiseRadius({suppressed: true}), 300);
  assert.equal(shotNoiseRadius({silent: true}), 0);
  assert.equal(hearingReach({radius: 380, blocked: true}), 380 * 0.6);
  assert.ok(hearingReach({radius: 380, asleep: true}) < 380);
  assert.equal(noiseRingRadius(380, 1000), 380);       // open ray: full radius
  assert.equal(noiseRingRadius(380, 50), 380 * 0.6);  // near wall: muffled radius beyond it
  assert.equal(noiseRingRadius(380, 300), 300);        // far wall: heard up to the wall
});

test('postures: valid kinds, snipers always guard, rooms never all asleep', () => {
  let seed = 3; const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const types = ['gunner', 'chaser', 'sniper', 'riot', 'gunner'].slice(0, 1 + i % 5);
    const out = choosePostures(types, {floor: 1 + i % 3, rng});
    out.forEach((p, k) => { seen.add(p); assert.ok(['patrol', 'guard', 'sleep', 'gather'].includes(p)); if (types[k] === 'sniper') assert.equal(p, 'guard'); });
    if (types.length > 1) assert.ok(!out.every(p => p === 'sleep'));
  }
  assert.deepEqual([...seen].sort(), ['gather', 'guard', 'patrol', 'sleep']);
});

test('SILENT x2 from behind or asleep; flank x2 on riot; brute opening x2; aware enemies take normal damage', () => {
  const facing = east, behind = {x: 1, y: 0}, front = {x: -1, y: 0};
  assert.ok(strikeFromBehind(facing, behind) && !strikeFromBehind(facing, front));
  assert.deepEqual(damageModifier({type: 'gunner', aware: false, facing, bulletDir: behind}), {mult: 2, label: 'SILENT'});
  assert.equal(damageModifier({type: 'gunner', aware: false, facing, bulletDir: front}).mult, 1);
  assert.equal(damageModifier({type: 'gunner', aware: false, asleep: true, facing, bulletDir: front}).mult, 2);
  assert.equal(damageModifier({type: 'gunner', aware: true, facing, bulletDir: behind}).mult, 1);
  assert.equal(damageModifier({type: 'riot', aware: true, facing, bulletDir: behind}).label, 'FLANK');
  assert.equal(damageModifier({type: 'riot', aware: true, facing, bulletDir: front}).mult, 1);
  assert.equal(damageModifier({type: 'brute', aware: true, facing, bulletDir: front, bruteRecovering: true}).label, 'OPENING');
  assert.equal(damageModifier({type: 'boss', aware: false, asleep: true}).mult, 1);
});

test('lethality table: basics die in 1-2 good hits, warden 2-3, exceptions have a weak point; catalog matches', () => {
  for (const type of ['chaser', 'gunner', 'sniper', 'guard', 'riot', 'brute']) assert.equal(ENEMY_TYPES[type].hp, LETHALITY[type].hp, type);
  // "fitting gun": a mid-damage sidearm/SMG-class hit (25+) or heavier
  const fitting = GUNS.filter(g => g.damage >= 25 && g.category !== 'SHOTGUN');
  assert.ok(fitting.length >= 6);
  for (const g of fitting) for (const t of ['chaser', 'gunner', 'sniper']) assert.ok(hitsToKill(ENEMY_TYPES[t].hp, g.damage) <= 2, `${g.id} vs ${t}`);
  for (const g of fitting.filter(g => g.damage >= 28)) assert.ok(hitsToKill(ENEMY_TYPES.guard.hp, g.damage) <= 3, `${g.id} vs warden`);
  assert.ok(hitsToKill(ENEMY_TYPES.guard.hp, 41) >= 2);
  // weak points halve the work
  assert.ok(hitsToKill(ENEMY_TYPES.riot.hp, 41, 2) <= 2);
  assert.ok(hitsToKill(ENEMY_TYPES.brute.hp, 41, 2) < hitsToKill(ENEMY_TYPES.brute.hp, 41, 1));
  // player: three hits, armor is exactly one extra
  assert.equal(PLAYER.baseHealth, 3);
  assert.equal(GEAR.find(g => g.id === 'armor').armorDurability, PLAYER.armorHits);
  for (const t of ['chaser', 'gunner', 'riot', 'guard']) assert.ok(ENEMY_TYPES[t].damage <= 1, t);
});

test('deterministic dodge rule', () => {
  const base = {type: 'gunner', aware: true, sees: true, facing: {x: -1, y: 0}, shotDir: {x: 1, y: 0}, timeToImpact: 0.2};
  assert.equal(shouldDodge(base), true);
  assert.equal(shouldDodge(base), shouldDodge({...base}));   // same input, same answer
  for (const patch of [{aware: false}, {sees: false}, {windup: 0.2}, {stun: 0.2}, {reaction: 0.1}, {cooldown: 1}, {timeToImpact: 0.02}, {shotDir: {x: -1, y: 0}}, {type: 'brute'}, {type: 'riot'}, {type: 'sniper'}]) {
    assert.equal(shouldDodge({...base, ...patch}), false, JSON.stringify(patch));
  }
});

test('death cause reasons', () => {
  assert.equal(deathCause({name: 'MARKSMAN', type: 'sniper'}), 'KILLED BY MARKSMAN · STOOD IN A LANE');
  assert.equal(deathCause({name: 'GUNNER', type: 'gunner', spotted: true}), 'KILLED BY GUNNER · SEEN BY GUNNER');
  assert.equal(deathCause({name: 'GUNNER', type: 'gunner'}), 'KILLED BY GUNNER · TOOK A STRAIGHT SHOT');
  assert.match(deathCause({name: 'a frag grenade', kind: 'blast', type: 'frag'}), /CAUGHT IN BLAST/);
  assert.match(deathCause({name: 'RUSHER', kind: 'melee', type: 'chaser'}), /LUNGE/);
});

// ---- brain integration: unaware enemies use a cone, not 360 sight
const TILE = 32;
const room = Array.from({length: 12}, (_, y) => (y === 0 || y === 11 ? '#'.repeat(30) : '#' + '.'.repeat(28) + '#'));
function setup(posture, playerAt) {
  const solid = room.map(r => [...r].map(c => (c === '#' ? 1 : 0)));
  const nav = createNav(solid.map(r => r.map(v => v)), solid);
  const los = (ax, ay, bx, by) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 6); for (let i = 1; i < n; i++) { const t = i / n; if (solid[Math.floor((ay + (by - ay) * t) / TILE)]?.[Math.floor((ax + (bx - ax) * t) / TILE)]) return false; } return true; };
  const e = {id: 5, type: 'gunner', def: {brain: 'shoot', speed: 40, minRange: 105, range: 300, projectileSpeed: 190}, x: 15 * TILE, y: 5 * TILE, radius: 8, hp: 40, maxHp: 40, alive: true, stun: 0, reloadTimer: 0, ammo: 5, mag: 5, roomIndex: 0,
    posture, post: {home: {x: 15 * TILE, y: 5 * TILE}, base: {x: 1, y: 0}}, face: {x: 1, y: 0}};
  const world = {nav, los, player: {x: playerAt.x * TILE, y: playerAt.y * TILE, vx: 0, vy: 0, radius: 8}, enemies: [e], projectiles: [], noises: [], smoke: []};
  return {e, world};
}
const run = (e, world, sec, dt = 0.05) => { let out; for (let t = 0; t < sec; t += dt) out = stepEnemyBrain(e, world, dt, () => 0.5); return out; };

test('unaware guard ignores a player behind it but notices one in its cone after a beat of suspicion', () => {
  const behind = setup('guard', {x: 8, y: 5});
  run(behind.e, behind.world, 3);
  assert.equal(behind.e.ai.aware, false);
  assert.equal(behind.e.ai.suspicion, 0);
  const front = setup('guard', {x: 22, y: 5});
  const out1 = run(front.e, front.world, 0.3);
  assert.ok(out1.suspicion > 0 && out1.suspicion < 1 && !out1.aware, 'suspicion builds first');
  const out2 = run(front.e, front.world, 2);
  assert.ok(out2.aware && out2.spotted);
});

test('smoke blocks the cone, sleepers do not see you, noise wakes sleepers in range only', () => {
  const sm = setup('guard', {x: 22, y: 5}); sm.world.smoke = [{x: 18 * TILE, y: 5 * TILE, radius: 40}];
  run(sm.e, sm.world, 3); assert.equal(sm.e.ai.aware, false);
  const sl = setup('sleep', {x: 22, y: 5});
  run(sl.e, sl.world, 3); assert.equal(sl.e.ai.aware, false);
  const near = setup('sleep', {x: 3, y: 9}); near.world.noises = [{x: 15 * TILE + 100, y: 5 * TILE, radius: 380}];
  run(near.e, near.world, 0.1); assert.equal(near.e.ai.aware, true); assert.equal(near.e.posture, 'guard');
  const far = setup('sleep', {x: 3, y: 9}); far.world.noises = [{x: 15 * TILE + 360, y: 5 * TILE, radius: 380}];
  run(far.e, far.world, 0.1); assert.equal(far.e.ai.aware, false, 'sleepers hear only 70% of the ring');
});

test('patrol walks its route; alert propagation is reported for the renderer', () => {
  const pt = setup('patrol', {x: 3, y: 9});
  pt.e.post.route = [{x: 15 * TILE, y: 5 * TILE}, {x: 15 * TILE, y: 8 * TILE}];
  const start = {x: pt.e.x, y: pt.e.y};
  for (let i = 0; i < 100; i++) { const out = stepEnemyBrain(pt.e, pt.world, 0.05, () => 0.5); pt.e.x += out.moveX * pt.e.def.speed * 0.05; pt.e.y += out.moveY * pt.e.def.speed * 0.05; pt.e.face = {x: out.aimX, y: out.aimY}; }
  assert.ok(Math.hypot(pt.e.x - start.x, pt.e.y - start.y) > 20, 'moved along the route');
  const a = setup('guard', {x: 22, y: 5});
  const mate = {...a.e, id: 6, x: 18 * TILE, posture: 'sleep', post: {home: {x: 18 * TILE, y: 5 * TILE}, base: {x: 1, y: 0}}, ai: undefined};
  a.world.enemies = [a.e, mate]; a.world.alerts = [];
  run(a.e, a.world, 2);
  assert.ok(a.world.alerts.some(x => x.from === a.e && x.to === mate));
});
