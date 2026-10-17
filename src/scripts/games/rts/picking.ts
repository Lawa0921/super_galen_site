import type {Object3D} from 'three';
export type PickTarget={entityId?:number;resourceId?:string};
export function pickTarget(hits:ReadonlyArray<{object:Object3D}>):PickTarget|null {
  let resource:PickTarget|null=null;
  for(const hit of hits){
    // Raycaster intersects hidden descendants too; reject the entire hidden LOD.
    let visible=true;
    for(let ancestor:Object3D|null=hit.object;ancestor;ancestor=ancestor.parent){if(!ancestor.visible){visible=false;break;}}
    if(!visible)continue;
    let root:Object3D|null=hit.object;
    while(root){
      if(typeof root.userData.entityId==='number')return {entityId:root.userData.entityId};
      if(typeof root.userData.resourceId==='string')resource??={resourceId:root.userData.resourceId};
      root=root.parent;
    }
  }
  return resource;
}
