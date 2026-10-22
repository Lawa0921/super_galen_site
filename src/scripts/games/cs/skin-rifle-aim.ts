import * as THREE from 'three';
import { TwoBoneIK } from './two-bone-ik';
import { TwoSphereReach } from './two-sphere-reach';

export function createSkinRifleAim(rig: { actor: THREE.Group; bones: ReadonlyMap<string,THREE.Bone> }, weapon: THREE.Group, options: {forwardClearance?:number} = {}) {
  const forwardClearance = options.forwardClearance ?? 0;
  if (!Number.isFinite(forwardClearance) || forwardClearance<0 || forwardClearance>.3) throw new Error('Invalid authored rifle clearance');
  const bone = (name: string) => {
    const value = rig.bones.get(name);
    if (!value) throw new Error(`Rifle aim missing bone: ${name}`);
    return value;
  };
  const chest = bone('spine_03'), neck = bone('neck_01'), head = bone('head');
  const chains = ['l', 'r'].map(side => ({
    side, upper: bone(`upperarm_${side}`), lower: bone(`lowerarm_${side}`), hand: bone(`hand_${side}`),
  }));
  if (weapon.parent !== chest || neck.parent !== chest || head.parent !== neck) throw new Error('Rifle aim requires the frozen chest weapon and connected neck');
  const owned = [...chains.flatMap(c => [c.upper, c.lower, c.hand]), neck, head];
  const parents = owned.map(b => b.parent), rest = owned.map(b => b.quaternion.clone()), entry = owned.map(() => new THREE.Quaternion());
  const weaponPosition = weapon.position.clone(), weaponRotation = weapon.quaternion.clone();
  const weaponMatrix = new THREE.Matrix4().compose(weaponPosition, weaponRotation, weapon.scale);
  const entryPosition = new THREE.Vector3(), entryRotation = new THREE.Quaternion();
  const point = new THREE.Vector3(), elbow = new THREE.Vector3(), axis = new THREE.Vector3(), bend = new THREE.Vector3();
  const inverseWeapon = new THREE.Matrix4(), weaponWorldRotation = new THREE.Quaternion();
  rig.actor.updateMatrixWorld(true);
  inverseWeapon.copy(weapon.matrixWorld).invert();
  weapon.getWorldQuaternion(weaponWorldRotation).normalize().invert();
  const restActorRotation = rig.actor.getWorldQuaternion(new THREE.Quaternion()).normalize().invert().multiply(weaponWorldRotation.clone().invert()).normalize();
  // Construct/validate both chains before adding any nonrendering wrist mounts.
  const solvers = chains.map(c => new TwoBoneIK(c.upper, c.lower, c.hand));
  const arms = chains.map((c, i) => {
    const handPoint = c.hand.getWorldPosition(new THREE.Vector3());
    const handRotation = c.hand.getWorldQuaternion(new THREE.Quaternion()).normalize().premultiply(weaponWorldRotation).normalize();
    c.upper.getWorldPosition(point); c.lower.getWorldPosition(elbow);
    axis.copy(handPoint).sub(point).normalize();
    bend.copy(elbow).sub(point); bend.addScaledVector(axis, -bend.dot(axis)).normalize();
    // Elbows follow the calibrated shoulder frame, not the rotating rifle.
    // Rotating this pole with a downward rifle lifts the elbow behind the back.
    const pole = c.upper.parent!.worldToLocal(elbow.clone().addScaledVector(bend, .35));
    const mount = new THREE.Object3D(); mount.name = `aim-wrist-${c.side}`; c.hand.add(mount);
    return { ...c, solver: solvers[i], mount, handPoint: handPoint.applyMatrix4(inverseWeapon), handRotation, pole,
      target: new THREE.Vector3(), targetRotation: new THREE.Quaternion(), targetPole: new THREE.Vector3(), center: new THREE.Vector3(), radius: 0 };
  });
  const pivot = new THREE.Vector3(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const actorRotation = new THREE.Quaternion(), rotation = new THREE.Quaternion(), delta = new THREE.Quaternion(), parentRotation = new THREE.Quaternion(), inverseParentRotation = new THREE.Quaternion();
  const matrix = new THREE.Matrix4(), localMatrix = new THREE.Matrix4(), localPosition = new THREE.Vector3(), localRotation = new THREE.Quaternion();
  const reach = new TwoSphereReach(), correctedPosition = new THREE.Vector3(), nominalPosition = new THREE.Vector3(), actorScale = new THREE.Vector3();
  const state = { translationM: 0, translationActor: [0,0,0] };
  function restore() {
    owned.forEach((b, i) => b.quaternion.copy(rest[i]));
    weapon.position.copy(weaponPosition); weapon.quaternion.copy(weaponRotation);
  }
  function rollback() {
    owned.forEach((b, i) => b.quaternion.copy(entry[i]));
    weapon.position.copy(entryPosition); weapon.quaternion.copy(entryRotation);
  }
  return { restore, state, apply(pitch: number) {
    if (!Number.isFinite(pitch)) throw new Error('Rifle aim requires finite pitch');
    if (weapon.parent !== chest || owned.some((b, i) => b.parent !== parents[i])) throw new Error('Rifle aim hierarchy changed');
    rig.actor.updateMatrixWorld(true);
    // Reconstruct the un-aimed weapon from its rest transform and today's gait/hit chest.
    matrix.multiplyMatrices(chest.matrixWorld, weaponMatrix).decompose(position, rotation, scale);
    pivot.copy(arms[0].upper.getWorldPosition(point)); pivot.add(arms[1].upper.getWorldPosition(point)).multiplyScalar(.5);
    rig.actor.getWorldQuaternion(actorRotation).normalize(); rig.actor.getWorldScale(actorScale);
    // Hold the authored actor-relative bore basis even when gait/hit tilts the chest.
    delta.copy(rotation).invert();
    rotation.copy(actorRotation).multiply(parentRotation.setFromAxisAngle(axis.set(1,0,0),pitch)).multiply(restActorRotation).normalize();
    delta.premultiply(rotation);axis.set(1,0,0).applyQuaternion(actorRotation);
    position.sub(pivot).applyQuaternion(delta).add(pivot); nominalPosition.copy(position);
    point.set(0,0,-forwardClearance*(1-Math.cos(pitch))*actorScale.x).applyQuaternion(actorRotation);position.add(point);
    for (const arm of arms) {
      arm.upper.getWorldPosition(point);arm.lower.getWorldPosition(elbow);
      const upperLength=point.distanceTo(elbow),lowerLength=elbow.distanceTo(arm.hand.getWorldPosition(bend));
      // Keep at least 20 degrees of elbow bend, away from a locked straight arm.
      arm.radius=Math.sqrt(upperLength**2+lowerLength**2+2*upperLength*lowerLength*Math.cos(Math.PI/9));
      arm.center.copy(arm.handPoint).multiply(scale).applyQuaternion(rotation).negate().add(point);
    }
    if (!reach.project(position,arms[0].center,arms[0].radius,arms[1].center,arms[1].radius,correctedPosition) ||
        correctedPosition.distanceTo(position)>.18*actorScale.x || correctedPosition.distanceTo(nominalPosition)>.30*actorScale.x) return false;
    position.copy(correctedPosition);
    matrix.compose(position, rotation, scale);
    for (const arm of arms) {
      arm.target.copy(arm.handPoint).applyMatrix4(matrix);
      arm.targetRotation.copy(arm.handRotation).premultiply(rotation).normalize();
      arm.targetPole.copy(arm.pole).applyMatrix4(arm.upper.parent!.matrixWorld);
      if (!arm.solver.canSolveMount(arm.mount, arm.target, arm.targetPole, arm.targetRotation)) return false;
    }
    // The preflight above never writes local transforms. Commit both hands together.
    owned.forEach((b, i) => entry[i].copy(b.quaternion)); entryPosition.copy(weapon.position); entryRotation.copy(weapon.quaternion);
    try {
      restore();
      localMatrix.copy(chest.matrixWorld).invert().multiply(matrix).decompose(localPosition, localRotation, scale);
      weapon.position.copy(localPosition); weapon.quaternion.copy(localRotation).normalize();
      for (const arm of arms) {
        if (!arm.solver.solveMount(arm.mount, arm.target, arm.targetPole, arm.targetRotation)) throw new Error('Rifle aim reach changed after preflight');
      }
      const follow = THREE.MathUtils.clamp(pitch, -.65, .65);
      for (const [index, fraction] of [[6, .6], [7, .4]]) {
        const joint = owned[index];
        joint.parent!.getWorldQuaternion(parentRotation).normalize();
        delta.setFromAxisAngle(axis, follow * fraction);
        delta.premultiply(inverseParentRotation.copy(parentRotation).invert()).multiply(parentRotation);
        joint.quaternion.copy(rest[index]).premultiply(delta).normalize();
        joint.updateWorldMatrix(false, true);
      }
    } catch (error) { rollback(); throw error; }
    point.copy(correctedPosition).sub(nominalPosition).applyQuaternion(inverseParentRotation.copy(actorRotation).invert()).divideScalar(actorScale.x);
    state.translationM=point.length();point.toArray(state.translationActor);
    return true;
  } };
}
