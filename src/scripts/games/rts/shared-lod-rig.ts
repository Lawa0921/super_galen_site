import {AnimationClip,Bone,Mesh,Object3D,PropertyBinding,SkinnedMesh,type Skeleton} from 'three';

const equalNumbers=(a:ArrayLike<number>,b:ArrayLike<number>)=>a.length===b.length&&Array.from(a).every((n,i)=>n===b[i]);
function bonePath(bone:Object3D,root:Object3D):string|undefined {
 const parts:string[]=[];let node:Object3D|null=bone;
 while(node&&node!==root){if(!node.name)return undefined;node.updateMatrix();parts.unshift(node.name+':'+node.matrix.elements.join(','));node=node.parent;}
 return node===root?parts.join('/'):undefined;
}
function skin(root:Object3D):{skeleton:Skeleton;meshes:SkinnedMesh[]}|undefined {
 const meshes:SkinnedMesh[]=[];let unsupported=false;
 root.traverse(o=>{if(o instanceof SkinnedMesh)meshes.push(o);else if(o instanceof Mesh)unsupported=true;});
 if(unsupported||!meshes.length||meshes.some(m=>m.skeleton!==meshes[0].skeleton))return;
 return {skeleton:meshes[0].skeleton,meshes};
}

/** Share poses only when two authored LODs have exactly the same animation rig.
 * Each mesh keeps its own bind transform and conservative culling bounds.
 * Scene.updateMatrixWorld traverses hidden roots too, so the owner bones keep
 * following their unit even when only the other LOD's geometry is rendered.
 */
export function shareCompatibleLodRig(primary:Object3D,primaryClips:AnimationClip[],secondary:Object3D,secondaryClips:AnimationClip[]):boolean {
 const high=skin(primary),low=skin(secondary);if(!high||!low||!primaryClips.length||primaryClips.length!==secondaryClips.length)return false;
 primary.updateMatrix();secondary.updateMatrix();
 if(primary.name!==secondary.name||!primary.matrix.equals(secondary.matrix))return false;
 const a=high.skeleton,b=low.skeleton;
 const bindings=(meshes:SkinnedMesh[])=>[...new Set(meshes.map(m=>[m.bindMode,...m.bindMatrix.elements,...m.bindMatrixInverse.elements].join(',')))].sort().join('|');
 if(bindings(high.meshes)!==bindings(low.meshes))return false;
 if(a.bones.length!==b.bones.length||a.boneInverses.length!==b.boneInverses.length)return false;
 const names=new Set(a.bones.map(bone=>bone.name));if(names.size!==a.bones.length||names.has(''))return false;
 for(let i=0;i<a.bones.length;i++){
  const first=a.bones[i],second=b.bones[i],pa=bonePath(first,primary),pb=bonePath(second,secondary);
  if(!pa||pa!==pb||!a.boneInverses[i].equals(b.boneInverses[i]))return false;
  if(first.children.filter(c=>c instanceof Bone).map(c=>c.name).join('|')!==second.children.filter(c=>c instanceof Bone).map(c=>c.name).join('|'))return false;
 }
 const highNames=new Set(primaryClips.map(c=>c.name)),lowNames=new Set(secondaryClips.map(c=>c.name));
 if(highNames.size!==primaryClips.length||lowNames.size!==secondaryClips.length)return false;
 for(const clip of primaryClips){
  const other=secondaryClips.find(c=>c.name===clip.name);if(!other||clip.duration!==other.duration||clip.blendMode!==other.blendMode||clip.tracks.length!==other.tracks.length)return false;
  if(new Set(clip.tracks.map(t=>t.name)).size!==clip.tracks.length)return false;
  for(const track of clip.tracks){
   const target=PropertyBinding.parseTrackName(track.name),match=other.tracks.find(t=>t.name===track.name);
   if(!names.has(target.nodeName)||target.objectName||!['position','quaternion','scale'].includes(target.propertyName)||!match||track.ValueTypeName!==match.ValueTypeName||track.getInterpolation()!==match.getInterpolation()||!equalNumbers(track.times,match.times)||!equalNumbers(track.values,match.values))return false;
  }
 }
 for(const mesh of low.meshes)mesh.skeleton=a;
 // The low palette no longer drives a mesh. Remove only its pure bone
 // branches; authored attachments or non-bone children retain their hierarchy.
 // Keeping these unused branches makes Three recompute a second rest rig on
 // every frame even though both LODs already sample the same animated bones.
 const unused=new Set<Object3D>(b.bones);
 const onlyUnusedBones=(node:Object3D):boolean=>unused.has(node)&&node.children.every(onlyUnusedBones);
 for(const bone of b.bones)if(!unused.has(bone.parent!)&&onlyUnusedBones(bone))bone.removeFromParent();
 return true;
}
