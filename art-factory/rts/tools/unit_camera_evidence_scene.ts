/** Isolated unit camera evidence scene; never imported by the shipped game.
 * Reproduces the in-game orthographic camera (scene.ts: offset 24,52,35; span 48 default, 24 max zoom)
 * and the selection portrait camera (portrait.ts PORTRAIT_FRAMING) with the real ModelInstance path.
 */
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
import {prepareTeamMasks} from '../../../src/scripts/games/rts/team-material';
import {PORTRAIT_FRAMING} from '../../../src/scripts/games/rts/portrait';

const params=new URLSearchParams(location.search);
const units=(params.get('units')??'worker,crossbow,guard').split(',') as Array<'worker'|'crossbow'|'guard'>;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.style.margin='0';document.body.style.background='#000';document.body.append(renderer.domElement);
const loader=new GLTFLoader();
const assets:Record<string,{high:GLTF;low:GLTF}>={};
for(const unit of units){
  const [high,low]=await Promise.all([loader.loadAsync(`/assets/games/rts/models/rts-ev-${unit}-lod0.glb`),loader.loadAsync(`/assets/games/rts/models/rts-ev-${unit}-lod1.glb`)]);
  await Promise.all([prepareTeamMasks(high),prepareTeamMasks(low)]);assets[unit]={high,low};
}
const entry=(unit:string)=>({url:`/assets/games/rts/models/${unit}.glb`,status:'published' as const});
const seek=(model:ModelInstance,clip:string,time:number)=>{
  model.animate(clip,0);
  for(const variant of (model as any).variants)variant.mixer.setTime(time);
};
const clipTime=(model:ModelInstance,clip:string,phase:number)=>{
  const variant=(model as any).variants[0];const name=clip==='walk'?variant.motion?.locomotion.clip??'Walk':clip==='attack'?variant.motion?.attack.clip??'Attack':'Idle';
  const c=variant.clips.find((x:THREE.AnimationClip)=>x.name===name)??variant.clips.find((x:THREE.AnimationClip)=>x.name.toLowerCase()===clip);
  return c.duration*phase;
};

function gameScene(span:number,width:number,height:number,clips:string[],phase:number){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#121e22');
  scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
  const center=new THREE.Vector3(48,0,48);
  const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(15,65,26);sun.target.position.set(48,0,48);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,far:160});sun.shadow.bias=-.0005;sun.shadow.normalBias=.07;
  scene.add(sun,sun.target);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(96,96),new THREE.MeshStandardMaterial({color:'#62703f',roughness:.95}));
  ground.rotation.x=-Math.PI/2;ground.position.set(48,0,48);ground.receiveShadow=true;scene.add(ground);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,250);const aspect=width/height;
  Object.assign(camera,{left:-span*aspect/2,right:span*aspect/2,top:span/2,bottom:-span/2});
  camera.position.set(center.x+24,52,center.z+35);camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const models:ModelInstance[]=[];
  units.forEach((unit,u)=>clips.forEach((clip,c)=>[0,1].forEach(team=>{
    const model=new ModelInstance(assets[unit].high,entry(unit),team as 0|1,false,assets[unit].low);
    const facing=team===0?.6:.6+Math.PI/2;
    model.root.position.set(center.x+(c-1)*3+(team?1.4:0),0,center.z+(u-(units.length-1)/2)*3.2);
    model.root.rotation.y=facing+Math.PI+model.yaw;
    model.root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    scene.add(model.root);models.push(model);
    seek(model,clip,clipTime(model,clip,phase));
    // Same LOD rule as scene.ts: projected unit height in CSS pixels.
    scene.updateMatrixWorld(true);
    const a=model.root.position.clone().project(camera),b=model.root.position.clone().add(new THREE.Vector3(0,1.8,0)).project(camera);
    model.setDetailPixels(Math.abs(a.y-b.y)*height/2);
  })));
  return {scene,camera,models};
}

function portraitScene(unit:'worker'|'crossbow'|'guard',clip:string,phase:number){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#16262b');
  scene.add(new THREE.HemisphereLight('#dce7ee','#5f6354',2.1));
  const key=new THREE.DirectionalLight('#ffe2bb',3.1);key.position.set(-3,4,5);scene.add(key);
  const rim=new THREE.DirectionalLight('#a6c9e1',1.3);rim.position.set(3,2,-3);scene.add(rim);
  const framing=PORTRAIT_FRAMING[unit];
  const model=new ModelInstance(assets[unit].high,entry(unit),0,false,assets[unit].low);
  model.root.rotation.y=model.yaw+framing.yaw;scene.add(model.root);
  seek(model,clip,clipTime(model,clip,phase));
  const camera=new THREE.OrthographicCamera(-framing.span/2,framing.span/2,framing.span/2,-framing.span/2,.01,20);
  camera.position.set(0,framing.y+.03,4);camera.lookAt(0,framing.y,0);camera.updateProjectionMatrix();
  return {scene,camera,models:[model]};
}

(window as any).evidence={
  game(span:number,clips:string[],phase:number){
    renderer.setPixelRatio(1);renderer.setSize(1920,1080);
    const {scene,camera,models}=gameScene(span,1920,1080,clips,phase);scene.updateMatrixWorld(true);renderer.render(scene,camera);
    const lods=models.map(m=>(m as any).variants.map((v:any)=>v.root.visible));
    return {lods,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  },
  portrait(unit:'worker'|'crossbow'|'guard',clip:string,phase:number,size:number){
    renderer.setPixelRatio(1);renderer.setSize(size,size);
    const {scene,camera}=portraitScene(unit,clip,phase);scene.updateMatrixWorld(true);renderer.render(scene,camera);return true;
  },
  /** Diagnostic only: one unit at the in-game camera direction with a tight span (not an acceptance view). */
  inspect(unit:'worker'|'crossbow'|'guard',clip:string,phase:number,facing:number,span:number){
    renderer.setPixelRatio(1);renderer.setSize(800,800);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#121e22');
    scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
    const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(15,65,26);scene.add(sun);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#62703f',roughness:.95}));ground.rotation.x=-Math.PI/2;scene.add(ground);
    const model=new ModelInstance(assets[unit].high,entry(unit),0,false,assets[unit].low);model.root.rotation.y=facing+Math.PI+model.yaw;scene.add(model.root);
    model.setDetailPixels(999);seek(model,clip,clipTime(model,clip,phase));
    const camera=new THREE.OrthographicCamera(-span/2,span/2,span/2,-span/2,.1,250);camera.position.set(24,52+.9,35);camera.lookAt(0,.9,0);camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true);renderer.render(scene,camera);return true;
  },
  /** Nearest-neighbour enlargement of a canvas region so small in-game pixels can be inspected. */
  crop(x:number,y:number,w:number,h:number,scale:number){
    const c=document.createElement('canvas');c.width=w*scale;c.height=h*scale;const g=c.getContext('2d')!;g.imageSmoothingEnabled=false;
    g.drawImage(renderer.domElement,x,y,w,h,0,0,w*scale,h*scale);return c.toDataURL('image/png');
  },
  project(span:number,positions:number[][]){
    const {camera}=gameScene(span,1920,1080,[],0);
    return positions.map(p=>{const v=new THREE.Vector3(...p).project(camera);return [(v.x+1)/2*1920,(1-v.y)/2*1080];});
  },
  clips:Object.fromEntries(units.map(u=>[u,[assets[u].high.animations.map(c=>c.name),assets[u].low.animations.map(c=>c.name)]])),
};
