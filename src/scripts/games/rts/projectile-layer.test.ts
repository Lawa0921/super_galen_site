import {describe,it,expect,vi} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshStandardMaterial,Vector3} from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from './models';
import {ProjectileLayer} from './projectile-layer';
import type {Projectile} from './types';

const bolt=(id:number,kind:'bolt'|'shell'='bolt'):Projectile=>({id,sourceId:1,targetId:2,team:0,x:4,z:4,damage:10,speed:12,kind});
function setup(){
  const source=new Group(),geometry=new BoxGeometry();source.add(new Mesh(geometry,new MeshStandardMaterial()));
  const library={instantiate:vi.fn((id:string)=>new ModelInstance({scene:source,animations:[]} as unknown as GLTF,{url:`/assets/games/rts/models/${id}.glb`,status:'published'}))};
  return {layer:new ProjectileLayer(library),library,geometry};
}
describe('reviewed projectile rendering',()=>{
  it('uses distinct original bolts and aims their -Z tips toward a visible target',()=>{
    const {layer,library}=setup();layer.update([bolt(10),bolt(11,'shell')],[{id:2,x:8,z:4,facing:0}]);
    expect(library.instantiate.mock.calls.map(call=>call[0])).toEqual(['bolt','heavy-bolt']);
    expect(layer.root.children).toHaveLength(2);
    for(const child of layer.root.children){const forward=new Vector3(0,0,-1).applyQuaternion(child.quaternion);expect(forward.x).toBeCloseTo(1);expect(forward.z).toBeCloseTo(0);}
    expect(layer.root.children.map(child=>child.position.y)).toEqual([1.2,2.2]);layer.dispose();
  });
  it('tracks actual travel and keeps heading between ticks after the target leaves view',()=>{
    const {layer,library}=setup();layer.update([bolt(10)],[{id:1,x:1,z:4,facing:Math.PI/2}]);
    const child=layer.root.children[0];expect(child).toBeDefined();
    layer.update([{...bolt(10),x:3,z:5}],[]);
    const forward=new Vector3(0,0,-1).applyQuaternion(child.quaternion);
    expect(forward.x).toBeLessThan(0);expect(forward.z).toBeGreaterThan(0);
    const heading=child.quaternion.clone();layer.update([{...bolt(10),x:3,z:5}],[]);
    expect(child.quaternion.equals(heading)).toBe(true);expect(library.instantiate).toHaveBeenCalledTimes(1);layer.dispose();
  });
  it('removes expired shots and preserves library-owned geometry during cleanup',()=>{
    const {layer,geometry}=setup(),disposed=vi.spyOn(geometry,'dispose');
    layer.update([bolt(10),bolt(11)],[]);expect(layer.root.children).toHaveLength(2);
    layer.update([bolt(11)],[]);expect(layer.root.children).toHaveLength(1);
    layer.dispose();expect(layer.root.children).toHaveLength(0);expect(disposed).not.toHaveBeenCalled();
  });
});
