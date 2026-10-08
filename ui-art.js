// DEAD AIR equipment art: drawn parts for the physical-interface language (see docs/art/UI_DIRECTION.md).
// Pure string builders + pure waveform maths, so they can be unit tested under node. The DOM/canvas
// controllers live in tuner-ui.js and panel-ui.js.
import {STAT_DEFS} from './hud-ui.js';

/* ------------------------------------------------------------------ emblems */
// One bold drawn emblem per frequency (viewBox 100x100). Three paint classes, themed by CSS:
//   .a = the station-coloured stroke (the "action"), .b = the pale ink stroke (the actors), .f = station-coloured fill.
const E = body => `<svg class="emblem" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${body}</svg>`;
const rays = (n, d, r0, r1) => Array.from({length: n}, (_, i) => `<path d="M50 ${50 - r0}V${50 - r1}" transform="rotate(${(360 / n) * i + d} 50 50)"/>`).join('');

export const EMBLEMS = {
  // STATIC
  arc: E('<circle class="b" cx="20" cy="74" r="9"/><circle class="b" cx="80" cy="26" r="9"/><path class="a" d="M27 67 44 58 37 48 58 44 51 33 73 33"/><path class="a" d="M14 56 8 50M26 90l-2 7M88 42l6 4M74 10l2-6"/>'),
  jam: E('<circle class="b" cx="50" cy="50" r="27"/><path class="b" d="M50 12v12M50 76v12M12 50h12M76 50h12"/><path class="a" d="M10 50 26 36 36 66 48 28 60 70 70 40 78 54 90 50"/>'),
  bubble: E('<circle class="a" cx="50" cy="50" r="38" stroke-dasharray="3 7"/><circle class="b" cx="50" cy="50" r="12"/><rect class="f" x="14" y="26" width="22" height="9" rx="4.5" transform="rotate(32 25 30)"/><path class="a" d="M6 20l10 5M2 32l10 4"/><path class="b" d="M62 62l18 18"/>'),
  pulse: E('<circle class="f" cx="50" cy="50" r="8"/><path class="a" d="M33 33A24 24 0 0 0 33 67M67 33A24 24 0 0 1 67 67"/><path class="b" d="M20 20A42 42 0 0 0 20 80M80 20A42 42 0 0 1 80 80"/>'),
  // DEADLINE
  credit: E('<circle class="b" cx="46" cy="56" r="31"/><path class="a" d="M46 56V34M46 56l15 9"/><path class="b" d="M36 14h20M46 14v10"/><path class="a" d="M82 14v22M71 25h22"/>'),
  hang: E('<g class="b"><rect x="12" y="26" width="34" height="11" rx="5.5"/><rect x="28" y="48" width="34" height="11" rx="5.5"/><rect x="44" y="70" width="34" height="11" rx="5.5"/></g><path class="a" d="M52 31h12M68 53h12M84 75h8"/><rect class="f" x="70" y="10" width="7" height="22"/><rect class="f" x="83" y="10" width="7" height="22"/>'),
  heldBreath: E('<circle class="a" cx="50" cy="50" r="40"/><circle class="a" cx="50" cy="50" r="25" opacity=".6"/><circle class="b" cx="50" cy="50" r="8"/><path class="b" d="M50 4v14M50 82v14M4 50h14M82 50h14"/>'),
  // CARRIER
  pierce: E('<circle class="b" cx="32" cy="50" r="15"/><circle class="b" cx="68" cy="50" r="15"/><path class="a" d="M4 50H96M82 36l14 14-14 14"/>'),
  ricochet: E('<path class="b" d="M8 88H92"/><path class="a" d="M10 14 46 82 88 24M76 20l12 4-3 13"/><circle class="f" cx="46" cy="84" r="5"/>'),
  homing: E('<path class="a" d="M10 86C18 26 60 96 72 38"/><path class="a" d="M62 44l10-6 4 12"/><circle class="b" cx="78" cy="26" r="15"/><circle class="f" cx="78" cy="26" r="5"/>'),
  shards: E(`<g class="f">${[0, 60, 120, 180, 240, 300].map(a => `<path d="M50 8 58 34H42z" transform="rotate(${a} 50 50)"/>`).join('')}</g><circle class="b" cx="50" cy="50" r="9"/>`),
  // NIGHT SHIFT
  noise: E('<rect class="b" x="37" y="10" width="26" height="46" rx="13"/><path class="b" d="M24 44a26 26 0 0 0 52 0M50 70v20M36 90h28"/><path class="a" d="M14 86 86 14"/>'),
  unaware: E('<path class="b" d="M6 50Q50 8 94 50 50 92 6 50z"/><circle class="b" cx="50" cy="50" r="13"/><path class="a" d="M16 86 84 14"/>'),
  smokeReload: E('<path class="b" d="M24 70a15 15 0 0 1 2-30 20 20 0 0 1 38-6 17 17 0 0 1 12 36z"/><path class="a" d="M60 90a14 14 0 1 1-2-17M62 70v-12H50"/>'),
  cones: E('<path class="b" d="M10 50 90 12V88z" opacity=".55"/><path class="a" d="M10 50 56 28V72z"/><circle class="f" cx="12" cy="50" r="7"/>'),
  // FEEDBACK
  missingHp: E('<path class="b" d="M50 88C6 58 16 14 50 36 84 14 94 58 50 88z"/><path class="a" d="M10 54H34L41 38 53 70 59 50H90"/>'),
  echo: E('<circle class="f" cx="20" cy="50" r="8"/><path class="a" d="M37 36a20 20 0 0 1 0 28"/><path class="a" d="M52 26a34 34 0 0 1 0 48" opacity=".7"/><path class="a" d="M67 16a48 48 0 0 1 0 68" opacity=".45"/>'),
  burnKill: E('<path class="a" d="M50 94C20 94 14 64 34 46c2 12 10 12 8-8C42 22 54 14 62 6c2 18 22 30 20 58 0 18-14 30-32 30z"/><path class="b" d="M50 90c-12 0-14-14-6-22 4 6 12 4 10-6 12 8 14 28-4 28z"/>'),
  backlash: E(`<rect class="b" x="36" y="36" width="28" height="28"/><g class="a">${rays(8, 0, 22, 44)}</g>`),
};

