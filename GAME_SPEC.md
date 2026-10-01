# DEAD AIR — Game Design and Build Plan

## Product goal

A fast top-down dungeon shooter where the player can pause mentally while the world crawls, then commit to movement and gunfire while everything accelerates. Each run is a small tactical story: scout a room, choose an entry, spend ammunition, use cover, collect gear, and decide whether to push toward the exit. Failure should feel fair and restarting should be quick. Long-term upgrades give each run a purpose without making early rooms trivial.

The game should run in a desktop browser with keyboard and mouse, load directly from a local web server, and remain understandable without a tutorial video.

## Design pillars

1. **Stillness is a tool.** Waiting slows the simulation to the current idle rate (0.18× by default). Shooting alone blends idle and normal speed geometrically (about 0.42× by default), including sustained automatic fire. Movement runs at 1.00×, whether or not the player is also firing.
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
- Moving: 1.00× simulation speed. Firing alone: the geometric mean of idle and normal speed. Briefly preserve the last movement or firing rate after release so tempo does not flicker.
- Menus and pause: simulation stopped.
- The speed indicator always names the current state and shows its rate.
- Bullets are physical projectiles with collision checks; walls block shots.
- Player bullets damage enemies and crates. Enemy bullets damage the player.
- Hits briefly interrupt time, push targets, and add restrained camera shake.
- Enemy tells must remain readable at both slow and fast speeds. Use an aim cue or wind-up before ranged shots and a clear charge before heavy contact.
- Reloads consume time and ammunition. A reload may be interrupted by damage; whether ammo is retained on interruption is a balance choice to test.
- Death restarts at the entry with one action. Preserve persistent currency and upgrades, not run-only loot.

## Rooms, routes, and generation

### Room requirements

- Every run has an entry, at least six combat or utility rooms, and an extraction room.
- Rooms vary in width, height, outline, entrance position, and corridor connection. Hallways should create choices and avoid one long empty chain.
- Keep a connected route from entry to extraction. Optional branches hold more risk, loot, or a secret.
- Each room gets a role: combat, cache, armory, clinic, hazard, rest, miniboss, or extraction. Roles affect enemy budget, props, lights, and loot.
- Combat room size and enemy budget scale with distance from entry. A room may be small and dangerous or large with scattered guards.
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
- Gun definitions have distinct fire stats, weight, ammo, and visual dimensions. These catalog entries exist, but they are not all reachable or fully integrated into combat/loadout yet.
- Five attachment definitions exist, and each gun lists which attachment IDs it accepts. Per-gun installed attachment state, compatibility filtering in the interface, and firing/reload effects remain to be integrated.
- The implemented run still starts with the original machine pistol and Street Sweeper. The Hardline rifle remains in the current workbench/pickup flow.

### Inventory rules

- The player always has a **primary** and **secondary** slot. Keys `1` and `2` switch slots.
- Current loadout weight is the sum of equipped weapons and gear. Base capacity is 7.0. Machine pistol + shotgun weigh 5.5; adding the 1.5-weight armor plate fills the rig, while a heavier rifle plus armor exceeds capacity.
- At the workbench, selecting an unequipped gun replaces the secondary if it fits. A gun pickup follows the same rule. Keep ammo indexed by weapon so a swap does not erase the player’s stored magazine.
- Show slot, weapon, ammo, per-item weight, total weight, and capacity. Explain an overweight selection directly.
- The capacity is an intentional tradeoff: leave weight free for armor or utility gear once those systems exist. Do not silently discard gear when swapping a weapon.

### Inventory behavior

