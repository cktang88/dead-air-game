// Room templates: hand-authored-feeling cover layouts stamped into generated rooms.
//
// stampRoomTemplates() runs once per floor, after rooms are sorted by route distance and roles are
// assigned. It mutates `cells` (hard cover becomes a solid wall tile, value 1, so physics, bullets,
// line of sight, minimap and grid navigation all see it for free) and decorates every room object:
//
//   room.template      template id used for the room (see TEMPLATE_NAMES)
//   room.cover         hard (indestructible) cover tiles  [{x, y, kind}]   kind: pillar|wall|rack|desk|server|bed
//   room.crates        destructible low cover tiles       [{x, y}]         spawn with spawnCrate((x+.5)*TILE,...)
//   room.openings      walkable perimeter tiles that connect to the outside [{x, y, side}]
//   room.entry         the opening on the shortest route from the start room (null for the start room)
//   room.spawnTiles    ordered enemy spawn candidates, far from the entry and not in the doorways [{x, y}]
//   room.rewardSpots   preferred pickup tiles (vault interior, between racks...) [{x, y}]
//   room.depth         0..1 distance along the route; room.pace = entry|warmup|rising|hot|breather|finale
//   room.theme         per-room look data for the renderer (never rendered here):
//       floor   'concrete'|'tile'|'metal'|'carpet'|'grate'|'wood'|'dirt'|'vault'|'hazard'  floor material id
//       tint    '#rrggbb' base floor tint     accent  '#rrggbb' trim / glow colour
//       lights  {color, intensity, flicker}   ambient lamp style
//       decor   [{kind, x, y, rot, ...}]      kind: vent|pipe|stain|blood|hazard|cable|light|crack|drain|paper|puddle
//               x/y are tile coordinates (fractions allowed). pipe/hazard/cable carry len/w/h/x2/y2 extras.
//
// Everything is deterministic for a given seed and uses its own PRNG, never the game's random().
import {seededRandom} from './floor-topology.js';

export const TEMPLATE_NAMES = ['pillar-grid', 'lane-walls', 'l-pairs', 'island-cross', 'arena-ring', 'desk-rows', 'shelf-aisles',
  'server-rows', 'clinic-beds', 'partitions', 'killbox-lanes', 'vault', 'warden-arena', 'landing', 'safehouse', 'scatter'];

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x, y) => `${x},${y}`;
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/* ---------- geometry helpers ---------- */

export function findOpenings(cells, room) {
  const openings = [];
  const side = (x, y, dx, dy, name) => {
    if (cells[y]?.[x] === 0 && cells[y + dy]?.[x + dx] === 0) openings.push({x, y, side: name});
  };
  for (let y = room.y1; y <= room.y2; y++) { side(room.x1, y, -1, 0, 'w'); side(room.x2, y, 1, 0, 'e'); }
  for (let x = room.x1; x <= room.x2; x++) { side(x, room.y1, 0, -1, 'n'); side(x, room.y2, 0, 1, 's'); }
  return openings;
}

function reachInRoom(cells, room, blocked, from) {
  const seen = new Set();
  if (cells[from.y]?.[from.x] !== 0 || blocked.has(key(from.x, from.y))) return seen;
  const queue = [from];
  seen.add(key(from.x, from.y));
  for (let head = 0; head < queue.length; head++) {
    const {x, y} = queue[head];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < room.x1 || nx > room.x2 || ny < room.y1 || ny > room.y2 || seen.has(k)) continue;
      if (cells[ny]?.[nx] !== 0 || blocked.has(k)) continue;
      seen.add(k);
      queue.push({x: nx, y: ny});
    }
  }
  return seen;
}

/* ---------- template library ---------- */
// Each template pushes items through ctx.hard(x, y, kind) / ctx.low(x, y). Coordinates are absolute tiles.

function stagger(ctx, step, rowOffset = 1) {
  const rows = [];
  for (let y = ctx.y1 + rowOffset; y <= ctx.y2 - 1; y += step) rows.push(y);
  return rows;
}

