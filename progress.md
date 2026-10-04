# DEAD AIR progress

Original prompt: Build a playable top-down 2D slow-motion dungeon shooter with generated rooms, varied enemies and loot, destructible crates, metaprogression, weighted weapons, throwables, rare scrap merchants, and clear, dodgeable enemy fire.

## Current playable build

- Three.js renders the arena; Rapier 2D handles actor, cover, wall, and projectile physics; ROT.js Digger generates connected rooms and halls.
- Waiting slows the simulation; movement alone runs at 1.00× and firing blends idle and normal time, including while moving. Menus pause the run.
- Thirteen guns cover 3 assault rifles, 4 SMGs, 2 pistols, 3 sniper/anti-materiel rifles, and 1 shotgun. Two weighted slots keep independent ammunition. Attachments are compatible per gun and affect the active gun only.
- Player and enemy weapons visibly follow aim. Player reload and enemy reload poses tilt their weapons. Ranged enemies show a committed direction before shooting; their bullets travel on that fixed path and can be dodged.
- Smoke, flash, frag, and incendiary grenades have physics-driven throws, inventory counts, and distinct area effects. Walls and intact crates block applicable effects.
- A rare black-market room pauses the run and sells a gun, compatible attachment, armor, healing, or throwable refill for scrap. Weapon purchases replace the secondary and obey carry weight.
- A weighted armor plate starts with two durability points, absorbs damage before health, and competes with heavier weapon choices; the entry workbench repairs it for scrap. Death and extraction award persistent coins; safehouse upgrades change movement speed, idle time, crate loot, or carrying capacity.
- The 1.0-weight ammo harness is a utility alternative to armor; it cuts reload time 15% for both manual and automatic reloads on either carried gun. Workbench previews and the merchant expose the choice.
- The 1.0-weight loot scanner highlights available weapons, attachments, healing, and scrap within seven tiles on the minimap through walls. It does not expose loot inside undiscovered secret-cache rooms.
- Four base enemy types plus the Warden elite variant with an overhead health bar, destructible 60-HP crates, scrap-gated cache doors, room-clear rewards, extraction, minimap, screen shake, hit stop, knockback, particles, and sliding corpses.
- Runs accept an optional positive numeric seed in the start screen and display the active seed. ROT.js's seeded generator now drives map generation, encounter placement, loot, combat rolls, and visual effects.

## Room naming and browser route probes

- Default room labels now follow the sorted entry-to-extraction route, stay unique on longer floors, and keep the first/last labels reserved for ENTRY and EXTRACTION. A selected cache alone receives the hidden-secret flag; other optional branches no longer appear as secret rooms.
- Added deterministic coverage for large-floor room-name uniqueness and the unselected-cache case. The current seeded browser smoke passes and covers room-name uniqueness, movement at 1× while held, blended firing, crate damage, reload, throwables, focus, loadout, and persistent upgrades.
- Improved the seeded browser probe to avoid closed gate tiles and crate/cover obstacles, find gate interaction approaches, and reject empty paths. It clears FURNACE with player kills and opens the affordable 18-scrap hidden-room gate. The controlled ranged test exposed that gunner strafing during its locked aim made its telegraph disagree with the fired bullet. Ranged enemies now hold position during the aim window. Enemy bullets carry a shooter ID in the test snapshot, and the probe matches the observed gunner's exact (unrounded) bullet path: it crosses the player's old position within 1 px, then a sidestep at 1.00× avoids it with health and armor unchanged. The page now cache-busts the game module so browser runs exercise current source.
- Verification: `npm test` passes all 106 tests; `node --check` passes for the touched JavaScript; `git diff --check` passes. The latest smoke run passed with 18 enemies, 9 pickups, movement Δx 53 at 1.00×, firing at 0.42×, a crate destroyed, reload and frag checks, focus and loadout checks, and Runner/Lucky Find persistence.

## Verification

- Full-floor browser probe now has an opt-in mode that follows rooms with required route enemies and includes Extraction itself, where the seeded run may spawn guards that block the exit. The report lists generated room roles and records nearby bullets/enemy telegraphs when health changes during a dodge. Seed 213838321 confirmed two optional branch encounters and three Extraction guards; the latest browser rerun reached Extraction but its UI state read timed out while the encounter was still running. A successful full-floor clear is still unverified. The older seed 417 probe died while crossing optional encounters, so the automation needs more reliable route planning/combat before it can serve as a full-run balance check.
- Two browser runs confirmed the dodge can avoid a Warden shot without losing health or armor. One earlier seed 417 run reported damage while a Brute was nearby, but that result did not reproduce; detailed frame diagnostics are retained to identify the source if it recurs.

- Firing uses the geometric mean of idle and normal time whether stationary or moving. At the default 0.18× idle rate, firing is about 0.42×; idle-only movement remains 1×.
- Added regression cases for held fire with simultaneous movement, a recent movement action, and a metaprogression-adjusted idle rate. All 55 unit tests pass. In the live in-app browser, one shot changed the HUD from 0.18× to 0.42×. Playwright headless remains unavailable here because Chromium cannot register its Mach port in this macOS sandbox.
- The ammo harness uses the gear carry slot, appears in the workbench preview, and applies its multiplier to both manual and empty-magazine reload paths. Its tests cover all 13 guns and stacking with the stabilizer attachment; `npm test` passes 59 tests. The live browser preview confirmed the 1.0-weight tradeoff and successful equip.

- `node --check game.js`; `npm test` — 14 tests pass.
- In-app browser at `http://127.0.0.1:8765/`: started a run, threw frag and incendiary, cycled throwables, moved and fired, opened the workbench, and bought an extended magazine. Scrap went from 40 to 5; magazine capacity rose from 18 to 27 (26 after firing).
- Playwright headless could not start in this macOS sandbox because Chromium failed Mach port registration with permission denied. Used the already-open in-app browser for interaction checks.
- A read-only review caught and fixed two integration issues: Tab could open loadout behind the merchant, and area effects could pass through crates that block bullets.

## Next checks

- Tune the weapon roster, throwable strength, enemy warning time, and rare merchant frequency in longer runs.
- Add a deterministic seed test path; check wall and crate occlusion, dodges at both tempo speeds, merchant stock, and weight-limited purchases.
- Add compact browser integration checks when the local browser test runner can launch in this environment.

## Recent map and enemy AI update

