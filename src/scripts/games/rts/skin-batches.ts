import {Bone,Box3,Mesh,PropertyBinding,SkinnedMesh,type AnimationClip,type Object3D,type BufferGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

function attributes(geometry:BufferGeometry):string {
  return Object.keys(geometry.attributes).sort().map(key=>{
    const a=geometry.attributes[key];return [key,a.itemSize,a.normalized,a.array.constructor.name].join(':');
  }).join('|');
}
function compatible(a:SkinnedMesh,b:SkinnedMesh):boolean {
  const x=a.skeleton,y=b.skeleton;
  return a.material===b.material&&a.matrixWorld.equals(b.matrixWorld)&&a.bindMode===b.bindMode&&a.bindMatrix.equals(b.bindMatrix)&&a.bindMatrixInverse.equals(b.bindMatrixInverse)&&
    a.castShadow===b.castShadow&&a.receiveShadow===b.receiveShadow&&a.layers.mask===b.layers.mask&&a.renderOrder===b.renderOrder&&a.frustumCulled===b.frustumCulled&&
    x.bones.length===y.bones.length&&x.boneInverses.length===y.boneInverses.length&&x.bones.every((bone,i)=>bone===y.bones[i])&&x.boneInverses.every((inverse,i)=>inverse.equals(y.boneInverses[i]))&&
    !!a.geometry.index===!!b.geometry.index&&attributes(a.geometry)===attributes(b.geometry);
}

/** Consolidate opaque skin primitives once per loaded asset. No vertex, UV,
 * weight or bind transform is changed. Unsupported presentations keep their
 * original draws; callers prepare the authored all-animation bounds first. */
export function batchCompatibleSkins(root:Object3D,clips:AnimationClip[]):number {
  if(!clips.length||root.userData.rtsConstruction||root.userData.rtsBuildingLifecycle)return 0;
  const bones=new Set<string>();root.traverse(o=>{if(o instanceof Bone)bones.add(o.name);});
  for(const clip of clips)for(const track of clip.tracks){
    const target=PropertyBinding.parseTrackName(track.name);
    if(!bones.has(target.nodeName)||target.objectName||!['position','quaternion','scale'].includes(target.propertyName))return 0;
  }
  root.updateMatrixWorld(true);
  const groups:SkinnedMesh[][]=[];
  root.traverse(o=>{
    if(!(o instanceof SkinnedMesh)||Array.isArray(o.material)||o.material.transparent||o.children.length||!o.boundingSphere||!o.boundingBox)return;
    const g:BufferGeometry=o.geometry;
    if(g.groups.length||Object.keys(g.morphAttributes).length||g.drawRange.start!==0||g.drawRange.count!==Infinity||
      Object.values(g.attributes).some(a=>'isInterleavedBufferAttribute' in a))return;
    for(let node:Object3D|null=o;node;node=node.parent)if(!node.visible||node instanceof Bone)return;
    const group=groups.find(group=>compatible(group[0],o));if(group)group.push(o);else groups.push([o]);
  });
  const retired=new Set<BufferGeometry>();let removed=0;
  for(const group of groups){
    if(group.length<2)continue;
    const geometry=mergeGeometries(group.map(m=>m.geometry),false);if(!geometry)continue;
    const first=group[0],sphere=first.boundingSphere!.clone(),box=first.boundingBox!.clone();
    for(const mesh of group.slice(1)){sphere.union(mesh.boundingSphere!);box.union(mesh.boundingBox!);}
    for(const mesh of group)retired.add(mesh.geometry);
    first.geometry=geometry;first.boundingSphere=sphere;first.boundingBox=box;
    // ModelInstance copies this local-space sphere to each clone. It must
    // override the first primitive's smaller inherited wrapper bounds.
    first.userData.rtsConservativeBounds={sphere_center_y_up_m:sphere.center.toArray(),sphere_radius_m:sphere.radius};
    geometry.boundingBox=new Box3().copy(box);geometry.boundingSphere=sphere.clone();
    for(const mesh of group.slice(1)){mesh.removeFromParent();removed++;}
  }
  // An original geometry may still be referenced by an unbatched primitive.
  root.traverse(o=>{if(o instanceof Mesh)retired.delete(o.geometry);});retired.forEach(g=>g.dispose());
  return removed;
}
