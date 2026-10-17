import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {ShadowCadence} from './shadow-cadence';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {Battlefield} from './scene';
import {ModelInstance} from './models';
import {UnitPresentation} from './unit-presentation';
import {createGame} from './simulation';
import {addBuilding,destroyEntity} from './state';
import {getTeamView} from './visibility';
import {pickTarget} from './picking';

function instance(authored=true,ghost=false,lifecycle=false){
  const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  if(authored)scene.userData.rtsConstruction={version:1,thresholds:[0,.18,.55,.82],stages:[0,1,2,3].map(id=>({id,name:'stage-'+id}))};
  for(let stage=0;stage<4;stage++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.position.set(stage*2,stage,0);
    if(authored)mesh.userData={rtsConstructionStage:stage,rtsPartIds:['p-'+stage],rtsSourcePartIds:['s-'+stage],rtsSourceObjects:['o-'+stage]};
    if(lifecycle)mesh.userData.rtsDestructionCluster='stage-'+stage;scene.add(mesh);}
  if(lifecycle)scene.userData.rtsBuildingLifecycle={version:1,destructionSeconds:3,damageThresholds:[.65,.3],clusters:[0,1,2,3].map(id=>({id:'stage-'+id,pivot:[0,0,0],axis:[0,0,1],angle:id?1:0,translation:[0,0,0],delay:0,duration:1})),anchors:{impact:[[0,1,0]],repair:[[0,0,0]]},replacementSets:[]};
  return new ModelInstance({scene,animations:[]} as unknown as GLTF,{url:'/assets/games/rts/models/barracks.glb',status:'published'},0,ghost);
}
function visibleCount(root:THREE.Object3D){let count=0;root.traverseVisible(o=>{if(o instanceof THREE.Mesh)count++;});return count;}
function field(authored=true,lifecycle=false){
  const result=Object.create(Battlefield.prototype) as Battlefield,state=createGame('river'),building=addBuilding(state,0,'barracks',{x:20,z:20},false);building.construction=.2;
  const model=instance(authored,false,lifecycle),models=new Map([[building.id,{instance:model,key:'barracks',height:4,motion:new UnitPresentation()}]]),memories=new Map();
  Object.assign(result,{models,memories,size:{width:100,height:100},scene:new THREE.Scene(),map:state.map,library:{instantiate:()=>instance(authored,true,lifecycle)},
    shadowCadence:new ShadowCadence(),span:76,fogData:new Uint8Array(192*192*4),fogTexture:{},resourceMemory:{observe:vi.fn(),isExhausted:()=>false},scenery:{update:vi.fn()},landmarks:{update:vi.fn()},resourceGroves:new Map(),props:[],resources:new Map(),projectiles:{update:vi.fn()},renderer:{shadowMap:{autoUpdate:false,needsUpdate:true},render:vi.fn()},drawOverlay:vi.fn()});
  return {result,state,building,model,models,memories};
}
describe('scene construction consumers',()=>{
  it('passes only currently visible authored buildings to the effect layer, excluding fog memories',()=>{
    const {result,state,building,model}=field(true,true),update=vi.fn();Object.assign(result,{buildingEffects:{update}});
    const view={...getTeamView(state,0),time:3,entities:[structuredClone(building)],knownBuildings:[]};result.render(view,0);
    expect(update).toHaveBeenLastCalledWith([{building:view.entities[0],anchors:model.buildingEffectAnchors()}],3);
    result.render({...view,time:4,entities:[],knownBuildings:[{id:building.id,kind:building.kind,x:20,z:20,team:1 as const,tier:1,construction:1,lastSeen:3}]},0);
    expect(update).toHaveBeenLastCalledWith([],4);
  });
  it('drives authored collapse only from visible game age, preserving pause and unbuilt stages',()=>{
    const {result,state,building,model}=field(true,true);state.time=4;destroyEntity(state,building);
    const view={...getTeamView(state,0),time:4.5,entities:[structuredClone(building)],knownBuildings:[]};
    result.render(view,.1);expect(visibleCount(model.root)).toBe(2);
    const wall=model.root.children[0].children[1],paused=wall.matrix.clone();expect(wall.matrixAutoUpdate).toBe(false);
    expect(wall.matrix.elements[0]).toBeCloseTo(Math.cos(.5));
    result.render(view,1);expect(wall.matrix.equals(paused)).toBe(true);
    result.render({...view,time:5},0);expect(wall.matrix.elements[0]).toBeCloseTo(Math.cos(1));
    model.dispose();
  });
  it('keeps a dying building visible while removing its click target immediately',()=>{
    const {result,state,building,model}=field();model.root.userData.entityId=building.id;
    const view=()=>({...getTeamView(state,0),entities:[structuredClone(building)],knownBuildings:[]});
    result.render(view(),.016);expect(pickTarget([{object:model.root}])).toEqual({entityId:building.id});
    destroyEntity(state,building);result.render(view(),0);expect(visibleCount(model.root)).toBe(2);
    expect(pickTarget([{object:model.root}])).toBeNull();model.dispose();
  });
  it('uses the per-player construction snapshot for selected buildings without changing simulation',()=>{
    const {result,state,building,model}=field();result.selection=[building.id];const view={...getTeamView(state,0),entities:[structuredClone(building)],knownBuildings:[]};
    result.render(view,.016);expect(model.root.position.y).toBe(0);expect(visibleCount(model.root)).toBe(2);expect(building.construction).toBe(.2);
    building.construction=1;result.render(view,.016);expect(visibleCount(model.root)).toBe(2);
    view.entities[0].construction=1;result.render(view,.016);expect(visibleCount(model.root)).toBe(1);model.dispose();
  });
  it('preserves the existing metadata-free building presentation',()=>{
    const {result,state,building,model}=field(false);result.render({...getTeamView(state,0),entities:[building],knownBuildings:[]},.016);
    expect(model.root.position.y).toBeCloseTo(-3.2);expect(visibleCount(model.root)).toBe(4);model.dispose();
  });
  it('renders only remembered stages in fog and rebuilds the memory after rediscovery',()=>{
    const {result,state,building,models,memories}=field();models.clear();
    const memory={id:building.id,kind:building.kind,x:20,z:20,team:1 as const,tier:1,construction:.2,lastSeen:2};
    const view={...getTeamView(state,0),entities:[],knownBuildings:[memory]};result.render(view,.016);
    const first=memories.get(building.id).instance as ModelInstance;expect(first.root.position.y).toBe(0);expect(visibleCount(first.root)).toBe(2);
    building.construction=1;result.render(view,.016);expect(visibleCount(first.root)).toBe(2);
    result.render({...view,knownBuildings:[]},.016);memory.construction=.75;result.render(view,.016);
    const refreshed=memories.get(building.id).instance as ModelInstance;expect(refreshed).not.toBe(first);expect(visibleCount(refreshed.root)).toBe(3);refreshed.dispose();
  });
  it('uses only a foundation when older fog memory lacks construction',()=>{
    const {result,state,building,models,memories}=field();models.clear();
    result.render({...getTeamView(state,0),entities:[],knownBuildings:[{id:building.id,kind:building.kind,x:20,z:20,team:1,tier:1,lastSeen:2}]},.016);
    const model=memories.get(building.id).instance as ModelInstance;expect(visibleCount(model.root)).toBe(1);model.dispose();
  });
});
