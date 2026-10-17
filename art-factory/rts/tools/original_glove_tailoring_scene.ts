import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=el<HTMLCanvasElement>('stage'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#26342e');scene.add(new THREE.HemisphereLight('#fff3dd','#314a3f',1.7));
for(const [color,intensity,position] of [['#fff1dd',3,[-1,2,3]],['#bacddc',1.3,[2,1,-1]]] as const){const light=new THREE.DirectionalLight(color,intensity);light.position.set(position[0],position[1],position[2]);scene.add(light);}
const clayMaterial=new THREE.MeshStandardMaterial({color:'#a0adb0',roughness:.65});
const camera=new THREE.PerspectiveCamera(33,1,.001,10),loader=new GLTFLoader();
const views:Record<string,THREE.Vector3>={palm:new THREE.Vector3(0,.075,.40),back:new THREE.Vector3(0,.075,-.40),side:new THREE.Vector3(.4,.075,0),threequarter:new THREE.Vector3(.24,.18,.33)};
let root:THREE.Group|undefined,mixer:THREE.AnimationMixer|undefined,action:THREE.AnimationAction|undefined;
let ready=false,playing=false,time=0,duration=2,side='r',lod=0,revision='current',clay=false,sha='',version=0,last=0,triangles=0;
function resize(){const bounds=canvas.parentElement!.getBoundingClientRect();renderer.setSize(bounds.width,bounds.height,false);camera.aspect=bounds.width/bounds.height;camera.position.copy(views[el<HTMLSelectElement>('view').value]);camera.lookAt(0,.068,0);camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(canvas.parentElement!);resize();
function pose(){if(!action||!mixer||!root)return;action.time=time;mixer.update(0);root.updateWorldMatrix(true,true);el<HTMLInputElement>('timeline').value=String(time);el('clock').textContent=`${time.toFixed(2)} / ${duration.toFixed(2)} 秒`;}
function release(group:THREE.Group){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){(m as THREE.MeshStandardMaterial).map?.dispose();m.dispose();}}});}
async function load(){
 const request=++version;ready=false;playing=false;el('error').hidden=true;
 try{
  const name=`glove-${side}-lod${lod}.glb`,key=`${revision}/${name}`;
  const response=await fetch('./models/'+key);if(!response.ok)throw Error('模型載入失敗');
  const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==manifest[key])throw Error('模型版本與清單不符');
  const gltf=await loader.parseAsync(bytes,location.href);if(request!==version){release(gltf.scene);return;}
  const clip=gltf.animations.find(c=>c.name==='OpenClose');if(!clip){release(gltf.scene);throw Error('缺少原創開合動作');}
  mixer?.stopAllAction();if(root){scene.remove(root);release(root);}
  root=gltf.scene;scene.add(root);mixer=new THREE.AnimationMixer(root);action=mixer.clipAction(clip);action.play();action.paused=true;
  duration=clip.duration;time=Math.min(time,duration);sha=hash;triangles=0;root.traverse(o=>{if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  el('file').textContent=key;el('sha').textContent=sha;el('triangles').textContent=String(triangles);el('name').textContent=`${revision==='current'?'掌面與指形修整':'前一版開合基礎'} · ${side==='r'?'右手':'左手'}`;
  el<HTMLInputElement>('timeline').max=String(duration);pose();ready=true;
 }catch(e){if(request===version){el('error').hidden=false;el('error').textContent=String(e);}}
}
el('play').addEventListener('click',()=>{if(ready)playing=true;});el('pause').addEventListener('click',()=>{playing=false;pose();});
el<HTMLInputElement>('timeline').addEventListener('input',e=>{playing=false;time=Number((e.target as HTMLInputElement).value);pose();});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-frame]'))button.addEventListener('click',()=>{playing=false;time=Number(button.dataset.frame)/24;pose();});
el('view').addEventListener('change',resize);
el<HTMLSelectElement>('surface').addEventListener('change',e=>{clay=(e.target as HTMLSelectElement).value==='clay';scene.overrideMaterial=clay?clayMaterial:null;});
el<HTMLSelectElement>('side').addEventListener('change',e=>{side=(e.target as HTMLSelectElement).value;void load();});
el<HTMLSelectElement>('lod').addEventListener('change',e=>{lod=Number((e.target as HTMLSelectElement).value);void load();});
el<HTMLSelectElement>('revision').addEventListener('change',e=>{revision=(e.target as HTMLSelectElement).value;void load();});
function tick(now:number){const delta=last?Math.min((now-last)/1000,.1):0;last=now;if(ready&&playing){time=(time+delta)%duration;pose();}renderer.render(scene,camera);requestAnimationFrame(tick);}requestAnimationFrame(tick);
(window as any).gloveReview={state:()=>{const bones:number[]=[];root?.traverse(o=>{if(o instanceof THREE.Bone)bones.push(...o.matrixWorld.elements);});return {ready,side,lod,revision,clay,sha,time,duration,playing,triangles,boneCount:bones.length/16,pose:bones};}};
const manifest:Record<string,string>=await (await fetch('./manifest.json')).json();await load();
