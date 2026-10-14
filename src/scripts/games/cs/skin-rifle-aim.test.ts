import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { createSkinRifleAim } from './skin-rifle-aim';

function setup(yaw=0,clearance=0) {
  const actor=new T.Group(),visual=new T.Group(),chest=new T.Bone(),weapon=new T.Group(),bones=new Map<string,T.Bone>();
  actor.rotation.y=yaw;visual.rotation.y=Math.PI;actor.add(visual);visual.add(chest);chest.position.y=1.25;chest.rotation.set(.03,.06,-.04);
  chest.name='spine_03';bones.set(chest.name,chest);weapon.name='held-weapon';weapon.position.set(.12,-.15,.3);weapon.rotation.y=Math.PI;weapon.scale.setScalar(.82);chest.add(weapon);
  const bone=(name:string,parent:T.Object3D,position:number[])=>{const b=new T.Bone();b.name=name;b.position.fromArray(position);parent.add(b);bones.set(name,b);return b;};
  for(const [side,x] of [['l',.2],['r',-.2]] as const){
    const clavicle=bone(`clavicle_${side}`,chest,[x,0,0]),upper=bone(`upperarm_${side}`,clavicle,[0,0,0]);
    const lower=bone(`lowerarm_${side}`,upper,[0,-.28,0]),hand=bone(`hand_${side}`,lower,[0,-.26,0]);
    upper.rotation.x=.8;lower.rotation.x=.7;hand.rotation.z=.15;
  }
  const neck=bone('neck_01',chest,[0,.2,0]),head=bone('head',neck,[0,.1,0]),foot=bone('foot_l',visual,[.1,0,0]);
  actor.updateMatrixWorld(true);const rig={actor,bones},aim=createSkinRifleAim(rig,weapon,{forwardClearance:clearance});
  return {actor,visual,chest,weapon,bones,head,foot,aim};
}
const worldQ=(o:T.Object3D)=>o.getWorldQuaternion(new T.Quaternion()).normalize();
const snapshot=(s:ReturnType<typeof setup>)=>[...s.bones.values(),s.weapon].map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]);
function grip(s:ReturnType<typeof setup>,side:string){const hand=s.bones.get(`hand_${side}`)!;return {position:s.weapon.worldToLocal(hand.getWorldPosition(new T.Vector3())),rotation:worldQ(s.weapon).invert().multiply(worldQ(hand)).normalize()};}

