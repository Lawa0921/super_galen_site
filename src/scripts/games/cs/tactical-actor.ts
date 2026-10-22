import * as T from 'three';
import type {Actor,Match,WeaponId} from './engine';
import {cloneModel,disposeModelInstance} from './model-resources';
import {syncTeamColor} from './presentation';
import {compileSkinMotion,type MotionBake} from './skin-motion';
import {createSkinCombatMotion} from './skin-combat-pose';
import {createCrouchPose} from './crouch-pose';
import {createTerrainLegPose} from './terrain-leg-pose';
import motionSource from './tactical-motion.json';
import weaponPoses from './tactical-poses.json';
import {armThrow} from './utility-visuals';

let sharedMotion:ReturnType<typeof compileSkinMotion>|undefined;
/** Production asset contains its authored upper-body rest pose. Gait, crouch
 * and nearby stair contact are composed without rebuilding the mesh. */
export function createTacticalActor(source:T.Group,weapons:ReadonlyMap<WeaponId,T.Group>,motion=sharedMotion??=compileSkinMotion(motionSource as MotionBake)){
 const model=new T.Group(),visual=cloneModel(source);model.name='tactical-actor-v33';model.add(visual);
 const bones=new Map<string,T.Bone>();
 visual.traverse(n=>{
  if(n instanceof T.Bone)bones.set(n.name,n);
  if(n instanceof T.SkinnedMesh){n.boundingBox=new T.Box3(new T.Vector3(-1,-.3,-1),new T.Vector3(1,2,1));n.boundingSphere=n.boundingBox.getBoundingSphere(new T.Sphere());}
 });
 const requiredBones=new Set(['spine_01','spine_02','spine_03',...Object.values(weaponPoses).flatMap(pose=>Object.keys(pose.bones))]);
 for(const name of requiredBones)if(!bones.has(name))throw Error(`Tactical character missing ${name}`);
 const rig={actor:model,visual,bones},controller=createSkinCombatMotion(rig,motion),chest=bones.get('spine_03')!;
 // Rigs without legs (unit fixtures) skip the procedural crouch layer.
 const crouch=['thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r'].every(n=>bones.has(n))?createCrouchPose(rig):null;
 const terrain=crouch?createTerrainLegPose(rig):null;
 const base=new T.Quaternion(),parent=new T.Quaternion(),inverseParent=new T.Quaternion(),rotation=new T.Quaternion(),axis=new T.Vector3(1,0,0);
 let applied=false;
 const parentPath:T.Object3D[]=[];for(let p=chest.parent;p&&p!==model;p=p.parent)parentPath.unshift(p);
 // Grenade layer: right upper/fore arm rotate about the body's lateral axis.
 const upper=bones.get('upperarm_r')!,fore=bones.get('lowerarm_r')!,upperBase=new T.Quaternion(),foreBase=new T.Quaternion(),lateral=new T.Vector3(1,0,0);
 const inModel=new T.Quaternion(),turn=new T.Quaternion(),modelInverse=new T.Quaternion();let armApplied=false;
 function rotateInModel(bone:T.Bone,angle:number){
  model.updateWorldMatrix(true,true);modelInverse.copy(model.getWorldQuaternion(turn)).invert();
  inModel.copy(modelInverse).multiply(bone.parent!.getWorldQuaternion(turn));
  turn.setFromAxisAngle(lateral,angle).premultiply(inModel.clone().invert()).multiply(inModel);bone.quaternion.premultiply(turn).normalize();
 }
 function equip(weapon:WeaponId){
  if(model.userData.weapon===weapon)return;
  const old=model.getObjectByName('held-weapon');if(old){disposeModelInstance(old);old.removeFromParent();}
  const asset=weapons.get(weapon);if(!asset)throw Error(`Missing character weapon ${weapon}`);
  const gun=cloneModel(asset);gun.name='held-weapon';gun.traverse(n=>{if(/view_hands/i.test(n.name))n.visible=false;});
  // Fixed chest-local sockets are baked from each actual weapon's grip frame.
  // Attaching against the current animated chest would make a switch drift.
  const pose=weaponPoses[weapon];gun.position.fromArray(pose.mount.position);gun.quaternion.fromArray(pose.mount.quaternion);gun.scale.fromArray(pose.mount.scale);chest.add(gun);
  for(const [name,q] of Object.entries(pose.bones))bones.get(name)!.quaternion.fromArray(q).normalize();
  model.userData.weapon=weapon;
 }
 return {model,update(actor:Actor,match:Match,flinch:number){
  if(applied){chest.quaternion.copy(base);applied=false;}
  if(armApplied){upper.quaternion.copy(upperBase);fore.quaternion.copy(foreBase);armApplied=false;}
  terrain?.restore();crouch?.restore();
  controller.update(actor,match,flinch);
  // Layer order: gait → hit flinch → crouch → terrain → aim; restored in reverse.
  crouch?.apply(actor.hp>0?actor.crouch:0);
  terrain?.apply(actor,match);
  equip(actor.weapon);syncTeamColor(model,actor.team);
  const active=match.phase==='live'&&actor.hp>0;
  const pitch=active&&Number.isFinite(actor.pitch+actor.recoilPitch)?T.MathUtils.clamp(actor.pitch+actor.recoilPitch,-.6,.6):0;
  const grenade=actor.hp>0&&!!actor.held&&actor.held!=='gun',gun=model.getObjectByName('held-weapon');
  if(gun)gun.visible=!grenade;
  const arm=active?armThrow(actor,match.time):{raise:0,swing:0};
  if(arm.raise||arm.swing){
   upperBase.copy(upper.quaternion);foreBase.copy(fore.quaternion);armApplied=true;
   rotateInModel(upper,1.9*arm.raise-1.1*arm.swing);rotateInModel(fore,.9*arm.raise+.3*arm.swing);
  }
  if(pitch){base.copy(chest.quaternion);parent.identity();for(const p of parentPath)parent.multiply(p.quaternion);rotation.setFromAxisAngle(axis,pitch);rotation.premultiply(inverseParent.copy(parent).invert()).multiply(parent);chest.quaternion.premultiply(rotation).normalize();applied=true;}
 }};
}
