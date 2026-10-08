// The frequency pick as a radio tuner: a dial band with a spring-loaded needle and one live oscilloscope per offered station.
// Pure helpers (dial layout, needle spring) are exported for tests; mountTuner() owns the canvases and only runs while the
// dialog is on screen and the tab is visible.
import {drawScope} from './ui-art.js';

export const STATION_ORDER = ['static', 'deadline', 'carrier', 'nightshift', 'feedback'];
/** Dial position (0..1) of a station along the band. Stations sit evenly with margins so the needle has room to overshoot. */
export const dialPos = station => {
  const i = STATION_ORDER.indexOf(station);
  return 0.1 + 0.8 * ((i < 0 ? 2 : i) / (STATION_ORDER.length - 1));
};

/** One step of a damped spring: returns {x, v}. Under-damped so the needle visibly overshoots and settles. */
export function springStep(x, v, target, dt, {k = 140, c = 13} = {}) {
  const a = k * (target - x) - c * v;
  const nv = v + a * dt;
  return {x: x + nv * dt, v: nv};
}

const prefersReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const FREQ_MIN = 88, FREQ_MAX = 108;
export const dialFreq = pos => (FREQ_MIN + pos * (FREQ_MAX - FREQ_MIN)).toFixed(1);

function sizeCanvas(c) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(c.clientWidth)), h = Math.max(1, Math.round(c.clientHeight));
  if (c._w !== w || c._h !== h || c._dpr !== dpr) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c._w = w; c._h = h; c._dpr = dpr; }
  const ctx = c.getContext('2d'); ctx.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
  return {ctx, w, h};
}