const TEMPLATES = {
  'pillar-grid': {min: [7, 7], build(c) {
    const step = c.w >= 15 ? 4 : 3, stag = c.rand() < .5;
    let row = 0;
    for (let y = c.y1 + 1; y <= c.y2 - 1; y += step, row++) {
      for (let x = c.x1 + 1 + (stag && row % 2 ? Math.floor(step / 2) : 0); x <= c.x2 - 1; x += step) c.hard(x, y, 'pillar');
    }
  }},
  'lane-walls': {min: [8, 7], build(c) {
    let row = 0;
    for (const y of stagger(c, 3)) {
      const seg = 3 + Math.floor(c.rand() * 3), gap = 2;
      for (let x = c.x1 + 1 + (row % 2 ? Math.floor((seg + gap) / 2) : 0); x <= c.x2 - 1; x += seg + gap) {
        for (let i = 0; i < seg && x + i <= c.x2 - 1; i++) c.hard(x + i, y, 'wall');
      }
      row++;
    }
  }},
  'l-pairs': {min: [7, 7], build(c) {
    // quadrant L-corners placed about a quarter of the way in, so big rooms get mid-floor cover too
    const ox = Math.max(2, Math.round(c.w * .27) + Math.floor(c.rand() * 2)), oy = Math.max(2, Math.round(c.h * .27) + Math.floor(c.rand() * 2));
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = c.cx - sx * ox, y = c.cy - sy * oy;
      c.hard(x, y, 'wall'); c.hard(x + sx, y, 'wall'); c.hard(x, y + sy, 'wall');
      if (c.w >= 12) c.hard(x + 2 * sx, y, 'wall');
      if (c.h >= 11) c.hard(x, y + 2 * sy, 'wall');
      c.low(x + 3 * sx, y + 1 * sy); c.low(x + 1 * sx, y + 3 * sy);
    }
  }},
  'island-cross': {min: [8, 8], build(c) {
    const r = 3;
    for (const [dx, dy] of DIRS) {
      const px = c.cx + dx * r, py = c.cy + dy * r;
      for (let i = -1; i <= 1; i++) c.hard(px + (dy ? i : 0), py + (dx ? i : 0), 'wall');
    }
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) c.low(c.cx + sx * 4, c.cy + sy * 4);
  }},
  'arena-ring': {min: [8, 8], build(c) {
    const r = 3;
    for (let a = -r; a <= r; a++) for (const [x, y] of [[c.cx + a, c.cy - r], [c.cx + a, c.cy + r], [c.cx - r, c.cy + a], [c.cx + r, c.cy + a]]) {
      if (Math.abs(a) <= 1) continue; // gaps at the four midpoints
      c.low(x, y);
    }
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) c.hard(c.cx + sx * 5, c.cy + sy * 4, 'pillar');
  }},
  'desk-rows': {min: [7, 6], build(c) {
    let row = 0;
    for (const y of stagger(c, 3)) {
      for (let x = c.x1 + 1 + (row % 2 ? 1 : 0); x + 1 <= c.x2 - 1; x += 4) { c.hard(x, y, 'desk'); c.hard(x + 1, y, 'desk'); }
      row++;
    }
    for (let i = 0; i < 3; i++) c.low(c.x1 + 1 + Math.floor(c.rand() * (c.w - 2)), c.y1 + 1 + Math.floor(c.rand() * (c.h - 2)));
  }},
  'shelf-aisles': {min: [7, 6], build(c) {
    for (let x = c.x1 + 1; x <= c.x2 - 1; x += 3) {
      const gapAt = c.y1 + 3 + Math.floor(c.rand() * Math.max(1, c.h - 6));
      for (let y = c.y1 + 1; y <= c.y2 - 1; y++) if (y !== gapAt && y !== gapAt + 1) c.hard(x, y, 'rack');
    }
  }},
  'server-rows': {min: [8, 6], build(c) {
    let row = 0;
    for (const y of stagger(c, 4)) {
      const gapAt = c.x1 + 3 + Math.floor(c.rand() * Math.max(1, c.w - 7));
      for (let x = c.x1 + 1; x <= c.x2 - 1; x++) if (x < gapAt || x > gapAt + 2) c.hard(x, y, 'server');
      row++;
    }
  }},
  'clinic-beds': {min: [7, 7], build(c) {
    for (let y = c.y1 + 2; y + 1 <= c.y2 - 2; y += 3) {
      c.hard(c.x1 + 2, y, 'bed'); c.hard(c.x1 + 2, y + 1, 'bed');
      c.hard(c.x2 - 2, y, 'bed'); c.hard(c.x2 - 2, y + 1, 'bed');
      c.low(c.x1 + 1, y); c.low(c.x2 - 1, y + 1);
    }
  }},
  partitions: {min: [10, 8], build(c) {
    const alongX = c.w >= c.h, span = alongX ? c.w : c.h, cross = alongX ? c.h : c.w;
    const centre = alongX ? c.cx : c.cy, base = alongX ? c.x1 : c.y1;
    let line = base + Math.round(span * (c.rand() < .5 ? .34 : .66));
    if (Math.abs(line - centre) < 3) line += line < centre ? -2 : 2;
    const lo = alongX ? c.y1 : c.x1, gap1 = lo + 2 + Math.floor(c.rand() * Math.max(1, cross - 5));
    for (let t = lo + 1; t < lo + cross - 1; t++) {
      if (t === gap1 || t === gap1 + 1) continue;
      if (cross >= 10 && (t === gap1 + 5 || t === gap1 + 6)) continue; // second gap on long walls
      if (alongX) c.hard(line, t, 'wall'); else c.hard(t, line, 'wall');
    }
    const side = line < centre ? 2 : -2;
    for (let i = 0; i < 3; i++) {
      const t = lo + 2 + Math.floor(c.rand() * (cross - 4)), s = line + side * (1 + Math.floor(c.rand() * 2));
      if (alongX) c.low(s, t); else c.low(t, s);
    }
  }},
  'killbox-lanes': {min: [8, 7], build(c) {
    let row = 0;
    for (const y of stagger(c, 3)) {
      const seg = 4 + Math.floor(c.rand() * 2), gap = 2;
      for (let x = c.x1 + 1 + (row % 2 ? 3 : 0); x <= c.x2 - 1; x += seg + gap) {
        for (let i = 0; i < seg && x + i <= c.x2 - 1; i++) c.hard(x + i, y, 'wall');
        if (c.rand() < .6) c.low(x + Math.floor(seg / 2), y + 1);
      }
      row++;
    }
  }},
  vault: {min: [7, 7], build(c) {
    // inner chamber: ring at Chebyshev 2 from the centre with one gap, posts in the corners
    const gapSide = DIRS[Math.floor(c.rand() * 4)];
    for (let a = -2; a <= 2; a++) for (const [dx, dy] of [[a, -2], [a, 2], [-2, a], [2, a]]) {
      const gapX = c.cx + gapSide[0] * 2, gapY = c.cy + gapSide[1] * 2;
      if (cheb(c.cx + dx, c.cy + dy, gapX, gapY) <= 0) continue;
      c.hard(c.cx + dx, c.cy + dy, 'wall');
    }
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) c.hard(sx > 0 ? c.x2 - 1 : c.x1 + 1, sy > 0 ? c.y2 - 1 : c.y1 + 1, 'pillar');
    c.rewards.push({x: c.cx, y: c.cy}, {x: c.cx + 1, y: c.cy}, {x: c.cx - 1, y: c.cy}, {x: c.cx, y: c.cy + 1}, {x: c.cx, y: c.cy - 1});
  }},
  'warden-arena': {min: [9, 8], build(c) {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      c.hard(c.cx + sx * 4, c.cy + sy * 3, 'pillar'); c.hard(c.cx + sx * 4, c.cy + sy * 3 + sy, 'pillar');
    }
    for (const [dx, dy] of DIRS) { c.low(c.cx + dx * 6, c.cy + dy * 4); c.low(c.cx + dx * 6 + dy, c.cy + dy * 4 + dx); }
  }},
  landing: {min: [6, 6], build(c) {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = sx > 0 ? c.x2 - 1 : c.x1 + 1, y = sy > 0 ? c.y2 - 1 : c.y1 + 1;
      c.hard(x, y, 'pillar'); c.low(x - sx, y); c.low(x, y - sy);
    }
    c.low(c.cx - 5, c.cy - 2); c.low(c.cx + 5, c.cy + 2);
  }},
  safehouse: {min: [6, 6], build(c) {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = sx > 0 ? c.x2 - 1 : c.x1 + 1, y = sy > 0 ? c.y2 - 1 : c.y1 + 1;
      c.low(x, y); if (c.rand() < .6) c.low(x - sx, y);
    }
    c.hard(c.cx - 4, c.cy - 3, 'wall'); c.hard(c.cx - 3, c.cy - 3, 'wall'); c.hard(c.cx + 4, c.cy + 3, 'wall'); c.hard(c.cx + 3, c.cy + 3, 'wall');
  }},
  scatter: {min: [1, 1], build(c) {
    const n = Math.max(2, Math.round(c.w * c.h / 28));
    for (let i = 0; i < n; i++) {
      const x = c.x1 + 1 + Math.floor(c.rand() * (c.w - 2)), y = c.y1 + 1 + Math.floor(c.rand() * (c.h - 2));
      if (i % 3 === 0 && c.w >= 6 && c.h >= 6) { c.hard(x, y, 'pillar'); } else c.low(x, y);
    }
  }},
};

