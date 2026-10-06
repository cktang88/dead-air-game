// HTML builders for the macro-loop / meta UI: descend-or-extract decision, frequency pick-1-of-3, the safehouse
// panel (tabbed), run-end story block and the boss banner. Pure string functions so they can be unit tested; game.js
// owns the DOM and event wiring (delegated on data-act / data-freq / data-buy attributes).
import {META_UPGRADES} from './progression.js';
import {GUNS} from './catalog.js';
import {KITS, UNLOCKS, isUnlocked, kitUnlocked} from './unlocks.js';
import {GOALS, goalProgress} from './goals.js';
import {CROSSFADES, MAX_RANK, STATION_BY_ID, STATIONS, UPGRADES, activeCrossfades, buildSummary, rankOf, stationLevel} from './frequencies.js';
import {INTERFERENCE, interferenceStats, interferenceUnlocked} from './interference.js';
import {TAPES} from './story.js';
import {FINAL_FLOOR, floorConfig} from './run-loop.js';
import {formatClock} from './hud-ui.js';

export const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
const roman = n => ['', 'I', 'II', 'III'][n] || String(n);

/* ------------------------------------------------------------------ descend / extract */
export function decisionHtml({floor, gross, kept, deathKeep, nextClear, hp, maxHp, build = [], interference = 0}) {
  const next = floorConfig(floor + 1), here = floorConfig(floor);
  const atRisk = gross - Math.floor(gross * deathKeep);
  const boss = next.boss;
  const threats = floor + 1 === 2 ? 'Marksmen and riot squads arrive. One more warden room.' : floor + 1 === 3 ? 'Larger squads, two warden rooms, tougher enemies.' : 'THE CONDUCTOR waits at the end of the hall.';
  return `<div class="merchant-card decision-card">
  <div class="eyebrow">FLOOR ${String(floor).padStart(2, '0')} CLEARED · ${esc(here.name)}</div>
  <h2>BANK IT, OR <em>GO DEEPER?</em></h2>
  <p class="merchant-copy">Coins you carry are only safe once you extract. Die on the way down and you keep ${Math.round(deathKeep * 100)}%.</p>
  <div class="decision-grid">
    <button class="decision-opt extract" data-act="extract" type="button">
      <small>SAFE</small><strong>EXTRACT NOW</strong>
      <b class="decision-coins">+${kept} COINS</b>
      <span>Bank the whole haul and end the run. Goals and unlocks still count.</span>
    </button>
    <button class="decision-opt descend ${boss ? 'boss' : ''}" data-act="descend" type="button">
      <small>${boss ? 'FINAL FLOOR' : `FLOOR ${String(floor + 1).padStart(2, '0')}`}</small><strong>${boss ? 'FACE THE CONDUCTOR' : 'DESCEND'}</strong>
      <b class="decision-coins">+${nextClear || 0} COINS CLEAR BONUS${boss ? ' · +250 BOSS' : ''}</b>
      <span>${threats} At risk if you fall: <i>${atRisk} coins</i>.</span>
    </button>
  </div>
  <div class="decision-foot"><span>VITALS ${hp} / ${maxHp}</span><span>${build.length ? build.map(b => `${esc(b.name)} ${roman(b.rank)}`).join(' · ') : 'NO FREQUENCIES YET'}</span>${interference ? `<span class="heat">INTERFERENCE +${Math.round(interference * 100)}%</span>` : ''}</div>
  <div class="merchant-footer"><kbd>1</kbd> EXTRACT &nbsp; <kbd>2</kbd> DESCEND</div>
</div>`;
}

