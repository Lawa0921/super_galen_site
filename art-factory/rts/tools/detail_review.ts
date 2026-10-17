import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {prepareTeamMasks,configureTeamMaterial} from '../../../src/scripts/games/rts/team-material';

const assets=await (await fetch('./assets.json')).json() as string[];
const select=document.querySelector<HTMLSelectElement>('#asset')!,clipSelect=document.querySelector<HTMLSelectElement>('#clip')!;
const labels:Record<string,string>={townhall:'領主府','townhall-tier2':'王廷','townhall-tier3':'王城',altar:'誓約祭壇',barracks:'兵營',chapel:'禮拜堂',forge:'鍛造所',house:'民居',lumbermill:'伐木場',stable:'馬廄',tower:'守望塔',workshop:'工坊',rock:'岩石','stone-bridge':'石橋',guard:'衛兵',crossbow:'弩兵'};
for(const asset of assets)select.add(new Option((labels[asset.replace('-lod1','')]??asset)+(asset.endsWith('-lod1')?'（遠景模型）':''),asset));
const panels=['before','after'].map(version=>{
  const canvas=document.querySelector<HTMLCanvasElement>(`#${version}`)!;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#28312f');
  scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
  const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(-8,20,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-12;sun.shadow.camera.right=sun.shadow.camera.top=12;sun.shadow.camera.far=60;sun.shadow.bias=-.0005;sun.shadow.normalBias=.035;scene.add(sun);
  const camera=new THREE.PerspectiveCamera(32,canvas.clientWidth/canvas.clientHeight,.01,200);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=false;
  return {version,renderer,scene,camera,controls,sun,unit:false,root:null as THREE.Object3D|null,mixer:null as THREE.AnimationMixer|null,clips:[] as THREE.AnimationClip[],size:1};
});
let sync=false;
for(const panel of panels)panel.controls.addEventListener('change',()=>{
  if(sync)return;sync=true;for(const other of panels)if(other!==panel){other.camera.position.copy(panel.camera.position);other.camera.quaternion.copy(panel.camera.quaternion);other.controls.target.copy(panel.controls.target);other.controls.update();}sync=false;
});
let paused=false,currentClip='Idle';
async function load(asset:string){
  (window as any).detailReady=false;select.value=asset;
  await Promise.all(panels.map(async p=>{
    if(p.root){p.scene.remove(p.root);p.mixer?.stopAllAction();const textures=new Set<THREE.Texture>();p.root.traverse((o:any)=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);if(m.userData.teamTintTexture instanceof THREE.Texture)textures.add(m.userData.teamTintTexture);m.dispose();}}});textures.forEach(t=>t.dispose());}
    const gltf=await new GLTFLoader().loadAsync(`./${p.version}/${asset}.glb`);await prepareTeamMasks(gltf);
    p.root=gltf.scene;p.scene.add(p.root);p.root.traverse((o:any)=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;
      for(const mat of Array.isArray(o.material)?o.material:[o.material])if(/TeamCloth/i.test(mat.name))configureTeamMaterial(mat,0,mat.userData.teamTintTexture);
    });
    p.mixer=new THREE.AnimationMixer(p.root);p.clips=gltf.animations;
    const bounds=new THREE.Box3().setFromObject(p.root),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    p.unit=/^(guard|crossbow)/.test(asset);p.sun.position.z=p.unit?-12:12;
    p.size=Math.max(size.x,size.y,size.z);p.controls.target.copy(center);p.camera.position.copy(center).add((p.unit?new THREE.Vector3(-.95,.35,-1.28):new THREE.Vector3(.95,.7,1.28)).multiplyScalar(p.size*1.5));p.controls.update();
  }));
  play('Idle');(window as any).detailReady=true;
}
function play(clip:string){currentClip=clip;clipSelect.value=clip;for(const p of panels){p.mixer?.stopAllAction();const found=p.clips.find(c=>c.name===clip);if(found)p.mixer!.clipAction(found).reset().play();}}
function frame(time:number){paused=true;document.querySelector('#pause')!.textContent='播放';for(const p of panels)p.mixer?.setTime(time);}
select.addEventListener('change',()=>void load(select.value));clipSelect.addEventListener('change',()=>play(clipSelect.value));
document.querySelector('#pause')!.addEventListener('click',()=>{paused=!paused;document.querySelector('#pause')!.textContent=paused?'播放':'暫停';});
document.querySelector('#front')!.addEventListener('click',()=>{for(const p of panels){p.camera.position.copy(p.controls.target).add(new THREE.Vector3(0,p.size*.15,p.size*2.7*(p.unit?-1:1)));p.controls.update();}});
document.querySelector('#back')!.addEventListener('click',()=>{for(const p of panels){p.camera.position.copy(p.controls.target).add(new THREE.Vector3(-.8,.5,1.2*(p.unit?1:-1)).multiplyScalar(p.size*1.7));p.controls.update();}});
let last=performance.now();function tick(now:number){const dt=Math.min(.05,(now-last)/1000);last=now;for(const p of panels){if(!paused)p.mixer?.update(dt);p.renderer.render(p.scene,p.camera);}requestAnimationFrame(tick);}requestAnimationFrame(tick);
(window as any).detailReview={load,play,frame,panels};await load(assets[0]);
