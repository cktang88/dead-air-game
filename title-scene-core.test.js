import test from 'node:test';
import assert from 'node:assert/strict';
import {tickPhase, driftCamera, sceneBullets, TICK_PERIOD, TICK_LEN} from './title-scene-core.js';

test('tick lurch is monotonic and the rate peaks mid-tick, zero between ticks', () => {
  let prev = -1;
  for (let t = 0; t < 40; t += 0.05) { const p = tickPhase(t); assert.ok(p.lurch >= prev - 1e-9); prev = p.lurch; }
  assert.ok(tickPhase(TICK_PERIOD + TICK_LEN / 2).lurchRate > 0.95);
  assert.equal(tickPhase(TICK_PERIOD * 2 - 1).lurchRate, 0);
});
test('camera drift is bounded and the bullet field is deterministic', () => {
  for (let t = 0; t < 600; t += 3) { const c = driftCamera(t); assert.ok(Math.abs(c.x) < 40 && Math.abs(c.y) < 20); }
  assert.deepEqual(sceneBullets(), sceneBullets());
  assert.ok(sceneBullets().filter(b => b.kind === 'bullet').length >= 10);
});
