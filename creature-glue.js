// Renderer glue for the stacked RUSHER / BRUTE (and their elite variants): per-frame input mapping, per-step state + particles,
// animated corpses and the flat baked corpse decals. render2d.js calls: isCreature, drawCreature, drawCreatureCorpse, updateCreature,
// creatureDrop. Elites are type 'brute' (or 'chaser') with e.elite set; they use their own spec (colours, spikes, bigger hammer).
import {STACK_CONFIG, STACK_TILT, tintVariant} from './stack2d.js';
import {CONDUCTOR_RIG, CONDUCTOR_SCALE} from './conductor-pose.js';
import {corpseOverrides, makeCanvas} from './sprites2d.js';
import {drawRig} from './rig2d.js';
import {clamp, damp, TAU} from './anim.js';
import {newCreatureOut, rusherPose, brutePose, rusherKit, bruteKit, RUSHER_SPEC, ELITE_RUSHER_SPEC, BRUTE_SPEC, ELITE_BRUTE_SPEC, RUSHER_RIG, BRUTE_RIG, DEAD_CREATURE} from './creatures2d.js';

STACK_CONFIG.kinds.add('chaser'); STACK_CONFIG.kinds.add('brute');

export const DEATH_LEN = {chaser: 1.25, brute: 1.35};
const ENRAGE_VARIANT = tintVariant('enrage', '#ff3a22', 0.2);
const _out = newCreatureOut();

/** True for the actors this module draws (type chaser / brute, elite or not), when stacks are on. */
export const isCreature = (e) => STACK_CONFIG.enabled && (e.type === 'chaser' || e.type === 'brute') && STACK_CONFIG.kinds.has(e.type);
/** Screen px a creature's body hangs below its simulation position (its blob shadow sits there). */
export const creatureDrop = (e) => (e.type === 'boss' ? CONDUCTOR_RIG.anchorZ * CONDUCTOR_SCALE : e.type === 'brute' ? BRUTE_RIG.anchorZ : RUSHER_RIG.anchorZ) * STACK_TILT;

const specOf = (e) => (e.type === 'chaser' ? (e.elite ? ELITE_RUSHER_SPEC : RUSHER_SPEC) : (e.elite ? ELITE_BRUTE_SPEC : BRUTE_SPEC));
const scaleOf = (e) => (e.elite ? (e.type === 'brute' ? 1.14 : 1.1) : 1);

/** Everything a body needs to know this frame, from the enemy + its vis state. Fills `inp`. */
export function creatureInputs(e, v, time, inp) {
  const ang = v.ang || 0, wt = e.def?.melee?.windup || (e.type === 'brute' ? 0.34 : 0.3);
  const alertAge = v.alertT > 0 ? 0.9 - v.alertT : 9;
  inp.id = e.id || 0; inp.t = time; inp.bodyYaw = ang; inp.moveYaw = v.mvAng ?? ang; inp.amp = v.mv || 0; inp.phase = v.phase || 0;
  inp.wind = e.meleeWindup > 0 ? clamp(1 - e.meleeWindup / wt) : 0; inp.lunge = v.lunge || 0; inp.rec = v.rec || 0;
  inp.hurt = Math.max(v.punch || 0, (v.flash || 0) * 0.7); inp.flash = Math.min(1, (v.flash || 0) * 1.6);
  inp.alert = alertAge < 0.45 ? 1 - alertAge / 0.45 : 0; inp.idleT = v.idleT || 0;
  inp.enrage = v.enr || 0; inp.stagger = v.stag || 0;
  inp.dead = null; inp.deadT = 0; inp.spin = 0; inp.fallYaw = 0;
  return inp;
}
const _inp = {};