/* ------------------------------------------------------------------ frequency pick-1-of-3 */
export function freqOfferHtml({offers, owned, title = 'TUNE IN.', eyebrow = 'FREQUENCY FOUND · PICK ONE', note = ''}) {
  const cards = offers.map((offer, index) => {
    const station = STATION_BY_ID.get(offer.station);
    const pips = Array.from({length: MAX_RANK}, (_, i) => `<i class="${i < offer.rank ? 'on' : ''}"></i>`).join('');
    const cross = offer.crossfades.map(id => CROSSFADES.find(c => c.id === id)).filter(Boolean);
    return `<button class="freq-card rarity-${offer.rarity}" style="--st:${station.color}" data-freq="${esc(offer.id)}" type="button">
      <span class="freq-station">${esc(station.name)}</span>
      <strong>${esc(offer.name)}</strong>
      <span class="freq-rank">${offer.isNew ? 'NEW' : `RANK ${roman(offer.rank)}`} · ${offer.rarity.toUpperCase()}</span>
      <span class="freq-pips">${pips}</span>
      <span class="freq-desc">${esc(offer.desc)}</span>
      ${cross.map(c => `<span class="freq-cross">CROSSFADE · ${esc(c.name)}<br><em>${esc(c.desc)}</em></span>`).join('')}
      <kbd>${index + 1}</kbd>
    </button>`;
  }).join('');
  const crossActive = activeCrossfades(owned);
  return `<div class="merchant-card freq-modal">
  <div class="eyebrow">${esc(eyebrow)}</div>
  <h2>${esc(title.replace(/\.$/, ''))}<em>.</em></h2>
  <p class="merchant-copy">${esc(note || 'Each station plays differently. Stack one station, or blend two for a crossfade.')}</p>
  <div class="freq-grid">${cards}</div>
  <div class="decision-foot">${crossActive.length ? crossActive.map(c => `<span class="heat">CROSSFADE ON · ${esc(c.name)}</span>`).join('') : '<span>NO CROSSFADE YET · TWO STATIONS AT LEVEL 2 TURN ON A SYNERGY</span>'}</div>
  <div class="merchant-footer">CHOOSE ONE · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></div>
</div>`;
}

/* ------------------------------------------------------------------ HUD pieces */
export function buildStripHtml(owned) {
  const build = buildSummary(owned);
  if (!build.length) return '';
  return build.map(b => `<span class="build-chip" style="--st:${STATION_BY_ID.get(b.station).color}" title="${esc(b.name)} rank ${b.rank}">${esc(b.name)} <b>${roman(b.rank)}</b></span>`).join('') +
    activeCrossfades(owned).map(c => `<span class="build-chip cross" title="${esc(c.desc)}">${esc(c.name)}</span>`).join('');
}

export function bossBarHtml(name, phase) {
  return `<div class="boss-name"><small>FLOOR ${FINAL_FLOOR} · PHASE ${roman(phase)}</small><strong>${esc(name)}</strong></div><div class="boss-track"><i id="boss-fill"></i><i id="boss-ghost"></i><span class="boss-tick t1"></span><span class="boss-tick t2"></span></div>`;
}

/* ------------------------------------------------------------------ safehouse panel */
export const META_TABS = [['unlocks', 'ARMORY'], ['upgrades', 'UPGRADES'], ['goals', 'GOALS'], ['tapes', 'TAPES'], ['heat', 'INTERFERENCE'], ['records', 'RECORDS']];

function row(title, desc, button, extra = '') {
  return `<div class="meta-row ${extra}"><div><strong>${title}</strong><small>${desc}</small></div>${button}</div>`;
}

