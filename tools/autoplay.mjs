#!/usr/bin/env node
// DEAD AIR autoplay balance harness.
//
// Launches headless Chromium, serves this repo, and plays N seeds with REAL keyboard / mouse input
// (page.keyboard / page.mouse). Game state is only READ (via `?debug` -> window.__deadair) to make
// decisions; nothing is teleported or written. See README "Playtesting" for usage.
//
//   node tools/autoplay.mjs --seeds 10 --skill 0.5 --out autoplay-out
//
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {GUNS, ENEMY_TYPES} = await import(pathToFileURL(path.join(ROOT, 'catalog.js')).href);
const {THROWABLES} = await import(pathToFileURL(path.join(ROOT, 'tactical.js')).href);

// ───────────────────────────── CLI ─────────────────────────────
const HELP = `usage: node tools/autoplay.mjs [options]
  --seeds N|a,b,c|a-b   number of seeds (from --seed-base) or an explicit list/range   [10]
  --seed N              play exactly one seed
  --seed-base N        first seed when --seeds is a count                              [7001]
  --skill 0..1          bot skill: aim error, reaction delay, slow-time use, dodging    [0.5]
  --out DIR             output dir for results.json / summary / screenshots             [autoplay-out/<stamp>]
  --vendor DIR          local bundles (three.js, _dimforge_rapier2d-compat.js, rot-js.js) used to
                        answer esm.sh imports. Default: $DEADAIR_VENDOR, else the session scratchpad
                        vendor/out if present, else the real network.
  --workers N           parallel browsers                                               [min(3,cpus-1)]
  --speed X             sim speed multiplier (1 = real time; extra time via advanceTime) [1]
  --timeout SEC         wall-clock limit per seed                                        [600]
  --max-game-time SEC   game-clock limit per seed (counted as 'timeout')                 [900]
  --shots [SEC]         save periodic screenshots every SEC game seconds                 [off, 30]
  --width/--height PX   viewport                                                         [1280x720]
  --extract             at the bank/descend choice, bank (extract) instead of descending
  --verbose             log the bot's task decisions
`;
function parseArgs(argv) {
  const o = {seeds: '10', seedBase: 7001, skill: 0.5, speed: 1, timeout: 600, maxGameTime: 900, shots: 0, width: 1280, height: 720, verbose: false, workers: Math.max(1, Math.min(3, os.cpus().length - 1))};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    switch (a) {
      case '--seeds': o.seeds = next(); break;
      case '--seed': o.seeds = next() + ','; break;
      case '--seed-base': o.seedBase = +next(); break;
      case '--skill': o.skill = Math.min(1, Math.max(0, +next())); break;
      case '--out': o.out = next(); break;
      case '--vendor': o.vendor = next(); break;
      case '--workers': o.workers = Math.max(1, +next()); break;
      case '--speed': o.speed = Math.max(1, +next()); break;
      case '--timeout': o.timeout = +next(); break;
      case '--max-game-time': o.maxGameTime = +next(); break;
      case '--shots': o.shots = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? +next() : 30; break;
      case '--width': o.width = +next(); break;
      case '--height': o.height = +next(); break;
      case '--extract': o.extract = true; break;
      case '--verbose': o.verbose = true; break;
      case '-h': case '--help': console.log(HELP); process.exit(0);
      default: console.error('unknown option ' + a + '\n' + HELP); process.exit(2);
    }
  }
  return o;
}
function seedList(o) {
  const s = String(o.seeds);
  if (s.includes(',')) return s.split(',').filter(Boolean).map(Number);
  if (/^\d+-\d+$/.test(s)) { const [a, b] = s.split('-').map(Number); return Array.from({length: b - a + 1}, (_, i) => a + i); }
  return Array.from({length: +s}, (_, i) => o.seedBase + i);
}

// ───────────────────────────── infrastructure ─────────────────────────────
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav'};
function serveRepo() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, port: server.address().port})));
}
async function loadPlaywright() {
  for (const spec of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    if (!spec) continue;
    try { return await import(spec.startsWith('/') ? pathToFileURL(spec).href : spec); } catch { /* try next */ }
  }
  throw new Error('playwright not found (set PLAYWRIGHT_PATH or npm i playwright)');
}
function resolveVendor(o) {
  const cands = [o.vendor, process.env.DEADAIR_VENDOR, '/tmp/claude-0/-home-user/75c704e9-7d4c-517c-a9b2-030bae929b2f/scratchpad/vendor/out'];
  for (const c of cands) if (c && fs.existsSync(path.join(c, 'three.js'))) return path.resolve(c);
  return null;
}
const VENDOR_FILES = {'three': 'three.js', '@dimforge/rapier2d-compat': '_dimforge_rapier2d-compat.js', 'rot-js': 'rot-js.js'};

// ───────────────────────────── in-page hooks (read-only) ─────────────────────────────
function installHooks() {
  const D = window.__deadair;
  if (!D) throw new Error('window.__deadair missing (is ?debug in the URL?)');
  const s = D.state, v = D.view, evs = [];
  let prevB = [];
  const orig = v.consume.bind(v);
  v.consume = function (list) {
    for (const e of list) {
      if (e.type === 'playerHurt') {
        let id = null, best = 40;
        for (const b of prevB) { const d = Math.hypot(b.x - e.sx, b.y - e.sy); if (d < best) { best = d; id = b.id; } }
        let en = id != null ? s.enemies.find(x => x.id === id) : null, how = en ? 'bullet' : 'melee';
        if (!en) { let bd = 48; for (const x of s.enemies) { const d = Math.hypot(x.x - e.sx, x.y - e.sy); if (d < bd) { bd = d; en = x; } } }
        const room = s.rooms[s.currentRoom];
        evs.push({k: 'hurt', dmg: e.damage, armorOnly: !!e.armorOnly, hp: e.health, how: en ? how : (s.thrown.length || s.effects.length ? 'explosive' : 'unknown'), enemy: en ? en.type : null, role: room?.role || '?', branch: !!room?.branch, t: s.realElapsed});
      } else if (e.type === 'kill') evs.push({k: 'kill', enemy: e.enemyType, t: s.realElapsed});
    }
    prevB = s.bullets.filter(b => b.owner === 'enemy').map(b => ({x: b.x, y: b.y, id: b.enemyId}));
    return orig(list);
  };
  window.__bot = {
    rooms() { return s.rooms.map(r => ({i: r.index, role: r.role, branch: !!r.branch, name: r.name, cx: r.cx, cy: r.cy, x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2, depth: r.depth, secret: !!r.secret, path: r.pathLength})); },
    // Closable doors never lock (they open when walked into), so the bot's grid treats them as passable; paid gates stay solid.
    solid() { const g = s.solidMap.map(r => r.slice()); for (const d of s.doorProps || []) if (!d.gate) for (const c of d.cells || []) if (g[c.y]) g[c.y][c.x] = 0; return g; },
    snap() {
      const p = s.player;
      const out = {mode: s.mode, outcome: s.outcome || null, floor: s.floor, rm: s.runModal || null, paused: s.paused, t: s.realElapsed, st: s.elapsed, ts: s.timeScaleSmoothed, ev: evs.splice(0)};
      if (!p) return out;
      Object.assign(out, {
        px: p.x, py: p.y, vx: s.playerVel.x, vy: s.playerVel.y, hp: s.health, mhp: s.maxHealth, armor: s.armor, marmor: s.maxArmor, scrap: s.scrap, kills: s.kills, cleared: s.roomsCleared,
        cur: s.currentRoom, slots: s.weaponSlots.slice(), active: s.activeSlot, wi: s.weaponIndex, ammo: s.weaponAmmo.slice(), reserve: s.reserveAmmo.slice(),
        reloading: s.reloadTimer > 0, burst: !!s.weaponBurst, aim: {x: s.aim.x, y: s.aim.y}, thr: Object.assign({}, s.throwables), thrIdx: s.throwableIndex, inv: s.invuln,
        modal: {cache: !!s.cacheOpen, merchant: !!s.merchantOpen, gun: s.pendingGunPickup ? s.pendingGunPickup.gunIndex : null, loadout: !!s.loadoutOpen, pending: !!s.pendingLoadoutChange},
        extraction: !!s.extractionOpen, gear: s.gear, floor: s.floor, rm: s.runModal || null, runRooms: s.runRooms || 0,
        cam: {x: v.cam.x, y: v.cam.y, w: v.cam.w, h: v.cam.h, scale: v.cam.scale},
        enemies: s.enemies.filter(e => e.alive).map(e => ({id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, room: e.roomIndex, aimT: e.aimTimer || 0, wind: e.meleeWindup || 0, rel: e.reloadTimer || 0, stun: e.stun || 0, sf: e.shieldFacing})),
        bullets: s.bullets.filter(b => b.owner === 'enemy').map(b => ({x: b.x, y: b.y, vx: b.vx, vy: b.vy, id: b.enemyId, d: b.damage || 1})),
        cover: s.cover.map(c => ({x: c.x, y: c.y, r: c.radius, crate: !!c.crate})),
        crates: s.crates.map(c => ({x: c.x, y: c.y, hp: c.hp})),
        pickups: s.pickups.filter(k => k.available).map(k => ({kind: k.kind, x: k.x, y: k.y, room: k.roomIndex, gun: k.gunIndex, claimed: !!k.claimed, declined: !!k.declined, value: k.value})),
        gates: s.lockedDoors.map(g => ({x: (g.x + 0.5) * 32, y: (g.y + 0.5) * 32, cost: g.cost, opened: !!g.opened, room: g.roomIndex})),
        rstate: s.rooms.map(r => (r.cleared ? 2 : 0) | (r.visited ? 1 : 0)),
        active_i: s.interact && s.interact.active ? {kind: s.interact.active.kind, id: s.interact.active.id, ok: s.interact.active.enabled} : null,
        stock: s.merchantOpen && s.merchantRoom ? (s.merchantRoom.stock || []).map(o => ({type: o.type, cost: o.cost, sold: !!o.sold, gun: o.gunId, gear: o.gearId, thr: o.throwableId})) : null,
        gunName: null,
      });
      return out;
    },
  };
}

