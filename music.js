// DEAD AIR adaptive score. Web Audio only, no sample files.
//
// THE SIGNATURE: the score follows world time like a tape machine. A lookahead scheduler (100 ms, run every
// 25 ms) lays notes on AudioContext time, and each step lasts stepDuration(bpm, rate) = 1/rate longer when the
// world slows. Every voice also hangs off one shared detune bus (a ConstantSource feeding osc.detune), so pitch
// drops with tempo, smoothly, and a global low-pass dulls the whole mix. Moving snaps the tape back up.
//
// Layers (pad / pulse / drums / bass / arp / lead / heart / riser) enter on beat boundaries and leave on bar lines,
// so the score stays musical while the game state changes under it. Pure logic lives in music-core.js.

import {getAudioRuntime,unlockAudio} from './audio.js';
import {LAYER_NAMES,SCALES,chordForBar,createCombatTracker,createLayerMachine,generateTrack,isLowHealth,layersForScene,makeRng,midiToHz,musicCutoff,musicRate,rateToCents,sceneFromGame,seedFor,stepDuration} from './music-core.js';

export const MUSIC_SETTINGS_KEY='dead-air.music.v1';
export const DEFAULT_MUSIC_VOLUME=.7;
const TAU_DOWN=.24,TAU_UP=.1; // tape glides down slowly, snaps back up
const tauFor=(from,to)=>to<from?TAU_DOWN:TAU_UP;

export function parseMusicSettings(serialized){
  const fallback={version:1,volume:DEFAULT_MUSIC_VOLUME};
  if(typeof serialized!=='string')return fallback;
  try{const saved=JSON.parse(serialized);if(saved?.version!==1||!Number.isFinite(saved.volume))return fallback;return {version:1,volume:Math.max(0,Math.min(1,saved.volume))};}
  catch{return fallback;}
}
export const serializeMusicSettings=volume=>JSON.stringify({version:1,volume:Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):DEFAULT_MUSIC_VOLUME});

/* ------------------------------------------------------------------ engine */

export class MusicEngine{
  /**
   * @param ctx AudioContext or OfflineAudioContext
   * @param destination node to connect to (the shared master gain)
   * @param opts {seed, lookahead, volume, manualClock}. manualClock: the caller drives tick(now) (offline renders/tests).
   */
  constructor(ctx,destination,{seed=1,lookahead=.1,volume=DEFAULT_MUSIC_VOLUME,manualClock=false}={}){
    this.ctx=ctx;this.manual=manualClock;this.lookahead=lookahead;this.baseLookahead=lookahead;this.skipped=0;this.now=ctx.currentTime;this.lastTick=this.now;
    this.rng=makeRng(seedFor(seed,'engine'));
    this.setSeed(seed);this.wantKind='floor';this.track=this.tracks.floor;
    this.machine=createLayerMachine();this.scene='title';this.lowHealth=false;this.critical=false;this.paused=false;this.hidden=false;this.dead=false;
    this.rate=1;this.schedRate=1;this.rateTarget=1;this.step=0;this.nextTime=this.now+.06;this.heartNext=this.now;this.log=null;
    this.lastCents=null;this.lastCutoff=null;this.lastDelay=null;
    this.volume=volume;
    this._build(destination);
    this.machine.request(layersForScene('title'));
  }

  _build(destination){
    const ctx=this.ctx;
    this.out=ctx.createGain();this.out.gain.value=this.volume*.9;this.out.connect(destination);
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-16;comp.knee.value=12;comp.ratio.value=4;comp.attack.value=.004;comp.release.value=.2;comp.connect(this.out);
    this.lp=ctx.createBiquadFilter();this.lp.type='lowpass';this.lp.frequency.value=16000;this.lp.Q.value=.6;this.lp.connect(comp);
    this.bus=ctx.createGain();this.bus.gain.value=1;this.bus.connect(this.lp);
    this.L={};
    for(const name of LAYER_NAMES){const g=ctx.createGain();g.gain.value=name==='heart'?0:1;g.connect(this.bus);this.L[name]=g;}
    // tempo-synced feedback echo for arp / lead
    this.delaySend=ctx.createGain();this.delaySend.gain.value=1;
    this.delay=ctx.createDelay(2);this.delay.delayTime.value=stepDuration(120,1)*3;
    const fb=ctx.createGain();fb.gain.value=.38;const dlp=ctx.createBiquadFilter();dlp.type='lowpass';dlp.frequency.value=2600;
    this.delaySend.connect(this.delay);this.delay.connect(dlp);dlp.connect(fb);fb.connect(this.delay);dlp.connect(this.bus);
    // shared tape bus: every voice's detune is driven from here
    this.detuneSrc=ctx.createConstantSource();this.detuneSrc.offset.value=0;this.detuneSrc.start();
    const n=ctx.sampleRate*2,buf=ctx.createBuffer(1,n,ctx.sampleRate),d=buf.getChannelData(0),r=makeRng(7);
    for(let i=0;i<n;i++)d[i]=r()*2-1;
    this.noiseBuf=buf;
  }

