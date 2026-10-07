# Sprite stacking (2.5D) in DEAD AIR

Everything volumetric in the Canvas2D renderer is a **stack**: a pile of 2D horizontal slices (voxel layers), each
lifted `STACK_TILT` px per world unit of height and rotated by the object's facing. The camera never rotates, so
the lift is always screen-up: that one constant is the whole "slight camera tilt", and every stack in the game
shares it so actors, props and walls can sit together.

Files

| file | what |
| --- | --- |
| `stack2d.js` | the engine: `VoxelGrid`, `drawStack`, baking, cache, variants, contact shadow |
| `rig2d.js` | part rig + pose functions (`humanoidPose`, `drawRig`, `solveElbow`, idle fidget hooks) |
| `models2d.js` | the humanoid kit from a colour/style spec (`PLAYER_SPEC`, `GUNNER_SPEC`) and `gunStack(gun)` |
| `actor-stack2d.js` | renderer glue: `isStacked(kind)`, baked flat corpses, `floorStackVariant` |
| `tools/stack-sheet.html` | contact sheet page (see "Looking at it") |
| `stack2d.test.js` | tests for the pure parts |

## How it renders

1. A model's slices are baked once to canvases at a quantised device scale (`stackScale()`, levels 1/1.5/2/2.75/3.75/5 with hysteresis so a
   zoom breath never re-bakes).
2. The first time a yaw bucket (default 48, guns 64) is needed, every slice is rotated about the pivot, offset up by
   `k * layerH * STACK_TILT * px`, **edge-lit** on its upper-left rim and **edge-shaded** on its lower-right rim (light = `LIGHT` in
   `sprites2d.js`, from the upper left), then an ink outline is stamped around the composite. Lower slices are
   darker (`layerShade`: 0.72 at the floor to 1.0 at the top) and cells with nothing above them get a lighter top.
3. Per frame a part costs **one `drawImage`** (two while flashing). Lazy bakes are budgeted (`STACK_CONFIG.bakeBudgetMs`, 2.5 ms/frame): over budget
   the nearest already-baked angle is reused instead of hitching. The cache is capped (`STACK_CONFIG.cacheBytes`, 56 MB, LRU by model/variant).
4. Call `beginStackFrame()` once per frame before drawing (render2d does).

Switch: `STACK_CONFIG.enabled` (or `?stack=0` in the URL) turns all stacked actors back into the legacy sprites;
`STACK_CONFIG.kinds` lists which actor kinds are converted (`player`, `gunner`).

## Units, axes, conventions

