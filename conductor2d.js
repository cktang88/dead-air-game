// Renderer glue for THE CONDUCTOR's stacked body: per-frame inputs from the boss brain state (e.boss), trailing cables, the baton trail,
// and per-step particles (mast sparks, phase-shift burst, death beats). boss2d.js calls drawConductor; render2d calls updateConductor.
import {STACK_TILT, tintVariant} from './stack2d.js';
import {drawRig} from './rig2d.js';
import {clamp, angDiff, TAU, damp} from './anim.js';
import {newCreatureOut} from './creature-core.js';
import {conductorPose, CONDUCTOR_RIG, CONDUCTOR_SCALE} from './conductor-pose.js';

export const DEATH_TOTAL = 2.7;       // seconds the death animation runs (the boss corpse timer is set to match in game.js)
const T = STACK_TILT, R = CONDUCTOR_RIG;
const _out = newCreatureOut(), _inp = {};
const FLASH_VARIANT = null;
void tintVariant; void FLASH_VARIANT;

/** Seconds since the Conductor died (0 while alive), robust to whatever corpse timer game.js starts from. */
export function deadTimeOf(e, v) {
  if (e.alive) return 0;
  if (v.corpse0 === undefined) v.corpse0 = e.corpseTimer ?? 1.3;
  return Math.max(0, v.corpse0 - (e.corpseTimer ?? 0));
}

function ensure(v) {
  if (v.c) return v.c;
  const trail = {x: new Float32Array(64), y: new Float32Array(64), head: 0, n: 0, ox: 0, oy: 0};
  // four cables, each a chain of 8 points in world coordinates (x, y, z)
  const cables = []; for (let i = 0; i < 4; i++) cables.push({x: new Float32Array(8), y: new Float32Array(8), z: new Float32Array(8), init: false, off: (i - 1.5) * 1.5});
  return (v.c = {last: null, px: 0, py: 0, phase: 0, mv: 0, mvAng: 0, fb: 0, trail, cables, face: {level: 0, t: 0, tempo: 1, mode: 'idle', beat: 0, beatIndex: 0, dead: null, deadT: 0, flash: 0, invuln: false, exposed: false, hurt: 0, voice: 0.5}, stage: '', beatSeen: -1});
}

/**
 * Draws the Conductor. ctx is translated to (e.x, e.y); `ang` is the smoothed body angle, `beat` = {index, phase} from the music clock or null.
 * Returns nothing; boss2d keeps drawing its rings and overlays around it.
 */
export function drawConductor(ctx, e, v, now, ang, beat) {
  const c = ensure(v), b = e.boss || {}, dead = !e.alive, lvl = Math.max(0, Math.min(2, (b.phase || 1) - 1));
  const dt = c.last === null ? 0.016 : clamp(now - c.last, 0, 0.05); c.last = now;
  // movement: speed from the position delta
  if (c.first === undefined) { c.first = true; c.px = e.x; c.py = e.y; }
  const mvx = (e.x - c.px) / Math.max(dt, 1e-3), mvy = (e.y - c.py) / Math.max(dt, 1e-3); c.px = e.x; c.py = e.y;
  const speed = Math.min(300, Math.hypot(mvx, mvy));
  c.mv = damp(c.mv, clamp(speed / 90), 8, dt); if (speed > 8) c.mvAng = Math.atan2(mvy, mvx);
  c.phase = (c.phase + speed * dt / 40) % 1;
  // music beat (or a steady fallback clock)
  let bi, bp;
  if (beat) { bi = beat.index; bp = beat.phase ?? 0; } else { c.fb += dt * 2.3; bi = Math.floor(c.fb); bp = c.fb - bi; }
  const aim = Math.atan2(e.face?.y ?? 0, e.face?.x ?? 1);
  const tg = b.telegraph, mode = dead ? 'dead' : b.mode || 'idle';
  const deadT = deadTimeOf(e, v);
  const hurt = clamp(v.flash || 0);
  Object.assign(_inp, {
    t: now, bodyYaw: ang, moveYaw: c.mvAng, amp: dead ? 0 : c.mv, phase: c.phase, level: lvl, mode, kind: tg ? tg.kind : (b.pattern || ''), telP: tg ? tg.progress : 0, locked: tg ? tg.locked : false,
    stage: b.stage, aimRel: angDiff(ang, aim), spinRel: angDiff(ang, b.spin || 0), beatIndex: bi, beatPhase: bp, amp01: b.phase === 2 ? 0.45 + 0.55 * (b.tempo ?? 1) : 1,
    introP: mode === 'intro' ? clamp(1 - b.t / (b.intro || 0.9)) : 1, hurt, flash: hurt > 0 ? Math.min(1, hurt * 1.2) : 0, dead: dead ? clamp(deadT / DEATH_TOTAL) : null, deadT,
  });
  if (mode === 'shift') _inp.flash = Math.max(_inp.flash, clamp(1 - (1.2 - (b.t ?? 1.2)) / 0.25) * 0.6);
  const f = c.face;
  f.level = lvl; f.t = now; f.tempo = b.tempo ?? 1; f.mode = mode; f.beat = bp; f.beatIndex = bi; f.dead = dead ? 1 : null; f.deadT = deadT; f.flash = _inp.flash * (mode === 'shift' ? 1 : 0.8); f.invuln = !!b.invuln && !dead; f.exposed = (b.exposed || 0) > 0; f.hurt = hurt;
  f.voice = mode === 'telegraph' ? 0.9 : mode === 'attack' || mode === 'beat' ? 1 : 0.35 + 0.65 * Math.exp(-bp * 3);
  _inp.face = f;
  // cables first (they lie on the floor under him)
  ctx.save(); ctx.scale(CONDUCTOR_SCALE, CONDUCTOR_SCALE);
  updateCables(c, e, ang, dt, dead, deadT, lvl, now);
  drawCables(ctx, c, e, lvl, now);
  ctx.restore();
  const out = conductorPose(_inp, _out);
  // baton trail history (rig-frame screen positions of the tip)
  {
    const tr = c.trail, sx = out.tipX, sy = out.tipY - (out.tipZ - R.anchorZ) * T;
    tr.x[tr.head] = sx; tr.y[tr.head] = sy; tr.head = (tr.head + 1) % 64; tr.n = Math.min(10, tr.n + 1); tr.ox = sx; tr.oy = sy;
    v.tipX = out.tipX; v.tipY = out.tipY - (out.tipZ - R.anchorZ) * T;
    for (let i = 0; i < out.n; i++) { const it = out.items[i]; if (it.draw && it.o === f) it.o = f; }
    f.trail = tr;
  }
  v.cMast = {x: -Math.cos(ang) * 5.4, y: -Math.sin(ang) * 5.4};
  ctx.save(); ctx.scale(CONDUCTOR_SCALE, CONDUCTOR_SCALE);
  drawRig(ctx, out, 0, 0, {anchorZ: R.anchorZ, shadow: false, variant: null, flash: _inp.flash});
  ctx.restore();
}

