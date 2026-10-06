// Fog of exploration + light pools. A small per-tile darkness map is eased toward its target, upscaled with
// smoothing into a low-resolution light buffer, and the player's light is carved out of it each frame.
import {TILE} from './catalog.js';
import {makeCanvas} from './sprites2d.js';

const FOG = {current: 0.1, visited: 0.46, unseen: 0.8, corridor: 0.55, rock: 0.93};

let lightSprite = null;
function sprite() {
  if (lightSprite) return lightSprite;
  const s = 128, c = makeCanvas(s, s), g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (let i = 0; i <= 8; i++) { const t = i / 8, a = Math.pow(1 - t, 1.7); grad.addColorStop(t, `rgba(0,0,0,${a.toFixed(3)})`); }
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  return lightSprite = c;
}

export class Lighting {
  constructor() {
    this.level = null;
    this.fog = makeCanvas(2, 2);
    this.light = makeCanvas(2, 2);
    this.key = '';
    this.dirty = true;
  }

  setLevel({tileMap, rooms}) {
    const h = tileMap.length, w = tileMap[0].length;
    const room = new Int16Array(w * h).fill(-1), floor = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (tileMap[y][x] === 0) floor[y * w + x] = 1;
    rooms.forEach((r, i) => { for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) if (floor[y * w + x]) room[y * w + x] = i; });
    // for every solid tile, the floor tiles around it
    const around = Array.from({length: w * h}, () => null);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (floor[y * w + x]) continue;
      const list = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && floor[ny * w + nx]) list.push(ny * w + nx); }
      around[y * w + x] = list;
    }
    this.level = {w, h, room, floor, around, rooms, cur: new Float32Array(w * h).fill(0.95), tgt: new Float32Array(w * h).fill(0.95)};
    this.fog.width = w; this.fog.height = h;
    this.fogData = this.fog.getContext('2d').createImageData(w, h);
    this.key = ''; this.dirty = true;
  }

  // Called each frame with the game state; cheap unless the room state changed or a fade is running.
  update(dt, state) {
    const L = this.level;
    if (!L) return;
    const key = state.currentRoom + '|' + state.rooms.map((r) => (r.visited ? 1 : 0)).join('');
    if (key !== this.key) {
      this.key = key;
      const roomAlpha = state.rooms.map((r, i) => (i === state.currentRoom ? FOG.current : r.visited ? FOG.visited : FOG.unseen));
      for (let i = 0; i < L.w * L.h; i++) {
        if (L.floor[i]) { const r = L.room[i]; L.tgt[i] = r >= 0 ? roomAlpha[r] : FOG.corridor; }
      }
      for (let i = 0; i < L.w * L.h; i++) {
        if (L.floor[i]) continue;
        const list = L.around[i];
        if (!list || !list.length) { L.tgt[i] = FOG.rock; continue; }
        let m = 0; for (const j of list) m += L.tgt[j];
        L.tgt[i] = Math.min(FOG.rock, m / list.length + 0.06);
      }
      this.dirty = true;
    }
    if (!this.dirty) return;
    const k = 1 - Math.exp(-3.2 * dt);
    let moving = false;
    const data = this.fogData.data;
    for (let i = 0; i < L.w * L.h; i++) {
      const d = L.tgt[i] - L.cur[i];
      if (Math.abs(d) > 0.004) { L.cur[i] += d * k; moving = true; } else L.cur[i] = L.tgt[i];
      const o = i * 4;
      data[o] = 6; data[o + 1] = 4; data[o + 2] = 14; data[o + 3] = Math.round(L.cur[i] * 255);
    }
    this.fog.getContext('2d').putImageData(this.fogData, 0, 0);
    this.dirty = moving;
  }

  // Jump straight to the target fog (new level) instead of fading in from black.
  settle(state) {
    const L = this.level;
    if (!L) return;
    this.update(0, state);
    L.cur.set(L.tgt); this.dirty = true;
    this.update(0, state);
  }

  // Draw the darkness over the already rendered world.
  draw(ctx, cam, dpr, {px, py, strength = 1, lights = [], flicker = 0}) {
    const L = this.level;
    if (!L) return;
    const DIV = 5, lw = Math.ceil(cam.w / DIV), lh = Math.ceil(cam.h / DIV);
    if (this.light.width !== lw || this.light.height !== lh) { this.light.width = lw; this.light.height = lh; }
    const g = this.light.getContext('2d');
    const ls = cam.scale / DIV, ox = lw / 2 - cam.x * ls, oy = lh / 2 - cam.y * ls;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 1;
    g.drawImage(this.fog, ox, oy, L.w * TILE * ls, L.h * TILE * ls);
    // outside the map is solid dark
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(6,4,14,0.95)'; g.fillRect(0, 0, lw, lh);
    g.globalCompositeOperation = 'destination-out';
    const pool = (x, y, r, a) => { const rr = r * ls; g.globalAlpha = Math.min(1, a); g.drawImage(sprite(), (x - cam.x) * ls + lw / 2 - rr, (y - cam.y) * ls + lh / 2 - rr, rr * 2, rr * 2); };
    if (px !== undefined) { pool(px, py, 230 + flicker * 6, 0.85 * strength); pool(px, py, 95, 0.4 * strength); }
    for (const l of lights) pool(l.x, l.y, l.r * 1.2, l.a * 0.9);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, lw, lh, 0, 0, Math.ceil(cam.w * dpr), Math.ceil(cam.h * dpr));
    ctx.restore();
  }
}
