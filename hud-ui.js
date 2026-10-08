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

import { COLORS } from './theme.js';

const CATEGORY_COLORS = {
  PISTOL: COLORS.scrap, SMG: '#ffc66d', SHOTGUN: '#ff9a72', 'ASSAULT RIFLE': '#7ee0b8', SNIPER: '#8bc8ff', 'ANTI-MATERIEL': '#b0a2ff', LAUNCHER: '#ff9a50',
};
export const categoryColor = category => CATEGORY_COLORS[category] || COLORS.scrap;

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

const fmtStat = (id, v) => String(v);

export function statBarsHtml(gun, versus, guns, { compact = false } = {}) {
  return `<div class="stat-bars${compact ? ' compact' : ''}">${gunStatRows(gun, versus, guns).map(row => {
    const diff = row.other != null ? row.value - row.other : 0;
    const delta = row.other != null && row.verdict !== 'same'
      ? `<em class="delta ${row.verdict}" title="${row.verdict === 'up' ? 'Better' : 'Worse'} than the compared gun">${row.verdict === 'up' ? '▲' : '▼'} ${diff > 0 ? '+' : '−'}${fmtStat(row.id, Math.abs(diff))}</em>` : '';
    const marker = row.marker != null && row.verdict !== 'same' ? `<u style="left:${(row.marker * 100).toFixed(1)}%"></u>` : '';
    return `<div class="stat-row ${row.verdict}"><span>${row.label}</span><div class="stat-track"><i style="width:${(row.fill * 100).toFixed(1)}%"></i>${marker}</div><b>${fmtStat(row.id, row.value)}${delta}</b></div>`;
  }).join('')}</div>`;
}

import { timeBand, rateLabel } from './time-rule.js';

// ---------------------------------------------------------------- tempo
export function tempoView({ speedRatio = 0, scale = 0.08 } = {}) {
  const state = timeBand(speedRatio);
  const label = { still: 'STILL', walk: 'WALK', sprint: 'SPRINT' }[state];
  const clamped = Math.max(0, Math.min(1, scale));
  return { state, label, speed: rateLabel(scale), fraction: clamped, percent: Math.round(clamped * 100) };
}

