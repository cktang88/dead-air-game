// World-space glyphs for the roguelike layer: door reward markers (Hades-style) and the FREQUENCY pickup.
// Hooked once from render2d.js after the lighting pass, so these read clearly in the dark.
import {REWARDS} from './door-rewards.js';
import {hudSafeRects, clearShift, boxHits} from './hud-safe.js';

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
  const tf = ctx.getTransform?.(), canvas = ctx.canvas, cssW = canvas?.clientWidth || 0, cssH = canvas?.clientHeight || 0;
  const k = tf && cssW ? canvas.width / cssW : 1, rects = tf && cssW ? hudSafeRects() : [];
  // Plates keep out from under the DOM HUD and out of each other's way (a nudged plate used to land its icon on a neighbour's label).
  // Markers the HUD does not touch are placed first; the rest then treat those placed plates as extra obstacles.
  const sc = tf && cssW ? tf.a / k : 0, toScreenPt = (x, y) => [(tf.a * x + tf.c * y + tf.e) / k, (tf.b * x + tf.d * y + tf.f) / k];
  // a freq reward marker sitting on its own radio pickup is a duplicate: the pickup model is the marker
  const dupFreq = (m) => (m.reward === 'freq' || m.info?.glyph === 'wave') && state.pickups.some(pk => pk.kind === 'freq' && pk.available && Math.hypot(pk.x - m.x * tile, pk.y - m.y * tile) < 48);
  const items = (state.doorMarkers || []).filter(m => !dupFreq(m)).map(m => {
    const info = m.info || REWARDS[m.reward];
    let x = m.x * tile, y = m.y * tile - 6;
    const halfW = Math.max(16, (info.label || '').length * 3.4) * sc + 6;
    const boxAt = (px, py) => { const [sx, sy] = toScreenPt(px, py); return {x0: sx - halfW, x1: sx + halfW, y0: sy - 18 * sc, y1: sy + 30 * sc}; };
    return {info, x, y, boxAt, hit: rects.length && sc > 0 && boxHits(boxAt(x, y), rects)};
  });
  const placed = [];
  for (const it of [...items.filter(i => !i.hit), ...items.filter(i => i.hit)]) {
    if (it.hit) {
      // a plate that has to move far from its door would mislead; the door is then behind the HUD itself, so the plate hides with it
      const sh = clearShift(it.boxAt(it.x, it.y), rects.concat(placed), cssW, cssH, state.signal?.active ? 260 : 72);
      if (sh) { it.x += sh.dx / sc; it.y += sh.dy / sc; } else it.skip = true;
    }
    if (sc > 0 && !it.skip) { const b = it.boxAt(it.x, it.y); placed.push({x0: b.x0 - 4, x1: b.x1 + 4, y0: b.y0 - 4, y1: b.y1 + 4}); }
  }
  for (const it of items) if (!it.skip) plate(ctx, it.x, it.y, it.info, t, true);
  for (const pk of state.pickups) {
    if (pk.kind !== 'freq' || !pk.available) continue;
    const info = REWARDS.freq, bob = Math.sin(t * 3 + pk.x) * 2.4;
    ctx.save(); ctx.translate(pk.x, pk.y + bob);
    for (let i = 0; i < 3; i++) { const r = 10 + ((t * 18 + i * 9) % 27); ctx.globalAlpha = Math.max(0, 0.6 - r / 45); ctx.strokeStyle = pk.elite ? REWARDS.elite.color : info.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;   // the radio pickup model is the marker; the old disc + glyph hid it
    ctx.restore();
  }
}
