// Floor materials: one painter per room.theme.floor id, drawn tile by tile into the baked world chunks.
// Every painter works in world units and expects the caller to have set the chunk transform.
import {TILE} from './catalog.js';
import {INK, hash2, mix, rgba, seeded, shade} from './sprites2d.js';

// base colour per material; the room accent is mixed in a little so every room has its own hue
export const FLOOR_BASE = {
  concrete: '#76757b', tile: '#aab2ba', metal: '#59606c', carpet: '#666a8c', grate: '#343a43',
  wood: '#8a6a4b', dirt: '#9a8468', vault: '#4a4752', hazard: '#5c535a', corridor: '#575c66',
};
const ACCENT_MIX = {concrete: 0.17, tile: 0.14, metal: 0.15, carpet: 0.28, grate: 0.1, wood: 0.12, dirt: 0.16, vault: 0.12, hazard: 0.14, corridor: 0};

export function floorColor(mat, accent) {
  const base = FLOOR_BASE[mat] || FLOOR_BASE.concrete;
  return accent && ACCENT_MIX[mat] ? mix(base, accent, ACCENT_MIX[mat]) : base;
}

// ctx: {seed, accent, wallN, wallS, wallE, wallW} tx,ty tile coords
export function paintFloorTile(g, mat, tx, ty, o) {
  const X = tx * TILE, Y = ty * TILE, n = hash2(tx, ty, o.seed), base = floorColor(mat, o.accent);
  const f = 0.92 + n * 0.16;
  switch (mat) {
    case 'tile': {
      const light = (tx + ty) & 1;
      g.fillStyle = shade(base, light ? 1.04 : 0.94); g.fillRect(X, Y, TILE, TILE);
      // 2x2 sub tiles with grout
      g.fillStyle = shade(base, light ? 0.9 : 1.0);
      g.fillRect(X + TILE / 2, Y, TILE / 2, TILE / 2); g.fillRect(X, Y + TILE / 2, TILE / 2, TILE / 2);
      g.strokeStyle = 'rgba(30,40,46,0.3)'; g.lineWidth = 1; g.beginPath();
      g.moveTo(X + TILE / 2, Y); g.lineTo(X + TILE / 2, Y + TILE); g.moveTo(X, Y + TILE / 2); g.lineTo(X + TILE, Y + TILE / 2);
      g.stroke();
      g.strokeStyle = 'rgba(20,28,34,0.42)'; g.lineWidth = 1.2; g.strokeRect(X + 0.7, Y + 0.7, TILE - 1.4, TILE - 1.4);
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X + 2, Y + 2); g.lineTo(X + TILE - 2, Y + 2); g.moveTo(X + 2, Y + 2); g.lineTo(X + 2, Y + TILE - 2); g.stroke();
      if (n > 0.8) { // gloss streak
        const gr = g.createLinearGradient(X, Y, X + TILE, Y + TILE);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(X, Y, TILE, TILE);
      }
      break;
    }
    case 'metal': {
      g.fillStyle = shade(base, f); g.fillRect(X, Y, TILE, TILE);
      if (n > 0.55) { // tread plate
        g.save(); g.beginPath(); g.rect(X + 3, Y + 3, TILE - 6, TILE - 6); g.clip();
        g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1.2; g.beginPath();
        for (let i = -TILE; i < TILE * 2; i += 6) { g.moveTo(X + i, Y); g.lineTo(X + i + TILE, Y + TILE); }
        g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.22)'; g.beginPath();
        for (let i = -TILE; i < TILE * 2; i += 6) { g.moveTo(X + i + TILE, Y); g.lineTo(X + i, Y + TILE); }
        g.stroke(); g.restore();
      }
      g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X + 1, Y + TILE - 1); g.lineTo(X + 1, Y + 1); g.lineTo(X + TILE - 1, Y + 1); g.stroke();
      g.strokeStyle = 'rgba(6,8,12,0.65)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X + TILE - 0.6, Y); g.lineTo(X + TILE - 0.6, Y + TILE); g.moveTo(X, Y + TILE - 0.6); g.lineTo(X + TILE, Y + TILE - 0.6); g.stroke();
      g.fillStyle = 'rgba(8,10,14,0.7)';
      for (const [dx, dy] of [[4, 4], [TILE - 4, 4], [4, TILE - 4], [TILE - 4, TILE - 4]]) { g.beginPath(); g.arc(X + dx, Y + dy, 1.2, 0, 6.3); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.2)';
      for (const [dx, dy] of [[4, 3.2], [TILE - 4, 3.2], [4, TILE - 4.8], [TILE - 4, TILE - 4.8]]) g.fillRect(X + dx - 0.6, Y + dy, 1.2, 0.7);
      break;
    }
    case 'carpet': {
      g.fillStyle = shade(base, f); g.fillRect(X, Y, TILE, TILE);
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 0.8; g.strokeRect(X + 0.4, Y + 0.4, TILE - 0.8, TILE - 0.8);
      if ((tx + ty) % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(X, Y, TILE, TILE); }
      break;
    }
    case 'grate': {
      g.fillStyle = shade(base, 0.7); g.fillRect(X, Y, TILE, TILE);
      const glow = o.accent;
      // holes with an under-glow, bars on top
      for (let iy = 0; iy < 4; iy++) for (let ix = 0; ix < 4; ix++) {
        const hx = X + ix * 8 + 1.6, hy = Y + iy * 8 + 1.6;
        g.fillStyle = '#07090c'; g.fillRect(hx, hy, 4.8, 4.8);
        if (glow && hash2(tx * 4 + ix, ty * 4 + iy, o.seed + 3) > 0.55) { g.fillStyle = rgba(glow, 0.2); g.fillRect(hx + 0.5, hy + 0.5, 3.8, 3.8); }
      }
      g.strokeStyle = '#4b535e'; g.lineWidth = 1.6; g.beginPath();
      for (let i = 0; i <= 4; i++) { g.moveTo(X + i * 8, Y); g.lineTo(X + i * 8, Y + TILE); g.moveTo(X, Y + i * 8); g.lineTo(X + TILE, Y + i * 8); }
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 0.7; g.beginPath();
      for (let i = 0; i < 4; i++) { g.moveTo(X, Y + i * 8 + 0.5); g.lineTo(X + TILE, Y + i * 8 + 0.5); }
      g.stroke();
      g.strokeStyle = '#12151a'; g.lineWidth = 1.6; g.strokeRect(X + 0.8, Y + 0.8, TILE - 1.6, TILE - 1.6);
      break;
    }
    case 'wood': {
      g.fillStyle = shade(base, 0.9); g.fillRect(X, Y, TILE, TILE);
      for (let i = 0; i < 4; i++) {
        const py = Y + i * 8, pn = hash2(tx, ty * 4 + i, o.seed + 9);
        const off = pn * TILE;
        g.fillStyle = shade(base, 0.82 + pn * 0.3); g.fillRect(X, py + 0.5, TILE, 7);
        g.strokeStyle = 'rgba(30,16,8,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(X, py + 0.4); g.lineTo(X + TILE, py + 0.4); g.moveTo(X + off, py); g.lineTo(X + off, py + 8); g.stroke();
        g.strokeStyle = 'rgba(255,230,190,0.12)'; g.beginPath(); g.moveTo(X, py + 1.4); g.lineTo(X + TILE, py + 1.4); g.stroke();
        g.strokeStyle = 'rgba(40,20,8,0.18)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(X + 2, py + 3.5 + pn * 2); g.lineTo(X + TILE - 4, py + 3.2 + pn * 2); g.stroke();
      }
      break;
    }
    case 'dirt': {
      g.fillStyle = shade(base, f); g.fillRect(X, Y, TILE, TILE);
      break;
    }
    case 'vault': {
      const dark = (tx + ty) & 1;
      g.fillStyle = shade(base, dark ? 0.86 : 1.02); g.fillRect(X, Y, TILE, TILE);
      g.strokeStyle = rgba(o.accent || '#e8c46b', 0.22); g.lineWidth = 1; g.strokeRect(X + 2.5, Y + 2.5, TILE - 5, TILE - 5);
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.4; g.strokeRect(X + 0.7, Y + 0.7, TILE - 1.4, TILE - 1.4);
      g.fillStyle = rgba(o.accent || '#e8c46b', 0.25);
      for (const [dx, dy] of [[2.5, 2.5], [TILE - 2.5, 2.5], [2.5, TILE - 2.5], [TILE - 2.5, TILE - 2.5]]) g.fillRect(X + dx - 1, Y + dy - 1, 2, 2);
      break;
    }
    case 'hazard': {
      g.fillStyle = shade(base, f); g.fillRect(X, Y, TILE, TILE);
      g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 1; g.strokeRect(X + 0.5, Y + 0.5, TILE - 1, TILE - 1);
      if (n > 0.7) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(X + 3, Y + 3, TILE - 6, TILE - 6); }
      break;
    }
    case 'corridor': {
      g.fillStyle = shade(base, f); g.fillRect(X, Y, TILE, TILE);
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1.2; g.beginPath();
      for (let i = -TILE; i < TILE * 2; i += 8) { g.moveTo(X + i, Y); g.lineTo(X + i + TILE, Y + TILE); }
      g.stroke();
      g.strokeStyle = 'rgba(6,8,14,0.55)'; g.lineWidth = 1.2; g.strokeRect(X + 0.6, Y + 0.6, TILE - 1.2, TILE - 1.2);
      g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(X + 1.6, Y + TILE - 1.6); g.lineTo(X + 1.6, Y + 1.6); g.lineTo(X + TILE - 1.6, Y + 1.6); g.stroke();
      // wall-side cable conduit with clips
      const rnd = hash2(tx, ty, o.seed + 77);
      const run = (x0, y0, x1, y1, ox, oy) => {
        g.strokeStyle = 'rgba(8,8,14,0.85)'; g.lineWidth = 3; g.lineCap = 'butt'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.strokeStyle = rnd > 0.5 ? 'rgba(210,150,60,0.55)' : 'rgba(110,150,200,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0 + ox, y0 + oy); g.lineTo(x1 + ox, y1 + oy); g.stroke();
        g.fillStyle = 'rgba(180,180,190,0.5)';
        for (const t of [0.15, 0.85]) g.fillRect(x0 + (x1 - x0) * t - 1.2, y0 + (y1 - y0) * t - 1.2, 2.4, 2.4);
      };
      if (o.wallN && hash2(tx, ty, o.seed + 1) > 0.25) run(X, Y + 3.5, X + TILE, Y + 3.5, 0, -0.4);
      if (o.wallW && hash2(tx, ty, o.seed + 2) > 0.45) run(X + 3.5, Y, X + 3.5, Y + TILE, -0.4, 0);
      if (o.wallE && hash2(tx, ty, o.seed + 3) > 0.45) run(X + TILE - 3.5, Y, X + TILE - 3.5, Y + TILE, 0.4, 0);
      break;
    }
    default: { // concrete
      g.fillStyle = shade(base, f); g.fillRect(X, Y, TILE, TILE);
      g.strokeStyle = 'rgba(8,6,12,0.34)'; g.lineWidth = 0.8; g.strokeRect(X + 0.4, Y + 0.4, TILE - 0.8, TILE - 0.8);
      const heavyR = tx % 4 === 0, heavyB = ty % 4 === 0;
      g.strokeStyle = 'rgba(6,4,10,0.5)'; g.lineWidth = 1.4; g.beginPath();
      if (heavyR) { g.moveTo(X, Y); g.lineTo(X, Y + TILE); }
      if (heavyB) { g.moveTo(X, Y); g.lineTo(X + TILE, Y); }
      g.stroke();
      g.strokeStyle = 'rgba(255,240,225,0.07)'; g.beginPath(); g.moveTo(X + 1, Y); g.lineTo(X + 1, Y + TILE); g.moveTo(X, Y + 1); g.lineTo(X + TILE, Y + 1); g.stroke();
    }
  }
  void INK; void seeded;
}
