// Skeletal RIG + POSE layer on top of stack2d.js. A character is not one stack but a handful of part stacks (legs,
// torso, head, two 2-bone arms, gloves, gun, mag) that a pose function moves every frame; drawRig depth-sorts and
// draws them. Poses are pure functions of plain numbers (the same ones anim.js speaks), so tests can pin them.
//
// Frames (all angles are screen yaw in radians, +x = right, +y = down, clockwise positive):
//   move  -> legs face the direction of travel        body -> torso/head follow the lagged aim     aim -> gun follows the cursor
// Units: world units (px at zoom 1). Heights are world units above the feet. `anchorZ` is the height of the plane the
// game simulates in (the gun's receiver), so bullets / hitboxes keep their positions and the feet hang below.
import {drawStack, drawContactShadow, STACK_TILT, darkVariant} from './stack2d.js';
import {walkPose, reloadPose, swapPose, clamp, angDiff, TAU} from './anim.js';

export const RIG = {
  anchorZ: 9.4,         // aim plane height
  torsoZ: 7.0,          // torso model layer 0
  headZ: 15.6,          // head model layer 0
  shoulder: {x: 1.0, y: 7.4, z: 14.2},
  armBone: 6.4,         // length of each arm bone in units
  gunBaseZ: 9.4 - 2.7,  // gun layer 0 so the receiver centre sits on the aim plane
  reach: 5,             // gun origin ahead of the body centre (= gunMuzzle's reach, so the muzzle stays on gunMuzzle(gun))
  legY: 2.5,
};

const POOL = 30;
export function newRigOut() {
  const items = [];
  for (let i = 0; i < POOL; i++) items.push({model: null, x: 0, y: 0, z: 0, yaw: 0, sx: 1, sy: 1, flash: 0, key: 0, draw: null, a: 0, b: 0});
  return {items, n: 0, variant: null, shadowX: 0, shadowY: 0, muzzleX: 0, muzzleY: 0, handR: {x: 0, y: 0}, handL: {x: 0, y: 0}, fidget: ''};
}
function add(out, model, x, y, z, yaw, sx = 1, sy = 1, flash = 0) {
  const it = out.items[out.n++];
  it.model = model; it.x = x; it.y = y; it.z = z; it.yaw = yaw; it.sx = sx; it.sy = sy; it.flash = flash; it.draw = null;
  it.key = y + z * 0.03;
  return it;
}

// ------------------------------------------------------------------ idle fidget hooks
// After the character has stood still for a while a fidget plays now and then. Each fidget is
//   {id, from, dur, apply(p, u, inp)} where u runs 0..1 over `dur` seconds and p is the mutable pose offsets:
//   p.headYaw, p.headZ, p.torsoZ, p.torsoYaw, p.leanX (units, forward), p.antenna (sway kick), p.shrug (0..1)
// Append your own with registerIdleFidget; later agents hang easter eggs here (checking a watch, kicking a pebble...).
export const IDLE_FIDGETS = [
  {id: 'look', from: 3.5, dur: 2.4, apply(p, u) { const s = Math.sin(u * TAU); p.headYaw += 0.62 * s * (u < 0.5 ? 1 : 0.75); p.torsoYaw += 0.08 * s; }},
  {id: 'antenna', only: ['player', 'gunner'], from: 5, dur: 1.2, apply(p, u) { p.antenna += Math.sin(u * TAU * 3) * (1 - u) * 1.6; p.headYaw += 0.3 * Math.sin(u * Math.PI); }},
  {id: 'shrug', from: 8, dur: 1.1, apply(p, u) { const h = Math.sin(u * Math.PI); p.shrug = h; p.torsoZ += 0.5 * h; p.headZ += 0.7 * h; }},
  {id: 'stretch', from: 10, dur: 1.8, apply(p, u) { const h = Math.sin(u * Math.PI); p.leanX -= 1.1 * h; p.headZ += 0.5 * h; p.torsoYaw -= 0.1 * h; }},
];
export function registerIdleFidget(f) { IDLE_FIDGETS.push(f); }
const SLOT = 6.5;   // seconds between fidgets once still
const _fp = {headYaw: 0, headZ: 0, torsoZ: 0, torsoYaw: 0, leanX: 0, antenna: 0, shrug: 0};
/** Which fidget (if any) runs at `idleT` seconds of stillness for this character; returns {fidget, u} or null. Pure. */
export function fidgetAt(idleT, seed = 0, kind = '') {
  const first = IDLE_FIDGETS[0].from;
  if (!(idleT > first)) return null;
  const slot = Math.floor((idleT - first) / SLOT), within = (idleT - first) - slot * SLOT;
  // fidgets may be limited to some actor kinds with `only: [...]`
  const pool = kind ? IDLE_FIDGETS.filter((q) => !q.only || q.only.includes(kind)) : IDLE_FIDGETS;
  const f = pool[(slot + (seed | 0)) % pool.length];
  if (within > f.dur) return null;
  return {fidget: f, u: within / f.dur};
}

