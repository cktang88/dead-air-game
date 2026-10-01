# DEAD AIR progress

## Current playable build

- Three.js renders the arena; Rapier 2D handles actor, cover, wall, and projectile physics; ROT.js Digger generates connected room-and-hall layouts.
- Waiting slows the simulation; moving or firing speeds it up. Menus pause the run.
- Three weapons, primary/secondary switching, per-weapon ammo, a visible carry-weight budget, and five run-scrap attachments.
- Four enemy types, pickups, room-clear rewards, extraction, a minimap, screen shake, hit stop, knockback, particles, and sliding corpses.
- Rooms get destructible 60-HP crates that can drop scrap. Map walls remain indestructible.
- Pure combat/loadout rules live in `rules.js`; the Node test suite covers tempo, weapon mods, encounter rolls, crate durability, and carry capacity.
- `GAME_SPEC.md` has the design and detailed implementation roadmap. Persistent coins, between-run upgrades, armor, and gear are planned; they are not yet in the game.

## Verification

- `node --check game.js`
- `npm test` — 5 tests pass.
- Browser check at `http://127.0.0.1:8765/`: start a run, change slots, buy an attachment, fire, observe fast/slow tempo, and inspect the loadout screen.
