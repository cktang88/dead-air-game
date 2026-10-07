// BRUTE pose: a hunched hulk on the humanoid recipe (stomping legs, coiling torso) that holds a sledgehammer in TWO hands.
// The hammer is the driver: its grip point and pitch are keyframed per state (carry, heavy overhead wind-up, slam, recovery,
// enraged, staggered), then both arms are solved onto it with a 3D two-bone solver. Models: brute-models.js.
import {registerIdleFidget, fidgetAt} from './rig2d.js';
import {hammerModel, HAMMER_PITCHES, nearestHammerPitch} from './brute-models.js';
import {walkPose, clamp, lerp, outCubic, inQuad, TAU} from './anim.js';
import {add, sortItems, hump, solveLeg, pieceChain} from './creature-core.js';

export const BRUTE_RIG = {anchorZ: 13.5, shadowRx: 17, shadowRy: 9, torsoZ: 8.4, headLift: 14.0, shoulderY: 11.4, shoulderZ: 12.2, bone: 9.3};

registerIdleFidget({id: 'brute.neck', body: 'brute', from: 2.5, dur: 2.2, apply(p, u) { const a = u < 0.35 ? u / 0.35 : u < 0.5 ? 1 : u < 0.8 ? 1 - 2 * (u - 0.5) / 0.3 : -1 + (u - 0.8) / 0.2; p.neck = a * hump(Math.min(1, u * 1.05)) * 1.0 + (u > 0.3 && u < 0.36 ? 0.15 : 0); p.tilt = a; }});
registerIdleFidget({id: 'brute.roll', body: 'brute', from: 2.5, dur: 2.0, apply(p, u) { p.roll = hump(u); p.rollPhase = u * TAU * 1.0; }});
registerIdleFidget({id: 'brute.tap', body: 'brute', from: 2.5, dur: 1.8, apply(p, u) { p.tap = Math.max(0, Math.sin(u * TAU * 2.5)) * hump(Math.min(1, u * 1.2)); }});
registerIdleFidget({id: 'brute.knuckles', body: 'brute', from: 2.5, dur: 2.0, apply(p, u) { p.knuckles = hump(u); p.headZ -= 0.4 * hump(u); }});

const _bp = {neck: 0, tilt: 0, roll: 0, rollPhase: 0, tap: 0, knuckles: 0, headZ: 0};
const _wp = {a: 0, b: 0, liftA: 0, liftB: 0, bob: 0};
const _e = {x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0};
const HAM_LEN_HEAD = 20;   // world units from the grip to the head centre

/**
 * inp: id t bodyYaw moveYaw amp phase | wind (0..1 heavy wind-up) lunge (1..0 the slam) rec (1..0 recovery after the slam) |
 *      hurt flash enrage (0..1) stagger (0..1) alert (1..0) | idleT | dead (null | 0..1) deadT (s) fallYaw spin
 */
