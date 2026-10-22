import * as T from 'three';
import { TwoBoneIK } from './two-bone-ik';

// Procedural crouch layered on top of the baked gait (there is no crouch clip).
// The hips sink and sit back, the torso leans forward with the lean cancelled
// at the chest (the weapon is chest-mounted, so aim is unchanged), and a two-
// bone IK per leg returns each foot to its exact gait position/orientation.
// Feet therefore keep the accepted gait contact: no sinking, floating or slide.
export const CROUCH_PELVIS_DROP = .34;
const PELVIS_BACK = .06, TORSO_LEAN = .28;

type Rig = { actor: T.Group; visual: T.Group; bones: ReadonlyMap<string, T.Bone> };
export function createCrouchPose(rig: Rig) {
  const bone = (name: string) => { const b = rig.bones.get(name); if (!b) throw new Error(`Crouch pose missing ${name}`); return b; };
  const legs = (['l', 'r'] as const).map(side => {
    const thigh = bone(`thigh_${side}`), calf = bone(`calf_${side}`), foot = bone(`foot_${side}`);
    return { thigh, calf, foot, solver: new TwoBoneIK(thigh, calf, foot), target: new T.Vector3(), orientation: new T.Quaternion(), pole: new T.Vector3() };
  });
  const lower = bone('spine_01'), chest = bone('spine_03');
  const posed = [...legs.flatMap(l => [l.thigh, l.calf, l.foot]), lower, chest];
  const base = posed.map(b => b.quaternion.clone()), origin = new T.Vector3();
  const actorQ = new T.Quaternion(), delta = new T.Quaternion(), parentQ = new T.Quaternion(), boneQ = new T.Quaternion();
  const forward = new T.Vector3(), axis = new T.Vector3(1, 0, 0);
  let applied = false;
  /** Rotate a bone by an actor-frame X rotation, keeping its world pivot. */
  function pitch(target: T.Bone, angle: number) {
    delta.setFromAxisAngle(axis, angle).premultiply(actorQ).multiply(boneQ.copy(actorQ).invert());
    target.parent!.getWorldQuaternion(parentQ); target.getWorldQuaternion(boneQ);
    target.quaternion.copy(parentQ.invert().multiply(delta).multiply(boneQ)).normalize();
    target.updateWorldMatrix(false, true);
  }
  function restore() {
    if (!applied) return;
    posed.forEach((b, i) => b.quaternion.copy(base[i]));
    rig.visual.position.copy(origin);
    applied = false;
  }
  return { restore, apply(amount: number) {
    restore();
    const a = Number.isFinite(amount) ? T.MathUtils.clamp(amount, 0, 1) : 0;
    if (a < 1e-4) return;
    posed.forEach((b, i) => base[i].copy(b.quaternion)); origin.copy(rig.visual.position);
    applied = true;
    rig.actor.updateMatrixWorld(true);
    for (const leg of legs) { leg.foot.getWorldPosition(leg.target); leg.foot.getWorldQuaternion(leg.orientation); }
    rig.actor.getWorldQuaternion(actorQ);
    forward.set(0, 0, -1).applyQuaternion(actorQ);
    rig.visual.position.y -= CROUCH_PELVIS_DROP * a;
    rig.visual.position.z += PELVIS_BACK * a;
    rig.actor.updateMatrixWorld(true);
    // Forward lean (top toward -Z) at the lumbar joint, cancelled at the chest.
    pitch(lower, -TORSO_LEAN * a);
    pitch(chest, TORSO_LEAN * a);
    for (const leg of legs) {
      leg.calf.getWorldPosition(leg.pole).addScaledVector(forward, .6);
      leg.solver.solve(leg.target, leg.pole, leg.orientation);
    }
  } };
}
