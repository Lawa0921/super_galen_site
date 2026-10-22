import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {createWorldWeapon} from './world-weapon';
import {cloneModel,disposeModelInstance} from './model-resources';

function fixture(){
 const source=new T.Group(),receiver=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()),mount=new T.Group(),muzzle=new T.Object3D();
 source.position.set(.1,.2,.3);source.rotation.y=.3;mount.rotation.z=.4;mount.scale.setScalar(.7);receiver.name='receiver';receiver.position.set(.2,.3,.4);muzzle.name='muzzle';muzzle.position.set(0,0,-1);receiver.add(muzzle);mount.add(receiver);source.add(mount);
 const bone=new T.Bone();bone.name='fps_hand_l';const child=new T.Bone();child.name='fps_index_l';bone.add(child);source.add(bone);
 const hands=new T.SkinnedMesh(new T.BufferGeometry(),new T.MeshStandardMaterial());hands.name='view_hands';source.add(hands);source.updateMatrixWorld(true);hands.bind(new T.Skeleton([bone,child]));
 source.animations=[new T.AnimationClip('fps_reload',1,[])];return{source,receiver,muzzle,hands,bone};
}
describe('world weapon template',()=>{
 it('removes unused FPS skin, bones and clips while preserving rigid meshes, anchors and transforms',()=>{
  const f=fixture();f.source.updateMatrixWorld(true);const expected=f.muzzle.matrixWorld.clone(),world=createWorldWeapon(f.source);world.updateMatrixWorld(true);
  expect(world.getObjectByName('muzzle')!.matrixWorld.elements).toEqual(expected.elements);
  let bones=0,skins=0,clips=0;world.traverse(n=>{bones+=Number(n instanceof T.Bone);skins+=Number(n instanceof T.SkinnedMesh);clips+=n.animations.length;});expect([bones,skins,clips]).toEqual([0,0,0]);
  expect(world.getObjectByName('view_hands')).toBeUndefined();const receiver=world.getObjectByName('receiver') as T.Mesh;expect(receiver.geometry).toBe(f.receiver.geometry);expect(receiver.material).toBe(f.receiver.material);
  expect(f.source.getObjectByName('fps_hand_l')).toBe(f.bone);expect(f.hands.parent).toBe(f.source);expect(f.source.animations).toHaveLength(1);
 });
 it('keeps template/source resources usable after removing one actor weapon',()=>{
  const f=fixture(),world=createWorldWeapon(f.source),a=cloneModel(world),b=cloneModel(world);let geometryDisposed=0,sourceMaterialDisposed=0;
  f.receiver.geometry.addEventListener('dispose',()=>geometryDisposed++);(f.receiver.material as T.Material).addEventListener('dispose',()=>sourceMaterialDisposed++);disposeModelInstance(a);
  expect(geometryDisposed).toBe(0);expect(sourceMaterialDisposed).toBe(0);expect((b.getObjectByName('receiver') as T.Mesh).geometry).toBe(f.receiver.geometry);
 });
 it('rejects gun content under a bone or an unexpected skinned gun instead of silently dropping it',()=>{
  const f=fixture();f.bone.add(f.receiver);expect(()=>createWorldWeapon(f.source)).toThrow(/bone/i);expect(f.receiver.parent).toBe(f.bone);
  const g=fixture();g.hands.name='animated_receiver';expect(()=>createWorldWeapon(g.source)).toThrow(/skinned/i);expect(g.hands.parent).toBe(g.source);
 });
 it('rejects rigid gun content inside a named FPS-hand subtree',()=>{
  const f=fixture();f.hands.add(f.receiver);expect(()=>createWorldWeapon(f.source)).toThrow(/rigid/i);expect(f.receiver.parent).toBe(f.hands);
 });
});