export function brutePose(kit, inp, out) {
  out.n = 0; out.fidget = '';
  const t = inp.t || 0, seed = (inp.id || 0) * 1.7, amp = clamp(inp.amp || 0), ph = inp.phase || 0;
  const bodyYaw = inp.bodyYaw || 0, moveYaw = inp.moveYaw ?? bodyYaw;
  const wind = clamp(inp.wind || 0), lunge = clamp(inp.lunge || 0), rec = clamp(inp.rec || 0), hurt = inp.hurt || 0, fl = inp.flash || 0;
  const enr = clamp(inp.enrage || 0), stag = clamp(inp.stagger || 0), alert = clamp(inp.alert || 0), dead = inp.dead ?? null, deadT = inp.deadT || 0;
  const strike = lunge > 0 ? 1 - lunge : -1;             // 0..1 while the slam plays
  const e = strike >= 0 ? Math.min(1, strike * 1.25) ** 1.7 : 0;   // slam easing: accelerates into the floor
  _bp.neck = _bp.tilt = _bp.roll = _bp.rollPhase = _bp.tap = _bp.knuckles = _bp.headZ = 0;
  if (dead === null && amp < 0.05 && wind === 0 && strike < 0 && rec === 0 && (inp.idleT || 0) > 0) {
    const f = fidgetAt(inp.idleT, inp.id || 0, 'brute');
    if (f) { f.fidget.apply(_bp, f.u, inp); out.fidget = f.fidget.id; }
  }
  const legYaw = bodyYaw + angDiff(bodyYaw, moveYaw) * clamp(amp * 2.2);
  walkPose(ph, _wp);
  const w = outCubic(wind), shakeJ = enr * 0.28 + (wind > 0.5 ? (wind - 0.5) * 0.4 : 0);
  const jx = Math.sin(t * 61 + seed) * shakeJ, jy = Math.cos(t * 53 + seed) * shakeJ;
  const breath = Math.sin(t * (2.0 + enr * 5.5) + seed) * (0.14 + 0.2 * enr) * (1 - amp * 0.6);
  const stride = 3.6 * amp, liftH = 1.9;
  const stompBob = _wp.bob * amp * 0.9;
  let lean = 1.1 * amp + 2.0 * enr + (strike >= 0 ? 4.6 * e : 0) + 3.6 * rec * rec - 2.9 * w - 3.0 * stag - 1.1 * hurt;
  let twist = Math.sin(ph * TAU) * 0.11 * amp + 0.42 * w * (1 - e) - (strike >= 0 ? 0.55 * e : 0) + Math.sin(t * 9 + seed) * 0.12 * stag + _bp.roll * Math.sin(_bp.rollPhase) * 0.18;
  if (strike >= 0) twist = lerp(0.42, -0.2, e);
  const sway = Math.sin(ph * TAU) * 0.9 * amp + Math.sin(t * 7.5 + seed) * 1.6 * stag + (_bp.roll > 0 ? Math.sin(_bp.rollPhase) * 0.9 * _bp.roll : 0);
  const tz = BRUTE_RIG.torsoZ - stompBob * 0.9 + breath - (strike >= 0 ? 1.6 * e : 0) - 1.3 * rec * rec + 0.9 * w - hurt * 0.5 - 0.7 * enr + (_bp.roll ? 0.3 * _bp.roll : 0);
  const bY = bodyYaw + twist;
  const cb = Math.cos(bodyYaw), sb = Math.sin(bodyYaw), ct = Math.cos(bY), st = Math.sin(bY);
  const WX = (lx, ly) => cb * lx - sb * ly + jx, WY = (lx, ly) => sb * lx + cb * ly + jy;
  const squash = 1 + hurt * 0.06;

  if (dead !== null) return bruteDead(kit, inp, out, {t, seed, bodyYaw, fl, deadT, dead});

  // ---- legs: heavy stomp, planted wide on the wind-up, one foot thrown forward on the slam
  const legW = 4.9 + 0.7 * w + 0.3 * enr;
  for (const [side, f, lift] of [[-1, _wp.a, _wp.liftA], [1, _wp.b, _wp.liftB]]) {
    let fwd = f * stride + (strike >= 0 ? side * -2.2 * e : 0) + side * -1.5 * rec * rec + (wind > 0 ? side * 1.4 * w : 0);
    const lat = side * legW;
    const cl = Math.cos(legYaw), sl = Math.sin(legYaw);
    const ll = lift * liftH * amp * (1 + 0.5 * enr);
    const it = add(out, kit.leg, cl * fwd - sl * lat + jx * 0.5, sl * fwd + cl * lat + jy * 0.5, ll, legYaw, fl);
    it.key += 0.001 * side;
  }
  // ---- torso, head
  const tlx = lean * 0.9 - 0.6 * (strike >= 0 ? 0 : 0), tly = sway;
  const tx = WX(tlx, tly), ty = WY(tlx, tly);
  add(out, kit.torso, tx, ty, tz, bY, fl, squash, 1 - hurt * 0.05);
  const headDip = 0.5 + enr * 1.3 + hurt * 0.3 - w * 0.8 + (strike >= 0 ? 0.7 * e : 0) + _bp.knuckles * 0.3;
  const hxl = tlx + 0.9 + 2.3 + lean * 0.35, hyl = tly + _bp.neck * 0.35;
  const headYawOff = _bp.neck * 0.55 + Math.sin(t * 8 + seed) * 0.3 * stag - (hurt ? hurt * 0.35 : 0) + (alert > 0 ? Math.sin(alert * 36) * 0.06 : 0) + Math.sin(t * 1.1 + seed) * 0.04;
  const hz = tz + BRUTE_RIG.headLift - headDip + _bp.headZ + alert * 0.9 - 1.6 * stag;
  const headYaw = bY + headYawOff;
  const hI = add(out, kit.head, WX(hxl, hyl), WY(hxl, hyl), hz, headYaw, fl);
  hI.key += 0.15;
  // lens glow (additive) and mask hoses (procedural)
  {
    const lens = add(out, null, WX(hxl + 3.6, hyl), WY(hxl + 3.6, hyl), hz + 6.7, 0, 0);
    lens.key = hI.key + 0.3; lens.draw = drawLenses; lens.a = headYaw; lens.b = enr + wind * 0.5 + alert * 0.4 + 0.2; lens.c = enr; lens.d = kit.spec.c.lens;
    const hose = add(out, null, WX(hxl + 0.5, hyl), WY(hxl + 0.5, hyl), hz + 2.6, 0, 0);
    hose.key = hI.key - 0.05; hose.draw = drawHoses; hose.a = headYaw; hose.b = bY; hose.c = tz;
    if (!hose.pts) hose.pts = new Float32Array(8);
    hose.pts[0] = WX(tlx - 5.9, tly) - hose.x; hose.pts[1] = WY(tlx - 5.9, tly) - hose.y; hose.pts[2] = tz + 17.2 - hose.z;
    hose.pts[3] = Math.sin(t * 2.2 + seed) * 0.6 + Math.sin(ph * TAU * 2) * 0.8 * amp + enr * Math.sin(t * 40) * 0.5; hose.pts[4] = kit.spec.elite ? 1 : 0;
  }
  // belt chain: pendulum from the left hip, swings with the gait and the slam
  {
    const ch = add(out, null, WX(tlx + 3.0, tly - 6.0), WY(tlx + 3.0, tly - 6.0), tz + 3.4, 0, 0);
    ch.key = ty + 3 + (tz + 3.4) * 0.03; ch.draw = drawChain; ch.a = Math.sin(ph * TAU + 1) * 1.6 * amp + (strike >= 0 ? 3 * e : 0) + Math.sin(t * 1.7 + seed) * 0.25 + stag * Math.sin(t * 8) * 1.4; ch.b = 5 + (kit.spec.elite ? 2 : 0); ch.c = bY;
  }

  // ---- hammer: keyframed grip (body frame: forward, right, height) + pitch + yaw offset
  let gx = 7.6, gy = 4.4, gz = tz + 3.9, gp = 0.9, gyaw = -0.28;
  gz += _wp.bob * amp * 0.2 - stompBob * 0.2;
  gp += Math.sin(ph * TAU) * 0.07 * amp;
  if (_bp.tap > 0) { gz -= 1.6 * _bp.tap; gp -= 0.55 * _bp.tap; }
  if (_bp.knuckles > 0) { gx -= 2.5 * _bp.knuckles; gz += 2.4 * _bp.knuckles; gp += 0.4 * _bp.knuckles; gy -= 1.4 * _bp.knuckles; }
  if (enr > 0) { gp += 0.28 * enr; gz += 1.4 * enr; gx -= 1.0 * enr; }
  if (alert > 0) { gp += 0.3 * alert; gz += 1.0 * alert; }
  if (wind > 0) {
    gx = lerp(gx, 0.2, w); gy = lerp(gy, 2.2, w); gz = lerp(gz, tz + 15.6, w); gp = lerp(gp, 1.57, outCubic(clamp(wind * 1.2))); gyaw = lerp(gyaw, 0.18, w);
    gp = Math.min(1.57, gp);
  }
  if (strike >= 0 || rec > 0) {
    const gzEnd = 4.8, pEnd = -0.07;
    if (strike >= 0) {
      const es = e;
      gx = lerp(0.2, 10.6, es); gy = lerp(2.2, 0.6, es); gz = lerp(tz + 15.6, gzEnd, es); gp = lerp(1.57, pEnd, Math.min(1, es * 1.08)); gyaw = lerp(0.18, 0, es);
    } else {
      const r = 1 - rec, k = r * r * (3 - 2 * r);       // lifts off the floor slowly, back to the carry
      const cgx = 7.6, cgy = 4.4, cgz = tz + 3.9, cgp = 0.9, cgyaw = -0.28;
      gx = lerp(10.6, cgx, k); gy = lerp(0.6, cgy, k); gz = lerp(gzEnd, cgz, k); gp = lerp(pEnd, cgp, k); gyaw = lerp(0, cgyaw, k);
      gz += 0.5 * hump(Math.min(1, rec * 3));
    }
  }
  if (stag > 0) { gx = lerp(gx, 5.4, stag); gy = lerp(gy, 5.0, stag); gz = lerp(gz, tz + 1.6, stag); gp = lerp(gp, 0.1, stag); gyaw = lerp(gyaw, -0.55, stag); }
  gp = Math.max(-0.5, Math.min(1.57, gp));
  const cp = Math.cos(gp), sp = Math.sin(gp), gYaw = bodyYaw + gyaw, cgy = Math.cos(gYaw), sgy = Math.sin(gYaw);
  const gX = WX(gx + tlx * 0.4, gy + tly), gY = WY(gx + tlx * 0.4, gy + tly);
  const hm = hammerModel(kit.spec, HAMMER_PITCHES[nearestHammerPitch(gp)]);
  const hamI = add(out, hm.model, gX, gY, gz - hm.pz, gYaw, fl);
  hamI.key = gY + (gz + sp * 10) * 0.03 + 0.4 + Math.max(0, sp) * 4;   // a raised hammer head draws over the head
  if (gp > 1.0) hamI.key += 3;
  out.hammerX = gX + cgy * cp * HAM_LEN_HEAD; out.hammerY = gY + sgy * cp * HAM_LEN_HEAD; out.hammerZ = gz + sp * HAM_LEN_HEAD;
  out.hamPitch = gp;
  // hands: right at the grip, left up the shaft
  const hRx = gX, hRy = gY, hRz = gz, hLx = gX + cgy * cp * 4.4, hLy = gY + sgy * cp * 4.4, hLz = gz + sp * 4.4;
  for (const side of [1, -1]) {
    const shx = WX(tlx + 1.3, tly + side * BRUTE_RIG.shoulderY), shy = WY(tlx + 1.3, tly + side * BRUTE_RIG.shoulderY), shz = tz + BRUTE_RIG.shoulderZ;
    const hx = side > 0 ? hRx : hLx, hy = side > 0 ? hRy : hLy, hzz = side > 0 ? hRz : hLz;
    solveLeg(shx, shy, shz, hx, hy, hzz, BRUTE_RIG.bone, BRUTE_RIG.bone, _e, -sb * side, cb * side, -0.35);
    pieceChain(out, kit.upper, shx, shy, shz, _e.x, _e.y, _e.z, 3, fl, null, 2.2);
    pieceChain(out, kit.fore, _e.x, _e.y, _e.z, _e.fx, _e.fy, _e.fz, 3, fl, null, 2.2);
    const f = add(out, kit.fist, _e.fx, _e.fy, _e.fz - 2.4, gYaw, fl);
    f.key = hamI.key + 0.2;
  }
  out.shadowScale = 1;
  sortItems(out);
  return out;
}
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }

