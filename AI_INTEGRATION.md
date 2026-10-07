# Enemy brain integration

Already wired in game.js (`updateEnemies`, `enemyNav`, `firePlayerRound`); this documents it.

- New modules: `enemy-nav.js` (tile A*, flow fields, dynamic crate blockers), `enemy-brain.js` (`stepEnemyBrain`, `createNav`, `findCover`, `leadAim`). `enemy-tactics.js` now also exports `incomingThreats`.
- Game state: `state.noises` (player gunfire this step: `{x,y,radius}`, 190 suppressed / 380 otherwise; cleared at end of `updateEnemies`), `state.nav` (rebuilt when `state.solidMap` identity changes; crates/pillars re-registered via `nav.setBlockers` when `state.crates` identity/length changes).
- Per frame: build `world = {nav, player:{x,y,vx,vy}, los, enemies, smoke, projectiles (player bullets), noises, fireAllowed}`, then call `stepEnemyBrain(e, world, scaledDt, random)` for each living enemy.
- Apply output: velocity = `(moveX, moveY) * def.speed` (speed already includes dodge/dash multiplier); zero while stunned or in brute melee windup. `out.aiming`/`out.windup` drive the aim line (aim is locked for the whole telegraph); `out.fire` spawns the bullet via `enemyShoot`, then the game handles ammo/reload. Brute melee still uses `enemy-attacks.js`; the brain adds a charge (wind-up, then dash; intent `charge`).
- `render_game_to_text` keeps `tactic: enemy.intent`. Intents: idle notice investigate search approach flank cover peek aim strafe retreat dodge zigzag circle ambush charge attack reload hold. Enemies also carry `aware`, `role`.
- Unaware enemies idle until they see the player (440px) or hear gunfire; they alert squadmates (same room or within 220-280px).
- Removed from game.js: `enemyPassableTile`, `enemyCanMoveTo`, `routedEnemyGoal`, and use of `chooseEnemyTactic`.
- Tuning: `PROFILES` in enemy-brain.js, `world.aimMul` (aim error scale), `world.maxFiring` (concurrent telegraphs).