// ───────────────────────────── geometry & navigation ─────────────────────────────
const TILE = 32, CELL = 8, PR = 8.2 /* player radius + epsilon */, PSPEED = 112;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hyp = Math.hypot;
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class Nav {
  constructor(solid) {
    this.solid = solid; this.th = solid.length; this.tw = solid[0].length;
    this.gw = this.tw * (TILE / CELL); this.gh = this.th * (TILE / CELL);
    this.clear = new Float32Array(this.gw * this.gh);
    for (let j = 0; j < this.gh; j++) for (let i = 0; i < this.gw; i++) this.clear[j * this.gw + i] = this.wallDist((i + .5) * CELL, (j + .5) * CELL, 30);
    this.dyn = new Uint8Array(this.gw * this.gh);
    this.g = new Float32Array(this.gw * this.gh); this.par = new Int32Array(this.gw * this.gh); this.closed = new Uint8Array(this.gw * this.gh);
    this.obstacles = []; this.zones = []; this.perm = [];
  }
  isSolid(tx, ty) { return tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th || this.solid[ty][tx] !== 0; }
  setOpen(tx, ty) { this.solid[ty][tx] = 0; for (let j = ty * 4 - 2; j < ty * 4 + 6; j++) for (let i = tx * 4 - 2; i < tx * 4 + 6; i++) if (i >= 0 && j >= 0 && i < this.gw && j < this.gh) this.clear[j * this.gw + i] = this.wallDist((i + .5) * CELL, (j + .5) * CELL, 30); }
  wallDist(x, y, cap = 30) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); let best = cap;
    for (let j = ty - 1; j <= ty + 1; j++) for (let i = tx - 1; i <= tx + 1; i++) {
      if (!this.isSolid(i, j)) continue;
      const dx = Math.max(i * TILE - x, 0, x - (i + 1) * TILE), dy = Math.max(j * TILE - y, 0, y - (j + 1) * TILE);
      const d = hyp(dx, dy); if (d < best) best = d;
    }
    return best;
  }
  setObstacles(list) { this.obstacles = list; }
  obstacleBlocks(x, y, r) { for (const o of this.obstacles) if (hyp(o.x - x, o.y - y) < o.r + r) return true; return false; }
  pointBlocked(x, y, r = PR) { return this.wallDist(x, y, r + 1) < r || this.obstacleBlocks(x, y, r); }
  lineClear(a, b, r = PR) {
    const len = hyp(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(len / 5));
    for (let k = 1; k <= n; k++) { const t = k / n; if (this.pointBlocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r)) return false; }
    return true;
  }
  /** bullet line of sight: walls (incl. closed gates) and cover/crate circles */
  los(ax, ay, bx, by) {
    const len = hyp(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / 6));
    for (let k = 1; k < n; k++) { const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t; if (this.isSolid(Math.floor(x / TILE), Math.floor(y / TILE))) return false; }
    for (const o of this.obstacles) {
      if (o.soft) continue;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = clamp(((o.x - ax) * dx + (o.y - ay) * dy) / l2, 0, 1);
      if (hyp(ax + dx * t - o.x, ay + dy * t - o.y) < o.r - 2 && hyp(o.x - ax, o.y - ay) > o.r) return false;
    }
    return true;
  }
  stamp(ignoreObstacles, now) {
    this.dyn.fill(0);
    const mark = (x, y, r) => {
      const i0 = Math.max(0, Math.floor((x - r) / CELL)), i1 = Math.min(this.gw - 1, Math.floor((x + r) / CELL)), j0 = Math.max(0, Math.floor((y - r) / CELL)), j1 = Math.min(this.gh - 1, Math.floor((y + r) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (hyp((i + .5) * CELL - x, (j + .5) * CELL - y) < r) this.dyn[j * this.gw + i] = 1;
    };
    if (!ignoreObstacles) for (const o of this.obstacles) mark(o.x, o.y, o.r + PR);
    for (const b of this.perm) mark(b.x, b.y, b.r + PR);
    this.zones = this.zones.filter(z => z.until > now);
    for (const z of this.zones) mark(z.x, z.y, z.r);
  }
  blocked(idx) { return this.clear[idx] < PR || this.dyn[idx] === 1; }
  cellOf(x, y) { return clamp(Math.floor(y / CELL), 0, this.gh - 1) * this.gw + clamp(Math.floor(x / CELL), 0, this.gw - 1); }
  /** A* from a to goal (within tol px). Returns array of {x,y} (excluding start) or null. */
  find(a, goal, tol, now, ignoreObstacles = false) {
    this.stamp(ignoreObstacles, now);
    const gw = this.gw, N = gw * this.gh;
    let s = this.cellOf(a.x, a.y);
    if (this.blocked(s)) { // player hugging a wall: snap to nearest free cell
      let best = -1, bd = 1e9; const ci = s % gw, cj = (s / gw) | 0;
      for (let j = cj - 4; j <= cj + 4; j++) for (let i = ci - 4; i <= ci + 4; i++) { if (i < 0 || j < 0 || i >= gw || j >= this.gh) continue; const k = j * gw + i; if (this.clear[k] >= PR && !this.dyn[k]) { const d = hyp(i - ci, j - cj); if (d < bd) { bd = d; best = k; } } }
      if (best < 0) return null; s = best;
    }
    this.g.fill(1e9); this.closed.fill(0); this.par.fill(-1);
    const heap = [], hf = []; const push = (i, f) => { heap.push(i); hf.push(f); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (hf[p] <= hf[c]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; [hf[p], hf[c]] = [hf[c], hf[p]]; c = p; } };
    const pop = () => { const top = heap[0], lastI = heap.pop(), lastF = hf.pop(); if (heap.length) { heap[0] = lastI; hf[0] = lastF; let c = 0; for (;;) { let l = 2 * c + 1, r = l + 1, m = c; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; [hf[m], hf[c]] = [hf[c], hf[m]]; c = m; } } return top; };
    const h = i => { const dx = Math.abs(((i % gw) + .5) * CELL - goal.x), dy = Math.abs((((i / gw) | 0) + .5) * CELL - goal.y); return Math.max(0, (Math.max(dx, dy) + .414 * Math.min(dx, dy)) - tol); };
    this.g[s] = 0; push(s, h(s));
    const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    let found = -1, expanded = 0;
    while (heap.length) {
      const c = pop(); if (this.closed[c]) continue; this.closed[c] = 1;
      const ci = c % gw, cj = (c / gw) | 0;
      if (hyp((ci + .5) * CELL - goal.x, (cj + .5) * CELL - goal.y) <= tol) { found = c; break; }
      if (++expanded > N) break;
      for (let d = 0; d < 8; d++) {
        const ni = ci + DI[d], nj = cj + DJ[d]; if (ni < 0 || nj < 0 || ni >= gw || nj >= this.gh) continue;
        const n = nj * gw + ni; if (this.closed[n] || this.blocked(n)) continue;
        if (d >= 4 && (this.blocked(cj * gw + ni) || this.blocked(nj * gw + ci))) continue;
        const cl = this.clear[n], pen = cl < 14 ? (14 - cl) / 14 * 0.8 : 0;
        const ng = this.g[c] + (d >= 4 ? 1.414 : 1) * (1 + pen);
        if (ng < this.g[n]) { this.g[n] = ng; this.par[n] = c; push(n, ng + h(n)); }
      }
    }
    if (found < 0) return null;
    const pts = []; for (let c = found; c !== -1 && c !== s; c = this.par[c]) pts.push({x: ((c % gw) + .5) * CELL, y: (((c / gw) | 0) + .5) * CELL});
    return pts.reverse();
  }
}

// ───────────────────────────── the bot ─────────────────────────────
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]].map(([x, y]) => { const l = hyp(x, y); return {x: x / l, y: y / l}; });
const KEYFOR = (d) => { const k = []; if (d.x > .3) k.push('KeyD'); else if (d.x < -.3) k.push('KeyA'); if (d.y > .3) k.push('KeyS'); else if (d.y < -.3) k.push('KeyW'); return k; };
const angDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
const gunScore = gi => { const g = GUNS[gi]; return g.damage * (g.count || 1) * (g.burst ? g.burst.shots : 1) / Math.max(.1, g.rate) * (.55 + Math.min(g.range, 700) / 700) * (g.mag >= 10 ? 1 : .8) / (1 + g.weight / 14); };

