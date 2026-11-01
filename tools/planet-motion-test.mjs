import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Player} from '../assets/js/world/player.js';
import {advanceWalking} from '../assets/js/planets/motion.js';
function approach(hz,collision=false){
 const cam=new THREE.PerspectiveCamera(),goal=new THREE.Vector3(0,Math.cos(.4),-Math.sin(.4)).multiplyScalar(20);
 const blocker={center:new THREE.Vector3(0,Math.cos(.2),-Math.sin(.2)).multiplyScalar(20),radius:.7};
 const player=new Player(cam,{surface:()=>20,colliders:collision?[blocker]:[]});player.spawn(new THREE.Vector3(0,1,0),goal);player.enabled=true;let arrived=false,stuck=false;
 player.walkTo(goal,{onArrive:()=>arrived=true,onStuck:()=>stuck=true});let elapsed=0;
 for(let i=0;i<hz*6&&!arrived&&!stuck;i++){advanceWalking(player,1/hz);elapsed+=1/hz;if(collision)assert(player.pos.distanceTo(blocker.center)>=.7+.30,'slow-frame steps must not tunnel through a collider');}
 return {player,arrived,stuck,elapsed};
}
const fast=approach(60),slow=approach(5);
assert(fast.arrived&&slow.arrived,'the same approach must finish at high and low rendering rates');
assert(Math.abs(fast.elapsed-slow.elapsed)<.3,'low render rate must not discard most walking time');
assert(fast.player.pos.distanceTo(slow.player.pos)<.2,'approaches must settle at the same destination');
assert(approach(5,true).stuck,'a blocked route must still stop rather than pass through a prop');
let consumed=0,largest=0;advanceWalking({update(dt){consumed+=dt;largest=Math.max(largest,dt);}},8);
assert(consumed<=.2500001&&largest<=.05,'resuming after a long pause must remain bounded');
let transitioning=false,calls=0;advanceWalking({update(){calls++;transitioning=true;}},.25,()=>transitioning);
assert.equal(calls,1,'an action transition must interrupt remaining walking steps');
console.log('Walking: same approach timing at 60/5 fps; colliders, resume cap and action interruption passed.');
