// Usage: ROT_PATH=... node tools/map-dump.mjs outDir seed [seed...]   -> outDir/map-<seed>.ppm (10px tiles)
// Debug view: floor tinted by theme, cover by kind, crates brown, spawn tiles red, entry doors yellow.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {generateDungeon} from '../dungeon.js';

const ROT = await import(process.env.ROT_PATH ? pathToFileURL(process.env.ROT_PATH).href : 'rot-js');
const [outDir, ...seeds] = process.argv.slice(2);
fs.mkdirSync(outDir, {recursive: true});
const S = 10;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const KIND = {pillar: [150, 140, 170], wall: [120, 112, 140], rack: [170, 120, 70], desk: [90, 130, 170], server: [70, 170, 190], bed: [200, 220, 220]};
for (const seed of seeds.map(Number)) {
  const d = generateDungeon(ROT, seed), W = d.width * S, H = d.height * S, buf = Buffer.alloc(W * H * 3);
  const paint = (tx, ty, col, inset = 0) => {
    for (let y = ty * S + inset; y < (ty + 1) * S - inset; y++) for (let x = tx * S + inset; x < (tx + 1) * S - inset; x++) buf.set(col, (y * W + x) * 3);
  };
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) paint(x, y, d.cells[y][x] === 0 ? [48, 46, 54] : [14, 13, 18]);
  for (const r of d.rooms) {
    const tint = hex(r.theme.tint).map(v => v + 22);
    for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) if (d.cells[y][x] === 0) paint(x, y, tint, 0);
    for (const t of r.cover) paint(t.x, t.y, KIND[t.kind] || [150, 150, 150]);
    for (const t of r.crates) paint(t.x, t.y, [160, 110, 60], 2);
    for (const t of r.spawnTiles.slice(0, 5)) paint(t.x, t.y, [220, 60, 70], 4);
    for (const t of r.openings) paint(t.x, t.y, [230, 200, 80], 4);
    if (r.entry) paint(r.entry.x, r.entry.y, [255, 255, 255], 3);
    const accent = hex(r.theme.accent);
    for (let x = r.x1; x <= r.x2; x++) { paint(x, r.y1 - 1, accent.map(v => v >> 1)); }
    paint(r.cx, r.cy, r.role === 'extraction' ? [80, 240, 240] : r.role === 'entry' ? [90, 240, 120] : accent, 3);
  }
  fs.writeFileSync(`${outDir}/map-${seed}.ppm`, Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), buf]));
  console.log(seed, d.rooms.map(r => `${r.role[0]}:${r.template}${r.breather ? '*' : ''}`).join(' '));
}