class Bot {
  constructor(page, opts, seed, outDir, log) {
    this.page = page; this.o = opts; this.seed = seed; this.outDir = outDir; this.log = log;
    this.k = opts.skill; this.rng = mulberry(seed * 2654435761 + Math.round(opts.skill * 1000));
    const k = this.k;
    this.react = 0.5 - 0.38 * k;               // seconds before reacting to a newly visible enemy
    this.aimSigma = 0.13 - 0.115 * k;           // radians of sustained aim error
    this.lead = k;                              // target leading factor
    this.stillProb = 0.15 + 0.7 * k;            // chance of choosing stand-still slow-time fighting
    this.dodgeSkill = 0.25 + 0.75 * k;          // weight on bullet avoidance
    this.greed = 0.35 + 0.4 * k;                // willingness to detour for loot
    this.keys = new Set(); this.mouseDown = false; this.mouse = {x: opts.width / 2, y: opts.height / 2};
    this.seen = new Map(); this.prevEn = new Map(); this.aimNoise = {x: 0, y: 0, until: 0};
    this.task = null; this.plan = null; this.stillMode = false; this.stillUntil = 0; this.lastE = -9; this.lastReload = -9; this.lastThrow = -9; this.lastQ = -9;
    this.recover = null; this.progress = {x: 0, y: 0, t: 0}; this.stuckEvents = []; this.stuckCount = 0; this.recentStuck = [];
    this.permBlocks = []; this.gateTraps = []; this.badRooms = new Map();
    this.declined = new Set(); this.unreachable = new Map(); this.doneMarket = new Set(); this.pulled = new Map();
    this.stats = {scrapEarned: 0, scrapSpent: 0, starve: 0, dry: 0, hurt: [], kills: [], shotsFired: 0, stillTicks: 0, ticks: 0, throws: 0, taskTicks: {}, trapped: false, merchantBuys: [], cacheChoices: [], gunSwaps: 0, freqPicks: 0, decisions: [], errors: []};
    this.lastScrap = null; this.wasStarved = false; this.wasDry = false; this.nextShot = opts.shots || 1e9; this.shotN = 0; this.lastSnap = null;
    this.lastMoveWant = 0; this.pausedFor = 0;
  }
  async init(first = true) {
    if (first) await this.page.evaluate(installHooks);
    this.floorNo = null; this.plan = null; this.task = null; this.target = null; this.seen.clear(); this.prevEn.clear(); this.unreachable.clear(); this.badRooms.clear(); this.gateOpen = new Set(); this.permBlocks = []; this.doneMarket.clear(); this.pulled.clear(); this.anchor = null; this.idle = null; this.recover = null;
    this.rooms = await this.page.evaluate(() => window.__bot.rooms());
    this.nav = new Nav(await this.page.evaluate(() => window.__bot.solid()));
    this.routeRooms = this.rooms.filter(r => !r.branch).map(r => r.i);
  }
  // ── input primitives (real events) ──
  async setKeys(want) {
    const w = new Set(want);
    for (const k of [...this.keys]) if (!w.has(k)) { await this.page.keyboard.up(k); this.keys.delete(k); }
    for (const k of w) if (!this.keys.has(k)) { await this.page.keyboard.down(k); this.keys.add(k); }
  }
  async setFire(on) { if (on && !this.mouseDown) { await this.page.mouse.down(); this.mouseDown = true; } else if (!on && this.mouseDown) { await this.page.mouse.up(); this.mouseDown = false; } }
  async aimWorld(S, tx, ty) {
    const c = S.cam; let sx = (tx - c.x) * c.scale + c.w / 2, sy = (ty - c.y) * c.scale + c.h / 2;
    sx = clamp(sx, 24, c.w - 24); sy = clamp(sy, 24, c.h - 24);
    if (Math.abs(sx - this.mouse.x) > 1 || Math.abs(sy - this.mouse.y) > 1) { await this.page.mouse.move(sx, sy); this.mouse = {x: sx, y: sy}; }
  }
  async press(code) { await this.page.keyboard.press(code); }
  async shot(S, tag) {
    try { const f = path.join(this.outDir, `seed${this.seed}-${tag}.png`); await this.page.screenshot({path: f}); return path.basename(f); } catch { return null; }
  }

  // ── perception helpers ──
  visibleEnemies(S) {
    const c = S.cam, hw = c.w / 2 / c.scale - 6, hh = c.h / 2 / c.scale - 6, out = [];
    for (const e of S.enemies) {
      e.d = hyp(e.x - S.px, e.y - S.py);
      e.onScreen = Math.abs(e.x - c.x) < hw && Math.abs(e.y - c.y) < hh;
      e.los = this.nav.los(S.px, S.py, e.x, e.y);
      const pv = this.prevEn.get(e.id);
      if (pv && S.t > pv.t) { e.vx = (e.x - pv.x) / (S.t - pv.t) * .5 + (pv.vx || 0) * .5; e.vy = (e.y - pv.y) / (S.t - pv.t) * .5 + (pv.vy || 0) * .5; } else { e.vx = 0; e.vy = 0; }
      this.prevEn.set(e.id, {x: e.x, y: e.y, t: S.t, vx: e.vx, vy: e.vy});
      e.shielded = false; if (e.type === 'riot' && typeof e.sf === 'number' && !(e.stun > 0)) { e.shielded = angDiff(Math.atan2(S.py - e.y, S.px - e.x), e.sf) < 1.1; }
      e.melee = ['chaser', 'brute', 'riot', 'boss'].includes(e.type);
      if (e.onScreen && e.los) {
        if (!this.seen.has(e.id)) this.seen.set(e.id, {first: S.t, react: this.react * (.7 + .6 * this.rng())});
        e.vis = true; e.reacted = S.t - this.seen.get(e.id).first >= this.seen.get(e.id).react;
      } else { e.vis = false; e.reacted = false; if (this.seen.has(e.id) && S.t - this.seen.get(e.id).first > 4) this.seen.delete(e.id); }
      // threatening nearby melee enemies are noticed regardless of line of sight
      if (e.melee && e.d < 90 && e.los) e.reacted = true;
      out.push(e);
    }
    return out;
  }

  // ── navigation ──
  planTo(S, goal, tol, ignore = false) {
    const key = `${Math.round(goal.x / 8)},${Math.round(goal.y / 8)},${tol},${ignore}`;
    const p = this.plan;
    if (!p || p.key !== key || S.t - p.t > 0.55 || p.i >= p.pts.length) {
      const pts = this.nav.find({x: S.px, y: S.py}, goal, tol, S.t, ignore);
      this.plan = {key, t: S.t, pts: pts, i: 0, ignore};
      if (!pts) return null;
    }
    return this.plan.pts ? this.plan : null;
  }
  steerTo(S, goal, tol) {
    // returns {dir, remaining} or null if unreachable
    let plan = this.planTo(S, goal, tol);
    if (!plan) { plan = this.planTo(S, goal, tol, true); if (!plan) return null; }
    const pts = plan.pts, pos = {x: S.px, y: S.py};
    if (!pts.length || hyp(goal.x - pos.x, goal.y - pos.y) <= tol) return {dir: {x: 0, y: 0}, remaining: 0, arrived: true};
    while (plan.i < pts.length - 1 && hyp(pts[plan.i].x - pos.x, pts[plan.i].y - pos.y) < 9) plan.i++;
    let j = plan.i;
    if (plan.ignore) j = Math.min(pts.length - 1, plan.i + 3); else for (let m = Math.min(pts.length - 1, plan.i + 18); m > plan.i; m--) if (this.nav.lineClear(pos, pts[m])) { j = m; break; }
    const t = pts[j]; const d = hyp(t.x - pos.x, t.y - pos.y) || 1;
    let rem = d; for (let m = j; m < pts.length - 1; m++) rem += hyp(pts[m + 1].x - pts[m].x, pts[m + 1].y - pts[m].y);
    return {dir: {x: (t.x - pos.x) / d, y: (t.y - pos.y) / d}, remaining: rem, ignored: plan.ignore};
  }

