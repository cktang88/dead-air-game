// Background pre-baking of the stacks a floor's enemies will need, so the first fight does not bake (stack2d.warmStack hands the
// buckets to the baking worker; nothing here blocks). warmEnemy(...) is idempotent and cheap: call it per enemy when a level starts
// and whenever a new one appears.
import {warmStack, stackScale, STACK_CONFIG} from './stack2d.js';
import {kitFor, gunStack} from './models2d.js';
import {heavyKit, heavyGun, riotShield, riotBaton} from './heavy-models2d.js';
import {rusherKit, bruteKit, RUSHER_SPEC, ELITE_RUSHER_SPEC, BRUTE_SPEC, ELITE_BRUTE_SPEC} from './creatures2d.js';
import {bladeModel, BLADE_PITCHES} from './creature-models.js';
import {hammerModel, HAMMER_PITCHES} from './brute-models.js';
import {conductorKit, tailModel, TAIL_PITCHES, mastModel, MAST_PITCHES} from './conductor-models.js';

const isModel = (o) => o && typeof o === 'object' && typeof o.id === 'string' && (o.grid || o.layers || o.slices);
/** Every stack model reachable from a kit / gun / any plain object (models are leaves; `_x` keys and functions are skipped). Pure. */
export function collectModels(root, out = [], seen = new Set(), depth = 0) {
  if (!root || typeof root !== 'object' || seen.has(root) || depth > 5) return out;
  seen.add(root);
  if (isModel(root)) { out.push(root); for (const k of ['parts']) if (root[k]) collectModels(root[k], out, seen, depth + 1); return out; }
  if (Array.isArray(root)) { for (const v of root) collectModels(v, out, seen, depth + 1); return out; }
  for (const k of Object.keys(root)) { if (k[0] === '_' || k === 'spec' || k === 'palette') continue; collectModels(root[k], out, seen, depth + 1); }
  return out;
}

const done = new Set();
function warmAll(models, variant, step) { let n = 0; for (const m of models) if (warmStack(m, variant, step)) n++; return n; }

/** Queue the background bakes for one enemy kind. `gun` = the render gun def for gunner / warden / marksman. Returns the number of models queued. */
export function warmEnemy(type, elite, variant, gun) {
  if (!STACK_CONFIG.enabled || !STACK_CONFIG.worker) return 0;
  const key = type + (elite ? '+' : '') + '|' + (variant ? variant.key : '') + '|' + stackScale();
  if (done.has(key)) return 0;
  done.add(key);
  const step = STACK_CONFIG.prefetchStep, coarse = step * 2;
  let n = 0;
  if (type === 'gunner' || type === 'player') {
    n += warmAll(collectModels(kitFor(type)), variant, step);
    if (gun) { n += warmAll(collectModels(gunStack(gun, {enemy: type !== 'player'})), variant, step); n += warmAll(collectModels(gunStack(gun, {enemy: type !== 'player', noMag: true})), variant, coarse); }
  } else if (type === 'guard' || type === 'sniper' || type === 'riot') {
    n += warmAll(collectModels(heavyKit(type, elite)), variant, step);
    if (type !== 'riot') n += warmAll(collectModels(heavyGun(type, elite)), variant, step);
    else { n += warmAll(collectModels(riotShield(0, elite)), variant, step); n += warmAll(collectModels(riotBaton(elite)), variant, coarse); }
  } else if (type === 'chaser') {
    const spec = elite ? ELITE_RUSHER_SPEC : RUSHER_SPEC;
    n += warmAll(collectModels(rusherKit(spec)), variant, step);
    for (const side of [-1, 1]) for (const p of BLADE_PITCHES) n += warmAll([bladeModel(spec, side, p).model], variant, coarse);
  } else if (type === 'brute') {
    const spec = elite ? ELITE_BRUTE_SPEC : BRUTE_SPEC;
    n += warmAll(collectModels(bruteKit(spec)), variant, step);
    for (const p of HAMMER_PITCHES) n += warmAll(collectModels(hammerModel(spec, p)), variant, coarse);
  } else if (type === 'boss') {
    n += warmAll(collectModels(conductorKit(0)), null, step);
    for (const side of [-1, 1]) for (const p of TAIL_PITCHES) n += warmAll(collectModels(tailModel(0, side, p)), null, coarse);
    for (const p of MAST_PITCHES) n += warmAll(collectModels(mastModel(0, p)), null, coarse);
  }
  return n;
}
