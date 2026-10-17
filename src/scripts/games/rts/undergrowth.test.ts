import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {UndergrowthLayer} from './undergrowth';
import type {Undergrowth} from './districts';
describe('instanced original undergrowth',()=>{
  const plants:Undergrowth[]=[{x:10,z:20,kind:0,width:1,height:.7,rotation:0},{x:30,z:40,kind:1,width:1,height:.6,rotation:1}];
  it('hides unexplored vegetation and removes plants beneath current construction footprints',()=>{
    const texture=new THREE.Texture(),layer=new UndergrowthLayer(plants,texture,96),fog=new Uint8Array(9216);
    layer.update(fog,[]);expect(layer.root.children.every(o=>(o as THREE.InstancedMesh).count===0)).toBe(true);
    fog[20*96+10]=1;fog[40*96+30]=1;layer.update(fog,[]);
    expect(layer.root.children.map(o=>(o as THREE.InstancedMesh).count)).toEqual([1,1]);
    layer.update(fog,[{x:10,z:20,width:3,depth:3}]);
    expect(layer.root.children.map(o=>(o as THREE.InstancedMesh).count)).toEqual([0,1]);layer.dispose();texture.dispose();
  });
  it('uses cutout cards with bounded UVs and releases owned GPU resources once',()=>{
    const texture=new THREE.Texture(),layer=new UndergrowthLayer(plants,texture,96);
    const meshes=layer.root.children as THREE.InstancedMesh[];
    // The fixed high RTS camera needs one facing card, rather than a visible X.
    expect(meshes[0].geometry.getAttribute('position').count).toBe(4);
    for(const mesh of meshes){const material=mesh.material as THREE.MeshStandardMaterial;expect(material.map).toBe(texture);expect(material.alphaTest).toBeGreaterThan(0);expect(material.transparent).toBe(false);expect(material.depthWrite).toBe(true);expect(mesh.raycast(new THREE.Raycaster(),[])).toBeUndefined();}
    const shared=vi.spyOn(texture,'dispose'),geometry=vi.spyOn(meshes[0].geometry,'dispose'),material=vi.spyOn(meshes[0].material as THREE.Material,'dispose');
    layer.dispose();layer.dispose();expect(geometry).toHaveBeenCalledOnce();expect(material).toHaveBeenCalledOnce();expect(shared).not.toHaveBeenCalled();expect(layer.root.children).toHaveLength(0);texture.dispose();
  });
  it('does not re-upload unchanged exploration and footprint content from fresh view snapshots',()=>{
    const texture=new THREE.Texture(),layer=new UndergrowthLayer(plants,texture,96),fog=new Uint8Array(9216).fill(1);
    const buildings=[{x:70,z:70,width:3,depth:3}];layer.update(fog,buildings);
    const meshes=layer.root.children as THREE.InstancedMesh[],versions=meshes.map(mesh=>mesh.instanceMatrix.version);
    const matrixWrites=meshes.map(mesh=>vi.spyOn(mesh,'setMatrixAt'));
    layer.update(fog.slice(),buildings.map(b=>({...b})));
    expect(meshes.map(mesh=>mesh.instanceMatrix.version)).toEqual(versions);
    matrixWrites.forEach(write=>expect(write).not.toHaveBeenCalled());layer.dispose();texture.dispose();
  });
  it('invalidates cached content on in-place exploration, construction, and demolition changes',()=>{
    const texture=new THREE.Texture(),layer=new UndergrowthLayer(plants,texture,96),fog=new Uint8Array(9216);
    const buildings=[{x:70,z:70,width:3,depth:3}],meshes=layer.root.children as THREE.InstancedMesh[];
    layer.update(fog,buildings);fog[20*96+10]=1;layer.update(fog,buildings);
    expect(meshes.map(mesh=>mesh.count)).toEqual([1,0]);
    const initial=meshes[0].instanceMatrix.array.slice();
    buildings[0].x=10;buildings[0].z=20;layer.update(fog,buildings);
    expect(meshes.map(mesh=>mesh.count)).toEqual([0,0]);
    buildings.pop();layer.update(fog,buildings);
    expect(meshes.map(mesh=>mesh.count)).toEqual([1,0]);expect(meshes[0].instanceMatrix.array).toEqual(initial);
    fog[20*96+10]=0;layer.update(fog,buildings);expect(meshes[0].count).toBe(0);
    layer.dispose();texture.dispose();
  });
});
