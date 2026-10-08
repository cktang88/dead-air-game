import test from 'node:test';
import assert from 'node:assert/strict';
import {BOOT_PHASES, RUN_PHASES, createPlan, spriteProgress} from './boot-progress.js';

test('phase weights sum to one', () => {
  for (const ph of [BOOT_PHASES, RUN_PHASES]) assert.ok(Math.abs(ph.reduce((s, p) => s + p.w, 0) - 1) < 1e-9);
});

test('fraction is the weighted sum of real counts', () => {
  const p = createPlan(BOOT_PHASES);
  assert.equal(p.fraction(), 0);
  p.update('fetch', 5, 10);
  assert.ok(Math.abs(p.fraction() - 0.23) < 1e-9);
  p.update('physics', 1, 1);
  assert.ok(Math.abs(p.fraction() - 0.41) < 1e-9);
});

test('labels name the first unfinished phase and show counts', () => {
  const p = createPlan(BOOT_PHASES);
  p.update('fetch', 3, 7);
  assert.equal(p.label(), 'FETCHING ENGINE · 3/7');
  p.update('fetch', 7, 7);
  assert.equal(p.label(), 'WARMING PHYSICS');
  p.finish('physics');
  assert.equal(p.label(), 'STARTING ENGINE');
});

test('parallel phases: a later phase can finish first without skipping the label', () => {
  const p = createPlan(BOOT_PHASES);
  p.finish('physics');
  assert.equal(p.label(), 'FETCHING ENGINE');
  assert.ok(p.fraction() > 0.17);
});

test('progress never goes backwards and clamps', () => {
  const p = createPlan(BOOT_PHASES);
  p.update('fetch', 6, 10);
  const a = p.fraction();
  p.update('fetch', 2, 10);
  assert.equal(p.fraction(), a);
  p.update('fetch', 99, 10);
  assert.ok(p.fraction() <= 1);
  p.update('nope', 1, 1);
});

test('run plan labels: floor number, chunk counts, sprite percent, then done', () => {
  const p = createPlan(RUN_PHASES, {floor: 1});
  assert.equal(p.label(), 'BUILDING FLOOR 01');
  p.setFloor(3);
  assert.equal(p.label(), 'BUILDING FLOOR 03');
  p.finish('floor');
  p.update('chunks', 2, 9);
  assert.equal(p.label(), 'DRAWING THE MAP · 2/9');
  p.update('chunks', 9, 9);
  p.update('sprites', 16, 25);
  assert.equal(p.label(), 'BAKING SPRITES 64%');
  assert.equal(p.done(), false);
  p.update('sprites', 25, 25);
  assert.equal(p.label(), 'FIRST FRAME');
  assert.equal(p.done(), false);
  p.finish('settle');
  assert.equal(p.done(), true);
  assert.equal(p.fraction(), 1);
  assert.equal(p.label(), 'ON AIR');
});

test('spriteProgress', () => {
  assert.deepEqual(spriteProgress(0, 0), {done: 0, total: 1});
  assert.deepEqual(spriteProgress(9, 25), {done: 16, total: 25});
});