const THEMES = {
  entry: {floor: 'concrete', tint: '#2b2a33', accent: '#62e1ad'},
  extraction: {floor: 'metal', tint: '#232a2b', accent: '#79d6ae'},
  cache: {floor: 'vault', tint: '#241f26', accent: '#e8c46b'},
  armory: {floor: 'metal', tint: '#2a2824', accent: '#eaaa66'},
  clinic: {floor: 'tile', tint: '#34393f', accent: '#8fe3c8'},
  hazard: {floor: 'hazard', tint: '#2b2226', accent: '#ff5367'},
  elite: {floor: 'carpet', tint: '#2d1f27', accent: '#c43d52'},
  merchant: {floor: 'wood', tint: '#2f2824', accent: '#ffc46b'},
};
const COMBAT_LOOKS = {
  'desk-rows': {floor: 'carpet', tint: '#272a35', accent: '#6fa8dc'},
  'shelf-aisles': {floor: 'concrete', tint: '#2a2825', accent: '#eaaa66'},
  'server-rows': {floor: 'grate', tint: '#1f2830', accent: '#5ad0e6'},
  partitions: {floor: 'wood', tint: '#2d2924', accent: '#d49a6a'},
  'pillar-grid': {floor: 'concrete', tint: '#2a2a31', accent: '#a888e8'},
  'lane-walls': {floor: 'grate', tint: '#262830', accent: '#ff8c5a'},
  'l-pairs': {floor: 'tile', tint: '#2b2c33', accent: '#79d6ae'},
  'island-cross': {floor: 'concrete', tint: '#2c2a30', accent: '#e8c46b'},
  'arena-ring': {floor: 'dirt', tint: '#2b2622', accent: '#ff5367'},
  scatter: {floor: 'dirt', tint: '#2a2825', accent: '#9aa0b8'},
};

