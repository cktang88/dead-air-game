// THE CONDUCTOR: pose + procedural bits. A tall tailcoat figure with a broadcast mast for a spine and a CRT for a head.
// conductorPose() fills a CreatureOut (drawRig draws it); the CRT screen, rabbit ears, mast lights / arcs, baton trail and the
// trailing cables are procedural items. The baton conducts: a 4-beat pattern on the music beat, and a distinct arc for every
// attack telegraph (fan sweep, ring circle, spiral, summon twirl, charge point, lob flick, beat mark / fire).
import {STACK_TILT} from './stack2d.js';
import {conductorKit, tailModel, TAIL_PITCHES, nearestTail, mastModel, MAST_PITCHES, nearestMast} from './conductor-models.js';
import {add, sortItems, hump, solveLeg, pieceChain} from './creature-core.js';
import {clamp, lerp, outCubic, outQuad, inOutQuad, smoothstep, walkPose, angDiff, TAU} from './anim.js';

export const CONDUCTOR_SCALE = 1.45;   // the whole figure is drawn this much bigger than its model units: he is the centrepiece
export const CONDUCTOR_RIG = {anchorZ: 15.5, torsoZ: 13.6, headZ: 26.2, shoulderY: 7.4, shoulderZ: 25.4, bone: 9.6, baton: 13, mastX: -5.4, mastZ: 21.6};
const R = CONDUCTOR_RIG;
const _k = {x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0};
const _t = {r: 0, th: 0, z: 0, vib: 0, thrust: 0};
const BEAT_KEYS = [   // 4-beat conducting pattern: [r, theta (clockwise from forward, rad), z] at the ictus of each beat
  [24, 0.12, 8.5],    // 1  down
  [21, -0.95, 17],    // 2  in to the left
  [21, 0.95, 18],     // 3  out to the right
  [13, 0.1, 35],      // 4  up (preparation)
];
const lerp3 = (a, b, u, o) => { o[0] = lerp(a[0], b[0], u); o[1] = lerp(a[1], b[1], u); o[2] = lerp(a[2], b[2], u); };
const _bk = [0, 0, 0];
/** Baton position in the 4-beat pattern from a beat index + phase (0..1). Fast into each beat, floating between. Pure. */
export function conductAt(index, phase, out) {
  const i = ((index % 4) + 4) % 4, a = BEAT_KEYS[i], b = BEAT_KEYS[(i + 1) % 4];
  // each beat: the stroke lands at phase 0 (ictus), then it floats towards the next preparation: ease-out arrival
  const u = phase < 0.25 ? 0 : outQuad((phase - 0.25) / 0.75) ;
  lerp3(a, b, phase * 0.0 + u * 0.92, _bk);
  const bounce = phase < 0.18 ? Math.sin(phase / 0.18 * Math.PI) * 1.4 : 0;     // the rebound after the ictus
  out.r = _bk[0]; out.th = _bk[1]; out.z = _bk[2] + (i === 0 ? bounce : 0);
  return out;
}

