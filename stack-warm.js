// Background pre-baking of the stacks a floor's enemies will need, so the first fight does not bake (stack2d.warmStack hands the
// buckets to the baking worker; nothing here blocks). warmEnemy(...) is idempotent and cheap: call it per enemy when a level starts
// and whenever a new one appears.
import {warmStack, warmAvailable, stackScale, STACK_CONFIG} from './stack2d.js';
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
const jobs = [];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function* warmGen(type, elite, variant, gun) {
  const step = STACK_CONFIG.prefetchStep, coarse = step * 2;
  const warm = function* (models, st) { for (const m of models) { warmStack(m, variant, st); yield; } };
  if (type === 'gunner' || type === 'player') {
    yield* warm(collectModels(kitFor(type)), step);
    if (gun) { yield* warm(collectModels(gunStack(gun, {enemy: type !== 'player'})), step); yield* warm(collectModels(gunStack(gun, {enemy: type !== 'player', noMag: true})), coarse); }
  } else if (type === 'guard' || type === 'sniper' || type === 'riot') {
    yield* warm(collectModels(heavyKit(type, elite)), step);
    if (type !== 'riot') yield* warm(collectModels(heavyGun(type, elite)), step);
    else {
      yield* warm(collectModels(riotShield(0, elite)), step);
      for (let c = 1; c <= 3; c++) yield* warm(collectModels(riotShield(c, elite)), coarse * 2);   // cracked shields (they appear as it takes hits)
      yield* warm(collectModels(riotBaton(elite)), coarse);
    }
  } else if (type === 'chaser') {
    const spec = elite ? ELITE_RUSHER_SPEC : RUSHER_SPEC;
    yield* warm(collectModels(rusherKit(spec)), step);
    for (const side of [-1, 1]) for (const p of BLADE_PITCHES) yield* warm([bladeModel(spec, side, p).model], coarse);
  } else if (type === 'brute') {
    const spec = elite ? ELITE_BRUTE_SPEC : BRUTE_SPEC;
    yield* warm(collectModels(bruteKit(spec)), step);
    for (const p of HAMMER_PITCHES) yield* warm(collectModels(hammerModel(spec, p)), coarse);
  } else if (type === 'boss') {
    yield* warm(collectModels(conductorKit(0)), step);
    for (const side of [-1, 1]) for (const p of TAIL_PITCHES) yield* warm(collectModels(tailModel(0, side, p)), coarse);
    for (const p of MAST_PITCHES) yield* warm(collectModels(mastModel(0, p)), coarse);
  }
}

/**
 * Queue the background bakes for one enemy kind (once per kind / variant / scale). `gun` = the render gun def for gunner / warden /
 * marksman. The work (building the kit, registering each model with the worker) is spread over frames by pumpWarm. Returns 1 if queued.
 */
export function warmEnemy(type, elite, variant, gun) {
  if (!warmAvailable()) return 0;
  const key = type + (elite ? '+' : '') + '|' + (variant ? variant.key : '') + '|' + stackScale();
  if (done.has(key)) return 0;
  done.add(key);
  jobs.push(warmGen(type, elite, variant, gun));
  return 1;
}
/** Runs queued warm-up work for at most budgetMs (call once per frame). Returns the number of jobs still waiting. */
export function pumpWarm(budgetMs = 1.5) {
  const t0 = now();
  while (jobs.length && now() - t0 < budgetMs) { if (jobs[0].next().done) jobs.shift(); }
  return jobs.length;
}