// ------------------------------------------------------------------ cables: four chains from the mast base dragging on the floor behind him
function updateCables(c, e, ang, dt, dead, deadT, lvl, now) {
  const rx = e.x - Math.cos(ang) * 6, ry = e.y - Math.sin(ang) * 6, sn = Math.sin(ang), cs = Math.cos(ang);
  for (let k = 0; k < c.cables.length; k++) {
    const cb = c.cables[k], X = cb.x, Y = cb.y, Z = cb.z, side = (k - 1.5) / 1.5;
    const ox = -sn * side * 3.2, oy = cs * side * 3.2;
    if (!cb.init) { for (let i = 0; i < 8; i++) { X[i] = rx + ox - cs * i * 3; Y[i] = ry + oy - sn * i * 3; Z[i] = 0; } cb.init = true; }
    X[0] = rx + ox; Y[0] = ry + oy; Z[0] = 12 - (dead ? 6 * clamp((deadT - 0.5) / 1.1) : 0);
    for (let i = 1; i < 8; i++) {
      // follow the leader at a fixed segment length, with a little wander so they writhe
      const seg = 3.4, wob = Math.sin(now * (2 + k * 0.7) + i * 0.9 + k) * 0.35 * (dead ? 0.2 : 1) * (1 + lvl * 0.4);
      let dx = X[i] - X[i - 1] + (-sn * wob) * 0.4, dy = Y[i] - Y[i - 1] + (cs * wob) * 0.4, d = Math.hypot(dx, dy) || 1;
      X[i] = X[i - 1] + dx / d * seg; Y[i] = Y[i - 1] + dy / d * seg;
      Z[i] = Math.max(0.3, Z[i - 1] * 0.55 - 0.2);
    }
  }
  void dt;
}
function drawCables(ctx, c, e, lvl, now) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const gz = R.anchorZ;
  for (let k = 0; k < c.cables.length; k++) {
    const cb = c.cables[k];
    const pt = (i) => [cb.x[i] - e.x, cb.y[i] - e.y - (cb.z[i] - gz) * T];
    for (const [w, col] of [[2.6, '#120f18'], [1.7, '#2c2634'], [0.6, k % 2 ? '#ff4a8a' : '#7fe8ff']]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      let p = pt(0); ctx.moveTo(p[0], p[1]);
      for (let i = 1; i < 8; i++) { const q = pt(i), m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]); p = q; }
      ctx.lineTo(p[0], p[1]); ctx.stroke();
    }
    // the frayed end: a bare copper tip, and in later phases it sparks
    const q = pt(7);
    ctx.fillStyle = '#d99a4a'; ctx.beginPath(); ctx.arc(q[0], q[1], 1.0, 0, TAU); ctx.fill();
    if (lvl >= 1 && Math.sin(now * 11 + k * 5) > (lvl === 2 ? 0.2 : 0.75)) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(160,240,255,0.85)'; ctx.beginPath(); ctx.arc(q[0], q[1], 2.2, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(200,250,255,0.8)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + Math.sin(now * 90 + k) * 3, q[1] + Math.cos(now * 70 + k) * 3); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ per-step particles / shake hooks (render2d.update)
