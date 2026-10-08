// TITLE SCENE: a live frozen-time firefight behind the title menu. It is the game's own look at 0.08x: the real actor
// sprites, glow sprites and floor grime, with bullets hanging in the air (streaks, brass, glass), an enemy caught
// mid-lunge, a slow camera drift, and every few seconds a "tick" where the world lurches forward and settles again,
// so the title shows the one rule of the game (time follows you) before a word is read.
//
// Self-contained: owns one <canvas id="title-scene"> inside #game-shell, draws only while #overlay.show, and does
// nothing under prefers-reduced-motion beyond a single still frame.

import {actorSprite, glowSprite, ACTOR_LOOK} from './sprites2d.js';
import {grimeTile} from './textures2d.js';
import {tickPhase, driftCamera, sceneBullets, hitBullet, countBullets} from './title-scene-core.js';
import {loadCosmetics, saveCosmetics, unlockHat} from './easter.js';

const TAU = Math.PI * 2;

export function startTitleScene({reduced = false} = {}) {
  if (typeof document === 'undefined') return null;
  const shell = document.getElementById('game-shell'), overlay = document.getElementById('overlay');
  if (!shell || !overlay) return null;
  const canvas = document.createElement('canvas');
  canvas.id = 'title-scene'; canvas.setAttribute('aria-hidden', 'true');
  // inline layout so the backdrop never depends on style.css having loaded (an unstyled canvas would sit in the page flow)
  Object.assign(canvas.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '6', pointerEvents: 'none'});
  shell.insertBefore(canvas, overlay);
  // hide the instant the title menu closes, not on this canvas's next animation frame: a busy main thread right after a run
  // starts must never leave the backdrop standing in front of the game
  const sync = () => { canvas.style.visibility = overlay.classList.contains('show') ? 'visible' : 'hidden'; };
  new MutationObserver(sync).observe(overlay, {attributes: true, attributeFilter: ['class']});
  sync();
  const g = canvas.getContext('2d');
  let pattern = null, W = 0, H = 0, raf = 0, last = performance.now(), t = 0;
  const bullets = sceneBullets();
  const popped = new Map(), pops = [];   // easter egg: click a hanging round to pop it; pop them all for a party hat
  let lastS = 3, lastCam = {x: 0, y: 0}, lastPh = {lurch: 0}, caption = 0;

  const resize = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = Math.max(2, Math.round(shell.clientWidth * dpr)); H = Math.max(2, Math.round(shell.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  };

  function sprite(kind, x, y, ang, {scale = 1, alpha = 1, stretch = 1} = {}) {
    const s = actorSprite(kind), look = ACTOR_LOOK[kind];
    g.save(); g.translate(x, y); g.globalAlpha = alpha;
    const glow = glowSprite(look.color); g.globalAlpha = alpha * 0.35; g.drawImage(glow, -look.r * 2.6, -look.r * 2.6, look.r * 5.2, look.r * 5.2); g.globalAlpha = alpha;
    g.save(); g.rotate(ang); g.scale(stretch * scale, scale / Math.sqrt(stretch)); g.rotate(-ang);
    g.drawImage(s.base, -s.half, -s.half, s.half * 2, s.half * 2); g.restore();
    g.save(); g.rotate(ang); g.scale(scale, scale); g.drawImage(s.detail, -s.half, -s.half, s.half * 2, s.half * 2);
    if (kind === 'player' || kind === 'gunner' || kind === 'guard') { g.fillStyle = '#14111a'; g.fillRect(8, -2.2, 14, 4.4); g.fillStyle = '#6b6f7e'; g.fillRect(9, -1.4, 12, 2.2); }
    g.restore(); g.restore();
  }

  function draw() {
    const S = Math.max(2.2, H / 290), ph = tickPhase(t), cam = driftCamera(t);
    lastS = S; lastCam = cam; lastPh = ph;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#10151f'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W * 0.5, H * 0.5); g.scale(S, S); g.translate(-cam.x, -cam.y);
    // floor: cold steel tiles with grime, parallax-locked to the world
    if (!pattern) pattern = g.createPattern(grimeTile(192, 5, 1.2), 'repeat');
    const x0 = cam.x - W / S, x1 = cam.x + W / S, y0 = cam.y - H / S, y1 = cam.y + H / S;
    g.fillStyle = '#26334a'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = pattern; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = 'rgba(120,170,210,0.10)'; g.lineWidth = 0.8 / 1; g.beginPath();
    for (let x = Math.floor(x0 / 32) * 32; x < x1; x += 32) { g.moveTo(x, y0); g.lineTo(x, y1); }
    for (let y = Math.floor(y0 / 32) * 32; y < y1; y += 32) { g.moveTo(x0, y); g.lineTo(x1, y); }
    g.stroke();
    // a crate and a pillar for cover
    g.fillStyle = '#2c3646'; g.strokeStyle = '#0d1018'; g.lineWidth = 2;
    for (const [cx, cy] of [[20, -64], [-52, 70]]) { g.fillRect(cx - 14, cy - 14, 28, 28); g.strokeRect(cx - 14, cy - 14, 28, 28); g.strokeStyle = 'rgba(160,190,220,.25)'; g.strokeRect(cx - 9, cy - 9, 18, 18); g.strokeStyle = '#0d1018'; }
    // actors: the player (left), a chaser caught mid-lunge with afterimages, a gunner firing from the right
    for (let i = 3; i >= 1; i--) sprite('chaser', 8 - i * 11 + ph.lurch * 4, 18 + i * 3, -0.2, {alpha: 0.12 * (4 - i), stretch: 1.25});
    sprite('chaser', 8 + ph.lurch * 4, 18, -0.2, {stretch: 1.3, scale: 1.08});
    sprite('player', -118, 26, -0.12 + 0.01 * Math.sin(t * 0.7));
    sprite('gunner', 150, -40, Math.PI + 0.35);
    sprite('guard', 110, 82, Math.PI - 0.5);
    // muzzle flashes, frozen at the instant of firing
    g.globalCompositeOperation = 'lighter';
    for (const [mx, my, col] of [[-94, 22, '#ffe39a'], [128, -33, '#ff8a6a'], [90, 76, '#ff8a6a']]) { const gl = glowSprite(col); g.globalAlpha = 0.85; g.drawImage(gl, mx - 20, my - 20, 40, 40); }
    g.globalAlpha = 1;
    // bullets, brass and glass hanging in the air; the tick lurches them forward
    for (let bi = 0; bi < bullets.length; bi++) {
      const b = bullets[bi];
      if (popped.has(bi)) continue;
      const adv = b.drift * 9 * Math.sin(t * 0.11) + ph.lurch * b.lurch, x = b.x + Math.cos(b.ang) * adv, y = b.y + Math.sin(b.ang) * adv;
      const L = b.len * (1 + 1.6 * ph.lurchRate);
      g.save(); g.translate(x, y); g.rotate(b.ang);
      if (b.kind === 'bullet') {
        const tail = g.createLinearGradient(0, 0, -L, 0); tail.addColorStop(0, b.col + 'cc'); tail.addColorStop(1, b.col + '00');
        g.strokeStyle = tail; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-L, 0); g.stroke();
        const gl = glowSprite(b.col); g.globalAlpha = 0.7; g.drawImage(gl, -11, -11, 22, 22); g.globalAlpha = 1;
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, 4.2, 1.9, 0, 0, TAU); g.fill();
      } else {
        g.globalAlpha = 0.5 + 0.4 * Math.sin(t * 1.3 + b.x); g.fillStyle = b.kind === 'brass' ? '#e2b562' : '#bfe4ff';
        g.rotate(b.spin + t * 0.15); g.fillRect(-b.len / 2, -0.9, b.len, 1.8);
      }
      g.restore();
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const pp = pops[i], k = (t - pp.at) / 0.5;
      if (k >= 1) { pops.splice(i, 1); continue; }
      g.strokeStyle = `rgba(255,230,160,${1 - k})`; g.lineWidth = 1.6; g.beginPath(); g.arc(pp.x, pp.y, 3 + k * 16, 0, TAU); g.stroke();
      for (let j = 0; j < 6; j++) { const a = j * TAU / 6 + pp.at; g.beginPath(); g.moveTo(pp.x + Math.cos(a) * (4 + k * 10), pp.y + Math.sin(a) * (4 + k * 10)); g.lineTo(pp.x + Math.cos(a) * (7 + k * 18), pp.y + Math.sin(a) * (7 + k * 18)); g.stroke(); }
    }
    g.globalCompositeOperation = 'source-over'; g.restore();
    if (caption > 0) { g.fillStyle = `rgba(255,236,170,${Math.min(1, caption)})`; g.font = `bold ${Math.round(H / 26)}px monospace`; g.textAlign = 'center'; g.fillText('ALL CLEAR · NICE SHOOTING · PARTY HAT UNLOCKED', W / 2, H * 0.94); }
    // grade: cold desaturated wash, a pulse of colour on each tick, vignette
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgba(20,36,66,${0.16 - 0.1 * ph.lurchRate})`; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W * 0.5, H * 0.5, H * 0.25, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(4,6,14,0)'); vg.addColorStop(1, 'rgba(4,6,14,0.6)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const on = overlay.classList.contains('show');
    canvas.style.visibility = on ? 'visible' : 'hidden';
    if (!on) return;
    t += reduced ? 0 : dt; caption = Math.max(0, caption - dt); resize(); draw();
  }
  const onDown = (e) => {
    if (!overlay.classList.contains('show') || e.target.closest?.('button,a,input,select,textarea,label,[role=button],summary')) return;
    const r = canvas.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width, py = (e.clientY - r.top) * H / r.height;
    const pt = {x: (px - W / 2) / lastS + lastCam.x, y: (py - H / 2) / lastS + lastCam.y};
    const i = hitBullet(bullets, t, lastPh, pt, popped);
    if (i < 0) return;
    popped.set(i, t); pops.push({x: pt.x, y: pt.y, at: t});
    if (popped.size >= countBullets(bullets)) {
      caption = 5; popped.clear();
      // the game owns the in-memory cosmetics (eggs.unlock): ask it first so the hat is worn now and the next save() keeps it
      let handled = false;
      try { handled = !window.dispatchEvent(new CustomEvent('deadair-unlock-hat', {detail: 'cone', cancelable: true})); } catch { /* no events */ }
      if (!handled) try { saveCosmetics(localStorage, unlockHat(loadCosmetics(localStorage), 'cone').cosmetics); } catch { /* no storage */ }
    }
  };
  shell.addEventListener('pointerdown', onDown);
  window.addEventListener('resize', resize);
  resize(); t = 3; draw();
  if (!reduced) raf = requestAnimationFrame(frame);
  return {stop() { cancelAnimationFrame(raf); canvas.remove(); window.removeEventListener('resize', resize); shell.removeEventListener('pointerdown', onDown); }};
}

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__deadairNoIntro) {
  const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  try { startTitleScene({reduced}); } catch (e) { console.error(e); }
}
