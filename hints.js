// One-time contextual tutorial hints. Pure selection logic (`pickHint`) plus a tiny localStorage-backed seen set.
export const HINTS_KEY = 'dead-air.hints.v1';

/** id, priority (lower first), text builder given key labels. */
export const HINT_DEFS = Object.freeze([
  // MOVE / FIRE / STAND STILL / WALK vs SPRINT / EVERY SHOT are taught by the Signal Check (signal-check.js) and live in
  // the field manual (onboarding.js). What stays here is contextual: it only appears when the situation calls for it.
  {id: 'reload', text: k => `[${k.reload}] RELOAD`, when: c => c.magEmpty && c.reserve > 0},
  {id: 'swap', text: k => `[1] / [2] SWAP GUNS — THIS ONE IS DRY`, when: c => c.magEmpty && c.reserve <= 0 && c.otherHasAmmo},
  {id: 'grenade', text: k => `[${k.throwableCycle}] PICK GRENADE · [${k.throwableUse}] THROW`, when: c => c.hostilesNear > 0 && c.runTime > 20 && c.grenades > 0},
  {id: 'loadout', text: k => `[${k.loadout}] LOADOUT — SWAP ATTACHMENTS`, when: c => c.runTime > 12 && c.hasMod},
  {id: 'scrap', text: k => 'SCRAP BUYS GATES, GUNS & HEALS AT THE MARKET', when: c => c.scrap >= 25 && c.runTime > 30},
]);

/** Pick the next hint to show (or null). Never repeats a seen hint; one at a time. */
export function pickHint(ctx, keys) {
  if (ctx.blocked) return null;
  for (const h of HINT_DEFS) if (!ctx.seen.has(h.id) && h.when(ctx)) return {id: h.id, text: h.text(keys)};
  return null;
}

export function loadSeen(storage) {
  try { const raw = storage?.getItem(HINTS_KEY); const a = raw ? JSON.parse(raw) : []; return new Set(Array.isArray(a) ? a.filter(x => typeof x === 'string') : []); } catch { return new Set(); }
}
export function saveSeen(storage, seen) { try { storage?.setItem(HINTS_KEY, JSON.stringify([...seen])); } catch { /* storage unavailable */ } }
