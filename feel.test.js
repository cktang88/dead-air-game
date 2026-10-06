import test from 'node:test';
import assert from 'node:assert/strict';
import {GUNS} from './catalog.js';
import {timeScale, segmentBlockedTiles} from './rules.js';
import {EVENT_CAP, addRecoil, approach, clipBlockedVelocity, cornerNudge, easeTimeScale, effectiveSpread, enemyKnockback, fanAngles, gunFeel, hitstopFor, loadoutMobility, muzzlePoint, newBloom, nextFireTime, pushEvent, registerShot, reloadTime, stepBloom, stepRecoil, stepVelocity} from './feel.js';

const run = {topSpeed: 100};
const speed = v => Math.hypot(v.x, v.y);

test('velocity accelerates quickly toward top speed and coasts to rest', () => {
  let v = {x: 0, y: 0};
  for (let i = 0; i < 6; i++) v = stepVelocity(v, {x: 1, y: 0}, run, 1 / 60);
  assert.ok(v.x > 70 && v.x < 100, `6 frames reach most of top speed (${v.x})`);
  for (let i = 0; i < 40; i++) v = stepVelocity(v, {x: 1, y: 0}, run, 1 / 60);
  assert.ok(Math.abs(v.x - 100) < .5);
  for (let i = 0; i < 3; i++) v = stepVelocity(v, {x: 0, y: 0}, run, 1 / 60);
  assert.ok(v.x > 10 && v.x < 70, 'friction is short but not instant');
  for (let i = 0; i < 60; i++) v = stepVelocity(v, {x: 0, y: 0}, run, 1 / 60);
  assert.ok(v.x < 0.1);
});

test('diagonal input is normalised and reversing bites harder', () => {
  let v = {x: 0, y: 0};
  for (let i = 0; i < 90; i++) v = stepVelocity(v, {x: 1, y: 1}, run, 1 / 60);
  assert.ok(Math.abs(speed(v) - 100) < .5, 'diagonal is not faster');
  const slow = stepVelocity({x: 100, y: 0}, {x: 1, y: 0}, run, 1 / 60);
  const turned = stepVelocity({x: 100, y: 0}, {x: -1, y: 0}, run, 1 / 60);
  assert.ok(Math.abs(turned.x - 100) > Math.abs(slow.x - 100) * 0 + 40, 'reversal changes velocity fast');
});

test('velocity step is frame-rate independent', () => {
  let a = {x: 0, y: 0}, b = {x: 0, y: 0};
  for (let i = 0; i < 12; i++) a = stepVelocity(a, {x: 1, y: 0}, run, 1 / 120);
  for (let i = 0; i < 6; i++) b = stepVelocity(b, {x: 1, y: 0}, run, 1 / 60);
  assert.ok(Math.abs(a.x - b.x) < 1e-6);
});

test('heavier loadouts are a little slower and slower to accelerate', () => {
  const light = loadoutMobility(1, 7), heavy = loadoutMobility(7, 7), over = loadoutMobility(99, 7);
  assert.ok(heavy.speedMul < light.speedMul && heavy.accelMul < light.accelMul);
  assert.ok(heavy.speedMul > .9, 'weight is a nuance, not a punishment');
  assert.equal(over.load, 1.25);
  assert.equal(loadoutMobility(NaN, 0).speedMul, 1);
});

test('blocked motion drops velocity so you do not wind up against walls', () => {
  const v = clipBlockedVelocity({x: 100, y: 50}, {x: 0, y: 0.8}, {x: 1.6, y: 0.8}, 1 / 60);
  assert.equal(v.x, 0);
  assert.equal(v.y, 50);
  assert.deepEqual(clipBlockedVelocity({x: 10, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}, 0), {x: 10, y: 0}, 'no physics step, no clip');
});

test('corner nudge only fires when pinned on a diagonal', () => {
  assert.deepEqual(cornerNudge({x: 1, y: 0}, 0, 100), {x: 0, y: 0});
  assert.deepEqual(cornerNudge({x: .7, y: .7}, 1, 100), {x: 0, y: 0});
  const n = cornerNudge({x: .7071, y: .7071}, 0, 100);
  assert.ok(n.x < 0 && n.y > 0, 'perpendicular to wish');
  const flipped = cornerNudge({x: .7071, y: .7071}, 0, 100, -1);
  assert.ok(flipped.x > 0 && flipped.y < 0);
});

