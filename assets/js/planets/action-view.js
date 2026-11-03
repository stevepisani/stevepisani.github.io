// A tap chooses a clear surface approach, then a deliberate view of both response states.
// Reuse the homepage's obstacle routing and the planet's ordinary geometry/visibility fitter.
import * as THREE from 'three';
import { onPlanet } from '../world/route.js';
import { BODY } from '../world/player.js';
import { RADIUS } from '../world/planet.js';
import { overviewFrame } from './overview.js';
export function actionBounds(thing) {
  thing.root.updateWorldMatrix(true,true);
  // box is the authored union of both endpoints, measured before placement, rotation and scale.
  return thing.box?.clone().applyMatrix4(thing.root.matrixWorld)||new THREE.Box3().setFromObject(thing.root);
}
export function approachRoute(from,to,colliders,surface) {
  return onPlanet(from,to,colliders,{R:RADIUS,body:BODY+.1}).map(up=>up.multiplyScalar(surface(up)));
}
export function responseFrame(thing,things,{aspect,fov,height,surface,colliders}) {
  // Upper controls finish at 116 px; the response caption sits below the framed geometry.
  // Use both endpoint bounds so the user can reverse without another camera move.
  return overviewFrame(things,{aspect,fov,height,surface,colliders,focusId:thing.id,focusOnly:true,boundsFor:t=>t===thing?actionBounds(t):null,frameArea:{x:.88,top:1-264/height,bottom:-1+242/height}});
}
