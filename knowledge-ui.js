// DOM presentation for the knowledge layer: name cards, the MANUAL UPDATED chip, the pause-menu FIELD MANUAL tab,
// the Signal Check hint / cause / completion cards and the peek frame. All state lives in game.js / onboarding.js;
// these helpers only paint. Safe to import under node (every DOM access is guarded).
import {iconSvg} from './icons.js';
import {keycap} from './hud-ui.js';
import {manualView} from './onboarding.js';

const $ = id => (typeof document === 'undefined' ? null : document.getElementById(id));
const esc = text => String(text).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

// ------------------------------------------------------------------------------------------------ name cards
const cardQueue = [];
let cardBusy = false;
export const CARD_MS = 2000;
const STALE_MS = 3200;
/** Drop every waiting card (the one on screen finishes). Used when a new room's card should show right away. */
export function flushNameCards() { cardQueue.length = 0; }

/** Queue a name card ({title, line}); cards play one after another, never blocking input. */
export function showNameCard(card) {
  const el = $('name-card');
  if (!el || !card) return;
  cardQueue.push({card, at: performance.now()});
  if (!cardBusy) playNextCard();
}
function playNextCard() {
  const el = $('name-card');
  // A card that waited behind others for more than STALE_MS describes something the player has long since left behind
  // (fast teleports, sprints through rooms): drop it instead of showing a stale enemy name.
  let entry = cardQueue.shift();
  while (entry && performance.now() - entry.at > STALE_MS) entry = cardQueue.shift();
  const card = entry?.card;
  if (!el || !card) { cardBusy = false; return; }
  cardBusy = true;
  el.innerHTML = `<small>NEW</small><strong>${esc(card.title)}</strong><span>${esc(card.line)}</span>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); setTimeout(playNextCard, 220); }, CARD_MS);
}
export const nameCardBusy = () => cardBusy;

// ------------------------------------------------------------------------------------------------ chips + cards
let chipTimer = 0;
export function showManualChip() {
  const el = $('manual-chip');
  if (!el) return;
  el.innerHTML = `${iconSvg('status-info', {size: 0})}<span>MANUAL UPDATED</span>${keycap('ESC')}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(chipTimer); chipTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/** One word + keycaps for a stuck player. hint = {keys:'move'|'fire', word}. null hides it. */
export function showSigHint(hint, keyLabels = {}) {
  const el = $('sig-hint');
  if (!el) return;
  if (!hint) { el.classList.remove('show'); el.dataset.k = ''; return; }
  if (el.dataset.k === hint.keys) { el.classList.add('show'); return; }
  el.dataset.k = hint.keys;
  const caps = hint.keys === 'move' ? (keyLabels.move || ['W', 'A', 'S', 'D']).map(keycap).join('') : keycap(keyLabels.fire || 'CLICK');
  el.innerHTML = `${caps}<b>${esc(hint.word)}</b>`;
  el.classList.add('show');
}
let causeTimer = 0;
export function showSigCause(text) {
  const el = $('sig-cause');
  if (!el) return;
  el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(causeTimer); causeTimer = setTimeout(() => el.classList.remove('show'), 1900);
}
export function showSigComplete(on = true) {
  const el = $('sig-complete');
  if (!el) return;
  if (!on) { el.classList.remove('show'); return; }
  el.innerHTML = '<small>5 / 5</small><strong>TUTORIAL COMPLETE</strong><span>FLOOR 1 NEXT</span>';
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
export function setPeekChrome(on) {
  const el = $('peek-frame');
  if (!el) return;
  el.classList.toggle('on', !!on);
  el.setAttribute('aria-hidden', on ? 'false' : 'true');
}

// ------------------------------------------------------------------------------------------------ field manual
/** Paint the manual into #manual-panel. `fresh` = ids to highlight as new. */
export function renderManual(unlocked, fresh = new Set()) {
  const host = $('manual-list');
  if (!host) return;
  const view = manualView(unlocked);
  const total = view.reduce((n, s) => n + s.total, 0), known = view.reduce((n, s) => n + s.known.length, 0);
  const count = $('manual-count');
  if (count) count.textContent = `${known}/${total}`;
  host.innerHTML = view.map(s => `<section class="man-sec"><h3>${esc(s.section)}<small>${s.known.length}/${s.total}</small></h3>${
    s.known.length ? `<ul>${s.known.map(e => `<li${fresh.has(e.id) ? ' class="new"' : ''}><b>${esc(e.title)}</b><span>${esc(e.line)}</span></li>`).join('')}</ul>` : '<p class="man-empty">nothing met yet</p>'
  }${s.locked && s.known.length ? `<p class="man-locked">${'<i></i>'.repeat(Math.min(s.locked, 12))}<em>${s.locked} to find</em></p>` : ''}</section>`).join('');
}
export function setPauseTab(tab) {
  const card = document.querySelector('.pause-card');
  if (!card) return;
  card.dataset.tab = tab;
  for (const b of card.querySelectorAll('[data-pause-tab]')) { const on = b.dataset.pauseTab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
  const pane = $('manual-panel'), main = $('pause-main');
  if (pane) pane.hidden = tab !== 'manual';
  if (main) main.hidden = tab === 'manual';
}
export function wirePauseTabs(onManual) {
  const card = typeof document === 'undefined' ? null : document.querySelector('.pause-card');
  if (!card) return;
  card.addEventListener('click', e => {
    const b = e.target.closest('[data-pause-tab]');
    if (!b) return;
    setPauseTab(b.dataset.pauseTab);
    if (b.dataset.pauseTab === 'manual') onManual?.();
  });
}