  /* -------------------------------------------------- control */
  _t(){return this.manual?this.now:this.ctx.currentTime;}
  setSeed(seed){this.seed=seed;this.tracks={floor:generateTrack(seed,'floor'),boss:generateTrack(seed,'boss')};}
  setTimeScale(ts){this.rateTarget=musicRate(ts);}
  setVolume(v){this.volume=v;this.out.gain.setTargetAtTime(v*.9,this._t(),.04);}
  setPaused(p){if(this.paused===!!p)return;this.paused=!!p;this.lastCutoff=null;}
  setHidden(h){
    this.hidden=!!h;this.bus.gain.cancelScheduledValues(this._t());
    this.bus.gain.setTargetAtTime(h?0:1,this._t(),.05);
  }
  setScene(scene,{lowHealth=false,critical=false,intensity=0}={}){
    if(this.dead&&scene!=='dead')this.resume();
    if(scene==='dead'){this.death();return;}
    const key=`${scene}|${lowHealth}|${critical}|${intensity>=.6}`;
    if(key===this._sceneKey)return;this._sceneKey=key;
    this.scene=scene;this.lowHealth=lowHealth;this.critical=critical;
    this.wantKind=scene==='boss'?'boss':'floor';
    this.machine.request(layersForScene(scene,{lowHealth,intensity}));
    this.lastCutoff=null;
  }

  /** Tape-stop: pitch and level collapse together, then silence. */
  death(){
    if(this.dead)return;this.dead=true;this._sceneKey=null;const n=this._t();
    this.detuneSrc.offset.cancelScheduledValues(n);this.detuneSrc.offset.setValueAtTime(this.lastCents??0,n);this.detuneSrc.offset.linearRampToValueAtTime(-4800,n+1.4);
    this.bus.gain.cancelScheduledValues(n);this.bus.gain.setValueAtTime(this.hidden?0:1,n);this.bus.gain.linearRampToValueAtTime(0,n+1.5);
    this.lp.frequency.cancelScheduledValues(n);this.lp.frequency.setTargetAtTime(160,n,.45);
    this._thud(n+.04,.55,.7);
    this.machine.immediate(new Set());this.lastCents=null;this.lastCutoff=null;
  }
  resume(){
    if(!this.dead)return;this.dead=false;const n=this._t();
    this.detuneSrc.offset.cancelScheduledValues(n);this.detuneSrc.offset.setValueAtTime(0,n);
    this.bus.gain.cancelScheduledValues(n);this.bus.gain.setValueAtTime(0,n);this.bus.gain.setTargetAtTime(this.hidden?0:1,n+.05,.25);
    this.lastCents=null;this.lastCutoff=null;this.nextTime=n+.12;this.schedRate=this.rate;this.step=0;this.heartNext=n;
  }