/* ---------- stamping ---------- */

function roleCandidates(room, area, breather) {
  const small = area < 80, large = area >= 160;
  switch (room.role) {
    case 'entry': return ['safehouse'];
    case 'extraction': return ['landing'];
    case 'cache': return ['vault', 'scatter'];
    case 'armory': return ['shelf-aisles', 'server-rows', 'scatter'];
    case 'clinic': return ['clinic-beds', 'scatter'];
    case 'hazard': return ['killbox-lanes', 'pillar-grid', 'l-pairs', 'scatter'];
    case 'elite': return ['warden-arena', 'arena-ring', 'pillar-grid', 'scatter'];
    default:
      if (breather) return ['scatter', 'l-pairs'];
      if (small) return ['l-pairs', 'scatter', 'island-cross'];
      if (large) return ['pillar-grid', 'partitions', 'desk-rows', 'server-rows', 'shelf-aisles', 'arena-ring', 'lane-walls', 'killbox-lanes'];
      return ['l-pairs', 'island-cross', 'desk-rows', 'server-rows', 'lane-walls', 'partitions', 'shelf-aisles', 'arena-ring'];
  }
}

function pickTemplate(room, w, h, rand, usage, breather) {
  const area = w * h;
  const options = roleCandidates(room, area, breather).filter(name => w >= TEMPLATES[name].min[0] && h >= TEMPLATES[name].min[1]);
  if (!options.length) return 'scatter';
  const least = Math.min(...options.map(name => usage[name] || 0));
  const fresh = options.filter(name => (usage[name] || 0) === least);
  return fresh[Math.floor(rand() * fresh.length)];
}

