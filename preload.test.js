import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {currentBlock, importGraph, preloadBlock} from './scripts/gen-preload.mjs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('index.html modulepreload block matches the real import graph (run node scripts/gen-preload.mjs)', () => {
  assert.equal(currentBlock(html), preloadBlock());
});

test('graph covers the entry points, the CDN modules and the files game.js imports', () => {
  const {local, cdn} = importGraph();
  for (const f of ['game.js', 'physics-init.js', 'boot-progress.js', 'render2d.js', 'stack-warm.js', 'world2d.js', 'music.js', 'title-scene.js']) assert.ok(local.includes(f), f);
  assert.ok(cdn.some((u) => u.includes('rapier2d-compat')) && cdn.some((u) => u.includes('rot-js')));
  assert.ok(!local.some((f) => f.endsWith('.test.js')));
});

test('no ?v= cache busters on internal imports', () => {
  for (const f of importGraph().local) assert.ok(!/from\s*['"]\.\/[^'"]*\?v=/.test(fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8')), f);
  assert.ok(!/import\('\.\/[^']*\?v=/.test(html));
});

test('build-site copies every preloaded file (plain *.js at the root)', () => {
  const sh = fs.readFileSync(new URL('./scripts/build-site.sh', import.meta.url), 'utf8');
  assert.ok(sh.includes('for f in *.js'));
  for (const f of importGraph().local) assert.ok(!f.includes('/'), f);
});

test('build-site ships every stylesheet index.html links', async () => {
  const {execFileSync} = await import('node:child_process');
  const os = await import('node:os');
  const path = await import('node:path');
  const sheets = [...html.matchAll(/href="\.\/([^"?]+\.css)/g)].map((m) => m[1]);
  assert.ok(sheets.length > 0);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-root-'));
  for (const s of sheets) fs.copyFileSync(new URL('./' + s, import.meta.url), path.join(root, s));
  for (const f of ['index.html', 'CREDITS.md']) fs.copyFileSync(new URL('./' + f, import.meta.url), path.join(root, f));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'game.js'), '');
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(new URL('./scripts/build-site.sh', import.meta.url), path.join(root, 'scripts/build-site.sh'));
  execFileSync('sh', ['scripts/build-site.sh'], {cwd: root});
  for (const s of sheets) assert.ok(fs.existsSync(path.join(root, 'dist', s)), s);
  fs.rmSync(root, {recursive: true, force: true});
});
