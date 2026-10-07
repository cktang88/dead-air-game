// Screen rectangles the DOM HUD occupies, shared by every canvas-drawn label that must not hide behind it (edge arrows,
// door reward plates). `hudSafeRects()` reads the DOM (cached ~4x a second); the rest is pure so it can be unit tested.
const IDS = ['topbar', 'top-center', 'hud', 'hud-right', 'feed', 'build-strip', 'boss-bar', 'tutor-hint', 'room-banner', 'name-card', 'manual-chip', 'sig-cause', 'toast'];
let cache = [], cacheAt = -1e9;

export function hudSafeRects(pad = 10, now = typeof performance !== 'undefined' ? performance.now() : 0) {
  if (typeof document === 'undefined') return cache;
  if (now - cacheAt < 250) return cache;
  cacheAt = now; cache = [];
  for (const id of IDS) {
    const el = document.getElementById(id);
    if (!el || el.hidden) continue;
    if (id === 'room-banner' && !el.classList.contains('show')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 2 && r.height > 2 && getComputedStyle(el).opacity !== '0') cache.push({x0: r.left - pad, y0: r.top - pad, x1: r.right + pad, y1: r.bottom + pad});
  }
  return cache;
}

export const boxHits = (b, rects) => rects.some(r => b.x0 < r.x1 && b.x1 > r.x0 && b.y0 < r.y1 && b.y1 > r.y0);

/** Smallest shift (dx,dy) of box `b` that clears every rect while staying inside [0,w]x[0,h]; null when none within `max` px. */
export function clearShift(b, rects, w, h, max = 260, step = 8) {
  if (!boxHits(b, rects)) return {dx: 0, dy: 0};
  const cands = [];
  for (let d = step; d <= max; d += step) for (const [ux, uy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) cands.push({dx: ux * d, dy: uy * d, cost: d * (ux && uy ? 1.41 : 1)});
  cands.sort((a, c) => a.cost - c.cost);
  for (const c of cands) {
    const s = {x0: b.x0 + c.dx, x1: b.x1 + c.dx, y0: b.y0 + c.dy, y1: b.y1 + c.dy};
    if (s.x0 < 0 || s.y0 < 0 || s.x1 > w || s.y1 > h) continue;
    if (!boxHits(s, rects)) return {dx: c.dx, dy: c.dy};
  }
  return null;
}

/** Position for an edge arrow: the point on the viewport perimeter nearest to the ideal one whose arrow box clears the HUD. */
export function placeEdgeArrow(ideal, w, h, M, boxFor, rects) {
  const ok = p => !boxHits(boxFor(p.x, p.y), rects);
  if (ok(ideal)) return ideal;
  let best = null, bestD = Infinity;
  const consider = (x, y) => { const p = {x, y}, d = Math.hypot(x - ideal.x, y - ideal.y); if (d < bestD && ok(p)) { best = p; bestD = d; } };
  for (let x = M; x <= w - M; x += 8) { consider(x, M); consider(x, h - M); }
  for (let y = M; y <= h - M; y += 8) { consider(M, y); consider(w - M, y); }
  return best || ideal;
}
