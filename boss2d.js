// Canvas art for THE CONDUCTOR and its telegraphs. Hooked from render2d.js: drawBoss() replaces drawEnemy for
// type 'boss', drawBossTelegraph() runs in the telegraph pass (after lighting, so warnings stay bright).
// Everything is drawn in world units, facing the player; no sprite sheets.
import {ACTOR_LOOK} from './sprites2d.js';
import {BOSS} from './boss.js';
import {drawConductor} from './conductor2d.js';
import {getMusicBeat} from './music.js';

const getBeat = () => { try { return getMusicBeat(); } catch { return null; } };

const TAU = Math.PI * 2;
const INK = '#120d1a';

// Shadow / sight code reads ACTOR_LOOK[type]; register the boss without editing sprites2d.js.
ACTOR_LOOK.boss = {r: 22, color: '#8a2f7a', half: 48};

const PHASE_COLORS = ['#8a2f7a', '#c13a6a', '#ff6a58'];

function wedge(ctx, x, y, a0, a1, r0, r1) {
  ctx.beginPath(); ctx.arc(x, y, r1, a0, a1); ctx.arc(x, y, r0, a1, a0, true); ctx.closePath();
}

export function drawBoss(ctx, e, now) {
  const b = e.boss || {}, v = e.vis ??= {};
  const phase = b.phase || 1, col = PHASE_COLORS[phase - 1];
  const t = now, dead = !e.alive;
  const face = Math.atan2((e.face?.y ?? 0), (e.face?.x ?? 1)) || 0;
  v.bossAng = v.bossAng === undefined ? face : v.bossAng + Math.atan2(Math.sin(face - v.bossAng), Math.cos(face - v.bossAng)) * 0.12;
  const ang = v.bossAng, winding = b.telegraph ? b.telegraph.progress : 0, charging = b.mode === 'charge';
  ctx.save(); ctx.translate(e.x, e.y);
  if (dead) ctx.globalAlpha = Math.max(0, Math.min(1, (e.corpseTimer ?? 0) / 0.6));   // the death animation plays out (conductor2d.js); only the last moments fade
  // soft aura keyed to phase
  const aura = ctx.createRadialGradient(0, 0, 8, 0, 0, 52);
  aura.addColorStop(0, col + (dead ? '11' : '66')); aura.addColorStop(1, col + '00');
  ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, 0, 52, 0, TAU); ctx.fill();
  // the body: a stacked model (tailcoat, broadcast mast, CRT head, baton) with its own conducting animation
  if (v.bowT > 0) { const k = Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - v.bowT / 2.4))); ctx.save(); ctx.rotate(ang); ctx.translate(5 * k, 0); ctx.scale(1 - 0.16 * k, 1 + 0.04 * k); ctx.rotate(-ang); drawConductor(ctx, e, v, t, ang, getBeat()); ctx.restore(); }   // the bow easter egg
  else drawConductor(ctx, e, v, t, ang, getBeat());
  if (e.alive && phase === 2 && b.mode !== 'intro' && b.mode !== 'shift') {
    // TEMPO: a clock ring around him whose hand sweeps only as fast as you move; bright = running, dim = frozen.
    const k = b.tempo ?? 1; v.tempoAng = (v.tempoAng || 0) + k * 0.06;
    ctx.strokeStyle = '#ffd27a'; ctx.globalAlpha = 0.25 + 0.5 * k; ctx.lineWidth = 1.6; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(Math.cos(v.tempoAng) * 34, Math.sin(v.tempoAng) * 34); ctx.lineTo(Math.cos(v.tempoAng) * 46, Math.sin(v.tempoAng) * 46); ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (e.alive && phase === 3 && b.mode === 'beat') {
    const st = b.stage, on = st === 'mark' || st === 'fire';
    ctx.strokeStyle = on ? '#ffffff' : '#ff6a86'; ctx.globalAlpha = on ? 0.9 : 0.4; ctx.lineWidth = on ? 3 : 1.5; ctx.beginPath(); ctx.arc(0, 0, on ? 44 : 38, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (e.alive) {
    // orbiting note glyphs
    ctx.fillStyle = col;
    for (let i = 0; i < 4; i++) {
      const a = t * 1.4 + i * TAU / 4, r = 34 + Math.sin(t * 2 + i) * 3;
      ctx.globalAlpha = 0.75; ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r); ctx.rotate(a); ctx.fillRect(-2, -2, 4, 4); ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (b.invuln) { ctx.strokeStyle = '#8fe8ff'; ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 12); ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(0, 0, 30, t, t + TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    if (b.exposed > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 18); ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  }
  ctx.restore();
}

// World-space warning art. Everything here is generous: it starts early and fills as the strike approaches.
export function drawBossTelegraph(ctx, e, now) {
  const b = e.boss, tg = b?.telegraph;
  if (!tg || !e.alive) return;
  const t = now, p = tg.progress, ang = tg.angle, locked = tg.locked;
  const base = locked ? '#ff3050' : '#ff8a9a', a = 0.12 + 0.3 * p;
  ctx.save();
  ctx.lineWidth = 1.5; ctx.strokeStyle = base; ctx.fillStyle = base;
  if (tg.kind === 'fan' || tg.kind === 'sweep') {
    const half = tg.kind === 'fan' ? (b.phase === 3 ? 0.55 : 0.45) : 0.7;
    const center = ang;
    ctx.globalAlpha = a; wedge(ctx, e.x, e.y, center - half, center + half, 24, 270); ctx.fill();
    ctx.globalAlpha = 0.5 + 0.4 * p; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(e.x + Math.cos(center + s * half) * 24, e.y + Math.sin(center + s * half) * 24); ctx.lineTo(e.x + Math.cos(center + s * half) * 270, e.y + Math.sin(center + s * half) * 270); ctx.stroke(); }
  } else if (tg.kind === 'beat') {
    // BEATDROP: a laser-straight line locked on the beat. MARK draws it; MOVE (the off-beat) pulses it green-to-red: step off now.
    const len = 520, w = 16, move = tg.stage === 'move', pulse = 0.5 + 0.5 * Math.sin(t * 22);
    ctx.translate(e.x, e.y); ctx.rotate(ang);
    ctx.globalAlpha = move ? 0.16 + 0.16 * pulse : 0.1; ctx.fillStyle = '#ff3050'; ctx.fillRect(24, -w, len, w * 2);
    ctx.globalAlpha = move ? 0.95 : 0.6; ctx.strokeStyle = move ? '#ffffff' : '#ff6a86'; ctx.lineWidth = move ? 2.2 : 1.4;
    ctx.beginPath(); ctx.moveTo(24, -w); ctx.lineTo(len, -w); ctx.moveTo(24, w); ctx.lineTo(len, w); ctx.stroke();
    if (move) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff'; for (let x = 60; x < len; x += 64) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x + 14, 0); ctx.lineTo(x, 6); ctx.closePath(); ctx.fill(); } }
  } else if (tg.kind === 'ring' && tg.ring) {
    const {count, step, width, index} = tg.ring;
    const R = 34 + p * 22;
    for (let i = 0; i < count; i++) {
      const offset = ((i - index) % count + count) % count, gap = offset < width, aa = i * step;
      ctx.globalAlpha = gap ? 0.9 : 0.35 + 0.55 * p;
      ctx.fillStyle = gap ? '#7dffb0' : base;
      ctx.beginPath(); ctx.arc(e.x + Math.cos(aa) * R, e.y + Math.sin(aa) * R, gap ? 2 : 3.4, 0, TAU); ctx.fill();
      if (gap && offset === Math.floor(width / 2)) { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 10); ctx.strokeStyle = '#7dffb0'; ctx.beginPath(); ctx.moveTo(e.x + Math.cos(aa) * R, e.y + Math.sin(aa) * R); ctx.lineTo(e.x + Math.cos(aa) * (R + 70), e.y + Math.sin(aa) * (R + 70)); ctx.stroke(); }
    }
    ctx.globalAlpha = 0.18 + 0.3 * p; ctx.strokeStyle = base; ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, TAU); ctx.stroke();
  } else if (tg.kind === 'charge') {
    // CHARGE: the lane is exactly the hit width. Dim and pulsing while he still tracks you, then LOCKED: solid red, bright edges,
    // chevrons racing down the lane and an X marking where he ends up. Step sideways out of the lane.
    const len = BOSS.chargeSpeed * BOSS.chargeTime, w = BOSS.chargeHitRadius, pulse = 0.5 + 0.5 * Math.sin(t * (locked ? 26 : 12));
    ctx.translate(e.x, e.y); ctx.rotate(ang);
    ctx.globalAlpha = locked ? 0.22 + 0.2 * pulse : 0.08 + 0.1 * p; ctx.fillStyle = '#ff3050'; ctx.fillRect(0, -w, len, w * 2);
    ctx.globalAlpha = locked ? 1 : 0.55; ctx.strokeStyle = locked ? '#ffffff' : '#ff8a9a'; ctx.lineWidth = locked ? 3 : 1.5; ctx.strokeRect(0, -w, len, w * 2);
    ctx.globalAlpha = locked ? 0.95 : 0.5; ctx.strokeStyle = '#ff3050'; ctx.fillStyle = '#ff3050'; ctx.lineWidth = 2.5;
    const slide = (t * (locked ? 180 : 60)) % 46;
    for (let x = 20 + slide; x < len - 14; x += 46) { ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + 14, 0); ctx.lineTo(x, 10); ctx.stroke(); }
    ctx.translate(len, 0); ctx.rotate(t * (locked ? 3 : 1)); // end-of-lane target marker
    ctx.globalAlpha = locked ? 1 : 0.6; ctx.strokeStyle = locked ? '#ffffff' : '#ff8a9a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, w * .75, 0, TAU); ctx.moveTo(-w, 0); ctx.lineTo(w, 0); ctx.moveTo(0, -w); ctx.lineTo(0, w); ctx.stroke();
  } else if (tg.kind === 'lob') {
    // LOB: a marked spot that tracks you, then locks; the burst rises from THAT spot, so cover does not save you from it.
    const at = tg.target; if (at) {
      const pulse = 0.5 + 0.5 * Math.sin(t * (locked ? 24 : 10)), R = 46;
      ctx.globalAlpha = 0.18 + 0.2 * pulse * (locked ? 1 : .5); ctx.fillStyle = '#ff3050'; ctx.beginPath(); ctx.arc(at.x, at.y, R, 0, TAU); ctx.fill();
      ctx.globalAlpha = locked ? 1 : 0.6; ctx.strokeStyle = locked ? '#ffffff' : '#ff8a9a'; ctx.lineWidth = locked ? 3 : 1.6; ctx.beginPath(); ctx.arc(at.x, at.y, R * (locked ? 1 : 1 - .25 * Math.sin(t * 8) ** 2), 0, TAU); ctx.stroke();
      for (let i = 0; i < at.count; i++) {
        const a2 = i * at.step, off = ((i - at.gapStart) % at.count + at.count) % at.count, safe = off < at.gap;
        ctx.strokeStyle = safe ? '#7dffb0' : locked ? '#ffffff' : '#ff8a9a'; ctx.globalAlpha = safe ? 0.8 : locked ? 1 : 0.6; ctx.lineWidth = safe ? 1.4 : 2.4;
        ctx.beginPath(); ctx.moveTo(at.x + Math.cos(a2) * 8, at.y + Math.sin(a2) * 8); ctx.lineTo(at.x + Math.cos(a2) * (R + (safe ? 30 : 60)), at.y + Math.sin(a2) * (R + (safe ? 30 : 60))); ctx.stroke();
      }
      ctx.strokeStyle = '#ff8a9a';
      ctx.globalAlpha = 0.35; ctx.setLineDash([4, 8]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.quadraticCurveTo((e.x + at.x) / 2, Math.min(e.y, at.y) - 60, at.x, at.y); ctx.stroke(); ctx.setLineDash([]);
    }
  } else if (tg.kind === 'spiral') {
    const arms = b.phase === 3 ? 3 : 2;
    ctx.globalAlpha = 0.3 + 0.5 * p;
    for (let i = 0; i < arms; i++) { const a2 = ang + t * 3 + i * TAU / arms; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a2) * 150, e.y + Math.sin(a2) * 150); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(e.x, e.y, 30 + p * 14, 0, TAU); ctx.stroke();
  } else if (tg.kind === 'summon') {
    ctx.globalAlpha = 0.25 + 0.55 * p; ctx.strokeStyle = '#d58cff'; ctx.fillStyle = '#d58cff';
    for (let i = 0; i < 3; i++) { const a2 = t * 2 + i * TAU / 3; ctx.beginPath(); ctx.arc(e.x + Math.cos(a2) * 62, e.y + Math.sin(a2) * 62, 6 + p * 5, 0, TAU); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(e.x, e.y, 36 + p * 10, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
