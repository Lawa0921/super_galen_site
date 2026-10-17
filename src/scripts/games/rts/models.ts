import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import type {TeamId} from './catalog';
import {prepareTeamMasks,configureTeamMaterial} from './team-material';
import {SharedMaterialLoader} from './shared-material-loader';
import {shareCompatibleLodRig} from './shared-lod-rig';
import {batchCompatibleSkins} from './skin-batches';
import {LANDMARK_MODELS,MAP_LANDMARK_MODELS} from './landmark-models';
import {constructionNodes,readConstructionMetadata,sameConstruction,retainConstruction,releaseConstruction,type ConstructionAsset} from './construction-presentation';
import {BuildingLifecyclePresentation,buildingLifecycleSignature,isDeathReplacement} from './building-lifecycle-presentation';
import type {BuildingEffectAnchors} from './building-effects';
import {StaticTransform} from './static-transform';
import {MaterialRegistry} from './material-dedupe';
import {RUBBLE_MODELS} from './building-collapse';
import {hurtPlayback,HURT_FADE,type AnimationCue} from './unit-reaction';
import {CAST_WINDOW,castPlayback,isWorkAnimation,type CastAnimationCue} from './unit-actions';
import {CastLocomotion} from './cast-locomotion';
export const REQUIRED_MODELS=['worker','guard','crossbow','priest','knight','siege','commander','neutral-raider','townhall','townhall-tier2','townhall-tier3','house','barracks','lumbermill','forge','altar','tower','chapel','stable','workshop','stone-bridge','oak','pine','rock','gold-mine','timber-pile','bolt','heavy-bolt',...LANDMARK_MODELS];
interface ModelEntry {url:string;status:'published';scale?:number;yaw?:number;lod1?:string}
interface ModelManifest {assets:Record<string,ModelEntry>;landscape?:{undergrowth:{url:string;status:'published'};ruins?:{url:string;status:'published'}};effects?:{building:{url:string;status:'published'}}}
export interface RtsMotionMetadata {version:1;locomotion:{clip:string;strideMeters:number;cycleSeconds:number};attack:{clip:string;durationSeconds:number;contactSeconds:number}}
function readMotionMetadata(input:unknown):RtsMotionMetadata|undefined {
  if(input===undefined)return undefined;const m=input as RtsMotionMetadata;
  if(!m||typeof m!=='object'||m.version!==1||!m.locomotion||!m.attack||typeof m.locomotion.clip!=='string'||!m.locomotion.clip.trim()||typeof m.attack.clip!=='string'||!m.attack.clip.trim()||
    !Number.isFinite(m.locomotion.strideMeters)||m.locomotion.strideMeters<=0||!Number.isFinite(m.locomotion.cycleSeconds)||m.locomotion.cycleSeconds<=0||
    !Number.isFinite(m.attack.durationSeconds)||m.attack.durationSeconds<=0||!Number.isFinite(m.attack.contactSeconds)||m.attack.contactSeconds<0||m.attack.contactSeconds>=m.attack.durationSeconds)throw new Error('Invalid RTS motion metadata');
  return m;
}
function sameMotion(a:RtsMotionMetadata|undefined,b:RtsMotionMetadata|undefined):boolean {
  return a===undefined?b===undefined:b!==undefined&&a.version===b.version&&a.locomotion.clip===b.locomotion.clip&&a.locomotion.strideMeters===b.locomotion.strideMeters&&a.locomotion.cycleSeconds===b.locomotion.cycleSeconds&&a.attack.clip===b.attack.clip&&a.attack.durationSeconds===b.attack.durationSeconds&&a.attack.contactSeconds===b.attack.contactSeconds;
}
interface RtsConservativeBounds {sphere_center_y_up_m:[number,number,number];sphere_radius_m:number}
function conservativeSphereScale(matrix:THREE.Matrix4):number {
  const e=matrix.elements,c0=new THREE.Vector3(e[0],e[1],e[2]),c1=new THREE.Vector3(e[4],e[5],e[6]),c2=new THREE.Vector3(e[8],e[9],e[10]);
  const n0=c0.length(),n1=c1.length(),n2=c2.length(),orthogonal=Math.abs(c0.dot(c1))<=1e-8*n0*n1&&Math.abs(c0.dot(c2))<=1e-8*n0*n2&&Math.abs(c1.dot(c2))<=1e-8*n1*n2;
  // Orthogonal TRS has an exact maximum scale; the Frobenius norm safely
  // encloses shear when a parent and child contain composed nonuniform scales.
  return orthogonal?Math.max(n0,n1,n2):Math.sqrt(n0*n0+n1*n1+n2*n2);
}
function applyConservativeBounds(mesh:THREE.SkinnedMesh,owner:THREE.Object3D,bounds:unknown):void {
  const b=bounds as RtsConservativeBounds,center=b?.sphere_center_y_up_m,radius=b?.sphere_radius_m;
  if(!Array.isArray(center)||center.length!==3||!center.every(Number.isFinite)||!Number.isFinite(radius)||radius<=0)throw new Error('Invalid conservative skin bounds');
  const sphere=new THREE.Sphere(new THREE.Vector3().fromArray(center),radius);
  if(owner!==mesh){
    const ownerToMesh=mesh.matrixWorld.clone().invert().multiply(owner.matrixWorld);
    sphere.center.applyMatrix4(ownerToMesh);sphere.radius*=conservativeSphereScale(ownerToMesh);
  }
  mesh.boundingSphere=sphere;mesh.boundingBox=sphere.getBoundingBox(new THREE.Box3());
}
function prepareSkinBounds(object:THREE.SkinnedMesh):void {
  let owner:THREE.Object3D=object,bounds=object.userData.rtsConservativeBounds;
  if(bounds===undefined)for(let parent=object.parent;parent;parent=parent.parent){
    if(parent.userData.rtsConservativeBounds!==undefined){owner=parent;bounds=parent.userData.rtsConservativeBounds;break;}
  }
  if(bounds!==undefined)applyConservativeBounds(object,owner,bounds);
}

