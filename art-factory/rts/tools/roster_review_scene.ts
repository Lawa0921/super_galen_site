/** Factory-only roster-expansion review stage. Never imported by the game.
 * Uses the runtime ModelInstance (team tint, team masks, LOD switch, shared materials) so stills
 * show exactly what the game renders. Driven by roster_review_capture.mjs. */
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
import {prepareTeamMasks} from '../../../src/scripts/games/rts/team-material';

const manifest=await(await fetch('/roster-review/manifest.json')).json();
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(720,820);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
document.getElementById('stage')!.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#2a3438');
scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(15,65,26);scene.add(sun);
const fill=new THREE.DirectionalLight('#c9d8e5',1);fill.position.set(-4,3,-5);scene.add(fill);
const ground=new THREE.Mesh(new THREE.CircleGeometry(4,48),new THREE.MeshStandardMaterial({color:'#4b5a3c',roughness:1}));ground.rotation.x=-Math.PI/2;scene.add(ground);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,300);
const loader=new GLTFLoader(),cache=new Map<string,Promise<GLTF>>();
type Slot={id:string;model:ModelInstance};
let slots:Slot[]=[];
async function asset(url:string){let p=cache.get(url);if(!p){p=loader.loadAsync(url).then(async g=>{await prepareTeamMasks(g);return g;});cache.set(url,p);}return p;}
function clear(){for(const s of slots){scene.remove(s.model.root);s.model.dispose();}slots=[];}
/** Place one or more units on a row (x spacing in metres), all on the same team. */
async function show(ids:string[],team=0,spacing=1.6){
  clear();
  for(const [i,id] of ids.entries()){
    const entry=manifest.assets[id];if(!entry)throw new Error('Unknown '+id);
    const high=await asset(entry.url),low=entry.lod1?await asset(entry.lod1):undefined;
    const model=new ModelInstance(high,entry,team as 0|1,false,low);model.root.position.set((i-(ids.length-1)/2)*spacing,0,0);
    scene.add(model.root);slots.push({id,model});
  }
  return ids.map(id=>({id,clips:slots.find(s=>s.id===id)!.model.root.userData.clips??null}));
}
function clipsOf(slot:Slot):THREE.AnimationClip[]{return (slot.model as any).variants[0].clips;}
function pose(clip:string,fraction:number,lod:0|1,yaw=0){
  for(const s of slots){
    s.model.setDetailPixels(lod?25:100);s.model.root.rotation.set(0,(manifest.assets[s.id].yaw??0)+yaw,0);
    for(const variant of (s.model as any).variants){
      if(variant.sharedPose)continue;variant.mixer.stopAllAction();
      const animation=variant.clips.find((c:THREE.AnimationClip)=>c.name===clip)??variant.clips.find((c:THREE.AnimationClip)=>c.name==='Idle');if(!animation)continue;
      const action=variant.mixer.clipAction(animation);action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();action.time=animation.duration*fraction;action.paused=true;variant.mixer.update(0);
    }
  }
  scene.updateMatrixWorld(true);
}
const point=new THREE.Vector3();
function bounds(){
  const box=new THREE.Box3();
  for(const s of slots)s.model.root.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;for(let p:THREE.Object3D|null=o;p;p=p.parent)if(!p.visible)return;
    if(o instanceof THREE.SkinnedMesh)o.skeleton.update();
    for(let i=0;i<o.geometry.attributes.position.count;i+=3){if(o instanceof THREE.SkinnedMesh)o.getVertexPosition(i,point);else point.fromBufferAttribute(o.geometry.attributes.position,i);point.applyMatrix4(o.matrixWorld);box.expandByPoint(point);}
  });
  return box;
}
/** Frame a fixed world box (so strips of one clip share scale) from a named direction. */
function frame(view:string,box:{min:number[];max:number[]},width=720,height=820,slab=false){
  renderer.setSize(width,height);
  const dir:Record<string,number[]>={front:[0,.12,-1],back:[0,.12,1],side:[1,.12,0],'three-quarter':[.62,.36,-1],game:[.55,1.25,-.95],top:[0,1,-.001]};
  const b=new THREE.Box3(new THREE.Vector3().fromArray(box.min),new THREE.Vector3().fromArray(box.max));
  const c=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3());
  camera.position.copy(c).add(new THREE.Vector3().fromArray(dir[view]).normalize().multiplyScalar(30));camera.lookAt(c);camera.updateMatrixWorld(true);
  let hx=0,hy=0;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const p=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);hx=Math.max(hx,Math.abs(p.x-0));hy=Math.max(hy,Math.abs(p.y));}
  const aspect=width/height;let half=Math.max(hy,hx/aspect)*1.06;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
  // Close-ups: clip to a slab around the box so a weapon end or cloth far in front (orthographic
  // views stack depth) never stands in for the hand.
  const depth=size.length()*.5+.10;camera.near=slab?30-depth:.01;camera.far=300;camera.updateProjectionMatrix();
  renderer.render(scene,camera);camera.near=.01;camera.far=300;camera.updateProjectionMatrix();return {center:c.toArray(),size:size.toArray()};
}
/** World box covering every sampled frame of a clip (both LOD ignored: LOD0 geometry). */
function sweepBox(clip:string,samples=24,yaw=0){
  const box=new THREE.Box3();for(let i=0;i<samples;i++){pose(clip,i/(samples-1),0,yaw);box.union(bounds());}
  return {min:box.min.toArray(),max:box.max.toArray()};
}
function info(){
  return slots.map(s=>{const b=new THREE.Box3();s.model.root.traverse(o=>{if(o instanceof THREE.Mesh){if(o instanceof THREE.SkinnedMesh)o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i+=3){if(o instanceof THREE.SkinnedMesh)o.getVertexPosition(i,point);else point.fromBufferAttribute(o.geometry.attributes.position,i);point.applyMatrix4(o.matrixWorld);b.expandByPoint(point);}}});
    return {id:s.id,clips:clipsOf(s).map(c=>({name:c.name,duration:c.duration})),height:b.max.y-b.min.y,min:b.min.toArray(),max:b.max.toArray(),contextLost:renderer.getContext().isContextLost()};});
}
/** World box around a bone of the first shown unit (hand close-ups). */
function boneBox(name:string,pad=.13){
  let found:THREE.Bone|undefined;slots[0]?.model.root.traverse(o=>{if(!found&&(o as THREE.Bone).isBone&&o.name===name&&(o as any).visible!==false)found=o as THREE.Bone;});
  if(!found)throw new Error('No bone '+name);scene.updateMatrixWorld(true);
  const p=new THREE.Vector3().setFromMatrixPosition(found.matrixWorld);
  return {min:[p.x-pad,p.y-pad,p.z-pad],max:[p.x+pad,p.y+pad,p.z+pad]};
}
(window as any).rosterReview={show,pose,frame,sweepBox,boneBox,bounds:()=>{const b=bounds();return {min:b.min.toArray(),max:b.max.toArray()};},info,ground:(v:boolean)=>{ground.visible=v;}};
