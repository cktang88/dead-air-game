// RUSHER pose: a six-legged insectoid crawler (tripod gait with planted feet, two-bone leg IK, raptorial blade forearms, mandibles,
// twitching antennae). Models in creature-models.js. A pose fills a CreatureOut; rig2d.drawRig draws it.
import {STACK_TILT} from './stack2d.js';
import {registerIdleFidget, fidgetAt} from './rig2d.js';
import {bladeModel, BLADE_PITCHES, nearestPitch} from './creature-models.js';
import {clamp, lerp, outCubic, outQuad, smoothstep, TAU} from './anim.js';
import {add, sortItems, hump, solveLeg, pieceChain} from './creature-core.js';

// ------------------------------------------------------------------ rusher idle fidgets (registered into the shared list, tagged `only`)
registerIdleFidget({id: 'rusher.groom', only: 'rusher', from: 2.2, dur: 2.6, apply(p, u) { p.groom = hump(u) ; p.chatter = hump(u) * 0.9; p.headZ -= 0.5 * hump(u); }});
registerIdleFidget({id: 'rusher.shake', only: 'rusher', from: 2.2, dur: 0.9, apply(p, u) { p.shake = (1 - u) * hump(Math.min(1, u * 1.6)); }});
registerIdleFidget({id: 'rusher.sniff', only: 'rusher', from: 2.2, dur: 2.2, apply(p, u) { p.sniff = hump(u); p.headYaw += 0.5 * Math.sin(u * TAU * 1.5) * hump(u); p.chatter += 0.4 * hump(u); }});
registerIdleFidget({id: 'rusher.scratch', only: 'rusher', from: 2.2, dur: 1.6, apply(p, u) { p.scratch = hump(u) * (0.6 + 0.4 * Math.sin(u * TAU * 5)); p.bodyZ -= 0.3 * hump(u); }});

const _cp = {groom: 0, shake: 0, sniff: 0, scratch: 0, chatter: 0, headYaw: 0, headZ: 0, bodyZ: 0};
const _k = {x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0};
const LEG_DEFS = [
  // hipX (rel. thorax), foot home x, y, tripod group
  {hx: 1.9, fx: 7.6, fy: 9.6, grp: 0, side: -1}, {hx: -0.2, fx: 1.0, fy: 11.8, grp: 1, side: -1}, {hx: -2.4, fx: -7.4, fy: 9.8, grp: 0, side: -1},
  {hx: 1.9, fx: 7.6, fy: 9.6, grp: 1, side: 1}, {hx: -0.2, fx: 1.0, fy: 11.8, grp: 0, side: 1}, {hx: -2.4, fx: -7.4, fy: 9.8, grp: 1, side: 1},
];
const OFF = 1.4;       // thorax centre ahead of the rig origin
export const RUSHER_RIG = {anchorZ: 4.4, shadowRx: 10.5, shadowRy: 5.4, base: 2.0};

/**
 * Rusher pose. inp: id t bodyYaw moveYaw amp phase | wind (0..1 claw wind-up) lunge (1..0 pounce, snaps from 1) | alert (1..0) hurt flash
 * idleT | dead (null or 0..1) deadT (s) fallYaw spin | scale
 */
