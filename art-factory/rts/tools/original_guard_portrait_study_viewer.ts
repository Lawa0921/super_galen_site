import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
const canvas=document.querySelector<HTMLCanvasElement>('#portrait-view')!,status=document.querySelector<HTMLElement>('#load-status')!;
const toggle=document.querySelector<HTMLButtonElement>('#play')!,slider=document.querySelector<HTMLInputElement>('#frame')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x252a30);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.01,20);camera.position.set(.03,1.68,-.9);
const controls=new OrbitControls(camera,canvas);controls.target.set(0,1.66,0);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xdde8ff,0x514740,2));
for(const [position,power] of [[[1,3,-2],3],[[-1,2,1],2]] as const){const light=new THREE.DirectionalLight(0xffffff,power);light.position.set(position[0],position[1],position[2]);scene.add(light);}
let root:THREE.Group|undefined,mixer:THREE.AnimationMixer|undefined,playing=true,time=0,last=performance.now(),handle=0;
const resize=new ResizeObserver(()=>{const r=canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();});resize.observe(canvas);
function seek(frame:number){time=Math.min(120,Math.max(0,frame))/30;mixer?.setTime(time);root?.updateMatrixWorld(true);slider.value=String(frame);}
function pause(){playing=false;toggle.textContent='播放肖像';}
toggle.addEventListener('click',()=>{playing=!playing;toggle.textContent=playing?'暫停肖像':'播放肖像';});
slider.addEventListener('input',()=>{pause();seek(Number(slider.value));});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-view]'))button.addEventListener('click',()=>{const positions:Record<string,[number,number,number]>={front:[.03,1.68,-.9],side:[.9,1.68,0],back:[0,1.68,.9]};camera.position.set(...positions[button.dataset.view!]);controls.target.set(0,1.66,0);controls.update();});
const ready=new GLTFLoader().loadAsync('./candidate/original-guard-portrait-study.glb').then(gltf=>{root=gltf.scene;scene.add(root);mixer=new THREE.AnimationMixer(root);mixer.clipAction(gltf.animations[0]).play();seek(0);status.textContent='原創頭胸骨架已載入 · 可旋轉、暫停與逐幀檢視';return gltf.animations.map(a=>({name:a.name,duration:a.duration}));}).catch(error=>{status.textContent='肖像預覽載入失敗；請重新載入或下載候選檔。';throw error;});
function points(){const values:number[][]=[];root?.updateMatrixWorld(true);root?.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh))return;o.skeleton.update();const attr=o.geometry.getAttribute('position');for(let i=0;i<attr.count;i++){const p=new THREE.Vector3().fromBufferAttribute(attr,i);o.applyBoneTransform(i,p);p.applyMatrix4(o.matrixWorld);values.push(p.toArray());}});return values;}
(window as any).__portraitReview={ready,seek:(frame:number)=>{pause();seek(frame);return points();},points,
 framing:()=>{const p=points().filter(p=>p[1]>=1.59&&Math.abs(p[0])<.145).map(p=>new THREE.Vector3(p[0],p[1],p[2]).project(camera));return{minX:Math.min(...p.map(v=>v.x)),maxX:Math.max(...p.map(v=>v.x)),minY:Math.min(...p.map(v=>v.y)),maxY:Math.max(...p.map(v=>v.y))};},
 capture:()=>{renderer.render(scene,camera);return canvas.toDataURL();}};
function tick(now:number){if(playing&&mixer){time=(time+Math.min((now-last)/1000,.05))%4;mixer.setTime(time);slider.value=String(time*30);}last=now;controls.update();renderer.render(scene,camera);handle=requestAnimationFrame(tick);}handle=requestAnimationFrame(tick);
window.addEventListener('pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(handle);resize.disconnect();controls.dispose();mixer?.stopAllAction();root?.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});renderer.dispose();});