export function validateModelManifest(input:unknown):asserts input is ModelManifest {
  const m=input as ModelManifest;
  if(!m||typeof m!=='object'||!m.assets)throw new Error('Invalid model registry');
  const local=(url:unknown)=>typeof url==='string'&&/^\/assets\/games\/rts\/models\/[a-z0-9-]+\.glb$/.test(url);
  for(const id of REQUIRED_MODELS){const a=m.assets[id];if(!a||a.status!=='published'||!local(a.url)||a.lod1!==undefined&&!local(a.lod1)||a.scale!==undefined&&(!Number.isFinite(a.scale)||a.scale<=0)||a.yaw!==undefined&&!Number.isFinite(a.yaw))throw new Error('Unpublished or invalid model: '+id);}
  for(const id of LANDMARK_MODELS){const a=m.assets[id];if(!local(a.lod1)||a.scale!==1)throw new Error('Missing LOD or invalid authored scale: '+id);}
  if(m.landscape&&(m.landscape.undergrowth?.status!=='published'||m.landscape.undergrowth.url!=='/assets/games/rts/terrain/valley-undergrowth.webp'))throw new Error('Unpublished or invalid undergrowth');
  if(m.landscape?.ruins&&(m.landscape.ruins.status!=='published'||m.landscape.ruins.url!=='/assets/games/rts/terrain/kingdom-ruins.webp'))throw new Error('Unpublished or invalid ruins');
  if(m.effects&&(m.effects.building?.status!=='published'||m.effects.building.url!=='/assets/games/rts/effects/building-effects-atlas.png'))throw new Error('Unpublished or invalid building effects');
}
/** Library-owned team cloth / fog-memory ghost copies. A copy depends only on its
 * source material, team and ghost flag and is never mutated afterwards, so every
 * instance shares it: units of one team then draw without a material switch
 * (each switch re-uploads every material uniform). Disposed with the library. */
