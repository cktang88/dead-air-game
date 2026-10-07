#!/usr/bin/env node
// DEAD AIR duel harness: spawns N aware enemies at a distance with line of sight and runs scripted players against them.
//   node tools/duel.mjs [--trials 5] [--dist 280] [--squads gunner,guard,...,gunner+gunner+chaser] [--policies spray,read] [--max 40] [--out file.json]
// Policies: burst = stand still, 0.35 s bursts once a second. spray = stand still, hold fire at the nearest enemy. read = stand still and fire, but sidestep (and keep firing)
// the moment an enemy telegraphs / a hostile bullet closes in / a melee enemy gets close; i.e. stillness used to READ.
// The sim is stepped only through window.advanceTime. HP is made huge; losses are counted, and "wouldDie" means the
// trial lost >= 3 HP (the starting max HP).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const TRIALS = +opt('trials', 5), DIST = +opt('dist', 210), MAXT = +opt('max', 40), STEP = +opt('step', 50);
const SQUADS = opt('squads', 'gunner,guard,sniper,chaser,brute,gunner+gunner+chaser+chaser+guard,gunner+gunner+gunner+guard+guard+chaser+chaser').split(',');
const TRACE = argv.includes('--trace');
const POLICIES = opt('policies', 'spray,read').split(',');
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
await page.waitForFunction(() => window.__deadair && window.__deadair.state.mode === 'play' && window.__deadair.state.player, null, {timeout: 20000});
// --pressure floor,attack,bullet overrides the PRESSURE tunables (same module instance the game uses) for tuning sweeps
if (opt('pressure')) { const v = opt('pressure').split(',').map(Number); await page.evaluate(async v => { const m = await import('/time-rule.js'); if (v[0] >= 0) m.PRESSURE.floor = v[0]; if (v[1] >= 0) m.PRESSURE.attackFloor = v[1]; if (v[2] >= 0) m.PRESSURE.bulletFloor = v[2]; }, v); }
// headless software GL makes render() the bottleneck; the sim does not need it, so it is stubbed (state, brain and bullets are untouched)
await page.evaluate(() => { window.requestAnimationFrame = () => 0; window.__realRender = window.__deadair.view.render; });

const setup = (squad, dist, trial) => page.evaluate(({squad, dist, trial}) => {
  const D = window.__deadair, s = D.state;
  for (const e of s.enemies) { e.alive = false; try { e.body.setEnabled(false); } catch {} }
  s.enemies = []; s.bullets = [];
  s.maxHealth = 100; s.health = 100; s.armor = 0; s.freezeT = 0; s.timeCredit = 0;
  const gi = s.weaponIndex; s.weaponAmmo[gi] = 999; s.reserveAmmo[gi] = 999; s.beatBank = 0;
  const rooms = s.rooms.map(r => ({r, a: (r.x2 - r.x1) * (r.y2 - r.y1)})).sort((a, b) => b.a - a.a);
  const R = rooms[trial % 3].r; const ok = (x, y) => s.solidMap[Math.floor(y / 32)]?.[Math.floor(x / 32)] === 0;
  // open ground: no wall, crate or cover within ~3 tiles of a spawn (so the duel tests time/telegraph, not cover-hiding AI)
  const open3 = (x, y) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (s.solidMap[Math.floor(y / 32) + dy]?.[Math.floor(x / 32) + dx] !== 0) return false; return !s.cover.some(c => Math.hypot(c.x - x, c.y - y) < 110) && !s.crates.some(c => Math.hypot(c.x - x, c.y - y) < 110); };
  let pos = null;
  for (const strict of [true, false]) {
    for (let ty = R.y1 + 1; ty < R.y2 && !pos; ty++) for (let tx = R.x1 + 1; tx < R.x2 - 1 && !pos; tx++) {
      const px = (tx + .5) * 32, py = (ty + .5) * 32; let n = 0;
      for (let a = 0; a < 16; a++) { const ex = px + Math.cos(a / 16 * 6.283) * dist, ey = py + Math.sin(a / 16 * 6.283) * dist; if (ok(ex, ey) && !D.lineBlocked(px, py, ex, ey) && (!strict || open3(ex, ey))) n++; }
      if (n >= (squad.length > 1 ? 3 : 1)) pos = [px, py];
    }
    if (pos) break;
  }
  if (!pos) return null;
  const [px, py] = pos; s.player.body.setTranslation({x: px, y: py}, true); s.player.x = px; s.player.y = py;
  let n = 0;
  for (let k = 0; k < squad.length; k++) for (let tries = 0; tries < 400; tries++) {
    const a = Math.random() * 6.283, r = dist - 40 + Math.random() * 80, ex = px + Math.cos(a) * r, ey = py + Math.sin(a) * r;
    if (ok(ex, ey) && !D.lineBlocked(px, py, ex, ey) && (tries > 300 || open3(ex, ey))) { const e = D.spawnEnemy(squad[k], ex, ey, R.index); const ai = D.brainState(e, Math.random); ai.aware = true; ai.suspicion = 1; ai.spotted = true; ai.reaction = .1; e.aware = true; n++; break; }
  }
  return {n, room: R.index};
}, {squad, dist, trial});

