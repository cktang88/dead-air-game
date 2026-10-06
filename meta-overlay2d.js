// World-space glyphs for the roguelike layer: door reward markers (Hades-style) and the FREQUENCY pickup.
// Hooked once from render2d.js after the lighting pass, so these read clearly in the dark.
import {REWARDS} from './door-rewards.js';

const TAU = Math.PI * 2;
const INK = '#120d1a';

export function glyph(ctx, kind, r, color) {
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1.4, r * 0.18);
  if (kind === 'wave') {
    ctx.beginPath(); for (let i = 0; i <= 16; i++) { const x = -r + i * r * 2 / 16, y = Math.sin(i / 16 * TAU * 1.5) * r * 0.55; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  } else if (kind === 'hex') {
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); } ctx.closePath(); ctx.fill();
  } else if (kind === 'gun') {
    ctx.fillRect(-r, -r * 0.18, r * 1.7, r * 0.42); ctx.fillRect(-r * 0.2, 0, r * 0.4, r * 0.8); ctx.fillRect(r * 0.5, -r * 0.4, r * 0.5, r * 0.3);
  } else if (kind === 'cross') {
    ctx.fillRect(-r * 0.28, -r * 0.85, r * 0.56, r * 1.7); ctx.fillRect(-r * 0.85, -r * 0.28, r * 1.7, r * 0.56);
  } else if (kind === 'crate') {
    ctx.strokeRect(-r * 0.75, -r * 0.6, r * 1.5, r * 1.2); ctx.beginPath(); ctx.moveTo(-r * 0.75, 0); ctx.lineTo(r * 0.75, 0); ctx.moveTo(0, -r * 0.6); ctx.lineTo(0, r * 0.6); ctx.stroke();
  } else if (kind === 'skull') {
    ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.72, Math.PI, 0); ctx.lineTo(r * 0.5, r * 0.6); ctx.lineTo(-r * 0.5, r * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.1, r * 0.2, 0, TAU); ctx.arc(r * 0.28, -r * 0.1, r * 0.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function plate(ctx, x, y, info, t, label) {
  const bob = Math.sin(t * 2.4 + x * 0.05) * 1.6, R = 13;
  ctx.save(); ctx.translate(x, y + bob);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 34); glow.addColorStop(0, info.color + '88'); glow.addColorStop(1, info.color + '00');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(14,10,22,.88)'; ctx.strokeStyle = info.color; ctx.lineWidth = 1.6;
  ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + TAU / 12; ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); } ctx.closePath(); ctx.fill(); ctx.stroke();
  glyph(ctx, info.glyph, 7.5, info.color);
  if (label) {
    ctx.font = '800 8px "Barlow Condensed", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(12,9,18,.95)'; ctx.strokeText(info.label, 0, R + 9); ctx.fillStyle = info.color; ctx.fillText(info.label, 0, R + 9);
  }
  ctx.restore();
}

// markers: state.doorMarkers ([{x,y (tiles),reward,info}]); pickups of kind 'freq' glow in the world.
export function drawMetaWorld(ctx, state, now, tile = 32) {
  const t = now;
  for (const m of state.doorMarkers || []) plate(ctx, m.x * tile, m.y * tile - 6, m.info || REWARDS[m.reward], t, true);
  for (const pk of state.pickups) {
    if (pk.kind !== 'freq' || !pk.available) continue;
    const info = REWARDS.freq, bob = Math.sin(t * 3 + pk.x) * 2.4;
    ctx.save(); ctx.translate(pk.x, pk.y + bob);
    for (let i = 0; i < 3; i++) { const r = 10 + ((t * 18 + i * 9) % 27); ctx.globalAlpha = Math.max(0, 0.6 - r / 45); ctx.strokeStyle = pk.elite ? REWARDS.elite.color : info.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(14,10,22,.9)'; ctx.strokeStyle = pk.elite ? REWARDS.elite.color : info.color; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.stroke(); glyph(ctx, pk.elite ? 'skull' : 'wave', 7, pk.elite ? REWARDS.elite.color : info.color);
    ctx.restore();
  }
}
