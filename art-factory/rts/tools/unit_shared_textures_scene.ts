/** Isolated exact-pixel packaging QA, never imported by the shipped game. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
import {SharedMaterialLoader} from '../../../src/scripts/games/rts/shared-material-loader';
import {prepareTeamMasks} from '../../../src/scripts/games/rts/team-material';
import {PORTRAIT_FRAMING} from '../../../src/scripts/games/rts/portrait';
import type {UnitKind} from '../../../src/scripts/games/rts/catalog';

const id=new URLSearchParams(location.search).get('unit') as UnitKind;
const manifest=await (await fetch('/assets/games/rts/model-registry.json')).json();
const scene=new THREE.Scene();scene.background=new THREE.Color('#222d31');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1024,768);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
document.body.style.margin='0';document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(15,65,26);scene.add(sun);
const camera=new THREE.OrthographicCamera(-5.8,5.8,4.35,-4.35,.01,80);
const sets:ModelInstance[][]=[];
let lastPortrait=false;
const errors:string[]=[];
const manager=new THREE.LoadingManager();manager.onError=url=>errors.push(url);
const shared=new SharedMaterialLoader(manager);
manager.addHandler(/^\.\.\/materials\/(?:detail-v1\/[a-z-]+|unit-shared\/[a-f0-9]{64})\.(jpg|png)$/,shared);
const loader=new GLTFLoader(manager);
const sourceInfo=[];
for(const variant of ['source','candidate']){
  const [high,low]=await Promise.all([id,id+'-lod1'].map(name=>loader.loadAsync(`/rts-shared/${variant}/models/${name}.glb`)));
  await Promise.all([prepareTeamMasks(high),prepareTeamMasks(low)]);
  sourceInfo.push({variant,clips:high.animations.map(clip=>clip.name),lowClips:low.animations.map(clip=>clip.name)});
  const instances:ModelInstance[]=[];
  for(let lod=0;lod<2;lod++)for(let team=0;team<2;team++){
    const model=new ModelInstance(high,manifest.assets[id],id==='neutral-raider'?-1:team as 0|1,false,low);
    model.setDetailPixels(lod?32:80);scene.add(model.root);instances.push(model);
  }
  sets.push(instances);
}
function configure(portrait:boolean){
  const frame=PORTRAIT_FRAMING[id];
  for(const models of sets)for(const [index,model] of models.entries()){
    model.root.position.set(portrait?0:(index%2)*4-2,0,portrait?0:Math.floor(index/2)*3.5-1.75);
    model.root.rotation.y=model.yaw+(portrait?frame.yaw:0);
  }
  const span=portrait?frame.span:8.7;
  camera.left=-span*4/3/2;camera.right=span*4/3/2;camera.top=span/2;camera.bottom=-span/2;
  camera.position.set(...(portrait?[0,frame.y+.03,4]:[8,9,-14]) as [number,number,number]);
  camera.lookAt(0,portrait?frame.y:.6,0);camera.updateProjectionMatrix();
}
function pixels(variant:number,portrait:boolean){
  sets.forEach((models,v)=>models.forEach((model,i)=>{model.root.visible=v===variant&&(!portrait||i===0);}));
  scene.updateMatrixWorld(true);renderer.render(scene,camera);
  const gl=renderer.getContext();gl.finish();
  const bytes=new Uint8Array(1024*768*4);gl.readPixels(0,0,1024,768,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
  return bytes;
}
function difference(a:Uint8Array,b:Uint8Array){
  let changedChannels=0,maxChannelDelta=0,sum=0;
  for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d){changedChannels++;sum+=d;maxChannelDelta=Math.max(maxChannelDelta,d);}}
  return {changedChannels,maxChannelDelta,meanChannelDelta:sum/a.length};
}
function meshes(variant:number){
  const result:THREE.Mesh[]=[];
  for(const model of sets[variant])model.root.traverse(object=>{if(object instanceof THREE.Mesh)result.push(object);});
  return result;
}
function orderedPixels(variant:number,portrait:boolean,order:number[]){
  const objects=meshes(variant),previous=objects.map(object=>object.renderOrder);
  try{
    objects.forEach((object,i)=>{const position=order.indexOf(i);object.renderOrder=position<0?objects.length+i:position+1;});
    return pixels(variant,portrait);
  }finally{objects.forEach((object,i)=>{object.renderOrder=previous[i];});}
}
function trace(variant:number,portrait:boolean){
  const objects=meshes(variant),previous=objects.map(object=>object.onBeforeRender);
  const calls:Array<{index:number;mesh:string;material:string;materialId:number;transparent:boolean;depthWrite:boolean;depthTest:boolean;depthFunc:number;polygonOffset:boolean;group:number|null}>=[];
  try{
    objects.forEach((object,index)=>{object.onBeforeRender=function(...args){
      const material=args[4],group=args[5];
      calls.push({index,mesh:object.name,material:material.name,materialId:(material as THREE.Material&{id:number}).id,transparent:material.transparent,
        depthWrite:material.depthWrite,depthTest:material.depthTest,depthFunc:material.depthFunc,polygonOffset:material.polygonOffset,group:(group as unknown as {materialIndex?:number})?.materialIndex??null});
      previous[index].apply(this,args);
    };});
    pixels(variant,portrait);return calls;
  }finally{objects.forEach((object,i)=>{object.onBeforeRender=previous[i];});}
}
(window as any).sharedTextureAudit={
  ready:true,sourceInfo,
  probe:()=>{
    const frames=[pixels(0,lastPortrait),pixels(1,lastPortrait),pixels(0,lastPortrait),pixels(1,lastPortrait),pixels(0,lastPortrait),pixels(1,lastPortrait)];
    const repeats=[[0,1],[0,2],[1,3],[2,3],[0,4],[1,5]].map(([left,right])=>{
      const differences=[];
      for(let p=0;p<frames[left].length;p+=4)if(frames[left].slice(p,p+4).some((v,c)=>v!==frames[right][p+c]))
        differences.push({x:(p/4)%1024,y:767-Math.floor(p/4/1024),left:Array.from(frames[left].slice(p,p+4)),right:Array.from(frames[right].slice(p,p+4))});
      return {left,right,pixels:differences.length,examples:differences.slice(0,20)};
    });
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((741.5/1024)*2-1,1-(363.5/768)*2),camera);
    const hits=sets.map(models=>ray.intersectObjects(models.map(model=>model.root),true).slice(0,8).map(hit=>({
      mesh:hit.object.name,face:hit.faceIndex,distance:hit.distance,point:hit.point.toArray(),
      material:(hit.object as THREE.Mesh).material instanceof Array?(hit.object as THREE.Mesh).material as any:((hit.object as THREE.Mesh).material as THREE.Material).name
    })));
    const drawTraces=[trace(0,lastPortrait),trace(1,lastPortrait)];
    const nativeOrders=drawTraces.map(calls=>[...new Set(calls.map(call=>call.index))]);
    const sourceWithCandidateOrder=orderedPixels(0,lastPortrait,nativeOrders[1]);
    const candidateWithSourceOrder=orderedPixels(1,lastPortrait,nativeOrders[0]);
    return {repeats,hits,drawTraces,
      sourceWithCandidateOrderVsCandidate:difference(sourceWithCandidateOrder,frames[1]),
      candidateWithSourceOrderVsSource:difference(candidateWithSourceOrder,frames[0]),
      sourceOwnOrderReplay:difference(orderedPixels(0,lastPortrait,nativeOrders[0]),frames[0]),
      candidateOwnOrderReplay:difference(orderedPixels(1,lastPortrait,nativeOrders[1]),frames[1])};
  },
  compare:async(clip:string,dt:number,portrait=false,diagnostic=false)=>{
    configure(portrait);lastPortrait=portrait;
    for(const models of sets)for(const model of models)model.animate(clip,dt);
    const a=pixels(0,portrait),before=renderer.domElement.toDataURL('image/png');
    const b=pixels(1,portrait),after=renderer.domElement.toDataURL('image/png');
    const hash=async(data:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data.buffer as ArrayBuffer)),n=>n.toString(16).padStart(2,'0')).join('');
    let controlled;
    if(diagnostic){
      const order=meshes(0).map((_,index)=>index);
      const c=orderedPixels(0,portrait,order),d=orderedPixels(1,portrait,order);
      controlled={...difference(c,d),sourcePixelSha256:await hash(c),candidatePixelSha256:await hash(d),
        scope:'QA-only identical per-mesh draw order; no production renderOrder changes'};
    }
    return {clip,dt,portrait,...difference(a,b),controlled,
      sourcePixelSha256:await hash(a),candidatePixelSha256:await hash(b),sourceImage:before,candidateImage:after,
      errors:[...errors],contextLost:renderer.getContext().isContextLost(),drawCalls:renderer.info.render.calls};
  }
};
