#!/usr/bin/env node
// DEAD AIR time-to-first-shot harness. One UNAWARE enemy (guard posture, facing the player) at a distance with line of sight;
// the player stands still / walks / sprints. Reports, in REAL milliseconds:
//   detect = start -> the enemy becomes aware (heard or spotted)
//   react  = aware -> the enemy's first shot leaves the gun (telegraph complete)
//   total  = start -> first shot
//   node tools/ttfs.mjs [--trials 6] [--types gunner,guard,chaser] [--dists 200,300] [--modes still,walk,sprint] [--out file.json]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PRE = argv.includes('--preaware');
const TRIALS = +opt('trials', 6), TYPES = opt('types', 'gunner,guard,chaser').split(','), DISTS = opt('dists', '200,300').split(',').map(Number), MODES = opt('modes', 'still,walk,approach,sprint').split(',');
const VENDOR = [process.env.DEADAIR_VENDOR, '/tmp/claude-0/-home-user/75c704e9-7d4c-517c-a9b2-030bae929b2f/scratchpad/vendor/out'].find(c => c && fs.existsSync(path.join(c, 'three.js')));
const VF = {'three': 'three.js', '@dimforge/rapier2d-compat': '_dimforge_rapier2d-compat.js', 'rot-js': 'rot-js.js'};
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store'}); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
let pw; for (const s of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) { if (!s) continue; try { pw = await import(s); break; } catch {} }
const browser = await pw.chromium.launch({});
const page = await (await browser.newContext({viewport: {width: 1280, height: 720}})).newPage();
await page.addInitScript(() => { try { localStorage.setItem('dead-air.onboarding.v1', JSON.stringify({signalDone: true, manual: [], cards: []})); } catch {} });
if (VENDOR) await page.route(/esm\.sh\//, r => { const u = r.request().url(); const k = Object.keys(VF).find(k => u.includes('esm.sh/' + k + '@') || u.includes('esm.sh/' + k + '/')); if (!k) return r.abort(); r.fulfill({contentType: 'application/javascript', headers: {'access-control-allow-origin': '*'}, body: fs.readFileSync(path.join(VENDOR, VF[k]))}); });
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto(`http://127.0.0.1:${port}/?debug`);
await page.waitForFunction(() => !document.getElementById('start-button').disabled, null, {timeout: 60000});
await page.fill('#seed-input', '7001'); await page.click('#start-button');
await page.waitForFunction(() => window.__deadair && window.__deadair.state.mode === 'play' && window.__deadair.state.player && !window.__deadair.state.loading, null, {timeout: 20000});
await page.evaluate(() => { window.requestAnimationFrame = () => 0; window.__realRender = window.__deadair.view.render; });

const setup = ({type, dist, trial}) => page.evaluate(({type, dist, trial, pre}) => {
  const D = window.__deadair, s = D.state;
  for (const e of s.enemies) { e.alive = false; try { e.body.setEnabled(false); } catch {} }
  s.enemies = []; s.bullets = []; s.noises.length = 0;
  s.maxHealth = 100; s.health = 100; s.armor = 0; s.freezeT = 0; s.timeCredit = 0; s.invuln = 0;
  const rooms = s.rooms.map(r => ({r, a: (r.x2 - r.x1) * (r.y2 - r.y1)})).sort((a, b) => b.a - a.a);
  const R = rooms[trial % 3].r; const ok = (x, y) => s.solidMap[Math.floor(y / 32)]?.[Math.floor(x / 32)] === 0;
  const open2 = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (s.solidMap[Math.floor(y / 32) + dy]?.[Math.floor(x / 32) + dx] !== 0) return false; return !s.cover.some(c => Math.hypot(c.x - x, c.y - y) < 50) && !s.crates.some(c => Math.hypot(c.x - x, c.y - y) < 50); };
  // player at P, enemy at E = P + dist along a free direction, LOS clear along the whole line, player walks along the perpendicular
  for (let ty = R.y1 + 1; ty < R.y2; ty++) for (let tx = R.x1 + 1; tx < R.x2; tx++) {
    const px = (tx + .5) * 32, py = (ty + .5) * 32;
    for (let a = 0; a < 16; a++) {
      const ang = a / 16 * 6.283, ex = px + Math.cos(ang) * dist, ey = py + Math.sin(ang) * dist;
      if (!ok(ex, ey) || D.lineBlocked(px, py, ex, ey) || !open2(ex, ey) || !open2(px, py)) continue;
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      if (!ok(px + nx * 70, py + ny * 70) || !ok(px - nx * 70, py - ny * 70)) continue;
      s.player.body.setTranslation({x: px, y: py}, true); s.player.x = px; s.player.y = py;
      const e = D.spawnEnemy(type, ex, ey, R.index);
      const fx = -Math.cos(ang), fy = -Math.sin(ang);
      e.posture = 'guard'; e.post = {home: {x: ex, y: ey}, base: {x: fx, y: fy}, route: null}; e.face = {x: fx, y: fy}; e.aim = {x: fx, y: fy}; e.aware = false;
      const ai = D.brainState(e, Math.random); ai.face = {x: fx, y: fy}; ai.cd = 0; ai.aware = false; ai.suspicion = 0;
      return {ok: true, nx, ny, ang, cx: Math.cos(ang), cy: Math.sin(ang)};
    }
  }
  return {ok: false};
}, {type, dist, trial, pre: PRE});

