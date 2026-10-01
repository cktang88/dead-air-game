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

## Verification

- `node --check game.js`; `npm test` — 14 tests pass.
- In-app browser at `http://127.0.0.1:8765/`: started a run, threw frag and incendiary, cycled throwables, moved and fired, opened the workbench, and bought an extended magazine. Scrap went from 40 to 5; magazine capacity rose from 18 to 27 (26 after firing).
- Playwright headless could not start in this macOS sandbox because Chromium failed Mach port registration with permission denied. Used the already-open in-app browser for interaction checks.
- A read-only review caught and fixed two integration issues: Tab could open loadout behind the merchant, and area effects could pass through crates that block bullets.

## Next checks

- Tune the weapon roster, throwable strength, enemy warning time, and rare merchant frequency in longer runs.
- Add a deterministic seed test path; check wall and crate occlusion, dodges at both tempo speeds, merchant stock, and weight-limited purchases.
- Add compact browser integration checks when the local browser test runner can launch in this environment.
