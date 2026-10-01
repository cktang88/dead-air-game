# DEAD AIR progress

Original prompt: Build a playable top-down 2D slow-motion dungeon shooter with generated rooms, varied enemies and loot, destructible crates, metaprogression, weighted weapons, throwables, rare scrap merchants, and clear, dodgeable enemy fire.

## Current playable build

- Three.js renders the arena; Rapier 2D handles actor, cover, wall, and projectile physics; ROT.js Digger generates connected rooms and halls.
- Waiting slows the simulation; moving or firing speeds it up. Menus pause the run.
- Thirteen guns cover 3 assault rifles, 4 SMGs, 2 pistols, 3 sniper/anti-materiel rifles, and 1 shotgun. Two weighted slots keep independent ammunition. Attachments are compatible per gun and affect the active gun only.
- Player and enemy weapons visibly follow aim. Player reload and enemy reload poses tilt their weapons. Ranged enemies show a committed direction before shooting; their bullets travel on that fixed path and can be dodged.
- Smoke, flash, frag, and incendiary grenades have physics-driven throws, inventory counts, and distinct area effects. Walls and intact crates block applicable effects.
- A rare black-market room pauses the run and sells a gun, compatible attachment, armor, healing, or throwable refill for scrap. Weapon purchases replace the secondary and obey carry weight.
- A weighted armor plate adds one health and competes with heavier weapon choices. Death and extraction award persistent coins; safehouse upgrades change movement speed, idle time, crate loot, or carrying capacity.
- Four enemy types, destructible 60-HP crates, room-clear rewards, extraction, minimap, screen shake, hit stop, knockback, particles, and sliding corpses.
- Runs accept an optional positive numeric seed in the start screen and display the active seed. ROT.js's seeded generator now drives map generation, encounter placement, loot, combat rolls, and visual effects.

## Verification

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
- Remaining core quality work: verify generated entry-to-exit connectivity over a batch of seeds, add distinct room roles/branch rewards, improve workbench signaling and weapon-swap feedback, and tune the full run through longer play.
