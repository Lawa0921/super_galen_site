import * as THREE from 'three';
import { cloneModel } from './model-resources';

export interface BoneRotation {
  bone: string;
  /** Axis in the visual layer's unposed frame. Children still inherit posed
   * ancestors; this is not a constraint to rotate about a fixed world axis. */
  axis: readonly [number, number, number];
  angle: number;
}

const parentNames = new Map<string, string | null>([
  ['Root', null], ['pelvis', 'Root'], ['spine_01', 'pelvis'], ['spine_02', 'spine_01'],
  ['spine_03', 'spine_02'], ['neck_01', 'spine_03'], ['head', 'neck_01'],
]);
for (const side of ['l', 'r']) {
  for (const [name, parent] of [
    ['clavicle', 'spine_03'], ['upperarm', `clavicle_${side}`], ['lowerarm', `upperarm_${side}`],
    ['hand', `lowerarm_${side}`], ['thigh', 'pelvis'], ['calf', `thigh_${side}`],
    ['foot', `calf_${side}`], ['ball', `foot_${side}`],
  ]) parentNames.set(`${name}_${side}`, parent);
  for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    for (let segment = 1; segment <= 3; segment++) {
      parentNames.set(`${finger}_0${segment}_${side}`, segment === 1 ? `hand_${side}` : `${finger}_0${segment - 1}_${side}`);
    }
  }
}

function validate(model: THREE.Group) {
  const nodes = new Set<THREE.Object3D>(), bones = new Map<string, THREE.Bone>();
  const skins: THREE.SkinnedMesh[] = [];
  model.traverse(node => {
    nodes.add(node);
    if (node instanceof THREE.SkinnedMesh) skins.push(node);
    if (node instanceof THREE.Bone) {
      if (bones.has(node.name)) throw new Error('GameEngine duplicate bone name');
      bones.set(node.name, node);
    }
    const { x, y, z } = node.scale;
    if (![...node.position.toArray(), ...node.quaternion.toArray(), x, y, z].every(Number.isFinite) ||
        x <= 0 || Math.abs(x - y) > 1e-6 || Math.abs(x - z) > 1e-6 || Math.abs(node.quaternion.lengthSq() - 1) > 1e-4) {
      throw new Error('GameEngine requires finite transforms and positive uniform scales');
    }
  });
  if (!skins.length || bones.size !== parentNames.size) throw new Error('GameEngine requires exactly 53 bones and skinned meshes');
  for (const [name, parent] of parentNames) {
    const bone = bones.get(name);
    if (!bone || !bone.parent || (parent ? bone.parent !== bones.get(parent) : bone.parent instanceof THREE.Bone) || !nodes.has(bone.parent)) {
      throw new Error(`GameEngine invalid parent chain: ${name}`);
    }
  }
  const skeleton = skins[0].skeleton;
  if (skins.some(mesh => mesh.skeleton !== skeleton) || skeleton.bones.length !== bones.size ||
      new Set(skeleton.bones).size !== bones.size || skeleton.bones.some(bone => bones.get(bone.name) !== bone) ||
      skeleton.boneInverses.length !== bones.size || skeleton.boneInverses.some(matrix => !matrix.elements.every(Number.isFinite))) {
    throw new Error('GameEngine requires one shared, complete skeleton');
  }
  return bones;
}

interface RestBone {
  bone: THREE.Bone;
  parent: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  inverseVisualQuaternion: THREE.Quaternion;
}

export class GameEngineActorRig {
  readonly actor = new THREE.Group();
  readonly visual = new THREE.Group();
  readonly model: THREE.Group;
  readonly bones: ReadonlyMap<string, THREE.Bone>;
  private readonly rest = new Map<string, RestBone>();
  private readonly axis = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();

  /** Explicit opt-in for the approved metre-scale, +Z-facing GameEngine source.
   * Structure verification cannot infer art direction, forward axis or units.
   * This does not provide gait, arm IK or weapon grip calibration.
   */
  constructor(source: THREE.Group) {
    validate(source); // Refuse incompatible input before allocating or changing it.
    this.model = cloneModel(source);
    this.bones = validate(this.model);
    this.actor.name = 'skin-actor'; this.visual.name = 'visual-facing';
    this.visual.rotation.y = Math.PI;
    this.actor.add(this.visual); this.visual.add(this.model);
    this.actor.updateMatrixWorld(true);
    const inverseVisual = this.visual.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const [name, bone] of this.bones) {
      const modelQuaternion = inverseVisual.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      this.rest.set(name, { bone, parent: bone.parent!, position: bone.position.clone(), quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone(), inverseVisualQuaternion: modelQuaternion.invert() });
    }
  }

  /** Complete pose, recomputed from rest. Commands for a bone compose in order
   * about its cached visual-rest axes. Invalid input changes no bone transforms.
   * Callers combine all animation channels before submitting the complete pose.
   */
  applyPose(commands: readonly BoneRotation[]) {
    for (const rest of this.rest.values()) {
      if (rest.bone.parent !== rest.parent) throw new Error('GameEngine bone parent was changed outside the pose controller');
    }
    for (const command of commands) {
      if (!this.rest.has(command.bone) || command.axis.length !== 3 || !command.axis.every(Number.isFinite) ||
          !Number.isFinite(command.angle) || Math.abs(command.angle) > Math.PI ||
          Math.hypot(...command.axis) < 1e-12 || !Number.isFinite(Math.hypot(...command.axis))) {
        throw new Error('GameEngine invalid rest-space rotation');
      }
    }
    for (const rest of this.rest.values()) {
      rest.bone.position.copy(rest.position); rest.bone.quaternion.copy(rest.quaternion); rest.bone.scale.copy(rest.scale);
    }
    for (const command of commands) {
      const rest = this.rest.get(command.bone)!;
      this.axis.fromArray(command.axis).normalize().applyQuaternion(rest.inverseVisualQuaternion);
      this.rotation.setFromAxisAngle(this.axis, command.angle);
      rest.bone.quaternion.multiply(this.rotation);
    }
  }

  restore() { this.applyPose([]); }
}

export function createGameEngineActor(source: THREE.Group) {
  return new GameEngineActorRig(source);
}
