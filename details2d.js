// Little details for the DEAD AIR Canvas2D renderer: the things you only notice if you look. Presentation only:
// nothing here reads or changes outcomes (the secret wall / tape pickups live in game.js; this just draws them).
//
//   living enemies (while UNAWARE)   card tables and shared smokes, wristwatch checks, radio taps, humming, snores, scope wiping
//   corpses                          a dead radio that keeps crackling for a few seconds
//   the runner                       radio-check static bubbles (the idle fidgets live in rig2d.js), hats, the Conductor bow
//   the building                     stopped wall clocks (03:12 everywhere), a broken TV on a test card, a logbook shelf with a
//                                    steaming mug, call-sign stencils, a cracked wall, a hidden tape
//   the screen                       test-card flicker when a tape plays, VHS mode scanlines
//
// Three entry points per frame: drawWorld (under the darkness), drawOver (above it: glows, smoke, bubbles) and
// drawScreen (identity transform, canvas pixels). `update` runs the particle pool on the world clock.
import {glowSprite, INK, TAU} from './sprites2d.js';
import {planDecor, CALLSIGNS, SIGNAL_DIED, crackStage, mulberry} from './secrets.js';
import {fidgetAt} from './rig2d.js';
import {radioMutter, RARE_MUTTER} from './story.js';
import {RIG, STACK_TILT} from './actor-stack2d.js';
import {isStacked} from './actor-stack2d.js';