- ROT.js door tiles are kept as walkable openings, widened to two cells, and given visible lintels and posts. Straight generated halls widen from one tile to three tiles without cutting through room perimeter walls.
- Close aligned rooms gain a short two-cell-wide shortcut through their shared wall or a one-tile connector; the original Digger halls remain as alternate routes. Disconnected floor is removed from the entry room's reachable component instead of being cut by a distance heuristic.
- Ranged enemies now keep distance, strafe, retreat when pressured, seek protected positions while reloading or hurt, and flank when walls or smoke block sight. All enemy types predict nearby player shots and dodge into open space. Grid routing steers them around walls, crates, and pillars; pillars also block sight and bullets.
- Added `layout.js` and `layout.test.js` for deterministic map shaping and route invariants, plus `enemy-tactics.js` and `enemy-tactics.test.js` for independently tested combat choices. `render_game_to_text` now includes each enemy's current tactical intent.
- `node --check` passed for the changed JavaScript modules and `npm test` passed all 29 tests. The in-app browser rendered fresh generated floors after correcting a door-frame geometry typo; the latest check showed no new console errors. Playwright headless remains unavailable because Chromium cannot register its Mach port in this macOS sandbox.
- Next: tune door/hall appearance and tactical movement after a longer browser play session; check that enemy routes remain fluid around busy rooms and that short room shortcuts occur often enough in generated floors.

## Seeded run update

- Added a numeric seed field to the title and active-run header. Entering the same seed on another run selects the same ROT.js map RNG sequence; leaving it empty chooses a fresh seed.
- Routed game randomness through ROT.js's existing seeded RNG so props, merchant placement, encounters, pickups, enemy direction/timing, combat rolls, and particles follow the run seed. The only remaining `Math.random()` call chooses a seed for unseeded runs.
- Added range/whole-number validation tests for accepted seeds. `npm test` now passes 30 tests. Opened two browser runs with seed 417; both displayed the chosen seed and showed the same entry layout, with no console errors. The Playwright runner still cannot launch Chromium in this macOS sandbox.
- Remaining core quality work: add distinct room roles/branch rewards, improve workbench signaling and weapon-swap feedback, and tune the full run through longer play.

## Real dungeon generation verification

- Extracted the production ROT.js Digger pipeline into `dungeon.js`, shared by game runs and the browser integration check. It keeps the existing seeded settings, shapes/widens rooms and halls, filters unreachable rooms, and retries once with a larger map when fewer than six rooms survive. A second failure now reports a clear error instead of recursing forever.
- Added `tests/dungeon-generation.html` and `tests/dungeon-generation.js`. They load the same ROT.js 2.1.3 browser import as the game and run the production generator across 64 deterministic seeds twice each. Checks compare serialized maps, verify map bounds, route every room center and extraction from entry, and confirm each returned doorway is walkable.
- Forced a low-room-count first attempt (48×38) to cover the retry branch; it passed on the expected 108×82 fallback.
- Browser integration result: PASS, 64 seeds and retry case. `npm test`: 30 passed; `node --check` passed for `game.js`, `dungeon.js`, and the browser test module. Reloaded the game, started seed 417, and confirmed a valid 9-room floor.
- The standalone Playwright client still cannot launch Chromium in this macOS sandbox (Mach port permission denied); the in-app browser ran the integration harness and game check instead.
- Remaining core quality work: add distinct room roles/branch rewards, tune longer-run balance, improve workbench signaling and weapon-swap feedback, and strengthen gear variety and save controls.

## Enemy projectile dodge tuning

- Gunner rounds now travel at 190 world units per simulation second and Warden rounds at 215, down from a shared 340. This leaves each ranged class distinct while reducing the shot-to-player speed ratio from about 3× to about 1.7–1.9×.
- Added a rule test that checks the post-launch sidestep distance at idle (0.18×) and then-current action (1.32×) tempo from close range. Because the game scales both motion and projectile time together, the world-space dodge window stays the same at each tempo.
- Reloaded the playable build in the in-app browser and launched seed 417 successfully. The standalone Playwright runner remains blocked by Chromium's macOS Mach-port permission failure.
- Next: playtest ranged encounters and tune these values if the new response window makes fights too easy or still feels too tight.

## Time-flow clarity and enemy survival

- Replaced the unclear tempo labels with `STILL · SLOW` and `ACTION · FAST`; added a persistent hint that stopping/releasing fire slows the world and moving/firing speeds it up. The title card teaches the same control. The displayed 0.16× is the player's Still Mind upgrade reducing the base idle rate from 0.18×.
- Encounter composition now limits rushers (Rusher + Brute) to at most half of any group of two or more, guaranteeing ranged support in small combat groups.
- Hurt enemies now seek reachable cover or retreat below 45% health, including melee rushers. Healthy melee enemies retain their aggressive role.
- Added unit coverage for hundreds of seeded encounter mixes and injured/healthy enemy choices. Next: playtest how often hurt enemies break off and whether mixed enemy packs improve the pressure curve.

## SUPERHOT design comparison

- Reviewed SUPERHOT Team interviews and the GDC session summary. The developers describe the core as fluid turn-based action in which the player controls the pace; its strongest combat moments come from readable enemy aim, dodging, close spaces, and improvising with available items.
- Added design guidance to `GAME_SPEC.md`: preserve player-paced time, visible threat tells, improvisational rooms, close but legible spaces, and tactical AI that cannot stall encounters by hiding forever.
- The existing build already has idle/action time states, visible enemy aim lines, fixed-path dodgeable bullets, cover seeking, and low-health retreat. This comparison does not call for copying SUPERHOT's FPS controls or treating its enemy AI as a realistic self-preservation model.

## Ranged spacing, routes, and room cover

- Ranged roles now have explicit engagement bands: Gunners hold 105–300 world units; Wardens hold 88–210. They retreat or sidestep inside their minimum range, and they do not start or finish a shot outside their firing band. Rushers and Brutes remain melee.
- Enemies now advance their route goal when they reach each tile waypoint instead of waiting for the next tactical decision before moving again. This reuses the existing grid search; a new pathfinding library was not needed for these small maps.
- Dead enemies keep their short visual corpse animation, but Rapier colliders are disabled on death so bullets and actors pass through them.
- Room prop placement now adds more crates and pillars, avoids the center, doors, and existing cover, snaps props to tile centers, and avoids spawning enemies inside props or doorways.
- Added tests for ranged minimum/maximum ranges, following a route around a blocking corner, and seeded cover placement/clearance. `npm test` passes 34 tests; `node --check` and `git diff --check` pass. In-app browser seed 417 rendered successfully with no browser console errors; long combat playtest is still limited by the headless Chromium launch restriction.
- Next: playtest more seeds and check whether ranged units reliably hold their ranges while enemies route around the denser cover.

## Varied room outlines and enemy navigation follow-up