const keyFor = (nx, ny) => { const k = []; if (Math.abs(nx) > .35) k.push(nx > 0 ? 'KeyD' : 'KeyA'); if (Math.abs(ny) > .35) k.push(ny > 0 ? 'KeyS' : 'KeyW'); return k; };
const held = new Set();
const keys = async want => { want = new Set(want); for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } };

async function trialRun(type, dist, mode, trial) {
  const info = await setup({type, dist, trial}); if (!info.ok) return null;
  await page.evaluate(() => { window.__deadair.view.render = window.__realRender; window.advanceTime(500); window.__deadair.view.render = () => {}; });
  if (PRE) await page.evaluate(() => { const s = window.__deadair.state; s.noises.push({x: s.player.x, y: s.player.y, radius: 700, kind: 'shot'}); });   // a real noise: the enemy becomes aware through the same code path as in play
  const want = mode === "still" ? [] : mode === "approach" ? keyFor(info.cx, info.cy) : keyFor(info.nx, info.ny);
  if (mode === 'sprint') want.push('ShiftLeft');
  await keys(want);
  let tAware = null, tShot = null, dAware = null, tWind = null;
  const t0 = await page.evaluate(() => window.__deadair.state.realElapsed);
  for (let i = 0; i < 420 && tShot === null; i++) {
    const r = await page.evaluate(() => {
      window.advanceTime(16); const D = window.__deadair, s = D.state, e = s.enemies.find(x => x.alive);
      if (!e) return null;
      return {t: s.realElapsed, aware: !!e.ai?.aware, shot: s.bullets.some(b => b.owner !== 'player'), intent: e.intent, ai: e.ai && {cd: +e.ai.cd.toFixed(2), react: +e.ai.reaction.toFixed(2), ph: e.ai.phase, pt: +e.ai.phaseT.toFixed(2), rel: e.reloadTimer, ammo: e.ammo, cov: !!e.ai.cover, sinceStart: +e.ai.sinceStart.toFixed(2)}, los: e.los, rate: +s.worldRate.toFixed(2), wind: e.aimTimer > 0 || e.meleeWindup > 0, hp: s.health, d: Math.hypot(e.x - s.player.x, e.y - s.player.y)};
    });
    if (!r) break;
    if (process.env.TRACE && i < 40) console.log(JSON.stringify(r));
    if (r.aware && tAware === null) { tAware = r.t; dAware = r.d; }
    if (r.aware && tWind === null && r.wind) tWind = r.t;
    if (r.aware && tShot === null && (r.shot || r.hp < 100)) tShot = r.t;
  }
  await keys([]);
  return {detect: tAware === null ? null : Math.round((tAware - t0) * 1000), wind: tAware !== null && tWind !== null ? Math.round((tWind - tAware) * 1000) : null, react: tAware !== null && tShot !== null ? Math.round((tShot - tAware) * 1000) : null, total: tShot === null ? null : Math.round((tShot - t0) * 1000), dAware: dAware === null ? null : Math.round(dAware)};
}
const med = a => { a = a.filter(x => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const out = {};
for (const type of TYPES) for (const dist of DISTS) for (const mode of MODES) {
  const rows = []; for (let i = 0; i < TRIALS; i++) { const r = await trialRun(type, dist, mode, i); if (r) rows.push(r); }
  const sum = {type, dist, mode, n: rows.length, detectMs: med(rows.map(r => r.detect)), windMs: med(rows.map(r => r.wind)), reactMs: med(rows.map(r => r.react)), totalMs: med(rows.map(r => r.total)), awareAtPx: med(rows.map(r => r.dAware)), noShot: rows.filter(r => r.total == null).length};
  out[`${type}|${dist}|${mode}`] = {sum, rows};
  console.log(`${type.padEnd(7)} ${String(dist).padEnd(4)} ${mode.padEnd(6)} n=${sum.n} detect ${String(sum.detectMs).padEnd(6)}ms windStart ${String(sum.windMs).padEnd(6)}ms shot ${String(sum.reactMs).padEnd(6)}ms total ${String(sum.totalMs).padEnd(6)}ms awareAt ${sum.awareAtPx}px noShot ${sum.noShot}`);
}
if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify(out, null, 1));
await browser.close(); server.close();