// ------------------------------------------------------------------ humanoid pose
/**
 * Fills `out` with this frame's parts. inp (all optional, defaults 0):
 *   id seed, t time, moveYaw bodyYaw aimYaw, amp (0..1 moving), phase (0..1 gait), sprint (0..1),
 *   kick (0..1 recoil), hurt (0..1 flinch), flash (0..1 white), lunge (0..1 forward lean), idleT (seconds still),
 *   gunModel, gunGeo {rear, front}, gunRot (extra gun yaw), gunDx (extra forward shift), gunLift (extra z), gunScale,
 *   handDx, handDy (support-hand offset in gun space), mag (0..1 fresh mag in the support hand), magModel,
 *   dead (null, or 0..1 fall progress) with fallYaw, antennaX/antennaY (world sway of the antenna tip)
 */
const _wp = {a: 0, b: 0, liftA: 0, liftB: 0, bob: 0};
const _e1 = {x: 0, y: 0};
export function humanoidPose(kit, inp, out) {
  out.n = 0;
  const t = inp.t || 0, seed = (inp.id || 0) * 1.7, amp = clamp(inp.amp || 0), sprint = clamp(inp.sprint || 0), kick = inp.kick || 0, hurt = inp.hurt || 0;
  const bodyYaw = inp.bodyYaw || 0, aimYaw = inp.aimYaw ?? bodyYaw, moveYaw = inp.moveYaw ?? bodyYaw;
  const fl = inp.flash || 0, dead = inp.dead ?? null;
  // legs turn to the direction of travel while moving and square up under the torso when still
  const legYaw = bodyYaw + angDiff(bodyYaw, moveYaw) * clamp(amp * 2.2);
  walkPose(inp.phase || 0, _wp);
  const cb = Math.cos(bodyYaw), sb = Math.sin(bodyYaw), cm = Math.cos(moveYaw), sm = Math.sin(moveYaw), cl = Math.cos(legYaw), sl = Math.sin(legYaw), ca = Math.cos(aimYaw), sa = Math.sin(aimYaw);
  // idle fidgets
  _fp.headYaw = _fp.headZ = _fp.torsoZ = _fp.torsoYaw = _fp.leanX = _fp.antenna = _fp.shrug = 0;
  out.fidget = '';
  if (dead === null && amp < 0.05 && (inp.idleT || 0) > 0) {
    const f = fidgetAt(inp.idleT, inp.id || 0, inp.kind || '');
    if (f) { f.fidget.apply(_fp, f.u, inp); out.fidget = f.fidget.id; }
  }
  // gait numbers
  const stride = (4.2 + 1.2 * sprint) * amp, liftH = 2.4;
  const bob = _wp.bob * amp, lean = (0.8 * amp + 1.15 * sprint + (inp.lunge || 0) * 2.4) * (dead === null ? 1 : 0);
  const breath = Math.sin(t * 2.4 + seed) * (1 - amp);
  const twist = Math.sin((inp.phase || 0) * TAU) * 0.1 * amp;
  const torsoZ = RIG.torsoZ + 0.5 * bob + 0.12 * breath + _fp.torsoZ - hurt * 0.4;
  const torsoYaw = bodyYaw + twist + _fp.torsoYaw;
  const lx = cm * lean + cb * (_fp.leanX - kick * 0.8), ly = sm * lean + sb * (_fp.leanX - kick * 0.8);
  let tx = lx, ty = ly, hx = lx * 1.45 - ca * kick * 0.5, hy = ly * 1.45 - sa * kick * 0.5;
  let tz = torsoZ, hz = RIG.headZ - RIG.torsoZ + torsoZ + 0.12 * Math.sin(t * 2.4 + 0.7 + seed) * (1 - amp) + 0.35 * bob + _fp.headZ + hurt * 0.55;
  let headYaw = bodyYaw + clamp(angDiff(bodyYaw, aimYaw), -0.55, 0.55) * 0.8 + _fp.headYaw - hurt * 0.38;
  const squashX = 1 + hurt * 0.1, squashY = 1 - hurt * 0.08;
  const variant = out.variant;
  void variant;

  // ---------------- legs
  const legs = [[-1, _wp.a, _wp.liftA], [1, _wp.b, _wp.liftB]];
  if (dead === null) {
    for (const [side, f, lift] of legs) {
      const lat = side * RIG.legY * (1 + 0.1 * (sprint));
      const fwd = f * stride;
      add(out, kit.leg, cl * fwd - sl * lat, sl * fwd + cl * lat, lift * liftH * amp, legYaw + side * 0.05 * f * amp, 1, 1, fl);
    }
  } else {
    const k = dead, spread = 1.2 * k;
    for (const side of [-1, 1]) { const bx = -Math.cos(inp.fallYaw ?? 0) * 3.2 * k - side * 0.6 * k * cl, by = -Math.sin(inp.fallYaw ?? 0) * 3.2 * k - side * 0.6 * k * sl; add(out, kit.leg, bx - sl * side * (RIG.legY + spread), by + cl * side * (RIG.legY + spread), 0, legYaw + side * 0.3 * k, 1, 1, fl); }
  }

  // ---------------- death: topple away from the hit, parts land where their height carried them
  if (dead !== null) {
    const k = dead, th = Math.min(1.5, 1.7 * (1 - (1 - k) ** 3)), s = Math.sin(th), c = Math.cos(th), fy = inp.fallYaw ?? 0, fcx = Math.cos(fy), fsy = Math.sin(fy);
    const zT = (RIG.torsoZ + 6) * s, zH = (RIG.headZ + 6) * s;
    const spin = (inp.spin || 0) * k * 0.6;
    add(out, kit.torso, fcx * zT * 0.85, fsy * zT * 0.85, Math.max(0.6, RIG.torsoZ * c), torsoYaw + spin, 1 + 0.12 * k, 1 - 0.1 * k, fl);
    add(out, kit.head, fcx * zH * 1.05, fsy * zH * 1.05, Math.max(0.8, RIG.headZ * c * 0.55 + 1), headYaw + spin * 1.4, 1, 1, fl);
    out.shadowX = 0; out.shadowY = 0;
    sortItems(out);
    return out;
  }

  // ---------------- torso, head
  add(out, kit.torso, tx, ty, tz, torsoYaw, squashX, squashY, fl);
  add(out, kit.head, hx, hy, hz, headYaw, 1, 1, fl);

  // ---------------- antenna (custom item: a springy rod, pack-mounted)
  {
    const px = tx + cb * -3.1 - sb * 2.9, py = ty + sb * -3.1 + cb * 2.9;   // socket position on the pack
    const it = add(out, null, px, py, tz + 8.8, 0, 1, 1, 0);
    it.key = py + 0.001;
    it.draw = drawAntenna;
    it.a = (inp.antennaX || 0) + _fp.antenna * 1.2 - lx * 1.4; it.b = (inp.antennaY || 0) - ly * 1.4 - 0.3 * Math.abs(_fp.antenna);
    it.flash = fl;
  }

  // ---------------- gun
  const gunYaw = aimYaw + (inp.gunRot || 0);
  const gox = RIG.reach - kick * 3.2 + (inp.gunDx || 0) - sprint * 1.5, gcs = Math.cos(aimYaw), gsn = Math.sin(aimYaw);
  const gx = tx * 0.35 + gcs * gox, gy = ty * 0.35 + gsn * gox;
  const gz = RIG.gunBaseZ + kick * 0.9 + (inp.gunLift || 0) + 0.18 * bob + (tz - torsoZ) * 0.5;
  const gsc = inp.gunScale ?? 1;
  if (inp.gunModel) {
    const g = add(out, inp.gunModel, gx, gy, gz, gunYaw, gsc, gsc, fl);
    g.key = gy + gz * 0.03 + 0.05;
  }
  out.muzzleX = gx + Math.cos(gunYaw) * (inp.gunGeo ? inp.gunGeo.L * gsc : 0); out.muzzleY = gy + Math.sin(gunYaw) * (inp.gunGeo ? inp.gunGeo.L * gsc : 0);
  const gyc = Math.cos(gunYaw), gys = Math.sin(gunYaw);
  const geo = inp.gunGeo || {rear: 4, front: 12};
  const hrx = gx + gyc * geo.rear * gsc, hry = gy + gys * geo.rear * gsc;
  const fr = Math.min(geo.front, 8) + (inp.handDx || 0), fy2 = inp.handDy || 0;
  const hlx = gx + (gyc * fr - gys * fy2) * gsc, hly = gy + (gys * fr + gyc * fy2) * gsc;
  out.handR.x = hrx; out.handR.y = hry; out.handL.x = hlx; out.handL.y = hly;
  const handZ = gz + 1.5;

  // ---------------- arms: shoulders ride the torso, hands ride the gun, elbows flare out
  for (const side of [1, -1]) {
    const shx = tx + cb * RIG.shoulder.x - sb * RIG.shoulder.y * side, shy = ty + sb * RIG.shoulder.x + cb * RIG.shoulder.y * side;
    const hxw = side > 0 ? hrx : hlx, hyw = side > 0 ? hry : hly;
    const dx = hxw - shx, dy = hyw - shy, d = Math.hypot(dx, dy);
    const L = Math.max(RIG.armBone, d / 1.92);
    solveElbow(shx, shy, hxw, hyw, L, side, bodyYaw, _e1);
    const z0 = RIG.shoulder.z + (tz - RIG.torsoZ) - 1.0, z1 = handZ - 0.4;
    const zm = (z0 + (z0 + z1) / 2) / 2 - 1.5, zn = ((z0 + z1) / 2 + z1) / 2 - 1.5;
    add(out, kit.arm, shx, shy, zm, Math.atan2(_e1.y - shy, _e1.x - shx), Math.hypot(_e1.x - shx, _e1.y - shy) / RIG.armBone, 1, fl);
    add(out, kit.arm, _e1.x, _e1.y, zn, Math.atan2(hyw - _e1.y, hxw - _e1.x), Math.hypot(hxw - _e1.x, hyw - _e1.y) / RIG.armBone, 1, fl);
    add(out, side > 0 ? kit.gloveR : kit.gloveL, hxw, hyw, handZ - 1.4, gunYaw, 1, 1, fl);
  }
  if ((inp.mag || 0) > 0.02 && inp.magModel) add(out, inp.magModel, hlx + gyc * 1.6, hly + gys * 1.6, handZ + 1.2, gunYaw + 0.4, 1, 1, 0);
  out.shadowX = 0; out.shadowY = 0;
  sortItems(out);
  return out;
}

