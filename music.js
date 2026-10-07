// DEAD AIR adaptive score: real electronic tracks (see CREDITS.md), chosen by game state.
//
//   title / explore / tension / combat / boss / win  - one looping track each, assets/music/*.mp3, lazy-loaded after
//   the first user gesture. Every loop is a whole number of bars starting on a downbeat, so the position in the buffer
//   IS the musical beat. State changes crossfade on the playing track's next bar line (next beat if a bar is far off
//   in slow motion). death is a tape-stop into a breath of static. Room-clear / exit-open get short key-neutral stings.
//
// THE SIGNATURE: the score follows world time like a tape machine. AudioBufferSourceNode.playbackRate follows a smoothed
// function of the time scale (about 0.46..1: tempo and pitch together) behind a low-pass; moving snaps it back up.
// getMusicBeat() integrates the playing buffer's position with that same rate, so boss phase III stays on the beat.
//
// Pure logic (state machine, boundaries, beat maths, mix levels) lives in music-core.js and is unit tested.

import {getAudioRuntime,unlockAudio} from './audio.js';
import {BEATS_PER_BAR,LOAD_ORDER,TRACKS,advancePosition,beatFromPosition,createSceneMachine,crossfadeSeconds,isLowHealth,musicCutoff,musicLevel,musicRate,nextBoundary,rateToCents,resolveTrack,SCENE_RANK,stateFromGame,stepRate} from './music-core.js';

export const MUSIC_SETTINGS_KEY='dead-air.music.v1';
export const DEFAULT_MUSIC_VOLUME=.55;
const TICK_MS=25,RAMP=.03,FIRST_FADE=1.6;

export function parseMusicSettings(serialized){
  const fallback={version:1,volume:DEFAULT_MUSIC_VOLUME};
  if(typeof serialized!=='string')return fallback;
  try{const saved=JSON.parse(serialized);if(saved?.version!==1||!Number.isFinite(saved.volume))return fallback;return {version:1,volume:Math.max(0,Math.min(1,saved.volume))};}
  catch{return fallback;}
}
export const serializeMusicSettings=volume=>JSON.stringify({version:1,volume:Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):DEFAULT_MUSIC_VOLUME});

const fadeIn=n=>Float32Array.from({length:n},(_,i)=>Math.sin(i/(n-1)*Math.PI/2));
const fadeOut=n=>Float32Array.from({length:n},(_,i)=>Math.cos(i/(n-1)*Math.PI/2));
const CURVE_IN=fadeIn(48),CURVE_OUT=fadeOut(48);

/* ------------------------------------------------------------------ engine */

export class MusicEngine{
  /** @param ctx AudioContext, @param destination the shared master gain, @param opts {volume, manualClock} */
  constructor(ctx,destination,{volume=DEFAULT_MUSIC_VOLUME,manualClock=false}={}){
    this.ctx=ctx;this.manual=manualClock;this.now=ctx.currentTime;this.lastTick=this.now;
    this.buffers=new Map();this.loaded=new Set();this.failed=new Set();this.voices=[];this.history=[];
    this.want='title';this.winDone=false;this.pending=null;
    this.lookahead=.12;this.timeScale=1;this.rate=1;this.rateTarget=1;this.paused=false;this.hidden=false;this.dead=false;this.lowHealth=false;
    this.lastCents=null;this.lastCutoff=null;this.volume=volume;this.duck=1;this.state='title';
    this._build(destination);
  }

  _build(destination){
    const ctx=this.ctx;
    this.out=ctx.createGain();this.out.gain.value=musicLevel(this.volume);this.out.connect(destination);
    this.lp=ctx.createBiquadFilter();this.lp.type='lowpass';this.lp.frequency.value=18000;this.lp.Q.value=.5;this.lp.connect(this.out);
    this.bus=ctx.createGain();this.bus.gain.value=1;this.bus.connect(this.lp);
    this.duckGain=ctx.createGain();this.duckGain.gain.value=1;this.duckGain.connect(this.bus);
    this.stingBus=ctx.createGain();this.stingBus.gain.value=musicLevel(this.volume)*1.8;this.stingBus.connect(destination);
    // shared tape bus: the ambience layer hangs its own oscillators / noise off this so everything sags together
    this.detuneSrc=ctx.createConstantSource();this.detuneSrc.offset.value=0;this.detuneSrc.start();
    const n=ctx.sampleRate*2,buf=ctx.createBuffer(1,n,ctx.sampleRate),d=buf.getChannelData(0);
    let seed=7;for(let i=0;i<n;i++){seed=(seed*1664525+1013904223)>>>0;d[i]=seed/2147483648-1;}
    this.noiseBuf=buf;
  }

