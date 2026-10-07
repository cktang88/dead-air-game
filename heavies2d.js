// WARDEN / MARKSMAN / RIOT on the humanoid rig: type-specific poses (brace, bolt cycle, pump rack, shield, strips,
// banners), their death topple + lying corpse, idle fidgets, and the one-call renderer glue (drawHeavy / drawHeavyCorpse).
// The arms, grips and gun placement come from rig2d.humanoidPose; everything here is data fed into it (gunRot, gunDx,
// handDx/handDy, lunge, kick, hurt, sprint) plus offsets applied to parts afterwards.
import {STACK_CONFIG, STACK_TILT} from './stack2d.js';
import {humanoidPose, newRigOut, drawRig, registerIdleFidget, sortItems, fidgetAt, reloadPose, RIG, DEAD_VARIANT} from './rig2d.js';
import {heavyKit, heavyGun, riotBaton, riotShield, riotShieldFlat, HEAVY_TYPES} from './heavy-models2d.js';
import {clamp, lerp, outCubic, TAU, angDiff, smoothstep} from './anim.js';
import {ACTOR_LOOK, corpseOverrides, corpseSprite, glowSprite, makeCanvas} from './sprites2d.js';

const HEAVY = new Set(HEAVY_TYPES);
/** True when this enemy is drawn by the heavy stacked renderer (honours STACK_CONFIG.enabled / ?stack=0). */
export const isHeavy = (e) => STACK_CONFIG.enabled && HEAVY.has(e.type) && STACK_CONFIG.kinds.has(e.type);
export const ELITE_SCALE = 1.2;   // drawn on top of the renderer's 0.9 elite scale: net 1.08

// the stacked bodies stand taller than the legacy discs: lift the anchors for bars / glyphs a little
if (STACK_CONFIG.enabled) { ACTOR_LOOK.sniper.r = 12; ACTOR_LOOK.guard.r = 14; ACTOR_LOOK.riot.r = 14; }

const GUN_DESC = {guard: 38, sniper: 64};
/** Distance from the actor to the muzzle (the telegraph / laser origin): gunMuzzle(gun) scaled for elites. */
export const heavyMuzzle = (e) => (5 + (GUN_DESC[e.type] || 0) * 0.7) * (e.elite ? 1.08 : 1);

const DUR = {guard: 0.75, sniper: 0.9, riot: 0.85};
const FALL = {guard: Math.PI, sniper: Math.PI - 0.55, riot: 0};   // which way the body drops, relative to its facing

// ---------------------------------------------------------------- shared helpers
function addItem(out, model, x, y, z, yaw, sx = 1, sy = 1, flash = 0, bias = 0) {
  const it = out.items[out.n++];
  it.model = model; it.x = x; it.y = y; it.z = z; it.yaw = yaw; it.sx = sx; it.sy = sy; it.flash = flash; it.draw = null;
  it.key = y + z * 0.03 + bias;
  return it;
}
const findItem = (out, model) => { for (let i = 0; i < out.n; i++) if (out.items[i].model === model) return out.items[i]; return null; };
function dropAntenna(out) {
  for (let i = 0; i < out.n; i++) {
    const it = out.items[i];
    if (it.draw && !it.model) { const last = out.items[out.n - 1]; out.items[i] = last; out.items[out.n - 1] = it; out.n--; return null; }
  }
  return null;
}
const antennaItem = (out) => { for (let i = 0; i < out.n; i++) if (out.items[i].draw && !out.items[i].model) return out.items[i]; return null; };
/** Moves every part except the legs (the upper body) by (dx, dy, dz); sort keys follow. */
function shiftUpper(out, kit, dx, dy, dz) {
  if (!dx && !dy && !dz) return;
  for (let i = 0; i < out.n; i++) { const it = out.items[i]; if (it.model === kit.leg) continue; it.x += dx; it.y += dy; it.z += dz; it.key += dy + dz * 0.03; }
}
function shiftLegs(out, kit, fwd, spread, yaw) {
  const cb = Math.cos(yaw), sb = Math.sin(yaw);
  for (let i = 0; i < out.n; i++) {
    const it = out.items[i]; if (it.model !== kit.leg) continue;
    const lat = -sb * it.x + cb * it.y, side = lat < 0 ? -1 : 1, f = fwd * side;
    it.x += cb * f - sb * side * spread; it.y += sb * f + cb * side * spread; it.key = it.y + it.z * 0.03;
  }
}

