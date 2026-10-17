import {describe,it,expect,vi,afterEach} from 'vitest';
import * as THREE from 'three';
import {ShadowCadence} from './shadow-cadence';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {Battlefield} from './scene';
import {ModelInstance,ModelLibrary,REQUIRED_MODELS} from './models';
import {LANDMARK_MODELS} from './landmark-models';
import {UnitPresentation} from './unit-presentation';
import {createGame} from './simulation';
import {addBuilding,destroyEntity} from './state';
import {getTeamView} from './visibility';
import {BuildingEffectTimeline} from './building-effects';
import {
  COLLAPSE_SECONDS,RUBBLE_APPEAR_AGE,RUBBLE_LIFETIME_SECONDS,RUBBLE_SINK_SECONDS,RUBBLE_MODELS,
  genericCollapsePose,applyCollapsePose,genericEffectAnchors,BuildingRubbleLayer,
} from './building-collapse';

const entry={url:'/assets/games/rts/models/house.glb',status:'published' as const};
/** Construction-staged building art without any rtsBuildingLifecycle data,
 * matching every currently published building GLB. */
function staged(lifecycle=false){
  const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  scene.userData.rtsConstruction={version:1,thresholds:[0,.18,.55,.82],stages:[0,1,2,3].map(id=>({id,name:'stage-'+id}))};
  for(let stage=0;stage<4;stage++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.position.set(0,stage+.5,0);
    mesh.userData={rtsConstructionStage:stage,rtsPartIds:['p-'+stage],rtsSourcePartIds:['s-'+stage],rtsSourceObjects:['o-'+stage]};
    if(lifecycle)mesh.userData.rtsDestructionCluster='stage-'+stage;scene.add(mesh);
  }
  if(lifecycle)scene.userData.rtsBuildingLifecycle={version:1,destructionSeconds:3,damageThresholds:[.65,.3],clusters:[0,1,2,3].map(id=>({id:'stage-'+id,pivot:[0,0,0],axis:[0,0,1],angle:id?1:0,translation:[0,0,0],delay:0,duration:1})),anchors:{impact:[[0,1,0]],repair:[[0,0,0]]},replacementSets:[]};
  return new ModelInstance({scene,animations:[]} as unknown as GLTF,entry);
}
function fakeRubble(){
  const made:Array<{variant:number;root:THREE.Object3D;dispose:ReturnType<typeof vi.fn>}>=[];
  const create=(variant:number)=>{const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(4,1,4)));const item={variant,root,dispose:vi.fn(()=>root.removeFromParent())};made.push(item);return item;};
  return {made,create};
}
const explored=(value=1)=>new Uint8Array(96*96).fill(value);
function deadHouse(deathTime=10,construction=1){
  const state=createGame('river'),house=addBuilding(state,0,'house',{x:30,z:40},true);house.construction=construction;state.time=deathTime;destroyEntity(state,house);return {state,house};
}

