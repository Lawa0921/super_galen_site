import * as THREE from 'three';
import {BUILDINGS,UNITS,type BuildingKind} from './catalog';
import {groundFrame,cellAt,type RtsMap,type Vec2,type SceneryPlacement} from './maps';
import type {Entity} from './types';
import type {getTeamView} from './visibility';
import {ModelLibrary,type ModelInstance} from './models';
import {ResourceMemory} from './resource-memory';
import type {SpellPreview} from './targeting';
import {pickTarget} from './picking';
import {ProjectileLayer} from './projectile-layer';
import {roadGeometry,roadPaths,terrainMask,layeredGroundMaterial,riverGeometry} from './terrain';
import {channelGroundGeometry,channelFogGeometry,channelWaterGeometry,channelRoadPaths} from './river-channel';
import {channelBanks,RIVER} from './river-layout';
import {SceneryLayer} from './scenery';
import {createUndergrowth} from './districts';
import {UndergrowthLayer} from './undergrowth';
import {LandmarkLayer} from './landmarks';
import {SelectionPortrait} from './portrait';
import {UnitPresentation} from './unit-presentation';
import {workAnimation} from './unit-actions';
import {BuildingEffectLayer,type BuildingEffectInput} from './building-effects';
import {FogTextureSync} from './fog-texture';
import {ShadowCadence} from './shadow-cadence';
import {BuildingRubbleLayer,RUBBLE_MODELS,genericCollapsePose,applyCollapsePose,genericEffectAnchors} from './building-collapse';
import {StaticTransform} from './static-transform';
import {groundFootprint,pointInPolygon} from './camera-footprint';
import {rallyMarkers} from './feedback';
import {qualityProfile,applyShadowQuality,type GraphicsQuality} from './settings';
export type TeamView=ReturnType<typeof getTeamView>;
type Visual={instance:ModelInstance;key:string;height:number;motion:UnitPresentation};
export class Battlefield {
  readonly renderer:THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();
  /** Terrain, roads, scenery, landmarks, resources and props never move after construction:
   * their world matrices are cached and the per-frame scene traversal skips this subtree.
   * Only fog/LOD visibility changes below it. Never add moving objects here. */
  private staticWorld=new THREE.Group();
  private staticWorldTransform=new StaticTransform(this.staticWorld);
  readonly camera=new THREE.OrthographicCamera(-35,35,25,-25,.1,250);
  readonly center:Vec2;
  /** Gameplay zoom limits (orthographic span in metres). On the 288 m maps the view stops at 60 m so the land reads large. */
  static readonly ZOOM={min:24,max:60,initial:48};
  private span=Battlefield.ZOOM.initial;
  private sunAnchor={x:NaN,z:NaN};
  private shadowMoved=false;
  /** Ground quad under the screen corners, refreshed with every camera change (minimap viewport, on-screen tests). */
  viewFootprint:Vec2[]=[];
  private models=new Map<number,Visual>();
  private unitHeights=new Map<string,number>();
  private memories=new Map<number,Visual>();
  private props:Array<{instance:ModelInstance;point:Vec2}>=[];
  private scenery:SceneryLayer;
  private resourceGroves=new Map<string,SceneryLayer>();
  private undergrowth:UndergrowthLayer|null=null;
  private landmarks:LandmarkLayer;
  private resources=new Map<string,ModelInstance>();
  private resourceMemory=new ResourceMemory();
  private ownedGeometry:THREE.BufferGeometry[]=[];
  private ownedMaterial:THREE.Material[]=[];
  private ownedTexture:THREE.Texture[]=[];
  private fogData:Uint8Array;
  private fogTexture:THREE.DataTexture;
  private fogSync?:FogTextureSync;
  private ray=new THREE.Raycaster();
  private plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  private context:CanvasRenderingContext2D;
  private resizeObserver:ResizeObserver;
  private size={width:1,height:1};
  private disposed=false;
  private shadowCadence=new ShadowCadence();
  private projectiles:ProjectileLayer;
  private buildingEffects:BuildingEffectLayer|null=null;
  private rubble:BuildingRubbleLayer|null=null;
  private portrait:SelectionPortrait|null;
  private sun:THREE.DirectionalLight;
  /** Scales projected model height before LOD selection; below 1 prefers LOD1 sooner. */
  private lodScale=1;
  selection:number[]=[];
  box:{x1:number;y1:number;x2:number;y2:number}|null=null;
  placement:{position:Vec2;kind:BuildingKind;valid:boolean}|null=null;
  spell:SpellPreview|null=null;
  constructor(readonly canvas:HTMLCanvasElement,readonly overlay:HTMLCanvasElement,readonly map:RtsMap,private library:ModelLibrary,portraitFrame?:HTMLElement){
    this.portrait=portraitFrame?new SelectionPortrait(library,portraitFrame):null;
    this.staticWorld.name='Static world';this.scene.add(this.staticWorld);
    this.projectiles=new ProjectileLayer(library);
    const effectTexture=library.buildingEffects();if(effectTexture){this.buildingEffects=new BuildingEffectLayer(effectTexture);this.scene.add(this.buildingEffects.root);}
    this.rubble=new BuildingRubbleLayer(variant=>library.instantiate(RUBBLE_MODELS[variant].id,-1));this.scene.add(this.rubble.root);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;this.scene.background=new THREE.Color('#121e22');
    this.scene.add(new THREE.HemisphereLight('#dce5e6','#697d49',2.1));
    const sun=this.sun=new THREE.DirectionalLight('#ffe1ac',3.3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-70;sun.shadow.camera.right=70;sun.shadow.camera.top=70;sun.shadow.camera.bottom=-70;sun.shadow.camera.far=160;sun.shadow.bias=-.0005;sun.shadow.normalBias=.07;this.scene.add(sun,sun.target);
    this.center={...map.spawns[0]};this.context=overlay.getContext('2d')!;
    const frame=groundFrame(map),mid={x:map.width/2,z:map.height/2};
    const groundTexture=library.terrain(),layers=(['lush-grass','forest-floor','river-shingle','highland-scree'] as const).map(id=>library.terrain(id)) as [THREE.Texture,THREE.Texture,THREE.Texture,THREE.Texture];
    for(const texture of [groundTexture,...layers]){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(frame.width/6,frame.height/6);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;}
    const channel=map.terrainProfile==='meandering-river';
    const mask=terrainMask(map,channel?channelBanks:undefined),maskTexture=new THREE.DataTexture(mask.data,mask.width,mask.height,THREE.RGBAFormat);maskTexture.magFilter=THREE.LinearFilter;maskTexture.minFilter=THREE.LinearFilter;maskTexture.needsUpdate=true;this.ownedTexture.push(maskTexture);
    this.ground(channel?channelGroundGeometry():new THREE.PlaneGeometry(frame.width,frame.height),layeredGroundMaterial(groundTexture,layers,maskTexture,frame,channel),mid.x,mid.z,0);
    if(map.id==='river'){
      const water=library.terrain('water');water.wrapS=water.wrapT=THREE.RepeatWrapping;water.repeat.set(1,channel?1:24);water.colorSpace=THREE.SRGBColorSpace;water.anisotropy=8;
      const geometry=channel?channelWaterGeometry():riverGeometry(),material=new THREE.MeshStandardMaterial({map:water,roughness:.32,metalness:.05}),mesh=new THREE.Mesh(geometry,material);
      mesh.receiveShadow=true;this.ownedGeometry.push(geometry);this.ownedMaterial.push(material);this.staticWorld.add(mesh);
    }
    const road=library.terrain('road');road.wrapS=THREE.ClampToEdgeWrapping;road.wrapT=THREE.RepeatWrapping;road.colorSpace=THREE.SRGBColorSpace;road.anisotropy=8;
    const roadMaterial=new THREE.MeshStandardMaterial({map:road,roughness:.88,transparent:true,depthWrite:false});this.ownedMaterial.push(roadMaterial);
    // Both roads and fog are transparent: draw roads first regardless of camera sorting.
    for(const path of channel?channelRoadPaths(map):roadPaths(map)){const geometry=roadGeometry(path,3),mesh=new THREE.Mesh(geometry,roadMaterial);mesh.renderOrder=-1;mesh.receiveShadow=true;this.ownedGeometry.push(geometry);this.staticWorld.add(mesh);}
    this.fogData=new Uint8Array(frame.width*frame.height*4);for(let i=0;i<this.fogData.length;i+=4)this.fogData.set([9,18,23,248],i);
    this.fogTexture=new THREE.DataTexture(this.fogData,frame.width,frame.height,THREE.RGBAFormat);this.fogTexture.colorSpace=THREE.SRGBColorSpace;this.fogTexture.magFilter=THREE.LinearFilter;this.fogTexture.minFilter=THREE.LinearFilter;this.fogTexture.needsUpdate=true;this.ownedTexture.push(this.fogTexture);
    this.ground(channel?channelFogGeometry():new THREE.PlaneGeometry(frame.width,frame.height),new THREE.MeshBasicMaterial({map:this.fogTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),mid.x,mid.z,channel?0:.04);
    this.scenery=new SceneryLayer(map.scenery??[],library,map.width);this.staticWorld.add(this.scenery.root);
    const undergrowth=library.undergrowth();
    if(undergrowth){undergrowth.colorSpace=THREE.SRGBColorSpace;undergrowth.anisotropy=4;this.undergrowth=new UndergrowthLayer(createUndergrowth(map),undergrowth,map.width);this.staticWorld.add(this.undergrowth.root);}
    this.landmarks=new LandmarkLayer(map.landmarks??[],library,map.width);this.staticWorld.add(this.landmarks.root);
    for(const landmark of map.landmarks??[]){
      const nearest=(points:Vec2[])=>points.reduce((a,b)=>Math.hypot(a.x-landmark.x,a.z-landmark.z)<Math.hypot(b.x-landmark.x,b.z-landmark.z)?a:b);
      // Outposts lead to their base or expansion hall site, ruins to their camp.
      const target=landmark.district==='outpost'?nearest([...map.spawns,...map.resources.filter(r=>r.kind==='gold'&&r.id.includes('natural'))]):map.camps.reduce((a,b)=>Math.hypot(a.x-landmark.x,a.z-landmark.z)<Math.hypot(b.x-landmark.x,b.z-landmark.z)?a:b);
      const length=Math.hypot(target.x-landmark.x,target.z-landmark.z),edge={x:landmark.x+(target.x-landmark.x)*1.7/length,z:landmark.z+(target.z-landmark.z)*1.7/length};
      const geometry=roadGeometry([target,edge],1.35),mesh=new THREE.Mesh(geometry,roadMaterial);mesh.renderOrder=-1;mesh.receiveShadow=true;this.ownedGeometry.push(geometry);this.staticWorld.add(mesh);
    }
    if(map.id==='river')for(const z of RIVER.bridges)this.addProp('stone-bridge',{x:RIVER.centerX,z});
    for(const r of map.resources){
      const model=library.instantiate(r.kind==='gold'?'gold-mine':'timber-pile');model.root.position.set(r.x,0,r.z);model.root.userData.resourceId=r.id;this.resources.set(r.id,model);this.staticWorld.add(model.root);
      if(r.kind==='wood'){
        const placements:SceneryPlacement[]=[];
        for(let i=0;i<12;i++){const angle=i*2.39996,radius=2.8+(i%3)*1.25;const p={x:r.x+Math.cos(angle)*radius,z:r.z+Math.sin(angle)*radius};if(p.x<1||p.x>map.width-1||p.z<1||p.z>map.height-1)continue;
          placements.push({...p,kind:map.id==='pass'?'pine':'oak',radius:0,scale:.48+(i%4)*.055,rotation:angle,onOriginalObstacle:false});
        }
        const grove=new SceneryLayer(placements,library,map.width,r.id);this.resourceGroves.set(r.id,grove);this.staticWorld.add(grove.root);
      }
    }
    this.scene.add(this.projectiles.root);this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }
  private ground(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,z:number,y:number){const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;this.staticWorld.add(mesh);this.ownedGeometry.push(geometry);this.ownedMaterial.push(material);}
  private addProp(id:string,point:Vec2):ModelInstance {const instance=this.library.instantiate(id);instance.root.position.set(point.x,0,point.z);this.staticWorld.add(instance.root);this.props.push({instance,point});return instance;}
  get rubbleCount():number {return this.rubble?.size??0;}
  private resize(){const r=this.canvas.getBoundingClientRect();this.size={width:r.width,height:r.height};this.renderer.setSize(r.width,r.height,false);this.overlay.width=r.width;this.overlay.height=r.height;this.updateCamera();}
  private updateCamera(){const aspect=this.size.width/Math.max(1,this.size.height);this.camera.left=-this.span*aspect/2;this.camera.right=this.span*aspect/2;this.camera.top=this.span/2;this.camera.bottom=-this.span/2;// Overview captures wider than 80 m back the camera off along its own view axis
    // (an orthographic image is unchanged) so the near half of the map is not clipped.
    const back=Math.max(1,this.span/80);this.camera.far=250*back;
    this.camera.position.set(this.center.x+24*back,52*back,this.center.z+35*back);this.camera.lookAt(this.center.x,0,this.center.z);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.viewFootprint=groundFootprint(this.camera);this.followSun();}
  /** The ±70 m shadow frustum follows the camera in 8 m steps; a step re-renders the shadow map once. */
  private followSun(){const x=Math.round(this.center.x/8)*8,z=Math.round(this.center.z/8)*8,aspect=this.size.width/Math.max(1,this.size.height);
    // ±70 m keeps the original texel density up close; wider zoom (and overview captures) widen it in 10 m steps.
    const extent=Math.max(70,Math.ceil((this.span*Math.max(1,aspect)/2+12)/10)*10),camera=this.sun.shadow.camera;
    if(x===this.sunAnchor?.x&&z===this.sunAnchor?.z&&camera.right===extent)return;
    if(camera.right!==extent){camera.left=camera.bottom=-extent;camera.right=camera.top=extent;camera.updateProjectionMatrix();}
    this.sunAnchor={x,z};this.sun.target.position.set(x,0,z);this.sun.position.set(x-33,65,z-22);this.sun.target.updateMatrixWorld();this.sun.updateMatrixWorld();this.shadowMoved=true;}
  get viewSpan():number {return this.span;}
  /** Low quality skips the shadow pass, renders at 1x pixel ratio and prefers LOD1; model assets are untouched. */
  setQuality(quality:GraphicsQuality){const profile=qualityProfile(quality);applyShadowQuality(this.renderer,this.sun,profile);
    this.renderer.setPixelRatio(Math.min(profile.pixelRatioCap,window.devicePixelRatio||1));this.lodScale=profile.lodScale;this.resize();}
  inView(p:Vec2):boolean{return pointInPolygon(p,this.viewFootprint);}
  pan(dx:number,dz:number){this.center.x=Math.max(0,Math.min(this.map.width,this.center.x+dx));this.center.z=Math.max(0,Math.min(this.map.height,this.center.z+dz));this.updateCamera();}
  focus(p:Vec2){this.center.x=p.x;this.center.z=p.z;this.updateCamera();}
  zoom(delta:number){this.span=Math.max(Battlefield.ZOOM.min,Math.min(Battlefield.ZOOM.max,this.span+delta));this.updateCamera();}
  /** Absolute orthographic span; gameplay zoom stays clamped, overview captures may exceed it. */
  setSpan(span:number){this.span=span;this.updateCamera();}
  world(clientX:number,clientY:number):Vec2|null {const r=this.canvas.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),this.camera);const p=this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());return p&&p.x>=0&&p.z>=0&&p.x<this.map.width&&p.z<this.map.height?{x:p.x,z:p.z}:null;}
  private renderedPoint(p:Vec2 & {id?:number}):Vec2 {return (p.id===undefined?undefined:this.models.get(p.id)?.instance.root.position)??p;}
  screen(point:Vec2 & {id?:number},y=0):{x:number;y:number} {const p=this.renderedPoint(point),v=new THREE.Vector3(p.x,y,p.z).project(this.camera);return {x:(v.x+1)*this.size.width/2,y:(1-v.y)*this.size.height/2};}
  /** Visual centres follow models; validity and commands retain simulation coordinates. */
  spellPresentation():SpellPreview|null {return this.spell?{...this.spell,origin:this.renderedPoint(this.spell.origin),target:this.spell.target?this.renderedPoint(this.spell.target):undefined}:null;}
  pick(x:number,y:number):{entityId?:number;resourceId?:string}|null {
    const r=this.canvas.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),this.camera);
    const roots=[...this.models.values()].map(v=>v.instance.root).concat([...this.resources.values()].map(m=>m.root),[...this.resourceGroves.values()].map(g=>g.root)).filter(o=>o.visible);
    return pickTarget(this.ray.intersectObjects(roots,true));
  }
  private visual(entity:Pick<Entity,'kind'|'category'|'team'> & {tier?:number},ghost=false):Visual {
    const key=entity.kind==='townhall'&&(entity.tier??1)>1?`townhall-tier${entity.tier}`:entity.kind;
    const instance=this.library.instantiate(key,entity.team,ghost);
    // Animation culling bounds cover swings and falls, not the standing body.
    // Measure real vertices once per unit kind for LOD and health-bar placement.
    let height=entity.category==='unit'?this.unitHeights.get(key):undefined;
    if(height===undefined){
      if(entity.category==='unit'){
        instance.root.updateWorldMatrix(true,true);
        // Box3 updates world matrices but not SkinnedMesh's attached bind inverse.
        // Synchronize both LOD skins before measuring a scaled instance.
        instance.root.traverse(node=>{if(node instanceof THREE.SkinnedMesh)node.updateMatrixWorld(true);});
      }
      height=new THREE.Box3().setFromObject(instance.root,entity.category==='unit').getSize(new THREE.Vector3()).y;
      if(entity.category==='unit')this.unitHeights.set(key,height);
    }
    return {instance,key,height,motion:new UnitPresentation()};
  }
  render(view:TeamView,dt:number,interpolation=1):void {
    if(this.disposed)return;const current=new Set(view.entities.map(e=>e.id));let shadowDirty=false;
    for(const [id,v] of this.models)if(!current.has(id)){v.instance.dispose();this.models.delete(id);shadowDirty=true;}
    for(const e of view.entities){
      const key=e.kind==='townhall'&&e.category==='building'&&e.tier>1?`townhall-tier${e.tier}`:e.kind;let v=this.models.get(e.id);
      if(v&&v.key!==key){v.instance.dispose();this.models.delete(e.id);v=undefined;shadowDirty=true;}
      if(!v){v=this.visual(e);this.models.set(e.id,v);this.scene.add(v.instance.root);shadowDirty=true;}
      if(e.alive)v.instance.root.userData.entityId=e.id;else delete v.instance.root.userData.entityId;
      const root=v.instance.root,staged=e.category==='building'&&v.instance.setConstruction(e.construction);root.position.set(e.x,e.category==='building'&&!staged?(1-e.construction)*-v.height:0,e.z);
      if(e.category==='building'&&!e.alive&&e.removalReason!=='cancelled'){
        const age=Math.max(0,view.time-(e.deathTime??view.time));
        // Art without authored lifecycle data uses the shared generic collapse and rubble.
        if(!v.instance.setDestruction(age,e.construction)){applyCollapsePose(root,genericCollapsePose(age,v.height,e.id));this.rubble?.observe(e);}
      }
      if(e.category==='building')v.instance.cacheBuildingTransform(e.alive&&e.construction===1);
      if(e.category==='unit'){
        const pose=v.motion.sample(e,view.time,interpolation,UNITS[e.kind].speed);root.position.set(pose.x,0,pose.z);
        root.rotation.y=pose.facing+Math.PI+v.instance.yaw;v.instance.setDetailPixels(Math.abs(this.screen(pose,v.height).y-this.screen(pose).y)*this.lodScale);
        const animation=e.animation==='walk'&&pose.speed<.001?'idle':workAnimation(e,view);
        v.instance.animate(animation,dt,animation==='attack'&&e.attackCue?{sequence:e.attackCue.sequence,elapsed:Math.max(0,view.time-e.attackCue.startedAt)}:undefined,animation==='walk'?pose.speed:0,
          e.hurtCue?{sequence:e.hurtCue.sequence,elapsed:view.time-e.hurtCue.startedAt}:undefined,
          e.castCue?{kind:e.castCue.kind,sequence:e.castCue.sequence,elapsed:view.time-e.castCue.startedAt}:undefined);
      }
    }
    if(this.buildingEffects){
      const inputs:BuildingEffectInput[]=[];for(const e of view.entities)if(e.category==='building'){
        const v=this.models.get(e.id)!,anchors=v.instance.buildingEffectAnchors()??genericEffectAnchors(e,v.height);inputs.push({building:e,anchors});
      }
      this.buildingEffects.update(inputs,view.time);
    }
    this.rubble?.update(view.time,view.explored,view.entities.filter(e=>e.alive&&e.category==='building').map(e=>({x:e.x,z:e.z,width:BUILDINGS[e.kind as BuildingKind].width,depth:BUILDINGS[e.kind as BuildingKind].depth})),this.map.width);
    const remembered=new Set(view.knownBuildings.map(e=>e.id));for(const [id,v] of this.memories)if(!remembered.has(id)){v.instance.dispose();this.memories.delete(id);}
    for(const e of view.knownBuildings)if(!this.memories.has(e.id)){const v=this.visual({...e,category:'building'},true),progress=e.construction??0,staged=v.instance.setConstruction(progress);v.instance.root.position.set(e.x,staged?0:(1-progress)*-v.height,e.z);this.memories.set(e.id,v);this.scene.add(v.instance.root);v.instance.freezeTransform();}
    if((this.fogSync??=new FogTextureSync(this.fogData,this.map)).update(view.visible,view.explored))this.fogTexture.needsUpdate=true;
    this.resourceMemory.observe(view.resources);
    this.scenery.update(view.explored);
    for(const [id,grove] of this.resourceGroves){grove.root.visible=!this.resourceMemory.isExhausted(id);if(grove.root.visible)grove.update(view.explored);}
    this.undergrowth?.update(view.explored,[...view.entities.filter(e=>e.category==='building').map(e=>({x:e.x,z:e.z,width:BUILDINGS[e.kind as BuildingKind].width,depth:BUILDINGS[e.kind as BuildingKind].depth})),...view.knownBuildings.map(e=>({x:e.x,z:e.z,width:BUILDINGS[e.kind].width,depth:BUILDINGS[e.kind].depth})),...(this.map.landmarks??[])]);
    this.landmarks.update(view.explored,(point,height)=>Math.abs(this.screen(point,height).y-this.screen(point).y)*this.lodScale);
    for(const {instance,point} of this.props)instance.root.visible=view.explored[cellAt(this.map,point)]===1&&(!instance.root.userData.resourceId||!this.resourceMemory.isExhausted(instance.root.userData.resourceId));
    for(const [id,instance] of this.resources){const r=this.map.resources.find(r=>r.id===id)!;instance.root.visible=!this.resourceMemory.isExhausted(id)&&view.explored[cellAt(this.map,r)]===1;}
    this.projectiles.update(view.projectiles,view.entities);
    this.renderer.shadowMap.needsUpdate=this.shadowCadence.update(dt,shadowDirty||this.shadowMoved,this.span<48);this.shadowMoved=false;
    // Cheap root comparison; recomputes the cached subtree only if the static world root moved.
    this.staticWorldTransform?.update(true);
    this.renderer.render(this.scene,this.camera);this.drawOverlay(view);
    this.portrait?.update(view,this.selection,dt);
    const portraitRect=this.portrait?.render(this.renderer,this.canvas.getBoundingClientRect());
    if(portraitRect)this.context.clearRect(portraitRect.x,portraitRect.y,portraitRect.width,portraitRect.height);
  }
  private drawOverlay(view:TeamView){const c=this.context;c.clearRect(0,0,this.size.width,this.size.height);
    for(const e of view.entities){if(!e.alive)continue;const selected=this.selection.includes(e.id),v=this.models.get(e.id)!,position=v.instance.root.position;if(selected){const p=this.screen(position),r=e.category==='building'?Math.max(BUILDINGS[e.kind].width,BUILDINGS[e.kind].depth)/2:UNITS[e.kind].radius+.25;const side=this.screen({x:position.x+r,z:position.z});c.strokeStyle=e.team===0?'#b8d993':'#d67e65';c.lineWidth=1.5;c.beginPath();c.ellipse(p.x,p.y,Math.max(7,Math.abs(side.x-p.x)),Math.max(4,Math.abs(side.x-p.x)*.55),0,0,Math.PI*2);c.stroke();}
      if(selected||e.hp<e.maxHp){const p=this.screen(position,v.height+.25),w=e.category==='building'?60:32;c.fillStyle='#10201bdd';c.fillRect(p.x-w/2-1,p.y-1,w+2,6);c.fillStyle=e.team===0?'#97bb76':'#bf6255';c.fillRect(p.x-w/2,p.y,w*Math.max(0,e.hp/e.maxHp),4);}
    }
    for(const {from,to,resource} of rallyMarkers(view,this.selection)){
      const a=this.screen(from),b=this.screen(to,.05),top=this.screen(to,2.4),h=b.y-top.y;c.save();c.lineWidth=1.5;c.strokeStyle='#e6dbc0b3';c.setLineDash([6,5]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.setLineDash([]);
      c.strokeStyle='#e6dbc0';c.lineWidth=2;c.beginPath();c.moveTo(b.x,b.y);c.lineTo(top.x,top.y);c.stroke();c.beginPath();c.ellipse(b.x,b.y,7,3.5,0,0,Math.PI*2);c.stroke();
      c.fillStyle=resource?'#d5b770':'#76b7e1';c.beginPath();c.moveTo(top.x,top.y);c.lineTo(top.x+h*.6,top.y+h*.2);c.lineTo(top.x,top.y+h*.4);c.closePath();c.fill();c.restore();
    }
    if(this.box){const b=this.box;c.strokeStyle='#d4cc9b';c.fillStyle='#bbd9a71a';c.fillRect(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1);c.strokeRect(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1);}
    if(this.spell){
      const spell=this.spellPresentation()!,color=spell.valid?'#b9e2a1':'#e69b78';
      const polygon=(points:Vec2[],fill:boolean)=>{c.beginPath();points.map(p=>this.screen(p,.07)).forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.stroke();if(fill)c.fill();};
      const ring=(center:Vec2,radius:number)=>Array.from({length:64},(_,i)=>({x:center.x+Math.sin(i*Math.PI/32)*radius,z:center.z+Math.cos(i*Math.PI/32)*radius}));
      c.lineWidth=1.5;c.strokeStyle=color;c.fillStyle=spell.valid?'#b9e2a126':'#e69b7826';polygon(ring(spell.origin,spell.range),spell.skill==='banner');
      if(spell.skill==='cleave'){const angle=Math.atan2(spell.aim.x-spell.origin.x,spell.aim.z-spell.origin.z);polygon([spell.origin,...Array.from({length:33},(_,i)=>{const a=angle-Math.PI/3+i*Math.PI/48;return {x:spell.origin.x+Math.sin(a)*spell.range,z:spell.origin.z+Math.cos(a)*spell.range};})],true);}
      if(spell.skill==='mend'&&spell.target)polygon(ring(spell.target,.9),true);
    }
    if(this.placement){const {position:p,kind,valid}=this.placement,d=BUILDINGS[kind],corners=[{x:p.x-d.width/2,z:p.z-d.depth/2},{x:p.x+d.width/2,z:p.z-d.depth/2},{x:p.x+d.width/2,z:p.z+d.depth/2},{x:p.x-d.width/2,z:p.z+d.depth/2}].map(p=>this.screen(p));c.beginPath();corners.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.strokeStyle=valid?'#cce2a9':'#f18472';c.fillStyle=valid?'#a1c97c33':'#f1847233';c.fill();c.stroke();}
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.resizeObserver.disconnect();this.portrait?.dispose();this.buildingEffects?.dispose();this.rubble?.dispose();for(const v of [...this.models.values(),...this.memories.values()])v.instance.dispose();this.scenery.dispose();this.resourceGroves.forEach(g=>g.dispose());this.resourceGroves.clear();this.undergrowth?.dispose();this.landmarks.dispose();this.props.forEach(p=>p.instance.dispose());this.resources.forEach(p=>p.dispose());this.ownedGeometry.forEach(g=>g.dispose());this.ownedMaterial.forEach(m=>m.dispose());this.ownedTexture.forEach(t=>t.dispose());this.projectiles.dispose();this.renderer.dispose();this.renderer.forceContextLoss();}
}