// ---------------------------------------------------------------- idle fidgets (hang more on registerIdleFidget)
registerIdleFidget({id: 'w-neckroll', only: ['guard'], dur: 2.2, apply(p, u) { const s = Math.sin(u * TAU); p.headYaw += 0.5 * s; p.headZ += 0.25 * Math.sin(u * Math.PI); p.torsoYaw += 0.04 * s; }});
registerIdleFidget({id: 'w-settle', only: ['guard'], dur: 1.4, apply(p, u) { const h = Math.sin(u * Math.PI); p.torsoZ += 0.7 * h; p.headZ += 0.5 * h; p.leanX += 0.6 * Math.sin(u * TAU * 2) * (1 - u); p.shrug = h; }});
registerIdleFidget({id: 'w-visor', only: ['guard'], dur: 1.6, apply(p, u) { const h = Math.sin(u * Math.PI); p.headYaw += 0.35 * Math.sin(u * TAU * 2) * h; p.leanX -= 0.5 * h; }});
registerIdleFidget({id: 's-scan', only: ['sniper'], dur: 3.4, apply(p, u) { p.headYaw += 0.95 * Math.sin(u * TAU) * Math.sin(u * Math.PI) ** 0.5; p.torsoYaw += 0.1 * Math.sin(u * TAU); }});
registerIdleFidget({id: 's-lens', only: ['sniper'], dur: 1.8, apply(p, u) { const h = Math.sin(u * Math.PI); p.headYaw += 0.2 * h; p.headZ -= 0.35 * h; p.leanX += 0.7 * h; }});
registerIdleFidget({id: 's-hood', only: ['sniper'], dur: 1.3, apply(p, u) { const h = Math.sin(u * Math.PI); p.shrug = h; p.headZ += 0.6 * h; p.headYaw -= 0.35 * Math.sin(u * TAU * 1.5) * h; }});
registerIdleFidget({id: 'r-neckcrack', only: ['riot'], dur: 1.5, apply(p, u) { const s = u < 0.35 ? u / 0.35 : u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.3); p.headYaw += 0.55 * s; p.headZ += 0.2 * s; p.shrug = s * 0.6; }});
registerIdleFidget({id: 'r-tap', only: ['riot'], dur: 2.0, apply(p, u) { p.leanX += 0.4 * Math.max(0, Math.sin(u * TAU * 3)); p.headYaw += 0.12 * Math.sin(u * TAU * 3); }});
registerIdleFidget({id: 'r-bang', only: ['riot'], dur: 1.2, apply(p, u) { const h = u < 0.3 ? u / 0.3 : Math.max(0, 1 - (u - 0.3) / 0.2); p.leanX += 0.9 * h; p.torsoZ -= 0.3 * h; }});

// ---------------------------------------------------------------- the pose
const _out = newRigOut(), _out2 = newRigOut();
const _inp = {};
function noteShot(v, t) { const k = v.kick || 0; if (k > (v.hvK || 0) + 0.2 || (k > 0.85 && !(v.hvShotAt > t - 0.2))) v.hvShotAt = t; v.hvK = k; }
const seq = (x, a, b) => clamp((x - a) / (b - a));

/** Everything drawHeavy derives from the enemy / its vis state. Pure; exported for the sheet and tests. */
const type0 = (e) => e.type;
const _rp = {};
export function heavyState(e, v, t) {
  const aimP = e.aimTimer > 0 ? clamp(1 - e.aimTimer / (v.aimMax || 0.5)) : 0;
  const windP = e.meleeWindup > 0 ? clamp(1 - e.meleeWindup / 0.48) : 0;
  const alertAge = v.alertT > 0 ? 0.9 - v.alertT : 9;
  return {
    aimP, windP, windup: e.meleeWindup > 0, alertK: alertAge < 0.32 ? Math.sin(alertAge / 0.32 * Math.PI) : 0, alertAge,
    ang: v.ang || 0, mvAng: v.mvAng ?? (v.ang || 0), amp: v.mv || 0, phase: v.phase || 0, kick: v.kick || 0, lunge: v.lunge || 0, brace: v.brace || 0,
    hurt: Math.max(v.punch || 0, (v.flash || 0) * 0.7), flash: Math.min(1, (v.flash || 0) * 1.6), idleT: e.aware ? 0 : v.idleT || 0, raise: v.raise || 0, rel: v.rel || 0,
    speed: v.speed || 0, shotT: t - (v.hvShotAt ?? -9), t,
    reloadFrac: e.reloadTimer > 0 ? clamp(1 - e.reloadTimer / (type0(e) === 'guard' ? 2.05 : 2.8), 0.001, 1) : 0,
  };
}

