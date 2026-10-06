// Top-down prop art for hard cover (room.cover kinds) and floor decor (room.theme.decor), baked into world chunks.
// Painters draw in world units with the chunk transform already set. Cover painters get one tile at a time;
// runs (desk pairs, bed pairs, shelf aisles, server rows) are drawn in run space and clipped to the tile so chunk
// borders stay seamless.
import {TILE} from './catalog.js';
import {INK, TAU, hash2, mix, rgba, shade} from './sprites2d.js';

const T = TILE;
// shadow reach per unit of height; direction matches the world light (from top-left)
export const LIGHT = {x: 0.62, y: 0.78};
export const COVER_HEIGHT = {pillar: 20, rack: 22, server: 18, desk: 9, bed: 7, sandbag: 9, jersey: 11, partition: 15, vault: 17, wall: 18};

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r); g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r); g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
}
function chamfer(g, x, y, w, h, c) {
  g.beginPath(); g.moveTo(x + c, y); g.lineTo(x + w - c, y); g.lineTo(x + w, y + c); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h); g.lineTo(x, y + h - c); g.lineTo(x, y + c); g.closePath();
}
function stripes(g, x, y, w, h, a, b, step = 8, slant = 1) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = a; g.fillRect(x, y, w, h);
  g.fillStyle = b; g.beginPath();
  for (let i = -h; i < w + h; i += step * 2) { if (slant > 0) { g.moveTo(x + i, y + h); g.lineTo(x + i + step, y + h); g.lineTo(x + i + step + h, y); g.lineTo(x + i + h, y); } else { g.moveTo(x + i, y); g.lineTo(x + i + step, y); g.lineTo(x + i + step + h, y + h); g.lineTo(x + i + h, y + h); } }
  g.fill(); g.restore();
}
const edgeLine = (g, w = 1.1) => { g.strokeStyle = INK; g.lineWidth = w; g.stroke(); };

// which art a hard-cover tile gets, from the room it sits in
export function coverStyle(room, kind) {
  const role = room?.role, tpl = room?.template, floor = room?.theme?.floor;
  if (kind === 'wall') {
    if (tpl === 'vault' || role === 'cache') return 'vault';
    if (tpl === 'partitions') return 'partition';
    if (tpl === 'killbox-lanes' || role === 'hazard') return 'jersey-hazard';
    if (tpl === 'lane-walls' || floor === 'grate') return 'jersey';
    return 'sandbag';
  }
  if (kind === 'pillar') {
    if (tpl === 'warden-arena' || role === 'elite') return 'hazard';
    if (tpl === 'vault' || role === 'cache') return 'vault';
    if (tpl === 'landing' || role === 'extraction') return 'beacon';
    return 'concrete';
  }
  return kind;
}
export const shadowKey = (style, kind) => (style.startsWith('jersey') ? 'jersey' : COVER_HEIGHT[style] ? style : COVER_HEIGHT[kind] ? kind : 'wall');

// ---------------------------------------------------------------- cover
// c: {tx, ty, kind, style, accent, j:{n,s,e,w}, idx (position in the run), seed}
export function paintCover(g, c) {
  const X = c.tx * T, Y = c.ty * T;
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  (PAINTERS[c.style] || PAINTERS.concrete)(g, c, X, Y);
  g.restore();
}

function frontFace(g, x, y, w, h, col) {
  g.fillStyle = col; g.fillRect(x, y, w, h);
  const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
}