  /* -------------------------------------------------- scheduler */
  /** Advance the scheduler to `now` (seconds on the AudioContext clock). Cheap: only schedules what falls in the lookahead window. */
  tick(now=this.ctx.currentTime){
    const dt=Math.max(0,now-this.lastTick);this.lastTick=now;this.now=now;
    this.rate+=(this.rateTarget-this.rate)*(1-Math.exp(-dt/tauFor(this.rate,this.rateTarget)));
    this._continuous(now);
    if(this.dead)return;
    // Main-thread jank: widen the lookahead after a late tick, relax it back to the base 100 ms afterwards.
    if(dt>.12)this.lookahead=Math.min(.45,Math.max(this.lookahead,dt*1.3));else this.lookahead=Math.max(this.baseLookahead,this.lookahead-dt*.05);
    // Fell behind (stall, hidden tab): skip the steps whose time has passed, keeping the grid aligned, so nothing ever bursts out late.
    while(this.nextTime<now-.02){
      this.machine.step(this.step);
      const skip=stepDuration(this.track.bpm,this.schedRate);this.nextTime+=skip;this.step++;this.skipped++;
    }
    while(this.nextTime<now+this.lookahead){
      this._step(this.step,this.nextTime);
      const dur=stepDuration(this.track.bpm,this.schedRate); // rate follows the same glide the detune bus does, so tempo and pitch stay locked
      this.schedRate+=(this.rateTarget-this.schedRate)*(1-Math.exp(-dur/tauFor(this.schedRate,this.rateTarget)));
      this.nextTime+=dur;this.step++;
    }
    if(this.machine.active.has('heart')||this.machine.target.has('heart')){
      if(this.heartNext<now-.25)this.heartNext=now+.03;
      while(this.heartNext<now+this.lookahead){this._heart(this.heartNext);this.heartNext+=(this.critical?.62:.86)/Math.sqrt(this.rate);}
    }
  }

  _continuous(now){
    const cents=rateToCents(this.rateTarget);
    if(!this.dead&&(this.lastCents===null||Math.abs(cents-this.lastCents)>.5)){this.detuneSrc.offset.setTargetAtTime(cents,now,tauFor(this.rate,this.rateTarget));this.lastCents=cents;}
    const cutoff=musicCutoff(this.rateTarget,{lowHealth:this.lowHealth,paused:this.paused});
    if(!this.dead&&this.lastCutoff!==cutoff){this.lp.frequency.setTargetAtTime(cutoff,now,.14);this.lastCutoff=cutoff;}
    const echo=stepDuration(this.track.bpm,this.rateTarget)*3;
    if(this.lastDelay===null||Math.abs(echo-this.lastDelay)/echo>.01){this.delay.delayTime.setTargetAtTime(echo,now,.25);this.lastDelay=echo;}
    const heart=this.machine.target.has('heart')?1:0;
    if(this.heartGain!==heart){this.L.heart.gain.setTargetAtTime(heart,now,.3);this.heartGain=heart;}
  }

  _step(step,t){
    const s=step%16,bar=Math.floor(step/16);
    if(s===0&&this.track!==this.tracks[this.wantKind])this.track=this.tracks[this.wantKind];
    const track=this.track,active=this.machine.step(step),chord=chordForBar(track,bar),sd=stepDuration(track.bpm,this.schedRate);
    const root=track.rootMidi+chord.rootSemi;
    if(this.log)this.log.push({kind:'step',step,t,rate:this.schedRate,layers:[...active],kick:!!track.kick[s]});
    if(active.has('pad')&&s===0)this._pad(t,root,chord.tones,sd*16);
    if(active.has('pulse')){
      if(s===0&&bar%2===0){this._kick(t,.5,this.L.pulse);this._sub(t,root,sd*14);}
      if(s%4===2)this._hat(t,.35,.03,this.L.pulse);
    }
    if(active.has('drums')){
      if(track.kick[s])this._kick(t,.95,this.L.drums);
      if(track.snare[s])this._snare(t,.5*track.snare[s]);
      if(track.hat[s])this._hat(t,.16*track.hat[s],.04,this.L.drums);
      if(track.open[s])this._hat(t,.14,.2,this.L.drums);
    }
    const b=track.bass[s];
    if(active.has('bass')&&b)this._bass(t,root+b.iv,sd*.9,b.acc?.3:.22);
    if(active.has('arp')&&track.arpGate[s]){
      const idx=track.arp[s],tone=chord.tones[idx%3]+12*Math.floor(idx/3);
      this._arp(t,track.rootMidi+24+chord.rootSemi+tone,sd*.8,s%2?-.35:.35,this.scene==='extract'?12:0);
    }
    if(active.has('lead')){
      const h=track.lead[step%32];
      if(h)this._lead(t,track.rootMidi+36+chord.rootSemi+chord.tones[h.tone]+12*h.oct,sd*h.len*.95);
    }
    if(active.has('riser')&&s===0&&bar%2===0)this._riser(t,sd*32);
  }

