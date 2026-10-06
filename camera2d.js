// Pure camera math for the Canvas 2D renderer: follow, aim look-ahead and screen <-> world mapping.
export const VIEW_HALF_HEIGHT = 230;

export function createCamera() {
  return {x: 0, y: 0, w: 1, h: 1, scale: 1, snap: true};
}

export function resizeCamera(cam, w, h) {
  cam.w = Math.max(1, w);
  cam.h = Math.max(1, h);
  cam.scale = cam.h / (2 * VIEW_HALF_HEIGHT);
  return cam;
}

export function worldToScreen(cam, x, y) {
  return {x: (x - cam.x) * cam.scale + cam.w / 2, y: (y - cam.y) * cam.scale + cam.h / 2};
}

export function screenToWorld(cam, sx, sy) {
  return {x: (sx - cam.w / 2) / cam.scale + cam.x, y: (sy - cam.h / 2) / cam.scale + cam.y};
}

// Pushes the camera a little toward the mouse so you see further where you aim.
export function lookAheadOffset(mouseX, mouseY, w, h, reach = 46) {
  let nx = (mouseX - w / 2) / (w / 2), ny = (mouseY - h / 2) / (h / 2);
  const length = Math.hypot(nx, ny);
  if (length > 1) { nx /= length; ny /= length; }
  const ease = Math.min(1, length) ** 1.2;
  return {x: nx * reach * ease, y: ny * reach * ease};
}

// Exponential follow that is independent of frame rate. Large jumps (a new level) snap.
export function followStep(cam, targetX, targetY, dt, rate = 7) {
  if (cam.snap || Math.hypot(targetX - cam.x, targetY - cam.y) > 520) {
    cam.x = targetX; cam.y = targetY; cam.snap = false; return cam;
  }
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  cam.x += (targetX - cam.x) * k;
  cam.y += (targetY - cam.y) * k;
  return cam;
}

export function viewBounds(cam, pad = 0) {
  const hw = cam.w / 2 / cam.scale + pad, hh = cam.h / 2 / cam.scale + pad;
  return {x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh};
}

// How strongly the "slow time" look applies: 0 at full speed, 1 at the idle floor.
export function slowAmount(timeScale, idleScale = 0.18) {
  const span = 1 - idleScale;
  return span <= 0 ? 0 : Math.max(0, Math.min(1, (1 - timeScale) / span));
}