function pillar(g, c, X, Y, o) {
  const x = X + 2, y = Y + 2, w = 28, h = 28, lip = 6;
  chamfer(g, x, y, w, h, 6); g.fillStyle = o.lip; g.fill();
  const top = g.createLinearGradient(x, y, x + w, y + h - lip); top.addColorStop(0, o.top0); top.addColorStop(1, o.top1);
  chamfer(g, x, y, w, h - lip, 5.5); g.fillStyle = top; g.fill();
  g.save(); chamfer(g, x, y, w, h - lip, 5.5); g.clip();
  if (o.band) { // painted band around the rim
    g.save(); g.beginPath(); g.rect(x, y, w, h - lip); g.rect(x + 5, y + 5, w - 10, h - lip - 10); g.clip('evenodd');
    stripes(g, x, y, w, h - lip, o.band[0], o.band[1], 5.5); g.restore();
  }
  g.restore();
  // cap
  rr(g, x + 5, y + 5, w - 10, h - lip - 10, 2); g.fillStyle = o.cap; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x + 6, y + h - lip - 6); g.lineTo(x + 6, y + 6); g.lineTo(x + w - 6, y + 6); g.stroke();
  g.fillStyle = o.bolt; for (const [bx, by] of [[x + 3.2, y + 3.2], [x + w - 3.2, y + 3.2], [x + 3.2, y + h - lip - 3.2], [x + w - 3.2, y + h - lip - 3.2]]) { g.beginPath(); g.arc(bx, by, 0.9, 0, TAU); g.fill(); }
  chamfer(g, x, y, w, h, 6); edgeLine(g, 1.3);
  chamfer(g, x, y, w, h - lip, 5.5); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.9; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 2, y + 1.2); g.lineTo(x + w - 6, y + 1.2); g.stroke();
  if (o.dot) { g.fillStyle = o.dot; g.beginPath(); g.arc(X + 16, y + (h - lip) / 2, 3, 0, TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.8; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(X + 15, y + (h - lip) / 2 - 1, 0.9, 0, TAU); g.fill(); }
  if (o.crack) { g.strokeStyle = 'rgba(10,8,14,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + w - 7, y + 3); g.lineTo(x + w - 10, y + 9); g.lineTo(x + w - 8, y + 13); g.stroke(); }
}

function sandbags(g, c, X, Y) {
  const vertical = (c.j.n || c.j.s) && !(c.j.e || c.j.w);
  g.save(); g.beginPath(); g.rect(X, Y, T, T); g.clip();
  const bag = (bx, by, bw, bh, col) => {
    rr(g, bx, by, bw, bh, 4); g.fillStyle = col; g.fill();
    const gr = g.createLinearGradient(bx, by, bx, by + bh); gr.addColorStop(0, 'rgba(255,245,210,0.28)'); gr.addColorStop(0.55, 'rgba(255,245,210,0)'); gr.addColorStop(1, 'rgba(30,20,6,0.32)');
    g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(28,20,8,0.9)'; g.lineWidth = 0.9; g.stroke();
    g.strokeStyle = 'rgba(40,28,10,0.5)'; g.lineWidth = 0.7; g.beginPath();
    if (vertical) { g.moveTo(bx + 2, by + bh / 2); g.lineTo(bx + bw - 2, by + bh / 2); } else { g.moveTo(bx + bw / 2, by + 2); g.lineTo(bx + bw / 2, by + bh - 2); }
    g.stroke();
  };
  const cols = ['#b5a073', '#a8946a', '#bfab7e', '#9f8c63'];
  if (!vertical) {
    frontFace(g, X, Y + 21, T, 6, '#6d5d3e');
    for (let row = 0; row < 2; row++) {
      const by = Y + 5 + row * 9.5;
      for (let k = Math.floor((X - row * 8 - 16) / 16); k * 16 + row * 8 < X + T; k++) { const bx = k * 16 + row * 8; bag(bx + 0.5, by, 15, 11, cols[Math.floor(hash2(k, c.ty * 2 + row, c.seed) * 4)]); }
    }
  } else {
    if (!c.j.s) frontFace(g, X + 5, Y + 24, 20, 5, '#6d5d3e');
    for (let row = 0; row < 2; row++) {
      const bx = X + 5 + row * 9.5;
      for (let k = Math.floor((Y - row * 8 - 16) / 16); k * 16 + row * 8 < Y + T; k++) { const by = k * 16 + row * 8; bag(bx, by + 0.5, 11, 15, cols[Math.floor(hash2(c.tx * 2 + row, k, c.seed) * 4)]); }
    }
  }
  g.restore();
}

function jersey(g, c, X, Y, hazard) {
  const vertical = (c.j.n || c.j.s) && !(c.j.e || c.j.w);
  const body = vertical ? {x: X + 8, y: c.j.n ? Y : Y + 1, w: 16, h: T - (c.j.n ? 0 : 1) - (c.j.s ? 0 : 5)} : {x: c.j.w ? X : X + 1, y: Y + 6, w: T - (c.j.w ? 0 : 1) - (c.j.e ? 0 : 1), h: 17};
  const lipH = 6;
  frontFace(g, body.x, vertical ? body.y + body.h - 2 : body.y + body.h - 2, body.w, vertical && c.j.s ? 0 : lipH, '#5f6168');
  g.save(); rr(g, body.x, body.y, body.w, body.h, 2.5); g.clip();
  const gr = vertical ? g.createLinearGradient(body.x, 0, body.x + body.w, 0) : g.createLinearGradient(0, body.y, 0, body.y + body.h);
  gr.addColorStop(0, '#b4b6bd'); gr.addColorStop(0.3, '#9c9ea6'); gr.addColorStop(0.5, '#c6c8ce'); gr.addColorStop(0.7, '#9c9ea6'); gr.addColorStop(1, '#7a7c85');
  g.fillStyle = gr; g.fillRect(body.x, body.y, body.w, body.h);
  const mid = vertical ? {x: body.x + 4, y: body.y, w: body.w - 8, h: body.h} : {x: body.x, y: body.y + 4, w: body.w, h: body.h - 8};
  if (hazard) stripes(g, mid.x, mid.y, mid.w, mid.h, '#e5b524', '#16141a', 5.5, 1);
  else { g.fillStyle = rgba(c.accent, 0.8); if (vertical) g.fillRect(mid.x + mid.w / 2 - 1, mid.y, 2, mid.h); else g.fillRect(mid.x, mid.y + mid.h / 2 - 1, mid.w, 2); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; if (vertical) { g.fillRect(body.x, body.y, 1.5, body.h); } else g.fillRect(body.x, body.y, 1.5, body.h);
  g.restore();
  rr(g, body.x, body.y, body.w, body.h, 2.5); edgeLine(g, 1.2);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(body.x + 2, body.y + 0.9); g.lineTo(body.x + body.w - 2, body.y + 0.9); g.stroke();
  // reflector studs at the free ends
  g.fillStyle = hazard ? '#ff4a3a' : '#ffb04a';
  if (!vertical) { if (!c.j.w) g.fillRect(body.x + 2, body.y + body.h / 2 - 1.2, 2, 2.4); if (!c.j.e) g.fillRect(body.x + body.w - 4, body.y + body.h / 2 - 1.2, 2, 2.4); }
  else { if (!c.j.n) g.fillRect(body.x + body.w / 2 - 1.2, body.y + 2, 2.4, 2); if (!c.j.s) g.fillRect(body.x + body.w / 2 - 1.2, body.y + body.h - 4, 2.4, 2); }
}

function partition(g, c, X, Y) {
  const vertical = (c.j.n || c.j.s) && !(c.j.e || c.j.w);
  const th = 11;
  const b = vertical ? {x: X + 11, y: c.j.n ? Y : Y + 1, w: th, h: T - (c.j.n ? 0 : 1) - (c.j.s ? 0 : 6)} : {x: c.j.w ? X : X + 1, y: Y + 9, w: T - (c.j.w ? 0 : 1) - (c.j.e ? 0 : 1), h: th};
  frontFace(g, b.x, b.y + b.h - 1, b.w, vertical && c.j.s ? 0 : 6, '#3b414e');
  g.fillStyle = '#323846'; g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = '#c6ccd6'; if (vertical) g.fillRect(b.x + 2, b.y, b.w - 4, b.h); else g.fillRect(b.x, b.y + 2, b.w, b.h - 4);
  g.fillStyle = 'rgba(90,110,140,0.22)'; if (vertical) g.fillRect(b.x + 3.5, b.y, b.w - 7, b.h); else g.fillRect(b.x, b.y + 3.5, b.w, b.h - 7);
  g.fillStyle = rgba(c.accent, 0.85); if (vertical) g.fillRect(b.x + b.w / 2 - 0.8, b.y, 1.6, b.h); else g.fillRect(b.x, b.y + b.h / 2 - 0.8, b.w, 1.6);
  g.strokeStyle = INK; g.lineWidth = 1.1; g.strokeRect(b.x, b.y, b.w, b.h);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.8; g.beginPath(); if (vertical) { g.moveTo(b.x + 2.4, b.y); g.lineTo(b.x + 2.4, b.y + b.h); } else { g.moveTo(b.x, b.y + 2.4); g.lineTo(b.x + b.w, b.y + 2.4); } g.stroke();
  // frame posts at tile joints and free ends
  g.fillStyle = '#2a2f3a';
  if (!vertical) { for (const px of [X + (c.j.w ? 0 : 1), X + T - (c.j.e ? 0 : 1) - 1.6]) g.fillRect(px - 0.4, b.y - 1.4, 2.4, b.h + 2.8); }
  else { for (const py of [Y + (c.j.n ? 0 : 1), Y + T - (c.j.s ? 0 : 6) - 1.6]) g.fillRect(b.x - 1.4, py - 0.4, b.w + 2.8, 2.4); }
}

function vaultwall(g, c, X, Y) {
  const x = X + 0.5, y = Y + 0.5, w = T - 1, h = T - 1, lip = 5;
  frontFace(g, x, y + h - lip - 1, w, lip + 1, '#2a2830');
  const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#5c5964'); gr.addColorStop(1, '#3b3944');
  g.fillStyle = gr; g.fillRect(x, y, w, h - lip);
  const gold = c.accent || '#e8c46b';
  g.strokeStyle = rgba(gold, 0.9); g.lineWidth = 1.3; g.strokeRect(x + 2.5, y + 2.5, w - 5, h - lip - 5);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.strokeRect(x + 5, y + 5, w - 10, h - lip - 10);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 5, y + 5, w - 10, h - lip - 10);
  g.fillStyle = rgba(gold, 0.95); for (const [bx, by] of [[x + 4.5, y + 4.5], [x + w - 4.5, y + 4.5], [x + 4.5, y + h - lip - 4.5], [x + w - 4.5, y + h - lip - 4.5]]) { g.beginPath(); g.arc(bx, by, 1.2, 0, TAU); g.fill(); }
  if (hash2(c.tx, c.ty, c.seed + 11) > 0.45) { // dial
    g.beginPath(); g.arc(X + 16, Y + (h - lip) / 2 + 0.5, 4.2, 0, TAU); g.fillStyle = '#17151c'; g.fill(); g.strokeStyle = rgba(gold, 0.8); g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(X + 16, Y + (h - lip) / 2 + 0.5); g.lineTo(X + 18.4, Y + (h - lip) / 2 - 1.6); g.stroke();
  }
  g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(x, y, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x + 1, y + 0.9); g.lineTo(x + w - 1, y + 0.9); g.stroke();
}

function rack(g, c, X, Y) {
  const x = X + 2, w = 28, top = c.j.n ? Y : Y + 1, bot = c.j.s ? Y + T : Y + T - 5, lip = c.j.s ? 0 : 6;
  if (lip) { frontFace(g, x, bot - 1, w, lip, '#2a2c34'); g.fillStyle = '#d6862f'; g.fillRect(x, bot, w, 2.6); g.fillStyle = '#16141a'; for (let i = 0; i < w; i += 7) g.fillRect(x + i + 1, bot, 3, 2.6); }
  g.fillStyle = '#2b2e37'; g.fillRect(x, top, w, bot - top);
  // boxes
  const pal = ['#b48a56', '#a37a47', '#c39a66', '#8f6c40', '#b99461'];
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const cell = hash2(c.tx * 2 + col, c.ty * 2 + row, c.seed + 21);
    const bx = x + 3 + col * 12.5, by = Y + row * 16 + (c.j.n || row ? 0.5 : 1.5), bw = 10.5, bh = 14 - (row === 1 && !c.j.s ? 4 : 0);
    if (row === 1 && !c.j.s && bh < 8) continue;
    if (cell < 0.14) { g.fillStyle = '#16181e'; g.fillRect(bx, by + 1, bw, bh - 1); continue; }
    const jw = bw - (cell > 0.6 ? 0.8 + (cell - 0.6) * 4 : 0), jh = bh - (cell < 0.4 ? 1.2 : 0.2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(bx + 1, by + 1.2, jw, jh);
    g.fillStyle = pal[Math.floor(cell * 5) % 5]; g.fillRect(bx, by, jw, jh);
    g.fillStyle = 'rgba(255,240,200,0.28)'; g.fillRect(bx, by, jw, 1.2);
    g.fillStyle = 'rgba(30,20,10,0.25)'; g.fillRect(bx, by + jh - 1.2, jw, 1.2);
    g.fillStyle = 'rgba(235,225,195,0.55)'; g.fillRect(bx + jw / 2 - 0.9, by, 1.8, jh);
    if (cell > 0.72) { g.fillStyle = 'rgba(240,240,235,0.9)'; g.fillRect(bx + 1.5, by + jh - 4.5, 3.6, 2.6); }
    g.strokeStyle = 'rgba(24,14,6,0.8)'; g.lineWidth = 0.7; g.strokeRect(bx, by, jw, jh);
    if (cell > 0.9) { g.fillStyle = 'rgba(210,235,255,0.2)'; g.fillRect(bx, by, jw, jh); }
  }
  // steel uprights and cross beams
  g.fillStyle = '#d6862f'; g.fillRect(x, top, 3, bot - top); g.fillRect(x + w - 3, top, 3, bot - top);
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x, top, 0.9, bot - top); g.fillRect(x + w - 3, top, 0.9, bot - top);
  g.fillStyle = '#c9772a'; g.fillRect(x, Y + 15, w, 2);
  if (!c.j.n) { g.fillRect(x, top, w, 2); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x, top, w, 0.8); }
  g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath();
  g.moveTo(x, top); g.lineTo(x, bot); g.moveTo(x + w, top); g.lineTo(x + w, bot);
  if (!c.j.n) { g.moveTo(x, top); g.lineTo(x + w, top); }
  if (!c.j.s) { g.moveTo(x, bot); g.lineTo(x + w, bot); }
  g.stroke();
}