/** Station fall-back emblem when an effect has none (and the small station glyph used on tape labels). */
export const STATION_EMBLEM = {
  static: EMBLEMS.arc, deadline: EMBLEMS.credit, carrier: EMBLEMS.pierce, nightshift: EMBLEMS.noise, feedback: EMBLEMS.echo,
};
export const emblemFor = (effect, station) => EMBLEMS[effect] || STATION_EMBLEM[station] || EMBLEMS.arc;

/* ------------------------------------------------------------------ oscilloscope waveforms */
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Deterministic hash noise in [-1, 1] so the static trace is cheap and testable.
export const hashNoise = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };

/** Waveform per station: (x in 0..1, t seconds) -> y in -1..1. Every station reads differently at a glance. */
export const WAVES = {
  static: (x, t) => clamp(hashNoise(Math.floor(x * 70) + Math.floor(t * 22) * 131) * (0.55 + 0.4 * Math.abs(Math.sin(x * 9 + t))), -1, 1),
  deadline: (x, t) => { const phase = (t * 0.45) % 1; return Math.sin(x * TAU * 1.5 - t * 1.4) * 0.55 + Math.exp(-(((x - phase) * 34) ** 2)) * 0.95; },
  carrier: (x, t) => Math.sin(x * TAU * 7 - t * 7) * (0.45 + 0.35 * Math.abs(Math.sin(x * TAU * 1.1 - t * 1.6))),
  nightshift: (x, t) => Math.sin(x * TAU * 2 - t * 0.9) * 0.07 + hashNoise(Math.floor(x * 30) + Math.floor(t * 4) * 17) * 0.03 + Math.exp(-(((x - ((t * 0.18) % 1)) * 22) ** 2)) * 0.16,
  feedback: (x, t) => clamp(Math.sin(x * TAU * 3 - t * 4.5) * 2.4, -0.82, 0.82),
};
export const waveFor = station => WAVES[station] || WAVES.carrier;

/** Sample a trace into `n` y-values (used by tests and by the canvas painter). */
export function sampleWave(station, t, n = 96) {
  const f = waveFor(station);
  return Array.from({length: n}, (_, i) => f(i / (n - 1), t));
}