const rnd = (a, b) => a + Math.random() * (b - a);
export function updateConductor(e, v, step, env) {
  const fx = env.fx, b = e.boss;
  if (!b) return;
  v.cu ??= {mode: '', phase: 1, beatIdx: -1, dt: 0, spark: 0, dead: -1};
  const u = v.cu, ang = v.bossAng || 0, cs = Math.cos(ang), sn = Math.sin(ang);
  const mx = e.x - cs * 5.4, my = e.y - sn * 5.4;
  if (e.alive) {
    // phase change: the coat tears, the mast arcs. Burst + shake once on entering 'shift'
    if (b.mode === 'shift' && u.mode !== 'shift') {
      for (let i = 0; i < 18; i++) fx.spark(mx, my - 24, rnd(0, TAU), 1, 0.2, [80, 260], i % 2 ? '#ff7ac0' : '#9ff0ff');
      fx.chips(e.x, e.y - 8, ang + Math.PI, ['#4b2459', '#74408c', '#ecc98a', '#2b1337'], 16, 2.4, [60, 220], [1.5, 3.4], [0.6, 1.2]);
      fx.ring(e.x, e.y, 6, 70, '#ff7ac0', 0.5, 3); fx.ring(e.x, e.y, 4, 46, '#ffffff', 0.3, 2);
      if (env.shake) env.shake(7, ang);
    }
    // conducting: a note-star at the baton tip when a telegraph fires, a tick on each beat in phase III
    if (u.mode === 'telegraph' && b.mode !== 'telegraph' && v.tipX !== undefined) { fx.star(e.x + v.tipX, e.y + v.tipY, '#ffd6ec', 4, 0.5); fx.ring(e.x + v.tipX, e.y + v.tipY, 2, 14, '#ff9ac8', 0.25, 1.6); }
    // mast sparks: sporadic in phase II, steady in phase III
    u.spark -= step;
    if (b.phase >= 2 && u.spark <= 0) { u.spark = b.phase === 3 ? rnd(0.05, 0.22) : rnd(0.25, 0.8); fx.spark(mx + rnd(-3, 3), my - rnd(14, 30), rnd(0, TAU), 1, 0.3, [40, 140], b.phase === 3 ? '#ffb0e8' : '#aef2ff'); }
    u.mode = b.mode; u.phase = b.phase;
  } else {
    const dt = deadTimeOf(e, v);
    if (u.dead < 0) { u.dead = 0; fx.spark(e.x, e.y - 10, 0, 14, 3.1, [60, 260], '#ff9ad0'); if (env.shake) env.shake(3, ang); }
    // the mast tips back and rains sparks, crashes at ~1.0 s, he sags, the screen shows a test card, then switches off
    if (dt > 0.25 && dt < 1.0) { u.spark -= step; if (u.spark <= 0) { u.spark = 0.04; fx.spark(mx - cs * rnd(0, 10 * (dt - 0.25)), my - rnd(4, 24), rnd(0, TAU), 2, 0.5, [40, 200], '#ffd6f0'); } }
    if (u.dead < 1 && dt >= 1.0) { u.dead = 1; const mxx = mx - cs * 22, myy = my + 3; fx.ring(mxx, myy, 4, 52, '#e8dcc8', 0.45, 3.4); for (let i = 0; i < 9; i++) fx.dust(mxx + rnd(-8, 8), myy + rnd(-4, 4), rnd(-120, 120), rnd(-120, 120)); fx.spark(mxx, myy - 6, 0, 16, 3.14, [80, 300], '#ffd0f0'); fx.chips(mxx, myy, 0, ['#6f7587', '#b4bccd', '#ecc98a'], 10, Math.PI, [60, 240], [1.4, 3], [0.5, 1.1]); if (env.shake) env.shake(9, ang); }
    if (u.dead < 2 && dt >= 1.6) { u.dead = 2; fx.ring(e.x, e.y + 4, 4, 40, '#d9cbb8', 0.4, 3); for (let i = 0; i < 6; i++) fx.dust(e.x + rnd(-10, 10), e.y + rnd(0, 8), rnd(-90, 90), rnd(-90, 90)); if (env.shake) env.shake(5, ang); }
    if (u.dead < 3 && dt >= 2.1) { u.dead = 3; fx.ring(e.x + cs * 4, e.y - 18, 2, 18, '#ffffff', 0.35, 2.4); fx.star(e.x + cs * 4, e.y - 18, '#ffffff', 5, 0.6); }
  }
}
