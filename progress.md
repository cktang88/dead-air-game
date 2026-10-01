# DEAD AIR progress

Original prompt: Build a playable top-down 2D slow-motion dungeon shooter with generated rooms, varied enemies and loot, destructible crates, metaprogression, weighted weapons, throwables, rare scrap merchants, and clear, dodgeable enemy fire.

## Current playable build

- Three.js renders the arena; Rapier 2D handles actor, cover, wall, and projectile physics; ROT.js Digger generates connected rooms and halls.
- Waiting slows the simulation; movement alone runs at 1.00× and firing blends idle and normal time, including while moving. Menus pause the run.
- Thirteen guns cover 3 assault rifles, 4 SMGs, 2 pistols, 3 sniper/anti-materiel rifles, and 1 shotgun. Two weighted slots keep independent ammunition. Attachments are compatible per gun and affect the active gun only.
- Player and enemy weapons visibly follow aim. Player reload and enemy reload poses tilt their weapons. Ranged enemies show a committed direction before shooting; their bullets travel on that fixed path and can be dodged.
- Smoke, flash, frag, and incendiary grenades have physics-driven throws, inventory counts, and distinct area effects. Walls and intact crates block applicable effects.
- A rare black-market room pauses the run and sells a gun, compatible attachment, armor, healing, or throwable refill for scrap. Weapon purchases replace the secondary and obey carry weight.
- A weighted armor plate adds one health and competes with heavier weapon choices. Death and extraction award persistent coins; safehouse upgrades change movement speed, idle time, crate loot, or carrying capacity.
- Four enemy types, destructible 60-HP crates, room-clear rewards, extraction, minimap, screen shake, hit stop, knockback, particles, and sliding corpses.
- Runs accept an optional positive numeric seed in the start screen and display the active seed. ROT.js's seeded generator now drives map generation, encounter placement, loot, combat rolls, and visual effects.

## Verification

- Firing uses the geometric mean of idle and normal time whether stationary or moving. At the default 0.18× idle rate, firing is about 0.42×; idle-only movement remains 1×.
- Added regression cases for held fire with simultaneous movement, a recent movement action, and a metaprogression-adjusted idle rate. All 55 unit tests pass. In the live in-app browser, one shot changed the HUD from 0.18× to 0.42×. Playwright headless remains unavailable here because Chromium cannot register its Mach port in this macOS sandbox.

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
- Next: add a health item / gear scanner and armor durability; then playtest scan range in combat and tune the remaining room and run balance.