function setBase(inp, e, s, kit) {
  inp.id = e.id || 0; inp.t = s.t; inp.kind = e.type; inp.bodyYaw = s.ang; inp.moveYaw = s.mvAng; inp.amp = s.amp; inp.phase = s.phase;
  inp.hurt = s.hurt; inp.flash = s.flash; inp.idleT = s.idleT; inp.sprint = 0; inp.kick = s.kick; inp.lunge = 0; inp.magModel = null; inp.mag = 0;
  inp.gunRot = 0; inp.reloadFrac = 0; inp.oneHand = 0; inp.gunDx = 0; inp.gunLift = 0; inp.handDx = 0; inp.handDy = 0; inp.antennaX = 0; inp.antennaY = 0; inp.dead = null; void kit;
}

/** Fills `out` with this frame's parts for the heavy enemy `e`; returns {gun, lens} extras for the renderer. */
export function heavyPose(e, v, t, out, info = {}) {
  const type = e.type, elite = !!e.elite, kit = heavyKit(type, elite), s = heavyState(e, v, t), inp = _inp;
  noteShot(v, t);
  s.shotT = t - (v.hvShotAt ?? -9);
  setBase(inp, e, s, kit);
  inp.antennaX = v.antX || 0; inp.antennaY = v.antY || 0;
  const cb = Math.cos(s.ang), sb = Math.sin(s.ang);
  const stagger = e.stun > 0.35 ? 1 : 0;
  let dz = 0, dx = 0, dy = 0, legSpread = 0, legFwd = 0;
  const gunDef = type === 'riot' ? riotBaton(elite) : heavyGun(type, elite);
  info.gun = gunDef; info.lensK = 0; info.pumpS = 0;
  const rp = s.reloadFrac > 0 && type !== 'riot' ? reloadPose(s.reloadFrac, _rp) : null;
  inp.reloadFrac = rp ? s.reloadFrac : 0;
  const walkSway = Math.sin(s.phase * TAU) * s.amp;
  const tremble = s.aimP > 0.3 ? Math.sin(t * 46 + (e.id || 0) * 9) * 0.012 * s.aimP : 0;

  if (type === 'guard') {
    // heavy: weight shifts onto the planted foot with every step; braces (crouch, feet wide, lean in) while the aim tell fills
    const brace = s.aimP;
    inp.amp = s.amp * 0.9;
    inp.gunRot = (1 - s.raise) * 0.3 * (e.side || 1) + tremble - s.kick * 0.05 + (rp ? rp.tilt * (e.side || 1) : 0);
    inp.gunDx = 0.1 - (1 - s.raise) * 1.2 - brace * 0.6;
    inp.lunge = brace * 0.28 + s.alertK * 0.1;
    const pump = s.shotT > 0.16 && s.shotT < 0.62 ? (s.shotT < 0.34 ? outCubic(seq(s.shotT, 0.16, 0.34)) : s.shotT < 0.42 ? 1 : 1 - smoothstep(seq(s.shotT, 0.42, 0.6))) : 0;
    info.pumpS = pump;
    inp.handDx = -pump * 4.2; inp.handDy = 0;
    inp.gunModel = gunDef.body; inp.gunGeo = gunDef.geo;
    dx = -sb * walkSway * 0.95; dy = cb * walkSway * 0.95; dz = -brace * 1.1 - 0.35 * Math.abs(Math.sin(s.phase * TAU * 1)) * s.amp + s.alertK * 0.7 - stagger * 0.5;
    legSpread = brace * 1.1; legFwd = brace * 0.8;
  } else if (type === 'sniper') {
    const brace = s.aimP, sprint = clamp((s.speed - 55) / 55);
    inp.sprint = sprint;
    inp.gunRot = (1 - s.raise) * 0.4 * (e.side || 1) + tremble * (1 - brace * 0.7) - s.kick * 0.05 + sprint * 0.5 + (rp ? rp.tilt * (e.side || 1) : 0);
    inp.gunDx = 0.1 - (1 - s.raise) * 1.4 - brace * 0.8;
    inp.lunge = brace * 0.55 + s.alertK * 0.05;
    inp.gunModel = gunDef.body; inp.gunGeo = gunDef.geo;
    dz = -brace * 2.0 + s.alertK * 0.3; legSpread = brace * 1.5; legFwd = brace * 1.3;
    info.lensK = clamp(brace * brace * 1.1 + (e.locked ? 0.6 : 0) + s.alertK * 0.35);
  } else {
    // riot: squat; the baton is the "gun" in the right fist, the shield is its own part braced out front
    const wind = s.windup ? s.windP : 0, strike = s.lunge;
    const fid = fidgetAt(s.idleT, e.id || 0, 'riot');
    inp.gunModel = gunDef.body; inp.gunGeo = gunDef.geo;
    inp.lunge = strike * 1.1 - wind * 0.45 + s.brace * 0.25 - stagger * 0.55 + s.alertK * 0.1;
    inp.gunDx = -wind * 3.2 + strike * 6.5 + s.brace * 0.8 + (fid && fid.fidget.id === 'r-tap' ? Math.max(0, Math.sin(fid.u * TAU * 3)) * 1.2 : 0);
    inp.gunLift = wind * 4.5 - strike * 1.4;
    inp.gunRot = -wind * 0.9 + strike * 0.6 + s.alertK * 0.5 * Math.sin(t * 40);
    inp.hurt = Math.max(s.hurt, stagger * 0.65);
    inp.kick = Math.max(s.kick, clamp((e.shieldFlash || 0) * 3.2) * 0.7);
    dz = -s.brace * 1.0 - wind * 0.4 - stagger * 0.8; dx = -sb * walkSway * 0.5; dy = cb * walkSway * 0.5;
    legSpread = s.brace * 0.9 + stagger * 0.8; legFwd = s.brace * 0.6;
  }
  const baseAim = type === 'riot' ? s.ang + 0.5 * (1 - Math.min(1, s.lunge * 1.4)) * (1 - (s.windup ? s.windP * 0.5 : 0)) : s.ang;
  inp.aimYaw = baseAim;

  // ---- riot support hand: pass 1 (rest), then ask the support hand to sit on the shield grip (offset in gun space)
  humanoidPose(kit, inp, out);
  if (type === 'riot') {
    const sa = e.shieldAng ?? s.ang, down = stagger, fl = e.shieldFlash || 0;
    const dist = (9.5 + s.brace * 2.1 - Math.min(2.8, fl * 9.5) - down * 3.2);
    const gripD = dist - 4.2, gx = Math.cos(sa) * gripD - Math.sin(sa) * 3.2 * 0, gy = Math.sin(sa) * gripD;
    const ddx = gx - out.handL.x, ddy = gy - out.handL.y, gy2 = baseAim + inp.gunRot;
    inp.handDx += ddx * Math.cos(gy2) + ddy * Math.sin(gy2); inp.handDy += -ddx * Math.sin(gy2) + ddy * Math.cos(gy2);
    humanoidPose(kit, inp, out);
    shiftUpper(out, kit, dx, dy, dz); shiftLegs(out, kit, legFwd, legSpread, s.ang);
    const crack = Math.min(3, v.cracks || 0), sh = riotShield(crack, elite);
    const wob = fl > 0 ? Math.sin(t * 70) * fl * 0.16 : 0;
    const sz = 1.0 - down * 3.8 + s.alertK * 0.3, yawS = sa + wob + down * 0.5 * (e.side || 1);
    const hop = fl > 0 ? -fl * 1.5 : 0;
    addItem(out, sh, Math.cos(sa) * (dist + hop) + dx, Math.sin(sa) * (dist + hop) + dy, sz + dz * 0.5, yawS, 1, 1, Math.max(s.flash, clamp(fl * 4) * 0.55), 0.2);
    info.shieldYaw = yawS;
  } else {
    shiftUpper(out, kit, dx, dy, dz); shiftLegs(out, kit, legFwd, legSpread, s.ang);
  }
  // ---- type extras that ride the gun item
  const g = findItem(out, gunDef.body);
  if (type === 'guard' && g && gunDef.aux) {
    const slide = -info.pumpS * 4.2, ca = Math.cos(g.yaw), sa2 = Math.sin(g.yaw), ox = gunDef.L * 0.38 + slide;
    addItem(out, gunDef.aux, g.x + ca * ox, g.y + sa2 * ox, g.z + gunDef.auxZ, g.yaw, 1, 1, s.flash, 0.06);
  }
  if (type === 'sniper' && g && gunDef.aux) {
    const b = s.shotT, lift = b > 0.25 && b < 0.95 ? (b < 0.4 ? smoothstep(seq(b, 0.25, 0.4)) : b < 0.8 ? 1 : 1 - smoothstep(seq(b, 0.8, 0.95))) : 0;
    const back = b > 0.4 && b < 0.82 ? (b < 0.58 ? smoothstep(seq(b, 0.4, 0.58)) : b < 0.66 ? 1 : 1 - smoothstep(seq(b, 0.66, 0.82))) : 0;
    const ca = Math.cos(g.yaw), sa2 = Math.sin(g.yaw), ox = gunDef.L * 0.2 - back * 3.4;
    addItem(out, gunDef.aux, g.x + ca * ox, g.y + sa2 * ox, g.z + gunDef.auxZ + lift * 0.9, g.yaw + lift * 0.0, 1, 1, s.flash, 0.06);
    info.boltK = Math.max(lift, back);
  }
  // ---- ghillie strips: long cloth streamers off the shoulders and coat tail that sway and stream
  if (type === 'sniper') {
    const tor = findItem(out, kit.torso);
    if (tor) {
      const tc = Math.cos(tor.yaw), ts = Math.sin(tor.yaw), W = [[-3.6, -5.6, 10.6], [-4.4, -2, 11.2], [-4.4, 2.2, 11.0], [-3.6, 5.6, 10.4], [-4.6, -3.6, 3.6], [-4.6, 3.6, 3.6]];
      const ax = v.antX || 0, ay = v.antY || 0;
      for (let i = 0; i < W.length; i++) {
        const [f, r, z] = W[i], base = tor.yaw + Math.PI + (i < 4 ? (i - 1.5) * 0.28 : (i === 4 ? -0.42 : 0.42)) + Math.sin(t * 1.9 + i * 1.7 + (e.id || 0)) * 0.13 + s.amp * Math.sin(t * 9 + i * 2.1) * 0.12;
        const wx = Math.cos(base) + ax * 0.5, wy = Math.sin(base) + ay * 0.5, yaw = Math.atan2(wy, wx);
        const px = tor.x + tc * f - ts * r, py = tor.y + ts * f + tc * r, pz = tor.z + z * 0.8 - 0.4 * 0 - s.amp * 0.7 - (i >= 4 ? 4 : 0);
        addItem(out, kit.strip, px, py, pz - (i >= 4 ? 0 : 0) , yaw, 1 + s.amp * 0.45 + (i >= 4 ? 0.15 : 0), 1, s.flash, i >= 4 ? -0.1 : -0.25);
      }
    }
  }
  // ---- antenna slot: the radio antenna is a gunner thing; elites fly a banner from it, others lose it
  const ant = antennaItem(out);
  if (ant) {
    if (!elite) dropAntenna(out);
    else { ant.draw = BANNER[type]; ant.a = (v.antX || 0) * 1.6 + Math.sin(t * 2.2) * 0.5; ant.b = 0; ant.z += 0; }
  }
  sortItems(out);
  info.s = s; info.kit = kit;
  return out;
}

