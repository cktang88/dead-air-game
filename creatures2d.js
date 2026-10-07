// Renderer glue + contact-sheet registry for the non-humanoid stacked bodies (RUSHER, BRUTE). Poses live in rusher-pose.js /
// brute-pose.js, models in creature-models.js / brute-models.js, shared plumbing in creature-core.js.
import {drawContactShadow, STACK_TILT, darkVariant} from './stack2d.js';
import {drawRig} from './rig2d.js';
import {newCreatureOut} from './creature-core.js';
import {rusherKit, RUSHER_SPEC, ELITE_RUSHER_SPEC} from './creature-models.js';
import {bruteKit, BRUTE_SPEC, ELITE_BRUTE_SPEC} from './brute-models.js';
import {rusherPose, RUSHER_RIG} from './rusher-pose.js';
import {brutePose, BRUTE_RIG} from './brute-pose.js';
import {conductorPose, CONDUCTOR_RIG, CONDUCTOR_SCALE} from './conductor-pose.js';

export const DEAD_CREATURE = darkVariant('dead', 0.55);
export {RUSHER_RIG, BRUTE_RIG, rusherPose, brutePose, rusherKit, bruteKit, RUSHER_SPEC, ELITE_RUSHER_SPEC, BRUTE_SPEC, ELITE_BRUTE_SPEC, newCreatureOut};

