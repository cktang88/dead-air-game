# DEAD AIR progress

## Current playable build

- Three.js renders the arena; Rapier 2D handles actor, cover, wall, and projectile physics; ROT.js Digger generates connected room-and-hall layouts.
- Waiting slows the simulation; moving or firing speeds it up. Menus pause the run.
- Three weapons, primary/secondary switching, per-weapon ammo, a visible carry-weight budget, and five run-scrap attachments.
- A weighted armor plate adds one health and competes with heavier weapon choices.
- Four enemy types, pickups, room-clear rewards, extraction, a minimap, screen shake, hit stop, knockback, particles, and sliding corpses.
- Rooms get destructible 60-HP crates that can drop scrap. Map walls remain indestructible.
- Death and extraction award persistent coins. Safehouse upgrades affect movement speed, idle time, crate loot chance, or carry capacity.
- Core rules and progression data live in pure modules with Node unit tests.

## Verification

- `node --check game.js`
- `npm test` — 8 tests pass.
- Browser check at `http://127.0.0.1:8765/`: start a run, change slots, buy an attachment and armor, verify weight blocks the heavier rifle, and inspect the safehouse screen.
- `GAME_SPEC.md` documents current behavior and the remaining roadmap.
