import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {batchCompatibleSkins} from './skin-batches';
import {ModelLibrary,REQUIRED_MODELS} from './models';
import {LANDMARK_MODELS} from './landmark-models';

function fixture(){
  const root=new THREE.Group(),bone=new THREE.Bone(),material=new THREE.MeshStandardMaterial();bone.name='Hand';root.add(bone);
  const skeleton=new THREE.Skeleton([bone]);
  const meshes=[0,2].map((offset,i)=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([offset,0,0,offset+1,0,0,offset,1,0],3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(12).fill(0),4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));geometry.setIndex([0,1,2]);
    const wrapper=new THREE.Group(),mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='Equipment'+i;wrapper.add(mesh);root.add(wrapper);mesh.bind(skeleton);
    mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(offset,0,0),2);mesh.boundingBox=mesh.boundingSphere.getBoundingBox(new THREE.Box3());return mesh;
  });
  root.updateMatrixWorld(true);
  const clip=new THREE.AnimationClip('Attack',1,[new THREE.VectorKeyframeTrack('Hand.position',[0,1],[0,0,0,0,1,0])]);
  return {root,bone,meshes,clips:[clip]};
}
function skins(root:THREE.Object3D){const result:THREE.SkinnedMesh[]=[];root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)result.push(o);});return result;}
// Deliberately model absent runtime bounds without widening Three's production types.
function nullableBounds(mesh:THREE.SkinnedMesh){return mesh as unknown as {boundingSphere:THREE.Sphere|null;boundingBox:THREE.Box3|null};}
function positions(meshes:THREE.SkinnedMesh[]){return meshes.flatMap(m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(m.matrixWorld).toArray()));}

