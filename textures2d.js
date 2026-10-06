// Procedural material textures (tileable) for floors, walls and the void.
import {makeCanvas, seeded} from './sprites2d.js';

function blotch(g, x, y, r, rgb, alpha) {
  const fade = g.createRadialGradient(x, y, 0, x, y, r);
  fade.addColorStop(0, `rgba(${rgb},${alpha})`);
  fade.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = fade;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}
export {blotch};

function wrap(tile, x, y, reach, fn) {
  for (const dx of [-tile, 0, tile]) for (const dy of [-tile, 0, tile]) {
    const px = x + dx, py = y + dy;
    if (px + reach >= 0 && px - reach <= tile && py + reach >= 0 && py - reach <= tile) fn(px, py);
  }
}

function scratch(g, rnd, x, y, len) {
  let a = rnd() * Math.PI * 2;
  g.moveTo(x, y);
  for (let i = 0; i < 4; i++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * len / 4; y += Math.sin(a) * len / 4; g.lineTo(x, y); }
}

// Transparent grime layered over a flat floor colour: specks, soft blotches and scratches.
export function grimeTile(size = 192, seed = 5, strength = 1) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), rnd = seeded(seed);
  const area = size * size / 10000;
  for (let i = 0; i < 9 * area; i++) {
    const r = 10 + rnd() * 34, light = rnd() < 0.42;
    wrap(size, rnd() * size, rnd() * size, r, (x, y) => blotch(g, x, y, r, light ? '255,244,230' : '10,8,14', (light ? 0.04 : 0.06) * strength));
  }
  for (let i = 0; i < 520 * area; i++) {
    const dark = rnd() < 0.62, fleck = rnd() < 0.05;
    g.fillStyle = dark ? '#0c0a10' : '#fff2e0';
    g.globalAlpha = (fleck ? 0.35 + rnd() * 0.2 : 0.07 + rnd() * 0.14) * strength;
    const s = fleck ? 1 + rnd() * 1.4 : 0.6 + rnd() * 0.9;
    g.fillRect(rnd() * size, rnd() * size, s, s);
  }
  g.globalAlpha = 1;
  g.strokeStyle = `rgba(10,8,14,${0.10 * strength})`; g.lineWidth = 0.7; g.beginPath();
  for (let i = 0; i < 3 * area; i++) scratch(g, rnd, rnd() * size, rnd() * size, 14 + rnd() * 30);
  g.stroke();
  return c;
}

// Concrete block / panel wall top texture, opaque.
export function wallTile(size = 128, seed = 11) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), rnd = seeded(seed);
  g.fillStyle = '#5d5867'; g.fillRect(0, 0, size, size);
  const area = size * size / 10000;
  for (let i = 0; i < 14 * area; i++) {
    const r = 8 + rnd() * 26, light = rnd() < 0.5;
    wrap(size, rnd() * size, rnd() * size, r, (x, y) => blotch(g, x, y, r, light ? '255,250,240' : '20,16,28', light ? 0.07 : 0.1));
  }
  // cinder block courses
  const course = size / 4;
  g.strokeStyle = 'rgba(16,12,24,0.55)'; g.lineWidth = 1.4; g.beginPath();
  for (let row = 0; row < 4; row++) {
    const y = row * course;
    g.moveTo(0, y + 0.7); g.lineTo(size, y + 0.7);
    const off = row % 2 ? size / 4 : 0;
    for (let x = off; x < size + 1; x += size / 2) { g.moveTo(x + 0.7, y); g.lineTo(x + 0.7, y + course); }
  }
  g.stroke();
  g.strokeStyle = 'rgba(255,248,236,0.12)'; g.lineWidth = 1; g.beginPath();
  for (let row = 0; row < 4; row++) { const y = row * course; g.moveTo(0, y + 2); g.lineTo(size, y + 2); }
  g.stroke();
  for (let i = 0; i < 420 * area; i++) {
    g.fillStyle = rnd() < 0.6 ? '#120e1a' : '#fff4e6';
    g.globalAlpha = 0.05 + rnd() * 0.12;
    g.fillRect(rnd() * size, rnd() * size, 0.7 + rnd(), 0.7 + rnd());
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(14,10,20,0.25)'; g.lineWidth = 0.7; g.beginPath();
  for (let i = 0; i < 3 * area; i++) scratch(g, rnd, rnd() * size, rnd() * size, 10 + rnd() * 24);
  g.stroke();
  return c;
}

// Deep rock/void fill with a faint texture so it is not a flat black.
export function voidTile(size = 128, seed = 3) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), rnd = seeded(seed);
  g.fillStyle = '#0d0b13'; g.fillRect(0, 0, size, size);
  const area = size * size / 10000;
  for (let i = 0; i < 10 * area; i++) {
    const r = 12 + rnd() * 30;
    wrap(size, rnd() * size, rnd() * size, r, (x, y) => blotch(g, x, y, r, '70,60,90', 0.05 + rnd() * 0.04));
  }
  for (let i = 0; i < 160 * area; i++) { g.fillStyle = '#4d4560'; g.globalAlpha = 0.05 + rnd() * 0.1; g.fillRect(rnd() * size, rnd() * size, 1, 1); }
  g.globalAlpha = 1;
  return c;
}

export function steelPlateTile(size = 64, seed = 9) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), rnd = seeded(seed);
  g.fillStyle = '#3d3a46'; g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2; g.beginPath();
  for (let i = -size; i < size * 2; i += 12) { g.moveTo(i, 0); g.lineTo(i + size, size); }
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.beginPath();
  for (let i = -size; i < size * 2; i += 12) { g.moveTo(i + 3, 0); g.lineTo(i + 3 + size, size); }
  g.stroke();
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(rnd() * size, rnd() * size, 1, 1); }
  return c;
}
