import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createTacticalActor } from './tactical-actor';
import { createMatch, type Actor, type Match, type WeaponId } from './engine';

// Production soldier rig + baked gait; weapons are light stand-ins (the held
// weapon is chest-mounted and does not participate in the leg solution).
let soldier: T.Group;
const weapons = new Map<WeaponId, T.Group>();
beforeAll(async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const buf = readFileSync('public/assets/games/cs/soldier.glb');
  soldier = (await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '')).scene;
  warn.mockRestore();
  for (const name of ['pistol', 'smg', 'rifle', 'sniper'] as WeaponId[]) weapons.set(name, new T.Group());
});

const world = (c: ReturnType<typeof createTacticalActor>, name: string) => { c.model.updateMatrixWorld(true); return c.model.getObjectByName(name)!.getWorldPosition(new T.Vector3()); };
const worldQ = (c: ReturnType<typeof createTacticalActor>, name: string) => c.model.getObjectByName(name)!.getWorldQuaternion(new T.Quaternion());
const setup = () => {
  const c = createTacticalActor(soldier, weapons), m = createMatch('attack'), p = m.actors[1];
  m.phase = 'live'; p.weapon = 'rifle'; p.x = 3; p.z = 5; p.yaw = .7;
  c.model.position.set(p.x, p.y, p.z); c.model.rotation.set(0, p.yaw, 0);
  return { c, m, p };
};
const lowestSkin = (c: ReturnType<typeof createTacticalActor>) => {
  c.model.updateMatrixWorld(true);
  let lowest = Infinity; const v = new T.Vector3();
  c.model.traverse(n => {
    if (!(n instanceof T.SkinnedMesh)) return;
    n.skeleton.update();
    for (let i = 0; i < n.geometry.attributes.position.count; i += 3) { n.getVertexPosition(i, v); v.applyMatrix4(n.matrixWorld); lowest = Math.min(lowest, v.y); }
  });
  return lowest;
};
const walk = (c: ReturnType<typeof createTacticalActor>, m: Match, p: Actor, crouch: number, frames: number, skin: number[] = []) => {
  const feet: number[] = [];
  for (let i = 0; i < frames; i++) {
    m.time += 1 / 60; p.z -= 1.6 / 60; p.crouch = crouch;
    c.model.position.set(p.x, p.y, p.z); c.update(p, m, 0);
    feet.push(...['foot_l', 'foot_r', 'ball_l', 'ball_r'].map(n => world(c, n).y));
    if (i % 6 === 0) skin.push(lowestSkin(c));
  }
  return feet;
};

describe('procedural third-person crouch on the production rig', () => {
  it('lowers pelvis and head about as much as the engine hit volumes while feet stay planted', () => {
    const { c, m, p } = setup();
    p.crouch = 0; c.update(p, m, 0);
    const stand = Object.fromEntries(['pelvis', 'head', 'foot_l', 'foot_r', 'ball_l', 'ball_r', 'calf_l', 'thigh_l'].map(n => [n, world(c, n)]));
    const standFootQ = ['foot_l', 'foot_r'].map(n => worldQ(c, n)), standChestQ = worldQ(c, 'spine_03');
    p.crouch = 1; c.update(p, m, 0);
    expect(stand.pelvis.y - world(c, 'pelvis').y).toBeGreaterThan(.28);
    const headDrop = stand.head.y - world(c, 'head').y;
    expect(headDrop).toBeGreaterThan(.32); expect(headDrop).toBeLessThan(.52);
    for (const n of ['foot_l', 'foot_r', 'ball_l', 'ball_r']) expect(world(c, n).distanceTo(stand[n])).toBeLessThan(.01);
    ['foot_l', 'foot_r'].forEach((n, i) => expect(worldQ(c, n).angleTo(standFootQ[i])).toBeLessThan(.01));
    // The weapon is chest-mounted: torso lean is counter-rotated so aim is kept.
    expect(worldQ(c, 'spine_03').angleTo(standChestQ)).toBeLessThan(.01);
    // Knees bend toward the actor's facing (-Z rotated by yaw), not backwards.
    const forward = new T.Vector3(0, 0, -1).applyAxisAngle(new T.Vector3(0, 1, 0), p.yaw);
    expect(world(c, 'calf_l').clone().sub(world(c, 'thigh_l')).dot(forward)).toBeGreaterThan(.15);
    expect(lowestSkin(c)).toBeGreaterThan(-.03);
  });
  it('blends with the crouch amount and restores the exact standing pose without accumulating', () => {
    const { c, m, p } = setup();
    p.crouch = 0; c.update(p, m, 0);
    const names = ['pelvis', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'spine_01', 'spine_03', 'head'];
    const base = names.map(n => world(c, n));
    p.crouch = .5; c.update(p, m, 0); const half = base[0].y - world(c, 'pelvis').y;
    p.crouch = 1; for (let i = 0; i < 20; i++) c.update(p, m, 0); const full = base[0].y - world(c, 'pelvis').y;
    expect(half).toBeGreaterThan(full * .4); expect(half).toBeLessThan(full * .6);
    p.crouch = 0; c.update(p, m, 0);
    names.forEach((n, i) => expect(world(c, n).distanceTo(base[i])).toBeLessThan(1e-6));
  });
  it('keeps the gait foot path while walking crouched, so soles neither sink nor float', () => {
    const a = setup(), b = setup();
    a.c.update(a.p, a.m, 0); b.c.update(b.p, b.m, 0);
    const skin: number[] = [], standing = walk(a.c, a.m, a.p, 0, 90), crouched = walk(b.c, b.m, b.p, 1, 90, skin);
    crouched.forEach((y, i) => expect(Math.abs(y - standing[i])).toBeLessThan(.012));
    // Includes the trailing knee at full stride: no part of the mesh dips into the floor.
    expect(Math.min(...skin)).toBeGreaterThan(-.03);
  });
});
