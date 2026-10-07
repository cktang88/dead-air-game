# DEAD AIR — Game Design and Build Plan

## Product goal

A fast top-down dungeon shooter where the player can pause mentally while the world crawls, then commit to movement and gunfire while everything accelerates. Each run is a small tactical story: scout a room, choose an entry, spend ammunition, use cover, collect gear, and decide whether to push toward the exit. Failure should feel fair and restarting should be quick. Long-term upgrades give each run a purpose without making early rooms trivial.

The game should run in a desktop browser with keyboard and mouse, load directly from a local web server, and remain understandable without a tutorial video.

## Design pillars

1. **Stillness is a tool; speed is time.** World time follows the player's actual speed: 0.08x standing still (STILL MIND lowers it), 0.35x walking, 1x at full sprint, eased. Each shot advances the world by a beat (about 0.12 s of world time at 1x, scaled by damage and fire interval, delivered as a burst of 1x flow). Sprinting makes footstep noise (radius 150) that enemies hear; walking does not. The player is outside time: movement, aim, fire rate, reload, i-frames and player bullets use the real clock (reload start also costs a small beat). All tunables: `time-rule.js`.
2. **Rooms are decisions.** A doorway reveals enough to plan, but every room has different cover, enemy pressure, loot, and routes.
3. **Weapons have jobs.** Primary and secondary slots support different ranges and tempos. Ammunition, reloads, recoil, damage, spread, and weight make the choice matter.
4. **Hits feel physical.** Impacts use hit stop, knockback, particles, screen shake, and brief enemy collapse. Clear feedback should make each shot easy to read.
5. **A failed run still pays forward.** Run-earned coins buy permanent options and small advantages. Skill and room choices remain more important than the upgrade tree.
6. **The rules stay legible.** Show weapon weight, total load, upgrade effects, room state, and why an item cannot be equipped.

## Run loop

A run is **three floors and a boss floor** (about 10–20 minutes). Floors reuse the run seed (`floorSeed(seed, n)`), so a seed always yields the same four floors; the daily seed is shared by every player on that date.

1. Pick a **starting kit** (title screen / safehouse) and enter FLOOR 01 with that loadout, a workbench and the run seed.
2. Every room carries a **reward** that pays out when it is cleared. Each doorway out of a cleared room shows an icon for the reward beyond it: FREQUENCY, scrap, weapon, medkit, supply drop, or an ELITE skull. Choosing a door is choosing a build.
3. Fight, use cover and the slow-time rule, pick up rewards, spend scrap at the workbench and Black Market.
4. When the main route is clear, the exit opens. Reaching it shows the **greed choice**: **EXTRACT NOW** (bank every coin earned this run, end the run) or **DESCEND** (pick one FREQUENCY, get a little ammo and one health back, and enter the next floor). Dying keeps only 40% of the run's coins (25% with HIGH ROLLER).
5. Floors escalate: floors 2 and 3 shift encounter depth (+0.30 / +0.55) so MARKSMAN and RIOT squads arrive early, add +1 enemy to ordinary rooms, convert 1 / 2 ordinary rooms to WARDEN rooms, and raise enemy health (+15% / +30%) and speed (+4% / +8%).
6. FLOOR 04 is **THE CONDUCTOR**: a hunt through a few rooms into a generous arena, ending in the boss fight. Beating it is the true win.
7. The run-end screen shows the payout, the **operator's** reaction (cause of death, depth, unlocks), goals completed, new unlocks, any recovered **tape**, and (for dailies) a shareable result line. After the first boss win, **INTERFERENCE** modifiers can be stacked for bonus coins.

## The macro-loop numbers (tuning table)

| Constant | Value | Notes |
| --- | --- | --- |
| Run coins | 5 base + 10 per cleared room + 3 per kill | per run, summed across floors |
| Floor clear bonus | 40 / 70 / 110 | floors 1 / 2 / 3, paid on reaching that floor's exit |
| Boss bonus | 250 | on killing THE CONDUCTOR |
| Death keeps | 40% of the gross (25% with HIGH ROLLER) | extract and win keep 100% |
| INTERFERENCE | +15% to +25% coins each | stacks, unlocked after the first win |
| Typical first death on floor 1 | about 4 rooms, 8 kills: 69 gross, 27 kept | two early deaths buy the cheapest unlock |
| Extract at the end of floor 1 | about 8 rooms, 20 kills: 185 gross, all kept | enough for a kit or two guns |
| Full clear of all four floors | roughly 700 to 900 coins | plus goal rewards |

Pacing target: the cheapest unlocks cost 35 to 60 coins, a typical run pays 30 to 120 coins, and goals pay 10 to 80 coins plus an unlock, so a new player buys or unlocks something after nearly every run for the first ten runs. The catalog totals about 1,400 coins of purchases plus 8 goal-only unlocks (roughly 25 to 30 runs of play); the first boss win is expected around runs 10 to 15.

The first room should teach movement, aiming, slow time, shooting, cover, and switching weapons in under two minutes.

## Time and combat rules

- Standing still: the idle multiplier (0.08x); walking 0.35x; sprinting 1x; each shot adds a beat.
- Moving: 1.00× simulation speed, including while firing. Stop moving to slow the simulation immediately.
- Menus and pause: simulation stopped.
- The speed indicator always names the current state and shows its rate.
- Bullets are physical projectiles with collision checks; walls block shots.
- Player bullets damage enemies and crates. Enemy bullets damage the player. Player bullets fly on world time with a floor of 0.45x real (see Player bullet clock).
- Hits briefly interrupt time, push targets, and add restrained camera shake.
- Enemy tells must remain readable at both slow and fast speeds. Use an aim cue or wind-up before ranged shots and a clear charge before heavy contact. Brutes now commit to a visible directional swing with a dodgeable wind-up and recovery.
- Reloads consume time and ammunition. A reload may be interrupted by damage; whether ammo is retained on interruption is a balance choice to test.
- Death restarts at the entry with one action. Preserve persistent currency and upgrades, not run-only loot.