/** Elbow of a 2-bone arm (equal bones L) from shoulder S to hand H, flaring towards the arm's own side of the torso. Pure. */
export function solveElbow(sx, sy, hx, hy, L, side, bodyYaw, out = {x: 0, y: 0}) {
  const dx = hx - sx, dy = hy - sy, d = Math.max(1e-4, Math.hypot(dx, dy)), half = Math.min(d / 2, L * 0.999), h = Math.sqrt(Math.max(0, L * L - half * half));
  let px = -dy / d, py = dx / d;
  // side vector in world: right-hand direction of the torso * side
  const rx = -Math.sin(bodyYaw) * side, ry = Math.cos(bodyYaw) * side;
  if (px * rx + py * ry < 0) { px = -px; py = -py; }
  out.x = sx + dx / 2 + px * h; out.y = sy + dy / 2 + py * h;
  return out;
}

export function sortItems(out) {
  const a = out.items, n = out.n;
  for (let i = 1; i < n; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j].key > v.key) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
}

// ------------------------------------------------------------------ drawing
/** Draws the sorted items at ground point (x, y). `variant` tints every part (dead / elite / floor palette). */
export function drawRig(ctx, out, x, y, {variant = null, anchorZ = RIG.anchorZ, shadow = true, alpha = 1, flash = 0} = {}) {
  if (shadow) {
    const fy = y + anchorZ * STACK_TILT;
    drawContactShadow(ctx, x, fy + 0.5, 9.5, 5.2, 0.55 * alpha);
  }
  for (let i = 0; i < out.n; i++) {
    const it = out.items[i];
    if (it.draw) { it.draw(ctx, x + it.x, y + it.y - (it.z - anchorZ) * STACK_TILT, it, anchorZ); continue; }
    drawStack(ctx, it.model, x + it.x, y + it.y, {yaw: it.yaw, z: it.z - anchorZ, variant, flash: Math.max(it.flash, flash), sx: it.sx, sy: it.sy, alpha});
  }
}

// The radio antenna: a bendy 2-segment rod with a blinking LED. (x, y) is the socket screen position.
function drawAntenna(ctx, x, y, it) {
  const len = 14, bx = it.a, by = it.b;
  const tipX = x + bx * 1.5, tipY = y - len * STACK_TILT * 1.5 + by * 1.5, midX = x + bx * 0.45, midY = y - len * STACK_TILT * 0.75 + by * 0.4;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#120f18'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
  ctx.strokeStyle = '#6f6d7a'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
  ctx.fillStyle = '#120f18'; ctx.beginPath(); ctx.arc(tipX, tipY, 1.7, 0, TAU); ctx.fill();
  const blink = (Math.sin((performance.now() / 1000) * 5 + x * 0.1) > 0.3) ? 1 : 0.35;
  ctx.fillStyle = `rgba(255,74,94,${blink})`; ctx.beginPath(); ctx.arc(tipX, tipY, 1.05, 0, TAU); ctx.fill();
  if (blink > 0.9) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,74,94,0.28)'; ctx.beginPath(); ctx.arc(tipX, tipY, 2.2, 0, TAU); ctx.fill(); }
  ctx.restore();
}

export const DEAD_VARIANT = darkVariant('dead', 0.55);
export {reloadPose, swapPose};
