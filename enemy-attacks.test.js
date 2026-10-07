import test from 'node:test';
import assert from 'node:assert/strict';
import {BRUTE_RECOVERY_SECONDS,BRUTE_WINDUP_SECONDS,bruteMeleeHits,stepBruteMelee} from './enemy-attacks.js';
import {chooseEnemyTactic} from './enemy-tactics.js';

test('Brute commits to a readable wind-up and strikes once when it ends',()=>{
  const windup=stepBruteMelee({windup:0,cooldown:0},1/60,true);
  assert.deepEqual(windup,{windup:BRUTE_WINDUP_SECONDS,cooldown:0,started:true,strike:false});
  let state={windup:windup.windup,cooldown:windup.cooldown};
  for(let i=0;i<BRUTE_WINDUP_SECONDS*60-1;i++){
    const step=stepBruteMelee(state,1/60,true);
    assert.equal(step.strike,false);
    state=step;
  }
  const strike=stepBruteMelee(state,1/60,true);
  assert.equal(strike.strike,true);
  assert.equal(strike.cooldown,BRUTE_RECOVERY_SECONDS);
  assert.equal(stepBruteMelee(strike,1/60,true).started,false);
});

test('Brute does not wind up out of range or strike after a target escapes',()=>{
  assert.equal(stepBruteMelee({windup:0,cooldown:0},1/60,false).started,false);
  const windup=stepBruteMelee({windup:0,cooldown:0},0,true);
  const strike=stepBruteMelee(windup,BRUTE_WINDUP_SECONDS,true);
  assert.equal(strike.strike,true);
  assert.equal(bruteMeleeHits({canSee:true,distance:50,range:25,targetRadius:10,aim:{x:1,y:0},targetDirection:{x:1,y:0}}),false);
});

test('Brute swing hits its committed forward arc and can be dodged sideways',()=>{
  const base={canSee:true,distance:30,range:25,targetRadius:10,aim:{x:1,y:0}};
  assert.equal(bruteMeleeHits({...base,targetDirection:{x:1,y:0}}),true);
  assert.equal(bruteMeleeHits({...base,targetDirection:{x:0,y:1}}),false);
  assert.equal(bruteMeleeHits({...base,targetDirection:{x:-1,y:0}}),false);
  assert.equal(bruteMeleeHits({...base,distance:36,targetDirection:{x:1,y:0}}),false);
  assert.equal(bruteMeleeHits({...base,targetDirection:{x:0,y:0}}),false);
  assert.equal(bruteMeleeHits({...base,canSee:false,targetDirection:{x:1,y:0}}),false);
});

test('a Brute cancels its swing when it chooses to dodge an incoming bullet',()=>{
  const actor={x:0,y:0,brain:'rush',range:40,hp:80,maxHp:80,radius:12,side:1};
  const tactic=chooseEnemyTactic({actor,target:{x:25,y:0},canSee:true,projectiles:[{x:-20,y:0,vx:100,vy:0}]});
  assert.equal(tactic.intent,'dodge');
  const interrupted=stepBruteMelee({windup:BRUTE_WINDUP_SECONDS/2,cooldown:0},1/60,true,tactic.intent==='dodge');
  assert.equal(interrupted.windup,0);
  assert.equal(interrupted.strike,false);
  assert.equal(interrupted.started,false);
});

import {shieldBlocks, turnShield} from './enemy-attacks.js';

test('riot shield blocks rounds from the front arc only',()=>{
  const facing={x:1,y:0};
  assert.equal(shieldBlocks({facing,bulletVx:-300,bulletVy:0}),true);
  assert.equal(shieldBlocks({facing,bulletVx:-300,bulletVy:200}),true,'oblique front hit is still blocked');
  assert.equal(shieldBlocks({facing,bulletVx:300,bulletVy:0}),false,'a shot from behind goes through');
  assert.equal(shieldBlocks({facing,bulletVx:0,bulletVy:300}),false,'a shot from the flank goes through');
  assert.equal(shieldBlocks({facing,bulletVx:0,bulletVy:-300}),false);
});

test('a stunned, dead or degenerate shield blocks nothing',()=>{
  const facing={x:0,y:1};
  assert.equal(shieldBlocks({facing,bulletVx:0,bulletVy:-300}),true);
  assert.equal(shieldBlocks({facing,bulletVx:0,bulletVy:-300,stun:1.5}),false,'flashed: shield is down');
  assert.equal(shieldBlocks({facing,bulletVx:0,bulletVy:-300,stun:.1}),true,'a bullet stagger does not drop it');
  assert.equal(shieldBlocks({facing,bulletVx:0,bulletVy:-300,alive:false}),false);
  assert.equal(shieldBlocks({facing:{x:0,y:0},bulletVx:0,bulletVy:-300}),false);
  assert.equal(shieldBlocks({facing,bulletVx:0,bulletVy:0}),false);
});

test('the shield turns at a capped rate so it can be out-flanked',()=>{
  const a=turnShield(0,Math.PI,.1,1.5);
  assert.ok(Math.abs(a-.15)<1e-9);
  assert.equal(turnShield(0,.05,.1,1.5),.05);
  assert.ok(turnShield(3,-3,.1,1.5)>3,'wraps through +/-PI by the short way');
});
