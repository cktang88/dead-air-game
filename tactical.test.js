import test from 'node:test';
import assert from 'node:assert/strict';
import {THROWABLES, consumeThrowable, isWithinThrowableRadius, throwableAffectsTarget, throwableById} from './tactical.js';

test('throwables expose four distinct, bounded tactical profiles', () => {
  assert.deepEqual(THROWABLES.map(item => item.id), ['smoke', 'flash', 'frag', 'incendiary']);
  assert.equal(new Set(THROWABLES.map(item => item.effect)).size, 4);
  for (const item of THROWABLES) {
    for (const field of ['stack', 'cost', 'range', 'fuse', 'radius', 'duration']) {
      assert.ok(Number.isFinite(item[field]) && item[field] > 0, `${item.id} needs positive ${field}`);
    }
    assert.ok(Number.isFinite(item.damage) && item.damage >= 0);
    assert.ok(item.stack <= 3);
    assert.ok(item.fuse < 1, `${item.id} should have a short, dodgeable fuse`);
    assert.ok(Object.isFrozen(item));
  }
  assert.ok(Object.isFrozen(THROWABLES));
  assert.equal(throwableById('frag').damage, 85);
  assert.equal(throwableById('smoke').damage, 0);
});

test('consuming a throwable is immutable and fails without spending inventory', () => {
  const inventory = { smoke: 2, frag: 1 };
  const spent = consumeThrowable(inventory, 'smoke');
  assert.equal(spent.consumed, true);
  assert.deepEqual(spent.inventory, { smoke: 1, frag: 1 });
  assert.deepEqual(inventory, { smoke: 2, frag: 1 });

  for (const [id, count, reason] of [
    ['flash', 1, 'insufficient-count'],
    ['frag', 2, 'insufficient-count'],
    ['grenade', 1, 'unknown-item'],
    ['smoke', 0, 'invalid-count'],
    ['smoke', 1.5, 'invalid-count'],
  ]) {
    const result = consumeThrowable(inventory, id, count);
    assert.equal(result.consumed, false);
    assert.equal(result.reason, reason);
    assert.strictEqual(result.inventory, inventory);
  }
});

test('area effects include the radius edge and reject invalid distances', () => {
  const radius = throwableById('frag').radius;
  assert.equal(isWithinThrowableRadius('frag', radius), true);
  assert.equal(isWithinThrowableRadius('frag', radius + 0.01), false);
  assert.equal(isWithinThrowableRadius('frag', -1), false);
  assert.equal(isWithinThrowableRadius('unknown', 1), false);
  assert.equal(isWithinThrowableRadius('smoke', NaN), false);
});

test('walls block direct damage and flash while smoke still fills its area', () => {
  assert.equal(throwableAffectsTarget('frag', { distance: 20, blockedByWall: true }), false);
  assert.equal(throwableAffectsTarget('incendiary', { distance: 20, blockedByWall: true }), false);
  assert.equal(throwableAffectsTarget('flash', { distance: 20, blockedByWall: true }), false);
  assert.equal(throwableAffectsTarget('smoke', { distance: 20, blockedByWall: true }), true);
  assert.equal(throwableAffectsTarget('frag', { distance: 20 }), true);
  assert.equal(throwableAffectsTarget('frag', { distance: 200 }), false);
  assert.equal(throwableAffectsTarget('missing', { distance: 1 }), false);
});
