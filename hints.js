// One-time contextual tutorial hints. Pure selection logic (`pickHint`) plus a tiny localStorage-backed seen set.
export const HINTS_KEY = 'dead-air.hints.v1';

/** id, priority (lower first), text builder given key labels. `urgent` hints may show mid-fight; the rest queue until the room is quiet.
 *  `done` names the action a hint teaches: once ctx.done has it, the hint is never shown. */
export const HINT_DEFS = Object.freeze([
  // MOVE / FIRE / STAND STILL / WALK vs SPRINT / EVERY SHOT are taught by the Signal Check and live in the field manual.
  {id: 'reload', urgent: true, done: 'reloaded', text: k => `[${k.reload}] RELOAD`, when: c => c.magEmpty && c.reserve > 0},
  {id: 'swap', urgent: true, text: k => `[1] / [2] SWAP GUNS — THIS ONE IS DRY`, when: c => c.magEmpty && c.reserve <= 0 && c.otherHasAmmo},
  {id: 'grenade', done: 'threw', text: k => `[${k.throwableCycle}] PICK GRENADE · [${k.throwableUse}] THROW`, when: c => c.hostilesNear > 0 && c.runTime > 20 && c.grenades > 0},
  {id: 'loadout', done: 'loadout', text: k => `[${k.loadout}] LOADOUT — YOUR GUNS AND MODS`, when: c => c.runTime > 12 && c.hasMod},
  {id: 'scrap', text: k => 'SCRAP OPENS GATES AND TUNES SIGNALS AT SUPPLY DROPS', when: c => c.scrap >= 25 && c.runTime > 30},
]);

/** Pick the next hint to show (or null). Never repeats a seen hint; one at a time. */
export function pickHint(ctx, keys) {
  if (ctx.blocked) return null;
  const done = ctx.done || new Set();
  for (const h of HINT_DEFS) if (!ctx.seen.has(h.id) && !(h.done && done.has(h.done)) && !(ctx.inCombat && !h.urgent) && h.when(ctx)) return {id: h.id, text: h.text(keys)};
  return null;
}

export function loadSeen(storage) {
  try { const raw = storage?.getItem(HINTS_KEY); const a = raw ? JSON.parse(raw) : []; return new Set(Array.isArray(a) ? a.filter(x => typeof x === 'string') : []); } catch { return new Set(); }
}
export function saveSeen(storage, seen) { try { storage?.setItem(HINTS_KEY, JSON.stringify([...seen])); } catch { /* storage unavailable */ } }
