// Fog of exploration + light pools. A small per-tile darkness map is eased toward its target, upscaled with
// smoothing into a low-resolution light buffer, and the player's light is carved out of it each frame.
import {TILE} from './catalog.js';
import {makeCanvas} from './sprites2d.js';

const FOG_SS = 4;
const FOG = {current: 0.16, visited: 0.4, unseen: 0.62, corridor: 0.42, rock: 0.9};

let lightSprite = null, vignetteSprite = null;
function vignette() {
  if (vignetteSprite) return vignetteSprite;
  const c = makeCanvas(128, 72), g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 36, 14, 64, 36, 78);
  grad.addColorStop(0, 'rgba(6,4,12,0)'); grad.addColorStop(0.55, 'rgba(6,4,12,0.3)'); grad.addColorStop(1, 'rgba(6,4,12,0.95)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 72);
  return vignetteSprite = c;
}

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
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && floor[ny * w + nx]) list.push(ny * w + nx); }
      around[y * w + x] = list;
    }
    this.level = {w, h, room, floor, around, rooms, cur: new Float32Array(w * h).fill(0.95), tgt: new Float32Array(w * h).fill(0.95)};
    this.fog.width = w * FOG_SS; this.fog.height = h * FOG_SS;
    this.fogData = this.fog.getContext('2d').createImageData(w * FOG_SS, h * FOG_SS);
    for (let i = 0; i < this.fogData.data.length; i += 4) { this.fogData.data[i] = 6; this.fogData.data[i + 1] = 4; this.fogData.data[i + 2] = 14; }
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
    }
    // smooth (bilinear) supersampled fog so room boundaries fade instead of stepping tile by tile
    // Feather the per-tile map (two separable [1 2 1] passes, ~2 tiles of falloff) so room/wall boundaries dissolve
    // instead of reading as hard rectangles. Runs only while the fog is changing (cached otherwise).
    const cur = this.blurFog(L);
    const W = L.w * FOG_SS, H = L.h * FOG_SS;
    for (let Y = 0; Y < H; Y++) {
      const v = (Y + 0.5) / FOG_SS - 0.5, y0 = Math.floor(v), fy = v - y0, ya = Math.max(0, y0), yb = Math.min(L.h - 1, y0 + 1);
      for (let X = 0; X < W; X++) {
        const u = (X + 0.5) / FOG_SS - 0.5, x0 = Math.floor(u), fx = u - x0, xa = Math.max(0, x0), xb = Math.min(L.w - 1, x0 + 1);
        const a = cur[ya * L.w + xa] * (1 - fx) + cur[ya * L.w + xb] * fx, b = cur[yb * L.w + xa] * (1 - fx) + cur[yb * L.w + xb] * fx;
        data[(Y * W + X) * 4 + 3] = (a * (1 - fy) + b * fy) * 255;
      }
    }
    this.fog.getContext('2d').putImageData(this.fogData, 0, 0);
    this.dirty = moving;
  }

  blurFog(L) {
    const n = L.w * L.h;
    if (!this.bufA || this.bufA.length !== n) { this.bufA = new Float32Array(n); this.bufB = new Float32Array(n); }
    let src = L.cur, a = this.bufA, b = this.bufB;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const i = y * L.w + x, l = src[y * L.w + Math.max(0, x - 1)], r = src[y * L.w + Math.min(L.w - 1, x + 1)];
        a[i] = (l + 2 * src[i] + r) * 0.25;
      }
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const i = y * L.w + x, u = a[Math.max(0, y - 1) * L.w + x], d = a[Math.min(L.h - 1, y + 1) * L.w + x];
        b[i] = (u + 2 * a[i] + d) * 0.25;
      }
      src = b; if (pass === 0) { const t = a; a = this.bufA; void t; }
    }
    return b;
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
  draw(ctx, cam, dpr, {px, py, strength = 1, lights = [], flicker = 0, slow = 0, dead = 0, won = false}) {
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
    // outside the map is solid dark
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(6,4,14,0.86)';
    const mx0 = ox, my0 = oy, mx1 = ox + L.w * TILE * ls, my1 = oy + L.h * TILE * ls;
    if (my0 > 0) g.fillRect(0, 0, lw, my0);
    if (my1 < lh) g.fillRect(0, my1, lw, lh - my1);
    if (mx0 > 0) g.fillRect(0, 0, mx0, lh);
    if (mx1 < lw) g.fillRect(mx1, 0, lw - mx1, lh);
    g.globalCompositeOperation = 'destination-out';
    const pool = (x, y, r, a) => { const rr = r * ls; g.globalAlpha = Math.min(1, a); g.drawImage(sprite(), (x - cam.x) * ls + lw / 2 - rr, (y - cam.y) * ls + lh / 2 - rr, rr * 2, rr * 2); };
    if (px !== undefined) { pool(px, py, 250 + flicker * 6, 0.9 * strength); pool(px, py, 110, 0.5 * strength); }
    for (const l of lights) pool(l.x, l.y, l.r * 1.2, l.a * 0.9);
    // grade (vignette, warm/cool tint) lives in the same buffer so a frame needs only one full-screen blend
    g.globalCompositeOperation = 'destination-over';
    g.globalAlpha = 0.1 + 0.24 * slow + dead * 0.2; g.drawImage(vignette(), 0, 0, lw, lh);
    g.globalAlpha = 1;
    if (dead > 0) { g.fillStyle = `rgba(70,8,20,${0.28 * dead})`; g.fillRect(0, 0, lw, lh); }
    if (won) { g.fillStyle = 'rgba(120,255,190,0.07)'; g.fillRect(0, 0, lw, lh); }
    g.fillStyle = slow > 0.01 ? `rgba(34,64,140,${0.13 * slow})` : 'rgba(0,0,0,0)'; g.fillRect(0, 0, lw, lh);
    g.fillStyle = `rgba(255,150,70,${0.05 * (1 - slow)})`; g.fillRect(0, 0, lw, lh);
    g.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, lw, lh, 0, 0, Math.ceil(cam.w * dpr), Math.ceil(cam.h * dpr));
    ctx.restore();
  }
}