// ---------------------------------------------------------------- elite banner / pennant (replaces the antenna)
function bannerFn(c1, c2, h, w) {
  return (ctx, x, y, it) => {
    const tip = h * STACK_TILT, sway = it.a * 1.4, tx = x + sway * 0.6, ty = y - tip, ph = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#120f18'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sway * 0.2, y - tip * 0.5, tx, ty); ctx.stroke();
    ctx.strokeStyle = '#a9a7b4'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sway * 0.2, y - tip * 0.5, tx, ty); ctx.stroke();
    const dir = it.a >= 0 ? 1 : -1, n = 6;
    // pennant: a strip of 6 quads that ripples
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const u = i / n, px = tx + dir * (u * w) + sway * u * 0.5, py = ty + 0.5 + Math.sin(ph * 7 + u * 4) * 1.1 * u + u * 1.0 - (1 - u) * 0; ctx.lineTo(px, py + (pass ? 0 : 0)); }
      for (let i = n; i >= 0; i--) { const u = i / n, px = tx + dir * (u * w * (1 - 0.02)) + sway * u * 0.5, py = ty + 0.5 + Math.sin(ph * 7 + u * 4) * 1.1 * u + (1 - u * 0.75) * 4.4; ctx.lineTo(px, py); }
      ctx.closePath();
      if (pass === 0) { ctx.fillStyle = '#120f18'; ctx.lineWidth = 2; ctx.strokeStyle = '#120f18'; ctx.stroke(); ctx.fill(); }
      else { ctx.fillStyle = c1; ctx.fill(); }
    }
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(tx + dir * 2.2, ty + 1.6, 0.9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#120f18'; ctx.beginPath(); ctx.arc(tx, ty, 1.5, 0, TAU); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(tx, ty, 0.8, 0, TAU); ctx.fill();
    ctx.restore();
  };
}
const BANNER = {guard: bannerFn('#ffb43a', '#fff2c0', 17, 8.5), sniper: bannerFn('#ffcf5a', '#fffbe0', 20, 7), riot: bannerFn('#ff8a3a', '#ffe9c0', 15, 9)};