describe('shoulder pivot rifle aim',()=>{
  it('aims the weapon in actor space while maintaining both grips at nonzero yaw and scale',()=>{
    for(const yaw of [0,Math.PI/2,-1.8])for(const pitch of [-1.45,-.4,.6,1.54]){
      const s=setup(yaw),before=worldQ(s.weapon),hands=['l','r'].map(side=>grip(s,side));
      s.actor.scale.setScalar(1.3);s.actor.updateMatrixWorld(true);const foot=s.foot.getWorldPosition(new T.Vector3());
      const pivot=s.bones.get('upperarm_l')!.getWorldPosition(new T.Vector3()).add(s.bones.get('upperarm_r')!.getWorldPosition(new T.Vector3())).multiplyScalar(.5);
      const delta=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0).applyQuaternion(worldQ(s.actor)),pitch),expectedPosition=s.weapon.getWorldPosition(new T.Vector3()).sub(pivot).applyQuaternion(delta).add(pivot);
      const expected=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0).applyQuaternion(worldQ(s.actor)),pitch).multiply(before).normalize();
      expect(s.aim.apply(pitch)).toBe(true);s.actor.updateMatrixWorld(true);
      expect(worldQ(s.weapon).angleTo(expected)).toBeLessThan(1e-6);expect(s.foot.getWorldPosition(new T.Vector3()).distanceTo(foot)).toBeLessThan(1e-12);
      expect(s.weapon.getWorldPosition(new T.Vector3()).distanceTo(expectedPosition)).toBeLessThan(1e-7);
      for(const [i,side] of ['l','r'].entries()){const after=grip(s,side);expect(after.position.distanceTo(hands[i].position)).toBeLessThan(1e-7);expect(after.rotation.angleTo(hands[i].rotation)).toBeLessThan(1e-6);}
    }
  });
  it('is repeatable through different aim angles and restores the captured pose exactly',()=>{
    const s=setup(),original=snapshot(s);expect(s.aim.apply(.7)).toBe(true);const aimed=snapshot(s);
    for(let i=0;i<20;i++){expect(s.aim.apply(-.5)).toBe(true);expect(s.aim.apply(.7)).toBe(true);}
    const repeated=snapshot(s);expect(Math.max(...aimed.flat().map((v,i)=>Math.abs(v-repeated.flat()[i])))).toBeLessThan(1e-10);
    s.aim.restore();expect(snapshot(s)).toEqual(original);s.aim.restore();expect(snapshot(s)).toEqual(original);
  });
  it('refuses an unreachable hand atomically, including when the other hand is reachable',()=>{
    const s=setup();expect(s.aim.apply(.3)).toBe(true);s.bones.get('clavicle_l')!.position.x+=3;s.actor.updateMatrixWorld(true);const before=snapshot(s);
    expect(s.aim.apply(.5)).toBe(false);expect(snapshot(s)).toEqual(before);
  });
  it('limits head following and does not alter another actor or local bone lengths',()=>{
    const s=setup(),other=setup(),head=worldQ(s.head),untouched=snapshot(other),locals=[...s.bones.values()].map(b=>[b.parent,...b.position.toArray(),...b.scale.toArray()]);
    expect(s.aim.apply(1.54)).toBe(true);
    expect(worldQ(s.head).angleTo(head)).toBeCloseTo(.65,6);expect(snapshot(other)).toEqual(untouched);
    expect([...s.bones.values()].map(b=>[b.parent,...b.position.toArray(),...b.scale.toArray()])).toEqual(locals);
  });
  it('rejects nonfinite pitch before altering an existing accepted pose',()=>{
    const s=setup();s.aim.apply(.3);const before=snapshot(s);expect(()=>s.aim.apply(NaN)).toThrow();expect(snapshot(s)).toEqual(before);
  });
  it('keeps the bore basis independent of new chest sway while following a changed actor yaw',()=>{
    const s=setup(),weaponBasis=worldQ(s.weapon),hands=['l','r'].map(side=>grip(s,side)),clavicles=['l','r'].map(side=>s.bones.get(`clavicle_${side}`)!.quaternion.toArray());
    s.aim.apply(.3);s.aim.restore();s.actor.rotation.y=1.4;s.chest.rotation.set(-.08,.12,.02);s.actor.updateMatrixWorld(true);
    const desired=worldQ(s.actor).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.4)).multiply(weaponBasis).normalize();
    expect(s.aim.apply(.4)).toBe(true);expect(worldQ(s.weapon).angleTo(desired)).toBeLessThan(1e-6);
    for(const [i,side] of ['l','r'].entries()){expect(grip(s,side).position.distanceTo(hands[i].position)).toBeLessThan(1e-7);expect(s.bones.get(`clavicle_${side}`)!.quaternion.toArray()).toEqual(clavicles[i]);}
  });
  it('moves the rifle forward smoothly for body clearance without changing its bore',()=>{
    const base=setup(.8),clear=setup(.8,.08);base.aim.apply(.3);clear.aim.apply(.3);
    const movement=clear.weapon.getWorldPosition(new T.Vector3()).sub(base.weapon.getWorldPosition(new T.Vector3()));
    const expected=new T.Vector3(0,0,-.08*(1-Math.cos(.3))).applyQuaternion(worldQ(clear.actor));
    expect(movement.distanceTo(expected)).toBeLessThan(1e-8);expect(worldQ(clear.weapon).angleTo(worldQ(base.weapon))).toBeLessThan(1e-6);
  });
  it('keeps elbow bending toward the calibrated shoulder-frame pole through the full pitch range',()=>{
    const s=setup(),poles=['l','r'].map(side=>{const root=s.bones.get(`upperarm_${side}`)!.getWorldPosition(new T.Vector3()),elbow=s.bones.get(`lowerarm_${side}`)!.getWorldPosition(new T.Vector3()),hand=s.bones.get(`hand_${side}`)!.getWorldPosition(new T.Vector3()),axis=hand.sub(root).normalize(),bend=elbow.clone().sub(root);bend.addScaledVector(axis,-bend.dot(axis)).normalize();return elbow.addScaledVector(bend,.35);});
    for(const pitch of [-1.45,-.6,0,.6,1.54]){
      expect(s.aim.apply(pitch)).toBe(true);
      for(const [i,side] of ['l','r'].entries()){
        const root=s.bones.get(`upperarm_${side}`)!.getWorldPosition(new T.Vector3()),axis=s.bones.get(`hand_${side}`)!.getWorldPosition(new T.Vector3()).sub(root).normalize();
        const actual=s.bones.get(`lowerarm_${side}`)!.getWorldPosition(new T.Vector3()).sub(root),desired=poles[i].clone().sub(root);
        actual.addScaledVector(axis,-actual.dot(axis)).normalize();desired.addScaledVector(axis,-desired.dot(axis)).normalize();expect(actual.dot(desired)).toBeGreaterThan(.999999);
      }
    }
  });
});
