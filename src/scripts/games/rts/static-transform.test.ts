import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {StaticTransform} from './static-transform';

describe('reversible static building transforms',()=>{
  it('keeps exact world matrices without composing or multiplying unchanged descendants',()=>{
    const scene=new THREE.Scene(),root=new THREE.Group(),child=new THREE.Group();scene.add(root);root.add(child);
    root.position.set(4,0,7);root.rotation.y=.6;child.position.set(1,2,3);
    scene.updateMatrixWorld(true);const expected=child.matrixWorld.clone(),cache=new StaticTransform(root);
    cache.update(true);const compose=vi.spyOn(child.matrix,'compose'),multiply=vi.spyOn(child.matrixWorld,'multiplyMatrices');
    for(let i=0;i<3;i++){cache.update(true);scene.updateMatrixWorld(true);}
    expect(compose).not.toHaveBeenCalled();expect(multiply).not.toHaveBeenCalled();expect(child.matrixWorld.equals(expected)).toBe(true);
    cache.update(false);scene.updateMatrixWorld(true);expect(compose).toHaveBeenCalled();expect(multiply).toHaveBeenCalled();
  });
  it('invalidates moved, rotated, scaled and reparented roots without losing authored update flags',()=>{
    const parent=new THREE.Group(),other=new THREE.Group(),root=new THREE.Group(),child=new THREE.Group();parent.add(root);root.add(child);
    child.matrixAutoUpdate=false;child.matrix.makeTranslation(2,3,4);
    const cache=new StaticTransform(root);cache.update(true);
    for(const change of [()=>root.position.x=4,()=>root.rotation.y=.7,()=>root.scale.set(2,3,4),()=>parent.position.z=8,()=>other.add(root)]){
      change();cache.update(true);
      expect(child.matrixWorld.elements).toEqual(new THREE.Matrix4().multiplyMatrices(root.matrixWorld,child.matrix).elements);
      const expected=new THREE.Matrix4().compose(root.position,root.quaternion,root.scale).premultiply(root.parent!.matrixWorld);
      expect(root.matrixWorld.elements).toEqual(expected.elements);
    }
    cache.update(false);expect(root.matrixAutoUpdate).toBe(true);expect(child.matrixAutoUpdate).toBe(false);expect(child.matrixWorldAutoUpdate).toBe(true);
    child.matrix.makeTranslation(9,8,7);root.updateMatrixWorld(true);expect(child.matrixWorld.elements).toEqual(new THREE.Matrix4().multiplyMatrices(root.matrixWorld,child.matrix).elements);
  });
});
