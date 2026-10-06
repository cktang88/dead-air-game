import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOVE, shoveTargets, shoveOutcome, isAllDry, shoveReady, dryKillDropsAmmo} from './shove.js';
import {DEFAULT_KEY_BINDINGS, KEY_BINDING_ACTIONS, rebindKey, parseKeyBindings} from './keybindings.js';

const enemy = (x, y, extra = {}) => ({alive: true, x, y, ...extra});

test('shove is a short wedge in front: nearest first, nothing behind, nothing far', () => {
  const player = {x: 0, y: 0}, aim = {x: 1, y: 0};
  const near = enemy(26, 0), side = enemy(22, 20), behind = enemy(-24, 0), far = enemy(90, 0), dead = enemy(20, 0, {alive: false});
  const hit = shoveTargets(player, aim, [far, side, behind, near, dead]);
  assert.deepEqual(hit.map(h => h.enemy), [near, side]);
  assert.ok(Math.abs(hit[0].dir.x - 1) < 1e-9);
  assert.equal(shoveTargets(player, aim, [behind, far]).length, 0);
  assert.ok(shoveTargets(player, aim, Array.from({length: 6}, (_, i) => enemy(24, i - 3))).length <= SHOVE.maxTargets);
});

test('a shove from behind an unaware enemy or a sleeper is a silent takedown (a kill)', () => {
  const dir = {x: 1, y: 0};
  const back = shoveOutcome({type: 'gunner', hp: 40, aware: false, facing: {x: 1, y: 0}, dir});
  assert.equal(back.kind, 'takedown'); assert.equal(back.damage, 40); assert.equal(back.label, 'SILENT TAKEDOWN');
  const sleeper = shoveOutcome({type: 'guard', hp: 60, aware: false, asleep: true, facing: {x: -1, y: 0}, dir});
  assert.equal(sleeper.kind, 'takedown');
  const front = shoveOutcome({type: 'gunner', hp: 40, aware: false, facing: {x: -1, y: 0}, dir});
  assert.equal(front.kind, 'hit', 'face to face is just a shove');
  const aware = shoveOutcome({type: 'gunner', hp: 40, aware: true, facing: {x: 1, y: 0}, dir});
  assert.equal(aware.kind, 'hit');
});

test('a shove staggers, knocks back, and finishes weakened enemies', () => {
  const dir = {x: 1, y: 0};
  const full = shoveOutcome({type: 'gunner', hp: 40, aware: true, facing: {x: -1, y: 0}, dir});
  assert.equal(full.kind, 'hit'); assert.ok(full.stagger > 0.3); assert.ok(full.knock > 100); assert.equal(full.label, '');
  assert.ok(full.damage < 40, 'it does not one-shot a healthy enemy');
  const weak = shoveOutcome({type: 'gunner', hp: SHOVE.damage - 1, aware: true, facing: {x: -1, y: 0}, dir});
  assert.equal(weak.label, 'FINISHED'); assert.ok(weak.damage >= SHOVE.damage - 1);
});

test('heavies shrug it off: no takedown on brutes, riots block the front, flanking a riot hurts, the boss ignores it', () => {
  const dir = {x: 1, y: 0};
  assert.notEqual(shoveOutcome({type: 'brute', hp: 100, aware: false, facing: {x: 1, y: 0}, dir}).kind, 'takedown');
  assert.notEqual(shoveOutcome({type: 'gunner', hp: 100, aware: false, elite: true, facing: {x: 1, y: 0}, dir}).kind, 'takedown');
  assert.equal(shoveOutcome({type: 'riot', hp: 70, aware: true, facing: {x: -1, y: 0}, shieldFacing: {x: -1, y: 0}, dir}).kind, 'blocked');
  assert.equal(shoveOutcome({type: 'riot', hp: 70, aware: true, facing: {x: 1, y: 0}, shieldFacing: {x: 1, y: 0}, dir}).label, 'FLANK');
  assert.equal(shoveOutcome({type: 'boss', hp: 900, aware: true, dir}).kind, 'ignored');
  const brute = shoveOutcome({type: 'brute', hp: 100, aware: true, facing: {x: -1, y: 0}, dir});
  assert.ok(brute.knock < SHOVE.knock && brute.damage < SHOVE.damage);
});

test('cooldown gates repeated shoves', () => {
  assert.equal(shoveReady(1, 1.2), false);
  assert.equal(shoveReady(1.2, 1.2), true);
  assert.ok(SHOVE.cooldown >= 0.4 && SHOVE.cooldown <= 1.2);
});

test('both guns at 0/0 is dry; any rounds anywhere is not, and the next kill drops ammo', () => {
  assert.equal(isAllDry([0, 1], {0: 0, 1: 0}, {0: 0, 1: 0}), true);
  assert.equal(isAllDry([0, 1], {0: 0, 1: 0}, {0: 0, 1: 3}), false);
  assert.equal(isAllDry([0, 1], {0: 2, 1: 0}, {0: 0, 1: 0}), false);
  assert.equal(isAllDry([], {}, {}), false);
  assert.equal(dryKillDropsAmmo(true), true);
  assert.equal(dryKillDropsAmmo(false), false);
});

test('shove is a rebindable key (default V) and old saves without it still load', () => {
  assert.equal(DEFAULT_KEY_BINDINGS.shove, 'v');
  assert.ok(KEY_BINDING_ACTIONS.some(a => a.id === 'shove' && /shove/i.test(a.label)));
  assert.equal(rebindKey(DEFAULT_KEY_BINDINGS, 'shove', 'x').bindings.shove, 'x');
  assert.equal(rebindKey(DEFAULT_KEY_BINDINGS, 'shove', 'e').reason, 'in-use');
  const old = {version: 1, bindings: Object.fromEntries(Object.entries(DEFAULT_KEY_BINDINGS).filter(([k]) => k !== 'shove'))};
  assert.equal(parseKeyBindings(JSON.stringify(old)).shove, 'v');
});
