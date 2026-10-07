// Canvas drawing for the live, non-baked world pieces of the onboarding/knowledge layer:
//   * closable doors (and the scripted Signal Check gates): two steel leaves that slide into the wall,
//   * glass panes (walk-blocking, see-through, bullet-through) and their shards,
//   * the ghost round hanging in the air in room 1 of the Signal Check.
// Called by render2d.js in world space, after the baked world and before the actors.
import {COLORS, withAlpha} from './theme.js';

const TAU = Math.PI * 2;
const TILE = 32;
const INK = '#120d1a';
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const inB = (b, x, y, m = 80) => x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m;

export function createDoorLayer() {
  function drawDoor(ctx, door, time, state) {
    const cx = door.x * TILE, cy = door.y * TILE, vertical = door.axis === 'y';   // axis 'y': the panel spans y (a vertical line)
    const span = door.cells.length * TILE, open = ease(clamp(door.openT)), half = span / 2;
    const closed = door.state === 'closed', gate = !!door.gate;
    const near = state.player && Math.hypot(state.player.x - cx, state.player.y - cy) < 150;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
    const lamp = closed ? (gate ? '#ffb04a' : COLORS.danger) : COLORS.slow;
    ctx.save(); ctx.translate(cx, cy); if (vertical) ctx.rotate(Math.PI / 2);
    // frame jambs stay when the door is open
    ctx.fillStyle = '#17141d'; ctx.fillRect(-half - 3, -7, 6, 14); ctx.fillRect(half - 3, -7, 6, 14);
    ctx.fillStyle = withAlpha(lamp, closed ? 0.55 + 0.45 * pulse : 0.9); ctx.fillRect(-half - 1.5, -2, 3, 4); ctx.fillRect(half - 1.5, -2, 3, 4);
    if (open < 1) {
      ctx.globalAlpha = 1 - open * open * 0.6;
      for (const side of [-1, 1]) {
        const w = half - 3, lx = side < 0 ? -half + 3 - open * (w - 2) : open * (w - 2);   // left leaf slides left, right leaf slides right
        ctx.fillStyle = 'rgba(8,6,12,0.7)'; ctx.fillRect(lx - 1, -8, w + 2, 17);
        const g = ctx.createLinearGradient(0, -6, 0, 6); g.addColorStop(0, gate ? '#3a3340' : '#4a5160'); g.addColorStop(1, gate ? '#221d28' : '#2a2f3a');
        ctx.fillStyle = g; ctx.fillRect(lx, -6, w, 12);
        if (gate) {
          ctx.save(); ctx.beginPath(); ctx.rect(lx, -6, w, 12); ctx.clip(); ctx.fillStyle = '#e9b23c';
          for (let x = lx - 14; x < lx + w + 14; x += 12) { ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x + 6, 6); ctx.lineTo(x + 12, -6); ctx.lineTo(x + 6, -6); ctx.closePath(); ctx.fill(); }
          ctx.restore();
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx + 2, -4.5); ctx.lineTo(lx + w - 2, -4.5); ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 1; k < 3; k++) ctx.fillRect(lx + (w * k) / 3 - 0.6, -5, 1.2, 10);
        }
        ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.strokeRect(lx, -6, w, 12);
      }
      // centre seam + status lamp
      if (open < 0.05) {
        ctx.fillStyle = INK; ctx.fillRect(-1, -7, 2, 14);
        ctx.fillStyle = withAlpha(lamp, 0.6 + 0.4 * pulse); ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    ctx.restore();
    // a peekable door whispers its affordance from afar: a small eye mark above it while the player is near
    if (closed && !gate && near && !state.peek) {
      ctx.save(); ctx.translate(cx, cy - (vertical ? half + 12 : 22)); ctx.globalAlpha = 0.55 + 0.35 * pulse;
      ctx.strokeStyle = withAlpha(COLORS['text-hi'], 0.9); ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(0, -6, 7, 0); ctx.quadraticCurveTo(0, 6, -7, 0); ctx.stroke();
      ctx.fillStyle = withAlpha(COLORS['text-hi'], 0.9); ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawGlass(ctx, state, b, time) {
    const list = state.glass;
    if (!list || !list.length) return;
    const has = (x, y) => list.some(g => g.x === x && g.y === y && !g.broken);
    for (const g of list) {
      if (g.broken || !inB(b, (g.x + 0.5) * TILE, (g.y + 0.5) * TILE, 40)) continue;
      const X = g.x * TILE, Y = g.y * TILE, vertical = has(g.x, g.y - 1) || has(g.x, g.y + 1);
      ctx.save(); ctx.translate(X, Y);
      const thick = 9, ox = vertical ? (TILE - thick) / 2 : 0, oy = vertical ? 0 : (TILE - thick) / 2, w = vertical ? thick : TILE, h = vertical ? TILE : thick;
      ctx.fillStyle = 'rgba(8,6,12,0.45)'; ctx.fillRect(ox - 1.5, oy - 1.5, w + 3, h + 3);
      const gr = ctx.createLinearGradient(ox, oy, ox + w, oy + h); gr.addColorStop(0, 'rgba(150,220,255,0.55)'); gr.addColorStop(0.5, 'rgba(200,240,255,0.3)'); gr.addColorStop(1, 'rgba(120,195,245,0.5)');
      ctx.fillStyle = gr; ctx.fillRect(ox, oy, w, h);
      ctx.strokeStyle = 'rgba(205,240,255,0.85)'; ctx.lineWidth = 1.1; ctx.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1);
      // a moving glint so it reads as glass, not a wall
      const k = (time * 0.35 + (vertical ? g.y : g.x) * 0.23) % 1;
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, w, h); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); if (vertical) { ctx.moveTo(ox, oy + k * (h + 10) - 10); ctx.lineTo(ox + w, oy + k * (h + 10) - 4); } else { ctx.moveTo(ox + k * (w + 10) - 10, oy); ctx.lineTo(ox + k * (w + 10) - 4, oy + h); }
      ctx.stroke(); ctx.restore();
      // posts at the ends of a run
      ctx.fillStyle = '#3a3f4c';
      if (vertical) { if (!has(g.x, g.y - 1)) ctx.fillRect(ox - 1, oy, w + 2, 3); if (!has(g.x, g.y + 1)) ctx.fillRect(ox - 1, oy + h - 3, w + 2, 3); }
      ctx.restore();
    }
  }

  function drawGhostRounds(ctx, state, b, time) {
    for (const p of state.signal?.props || []) {
      if (p.kind !== 'ghost-round' || !inB(b, p.x, p.y, 120)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(time * 5), col = COLORS.slow;
      ctx.save();
      // tracer back to where it hung
      ctx.setLineDash([5, 6]); ctx.lineDashOffset = -time * 8; ctx.strokeStyle = withAlpha(col, 0.35); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p.resetX, p.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.translate(p.x, p.y);
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26); glow.addColorStop(0, withAlpha(col, 0.55)); glow.addColorStop(1, withAlpha(col, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.5 + 0.5 * pulse; ctx.strokeStyle = withAlpha(col, 0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 11 + pulse * 3, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      // the round: a capsule pointing along its travel
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 4.6, 0, 0, TAU); ctx.fill();
      const body = ctx.createLinearGradient(-8, 0, 9, 0); body.addColorStop(0, '#7fb6c8'); body.addColorStop(1, '#eaffff');
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(4, 0, 3.2, 2.2, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  return {
    draw(ctx, state, b, time) {
      drawGlass(ctx, state, b, time);
      for (const door of state.doorProps || []) { if (inB(b, door.x * TILE, door.y * TILE, 60)) drawDoor(ctx, door, time, state); }
      drawGhostRounds(ctx, state, b, time);
    },
  };
}