export function rusherPose(kit, inp, out) {
  out.n = 0; out.fidget = '';
  const t = inp.t || 0, seed = (inp.id || 0) * 1.7, amp = clamp(inp.amp || 0), ph = inp.phase || 0;
  const bodyYaw0 = inp.bodyYaw || 0, moveYaw = inp.moveYaw ?? bodyYaw0;
  const wind = clamp(inp.wind || 0), lunge = clamp(inp.lunge || 0), hurt = inp.hurt || 0, fl = inp.flash || 0, alert = clamp(inp.alert || 0);
  const dead = inp.dead ?? null, deadT = inp.deadT || 0;
  const strike = lunge > 0 ? 1 - lunge : -1;       // 0..1 while the pounce plays
  const air = strike >= 0 ? Math.sin(Math.PI * Math.min(1, strike * 1.15)) : 0;
  _cp.groom = _cp.shake = _cp.sniff = _cp.scratch = _cp.chatter = _cp.headYaw = _cp.headZ = _cp.bodyZ = 0;
  if (dead === null && amp < 0.05 && wind === 0 && strike < 0 && (inp.idleT || 0) > 0) {
    const f = fidgetAt(inp.idleT, inp.id || 0, 'rusher');
    if (f) { f.fidget.apply(_cp, f.u, inp); out.fidget = f.fidget.id; }
  }
  const wig = Math.sin(ph * TAU) * 0.13 * amp + Math.sin(t * 61 + seed) * 0.05 * _cp.shake + Math.sin(t * 57 + seed) * 0.03 * wind;
  const bodyYaw = bodyYaw0 + wig - hurt * 0.12;
  const cb = Math.cos(bodyYaw), sb = Math.sin(bodyYaw);
  const bob = Math.sin(ph * TAU * 2) * 0.28 * amp, breath = Math.sin(t * 3.1 + seed) * 0.12 * (1 - amp);
  const base = dead === null ? RUSHER_RIG.base : 0.15;
  const frontUp = wind * 2.4 + alert * 1.7 + _cp.sniff * 1.3 + (strike >= 0 ? -0.8 * air : 0) - hurt * 0.4;
  const rearUp = -wind * 0.7 + air * 1.2 + _cp.scratch * 0.5;
  const zb = base + bob + breath + _cp.bodyZ + air * 4.2;
  const jx = Math.sin(t * 73 + seed) * 0.28 * wind + Math.sin(t * 90) * 0.35 * _cp.shake, jy = Math.cos(t * 67 + seed) * 0.28 * wind + Math.cos(t * 83) * 0.3 * _cp.shake;
  const squash = 1 + hurt * 0.1;
  const inv = dead !== null && deadT > 0.3;
  const sh = 1 - 0.1 * hurt;
  // body-local -> rig frame
  const WX = (lx, ly) => cb * lx - sb * ly + jx, WY = (lx, ly) => sb * lx + cb * ly + jy;

  // ---- dead: tumble up, flip over, land belly-up (the body parts swap to the inverted models at the flip)
  let flipLift = 0, deadSpin = 0;
  if (dead !== null) {
    const kd = Math.min(1, deadT / 0.34);
    flipLift = Math.sin(Math.PI * kd) * 5.6 * (deadT < 0.34 ? 1 : 0);
    deadSpin = (inp.spin || 1) * Math.min(1, deadT / 0.45) * 2.6 - 0.2 * (deadT / 0.34 > 1 ? 1 : 0);
  }
  const bY = bodyYaw + deadSpin * (dead !== null ? 1 : 0);
  const cB = Math.cos(bY), sB = Math.sin(bY);
  const WXd = (lx, ly) => (dead !== null ? cB * lx - sB * ly : WX(lx, ly)), WYd = (lx, ly) => (dead !== null ? sB * lx + cB * ly : WY(lx, ly));
  const zT = zb + frontUp * 0.5 + flipLift, zA = zb - 0.2 + rearUp * 0.5 + flipLift, zH = zb + 1.0 + frontUp + _cp.headZ + flipLift;
  const tK = inv ? kit.thoraxInv : kit.thorax, aK = inv ? kit.abdomenInv : kit.abdomen, hK = inv ? kit.headInv : kit.head;

  // abdomen: trails the yaw, pumps with the gait, curls up on the wind-up
  const aYaw = bY - wig * 1.7 - (wind * 0.0) + Math.sin(t * 2.2 + seed) * 0.03 * (1 - amp) + _cp.scratch * 0.2 * Math.sin(t * 30);
  add(out, aK, WXd(OFF - 2.9, 0), WYd(OFF - 2.9, 0), zA, aYaw, fl, 1, sh);
  add(out, tK, WXd(OFF, 0), WYd(OFF, 0), zT, bY, fl, squash, sh);
  const headYaw = bY + _cp.headYaw + Math.sin(t * 1.3 + seed) * 0.04 * (1 - amp) + (alert > 0 ? Math.sin(alert * 40) * 0.05 : 0) - hurt * 0.3;
  const hx = OFF + 3.2 - hurt * 0.6 + wind * 0.4, hItem = add(out, hK, WXd(hx, 0), WYd(hx, 0), zH, headYaw, fl);
  hItem.key += 0.2;
  const hcx = Math.cos(headYaw), hsn = Math.sin(headYaw);
  // mandibles
  let open = 0.2 + 0.1 * Math.sin(t * 2.4 + seed) + _cp.chatter * (0.18 + 0.2 * Math.sin(t * 28)) + wind * 0.65 + alert * 0.4;
  if (strike >= 0) open = strike < 0.25 ? 0.95 : lerp(0.95, 0.05, clamp((strike - 0.25) * 3));
  if (dead !== null) open = 0.6 + 0.15 * Math.sin(deadT * 24) * Math.max(0, 1 - deadT * 0.8);
  for (const s of [-1, 1]) {
    const mx = hx + 5.2, my = s * 0.3, mi = add(out, s > 0 ? hK === kit.headInv ? kit.mandR : kit.mandR : kit.mandL, WXd(mx, my) + hcx * 0 , WYd(mx, my), zH + (inv ? 0.6 : 0.7), headYaw + s * open, fl);
    mi.key = hItem.key + 0.1;
  }
  // eyes: additive glow (a hotter, wider flare on the wind-up and when alerted)
  {
    const it = add(out, null, WXd(hx + 3.4, 0), WYd(hx + 3.4, 0), zH + (inv ? 0.5 : 3.4), 0, 0);
    it.key = hItem.key + 0.3; it.draw = drawEyes; it.a = headYaw; it.b = 0.5 + wind * 0.9 + alert * 0.8 + (dead !== null ? -0.5 : 0); it.c = dead !== null ? 0 : 1; it.d = kit.spec.c.eye;
  }
  // antennae
  if (dead === null || deadT < 0.4) {
    for (const s of [-1, 1]) {
      const it = add(out, null, WXd(hx + 1.2, s * 1.3), WYd(hx + 1.2, s * 1.3), zH + 3.9, 0, 0);
      it.key = hItem.key + 0.05; it.draw = drawAntenna;
      const tw = Math.sin(t * 9 + seed + s) * 0.5 + Math.sin(t * 14.3 + s * 2) * 0.35 + _cp.sniff * Math.sin(t * 25) * 0.9;
      const flare = 0.3 + alert * 1.4 + wind * 0.6 + _cp.sniff * 0.7;
      const ang = headYaw + s * (0.55 + flare * 0.35) + tw * 0.35, rise = 3.6 + alert * 1.6 - wind * 0.6;
      if (!it.pts) it.pts = new Float32Array(8);
      // 3 segments: base -> mid -> tip, springy
      const l1 = 3.2, l2 = 3.4 + flare;
      it.pts[0] = Math.cos(ang) * l1; it.pts[1] = Math.sin(ang) * l1; it.pts[2] = rise * 0.6;
      const ang2 = ang + s * 0.5 + tw * 0.45;
      it.pts[3] = it.pts[0] + Math.cos(ang2) * l2; it.pts[4] = it.pts[1] + Math.sin(ang2) * l2; it.pts[5] = rise * 0.6 - 0.6 - 1.4 * (1 - flare * 0.4);
      it.pts[6] = hcx; it.pts[7] = hsn;
      it.a = hurt;
    }
  }

  // ---- legs (six, own stacks: femur x2, tibia, claw; tripod gait with planted feet)
  const hipZ = zb + 1.9 + (dead !== null ? 0.2 : 0);
  const tpx = Math.cos(moveYaw), tpy = Math.sin(moveYaw), step = 3.9 * amp;
  for (let i = 0; i < 6; i++) {
    const L = LEG_DEFS[i], s = L.side;
    let hxl = OFF + L.hx, hyl = s * 2.9, hz = hipZ - (L.hx > 1 ? -0.3 : 0.1);
    let fxl = OFF + L.fx, fyl = s * L.fy;
    let fx, fy, fz = 0;
    if (dead === null) {
      const u = (ph * 2 + L.grp * 0.5) % 1;           // tripod groups half a cycle apart
      let off, lift = 0;
      if (u < 0.55) { off = step * (1 - 2 * (u / 0.55)); }
      else { const w = (u - 0.55) / 0.45; off = step * (-1 + 2 * smoothstep(w)); lift = Math.sin(Math.PI * w) * (1.6 + 1.6 * amp); }
      const home = WX(fxl, fyl), homeY = WY(fxl, fyl);
      fx = home + tpx * off * (amp > 0.02 ? 1 : 0); fy = homeY + tpy * off * (amp > 0.02 ? 1 : 0);
      // idle: occasional foot taps and shuffles; wind-up braces the legs wide and low; pounce tucks them
      const tap = Math.max(0, Math.sin(t * 1.7 + i * 2.3 + seed)) ** 24 * (1 - amp);
      lift += tap * 1.5;
      const brace = wind * 0.9 + alert * 0.4;
      fx += (cb * (-0.6 * brace) - sb * s * 1.6 * brace); fy += (sb * (-0.6 * brace) + cb * s * 1.6 * brace);
      if (strike >= 0) { const tk = air * 3.8; lift += tk; fx -= cb * air * 1.8 * (L.hx > 1 ? -1 : 1) ; fy -= sb * air * 1.8 * (L.hx > 1 ? -1 : 1); fx = lerp(fx, WX(hxl, hyl), air * 0.35); fy = lerp(fy, WY(hxl, hyl), air * 0.35); }
      if (_cp.scratch > 0 && i === 2) { lift += 3.2 * _cp.scratch; fx += cb * 1.5 * Math.sin(t * 30) * _cp.scratch; }
      fz = lift;
    } else {
      // belly-up: legs pull into a curl above the body and twitch, fading out
      const k = clamp(deadT / 0.9), curl = outCubic(clamp((deadT - 0.25) / 0.5)), tw = Math.sin(deadT * 22 + i * 1.9) * Math.max(0, 1 - deadT / 1.15) ** 1.4;
      const flung = deadT < 0.34 ? 1 : 0;
      const cx = L.hx * 0.7 + OFF + L.fx * (0.35 - 0.1 * curl) * 0.5, cy = s * (L.fy * lerp(0.9, 0.38, curl));
      fx = WXd(cx + tw * 0.9, cy + s * tw * 0.7); fy = WYd(cx + tw * 0.9, cy + s * tw * 0.7);
      fz = lerp(1.2, 8.2 + (i % 3) * 0.7, curl) + tw * 1.6 + flung * 2 + k * 0;
      if (flung) { fx = WXd(OFF + L.fx * 1.15, s * L.fy * 1.15); fy = WYd(OFF + L.fx * 1.15, s * L.fy * 1.15); fz = 3 + flipLift * 0.5; }
      hxl = OFF + L.hx; hyl = s * 2.9;
    }
    const hxw = WXd(hxl, hyl), hyw = WYd(hxl, hyl);
    solveLeg(hxw, hyw, hz + flipLift, fx, fy, fz + flipLift * (dead !== null ? 0.5 : 0), 4.9, 6.3, _k);
    legBones(out, kit, hxw, hyw, hz + flipLift, _k, fl);
  }

  // ---- raptorial blade arms (two segments: upper arm piece chain + a pitched blade)
  for (const s of [-1, 1]) {
    const sx0 = OFF + 2.8, sy0 = s * 2.3, shz = zb + 3.2 + frontUp * 0.7;
    // targets in body frame (forward, side, up)
    let ex = 2.4, ey = s * 3.4, ez = 1.1, bYaw = s * 0.22, bPitch = 0.22;      // rest: folded forward like a mantis
    const sway = Math.sin(ph * TAU + (s > 0 ? 0 : Math.PI)) * 0.6 * amp;
    ex += sway; bYaw += sway * 0.08;
    if (_cp.groom > 0) { const g = _cp.groom, a = s > 0 ? 0 : Math.PI; ex = lerp(ex, 3.3, g); ey = lerp(ey, s * 1.6, g); ez = lerp(ez, 3.2 + 0.7 * Math.sin(t * 9 + a), g); bYaw = lerp(bYaw, -s * 0.5, g); bPitch = lerp(bPitch, 1.0, g); }
    if (alert > 0) { ez += alert * 1.2; ey += s * alert * 0.8; bPitch += alert * 0.5; bYaw += s * alert * 0.3; }
    if (wind > 0) { const w = outQuad(wind); ex = lerp(ex, 0.0, w); ey = lerp(ey, s * 4.1, w); ez = lerp(ez, 4.4, w); bYaw = lerp(bYaw, s * 0.35, w); bPitch = lerp(bPitch, 1.15, w); }
    if (strike >= 0) { const q = outCubic(clamp(strike * 1.8)); ex = lerp(0, 3.3, q); ey = lerp(s * 4.1, s * 1.1, q); ez = lerp(4.4, 0.8, q); bYaw = lerp(s * 0.35, -s * 0.55, q); bPitch = lerp(1.15, -0.35, q); }
    if (dead !== null) { const c = outCubic(clamp(deadT / 0.7)); ex = lerp(2.4, 0.6, c); ey = lerp(s * 4.0, s * 2.2, c); ez = lerp(1.1, 6.2, c); bYaw = lerp(s * 0.5, s * 0.9, c) + Math.sin(deadT * 19 + s) * 0.18 * Math.max(0, 1 - deadT); bPitch = lerp(0.2, 1.15, c); }
    const exw = WXd(sx0 + ex, sy0 + (ey - sy0 * 0) * 0.0 + ey - s * 2.3 + s * 0), eyw = WYd(sx0 + ex, ey);
    const shx = WXd(sx0, sy0), shy = WYd(sx0, sy0), ezw = shz + ez;
    // upper arm: 2 pieces from shoulder to elbow
    pieceChain(out, kit.arm, shx, shy, shz, WXd(sx0 + ex, ey), WYd(sx0 + ex, ey), ezw, 2, fl);
    void exw; void eyw;
    const pi = nearestPitch(bPitch), bm = bladeModel(kit.spec, s, BLADE_PITCHES[pi]);
    const b = add(out, bm.model, WXd(sx0 + ex, ey), WYd(sx0 + ex, ey), ezw - bm.pz, bY + bYaw + (s > 0 ? 0 : 0), fl);
    b.key += 0.35;
  }
  out.shadowScale = dead !== null ? 1 : 1 - air * 0.3;
  sortItems(out);
  return out;
}

