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
export const MIN_RATE=.4;

/** World time scale (0.18..1) -> tape rate. Tempo AND pitch both follow this: 1 = normal, ~0.46 = deep slow. */
export function musicRate(timeScale){
  const s=Number.isFinite(timeScale)?clamp(timeScale,0,1):1;
  return clamp(Math.pow(s,.45),MIN_RATE,1);
}

/** Tape pitch shift in cents for a rate (what the global detune bus carries). */
export const rateToCents=rate=>1200*Math.log2(clamp(rate,.05,4));

/** Duration in seconds of one 16th-note step at `bpm` when the tape runs at `rate`. */
export function stepDuration(bpm,rate=1){
  const b=Number.isFinite(bpm)?bpm:120,r=Number.isFinite(rate)?rate:1;
  return 60/Math.max(30,b)/4/clamp(r,.05,4);
}

/**
 * The beat the listener is hearing right now. The scheduler runs ahead of the audio clock: `step` is the next step to be
 * scheduled at `nextTime`, so the step sounding at `now` is step - (nextTime - now) / stepDuration. Four steps = one beat.
 * Returns {index (whole beats since the track started), phase (0..1 within the beat), bpm}.
 */
export function beatAt({step,nextTime,now,bpm,rate=1}){
  const dur=stepDuration(bpm,rate),heard=Math.max(0,step-Math.max(0,nextTime-now)/dur),beats=heard/4;
  return {index:Math.floor(beats),phase:beats-Math.floor(beats),bpm};
}

/** Global low-pass for a tape rate and health state: dull when slow, choked when nearly dead. */
export function musicCutoff(rate,{lowHealth=false,paused=false}={}){
  const slow=1-clamp((rate-MIN_RATE)/(1-MIN_RATE),0,1);
  let hz=16000*Math.pow(1100/16000,slow);
  if(lowHealth)hz*=.5;
  if(paused)hz=Math.min(hz,700);
  return Math.round(clamp(hz,260,18000));
}

/* ------------------------------------------------------------ scales and track generation */

export const SCALES={minor:[0,2,3,5,7,8,10],phrygian:[0,1,3,5,7,8,10],harmonicMinor:[0,2,3,5,7,8,11],dorian:[0,2,3,5,7,9,10]};