- Room generation now assigns deterministic rectangular, L, U, and C footprints. The start room stays rectangular; other shapes keep their center clear and protect doorway approaches so connected rooms remain reachable.
- Increased crate and pillar placement while selecting legal floor tiles away from doors, the center, and existing cover. Enemy spawns also avoid those obstructions.
- Enemies continue along grid waypoints around corners; ranged enemies maintain their minimum and maximum firing distances; dead enemies no longer block bullets or actors.
- Verification: `npm test` passes 35 tests; JavaScript syntax checks and `git diff --check` pass. The browser generation harness passes 64 deterministic seeds (generated twice each) plus the low-room-count fallback.

## Player-paced firing tempo

- Movement now runs at 1.00×. Firing alone uses the geometric mean of idle time and normal speed (about 0.42× at the default 0.18× idle rate), so automatic fire stays slower than normal. Moving and firing together stays at 1.00×.
- The short post-input grace preserves each action's tempo: a released shot stays at firing speed briefly, while releasing movement returns to idle after its brief grace period. Other actions no longer trigger full-speed time.
- Updated the tempo meter, tooltip, title instructions, and spec to explain all three speeds. Added unit checks for simultaneous movement/fire, recent fire/movement, and meta-upgrade idle rates.
- Verification: `npm test` passes 35 tests, including dodge windows at idle, firing, and movement rates; syntax and diff checks pass. The preview loads the new instructions, but Playwright gameplay capture is blocked by Chromium's macOS Mach-port permission error.
- Next: playtest the new firing pace and report any feel changes before further tuning.

## Weapon pickup choices

- Gun pickups now identify the exact weapon and show its class, damage, fire rate, magazine size, and weight before collection. The player can swap either slot or leave the pickup in the room.
- Each swap previews the resulting carry load with current gear weight and disables choices that exceed capacity. Accepting a gun equips it with a fresh magazine and reserve; declining keeps the pickup available for later review.
- Prevented a pickup from equipping the same gun into both slots, including when the player changes loadout after the pickup drops.
- Updated the spec to match the playable 13-gun catalog and pickup behavior.
- Verification: `npm test` passes 37 tests; `node --check` and `git diff --check` pass. The in-app browser renders a live run without errors. The required Playwright client still cannot launch Chromium in this macOS sandbox (Mach-port permission denied), so the pickup modal itself has not received a full browser interaction check.
- Next: exercise the modal through a longer browser playtest once a working automation runtime is available; review workbench gear replacement preview and weapon/ammo edge cases.

## Seeded room roles

- Floors now reserve entry and extraction roles and assign deterministic combat, cache, armory, clinic, and hazard roles to other rooms. The optional merchant replaces only a normal combat room.
- Caches have two defenders and guarantee scrap plus a mod pickup. Clinics are safe and heal. Armories have three defenders and a gun pickup; killboxes have four or five enemies. Reward tiles are reserved before props and enemy spawns so crates and actors cannot cover them. Ordinary rooms retain their existing encounter and loot rules.
- Room names identify special roles in the HUD. The integration harness now checks role stability and reserved entry/extraction while keeping its 64-seed route checks.
- Verification: `npm test` passes 41 tests. The browser generation harness passes across 64 seeds and the fallback map, checking reachable role rooms and reward tiles clear of props. Seed 417 starts in the in-app browser with no console errors. Full combat and role-reward collection still need a longer playtest.
- Next: validate reward spawn placement in all generated room shapes, then add intentional branch and secret-room topology or tune role frequency and enemy budgets.

## Optional cache branch rooms

- Mark rooms optional only when a floor route to extraction still exists with that room's full bounds blocked. This keeps the cache off the required route while preserving a walkable branch; the cache falls back to a reachable middle room if no bypass exists.
- The special-room HUD name is `SIDE CACHE` when its cache occupies a bypassable room.
- Verification: the generated-floor browser harness passes 64 seeded maps twice each plus the fallback map. All 64 seeds had a bypassable branch, and every cache used one; deterministic markers, routes, rewards, and doors passed. `npm test` passes 44 tests, including bypass and sole-route cases. JavaScript syntax and diff checks pass.
- Tempo follow-up: confirmed sustained mouse fire keeps `input.firing` true between automatic shots, and the time-scale rule stays at `sqrt(idleScale)` (about 0.42× at 0.18× idle); movement remains 1×. `npm test` includes the tempo test and passes.
- Next: playtest tempo feel and cache branch reward collection during a longer run; locked reward doors, rest/miniboss rooms, and secrets remain unimplemented.

## Crate feedback and room coverage

- Each room now reserves a crate tile before reward placement, so guaranteed rewards avoid the crate. Crate placement first uses the normal center clearance, then relaxes only that clearance to one tile while preserving floor, door, and occupied-space checks. The browser harness checks every room across 64 seeded floors and the larger fallback map.
- Damaged crates show a short health bar, darken as they weaken, and gain a second crack stage before breaking. Breaking still removes the physics body and cover and can drop scrap. Added pure threshold tests and browser playtested a seeded crate through stage one, stage two, destruction, and its drop.
- Short mouse clicks now fire immediately on press; held fire continues through the existing weapon cooldown, so automatic guns retain their distinct rates. Browser playtest confirmed one ammo is spent on a quick click and the tempo reads 0.42× at the default idle upgrade.
- Verification: `npm test` passes 46 tests. The in-app browser harness passes 64 seeded maps generated twice each plus the fallback map. The live run loaded with no browser errors and the damaged-crate visuals were visible. The standalone Playwright client remains unable to launch Chromium in this macOS sandbox.
- Next: add the crate-break sound with a volume control, then continue the remaining run-quality and gear work.

## Save persistence and reset control

- Added a small storage adapter around the existing progression parser so local-save reads, writes, and clears can be verified without a browser. Added tests for reload round-trips, reset behavior, malformed data, and surfaced storage errors.
- Added a visible Safehouse save-reset button with a native confirmation prompt. Confirming clears coins and permanent upgrades; canceling keeps them.
- Browser verification: the Safehouse panel shows the reset button and the existing 20-coin, zero-upgrade save remained after refresh. A browser automation click accidentally accepted the reset while timing out; the original 20 coins were restored through four ordinary +5 death payouts, then verified after refresh.
- Verification: `npm test` passes 50 tests; `node --check` and `git diff --check` pass. The in-app browser shows the Safehouse with 20 coins and no console errors. Full interaction on the reset confirmation was not re-tested after recovery.
- Next: finish a non-destructive confirmation-cancel browser check when a dialog-safe browser control is available; continue the remaining run-quality and gear work.

## Workbench replacement previews

