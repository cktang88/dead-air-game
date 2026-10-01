import test from 'node:test';
import assert from 'node:assert/strict';
import {findRoomPropPosition} from './room-props.js';

const tileSize=32;
const room={x1:1,x2:12,y1:1,y2:10,cx:6.5,cy:5.5};
const cells=Array.from({length:13},(_,y)=>Array.from({length:15},(_,x)=>x>1&&x<12&&y>1&&y<10?0:1));
const doors=[{x:1,y:5},{x:11,y:5}];
const randomFromSeed=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};

test('room props stay on floor, clear the center and doors, and avoid existing cover',()=>{
  const occupied=[];const random=randomFromSeed(417);
  for(let i=0;i<8;i++){
    const point=findRoomPropPosition({room,cells,doors,occupied,tileSize,random});
    assert.ok(point,'room should have another safe prop position');
    const tx=Math.floor(point.x/tileSize),ty=Math.floor(point.y/tileSize);
    assert.equal(cells[ty][tx],0);
    assert.ok(Math.hypot(point.x-(room.cx+.5)*tileSize,point.y-(room.cy+.5)*tileSize)>=60);
    assert.ok(doors.every(door=>Math.hypot(point.x-(door.x+.5)*tileSize,point.y-(door.y+.5)*tileSize)>=tileSize*1.6));
    assert.ok(occupied.every(item=>Math.hypot(point.x-item.x,point.y-item.y)>=item.radius+22));
    occupied.push({...point,radius:17});
  }
});

test('small rooms can reject props when no safe floor tiles remain',()=>{
  const smallRoom={x1:1,x2:4,y1:1,y2:4,cx:2.5,cy:2.5};
  const smallCells=Array.from({length:6},(_,y)=>Array.from({length:6},(_,x)=>x>=2&&x<=3&&y>=2&&y<=3?0:1));
  assert.equal(findRoomPropPosition({room:smallRoom,cells:smallCells,doors:[],occupied:[],tileSize,random:()=>0.5}),null);
});
