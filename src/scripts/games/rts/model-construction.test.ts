import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from './models';
import {pickTarget} from './picking';
import {retainConstruction,releaseConstruction} from './construction-presentation';

const entry={url:'/assets/games/rts/models/barracks.glb',status:'published' as const};
const metadata=()=>({version:1,thresholds:[0,.18,.55,.82],stages:[0,1,2,3].map(id=>({id,name:'stage-'+id}))});
function staged(){
  const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial({side:THREE.DoubleSide});scene.userData.rtsConstruction=metadata();
  for(let stage=0;stage<4;stage++){
    const node=new THREE.Group();node.name='stage-'+stage;node.userData={rtsConstructionStage:stage,rtsPartIds:['part-'+stage],rtsSourcePartIds:['kit-'+stage],rtsSourceObjects:['mesh-'+stage]};
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);mesh.position.x=stage*2;node.add(mesh);scene.add(node);
  }
  return {scene,animations:[]} as unknown as GLTF;
}
function visibleMeshes(root:THREE.Object3D){const meshes:THREE.Mesh[]=[];root.traverseVisible(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});return meshes;}

describe('authored construction presentation',()=>{
  it('caches only static completed buildings and restores updating for partial stages or animated assets',()=>{
    const model=new ModelInstance(staged(),entry,0,false,staged()),world=new THREE.Scene();world.add(model.root);model.root.position.set(3,0,8);model.root.userData.entityId=23;
    const ray=new THREE.Raycaster(new THREE.Vector3(3,0,13),new THREE.Vector3(0,0,-1));world.updateMatrixWorld(true);
    expect(pickTarget(ray.intersectObject(model.root,true))).toEqual({entityId:23});
    model.cacheBuildingTransform(true);world.updateMatrixWorld(true);
    expect(model.root.matrixAutoUpdate).toBe(false);const expected=visibleMeshes(model.root)[0].matrixWorld.clone();
    model.setConstruction(1);model.cacheBuildingTransform(true);model.setDetailPixels(20);world.updateMatrixWorld(true);
    expect(visibleMeshes(model.root)[0].matrixWorld.equals(expected)).toBe(true);
    expect(pickTarget(ray.intersectObject(model.root,true))).toEqual({entityId:23});
    model.setConstruction(.55);expect(model.root.matrixAutoUpdate).toBe(true);model.cacheBuildingTransform(true);expect(model.root.matrixAutoUpdate).toBe(true);
    model.setConstruction(1);model.cacheBuildingTransform(true);expect(model.root.matrixAutoUpdate).toBe(false);model.dispose();
    const source=staged();source.animations=[new THREE.AnimationClip('Idle',1,[])];const animated=new ModelInstance(source,entry);
    animated.cacheBuildingTransform(true);expect(animated.root.matrixAutoUpdate).toBe(true);animated.dispose();
  });
  it.each([[0,1],[.17999,1],[.18,2],[.54999,2],[.55,3],[.81999,3],[.82,4],[1,1],[-1,1],[2,1]])('shows cumulative stage boundaries at %s (%s meshes)',(progress,count)=>{
    const model=new ModelInstance(staged(),entry);expect(model.setConstruction(progress)).toBe(true);expect(visibleMeshes(model.root)).toHaveLength(count);
    expect(model.root.position.y).toBe(0);expect(model.root.scale.toArray()).toEqual([1,1,1]);model.dispose();
  });
  it('isolates visibility and preserves source primitives while sharing the completed geometry',()=>{
    const gltf=staged(),sourcePositions=gltf.scene.children.map(n=>(n.children[0] as THREE.Mesh).geometry.attributes.position.array.slice());
    const a=new ModelInstance(gltf,entry),b=new ModelInstance(gltf,entry);a.setConstruction(0);b.setConstruction(.55);
    expect(visibleMeshes(a.root)).toHaveLength(1);expect(visibleMeshes(b.root)).toHaveLength(3);expect(gltf.scene.children.every(n=>n.visible)).toBe(true);
    a.setConstruction(1);b.setConstruction(1);const first=visibleMeshes(a.root)[0],second=visibleMeshes(b.root)[0];
    expect(first.geometry).toBe(second.geometry);expect(first.geometry.attributes.position.count).toBe(16);expect(first.geometry.attributes.uv.count).toBe(16);
    expect(new THREE.Box3().setFromObject(first).max.x).toBe(6.5);expect(first.userData.rtsConstructionSources).toHaveLength(4);
    gltf.scene.children.forEach((n,i)=>expect((n.children[0] as THREE.Mesh).geometry.attributes.position.array).toEqual(sourcePositions[i]));
    const dispose=vi.spyOn(first.geometry,'dispose');a.dispose();expect(dispose).not.toHaveBeenCalled();b.dispose();expect(dispose).toHaveBeenCalledOnce();
  });
  it('does not let ray selection hit an unbuilt roof or completed mesh',()=>{
    const model=new ModelInstance(staged(),entry);model.root.userData.entityId=7;model.setConstruction(0);model.root.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(4,0,5),new THREE.Vector3(0,0,-1));
    expect(pickTarget(ray.intersectObject(model.root,true))).toBeNull();model.setConstruction(.55);
    expect(pickTarget(ray.intersectObject(model.root,true))).toEqual({entityId:7});model.setConstruction(1);
    expect(pickTarget(ray.intersectObject(model.root,true))).toEqual({entityId:7});model.setConstruction(0);
    expect(pickTarget(ray.intersectObject(model.root,true))).toBeNull();model.dispose();
  });
  it('preserves authored vertex normals when the primitive transform is identity',()=>{
    const gltf=staged(),geometry=(gltf.scene.children[0].children[0] as THREE.Mesh).geometry;
    for(let i=0;i<geometry.attributes.normal.count;i++)geometry.attributes.normal.setZ(i,.9999);
    const model=new ModelInstance(gltf,entry);model.setConstruction(1);
    expect(visibleMeshes(model.root)[0].geometry.attributes.normal.getZ(0)).toBe(.9998999834060669);model.dispose();
  });
  it('supports a detail switch without exposing hidden construction stages',()=>{
    const model=new ModelInstance(staged(),entry,0,false,staged());model.setConstruction(.18);model.setDetailPixels(20);
    expect(visibleMeshes(model.root)).toHaveLength(2);model.setConstruction(1);expect(visibleMeshes(model.root)).toHaveLength(1);
    model.setDetailPixels(80);expect(visibleMeshes(model.root)).toHaveLength(1);model.dispose();
  });
  it('keeps transparent meshes separate so completion does not change spatial sorting',()=>{
    const gltf=staged();(gltf.scene.children[0].children[0] as THREE.Mesh).material=new THREE.MeshStandardMaterial({transparent:true,opacity:.4});
    const model=new ModelInstance(gltf,entry);model.setConstruction(1);expect(visibleMeshes(model.root)).toHaveLength(4);model.dispose();
  });
  it('rejects a foundation beneath a later-stage ancestor that would hide it at progress zero',()=>{
    const gltf=staged();gltf.scene.children[3].add(gltf.scene.children[0]);
    expect(()=>new ModelInstance(gltf,entry)).toThrow('RTS construction');
  });
  it('keeps metadata-free assets compatible and rejects nonfinite progress',()=>{
    const gltf=staged();delete gltf.scene.userData.rtsConstruction;gltf.scene.children.forEach(n=>n.userData={});
    const model=new ModelInstance(gltf,entry);expect(model.setConstruction(.2)).toBe(false);expect(visibleMeshes(model.root)).toHaveLength(4);model.dispose();
    const authored=new ModelInstance(staged(),entry);expect(()=>authored.setConstruction(NaN)).toThrow('construction progress');authored.dispose();
  });
  it.each([
    (g:GLTF)=>{g.scene.userData.rtsConstruction.version=2;},
    (g:GLTF)=>{g.scene.userData.rtsConstruction.thresholds=[0,.55,.18,.82];},
    (g:GLTF)=>{g.scene.userData.rtsConstruction.thresholds=[.01,.18,.55,.82];},
    (g:GLTF)=>{g.scene.userData.rtsConstruction.thresholds=[0,.18,.55,1];},
    (g:GLTF)=>{g.scene.userData.rtsConstruction.stages[2].id=1;},
    (g:GLTF)=>{g.scene.children[2].userData.rtsConstructionStage=4;},
    (g:GLTF)=>{g.scene.children[2].userData.rtsConstructionStage=.5;},
    (g:GLTF)=>{delete g.scene.children[2].userData.rtsSourceObjects;},
    (g:GLTF)=>{g.scene.children[2].userData.rtsPartIds=[''];},
    (g:GLTF)=>{g.scene.children[2].userData={};},
    (g:GLTF)=>{delete g.scene.userData.rtsConstruction;},
  ])('fails closed before cloning malformed construction metadata',mutate=>{
    const gltf=staged();mutate(gltf);expect(()=>new ModelInstance(gltf,entry)).toThrow('RTS construction');
  });
  it('rejects metadata-free or incompatible construction LODs',()=>{
    const low=staged();low.scene.userData.rtsConstruction.thresholds[2]=.6;
    expect(()=>new ModelInstance(staged(),entry,0,false,low)).toThrow('RTS construction');
    const missing=staged();delete missing.scene.userData.rtsConstruction;missing.scene.children.forEach(n=>n.userData={});
    expect(()=>new ModelInstance(staged(),entry,0,false,missing)).toThrow('construction metadata differs');
  });
  it('does not retain completed geometry when a later LOD fails motion validation',()=>{
    const high=staged(),low=staged(),lease=retainConstruction(high)!;low.scene.userData.rtsMotion={version:2};
    expect(()=>new ModelInstance(high,entry,0,false,low)).toThrow('motion metadata');expect(lease.users).toBe(1);
    const geometry=(lease.completed!.children[0] as THREE.Mesh).geometry,dispose=vi.spyOn(geometry,'dispose');releaseConstruction(lease);expect(dispose).toHaveBeenCalledOnce();
  });
  it('rolls back a retained high LOD and cloned palettes when low LOD bounds fail',()=>{
    const high=staged(),low=staged(),lease=retainConstruction(high)!,geometry=(lease.completed!.children[0] as THREE.Mesh).geometry;
    const node=low.scene.children[2],bone=new THREE.Bone(),skin=new THREE.Skeleton([bone]);
    const mesh=new THREE.SkinnedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial());mesh.bind(skin);
    mesh.userData.rtsConservativeBounds={sphere_center_y_up_m:[0,0,0],sphere_radius_m:0};node.remove(node.children[0]);node.add(bone,mesh);
    const disposed=vi.spyOn(geometry,'dispose'),sourceDisposed=vi.spyOn((high.scene.children[0].children[0] as THREE.Mesh).geometry,'dispose');
    const palettes=vi.spyOn(THREE.Skeleton.prototype,'dispose'),mixers=vi.spyOn(THREE.AnimationMixer.prototype,'uncacheRoot');
    try{
      expect(()=>new ModelInstance(high,entry,0,false,low)).toThrow('conservative skin bounds');
      expect(lease.users).toBe(1);expect(disposed).not.toHaveBeenCalled();expect(sourceDisposed).not.toHaveBeenCalled();
      expect(palettes).toHaveBeenCalledOnce();expect(palettes.mock.contexts).not.toContain(skin);expect(mixers).toHaveBeenCalledTimes(2);
      releaseConstruction(lease);expect(disposed).toHaveBeenCalledOnce();
    }finally{palettes.mockRestore();mixers.mockRestore();}
  });
  it('rolls back a completed mesh lease and owned material when later material cloning fails',()=>{
    const high=staged(),first=(high.scene.children[0].children[0] as THREE.Mesh).material as THREE.Material;first.name='TeamClothFirst';
    const failing=new THREE.MeshStandardMaterial();failing.name='TeamClothSecond';(high.scene.children[1].children[0] as THREE.Mesh).material=failing;
    const failure=vi.spyOn(failing,'clone').mockImplementation(()=>{throw new Error('material clone failed');});
    const lease=retainConstruction(high)!,geometry=(lease.completed!.children[0] as THREE.Mesh).geometry,disposed=vi.spyOn(geometry,'dispose'),materials=vi.spyOn(THREE.Material.prototype,'dispose');
    try{
      expect(()=>new ModelInstance(high,entry)).toThrow('material clone failed');expect(lease.users).toBe(1);
      expect(materials).toHaveBeenCalledOnce();expect(materials.mock.contexts).not.toContain(first);expect(materials.mock.contexts).not.toContain(failing);
      expect(disposed).not.toHaveBeenCalled();releaseConstruction(lease);expect(disposed).toHaveBeenCalledOnce();
    }finally{materials.mockRestore();failure.mockRestore();}
  });
  it('rejects monotonic thresholds that differ from the fixed version-one contract',()=>{
    const gltf=staged();gltf.scene.userData.rtsConstruction.thresholds=[0,.2,.55,.82];
    expect(()=>new ModelInstance(gltf,entry)).toThrow('RTS construction');
  });
});