  // ── decision: what are we trying to do (the "task") ──
  needs(S) {
    const sum = (f) => S.slots.reduce((a, gi) => a + f(gi), 0);
    const totalRes = sum(gi => S.reserve[gi]), totalMax = sum(gi => GUNS[gi].reserve);
    return {hurt: S.mhp - S.hp, resFrac: totalMax ? totalRes / totalMax : 1, activeRes: S.reserve[S.wi] / GUNS[S.wi].reserve, armorNeed: S.marmor > 0 && S.armor < S.marmor};
  }
  chooseTask(S, en) {
    const T = []; const P = {x: S.px, y: S.py}; const n = this.needs(S);
    const cost = (x, y) => hyp(x - P.x, y - P.y) / 10;
    const rs = (i) => S.rstate[i] || 0;
    const aliveIn = (i) => S.enemies.some(e => e.room === i);
    const maxDist = 250 + 600 * this.greed;
    for (const k of S.pickups) {
      const d = hyp(k.x - P.x, k.y - P.y); const key = `${k.kind}:${Math.round(k.x)},${Math.round(k.y)}`;
      if ((this.unreachable.get(key) || 0) > S.t) continue;
      let v = 0, tol = 12;
      const roomBusy = k.room != null && aliveIn(k.room) && d > 140;
      switch (k.kind) {
        case 'heal': if (n.hurt > 0) v = 40 + 35 * n.hurt; break;
        case 'ammo': if (n.resFrac < 0.95) v = 25 + 60 * (1 - n.resFrac); break;
        case 'armor': if (n.armorNeed) v = 55; break;
        case 'scrap': v = 22 + (k.value || 10) / 2; break;
        case 'mod': v = 38; break;
        case 'gun': if (!this.declined.has(key) && !k.declined && this.wantGun(S, k.gun)) v = 40; break;
        case 'cache': if (!k.claimed && k.room != null && !aliveIn(k.room)) { v = 62 + (n.hurt >= 2 ? 15 : 0) + (n.resFrac < .6 ? 15 : 0); tol = 28; } break;
        case 'locker': { const miss = GUNS[S.wi].reserve - S.reserve[S.wi]; if (n.activeRes < 0.55 && miss > 0 && S.scrap >= Math.ceil(miss * 0.9)) { v = 80; tol = 34; } break; }
        default: break;
      }
      if (v <= 0 || roomBusy || d > maxDist * (v > 60 ? 1.6 : 1)) continue;
      T.push({kind: k.kind, key, x: k.x, y: k.y, tol, score: v - cost(k.x, k.y), interact: ['cache', 'locker'].includes(k.kind) ? k.kind : null});
    }
    for (const g of S.gates) {
      if (g.opened) continue; const key = `gate:${g.x},${g.y}`;
      if ((this.unreachable.get(key) || 0) > S.t) continue;
      if (S.scrap >= g.cost + 10 && hyp(g.x - P.x, g.y - P.y) < maxDist * 1.2) T.push({kind: 'gate', key, x: g.x, y: g.y, tol: 32, score: 36 - cost(g.x, g.y), interact: 'gate'});
    }
    for (const r of this.rooms) {
      if (r.role === 'merchant' && !this.doneMarket.has(r.i) && S.scrap >= 40 && !aliveIn(r.i)) {
        const x = (r.cx + .5) * TILE, y = (r.cy + .5) * TILE, key = `market:${r.i}`;
        if ((this.unreachable.get(key) || 0) > S.t) continue;
        if (hyp(x - P.x, y - P.y) < maxDist * 1.5) T.push({kind: 'market', key, x, y, tol: 60, score: 42 - cost(x, y), interact: 'market', room: r.i});
      }
    }
    // optional: clear nearby branch rooms that hold a cache when healthy
    for (const r of this.rooms) {
      if (!r.branch || (rs(r.i) & 2) || !aliveIn(r.i) || (this.badRooms.get(r.i) || 0) > S.t) continue;
      const hasCache = S.pickups.some(k => k.room === r.i && k.kind === 'cache');
      if (!hasCache || n.hurt > S.mhp * 0.4 || n.resFrac < 0.4) continue;
      const x = (r.cx + .5) * TILE, y = (r.cy + .5) * TILE, key = `branch:${r.i}`;
      if ((this.unreachable.get(key) || 0) > S.t || this.rng() > this.greed + 0.1 && !this.pulled.has(key)) { this.pulled.set(key, 1); continue; }
      this.pulled.set(key, 1);
      if (hyp(x - P.x, y - P.y) < maxDist) {
        const inRoom = S.cur === r.i ? S.enemies.filter(e => e.room === r.i) : [];
        if (inRoom.length) { const t = inRoom.reduce((a, b) => hyp(a.x - P.x, a.y - P.y) < hyp(b.x - P.x, b.y - P.y) ? a : b); T.push({kind: 'hunt', key: `hunt:${t.id}`, x: t.x, y: t.y, tol: 60, score: 60, room: r.i}); }
        else T.push({kind: 'clear', key, x, y, tol: 20, score: 34 - cost(x, y), room: r.i});
      }
    }
    T.sort((a, b) => b.score - a.score);
    if (T.length && T[0].score > 0) { const sticky = this.task && T.find(t => t.key === this.task.key); return sticky && sticky.score > T[0].score - 12 ? sticky : T[0]; }
    // route: next uncleared main-route room with living enemies
    const live = S.enemies.filter(e => this.rooms[e.room] && !this.rooms[e.room].branch && !((this.badRooms.get(e.room) || 0) > S.t));
    if (live.length) {
      const order = this.routeRooms.filter(i => live.some(e => e.room === i));
      const ri = order.length ? order[0] : live[0].room, inRoom = live.filter(e => e.room === ri);
      let tgt = inRoom.reduce((a, b) => hyp(a.x - P.x, a.y - P.y) < hyp(b.x - P.x, b.y - P.y) ? a : b);
      const r = this.rooms[ri];
      if (S.cur !== ri) { return {kind: 'route', key: `route:${ri}`, x: (r.cx + .5) * TILE, y: (r.cy + .5) * TILE, tol: 40, room: ri}; }
      return {kind: 'hunt', key: `hunt:${tgt.id}`, x: tgt.x, y: tgt.y, tol: 60, room: ri};
    }
    const exit = S.pickups.find(k => k.kind === 'exit');
    if (exit) return {kind: 'exit', key: 'exit', x: exit.x, y: exit.y, tol: 10, interact: 'exit'};
    // fall back: walk toward last room (exit) centre
    const last = this.rooms[this.rooms.length - 1];
    return {kind: 'explore', key: 'explore', x: (last.cx + .5) * TILE, y: (last.cy + .5) * TILE, tol: 40};
  }
  wantGun(S, gi) {
    if (gi == null || S.slots.includes(gi)) return false;
    const worst = Math.min(...S.slots.map(gunScore));
    return gunScore(gi) > worst * 1.2;
  }

  // ── modals ──
  async handleModals(S) {
    const p = this.page;
    if (S.rm === 'freq') {
      const btns = await p.$$('#run-modal [data-freq]'); if (btns.length) { await btns[Math.floor(this.rng() * btns.length)].click(); this.stats.freqPicks++; return true; }
    }
    if (S.rm === 'decision') {
      const act = this.o.extract ? 'extract' : 'descend'; const b = await p.$(`#run-modal [data-act="${act}"]`); if (b) { await b.click(); this.stats.decisions.push(act + '@' + S.floor); } return true;
    }
    if (S.modal.cache) {
      const n = this.needs(S); const order = [];
      if (n.hurt >= 1) order.push('health');
      if (n.resFrac < 0.55 || S.ammo[S.wi] === 0) order.push('ammo');
      order.push('upgrade'); if (n.hurt === 0) order.push('ammo'); order.push('scrap', 'health', 'ammo');
      for (const c of order) {
        const btn = await p.$(`#cache-options [data-cache="${c}"]:not([disabled])`);
        if (btn) { await btn.click(); this.stats.cacheChoices.push(c); return true; }
      }
      await p.click('#close-cache').catch(() => {}); return true;
    }
    if (S.modal.merchant) {
      const dis = await p.$$eval('#merchant-stock [data-merchant]', bs => bs.map(b => ({i: +b.dataset.merchant, off: b.disabled})));
      const n = this.needs(S); const stock = S.stock || [];
      const prio = o => { switch (o.type) { case 'health': return n.hurt > 0 ? 100 : -1; case 'gear': return o.gear === 'armor' && S.marmor === 0 ? 90 : o.gear === 'armor' ? -1 : 40; case 'ammo': return n.resFrac < 0.7 ? 85 : 30; case 'attachment': return 60; case 'weapon': return 55; case 'throwable': return o.thr === 'frag' ? 50 : 20; default: return 10; } };
      let best = null;
      for (const d of dis) { const o = stock[d.i]; if (!o || d.off || o.sold || o.cost > S.scrap) continue; const pr = prio(o); if (pr > 0 && (!best || pr > best.pr)) best = {i: d.i, pr, o}; }
      if (best) { await p.click(`#merchant-stock [data-merchant="${best.i}"]`); this.stats.merchantBuys.push(best.o.type + (best.o.gear ? ':' + best.o.gear : '')); return true; }
      if (this.task?.room != null) this.doneMarket.add(this.task.room);
      await p.click('#close-merchant').catch(() => {}); return true;
    }
    if (S.modal.gun != null) {
      const buttons = await p.$$eval('#weapon-pickup [data-pickup-slot]', bs => bs.map(b => ({slot: +b.dataset.pickupSlot, off: b.disabled})));
      const newScore = gunScore(S.modal.gun); let best = null;
      for (const b of buttons) { if (b.off) continue; const cur = S.slots[b.slot]; const sc = cur == null ? -1 : gunScore(cur); if (best == null || sc < best.sc) best = {slot: b.slot, sc}; }
      if (best && newScore > best.sc * 1.15) { await p.click(`#weapon-pickup [data-pickup-slot="${best.slot}"]`); this.stats.gunSwaps++; }
      else { await p.click('#decline-weapon-pickup').catch(() => {}); this.declined.add(`gun:${Math.round(S.px)},${Math.round(S.py)}`); }
      return true;
    }
    if (S.modal.loadout || S.modal.pending) { await this.press('Escape'); return true; }
    return false;
  }

