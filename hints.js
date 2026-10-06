// One-time contextual tutorial hints. Pure selection logic (`pickHint`) plus a tiny localStorage-backed seen set.
export const HINTS_KEY = 'dead-air.hints.v1';

/** id, priority (lower first), text builder given key labels. `urgent` hints may show mid-fight; the rest queue until the room is quiet.
 *  `done` names the action a hint teaches: once ctx.done has it, the hint is never shown. */
export const HINT_DEFS = Object.freeze([
  {id: 'basics', urgent: true, done: 'moved', text: k => `${(k.moveKeys || ['W', 'A', 'S', 'D']).map(x => `[${x}]`).join('')} MOVE · [CLICK] FIRE`, when: c => c.runTime > 0.3 && !c.moved},
  {id: 'still', text: k => 'STAND STILL — TIME ALL BUT STOPS', when: c => c.runTime > 1.5 && c.moved && c.stillFor > 0.6 && !c.moving},
  {id: 'move', done: 'sprinted', text: k => `WALK = SLOW TIME · [SHIFT] SPRINT = FULL SPEED, AND LOUD`, when: c => c.runTime > 4 && c.moving && c.seen.has('still')},
  {id: 'beat', text: k => 'EVERY SHOT LETS A BEAT OF TIME THROUGH', when: c => c.shots >= 1 && c.seen.has('still') && !c.moving},
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
