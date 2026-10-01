import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProgress} from './progression.js';
import {clearSavedProgress, readSavedProgress, writeSavedProgress} from './progress-storage.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test('saved coins and upgrades survive a reload through the storage boundary', () => {
  const storage = memoryStorage();
  const progress = {...emptyProgress(), coins: 84, upgrades: {...emptyProgress().upgrades, runner: 2}};

  writeSavedProgress(storage, progress);

  assert.deepEqual(readSavedProgress(storage), progress);
});

test('clearing a save resets saved progress to a fresh profile', () => {
  const storage = memoryStorage();
  writeSavedProgress(storage, {...emptyProgress(), coins: 84});

  clearSavedProgress(storage);

  assert.deepEqual(readSavedProgress(storage), emptyProgress());
});

test('malformed saved JSON is sanitized by the progression boundary', () => {
  const storage = memoryStorage();
  storage.setItem('dead-air.progress.v1', '{broken');

  assert.deepEqual(readSavedProgress(storage), emptyProgress());
});

test('storage failures remain visible to the caller', () => {
  const failure = new Error('storage unavailable');
  const storage = {getItem() { throw failure; }};

  assert.throws(() => readSavedProgress(storage), error => error === failure);
});
