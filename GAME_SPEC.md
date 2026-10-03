# DEAD AIR — Game Design and Build Plan

## Product goal

A fast top-down dungeon shooter where the player can pause mentally while the world crawls, then commit to movement and gunfire while everything accelerates. Each run is a small tactical story: scout a room, choose an entry, spend ammunition, use cover, collect gear, and decide whether to push toward the exit. Failure should feel fair and restarting should be quick. Long-term upgrades give each run a purpose without making early rooms trivial.

The game should run in a desktop browser with keyboard and mouse, load directly from a local web server, and remain understandable without a tutorial video.

## Design pillars

1. **Stillness is a tool.** Waiting slows the simulation to the current idle rate (0.18× by default). Firing blends idle and normal speed geometrically (about 0.42× by default), including sustained automatic fire while moving. Movement without firing runs at 1.00×.
2. **Rooms are decisions.** A doorway reveals enough to plan, but every room has different cover, enemy pressure, loot, and routes.
3. **Weapons have jobs.** Primary and secondary slots support different ranges and tempos. Ammunition, reloads, recoil, damage, spread, and weight make the choice matter.
4. **Hits feel physical.** Impacts use hit stop, knockback, particles, screen shake, and brief enemy collapse. Clear feedback should make each shot easy to read.
5. **A failed run still pays forward.** Run-earned coins buy permanent options and small advantages. Skill and room choices remain more important than the upgrade tree.
6. **The rules stay legible.** Show weapon weight, total load, upgrade effects, room state, and why an item cannot be equipped.

## Run loop

1. Start in a safe entry room with a two-gun loadout and a workbench.
2. Explore connected rooms and hallways. The minimap shows explored rooms and known threats; later scouting upgrades can reveal more.
3. Choose when to open a door or enter a room. The player can retreat through cleared halls.
4. Fight enemies, use cover, break crates, and collect ammunition, healing, attachments, and scrap.
5. Clear the exit room, reach the extraction marker, and bank the run reward.
6. At the between-run screen, review results and spend permanent coins.
7. Start another run with a new layout and an updated build.

A normal run should take about 8–15 minutes after tuning. The first room should teach movement, aiming, slow time, shooting, cover, and switching weapons in under two minutes.

## Time and combat rules

- Idle or careful aiming: 0.18× simulation speed, giving the player time to read threats and plan.
- Moving without firing: 1.00× simulation speed. Firing: the geometric mean of idle and normal speed, including while moving. Briefly preserve the last action rate after release so tempo does not flicker.
- Menus and pause: simulation stopped.
- The speed indicator always names the current state and shows its rate.
- Bullets are physical projectiles with collision checks; walls block shots.
- Player bullets damage enemies and crates. Enemy bullets damage the player.
- Hits briefly interrupt time, push targets, and add restrained camera shake.
- Enemy tells must remain readable at both slow and fast speeds. Use an aim cue or wind-up before ranged shots and a clear charge before heavy contact. Brutes now commit to a visible directional swing with a dodgeable wind-up and recovery.
- Reloads consume time and ammunition. A reload may be interrupted by damage; whether ammo is retained on interruption is a balance choice to test.
- Death restarts at the entry with one action. Preserve persistent currency and upgrades, not run-only loot.

## Rooms, routes, and generation

### Room requirements

- Every run has an entry, at least six combat or utility rooms, and an extraction room.
- Rooms vary in width, height, outline, entrance position, and corridor connection. Hallways should create choices and avoid one long empty chain.
- Enemies belong to their spawn encounter. A living enemy still blocks that room's clear reward if it chases beyond the original walls.
- Keep a connected route from entry to extraction. Optional branches hold more risk, loot, or a secret.
- Each room gets a deterministic role: combat, cache, armory, clinic, hazard, merchant, or extraction. Caches have two defenders and a scrap/mod reward, clinics are safe recovery rooms, armories pair three defenders with a gun, hazards raise enemy count, and merchant rooms keep their shop behavior.
- Keep entry and extraction roles reserved. Optional branches, a hidden cache, topology-validated scrap gates, FIELD CLINIC rest stops, and the Warden miniboss are implemented; a cache gate appears only when it will not block the extraction route.
- Rooms are processed by shortest route from the entry. The first two ordinary combat rooms cap at three enemies; later ordinary rooms roll two to four. Cache, armory, hazard, and elite budgets keep their role-specific counts. A room may be small and dangerous or large with scattered guards.
- Room footprints vary between rectangles and L, U, or C outlines. Keep the center and door approaches clear, and preserve a walkable route between all connected rooms.
- Prevent spawning enemies, pickups, crates, or the player inside solid walls or on top of another required object.
- Seed generation for reproducible bug reports and automated checks. Display the run seed on the result screen.

