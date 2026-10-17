import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {ModelInstance} from './models';
import {pickTarget} from './picking';

function fixture(){
 const scene=new THREE.Group(),rig=new THREE.Group(),joint=new THREE.Bone();rig.name='Rig';joint.name='Joint';rig.add(joint);scene.add(rig);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(12).fill(0),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
 const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());mesh.name='Body';mesh.bind(new THREE.Skeleton([joint]));rig.add(mesh);
 const animations=['Idle','Walk','Attack','Death'].map(name=>new THREE.AnimationClip(name,1,[new THREE.NumberKeyframeTrack('Joint.position[x]',[0,1],[0,1])]));
 return {scene,animations} as unknown as GLTF;
}
const entry={url:'/assets/games/rts/models/guard.glb',status:'published' as const};
const mesh=(model:ModelInstance,lod:number)=>model.root.children[lod].getObjectByName('Body') as THREE.SkinnedMesh;
function vertex(model:ModelInstance,lod:number){model.root.updateMatrixWorld(true);return mesh(model,lod).getVertexPosition(0,new THREE.Vector3()).x;}

describe('one compatible rig per unit across LOD meshes',()=>{
 it('skips hidden independent world transforms while preserving both local animation timelines',()=>{
  const high=fixture(),low=fixture();for(const clip of low.animations)clip.tracks[0].values[1]=2;
  const model=new ModelInstance(high,entry,0,false,low),hiddenJoint=model.root.children[1].getObjectByName('Joint')!;
  const update=vi.spyOn(hiddenJoint,'updateMatrixWorld');model.animate('walk',.3);model.root.updateMatrixWorld(true);
  expect(hiddenJoint.position.x).toBeCloseTo(.6);expect(update).not.toHaveBeenCalled();
  model.setDetailPixels(47);model.root.updateMatrixWorld(true);expect(update).toHaveBeenCalled();
  expect(vertex(model,1)).toBeCloseTo(.6);model.dispose();
 });
 it('restores independent world poses at the LOD boundary after motion, pause, attack and death',()=>{
  const high=fixture(),low=fixture();for(const clip of low.animations)clip.tracks[0].values[1]=2;
  const model=new ModelInstance(high,entry,0,false,low),references=[new ModelInstance(high,entry),new ModelInstance(low,entry)];
  const children=[...model.root.children];
  const point=(root:THREE.Object3D,index:number)=>{const body=root.getObjectByName('Body') as THREE.SkinnedMesh;return body.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(body.matrixWorld);};
  for(const [name,dt,cue] of [['walk',.3,undefined],['attack',.05,{sequence:1,elapsed:.6}],['attack',0,{sequence:1,elapsed:.6}],['death',2,undefined]] as const){
   for(const actor of [model,...references]){actor.root.position.set(4+dt,2,3);actor.root.rotation.y=.7;actor.root.scale.set(1.2,.8,1.1);actor.animate(name,dt,cue);}
   for(const pixels of [47,48,47,100]){
    const index=pixels<48?1:0;model.setDetailPixels(pixels);model.root.updateMatrixWorld(true);references[index].root.updateMatrixWorld(true);
    for(let vertex=0;vertex<3;vertex++)expect(point(model.root.children[index],vertex).distanceTo(point(references[index].root.children[0],vertex))).toBeLessThan(1e-9);
    expect(model.root.children[index].visible).toBe(true);expect(model.root.children[1-index].visible).toBe(false);
    expect(model.root.children).toEqual(children);
   }
  }
  for(const actor of [model,...references])actor.dispose();
 });
 it('does not let stale hidden independent geometry intercept picking after the unit moves',()=>{
  const high=fixture(),low=fixture();low.animations[0].tracks[0].values[1]=2;
  const model=new ModelInstance(high,entry,0,false,low);model.root.userData.entityId=2;
  model.root.updateMatrixWorld(true);model.setDetailPixels(47);model.root.position.x=10;model.root.updateMatrixWorld(true);
  const behind=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial());behind.position.set(.2,.2,-1);behind.userData.entityId=7;behind.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(.2,.2,5),new THREE.Vector3(0,0,-1)),hits=ray.intersectObjects([model.root,behind],true);
  expect(hits.some(hit=>hit.object===mesh(model,0))).toBe(true);expect(pickTarget(hits)).toEqual({entityId:7});
  model.dispose();behind.geometry.dispose();behind.material.dispose();
 });
 it('removes only redundant low-detail bone branches while preserving the live pose hierarchy',()=>{
  const model=new ModelInstance(fixture(),entry,0,false,fixture());
  const bones=(root:THREE.Object3D)=>{const result:THREE.Bone[]=[];root.traverse(o=>{if(o instanceof THREE.Bone)result.push(o);});return result;};
  expect(bones(model.root.children[0])).toHaveLength(1);expect(bones(model.root.children[1])).toHaveLength(0);
  model.root.position.set(4,0,3);model.root.rotation.y=.5;model.animate('walk',.3);model.setDetailPixels(10);
  expect(vertex(model,0)).toBeCloseTo(vertex(model,1));expect(mesh(model,1).skeleton.bones[0].parent).not.toBeNull();
  model.dispose();
 });
 it('samples one mixer and keeps world poses identical through detail switches, cues, pause and death',()=>{
  const a=fixture(),b=fixture(),model=new ModelInstance(a,entry,0,false,b),other=new ModelInstance(a,entry,1,false,b);
  expect(mesh(model,0).skeleton).toBe(mesh(model,1).skeleton);expect(mesh(model,0).skeleton).not.toBe(mesh(other,0).skeleton);
  const update=vi.spyOn(THREE.AnimationMixer.prototype,'update');model.animate('walk',.25);expect(update).toHaveBeenCalledTimes(1);
  model.setDetailPixels(20);expect(vertex(model,1)).toBeCloseTo(.25);expect(vertex(model,0)).toBeCloseTo(.25);
  model.animate('attack',.05,{sequence:1,elapsed:.6});expect(vertex(model,1)).toBeCloseTo(.6);
  model.setDetailPixels(80);model.animate('attack',0,{sequence:1,elapsed:.6});expect(vertex(model,0)).toBeCloseTo(.6);
  model.animate('attack',.1,{sequence:2,elapsed:0});expect(vertex(model,0)).toBeCloseTo(0);
  model.animate('death',2);model.setDetailPixels(10);expect(vertex(model,1)).toBeCloseTo(1);
  model.animate('death',1);expect(vertex(model,1)).toBeCloseTo(1);
  expect(vertex(other,0)).toBe(0);update.mockRestore();model.dispose();other.dispose();
 });
 it.each(['clip','bind','rest','hierarchy','mesh-track','root-transform','bind-state'])('retains independent rigs for incompatible %s',reason=>{
  const a=fixture(),b=fixture();const joint=b.scene.getObjectByName('Joint')!,body=b.scene.getObjectByName('Body') as THREE.SkinnedMesh;
  if(reason==='clip')b.animations[0].tracks[0].values[1]=2;
  if(reason==='bind')body.skeleton.boneInverses[0].makeTranslation(1,0,0);
  if(reason==='root-transform')b.scene.position.x=1;
  if(reason==='bind-state')body.bind(body.skeleton,new THREE.Matrix4().makeTranslation(.5,0,0));
  if(reason==='rest')joint.position.y=.1;
  if(reason==='hierarchy'){const extra=new THREE.Group();extra.name='Extra';joint.parent!.add(extra);extra.add(joint);}
  if(reason==='mesh-track')for(const gltf of [a,b])gltf.animations[0].tracks.push(new THREE.NumberKeyframeTrack('Body.position[z]',[0,1],[0,1]));
  const model=new ModelInstance(a,entry,0,false,b);expect(mesh(model,0).skeleton).not.toBe(mesh(model,1).skeleton);model.dispose();
 });
 it('retains low-detail bone branches that own non-bone attachment nodes',()=>{
  const high=fixture(),low=fixture(),attachment=new THREE.Group();attachment.name='Attachment';low.scene.getObjectByName('Joint')!.add(attachment);
  const model=new ModelInstance(high,entry,0,false,low);
  expect(mesh(model,0).skeleton).toBe(mesh(model,1).skeleton);
  expect(model.root.children[1].getObjectByName('Attachment')?.parent?.name).toBe('Joint');model.dispose();
 });
 it('retains each low mesh bind transform even when its order differs from high meshes',()=>{
  const a=fixture(),b=fixture();
  for(const [gltf,scales] of [[a,[1,2]],[b,[2,1]]] as const){
   const body=gltf.scene.getObjectByName('Body') as THREE.SkinnedMesh;
   body.bind(body.skeleton,new THREE.Matrix4().makeScale(scales[0],1,1));
   const second=new THREE.SkinnedMesh(body.geometry,body.material);second.name='Second';second.bind(body.skeleton,new THREE.Matrix4().makeScale(scales[1],1,1));body.parent!.add(second);
  }
  const shared=new ModelInstance(a,entry,0,false,b),reference=new ModelInstance(b,entry);
  expect(mesh(shared,0).skeleton).toBe(mesh(shared,1).skeleton);
  shared.animate('walk',.4);reference.animate('walk',.4);shared.setDetailPixels(20);
  shared.root.updateMatrixWorld(true);reference.root.updateMatrixWorld(true);
  for(const name of ['Body','Second']){
   const actual=shared.root.children[1].getObjectByName(name) as THREE.SkinnedMesh,expected=reference.root.children[0].getObjectByName(name) as THREE.SkinnedMesh;
   expect(actual.bindMatrix.equals(expected.bindMatrix)).toBe(true);
   for(let i=0;i<3;i++)expect(actual.getVertexPosition(i,new THREE.Vector3()).distanceTo(expected.getVertexPosition(i,new THREE.Vector3()))).toBeLessThan(1e-9);
  }
  shared.dispose();reference.dispose();
 });
});