function protectedZone(room, openings, radius) {
  const zone = new Set();
  for (const o of openings) {
    for (let y = o.y - 2; y <= o.y + 2; y++) for (let x = o.x - 2; x <= o.x + 2; x++) zone.add(key(x, y));
  }
  for (let y = room.cy - radius; y <= room.cy + radius; y++) for (let x = room.cx - radius; x <= room.cx + radius; x++) zone.add(key(x, y));
  return zone;
}

function stampRoom(cells, room, seed, ctxExtra) {
  const rand = seededRandom(Math.imul(seed + 7, 2654435761) ^ Math.imul(room.index + 1, 40503));
  const w = room.x2 - room.x1 + 1, h = room.y2 - room.y1 + 1;
  const openings = findOpenings(cells, room);
  const centerRadius = room.role === 'entry' || room.role === 'extraction' ? (Math.min(w, h) >= 11 ? 3 : Math.min(w, h) >= 8 ? 2 : 1) : 1;
  const zone = protectedZone(room, openings, centerRadius);
  const name = pickTemplate(room, w, h, rand, ctxExtra.usage, room.breather);
  ctxExtra.usage[name] = (ctxExtra.usage[name] || 0) + 1;

  const hardItems = [], lowItems = [], rewards = [];
  const c = {x1: room.x1, x2: room.x2, y1: room.y1, y2: room.y2, w, h, cx: room.cx, cy: room.cy, rand, rewards,
    hard: (x, y, kind) => hardItems.push({x, y, kind}), low: (x, y) => lowItems.push({x, y})};
  const build = (templateName) => TEMPLATES[templateName].build(c);
  build(name);
  let secondary = null;
  if (w * h >= 150 && ['vault', 'l-pairs', 'island-cross', 'arena-ring', 'landing', 'warden-arena', 'safehouse', 'clinic-beds', 'scatter'].includes(name)) {
    const extra = ['pillar-grid', 'lane-walls', 'partitions'].filter(n => w >= TEMPLATES[n].min[0] && h >= TEMPLATES[n].min[1]);
    if (extra.length) { secondary = extra[Math.floor(rand() * extra.length)]; build(secondary); }
  }

  const blocked = new Set();
  const placedHard = [], placedLow = [];
  let reach = reachInRoom(cells, room, blocked, {x: room.cx, y: room.cy});
  const inner = openings.map(o => key(o.x, o.y)).filter(k => reach.has(k));
  const place = (x, y, solid, relaxed = false) => {
    const k = key(x, y);
    if (!reach.has(k) || blocked.has(k)) return false;
    const inZone = relaxed
      ? cheb(x, y, room.cx, room.cy) <= centerRadius || openings.some(o => cheb(o.x, o.y, x, y) <= 1)
      : zone.has(k);
    if (inZone) return false;
    blocked.add(k);
    const after = reachInRoom(cells, room, blocked, {x: room.cx, y: room.cy});
    if (after.size !== reach.size - 1 || !inner.every(i => after.has(i))) { blocked.delete(k); return false; }
    reach = after;
    if (solid) placedHard.push({x, y});
    return true;
  };

  const hardOut = [];
  for (const item of hardItems) if (place(item.x, item.y, true)) hardOut.push(item);
  // apply hard tiles to the grid before testing crates so reachability stays consistent
  for (const {x, y} of hardOut) cells[y][x] = 1;
  for (const {x, y} of hardOut) blocked.delete(key(x, y));
  reach = reachInRoom(cells, room, blocked, {x: room.cx, y: room.cy});
  const crates = [], crateKeys = new Set();
  const tryCrate = (x, y, relaxed) => {
    if (crateKeys.has(key(x, y))) return false;
    if (place(x, y, false, relaxed)) { crates.push({x, y}); crateKeys.add(key(x, y)); return true; }
    return false;
  };
  for (const item of lowItems) tryCrate(item.x, item.y, false);

  // top up low cover: aim for a per-role density, preferring tiles next to hard cover (cover pairs)
  const density = {entry: 34, extraction: 34, cache: 45, hazard: 18, elite: 24, armory: 34, clinic: 40}[room.role] ?? (room.breather ? 55 : 28);
  const wanted = Math.max(2, Math.min(9, Math.round(w * h / density)));
  const hardKeys = new Set(hardOut.map(i => key(i.x, i.y)));
  for (let attempt = 0; attempt < 80 && crates.length < wanted; attempt++) {
    const x = room.x1 + 1 + Math.floor(rand() * (w - 1)), y = room.y1 + 1 + Math.floor(rand() * (h - 1));
    const nearHard = DIRS.some(([dx, dy]) => hardKeys.has(key(x + dx, y + dy)));
    if (!nearHard && attempt < 40 && hardKeys.size) continue;
    if (crates.some(cr => cheb(cr.x, cr.y, x, y) <= 1)) continue;
    tryCrate(x, y, false);
  }
  // door cover: a short sandbag pair a few tiles in front of every opening cluster
  const clusters = [];
  for (const o of openings) if (!clusters.some(cl => cheb(cl.x, cl.y, o.x, o.y) <= 2)) clusters.push(o);
  const dirOf = {n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0]};
  const coverTiles = () => [...hardOut, ...crates];
  for (const o of clusters) {
    if (coverTiles().some(t => cheb(t.x, t.y, o.x, o.y) <= 5 && cheb(t.x, t.y, o.x, o.y) >= 3)) continue;
    const [dx, dy] = dirOf[o.side], px = dy ? 1 : 0, py = dx ? 1 : 0;
    for (const [depth, off] of [[3, 2], [3, -2], [4, 3], [4, -3], [3, 3], [3, -3], [4, 0], [5, 2], [5, -2], [4, 2], [4, -2]]) {
      if (tryCrate(o.x + dx * depth + px * off, o.y + dy * depth + py * off, true)) {
        if (crates.filter(cr => cheb(cr.x, cr.y, o.x, o.y) <= 5).length >= 2) break;
      }
    }
  }
  if (!crates.length) for (let y = room.y1; y <= room.y2 && !crates.length; y++) for (let x = room.x1; x <= room.x2 && !crates.length; x++) tryCrate(x, y, true);

  Object.assign(room, {
    template: name, template2: secondary, openings, cover: hardOut.map(({x, y, kind}) => ({x, y, kind})), crates,
    rewardSpots: rewards.filter(p => cells[p.y]?.[p.x] === 0 && !crateKeys.has(key(p.x, p.y))),
  });
  return {zone, rand};
}