describe('generic data-free building collapse pose',()=>{
  it('sinks monotonically with tilt and decaying shake, then hides after the collapse window',()=>{
    const start=genericCollapsePose(0,4,7);expect(start.sink).toBe(0);expect(start.visible).toBe(true);
    let previous=-1;for(let age=0;age<=COLLAPSE_SECONDS;age+=.1){const pose=genericCollapsePose(age,4,7);expect(pose.sink).toBeGreaterThanOrEqual(previous);previous=pose.sink;}
    const late=genericCollapsePose(COLLAPSE_SECONDS-.01,4,7);expect(late.sink).toBeGreaterThan(4*.9);
    expect(Math.hypot(late.tiltX,late.tiltZ)).toBeGreaterThan(.05);expect(Math.hypot(late.tiltX,late.tiltZ)).toBeLessThan(.3);
    const mid=genericCollapsePose(.4,4,7);expect(Math.hypot(mid.shakeX,mid.shakeZ)).toBeLessThan(.12);
    expect(genericCollapsePose(COLLAPSE_SECONDS,4,7).visible).toBe(false);
    expect(COLLAPSE_SECONDS).toBeGreaterThanOrEqual(2);expect(COLLAPSE_SECONDS).toBeLessThan(3);
  });
  it('is a pure function of game age so a paused clock freezes it, and differs per building seed',()=>{
    expect(genericCollapsePose(1.3,5,3)).toEqual(genericCollapsePose(1.3,5,3));
    const a=genericCollapsePose(2,5,3),b=genericCollapsePose(2,5,4);expect([a.tiltX,a.tiltZ]).not.toEqual([b.tiltX,b.tiltZ]);
    expect(()=>genericCollapsePose(Number.NaN,5,3)).toThrow();
  });
  it('releases a cached static building transform so the sink is actually rendered',()=>{
    const model=staged(),world=new THREE.Scene();world.add(model.root);model.root.position.set(3,0,8);
    model.cacheBuildingTransform(true);world.updateMatrixWorld(true);expect(model.root.matrixAutoUpdate).toBe(false);
    const mesh=model.root.children[0].children[3],before=new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).y;
    expect(model.setDestruction(1.5,1)).toBe(false);
    model.root.position.set(3,0,8);applyCollapsePose(model.root,genericCollapsePose(1.5,4,1));
    model.cacheBuildingTransform(false);world.updateMatrixWorld(true);
    expect(model.root.matrixAutoUpdate).toBe(true);expect(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).y).toBeLessThan(before-.5);
    model.cacheBuildingTransform(true);expect(model.root.matrixAutoUpdate).toBe(true);model.dispose();
  });
  it('derives footprint-corner effect anchors for buildings without authored anchors',()=>{
    const anchors=genericEffectAnchors({kind:'barracks',x:20,z:30},5);
    expect(anchors.collapse).toHaveLength(4);
    for(const [x,,z] of anchors.collapse!){expect(Math.abs(x-20)).toBeGreaterThan(2);expect(Math.abs(x-20)).toBeLessThanOrEqual(3);expect(Math.abs(z-30)).toBeGreaterThan(2);expect(Math.abs(z-30)).toBeLessThanOrEqual(3);}
    expect(Math.max(...anchors.impact.map(p=>p[1]))).toBeGreaterThan(3);expect(anchors.repair.length).toBeGreaterThan(0);
  });
});

describe('generic collapse dust',()=>{
  it('bursts dust at each footprint corner and smoke over the centre from the existing atlas, frozen by game time',()=>{
    const state=createGame('river'),house=addBuilding(state,0,'house',{x:30,z:40},true),fx=new BuildingEffectTimeline();
    const anchors=genericEffectAnchors(house,4);fx.update([{building:house,anchors}],5);
    state.time=5;destroyEntity(state,house);
    const samples=fx.update([{building:house,anchors}],6);
    const dust=samples.filter(s=>s.kind==='impact-dust');expect(dust.length).toBeGreaterThanOrEqual(4);
    const corners=new Set(dust.map(s=>`${Math.sign(s.position[0]-30)},${Math.sign(s.position[2]-40)}`));for(const c of ['1,1','1,-1','-1,1','-1,-1'])expect(corners.has(c)).toBe(true);
    expect(samples.some(s=>s.kind==='damage-smoke')).toBe(true);
    expect(fx.update([{building:house,anchors}],6)).toEqual(samples);
    expect(fx.update([{building:house,anchors}],5+COLLAPSE_SECONDS+.35)).toEqual([]);
  });
});

