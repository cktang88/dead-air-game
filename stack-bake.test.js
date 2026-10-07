import test from 'node:test';
import assert from 'node:assert/strict';
import {bucketDist, nearestBucket, bucketIndex, STACK_CONFIG, stackStats, warmStack, VoxelGrid, normalizeModel} from './stack2d.js';
import {spreadOrder, bakeVoxSlice, bakeVoxSlices, voxelColor} from './stack-bake.js';
import {collectModels, warmEnemy} from './stack-warm.js';
import {kitFor, gunStack} from './models2d.js';
import {heavyKit, heavyGun} from './heavy-models2d.js';
import {rusherKit, RUSHER_SPEC} from './creatures2d.js';
import {GUNS} from './catalog.js';
import {floorStackVariant} from './actor-stack2d.js';

test('bucketDist is the circular distance', () => {
  assert.equal(bucketDist(0, 47, 48), 1);
  assert.equal(bucketDist(10, 14, 48), 4);
  assert.equal(bucketDist(0, 24, 48), 24);
  assert.equal(bucketDist(5, 5, 48), 0);
});

test('nearestBucket finds the closest baked angle, wrapping, and gives up past maxD', () => {
  const have = (set) => (i) => set.has(i);
  assert.equal(nearestBucket(10, 48, have(new Set([12, 7]))), 12, 'two away beats three away');
  assert.equal(nearestBucket(0, 48, have(new Set([46]))), 46, 'wraps below zero');
  assert.equal(nearestBucket(47, 48, have(new Set([1]))), 1, 'wraps above n');
  assert.equal(nearestBucket(5, 48, have(new Set())), -1);
  assert.equal(nearestBucket(5, 48, have(new Set([20])), 3), -1, 'respects maxD');
  assert.equal(nearestBucket(10, 48, have(new Set([9, 11]))), 11, 'a tie picks the higher index (stable)');
});

test('spreadOrder visits each wanted bucket once, evenly spread first', () => {
  for (const n of [32, 48, 64]) {
    const all = spreadOrder(n, 1);
    assert.equal(all.length, n);
    assert.equal(new Set(all).size, n);
    const even = spreadOrder(n, 2);
    assert.equal(even.length, n / 2);
    assert.ok(even.every((i) => i % 2 === 0));
    // any prefix of 4 / 8 buckets leaves no gap larger than a quarter / an eighth of the circle (+ rounding for non power-of-two n)
    for (const k of [4, 8]) {
      const pre = all.slice(0, k).sort((a, b) => a - b);
      let gap = 0; for (let i = 0; i < pre.length; i++) gap = Math.max(gap, ((pre[(i + 1) % pre.length] - pre[i]) + n) % n || n);
      assert.ok(gap <= Math.ceil(n / k) * 2, `n=${n} k=${k} gap=${gap}`);
    }
  }
  assert.equal(spreadOrder(48, 2)[0], 0);
});

test('bucket choice is a pure function of the quantised yaw (cache key is the bucket)', () => {
  const n = 48, step = Math.PI * 2 / n;
  assert.equal(bucketIndex(step * 3.4, n), 3);
  assert.equal(bucketIndex(step * 3.6, n), 4);
  assert.equal(bucketIndex(-step * 0.4, n), 0);
  assert.equal(bucketIndex(-step * 0.6, n), 47);
});

// a tiny fake canvas: records fillRect calls so the voxel slice baker can be checked without a DOM
function fakeCanvas(w, h) {
  const calls = [], g = {fillStyle: '', fillRect(...a) { calls.push({fill: this.fillStyle, a}); }};
  return {width: Math.ceil(w), height: Math.ceil(h), getContext: () => g, calls};
}
test('bakeVoxSlice paints runs of equal cells with the mapped palette and skips empty layers', () => {
  const grid = new VoxelGrid(4, 2, 2);
  grid.box(0, 0, 0, 3, 1, 1, 'a'); grid.set(3, 0, 0, 'b'); grid.set(0, 0, 1, 'a');
  const n = {grid, palette: {a: {c: '#808080', emit: false}, b: {c: '#ff0000', emit: true}}, count: 2, pivot: {x: 0, y: 0}};
  const cv = bakeVoxSlice(n, 0, 0, 2, fakeCanvas);
  const calls = cv.calls;
  // layer 0, row 0: 'aaab': a-run covers x 0..3 but the cell under the raised 'a' is not exposed, the other two are
  assert.ok(calls.length >= 2 && calls.length <= 4, `runs: ${calls.length}`);
  assert.ok(calls.some((c) => c.fill === '#ff0000'), 'emissive colour is not shaded');
  assert.equal(bakeVoxSlice({...n, grid: new VoxelGrid(2, 2, 2)}, 0, 0, 2, fakeCanvas), null, 'an empty layer bakes nothing');
  assert.equal(bakeVoxSlices(n, 2, fakeCanvas).length, 2);
  // the same height / exposure rules as voxelColor (a lower layer is darker than the top)
  assert.notEqual(voxelColor('#808080', 0, false), voxelColor('#808080', 1, false));
});

test('worker is off without a DOM and warmStack is a safe no-op', () => {
  assert.equal(typeof Worker, 'undefined');
  const m = {id: 'test.warm', unit: 1, pivot: {x: 1, y: 1}, palette: {a: '#fff'}, grid: VoxelGrid.fromLayers([['aa', 'aa']]), buckets: 8};
  assert.equal(warmStack(m, null), false);
  assert.equal(stackStats.pending, 0);
  assert.ok(STACK_CONFIG.prefetchStep >= 1 && STACK_CONFIG.prefetchFrac < 1);
  assert.ok(normalizeModel(m).buckets === 8);
});

test('collectModels finds every part of a kit, guns and their moving parts, once', () => {
  const kit = heavyKit('sniper', false), found = collectModels(kit);
  assert.ok(found.length >= 6);
  for (const k of ['leg', 'torso', 'head', 'arm', 'strip']) assert.ok(found.includes(kit[k]), k);
  assert.equal(new Set(found).size, found.length, 'no duplicates');
  assert.ok(collectModels(heavyGun('sniper', false)).length >= 2, 'rifle + bolt');
  const gun = gunStack(GUNS[0], {enemy: true});
  assert.ok(collectModels(gun).includes(gun));
  const g = kitFor('gunner');
  assert.ok(collectModels(g).includes(g.torso) && collectModels(g).includes(g.mag));
  const rk = rusherKit(RUSHER_SPEC);
  assert.ok(collectModels(rk).length >= 10);
  assert.ok(!collectModels(rk).some((m) => m.palette === undefined), 'only models');
});

test('warmEnemy is idempotent and does nothing without a worker', () => {
  const v = floorStackVariant(1, 0.1);
  assert.equal(warmEnemy('guard', false, v, null), 0);
  assert.equal(warmEnemy('guard', false, v, null), 0);
  assert.equal(warmEnemy('boss', false, null, null), 0);
});

test('floorStackVariant keeps one variant per floor and tint amount', () => {
  const a = floorStackVariant(1, 0.1), b = floorStackVariant(1, 0.06), c = floorStackVariant(1, 0.1);
  assert.equal(a, c);
  assert.notEqual(a, b);
  assert.notEqual(a.key, b.key, 'different amounts never share a bake cache key');
});
