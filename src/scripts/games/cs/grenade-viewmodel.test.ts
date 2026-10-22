import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMatch } from './engine';
import { THROW } from './grenades';
import { GrenadeViewmodel } from './grenade-viewmodel';

function pistolSource() {
  const root = new THREE.Group();
  const gun = new THREE.Group(); gun.name = 'pistol';
  const body = new THREE.Mesh(new THREE.BoxGeometry(.03, .1, .15), new THREE.MeshStandardMaterial()); body.name = '3DModelsCC0_pistol_Body'; gun.add(body);
  const hands = new THREE.Group(); hands.name = 'view_hands';
  const bone = new THREE.Bone(); bone.name = 'fps_hand_R'; bone.position.set(.02, -.05, .1); hands.add(bone);
  const grip = new THREE.Object3D(); grip.name = 'right_grip'; grip.position.set(.012, .042, .02);
  const skin = new THREE.SkinnedMesh(new THREE.BoxGeometry(.05, .05, .05), new THREE.MeshStandardMaterial()); skin.name = 'trigger_hand';
  skin.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(skin.geometry.attributes.position.count * 4).fill(0), 4));
  skin.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(skin.geometry.attributes.position.count * 4).fill(0).map((_, i) => i % 4 === 0 ? 1 : 0), 4));
  root.add(gun, hands, grip, skin); skin.bind(new THREE.Skeleton([bone]));
  return root;
}
function grenadeSource() {
  const root = new THREE.Group();
  for (const name of ['he_grenade', 'flashbang', 'smoke_grenade']) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .1), new THREE.MeshStandardMaterial()); body.name = name;
    const pin = new THREE.Mesh(new THREE.TorusGeometry(.01, .002), new THREE.MeshStandardMaterial()); pin.name = `${name}_pin`; body.add(pin);
    root.add(body);
  }
  return root;
}
const shown = (vm: GrenadeViewmodel, name: string) => { const node = vm.root.getObjectByName(name)!; let v = node.visible; node.traverseAncestors(a => { v &&= a.visible; }); return v; };

describe('first-person grenade viewmodel', () => {
  it('reuses the licensed FPS arm rig, hides the pistol and holds the grenade in the right hand bone', () => {
    const vm = new GrenadeViewmodel(pistolSource(), grenadeSource());
    expect(shown(vm, '3DModelsCC0_pistol_Body')).toBe(false);
    let handHolds = false; vm.root.getObjectByName('fps_hand_R')!.traverse(o => { if (o.name === 'he_grenade') handHolds = true; });
    expect(handHolds).toBe(true);
    const grip = new THREE.Vector3(), held = new THREE.Vector3();
    vm.root.updateMatrixWorld(true);
    vm.root.getObjectByName('right_grip')!.getWorldPosition(grip); vm.root.getObjectByName('he_grenade')!.getWorldPosition(held);
    expect(held.distanceTo(grip)).toBeLessThan(.08);
    vm.dispose();
  });
  it('shows only the drawn grenade type, pulls its pin while primed and lets go on release', () => {
    const vm = new GrenadeViewmodel(pistolSource(), grenadeSource()), p = createMatch('attack').actors[0];
    vm.update(p, 1); expect(vm.root.visible).toBe(false);
    p.grenades.flash = 1; p.held = 'flash'; p.heldAt = 1;
    vm.update(p, 1.5);
    expect(vm.root.visible).toBe(true);
    expect(shown(vm, 'flashbang')).toBe(true); expect(shown(vm, 'he_grenade')).toBe(false);
    expect(shown(vm, 'flashbang_pin')).toBe(true);
    p.primedAt = 1.5; vm.update(p, 1.5 + THROW.pin);
    expect(shown(vm, 'flashbang_pin')).toBe(false);
    p.thrownAt = 2; p.primedAt = -1; vm.update(p, 2.05);
    expect(vm.root.visible).toBe(true); expect(shown(vm, 'flashbang')).toBe(false);
    expect(shown(vm, 'trigger_hand')).toBe(true);
    vm.dispose();
  });
  it('prime() shows every held model and both hands for shader warm-up', () => {
    const vm = new GrenadeViewmodel(pistolSource(), grenadeSource());
    vm.prime();
    for (const name of ['he_grenade', 'flashbang', 'smoke_grenade', 'trigger_hand']) expect(shown(vm, name)).toBe(true);
    vm.dispose();
  });
});
