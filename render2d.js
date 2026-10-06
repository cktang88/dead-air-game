// DEAD AIR Canvas 2D renderer. Reads the plain game `state` each frame and draws the whole scene:
// baked world chunks, props, actors, projectiles, effects, lighting and the slow-time grade.
import {ENEMY_TYPES, GUNS, TILE} from './catalog.js';
import {createCamera, followStep, lookAheadOffset, resizeCamera, screenToWorld as camScreenToWorld, slowAmount, viewBounds} from './camera2d.js';
import {Fx} from './fx2d.js';
import {Lighting} from './lighting2d.js';
import {ACTOR_LOOK, INK, TAU, actorSprite, corpseSprite, crateSprite, drawBlobShadow, drawBoxShadow, drawGun, drawHand, glowSprite, gunMuzzle, hexStr, makeCanvas, mix, pillarSprite, puffSprite, rgba, seeded, setSpriteScale, shade, tint} from './sprites2d.js';
import {WorldLayer} from './world2d.js';
import {drawIcon} from './icons.js';
import {createAffordances} from './affordances2d.js';

export {hexStr};
const FONT = "'Barlow Condensed','DM Mono',system-ui,sans-serif";
const MONO = "'DM Mono',ui-monospace,monospace";
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const hashPos = (x, y) => { let h = Math.imul(Math.round(x) * 73856093 ^ Math.round(y) * 19349663, 1274126177); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

const ENEMY_GUNS = {
  gunner: {category: 'ASSAULT RIFLE', visual: {length: 26, width: 5}, color: 0xff5a4a},
  guard: {category: 'SMG', visual: {length: 23, width: 5}, color: 0x58aeca},
};

// Dashed footprint trail behind moving bodies, aged in real time.
const TRAIL = {life: 0.9, step: 6, jump: 160, cap: 48, dash: 18, gap: 14};
class Trail {
  constructor() { this.pts = []; }
  record(x, y, now) {
    const pts = this.pts;
    while (pts.length && now - pts[0].at >= TRAIL.life) pts.shift();
    const last = pts[pts.length - 1];
    if (!last) { pts.push({x, y, at: now, walked: 0}); return; }
    const moved = Math.hypot(x - last.x, y - last.y);
    if (moved > TRAIL.jump) { pts.length = 0; pts.push({x, y, at: now, walked: 0}); return; }
    if (moved < TRAIL.step) return;
    pts.push({x, y, at: now, walked: last.walked + moved});
    if (pts.length > TRAIL.cap) pts.shift();
  }
  draw(ctx, now, color, width, alpha) {
    const pts = this.pts, period = TRAIL.dash + TRAIL.gap;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], fade = 1 - (now - a.at) / TRAIL.life;
      if (fade <= 0) continue;
      const len = b.walked - a.walked;
      if (len <= 0) continue;
      ctx.globalAlpha = alpha * fade;
      ctx.beginPath();
      for (let start = Math.floor(a.walked / period) * period; start < b.walked; start += period) {
        const from = Math.max(a.walked, start), to = Math.min(b.walked, start + TRAIL.dash);
        if (to <= from) continue;
        const t0 = (from - a.walked) / len, t1 = (to - a.walked) / len;
        ctx.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0);
        ctx.lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export function createRenderer(container, state) {
  const affordances = createAffordances();
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.style.cursor = 'none';
  canvas.setAttribute('aria-label', 'DEAD AIR game. Use WASD to move and the mouse to aim and fire.');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d', {alpha: false});
  const cam = createCamera();
  const fx = new Fx();
  const world = new WorldLayer();
  const lighting = new Lighting();
  const trail = new Trail();
  const vis = {slow: 0, hurt: 0, dpr: 1, time: 0, flicker: 0, mouseX: 0, mouseY: 0, mouseActive: false, wasMoving: false, deadT: 0, px: null, py: null, kick: 0, attract: null, camShake: {x: 0, y: 0}};
  const stats = {frameMs: 0, drawMs: 0, frames: 0, bakeMs: 0};
  let levelReady = false;
  let vignette = null, vignetteKey = '';

  fx.isSolid = (x, y) => {
    const L = world.level;
    if (!L) return false;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return tx < 0 || ty < 0 || tx >= L.w || ty >= L.h || L.tileMap[ty][tx] !== 0;
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    vis.dpr = dpr;
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    resizeCamera(cam, w, h);
    setSpriteScale(cam.scale * dpr);
    world.setScale(cam.scale * dpr);
    vignetteKey = '';
  }

  function setLevel() {
    world.setLevel({tileMap: state.tileMap, rooms: state.rooms, doors: state.doors, seed: state.seed});
    lighting.setLevel({tileMap: state.tileMap, rooms: state.rooms});
    lighting.settle(state);
    fx.clear();
    trail.pts.length = 0;
    cam.snap = true;
    levelReady = true;
    vis.px = null;
    const p = state.player;
    if (p) {
      cam.x = p.x; cam.y = p.y;
      // bake what the player can see now so the first frame is complete
      world.chunkAt(Math.floor(p.x / (TILE * 12)), Math.floor(p.y / (TILE * 12)));
    }
  }

  function screenToWorld(sx, sy) { return camScreenToWorld(cam, sx, sy); }

  // ------------------------------------------------------------------ events from the game
  function shot(owner, shooter, angle) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    fx.muzzle(shooter.x + dx * 18, shooter.y + dy * 18, angle, {color: '#ff7a6a', size: 0.75});
    shooter.vis ??= {}; shooter.vis.kick = 1;
  }

  // Drain the simulation's event queue (muzzle flashes, impacts, hurt feedback).
  function consume(events) {
    for (const ev of events) {
      if (ev.type === 'shot') {
        const gun = GUNS.find((g) => g.id === ev.gun) || GUNS[0], a = Math.atan2(ev.dy, ev.dx);
        fx.muzzle(ev.x, ev.y, a, {color: hexStr(gun.color), size: gun.category === 'SHOTGUN' || gun.category === 'ANTI-MATERIEL' ? 1.5 : gun.category === 'PISTOL' ? 0.8 : 1});
        const p = state.player;
        if (p) fx.casing(p.x + ev.dx * 8, p.y + ev.dy * 8, a);
        vis.kick = Math.max(vis.kick, Math.min(1.3, 0.5 + (ev.kick || 0.5)));
      } else if (ev.type === 'impact' && (ev.surface === 'wall' || ev.surface === 'cover')) {
        fx.wallImpact(ev.x, ev.y, ev.vx ?? 1, ev.vy ?? 0, ev.owner);
      } else if (ev.type === 'playerHurt') {
        fx.playerHit(ev.x, ev.y, ev.armorOnly);
        vis.flashHit = 1;
      }
    }
  }

  // ------------------------------------------------------------------ per-simulation-step update
  function update(step) {
    vis.time += step;
    fx.update(step);
    for (const e of state.enemies) {
      const v = e.vis ??= {};
      v.ang ??= 0; v.prevX ??= e.x; v.prevY ??= e.y; v.dustT ??= 0;
      const mvx = (e.x - v.prevX) / Math.max(step, 1e-4), mvy = (e.y - v.prevY) / Math.max(step, 1e-4);
      v.prevX = e.x; v.prevY = e.y;
      v.speed = Math.min(160, Math.hypot(mvx, mvy));
      v.kick = Math.max(0, (v.kick || 0) - step * 9);
      if (e.alive) {
        const p = state.player;
        v.aimMax = e.aimTimer > 0 ? Math.max(v.aimMax || 0, e.aimTimer) : 0;
        if (e.aware && !v.wasAware) v.alertT = 0.9;
        v.wasAware = !!e.aware; v.alertT = Math.max(0, (v.alertT || 0) - step);
        const target = (e.meleeWindup > 0 || e.aimTimer > 0) ? Math.atan2(e.aim.y, e.aim.x) : e.face ? Math.atan2(e.face.y, e.face.x) : p ? Math.atan2(p.y - e.y, p.x - e.x) : v.ang;
        if (v.first === undefined) { v.ang = target; v.first = true; }
        v.ang += angDiff(v.ang, target) * (1 - Math.exp(-16 * step));
        v.dustT -= step;
        if (v.speed > 22 && v.dustT <= 0) { v.dustT = 0.16; fx.dust(e.x - Math.cos(v.ang) * e.radius * 0.5, e.y - Math.sin(v.ang) * e.radius * 0.5, mvx, mvy); }
      } else if (v.deathT !== undefined) v.deathT += step;
    }
    const p = state.player;
    if (p) {
      if (vis.px !== null) {
        const mvx = (p.x - vis.px) / Math.max(step, 1e-4), mvy = (p.y - vis.py) / Math.max(step, 1e-4), sp = Math.hypot(mvx, mvy);
        vis.pSpeed = sp;
        vis.dustT = (vis.dustT || 0) - step;
        if (sp > 30 && vis.dustT <= 0) { vis.dustT = sp > 100 ? 0.07 : 0.12; fx.dust(p.x - state.aim.x * 3, p.y - state.aim.y * 3, mvx, mvy); }
      }
      vis.px = p.x; vis.py = p.y;
      vis.kick = Math.max(0, vis.kick - step * 10);
    }
    for (const effect of state.effects) {
      if (effect.id === 'incendiary' && effect.remaining > 0) {
        const n = step * 90; let count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        while (count-- > 0) fx.flames(effect.x, effect.y, effect.item.radius);
      }
    }
    for (const g of state.thrown) {
      g.vis ??= {t: 0}; g.vis.t -= step;
      if (g.vis.t <= 0 && g.id !== 'flash') { g.vis.t = 0.045; fx.smoke(g.x, g.y, 3.2, 1, '#aaa4ac', 5, [0.35, 0.6], 0.3); }
    }
  }

  // ------------------------------------------------------------------ helpers for drawing
  function rayWall(x, y, dx, dy, max) {
    const L = world.level;
    if (!L) return max;
    for (let d = 6; d < max; d += 6) {
      const tx = Math.floor((x + dx * d) / TILE), ty = Math.floor((y + dy * d) / TILE);
      if (L.tileMap[ty]?.[tx] !== 0) return d;
    }
    return max;
  }

  function drawShadows(b) {
    for (const crate of state.crates) { if (inView(crate, b, 30)) drawBoxShadow(ctx, crate.x - 12.5, crate.y - 12.5, 25, 25, 13); }
    for (const c of state.cover) if (c.kind === 'pillar' && inView(c, b, 30)) drawBlobShadow(ctx, c.x, c.y, 11, 6, 0.9);
    for (const pk of state.pickups) if (pk.available && pk.kind !== 'exit' && inView(pk, b, 20)) { const bob = Math.sin(vis.time * 3 + hashPos(pk.x, pk.y) * 9); drawBlobShadow(ctx, pk.x, pk.y, 6.5 - bob * 0.6, 3, 0.7); }
    for (const e of state.enemies) { if (!inView(e, b, 40)) continue; const dying = !e.alive; const look = ACTOR_LOOK[e.elite ? 'elite' : e.type]; if (!dying || (e.vis?.deathT ?? 9) < 0.5) drawBlobShadow(ctx, e.x, e.y, look.r * 0.95, 1.5, dying ? 0.6 : 1); }
    const p = state.player;
    if (p) drawBlobShadow(ctx, p.x, p.y, 10, 1.5);
    if (state.workbench) drawBoxShadow(ctx, state.workbench.x - 22, state.workbench.y - 14, 44, 28, 10);
    for (const room of state.rooms) if (room.role === 'merchant') { const x = (room.cx + 0.5) * TILE, y = (room.cy + 0.5) * TILE; if (inView({x, y}, b, 70)) { drawBlobShadow(ctx, x, y - 4, 12, 4); drawBoxShadow(ctx, x - 30, y + 14, 60, 18, 10); } }
    for (const t of state.thrown) drawBlobShadow(ctx, t.x, t.y, 4, 5, 0.8);
  }

  const inView = (o, b, pad = 0) => o.x > b.x0 - pad && o.x < b.x1 + pad && o.y > b.y0 - pad && o.y < b.y1 + pad;

  function drawCrates(b) {
    for (const crate of state.crates) {
      if (!inView(crate, b, 30)) continue;
      const stage = crate.damageStage || 0, variant = Math.floor(hashPos(crate.x, crate.y) * 3), img = crateSprite(stage, variant), half = img.width / (2 * Math.max(1, Math.round(1)));
      void half;
      const side = 25 + 6.4, h = side / 2;
      ctx.drawImage(img, crate.x - h, crate.y - h, side, side);
      if (crate.chips) {
        for (const c of crate.chips) {
          ctx.save(); ctx.translate(crate.x + c.x, crate.y + c.y); ctx.rotate(c.a);
          ctx.fillStyle = 'rgba(28,16,10,0.85)'; ctx.fillRect(-c.r, -c.r * 0.7, c.r * 2, c.r * 1.4);
          ctx.fillStyle = 'rgba(214,190,160,0.7)'; ctx.fillRect(-c.r, -c.r * 0.7, c.r * 2, 0.6);
          ctx.restore();
        }
      }
      if (crate.flash > 0) { ctx.globalAlpha = crate.flash * 0.55; ctx.fillStyle = '#fff4e0'; ctx.fillRect(crate.x - 12.5, crate.y - 12.5, 25, 25); ctx.globalAlpha = 1; }
      if (crate.healthBarTimer > 0) bar(crate.x, crate.y - 21, 24, 3.4, crate.hp / crate.maxHp, stage === 2 ? '#ff5266' : stage === 1 ? '#f2a45f' : '#83ddae');
    }
  }

  function bar(x, y, w, h, frac, color) {
    ctx.fillStyle = 'rgba(14,10,20,0.9)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(70,60,80,0.8)'; ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 0.8);
  }

  function drawPillars(b) {
    for (const c of state.cover) {
      if (c.kind !== 'pillar' || !inView(c, b, 30)) continue;
      const img = pillarSprite(0), side = (9.2 + 3) * 2;
      ctx.drawImage(img, c.x - side / 2, c.y - side / 2, side, side);
    }
  }

  function drawProps(b) {
    const t = vis.time;
    // workbench
    const wb = state.workbench;
    if (wb && inView(wb, b, 60)) {
      const x = wb.x, y = wb.y, pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = rgba('#ff4d6d', 0.25 + pulse * 0.2); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke();
      ctx.setLineDash([4, 6]); ctx.strokeStyle = rgba('#ff4d6d', 0.3); ctx.lineWidth = 1; ctx.lineDashOffset = -t * 6; ctx.beginPath(); ctx.arc(0, 0, 36, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#17141d'; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.fillRect(-20, -11, 44, 28); // lip
      const grad = ctx.createLinearGradient(-22, -14, 22, 14); grad.addColorStop(0, '#6a6275'); grad.addColorStop(1, '#3e3848');
      ctx.fillStyle = grad; ctx.fillRect(-22, -14, 44, 28); ctx.lineWidth = 1.4; ctx.strokeRect(-22, -14, 44, 28);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-21, 13); ctx.lineTo(-21, -13); ctx.lineTo(21, -13); ctx.stroke();
      ctx.fillStyle = '#2a2531'; ctx.fillRect(-18, -10, 36, 20); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.7; ctx.strokeRect(-18, -10, 36, 20);
      // tools laid out on the bench
      ctx.fillStyle = '#b9b3c4'; ctx.fillRect(-14, 3, 14, 2.4); ctx.fillRect(-14, 5.6, 9, 1.8);
      ctx.fillStyle = '#d65a3e'; ctx.fillRect(-1, 3, 5, 2.4);
      ctx.fillStyle = '#c9a24e'; ctx.fillRect(7, -6, 8, 3); ctx.fillStyle = '#4a4455'; ctx.fillRect(7, 0, 8, 5); ctx.strokeStyle = INK; ctx.strokeRect(7, 0, 8, 5);
      // screen
      ctx.fillStyle = INK; ctx.fillRect(-12, -13, 22, 6);
      ctx.fillStyle = rgba('#ff5a78', 0.7 + pulse * 0.3); ctx.fillRect(-11, -12.2, 20, 4.4);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-9, -11.4, 9, 1);
      // vise
      ctx.fillStyle = '#7a7585'; ctx.fillRect(15, -11, 6, 7); ctx.strokeStyle = INK; ctx.strokeRect(15, -11, 6, 7);
      ctx.restore();
      // holo gun hovering over the bench
      ctx.save(); ctx.translate(x, y - 25 + Math.sin(t * 2) * 1.5); ctx.rotate(-0.15);
      ctx.globalAlpha = 0.7 + pulse * 0.2; ctx.scale(0.7, 0.7);
      drawGun(ctx, GUNS[state.weaponIndex], {reach: -12});
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // merchant stalls
    for (const room of state.rooms) {
      if (room.role !== 'merchant') continue;
      const x = (room.cx + 0.5) * TILE, y = (room.cy + 0.5) * TILE;
      if (!inView({x, y}, b, 80)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2);
      ctx.save(); ctx.translate(x, y);
      ctx.setLineDash([5, 7]); ctx.lineDashOffset = t * 7; ctx.strokeStyle = rgba('#ffc46b', 0.3 + pulse * 0.2); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      // counter in front of the vendor
      ctx.fillStyle = '#1d140f'; ctx.fillRect(-29, 16, 62, 18);
      const wood = ctx.createLinearGradient(0, 14, 0, 32); wood.addColorStop(0, '#9a6b46'); wood.addColorStop(1, '#6c4a33');
      ctx.fillStyle = wood; ctx.fillRect(-30, 14, 60, 18); ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.strokeRect(-30, 14, 60, 18);
      ctx.strokeStyle = 'rgba(255,230,190,0.4)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-29, 15); ctx.lineTo(29, 15); ctx.stroke();
      ctx.fillStyle = '#e8bb62'; for (const gx of [-22, -8, 6, 20]) { ctx.fillRect(gx, 17.5, 6, 6); } ctx.fillStyle = '#6fd6b2'; ctx.fillRect(-20, 25, 4, 4); ctx.fillStyle = '#d85a6a'; ctx.fillRect(8, 25, 4, 4); ctx.fillStyle = '#74c9ed'; ctx.fillRect(21, 25, 4, 4);
      // vendor: cloak, hood, lantern
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, -1, 12.5, 11.5, 0, 0, TAU); ctx.fill();
      const cloak = ctx.createLinearGradient(-10, -10, 10, 10); cloak.addColorStop(0, '#b7794f'); cloak.addColorStop(1, '#6d4430');
      ctx.fillStyle = cloak; ctx.beginPath(); ctx.ellipse(0, -1, 11, 10, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,190,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -1, 9, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
      ctx.fillStyle = '#3b2a22'; ctx.beginPath(); ctx.arc(0, 2, 6.2, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(-2, 5.3, 0.9, 0, TAU); ctx.arc(2, 5.3, 0.9, 0, TAU); ctx.fill();
      // sign
      ctx.fillStyle = '#17110e'; ctx.fillRect(-28, -38, 56, 13); ctx.strokeStyle = rgba('#ffc46b', 0.9); ctx.lineWidth = 1.1; ctx.strokeRect(-28, -38, 56, 13);
      ctx.fillStyle = rgba('#ffd27a', 0.85 + pulse * 0.15); ctx.font = `700 9px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MARKET', 0, -31.5);
      ctx.restore();
    }
  }

  function drawGates(b) {
    for (const gate of state.lockedDoors) {
      const open = gate.opened ? Math.min(1, (gate.openAnim = (gate.openAnim ?? 0) + (1 / 60) / 0.7)) : 0;
      if (open >= 1) continue;
      const cx = (gate.cells.reduce((s, c) => s + c.x, 0) / gate.cells.length + 0.5) * TILE, cy = (gate.cells.reduce((s, c) => s + c.y, 0) / gate.cells.length + 0.5) * TILE;
      if (!inView({x: cx, y: cy}, b, 60)) continue;
      const span = gate.cells.length * TILE, vertical = gate.axis === 'y', pulse = 0.5 + 0.5 * Math.sin(vis.time * 3);
      const afford = (state.scrap || 0) >= gate.cost, col = gate.opened ? '#6dffb0' : afford ? '#ffb04a' : '#ff6a78';
      ctx.save(); ctx.translate(cx, cy); if (vertical) ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = 1 - open * open;
      const half = span / 2, slide = open * half * 0.95;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(side * slide, 0);
        const x0 = side < 0 ? -half : 0, w = half;
        ctx.fillStyle = 'rgba(8,6,12,0.7)'; ctx.fillRect(x0 - 1, -8, w + 2, 17);
        ctx.fillStyle = '#2b2430'; ctx.fillRect(x0, -6, w, 12);
        // hazard stripes
        ctx.save(); ctx.beginPath(); ctx.rect(x0, -6, w, 12); ctx.clip();
        ctx.fillStyle = gate.opened ? '#4aa878' : '#e9b23c'; for (let x = x0 - 14; x < x0 + w + 14; x += 12) { ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x + 6, 6); ctx.lineTo(x + 12, -6); ctx.lineTo(x + 6, -6); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.strokeRect(x0, -6, w, 12);
        ctx.restore();
      }
      if (!gate.opened) {
        // lock plate with padlock
        ctx.fillStyle = INK; rrectPath(ctx, -12, -11, 24, 22, 4); ctx.fill();
        ctx.fillStyle = rgba(col, 0.9 + pulse * 0.1); rrectPath(ctx, -10.5, -9.5, 21, 19, 3); ctx.fill();
        ctx.rotate(vertical ? -Math.PI / 2 : 0);
        drawIcon(ctx, 'lock-locked', 0, 0, 15, INK);
      }
      ctx.restore();
      if (gate.opened) continue;
      // cost painted on the gate
      ctx.save(); ctx.translate(cx, cy + (vertical ? -span / 2 - 12 : -19));
      const label = `${gate.cost}`, w = 36;
      ctx.fillStyle = 'rgba(14,10,20,0.85)'; rrectPath(ctx, -w / 2, -7, w, 14, 5); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      ctx.save(); ctx.translate(-w / 2 + 8, 0); ctx.scale(4.2, 4.2); ctx.fillStyle = col; hexPath(ctx, 1); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 0.35, 0, TAU); ctx.fill(); ctx.restore();
      ctx.font = `800 10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(label, -w / 2 + 14, 0.5);
      ctx.restore();
    }
  }

  function drawPickups(b) {
    const t = vis.time;
    for (const pk of state.pickups) {
      if (!pk.available || !inView(pk, b, 40)) continue;
      const ph = hashPos(pk.x, pk.y) * 9, bob = Math.sin(t * 3 + ph) * 1.6, color = pk.color || '#f4c66d';
      if (pk.kind === 'exit') { drawExit(pk); continue; }
      ctx.save(); ctx.translate(pk.x, pk.y - 2 + bob);
      const spin = Math.sin(t * 1.4 + ph) * 0.25;
      if (pk.kind === 'scrap') {
        ctx.rotate(spin + t * 0.6);
        ctx.fillStyle = INK; hexPath(ctx, 7.4); ctx.fill();
        const g = ctx.createLinearGradient(-6, -6, 6, 6); g.addColorStop(0, tint(color, 0.45)); g.addColorStop(1, shade(color, 0.7));
        ctx.fillStyle = g; hexPath(ctx, 6); ctx.fill();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(0, 0, 5, Math.PI * 1.1, Math.PI * 1.55); ctx.stroke();
      } else if (pk.kind === 'gun') {
        ctx.strokeStyle = rgba(color, 0.55); ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.lineDashOffset = -t * 8; ctx.beginPath(); ctx.arc(0, 2, 15, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.rotate(-0.3 + spin);
        const gun = GUNS[pk.gunIndex]; const s = 0.82; ctx.scale(s, s);
        ctx.translate(-gun.visual.length * 0.41 - 2, 0); drawGun(ctx, gun, {reach: 0});
      } else if (pk.kind === 'mod') {
        ctx.rotate(Math.PI / 4 + spin);
        ctx.fillStyle = INK; ctx.fillRect(-7.4, -7.4, 14.8, 14.8);
        const g = ctx.createLinearGradient(-6, -6, 6, 6); g.addColorStop(0, tint(color, 0.5)); g.addColorStop(1, shade(color, 0.65));
        ctx.fillStyle = g; ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(-3, -3, 6, 6); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-4.5, -4.5, 3, 1);
      } else if (pk.kind === 'heal') {
        ctx.fillStyle = INK; rrectPath(ctx, -8.6, -8.6, 17.2, 17.2, 3.5); ctx.fill();
        const g = ctx.createLinearGradient(-7, -7, 7, 7); g.addColorStop(0, '#f4fff9'); g.addColorStop(1, '#bde8d2');
        ctx.fillStyle = g; rrectPath(ctx, -7.4, -7.4, 14.8, 14.8, 3); ctx.fill();
        ctx.fillStyle = '#25b673'; ctx.fillRect(-1.8, -5.5, 3.6, 11); ctx.fillRect(-5.5, -1.8, 11, 3.6);
      } else if (pk.kind === 'cache') {
        ctx.fillStyle = INK; ctx.fillRect(-9.6, -7.6, 19.2, 15.2);
        const g = ctx.createLinearGradient(0, -7, 0, 7); g.addColorStop(0, '#d9a04a'); g.addColorStop(1, '#7c5528');
        ctx.fillStyle = g; ctx.fillRect(-8.4, -6.4, 16.8, 12.8);
        ctx.strokeStyle = '#4a3218'; ctx.lineWidth = 1.2; ctx.strokeRect(-6.4, -4.4, 12.8, 8.8);
        ctx.fillStyle = INK; ctx.fillRect(-2.2, -2, 4.4, 4.4); ctx.fillStyle = '#ffe28a'; ctx.fillRect(-1.2, -1, 2.4, 2.4);
      }
      ctx.restore();
    }
  }

  function drawPickupGlows(b) {
    ctx.globalCompositeOperation = 'lighter';
    for (const pk of state.pickups) {
      if (!pk.available || !inView(pk, b, 40)) continue;
      const pulse = 0.55 + 0.45 * Math.sin(vis.time * 3 + hashPos(pk.x, pk.y) * 9), r = pk.kind === 'exit' ? 40 : pk.kind === 'gun' ? 28 : 19;
      ctx.globalAlpha = (pk.kind === 'exit' ? 0.55 : 0.5) * pulse;
      ctx.drawImage(glowSprite(pk.kind === 'exit' ? (vis.exitReady ? '#6dffb0' : '#ff5969') : pk.color || '#f4c66d'), pk.x - r, pk.y - r - 2, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function drawExit(pk) {
    const t = vis.time, ready = vis.exitReady, col = ready ? '#6dffb0' : '#ff5969';
    ctx.save(); ctx.translate(pk.x, pk.y);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(1.5, 2, 24, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(0, 0, 3, 0, 0, 23); g.addColorStop(0, '#2b2733'); g.addColorStop(1, '#3d3847');
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 23, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.rotate(t * 0.25); ctx.strokeStyle = 'rgba(255,205,60,0.7)'; ctx.lineWidth = 3.4; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(0, 0, 19.5, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + t * (ready ? 1.2 : 0.5), pulse = (Math.sin(t * 3 + i) + 1) * 0.5;
      ctx.save(); ctx.rotate(a); ctx.translate(8 + (ready ? pulse * 2 : 0), 0); ctx.fillStyle = col; ctx.globalAlpha = 0.6 + pulse * 0.4;
      ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(-2, -3.2); ctx.lineTo(-2, 3.2); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(14,10,20,0.9)'; ctx.fillStyle = col;
    ctx.restore(); ctx.save(); ctx.translate(pk.x, pk.y);
    // vertical beacon pillar so the exit is visible from across the room
    const bw = 10 + Math.sin(t * 3) * 2, bg = ctx.createLinearGradient(0, -120, 0, -20); bg.addColorStop(0, rgba(col, 0)); bg.addColorStop(1, rgba(col, ready ? 0.45 : 0.25));
    ctx.fillStyle = bg; ctx.fillRect(-bw, -120, bw * 2, 100);
    ctx.strokeStyle = 'rgba(14,10,20,0.9)'; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 13px ${FONT}`; ctx.lineWidth = 3.4; const label = ready ? 'EXTRACT' : 'EXIT · LOCKED';
    drawIcon(ctx, ready ? 'exit-extraction' : 'lock-locked', -ctx.measureText(label).width / 2 - 8, -36, 13, col);
    ctx.strokeText(label, 4, -36); ctx.fillText(label, 4, -36);
    ctx.restore();
  }

  // ------------------------------------------------------------------ actors
  function drawEnemy(e, now) {
    const v = e.vis ??= {}, kind = e.elite ? 'elite' : e.type, spr = actorSprite(kind), look = ACTOR_LOOK[kind];
    const dead = !e.alive;
    const scale = e.elite ? 0.9 : 1;
    let ang = v.ang || 0;
    ctx.save(); ctx.translate(e.x, e.y);
    if (dead) {
      const t = clamp((v.deathT ?? 1) / 0.45, 0, 1);
      ang = ang + (v.spin || 0) * (1 - Math.pow(1 - t, 3)) * 0.3;
      const k = 0.94 - 0.06 * t;
      ctx.rotate(ang); ctx.scale(k * scale, (1 - 0.12 * t) * k * scale);
      if (t < 1) {
        ctx.drawImage(spr.base, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
        ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
        ctx.globalAlpha = t; const c = corpseSprite(kind); ctx.drawImage(c.img, -c.half, -c.half, c.half * 2, c.half * 2); ctx.globalAlpha = 1;
        if (v.flash > 0) { ctx.globalAlpha = v.flash; ctx.drawImage(spr.whiteBase, -spr.half, -spr.half, spr.half * 2, spr.half * 2); ctx.drawImage(spr.whiteDetail, -spr.half, -spr.half, spr.half * 2, spr.half * 2); ctx.globalAlpha = 1; }
      } else { const c = corpseSprite(kind); ctx.drawImage(c.img, -c.half, -c.half, c.half * 2, c.half * 2); }
      ctx.restore();
      return;
    }
    // body kept unrotated (lit from the top-left), details rotate with facing
    const moving = clamp((v.speed || 0) / 70, 0, 1), windup = e.meleeWindup > 0, kick = v.kick || 0;
    const squash = 1 + (windup ? 0.1 : 0) + kick * 0.05;
    const knockX = Math.cos(v.hitAngle || 0) * (v.flash || 0) * 1.4, knockY = Math.sin(v.hitAngle || 0) * (v.flash || 0) * 1.4;
    ctx.translate(knockX, knockY);
    ctx.scale(scale * squash, scale * squash);
    ctx.drawImage(spr.base, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    ctx.save(); ctx.rotate(ang);
    // weapons / fists under the detail layer so hands read as held
    if (e.type === 'chaser' && !e.elite) {
      ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    } else {
      const gun = ENEMY_GUNS[e.type];
      if (gun && !e.elite) {
        const reloading = e.reloadTimer > 0, aiming = e.aimTimer > 0;
        ctx.save(); ctx.translate(look.r * 0.2, e.type === 'guard' ? 3.5 : 0); ctx.rotate(reloading ? 1.15 : 0); ctx.translate(-(kick * 3), 0);
        const m = drawGun(ctx, gun, {reach: 3, enemy: true});
        drawHand(ctx, m.rear, 0, shade(look.color, 0.7), 2.3); drawHand(ctx, m.front, 0.6, shade(look.color, 0.7), 2.3);
        ctx.restore();
        ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
        if (aiming) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#ff4a5e'; ctx.beginPath(); ctx.arc(3 + gun.visual.length * 0.82 + 2, e.type === 'guard' ? 3.5 : 0, 1.8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      } else {
        // brute / warden: heavy fists, raised during the wind-up
        const total = 0.48, p = windup ? 1 - e.meleeWindup / total : 0, swing = windup ? Math.sin(p * Math.PI * 0.5) : (Math.sin(vis.time * 5 + (e.id || 0) * 40) * 0.4 * moving);
        const fr = e.elite ? 6.6 : 5, reach = windup ? 15 + p * 11 : 12 + swing * 2;
        const yy = windup ? 5 - p * 3 : 9.5;
        const fist = windup && p > 0.4 ? mix(shade(look.color, 0.8), '#ff7a3a', p) : shade(look.color, 0.75);
        ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
        const fs = e.elite ? 1.35 : 1;
        drawHand(ctx, reach * fs, -yy * fs + (windup ? -2 : 0), fist, fr); drawHand(ctx, reach * fs, yy * fs + (windup ? 2 : 0), fist, fr);
      }
    }
    ctx.restore();
    if (v.flash > 0) {
      ctx.globalAlpha = Math.min(1, v.flash * 1.2);
      ctx.drawImage(spr.whiteBase, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
      ctx.save(); ctx.rotate(ang); ctx.drawImage(spr.whiteDetail, -spr.half, -spr.half, spr.half * 2, spr.half * 2); ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (windup) {
      const p = 1 - e.meleeWindup / 0.48;
      ctx.globalAlpha = p * 0.5; ctx.fillStyle = '#ff7a3a'; ctx.beginPath(); ctx.arc(0, 0, look.r + 2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (e.stun > 0) {
      ctx.save(); ctx.translate(e.x, e.y - look.r - 5);
      ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 1.3;
      for (let i = 0; i < 3; i++) { const a = vis.time * 6 + i * TAU / 3; const sx = Math.cos(a) * 7, sy = Math.sin(a) * 2.5; ctx.beginPath(); ctx.moveTo(sx - 2.2, sy); ctx.lineTo(sx + 2.2, sy); ctx.moveTo(sx, sy - 2.2); ctx.lineTo(sx, sy + 2.2); ctx.stroke(); }
      ctx.restore();
    }
    if (e.reloadTimer > 0) { ctx.fillStyle = '#ffd27a'; for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.4 + 0.6 * (Math.sin(vis.time * 8 + i) * 0.5 + 0.5); ctx.beginPath(); ctx.arc(e.x - 5 + i * 5, e.y - look.r - 5, 1.2, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
    if (e.elite || (v.barT || 0) > 0 && e.hp < e.maxHp) bar(e.x, e.y - look.r * scale - 8, e.elite ? 34 : 18, e.elite ? 3.6 : 2.4, e.hp / e.maxHp, e.elite ? '#ff9566' : '#e96a78');
    if (v.alertT > 0 && !(e.aimTimer > 0 || windup)) {
      ctx.save(); ctx.translate(e.x, e.y - look.r - 10 - (1 - v.alertT / 0.9) * 4); ctx.globalAlpha = Math.min(1, v.alertT * 3);
      ctx.font = `900 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(14,10,20,0.95)'; ctx.fillStyle = '#ffd86e'; ctx.strokeText('!', 0, 0); ctx.fillText('!', 0, 0); ctx.restore();
    } else if (e.intent === 'search' && !(e.aimTimer > 0 || windup)) {
      ctx.save(); ctx.translate(e.x, e.y - look.r - 9); ctx.globalAlpha = 0.85; ctx.font = `900 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(14,10,20,0.95)'; ctx.fillStyle = '#9fd0ff'; ctx.strokeText('?', 0, 0); ctx.fillText('?', 0, 0); ctx.restore();
    }
    if (e.aimTimer > 0 || windup) {
      // alert tick above the head
      const p = windup ? 1 - e.meleeWindup / 0.48 : 1 - e.aimTimer / (e.vis?.aimMax || 0.5);
      ctx.save(); ctx.translate(e.x, e.y - look.r - (e.elite ? 12 : 8) - Math.sin(p * 9) * 0.8);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 11, 6.5, 0, TAU); ctx.stroke(); ctx.strokeStyle = windup ? '#ffad57' : '#ff3a50'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, 11, 6.5, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.stroke();
      ctx.fillStyle = windup ? '#ffad57' : '#ff4a5e'; ctx.strokeStyle = 'rgba(14,10,20,0.95)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-3.8, -2.6); ctx.lineTo(3.8, -2.6); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
    }
    void now;
  }

  function drawTelegraphs(b) {
    for (const e of state.enemies) {
      if (!e.alive || !inView(e, b, 320)) continue;
      if (e.meleeWindup > 0) {
        const p = clamp(1 - e.meleeWindup / 0.48, 0, 1), a = Math.atan2(e.aim.y, e.aim.x), R = 36, half = Math.PI / 4;
        ctx.save(); ctx.translate(e.x, e.y);
        ctx.fillStyle = `rgba(255,120,50,${0.1 + 0.1 * p})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a - half, a + half); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,150,60,${0.28 + 0.45 * p})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * (0.2 + 0.8 * p), a - half, a + half); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(255,214,150,${0.6 + 0.4 * p})`; ctx.lineWidth = 1.6 + p * 1.6; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(Math.cos(a - half) * 12, Math.sin(a - half) * 12); ctx.lineTo(Math.cos(a - half) * R, Math.sin(a - half) * R); ctx.arc(0, 0, R, a - half, a + half); ctx.lineTo(Math.cos(a + half) * 12, Math.sin(a + half) * 12); ctx.stroke();
        ctx.restore();
      } else if (e.aimTimer > 0) {
        const p = clamp(1 - e.aimTimer / (e.vis?.aimMax || 0.5), 0, 1), range = e.type === 'brute' ? 130 : Math.min(e.def.range, 280), dx = e.aim.x, dy = e.aim.y;
        const gun = ENEMY_GUNS[e.type], m = gun ? 3 + gun.visual.length * 0.82 + 2 : 14;
        const sx = e.x + dx * m, sy = e.y + dy * m + (e.type === 'guard' ? Math.cos(Math.atan2(dy, dx)) * 3.5 : 0);
        const len = rayWall(e.x, e.y, dx, dy, range);
        const ex = e.x + dx * len, ey = e.y + dy * len;
        const hot = mix('#ff8a5a', '#ff2a48', p);
        ctx.lineCap = 'round';
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba('#ff3050', 0.14 + 0.18 * p); ctx.lineWidth = 7 + p * 3; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(14,6,12,0.55)'; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = hot; ctx.lineWidth = 1.5 + p * 1.1; ctx.setLineDash([9, 5 - p * 3]); ctx.lineDashOffset = -vis.time * 60;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
        // convergence marker at the line's end
        ctx.strokeStyle = rgba('#ff4a5e', 0.55 + p * 0.45); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ex, ey, 3.5 + (1 - p) * 7, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 + p * 0.5; ctx.drawImage(glowSprite('#ff5a6a'), sx - 8 - p * 4, sy - 8 - p * 4, 16 + p * 8, 16 + p * 8); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  function drawPlayer(now) {
    const p = state.player; if (!p) return;
    const gun = GUNS[state.weaponIndex], ang = Math.atan2(state.aim.y, state.aim.x), spr = actorSprite('player');
    const reloading = state.reloadTimer > 0, blink = state.invuln > 0 && Math.floor(vis.time * 22) % 2 === 0;
    trail.draw(ctx, now, '#e9f5ee', 1.5, 0.45);
    if (blink) ctx.globalAlpha = 0.45;
    ctx.save(); ctx.translate(p.x, p.y);
    const kick = vis.kick;
    ctx.save(); ctx.translate(-Math.cos(ang) * kick * 0.8, -Math.sin(ang) * kick * 0.8);
    ctx.drawImage(spr.base, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    ctx.save(); ctx.rotate(ang);
    const frac = vis.reloadFrac || 0;
    const tilt = reloading ? Math.sin(Math.min(1, frac * 1.0) * Math.PI) * 1.05 : 0;
    ctx.save(); ctx.translate(2, 0); ctx.rotate(tilt * (Math.abs(ang) > Math.PI / 2 ? -1 : 1)); ctx.translate(-kick * 3.2, 0);
    const m = drawGun(ctx, gun, {reach: 4});
    ctx.restore();
    ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    const hand = shade('#62e1ad', 0.62), handLift = reloading ? Math.sin(frac * Math.PI * 3) * 1.2 : 0;
    ctx.save(); ctx.translate(2, 0); ctx.rotate(tilt * (Math.abs(ang) > Math.PI / 2 ? -1 : 1)); ctx.translate(-kick * 3.2, 0);
    drawHand(ctx, m.rear, 0, hand, 2.8); drawHand(ctx, m.front, 1.2 + handLift, hand, 2.8);
    ctx.restore();
    ctx.restore();
    ctx.restore();
    if (state.armor > 0) {
      ctx.strokeStyle = '#7fdcf0'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const n = state.armor, gap = 0.5; for (let i = 0; i < n; i++) { const a0 = -Math.PI / 2 + i * (TAU / n) + gap / 2, a1 = -Math.PI / 2 + (i + 1) * (TAU / n) - gap / 2; ctx.beginPath(); ctx.arc(0, 0, 13.4, a0, a1); ctx.stroke(); }
    }
    if (vis.flashHit > 0) { ctx.globalAlpha = vis.flashHit; ctx.drawImage(spr.whiteBase, -spr.half, -spr.half, spr.half * 2, spr.half * 2); ctx.globalAlpha = 1; }
    if (reloading) {
      ctx.strokeStyle = 'rgba(14,10,20,0.7)'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(0, 0, 16.5, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, 0, 16.5, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
    // faint aim guide
    const dx = state.aim.x, dy = state.aim.y, mz = gunMuzzle(gun);
    const maxLen = Math.min(150, rayWall(p.x, p.y, dx, dy, 150));
    ctx.save(); ctx.strokeStyle = 'rgba(255,240,220,0.16)'; ctx.lineWidth = 0.9; ctx.setLineDash([2, 6]);
    ctx.beginPath(); ctx.moveTo(p.x + dx * (mz + 6), p.y + dy * (mz + 6)); ctx.lineTo(p.x + dx * maxLen, p.y + dy * maxLen); ctx.stroke(); ctx.restore();
  }

  function drawThrown() {
    for (const t of state.thrown) {
      const color = {smoke: '#aaa8b3', flash: '#ffe59b', frag: '#6a7a58', incendiary: '#ff673d'}[t.id], urgent = t.fuse < 0.3;
      const blink = Math.floor(vis.time * (urgent ? 30 : 12)) % 2 === 0;
      const lift = 2 + Math.sin(vis.time * 14) * 1.2;
      ctx.save(); ctx.translate(t.x, t.y - lift); ctx.rotate(vis.time * 9);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 3.8, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(-1.2, -1.2, 1.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2530'; ctx.fillRect(-1, -4.6, 2, 2.2);
      ctx.fillStyle = blink ? '#ff4a3a' : '#5a1a18'; ctx.beginPath(); ctx.arc(2, 0.4, 1, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = blink ? 0.6 : 0.2; ctx.drawImage(glowSprite('#ff6a4a'), t.x - 8, t.y - lift - 8, 16, 16); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawEffects(b) {
    for (const effect of state.effects) {
      if (!inView(effect, b, effect.item.radius + 30)) continue;
      const v = effect.vis ??= {puffs: Array.from({length: 16}, (_, i) => { const r = seeded(Math.floor(effect.x * 31 + effect.y * 17 + i * 7)); const a = r() * TAU, d = Math.sqrt(r()); return {a, d, s: 0.45 + r() * 0.55, rot: r() * TAU, sp: (r() - 0.5) * 0.4}; })};
      const R = effect.item.radius, el = effect.elapsed, rem = effect.remaining;
      if (effect.id === 'smoke') {
        const grow = Math.min(1, el / 0.7), fade = Math.min(1, rem / 1.2);
        for (const p of v.puffs) {
          const a = p.a + el * p.sp * 0.5, d = p.d * R * 0.62 * (0.4 + 0.6 * grow), r = R * 0.34 * p.s * (0.5 + 0.5 * grow), wob = Math.sin(el * 0.9 + p.rot) * 3;
          ctx.globalAlpha = 0.52 * fade; const x = effect.x + Math.cos(a) * d + wob, y = effect.y + Math.sin(a) * d - wob * 0.6;
          ctx.drawImage(puffSprite('#b9b5c2'), x - r, y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba('#d8d4e2', 0.12 * fade); ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(effect.x, effect.y, R * 0.92, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      } else if (effect.id === 'incendiary') {
        const fade = Math.min(1, rem / 0.6), pulse = 0.5 + 0.5 * Math.sin(el * 8);
        const g = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, R); g.addColorStop(0, rgba('#ff8a3c', 0.3 * fade)); g.addColorStop(0.7, rgba('#ff5a24', 0.14 * fade)); g.addColorStop(1, rgba('#ff5a24', 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(effect.x, effect.y, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba('#ffb060', (0.3 + pulse * 0.2) * fade); ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -el * 12; ctx.beginPath(); ctx.arc(effect.x, effect.y, R * 0.94, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      } else if (effect.id === 'flash' || effect.id === 'frag') {
        // the burst itself is drawn by fx; leave a faint shock disc for a moment
        const k = clamp(el / 0.35, 0, 1);
        if (k < 1) { ctx.globalAlpha = (1 - k) * 0.22; ctx.fillStyle = effect.id === 'flash' ? '#fff6c8' : '#ffb877'; ctx.beginPath(); ctx.arc(effect.x, effect.y, R * (0.5 + k * 0.5), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      }
    }
  }

  function drawBullets(b) {
    ctx.lineCap = 'round';
    for (const bl of state.bullets) {
      if (!inView(bl, b, 60)) continue;
      const sp = Math.hypot(bl.vx, bl.vy) || 1, dx = bl.vx / sp, dy = bl.vy / sp;
      if (bl.owner === 'player') {
        const color = bl.color !== undefined ? hexStr(bl.color) : '#ffd17c', len = clamp(sp * 0.04, 12, 40);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const f0 = i / 3, f1 = (i + 1) / 3;
          ctx.strokeStyle = color; ctx.globalAlpha = (1 - f0) * 0.55; ctx.lineWidth = 3.4 * (1 - f0 * 0.6);
          ctx.beginPath(); ctx.moveTo(bl.x - dx * len * f0, bl.y - dy * len * f0); ctx.lineTo(bl.x - dx * len * f1, bl.y - dy * len * f1); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = tint(color, 0.8); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bl.x - dx * len * 0.55, bl.y - dy * len * 0.55); ctx.lineTo(bl.x, bl.y); ctx.stroke();
        ctx.strokeStyle = '#fffdf2'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bl.x - dx * len * 0.22, bl.y - dy * len * 0.22); ctx.lineTo(bl.x, bl.y); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.65; ctx.drawImage(glowSprite(color), bl.x - 7, bl.y - 7, 14, 14); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#ff4a5e'; ctx.globalAlpha = 0.5; ctx.lineWidth = 4.6; ctx.beginPath(); ctx.moveTo(bl.x - dx * 14, bl.y - dy * 14); ctx.lineTo(bl.x, bl.y); ctx.stroke();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#ff7f78'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(bl.x - dx * 9, bl.y - dy * 9); ctx.lineTo(bl.x, bl.y); ctx.stroke();
        ctx.fillStyle = '#fff1e8'; ctx.beginPath(); ctx.arc(bl.x, bl.y, 2.2, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(14,6,12,0.8)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(bl.x, bl.y, 3.4, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75; ctx.drawImage(glowSprite('#ff4a5e'), bl.x - 10, bl.y - 10, 20, 20); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  // ------------------------------------------------------------------ overlay passes (screen space)
  function ensureVignette(w, h) {
    const key = w + 'x' + h;
    if (vignette && vignetteKey === key) return vignette;
    vignette = makeCanvas(256, 144);
    const g = vignette.getContext('2d');
    const grad = g.createRadialGradient(128, 72, 28, 128, 72, 150);
    grad.addColorStop(0, 'rgba(6,4,12,0)'); grad.addColorStop(0.55, 'rgba(6,4,12,0.22)'); grad.addColorStop(1, 'rgba(6,4,12,0.92)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 144);
    vignetteKey = key;
    return vignette;
  }

  function drawCrosshair(dpr) {
    if (!vis.mouseActive || state.mode !== 'play' || state.paused || state.loadoutOpen || state.merchantOpen || state.cacheOpen || state.pendingGunPickup) return;
    const x = vis.mouseX * dpr, y = vis.mouseY * dpr, s = dpr;
    const hit = fx.hitMark > 0, k = fx.hitMark / 0.22, reloading = state.reloadTimer > 0;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(x, y); ctx.lineCap = 'round';
    const gap = (5 + (vis.bloom || 0) * 22) * s + (hit ? (1 - k) * 3 * s : 0), len = 5 * s;
    const col = reloading ? '#ffd27a' : '#fff6ea';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass === 0 ? 'rgba(14,10,20,0.75)' : col; ctx.lineWidth = (pass === 0 ? 3.4 : 1.6) * s;
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(dx * gap, dy * gap); ctx.lineTo(dx * (gap + len), dy * (gap + len)); }
      ctx.stroke();
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 1.3 * s, 0, TAU); ctx.fill();
    if (reloading) {
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(0, 0, 14 * s, -Math.PI / 2, -Math.PI / 2 + TAU * (vis.reloadFrac || 0)); ctx.stroke();
    }
    if (hit) {
      const r = (9 + (1 - k) * 4) * s; ctx.strokeStyle = fx.hitKill ? '#ffd86e' : '#ffffff'; ctx.lineWidth = 2.2 * s; ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.beginPath(); for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.moveTo(dx * r * 0.45, dy * r * 0.45); ctx.lineTo(dx * r, dy * r); } ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ attract screen
  function drawAttract(w, h, dt) {
    vis.time += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0b13'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!vis.attract) {
      const c = makeCanvas(512, 288), g = c.getContext('2d'), r = seeded(7);
      const grad = g.createLinearGradient(0, 0, 512, 288); grad.addColorStop(0, '#18131f'); grad.addColorStop(1, '#2a2229'); g.fillStyle = grad; g.fillRect(0, 0, 512, 288);
      g.strokeStyle = 'rgba(255,240,225,0.05)'; g.lineWidth = 1; for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 288); g.stroke(); } for (let y = 0; y < 288; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
      for (let i = 0; i < 40; i++) { const x = r() * 512, y = r() * 288, rr = 20 + r() * 50; const gg = g.createRadialGradient(x, y, 0, x, y, rr); gg.addColorStop(0, 'rgba(255,120,90,0.05)'); gg.addColorStop(1, 'rgba(255,120,90,0)'); g.fillStyle = gg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      vis.attract = c;
    }
    ctx.drawImage(vis.attract, 0, 0, canvas.width, canvas.height);
    const sx = vis.time * 20 % canvas.width;
    const beam = ctx.createLinearGradient(sx - 300, 0, sx + 300, 0); beam.addColorStop(0, 'rgba(255,90,110,0)'); beam.addColorStop(0.5, 'rgba(255,90,110,0.06)'); beam.addColorStop(1, 'rgba(255,90,110,0)');
    ctx.fillStyle = beam; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(ensureVignette(w, h), 0, 0, canvas.width, canvas.height);
  }

  // ------------------------------------------------------------------ main frame
  function render(frame = {}) {
    const t0 = performance.now();
    const dt = clamp(frame.dt ?? 1 / 60, 0, 0.1), dpr = vis.dpr, now = performance.now() / 1000;
    const w = cam.w, h = cam.h;
    if (frame.mouseX !== undefined) { vis.mouseX = frame.mouseX; vis.mouseY = frame.mouseY; vis.mouseActive = true; }
    vis.reloadFrac = frame.reloadFrac ?? 0; vis.bloom = frame.bloom || 0; vis.exitReady = !!frame.exitReady;
    fx.tick(dt);
    const p = state.player;
    if (!levelReady || !p) { drawAttract(w, h, dt); return; }

    vis.slow += (slowAmount(frame.timeScale ?? 1, frame.idleScale ?? 0.18) - vis.slow) * (1 - Math.exp(-5 * dt));
    vis.deadT = state.mode === 'dead' ? vis.deadT + dt : 0;
    vis.flicker = Math.sin(now * 17) * 0.5 + Math.sin(now * 29) * 0.5;
    for (const e of state.enemies) if (e.vis) { e.vis.flash = Math.max(0, (e.vis.flash || 0) - dt * 7); e.vis.barT = Math.max(0, (e.vis.barT || 0) - dt); }
    for (const c of state.crates) if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 7);
    vis.flashHit = Math.max(0, (vis.flashHit || 0) - dt * 6);
    // camera
    const look = vis.mouseActive && state.mode === 'play' ? lookAheadOffset(vis.mouseX, vis.mouseY, w, h, 46) : {x: 0, y: 0};
    followStep(cam, p.x + look.x, p.y + look.y, dt, 6.5);
    const shake = frame.shake || 0;
    const viewCam = {x: cam.x + (shake ? (Math.random() * 2 - 1) * shake : 0), y: cam.y + (shake ? (Math.random() * 2 - 1) * shake : 0), w, h, scale: cam.scale};
    const b = viewBounds(viewCam, 0), bp = viewBounds(viewCam, 40);
    const sc = viewCam.scale * dpr;
    // decals queued by fx get baked onto the floor
    for (const d of fx.decals) world.stampDecal(d);
    fx.decals.length = 0;
    trail.record(p.x, p.y, now);
    lighting.update(dt, state);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    world.draw(ctx, viewCam, b, dpr);
    world.idleBake(p.x, p.y, 4);
    ctx.setTransform(sc, 0, 0, sc, (w / 2 - viewCam.x * viewCam.scale) * dpr, (h / 2 - viewCam.y * viewCam.scale) * dpr);
    ctx.lineJoin = 'round';

    fx.drawBelow(ctx, bp);
    drawShadows(bp);
    drawGates(bp);
    drawProps(bp);
    drawPillars(bp);
    drawCrates(bp);
    drawPickups(bp);
    // corpses first, then the living
    for (const e of state.enemies) if (!e.alive && inView(e, bp, 40)) drawEnemy(e, now);
    for (const e of state.enemies) if (e.alive && inView(e, bp, 40)) drawEnemy(e, now);
    drawThrown();
    drawPlayer(now);
    drawEffects(bp);
    fx.drawSmoke(ctx, bp);

    // darkness + light pools
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    lighting.draw(ctx, viewCam, dpr, {px: p.x, py: p.y, lights: fx.lightList(), flicker: vis.flicker, slow: vis.slow, dead: state.mode === 'dead' ? Math.min(1, vis.deadT * 1.5) : 0, won: state.mode === 'won'});
    ctx.setTransform(sc, 0, 0, sc, (w / 2 - viewCam.x * viewCam.scale) * dpr, (h / 2 - viewCam.y * viewCam.scale) * dpr);
    ctx.lineJoin = 'round';

    drawPickupGlows(bp);
    drawTelegraphs(bp);
    drawBullets(bp);
    fx.drawAdditive(ctx, bp);
    // coloured light flashes (muzzle, blasts) on top of the dark
    ctx.globalCompositeOperation = 'lighter';
    for (const l of fx.lightList()) { if (l.a <= 0.01) continue; ctx.globalAlpha = l.a * 0.32; ctx.drawImage(glowSprite(l.color), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fx.drawFloaters(ctx, viewCam, dpr);
    if (vis.slow > 0.02) {
      // slow time drains colour (a single 'saturation' blend; skipped at full speed)
      ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = 0.4 * vis.slow; ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    affordances.draw(ctx, state, viewCam, dpr, dt, vis.exitReady);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawCrosshair(dpr);
    const ms = performance.now() - t0;
    stats.drawMs = stats.drawMs * 0.9 + ms * 0.1; stats.frames++; stats.bakeMs = world.bakeMs;
  }

  function hurtFlash() { vis.flashHit = 1; }

  resize();
  window.addEventListener('resize', resize);
  return {canvas, fx, world, lighting, stats, vis, resize, setLevel, screenToWorld, update, render, shot, consume, hurtFlash, cam};
}

function hexPath(ctx, r) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
function rrectPath(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
void ENEMY_TYPES;
