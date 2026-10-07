# DEAD AIR

Open a local server from this folder and visit the address it prints:

```sh
npm start
```

Then open `http://localhost:8000`. The game loads Three.js, Rapier 2D, and ROT.js from version-pinned public CDNs. An internet connection is needed for the first-party browser imports.

## Controls

- **WASD / arrows + Shift:** world time follows your actual speed (not key-down): about 0.08x standing still, 0.35x walking, 1x at full sprint (STILL MIND lowers the still rate). Every shot lets a short beat of time through (heavier or slower guns cost more; an SMG spray costs a sliver), and sprinting is loud. Your movement, aim, fire rate, reload and i-frames run on the real clock; enemies, their bullets, telegraphs and the boss run on world time. Time is shown by the screen itself (colour drains, cold grain and vignette as it slows) plus a thin top-edge meter while it changes. Tunables live in `time-rule.js`.
- **Mouse:** aim; hold the left button to fire.
- **E:** use the entry loadout station or nearby pickup.
- **Tab:** open the loadout screen anywhere.
- **1 / 2:** switch primary and secondary; **Shift + move:** sprint; **R:** reload (or restart after a run ends).
- **Q:** cycle smoke, flash, frag, and incendiary; **G:** throw the selected item.
- **Esc:** pause; **F:** toggle fullscreen.

The workbench lets you select a secondary weapon, buy weighted armor, and buy attachments compatible with the active gun. The 13 weapons have distinct damage, fire rate, magazine, spread, range, reload, weight, and projectile speed. Player and enemy guns turn with their aim; ranged enemies show a warning line before firing and visibly tilt their guns while reloading. Enemy shots keep the direction they aimed at, so movement can dodge them at either tempo.

Throwables use physics-driven travel and have separate effects: smoke hides the player from ranged enemies, flash stuns enemies in line of sight, frag deals area damage and knockback, and incendiary fire burns nearby enemies. Cleared rooms can contain a cache with a choice of ammo, healing, an attachment, a risky prototype, or scrap. A rare black-market room sells run weapons, compatible attachments, armor, healing, and throwable refills for scrap. See [GAME_SPEC.md](./GAME_SPEC.md) for the design and remaining roadmap.

Generated runs use ROT.js's Digger room and corridor generator. Walls are indestructible; wooden crates take damage and may drop scrap. Combat rules live in `rules.js` and have a small Node test suite:

```sh
npm test
```

Open `http://localhost:8000/tests/game-smoke.html` for the browser check. It launches seed 213838321 and verifies startup, movement and the speed-driven time rate, shot beats, rarity-tagged loot, bullet damage to a crate, reload, a common extended-magazine purchase, a frag throw and detonation, focus-loss and manual pause, the two-slot loadout, and safehouse upgrades surviving a reload. It also starts a run after buying Vital Reserve and confirms the added health is granted. The progression check restores the browser's original save afterward.

For a seeded encounter check, open `http://localhost:8000/tests/full-floor-browser-harness.html`. It equips armor, clears the first combat room, checks a fresh ranged-shot dodge, tries an affordable scrap gate, then pauses the run and restores the original save. It is a focused probe, not a full-floor playthrough.

Room Sense reveals nearby room outlines and enemy blips through walls at increasing ranges; Vital Reserve permanently adds up to three health and starts each run fully healed. Progress is saved in this browser, with a reset option in the Safehouse upgrades panel. See [GAME_SPEC.md](./GAME_SPEC.md) for the full design and implementation checklist. Remaining work is focused on full-floor playtesting, balance across seeds, and sustained performance checks.

## Playtesting

`tools/autoplay.mjs` is an autoplay balance harness. It launches headless Chromium, serves this folder on a free port, and plays whole runs with **real keyboard and mouse input** (`page.keyboard` / `page.mouse`). Game state (`window.__deadair`, enabled by `?debug`) is only *read* to make decisions; nothing is teleported or written.