- The armor plate is implemented as a one-health buffer with 1.5 carry weight.
- A gear screen should compare total load to capacity before confirming a swap.
- Permanent carry-rig upgrades increase capacity through metaprogression.
- Decide whether temporary attachments have weight. If they do, show the added weight in the same total. Avoid hidden weight penalties.
- Add a third weapon slot only as a later carry-rig unlock with a real weight and opportunity cost. Two slots are the default and should remain useful.
- The 13 catalogued guns are selectable, have independent ammunition and distinct combat profiles, and declare their compatible attachments.
- Attachments belong to individual guns. The workbench shows only compatible attachments and applies magazine, damage, fire-rate, spread, range, penetration, and reload changes.

## Tactical items and merchants

- Planned throwables: smoke, flash, frag, and incendiary. Each should have a visible throw arc/landing point, fuse, effect radius, inventory count, and clear area feedback.
- Smoke should break enemy sight/targeting. Flash should briefly stun enemies with line of sight. Frag should deal radial damage and knockback, with walls stopping the blast. Incendiary should create a timed damaging area.
- `tactical.js` defines item stats, inventory consumption, radius checks, and occlusion rules with unit tests. Q cycles the selected throwable; G throws it with physics-based travel and a fuse.
- Smoke blocks ranged enemies' sight, flash stuns, frag deals radial damage and knockback, and incendiary creates a timed damaging area. Walls and intact crates block direct effects.
- A rare merchant room replaces its usual enemies with a shopkeeper. Its paused panel offers a gun, compatible attachment, armor, health, or throwable refill for scrap. Gun purchases replace the secondary and check carry capacity.

## Combat readability and counterplay

- Every actor carries a visible top-down weapon mesh that follows its aim direction. During reload, the weapon tilts visibly.
- Ranged enemies telegraph a shot with an aim line, then fire along the direction they committed to at the start of the tell. Their slower rounds leave a dodge window after launch at both idle slow time and action speed.
- Damage, stun, death, and other interruption should cancel an enemy's queued shot. Walls must block enemy line of sight and projectiles.
- Longer playtesting should tune tell timing, enemy fire rhythm, and the visual readability of weapons at different zoom levels.

## Loot and room rewards

- Run scrap buys attachments and services during a run. It is not permanent currency.
- Loot rarity: common, uncommon, rare, and prototype. Rarity should change a weapon/attachment effect, not only its color.
- Crates may drop a small amount of scrap. Enemies reward a predictable small amount; rooms grant a clear bonus for clearing.
- Healing should be uncommon enough that taking damage matters but common enough to prevent a long unwinnable run.
- Weapon pickup should preview the replacement and weight before collection. Provide a clear decline path if the player wants to keep their current weapon.
- A room cache should offer a choice when possible: ammunition, health, upgrade, or riskier rare item.

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
| Lucky Find | Improve the chance of uncommon/rare loot | Medium, rising | Small changes; avoid guaranteed rare drops |
| Carry Rig | Add +1 weight capacity per tier | Medium | Cap low enough that heavy loadouts still make choices |
| Field Medic | Add one starting health buffer or improve a heal | High | Avoid stacking into careless play |
| Room Sense | Reveal more of adjacent rooms / enemy silhouettes | Medium | Reveal information, never shoot through walls |
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
- Offer reduced screen shake, high-contrast enemy outlines, adjustable flash intensity, scalable UI, and color-safe rarity markers.
- Never communicate rarity or danger by color alone. Use icons or labels too.
- Pause on browser focus loss. Do not allow held movement/fire input to remain latched after restart or returning to the tab.

## Art, sound, and impact

- Use readable top-down shapes and strong value contrast. The player, enemy warnings, bullets, loot, crates, walls, and exits need different silhouettes.
- Room palettes can vary while gameplay colors stay consistent.
- Add layered gun sounds, reload cues, enemy tells, crate break, pickup, room-clear, and extraction audio. Provide volume sliders and mute.
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