  _t(){return this.manual?this.now:this.ctx.currentTime;}
  _log(type,extra={}){this.history.push({type,at:this._t(),...extra});if(this.history.length>80)this.history.shift();}

  /* -------------------------------------------------- loading */

  /** Fetch and decode every track in LOAD_ORDER, one at a time, so a slow or missing file never blocks the rest. */
  async load(baseUrl){
    for(const name of LOAD_ORDER){
      if(this.buffers.has(name))continue;
      try{
        const res=await fetch(new URL(`./assets/music/${TRACKS[name].file}`,baseUrl));
        if(!res.ok)throw new Error(String(res.status));
        const buf=await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.setBuffer(name,buf);
      }catch(err){this.failed.add(name);this._log('load-failed',{name,error:String(err?.message||err)});}
    }
  }
  setBuffer(name,buf){this.buffers.set(name,buf);this.loaded.add(name);this._log('loaded',{name});this._reconcile();}

  /* -------------------------------------------------- control */

  setVolume(v){this.volume=v;this._applyLevel();}
  setPaused(p){if(this.paused===!!p)return;this.paused=!!p;this.lastCutoff=null;this._applyLevel();}
  setHidden(h){this.hidden=!!h;this.bus.gain.cancelScheduledValues(this._t());this.bus.gain.setTargetAtTime(h?0:1,this._t(),.05);}
  setTimeScale(ts){this.timeScale=ts;this.rateTarget=this.paused?1:musicRate(ts);}
  setLowHealth(v){if(this.lowHealth!==!!v){this.lowHealth=!!v;this.lastCutoff=null;}}
  _applyLevel(){this.out.gain.setTargetAtTime(musicLevel(this.volume,{paused:this.paused}),this._t(),.08);this.stingBus.gain.setTargetAtTime(musicLevel(this.volume)*1.8,this._t(),.08);this.rateTarget=this.paused?1:musicRate(this.timeScale);}

  /** The state the game wants: title / explore / tension / combat / boss / win / dead. */
  setState(state){
    if(state===this.state&&!(this.dead&&state!=='dead'))return;
    const prev=this.state;this.state=state;
    if(state==='dead'){this.death();return;}
    if(this.dead)this._resume();
    if(state!==prev&&prev==='win')this.winDone=false;
    this.want=state;this._log('state',{from:prev,to:state});this._reconcile();
  }

  get primary(){for(let i=this.voices.length-1;i>=0;i--)if(!this.voices[i].fadingOut)return this.voices[i];return null;}

  _target(){return resolveTrack(this.want==='win'&&this.winDone?TRACKS.win.next:this.want,this.loaded);}

  /** Decide whether the playing track must change; if so queue a bar-aligned crossfade (or start straight away when silent). */
  _reconcile(){
    if(this.dead)return;
    const target=this._target(),cur=this.primary;
    if(!target){this.pending=null;return;}
    if(cur&&cur.name===target){this.pending=null;return;}
    if(!cur){this.pending=null;this._startVoice(target,this._t()+.05,FIRST_FADE);return;}
    if(!this.pending||this.pending.name!==target)this.pending={name:target,since:this._t()};
  }

  _startVoice(name,t,xf){
    const track=TRACKS[name],buf=this.buffers.get(name);if(!buf)return null;
    const src=this.ctx.createBufferSource();src.buffer=buf;src.loop=!!track.loop;src.playbackRate.value=this.rate;
    const g=this.ctx.createGain();g.gain.setValueAtTime(0,t);
    try{g.gain.setValueCurveAtTime(CURVE_IN.map(v=>v*track.gain),t,xf);}catch{g.gain.linearRampToValueAtTime(track.gain,t+xf);}
    src.connect(g);g.connect(this.duckGain);src.start(t);
    const voice={name,track,src,gain:g,t0:t,pos:0,loops:0,rateApplied:this.rate,fadingOut:false,endAt:Infinity,ended:false,duration:buf.duration};
    this.voices.push(voice);this._log('start',{name,when:t,xf});
    return voice;
  }