describe('building rubble layer',()=>{
  it('emerges mid-collapse scaled to the footprint, holds, sinks out and is disposed on expiry',()=>{
    const {house}=deadHouse(10),{made,create}=fakeRubble(),layer=new BuildingRubbleLayer(create);
    layer.observe(house);layer.observe(house);layer.update(10.2,explored(),[],96);expect(made).toHaveLength(0);
    layer.update(10+RUBBLE_APPEAR_AGE+.05,explored(),[],96);expect(made).toHaveLength(1);
    const rubble=made[0].root;expect(rubble.parent).toBe(layer.root);expect(rubble.position.x).toBe(30);expect(rubble.position.z).toBe(40);
    const rising=rubble.scale.y;layer.update(10+COLLAPSE_SECONDS,explored(),[],96);expect(rubble.scale.y).toBeGreaterThan(rising);
    expect(Math.abs(rubble.scale.x)/(4/4*.92)).toBeGreaterThanOrEqual(.92);expect(Math.abs(rubble.scale.x)/(4/4*.92)).toBeLessThanOrEqual(1.08);expect(rubble.position.y).toBe(0);
    layer.update(10+RUBBLE_LIFETIME_SECONDS-RUBBLE_SINK_SECONDS/2,explored(),[],96);expect(rubble.position.y).toBeLessThan(0);
    expect(made[0].dispose).not.toHaveBeenCalled();expect(layer.size).toBe(1);
    layer.update(10+RUBBLE_LIFETIME_SECONDS,explored(),[],96);expect(made[0].dispose).toHaveBeenCalledOnce();expect(layer.size).toBe(0);
    layer.observe(house);layer.update(10+RUBBLE_LIFETIME_SECONDS+1,explored(),[],96);expect(made).toHaveLength(1);
  });
  it('freezes while paused, respects fog exploration and scales larger footprints',()=>{
    const state=createGame('river'),hall=addBuilding(state,1,'townhall',{x:60,z:60},true);state.time=2;destroyEntity(state,hall);
    const {made,create}=fakeRubble(),layer=new BuildingRubbleLayer(create);layer.observe(hall);
    layer.update(3.5,explored(),[],96);const frozen=made[0].root.matrix.clone(),scale=made[0].root.scale.clone();made[0].root.updateMatrix();
    layer.update(3.5,explored(),[],96);made[0].root.updateMatrix();expect(made[0].root.scale.equals(scale)).toBe(true);expect(frozen).toBeDefined();
    expect(Math.abs(made[0].root.scale.x)/(8/4*.92)).toBeGreaterThanOrEqual(.92);expect(Math.abs(made[0].root.scale.x)/(8/4*.92)).toBeLessThanOrEqual(1.08);expect(made[0].root.visible).toBe(true);
    layer.update(4,explored(0),[],96);expect(made[0].root.visible).toBe(false);
  });
  it('clears rubble when a new building is placed over it, and dispose releases everything',()=>{
    const {house}=deadHouse(10),{made,create}=fakeRubble(),layer=new BuildingRubbleLayer(create),scene=new THREE.Scene();scene.add(layer.root);
    layer.observe(house);layer.update(13,explored(),[],96);expect(made).toHaveLength(1);
    layer.update(14,explored(),[{x:31,z:41,width:4,depth:4}],96);expect(made[0].dispose).toHaveBeenCalledOnce();expect(layer.size).toBe(0);
    const other=deadHouse(20).house;other.id=99;layer.observe(other);layer.update(23,explored(),[],96);expect(made).toHaveLength(2);
    layer.dispose();expect(made[1].dispose).toHaveBeenCalledOnce();expect(layer.root.parent).toBeNull();
    layer.observe(other);layer.update(24,explored(),[],96);expect(made).toHaveLength(2);
  });
  it('clears rubble when a new footprint overlaps it at all, even with the rubble centre outside; edge-touching neighbours keep it',()=>{
    const {house}=deadHouse(10),{made,create}=fakeRubble(),layer=new BuildingRubbleLayer(create);
    layer.observe(house);layer.update(13,explored(),[],96);expect(made).toHaveLength(1);
    // House at (30,40) is 4x4: x∈[28,32]. A 4x4 at x=34 only touches the edge; at x=33.5 it overlaps by 0.5 m.
    layer.update(13.5,explored(),[{x:34,z:40,width:4,depth:4},{x:30,z:44,width:4,depth:4}],96);expect(made[0].dispose).not.toHaveBeenCalled();expect(layer.size).toBe(1);
    layer.update(14,explored(),[{x:33.5,z:43.5,width:4,depth:4}],96);expect(made[0].dispose).toHaveBeenCalledOnce();expect(layer.size).toBe(0);
  });
  it('ignores living and cancelled buildings and resets if the game clock restarts',()=>{
    const state=createGame('river'),alive=addBuilding(state,0,'house',{x:30,z:40},true),cancelled=addBuilding(state,0,'house',{x:50,z:40});
    state.time=4;destroyEntity(state,cancelled,'cancelled');const {made,create}=fakeRubble(),layer=new BuildingRubbleLayer(create);
    layer.observe(alive);layer.observe(cancelled);layer.update(30,explored(),[],96);expect(made).toHaveLength(0);
    const {house}=deadHouse(10);layer.observe(house);layer.update(12,explored(),[],96);expect(made).toHaveLength(1);
    layer.update(1,explored(),[],96);expect(made[0].dispose).toHaveBeenCalledOnce();expect(layer.size).toBe(0);
  });
  it('gives each building a deterministic full-circle yaw, mirrored variant choice and ±8% scale jitter',()=>{
    const place=(id:number)=>{const {made,create}=fakeRubble(),layer=new BuildingRubbleLayer(create),{house}=deadHouse(10);house.id=id;layer.observe(house);layer.update(13,explored(),[],96);const r=made[0].root;return {variant:made[0].variant,yaw:r.rotation.y,sx:r.scale.x,sz:r.scale.z,sy:r.scale.y};};
    const samples=Array.from({length:12},(_,i)=>place(i+1));
    expect(place(5)).toEqual(samples[4]);
    for(const p of samples){expect(p.yaw).toBeGreaterThanOrEqual(0);expect(p.yaw).toBeLessThan(Math.PI*2);const j=Math.abs(p.sx)/(4/4*.92);expect(j).toBeGreaterThanOrEqual(.92);expect(j).toBeLessThanOrEqual(1.08);expect(Math.abs(p.sz/p.sx)).toBeCloseTo(1,6);expect(p.sz).toBeGreaterThan(0);}
    // Seeded mirroring (negative X scale; three.js flips winding for negative determinants).
    expect(samples.some(p=>p.sx<0)).toBe(true);expect(samples.some(p=>p.sx>0)).toBe(true);
    const yaws=samples.map(p=>p.yaw);expect(new Set(yaws.map(y=>y.toFixed(3))).size).toBe(12);
    expect(yaws.filter(y=>Math.abs(y)<1e-9||Math.abs(y-Math.PI)<1e-9)).toHaveLength(0);
    const quadrants=new Set(yaws.map(y=>Math.floor(y/(Math.PI/2))));expect(quadrants.size).toBeGreaterThanOrEqual(3);
    expect(new Set(samples.map(p=>Math.abs(p.sx).toFixed(4))).size).toBeGreaterThan(6);
    // Variant choice is hashed, not id parity: consecutive ids are not a strict alternation.
    const variants=samples.map(p=>p.variant);expect(variants.some((v,i)=>i>0&&v===variants[i-1])).toBe(true);
  });
  it('alternates the two original rubble variants',()=>{
    expect(RUBBLE_MODELS.map(m=>m.id)).toEqual(['rubble-a','rubble-b']);
    for(const m of RUBBLE_MODELS)expect(m.url).toMatch(/^\/assets\/games\/rts\/models\/props\/rubble-[ab]\.glb$/);
    const {made,create}=fakeRubble(),layer=new BuildingRubbleLayer(create);
    for(const id of [1,2,3,4,5,6,7,8,9,10,11,12]){const {house}=deadHouse(10);house.id=id;house.x=10+id*6;layer.observe(house);}
    layer.update(12,explored(),[],96);expect(new Set(made.map(m=>m.variant))).toEqual(new Set([0,1]));
  });
});

