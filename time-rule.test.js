import test from 'node:test';
import assert from 'node:assert/strict';
import {TIME_RULE, speedTimeScale, timeScale, timeBand, shotBeat, drainBeat, addBeat, sprintNoiseStep, rateLabel} from './time-rule.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ~ ${b}`);

test('time scale follows speed: still / walk / sprint anchors', () => {
  near(speedTimeScale(0), 0.08);
  near(speedTimeScale(1), 0.35);
  near(speedTimeScale(TIME_RULE.sprintRatio), 1);
  near(speedTimeScale(5), 1, 1e-9);
  near(speedTimeScale(NaN), 0.08);
});

test('time scale is monotonic and continuous in speed', () => {
  let prev = -1;
  for (let r = 0; r <= 1.6; r += 0.01) { const s = speedTimeScale(r); assert.ok(s >= prev - 1e-12); prev = s; }
  assert.ok(speedTimeScale(0.5) > 0.08 && speedTimeScale(0.5) < 0.35);
  assert.ok(speedTimeScale(1.2) > 0.35 && speedTimeScale(1.2) < 1);
});

test('dead zone treats a coast tail or wall push as still', () => {
  near(speedTimeScale(0.03), 0.08);
});

test('STILL MIND lowers the still floor and is clamped under the walk rate', () => {
  near(speedTimeScale(0, {stillScale: 0.05}), 0.05);
  near(speedTimeScale(0, {stillScale: 0.9}), 0.35);
  near(speedTimeScale(1, {stillScale: 0.05}), 0.35);
});

test('timeScale: paused, menus and non-play modes freeze the world', () => {
  const base = {mode: 'play', paused: false, loadoutOpen: false, speedRatio: 0};
  near(timeScale(base), 0.08);
  assert.equal(timeScale({...base, paused: true}), 0);
  assert.equal(timeScale({...base, loadoutOpen: true}), 0);
  assert.equal(timeScale({...base, mode: 'dead'}), 0);
  near(timeScale({...base, speedRatio: TIME_RULE.sprintRatio}), 1);
  near(timeScale({...base, idleScale: 0.05}), 0.05);
});

test('timeBand names still, walk and sprint', () => {
  assert.equal(timeBand(0), 'still');
  assert.equal(timeBand(1), 'walk');
  assert.equal(timeBand(1.45), 'sprint');
});

test('shot beat: heavy deliberate shot costs more, SMG spray is a sliver, always clamped', () => {
  const pistol = shotBeat({damage: 43, fireInterval: 0.48});
  const smg = shotBeat({damage: 17, fireInterval: 0.105});
  const sniper = shotBeat({damage: 150, fireInterval: 1.45});
  assert.ok(pistol > smg * 1.5, 'a heavy pistol round costs more than an SMG round');
  assert.ok(smg >= TIME_RULE.beat.min && smg < 0.06);
  assert.ok(sniper <= TIME_RULE.beat.max);
  assert.ok(smg / 0.105 < 0.6, 'a spraying SMG flows well under 1x');
  assert.ok(shotBeat({damage: 17, fireInterval: 0.58, pellets: 5}) > shotBeat({damage: 17, fireInterval: 0.58}));
});

test('beat bank delivers world time at 1x without overshoot', () => {
  let bank = addBeat(0, 0.12);
  let delivered = 0;
  for (let i = 0; i < 20; i++) { const r = drainBeat(bank, 1 / 60, 0.08); bank = r.bank; delivered += r.extra; }
  near(delivered, 0.12 * (1 - 0.08), 1e-9);
  near(bank, 0);
  assert.equal(addBeat(0.4, 1), TIME_RULE.beat.cap);
  assert.equal(drainBeat(0.1, 1 / 60, 1).extra, 0);
});

test('sprint noise pings only at sprint speed, on an interval', () => {
  let t = 0, pings = 0;
  for (let i = 0; i < 120; i++) { const r = sprintNoiseStep(t, 1 / 60, TIME_RULE.sprintRatio); t = r.timer; if (r.noise) { pings++; assert.equal(r.noise.radius, TIME_RULE.sprintNoise.radius); } }
  assert.ok(pings >= 5 && pings <= 7, `pings=${pings}`);
  t = 0; pings = 0;
  for (let i = 0; i < 120; i++) { const r = sprintNoiseStep(t, 1 / 60, 1); t = r.timer; if (r.noise) pings++; }
  assert.equal(pings, 0, 'walking is quiet');
});

test('rateLabel', () => { assert.equal(rateLabel(0.08), '0.08×'); assert.equal(rateLabel(1), '1.00×'); });

import {PLAYER_BULLET_CLOCK, playerBulletDt} from './time-rule.js';
test('player bullets ride world time but never slower than the minimum visible flight rate', () => {
  const dt = 1 / 60;
  assert.equal(playerBulletDt(dt * 0.08, dt, {mode: 'real', minRate: 0.4}), dt);
  assert.equal(playerBulletDt(dt * 0.08, dt, {mode: 'world', minRate: 0.4}), dt * 0.4);
  assert.equal(playerBulletDt(dt, dt, {mode: 'world', minRate: 0.4}), dt, 'at full rate the bullet is untouched');
  assert.equal(playerBulletDt(dt * 0.6, dt, {mode: 'world', minRate: 0.4}), dt * 0.6, 'faster world time wins over the floor');
  assert.equal(PLAYER_BULLET_CLOCK.mode, 'world');
  assert.ok(PLAYER_BULLET_CLOCK.minRate > 0.2 && PLAYER_BULLET_CLOCK.minRate < 1);
});