  _fadeOutVoice(v,t,xf){
    v.fadingOut=true;v.endAt=t+xf+.06;
    v.gain.gain.cancelScheduledValues(t);
    try{v.gain.gain.setValueCurveAtTime(CURVE_OUT.map(x=>x*v.track.gain),t,xf);}catch{v.gain.gain.linearRampToValueAtTime(0,t+xf);}
    try{v.src.stop(v.endAt);}catch{/* already stopped */}
  }

  /* -------------------------------------------------- death: tape stop, then static */
  death(){
    if(this.dead)return;this.dead=true;this.pending=null;const n=this._t();
    for(const v of this.voices){
      v.fadingOut=true;v.endAt=n+1.7;
      v.src.playbackRate.cancelScheduledValues(n);v.src.playbackRate.setValueAtTime(Math.max(.1,v.rateApplied),n);v.src.playbackRate.exponentialRampToValueAtTime(.06,n+1.25);
      v.gain.gain.cancelScheduledValues(n);v.gain.gain.setValueAtTime(v.track.gain,n);v.gain.gain.linearRampToValueAtTime(0,n+1.3);
      try{v.src.stop(n+1.7);}catch{/* ok */}
    }
    this.lp.frequency.cancelScheduledValues(n);this.lp.frequency.setTargetAtTime(180,n,.4);
    this.detuneSrc.offset.cancelScheduledValues(n);this.detuneSrc.offset.setTargetAtTime(-2400,n,.5);
    this._static(n+1.0);
    this.lastCents=null;this.lastCutoff=null;this._log('death');
  }
  _static(t){
    const src=this.ctx.createBufferSource();src.buffer=this.noiseBuf;src.loop=true;
    const bp=this.ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=2800;bp.Q.value=.6;
    const g=this.ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.22,t+.15);g.gain.exponentialRampToValueAtTime(.0005,t+2.6);
    src.connect(bp);bp.connect(g);g.connect(this.stingBus);src.start(t,0);src.stop(t+2.8);
  }
  _resume(){
    this.dead=false;const n=this._t();
    this.detuneSrc.offset.cancelScheduledValues(n);this.detuneSrc.offset.setValueAtTime(0,n);
    this.lp.frequency.cancelScheduledValues(n);this.lp.frequency.setValueAtTime(18000,n);
    this.voices=this.voices.filter(v=>!v.fadingOut||v.endAt>n);
    this.rate=this.rateTarget;this.lastCents=null;this.lastCutoff=null;this._log('resume');
  }

  /* -------------------------------------------------- scheduler */
  /** Advance to `now` (AudioContext seconds): glide the tape rate, integrate positions, fire pending crossfades. */
  tick(now=this.ctx.currentTime){
    const dt=Math.min(1,Math.max(0,now-this.lastTick));this.lastTick=now;this.now=now;
    // main-thread jank (software rendering, GC): look further ahead so a bar line is never missed, relax back afterwards
    this.lookahead=Math.min(.6,Math.max(.12,dt*1.6+.05));
    if(!this.dead){
      const before=this.rate;this.rate=stepRate(this.rate,this.rateTarget,dt);
      const mean=(before+this.rate)/2;
      for(const v of this.voices){
        if(v.ended||now<=v.t0)continue;
        const live=Math.min(dt,now-v.t0),adv=advancePosition(v,live,mean,v.duration,!!v.track.loop);
        v.pos=adv.pos;v.loops=adv.loops;
        if(adv.ended&&!v.fadingOut)this._voiceFinished(v);
        v.src.playbackRate.cancelScheduledValues(now);v.src.playbackRate.setValueAtTime(v.rateApplied,now);v.src.playbackRate.linearRampToValueAtTime(this.rate,now+RAMP);v.rateApplied=this.rate;
      }
      this._continuous(now);
      this._runPending(now);
    }
    this.voices=this.voices.filter(v=>{if(v.endAt<=now||v.ended){try{v.gain.disconnect();}catch{/* ok */}return false;}return true;});
  }

  _voiceFinished(v){
    v.ended=true;this._log('ended',{name:v.name});
    if(v.track.next&&this.want==='win'){this.winDone=true;}
    this._reconcile();
  }

  _continuous(now){
    const cents=rateToCents(this.rate);
    if(this.lastCents===null||Math.abs(cents-this.lastCents)>.5){this.detuneSrc.offset.setTargetAtTime(cents,now,.05);this.lastCents=cents;}
    const cutoff=musicCutoff(this.rate,{lowHealth:this.lowHealth,paused:this.paused});
    if(this.lastCutoff!==cutoff){this.lp.frequency.setTargetAtTime(cutoff,now,.14);this.lastCutoff=cutoff;}
  }

  _runPending(now){
    const p=this.pending,cur=this.primary;
    if(!p)return;
    if(!cur){this.pending=null;this._reconcile();return;}
    // escalations (to combat / boss) must not lag: a bar line more than 2.4 s away falls back to the next beat; calm-downs may wait up to 5 s
    const up=(SCENE_RANK[p.name]??0)>(SCENE_RANK[cur.name]??0),maxWait=p.name==='win'?1:up?2.4:5;
    const nb=nextBoundary({pos:cur.pos,bpm:cur.track.bpm,rate:this.rate,maxWait});
    if(nb.wait>this.lookahead)return;               // schedule once the boundary falls inside the lookahead window
    const t=now+nb.wait,next=TRACKS[p.name],xf=crossfadeSeconds(next.bpm,this.rate);
    this.pending=null;
    const v=this._startVoice(p.name,t,xf);if(!v)return;
    this._fadeOutVoice(cur,t,xf);
    this._log('transition',{from:cur.name,to:p.name,when:t,kind:nb.kind,posBefore:cur.pos,rate:this.rate,xf,barPos:((cur.pos+nb.wait*this.rate)/(60/cur.track.bpm))%BEATS_PER_BAR});
  }

  /** The beat audible now: {index, phase, bpm, bar, beatInBar} from the newest started voice; null when silent. */
  beat(){
    if(this.dead||this.paused)return null;
    let v=null;for(let i=this.voices.length-1;i>=0;i--){const c=this.voices[i];if(!c.fadingOut&&this.now>c.t0){v=c;break;}}
    return v?beatFromPosition(v,v.track):null;
  }

  snapshot(){
    return {state:this.state,want:this.want,primary:this.primary?.name||null,pending:this.pending?.name||null,rate:this.rate,rateTarget:this.rateTarget,
      dead:this.dead,paused:this.paused,loaded:[...this.loaded],failed:[...this.failed],voices:this.voices.map(v=>({name:v.name,pos:v.pos,loops:v.loops,fadingOut:v.fadingOut,playbackRate:v.src.playbackRate.value}))};
  }

  /* -------------------------------------------------- stings (key-neutral: percussion, noise and pure fifths only) */

  /** One-shot musical stings. 'clear' resolves a fight, 'extract' opens the exit, 'win' ends a boss. Land on the next beat. */
  sting(kind){
    if(this.dead||this.hidden)return;
    const cur=this.primary;let t=this._t()+.03;
    if(cur&&this.now>cur.t0){const nb=nextBoundary({pos:cur.pos,bpm:cur.track.bpm,rate:this.rate,maxWait:.0});t=this._t()+Math.min(.5,Math.max(.03,nb.wait));}
    const big=kind==='win',high=kind==='extract';
    // music dips under the sting, then swells back
    this.duckGain.gain.cancelScheduledValues(t-.05);this.duckGain.gain.setTargetAtTime(.45,t-.05,.05);this.duckGain.gain.setTargetAtTime(1,t+.5,.5);
    this._thump(t,big?.5:.34);
    this._rise(t-.28,.3,big?.14:.1);
    const base=high?1174.66:880,notes=big?[1,1.5,2,3]:[1,1.5,2];
    notes.forEach((m,i)=>this._bell(t+.02+i*.06,base*m,big?2.2:1.5,(big?.07:.055)/(1+i*.35)));
    this._log('sting',{kind,when:t});
  }
  _thump(t,v){
    const g=this.ctx.createGain(),o=this.ctx.createOscillator();o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(42,t+.3);
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(v,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+.45);
    o.connect(g);g.connect(this.stingBus);o.start(t);o.stop(t+.5);
  }
  _rise(t,dur,v){
    const src=this.ctx.createBufferSource();src.buffer=this.noiseBuf;
    const bp=this.ctx.createBiquadFilter();bp.type='bandpass';bp.Q.value=1.4;bp.frequency.setValueAtTime(500,t);bp.frequency.exponentialRampToValueAtTime(6500,t+dur);
    const g=this.ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(v,t+dur);g.gain.linearRampToValueAtTime(.0001,t+dur+.06);
    src.connect(bp);bp.connect(g);g.connect(this.stingBus);src.start(t,0);src.stop(t+dur+.1);
  }
  _bell(t,hz,dur,v){
    const g=this.ctx.createGain(),lp=this.ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=5200;
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(v,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    for(const [mult,vol] of [[1,1],[2.01,.3]]){const o=this.ctx.createOscillator(),og=this.ctx.createGain();o.type='sine';o.frequency.value=hz*mult;og.gain.value=vol;o.connect(og);og.connect(lp);o.start(t);o.stop(t+dur+.05);}
    lp.connect(g);g.connect(this.stingBus);
  }
}

