// DEAD AIR Canvas 2D renderer. Reads the plain game `state` each frame and draws the whole scene:
// baked world chunks, props, actors, projectiles, effects, lighting and the slow-time grade.
import {ENEMY_TYPES, GUNS, TILE} from './catalog.js';
import {createCamera, followStep, lookAheadOffset, resizeCamera, screenToWorld as camScreenToWorld, viewBounds} from './camera2d.js';
import {Fx} from './fx2d.js';
import {Lighting} from './lighting2d.js';
import {createTimeFx} from './timefx.js';
import {angDiff, cameraZoom, clamp, damp, dampAngle, pulse as hump, inCubic, inOutCubic, lerp, moveAmount, newSpring, outBack, outBounce, outCubic, outQuad, reloadPose, springDamping, stepSpring, swapPose, walkPhase, walkPose} from './anim.js';
import {ACTOR_LOOK, INK, TAU, actorSprite, corpseSprite, crateSprite, drawBlobShadow, drawBoxShadow, drawGun, drawHand, drawMagSprite, glowSprite, gunMuzzle, hexStr, makeCanvas, mix, pillarSprite, puffSprite, rgba, seeded, setSpriteScale, shade, tint} from './sprites2d.js';
import {WorldLayer} from './world2d.js';
import {drawIcon} from './icons.js';
import {createAffordances} from './affordances2d.js';
import {drawBoss, drawBossTelegraph} from './boss2d.js';
import {drawMetaWorld} from './meta-overlay2d.js';
import {createStealthLayer} from './stealth2d.js';
import {createDoorLayer} from './doors2d.js';
import {ageHitIndicators, drawDamageArcs, drawOffscreenThreats} from './threat-indicators.js';

// Gradients are in the caller's local (translated) space and depend only on their stops, so each distinct one is built once.
const gradCache = new Map();
let radialPlate = null;
function lgrad(ctx, x0, y0, x1, y1, c0, c1) {
  const key = `l${x0},${y0},${x1},${y1},${c0},${c1}`;
  let g = gradCache.get(key);
  if (!g) { g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); gradCache.set(key, g); }
  return g;
}

