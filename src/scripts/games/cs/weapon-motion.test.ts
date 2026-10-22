import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMatch, WEAPONS, type WeaponId } from './engine';
import { reloadPose, WeaponMotion, WeaponRig } from './weapon-motion';

describe('first-person weapon motion', () => {
  it('uses each weapon reload duration and returns every part to rest at both ends', () => {
    for (const weapon of Object.keys(WEAPONS) as WeaponId[]) {
      const duration = WEAPONS[weapon].reload;
      expect(reloadPose(weapon, duration)).toMatchObject({ progress: 0, lower: 0, magazineDrop: 0, magazineVisible: true });
      expect(reloadPose(weapon, duration * .65).progress).toBeCloseTo(.35);
      expect(reloadPose(weapon, duration * .65).magazineDrop).toBeGreaterThan(.1);
      expect(reloadPose(weapon, 0)).toMatchObject({ lower: 0, magazineDrop: 0, magazineVisible: true, supportReach: 0, chamber: 0 });
      expect(reloadPose(weapon, -1).lower).toBe(0);
      expect(reloadPose(weapon, duration + 10).lower).toBe(0);
    }
  });
  it('hides the removed magazine before replacement, then chambers only after insertion', () => {
    const duration = WEAPONS.rifle.reload;
    const at = (progress: number) => reloadPose('rifle', duration * (1 - progress));
    expect(at(.47).magazineVisible).toBe(false);
    expect(at(.65).magazineVisible).toBe(true);
    expect(at(.65).magazineDrop).toBeGreaterThan(0);
    expect(at(.85).magazineDrop).toBe(0);
    expect(at(.85).chamber).toBeGreaterThan(.9);
    expect(at(.65).chamber).toBe(0);
  });
  it('blends ADS over time without frame-rate-dependent endpoint error and freezes on pause', () => {
    const p = createMatch('attack').actors[0]; p.weapon = 'rifle';
    const a = new WeaponMotion(), b = new WeaponMotion();
    a.update(p, .01, .01, true, false);
    expect(a.aim).toBeGreaterThan(0); expect(a.aim).toBeLessThan(1);
    for (let i = 1; i < 30; i++) a.update(p, (i + 1) / 100, .01, true, false);
    for (let i = 0; i < 6; i++) b.update(p, (i + 1) * .05, .05, true, false);
    expect(a.aim).toBeCloseTo(b.aim, 10);
    const before = { ...a.offset }, aim = a.aim;
    p.moving = true; p.yaw = 1;
    a.update(p, 4, 0, false, false);
    expect(a.offset).toEqual(before); expect(a.aim).toBe(aim);
  });
  it('suppresses decorative sway with reduced motion and settles after movement stops', () => {
    const p = createMatch('attack').actors[0]; const motion = new WeaponMotion();
    p.moving = true;
    for (let i = 0; i < 60; i++) { p.yaw += .01; motion.update(p, i / 60, 1 / 60, false, false); }
    expect(Math.abs(motion.offset.x) + Math.abs(motion.offset.y)).toBeGreaterThan(.002);
    motion.update(p, 1, 1 / 60, false, true);
    expect(motion.offset).toEqual({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 });
    p.moving = false;
    for (let i = 0; i < 180; i++) motion.update(p, 1 + i / 60, 1 / 60, false, false);
    expect(Math.abs(motion.offset.x)).toBeLessThan(.002);
    expect(Math.abs(motion.offset.y)).toBeLessThan(.002);
  });
  it('leaves ADS during reload and fully resets motion for a new weapon or round', () => {
    const p = createMatch('attack').actors[0]; const motion = new WeaponMotion();
    motion.update(p, 1, .25, true, false); expect(motion.aim).toBeGreaterThan(.9);
    p.reload = WEAPONS.pistol.reload;
    motion.update(p, 1.25, .25, true, false); expect(motion.aim).toBeLessThan(.1);
    motion.reset();
    expect(motion.aim).toBe(0); expect(motion.offset.x).toBe(0);
  });
  it('cancels frozen reload and walking poses when the round ends even with a zero frame delta', () => {
    const p = createMatch('attack').actors[0], motion = new WeaponMotion();
    p.reload = WEAPONS.pistol.reload * .53; p.moving = true;
    motion.update(p, 1, .1, false, false);
    expect(motion.reload.magazineVisible).toBe(false); expect(motion.reload.lower).toBeGreaterThan(.9);
    motion.update(p, 1, 0, true, false, false);
    expect(motion.reload).toMatchObject({ lower: 0, magazineDrop: 0, magazineVisible: true, supportReach: 0, chamber: 0 });
    expect(motion.aim).toBe(0);
    expect(motion.offset).toEqual({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 });
    p.reload = 0; p.moving = false;
    motion.update(p, 2, 1 / 60, false, true, true);
    expect(motion.reload.lower).toBe(0);
  });
});

