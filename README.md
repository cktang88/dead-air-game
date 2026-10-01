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
- **Esc:** pause; **F:** toggle fullscreen.

The workbench lets you select a secondary weapon or buy a weighted armor plate with run scrap. Armor adds one health. The between-run safehouse awards persistent coins on death or extraction; use them for movement, time-slow, crate-loot, and carry-capacity upgrades.

Generated runs use ROT.js's Digger room and corridor generator. Walls are indestructible; wooden crates take damage and may drop scrap. Combat rules live in `rules.js` and have a small Node test suite:

```sh
npm test
```

See [GAME_SPEC.md](./GAME_SPEC.md) for the full design and implementation checklist. Progress is saved in this browser; a save reset button and more gear types are still planned.