/* ---------- theme / decor ---------- */

function decorate(cells, room, rand, pace) {
  const base = THEMES[room.role] || COMBAT_LOOKS[room.template] || COMBAT_LOOKS.scatter;
  const theme = {floor: base.floor, tint: base.tint, accent: base.accent,
    lights: {color: base.accent, intensity: room.role === 'hazard' ? .9 : room.role === 'cache' ? .5 : room.breather ? .45 : .65, flicker: room.role === 'hazard' || room.role === 'elite' || rand() < .15},
    decor: []};
  const used = new Set([...room.cover, ...room.crates].map(t => key(t.x, t.y)));
  const free = [];
  for (let y = room.y1; y <= room.y2; y++) for (let x = room.x1; x <= room.x2; x++) if (cells[y][x] === 0 && !used.has(key(x, y))) free.push({x, y});
  const edge = free.filter(p => cells[p.y - 1]?.[p.x] === 1 && p.y === room.y1);
  const at = list => list.length ? list[Math.floor(rand() * list.length)] : null;
  const add = (kind, p, extra = {}) => { if (p) theme.decor.push({kind, x: p.x + .5, y: p.y + .5, rot: Math.floor(rand() * 4), ...extra}); };
  const w = room.x2 - room.x1 + 1;
  // lights on a coarse grid
  for (let y = room.y1 + 2; y < room.y2; y += 5) for (let x = room.x1 + 2; x < room.x2; x += 6) {
    if (cells[y]?.[x] === 0) theme.decor.push({kind: 'light', x: x + .5, y: y + .5, rot: 0, color: theme.accent, flicker: theme.lights.flicker && rand() < .5});
  }
  const sizeMul = Math.max(1, Math.round(free.length / 90));
  for (let i = 0; i < sizeMul; i++) add('vent', at(edge), {side: 'n'});
  if (edge.length > 4 && room.role !== 'cache') {
    const a = at(edge), len = Math.min(w - 2, 3 + Math.floor(rand() * 5));
    if (a) theme.decor.push({kind: 'pipe', x: a.x + .5, y: room.y1 + .1, rot: 0, len, axis: 'x'});
  }
  const messy = room.role === 'hazard' || room.role === 'elite' || pace === 'hot';
  for (let i = 0; i < 2 + sizeMul; i++) add(rand() < (messy ? .6 : .2) ? 'blood' : 'stain', at(free), {size: .6 + rand() * .8});
  if (rand() < .4) add('crack', at(free), {size: .8 + rand()});
  if (room.template === 'server-rows' || room.role === 'armory') for (let i = 0; i < 2; i++) {
    const a = at(free), b = at(free);
    if (a && b) theme.decor.push({kind: 'cable', x: a.x + .5, y: a.y + .5, x2: b.x + .5, y2: b.y + .5, rot: 0});
  }
  if (room.template === 'desk-rows') for (let i = 0; i < 4; i++) add('paper', at(free), {size: .4});
  if (room.role === 'hazard' || room.role === 'extraction') {
    theme.decor.push({kind: 'hazard', x: room.cx + .5 - 3, y: room.cy + .5 - 3, rot: 0, w: 7, h: 7, ring: true});
  }
  if (room.role === 'clinic' || room.role === 'extraction') add('drain', at(free));
  if (room.template === 'arena-ring' || room.role === 'elite') add('puddle', at(free), {size: 1.2});
  room.theme = theme;
}

