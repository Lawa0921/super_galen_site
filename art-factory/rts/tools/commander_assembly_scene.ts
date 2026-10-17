/** Factory review only. No game runtime import and no audio. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
import {prepareTeamMasks} from '../../../src/scripts/games/rts/team-material';
const run='/art-factory/rts/runs/commander-assembly/2026-10-14-v1';
const manager=new THREE.LoadingManager();
manager.setURLModifier(url=>url.includes('/materials/')?'/assets/games/rts/materials/'+url.split('/materials/')[1]:url);
const loader=new GLTFLoader(manager);
const all=await Promise.all(['raw/before','candidate'].flatMap(dir=>[0,1].map(lod=>loader.loadAsync(`${run}/${dir}/commander-lod${lod}.glb`))));
await Promise.all(all.map(g=>prepareTeamMasks(g)));
const scene=new THREE.Scene();scene.background=new THREE.Color('#202a2e');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1400,820);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;document.querySelector('main')!.append(renderer.domElement);
const camera=new THREE.OrthographicCamera(-2.65,2.65,1.55,-1.55,.01,60);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1,0);
scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(15,65,26);scene.add(sun);
const fill=new THREE.DirectionalLight('#c9d8e5',1.0);fill.position.set(-4,3,-5);scene.add(fill);
let models:ModelInstance[]=[];let team=0,lod=0,clip='Idle',fraction=0,playing=false,wristFocus=false;
const clipInput=document.querySelector<HTMLSelectElement>('#clip')!;
clipInput.innerHTML=all[0].animations.map(a=>`<option>${a.name}</option>`).join('');clipInput.value='Idle';
function recreate(){for(const m of models){scene.remove(m.root);m.dispose();}models=[0,1].map(i=>{const m=new ModelInstance(all[i*2],{url:'review',status:'published'},team as 0|1,false,all[i*2+1]);m.root.position.x=i?-1.05:1.05;scene.add(m.root);return m;});}
recreate();
function alignComparison(){if(wristFocus)return;const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);models.forEach((m,i)=>m.root.position.copy(right).multiplyScalar(i?1.05:-1.05));}
controls.addEventListener('change',alignComparison);
function pose(name=clip,phase=fraction){clip=name;fraction=phase;for(const model of models){model.setDetailPixels(lod?25:100);for(const v of (model as any).variants){if(v.sharedPose)continue;const c=v.clips.find((a:THREE.AnimationClip)=>a.name===clip);v.mixer.stopAllAction();const action=v.mixer.clipAction(c);action.reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();action.time=c.duration*fraction;action.paused=true;v.mixer.update(0);}}scene.updateMatrixWorld(true);}
function view(name:string){const points:Record<string,number[]>={'three-quarter':[2.2,2.1,-6],front:[0,1.45,-6],back:[0,1.45,6],side:[6,1.45,0],game:[4,6,-7]};camera.position.fromArray(points[name]);controls.target.set(0,1,0);controls.update();alignComparison();}
view('three-quarter');
function draw(){renderer.render(scene,camera);}
function set(options:{clip?:string;fraction?:number;lod?:number;team?:number;view?:string;zoom?:number}){if(options.team!==undefined&&options.team!==team){team=options.team;recreate();}if(options.lod!==undefined)lod=options.lod;if(options.view)view(options.view);if(options.zoom){camera.zoom=options.zoom;camera.updateProjectionMatrix();}pose(options.clip??clip,options.fraction??fraction);clipInput.value=clip;(document.getElementById('time') as HTMLInputElement).value=String(fraction*100);(document.getElementById('lod') as HTMLSelectElement).value=String(lod);(document.getElementById('team') as HTMLSelectElement).value=String(team);if(options.view)(document.getElementById('view') as HTMLSelectElement).value=options.view;draw();return {clip,fraction,lod,team,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,contextLost:renderer.getContext().isContextLost()};}
function sweep(){
  const rows:any[]=[];
  for(lod=0;lod<2;lod++)for(const c of all[0].animations){
    const floor={Longsword:Infinity,DawnShield:Infinity};
    for(let f=0;f<=60;f++){
      pose(c.name,f/60);
      models[1].root.traverse(o=>{
        if(!(o instanceof THREE.SkinnedMesh))return;
        let visible=true,part:keyof typeof floor|undefined;
        for(let p:THREE.Object3D|null=o;p;p=p.parent){
          visible&&=p.visible;
          for(const name of ['Longsword','DawnShield'] as const)if(p.name.includes('Commander'+name))part=name;
        }
        if(!visible||!part)return;o.skeleton.update();const v=new THREE.Vector3();
        for(let i=0;i<o.geometry.attributes.position.count;i++){
          o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);floor[part]=Math.min(floor[part],v.y);
        }
      });
    }
    for(const [part,minimum] of Object.entries(floor)){
      if(!Number.isFinite(minimum)||minimum<-.002)throw new Error(`${c.name} LOD${lod} ${part} floor ${minimum}`);
      rows.push({lod,clip:c.name,part,minimumFloor:minimum,samples:61});
    }
  }
  set({clip:'Idle',fraction:0,lod:0});return rows;
}
function focusPart(detail:number,name:string,phase:number,side='R',angle='outer'){
  set({clip:name,fraction:phase,lod:detail,team:0,view:'three-quarter',zoom:1});
  wristFocus=true;models[0].root.visible=false;models[1].root.position.set(0,0,0);scene.updateMatrixWorld(true);
  const box=new THREE.Box3();const point=new THREE.Vector3();
  models[1].root.traverse(o=>{
    if(!(o instanceof THREE.SkinnedMesh))return;let visible=true,hand=false;
    for(let p:THREE.Object3D|null=o;p;p=p.parent){visible&&=p.visible;hand||=side==='all'||p.name.includes('CommanderClosedGrip_'+side);}
    if(!visible||!hand)return;o.skeleton.update();
    for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,point).applyMatrix4(o.matrixWorld);box.expandByPoint(point);}
  });
  if(box.isEmpty())throw new Error('No posed candidate wrist');
  const center=box.getCenter(new THREE.Vector3());
  const offset=angle==='back'?new THREE.Vector3(-1,1,3):angle==='top'?new THREE.Vector3(.3,4,.3):new THREE.Vector3(side==='L'?-3:3,1,-1);
  camera.position.copy(center).add(offset);controls.target.copy(center);camera.zoom=side==='all'?1.8:5.5;camera.updateProjectionMatrix();
  // OrbitControls' normal comparison alignment is intentionally skipped here.
  camera.lookAt(center);models[1].root.position.set(0,0,0);draw();
  return {center:center.toArray(),bounds:[box.min.toArray(),box.max.toArray()]};
}
(window as any).assemblyReview={set,sweep,focusPart,clips:all[0].animations.map(a=>a.name)};
for(const id of ['clip','lod','team','view'])document.getElementById(id)!.addEventListener('change',()=>set({clip:clipInput.value,lod:Number((document.getElementById('lod') as HTMLSelectElement).value),team:Number((document.getElementById('team') as HTMLSelectElement).value),view:(document.getElementById('view') as HTMLSelectElement).value}));
document.getElementById('time')!.addEventListener('input',e=>{playing=false;set({fraction:Number((e.target as HTMLInputElement).value)/100});});
document.getElementById('play')!.addEventListener('click',()=>{playing=!playing;document.getElementById('play')!.textContent=playing?'暫停動作':'播放動作';});
let last=performance.now();function animate(now:number){if(playing){const c=all[0].animations.find(a=>a.name===clip)!;fraction=(fraction+(now-last)/1000/c.duration)%1;pose();(document.getElementById('time') as HTMLInputElement).value=String(fraction*100);}last=now;controls.update();draw();requestAnimationFrame(animate);}pose();requestAnimationFrame(animate);
