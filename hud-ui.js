// DEAD AIR HUD / menu presentation helpers.
// Pure helpers (stats, tempo, tone inference) are unit tested; DOM helpers are lazy so this
// module can be imported under node.

// ---------------------------------------------------------------- icons
// Gun silhouettes, 64x24 viewBox, muzzle on the right, filled with currentColor.
const GUN_SHAPES = {
  PISTOL: ['M10 5h40v6H10z', 'M12 11h10l-3 11h-8z', 'M50 6h7v3h-7z', 'M23 11h8v3h-8z'],
  SMG: ['M8 7h38v6H8z', 'M2 8h6v4H2z', 'M24 13h5v9h-5z', 'M13 13h6l-2 8h-5z', 'M46 8h13v3H46z', 'M30 4h9v3h-9z'],
  SHOTGUN: ['M2 8l11-1v6L2 15z', 'M13 8h45v4H13z', 'M13 6h48v2H13z', 'M33 12h13v3H33z', 'M17 12h7l-2 7h-5z'],
  'ASSAULT RIFLE': ['M2 8h10v6H2z', 'M12 8h34v5H12z', 'M46 9h12v3H46z', 'M58 9.5h5v2h-5z', 'M26 13h5l2 9h-6z', 'M14 13h5l-2 8h-4z', 'M20 5h20v3H20z'],
  SNIPER: ['M2 7h14v7H2z', 'M16 8h28v4H16z', 'M44 9.5h19v2H44z', 'M22 2h16v4H22z', 'M28 6h4v2h-4z', 'M28 12h5v5h-5z', 'M17 12h6l-2 8h-5z'],
  'ANTI-MATERIEL': ['M1 6h15v9H1z', 'M16 7h30v6H16z', 'M46 8.5h11v3H46z', 'M57 6h6v8h-6z', 'M20 1h20v5H20z', 'M28 13h6v6h-6z', 'M18 13h6l-2 9h-5z'],
};
const FALLBACK_SHAPE = GUN_SHAPES.SMG;

export function gunIcon(gunOrCategory, cls = 'gun-ico') {
  const category = typeof gunOrCategory === 'string' ? gunOrCategory : gunOrCategory?.category;
  const shapes = GUN_SHAPES[category] || FALLBACK_SHAPE;
  return `<svg class="${cls}" viewBox="0 0 64 24" aria-hidden="true" fill="currentColor">${shapes.map(d => `<path d="${d}"/>`).join('')}</svg>`;
}

// 24x24 stroked line icons.
export const ICON_PATHS = {
  smoke: 'M7 19h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5-1.5A4.5 4.5 0 0 0 7 19z',
  flash: 'M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19',
  frag: 'M6 15a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M10 9V6h4v3M14 6l5-3',
  incendiary: 'M12 22c-4 0-7-3-7-7 0-4 4-6 4-11 3 2 5 5 5 8 1-1 2-2 2-4 2 2 3 4 3 7 0 4-3 7-7 7z',
  ammo: 'M8 2h8v6l2 14h-8L8 8zM9.5 7h5M10 11.5h6M10.5 16h6',
  health: 'M4 4h16v16H4zM12 8v8M8 12h8',
  upgrade: 'M3 6h18v5H3zM9 11l-1.5 10h4.5l1-10',
  prototype: 'M12 2l7 10-7 10-5-10zM7 12h10',
  scrap: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
  armor: 'M12 2l8 3v7c0 5-4 9-8 10-4-1-8-5-8-10V5z',
  harness: 'M6 3v18M18 3v18M6 8h12M6 15h12',
  scanner: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M12 2v7M12 15v7M2 12h7M15 12h7',
  mod: 'M3 6h18v5H3zM9 11l-1.5 10h4.5l1-10',
  coin: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L5 8.5 3 8l-1 3 2 1v2l-2 1 1 3 2-.5 1.5 1.5-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
};
export function strokeIcon(name, cls = 'ico') {
  const d = ICON_PATHS[name] || ICON_PATHS.mod;
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
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
