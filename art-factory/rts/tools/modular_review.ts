import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {prepareTeamMasks,configureTeamMaterial} from '../../../src/scripts/games/rts/team-material';
type Part={category:string;collection:string;used_by:string[];mesh_count:number;triangles:number;materials:string[]};
const kit=await(await fetch('./kit.json')).json() as {parts:Record<string,Part>;recipes:{id:string}[]};
const names:Record<string,string>={townhall:'領主府','townhall-tier2':'二階主城','townhall-tier3':'三階主城',house:'民居',barracks:'兵營',stable:'馬廄',workshop:'工坊',forge:'鍛造所',altar:'祭壇',chapel:'禮拜堂',tower:'守望塔',lumbermill:'伐木場','stone-bridge':'石橋'};
const categories:Record<string,string>={window:'窗組',door:'門組',roof:'屋頂',foundation:'基座',structure:'結構',ornament:'裝飾','bridge-deck':'橋面段','bridge-parapet':'護欄段','bridge-arch':'橋拱','bridge-pier':'橋墩'};
const select=document.querySelector<HTMLSelectElement>('#asset')!,partSelect=document.querySelector<HTMLSelectElement>('#part')!,slider=document.querySelector<HTMLInputElement>('#explode')!;
for(const r of kit.recipes)select.add(new Option(names[r.id]??r.id,r.id));
const canvas=document.querySelector<HTMLCanvasElement>('canvas')!,renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#202c2d');scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(-8,20,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16,far:70});sun.shadow.bias=-.0005;sun.shadow.normalBias=.035;scene.add(sun);
const camera=new THREE.PerspectiveCamera(36,1,.01,250),controls=new OrbitControls(camera,canvas);
let root:THREE.Object3D|undefined,groups:THREE.Object3D[]=[],extent=8,lastExplode=0;
const directions=new Map<THREE.Object3D,THREE.Vector3>();
function fit(target:THREE.Object3D){const b=new THREE.Box3().setFromObject(target),size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());extent=Math.max(size.x,size.y,size.z);controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(1,.75,1.3).multiplyScalar(extent*1.35));controls.update();}
function apply(){
 for(const group of groups){group.visible=!partSelect.value||group.name===partSelect.value;group.position.copy(directions.get(group)!).multiplyScalar(partSelect.value?0:Number(slider.value)*extent*.55);}
 const chosen=groups.find(g=>g.name===partSelect.value),details=document.querySelector('#details')!;
 if(chosen){const id=chosen.userData.part_id as string,p=kit.parts[id];details.textContent=`${categories[p.category]??p.category} · ${p.mesh_count} 個原始物件 · ${p.triangles.toLocaleString()} 三角面\n共用於：${p.used_by.map(id=>names[id]??id).join('、')}\n零件：${id}\n材質：${p.materials.join('、')}`;}
 else details.textContent=`${groups.length} 個組裝位置，引用 ${new Set(groups.map(g=>g.userData.part_id)).size} 種零件。拖曳旋轉；拆解滑桿顯示部件關係。`;
 (window as any).modularReady=true;
}
async function load(id:string){
 (window as any).modularReady=false;select.value=id;
 if(root){scene.remove(root);const textures=new Set<THREE.Texture>();root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);m.dispose();}}});textures.forEach(t=>t.dispose());}
 const gltf=await new GLTFLoader().loadAsync(`./models/${id}.glb`);await prepareTeamMasks(gltf);root=gltf.scene;scene.add(root);groups=[];directions.clear();
 root.traverse(o=>{if(o.userData.part_id)groups.push(o);if(o instanceof THREE.Mesh){o.castShadow=o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material])if(/TeamCloth/i.test(m.name))configureTeamMaterial(m,0,m.userData.teamTintTexture);}});
 const center=new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
 partSelect.replaceChildren(new Option('整體組裝',''));
 for(const group of groups){const part=kit.parts[group.userData.part_id as string],direction=new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3()).sub(center);
  if(part.category==='roof')direction.y=Math.max(2,direction.y);if(part.category==='foundation')direction.set(0,-1,0);if(part.category==='structure')direction.set(0,0,0);else direction.normalize();directions.set(group,direction);
  partSelect.add(new Option(`${categories[part.category]??part.category} · ${group.name}${part.used_by.length>1?'（共用）':''}`,group.name));
 }
 slider.value='0';lastExplode=0;fit(root);apply();document.querySelector<HTMLAnchorElement>('#recipe')!.href=`./recipes/${id}.json`;
}
select.addEventListener('change',()=>void load(select.value));slider.addEventListener('input',()=>{const value=Number(slider.value);camera.position.sub(controls.target).multiplyScalar((1+value*.8)/(1+lastExplode*.8)).add(controls.target);lastExplode=value;controls.update();apply();});partSelect.addEventListener('change',()=>{slider.value='0';lastExplode=0;apply();const chosen=groups.find(g=>g.name===partSelect.value);if(chosen)fit(chosen);else if(root)fit(root);});
document.querySelector('#reset')!.addEventListener('click',()=>{partSelect.value='';slider.value='0';lastExplode=0;apply();if(root)fit(root);});
function resize(){renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(canvas);resize();
function tick(){renderer.render(scene,camera);requestAnimationFrame(tick);}tick();
(window as any).modularReview={load,groups:()=>groups,kit};await load('townhall-tier2');