/** Where the baton tip wants to be, in the body frame (r, th, z). Fills out; returns it. */
export function batonTarget(inp, out) {
  const d = inp.aimRel || 0, p = inp.telP || 0, mode = inp.mode || 'idle', kind = inp.kind || '', lvl = inp.level || 0, t = inp.t || 0;
  const amp = inp.amp01 ?? 1;
  out.vib = 0; out.thrust = 0;
  const conduct = () => { conductAt(inp.beatIndex || 0, inp.beatPhase || 0, out); out.r = lerp(15, out.r, amp); out.z = lerp(22, out.z, amp); };
  if (inp.dead !== null && inp.dead !== undefined) { conduct(); return out; }
  if (mode === 'intro') { const u = outCubic(inp.introP || 0); out.r = lerp(10, 20, u); out.th = lerp(0.3, 0.0, u) + Math.sin((inp.introP || 0) * TAU * 2) * 0.5 * (1 - u); out.z = lerp(8, 36, u); return out; }
  if (mode === 'shift') { out.r = 8; out.th = Math.sin(t * 26) * 0.2; out.z = 41; out.vib = 1; return out; }
  if (mode === 'telegraph') {
    const lock = inp.locked ? 1 : 0;
    if (kind === 'fan' || kind === 'sweep') { const half = kind === 'fan' ? (lvl === 2 ? 0.6 : 0.5) : 0.85; out.th = d + lerp(-half * 1.5, half * 1.5, inOutQuad(p)); out.r = 27; out.z = 19 + 5 * Math.sin(p * Math.PI) + (p > 0.92 ? -7 : 0); }
    else if (kind === 'ring') { out.th = d + p * TAU * 1.5; out.r = 12 + 3 * p; out.z = 33 + 3 * Math.sin(p * TAU * 3); }
    else if (kind === 'spiral') { out.th = d + p * TAU * 2.2; out.r = 25; out.z = 21 + 3 * Math.sin(p * TAU * 2); }
    else if (kind === 'summon') { out.th = t * 9; out.r = 7; out.z = 33 + 5 * p; out.vib = 0.3; if (p > 0.9) { out.z = 14; out.r = 22; out.th = d; } }
    else if (kind === 'charge') { out.th = d; out.r = lerp(24, 31, lock); out.z = 22 - 4 * lock; out.vib = 0.15 + 0.5 * lock; }
    else if (kind === 'lob') { out.th = d + (1 - p) * 0.3; out.r = lerp(26, 9, outCubic(p)); out.z = lerp(12, 41, outCubic(p)); if (p > 0.93) { out.r = 26; out.z = 16; } }
    else if (kind === 'beat') { out.th = d; out.r = 30; out.z = 17; }
    else { out.th = d; out.r = 26; out.z = 20; }
    return out;
  }
  if (mode === 'attack') {
    if (kind === 'spiral') { out.th = (inp.spinRel || 0); out.r = 25; out.z = 22 + 3 * Math.sin(t * 12); }
    else { out.th = inp.aimRel || 0; out.r = 28; out.z = 18 + 2 * Math.sin(t * 15); }
    return out;
  }
  if (mode === 'charge') { out.th = d; out.r = 32; out.z = 18; out.thrust = 1; return out; }
  if (mode === 'beat') {
    const st = inp.stage;
    if (st === 'mark') { out.th = d; out.r = 30 + 2 * Math.sin((inp.beatPhase || 0) * 20); out.z = 16; }
    else if (st === 'move') { out.th = d + 0.55 * Math.sin(t * 13); out.r = 20; out.z = 27; }
    else if (st === 'fire') { const f = clamp((inp.beatPhase || 0) / 0.3); out.th = d; out.r = lerp(20, 30, f); out.z = lerp(36, 5, outCubic(f)); out.thrust = 1; }
    else conduct();
    return out;
  }
  conduct();
  return out;
}

/**
 * inp: t, bodyYaw, moveYaw, amp (0..1), phase (walk), level (0..2), mode, kind, telP, locked, stage, aimRel (aim angle relative to body),
 *      spinRel, beatIndex, beatPhase, amp01 (tempo scale of conducting), introP, shiftP, hurt, flash, exposed, charging, dead (null|0..1), deadT (s), tempo
 */
