// The safehouse radio operator and the recoverable TAPES. Pure data + selection; state lives in progress
// (progress.tapes = collected tape ids). Death moves the story forward: every run end yields a line, and a tape
// is recovered whenever the next one's requirement is met (at most one per run, so the story unspools slowly).

export const OPERATOR = 'OPERATOR';

// Requirement metrics read progress.stats (after the run was recorded). `goal` is the threshold.
export const TAPES = [
  {id: 't01', title: 'TEST TONE', text: 'This is the Meridian Relay. If you are hearing this, the broadcast is still alive. Stay on frequency.', metric: 'runs', goal: 1},
  {id: 't02', title: 'SHIFT LOG 14', text: 'Doors sealed from the inside at 03:12. Nobody on the floor admits to giving the order.', metric: 'totalKills', goal: 20},
  {id: 't03', title: 'THE CLOCK', text: 'Time is wrong down here. When I stop moving the whole building stops with me. I tested it twice.', metric: 'deepestFloor', goal: 2},
  {id: 't04', title: 'MAINTENANCE', text: 'The Foundry pumps never stopped. Someone keeps feeding them tape reels. Whole reels. Of us.', metric: 'deaths', goal: 3},
  {id: 't05', title: 'CALLSIGN', text: 'He called himself the Conductor. Said the station had been out of tune for years and he was finally fixing it.', metric: 'deepestFloor', goal: 3},
  {id: 't06', title: 'LAST STAND', text: 'They go quiet when they are close. Quiet is the loudest thing in here. Count your breaths.', metric: 'totalKills', goal: 100},
  {id: 't07', title: 'SIGNAL', text: 'The transmission never cut out. We did. Every floor is a different frequency of the same bad night.', metric: 'extracts', goal: 3},
  {id: 't08', title: 'THE CONDUCTOR', text: 'He is not a man. He is the baton. The station plays whoever holds it. Do not hold it.', metric: 'bossKills', goal: 1},
  {id: 't09', title: 'ENCORE', text: 'If you broke the baton and the music still plays, then it was never his song. Keep listening.', metric: 'wins', goal: 2},
  {id: 't10', title: 'SIGN OFF', text: 'This is the Meridian Relay, signing off. Whoever you are: you stayed on the line. Thank you.', metric: 'bossKills', goal: 3},
];
export const TAPE_BY_ID = new Map(TAPES.map(t => [t.id, t]));

export function tapeReady(stats, tape) { return (stats?.[tape.metric] || 0) >= tape.goal; }

// The next tape to recover, if any: first uncollected tape (in story order) whose requirement is met.
export function nextTape(progress) {
  const have = new Set(progress.tapes || []);
  return TAPES.find(tape => !have.has(tape.id) && tapeReady(progress.stats, tape)) || null;
}
export function collectTape(progress) {
  const tape = nextTape(progress);
  if (!tape) return {progress, tape: null};
  return {progress: {...progress, tapes: [...(progress.tapes || []), tape.id]}, tape};
}

const CAUSE_NAMES = {chaser: 'rusher', gunner: 'gunner', brute: 'brute', sniper: 'marksman', riot: 'riot guard', guard: 'warden', boss: 'Conductor', elite: 'warden'};
const CAUSE_LINES = {
  chaser: ['Rushers. They do not hesitate, so you have to. Stop, let the room slow down, then pick them off.', 'Something fast got to you. Fast is only a problem when you are moving.'],
  gunner: ['Gunners cannot hit what is not in the line. Break the line, then take the shot.', 'Crossfire. Next time find the wall that is on your side.'],
  brute: ['You stood in front of a brute. Brutes wind up for a long time. Use it.', 'Big ones telegraph. Step out of the swing and shoot while it recovers.'],
  sniper: ['Marksmen show you the lane before they fire. When the line goes red, you should already be gone.', 'They see further than you do. Take cover or take the first shot.'],
  riot: ['Riot shields only cover the front. Circle, or wait for them to turn and take the back.', 'You shot the shield. Everyone does once.'],
  guard: ['Wardens hold their ground. Make them move before you commit.', 'A warden pinned you down. Flashbangs open them up.'],
  boss: ['That was the Conductor. Every pattern had a telegraph. In slow time you can read all of them.', 'He winds up before every move. Stop moving and the whole hall all but stops with you.'],
  elite: ['An elite room. The skull on the door is a promise.', 'You were warned. The skull on the door means it.'],
};
const GENERIC_DEATH = ['Signal lost. Stay on the line.', 'You went quiet. Come back and try again.', 'Dead air. Reset and reroute.'];
const DEPTH_LINES = {
  1: 'You never left the first floor. The first door is a lesson, not a wall.',
  2: 'Second floor. The foundry is where the marksmen start.',
  3: 'Third floor. One more door and you meet him.',
  4: 'You reached the Conductor. That is further than almost anyone.',
};
const WIN_LINES = ['The Conductor is down. The station is quiet. Listen to that.', 'You did it. Take a breath. It is the first real silence in years.'];
const FIRST_BOSS = 'That was him. The baton is yours now. The signal is clearer. I can almost hear the broadcast.';
const EXTRACT_LINES = ['You made it out with the haul. Smart. Bank it, then go again.', 'Extracted. Coins banked. The deeper floors will still be there.'];
const FIRST_RUN = 'First time on the line. Move to run time, stop to slow it. Everything else is detail.';

