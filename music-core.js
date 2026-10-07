// DEAD AIR sound identity: pure helpers (no Web Audio, no DOM) shared by music.js / ambience.js / title-intro.js.
// Everything here is deterministic given a seed, so it is unit-tested in music-core.test.js.

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

/** Small fast seeded PRNG (mulberry32). Returns a function giving floats in [0,1). */
export function makeRng(seed){
  let a=(Number.isFinite(seed)?Math.floor(seed):1)>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}

/** Mix a seed and a label into one 32-bit seed. */
export function seedFor(seed,label=''){
  let h=2166136261^(Number.isFinite(seed)?Math.floor(seed)>>>0:1);
  for(const ch of String(label)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}

export const midiToHz=m=>440*Math.pow(2,(m-69)/12);
export const pick=(rng,list)=>list[Math.floor(rng()*list.length)%list.length];

/* ------------------------------------------------------------ time -> tempo/pitch (the signature) */

export const SLOW_TIME_SCALE=.18;
export const MIN_RATE=.5;

/** World time scale (0..1) -> tape rate 0.5..1. Tempo AND pitch both follow this: 1 = normal, ~0.6 = standing still (deep slow). */
export function musicRate(timeScale){
  const s=Number.isFinite(timeScale)?clamp(timeScale,0,1):1;
  return clamp(MIN_RATE+(1-MIN_RATE)*Math.pow(s,.7),MIN_RATE,1);
}

/** Tape pitch shift in cents for a rate (what the global detune bus carries). */
export const rateToCents=rate=>1200*Math.log2(clamp(rate,.05,4));

/** Duration in seconds of one 16th-note step at `bpm` when the tape runs at `rate`. */
export function stepDuration(bpm,rate=1){
  const b=Number.isFinite(bpm)?bpm:120,r=Number.isFinite(rate)?rate:1;
  return 60/Math.max(30,b)/4/clamp(r,.05,4);
}

/** Global low-pass for a tape rate and health state: dull when slow, choked when nearly dead. */
export function musicCutoff(rate,{lowHealth=false,paused=false}={}){
  const slow=1-clamp((rate-MIN_RATE)/(1-MIN_RATE),0,1);
  let hz=16000*Math.pow(2600/16000,slow);
  if(lowHealth)hz*=.5;
  if(paused)hz=Math.min(hz,700);
  return Math.round(clamp(hz,260,18000));
}

/* ------------------------------------------------------------ the score: real tracks, driven by game state */

/**
 * One looping (or one-shot) electronic track per game state. Every file starts exactly on a downbeat and holds a whole
 * number of bars, so (position / beat length) is the musical beat and the loop point is seamless. bpm is the true tempo
 * measured from the source (see CREDITS.md for who made what). `gain` trims the state's level in the mix.
 */
export const TRACKS={
  title:  {file:'title.mp3',  bpm:101.042,bars:16,loop:true, gain:.7},
  explore:{file:'explore.mp3',bpm:110.538,bars:32,loop:true, gain:.62},
  tension:{file:'tension.mp3',bpm:130.004,bars:24,loop:true, gain:.8},
  combat: {file:'combat.mp3', bpm:142.864,bars:24,loop:true, gain:1},
  boss:   {file:'boss.mp3',   bpm:84.998, bars:20,loop:true, gain:1},
  win:    {file:'win.mp3',    bpm:116.998,bars:10,loop:false,gain:.9,next:'title'}
};
export const TRACK_NAMES=Object.keys(TRACKS);
export const BEATS_PER_BAR=4;
export const trackDuration=name=>{const t=TRACKS[name];return t?t.bars*BEATS_PER_BAR*60/t.bpm:0;};

/** When a state's own track has not loaded (or failed), the nearest sensible stand-in. */
export const FALLBACKS={
  title:['explore'],explore:['title','tension'],tension:['explore','combat','title'],
  combat:['tension','boss','explore','title'],boss:['combat','tension','explore','title'],win:['title','explore']
};
/** The state to actually play: its own track if loaded, else the first loaded fallback, else null (silence). */
export function resolveTrack(state,loaded){
  const has=n=>loaded instanceof Set?loaded.has(n):!!loaded?.[n];
  if(!TRACKS[state])return null;
  if(has(state))return state;
  for(const alt of FALLBACKS[state]||[])if(has(alt))return alt;
  return null;
}

/** Which tracks to fetch first, in order: what the title needs, then calm play, then the fight states. */
export const LOAD_ORDER=['title','explore','tension','combat','boss','win'];

/* --- scene machine: game facts -> one of explore / tension / combat / boss (title, win and dead come from the mode) --- */

export const SCENE_RANK={explore:0,tension:1,combat:2,boss:3};
export const COMBAT_HOLD=6,TENSION_HOLD=4,BOSS_HOLD=8,MIN_DWELL=2.5;

/**
 * Debounced scene selection in REAL seconds. Going up (explore -> tension -> combat -> boss) is instant; coming down
 * waits for the state's hold timer after the last trigger (combat holds 6 s after the last shot or aware enemy) AND at
 * least MIN_DWELL seconds in the current scene, so the music never flip-flops. reset() drops straight to explore (room clear).
 */
export function createSceneMachine({combatHold=COMBAT_HOLD,tensionHold=TENSION_HOLD,bossHold=BOSS_HOLD,minDwell=MIN_DWELL}={}){
  let scene='explore',dwell=0,combatT=0,tensionT=0,bossT=0;
  const api={
    /** facts: {engaged (aware enemy close), sight (an aware enemy has line of sight to you; hunting you blind does NOT hold combat), aware (any aware enemy about), suspicious, shot (player fired this frame), boss} */
    update(dt,{engaged=false,aware=false,suspicious=false,shot=false,boss=false,sight=true}={}){
      const d=Math.max(0,Number.isFinite(dt)?dt:0);dwell+=d;
      const threat=engaged||aware||suspicious;
      if(boss)bossT=bossHold;else bossT=Math.max(0,bossT-d);
      if((engaged&&sight)||(shot&&threat))combatT=combatHold;else combatT=Math.max(0,combatT-d);
      if(threat||combatT>0||bossT>0)tensionT=tensionHold;else tensionT=Math.max(0,tensionT-d);
      const want=bossT>0?'boss':combatT>0?'combat':tensionT>0?'tension':'explore';
      if(SCENE_RANK[want]>SCENE_RANK[scene]){scene=want;dwell=0;}
      else if(want!==scene&&dwell>=minDwell){scene=want;dwell=0;}
      return scene;
    },
    reset(){scene='explore';dwell=0;combatT=tensionT=bossT=0;return scene;},
    get scene(){return scene;}
  };
  return api;
}

/** Final music state from the game mode and the scene machine's scene. */
export function stateFromGame({mode,scene='explore'}){
  if(mode==='dead')return 'dead';
  if(mode==='won')return 'win';
  if(mode!=='play')return 'title';
  return scene;
}

/* --- clock: where in the track are we, and when is the next bar line --- */

/** Advance a track position (seconds of audio) by dt real seconds at a tape rate. Loops wrap; one-shots clamp at the end. */
export function advancePosition({pos,loops=0},dt,rate,duration,loop=true){
  let p=pos+Math.max(0,dt)*Math.max(0,rate),n=loops;
  if(duration<=0)return {pos:0,loops:0,ended:true};
  if(loop){while(p>=duration){p-=duration;n++;}return {pos:p,loops:n,ended:false};}
  return p>=duration?{pos:duration,loops:n,ended:true}:{pos:p,loops:n,ended:false};
}

/** The beat being heard: {index (monotonic whole beats since the track started, loops included), phase 0..1, bpm, bar, beatInBar}. */
export function beatFromPosition({pos,loops=0},track){
  const beatLen=60/track.bpm,perLoop=track.bars*BEATS_PER_BAR,beats=pos/beatLen+loops*perLoop,index=Math.floor(beats+1e-9);
  return {index,phase:Math.max(0,beats-index),bpm:track.bpm,bar:Math.floor(index/BEATS_PER_BAR),beatInBar:((index%BEATS_PER_BAR)+BEATS_PER_BAR)%BEATS_PER_BAR};
}

/**
 * Real seconds until the next bar line of a track playing at `rate`. If the bar line is further than maxWait away (deep
 * slow-mo stretches a bar a lot) falls back to the next beat so a change is never sluggish. Always at least minWait away.
 */
export function nextBoundary({pos,bpm,rate=1,maxWait=3.2,minWait=.06}){
  const beatLen=60/bpm,r=Math.max(.05,rate),beats=pos/beatLen;
  const toBar=(BEATS_PER_BAR-(beats%BEATS_PER_BAR))%BEATS_PER_BAR,toBeat=(1-(beats%1))%1;
  let wait=toBar*beatLen/r,kind='bar';
  if(wait<minWait)wait+=BEATS_PER_BAR*beatLen/r;
  if(wait>maxWait){kind='beat';wait=toBeat*beatLen/r;if(wait<minWait)wait+=beatLen/r;}
  return {wait,kind};
}

/** One smoothing step of the tape rate: glides down slowly (tape winding down), snaps back up quickly. */
export function stepRate(rate,target,dt,tauDown=.24,tauUp=.1){
  const tau=target<rate?tauDown:tauUp;
  return rate+(target-rate)*(1-Math.exp(-Math.max(0,dt)/tau));
}

export function isLowHealth(health,maxHealth){
  if(!Number.isFinite(health)||!Number.isFinite(maxHealth)||maxHealth<=0)return false;
  return health>0&&(health<=1||health/maxHealth<=.34);
}

/* --- mix --- */

export const MUSIC_TRIM=.42;       // keeps the score under the SFX bus at the default 55 % slider
export const PAUSE_DUCK=.45;
/** Output level for the music bus: slider volume x trim x pause duck. */
export const musicLevel=(volume,{paused=false}={})=>clamp(Number.isFinite(volume)?volume:0,0,1)*MUSIC_TRIM*(paused?PAUSE_DUCK:1);
/** Crossfade length in seconds for a track change at a given tape rate (about two beats of the incoming track). */
export const crossfadeSeconds=(bpm,rate=1)=>clamp(60/bpm*2/Math.max(.3,rate),.5,2.4);

/* ------------------------------------------------------------ ambience helpers */

/** Floor material id -> ambient room tone family. */
export function ambienceThemeFor(floor){
  if(floor==='grate'||floor==='hazard'||floor==='dirt')return 'furnace';
  if(floor==='tile'||floor==='vault')return 'cold';
  return 'server';
}

/**
 * Plan for one radio chatter burst: a vocoder-ish run of syllables (formant pairs + gate), never words.
 * Returns {pitch,total,syllables:[{t,dur,f1,f2,vol}]}.
 */
export function chatterPlan(rng,{maxDuration=2.2}={}){
  const pitch=95+rng()*90,count=3+Math.floor(rng()*7),syllables=[];
  let t=.06;
  for(let i=0;i<count;i++){
    const dur=.05+rng()*.11;
    if(t+dur>maxDuration)break;
    syllables.push({t,dur,f1:300+rng()*550,f2:900+rng()*1900,vol:.55+rng()*.45});
    t+=dur+(rng()<.22?.14+rng()*.18:.02+rng()*.05);
  }
  return {pitch,total:t+.05,syllables};
}

/** Next machinery event: type and the delay until it, in seconds. */
export function nextMachineryEvent(rng){
  return {delay:5+rng()*10,type:pick(rng,['thud','clank','pipe','thud','clank','pipe'])};
}

/* ------------------------------------------------------------ title intro timeline */

export const INTRO_TOTAL=2.7;
/** Phase of the broadcast test-card intro at time t seconds. */
export function introPhaseAt(t){
  if(t<1.05)return 'bars';
  if(t<1.4)return 'glitch';
  if(t<1.75)return 'static';
  if(t<INTRO_TOTAL)return 'title';
  return 'done';
}