function unlockRows(progress) {
  const sections = [
    ['STARTING KITS · PICK YOUR LOADOUT', KITS.map(kit => {
      const owned = kitUnlocked(progress, kit.id), active = progress.kit === kit.id;
      const guns = kit.guns.map(id => GUNS.find(g => g.id === id)?.name || id).join(' + ');
      const cost = UNLOCKS.find(u => u.id === `kit:${kit.id}`)?.cost;
      const button = owned ? `<button data-act="kit" data-id="${kit.id}" ${active ? 'disabled' : ''}>${active ? 'EQUIPPED' : 'EQUIP'}</button>` : `<button data-buy="kit:${kit.id}" ${progress.coins < cost ? 'disabled' : ''}>${cost} COINS</button>`;
      return row(`${esc(kit.name)}${active ? ' · ACTIVE' : ''}`, `${esc(guns)} · ${esc(kit.blurb)}`, button, active ? 'active' : '');
    })],
    ['GUNS · JOIN THE LOOT POOL', UNLOCKS.filter(u => u.kind === 'gun').map(u => unlockRow(progress, u))],
    ['THROWABLES', UNLOCKS.filter(u => u.kind === 'throw').map(u => unlockRow(progress, u))],
    ['FREQUENCIES · NEW UPGRADES FOR BUILDS', UNLOCKS.filter(u => u.kind === 'freq').map(u => unlockRow(progress, u, STATION_BY_ID.get(UPGRADES.find(x => x.id === u.ref).station).name))],
  ];
  return sections.map(([title, rows]) => `<div class="meta-section"><div class="eyebrow">${title}</div>${rows.join('')}</div>`).join('');
}
function unlockRow(progress, u, tag = '') {
  const have = isUnlocked(progress, u.id);
  const button = have ? '<button disabled>OWNED</button>' : u.cost === null ? '<button disabled>GOAL</button>' : `<button data-buy="${u.id}" ${progress.coins < u.cost ? 'disabled' : ''}>${u.cost} COINS</button>`;
  return row(`${esc(u.name)}${tag ? ` <em class="tag">${esc(tag)}</em>` : ''}`, have ? 'Unlocked.' : u.cost === null ? 'Earn it from a goal.' : esc(u.desc), button, have ? 'owned' : '');
}

function upgradeRows(progress) {
  return META_UPGRADES.map(item => {
    const level = progress.upgrades[item.id] || 0, cost = item.costs[level], locked = item.requires && !isUnlocked(progress, item.requires);
    const label = locked ? '<button disabled>LOCKED</button>' : `<button data-upgrade="${item.id}" ${cost === undefined || progress.coins < cost ? 'disabled' : ''}>${cost === undefined ? 'MAX' : `${cost} COINS`}</button>`;
    return row(`${esc(item.name)} · ${level}/${item.costs.length}${item.requires ? ' <em class="tag">TRADEOFF</em>' : ''}`, locked ? 'Unlocked by a goal.' : esc(item.description), label);
  }).join('');
}

function goalRows(progress) {
  const sorted = [...GOALS].sort((a, b) => Number(Boolean(progress.goals[a.id])) - Number(Boolean(progress.goals[b.id])));
  return sorted.map(goal => {
    const p = goalProgress(progress, goal), reward = [`${goal.reward.coins} coins`, ...(goal.reward.unlock || []).map(id => UNLOCKS.find(u => u.id === id)?.name).filter(Boolean)].join(' + ');
    return `<div class="goal-row ${p.done ? 'done' : ''}"><div><strong>${p.done ? '✓ ' : ''}${esc(goal.name)}</strong><small>${esc(goal.desc)}</small><div class="goal-bar"><i style="width:${Math.round(p.pct * 100)}%"></i></div></div><span class="goal-reward">${p.done ? 'DONE' : goal.cmp === 'lte' ? `BEST ${p.value ? formatClock(p.value) : '—'}` : `${Math.min(p.value, p.goal)} / ${p.goal}`}<small>${esc(reward)}</small></span></div>`;
  }).join('');
}

function tapeRows(progress) {
  const have = new Set(progress.tapes || []);
  return `<div class="tape-list">${TAPES.map((tape, i) => have.has(tape.id)
    ? `<div class="tape-row got"><strong>TAPE ${String(i + 1).padStart(2, '0')} · ${esc(tape.title)}</strong><q>${esc(tape.text)}</q></div>`
    : `<div class="tape-row"><strong>TAPE ${String(i + 1).padStart(2, '0')} · ??????</strong><small>Not recovered yet.</small></div>`).join('')}</div>`;
}

