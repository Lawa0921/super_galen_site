import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
const canvas=document.querySelector<HTMLCanvasElement>('#cloth-view')!;
const status=document.querySelector<HTMLElement>('#load-status')!;
const toggle=document.querySelector<HTMLButtonElement>('#play')!;
const slider=document.querySelector<HTMLInputElement>('#frame')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x252a30);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.01,20);
camera.position.set(.4,.84,-1.2);
const controls=new OrbitControls(camera,canvas);controls.target.set(0,.80,-.15);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xdde8ff,0x514740,2));
for(const [pos,power] of [[[1,2,-2],3],[[-1,1,1],2]] as const){const light=new THREE.DirectionalLight(0xffffff,power);light.position.set(pos[0],pos[1],pos[2]);scene.add(light);}
let mixer:THREE.AnimationMixer|undefined,root:THREE.Group|undefined,playing=true,time=0,last=performance.now(),handle=0;
const resize=new ResizeObserver(()=>{const r=canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();});resize.observe(canvas);
function seek(frame:number){time=Math.min(20,Math.max(0,frame))/30;mixer?.setTime(time);root?.updateMatrixWorld(true);slider.value=String(frame);}
toggle.addEventListener('click',()=>{playing=!playing;toggle.textContent=playing?'暫停擺動':'播放擺動';});
slider.addEventListener('input',()=>{playing=false;toggle.textContent='播放擺動';seek(Number(slider.value));});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-view]'))button.addEventListener('click',()=>{
 const positions:Record<string,[number,number,number]>={front:[0,.80,-1.25],side:[1.15,.80,-.15],angle:[.65,.90,-1.15]};camera.position.set(...positions[button.dataset.view!]);controls.target.set(0,.80,-.15);controls.update();
});
const ready=new GLTFLoader().loadAsync('./candidate/original-guard-tabard.glb').then(gltf=>{
 root=gltf.scene;scene.add(root);mixer=new THREE.AnimationMixer(root);mixer.clipAction(gltf.animations[0]).play();seek(0);
 status.textContent='3D 候選已載入 · 可拖曳旋轉、滾輪縮放';
 return gltf.animations.map(a=>({name:a.name,duration:a.duration}));
}).catch(error=>{status.textContent='3D 預覽載入失敗；可下載 GLB 檢閱。';throw error;});
function points(){const output:number[][]=[];root?.updateMatrixWorld(true);root?.traverse(obj=>{
 if(!(obj instanceof THREE.SkinnedMesh))return;obj.skeleton.update();const attr=obj.geometry.getAttribute('position');
 for(let i=0;i<attr.count;i++){const p=new THREE.Vector3().fromBufferAttribute(attr,i);obj.applyBoneTransform(i,p);p.applyMatrix4(obj.matrixWorld);output.push(p.toArray());}
});return output;}
(window as any).__tabardReview={ready,seek:(frame:number)=>{playing=false;toggle.textContent='播放擺動';seek(frame);return points();},points,
 capture:()=>{renderer.render(scene,camera);const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');return{png:canvas.toDataURL(),lost:gl.isContextLost(),error:gl.getError(),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null};}};
function tick(now:number){if(playing&&mixer){time=(time+Math.min((now-last)/1000,.05))%(20/30);mixer.setTime(time);slider.value=String(time*30);}last=now;controls.update();renderer.render(scene,camera);handle=requestAnimationFrame(tick);}handle=requestAnimationFrame(tick);
window.addEventListener('pagehide',()=>{cancelAnimationFrame(handle);resize.disconnect();controls.dispose();mixer?.stopAllAction();root?.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});renderer.dispose();},{once:true});