const PROGRESSIONS={
  floor:[[0,5,2,6],[0,6,5,6],[0,0,5,6],[0,2,5,4],[0,3,5,6],[0,5,6,4]],
  boss:[[0,1,0,6],[0,1,5,1],[0,6,1,0],[0,5,1,6]]
};
const KICKS={
  floor:[
    [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
    [1,0,0,0,1,0,0,0,1,0,0,1,1,0,0,0],
    [1,0,0,1,0,0,1,0,1,0,0,0,1,0,0,0]
  ],
  boss:[
    [1,0,0,1,1,0,0,0,1,0,0,1,1,0,1,0],
    [1,0,1,0,1,0,0,0,1,0,1,0,1,0,0,1]
  ]
};
const BASS_RHYTHMS=[
  [1,0,1,1,0,1,0,1,1,0,1,1,0,1,0,0],
  [1,0,0,1,0,1,0,0,1,0,0,1,0,1,1,0],
  [1,1,0,1,1,0,1,0,1,1,0,1,1,0,1,0],
  [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1,1]
];
const BASS_INTERVALS=[0,0,0,12,7,10,3,12];

/** Chord for a bar: root offset (semitones above the track root) and 3 chord-tone offsets (relative to that root). */
export function chordForBar(track,bar){
  const scale=SCALES[track.mode],deg=track.progression[((bar%track.progression.length)+track.progression.length)%track.progression.length];
  const at=d=>{const oct=Math.floor(d/7);return scale[((d%7)+7)%7]+12*oct;};
  const rootSemi=at(deg);
  return {deg,rootSemi,tones:[0,at(deg+2)-rootSemi,at(deg+4)-rootSemi]};
}

/**
 * Seeded pattern set for one theme. kind: 'floor' (per run/floor seed) or 'boss'.
 * rootMidi sits in G1..F#2 so the bass stays audible even when the tape slows.
 */
export function generateTrack(seed,kind='floor'){
  const rng=makeRng(seedFor(seed,kind)),boss=kind==='boss',set=boss?'boss':'floor';
  const rootMidi=31+Math.floor(rng()*12);
  const mode=boss?'phrygian':pick(rng,['minor','minor','phrygian','harmonicMinor','dorian']);
  const bpm=boss?138+Math.floor(rng()*10):104+Math.floor(rng()*24);
  const progression=pick(rng,PROGRESSIONS[set]);
  const kick=pick(rng,KICKS[set]).slice();
  const snare=Array(16).fill(0);snare[4]=1;snare[12]=1;if(boss&&rng()<.6)snare[15]=.6;
  const hat=Array.from({length:16},(_,i)=>i%2===0?(i%4===0?.7:1):(boss||rng()<.35?.45:0));
  const open=Array(16).fill(0);open[6]=rng()<.7?1:0;open[14]=rng()<.5?1:0;
  const rhythm=pick(rng,BASS_RHYTHMS);
  const bass=rhythm.map((on,i)=>on?{iv:i===0?0:pick(rng,BASS_INTERVALS),acc:i%4===0||rng()<.2}:null);
  const arpShape=pick(rng,['up','updown','skip','climb']);
  const arpGate=Array.from({length:16},(_,i)=>i%4===3?rng()<.55:rng()<.9);
  const arp=Array.from({length:16},(_,i)=>{
    if(arpShape==='up')return i%6;
    if(arpShape==='updown')return [0,1,2,3,4,5,4,3][i%8];
    if(arpShape==='skip')return [0,2,1,3,2,4,3,5][i%8];
    return Math.floor(i/3)%6;
  });
  const lead=Array(32).fill(null);
  const hits=boss?9:6;
  for(let n=0;n<hits;n++){
    const at=Math.floor(rng()*32);
    if(lead[at])continue;
    lead[at]={tone:Math.floor(rng()*3),oct:rng()<.3?1:0,len:1+Math.floor(rng()*3)};
  }
  lead[0]=lead[0]||{tone:0,oct:0,len:3};
  return {kind,seed,rootMidi,mode,bpm,progression,kick,snare,hat,open,bass,arp,arpGate,lead};
}

/* ------------------------------------------------------------ scenes and layers */

export const LAYER_NAMES=['pad','pulse','drums','bass','arp','lead','heart','riser'];
export const SCENES=['title','explore','combat','boss','extract','dead'];

/** Which layers a scene wants, given low-health and combat intensity (0..1). */
export function layersForScene(scene,{lowHealth=false,intensity=0}={}){
  const set=new Set();
  switch(scene){
    case'explore':set.add('pad');set.add('pulse');break;
    case'combat':['pad','drums','bass','arp'].forEach(l=>set.add(l));if(intensity>=.6)set.add('lead');break;
    case'boss':['pad','drums','bass','arp','lead'].forEach(l=>set.add(l));break;
    case'extract':['pad','drums','arp','lead','riser'].forEach(l=>set.add(l));break;
    case'dead':break;
    default:set.add('pad');
  }
  if(lowHealth&&scene!=='dead'){set.add('heart');set.delete('lead');}
  return set;
}

/**
 * Quantised layer machine. Layers ENTER on the next beat (step%4==0) so a drum fill never lands off-grid;
 * layers LEAVE at the next bar line (step%16==0) so a phrase is never cut mid-bar. immediate() snaps (death, stings).
 */
export function createLayerMachine(){
  let active=new Set(),target=new Set();
  return {
    request(set){target=new Set(set);},
    immediate(set){target=new Set(set);active=new Set(set);return active;},
    step(stepIndex){
      if(stepIndex%4===0)for(const l of target)active.add(l);
      if(stepIndex%16===0)for(const l of [...active])if(!target.has(l))active.delete(l);
      return active;
    },
    get active(){return active;},
    get target(){return target;}
  };
}

/** Combat hysteresis in REAL seconds: enters instantly when any enemy is aware, leaves `hold` seconds after the last one. */
export function createCombatTracker({hold=3.5}={}){
  let timer=0,intensity=0;
  return {
    update(dt,aware,boss=false){
      const n=Math.max(0,aware|0);
      if(n>0){timer=hold;intensity=Math.max(intensity*.98,clamp(n/4,0,1));}
      else{timer=Math.max(0,timer-Math.max(0,dt));if(timer===0)intensity=0;}
      return {combat:timer>0,boss:boss&&timer>0,intensity};
    },
    reset(){timer=0;intensity=0;}
  };
}

/** Choose the scene from game facts. Pure so it can be tested without a game. */
export function sceneFromGame({mode,combat,boss,extractionOpen}){
  if(mode==='dead')return 'dead';
  if(mode!=='play')return 'title';
  if(boss)return 'boss';
  if(extractionOpen&&!combat)return 'extract';
  return combat?'combat':'explore';
}

export function isLowHealth(health,maxHealth){
  if(!Number.isFinite(health)||!Number.isFinite(maxHealth)||maxHealth<=0)return false;
  return health>0&&(health<=1||health/maxHealth<=.34);
}

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
  return {delay:5+rng()*10,type:pick(rng,['thud','clank','pipe','whine','thud','clank'])};
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
