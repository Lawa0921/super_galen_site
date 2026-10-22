import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TwoBoneIK } from './two-bone-ik';

function chain() {
  const actor = new THREE.Group(), upper = new THREE.Bone(), lower = new THREE.Bone(), end = new THREE.Bone();
  actor.add(upper); upper.add(lower); lower.add(end);
  lower.position.set(0, .3, 0); end.position.set(0, .25, 0); actor.updateMatrixWorld(true);
  return { actor, upper, lower, end, solver: new TwoBoneIK(upper, lower, end) };
}
const world = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3());
const rotations = (c: ReturnType<typeof chain>) => [c.upper, c.lower, c.end].map(b => b.quaternion.toArray());

describe('two-bone inverse kinematics', () => {
  it('reaches hand targets with the elbow on the requested pole side without changing lengths or parents', () => {
    const c = chain(), target = new THREE.Vector3(.12, .12, .4), pole = new THREE.Vector3(.8, -.2, 0);
    const parents = [c.upper.parent, c.lower.parent, c.end.parent];
    const localPositions = [c.upper, c.lower, c.end].map(b => b.position.toArray());
    expect(c.solver.solve(target, pole)).toBe(true);
    expect(world(c.end).distanceTo(target)).toBeLessThan(1e-7);
    expect(world(c.upper).distanceTo(world(c.lower))).toBeCloseTo(.3, 8);
    expect(world(c.lower).distanceTo(world(c.end))).toBeCloseTo(.25, 8);
    const direction = target.clone().normalize();
    const elbowSide = world(c.lower).addScaledVector(direction, -world(c.lower).dot(direction));
    const wantedSide = pole.clone().addScaledVector(direction, -pole.dot(direction));
    expect(elbowSide.normalize().dot(wantedSide.normalize())).toBeCloseTo(1, 8);
    expect([c.upper.parent, c.lower.parent, c.end.parent]).toEqual(parents);
    expect([c.upper, c.lower, c.end].map(b => b.position.toArray())).toEqual(localPositions);
  });

  it('works in world space under actor translation, yaw, a rotated parent and uniform scale', () => {
    const c = chain(); c.actor.position.set(3, 1, -4); c.actor.rotation.set(.1, 1.3, -.2); c.actor.scale.setScalar(2);
    const target = c.actor.localToWorld(new THREE.Vector3(.1, .2, .35));
    const pole = c.actor.localToWorld(new THREE.Vector3(-.5, -.2, .1));
    expect(c.solver.solve(target, pole)).toBe(true);
    expect(world(c.end).distanceTo(target)).toBeLessThan(1e-7);
    expect(world(c.upper).distanceTo(world(c.lower))).toBeCloseTo(.6, 8);
  });

  it('clamps unreachable targets instead of stretching or producing invalid transforms', () => {
    const c = chain(), pole = new THREE.Vector3(1, 0, 0);
    expect(c.solver.solve(new THREE.Vector3(0, 0, 20), pole)).toBe(false);
    expect(world(c.end).length()).toBeCloseTo(.55, 4);
    expect(c.solver.solve(new THREE.Vector3(0, 0, 0), pole)).toBe(false);
    expect(world(c.end).length()).toBeCloseTo(.05, 4);
    expect(rotations(c).flat().every(Number.isFinite)).toBe(true);
  });

  it('handles a collinear pole deterministically and never leaves a singular elbow', () => {
    const c = chain(), target = new THREE.Vector3(0, .4, 0);
    expect(c.solver.solve(target, target.clone().multiplyScalar(2))).toBe(true);
    const result = rotations(c);
    expect(rotations(c).flat().every(Number.isFinite)).toBe(true);
    expect(world(c.end).distanceTo(target)).toBeLessThan(1e-7);
    c.solver.solve(target, target.clone().multiplyScalar(2));
    rotations(c).flat().forEach((value, i) => expect(value).toBeCloseTo(result.flat()[i], 7));
  });

  it('applies an explicit world wrist orientation independently of actor yaw', () => {
    const c = chain(); c.actor.rotation.y = .7;
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.4, -.8, 1.2));
    expect(c.solver.solve(new THREE.Vector3(.2, .1, .35), new THREE.Vector3(-1, 0, 0), orientation)).toBe(true);
    expect(c.end.getWorldQuaternion(new THREE.Quaternion()).angleTo(orientation)).toBeLessThan(1e-6);
  });

  it('aligns a nonzero rotated grip mount rather than putting the wrist on the grip', () => {
    const c = chain(), mount = new THREE.Object3D(); c.end.add(mount);
    mount.position.set(.04, .06, -.02); mount.rotation.set(.3, .6, -.8);
    c.actor.position.set(2, 1, -3); c.actor.rotation.set(.15, .8, -.12); c.actor.scale.setScalar(1.6);
    const target = c.actor.localToWorld(new THREE.Vector3(.13, .18, .31));
    const pole = c.actor.localToWorld(new THREE.Vector3(.7, -.4, 0));
    const desired = c.actor.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.2, .3, .9)));
    const local = { position: mount.position.toArray(), rotation: mount.quaternion.toArray() };
    expect(c.solver.solveMount(mount, target, pole, desired)).toBe(true);
    expect(world(mount).distanceTo(target)).toBeLessThan(1e-7);
    expect(mount.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(desired.clone().normalize())).toBeLessThan(1e-6);
    expect(world(c.end).distanceTo(target)).toBeGreaterThan(.05);
    expect({ position: mount.position.toArray(), rotation: mount.quaternion.toArray() }).toEqual(local);
    expect(mount.parent).toBe(c.end);
    expect(world(c.upper).distanceTo(world(c.lower))).toBeCloseTo(.3 * 1.6, 8);
  });

  it('rejects detached, non-rigid and invalid grip mounts without posing bones', () => {
    const c = chain(), mount = new THREE.Object3D(), before = rotations(c);
    const target = new THREE.Vector3(.1, .2, .3), pole = new THREE.Vector3(1, 0, 0), desired = new THREE.Quaternion();
    expect(() => c.solver.solveMount(mount, target, pole, desired)).toThrow(/mount/);
    c.end.add(mount); mount.position.x = NaN;
    expect(() => c.solver.solveMount(mount, target, pole, desired)).toThrow(/mount/);
    mount.position.x = 0; mount.quaternion.set(0, 0, 0, 0);
    expect(() => c.solver.solveMount(mount, target, pole, desired)).toThrow(/mount/);
    mount.quaternion.identity(); mount.scale.setScalar(2);
    expect(() => c.solver.solveMount(mount, target, pole, desired)).toThrow(/mount/);
    mount.scale.setScalar(1);
    mount.matrixAutoUpdate = false; mount.matrix.makeTranslation(8, 9, 10);
    expect(() => c.solver.solveMount(mount, target, pole, desired)).toThrow(/mount/);
    mount.matrixAutoUpdate = true;
    expect(() => c.solver.solveMount(mount, target, pole, new THREE.Quaternion(0, 0, 0, 0))).toThrow(/IK/);
    const bone = new THREE.Bone(); c.end.add(bone);
    expect(() => c.solver.solveMount(bone, target, pole, desired)).toThrow(/mount/);
    expect(rotations(c)).toEqual(before);
  });

  it('rejects invalid inputs atomically and rejects changed chain parents', () => {
    const c = chain(), before = rotations(c), target = new THREE.Vector3(.2, 0, .3), pole = new THREE.Vector3(-1, 0, 0);
    for (const [t, p, q] of [
      [new THREE.Vector3(NaN, 0, 0), pole, undefined],
      [target, new THREE.Vector3(Infinity, 0, 0), undefined],
      [new THREE.Vector3(1e300, 0, 0), pole, undefined],
      [target, pole, new THREE.Quaternion(0, 0, 0, 0)],
    ] as const) {
      expect(() => c.solver.solve(t, p, q)).toThrow(/IK/);
      expect(rotations(c)).toEqual(before);
    }
    c.actor.add(c.end);
    expect(() => c.solver.solve(target, pole)).toThrow(/IK/);
    expect(rotations(c)).toEqual(before);
  });

  it('rejects disconnected, zero-length and non-uniformly scaled chains', () => {
    const c = chain(); c.end.position.set(0, 0, 0);
    expect(() => new TwoBoneIK(c.upper, c.lower, c.end)).toThrow(/IK/);
    const d = chain(); d.actor.scale.set(1, 2, 1);
    expect(() => d.solver.solve(new THREE.Vector3(.1, .1, .3), new THREE.Vector3(1, 0, 0))).toThrow(/IK/);
    expect(() => new TwoBoneIK(d.upper, new THREE.Bone(), d.end)).toThrow(/IK/);
  });

  it('preflights a rotated sole mount in world space without changing the current pose or last solve error', () => {
    const c = chain(), mount = new THREE.Object3D(); c.end.add(mount);
    mount.position.set(.03, -.06, .04); mount.rotation.set(.2, -.3, .4);
    c.actor.position.set(2, .4, -3); c.actor.rotation.y = 1.2; c.actor.scale.setScalar(1.7);
    const target = c.actor.localToWorld(new THREE.Vector3(.12, .14, .32));
    const pole = c.actor.localToWorld(new THREE.Vector3(.6, -.2, 0));
    const orientation = c.actor.getWorldQuaternion(new THREE.Quaternion());
    c.solver.solve(new THREE.Vector3(50, 0, 0), pole);
    const before = rotations(c), error = c.solver.endError;
    expect(c.solver.canSolveMount(mount, target, pole, orientation)).toBe(true);
    expect(rotations(c)).toEqual(before); expect(c.solver.endError).toBe(error);
    expect(c.solver.solveMount(mount, target, pole, orientation)).toBe(true);
    expect(world(mount).distanceTo(target)).toBeLessThan(1e-7);
  });

  it('refuses far, folded and degenerate-pole foot targets during preflight without applying a clamp', () => {
    const c = chain(), mount = new THREE.Object3D(); c.end.add(mount);
    const orientation = new THREE.Quaternion(), pole = new THREE.Vector3(1, 0, 0), before = rotations(c);
    expect(c.solver.canSolveMount(mount, new THREE.Vector3(0, 0, 20), pole, orientation)).toBe(false);
    expect(c.solver.canSolveMount(mount, new THREE.Vector3(0, 0, 0), pole, orientation)).toBe(false);
    expect(c.solver.canSolveMount(mount, new THREE.Vector3(0, .4, 0), new THREE.Vector3(0, 1, 0), orientation)).toBe(false);
    expect(rotations(c)).toEqual(before);
    // Existing callers retain solve()'s documented collinear fallback.
    expect(c.solver.solve(new THREE.Vector3(0, .4, 0), new THREE.Vector3(0, 1, 0))).toBe(true);
  });

  it('validates all preflight inputs and changed chains without changing either leg pose', () => {
    const left = chain(), right = chain(), leftMount = new THREE.Object3D(), rightMount = new THREE.Object3D();
    left.end.add(leftMount); right.end.add(rightMount);
    const target = new THREE.Vector3(.1, .1, .3), pole = new THREE.Vector3(1, 0, 0), orientation = new THREE.Quaternion();
    const before = [rotations(left), rotations(right)];
    expect(left.solver.canSolveMount(leftMount, target, pole, orientation)).toBe(true);
    expect(right.solver.canSolveMount(rightMount, new THREE.Vector3(9, 0, 0), pole, orientation)).toBe(false);
    for (const [t, p, q] of [[new THREE.Vector3(NaN, 0, 0), pole, orientation], [target, new THREE.Vector3(Infinity, 0, 0), orientation],
      [target, pole, new THREE.Quaternion(0, 0, 0, 0)]] as const) {
      expect(() => left.solver.canSolveMount(leftMount, t, p, q)).toThrow(/IK/);
    }
    rightMount.scale.setScalar(2);
    expect(() => right.solver.canSolveMount(rightMount, target, pole, orientation)).toThrow(/mount/);
    rightMount.scale.setScalar(1); right.actor.add(right.end);
    expect(() => right.solver.canSolveMount(rightMount, target, pole, orientation)).toThrow(/chain/);
    expect([rotations(left), rotations(right)]).toEqual(before);
  });
});