const observe = () => page.evaluate(() => {
  const D = window.__deadair, s = D.state, p = s.player, v = D.view;
  const live = s.enemies.filter(e => e.alive);
  let near = null, nd = 1e9; for (const e of live) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < nd) { nd = d; near = e; } }
  const a = v.screenToWorld(0, 0), b = v.screenToWorld(1000, 1000), sx = 1000 / (b.x - a.x), sy = 1000 / (b.y - a.y);
  const threat = live.some(e => (e.aimTimer > 0 || e.meleeWindup > 0 || (e.def.melee && Math.hypot(e.x - p.x, e.y - p.y) < 90)));
  let bulletClose = false;
  for (const bu of s.bullets) { if (bu.owner === 'player') continue; const rx = p.x - bu.x, ry = p.y - bu.y, sp = Math.hypot(bu.vx, bu.vy) || 1, along = (rx * bu.vx + ry * bu.vy) / sp, cross = Math.abs(rx * bu.vy - ry * bu.vx) / sp; if (along > 0 && along < 140 && cross < 26) bulletClose = true; }
  const en = live.map(e => `${e.type}:${e.intent}${e.aimTimer > 0 ? '*' : ''}${e.meleeWindup > 0 ? '!' : ''}@${Math.round(Math.hypot(e.x - p.x, e.y - p.y))}${e.los ? 'L' : ''}/${Math.round(e.hp)}`).join(' ');
  return {en, eb: s.bullets.filter(b => b.owner !== 'player').length, mode: s.mode, hp: s.health, n: live.length, ammo: s.weaponAmmo[s.weaponIndex], reloading: s.reloadTimer > 0, threat, bulletClose, rate: s.worldRate, tgt: near ? {d: nd, sx: (near.x - a.x) * sx, sy: (near.y - a.y) * sy, dx: near.x - p.x, dy: near.y - p.y} : null, t: s.realElapsed};
});
const held = new Set(); let mouseDown = false;
const keys = async want => { want = new Set(want); for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } };
const fire = async on => { if (on && !mouseDown) { await page.mouse.down(); mouseDown = true; } else if (!on && mouseDown) { await page.mouse.up(); mouseDown = false; } };

async function runTrial(squad, policy, trial) {
  const info = await setup(squad, DIST, trial); if (!info || info.n < squad.length) { if (TRACE) console.log("skip", JSON.stringify(info)); return {skip: true}; }
  // settle the camera on the new spot with the real renderer, then stub render for speed (aim maps mouse -> world through the camera)
  await page.evaluate(() => { window.__deadair.view.render = window.__realRender; window.advanceTime(700); window.__deadair.view.render = () => {}; });
  const t0 = (await observe()).t; let lastTr = -1, hp0 = 100, hits = 0, lost = 0, strafeUntil = 0, strafeDir = 1, rateSum = 0, rateN = 0, s;
  const total = squad.length;
  for (;;) {
    s = await observe();
    if (s.hp < hp0) { hits++; lost += hp0 - s.hp; hp0 = s.hp; }
    const el = s.t - t0;
    if (s.n === 0 || el > MAXT || s.mode !== 'play') break;
    rateSum += s.rate || 0; rateN++;
    if (TRACE && Math.floor(el * 2) !== lastTr) { lastTr = Math.floor(el * 2); console.log(`  t=${el.toFixed(1)} rate=${(s.rate || 0).toFixed(2)} hp=${s.hp} eb=${s.eb} ${s.en}`); }
    const want = [];
    if (policy === 'read') {
      if ((s.threat || s.bulletClose) && el >= strafeUntil) { strafeUntil = el + 0.45; strafeDir = -strafeDir; }
      if (el < strafeUntil && s.tgt) { const nx = -s.tgt.dy, ny = s.tgt.dx, m = Math.hypot(nx, ny) || 1, vx = nx / m * strafeDir, vy = ny / m * strafeDir; if (vx > .35) want.push('KeyD'); else if (vx < -.35) want.push('KeyA'); if (vy > .35) want.push('KeyS'); else if (vy < -.35) want.push('KeyW'); }
    }
    await keys(want);
    const burstOn = policy !== 'burst' || (el % 1.0) < 0.35;
    if (s.tgt) { await page.mouse.move(Math.max(2, Math.min(1277, s.tgt.sx)), Math.max(2, Math.min(717, s.tgt.sy))); await fire(burstOn); }
    if (s.ammo <= 2 && !s.reloading) await page.keyboard.press('KeyR');
    await page.evaluate(ms => window.advanceTime(ms), STEP);
  }
  await keys([]); await fire(false);
  return {cleared: s.n === 0, killed: total - s.n, total, t: +(s.t - t0).toFixed(1), hits, lost, die: lost >= 3, rate: +(rateSum / Math.max(1, rateN)).toFixed(2)};
}

const out = {};
for (const sq of SQUADS) for (const pol of POLICIES) {
  const rows = [];
  for (let i = 0; i < TRIALS; i++) rows.push(await runTrial(sq.split('+'), pol, i));
  const ok = rows.filter(r => !r.skip), n = ok.length || 1, avg = k => +(ok.reduce((a, r) => a + r[k], 0) / n).toFixed(1);
  const sum = {squad: sq, policy: pol, n: ok.length, clear: `${ok.filter(r => r.cleared).length}/${ok.length}`, hit0: `${ok.filter(r => r.hits === 0).length}/${ok.length}`, die: `${ok.filter(r => r.die).length}/${ok.length}`, hits: avg('hits'), lost: avg('lost'), t: avg('t'), rate: avg('rate')};
  out[sq + '|' + pol] = {sum, rows};
  console.log(`${sq.padEnd(48)} ${pol.padEnd(5)} clear ${sum.clear.padEnd(4)} zeroHit ${sum.hit0.padEnd(4)} wouldDie ${sum.die.padEnd(4)} hitsAvg ${String(sum.hits).padEnd(5)} t ${String(sum.t).padEnd(5)} avgRate ${sum.rate}`);
}
if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify(out, null, 1));
await browser.close(); server.close();
