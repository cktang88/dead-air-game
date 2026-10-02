import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIO_SETTINGS_KEY, DEFAULT_MASTER_VOLUME, isAudioMuted, loadAudioSettings, parseAudioSettings, serializeAudioSettings, setAudioMuted, setMasterVolume, unlockAudio} from './audio.js';

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
