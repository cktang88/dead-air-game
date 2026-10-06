import test from 'node:test';
import assert from 'node:assert/strict';
import {boxHits, clearShift, placeEdgeArrow} from './hud-safe.js';

const rects = [{x0: 0, y0: 0, x1: 1000, y1: 60}, {x0: 0, y0: 700, x1: 500, y1: 900}];
test('boxHits detects overlap', () => {
  assert.ok(boxHits({x0: 100, y0: 40, x1: 150, y1: 90}, rects));
  assert.ok(!boxHits({x0: 100, y0: 100, x1: 150, y1: 150}, rects));
});
test('clearShift moves a plate out of the HUD and inside the viewport', () => {
  const s = clearShift({x0: 100, y0: 720, x1: 200, y1: 760}, rects, 1600, 900);
  assert.ok(s && (s.dx !== 0 || s.dy !== 0));
  assert.deepEqual(clearShift({x0: 600, y0: 300, x1: 700, y1: 340}, rects, 1600, 900), {dx: 0, dy: 0});
});
test('placeEdgeArrow slides along the perimeter to a clear spot', () => {
  const box = (x, y) => ({x0: x - 17, y0: y - 17, x1: x + 17, y1: y + 17});
  const p = placeEdgeArrow({x: 800, y: 30}, 1600, 900, 30, box, rects);
  assert.ok(!boxHits(box(p.x, p.y), rects));
});
