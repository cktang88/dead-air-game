# DEAD AIR

Open a local server from this folder and visit the address it prints:

```sh
npm start
```

Then open `http://localhost:8000`. The game loads Three.js, Rapier 2D, and ROT.js from version-pinned public CDNs. An internet connection is needed for the first-party browser imports.

## Controls

- **WASD / arrows:** move. The world speeds up while you move or fire.
- **Mouse:** aim; hold the left button to fire.
- **E:** use the entry loadout station or nearby pickup.
- **Tab:** open the loadout screen anywhere.
- **1 / 2:** switch primary and secondary; **Shift:** reload; **R:** restart after a run ends.
- **Q:** cycle smoke, flash, frag, and incendiary; **G:** throw the selected item.
- **Esc:** pause; **F:** toggle fullscreen.

The workbench lets you select a secondary weapon, buy weighted armor, and buy attachments compatible with the active gun. The 13 weapons have distinct damage, fire rate, magazine, spread, range, reload, weight, and projectile speed. Player and enemy guns turn with their aim; ranged enemies show a warning line before firing and visibly tilt their guns while reloading. Enemy shots keep the direction they aimed at, so movement can dodge them at either tempo.

Throwables use physics-driven travel and have separate effects: smoke hides the player from ranged enemies, flash stuns enemies in line of sight, frag deals area damage and knockback, and incendiary fire burns nearby enemies. A rare black-market room sells run weapons, compatible attachments, armor, healing, and throwable refills for scrap. See [GAME_SPEC.md](./GAME_SPEC.md) for the design and remaining roadmap.

Generated runs use ROT.js's Digger room and corridor generator. Walls are indestructible; wooden crates take damage and may drop scrap. Combat rules live in `rules.js` and have a small Node test suite:

```sh
npm test
```

Open `http://localhost:8000/tests/game-smoke.html` for the browser check. It launches seed 213838321, verifies startup, movement at 1×, blended firing tempo, and ammo use in the actual game frame, then pauses the run.

Room Sense is a permanent safehouse upgrade that reveals nearby room outlines and enemy blips through walls at increasing ranges. Progress is saved in this browser, with a reset option in the Safehouse upgrades panel. See [GAME_SPEC.md](./GAME_SPEC.md) for the full design and implementation checklist; more gear types remain planned.
