// HTML builders for the macro-loop / meta UI: descend-or-extract decision, frequency pick-1-of-3, the safehouse
// panel (tabbed), run-end story block and the boss banner. Pure string functions so they can be unit tested; game.js
// owns the DOM and event wiring (delegated on data-act / data-freq / data-buy attributes).
import {META_UPGRADES} from './progression.js';
import {GUNS} from './catalog.js';
import {KITS, UNLOCKS, isUnlocked, kitUnlocked} from './unlocks.js';
import {GOALS, goalProgress} from './goals.js';
import {CROSSFADES, MAX_RANK, STATION_BY_ID, STATIONS, UPGRADES, UPGRADE_BY_ID, activeCrossfades, buildSummary, rankOf, stationLevel} from './frequencies.js';
import {INTERFERENCE, interferenceStats, interferenceUnlocked} from './interference.js';
import {TAPES} from './story.js';
import {FINAL_FLOOR, floorConfig} from './run-loop.js';
import {formatClock} from './hud-ui.js';
import {emblemFor, flapHtml, gaugeHtml, vuHtml} from './ui-art.js';

export const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
const roman = n => ['', 'I', 'II', 'III'][n] || String(n);

/* ------------------------------------------------------------------ descend / extract: a two-lever control panel */
const SVG = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
/** One small glyph per upgrade family (tape labels and the manual). The big per-upgrade emblems live in ui-art.js. */
export const STATION_GLYPH = {
  static: SVG('<path d="M13 2 5 13h6l-1 9 8-12h-6z"/>'),
  deadline: SVG('<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 2h6"/>'),
  carrier: SVG('<path d="M3 12h13M12 7l5 5-5 5M20 5v14"/>'),
  nightshift: SVG('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
  feedback: SVG('<path d="M3 12h4l2-6 4 12 2-6h6"/>'),
};
const PORTAL_CLASSES = 'dlg-card deck screwed';

export function decisionHtml({floor, gross, kept, scrap = 0, scrapCoins = 0, cashRate = 5, deathKeep, nextClear, hp, maxHp, build = [], interference = 0}) {
  const next = floorConfig(floor + 1), here = floorConfig(floor);
  const lossPct = Math.round((1 - deathKeep) * 100), atRisk = gross - Math.floor(gross * deathKeep);
  const boss = next.boss;
  const threats = floor + 1 === 2 ? 'Marksmen and riot squads arrive.' : floor + 1 === 3 ? 'Bigger squads, two warden rooms.' : 'THE CONDUCTOR waits at the end of the hall.';
  const lever = (act, name, key, label) => `<button class="lever-btn" data-act="${act}" type="button" aria-label="${esc(label)}"><span class="cover" aria-hidden="true"></span><span class="slot" aria-hidden="true"><span class="handle"><i></i></span></span><strong class="lever-name">${name}</strong><kbd class="pushkey">${key}</kbd></button>`;
  return `<div class="${PORTAL_CLASSES} decision-deck" style="--acc:var(--slow)">
  <header class="deck-head">
    <span class="tapelabel">FLOOR ${String(floor).padStart(2, '0')} CLEARED · ${esc(here.name)}</span>
    <h2>BANK IT, OR <em>GO DEEPER?</em></h2>
    <p class="deck-sub">Coins are only safe once you extract.</p>
  </header>
  <div class="bays">
    <section class="bay extract" aria-label="Extract">
      <div class="bay-face">
        <span class="bay-tag"><i class="lamp on" aria-hidden="true"></i>SAFE · END THE RUN</span>
        <div class="readout"><small>BANK</small>${flapHtml(kept, {pad: 3})}<small>COINS</small></div>
        <p class="bay-line">${scrap > 0 ? `Includes ${scrapCoins} coins for ${scrap} leftover scrap (${cashRate} scrap = 1 coin).` : 'Everything you carry is yours. Goals and unlocks still count.'}</p>
        <div class="risk">${gaugeHtml(0, {redFrom: 0.5, label: 'No risk when extracting'})}<p class="risk-text">NO RISK<br><b>KEEP 100%</b> OF EVERYTHING</p></div>
      </div>
      ${lever('extract', 'EXTRACT', '1', `Extract and bank ${kept} coins`)}
      <i class="lamp off bay-lamp" aria-hidden="true"></i>
    </section>
    <section class="bay descend ${boss ? 'boss' : ''}" aria-label="Descend">
      <div class="bay-face">
        <span class="bay-tag"><i class="lamp warn" aria-hidden="true"></i>${boss ? 'FINAL FLOOR' : 'GREED'} · FLOOR ${floor + 1}</span>
        <div class="readout gold"><small>BONUS</small><span class="plus">+</span>${flapHtml(nextClear || 0, {pad: 3})}<small>COINS${boss ? ' · +250 BOSS' : ''}</small></div>
        <p class="bay-line">${threats}</p>
        <div class="risk">
          ${gaugeHtml(lossPct / 100, {redFrom: 0.5, label: 'Risk of loss on death'})}
          <p class="risk-text">DIE AND LOSE <b>${lossPct}%</b> OF UNBANKED<br><b>-${atRisk}</b> COINS${scrap > 0 ? ` · AND ALL ${scrap} SCRAP` : ''}</p>
        </div>
      </div>
      ${lever('descend', boss ? 'FACE THE CONDUCTOR' : 'DESCEND', '2', boss ? 'Face the Conductor' : `Descend to floor ${floor + 1}`)}
      <i class="lamp off bay-lamp" aria-hidden="true"></i>
    </section>
  </div>
  <footer class="deck-foot"><span class="keyhints"><span class="keyhint"><kbd>1</kbd>Extract</span><span class="keyhint"><kbd>2</kbd>Descend</span></span><span class="decision-meta">HEALTH ${hp}/${maxHp} · ${build.length ? build.map(b => `${esc(b.name)} ${roman(b.rank)}`).join(' · ') : 'NO UPGRADES YET'}${interference ? ` · <i class="heat">HEAT +${Math.round(interference * 100)}%</i>` : ''}</span></footer>
</div>`;
}

/* ------------------------------------------------------------------ upgrade pick: three plain cards (Hades boon / level-up style) */
export function freqOfferHtml({offers, owned, title = 'CHOOSE AN UPGRADE', eyebrow = 'UPGRADE · PICK ONE', note = ''}) {
  const cards = offers.map((offer, index) => {
    const family = STATION_BY_ID.get(offer.station);
    const up = UPGRADE_BY_ID.get(offer.id);
    const cross = offer.crossfades.map(id => CROSSFADES.find(c => c.id === id)).filter(Boolean);
    const partnerNames = (offer.partners || []).map(id => STATION_BY_ID.get(id)?.name).filter(Boolean);
    const badge = offer.isNew ? 'NEW' : `LEVEL UP ${offer.prevLevel}→${offer.level}`;
    const levelWord = `LEVEL ${offer.level}/${MAX_RANK}`;
    const comboHtml = cross.length
      ? cross.map(c => { const pa = STATION_BY_ID.get(c.stations.find(s => s !== offer.station)); return `<span class="combo ready"><b>COMBO UNLOCKED · ${esc(c.name)}</b><em>${esc(family.name)} + ${esc(pa.name)}: ${esc(c.desc)}</em></span>`; }).join('')
      : `<span class="combo"><em>Combos with ${esc(partnerNames.join(', '))} upgrades</em></span>`;
    return `<button class="plate rarity-${offer.rarity}${cross.length ? ' has-cross' : ''}" style="--st:${family.color}" data-freq="${esc(offer.id)}" data-station="${offer.station}" data-color="${family.color}" data-name="${esc(offer.name)}" type="button" aria-label="${esc(`${offer.name}, ${family.name} upgrade, ${offer.isNew ? 'new' : `level ${offer.level} of ${MAX_RANK}`}. ${offer.desc}`)}">
      <span class="plate-top"><span class="pbadge ${offer.isNew ? 'new' : 'up'}">${badge}</span><kbd class="pushkey">${index + 1}</kbd></span>
      <span class="bezel">${emblemFor(up?.effect, offer.station)}</span>
      <strong class="plate-name">${esc(offer.name)}</strong>
      <span class="plate-effect">${esc(offer.desc)}</span>
      ${offer.isNew ? '' : `<span class="plate-prev">Level ${offer.prevLevel}: ${esc(up.ranks[offer.prevLevel - 1].desc)}</span>`}
      <span class="plate-meta"><span class="tapelabel st">${STATION_GLYPH[offer.station] || ''}${esc(family.name)}</span><span class="plate-level">${vuHtml(offer.level, MAX_RANK, {fresh: true})}<em>${levelWord}</em></span></span>
      ${comboHtml}
      <span class="locked-tag">PICKED</span>
    </button>`;
  }).join('');
  const comboActive = activeCrossfades(owned);
  return `<div class="${PORTAL_CLASSES} pick-deck" style="--acc:var(--coin)">
  <header class="deck-head">
    <span class="tapelabel">${esc(eyebrow)}</span>
    <h2>${esc(title)}</h2>
    <p class="deck-sub">${esc(note || 'Upgrades last until the run ends. Match two families (level 2+ each) to switch on a COMBO.')}</p>
  </header>
  <div class="plates">${cards}</div>
  <footer class="deck-foot"><span class="decision-meta">${comboActive.length ? `<i class="heat">COMBO ACTIVE · ${comboActive.map(c => esc(c.name)).join(' · ')}</i>` : 'COMBO: reach level 2 in two different families'}</span><span class="keyhints"><span class="keyhint"><kbd>←</kbd><kbd>→</kbd>Browse</span><span class="keyhint"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>Pick</span></span></footer>
</div>`;
}

/* ------------------------------------------------------------------ HUD pieces */
export function buildStripHtml(owned) {
  const build = buildSummary(owned);
  if (!build.length) return '';
  return build.map(b => { const up = UPGRADE_BY_ID.get(b.id), fam = STATION_BY_ID.get(b.station); return `<span class="build-chip" style="--st:${fam.color}" title="${esc(`${b.name} · ${fam.name} · Level ${b.rank}/${MAX_RANK}: ${up.ranks[b.rank - 1].desc}`)}">${STATION_GLYPH[b.station] || ''}${esc(b.name)} <b>${roman(b.rank)}</b></span>`; }).join('') +
    activeCrossfades(owned).map(c => `<span class="build-chip cross" title="${esc(`COMBO: ${c.desc}`)}">COMBO · ${esc(c.name)}</span>`).join('');
}

export function bossBarHtml(name, phase) {
  return `<div class="boss-name"><small>FLOOR ${FINAL_FLOOR} · PHASE ${roman(phase)}</small><strong>${esc(name)}</strong></div><div class="boss-track"><i id="boss-fill"></i><i id="boss-ghost"></i><span class="boss-tick t1"></span><span class="boss-tick t2"></span></div>`;
}

/* ------------------------------------------------------------------ safehouse panel */
export const META_TABS = [['unlocks', 'ARMORY'], ['upgrades', 'UPGRADES'], ['goals', 'GOALS'], ['tapes', 'TAPES'], ['heat', 'HEAT'], ['records', 'RECORDS']];

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
    ['RUN UPGRADES · UNLOCK NEW ONES FOR BUILDS', UNLOCKS.filter(u => u.kind === 'freq').map(u => unlockRow(progress, u, STATION_BY_ID.get(UPGRADES.find(x => x.id === u.ref).station).name))],
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

const cassetteHtml = (title, n) => `<span class="cassette" aria-hidden="true"><span class="clabel"><b>${esc(title)}</b><em>TAPE ${String(n).padStart(2, '0')}</em></span><span class="cwin"><i class="reel"></i><i class="reel"></i></span></span>`;
function tapeRows(progress) {
  const have = new Set(progress.tapes || []);
  return `<div class="tape-list">${TAPES.map((tape, i) => have.has(tape.id)
    ? `<div class="tape-row got">${cassetteHtml(tape.title, i + 1)}<div class="tape-body"><strong>TAPE ${String(i + 1).padStart(2, '0')} · ${esc(tape.title)}</strong><q>${esc(tape.text)}</q></div></div>`
    : `<div class="tape-row">${cassetteHtml('? ? ?', i + 1)}<div class="tape-body"><strong>TAPE ${String(i + 1).padStart(2, '0')} · ??????</strong><small>Not recovered yet.</small></div></div>`).join('')}</div>`;
}

function heatRows(progress) {
  if (!interferenceUnlocked(progress)) return '<p class="meta-note">HEAT unlocks after you defeat THE CONDUCTOR once. Turn on harder-enemy modifiers for bigger coin payouts.</p>';
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
