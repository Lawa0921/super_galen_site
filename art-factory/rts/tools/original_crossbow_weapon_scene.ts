import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=el<HTMLCanvasElement>('stage'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
const scene=new THREE.Scene();scene.background=new THREE.Color('#202d29');
scene.add(new THREE.HemisphereLight('#f1f0dc','#728078',2.5));
const light=new THREE.DirectionalLight('#fff1db',3.5);light.position.set(-2,4,3);scene.add(light);
const fill=new THREE.DirectionalLight('#bed9ed',1.2);fill.position.set(3,1,-2);scene.add(fill);
const camera=new THREE.PerspectiveCamera(35,1,.01,20),controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.minDistance=.4;controls.maxDistance=4;controls.autoRotateSpeed=1.2;
const loader=new GLTFLoader();let model:THREE.Group|undefined,version=0,ready=false,lod=0,sha='',triangles=0;
let center=new THREE.Vector3();let records:{hashes:string[];base:string};
function reset(){camera.position.copy(center).add(new THREE.Vector3(.78,.70,1.08).multiplyScalar(Math.max(1,1/camera.aspect)));controls.target.copy(center);controls.update();}
function resize(){const b=canvas.parentElement!.getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/b.height;camera.updateProjectionMatrix();if(ready)reset();}
new ResizeObserver(resize).observe(canvas.parentElement!);resize();
async function load(){const current=++version;ready=false;el('error').hidden=true;try{
 const response=await fetch(`${records.base}/original-crossbow-grip-lod${lod}.glb`);if(!response.ok)throw Error(`HTTP ${response.status}`);
 const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==records.hashes[lod])throw Error('模型版本不符');
 const gltf=await loader.parseAsync(bytes,location.href);if(current!==version)return;
 if(model)scene.remove(model);model=gltf.scene;scene.add(model);sha=hash;triangles=0;const weapons:THREE.SkinnedMesh[]=[];
 model.traverse(o=>{if(o instanceof THREE.Mesh){o.visible=o.name.startsWith('CrossbowWeapon_');if(o.visible){weapons.push(o as THREE.SkinnedMesh);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}}});
 if(!weapons.length)throw Error('找不到原創弩');for(const weapon of weapons)weapon.skeleton.pose();model.updateMatrixWorld(true);
 const bounds=new THREE.Box3();for(const weapon of weapons){weapon.skeleton.update();bounds.union(new THREE.Box3().setFromObject(weapon,true));}center=bounds.getCenter(new THREE.Vector3());reset();
 el('triangles').textContent=String(triangles);el('sha').textContent=sha;el('status').textContent='模型本體 · 握持動作尚待修正';ready=true;
 }catch(e){el('error').hidden=false;el('error').textContent=String(e);}}
el<HTMLSelectElement>('lod').addEventListener('change',e=>{lod=Number((e.target as HTMLSelectElement).value);void load();});
el('reset').addEventListener('click',reset);el('spin').addEventListener('click',()=>{controls.autoRotate=!controls.autoRotate;el('spin').setAttribute('aria-pressed',String(controls.autoRotate));});
function tick(){controls.update();renderer.render(scene,camera);requestAnimationFrame(tick);}tick();
(window as any).weaponReview={state:()=>{const visible:string[]=[];model?.traverse(o=>{if(o instanceof THREE.Mesh&&o.visible)visible.push(o.name)});return {ready,lod,sha,triangles,visible,draws:renderer.info.render.calls,camera:camera.position.toArray(),spinning:controls.autoRotate};}};
records=await fetch('./weapon.json').then(r=>r.json());await load();
