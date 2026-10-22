import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import fixture from './fixtures/gameengine-rig.json';
import { createGameEngineActor } from './skin-rig';
import { createRifleStance, type RifleStanceCalibration } from './rifle-stance';
import { mountRifleToChest } from './rifle-rest';
import { disposeModelInstance } from './model-resources';

function setup() {
  const model = new THREE.Group(), armature = new THREE.Group(); model.add(armature);
  const bones = new Map(fixture.bones.map(s => { const b = new THREE.Bone(); b.name = s.name;
    b.position.fromArray(s.translation); b.quaternion.fromArray(s.rotation); b.scale.fromArray(s.scale); return [s.name, b] as const; }));
  for (const s of fixture.bones) (s.parent ? bones.get(s.parent)! : armature).add(bones.get(s.name)!);
  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([...bones.values()]), positions: number[] = [], indices: number[] = [], weights: number[] = [];
  for (const side of ['r', 'l']) {
    const hand = bones.get(`hand_${side}`)!;
    for (const local of [[0, 0, 0], [.01, 0, 0], [0, .01, 0]]) {
      positions.push(...hand.localToWorld(new THREE.Vector3().fromArray(local)).toArray());
      indices.push(skeleton.bones.indexOf(hand), 0, 0, 0); weights.push(1, 0, 0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4)); geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); mesh.name = 'body'; model.add(mesh); mesh.bind(skeleton);
  model.updateMatrixWorld(true); const rig = createGameEngineActor(model); rig.actor.updateMatrixWorld(true);
  const weapon = new THREE.Group(); weapon.name = 'test-rifle';
  // GLTFLoader creates Object3D for a plain transform node with no attachment.
  const rifle = new THREE.Object3D(); rifle.name = 'rifle'; weapon.add(rifle);
  const receiver = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial()); receiver.name = 'receiver'; rifle.add(receiver);
  const viewHands = new THREE.Group(); viewHands.name = 'view_hands'; weapon.add(viewHands);
  const config: RifleStanceCalibration = { weapon: { position: [0, 0, 0], rotation: [0, 0, 0], scale: .82 },
    fingerCommands: [], bodyCommands: [{ bone: 'head', axis: [0, 1, 0], angle: .1 }], hands: {} as RifleStanceCalibration['hands'] };
  for (const [i, side] of (['r', 'l'] as const).entries()) {
    const shoulder = rig.bones.get(`upperarm_${side}`)!.getWorldPosition(new THREE.Vector3());
    const wrist = rig.bones.get(`hand_${side}`)!, q = wrist.getWorldQuaternion(new THREE.Quaternion());
    const target = wrist.getWorldPosition(new THREE.Vector3()).sub(shoulder).multiplyScalar(.6).add(shoulder);
    const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(q), targetLong = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    config.hands[side] = { palm: { mesh: 'body', indices: [i * 3, i * 3 + 1, i * 3 + 2], barycentric: [1, 0, 0],
      handLocalPoint: [0, 0, 0], handLocalNormal: [0, 0, 1] }, long: [0, 1, 0], targetLong: targetLong.toArray(),
      weapon: { point: target.addScaledVector(normal, -.002).divideScalar(.82).toArray(), normal: normal.toArray() },
      pole: [side === 'r' ? .8 : -.8, .9, .5], clearanceM: .002 };
  }
  return { model, rig, weapon, config, mesh };
}

