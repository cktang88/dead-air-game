import test from 'node:test';
import assert from 'node:assert/strict';
import {compareStat,feedTone,formatClock,gunIcon,gunStatRows,statMaxima,tempoView,weaponCycleRpm} from './hud-ui.js';
import {GUNS} from './catalog.js';

test('tempoView maps speed to still, walk and sprint bands', () => {
  assert.equal(tempoView({scale:.08}).state,'still');
  assert.equal(tempoView({speedRatio:1,scale:.35}).label,'WALK');
  assert.equal(tempoView({speedRatio:1.45,scale:1}).label,'SPRINT');
  assert.equal(tempoView({scale:.08}).speed,'0.08×');
  assert.equal(tempoView({scale:2}).fraction,1);
});


test('compareStat respects stats where lower is better', () => {
  assert.equal(compareStat(40,50),'up');
  assert.equal(compareStat(40,30),'down');
  assert.equal(compareStat(3,2,true),'up');
  assert.equal(compareStat(3,4,true),'down');
  assert.equal(compareStat(3,3,true),'same');
  assert.equal(compareStat(null,3),'same');
});

test('gunStatRows normalises against the catalog maxima and compares to the current gun', () => {
  const max=statMaxima(GUNS);
  for(const gun of GUNS)for(const row of gunStatRows(gun,GUNS[0],GUNS)){assert.ok(row.fill>0&&row.fill<=1,`${gun.id}.${row.id}`);}
  assert.equal(max.damage,Math.max(...GUNS.map(g=>g.damage*(g.count||1))));
  const sniper=GUNS.find(g=>g.id==='sniper_lynx');
  const rows=Object.fromEntries(gunStatRows(sniper,GUNS[0],GUNS).map(r=>[r.id,r]));
  assert.equal(rows.damage.verdict,'up');
  assert.equal(rows.weight,undefined,'weight is not a stat any more');
  assert.equal(gunStatRows(GUNS[0],GUNS[0],GUNS).every(r=>r.verdict==='same'),true);
  assert.equal(weaponCycleRpm({rate:.5}),120);
});

test('every gun category has a silhouette icon', () => {
  for(const gun of GUNS)assert.match(gunIcon(gun),/<path/);
});

test('feedTone and formatClock', () => {
  assert.equal(feedTone('OUT OF FRAG GRENADE'),'warn');
  assert.equal(feedTone('PLATE HIT · 1 LEFT'),'bad');
  assert.equal(feedTone('+12 SCRAP'),'loot');
  assert.equal(feedTone('DOWNED · RUSHER'),'kill');
  assert.equal(formatClock(214),'03:34');
  assert.equal(formatClock(-4),'00:00');
});
