import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIO_SETTINGS_KEY, DEFAULT_MASTER_VOLUME, loadAudioSettings, parseAudioSettings, serializeAudioSettings, setMasterVolume} from './audio.js';

test('audio settings round-trip the master volume',()=>{
  const encoded=serializeAudioSettings(.42);
  assert.equal(AUDIO_SETTINGS_KEY,'dead-air.audio.v1');
  assert.deepEqual(parseAudioSettings(encoded),{version:1,volume:.42});
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
  assert.deepEqual(parseAudioSettings(serializeAudioSettings(-2)),{version:1,volume:0});
  assert.deepEqual(parseAudioSettings(serializeAudioSettings(2)),{version:1,volume:1});
});

test('master-volume changes persist through the audio settings store',()=>{
  const values=new Map();
  const storage={getItem(key){return values.get(key)??null;},setItem(key,value){values.set(key,value);}};
  assert.equal(loadAudioSettings(storage),DEFAULT_MASTER_VOLUME);
  assert.equal(setMasterVolume(.34),true);
  assert.deepEqual(parseAudioSettings(storage.getItem(AUDIO_SETTINGS_KEY)),{version:1,volume:.34});
});

test('a blocked settings store reports when the changed volume cannot persist',()=>{
  const failure=new Error('storage denied');
  loadAudioSettings({getItem(){return null;},setItem(){throw failure;}});
  assert.equal(setMasterVolume(.2),false);
});
