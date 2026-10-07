import test from 'node:test';
import assert from 'node:assert/strict';
import {createCamera, followStep, lookAheadOffset, resizeCamera, screenToWorld, slowAmount, viewBounds, worldToScreen, VIEW_HALF_HEIGHT} from './camera2d.js';

test('screen and world mapping round-trips', () => {
  const cam = resizeCamera(createCamera(), 1600, 900);
  cam.x = 300; cam.y = -40;
  const s = worldToScreen(cam, 412, 77), w = screenToWorld(cam, s.x, s.y);
  assert.ok(Math.abs(w.x - 412) < 1e-9 && Math.abs(w.y - 77) < 1e-9);
  assert.deepEqual(screenToWorld(cam, 800, 450), {x: 300, y: -40});
});

test('view height is fixed in world units', () => {
  const cam = resizeCamera(createCamera(), 1000, 500);
  const b = viewBounds(cam);
  assert.ok(Math.abs(b.y1 - b.y0 - VIEW_HALF_HEIGHT * 2) < 1e-9);
});

test('look-ahead is zero at centre and capped at the edge', () => {
  assert.deepEqual(lookAheadOffset(800, 450, 1600, 900, 40), {x: 0, y: 0});
  const far = lookAheadOffset(5000, 450, 1600, 900, 40);
  assert.ok(far.x <= 40 + 1e-9 && far.x > 39);
});

test('follow snaps first, then eases, then snaps on teleport', () => {
  const cam = createCamera();
  followStep(cam, 100, 100, 0.016);
  assert.equal(cam.x, 100);
  followStep(cam, 200, 100, 0.016);
  assert.ok(cam.x > 100 && cam.x < 200);
  followStep(cam, 5000, 100, 0.016);
  assert.equal(cam.x, 5000);
});

test('slow amount maps time scale to 0..1', () => {
  assert.equal(slowAmount(1), 0);
  assert.equal(slowAmount(0.18), 1);
  assert.ok(slowAmount(0.6) > 0 && slowAmount(0.6) < 1);
});
