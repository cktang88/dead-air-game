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
  armBone: 8.8,         // length of each arm bone in units (= the arm model's 11 cells)
  gunBaseZ: 9.4 - 2.7,  // gun layer 0 so the receiver centre sits on the aim plane
  reach: 5,             // gun origin ahead of the body centre (= gunMuzzle's reach, so the muzzle stays on gunMuzzle(gun))
  legY: 2.5,
};

// ------------------------------------------------------------------ grip profiles (see docs/art/HANDLING.md)
// blade: torso yaw added to the aim (right shoulder back = positive), v: how far right of the aim line the gun sits (units),
// lean: how far the torso leans into the gun. Pistols are squared up and extended (isosceles); long guns are bladed with the
// stock in the right shoulder pocket and the muzzle crossed back onto the aim line.
// Numbers come from the Blender reference renders (docs/art/handling-ref-*.png, refs measured in tools/handling-ref.html's JSON):
//   blade (deg): smg 18, rifle 32, shotgun 28, sniper 38, amr 42, launcher 36, low-ready 6, pistol 0.
//   stock sits at 0.84 of the right shoulder's offset from the centre line (3.6 of 4.3 ref units), i.e. v ~ 0.6-0.7 of the bladed shoulder.
//   trigger hand 0.34-0.50 of the gun length from the stock, support hand 0.50-0.80 (pump 0.68, bolt guns 0.50-0.54, smg front 0.80).
//   trigger-arm elbow flares ~5 units outward and ~5 forward of the shoulder; support elbow stays under the gun (arm nearly straight).
export const GRIPS = {
  pistol: {blade: 0.0, v: 0, lean: -2.2, hip: 0},   // lean < 0: the body sits back so both arms can reach out isosceles-style to a gun whose muzzle is pinned
  smg: {blade: 0.31, v: 3.0, lean: 1.0},
  rifle: {blade: 0.56, v: 4.2, lean: 1.8},
  shotgun: {blade: 0.49, v: 4.0, lean: 1.5},
  sniper: {blade: 0.66, v: 4.2, lean: 2.2},
  amr: {blade: 0.73, v: 4.4, lean: 2.2},
  launcher: {blade: 0.63, v: 4.4, lean: 1.4},
};
export const gripFor = (cls) => GRIPS[cls] || GRIPS.rifle;
const sstep = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const mixp = (o, a, b, t) => { o.x = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t; o.z = a.z + (b.z - a.z) * t; return o; };

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
// Easter-egg fidgets: a quick over-the-shoulder look, tuning the radio (the renderer draws the static bubble when
// out.fidget === 'radio'), spinning the gun once, and a rare one that only plays once after a full minute of stillness.
const sm = (u) => u * u * (3 - 2 * u);
registerIdleFidget({id: 'shoulder', from: 6, dur: 2.2, apply(p, u) { const h = Math.sin(u * Math.PI), k = h < 0.5 ? sm(h * 2) : 1; p.headYaw += 1.15 * k; p.torsoYaw += 0.38 * k; p.headZ += 0.3 * k; }});
registerIdleFidget({id: 'radio', from: 12, dur: 3.4, apply(p, u) {
  const h = Math.sin(u * Math.PI), tap = u > 0.18 && u < 0.7 ? Math.sin((u - 0.18) * TAU * 4.2) : 0;
  p.antenna += Math.sin(u * TAU * 5) * h * 2.4; p.headYaw += 0.55 * sm(Math.min(1, h * 2.2)); p.headZ -= 0.35 * h + 0.15 * Math.abs(tap); p.torsoZ -= 0.15 * h; p.shrug = 0.5 * h;
}});
registerIdleFidget({id: 'spin', from: 16, dur: 1.5, apply(p, u) { p.gunRot += TAU * (1 - (1 - u) ** 3); p.torsoZ += Math.sin(u * Math.PI) * 0.25; p.headYaw += 0.2 * Math.sin(u * Math.PI); }});
registerIdleFidget({id: 'tune', from: 60, dur: 7, once: true, apply(p, u) {
  const h = Math.sin(u * Math.PI), tilt = Math.sin(u * TAU * 1.5);
  p.antenna += Math.sin(u * TAU * 7) * h * 2.8; p.headYaw += 0.45 * tilt * h; p.headZ -= 0.5 * h; p.leanX += 0.4 * h; p.shrug = 0.3 * h;
}});
/** Presentation switches set by game modes (easter eggs); the pose reads them. */
export const RIG_FX = {headScale: 1};
const SLOT = 6.5;   // seconds between fidgets once still
const _fp = {headYaw: 0, headZ: 0, torsoZ: 0, torsoYaw: 0, leanX: 0, antenna: 0, shrug: 0, gunRot: 0};
/**
 * Which fidget (if any) runs at `idleT` seconds of stillness for this character; returns {fidget, u} or null. Pure.
 * A fidget with `once: true` plays a single time, starting at its own `from` (the rare one-minute idle); the others rotate,
 * one per slot, among those whose `from` has passed. Non-humanoid bodies pass kind 'rusher' / 'brute' and get ONLY the fidgets
 * tagged `body: <kind>`; humanoids never see those.
 */
