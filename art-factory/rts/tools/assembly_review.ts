import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {prepareTeamMasks,configureTeamMaterial} from '../../../src/scripts/games/rts/team-material';

const canvas=document.querySelector<HTMLCanvasElement>('canvas')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#202c2d');
scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(-8,20,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,far:70});sun.shadow.bias=-.0005;sun.shadow.normalBias=.035;scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#566747',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.015;ground.receiveShadow=true;scene.add(ground);
const camera=new THREE.PerspectiveCamera(36,1,.01,250),controls=new OrbitControls(camera,canvas);
const asset=document.querySelector<HTMLSelectElement>('#asset')!,variant=document.querySelector<HTMLSelectElement>('#variant')!,clip=document.querySelector<HTMLSelectElement>('#clip')!;
const cache=new Map<string,Awaited<ReturnType<GLTFLoader['loadAsync']>>>();let root:THREE.Object3D|undefined,mixer:THREE.AnimationMixer|undefined,currentAsset='';
const stats=document.querySelector<HTMLElement>('#stats')!;let generation=0;
async function load(){
 const request=++generation,id=asset.value,version=variant.value,animation=clip.value;
 (window as any).assemblyReady=false;
 const key=version+'/'+id;
 if(!cache.has(key)){
  const gltf=await new GLTFLoader().loadAsync(`./${version}/models/${id}.glb`);await prepareTeamMasks(gltf);
  gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material])if(/TeamCloth/i.test(m.name))configureTeamMaterial(m,0,m.userData.teamTintTexture);}});
  cache.set(key,gltf);
 }
 if(request!==generation)return;
 if(root)scene.remove(root);mixer?.stopAllAction();const gltf=cache.get(key)!;root=gltf.scene;scene.add(root);root.updateMatrixWorld(true);
 mixer=gltf.animations.length?new THREE.AnimationMixer(root):undefined;
 if(mixer){const action=gltf.animations.find(a=>a.name.toLowerCase()===animation.toLowerCase())??gltf.animations[0];mixer.clipAction(action).play();}
 clip.disabled=!mixer;
 if(currentAsset!==id){const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),extent=Math.max(size.x,size.y,size.z);controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(1,.80,1.3).multiplyScalar(extent*1.25));controls.update();currentAsset=id;}
 let draws=0,triangles=0;root.traverse(o=>{if(o instanceof THREE.Mesh){draws+=o.geometry.groups.length||1;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 stats.textContent=`${version==='after'?'細修後版本':'細修前版本'} · ${Math.round(triangles).toLocaleString()} 三角面 · ${draws} 材質批次`;stats.dataset.key=key+'/'+animation;
 (window as any).assemblyReady=true;
}
for(const el of [asset,variant,clip])el.addEventListener('change',()=>void load());
document.querySelector('#reset')!.addEventListener('click',()=>{currentAsset='';void load();});
function resize(){renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(canvas);resize();
const clock=new THREE.Clock();function frame(){mixer?.update(Math.min(.05,clock.getDelta()));renderer.render(scene,camera);requestAnimationFrame(frame);}frame();
(window as any).assemblyReview={load,root:()=>root,mixer:()=>mixer,camera,controls,renderer,scene};await load();
