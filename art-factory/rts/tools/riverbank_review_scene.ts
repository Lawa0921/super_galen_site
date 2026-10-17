import * as THREE from 'three';
import {ModelLibrary,ModelInstance} from '../../../src/scripts/games/rts/models';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {Battlefield} from '../../../src/scripts/games/rts/scene';
import {stepGame} from '../../../src/scripts/games/rts/simulation';
import {getTeamView,updateVisibility} from '../../../src/scripts/games/rts/visibility';
import {createMap} from '../../../src/scripts/games/rts/maps';
import {createMap as createBaselineMap} from './riverbank_baseline_layout';
import {createState} from '../../../src/scripts/games/rts/state';
import {issueCommand} from '../../../src/scripts/games/rts/commands';
import type {GameState,Unit} from '../../../src/scripts/games/rts/types';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const library=new ModelLibrary();let battlefield:Battlefield|undefined,map:'river'|'pass'='river',candidate=true,reveal=true,ready=false,version=0;
let bridge:GLTF|undefined;
// The new view uses the actual runtime. Only the frozen before-view overrides the old bridge.
const reviewLibrary={terrain:library.terrain.bind(library),instantiate:(id:string,team:0|1|-1=0,ghost=false)=>!candidate&&id==='stone-bridge'&&bridge?new ModelInstance(bridge,{url:'./models/stone-bridge-baseline.glb',status:'published'},team,ghost):library.instantiate(id,team,ghost)} as ModelLibrary;
let state:GameState,scouted=false,walking=false,walker:Unit|undefined,accumulator=0,lastTime=0;
let terrainMesh:THREE.Mesh|undefined;
let view:ReturnType<typeof getTeamView>;
function refreshView(){view=getTeamView(state,0);if(reveal||scouted){view.visible.fill(reveal?1:0);view.explored.fill(1);view.resources=state.resources;}}
function camera(){if(!battlefield)return;const kind=el<HTMLSelectElement>('view').value;
 const target=kind==='south'?{x:48,z:68}:kind==='bank'?{x:48,z:40}:kind==='north'?{x:48,z:28}:{x:48,z:48};
 battlefield.focus(target);battlefield.zoom(-100);battlefield.zoom(kind==='overview'?58:kind==='bank'?0:14);
}
async function load(){const request=++version;ready=false;el('status').textContent='載入實際場景中…';
 try{await library.load(()=>{},map);if(request!==version)return;if(!candidate&&map==='river'&&!bridge)bridge=await new GLTFLoader().loadAsync('./models/stone-bridge-baseline.glb');if(request!==version)return;if(battlefield){battlefield.dispose();for(const id of ['world','overlay']){const old=el(id);old.replaceWith(old.cloneNode());}}const layout=candidate?createMap(map):createBaselineMap(map);
  state=createState(layout,20261007);updateVisibility(state);walking=false;walker=undefined;accumulator=0;refreshView();
  battlefield=new Battlefield(el<HTMLCanvasElement>('world'),el<HTMLCanvasElement>('overlay'),state.map,reviewLibrary);terrainMesh=battlefield.scene.children.find(o=>o instanceof THREE.Mesh&&o.rotation.x===-Math.PI/2&&o.position.y===0) as THREE.Mesh;camera();
  el('name').textContent=map==='river'?'雙河谷地':'灰脊隘口';el('status').textContent=candidate?'目前遊戲中的地景':'改版前的地景';el('walk').toggleAttribute('disabled',map!=='river');el('error').hidden=true;ready=true;
 }catch(e){el('error').hidden=false;el('error').textContent=`場景載入失敗：${String(e)}。可切換地圖重試。`;}
}
function tick(time:number){const dt=Math.min(.1,(time-lastTime)/1000);lastTime=time;if(ready&&battlefield){
 if(walking){accumulator+=dt;while(accumulator>=.05){stepGame(state);accumulator-=.05;}refreshView();if(walker&&Math.hypot(walker.x-54,walker.z-(el<HTMLSelectElement>('view').value==='south'?68:28))<.4){walking=false;el('status').textContent='過橋完成 · 使用實際移動與尋路';}}
 battlefield.render(view,dt);el('pieces').textContent=String((terrainMesh?.geometry.index?.count??0)/3);el('batches').textContent='1';
 }requestAnimationFrame(tick);}requestAnimationFrame(tick);
el('map').addEventListener('change',()=>{map=el<HTMLSelectElement>('map').value as typeof map;void load();});el('view').addEventListener('change',camera);
for(const [id,value] of [['candidate',true],['original',false]] as const)el(id).addEventListener('click',()=>{candidate=value;el('candidate').setAttribute('aria-pressed',String(value));el('original').setAttribute('aria-pressed',String(!value));void load();});
for(const id of ['reveal','fog','scouted'])el(id).addEventListener('click',()=>{reveal=id==='reveal';scouted=id==='scouted';for(const mode of ['reveal','fog','scouted'])el(mode).setAttribute('aria-pressed',String(mode===id));void load();});
el('walk').addEventListener('click',async()=>{if(map!=='river')return;await load();if(!ready)return;
 const south=el<HTMLSelectElement>('view').value==='south';el<HTMLSelectElement>('view').value=south?'south':'north';camera();battlefield!.zoom(-14);
 // Controlled movement fixture: isolate a real unit from combat and keep the normal command/simulation path.
 state.aiEnabled=[false,false];state.entities=state.entities.filter(e=>e.team!==-1);walker=state.entities.find((e):e is Unit=>e.category==='unit'&&e.kind==='worker'&&e.team===0)!;
 walker.x=42;walker.z=south?68:28;updateVisibility(state);battlefield!.selection=[walker.id];
 const result=issueCommand(state,0,{type:'move',unitIds:[walker.id],position:{x:54,z:walker.z}});walking=result.ok;refreshView();el('status').textContent=walking?'工人過橋檢查中…':'移動指令失敗';
});
function bridgeProbe(){if(!battlefield||map!=='river')return [];const result:unknown[]=[];
 for(const item of (battlefield as any).props)if([28,68].includes(item.point.z)&&item.point.x===48){const root=item.instance.root;root.updateMatrixWorld(true);const heights:number[]=[],raised:unknown[]=[];
  for(const z of [-2,0,2])for(let x=44.5;x<=51.5;x+=.5){const hit=new THREE.Raycaster(new THREE.Vector3(x,10,item.point.z+z),new THREE.Vector3(0,-1,0)).intersectObject(root,true)[0];heights.push(hit?.point.y??NaN);if(hit&&hit.point.y>.04)raised.push({x,z,y:hit.point.y,mesh:hit.object.name});}
  result.push({z:item.point.z,samples:heights.length,min:Math.min(...heights),max:Math.max(...heights),finite:heights.every(Number.isFinite),raised});
 }return result;
}
(window as any).riverbankReview={bridgeProbe,state:()=>({ready,map,candidate,reveal,scouted,walking,walker:walker?{x:walker.x,z:walker.z}:null,pieces:Number(el('pieces').textContent),batches:Number(el('batches').textContent),draws:battlefield?.renderer.info.render.calls,triangles:battlefield?.renderer.info.render.triangles})};
window.addEventListener('pagehide',()=>{
 battlefield?.dispose();library.dispose();
 bridge?.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v instanceof THREE.Texture)v.dispose();m.dispose();}}});
});
await load();
