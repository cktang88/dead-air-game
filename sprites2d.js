// Colour helpers, cached sprites and procedural gun/actor art for the Canvas 2D renderer.
import {hash2} from './util.js';
export const INK = '#14111a';
export const TAU = Math.PI * 2;

export const hexStr = (n) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
const parse = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const toStr = (r, g, b) => `rgb(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(Math.max(0, Math.min(255, b)))})`;
export function shade(hex, f) { const [r, g, b] = parse(hex); return toStr(r * f, g * f, b * f); }
export function tint(hex, k) { const [r, g, b] = parse(hex); return toStr(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k); }
export function mix(a, b, t) { const p = parse(a), q = parse(b); return toStr(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t); }
export function rgba(hex, a) { const [r, g, b] = parse(hex); return `rgba(${r},${g},${b},${a})`; }

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export {hash2};

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ---------------------------------------------------------------- sprite cache
let PX = 2;
const cache = new Map();
const scaleListeners = [];
export const onSpriteScale = (fn) => { scaleListeners.push(fn); };
export const getSpriteScale = () => PX;
export function setSpriteScale(pxPerUnit) {
  const px = Math.max(1, Math.round(pxPerUnit * 4) / 4);
  if (px !== PX) { PX = px; cache.clear(); }
  for (const fn of scaleListeners) fn(pxPerUnit);
}
function cached(key, build) { let v = cache.get(key); if (!v) cache.set(key, v = build(PX)); return v; }

function paint(half, draw, extra = 0) {
  const side = (half + extra) * 2;
  const c = makeCanvas(side * PX, side * PX);
  const g = c.getContext('2d');
  g.scale(PX, PX);
  g.translate(half + extra, half + extra);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g);
  return c;
}

function recolor(src, color) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// ---------------------------------------------------------------- glow / shadow / puff sprites
export function glowSprite(color) {
  return cached('glow|' + color, () => {
    const s = 64, c = makeCanvas(s, s), g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, rgbaOf(color, 1));
    grad.addColorStop(0.25, rgbaOf(color, 0.55));
    grad.addColorStop(0.6, rgbaOf(color, 0.14));
    grad.addColorStop(1, rgbaOf(color, 0));
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    return c;
  });
}
function rgbaOf(color, a) { return color.startsWith('#') ? rgba(color, a) : color.replace('rgb(', 'rgba(').replace(')', `,${a})`); }

export function puffSprite(color = '#b9b4bd') {
  return cached('puff|' + color, () => {
    const s = 64, c = makeCanvas(s, s), g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    grad.addColorStop(0, rgbaOf(color, 0.9));
    grad.addColorStop(0.55, rgbaOf(color, 0.5));
    grad.addColorStop(1, rgbaOf(color, 0));
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    return c;
  });
}

export const LIGHT = {x: 0.62, y: 0.78};

export function blobShadow(radius) {
  return cached('blob|' + radius, (px) => {
    const reach = radius * 1.5;
    const c = makeCanvas(reach * 2 * px, reach * 2 * px), g = c.getContext('2d');
    g.scale(px, px);
    const fade = g.createRadialGradient(reach, reach, radius * 0.45, reach, reach, reach);
    fade.addColorStop(0, 'rgba(6,5,10,0.5)');
    fade.addColorStop(0.55, 'rgba(6,5,10,0.28)');
    fade.addColorStop(1, 'rgba(6,5,10,0)');
    g.fillStyle = fade; g.fillRect(0, 0, reach * 2, reach * 2);
    return c;
  });
}
export function drawBlobShadow(ctx, x, y, radius, lift = 0, alpha = 1) {
  const reach = radius * 1.5, k = radius * (0.5 + lift * 0.04);
  ctx.globalAlpha = alpha;
  ctx.drawImage(blobShadow(radius), x + LIGHT.x * k - reach, y + LIGHT.y * k - reach, reach * 2, reach * 2);
  ctx.globalAlpha = 1;
}