/* ------------------------------------------------------------------ live wiring */

let engine=null,timer=null,settingsStorage=null,musicVolume=DEFAULT_MUSIC_VOLUME,desired={timeScale:1,state:'title',paused:false,lowHealth:false};
const stats={ticks:0,totalMs:0,maxMs:0,last:0,maxGapMs:0,lastAt:0,gaps250:0};

export function loadMusicSettings(storage){
  settingsStorage=storage;
  try{musicVolume=parseMusicSettings(storage.getItem(MUSIC_SETTINGS_KEY)).volume;}catch{musicVolume=DEFAULT_MUSIC_VOLUME;}
  engine?.setVolume(musicVolume);return musicVolume;
}
export const getMusicVolume=()=>musicVolume;
export function setMasterMusicVolume(v){return setMusicVolume(v);}
export function setMusicVolume(v){
  musicVolume=Number.isFinite(v)?Math.max(0,Math.min(1,v)):DEFAULT_MUSIC_VOLUME;engine?.setVolume(musicVolume);
  try{settingsStorage?.setItem(MUSIC_SETTINGS_KEY,serializeMusicSettings(musicVolume));return true;}catch{return false;}
}

export const resetMusicStats=()=>{Object.assign(stats,{ticks:0,totalMs:0,maxMs:0,last:0,maxGapMs:0,lastAt:0,gaps250:0});};
export const getMusicEngine=()=>engine;
export const getMusicStats=()=>({...stats,avgMs:stats.ticks?stats.totalMs/stats.ticks:0,state:engine?.state,rate:engine?.rate});