  /* -------------------------------------------------- voices (all take a start time on the context clock) */
  _tape(node){try{this.detuneSrc.connect(node.detune);}catch{/* detune unsupported */}}
  _env(g,t,peak,att,dur){g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(Math.max(.0002,peak),t+att);g.gain.exponentialRampToValueAtTime(.0001,t+Math.max(att+.01,dur));}
  _osc(type,hz,t,dur,cents=0){
    const o=this.ctx.createOscillator();o.type=type;o.frequency.value=hz;o.detune.value=cents;this._tape(o);o.start(t);o.stop(t+dur+.05);return o;
  }
  _noise(t,dur){
    const s=this.ctx.createBufferSource();s.buffer=this.noiseBuf;this._tape(s);s.start(t,this.rng()*1.4,dur+.05);return s;
  }
  _filter(type,hz,q=.7){const f=this.ctx.createBiquadFilter();f.type=type;f.frequency.value=hz;f.Q.value=q;return f;}
  _pan(v,out){
    if(!this.ctx.createStereoPanner){return out;}
    const p=this.ctx.createStereoPanner();p.pan.value=v;p.connect(out);return p;
  }

  _pad(t,root,tones,dur){
    const env=this.ctx.createGain(),lp=this._filter('lowpass',650,.5),len=dur+.9;
    lp.frequency.setValueAtTime(380,t);lp.frequency.linearRampToValueAtTime(900,t+dur*.6);lp.frequency.linearRampToValueAtTime(420,t+len);
    env.gain.setValueAtTime(.0001,t);env.gain.linearRampToValueAtTime(.05,t+.7);env.gain.setValueAtTime(.05,t+dur*.8);env.gain.linearRampToValueAtTime(.0001,t+len);
    lp.connect(env);env.connect(this.L.pad);
    for(const tone of tones){
      const hz=midiToHz(root+24+tone);
      for(const c of [-9,9]){const o=this._osc('sawtooth',hz,t,len,c);o.connect(lp);}
    }
    const low=this._osc('sine',midiToHz(root+12),t,len);const lg=this.ctx.createGain();lg.gain.value=.5;low.connect(lg);lg.connect(lp);
  }
  _sub(t,root,dur){
    const env=this.ctx.createGain(),o=this._osc('sine',midiToHz(root+12),t,dur);this._env(env,t,.16,.02,dur);o.connect(env);env.connect(this.L.pulse);
  }
  _kick(t,v,out){
    const env=this.ctx.createGain(),o=this._osc('sine',150,t,.3);
    o.frequency.setValueAtTime(155,t);o.frequency.exponentialRampToValueAtTime(44,t+.11);
    this._env(env,t,v*.85,.002,.3);o.connect(env);env.connect(out);
    const cg=this.ctx.createGain(),n=this._noise(t,.02),hp=this._filter('highpass',1800);this._env(cg,t,v*.12,.001,.02);n.connect(hp);hp.connect(cg);cg.connect(out);
  }
  _snare(t,v){
    const env=this.ctx.createGain(),n=this._noise(t,.2),bp=this._filter('bandpass',1900,.7);
    this._env(env,t,v*.55,.002,.17);n.connect(bp);bp.connect(env);env.connect(this.L.drums);
    const te=this.ctx.createGain(),o=this._osc('triangle',190,t,.1);o.frequency.exponentialRampToValueAtTime(120,t+.09);this._env(te,t,v*.4,.002,.1);o.connect(te);te.connect(this.L.drums);
  }
  _hat(t,v,dur,out){
    const env=this.ctx.createGain(),n=this._noise(t,dur),hp=this._filter('highpass',7500,.6);
    this._env(env,t,v,.001,dur);n.connect(hp);hp.connect(env);env.connect(out);
  }
  _bass(t,midi,dur,v){
    const hz=midiToHz(midi),env=this.ctx.createGain(),lp=this._filter('lowpass',1500,5);
    if(this.log)this.log.push({kind:'bass',t,hz,rate:this.schedRate});
    lp.frequency.setValueAtTime(1500,t);lp.frequency.exponentialRampToValueAtTime(260,t+Math.max(.05,dur*.8));
    this._env(env,t,v,.004,dur);
    this._osc('sawtooth',hz,t,dur).connect(lp);this._osc('square',hz,t,dur,-6).connect(lp);
    const sub=this._osc('sine',hz,t,dur),sg=this.ctx.createGain();sg.gain.value=.9;sub.connect(sg);sg.connect(env);
    lp.connect(env);env.connect(this.L.bass);
  }
  _arp(t,midi,dur,pan,extra=0){
    const hz=midiToHz(midi+extra),env=this.ctx.createGain(),lp=this._filter('lowpass',3800,2);
    lp.frequency.setValueAtTime(3800,t);lp.frequency.exponentialRampToValueAtTime(700,t+dur);
    this._env(env,t,.075,.003,dur);
    this._osc('sawtooth',hz,t,dur,-5).connect(lp);this._osc('square',hz,t,dur,5).connect(lp);lp.connect(env);
    env.connect(this._pan(pan,this.L.arp));
    const send=this.ctx.createGain();send.gain.value=.4;env.connect(send);send.connect(this.delaySend);
  }
  _lead(t,midi,dur){
    const hz=midiToHz(midi),env=this.ctx.createGain(),lp=this._filter('lowpass',2800,3);
    lp.frequency.setValueAtTime(2800,t);lp.frequency.exponentialRampToValueAtTime(900,t+dur);
    this._env(env,t,.08,.006,dur);
    for(const c of [-12,0,12])this._osc('sawtooth',hz,t,dur,c).connect(lp);
    lp.connect(env);env.connect(this.L.lead);
    const send=this.ctx.createGain();send.gain.value=.55;env.connect(send);send.connect(this.delaySend);
  }
  _riser(t,dur){
    const env=this.ctx.createGain(),n=this._noise(t,Math.min(1.9,dur)),bp=this._filter('bandpass',300,2);
    bp.frequency.setValueAtTime(300,t);bp.frequency.exponentialRampToValueAtTime(7000,t+dur);
    env.gain.setValueAtTime(.0001,t);env.gain.linearRampToValueAtTime(.09,t+dur*.95);env.gain.linearRampToValueAtTime(.0001,t+dur);
    n.connect(bp);bp.connect(env);env.connect(this.L.riser);
  }
  _heart(t){
    const env=this.ctx.createGain(),env2=this.ctx.createGain();
    const a=this._osc('sine',64,t,.16),b=this._osc('sine',54,t+.17,.18);
    a.frequency.exponentialRampToValueAtTime(34,t+.14);b.frequency.exponentialRampToValueAtTime(30,t+.32);
    this._env(env,t,.55,.006,.16);this._env(env2,t+.17,.38,.006,.18);
    a.connect(env);b.connect(env2);env.connect(this.L.heart);env2.connect(this.L.heart);
  }
  _thud(t,dur,v){
    const env=this.ctx.createGain(),o=this.ctx.createOscillator();o.frequency.setValueAtTime(80,t);o.frequency.exponentialRampToValueAtTime(26,t+dur);
    this._env(env,t,v,.01,dur);o.connect(env);env.connect(this.out);o.start(t);o.stop(t+dur+.05);
  }

