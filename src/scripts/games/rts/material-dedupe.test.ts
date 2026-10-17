import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {MaterialRegistry,materialSignature} from './material-dedupe';

const image={width:4,height:4};
const textured=(source:THREE.Source<unknown>,patch:Partial<THREE.MeshStandardMaterial>={})=>{
  const map=new THREE.Texture();map.source=source;map.colorSpace=THREE.SRGBColorSpace;map.flipY=false;
  const material=new THREE.MeshStandardMaterial({map,color:'#c8b48a',roughness:.7,metalness:.2});material.name='WeatheredBrass';material.userData.kit_material_hash='abc';
  return Object.assign(material,patch);
};
const scene=(...materials:THREE.Material[])=>{const root=new THREE.Group();materials.forEach((m,i)=>{const mesh=new THREE.Mesh(new THREE.BufferGeometry(),m);mesh.name='m'+i;root.add(mesh);});return root;};
const materialOf=(root:THREE.Object3D,i:number)=>(root.getObjectByName('m'+i) as THREE.Mesh).material;

// Each GLB loads its own copy of shared kit materials; every distinct copy forces a
// full material uniform refresh per draw. Identical copies from other assets are merged.
describe('library-wide material deduplication',()=>{
  it('merges an identical material from another asset, including separate texture objects on one image',()=>{
    const source=new THREE.Source(image),registry=new MaterialRegistry();
    const first=scene(textured(source)),second=scene(textured(source));
    registry.canonicalize(first);registry.canonicalize(second);
    expect(materialOf(second,0)).toBe(materialOf(first,0));
  });
  it.each([
    ['colour',{color:new THREE.Color('#ff0000')}],
    ['roughness',{roughness:.71}],
    ['side',{side:THREE.DoubleSide}],
    ['name',{name:'TeamCloth_Tabard'}],
  ] as const)('keeps a material that differs by %s',(_,patch)=>{
    const source=new THREE.Source(image),registry=new MaterialRegistry();
    const first=scene(textured(source)),second=scene(textured(source,patch as Partial<THREE.MeshStandardMaterial>));
    registry.canonicalize(first);registry.canonicalize(second);
    expect(materialOf(second,0)).not.toBe(materialOf(first,0));
  });
  it('keeps materials whose textures use another image, sampler or transform, or whose provenance differs',()=>{
    const source=new THREE.Source(image),registry=new MaterialRegistry();
    const base=scene(textured(source));registry.canonicalize(base);
    const otherImage=scene(textured(new THREE.Source({width:4,height:4})));
    const wrapped=textured(source);wrapped.map!.wrapS=THREE.RepeatWrapping;
    const repeated=textured(source);repeated.map!.repeat.set(2,2);
    const hash=textured(source);hash.userData.kit_material_hash='def';
    for(const root of [otherImage,scene(wrapped),scene(repeated),scene(hash)]){registry.canonicalize(root);expect(materialOf(root,0)).not.toBe(materialOf(base,0));}
  });
  it('never merges custom shader hooks or GPU objects kept in userData',()=>{
    const source=new THREE.Source(image);
    const hooked=textured(source);hooked.onBeforeCompile=()=>{};
    const masked=textured(source);Object.defineProperty(masked.userData,'teamTintTexture',{value:new THREE.Texture(),enumerable:false});
    expect(materialSignature(hooked)).toBeUndefined();expect(materialSignature(masked)).toBeUndefined();
    const registry=new MaterialRegistry(),first=scene(textured(source));registry.canonicalize(first);
    const second=scene(hooked,masked);registry.canonicalize(second);
    expect(materialOf(second,0)).toBe(hooked);expect(materialOf(second,1)).toBe(masked);
  });
  it('preserves the distinct materials inside one asset so its batching is unchanged',()=>{
    const source=new THREE.Source(image),registry=new MaterialRegistry();
    const a=textured(source),b=textured(source),own=scene(a,b);registry.canonicalize(own);
    expect(materialOf(own,0)).toBe(a);expect(materialOf(own,1)).toBe(b);
    // Two equal materials of a later asset do not both collapse onto one earlier copy either.
    const c=textured(source),d=textured(source),later=scene(c,d);registry.canonicalize(later);
    expect(materialOf(later,0)).toBe(a);expect(materialOf(later,1)).toBe(d);
  });
  it('replaces entries of multi-material meshes and forgets everything on clear',()=>{
    const source=new THREE.Source(image),registry=new MaterialRegistry();
    const first=scene(textured(source));registry.canonicalize(first);
    const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BufferGeometry(),[textured(source),new THREE.MeshStandardMaterial()]);root.add(mesh);
    registry.canonicalize(root);expect((mesh.material as THREE.Material[])[0]).toBe(materialOf(first,0));
    registry.clear();const again=scene(textured(source));registry.canonicalize(again);expect(materialOf(again,0)).not.toBe(materialOf(first,0));
  });
});