- Unequipped workbench guns now show the secondary slot they would replace, their current ammo, and the exact rig weight after a swap. Overweight guns show the resulting load and stay disabled. Armor explains missing scrap or excess weight.
- Selecting an eligible gun or armor opens a focused confirmation with stats, the before/after weight, preserved stored ammo, and armor's health/scrap effect. Cancel leaves the loadout unchanged; Escape cancels, Enter confirms, and Tab stays inside the dialog.
- Verification: browser checked cancel and confirm on a rifle swap, confirmed saved ammo remained on the stored shotgun, then confirmed the Mica 9 + armor loadout (weight 4.6/7.0, scrap 40→15, health 5→6). The browser also showed two heavy guns disabled with their exact resulting weight and the preview focus trap passed. `npm test` passes 50 tests; syntax and diff checks pass; browser console has no errors.
- Audio-library research found the native Web Audio API is enough for a few short effects and a master volume; Howler.js remains an option if the game adds a larger audio library. No audio dependency was added.
- Next: add the distinct crate-break sound and master volume control, then add reduced shake/flash settings and continue repeated-run tuning.

## Initial game audio and master volume

- Used the browser's Web Audio API rather than adding an audio package: this slice needs two short procedural sound cues, and the API's gain node supplies the master-volume control.
- Player shots now have category-shaped gunfire, and broken crates layer a descending thump with filtered crack and splinter noise. The title screen has a 0–100% master-volume slider, defaults to 65%, and saves the validated setting separately from run coins.
- Audio context starts from the player's Start click to meet browser gesture requirements. Sound nodes share one master gain and are skipped at zero volume.
- Verification: volume changed from 65% to 50%, survived a refresh, then was restored to 65% and verified after refresh. A live run played three shots into a 60-HP crate until it broke; the crate disappeared and the browser reported no errors. `npm test` passes 55 tests, including malformed/out-of-range settings and persistence; syntax and diff checks pass. Listening-based sound-level and quality tuning remains open.
- Next: playtest and tune the new sounds, then add reduced shake/flash options and remappable controls.

## Room Sense scouting upgrade

- Added a capped, permanent Room Sense track to the version 1 save. It reveals nearby room silhouettes and enemy blips on the minimap through walls at 15, 25, or 35 tiles; it does not affect projectile blocking.
- The base minimap now hides unexplored rooms and enemy locations outside visited rooms, so the scouting upgrade adds information rather than repeating a map that already revealed every threat.
- Added tests for scan range boundaries, exact room edges, visited contacts, persistence, and capped purchases. `npm test` passes 58 tests, and syntax plus `git diff --check` pass.
- Browser verification: the current preview at `http://127.0.0.1:8767/` shows the Room Sense card, exact range tiers, and its 35-coin first purchase; a fresh run shows only the entry room on the minimap. This uses a separate preview origin from the existing `8766` save. The headless Playwright runner remains blocked by the macOS Mach-port permission error.
- Next: add a gear scanner; armor durability arrived in the latest iteration below.

## Shotgun shells and rifle penetration

- Added three selectable Street Sweeper shells on `C`: 9-pellet buckshot, wide/short 16-pellet birdshot, and accurate long-range slug. Each volley consumes one shell and the active type appears in the HUD and game-state text.
- Lynx and Quill pierce multiple enemies and crates; the Mule pierces more targets and one connected wall section. Projectile impacts are swept and processed in travel order, and sensor colliders let the combat rules handle impact and penetration consistently.
- Added tests for shell tradeoffs, weapon penetration budgets, swept enemy hits, wall traversal, and connected multi-tile wall thickness. `npm test` passes 63 tests; syntax and diff checks pass.
- Live in-app browser check: started a fresh seeded run, selected the Street Sweeper, cycled from buckshot to birdshot, and fired once; ammo changed from 6 to 5 and the HUD showed Birdshot. The screenshot showed the visible shell toast and active ammo label. The standalone Playwright runner still cannot start Chromium because this sandbox denies Chromium's macOS Mach-port registration; the in-app browser provided the gameplay check.
- Next: do a longer encounter pass for rifle penetration and shotgun balance; proceed with the remaining run-quality and accessibility items in the spec.

## Room clear ownership fix

- Every spawned enemy now carries its encounter room index. Room completion and its scrap reward wait for those enemies to die even if a tactical retreat or chase takes them into a hall or another room.
- Added a pure room-role predicate and a regression test covering living enemies outside the room bounds, unrelated encounters, and corpses. `npm test` passes 64 tests; syntax and diff checks pass.
- Next: continue the spec's unfinished run-quality and gear work; in particular, tune healing against armor as separate systems and add rest/miniboss/secret room variety.

## Armor durability and repairs

- Replaced the armor plate's extra-health bonus with two separate durability points. Incoming hits wear the plate first; damage beyond its remaining durability reaches health. Fully absorbed hits show distinct plate feedback, and the HUD hides the plate meter when no armor is equipped.
- The workbench previews armor durability and offers a 10-scrap repair when the equipped plate is worn. Armor occupies the same 1.5 carry weight, so it still trades off against heavier guns; a plate can exactly fill the default 7.0-weight loadout.
- Corrected merchant gear pricing so its displayed markup is also charged on purchase.
- Verification: `npm test` passes 65 tests. Live in-app browser equipped the plate from the workbench, confirmed 5 health remained unchanged, showed `PLATE 2 / 2`, and showed the loadout at 7.0 / 7.0 weight with scrap reduced from 40 to 15. Syntax and diff checks pass. Armor damage and repair after an in-run hit still need a longer browser combat check.
- Next: test plate absorption and the repair flow after taking damage during a run; implement the scanner gear, then continue balance and run-quality playtests.

## Hidden cache branch

- The guaranteed cache is now a secret only when the room generator places it on a bypassable branch. Until the player enters, its map outline and enemy blips stay hidden even when Room Sense is upgraded; entering reveals the SIDE CACHE name and discovery toast. Floors without a branch retain a reachable, non-secret cache fallback.
- Added role tests for branch/fallback secrecy and minimap tests proving scans cannot reveal undiscovered secrets. Expanded the generated-floor check to verify secret naming and branch status across 64 seeds generated twice, plus the fallback map; every tested seed had a branch and secret cache.
- Verification: `npm test` passes 66 tests; JavaScript syntax and `git diff --check` pass. The live dungeon-generation page visibly shows PASS for all 64 seeds generated twice, branch/cache status, deterministic routes, safe reward placement, and fallback generation. The standalone Playwright action runner is still blocked by this Mac sandbox's Chromium Mach-port permission error; the in-app browser ran the generator harness successfully.
- Next: build a longer combat/browser check for armor repair, then add rest/miniboss room variety.

## Fight-only room-clear rewards

