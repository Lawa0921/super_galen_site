import * as THREE from 'three';
import type {Landmark} from './districts';
import type {Vec2} from './maps';
import type {ModelLibrary,ModelInstance} from './models';

/** Static authored structures share library resources, with per-placement fog and LOD. */
export class LandmarkLayer {
  readonly root=new THREE.Group();
  private placements:Array<{instance:ModelInstance;point:Landmark;height:number;cell:number}>=[];
  constructor(points:Landmark[],library:ModelLibrary,width:number){
    this.root.name='Original kingdom landmarks';
    try{
      for(const point of points){
        const instance=library.instantiate(point.assetId,-1);
        const height=new THREE.Box3().setFromObject(instance.root).getSize(new THREE.Vector3()).y;
        this.placements.push({instance,point,height,cell:Math.floor(point.z)*width+Math.floor(point.x)});
        instance.root.position.set(point.x,0,point.z);instance.root.rotation.y=point.rotation+instance.yaw;
        instance.root.visible=false;instance.root.userData.landmarkAssetId=point.assetId;
        instance.root.traverse(object=>{if(object instanceof THREE.Mesh)object.raycast=()=>{};});
        this.root.add(instance.root);
      }
    }catch(error){this.dispose();throw error;}
  }
  update(explored:Uint8Array,projectedHeight:(point:Vec2,height:number)=>number):void {
    for(const {instance,point,height,cell} of this.placements){
      instance.root.visible=explored[cell]===1;
      if(instance.root.visible)instance.setDetailPixels(projectedHeight(point,height));
    }
  }
  dispose():void {for(const {instance} of this.placements)instance.dispose();this.placements=[];this.root.removeFromParent();}
}
