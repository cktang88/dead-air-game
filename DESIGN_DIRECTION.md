# DEAD AIR — Design Direction

This document sets the bar every change is measured against. When a feature does not serve the pillars below, it is cut or folded into something that does. `GAME_SPEC.md` holds the systems detail; this file holds the intent.

## The diagnosis

The game was built feature-first: thirteen guns, five mod types with tiers, carry weight, four throwables, shells, caches, gates, lockers, a merchant, perks, upgrades. Each piece is reasonable; together they read as a list, not a game. The one genuinely distinctive idea, *time breathes with you*, is buried under HUD text that explains it instead of the world making you feel it. In the current rule, moving runs time at full speed, so most of play is an ordinary twin-stick shooter that sometimes pauses. That is the root problem: the hook only exists when you stop.

Great small action games are the opposite shape. SUPERHOT is one rule pushed until every room is a puzzle. Hotline Miami makes both sides lethal so a room is solved in five seconds of execution after thirty of reading. Intravenous makes information the resource: light, sound, doors, sight lines. Escape from Duckov makes leaving the hard part: what you carry out is what you keep. None of them win on feature count. They win on intention.

## Pillars

1. **Time is the weapon.** World time follows how hard you are acting, not a binary. Standing still is a near-freeze; walking is slow; sprinting and shooting spend time. Every action has a time cost, so every action is a decision. The world, not the HUD, shows it: color drains and sound muffles as time thins; muzzle flashes and footsteps "tick" the world forward.
2. **Read, then commit.** A room is a puzzle you read before you solve it. Enemies broadcast intent clearly (aim lines, wind-ups, alert states). Doors are thresholds: you can peek through them in frozen time before you enter. Planning is rewarded; panic is punished.
3. **Lethal both ways, fast to retry.** Enemies die in one or two good hits. You die in a few. A failed room is a lesson, not a grind, and a new run starts in under three seconds.
4. **Greed is the run.** Each floor ends with a choice: extract and bank, or descend for more. Risk is visible and chosen, not random.
5. **Fewer, sharper things.** Every gun has a job you can name in two words. Every pickup is obvious at a glance. Every UI element earns its pixels. If two systems do the same job, keep the better one.
6. **One world, one voice.** DEAD AIR is a dead broadcast: a sealed signal bunker where the transmission cut out. Radio static, warning lights, tape-label UI, interference when time slows. The title, the HUD, the rooms, the sounds and the enemies all come from that place.

## Concrete changes (priority order)

### 1. The time rule (the hook)
- World time scales continuously with player speed: about 0.08× when still, about 0.35× at a walk, 1× at full sprint. Easing stays.
- Each shot advances the world by a fixed "beat" (about 0.12 s of world time at the current rate), so spraying is visibly costly and a single deliberate shot is cheap.
- Remove the always-on tempo panel. Time state is shown diegetically: desaturation and a cold tint, low-pass audio, a faint film flicker, and a thin edge meter that only appears while time changes. The first-run hint teaches it once.

### 2. Lethality and readability
- Basic enemies die to one or two shots of a fitting gun. Player health becomes three hits, with armor as a single extra hit. Brutes, riots and the boss are the exceptions, with clear weak points.
- Every enemy attack has a wind-up that is readable at full speed and generous in slow time. No unseen damage: off-screen threats are indicated before they fire.
- One-hit feedback is huge: hit-stop, a sharp sound, a body that flies. Damage numbers become optional; a kill should read without text.

### 3. Rooms as puzzles
- Doors are closed until you open them. Holding the interact key at a door peeks through it in frozen time, revealing who is inside and where they face.
- Enemies start in readable postures (patrolling, guarding, sleeping, gathered at a table) instead of all aware at once. Sound (unsuppressed shots, sprinting) wakes neighbors; that makes stealth a real option, as in Intravenous.
- Each room template has an intended solution space: a flank route, a choke point, a light to shoot out, explosive barrels. Fewer random crates; more purposeful cover.

### 4. Cut and fold
- Guns: six with clear jobs (sidearm, SMG, shotgun, rifle, marksman, launcher), plus rare variants found in runs. Remove carry weight; two slots, swap at pickup.
- Mods: one slot per gun with a handful of meaningful mods (suppressor changes stealth, extended mag, piercing, etc.). No tiers; rarity lives in the run perks.
- Throwables: keep frag and flash (the two that interact with slow time best); fold smoke and incendiary into perks or rare finds.
- Economy: one in-run currency (scrap) and one meta currency (coins). Merchant, lockers and caches merge into one "supply drop" interactable with three clear options.

### 5. The macro loop
- Short runs: 3 floors and a boss, 10–20 minutes. Extract-or-descend after each floor. Dying loses unbanked coins.
- Meta unlocks add options (guns, starting kits, perks), not raw stats. Challenges teach mastery ("clear a room without being seen", "three kills in one breath").
- A daily seed with a shareable result line.

### 5b. Roguelike structure that earns replays (Hades, Gungeon, Dead Cells, Slay the Spire)
- **Choose your next reward at the door (Hades).** Every exit door shows an icon for what the next room pays out: a frequency, scrap, a gun, healing, a supply drop, or a skull for an elite. Route choice becomes the run's strategy, and it fits pillar 2.
- **Frequencies, not perks.** In-run upgrades come from radio "stations". Each station is a family with its own voice and play style:
  - STATIC: shots chain, stun and interfere.
  - DEADLINE: kills refund time and extend slow time.
  - CARRIER: piercing and ricochet.
  - NIGHT SHIFT: stealth and silent kills.
  - FEEDBACK: damage scales with risk.
  Upgrades stack and rank up within a station, and a two-station pair unlocks a rare **crossfade** synergy. Builds should feel distinct by floor 2.
- **Death moves the story forward (Hades).** The safehouse has a radio operator who comments on how you died, what you found and what you killed. Recovered tapes play short transmissions that slowly explain what happened to the station. A failed run still ends with something new.
- **Interference (Hades' heat).** After the first win, players can stack difficulty modifiers for better rewards: armored enemies, faster wind-ups, no slow time below a certain health, and so on.
- **Mastery tools.** A short dash with invulnerability frames, on a cooldown measured in world time. Gun aspects unlocked in the safehouse change how a gun works, not just its numbers. Seeded daily runs come with a one-line result to share.

### 6. First 60 seconds (what a judge sees)
- 0–5 s: a broadcast test card glitches into the title, with static, a tone and a dropout.
- 5–20 s: the player loads into the first room with no menus between. One line of instruction appears. The world is frozen until they move, so the time rule is felt before it is explained.
- 20–60 s: the first room is hand-tuned: two enemies, a door to peek through, one perfect slow-time dodge, and a kill with a huge hit-stop. A reward pick at the exit door shows the roguelike layer immediately.

### 7. Identity and polish
- Title: a broadcast test card that glitches into the game. UI uses tape labels, monospace readouts and CRT-free restraint; no generic dark-glass panels.
- Sound: room tone, distant machinery, radio chatter from enemies that cuts when they die, a heartbeat at low health. Silence is a feature.
- Every animation sells weight and intent. Nothing moves without a reason.

## How to judge a change
Ask: does it make the time rule matter more, make rooms read better, make deaths fairer and faster, make the greed choice sharper, or make the world more itself? If not, it waits.