function server(g, c, X, Y) {
  const x = X + 0.5, w = T - 1, topH = 22, lipH = 9;
  frontFace(g, x, Y + topH, w, lipH, '#12151b');
  const gr = g.createLinearGradient(0, Y, 0, Y + topH); gr.addColorStop(0, '#39404b'); gr.addColorStop(1, '#262b34');
  g.fillStyle = gr; g.fillRect(x, Y, w, topH);
  // vent slots and fan
  g.fillStyle = '#0e1015'; for (let i = 0; i < 3; i++) g.fillRect(x + 3, Y + 4 + i * 2.6, 9, 1.3);
  const fx = X + 21, fy = Y + 11;
  g.beginPath(); g.arc(fx, fy, 6.2, 0, TAU); g.fillStyle = '#12151b'; g.fill(); g.strokeStyle = '#4b5361'; g.lineWidth = 0.9; g.stroke();
  g.strokeStyle = '#2f3540'; g.lineWidth = 1.6; g.beginPath(); const ph = hash2(c.tx, c.ty, c.seed) * TAU; for (let i = 0; i < 4; i++) { g.moveTo(fx, fy); g.lineTo(fx + Math.cos(ph + i * TAU / 4) * 5, fy + Math.sin(ph + i * TAU / 4) * 5); } g.stroke();
  g.fillStyle = '#4b5361'; g.beginPath(); g.arc(fx, fy, 1.4, 0, TAU); g.fill();
  // cable bundle across the top
  g.strokeStyle = rgba(c.accent, 0.55); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, Y + 18); g.lineTo(x + w, Y + 18); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, Y + 19.2); g.lineTo(x + w, Y + 19.2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x, Y + 0.9); g.lineTo(x + w, Y + 0.9); g.stroke();
  // front: drive bays and dim LED sockets (the live pass makes some of them blink)
  g.fillStyle = '#232830'; for (let i = 0; i < 4; i++) g.fillRect(x + 2.5 + i * 7, Y + topH + 1.8, 5.6, 2);
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(70,200,150,0.35)'; g.fillRect(x + 3 + i * 4.6, Y + topH + 5.8, 2, 1.5); }
  g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, Y + T); g.lineTo(x + w, Y + T); g.moveTo(x, Y + T - 0.2); g.stroke();
  g.beginPath(); g.moveTo(x, Y); g.lineTo(x, Y + T); g.moveTo(x + w, Y); g.lineTo(x + w, Y + T); if (!c.j.n) { g.moveTo(x, Y); g.lineTo(x + w, Y); } g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, Y + topH); g.lineTo(x + w, Y + topH); g.stroke();
}
export const SERVER_LED = {topH: 22};