```sh
node tools/autoplay.mjs --seeds 10 --skill 0.5            # seeds 7001..7010
node tools/autoplay.mjs --seed 7003 --skill 0.9 --shots   # one seed, periodic screenshots
node tools/autoplay.mjs --seeds 20 --skill 0.7 --workers 3 --speed 3 --out balance-out
```

Options: `--seeds N|a,b,c|a-b`, `--seed N`, `--seed-base N`, `--skill 0..1`, `--out DIR`, `--vendor DIR`, `--workers N`, `--speed X`, `--realtime`, `--extract-at N`, `--timeout SEC` (wall clock per seed), `--max-game-time SEC`, `--shots [SEC]`, `--width/--height`, `--verbose`. Run with `--help` for the list.

- **Offline / CDN blocked:** `--vendor DIR` (or `$DEADAIR_VENDOR`) points at local bundles named `three.js`, `_dimforge_rapier2d-compat.js` and `rot-js.js`; matching `esm.sh` imports are answered from there. Without a vendor dir the real network is used. The shipped game code keeps its CDN imports.
- **Skill knob:** controls aim error, reaction delay to newly seen enemies, how often the bot stands still to exploit slow time, bullet dodging and loot greed. The bot paths with A* over `solidMap` (crates and cover treated as blocked, inflated by the player radius), unsticks itself by backing off and sidestepping, clears the main route, picks up loot, opens gates and caches, buys at lockers and the Black Market, reloads behind cover, throws frags at clumps and swaps weapons when dry, then extracts.
- **Speed / determinism:** by default the bot drives the sim only through `window.advanceTime(ms)` (the game's own test hook) with its inputs held between steps, and stops the page's rAF loop, so wall time does not limit game time and runs are reproducible. Steps are large (`40ms * --speed`, default 8 → 320 ms) while the bot is idle or walking calmly, and shrink to 40-160 ms while shooting, under telegraphs, bullets or melee. `--realtime` keeps the game's own rAF loop (slow: standing still runs the world at 0.08x but the bot still waits in real time). Floor 1 clears in about a minute of wall time on a loaded 4-core box.
- **Play style (a "competent human"):** stands still to read (world 0.08x) and acts when a telegraph starts; walks (0.35x) in combat and sprints only to reposition (never near living enemies); steps out of the locked aim lane of a winding-up shooter and avoids a marksman's laser; never shoots a RIOT's shield (uses the `shieldAng` arc), circles to its back, and throws a flash/frag at a shield that faces it; stalks unaware enemies from behind their vision cone and fires only SILENT shots (or a first strike when suspicion is about to fill); fires short deliberate windows (one shot per click for heavy guns); reloads when nothing ranged can see it; swaps guns before the active one runs dry; holds E at a closed door to peek before entering; picks frequencies that continue a held station (crossfades) and always descends unless `--extract-at N` says to bank after floor N. The one-time Signal Check tutorial is marked done through localStorage so the seeded run starts directly; closed doors are treated as passable in the bot's nav (they open when walked into) but block its line of sight.
- **Output** (in `--out`, default `autoplay-out/<stamp>`): `results.json` (per-seed result, rooms cleared/visited, kills, damage by room role and by enemy type, cause of death, scrap earned/spent, ammo starvation, stuck events with coordinates and screenshots, console errors), `summary.txt` (table plus aggregates) and screenshots. Every run starts from a fresh save, so safehouse upgrades are not applied.
- Stuck events that the bot cannot recover from are reported as `trapped` (a possible game softlock) rather than hidden.

Art credits and icon licences (game-icons.net, CC BY 3.0) are in [CREDITS.md](./CREDITS.md).

## Hosting

The game is a static site. `sh scripts/build-site.sh` copies the files the browser loads into `dist/`.

`.github/workflows/deploy.yml` publishes `dist/` to Cloudflare Pages (project `dead-air`) on every push to `main` (production, `dead-air.pages.dev`) and to the working branch (a preview URL). It needs two repository secrets: `CLOUDFLARE_API_TOKEN` (a token with the *Cloudflare Pages: Edit* permission) and `CLOUDFLARE_ACCOUNT_ID`.