const MONO = "'DM Mono',ui-monospace,monospace";
const TILE = 32;
const hash = (a, b = 0, c = 0) => { let h = Math.imul((a | 0) ^ 0x9e3779b1, 2654435761) ^ Math.imul((b | 0) + 17, 40503) ^ Math.imul((c | 0) + 101, 69069); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const inView = (o, b, pad = 0) => o.x > b.x0 - pad && o.x < b.x1 + pad && o.y > b.y0 - pad && o.y < b.y1 + pad;

// SMPTE-ish test card bars (broken TV, tape flicker)
const BARS = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8'];

export const ACT_PERIOD = 11;       // seconds of world time per guard "act slot"
/** What an UNAWARE guard is doing in this slot of world time: 'watch' | 'radio' | '' (idle). Pure + deterministic. */
export function guardAct(id, wt) {
  const slot = Math.floor((wt + id * 3.7) / ACT_PERIOD), within = (wt + id * 3.7) - slot * ACT_PERIOD, r = hash(id, slot, 7);
  if (r < 0.34) return {act: 'watch', u: within / 2.6, on: within < 2.6};
  if (r < 0.62) return {act: 'radio', u: within / 2.4, on: within < 2.4};
  return {act: '', u: 0, on: false};
}
/** A sleeper's mumble bubble: one every ~17 s of world time, lasting 2.2 s. */
export function sleepMumble(id, wt) {
  const P = 17, slot = Math.floor((wt + id * 5.3) / P), within = (wt + id * 5.3) - slot * P;
  return {on: within < 2.2 && hash(id, slot, 3) < 0.7, u: within / 2.2, text: ['kssh... no... my deal...', '...three of a kind...', '...ten-four... zzz...', 'mm. coffee. kssh', '...is it five yet...'][Math.floor(hash(id, slot, 9) * 5)]};
}

export function createDetails() {
  const parts = [];         // world-clock particles: smoke, notes, embers, dust, sweat
  const cache = {key: null, decor: new Map()};
  const seen = new WeakMap();      // enemy -> {wasAware, hum, smoke, ...}
  const nearMiss = new WeakMap();  // bullet -> Set<enemy>
  const S = {wt: 0, lastState: 0, now: 0, tape: 0, vhs: false, bowT: 0, still: 0};

  function spawn(p) { if (parts.length > 220) parts.shift(); parts.push(p); return p; }
  const rnd = Math.random;

  // ------------------------------------------------------------------ per-level plan
  function plan(state) {
    const key = state.tileMap;
    if (cache.key === key && cache.n === state.rooms?.length) return cache;
    cache.key = key; cache.n = state.rooms?.length || 0; cache.decor = new Map();
    if (!state.rooms || !state.tileMap) return cache;
    const avoid = [];
    if (state.secret?.crack) avoid.push(state.secret.crack);
    for (const room of state.rooms) {
      if (state.signal?.active) continue;
      cache.decor.set(room.index, planDecor({room, tileMap: state.tileMap, seed: state.seed || 1, floor: state.floor || 1, avoidTiles: avoid}));
    }
    return cache;
  }

  // ------------------------------------------------------------------ update (particles on the world clock)
  function update(state, dt, now) {
    S.now = now;
    const wdt = clamp(state.time - S.lastState, 0, 0.1); S.lastState = state.time; S.wt = state.time;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += wdt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * wdt; p.y += p.vy * wdt;
      if (p.kind === 'smoke') { p.vx *= 1 - 0.5 * wdt; p.vy *= 1 - 0.3 * wdt; p.x += Math.sin(p.age * 3 + p.ph) * 4 * wdt; p.r += 3.2 * wdt; }
      else if (p.kind === 'ember') { p.vy += 120 * wdt; if (p.y > p.floorY) { p.y = p.floorY; p.vy = 0; p.vx = 0; } }
      else if (p.kind === 'dust') { p.vx *= 1 - 1.4 * wdt; p.vy *= 1 - 1.4 * wdt; p.r += 2 * wdt; }
      else if (p.kind === 'sweat') { p.vy += 90 * wdt; }
    }
    // real-time timers for screen effects
    S.tape = Math.max(0, (state.testCardT || 0));
    if (state.testCardT > 0) state.testCardT = Math.max(0, state.testCardT - dt);
    if (state.mode !== 'play') S.still = 0;
  }

  // ------------------------------------------------------------------ enemy bookkeeping (alert drop, near misses)
  function watchEnemies(state, b, dt) {
    const wt = state.time;
    for (const e of state.enemies) {
      if (e.type === 'boss') continue;
      let s = seen.get(e); if (!s) seen.set(e, s = {aware: !!e.aware, hum: hash(e.id, 1) * 3, puff: hash(e.id, 2) * 2});
      const v = e.vis || (e.vis = {});
      v.flinchT = Math.max(0, (v.flinchT || 0) - dt);
      if (e.alive && e.aware && !s.aware) {
        s.aware = true;
        // dropped cigarette, a startled "!" ring is drawn by the stealth layer; the body jump is the alert pose in render2d
        if (e.posture === 'gather' || e.posture === 'guard') {
          const h = headPos(e);
          spawn({kind: 'ember', x: h.x + Math.cos(h.a) * 5, y: h.y + 2, vx: rand(-14, 14), vy: -50, age: 0, life: 1.4, floorY: e.y + 9, r: 1.3});
        }
      } else if (!e.aware) s.aware = false;
      if (!e.alive || e.aware || !inView(e, b, 40)) continue;
      const h = headPos(e);
      // humming gunner: a note every few seconds of world time while it patrols
      if (e.posture === 'patrol' && (v.speed || 0) > 8 && e.type !== 'riot' && e.type !== 'brute') {
        s.hum -= (state.time - (s.lt ?? wt)); if (s.hum <= 0) { s.hum = 1.6 + hash(e.id, Math.floor(wt)) * 1.6; spawn({kind: 'note', x: h.x + rnd() * 4 - 2, y: h.y - 4, vx: rand(-6, 6), vy: -16, age: 0, life: 1.6, v: Math.floor(rnd() * 3)}); }
      }
      s.lt = wt;
    }
    // near misses: a player bullet whisking past an unaware enemy makes it flinch and sweat
    for (const bl of state.bullets) {
      if (bl.owner !== 'player' || !inView(bl, b, 60)) continue;
      let set = nearMiss.get(bl);
      for (const e of state.enemies) {
        if (!e.alive || e.aware || e.type === 'boss' || (set && set.has(e))) continue;
        const dx = e.x - bl.x, dy = e.y - bl.y, d2 = dx * dx + dy * dy;
        if (d2 > 30 * 30 || d2 < 8 * 8) continue;
        (set ??= (nearMiss.set(bl, new Set()), nearMiss.get(bl))).add(e);
        e.vis.flinchT = 0.42;
        for (let i = 0; i < 3; i++) spawn({kind: 'sweat', x: e.x + rand(-5, 5), y: headPos(e).y - 3, vx: rand(-26, 26), vy: -rand(26, 50), age: 0, life: 0.5, r: 1.1});
      }
    }
  }
  const rand = (a, b) => a + rnd() * (b - a);

  /** Screen-space-ish head position of an enemy (world px), plus facing. Stacked bodies hang below the sim plane. */
  function headPos(e) {
    const a = e.vis?.ang ?? 0, kind = e.elite ? 'elite' : e.type;
    const up = isStacked(kind) ? (RIG.headZ + 4.2 - RIG.anchorZ) * STACK_TILT : (e.radius || 9) * 0.35;
    return {x: e.x + (e.vis?.fpx || 0), y: e.y - up + (e.vis?.fpy || 0), a};
  }

  // ------------------------------------------------------------------ drawWorld: under the darkness
  function drawWorld(ctx, state, b, t) {
    const pl = plan(state), wt = state.time;
    // wall storytelling
    for (const [ri, list] of pl.decor) {
      const room = state.rooms[ri]; if (!room) continue;
      if (room.x2 * TILE + 64 < b.x0 || room.x1 * TILE - 64 > b.x1 || room.y2 * TILE + TILE < b.y0 || room.y1 * TILE - 64 > b.y1) continue;
      for (const d of list) { if (d.x < b.x0 - 40 || d.x > b.x1 + 40) continue; drawDecor(ctx, d, room, t, state); }
    }
    // card tables for gathered groups
    const groups = new Set();
    for (const e of state.enemies) if (e.posture === 'gather' && e.gatherFocus && !groups.has(e.gatherFocus)) groups.add(e.gatherFocus);
    for (const f of groups) if (inView(f, b, 30)) drawTable(ctx, f, t, state);
    // cracked wall
    const sec = state.secret;
    if (sec) {
      drawCrack(ctx, sec, t);
      if (sec.opened && !sec.taken) drawReward(ctx, sec.reward, sec.rewardPx, t, false);
    }
    if (state.fieldTape && !state.fieldTape.taken) drawTapeOnFloor(ctx, state.fieldTape, t);
  }

  // ------------------------------------------------------------------ drawOver: above the darkness
  function drawOver(ctx, state, b, t, dt, vis = {}) {
    const wt = state.time, pl = cache;
    // TV + lamp glows only where there is something to see
    for (const [ri, list] of pl.decor) {
      const room = state.rooms[ri]; if (!room) continue;
      for (const d of list) {
        if (d.kind !== 'tv' || d.x < b.x0 - 40 || d.x > b.x1 + 40 || d.y < b.y0 - 40 || d.y > b.y1 + 40) continue;
        const live = state.currentRoom === ri || room.visited;
        ctx.save(); ctx.translate(d.x, d.y); drawTvScreen(ctx, d, t, live ? 0.85 : 0.55); ctx.restore();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (live ? 0.5 : 0.28) * (0.8 + 0.2 * Math.sin(t * 9 + d.variant));
        ctx.drawImage(glowSprite('#9ad8ff'), d.x - 22, d.y - 14, 44, 44);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
    const sec = state.secret;
    if (sec) {
      const cx = (sec.crack.x + 0.5) * TILE + sec.dir.x * -10, cy = (sec.crack.y + 0.5) * TILE + sec.dir.y * -10;
      if (!sec.opened && cx > b.x0 - 30 && cx < b.x1 + 30 && cy > b.y0 - 30 && cy < b.y1 + 30) {
        // a faint cold draught leaks through the crack: pulse + the odd dust puff, so a curious player looks closer
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 + 0.1 * Math.sin(t * 2.2);
        ctx.drawImage(glowSprite('#9ad8ff'), cx - 20, cy - 20, 40, 40); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        if (Math.floor(wt * 1.3) !== Math.floor((wt - (dt || 0.016)) * 1.3) && rnd() < 0.5) spawn({kind: 'dust', x: cx - sec.dir.x * 4, y: cy - sec.dir.y * 4, vx: -sec.dir.x * 12 + rand(-5, 5), vy: -sec.dir.y * 12 + rand(-5, 5), age: 0, life: 1.5, r: 2});
      }
      if (sec.opened && !sec.taken) drawReward(ctx, sec.reward, sec.rewardPx, t, true);
    }
    if (state.fieldTape && !state.fieldTape.taken) {
      const f = state.fieldTape, g = Math.max(0, Math.sin(t * 2.6 + f.variant)) ** 6;
      if (inView(f, b, 20)) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.6 * g; ctx.drawImage(glowSprite('#ffd36e'), f.x - 9, f.y - 9, 18, 18); star(ctx, f.x + 2, f.y - 3, 1 + 3 * g, '#fff6d0'); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
    // enemies
    watchEnemies(state, b, dt || 0.016);
    for (const e of state.enemies) {
      if (e.type === 'boss' || !inView(e, b, 50)) continue;
      if (!e.alive) { drawCorpseRadio(ctx, e, t, wt); continue; }
      if (e.aware) continue;
      drawEnemyAct(ctx, state, e, t, wt);
    }
    drawParts(ctx, b, t);
    drawPlayerBits(ctx, state, b, t, vis);
    if (state.boss && state.bossBow) drawBowHint(ctx, state, t);
  }

  function drawEnemyAct(ctx, state, e, t, wt) {
    const h = headPos(e), v = e.vis || {};
    const id = e.id || 0, a = h.a, ca = Math.cos(a), sa = Math.sin(a);
    // ---- gathered: shared smoke, one cigarette each
    if (e.posture === 'gather') {
      const grp = e.gatherFocus, smokeGroup = hash(Math.round(grp.x), Math.round(grp.y)) < 0.5;
      const smoker = smokeGroup || id % 2 === 0;
      if (smoker) {
        const tx = h.x + ca * 5.4, ty = h.y + sa * 1.6 + 2.1, glow = 0.6 + 0.4 * Math.sin(t * 2.3 + id) ** 2;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85 * glow; ctx.drawImage(glowSprite('#ff7a30'), tx - 4.5, ty - 4.5, 9, 9); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#fff1d8'; ctx.fillRect(tx - 1.6 * ca - 0.6, ty - 0.5, 2.2, 1.1); ctx.fillStyle = '#ff9a40'; ctx.fillRect(tx + ca * 1.2 - 0.5, ty - 0.5, 1.1, 1.1);
        const st = seen.get(e); if (st) { st.puff -= (wt - (st.pt ?? wt)); st.pt = wt; if (st.puff <= 0) { st.puff = 0.7 + hash(id, Math.floor(wt * 2)) * 0.9; spawn({kind: 'smoke', x: tx, y: ty, vx: ca * 3 + rand(-3, 3), vy: -9 - rand(0, 4), age: 0, life: 2.6, r: 1.6, ph: rnd() * 6, a: 0.38}); } }
      }
    }
    // ---- guard on post: wristwatch check / radio tap
    if (e.posture === 'guard' && (v.speed || 0) < 8 && e.type !== 'sniper' && !(e.stun > 0)) {
      const g = guardAct(id, wt);
      if (g.on && g.act === 'watch') {
        const raise = Math.sin(clamp(g.u) * Math.PI), wx = h.x - sa * 5 + ca * 4, wy = h.y + ca * 3 + 5 - raise * 3;
        if (raise > 0.15) {
          ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(wx, wy, 2.6, 0, TAU); ctx.fill();
          ctx.fillStyle = '#e8e2cc'; ctx.beginPath(); ctx.arc(wx, wy, 1.8, 0, TAU); ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx, wy - 1.3); ctx.moveTo(wx, wy); ctx.lineTo(wx + 1, wy + 0.4); ctx.stroke();
          if (g.u > 0.55 && g.u < 0.85) { ctx.globalAlpha = 0.9; star(ctx, wx + 1.2, wy - 1.4, 1.6, '#fff'); ctx.globalAlpha = 1; }
        }
      } else if (g.on && g.act === 'radio') {
        const bx = h.x + ca * 3, by = h.y - 4;
        const k = g.u < 0.15 ? g.u / 0.15 : g.u > 0.85 ? (1 - g.u) / 0.15 : 1;
        if (g.u > 0.1) {
          const crackle = 0.5 + 0.5 * Math.sin(t * 40 + id);
          bubble(ctx, h.x, h.y - 14, crackle > 0.4 ? 'kssh-kk...' : '...ssht', k, '#bcd6ff');
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 * crackle * k; ctx.drawImage(glowSprite('#9ad8ff'), bx - 7, by + 3, 14, 14); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    // ---- marksman cleans its scope: two quick glints and a wiping arc
    if (e.type === 'sniper' && (v.speed || 0) < 8 && !(e.aimTimer > 0)) {
      const P = 9, w = (wt + id * 2.1) % P;
      if (w < 2.4) {
        const u = w / 2.4, lx = e.x + ca * 17, ly = e.y + sa * 17 - 1 + (isStacked('sniper') ? 0 : 0);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(lx, ly, 3.4, a - 1.2 + Math.sin(u * 14) * 0.6, a + 1.2 + Math.sin(u * 14) * 0.6); ctx.stroke();
        if (Math.sin(u * 14) > 0.9) { ctx.globalCompositeOperation = 'lighter'; star(ctx, lx, ly, 3.6, '#e8fcff'); ctx.globalCompositeOperation = 'source-over'; }
      }
    }
    // ---- sleepers: snore bubble that swells and pops, and the odd mumble
    if (e.posture === 'sleep') {
      const per = 3.4, ph = ((wt + id * 1.3) % per) / per, r = ph < 0.8 ? 1.2 + 3.6 * ph / 0.8 : 0, pop = ph >= 0.8 && ph < 0.88;
      const nx = h.x + ca * 5, ny = h.y + sa * 1.5 + 2;
      if (r > 0) { ctx.fillStyle = 'rgba(200,230,255,0.28)'; ctx.strokeStyle = 'rgba(220,240,255,0.7)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(nx, ny, r, 0, TAU); ctx.fill(); ctx.stroke(); }
      else if (pop) { ctx.strokeStyle = 'rgba(220,240,255,0.7)'; ctx.lineWidth = 0.5; for (let i = 0; i < 4; i++) { const q = i * TAU / 4 + 0.4; ctx.beginPath(); ctx.moveTo(nx + Math.cos(q) * 3.6, ny + Math.sin(q) * 3.6); ctx.lineTo(nx + Math.cos(q) * 5.2, ny + Math.sin(q) * 5.2); ctx.stroke(); } }
      const m = sleepMumble(id, wt);
      if (m.on) bubble(ctx, h.x, h.y - 22, m.text, m.u < 0.12 ? m.u / 0.12 : m.u > 0.85 ? (1 - m.u) / 0.15 : 1, '#c9c2d8');
    }
    // flinch sweat/shake handled in pose; extra "!?" none
    void state;
  }

  function drawCorpseRadio(ctx, e, t, wt) {
    if (!(e.corpseTimer > 0.2)) return;
    const age = 3.5 - e.corpseTimer; if (age < 0.15 || age > 3.2) return;
    const on = Math.sin(t * 31 + (e.id || 0) * 3) > 0.15 && Math.sin(t * 7.3 + (e.id || 0)) > -0.2;
    const x = e.x - 7 + Math.cos(e.vis?.ang || 0) * -2, y = e.y + 5, fade = 1 - age / 3.2;
    if (!on) return;
    ctx.strokeStyle = `rgba(255,200,120,${0.75 * fade})`; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
    for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(x, y, 2 + i * 2.2, -Math.PI * 0.9, -Math.PI * 0.1); ctx.stroke(); }
    ctx.fillStyle = `rgba(255,120,80,${fade})`; ctx.fillRect(x - 0.6, y - 0.6, 1.4, 1.4);
    if (rnd() < 0.08) spawn({kind: 'ember', x, y, vx: rand(-20, 20), vy: -rand(20, 40), age: 0, life: 0.5, floorY: y + 2, r: 0.9});
    void wt;
  }

  // ------------------------------------------------------------------ the runner
  function drawPlayerBits(ctx, state, b, t, vis) {
    const p = state.player; if (!p || state.mode !== 'play') return;
    const idleT = vis.idleReal || 0;
    const stk = true, headY = p.y - (RIG.headZ + 4.4 - RIG.anchorZ) * STACK_TILT;
    const hx = p.x + (vis.fl?.x || 0), hy = (stk ? headY : p.y - 4) + (vis.fl?.y || 0);
    // hat
    if (state.cosmetics?.hat) drawHat(ctx, state.cosmetics.hat, hx, hy - 1.6, vis.bodyAng || 0, t);
    // radio check
    const f = fidgetAt(idleT, 1);
    if (f && (f.fidget.id === 'radio' || f.fidget.id === 'tune') && f.u > 0.12 && f.u < 0.92) {
      const k = f.u < 0.22 ? (f.u - 0.12) / 0.1 : f.u > 0.84 ? (0.92 - f.u) / 0.08 : 1;
      const slot = Math.floor((idleT - 3.5) / 6.5);
      const text = f.fidget.id === 'tune' ? RARE_MUTTER : radioMutter(slot + (state.seed | 0));
      bubble(ctx, hx - 4, hy - 17, text, k, '#ffd36e', f.fidget.id === 'tune' ? 74 : 0);
      // antenna static sparks
      if (rnd() < 0.3) spawn({kind: 'dust', x: hx - 5 + rand(-3, 3), y: hy - 11 + rand(-2, 2), vx: rand(-10, 10), vy: -rand(8, 20), age: 0, life: 0.4, r: 0.8, a: 0.7});
    }
    void b;
  }

  function drawBowHint(ctx, state, t) { void ctx; void state; void t; }

  // ------------------------------------------------------------------ particles
  function drawParts(ctx, b, t) {
    for (const p of parts) {
      if (p.x < b.x0 - 20 || p.x > b.x1 + 20 || p.y < b.y0 - 20 || p.y > b.y1 + 20) continue;
      const k = p.age / p.life;
      if (p.kind === 'smoke') { ctx.globalAlpha = (p.a || 0.3) * (1 - k) * Math.min(1, p.age * 6); ctx.fillStyle = '#cfd3dc'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      else if (p.kind === 'dust') { ctx.globalAlpha = (p.a || 0.35) * (1 - k); ctx.fillStyle = '#d9e8f4'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      else if (p.kind === 'ember') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k * 0.7; ctx.drawImage(glowSprite('#ff7a30'), p.x - 3, p.y - 3, 6, 6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      else if (p.kind === 'sweat') { ctx.globalAlpha = 1 - k; ctx.fillStyle = '#bfe6ff'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 0.8, 1.3, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      else if (p.kind === 'note') { ctx.globalAlpha = Math.min(1, (1 - k) * 2); note(ctx, p.x + Math.sin(p.age * 4) * 2, p.y, p.v); ctx.globalAlpha = 1; }
    }
    void t;
  }

  // ------------------------------------------------------------------ screen-space
  const scan = {c: null, w: 0, h: 0};
  function drawScreen(ctx, w, h, dpr, state, t) {
    if (S.tape > 0) {
      const k = clamp(S.tape / 1.4), tear = Math.sin(t * 60) * 0.5 + 0.5, bars = Math.floor(t * 18) % 3;
      ctx.save(); ctx.globalCompositeOperation = 'source-over';
      const n = 7, bw = w / n;
      for (let i = 0; i < n; i++) { ctx.globalAlpha = (0.16 + 0.55 * k * (k > 0.4 ? 1 : 0.5)) * (bars === 1 && i % 2 ? 0.4 : 1); ctx.fillStyle = BARS[(i + bars) % n]; ctx.fillRect(i * bw, 0, bw + 1, h * (0.72 - 0.1 * tear)); }
      ctx.globalAlpha = 0.5 * k; for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#111' : BARS[6 - i]; ctx.fillRect(i * bw, h * 0.72, bw + 1, h * 0.08); }
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.07 * k; for (let y = 0; y < h; y += 4 * dpr) ctx.fillRect(0, y, w, 2 * dpr);
      ctx.globalAlpha = 0.8 * k; ctx.fillStyle = '#000'; ctx.font = `${Math.round(14 * dpr)}px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText('MERIDIAN RELAY · TEST CARD · TAPE PLAYING', w / 2, h * 0.9);
      ctx.restore();
    }
  }
  function drawVhs(ctx, w, h, dpr, t) {
    if (!scan.c || scan.w !== w || scan.h !== h) {
      const c = scan.c || (scan.c = document.createElement('canvas')); c.width = w; c.height = h; scan.w = w; scan.h = h;
      const g = c.getContext('2d'); g.clearRect(0, 0, w, h);
      const step = Math.max(2, Math.round(3 * dpr)); g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = 0; y < h; y += step) g.fillRect(0, y, w, Math.max(1, Math.round(step / 3)));
      const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
    }
    ctx.save(); ctx.drawImage(scan.c, 0, 0);
    // rolling tracking band + chroma fringe on the edges + the odd tear
    const y = ((t * 0.11) % 1.2 - 0.1) * h, bh = 18 * dpr;
    ctx.globalAlpha = 0.07; ctx.fillStyle = '#fff'; ctx.fillRect(0, y, w, bh);
    ctx.globalAlpha = 0.09; ctx.fillStyle = '#ff2a4a'; ctx.fillRect(0, 0, 3 * dpr, h); ctx.fillStyle = '#2ac8ff'; ctx.fillRect(w - 3 * dpr, 0, 3 * dpr, h);
    if (Math.sin(t * 2.7) > 0.985) { ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff'; ctx.fillRect(0, (Math.sin(t * 91) * 0.5 + 0.5) * h, w, 2 * dpr); }
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#e8e8e8'; ctx.font = `bold ${Math.round(13 * dpr)}px ${MONO}`; ctx.textAlign = 'left';
    if (Math.floor(t * 1.2) % 2 === 0) { ctx.fillStyle = '#ff4a5e'; ctx.beginPath(); ctx.arc(24 * dpr, h - 26 * dpr, 4.5 * dpr, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#e8e8e8'; ctx.fillText('REC  SP', 36 * dpr, h - 21 * dpr);
    ctx.restore();
  }

  return {update, drawWorld, drawOver, drawScreen, parts, headPos};
}

// ====================================================================================================== drawing helpers
function star(ctx, x, y, r, color) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.22, y - r * 0.22); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.22, y + r * 0.22); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.22, y + r * 0.22); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.22, y - r * 0.22); ctx.closePath(); ctx.fill();
}
function note(ctx, x, y, v = 0) {
  ctx.fillStyle = '#ffe6a8'; ctx.strokeStyle = INK; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.ellipse(x, y, 1.7, 1.2, -0.4, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ffe6a8'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x + 1.5, y - 0.3); ctx.lineTo(x + 1.5, y - 5); if (v !== 1) ctx.quadraticCurveTo(x + 4, y - 4.2, x + 3.2, y - 2); ctx.stroke();
}
/** A speech/static bubble over a head. (x, y) = bubble centre. `fixedW` > 0 wraps long text into two lines. */
function bubble(ctx, x, y, text, k = 1, color = '#e8e2ff', fixedW = 0) {
  if (k <= 0.02) return;
  ctx.save(); ctx.globalAlpha = clamp(k); ctx.font = `bold 5.4px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let lines = [text];
  if (fixedW) { const words = text.split(' '), out = []; let cur = ''; for (const w of words) { if ((cur + ' ' + w).length > 22 && cur) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } out.push(cur); lines = out; }
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 7, h = 5.2 + lines.length * 6.2, sc = 0.7 + 0.3 * Math.min(1, k * 1.5);
  ctx.translate(x, y); ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(14,10,22,0.86)'; ctx.strokeStyle = color; ctx.lineWidth = 0.7;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, 2.4); else ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-2, h / 2 - 0.2); ctx.lineTo(0, h / 2 + 3); ctx.lineTo(2, h / 2 - 0.2); ctx.fillStyle = 'rgba(14,10,22,0.86)'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; lines.forEach((l, i) => ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * 6.2 + 0.2));
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- wall decor
function drawDecor(ctx, d, room, t, state) {
  ctx.save(); ctx.translate(d.x, d.y);
  if (d.kind === 'clock') drawClock(ctx);
  else if (d.kind === 'tv') drawTv(ctx, d, t);
  else if (d.kind === 'desk') drawDesk(ctx, d, t, !room.visited && state.currentRoom !== room.index);
  else if (d.kind === 'stencil') drawStencil(ctx, d);
  else if (d.kind === 'poster') drawPoster(ctx, d);
  ctx.restore();
}
/** The clock that stopped when the signal died: 03:12, in every room. */
function drawClock(ctx) {
  const r = 6, cy = -2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0.8, cy + r + 1.5, r * 0.9, 1.6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, cy, r + 1.1, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e9e2cb'; ctx.beginPath(); ctx.arc(0, cy, r - 0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(120,100,70,0.3)'; ctx.beginPath(); ctx.arc(1.4, cy + 1.6, r - 1.2, 0, TAU); ctx.fill();   // grime
  ctx.strokeStyle = INK; ctx.lineWidth = 0.55;
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 1.2), cy + Math.sin(a) * (r - 1.2)); ctx.lineTo(Math.cos(a) * (r - (i % 3 ? 1.9 : 2.5)), cy + Math.sin(a) * (r - (i % 3 ? 1.9 : 2.5))); ctx.stroke(); }
  const hr = ((SIGNAL_DIED.h % 12) + SIGNAL_DIED.m / 60) / 12 * TAU - Math.PI / 2, mn = SIGNAL_DIED.m / 60 * TAU - Math.PI / 2;
  ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(Math.cos(hr) * 3, cy + Math.sin(hr) * 3); ctx.stroke();
  ctx.lineWidth = 0.65; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(Math.cos(mn) * 4.6, cy + Math.sin(mn) * 4.6); ctx.stroke();
  ctx.fillStyle = '#c8344a'; ctx.beginPath(); ctx.arc(0, cy, 0.7, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(-3.6, cy - 3.4); ctx.lineTo(-1, cy - 0.8); ctx.lineTo(-2.2, cy + 0.6); ctx.stroke();   // cracked glass
}
function drawTv(ctx, d, t) {
  const w = 15, h = 11, y0 = -h + 5;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-w / 2 + 1, y0 + h, w, 2.4);
  ctx.fillStyle = INK; ctx.fillRect(-w / 2 - 1, y0 - 1, w + 2, h + 2);
  ctx.fillStyle = '#5b5f6c'; ctx.fillRect(-w / 2, y0, w, h);
  ctx.fillStyle = '#41444f'; ctx.fillRect(-w / 2, y0 + h - 2.2, w, 2.2);
  drawTvScreen(ctx, d, t, 1);
  ctx.fillStyle = '#9aa0b0'; ctx.fillRect(w / 2 - 3.2, y0 + 2, 1.6, 1.6); ctx.fillRect(w / 2 - 3.2, y0 + 4.8, 1.6, 1.6);   // knobs
  ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-1, y0); ctx.lineTo(-4, y0 - 4); ctx.moveTo(1, y0); ctx.lineTo(4, y0 - 4); ctx.stroke();   // rabbit ears
}
function drawTvScreen(ctx, d, t, alpha) {
  const w = 15, h = 11, y0 = -h + 5;
  ctx.globalAlpha = alpha;
  const sw = 10.4, sh = 7.4, sx = -w / 2 + 1, sy = y0 + 1;
  const roll = (t * 0.7 + d.variant) % 7, glitch = Math.sin(t * 3 + d.variant) > 0.93;
  ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
  for (let i = 0; i < 7; i++) { ctx.fillStyle = BARS[i]; ctx.fillRect(sx + i * sw / 7 + (glitch ? 1 : 0), sy, sw / 7 + 0.4, sh * 0.72); }
  for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? '#101018' : BARS[6 - i]; ctx.fillRect(sx + i * sw / 7, sy + sh * 0.72, sw / 7 + 0.4, sh * 0.28); }
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(sx, sy + (roll / 7) * sh * 1.3 - 1, sw, 1.4);   // rolling bar
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < sh; y += 1.3) ctx.fillRect(sx, sy + y, sw, 0.5);
  if (glitch) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(sx, sy + 2.6, sw, 0.7); }
  ctx.restore();
  ctx.globalAlpha = 1;
}
function drawDesk(ctx, d, t, steam) {
  // a fold-down shelf along the wall: logbook, pen, a mug
  const w = 26, y = 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-w / 2 + 1, y + 3, w, 2.4);
  ctx.fillStyle = INK; ctx.fillRect(-w / 2 - 1, y - 1, w + 2, 6);
  ctx.fillStyle = '#7a5a3c'; ctx.fillRect(-w / 2, y, w, 4); ctx.fillStyle = '#9a7650'; ctx.fillRect(-w / 2, y, w, 1.2);
  ctx.fillStyle = INK; ctx.fillRect(-w / 2 + 2, y + 4, 1.4, 4); ctx.fillRect(w / 2 - 3.4, y + 4, 1.4, 4);
  // logbook
  ctx.save(); ctx.translate(-4.5, y - 0.4); ctx.rotate(-0.06);
  ctx.fillStyle = INK; ctx.fillRect(-6.4, -6.6, 13, 7.4); ctx.fillStyle = '#e7e0c8'; ctx.fillRect(-5.8, -6, 5.8, 6.4); ctx.fillRect(0.2, -6, 5.6, 6.4);
  ctx.strokeStyle = 'rgba(40,40,70,0.7)'; ctx.lineWidth = 0.4;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-5, -4.8 + i * 1.3); ctx.lineTo(-1 - (i === 3 ? 2.2 : 0), -4.8 + i * 1.3); ctx.stroke(); }
  for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(1, -4.8 + i * 1.3); ctx.lineTo(5 - i * 1.4, -4.8 + i * 1.3); ctx.stroke(); }   // the last entry stops mid-line
  ctx.fillStyle = '#c8344a'; ctx.fillRect(5.6, -1.1, 3.2, 0.7);   // pen
  ctx.restore();
  // mug
  const mx = 7.5, my = y - 0.5;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(mx, my - 1.4, 3.1, 2.8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d8d2c0'; ctx.beginPath(); ctx.ellipse(mx, my - 1.4, 2.4, 2.1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a2418'; ctx.beginPath(); ctx.ellipse(mx, my - 1.9, 1.8, 1.2, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(mx + 3.3, my - 1.4, 1.2, -1.2, 1.2); ctx.stroke();
  if (steam) {
    // someone was just here: the coffee is still steaming
    ctx.strokeStyle = 'rgba(225,235,245,0.8)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.55 + i * 0.33) % 1, x0 = mx - 1.2 + i * 1.2;
      ctx.globalAlpha = (1 - ph) * 0.8; ctx.beginPath(); ctx.moveTo(x0, my - 3.4); ctx.bezierCurveTo(x0 + 2.2 * Math.sin(ph * 5 + i), my - 6 - ph * 3, x0 - 2.2 * Math.sin(ph * 4 + i), my - 8 - ph * 5, x0 + Math.sin(ph * 6 + i) * 1.4, my - 11 - ph * 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
function drawStencil(ctx, d) {
  const text = CALLSIGNS[d.variant % CALLSIGNS.length];
  ctx.font = `bold 5.6px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 6;
  ctx.globalAlpha = 0.58; ctx.strokeStyle = '#d8d0b0'; ctx.lineWidth = 0.7; ctx.strokeRect(-w / 2, -6, w, 8);
  ctx.fillStyle = '#d8d0b0'; ctx.fillText(text, 0, -2); ctx.fillRect(-w / 2, 3.4, w * 0.4, 0.9);
  ctx.globalAlpha = 1;
}
function drawPoster(ctx, d) {
  ctx.save(); ctx.rotate(((d.variant % 7) - 3) * 0.02);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-4.5, -9.5, 10, 14);
  ctx.fillStyle = '#e3d9bd'; ctx.fillRect(-5, -10, 10, 14); ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.strokeRect(-5, -10, 10, 14);
  ctx.strokeStyle = '#3b3445'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(-2.4, 3); ctx.moveTo(0, -3); ctx.lineTo(2.4, 3); ctx.moveTo(-1.4, 0.4); ctx.lineTo(1.4, 0.4); ctx.stroke();
  ctx.strokeStyle = '#c8344a'; ctx.lineWidth = 0.6; for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(0, -3.3, i * 1.8, -2.5, -0.6); ctx.stroke(); }
  ctx.fillStyle = '#c8344a'; ctx.font = `bold 3.2px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText(d.variant % 2 ? 'ON AIR' : 'LISTEN', 0, -7.4);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-0.4, -10.8, 0.8, 1.6);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- tables / tape / crack / reward
function drawTable(ctx, f, t, state) {
  void state;
  const smoke = hash(Math.round(f.x), Math.round(f.y)) < 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(f.x + 1.2, f.y + 5.2, 9.5, 4.6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a4f5c'; ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(f.x, f.y + 2.8, 8.4, 4.4, 0, 0, TAU); ctx.fill(); ctx.stroke();   // oil drum body
  ctx.fillStyle = '#3a3e49'; ctx.fillRect(f.x - 8.2, f.y + 2.8, 16.4, 1.2);
  ctx.fillStyle = '#8a6a48'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 8.6, 4.8, 0, 0, TAU); ctx.fill(); ctx.stroke();   // plank top
  ctx.fillStyle = '#a98558'; ctx.beginPath(); ctx.ellipse(f.x - 0.8, f.y - 0.8, 7, 3.6, 0, 0, TAU); ctx.fill();
  if (smoke) {
    ctx.fillStyle = '#2c2a32'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 2.6, 1.5, 0, 0, TAU); ctx.fill();   // ashtray
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3); ctx.drawImage(glowSprite('#ff7a30'), f.x - 3, f.y - 3, 6, 6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  } else {
    // a hand of cards and a few chips; every so often one gets slapped down
    const slap = (Math.floor(t * 0.5 + f.x) % 5) === 0 ? (t * 0.5 + f.x) % 1 : 1;
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.translate(f.x - 3.5 + i * 2.4, f.y - 0.6 + (i === 3 ? slap * 0 : 0)); ctx.rotate(-0.5 + i * 0.28 + (i === 3 ? (1 - slap) * 0.8 : 0));
      ctx.fillStyle = INK; ctx.fillRect(-1.5, -2.2, 3, 4.4); ctx.fillStyle = '#efe9da'; ctx.fillRect(-1.2, -1.9, 2.4, 3.8);
      ctx.fillStyle = i % 2 ? '#c8344a' : '#2a2630'; ctx.fillRect(-0.5, -0.8, 1, 1.2); ctx.restore();
    }
    for (let i = 0; i < 3; i++) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(f.x + 4.6, f.y - 1 + i * 0.9, 1.2, 0, TAU); ctx.fill(); ctx.fillStyle = ['#e0b64a', '#c8344a', '#4fd0c4'][i]; ctx.beginPath(); ctx.arc(f.x + 4.6, f.y - 1.4 + i * 0.9, 1, 0, TAU); ctx.fill(); }
  }
}
function drawTapeOnFloor(ctx, f, t) {
  ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(((f.variant % 9) - 4) * 0.15);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-5.2, -2.4, 11, 7);
  ctx.fillStyle = INK; ctx.fillRect(-5.6, -3.6, 11.2, 7.2); ctx.fillStyle = '#d7cfb6'; ctx.fillRect(-5, -3, 10, 6);
  ctx.fillStyle = '#c8344a'; ctx.fillRect(-5, -3, 10, 1.4);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-2.2, 0.3, 1.5, 0, TAU); ctx.arc(2.2, 0.3, 1.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8e2cb'; ctx.beginPath(); ctx.arc(-2.2, 0.3, 0.6, 0, TAU); ctx.arc(2.2, 0.3, 0.6, 0, TAU); ctx.fill();
  ctx.restore(); void t;
}
/** Jagged hairline crack on the wall tile; grows with each hit. Visible, readable, never hidden. */
function drawCrack(ctx, sec, t) {
  if (sec.opened) return;
  const cx = (sec.crack.x + 0.5) * TILE, cy = (sec.crack.y + 0.5) * TILE, stage = crackStage(sec.hp, sec.hits || 3), rnd = mulberry((sec.crack.x * 977 + sec.crack.y * 131) | 0);
  ctx.save(); ctx.translate(cx, cy); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const branches = 2 + stage * 2;
  const paths = [];
  for (let b = 0; b < branches; b++) {
    const pts = [], a0 = (b % 2 ? 1 : -1) * (0.3 + rnd() * 0.5) + (b > 1 ? (rnd() - 0.5) * 2.2 : 0), len = (b < 2 ? 15 : 8 + rnd() * 6) * (1 + stage * 0.25);
    let x = (b < 2 ? 0 : (rnd() - 0.5) * 8), y = (b < 2 ? -13 + b * 3 : (rnd() - 0.5) * 12), a = a0 + Math.PI / 2;
    pts.push([x, y]);
    for (let i = 0; i < 5; i++) { a += (rnd() - 0.5) * 1.1; x += Math.cos(a) * len / 5; y += Math.sin(a) * len / 5; pts.push([x, y]); }
    paths.push(pts);
  }
  const trace = () => { for (const pts of paths) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); } };
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 2.1; trace();
  ctx.strokeStyle = 'rgba(190,225,245,0.9)'; ctx.lineWidth = 0.7; ctx.translate(0.5, 0.5); trace();
  ctx.restore(); void t;
}
/** The reward waiting in the pocket: a hat on a little pedestal, or a tape. */
function drawReward(ctx, reward, px, t, glow) {
  if (!reward || !px) return;
  const bob = Math.sin(t * 2.2) * 1.4, x = px.x, y = px.y;
  if (!glow) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y + 7, 9, 3.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y + 3.6, 7.6, 3.6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#58606e'; ctx.beginPath(); ctx.ellipse(x, y + 2.6, 6.6, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7e8a9e'; ctx.beginPath(); ctx.ellipse(x, y + 2, 5, 2.2, 0, 0, TAU); ctx.fill();
    if (reward.type === 'hat') drawHat(ctx, reward.id, x, y - 3 + bob, 0, t, 1.5);
    else drawTapeOnFloor(ctx, {x, y: y - 2 + bob, variant: 3}, t);
  } else {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 + 0.25 * Math.sin(t * 3); ctx.drawImage(glowSprite('#ffd36e'), x - 18, y - 18, 36, 36); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const g = Math.max(0, Math.sin(t * 2.6)) ** 6; star(ctx, x + 6, y - 7 + bob, 1 + 3 * g, '#fff6d0');
  }
}