- Safe clinic, merchant, and empty rooms no longer grant the 20-scrap encounter-clear payout. The room still counts as visited/cleared; the bonus requires that the room actually spawned an enemy encounter.
- Added a focused regression test that distinguishes an empty room from a defeated encounter; the room ownership check still credits enemies that leave their spawn room.
- Verification: `npm test` passes 67 tests; JavaScript syntax and `git diff --check` pass. The web-game Playwright runner remains blocked by the local Chromium Mach-port permission error.
- Next: playtest armor damage and repair in a full encounter; the Warden miniboss and FIELD CLINIC rest loop are covered below.

## Warden miniboss room

- Larger floors now guarantee one WARDEN room. It pairs a guard with a tougher, slower brute that has 200 health, 2-damage contact hits, a larger collider, and a distinct amber silhouette. The encounter uses existing enemy tactics and collision rules. Its room guarantees scrap and an attachment reward; clearing it still earns the normal fight reward.
- Small floors keep their existing role count and may receive a regular utility room instead. FIELD CLINIC already acts as a safe rest stop with a guaranteed healing pickup.
- Added room-role checks for the elite's roster, count, rewards, and large-floor guarantee. The production dungeon harness passes 64 deterministic seeds twice each and the fallback map; a live seeded run starts with no browser errors. `npm test` passes 67 tests; syntax and diff checks pass.
- Added an overhead Warden health bar that tracks its position and health, then disappears when it is defeated. `npm test` passes 67 tests; `node --check game.js` and `git diff --check` pass. A seeded run starts in the in-app browser and the live screen renders correctly; the automated Playwright runner remains blocked by this machine's Chromium sandbox.
- Next: playtest the Warden fight/reward balance and test armor breaking and repair during combat.

## Locked cache gate

- Optional cache branches receive a reinforced gate when the generator can identify a doorway cut that blocks the cache but preserves extraction. The player spends 18 run scrap and presses E to open it.
- Closed gate cells feed the same blocked map used by enemy routing, sight, and swept projectile collision, and a Rapier collider blocks player and enemy movement. Standard shots stop at the gate; anti-materiel rifles can use their one-wall penetration. The interaction hint shows the price. If a safe gate cannot be found, the hidden cache stays reachable without one.
- Unit coverage verifies a closed gate separates a reward room while leaving the extraction route open. Scrap-gate rules also verify that insufficient funds are untouched, the exact price is deducted, and an opened gate cannot charge twice. The production dungeon harness checks 64 seeds twice each, requires a valid gate on at least one third of seeds, validates gate-open reachability, and prints a repeatable gate seed. A follow-up caught and filtered invalid one-tile gate candidates. The final browser run passed all 64 seeds, found safe gates on 24/64, and prints seed 1 as a repeatable example. `npm test` passes 71 tests. A fresh game page loads in the in-app browser. Long-form movement to the gate and live E interaction still need a manual playthrough.
- Next: exercise gate interaction and scrap deduction in a longer run; continue Warden balance and armor repair playtests.

## Loot scanner gear

- Added a third carry-weighted gear choice: the 32-scrap Loot Scanner weighs 1.0 and marks available guns, attachments, healing, and scrap within seven tiles on the minimap, even through walls. It leaves extraction markers unchanged and hides loot in undiscovered secret rooms.
- The existing workbench and merchant gear paths offer it using its catalog weight and price; the equip toast now describes reload acceleration only for the ammo harness.
- Unit tests cover scan distance, unavailable pickups, secret-cache hiding, scan range, price, and the weapon-plus-scanner weight tradeoff. `npm test` passes 73 tests; syntax and diff checks pass. Visual in-run minimap confirmation still needs a longer browser playthrough.
- Next: tune healing and armor over longer runs, playtest Warden balance, and verify scanner visibility during a live run.

## Visual accessibility settings

- Added saved title-screen sliders for camera-shake strength and flash-grenade screen brightness. Zero shake removes camera movement; zero flash brightness removes the brief screen overlay without changing grenade stun or range.
- The flash overlay fades on real time, including while paused or after a run ends, so a pause cannot leave a bright screen stuck in place.
- Added settings-store and effect-scaling tests. `npm test` passes 78 tests; syntax and diff checks pass. The in-app preview's accessibility tree shows both sliders at 100%. Full gameplay visual verification remains limited because the Playwright browser fails to launch under this host's Chromium Mach-port permissions.
- Next: complete a manual flash-grenade playtest, then continue run-balance and combat-accessibility work.

## Remappable keyboard controls

- Added saved bindings for four movement directions, interaction, reload, weapon slots, throwable select/use, and shotgun shell cycling. Escape, Tab, F, and R remain fixed for pause, loadout, fullscreen, and restart. Key hints update with the selected bindings.
- Rebinding rejects duplicate and reserved keys, supports letters, numbers, arrows, Space, and Shift, and falls back to defaults if saved data is corrupt. Starting a run clears any held key input.
- Unit tests cover storage, collisions, reserved keys, recovery from invalid saves, custom movement vectors, and diagonal normalization. `npm test` passes 83 tests; syntax and diff checks pass.
- A live preview caught a missing key-guide element id that stopped boot; it is fixed. I rebound Interact to T, confirmed the key guide updated, restored E, and reloaded to confirm the default. The controls panel shows all 11 actions. The prescribed Playwright check still cannot launch Chromium on this host.
- Next: playtest controls through a full run, then focus on healing/armor balance, combat tuning, and room-to-room pacing.

## Optional third weapon slot

- The final CARRY RIG tier now unlocks a third weapon slot while the starting loadout stays at two. A third gun can be added at the loadout station, from a pickup, or through a shop purchase; once the rig is full, the active slot is the default replacement choice at the station and shops.
- All add, replace, pickup, and merchant paths use the shared weight-aware replacement rule, including equipped gear weight. The slot uses the remappable `3` weapon binding; older keybinding saves retain their other choices.
- Added tests for the tier unlock, legacy binding saves (including a prior key mapped to `3`), and third-slot weight/duplicate behavior. `npm test` passes 85 tests; JavaScript syntax checks and `git diff --check` pass. The in-app browser loads the current build, shows the remappable tertiary key, and starts a run with the expected two-weapon default. A live unlock/pickup of slot 3 still needs a profile with enough permanent coins to buy the final Carry Rig tier.

## Particle budget and physics cleanup

