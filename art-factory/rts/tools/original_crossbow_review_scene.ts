import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
import {prepareTeamMasks} from '../../../src/scripts/games/rts/team-material';

type RecordEntry={name:string;status:string;notes:string;base:string;stem:string;hashes:string[]};
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=el<HTMLCanvasElement>('stage');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#202d29');
const camera=new THREE.PerspectiveCamera(33,1,.02,80);
scene.add(new THREE.HemisphereLight('#eef3e6','#546551',2.1));
const key=new THREE.DirectionalLight('#fff0da',3.2);key.position.set(-3,6,-4);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);key.shadow.bias=-0.0005;key.shadow.normalBias=0.035;key.shadow.camera.near=0.5;key.shadow.camera.far=20;scene.add(key);
const fill=new THREE.DirectionalLight('#bed9ed',1.1);fill.position.set(3,3,3);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#34453a',roughness:.96}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.01;floor.receiveShadow=true;scene.add(floor);
const loader=new GLTFLoader();const cache=new Map<string,Promise<{gltf:GLTF;sha:string}>>();
let records:Record<string,RecordEntry>={},model:ModelInstance|undefined,current:GLTF|undefined,active:THREE.AnimationAction|undefined;
let unit='crossbow',lod=0,team:0|1=0,clipName='Idle',time=0,duration=1,playing=false,loadVersion=0,ready=false,last=0;
let sourceSha='',sourceUrl='';
const views:Record<string,THREE.Vector3>={front:new THREE.Vector3(0,.95,-4.5),threequarter:new THREE.Vector3(2.2,1.1,-3.9),side:new THREE.Vector3(4.5,.95,0),back:new THREE.Vector3(0,.95,4.5)};
function resize(){const rect=canvas.parentElement!.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;const zoom=Number(el<HTMLInputElement>('zoom').value);camera.position.copy(views[el<HTMLSelectElement>('view').value]).multiplyScalar(1/zoom).add(new THREE.Vector3(0,.9,0));camera.lookAt(0,.9,0);camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(canvas.parentElement!);resize();
function pose(){if(!active||!model)return;active.time=time;model.mixer.update(0);model.root.updateWorldMatrix(true,true);el<HTMLOutputElement>('clock').textContent=`${time.toFixed(2)} / ${duration.toFixed(2)} 秒`;el<HTMLInputElement>('timeline').value=String(time);}
function chooseClip(){if(!model||!current)return;const clip=current.animations.find(x=>x.name===clipName);if(!clip)throw new Error(`候選缺少 ${clipName} 動作`);model.mixer.stopAllAction();active=model.mixer.clipAction(clip);active.reset().setEffectiveWeight(1).setLoop(THREE.LoopOnce,1);active.clampWhenFinished=true;active.play();active.paused=true;duration=clip.duration;time=0;playing=false;el<HTMLInputElement>('timeline').max=String(duration);pose();document.querySelectorAll<HTMLButtonElement>('[data-clip]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.clip===clipName)));}
async function asset(url:string){let promise=cache.get(url);if(!promise){promise=(async()=>{const response=await fetch(url);if(!response.ok)throw new Error(`HTTP ${response.status}: ${url}`);const bytes=await response.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);const sha=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');const gltf=await loader.parseAsync(bytes,new URL('.',new URL(url,location.href)).href);await prepareTeamMasks(gltf);return {gltf,sha};})();cache.set(url,promise);promise.catch(()=>cache.delete(url));}return promise;}
async function load(){const version=++loadVersion;ready=false;playing=false;el('error').hidden=true;el('status').textContent='載入與核對檔案中…';try{const entry=records[unit];const url=`${entry.base}/${entry.stem}-lod${lod}.glb`;const {gltf,sha}=await asset(url);if(version!==loadVersion)return;if(sha!==entry.hashes[lod])throw new Error('候選檔案已改變；請重新整理以重新核對版本。');if(model){scene.remove(model.root);model.dispose();}current=gltf;sourceSha=sha;sourceUrl=url;model=new ModelInstance(gltf,{url:'/assets/games/rts/models/'+unit+'.glb',status:'published'},team);scene.add(model.root);model.root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});el('name').textContent=entry.name;el('status').textContent=entry.status;el('notes').textContent=entry.notes;el('file').textContent=url.split('/').at(-1)!;el('sha').textContent=sha;let triangles=0;model.root.traverse(o=>{if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});el('triangles').textContent=Math.round(triangles).toLocaleString();chooseClip();ready=true;}catch(error){if(version!==loadVersion)return;el('error').hidden=false;el('error').textContent=error instanceof Error?error.message:String(error);el('status').textContent='載入失敗 · 不使用舊檔替代';}}
function tick(now:number){const delta=last?Math.min((now-last)/1000,.1):0;last=now;if(ready&&playing){time+=delta;if(clipName==='Death'){time=Math.min(time,duration);if(time===duration)playing=false;}else if(duration>0)time%=duration;pose();}renderer.render(scene,camera);requestAnimationFrame(tick);}requestAnimationFrame(tick);
el<HTMLSelectElement>('unit').addEventListener('change',event=>{unit=(event.target as HTMLSelectElement).value;void load();});
el<HTMLSelectElement>('lod').addEventListener('change',event=>{lod=Number((event.target as HTMLSelectElement).value);void load();});
el<HTMLSelectElement>('team').addEventListener('change',event=>{team=Number((event.target as HTMLSelectElement).value) as 0|1;void load();});
for(const id of ['view','zoom'])el(id).addEventListener('input',resize);
document.querySelectorAll<HTMLButtonElement>('[data-clip]').forEach(b=>b.addEventListener('click',()=>{clipName=b.dataset.clip!;chooseClip();}));
el('play').addEventListener('click',()=>{if(ready){if(time>=duration)time=0;playing=true;}});
el('pause').addEventListener('click',()=>{playing=false;pose();});
el<HTMLInputElement>('timeline').addEventListener('input',event=>{playing=false;time=Math.min(duration,Number((event.target as HTMLInputElement).value));pose();});
(window as any).rtsHandoffReview={state:()=>{const bones:number[]=[],teamColors=new Set<string>();model?.root.traverse(o=>{if(o instanceof THREE.Bone)bones.push(...o.matrixWorld.elements);if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(/TeamCloth/i.test(m.name))teamColors.add((m as THREE.MeshStandardMaterial).color.getHexString());});return {ready,unit,lod,team,clip:clipName,time,duration,playing,sha:sourceSha,url:sourceUrl,pose:bones,teamColors:[...teamColors],draws:renderer.info.render.calls};}};
try{const response=await fetch('./crossbow-preview.json');if(!response.ok)throw new Error('候選清單載入失敗');records=await response.json();await load();}catch(error){el('error').hidden=false;el('error').textContent=String(error);}