## Rooms, routes, and generation

### Room requirements

- Every run has an entry, at least six combat or utility rooms, and an extraction room.
- Rooms vary in width, height, outline, entrance position, and corridor connection. Hallways should create choices and avoid one long empty chain.
- Enemies belong to their spawn encounter. A living enemy still blocks that room's clear reward if it chases beyond the original walls.
- Keep a connected route from entry to extraction. Optional branches hold more risk, loot, or a secret.
- Each room gets a deterministic role: combat, cache, armory, clinic, hazard, or extraction (the merchant is gone: supply drops replace it). Caches have two defenders and a scrap/mod reward, clinics are safe recovery rooms, armories pair three defenders with a gun, hazards raise enemy count, and merchant rooms keep their shop behavior.
- Keep entry and extraction roles reserved. Optional branches, a hidden cache, topology-validated scrap gates, FIELD CLINIC rest stops, and the Warden miniboss are implemented; a cache gate appears only when it will not block the extraction route.
- Rooms are processed by shortest route from the entry. The first two ordinary combat rooms cap at three enemies; later ordinary rooms roll two to four. Cache, armory, hazard, and elite budgets keep their role-specific counts. A room may be small and dangerous or large with scattered guards.
- Room footprints vary between rectangles and L, U, or C outlines. Keep the center and door approaches clear, and preserve a walkable route between all connected rooms.
- Prevent spawning enemies, pickups, crates, or the player inside solid walls or on top of another required object.
- Seed generation for reproducible bug reports and automated checks. Display the run seed on the result screen.

### Props and destruction

- **Walls:** permanent, opaque, and indestructible. They define movement boundaries and block projectiles. No upgrade or weapon may remove them.
- **Wooden crates:** have 60 health, block movement and shots, show cracks after the first hit, break at zero health, throw splinters, and sometimes drop scrap.
- **Pillars / heavy cover:** permanent cover with collision. Their role is to create flanking routes.
- **Decor:** floor tint, room lighting, signs, stains, machinery, and clutter provide visual variety but should not obscure bullets or enemy tells.
- Give every room at least one destructible crate. Ensure props do not seal the only doorway or trap an actor.

### Generation library decision

Use ROT.js Digger for room-and-corridor topology; this is already integrated. Noise functions such as simplex or Perlin suit organic floor or grime patterns, not room connectivity. Add a noise library only if a concrete visual or hazard feature needs it. Keep layout generation seeded and separate from the rendering adapter so rules can be tested without WebGL.

### Research references

- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) — render repeated floor and wall geometry with fewer draw calls.
- [Rapier JavaScript rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/) — dynamic actors/projectiles and fixed cover/wall bodies.
- [ROT.js Digger API](https://unpkg.com/rot-js@2.1.3/doc/modules/_map_digger_.html) — connected procedural rooms and corridors.
- [Dennaton Games interview on Hotline Miami](https://www.pcgamer.com/hotline-miami-interview-dennaton-games-on-creating-carnage-to-delight-and-disgust/) — design context for dangerous short encounters, readable action, and mastery through replay.
- [SUPERHOT Team interview](https://gamingbolt.com/superhot-interview-becoming-the-weapon-in-a-turn-based-fps-environment) and [Game Developer interview](https://www.gamedeveloper.com/design/road-to-the-igf-superhot-team-s-i-superhot-i-) — the design starts from fluid turn-based action: the player sets the pace, gets a moment to adjust when pressure rises, then improvises. The team highlights visible enemy aiming, dodging bullets, tight spaces, and unscripted solutions.
- [GDC session summary: Game Design and Mind Control in SUPERHOT](https://www.gdcvault.com/play/1023483/Game-Design-and-Mind-Control) — the central time rule shaped the rest of the combat, including bullet dodging, grabbing weapons, and using nearby objects.

### SUPERHOT design lessons for DEAD AIR

- Keep time control tied directly to player intent. Standing still should create a readable reaction window, while movement and firing should make the encounter feel urgent. The current slow/action states are a simple version of this rule; tune them by playtesting instead of adding extra time powers by default.
- Make threat intent readable before it becomes damage. Keep enemy aim tells and fixed-path bullets visible long enough for a player to notice and react at both time scales.
- Favor improvisation over one correct room solution. Put cover, doors, weapons, and throwable options where players can combine them, and let procedural encounters create their own memorable moments.
- Keep rooms close and tactically legible. Tight corners and doorways can make small movement choices matter, but retain the wider halls and multiple exits needed for this game's dungeon exploration.
- Enemy intelligence should create counterplay, not just stronger pressure. Use flanks, cover, retreats, and varied roles with clear tells; avoid endless retreat or hiding that stalls the fight. SUPERHOT's useful lesson here is readable action and player-paced flow, not a claim that its enemies simulate realistic self-preservation.

## Enemies

Current enemy families are the Rusher, Gunner, Brute, and Warden. Expand behavior and tuning before adding many near-duplicates.

- **Rusher:** pressures the player and punishes standing in a doorway too long; seeks cover or retreats when badly hurt.
- **Gunner:** fires readable ranged bursts from 105–300 world units and retreats or sidesteps if the player closes inside its minimum range.
- **Brute:** slow, high-health threat with a dangerous close-range attack; vulnerable to kiting and heavy weapons, and falls back when badly hurt.
- **Warden:** guards a lane and fires from 88–210 world units, adjusting distance to hold that band.
- **Later: Flanker:** seeks another route around cover; must telegraph entry.
- **Later: Suppressor:** denies a corridor with a short volley; never fires continuously without a tell.
- **Later: Room captain:** modifies nearby enemies or guards a high-value reward. Introduce one new mechanic per encounter.

Room compositions should use a threat budget rather than an unbounded random count. Mix roles so a player must move: ranged threats behind cover, no more than half the group rushing at once, and safe lanes that can be used for counterplay. Ranged enemies define both a minimum and maximum firing range; melee enemies close to their contact range. Give every enemy a visible health/impact response and a short post-hit stagger where appropriate. Navigation should keep following tile routes around cover instead of stopping at each waypoint, and prop/spawn placement must leave doors and paths open.

## Weapons, attachments, and carry weight

### Current weapon baseline

- The catalog now defines 13 guns: three assault rifles, four SMGs (including the original machine pistol), two pistols, three precision/anti-materiel rifles, and one shotgun.
- KITE BURST fires a committed three-round sequence with short spacing between bullets; every emitted round spends one round, releasing the trigger does not cancel the burst, manual reload is ignored until it finishes, and switching weapons cancels its remaining rounds. A nearly empty magazine can produce a shorter final burst. The preview reports its sustained cyclic rate rather than trigger rate.
- Gun definitions have distinct fire stats, weight, ammo, and visual dimensions. All 13 are wired into combat and can be selected through the loadout, merchant, or a weight-checked pickup when the carry rig allows them.
- Five attachment definitions exist; compatibility filtering and per-gun installation are wired into the workbench and weapon stat calculations.
- A run starts with the machine pistol and Street Sweeper. Other catalog guns can be selected at the workbench, bought from a merchant, or accepted from a specific pickup.
- The Street Sweeper has three shell choices on `C`: buckshot fires 9 hard-hitting pellets, birdshot fires 16 weaker and wider pellets at shorter range, and slug fires one accurate, longer-range pellet. Each trigger consumes one shotgun round; the HUD shows the selected shell.
- Lynx and Quill rounds can continue through up to four additional enemies and three crates. The Mule can continue through five additional enemies, four crates, and one continuous wall section. Hits are swept across each frame so fast rounds do not skip targets; walls and cover stop ordinary rounds.

### Inventory rules

- The player always has a **primary** and **secondary** slot. Keys `1` and `2` switch slots.
- Current loadout weight is the sum of equipped weapons and gear. Base capacity is 7.0. Machine pistol + shotgun weigh 5.5; adding the 1.5-weight armor plate fills the rig, while a heavier rifle plus armor exceeds capacity.
- At the workbench, selecting an unequipped gun previews its stats and resulting carry weight before confirmation; cancel leaves the loadout untouched. A gun pickup previews its identity, stats, selected replacement slot, and resulting weight. The player can replace either slot or leave it. Keep ammo indexed by weapon so a swap does not erase the player’s stored magazine.
- Show slot, weapon, ammo, per-item weight, total weight, and capacity. Explain an overweight selection directly.
- The capacity is an intentional tradeoff between heavier weapons, armor, and utility gear. Do not silently discard gear when swapping a weapon.

### Inventory behavior

- The armor plate has two durability points separate from five health; incoming damage wears the plate first and excess damage reaches health. Repair costs 10 scrap at the workbench.
- The gear screen previews total load, capacity, equipment effect, and scrap cost before confirming a gear change; armor also previews its durability change.
- The ammo harness weighs 1.0 and reduces manual and automatic reload time by 15% for either carried weapon; it competes with the 1.5-weight armor plate.
- The loot scanner weighs 1.0 and reveals available guns, attachments, healing, and scrap within seven tiles on the minimap, through walls. It keeps undiscovered secret-cache loot hidden and competes with armor and reload gear.
- Permanent carry-rig upgrades increase capacity through metaprogression.
- Decide whether temporary attachments have weight. If they do, show the added weight in the same total. Avoid hidden weight penalties.
- Add a third weapon slot only as a later carry-rig unlock with a real weight and opportunity cost. Two slots are the default and should remain useful.
- The 13 catalogued guns are selectable, have independent ammunition and distinct combat profiles, and declare their compatible attachments.
- Attachments belong to individual guns. The workbench shows only compatible attachments and applies magazine, damage, fire-rate, spread, range, penetration, and reload changes.

## Tactical items and merchants

- Smoke, flash, frag, and incendiary have distinct throw arcs, fuses, effect radii, inventory counts, and area feedback.
- Smoke should break enemy sight/targeting. Flash should briefly stun enemies with line of sight. Frag should deal radial damage and knockback, with walls stopping the blast. Incendiary should create a timed damaging area.
- `tactical.js` defines item stats, inventory consumption, radius checks, and occlusion rules with unit tests. Q cycles the selected throwable; G throws it with physics-based travel and a fuse.
- Smoke blocks ranged enemies' sight, flash stuns, frag deals radial damage and knockback, and incendiary creates a timed damaging area. Walls and intact crates block direct effects.
- A rare merchant room replaces its usual enemies with a shopkeeper. Its paused panel offers a gun, compatible attachment, weighted gear, health, or throwable refill for scrap. Gun and gear purchases check carry capacity.

## Combat readability and counterplay

- Every actor carries a visible top-down weapon mesh that follows its aim direction. During reload, the weapon tilts visibly.
- Ranged enemies telegraph a shot with an aim line, then fire along the direction they committed to at the start of the tell. Their slower rounds leave a dodge window after launch at both idle slow time and action speed.
- Damage, stun, death, and other interruption should cancel an enemy's queued shot. Walls must block enemy line of sight and projectiles.
- Longer playtesting should tune tell timing, enemy fire rhythm, and the visual readability of weapons at different zoom levels.

## Loot and room rewards

- Run scrap buys attachments and services during a run. It is not permanent currency.
- Attachment loot has four named tiers: common, uncommon, rare, and prototype. Each tier scales the attachment’s own bonus by 1.00×, 1.15×, 1.30×, and 1.45×; installed tiers stay visible on the weapon and in the workbench. Ground loot uses both a distinct color and a rarity name when collected.
- Crates may drop a small amount of scrap. Enemies reward a predictable small amount; rooms grant a clear bonus for clearing.
- Healing should be uncommon enough that taking damage matters but common enough to prevent a long unwinnable run.
- Weapon pickup should preview the replacement and weight before collection. Provide a clear decline path if the player wants to keep their current weapon.
- After its guards are gone, a room cache opens a paused choice: ammunition, health, a compatible attachment, a prototype attachment that costs one health, or 35 scrap. The scrap fallback stays available if every other reward is unusable.

## Meta progression

Meta unlocks add **options** (guns, kits, throwables, frequencies, tradeoff upgrades), not only raw stats. Everything is data in `unlocks.js`, `frequencies.js`, `goals.js`, `progression.js`, `story.js`, `interference.js`, `door-rewards.js` and `run-loop.js`, with tests in `meta-loop.test.js` and `meta-world.test.js`.

### Currency and run summary

- **Coins** are the only meta currency. Run scrap is separate and is lost when the run ends.
- Coins are banked per the macro-loop table above: extract and win keep all, death keeps 40%.
- The run-end screen shows banked vs lost coins, completed goals, unlocks, the operator's lines and a recovered tape.
- Save format: `SAVE_VERSION = 2` under the existing key. v1 saves migrate keeping coins and upgrade levels; unknown versions and corrupt JSON fall back to a fresh profile. All storage access is wrapped in try/catch. A reset button remains behind a confirmation.
- Persisted: coins, upgrade levels, `unlocked[]` (ids like `gun:smg_vector`, `kit:duelist`, `throw:frag`, `freq:homing`, `upg:adrenal`), chosen `kit`, run `stats` (runs, kills, deepest floor, extracts, wins, boss kills, fastest win and floor 1, bests), completed `goals`, collected `tapes`, active `interference`, and the `daily` record.

### Starting kits and guns

| Kit | Guns | Cost | Job |
| --- | --- | --- | --- |
| Standard Issue | Machine pistol + street sweeper | free | balanced |
| Duelist | TALON .45 + MICA 9 | 45 | two sidearms, light |
| Scout | ASH CARBINE + MICA 9 | 70 | range plus panic |
| Breacher | CINDER .45 + street sweeper | 95 | close-quarters hammer |
| Marksman | QUILL SCOUT + MICA 9 | 140 | pierce a lane |
| Bruiser | BASTION 7.62 + MICA 9 | 180 | slow, punching |

Guns join the loot, armory and Black Market pool when unlocked: Vector 9 (40), Kite Burst (50), Talon .45 (60), Hardline (70), Cinder .45 (80), Quill Scout (110), Bastion (120), Lynx (150); the Mule anti-materiel rifle is goal-only (beat the boss). Owning a kit also unlocks its guns. Starters are Machine Pistol, Street Sweeper, MICA 9, Ash Carbine. Throwables: smoke and flash from the start, frag (45, or the "reach floor 3" goal) and incendiary (60, or the "extract three times" goal). Unlocks are keyed to gun ids today; the focus pass that regroups guns by verb should re-key them by verb.

### Frequencies (the in-run build system)

Five stations, three or four upgrades each, three ranks. Every upgrade is a **behavior you can watch happen**, and a rank-up changes what it does: rank 2 adds a **twist**, rank 3 a **flourish** (the card text says which). Offers are pick-1-of-3 from FREQUENCY pickups (door rewards, ELITE rooms, supply drops) and after each floor you descend. Offers lean on your build so crossfades actually happen: when a crossfade completer is in reach it is on the table 60% of the time, at least one card comes from a station you hold, one card is a fresh voice so you can pivot, and no station fills more than two cards. Two stations at level 2 or more (total ranks) switch on a **crossfade**: a freeze-frame name card (near-frozen time for 1.5 s, a chord, a ring in both station colours) and a visible effect in play. Every card's one-line text is generated from the same numbers the game reads (`frequencies.js` ranks are `{fx, text}`; `frequencies.test.js` asserts the mapping), so no description can drift from the code.

| Station | Play style | Upgrades (rank 1 / twist / flourish) |
| --- | --- | --- |
| STATIC | lightning, jams | **Arc Light**: hits arc a visible bolt to the nearest other enemy / jumps to a second enemy / arcs jam what they touch. **Jammer**: hits jam the target (it cannot shoot and its bullets in the air vanish) / the jam splashes 2 tiles / longer jam, 3-tile splash. **Distortion Field** (35): a drawn ring slows enemy bullets / bigger and slower / bullets close to you are zapped out of the air. **Dead Channel** (60): kills release a shockwave that jams enemies / it also erases enemy bullets / bigger and shoves enemies back |
| DEADLINE | time as currency | **Borrowed Time** (the one merged refund): each kill refunds slow time (half speed while walking) / getting hit refunds some too / at 1 health you always walk in half time. **Hang Fire** (45): a kill while you stand still freezes the victim's bullets in mid-air / they hang until you move / the kill freezes every enemy bullet within 6 tiles. **Held Breath**: stand still 0.6 s (a ring pings), next shot +50% / the charged shot pierces everything in line / and is silent |
| CARRIER | pierce, bank, seek | **Throughput**: rounds pierce 1 enemy / 2 and punch through crates / everything in line. **Multipath**: bullets bounce once / each bounce bends toward the nearest enemy / three bounces. **Lock-On** (55): bullets curve to targets near their path, tighter and farther per rank. **Shatter** (70): kills burst into seeking shards / shards pierce / shards ricochet |
| NIGHT SHIFT | quiet play | **Dead Mic**: half-size noise ring / a shot that kills an unaware enemy makes no noise at all (the ring does not appear) / 75% quieter and silent sprinting. **Blindside**: +60% vs unaware / any hit on an unaware enemy kills it outright (brutes, riots, elites, boss excepted) / a quiet takedown refunds the round. **Smoke Bloom** (45): reload drops a smoke cloud, bigger and longer per rank. **Blackout** (55): enemy vision cones shrink (drawn smaller) / shorter and narrower / standing still hides you beyond 3 tiles |
| FEEDBACK | power from risk | **Red Line**: +20% damage per missing health and your shots grow bigger and brighter / at 2 health shots pierce / at 1 health shots burst on impact. **Echo**: at 2 health or less every shot is followed 0.2 s later by a ghost round (50%) / 75% / two ghosts. **Kindling** (55): kills set nearby enemies on fire. **Backlash** (70): taking a hit sends a shockwave that jams enemies / and erases bullets / bigger and shoves enemies back |

Removed as dominant or flat: Clean Slate (kills refilled the magazine: strictly best when ammo was tight), Cold Cash (+6 scrap), Feedback Loop (a fire-rate percentage), and the near-duplicate time refunds Adrenaline, Last Stand and Freeze Frame (all merged into Borrowed Time and Hang Fire).

Crossfades (each fires a floater with its name when it triggers): SIGNAL BOOST (Static + Carrier: arcs jump one more enemy, every ricochet fires an arc), DEAD AIR (Static + Deadline: killing a jammed enemy refunds 1 s), HOLD YOUR BREATH (Deadline + Night Shift: held-breath bonus doubles and is silent), RED SHIFT (Carrier + Feedback: ricochets deal +60% and glow red), BORROWED PULSE (Deadline + Feedback: at 2 health or less every kill releases a jamming shockwave), DEAD DROP (Night Shift + Feedback: quiet kills heal at half health), WHITE NOISE (Static + Night Shift: jams last twice as long on unaware enemies). Nine upgrades are free from the start; the rest are bought in the safehouse for 35 to 70 coins (Backlash is unlocked by the pistol-boss goal).

### Shove and the dry-ammo fallback

Both guns at 0/0 with awake enemies must never be a dead end. **SHOVE** (default V, also right mouse; rebindable in controls, shown in the pause footer) is a short wide shoulder-barge (`shove.js`): small damage and a knock-back that **staggers** (a staggered enemy cannot shoot), enough to finish weakened enemies. From behind an enemy who has not noticed you, or a sleeper, it is a **SILENT TAKEDOWN**: a kill with no noise ring. Heavy enemies shrug it off: brutes barely move, riots block the front (shove them from the flank for double damage), the boss ignores it. The kill that follows running dry (shove or otherwise) **always drops an AMMO pickup** (placed so it can never land inside a wall), and the dry-click toast names the shove key.

### Player bullet clock (decision)

Question: player bullets used to fly on the real clock while enemies and their bullets run on world time, so standing still (0.08x) and shooting landed instantly on a frozen target. Options tested with `window.__deadair.PLAYER_BULLET_CLOCK` (`time-rule.js`):

- (a) **real clock** (old): a shot lands the same frame regardless of the time rule. Standing still is both the safest and the fastest way to kill; the beat from the shot has nothing to advance, because the bullet is already there.
- (b) **world time with a minimum effective speed** (`minRate` 0.45): the bullet flies on world time but never slower than 0.45x real. While you move or sprint (world 0.35x to 1x) it is essentially the old speed; while you stand still it visibly travels, and the shot's beat (0.03 to 0.2 s of 1x flow) advances time as it flies, so the shot "arrives as the beat advances time".

Measured in a browser (aware gunner, standing still, one shot): about 0.25 s to land at 3 tiles in both modes, 0.40 s (a) vs 0.45 s (b) at 4.6 tiles; the gap grows roughly 0.05 s per tile (a 12-tile marksman shot takes about 0.6 s longer under (b)). **Chosen: (b).** Reasons: (1) it keeps the pillar honest, the world is not allowed to freeze around a bullet the player owns; (2) it is fair: dodging enemies get a real warning window to react to a shot they can see coming, instead of being hit before any reaction is possible; (3) stealth: a silent kill is a visible commitment (the bullet crosses the room before the unaware target drops) instead of a teleport, which makes the quiet-kill frequencies (Dead Mic, Blindside) something you watch; (4) marksman fights: shooting a sniper down a lane is now a decision (it gets a few extra frames to respond) rather than a free instant; (5) the boss: telegraphed lanes and the exposed window stay fair, because player shots cannot out-run the boss's pattern clock. The minimum rate keeps stationary play fluid: nobody waits for a bullet at 0.08x. Revisit the number (0.35 to 0.6) in balance passes; it is a single constant.

### Permanent upgrade tracks

Seven flat tracks remain (Runner's Legs, Still Mind, Carry Rig, Salvager, Lucky Find, Room Sense, Vital Reserve; 20 to 130 coins per tier). Three **tradeoff** upgrades are unlocked by goals and then bought like any other: HIGH ROLLER (+25% coins, death keeps only 25%; 60), ADRENAL GLAND (+20% damage, minus 1 max health; 50), STOCKPILE (+40 starting scrap per tier, minus 6% move speed; 30 / 50).

### Goals and records

Fifteen goals pay 10 to 300 coins and often an unlock; progress is shown in the safehouse. Examples: STILL LIFE (clear a room moving under 3 tiles; Vector 9), THREE IN ONE BREATH (3 kills in one slow-mo window; Kite Burst), GOING DOWN / DEEP CUT (reach floor 2 / 3; frag), UNTOUCHED (clear a floor without damage; Adrenal Gland), DEAD SPRINT (clear floor 1 under 4 minutes; Stockpile), THE LAST NOTE (beat the boss; Mule), SIDEARM SOLO (final blow on the boss with a pistol; High Roller and Last Stand). Records: deepest floor, most kills, fastest win, boss kills, total banked.

### Daily seed

One button on the title screen starts the date's seed. The best floor and kills for the day are recorded, and the run end shows a one-line result: `DEAD AIR DAILY 2026-10-06 · FLOOR 3/4 · 41 KILLS · +212 COINS · EXTRACTED · 12:34`.

### Story: operator and tapes

Every run end yields operator lines reacting to the cause of death, depth, unlocks and the first boss kill. Ten tapes unspool one at a time as thresholds are met (runs, kills, floors, deaths, extracts, boss kills) and slowly explain the station.

### INTERFERENCE

After the first boss kill: ARMORED SIGNAL (+30% enemy health), OVERDRIVE (+15% enemy speed), NO SAFE HARBOR (below 2 health, standing still only slows to 0.5x), SCARCE (-40% scrap), THIN AIR (no medkit drops), ENCORE (+40% boss health). Each adds its bonus to the run's coin payout.

### THE CONDUCTOR (boss)

2400 health (a machine-pistol magazine is ~280 damage, so this is about 60 to 120 seconds for a competent player), three phases at 66% and 33% (supplies drop and the bullet field clears at each). The arena has no kills to drop ammo, so ammo drops arrive every ~12% of his health (75% and 50% included, medkits with two of them), two pickups lie in the arena when he wakes, and a player who runs low gets one more (9 s cooldown). Shove chips him for 8 and nothing more. His bullets never run slower than 0.35x real time and his own clock runs at 0.5x or better in phases I and III, so camping loses; the intro and phase shifts run on real time. The arena is **THE BROADCAST ROOM** (the last room of floor 4), lit by stage lights so the Conductor always stands in a spotlight, and the camera leans toward him while the fight is on so he is never at the screen edge. Each phase is tied to the time rule so the fight teaches it:

1. **Phase I:** fan, ring (with a visible safe gap), sweep: ordinary world time. Every telegraph is 0.85 to 1.2 simulated seconds, about 5x longer in real time while you stand still.
2. **Phase II, TEMPO:** *he conducts your time.* His pattern clock (spiral, summons, fan, ring, sweep) runs on how much you move or shoot (`tempoRate`: 25% when still and silent, 100% at a walk, 85% while you are firing), so camping behind a held trigger feeds him. A ring clock around him shows it (bright when running, dim when frozen). Moving is how you pay for his attacks; the boss bar says PHASE II · TEMPO.
3. **Phase III, BEATDROP:** a pattern locked to the music (`getMusicBeat()` in `music.js`, from the audible step clock; a world-time clock stands in with no music). A 4-beat cycle: on beat 1 he MARKS a straight line at you, beat 2 (the off-beat) is your dodge window (the line pulses white), beat 3 he FIRES a fan along the mark, beat 4 rests. Moving on the off-beat is the dodge. Charges and summons are mixed in; the charge leaves him exposed for 1.5 s (+100% damage).

**Cover is a short break, not a hideout.** After 4 real seconds without a clear line to you the Conductor stops his patterns and walks a nav path round the cover until he sees you; if he still has no line 7 seconds in, he LOBS: a marked circle tracks you, locks (white), and a 12-spoke burst rises from that spot (a green safe sector faces him, so the way out is toward him). The **charge** shows a lane exactly as wide as its hit, a spinning target X at its end, locks 0.65 s before the rush (red to white, chevrons racing), and has a wind-up sound plus a heavy strike sound; sidestep the lane after the lock. Pure rules (`sightAction`, `lobShots`, `chargeLane`) are covered by `boss-sight.test.js`.

Death moment: hit-stop, near-frozen time for 2.4 s, a shatter of pink shards and a ring in each phase colour, the win sting, the banner THE CONDUCTOR FALLS, then the exit opens. Logic is the pure `boss.js` (`tempoRate`, beat stages); `boss-fight.js` applies it and builds the stage lights and camera shift; `boss2d.js` draws it and its telegraphs.

### Meta progression safeguards

- Each upgrade states exactly what changes before purchase; tradeoffs say what they cost.
- Do not let permanent stats erase the core slow-time decision or the need to use cover.
- Keep a meaningful default path for players who never grind. Avoid daily chores.
- Derive totals from the saved record; never save duplicate derived stats.
- Provide a reset option and test corrupt, missing and older save records.

## Interface and accessibility

- Keep health, current room, run timer, scrap, active weapon and ammo visible during play. Time state is diegetic (grade, audio, edge meter), not a panel.
- Show both weapon slots and carry load at the workbench.
- Add remappable controls, separate aim/fire from movement, and support keyboard-only menu navigation.
- Keep keyboard focus inside the workbench while it is open and return it to the game on close; verify keyboard access for every remaining modal.
- Offer reduced screen shake, high-contrast enemy outlines, adjustable flash intensity, scalable UI, and color-safe rarity markers.
- Never communicate rarity or danger by color alone. Use icons or labels too.
- Pause on browser focus loss. Do not allow held movement/fire input to remain latched after restart or returning to the tab.

## Art, sound, and impact

- Use readable top-down shapes and strong value contrast. The player, enemy warnings, bullets, loot, crates, walls, and exits need different silhouettes.
- Room palettes can vary while gameplay colors stay consistent.
- Add layered gun sounds, reload cues, enemy tells, crate break, pickup, room-clear, and extraction audio. Provide volume sliders and mute. (Reload, tell, pickup, clear, extraction cues and saved mute control are implemented; live browser check pending.)
- Keep particles brief and capped. Reuse or pool effects if measured browser performance requires it.
- Use Three.js InstancedMesh for repeated floor/wall geometry. Keep object counts visible during profiling.
- Rapier 2D handles actor and projectile collision. ROT.js handles room topology. A full ECS is not needed until independent systems or object counts justify it.

## Technical structure

- `catalog.js`: immutable weapon, enemy, and attachment definitions.
- `rules.js`: small pure rules such as weapon stats, carry load, crate durability, tempo, and deterministic encounter composition.
- `game.js`: browser adapter and run orchestration; keep rendering, DOM, and input close to their actual owners.
- `index.html` / `style.css`: semantic HUD, menus, and presentation.
- Keep map generation separate from drawing when the generator grows; pass a seed and return plain room/tile data.
- Keep persistent-save parsing at its boundary. Gameplay rules should not depend on `localStorage` or DOM nodes.
- Do not add an ECS, physics abstraction, or generic item framework until a real feature needs it.

## Verification plan

### Unit coverage

- Projectile impacts resolve in swept-contact order; test enemy, crate, wall, cover, and player stops against the same function used by the live collision loop.

- World time follows player speed continuously: 0.08× still, 0.35× walking, 1× sprinting (eased); each shot adds a beat of world time; zero in menus.
- Every attachment changes only the intended weapon values.
- Carry weight sums correctly; an overweight swap is rejected; a valid replacement preserves the two-slot invariant.
- Crate health decreases by actual damage, clamps at zero, and cannot become negative.
- Seeded room and encounter generation is deterministic and respects bounds.
- Run payout includes death and extraction, with no duplicate reward on repeated result rendering.
- Save parsing rejects invalid numbers, unknown upgrades, and unsupported versions without corrupting the current run.

### Browser / integration checks

- Start a run and confirm the room layout, HUD, and entry station appear.
- Move, stop, and fire to verify the world grade, audio muffle and edge meter change with speed.
- Switch both weapon slots and reload each one; verify ammo is independent.
- Swap to a heavier gun, observe the load meter, and confirm overweight choices cannot be equipped.
- Shoot a crate until it breaks, confirm its collider disappears, and verify walls remain indestructible.
- Reach a combat room, defeat the encounter, collect loot, and extract.
- Die and restart; verify run-only scrap resets and future meta coins persist.
- Check narrow browser sizes, focus loss, pause, and restart for input/UI errors.
- Watch the console for import errors and runtime exceptions; capture screenshots for HUD and menus.

## Detailed delivery checklist

### In the current build

- [x] Browser playable with Three.js rendering, Rapier 2D physics, and ROT.js room generation.
- [x] Stillness/movement time scaling, aim, fire, reload, pause, and restart.
- [x] Hold Shift while moving to sprint 45% faster; R reloads, and old Shift-reload saves migrate safely.
- [x] Integrate the 13-gun catalog (3 assault rifles, 4 SMGs, 2 pistols, 3 precision rifles, and 1 shotgun) into combat, loadout, merchant, and weight-checked pickup choices.
- [x] Resolve swept bullet contacts in travel order; ordinary rounds stop after their first hit, precision rounds use separate enemy/crate budgets, anti-materiel rounds can pass one wall, and cover always stops a round.
- [x] Apply compatible attachments per weapon; restrict workbench options and retain attachments when switching guns.
- [x] Primary and secondary slots; `1` / `2` switching; weapon weight and capacity at the workbench.
- [x] Four enemy roles, knockback, hit stop, screen shake, particles, and short corpse slide.
- [x] Multi-room run, minimap, loot, room clear reward, and extraction.
- [x] Pay the room-clear scrap bonus only after a room that spawned enemies is cleared; safe clinics and merchant rooms do not grant a free fight reward.
- [x] Room props include permanent cover and health-based destructible crates.
- [x] Procedural rooms include rectangular, L, U, and C floor plans while preserving door links and room centers.
- [x] Small pure rules module and Node unit tests.

### Next: finish core run quality

- [x] Add seed selection/display and deterministic placement for props, pickups, and enemy spawns.
- [x] Validate every room layout for a path from entry to exit and reachable doorways. Browser integration checks cover 64 deterministic ROT.js seeds twice, plus the low-room-count larger-map retry.
- [x] Add seeded room roles that change enemy counts and provide guaranteed cache, armory, and clinic rewards.
- [x] Detect rooms that can be bypassed on the entry-to-extraction route and prefer one for the cache; label it SIDE CACHE. If a generated floor has no bypassable room, place the cache in a reachable middle room.
- [x] Add an optional locked cache gate when generation finds a doorway cut that isolates the reward room without blocking extraction. The gate costs 18 run scrap and opens with E; its closed cells block actors, sight, standard bullets, and enemy routes. Anti-materiel rifles retain their one-wall penetration.
- [x] Keep FIELD CLINIC rooms as quiet, guaranteed-heal rest stops.
- [x] Add a Warden miniboss and guaranteed loot to sufficiently large floors.
- [x] Turn the guaranteed optional cache branch into a secret room hidden from the minimap until found.
- [ ] Tune enemy budgets, ranged telegraphs, player damage, health drops, and run length through repeated play.
- [x] Give heavy Brute contact attacks a readable, committed wind-up and recovery so players can dodge the two-damage swing.
- [x] Improve workbench signposting and add a preview before replacing a gun or gear item.
- [x] Give every room a safely placed destructible crate. Show its remaining health on hit, deepen crack marks at damage thresholds, and remove its collision plus leave a scrap chance when it breaks.
- [x] Add a unique crate-break sound.
- [x] Show extraction or death, rooms cleared, kills, and coins earned.

### Next: account and metaprogression

- [x] Create a versioned local save record for coins and permanent upgrades.
- [x] Award coins exactly once on death or extraction; show the run summary payout.
- [x] Build the between-run upgrade screen and buy capped permanent upgrades.
- [x] Implement Runner’s Legs, Still Mind, Salvager crate and room-clear scrap bonuses, and Carry Rig with capped effects.
- [x] Add Room Sense: explored rooms and known threats stay on the minimap; upgrades reveal nearby rooms and enemy blips through walls at increasing ranges.
- [x] Add Vital Reserve: three permanent tiers add one maximum health each and start new runs fully healed.
- [x] Test progress persistence across browser refreshes; add a visible save reset option with a confirmation prompt.

### Next: inventory and gear

- [x] Add a weighted armor plate with separate durability and repair cost; healing restores health only.
- [x] Show weapons, armor, and total weight at the workbench; block overweight swaps.
- [x] Add the ammo harness as weighted gear; it reduces reload time for both carried weapons.
- [x] Add a weighted loot scanner that reveals nearby guns, attachments, healing, and scrap on the minimap through walls without exposing undiscovered secret-cache loot.
- [ ] Tune healing, armor repair cost, and durability through longer runs.
- [x] Add a confirmation preview when replacing a weapon or gear item.
- [x] Implement permanent carry capacity upgrades; playtest different weapon/armor choices.
- [x] Add an optional third weapon slot at the final Carry Rig tier; keep every pickup, shop purchase, and swap weight-limited.
- [x] Make weapon pickups show the exact gun and weight, swap either slot when capacity allows, or decline while leaving the pickup in place.

### Combat and run services

- [x] Add visible player/enemy weapons that track aim and tilt during reload.
- [x] Add enemy aim telegraphs and committed projectile directions so shots can be dodged at both tempo speeds.
- [x] Start ranged aim tells only when the enemy is within the camera view, and cancel the shot if it leaves view before firing.
- [x] Connect smoke, flash, frag, and incendiary throwables to input, counts, physics, effects, and enemy behavior.
- [x] Add rare shopkeeper rooms and scrap purchases for guns, per-gun attachments, armor/health, and throwable refills.
- [ ] Playtest and tune line of sight, enemy interruptions, throw fuses, rare shop frequency, and carry limits.

### Next: polish and maintainability

- [x] Split seeded map generation from the renderer; `dungeon.js` returns tested room, role, and route data.
- [x] Add a compact in-browser smoke check for seeded start, movement and firing at both time rates, a released three-round KITE BURST and reload lock, crate damage, reload, an attachment purchase, frag detonation, pause, loadout, and a safehouse upgrade that survives reload (`tests/game-smoke.html`).
- [x] Add a seeded encounter browser probe for clearing the first room, opening an affordable reward gate, and dodging a fresh ranged shot that would hit a stationary player (`tests/full-floor-browser-harness.html`).
- [x] Add initial gunfire and crate-break sound effects with a saved master-volume control.
- [x] Add adjustable camera shake and flash brightness options.
- [x] Add remappable keyboard controls with WASD and fallback arrow movement, while keeping Escape, Tab, F, and R fixed for pause, loadout, fullscreen, and restart.
- [x] Keep keyboard focus within loadout, safehouse, weapon-pickup, cache, and merchant dialogs; unit-test the shared wrap and redirect behavior.
- [ ] Profile a full run for sustained performance.
- [x] Cap active particles at 240, dispose evicted/expired effects, and free the old Rapier world on run reset.
- [ ] Run an architecture review after the next major milestone; remove abstractions that do not own real rules.
- [ ] Update this document when actual game behavior changes; mark delivered items only after verification.

## Current acceptance gate

A player can launch a seeded run, explore generated connected rooms, discover a hidden cache branch, and find an optional scrap-gated cache door, Warden miniboss, and safe FIELD CLINIC on supported floors. Runs use weighted weapon slots, armor with durability separate from health, dodgeable ranged attacks, throwables, a rare merchant, destructible crates, room-clear rewards, and extraction or death. Both outcomes award persistent coins for capped upgrades to speed, idle time, crate loot, carry capacity, and minimap scouting. The main open work is full-floor human playtesting, balance across different seeds, and sustained performance profiling; the scripted browser probe covers the first encounter, not a complete run.