/* ---------- pacing ---------- */

function assignPacing(rooms) {
  const last = rooms.length - 1;
  rooms.forEach((room, i) => { room.depth = last ? i / last : 0; });
  // one breather: an ordinary combat room around the middle of the route, preferring a spur
  const mid = rooms.map((r, i) => ({r, i})).filter(({r, i}) => r.role === 'combat' && i >= Math.ceil(last * .35) && i <= Math.floor(last * .7));
  const pool = mid.filter(({r}) => !r.branch);
  const choice = (pool.length ? pool : mid)[0];
  if (choice && last >= 6) choice.r.breather = true;
  rooms.forEach((room, i) => {
    room.pace = i === 0 ? 'entry' : i === last ? 'finale' : room.breather ? 'breather' : i <= 2 ? 'warmup' : room.depth > .7 ? 'hot' : 'rising';
  });
}

// Pacing-aware enemy budget: breathers are light, the extraction finale is heavy.
export function paceEnemyCount(room, count) {
  if (room.pace === 'breather') return Math.min(count, 1);
  if (room.pace === 'finale') return Math.min(5, count + 1);
  return count;
}

/* ---------- spawns ---------- */

function bfsDistances(cells, from) {
  const dist = new Map([[key(from.x, from.y), 0]]), queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const {x, y} = queue[head], d = dist.get(key(x, y));
    for (const [dx, dy] of DIRS) {
      const k = key(x + dx, y + dy);
      if (!dist.has(k) && cells[y + dy]?.[x + dx] === 0) { dist.set(k, d + 1); queue.push({x: x + dx, y: y + dy}); }
    }
  }
  return dist;
}