// ------------------------------------------------------------------ death: knees buckle, the hammer slips, the body folds forward and thuds
function bruteDead(kit, inp, out, {t, seed, bodyYaw, fl, deadT}) {
  const fallYaw = inp.fallYaw ?? bodyYaw, k1 = clamp(deadT / 0.4), k2 = clamp((deadT - 0.3) / 0.45), k3 = clamp((deadT - 0.7) / 0.35);
  const ease2 = outCubic(k2), sx = Math.cos(fallYaw), sy = Math.sin(fallYaw);
  const spin = (inp.spin || 0) * 0.5 * (k1 * 0.6 + k2 * 0.4);
  const cb = Math.cos(bodyYaw), sb = Math.sin(bodyYaw);
  // legs fold: kneel (z sinks) then splay back
  for (const side of [-1, 1]) {
    const bx = -sx * 2.5 * ease2 - side * 0.0, by = -sy * 2.5 * ease2;
    const lat = side * (4.9 + 1.4 * ease2);
    add(out, kit.leg, bx + cb * (-2.0 * k1) - sb * lat, by + sb * (-2.0 * k1) + cb * lat, Math.max(0, 0.6 * (1 - k2)), bodyYaw + side * 0.3 * k2 + spin, fl);
  }
  const tz = lerp(BRUTE_RIG.torsoZ, 5.0, outCubic(k1)) - ease2 * 3.4 + 0.3 * Math.sin(deadT * 30) * (1 - k3) * (deadT > 0.7 ? 0.5 : 0);
  const fwd = 2.0 * k1 + 7.5 * ease2, tx = sx * fwd, ty = sy * fwd;
  const sqY = 1 + 0.12 * k2, sqX = 1 - 0.06 * k2;
  add(out, kit.torso, tx, ty, Math.max(2.6, tz), bodyYaw + spin, fl, sqX, sqY);
  const hx = sx * (fwd + 3.6 + 6.5 * ease2) , hy = sy * (fwd + 3.6 + 6.5 * ease2);
  const hI = add(out, kit.head, hx, hy, Math.max(1.6, tz + BRUTE_RIG.headLift - 3.2 * k1 - 9 * ease2), bodyYaw + spin * 1.5 + 0.5 * k2 * (inp.spin > 0 ? 1 : -1), fl);
  hI.key += 0.3;
  // the hammer: slips from the hands, tumbles away and lands on the floor beside the body
  const slip = clamp((deadT - 0.1) / 0.55), hp = lerp(0.9, -0.07, outCubic(slip));
  const gyaw = bodyYaw - 0.28 + (inp.spin >= 0 ? 1 : -1) * (0.8 * outCubic(slip) + 0.0);
  const gx = lerp(7.6, 8 + 7 * slip, slip), gy = lerp(4.4, (inp.spin >= 0 ? 1 : -1) * 11, outCubic(slip));
  const gz = lerp(BRUTE_RIG.torsoZ + 3.9, 4.6, inQuad(slip)) - 0 + Math.max(0, Math.sin(slip * Math.PI) * 4);
  const hm = hammerModel(kit.spec, HAMMER_PITCHES[nearestHammerPitch(hp)]);
  const cb2 = Math.cos(bodyYaw), sb2 = Math.sin(bodyYaw);
  const hmI = add(out, hm.model, cb2 * gx - sb2 * gy, sb2 * gx + cb2 * gy, Math.max(gz, 4.0) - hm.pz, gyaw, fl);
  hmI.key = ty + 6;
  // arms flop at the sides
  for (const side of [1, -1]) {
    const shx = tx + cb * 1.0 - sb * side * 11.2 * (1 + 0.1 * ease2), shy = ty + sb * 1.0 + cb * side * 11.2 * (1 + 0.1 * ease2);
    const hx2 = shx + sx * (4 + 6 * ease2) - sb * side * 2.5 * ease2, hy2 = shy + sy * (4 + 6 * ease2) + cb * side * 2.5 * ease2;
    const hz2 = Math.max(1.2, tz + 11 - 10 * ease2);
    solveLeg(shx, shy, Math.max(2.5, tz + 10.5), hx2, hy2, hz2, BRUTE_RIG.bone, BRUTE_RIG.bone, _e, -sb * side, cb * side, -0.35);
    pieceChain(out, kit.upper, shx, shy, Math.max(2.5, tz + 10.5), _e.x, _e.y, _e.z, 3, fl, null, 2.2);
    pieceChain(out, kit.fore, _e.x, _e.y, _e.z, _e.fx, _e.fy, _e.fz, 3, fl, null, 2.2);
    add(out, kit.fist, _e.fx, _e.fy, _e.fz - 2.4, bodyYaw, fl);
  }
  out.hammerX = out.hammerY = out.hammerZ = 0; out.hamPitch = 0;
  sortItems(out);
  return out;
}