- Particle bursts now keep at most 240 active meshes. New impacts replace the oldest particles first, and every evicted or naturally expired mesh has its geometry and material disposed.
- Run resets now call Rapier `World.free()` before creating the next physics world, releasing its WASM-owned systems. The API documents `free()` as releasing the world and all fields it owns.
- Added budget tests for overlapping bursts, over-sized requests, invalid values, and exact cap behavior. Verification: `npm test` passes 87 tests; JavaScript syntax and `git diff --check` pass. A Playwright browser smoke check launched a seeded run, moved the player, fired once (ammo 18→17), and captured gameplay with no browser console errors. The screenshot was visually inspected. A repeated full-run memory profile is still pending.
- An independent lifecycle review confirmed that the burst path evicts oldest particles and disposes their meshes, natural particle expiry disposes resources, and the run reset frees the previous Rapier world before replacement.

## Brute melee telegraph

- Removed random per-frame heavy contact damage from Brutes. They now commit to a bright directional swing, wait 0.48 simulation seconds, then deal two damage only if the player remains within reach and the committed forward arc. A 0.9-second recovery prevents instant repeat attacks; bullets cancel an active wind-up. Rushers keep their lighter contact behavior.
- Added pure timing and hit-arc tests for telegraph, single strike, recovery, range, sideways dodges, and blocked sight. An independent review caught and fixed wall/smoke attacks by requiring sight both to begin a swing and to land it. `npm test` passes 90 tests; syntax and diff checks pass.
- Seed `213838321` now drives a repeatable Playwright encounter: tile-path movement reaches the first Brute, `render_game_to_text()` reports `charging: true`, and the screenshot confirms a bright locked direction beam plus a strong body glow. No browser console errors occurred. The player lost two health to ranged fire during the first six game seconds, so ranged pressure needs more repeated tuning.

## Weapon replacement policy review

- Moved the shared slot choice order into the pure loadout rules module. Pickup eligibility, workbench assignment, and merchant weapon stock now consult one policy for new-slot preference, primary/secondary replacement order, active-slot preference, duplicate rejection, carry capacity, and gear weight.
- Added tests for all three slot priorities plus gear weight, heavy guns, and duplicate rejection. `npm test` passes 91 tests; syntax and diff checks pass.

## Early combat pacing

- The first two ordinary combat rooms now cap at three enemies, while later ordinary rooms keep their two-to-four roll. Special room budgets (cache, armory, hazard, elite) stay tied to their roles.
- This gives the opening fights a little more room for players to learn tells and dodge before the run scales up. Added tests for early, later, and unaffected special-room budgets; `npm test` passes all 91 tests.
- Expanded the production dungeon browser harness to verify that generated rooms are processed by their shortest path from entry and that special rooms do not consume the ordinary-combat ordinal. It passes across 64 seeds generated twice, plus the fallback map; 60/64 tested floors reached a later ordinary combat room.
- Seed 213838321 showed a visible Brute charge tell; a perpendicular 450 ms sidestep moved the player 50 world units and preserved health at 4/5. An active movement/fire exchange killed one Brute in about 3.6 simulation seconds with 10 rounds and ended at 3/5 health. Seed 417 reached a Brute at 4/5 health and dealt 44 damage in 11 rounds; it stayed alive and the fight remained in progress. Both runs had no browser errors, so these samples do not justify another damage or cadence change.
- Added `tests/game-smoke.html` for a repeatable in-browser check of boot readiness, seeded start, movement at 1×, blended firing tempo, bullet damage to a destructible crate, magazine reload, a real extended-magazine purchase, frag detonation, pause, and the two-slot loadout. It verifies Tab opens/closes the loadout and Escape pauses time, and leaves the run paused. A separate clean Playwright run confirmed the saved 25-coin profile survives reload and reported no console or page errors.
- Re-ran the expanded browser smoke on seed 213838321: movement advanced 53 units at 1×, firing stayed blended at 0.42×, the aimed crate went from 60 health to destroyed, reload refilled 12 to 18 rounds, the frag detonated, and the extended magazine changed the active weapon. The run ended paused with all five health and 15 saved coins in the isolated localhost profile. `npm test` passes all 93 tests.
- Extended the browser check with an isolated 25-coin save fixture: buying Runner’s Legs spends 25 coins and advances it to level 1; both values survive a game reload. The fixture is restored and the game frame reloaded afterward, preserving the browser’s prior save.
- A lifecycle review found no cross-room or run-reset resource leak; physics is freed and particles stay capped. Profile before changing the main scaling costs it identified: enemy separation is quadratic in live enemy count and the minimap redraws all floor tiles each frame. Next: tune healing/armor and full-run length, then profile sustained play.
- A warmed-up seeded entry-room profile ran 240 frames each in idle, movement, and firing batches. Average update/render cost was about 0.83 / 1.33 / 1.18 ms per frame; the slowest 12-frame batches were 16.5 / 21.3 / 18.9 ms. It stayed at 5/5 health with no browser errors, but firing emptied the magazine and it did not profile later floors, so these numbers do not close the full-run performance TODO.
- A scripted same-seed comparison followed the 28-tile route from ENTRY into FURNACE and cleared that first combat room in both loadouts. With no armor, health fell 5→3; with the 25-scrap plate, armor fell 2→0 while health stayed 5. Both runs ended the room at two kills after spending 13 rounds, with no browser errors and the saved profile restored. This supports the plate's two-hit buffer in one encounter but is not enough to tune repair cost or full-run healing.

## Loot rarity and Lucky Find

- Attachment drops now roll common, uncommon, rare, or prototype quality. The tier stays attached to its owning gun and scales that attachment's combat effect; the HUD/workbench and pickup toast show a text label as well as the loot color.
- Added the three-level Lucky Find safehouse upgrade. It shifts mod-drop odds from 75/20/4.5/0.5% to 60/27.5/10.5/2% across the four tiers, without adding more drops. Existing version-1 saves load with Lucky Find at level 0.
- Verification: `npm test` passes 98 tests; `node --check` and `git diff --check` pass. The in-browser seeded smoke check passed rarity-tagged drops, persistent common attachment quality, focus-loss pause, and Runner/Lucky Find purchases persisting after reload. It restored the browser's original save.
- Next: validate quality progression through a longer human run and keep tuning attachment effects if high tiers dominate. Full-floor completion and longer-run balance/performance remain open.

## Room cache choices

- Cache rooms now place one interactable cache box rather than dropping scrap and an attachment automatically. Clearing the cache room unlocks a paused choice of ammo, health, an attachment, a prototype attachment for one health, or 35 scrap.
- The scrap choice is always available, so full health/ammo or a fully upgraded gun cannot strand the player in the menu. The cache closes without taking its reward when Esc is pressed.
- A pure cache-choice rule keeps the scrap option available when ammo, health, and attachment rewards are exhausted. Regression tests cover that full-inventory case.
- Verification: `npm test` passes 100 tests and JavaScript syntax checks pass. The browser smoke could not load the game libraries in the locked desktop session; the new dialog therefore still needs a live in-browser check. The prior seed smoke passed before this cache change.

