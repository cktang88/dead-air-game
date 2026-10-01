# DEAD AIR — Game Design and Build Plan

## Product goal

A fast top-down dungeon shooter where the player can pause mentally while the world crawls, then commit to movement and gunfire while everything accelerates. Each run is a small tactical story: scout a room, choose an entry, spend ammunition, use cover, collect gear, and decide whether to push toward the exit. Failure should feel fair and restarting should be quick. Long-term upgrades give each run a purpose without making early rooms trivial.

The game should run in a desktop browser with keyboard and mouse, load directly from a local web server, and remain understandable without a tutorial video.

## Design pillars

1. **Stillness is a tool.** Waiting or aiming without action slows the simulation to 0.18×. Walking and shooting make it 1.32×. The player chooses when to turn a dangerous room into a fast fight.
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

- Idle or careful aiming: 0.18× simulation speed.
- Moving, firing, or recent action: 1.32× simulation speed.
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

## Enemies

Current enemy families are the Rusher, Gunner, Brute, and Warden. Expand behavior and tuning before adding many near-duplicates.

- **Rusher:** pressures the player and punishes standing in a doorway too long.
- **Gunner:** fires readable ranged bursts and relocates when approached.
- **Brute:** slow, high-health threat with a dangerous close-range attack; vulnerable to kiting and heavy weapons.
- **Warden:** guards a lane and adjusts distance to hold it.
- **Later: Flanker:** seeks another route around cover; must telegraph entry.
- **Later: Suppressor:** denies a corridor with a short volley; never fires continuously without a tell.
- **Later: Room captain:** modifies nearby enemies or guards a high-value reward. Introduce one new mechanic per encounter.

Room compositions should use a threat budget rather than an unbounded random count. Mix roles so a player must move: ranged threats behind cover, rushers that close gaps, and safe lanes that can be used for counterplay. Give every enemy a visible health/impact response and a short post-hit stagger where appropriate.

## Weapons, attachments, and carry weight

### Current weapon baseline

- Machine pistol: fast, light, short range.
- Street Sweeper: wide, heavy, close range.
- Hardline rifle: precise, heavier, longer range.
- Attachments change magazine size, reload, spread, damage, projectile speed, or penetration. They cost run scrap today.

### Inventory rules

- The player always has a **primary** and **secondary** slot. Keys `1` and `2` switch slots.
- Current loadout weight is the sum of equipped weapon weights. Base capacity is 6.5. Machine pistol + shotgun weigh 5.5; rifle + shotgun exceed the current limit and cannot be equipped together.
- At the workbench, selecting an unequipped gun replaces the secondary if it fits. A gun pickup follows the same rule. Keep ammo indexed by weapon so a swap does not erase the player’s stored magazine.
- Show slot, weapon, ammo, per-item weight, total weight, and capacity. Explain an overweight selection directly.
- The capacity is an intentional tradeoff: leave weight free for armor or utility gear once those systems exist. Do not silently discard gear when swapping a weapon.

### Next inventory milestones

- Add armor and gear items with explicit weight and one clear effect each: armor plate (health buffer), utility belt (extra consumables), scanner (room preview), or ammo harness (reserve capacity).
- A gear screen should compare total load to capacity before confirming a swap.
- Add permanent carry-rig upgrades through metaprogression. Start with +1 capacity per tier and a small maximum; test whether it meaningfully opens different builds.
- Decide whether temporary attachments have weight. If they do, show the added weight in the same total. Avoid hidden weight penalties.
- Add a third weapon slot only as a later carry-rig unlock with a real weight and opportunity cost. Two slots are the default and should remain useful.
- Add weapons with distinct tactical identity before increasing the catalog size. Prefer one strong choice per role over many stat-only variants.

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

- Tempo is slow while idle, fast during action, and zero in menus.
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
- [x] Three distinct guns and five temporary attachments.
- [x] Primary and secondary slots; `1` / `2` switching; weapon weight and capacity at the workbench.
- [x] Four enemy roles, knockback, hit stop, screen shake, particles, and short corpse slide.
- [x] Multi-room run, minimap, loot, room clear reward, and extraction.
- [x] Room props include permanent cover and health-based destructible crates.
- [x] Small pure rules module and Node unit tests.

### Next: finish core run quality

- [ ] Add seed selection/display and deterministic placement for props, pickups, and enemy spawns.
- [ ] Validate every room layout for a path from entry to exit and reachable doorways.
- [ ] Add room roles, locked/reward doors, branch rooms, and one secret room type.
- [ ] Tune enemy budgets, ranged telegraphs, player damage, health drops, and run length through repeated play.
- [ ] Make the workbench reachable and clearly signposted; add a weapon replacement preview.
- [ ] Add crate health feedback (small health state/crack stages), unique break sound, and confirm every room has at least one crate.
- [ ] Add a visible extraction/clear summary and result metrics.

### Next: account and metaprogression

- [ ] Create a versioned local save record for coins and permanent upgrades.
- [ ] Award coins exactly once on death or extraction; show a readable breakdown.
- [ ] Build the between-run upgrade screen and add purchase/refund/reset rules.
- [ ] Implement Runner’s Legs, Still Mind, Lucky Find, Room Sense, Salvager, and Carry Rig with capped effects.
- [ ] Test save migration, invalid data, reset, and persistence across refreshes.

### Next: inventory and gear

- [ ] Add armor, healing item, scanner, and ammo-harness definitions with weight and effect.
- [ ] Add inventory UI that previews slots, total weight, and replacement before commit.
- [ ] Make armor absorb a defined number of hits and show remaining durability.
- [ ] Implement carry capacity upgrades and prove at least two distinct loadout choices are viable.
- [ ] Add a third slot only as a later upgrade; keep it optional and weight-limited.
- [ ] Make weapon pickups accept, swap, or decline without losing items or ammo.

### Next: polish and maintainability

- [ ] Split seeded map generation from the renderer once it has its own tested inputs/outputs.
- [ ] Add compact visual/behavior checks for the browser build and a repeatable manual seed.
- [ ] Add sound, volume controls, reduced shake/flash options, and remappable controls.
- [ ] Profile a full run; cap particles and dispose every removed geometry/material/body.
- [ ] Run an architecture review after the next major milestone; remove abstractions that do not own real rules.
- [ ] Update this document when actual game behavior changes; mark delivered items only after verification.

## Current acceptance gate

A player can launch a run, explore generated connected rooms, change time by acting or waiting, use two weighted weapon slots, fight several enemy roles, break crates for possible loot, clear rooms, and extract or die. The next major completion gate is persistent run currency and between-run upgrades, followed by gear choices that compete with weapon weight.