const pick = (list, seed) => list[Math.abs(Math.floor(seed)) % list.length];

// ctx: {outcome:'dead'|'extract'|'won', cause (enemy type or 'boss'), floor, firstBossKill, newUnlocks:[names], newTape, runs, seed, kills}
export function operatorLines(ctx) {
  const lines = [], seed = ctx.seed || 0;
  if (ctx.runs === 1 && ctx.outcome !== 'won') lines.push(FIRST_RUN);   // only the real first run, never a later win
  if (ctx.outcome === 'won') lines.push(ctx.firstBossKill ? FIRST_BOSS : pick(WIN_LINES, seed));
  else if (ctx.outcome === 'extract') lines.push(pick(EXTRACT_LINES, seed));
  else {
    const named = CAUSE_LINES[ctx.cause];
    lines.push(named ? pick(named, seed) : pick(GENERIC_DEATH, seed));
    if (DEPTH_LINES[ctx.floor] && ctx.runs > 1 && ctx.floor >= 2) lines.push(DEPTH_LINES[ctx.floor]);
  }
  if (ctx.newUnlocks?.length) lines.push(`Fresh signal: ${ctx.newUnlocks.slice(0, 3).join(', ')} unlocked. Check the armory.`);
  if (ctx.newTape) lines.push(`Recovered a tape: "${ctx.newTape.title}". It is in the safehouse player.`);
  return lines.map(text => ({speaker: OPERATOR, text}));
}

export const causeName = type => CAUSE_NAMES[type] || 'unknown';

// ---------------------------------------------------------------------------------------------------- field tapes
// Hidden TAPES lying in odd corners (secrets.js planTape) and behind cracked walls. Pure flavour: playing one shows the
// transmission as a subtitle while the screen flickers into test-card colours. They never touch balance.
export const FIELD_TAPES = [
  {id: 'f01', title: 'TAPE · SIDE A', text: 'Test, test. If the red light is on, I am still broadcasting. If it is off, I am talking to myself again.'},
  {id: 'f02', title: 'TAPE · BREAK ROOM', text: 'Somebody keeps winding every clock to 3:12. I asked why. They said it is the only time that stayed true.'},
  {id: 'f03', title: 'TAPE · FLOOR 2', text: 'Counting station on the next channel. A woman reads numbers. At nine she stops and breathes. Then it starts over.'},
  {id: 'f04', title: 'TAPE · NIGHT SHIFT', text: 'Left my coffee on the desk when the doors sealed. It was still hot yesterday. I do not think that is the strange part.'},
  {id: 'f05', title: 'TAPE · REQUEST LINE', text: 'A listener called in. Asked us to play something slow. Nobody had the heart to tell her what the building had become.'},
  {id: 'f06', title: 'TAPE · LOCKER 9', text: 'If you found this, you looked in the corners. Good. The ones who only look at the doors never learn anything.'},
  {id: 'f07', title: 'TAPE · STATION ID', text: 'This is the Meridian Relay. We are not currently on the air. Please do not adjust your set. Please do not adjust yourself.'},
];
export const fieldTapeFor = (seed = 0, floor = 1) => FIELD_TAPES[Math.abs(Math.floor(seed) + floor * 3) % FIELD_TAPES.length];

// What the operator murmurs when the runner checks the radio after standing still a while: short, cryptic, in-world.
export const RADIO_MUTTERS = [
  'kshh... still there?',
  '...hold the line...',
  'copy. ...copy?',
  '...it is 03:12...',
  'nine... eight... kshh',
  '...do not stop listening...',
  'who is on this channel',
  '...stand by... stand by...',
  'kkk-chhh... runner?',
  '...I can hear you breathing...',
];
export const RARE_MUTTER = 'You can stop now. Nobody is coming. ...Keep standing there if you like.';
export const radioMutter = (seed = 0) => RADIO_MUTTERS[Math.abs(Math.floor(seed)) % RADIO_MUTTERS.length];
