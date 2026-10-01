import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseEnemyTactic, hasIncomingProjectile} from './enemy-tactics.js';

const actor = {x: 0, y: 0, brain: 'shoot', minRange: 100, range: 300, hp: 52, maxHp: 52, reloadTimer: 0, side: 1};
const decide = overrides => chooseEnemyTactic({actor, target: {x: 180, y: 0}, canSee: true, ...overrides});

test('dodges a predicted hit before movement or reload and chooses an open escape side', () => {
  const result = decide({actor: {...actor, reloadTimer: 1}, projectiles: [{x: -90, y: 0, vx: 300, vy: 0}], canMoveTo: goal => goal.y < 0});
  assert.equal(result.intent, 'dodge');
  assert.deepEqual(result.goal, {x: 0, y: -42});
});

test('the fast threat check agrees with the dodge window', () => {
  assert.equal(hasIncomingProjectile(actor,[{x:-90,y:0,vx:300,vy:0}]),true);
  assert.equal(hasIncomingProjectile(actor,[{x:20,y:0,vx:300,vy:0}]),false);
});

test('does not dodge departing, distant, stationary, or harmless passing projectiles', () => {
  for (const shot of [
    {x: 20, y: 0, vx: 300, vy: 0},
    {x: -300, y: 0, vx: 300, vy: 0},
    {x: -50, y: 0, vx: 0, vy: 0},
    {x: -50, y: 40, vx: 300, vy: 0},
  ]) assert.notEqual(decide({projectiles: [shot]}).intent, 'dodge');
  assert.notEqual(decide({projectiles: [{x: -50, y: 0, vx: 300, vy: 0}], canMoveTo: () => false}).intent, 'dodge');
});

test('earliest predicted impact takes priority regardless of projectile order', () => {
  const projectiles = [{x: -90, y: 0, vx: 300, vy: 0}, {x: 0, y: -30, vx: 0, vy: 300}];
  const result = decide({projectiles});
  assert.deepEqual(result, {intent: 'dodge', goal: {x: -42, y: 0}});
  assert.deepEqual(decide({projectiles: [...projectiles].reverse()}), result);
});

test('reload seeks nearby protected cover and holds when it reaches safety', () => {
  const reloading = {...actor, reloadTimer: 1};
  const covers = [{x: 8, y: 0, protected: false}, {x: 40, y: 40, protected: true}, {x: 400, y: 0, protected: true}];
  assert.deepEqual(decide({actor: reloading, covers}), {intent: 'cover', goal: {x: 40, y: 40}});
  assert.deepEqual(decide({actor: {...reloading, x: 40, y: 40}, covers}), {intent: 'reload', goal: null});
});

test('injured enemies use cover or retreat; healthy rushers keep pressing', () => {
  const covers = [{x: -30, y: 20, protected: true}];
  assert.equal(decide({actor: {...actor, hp: 10}, covers}).intent, 'cover');
  assert.deepEqual(decide({actor: {...actor, brain: 'rush', range: 19, hp: 10}, covers}), {intent: 'cover', goal: {x: -30, y: 20}});
  assert.deepEqual(decide({actor: {...actor, brain: 'rush', range: 19, hp: 10}}), {intent: 'retreat', goal: {x: -55, y: 0}});
  assert.deepEqual(decide({actor: {...actor, brain: 'rush', range: 19}}), {intent: 'approach', goal: {x: 180, y: 0}});
});

test('ranged enemies flank blocked sight and spread across opposite sides', () => {
  const left = decide({canSee: false});
  const right = decide({canSee: false, actor: {...actor, side: -1}});
  assert.equal(left.intent, 'flank');
  assert.equal(right.intent, 'flank');
  assert.equal(left.goal.y, -right.goal.y);
  assert.notDeepEqual(left.goal, {x: 180, y: 0});
});

test('range bands retreat, advance, and strafe; blocked lateral paths hold', () => {
  const tooClose=decide({target:{x:60,y:0}});
  assert.equal(tooClose.intent,'retreat');
  assert.ok(Math.hypot(tooClose.goal.x-60,tooClose.goal.y)>100,'retreat should restore the minimum firing gap');
  assert.equal(decide({target:{x:400,y:0}}).intent,'approach');
  assert.equal(decide({target:{x:140,y:0}}).intent,'strafe');
  assert.equal(decide({}).intent, 'strafe');
  assert.deepEqual(decide({canMoveTo: () => false}), {intent: 'hold', goal: null});
});