// ---------------------------------------------------------------------------------------------------- hats (seen from above, at the head)
export function drawHat(ctx, id, x, y, ang, t, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.lineJoin = 'round';
  if (id === 'tophat') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0.6, 1.8, 7.4, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0.6, 7.2, 4.2, 0, 0, TAU); ctx.fill();          // brim
    ctx.fillStyle = '#2a2433'; ctx.beginPath(); ctx.ellipse(0, -0.6, 6.4, 3.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.fillRect(-4.2, -6.4, 8.4, 6); ctx.beginPath(); ctx.ellipse(0, -0.4, 4.2, 2.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a2433'; ctx.fillRect(-3.8, -6.2, 7.6, 5.6); ctx.fillStyle = '#c8344a'; ctx.fillRect(-3.8, -2.6, 7.6, 1.4);   // band
    ctx.fillStyle = '#3c3548'; ctx.beginPath(); ctx.ellipse(0, -6.2, 3.8, 2, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.stroke();
  } else if (id === 'cone') {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-4.4, 0.8); ctx.lineTo(0.4, -10.4); ctx.lineTo(4.6, 0.8); ctx.closePath(); ctx.fill();
    const g = ctx.createLinearGradient(-4, 0, 4, 0); g.addColorStop(0, '#ff5a8a'); g.addColorStop(0.5, '#ffd36e'); g.addColorStop(1, '#4fd0c4');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-3.6, 0.4); ctx.lineTo(0.4, -9.4); ctx.lineTo(3.8, 0.4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.7; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-3 + i * 0.9, -0.4 - i * 2.8); ctx.lineTo(3.2 - i * 0.9, -0.4 - i * 2.8); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0.4, -10.6, 1.5 + 0.2 * Math.sin(t * 6), 0, TAU); ctx.fill();
  } else if (id === 'crown') {
    ctx.fillStyle = INK; ctx.fillRect(-5.2, -3, 10.4, 4.6);
    ctx.fillStyle = '#e0b64a'; ctx.fillRect(-4.6, -2.4, 9.2, 3.4); ctx.fillStyle = '#fff1a8'; ctx.fillRect(-4.6, -2.4, 9.2, 0.9);
    for (const px of [-4, 0, 4]) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, -2.6); ctx.lineTo(px, -8 - (px === 0 ? 1.5 : 0)); ctx.stroke();
      ctx.strokeStyle = '#e0b64a'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(px, -2.6); ctx.lineTo(px, -8 - (px === 0 ? 1.5 : 0)); ctx.stroke();
      const on = Math.sin(t * 5 + px) > 0; ctx.fillStyle = on ? '#ff4a5e' : '#6a2a36'; ctx.beginPath(); ctx.arc(px, -8.4 - (px === 0 ? 1.5 : 0), 1.1, 0, TAU); ctx.fill();
      if (on) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.drawImage(glowSprite('#ff4a5e'), px - 3, -11.4 - (px === 0 ? 1.5 : 0), 6, 6); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
  } else {   // headphones: a band over the head and two ear cups to the sides of the facing direction
    ctx.rotate(ang);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(0, 0, 1.4, 6.6, 0, -Math.PI / 2, Math.PI / 2, true); ctx.stroke();
    ctx.strokeStyle = '#4fd0c4'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, 0, 1.4, 6.6, 0, -Math.PI / 2, Math.PI / 2, true); ctx.stroke();
    for (const s of [-1, 1]) { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, s * 6.6, 2.6, 1.9, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8486a'; ctx.beginPath(); ctx.ellipse(0, s * 6.6, 1.8, 1.2, 0, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}