/** Paint one oscilloscope screen. opts: color, gain, burst (0..1 static takeover), locked (clean, white-hot), second (crossfade partner). */
export function drawScope(ctx, w, h, station, t, {color = '#7dffb0', gain = 1, burst = 0, locked = false, second = null, secondColor = '#ffffff', dim = false} = {}) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#050806'; ctx.fillRect(0, 0, w, h);
  // graticule
  ctx.strokeStyle = color; ctx.globalAlpha = dim ? 0.07 : 0.14; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 1; i < 8; i++) { const x = Math.round((w * i) / 8) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let j = 1; j < 4; j++) { const y = Math.round((h * j) / 4) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke(); ctx.globalAlpha = 1;
  const mid = h / 2, amp = h * 0.38 * gain, n = Math.max(48, Math.min(160, Math.floor(w / 3)));
  const trace = (fn, col, width, alpha) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * w; let y = fn(i / (n - 1), t); if (burst > 0) y = y * (1 - burst) + hashNoise(i * 3 + Math.floor(t * 60) * 7) * burst; const py = mid - y * amp; i ? ctx.lineTo(x, py) : ctx.moveTo(x, py); }
    ctx.strokeStyle = col; ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1;
  };
  const main = locked ? WAVES.carrier : waveFor(station);
  const col = locked ? '#f6fff2' : color;
  const a = dim ? 0.45 : 1;
  trace(main, col, 5, 0.16 * a); trace(main, col, 1.8, 0.95 * a);
  if (second) { trace(waveFor(second), secondColor, 4, 0.14 * a); trace(waveFor(second), secondColor, 1.4, 0.85 * a); }
  if (burst > 0.2) { ctx.fillStyle = color; ctx.globalAlpha = burst * 0.25; for (let i = 0; i < 14; i++) ctx.fillRect(hashNoise(i + t * 40) * w, ((hashNoise(i * 5 + 1) + 1) / 2) * h, w * 0.4, 1 + (i % 3)); ctx.globalAlpha = 1; }
}

/* ------------------------------------------------------------------ mechanical digits */
/** Split-flap drum strip: one flap per digit. `data-v` is read by panel-ui.js to count the drums up. */
export function flapHtml(value, {pad = 3, cls = ''} = {}) {
  const s = String(Math.max(0, Math.floor(value))).padStart(pad, '0');
  return `<span class="flap-row ${cls}" data-flap="${Math.max(0, Math.floor(value))}" data-pad="${pad}" role="text" aria-label="${s}">${[...s].map(d => `<i class="flap" aria-hidden="true"><b>${d}</b></i>`).join('')}</span>`;
}

/** A lamp (CSS draws the lens). state: on | off | warn | blink. */
export const lampHtml = (state = 'off', cls = '') => `<i class="lamp ${state} ${cls}" aria-hidden="true"></i>`;

/** Rank as VU lamps: `rank` lit of `max`; the freshest one is marked so CSS can blink it. */
export function vuHtml(rank, max = 3, {fresh = true} = {}) {
  return `<span class="vu" aria-hidden="true">${Array.from({length: max}, (_, i) => `<i class="${i < rank ? (fresh && i === rank - 1 ? 'on fresh' : 'on') : ''}"></i>`).join('')}</span>`;
}

/** Semicircle risk gauge. pct 0..1 -> needle angle; the red sector starts at `redFrom`. */
export function gaugeHtml(pct, {redFrom = 0.55, label = 'RISK'} = {}) {
  const p = clamp(pct, 0, 1), ang = -80 + p * 160;
  const pt = (f, r) => { const a = (-180 + f * 180) * (Math.PI / 180); return `${(60 + Math.cos(a) * r).toFixed(1)} ${(62 + Math.sin(a) * r).toFixed(1)}`; };
  const arc = (f0, f1, r) => `M${pt(f0, r)}A${r} ${r} 0 0 1 ${pt(f1, r)}`;
  const ticks = Array.from({length: 11}, (_, i) => { const f = i / 10; return `<path d="M${pt(f, 40)}L${pt(f, i % 5 === 0 ? 33 : 36)}"/>`; }).join('');
  return `<svg class="gauge" viewBox="0 0 120 72" role="img" aria-label="${label} ${Math.round(p * 100)} percent"><path class="g-ok" d="${arc(0, redFrom, 46)}"/><path class="g-red" d="${arc(redFrom, 1, 46)}"/><g class="g-ticks">${ticks}</g><g class="g-needle" style="--to:${ang.toFixed(1)}deg"><path d="M60 62 59 20 60 12 61 20z"/></g><circle class="g-hub" cx="60" cy="62" r="5"/></svg>`;
}