  // ── local combat steering ──
  combatMove(S, en, goalDir, target) {
    const P = {x: S.px, y: S.py}, gun = GUNS[S.wi];
    const reacted = en.filter(e => e.vis && e.reacted);
    const bullets = S.bullets.filter(b => hyp(b.x - P.x, b.y - P.y) < 260);
    const aimingAtMe = reacted.some(e => e.aimT > 0 || e.wind > 0 || e.rel === 0 && !e.melee && e.d < (ENEMY_TYPES[e.type]?.range || 200));
    const dry = S.reloading || S.ammo[S.wi] === 0, lowHp = S.hp <= Math.max(1, S.mhp * 0.34);
    const shielded = (q) => { let c = 0; for (const e of reacted) if (!e.melee && this.nav.los(q.x, q.y, e.x, e.y)) c++; return c; };
    const coverW = dry ? 9 : lowHp ? 5 : 0.4;
    let best = null; const cands = [{x: 0, y: 0, still: true}, ...DIRS];
    for (const d of cands) {
      let sc = 0; const T = 0.5, mv = d.still ? 0 : PSPEED * T;
      const q = {x: P.x + d.x * mv, y: P.y + d.y * mv};
      if (!d.still) { const free = this.nav.lineClear(P, {x: P.x + d.x * 26, y: P.y + d.y * 26}, PR - .6); if (!free) continue; if (!this.nav.lineClear(P, q, PR - .6)) sc -= 6; }
      // incoming bullets
      const scale = d.still ? 0.12 : 0.35;
      for (const b of bullets) {
        let worst = 99;
        for (let s = 0; s <= 6; s++) { const t = T * s / 6, bx = b.x + b.vx * scale * t, by = b.y + b.vy * scale * t, px = P.x + d.x * PSPEED * t, py = P.y + d.y * PSPEED * t; worst = Math.min(worst, hyp(bx - px, by - py)); }
        if (worst < 15) sc -= (15 - worst) * 3.2 * b.d * this.dodgeSkill;
      }
      // melee pressure
      for (const e of reacted) if (e.melee && e.d < 230) {
        const sp = ENEMY_TYPES[e.type].speed * (d.still ? 0.12 : 0.35) * T, ex = e.x + (P.x - e.x) / e.d * sp, ey = e.y + (P.y - e.y) / e.d * sp;
        const after = hyp(ex - q.x, ey - q.y); const w = (e.wind > 0 ? 2.4 : 1.3) * (e.type === 'brute' ? 1.3 : 1);
        sc += (after - e.d) * w * (e.d < 140 ? 1 : .4) * (0.5 + this.dodgeSkill * .5);
        if (after < 26) sc -= 25;
      }
      for (const e of reacted) if (e.type === 'riot' && typeof e.sf === 'number' && e.d < 260) sc += (angDiff(Math.atan2(q.y - e.y, q.x - e.x), e.sf) - angDiff(Math.atan2(P.y - e.y, P.x - e.x), e.sf)) * 14;
      // sidestep telegraphed shots
      for (const e of reacted) if (!e.melee && (e.aimT > 0) && e.d > 20) {
        const ax = (P.x - e.x) / e.d, ay = (P.y - e.y) / e.d; const perp = Math.abs(d.x * -ay + d.y * ax);
        sc += perp * 7 * this.dodgeSkill * (d.still ? 0 : 1);
      }
      sc += shielded(q) * -coverW * (dry || lowHp ? 1 : 1);
      // distance band to primary target
      if (target && !target.melee) {
        const want = clamp(gun.range * 0.6, 90, 240), da = hyp(target.x - q.x, target.y - q.y);
        sc += (Math.abs(target.d - want) - Math.abs(da - want)) * 0.12;
      }
      if (goalDir && !d.still) sc += (d.x * goalDir.x + d.y * goalDir.y) * 3.2;
      if (d.still) sc += (this.stillMode ? 7 : 1.5) + (target && !target.melee ? 2 : 0);
      if (this.lastDir && !d.still && d === this.lastDir) sc += 1.5;
      sc += (this.rng() - .5) * 1.2;
      if (!best || sc > best.sc) best = {sc, d};
    }
    this.lastDir = best?.d?.still ? null : best?.d;
    return {dir: best && !best.d.still ? best.d : null, aimingAtMe};
  }