describe('imported weapon part animation', () => {
  it('samples authored skeletal reload at authoritative time without translating the hand mesh', () => {
    const root = new THREE.Group(), bone = new THREE.Bone(), hand = new THREE.Group();
    bone.name = 'fps_forearm_L'; hand.name = 'support_hand'; root.add(bone, hand);
    root.animations = [new THREE.AnimationClip('fps_reload', 1, [new THREE.QuaternionKeyframeTrack('fps_forearm_L.quaternion', [0, .5, 1], [0,0,0,1, 0,0,Math.sin(.4),Math.cos(.4), 0,0,0,1])])];
    const rig = new WeaponRig(root), pose = reloadPose('rifle', WEAPONS.rifle.reload * .5);
    rig.apply(pose, -1, 'rifle');
    expect(bone.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(.8);
    expect(hand.position.length()).toBe(0);
    for (let i=0;i<50;i++) rig.apply(pose, -1, 'rifle');
    expect(bone.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(.8);
    rig.reset(); expect(bone.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0);
    rig.apply(reloadPose('rifle', 0), -1, 'rifle');
    rig.apply(pose, -1, 'rifle');
    expect(bone.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(.8);
  });
  it('animates uniquely prefixed source parts and restores their original transforms', () => {
    const root = new THREE.Group(), magazine = new THREE.Group(), slide = new THREE.Group();
    magazine.name = '3DModelsCC0_pistol_Magazine'; slide.name = '3DModelsCC0_pistol_Slide';
    root.add(magazine, slide); const rig = new WeaponRig(root);
    rig.apply(reloadPose('pistol', WEAPONS.pistol.reload * .65), .02, 'pistol');
    expect(magazine.position.y).toBeLessThan(-.1); expect(slide.position.z).toBeGreaterThan(.02);
    rig.reset(); expect(magazine.position.length()).toBe(0); expect(slide.position.length()).toBe(0);
  });
  it('prefers the explicit part and leaves ambiguous imported suffixes untouched', () => {
    const root = new THREE.Group(), first = new THREE.Group(), second = new THREE.Group();
    first.name = 'one_Magazine'; second.name = 'two_Magazine'; root.add(first, second);
    const pose = reloadPose('pistol', WEAPONS.pistol.reload * .65);
    new WeaponRig(root).apply(pose, -1, 'pistol');
    expect(first.position.length()).toBe(0); expect(second.position.length()).toBe(0);
    const exact = new THREE.Group(); exact.name = 'Magazine'; root.add(exact);
    new WeaponRig(root).apply(pose, -1, 'pistol');
    expect(exact.position.y).toBeLessThan(-.1);
    expect(first.position.length()).toBe(0); expect(second.position.length()).toBe(0);
  });
  function fixture() {
    const root = new THREE.Group(), parent = new THREE.Group(), magazine = new THREE.Mesh(new THREE.BoxGeometry(.04, .15, .05));
    parent.rotation.z = Math.PI / 2; root.add(parent);
    magazine.name = 'Magazine'; magazine.position.set(.1, -.2, .03); parent.add(magazine);
    const hand = new THREE.Group(); hand.name = 'support_hand'; hand.position.set(-.1, -.1, -.3); root.add(hand);
    const slide = new THREE.Group(); slide.name = 'Slide'; slide.position.z = .08; root.add(slide);
    const rig = new WeaponRig(root);
    return { root, magazine, hand, slide, rig };
  }
  it('moves a magazine along weapon down even under rotated imported parents and never accumulates drift', () => {
    const { root, magazine, hand, rig } = fixture();
    const rest = magazine.position.clone(), handRest = hand.position.clone();
    root.updateMatrixWorld(true); const initial = magazine.getWorldPosition(new THREE.Vector3());
    const pose = reloadPose('pistol', WEAPONS.pistol.reload * .65);
    for (let i = 0; i < 300; i++) rig.apply(pose, -1, 'pistol');
    root.updateMatrixWorld(true); const current = magazine.getWorldPosition(new THREE.Vector3());
    expect(current.y).toBeLessThan(initial.y - .1);
    expect(current.x).toBeCloseTo(initial.x);
    expect(hand.position.distanceTo(handRest)).toBeGreaterThan(.1);
    rig.apply(reloadPose('pistol', 0), -1, 'pistol');
    expect(magazine.position.toArray()).toEqual(rest.toArray());
    expect(hand.position.toArray()).toEqual(handRest.toArray());
    expect(magazine.visible).toBe(true);
  });
  it('cycles a pistol slide after a shot and restores it without changing source geometry', () => {
    const { root, slide, rig } = fixture(); const nodes = root.children.length, rest = slide.position.clone();
    rig.apply(reloadPose('pistol', 0), .02, 'pistol'); expect(slide.position.z).toBeGreaterThan(rest.z);
    rig.apply(reloadPose('pistol', 0), 1, 'pistol'); expect(slide.position.toArray()).toEqual(rest.toArray());
    expect(root.children.length).toBe(nodes);
  });
  it('accepts older approved models with no optional parts and restores visibility after interruption', () => {
    expect(() => new WeaponRig(new THREE.Group()).apply(reloadPose('rifle', 1), .02, 'rifle')).not.toThrow();
    const { magazine, rig } = fixture();
    rig.apply(reloadPose('pistol', WEAPONS.pistol.reload * .53), -1, 'pistol'); expect(magazine.visible).toBe(false);
    rig.reset(); expect(magazine.visible).toBe(true);
  });
});
