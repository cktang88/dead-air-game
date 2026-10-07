import test from 'node:test';
import assert from 'node:assert/strict';
import {Fx, SCRAP_FLY_S, SCRAP_MERGE_S} from './fx2d.js';

test('scrap pickups within the merge window coalesce into one counter pop', () => {
  const fx = new Fx();
  fx.scrapPop(10, 10, 4); fx.tick(0.2); fx.scrapPop(30, 12, 4); fx.tick(0.3); fx.scrapPop(50, 9, 4);
  const pops = fx.floaters.filter(f => f.scrap);
  assert.equal(pops.length, 1);
  assert.equal(pops[0].text, '+12 SCRAP');
  assert.ok(pops[0].life >= pops[0].age + SCRAP_MERGE_S + SCRAP_FLY_S - 1e-9, 'each merge extends the hold');
});

test('a scrap pop that has started flying is not merged into; it expires after the flight', () => {
  const fx = new Fx();
  fx.scrapPop(0, 0, 5); fx.tick(SCRAP_MERGE_S + 0.05);
  fx.scrapPop(0, 0, 7);
  assert.deepEqual(fx.floaters.filter(f => f.scrap).map(f => f.text).sort(), ['+5 SCRAP', '+7 SCRAP']);
  for (let i = 0; i < 40; i++) fx.tick(0.05);
  assert.equal(fx.floaters.length, 0);
});
