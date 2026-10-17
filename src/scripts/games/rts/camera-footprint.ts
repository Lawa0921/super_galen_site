import * as THREE from 'three';
import type {Vec2} from './maps';
const ray=new THREE.Raycaster(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),ndc=new THREE.Vector2(),hit=new THREE.Vector3();
/** Ground (y=0) points under the screen corners, clockwise from top-left: the real view frustum footprint for the minimap. */
export function groundFootprint(camera:THREE.Camera):Vec2[]{
  return ([[-1,1],[1,1],[1,-1],[-1,-1]] as const).flatMap(([x,y])=>{ray.setFromCamera(ndc.set(x,y),camera);const p=ray.ray.intersectPlane(ground,hit);return p?[{x:p.x,z:p.z}]:[];});
}
export function pointInPolygon(p:Vec2,polygon:readonly Vec2[]):boolean{
  let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}
  return inside;
}