  // ── main tick ──
  async tick(S, res) {
    const p = this.page;
    this.stats.ticks++;
    // events
    for (const e of S.ev) { if (e.k === 'hurt') this.stats.hurt.push(e); else if (e.k === 'kill') this.stats.kills.push(e); }
    if (this.lastScrap != null) { const d = S.scrap - this.lastScrap; if (d > 0) this.stats.scrapEarned += d; else if (d < 0) this.stats.scrapSpent -= d; }
    this.lastScrap = S.scrap;
    // modals / pause
    if (S.rm) { await this.setKeys([]); await this.setFire(false); await this.handleModals(S); return; }
    if (S.paused && !S.modal.cache && !S.modal.merchant && S.modal.gun == null && !S.modal.loadout) { this.pausedFor++; await this.setKeys([]); await this.setFire(false); if (this.pausedFor % 4 === 1) await this.press('Escape'); return; }
    this.pausedFor = 0;
    if (await this.handleModals(S)) { await this.setKeys([]); await this.setFire(false); return; }
    // ammo bookkeeping
    const total = S.slots.reduce((a, gi) => a + S.ammo[gi] + S.reserve[gi], 0);
    const starved = total === 0; if (starved && !this.wasStarved) this.stats.starve++; this.wasStarved = starved;
    const dry = S.ammo[S.wi] + S.reserve[S.wi] === 0 && !starved; if (dry && !this.wasDry) this.stats.dry++; this.wasDry = dry;

    const en = this.visibleEnemies(S);
    this.nav.setObstacles(S.cover.map(c => ({x: c.x, y: c.y, r: c.r}))); this.nav.perm = this.permBlocks;
    for (const g of S.gates) if (g.opened && !this.gateOpen.has(g.x + ',' + g.y)) { this.gateOpen.add(g.x + ',' + g.y); const fresh = await p.evaluate(() => window.__bot.solid()); for (let y = 0; y < fresh.length; y++) for (let x = 0; x < fresh[y].length; x++) if (fresh[y][x] === 0 && this.nav.solid[y][x] !== 0) this.nav.setOpen(x, y); }

    // idle watchdog: not moving for a long time outside combat -> go and find the nearest living enemy
    if (this.idle && S.t > this.idle.until) this.idle = null;
    if (!this.idle && this.anchor && S.t - Math.max(this.anchor.t, this.wdT || 0) > 8 && S.enemies.length && !S.modal.cache) {
      const pool = S.enemies.filter(e => !((this.badRooms.get(e.room) || 0) > S.t)); if (!pool.length) { this.wdT = S.t; } else {
      const t = pool.reduce((a, b) => hyp(a.x - S.px, a.y - S.py) < hyp(b.x - S.px, b.y - S.py) ? a : b);
      this.idle = {until: S.t + 10, task: {kind: 'hunt', room: t.room, key: 'wd:' + t.id, x: t.x, y: t.y, tol: 60, at: S.t, since: S.t}}; this.wdT = S.t; res.watchdogs = (res.watchdogs || 0) + 1;
      if (this.o.verbose) this.log(`[${S.t.toFixed(1)}] watchdog -> hunt ${t.type} room ${t.room}`);
    } }
    // task
    if (this.idle) { this.task = {...this.idle.task, x: S.enemies.find(e => 'wd:' + e.id === this.idle.task.key)?.x ?? this.idle.task.x, y: S.enemies.find(e => 'wd:' + e.id === this.idle.task.key)?.y ?? this.idle.task.y, at: S.t}; }
    else if (!this.task || S.t - this.task.at > 0.8 || this.task.done) {
      const nt = this.chooseTask(S, en);
      if (!this.task || nt.key !== this.task.key) { this.task = {...nt, at: S.t, since: S.t}; this.plan = null; if (this.o.verbose) this.log(`[${S.t.toFixed(1)}] task ${nt.kind} ${nt.key} @${Math.round(nt.x)},${Math.round(nt.y)}`); }
      else { this.task = {...nt, at: S.t, since: this.task.since}; }
    }
    if (['ammo', 'heal', 'armor', 'scrap', 'mod', 'gun'].includes(this.task.kind) && hyp(this.task.x - S.px, this.task.y - S.py) < 22) {
      if (!this.arrive || this.arrive.key !== this.task.key) this.arrive = {key: this.task.key, t: S.t};
      else if (S.t - this.arrive.t > 1.2) { this.unreachable.set(this.task.key, S.t + 150); this.task.done = true; this.arrive = null; }
    }
    if (['ammo', 'heal', 'armor', 'scrap', 'mod', 'gun', 'cache', 'locker', 'gate', 'market', 'clear'].includes(this.task.kind) && S.t - this.task.since > 14) { this.unreachable.set(this.task.key, S.t + 150); if (this.task.room != null && this.task.kind === 'clear') this.badRooms.set(this.task.room, S.t + 150); this.task.done = true; res.taskTimeouts = (res.taskTimeouts || 0) + 1; if (this.o.verbose) this.log(`[${S.t.toFixed(1)}] task timeout ${this.task.key}`); }
    this.stats.taskTicks[this.task.kind] = (this.stats.taskTicks[this.task.kind] || 0) + 1;
    const task = this.task, P = {x: S.px, y: S.py}, gun = GUNS[S.wi];

    // combat target
    const reacted = en.filter(e => e.vis && e.reacted && e.d < Math.max(gun.range * 1.1, 160));
    if (this.target && !reacted.some(e => e.id === this.target.id)) this.target = null;
    let target = null, bestS = 1e9;
    for (const e of reacted) { const s = e.d + (e.shielded ? 150 : 0) - (e.aimT > 0 || e.wind > 0 ? 60 : 0) - (this.target?.id === e.id ? 45 : 0) + (e.type === 'brute' ? 20 : 0); if (s < bestS) { bestS = s; target = e; } }
    this.target = target;
    const threats = en.filter(e => e.vis && e.reacted); const bulletsNear = S.bullets.some(b => hyp(b.x - P.x, b.y - P.y) < 220);
    const inCombat = threats.length > 0 || (bulletsNear && this.rng() < this.dodgeSkill + .3);
    this.stats.combatTicks = (this.stats.combatTicks || 0) + (inCombat ? 1 : 0);

    // stand-still (slow-time) decisions
    if (S.t > this.stillUntil) { this.stillMode = inCombat && this.rng() < this.stillProb; this.stillUntil = S.t + 0.7 + this.rng() * 1.3; }

    // navigation goal
    let goalDir = null, steer = null;
    const toTask = () => this.steerTo(S, {x: task.x, y: task.y}, task.tol);
    if (!inCombat || !target || target.d > Math.min(gun.range * 0.8, 260)) {
      const tgt = (inCombat && target && target.d > Math.min(gun.range * .8, 260)) ? this.steerTo(S, {x: target.x, y: target.y}, Math.min(gun.range * 0.7, 220)) : toTask();
      steer = tgt; if (steer) goalDir = steer.dir;
      if (!steer) { this.unreachable.set(task.key, S.t + 12); if (task.room != null) this.badRooms.set(task.room, S.t + 90); this.task.done = true; if (this.o.verbose) this.log(`[${S.t.toFixed(1)}] unreachable ${task.key}`); res.unreachable = (res.unreachable || 0) + 1; }
    }
    if (task.interact && steer?.arrived) goalDir = null;

    // interact
    if (task.interact && S.active_i && S.t - this.lastE > 0.7) {
      const want = {gate: 'gate', cache: 'cache', locker: 'locker', market: 'market', exit: 'exit'}[task.interact];
      const near = hyp(task.x - P.x, task.y - P.y) < task.tol + 16 || task.interact === 'market' || task.interact === 'exit';
      if (S.active_i.kind === want && (S.active_i.ok !== false || want === 'exit') && near && !inCombat) { this.lastE = S.t; await this.press('KeyE'); if (want === 'gate') { this.task.done = true; } }
      else if (S.active_i.kind === 'gun' && task.kind === 'gun') { this.lastE = S.t; await this.press('KeyE'); }
    }
    if (task.interact === 'locker' && steer?.arrived && S.active_i?.kind !== 'locker') this.task.done = true;
    // markets: standing in room with the panel not opening means it is done
    if (task.kind === 'market' && !S.active_i && steer?.arrived) { this.doneMarket.add(task.room); this.task.done = true; }

    // ── movement ──
    let move = null;
    if (this.recover && S.t < this.recover.until) move = this.recover.dir;
    else {
      if (this.recover) { this.recover = null; }
      if (inCombat) { const r = this.combatMove(S, en, goalDir, target); move = r.dir; }
      else if (goalDir && (goalDir.x || goalDir.y)) move = goalDir;
    }

    // stuck detection (only while we want to move)
    const wantsMove = !!move && !(this.recover && S.t < this.recover.until);
    if (wantsMove) {
      if (S.t - this.progress.t > 1.2) {
        const moved = hyp(S.px - this.progress.x, S.py - this.progress.y);
        if (moved < 8 && S.t - this.lastMoveWant < 1.6 && this.progress.want && !inCombat) await this.onStuck(S, move, res);
        this.progress = {x: S.px, y: S.py, t: S.t, want: true};
      }
      this.lastMoveWant = S.t;
    } else if (S.t - this.progress.t > 1.0) this.progress = {x: S.px, y: S.py, t: S.t, want: false};
    // trapped detection
    if (!this.anchor || hyp(S.px - this.anchor.x, S.py - this.anchor.y) > 70 || inCombat) this.anchor = {x: S.px, y: S.py, t: S.t};
    else if (S.t - this.anchor.t > 70 && task.kind !== 'idle') { if (!this.stats.trapped) { this.stats.trapped = {t: S.t, x: S.px, y: S.py, room: S.cur, task: task.kind, shot: await this.shot(S, 'trapped'), around: this.around(S)}; } if (S.t - this.anchor.t > 110) { res.forceEnd = 'stuck'; res.softlockNote = this.gateTraps.length ? 'paid-for gate collider blocks the way (game bug)' : 'unknown'; } }

    const sprint = move && !inCombat && !bulletsNear && !S.enemies.some(e => e.d < 260 && e.los) && S.hp > 0;
    const keys = move ? KEYFOR(move) : []; if (sprint) keys.push('ShiftLeft');
    await this.setKeys(keys);
    if (!move) this.stats.stillTicks++;

    // ── aiming / firing ──
    let firing = false;
    const ammoNow = S.ammo[S.wi];
    if (target && ammoNow > 0 && !S.reloading) {
      if (S.t > this.aimNoise.until) { const a = (this.rng() - .5) * 2 * this.aimSigma * 1.7; this.aimNoise = {a, until: S.t + 0.18 + this.rng() * 0.3}; }
      const lead = this.lead * (target.d / (gun.speed || 700));
      let tx = target.x + (target.vx || 0) * lead, ty = target.y + (target.vy || 0) * lead;
      const ang = Math.atan2(ty - P.y, tx - P.x) + this.aimNoise.a, dist = hyp(tx - P.x, ty - P.y);
      tx = P.x + Math.cos(ang) * dist; ty = P.y + Math.sin(ang) * dist;
      await this.aimWorld(S, tx, ty);
      const err = Math.abs(Math.atan2(S.aim.x * (ty - P.y) - S.aim.y * (tx - P.x), S.aim.x * (tx - P.x) + S.aim.y * (ty - P.y)));
      firing = !target.shielded && target.d <= gun.range * 0.9 && err < Math.atan2(11, Math.max(40, target.d)) + 0.03 + 0.04 * (1 - this.k) && target.los;
    } else if (move) { await this.aimWorld(S, P.x + move.x * 160, P.y + move.y * 160); }
    // blocked by a crate/cover while stuck: shoot it
    if (!firing && this.recover?.shoot && ammoNow > 0 && !S.reloading) { await this.aimWorld(S, this.recover.shoot.x, this.recover.shoot.y); firing = true; }
    await this.setFire(firing); if (firing) this.stats.shotsFired++;

    // reload / weapon swap
    if (!S.reloading && S.t - this.lastReload > 0.8) {
      const magMax = GUNS[S.wi].mag, low = ammoNow <= Math.max(1, Math.floor(magMax * 0.3)) || ammoNow < magMax && !inCombat && ammoNow < magMax * .6;
      if (ammoNow === 0 && S.reserve[S.wi] === 0) {
        const alt = S.slots.findIndex((gi, i) => i !== S.active && S.ammo[gi] + S.reserve[gi] > 0);
        if (alt >= 0) { this.lastReload = S.t; await this.press('Digit' + (alt + 1)); }
      } else if (low && S.reserve[S.wi] > 0 && (!target || ammoNow === 0 || this.rng() < .3 * this.k + .1)) { this.lastReload = S.t; await this.press('KeyR'); }
    }

    // grenades at clumps
    if (S.t - this.lastThrow > 5 && threats.length >= 2) {
      const frag = S.thr.frag || 0;
      if (frag > 0 && this.rng() < 0.25 + 0.5 * this.k) {
        let bestC = null;
        for (const e of threats) { const group = threats.filter(o => hyp(o.x - e.x, o.y - e.y) < 70); const cx = group.reduce((a, o) => a + o.x, 0) / group.length, cy = group.reduce((a, o) => a + o.y, 0) / group.length, d = hyp(cx - P.x, cy - P.y); const score = group.length + (group.some(o => o.type === 'brute') ? 1 : 0); if (group.length >= 2 && d > 110 && d < 190 && (!bestC || score > bestC.score)) bestC = {cx, cy, score}; }
        if (bestC && this.nav.los(P.x, P.y, bestC.cx, bestC.cy)) {
          this.lastThrow = S.t; this.stats.throws++;
          const fi = THROWABLES.findIndex(t => t.id === 'frag'); let idx = S.thrIdx;
          await setFire0(this); await this.aimWorld(S, bestC.cx, bestC.cy);
          for (let g = 0; g < THROWABLES.length && idx !== fi; g++) { await this.press('KeyQ'); idx = (idx + 1) % THROWABLES.length; }
          await this.page.waitForTimeout(40); await this.press('KeyG');
        }
      }
    }
    // periodic screenshots
    if (this.o.shots && S.t >= this.nextShot) { this.nextShot += this.o.shots; await this.shot(S, `t${String(Math.round(S.t)).padStart(4, '0')}`); }
    this.lastSnap = S;
    async function setFire0(b) { await b.setFire(false); }
  }
  around(S) {
    const tx = Math.floor(S.px / TILE), ty = Math.floor(S.py / TILE), rows = [];
    for (let y = ty - 3; y <= ty + 3; y++) { let r = ''; for (let x = tx - 5; x <= tx + 5; x++) r += (x === tx && y === ty) ? '@' : this.nav.isSolid(x, y) ? '#' : '.'; rows.push(r); }
    return rows;
  }
  async onStuck(S, move, res) {
    this.stuckCount++;
    const ev = {t: +S.t.toFixed(1), x: Math.round(S.px), y: Math.round(S.py), room: S.cur, task: this.task?.kind, n: this.stuckCount};
    // is there a crate/cover directly ahead we could shoot?
    let shoot = null;
    for (const c of S.crates) { const d = hyp(c.x - S.px, c.y - S.py); if (d < 60 && ((c.x - S.px) * move.x + (c.y - S.py) * move.y) / (d || 1) > 0.5) shoot = {x: c.x, y: c.y}; }
    const og = S.gates.find(g => g.opened && hyp(g.x - S.px, g.y - S.py) < 48);
    if (og && !this.permBlocks.some(b => b.gate === og.x + ',' + og.y)) {
      // GAME BUG: an opened gate whose physics collider survived (see README). Treat it as a wall from now on.
      this.permBlocks.push({x: og.x, y: og.y, r: 30, gate: og.x + ',' + og.y, soft: true}); this.gateTraps.push({x: og.x, y: og.y, t: +S.t.toFixed(1), room: og.room});
      ev.openGateCollider = true;
    }
    ev.crateAhead = !!shoot; ev.dir = [+move.x.toFixed(2), +move.y.toFixed(2)]; ev.vel = [Math.round(S.vx), Math.round(S.vy)]; ev.wallDist = +this.nav.wallDist(S.px, S.py, 30).toFixed(1); ev.planNext = (this.plan?.pts || []).slice(this.plan?.i || 0, (this.plan?.i || 0) + 3).map(q => [q.x, q.y]); ev.keys = [...this.keys]; ev.nearCover = this.nav.obstacles.filter(o => hyp(o.x - S.px, o.y - S.py) < o.r + 30).map(o => [Math.round(o.x), Math.round(o.y), o.r]);
    if (this.stuckEvents.length < 6) { ev.shot = await this.shot(S, `stuck${this.stuckCount}`); ev.around = this.around(S); }
    this.stuckEvents.push(ev);
    this.recentStuck = this.recentStuck.filter(t => S.t - t < 20); this.recentStuck.push(S.t);
    const sign = this.stuckCount % 2 ? 1 : -1, perp = {x: -move.y * sign, y: move.x * sign};
    const back = {x: -move.x, y: -move.y};
    this.nav.zones.push({x: S.px + move.x * 18, y: S.py + move.y * 18, r: 14, until: S.t + 4});
    this.plan = null;
    const escalate = this.recentStuck.length >= 3;
    const dir = escalate && this.rng() < .5 ? DIRS[Math.floor(this.rng() * 8)] : (this.stuckCount % 3 === 0 ? back : {x: (back.x + perp.x) / 1.42, y: (back.y + perp.y) / 1.42});
    this.recover = {until: S.t + (escalate ? 0.9 : 0.55), dir, shoot};
    if (this.recentStuck.length >= 5) { this.unreachable.set(this.task.key, S.t + 25); this.task.done = true; }
  }
}

