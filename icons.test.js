import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ICON_PATHS, ICON_IDS, GUN_CATEGORY_ICON, THROWABLE_ICON, ENEMY_ICON, MOD_ICON, LEGACY_ICON,
  hasIcon, resolveIcon, iconSvg, iconImage, drawIcon,
} from './icons.js';
import { GUNS, MODS, ENEMY_TYPES } from './catalog.js';

const REQUIRED = [
  'gun-pistol', 'gun-smg', 'gun-shotgun', 'gun-rifle', 'gun-sniper', 'gun-antimateriel',
  'throw-smoke', 'throw-flash', 'throw-frag', 'throw-incendiary',
  'pickup-scrap', 'pickup-ammo', 'pickup-heal', 'pickup-mod', 'pickup-armor', 'pickup-crate', 'pickup-coin',
  'station-workbench', 'station-loadout', 'station-merchant', 'station-cache', 'lock-locked', 'lock-unlocked',
  'item-key', 'exit-extraction', 'door',
  'enemy-rusher', 'enemy-gunner', 'enemy-brute', 'enemy-warden',
  'status-heart', 'status-shield', 'status-reload', 'status-slowmo', 'status-sprint', 'status-warning', 'status-search',
  'mod-extended', 'mod-suppressor', 'mod-hollow', 'mod-stabilizer', 'mod-longbarrel',
];

test('every required icon id exists with a viewBox and path data', () => {
  for (const id of REQUIRED) {
    assert.ok(hasIcon(id), id);
    assert.match(ICON_PATHS[id].vb, /^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/, id);
    assert.ok(ICON_PATHS[id].d.length > 20, id);
  }
});

test('every game id maps to an existing icon', () => {
  for (const gun of GUNS) assert.ok(hasIcon(GUN_CATEGORY_ICON[gun.category]), gun.category);
  for (const mod of MODS) assert.ok(hasIcon(MOD_ICON[mod.id]), mod.id);
  for (const id of Object.keys(ENEMY_TYPES)) assert.ok(hasIcon(ENEMY_ICON[id]), id);
  for (const id of ['smoke', 'flash', 'frag', 'incendiary']) assert.ok(hasIcon(THROWABLE_ICON[id]), id);
  for (const [name, id] of Object.entries(LEGACY_ICON)) assert.ok(hasIcon(id), name);
  assert.equal(resolveIcon('nope'), 'status-warning');
  assert.equal(resolveIcon('SNIPER'), 'gun-sniper');
  assert.equal(resolveIcon('ANTI-MATERIEL'), 'gun-antimateriel');
  assert.equal(resolveIcon('extended'), 'mod-extended');
});

test('iconSvg produces valid, self-contained, tintable markup', () => {
  for (const id of ICON_IDS) {
    const svg = iconSvg(id, { size: 32, color: '#f00', title: 'A "<b>" label' });
    assert.match(svg, /^<svg [^>]*viewBox="[^"]+"/, id);
    assert.match(svg, /<\/svg>$/, id);
    assert.match(svg, /fill="#f00"/);
    assert.match(svg, /width="32" height="32"/);
    assert.match(svg, /<title>A &quot;&lt;b&gt;&quot; label<\/title>/);
    assert.equal((svg.match(/<svg/g) || []).length, 1);
    assert.equal((svg.match(/<path /g) || []).length, 1);
    assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, id);
    assert.doesNotMatch(svg, /<script|<image|<use|xlink:href|href=/i, id);
  }
  assert.match(iconSvg('door'), /fill="currentColor" aria-hidden="true"/);
  assert.doesNotMatch(iconSvg('door', { size: 0 }), /width=/);
  assert.match(iconSvg('gun-rifle'), /<g transform="rotate\(/);
});

test('shipped svg files match the inlined data and carry no external urls', () => {
  const files = fs.readdirSync(new URL('./assets/icons/', import.meta.url)).filter(f => f.endsWith('.svg'));
  assert.deepEqual(files.map(f => f.replace('.svg', '')).sort(), [...ICON_IDS].sort());
  for (const f of files) {
    const text = fs.readFileSync(new URL(`./assets/icons/${f}`, import.meta.url), 'utf8');
    const id = f.replace('.svg', '');
    assert.ok(text.includes(`d="${ICON_PATHS[id].d}"`), id);
    assert.ok(text.includes('fill="currentColor"'), id);
    assert.doesNotMatch(text.replace('http://www.w3.org/2000/svg', ''), /https?:\/\//, id);
  }
});

test('icons.js and icons-data.js hold no external urls or fetches', () => {
  for (const f of ['icons.js', 'icons-data.js']) {
    const text = fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text.replace('http://www.w3.org/2000/svg', ''), /https?:\/\/|fetch\(/, f);
  }
});

test('browser-only helpers degrade safely under node', () => {
  assert.equal(iconImage('door'), null);
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (...a) => calls.push(k) });
  assert.equal(drawIcon(ctx, 'door', 0, 0, 16, '#fff'), false);
});

test('drawIcon centres and fits the glyph using Path2D when available', () => {
  const log = [];
  globalThis.Path2D = class { constructor(d) { this.d = d; } };
  try {
    const ctx = {
      save: () => log.push(['save']), restore: () => log.push(['restore']),
      translate: (x, y) => log.push(['translate', x, y]), scale: (x, y) => log.push(['scale', x, y]),
      rotate: a => log.push(['rotate', a]), fill: p => log.push(['fill', p.d]),
      set fillStyle(v) { log.push(['fillStyle', v]); },
    };
    assert.equal(drawIcon(ctx, 'status-heart', 100, 50, 20, '#f00'), true);
    assert.deepEqual(log.at(-2), ['fill', ICON_PATHS['status-heart'].d]);
    assert.equal(log.at(-1)[0], 'restore');
    const [, , w, h] = ICON_PATHS['status-heart'].vb.split(' ').map(Number), s = 20 / Math.max(w, h);
    assert.deepEqual(log[1], ['translate', 100 - (w * s) / 2, 50 - (h * s) / 2]);
    assert.ok(log.some(e => e[0] === 'scale' && Math.abs(e[1] - s) < 1e-9));
    log.length = 0;
    drawIcon(ctx, 'gun-rifle', 0, 0, 30, '#fff');
    assert.ok(log.some(e => e[0] === 'rotate'));
  } finally { delete globalThis.Path2D; }
});