function planSpawns(cells, room, startDist, rand, zone) {
  const entryOpening = room.openings.length ? room.openings.reduce((best, o) => (startDist.get(key(o.x, o.y)) ?? 1e9) < (startDist.get(key(best.x, best.y)) ?? 1e9) ? o : best) : null;
  room.entry = entryOpening && room.index !== undefined && room.pace !== 'entry' ? {x: entryOpening.x, y: entryOpening.y, side: entryOpening.side} : null;
  if (!room.entry) { room.spawnTiles = []; return; }
  const local = new Map([[key(room.entry.x, room.entry.y), 0]]), queue = [room.entry];
  for (let head = 0; head < queue.length; head++) {
    const {x, y} = queue[head], d = local.get(key(x, y));
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < room.x1 || nx > room.x2 || ny < room.y1 || ny > room.y2 || local.has(k) || cells[ny]?.[nx] !== 0) continue;
      local.set(k, d + 1); queue.push({x: nx, y: ny});
    }
  }
  const maxD = Math.max(...local.values());
  const minD = Math.min(7, Math.max(3, Math.floor(maxD * .5)));
  const crateKeys = new Set(room.crates.map(t => key(t.x, t.y)));
  const coverKeys = new Set([...room.cover.map(t => key(t.x, t.y)), ...crateKeys]);
  const candidates = [];
  for (const [k, d] of local) {
    if (d < minD || zone.has(k)) continue;
    const [x, y] = k.split(',').map(Number);
    if (crateKeys.has(k)) continue;
    let near = 0;
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (coverKeys.has(key(xx, yy))) near = 1;
    candidates.push({x, y, score: d + near * 4 + rand() * 3});
  }
  candidates.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const cand of candidates) {
    if (picked.length >= 28) break;
    if (picked.every(p => cheb(p.x, p.y, cand.x, cand.y) >= 2)) picked.push({x: cand.x, y: cand.y});
  }
  room.spawnTiles = picked;
}

/* ---------- public entry point ---------- */

export function stampRoomTemplates({cells, rooms, start, seed = 0}) {
  assignPacing(rooms);
  const usage = {}, zones = new Map(), rands = new Map();
  for (const room of rooms) {
    const {zone, rand} = stampRoom(cells, room, seed, {usage});
    zones.set(room, zone); rands.set(room, rand);
  }
  const dist = bfsDistances(cells, {x: start.cx ?? rooms[0].cx, y: start.cy ?? rooms[0].cy});
  for (const room of rooms) {
    planSpawns(cells, room, dist, rands.get(room), zones.get(room));
    decorate(cells, room, rands.get(room), room.pace);
  }
  return rooms;
}
