// Door reward previews (Hades-style). Every room carries the reward it pays on clear; each doorway out of a cleared
// room shows an icon for what the room beyond it yields, so choosing a door is choosing a strategy.
// Pure: no DOM / physics. game.js spawns the reward and the overlay draws the markers.

export const REWARDS = {
  freq: {id: 'freq', label: 'FREQUENCY', color: '#9ad8ff', glyph: 'wave'},
  scrap: {id: 'scrap', label: 'SCRAP', color: '#f4c66d', glyph: 'hex'},
  gun: {id: 'gun', label: 'WEAPON', color: '#74c9ed', glyph: 'gun'},
  heal: {id: 'heal', label: 'MEDKIT', color: '#74dfab', glyph: 'cross'},
  supply: {id: 'supply', label: 'SUPPLY DROP', color: '#ffd27a', glyph: 'crate'},
  elite: {id: 'elite', label: 'ELITE · FREQUENCY', color: '#ff6a78', glyph: 'skull'},
};

const ORDINARY_WEIGHTS = [['freq', 34], ['scrap', 24], ['heal', 14], ['gun', 12], ['supply', 16]];
const ROLE_REWARD = {elite: 'elite', armory: 'gun', clinic: 'heal'};

function weightedPick(weights, rng) {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [kind, w] of weights) { roll -= w; if (roll < 0) return kind; }
  return weights[0][0];
}

// Set room.reward for every room except the entry, the extraction room and cache rooms (which have their own prize).
// Guarantees at least two frequency rooms per floor when enough ordinary rooms exist, and never three of the same
// reward in a row along the index order, so doors always present a real choice.
export function assignRoomRewards(rooms, rng = Math.random) {
  const ordinary = [];
  rooms.forEach((room, index) => {
    room.reward = null;
    if (index === 0 || index === rooms.length - 1 || room.role === 'cache' || room.role === 'extraction' || room.role === 'entry') return;
    if (ROLE_REWARD[room.role]) { room.reward = ROLE_REWARD[room.role]; return; }
    room.reward = weightedPick(ORDINARY_WEIGHTS, rng);
    ordinary.push(room);
  });
  const freqCount = () => rooms.filter(room => room.reward === 'freq' || room.reward === 'elite').length;
  for (const room of ordinary) { if (freqCount() >= Math.min(2, ordinary.length)) break; if (room.reward !== 'freq') room.reward = 'freq'; }
  // Break up runs of identical rewards.
  for (let i = 2; i < ordinary.length; i++) {
    if (ordinary[i].reward === ordinary[i - 1].reward && ordinary[i].reward === ordinary[i - 2].reward) {
      ordinary[i].reward = ORDINARY_WEIGHTS.map(([kind]) => kind).find(kind => kind !== ordinary[i].reward);
    }
  }
  return rooms.map(room => room.reward);
}

const inRect = (room, x, y, pad = 0) => x >= room.x1 - pad && x <= room.x2 + pad && y >= room.y1 - pad && y <= room.y2 + pad;

// For each door work out which rooms it joins. A door touching two rooms joins them directly; a corridor door
// touches one room and leads (by flood fill through floor cells) to the next. Returns [{index, from, to}] where
// from/to are room indices (to may be null when nothing was found).
export function computeDoorLinks({cells, rooms, doors}) {
  const floor = (x, y) => cells[y]?.[x] === 0;
  return doors.map((door, index) => {
    const touching = rooms.map((room, i) => ({room, i})).filter(({room}) => inRect(room, door.x, door.y, 1.6)).map(({i}) => i);
    if (!touching.length) return {index, from: null, to: null};
    if (touching.length >= 2) {
      // Pick the two nearest rooms by centre.
      const sorted = touching.sort((a, b) => Math.hypot(rooms[a].cx - door.x, rooms[a].cy - door.y) - Math.hypot(rooms[b].cx - door.x, rooms[b].cy - door.y));
      return {index, from: sorted[0], to: sorted[1]};
    }
    const home = touching[0], homeRoom = rooms[home];
    const seen = new Set(), queue = [];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) {
      const x = Math.floor(door.x) + dx, y = Math.floor(door.y) + dy;
      if (floor(x, y) && !inRect(homeRoom, x, y)) { queue.push([x, y]); seen.add(`${x},${y}`); }
    }
    let to = null;
    for (let head = 0; head < queue.length && head < 900 && to === null; head++) {
      const [x, y] = queue[head];
      for (let i = 0; i < rooms.length; i++) if (i !== home && inRect(rooms[i], x, y)) { to = i; break; }
      if (to !== null) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
        if (seen.has(key) || !floor(nx, ny) || inRect(homeRoom, nx, ny)) continue;
        seen.add(key); queue.push([nx, ny]);
      }
    }
    return {index, from: home, to};
  });
}

// Markers to draw: doors out of `currentRoom` (when it is cleared or the entry) whose far room still has a reward.
export function doorPreviews({rooms, doors, links, currentRoom}) {
  const here = rooms[currentRoom];
  if (!here || !(here.cleared || currentRoom === 0 || !here.hadEncounter)) return [];
  const markers = [], seenTargets = new Set();
  for (const link of links) {
    if (link.from === null || link.to === null) continue;
    const other = link.from === currentRoom ? link.to : link.to === currentRoom ? link.from : null;
    if (other === null || seenTargets.has(other)) continue;
    const target = rooms[other];
    if (!target || target.cleared || !target.reward || target.rewardTaken) continue;
    seenTargets.add(other);
    // One marker per destination, nudged into the room you are standing in so it never hides in the wall.
    const door = doors[link.index], dx = here.cx - door.x, dy = here.cy - door.y, len = Math.hypot(dx, dy) || 1;
    markers.push({x: door.x + .5 + dx / len * 1.3, y: door.y + .5 + dy / len * 1.3, room: other, reward: target.reward, info: REWARDS[target.reward], axis: door.axis});
  }
  return markers;
}