test('time scale eases over about a tenth of a second and keeps the documented rules', () => {
  assert.equal(timeScale({mode: 'play', paused: false, loadoutOpen: false, speedRatio: 0}), .08);
  let s = .08;
  for (let i = 0; i < 4; i++) s = easeTimeScale(s, 1, 1 / 60);
  assert.ok(s > .85 && s < 1, `moving ramps up (${s})`);
  for (let i = 0; i < 8; i++) s = easeTimeScale(s, .08, 1 / 60);
  assert.ok(s < .3 && s >= .08, `still ramps down (${s})`);
  for (let i = 0; i < 60; i++) s = easeTimeScale(s, .08, 1 / 60);
  assert.equal(s, .08);
  assert.equal(easeTimeScale(.7, 0, 1 / 60), 0, 'pause snaps');
  assert.equal(easeTimeScale(undefined, .5, 1 / 60), .5);
  const mid = easeTimeScale(.08, 1, 1 / 60);
  assert.ok(mid > .08 && mid < 1, 'never jumps in a single frame');
});

test('bloom builds with sustained fire, holds while firing, and recovers', () => {
  const gun = GUNS.find(g => g.id === 'machine'), feel = gunFeel(gun), b = newBloom();
  assert.ok(feel.settle >= gun.rate, 'settle covers the gun cadence');
  assert.equal(registerShot(b, feel), true, 'first shot of a settled gun');
  const first = effectiveSpread(gun.spread, b, feel, 0, true);
  for (let i = 0; i < 8; i++) { stepBloom(b, gun.rate, feel); registerShot(b, feel); }
  const sustained = effectiveSpread(gun.spread, b, feel, 0, false);
  assert.ok(b.value > .8);
  assert.ok(sustained > first * 2.5, `sustained spread is far wider than the first shot (${first} -> ${sustained})`);
  for (let i = 0; i < 90; i++) stepBloom(b, 1 / 60, feel);
  assert.equal(b.value, 0);
  assert.equal(registerShot(b, feel), true, 'accuracy is back after a pause');
});

test('STEADY guns do not widen while walking; every other family does', () => {
  const b = newBloom();
  for (const id of ['ar_ash', 'rifle', 'ar_bastion']) {
    const feel = gunFeel(GUNS.find(g => g.id === id));
    assert.equal(effectiveSpread(.02, b, feel, 1), effectiveSpread(.02, b, feel, 0), `${id} is steady on the move`);
  }
  for (const id of ['machine', 'smg_burst', 'pistol_45', 'shotgun', 'sniper_lynx']) {
    const feel = gunFeel(GUNS.find(g => g.id === id));
    assert.ok(effectiveSpread(.02, b, feel, 1) > effectiveSpread(.02, b, feel, 0), `${id} widens on the move`);
  }
});

test('moving widens spread and the first shot is tighter than a bloomed one', () => {
  const feel = gunFeel(GUNS.find(g => g.id === 'machine')), b = newBloom();
  const still = effectiveSpread(.02, b, feel, 0), moving = effectiveSpread(.02, b, feel, 1);
  assert.ok(moving > still);
  assert.ok(effectiveSpread(.02, b, feel, 0, true) < still);
});

test('every catalog gun has sane feel numbers', () => {
  for (const gun of GUNS) {
    const f = gunFeel(gun);
    for (const key of ['perShot', 'settle', 'recover', 'bloomMul', 'kick', 'shake', 'nudge', 'firstMul']) assert.ok(Number.isFinite(f[key]) && f[key] >= 0, `${gun.id}.${key}`);
    assert.ok(f.firstMul <= 1);
  }
  const shotgun = gunFeel(GUNS.find(g => g.id === 'shotgun')), pistol = gunFeel(GUNS.find(g => g.id === 'pistol_9'));
  assert.ok(shotgun.kick > pistol.kick && shotgun.nudge > pistol.nudge);
});