export {hexStr};
const FONT = "'Barlow Condensed','DM Mono',system-ui,sans-serif";
const MONO = "'DM Mono',ui-monospace,monospace";
const hashPos = (x, y) => { let h = Math.imul(Math.round(x) * 73856093 ^ Math.round(y) * 19349663, 1274126177); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

const ENEMY_GUNS = {
  gunner: {category: 'ASSAULT RIFLE', visual: {length: 26, width: 5}, color: 0xff5a4a},
  guard: {category: 'SMG', visual: {length: 23, width: 5}, color: 0x58aeca},
  sniper: {category: 'SNIPER', visual: {length: 36, width: 5}, color: 0x4fd0c4},
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
  const stealth = createStealthLayer();
  const doorLayer = createDoorLayer();
  const world = new WorldLayer();
  const lighting = new Lighting();
  const timeFx = createTimeFx();
  const trail = new Trail();
  const _wp = {}, _rp = {}, _sw = {}, BOSS_LOOK = {r: 24};
  const GHOST_TIME = 0.24;
  const vis = {ghosts: Array.from({length: 24}, () => ({on: false, pk: null, t: 0, x0: 0, y0: 0, side: 1})), fl: {x: 0, y: 0, vx: 0, vy: 0}, camX: newSpring(0), camY: newSpring(0), zoom: newSpring(0), zbase: 1, bodyAng: 0, mvAng: 0, pPhase: 0, pMv: 0, swapT: 1, lastGun: -1, prevGun: 0, fresh: true, motion: 1, flashK: 1, tick: 0, wbT: 2, hurtSat: 0, killFlash: 0, seated: false, seatFx: false, angInit: false, slow: 0, hurt: 0, dpr: 1, time: 0, flicker: 0, mouseX: 0, mouseY: 0, mouseActive: false, wasMoving: false, deadT: 0, px: null, py: null, kick: 0, attract: null, camShake: {x: 0, y: 0}};
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
    resizeCamera(cam, w, h); cam.base = cam.scale;
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
    vis.px = null; vis.fresh = true; vis.lastGun = -1; vis.swapT = 1; vis.angInit = false; vis.fl.x = vis.fl.y = vis.fl.vx = vis.fl.vy = 0; for (const g of vis.ghosts) g.on = false;
    const p = state.player;
    if (p) {
      cam.x = p.x; cam.y = p.y;
      // bake what the player can see now so the first frame is complete
      world.prewarm(p.x, p.y, 1);
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
        vis.tick = 1; // the world "ticks" forward on every shot: a brief cool pulse in the grade
      } else if (ev.type === 'impact' && (ev.surface === 'wall' || ev.surface === 'cover')) {
        fx.wallImpact(ev.x, ev.y, ev.vx ?? 1, ev.vy ?? 0, ev.owner);
      } else if (ev.type === 'reloadStart') {
        const p = state.player;
        if (p) { const a = Math.atan2(state.aim.y, state.aim.x); fx.mag(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10, a, Math.abs(a) > Math.PI / 2 ? 1 : -1); }
        vis.seated = false;
      } else if (ev.type === 'reloadEnd') {
        vis.seated = true;
      } else if (ev.type === 'playerHurt') {
        fx.playerHit(ev.x, ev.y, ev.armorOnly);
        vis.flashHit = 1;
        const p = state.player;
        if (p) {
          // flinch away from the shooter and shove the camera the same way; the grade desaturates briefly
          const away = ev.sx !== undefined ? Math.atan2(p.y - ev.sy, p.x - ev.sx) : Math.random() * TAU, m = vis.motion;
          vis.fl.vx += Math.cos(away) * 90 * (ev.armorOnly ? 0.6 : 1); vis.fl.vy += Math.sin(away) * 90 * (ev.armorOnly ? 0.6 : 1);
          vis.camX.x += Math.cos(away) * 6 * m; vis.camY.x += Math.sin(away) * 6 * m;
          vis.zoom.x += 0.025;
        }
        vis.hurtSat = 1;
      }
    }
  }

  // ------------------------------------------------------------------ per-simulation-step update
  const STRIDE = {player: 40, chaser: 30, gunner: 36, brute: 34, guard: 34, sniper: 36, riot: 34, elite: 38};
  const AUTO_PICK = new Set(['scrap', 'heal', 'ammo', 'armor', 'mod']);
  const kindOf = (e) => (e.elite ? 'elite' : e.type);

  function springXY(o, k, c, dt) {
    const h = Math.min(dt, 1 / 40);
    o.vx += (-k * o.x - c * o.vx) * h; o.vy += (-k * o.y - c * o.vy) * h;
    o.x += o.vx * h; o.y += o.vy * h;
  }

  function updateEnemy(e, step) {
    const v = e.vis ??= {}, kind = kindOf(e);
    if (e.type === 'boss') { v.flash = v.flash || 0; return; } // the Conductor animates itself (boss2d.js)
    v.ang ??= 0; v.prevX ??= e.x; v.prevY ??= e.y; v.dustT ??= 0;
    v.fpx ??= 0; v.fpy ??= 0; v.fvx ??= 0; v.fvy ??= 0;
    const mvx = (e.x - v.prevX) / Math.max(step, 1e-4), mvy = (e.y - v.prevY) / Math.max(step, 1e-4);
    v.prevX = e.x; v.prevY = e.y;
    v.speed = Math.min(160, Math.hypot(mvx, mvy));
    v.kick = Math.max(0, (v.kick || 0) - step * 9);
    v.punch = Math.max(0, (v.punch || 0) - step * 7);
    // flinch spring (hit impulses are added to fvx/fvy by Fx.hitEnemy)
    { const h = Math.min(step, 1 / 40); v.fvx += (-300 * v.fpx - 17 * v.fvx) * h; v.fvy += (-300 * v.fpy - 17 * v.fvy) * h; v.fpx += v.fvx * h; v.fpy += v.fvy * h; }
    if (e.alive) {
      const p = state.player;
      v.aimMax = e.aimTimer > 0 ? Math.max(v.aimMax || 0, e.aimTimer) : 0;
      if (e.aware && !v.wasAware) v.alertT = 0.9;
      v.wasAware = !!e.aware; v.alertT = Math.max(0, (v.alertT || 0) - step);
      const target = (e.meleeWindup > 0 || e.aimTimer > 0) ? Math.atan2(e.aim.y, e.aim.x) : e.face ? Math.atan2(e.face.y, e.face.x) : p ? Math.atan2(p.y - e.y, p.x - e.x) : v.ang;
      if (v.first === undefined) { v.ang = target; v.mvAng = target; v.phase = (e.id || 0) % 1; v.first = true; }
      v.ang = dampAngle(v.ang, target, 16, step);
      if (v.speed > 8) v.mvAng = dampAngle(v.mvAng, Math.atan2(mvy, mvx), 14, step);
      v.mv = damp(v.mv || 0, moveAmount(v.speed, 60), 10, step);
      v.phase = walkPhase(v.phase, v.speed, STRIDE[kind] || 34, step);
      // wind-up / strike bookkeeping
      const wind = e.meleeWindup > 0;
      if (wind && !v.wasWind) { v.windT = 0; fx.dust(e.x - Math.cos(v.ang) * 6, e.y - Math.sin(v.ang) * 6, 0, 0); fx.dust(e.x + Math.sin(v.ang) * 7, e.y - Math.cos(v.ang) * 7, 0, 0); }
      if (wind) v.windT = (v.windT || 0) + step;
      if (!wind && v.wasWind) {
        v.lunge = 1;
        const a = Math.atan2(e.aim.y, e.aim.x);
        for (let i = 0; i < 5; i++) { const o = (i - 2) * 0.28; fx.dust(e.x + Math.cos(a + o) * 14, e.y + Math.sin(a + o) * 14, Math.cos(a + o) * 160, Math.sin(a + o) * 160); }
        fx.ring(e.x + Math.cos(a) * 12, e.y + Math.sin(a) * 12, 4, 26, '#ffc08a', 0.22, 2.4);
      }
      v.wasWind = wind;
      v.lunge = Math.max(0, (v.lunge || 0) - step * 5.5);
      v.raise = damp(v.raise || 0, e.aimTimer > 0 ? 1 : 0, e.aimTimer > 0 ? 12 : 5, step);
      v.rel = damp(v.rel || 0, e.reloadTimer > 0 ? 1 : 0, 9, step);
      // riot braces when it holds still and aware, and kicks its shield back on a block
      const braceT = e.type === 'riot' && e.aware && v.speed < 22 && !(e.stun > 0.35) ? 1 : 0;
      v.brace = damp(v.brace || 0, braceT, 9, step);
      if (v.brace > 0.6 && !v.braced) { v.braced = true; const sa = e.shieldAng || 0; for (let i = 0; i < 3; i++) fx.dust(e.x + Math.cos(sa) * 12 + (i - 1) * 4, e.y + Math.sin(sa) * 12 + (i - 1) * 4, Math.cos(sa) * 60, Math.sin(sa) * 60); }
      else if (v.brace < 0.2) v.braced = false;
      v.dustT -= step;
      if (v.speed > 22 && v.dustT <= 0) { v.dustT = 0.16; fx.dust(e.x - Math.cos(v.ang) * e.radius * 0.5, e.y - Math.sin(v.ang) * e.radius * 0.5, mvx, mvy); }
    } else if (v.deathT !== undefined) {
      v.deathT += step;
      const heavy = kind === 'brute' || kind === 'elite';
      if (v.deathFx === 0 && v.deathT > (heavy ? 0.3 : kind === 'riot' ? 0.1 : 0.2)) {
        v.deathFx = 1;
        if (heavy) {
          fx.ring(e.x, e.y, 4, e.radius * (kind === 'elite' ? 6 : 3.6), '#c9bfb2', 0.38, 3.4);
          for (let i = 0; i < (kind === 'elite' ? 10 : 6); i++) { const a = i * TAU / 6 + Math.random(); fx.dust(e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 8, Math.cos(a) * 140, Math.sin(a) * 140); }
          if (kind === 'elite') fx.camPunch = Math.min(0.08, fx.camPunch + 0.03);
        } else if (kind === 'riot') {
          fx.spark(e.x + Math.cos(e.shieldAng || 0) * 14, e.y + Math.sin(e.shieldAng || 0) * 14, e.shieldAng || 0, 7, 1.2, [120, 300], '#cfe6ff');
        } else fx.dust(e.x, e.y, 0, 0);
      }
    }
  }

  function updatePickups(step) {
    const p = state.player, t = vis.time;
    for (const pk of state.pickups) {
      let v = pk.vis;
      if (!v) { v = pk.vis = {born: vis.fresh ? -99 : t, wasAvail: pk.available, wasClaimed: !!pk.claimed, ox: 0, oy: 0, openAt: -99, claimAt: -99}; }
      // magnet: nearby loot leans toward the player before it is collected
      let tx = 0, ty = 0;
      if (p && pk.available && AUTO_PICK.has(pk.kind)) {
        const dx = p.x - pk.x, dy = p.y - pk.y, d = Math.hypot(dx, dy);
        if (d < 54 && d > 0.5) { const k = (1 - d / 54) ** 2 * 9; tx = dx / d * k; ty = dy / d * k; }
      }
      v.ox = damp(v.ox, tx, 14, step); v.oy = damp(v.oy, ty, 14, step);
      if (v.wasAvail && !pk.available && pk.kind !== 'exit') {
        if (pk.kind === 'locker') v.openAt = t;
        else if (p) {
          for (const g of vis.ghosts) if (!g.on) { g.on = true; g.pk = pk; g.t = 0; g.x0 = pk.x + v.ox; g.y0 = pk.y + v.oy - 2; g.side = Math.random() < 0.5 ? -1 : 1; break; }
        }
      }
      if (!v.wasClaimed && pk.claimed) { v.claimAt = t; fx.star(pk.x, pk.y - 8, '#ffe28a', 5, 0.55); fx.star(pk.x - 6, pk.y - 4, '#fff', 3, 0.4); }
      v.wasAvail = pk.available; v.wasClaimed = !!pk.claimed;
    }
    vis.fresh = false;
    for (const g of vis.ghosts) {
      if (!g.on) continue;
      g.t += step;
      if (g.t >= GHOST_TIME) { g.on = false; if (p) { fx.ring(p.x, p.y, 3, 17, g.pk.color || '#f4c66d', 0.2, 2); fx.star(p.x, p.y - 4, g.pk.color || '#fff', 3.4, 0.3); } g.pk = null; }
    }
  }

  function update(step) {
    vis.time += step;
    fx.update(step);
    for (const e of state.enemies) updateEnemy(e, step);
    const p = state.player;
    if (p) {
      if (vis.px !== null) {
        const mvx = (p.x - vis.px) / Math.max(step, 1e-4), mvy = (p.y - vis.py) / Math.max(step, 1e-4), sp = Math.hypot(mvx, mvy);
        vis.pSpeed = sp; vis.mvx = mvx; vis.mvy = mvy;
        vis.dustT = (vis.dustT || 0) - step;
        if (sp > 30 && vis.dustT <= 0) { vis.dustT = sp > 100 ? 0.07 : 0.12; fx.dust(p.x - state.aim.x * 3, p.y - state.aim.y * 3, mvx, mvy); }
        if (sp > 8) vis.mvAng = dampAngle(vis.mvAng, Math.atan2(mvy, mvx), 16, step);
        vis.pMv = damp(vis.pMv, moveAmount(sp, 100), 12, step);
        vis.pPhase = walkPhase(vis.pPhase, sp, STRIDE.player * (1 + 0.15 * (state.sprintBlend || 0)), step);
      }
      vis.px = p.x; vis.py = p.y;
      vis.kick = Math.max(0, vis.kick - step * 8);
      // torso lags the aim a little so the gun leads and the body follows
      const aimAng = Math.atan2(state.aim.y, state.aim.x);
      if (!vis.angInit) { vis.angInit = true; vis.bodyAng = aimAng; vis.mvAng = aimAng; }
      vis.bodyAng = dampAngle(vis.bodyAng, aimAng, 12, step);
      const lag = angDiff(vis.bodyAng, aimAng); if (Math.abs(lag) > 0.8) vis.bodyAng = aimAng - Math.sign(lag) * 0.8;
      springXY(vis.fl, 300, 18, step);
      // weapon swap: holster the old gun, draw the new one
      if (state.weaponIndex !== vis.lastGun) { if (vis.lastGun >= 0) { vis.prevGun = vis.lastGun; vis.swapT = 0; } vis.lastGun = state.weaponIndex; }
      vis.swapT = Math.min(1, vis.swapT + step / 0.34);
      // mag-seat click
      const rf = state.reloadTotal > 0 && state.reloadTimer > 0 ? 1 - state.reloadTimer / state.reloadTotal : 0;
      if (rf > 0.78 && !vis.seatFx) { vis.seatFx = true; const gun = GUNS[state.weaponIndex], m = gunMuzzle(gun) * 0.5; fx.star(p.x + Math.cos(aimAng) * m, p.y + Math.sin(aimAng) * m, '#fff6d0', 3.6, 0.22); }
      if (rf === 0) vis.seatFx = false;
    }
    vis.tick = Math.max(0, vis.tick - step * 9);
    for (const effect of state.effects) {
      if (effect.id === 'incendiary' && effect.remaining > 0) {
        const n = step * 90; let count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        while (count-- > 0) fx.flames(effect.x, effect.y, effect.item.radius);
      }
    }
    for (const g of state.thrown) {
      const gv = g.vis ??= {t: 0, age: 0, rot: 0, px: g.x, py: g.y};
      gv.age += step; gv.t -= step;
      const gs = Math.hypot(g.x - gv.px, g.y - gv.py) / Math.max(step, 1e-4); gv.px = g.x; gv.py = g.y;
      gv.rot += step * (6 + 16 * clamp(gs / 140)) ;
      if (gv.t <= 0 && g.id !== 'flash') { gv.t = 0.045; fx.smoke(g.x, g.y, 3.2, 1, '#aaa4ac', 5, [0.35, 0.6], 0.3); }
    }
    updatePickups(step);
    for (const c of state.crates) {
      const w = c.wob; if (!w) continue;
      const h = Math.min(step, 1 / 40);
      w.vx += (-320 * w.x - 15 * w.vx) * h; w.vy += (-320 * w.y - 15 * w.vy) * h; w.vr += (-280 * w.r - 11 * w.vr) * h;
      w.x += w.vx * h; w.y += w.vy * h; w.r += w.vr * h;
    }
    for (const gate of state.lockedDoors) {
      const a = gate.vis ??= {open: 0, fx: false};
      if (gate.opened) {
        a.open = Math.min(1, a.open + step / 1.0);
        if (!a.fx) {
          a.fx = true;
          const cx = (gate.cells.reduce((s, c) => s + c.x, 0) / gate.cells.length + 0.5) * TILE, cy = (gate.cells.reduce((s, c) => s + c.y, 0) / gate.cells.length + 0.5) * TILE;
          fx.spark(cx, cy, 0, 12, Math.PI, [80, 280], '#9fffcf'); fx.ring(cx, cy, 4, 30, '#6dffb0', 0.4, 2.4);
          for (let i = 0; i < 6; i++) fx.dust(cx + (Math.random() - 0.5) * gate.cells.length * TILE * 0.8, cy + (Math.random() - 0.5) * 10, 0, 0);
        }
      }
    }
    // idle life on props: the workbench throws a stray weld spark now and then
    const wb = state.workbench;
    if (wb && p && Math.abs(wb.x - p.x) < 380 && Math.abs(wb.y - p.y) < 260) {
      vis.wbT -= step;
      if (vis.wbT <= 0) { vis.wbT = 1.8 + Math.random() * 3; fx.spark(wb.x + 8, wb.y + 4, -Math.PI / 2, 4, 0.9, [40, 120], '#ffd9a0'); fx.star(wb.x + 8, wb.y + 2, '#fff2c0', 3, 0.25); }
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

  // height of a thrown grenade above the floor: a decaying chain of bounces, with a squash at each contact
  const _gz = {z: 0, sq: 0};
  function grenadeAir(g) {
    const age = g.vis ? g.vis.age : 0, period = 0.3, n = Math.floor(age / period), u = (age - n * period) / period;
    const amp = 9 * Math.pow(0.5, n);
    _gz.z = amp < 0.6 ? 0 : amp * 4 * u * (1 - u);
    _gz.sq = amp < 0.6 ? 0 : (u < 0.1 ? 1 - u / 0.1 : u > 0.9 ? (u - 0.9) / 0.1 : 0);
    return _gz;
  }
  // pickup spawn pop: scale overshoots and the item drops and bounces on the floor
  const _pp = {s: 1, y: 0, lift: 0};
  function pickupPop(v) {
    const age = vis.time - v.born;
    if (age >= 0.6 || age < 0) { _pp.s = 1; _pp.y = 0; _pp.lift = 0; return _pp; }
    _pp.s = outBack(clamp(age / 0.26), 2.6);
    const drop = 1 - outBounce(clamp(age / 0.55));
    _pp.y = -drop * 15; _pp.lift = drop;
    return _pp;
  }

  function drawShadows(b) {
    for (const crate of state.crates) { if (inView(crate, b, 30)) { const w = crate.wob; drawBoxShadow(ctx, crate.x - 12.5 + (w ? w.x * 0.5 : 0), crate.y - 12.5 + (w ? w.y * 0.5 : 0), 25, 25, 13); } }
    for (const c of state.cover) if (c.kind === 'pillar' && inView(c, b, 30)) drawBlobShadow(ctx, c.x, c.y, 11, 6, 0.9);
    for (const pk of state.pickups) {
      if (!pk.available || pk.kind === 'exit' || !inView(pk, b, 20)) continue;
      const bob = Math.sin(vis.time * 3 + hashPos(pk.x, pk.y) * 9), pop = pk.vis ? pickupPop(pk.vis) : _pp;
      drawBlobShadow(ctx, pk.x + (pk.vis ? pk.vis.ox : 0), pk.y + (pk.vis ? pk.vis.oy : 0), (6.5 - bob * 0.6) * Math.max(0.2, pop.s) * (1 - pop.lift * 0.25), 3, 0.7 * (1 - pop.lift * 0.5));
    }
    for (const e of state.enemies) {
      if (!inView(e, b, 40)) continue;
      const dying = !e.alive, look = ACTOR_LOOK[e.elite ? 'elite' : e.type] || BOSS_LOOK;
      if (!dying || (e.vis?.deathT ?? 9) < 0.5) drawBlobShadow(ctx, e.x, e.y, look.r * 0.95, 1.5, dying ? 0.6 : 1);
    }
    const p = state.player;
    if (p) drawBlobShadow(ctx, p.x, p.y, 10, 1.5);
    if (state.workbench) drawBoxShadow(ctx, state.workbench.x - 22, state.workbench.y - 14, 44, 28, 10);
    for (const room of state.rooms) if (room.role === 'merchant') { const x = (room.cx + 0.5) * TILE, y = (room.cy + 0.5) * TILE; if (inView({x, y}, b, 70)) { drawBlobShadow(ctx, x, y - 4, 12, 4); drawBoxShadow(ctx, x - 30, y + 14, 60, 18, 10); } }
    for (const t of state.thrown) { const a = grenadeAir(t); drawBlobShadow(ctx, t.x, t.y, Math.max(2, 4 - a.z * 0.12), 5, 0.8 * (1 - a.z * 0.04)); }
  }

  const inView = (o, b, pad = 0) => o.x > b.x0 - pad && o.x < b.x1 + pad && o.y > b.y0 - pad && o.y < b.y1 + pad;

  function drawCrates(b) {
    for (const crate of state.crates) {
      if (!inView(crate, b, 30)) continue;
      const stage = crate.damageStage || 0, variant = Math.floor(hashPos(crate.x, crate.y) * 3), img = crateSprite(stage, variant);
      const side = 25 + 6.4, h = side / 2, w = crate.wob;
      ctx.save(); ctx.translate(crate.x + (w ? w.x : 0), crate.y + (w ? w.y : 0)); if (w) ctx.rotate(w.r * 0.12);
      ctx.drawImage(img, -h, -h, side, side);
      if (crate.chips) {
        for (const c of crate.chips) {
          ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
          ctx.fillStyle = 'rgba(28,16,10,0.85)'; ctx.fillRect(-c.r, -c.r * 0.7, c.r * 2, c.r * 1.4);
          ctx.fillStyle = 'rgba(214,190,160,0.7)'; ctx.fillRect(-c.r, -c.r * 0.7, c.r * 2, 0.6);
          ctx.restore();
        }
      }
      if (crate.flash > 0) { ctx.globalAlpha = crate.flash * 0.55; ctx.fillStyle = '#fff4e0'; ctx.fillRect(-12.5, -12.5, 25, 25); ctx.globalAlpha = 1; }
      ctx.restore();
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
    // workbench: screen flickers and scrolls, the hologram turns, a scan line sweeps
    const wb = state.workbench;
    if (wb && inView(wb, b, 60)) {
      const x = wb.x, y = wb.y, pulse = 0.5 + 0.5 * Math.sin(t * 2.4), glitch = hashPos(Math.floor(t * 9), 5) > 0.92;
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = rgba('#ff4d6d', 0.25 + pulse * 0.2); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke();
      ctx.setLineDash([4, 6]); ctx.strokeStyle = rgba('#ff4d6d', 0.3); ctx.lineWidth = 1; ctx.lineDashOffset = -t * 6; ctx.beginPath(); ctx.arc(0, 0, 36, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#17141d'; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.fillRect(-20, -11, 44, 28); // lip
      const grad = lgrad(ctx, -22, -14, 22, 14, '#6a6275', '#3e3848');
      ctx.fillStyle = grad; ctx.fillRect(-22, -14, 44, 28); ctx.lineWidth = 1.4; ctx.strokeRect(-22, -14, 44, 28);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-21, 13); ctx.lineTo(-21, -13); ctx.lineTo(21, -13); ctx.stroke();
      ctx.fillStyle = '#2a2531'; ctx.fillRect(-18, -10, 36, 20); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.7; ctx.strokeRect(-18, -10, 36, 20);
      // tools laid out on the bench
      ctx.fillStyle = '#b9b3c4'; ctx.fillRect(-14, 3, 14, 2.4); ctx.fillRect(-14, 5.6, 9, 1.8);
      ctx.fillStyle = '#d65a3e'; ctx.fillRect(-1, 3, 5, 2.4);
      ctx.fillStyle = '#c9a24e'; ctx.fillRect(7, -6, 8, 3); ctx.fillStyle = '#4a4455'; ctx.fillRect(7, 0, 8, 5); ctx.strokeStyle = INK; ctx.strokeRect(7, 0, 8, 5);
      // screen: flicker, scrolling readout bars and a scan line
      ctx.fillStyle = INK; ctx.fillRect(-12, -13, 22, 6);
      ctx.fillStyle = rgba('#ff5a78', glitch ? 0.35 : 0.7 + pulse * 0.3 - (hashPos(Math.floor(t * 24), 2) > 0.85 ? 0.12 : 0)); ctx.fillRect(-11, -12.2, 20, 4.4);
      ctx.fillStyle = 'rgba(255,230,235,0.55)';
      for (let i = 0; i < 3; i++) { const w = 3 + hashPos(Math.floor(t * 3) + i * 7, i + 1) * 12; ctx.fillRect(-9.5, -11.6 + i * 1.3, w, 0.8); }
      const sy = -12.2 + ((t * 7) % 4.4); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-11, sy, 20, 0.7);
      // vise
      ctx.fillStyle = '#7a7585'; ctx.fillRect(15, -11, 6, 7); ctx.strokeStyle = INK; ctx.strokeRect(15, -11, 6, 7);
      ctx.restore();
      // holo gun hovering over the bench, turning about its long axis
      ctx.save(); ctx.translate(x, y - 25 + Math.sin(t * 2) * 1.5); ctx.rotate(-0.15);
      ctx.globalAlpha = (0.7 + pulse * 0.2) * (glitch ? 0.5 : 1); ctx.scale(0.7, 0.7 * (0.35 + 0.65 * Math.abs(Math.cos(t * 0.9))));
      drawGun(ctx, GUNS[state.weaponIndex], {reach: -12});
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // merchant stalls
    for (const room of state.rooms) {
      if (room.role !== 'merchant') continue;
      const x = (room.cx + 0.5) * TILE, y = (room.cy + 0.5) * TILE;
      if (!inView({x, y}, b, 80)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2), breath = 1 + 0.028 * Math.sin(t * 1.8), blink = (t + x * 0.01) % 3.6 < 0.12;
      ctx.save(); ctx.translate(x, y);
      ctx.setLineDash([5, 7]); ctx.lineDashOffset = t * 7; ctx.strokeStyle = rgba('#ffc46b', 0.3 + pulse * 0.2); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      // counter in front of the vendor
      ctx.fillStyle = '#1d140f'; ctx.fillRect(-29, 16, 62, 18);
      const wood = lgrad(ctx, 0, 14, 0, 32, '#9a6b46', '#6c4a33');
      ctx.fillStyle = wood; ctx.fillRect(-30, 14, 60, 18); ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.strokeRect(-30, 14, 60, 18);
      ctx.strokeStyle = 'rgba(255,230,190,0.4)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-29, 15); ctx.lineTo(29, 15); ctx.stroke();
      ctx.fillStyle = '#e8bb62'; for (const gx of [-22, -8, 6, 20]) { ctx.fillRect(gx, 17.5, 6, 6); } ctx.fillStyle = '#6fd6b2'; ctx.fillRect(-20, 25, 4, 4); ctx.fillStyle = '#d85a6a'; ctx.fillRect(8, 25, 4, 4); ctx.fillStyle = '#74c9ed'; ctx.fillRect(21, 25, 4, 4);
      // vendor: cloak, hood (breathing), blinking eyes
      ctx.save(); ctx.translate(0, -1); ctx.scale(breath, 1 / breath); ctx.translate(0, 1);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, -1, 12.5, 11.5, 0, 0, TAU); ctx.fill();
      const cloak = lgrad(ctx, -10, -10, 10, 10, '#b7794f', '#6d4430');
      ctx.fillStyle = cloak; ctx.beginPath(); ctx.ellipse(0, -1, 11, 10, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,190,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -1, 9, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
      ctx.fillStyle = '#3b2a22'; ctx.beginPath(); ctx.arc(0, 2, 6.2, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffd27a'; if (blink) { ctx.fillRect(-3, 5.1, 2, 0.6); ctx.fillRect(1, 5.1, 2, 0.6); } else { ctx.beginPath(); ctx.arc(-2, 5.3, 0.9, 0, TAU); ctx.arc(2, 5.3, 0.9, 0, TAU); ctx.fill(); }
      ctx.restore();
      // sign (neon flickers now and then) with a hanging lantern that sways
      const dim = hashPos(Math.floor(t * 8) + Math.floor(x), 9) > 0.9;
      ctx.fillStyle = '#17110e'; ctx.fillRect(-28, -38, 56, 13); ctx.strokeStyle = rgba('#ffc46b', dim ? 0.4 : 0.9); ctx.lineWidth = 1.1; ctx.strokeRect(-28, -38, 56, 13);
      ctx.fillStyle = rgba('#ffd27a', dim ? 0.3 : 0.85 + pulse * 0.15); ctx.font = `700 9px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MARKET', 0, -31.5);
      const sw = 0.24 * Math.sin(t * 1.7 + x) + 0.06 * Math.sin(t * 3.3), lx = 33 + Math.sin(sw) * 13, ly = -38 + Math.cos(sw) * 13;
      ctx.strokeStyle = '#6b5a4a'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(33, -38); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillRect(lx - 3.2, ly - 0.5, 6.4, 7.4); ctx.fillStyle = '#ffd27a'; ctx.fillRect(lx - 2.2, ly + 0.6, 4.4, 5.2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(lx - 1.6, ly + 1, 1.2, 4);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.12 * Math.sin(t * 11 + x); ctx.drawImage(glowSprite('#ffb85a'), lx - 16, ly - 12, 32, 32); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
  }

  function drawGates(b) {
    for (const gate of state.lockedDoors) {
      const av = gate.vis, open = gate.opened && av ? inOutCubic(clamp((av.open - 0.18) / 0.82)) : 0, pre = gate.opened && av ? clamp(av.open / 0.18) : 0;
      if (open >= 1) continue;
      const cx = (gate.cells.reduce((s, c) => s + c.x, 0) / gate.cells.length + 0.5) * TILE, cy = (gate.cells.reduce((s, c) => s + c.y, 0) / gate.cells.length + 0.5) * TILE;
      if (!inView({x: cx, y: cy}, b, 60)) continue;
      const span = gate.cells.length * TILE, vertical = gate.axis === 'y', pulse = 0.5 + 0.5 * Math.sin(vis.time * 3);
      const afford = (state.scrap || 0) >= gate.cost, col = gate.opened ? '#6dffb0' : afford ? '#ffb04a' : '#ff6a78';
      ctx.save(); ctx.translate(cx, cy); if (vertical) ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = 1 - open * open;
      const half = span / 2, slide = open * half * 0.95, rattle = open > 0 && open < 1 ? Math.sin(vis.time * 70) * 0.7 * Math.sin(open * Math.PI) : 0;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(side * slide, rattle * side);
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
      if (!gate.opened || pre < 1) {
        // lock plate with padlock: when the gate opens it flashes green, jolts and pops away before the panels part
        ctx.save();
        if (gate.opened) { const k = outBack(pre, 3); ctx.scale(1 + 0.3 * hump(pre), 1 + 0.3 * hump(pre)); ctx.translate(0, -k * 6); ctx.globalAlpha = (1 - open * open) * (1 - pre * pre); }
        ctx.fillStyle = INK; rrectPath(ctx, -12, -11, 24, 22, 4); ctx.fill();
        ctx.fillStyle = rgba(col, 0.9 + pulse * 0.1); rrectPath(ctx, -10.5, -9.5, 21, 19, 3); ctx.fill();
        ctx.rotate(vertical ? -Math.PI / 2 : 0);
        drawIcon(ctx, gate.opened && pre > 0.3 ? 'lock-unlocked' : 'lock-locked', 0, 0, 15, INK);
        ctx.restore();
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

  function drawPickupShape(pk, t, ph, color) {
    const spin = Math.sin(t * 1.4 + ph) * 0.25;
      if (pk.kind === 'scrap') {
        ctx.rotate(spin + t * 0.6);
        ctx.fillStyle = INK; hexPath(ctx, 7.4); ctx.fill();
        const g = lgrad(ctx, -6, -6, 6, 6, tint(color, 0.45), shade(color, 0.7));
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
        const g = lgrad(ctx, -6, -6, 6, 6, tint(color, 0.5), shade(color, 0.65));
        ctx.fillStyle = g; ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(-3, -3, 6, 6); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-4.5, -4.5, 3, 1);
      } else if (pk.kind === 'heal') {
        ctx.fillStyle = INK; rrectPath(ctx, -8.6, -8.6, 17.2, 17.2, 3.5); ctx.fill();
        const g = lgrad(ctx, -7, -7, 7, 7, '#f4fff9', '#bde8d2');
        ctx.fillStyle = g; rrectPath(ctx, -7.4, -7.4, 14.8, 14.8, 3); ctx.fill();
        ctx.fillStyle = '#25b673'; ctx.fillRect(-1.8, -5.5, 3.6, 11); ctx.fillRect(-5.5, -1.8, 11, 3.6);
      } else if (pk.kind === 'ammo') {
        ctx.fillStyle = INK; rrectPath(ctx, -8.6, -6.6, 17.2, 13.2, 2.5); ctx.fill();
        ctx.fillStyle = '#3f6f7c'; rrectPath(ctx, -7.4, -5.4, 14.8, 10.8, 2); ctx.fill();
        ctx.fillStyle = '#d9b45a'; for (let i = -1; i <= 1; i++) ctx.fillRect(i * 4.4 - 1.4, -4, 2.8, 7);
        ctx.fillStyle = '#8fe0ff'; ctx.fillRect(-7.4, 2.6, 14.8, 2.2);
      } else if (pk.kind === 'armor') {
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8.6, -5.5); ctx.lineTo(7, 4); ctx.lineTo(0, 9); ctx.lineTo(-7, 4); ctx.lineTo(-8.6, -5.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#75cfe0'; ctx.beginPath(); ctx.moveTo(0, -7.4); ctx.lineTo(6.8, -4.6); ctx.lineTo(5.6, 3.2); ctx.lineTo(0, 7.4); ctx.lineTo(-5.6, 3.2); ctx.lineTo(-6.8, -4.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-1, -5, 2, 9);
      } else if (pk.kind === 'locker') {
        ctx.fillStyle = INK; ctx.fillRect(-9.6, -13, 19.2, 25);
        const g = ctx.createLinearGradient(-8, 0, 8, 0); g.addColorStop(0, '#5b6a74'); g.addColorStop(1, '#2f3942');
        ctx.fillStyle = g; ctx.fillRect(-8.4, -11.8, 16.8, 22.6);
        ctx.fillStyle = INK; ctx.fillRect(-0.6, -11.8, 1.2, 22.6);
        ctx.fillStyle = '#8fe0ff'; ctx.fillRect(-7, -9, 5.2, 2); ctx.fillRect(1.8, -9, 5.2, 2);
        ctx.fillStyle = '#d9b45a'; ctx.fillRect(-6.2, -2, 2.6, 6); ctx.fillRect(-2.4, -2, 2.6, 6); ctx.fillRect(2.4, -2, 2.6, 6); ctx.fillRect(6.2 - 2.6, -2, 2.6, 6);
      } else if (pk.kind === 'cache' && pk.claimed) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = INK; ctx.fillRect(-9.6, -7.6, 19.2, 15.2);
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(-8.4, -6.4, 16.8, 12.8);
        ctx.fillStyle = '#17120d'; ctx.fillRect(-6.4, -4.4, 12.8, 8.8);
        { const lid = clamp(outBack(clamp((vis.time - (pk.vis ? pk.vis.claimAt : -99)) / 0.45), 2.6), 0, 1.2); ctx.fillStyle = '#6c5636'; ctx.fillRect(-8.6, -7.6 - 3.4 * lid, 17.2, 15.2 - 11.2 * Math.min(1, lid)); ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.strokeRect(-8.6, -7.6 - 3.4 * lid, 17.2, 15.2 - 11.2 * Math.min(1, lid)); }
        ctx.globalAlpha = 1;
      } else if (pk.kind === 'cache') {
        ctx.fillStyle = INK; ctx.fillRect(-9.6, -7.6, 19.2, 15.2);
        const g = lgrad(ctx, 0, -7, 0, 7, '#d9a04a', '#7c5528');
        ctx.fillStyle = g; ctx.fillRect(-8.4, -6.4, 16.8, 12.8);
        ctx.strokeStyle = '#4a3218'; ctx.lineWidth = 1.2; ctx.strokeRect(-6.4, -4.4, 12.8, 8.8);
        ctx.fillStyle = INK; ctx.fillRect(-2.2, -2, 4.4, 4.4); ctx.fillStyle = '#ffe28a'; ctx.fillRect(-1.2, -1, 2.4, 2.4);
      }
  }

  // supply locker after use: both doors have swung open (door width squashes about the hinge), dark inside
  function drawLockerOpen(pk, v) {
    const k = outBack(clamp((vis.time - v.openAt) / 0.4), 2.4), o = clamp(k, 0, 1.15), sx = 1 - 0.78 * Math.min(1, o);
    ctx.save(); ctx.translate(pk.x, pk.y - 1); ctx.globalAlpha = 0.85;
    ctx.fillStyle = INK; ctx.fillRect(-9.6, -13, 19.2, 25);
    ctx.fillStyle = '#0f1216'; ctx.fillRect(-8.4, -11.8, 16.8, 22.6);
    ctx.fillStyle = '#242a31'; ctx.fillRect(-7, -9, 14, 1.2); ctx.fillRect(-7, -1, 14, 1.2);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * 8.4, 0); ctx.scale(sx, 1);
      const g = ctx.createLinearGradient(0, 0, side * 8, 0); g.addColorStop(0, '#5b6a74'); g.addColorStop(1, '#2f3942');
      ctx.fillStyle = g; ctx.fillRect(side < 0 ? 0 : -8.4, -11.8, 8.4, 22.6); ctx.strokeStyle = INK; ctx.lineWidth = 1 / Math.max(0.3, sx); ctx.strokeRect(side < 0 ? 0 : -8.4, -11.8, 8.4, 22.6);
      ctx.restore();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawPickups(b) {
    const t = vis.time;
    for (const pk of state.pickups) {
      if (!inView(pk, b, 40)) continue;
      const v = pk.vis ??= {born: -99, wasAvail: pk.available, wasClaimed: !!pk.claimed, ox: 0, oy: 0, openAt: -99, claimAt: -99};
      if (!pk.available) { if (pk.kind === 'locker') drawLockerOpen(pk, v); continue; }
      const ph = hashPos(pk.x, pk.y) * 9, bob = Math.sin(t * 3 + ph) * 1.6, color = pk.color || '#f4c66d';
      if (pk.kind === 'exit') { drawExit(pk); continue; }
      const pop = pickupPop(v);
      ctx.save(); ctx.translate(pk.x + v.ox, pk.y - 2 + bob * (1 - pop.lift) + pop.y + v.oy);
      if (pop.s !== 1) ctx.scale(pop.s, pop.s * (1 + pop.lift * 0.15));
      drawPickupShape(pk, t, ph, color);
      // glint: a four-point sparkle sweeps the item every few seconds
      const gp = (t * 0.33 + ph * 0.37) % 1;
      if (gp < 0.1 && pk.kind !== 'cache' && !pk.claimed) {
        const r = Math.sin(gp / 0.1 * Math.PI) * 4.2;
        ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.moveTo(-3, -5 - r); ctx.lineTo(-2.2, -5 - 0.9); ctx.lineTo(-3 + r, -5); ctx.lineTo(-2.2, -5 + 0.9); ctx.lineTo(-3, -5 + r); ctx.lineTo(-3.8, -5 + 0.9); ctx.lineTo(-3 - r, -5); ctx.lineTo(-3.8, -5 - 0.9); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // collected items fly to the player along a curve, shrinking and spinning, with a glowing trail
    const p = state.player;
    if (!p) return;
    for (const g of vis.ghosts) {
      if (!g.on) continue;
      const u = clamp(g.t / GHOST_TIME), pk = g.pk, col = pk.color || '#f4c66d';
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 4; i >= 1; i--) {
        const uu = u - i * 0.07; if (uu <= 0) continue;
        ghostPos(g, uu, p); ctx.globalAlpha = 0.45 * (1 - i / 5); const r = 6 * (1 - i * 0.12);
        ctx.drawImage(glowSprite(col), _gp.x - r, _gp.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ghostPos(g, u, p);
      ctx.save(); ctx.translate(_gp.x, _gp.y); const sc = 1 - 0.5 * inCubic(u); ctx.scale(sc, sc); ctx.rotate(u * 5 * g.side);
      ctx.globalAlpha = 1 - 0.35 * u * u;
      drawPickupShape(pk, 0, 0, col);
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  const _gp = {x: 0, y: 0};
  function ghostPos(g, u, p) {
    const e = inCubic(u) * 0.7 + u * 0.3, tx = p.x, ty = p.y - 2, dx = tx - g.x0, dy = ty - g.y0, L = Math.hypot(dx, dy) || 1, arc = Math.sin(u * Math.PI) * 9 * g.side;
    _gp.x = g.x0 + dx * e - dy / L * arc; _gp.y = g.y0 + dy * e + dx / L * arc;
  }

  function drawPickupGlows(b) {
    ctx.globalCompositeOperation = 'lighter';
    for (const pk of state.pickups) {
      if (!pk.available || pk.claimed || !inView(pk, b, 40)) continue;
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
    const g = radialPlate || (radialPlate = ctx.createRadialGradient(0, 0, 3, 0, 0, 23)); if (!radialPlate._s) { radialPlate._s = 1; g.addColorStop(0, '#2b2733'); g.addColorStop(1, '#3d3847'); }
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 23, 0, TAU); ctx.fill(); ctx.stroke();
    { // rotating radar sweep and outgoing pulse rings
      const sw = t * (ready ? 2.0 : 1.1);
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.clip();
      ctx.fillStyle = col;
      for (let i = 0; i < 5; i++) { ctx.globalAlpha = (ready ? 0.3 : 0.2) * (1 - i / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 23, sw - (i + 1) * 0.14, sw - i * 0.14); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(sw) * 23, Math.sin(sw) * 23); ctx.stroke();
      ctx.restore();
      for (let k = 0; k < 2; k++) { const u = (t * 0.6 + k * 0.5) % 1; ctx.globalAlpha = (1 - u) * (ready ? 0.45 : 0.22); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, 24 + u * 30, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
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
    const bw = 10 + Math.sin(t * 3) * 2, bg = lgrad(ctx, 0, -120, 0, -20, rgba(col, 0), rgba(col, ready ? 0.45 : 0.25));
    ctx.fillStyle = bg; ctx.fillRect(-bw, -120, bw * 2, 100);
    ctx.strokeStyle = 'rgba(14,10,20,0.9)'; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 13px ${FONT}`; ctx.lineWidth = 3.4; const label = ready ? 'EXTRACT' : 'EXIT · LOCKED';
    drawIcon(ctx, ready ? 'exit-extraction' : 'lock-locked', -ctx.measureText(label).width / 2 - 8, -36, 13, col);
    ctx.strokeText(label, 4, -36); ctx.fillText(label, 4, -36);
    ctx.restore();
  }

  // ------------------------------------------------------------------ actors
  const DEATH = {
    chaser: {dur: 0.55, whirl: 2.4, tumble: true, hop: 0.2},
    gunner: {dur: 0.6, whirl: 1.0, hop: 0.16, drop: 'gun'},
    guard: {dur: 0.6, whirl: 1.0, hop: 0.16, drop: 'gun'},
    sniper: {dur: 0.75, whirl: 1.5, hop: 0.12, drop: 'gun'},
    brute: {dur: 0.85, whirl: 0.35, hop: 0, buckle: true},
    riot: {dur: 0.7, whirl: 0.5, hop: 0.08, drop: 'shield'},
    elite: {dur: 1.1, whirl: 0.3, hop: 0, buckle: true},
  };

  // Two feet stepping under the body, aligned with the direction of travel. They only poke out past the rim while walking.
  function drawFeet(ang, r, phase, amp, color) {
    if (amp < 0.05) return;
    walkPose(phase, _wp);
    const lat = r * 0.58, reach = r * 0.86 * amp, fr = Math.max(2.1, r * 0.25);
    ctx.save(); ctx.rotate(ang);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1, f = i === 0 ? _wp.a : _wp.b, lift = i === 0 ? _wp.liftA : _wp.liftB, sc = 1 + 0.2 * lift * amp;
      const fx0 = f * reach, fy0 = side * lat;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(fx0, fy0, (fr + 0.9) * 1.25 * sc, (fr + 0.9) * sc, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(fx0, fy0, fr * 1.25 * sc, fr * sc, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawStar(x, y, r, color) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.2, y - r * 0.2); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.2, y + r * 0.2);
    ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.2, y + r * 0.2); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.2, y - r * 0.2); ctx.closePath(); ctx.fill();
  }

  function drawEnemy(e, now) {
    if (e.type === 'boss') { drawBoss(ctx, e, now); return; }
    const v = e.vis ??= {}, kind = kindOf(e), spr = actorSprite(kind), look = ACTOR_LOOK[kind];
    if (!e.alive) { drawCorpse(e, v, kind, spr, look); return; }
    const scale = e.elite ? 0.9 : 1, ang = v.ang || 0, mvAng = v.mvAng ?? ang;
    const windup = e.meleeWindup > 0, windP = windup ? clamp(1 - e.meleeWindup / 0.48, 0, 1) : 0;
    const aimP = e.aimTimer > 0 ? clamp(1 - e.aimTimer / (v.aimMax || 0.5), 0, 1) : 0;
    const amp = v.mv || 0, kick = v.kick || 0, punch = v.punch || 0, lunge = v.lunge || 0, brace = v.brace || 0;
    const alertAge = v.alertT > 0 ? 0.9 - v.alertT : 9;
    ctx.save(); ctx.translate(e.x + (v.fpx || 0), e.y + (v.fpy || 0));
    // body language: rear back on the wind-up, lunge on the strike, lean back while aiming, kick on a shot
    if (windP > 0) { const rb = outCubic(windP) * 4.5; ctx.translate(-Math.cos(ang) * rb, -Math.sin(ang) * rb); }
    if (lunge > 0) { const l = outQuad(lunge) * 7; ctx.translate(Math.cos(ang) * l, Math.sin(ang) * l); }
    if (aimP > 0 && !e.elite) { ctx.translate(-Math.cos(ang) * aimP * 1.2, -Math.sin(ang) * aimP * 1.2); }
    walkPose(v.phase || 0, _wp);
    drawFeet(mvAng, look.r * (e.elite ? 0.8 : 1), v.phase || 0, amp, shade(look.color, 0.5));
    // squash and stretch: along travel while running, bigger on the wind-up, a punch when hit, a hop when alerted
    const bob = 1 + 0.035 * amp * (_wp.bob * 2 - 1), breath = 1 + 0.017 * Math.sin(vis.time * 2.3 + (e.id || 0) * 31) * (1 - amp);
    const hop = alertAge < 0.2 ? 0.12 * Math.sin(alertAge / 0.2 * Math.PI) : 0;
    const wind = 1 + (windup ? 0.1 * outCubic(windP) : 0) + kick * 0.05 + punch * 0.13 + hop - brace * 0.04;
    ctx.scale(scale * wind * bob * breath, scale * wind * bob * breath);
    ctx.save(); ctx.rotate(mvAng); ctx.scale(1 + 0.08 * amp + lunge * 0.14, 1 - 0.05 * amp - lunge * 0.1); ctx.rotate(-mvAng);
    ctx.drawImage(spr.base, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    ctx.restore();
    ctx.save(); ctx.rotate(ang);
    if (e.type === 'chaser' && !e.elite) {
      ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    } else if (e.type === 'riot') {
      ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
      const hc = shade(look.color, 0.7), push = brace * 2.5 - Math.min(3, (e.shieldFlash || 0) * 8);
      drawHand(ctx, 9 + push * 0.4, -7.5, hc, 3); drawHand(ctx, 9 + push * 0.4, 7.5, hc, 3);
    } else {
      const gun = ENEMY_GUNS[e.type];
      if (gun && !e.elite) {
        // low-ready carry that snaps up as the aim tell fills; a reload tips the gun and the off hand dips
        const raise = v.raise || 0, rel = v.rel || 0, yOff = e.type === 'guard' ? 3.5 : 0;
        const tremble = aimP > 0.3 ? Math.sin(vis.time * 46 + (e.id || 0) * 9) * 0.012 * aimP : 0;
        const gunRot = (1 - raise) * 0.42 * (e.side || 1) + rel * 1.15 + tremble - kick * 0.06;
        ctx.save(); ctx.translate(look.r * 0.2 - (1 - raise) * 1.4 - kick * 3, yOff + Math.sin((v.phase || 0) * TAU) * 0.6 * amp); ctx.rotate(gunRot);
        const m = drawGun(ctx, gun, {reach: 3, enemy: true, slide: kick, noMag: rel > 0.3 && rel < 0.95});
        const hc = shade(look.color, 0.7);
        drawHand(ctx, m.rear, 0, hc, 2.3); drawHand(ctx, m.front - rel * 5, 0.6 + rel * 3.5, hc, 2.3);
        if (rel > 0.5 && e.reloadTimer > 0.2) drawMagSprite(ctx, m.front - rel * 5 - 2, 0.6 + rel * 3.5, 0.3, 4.2, 2.4);
        ctx.restore();
        ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
        if (aimP > 0 && e.type === 'sniper') {
          // scope glint: the lens flares and sparkles harder as the lock builds
          const lens = 3 + gun.visual.length * 0.7 * 0.62 + 3, flick = 0.65 + 0.35 * Math.sin(vis.time * 34), g = (0.15 + aimP * aimP * 1.3) * flick + (e.locked ? 0.5 : 0);
          ctx.globalCompositeOperation = 'lighter'; drawStar(lens, yOff, 2 + g * 6, '#fff0f0'); ctx.globalAlpha = 0.6; ctx.drawImage(glowSprite('#ff6a7a'), lens - 8, yOff - 8, 16, 16); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        } else if (aimP > 0.55) {
          const mz = 3 + gun.visual.length * 0.82 + 2; ctx.globalCompositeOperation = 'lighter'; drawStar(mz, yOff, 1.5 + (aimP - 0.55) * 5, '#ffb0a0'); ctx.globalCompositeOperation = 'source-over';
        }
        if (aimP > 0) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#ff4a5e'; ctx.beginPath(); ctx.arc(3 + gun.visual.length * 0.82 + 2, yOff, 1.8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      } else {
        // brute / warden: fists pumping while walking, hauled back on the wind-up, thrown forward on the strike
        const rb = outCubic(windP), fr = e.elite ? 6.6 : 5, fs = e.elite ? 1.35 : 1;
        const pump = Math.sin((v.phase || 0) * TAU) * 3 * amp;
        const rl = windup ? 12 - 7 * rb : 12 + lunge * 14, rr = windup ? 12 - 7 * rb : 12 + lunge * 14;
        const yy = windup ? 9.5 - 3.5 * rb : 9.5 - lunge * 2.5;
        const hot = windup && windP > 0.4 ? mix(shade(look.color, 0.8), '#ff7a3a', windP) : shade(look.color, 0.75);
        ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
        drawHand(ctx, (rl + pump) * fs, -yy * fs - (windup ? 2 * rb : 0), hot, fr + (windup ? rb * 0.8 : 0));
        drawHand(ctx, (rr - pump) * fs, yy * fs + (windup ? 2 * rb : 0), hot, fr + (windup ? rb * 0.8 : 0));
      }
    }
    ctx.restore();
    if (e.type === 'riot') drawRiotShield(e, v, e.shieldAng || 0, false, 1);
    if (v.flash > 0) {
      ctx.globalAlpha = Math.min(1, v.flash * 1.6);
      ctx.drawImage(spr.whiteBase, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
      ctx.save(); ctx.rotate(ang); ctx.drawImage(spr.whiteDetail, -spr.half, -spr.half, spr.half * 2, spr.half * 2); ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (windup) {
      ctx.globalAlpha = windP * 0.5; ctx.fillStyle = '#ff7a3a'; ctx.beginPath(); ctx.arc(0, 0, look.r + 2 + Math.sin(vis.time * 40) * windP, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
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
    if (alertAge < 0.9 && !(e.aimTimer > 0 || windup)) {
      // "!" drops in from above with a bounce and a squash, a ring pops out of it, then it fades
      const u = clamp(alertAge / 0.5), drop = (1 - outBounce(u)) * 10, s = outBack(clamp(alertAge / 0.16), 3), land = alertAge > 0.12 && alertAge < 0.26 ? Math.sin((alertAge - 0.12) / 0.14 * Math.PI) * 0.25 : 0;
      ctx.save(); ctx.translate(e.x, e.y - look.r - 10 - drop); ctx.scale(s * (1 + land), s * (1 - land)); ctx.globalAlpha = Math.min(1, v.alertT * 3.3);
      ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(14,10,20,0.95)'; ctx.fillStyle = '#ffd86e'; ctx.strokeText('!', 0, 0); ctx.fillText('!', 0, 0);
      if (alertAge < 0.3) { ctx.strokeStyle = rgba('#ffd86e', 1 - alertAge / 0.3); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 4 + alertAge * 38, 0, TAU); ctx.stroke(); }
      ctx.restore();
    } else if (e.intent === 'search' && !(e.aimTimer > 0 || windup)) {
      ctx.save(); ctx.translate(e.x, e.y - look.r - 9 + Math.sin(vis.time * 4 + (e.id || 0) * 20) * 0.8); ctx.rotate(Math.sin(vis.time * 3 + (e.id || 0) * 9) * 0.18); ctx.globalAlpha = 0.85; ctx.font = `900 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(14,10,20,0.95)'; ctx.fillStyle = '#9fd0ff'; ctx.strokeText('?', 0, 0); ctx.fillText('?', 0, 0); ctx.restore();
    }
    if (aimP > 0 || windup) {
      // alert tick above the head
      const p = windup ? windP : aimP;
      ctx.save(); ctx.translate(e.x, e.y - look.r - (e.elite ? 12 : 8) - Math.sin(p * 9) * 0.8);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 11, 6.5, 0, TAU); ctx.stroke(); ctx.strokeStyle = windup ? '#ffad57' : '#ff3a50'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, 11, 6.5, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.stroke();
      ctx.fillStyle = windup ? '#ffad57' : '#ff4a5e'; ctx.strokeStyle = 'rgba(14,10,20,0.95)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-3.8, -2.6); ctx.lineTo(3.8, -2.6); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
    }
    void now;
  }

  // Death animation per type, then the body settles into the same pose the baked corpse decal uses (angle + spin*0.3, 0.94 x 0.9).
  function drawCorpse(e, v, kind, spr, look) {
    const D = DEATH[kind] || DEATH.gunner, dt = v.deathT ?? 1, t = clamp(dt / D.dur), spin = v.spin || 0, ang0 = v.ang || 0, sgn = spin < 0 ? -1 : 1;
    const settle = outCubic(t), base = e.elite ? 0.9 : 1;
    const ang = ang0 + spin * 0.3 * settle + sgn * D.whirl * hump(Math.min(1, t * 1.15)) * 0.9;
    let sx = lerp(base, 0.94, settle), sy = lerp(base, 0.9, settle);
    const air = 1 + D.hop * hump(clamp(t * 1.6));
    sx *= air; sy *= air;
    if (D.buckle) { const kneel = hump(clamp(t / 0.5)); sx *= 1 + 0.1 * kneel; sy *= 1 - 0.1 * kneel; }
    if (D.tumble) sy *= 0.45 + 0.55 * Math.abs(Math.cos(t * Math.PI * 3));
    const fxo = v.fpx || 0, fyo = v.fpy || 0;
    ctx.save(); ctx.translate(e.x + fxo, e.y + fyo);
    // dropped gear skids away from the body
    if (D.drop && dt < 9) {
      const fade = e.corpseTimer !== undefined ? clamp(e.corpseTimer / 0.6) : 1, da = v.deathAngle ?? ang0, sl = outCubic(clamp(dt / 0.55));
      if (fade > 0) {
        ctx.save(); ctx.globalAlpha = fade;
        if (D.drop === 'gun' && ENEMY_GUNS[e.type]) {
          const px = Math.cos(ang0) * 6 + Math.cos(da) * 20 * sl + Math.cos(da + 1.57) * 4 * sl * sgn, py = Math.sin(ang0) * 6 + Math.sin(da) * 20 * sl + Math.sin(da + 1.57) * 4 * sl * sgn;
          ctx.translate(px, py - 3 * hump(clamp(dt / 0.3))); ctx.rotate(ang0 + spin * 0.9 * sl + 0.4); drawGun(ctx, ENEMY_GUNS[e.type], {reach: -6, enemy: true});
        } else if (D.drop === 'shield') {
          ctx.translate(Math.cos(da) * 20 * sl, Math.sin(da) * 20 * sl); ctx.rotate(spin * 0.5 * sl); drawRiotShield(e, v, (e.shieldAng || 0), true, 1);
        }
        ctx.restore();
      }
    }
    ctx.rotate(ang); ctx.scale(sx, sy);
    const cs = corpseSprite(kind);
    if (t < 1) {
      ctx.drawImage(spr.base, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
      ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
      ctx.globalAlpha = outQuad(t); ctx.drawImage(cs.img, -cs.half, -cs.half, cs.half * 2, cs.half * 2); ctx.globalAlpha = 1;
      if (v.flash > 0) { ctx.globalAlpha = Math.min(1, v.flash * 1.6); ctx.drawImage(spr.whiteBase, -spr.half, -spr.half, spr.half * 2, spr.half * 2); ctx.drawImage(spr.whiteDetail, -spr.half, -spr.half, spr.half * 2, spr.half * 2); ctx.globalAlpha = 1; }
    } else ctx.drawImage(cs.img, -cs.half, -cs.half, cs.half * 2, cs.half * 2);
    ctx.restore();
  }

  // RIOT shield: a curved steel plate on the side that blocks (e.shieldAng is the same angle the block test uses).
  // braced shields push out and shiver on a block; `loose` draws it as a dropped piece lying flat.
  function drawRiotShield(e, v, a, loose, alpha) {
    const down = e.stun > 0.35, flash = e.shieldFlash || 0, brace = v.brace || 0;
    ctx.save(); ctx.rotate(a + (flash > 0 && !loose ? Math.sin(vis.time * 70) * flash * 0.16 : 0)); if (down || alpha < 1) ctx.globalAlpha = down ? 0.45 : alpha;
    const R = loose ? 9 : (down ? 11 : 15.5 + brace * 2.4 - Math.min(2.5, flash * 9)), half = 1.12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 8.2; ctx.beginPath(); ctx.arc(0, 0, R, -half, half); ctx.stroke();
    ctx.strokeStyle = flash > 0 ? mix('#9fb6c8', '#ffffff', clamp(flash * 4, 0, 1)) : '#9fb6c8'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, R, -half, half); ctx.stroke();
    ctx.strokeStyle = '#5d7387'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R - 2, -half + 0.05, half - 0.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, R + 1.6, -half * 0.8, -half * 0.1); ctx.stroke();
    ctx.fillStyle = '#ffd36e'; ctx.strokeStyle = INK; ctx.lineWidth = 0.8;
    for (const o of [-0.55, 0, 0.55]) { ctx.save(); ctx.rotate(o); ctx.fillRect(R - 2.4, -1.1, 4.8, 2.2); ctx.restore(); }
    if (flash > 0 && !loose) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(flash * 3, 0, 1); ctx.drawImage(glowSprite('#bfe4ff'), R - 12, -12, 24, 24); drawStar(R + 2, 0, 5 + flash * 14, '#e8f4ff'); }
    ctx.restore();
  }

  function drawSniperLaser(e) {
    const total = e.vis?.aimMax || 1.6, p = clamp(1 - e.aimTimer / total, 0, 1), locked = !!e.locked;
    const dx = e.aim.x, dy = e.aim.y, gun = ENEMY_GUNS.sniper, m = 3 + gun.visual.length * 0.82 + 2;
    const sx = e.x + dx * m, sy = e.y + dy * m, len = rayWall(e.x, e.y, dx, dy, e.def.range), ex = e.x + dx * len, ey = e.y + dy * len;
    const flick = locked ? 1 : 0.55 + 0.45 * Math.sin(vis.time * 22);
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    // wide soft lane so "standing in the lane" is obvious, brighter and narrower once locked
    ctx.strokeStyle = rgba(locked ? '#ff1f3a' : '#ff5a78', locked ? 0.30 : 0.12 + 0.12 * p); ctx.lineWidth = locked ? 16 : 11; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = rgba(locked ? '#ff6a7a' : '#ff8aa0', 0.5 + 0.35 * flick); ctx.lineWidth = locked ? 5 : 3.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = locked ? '#ffffff' : '#ffd0d8'; ctx.globalAlpha = locked ? 1 : 0.8; ctx.lineWidth = locked ? 1.8 : 1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // end marker: a closing reticle while tracking, a hard X once the lock commits
    ctx.strokeStyle = locked ? '#ff2a48' : rgba('#ff8aa0', 0.8); ctx.lineWidth = locked ? 2.4 : 1.6;
    if (locked) { ctx.beginPath(); ctx.moveTo(ex - 6, ey - 6); ctx.lineTo(ex + 6, ey + 6); ctx.moveTo(ex + 6, ey - 6); ctx.lineTo(ex - 6, ey + 6); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(ex, ey, 5 + (1 - p) * 9, 0, TAU); ctx.stroke(); }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = locked ? 0.95 : 0.5 + p * 0.3; ctx.drawImage(glowSprite(locked ? '#ff3050' : '#ff7a90'), sx - 11, sy - 11, 22, 22); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function drawTelegraphs(b) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (e.type === 'boss') { drawBossTelegraph(ctx, e, performance.now() / 1000); continue; }
      if (e.type === 'sniper' && e.aimTimer > 0) { drawSniperLaser(e); continue; }
      if (!inView(e, b, 320)) continue;
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
    const gun = GUNS[state.weaponIndex], ang = Math.atan2(state.aim.y, state.aim.x), bAng = vis.bodyAng, spr = actorSprite('player');
    const reloading = state.reloadTimer > 0, blink = state.invuln > 0 && Math.floor(vis.time * 22) % 2 === 0;
    const kick = vis.kick, sprint = state.sprintBlend || 0, amp = vis.pMv, frac = vis.reloadFrac || 0, flip = Math.abs(ang) > Math.PI / 2 ? -1 : 1;
    trail.draw(ctx, now, '#e9f5ee', 1.5, 0.45);
    if (blink) ctx.globalAlpha = 0.45;
    ctx.save(); ctx.translate(p.x + vis.fl.x, p.y + vis.fl.y);
    ctx.translate(-Math.cos(ang) * kick * 0.8 + state.recoil.x * 0.06, -Math.sin(ang) * kick * 0.8 + state.recoil.y * 0.06);
    walkPose(vis.pPhase, _wp);
    drawFeet(vis.mvAng, 10.5, vis.pPhase, amp, '#1d3a36');
    // body: breathes at rest, bobs and stretches along travel while walking, stretches more when sprinting
    const bob = 1 + 0.032 * amp * (_wp.bob * 2 - 1), breath = 1 + 0.018 * Math.sin(vis.time * 2.4) * (1 - amp), punch = 1 + vis.flashHit * 0.07;
    ctx.save(); ctx.scale(bob * breath * punch, bob * breath * punch);
    ctx.rotate(vis.mvAng); ctx.scale(1 + 0.07 * amp + 0.06 * sprint, 1 - 0.05 * amp - 0.04 * sprint); ctx.rotate(-vis.mvAng);
    ctx.drawImage(spr.base, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    ctx.restore();
    // torso / head layer follows the lagged body angle and leans into a sprint
    ctx.save(); ctx.rotate(bAng); ctx.translate(sprint * 1.6, 0);
    ctx.drawImage(spr.detail, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    ctx.restore();
    // gun layer follows the aim exactly
    ctx.save(); ctx.rotate(ang);
    reloadPose(reloading ? frac : 0, _rp);
    const sw = vis.swapT < 1 ? swapPose(vis.swapT, _sw) : null, rpz = reloading ? _rp : null;
    let tilt = sprint * 0.55 - kick * 0.05 * (kick > 0 ? 1 : 0) + (rpz ? rpz.tilt : 0) * flip * 0 + 0;
    ctx.translate(2 - sprint * 1.5 - (rpz ? rpz.seat * 1.2 : 0), Math.sin(vis.pPhase * TAU) * 0.7 * amp);
    const g0 = (sw && sw.which === 0) ? GUNS[vis.prevGun] || gun : gun;
    ctx.save();
    ctx.rotate((tilt + (rpz ? rpz.tilt : 0) + (sw ? sw.rot : 0)) * flip);
    ctx.translate(-kick * 3.2 + (sw ? sw.dx : 0), 0);
    if (sw) ctx.scale(sw.k, sw.k);
    const m = drawGun(ctx, g0, {reach: 4, slide: kick, rack: rpz ? rpz.rack : 0, noMag: !!rpz && rpz.mag > 0.02});
    const hand = shade('#62e1ad', 0.62);
    const hy = 1.2 + (rpz ? -rpz.hy * 0.9 : 0) + (rpz ? 0 : 0);
    drawHand(ctx, m.rear, 0, hand, 2.8);
    if (rpz && rpz.mag > 0.02) drawMagSprite(ctx, m.front + (rpz ? rpz.hx : 0) - 2, hy, 0.25, 6, 3.4);
    drawHand(ctx, m.front + (rpz ? rpz.hx : 0), hy, hand, 2.8);
    ctx.restore();
    ctx.restore();
    if (state.armor > 0) {
      ctx.strokeStyle = '#7fdcf0'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const n = state.armor, gap = 0.5, spinA = vis.time * 0.15; for (let i = 0; i < n; i++) { const a0 = -Math.PI / 2 + spinA + i * (TAU / n) + gap / 2, a1 = -Math.PI / 2 + spinA + (i + 1) * (TAU / n) - gap / 2; ctx.beginPath(); ctx.arc(0, 0, 13.4, a0, a1); ctx.stroke(); }
    }
    if (vis.flashHit > 0) { ctx.globalAlpha = Math.min(1, vis.flashHit * 1.4); ctx.drawImage(spr.whiteBase, -spr.half, -spr.half, spr.half * 2, spr.half * 2); ctx.globalAlpha = 1; }
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
      const blink = Math.floor(vis.time * (urgent ? 30 : 12)) % 2 === 0, a = grenadeAir(t), lift = 2 + a.z;
      ctx.save(); ctx.translate(t.x, t.y - lift); ctx.rotate(t.vis ? t.vis.rot : 0);
      // squash flat for a moment at every bounce (axes follow the spin, so this reads as a tumble)
      ctx.scale(1 + 0.22 * a.sq, 1 - 0.25 * a.sq);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 3.8, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(-1.2, -1.2, 1.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2530'; ctx.fillRect(-1, -4.6, 2, 2.2);
      ctx.fillStyle = blink ? '#ff4a3a' : '#5a1a18'; ctx.beginPath(); ctx.arc(2, 0.4, 1, 0, TAU); ctx.fill();
      ctx.restore();
      if (a.sq > 0.5) { ctx.fillStyle = 'rgba(190,180,170,0.35)'; ctx.beginPath(); ctx.ellipse(t.x, t.y, 4 + a.sq * 2, 1.6, 0, 0, TAU); ctx.fill(); }
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = blink ? 0.6 : 0.2; ctx.drawImage(glowSprite('#ff6a4a'), t.x - 8, t.y - lift - 8, 16, 16); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawEffects(b) {
    for (const effect of state.effects) {
      if (!inView(effect, b, effect.item.radius + 30)) continue;
      const v = effect.vis ??= {
        puffs: Array.from({length: 16}, (_, i) => { const r = seeded(Math.floor(effect.x * 31 + effect.y * 17 + i * 7)); const a = r() * TAU, d = Math.sqrt(r()); return {a, d, s: 0.45 + r() * 0.55, rot: r() * TAU, sp: (r() - 0.5) * 0.4}; }),
        tongues: Array.from({length: 12}, (_, i) => { const r = seeded(Math.floor(effect.x * 13 + effect.y * 29 + i * 11)); return {a: r() * TAU, d: Math.sqrt(r()) * 0.8, ph: r() * TAU, h: 0.6 + r() * 0.6}; }),
        wx: Math.cos(effect.x * 0.37 + effect.y * 0.11) * 3.2, wy: Math.sin(effect.x * 0.21 + effect.y * 0.43) * 2.2 - 1.2,
      };
      const R = effect.item.radius, el = effect.elapsed, rem = effect.remaining;
      if (effect.id === 'smoke') {
        // billows out fast then keeps churning and drifting downwind; each puff breathes and rises a little
        const grow = outCubic(Math.min(1, el / 0.9)), fade = Math.min(1, rem / 1.2);
        const px = puffSprite('#b9b5c2');
        for (const p of v.puffs) {
          const a = p.a + el * p.sp * 0.5, d = p.d * R * 0.62 * (0.35 + 0.65 * grow), r = R * 0.34 * p.s * (0.45 + 0.55 * grow) * (1 + 0.07 * Math.sin(el * 1.6 + p.rot)), wob = Math.sin(el * 0.9 + p.rot) * 3;
          ctx.globalAlpha = 0.52 * fade; const x = effect.x + Math.cos(a) * d + wob + v.wx * el * 0.9, y = effect.y + Math.sin(a) * d - wob * 0.6 + v.wy * el * 0.9 - Math.min(6, el * 1.2) * p.s;
          ctx.drawImage(px, x - r, y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba('#d8d4e2', 0.12 * fade); ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(effect.x, effect.y, R * 0.92, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      } else if (effect.id === 'incendiary') {
        const fade = Math.min(1, rem / 0.6), pulse = 0.5 + 0.5 * Math.sin(el * 8) + 0.15 * Math.sin(el * 23);
        const g = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, R); g.addColorStop(0, rgba('#ff8a3c', (0.26 + 0.08 * pulse) * fade)); g.addColorStop(0.7, rgba('#ff5a24', 0.14 * fade)); g.addColorStop(1, rgba('#ff5a24', 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(effect.x, effect.y, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba('#ffb060', (0.3 + pulse * 0.2) * fade); ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -el * 12; ctx.beginPath(); ctx.arc(effect.x, effect.y, R * 0.94, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        // flat-shaded flame tongues that lick up and sway, each on its own flicker
        for (const f of v.tongues) {
          const fl = 0.55 + 0.45 * Math.sin(el * 9 + f.ph) * Math.sin(el * 5.3 + f.ph * 1.7), h = (5 + 9 * f.h * fl) * fade, w = 3.2 * (0.7 + 0.3 * fl) * fade, sway = Math.sin(el * 7 + f.ph) * 1.8;
          const fx0 = effect.x + Math.cos(f.a) * f.d * R * 0.82, fy0 = effect.y + Math.sin(f.a) * f.d * R * 0.82;
          ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.moveTo(fx0 - w, fy0); ctx.quadraticCurveTo(fx0 - w * 0.4 + sway, fy0 - h * 0.6, fx0 + sway * 1.6, fy0 - h); ctx.quadraticCurveTo(fx0 + w * 0.4 + sway, fy0 - h * 0.6, fx0 + w, fy0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffc24a'; ctx.beginPath(); ctx.moveTo(fx0 - w * 0.5, fy0); ctx.quadraticCurveTo(fx0 + sway * 0.6, fy0 - h * 0.5, fx0 + sway, fy0 - h * 0.62); ctx.quadraticCurveTo(fx0 + w * 0.2 + sway * 0.6, fy0 - h * 0.4, fx0 + w * 0.5, fy0); ctx.closePath(); ctx.fill();
        }
      } else if (effect.id === 'flash' || effect.id === 'frag') {
        const k = clamp(el / 0.35, 0, 1);
        if (k < 1) { ctx.globalAlpha = (1 - k) * 0.22; ctx.fillStyle = effect.id === 'flash' ? '#fff6c8' : '#ffb877'; ctx.beginPath(); ctx.arc(effect.x, effect.y, R * (0.5 + k * 0.5), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        if (effect.id === 'flash') {
          // a flashbang's white bloom swells past its radius and washes out
          const kb = clamp(el / 0.6, 0, 1), rr = R * (0.45 + kb * 1.0);
          if (kb < 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - kb) * (1 - kb) * 0.7; ctx.drawImage(glowSprite('#fffbe8'), effect.x - rr, effect.y - rr, rr * 2, rr * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        }
      }
    }
  }

  function drawBullets(b) {
    ctx.lineCap = 'round';
    const slowK = 1 + vis.slow * 1.1; // trails stretch while time is thin so a dodge reads
    for (const bl of state.bullets) {
      if (!inView(bl, b, 60)) continue;
      const sp = Math.hypot(bl.vx, bl.vy) || 1, dx = bl.vx / sp, dy = bl.vy / sp;
      if (bl.owner === 'player') {
        const color = bl.color !== undefined ? hexStr(bl.color) : '#ffd17c', born = Math.hypot(bl.x - (bl.ox ?? bl.x), bl.y - (bl.oy ?? bl.y));
        const len = Math.min(clamp(sp * 0.04, 12, 40) * slowK, 6 + born * 1.1);
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
        // Enemy rounds: big hot orbs with a pulsing halo and a fading comet tail. Round + red/white, the opposite of the
        // thin gold streaks the player fires, so they stay readable at 0.18x.
        const sn = bl.style === 'sniper', R = sn ? 4.6 : 3.7, tail = (sn ? 38 : 22) * slowK, pulse = 0.5 + 0.5 * Math.sin(vis.time * 16 + bl.x * 0.05);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const f0 = i / 4, f1 = (i + 1) / 4;
          ctx.strokeStyle = sn ? '#ff7a4a' : '#ff3a52'; ctx.globalAlpha = (1 - f0) * 0.6; ctx.lineWidth = R * 2 * (1 - f0 * 0.65);
          ctx.beginPath(); ctx.moveTo(bl.x - dx * tail * f0, bl.y - dy * tail * f0); ctx.lineTo(bl.x - dx * tail * f1, bl.y - dy * tail * f1); ctx.stroke();
        }
        ctx.globalAlpha = 0.55 + 0.25 * pulse; const gs = (R + 9) * 2; ctx.drawImage(glowSprite(sn ? '#ff8a4a' : '#ff3a52'), bl.x - gs / 2, bl.y - gs / 2, gs, gs);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(14,6,12,0.85)'; ctx.beginPath(); ctx.arc(bl.x, bl.y, R + 1.4, 0, TAU); ctx.fill();
        ctx.fillStyle = sn ? '#ffb070' : '#ff5a68'; ctx.beginPath(); ctx.arc(bl.x, bl.y, R, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff6ec'; ctx.beginPath(); ctx.arc(bl.x - dx * 0.6, bl.y - dy * 0.6, R * 0.52, 0, TAU); ctx.fill();
        if (bl.missed) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bl.x, bl.y, R + 4, 0, TAU); ctx.stroke(); }
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
    vis.motion = clamp(frame.motion ?? 1); vis.flashK = clamp(frame.flash ?? 1);
    vis.reloadFrac = frame.reloadFrac ?? 0; vis.bloom = frame.bloom || 0; vis.exitReady = !!frame.exitReady;
    fx.tick(dt);
    const p = state.player;
    if (!levelReady || !p) { drawAttract(w, h, dt); return; }

    vis.slow = timeFx.step(frame, dt);
    vis.deadT = state.mode === 'dead' ? vis.deadT + dt : 0;
    vis.flicker = Math.sin(now * 17) * 0.5 + Math.sin(now * 29) * 0.5;
    for (const e of state.enemies) if (e.vis) { e.vis.flash = Math.max(0, (e.vis.flash || 0) - dt * 18); e.vis.barT = Math.max(0, (e.vis.barT || 0) - dt); }
    for (const c of state.crates) if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 7);
    vis.flashHit = Math.max(0, (vis.flashHit || 0) - dt * 14); vis.hurtSat = Math.max(0, vis.hurtSat - dt * 2.4);
    // camera
    const look = vis.mouseActive && state.mode === 'play' ? lookAheadOffset(vis.mouseX, vis.mouseY, w, h, 46) : {x: 0, y: 0};
    // a door peek pans the camera through the door; otherwise follow the player
    if (state.peek) followStep(cam, state.peek.focus.x, state.peek.focus.y, dt, 4.2); else followStep(cam, p.x + look.x, p.y + look.y, dt, 6.5);
    const shake = frame.shake || 0, motion = vis.motion;
    // camera punches (kills, hits), sprint pull-out and slow-time push-in all vanish when the shake slider is 0
    if (fx.camPunch > 0) { vis.zoom.x += fx.camPunch; fx.camPunch = 0; }
    stepSpring(vis.zoom, 0, 200, springDamping(200, 0.4), dt); stepSpring(vis.camX, 0, 170, springDamping(170, 0.45), dt); stepSpring(vis.camY, 0, 170, springDamping(170, 0.45), dt);
    vis.zbase = damp(vis.zbase, cameraZoom({sprint: state.sprintBlend || 0, slow: vis.slow, motion}), 4, dt);
    cam.scale = (cam.base || cam.scale) * (vis.zbase + vis.zoom.x * motion);
    const viewCam = {x: cam.x + vis.camX.x + (shake ? (Math.random() * 2 - 1) * shake : 0), y: cam.y + vis.camY.x + (shake ? (Math.random() * 2 - 1) * shake : 0), w, h, scale: cam.scale};
    const b = viewBounds(viewCam, 0), bp = viewBounds(viewCam, 40);
    const sc = viewCam.scale * dpr;
    // decals queued by fx get baked onto the floor
    for (const d of fx.decals) world.stampDecal(d);
    fx.decals.length = 0;
    trail.record(p.x, p.y, now);
    lighting.update(dt, state);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    world.draw(ctx, viewCam, b, dpr);
    world.drawLive(ctx, viewCam, b, dpr, now);
    world.idleBake(p.x, p.y, 4, vis.mvx || 0, vis.mvy || 0);
    ctx.setTransform(sc, 0, 0, sc, (w / 2 - viewCam.x * viewCam.scale) * dpr, (h / 2 - viewCam.y * viewCam.scale) * dpr);
    ctx.lineJoin = 'round';

    fx.drawBelow(ctx, bp);
    drawShadows(bp);
    drawGates(bp);
    doorLayer.draw(ctx, state, bp, vis.time);
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
    lighting.draw(ctx, viewCam, dpr, {px: p.x, py: p.y, lights: fx.lightList().concat(world.lights(b, state.peek ? state.peek.room : state.currentRoom)), flicker: vis.flicker, slow: vis.slow, dead: state.mode === 'dead' ? Math.min(1, vis.deadT * 1.5) : 0, won: state.mode === 'won'});
    ctx.setTransform(sc, 0, 0, sc, (w / 2 - viewCam.x * viewCam.scale) * dpr, (h / 2 - viewCam.y * viewCam.scale) * dpr);
    ctx.lineJoin = 'round';

    drawPickupGlows(bp);
    drawMetaWorld(ctx, state, performance.now() / 1000, TILE);
    drawTelegraphs(bp);
    stealth.draw(ctx, state, bp, vis.time, dt);
    drawBullets(bp);
    fx.drawAdditive(ctx, bp);
    // coloured light flashes (muzzle, blasts) on top of the dark
    ctx.globalCompositeOperation = 'lighter';
    for (const l of fx.lightList()) { if (l.a <= 0.01) continue; ctx.globalAlpha = l.a * 0.32; ctx.drawImage(glowSprite(l.color), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fx.drawFloaters(ctx, viewCam, dpr);
    timeFx.draw(ctx, canvas.width, canvas.height, dpr, vis.flashK ?? 1); // unified time grade + beat tick + edge meter (timefx.js)
    if (vis.hurtSat > 0.02) {
      ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = 0.55 * vis.hurtSat * vis.flashK; ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    affordances.draw(ctx, state, viewCam, dpr, dt, vis.exitReady);
    {
      const hi = state.hitIndicators ?? (state.hitIndicators = []);
      ageHitIndicators(hi, dt);
      const cw = viewCam.w, ch = viewCam.h;
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (state.mode === 'play') {
        const threats = [];
        for (const e of state.enemies) {
          if (!e.alive || !(e.aimTimer > 0 || e.meleeWindup > 0)) continue;
          threats.push({x: e.x, y: e.y, p: e.meleeWindup > 0 ? 1 - e.meleeWindup / 0.48 : clamp(1 - e.aimTimer / (e.vis?.aimMax || 0.5), 0, 1), locked: !!e.locked});
        }
        drawOffscreenThreats(ctx, viewCam, threats, vis.time);
      }
      drawDamageArcs(ctx, cw, ch, hi);
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawCrosshair(dpr);
    const ms = performance.now() - t0;
    stats.drawMs = stats.drawMs * 0.9 + ms * 0.1; stats.frames++; stats.bakeMs = world.bakeMs;
  }

  function hurtFlash() { vis.flashHit = 1; }

  resize();
  window.addEventListener('resize', resize);
  return {canvas, fx, timeFx, world, lighting, stats, vis, resize, setLevel, screenToWorld, update, render, shot, consume, hurtFlash, cam};
}

function hexPath(ctx, r) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
function rrectPath(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
void ENEMY_TYPES;
