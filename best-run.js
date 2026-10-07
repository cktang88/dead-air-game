// Best-run record shown on the end screen. Pure comparison + tolerant storage helpers.
export const BEST_KEY = 'dead-air.best.v1';

const num = v => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

export function normalizeRun(run = {}) {
  return { won: !!run.won, rooms: num(run.rooms), kills: num(run.kills), seconds: num(run.seconds), coins: num(run.coins) };
}

/** True when `a` beats `b`: an extraction beats any death, then more rooms, more kills, then a faster clock. */
export function isBetterRun(a, b) {
  if (!b) return true;
  if (a.won !== b.won) return a.won;
  if (a.rooms !== b.rooms) return a.rooms > b.rooms;
  if (a.kills !== b.kills) return a.kills > b.kills;
  return a.won && a.seconds > 0 && a.seconds < b.seconds;
}

/** -> { best, isNew, previous }. `previous` is the stored record (or null on a first run). */
export function mergeBest(previous, run) {
  const next = normalizeRun(run), prev = previous ? normalizeRun(previous) : null;
  const isNew = isBetterRun(next, prev);
  return { best: isNew ? next : prev, isNew, previous: prev };
}

export function readBest(storage) {
  try { const raw = storage?.getItem(BEST_KEY); return raw ? normalizeRun(JSON.parse(raw)) : null; } catch { return null; }
}
export function writeBest(storage, best) {
  try { storage?.setItem(BEST_KEY, JSON.stringify(best)); return true; } catch { return false; }
}
