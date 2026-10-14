import * as THREE from 'three';

export interface RotationPair { source: THREE.Bone; target: THREE.Bone }

/** Transfers model-frame rest deltas, not raw local animation quaternions.
 * Both hierarchies must be in their intended rest poses at construction.
 * Frames declare the same forward/up basis. Only paired rotations are written;
 * callers compose/reset other channels first. No root motion or contact solve.
 */
export function createRotationRetarget(sourceFrame: THREE.Object3D, targetFrame: THREE.Object3D, pairs: readonly RotationPair[]) {
  if (!pairs.length) throw new Error('Rotation retarget requires bone pairs');
  const targets = new Set(pairs.map(p => p.target)), sources = new Set(pairs.map(p => p.source));
  if (targets.size !== pairs.length || sources.size !== pairs.length) throw new Error('Duplicate rotation retarget bone');
  const parents = new Map<THREE.Object3D, THREE.Object3D | null>();
  function collect(node: THREE.Object3D, frame: THREE.Object3D) {
    let current: THREE.Object3D | null = node;
    while (current && current !== frame) { parents.set(current, current.parent); current = current.parent; }
    if (current !== frame || node === frame) throw new Error('Retarget bone outside declared frame hierarchy');
  }
  for (const pair of pairs) {
    collect(pair.source, sourceFrame); collect(pair.target, targetFrame);
    if (!targets.has(pair.target.parent as THREE.Bone)) {
      for (let parent = pair.target.parent; parent && parent !== targetFrame; parent = parent.parent) {
        if (targets.has(parent as THREE.Bone)) throw new Error('Unmapped gap in target rotation hierarchy');
      }
    }
  }
  const validate = () => {
    for (const [node, parent] of parents) if (node.parent !== parent) throw new Error('Retarget parent hierarchy changed');
    const nodes = new Set([...parents.keys(), sourceFrame, targetFrame]);
    for (const frame of [sourceFrame, targetFrame]) for (let n = frame.parent; n; n = n.parent) nodes.add(n);
    for (const node of nodes) {
      const { x, y, z } = node.scale;
      if (!node.matrixAutoUpdate || ![...node.position.toArray(), ...node.quaternion.toArray(), x, y, z].every(Number.isFinite) ||
          x <= 0 || Math.abs(x - y) > 1e-6 || Math.abs(x - z) > 1e-6 || Math.abs(node.quaternion.lengthSq() - 1) > 1e-4) {
        throw new Error('Invalid rotation retarget transform');
      }
    }
  };
  validate(); sourceFrame.updateWorldMatrix(true, true); targetFrame.updateWorldMatrix(true, true);
  const sourceInverse = sourceFrame.getWorldQuaternion(new THREE.Quaternion()).normalize().invert();
  const targetInverse = targetFrame.getWorldQuaternion(new THREE.Quaternion()).normalize().invert();
  const records = pairs.map(pair => ({ ...pair,
    sourceRestInverse: sourceInverse.clone().multiply(pair.source.getWorldQuaternion(new THREE.Quaternion()).normalize()).invert(),
    targetRest: targetInverse.clone().multiply(pair.target.getWorldQuaternion(new THREE.Quaternion()).normalize()),
    desired: new THREE.Quaternion(), local: new THREE.Quaternion(),
  }));
  const byTarget = new Map(records.map(record => [record.target, record]));
  const parentRotation = new THREE.Quaternion();
  return { apply() {
    validate(); sourceFrame.updateWorldMatrix(true, true); targetFrame.updateWorldMatrix(true, true);
    sourceFrame.getWorldQuaternion(sourceInverse).normalize().invert();
    targetFrame.getWorldQuaternion(targetInverse).normalize().invert();
    // Prepare every result before writing any target bone, including reversed pair order.
    for (const r of records) {
      r.source.getWorldQuaternion(r.desired).normalize();
      r.desired.premultiply(sourceInverse).multiply(r.sourceRestInverse).multiply(r.targetRest).normalize();
    }
    for (const r of records) {
      const mappedParent = byTarget.get(r.target.parent as THREE.Bone);
      if (mappedParent) parentRotation.copy(mappedParent.desired);
      else r.target.parent!.getWorldQuaternion(parentRotation).normalize().premultiply(targetInverse);
      r.local.copy(parentRotation).invert().multiply(r.desired).normalize();
      if (!r.local.toArray().every(Number.isFinite)) throw new Error('Invalid transferred rotation');
    }
    for (const r of records) r.target.quaternion.copy(r.local);
    targetFrame.updateWorldMatrix(true, true);
  } };
}
