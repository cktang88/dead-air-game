// DEAD AIR stance glyphs: one small mark above an aware enemy's head that names what its squad is doing.
// Pillar 2 (read, then commit): intent is never hidden. The glyph is deliberately tiny and uses the same ink-outlined,
// flat-colour language as the "!" and "?" marks in render2d.js. Pure drawing: no state, no allocation beyond the call.
//
//   suppress  three tracer ticks aimed at you   (pinning you down: do not stand in the lane)
//   flank     a chevron pointing along its route (it is going around)
//   fallback  two chevrons pointing away         (hurt: breaking line of sight, falling back to allies)
//   push      a solid arrow toward you           (you are reloading or hurt: it is coming)
//   flee      a warning triangle                 (a grenade is about to go off here)
//   hold      a flat bar                         (waiting at the corner for the rest of the pack)
//   enrage    two red spikes                     (a brute whose ally just fell)
//   wary      three dots                         (rattled: keeping its head down)

const TAU = Math.PI * 2;
const INK = 'rgba(14,10,20,0.95)';
const COLORS = {suppress: '#ff7a5c', flank: '#ffd86e', fallback: '#9fd0ff', push: '#ff4a5e', flee: '#ffd86e', hold: '#c7d0dc', enrage: '#ff3a50', wary: '#c7d0dc'};

export const STANCE_GLYPHS = Object.freeze(Object.keys(COLORS));

function chevron(ctx, x, y, s) {   // points +x
  ctx.beginPath(); ctx.moveTo(x - s * 0.6, y - s); ctx.lineTo(x + s * 0.6, y); ctx.lineTo(x - s * 0.6, y + s); ctx.stroke();
}

// `e` needs {x, y, stance, face:{x,y}, id}; `top` is the y offset above the body where the glyph hovers.
export function drawStanceGlyph(ctx, e, top, time) {
  const color = COLORS[e.stance];
  if (!color) return;
  const fx = e.face?.x ?? 1, fy = e.face?.y ?? 0, ang = Math.atan2(fy, fx);
  const bob = Math.sin(time * 3.2 + (e.id || 0) * 17) * 0.7;
  ctx.save();
  ctx.translate(e.x, e.y - top - 9 + bob);
  ctx.globalAlpha = 0.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const outline = w => { ctx.strokeStyle = INK; ctx.lineWidth = w; };
  const ink = w => { ctx.strokeStyle = color; ctx.lineWidth = w; };
  switch (e.stance) {
    case 'flank': case 'fallback': case 'push': {
      const a = e.stance === 'fallback' ? ang + Math.PI : ang;
      ctx.rotate(a);
      if (e.stance === 'push') {
        ctx.fillStyle = color; outline(2.6);
        ctx.beginPath(); ctx.moveTo(-5, -3.2); ctx.lineTo(1, -3.2); ctx.lineTo(1, -6); ctx.lineTo(7, 0); ctx.lineTo(1, 6); ctx.lineTo(1, 3.2); ctx.lineTo(-5, 3.2); ctx.closePath(); ctx.stroke(); ctx.fill();
      } else {
        const n = e.stance === 'fallback' ? 2 : 1, s = 3.4;
        for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 5; outline(4); chevron(ctx, x, 0, s); ink(2); chevron(ctx, x, 0, s); }
      }
      break;
    }
    case 'suppress': {
      ctx.rotate(ang);
      for (let i = 0; i < 3; i++) { const x = -5 + i * 5, y = (i - 1) * 3.2; outline(3.6); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3, y); ctx.stroke(); ink(1.8); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3, y); ctx.stroke(); }
      break;
    }
    case 'flee': {
      outline(3.4); ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 4.5); ctx.lineTo(-6, 4.5); ctx.closePath(); ctx.stroke();
      ink(1.8); ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 4.5); ctx.lineTo(-6, 4.5); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(-0.7, -2, 1.4, 4); ctx.fillRect(-0.7, 2.4, 1.4, 1.4);
      break;
    }
    case 'hold': {
      outline(4.2); ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke(); ink(2.2); ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke();
      break;
    }
    case 'enrage': {
      ctx.fillStyle = color; outline(2);
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 2, 3); ctx.lineTo(sx * 5.5, -5); ctx.lineTo(sx * 7.5, 3); ctx.closePath(); ctx.stroke(); ctx.fill(); }
      break;
    }
    case 'wary': {
      ctx.fillStyle = color;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 4.5, 0, 1.7, 0, TAU); outline(1.6); ctx.stroke(); ctx.fill(); }
      break;
    }
    default: break;
  }
  ctx.restore();
}
