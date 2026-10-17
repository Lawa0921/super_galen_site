import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance,type ModelLibrary} from './models';
import {LandmarkLayer} from './landmarks';
import {createMap} from './maps';

function fixture(){
  const instances:ModelInstance[]=[];
  const library={instantiate:vi.fn(()=>{
    const source=()=>{const scene=new THREE.Group();scene.add(new THREE.Mesh(new THREE.BoxGeometry(2,4,2).translate(0,2,0),new THREE.MeshStandardMaterial()));return {scene,animations:[]} as unknown as GLTF;};
    const instance=new ModelInstance(source(),{url:'/assets/games/rts/models/river-gatehouse.glb',status:'published',scale:1},-1,false,source());
    vi.spyOn(instance,'dispose');instances.push(instance);return instance;
  })} as unknown as ModelLibrary;
  return {library,instances};
}
describe('original 3D landmarks',()=>{
  it('keeps authored dimensions and placement while changing LOD, without selecting decoration',()=>{
    const {library,instances}=fixture(),map=createMap('river'),layer=new LandmarkLayer(map.landmarks!,library,map.width);
    expect(instances).toHaveLength(16);expect(layer.root.children).toHaveLength(16);
    for(let i=0;i<instances.length;i++){
      const root=instances[i].root,p=map.landmarks![i];
      expect(root.position.toArray()).toEqual([p.x,0,p.z]);expect(root.scale.toArray()).toEqual([1,1,1]);expect(root.rotation.y).toBe(p.rotation);
    }
    const explored=new Uint8Array(map.width*map.height).fill(1),project=vi.fn((_p:unknown,height:number)=>height*30);
    layer.update(explored,project);
    expect(instances.every(i=>i.root.visible&&i.root.children[0].visible&&!i.root.children[1].visible)).toBe(true);
    expect(project.mock.calls.every(c=>c[1]===4)).toBe(true);
    layer.update(explored,(_p,height)=>height*5);
    expect(instances.every(i=>!i.root.children[0].visible&&i.root.children[1].visible)).toBe(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(15,10,150),new THREE.Vector3(0,-1,0));layer.root.updateMatrixWorld(true);
    expect(ray.intersectObject(layer.root,true)).toEqual([]);
    layer.dispose();expect(layer.root.children).toHaveLength(0);for(const instance of instances)expect(instance.dispose).toHaveBeenCalledOnce();
  });
  it('starts hidden and reveals only explored footprints without altering navigation',()=>{
    const {library,instances}=fixture(),map=createMap('pass'),blocked=map.blocked.slice(),noBuild=map.noBuild.slice(),layer=new LandmarkLayer(map.landmarks!,library,map.width);
    expect(instances.every(i=>!i.root.visible)).toBe(true);
    const explored=new Uint8Array(map.width*map.height),p=map.landmarks![2];explored[Math.floor(p.z)*map.width+Math.floor(p.x)]=1;
    layer.update(explored,()=>100);expect(instances.map(i=>i.root.visible)).toEqual(map.landmarks!.map((_,i)=>i===2));
    expect(map.blocked).toEqual(blocked);expect(map.noBuild).toEqual(noBuild);layer.dispose();
  });
  it('releases already-created instances if later placement loading fails',()=>{
    const {library,instances}=fixture();vi.mocked(library.instantiate).mockImplementationOnce(()=>{const instance=new ModelInstance({scene:new THREE.Group(),animations:[]} as unknown as GLTF,{url:'/assets/games/rts/models/river-gatehouse.glb',status:'published'});vi.spyOn(instance,'dispose');instances.push(instance);return instance;}).mockImplementationOnce(()=>{throw new Error('missing landmark');});
    expect(()=>new LandmarkLayer(createMap('river').landmarks!,library,288)).toThrow('missing landmark');expect(instances[0].dispose).toHaveBeenCalledOnce();
  });
});
