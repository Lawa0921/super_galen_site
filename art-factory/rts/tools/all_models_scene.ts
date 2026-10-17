/** Factory-only full model/rig inspection. Never imported by the game. */
import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
import {prepareTeamMasks} from '../../../src/scripts/games/rts/team-material';
import {BuildingRubbleLayer,genericCollapsePose,applyCollapsePose} from '../../../src/scripts/games/rts/building-collapse';
import type {BuildingKind} from '../../../src/scripts/games/rts/catalog';

const manifest=await(await fetch('/art-factory/rts/runs/all-models/2026-10-14-v1/review-manifest.json')).json();
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1400,840);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
el('stage').append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#202a2e');
scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(15,65,26);scene.add(sun);
const fill=new THREE.DirectionalLight('#c9d8e5',1);fill.position.set(-4,3,-5);scene.add(fill);
const camera=new THREE.OrthographicCamera(-3,3,1.8,-1.8,.01,300);
const controls=new OrbitControls(camera,renderer.domElement);
const loader=new GLTFLoader(),cache=new Map<string,Promise<GLTF>>();
let model:ModelInstance|undefined,current:GLTF|undefined,skeleton:THREE.SkeletonHelper|undefined;
let id='worker',lod=0,team=0,clip='Idle',fraction=0,playing=false,scale=1,target=new THREE.Vector3(0,1,0);
let progress=1,destruction=-1;
let rubble:BuildingRubbleLayer|undefined,rubbleSources:GLTF[]=[],height=1;
const point=new THREE.Vector3();
function visible(o:THREE.Object3D){for(let p:THREE.Object3D|null=o;p;p=p.parent)if(!p.visible)return false;return true;}
function geometry(draw=false){
  if(!model)throw new Error('No model');scene.updateMatrixWorld(true);
  const box=new THREE.Box3(),meshes:any[]=[];let vertices=0;
  for(const root of [model.root,...(rubble?[rubble.root]:[])])root.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||!visible(o))return;
    const b=new THREE.Box3();if(o instanceof THREE.SkinnedMesh)o.skeleton.update();
    for(let i=0;i<o.geometry.attributes.position.count;i++){
      if(o instanceof THREE.SkinnedMesh)o.getVertexPosition(i,point);else point.fromBufferAttribute(o.geometry.attributes.position,i);
      point.applyMatrix4(o.matrixWorld);b.expandByPoint(point);vertices++;
    }
    box.union(b);meshes.push({name:o.name,owner:o.parent?.name,minimum:b.min.toArray(),maximum:b.max.toArray(),skinned:o instanceof THREE.SkinnedMesh});
  });
  if(draw)renderer.render(scene,camera);
  return {id,lod,team,clip,fraction,progress,destruction,vertices,minimum:box.min.toArray(),maximum:box.max.toArray(),meshes,contextLost:renderer.getContext().isContextLost()};
}
async function asset(url:string){
  if(new URLSearchParams(location.search).has('candidate')&&url.endsWith('.glb'))url+='?candidate=1';
  let promise=cache.get(url);if(!promise){promise=loader.loadAsync(url).then(async g=>{await prepareTeamMasks(g);return g;});cache.set(url,promise);}return promise;
}
function view(name='three-quarter',zoom=1){
  const direction:Record<string,number[]>={front:[0,.12,-1],back:[0,.12,1],side:[1,.12,0],'three-quarter':[.5,.32,-1],game:[.6,1.1,-1],top:[0,1,.001],'under-front':[.5,-.25,-1],'under-back':[-.5,-.25,1]};
  camera.position.copy(target).add(new THREE.Vector3().fromArray(direction[name]).multiplyScalar(scale*3));controls.target.copy(target);
  controls.update();camera.updateMatrixWorld(true);
  const bounds=geometry();let halfHeight=0;
  for(const x of [bounds.minimum[0],bounds.maximum[0]])for(const y of [bounds.minimum[1],bounds.maximum[1]])for(const z of [bounds.minimum[2],bounds.maximum[2]]){
    const p=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);halfHeight=Math.max(halfHeight,Math.abs(p.y),Math.abs(p.x)*.6);
  }
  halfHeight=Math.max(.08,halfHeight*1.08);camera.left=-halfHeight/ .6;camera.right=halfHeight/.6;camera.top=halfHeight;camera.bottom=-halfHeight;camera.zoom=zoom;camera.updateProjectionMatrix();
}
function pose(){
  if(!model)return;
  model.root.position.set(0,0,0);model.root.rotation.set(0,manifest.assets[id].yaw??0,0);model.root.visible=true;
  rubble?.dispose();rubble=undefined;
  model.setDetailPixels(lod?25:100);model.setConstruction(progress);
  if(destruction>=0&&!model.setDestruction(destruction,progress)){
    applyCollapsePose(model.root,genericCollapsePose(destruction,height,100));
    if(rubbleSources.length){
      rubble=new BuildingRubbleLayer(variant=>new ModelInstance(rubbleSources[variant],{url:'review-rubble',status:'published'},-1));scene.add(rubble.root);
      rubble.observe({id:100,kind:(id.startsWith('townhall')?'townhall':id) as BuildingKind,x:0,z:0,alive:false,deathTime:0,construction:progress});
      rubble.update(destruction,new Uint8Array(96*96).fill(1),[]);
    }
  }
  for(const variant of (model as any).variants){
    if(variant.sharedPose)continue;variant.mixer.stopAllAction();
    const animation=variant.clips.find((c:THREE.AnimationClip)=>c.name===clip);if(!animation)continue;
    const action=variant.mixer.clipAction(animation);action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();action.time=animation.duration*fraction;action.paused=true;variant.mixer.update(0);
  }
  scene.updateMatrixWorld(true);renderer.render(scene,camera);
}
async function load(name:string,detail=0,color=0){
  id=name;lod=detail;team=color;progress=1;destruction=-1;
  const entry=manifest.assets[id];if(!entry)throw new Error('Unknown '+id);
  const high=await asset(entry.url),low=entry.lod1?await asset(entry.lod1):undefined;
  if(model){scene.remove(model.root);model.dispose();}if(skeleton){scene.remove(skeleton);skeleton.dispose();skeleton=undefined;}
  current=high;model=new ModelInstance(high,entry,team as 0|1,false,low);scene.add(model.root);
  height=new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3()).y;
  rubbleSources=model.setConstruction(1)?await Promise.all(['rubble-a','rubble-b'].map(n=>asset(manifest.assets[n].url))):[];
  clip=high.animations.some(c=>c.name==='Idle')?'Idle':high.animations[0]?.name??'Static';fraction=0;
  pose();const bounds=geometry();const b=new THREE.Box3(new THREE.Vector3().fromArray(bounds.minimum),new THREE.Vector3().fromArray(bounds.maximum));
  target=b.getCenter(new THREE.Vector3());const size=b.getSize(new THREE.Vector3());scale=Math.max(size.y/1.1,size.x/1.6,size.z/1.5,.15);view();
  skeleton=new THREE.SkeletonHelper(model.root);skeleton.visible=el<HTMLInputElement>('bones').checked;scene.add(skeleton);
  el<HTMLSelectElement>('asset').value=id;el<HTMLSelectElement>('lod').value=String(lod);el<HTMLSelectElement>('team').value=String(team);
  el<HTMLSelectElement>('clip').innerHTML=(high.animations.length?high.animations.map(a=>a.name):['Static']).map(n=>`<option>${n}</option>`).join('');
  el<HTMLSelectElement>('clip').value=clip;el('status').textContent=id;
  pose();return {id,clips:high.animations.map(c=>c.name),hasLod:!!low,construction:model.setConstruction(1),...geometry()};
}
function set(options:{clip?:string;fraction?:number;lod?:number;view?:string;zoom?:number;progress?:number;destruction?:number;bones?:boolean;fit?:boolean}){
  clip=options.clip??clip;fraction=options.fraction??fraction;lod=options.lod??lod;progress=options.progress??progress;destruction=options.destruction??destruction;
  if(options.view||options.zoom)view(options.view??'three-quarter',options.zoom??1);if(options.bones!==undefined&&skeleton)skeleton.visible=options.bones;
  pose();if(options.fit){const b=geometry();target.copy(new THREE.Vector3().fromArray(b.minimum).add(new THREE.Vector3().fromArray(b.maximum)).multiplyScalar(.5));const size=new THREE.Vector3().fromArray(b.maximum).sub(new THREE.Vector3().fromArray(b.minimum));scale=Math.max(size.y/1.1,size.x/1.6,size.z/1.5,.15);view(options.view??'three-quarter',options.zoom??1);renderer.render(scene,camera);}
  el<HTMLSelectElement>('clip').value=clip;el<HTMLInputElement>('phase').value=String(fraction*100);return geometry();
}
function sweep(samples=31){
  const rows:any[]=[];
  for(const detail of manifest.assets[id].lod1?[0,1]:[0])for(const a of current!.animations){
    let lowest=Infinity;const floors=new Map<string,number>();
    for(let f=0;f<samples;f++){
      const state=set({clip:a.name,lod:detail,fraction:f/(samples-1)});lowest=Math.min(lowest,state.minimum[1]);
      for(const m of state.meshes){const key=m.owner+'/'+m.name;floors.set(key,Math.min(floors.get(key)??Infinity,m.minimum[1]));}
    }
    rows.push({lod:detail,clip:a.name,samples,lowest,meshes:Object.fromEntries(floors)});
  }
  set({clip:current!.animations.some(a=>a.name==='Idle')?'Idle':'Static',fraction:0,lod:0});return rows;
}
el<HTMLSelectElement>('asset').innerHTML=Object.keys(manifest.assets).map(n=>`<option>${n}</option>`).join('');
for(const control of ['asset','lod','team'])el(control).addEventListener('change',()=>void load(el<HTMLSelectElement>('asset').value,Number(el<HTMLSelectElement>('lod').value),Number(el<HTMLSelectElement>('team').value)));
el('clip').addEventListener('change',()=>set({clip:el<HTMLSelectElement>('clip').value,fraction:0}));
el('phase').addEventListener('input',()=>set({fraction:Number(el<HTMLInputElement>('phase').value)/100}));
el('view').addEventListener('change',()=>set({view:el<HTMLSelectElement>('view').value}));
el('bones').addEventListener('change',()=>set({bones:el<HTMLInputElement>('bones').checked}));
el('play').addEventListener('click',()=>{playing=!playing;el('play').textContent=playing?'暫停':'播放';});
let last=performance.now();function tick(now:number){if(playing&&current){const duration=current.animations.find(c=>c.name===clip)?.duration??1;fraction=(fraction+(now-last)/1000/duration)%1;pose();}last=now;controls.update();renderer.render(scene,camera);requestAnimationFrame(tick);}
function materials(){const rows:any[]=[];model?.root.traverse(o=>{if(o instanceof THREE.Mesh&&visible(o))for(const m of Array.isArray(o.material)?o.material:[o.material])rows.push({mesh:o.name,material:m.name,map:!!m.map,image:m.map?.image?.width,uvs:o.geometry.attributes.uv?.count,roughness:m.roughness,metalness:m.metalness});});return rows;}
function pixelView(pixels:number,worldSpan:number){
  if(![32,64,128].includes(pixels)||worldSpan<=0)throw new Error('Invalid pixel inspection size');
  renderer.setSize(pixels,pixels);camera.left=-worldSpan/2;camera.right=worldSpan/2;camera.top=worldSpan/2;camera.bottom=-worldSpan/2;camera.zoom=1;camera.updateProjectionMatrix();renderer.render(scene,camera);
  return {pixels,worldSpan,...geometry()};
}
await load('worker');(window as any).allModels={load,set,sweep,geometry,materials,pixelView,ids:Object.keys(manifest.assets)};requestAnimationFrame(tick);
