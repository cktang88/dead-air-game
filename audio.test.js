import test from 'node:test';
import assert from 'node:assert/strict';
import {distanceGain, gunProfile, hashUnit, jitter, panFromOffset, spatialParams, timeScaleColor, AUDIO_SETTINGS_KEY, DEFAULT_MASTER_VOLUME, isAudioMuted, loadAudioSettings, parseAudioSettings, serializeAudioSettings, setAudioMuted, setMasterVolume, unlockAudio} from './audio.js';

test('audio settings round-trip the master volume',()=>{
  const encoded=serializeAudioSettings(.42);
  assert.equal(AUDIO_SETTINGS_KEY,'dead-air.audio.v1');
  assert.deepEqual(parseAudioSettings(encoded),{version:1,volume:.42,muted:false});
});

test('mute preference round-trips and older version-1 settings default to unmuted',()=>{
  assert.deepEqual(parseAudioSettings(serializeAudioSettings(.42,true)),{version:1,volume:.42,muted:true});
  assert.deepEqual(parseAudioSettings('{"version":1,"volume":0.42}'),{version:1,volume:.42,muted:false});
});

test('audio settings default safely for missing, malformed, or unsupported saves',()=>{
  assert.equal(parseAudioSettings(null).volume,DEFAULT_MASTER_VOLUME);
  assert.equal(parseAudioSettings('{broken').volume,DEFAULT_MASTER_VOLUME);
  assert.equal(parseAudioSettings('{"version":2,"volume":0.2}').volume,DEFAULT_MASTER_VOLUME);
  assert.equal(parseAudioSettings('{"version":1,"volume":"loud"}').volume,DEFAULT_MASTER_VOLUME);
});

test('audio volume clamps saved and newly serialized values to the audible range',()=>{
  assert.equal(parseAudioSettings('{"version":1,"volume":1.6}').volume,1);
  assert.equal(parseAudioSettings('{"version":1,"volume":-0.4}').volume,0);
  assert.deepEqual(parseAudioSettings(serializeAudioSettings(-2)),{version:1,volume:0,muted:false});
  assert.deepEqual(parseAudioSettings(serializeAudioSettings(2)),{version:1,volume:1,muted:false});
});

test('master-volume changes persist through the audio settings store',()=>{
  const values=new Map();
  const storage={getItem(key){return values.get(key)??null;},setItem(key,value){values.set(key,value);}};
  assert.equal(loadAudioSettings(storage),DEFAULT_MASTER_VOLUME);
  assert.equal(setMasterVolume(.34),true);
  assert.deepEqual(parseAudioSettings(storage.getItem(AUDIO_SETTINGS_KEY)),{version:1,volume:.34,muted:false});
});

test('mute changes persist and remain independent from master volume',()=>{
  const values=new Map();
  const storage={getItem(key){return values.get(key)??null;},setItem(key,value){values.set(key,value);}};
  loadAudioSettings(storage);
  assert.equal(setAudioMuted(true),true);
  assert.equal(isAudioMuted(),true);
  assert.deepEqual(parseAudioSettings(storage.getItem(AUDIO_SETTINGS_KEY)),{version:1,volume:DEFAULT_MASTER_VOLUME,muted:true});
  assert.equal(setMasterVolume(.2),true);
  assert.deepEqual(parseAudioSettings(storage.getItem(AUDIO_SETTINGS_KEY)),{version:1,volume:.2,muted:true});
  loadAudioSettings({getItem(){return null;},setItem(){}});
  assert.equal(isAudioMuted(),false);
});

test('a blocked settings store reports when the changed volume cannot persist',()=>{
  const failure=new Error('storage denied');
  loadAudioSettings({getItem(){return null;},setItem(){throw failure;}});
  assert.equal(setMasterVolume(.2),false);
  assert.equal(setAudioMuted(true),false);
});

