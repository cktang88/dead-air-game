// DEAD AIR HUD / menu presentation helpers.
// Pure helpers (stats, tempo, tone inference) are unit tested; DOM helpers are lazy so this
// module can be imported under node.

// ---------------------------------------------------------------- icons
// Real glyphs live in icons.js (game-icons.net / MDI, single colour, tinted via currentColor).
// CSS sizes the <svg> (class names are unchanged), so no width/height attributes are emitted here.
import { iconSvg, GUN_CATEGORY_ICON, resolveIcon } from './icons.js';

export function gunIcon(gunOrCategory, cls = 'gun-ico') {
  const category = typeof gunOrCategory === 'string' ? gunOrCategory : gunOrCategory?.category;
  return iconSvg(GUN_CATEGORY_ICON[category] || 'gun-smg', { size: 0, cls });
}

/** Icon for an item / pickup / throwable / mod id (smoke, ammo, health, armor, extended, ...). */
export function strokeIcon(name, cls = 'ico') {
  return iconSvg(resolveIcon(name, 'pickup-mod'), { size: 0, cls });
}

// ---------------------------------------------------------------- tiers
export const TIER_COLORS = { common: '#d38ff5', uncommon: '#71d49b', rare: '#66b9f2', prototype: '#f4c66d' };
export const tierColor = id => TIER_COLORS[id] || TIER_COLORS.common;

const CATEGORY_COLORS = {
  PISTOL: '#e8c58c', SMG: '#ffc66d', SHOTGUN: '#ff9a72', 'ASSAULT RIFLE': '#7ee0b8', SNIPER: '#8bc8ff', 'ANTI-MATERIEL': '#b0a2ff',
};
export const categoryColor = category => CATEGORY_COLORS[category] || '#e8c58c';

// ---------------------------------------------------------------- stats
export function weaponCycleRpm(gun) {
  const shots = gun.burst?.shots || 1;
  const cycle = gun.burst ? Math.max(gun.rate, (shots - 1) * gun.burst.interval) : gun.rate;
  return Math.round(60 * shots / cycle);
}

export const STAT_DEFS = [
  { id: 'damage', label: 'DAMAGE', lowerBetter: false, value: gun => Math.round(gun.damage * (gun.count || 1)) },
  { id: 'rate', label: 'RATE', lowerBetter: false, value: weaponCycleRpm },
  { id: 'range', label: 'RANGE', lowerBetter: false, value: gun => gun.range },
  { id: 'weight', label: 'WEIGHT', lowerBetter: true, value: gun => gun.weight },
];

export function statMaxima(guns) {
  return Object.fromEntries(STAT_DEFS.map(def => [def.id, Math.max(1, ...guns.map(gun => def.value(gun)))]));
}

// 'up' = candidate better than current, 'down' = worse, 'same' otherwise.
export function compareStat(current, candidate, lowerBetter = false) {
  if (current == null || candidate == null) return 'same';
  const delta = candidate - current;
  if (Math.abs(delta) < 1e-6) return 'same';
  return (delta < 0) === lowerBetter ? 'up' : 'down';
}

export function gunStatRows(gun, versus, guns) {
  const maxima = statMaxima(guns);
  return STAT_DEFS.map(def => {
    const value = def.value(gun), other = versus ? def.value(versus) : null;
    return {
      id: def.id, label: def.label, value, other, max: maxima[def.id],
      fill: Math.min(1, value / maxima[def.id]),
      marker: other == null ? null : Math.min(1, other / maxima[def.id]),
      verdict: versus && versus !== gun ? compareStat(other, value, def.lowerBetter) : 'same',
    };
  });
}

const fmtStat = (id, v) => (id === 'weight' ? v.toFixed(1) : String(v));