const _bodyPools = new Map();
function bodyPool(kind) {
  let c = _bodyPools.get(kind);
  if (!c || c.n !== IDLE_FIDGETS.length) { c = {n: IDLE_FIDGETS.length, list: IDLE_FIDGETS.filter((f) => f.body === kind)}; _bodyPools.set(kind, c); }
  return c.list;
}
const BODY_KINDS = new Set(['rusher', 'brute']);
export function fidgetAt(idleT, seed = 0, kind = '') {
  const body = BODY_KINDS.has(kind);
  const pool0 = body ? bodyPool(kind) : null;
  if (body && !pool0.length) return null;
  const first = body ? pool0[0].from : IDLE_FIDGETS[0].from;
  if (!(idleT > first)) return null;
  if (!body) for (const f of IDLE_FIDGETS) if (f.once && !f.body && idleT >= f.from && idleT - f.from <= f.dur) return {fidget: f, u: (idleT - f.from) / f.dur};
  const slot = Math.floor((idleT - first) / SLOT), within = (idleT - first) - slot * SLOT;
  const pool = body ? pool0 : IDLE_FIDGETS.filter((f) => !f.once && !f.body && (f.from ?? 0) <= idleT && (!f.only || !kind || f.only.includes(kind)));
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
const _e1 = {x: 0, y: 0}, _hT = {x: 0, y: 0, z: 0}, _hS = {x: 0, y: 0, z: 0}, _hA = {x: 0, y: 0, z: 0}, _hB = {x: 0, y: 0, z: 0}, _hC = {x: 0, y: 0, z: 0}, _hP = {x: 0, y: 0, z: 0};
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
  _fp.headYaw = _fp.headZ = _fp.torsoZ = _fp.torsoYaw = _fp.leanX = _fp.antenna = _fp.shrug = _fp.gunRot = 0;
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
  const geo = inp.gunGeo || null, hasGun = !!(inp.gunModel && geo), prof = gripFor(geo && geo.cls);
  const stance = hasGun ? 1 - sprint * 0.85 : 0, blade = prof.blade * stance;
  const baseYaw = bodyYaw + blade;
  const torsoYaw = baseYaw + twist + _fp.torsoYaw;
  const lx = cm * lean + cb * (_fp.leanX - kick * 0.8), ly = sm * lean + sb * (_fp.leanX - kick * 0.8);
  let tx = lx, ty = ly, hx = lx * 1.45 - ca * kick * 0.5, hy = ly * 1.45 - sa * kick * 0.5;
  let tz = torsoZ, hz = RIG.headZ - RIG.torsoZ + torsoZ + 0.12 * Math.sin(t * 2.4 + 0.7 + seed) * (1 - amp) + 0.35 * bob + _fp.headZ + hurt * 0.55;
  let headYaw = baseYaw + clamp(angDiff(baseYaw, aimYaw), -0.9, 0.9) * 0.9 + _fp.headYaw - hurt * 0.38;
  const squashX = 1 + hurt * 0.1, squashY = 1 - hurt * 0.08;
  const gtx = tx, gty = ty;   // the gun does not take the lean into the shoulder
  { const la = prof.lean * stance, rv = prof.v * stance * 0.45; tx += ca * la - sa * 0; ty += sa * la; hx += ca * la * 1.1 - sa * rv; hy += sa * la * 1.1 + ca * rv; }
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
  add(out, kit.head, hx, hy, hz, headYaw, RIG_FX.headScale, RIG_FX.headScale, fl);

  // ---------------- antenna (custom item: a springy rod, pack-mounted)
  {
    const px = tx + cb * -3.1 - sb * 2.9, py = ty + sb * -3.1 + cb * 2.9;   // socket position on the pack
    const it = add(out, null, px, py, tz + 8.8, 0, 1, 1, 0);
    it.key = py + 0.001;
    it.draw = drawAntenna;
    it.a = (inp.antennaX || 0) + _fp.antenna * 1.2 - lx * 1.4; it.b = (inp.antennaY || 0) - ly * 1.4 - 0.3 * Math.abs(_fp.antenna);
    it.flash = fl;
  }

  // ---------------- gun: root at the shoulder pocket (long guns) / extended at arm's length (pistols), muzzle pinned on the aim line
  const gunYaw0 = aimYaw + (inp.gunRot || 0) + _fp.gunRot;
  const gsc = inp.gunScale ?? 1, gL = geo ? geo.L : 0;
  const gv = prof.v * stance;                                       // lateral offset of the gun root, to the shooter's right
  const cross = gL > 1 ? Math.asin(clamp(gv / gL, -0.5, 0.5)) : 0;  // barrel crosses back onto the aim line so the muzzle stays on gunMuzzle
  const gunYaw = gunYaw0 - cross;
  const gcs = Math.cos(aimYaw), gsn = Math.sin(aimYaw), gdx = Math.cos(gunYaw), gdy = Math.sin(gunYaw);
  const kb = kick * (hasGun && geo.cls === 'pistol' ? 2.6 : 3.2);
  const oxA = RIG.reach + gL * (1 - Math.cos(cross)) + (inp.gunDx || 0) - sprint * (geo && geo.cls === 'pistol' ? 3 : 1.5);
  const gx = gtx * 0.35 + gcs * oxA - gsn * gv - gdx * kb, gy = gty * 0.35 + gsn * oxA + gcs * gv - gdy * kb;
  const longGun = hasGun && geo.cls !== 'pistol' && geo.cls !== 'smg';
  const gz = RIG.gunBaseZ + kick * 0.9 + (inp.gunLift || 0) + 0.18 * bob + (tz - torsoZ) * 0.5 + (longGun ? 1.0 * stance : 0) - sprint * (longGun ? 1.2 : 0.4);
  // weapon layer: gun, arms and gloves always draw over the torso AND the head (a held weapon is nearer the camera than the face, and when
  // aiming away the head would otherwise swallow the extended arms); inside the layer: arms (both bones) < gun and its pump / bolt < gloves < mag, so the gun stays legible and only the hands wrap it
  const topK = Math.max(ty + tz * 0.03, hy + hz * 0.03) + 0.3, gunKey = topK + 0.1;
  if (inp.gunModel) { const g = add(out, inp.gunModel, gx, gy, gz, gunYaw, gsc, gsc, fl); g.key = gunKey; }
  out.muzzleX = gx + gdx * gL * gsc; out.muzzleY = gy + gdy * gL * gsc;
  const gpt = (p, o, dx = 0, dy = 0) => { const px = (p.x + dx) * gsc, py = (p.y + dy) * gsc; o.x = gx + gdx * px - gdy * py; o.y = gy + gdy * px + gdx * py; o.z = gz + 1.5; return o; };
  const G = geo || {trig: {x: 4, y: 0}, sup: {x: 12, y: 0}, mag: {x: 7, y: 0}, bolt: {x: 7, y: 0.5}, cls: 'rifle'};
  const hT = _hT, hS = _hS;
  gpt(G.trig, hT);
  const rf = inp.reloadFrac || 0, bolt = G.cls === 'sniper' || G.cls === 'amr';
  let pumpD = 0, boltD = 0;   // how far the pump / bolt part slides along the barrel (gun-space units, negative = back); the hand that works it moves with it
  // support hand: handguard / pump / grip wrap, then the reload and pump choreography
  if (G.pump && !rf && kick < 0.999) { pumpD = -4.2 * Math.sin(Math.PI * clamp(1 - kick)) * (kick > 0.001 ? 1 : 0); gpt(G.sup, hS, pumpD); }   // racking the pump after a shot
  else gpt(G.sup, hS);
  if (rf > 0) {
    gpt(G.sup, _hA); gpt(G.mag, _hB, 0, 0.4); _hB.z -= 0.8;
    // vest / belt pouch: front-left of the torso
    const px = tx + Math.cos(torsoYaw) * 2.2 + Math.sin(torsoYaw) * 4.2, py = ty + Math.sin(torsoYaw) * 2.2 - Math.cos(torsoYaw) * 4.2;
    _hP.x = px; _hP.y = py; _hP.z = tz + 5.5;
    if (rf < 0.2) mixp(hS, _hA, _hB, sstep(rf / 0.2));
    else if (rf < 0.62) { const u = (rf - 0.2) / 0.42; mixp(hS, _hB, _hP, sstep(u * 1.7)); if (u > 0.6) mixp(hS, _hP, _hP, 0); }
    else if (rf < 0.82) mixp(hS, _hP, _hB, sstep((rf - 0.62) / 0.2));
    else {
      const u = (rf - 0.82) / 0.18;
      mixp(hS, _hB, _hA, sstep(u * 1.3));
      if (bolt) { boltD = -3.2 * Math.sin(Math.PI * clamp(u * 1.4)); gpt(G.bolt, _hC, boltD, 0); mixp(hT, hT, _hC, Math.sin(Math.PI * clamp(u * 1.2)) ** 0.5); }
    }
  } else if (!inp.reloadFrac && (inp.handDx || inp.handDy)) {
    gpt(G.sup, hS, inp.handDx || 0, inp.handDy || 0);
  }
  if (inp.gunModel && inp.gunModel.parts) {
    const P = inp.gunModel.parts;
    if (P.pump) add(out, P.pump, gx + gdx * pumpD * gsc, gy + gdy * pumpD * gsc, gz, gunYaw, gsc, gsc, fl).key = gunKey + 0.01;
    if (P.bolt) add(out, P.bolt, gx + gdx * boltD * gsc, gy + gdy * boltD * gsc, gz, gunYaw, gsc, gsc, fl).key = gunKey + 0.01;
  }
  // sidearm sprint / one-hand: the free hand tucks to the chest (or hangs at the hip when the other hand holds a shield)
  const tuck = inp.oneHand ? 1 : (G.cls === 'pistol' ? sstep((sprint - 0.35) / 0.4) : 0);
  if (tuck > 0) {
    const bx = tx + Math.cos(torsoYaw) * 3.0 + Math.sin(torsoYaw) * 4.6, by = ty + Math.sin(torsoYaw) * 3.0 - Math.cos(torsoYaw) * 4.6;
    _hP.x = bx; _hP.y = by; _hP.z = tz + 4.5; mixp(hS, hS, _hP, tuck);
  }
  out.handR.x = hT.x; out.handR.y = hT.y; out.handL.x = hS.x; out.handL.y = hS.y;

  // ---------------- arms: shoulders ride the torso, two-bone IK to the trigger / support hands, elbows flare outward
  const tcs = Math.cos(torsoYaw - twist - _fp.torsoYaw), tsn = Math.sin(torsoYaw - twist - _fp.torsoYaw), tk = ty + tz * 0.03;
  for (const side of [1, -1]) {
    const shx = tx + tcs * RIG.shoulder.x - tsn * RIG.shoulder.y * side, shy = ty + tsn * RIG.shoulder.x + tcs * RIG.shoulder.y * side;
    const H = side > 0 ? hT : hS, hxw = H.x, hyw = H.y, hz = H.z;
    const dx = hxw - shx, dy = hyw - shy, d = Math.hypot(dx, dy);
    // pistols are held at near full extension (isosceles): bones shorten instead of folding the elbows out
    const L = Math.max(RIG.armBone * (G.cls === 'pistol' && !rf && tuck < 0.5 ? 0.92 : 1), d / 1.94);
    solveElbow(shx, shy, hxw, hyw, L, side, torsoYaw, _e1);
    const z0 = RIG.shoulder.z + (tz - RIG.torsoZ) - 1.0, z1 = hz - 0.4;
    const zm = (z0 + (z0 + z1) / 2) / 2 - 1.5, zn = ((z0 + z1) / 2 + z1) / 2 - 1.5;
    const up = add(out, kit.arm, shx, shy, zm, Math.atan2(_e1.y - shy, _e1.x - shx), Math.hypot(_e1.x - shx, _e1.y - shy) / RIG.armBone, 1, fl);
    up.key = topK;
    const lo = add(out, kit.arm, _e1.x, _e1.y, zn, Math.atan2(hyw - _e1.y, hxw - _e1.x), Math.hypot(hxw - _e1.x, hyw - _e1.y) / RIG.armBone, 1, fl);
    lo.key = topK + 0.05;
    const gl = add(out, side > 0 ? kit.gloveR : kit.gloveL, hxw, hyw, hz - 1.4, Math.atan2(hyw - _e1.y, hxw - _e1.x) * 0.35 + gunYaw * 0.65, 1, 1, fl);
    gl.key = gunKey + 0.06 + ((side > 0 ? hT.y > hS.y : hS.y > hT.y) ? 0.001 : 0);
  }
  const hlx = hS.x, hly = hS.y, handZ = hS.z, gyc = gdx, gys = gdy;
  if ((inp.mag || 0) > 0.02 && inp.magModel) { const m = add(out, inp.magModel, hlx + gyc * 1.2, hly + gys * 1.2, handZ + 0.4, gunYaw + 0.4, 1, 1, 0); m.key = gunKey + 0.1; }
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
  const len = 9.5, bx = it.a, by = it.b;
  const tipX = x + bx * 1.5, tipY = y - len * STACK_TILT * 1.5 + by * 1.5, midX = x + bx * 0.45, midY = y - len * STACK_TILT * 0.75 + by * 0.4;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#120f18'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
  ctx.strokeStyle = '#6f6d7a'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
  ctx.fillStyle = '#120f18'; ctx.beginPath(); ctx.arc(tipX, tipY, 1.2, 0, TAU); ctx.fill();
  const blink = (Math.sin((performance.now() / 1000) * 5 + x * 0.1) > 0.3) ? 1 : 0.35;
  ctx.fillStyle = `rgba(255,74,94,${blink})`; ctx.beginPath(); ctx.arc(tipX, tipY, 0.7, 0, TAU); ctx.fill();
  if (blink > 0.9) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,74,94,0.22)'; ctx.beginPath(); ctx.arc(tipX, tipY, 1.7, 0, TAU); ctx.fill(); }
  ctx.restore();
}

export const DEAD_VARIANT = darkVariant('dead', 0.55);
export {reloadPose, swapPose};
