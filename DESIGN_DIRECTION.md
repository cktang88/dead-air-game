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
5. **Fewer near-duplicates, more distinct choices.** Every gun has a job you can name in two words; variety comes from behaviors that combine, not from stat variants. Every pickup is obvious at a glance. Every UI element earns its pixels. If two systems do the same job, keep the better one.
6. **One world, one voice.** DEAD AIR is a dead broadcast: a sealed signal bunker where the transmission cut out. Radio static, warning lights, tape-label UI, interference when time slows. The title, the HUD, the rooms, the sounds and the enemies all come from that place.

## Principles every feature must follow

These come from the canon: Super Mario Bros. 1-1 and Portal (teach by doing), Don Norman's affordances and feedback, Nintendo's kishōtenketsu level structure (introduce, develop, twist, conclude), Celeste and Hades (respect the player and their time), and Jesse Schell's lenses of surprise, fun and the toy.

1. **Teach by doing, not by reading.** Every mechanic is introduced in a safe space where the player discovers it, then tested with mild pressure, then twisted. Text is a fallback, never the lesson. The first floor *is* the tutorial.
2. **No hidden rules.** If a rule affects the outcome, the player can see it at the moment it matters: the shield arc is drawn, noise radius ripples when you fire, the vision cone shows when an enemy is looking, and damage numbers show bonuses. A pause-menu field manual lists every mechanic the player has met so far, in one line each.
3. **Affordance and consistency.** Things that look alike behave alike. Interactables glow the same way; hazards share one color; every enemy attack has a wind-up in the same visual language. A new thing is introduced with a name card the first time it appears.
4. **Feedback for every action.** Every input produces an immediate, proportional response in sight and sound. Every failure tells you why ("KILLED BY MARKSMAN · STOOD IN A LANE").
5. **Every element earns joy.** Each feature must be fun to use, satisfying to see or hear, or surprising in a way the player can later master. Nothing exists to be different or unusual for its own sake. If a system is just bookkeeping, cut it or make it a toy.
6. **Respect time.** Instant restarts, no unskippable text, short runs, and checkpoints of knowledge (the field manual and tapes) instead of grind.
7. **Surprise with rules, not randomness.** Surprises come from systems interacting in ways the player can understand afterward: a ricochet kill, a flash through a door, an enemy shooting its friend. Randomness sets up situations; it never decides outcomes the player could not read.

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

### 4. Trade numbers for behaviors (cut only what a better thing replaces)
Build diversity is the heart of a roguelike, so nothing is cut unless what replaces it gives the player more distinct decisions. The test for every change: name what the player loses, name what they gain, and only ship it if the gain is a new way to play rather than a new number. Today's variety is mostly stat variants (five SMG-like guns that differ by a few percent, mod tiers that scale by 1.0–1.45×). That is breadth without depth. The aim is fewer near-duplicates and many more distinct play styles.
- **Guns: keep every gun that plays differently, merge the ones that only differ by numbers.** Keep a roster of about 8–9 where each has a verb: spray (SMG), burst (burst SMG), punch (heavy pistol), sweep (shotgun with buckshot/slug as a real choice), steady (carbine), pierce (marksman: through enemies), breach (anti-materiel: through a wall), plus a launcher. Near-duplicates become rare *variants* found in runs (same verb, a twist), so the drop pool still surprises.
- **Mods: from stat tiers to behaviors.** One slot per gun, no tiers. Each mod changes how you play: suppressor (half noise ring, enables stealth), ricochet rounds, incendiary rounds, extended mag, quick-draw (instant swap), long barrel (pierce one enemy). Power growth comes from frequencies, which stack and combine.
- **Throwables: keep the ones that create situations.** Frag (area kill), flash (stun through a doorway), smoke (breaks vision cones, which now matter for stealth). Incendiary becomes a mod and a frequency effect instead of a fourth grenade.
- **Carry weight: cut.** It was a constraint without a toy; the two-slot limit already forces the choice, and swap-at-pickup makes it immediate.
- **Supply: merge merchant, locker and cache into one supply drop with three visible options.** Same decisions, one thing to learn.
- **Healing: one system.** Room-clear medkit when hurt, plus rare drops. Invisible regen is cut.
- **Every cut is reviewed against the balance harness and a playtest**: if runs feel samier afterward, the cut is reverted or the replacement is strengthened.

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

### 5c. Onboarding: the Signal Check
The first run starts on a short, hand-built floor, the "Signal Check", before the generated floors. It has five rooms, each teaching one idea through play:
1. **Breath:** a frozen room with a bullet hanging in the air. Moving makes it move. The player learns the time rule with no text beyond "MOVE".
2. **Shot:** one sleeping enemy behind glass. Shooting it teaches aim and shows that a shot spends time.
3. **Dodge:** a gunner fires a slow, telegraphed shot down a corridor. Standing still makes the dodge trivial, which teaches using stillness to read.
4. **Door:** peek through a door, see two enemies, choose a route. A flashbang is offered here.
5. **Choice:** the first reward door pick, then the exit to the real run.

Returning players skip it, and it can be replayed from settings. A pause-menu field manual unlocks entries as mechanics are met.

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
