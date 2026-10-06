import test from 'node:test';
import assert from 'node:assert/strict';
import {ageHitIndicators, angleDelta, edgeAnchor, HIT_INDICATOR_LIFE, registerHitIndicator} from './threat-indicators.js';

test('edgeAnchor lands on the inset screen rectangle in every direction',()=>{
  const w=1000,h=600,m=20;
  for(let i=0;i<64;i++){
    const p=edgeAnchor(w,h,i/64*Math.PI*2,m);
    assert.ok(p.x>=m-1e-6&&p.x<=w-m+1e-6&&p.y>=m-1e-6&&p.y<=h-m+1e-6,JSON.stringify(p));
    assert.ok(Math.abs(p.x-m)<1e-6||Math.abs(p.x-(w-m))<1e-6||Math.abs(p.y-m)<1e-6||Math.abs(p.y-(h-m))<1e-6);
  }
  const right=edgeAnchor(w,h,0,m);assert.ok(Math.abs(right.x-(w-m))<1e-6&&Math.abs(right.y-h/2)<1e-6);
});

test('hit indicators merge nearby angles, cap at six and expire',()=>{
  const list=[];
  registerHitIndicator(list,1);registerHitIndicator(list,1.1);
  assert.equal(list.length,1,'near-identical directions refresh the same arc');
  registerHitIndicator(list,-2);assert.equal(list.length,2);
  for(let i=0;i<10;i++)registerHitIndicator(list,i*.6-3);
  assert.ok(list.length<=6);
  ageHitIndicators(list,HIT_INDICATOR_LIFE+.01);
  assert.equal(list.length,0);
});

test('angleDelta takes the short way around',()=>{
  assert.ok(Math.abs(angleDelta(3,-3)-(2*Math.PI-6))<1e-9);
  assert.ok(Math.abs(angleDelta(0,1)-1)<1e-9);
});
