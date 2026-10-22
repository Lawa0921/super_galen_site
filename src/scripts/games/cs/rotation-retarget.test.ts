import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { createRotationRetarget } from './rotation-retarget';

function setup() {
  const sourceFrame = new T.Group(), targetFrame = new T.Group();
  sourceFrame.rotation.z = .3; targetFrame.rotation.y = Math.PI / 2;
  const sourceParent = new T.Bone(), sourceChild = new T.Bone(), targetParent = new T.Bone(), targetChild = new T.Bone(), upper = new T.Bone();
  sourceFrame.add(sourceParent); sourceParent.add(sourceChild); targetFrame.add(targetParent, upper); targetParent.add(targetChild);
  sourceChild.rotation.x = .3; targetParent.rotation.z = .4; targetChild.rotation.y = -.6; upper.rotation.z = .8;
  sourceChild.position.set(0, -.4, 0); targetChild.position.set(0, -.43, 0);
  sourceFrame.updateMatrixWorld(true); targetFrame.updateMatrixWorld(true);
  const retarget = createRotationRetarget(sourceFrame, targetFrame, [{ source: sourceChild, target: targetChild }, { source: sourceParent, target: targetParent }]);
  return { sourceFrame, targetFrame, sourceParent, sourceChild, targetParent, targetChild, upper, retarget };
}
const local = (x: T.Object3D) => [...x.position.toArray(), ...x.quaternion.toArray(), ...x.scale.toArray()];
const angle = (a: T.Quaternion, b: T.Quaternion) => a.clone().normalize().angleTo(b.clone().normalize());

describe('rest-aware rotation transfer', () => {
  it('preserves a different target rest and applies inherited rotation once, independently of wrapper yaw', () => {
    const s = setup(), parentRest = s.targetParent.quaternion.clone(), childRest = s.targetChild.quaternion.clone(), upperRest = local(s.upper);
    s.retarget.apply(); expect(angle(s.targetParent.quaternion, parentRest)).toBeLessThan(1e-7);
    expect(angle(s.targetChild.quaternion, childRest)).toBeLessThan(1e-7);
    s.sourceParent.rotation.y = .7; s.sourceFrame.updateMatrixWorld(true); s.retarget.apply();
    const delta = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), .7);
    expect(angle(s.targetParent.quaternion, delta.clone().multiply(parentRest))).toBeLessThan(1e-7);
    expect(angle(s.targetChild.quaternion, childRest)).toBeLessThan(1e-7);
    expect(local(s.upper)).toEqual(upperRest); expect(s.targetChild.position.toArray()).toEqual([0, -.43, 0]);
    s.sourceFrame.rotation.set(.5, -.9, .2); s.targetFrame.rotation.set(-.1, 1.9, .3);
    s.sourceFrame.updateMatrixWorld(true); s.targetFrame.updateMatrixWorld(true); s.retarget.apply();
    expect(angle(s.targetParent.quaternion, delta.multiply(parentRest))).toBeLessThan(1e-7);
  });

  it('transfers independent child motion, repeats without accumulation and returns to target rest', () => {
    const s = setup(), parentRest = s.targetParent.quaternion.clone(), childRest = s.targetChild.quaternion.clone();
    s.sourceChild.rotation.x = .8; s.sourceFrame.updateMatrixWorld(true); s.retarget.apply();
    const expectedWorld = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), .5).multiply(parentRest.clone().multiply(childRest));
    const actualModel = s.targetFrame.getWorldQuaternion(new T.Quaternion()).invert().multiply(s.targetChild.getWorldQuaternion(new T.Quaternion()));
    expect(angle(actualModel, expectedWorld)).toBeLessThan(1e-7);
    const once = local(s.targetChild); s.retarget.apply(); expect(local(s.targetChild)).toEqual(once);
    s.sourceChild.rotation.x = .3; s.sourceFrame.updateMatrixWorld(true); s.retarget.apply();
    expect(angle(s.targetParent.quaternion, parentRest)).toBeLessThan(1e-7); expect(angle(s.targetChild.quaternion, childRest)).toBeLessThan(1e-7);
  });

  it('refuses a bad later source rotation atomically and detects changed hierarchy', () => {
    const s = setup(), before = [local(s.targetParent), local(s.targetChild)];
    s.sourceParent.rotation.y = .7; s.sourceChild.quaternion.set(NaN, 0, 0, 1);
    expect(() => s.retarget.apply()).toThrow(/rotation|transform/i);
    expect([local(s.targetParent), local(s.targetChild)]).toEqual(before);
    s.sourceChild.quaternion.identity(); s.targetFrame.add(s.targetChild);
    expect(() => s.retarget.apply()).toThrow(/parent|hierarchy/i);
    expect([local(s.targetParent), local(s.targetChild)]).toEqual(before);
  });

  it('rejects duplicate targets, foreign bones and unmapped gaps below a mapped ancestor', () => {
    const s = setup();
    expect(() => createRotationRetarget(s.sourceFrame, s.targetFrame, [{ source: s.sourceParent, target: s.targetParent }, { source: s.sourceChild, target: s.targetParent }])).toThrow(/duplicate/i);
    expect(() => createRotationRetarget(s.sourceFrame, s.targetFrame, [{ source: new T.Bone(), target: s.targetParent }])).toThrow(/frame|hierarchy/i);
    const gap = new T.Bone(); s.targetParent.add(gap); gap.add(s.targetChild);
    expect(() => createRotationRetarget(s.sourceFrame, s.targetFrame, [{ source: s.sourceParent, target: s.targetParent }, { source: s.sourceChild, target: s.targetChild }])).toThrow(/gap|hierarchy/i);
  });
});
