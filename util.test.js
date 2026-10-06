import test from 'node:test';
import assert from 'node:assert/strict';
import {clamp, dist, hash2, lerp} from './util.js';

test('util helpers', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.equal(dist({x: 0, y: 0}, {x: 3, y: 4}), 5);
  assert.equal(hash2(3, 4, 5), hash2(3, 4, 5));
  const h = hash2(1, 2);
  assert.ok(h >= 0 && h < 1);
});
