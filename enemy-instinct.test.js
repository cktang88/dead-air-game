import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTINCT, aimLineOffset, fallenAllies, hazardEscape, inAimLine, laneAvoidCircles, lineSidestep, moraleReaction,
  pincerAngle, playerOpening, rallyPoint, shouldWaitForPack, wantsRetreat, wrapAngle,
} from './enemy-instinct.js';

const P = {x: 100, y: 100};
const EAST = {x: 1, y: 0};

test('aimLineOffset splits a point into distance down the ray and signed offset across it', () => {
  const o = aimLineOffset(P, EAST, {x: 300, y: 130});
  assert.equal(o.along, 200);
  assert.equal(o.across, 30);
  assert.equal(aimLineOffset(P, EAST, {x: 300, y: 70}).across, -30);
});

test('inAimLine: in front, close to the ray, within reach', () => {
  assert.equal(inAimLine(P, EAST, {x: 300, y: 105}), true);
  assert.equal(inAimLine(P, EAST, {x: 300, y: 160}), false, 'well off the ray');
  assert.equal(inAimLine(P, EAST, {x: 20, y: 100}), false, 'behind the shooter');
  assert.equal(inAimLine(P, EAST, {x: 100 + INSTINCT.lineReach + 40, y: 100}), false, 'out of reach');
  assert.equal(inAimLine(P, EAST, {x: 300, y: 100 + INSTINCT.lineWidth + 8}), true, 'body radius widens the lane');
  assert.equal(inAimLine(P, {x: 0, y: 0}, {x: 300, y: 100}), false, 'no aim, no lane');
});

test('lineSidestep leaves the lane perpendicular, on the side the enemy is already on', () => {
  const below = lineSidestep(P, EAST, {x: 300, y: 110});   // y grows downward: this enemy is on the +y side
  assert.ok(Math.abs(below.x) < 1e-9 && below.y > 0.99);
  const above = lineSidestep(P, EAST, {x: 300, y: 90});
  assert.ok(above.y < -0.99);
  const centred = lineSidestep(P, EAST, {x: 300, y: 100}, -1);
  assert.ok(centred.y < -0.99, 'dead centre follows the preferred side');
  assert.ok(lineSidestep(P, EAST, {x: 300, y: 100}, 1).y > 0.99);
});

test('laneAvoidCircles lay a cost trail down the aim, capped', () => {
  const c = laneAvoidCircles(P, EAST);
  assert.ok(c.length >= 3 && c.length <= 5);
  assert.ok(c.every((x, i) => x.y === 100 && (i === 0 || x.x > c[i - 1].x)));
  assert.deepEqual(laneAvoidCircles(P, {x: 0, y: 0}), []);
});

test('hazardEscape ignores far hazards and a grenade with a long fuse', () => {
  const frag = {x: 200, y: 200, radius: 70};
  assert.equal(hazardEscape({x: 600, y: 600}, [{...frag}]), null);
  assert.equal(hazardEscape({x: 210, y: 200}, [{...frag, fuse: INSTINCT.fuseWarn + 0.5}]), null, 'not lit long enough to matter yet');
  assert.ok(hazardEscape({x: 210, y: 200}, [{...frag, fuse: 0.6}]));
});

test('hazardEscape runs radially away, and turns when the straight route is walled', () => {
  const frag = {x: 200, y: 200, radius: 70, fuse: 0.5};
  const esc = hazardEscape({x: 230, y: 200}, [frag]);
  assert.ok(esc.dir.x > 0.99, 'away from the blast');
  assert.ok(esc.urgency > 0 && esc.urgency <= 1);
  const wallEast = hazardEscape({x: 230, y: 200}, [frag], {canStep: d => d.x < 0.3});
  assert.ok(wallEast.dir.x < 0.3 && Math.abs(wallEast.dir.y) > 0.5, 'slides along the wall instead of into it');
});

test('hazardEscape picks the deepest hazard and always gives a direction', () => {
  const a = {x: 200, y: 200, radius: 60}, b = {x: 400, y: 200, radius: 60};
  const esc = hazardEscape({x: 380, y: 200}, [a, b]);
  assert.equal(esc.hazard, b);
  assert.ok(hazardEscape({x: 200, y: 200}, [a]).dir, 'standing exactly on the centre still picks a way out');
  assert.ok(hazardEscape({x: 230, y: 200}, [a], {canStep: () => false}).dir, 'boxed in: still returns the radial direction');
});