function field(lifecycle:boolean){
  const result=Object.create(Battlefield.prototype) as Battlefield,state=createGame('river'),building=addBuilding(state,0,'house',{x:30,z:40},true);
  const model=staged(lifecycle),models=new Map([[building.id,{instance:model,key:'house',height:4,motion:new UnitPresentation()}]]),{made,create}=fakeRubble(),rubble=new BuildingRubbleLayer(create),update=vi.fn();
  Object.assign(result,{models,memories:new Map(),size:{width:100,height:100},scene:new THREE.Scene(),map:state.map,library:{instantiate:()=>staged(lifecycle)},rubble,buildingEffects:{update},
    shadowCadence:new ShadowCadence(),span:76,fogData:new Uint8Array(192*192*4),fogTexture:{},resourceMemory:{observe:vi.fn(),isExhausted:()=>false},scenery:{update:vi.fn()},landmarks:{update:vi.fn()},resourceGroves:new Map(),props:[],resources:new Map(),projectiles:{update:vi.fn()},renderer:{shadowMap:{autoUpdate:false,needsUpdate:true},render:vi.fn()},drawOverlay:vi.fn()});
  return {result,state,building,model,made,rubble,update};
}
describe('scene integration of the generic collapse',()=>{
  it('sinks a lifecycle-free building, feeds generic anchors to the FX layer and leaves rubble after it leaves the view',()=>{
    const {result,state,building,model,made,update}=field(false);
    result.render({...getTeamView(state,0),entities:[structuredClone(building)],knownBuildings:[]},.016);
    expect(update.mock.calls.at(-1)![0][0].anchors.collapse).toHaveLength(4);
    state.time=10;destroyEntity(state,building);
    const view=(time:number)=>({...getTeamView(state,0),time,entities:[structuredClone(building)],knownBuildings:[]});
    result.render(view(11.5),.016);expect(model.root.position.y).toBeLessThan(-1);expect(model.root.visible).toBe(true);
    const frozen=model.root.position.y;result.render(view(11.5),0);expect(model.root.position.y).toBe(frozen);
    expect(made).toHaveLength(1);
    result.render(view(10+COLLAPSE_SECONDS+.1),.016);expect(model.root.visible).toBe(false);
    result.render({...view(14),entities:[]},.016);expect(made[0].root.parent).not.toBeNull();expect(made[0].dispose).not.toHaveBeenCalled();
    result.render({...view(10+RUBBLE_LIFETIME_SECONDS+.1),entities:[]},.016);expect(made[0].dispose).toHaveBeenCalledOnce();
  });
  it('keeps buildings with authored lifecycle data on the authored path',()=>{
    const {result,state,building,model,made}=field(true);state.time=4;destroyEntity(state,building);
    result.render({...getTeamView(state,0),time:4.5,entities:[structuredClone(building)],knownBuildings:[]},.1);
    expect(model.root.position.y).toBe(0);expect(model.root.rotation.x).toBe(0);expect(model.root.rotation.z).toBe(0);
    const wall=model.root.children[0].children[1];expect(wall.matrixAutoUpdate).toBe(false);expect(made).toHaveLength(0);
  });
});