test('runtime mute silences the master gain and unmute restores the latest volume',async()=>{
  const gainTargets=[];
  const previousWindow=globalThis.window;
  class StubAudioContext{
    state='running';currentTime=0;destination={};
    master={gain:{value:0,setTargetAtTime(value){this.value=value;gainTargets.push(value);}},connect(){}};
    createGain(){return this.master;}
  }
  const values=new Map([[AUDIO_SETTINGS_KEY,serializeAudioSettings(.45)]]);
  const storage={getItem(key){return values.get(key)??null;},setItem(key,value){values.set(key,value);}};
  try{
    globalThis.window={AudioContext:StubAudioContext};
    loadAudioSettings(storage);
    assert.equal(await unlockAudio(),true);
    setAudioMuted(true);
    setMasterVolume(.2);
    assert.equal(gainTargets.at(-1),0,'volume changes should remain silent while muted');
    setAudioMuted(false);
    assert.equal(gainTargets.at(-1),.2,'unmute should restore the latest selected volume');
  }finally{
    if(previousWindow===undefined)delete globalThis.window;
    else globalThis.window=previousWindow;
  }
});

test('spatial helpers clamp pan, attenuate with distance and default to full centred level',()=>{
  assert.deepEqual(spatialParams(undefined),{pan:0,gain:1});
  assert.equal(spatialParams({pan:3}).pan,1);
  assert.equal(spatialParams({pan:-.4}).pan,-.4);
  assert.equal(distanceGain(0),1);
  assert.equal(distanceGain(1000),0);
  assert.ok(distanceGain(200)>distanceGain(400));
  assert.equal(panFromOffset(-9999),-1);
  assert.equal(panFromOffset(240),.5);
  assert.equal(spatialParams({distance:360,volume:.5}).gain,distanceGain(360)*.5);
});

test('time-scale colour is transparent at 1x and muffled and detuned when slow',()=>{
  assert.deepEqual(timeScaleColor(1),{cutoff:20000,pitch:1});
  const slow=timeScaleColor(.18);
  assert.ok(slow.cutoff<3000&&slow.cutoff>1000);
  assert.ok(slow.pitch<.9&&slow.pitch>.7);
  assert.ok(timeScaleColor(.6).cutoff>slow.cutoff);
  assert.deepEqual(timeScaleColor(NaN),timeScaleColor(1));
});

test('gun profiles differ by category, are stable per gun, and suppression quietens the shot',()=>{
  const gun=(id,category,damage)=>({id,category,damage});
  const pistol=gunProfile(gun('pistol_9','PISTOL',25)),shotgun=gunProfile(gun('shotgun','SHOTGUN',17)),am=gunProfile(gun('am','ANTI-MATERIEL',120));
  assert.equal(pistol.family,'pistol');
  assert.equal(shotgun.family,'shotgun');
  assert.equal(am.family,'antimateriel');
  assert.ok(am.tail>shotgun.tail&&shotgun.tail>pistol.tail);
  assert.ok(am.body<shotgun.body&&shotgun.body<pistol.body);
  assert.equal(gunProfile(gun('pistol_9','PISTOL',25)).pitch,pistol.pitch);
  assert.notEqual(gunProfile(gun('pistol_45','PISTOL',43)).pitch,pistol.pitch);
  const quiet=gunProfile(gun('pistol_9','PISTOL',25),{suppressed:true});
  assert.ok(quiet.suppressed&&quiet.vol<pistol.vol&&quiet.wet<pistol.wet);
  assert.equal(gunProfile({category:'WAT'}).family,'rifle');
  assert.equal(gunProfile(undefined).family,'rifle');
});

test('hashUnit and jitter stay in range',()=>{
  for(const text of ['a','shotgun','',123]){const u=hashUnit(text);assert.ok(u>=0&&u<1);}
  assert.equal(jitter(.1,()=>0),.9);
  assert.equal(jitter(.1,()=>.5),1);
});