/** Create the engine on the shared audio context and start loading tracks. Needs a user gesture first. Idempotent. */
export function startMusic(){
  if(engine)return engine;
  const rt=getAudioRuntime(true);if(!rt)return null;
  try{
    engine=new MusicEngine(rt.context,rt.master,{volume:musicVolume});
    engine.setTimeScale(desired.timeScale);engine.setPaused(desired.paused);engine.setLowHealth(desired.lowHealth);engine.setState(desired.state);
    timer=setInterval(()=>{
      const a=performance.now();
      if(stats.lastAt){const gap=a-stats.lastAt;if(gap>stats.maxGapMs)stats.maxGapMs=gap;if(gap>250)stats.gaps250++;}stats.lastAt=a;
      try{engine.tick();}catch{/* music must never break the game */}
      const ms=performance.now()-a;stats.ticks++;stats.totalMs+=ms;stats.last=ms;if(ms>stats.maxMs)stats.maxMs=ms;
    },TICK_MS);
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>engine?.setHidden(document.hidden));
    if(typeof window!=='undefined'&&/[?&]debug\b/.test(location.search))window.__music={engine,stats:getMusicStats,reset:resetMusicStats,beat:()=>getMusicBeat(),rt};
    engine.load(import.meta.url).catch(()=>{});   // lazy: after the gesture, one file at a time, never blocks startup
  }catch{engine=null;}
  return engine;
}

