/** Isolated original projectile QA, never imported by the shipped game. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
import {ProjectileLayer} from '../../../src/scripts/games/rts/projectile-layer';
import type {Projectile} from '../../../src/scripts/games/rts/types';
const loader=new GLTFLoader(),assets=new Map(await Promise.all(['bolt','heavy-bolt'].map(async id=>[id,await loader.loadAsync('/rts-projectile-'+id+'.glb')] as const)));
const scene=new THREE.Scene();scene.background=new THREE.Color('#222d31');
const camera=new THREE.OrthographicCamera(-4,4,2.25,-2.25,.1,50);camera.position.set(0,10,8);camera.lookAt(0,1.5,0);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,675);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
document.body.style.margin='0';document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(15,65,26);scene.add(sun);
const layer=new ProjectileLayer({instantiate:(id,team)=>new ModelInstance(assets.get(id)!,{url:'/assets/games/rts/models/'+id+'.glb',status:'published'},team)});scene.add(layer.root);
const shots:Projectile[]=Array.from({length:4},(_,i)=>({id:i,sourceId:10+i,targetId:20+i,team:0,x:i%2?-1.5:1.5,z:i<2?-1:1,kind:i<2?'bolt':'shell',damage:1,speed:12}));
const targets=shots.map((p,i)=>({id:p.targetId,x:p.x+(i%2?1:-1),z:p.z,facing:0}));
const render=()=>{scene.updateMatrixWorld(true);renderer.render(scene,camera);};layer.update(shots,targets);render();
(window as any).projectileAudit={
  details:()=>({count:layer.root.children.length,directions:layer.root.children.map(child=>new THREE.Vector3(0,0,-1).applyQuaternion(child.quaternion).toArray()),positions:layer.root.children.map(child=>child.position.toArray()),draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,lost:renderer.getContext().isContextLost()}),
  travel:()=>{for(let i=0;i<shots.length;i++){shots[i].x+=(i%2?.3:-.3);shots[i].z+=.2;}layer.update(shots,[]);render();},
  expire:()=>{layer.update([],[]);render();},
};
