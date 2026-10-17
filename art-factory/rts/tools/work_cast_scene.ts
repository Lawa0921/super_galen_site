/** Isolated candidate-art inspection. Never imported by the shipped game. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from '../../../src/scripts/games/rts/models';
import {prepareTeamMasks} from '../../../src/scripts/games/rts/team-material';

const unit=new URLSearchParams(location.search).get('unit')??'worker';
if(!['worker','priest','commander'].includes(unit))throw new Error('Unknown review unit');
const loader=new GLTFLoader(),url=`/assets/games/rts/models/${unit}`;
const [high,low]=await Promise.all([loader.loadAsync(url+'.glb'),loader.loadAsync(url+'-lod1.glb')]);
await Promise.all([prepareTeamMasks(high),prepareTeamMasks(low)]);
const scene=new THREE.Scene();scene.background=new THREE.Color('#222d31');
const camera=new THREE.OrthographicCamera(-5.8,5.8,3.3,-3.3,.1,80);camera.position.set(8,9,-14);camera.lookAt(0,.6,0);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1500,850);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
document.body.style.margin='0';document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
const sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.position.set(15,65,26);scene.add(sun);
const models:ModelInstance[]=[];
for(let lod=0;lod<2;lod++)for(let team=0;team<2;team++){
  const model=new ModelInstance(high,{url:url+'.glb',status:'published'},team as 0|1,false,low);
  model.root.position.set(team*4-2,0,lod*3.5-1.75);model.setDetailPixels(lod?32:80);scene.add(model.root);models.push(model);
}
const vertex=new THREE.Vector3();
function render(clipName:string,fraction:number,draw=true){
  for(const model of models){
    for(const variant of (model as any).variants){
      if(variant.sharedPose)continue;
      const clip=variant.clips.find((c:THREE.AnimationClip)=>c.name===clipName);if(!clip)throw new Error('Missing '+clipName);
      variant.mixer.stopAllAction();const action=variant.mixer.clipAction(clip);action.reset();action.setLoop(THREE.LoopOnce,1);
      action.clampWhenFinished=true;action.play();action.time=clip.duration*fraction;action.paused=true;variant.mixer.update(0);
    }
  }
  return inspect(draw);
}
function inspect(draw=true){
  scene.updateMatrixWorld(true);if(draw)renderer.render(scene,camera);
  const samples=models.map((model,index)=>{
    let lowest=Infinity,outsideBounds=0,largestExcess=0;const pose:number[]=[],meshes:any[]=[];
    model.root.traverse(o=>{
      if(!(o instanceof THREE.SkinnedMesh)||!o.parent)return;
      // Inspect only the actually displayed LOD; hidden high bones still drive low.
      let visible=true;for(let p:THREE.Object3D|null=o;p&&p!==model.root;p=p.parent)visible&&=p.visible;if(!visible)return;
      o.skeleton.update();if(!o.boundingSphere)o.computeBoundingSphere();
      let meshLowest=Infinity;
      for(let i=0;i<o.geometry.attributes.position.count;i++){
        o.getVertexPosition(i,vertex);const excess=vertex.distanceTo(o.boundingSphere!.center)-o.boundingSphere!.radius;
        if(excess>.001){outsideBounds++;largestExcess=Math.max(largestExcess,excess);}
        vertex.applyMatrix4(o.matrixWorld);lowest=Math.min(lowest,vertex.y);meshLowest=Math.min(meshLowest,vertex.y);
      }
      for(const bone of o.skeleton.bones)pose.push(...bone.quaternion.toArray());
      let staffTiltDegrees:number|undefined;
      if(unit==='priest'&&!Array.isArray(o.material)&&o.material.name==='WorkedAshWood'){
        const positions=o.geometry.attributes.position,ends=[new THREE.Vector3(),new THREE.Vector3()],counts=[0,0];
        const ys=Array.from({length:positions.count},(_,i)=>positions.getY(i)),lo=Math.min(...ys),hi=Math.max(...ys);
        ys.forEach((y,i)=>{for(let side=0;side<2;side++)if(Math.abs(y-(side?hi:lo))<1e-5){o.getVertexPosition(i,vertex).applyMatrix4(o.matrixWorld);ends[side].add(vertex);counts[side]++;}});
        ends.forEach((p,i)=>p.divideScalar(counts[i]));const direction=ends[1].sub(ends[0]).normalize();
        staffTiltDegrees=THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(direction.y,-1,1)));
      }
      meshes.push({name:o.name,owner:o.parent.name,lowest:meshLowest,staffTiltDegrees});
    });
    return {lod:Math.floor(index/2),team:index%2,visible:model.root.children.map(c=>c.visible),lowest,outsideBounds,largestExcess,pose,meshes};
  });
  return {samples,contextLost:renderer.getContext().isContextLost(),draws:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
function sweep(){
  return high.animations.map(clip=>{
    const times=new Set<number>([0,clip.duration]);
    for(let i=0;i<=Math.ceil(clip.duration*60);i++)times.add(Math.min(i/60,clip.duration));
    for(const track of clip.tracks)for(const t of track.times)times.add(t);
    let lowest=Infinity,maxStaffTilt=0,excess=0;const meshes=new Map<string,number>();
    for(const time of [...times].sort((a,b)=>a-b))for(const sample of render(clip.name,time/clip.duration,false).samples){
      lowest=Math.min(lowest,sample.lowest);excess=Math.max(excess,sample.largestExcess);
      for(const mesh of sample.meshes){
        const name=`${sample.lod}:${mesh.owner}/${mesh.name}`;meshes.set(name,Math.min(meshes.get(name)??Infinity,mesh.lowest));
        maxStaffTilt=Math.max(maxStaffTilt,mesh.staffTiltDegrees??0);
      }
    }
    return {clip:clip.name,samples:times.size,lowest,maxStaffTilt,boundsExcess:excess,meshFloors:Object.fromEntries(meshes)};
  });
}
function diagnose(options:{cull?:boolean;doubleSide?:boolean;camera?:number[]}){
  const meshes:any[]=[];
  for(const model of models)model.root.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    if(options.cull!==undefined)o.frustumCulled=options.cull;
    const materials=Array.isArray(o.material)?o.material:[o.material];
    if(options.doubleSide)for(const m of materials){m.side=THREE.DoubleSide;m.needsUpdate=true;}
    meshes.push({name:o.name,cull:o.frustumCulled,materials:materials.map(m=>({name:m.name,side:m.side,opacity:m.opacity,visible:m.visible}))});
  });
  if(options.camera){camera.position.fromArray(options.camera);camera.lookAt(0,.6,0);}
  return meshes;
}
function moving(kind:'heal'|'cleave'|'mend'|'banner',phase:number,age:number,draw=true){
  for(const model of models){
    model.animate('death',1);model.animate('walk',.2,undefined,3);
    for(const variant of (model as any).variants)if(!variant.sharedPose){variant.action.time=phase*variant.action.getClip().duration;variant.mixer.update(0);}
    model.animate('walk',0,undefined,3,undefined,{kind,sequence:1,elapsed:age});
  }
  return inspect(draw);
}
function movingSweep(){
  const kinds=unit==='priest'?['heal']:unit==='commander'?['cleave','mend','banner']:[];
  return kinds.map(kind=>{
    let lowest=Infinity,boundsExcess=0,maxStaffTilt=0,samples=0;
    for(let phase=0;phase<8;phase++)for(let frame=0;frame<36;frame++){
      for(const sample of moving(kind as 'heal'|'cleave'|'mend'|'banner',phase/8,frame/60,false).samples){
        lowest=Math.min(lowest,sample.lowest);boundsExcess=Math.max(boundsExcess,sample.largestExcess);
        for(const mesh of sample.meshes)maxStaffTilt=Math.max(maxStaffTilt,mesh.staffTiltDegrees??0);
      }samples++;
    }
    return {kind,samples,walkPhases:8,castSampleHz:60,lowest,boundsExcess,maxStaffTilt};
  });
}
(window as any).workCastAudit={render,diagnose,sweep,moving,movingSweep,clips:high.animations.map(c=>c.name),lowClips:low.animations.map(c=>c.name)};
render('Idle',0);
