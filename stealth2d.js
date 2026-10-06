// DEAD AIR stealth visuals (Canvas2D). Everything the stealth rules in stealth.js make true is drawn here, so
// nothing about being seen, heard or hit is hidden:
//   * vision cones on the floor for UNAWARE enemies (wall / crate / smoke clipped, brightening with suspicion)
//   * suspicion meter + '?' above an enemy that is starting to notice you, 'zZ' over sleepers
//   * expanding noise rings sized to the real hearing radius (walls trim them exactly like the sim does)
//   * radio-chatter pulses from an alerting enemy to the mates it wakes
//   * frag grenade damage radius with a filling fuse, sidestep afterimages, player i-frame ring
// render2d calls `stealth.draw(ctx, state, bounds, time, dt)` once, in world space, after the enemy telegraphs.
import {COLORS, FONTS, withAlpha} from './theme.js';
import {SUSPICION, noiseRingRadius, visionFor} from './stealth.js';

const TAU = Math.PI * 2;
const TILE = 32;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const RING_LIFE = 0.75, ALERT_LIFE = 0.8;

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function mixHex(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// ---- distance to the first thing that blocks sight along a ray (walls, crates, cover, smoke) -----------------
function rayHitCircle(ox, oy, dx, dy, cx, cy, r, maxLen) {
  const fx = cx - ox, fy = cy - oy, t = fx * dx + fy * dy;
  if (fx * fx + fy * fy < r * r) return maxLen;   // standing inside / hugging the prop: it does not hide the room
  if (t < -r) return maxLen;
  const d2 = fx * fx + fy * fy - t * t;
  if (d2 > r * r) return maxLen;
  const th = Math.sqrt(r * r - d2), t0 = t - th;
  if (t0 > maxLen) return maxLen;
  return t0 < 0 ? (t + th > 0 ? 0 : maxLen) : t0;
}
export function sightDistance(state, ox, oy, ang, maxLen, step = 10) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let len = maxLen;
  const solid = state.solidMap;
  for (let d = step; d <= maxLen; d += step) {
    const v = solid[Math.floor((oy + dy * d) / TILE)]?.[Math.floor((ox + dx * d) / TILE)];
    if (v !== 0 && v !== 4) { len = d - step * 0.5; break; }   // 4 = glass: cones see through it
  }
  for (const c of state.crates ?? []) if (Math.abs(c.x - ox) < len + 20 && Math.abs(c.y - oy) < len + 20) len = Math.min(len, rayHitCircle(ox, oy, dx, dy, c.x, c.y, 17, len));
  for (const c of state.cover ?? []) { if (c.crate) continue; if (Math.abs(c.x - ox) < len + 30 && Math.abs(c.y - oy) < len + 30) len = Math.min(len, rayHitCircle(ox, oy, dx, dy, c.x, c.y, c.radius, len)); }
  for (const f of state.effects ?? []) if (f.id === 'smoke' && f.remaining > 0) len = Math.min(len, rayHitCircle(ox, oy, dx, dy, f.x, f.y, f.item.radius, len));
  return Math.max(0, len);
}

// Free distance along each of `n` evenly spaced rays (used to shape noise rings once, at emission).
export function noiseRayLengths(state, x, y, radius, n = 40) {
  const solid = state.solidMap, out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, dx = Math.cos(a), dy = Math.sin(a);
    let wall = radius;
    for (let d = 8; d <= radius; d += 8) if (solid[Math.floor((y + dy * d) / TILE)]?.[Math.floor((x + dx * d) / TILE)] !== 0) { wall = d; break; }
    out.push(noiseRingRadius(radius, wall));
  }
  return out;
}