// ───────────────────────────── run one seed ─────────────────────────────
async function playSeed(browser, seed, o, ctx) {
  const {port, vendor, outDir} = ctx;
  const startWall = Date.now();
  const res = {seed, skill: o.skill, result: 'timeout', reason: ''};
  const context = await browser.newContext({viewport: {width: o.width, height: o.height}});
  const page = await context.newPage();
  // The bot plays generated floors: mark the first-run Signal Check tutorial as done.
  await page.addInitScript(() => { try { localStorage.setItem('dead-air.onboarding.v1', JSON.stringify({signalDone: true, manual: [], cards: []})); } catch {} });
  const errors = new Map();
  const noteErr = (t) => { const k = t.slice(0, 200); errors.set(k, (errors.get(k) || 0) + 1); };
  page.on('console', m => { if (m.type() === 'error') noteErr('console: ' + m.text()); });
  page.on('pageerror', e => noteErr('pageerror: ' + e.message));
  if (vendor) await page.route(/esm\.sh\//, route => {
    const u = route.request().url(); const k = Object.keys(VENDOR_FILES).find(k => u.includes('esm.sh/' + k + '@') || u.includes('esm.sh/' + k + '/'));
    if (!k) return route.abort();
    route.fulfill({contentType: 'application/javascript', headers: {'access-control-allow-origin': '*'}, body: fs.readFileSync(path.join(vendor, VENDOR_FILES[k]))});
  });
  const bot = new Bot(page, o, seed, outDir, (m) => console.log(`  [seed ${seed}] ${m}`));
  try {
    await page.goto(`http://127.0.0.1:${port}/?debug`);
    await page.waitForFunction(() => !document.getElementById('start-button').disabled, null, {timeout: 60000});
    await page.fill('#seed-input', String(seed));
    await page.click('#start-button');
    await page.waitForFunction(() => window.__deadair && window.__deadair.state.mode === 'play' && window.__deadair.state.player, null, {timeout: 20000});
    await bot.init();
    const floors = []; let prevS = null, last = null, tickReal = Date.now(), lastT = 0, lastProgressWall = Date.now(), lastCleared = -1;
    for (;;) {
      const wall = (Date.now() - startWall) / 1000;
      if (wall > o.timeout) { res.reason = 'wall-clock limit'; break; }
      let S;
      try { S = await page.evaluate(() => window.__bot.snap()); } catch (e) { res.result = 'error'; res.reason = 'evaluate failed: ' + e.message; break; }
      last = S.px != null ? S : last;
      if (S.mode === 'dead' || S.mode === 'won') { res.result = S.mode === 'dead' ? 'death' : S.outcome === 'extract' ? 'extract' : 'win'; res.floorReached = S.floor; for (const e of S.ev) if (e.k === 'hurt') bot.stats.hurt.push(e); for (const e of S.ev) if (e.k === 'kill') bot.stats.kills.push(e); break; }
      if (S.t > o.maxGameTime) { res.reason = 'game-clock limit'; break; }
      if (S.px == null) { await page.waitForTimeout(50); continue; }
      if (S.floor !== bot.floorNo) {
        if (bot.floorNo != null && prevS) floors.push({floor: bot.floorNo, cleared: prevS.cleared, rooms: bot.rooms.length, route: bot.routeRooms.length, t: +prevS.t.toFixed(0)});
        if (bot.floorNo != null) await bot.init(false);
        bot.floorNo = S.floor; res.floorReached = S.floor;
      }
      try { await bot.tick(S, res); } catch (e) { bot.stats.errors.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')); if (bot.stats.errors.length > 40) throw e; }
      prevS = S;
      if (res.forceEnd) { res.result = 'stuck'; res.reason = 'no displacement for >110s: ' + (res.softlockNote || ''); break; }
      if (S.cleared !== lastCleared) { lastCleared = S.cleared; lastProgressWall = Date.now(); }
      const now = Date.now(), dtReal = Math.min(120, now - tickReal);
      if (o.speed > 1 && !S.paused) await page.evaluate(ms => window.advanceTime(ms), Math.max(16, (o.speed - 1) * 40)).catch(() => {});
      await page.waitForTimeout(40); tickReal = Date.now();
    }
    await bot.setKeys([]).catch(() => {}); await bot.setFire(false).catch(() => {});
    if (o.shots) await bot.shot(last || {}, 'end-' + res.result);
    // final state
    const fin = await page.evaluate(() => { const S = window.__bot.snap(); return {cleared: S.cleared, kills: S.kills, scrap: S.scrap, t: S.t, st: S.st, rstate: S.rstate, hp: S.hp, ev: S.ev}; }).catch(() => null);
    if (fin) { for (const e of fin.ev) if (e.k === 'hurt') bot.stats.hurt.push(e); res.final = fin; }
    const L = last || {};
    if (last) floors.push({floor: bot.floorNo, cleared: L.cleared, rooms: bot.rooms.length, route: bot.routeRooms.length, t: +L.t.toFixed(0)}); res.floors = floors;
    res.roomsCleared = floors.reduce((a, f) => a + (f.cleared || 0), 0); res.roomsTotal = floors.reduce((a, f) => a + f.rooms, 0);
    const rst = fin?.rstate || L.rstate || [];
    res.roomsVisited = rst.filter(x => x & 1).length;
    res.routeRooms = bot.routeRooms.length; res.routeCleared = bot.routeRooms.filter(i => (rst[i] || 0) & 2).length;
    res.routeVisited = bot.routeRooms.filter(i => (rst[i] || 0) & 1).length;
    res.kills = fin?.kills ?? L.kills ?? 0; res.gameSec = +(fin?.t ?? L.t ?? 0).toFixed(1); res.worldSec = +(fin?.st ?? L.st ?? 0).toFixed(1);
    res.scrapEarned = bot.stats.scrapEarned; res.scrapSpent = bot.stats.scrapSpent; res.scrapEnd = fin?.scrap ?? L.scrap ?? 0;
    res.starvationEvents = bot.stats.starve; res.dryEvents = bot.stats.dry;
    const dmg = {total: 0, armorAbsorbed: 0, byRole: {}, byEnemy: {}, byRoute: {route: 0, branch: 0}};
    for (const h of bot.stats.hurt) { if (h.armorOnly) { dmg.armorAbsorbed += h.dmg; continue; } dmg.total += h.dmg; dmg.byRole[h.role] = (dmg.byRole[h.role] || 0) + h.dmg; const en = h.enemy ? (ENEMY_TYPES[h.enemy]?.name || h.enemy) : h.how; dmg.byEnemy[en] = (dmg.byEnemy[en] || 0) + h.dmg; dmg.byRoute[h.branch ? 'branch' : 'route'] += h.dmg; }
    res.damage = dmg; res.hitsTaken = bot.stats.hurt.length;
    const killBy = {}; for (const k of bot.stats.kills) { const n = ENEMY_TYPES[k.enemy]?.name || k.enemy || '?'; killBy[n] = (killBy[n] || 0) + 1; } res.killsByEnemy = killBy;
    if (res.result === 'death') { const lastHit = [...bot.stats.hurt].reverse().find(h => !h.armorOnly) || bot.stats.hurt.at(-1); res.deathCause = lastHit ? (lastHit.enemy ? (ENEMY_TYPES[lastHit.enemy]?.name || lastHit.enemy) : lastHit.how) : 'unknown'; res.deathRoom = lastHit?.role; res.deathHow = lastHit?.how; }
    res.stuck = {count: bot.stuckCount, events: bot.stuckEvents}; res.openGateColliders = bot.gateTraps; res.trapped = bot.stats.trapped || false;
    res.throws = bot.stats.throws; res.cacheChoices = bot.stats.cacheChoices; res.merchantBuys = bot.stats.merchantBuys; res.gunSwaps = bot.stats.gunSwaps;
    res.stillFrac = +(bot.stats.stillTicks / Math.max(1, bot.stats.ticks)).toFixed(2); res.tasks = bot.stats.taskTicks;
    res.errors = [...errors].map(([m, n]) => ({m, n}));
    res.botErrors = bot.stats.errors.slice(0, 5);
    if (!res.reason) res.reason = res.result;
  } catch (e) {
    res.result = 'error'; res.reason = String(e && e.stack || e).split('\n').slice(0, 3).join(' | ');
    res.errors = [...errors].map(([m, n]) => ({m, n}));
  } finally { await context.close().catch(() => {}); }
  res.wallSec = +((Date.now() - startWall) / 1000).toFixed(1);
  return res;
}

