import * as THREE from 'three';
import type { GameEngineActorRig } from './skin-rig';

/** Bake a caller-owned, solved rifle assembly before cloning rig.model as rest.
 * Never use the original stance closure or replay its commands on the new rest.
 * Only the non-Bone weapon is reparented; source assets remain caller-owned.
 */
export function mountRifleToChest(rig: GameEngineActorRig, weaponRoot: THREE.Group) {
  const chest = rig.bones.get('spine_03');
  if (!chest || weaponRoot.parent !== rig.actor) throw new Error('Rifle must be an owned actor child');
  const validateTransform = (node: THREE.Object3D) => {
    const { x, y, z } = node.scale;
    if (!node.matrixAutoUpdate || ![...node.position.toArray(), ...node.quaternion.toArray(), x, y, z].every(Number.isFinite) ||
        x <= 0 || Math.abs(x - y) > 1e-6 || Math.abs(x - z) > 1e-6 || Math.abs(node.quaternion.lengthSq() - 1) > 1e-4) {
      throw new Error('Rifle rest requires finite uniform TRS transforms');
    }
  };
  for (let node: THREE.Object3D | null = chest; node; node = node.parent) validateTransform(node);
  weaponRoot.traverse(node => {
    if (node instanceof THREE.Bone || node instanceof THREE.SkinnedMesh) throw new Error('Rifle rest requires an unskinned weapon');
    validateTransform(node);
  });
  chest.updateWorldMatrix(true, false); weaponRoot.updateWorldMatrix(true, false);
  const local = chest.matrixWorld.clone().invert().multiply(weaponRoot.matrixWorld);
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  local.decompose(position, rotation, scale);
  const recomposed = new THREE.Matrix4().compose(position, rotation, scale);
  if (!local.elements.every(Number.isFinite) || scale.x <= 0 || Math.abs(scale.x - scale.y) > 1e-6 || Math.abs(scale.x - scale.z) > 1e-6 ||
      local.elements.some((value, i) => Math.abs(value - recomposed.elements[i]) > 1e-6)) {
    throw new Error('Rifle rest attachment cannot preserve the transform');
  }
  chest.add(weaponRoot);
  weaponRoot.position.copy(position); weaponRoot.quaternion.copy(rotation); weaponRoot.scale.copy(scale);
  weaponRoot.updateMatrix(); weaponRoot.updateWorldMatrix(false, true);
}
