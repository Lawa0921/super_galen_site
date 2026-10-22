import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import fixture from './fixtures/gameengine-rig.json';
import { createGameEngineActor } from './skin-rig';
import { mountRifleToChest } from './rifle-rest';
import { disposeModelInstance } from './model-resources';

function setup() {
  const source = new THREE.Group(), armature = new THREE.Group(); source.add(armature);
  const bones = new Map(fixture.bones.map(s => {
    const bone = new THREE.Bone(); bone.name = s.name; bone.position.fromArray(s.translation);
    bone.quaternion.fromArray(s.rotation); bone.scale.fromArray(s.scale); return [s.name, bone] as const;
  }));
  for (const s of fixture.bones) (s.parent ? bones.get(s.parent)! : armature).add(bones.get(s.name)!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  source.add(skin); source.updateMatrixWorld(true); skin.bind(new THREE.Skeleton([...bones.values()]));
  const rig = createGameEngineActor(source), weapon = new THREE.Group(); weapon.name = 'held-weapon';
  weapon.position.set(.15, 1.28, -.24); weapon.scale.setScalar(.82);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, -.7); weapon.add(muzzle);
  rig.actor.add(weapon);
  rig.applyPose([{ bone: 'spine_01', axis: [0, 1, 0], angle: -.5 },
    { bone: 'upperarm_r', axis: [1, 0, 0], angle: .4 }, { bone: 'index_02_r', axis: [1, 0, 0], angle: .6 }]);
  rig.actor.updateMatrixWorld(true);
  return { source, rig, weapon, muzzle, geometry };
}
const pose = (rig: ReturnType<typeof createGameEngineActor>) => [...rig.bones.values()].map(b => [...b.position.toArray(), ...b.quaternion.toArray(), ...b.scale.toArray()]);
const difference = (a: number[], b: number[]) => Math.max(...a.map((n, i) => Math.abs(n - b[i])));

describe('rifle neutral rest', () => {
  it('preserves world rifle/muzzle transforms and all bone parents while attaching only the owned weapon', () => {
    const { rig, weapon, muzzle } = setup(); rig.actor.position.set(3, .2, -4); rig.actor.rotation.y = .8; rig.actor.scale.setScalar(1.15);
    rig.actor.updateMatrixWorld(true);
    const before = pose(rig), parents = [...rig.bones.values()].map(b => b.parent);
    const gunWorld = weapon.matrixWorld.clone(), muzzleWorld = muzzle.matrixWorld.clone();
    mountRifleToChest(rig, weapon); rig.actor.updateMatrixWorld(true);
    expect(weapon.parent).toBe(rig.bones.get('spine_03'));
    expect(difference(weapon.matrixWorld.elements, gunWorld.elements)).toBeLessThan(1e-6);
    expect(difference(muzzle.matrixWorld.elements, muzzleWorld.elements)).toBeLessThan(1e-6);
    expect(pose(rig)).toEqual(before); expect([...rig.bones.values()].map(b => b.parent)).toEqual(parents);
  });

  it('clones the calibrated model as a new rest and keeps weapon-relative hands fixed under chest and pelvis motion', () => {
    const { rig, weapon, geometry } = setup(), before = pose(rig);
    mountRifleToChest(rig, weapon);
    const animated = createGameEngineActor(rig.model), second = createGameEngineActor(rig.model);
    const gun = animated.model.getObjectByName('held-weapon')!, hand = animated.bones.get('hand_r')!;
    const relativeHand = () => gun.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).toArray();
    const initial = relativeHand(), neutral = pose(animated);
    animated.actor.position.set(2, .3, -5); animated.actor.rotation.y = .7; animated.actor.scale.setScalar(1.15);
    animated.visual.position.y = -.1;
    animated.applyPose([{ bone: 'pelvis', axis: [0, 1, 0], angle: .4 }, { bone: 'spine_03', axis: [1, 0, 0], angle: .2 }]);
    animated.actor.updateMatrixWorld(true);
    expect(difference(relativeHand(), initial)).toBeLessThan(1e-6);
    expect(pose(second)).toEqual(neutral); expect(pose(rig)).toEqual(before);
    animated.restore(); expect(pose(animated)).toEqual(neutral);
    let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
    disposeModelInstance(rig.actor); expect(disposed).toBe(0);
    expect(gun.parent).toBe(animated.bones.get('spine_03'));
    expect(gun).not.toBe(weapon);
  });

  it('rejects foreign or skinned weapons and nonuniform/sheared transforms without changing the assembly', () => {
    for (const mode of ['foreign', 'bone', 'scale', 'shear'] as const) {
      const { rig, weapon } = setup();
      if (mode === 'foreign') new THREE.Group().add(weapon);
      if (mode === 'bone') weapon.add(new THREE.Bone());
      if (mode === 'scale') rig.actor.scale.set(1, 2, 1);
      if (mode === 'shear') { weapon.matrixAutoUpdate = false; weapon.matrix.elements[4] = .2; }
      const parent = weapon.parent, before = pose(rig), local = weapon.matrix.clone();
      expect(() => mountRifleToChest(rig, weapon)).toThrow(/rifle|uniform|transform/i);
      expect(weapon.parent).toBe(parent); expect(pose(rig)).toEqual(before);
      expect(weapon.matrix.elements).toEqual(local.elements);
    }
  });
});