* World units are px at zoom 1 (the tile is 32). Cells are `unit` world units; bodies use `unit = layerH = 0.8`, guns `0.6`.
* Axes: **+x = the model's front** (yaw 0 faces screen-right), **+y = its right-hand side** (screen-down at yaw 0), **z = up**. Yaw is screen radians, clockwise positive.
* Pivot = the cell coordinate that rotates (0,0 is the grid's top-left corner). Put it on the joint (hip for legs, neck for the head, shoulder for an arm, the stock end for a gun).
* A drawn stack's `(x, y)` is the **ground point under the pivot**; `z` (world units of height) lifts it. Screen y = `y - z * STACK_TILT`.
* `RIG.anchorZ` (9.4) is the **simulation plane**: the height of the gun's receiver. Actors are drawn with that plane on `(e.x, e.y)`, so
  bullets, aim lines, hit tests and the muzzle (`gunMuzzle(gun)`) stay exactly where they were and the feet hang `anchorZ * STACK_TILT` px below.
  Shadows for stacked actors are drawn at `y + feetDrop()`.
* Silhouette budget: a humanoid is about 24 units tall, 16 wide. Anything smaller than 1 cell vanishes at gameplay zoom (about 2 device px per unit).
* Outline is the single ink `INK_OUTLINE` (`#120f18`), about 0.6 world units. Do not draw your own outlines in slices.
* Colours: use the palette; never bake lighting in. Mid-tone bases (shading multiplies them down to 72%), accents saturated. Lens / LED cells use `{c, emit: true}` so they ignore shading.

## Model format

```js
{
  id: 'thing.part',            // unique; part of the cache key (bake variants share it)
  unit: 0.8, layerH: 0.8,      // world units per cell / per layer
  pivot: {x, y},               // cells
  palette: {a: '#hex', L: {c: '#7fe8ff', emit: true}},
  buckets: 48,                 // yaw buckets: 32 for tiny/slow parts, 64 for fast-aimed ones (guns)
  // pick ONE of:
  grid: VoxelGrid,                         // built in code (recommended)
  layers: [['aa.', 'aaa'], ['a..', '...']],   // strings: layers[k][row y][col x], '.' or ' ' = empty, layers[0] = bottom
  size: {w, h}, slices: [{z, draw(g, c)}]     // procedural: size in WORLD UNITS; g is a ctx with 1 = 1 unit and the origin at the pivot;
                                              // c = {col(hex) (variant + height shade), raw(hex), z, zFrac, unit}
}
```

`VoxelGrid(w, d, h)` (x front, y right, z up): `set get has box ellipsoid(cx,cy,cz,rx,ry,rz,ch,p,keep) cyl rod replace mirrorY topCoat layerRows count`, `VoxelGrid.fromLayers`.
Ellipsoid `p` is the superellipsoid exponent (2 = ellipsoid, 3-4 = rounded box); coordinates are in cells and sampled at cell centres.
Procedural slices are the right tool for round, organic or textured shapes (a cracked pillar, a slime): draw each ring with `g.arc`.

Draw it:

```js
import {drawStack, tintVariant, beginStackFrame} from './stack2d.js';
drawStack(ctx, model, x, y, {yaw, z, variant, flash, sx, sy, alpha});
```

`flash` 0..1 overlays a white silhouette; `sx/sy` squash about the pivot; `variant` is `{key, fn(hex)}` from `tintVariant('elite', '#ff7a3a', 0.25)`,
`darkVariant('dead', 0.55)` or `floorStackVariant(floor)`; each distinct variant key bakes its own copy (so keep the set small). `prebake(model, variant, n)` warms buckets.
`drawContactShadow(ctx, x, y, rx, ry, alpha)` is the soft base shadow for props.

## Adding a new model (step by step)

1. **Pick the form.** Humanoid enemy: copy a spec in `models2d.js` (`GUNNER_SPEC`), change colours/flags, add it to `KIT_SPECS` and `STACK_CONFIG.kinds`. Anything else (prop, wall, creature): a
   standalone `{id, unit, layerH, pivot, palette, grid}`.
2. **Sketch the footprint** in cells, pivot on the joint. Build bottom-up in a `VoxelGrid`: big shapes first (`ellipsoid`/`box`), then details (belts, pouches, lenses, rivets as 1-cell `set`s).
   Detail that faces sideways is foreshortened by the tilt (a vertical face of height h shows as h*0.72 px): put important marks (visor glass, lens glints, stripes) on **top-facing** surfaces.
3. **Palette**: 6-12 chars. Add `emit` entries for glows. Reuse `topCoat('x','Y')` to paint lighter plates on exposed tops.
4. **Preview**: `python3 -m http.server 8000` then open `tools/stack-sheet.html?kind=gunner&zoom=4&rows=stand,walk,act` (adjust `cols=4&h=80`). Check 8 facings, walking, recoil, hurt, reload, death, at gameplay zoom (`zoom=2`) and 4-6x.
5. **Wire it**: `STACK_CONFIG.kinds.add(kind)`; in `render2d.js` the converted kind already branches on `isStacked(kind)`. Non-stacked kinds keep the old path.
6. **Perf check**: render a 12-enemy fight; `view.stats.actorMs` is the per-frame actor pass in ms (EMA). Keep parts <= 12 per actor and cells < ~12k per model.

## Rigs, poses and animation

A character is not one stack but parts that move independently, each its own cached stack:
`leg x2, torso, head, arm bone x4 (2 per arm), glove x2, gun, mag, antenna (procedural rod)`. `humanoidPose(kit, inputs, out)` fills `out.items`
(preallocated pool, zero garbage) with `{model, x, y, z, yaw, sx, sy, flash}` for the frame; `drawRig(ctx, out, x, y, {variant})` depth-sorts (by ground y, then z) and draws.

Frames: **move** (legs) / **body** (torso, head, lagged aim) / **aim** (gun, hands). Inputs (all optional):

| input | meaning |
| --- | --- |
| `bodyYaw aimYaw moveYaw` | the three frames |
| `amp phase sprint` | walk amount 0..1, gait phase 0..1 (`walkPhase` in `anim.js`), sprint blend |
| `kick` | recoil 0..1: torso rocks back, gun slides back and rises (muzzle flip in z) |
| `hurt flash` | flinch (head snaps, torso squashes) and white flash |
| `lunge` | forward lean |
| `gunModel gunGeo gunRot gunDx gunLift gunScale` | the gun stack, its geometry, extra yaw (low-ready / reload tilt / swap roll), shifts |
| `handDx handDy mag magModel` | support-hand offset in gun space (reload), fresh mag in hand |
| `idleT` | seconds standing still: drives idle fidgets |
| `dead fallYaw spin` | death progress 0..1: parts topple away from the hit, landing where their height carried them |
| `antennaX antennaY` | world sway of the antenna tip (the renderer springs it from velocity) |

What is built in: gait (feet swing, lift, torso bob + counter-twist, lean into the move direction, sprint stretch), legs square up under the torso when still and turn to the travel direction when moving
(strafe / back-pedal read correctly), breathing, head leads the aim within +-0.55 rad, two-bone arms with elbows flaring outward and hands glued to the gun (`solveElbow`), recoil, reload tilt + mag swap,
weapon swap roll, hit flinch, death topple. The gun muzzle is exactly `RIG.reach + gun.visual.length * 0.7 = gunMuzzle(gun)` (tested).

### Adding a pose

Poses are plain functions of numbers, so adding one is: (1) add an input field, (2) apply it as an offset to the relevant part in `humanoidPose`
(`tx/ty/tz` torso, `hx/hy/hz` head, `gunRot/gunDx/gunLift`, per-item `sx/sy`), (3) feed it from `render2d.js` where the actor's `vis` state lives
(`updateEnemy` for enemies, `update` for the player), (4) add a cell to `tools/stack-sheet.html` and look at it. Use the easings and springs in `anim.js`. For a new body plan write another
`xxxPose(kit, inp, out)` next to `humanoidPose` using the same `add(out, model, x, y, z, yaw, sx, sy, flash)` primitive and `sortItems`; `drawRig` does not care what produced the items.

### Idle fidget slots and easter eggs

`IDLE_FIDGETS` in `rig2d.js` is a list of `{id, from, dur, apply(p, u, inp)}`. After `IDLE_FIDGETS[0].from` seconds of stillness one fidget plays per 6.5 s slot (chosen by `slot + id`); `u` runs 0..1 over `dur`
and `p` exposes `headYaw headZ torsoZ torsoYaw leanX antenna shrug`. Add your own with `registerIdleFidget({...})` (checking a watch, kicking a pebble, tuning the radio: the antenna blink and sway are ready for it).
`out.fidget` names the active one so the renderer can spawn matching particles / sounds. Rare idles: give a fidget a high `from` (e.g. 25 s). Custom draw items (`item.draw = fn`) can add procedural bits such as the antenna.

## Corpses

`corpseOverrides[kind]` (sprites2d.js) lets a stacked kind bake its own flat corpse decal: the dead pose drawn at `anchorZ 0`; the live death animation ends on the same image.

## Looking at it

`tools/stack-sheet.html` draws any kit at 8 facings, walk cycles, strafes, recoil/hurt/sprint/reload, death frames and idle fidgets on one canvas. Playwright: load it and screenshot (`window.__ready`).
Real fights: serve the repo, load `index.html?debug`, use `window.__deadair.spawnEnemy(type, x, y, room)`; `?stack=0` gives the legacy art for A/B and perf comparison.

## Non-humanoid bodies: rusher, brute, the Conductor

`creature-core.js` (item pool, depth sort, 3D two-bone `solveLeg`, `pieceChain` bead helper), `creature-models.js` (rusher kit, `pitchedGrid`), `brute-models.js`, `conductor-models.js`,
`rusher-pose.js`, `brute-pose.js`, `conductor-pose.js` (poses), `creature-glue.js` + `conductor2d.js` (renderer hooks). Page: `tools/creature-sheet.html?kind=rusher|rusher.elite|brute|brute.elite|conductor|conductor.2|conductor.3&zoom=3&rows=stand,walk,wind,strike,act,dead,fidget`.

* **Limbs as bead chains.** A stack part cannot tilt, so a limb is 3-4 small rounded stacks laid on the 3D bone line (`pieceChain`); `solveLeg(..., pole)` takes any bend hint (knee up, elbow out).
* **Pitch variants.** Things that must lean (rusher blades, the hammer, the Conductor's mast and coat tails) are baked at a handful of pitches by `pitchedGrid(cells, pitch)`; the pose picks the nearest and sets height from the model's `pz`.
* **Damage levels = kits by id** (`cond0/1/2.*`, `rusher.elite`): boss phases swap whole kits (torn coat, cracked casing, bent mast).
* **Procedural items** (`item.draw`): glows, the CRT face (redrawn each frame on the head's top face so it reads from any facing), antennae, hoses, chains, cables, baton trail.
* **Idle fidgets per body plan:** `registerIdleFidget({id, only: 'rusher'|'brute', ...})`; `fidgetAt(idleT, seed, only)` filters, so humanoids never play them.
* render2d hooks: `isCreature(e)`, `drawCreature`, `drawCreatureCorpse`, `updateCreature` (dust, slam shockwave + camera shake, steam when enraged, drool), `updateConductor`. Elites are type brute/chaser with `e.elite`.

## Gotchas

* Don't call `drawStack` before `setSpriteScale` has run (the first resize does it); the engine re-quantises on scale changes.
* Every distinct `variant.key` x model x scale level is a separate bake. Use few variants (floor tints are 4, dead is 1).
* Models are cached by `id`: change a model's cells => change its `id` (or reload) while iterating in a long-lived page.
* `emit` colours skip shading but DO go through variants (a dead or floor tint dims lenses too).
