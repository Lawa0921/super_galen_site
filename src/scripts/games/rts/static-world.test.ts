import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {Battlefield} from './scene';
import {ModelInstance} from './models';
import {ShadowCadence} from './shadow-cadence';
import {StaticTransform} from './static-transform';
import {createGame} from './simulation';
import {getTeamView} from './visibility';
import type {KnownBuilding} from './types';

/** Construction-staged building art (no lifecycle), like the published building GLBs. */
function staged(){
  const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  scene.userData.rtsConstruction={version:1,thresholds:[0,.18,.55,.82],stages:[0,1,2,3].map(id=>({id,name:'stage-'+id}))};
  for(let stage=0;stage<4;stage++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.position.set(0,stage+.5,0);
    mesh.userData={rtsConstructionStage:stage,rtsPartIds:['p-'+stage],rtsSourcePartIds:['s-'+stage],rtsSourceObjects:['o-'+stage]};scene.add(mesh);
  }
  return new ModelInstance({scene,animations:[]} as unknown as GLTF,{url:'/assets/games/rts/models/house.glb',status:'published'});
}

function field(){
  // Real Battlefield.render without allocating WebGL; constructor-only layers are stubbed.
  const result=Object.create(Battlefield.prototype) as Battlefield,scene=new THREE.Scene(),staticWorld=new THREE.Group();scene.add(staticWorld);
  const made:ModelInstance[]=[];
  Object.assign(result,{models:new Map(),memories:new Map(),unitHeights:new Map(),selection:[],size:{width:100,height:100},scene,map:createGame('river').map,
    library:{instantiate:()=>{const m=staged();made.push(m);return m;}},staticWorld,staticWorldTransform:new StaticTransform(staticWorld),
    shadowCadence:new ShadowCadence(),span:76,fogData:new Uint8Array(192*192*4),fogTexture:{},resourceMemory:{observe:vi.fn(),isExhausted:()=>false},
    scenery:{update:vi.fn()},landmarks:{update:vi.fn()},resourceGroves:new Map(),props:[],resources:new Map(),projectiles:{update:vi.fn()},
    renderer:{shadowMap:{autoUpdate:false,needsUpdate:true},render:vi.fn()},drawOverlay:vi.fn()});
  const view=(knownBuildings:KnownBuilding[]=[])=>({...getTeamView(createGame('river'),0),entities:[],knownBuildings});
  return {result,scene,staticWorld,made,view};
}
const worldPosition=(o:THREE.Object3D)=>new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).toArray();

describe('static world transforms',()=>{
  it('skips a frozen subtree in the per-frame scene traversal and resumes it once released',()=>{
    const scene=new THREE.Scene(),frozen=new THREE.Group(),child=new THREE.Object3D(),unit=new THREE.Group(),bone=new THREE.Object3D();
    frozen.add(child);unit.add(bone);scene.add(frozen,unit);frozen.position.set(1,2,3);child.position.y=1;
    const cache=new StaticTransform(frozen);cache.update(true);
    const visit=vi.spyOn(child,'updateMatrixWorld');
    unit.position.set(5,0,7);bone.position.y=2;scene.updateMatrixWorld(true);
    expect(visit).not.toHaveBeenCalled();expect(worldPosition(child)).toEqual([1,3,3]);expect(worldPosition(bone)).toEqual([5,2,7]);
    // Box3 / raycasts read the cached matrices through updateWorldMatrix, which stays correct.
    const box=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));child.add(box);box.updateWorldMatrix(false,false);
    expect(new THREE.Box3().setFromObject(frozen).getCenter(new THREE.Vector3()).toArray()).toEqual([1,3,3]);
    child.remove(box);
    cache.update(false);frozen.position.x=-1;scene.updateMatrixWorld();
    expect(visit).toHaveBeenCalled();expect(worldPosition(child)).toEqual([-1,3,3]);expect(frozen.matrixAutoUpdate).toBe(true);
  });
  it('freezes terrain, props and layers under the static world after a render, so the scene traversal skips them',()=>{
    const {result,scene,staticWorld,view}=field();
    const prop=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));prop.position.set(4,0,6);mesh.position.y=1;prop.add(mesh);staticWorld.add(prop);
    result.render(view(),.016);
    for(const node of [staticWorld,prop,mesh]){expect(node.matrixAutoUpdate).toBe(false);expect(node.matrixWorldAutoUpdate).toBe(false);}
    expect(worldPosition(mesh)).toEqual([4,1,6]);
    const compose=vi.spyOn(mesh,'updateMatrix'),world=vi.spyOn(mesh,'updateMatrixWorld');
    scene.updateMatrixWorld();expect(compose).not.toHaveBeenCalled();expect(world).not.toHaveBeenCalled();
    // Visibility (fog / LOD / exhausted resources) does not invalidate the cache.
    prop.visible=false;result.render(view(),.016);prop.visible=true;expect(worldPosition(mesh)).toEqual([4,1,6]);
  });
  it('keeps skinned subtrees live because SkinnedMesh.updateMatrixWorld refreshes its bind matrix',()=>{
    const root=new THREE.Group(),bone=new THREE.Bone(),mesh=new THREE.SkinnedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
    mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));root.add(mesh);
    const cache=new StaticTransform(root);cache.update(true);
    expect(root.matrixAutoUpdate).toBe(true);expect(Object.hasOwn(root,'updateMatrixWorld')).toBe(false);
    const visit=vi.spyOn(mesh,'updateMatrixWorld');root.updateMatrixWorld();expect(visit).toHaveBeenCalled();
  });
  it('re-derives the frozen subtree when the static world root itself is moved',()=>{
    const {result,staticWorld,view}=field();
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));mesh.position.set(2,0,3);staticWorld.add(mesh);
    result.render(view(),.016);expect(worldPosition(mesh)).toEqual([2,0,3]);
    staticWorld.position.x=10;result.render(view(),.016);
    expect(worldPosition(mesh)).toEqual([12,0,3]);expect(mesh.matrixAutoUpdate).toBe(false);
  });
  it('freezes fog-of-war building memories once placed and releases the cache when they are forgotten',()=>{
    const {result,scene,made,view}=field();
    const memory:KnownBuilding={id:41,kind:'house',x:30,z:40,team:1,tier:1,construction:.6,integrity:1,lastSeen:0} as KnownBuilding;
    result.render(view([memory]),.016);
    const ghost=made[0];expect(ghost.root.parent).toBe(scene);
    expect(ghost.root.matrixAutoUpdate).toBe(false);expect(ghost.root.matrixWorldAutoUpdate).toBe(false);
    expect(worldPosition(ghost.root)).toEqual([30,0,40]);
    const compose=vi.spyOn(ghost.root,'updateMatrix');scene.updateMatrixWorld();expect(compose).not.toHaveBeenCalled();
    result.render(view([]),.016);
    expect(ghost.root.parent).toBeNull();expect(ghost.root.matrixAutoUpdate).toBe(true);expect(ghost.root.matrixWorldAutoUpdate).toBe(true);
  });
});