// ---------------------------------------------------------------- drawing
function glint(ctx, x, y, r, a, col = '#e8fcff') {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.16, y - r * 0.16); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.16, y + r * 0.16); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.16, y + r * 0.16); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.16, y - r * 0.16); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/**
 * Draws a living heavy enemy at the origin of ctx (the caller translated to the enemy and un-rotated). `variant` = floor tint.
 * Also the type extras that are not stacks: scope glints, visor glow, the aim dot at the muzzle.
 */
export function drawHeavy(ctx, e, v, t, variant) {
  const out = _out, info = {};
  heavyPose(e, v, t, out, info);
  const kit = info.kit, s = info.s, es = e.elite ? ELITE_SCALE : 1;
  if (v.hvFl === undefined) v.hvFl = 0;
  if (e.type === 'riot') { const f = e.shieldFlash || 0; if (f > v.hvFl + 0.08) v.cracks = Math.min(3, (v.cracks || 0) + 1); v.hvFl = f; }
  ctx.save(); if (es !== 1) ctx.scale(es, es);
  drawRig(ctx, out, 0, 0, {variant});
  // lights that are not voxels
  const head = findItem(out, kit.head), az = RIG.anchorZ;
  if (head) {
    const hc = Math.cos(head.yaw), hs = Math.sin(head.yaw);
    if (e.type === 'sniper') {
      const lx = head.x + hc * 4.6, ly = head.y + hs * 4.6 - (head.z + 4.2 - az) * STACK_TILT;
      const idle = Math.max(0, Math.sin(t * 2.1 + (e.id || 0) * 17)) ** 8, flick = 0.65 + 0.35 * Math.sin(t * 34);
      const a = info.lensK > 0 ? (0.25 + info.lensK) * flick : idle * 0.9;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 + (info.lensK > 0 ? 0.5 * info.lensK : 0.12); ctx.drawImage(glowSprite('#7ff8ee'), lx - 5, ly - 5, 10, 10); ctx.restore();
      if (a > 0.05) glint(ctx, lx, ly, 1.5 + a * 3.6, a);
    } else if (e.type === 'guard') {
      const lx = head.x + hc * 4.9, ly = head.y + hs * 4.9 - (head.z + 3.6 - az) * STACK_TILT, pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + (e.id || 0));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 + 0.1 * pulse + s.aimP * 0.45; ctx.drawImage(glowSprite(s.aimP > 0.4 ? '#ff6a5a' : '#6fe9f2'), lx - 6, ly - 4, 12, 8); ctx.restore();
    }
  }
  if (s.aimP > 0 && info.gun) {
    // the same aim dot + flare the legacy art had, at the true muzzle
    const mx = out.muzzleX, my = out.muzzleY;
    ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = '#ff4a5e'; ctx.beginPath(); ctx.arc(mx, my, 1.7, 0, TAU); ctx.fill(); ctx.restore();
    if (e.type === 'sniper') { const flick = 0.65 + 0.35 * Math.sin(t * 34), g = (0.15 + s.aimP * s.aimP * 1.3) * flick + (e.locked ? 0.5 : 0); glint(ctx, mx - 3, my, 2 + g * 6, 0.9, '#fff0f0'); }
    else if (s.aimP > 0.55) glint(ctx, mx, my, 1.5 + (s.aimP - 0.55) * 5, 0.9, '#ffb0a0');
  }
  ctx.restore();
}