  /** One-shot musical stings. 'clear' resolves a fight, 'extract' opens the exit, 'win' ends the run. */
  sting(kind){
    const t=Math.max(this._t(),this.now)+.03,track=this.track,scale=SCALES[track.mode],root=track.rootMidi+36;
    const out=this.L.arp;
    if(kind==='clear'){
      [0,scale[2],7,12,scale[2]+12,19].forEach((iv,i)=>this._stingNote(t+i*.075,root+iv,.5,.11,'triangle',out));
      this._stingNote(t,track.rootMidi+12,1.2,.2,'sine',this.L.bass);
    }else if(kind==='extract'){
      [0,7,12,19,24].forEach((iv,i)=>this._stingNote(t+i*.09,root+iv,.7,.1,'sawtooth',out));
      this._riser(t,.9);
    }else if(kind==='win'){
      [0,4,7,12,16,19,24].forEach((iv,i)=>this._stingNote(t+i*.11,root+iv,1.2,.1,'sawtooth',out));
      this._stingNote(t,track.rootMidi+12,2.2,.22,'sine',this.L.bass);
    }
  }
  _stingNote(t,midi,dur,v,type,out){
    const hz=midiToHz(midi),env=this.ctx.createGain(),lp=this._filter('lowpass',4200,1);
    this._env(env,t,v,.005,dur);this._osc(type,hz,t,dur,-4).connect(lp);this._osc(type,hz,t,dur,4).connect(lp);lp.connect(env);env.connect(out);
    const send=this.ctx.createGain();send.gain.value=.5;env.connect(send);send.connect(this.delaySend);
  }
}

/* ------------------------------------------------------------------ live wiring */

let engine=null,timer=null,settingsStorage=null,musicVolume=DEFAULT_MUSIC_VOLUME,desired={seed:1,timeScale:1,scene:'title',opts:{},paused:false};
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

