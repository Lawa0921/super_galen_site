import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { syncTeamColor, resultReason, equipActorModel, formatClock, frameSeconds, cloneActorModel, animateActorLegs, animateActorAim, isScopeActive } from './presentation';

describe('match presentation', () => {
  it('uses an unobstructed optical view only while aiming a live sniper', () => {
    expect(isScopeActive('sniper', true, 100, 'live')).toBe(true);
    expect(isScopeActive('rifle', true, 100, 'live')).toBe(false);
    expect(isScopeActive('sniper', false, 100, 'live')).toBe(false);
  });
  it('removes the scope on death or when leaving the live round', () => {
    expect(isScopeActive('sniper', true, 0, 'live')).toBe(false);
    for (const phase of ['buy', 'round-over', 'match-over']) expect(isScopeActive('sniper', true, 100, phase)).toBe(false);
  });
  it('shows the weapon during a sniper reload, then restores a held aim after reloading', () => {
    expect(isScopeActive('sniper', true, 100, 'live', 1.5)).toBe(false);
    expect(isScopeActive('sniper', true, 100, 'live', 0)).toBe(true);
  });
  it('keeps single-material actor meshes drawable when their geometry has no material groups', () => {
    const source = new THREE.Group(), geometry = new THREE.BufferGeometry();
    const original = new THREE.MeshStandardMaterial();
    source.add(new THREE.Mesh(geometry, original));
    const mesh = cloneActorModel(source).children[0] as THREE.Mesh;
    expect(mesh.geometry.groups).toHaveLength(0);
    expect(Array.isArray(mesh.material)).toBe(false);
    expect(mesh.material).not.toBe(original);
    expect((source.children[0] as THREE.Mesh).material).toBe(original);
  });
  it('also preserves material arrays for geometry authored with multiple materials', () => {
    const source = new THREE.Group(), materials = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
    source.add(new THREE.Mesh(new THREE.BoxGeometry(), materials));
    const mesh = cloneActorModel(source).children[0] as THREE.Mesh;
    expect(Array.isArray(mesh.material)).toBe(true);
    expect(mesh.material).toHaveLength(2);
    expect((mesh.material as THREE.Material[])[0]).not.toBe(materials[0]);
  });
  it('keeps imported leg rest rotations at idle and after repeated walking updates', () => {
    const model = new THREE.Group(), leg = new THREE.Group();
    leg.name = 'left_leg'; leg.rotation.x = Math.PI / 2; model.add(leg);
    animateActorLegs(model, 0, false); expect(leg.rotation.x).toBeCloseTo(Math.PI / 2);
    animateActorLegs(model, .1, true); const walking = leg.rotation.x;
    expect(walking).not.toBeCloseTo(Math.PI / 2);
    animateActorLegs(model, .1, true); expect(leg.rotation.x).toBeCloseTo(walking);
    animateActorLegs(model, .2, false); expect(leg.rotation.x).toBeCloseTo(Math.PI / 2);
  });
  it('preserves imported arm transforms at rest, then turns both arms with the weapon around their shoulders', () => {
    const actor = new THREE.Group(), imported = new THREE.Group(), source = new THREE.Group();
    imported.rotation.x = Math.PI / 2; actor.add(imported);
    const arms = ['left', 'right'].map(name => { const arm = new THREE.Group(); arm.name = `${name}_arm`; imported.add(arm); return arm; });
    actor.updateMatrixWorld(true); const rest = arms.map(arm => arm.matrixWorld.clone());
    equipActorModel(actor, source, 'rifle'); animateActorAim(actor, 0); actor.updateMatrixWorld(true);
    arms.forEach((arm, i) => expect(arm.matrixWorld.elements).toEqual(rest[i].elements));
    const markers = arms.map((arm, i) => arm.worldToLocal(new THREE.Vector3(i ? .225 : -.225, 1.447, .012)));
    const gun = actor.getObjectByName('held-weapon')!;
    const grip = arms.map(arm => gun.matrixWorld.clone().invert().multiply(arm.matrixWorld));
    animateActorAim(actor, .4); actor.updateMatrixWorld(true);
    arms.forEach((arm, i) => {
      expect(arm.localToWorld(markers[i].clone()).distanceTo(new THREE.Vector3(i ? .225 : -.225, 1.447, .012))).toBeLessThan(1e-12);
      const relative = gun.matrixWorld.clone().invert().multiply(arm.matrixWorld);
      relative.elements.forEach((value, j) => expect(value).toBeCloseTo(grip[i].elements[j], 12));
    });
    expect(new THREE.Vector3(0, 0, -1).transformDirection(gun.matrixWorld).y).toBeCloseTo(Math.sin(.4));
    animateActorAim(actor, 0); actor.updateMatrixWorld(true);
    arms.forEach((arm, i) => arm.matrixWorld.elements.forEach((value, j) => expect(value).toBeCloseTo(rest[i].elements[j], 12)));
  });
  it('limits the head tilt and safely restores idle after an invalid aim without accumulating transforms', () => {
    const actor = new THREE.Group(), head = new THREE.Group(); head.name = 'head'; actor.add(head);
    animateActorAim(actor, 1.5); actor.updateMatrixWorld(true);
    expect(new THREE.Vector3(0, 0, -1).transformDirection(head.matrixWorld).y).toBeCloseTo(Math.sin(.65));
    for (let i = 0; i < 20; i++) animateActorAim(actor, .25);
    actor.updateMatrixWorld(true);
    expect(new THREE.Vector3(0, 0, -1).transformDirection(head.matrixWorld).y).toBeCloseTo(Math.sin(.25));
    animateActorAim(actor, Number.NaN); actor.updateMatrixWorld(true);
    expect(head.matrixWorld.elements).toEqual(new THREE.Matrix4().elements);
  });
  it('reacts above the hips while feet stay planted and the weapon remains in both hands', () => {
    const actor = new THREE.Group(), imported = new THREE.Group(), source = new THREE.Group();
    imported.rotation.x = Math.PI / 2; actor.add(imported);
    const parts = ['left_leg', 'right_leg', 'left_arm', 'right_arm', 'head', 'chest'].map(name => {
      const part = new THREE.Group(); part.name = name; imported.add(part); return part;
    });
    parts[0].position.set(-.104, .016, -1.02); parts[1].position.set(.104, .016, -1.02);
    parts[5].position.set(0, 0, -1.3);
    actor.position.set(4, .3, -8); actor.rotation.y = .8;
    equipActorModel(actor, source, 'rifle'); animateActorAim(actor, .3, 0); actor.updateMatrixWorld(true);
    const feet = parts.slice(0, 2).map(part => part.matrixWorld.clone());
    const chest = parts[5].getWorldPosition(new THREE.Vector3());
    const gun = actor.getObjectByName('held-weapon')!;
    const grips = parts.slice(2, 4).map(arm => gun.matrixWorld.clone().invert().multiply(arm.matrixWorld));
    const idleGun = gun.matrixWorld.clone();
    animateActorAim(actor, .3, 1); actor.updateMatrixWorld(true);
    expect(parts[5].getWorldPosition(new THREE.Vector3()).distanceTo(chest)).toBeGreaterThan(.015);
    parts.slice(0, 2).forEach((leg, i) => leg.matrixWorld.elements.forEach((v, j) => expect(v).toBeCloseTo(feet[i].elements[j], 12)));
    parts.slice(2, 4).forEach((arm, i) => {
      const grip = gun.matrixWorld.clone().invert().multiply(arm.matrixWorld);
      grip.elements.forEach((v, j) => expect(v).toBeCloseTo(grips[i].elements[j], 12));
    });
    const hitGun = gun.matrixWorld.clone();
    for (let i = 0; i < 30; i++) animateActorAim(actor, .3, 1);
    actor.updateMatrixWorld(true); expect(gun.matrixWorld.elements).toEqual(hitGun.elements);
    equipActorModel(actor, source, 'smg'); animateActorAim(actor, .3, 0); actor.updateMatrixWorld(true);
    // Weapon-specific scale differs, but its grip origin must return to the same location.
    expect(actor.getObjectByName('held-weapon')!.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3().setFromMatrixPosition(idleGun))).toBeLessThan(1e-12);
    expect(parts[5].getWorldPosition(new THREE.Vector3()).distanceTo(chest)).toBeLessThan(1e-12);
  });
  it('bounds hit reactions and restores the resting pose for invalid or expired strength', () => {
    const actor = new THREE.Group(), chest = new THREE.Group(); chest.position.y = 1.4; actor.add(chest);
    animateActorAim(actor, 0, 1); actor.updateMatrixWorld(true); const maximum = chest.matrixWorld.clone();
    expect(chest.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(.015);
    animateActorAim(actor, 0, 10); actor.updateMatrixWorld(true); expect(chest.matrixWorld.elements).toEqual(maximum.elements);
    for (const strength of [0, -.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      animateActorAim(actor, 0, strength); actor.updateMatrixWorld(true);
      expect(chest.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(0, 1.4, 0))).toBeLessThan(1e-12);
    }
  });
  it('preserves elapsed time at ordinary and low frame rates so movement and reload do not slow down', () => {
    expect(frameSeconds(16)).toBe(.016);
    expect(Array.from({ length: 10 }, () => frameSeconds(100)).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it('bounds a stalled frame and rejects negative frame durations', () => {
    expect(frameSeconds(3000)).toBe(.25);
    expect(frameSeconds(-20)).toBe(0);
  });
  it('rounds countdown seconds before splitting minutes, including the minute boundary', () => {
    expect(formatClock(100)).toBe('01:40');
    expect(formatClock(59.1)).toBe('01:00');
    expect(formatClock(60.1)).toBe('01:01');
    expect(formatClock(-.1)).toBe('00:00');
  });
  it('recolors reused actors when a new match swaps teams without recoloring gear', () => {
    const group = new THREE.Group(), uniform = new THREE.MeshStandardMaterial({ color: 0xffffff }), gear = new THREE.MeshStandardMaterial({ color: 0x111111 });
    uniform.name = 'team_color'; gear.name = 'gear';
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), [uniform, gear]));
    syncTeamColor(group, 'attack'); const attackColor = uniform.color.getHex();
    syncTeamColor(group, 'defend'); expect(uniform.color.getHex()).not.toBe(attackColor);
    expect(gear.color.getHex()).toBe(0x111111);
    const defendColor = uniform.color.getHex(); syncTeamColor(group, 'defend'); expect(uniform.color.getHex()).toBe(defendColor);
  });
  it('limits team identification to authored patches and preserves the helmet and cloth palette', () => {
    const source = new THREE.Group();
    const names = ['team_color', 'team_helmet_shell', 'combat_team_uniform', 'combat_webbing'];
    const materials = names.map((name, i) => {
      const material = new THREE.MeshStandardMaterial({ color: [0xaaaaaa, 0x666d42, 0x546043, 0x323d27][i], roughness: .82 });
      material.name = name; return material;
    });
    source.add(new THREE.Mesh(new THREE.BufferGeometry(), materials));
    const before = materials.map(m => m.color.toArray());
    const first = cloneActorModel(source), second = cloneActorModel(source);
    const firstMaterials = (first.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial[];
    const secondMaterials = (second.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial[];
    syncTeamColor(first, 'attack'); syncTeamColor(second, 'defend');
    expect(firstMaterials[0].color.toArray()).not.toEqual(secondMaterials[0].color.toArray());
    for (const actor of [first, second]) {
      for (const team of ['defend', 'attack', 'attack'] as const) {
        syncTeamColor(actor, team);
        const clones = (actor.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial[];
        expect(clones.slice(1).map(m => m.color.toArray())).toEqual(before.slice(1));
        expect(clones.map(m => m.roughness)).toEqual(materials.map(m => m.roughness));
      }
    }
    expect(materials.map(m => m.color.toArray())).toEqual(before);
  });
  it('distinguishes our team being eliminated from the opposing team being eliminated', () => {
    expect(resultReason('eliminated', false)).toContain('我方');
    expect(resultReason('eliminated', true)).toContain('對方');
    expect(resultReason('defused', false)).toContain('拆除');
  });
  it('changes identification patches without painting the entire tactical uniform in team colors', () => {
    const group = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: 0x45483b }); cloth.name = 'uniform_olive';
    const patch = new THREE.MeshStandardMaterial({ color: 0xffffff }); patch.name = 'team_color';
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), [cloth, patch]));
    syncTeamColor(group, 'attack');
    expect(cloth.color.getHex()).toBe(0x45483b);
    const firstPatch = patch.color.getHex();
    syncTeamColor(group, 'defend');
    expect(cloth.color.getHex()).toBe(0x45483b);
    expect(patch.color.getHex()).not.toBe(firstPatch);
  });
  it('shows the selected weapon on an actor without first-person extra hands or mutating source materials', () => {
    const actor = new THREE.Group(), source = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    const body = new THREE.Mesh(new THREE.BoxGeometry(), material); body.name = 'receiver';
    const hands = new THREE.Mesh(new THREE.BoxGeometry(), material); hands.name = 'rifle_view_hands'; source.add(body, hands);
    equipActorModel(actor, source, 'rifle');
    expect(actor.getObjectByName('held-weapon')).toBeDefined();
    expect(actor.getObjectByName('rifle_view_hands')?.visible).toBe(false);
    expect((actor.getObjectByName('receiver') as THREE.Mesh).material).not.toBe(material);
    expect(hands.visible).toBe(true);
    equipActorModel(actor, source, 'smg');
    const held: THREE.Object3D[] = []; actor.traverse(c => { if (c.name === 'held-weapon') held.push(c); });
    expect(held).toHaveLength(1);
    expect(actor.userData.weapon).toBe('smg');
  });
});