// ---------------------------------------------------------------- feed tone
export function feedTone(text) {
  const t = String(text).toUpperCase();
  if (/OUT OF|FIRST|NEED|COULD NOT|NO AMMO|CAN'T|VAULT LOCK/.test(t)) return 'warn';
  if (/HIT|TAGGED|BRUTAL|BROKEN|-1 HEALTH|RUN OVER|DEAD/.test(t)) return 'bad';
  if (/HEALTH|HEALED|PATCHED|MEDKIT/.test(t)) return 'good';
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
const FEED_ICON = { good: 'pickup-heal', bad: 'status-warning', warn: 'status-warning', loot: 'pickup-scrap', kill: 'status-kills', info: 'status-info' };

/** Push a line into the corner feed. tone: info | good | bad | warn | loot | kill (inferred when omitted). */
export function pushFeed(text, tone) {
  const host = $('feed');
  if (!host) return;
  tone = tone || feedTone(text);
  // coalesce: the same line already on screen (anywhere in the feed, recent) becomes "x2", moves to the top and restarts its life
  const now = performance.now();
  const dup = [...host.children].find(el => el.dataset.text === text && now - Number(el.dataset.t) < 6000);
  if (dup) {
    const n = Number(dup.dataset.n || 1) + 1;
    dup.dataset.n = String(n); dup.dataset.t = String(now);
    dup.querySelector('b').textContent = `×${n}`;
    clearTimeout(dup._timer); dup.classList.remove('out'); dup._timer = setTimeout(() => { dup.classList.add('out'); setTimeout(() => dup.remove(), 260); }, FEED_LIFE_MS);
    if (dup !== host.firstElementChild) host.prepend(dup);
    dup.classList.remove('bump'); void dup.offsetWidth; dup.classList.add('bump');
    return;
  }
  const item = document.createElement('div');
  item.className = `feed-item ${tone}`;
  item.dataset.text = text; item.dataset.t = String(performance.now());
  item.innerHTML = `${iconSvg(FEED_ICON[tone] || FEED_ICON.info, { size: 0 })}<span>${esc(text)}</span><b></b>`;
  host.prepend(item);
  while (host.children.length > FEED_MAX) host.lastElementChild.remove();
  item._timer = setTimeout(() => { item.classList.add('out'); setTimeout(() => item.remove(), 260); }, FEED_LIFE_MS);
}

let bannerTimer = 0;
/** Big animated centre-top banner. kind: room | clear | secret */
export function showBanner(title, sub = '', kind = 'room', kicker = '') {
  const el = $('room-banner');
  if (!el) return;
  el.className = '';
  el.innerHTML = `<small>${esc(kicker || (kind === 'clear' ? 'ZONE SECURED' : kind === 'secret' ? 'DISCOVERY' : 'ENTERING'))}</small><strong>${esc(title)}</strong><span>${esc(sub)}</span>`;
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

export function runEndHtml({ won, boss = false, rooms, totalRooms, kills, seconds, payout, seed, scrap, balance, best = null, isNewBest = false, cause = '', floor = 0, finalFloor = 4, build = [] }) {
  const icon = id => iconSvg(id, { size: 0 });
  // The end screen is a printed run summary: thermal paper, leader dots, a rubber stamp for the verdict.
  const line = (label, value, count = null) => `<div class="log-line"><dt>${label}</dt><i class="leader" aria-hidden="true"></i><dd${count != null ? ` data-count="${count}"` : ''}>${esc(value)}</dd></div>`;
  const bestLine = best
    ? `<div class="end-best">${icon('status-trophy')}<span>${isNewBest ? 'NEW BEST RUN' : 'BEST RUN'} · <b>${best.won ? 'EXTRACTED' : `${best.rooms} ROOMS`}</b> · <b>${best.kills} KILLS</b> · <b>${formatClock(best.seconds)}</b></span></div>` : '';
  // three distinct moments: the Conductor falls (boss: ON AIR lamp), a bank-out (extract), a death (test card, SIGNAL LOST)
  const head = boss ? {cls: 'won boss', eyebrow: 'BOSS DEFEATED', title: 'YOU WIN', stamp: 'BOSS DOWN', sub: 'THE CONDUCTOR IS DOWN · THE STATION IS YOURS'}
    : won ? {cls: 'won', eyebrow: 'RUN COMPLETE', title: 'EXTRACTED', stamp: 'CLEARED', sub: `BANKED ${payout} COINS`}
    : {cls: 'dead', eyebrow: 'RUN OVER', title: 'YOU DIED', stamp: 'DEAD AIR', sub: cause || 'RUN OVER'};
  const art = boss ? '<div class="airlamp" aria-hidden="true"><span>ON AIR</span></div>' : won ? '<div class="stamp ok" aria-hidden="true">EXTRACTED</div>' : '<div class="testcard" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>';
  return `<div class="log ${head.cls}">
<div class="log-top"><span>DEAD AIR · RUN SUMMARY</span><span>SEED ${esc(seed ?? '—')}</span></div>
${art}
<div class="log-head"><small>${head.eyebrow}</small><strong>${head.title}</strong><span class="end-cause">${esc(head.sub)}</span>${isNewBest ? '<span class="badge stamp-new">NEW BEST</span>' : ''}</div>
<dl class="log-lines">${line('ROOMS CLEARED', `${rooms}${totalRooms ? ` / ${totalRooms}` : ''}`, rooms)}${line('KILLS', kills, kills)}${line('RUN TIME', formatClock(seconds))}${floor ? line('FLOOR REACHED', `${floor} / ${finalFloor}`) : ''}</dl>
${build.length ? `<div class="log-build"><small>UPGRADES</small><span>${build.map(b => `${esc(b.name)} ${['', 'I', 'II', 'III'][b.rank] || b.rank}`).join(' · ')}</span></div>` : ''}
<div class="log-total"><div><small>COINS EARNED</small><span class="big" data-count="${payout}" data-prefix="+">+${payout}</span></div><div class="bal"><small>SAFEHOUSE BALANCE</small><b data-count="${balance}">${balance}</b></div></div>
<div class="log-note"><span class="term" data-tip="Coins are permanent. Spend them on Safehouse upgrades between runs. Scrap is different: it only lasts for one run.">what are coins?</span></div>
${bestLine}</div>`;
}

/** Count `[data-count]` numbers up from 0 (real time; instant under prefers-reduced-motion). Keeps data-prefix. */
export function animateCounts(root, { duration = 900, delay = 350 } = {}) {
  if (!root || typeof requestAnimationFrame === 'undefined') return;
  for (const el of root.querySelectorAll('[data-count]')) {
    const target = Number(el.dataset.count) || 0, prefix = el.dataset.prefix || '';
    const suffix = el.textContent.includes(' / ') ? el.textContent.slice(el.textContent.indexOf(' / ')) : '';
    if (reducedMotion() || target === 0) { el.textContent = `${prefix}${target}${suffix}`; continue; }
    el.textContent = `${prefix}0${suffix}`;
    const start = performance.now() + delay;
    const step = now => {
      const t = Math.max(0, Math.min(1, (now - start) / duration)), eased = 1 - Math.pow(1 - t, 3);
      el.textContent = `${prefix}${Math.round(target * eased)}${suffix}`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// True when any world point (screen px) lies inside `rect` grown by `pad`. Used to ghost the bottom-left HUD
// when the player, a pickup or a corpse would otherwise be hidden behind it.
export function hudOccludes(rect, points, pad = 18) {
  if (!rect) return false;
  return points.some(p => p.x >= rect.left - pad && p.x <= rect.right + pad && p.y >= rect.top - pad && p.y <= rect.bottom + pad);
}

// ---------------------------------------------------------------- motion + small UI helpers
export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Show `[R]`-style tokens in a hint string as keycaps. */
export function hintHtml(text) {
  return esc(text).replace(/\[([^\]]{1,8})\]/g, (_, key) => keycap(key));
}

/** Cost / balance chip with a currency icon. currency: scrap | coin */
export function costHtml(amount, currency = 'scrap') {
  return `<span class="cost">${iconSvg(currency === 'coin' ? 'pickup-coin' : 'pickup-scrap', { size: 0 })}<b>${amount}</b></span>`;
}

/**
 * Keep a row of pips in sync without rebuilding it, so changes can animate:
 * lit -> empty plays `breakCls` (shards fall away), empty -> lit plays `fillCls` (pop back in).
 */
export function syncPips(host, value, max, { tag = 'span', cls = '', emptyCls = 'empty', breakCls = 'break', fillCls = 'fill' } = {}) {
  if (!host) return;
  if (host._max !== max) {
    host._max = max; host._val = null;
    host.innerHTML = Array.from({ length: max }, () => `<${tag} class="${cls}"></${tag}>`).join('');
  }
  const prev = host._val;
  [...host.children].forEach((pip, i) => {
    const lit = i < value, was = prev == null ? lit : i < prev;
    pip.classList.toggle(emptyCls, !lit);
    pip.classList.remove(breakCls, fillCls);
    if (prev != null && was && !lit) { void pip.offsetWidth; if (!reducedMotion()) pip.classList.add(breakCls); }
    else if (prev != null && !was && lit) { void pip.offsetWidth; if (!reducedMotion()) pip.classList.add(fillCls); }
  });
  host._val = value;
}

/** Write a padded counter and flash it when it changes (scrap / kills tick-up). */
export function tickNumber(el, value, pad = 2) {
  if (!el) return;
  const text = String(value).padStart(pad, '0');
  if (el._t === text) return;
  const first = el._t == null;
  el._t = text; el.textContent = text;
  if (!first && !reducedMotion()) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
}

/** Flash an element (objective line etc.) by retriggering a CSS class. */
export function flashEl(el, cls = 'flash') {
  if (!el || reducedMotion()) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}

/** Replace `<kbd data-action>` labels with the player's real bindings. resolve(action) -> label | undefined. */
export function syncKeycaps(resolve, root = typeof document === 'undefined' ? null : document) {
  if (!root) return;
  for (const el of root.querySelectorAll('kbd[data-action]')) { const label = resolve(el.dataset.action); if (label) el.textContent = label; }
}

/** Fill `[data-icon]` placeholders from icons.js (static markup in index.html). */
export function hydrateIcons(root = typeof document === 'undefined' ? null : document) {
  if (!root) return;
  for (const el of root.querySelectorAll('[data-icon]:not([data-icon-done])')) {
    el.innerHTML = iconSvg(el.dataset.icon, { size: 0 });
    el.dataset.iconDone = '1';
  }
}

/** One shared tooltip for every `[data-tip]` (hover or keyboard focus). */
function wireTooltips() {
  const tip = $('tip');
  if (!tip) return;
  let current = null;
  const show = el => {
    current = el; tip.textContent = el.dataset.tip; tip.hidden = false;
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const y = r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10;
    tip.style.transform = ''; tip.style.left = `${x}px`; tip.style.top = `${y}px`;
    requestAnimationFrame(() => tip.classList.add('show'));
  };
  const hide = () => { current = null; tip.classList.remove('show'); setTimeout(() => { if (!current) tip.hidden = true; }, 140); };
  document.addEventListener('pointerover', e => { const el = e.target.closest?.('[data-tip]'); if (el && el !== current) show(el); else if (!el && current) hide(); });
  document.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); });
  document.addEventListener('focusout', hide);
  for (const el of document.querySelectorAll('.term[data-tip]')) if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
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
  for (const id of ['resume-button', 'resume-button-2']) $(id)?.addEventListener('click', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' })));
}
if (typeof document !== 'undefined') {
  wireTitleUi();
  hydrateIcons();
  wireTooltips();
}