/** Hazard-stripe is pure CSS (.hazard); this is the stencil + screws legend plate used above levers. */
export const plateLabel = text => `<span class="tapelabel">${text}</span>`;

export const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));

/* ------------------------------------------------------------------ analog meters (loadout rack, pickup tag) */
/** The four needles on a gun's tag. Fractions are relative to the best gun in the catalogue so the dial reads as "how much of the scale". */
export const METER_DEFS = [
  {id: 'damage', label: 'DMG', value: g => STAT_DEFS[0].value(g)},
  {id: 'rate', label: 'RATE', value: g => STAT_DEFS[1].value(g)},
  {id: 'range', label: 'RNG', value: g => STAT_DEFS[2].value(g)},
  {id: 'noise', label: 'NOISE', value: (g, modNoise = 1) => (g.noise ?? 1) * modNoise, lowerBetter: true},
];
const METER_MAX = new WeakMap();
const meterMax = guns => {
  let m = METER_MAX.get(guns);
  if (!m) { m = Object.fromEntries(METER_DEFS.map(d => [d.id, Math.max(1e-6, ...guns.map(g => d.value(g)))])); METER_MAX.set(guns, m); }
  return m;
};
/** Meter data for a gun; `versus` (the gun being compared against) adds a ghost fraction per meter. */
export function analogMeters(gun, guns, {mod = null, versus = null, versusMod = null} = {}) {
  const max = meterMax(guns);
  return METER_DEFS.map(d => {
    const v = d.value(gun, mod?.noiseMult ?? 1), o = versus ? d.value(versus, versusMod?.noiseMult ?? 1) : null;
    return {id: d.id, label: d.label, value: v, frac: clamp(v / max[d.id], 0, 1), ghost: o == null ? null : clamp(o / max[d.id], 0, 1),
      text: d.id === 'noise' ? v.toFixed(2) : String(Math.round(v)), lowerBetter: !!d.lowerBetter};
  });
}
/** Needle angle in degrees for a 0..1 fraction (a 150 degree sweep, zero at the left). */
export const needleAngle = f => -75 + clamp(f, 0, 1) * 150;

/** One small analog gauge as SVG. The needle rotates with CSS (`--a`) so it can swing in and settle; a ghost needle marks the compared gun. */
export function gaugeSvg(m) {
  const ticks = Array.from({length: 11}, (_, i) => { const a = (needleAngle(i / 10) - 90) * Math.PI / 180, big = i % 5 === 0, r0 = big ? 17 : 19.5; return `<path d="M${(32 + Math.cos(a) * r0).toFixed(1)} ${(36 + Math.sin(a) * r0).toFixed(1)}L${(32 + Math.cos(a) * 22.5).toFixed(1)} ${(36 + Math.sin(a) * 22.5).toFixed(1)}"/>`; }).join('');
  const ghost = m.ghost == null ? '' : `<g class="needle ghost" data-a="${needleAngle(m.ghost).toFixed(1)}" style="--a:-75deg"><path d="M32 36V16"/></g>`;
  return `<span class="gauge ${m.id}" role="img" aria-label="${m.label} ${m.text}"><svg viewBox="0 0 64 46" aria-hidden="true" focusable="false"><path class="face" d="M5 38A29 29 0 0 1 59 38z"/><g class="ticks">${ticks}</g>${m.id === 'noise' ? '<path class="red" d="M44 17.5A22.5 22.5 0 0 1 54 28"/>' : ''}${ghost}<g class="needle" data-a="${needleAngle(m.frac).toFixed(1)}" style="--a:-75deg"><path d="M32 36V14"/></g><circle class="hub" cx="32" cy="36" r="3"/></svg><b>${m.text}</b><small>${m.label}</small></span>`;
}
export const gaugeRowHtml = (gun, guns, opts) => `<div class="gauges">${analogMeters(gun, guns, opts).map(gaugeSvg).join('')}</div>`;