const _wp = {a: 0, b: 0, liftA: 0, liftB: 0, bob: 0};
export function conductorPose(inp, out) {
  const kit = conductorKit(inp.level || 0), lvl = inp.level || 0;
  out.n = 0;
  const t = inp.t || 0, amp = clamp(inp.amp || 0), hurt = inp.hurt || 0, fl = inp.flash || 0;
  const dead = inp.dead ?? null, deadT = inp.deadT || 0, charging = inp.mode === 'charge' ? 1 : 0;
  const bodyYaw = inp.bodyYaw || 0, moveYaw = inp.moveYaw ?? bodyYaw;
  walkPose(inp.phase || 0, _wp);
  batonTarget(inp, _t);
  const bp = inp.beatPhase || 0, bob = (inp.mode === 'idle' || inp.mode === 'recover' || !inp.mode) ? (1 - hump(Math.min(1, bp * 3))) * 0 + (bp < 0.2 ? Math.sin(bp / 0.2 * Math.PI) * -0.5 : 0) : 0;
  const lean = (0.9 * amp + 5.5 * charging) * (dead === null ? 1 : 0) - 1.2 * hurt;
  const cb = Math.cos(bodyYaw), sb = Math.sin(bodyYaw);
  const jit = inp.mode === 'shift' ? 0.5 : 0, jx = Math.sin(t * 71) * jit, jy = Math.cos(t * 63) * jit;
  const WX = (lx, ly) => cb * lx - sb * ly + jx, WY = (lx, ly) => sb * lx + cb * ly + jy;
  let tz = R.torsoZ + 0.6 * _wp.bob * amp + bob + Math.sin(t * 2.1) * 0.12 - hurt * 0.6;
  let kneel = 0, spinD = 0, fwdD = 0;
  if (dead !== null) {
    kneel = outCubic(clamp((deadT - 0.5) / 1.1)); tz = lerp(tz, 6.5, kneel) - 0.4 * hump(clamp(deadT / 0.3)); fwdD = 6 * kneel; spinD = 0.35 * kneel;
  }
  const twist = (dead === null ? Math.sin(t * 1.3) * 0.04 + (_t.th - 0) * 0.1 : spinD);
  const bY = bodyYaw + twist, cT = Math.cos(bY), sT = Math.sin(bY);
  const TX = (lx, ly) => cT * lx - sT * ly + jx, TY = (lx, ly) => sT * lx + cT * ly + jy;
  const tlx = lean + fwdD, tx = TX(tlx, 0), ty = TY(tlx, 0);

  // ---- legs (mostly under the coat)
  const stride = 3.6 * amp, cm = Math.cos(moveYaw), sm = Math.sin(moveYaw);
  const legYaw = bodyYaw + angDiff(bodyYaw, moveYaw) * clamp(amp * 2.2), cl = Math.cos(legYaw), sl = Math.sin(legYaw);
  for (const [side, f, lift] of [[-1, _wp.a, _wp.liftA], [1, _wp.b, _wp.liftB]]) {
    const fw = dead === null ? f * stride : -2.5 * kneel, lat = side * 2.7 * (1 + 0.6 * kneel);
    const lg = add(out, kit.leg, cl * fw - sl * lat + jx * 0.5, sl * fw + cl * lat + jy * 0.5, dead === null ? lift * 1.8 * amp : 0, legYaw + (dead !== null ? side * 0.4 * kneel : 0), fl);
    lg.key = ty - 5 + side * 0.01;      // the skirt hides them; always draw them first
  }
  // ---- the frock coat's skirt: a bell that sways a little behind the body and swells with speed
  {
    const sw = Math.sin(t * 2.4) * 0.05 + angDiff(bodyYaw, moveYaw) * 0.0 + (dead !== null ? 0.2 * kneel : 0);
    const sk = add(out, kit.skirt, TX(tlx * 0.6 - 0.6, 0), TY(tlx * 0.6 - 0.6, 0), (dead !== null ? lerp(1.4, 0.2, kneel) : 1.4) + 0.3 * Math.sin(t * 3.2) * (1 - amp), bY + sw, fl, 1 + 0.06 * amp + hurt * 0.04, 1 + 0.06 * amp);
    sk.key = ty - 1.5;
  }
  // ---- coat tails: hang in a skirt, lift and stream with speed, flap, droop when dead
  {
    const fly = clamp(amp * 0.8 + charging * 1.0 + (inp.mode === 'shift' ? 0.7 : 0));
    const base = lerp(-0.95, -0.22, fly) + Math.sin(t * 5.5) * 0.08 * fly + (dead !== null ? -0.5 * kneel : 0);
    for (const side of [-1, 1]) {
      const pitch = base + Math.sin(t * 3.1 + side * 1.7) * 0.06, tm = tailModel(lvl, side, TAIL_PITCHES[nearestTail(pitch)]);
      const spread = 0.12 + 0.2 * fly + 0.1 * Math.sin(t * 2.3 + side) , yawT = bY + Math.PI + side * spread * (side > 0 ? 1 : 1) * -1;
      const it = add(out, tm.model, TX(tlx - 4.2, side * 2.6), TY(tlx - 4.2, side * 2.6), tz + 1.8 - tm.pz, yawT, fl);
      it.key = ty - 3 + tz * 0.03 - 0.3;
    }
  }
  // ---- torso, head
  const torso = add(out, kit.torso, tx, ty, tz, bY, fl, 1 + hurt * 0.04, 1 - hurt * 0.03);
  void torso;
  const aimYaw = bodyYaw + clamp(inp.aimRel || 0, -0.9, 0.9) * 0.9;
  const headYaw = dead === null ? aimYaw + Math.sin(t * 1.9) * 0.05 + (inp.mode === 'shift' ? Math.sin(t * 40) * 0.15 : 0) : bY + 0.6 * kneel;
  const dip = dead !== null ? 8 * kneel : 0, hl = tlx + 0.8 + 3.2 * kneel;
  const hz = tz + (R.headZ - R.torsoZ) + (inp.mode === 'shift' ? 1.8 : 0) + 0.6 * Math.sin(t * 2.8) * (dead === null ? 1 : 0) - dip + hurt * 0.4 - (bp < 0.18 && dead === null ? 0.4 * Math.sin(bp / 0.18 * Math.PI) : 0);
  const hI = add(out, kit.head, TX(hl, 0), TY(hl, 0), hz, headYaw, fl);
  hI.key += 0.2;
  // the screen (procedural, on the head's top face), rabbit ears, and a glow bloom
  {
    const sc = add(out, null, TX(hl, 0) + Math.cos(headYaw) * 3.4, TY(hl, 0) + Math.sin(headYaw) * 3.4, hz + 9.3, 0, 0);
    sc.key = hI.key + 0.1; sc.draw = drawScreen; sc.a = headYaw; sc.o = inp.face;
    for (const s of [-1, 1]) {
      const e = add(out, null, TX(hl, 0) + Math.cos(headYaw) * -4.6 - Math.sin(headYaw) * s * 1.5, TY(hl, 0) + Math.sin(headYaw) * -4.6 + Math.cos(headYaw) * s * 1.5, hz + 8.4, 0, 0);
      e.key = hI.key - 0.05; e.draw = drawEar; e.a = headYaw; e.b = s; e.c = t + (inp.mode === 'shift' ? 0 : 0); e.d = lvl; e.o = inp.face;
    }
  }
  // ---- mast: the spine. leans back, sways with movement, shudders when hit, topples when dead
  let mastPitch = 1.74 + 0.05 * Math.sin(t * 1.7) - amp * 0.1 * 0 + charging * 0.28 + hurt * 0.22 + (inp.mode === 'shift' ? Math.sin(t * 34) * 0.05 : 0);
  if (dead !== null) mastPitch = lerp(1.74, 0.12, inQuadE(clamp((deadT - 0.25) / 0.85)));
  const mm = mastModel(lvl, MAST_PITCHES[nearestMast(mastPitch)]);
  const mbx = TX(tlx + R.mastX, 0), mby = TY(tlx + R.mastX, 0), mbz = tz + (R.mastZ - R.torsoZ) - (dead !== null ? 6 * kneel : 0);
  const mI = add(out, mm.model, mbx, mby, mbz - mm.pz, bY, fl);
  mI.key = mby + 0.5 + tz * 0.03 - (Math.cos(mastPitch) < 0 ? 0.0 : 0);
  {
    const g = add(out, null, mbx, mby, mbz, 0, 0);
    g.key = mI.key + 0.01; g.draw = drawMastLights; g.a = bY; g.b = mastPitch; g.c = t; g.d = lvl; g.o = inp.face;
  }
  // ---- arms: the right (baton) arm follows the baton; the left counter-gestures
  const bpt = inp.beatPhase || 0;
  const sh = (side) => [TX(tlx + 0.4, side * R.shoulderY), TY(tlx + 0.4, side * R.shoulderY), tz + (R.shoulderZ - R.torsoZ)];
  const sR = sh(1), sL = sh(-1);
  // baton tip target (world, rig frame)
  let tipX = TX(_t.r * Math.cos(_t.th), _t.r * Math.sin(_t.th)), tipY = TY(_t.r * Math.cos(_t.th), _t.r * Math.sin(_t.th)), tipZ = tz + (_t.z - R.torsoZ) - 4.6;
  if (_t.vib) { tipX += Math.sin(t * 90) * 0.5 * _t.vib; tipY += Math.cos(t * 83) * 0.5 * _t.vib; tipZ += Math.sin(t * 77) * 0.4 * _t.vib; }
  let dx = tipX - sR[0], dy = tipY - sR[1], dz = tipZ - sR[2], dl = Math.hypot(dx, dy, dz) || 1;
  let hd = clamp(dl - R.baton, 6.5, 17.5);
  let hRx = sR[0] + dx / dl * hd, hRy = sR[1] + dy / dl * hd, hRz = sR[2] + dz / dl * hd;
  if (dead !== null) {
    hRx = sR[0] + Math.cos(bY) * 3 * (1 - kneel) + 4 * kneel * Math.cos(bY); hRy = sR[1] + Math.sin(bY) * 3 + 3 * kneel * Math.sin(bY); hRz = Math.max(1.2, sR[2] - 8 - 12 * kneel);
    dx = Math.cos(bY); dy = Math.sin(bY); dz = -0.1; dl = 1;
  }
  // left hand
  let lx, ly, lz;
  {
    const k = (inp.mode === 'telegraph' && (inp.kind === 'charge' || inp.kind === 'lob' || inp.kind === 'beat')) ? 1 : 0;
    const sw = Math.sin(bpt * TAU) * 0.5 * (inp.amp01 ?? 1);
    lx = lerp(8 + 3 * sw, 17, k); ly = lerp(-12 - 2 * sw, -5, k); lz = lerp(21 + 3 * (inp.mode === 'idle' ? 1 - bpt : 0), 27, k);
    if (inp.mode === 'shift') { lx = 5; ly = -15; lz = 40 + Math.sin(t * 30); }
    if (inp.mode === 'intro') { lx = 8; ly = -13; lz = lerp(10, 26, outCubic(inp.introP || 0)); }
    if (inp.mode === 'telegraph' && inp.kind === 'ring') { lx = 10; ly = -9; lz = 31; }
    if (inp.mode === 'telegraph' && inp.kind === 'summon') { lx = 9; ly = -8; lz = 34; }
  }
  let hLx = TX(tlx + lx, ly), hLy = TY(tlx + lx, ly), hLz = tz + (lz - R.torsoZ) - 4.6;
  if (dead !== null) { hLx = sL[0] + Math.cos(bY) * 4 * kneel - 0.5; hLy = sL[1] + Math.sin(bY) * 4 * kneel - 3 * kneel; hLz = Math.max(1.2, sL[2] - 8 - 12 * kneel); }
  for (const side of [1, -1]) {
    const S = side > 0 ? sR : sL, hx = side > 0 ? hRx : hLx, hy = side > 0 ? hRy : hLy, hz2 = side > 0 ? hRz : hLz;
    solveLeg(S[0], S[1], S[2], hx, hy, hz2, R.bone, R.bone, _k, -sT * side, cT * side, -0.5);
    pieceChain(out, kit.upper, S[0], S[1], S[2], _k.x, _k.y, _k.z, 3, fl, null, 1.6);
    pieceChain(out, kit.fore, _k.x, _k.y, _k.z, _k.fx, _k.fy, _k.fz, 3, fl, null, 1.6);
    const hI2 = add(out, kit.hand, _k.fx, _k.fy, _k.fz - 1.9, side > 0 ? Math.atan2(dy, dx) : bY, fl);
    hI2.key += 0.3;
  }
  // ---- baton: a chain of white beads from the right hand along the tip direction, glowing tip bead, light trail
  {
    const L = R.baton, n = 8, ux = dx / dl, uy = dy / dl, uz = dz / dl;
    const yaw = Math.atan2(uy, ux);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, last = i === n - 1;
      const it = add(out, last ? kit.batonTip : kit.batonBead, hRx + ux * L * u, hRy + uy * L * u, hRz + uz * L * u - 0.9, yaw, last ? 0 : fl);
      it.key = hRy + uy * L * u + (hRz + uz * L * u) * 0.03 + 0.4;
    }
    out.tipX = hRx + ux * L; out.tipY = hRy + uy * L; out.tipZ = hRz + uz * L;
    const tr = add(out, null, out.tipX, out.tipY, out.tipZ, 0, 0);
    tr.key = tr.y + 9; tr.draw = drawBatonGlow; tr.a = _t.thrust; tr.o = inp.face; tr.b = lvl;
  }
  out.shadowScale = 1;
  sortItems(out);
  return out;
}
const inQuadE = (t) => t * t;

