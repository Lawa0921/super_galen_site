import * as THREE from 'three';

/**
 * A reversible world-transform cache for immutable, unskinned subtrees (completed buildings, fog memories, static world).
 * While frozen only the root transform is watched: children added or moved later keep stale matrices,
 * so release (`update(false)`) before restructuring the subtree. Skinned subtrees are never frozen.
 */
export class StaticTransform {
  private flags:Array<{node:THREE.Object3D;local:boolean;world:boolean}>|undefined;
  private parent:THREE.Object3D|null=null;
  private parentMatrix=new THREE.Matrix4();
  private position=new THREE.Vector3();
  private quaternion=new THREE.Quaternion();
  private scale=new THREE.Vector3();
  /** Own `updateMatrixWorld` the root had before freezing (normally none: the prototype method). */
  private traversal:PropertyDescriptor|undefined;
  private skinned:boolean|undefined;
  constructor(private root:THREE.Object3D){}
  update(enabled:boolean):void {
    const root=this.root;
    if(!enabled){this.restore();return;}
    // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse; skipping it would misplace the skin.
    if(this.skinned??=hasSkin(root))return;
    root.parent?.updateWorldMatrix(true,false);
    if(this.flags&&this.parent===root.parent&&this.position.equals(root.position)&&this.quaternion.equals(root.quaternion)&&this.scale.equals(root.scale)&&
      (!root.parent||this.parentMatrix.equals(root.parent.matrixWorld)))return;
    this.restore();root.updateWorldMatrix(true,true);
    this.parent=root.parent;if(root.parent)this.parentMatrix.copy(root.parent.matrixWorld);
    this.position.copy(root.position);this.quaternion.copy(root.quaternion);this.scale.copy(root.scale);
    this.flags=[];root.traverse(node=>{
      this.flags!.push({node,local:node.matrixAutoUpdate,world:node.matrixWorldAutoUpdate});
      node.matrixAutoUpdate=false;node.matrixWorldAutoUpdate=false;
    });
    // three r182 still walks every descendant of a non-auto node each frame. With all
    // matrices cached and every flag off that walk cannot change anything, so skip it.
    // `updateWorldMatrix` (Box3, LOD activation, re-freezing) is left intact.
    this.traversal=Object.getOwnPropertyDescriptor(root,'updateMatrixWorld');
    root.updateMatrixWorld=function(){};
  }
  private restore():void {
    if(!this.flags)return;
    if(this.traversal)Object.defineProperty(this.root,'updateMatrixWorld',this.traversal);
    else delete (this.root as {updateMatrixWorld?:unknown}).updateMatrixWorld;
    this.traversal=undefined;
    for(const {node,local,world} of this.flags){node.matrixAutoUpdate=local;node.matrixWorldAutoUpdate=world;node.matrixWorldNeedsUpdate=true;}
    this.flags=undefined;
  }
}

function hasSkin(root:THREE.Object3D):boolean {
  let found=false;
  root.traverse(node=>{if((node as THREE.SkinnedMesh).isSkinnedMesh)found=true;});
  return found;
}