// ---------------------------------------------------------------- death + corpse
const _dead = newRigOut();
/**
 * The topple + lying pose. k 0..1 (fall progress), bodyYaw facing, the body drops towards bodyYaw + FALL[type]. Heights
 * are real: parts swing about the feet (position along the fall axis = height * sin(theta), z = height * cos(theta))
 * and the whole figure slides back so the finished corpse is centred on the ground point. gearK 0..1 throws gear out.
 */
export function deadRig(type, elite, k, bodyYaw, spin, out, flash = 0) {
  out.n = 0;
  const kit = heavyKit(type, elite), fy = bodyYaw + FALL[type], f = [Math.cos(fy), Math.sin(fy)], p = [-f[1], f[0]];
  const th = Math.min(Math.PI / 2, 1.9 * (1 - (1 - k) ** 3)), sn = Math.sin(th), cs = Math.cos(th), slide = -9.5 * smoothstep(k);
  const sp = (spin || 0) * 0.45 * k, kg = smoothstep(clamp(k * 1.6));
  const place = (zc, lat, rest) => [f[0] * (zc * sn + slide) + p[0] * lat, f[1] * (zc * sn + slide) + p[1] * lat, Math.max(rest, zc * cs + rest * sn)];
  const side = type === 'riot' ? 0.45 : 1;
  for (const sd of [-1, 1]) {
    const [x, y, z] = place(3.6, sd * RIG.legY * (1 + 0.5 * k), 0.7);
    const bend = type === 'sniper' && sd > 0 ? 0.65 * k : 0;
    addItem(out, kit.leg, x, y, z, fy + Math.PI + sd * (0.16 + 0.14 * k) * (type === 'riot' ? 0.5 : 1) + bend + sp * 0.4, 1, 1, flash);
  }
  const tp = place(11, 0, type === 'guard' ? 1.6 : 1.2);
  const tor = addItem(out, kit.torso, tp[0], tp[1], tp[2], bodyYaw + sp, 1 + 0.08 * k, 1 - 0.06 * k, flash);
  const hp = place(20.2, 0, 1.3);
  addItem(out, kit.head, hp[0] + p[0] * 0.8 * k * (type === 'sniper' ? 1 : 0.3), hp[1] + p[1] * 0.8 * k * (type === 'sniper' ? 1 : 0.3), hp[2], bodyYaw + sp * 1.5 + (type === 'sniper' ? 0.5 * k : 0), 1, 1, flash);
  // arms: bones fan out from the shoulders; foreshortened while the body is still upright
  for (const sd of [-1, 1]) {
    const sh = place(14.2, sd * RIG.shoulder.y, 1.5), spread = (type === 'riot' ? 0.5 : type === 'guard' ? 1.25 : 1.0) * k;
    const a1 = fy + sd * (side * 0.35 + spread) + (type === 'sniper' && sd < 0 ? -0.5 * k : 0), fs = 0.28 + 0.72 * sn;
    const e1x = sh[0] + Math.cos(a1) * 6.4 * fs, e1y = sh[1] + Math.sin(a1) * 6.4 * fs, a2 = a1 + sd * 0.5 * k;
    addItem(out, kit.arm, sh[0], sh[1], Math.max(1.0, sh[2] - 0.4), a1 + sp, fs, 1, flash);
    addItem(out, kit.arm, e1x, e1y, Math.max(0.9, sh[2] - 1.2 * cs), a2 + sp, fs, 1, flash);
    addItem(out, sd > 0 ? kit.gloveR : kit.gloveL, e1x + Math.cos(a2) * 6.4 * fs, e1y + Math.sin(a2) * 6.4 * fs, Math.max(0.8, sh[2] - 1.6 * cs), a2, 1, 1, flash);
  }
  // gear: thrown from the hands to rest beside the body
  const at = (x0, y0, x1, y1) => [lerp(x0, x1, kg), lerp(y0, y1, kg)];
  const hx = Math.cos(bodyYaw) * 6, hy = Math.sin(bodyYaw) * 6;
  if (type === 'riot') {
    const sh = riotShieldFlat(0, elite), [x, y] = at(Math.cos(bodyYaw) * 10, Math.sin(bodyYaw) * 10, p[0] * 15 + f[0] * 2, p[1] * 15 + f[1] * 2);
    addItem(out, sh, x, y, lerp(8, 0.4, kg), bodyYaw + 1.57 + (spin || 0) * 0.35 * kg, 1, 1, flash, -3);
    const bt = riotBaton(elite), [bx, by] = at(hx, hy, -p[0] * 12 - f[0] * 3, -p[1] * 12 - f[1] * 3);
    addItem(out, bt.body, bx, by, lerp(9.4, 0.5, kg), bodyYaw + 1.9 * kg, 1, 1, flash, 1);
  } else {
    const gd = heavyGun(type, elite), [x, y] = at(hx, hy, p[0] * 13 - f[0] * 5, p[1] * 13 - f[1] * 5);
    addItem(out, gd.body, x, y, lerp(RIG.gunBaseZ, 0.4, kg), bodyYaw + (type === 'sniper' ? 1.3 : 0.5) * kg + 0.3 * (1 - kg), 1, 1, flash, 2);
  }
  void tor;
  sortItems(out);
  return out;
}

