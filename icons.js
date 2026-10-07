// DEAD AIR icon library.
// Single-colour glyphs (game-icons.net CC BY 3.0, Material Design Icons Apache 2.0 - see CREDITS.md)
// inlined as path data so nothing is fetched at runtime. Works for DOM UI (iconSvg) and Canvas2D
// (drawIcon / iconImage). Everything touching the DOM / Canvas is lazy so this module imports under node.
import { ICON_DATA } from './icons-data.js';

/** id -> { vb, d, src }. `vb` is the viewBox, `d` the SVG path data, `src` the upstream icon name. */
export const ICON_PATHS = ICON_DATA;
export const ICON_IDS = Object.freeze(Object.keys(ICON_DATA));
export const hasIcon = id => Object.prototype.hasOwnProperty.call(ICON_DATA, id);

// ---------------------------------------------------------------- game id -> icon id
/** Gun categories (catalog.js `category`) -> icon id. */
export const GUN_CATEGORY_ICON = {
  'PISTOL': 'gun-pistol', 'SMG': 'gun-smg', 'SHOTGUN': 'gun-shotgun',
  'ASSAULT RIFLE': 'gun-rifle', 'SNIPER': 'gun-sniper', 'ANTI-MATERIEL': 'gun-antimateriel', 'LAUNCHER': 'gun-launcher',
};
/** Throwable ids (smoke / flash / frag / incendiary). */
export const THROWABLE_ICON = {
  smoke: 'throw-smoke', flash: 'throw-flash', frag: 'throw-frag',
};
/** Enemy type ids from ENEMY_TYPES (chaser = RUSHER, guard = WARDEN). */
export const ENEMY_ICON = {
  chaser: 'enemy-rusher', gunner: 'enemy-gunner', brute: 'enemy-brute', guard: 'enemy-warden', sniper: 'gun-sniper', riot: 'status-shield', boss: 'enemy-brute',
};
/** Weapon attachment ids from MODS in catalog.js. */
export const MOD_ICON = {
  extended: 'mod-extended', suppressor: 'mod-suppressor', ricochet: 'mod-ricochet',
  incendiary: 'mod-incendiary', quickdraw: 'mod-quickdraw', longbarrel: 'mod-longbarrel',
};
/** Legacy short names used by the HUD (hud-ui strokeIcon) -> icon id. */
export const LEGACY_ICON = {
  smoke: 'throw-smoke', flash: 'throw-flash', frag: 'throw-frag', incendiary: 'mod-incendiary', supply: 'pickup-supply',
  ammo: 'pickup-ammo', health: 'pickup-heal', upgrade: 'pickup-upgrade', prototype: 'pickup-prototype',
  scrap: 'pickup-scrap', armor: 'pickup-armor', harness: 'pickup-harness', scanner: 'pickup-scanner',
  mod: 'pickup-mod', coin: 'pickup-coin', gear: 'settings',
};

/** Resolve a game id, legacy name or icon id to an existing icon id (or the fallback). */
export function resolveIcon(id, fallback = 'status-warning') {
  if (hasIcon(id)) return id;
  const mapped = GUN_CATEGORY_ICON[id] || LEGACY_ICON[id] || ENEMY_ICON[id] || MOD_ICON[id];
  return mapped && hasIcon(mapped) ? mapped : fallback;
}

const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const vbCache = new WeakMap();
const vbParts = entry => { let v = vbCache.get(entry); if (!v) { v = entry.vb.split(/\s+/).map(Number); vbCache.set(entry, v); } return v; };
const vbX = entry => vbParts(entry)[0];
const vbY = entry => vbParts(entry)[1];
function viewBoxSize(entry) {
  const parts = vbParts(entry);
  return { w: parts[2], h: parts[3] };
}

function pathMarkup(entry) {
  const path = `<path d="${entry.d}"/>`;
  return entry.r ? `<g transform="rotate(${entry.r.join(' ')})">${path}</g>` : path;
}

// ---------------------------------------------------------------- DOM
/**
 * SVG markup for DOM UI. Fills with `color` (default currentColor so CSS can tint it).
 * Options: size (px, default 24; pass 0 to omit width/height so CSS sizes it), color, title (accessible label; omitted = decorative), cls.
 */
export function iconSvg(id, { size = 24, color = 'currentColor', title = '', cls = '' } = {}) {
  const entry = ICON_DATA[resolveIcon(id)];
  const label = title ? `role="img" aria-label="${esc(title)}"` : 'aria-hidden="true"';
  const klass = cls ? ` class="${esc(cls)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg"${klass} ${size ? `width="${size}" height="${size}" ` : ''}viewBox="${entry.vb}" fill="${esc(color)}" ${label}>${title ? `<title>${esc(title)}</title>` : ''}${pathMarkup(entry)}</svg>`;
}

// ---------------------------------------------------------------- Canvas
const path2dCache = new Map();
function path2d(id) {
  if (typeof Path2D === 'undefined') return null;
  let p = path2dCache.get(id);
  if (!p) { p = new Path2D(ICON_DATA[id].d); path2dCache.set(id, p); }
  return p;
}

/**
 * Draw an icon on a Canvas2D context, CENTRED on (x, y), fitted into a `size` x `size` box.
 * Uses Path2D (crisp at any scale); falls back to a cached image if Path2D is missing.
 * Returns false when nothing could be drawn (node, or image not loaded yet).
 */
export function drawIcon(ctx, id, x, y, size = 24, color = '#fff') {
  id = resolveIcon(id);
  const entry = ICON_DATA[id];
  const p = path2d(id);
  if (p) {
    const { w, h } = viewBoxSize(entry);
    const s = size / Math.max(w, h);
    ctx.save();
    ctx.translate(x - (w * s) / 2, y - (h * s) / 2);
    ctx.scale(s, s);
    ctx.translate(-vbX(entry), -vbY(entry));
    if (entry.r) { ctx.translate(entry.r[1], entry.r[2]); ctx.rotate(entry.r[0] * Math.PI / 180); ctx.translate(-entry.r[1], -entry.r[2]); }
    ctx.fillStyle = color;
    ctx.fill(p);
    ctx.restore();
    return true;
  }
  const img = iconImage(id, color, size);
  if (img && img.complete && img.naturalWidth) { ctx.drawImage(img, x - size / 2, y - size / 2, size, size); return true; }
  return false;
}

const imageCache = new Map();
/**
 * Cached HTMLImageElement for the icon in a given colour/size (browser only, null under node).
 * Built lazily from a data: URL; `img.complete` turns true once decoded.
 */
export function iconImage(id, color = '#fff', size = 64) {
  if (typeof Image === 'undefined') return null;
  id = resolveIcon(id);
  const key = `${id}|${color}|${size}`;
  let img = imageCache.get(key);
  if (!img) {
    img = new Image(size, size);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(id, { size, color }))}`;
    imageCache.set(key, img);
  }
  return img;
}