## Combat and run audio cues

- Added reload sounds for player and enemy reloads, a throttled enemy aim tell, distinct pickup cues, room-clear music sting, and an extraction cue.
- Added a mute button next to the volume slider. The mute preference is saved with the existing volume setting, while older saved volume records still load as unmuted. Muting leaves the chosen volume intact.
- Verification: `npm test` passes all 102 tests; `node --check audio.js`, `node --check game.js`, and `git diff --check` pass. The live browser check is pending because the desktop Mac is locked and automatic unlock failed; the game tab remains open at localhost for a later check.
- Next: unlock the desktop and verify the mute button and audio cues during play, including that changing volume while muted remains quiet and unmutes to the saved level.

## Workbench keyboard focus

- Opening the workbench now moves focus to its close button. Tab and Shift+Tab wrap through enabled workbench controls, while Escape or the close button returns focus to the game canvas. The workbench is labeled as a modal dialog, and its footer now advertises Escape to close.
- Expanded the seeded browser smoke to check initial focus, both wrap directions, Escape close, and focus return. Added a Web Audio stub test that verifies mute sets master gain to zero, changing volume while muted stays silent, and unmuting restores the latest volume.
- Verification: `npm test` passes all 103 tests; `node --check game.js`, `node --check tests/game-smoke.js`, and `git diff --check` pass. Live browser smoke is unavailable while the Mac is locked and the localhost server is unreachable.

## Safehouse and run-end focus

- Safehouse upgrades are now labeled as a modal dialog, receive focus when opened, keep Tab navigation inside the panel, and return focus to their opener when closed. Escape also closes the safehouse. Run completion moves focus to the retry button.
- The seeded browser smoke now checks safehouse focus entry and return. Live browser verification remains pending because the Mac is locked and port 8767 is unreachable.
- `npm test` passes all 103 tests; `node --check game.js`, `node --check tests/game-smoke.js`, and `git diff --check` pass.

## Defensive Brute behavior

- A Brute now cancels an active melee wind-up when its tactical AI chooses to dodge, retreat, or seek cover. That makes projectile dodges take priority over a committed swing instead of leaving the player to eat a hit after the enemy already chose safety.
- Added a regression test that feeds an incoming bullet through the tactic chooser and verifies the Brute swing is interrupted. `npm test` passes all 104 tests; `node --check` and `git diff --check` pass. Live combat review still needs the browser session.

## Optional encounter branches

- Extraction now requires all living enemies in rooms on the main route to be defeated, while enemies in rooms marked as optional branches no longer block leaving. Unknown enemy room references still block extraction safely.
- Added unit coverage for both required-route and optional-branch cases. `npm test` passes all 105 tests; JavaScript syntax and diff checks pass. A browser run is still unavailable in this locked desktop session.

## Room-aware combat probe

- The gameplay snapshot now includes each living enemy's encounter room and a per-room count of living enemies. The seeded browser smoke checks that all 20 enemies belong to a reported room and that the snapshot exceeds the old 12-enemy and 8-pickup caps.
- Added `tests/full-floor-browser-harness.html` for a repeatable two-encounter browser probe. On seed 213838321 it cleared FURNACE (3 enemies, 5 health, 1/2 plate durability left, 18→3 magazine rounds, 15→63 scrap) and fought THE VAULT for 1,800 steps (2 kills, 4/5 health, plate broken, 1 enemy alive, 63→83 scrap). The harness pauses before restoring its saved profile. This is a useful resource sample, but the second encounter's partial clear and automated combat style do not justify balance changes.
- Verification: `npm test` passes 93 tests; syntax checks and `git diff --check` pass. The seeded in-browser smoke confirms movement, blended shooting tempo, crate destruction, reload, frag detonation, loadout changes, safehouse persistence, and full enemy/pickup snapshots. The two-room probe reports no game-frame runtime errors and restores the original test profile.
- Next: repeat the second encounter with a stronger movement/dodge controller or a human playtest; gather longer-run healing and repair data before tuning prices or damage.

## Salvager room-clear bonus

- Salvager now raises combat room-clear scrap by 2 per tier (20 base, up to 26) as well as raising crate-drop odds. Its safehouse description spells out both effects; room-clear rewards use the saved upgrade stats and show the actual amount earned.
- Added tier coverage for all three Salvager levels. `npm test` passes all 92 tests and the seeded browser smoke check passes with no change to the saved profile.
- Next: playtest healing and armor balance over longer runs, then profile sustained full-floor performance.

## Architecture review

- Removed the duplicate Room Sense tile-size constant by deriving its pixel range from `catalog.js`'s `TILE`; the capped-tier test now calculates expected ranges from the same shared unit. `npm test` passes all 92 tests.
- Reviewed `makeLevel()` and kept it as the lifecycle coordinator: extracting a room-population helper would move code but still share the same global game state, without improving a current change path. The browser harnesses remain manual checks alongside the Node suite.

## Arrow-key movement

- The README advertised arrow keys, but isolated browser play exposed that only WASD actually moved the player. Added arrow aliases for default movement; an arrow bound to another action or a remapped direction keeps its assigned meaning.
- Added mapping tests and changed the browser smoke check to exercise right-arrow movement when that key is free, while honoring saved remaps. `npm test` passes all 93 tests. The browser smoke confirms +53 movement at 1×, firing at 0.42×, ammo use, pause, and the two-slot loadout. An isolated browser action burst moved the player 106 world units with the arrow key; its screenshot was inspected.

## Visible enemy aim and seeded encounter validation