// ───────────────────────────── summary ─────────────────────────────
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
function summarize(results, o) {
  const n = results.length, by = (f) => results.filter(f).length;
  const sum = {skill: o.skill, seeds: n, wins: by(r => r.result === 'win'), extracts: by(r => r.result === 'extract'), deaths: by(r => r.result === 'death'), timeouts: by(r => r.result === 'timeout'), stuckRuns: by(r => r.result === 'stuck'), errors: by(r => r.result === 'error')};
  sum.winRate = n ? +(sum.wins / n).toFixed(3) : 0;
  const ok = results.filter(r => r.result !== 'error');
  sum.medianRoomsCleared = median(ok.map(r => r.roomsCleared)); sum.medianRoomsVisited = median(ok.map(r => r.roomsVisited)); sum.medianRouteCleared = median(ok.map(r => r.routeCleared));
  sum.avgRoomsTotal = +mean(ok.map(r => r.roomsTotal)).toFixed(1); sum.avgRouteRooms = +mean(ok.map(r => r.routeRooms)).toFixed(1);
  sum.medianFloorReached = median(ok.map(r => r.floorReached || 1)); sum.floorReachedDist = {}; for (const r of ok) sum.floorReachedDist[r.floorReached || 1] = (sum.floorReachedDist[r.floorReached || 1] || 0) + 1;
  sum.deathsByFloor = {}; for (const r of results) if (r.result === 'death') sum.deathsByFloor[r.floorReached] = (sum.deathsByFloor[r.floorReached] || 0) + 1;
  sum.avgKills = +mean(ok.map(r => r.kills)).toFixed(1); sum.medianGameSec = median(ok.map(r => r.gameSec)); sum.medianWallSec = median(ok.map(r => r.wallSec));
  sum.medianGameSecWins = median(ok.filter(r => r.result === 'win').map(r => r.gameSec));
  sum.avgScrapEarned = +mean(ok.map(r => r.scrapEarned)).toFixed(0); sum.avgScrapSpent = +mean(ok.map(r => r.scrapSpent)).toFixed(0);
  sum.starvationRuns = by(r => r.starvationEvents > 0); sum.starvationEvents = ok.reduce((a, r) => a + (r.starvationEvents || 0), 0); sum.dryEvents = ok.reduce((a, r) => a + (r.dryEvents || 0), 0);
  const addMap = (key, sel) => { const m = {}; for (const r of ok) for (const [k, v] of Object.entries(sel(r) || {})) m[k] = (m[k] || 0) + v; return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / Math.max(1, ok.length)).toFixed(2)])); };
  sum.damagePerRunByEnemy = addMap('e', r => r.damage?.byEnemy); sum.damagePerRunByRoomRole = addMap('r', r => r.damage?.byRole);
  sum.avgDamagePerRun = +mean(ok.map(r => r.damage?.total || 0)).toFixed(2);
  sum.deathsByEnemy = {}; sum.deathsByRoom = {}; for (const r of results) if (r.result === 'death') { sum.deathsByEnemy[r.deathCause] = (sum.deathsByEnemy[r.deathCause] || 0) + 1; sum.deathsByRoom[r.deathRoom] = (sum.deathsByRoom[r.deathRoom] || 0) + 1; }
  sum.killsPerRunByEnemy = addMap('k', r => r.killsByEnemy);
  sum.stuckEventsTotal = ok.reduce((a, r) => a + (r.stuck?.count || 0), 0); sum.runsWithStuck = by(r => (r.stuck?.count || 0) > 0); sum.trappedRuns = by(r => r.trapped);
  sum.consoleErrorRuns = by(r => (r.errors || []).length > 0); sum.openGateColliderRuns = by(r => (r.openGateColliders || []).length > 0);
  sum.consoleErrors = {}; for (const r of ok) for (const e of r.errors || []) sum.consoleErrors[e.m] = (sum.consoleErrors[e.m] || 0) + e.n;
  return sum;
}
function table(results, sum) {
  const pad = (s, n) => String(s).padEnd(n), lines = [];
  lines.push(pad('seed', 9) + pad('result', 8) + pad('fl', 4) + pad('rooms', 8) + pad('route', 8) + pad('kills', 6) + pad('dmg', 6) + pad('game s', 8) + pad('wall s', 8) + pad('scrap+/-', 11) + pad('starve', 7) + pad('stuck', 6) + 'cause / note');
  for (const r of results) lines.push(pad(r.seed, 9) + pad(r.result, 8) + pad(r.floorReached ?? '-', 4) + pad(`${r.roomsCleared ?? '-'}/${r.roomsTotal ?? '-'}`, 8) + pad(`${r.routeCleared ?? '-'}/${r.routeRooms ?? '-'}`, 8) + pad(r.kills ?? '-', 6) + pad(r.damage?.total ?? '-', 6) + pad(r.gameSec ?? '-', 8) + pad(r.wallSec ?? '-', 8) + pad(`${r.scrapEarned ?? 0}/${r.scrapSpent ?? 0}`, 11) + pad(r.starvationEvents ?? 0, 7) + pad(r.stuck?.count ?? 0, 6) + (r.result === 'death' ? `${r.deathCause} (${r.deathRoom})` : r.result === 'error' ? r.reason.slice(0, 60) : (r.reason !== r.result ? r.reason : '') + (r.trapped ? ' TRAPPED' : '')));
  lines.push('');
  lines.push(`median floor reached ${sum.medianFloorReached} (dist ${JSON.stringify(sum.floorReachedDist)}), deaths by floor ${JSON.stringify(sum.deathsByFloor)}, extracts ${sum.extracts}`);
  lines.push(`skill ${sum.skill}: ${sum.wins}/${sum.seeds} wins (${(sum.winRate * 100).toFixed(0)}%), ${sum.deaths} deaths, ${sum.timeouts} timeouts, ${sum.stuckRuns} bot-stuck, ${sum.errors} errors`);
  lines.push(`median rooms cleared ${sum.medianRoomsCleared} / visited ${sum.medianRoomsVisited} (avg ${sum.avgRoomsTotal} total, ${sum.avgRouteRooms} on route; median route cleared ${sum.medianRouteCleared})`);
  lines.push(`avg kills ${sum.avgKills}, median game time ${sum.medianGameSec}s (wins ${sum.medianGameSecWins}s), median wall ${sum.medianWallSec}s, avg damage taken/run ${sum.avgDamagePerRun}`);
  lines.push(`scrap earned/spent per run ${sum.avgScrapEarned}/${sum.avgScrapSpent}; ammo starvation in ${sum.starvationRuns} runs (${sum.starvationEvents} events, ${sum.dryEvents} dry-active-gun events)`);
  lines.push('damage per run by source: ' + JSON.stringify(sum.damagePerRunByEnemy));
  lines.push('damage per run by room role: ' + JSON.stringify(sum.damagePerRunByRoomRole));
  lines.push('deaths by enemy: ' + JSON.stringify(sum.deathsByEnemy) + ' by room: ' + JSON.stringify(sum.deathsByRoom));
  lines.push(`bot stuck events ${sum.stuckEventsTotal} in ${sum.runsWithStuck} runs; trapped(game softlock suspects) ${sum.trappedRuns}; runs with console errors ${sum.consoleErrorRuns}; runs where a paid-for gate stayed solid ${sum.openGateColliderRuns}`);
  if (Object.keys(sum.consoleErrors).length) lines.push('console errors: ' + JSON.stringify(sum.consoleErrors));
  return lines.join('\n');
}

// ───────────────────────────── main ─────────────────────────────
async function main() {
  const o = parseArgs(process.argv.slice(2));
  const seeds = seedList(o);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.resolve(o.out || path.join('autoplay-out', `${stamp}-skill${o.skill}`));
  fs.mkdirSync(outDir, {recursive: true});
  const vendor = resolveVendor(o);
  const {chromium} = await loadPlaywright();
  const {server, port} = await serveRepo();
  console.log(`autoplay: ${seeds.length} seeds, skill ${o.skill}, workers ${o.workers}, speed ${o.speed}x, vendor ${vendor || '(network)'}, out ${outDir}`);
  const queue = [...seeds], results = [];
  const worker = async (id) => {
    while (queue.length) {
      const seed = queue.shift();
      let r, browser;
      try { browser = await chromium.launch({}); r = await playSeed(browser, seed, o, {port, vendor, outDir}); }
      catch (e) { r = {seed, skill: o.skill, result: 'error', reason: 'browser: ' + String(e.message).slice(0, 100), wallSec: 0}; }
      finally { await browser?.close().catch(() => {}); }
      results.push(r);
      console.log(`seed ${seed}: ${r.result} fl ${r.floorReached} rooms ${r.roomsCleared}/${r.roomsTotal} kills ${r.kills} dmg ${r.damage?.total ?? '-'} game ${r.gameSec}s wall ${r.wallSec}s stuck ${r.stuck?.count ?? 0}${r.deathCause ? ' killed by ' + r.deathCause : ''}${r.result === 'error' ? ' ' + r.reason : ''}`);
      fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({options: o, results}, null, 1));
    }
  };
  await Promise.all(Array.from({length: Math.min(o.workers, seeds.length)}, (_, i) => worker(i)));
  server.close();
  results.sort((a, b) => a.seed - b.seed);
  const sum = summarize(results, o);
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({options: o, summary: sum, results}, null, 1));
  const text = table(results, sum);
  fs.writeFileSync(path.join(outDir, 'summary.txt'), text + '\n');
  console.log('\n' + text + `\n\nwritten to ${outDir}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
