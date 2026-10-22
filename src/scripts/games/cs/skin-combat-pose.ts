import * as THREE from 'three';
import type { Actor, Match } from './engine';
import { createSkinMotion, type compileSkinMotion } from './skin-motion';

/** Bounded actor-space hit delta, distributed over the three spine joints.
 * Restore BEFORE the next locomotion update, including updates that pause or
 * reset. The legs are sibling branches; weapon and hands remain chest children.
 * No world-matrix traversal, skin scan or IK is needed; scratch math is reused.
 */
export function createSkinCombatPose(rig: { actor: THREE.Group; bones: ReadonlyMap<string, THREE.Bone> }) {
  const parents = new Map<THREE.Object3D, THREE.Object3D | null>();
  const joints = ['spine_01', 'spine_02', 'spine_03'].map((name, i) => {
    const bone = rig.bones.get(name);
    if (!bone) throw new Error('Missing combat spine');
    const path: THREE.Object3D[] = [];
    let node = bone.parent;
    parents.set(bone, bone.parent);
    while (node && node !== rig.actor) { path.unshift(node); parents.set(node, node.parent); node = node.parent; }
    if (!node) throw new Error('Combat spine outside actor');
    return { bone, path, weight: [.2, .3, .5][i], base: bone.quaternion.clone() };
  });
  if (joints[1].bone.parent !== joints[0].bone || joints[2].bone.parent !== joints[1].bone) throw new Error('Invalid combat spine hierarchy');
  const total = new THREE.Quaternion(), part = new THREE.Quaternion(), parent = new THREE.Quaternion();
  const local = new THREE.Quaternion(), euler = new THREE.Euler(0,0,0,'XYZ');
  let applied = false;
  function restore() {
    if (!applied) return;
    for (const joint of joints) joint.bone.quaternion.copy(joint.base);
    applied = false;
  }
  return { restore, apply(flinch: number) {
    if (!Number.isFinite(flinch)) throw new Error('Invalid combat pose input');
    for (const [node, expected] of parents) if (node.parent !== expected) throw new Error('Combat spine hierarchy changed');
    restore();
    const impact = THREE.MathUtils.clamp(flinch,0,1);
    if (impact === 0) return;
    total.setFromEuler(euler.set(impact * .10,0,impact * .035));
    const sine = Math.hypot(total.x,total.y,total.z), halfAngle = Math.atan2(sine,total.w);
    for (const joint of joints) {
      joint.base.copy(joint.bone.quaternion);
      parent.identity(); for (const node of joint.path) parent.multiply(node.quaternion); parent.normalize();
      // Quaternion.slerp uses normalized linear interpolation for small angles.
      // Exact powers retain the declared total even in this subtle hit range.
      const halfPart = halfAngle * joint.weight, ratio = sine > 1e-14 ? Math.sin(halfPart) / sine : joint.weight;
      part.set(total.x * ratio,total.y * ratio,total.z * ratio,Math.cos(halfPart));
      // Convert the common actor-frame delta to this joint's current parent
      // frame. Fractions of one rotation commute, so the chest gets total once.
      local.copy(parent).invert().multiply(part).multiply(parent);
      joint.bone.quaternion.premultiply(local).normalize();
    }
    applied = true;
  } };
}

/** Accepted hit-only composition. Full spine-based aim failed visual review;
 * aiming must instead get a separate shoulder/arm solution. One owner keeps
 * base/additive ordering correct through every locomotion early return. */
export function createSkinCombatMotion(rig: { actor: THREE.Group; visual: THREE.Group; bones: ReadonlyMap<string, THREE.Bone> }, data: ReturnType<typeof compileSkinMotion>) {
  const motion = createSkinMotion(rig,data), combat = createSkinCombatPose(rig);
  return { state: motion.state, update(actor: Actor, match: Match, flinch = 0) {
    if (!Number.isFinite(flinch)) throw new Error('Invalid combat pose input');
    combat.restore();
    motion.update(actor,match);
    const active = match.phase === 'live' && actor.hp > 0;
    combat.apply(active ? flinch : 0);
  } };
}
