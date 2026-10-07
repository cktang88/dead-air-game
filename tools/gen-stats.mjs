// Usage: ROT_PATH=/path/to/rot-js.js node tools/gen-stats.mjs [seedCount]
// Generates many floors and reports layout stats + connectivity failures.
import {pathToFileURL} from 'node:url';
import {generateDungeon} from '../dungeon.js';

const ROT = await import(process.env.ROT_PATH ? pathToFileURL(process.env.ROT_PATH).href : 'rot-js');
const N = Number(process.argv[2]) || 200;
const walk = v => v === 0;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function analyze(d) {
  const {cells, rooms, width, height} = d, fails = [];
  const inRoom = (x, y) => rooms.some(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
  let floor = 0, corr = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (walk(cells[y][x])) { floor++; if (!inRoom(x, y)) corr++; }
  const s = rooms[0], seen = new Set([`${s.cx},${s.cy}`]), q = [[s.cx, s.cy]];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of DIRS) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k) && walk(cells[y + dy]?.[x + dx])) { seen.add(k); q.push([x + dx, y + dy]); }
    }
  }
  if (seen.size !== floor) fails.push(`unreachable floor ${floor - seen.size}`);
  for (const r of rooms) {
    if (!walk(cells[r.cy][r.cx])) fails.push(`blocked center room ${r.index}`);
    for (const c of r.crates || []) if (!walk(cells[c.y]?.[c.x])) fails.push('crate in wall');
    for (const c of r.cover || []) if (walk(cells[c.y]?.[c.x])) fails.push('cover not solid');
  }
  const cs = new Set();
  let longest = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!walk(cells[y][x]) || inRoom(x, y) || cs.has(`${x},${y}`)) continue;
    let n = 0;
    const st = [[x, y]];
    cs.add(`${x},${y}`);
    while (st.length) {
      const [a, b] = st.pop();
      n++;
      for (const [dx, dy] of DIRS) {
        const k = `${a + dx},${b + dy}`;
        if (!cs.has(k) && walk(cells[b + dy]?.[a + dx]) && !inRoom(a + dx, b + dy)) { cs.add(k); st.push([a + dx, b + dy]); }
      }
    }
    longest = Math.max(longest, n);
  }
  const areas = rooms.map(r => (r.x2 - r.x1 + 1) * (r.y2 - r.y1 + 1));
  const cover = rooms.map(r => (r.cover?.length || 0) + (r.crates?.length || 0));
  const dims = rooms.map(r => [r.x2 - r.x1 + 1, r.y2 - r.y1 + 1]);
  const open = rooms.map(r => { let n = 0; for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) if (walk(cells[y][x])) n++; return n; });
  return {fails, floor, corrShare: corr / floor, longest, areas, cover, dims, open};
}

const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
if (process.argv[1].endsWith('gen-stats.mjs')) {
  const agg = {rooms: [], corr: [], longest: [], avgArea: [], maxArea: [], minArea: [], cover: [], cov0: 0, minDim: [], openArea: [], openRatio: [], small: 0, tiny: 0, total: 0, wide: 0, tpl: {}, loops: 0};
  let bad = 0, err = 0;
  for (let i = 0; i < N; i++) {
    const seed = 1 + i * 3571;
    let d;
    try { d = generateDungeon(ROT, seed); } catch (e) { err++; console.log('seed', seed, 'ERROR', e.message); continue; }
    const a = analyze(d);
    if (a.fails.length) { bad++; console.log('seed', seed, 'FAIL', a.fails.slice(0, 3)); }
    agg.rooms.push(d.rooms.length); agg.corr.push(a.corrShare); agg.longest.push(a.longest);
    agg.avgArea.push(avg(a.areas)); agg.maxArea.push(Math.max(...a.areas)); agg.minArea.push(Math.min(...a.areas));
    agg.loops += d.loops;
    a.dims.forEach(([w, h], i) => { const m = Math.min(w, h); agg.minDim.push(m); agg.total++; if (m < 8) agg.small++; if (m < 7) agg.tiny++; if (w * h >= 200) agg.wide++; agg.openArea.push(a.open[i]); agg.openRatio.push(a.open[i] / a.areas[i]); });
    agg.cover.push(avg(a.cover)); agg.cov0 += a.cover.filter(c => c === 0).length;
    for (const r of d.rooms) if (r.template) agg.tpl[r.template] = (agg.tpl[r.template] || 0) + 1;
  }
  const f = x => x.toFixed(2);
  console.log(`seeds ${N} errors ${err} connectivity/validity failures ${bad}`);
  console.log(`rooms/floor ${f(avg(agg.rooms))} | corridor tile share ${f(avg(agg.corr))} | longest corridor comp ${f(avg(agg.longest))} (max ${Math.max(...agg.longest)})`);
  console.log(`room area avg ${f(avg(agg.avgArea))} min ${f(avg(agg.minArea))} max ${f(avg(agg.maxArea))} | cover/room ${f(avg(agg.cover))} | rooms with 0 cover ${agg.cov0}`);
  const T = 32, pct = (arr, q) => arr.slice().sort((x, y) => x - y)[Math.floor(arr.length * q)];
  console.log(`min room dimension (tiles) p10 ${pct(agg.minDim, .1)} p50 ${pct(agg.minDim, .5)} | rooms with min dim <8: ${f(100 * agg.small / agg.total)}% <7: ${f(100 * agg.tiny / agg.total)}% | area>=200 tiles: ${f(100 * agg.wide / agg.total)}%`);
  console.log(`open walkable tiles/room after cover p10 ${pct(agg.openArea, .1)} p50 ${pct(agg.openArea, .5)} p90 ${pct(agg.openArea, .9)} (${f(pct(agg.openArea, .1) * T * T / 1e4)}/${f(pct(agg.openArea, .5) * T * T / 1e4)} x10^4 px^2) | open ratio avg ${f(avg(agg.openRatio))} p10 ${f(pct(agg.openRatio, .1))}`);
  console.log(`extra loop connections/floor ${f(agg.loops / N)}`);
  console.log('templates', JSON.stringify(agg.tpl));
}