### Props and destruction

- **Walls:** permanent, opaque, and indestructible. They define movement boundaries and block projectiles. No upgrade or weapon may remove them.
- **Wooden crates:** have 60 health, block movement and shots, show cracks after the first hit, break at zero health, throw splinters, and sometimes drop scrap.
- **Pillars / heavy cover:** permanent cover with collision. Their role is to create flanking routes.
- **Decor:** floor tint, room lighting, signs, stains, machinery, and clutter provide visual variety but should not obscure bullets or enemy tells.
- Give every room at least one destructible crate. Ensure props do not seal the only doorway or trap an actor.

### Generation library decision

Use ROT.js Digger for room-and-corridor topology; this is already integrated. Noise functions such as simplex or Perlin suit organic floor or grime patterns, not room connectivity. Add a noise library only if a concrete visual or hazard feature needs it. Keep layout generation seeded and separate from the rendering adapter so rules can be tested without WebGL.

### Research references

- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) — render repeated floor and wall geometry with fewer draw calls.
- [Rapier JavaScript rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/) — dynamic actors/projectiles and fixed cover/wall bodies.
- [ROT.js Digger API](https://unpkg.com/rot-js@2.1.3/doc/modules/_map_digger_.html) — connected procedural rooms and corridors.
- [Dennaton Games interview on Hotline Miami](https://www.pcgamer.com/hotline-miami-interview-dennaton-games-on-creating-carnage-to-delight-and-disgust/) — design context for dangerous short encounters, readable action, and mastery through replay.
- [SUPERHOT Team interview](https://gamingbolt.com/superhot-interview-becoming-the-weapon-in-a-turn-based-fps-environment) and [Game Developer interview](https://www.gamedeveloper.com/design/road-to-the-igf-superhot-team-s-i-superhot-i-) — the design starts from fluid turn-based action: the player sets the pace, gets a moment to adjust when pressure rises, then improvises. The team highlights visible enemy aiming, dodging bullets, tight spaces, and unscripted solutions.
- [GDC session summary: Game Design and Mind Control in SUPERHOT](https://www.gdcvault.com/play/1023483/Game-Design-and-Mind-Control) — the central time rule shaped the rest of the combat, including bullet dodging, grabbing weapons, and using nearby objects.

### SUPERHOT design lessons for DEAD AIR

- Keep time control tied directly to player intent. Standing still should create a readable reaction window, while movement and firing should make the encounter feel urgent. The current slow/action states are a simple version of this rule; tune them by playtesting instead of adding extra time powers by default.
- Make threat intent readable before it becomes damage. Keep enemy aim tells and fixed-path bullets visible long enough for a player to notice and react at both time scales.
- Favor improvisation over one correct room solution. Put cover, doors, weapons, and throwable options where players can combine them, and let procedural encounters create their own memorable moments.
- Keep rooms close and tactically legible. Tight corners and doorways can make small movement choices matter, but retain the wider halls and multiple exits needed for this game's dungeon exploration.
- Enemy intelligence should create counterplay, not just stronger pressure. Use flanks, cover, retreats, and varied roles with clear tells; avoid endless retreat or hiding that stalls the fight. SUPERHOT's useful lesson here is readable action and player-paced flow, not a claim that its enemies simulate realistic self-preservation.

## Enemies

Current enemy families are the Rusher, Gunner, Brute, and Warden. Expand behavior and tuning before adding many near-duplicates.

- **Rusher:** pressures the player and punishes standing in a doorway too long; seeks cover or retreats when badly hurt.
- **Gunner:** fires readable ranged bursts from 105–300 world units and retreats or sidesteps if the player closes inside its minimum range.
- **Brute:** slow, high-health threat with a dangerous close-range attack; vulnerable to kiting and heavy weapons, and falls back when badly hurt.
- **Warden:** guards a lane and fires from 88–210 world units, adjusting distance to hold that band.
- **Later: Flanker:** seeks another route around cover; must telegraph entry.
- **Later: Suppressor:** denies a corridor with a short volley; never fires continuously without a tell.
- **Later: Room captain:** modifies nearby enemies or guards a high-value reward. Introduce one new mechanic per encounter.

Room compositions should use a threat budget rather than an unbounded random count. Mix roles so a player must move: ranged threats behind cover, no more than half the group rushing at once, and safe lanes that can be used for counterplay. Ranged enemies define both a minimum and maximum firing range; melee enemies close to their contact range. Give every enemy a visible health/impact response and a short post-hit stagger where appropriate. Navigation should keep following tile routes around cover instead of stopping at each waypoint, and prop/spawn placement must leave doors and paths open.

## Weapons, attachments, and carry weight

### Current weapon baseline

- The catalog now defines 13 guns: three assault rifles, four SMGs (including the original machine pistol), two pistols, three precision/anti-materiel rifles, and one shotgun.
- KITE BURST fires a committed three-round sequence with short spacing between bullets; every emitted round spends one round, releasing the trigger does not cancel the burst, manual reload is ignored until it finishes, and switching weapons cancels its remaining rounds. A nearly empty magazine can produce a shorter final burst. The preview reports its sustained cyclic rate rather than trigger rate.
- Gun definitions have distinct fire stats, weight, ammo, and visual dimensions. All 13 are wired into combat and can be selected through the loadout, merchant, or a weight-checked pickup when the carry rig allows them.
- Five attachment definitions exist; compatibility filtering and per-gun installation are wired into the workbench and weapon stat calculations.
- A run starts with the machine pistol and Street Sweeper. Other catalog guns can be selected at the workbench, bought from a merchant, or accepted from a specific pickup.
- The Street Sweeper has three shell choices on `C`: buckshot fires 9 hard-hitting pellets, birdshot fires 16 weaker and wider pellets at shorter range, and slug fires one accurate, longer-range pellet. Each trigger consumes one shotgun round; the HUD shows the selected shell.
- Lynx and Quill rounds can continue through up to four additional enemies and three crates. The Mule can continue through five additional enemies, four crates, and one continuous wall section. Hits are swept across each frame so fast rounds do not skip targets; walls and cover stop ordinary rounds.

### Inventory rules

- The player always has a **primary** and **secondary** slot. Keys `1` and `2` switch slots.
- Current loadout weight is the sum of equipped weapons and gear. Base capacity is 7.0. Machine pistol + shotgun weigh 5.5; adding the 1.5-weight armor plate fills the rig, while a heavier rifle plus armor exceeds capacity.
- At the workbench, selecting an unequipped gun previews its stats and resulting carry weight before confirmation; cancel leaves the loadout untouched. A gun pickup previews its identity, stats, selected replacement slot, and resulting weight. The player can replace either slot or leave it. Keep ammo indexed by weapon so a swap does not erase the player’s stored magazine.
- Show slot, weapon, ammo, per-item weight, total weight, and capacity. Explain an overweight selection directly.
- The capacity is an intentional tradeoff between heavier weapons, armor, and utility gear. Do not silently discard gear when swapping a weapon.

### Inventory behavior

- The armor plate has two durability points separate from five health; incoming damage wears the plate first and excess damage reaches health. Repair costs 10 scrap at the workbench.
- The gear screen previews total load, capacity, equipment effect, and scrap cost before confirming a gear change; armor also previews its durability change.
- The ammo harness weighs 1.0 and reduces manual and automatic reload time by 15% for either carried weapon; it competes with the 1.5-weight armor plate.
- The loot scanner weighs 1.0 and reveals available guns, attachments, healing, and scrap within seven tiles on the minimap, through walls. It keeps undiscovered secret-cache loot hidden and competes with armor and reload gear.
- Permanent carry-rig upgrades increase capacity through metaprogression.
- Decide whether temporary attachments have weight. If they do, show the added weight in the same total. Avoid hidden weight penalties.
- Add a third weapon slot only as a later carry-rig unlock with a real weight and opportunity cost. Two slots are the default and should remain useful.
- The 13 catalogued guns are selectable, have independent ammunition and distinct combat profiles, and declare their compatible attachments.
- Attachments belong to individual guns. The workbench shows only compatible attachments and applies magazine, damage, fire-rate, spread, range, penetration, and reload changes.

## Tactical items and merchants

- Smoke, flash, frag, and incendiary have distinct throw arcs, fuses, effect radii, inventory counts, and area feedback.
- Smoke should break enemy sight/targeting. Flash should briefly stun enemies with line of sight. Frag should deal radial damage and knockback, with walls stopping the blast. Incendiary should create a timed damaging area.
- `tactical.js` defines item stats, inventory consumption, radius checks, and occlusion rules with unit tests. Q cycles the selected throwable; G throws it with physics-based travel and a fuse.
- Smoke blocks ranged enemies' sight, flash stuns, frag deals radial damage and knockback, and incendiary creates a timed damaging area. Walls and intact crates block direct effects.
- A rare merchant room replaces its usual enemies with a shopkeeper. Its paused panel offers a gun, compatible attachment, weighted gear, health, or throwable refill for scrap. Gun and gear purchases check carry capacity.

## Combat readability and counterplay

- Every actor carries a visible top-down weapon mesh that follows its aim direction. During reload, the weapon tilts visibly.
- Ranged enemies telegraph a shot with an aim line, then fire along the direction they committed to at the start of the tell. Their slower rounds leave a dodge window after launch at both idle slow time and action speed.
- Damage, stun, death, and other interruption should cancel an enemy's queued shot. Walls must block enemy line of sight and projectiles.
- Longer playtesting should tune tell timing, enemy fire rhythm, and the visual readability of weapons at different zoom levels.

## Loot and room rewards

- Run scrap buys attachments and services during a run. It is not permanent currency.
- Attachment loot has four named tiers: common, uncommon, rare, and prototype. Each tier scales the attachment’s own bonus by 1.00×, 1.15×, 1.30×, and 1.45×; installed tiers stay visible on the weapon and in the workbench. Ground loot uses both a distinct color and a rarity name when collected.
- Crates may drop a small amount of scrap. Enemies reward a predictable small amount; rooms grant a clear bonus for clearing.
- Healing should be uncommon enough that taking damage matters but common enough to prevent a long unwinnable run.
- Weapon pickup should preview the replacement and weight before collection. Provide a clear decline path if the player wants to keep their current weapon.
- After its guards are gone, a room cache opens a paused choice: ammunition, health, a compatible attachment, a prototype attachment that costs one health, or 35 scrap. The scrap fallback stays available if every other reward is unusable.

## Meta progression

### Currency and run summary

- Award **coins** at the end of every run, including a failed run. Coins are separate from run scrap.
- Show the payout breakdown: rooms cleared, enemies defeated, optional cache, extraction bonus, and first-clear / challenge bonus.
- Current payout: 5 coins + 8 per cleared room + 2 per kill; extraction adds 50. Death still banks the base, room, and kill rewards.
- Cap repeated farming rewards from the same room state; do not make intentional death more profitable than extraction.
- Save coins and purchased upgrades locally. Validate loaded save data and provide a reset-save button behind a clear confirmation.
- Keep seed, run result, and upgrade purchases visible in a compact between-run screen.

### Permanent upgrade tracks

Prices and magnitudes are tuning targets, not final balance. Keep the first useful purchase reachable after one or two short runs.

| Track | Example effect | Cost shape | Limits / tradeoff |
| --- | --- | --- | --- |
| Runner’s Legs | Increase move speed by 5% per tier | Low then rising | Cap near +20%; do not make aiming while moving trivial |
| Still Mind | Idle simulation moves closer to 0.12× | Medium | Preserve fast/slow contrast; the player still has to choose actions |
| Deep Breath | Increase grace after an action before time accelerates | Medium | Short, capped extension; should help planning, not remove pressure |
| Lucky Find | Shift attachment drops toward better tiers: common/uncommon/rare/prototype odds move from 75/20/4.5/0.5% to 60/27.5/10.5/2% at level III | 30 / 60 / 90 coins | Affects quality, not the number of drops; rare loot remains a chance |
| Carry Rig | Add +1 weight capacity per tier | Medium | Cap low enough that heavy loadouts still make choices |
| Field Medic | Add one starting health buffer or improve a heal | High | Avoid stacking into careless play |
| Room Sense | Reveal nearby room outlines and enemy blips through walls within 15 / 25 / 35 tiles | Medium | Reveal information only; shots still stop at walls |
| Salvager | Improve scrap from crates and clear rewards | Low/medium | Does not multiply permanent coins |
| Weapon Familiarity | Small reload or recoil improvement for a chosen class | Medium | One weapon class at a time; respec cost should be modest |

### Meta progression safeguards

- Each upgrade must explain exactly what changes before purchase.
- Do not let permanent stats erase the core slow-time decision or the need to use cover.
- Keep a meaningful default path for players who never grind. Avoid pay-to-win pacing or daily chores.
- Store upgrades as a small validated versioned record. Derive totals from that record rather than saving duplicate derived stats.
- Provide a reset option and test corrupt, missing, and older save records.

## Interface and accessibility

- Keep health, current room, run timer, scrap, active weapon, ammo, and tempo visible during play.
- Show both weapon slots and carry load at the workbench.
- Add remappable controls, separate aim/fire from movement, and support keyboard-only menu navigation.
- Keep keyboard focus inside the workbench while it is open and return it to the game on close; verify keyboard access for every remaining modal.
- Offer reduced screen shake, high-contrast enemy outlines, adjustable flash intensity, scalable UI, and color-safe rarity markers.
- Never communicate rarity or danger by color alone. Use icons or labels too.
- Pause on browser focus loss. Do not allow held movement/fire input to remain latched after restart or returning to the tab.

## Art, sound, and impact

- Use readable top-down shapes and strong value contrast. The player, enemy warnings, bullets, loot, crates, walls, and exits need different silhouettes.
- Room palettes can vary while gameplay colors stay consistent.
- Add layered gun sounds, reload cues, enemy tells, crate break, pickup, room-clear, and extraction audio. Provide volume sliders and mute. (Reload, tell, pickup, clear, extraction cues and saved mute control are implemented; live browser check pending.)
- Keep particles brief and capped. Reuse or pool effects if measured browser performance requires it.
- Use Three.js InstancedMesh for repeated floor/wall geometry. Keep object counts visible during profiling.
- Rapier 2D handles actor and projectile collision. ROT.js handles room topology. A full ECS is not needed until independent systems or object counts justify it.

## Technical structure

- `catalog.js`: immutable weapon, enemy, and attachment definitions.
- `rules.js`: small pure rules such as weapon stats, carry load, crate durability, tempo, and deterministic encounter composition.
- `game.js`: browser adapter and run orchestration; keep rendering, DOM, and input close to their actual owners.
- `index.html` / `style.css`: semantic HUD, menus, and presentation.
- Keep map generation separate from drawing when the generator grows; pass a seed and return plain room/tile data.
- Keep persistent-save parsing at its boundary. Gameplay rules should not depend on `localStorage` or DOM nodes.
- Do not add an ECS, physics abstraction, or generic item framework until a real feature needs it.

## Verification plan

### Unit coverage

- Projectile impacts resolve in swept-contact order; test enemy, crate, wall, cover, and player stops against the same function used by the live collision loop.

- Tempo is slow while idle, between slow and normal while firing (including when moving), 1.00× while moving without firing, and zero in menus.
- Every attachment changes only the intended weapon values.
- Carry weight sums correctly; an overweight swap is rejected; a valid replacement preserves the two-slot invariant.
- Crate health decreases by actual damage, clamps at zero, and cannot become negative.
- Seeded room and encounter generation is deterministic and respects bounds.
- Run payout includes death and extraction, with no duplicate reward on repeated result rendering.
- Save parsing rejects invalid numbers, unknown upgrades, and unsupported versions without corrupting the current run.

### Browser / integration checks

- Start a run and confirm the room layout, HUD, and entry station appear.
- Move, stop, and fire to verify the tempo indicator changes at runtime.
- Switch both weapon slots and reload each one; verify ammo is independent.
- Swap to a heavier gun, observe the load meter, and confirm overweight choices cannot be equipped.
- Shoot a crate until it breaks, confirm its collider disappears, and verify walls remain indestructible.
- Reach a combat room, defeat the encounter, collect loot, and extract.
- Die and restart; verify run-only scrap resets and future meta coins persist.
- Check narrow browser sizes, focus loss, pause, and restart for input/UI errors.
- Watch the console for import errors and runtime exceptions; capture screenshots for HUD and menus.

## Detailed delivery checklist

### In the current build

- [x] Browser playable with Three.js rendering, Rapier 2D physics, and ROT.js room generation.
- [x] Idle/action tempo shift, aim, fire, reload, pause, and restart.
- [x] Integrate the 13-gun catalog (3 assault rifles, 4 SMGs, 2 pistols, 3 precision rifles, and 1 shotgun) into combat, loadout, merchant, and weight-checked pickup choices.
- [x] Resolve swept bullet contacts in travel order; ordinary rounds stop after their first hit, precision rounds use separate enemy/crate budgets, anti-materiel rounds can pass one wall, and cover always stops a round.
- [x] Apply compatible attachments per weapon; restrict workbench options and retain attachments when switching guns.
- [x] Primary and secondary slots; `1` / `2` switching; weapon weight and capacity at the workbench.
- [x] Four enemy roles, knockback, hit stop, screen shake, particles, and short corpse slide.
- [x] Multi-room run, minimap, loot, room clear reward, and extraction.
- [x] Pay the room-clear scrap bonus only after a room that spawned enemies is cleared; safe clinics and merchant rooms do not grant a free fight reward.
- [x] Room props include permanent cover and health-based destructible crates.
- [x] Procedural rooms include rectangular, L, U, and C floor plans while preserving door links and room centers.
- [x] Small pure rules module and Node unit tests.

### Next: finish core run quality

- [x] Add seed selection/display and deterministic placement for props, pickups, and enemy spawns.
- [x] Validate every room layout for a path from entry to exit and reachable doorways. Browser integration checks cover 64 deterministic ROT.js seeds twice, plus the low-room-count larger-map retry.
- [x] Add seeded room roles that change enemy counts and provide guaranteed cache, armory, and clinic rewards.
- [x] Detect rooms that can be bypassed on the entry-to-extraction route and prefer one for the cache; label it SIDE CACHE. If a generated floor has no bypassable room, place the cache in a reachable middle room.
- [x] Add an optional locked cache gate when generation finds a doorway cut that isolates the reward room without blocking extraction. The gate costs 18 run scrap and opens with E; its closed cells block actors, sight, standard bullets, and enemy routes. Anti-materiel rifles retain their one-wall penetration.
- [x] Keep FIELD CLINIC rooms as quiet, guaranteed-heal rest stops.
- [x] Add a Warden miniboss and guaranteed loot to sufficiently large floors.
- [x] Turn the guaranteed optional cache branch into a secret room hidden from the minimap until found.
- [ ] Tune enemy budgets, ranged telegraphs, player damage, health drops, and run length through repeated play.
- [x] Give heavy Brute contact attacks a readable, committed wind-up and recovery so players can dodge the two-damage swing.
- [x] Improve workbench signposting and add a preview before replacing a gun or gear item.
- [x] Give every room a safely placed destructible crate. Show its remaining health on hit, deepen crack marks at damage thresholds, and remove its collision plus leave a scrap chance when it breaks.
- [x] Add a unique crate-break sound.
- [x] Show extraction or death, rooms cleared, kills, and coins earned.

### Next: account and metaprogression

- [x] Create a versioned local save record for coins and permanent upgrades.
- [x] Award coins exactly once on death or extraction; show the run summary payout.
- [x] Build the between-run upgrade screen and buy capped permanent upgrades.
- [x] Implement Runner’s Legs, Still Mind, Salvager crate and room-clear scrap bonuses, and Carry Rig with capped effects.
- [x] Add Room Sense: explored rooms and known threats stay on the minimap; upgrades reveal nearby rooms and enemy blips through walls at increasing ranges.
- [x] Test progress persistence across browser refreshes; add a visible save reset option with a confirmation prompt.

### Next: inventory and gear

- [x] Add a weighted armor plate with separate durability and repair cost; healing restores health only.
- [x] Show weapons, armor, and total weight at the workbench; block overweight swaps.
- [x] Add the ammo harness as weighted gear; it reduces reload time for both carried weapons.
- [x] Add a weighted loot scanner that reveals nearby guns, attachments, healing, and scrap on the minimap through walls without exposing undiscovered secret-cache loot.
- [ ] Tune healing, armor repair cost, and durability through longer runs.
- [x] Add a confirmation preview when replacing a weapon or gear item.
- [x] Implement permanent carry capacity upgrades; playtest different weapon/armor choices.
- [x] Add an optional third weapon slot at the final Carry Rig tier; keep every pickup, shop purchase, and swap weight-limited.
- [x] Make weapon pickups show the exact gun and weight, swap either slot when capacity allows, or decline while leaving the pickup in place.

### Combat and run services

- [x] Add visible player/enemy weapons that track aim and tilt during reload.
- [x] Add enemy aim telegraphs and committed projectile directions so shots can be dodged at both tempo speeds.
- [x] Start ranged aim tells only when the enemy is within the camera view, and cancel the shot if it leaves view before firing.
- [x] Connect smoke, flash, frag, and incendiary throwables to input, counts, physics, effects, and enemy behavior.
- [x] Add rare shopkeeper rooms and scrap purchases for guns, per-gun attachments, armor/health, and throwable refills.
- [ ] Playtest and tune line of sight, enemy interruptions, throw fuses, rare shop frequency, and carry limits.

### Next: polish and maintainability

- [x] Split seeded map generation from the renderer; `dungeon.js` returns tested room, role, and route data.
- [x] Add a compact in-browser smoke check for seeded start, movement, blended firing tempo, a released three-round KITE BURST and reload lock, crate damage, reload, an attachment purchase, frag detonation, pause, loadout, and a safehouse upgrade that survives reload (`tests/game-smoke.html`).
- [x] Add a seeded encounter browser probe for clearing the first room, opening an affordable reward gate, and dodging a fresh ranged shot that would hit a stationary player (`tests/full-floor-browser-harness.html`).
- [x] Add initial gunfire and crate-break sound effects with a saved master-volume control.
- [x] Add adjustable camera shake and flash brightness options.
- [x] Add remappable keyboard controls with WASD and fallback arrow movement, while keeping Escape, Tab, F, and R fixed for pause, loadout, fullscreen, and restart.
- [x] Keep keyboard focus within loadout, safehouse, weapon-pickup, cache, and merchant dialogs; unit-test the shared wrap and redirect behavior.
- [ ] Profile a full run for sustained performance.
- [x] Cap active particles at 240, dispose evicted/expired effects, and free the old Rapier world on run reset.
- [ ] Run an architecture review after the next major milestone; remove abstractions that do not own real rules.
- [ ] Update this document when actual game behavior changes; mark delivered items only after verification.

## Current acceptance gate

A player can launch a seeded run, explore generated connected rooms, discover a hidden cache branch, and find an optional scrap-gated cache door, Warden miniboss, and safe FIELD CLINIC on supported floors. Runs use weighted weapon slots, armor with durability separate from health, dodgeable ranged attacks, throwables, a rare merchant, destructible crates, room-clear rewards, and extraction or death. Both outcomes award persistent coins for capped upgrades to speed, idle time, crate loot, carry capacity, and minimap scouting. The main open work is full-floor human playtesting, balance across different seeds, and sustained performance profiling; the scripted browser probe covers the first encounter, not a complete run.
