/** Dev-only close-up model inspection room. Never imported by the game bundle. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelLibrary,ModelInstance} from './models';
import {prepareTeamMasks} from './team-material';
import {RUBBLE_MODELS} from './building-collapse';
import type {TeamId} from './catalog';
import {groupModels,summarizeModel,viewPreset,clipLabel,modelDisplayName,isPreviewModel,previewLabel,type ModelStats,type ViewPreset} from './model-viewer-data';

interface Variant {root:THREE.Object3D;mixer:THREE.AnimationMixer;clips:THREE.AnimationClip[];sharedPose?:boolean}
/** ModelInstance keeps its LOD variants private; the factory review tools read them the same way. */
const variantsOf=(model:ModelInstance)=>(model as unknown as {variants:Variant[]}).variants;

export async function mountModelViewer(root:HTMLElement):Promise<void> {
  const q=<T extends HTMLElement>(selector:string)=>{const el=root.querySelector<T>(selector);if(!el)throw new Error('Missing '+selector);return el;};
  const canvas=q<HTMLCanvasElement>('#rmv-canvas'),status=q('#rmv-status'),list=q('#rmv-models'),info=q('#rmv-info'),title=q('#rmv-title');
  const clipSelect=q<HTMLSelectElement>('#rmv-clip'),play=q<HTMLButtonElement>('#rmv-play'),phase=q<HTMLInputElement>('#rmv-phase');
  const wire=q<HTMLInputElement>('#rmv-wire'),spin=q<HTMLInputElement>('#rmv-spin'),lighting=q<HTMLSelectElement>('#rmv-light');

  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.01,800),controls=new OrbitControls(camera,canvas);
  controls.enableDamping=true;controls.autoRotateSpeed=1.4;

  // Battlefield lighting, copied from Battlefield's constructor (hemisphere + shadowed sun, ACES 1.18).
  const game=new THREE.Group(),sun=new THREE.DirectionalLight('#ffe1ac',3.3);
  game.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1),sun,sun.target);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0005;sun.shadow.normalBias=.07;
  // Neutral studio: image-based room light plus a soft white key, for judging surfaces without the warm sun.
  const studio=new THREE.Group(),key=new THREE.DirectionalLight('#ffffff',1.6);studio.add(key,key.target);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0005;key.shadow.normalBias=.07;
  const pmrem=new THREE.PMREMGenerator(renderer),room=pmrem.fromScene(new RoomEnvironment(),.04).texture;pmrem.dispose();
  scene.add(game,studio);
  const groundMaterial=new THREE.MeshStandardMaterial({roughness:1}),ground=new THREE.Mesh(new THREE.CircleGeometry(1,96),groundMaterial);
  ground.rotation.x=-Math.PI/2;ground.position.y=-.005;ground.receiveShadow=true;scene.add(ground);

  status.textContent='讀取模型清單…';
  const registry=await (await fetch('/assets/games/rts/model-registry.json')).json() as {assets:Record<string,{url:string;lod1?:string;status:string}>};
  const ids=[...Object.keys(registry.assets),...RUBBLE_MODELS.map(m=>m.id)];
  const library=new ModelLibrary();
  await library.load((loaded,total)=>{status.textContent=`載入遊戲模型 ${loaded} / ${total}`;});
  status.textContent='';
  const meadow=library.terrain('meadow');meadow.wrapS=meadow.wrapT=THREE.RepeatWrapping;meadow.colorSpace=THREE.SRGBColorSpace;meadow.anisotropy=8;

  for(const group of groupModels(ids)){
    const section=document.createElement('section'),heading=document.createElement('h2'),items=document.createElement('ul');
    heading.textContent=group.label;section.append(heading,items);
    for(const item of group.items){
      const li=document.createElement('li'),button=document.createElement('button'),name=document.createElement('span'),code=document.createElement('small');
      button.type='button';button.dataset.model=item.id;name.textContent=previewLabel(item.id);code.textContent=item.id;button.append(name,code);
      button.addEventListener('click',()=>void select(item.id));li.append(button);items.append(li);
    }
    list.append(section);
  }

  // Preview-gated units are outside REQUIRED_MODELS: load them through the same runtime path
  // (team masks, LOD1, shared materials by relative URL) the factory review stage uses.
  const previewLoader=new GLTFLoader(),previewCache=new Map<string,Promise<GLTF>>();
  const previewAsset=(url:string)=>{let p=previewCache.get(url);if(!p){p=previewLoader.loadAsync(url).then(async g=>{await prepareTeamMasks(g);return g;});previewCache.set(url,p);}return p;};
  async function previewInstance(next:string,teamId:TeamId):Promise<ModelInstance>{
    const entry=registry.assets[next] as never as ConstructorParameters<typeof ModelInstance>[1];
    const high=await previewAsset(registry.assets[next].url),low=registry.assets[next].lod1?await previewAsset(registry.assets[next].lod1!):undefined;
    return new ModelInstance(high,entry,teamId,false,low);
  }
  let model:ModelInstance|undefined,id='',team:TeamId=0,lod=0,clip='',playing=true,fit={center:new THREE.Vector3(),radius:1};
  let actions:THREE.AnimationAction[]=[],stats:ModelStats[]=[];
  const clips=()=>model?variantsOf(model)[0].clips:[];
  const hasLod=()=>!!model&&variantsOf(model).length>1;

  function applyLighting(){
    const mode=lighting.value==='studio'?'studio':'game';game.visible=mode==='game';studio.visible=mode==='studio';
    scene.environment=mode==='studio'?room:null;scene.background=new THREE.Color(mode==='studio'?'#3b4045':'#121e22');
    groundMaterial.map=mode==='game'?meadow:null;groundMaterial.color.set(mode==='game'?'#ffffff':'#6d7176');groundMaterial.needsUpdate=true;
  }
  function placeLights(){
    const r=fit.radius,c=fit.center;
    for(const [light,offset] of [[sun,new THREE.Vector3(-33,65,-22)],[key,new THREE.Vector3(-2,3,-2.4)]] as const){
      light.target.position.set(c.x,0,c.z);light.position.copy(light.target.position).add(offset.clone().normalize().multiplyScalar(r*6));
      const s=light.shadow.camera;s.left=s.bottom=-r*1.6;s.right=s.top=r*1.6;s.near=.01;s.far=r*14;s.updateProjectionMatrix();
    }
    const size=Math.max(6,r*5);ground.scale.setScalar(size);meadow.repeat.set(size*2/6,size*2/6);
  }
  function setView(name:ViewPreset){
    const distance=fit.radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.12,p=viewPreset(name,fit.center,distance);
    camera.position.set(p.x,p.y,p.z);controls.target.copy(fit.center);camera.near=distance/200;camera.far=distance*40;camera.updateProjectionMatrix();controls.update();
  }
  function applyWireframe(){
    model?.root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if('wireframe' in m)(m as THREE.MeshStandardMaterial).wireframe=wire.checked;});
  }
  function startClip(name:string,fraction=0){
    clip=name;actions=[];if(!model)return;
    for(const variant of variantsOf(model)){
      if(variant.sharedPose)continue;variant.mixer.stopAllAction();
      const source=variant.clips.find(c=>c.name===name);if(!source)continue;
      const action=variant.mixer.clipAction(source),once=/death/i.test(name);
      action.reset().setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);action.clampWhenFinished=once;action.play();
      action.time=source.duration*fraction;variant.mixer.update(0);actions.push(action);
    }
  }
  function syncPhase(){const a=actions[0];if(a)phase.value=String(Math.round(a.time/a.getClip().duration*1000));}
  function setLod(next:number){lod=hasLod()?next:0;model?.setDetailPixels(lod?25:100);const fraction=actions[0]?actions[0].time/actions[0].getClip().duration:0;if(clip)startClip(clip,fraction);renderInfo();syncButtons();}
  function syncButtons(){
    for(const b of root.querySelectorAll<HTMLButtonElement>('[data-model]'))b.setAttribute('aria-pressed',String(b.dataset.model===id));
    for(const b of root.querySelectorAll<HTMLButtonElement>('[data-team]'))b.setAttribute('aria-pressed',String(Number(b.dataset.team)===team));
    for(const b of root.querySelectorAll<HTMLButtonElement>('[data-lod]')){b.setAttribute('aria-pressed',String(Number(b.dataset.lod)===lod));b.disabled=Number(b.dataset.lod)===1&&!hasLod();}
    play.textContent=playing?'暫停':'播放';play.disabled=!clips().length;clipSelect.disabled=!clips().length;phase.disabled=!clips().length;
  }
  function row(label:string,value:string){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;return [dt,dd];}
  function renderInfo(){
    const s=stats[lod]??stats[0];if(!s)return;const n=(v:number)=>v.toLocaleString('zh-TW');
    const dl=document.createElement('dl');
    dl.append(...row('三角面',n(s.triangles)),...row('頂點',n(s.vertices)),...row('網格／繪製批次',`${s.meshes}／${s.drawCalls}`),...row('材質',String(s.materials)),
      ...row('貼圖',s.textures.length?s.textures.map(t=>`${t.width}×${t.height}${t.count>1?` ×${t.count}`:''}`).join('、'):'無'),
      ...row('最大貼圖邊長',s.maxTextureSize?s.maxTextureSize+' px':'—'),...row('包圍高度',s.height.toFixed(2)+' m'),...row('骨骼',s.bones?String(s.bones):'無（靜態）'));
    if(stats.length>1)dl.append(...row('LOD0 / LOD1 三角面',`${n(stats[0].triangles)} / ${n(stats[1].triangles)}`));
    const clipList=clips();dl.append(...row('動畫片段',clipList.length?clipList.map(c=>`${clipLabel(c.name)}（${c.duration.toFixed(2)} 秒）`).join('、'):'無'));
    info.replaceChildren(dl);
  }
  function measure():ModelStats[] {
    if(!model)return [];const result:ModelStats[]=[];
    for(let i=0;i<variantsOf(model).length;i++){model.setDetailPixels(i?25:100);result.push(summarizeModel(model.root));}
    model.setDetailPixels(lod?25:100);return result;
  }
  async function select(next:string,keepView=false){
    if(!ids.includes(next))return;
    const previousClip=clip,changedModel=next!==id;
    model?.dispose();id=next;
    model=isPreviewModel(id)?await previewInstance(id,team):library.instantiate(id,id.startsWith('rubble-')?-1:team);scene.add(model.root);applyWireframe();
    if(changedModel)lod=0;if(!hasLod())lod=0;
    const names=clips().map(c=>c.name);
    clipSelect.replaceChildren(...(names.length?names:['無動畫']).map(name=>{const o=document.createElement('option');o.value=names.length?name:'';o.textContent=names.length?clipLabel(name):name;return o;}));
    const chosen=!changedModel&&names.includes(previousClip)?previousClip:names.find(n=>n==='Idle')??names[0]??'';
    // Measure at the first frame of Idle, the standing pose the game uses for heights.
    startClip(chosen);stats=measure();model.setDetailPixels(lod?25:100);startClip(chosen);clipSelect.value=chosen;
    if(!keepView){
      const box=new THREE.Box3().setFromObject(model.root,true),sphere=box.getBoundingSphere(new THREE.Sphere());
      fit={center:sphere.center.clone(),radius:Math.max(.2,sphere.radius)};placeLights();setView('game');
    }
    title.textContent=`${modelDisplayName(id)} · ${id}`;history.replaceState(null,'','#'+id);
    renderInfo();syncButtons();root.dataset.model=id;root.dataset.ready='true';
  }

  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view as ViewPreset)));
  root.querySelectorAll<HTMLButtonElement>('[data-team]').forEach(b=>b.addEventListener('click',()=>{team=Number(b.dataset.team) as TeamId;void select(id,true);}));
  root.querySelectorAll<HTMLButtonElement>('[data-lod]').forEach(b=>b.addEventListener('click',()=>setLod(Number(b.dataset.lod))));
  q('#rmv-reset').addEventListener('click',()=>{spin.checked=false;controls.autoRotate=false;setView('game');});
  spin.addEventListener('change',()=>{controls.autoRotate=spin.checked;});
  wire.addEventListener('change',applyWireframe);
  lighting.addEventListener('change',applyLighting);
  clipSelect.addEventListener('change',()=>{startClip(clipSelect.value);playing=true;syncButtons();});
  play.addEventListener('click',()=>{playing=!playing;for(const a of actions)if(!a.isRunning()&&playing&&a.time>=a.getClip().duration)a.reset();syncButtons();});
  phase.addEventListener('input',()=>{playing=false;startClip(clip,Number(phase.value)/1000);syncButtons();});

  const resize=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(canvas);resize();applyLighting();
  const clock=new THREE.Clock();
  renderer.setAnimationLoop(()=>{
    const dt=Math.min(.05,clock.getDelta());
    if(playing&&model)for(const variant of variantsOf(model))if(!variant.sharedPose)variant.mixer.update(dt);
    if(playing)syncPhase();controls.update();renderer.render(scene,camera);
  });
  const initial=decodeURIComponent(location.hash.slice(1));
  await select(ids.includes(initial)?initial:'worker');
  (window as unknown as {rtsModelViewer:unknown}).rtsModelViewer={select,setView,setLod,stats:()=>stats[lod],clip:()=>clip,model:()=>model,renderer,camera,controls};
}
