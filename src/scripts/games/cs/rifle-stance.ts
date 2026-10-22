import * as THREE from 'three';
import type { GameEngineActorRig, BoneRotation } from './skin-rig';
import { cloneModel } from './model-resources';
import { TwoBoneIK } from './two-bone-ik';

export interface RifleStanceCalibration {
  weapon: { position: number[]; rotation: number[]; scale: number };
  bodyCommands?: BoneRotation[]; fingerCommands: BoneRotation[]; clearanceM?: number;
  hands: Record<'r' | 'l', {
    palm: { mesh: string; indices: number[]; barycentric: number[]; handLocalPoint: number[]; handLocalNormal: number[] };
    long: number[]; frameNormal?: number[]; targetLong: number[];
    weapon: { point: number[]; normal: number[] }; pole: number[]; clearanceM?: number; palmRoll?: number;
  }>;
  fingerTargets?: { side: 'r' | 'l'; finger: string; vertex: number; target: number[]; direction: number[]; pole: number[] }[];
}

export function createRifleStance(rig: GameEngineActorRig, weapon: THREE.Group, calibration: RifleStanceCalibration) {
  const config = structuredClone(calibration);
  const frame = (long: number[], normal: number[]) => {
    const z = new THREE.Vector3().fromArray(normal).normalize(), y = new THREE.Vector3().fromArray(long);
    y.addScaledVector(z, -y.dot(z));
    if (!Number.isFinite(y.lengthSq() + z.lengthSq()) || y.lengthSq() < 1e-12 || z.lengthSq() < .5) throw new Error('Invalid rifle palm frame');
    y.normalize(); const x = new THREE.Vector3().crossVectors(y, z).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).normalize();
  };
  const bone = (name: string) => { const value = rig.bones.get(name); if (!value) throw new Error(`Missing rifle pose bone: ${name}`); return value; };
  const skin = (name: string) => {
    const value = rig.model.getObjectByName(name);
    if (!(value instanceof THREE.SkinnedMesh)) throw new Error('Missing rifle palm skin');
    return value;
  };
  const rigidVertex = (mesh: THREE.SkinnedMesh, vertex: number, end: THREE.Bone) => {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= mesh.geometry.attributes.position.count) throw new Error('Invalid rifle palm/tip vertex');
    let weight = 0;
    for (let j = 0; j < 4; j++) {
      const i = vertex * 4 + j, w = mesh.geometry.attributes.skinWeight.array[i];
      if (w > 0 && mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.array[i]] !== end) throw new Error('Rifle palm/tip is not rigidly end weighted');
      weight += w;
    }
    if (Math.abs(weight - 1) > 1e-6) throw new Error('Invalid rifle palm/tip weights');
  };
  rig.actor.updateMatrixWorld(true);
  const arms = (['r', 'l'] as const).map(side => {
    const data = config.hands[side], upper = bone(`upperarm_${side}`), lower = bone(`lowerarm_${side}`), wrist = bone(`hand_${side}`), mesh = skin(data.palm.mesh);
    for (const vertex of data.palm.indices) rigidVertex(mesh, vertex, wrist);
    const mount = new THREE.Object3D(); mount.name = `rifle-palm-${side}`;
    mount.position.fromArray(data.palm.handLocalPoint); mount.quaternion.copy(frame(data.long, data.frameNormal ?? data.palm.handLocalNormal));
    return { side, data, upper, lower, wrist, mesh, mount, solver: new TwoBoneIK(upper, lower, wrist),
      target: new THREE.Vector3(), pole: new THREE.Vector3(), orientation: new THREE.Quaternion(),
      surfaceNormal: new THREE.Vector3(), wantedNormal: new THREE.Vector3(), targetFrame: frame(data.targetLong, data.weapon.normal.map(v => -v)) };
  });
  const fingers = (config.fingerTargets ?? []).map(data => {
    const upper = bone(`${data.finger}_01_${data.side}`), lower = bone(`${data.finger}_02_${data.side}`), end = bone(`${data.finger}_03_${data.side}`);
    const mesh = skin(config.hands[data.side].palm.mesh); rigidVertex(mesh, data.vertex, end);
    const mount = new THREE.Object3D(); mount.name = `rifle-${data.finger}-tip-${data.side}`;
    mount.position.copy(end.worldToLocal(mesh.getVertexPosition(data.vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
    return { data, upper, lower, end, mesh, mount, solver: new TwoBoneIK(upper, lower, end),
      target: new THREE.Vector3(), pole: new THREE.Vector3(), orientation: new THREE.Quaternion() };
  });
  // FPS hands have their own skeleton. The world stance borrows only the
  // rigid gun assembly, while retaining the GLTF scene's import transform.
  const rifle = weapon.getObjectByName('rifle');
  if (!rifle || (rifle !== weapon && rifle.parent !== weapon)) throw new Error('Missing top-level rigid rifle assembly');
  rifle.traverse(node => { if (node instanceof THREE.Bone || node instanceof THREE.SkinnedMesh) throw new Error('Expected a rigid rifle assembly'); });
  const weaponRoot = new THREE.Group(), instance = rifle === weapon ? cloneModel(rifle) : weapon.clone(false);
  if (rifle !== weapon) instance.add(cloneModel(rifle));
  instance.animations = [];
  instance.traverse(node => {
    if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = false; } });
  weaponRoot.name = 'calibrated-rifle'; weaponRoot.add(instance);
  weaponRoot.position.fromArray(config.weapon.position); weaponRoot.rotation.fromArray([...config.weapon.rotation, 'XYZ'] as [number, number, number, 'XYZ']);
  weaponRoot.scale.setScalar(config.weapon.scale); rig.actor.add(weaponRoot);
  for (const arm of arms) arm.wrist.add(arm.mount);
  for (const finger of fingers) finger.end.add(finger.mount);
  const commands = [...(config.bodyCommands ?? []), ...config.fingerCommands];
  const scale = new THREE.Vector3(), weaponQ = new THREE.Quaternion(), axis = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const endQ = new THREE.Quaternion(), currentLong = new THREE.Vector3(), desiredLong = new THREE.Vector3();

  /** Call after the caller's complete FK pose. No applyPose/restore occurs here. */
  function prepareArms() {
    rig.actor.updateMatrixWorld(true); rig.actor.getWorldScale(scale);
    if (!Number.isFinite(scale.lengthSq()) || scale.x <= 0 || Math.abs(scale.x - scale.y) > 1e-6 || Math.abs(scale.x - scale.z) > 1e-6) {
      throw new Error('Rifle stance requires positive actor uniform scale');
    }
    weaponRoot.getWorldQuaternion(weaponQ);
    for (const arm of arms) {
      arm.target.fromArray(arm.data.weapon.point); weaponRoot.localToWorld(arm.target);
      arm.surfaceNormal.fromArray(arm.data.weapon.normal).applyQuaternion(weaponQ).normalize();
      arm.wantedNormal.copy(arm.surfaceNormal).negate(); arm.orientation.copy(weaponQ).multiply(arm.targetFrame);
      if (arm.data.palmRoll) {
        axis.fromArray(arm.data.targetLong).normalize().applyQuaternion(weaponQ);
        rotation.setFromAxisAngle(axis, arm.data.palmRoll); arm.orientation.premultiply(rotation); arm.wantedNormal.applyQuaternion(rotation);
      }
      // Calibration clearance is in actor-scale-1 world metres, independent of weapon .82 scale.
      arm.target.addScaledVector(arm.surfaceNormal, (arm.data.clearanceM ?? config.clearanceM ?? 0) * scale.x);
      arm.pole.fromArray(arm.data.pole); rig.actor.localToWorld(arm.pole);
    }
  }
  function canSolveArms() { return arms.map(a => a.solver.canSolveMount(a.mount, a.target, a.pole, a.orientation)); }
  function solveArms() {
    if (!canSolveArms().every(Boolean)) return false;
    for (const arm of arms) if (!arm.solver.solveMount(arm.mount, arm.target, arm.pole, arm.orientation)) throw new Error('Rifle arm preflight/solve disagreement');
    return true;
  }
  /** Fingers depend on the solved wrist. A false result invalidates the whole
   * composed pose; the caller must not render it and rebuilds full FK next time.
   */
  function solveFingers() {
    weaponRoot.getWorldQuaternion(weaponQ);
    for (const f of fingers) {
      f.target.fromArray(f.data.target); weaponRoot.localToWorld(f.target);
      f.pole.fromArray(f.data.pole); weaponRoot.localToWorld(f.pole);
      f.end.getWorldQuaternion(endQ); currentLong.set(0, 1, 0).applyQuaternion(endQ);
      desiredLong.fromArray(f.data.direction).normalize().applyQuaternion(weaponQ);
      f.orientation.setFromUnitVectors(currentLong, desiredLong).multiply(endQ).normalize();
    }
    if (!fingers.every(f => f.solver.canSolveMount(f.mount, f.target, f.pole, f.orientation))) return false;
    for (const f of fingers) if (!f.solver.solveMount(f.mount, f.target, f.pole, f.orientation)) throw new Error('Rifle finger preflight/solve disagreement');
    return true;
  }
  function measure() {
    return { palms: arms.map(a => {
      const points = a.data.palm.indices.map(i => a.mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(a.mesh.matrixWorld));
      const position = new THREE.Vector3(); points.forEach((p, i) => position.addScaledVector(p, a.data.palm.barycentric[i]));
      const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
      return { side: a.side, mountErrorM: a.mount.getWorldPosition(new THREE.Vector3()).distanceTo(a.target),
        skinContactErrorM: position.distanceTo(a.target), skinNormalAngle: normal.angleTo(a.wantedNormal),
        target: a.target.toArray(), elbow: a.lower.getWorldPosition(new THREE.Vector3()).toArray() };
    }), fingers: fingers.map(f => ({ side: f.data.side, finger: f.data.finger, vertex: f.data.vertex,
      tipErrorM: f.mesh.getVertexPosition(f.data.vertex, new THREE.Vector3()).applyMatrix4(f.mesh.matrixWorld).distanceTo(f.target), target: f.target.toArray() })) };
  }
  return { weaponRoot, commands, arms, fingers, prepareArms, canSolveArms, solveArms, solveFingers, measure };
}