function desk(g, c, X, Y) {
  const right = c.j.w && !c.j.e, ox = right ? X - T : X;
  g.save(); g.beginPath(); g.rect(X, Y, T, T); g.clip(); g.translate(ox, Y);
  const pairs = hash2(Math.floor(c.tx / 2), c.ty, c.seed + 31), v2 = hash2(c.tx - (right ? 1 : 0), c.ty, c.seed + 32);
  // front panel + top
  frontFace(g, 1, 24, 62, 6, '#4d3b2b');
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(22, 24, 20, 6);
  const gr = g.createLinearGradient(0, 4, 0, 24); gr.addColorStop(0, '#b38d5f'); gr.addColorStop(1, '#977349');
  g.fillStyle = gr; g.fillRect(1, 4, 62, 20);
  g.strokeStyle = 'rgba(70,44,20,0.35)'; g.lineWidth = 0.6; g.beginPath(); for (let i = 0; i < 5; i++) { const yy = 6.5 + i * 3.6; g.moveTo(2, yy); g.lineTo(62, yy + (i % 2 ? 0.8 : -0.5)); } g.stroke();
  g.strokeStyle = 'rgba(255,235,200,0.45)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(1.6, 4.8); g.lineTo(62.4, 4.8); g.stroke();
  g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(1, 4, 62, 26);
  // monitor + stand
  g.fillStyle = '#0d1016'; rr(g, 22, 6.5, 20, 4.2, 1); g.fill();
  g.fillStyle = rgba(c.accent, 0.9); g.fillRect(23.4, 9.2, 17.2, 1.2);
  g.fillStyle = rgba(c.accent, 0.12); g.fillRect(20, 10.7, 24, 5);
  g.strokeStyle = '#000'; g.lineWidth = 0.7; g.strokeRect(22, 6.5, 20, 4.2);
  // keyboard
  g.fillStyle = '#d3d7de'; rr(g, 24, 15.5, 16, 5.4, 1); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 0.7; g.stroke();
  g.strokeStyle = 'rgba(60,64,76,0.55)'; g.lineWidth = 0.5; g.beginPath(); for (let i = 1; i < 6; i++) { g.moveTo(24 + i * 2.7, 16.3); g.lineTo(24 + i * 2.7, 20); } g.moveTo(25, 18.1); g.lineTo(39, 18.1); g.stroke();
  g.fillStyle = '#222'; g.beginPath(); g.ellipse(44.5, 18.4, 1.3, 1.9, 0, 0, TAU); g.fill();
  // clutter, varied per desk
  if (pairs > 0.3) { g.save(); g.translate(8.5, 11); g.rotate(-0.25 + v2 * 0.5); g.fillStyle = '#f1efe6'; g.fillRect(-4.2, -5, 8.4, 10); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.6; g.strokeRect(-4.2, -5, 8.4, 10); g.fillStyle = 'rgba(60,70,90,0.5)'; for (let i = 0; i < 4; i++) g.fillRect(-3, -3.6 + i * 2.2, 6, 0.7); g.restore(); }
  if (v2 > 0.35) { g.fillStyle = '#e9e6dc'; g.beginPath(); g.arc(55, 11.5, 3, 0, TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 0.7; g.stroke(); g.fillStyle = '#4b2e1a'; g.beginPath(); g.arc(55, 11.5, 2, 0, TAU); g.fill(); }
  else { g.fillStyle = '#3d7bb8'; g.save(); g.translate(54, 14); g.rotate(0.3); g.fillRect(-4, -3, 8, 6); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.6; g.strokeRect(-4, -3, 8, 6); g.restore(); }
  if (pairs < 0.55) { g.fillStyle = '#2c3038'; g.beginPath(); g.arc(8, 19, 2.2, 0, TAU); g.fill(); g.strokeStyle = rgba('#ffd86a', 0.9); g.lineWidth = 0.9; g.beginPath(); g.moveTo(8, 19); g.lineTo(14, 14.5); g.stroke(); }
  g.restore();
}

function bed(g, c, X, Y) {
  const second = c.j.n, oy = second ? Y - T : Y;
  g.save(); g.beginPath(); g.rect(X, Y, T, T); g.clip(); g.translate(X, oy);
  const accent = mix(c.accent, '#24343a', 0.45);
  frontFace(g, 3, 60, 26, 4, '#6b7680');
  // frame + mattress
  g.fillStyle = '#c8d1d8'; g.fillRect(3, 1, 26, 60); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(3, 1, 26, 60);
  g.fillStyle = '#eef6f5'; rr(g, 5, 3, 22, 56, 2.5); g.fill(); g.strokeStyle = 'rgba(40,60,66,0.5)'; g.lineWidth = 0.8; g.stroke();
  g.fillStyle = '#8b97a1'; g.fillRect(3, 0, 26, 3); g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(3, 0, 26, 3);
  // pillow
  g.fillStyle = '#ffffff'; rr(g, 8.5, 5.5, 15, 9, 3.5); g.fill(); g.strokeStyle = 'rgba(40,60,66,0.55)'; g.lineWidth = 0.8; g.stroke();
  g.strokeStyle = 'rgba(120,150,160,0.5)'; g.beginPath(); g.moveTo(11, 8.5); g.quadraticCurveTo(16, 7, 21, 8.5); g.stroke();
  // blanket
  g.fillStyle = accent; rr(g, 5, 24, 22, 34, 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(5, 24, 22, 4.2);
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 0.8; rr(g, 5, 24, 22, 34, 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.8; g.beginPath(); for (let i = 0; i < 5; i++) { g.moveTo(7, 31 + i * 5.8); g.lineTo(25, 31 + i * 5.8); } g.stroke();
  if (hash2(c.tx, c.ty, c.seed + 5) > 0.5) { g.fillStyle = 'rgba(150,20,36,0.5)'; g.beginPath(); g.ellipse(18, 40, 3.2, 2.2, 0.5, 0, TAU); g.fill(); }
  // rails and curtain on the room side
  g.fillStyle = '#9aa5ad'; for (const rx of [3, 27]) { g.fillRect(rx - 0.5, 20, 3, 2); g.fillRect(rx - 0.5, 40, 3, 2); }
  const side = c.tx < (c.room?.cx ?? 0) ? 1 : -1;
  const cx0 = side > 0 ? 29.2 : 0.2;
  g.fillStyle = 'rgba(158,222,212,0.8)'; g.fillRect(cx0, 0, 2.6, 64);
  g.strokeStyle = 'rgba(30,70,70,0.55)'; g.lineWidth = 0.7; g.beginPath(); for (let i = 0; i < 12; i++) { g.moveTo(cx0, i * 5.4); g.lineTo(cx0 + 2.6, i * 5.4 + 2.2); } g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.moveTo(cx0 + (side > 0 ? 0.5 : 2.1), 0); g.lineTo(cx0 + (side > 0 ? 0.5 : 2.1), 64); g.stroke();
  g.restore();
}

const PAINTERS = {
  concrete: (g, c, X, Y) => pillar(g, c, X, Y, {lip: '#53555e', top0: '#9b9ca5', top1: '#7a7c86', cap: '#6f717b', bolt: '#3a3b44', crack: hash2(c.tx, c.ty, c.seed) > 0.5}),
  hazard: (g, c, X, Y) => pillar(g, c, X, Y, {lip: '#3a3438', top0: '#7d7b82', top1: '#5d5b64', cap: '#2a272d', bolt: '#d8b030', band: ['#e9b92a', '#16141a'], dot: rgba(c.accent, 1)}),
  vault: (g, c, X, Y) => pillar(g, c, X, Y, {lip: '#25232b', top0: '#625f6b', top1: '#403d49', cap: '#2e2c36', bolt: '#e8c46b', band: [rgba('#e8c46b', 0.95), '#2a2830'], dot: '#e8c46b'}),
  beacon: (g, c, X, Y) => pillar(g, c, X, Y, {lip: '#4a4c54', top0: '#a9aab2', top1: '#8a8b95', cap: '#55565f', bolt: '#33343c', band: ['#e8e8ec', '#d8402f'], dot: '#ff5a4a'}),
  sandbag: sandbags,
  jersey: (g, c, X, Y) => jersey(g, c, X, Y, false),
  'jersey-hazard': (g, c, X, Y) => jersey(g, c, X, Y, true),
  partition, rack, server, desk, bed,
};
PAINTERS.vault = (g, c, X, Y) => (c.kind === 'pillar' ? pillar(g, c, X, Y, {lip: '#25232b', top0: '#625f6b', top1: '#403d49', cap: '#2e2c36', bolt: '#e8c46b', band: [rgba('#e8c46b', 0.95), '#2a2830'], dot: '#e8c46b'}) : vaultwall(g, c, X, Y));

// ---------------------------------------------------------------- decor
export function paintDecor(g, d, accent, seed) {
  const x = d.x * T, y = d.y * T, rot = (d.rot || 0) * Math.PI / 2, size = d.size || 1;
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  switch (d.kind) {
    case 'vent': {
      g.translate(x, d.side === 'n' ? Math.min(y, Math.floor(y / T) * T + 10) : y); const w = 22, h = 13;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-w / 2 - 1.5, -h / 2 - 1, w + 3, h + 3);
      g.fillStyle = '#2f343d'; g.fillRect(-w / 2, -h / 2, w, h); g.strokeStyle = '#0d0f14'; g.lineWidth = 1; g.strokeRect(-w / 2, -h / 2, w, h);
      g.fillStyle = '#0a0b0f'; for (let i = 0; i < 4; i++) g.fillRect(-w / 2 + 2, -h / 2 + 2 + i * 2.7, w - 4, 1.4);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-w / 2, -h / 2, w, 0.9);
      break;
    }
    case 'pipe': {
      const len = (d.len || 3) * T, py = y + 3, x0 = x - T / 2;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0, py + 3, len, 5);
      const gr = g.createLinearGradient(0, py - 4, 0, py + 4); gr.addColorStop(0, '#6a7280'); gr.addColorStop(0.35, '#a5adba'); gr.addColorStop(1, '#3c4250');
      g.fillStyle = gr; g.fillRect(x0, py - 4, len, 8); g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(x0, py - 4, len, 8);
      for (let i = T; i < len; i += T * 1.5) { g.fillStyle = '#2d323c'; g.fillRect(x0 + i - 2.4, py - 5, 4.8, 10); g.strokeRect(x0 + i - 2.4, py - 5, 4.8, 10); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x0 + i - 2.4, py - 5, 4.8, 1.2); }
      g.fillStyle = rgba(accent || '#eaaa66', 0.7); g.fillRect(x0 + 4, py - 1.2, 6, 2.4);
      break;
    }
    case 'cable': {
      const x2 = d.x2 * T, y2 = d.y2 * T, mx = (x + x2) / 2, my = Math.max(y, y2) + Math.hypot(x2 - x, y2 - y) * 0.12 + 6;
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(x + 1, y + 2); g.quadraticCurveTo(mx + 1, my + 2, x2 + 1, y2 + 2); g.stroke();
      g.strokeStyle = '#15171d'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x2, y2); g.stroke();
      g.strokeStyle = rgba(accent || '#5ad0e6', 0.45); g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - 0.6); g.quadraticCurveTo(mx, my - 0.6, x2, y2 - 0.6); g.stroke();
      g.fillStyle = '#3a3f4a'; for (const [px, py] of [[x, y], [x2, y2]]) { g.fillRect(px - 2.5, py - 2.5, 5, 5); g.strokeStyle = INK; g.lineWidth = 0.8; g.strokeRect(px - 2.5, py - 2.5, 5, 5); }
      break;
    }
    case 'hazard': {
      const w = (d.w || 4) * T, h = (d.h || 4) * T, x0 = x - T / 2, y0 = y - T / 2, th = 6;
      g.globalAlpha = 0.85;
      g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.rect(x0 + th, y0 + th, w - th * 2, h - th * 2); g.clip('evenodd');
      stripes(g, x0, y0, w, h, '#d9ab24', '#17141a', 6, 1); g.restore();
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1; g.strokeRect(x0, y0, w, h); g.strokeRect(x0 + th, y0 + th, w - th * 2, h - th * 2);
      g.globalAlpha = 1;
      if (d.ring) { g.strokeStyle = rgba(accent || '#ff5367', 0.4); g.lineWidth = 2; g.beginPath(); g.arc(x0 + w / 2, y0 + h / 2, Math.min(w, h) / 2 - th - 8, 0, TAU); g.stroke(); }
      break;
    }
    case 'stain': { const r = 14 * size; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(12,10,8,0.3)'); gr.addColorStop(0.7, 'rgba(12,10,8,0.12)'); gr.addColorStop(1, 'rgba(12,10,8,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); break; }
    case 'blood': {
      const r = 12 * size, rnd = hash2(Math.floor(x), Math.floor(y), seed);
      g.fillStyle = 'rgba(70,10,20,0.6)'; g.beginPath(); g.ellipse(x, y, r * 0.8, r * 0.6, rot, 0, TAU); g.fill();
      for (let i = 0; i < 5; i++) { const a = rnd * 6 + i * 1.3, dd = r * (0.7 + (i % 3) * 0.25); g.beginPath(); g.arc(x + Math.cos(a) * dd, y + Math.sin(a) * dd, 1.2 + (i % 2), 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(160,40,60,0.25)'; g.beginPath(); g.ellipse(x - 2, y - 2, r * 0.3, r * 0.2, rot, 0, TAU); g.fill();
      break;
    }
    case 'crack': {
      g.strokeStyle = 'rgba(8,6,12,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); let a = rot, px = x, py = y;
      for (let i = 0; i < 6; i++) { a += (hash2(i, Math.floor(x), seed) - 0.5) * 1.4; px += Math.cos(a) * 7 * size; py += Math.sin(a) * 7 * size; g.lineTo(px, py); }
      g.stroke(); g.strokeStyle = 'rgba(255,240,225,0.1)'; g.lineWidth = 0.6; g.stroke();
      break;
    }
    case 'drain': {
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(x, y, 11, 0, TAU); g.fill();
      g.fillStyle = '#23262e'; g.beginPath(); g.arc(x, y, 9.5, 0, TAU); g.fill(); g.strokeStyle = '#59606c'; g.lineWidth = 1; g.stroke();
      g.strokeStyle = '#08090c'; g.lineWidth = 1.6; g.beginPath(); for (let i = -5; i <= 5; i += 3.3) { g.moveTo(x - 6, y + i); g.lineTo(x + 6, y + i); } g.stroke();
      break;
    }
    case 'paper': {
      for (let i = 0; i < 3; i++) {
        g.save(); g.translate(x + (i - 1) * 6, y + (i % 2) * 4); g.rotate(rot + i * 0.9); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-4.6, -5.6, 9, 11.5);
        g.fillStyle = '#eceae0'; g.fillRect(-4.5, -5.5, 9, 11); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.5; g.strokeRect(-4.5, -5.5, 9, 11);
        g.fillStyle = 'rgba(60,70,90,0.5)'; for (let k = 0; k < 4; k++) g.fillRect(-3.2, -3.8 + k * 2.2, 6.4, 0.6); g.restore();
      }
      break;
    }
    case 'puddle': {
      const r = 15 * size;
      g.fillStyle = 'rgba(14,20,30,0.55)'; g.beginPath(); g.ellipse(x, y, r, r * 0.65, rot, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(150,190,230,0.3)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = 'rgba(190,220,255,0.18)'; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.2, r * 0.4, r * 0.18, rot, 0, TAU); g.fill();
      break;
    }
    default: break;
  }
  g.restore();
}

// soft coloured pool for ceiling lamps (additive)
export function lampPool(g, x, y, r, color, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(mix(color, '#fff0d8', 0.55), a)); gr.addColorStop(0.5, rgba(color, a * 0.35)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}
void shade;
