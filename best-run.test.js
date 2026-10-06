import test from 'node:test';
import assert from 'node:assert/strict';
import {isBetterRun, mergeBest, readBest, writeBest, normalizeRun} from './best-run.js';

test('a first run is always the best', () => {
  const r = mergeBest(null, {rooms: 0, kills: 0});
  assert.equal(r.isNew, true);
  assert.equal(r.previous, null);
});

test('extraction beats death, then rooms, then kills', () => {
  assert.equal(isBetterRun(normalizeRun({won: true, rooms: 1}), normalizeRun({rooms: 9})), true);
  assert.equal(isBetterRun(normalizeRun({rooms: 4}), normalizeRun({rooms: 3, kills: 99})), true);
  assert.equal(isBetterRun(normalizeRun({rooms: 3, kills: 5}), normalizeRun({rooms: 3, kills: 5})), false);
  assert.equal(isBetterRun(normalizeRun({won: true, rooms: 5, seconds: 100}), normalizeRun({won: true, rooms: 5, seconds: 200})), true);
});

test('mergeBest keeps the old record when beaten', () => {
  const prev = {won: false, rooms: 5, kills: 9, seconds: 100, coins: 40};
  const r = mergeBest(prev, {rooms: 2, kills: 1});
  assert.equal(r.isNew, false);
  assert.equal(r.best.rooms, 5);
});

test('storage helpers survive missing or broken storage', () => {
  const store = new Map();
  const storage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)};
  assert.equal(readBest(storage), null);
  assert.equal(writeBest(storage, {rooms: 3}), true);
  assert.equal(readBest(storage).rooms, 3);
  assert.equal(readBest({getItem() { throw new Error('x'); }}), null);
  assert.equal(writeBest({setItem() { throw new Error('x'); }}, {}), false);
});
