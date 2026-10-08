// Settings as a mixing desk: LED VU ladders that follow the real audio output (AnalyserNode taps on the master bus and the
// music bus), faders with a printed scale, and rotary trim knobs that drive the same range inputs the game already listens to.
// The pure parts (level maths, segment colours, knob angle) are unit tested; mountDesk() owns the DOM and only runs its
// animation loop while the panel is visible and the tab is not hidden.
import {getAudioRuntime} from './audio.js';
import {getMusicEngine} from './music.js';

export const VU_SEGMENTS = 24;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** RMS (0..1 of full scale) to a 0..1 meter position: -54 dB at the bottom, 0 dB at the top. */
export const rmsToLevel = rms => (rms <= 1e-5 ? 0 : clamp((20 * Math.log10(rms) + 54) / 54, 0, 1));
/** Meter ballistics: fast attack, slow release (units of full scale per second). */
export function ballistic(prev, target, dt, {attack = 14, release = 1.6} = {}) {
  return target > prev ? Math.min(target, prev + attack * dt) : Math.max(target, prev - release * dt);
}
/** Segment colour index for an LED: 0 green, 1 amber, 2 red. */
export const segmentTone = (i, n = VU_SEGMENTS) => (i >= Math.round(n * 0.86) ? 2 : i >= Math.round(n * 0.64) ? 1 : 0);
/** Knob pointer angle in degrees for a 0..100 value (a 270 degree sweep). */
export const knobAngle = (value, min = 0, max = 100) => -135 + clamp((value - min) / Math.max(1e-9, max - min), 0, 1) * 270;

const TONES = [['#2fd27a', '#0f3a24'], ['#ffb347', '#40290d'], ['#ff4538', '#43120e']];

function drawVu(canvas, level, peak) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.fillStyle = '#060707'; g.fillRect(0, 0, w, h);
  const n = VU_SEGMENTS, gap = 2, sw = (w - 6 - gap * (n - 1)) / n, lit = Math.round(level * n), pk = Math.min(n - 1, Math.round(peak * n) - 1);
  for (let i = 0; i < n; i++) {
    const [on, off] = TONES[segmentTone(i, n)], x = 3 + i * (sw + gap), isLit = i < lit || i === pk;
    g.fillStyle = isLit ? on : off;
    if (isLit) { g.shadowColor = on; g.shadowBlur = 5; }
    g.fillRect(x, 3, sw, h - 6); g.shadowBlur = 0;
  }
}

export function mountDesk(panel) {
  if (!panel || typeof document === 'undefined') return {dispose() {}};
  const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ---- rotary knobs: drag, wheel and the hidden range input (keyboard) all end on the same input event
  const knobs = [...panel.querySelectorAll('.knob-unit')].map(unit => {
    const knob = unit.querySelector('.knob'), input = unit.querySelector('input[type=range]');
    const sync = () => { knob.style.setProperty('--ka', knobAngle(Number(input.value), Number(input.min), Number(input.max)) + 'deg'); };
    const set = v => { const step = Number(input.step) || 1, min = Number(input.min), max = Number(input.max); const nv = clamp(Math.round(v / step) * step, min, max); if (String(nv) !== input.value) { input.value = String(nv); input.dispatchEvent(new Event('input', {bubbles: true})); } sync(); };
    let drag = null;
    knob.addEventListener('pointerdown', e => { drag = {y: e.clientY, x: e.clientX, v: Number(input.value)}; knob.setPointerCapture?.(e.pointerId); input.focus({preventScroll: true}); e.preventDefault(); });
    knob.addEventListener('pointermove', e => { if (!drag) return; set(drag.v + (drag.y - e.clientY) * 0.8 + (e.clientX - drag.x) * 0.4); });
    const end = () => { drag = null; };
    knob.addEventListener('pointerup', end); knob.addEventListener('pointercancel', end);
    knob.addEventListener('wheel', e => { e.preventDefault(); set(Number(input.value) - Math.sign(e.deltaY) * (Number(input.step) || 1) * 2); }, {passive: false});
    knob.addEventListener('dblclick', () => set(Number(input.max)));
    input.addEventListener('input', sync);
    sync();
    return sync;
  });
  // ---- VU meters on real taps
  const vus = [...panel.querySelectorAll('canvas[data-vu]')].map(c => ({c, kind: c.dataset.vu, level: 0, peak: 0, peakAt: 0, buf: null, an: null, src: null}));
  const tap = (v, ctx, node) => {
    if (v.src === node) return;
    try { const an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0; node.connect(an); v.an = an; v.buf = new Float32Array(an.fftSize); v.src = node; } catch { v.an = null; }
  };
  let raf = 0, last = 0, silentSince = 0;
  const frame = now => {
    raf = 0;
    if (panel.hidden || document.hidden) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
    const rt = getAudioRuntime(false);
    let anyLoud = false;
    for (const v of vus) {
      if (rt) { const node = v.kind === 'music' ? (getMusicEngine()?.out || null) : rt.master; if (node) tap(v, rt.context, node); }
      let target = 0;
      if (v.an) { v.an.getFloatTimeDomainData(v.buf); let s = 0; for (let i = 0; i < v.buf.length; i++) s += v.buf[i] * v.buf[i]; target = rmsToLevel(Math.sqrt(s / v.buf.length)); }
      v.level = ballistic(v.level, target, dt);
      if (v.level >= v.peak) { v.peak = v.level; v.peakAt = now; } else if (now - v.peakAt > 700) v.peak = Math.max(v.level, v.peak - dt * 0.9);
      if (v.level > 0.02) anyLoud = true;
      drawVu(v.c, v.level, v.peak);
    }
    if (!anyLoud) silentSince = silentSince || now; else silentSince = 0;
    raf = requestAnimationFrame(frame);   // keeps listening: music can start while the panel is open
  };
  const start = () => { knobs.forEach(f => f()); if (!raf && !panel.hidden && !reduced()) raf = requestAnimationFrame(frame); else if (reduced()) for (const v of vus) drawVu(v.c, 0, 0); };
  const mo = new MutationObserver(start); mo.observe(panel, {attributes: true, attributeFilter: ['hidden']});
  const vis = () => { if (!document.hidden) start(); };
  document.addEventListener('visibilitychange', vis);
  start();
  return {dispose() { mo.disconnect(); document.removeEventListener('visibilitychange', vis); if (raf) cancelAnimationFrame(raf); }};
}
