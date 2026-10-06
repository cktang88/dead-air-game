// DEAD AIR design tokens for JS / Canvas2D consumers.
// style.css :root is the source of truth for the DOM; every value here MUST equal its CSS custom property
// (theme.test.js parses style.css and fails when they drift). Canvas layers (affordances2d, threat-indicators)
// import from here so canvas-drawn prompts, tags and badges match the DOM UI exactly.

/** CSS custom property name (without --) -> value. Keys are the canonical token names. */
export const COLORS = Object.freeze({
  bg: '#0d0b14',
  panel: 'rgba(16, 13, 24, 0.94)',
  'panel-solid': '#16121f',
  raised: '#1f1a2b',
  'raised-2': '#2a2338',
  border: 'rgba(241, 236, 221, 0.12)',
  'border-2': 'rgba(241, 236, 221, 0.22)',
  'text-hi': '#f4efe2',
  'text-mid': '#cdc7d3',
  'text-low': '#a39dae',
  health: '#ff5367',
  armor: '#75cfe0',
  scrap: '#e4b267',
  coin: '#ffd45a',
  slow: '#65dca8',
  danger: '#ff6a78',
  sprint: '#ff8a4c',
  ammo: '#f2cf8a',
  'key-top': '#2c2638',
  'key-bottom': '#211c2b',
  'key-edge': '#4a4254',
});

export const FONTS = Object.freeze({
  display: "'Barlow Condensed', 'Oswald', 'Roboto Condensed', 'Arial Narrow', 'Liberation Sans Narrow', 'Inter Display', 'Inter', system-ui, sans-serif",
  body: "'DM Sans', 'Inter', system-ui, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  mono: "'DM Mono', ui-monospace, 'SF Mono', 'DejaVu Sans Mono', Consolas, monospace",
});

export const RADII = Object.freeze({ sm: 3, md: 6, lg: 8 });
export const SPACE = Object.freeze({ 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40 });
/** Type scale in px. Nothing on screen is smaller than `micro` (11px). */
export const TYPE = Object.freeze({ micro: 11, label: 12, body: 13, lead: 15, num: 22, title: 34 });
export const MOTION = Object.freeze({ fast: 120, base: 200, slow: 360, easeOut: 'cubic-bezier(.2,.8,.2,1)', easeSpring: 'cubic-bezier(.34,1.56,.64,1)' });


/** '#rrggbb' + alpha (0..1) -> 'rgba(r,g,b,a)'. Non-hex input is returned unchanged. */
export function withAlpha(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** WCAG relative luminance of '#rrggbb'. */
export function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** WCAG contrast ratio between two '#rrggbb' colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Canvas font shorthand, e.g. canvasFont('display', 16, 800). */
export function canvasFont(role, px, weight = 700) {
  return `${weight} ${px}px ${FONTS[role] || FONTS.body}`;
}