/** First user gesture anywhere: unlock the context and start the score + ambience. */
let armed=false;
export function armMusicOnGesture(onStart){
  if(typeof window==='undefined'||armed||engine)return;
  armed=true;
  const go=()=>{
    for(const name of ['pointerdown','keydown','touchstart'])window.removeEventListener(name,go,true);
    unlockAudio().then(ok=>{if(ok){startMusic();onStart?.();}}).catch(()=>{});
  };
  for(const name of ['pointerdown','keydown','touchstart'])window.addEventListener(name,go,{capture:true});
}

export function setMusicSeed(){/* the score is authored, not generated: nothing to seed */}
export function setMusicTimeScale(scale){desired.timeScale=scale;engine?.setTimeScale(scale);}
export function setMusicState(state){desired.state=state;engine?.setState(state);}
export function setMusicPaused(p){desired.paused=!!p;engine?.setPaused(p);engine?.setTimeScale(desired.timeScale);}
export function musicSting(kind){engine?.sting(kind);}
/** The beat currently audible ({index, phase, bpm, bar, beatInBar}) or null when music is not running. Boss phase III locks its pattern to this. */
export function getMusicBeat(){return engine?engine.beat():null;}

const scenes=createSceneMachine();
const watch={cleared:0,extraction:false,mode:'title',shots:0,wasFight:false,lastState:'title'};
const ENGAGE_RANGE=520,SUSPICION_RANGE=700,SUSPICION_MIN=.2;

/**
 * One call per frame from the game loop. Derives the music state (title / explore / tension / combat / boss / win /
 * dead) from the plain game state, with debounce, and fires the room-clear / exit-open stings.
 */
export function musicSyncGame(state,dt=1/60){
  if(!state)return;
  const mode=state.mode;
  let engaged=false,aware=false,suspicious=false,boss=false,sight=false;
  if(mode==='play'&&state.player){
    for(const e of state.enemies||[]){
      if(!e.alive)continue;
      const d=Math.hypot(e.x-state.player.x,e.y-state.player.y),inRoom=e.roomIndex===state.currentRoom;
      if(e.aware&&(inRoom||d<ENGAGE_RANGE)){engaged=true;if(e.los||e.type==='boss')sight=true;if(e.type==='boss'&&inRoom)boss=true;}
      else if(e.aware&&d<1100)aware=true;
      else if((e.suspicion||0)>=SUSPICION_MIN&&d<SUSPICION_RANGE)suspicious=true;
    }
  }
  const shots=state.shotsFired||0,shot=shots>watch.shots;watch.shots=shots;
  const paused=!!(state.paused||state.supplyOpen||state.loadoutOpen);
  if(mode==='play'){
    if(state.roomsCleared<watch.cleared)watch.cleared=state.roomsCleared;
    if(state.roomsCleared>watch.cleared&&watch.wasFight){musicSting('clear');scenes.reset();}
    watch.cleared=state.roomsCleared;
    if(state.extractionOpen&&!watch.extraction)musicSting('extract');
    watch.extraction=!!state.extractionOpen;
  }else{watch.extraction=false;watch.cleared=state.roomsCleared||0;scenes.reset();}
  const scene=mode==='play'?scenes.update(paused?0:dt,{engaged,aware,suspicious,shot,boss,sight}):scenes.scene;
  watch.wasFight=scene==='combat'||scene==='boss';
  watch.mode=mode;
  if(mode!=='play')setMusicTimeScale(1);          // menus, death and win screens: the tape runs at normal speed
  const next=stateFromGame({mode,scene});
  setMusicPaused(paused&&mode==='play');
  const low=mode==='play'&&isLowHealth(state.health,state.maxHealth);
  desired.lowHealth=low;engine?.setLowHealth(low);
  if(next!==watch.lastState||engine?.state!==next){watch.lastState=next;setMusicState(next);}
}