export const resetMusicStats=()=>{Object.assign(stats,{ticks:0,totalMs:0,maxMs:0,last:0,maxGapMs:0,lastAt:0,gaps250:0});if(engine)engine.skipped=0;};
export const getMusicEngine=()=>engine;
export const getMusicStats=()=>({...stats,avgMs:stats.ticks?stats.totalMs/stats.ticks:0,resyncs:engine?.skipped??0,lookahead:engine?.lookahead,scene:engine?.scene,step:engine?.step,rate:engine?.rate});

/** Create the engine on the shared audio context. Needs a user gesture first (call after unlockAudio). Idempotent. */
export function startMusic(){
  if(engine)return engine;
  const rt=getAudioRuntime(true);if(!rt)return null;
  try{
    engine=new MusicEngine(rt.context,rt.master,{seed:desired.seed,volume:musicVolume});
    engine.setTimeScale(desired.timeScale);engine.setPaused(desired.paused);engine.setScene(desired.scene,desired.opts);
    timer=setInterval(()=>{
      const a=performance.now();
      if(stats.lastAt){const gap=a-stats.lastAt;if(gap>stats.maxGapMs)stats.maxGapMs=gap;if(gap>250)stats.gaps250++;}stats.lastAt=a;
      try{engine.tick();}catch{/* music must never break the game */}
      const ms=performance.now()-a;stats.ticks++;stats.totalMs+=ms;stats.last=ms;if(ms>stats.maxMs)stats.maxMs=ms;
    },25);
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>engine?.setHidden(document.hidden));
    if(typeof window!=='undefined'&&/[?&]debug\b/.test(location.search))window.__music={engine,stats:getMusicStats,reset:resetMusicStats};
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

export function setMusicSeed(seed){desired.seed=seed;engine?.setSeed(seed);}
export function setMusicTimeScale(scale){desired.timeScale=scale;engine?.setTimeScale(scale);}
export function setMusicScene(scene,opts={}){desired.scene=scene;desired.opts=opts;engine?.setScene(scene,opts);}
export function setMusicPaused(p){desired.paused=!!p;engine?.setPaused(p);}
export function musicSting(kind){engine?.sting(kind);}

const combatTracker=createCombatTracker();
const watch={seed:null,cleared:0,extraction:false,mode:'title',wasCombat:false};

/**
 * One call per frame from the game loop: derives the scene (title / explore / combat / boss / extract / dead),
 * low-health, pause, room-clear and extraction stings from the plain game state.
 */
export function musicSyncGame(state,dt=1/60){
  if(!state)return;
  const mode=state.mode;
  if(state.seed!==watch.seed){watch.seed=state.seed;setMusicSeed(state.seed);}
  let aware=0,boss=false;
  if(mode==='play'&&state.player){
    for(const e of state.enemies||[]){
      if(!e.alive||!e.aware)continue;
      const near=e.roomIndex===state.currentRoom||Math.hypot(e.x-state.player.x,e.y-state.player.y)<560;
      if(!near)continue;
      aware++;if(e.elite&&e.roomIndex===state.currentRoom)boss=true;
    }
  }
  const fight=combatTracker.update(dt,aware,boss);
  if(mode!=='play')combatTracker.reset();
  if(mode==='play'){
    if(state.roomsCleared<watch.cleared)watch.cleared=state.roomsCleared;
    if(state.roomsCleared>watch.cleared&&watch.wasCombat){musicSting('clear');combatTracker.reset();}
    watch.cleared=state.roomsCleared;
    if(state.extractionOpen&&!watch.extraction)musicSting('extract');
    watch.extraction=!!state.extractionOpen;
  }else{watch.extraction=false;watch.cleared=state.roomsCleared||0;}
  if(mode==='won'&&watch.mode!=='won')musicSting('win');
  watch.mode=mode;watch.wasCombat=fight.combat;
  const paused=!!(state.paused||state.merchantOpen||state.cacheOpen||state.pendingGunPickup||state.loadoutOpen);
  const scene=sceneFromGame({mode,combat:fight.combat&&!paused,boss:fight.boss,extractionOpen:state.extractionOpen});
  setMusicPaused(paused&&mode==='play');
  setMusicScene(scene,{lowHealth:mode==='play'&&isLowHealth(state.health,state.maxHealth),critical:state.health<=1,intensity:fight.intensity});
}
