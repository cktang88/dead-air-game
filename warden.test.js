import test from 'node:test';
import assert from 'node:assert/strict';
import {WARDEN, stepWarden, wardenClock, wardenState} from './warden.js';

const run = (w, secs, view, dt = 1 / 60) => { let shots = 0; for (let t = 0; t < secs; t += dt) { if (stepWarden(w, {dt, ...view}).fire) shots++; } return shots; };

test('warden fires on a short, steady cadence at a visible player', () => {
  const shots = run(wardenState(), 12, {sees: true, toPlayer: {x: -1, y: 0}});
  assert.ok(shots >= 3 && shots <= 5, `shots ${shots}`);
});
test('the aim follows the player until the lock, then freezes', () => {
  const w = wardenState();
  stepWarden(w, {dt: 0.01, sees: true, toPlayer: {x: -1, y: 0}});
  stepWarden(w, {dt: 0.5, sees: true, toPlayer: {x: 0, y: 1}});
  assert.deepEqual(w.aim, {x: 0, y: 1});
  stepWarden(w, {dt: 1.1, sees: true, toPlayer: {x: 0, y: 1}});
  const o = stepWarden(w, {dt: 0.01, sees: true, toPlayer: {x: 1, y: 0}});
  assert.ok(o.locked);
  assert.deepEqual(w.aim, {x: 0, y: 1});
});
test('cover resets the telegraph and no shot is fired without sight', () => {
  const w = wardenState();
  assert.equal(run(w, 5, {sees: false, toPlayer: null}), 0);
  stepWarden(w, {dt: 0.5, sees: true, toPlayer: {x: -1, y: 0}});
  const o = stepWarden(w, {dt: 0.1, sees: false, toPlayer: null});
  assert.equal(o.aiming, false);
  assert.equal(w.phase, 'idle');
});
test('teaching clock is floored so a still player does not freeze the warden', () => {
  assert.equal(wardenClock(0.08 / 60, 1 / 60), WARDEN.clockFloor / 60);
  assert.equal(wardenClock(1 / 60, 1 / 60), 1 / 60);
  const w = wardenState();
  let t = 0, fired = false;
  while (t < 6 && !fired) { fired = stepWarden(w, {dt: wardenClock(0.08 / 60, 1 / 60), sees: true, toPlayer: {x: -1, y: 0}}).fire; t += 1 / 60; }
  assert.ok(fired && t < 4, `first shot at ${t}`);
});
