import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {createTacticalActor} from './tactical-actor';
import {createMatch,type WeaponId} from './engine';
import {compileSkinMotion} from './skin-motion';

function fixture(){
 const source=new T.Group(),bones=new Map<string,T.Bone>();
 const add=(name:string,parent:T.Object3D)=>{const b=new T.Bone();b.name=name;parent.add(b);bones.set(name,b);return b;};
 const root=add('Root',source),pelvis=add('pelvis',root),a=add('spine_01',pelvis),b=add('spine_02',a),chest=add('spine_03',b);
 chest.position.y=1.2;add('head',add('neck_01',chest));
 for(const side of ['l','r'])add('hand_'+side,add('lowerarm_'+side,add('upperarm_'+side,chest)));
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
 geo.setAttribute('skinIndex',new T.Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0],4));geo.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
 const mat=new T.MeshStandardMaterial();mat.name='team_color';const skin=new T.SkinnedMesh(geo,mat);source.add(skin);source.updateMatrixWorld(true);skin.bind(new T.Skeleton([...bones.values()]));
 const weapons=new Map<WeaponId,T.Group>();for(const [i,name] of (['pistol','smg','rifle','sniper'] as WeaponId[]).entries()){const w=new T.Group(),hands=new T.Group(),receiver=new T.Object3D(),muzzle=new T.Object3D();hands.name='view_hands';receiver.name='receiver';receiver.position.set(.02,.1,.1*i);receiver.rotation.y=i*.1;muzzle.name='muzzle';muzzle.position.set(0,.1,-.2-i*.2);w.add(hands,receiver,muzzle);weapons.set(name,w);}
 const frames=Array.from({length:5},()=>({offset:[0,0,0],rotations:[[0,0,0,1]]}));
 const motion=compileSkinMotion({schema:'cs-cmu-target-cycles-v1',bones:['pelvis'],clips:[{name:'walk',duration:1,distance:1,frames},{name:'run',duration:1,distance:2,frames}]});
 return {source,weapons,motion,skin,mat};
}
describe('production tactical character',()=>{
 it('rejects an incomplete shoulder/head rig before creating a partially posed actor',()=>{
  const f=fixture();f.source.getObjectByName('neck_01')!.name='missing_neck';
  expect(()=>createTacticalActor(f.source,f.weapons,f.motion)).toThrow('Tactical character missing neck_01');
 });
 it('restores both arms and head when switching from a shouldered rifle back to a pistol',()=>{
  const f=fixture(),fresh=createTacticalActor(f.source,f.weapons,f.motion),switched=createTacticalActor(f.source,f.weapons,f.motion),m=createMatch('attack'),p=m.actors[1];m.phase='live';p.weapon='pistol';fresh.update(p,m,0);
  p.weapon='rifle';switched.update(p,m,0);
  expect(switched.model.getObjectByName('neck_01')!.quaternion.angleTo(fresh.model.getObjectByName('neck_01')!.quaternion)).toBeGreaterThan(.1);
  p.weapon='pistol';switched.update(p,m,0);
  for(const name of ['upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r','neck_01','head'])expect(switched.model.getObjectByName(name)!.quaternion.angleTo(fresh.model.getObjectByName(name)!.quaternion)).toBeLessThan(1e-7);
 });
 it('keeps authored chest-local weapon sockets identical when switching during a hit',()=>{
  const f=fixture(),c=createTacticalActor(f.source,f.weapons,f.motion),m=createMatch('attack'),p=m.actors[1];m.phase='live';p.weapon='pistol';c.update(p,m,0);
  const gun=()=>c.model.getObjectByName('held-weapon')!;gun().updateMatrix();const base=gun().matrix.clone();
  p.weapon='rifle';m.time+=.02;c.update(p,m,1);p.weapon='pistol';m.time+=.02;c.update(p,m,1);gun().updateMatrix();
  gun().matrix.elements.forEach((v,i)=>expect(v).toBeCloseTo(base.elements[i],10));
 });
 it('keeps all four weapons on the skeletal actor and hides FPS hands',()=>{
  const f=fixture(),c=createTacticalActor(f.source,f.weapons,f.motion),m=createMatch('attack'),p=m.actors[1];m.phase='live';
  for(const weapon of ['rifle','pistol','smg','sniper','rifle'] as WeaponId[]){p.weapon=weapon;c.update(p,m,0);expect(c.model.userData.weapon).toBe(weapon);expect(c.model.getObjectByName('held-weapon')).toBeTruthy();expect(c.model.getObjectByName('view_hands')!.visible).toBe(false);expect(c.model.getObjectByName('hand_r')).toBeInstanceOf(T.Bone);}
  let count=0;c.model.traverse(n=>{if(n.name==='held-weapon')count++;});expect(count).toBe(1);
 });
 it('isolates pose and team materials while sharing geometry',()=>{
  const f=fixture(),a=createTacticalActor(f.source,f.weapons,f.motion),b=createTacticalActor(f.source,f.weapons,f.motion),m=createMatch('attack');m.phase='live';
  const p=m.actors[1];p.team='attack';p.pitch=.4;a.update(p,m,1);p.team='defend';p.pitch=0;b.update(p,m,0);
  let am:T.SkinnedMesh|undefined,bm:T.SkinnedMesh|undefined;a.model.traverse(n=>{if(n instanceof T.SkinnedMesh)am=n;});b.model.traverse(n=>{if(n instanceof T.SkinnedMesh)bm=n;});
  expect(am!.geometry).toBe(bm!.geometry);expect(am!.material).not.toBe(bm!.material);expect(am!.skeleton).not.toBe(bm!.skeleton);
  expect((am!.material as T.MeshStandardMaterial).color.equals((bm!.material as T.MeshStandardMaterial).color)).toBe(false);
  expect(f.mat.color.getHex()).toBe(0xffffff);expect(a.model.getObjectByName('spine_03')!.quaternion.angleTo(b.model.getObjectByName('spine_03')!.quaternion)).toBeGreaterThan(.1);
 });
 it('restores aim on buy/round reset without accumulating rotations or moving the actor origin',()=>{
  const f=fixture(),c=createTacticalActor(f.source,f.weapons,f.motion),m=createMatch('attack'),p=m.actors[1];m.phase='live';p.pitch=.3;
  c.model.position.set(4,0,7);c.update(p,m,0);const q=c.model.getObjectByName('spine_03')!.quaternion.clone();
  for(let i=0;i<100;i++)c.update(p,m,0);expect(c.model.getObjectByName('spine_03')!.quaternion.angleTo(q)).toBeLessThan(1e-7);
  m.phase='buy';m.round++;c.update(p,m,0);expect(c.model.getObjectByName('spine_03')!.quaternion.angleTo(new T.Quaternion())).toBeLessThan(1e-7);
  expect(c.model.position.toArray()).toEqual([4,0,7]);
 });
 it('lowers the gun for a held grenade, raises the throwing arm while priming and restores it exactly',()=>{
  const f=fixture(),c=createTacticalActor(f.source,f.weapons,f.motion),m=createMatch('attack'),p=m.actors[1];m.phase='live';m.time=5;p.weapon='rifle';
  c.update(p,m,0);const arm=()=>c.model.getObjectByName('upperarm_r')!.quaternion.clone(),rest=arm(),left=c.model.getObjectByName('upperarm_l')!.quaternion.clone();
  p.grenades.he=1;p.held='he';p.heldAt=4.5;c.update(p,m,0);
  expect(c.model.getObjectByName('held-weapon')!.visible).toBe(false);
  p.primedAt=4.7;c.update(p,m,0);
  expect(arm().angleTo(rest)).toBeGreaterThan(.5);
  expect(c.model.getObjectByName('upperarm_l')!.quaternion.angleTo(left)).toBeLessThan(1e-7);
  p.primedAt=-1;p.thrownAt=5;m.time=5.1;c.update(p,m,0);expect(arm().angleTo(rest)).toBeGreaterThan(.3);
  p.held='gun';p.heldAt=5.5;m.time=6;for(let i=0;i<5;i++)c.update(p,m,0);
  expect(arm().angleTo(rest)).toBeLessThan(1e-7);expect(c.model.getObjectByName('held-weapon')!.visible).toBe(true);
 });
});