function drawDial(c, st, now) {
  const {ctx, w, h} = sizeCanvas(c);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a0907'; ctx.fillRect(0, 0, w, h);
  // warm backlit glass strip
  ctx.fillStyle = 'rgba(255,170,70,.07)'; ctx.fillRect(0, h * 0.22, w, h * 0.5);
  const x0 = w * 0.04, x1 = w * 0.96, span = x1 - x0;
  ctx.strokeStyle = 'rgba(255,196,120,.75)'; ctx.fillStyle = 'rgba(255,196,120,.8)'; ctx.lineWidth = 1;
  ctx.font = `500 ${Math.max(10, Math.round(h * 0.11))}px "DM Mono", ui-monospace, monospace`; ctx.textAlign = 'center';
  for (let i = 0; i <= 80; i++) {
    const x = Math.round(x0 + (span * i) / 80) + 0.5, big = i % 10 === 0, mid = i % 5 === 0;
    ctx.beginPath(); ctx.moveTo(x, h * 0.74); ctx.lineTo(x, h * (big ? 0.5 : mid ? 0.58 : 0.65)); ctx.stroke();
    if (big) ctx.fillText((FREQ_MIN + (i / 80) * (FREQ_MAX - FREQ_MIN)).toFixed(1), x, h * 0.93);
  }
  // station windows
  for (const id of STATION_ORDER) {
    const s = st.stations[id], x = x0 + span * ((dialPos(id) - 0.04) / 0.92);
    const offered = s && s.slot >= 0, lit = offered;
    const bw = Math.max(36, w * 0.095);
    ctx.fillStyle = lit ? s.color : 'rgba(255,255,255,.1)';
    ctx.globalAlpha = lit ? (s.slot === st.sel ? 0.95 : 0.5) : 1;
    ctx.fillRect(x - bw / 2, h * 0.24, bw, h * 0.18);
    if (lit && s.slot === st.sel) { ctx.globalAlpha = 0.22; ctx.fillRect(x - bw / 2 - 5, h * 0.2, bw + 10, h * 0.5); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = lit ? '#14110d' : 'rgba(255,196,120,.35)';
    ctx.font = `800 ${Math.max(11, Math.round(h * 0.15))}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.fillText(lit ? String(s.slot + 1) : '·', x, h * 0.395);
    ctx.fillStyle = lit ? s.color : 'rgba(255,196,120,.38)';
    ctx.font = `700 ${Math.max(10, Math.round(h * 0.115))}px "DM Mono", ui-monospace, monospace`;
    ctx.fillText(s ? s.name : id.toUpperCase(), x, h * 0.15);
  }
  // needle
  const nx = x0 + span * ((st.needle - 0.04) / 0.92);
  ctx.shadowColor = '#ff3b2f'; ctx.shadowBlur = 10; ctx.strokeStyle = '#ff4a3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(nx, h * 0.24); ctx.lineTo(nx, h * 0.8); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff4a3a'; ctx.beginPath(); ctx.moveTo(nx - 6, h * 0.17); ctx.lineTo(nx + 6, h * 0.17); ctx.lineTo(nx, h * 0.27); ctx.fill();
  // static burst across the dial on lock
  if (st.burst > 0.02) {
    ctx.fillStyle = '#e8e2d0'; ctx.globalAlpha = Math.min(0.55, st.burst * 0.6);
    for (let i = 0; i < 46; i++) { const y = Math.random() * h; ctx.fillRect(Math.random() * w * 0.6, y, w * (0.15 + Math.random() * 0.4), 1 + Math.random() * 2); }
    ctx.globalAlpha = 1;
  }
}

/**
 * Mount the tuner on a freshly rendered #run-modal. Plates are `[data-freq]` buttons carrying data-station/data-color/data-name;
 * their `canvas.scope` gets a live trace. Returns {dispose, lock(id, done) -> boolean}.
 */
export function mountTuner(root) {
  const plates = [...root.querySelectorAll('[data-freq]')];
  const dial = root.querySelector('canvas.tuner-dial');
  if (!plates.length || !dial) return {dispose() {}, lock: () => false};
  const reduced = prefersReduced();
  const st = {sel: 0, needle: dialPos(plates[0].dataset.station), vel: 0, burst: 0, stations: {}, lockId: null, lockT: 0};
  plates.forEach((p, i) => { st.stations[p.dataset.station] = {slot: i, color: p.dataset.color, name: p.dataset.name}; });
  for (const id of STATION_ORDER) st.stations[id] ||= {slot: -1, color: '#777', name: id.toUpperCase()};
  const select = i => {
    if (st.lockId || i === st.sel || !plates[i]) return;
    st.sel = i;
    plates.forEach((p, n) => p.classList.toggle('sel', n === i));
    root.dataset.sel = String(i);
    if (reduced) { st.needle = dialPos(plates[i].dataset.station); frame(performance.now()); }
  };
  select(0); plates[0].classList.add('sel');
  const cleanups = [];
  plates.forEach((p, i) => {
    const on = () => select(i);
    p.addEventListener('pointerenter', on); p.addEventListener('focus', on);
    p.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); plates[(i + 1) % plates.length].focus(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); plates[(i + plates.length - 1) % plates.length].focus(); }
    });
  });
  const scopes = plates.map(p => ({canvas: p.querySelector('canvas.scope'), station: p.dataset.station, color: p.dataset.color}));
  const mixes = [...root.querySelectorAll('canvas.mix-scope')];
  let raf = 0, last = performance.now(), disposed = false;
  const frame = now => {
    if (disposed) return;
    if (root.hidden || !root.isConnected) { disposed = true; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    if (!reduced) {
      const target = dialPos(plates[st.sel].dataset.station);
      const s = springStep(st.needle, st.vel, target, dt, st.lockId ? {k: 420, c: 16} : undefined);
      st.needle = s.x; st.vel = s.v;
    }
    if (st.lockId) {
      st.lockT += dt;
      st.burst = Math.max(0, 1 - st.lockT / 0.28);
    } else st.burst = 0;
    drawDial(dial, st, now);
    scopes.forEach((s, i) => {
      if (!s.canvas) return;
      const {ctx, w, h} = sizeCanvas(s.canvas);
      const isSel = i === st.sel, locking = st.lockId && isSel;
      drawScope(ctx, w, h, s.station, t, {color: s.color, dim: !isSel, burst: locking ? st.burst : 0, locked: locking && st.lockT > 0.28, gain: isSel ? 1 : 0.8});
    });
    mixes.forEach(c => { const {ctx, w, h} = sizeCanvas(c); drawScope(ctx, w, h, c.dataset.a, t, {color: c.dataset.ca, second: c.dataset.b, secondColor: c.dataset.cb}); });
    if (!reduced) raf = requestAnimationFrame(frame);
  };
  const pump = () => { cancelAnimationFrame(raf); if (!document.hidden && !disposed) raf = requestAnimationFrame(frame); };
  const vis = () => { last = performance.now(); pump(); };
  document.addEventListener('visibilitychange', vis);
  cleanups.push(() => document.removeEventListener('visibilitychange', vis));
  if (reduced) requestAnimationFrame(() => frame(performance.now())); else pump();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (reduced) frame(performance.now()); }) : null;
  ro?.observe(root); cleanups.push(() => ro?.disconnect());
  return {
    dispose() { disposed = true; cancelAnimationFrame(raf); cleanups.forEach(f => f()); },
    /** Snap the needle to the chosen plate, burst static, lock the trace, then call done(). False when motion is reduced. */
    lock(id, done) {
      const i = plates.findIndex(p => p.dataset.freq === id);
      if (i < 0 || reduced || st.lockId) return false;
      st.sel = i; st.lockId = id; st.lockT = 0;
      plates.forEach((p, n) => { p.classList.toggle('sel', n === i); p.classList.toggle('dead', n !== i); });
      root.classList.add('locking');
      setTimeout(() => plates[i].classList.add('locked'), 280);
      setTimeout(() => done?.(), 560);
      return true;
    },
  };
}
