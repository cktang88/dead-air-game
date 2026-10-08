// Screen-space affordance layer: world interaction prompts, name tags, target highlight, off-screen arrows.
// Pure presentation; all "what can I do here" decisions come from interaction.js via state.interact.
import {drawIcon, ENEMY_ICON} from './icons.js';
import {hudSafeRects, placeEdgeArrow, clearShift} from './hud-safe.js';
import {nearestHostileRoom, promptParts} from './interaction.js';
import {hasTray, drawTray, trayHeight, TRAY_W} from './tray2d.js';

import {COLORS, FONTS, RADII} from './theme.js';
// Canvas prompts share the DOM design tokens (theme.js mirrors style.css): same fonts, panel fill, keycap and corner radii.
const FONT = FONTS.display;
const MONO = FONTS.mono;
const PANEL = COLORS.panel, PANEL_SOLID = COLORS['panel-solid'], TEXT_HI = COLORS['text-hi'], TEXT_MID = COLORS['text-mid'];
const TAU = Math.PI * 2;
import {clamp} from './util.js';
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const BAD = COLORS.danger, GREY = COLORS['text-low'];

const bannerShowing = () => typeof document !== 'undefined' && !!document.querySelector('#room-banner.show');
function hex(ctx, x, y, r, color) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const an = i * TAU / 6; ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); } ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.fillStyle = 'rgba(12,9,18,.9)'; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fill(); }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function outlinedText(ctx, text, x, y, fill, size, align = 'left', font = FONT, weight = 800) {
  ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(13,11,20,0.92)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function textW(ctx, text, size, font = FONT, weight = 800) { ctx.font = `${weight} ${size}px ${font}`; return ctx.measureText(text).width; }

function keycap(ctx, label, x, y, size, enabled, pulse) {
  const w = Math.max(size + 6, textW(ctx, label, size - 2, MONO, 500) + 12), h = size + 6, press = 1.5 * (1 - pulse);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(ctx, x - w / 2, y - h / 2 + 2, w, h, RADII.sm); ctx.fill();
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, enabled ? COLORS['key-top'] : '#26222e'); g.addColorStop(1, enabled ? COLORS['key-bottom'] : '#1d1a24');
  ctx.fillStyle = g; rr(ctx, x - w / 2, y - h / 2 + press, w, h, RADII.sm); ctx.fill();
  ctx.strokeStyle = enabled ? COLORS['key-edge'] : '#3a3542'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = enabled ? COLORS['key-edge'] : '#3a3542'; ctx.fillRect(x - w / 2 + 2, y + h / 2 - 2 + press, w - 4, 1.5);
  ctx.fillStyle = enabled ? TEXT_HI : COLORS['text-low']; ctx.font = `500 ${size - 2}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), x, y + 0.5 + press);
  ctx.restore();
  return w;
}

/** Create the layer. `anim` keeps per-target fade state. */
export function createAffordances() {
  const anim = new Map();
  let curKey = 'E';
  let t = 0;

  function toScreen(cam, x, y) { return {x: (x - cam.x) * cam.scale + cam.w / 2, y: (y - cam.y) * cam.scale + cam.h / 2}; }
  const onScreen = (p, cam, m = 0) => p.x > m && p.y > m && p.x < cam.w - m && p.y < cam.h - m;

  const uiK = () => { try { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-k')); return v > 0 ? v : 1; } catch { return 1; } };
  // floor guns and mods: an inspection tray (item in foam, tag, "swap with" half) instead of the one-line prompt
  function drawTrayPrompt(ctx, target, sp, key, a, scaleIn, cam) {
    const k = Math.min(1.6, uiK()) , w = TRAY_W * k, h = trayHeight(target) * k, ok = target.enabled;
    let cx = sp.x, top = sp.y - 44 - h * scaleIn - (1 - scaleIn) * 8;
    const sh = clearShift({x0: cx - w / 2 - 6, x1: cx + w / 2 + 6, y0: top - 4, y1: top + h + 12}, hudSafeRects(4), cam.w, cam.h, 160);
    if (sh && (sh.dx || sh.dy)) { cx += sh.dx; top += sh.dy; }
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, top + h / 2); ctx.scale((0.85 + 0.15 * scaleIn) * k, (0.85 + 0.15 * scaleIn) * k); ctx.translate(-TRAY_W / 2, -trayHeight(target) / 2);
    drawTray(ctx, target, 0, 0, {accent: target.color, ok, key: parts_key(target, key), t, drawKey: (label, x, y) => keycap(ctx, label, x, y, 15, ok, 0.5 + 0.5 * Math.sin(t * 6))});
    ctx.restore();
  }
  const parts_key = (target, key) => (target.keyed ? key : '');
  function drawPrompt(ctx, target, sp, key, a, scaleIn, cam) {
    if (hasTray(target)) return drawTrayPrompt(ctx, target, sp, key, a, scaleIn, cam);
    const parts = promptParts(target, key), ok = parts.enabled, pulse = 0.5 + 0.5 * Math.sin(t * 6);
    const accent = ok ? target.color : BAD, size = 15;
    const iconSz = 20, gap = 8;
    const kw = parts.key ? Math.max(size + 6, textW(ctx, parts.key, size - 2, MONO, 500) + 12) : 0;
    const headW = textW(ctx, parts.head, size + 1);
    const costW = parts.cost ? textW(ctx, parts.cost, size - 1) + 16 : 0;
    const subText = parts.reason || target.note || '';
    const subW = subText ? textW(ctx, subText, 11, MONO, 700) : 0;
    const line1 = (kw ? kw + gap : 0) + iconSz + gap + headW + (costW ? gap + costW : 0);
    const w = Math.max(line1, subW) + 22, h = subText ? 50 : 34;
    let cx = sp.x, top = sp.y - (target.kind === 'exit' ? 62 : 38) - h * scaleIn - (1 - scaleIn) * 8, tail = true;
    const sh = clearShift({x0: cx - w / 2 - 6, x1: cx + w / 2 + 6, y0: top - 4, y1: top + h + 12}, hudSafeRects(4), cam.w, cam.h, 140);   // the prompt is the one thing that must stay readable: slide it clear of the HUD
    if (sh && (sh.dx || sh.dy)) { cx += sh.dx; top += sh.dy; tail = false; }
    ctx.save();
    ctx.globalAlpha = a; ctx.translate(cx, top + h / 2); ctx.scale(0.8 + 0.2 * scaleIn, 0.8 + 0.2 * scaleIn); ctx.translate(-cx, -(top + h / 2));
    // pointer tail
    if (tail) { ctx.fillStyle = PANEL; ctx.beginPath(); ctx.moveTo(cx - 6, top + h - 1); ctx.lineTo(cx + 6, top + h - 1); ctx.lineTo(cx, top + h + 7); ctx.closePath(); ctx.fill(); }
    rr(ctx, cx - w / 2, top, w, h, RADII.md); ctx.fillStyle = PANEL; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = accent; ctx.globalAlpha = a * (0.7 + pulse * 0.3); ctx.stroke(); ctx.globalAlpha = a;
    let x = cx - w / 2 + 11; const y1 = top + 8 + 9;
    if (kw) { keycap(ctx, parts.key, x + kw / 2, y1, size, ok, pulse); x += kw + gap; }
    drawIcon(ctx, target.icon, x + iconSz / 2, y1, iconSz, accent); x += iconSz + gap;
    outlinedText(ctx, parts.head, x, y1, ok ? TEXT_HI : TEXT_MID, size + 1); x += headW;
    if (costW) {
      x += gap; rr(ctx, x, y1 - 10, costW, 20, RADII.sm); ctx.fillStyle = ok ? 'rgba(228,178,103,0.2)' : 'rgba(255,106,120,0.2)'; ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
      hex(ctx, x + 9, y1, 5, accent);
      ctx.fillStyle = ok ? COLORS.scrap : BAD; ctx.font = `800 ${size - 1}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(parts.cost.replace(' SCRAP', ''), x + 16, y1 + 0.5);
    }
    if (subText) outlinedText(ctx, subText, cx, top + h - 13, ok ? TEXT_MID : BAD, 11, 'center', MONO, 500);
    ctx.restore();
    void cam;
  }

  function drawTag(ctx, target, sp, alpha, withKey) {
    const label = target.kind === 'gate' ? `${target.cost} SCRAP` : target.kind === 'exit' ? (target.enabled ? 'EXTRACT' : 'EXIT · LOCKED') : target.subject;
    const size = 13, iconSz = 14, tw = textW(ctx, label, size), w = tw + iconSz + 18 + (withKey ? 25 : 0), h = 23;
    let x = sp.x - w / 2, y = sp.y - 34;
    const sh = clearShift({x0: x, x1: x + w, y0: y, y1: y + h}, hudSafeRects(4), ctx.canvas.clientWidth || 1e5, ctx.canvas.clientHeight || 1e5, 100);
    if (sh) { x += sh.dx; y += sh.dy; } else return;
    ctx.save(); ctx.globalAlpha = alpha;
    rr(ctx, x, y, w, h, RADII.md); ctx.fillStyle = PANEL; ctx.fill(); ctx.strokeStyle = target.kind === 'exit' && !target.enabled ? BAD : target.color; ctx.lineWidth = 1; ctx.stroke();
    let cx = x + 6;
    if (withKey) { keycap(ctx, curKey, cx + 10, y + h / 2 - 1, 13, true, 1); cx += 25; }
    drawIcon(ctx, target.icon, cx + iconSz / 2, y + h / 2, iconSz, target.color); cx += iconSz + 4;
    ctx.fillStyle = TEXT_HI; ctx.font = `800 ${size}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, y + h / 2 + 0.5);
    ctx.restore();
  }

  function drawHighlight(ctx, target, sp, scale, a) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5), r = ((target.kind === 'market' || target.kind === 'station') ? 30 : target.kind === 'gate' ? 22 : 17) * scale + pulse * 3;
    ctx.save(); ctx.globalAlpha = a * (0.55 + pulse * 0.4); ctx.strokeStyle = target.enabled ? target.color : BAD; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 18;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, TAU); ctx.stroke(); ctx.restore();
  }

  // Arrows hug the viewport edge but slide along it so neither the circle nor its label ever sits under DOM HUD (hud-safe.js).
  function edgeArrow(ctx, cam, from, to, color, label, alpha = 1, strong = false) {
    const dx = to.x - from.x, dy = to.y - from.y, ang = Math.atan2(dy, dx);
    const M = 30;   // marker radius + breathing room: the arrow hugs the real viewport edge
    const hx = cam.w / 2 - M, hy = cam.h / 2 - M, k = Math.min(Math.abs(hx / (Math.cos(ang) || 1e-6)), Math.abs(hy / (Math.sin(ang) || 1e-6)));
    const lw = textW(ctx, label, 13) + 30;
    const boxFor = (x, y) => (x > cam.w / 2 ? {x0: x - 17 - lw, x1: x + 17, y0: y - 18, y1: y + 18} : {x0: x - 17, x1: x + 17 + lw, y0: y - 18, y1: y + 18});
    const {x: ax, y: ay} = placeEdgeArrow({x: cam.w / 2 + Math.cos(ang) * k, y: cam.h / 2 + Math.sin(ang) * k}, cam.w, cam.h, M, boxFor, hudSafeRects());
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(ax, ay);
    if (strong) { ctx.strokeStyle = color; ctx.globalAlpha = alpha * 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 21 + pulse * 7, 0, TAU); ctx.stroke(); ctx.globalAlpha = alpha; }
    ctx.fillStyle = PANEL; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.rotate(ang); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(9 + pulse * 2, 0); ctx.lineTo(-4, -7); ctx.lineTo(-1, 0); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill(); ctx.rotate(-ang);
    const right = ax > cam.w / 2;
    outlinedText(ctx, label, right ? -25 : 25, 0, color, 13, right ? 'right' : 'left');
    ctx.restore();
  }

  function drawEnemyTags(ctx, state, cam) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const sp = toScreen(cam, e.x, e.y); if (!onScreen(sp, cam, -10)) continue;
      const r = (e.elite ? 17 : 12) * cam.scale, icon = ENEMY_ICON[e.type], col = e.elite ? COLORS.sprint : COLORS.danger;
      const bx = sp.x + r * 0.9, by = sp.y - r * 0.9;
      ctx.save(); ctx.globalAlpha = e.elite ? 1 : 0.85;
      ctx.fillStyle = PANEL; ctx.beginPath(); ctx.arc(bx, by, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      if (icon) drawIcon(ctx, icon, bx, by, 11, col);
      if (e.elite) {
        const text = `ELITE ${e.def?.name || ''}`.trim(), tw = textW(ctx, text, 12) / 2 + 6;
        let lx = sp.x, ly = sp.y + r + 12;
        const sh = clearShift({x0: lx - tw, x1: lx + tw, y0: ly - 9, y1: ly + 9}, hudSafeRects(4), cam.w, cam.h, 120);   // never under the HUD panels
        if (sh) { lx += sh.dx; ly += sh.dy; }
        outlinedText(ctx, text, lx, ly, COLORS.sprint, 12, 'center');
      }
      ctx.restore();
    }
  }

  return {
    draw(ctx, state, cam, dpr, dt, ready) {
      t += dt;
      const ui = state.interact; if (!ui || !state.player || state.mode !== 'play') return;
      curKey = ui.key || 'E';
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const active = ui.active, ambient = ui.ambient, seen = new Set();
      for (const tg of ui.targets) {
        const sp = toScreen(cam, tg.x, tg.y); if (!onScreen(sp, cam, -30)) continue;
        const isActive = tg === active || tg === ambient;
        if (tg.kind === 'pickup') {
          if (tg.distance < 150) { drawAutoTag(ctx, tg, sp, clamp(1 - (tg.distance - 90) / 60, 0, 1) * 0.95); }
          continue;
        }
        if (isActive) { seen.add(tg.id); const an = anim.get(tg.id) ?? 0; anim.set(tg.id, Math.min(1, an + dt * 6)); drawHighlight(ctx, tg, sp, cam.scale, ease(an));
          const hot = tg.kind === 'station' && state.enemies.some(e => e.alive && Math.hypot(e.x - state.player.x, e.y - state.player.y) < 520);
          if (hot) drawTag(ctx, {...tg, keyed: true}, sp, ease(an), true); else drawPrompt(ctx, tg, sp, ui.key, ease(an), ease(an), cam); }
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
          if (h && !bannerShowing()) { const hs = toScreen(cam, h.x, h.y); if (!onScreen(hs, cam, 20)) edgeArrow(ctx, cam, p, hs, '#ff8a6a', `CLEAR ROOM · ${h.hostiles}`, 0.8); }
        }
      }
      drawEnemyTags(ctx, state, cam);
      ctx.restore();
    },
  };

  function drawAutoTag(ctx, tg, sp, a) {
    if (a <= 0.02) return;
    const label = tg.subject, size = 11, iconSz = 12, w = textW(ctx, label, size) + iconSz + 14, h = 17;
    let x = sp.x - w / 2, y = sp.y - 28;
    const sh = clearShift({x0: x, x1: x + w, y0: y, y1: y + h}, hudSafeRects(4), ctx.canvas.clientWidth || 1e5, ctx.canvas.clientHeight || 1e5, 80);   // pickup tags never print under the HUD panels
    if (sh) { x += sh.dx; y += sh.dy; } else return;
    ctx.save(); ctx.globalAlpha = a;
    rr(ctx, x, y, w, h, RADII.sm); ctx.fillStyle = PANEL; ctx.fill(); ctx.strokeStyle = tg.color; ctx.lineWidth = 1; ctx.globalAlpha = a * 0.7; ctx.stroke(); ctx.globalAlpha = a;
    if (tg.pickupKind === 'scrap') hex(ctx, x + 8, y + h / 2, 5, tg.color); else drawIcon(ctx, tg.icon, x + 8, y + h / 2, iconSz, tg.color);
    ctx.fillStyle = TEXT_HI; ctx.font = `800 ${size}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + iconSz + 11, y + h / 2 + 0.5);
    ctx.restore();
  }
}