describe('frozen rifle upper-body assembly', () => {
  it('solves both palms while preserving a caller-composed leg and head pose', () => {
    const { rig, weapon, config } = setup(), stance = createRifleStance(rig, weapon, config);
    expect(stance.commands).toEqual(config.bodyCommands);
    rig.applyPose([...stance.commands, { bone: 'thigh_l', axis: [1, 0, 0], angle: .2 }]);
    const leg = rig.bones.get('thigh_l')!.quaternion.clone(), head = rig.bones.get('head')!.quaternion.clone();
    stance.prepareArms(); expect(stance.canSolveArms()).toEqual([true, true]); expect(stance.solveArms()).toBe(true);
    expect(rig.bones.get('thigh_l')!.quaternion.toArray()).toEqual(leg.toArray());
    expect(rig.bones.get('head')!.quaternion.toArray()).toEqual(head.toArray());
    expect(stance.solveFingers()).toBe(true);
    for (const palm of stance.measure().palms as { mountErrorM: number; skinContactErrorM: number }[]) {
      expect(palm.mountErrorM).toBeLessThan(1e-6); expect(palm.skinContactErrorM).toBeLessThan(1e-6);
    }
  });

  it('scales world clearance with the actor, independently of the rifle scale', () => {
    const { rig, weapon, config } = setup(), stance = createRifleStance(rig, weapon, config);
    stance.prepareArms(); expect(stance.arms).toHaveLength(2);
    const base = stance.arms.map(a => a.target.clone());
    rig.actor.position.set(2, .3, -4); rig.actor.rotation.y = .7; rig.actor.scale.setScalar(1.15); rig.actor.updateMatrixWorld(true);
    stance.prepareArms();
    for (let i = 0; i < 2; i++) expect(stance.arms[i].target.distanceTo(base[i].applyMatrix4(rig.actor.matrixWorld))).toBeLessThan(1e-12);
  });

  it('refuses an unreachable paired solve without changing either arm or other bones', () => {
    const { rig, weapon, config } = setup(); config.hands.l.weapon.point[0] += 100;
    const stance = createRifleStance(rig, weapon, config);
    rig.applyPose([{ bone: 'thigh_l', axis: [1, 0, 0], angle: .2 }]);
    const before = [...rig.bones.values()].map(b => b.quaternion.toArray());
    stance.prepareArms();
    expect(stance.canSolveArms()).toEqual([true, false]); expect(stance.solveArms()).toBe(false);
    expect([...rig.bones.values()].map(b => b.quaternion.toArray())).toEqual(before);
  });

  it('keeps source weapon ownership intact and rejects incompatible palm weights or actor scale', () => {
    const { rig, weapon, config } = setup(), stance = createRifleStance(rig, weapon, config);
    expect(weapon.parent).toBeNull(); expect(weapon.getObjectByName('view_hands')!.visible).toBe(true);
    expect(stance.weaponRoot.parent).toBe(rig.actor);
    expect(stance.weaponRoot.getObjectByName('view_hands')).toBeUndefined();
    rig.actor.scale.set(1, 2, 1); expect(() => stance.prepareArms()).toThrow(/scale/i);
    const other = setup(), skin = other.rig.model.getObjectByName('body') as THREE.SkinnedMesh;
    skin.geometry.attributes.skinIndex.array[0] = 0;
    expect(() => createRifleStance(other.rig, other.weapon, other.config)).toThrow(/palm/i);
  });

  it('mounts only the rigid rifle, preserves import transforms and never clones or disposes FPS resources', () => {
    const { rig, weapon, config } = setup(), hands = weapon.getObjectByName('view_hands')!;
    const bone = new THREE.Bone(), skeleton = new THREE.Skeleton([bone]); hands.add(bone);
    const texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map: texture }), geometry = new THREE.BufferGeometry();
    const mesh = new THREE.SkinnedMesh(geometry, material); hands.add(mesh); mesh.bind(skeleton);
    const events = [texture, material, geometry, skeleton].map(value => vi.spyOn(value, 'dispose'));
    const clone = vi.spyOn(material, 'clone');
    weapon.position.set(.1, .2, .3); weapon.rotation.y = .2;
    const rifle = weapon.getObjectByName('rifle')!; rifle.position.set(0, 0, .5); rifle.rotation.x = .1;
    weapon.updateMatrixWorld(true);
    const sourceMatrix = weapon.getObjectByName('receiver')!.matrixWorld.clone();
    const stance = createRifleStance(rig, weapon, config); stance.weaponRoot.updateMatrixWorld(true);
    const relative = stance.weaponRoot.matrixWorld.clone().invert().multiply(stance.weaponRoot.getObjectByName('receiver')!.matrixWorld);
    relative.elements.forEach((value, index) => expect(value).toBeCloseTo(sourceMatrix.elements[index], 10));
    expect(stance.weaponRoot.getObjectByName('view_hands')).toBeUndefined();
    expect(() => mountRifleToChest(rig, stance.weaponRoot)).not.toThrow();
    disposeModelInstance(stance.weaponRoot);
    expect(clone).not.toHaveBeenCalled(); for (const event of events) expect(event).not.toHaveBeenCalled();
  });
  it('rejects a skinned rifle assembly before cloning any weapon resources', () => {
    const { rig, weapon, config } = setup(); weapon.getObjectByName('rifle')!.add(new THREE.Bone());
    expect(() => createRifleStance(rig, weapon, config)).toThrow('rigid rifle');
  });
});