describe('compatible skin draw batching',()=>{
  it('reduces draw meshes while preserving indices, UVs, weighted vertices and animated clone independence',()=>{
    const {root,meshes,clips}=fixture(),reference=clone(root),expected=positions(meshes);
    expect(batchCompatibleSkins(root,clips)).toBe(1);const merged=skins(root);expect(merged).toHaveLength(1);
    expect(positions(merged)).toEqual(expected);expect(Array.from(merged[0].geometry.index!.array)).toEqual([0,1,2,3,4,5]);
    expect(Array.from(merged[0].geometry.attributes.uv.array)).toEqual([0,0,1,0,0,1,0,0,1,0,0,1]);
    const instance=clone(root),a=new THREE.AnimationMixer(instance),b=new THREE.AnimationMixer(reference);
    a.clipAction(clips[0]).play();b.clipAction(clips[0]).play();a.update(.6);b.update(.6);instance.updateMatrixWorld(true);reference.updateMatrixWorld(true);
    expect(positions(skins(instance))).toEqual(positions(skins(reference)));expect(root.getObjectByName('Hand')!.position.y).toBe(0);
    for(const source of meshes){expect(merged[0].boundingSphere!.center.distanceTo(source.boundingSphere!.center)+source.boundingSphere!.radius).toBeLessThanOrEqual(merged[0].boundingSphere!.radius+1e-8);}
    expect(merged[0].userData.rtsConservativeBounds.sphere_radius_m).toBe(merged[0].boundingSphere!.radius);
    expect(batchCompatibleSkins(root,clips)).toBe(0);
  });
  it.each(['material','inverse','transform','attributes','transparent','morph','hidden','bone-parent','draw-range','children','missing-bounds'])(
    'preserves separate draws when %s differs or is unsupported',reason=>{
      const {root,bone,meshes,clips}=fixture(),m=meshes[1];
      if(reason==='material')m.material=m.material.clone();
      if(reason==='inverse'){m.skeleton=new THREE.Skeleton([bone],[new THREE.Matrix4().makeTranslation(1,0,0)]);}
      if(reason==='transform')m.parent!.position.x=1;
      if(reason==='attributes')m.geometry.setAttribute('uv1',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));
      if(reason==='transparent')(m.material as THREE.Material).transparent=true;
      if(reason==='morph')m.geometry.morphAttributes.position=[m.geometry.attributes.position.clone()];
      if(reason==='hidden')m.parent!.visible=false;
      if(reason==='bone-parent')bone.add(m.parent!);
      if(reason==='draw-range')m.geometry.setDrawRange(0,1);
      if(reason==='children')m.add(new THREE.Object3D());
      if(reason==='missing-bounds')nullableBounds(m).boundingSphere=null;
      expect(batchCompatibleSkins(root,clips)).toBe(0);expect(skins(root)).toHaveLength(2);
  });
  it('retains independently animated mesh nodes and ordinary attachments',()=>{
    const {root,meshes,clips}=fixture(),attachment=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());root.add(attachment);
    clips[0].tracks.push(new THREE.VectorKeyframeTrack(meshes[1].name+'.position',[0,1],[0,0,0,0,1,0]));
    expect(batchCompatibleSkins(root,clips)).toBe(0);expect(skins(root)).toHaveLength(2);expect(attachment.parent).toBe(root);
  });
  it('batches the library source once, retaining wrapper bounds, team masks, both LODs and library-owned geometry',async()=>{
    const assets=Object.fromEntries(REQUIRED_MODELS.map(id=>[id,{status:'published',url:`/assets/games/rts/models/${id}.glb`,...(id==='guard'||LANDMARK_MODELS.includes(id)?{lod1:`/assets/games/rts/models/${id}-lod1.glb`}:{}),...(LANDMARK_MODELS.includes(id)?{scale:1}:{})}]));
    const source=()=>{const f=fixture();for(const mesh of f.meshes){
      mesh.parent!.userData.rtsConservativeBounds={sphere_center_y_up_m:mesh.boundingSphere!.center.toArray(),sphere_radius_m:2};nullableBounds(mesh).boundingSphere=null;nullableBounds(mesh).boundingBox=null;
    }const material=f.meshes[0].material as THREE.MeshStandardMaterial;material.name='TeamCloth';material.userData.teamTintMask='data:image/png;base64,AAAA';return {scene:f.root,animations:f.clips} as unknown as GLTF;};
    const sources=[source(),source()],mask=new THREE.Texture() as THREE.Texture<HTMLImageElement>,library=new ModelLibrary();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({assets})}));
    vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>url.endsWith('/guard.glb')?sources[0]:url.endsWith('/guard-lod1.glb')?sources[1]:{scene:new THREE.Group(),animations:[]} as unknown as GLTF);
    vi.spyOn(THREE.TextureLoader.prototype,'loadAsync').mockResolvedValue(mask);
    try{
      await library.load(()=>{},'river');expect(skins(sources[0].scene)).toHaveLength(1);expect(skins(sources[1].scene)).toHaveLength(1);
      const a=library.instantiate('guard',0),b=library.instantiate('guard',1),ma=skins(a.root),mb=skins(b.root);
      expect(ma).toHaveLength(2);expect(mb).toHaveLength(2);expect(ma[0].geometry).toBe(mb[0].geometry);expect(ma[0].geometry).toBe(skins(sources[0].scene)[0].geometry);
      expect(ma[0].boundingSphere!.radius).toBe(3);expect(ma[1].boundingSphere!.radius).toBe(3);
      expect((ma[0].material as THREE.MeshStandardMaterial).color.equals((mb[0].material as THREE.MeshStandardMaterial).color)).toBe(false);
      const shader:any={uniforms:{},vertexShader:'',fragmentShader:'#include <map_fragment>'};(ma[0].material as THREE.Material).onBeforeCompile(shader,{} as THREE.WebGLRenderer);expect(shader.uniforms.rtsTeamMask.value).toBe(mask);
      a.animate('attack',0,{sequence:1,elapsed:.6});a.setDetailPixels(20);a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);
      expect(ma[0].skeleton).toBe(ma[1].skeleton);expect(ma[0].skeleton).not.toBe(mb[0].skeleton);
      expect(ma[1].getVertexPosition(0,new THREE.Vector3()).y).toBeCloseTo(.6);expect(mb[0].getVertexPosition(0,new THREE.Vector3()).y).toBe(0);
      const dispose=vi.spyOn(ma[0].geometry,'dispose');a.dispose();b.dispose();expect(dispose).not.toHaveBeenCalled();library.dispose();expect(dispose).toHaveBeenCalledOnce();
    }finally{library.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();}
  });
});