- Tempo is slow while idle, between slow and normal while firing alone, 1.00× while moving, and zero in menus.
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
- [ ] Integrate the 13-gun catalog (3 assault rifles, 4 SMGs, 2 pistols, 3 precision rifles, and 1 shotgun) into gameplay; distinct catalog stats are present.
- [x] Apply compatible attachments per weapon; restrict workbench options and retain attachments when switching guns.
- [x] Primary and secondary slots; `1` / `2` switching; weapon weight and capacity at the workbench.
- [x] Four enemy roles, knockback, hit stop, screen shake, particles, and short corpse slide.
- [x] Multi-room run, minimap, loot, room clear reward, and extraction.
- [x] Room props include permanent cover and health-based destructible crates.
- [x] Procedural rooms include rectangular, L, U, and C floor plans while preserving door links and room centers.
- [x] Small pure rules module and Node unit tests.

### Next: finish core run quality

- [x] Add seed selection/display and deterministic placement for props, pickups, and enemy spawns.
- [x] Validate every room layout for a path from entry to exit and reachable doorways. Browser integration checks cover 64 deterministic ROT.js seeds twice, plus the low-room-count larger-map retry.
- [ ] Add room roles, locked/reward doors, branch rooms, and one secret room type.
- [ ] Tune enemy budgets, ranged telegraphs, player damage, health drops, and run length through repeated play.
- [ ] Make the workbench reachable and clearly signposted; add a weapon replacement preview.
- [ ] Add crate health feedback (small health state/crack stages), unique break sound, and confirm every room has at least one crate.
- [x] Show extraction or death, rooms cleared, kills, and coins earned.

### Next: account and metaprogression

- [x] Create a versioned local save record for coins and permanent upgrades.
- [x] Award coins exactly once on death or extraction; show the run summary payout.
- [x] Build the between-run upgrade screen and buy capped permanent upgrades.
- [x] Implement Runner’s Legs, Still Mind, Salvager crate luck, and Carry Rig with capped effects.
- [ ] Test progress persistence across browser refreshes; add a visible save reset option.

### Next: inventory and gear

- [x] Add one armor plate with weight and a +1 health effect.
- [x] Show weapons, armor, and total weight at the workbench; block overweight swaps.
- [ ] Add a healing item, scanner, ammo harness, and armor durability.
- [ ] Add a confirmation preview when replacing a weapon or gear item.
- [x] Implement permanent carry capacity upgrades; playtest different weapon/armor choices.
- [ ] Add a third slot only as a later upgrade; keep it optional and weight-limited.
- [ ] Make weapon pickups accept, swap, or decline without losing items or ammo.

### Combat and run services

- [x] Add visible player/enemy weapons that track aim and tilt during reload.
- [x] Add enemy aim telegraphs and committed projectile directions so shots can be dodged at both tempo speeds.
- [x] Connect smoke, flash, frag, and incendiary throwables to input, counts, physics, effects, and enemy behavior.
- [x] Add rare shopkeeper rooms and scrap purchases for guns, per-gun attachments, armor/health, and throwable refills.
- [ ] Playtest and tune line of sight, enemy interruptions, throw fuses, rare shop frequency, and carry limits.

### Next: polish and maintainability

- [ ] Split seeded map generation from the renderer once it has its own tested inputs/outputs.
- [ ] Add compact visual/behavior checks for the browser build and a repeatable manual seed.
- [ ] Add sound, volume controls, reduced shake/flash options, and remappable controls.
- [ ] Profile a full run; cap particles and dispose every removed geometry/material/body.
- [ ] Run an architecture review after the next major milestone; remove abstractions that do not own real rules.
- [ ] Update this document when actual game behavior changes; mark delivered items only after verification.

## Current acceptance gate

A player can launch a run, explore generated connected rooms, change time by acting or waiting, use two weighted weapon slots, equip a health-boosting armor plate, fight several enemy roles, dodge telegraphed ranged shots, use throwables, shop in a rare merchant room, break crates for possible loot, clear rooms, and extract or die. Death and extraction award persistent coins for capped upgrades that change speed, idle time, crate loot, and carry capacity. Remaining work focuses on balance, repeated-run testing, and the other roadmap items above.
