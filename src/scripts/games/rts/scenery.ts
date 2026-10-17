import * as THREE from 'three';
import type {SceneryPlacement} from './maps';
import type {ModelLibrary,ModelInstance} from './models';

/** Batches every source primitive separately so authored materials and local transforms survive instancing. */
export class SceneryLayer {
  readonly root=new THREE.Group();
  private sources:ModelInstance[]=[];
  private batches:Array<{mesh:THREE.InstancedMesh;cells:Int32Array;visible:Uint8Array;matrices:THREE.Matrix4[]}>=[];
  constructor(placements:SceneryPlacement[],library:ModelLibrary,width:number,resourceId?:string){
    if(resourceId)this.root.userData.resourceId=resourceId;
    try{
      for(const kind of ['oak','pine','rock'] as const){
        const selected=placements.filter(p=>p.kind===kind);if(!selected.length)continue;
        const source=library.instantiate(kind);this.sources.push(source);source.root.updateMatrixWorld(true);
        const bounds=new THREE.Box3().setFromObject(source.root),extent=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
        const fit=new THREE.Matrix4().makeScale(1/extent.x,1/extent.y,1/extent.z).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
        source.root.traverse(object=>{
          if(!(object instanceof THREE.Mesh)||object instanceof THREE.SkinnedMesh)return;
          const mesh=new THREE.InstancedMesh(object.geometry,object.material,selected.length);
          mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;
          mesh.userData.sceneryKind=kind;
          if(!resourceId)mesh.raycast=()=>{};
          const matrices=selected.map(p=>{
            const scale=p.size?new THREE.Vector3(p.size.width,p.size.height,p.size.depth):new THREE.Vector3().setScalar(p.scale);
            const matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,0,p.z),new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP,p.rotation),scale);
            if(p.size)matrix.multiply(fit);
            return matrix.multiply(object.matrixWorld);
          });
          this.root.add(mesh);this.batches.push({mesh,matrices,cells:Int32Array.from(selected,p=>Math.floor(p.z)*width+Math.floor(p.x)),visible:new Uint8Array(selected.length)});
        });
      }
    }catch(error){this.dispose();throw error;}
  }
  update(explored:Uint8Array):void {
    for(const batch of this.batches){let changed=false;
      for(let i=0;i<batch.cells.length;i++){
        const visible=explored[batch.cells[i]]===1?1:0;
        if(batch.visible[i]!==visible){batch.visible[i]=visible;changed=true;}
      }
      if(!changed)continue;
      let count=0;for(let i=0;i<batch.matrices.length;i++)if(batch.visible[i])batch.mesh.setMatrixAt(count++,batch.matrices[i]);
      batch.mesh.count=count;if(count)batch.mesh.instanceMatrix.needsUpdate=true;
      // Raycasting bounds describe the compacted visible instances, not the
      // first explored subset. Hidden resource trees must never be clickable.
      batch.mesh.boundingSphere=null;batch.mesh.boundingBox=null;
    }
  }
  dispose():void {
    for(const {mesh} of this.batches){mesh.removeFromParent();mesh.dispose();}
    this.batches=[];for(const source of this.sources)source.dispose();this.sources=[];
  }
}