test('pellets form an even fan around the aim', () => {
  const angles = fanAngles(1, 9, .4);
  assert.equal(angles.length, 9);
  assert.ok(Math.abs(angles[0] - .8) < 1e-9 && Math.abs(angles[8] - 1.2) < 1e-9);
  const gaps = angles.slice(1).map((a, i) => a - angles[i]);
  for (const g of gaps) assert.ok(Math.abs(g - .05) < 1e-9);
  assert.deepEqual(fanAngles(2, 1, .4, .1), [2.1]);
  assert.ok(Math.abs(fanAngles(0, 5, .3, .05)[2] - .05) < 1e-9, 'jitter shifts the whole fan');
});

test('muzzle sits beyond the shooter along the aim, longer guns reach further', () => {
  const short = GUNS.find(g => g.id === 'pistol_9'), long = GUNS.find(g => g.id === 'sniper_mule');
  const a = muzzlePoint(10, 20, 1, 0, short), c = muzzlePoint(10, 20, 1, 0, long);
  assert.ok(a.x > 10 && a.y === 20 && c.x > a.x);
});

test('fire cadence keeps the gun rate across frame quantisation', () => {
  const rate = .105, step = 1 / 60;
  let next = 0, now = 0, shots = 0;
  for (let i = 0; i < 600; i++) {
    now = i * step;
    if (now >= next) { next = nextFireTime(now, next, rate, step); shots++; }
  }
  assert.ok(Math.abs(shots - 10 / rate) <= 2, `${shots} shots in 10s`);
});

test('recoil decays and stacks to a cap', () => {
  let r = {x: 0, y: 0, amount: 0};
  for (let i = 0; i < 6; i++) r = addRecoil(r, 1, 0, .7);
  assert.ok(r.amount <= 2 && r.x < 0);
  r = stepRecoil(r, .5);
  assert.ok(r.amount < .01);
});

test('knockback scales with damage and brutes resist; hitstop is tiny on hits, bigger on kills', () => {
  assert.ok(enemyKnockback(80, 'gunner') > enemyKnockback(17, 'gunner'));
  assert.ok(enemyKnockback(40, 'brute') < enemyKnockback(40, 'chaser'));
  assert.ok(enemyKnockback(1000, 'chaser') <= 260);
  assert.ok(hitstopFor({damage: 20}) < .03);
  assert.ok(hitstopFor({kill: true, damage: 20}) > hitstopFor({damage: 20}) * 2);
  assert.ok(hitstopFor({kill: true, damage: 150}) > hitstopFor({kill: true, damage: 10}));
  assert.ok(hitstopFor({kill: true, damage: 150}) <= .09);
});

test('empty reloads take longer than tactical reloads', () => {
  assert.ok(reloadTime(2, 0) > reloadTime(2, 3));
  assert.equal(reloadTime(2, 0), 2);
});

test('exact tile traversal never skips a clipped corner', () => {
  const map = Array.from({length: 4}, () => Array(4).fill(0)); map[1][1] = 1;
  // Grazes only the corner of tile (1,1) at (32,32) with 32px tiles.
  const hits = segmentBlockedTiles({x: 20, y: 45}, {x: 45, y: 20}, map, 32);
  assert.deepEqual(hits.map(h => [h.x, h.y]), [[1, 1]]);
  assert.ok(hits[0].t >= 0 && hits[0].t <= 1);
  // A single huge step crosses three tiles in order.
  const wall = Array.from({length: 3}, () => Array(8).fill(0)); wall[1][3] = 1;
  assert.deepEqual(segmentBlockedTiles({x: 5, y: 48}, {x: 250, y: 48}, wall, 32).map(h => h.x), [3]);
});

test('event queue is capped so an unconsumed queue cannot grow forever', () => {
  const events = [];
  for (let i = 0; i < EVENT_CAP + 50; i++) pushEvent(events, {type: 'shot', i});
  assert.equal(events.length, EVENT_CAP);
  assert.equal(events[0].i, 50);
});

test('approach converges without overshoot', () => {
  assert.ok(approach(10, 0, 50, 1) < .001);
  assert.equal(approach(10, 0, 0, 1), 10);
});