/** Draw a living creature. ctx is translated to (e.x, e.y) (render2d did that); nothing else is assumed. */
export function drawCreature(ctx, e, v, time, floorVariant) {
  creatureInputs(e, v, time, _inp);
  const rus = e.type === 'chaser', spec = specOf(e), es = scaleOf(e);
  const kit = rus ? rusherKit(spec) : bruteKit(spec);
  const out = rus ? rusherPose(kit, _inp, _out) : brutePose(kit, _inp, _out);
  v.fid = out.fidget;
  if (!rus) { v.hamX = out.hammerX; v.hamY = out.hammerY; v.hamZ = out.hammerZ; }
  const variant = !rus && (v.enr || 0) > 0.45 ? ENRAGE_VARIANT : floorVariant || null;
  if (es !== 1) { ctx.save(); ctx.scale(es, es); }
  drawRig(ctx, out, 0, 0, {anchorZ: rus ? RUSHER_RIG.anchorZ : BRUTE_RIG.anchorZ, shadow: false, variant, flash: _inp.flash});
  if (es !== 1) ctx.restore();
}

/**
 * Animated corpse (t < 1) then the baked flat decal. `ang` includes the death spin; kind is e.type. ctx at world origin.
 * Returns true when it drew the final decal (render2d can skip its own settle).
 */
export function drawCreatureCorpse(ctx, e, v, ang, spin, corpseSprite, kindKey) {
  const dt = v.deathT ?? 9, dur = DEATH_LEN[e.type], t = clamp(dt / dur), rus = e.type === 'chaser', spec = specOf(e), es = scaleOf(e);
  ctx.save(); ctx.translate(e.x + (v.fpx || 0), e.y + (v.fpy || 0));
  if (t < 1) {
    const kit = rus ? rusherKit(spec) : bruteKit(spec);
    _inp.id = e.id || 0; _inp.t = v.time || 0; _inp.bodyYaw = ang; _inp.moveYaw = ang; _inp.amp = 0; _inp.phase = 0; _inp.wind = _inp.lunge = _inp.rec = _inp.alert = _inp.hurt = _inp.enrage = _inp.stagger = _inp.idleT = 0;
    _inp.dead = t; _inp.deadT = dt; _inp.spin = spin < 0 ? -1 : 1; _inp.fallYaw = rus ? ang + Math.PI : ang; _inp.flash = v.flash > 0 ? Math.min(1, v.flash * 1.6) : 0;
    const out = rus ? rusherPose(kit, _inp, _out) : brutePose(kit, _inp, _out);
    if (es !== 1) ctx.scale(es, es);
    const settle = Math.max(0, (dt - dur * 0.55) / (dur * 0.45));
    drawRig(ctx, out, 0, 0, {anchorZ: (rus ? RUSHER_RIG.anchorZ : BRUTE_RIG.anchorZ) * (1 - Math.min(1, settle)), shadow: false, variant: dt > dur * 0.5 ? DEAD_CREATURE : null, flash: _inp.flash});
    ctx.restore();
    return false;
  }
  const cs = corpseSprite(kindKey);
  ctx.rotate(ang); ctx.scale(0.94 * es, 0.9 * es);
  ctx.drawImage(cs.img, -cs.half, -cs.half, cs.half * 2, cs.half * 2);
  ctx.restore();
  return true;
}

// ------------------------------------------------------------------ flat corpse decals (the dead pose baked at yaw 0, rotated by the decal)
const bakeOut = newCreatureOut(), bakeIn = {};
function bakeCorpse(type, elite) {
  return (px) => {
    const half = type === 'brute' ? 36 : 22, side = half * 2, c = makeCanvas(side * px, side * px), g = c.getContext('2d');
    g.scale(px, px); g.translate(half, half);
    const rus = type === 'chaser', spec = rus ? (elite ? ELITE_RUSHER_SPEC : RUSHER_SPEC) : (elite ? ELITE_BRUTE_SPEC : BRUTE_SPEC), kit = rus ? rusherKit(spec) : bruteKit(spec);
    Object.assign(bakeIn, {id: 5, t: 0, bodyYaw: 0, moveYaw: 0, amp: 0, phase: 0, wind: 0, lunge: 0, rec: 0, hurt: 0, flash: 0, alert: 0, idleT: 0, enrage: 0, stagger: 0, dead: 1, deadT: DEATH_LEN[type] + 0.5, spin: 1, fallYaw: rus ? Math.PI : 0});
    const out = rus ? rusherPose(kit, bakeIn, bakeOut) : brutePose(kit, bakeIn, bakeOut);
    drawRig(g, out, 0, 0, {anchorZ: 0, shadow: false, variant: DEAD_CREATURE});
    return {half, img: c};
  };
}
corpseOverrides.chaser = bakeCorpse('chaser', false);
corpseOverrides.brute = bakeCorpse('brute', false);
corpseOverrides.elite = bakeCorpse('brute', true);