// Soft box shadow cast down and to the right, cached per size/height.
export function boxShadow(w, h, height) {
  return cached(`box|${w}|${h}|${height}`, (px) => {
    const len = height * 2.2, dx = LIGHT.x * len, dy = LIGHT.y * len, pad = 14;
    const c = makeCanvas((w + dx + pad * 2) * px * 0.6, (h + dy + pad * 2) * px * 0.6), g = c.getContext('2d');
    const k = px * 0.6;
    g.setTransform(k, 0, 0, k, pad * k, pad * k);
    if ('filter' in g) g.filter = `blur(${6 * k}px)`;
    g.fillStyle = 'rgba(5,4,9,0.62)';
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w + dx, dy); g.lineTo(w + dx, h + dy); g.lineTo(dx, h + dy); g.lineTo(0, h);
    g.closePath(); g.fill();
    return {canvas: c, pad, k};
  });
}
export function drawBoxShadow(ctx, x, y, w, h, height) {
  const s = boxShadow(w, h, height);
  ctx.drawImage(s.canvas, x - s.pad, y - s.pad, s.canvas.width / s.k, s.canvas.height / s.k);
}

// ---------------------------------------------------------------- actors
// Facing +x. `r` is the drawn radius in world units (a little bigger than the collision body so they read well).
export const ACTOR_LOOK = {
  player: {r: 10.5, color: '#62e1ad', half: 15},
  chaser: {r: 10, color: '#e95563', half: 17},
  gunner: {r: 10.5, color: '#e9a45a', half: 15},
  brute: {r: 15.5, color: '#a17ae7', half: 22},
  guard: {r: 12.5, color: '#58aeca', half: 19},
  sniper: {r: 9, color: '#4fd0c4', half: 16},
  riot: {r: 12.5, color: '#8aa0b4', half: 18},
  elite: {r: 19.5, color: '#ff9566', half: 27},
};