describe('rubble model loading',()=>{
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
  it('loads both rubble props from its own manifest, sharing building surfaces through the library loader',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{...(LANDMARK_MODELS.includes(id)?{scale:1,lod1:`/assets/games/rts/models/${id}-lod1.glb`}:{}),url:`/assets/games/rts/models/${id}.glb`,status:'published'}]));
    expect(assets['rubble-a']).toBeUndefined();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    vi.spyOn(THREE.TextureLoader.prototype,'loadAsync').mockResolvedValue(new THREE.Texture());
    const handlers:unknown[]=[];
    const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async function(this:GLTFLoader){
      handlers.push(this.manager.getHandler('../../materials/detail-v1/slate-color.jpg'),this.manager.getHandler('../materials/detail-v1/slate-color.jpg'),this.manager.getHandler('../../terrain/dirt-road.png'));
      return {scene:new THREE.Group(),animations:[]} as unknown as GLTF;
    });
    const library=new ModelLibrary();await library.load(()=>{},'river');
    for(const m of RUBBLE_MODELS)expect(loader).toHaveBeenCalledWith(m.url);
    expect(handlers.every(h=>h!==null&&h===handlers[0])).toBe(true);
    const rubble=library.instantiate('rubble-b',-1);expect(rubble).toBeInstanceOf(ModelInstance);rubble.dispose();
    loader.mockClear();await library.load(()=>{},'pass');expect(loader.mock.calls.some(c=>String(c[0]).includes('rubble'))).toBe(false);library.dispose();
  });
});