function heatRows(progress) {
  if (!interferenceUnlocked(progress)) return '<p class="meta-note">INTERFERENCE unlocks after you defeat THE CONDUCTOR once. Stack modifiers for bigger coin payouts.</p>';
  const stats = interferenceStats(progress);
  return `<p class="meta-note">Active modifiers pay <b>+${Math.round(stats.coinBonus * 100)}%</b> coins on every run.</p>` + INTERFERENCE.map(m => {
    const on = progress.interference.includes(m.id);
    return row(`${esc(m.name)} <em class="tag">+${Math.round(m.bonus * 100)}% COINS</em>`, esc(m.desc), `<button data-act="heat" data-id="${m.id}" aria-pressed="${on}">${on ? 'ACTIVE' : 'OFF'}</button>`, on ? 'active' : '');
  }).join('');
}

function recordRows(progress) {
  const s = progress.stats, cell = (label, value) => `<div class="end-stat"><small>${label}</small><b>${esc(value)}</b></div>`;
  return `<div class="end-grid records">${cell('RUNS', s.runs)}${cell('DEEPEST FLOOR', s.deepestFloor || '—')}${cell('MOST KILLS', s.mostKills)}${cell('FASTEST WIN', s.fastestWin ? formatClock(s.fastestWin) : '—')}${cell('BOSS KILLS', s.bossKills)}${cell('TOTAL BANKED', s.totalBanked)}</div>` +
    `<div class="meta-note">DAILY ${esc(progress.daily.date || '—')} · best floor ${progress.daily.bestFloor || '—'} · best kills ${progress.daily.bestKills || '—'}</div>`;
}

export function metaPanelHtml(progress, tab = 'unlocks') {
  const tabs = META_TABS.map(([id, label]) => {
    const badge = id === 'goals' ? GOALS.filter(g => progress.goals[g.id]).length + '/' + GOALS.length : id === 'tapes' ? (progress.tapes || []).length + '/' + TAPES.length : '';
    return `<button class="meta-tab" role="tab" aria-selected="${tab === id}" data-act="tab" data-id="${id}" type="button">${label}${badge ? ` <small>${badge}</small>` : ''}</button>`;
  }).join('');
  const body = {unlocks: unlockRows, upgrades: upgradeRows, goals: goalRows, tapes: tapeRows, heat: heatRows, records: recordRows}[tab](progress);
  return `<div class="meta-tabs" role="tablist">${tabs}</div><div class="meta-body">${body}</div>`;
}

export function kitChipHtml(progress) {
  const kit = KITS.find(k => k.id === progress.kit) || KITS[0];
  const guns = kit.guns.map(id => GUNS.find(g => g.id === id)?.name || id).join(' + ');
  return `<span class="eyebrow">STARTING KIT</span><strong>${esc(kit.name)}</strong><small>${esc(guns)}</small>`;
}

/* ------------------------------------------------------------------ run end */
export function storyHtml({lines = [], goals = [], unlocks = [], tape = null, share = '', payout}) {
  const op = lines.map(l => `<p class="op-line"><b>${esc(l.speaker)}</b> ${esc(l.text)}</p>`).join('');
  const goalHtml = goals.length ? `<div class="end-rewards"><small>GOALS COMPLETE</small>${goals.map(g => `<span>✓ ${esc(g.name)} <b>+${g.reward.coins}</b></span>`).join('')}</div>` : '';
  const unlockHtml = unlocks.length ? `<div class="end-rewards new"><small>NEW IN THE ARMORY</small>${unlocks.map(name => `<span>${esc(name)}</span>`).join('')}</div>` : '';
  const tapeHtml = tape ? `<div class="end-rewards tape"><small>TAPE RECOVERED · ${esc(tape.title)}</small><q>${esc(tape.text)}</q></div>` : '';
  const shareHtml = share ? `<div class="share-line"><code>${esc(share)}</code><button type="button" data-act="share">COPY RESULT</button></div>` : '';
  const pay = payout ? `<div class="end-payout">${payout}</div>` : '';
  return `${pay}<div class="op-box">${op}</div>${goalHtml}${unlockHtml}${tapeHtml}${shareHtml}`;
}