// ------------------------------------------------------------------ per-step state and particles
const rnd = (a, b) => a + Math.random() * (b - a);
/**
 * env: {fx, time, player, shake(mag, angle)}. Called once per simulation step for every creature, alive or dead.
 */
export function updateCreature(e, v, step, env) {
  const fx = env.fx, ang = v.ang || 0, ca = Math.cos(ang), sa = Math.sin(ang), brute = e.type === 'brute';
  const p = env.player, near = p ? clamp(1 - Math.hypot(p.x - e.x, p.y - e.y) / 340) : 0.5;
  if (e.alive) {
    v.enr = damp(v.enr || 0, brute && e.stance === 'enrage' ? 1 : 0, e.stance === 'enrage' ? 7 : 2.2, step);
    v.stag = damp(v.stag || 0, e.stun > 0 ? clamp(e.stun / 0.45) : 0, 16, step);
    v.rec = Math.max(0, (v.rec || 0) - step * 2.0);
    v.pTime = (v.pTime || 0) + step;
    if (brute) {
      // the slam: ground impact when the hammer reaches the floor (the lunge counter runs 1 -> 0)
      if (v.lunge > 0.97 && !v.slam) { v.slam = true; v.impact = false; }
      if (v.slam && !v.impact && v.lunge < 0.24) {
        v.impact = true; v.rec = 1;
        const hx = e.x + (v.hamX ?? ca * 28), hy = e.y + (v.hamY ?? sa * 28) + 4;
        fx.ring(hx, hy, 4, e.elite ? 56 : 44, '#d9cbb8', 0.42, 3.6);
        fx.ring(hx, hy, 2, e.elite ? 34 : 26, '#fff2d8', 0.22, 2);
        for (let i = 0; i < 10; i++) { const a = i * TAU / 10 + rnd(-0.2, 0.2); fx.dust(hx + Math.cos(a) * 6, hy + Math.sin(a) * 5, Math.cos(a) * 190, Math.sin(a) * 190); }
        fx.chips(hx, hy, ang, ['#7d7886', '#5d5868', '#9a95a4', '#6b6272'], 7, 1.6, [60, 210], [1.2, 2.8], [0.35, 0.8]);
        fx.spark(hx, hy, ang, 4, 1.4, [90, 220], '#ffb866');
        if (env.shake) env.shake((e.elite ? 7 : 5.5) * (0.5 + near), ang);
        fx.camPunch = Math.min(0.09, fx.camPunch + 0.035 * (0.5 + near));
      }
      if (v.lunge <= 0.001) v.slam = false;
      // heavy footfalls: dust at the planted boot + a faint thud
      const ph2 = ((v.phase || 0) * 2) % 1, pr = v.stepPh ?? ph2;
      if ((v.mv || 0) > 0.35 && ph2 < pr) {
        const side = ((v.phase || 0) * 2 | 0) % 2 ? 1 : -1, fxp = e.x - sa * side * 6, fyp = e.y + ca * side * 6 + 3;
        fx.dust(fxp, fyp, 0, 0); fx.dust(fxp + ca * 3, fyp + sa * 3, 0, 0);
        if (env.shake && near > 0.4) env.shake(0.9 * near, Math.PI / 2);
      }
      v.stepPh = ph2;
      // enraged: steam hisses from the pauldron vents and the mask
      if (v.enr > 0.35) {
        v.steamT = (v.steamT || 0) - step;
        if (v.steamT <= 0) {
          v.steamT = rnd(0.07, 0.15);
          const s = Math.random() < 0.5 ? -1 : 1;
          fx.smoke(e.x - sa * s * 11 + ca * 2, e.y + ca * s * 11 - 12, 3.4, 1, '#dcd6e0', 4, [0.45, 0.9], 0.38);
          if (Math.random() < 0.4) fx.smoke(e.x + ca * 6, e.y + sa * 6 - 16, 2.6, 1, '#ffb0a0', 3, [0.3, 0.6], 0.3);
        }
      }
      if (v.fid === 'brute.tap' && (v.pTime * 9 | 0) !== v.tapN) { v.tapN = v.pTime * 9 | 0; if (v.tapN % 3 === 0 && v.hamX !== undefined) fx.dust(e.x + v.hamX, e.y + v.hamY + 2, 0, 0); }
    } else {
      // rusher: drool strings from the jaws, sparks when the blades scrape, scuttle dust, a dust puff on the pounce
      v.droolT = (v.droolT || 0) - step;
      const windy = e.meleeWindup > 0;
      if (v.droolT <= 0 && (windy || (v.idleT || 0) > 1.2 || (v.mv || 0) > 0.6) && Math.random() < 0.9) {
        v.droolT = windy ? rnd(0.05, 0.1) : rnd(0.25, 0.7);
        const hx = e.x + ca * 11, hy = e.y + sa * 11 + 3;
        fx.add({kind: 'drop', x: hx + rnd(-1, 1), y: hy, vx: ca * rnd(-8, 12), vy: sa * rnd(-8, 12) + rnd(8, 22), drag: 4, life: rnd(0.25, 0.5), size: rnd(0.9, 1.5), color: e.elite ? '#e8a8ff' : '#c9e6a0'});
      }
      if (windy && !v.wasW2) for (let i = 0; i < 4; i++) fx.spark(e.x + ca * 8 + rnd(-3, 3), e.y + sa * 8 - 6, ang - 1.57 + rnd(-1, 1), 1, 0.8, [60, 160], '#ffd36a');
      v.wasW2 = windy;
      if (v.fid === 'rusher.groom') { v.sparkT = (v.sparkT || 0) - step; if (v.sparkT <= 0) { v.sparkT = rnd(0.08, 0.2); fx.spark(e.x + ca * 8, e.y + sa * 8 - 4, ang - 1.57 + rnd(-0.8, 0.8), 1, 0.7, [30, 90], '#ffe6a0'); } }
      if (v.fid === 'rusher.shake' && Math.random() < 0.12) fx.dust(e.x + rnd(-6, 6), e.y + rnd(-3, 5), 0, 0);
      if (v.lunge > 0.97 && !v.slam) { v.slam = true; for (let i = 0; i < 4; i++) fx.dust(e.x - ca * 6 + rnd(-3, 3), e.y - sa * 6 + rnd(-3, 3), -ca * 100, -sa * 100); }
      if (v.lunge <= 0.001) v.slam = false;
    }
  } else if (v.deathT !== undefined) {
    // death beats: the rusher lands belly-up with an ichor splat; the brute thuds into the floor
    const dt = v.deathT, prev = v.deathPrev ?? 0;
    if (!brute && prev < 0.34 && dt >= 0.34) { for (let i = 0; i < 5; i++) fx.dust(e.x + rnd(-6, 6), e.y + rnd(-3, 5), rnd(-90, 90), rnd(-90, 90)); fx.add({kind: 'drop', x: e.x, y: e.y, vx: rnd(-60, 60), vy: rnd(-60, 20), drag: 5, life: 0.4, size: 1.8, color: e.elite ? '#e8a8ff' : '#c9e6a0'}); }
    if (brute && prev < 0.55 && dt >= 0.55) { if (env.shake) env.shake(e.elite ? 6 : 4.2, ang); fx.ring(e.x + ca * 8, e.y + sa * 8 + 4, 4, 38, '#d9cbb8', 0.4, 3); }
    v.deathPrev = dt;
  }
}

