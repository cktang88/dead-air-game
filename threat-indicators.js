// Screen-space threat feedback: directional damage arcs (where did that hit come from?) and edge chevrons for
// enemies that are telegraphing a shot while off-screen. The geometry helpers are pure and unit-tested; the draw
// functions only need a 2D context and a camera {x, y, w, h, scale}.
const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export const HIT_INDICATOR_LIFE = 1.35;

/** Point where a ray from the screen centre at `ang` leaves the rect inset by `margin`. */
export function edgeAnchor(w, h, ang, margin = 0) {
  const hx = Math.max(1, w / 2 - margin), hy = Math.max(1, h / 2 - margin);
  const c = Math.cos(ang), s = Math.sin(ang);
  const k = Math.min(Math.abs(c) < 1e-6 ? Infinity : hx / Math.abs(c), Math.abs(s) < 1e-6 ? Infinity : hy / Math.abs(s));
  return {x: w / 2 + c * k, y: h / 2 + s * k};
}

/** Shortest signed angle difference b - a in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Add a hit indicator pointing at world angle `ang` (player -> source). Near-equal angles refresh instead of stacking. */
export function registerHitIndicator(list, ang, strength = 1) {
  const near = list.find(i => Math.abs(angleDelta(i.ang, ang)) < 0.35 && i.age < 0.4);
  if (near) { near.ang = ang; near.age = 0; near.strength = Math.max(near.strength, strength); return near; }
  const item = {ang, age: 0, strength};
  list.push(item);
  if (list.length > 6) list.shift();
  return item;
}

/** Age indicators by real seconds and drop the expired ones in place. */
export function ageHitIndicators(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].age += dt;
    if (list[i].age >= HIT_INDICATOR_LIFE) list.splice(i, 1);
  }
}

export function drawDamageArcs(ctx, w, h, list) {
  if (!list.length) return;
  ctx.save();
  const R = Math.hypot(w, h) / 2;
  for (const item of list) {
    const life = 1 - item.age / HIT_INDICATOR_LIFE;
    const fade = life * life * (item.age < 0.08 ? item.age / 0.08 : 1);
    // Three nested wedges (wide/faint -> narrow/strong) fake a feathered arc without per-pixel work.
    for (const [span, alpha] of [[1.05, 0.2], [0.7, 0.28], [0.36, 0.34]]) {
      const a0 = item.ang - span / 2, a1 = item.ang + span / 2;
      const grad = ctx.createRadialGradient(w / 2, h / 2, R * 0.55, w / 2, h / 2, R * 1.02);
      grad.addColorStop(0, 'rgba(255,40,60,0)');
      grad.addColorStop(1, `rgba(255,52,66,${(alpha * fade * item.strength).toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.arc(w / 2, h / 2, R * 1.05, a0, a1); ctx.closePath(); ctx.fill();
    }
    // Crisp chevron right at the edge so the direction reads at a glance.
    const p = edgeAnchor(w, h, item.ang, 26);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(item.ang); ctx.globalAlpha = clamp(fade * 1.3, 0, 1);
    ctx.fillStyle = '#ff4558'; ctx.strokeStyle = 'rgba(20,6,12,0.9)'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-6, -10); ctx.lineTo(-2, 0); ctx.lineTo(-6, 10); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Chevrons at the screen edge for enemies that are winding up a shot but are not on screen.
 * `threats` = [{x, y, p (0..1 telegraph progress), locked}] in world space.
 */
export function drawOffscreenThreats(ctx, cam, threats, time) {
  if (!threats.length) return;
  const toS = t => ({x: (t.x - cam.x) * cam.scale + cam.w / 2, y: (t.y - cam.y) * cam.scale + cam.h / 2});
  ctx.save();
  for (const t of threats) {
    const sp = toS(t);
    if (sp.x > -12 && sp.y > -12 && sp.x < cam.w + 12 && sp.y < cam.h + 12) continue;
    const ang = Math.atan2(sp.y - cam.h / 2, sp.x - cam.w / 2), a = edgeAnchor(cam.w, cam.h, ang, 22);
    const pulse = 0.5 + 0.5 * Math.sin(time * (t.locked ? 18 : 9)), p = clamp(t.p ?? 0, 0, 1);
    ctx.save(); ctx.translate(a.x, a.y);
    ctx.globalAlpha = 0.65 + 0.35 * pulse;
    ctx.fillStyle = 'rgba(20,8,16,0.8)'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.stroke();
    ctx.strokeStyle = t.locked ? '#ff2a48' : '#ff8a5a'; ctx.beginPath(); ctx.arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.stroke();
    ctx.rotate(ang); ctx.fillStyle = t.locked ? '#ff2a48' : '#ff5a68'; ctx.strokeStyle = 'rgba(20,6,12,0.9)'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(8 + pulse * 2, 0); ctx.lineTo(-4, -6.5); ctx.lineTo(-1, 0); ctx.lineTo(-4, 6.5); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