// ------------------------------------------------------------------ procedural items
const T = STACK_TILT;
const PHASE_SCREEN = [
  {bg: '#06222a', fg: '#7fffe0', eye: '#d6fffa', glow: 'rgba(90,255,220,'},
  {bg: '#2a1706', fg: '#ffcc66', eye: '#fff0c8', glow: 'rgba(255,190,90,'},
  {bg: '#2a0610', fg: '#ff4a6a', eye: '#ffd0d8', glow: 'rgba(255,70,100,'},
];
let _seed = 1;
const rnd = () => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; };
/** The face: drawn into the head's top face every frame. it.o = face state {level, t, tempo, mode, beat, dead, deadT, flash, invuln, exposed, hurt, voice}. */
function drawScreen(ctx, x, y, it) {
  const f = it.o; if (!f) return;
  const ph = PHASE_SCREEN[f.level || 0], t = f.t, W = 6.4, H = 7.8;
  ctx.save(); ctx.translate(x, y); ctx.rotate(it.a);
  // clip to the glass (rounded rect in the head's frame: x forward, y right)
  ctx.beginPath(); ctx.moveTo(-W / 2 + 1, -H / 2); ctx.arcTo(W / 2, -H / 2, W / 2, H / 2, 1.4); ctx.arcTo(W / 2, H / 2, -W / 2, H / 2, 1.4); ctx.arcTo(-W / 2, H / 2, -W / 2, -H / 2, 1.4); ctx.arcTo(-W / 2, -H / 2, W / 2, -H / 2, 1.4); ctx.closePath(); ctx.clip();
  _seed = (Math.floor(t * 24) * 2654435761) >>> 0;
  const dead = f.dead !== null && f.dead !== undefined;
  if (dead) {
    // test card: seven colour bars (across the screen), a black strip, then CRT power-off
    const cols = ['#e8e8e8', '#e8e810', '#10e8e8', '#10e810', '#e810e8', '#e81010', '#1010e8'], n = cols.length, dT = f.deadT;
    const off = clamp((dT - 2.1) / 0.45);
    ctx.fillStyle = '#000'; ctx.fillRect(-W / 2, -H / 2, W, H);
    if (off < 1) {
      const hh = off > 0 ? Math.max(0.15, (1 - off) * H / 2) : H / 2;
      ctx.save(); if (off > 0) ctx.scale(1, 1);
      for (let i = 0; i < n; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(-W / 2 + 0.0, -H / 2 + i * H / n, W * 0.72, H / n + 0.05); ctx.fillStyle = cols[n - 1 - i]; ctx.globalAlpha = 0.65; ctx.fillRect(W * 0.22, -H / 2 + i * H / n, W * 0.28, H / n + 0.05); ctx.globalAlpha = 1; }
      if (off > 0) { ctx.fillStyle = '#000'; ctx.fillRect(-W / 2, -H / 2, W, H * 0.5 - hh * 0 - (1 - off) * H * 0.5 + 0); ctx.fillRect(-W / 2, H / 2 - (H / 2 - (1 - off) * H / 2) , W, H); }
      ctx.restore();
      ctx.fillStyle = `rgba(0,0,0,${0.25 + 0.15 * Math.sin(t * 60)})`; for (let i = 0; i < 12; i++) ctx.fillRect(-W / 2, -H / 2 + i * H / 12, W, 0.35);
      // roll bar
      const ry = ((dT * 3) % 1) * H - H / 2; ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-W / 2, ry, W, 1.4);
    } else { ctx.fillStyle = '#fff'; ctx.fillRect(-0.3, -0.3, 0.6, 0.6); }
    ctx.restore();
    glowRect(ctx, x, y, off < 1 ? 'rgba(200,220,255,' : 'rgba(255,255,255,', off < 1 ? 0.45 : 0.3 * (1 - clamp((dT - 2.55) / 0.3)));
    return;
  }
  ctx.fillStyle = ph.bg; ctx.fillRect(-W / 2, -H / 2, W, H);
  const inv = f.invuln ? 0.5 + 0.5 * Math.sin(t * 40) : 0;
  if (inv > 0.5) { ctx.fillStyle = ph.fg; ctx.globalAlpha = 0.5; ctx.fillRect(-W / 2, -H / 2, W, H); ctx.globalAlpha = 1; }
  // beat bars (phase 3 shows an equaliser, the others a quiet one)
  const bp = f.beat || 0, voice = f.voice ?? 0.5, tempo = f.tempo ?? 1;
  if (f.level === 2) { for (let i = 0; i < 8; i++) { const hgt = (0.25 + 0.75 * Math.abs(Math.sin(t * 6 + i * 1.3)) * (0.4 + 0.6 * (1 - bp))) * W * 0.6; ctx.fillStyle = 'rgba(255,60,90,0.35)'; ctx.fillRect(-W / 2, -H / 2 + i * H / 8 + 0.2, hgt, H / 8 - 0.5); } }
  // eyes: two bars across the face; blink; narrow slashes when angry; X when hurt
  const blink = (t % 3.7) < 0.12 ? 0.15 : 1, ey = 2.0, ex = 1.5;
  ctx.strokeStyle = ph.eye; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (f.hurt > 0.3) { ctx.moveTo(ex - 0.7, s * ey - 0.7); ctx.lineTo(ex + 0.7, s * ey + 0.7); ctx.moveTo(ex + 0.7, s * ey - 0.7); ctx.lineTo(ex - 0.7, s * ey + 0.7); }
    else if (f.level === 2) { ctx.moveTo(ex - 0.2, s * (ey - 1.1)); ctx.lineTo(ex + 0.9, s * (ey + 0.6)); }
    else if (f.level === 1) { ctx.moveTo(ex, s * (ey - 0.9)); ctx.lineTo(ex, s * (ey + 0.9)); ctx.moveTo(ex - 0.5, s * (ey - 0.9)); ctx.lineTo(ex - 0.5, s * (ey + 0.9)); }
    else { ctx.moveTo(ex, s * (ey - 0.9 * blink)); ctx.lineTo(ex, s * (ey + 0.9 * blink)); }
    ctx.stroke();
  }
  // the mouth is a waveform across the screen: calm sine, tempo-driven in II, glitchy in III
  ctx.lineWidth = 0.7; ctx.strokeStyle = ph.fg; ctx.beginPath();
  const amp = 0.4 + 1.5 * voice * (f.level === 1 ? (0.4 + 0.6 * tempo) : 1);
  for (let i = 0; i <= 28; i++) {
    const u = i / 28, yy = -H / 2 + 0.6 + u * (H - 1.2);
    let xx = -1.6 + Math.sin(u * 11 + t * (f.level === 1 ? 4 + 9 * tempo : 7)) * amp * Math.sin(u * Math.PI) ;
    if (f.level === 2 && (i % 5 === 0)) xx += (rnd() - 0.5) * 2.2;
    if (f.level === 1) xx += Math.sin(u * 27 + t * 20) * 0.3 * (1 - tempo);
    i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
  }
  ctx.stroke();
  // scanlines and a rolling bar
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; for (let i = 0; i < 11; i++) ctx.fillRect(-W / 2, -H / 2 + i * 0.85 + ((t * 2) % 0.85), W, 0.3);
  ctx.fillStyle = ph.glow + '0.12)'; ctx.fillRect(-W / 2, -H / 2 + ((t * 1.3) % 1) * H, W, 1.2);
  // static: more of it in later phases and on a hit
  const stat = (f.level === 2 ? 26 : f.level === 1 ? 6 : 1) + (f.hurt > 0.3 ? 30 : 0) + (f.exposed ? 20 : 0);
  for (let i = 0; i < stat; i++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.7)' : ph.glow + '0.8)'; ctx.fillRect(-W / 2 + rnd() * W, -H / 2 + rnd() * H, 0.5 + rnd() * 1.2, 0.35); }
  if (f.level === 2 && rnd() < 0.18) { const gy = -H / 2 + rnd() * H; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-W / 2, gy, W, 0.5); }   // glitch tear
  // rare easter egg: the station ident (a tiny channel number) blips in the corner
  if ((t % 41) < 0.5 && f.level === 0) { ctx.fillStyle = ph.fg; ctx.font = '2.2px monospace'; ctx.fillText('CH 04', -W / 2 + 0.5, -H / 2 + 2.4); }
  if (f.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, f.flash)})`; ctx.fillRect(-W / 2, -H / 2, W, H); }
  ctx.restore();
  glowRect(ctx, x, y, ph.glow, 0.28 + 0.1 * Math.sin(t * 9) + (f.level === 2 ? 0.1 : 0));
}
function glowRect(ctx, x, y, col, a) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, col + a + ')'); gr.addColorStop(1, col + '0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill(); ctx.restore();
}
function drawEar(ctx, x, y, it) {
  // two rabbit-ear antennae on the TV: springy rods, one bent after the phase-3 damage
  const f = it.o, s = it.b, t = it.c, lvl = it.d, ya = it.a, ca = Math.cos(ya), sa = Math.sin(ya);
  const bend = (lvl >= 2 && s > 0) ? 1 : 0, wob = Math.sin(t * 3 + s * 2) * 0.15 + (f && f.hurt ? 0.4 * Math.sin(t * 40) : 0);
  const len = bend ? 6 : 9, ang = -0.5 + s * 0.7 + wob;
  // in screen space: the rod rises (up the screen) and splays sideways in the head's frame
  const dx = -sa * s * 2.4 + ca * -1.6, dy = ca * s * 2.4 + sa * -1.6;
  const tx = x + dx * (len / 5), ty = y - len * T * 1.15 + dy * (len / 5) * 0.6, mx = x + dx * 0.4, my = y - len * T * 0.55;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = '#120f18'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
  ctx.strokeStyle = '#b8b4c4'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
  if (bend) { ctx.strokeStyle = '#120f18'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 3 * s, ty + 2.2); ctx.stroke(); ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 0.5; ctx.stroke(); }
  ctx.fillStyle = '#ff4a8a'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6 + s); ctx.beginPath(); ctx.arc(tx, ty, 0.9, 0, TAU); ctx.fill();
  ctx.restore();
  void ang;
}
const MAST_ARMS = [[14, 6], [22, 4.6], [29, 3.6], [35, 2.6]];
function drawMastLights(ctx, x, y, it, anchorZ) {
  const f = it.o, bY = it.a, p = it.b, t = it.c, lvl = it.d, CUu = 0.9;
  const cp = Math.cos(p), sp = Math.sin(p), cb = Math.cos(bY), sb = Math.sin(bY);
  const pos = (a, b) => { const ax = a * CUu * cp, az = a * CUu * sp, bx = -sb * b * CUu, by = cb * b * CUu; return [x + cb * ax + bx, y + sb * ax + by - az * T]; };
  const beat = f ? f.beat || 0 : 0, bi = f ? f.beatIndex || 0 : 0;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const lit = (i) => ((Math.floor(t * 5) + i) % 4 === 0 ? 1 : 0.28) * (0.7 + 0.3 * (1 - beat));
  const cols = ['rgba(255,74,138,', 'rgba(127,232,255,', 'rgba(255,74,138,', 'rgba(255,240,246,'];
  MAST_ARMS.forEach(([a, w], i) => { for (const s of [-1, 1]) { const [px, py] = pos(a, s * w), k = lit(i + (s > 0 ? 2 : 0)); const gr = ctx.createRadialGradient(px, py, 0, px, py, 4.2); gr.addColorStop(0, cols[i] + (0.8 * k) + ')'); gr.addColorStop(1, cols[i] + '0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, 4.2, 0, TAU); ctx.fill(); } });
  const [tx, ty] = pos(41, 0), kk = 0.5 + 0.5 * Math.sin(t * 8), gr = ctx.createRadialGradient(tx, ty, 0, tx, ty, 4); gr.addColorStop(0, `rgba(255,240,246,${0.45 * kk + 0.12})`); gr.addColorStop(1, 'rgba(255,74,138,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(tx, ty, 6, 0, TAU); ctx.fill();
  // arcs of electricity between the cross arms: a few jagged strokes that re-roll ~16x a second; heavier and hotter in later phases
  if (lvl >= 1 && Math.cos(p) > -0.9 && p > 1.0) {
    _seed = (Math.floor(t * 16) * 40503 + lvl) >>> 0;
    const n = lvl === 1 ? 1 : 3;
    for (let k = 0; k < n; k++) {
      if (rnd() < (lvl === 1 ? 0.45 : 0.75)) {
        const i0 = (rnd() * 3) | 0, s0 = rnd() < 0.5 ? -1 : 1, A = pos(MAST_ARMS[i0][0], s0 * MAST_ARMS[i0][1]), B = pos(MAST_ARMS[i0 + 1][0], (rnd() < 0.5 ? -1 : 1) * MAST_ARMS[i0 + 1][1]);
        ctx.strokeStyle = lvl === 2 ? 'rgba(255,170,220,0.85)' : 'rgba(170,240,255,0.8)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(A[0], A[1]);
        for (let j = 1; j < 5; j++) { const u = j / 5; ctx.lineTo(lerp(A[0], B[0], u) + (rnd() - 0.5) * 3, lerp(A[1], B[1], u) + (rnd() - 0.5) * 3); }
        ctx.lineTo(B[0], B[1]); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.25; ctx.stroke();
      }
    }
    if (lvl === 2) for (let k = 0; k < 4; k++) { const [px, py] = pos(26 + rnd() * 14, (rnd() - 0.5) * 6); ctx.fillStyle = 'rgba(255,220,160,0.9)'; ctx.fillRect(px + (rnd() - 0.5) * 4, py + rnd() * 6, 0.8, 0.8); }
  }
  ctx.restore();
  void bi; void anchorZ;
}
function drawBatonGlow(ctx, x, y, it) {
  const thrust = it.a, f = it.o, lvl = it.b;
  const col = ['255,120,170', '255,200,100', '255,90,90'][lvl || 0];
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const r = 3.2 + 2.2 * thrust, gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,0.9)`); gr.addColorStop(0.35, `rgba(${col},0.55)`); gr.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  // light trail (history kept by the caller in f.trail, screen-space offsets relative to the boss origin)
  if (f && f.trail && f.trail.n > 1) {
    const tr = f.trail; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < tr.n; i++) {
      const a = i / tr.n, ia = (tr.head - tr.n + i - 1 + 128) % 64, ib = (ia + 1) % 64;
      ctx.strokeStyle = `rgba(${col},${0.5 * a * a})`; ctx.lineWidth = 0.4 + 2.2 * a;
      ctx.beginPath(); ctx.moveTo(x - it.x * 0 + tr.x[ia] - tr.ox, y + tr.y[ia] - tr.oy); ctx.lineTo(x + tr.x[ib] - tr.ox, y + tr.y[ib] - tr.oy); ctx.stroke();
    }
  }
  ctx.restore();
}
