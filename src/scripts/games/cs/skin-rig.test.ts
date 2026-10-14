import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import fixture from './fixtures/gameengine-rig.json';
import { createGameEngineActor } from './skin-rig';

function sourceActor() {
  const model = new THREE.Group(), armature = new THREE.Group();
  armature.name = 'Humanrig'; model.add(armature); // GLTFLoader sanitizes the source dot.
  const bones = new Map(fixture.bones.map(spec => {
    const bone = new THREE.Bone(); bone.name = spec.name;
    bone.position.fromArray(spec.translation); bone.quaternion.fromArray(spec.rotation); bone.scale.fromArray(spec.scale);
    return [bone.name, bone] as const;
  }));
  for (const spec of fixture.bones) (spec.parent ? bones.get(spec.parent)! : armature).add(bones.get(spec.name)!);
  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([...bones.values()]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.45, 1.05, .2, -.46, 1.06, .2, -.45, 1.06, .21], 3));
  const hand = skeleton.bones.findIndex(bone => bone.name === 'hand_r');
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([hand, 0, 0, 0, hand, 0, 0, 0, hand, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const material = new THREE.MeshStandardMaterial();
  for (const name of ['body', 'clothes']) {
    const mesh = new THREE.SkinnedMesh(geometry, material); mesh.name = name;
    model.add(mesh); mesh.bind(skeleton);
  }
  model.updateMatrixWorld(true);
  return { model, bones, skeleton };
}

function localPose(model: THREE.Object3D) {
  const result: Record<string, number[]> = {};
  model.traverse(node => { if (node instanceof THREE.Bone) result[node.name] = [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]; });
  return result;
}

const poseA = [
  { bone: 'spine_02', axis: [1, 0, 0] as const, angle: -.2 },
  { bone: 'upperarm_r', axis: [1, 0, 0] as const, angle: -.3 },
  { bone: 'thigh_l', axis: [1, 0, 0] as const, angle: .2 },
];

describe('explicit GameEngine skeletal actor', () => {
  it('preserves all 53 bone parents and local rest transforms behind a separate facing layer', () => {
    const source = sourceActor(), rest = localPose(source.model);
    const rig = createGameEngineActor(source.model);
    expect(rig.bones.size).toBe(53);
    expect(rig.actor.children).toEqual([rig.visual]);
    expect(rig.visual.children).toEqual([rig.model]);
    expect(rig.model).not.toBe(source.model);
    expect(localPose(rig.model)).toEqual(rest);
    for (const spec of fixture.bones) {
      const bone = rig.bones.get(spec.name)!;
      expect(bone.parent?.name).toBe(spec.parent ?? 'Humanrig');
      expect(bone.parent).not.toBe(source.bones.get(spec.name)!.parent);
    }
    expect(localPose(source.model)).toEqual(rest);
    const skin = rig.model.getObjectByName('body') as THREE.SkinnedMesh;
    expect(skin.skeleton.boneInverses.map(m => m.elements)).toEqual(source.skeleton.boneInverses.map(m => m.elements));
  });

  it('maps declared visual +Z forward to the engine forward for two actor yaws', () => {
    const rig = createGameEngineActor(sourceActor().model);
    for (const yaw of [0, Math.PI / 2]) {
      rig.actor.rotation.y = yaw; rig.actor.updateMatrixWorld(true);
      const forward = new THREE.Vector3(0, 0, 1).transformDirection(rig.visual.matrixWorld);
      expect(forward.distanceTo(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)))).toBeLessThan(1e-12);
    }
  });

  it('rejects missing, duplicate, extra and incorrectly parented bones before touching the source', () => {
    for (const mutate of [
      (s: ReturnType<typeof sourceActor>) => { s.bones.get('head')!.name = 'unknown'; },
      (s: ReturnType<typeof sourceActor>) => { s.bones.get('head')!.name = 'neck_01'; },
      (s: ReturnType<typeof sourceActor>) => { const bone = new THREE.Bone(); bone.name = 'extra'; s.model.add(bone); s.skeleton.bones.push(bone); },
      (s: ReturnType<typeof sourceActor>) => { s.bones.get('pelvis')!.add(s.bones.get('head')!); },
    ]) {
      const source = sourceActor(); mutate(source);
      const before = localPose(source.model), parents = [...source.bones.values()].map(b => b.parent);
      expect(() => createGameEngineActor(source.model)).toThrow(/GameEngine/);
      expect(localPose(source.model)).toEqual(before);
      expect([...source.bones.values()].map(b => b.parent)).toEqual(parents);
    }
  });

  it('rejects mismatched skeleton ownership and rigid models', () => {
    const source = sourceActor();
    (source.model.getObjectByName('clothes') as THREE.SkinnedMesh).skeleton = new THREE.Skeleton(source.skeleton.bones);
    expect(() => createGameEngineActor(source.model)).toThrow(/GameEngine/);
    expect(() => createGameEngineActor(new THREE.Group())).toThrow(/GameEngine/);
  });

  it('rejects malformed transforms without allocating a rig or altering the input', () => {
    for (const mutate of [
      (bone: THREE.Bone) => { bone.position.x = Number.NaN; },
      (bone: THREE.Bone) => { bone.scale.setScalar(0); },
      (bone: THREE.Bone) => { bone.scale.setScalar(-1); },
      (bone: THREE.Bone) => { bone.scale.set(1, 2, 1); },
      (bone: THREE.Bone) => { bone.quaternion.set(0, 0, 0, 2); },
    ]) {
      const source = sourceActor(); mutate(source.bones.get('head')!);
      const before = localPose(source.model);
      expect(() => createGameEngineActor(source.model)).toThrow(/transforms/);
      expect(localPose(source.model)).toEqual(before);
    }
  });

  it('recomputes complete poses from rest without accumulation and leaves source and other instances unchanged', () => {
    const source = sourceActor(), a = createGameEngineActor(source.model), b = createGameEngineActor(source.model);
    const rest = localPose(source.model), parents = [...a.bones.values()].map(bone => bone.parent);
    a.applyPose(poseA); const first = localPose(a.model);
    expect(first).not.toEqual(rest);
    for (let i = 0; i < 20; i++) a.applyPose(poseA);
    expect(localPose(a.model)).toEqual(first);
    a.applyPose([{ bone: 'head', axis: [0, 0, 1], angle: .3 }]); a.applyPose(poseA);
    expect(localPose(a.model)).toEqual(first);
    expect(localPose(source.model)).toEqual(rest); expect(localPose(b.model)).toEqual(rest);
    expect([...a.bones.values()].map(bone => bone.parent)).toEqual(parents);
    a.restore(); expect(localPose(a.model)).toEqual(rest);
  });

  it('rotates about the requested visual rest-space axis despite the imported rotated root and bone axes', () => {
    const rig = createGameEngineActor(sourceActor().model), bone = rig.bones.get('head')!;
    rig.actor.updateMatrixWorld(true);
    const relative = () => rig.visual.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    const before = relative(), expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -.4).multiply(before);
    rig.applyPose([{ bone: 'head', axis: [1, 0, 0], angle: -.4 }]); rig.actor.updateMatrixWorld(true);
    expect(relative().angleTo(expected)).toBeLessThan(1e-6);
  });

  it('atomically refuses malformed pose commands and an externally changed bone hierarchy', () => {
    const rig = createGameEngineActor(sourceActor().model); rig.applyPose(poseA);
    const before = localPose(rig.model);
    for (const command of [
      { bone: 'head', axis: [1, 0, 0] as const, angle: Number.NaN },
      { bone: 'head', axis: [0, 0, 0] as const, angle: .2 },
      { bone: 'head', axis: [Infinity, 0, 0] as const, angle: .2 },
      { bone: 'head', axis: [1, 0, 0] as const, angle: Math.PI + .001 },
      { bone: 'missing', axis: [1, 0, 0] as const, angle: .2 },
    ]) {
      expect(() => rig.applyPose([...poseA, command])).toThrow();
      expect(localPose(rig.model)).toEqual(before);
    }
    rig.bones.get('pelvis')!.add(rig.bones.get('head')!);
    expect(() => rig.applyPose([])).toThrow(/parent/);
    expect(localPose(rig.model)).toEqual(before);
  });

  it('lets child rest-space rotations inherit the posed ancestor instead of treating them as fixed world axes', () => {
    const rig = createGameEngineActor(sourceActor().model), head = rig.bones.get('head')!;
    const relative = () => rig.visual.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(head.getWorldQuaternion(new THREE.Quaternion()));
    rig.actor.updateMatrixWorld(true); const before = relative();
    const ancestor = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .25);
    const child = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), .3);
    const expected = ancestor.clone().multiply(child).multiply(before);
    rig.applyPose([{ bone: 'spine_02', axis: [1, 0, 0], angle: .25 }, { bone: 'head', axis: [0, 0, 1], angle: .3 }]);
    rig.actor.updateMatrixWorld(true);
    const actual = relative();
    // Matrix decomposition of the imported float32 rest rotations introduces
    // sub-1e-8 component error; angleTo assumes unit quaternions.
    actual.toArray().forEach((value, index) => expect(Math.abs(value - expected.toArray()[index])).toBeLessThan(2e-7));
    expect(actual.normalize().angleTo(expected.normalize())).toBeLessThan(1e-6);
  });
});
