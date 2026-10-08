// Loadout (TAB) as an armory: carried guns hang on a pegboard rack, the mod is a chip slotted into the gun's rail,
// shells and grenades sit in labelled bins, stats are analog meters with a ghost needle for the gun you compare against.
// Pure string builders (unit tested under node); equip-art.js paints the gun canvases and the needle sweep.
import {gaugeRowHtml} from './ui-art.js';
import {strokeIcon} from './hud-ui.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
export const hexColor = n => '#' + (Number(n) & 0xffffff).toString(16).padStart(6, '0');

/** A mod as a physical chip: coloured card, gold contact fingers, the mod's emblem. `empty` is the bare socket. */
export function modChipHtml(mod, {cls = ''} = {}) {
  if (!mod) return `<span class="modchip empty ${cls}" aria-hidden="true"><i></i></span>`;
  return `<span class="modchip ${cls}" style="--c:${hexColor(mod.color)}" aria-hidden="true">${strokeIcon(mod.id, 'ico')}<i></i></span>`;
}

/**
 * One carried gun on a peg. `g` = {index, gun, active, slotLabel, mod, ammo, mag, reserve, swapText, color}.
 * `hand` = the gun in hand (and its mod) for the ghost needles, or null for the active slot itself.
 */
export function rackSlotHtml(g, guns, hand) {
  const {gun, active, mod} = g;
  const gauges = gaugeRowHtml(gun, guns, {mod: g.modDef, versus: !active && hand ? hand.gun : null, versusMod: hand?.modDef});
  return `<button type="button" class="rack-slot ${active ? 'active' : ''}" style="--cat:${g.color}" data-slot="${g.slot}" aria-label="${esc(gun.name)}, ${esc(g.slotLabel)}${active ? ', in hand' : ', draw'}${mod ? `, mod ${esc(mod.name)}` : ', no mod'}">`
    + `<span class="pegs"><canvas class="rack-gun" data-fit="0.97" data-stack="gun" data-gun="${g.index}" aria-hidden="true"></canvas>`
    + `<span class="rail">${modChipHtml(mod)}</span><i class="hook h1"></i><i class="hook h2"></i></span>`
    + `<span class="spec-tag"><i class="tag-eye"></i>`
    + `<span class="tag-head"><strong>${esc(gun.name)}</strong><em class="slot-badge ${active ? 'active' : ''}"><b class="lamp"></b>${active ? 'IN HAND' : esc(g.slotLabel)}</em></span>`
    + `<span class="tag-sub">${esc(gun.short)}</span>`
    + gauges
    + `<span class="tag-foot"><span>${g.ammo} / ${g.mag} · ${g.reserve} RES</span><span class="tag-mod ${mod ? '' : 'none'}">${mod ? esc(mod.name) : 'NO MOD'}</span><span>DRAW ${esc(g.swapText)}</span></span>`
    + `</span></button>`;
}

export const rackHtml = (slots, guns, hand) => `<div class="rack">${slots.map(s => rackSlotHtml(s, guns, slots.length > 1 ? hand : null)).join('')}</div>`
  + (slots.length > 1 ? '<p class="rack-legend"><i class="ghost-key"></i>Ghost needle: the gun in your hand</p>' : '');

/** Labelled bins: shotgun shells (pick one to load) and grenades (counts), one shelf. */
export function binsHtml({shells = [], shellId = null, throwables = []}) {
  const shellBins = shells.map(s => {
    const on = s.id === shellId;
    return `<button type="button" class="bin shell ${on ? 'loaded' : ''}" data-shell="${s.id}" ${on ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'} title="${esc(s.description)}" aria-label="${esc(s.name)}, ${esc(s.description)}, ${on ? 'loaded' : 'load'}">`
      + `<canvas class="bin-art" data-stack="shell" data-id="${s.id}" data-n="2" aria-hidden="true"></canvas><span class="bin-label">${esc(s.name)}</span>`
      + `<span class="bin-state"><b class="lamp"></b>${on ? 'LOADED' : 'LOAD'}</span></button>`;
  }).join('');
  const thrBins = throwables.map(t => `<div class="bin throwable ${t.count ? '' : 'empty'}">`
    + `<canvas class="bin-art" data-stack="throwable" data-id="${t.id}" data-n="${Math.max(1, Math.min(2, t.count))}" data-dim="${t.count ? 0 : 1}" aria-hidden="true"></canvas>`
    + `<span class="bin-label">${esc(t.name.replace(/ grenade$/i, ''))}</span><span class="bin-count" aria-label="${t.count} carried">x${t.count}</span></div>`).join('');
  return `<div class="bin-row">${shellBins}${thrBins}</div>`;
}

/** The mod drawer on the right: every mod as a chip with its text; the fitted one sits in the active gun's rail. */
export function modDrawerHtml(mods, {worn = null, fits = () => true}) {
  return mods.map(mod => {
    const on = worn === mod.id, ok = fits(mod.id);
    return `<div class="mod-row ${on ? 'equipped' : ''} ${ok ? '' : 'off'}">${modChipHtml(mod, {cls: ok ? '' : 'dim'})}<span><span class="nm">${esc(mod.name)}</span>${on ? ' <em class="chip on">FITTED</em>' : ''}<small>${esc(mod.info)}</small>${ok ? '' : '<span class="why">DOES NOT FIT THIS GUN</span>'}</span></div>`;
  }).join('');
}