export class InstanceMaterials {
  private copies=new Map<THREE.Material,Map<string,THREE.Material>>();
  get(original:THREE.Material,team:TeamId|-1,ghost:boolean,create:(original:THREE.Material)=>THREE.Material):THREE.Material {
    let variants=this.copies.get(original);if(!variants){variants=new Map();this.copies.set(original,variants);}
    const key=team+(ghost?':ghost':'');let material=variants.get(key);
    if(!material){material=create(original);variants.set(key,material);}
    return material;
  }
  dispose():void {for(const variants of this.copies.values())variants.forEach(m=>m.dispose());this.copies.clear();}
}
export class ModelInstance {
  readonly root:THREE.Object3D;
  readonly yaw:number;
  readonly mixer:THREE.AnimationMixer;
  private variants:Array<{root:THREE.Object3D;mixer:THREE.AnimationMixer;clips:THREE.AnimationClip[];motion?:RtsMotionMetadata;action?:THREE.AnimationAction;sharedPose?:boolean;castWalk?:CastLocomotion;castStride?:{sequence:number;phase:number}}>=[];
  readonly motion?:RtsMotionMetadata;
  private animation='';
  private cueSequence:number|undefined;
  private cueElapsed:number|undefined;
  private hurtDuration=0;
  private owned:THREE.Material[]=[];
  private skeletons=new Set<THREE.Skeleton>();
  private staticTransform?:StaticTransform;
  private constructionProgress=1;
  private destructing=false;
  private construction:Array<{asset:ConstructionAsset;nodes:THREE.Object3D[];completed?:THREE.Group;scene:THREE.Object3D;lifecycle?:BuildingLifecyclePresentation}>=[];
  constructor(gltf:GLTF,entry:ModelEntry,team:TeamId|-1=0,ghost=false,lod1?:GLTF,sharedMaterials?:InstanceMaterials){
    const sources=lod1?[gltf,lod1]:[gltf],metadata=sources.map(source=>readConstructionMetadata(source.scene));
    if(metadata.some(m=>!sameConstruction(metadata[0],m)))throw new Error('RTS construction metadata differs between LODs');
    const lifecycleSignatures=sources.map(s=>buildingLifecycleSignature(s.scene));
    if(lifecycleSignatures.some(signature=>signature!==lifecycleSignatures[0]))throw new Error('RTS building lifecycle metadata differs between LODs');
    const motions=sources.map(source=>readMotionMetadata(source.scene.userData.rtsMotion));
    sources.forEach((source,i)=>{const motion=motions[i];if(motion&&(!source.animations.some(c=>c.name===motion.locomotion.clip)||!source.animations.some(c=>c.name===motion.attack.clip)))throw new Error('RTS motion clip missing from asset');});
    if(motions.some(m=>!sameMotion(motions[0],m)))throw new Error('RTS motion metadata differs between LODs');
    this.yaw=entry.yaw??0;this.root=new THREE.Group();this.root.scale.setScalar(entry.scale??1);this.root.rotation.y=this.yaw;
    this.staticTransform=new StaticTransform(this.root);
    try{
    for(const source of sources){
      const root=clone(source.scene),mixer=new THREE.AnimationMixer(root),motion=motions[this.variants.length];root.visible=this.variants.length===0;
      // Track ownership before bounds/rig/material preparation can throw.
      this.root.add(root);this.variants.push({root,mixer,clips:source.animations,motion});
      root.traverse(object=>{if(object instanceof THREE.SkinnedMesh)this.skeletons.add(object.skeleton);});
      root.updateWorldMatrix(true,true);
      // SkeletonUtils clones a palette for every mesh primitive. Reuse identical
      // palettes inside this variant so one unit uploads its bones only once.
      const palettes:THREE.Skeleton[]=[];
      root.traverse(object=>{
        if(!(object instanceof THREE.SkinnedMesh))return;
        // Authored bounds cover every clip; GLTFLoader puts a multi-primitive
        // node's extras on its wrapper Group, so convert that sphere to each
        // primitive's local space. Direct SkinnedMesh extras take precedence.
        prepareSkinBounds(object);
        const skin=object.skeleton,shared=palettes.find(p=>p.bones.length===skin.bones.length&&p.boneInverses.length===skin.boneInverses.length&&p.bones.every((bone,i)=>bone===skin.bones[i])&&p.boneInverses.every((inverse,i)=>inverse.equals(skin.boneInverses[i])));
        if(shared)object.skeleton=shared;
        else{palettes.push(skin);this.skeletons.add(skin);}
      });
      const asset=retainConstruction(source);if(asset){
        this.construction.push({asset,nodes:[],scene:root});const presentation=this.construction[this.construction.length-1];
        if(root.userData.rtsBuildingLifecycle)presentation.lifecycle=new BuildingLifecyclePresentation(root);
        presentation.nodes=constructionNodes(root);presentation.completed=asset.completed?.clone(true);if(presentation.completed)root.add(presentation.completed);
      }
    }
    if(this.variants.length===2){
      const [high,low]=this.variants;
      if(shareCompatibleLodRig(high.root,high.clips,low.root,low.clips)){low.mixer=high.mixer;low.sharedPose=true;}
    }
    this.mixer=this.variants[0].mixer;this.motion=this.variants[0].motion;
    this.hurtDuration=Math.min(...this.variants.map(v=>v.clips.find(clip=>clip.name.toLowerCase()==='hurt')?.duration??0));
    const materialCopies=new Map<THREE.Material,THREE.Material>();
    this.root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.castShadow=!ghost;o.receiveShadow=true;
      const copy=(original:THREE.Material)=>{
        const material=original.clone() as THREE.MeshStandardMaterial;
        if(/TeamCloth/i.test(material.name)&&material.color)configureTeamMaterial(material,team,original.userData.teamTintTexture);
        if(ghost){material.transparent=true;material.opacity=.4;material.depthWrite=false;material.color?.multiplyScalar(.55);}return material;
      };
      const apply=(original:THREE.Material)=>{
        if(!/TeamCloth/i.test(original.name)&&!ghost)return original;
        const existing=materialCopies.get(original);if(existing)return existing;
        let material:THREE.Material;
        if(sharedMaterials)material=sharedMaterials.get(original,team,ghost,copy);
        else{material=copy(original);this.owned.push(material);}
        materialCopies.set(original,material);return material;
      };
      o.material=Array.isArray(o.material)?o.material.map(apply):apply(o.material);
    });
    this.setConstruction(1);
    // Independent LODs keep their own animation timelines, but only the visible
    // rig needs world matrices for rendering. Shared rigs must retain both
    // branches because low-detail meshes can use the hidden high-detail bones.
    if(this.variants.length===2&&!this.variants.some(v=>v.sharedPose)&&this.variants.every(v=>{
      const nodes=new Set<THREE.Object3D>();v.root.traverse(o=>nodes.add(o));
      const skins=[...nodes].filter((o):o is THREE.SkinnedMesh=>o instanceof THREE.SkinnedMesh);
      return v.clips.length>0&&skins.length>0&&skins.every(s=>s.skeleton.bones.every(b=>nodes.has(b)));
    }))for(const {root} of this.variants){
      const update=root.updateMatrixWorld;
      root.updateMatrixWorld=function(force?:boolean){if(this.visible)update.call(this,force);};
    }
    }catch(error){this.dispose();throw error;}
  }
  /** Returns false for legacy artwork so callers retain its existing presentation. */
  setConstruction(progress:number):boolean {
    if(!this.construction.length)return false;
    if(!Number.isFinite(progress))throw new Error('Invalid construction progress');
    progress=Math.max(0,Math.min(1,progress));
    if(progress!==1||this.destructing)this.staticTransform?.update(false);
    this.constructionProgress=progress;this.destructing=false;
    for(const {asset,nodes,completed,scene,lifecycle} of this.construction){
      lifecycle?.restore();
      const complete=progress===1&&completed!==undefined;if(completed)completed.visible=complete;
      for(const node of nodes)node.visible=!complete&&!isDeathReplacement(node,scene)&&progress>=asset.metadata.thresholds[node.userData.rtsConstructionStage];
    }
    return true;
  }
  setDestruction(age:number,construction:number):boolean {
    this.staticTransform?.update(false);this.destructing=true;
    let authored=false;
    for(const {completed,lifecycle} of this.construction)if(lifecycle){
      lifecycle.apply(age,construction);if(completed)completed.visible=false;authored=true;
    }
    return authored;
  }
  /** Completed batches are available only for static, unskinned source assets. */
  cacheBuildingTransform(enabled:boolean):void {
    this.staticTransform?.update(enabled&&!this.destructing&&this.constructionProgress===1&&this.construction.length>0&&this.construction.every(c=>c.completed!==undefined));
  }
  /** Caches world matrices of a placement that never moves again (fog-of-war memories). */
  freezeTransform():void {this.staticTransform?.update(true);}
  buildingEffectAnchors():BuildingEffectAnchors|undefined {
    const source=this.construction[0];if(!source?.lifecycle)return undefined;
    const transform=(points:[number,number,number][])=>points.map(p=>source.scene.localToWorld(new THREE.Vector3(...p)).toArray() as [number,number,number]);
    return {impact:transform(source.lifecycle.metadata.anchors.impact),repair:transform(source.lifecycle.metadata.anchors.repair)};
  }
  setDetailPixels(pixels:number):void {
    const index=this.variants.length>1&&pixels<48?1:0;
    this.variants.forEach((variant,i)=>{
      const activate=i===index&&!variant.root.visible;variant.root.visible=i===index;
      if(activate)variant.root.updateWorldMatrix(true,true);
    });
  }
  animate(name:string,dt:number,cue?:AnimationCue,movementSpeed?:number,hurtCue?:AnimationCue,castCue?:CastAnimationCue):void {
    const baseName=name;
    const casting=castPlayback(name,castCue);
    if(casting){name=casting.kind==='heal'?'cast':'cast'+casting.kind;cue=casting;}
    else if(name==='cast'&&castCue)name='idle';
    const reaction=hurtPlayback(name,hurtCue,this.hurtDuration);if(reaction){name='hurt';cue=reaction;}
    const fixedAge=name==='hurt'||!!casting,sequence=name==='attack'||fixedAge?cue?.sequence:undefined;
    for(const variant of this.variants){
      if(variant.sharedPose){variant.action=this.variants[0].action;continue;}
      const walk=variant.clips.find(c=>c.name===(variant.motion?.locomotion.clip??'Walk'));
      if(!casting||variant.castStride?.sequence!==sequence)variant.castStride=undefined;
      if(casting){
        // Healing stops a priest for one tick. Retain the stride only for this
        // cast, before a full-body spell replaces Walk or its lower-body layer.
        const phase=variant.castWalk?.lower.time??(variant.action?.getClip()===walk?variant.action?.time:undefined);
        if(phase!==undefined)variant.castStride={sequence:sequence!,phase};
      }
      const nominalStrideSpeed=variant.motion?variant.motion.locomotion.strideMeters/variant.motion.locomotion.cycleSeconds:1;
      const walkScale=variant.motion?Math.max(0,movementSpeed??nominalStrideSpeed)/nominalStrideSpeed:1;
      const spell=casting&&baseName==='walk'&&walk?variant.clips.find(c=>c.name.toLowerCase()===name):undefined;
      let layerRestart=false,walkExit=false;
      if(spell&&walk){
        if(!variant.castWalk||variant.castWalk.exiting||variant.castWalk.clip!==spell||variant.castWalk.sequence!==sequence){
          const phase=variant.castStride?.phase??0;
          const layer=CastLocomotion.create(variant.mixer,spell,walk,sequence!,phase,this.cueSequence!==sequence||!this.animation.startsWith('cast'));
          if(layer)variant.castWalk=layer;
          else if(variant.castWalk){variant.mixer.stopAllAction();variant.castWalk=undefined;variant.action=undefined;layerRestart=true;}
        }
        if(variant.castWalk&&!variant.castWalk.exiting){
          variant.castWalk.update(cue!.elapsed,walkScale);variant.action=variant.castWalk.upper;variant.mixer.update(dt);continue;
        }
      }
      if(variant.castWalk){
        if(name==='walk'&&walk){
          if(!variant.castWalk.exiting){variant.action=variant.mixer.clipAction(walk);variant.castWalk.fadeToWalk(variant.action);}
          walkExit=true;
        }else{
          // The full Walk may already be fading in alongside the auxiliary
          // layers. Interrupt all of them before starting a full-body action.
          variant.mixer.stopAllAction();variant.castWalk=undefined;variant.action=undefined;layerRestart=true;
        }
      }
      const restart=!walkExit&&(layerRestart||this.animation!==name||this.cueSequence!==sequence);
      const synchronize=sequence!==undefined&&(fixedAge||restart||this.cueElapsed!==cue!.elapsed);
      if(restart){
        const authoredName=name==='walk'?variant.motion?.locomotion.clip:name==='attack'?variant.motion?.attack.clip:undefined;
        // Prefer a unit's dedicated work/spell performance. Older five-clip
        // assets still use their attack, including its authored metadata name.
        const legacyAction=isWorkAnimation(name)||name.startsWith('cast');
        const clip=(authoredName&&variant.clips.find(c=>c.name===authoredName))??variant.clips.find(c=>c.name.toLowerCase()===name)??
          (legacyAction?(variant.clips.find(c=>c.name===variant.motion?.attack.clip)??variant.clips.find(c=>c.name.toLowerCase()==='attack')):undefined)??
          variant.clips.find(c=>c.name.toLowerCase()==='idle');
        // A semantic work/cast transition may still resolve to the same
        // legacy loop. Keep its phase unless an attack cue or death restarts it.
        const legacyLoop=(state:string)=>isWorkAnimation(state)||state==='cast'||state==='attack';
        const continuing=clip&&variant.action?.getClip()===clip&&sequence===undefined&&this.cueSequence===undefined&&legacyLoop(name)&&legacyLoop(this.animation);
        if(clip&&!continuing){
          const next=variant.mixer.clipAction(clip),once=name==='death'||sequence!==undefined;
          next.reset();next.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);next.clampWhenFinished=once;next.play();
          if(variant.action&&variant.action!==next){
            const reactionTransition=name==='hurt'||this.animation==='hurt';
            if(this.animation==='hurt'&&(name==='attack'||name.startsWith('cast')||name==='death')||this.animation.startsWith('cast')&&name==='death'||sequence!==undefined&&cue!.elapsed>.15)variant.action.stop();
            else next.crossFadeFrom(variant.action,reactionTransition?HURT_FADE:.15,!reactionTransition&&sequence===undefined);
          }
          next.setEffectiveTimeScale(sequence!==undefined&&name==='attack'?clip.duration/(variant.motion?.attack.durationSeconds??clip.duration):1);
          variant.action=next;
        }
      }
      if(name==='walk'&&variant.motion&&variant.action){
        variant.action.setEffectiveTimeScale(walkScale);
      }
      const finishWalkExit=walkExit&&variant.castWalk!.advanceExit(dt,walkScale);
      // Attack interpolates between ticks. Hit/spell pose and entry fade hold
      // until the accepted simulation age advances, including when paused.
      if(synchronize&&variant.action){
        const action=variant.action,clipDuration=action.getClip().duration,playbackDuration=casting?CAST_WINDOW:name==='attack'?variant.motion?.attack.durationSeconds??clipDuration:clipDuration;
        action.time=Math.min(clipDuration,Math.max(0,cue!.elapsed*clipDuration/playbackDuration));action.paused=true;
        const fadeDelta=fixedAge?Math.max(0,cue!.elapsed-(restart?0:this.cueElapsed??0)):dt;
        variant.mixer.update(fadeDelta);action.paused=fixedAge||cue!.elapsed>=playbackDuration;
      }else variant.mixer.update(dt);
      if(finishWalkExit){variant.castWalk!.stop();variant.castWalk=undefined;}
    }
    this.animation=name;this.cueSequence=sequence;this.cueElapsed=sequence!==undefined?cue!.elapsed:undefined;
  }
  dispose():void {this.staticTransform?.update(false);for(const mixer of new Set(this.variants.map(v=>v.mixer))){mixer.stopAllAction();mixer.uncacheRoot(mixer.getRoot());}this.skeletons.forEach(s=>s.dispose());this.skeletons.clear();this.owned.forEach(m=>m.dispose());this.construction.forEach(c=>releaseConstruction(c.asset));this.construction=[];this.root.removeFromParent();}
}
export class ModelLibrary {
  private models=new Map<string,GLTF>();
  private manifest!:ModelManifest;
  private generation=0;
  private terrainTextures=new Map<string,THREE.Texture>();
  private effectTexture?:THREE.Texture;
  private sharedMaterials=new SharedMaterialLoader();
  private constructionAssets=new Map<GLTF,ConstructionAsset>();
  private instanceMaterials=new InstanceMaterials();
  private materialRegistry=new MaterialRegistry();
  async load(progress:(loaded:number,total:number)=>void,map?:'river'|'pass'):Promise<void>{
    const generation=++this.generation;
    const response=await fetch('/assets/games/rts/model-registry.json');if(!response.ok)throw new Error('Model registry unavailable');
    const data:unknown=await response.json();validateModelManifest(data);this.manifest=data;
    const manager=new THREE.LoadingManager();this.sharedMaterials.manager=manager;manager.addHandler(/^(\.\.\/){1,2}materials\/detail-v1\/[a-z-]+\.(jpg|png)$/,this.sharedMaterials);
    manager.addHandler(/^(\.\.\/){1,2}materials\/unit-shared\/[a-f0-9]{64}\.(jpg|png|webp)$/,this.sharedMaterials);
    // Named shared material sets (polish-v1 equipment atlas, cut stone, oak, ...) are referenced by many GLBs: one download each.
    manager.addHandler(/^(\.\.\/){1,2}materials\/polish-v[0-9]+\/[a-z0-9-]+\.(jpg|png|webp)$/,this.sharedMaterials);
    manager.addHandler(/^(\.\.\/){1,2}terrain\/dirt-road\.png$/,this.sharedMaterials);
    const loader=new GLTFLoader(manager);let loaded=0;
    // Modest concurrency prevents dozens of decoded textures competing at once.
    const selectedLandmarks:readonly string[]=map?MAP_LANDMARK_MODELS[map]:LANDMARK_MODELS;
    const pending=REQUIRED_MODELS.filter(id=>(map==='pass'?id!=='stone-bridge'&&id!=='oak':map==='river'?id!=='pine':true)&&(!LANDMARK_MODELS.includes(id)||selectedLandmarks.includes(id))).flatMap(id=>[{id,url:data.assets[id].url},...(data.assets[id].lod1?[{id:id+':lod1',url:data.assets[id].lod1!}]:[])]).filter(item=>!this.models.has(item.id));
    // Shared generic-collapse rubble lives in its own manifest, outside model-registry.json.
    for(const rubble of RUBBLE_MODELS)if(!this.models.has(rubble.id))pending.push({id:rubble.id,url:rubble.url});
    const terrainFiles={meadow:'meadow.webp',road:'dirt-road.webp',water:'river-water.webp','lush-grass':'lush-grass.webp','forest-floor':'forest-floor.webp','river-shingle':'river-shingle.webp','highland-scree':'highland-scree.webp'};
    for(const [id,file] of Object.entries(terrainFiles))if((id!=='water'||map!=='pass')&&!this.terrainTextures.has(id))pending.push({id:':terrain:'+id,url:'/assets/games/rts/terrain/'+file});
    if(data.landscape&&!this.terrainTextures.has('undergrowth'))pending.push({id:':terrain:undergrowth',url:data.landscape.undergrowth.url});
    if(data.effects&&!this.effectTexture)pending.push({id:':building-effects',url:data.effects.building.url});
    const total=pending.length;let failure:unknown;
    // GLTFLoader normally tolerates a missing image by returning an untextured
    // material. Published original surfaces are required, so fail and allow retry.
    manager.onError=url=>{if(url.includes('/materials/detail-v1/')||url.includes('/materials/unit-shared/')||/\/materials\/polish-v[0-9]+\//.test(url)||url.endsWith('/terrain/dirt-road.png'))failure=new Error('Required model texture unavailable: '+url);};
    if(!total){progress(1,1);return;}
    const results=await Promise.allSettled(Array.from({length:3},async()=>{
      while(pending.length&&!failure&&generation===this.generation){
        const {id,url}=pending.shift()!;
        try{if(id===':building-effects')this.effectTexture=await new THREE.TextureLoader().loadAsync(url);else if(id.startsWith(':terrain:'))this.terrainTextures.set(id.slice(9),await new THREE.TextureLoader().loadAsync(url));else{const gltf=await loader.loadAsync(url);
          // Alpha-to-coverage keeps distant oak / pine canopies solid instead of thin alpha-test speckle.
          if(id==='pine'||id==='oak')gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material])if(material.alphaTest>0)material.alphaToCoverage=true;});
          this.models.set(id,gltf);gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh)prepareSkinBounds(o);});batchCompatibleSkins(gltf.scene,gltf.animations);
          // After per-asset skin batching, before completed-building batching: both group by material identity.
          this.materialRegistry.canonicalize(gltf.scene);
          if(!this.constructionAssets.has(gltf)){const asset=retainConstruction(gltf);if(asset)this.constructionAssets.set(gltf,asset);}await prepareTeamMasks(gltf);}if(!failure&&generation===this.generation)progress(++loaded,total);}
        catch(error){failure=error;throw error;}
      }
    }));
    const rejected=results.find(r=>r.status==='rejected');
    if(failure||rejected||generation!==this.generation){this.dispose();throw rejected?.status==='rejected'?rejected.reason:failure??new Error('Model loading cancelled');}
  }
  terrain(id:'meadow'|'road'|'water'|'lush-grass'|'forest-floor'|'river-shingle'|'highland-scree'='meadow'):THREE.Texture {const texture=this.terrainTextures.get(id);if(!texture)throw new Error('Terrain not loaded: '+id);return texture;}
  undergrowth():THREE.Texture|undefined {return this.terrainTextures.get('undergrowth');}
  buildingEffects():THREE.Texture|undefined {return this.effectTexture;}
  instantiate(id:string,team:TeamId|-1=0,ghost=false):ModelInstance {
    const model=this.models.get(id);if(!model)throw new Error('Model not loaded: '+id);const rubble=RUBBLE_MODELS.find(m=>m.id===id),entry:ModelEntry=this.manifest.assets[id]??{url:rubble!.url,status:'published'};
    return new ModelInstance(model,entry,team,ghost,this.models.get(id+':lod1'),this.instanceMaterials);
  }
  dispose():void {
    ++this.generation;
    this.constructionAssets.forEach(asset=>releaseConstruction(asset));this.constructionAssets.clear();this.instanceMaterials.dispose();this.materialRegistry.clear();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    this.terrainTextures.forEach(texture=>textures.add(texture));this.terrainTextures.clear();
    if(this.effectTexture){textures.add(this.effectTexture);this.effectTexture=undefined;}
    for(const model of this.models.values())model.scene.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);if(m.userData.teamTintTexture instanceof THREE.Texture)textures.add(m.userData.teamTintTexture);}}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.models.clear();
    this.sharedMaterials.clear();
  }
}