export function createStealthLayer() {
  const font = (px, w = 900) => `${w} ${px}px ${FONTS.display}`;

  function drawCone(ctx, state, e, time) {
    const vis = visionFor(e.type, e.def), f = e.face || {x: 1, y: 0}, base = Math.atan2(f.y, f.x), s = clamp(e.suspicion || 0, 0, 1);
    const tint = mixHex(COLORS.ammo, COLORS.danger, clamp(s * 1.2, 0, 1));
    const N = 20, pts = [];
    for (let i = 0; i <= N; i++) {
      const a = base - vis.half + (2 * vis.half) * i / N;
      const len = sightDistance(state, e.x, e.y, a, vis.range);
      pts.push([e.x + Math.cos(a) * len, e.y + Math.sin(a) * len]);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(e.x, e.y, 6, e.x, e.y, vis.range);
    const a0 = 0.10 + 0.32 * s, a1 = 0.015 + 0.10 * s;
    g.addColorStop(0, withAlpha(tint, a0)); g.addColorStop(1, withAlpha(tint, a1));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = withAlpha(tint, 0.14 + 0.4 * s); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(e.x, e.y); ctx.stroke();
    ctx.restore();
    void time;
  }

  function drawSuspicion(ctx, e, time) {
    const s = e.suspicion || 0;
    const y = e.y - (e.radius || 8) - 16;
    if (e.posture === 'sleep' && !e.aware) {
      ctx.save(); ctx.fillStyle = withAlpha(COLORS['text-low'], 0.9); ctx.strokeStyle = 'rgba(14,10,20,0.9)'; ctx.lineWidth = 2.5; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 2; i++) {
        const t = (time * 0.6 + i * 0.5) % 1;
        ctx.globalAlpha = 1 - t; ctx.font = font(9 + i * 3);
        ctx.strokeText('z', e.x + 5 + t * 6 + i * 4, y + 4 - t * 10); ctx.fillText('z', e.x + 5 + t * 6 + i * 4, y + 4 - t * 10);
      }
      ctx.restore();
      return;
    }
    if (e.aware || s < SUSPICION.questionAt) return;
    const col = mixHex(COLORS.ammo, COLORS.danger, s);
    ctx.save(); ctx.translate(e.x, y);
    ctx.strokeStyle = 'rgba(14,10,20,0.8)'; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = withAlpha('#ffffff', 0.18); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, 6.5, -Math.PI / 2, -Math.PI / 2 + TAU * s); ctx.stroke();
    ctx.fillStyle = col; ctx.font = font(10); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 0.5);
    ctx.restore();
  }

  function drawRings(ctx, state, dt) {
    const rings = state.noiseRings;
    if (!rings) return;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.age += dt;
      if (r.age >= RING_LIFE) { rings.splice(i, 1); continue; }
      const t = r.age / RING_LIFE, k = 1 - (1 - t) * (1 - t), fade = 1 - t;
      const col = r.kind === 'sprint' || r.kind === 'kick' ? COLORS.sprint : r.kind === 'suppressed' || r.kind === 'door' ? COLORS.slow : COLORS.ammo;
      const n = r.radii.length;
      ctx.beginPath();
      for (let j = 0; j <= n; j++) { const a = (j % n) / n * TAU, rr = r.radii[j % n] * k; ctx.lineTo(r.x + Math.cos(a) * rr, r.y + Math.sin(a) * rr); }
      ctx.closePath();
      ctx.fillStyle = withAlpha(col, 0.05 * fade); ctx.fill();
      ctx.strokeStyle = withAlpha(col, 0.55 * fade); ctx.lineWidth = 1.5 + 1.5 * fade; ctx.stroke();
    }
  }

  function drawAlerts(ctx, state, dt, time) {
    const list = state.alertPulses;
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i]; a.age += dt;
      if (a.age >= ALERT_LIFE || !a.from || !a.to) { list.splice(i, 1); continue; }
      const t = a.age / ALERT_LIFE, fade = 1 - t * t;
      const fx = a.from.x, fy = a.from.y, tx = a.to.x, ty = a.to.y;
      ctx.save();
      ctx.strokeStyle = withAlpha(COLORS.danger, 0.5 * fade); ctx.lineWidth = 1.4; ctx.setLineDash([3, 4]); ctx.lineDashOffset = -time * 40;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      // the signal packet travelling to the mate
      const px = fx + (tx - fx) * Math.min(1, t * 1.6), py = fy + (ty - fy) * Math.min(1, t * 1.6);
      ctx.fillStyle = withAlpha(COLORS.danger, fade); ctx.beginPath(); ctx.arc(px, py, 2.4, 0, TAU); ctx.fill();
      // radio waves at the source (three arcs)
      ctx.translate(fx, fy - (a.from.radius || 8) - 6); ctx.strokeStyle = withAlpha(COLORS.danger, fade); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      for (let w = 0; w < 3; w++) { const rr = 4 + w * 3.4 + t * 3; ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke(); }
      ctx.restore();
    }
  }

  function drawFrag(ctx, state, time) {
    for (const t of state.thrown ?? []) {
      const item = t.item;
      if (!item || (t.id !== 'frag' && t.id !== 'flash')) continue;
      const frac = clamp(1 - t.fuse / Math.max(0.01, item.fuse), 0, 1), hot = t.id === 'frag';
      const col = hot ? COLORS.danger : COLORS['tier-rare'];
      ctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(time * (8 + 14 * frac));
      ctx.fillStyle = withAlpha(col, (0.10 + 0.14 * frac) * (0.6 + 0.4 * pulse)); ctx.beginPath(); ctx.arc(t.x, t.y, item.radius, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = withAlpha(col, 0.8 + 0.2 * frac); ctx.lineWidth = 2.4; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -time * 30;
      ctx.beginPath(); ctx.arc(t.x, t.y, item.radius, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = withAlpha(col, 1); ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(t.x, t.y, item.radius * 0.96, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
      ctx.restore();
    }
  }

  function drawDodge(ctx, e) {
    if (!e.dodging || !e.dodgeDir) return;
    const d = e.dodgeDir;
    ctx.save();
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = 0.28 - i * 0.07; ctx.fillStyle = withAlpha(COLORS['text-hi'], 1);
      ctx.beginPath(); ctx.arc(e.x - d.x * i * 7, e.y - d.y * i * 7, (e.radius || 8) * (1 - i * 0.12), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 0.6; ctx.strokeStyle = withAlpha(COLORS['text-hi'], 1); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(e.x - d.x * 12, e.y - d.y * 12); ctx.lineTo(e.x - d.x * 26, e.y - d.y * 26); ctx.stroke();
    ctx.restore();
  }

  function drawIframes(ctx, state) {
    if (!(state.invuln > 0) || !state.player || state.mode !== 'play') return;
    const p = state.player, frac = clamp(state.invuln / 0.9, 0, 1);
    ctx.save(); ctx.strokeStyle = withAlpha(COLORS.armor, 0.75); ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(p.x, p.y, 15, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
    ctx.restore();
  }

  function draw(ctx, state, b, time, dt) {
    if (state.mode !== 'play' && state.mode !== 'dead') return;
    const inView = e => e.x > b.x0 - 450 && e.x < b.x1 + 450 && e.y > b.y0 - 450 && e.y < b.y1 + 450;
    ctx.save(); ctx.lineJoin = 'round';
    for (const e of state.enemies) {
      if (!e.alive || e.type === 'boss' || e.aware || e.posture === undefined || e.posture === 'sleep' || !inView(e)) continue;
      if ((e.stun || 0) > 0.3) continue;
      drawCone(ctx, state, e, time);
    }
    drawFrag(ctx, state, time);
    drawRings(ctx, state, dt);
    for (const e of state.enemies) {
      if (!e.alive || e.type === 'boss' || !inView(e)) continue;
      drawSuspicion(ctx, e, time);
      drawDodge(ctx, e);
    }
    drawAlerts(ctx, state, dt, time);
    drawIframes(ctx, state);
    ctx.restore();
  }

  return {draw};
}