export function statBarsHtml(gun, versus, guns, { compact = false } = {}) {
  return `<div class="stat-bars${compact ? ' compact' : ''}">${gunStatRows(gun, versus, guns).map(row => {
    const delta = row.other != null && row.verdict !== 'same'
      ? `<em class="delta ${row.verdict}">${row.verdict === 'up' ? '▲' : '▼'}</em>` : '';
    const marker = row.marker != null && row.verdict !== 'same' ? `<u style="left:${(row.marker * 100).toFixed(1)}%"></u>` : '';
    return `<div class="stat-row ${row.verdict}"><span>${row.label}</span><div class="stat-track"><i style="width:${(row.fill * 100).toFixed(1)}%"></i>${marker}</div><b>${fmtStat(row.id, row.value)}${delta}</b></div>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------- tempo
export function tempoView({ moving = false, firing = false, sprinting = false, scale = 0.18 } = {}) {
  const state = moving ? (sprinting ? 'sprint' : 'move') : 'still';
  const label = { still: 'STILL', move: 'MOVE', sprint: 'SPRINT' }[state];
  const hint = firing ? 'FIRING · TIME HOLDS ITS SPEED'
    : state === 'still' ? 'MOVE TO RUN TIME · WORLD CRAWLS'
    : state === 'move' ? 'STOP TO SLOW THE WORLD · SHIFT TO SPRINT'
    : 'SPRINTING · TIME AT 1×';
  const clamped = Math.max(0, Math.min(1, scale));
  return { state, label, hint, firing, speed: `${scale.toFixed(2)}×`, fraction: clamped, percent: Math.round(clamped * 100) };
}

// ---------------------------------------------------------------- feed tone
export function feedTone(text) {
  const t = String(text).toUpperCase();
  if (/OUT OF|FIRST|NEED|COULD NOT|NO AMMO|TOO HEAVY|CAN'T|VAULT LOCK/.test(t)) return 'warn';
  if (/HIT|TAGGED|BRUTAL|BROKEN|-1 HEALTH|RUN OVER|DEAD/.test(t)) return 'bad';
  if (/HEALTH|PATCHED|VITALS|MEDKIT/.test(t)) return 'good';
  if (/SCRAP|COIN|CACHE|FOUND|EQUIPPED|RESTOCK|ATTACHMENT/.test(t)) return 'loot';
  if (/DOWNED|KILL/.test(t)) return 'kill';
  return 'info';
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- DOM helpers
const $ = id => (typeof document === 'undefined' ? null : document.getElementById(id));
const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const keycap = label => `<kbd>${esc(label)}</kbd>`;

const FEED_MAX = 5, FEED_LIFE_MS = 3600;

/** Push a line into the corner feed. tone: info | good | bad | warn | loot | kill (inferred when omitted). */
export function pushFeed(text, tone) {
  const host = $('feed');
  if (!host) return;
  tone = tone || feedTone(text);
  const first = host.firstElementChild;
  if (first && first.dataset.text === text && performance.now() - Number(first.dataset.t) < 1200) {
    const n = Number(first.dataset.n || 1) + 1;
    first.dataset.n = String(n); first.dataset.t = String(performance.now());
    first.querySelector('b').textContent = `×${n}`;
    clearTimeout(first._timer); first._timer = setTimeout(() => first.remove(), FEED_LIFE_MS);
    first.classList.remove('bump'); void first.offsetWidth; first.classList.add('bump');
    return;
  }
  const item = document.createElement('div');
  item.className = `feed-item ${tone}`;
  item.dataset.text = text; item.dataset.t = String(performance.now());
  item.innerHTML = `<i></i><span>${esc(text)}</span><b></b>`;
  host.prepend(item);
  while (host.children.length > FEED_MAX) host.lastElementChild.remove();
  item._timer = setTimeout(() => { item.classList.add('out'); setTimeout(() => item.remove(), 260); }, FEED_LIFE_MS);
}

let bannerTimer = 0;
/** Big animated centre-top banner. kind: room | clear | secret */
export function showBanner(title, sub = '', kind = 'room') {
  const el = $('room-banner');
  if (!el) return;
  el.className = '';
  el.innerHTML = `<small>${esc(kind === 'clear' ? 'ZONE SECURED' : kind === 'secret' ? 'DISCOVERY' : 'ENTERING')}</small><strong>${esc(title)}</strong><span>${esc(sub)}</span>`;
  void el.offsetWidth;
  el.className = `show ${kind}`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.className = ''; }, kind === 'clear' ? 2300 : 2000);
}
export function roomBanner(name, hostiles, secret = false) {
  if (secret) return showBanner(name, 'SECRET ROOM FOUND', 'secret');
  showBanner(name, hostiles > 0 ? `${hostiles} HOSTILE${hostiles === 1 ? '' : 'S'}` : 'QUIET', 'room');
}
export function roomClearBanner(reward = 0) {
  showBanner('ROOM CLEAR', reward ? `+${reward} SCRAP` : 'NO HOSTILES LEFT', 'clear');
  pushFeed(reward ? `ROOM CLEAR · +${reward} SCRAP` : 'ROOM CLEAR', 'good');
}

export function updateLowHealth(health, maxHealth) {
  const edge = $('hurt-edge');
  if (!edge) return;
  const low = maxHealth > 0 && health > 0 && (health <= 1 || health / maxHealth <= 0.34);
  edge.classList.toggle('low', low);
  edge.classList.toggle('critical', low && health <= 1);
}
export function pulseHurt() {
  const edge = $('hurt-edge');
  if (!edge) return;
  edge.classList.remove('hit'); void edge.offsetWidth; edge.classList.add('hit');
}

export function setPauseScreen(visible, info = {}) {
  const el = $('pause-screen');
  if (!el) return;
  if (el.hidden === !visible && !visible) return;
  if (visible) {
    for (const [id, value] of Object.entries(info)) { const n = $(id); if (n) n.textContent = value; }
  }
  el.hidden = !visible;
}

export function runEndHtml({ won, rooms, totalRooms, kills, seconds, payout, seed, scrap, balance }) {
  const cell = (label, value, cls = '') => `<div class="end-stat ${cls}"><small>${label}</small><b>${esc(value)}</b></div>`;
  return `<div class="end-banner ${won ? 'won' : 'dead'}"><small>${won ? 'SECTOR EXTRACTED' : 'SIGNAL LOST'}</small><strong>${won ? 'EXTRACTION COMPLETE' : 'RUN OVER'}</strong></div>
<div class="end-grid">${cell('ROOMS CLEARED', `${rooms}${totalRooms ? ` / ${totalRooms}` : ''}`)}${cell('KILLS', kills)}${cell('TIME', formatClock(seconds))}${cell('SCRAP', scrap)}${cell('COINS EARNED', `+${payout}`, 'coins')}${cell('SEED', seed)}</div>
<div class="end-foot">SAFEHOUSE BALANCE · ${balance} COINS</div>`;
}

// Settings / controls toggles on the title screen.
function wireTitleUi() {
  const settings = $('settings-panel'), toggle = $('settings-button');
  if (!settings || !toggle) return;
  const set = open => {
    settings.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    $('overlay')?.classList.toggle('settings-open', open);
  };
  toggle.addEventListener('click', () => set(settings.hidden));
  $('close-settings')?.addEventListener('click', () => set(false));
  $('meta-button')?.addEventListener('click', () => set(false));
  $('resume-button')?.addEventListener('click', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' })));
}
if (typeof document !== 'undefined') wireTitleUi();
