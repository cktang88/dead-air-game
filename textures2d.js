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

// Solid bedrock for everything outside the dungeon: faceted dark stone with cracks and a cool rim light, tileable.
export function voidTile(size = 128, seed = 3) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), rnd = seeded(seed);
  const N = 15, pts = [];
  for (let i = 0; i < N; i++) pts.push([rnd() * size, rnd() * size, 0.82 + rnd() * 0.36, rnd()]);
  const img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let d1 = 1e9, d2 = 1e9, k = 0;
    for (let i = 0; i < N; i++) {
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        const dx = x - (pts[i][0] + ox), dy = y - (pts[i][1] + oy), dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; k = i; } else if (dd < d2) d2 = dd;
      }
    }
    const e = Math.sqrt(d2) - Math.sqrt(d1);
    const shade = pts[k][2], crack = e < 2.2 ? 0.35 + e * 0.28 : 1, rim = e > 2.2 && e < 4.5 ? 1.18 : 1;
    const n = 0.93 + ((x * 7 + y * 13 + k * 31) % 11) * 0.011;
    const v = Math.min(1.4, shade * crack * rim * n);
    const o = (y * size + x) * 4;
    d[o] = 24 * v; d[o + 1] = 22 * v; d[o + 2] = 34 * v; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const area = size * size / 10000;
  for (let i = 0; i < 6 * area; i++) {
    const r = 14 + rnd() * 30;
    wrap(size, rnd() * size, rnd() * size, r, (x, y) => blotch(g, x, y, r, '60,56,90', 0.05));
  }
  for (let i = 0; i < 140 * area; i++) { g.fillStyle = rnd() < 0.7 ? '#4d4660' : '#06050a'; g.globalAlpha = 0.08 + rnd() * 0.14; g.fillRect(rnd() * size, rnd() * size, 1, 1); }
  g.globalAlpha = 1;
  return c;
}

// Short carpet fibres, tileable, transparent (laid over a flat carpet colour).
export function carpetTile(size = 64, seed = 4) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), rnd = seeded(seed);
  for (let i = 0; i < size * size * 0.5; i++) {
    const dark = rnd() < 0.5;
    g.fillStyle = dark ? '#05040a' : '#ffffff';
    g.globalAlpha = 0.05 + rnd() * 0.1;
    const x = rnd() * size, y = rnd() * size;
    g.fillRect(x, y, 1, 1 + (rnd() < 0.4 ? 1 : 0));
  }
  g.globalAlpha = 1;
  return c;
}

// Rubble / packed dirt speckle, tileable, transparent.
export function dirtTile(size = 128, seed = 8) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), rnd = seeded(seed);
  const area = size * size / 10000;
  for (let i = 0; i < 12 * area; i++) {
    const r = 6 + rnd() * 22, light = rnd() < 0.5;
    wrap(size, rnd() * size, rnd() * size, r, (x, y) => blotch(g, x, y, r, light ? '230,200,150' : '20,12,6', light ? 0.08 : 0.12));
  }
  for (let i = 0; i < 60 * area; i++) {
    const x = rnd() * size, y = rnd() * size, r = 0.8 + rnd() * 2.2, light = rnd() < 0.45;
    g.fillStyle = light ? 'rgba(240,215,170,0.35)' : 'rgba(18,10,6,0.45)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, 6.3); g.fill();
    if (!light) { g.fillStyle = 'rgba(240,215,170,0.18)'; g.fillRect(x - r * 0.5, y - r * 0.9, r, 0.7); }
  }
  for (let i = 0; i < 300 * area; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(10,6,4,0.3)' : 'rgba(255,240,210,0.25)'; g.fillRect(rnd() * size, rnd() * size, 1, 1); }
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