// Body silhouettes by type so a glance tells them apart: round gunner, octagon-plated warden, slim marksman,
// square-shouldered riot, wide brute. Facing +x; rx is the length along the facing, ry the width across it.
const BODY_SHAPE = {
  guard: {sides: 8, rx: 1, ry: 1},
  sniper: {sides: 0, rx: 0.78, ry: 1},
  riot: {sides: 4, rx: 1, ry: 1, round: 3.2},
  brute: {sides: 0, rx: 0.9, ry: 1.12},
};
function shapePath(g, r, shape) {
  g.beginPath();
  if (!shape || !shape.sides) { g.ellipse(0, 0, r * (shape?.rx ?? 1), r * (shape?.ry ?? 1), 0, 0, TAU); return; }
  const n = shape.sides, off = n === 4 ? Math.PI / 4 : Math.PI / n;
  const k = n === 4 ? 1.05 : 1.04;
  for (let i = 0; i < n; i++) { const a = off + i * TAU / n; const x = Math.cos(a) * r * k * shape.rx, y = Math.sin(a) * r * k * shape.ry; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath();
}
function disc(g, r, color, rim = 1.5, kind) {
  const shape = BODY_SHAPE[kind];
  g.lineJoin = 'round';
  g.fillStyle = INK; shapePath(g, r, shape); g.fill(); if (shape?.sides) { g.strokeStyle = INK; g.lineWidth = shape.round || 1.6; g.stroke(); }
  const inner = r - rim;
  const grad = g.createLinearGradient(-inner, -inner, inner, inner);
  grad.addColorStop(0, tint(color, 0.2)); grad.addColorStop(0.55, color); grad.addColorStop(1, shade(color, 0.78));
  g.fillStyle = grad; shapePath(g, inner, shape); g.fill();
  if (shape?.sides) { g.strokeStyle = grad; g.lineWidth = (shape.round || 1.6) - 0.9; g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, inner - 0.7, Math.PI * 1.08, Math.PI * 1.62); g.stroke();
}
function inked(g, fill, w = 1) { g.fillStyle = fill; g.fill(); g.lineWidth = w; g.strokeStyle = INK; g.stroke(); }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function tri(g, ax, ay, bx, by, cx, cy) { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.closePath(); }

const DETAIL = {
  player(g, c) {
    rrect(g, -10, -4.6, 5.6, 9.2, 1.8); inked(g, '#27403f');
    g.beginPath(); g.ellipse(-0.6, 0, 5.2, 8.6, 0, 0, TAU); inked(g, shade(c, 0.68));
    g.beginPath(); g.arc(1.2, 0, 5.3, 0, TAU);
    const hg = g.createLinearGradient(-3, -4, 5, 4); hg.addColorStop(0, tint(c, 0.5)); hg.addColorStop(1, c);
    inked(g, hg);
    g.beginPath(); g.ellipse(4.4, 0, 2.1, 3.5, 0, 0, TAU); g.fillStyle = '#0d242a'; g.fill();
    g.strokeStyle = 'rgba(150,240,255,0.8)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(5, -2.4); g.lineTo(5.4, 1.2); g.stroke();
  },
  chaser(g, c) {
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(2, s * 6.2); g.lineTo(10, s * 5.2); g.lineTo(10.5, s * 3.3); g.lineTo(3, s * 3); g.closePath(); inked(g, shade(c, 0.78), 1);
      tri(g, 10, s * 5.8, 16.5, s * 3.4, 10.4, s * 2.8); inked(g, '#f3e0d2', 0.9);
    }
    for (const a of [2.5, Math.PI, 3.78]) {
      const cx = Math.cos(a), cy = Math.sin(a);
      tri(g, cx * 6.6 - cy * 2.4, cy * 6.6 + cx * 2.4, cx * 11.8, cy * 11.8, cx * 6.6 + cy * 2.4, cy * 6.6 - cx * 2.4); inked(g, shade(c, 0.6), 0.9);
    }
    disc(g, 8.2, c, 1.3);
    g.fillStyle = shade(c, 0.6); g.beginPath(); g.ellipse(-1.5, 0, 3.4, 6.3, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffe36a'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(5.2, s * 2.7, 1.9, 1.05, s * -0.45, 0, TAU); g.fill(); }
    g.strokeStyle = INK; g.lineWidth = 0.9; g.beginPath(); g.moveTo(3, -4.8); g.lineTo(7, -1.8); g.moveTo(3, 4.8); g.lineTo(7, 1.8); g.stroke();
  },
  gunner(g, c) {
    g.save(); g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.clip();
    g.strokeStyle = '#4a2f23'; g.lineWidth = 3; g.beginPath(); g.moveTo(-7, -9); g.lineTo(7, 9); g.stroke();
    g.fillStyle = '#e8c978'; for (let i = -2; i <= 2; i++) { g.fillRect(i * 2.5 - 0.5, i * 2.5 - 0.5, 1.4, 1.4); }
    g.restore();
    g.beginPath(); g.ellipse(-0.8, 0, 4.4, 9, 0, 0, TAU); g.lineWidth = 1; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.arc(0.8, 0, 6, 0, TAU); inked(g, shade(c, 0.72));
    rrect(g, 3.4, -3.7, 3.4, 7.4, 1.2); inked(g, '#1c1417');
    g.fillStyle = '#ffc261'; g.fillRect(4.7, -2.6, 1.2, 5.2);
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 0.9; g.beginPath(); g.arc(0.8, 0, 4.6, Math.PI * 1.1, Math.PI * 1.55); g.stroke();
  },
  brute(g, c) {
    for (const s of [-1, 1]) {
      rrect(g, -5.8, s > 0 ? 6.4 : -14.2, 11.6, 7.8, 3.2); inked(g, shade(c, 0.55), 1.1);
      g.fillStyle = '#d6cfe0'; for (const x of [-3, 0, 3]) { g.beginPath(); g.arc(x, s * 10.3, 0.9, 0, TAU); g.fill(); }
    }
    rrect(g, -8.4, -8.4, 4.4, 16.8, 1.4); inked(g, '#2d2540', 1);
    g.beginPath(); g.arc(2.4, 0, 5.4, 0, TAU); inked(g, shade(c, 0.5));
    rrect(g, 5.2, -3.1, 2.4, 6.2, 1); inked(g, '#210c10', 0.8);
    g.fillStyle = '#ff5a4a'; g.fillRect(5.7, -2.2, 1.4, 4.4);
    g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 1; g.beginPath(); g.arc(2.4, 0, 4, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
  },
  guard(g, c) {
    // WARDEN: heavy plated body, big pauldrons, domed helmet with a glowing visor bar, chest strap
    for (const sd of [-1, 1]) { rrect(g, -5.2, sd > 0 ? 5.6 : -13.4, 11, 7.8, 3.4); inked(g, shade(c, 0.78), 1.1); g.fillStyle = tint(c, 0.6); g.fillRect(-2, sd * 9.5 - 0.7, 5.5, 1.4); }
    rrect(g, -10.6, -6.4, 4.8, 12.8, 1.6); inked(g, '#4d6470', 1);
    g.beginPath(); g.arc(1, 0, 6.4, 0, TAU); inked(g, tint(c, 0.45), 1.1);
    g.fillStyle = shade(c, 0.6); g.fillRect(-4.6, -1, 5.2, 2);
    rrect(g, 3.6, -4.2, 3.2, 8.4, 1.1); inked(g, '#10252d', 0.8);
    g.fillStyle = '#7fe8ff'; g.fillRect(4.6, -3, 1.2, 6);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.9; g.beginPath(); g.arc(1, 0, 5, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
  },
  sniper(g, c) {
    // slim hooded shooter: cloak cape trailing behind, shoulder pads, and a glowing red scope lens
    g.beginPath(); g.moveTo(-3, -9); g.lineTo(-12, -4); g.lineTo(-13, 0); g.lineTo(-12, 4); g.lineTo(-3, 9); g.closePath(); inked(g, shade(c, 0.5), 1);
    g.beginPath(); g.ellipse(-0.6, 0, 4.4, 8.6, 0, 0, TAU); inked(g, shade(c, 0.7), 1);
    g.beginPath(); g.arc(1.2, 0, 5.6, 0, TAU); inked(g, shade(c, 0.88), 1);
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.9; g.beginPath(); g.arc(1.2, 0, 4.4, Math.PI * 1.1, Math.PI * 1.55); g.stroke();
    rrect(g, 3.2, -2.2, 4.2, 4.4, 1.2); inked(g, '#0f1f22', 0.8);
    g.fillStyle = '#ff3a4e'; g.beginPath(); g.arc(5.8, 0, 1.5, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(5.4, -0.5, 0.5, 0, TAU); g.fill();
  },
  riot(g, c) {
    // heavy-armoured shoulders, riot helmet with a visor slit, and a baton at the hip
    for (const s of [-1, 1]) { rrect(g, -4.8, s > 0 ? 5.2 : -11.6, 10.4, 6.4, 3); inked(g, shade(c, 0.62), 1.1); }
    rrect(g, -9.4, -7.4, 4.6, 14.8, 1.4); inked(g, '#2b3440', 1);
    g.beginPath(); g.arc(1.6, 0, 6.6, 0, TAU); inked(g, shade(c, 0.85), 1.1);
    g.fillStyle = '#16202a'; rrect(g, 4.4, -4.6, 3.2, 9.2, 1); g.fill();
    g.fillStyle = '#ffd36e'; g.fillRect(5.1, -1.1, 1.8, 2.2);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(1.6, 0, 5, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
  },
  elite(g, c) {
    for (const s of [-1, 1]) {
      tri(g, -3, s * 12, 7, s * 18, 7.5, s * 10.8); inked(g, '#3b2118', 1.2);
      tri(g, -8, s * 10.5, -3, s * 21, 3, s * 12); inked(g, shade(c, 0.5), 1.2);
      g.fillStyle = '#ffd36e'; g.beginPath(); g.arc(1.5, s * 12.3, 1.3, 0, TAU); g.fill();
    }
    g.strokeStyle = '#ffd36e'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, 15, Math.PI * 0.2, Math.PI * 1.8); g.stroke();
    g.beginPath(); g.arc(1, 0, 8, 0, TAU); inked(g, shade(c, 0.46), 1.3);
    for (let i = -2; i <= 2; i++) { const a = i * 0.42; tri(g, Math.cos(a) * 7.2 - 0.9 * Math.sin(a), Math.sin(a) * 7.2 + 0.9 * Math.cos(a), Math.cos(a) * 12, Math.sin(a) * 12, Math.cos(a) * 7.2 + 0.9 * Math.sin(a), Math.sin(a) * 7.2 - 0.9 * Math.cos(a)); inked(g, '#ffd36e', 0.8); }
    rrect(g, 5.2, -4, 3, 8, 1.2); inked(g, '#1d0b0a', 0.8);
    g.fillStyle = '#ff4a30'; g.fillRect(5.9, -2.8, 1.6, 5.6);
    g.strokeStyle = 'rgba(255,230,180,0.5)'; g.lineWidth = 1.3; g.beginPath(); g.arc(1, 0, 5.7, Math.PI * 1.1, Math.PI * 1.55); g.stroke();
  },
};

const BASE_R = {player: 10.5, chaser: 8.2, gunner: 10.5, brute: 14, guard: 12, sniper: 8.6, riot: 11.5, elite: 17.5};

export function actorSprite(kind) {
  return cached('actor|' + kind, () => {
    const look = ACTOR_LOOK[kind], r = BASE_R[kind];
    const base = paint(look.half, (g) => { if (kind !== 'chaser') disc(g, r, look.color, kind === 'elite' ? 2.2 : 1.5, kind); });
    const detail = paint(look.half, (g) => DETAIL[kind](g, look.color));
    return {half: look.half, base, detail, whiteBase: recolor(base, '#fff'), whiteDetail: recolor(detail, '#fff'), r: look.r};
  });
}

// A darkened, slumped version used once an enemy is down.
export const corpseOverrides = {};   // kind -> (px) => {half, img}; stacked actors bake their own flat corpse (actor-stack2d.js)
export function corpseSprite(kind) {
  return cached('corpse|' + kind, () => {
    if (corpseOverrides[kind]) return corpseOverrides[kind](PX);
    const s = actorSprite(kind), look = ACTOR_LOOK[kind];
    const c = makeCanvas(s.base.width, s.base.height), g = c.getContext('2d');
    g.drawImage(s.base, 0, 0); g.drawImage(s.detail, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(58,16,38,0.62)'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(16,10,18,0.25)'; g.fillRect(0, 0, c.width, c.height);
    return {half: look.half, img: c};
  });
}

// ---------------------------------------------------------------- guns
export const GUN_ART = {
  'PISTOL': {parts: [[0.0, 0.34, 0.55, 'a'], [0.1, 1, 0.9, 'b'], [0.7, 0.5, 1.0, 'm']]},
  'SMG': {parts: [[-0.1, 0.55, 0.02, 'a'], [0, 1, 0.58, 'b'], [0.56, 0.4, 1, 'm']], mag: [0.24, 0.16, 0.8], extra: 'drum'},
  'SHOTGUN': {parts: [[-0.12, 0.8, 0.2, 'a'], [0.2, 1.02, 0.46, 'b'], [0.46, 0.8, 1, 'm']], pump: [0.5, 0.2, 1.22], twin: true},
  'ASSAULT RIFLE': {parts: [[-0.14, 0.8, 0.16, 'a'], [0.14, 1, 0.52, 'b'], [0.52, 0.72, 0.84, 'a'], [0.84, 0.3, 1, 'm']], mag: [0.3, 0.14, 0.9]},
  'SNIPER': {parts: [[-0.12, 0.8, 0.2, 'a'], [0.16, 0.95, 0.46, 'b'], [0.46, 0.3, 1, 'm']], scope: [0.2, 0.34, 0.62], bipod: true},
  'BURST': {parts: [[-0.1, 0.5, 0.04, 'a'], [0, 1, 0.6, 'b'], [0.6, 0.34, 1, 'm']], mag: [0.3, 0.1, 0.9], scope: [0.12, 0.2, 0.5]},
  'CARBINE': {parts: [[-0.16, 0.9, 0.2, 'a'], [0.16, 1, 0.56, 'b'], [0.56, 0.58, 0.9, 'a'], [0.9, 0.34, 1, 'm']], mag: [0.34, 0.12, 0.85], scope: [0.18, 0.22, 0.46]},
  'LAUNCHER': {parts: [[-0.12, 0.7, 0.18, 'a'], [0.18, 1.5, 0.84, 'b'], [0.84, 1.7, 1, 'm']], scope: [0.3, 0.16, 0.8]},
  'ANTI-MATERIEL': {parts: [[-0.1, 1, 0.22, 'a'], [0.2, 1.35, 0.5, 'b'], [0.5, 0.52, 0.93, 'm'], [0.93, 0.95, 1, 'm']], scope: [0.24, 0.3, 0.6], mag: [0.3, 0.2, 1], bipod: true},
};

// Draws a gun lying along +x with the actor's centre at the origin. Returns the muzzle distance.
export function drawGun(g, gun, {reach = 5, enemy = false, glove = '#2a2530', slide = 0, rack = 0, noMag = false} = {}) {
  const art = GUN_ART[gun.visual?.art] || GUN_ART[gun.category] || GUN_ART.SMG;
  const L = gun.visual.length * 0.7, W = Math.max(3.2, gun.visual.width * 0.78);
  const body = enemy ? '#403a49' : '#2a2c33', alt = enemy ? '#5a5266' : '#3d4049', metal = enemy ? '#b4b2bb' : '#8d8b92';
  const accent = enemy ? '#ff5a4a' : '#' + (gun.color & 0xffffff).toString(16).padStart(6, '0');
  g.lineJoin = 'round';
  g.strokeStyle = INK; g.lineWidth = 0.9;
  const rect = (x0, x1, t, fill, yOff = 0) => { const x = reach + x0 * L, w = (x1 - x0) * L, h = W * t; g.fillStyle = fill; g.fillRect(x, -h / 2 + yOff, w, h); g.strokeRect(x, -h / 2 + yOff, w, h); };
  if (art.bipod) { g.strokeStyle = '#555a63'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(reach + 0.66 * L, 0); g.lineTo(reach + 0.8 * L, -W * 1.1); g.moveTo(reach + 0.66 * L, 0); g.lineTo(reach + 0.8 * L, W * 1.1); g.stroke(); g.strokeStyle = INK; g.lineWidth = 0.9; }
  if (art.twin) {
    for (const s of [-1, 1]) rect(0.46, 1, 0.38, metal, s * W * 0.22);
  }
  for (const [a, t, b, kind] of art.parts) {
    if (art.twin && kind === 'm') continue;
    const x0 = Math.min(a, b), x1 = Math.max(a, b);
    if (x1 - x0 < 0.01) continue;
    // the slide / receiver body rocks back on each shot (kick 1 -> 0)
    const sx = kind === 'b' && !art.pump ? -(slide + rack * 0.8) * 0.07 : 0;
    rect((a < b ? a : b) + sx, (a < b ? b : a) + sx, t, kind === 'm' ? metal : kind === 'a' ? alt : body);
  }
  if (art.mag && !noMag) rect(art.mag[0], art.mag[0] + art.mag[1], art.mag[2] * 0.0 + 0.55, '#33363e', W * 0.78);
  if (art.pump) { const po = -L * 0.2 * Math.sin(Math.PI * Math.min(1, Math.max(0, (0.95 - slide) / 0.95))) * (slide > 0.02 ? 1 : 0) - rack * L * 0.15; rect(art.pump[0] + po / L, art.pump[0] + art.pump[1] + po / L, art.pump[2], '#4a3a30'); }
  else { const hx = reach + 0.3 * L - (slide * 0.1 + rack * 0.16) * L; g.fillStyle = '#c9c6cf'; g.fillRect(hx, -W * 0.5 - 0.2, L * 0.1, 1.1); g.strokeStyle = INK; g.lineWidth = 0.5; g.strokeRect(hx, -W * 0.5 - 0.2, L * 0.1, 1.1); g.lineWidth = 0.9; }
  if (art.scope) { rect(art.scope[0], art.scope[0] + art.scope[1], 0.62, '#1f2128', -W * 0.0); g.fillStyle = '#7fe0ff'; g.fillRect(reach + (art.scope[0] + art.scope[1]) * L - 0.9, -W * 0.22, 1.1, W * 0.44); }
  g.fillStyle = accent; g.fillRect(reach + 0.2 * L, -W * 0.12, L * 0.22, W * 0.24);
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(reach + 0.12 * L, -W * 0.46, L * 0.34, 0.7);
  if (art.extra === 'drum' && !noMag) { g.beginPath(); g.arc(reach + 0.38 * L, W * 0.95, W * 0.48, 0, TAU); g.fillStyle = '#33363e'; g.fill(); g.strokeStyle = INK; g.stroke(); }
  return {muzzle: reach + L, rear: reach + L * 0.18, front: reach + L * (art.scope ? 0.5 : 0.58), width: W, length: L};
}

export function drawHand(g, x, y, color, r = 2.7) {
  g.fillStyle = INK; g.beginPath(); g.arc(x, y, r + 0.9, 0, TAU); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, TAU); g.fill();
}

// ---------------------------------------------------------------- props: crates and pillars
const planks = (g, w, h, rnd) => {
  const n = 4, ph = h / n;
  for (let i = 0; i < n; i++) {
    const y = -h / 2 + i * ph, t = 0.9 + rnd() * 0.22;
    g.fillStyle = `rgba(${t > 1 ? '255,220,170' : '30,16,8'},${Math.abs(t - 1) * 0.55})`;
    g.fillRect(-w / 2, y, w, ph);
    g.fillStyle = 'rgba(25,13,8,0.5)'; g.fillRect(-w / 2, y + ph - 0.7, w, 0.7);
    g.strokeStyle = 'rgba(30,15,8,0.18)'; g.lineWidth = 0.4; g.beginPath();
    for (let k = 0; k < 3; k++) { const yy = y + 1 + rnd() * (ph - 2); g.moveTo(-w / 2, yy); g.lineTo(w / 2, yy + (rnd() - 0.5) * 1.2); }
    g.stroke();
  }
};

export const CRATE_SIZE = 25;
export function crateSprite(stage, variant) {
  return cached(`crate|${stage}|${variant}`, () => {
    const S = CRATE_SIZE, LIP = 3.2, half = S / 2 + LIP;
    return paint(half, (g) => {
      const rnd = seeded(77 + variant * 131);
      // lip: the visible south/east face
      g.fillStyle = '#2b1b13'; g.strokeStyle = INK; g.lineWidth = 1;
      g.beginPath(); g.rect(-S / 2 + LIP * 0.6, -S / 2 + LIP * 0.6, S + LIP * 0.4, S + LIP * 0.4); g.fill(); g.stroke();
      g.fillStyle = '#4d3524'; g.fillRect(-S / 2 + LIP, S / 2, S, LIP * 0.5);
      // top
      const base = stage === 0 ? '#8a6244' : stage === 1 ? '#7a5640' : '#66473a';
      g.save(); g.beginPath(); g.rect(-S / 2, -S / 2, S, S); g.clip();
      g.fillStyle = base; g.fillRect(-S / 2, -S / 2, S, S);
      planks(g, S, S, rnd);
      // frame + braces
      g.strokeStyle = shade(base, 0.62); g.lineWidth = 2.6;
      g.strokeRect(-S / 2 + 1.5, -S / 2 + 1.5, S - 3, S - 3);
      g.lineWidth = 2.2; g.beginPath(); g.moveTo(-S / 2 + 2.5, -S / 2 + 2.5); g.lineTo(S / 2 - 2.5, S / 2 - 2.5); g.moveTo(S / 2 - 2.5, -S / 2 + 2.5); g.lineTo(-S / 2 + 2.5, S / 2 - 2.5); g.stroke();
      g.strokeStyle = 'rgba(255,225,180,0.22)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-S / 2 + 1, -S / 2 + 1); g.lineTo(S / 2 - 1, -S / 2 + 1); g.stroke();
      g.fillStyle = '#c9b59a'; for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.arc(x * (S / 2 - 3), y * (S / 2 - 3), 0.9, 0, TAU); g.fill(); }
      // crack stages
      if (stage >= 1) crackLines(g, rnd, S, stage === 1 ? 2 : 5);
      if (stage >= 2) { g.fillStyle = 'rgba(15,8,6,0.22)'; g.fillRect(-S / 2, -S / 2, S, S); }
      g.restore();
      g.strokeStyle = INK; g.lineWidth = 1.3; g.strokeRect(-S / 2, -S / 2, S, S);
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-S / 2 + 1, S / 2 - 1); g.lineTo(-S / 2 + 1, -S / 2 + 1); g.lineTo(S / 2 - 1, -S / 2 + 1); g.stroke();
    });
  });
}
function crackLines(g, rnd, S, count) {
  g.strokeStyle = 'rgba(14,8,6,0.85)'; g.lineWidth = 0.9; g.lineJoin = 'round'; g.beginPath();
  for (let i = 0; i < count; i++) {
    let x = (rnd() - 0.5) * S * 0.7, y = (rnd() - 0.5) * S * 0.7, a = rnd() * TAU;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { a += (rnd() - 0.5) * 1.3; x += Math.cos(a) * 3.4; y += Math.sin(a) * 3.4; g.lineTo(x, y); }
  }
  g.stroke();
}

export function pillarSprite(stage = 0) {
  return cached('pillar|' + stage, () => {
    const R = 9.2, half = R + 3;
    return paint(half, (g) => {
      g.fillStyle = '#17141d'; g.strokeStyle = INK; g.lineWidth = 1;
      g.beginPath(); g.arc(1.6, 1.8, R, 0, TAU); g.fill(); g.stroke();
      const hex = (r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.26; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
      hex(R); const grad = g.createLinearGradient(-R, -R, R, R); grad.addColorStop(0, '#7c7788'); grad.addColorStop(1, '#4a4555'); g.fillStyle = grad; g.fill(); g.lineWidth = 1.3; g.strokeStyle = INK; g.stroke();
      hex(R - 2.6); g.fillStyle = '#5f5a6b'; g.fill(); g.lineWidth = 0.8; g.strokeStyle = 'rgba(20,17,26,.7)'; g.stroke();
      hex(R - 5); g.fillStyle = '#6f6a7c'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 0.9; g.beginPath(); g.arc(0, 0, R - 1.2, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
      g.fillStyle = '#d6b45a'; for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.26; g.beginPath(); g.arc(Math.cos(a) * (R - 1.7), Math.sin(a) * (R - 1.7), 0.7, 0, TAU); g.fill(); }
      g.fillStyle = '#d6b45a'; g.fillRect(-1.2, -1.2, 2.4, 2.4);
    });
  });
}

export const gunMuzzle = (gun, reach = 5) => reach + gun.visual.length * 0.7;

// A magazine held in a hand or sitting in a gun. Lies along +x.
export function drawMagSprite(g, x, y, rot = 0, len = 5.6, wid = 3.2) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = INK; g.fillRect(-len / 2 - 0.8, -wid / 2 - 0.8, len + 1.6, wid + 1.6);
  g.fillStyle = '#3a3e48'; g.fillRect(-len / 2, -wid / 2, len, wid);
  g.fillStyle = '#d3ac55'; g.fillRect(len / 2 - 1.2, -wid / 2 + 0.6, 1.2, wid - 1.2);
  g.restore();
}
