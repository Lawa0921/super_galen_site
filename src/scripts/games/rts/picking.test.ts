import {describe,expect,it} from 'vitest';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {pickTarget} from './picking';

function hit(data:Record<string,unknown>){const root=new Group();root.userData=data;const child=new Mesh();root.add(child);return {object:child};}
describe('battlefield picking through foliage',()=>{
  it('uses a tree resource anchor for harvesting',()=>{
    expect(pickTarget([hit({resourceId:'wood-0'})])).toEqual({resourceId:'wood-0'});
  });
  it('keeps units selectable behind a resource canopy',()=>{
    expect(pickTarget([hit({resourceId:'wood-0'}),hit({entityId:2})])).toEqual({entityId:2});
  });
  it('ignores scenery without an interaction anchor',()=>{
    expect(pickTarget([hit({})])).toBeNull();
  });
  it('ignores an invisible LOD silhouette and selects the visible entity behind it',()=>{
    const root=new Group();root.userData.entityId=2;
    const high=new Group(),low=new Group(),material=new MeshBasicMaterial();
    const large=new BoxGeometry(2,2,1),small=new BoxGeometry(.5,2,1);
    high.add(new Mesh(large,material));low.add(new Mesh(small,material));root.add(high,low);
    const behind=new Mesh(large,material);behind.position.z=-2;behind.userData.entityId=7;
    high.visible=false;root.updateMatrixWorld(true);behind.updateMatrixWorld(true);
    const ray=new Raycaster(new Vector3(.8,0,5),new Vector3(0,0,-1));
    expect(pickTarget(ray.intersectObjects([root,behind],true))).toEqual({entityId:7});
    high.visible=true;low.visible=false;
    expect(pickTarget(ray.intersectObjects([root,behind],true))).toEqual({entityId:2});
    large.dispose();small.dispose();material.dispose();
  });
  it('rejects a hidden ancestor even when an interaction anchor is lower in the tree',()=>{
    const hidden=new Group();hidden.visible=false;const anchored=hit({entityId:2});hidden.add(anchored.object.parent!);
    expect(pickTarget([anchored])).toBeNull();
    hidden.children[0].userData={resourceId:'wood-0'};
    expect(pickTarget([anchored])).toBeNull();
  });
});
