import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_VISUAL_SETTINGS,flashOverlayOpacity,loadVisualSettings,parseVisualSettings,saveVisualSettings,scaledCameraShake,serializeVisualSettings,VISUAL_SETTINGS_KEY} from './visual-settings.js';

test('visual settings default safely and reject unsupported saves',()=>{
  assert.deepEqual(parseVisualSettings(null),{version:1,...DEFAULT_VISUAL_SETTINGS});
  assert.deepEqual(parseVisualSettings('{bad'),{version:1,...DEFAULT_VISUAL_SETTINGS});
  assert.deepEqual(parseVisualSettings('{"version":2,"shake":0,"flash":0}'),{version:1,...DEFAULT_VISUAL_SETTINGS});
});

test('visual setting sliders load, clamp, and save one validated record',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  assert.deepEqual(loadVisualSettings(storage),{version:1,...DEFAULT_VISUAL_SETTINGS});
  saveVisualSettings(storage,{shake:.25,flash:.7});
  assert.deepEqual(loadVisualSettings(storage),{version:1,shake:.25,flash:.7});
  assert.equal(VISUAL_SETTINGS_KEY,'dead-air.visual.v1');
  assert.deepEqual(parseVisualSettings(serializeVisualSettings({shake:-1,flash:3})),{version:1,shake:0,flash:1});
  assert.deepEqual(parseVisualSettings('{"version":1,"shake":"off","flash":0.2}'),{version:1,shake:1,flash:.2});
});

test('a denied browser storage read falls back to safe defaults',()=>{
  assert.deepEqual(loadVisualSettings({getItem(){throw new Error('denied');}}),{version:1,...DEFAULT_VISUAL_SETTINGS});
});

test('camera shake strength scales kick while zero fully removes it',()=>{
  assert.equal(scaledCameraShake(5,.4),2);
  assert.equal(scaledCameraShake(5,0),0);
  assert.equal(scaledCameraShake(-2,1),0);
});

test('flash overlay fades over 240 ms and obeys the brightness limit',()=>{
  assert.equal(flashOverlayOpacity(.24,1),.72);
  assert.equal(flashOverlayOpacity(.12,.5),.18);
  assert.equal(flashOverlayOpacity(0,1),0);
  assert.equal(flashOverlayOpacity(.24,0),0);
});