// the flat baked corpse the decal system stamps: the final pose at yaw 0 with the gear lying beside it
for (const type of HEAVY_TYPES) {
  for (const elite of [false, true]) {
    corpseOverrides[type + (elite ? '+' : '')] = (px) => {
      const half = 38, side = half * 2, c = makeCanvas(side * px, side * px), g = c.getContext('2d');
      g.scale(px, px); g.translate(half, half); if (elite) g.scale(1.08, 1.08);
      deadRig(type, elite, 1, 0, 0, _dead);
      drawRig(g, _dead, 0, 0, {variant: DEAD_VARIANT, anchorZ: 0, shadow: false});
      return {half, img: c};
    };
  }
}
/** The decal / corpse key for an enemy ('guard', 'guard+' ...). Used by game.js when it stamps the decal. */
export const corpseKeyFor = (e) => e.type + (e.elite ? '+' : '');

/** The whole corpse draw for a dying heavy enemy: topple animation then the baked flat corpse. */
export function drawHeavyCorpse(ctx, e, v, variant) {
  const type = e.type, elite = !!e.elite, dt = v.deathT ?? 1, t = clamp(dt / DUR[type]), spin = v.spin || 0, ang0 = v.ang || 0, settle = outCubic(t);
  const ang = ang0 + spin * 0.3 * settle, es = elite ? 0.9 : 1;
  ctx.save(); ctx.translate(e.x + (v.fpx || 0), e.y + (v.fpy || 0));
  if (t < 1) {
    ctx.scale(es * (elite ? ELITE_SCALE : 1), es * (elite ? ELITE_SCALE : 1));
    // the topple always ends in the same pose the baked corpse shows: bodyYaw 0 baked, rotated by ang there; here parts are placed in the world
    deadRig(type, elite, clamp(dt / (DUR[type] * 0.9)), ang, spin * (1 - settle), _dead, v.flash > 0 ? Math.min(1, v.flash * 1.6) : 0);
    drawRig(ctx, _dead, 0, 0, {anchorZ: RIG.anchorZ * (1 - settle), shadow: false, variant: t > 0.55 ? DEAD_VARIANT : variant});
  } else {
    const cs = corpseSprite(corpseKeyFor(e)), fade = 1;
    ctx.rotate(ang); ctx.scale(0.94, 0.9); ctx.globalAlpha = fade;
    ctx.drawImage(cs.img, -cs.half, -cs.half, cs.half * 2, cs.half * 2);
  }
  ctx.restore();
}

void angDiff; void TAU;
