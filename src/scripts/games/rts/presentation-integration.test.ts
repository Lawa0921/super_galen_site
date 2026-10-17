import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {Battlefield} from './scene';
import {UnitPresentation} from './unit-presentation';
import {createGame} from './simulation';
import {addUnit} from './state';
import {getTeamView} from './visibility';
import {spellPreview} from './targeting';
import {ShadowCadence} from './shadow-cadence';
import {ModelInstance} from './models';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';

function boundedUnit(scale=1){
  const source=()=>{
    const scene=new THREE.Group(),bone=new THREE.Bone(),geometry=new THREE.BoxGeometry(.5,2,.5);bone.name='Root';geometry.translate(0,1,0);
    const count=geometry.attributes.position.count;
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));
    const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());scene.add(bone,mesh);mesh.bind(new THREE.Skeleton([bone]));
    mesh.userData.rtsConservativeBounds={sphere_center_y_up_m:[0,1,0],sphere_radius_m:10};
    return {scene,animations:[new THREE.AnimationClip('Idle',1,[new THREE.NumberKeyframeTrack('Root.position[y]',[0,1],[0,0])])]} as unknown as GLTF;
  };
  return new ModelInstance(source(),{url:'guard.glb',status:'published',scale},0,false,source());
}

function field(){
  // Exercise the real scene projection/render methods without allocating WebGL.
  const result=Object.create(Battlefield.prototype) as Battlefield;
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.set(0,5,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const root=new THREE.Group();root.position.set(-.5,0,0);
  const motion=new UnitPresentation(),instance={root,yaw:0,animate:vi.fn(),setDetailPixels:vi.fn(),dispose:vi.fn()};
  const models=new Map([[7,{instance,motion,key:'guard',height:2}]]);
  Object.assign(result,{camera,models,lodScale:1,unitHeights:new Map(),selection:[],size:{width:100,height:100},memories:new Map(),scene:new THREE.Scene(),map:createGame('river').map,
    shadowCadence:new ShadowCadence(),span:76,fogData:new Uint8Array(192*192*4),fogTexture:{},resourceMemory:{observe:vi.fn(),isExhausted:vi.fn(()=>false)},scenery:{update:vi.fn()},landmarks:{update:vi.fn()},resourceGroves:new Map(),props:[],resources:new Map(),projectiles:{update:vi.fn()},renderer:{shadowMap:{autoUpdate:false,needsUpdate:true},render:vi.fn()},drawOverlay:vi.fn()});
  return {result,instance,motion,models};
}

describe('rendered pose integration',()=>{
  it('places a unit health bar and selects LOD from its body, retaining the full animation culling bounds',()=>{
    const {result,models}=field(),model=boundedUnit(),state=createGame('river'),unit=addUnit(state,0,'guard',{x:0,z:0});unit.hp--;models.clear();
    const camera=new THREE.OrthographicCamera(-24,24,24,-24,.1,100);camera.position.set(0,3,4);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const fills:number[][]=[],context={clearRect:vi.fn(),fillRect:(...args:number[])=>fills.push(args)};
    Object.assign(result,{camera,size:{width:1080,height:1080},library:{instantiate:()=>model},context});delete (result as any).drawOverlay;
    result.render({...getTeamView(state,0),entities:[unit],knownBuildings:[]},0);
    expect((models.get(unit.id) as any).height).toBeCloseTo(2);
    expect(model.root.children.map(child=>child.visible)).toEqual([false,true]);
    // Camera projects one vertical metre to 18 px; bar is 0.25 m above a 2 m body.
    expect(fills[0][1]).toBeCloseTo(498.5);
    const skins:THREE.SkinnedMesh[]=[];model.root.traverse(node=>{if(node instanceof THREE.SkinnedMesh)skins.push(node);});
    expect(skins.every(mesh=>mesh.boundingSphere?.radius===10&&mesh.boundingBox?.min.y===-9&&mesh.boundingBox.max.y===11)).toBe(true);
    model.dispose();
  });
  it('measures scaled unit bodies once per kind without changing either LOD visibility',()=>{
    const {result}=field(),instances:ModelInstance[]=[];
    Object.assign(result,{library:{instantiate:()=>{const model=boundedUnit(2);instances.push(model);return model;}}});
    const vertices=vi.spyOn(THREE.SkinnedMesh.prototype,'getVertexPosition');
    try{
      const first=(result as any).visual({kind:'guard',category:'unit',team:0});expect(first.height).toBeCloseTo(4);
      const count=vertices.mock.calls.length;expect(count).toBeGreaterThan(0);
      const second=(result as any).visual({kind:'guard',category:'unit',team:1});expect(second.height).toBeCloseTo(4);
      expect(vertices.mock.calls.length).toBe(count);
      expect(instances.map(model=>model.root.children.map(child=>child.visible))).toEqual([[true,false],[true,false]]);
    }finally{vertices.mockRestore();instances.forEach(model=>model.dispose());}
  });
  it('retains authored building extents for construction and destruction presentation',()=>{
    const {result}=field(),root=new THREE.Group(),geometry=new THREE.BoxGeometry(2,3,2);geometry.computeBoundingBox();geometry.boundingBox!.expandByScalar(2);
    root.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()));
    Object.assign(result,{library:{instantiate:()=>({root})}});
    expect((result as any).visual({kind:'house',category:'building',team:0}).height).toBeCloseTo(7);
  });
  it('updates poses and the world every frame, schedules only shadows, and immediately refreshes added/removed casters',()=>{
    const {result,instance}=field(),state=createGame('river'),unit=addUnit(state,0,'guard',{x:0,z:0});unit.id=7;
    const view={...getTeamView(state,0),entities:[unit],knownBuildings:[]},renderer=result.renderer,frames:boolean[]=[];
    vi.mocked(renderer.render).mockImplementation(()=>{frames.push(renderer.shadowMap.needsUpdate);renderer.shadowMap.needsUpdate=false;});
    const portrait={update:vi.fn(),render:vi.fn(()=>{expect(renderer.shadowMap.needsUpdate).toBe(false);return null;})};Object.assign(result,{portrait,canvas:{getBoundingClientRect:()=>({})}});
    for(const dt of [0,0,1/60,1/60])result.render(view,dt);
    expect(frames).toEqual([true,false,false,true]);expect(instance.animate).toHaveBeenCalledTimes(4);expect(renderer.render).toHaveBeenCalledTimes(4);expect(portrait.render).toHaveBeenCalledTimes(4);
    result.render({...view,entities:[]},0);expect(frames.at(-1)).toBe(true);expect(instance.dispose).toHaveBeenCalledOnce();
    const fresh={...instance,root:new THREE.Group()};Object.assign(result,{visual:()=>({instance:fresh,key:'guard',height:2,motion:new UnitPresentation()})});
    result.render(view,0);expect(frames.at(-1)).toBe(true);
  });
  it('routes visible work and simulation-aged spell cues into the actual model',()=>{
    const {result,instance,models}=field(),state=createGame('river'),unit=addUnit(state,0,'guard',{x:0,z:0});unit.id=7;unit.kind='worker';models.get(7)!.key='worker';unit.animation='work';unit.order={type:'gather',resourceId:'visible-tree'};
    const view={...getTeamView(state,0),time:3.3,entities:[unit],knownBuildings:[],resources:[{id:'visible-tree',kind:'wood' as const,x:1,z:0,remaining:10}]};
    result.render(view,.016);expect(instance.animate.mock.calls.at(-1)![0]).toBe('chop');
    unit.kind='commander';models.get(7)!.key='commander';unit.animation='idle';unit.castCue={kind:'banner',sequence:4,startedAt:3.1};
    result.render(view,.016);expect(instance.animate.mock.calls.at(-1)![5]).toEqual({kind:'banner',sequence:4,elapsed:expect.closeTo(.2)});
  });
  it('passes damage reaction age from simulation time while preserving the base animation and attack cue',()=>{
    const {result,instance}=field(),state=createGame('river'),unit=addUnit(state,0,'guard',{x:0,z:0});unit.id=7;unit.animation='attack';
    unit.attackCue={sequence:8,startedAt:3,targetId:9};unit.hurtCue={sequence:2,startedAt:3.1};
    const view={...getTeamView(state,0),time:3.3,entities:[unit],knownBuildings:[]};result.render(view,.016);
    const call=instance.animate.mock.calls.at(-1)!;expect(call[0]).toBe('attack');expect(call[2].sequence).toBe(8);expect(call[2].elapsed).toBeCloseTo(.3);
    expect(call[4]).toMatchObject({sequence:2,elapsed:expect.closeTo(.2)});
    result.render(view,0);expect(instance.animate.mock.calls.at(-1)![4]).toEqual(call[4]);
  });
  it('removes a batched resource grove only after exhaustion was actually observed',()=>{
    const {result,models}=field();models.clear();
    const internal=result as any,grove={root:new THREE.Group(),update:vi.fn()};internal.resourceGroves.set('wood-west',grove);
    const view={...getTeamView(createGame('river'),0),entities:[],knownBuildings:[]};
    result.render(view,.016);expect(grove.update).toHaveBeenCalledWith(view.explored);expect(grove.root.visible).toBe(true);
    internal.resourceMemory.isExhausted.mockReturnValue(true);result.render(view,.016);expect(grove.root.visible).toBe(false);
  });
  it('projects box-selection entity hits at the position the player sees',()=>{
    const {result}=field();expect(result.screen({id:7,x:.5,z:0} as {id:number;x:number;z:number})).toEqual(result.screen({x:-.5,z:0}));
    expect(result.screen({id:99,x:.5,z:0} as {id:number;x:number;z:number})).toEqual(result.screen({x:.5,z:0}));
  });
  it('finishes the last interpolated step in walk even after the last waypoint has been consumed',()=>{
    const {result,instance,motion,models}=field(),state=createGame('river'),unit=addUnit(state,0,'guard',{x:0,z:0});unit.id=7;unit.animation='walk';unit.path=[];
    motion.sample(unit,0,1,3);unit.x=.15;state.time=.05;const view={...getTeamView(state,0),entities:[unit],knownBuildings:[]};
    result.render(view,.016,.5);expect(instance.animate.mock.calls.at(-1)?.[0]).toBe('walk');expect(instance.animate.mock.calls.at(-1)?.[3]).toBeCloseTo(3);
    state.time=.1;result.render({...view,time:.1},.016,.5);expect(instance.animate.mock.calls.at(-1)?.[0]).toBe('idle');expect(models.get(7)?.instance.root.position.x).toBeCloseTo(.15);
  });
  it('centres spell visuals on rendered bodies while preserving authoritative range validation',()=>{
    const {result,models}=field(),state=createGame('river'),hero=addUnit(state,0,'commander',{x:.5,z:0}),ally=addUnit(state,0,'guard',{x:1,z:0});hero.id=7;ally.id=8;ally.hp=100;state.teams[0].hero.skills.mend=1;
    const targetRoot=new THREE.Group();targetRoot.position.set(.7,0,0);models.set(8,{...models.get(7)!,instance:{...models.get(7)!.instance,root:targetRoot}});
    const preview=spellPreview(getTeamView(state,0),7,'mend',ally,8)!;result.spell=preview;
    const displayed=result.spellPresentation();expect(displayed?.origin).toMatchObject({x:-.5,z:0});expect(displayed?.target).toMatchObject({x:.7,z:0});
    expect(displayed?.valid).toBe(preview.valid);expect(preview.origin.x).toBe(.5);expect(preview.target?.x).toBe(1);
  });
});