test('playerOpening: reload beats hurt, healthy and loaded is no opening', () => {
  assert.equal(playerOpening({reloading: true, hpFrac: 0.1}), 'reload');
  assert.equal(playerOpening({reloading: false, hpFrac: INSTINCT.playerHurtHp}), 'hurt');
  assert.equal(playerOpening({reloading: false, hpFrac: 0.9}), null);
  assert.equal(playerOpening(), null);
});

test('wantsRetreat has hysteresis around 40%', () => {
  assert.equal(wantsRetreat(0.41, false), false);
  assert.equal(wantsRetreat(0.4, false), true);
  assert.equal(wantsRetreat(0.5, true), true, 'keeps hiding until recovered');
  assert.equal(wantsRetreat(INSTINCT.recoverHp, true), false);
});

test('rallyPoint falls back to a healthy ally that is not closer to the threat', () => {
  const me = {x: 100, y: 100, hp: 10, maxHp: 50}, threat = {x: 500, y: 100};
  const behind = {x: 40, y: 100, hp: 50, maxHp: 50}, front = {x: 200, y: 100, hp: 50, maxHp: 50};
  const hurtMate = {x: 60, y: 140, hp: 10, maxHp: 50}, dead = {x: 70, y: 100, hp: 50, maxHp: 50, alive: false};
  assert.deepEqual(rallyPoint(me, [me, front, hurtMate, dead], threat), null, 'ally in front, hurt ally, dead ally: none qualify');
  assert.deepEqual(rallyPoint(me, [me, front, behind], threat), {x: 40, y: 100});
  assert.equal(rallyPoint(me, [{x: 900, y: 900, hp: 50, maxHp: 50}], threat), null, 'too far away to rally on');
});

test('fallenAllies reports ids that disappeared', () => {
  assert.deepEqual(fallenAllies(new Set([1, 2, 3]), [1, 3, 9]), [2]);
  assert.deepEqual(fallenAllies(new Set(), [1]), []);
});

test('moraleReaction: brutes enrage, shooters get shaken, rushers carry on', () => {
  assert.equal(moraleReaction('brute').kind, 'enrage');
  assert.equal(moraleReaction('gunner').kind, 'shaken');
  assert.equal(moraleReaction('sniper').kind, 'shaken');
  assert.equal(moraleReaction('chaser').kind, 'none');
  assert.equal(moraleReaction('riot').kind, 'none');
});

test('shouldWaitForPack: only when a mate trails far behind and we are still out in the open', () => {
  const target = {x: 0, y: 0}, me = {x: 300, y: 0};
  assert.equal(shouldWaitForPack(me, [{x: 520, y: 0}], target), true, 'mate 220 px farther back');
  assert.equal(shouldWaitForPack(me, [{x: 380, y: 0}], target), false, 'mate is close enough');
  assert.equal(shouldWaitForPack(me, [{x: 900, y: 0}], target), false, 'too far away to be part of this pack');
  assert.equal(shouldWaitForPack({x: 100, y: 0}, [{x: 400, y: 0}], target), false, 'already committed');
  assert.equal(shouldWaitForPack(me, [me], target), false, 'ourselves do not count');
});

test('pincerAngle sends successive flankers to opposite sides of the suppressor bearing', () => {
  const a0 = pincerAngle(0, 0, 2), a1 = pincerAngle(0, 1, 2);
  assert.ok(a0 > 1 && a1 < -1, 'one each side');
  assert.ok(Math.abs(wrapAngle(a0 - a1)) > 2.2, 'wide pincer, not a pair on one flank');
  assert.ok(Math.abs(pincerAngle(0, 0, 1)) > 1);
  assert.ok(Math.abs(pincerAngle(0, 2, 4)) > Math.abs(pincerAngle(0, 0, 4)), 'a third flanker fans out further');
});

test('wrapAngle folds into (-PI, PI]', () => {
  assert.ok(Math.abs(wrapAngle(3 * Math.PI) - Math.PI) < 1e-9 || Math.abs(wrapAngle(3 * Math.PI) + Math.PI) < 1e-9);
  assert.ok(Math.abs(wrapAngle(-0.5) + 0.5) < 1e-9);
});
