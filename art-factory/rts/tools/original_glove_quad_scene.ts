import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const canvas=document.querySelector<HTMLCanvasElement>('#stage')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#26342e');scene.overrideMaterial=new THREE.MeshStandardMaterial({color:'#82928c',roughness:.72});scene.add(new THREE.HemisphereLight('#fff3dd','#314a3f',1.5));
for(const [color,intensity,position] of [['#fff1dd',2.5,[-2,3,4]],['#bacddc',1.4,[3,1,-2]]] as const){const light=new THREE.DirectionalLight(color,intensity);light.position.set(position[0],position[1],position[2]);scene.add(light);}
const camera=new THREE.PerspectiveCamera(35,1,.01,30),controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.enablePan=false;controls.minDistance=2.5;controls.maxDistance=8;controls.autoRotateSpeed=1;
const views:Record<string,THREE.Vector3>={palm:new THREE.Vector3(0,0,4.8),back:new THREE.Vector3(0,0,-4.8),side:new THREE.Vector3(4.8,0,0),threequarter:new THREE.Vector3(3,1.2,4)};
let ready=false,sha='',triangles=0,bones=0,last=0,validNormalVertices=0;
function view(name:string){controls.autoRotate=false;document.querySelector<HTMLInputElement>('#rotate')!.checked=false;camera.position.copy(views[name]);controls.target.set(0,0,0);controls.update();}
function resize(){const box=canvas.parentElement!.getBoundingClientRect();renderer.setSize(box.width,box.height,false);camera.aspect=box.width/box.height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(canvas.parentElement!);resize();view('threequarter');
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-view]'))button.addEventListener('click',()=>view(button.dataset.view!));
document.querySelector<HTMLInputElement>('#rotate')!.addEventListener('change',e=>{controls.autoRotate=(e.target as HTMLInputElement).checked;});
function frame(now:number){const delta=last?Math.min((now-last)/1000,.1):0;last=now;controls.update(delta);renderer.render(scene,camera);requestAnimationFrame(frame);}requestAnimationFrame(frame);
(window as any).quadReview={state:()=>({ready,sha,triangles,bones,validNormalVertices,camera:camera.position.toArray(),rotating:controls.autoRotate})};
try{
 const manifest=await (await fetch('./manifest.json')).json();const response=await fetch('./source.glb');if(!response.ok)throw Error('模型載入失敗');
 const bytes=await response.arrayBuffer();sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(sha!==manifest.sha256)throw Error('模型版本與清單不符');
 const gltf=await new GLTFLoader().parseAsync(bytes,location.href);const box=new THREE.Box3(new THREE.Vector3(...manifest.framing.min),new THREE.Vector3(...manifest.framing.max)),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const scale=2/Math.max(size.x,size.y,size.z);
 gltf.scene.position.sub(center);const group=new THREE.Group();group.add(gltf.scene);group.scale.setScalar(scale);scene.add(group);
 gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){
  triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
  // Shape-only GLB has positions/indices but no NORMAL. The review material
  // needs derived normals; keep the original mesh bytes and positions intact.
  if(!o.geometry.getAttribute('normal'))o.geometry.computeVertexNormals();
  const normals=o.geometry.getAttribute('normal');
  if(normals)for(let i=0;i<normals.count;i++){const length=Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i));if(length>.9&&length<1.1)validNormalVertices++;}
 }if(o instanceof THREE.Bone)bones++;});
 document.querySelector('#triangles')!.textContent=triangles.toLocaleString('zh-TW');document.querySelector('#status')!.textContent='原創低模基底 · 尚未綁骨';ready=true;
}catch(error){const message=document.querySelector<HTMLParagraphElement>('#error')!;message.hidden=false;message.textContent=String(error);}
