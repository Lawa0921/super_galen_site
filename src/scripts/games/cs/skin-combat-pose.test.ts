import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { createSkinCombatPose, createSkinCombatMotion } from './skin-combat-pose';
import { compileSkinMotion } from './skin-motion';
import { createMatch } from './engine';

function setup(yaw = 0) {
  const actor = new T.Group(), visual = new T.Group(), model = new T.Group();
  actor.rotation.y = yaw; visual.rotation.y = Math.PI; actor.add(visual); visual.add(model);
  const bones = new Map<string, T.Bone>();
  function bone(name: string, parent: T.Object3D, y: number) { const b = new T.Bone(); b.name = name; b.position.y = y; parent.add(b); bones.set(name, b); return b; }
  const pelvis = bone('pelvis', model, .9), a = bone('spine_01', pelvis, .1), b = bone('spine_02', a, .1), c = bone('spine_03', b, .1);
  pelvis.rotation.set(.05, -.12, .03); a.rotation.set(.2, .1, -.04); b.rotation.set(-.1, .03, .08); c.rotation.set(.03, -.11, -.02);
  const foot = bone('foot_l', pelvis, -.9), hand = bone('hand_r', c, .2), gun = new T.Group(); c.add(gun); gun.position.set(.1,.15,.3);
  actor.updateMatrixWorld(true);
  return { actor, visual, bones, foot, hand, gun, chest: c, overlay: createSkinCombatPose({ actor, bones }) };
}
const q = (o: T.Object3D) => o.getWorldQuaternion(new T.Quaternion());

describe('skinned combat overlay', () => {
  it('composes accepted hit-only locomotion with pause, round reset and non-live poses without the rejected spine aim', () => {
    const s = setup(), bones = ['spine_01','spine_02','spine_03'], frames = Array.from({length:5},()=>({offset:[0,0,0],rotations:bones.map(name=>s.bones.get(name)!.quaternion.toArray())}));
    const data = compileSkinMotion({schema:'cs-cmu-target-cycles-v1',bones,clips:[{name:'walk',duration:1,distance:1,frames},{name:'run',duration:1,distance:2,frames}]});
    const controller = createSkinCombatMotion(s,data), match = createMatch('attack'), actor = match.actors[1];
    match.phase = 'live'; actor.pitch = .2; actor.recoilPitch = .03; const base = q(s.chest);
    controller.update(actor,match,0); const aimed = q(s.chest); expect(aimed.angleTo(base)).toBeLessThan(1e-7);
    for(let i=0;i<50;i++) controller.update(actor,match,0); expect(q(s.chest).angleTo(aimed)).toBeLessThan(1e-7);
    actor.pitch = -1.45; controller.update(actor,match,.8); expect(q(s.chest).angleTo(aimed)).toBeGreaterThan(.05); expect(q(s.chest).angleTo(aimed)).toBeLessThan(.15);
    actor.pitch = .2; controller.update(actor,match,0); expect(q(s.chest).angleTo(aimed)).toBeLessThan(1e-7);
    match.time += .05; actor.x += .1; controller.update(actor,match,.5); expect(controller.state.phase).toBeGreaterThan(0);
    match.round++; controller.update(actor,match,0); expect(controller.state.phase).toBe(0); expect(q(s.chest).angleTo(aimed)).toBeLessThan(1e-7);
    match.phase = 'buy'; controller.update(actor,match,1); expect(q(s.chest).angleTo(base)).toBeLessThan(1e-7);
    match.phase = 'live'; actor.hp = 0; controller.update(actor,match,1); expect(q(s.chest).angleTo(base)).toBeLessThan(1e-7);
  });
  it('reacts in the actor frame at arbitrary yaw, preserving held weapon and lower body', () => {
    for (const yaw of [0, Math.PI / 2, -2.2]) for (const impact of [.4,1]) {
      const s = setup(yaw), chest = q(s.chest), foot = s.foot.getWorldPosition(new T.Vector3()), hand = s.gun.worldToLocal(s.hand.getWorldPosition(new T.Vector3()));
      const actorQ=q(s.actor),delta=new T.Quaternion().setFromEuler(new T.Euler(impact*.10,0,impact*.035)),desired=actorQ.clone().multiply(delta).multiply(actorQ.clone().invert()).multiply(chest);
      s.overlay.apply(impact); s.actor.updateMatrixWorld(true);
      expect(q(s.chest).angleTo(desired)).toBeLessThan(1e-7);
      expect(s.foot.getWorldPosition(new T.Vector3()).distanceTo(foot)).toBeLessThan(1e-12);
      expect(s.gun.worldToLocal(s.hand.getWorldPosition(new T.Vector3())).distanceTo(hand)).toBeLessThan(1e-12);
    }
  });
  it('restores the exact locomotion base before a paused or fresh locomotion update, without drift', () => {
    const s = setup(), original = [...s.bones.values()].map(b => b.quaternion.toArray());
    s.overlay.apply(.7); const first = q(s.chest);
    for (let i = 0; i < 100; i++) { s.overlay.restore(); s.overlay.apply(.7); }
    expect(q(s.chest).angleTo(first)).toBeLessThan(1e-7);
    s.overlay.restore(); expect([...s.bones.values()].map(b => b.quaternion.toArray())).toEqual(original);
    s.chest.rotation.y += .17; const newBase = q(s.chest); s.overlay.apply(1); s.overlay.restore();
    expect(q(s.chest).angleTo(newBase)).toBeLessThan(1e-7);
    s.overlay.restore(); expect(q(s.chest).angleTo(newBase)).toBeLessThan(1e-7);
  });
  it('keeps hit response bounded and instance-local; zero inputs preserve every transform', () => {
    const s = setup(), other = setup(), rest = [...s.bones.values()].map(b => [...b.position.toArray(), ...b.quaternion.toArray(), ...b.scale.toArray()]);
    s.overlay.apply(0); expect([...s.bones.values()].map(b => [...b.position.toArray(), ...b.quaternion.toArray(), ...b.scale.toArray()])).toEqual(rest);
    s.overlay.restore(); const before = q(s.chest); s.overlay.apply(1);
    expect(q(s.chest).angleTo(before)).toBeGreaterThan(.05); expect(q(s.chest).angleTo(before)).toBeLessThan(.15);
    expect(q(other.chest).angleTo(before)).toBeLessThan(1e-7);
    s.overlay.restore(); s.overlay.apply(100); const bounded = q(s.chest); s.overlay.restore(); s.overlay.apply(1);
    expect(q(s.chest).angleTo(bounded)).toBeLessThan(1e-7);
  });
  it('rejects invalid values and a missing spine before mutating transforms', () => {
    const s = setup(), rest = q(s.chest); for (const input of [NaN,Infinity]) expect(() => s.overlay.apply(input)).toThrow();
    expect(q(s.chest).angleTo(rest)).toBeLessThan(1e-7);
    s.bones.delete('spine_02'); expect(() => createSkinCombatPose(s)).toThrow();
  });
});
