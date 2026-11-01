import assert from 'node:assert/strict';
import * as THREE from 'three';
import {pickThing} from '../assets/js/planets/picking.js';
const seat={id:'seat',root:new THREE.Group(),hull:new THREE.Box3(new THREE.Vector3(-.75,0,-.75),new THREE.Vector3(.75,1.05,.75))};
const book={id:'book',solid:false,root:new THREE.Group()};
const cover=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshBasicMaterial());cover.position.set(-1.2,.9,0);cover.userData.thing=book;book.root.add(cover);
const back=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.05,.12),new THREE.MeshBasicMaterial());back.position.set(0,.525,-.65);back.userData.thing=seat;seat.root.add(back);
seat.root.updateMatrixWorld(true);book.root.updateMatrixWorld(true);
const caster=new THREE.Raycaster(new THREE.Vector3(0,1.15,0),new THREE.Vector3(-1.2,-.25,0).normalize());
assert.equal(pickThing(caster,[seat,book],[back,cover]).id,'seat','standing gap picks retain the original solid-hull policy');
assert.equal(pickThing(caster,[seat,book],[back,cover],Infinity,'seat').id,'book','an occupied seat hull must not steal a visible outward book tap');
const arm=new THREE.Mesh(new THREE.BoxGeometry(.12,.15,.5),new THREE.MeshBasicMaterial());arm.position.set(-.65,1.02,0);arm.userData.thing=seat;seat.root.add(arm);seat.root.updateMatrixWorld(true);
assert.equal(pickThing(caster,[seat,book],[back,arm,cover],Infinity,'seat').id,'seat','actual seat geometry must still occlude the book');
for(const o of [back,arm,cover]){o.geometry.dispose();o.material.dispose();}
console.log('Picking: ordinary solid hulls retained; occupied-seat air gaps release visible taps; actual seat mesh occlusion retained.');
