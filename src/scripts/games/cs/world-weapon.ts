import * as T from 'three';

/** Load-time rigid template for third-person use. Borrows geometry/materials
 * from the FPS asset; instances still clone their own materials. Never mutate
 * or dispose the shared FPS source when dropping unused hands and bones. */
export function createWorldWeapon(source:T.Group):T.Group{
 const isHands=(node:T.Object3D)=>/view_hands/i.test(node.name);
 const copy=(node:T.Object3D):T.Object3D|null=>{
  if(isHands(node)){
   node.traverse(child=>{if(child instanceof T.Mesh&&!(child instanceof T.SkinnedMesh))throw Error('Unexpected rigid content in FPS hands');});
   return null;
  }
  if(node instanceof T.Bone){
   node.traverse(child=>{if(!(child instanceof T.Bone)&&!isHands(child))throw Error('World weapon has non-hand content under a bone');});
   return null;
  }
  if(node instanceof T.SkinnedMesh)throw Error('Unexpected skinned world weapon');
  const clone=node.clone(false);clone.animations=[];
  for(const child of node.children){const retained=copy(child);if(retained)clone.add(retained);}
  return clone;
 };
 return copy(source) as T.Group;
}
