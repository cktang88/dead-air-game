import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COLORS, RADII, TYPE, contrast, withAlpha} from './theme.js';

const css = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('font-family: var(--font-body)'));
const cssVar = name => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(rootBlock);
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
};

test('every theme.js colour token equals its style.css custom property', () => {
  for (const [name, value] of Object.entries(COLORS)) {
    assert.equal(cssVar(name)?.replace(/\s/g, ''), value.replace(/\s/g, ''), `--${name}`);
  }
});

test('radii and type scale mirror the CSS tokens', () => {
  for (const [k, v] of Object.entries(RADII)) assert.equal(cssVar(`r-${k}`), `${v}px`, `r-${k}`);
  assert.equal(cssVar('fs-micro'), `${TYPE.micro}px`);
  assert.ok(TYPE.micro >= 11, 'no text under 11px');
});

test('body text meets 4.5:1 on the panel and raised surfaces', () => {
  for (const text of ['text-hi', 'text-mid', 'text-low']) {
    for (const bg of ['panel-solid', 'raised']) assert.ok(contrast(COLORS[text], COLORS[bg]) >= 4.5, `${text} on ${bg}`);
  }
  for (const accent of ['health', 'armor', 'scrap', 'coin', 'slow', 'danger']) assert.ok(contrast(COLORS[accent], COLORS['panel-solid']) >= 4.5, accent);
});

test('withAlpha converts hex and passes through other values', () => {
  assert.equal(withAlpha('#ff0000', 0.5), 'rgba(255,0,0,0.5)');
  assert.equal(withAlpha('rgba(1,2,3,1)', 0.5), 'rgba(1,2,3,1)');
});

test('no font-size under 11px in style.css', () => {
  const small = [...css.matchAll(/font(?:-size)?:\s*(?:[\w ]*\s)?(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1])).filter(n => n < 11);
  assert.deepEqual(small, []);
});