// ------------------------------------------------------------------ registry used by tools/creature-sheet.html
const _sheetOut = newCreatureOut();
function sheetRusher(spec) {
  const kit = rusherKit(spec);
  return {
    h: 80, cy: 0.56, deadDur: 1.1, deadAt: [0.05, 0.15, 0.25, 0.35, 0.5, 0.7, 0.9, 1.1],
    pose: (o) => rusherPose(kit, {...o, bodyYaw: o.ang ?? 0, moveYaw: o.move ?? o.ang ?? 0, idleT: o.idleT || 0}, _sheetOut),
    draw: (ctx, out, x, y, o) => { drawContactShadow(ctx, x, y + RUSHER_RIG.anchorZ * STACK_TILT + 0.5, RUSHER_RIG.shadowRx, RUSHER_RIG.shadowRy, 0.55); drawRig(ctx, out, x, y, {anchorZ: RUSHER_RIG.anchorZ, shadow: false, variant: o.dying && o.deadT > 0.7 ? DEAD_CREATURE : null, flash: o.flash || 0}); },
    acts: [['hurt', {ang: 0.3, hurt: 1, flash: 0.8}], ['alert 1', {ang: 0.3, alert: 1}], ['alert .5', {ang: 0.3, alert: 0.5}], ['sprint', {ang: 0, move: 0, amp: 1, phase: 0.3}], ['groom', {ang: 0.5, idleT: 3.5}], ['shake', {ang: 0.5, idleT: 9.2}], ['sniff', {ang: 0.5, idleT: 16.3}], ['scratch', {ang: 0.5, idleT: 22.7}]],
    fidgets: [],
  };
}
function sheetBrute(spec) {
  const kit = bruteKit(spec);
  return {
    h: 110, cy: 0.62, deadDur: 1.15, deadAt: [0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1.15],
    pose: (o) => brutePose(kit, {...o, bodyYaw: o.ang ?? 0, moveYaw: o.move ?? o.ang ?? 0, idleT: o.idleT || 0}, _sheetOut),
    draw: (ctx, out, x, y, o) => { drawContactShadow(ctx, x, y + BRUTE_RIG.anchorZ * STACK_TILT + 0.5, BRUTE_RIG.shadowRx, BRUTE_RIG.shadowRy, 0.6); drawRig(ctx, out, x, y, {anchorZ: BRUTE_RIG.anchorZ, shadow: false, variant: o.dying && o.deadT > 0.8 ? DEAD_CREATURE : null, flash: o.flash || 0}); },
    acts: [['hurt', {ang: 0.3, hurt: 1, flash: 0.8}], ['enrage', {ang: 0.3, enrage: 1}], ['stagger', {ang: 0.3, stagger: 1}], ['rec .8', {ang: 0.3, rec: 0.8}], ['neck', {ang: 0.5, idleT: 3.9}], ['roll', {ang: 0.5, idleT: 10.2}], ['tap', {ang: 0.5, idleT: 16.7}], ['knuckles', {ang: 0.5, idleT: 23.4}]],
    fidgets: [],
  };
}
function sheetConductor(level) {
  const mk = (o) => {
    const dead = o.dead ?? null, face = {level, t: o.t ?? 1.3, tempo: o.tempo ?? 1, mode: o.mode || 'idle', beat: o.beatPhase ?? 0.3, beatIndex: o.beatIndex ?? 0, dead: dead === null ? null : 1, deadT: o.deadT || 0, flash: o.flash || 0, invuln: !!o.invuln, exposed: !!o.exposed, hurt: o.hurt || 0, voice: o.voice ?? 0.6};
    return {t: o.t ?? 1.3, bodyYaw: o.ang ?? 0, moveYaw: o.move ?? o.ang ?? 0, amp: o.amp || 0, phase: o.phase || 0, level, mode: dead !== null ? 'dead' : (o.mode || 'idle'), kind: o.kind || '', telP: o.p ?? 0, locked: !!o.locked, stage: o.stage, aimRel: o.aimRel ?? 0, spinRel: o.spinRel ?? 0,
      beatIndex: o.beatIndex ?? 0, beatPhase: o.beatPhase ?? 0.3, amp01: 1, introP: o.introP ?? 1, hurt: o.hurt || 0, flash: o.flash || 0, dead, deadT: o.deadT || 0, face};
  };
  const tl = (kind, p, extra = {}) => [`${kind} ${p}`, {mode: 'telegraph', kind, p, ...extra}];
  return {
    h: 120, cy: 0.66, deadDur: 2.7, deadAt: [0.15, 0.4, 0.7, 1.0, 1.4, 1.9, 2.3, 2.65],
    pose: (o) => conductorPose(mk({...o, ang: o.ang ?? 0, beatIndex: o.beatIndex ?? 0, mode: o.mode || (o.wind !== undefined ? 'telegraph' : o.lunge !== undefined ? 'beat' : 'idle'), kind: o.kind || (o.wind !== undefined ? 'fan' : ''), p: o.p ?? o.wind, stage: o.lunge !== undefined ? 'fire' : o.stage, beatPhase: o.lunge !== undefined ? 1 - o.lunge : (o.beatPhase ?? 0.3)}), _sheetOut),
    draw: (ctx, out, x, y, o) => { const K = CONDUCTOR_SCALE; drawContactShadow(ctx, x, y + CONDUCTOR_RIG.anchorZ * STACK_TILT * K + 0.5, 18, 10, 0.6); ctx.save(); ctx.translate(x, y); ctx.scale(K, K); drawRig(ctx, out, 0, 0, {anchorZ: CONDUCTOR_RIG.anchorZ, shadow: false, variant: null, flash: o.flash || 0}); ctx.restore(); },
    acts: [['idle b0', {beatIndex: 0, beatPhase: 0.02}], ['idle b1', {beatIndex: 1, beatPhase: 0.4}], ['idle b2', {beatIndex: 2, beatPhase: 0.4}], ['idle b3', {beatIndex: 3, beatPhase: 0.5}],
      ...[['ring', 0.5], ['spiral', 0.5], ['summon', 0.6], ['charge', 0.9]].map(([k, p]) => tl(k, p, k === 'charge' ? {locked: true} : {}))],
    fidgets: [['lob 0.6', {mode: 'telegraph', kind: 'lob', p: 0.6}], ['mark', {mode: 'beat', stage: 'mark', beatPhase: 0.3}], ['move', {mode: 'beat', stage: 'move'}], ['shift', {mode: 'shift'}], ['hurt', {hurt: 1, flash: 0.8}], ['exposed', {exposed: true, mode: 'recover'}], ['intro .3', {mode: 'intro', introP: 0.3}], ['walk', {amp: 1, phase: 0.3, move: 0, ang: 0}]],
  };
}
export const CREATURES = {
  conductor: sheetConductor(0), 'conductor.2': sheetConductor(1), 'conductor.3': sheetConductor(2),
  rusher: sheetRusher(RUSHER_SPEC), 'rusher.elite': sheetRusher(ELITE_RUSHER_SPEC),
  brute: sheetBrute(BRUTE_SPEC), 'brute.elite': sheetBrute(ELITE_BRUTE_SPEC),
};