// ------------------------------------------------------------------ procedural bits (screen-space strokes at the item's projected position)
function drawLenses(ctx, x, y, it) {
  const a = it.b, ca = Math.cos(it.a), sa = Math.sin(it.a), enr = it.c;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const s of [-1, 1]) {
    const ox = -sa * s * 2.5 * 0.9 + ca * 0.4, oy = ca * s * 2.5 * 0.9 + sa * 0.4;
    const r = 2.8 + a * 3.2 + enr * 1.5, gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
    gr.addColorStop(0, enr > 0.3 ? 'rgba(255,90,60,0.85)' : 'rgba(255,190,90,0.7)'); gr.addColorStop(0.5, enr > 0.3 ? 'rgba(255,40,20,0.3)' : 'rgba(255,140,50,0.22)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
const T = 0.72;
function drawHoses(ctx, x, y, it) {
  // two corrugated hoses from the mask ports to the tank valves on the back
  const p = it.pts, sway = p[3], ex = x + p[0], ey = y + p[1] - p[2] * T;
  ctx.save(); ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ca = Math.cos(it.b), sa = Math.sin(it.b), side = s * 3.3;
    const sx0 = x - sa * side * 1.7 + ca * 0.0, sy0 = y + ca * side * 1.7;
    const ex2 = ex - sa * s * 3.2, ey2 = ey + ca * s * 3.2;
    const mx = (sx0 + ex2) / 2 + sway * s, my = (sy0 + ey2) / 2 + 4.5 + Math.abs(sway) * 0.5;
    ctx.strokeStyle = '#120f18'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.quadraticCurveTo(mx, my, ex2, ey2); ctx.stroke();
    ctx.strokeStyle = '#4d4856'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.quadraticCurveTo(mx, my, ex2, ey2); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,150,170,0.55)'; ctx.lineWidth = 0.6; ctx.setLineDash([0.9, 1.3]); ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.quadraticCurveTo(mx, my, ex2, ey2); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}
function drawChain(ctx, x, y, it) {
  const n = it.b | 0, sw = it.a;
  ctx.save();
  let px = x, py = y;
  for (let i = 0; i < n; i++) {
    const u = (i + 1) / n, nx = x + sw * u * u * 1.1 + Math.sin(it.c) * u * 0.5, ny = y + u * 8.0 * (1 - Math.abs(sw) * 0.04) - 1.2 * Math.abs(sw) * u * u;
    ctx.fillStyle = '#120f18'; ctx.beginPath(); ctx.ellipse((px + nx) / 2, (py + ny) / 2, 1.5, 1.05, Math.atan2(ny - py, nx - px) + (i % 2 ? Math.PI / 2 : 0), 0, TAU); ctx.fill();
    ctx.fillStyle = i % 2 ? '#8f95a3' : '#5a5f6c'; ctx.beginPath(); ctx.ellipse((px + nx) / 2, (py + ny) / 2, 1.0, 0.6, Math.atan2(ny - py, nx - px) + (i % 2 ? Math.PI / 2 : 0), 0, TAU); ctx.fill();
    px = nx; py = ny;
  }
  ctx.fillStyle = '#d6b45f'; ctx.beginPath(); ctx.arc(px, py + 0.4, 1.3, 0, TAU); ctx.fill();    // a brass tag on the end
  ctx.restore();
}