function legBones(out, kit, hx, hy, hz, k, fl) {
  pieceChain(out, kit.femur, hx, hy, hz, k.x, k.y, k.z, 3, fl);
  pieceChain(out, kit.tibia, k.x, k.y, k.z, k.fx, k.fy, k.fz, 4, fl, kit.tip);
  const kn = add(out, kit.knob, k.x, k.y, k.z - 0.7, 0, fl); kn.key = k.y + k.z * 0.03 + 0.02;
}

// ------------------------------------------------------------------ procedural bits
function drawEyes(ctx, x, y, it) {
  const a = it.b, hot = a > 0.8 ? 1 : 0;
  if (!it.c) return;
  const ca = Math.cos(it.a), sa = Math.sin(it.a);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const s of [-1, 1]) {
    const ox = -ca * 0.0 - sa * s * 2.9 * 0.55 + ca * 0.5, oy = ca * s * 2.9 * 0.55 + sa * 0.5 - 0.2;
    const r = 2.6 + a * 2.6, gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
    gr.addColorStop(0, hot ? 'rgba(255,250,220,0.9)' : 'rgba(255,230,110,0.7)'); gr.addColorStop(0.5, 'rgba(255,170,60,0.28)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawAntenna(ctx, x, y, it, anchorZ) {
  const p = it.pts, T = STACK_TILT;
  const x1 = x + p[0], y1 = y + p[1] - p[2] * T, x2 = x + p[3], y2 = y + p[4] - p[5] * T;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#120f18'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2 + p[1] * 0.2, (y1 + y2) / 2 - 0.8, x2, y2); ctx.stroke();
  ctx.strokeStyle = '#d8c9a8'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2 + p[1] * 0.2, (y1 + y2) / 2 - 0.8, x2, y2); ctx.stroke();
  ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(x2, y2, 0.9, 0, TAU); ctx.fill();
  ctx.restore();
  void anchorZ;
}

