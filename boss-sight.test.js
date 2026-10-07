import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS, SIGHT_LOST_REPOSITION, LOB_AFTER, activateBoss, createBoss, sightAction, chargeLane, stepBoss} from './boss.js';

const ctxAt = (player, extra = {}) => ({boss: {x: 0, y: 0}, player, hpFraction: .2, adds: 0, rng: () => .3, ...extra});
const idleBoss = () => { const b = createBoss(); activateBoss(b); b.mode = 'idle'; b.t = 0; b.invuln = false; b.phase = 3; b.patternIndex = 0; return b; };

test('sightAction escalates fight -> reposition -> lob', () => {
  assert.equal(sightAction(0), 'fight');
  assert.equal(sightAction(SIGHT_LOST_REPOSITION - .01), 'fight');
  assert.equal(sightAction(SIGHT_LOST_REPOSITION), 'reposition');
  assert.equal(sightAction(LOB_AFTER), 'lob');
});

test('hidden behind cover: he still fights for a few seconds, then walks the seek path instead of firing', () => {
  const b = idleBoss(); b.t = 99;
  for (let t = 0; t < 3.5; t += .1) stepBoss(b, .1, ctxAt({x: 200, y: 0}, {los: false, seek: {x: 0, y: 100}}));
  assert.ok(b.sightLost > 3 && b.sightLost < SIGHT_LOST_REPOSITION);
  const c = idleBoss(); c.sightLost = SIGHT_LOST_REPOSITION + .1;
  const out = stepBoss(c, .1, ctxAt({x: 200, y: 0}, {los: false, seek: {x: 0, y: 100}}));
  assert.equal(c.mode, 'idle', 'no pattern while repositioning');
  assert.ok(out.move.y > BOSS.repositionSpeed * .99 && Math.abs(out.move.x) < 1e-6, 'moves straight along the path');
});

test('sight-lost time counts real seconds, so standing still does not stretch the wait', () => {
  const b = idleBoss(); b.t = 5;
  for (let i = 0; i < 20; i++) stepBoss(b, .01, ctxAt({x: 200, y: 0}, {los: false, realDt: .2}));
  assert.ok(b.sightLost >= 3.9 && b.sightLost <= 4.1);
});

test('regaining line of sight resets the timer and he fights again', () => {
  const b = idleBoss(); b.sightLost = 6;
  stepBoss(b, .1, ctxAt({x: 100, y: 0}, {los: true}));
  assert.equal(b.sightLost, 0);
  assert.notEqual(b.mode, 'idle');
});

test('still no line after the reposition window: he lobs a marked burst that rises from the marked spot', () => {
  const b = idleBoss(); b.sightLost = LOB_AFTER + .1;
  stepBoss(b, .1, ctxAt({x: 300, y: 50}, {los: false}));
  assert.equal(b.mode, 'telegraph');
  assert.equal(b.pattern, 'lob');
  assert.deepEqual(b.lobAt, {x: 300, y: 50});
  let fired = null;
  for (let i = 0; i < 80 && !fired; i++) {
    const out = stepBoss(b, .05, ctxAt({x: 500, y: 400}, {los: false}));
    fired = out.actions.find(a => a.type === 'bullets');
    if (!fired && b.telegraph && b.t < .5) assert.equal(b.telegraph.locked, true);
  }
  assert.ok(fired?.from, 'burst carries its origin');
  assert.ok(Math.hypot(fired.from.x - 300, fired.from.y - 50) > 1, 'marker tracked the player until it locked');
  assert.ok(fired.shots.length >= 7 && fired.shots.length <= 9);
  assert.equal(b.sightLost, SIGHT_LOST_REPOSITION, 'next lob only after another few seconds');
});

test('charge: the aim locks early (a real dodge window) and the drawn lane is the hit width', () => {
  const c = idleBoss(); c.patternIndex = 2; // phase III list: beat, ring, charge
  stepBoss(c, .01, ctxAt({x: 200, y: 0}));
  assert.equal(c.pattern, 'charge');
  let lockedLeft = null, ang = null;
  const px = {x: 200, y: 0};
  while (c.mode === 'telegraph') {
    stepBoss(c, .02, ctxAt({...px}));
    if (c.telegraph?.locked && lockedLeft === null) { lockedLeft = c.t; ang = c.angle; }
    if (lockedLeft !== null) px.y += 6; // the player sidesteps after the lock: the line must not follow
  }
  assert.ok(lockedLeft >= BOSS.chargeLockAt - .03, 'locks the full window before the strike');
  assert.equal(c.angle, ang);
  assert.equal(c.mode, 'charge');
  assert.equal(chargeLane(c).halfWidth, BOSS.chargeHitRadius);
  assert.ok(BOSS.chargeLockAt >= .6, 'enough time to sidestep a lane at walking speed');
});
