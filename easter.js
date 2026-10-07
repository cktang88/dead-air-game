// Easter eggs and cosmetics. Pure rules + a tiny persisted store; no DOM, no clocks. Everything here is atmospheric:
// the hats and the screen modes change how DEAD AIR looks, never how it plays.
//
//   * code matcher       Konami-style key sequences typed on the title screen (VHS mode, big-head mode)
//   * hats               cosmetic head wear for the player model, found in secret rooms
//   * cosmetics store    which hats are owned / worn, which screen modes are on (localStorage, optional)

export const COSMETICS_KEY = 'dead-air.cosmetics.v1';

// ------------------------------------------------------------------ key codes
export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
export const BIGHEAD = ['KeyB', 'KeyI', 'KeyG', 'KeyH', 'KeyE', 'KeyA', 'KeyD'];
export const CODES = [
  {id: 'vhs', sequence: KONAMI, name: 'VHS MODE', on: 'TRACKING FOUND · VHS MODE ON', off: 'TRACKING LOST · VHS MODE OFF'},
  {id: 'bighead', sequence: BIGHEAD, name: 'BIG HEAD MODE', on: 'SKULL SIZE UP · BIG HEAD MODE ON', off: 'SKULL SIZE NORMAL · BIG HEAD MODE OFF'},
];

/** Feeds key codes one at a time; `push(code)` returns the id of a code that just completed (or null). Pure state machine. */
export function createCodeMatcher(codes = CODES) {
  const idx = codes.map(() => 0);
  return {
    push(code) {
      let done = null;
      codes.forEach((c, i) => {
        const seq = c.sequence;
        if (code === seq[idx[i]]) idx[i] += 1;
        else idx[i] = code === seq[0] ? 1 : 0;   // a wrong key restarts, but may itself be the first key
        if (idx[i] >= seq.length) { idx[i] = 0; done = c.id; }
      });
      return done;
    },
    reset() { idx.fill(0); },
    progress() { return idx.slice(); },
  };
}
export const codeById = (id) => CODES.find((c) => c.id === id) || null;

// ------------------------------------------------------------------ hats
export const HATS = [
  {id: 'headphones', name: 'BROADCAST CANS', blurb: 'Studio headphones. Somebody was on air.'},
  {id: 'tophat', name: 'MASTER OF CEREMONIES', blurb: 'A top hat. The show must go on.'},
  {id: 'cone', name: 'PARTY HAT', blurb: 'The last good night at the station.'},
  {id: 'crown', name: 'SIGNAL CROWN', blurb: 'Three little antennas, all blinking.'},
];
export const HAT_BY_ID = new Map(HATS.map((h) => [h.id, h]));

/** Deterministic hat for a secret room: same seed + floor always hides the same one. */
export function hatFor(seed, floor = 1) {
  let h = (Math.imul((seed | 0) ^ 0x9e3779b1, 2654435761) ^ Math.imul(floor | 0, 40503)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return HATS[h % HATS.length].id;
}

// ------------------------------------------------------------------ cosmetics store
export const emptyCosmetics = () => ({hats: [], hat: '', vhs: false, bighead: false});

export function parseCosmetics(raw) {
  const base = emptyCosmetics();
  if (!raw) return base;
  let data;
  try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return base; }
  if (!data || typeof data !== 'object') return base;
  const hats = Array.isArray(data.hats) ? [...new Set(data.hats.filter((id) => HAT_BY_ID.has(id)))] : [];
  return {hats, hat: hats.includes(data.hat) ? data.hat : '', vhs: !!data.vhs, bighead: !!data.bighead};
}
export function unlockHat(c, id) {
  if (!HAT_BY_ID.has(id)) return {cosmetics: c, isNew: false};
  if (c.hats.includes(id)) return {cosmetics: {...c, hat: id}, isNew: false};   // finding it again re-equips it
  return {cosmetics: {...c, hats: [...c.hats, id], hat: id}, isNew: true};
}
/** Cycle the worn hat through none -> each owned hat -> none. */
export function cycleHat(c) {
  const order = ['', ...c.hats], i = order.indexOf(c.hat);
  return {...c, hat: order[(i + 1) % order.length]};
}
export function toggleMode(c, id) { return id === 'vhs' || id === 'bighead' ? {...c, [id]: !c[id]} : c; }

export function loadCosmetics(storage) {
  try { return parseCosmetics(storage?.getItem(COSMETICS_KEY)); } catch { return emptyCosmetics(); }
}
export function saveCosmetics(storage, c) {
  try { storage?.setItem(COSMETICS_KEY, JSON.stringify(c)); return true; } catch { return false; }
}
