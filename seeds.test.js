import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_RUN_SEED, parseRunSeed} from './seeds.js';

test('run seeds accept only positive 31-bit whole numbers', () => {
  assert.equal(parseRunSeed('417'), 417);
  assert.equal(parseRunSeed(String(MAX_RUN_SEED)), MAX_RUN_SEED);
  for (const value of ['', '0', '-8', '1.5', '2147483648', 'word']) assert.equal(parseRunSeed(value), null);
});