- Ranged enemies now begin their aim tell only when their position is inside the orthographic camera view. The view width follows the same camera aspect calculation used on resize. They cancel the shot if they leave view before firing. The strict view bounds have finite-input and edge-boundary unit cases.
- Architecture review removed the unexplained off-screen allowance and moved the firing visibility check into the actual shot decision, so aim visibility cannot become stale during the tell. The dodge probe now clears every other enemy before isolating one shooter, waits for all older crossfire to leave, aims its hit check at the player's position when the fresh bullet is observed, ignores shots that would miss, and fails if health or armor changed at any frame of the dodge.
- Verification: `npm test` passes all 107 tests; syntax checks and `git diff --check` pass. The updated in-app browser harness passes seeds 417 and 213838321: each clears its first combat room, opens the affordable 18-scrap cache gate, and dodges a fresh shot whose path would hit a stationary player at 0.18× planning time; movement is 1.00× and health/armor stay unchanged during the dodge. No browser errors were reported. The standalone Playwright client still cannot start Chromium in this macOS sandbox (Mach-port registration is denied), so the in-app browser harness supplied the end-to-end check.
- Improved the seeded browser encounter driver so navigation is not interrupted by its own projectile dodges, and its dodge probe isolates ranged fire from active melee attackers and previous shots. Seed 417 now clears FURNACE (3 enemies), opens the 18-scrap reward gate, and dodges a fresh gunner bullet that would hit if stationary: planning at 0.18×, movement at 1.00×, and health/armor unchanged through impact. The probe restores its saved profile and reports no browser errors.
- Verification: `npm test` passes all 107 tests; `node --check` passes for the gameplay and browser harness modules; `git diff --check` passes. The in-app browser scene and HUD screenshot were visually inspected.
- Seed audit: 213838321, 417, and 9001 each cleared their first combat encounter; 213838321 and 417 also opened the affordable 18-scrap gate. The fresh-shot dodge passed on all three after allowing the 0.35-second post-fire blend to settle when necessary. Seed 123456789 was much harsher: the simple probe driver died after 7 kills and 3 rooms before it could finish its selected encounter, so it remains a balance and route stress case rather than a passing probe.
- Remaining: improve the probe's stalled-route diagnostics, manually play a full floor for balance, and profile sustained full-floor performance. These short browser probes do not replace that longer human playtest.

## Seeded combat probe reliability follow-up

- The combat driver now dodges incoming bullets before fighting enemies encountered while navigating, and the dodge check still proves that a real ranged bullet would hit a stationary player before the sidestep. It also selects the Street Sweeper at close range when that weapon is in the saved loadout.
- A stalled waypoint now triggers up to two route recalculations, and failed travel events report path length, current room, health, kills, and whether the player died en route.
- Verification: `npm test` passes 119 tests; seeds 417 and 9001 clear their first combat room and confirm a 0.16× planning pace with 1× dodge movement and no browser errors. Seed 417 also opens the affordable cache gate after the route-replanning change.
- Seed 123456789 now reaches THE GALLERY instead of stalling on its stale route, but the stationary test driver still fails to clear two Gunners after 1,800 steps (4/5 health, armor depleted, 5 total kills). Its result is still not a human-playtest balance verdict; the driver ignores grenades and pickups and does not strafe while firing.
- Remaining: improve the probe's combat policy, play a full floor manually for balance, and profile sustained full-floor performance.

## Vital Reserve and combat probe policy

- Added the missing permanent health upgrade requested for the safehouse. Vital Reserve has three tiers, each adds one maximum health, and a new run starts fully healed at its upgraded maximum. Old version-1 saves default the new tier to zero.
- The combat probe now fires in short strafes and can throw a frag when multiple enemies are clustered close to the player. This gives the stress test a more representative use of movement and the starting inventory.
- Browser smoke uncovered stale cached imports after a source edit; versioned the progression and save-store imports so the browser loads the same current code that Node tests exercise.
- Verification: `npm test` passes 120 tests. The in-app browser smoke purchased Vital Reserve, reloaded the safehouse, started a new run at 6/6 health, completed its existing movement, crate, reload, burst, frag, pause, and save-restoration checks, and reported PASS. The updated seeded probe also clears FURNACE on seed 417, opens the 18-scrap gate, and dodges a real incoming shot with no damage; no browser errors were reported. Seed 123456789 now clears THE GALLERY with 9 kills but only 1/5 health, so it remains a stress case rather than a full-run balance verdict.
- Remaining: play a full floor manually, tune health/armor and enemy pressure across runs, and profile sustained full-floor performance.

## Timed KITE BURST

- KITE BURST was labeled as a three-round burst but `playerShoot()` emitted its `count:3` bullets in one frame and spent one round. It now spends one round per bullet across a committed, world-time-spaced sequence; releasing fire lets the sequence finish, manual reload is ignored until it ends, and switching guns cancels queued shots. Final partial bursts use only the rounds still in the magazine. This keeps shotgun pellets as one trigger and one shell.
- The active burst keeps firing tempo blended through all queued shots. Workbench and pickup previews report sustained cyclic RPM for burst weapons.
- Added scheduler tests for interval timing, ammo limits, partial bursts, switch cancellation, and the distinct shotgun profile. Expanded browser smoke to equip KITE BURST, fire one click, release, verify the two queued shots spend the remaining rounds, and ensure reload cannot interrupt the sequence.
- Verification: `npm test` passes all 111 tests; JavaScript syntax and `git diff --check` pass. In-app browser smoke on seed 213838321 passes the complete run of existing checks plus KITE BURST ammo 24 → 21 after one released trigger. The smoke also confirms the active burst keeps firing at 0.42×. The browser reported one unattributed `MutationObserver.observe` error; no matching observer code exists in this repository, so the console is not claimed clean.
- An initial browser attempt exposed that the iframe served a cached `catalog.js`; adding a versioned import makes the updated burst profile load reliably. The final smoke passed after cache-busting both the game and catalog modules.

## Ordered bullet impacts

- Extracted the live bullet-impact ordering and penetration-budget decision into `projectile-impacts.js`; `updateBullets()` now applies damage/effects only to the ordered impacts returned by that same policy. This keeps swept hit detection and Three.js/Rapier effects in the browser adapter.
- Added tests for a sniper's ordered enemy hits, independent enemy/crate budgets, the anti-materiel wall allowance, ordinary cover/player stops, and candidate ordering without mutation. This closes the prior gap where tests covered penetration counters but not which in-flight contacts the runtime accepts.
- Verification: `npm test` passes all 115 tests; game/module syntax checks and `git diff --check` pass. In-app browser run loaded the cache-busted module, began a run, and fired a shot (ammo 18 → 17) without browser errors.

## Modal keyboard focus

- Applied the shared Tab-wrap rule to weapon pickup, room cache, merchant, and nested loadout-confirmation dialogs; safehouse and loadout use the same helper.
- The seeded browser smoke had assumed every profile fired at exactly 0.42×. It now derives the expected blended tempo from the saved idle-time upgrade, so the check also works with a progressed profile.
- Verification: `npm test` passes all 119 tests; syntax checks and `git diff --check` pass. The in-app browser smoke passes on seed 213838321, including movement, crate destruction, reload, KITE BURST, throwables, loadout, nested-confirmation Tab/Shift+Tab wrap, and persistent upgrades. Browser tooling reported an unattributed `MutationObserver.observe` error from the harness environment; the smoke itself passed.
- Made the ranged-combat browser probe derive planning tempo from the saved Stillmind upgrade, and reran seed 417 with the existing 0.16× profile. It cleared FURNACE (3 enemies), opened the cache gate, dodged a fresh shot that would hit a stationary player, kept health/armor unchanged, reported no game errors, and restored local storage.
