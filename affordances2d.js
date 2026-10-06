// Screen-space affordance layer: world interaction prompts, name tags, target highlight, off-screen arrows.
// Pure presentation; all "what can I do here" decisions come from interaction.js via state.interact.
import {drawIcon, ENEMY_ICON} from './icons.js';
import {nearestHostileRoom, promptParts} from './interaction.js';

const FONT = "'Barlow Condensed','DM Mono',system-ui,sans-serif";
const MONO = "'DM Mono',ui-monospace,monospace";
const TAU = Math.PI * 2;
import {clamp} from './util.js';
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const BAD = '#ff6a78', GREY = '#8d8a96';

function hex(ctx, x, y, r, color) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const an = i * TAU / 6; ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); } ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.fillStyle = 'rgba(12,9,18,.9)'; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fill(); }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function outlinedText(ctx, text, x, y, fill, size, align = 'left', font = FONT, weight = 800) {
  ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(12,9,18,0.92)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function textW(ctx, text, size, font = FONT, weight = 800) { ctx.font = `${weight} ${size}px ${font}`; return ctx.measureText(text).width; }

function keycap(ctx, label, x, y, size, enabled, pulse) {
  const w = Math.max(size + 6, textW(ctx, label, size - 2, MONO, 800) + 10), h = size + 6;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, x - w / 2, y - h / 2 + 3, w, h, 5); ctx.fill();
  ctx.fillStyle = enabled ? '#f3e9d3' : '#5a5662'; rr(ctx, x - w / 2, y - h / 2 + 1.5 * (1 - pulse), w, h, 5); ctx.fill();
  ctx.strokeStyle = enabled ? '#fff7e2' : '#77737f'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = enabled ? '#1c1624' : '#aaa6b2'; ctx.font = `800 ${size - 2}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1 + 1.5 * (1 - pulse));
  ctx.restore();
  return w;
}

/** Create the layer. `anim` keeps per-target fade state. */
export function createAffordances() {
  const anim = new Map();
  let t = 0;

  function toScreen(cam, x, y) { return {x: (x - cam.x) * cam.scale + cam.w / 2, y: (y - cam.y) * cam.scale + cam.h / 2}; }
  const onScreen = (p, cam, m = 0) => p.x > m && p.y > m && p.x < cam.w - m && p.y < cam.h - m;

  function drawPrompt(ctx, target, sp, key, a, scaleIn, cam) {
    const parts = promptParts(target, key), ok = parts.enabled, pulse = 0.5 + 0.5 * Math.sin(t * 6);
    const accent = ok ? target.color : BAD, size = 15;
    const iconSz = 20, gap = 8;
    const kw = parts.key ? Math.max(size + 6, textW(ctx, parts.key, size - 2, MONO, 800) + 10) : 0;
    const headW = textW(ctx, parts.head, size + 1);
    const costW = parts.cost ? textW(ctx, parts.cost, size - 1) + 16 : 0;
    const subText = parts.reason || target.note || '';
    const subW = subText ? textW(ctx, subText, 11, MONO, 700) : 0;
    const line1 = (kw ? kw + gap : 0) + iconSz + gap + headW + (costW ? gap + costW : 0);
    const w = Math.max(line1, subW) + 22, h = subText ? 50 : 34;
    const cx = sp.x, top = sp.y - (target.kind === 'exit' ? 62 : 38) - h * scaleIn - (1 - scaleIn) * 8;
    ctx.save();
    ctx.globalAlpha = a; ctx.translate(cx, top + h / 2); ctx.scale(0.8 + 0.2 * scaleIn, 0.8 + 0.2 * scaleIn); ctx.translate(-cx, -(top + h / 2));
    // pointer tail
    ctx.fillStyle = 'rgba(16,12,24,0.92)'; ctx.beginPath(); ctx.moveTo(cx - 6, top + h - 1); ctx.lineTo(cx + 6, top + h - 1); ctx.lineTo(cx, top + h + 7); ctx.closePath(); ctx.fill();
    rr(ctx, cx - w / 2, top, w, h, 8); ctx.fillStyle = 'rgba(16,12,24,0.92)'; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = accent; ctx.globalAlpha = a * (0.7 + pulse * 0.3); ctx.stroke(); ctx.globalAlpha = a;
    let x = cx - w / 2 + 11; const y1 = top + 8 + 9;
    if (kw) { keycap(ctx, parts.key, x + kw / 2, y1, size, ok, pulse); x += kw + gap; }
    drawIcon(ctx, target.icon, x + iconSz / 2, y1, iconSz, accent); x += iconSz + gap;
    outlinedText(ctx, parts.head, x, y1, ok ? '#fff6e6' : '#cfc9d4', size + 1); x += headW;
    if (costW) {
      x += gap; rr(ctx, x, y1 - 10, costW, 20, 5); ctx.fillStyle = ok ? 'rgba(255,176,74,0.22)' : 'rgba(255,90,105,0.22)'; ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
      hex(ctx, x + 9, y1, 5, accent);
      ctx.fillStyle = ok ? '#ffd27a' : BAD; ctx.font = `800 ${size - 1}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(parts.cost.replace(' SCRAP', ''), x + 16, y1 + 0.5);
    }
    if (subText) outlinedText(ctx, subText, cx, top + h - 13, ok ? '#a9a3b4' : BAD, 11, 'center', MONO, 700);
    ctx.restore();
    void cam;
  }

  function drawTag(ctx, target, sp, alpha, withKey) {
    const label = target.kind === 'gate' ? `${target.cost} SCRAP` : target.kind === 'exit' ? (target.enabled ? 'EXTRACT' : 'EXIT · LOCKED') : target.subject;
    const size = 12, iconSz = 14, tw = textW(ctx, label, size), w = tw + iconSz + 18 + (withKey ? 16 : 0), h = 20;
    const x = sp.x - w / 2, y = sp.y - 34;
    ctx.save(); ctx.globalAlpha = alpha;
    rr(ctx, x, y, w, h, 6); ctx.fillStyle = 'rgba(16,12,24,0.8)'; ctx.fill(); ctx.strokeStyle = target.kind === 'exit' && !target.enabled ? BAD : target.color; ctx.lineWidth = 1; ctx.stroke();
    let cx = x + 6;
    if (withKey) { ctx.fillStyle = target.color; ctx.font = `800 9px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('E', cx + 4, y + h / 2 + 0.5); cx += 11; }
    drawIcon(ctx, target.icon, cx + iconSz / 2, y + h / 2, iconSz, target.color); cx += iconSz + 4;
    ctx.fillStyle = '#f3ead8'; ctx.font = `800 ${size}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, y + h / 2 + 0.5);
    ctx.restore();
  }

  function drawHighlight(ctx, target, sp, scale, a) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5), r = ((target.kind === 'market' || target.kind === 'station') ? 30 : target.kind === 'gate' ? 22 : 17) * scale + pulse * 3;
    ctx.save(); ctx.globalAlpha = a * (0.55 + pulse * 0.4); ctx.strokeStyle = target.enabled ? target.color : BAD; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 18;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, TAU); ctx.stroke(); ctx.restore();
  }

  function edgeArrow(ctx, cam, from, to, color, label, alpha = 1, strong = false) {
    const dx = to.x - from.x, dy = to.y - from.y, ang = Math.atan2(dy, dx);
    const hx = cam.w / 2 - 60, hy = cam.h / 2 - 125, k = Math.min(Math.abs(hx / (Math.cos(ang) || 1e-6)), Math.abs(hy / (Math.sin(ang) || 1e-6)));
    const ax = cam.w / 2 + Math.cos(ang) * k, ay = cam.h / 2 + Math.sin(ang) * k, pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(ax, ay);
    if (strong) { ctx.strokeStyle = color; ctx.globalAlpha = alpha * 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 21 + pulse * 7, 0, TAU); ctx.stroke(); ctx.globalAlpha = alpha; }
    ctx.fillStyle = 'rgba(16,12,24,0.85)'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.rotate(ang); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(9 + pulse * 2, 0); ctx.lineTo(-4, -7); ctx.lineTo(-1, 0); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill(); ctx.rotate(-ang);
    const right = ax > cam.w / 2;
    outlinedText(ctx, label, right ? -25 : 25, 0, color, 12, right ? 'right' : 'left');
    ctx.restore();
  }

  function drawEnemyTags(ctx, state, cam) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const sp = toScreen(cam, e.x, e.y); if (!onScreen(sp, cam, -10)) continue;
      const r = (e.elite ? 17 : 12) * cam.scale, icon = ENEMY_ICON[e.type], col = e.elite ? '#ffb27a' : '#ff8d99';
      const bx = sp.x + r * 0.9, by = sp.y - r * 0.9;
      ctx.save(); ctx.globalAlpha = e.elite ? 1 : 0.85;
      ctx.fillStyle = 'rgba(16,12,24,0.82)'; ctx.beginPath(); ctx.arc(bx, by, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      if (icon) drawIcon(ctx, icon, bx, by, 11, col);
      if (e.elite) outlinedText(ctx, `ELITE ${e.def?.name || ''}`.trim(), sp.x, sp.y + r + 11, '#ffb27a', 11, 'center');
      ctx.restore();
    }
  }

  return {
    draw(ctx, state, cam, dpr, dt, ready) {
      t += dt;
      const ui = state.interact; if (!ui || !state.player || state.mode !== 'play') return;
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const active = ui.active, ambient = ui.ambient, seen = new Set();
      for (const tg of ui.targets) {
        const sp = toScreen(cam, tg.x, tg.y); if (!onScreen(sp, cam, -30)) continue;
        const isActive = tg === active || tg === ambient;
        if (tg.kind === 'pickup') {
          if (tg.distance < 150) { drawAutoTag(ctx, tg, sp, clamp(1 - (tg.distance - 90) / 60, 0, 1) * 0.95); }
          continue;
        }
        if (isActive) { seen.add(tg.id); const an = anim.get(tg.id) ?? 0; anim.set(tg.id, Math.min(1, an + dt * 6)); drawHighlight(ctx, tg, sp, cam.scale, ease(an)); drawPrompt(ctx, tg, sp, ui.key, ease(an), ease(an), cam); }
        else { const a = clamp(1 - (tg.distance - 160) / 140, 0.35, 0.95); drawTag(ctx, tg, sp, a, tg.keyed); }
      }
      for (const id of [...anim.keys()]) if (!seen.has(id)) anim.delete(id);
      // off-screen guidance
      const p = toScreen(cam, state.player.x, state.player.y);
      for (const pk of state.pickups) {
        if (pk.kind !== 'exit' || !pk.available) continue;
        const sp = toScreen(cam, pk.x, pk.y);
        if (onScreen(sp, cam, 20)) break;
        if (ready) { const m = Math.round(Math.hypot(pk.x - state.player.x, pk.y - state.player.y) / 32); edgeArrow(ctx, cam, p, sp, '#6dffb0', `EXTRACT · ${m} M`, 0.75 + 0.25 * Math.sin(t * 5), true); }
        else {
          const h = nearestHostileRoom({player: state.player, rooms: state.rooms, enemies: state.enemies});
          if (h) { const hs = toScreen(cam, h.x, h.y); if (!onScreen(hs, cam, 20)) edgeArrow(ctx, cam, p, hs, '#ff8a6a', `CLEAR ROOM · ${h.hostiles}`, 0.8); }
        }
      }
      drawEnemyTags(ctx, state, cam);
      ctx.restore();
    },
  };

  function drawAutoTag(ctx, tg, sp, a) {
    if (a <= 0.02) return;
    const label = tg.subject, size = 11, iconSz = 12, w = textW(ctx, label, size) + iconSz + 14, h = 17, x = sp.x - w / 2, y = sp.y - 28;
    ctx.save(); ctx.globalAlpha = a;
    rr(ctx, x, y, w, h, 5); ctx.fillStyle = 'rgba(16,12,24,0.72)'; ctx.fill(); ctx.strokeStyle = tg.color; ctx.lineWidth = 1; ctx.globalAlpha = a * 0.7; ctx.stroke(); ctx.globalAlpha = a;
    if (tg.pickupKind === 'scrap') hex(ctx, x + 8, y + h / 2, 5, tg.color); else drawIcon(ctx, tg.icon, x + 8, y + h / 2, iconSz, tg.color);
    ctx.fillStyle = '#f3ead8'; ctx.font = `800 ${size}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + iconSz + 11, y + h / 2 + 0.5);
    ctx.restore();
  }
}
