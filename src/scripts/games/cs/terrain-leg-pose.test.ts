import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createTacticalActor } from './tactical-actor';
import { createMatch, stepMatch, type WeaponId } from './engine';
import { groundHeight } from './elevation';
import { cloneModel } from './model-resources';
import { createTerrainLegPose } from './terrain-leg-pose';
import { createSkinCombatMotion } from './skin-combat-pose';
import { compileSkinMotion, type MotionBake } from './skin-motion';
import { TwoBoneIK } from './two-bone-ik';
import motionSource from './tactical-motion.json';

let soldier: T.Group;
const weapons = new Map<WeaponId, T.Group>();
beforeAll(async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const bytes = readFileSync('public/assets/games/cs/soldier.glb');
    soldier = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  } finally { warn.mockRestore(); }
  for (const id of ['pistol', 'smg', 'rifle', 'sniper'] as WeaponId[]) weapons.set(id, new T.Group());
});

function setup(north = true, crouching = false, yawOffset = 0) {
  const match = createMatch('attack'); match.phase = 'live'; match.timer = 100;
  const actor = match.actors[0]; Object.assign(actor, { x: 19, z: north ? 23 : 1, y: 0, yaw: (north ? 0 : Math.PI) + yawOffset });
  const rig = createTacticalActor(soldier, weapons);
  const shoes: T.SkinnedMesh[] = [];
  rig.model.traverse(node => {
    if (node instanceof T.SkinnedMesh && !Array.isArray(node.material) && node.material.name === 'Human.shoes04') shoes.push(node);
  });
  expect(shoes).toHaveLength(1);
  function pose(flinch = 0) {
    rig.model.position.set(actor.x, actor.y, actor.z); rig.model.rotation.set(0, actor.yaw, 0);
    rig.update(actor, match, flinch); rig.model.updateMatrixWorld(true);
  }
  function step() { stepMatch(match, { 0: { forward: 1, yaw: actor.yaw, crouch: crouching } }, 1 / 60); pose(); }
  return { match, actor, rig, shoe: shoes[0], pose, step };
}
const skinGap = (shoe: T.SkinnedMesh) => {
  shoe.skeleton.update(); let gap = Infinity; const vertex = new T.Vector3();
  for (let i = 0; i < shoe.geometry.attributes.position.count; i++) {
    shoe.getVertexPosition(i, vertex); vertex.applyMatrix4(shoe.matrixWorld);
    gap = Math.min(gap, vertex.y - groundHeight(vertex.x, vertex.z));
  }
  return gap;
};
const bonePose = (model: T.Object3D) => {
  const result: number[] = [];
  model.traverse(node => { if (node instanceof T.Bone) result.push(...node.position.toArray(), ...node.quaternion.toArray()); });
  return result;
};
const expectSame = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length);
  expect(Math.max(...a.map((n, i) => Math.abs(n - b[i])))).toBeLessThan(1e-8);
};

// Exercise the overlay against the production gait before it has been corrected.
function uncorrectedStair() {
  const match = createMatch('attack'); match.phase = 'live'; match.timer = 100;
  const actor = match.actors[0]; Object.assign(actor, { x: 19, y: 0, z: 23, yaw: 0 });
  const model = new T.Group(), visual = cloneModel(soldier); model.add(visual);
  const bones = new Map<string, T.Bone>(); let shoe!: T.SkinnedMesh;
  visual.traverse(node => {
    if (node instanceof T.Bone) bones.set(node.name, node);
    if (node instanceof T.SkinnedMesh && !Array.isArray(node.material) && node.material.name === 'Human.shoes04') shoe = node;
  });
  const rig = { actor: model, visual, bones };
  const layer = createTerrainLegPose(rig)!;
  const motion = createSkinCombatMotion(rig, compileSkinMotion(motionSource as MotionBake));
  for (let frame = 0; frame <= 72; frame++) {
    stepMatch(match, { 0: { forward: 1, yaw: actor.yaw } }, 1 / 60);
    model.position.set(actor.x, actor.y, actor.z); motion.update(actor, match, 0);
  }
  model.updateMatrixWorld(true);
  return { actor, match, model, bones, shoe, layer };
}

describe('terrain overlay boundaries', () => {
  it('does no skin sampling or pose work away from a higher tread', () => {
    const state = uncorrectedStair(); Object.assign(state.actor, { x: 0, y: 0, z: 40 });
    state.model.position.set(0, 0, 40); const before = bonePose(state.model);
    const sample = vi.spyOn(state.shoe, 'getVertexPosition');
    state.layer.apply(state.actor, state.match);
    expectSame(bonePose(state.model), before); expect(sample).not.toHaveBeenCalled(); sample.mockRestore();
  });

  it.each(['airborne', 'unsupported', 'dead', 'non-live'] as const)('skips %s actors and restores a previous correction', kind => {
    const state = uncorrectedStair(), before = bonePose(state.model);
    state.layer.apply(state.actor, state.match);
    expect(bonePose(state.model)).not.toEqual(before);
    if (kind === 'airborne') state.actor.vy = 1;
    if (kind === 'unsupported') state.actor.y += .1;
    if (kind === 'dead') state.actor.hp = 0;
    if (kind === 'non-live') state.match.phase = 'buy';
    const sample = vi.spyOn(state.shoe, 'getVertexPosition');
    state.layer.apply(state.actor, state.match);
    expectSame(bonePose(state.model), before); expect(sample).not.toHaveBeenCalled(); sample.mockRestore();
  });

  it('rejects an unreachable target before solving and restores a failed solve atomically', () => {
    const state = uncorrectedStair(), before = bonePose(state.model);
    const preflight = vi.spyOn(TwoBoneIK.prototype, 'canSolveMount').mockReturnValue(false);
    const solve = vi.spyOn(TwoBoneIK.prototype, 'solve');
    try {
      state.layer.apply(state.actor, state.match);
      expect(preflight).toHaveBeenCalled(); expect(solve).not.toHaveBeenCalled();
      expectSame(bonePose(state.model), before);
      preflight.mockRestore();
      solve.mockImplementation(function (this: TwoBoneIK) {
        this.upper.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), .9);
        this.lower.quaternion.identity(); this.end.quaternion.identity(); return false;
      });
      state.layer.apply(state.actor, state.match);
      expect(solve).toHaveBeenCalled(); expectSame(bonePose(state.model), before);
    } finally { preflight.mockRestore(); solve.mockRestore(); }
  });

  it('preserves foot orientation, toe articulation and chain lengths, with a forward knee', () => {
    const state = uncorrectedStair();
    const feet = ['l', 'r'].map(side => {
      const names = [`thigh_${side}`, `calf_${side}`, `foot_${side}`, `ball_${side}`];
      const bones = names.map(name => state.bones.get(name)!);
      return { bones, orientation: bones[2].getWorldQuaternion(new T.Quaternion()).normalize(),
        toe: bones[3].quaternion.clone(), lengths: bones.map(b => b.position.length()) };
    });
    const sample = vi.spyOn(state.shoe, 'getVertexPosition');
    state.layer.apply(state.actor, state.match); state.model.updateMatrixWorld(true);
    // Authored triangle contact replaced the five-point approximation, which
    // missed 43-51mm of the shoe between samples. Exact seam deduplication leaves
    // 173 points per sole instead of scanning all 1,704 shoe vertices per frame.
    expect(sample.mock.calls.length).toBe(346);
    expect(new Set(sample.mock.calls.map(([index]) => index)).size).toBe(346);
    sample.mockRestore();
    for (const { bones, orientation, toe, lengths } of feet) {
      expect(bones[2].getWorldQuaternion(new T.Quaternion()).normalize().angleTo(orientation)).toBeLessThan(1e-6);
      expect(bones[3].quaternion.toArray()).toEqual(toe.toArray());
      expect(bones.map(b => b.position.length())).toEqual(lengths);
      const knee = bones[1].getWorldPosition(new T.Vector3()), hip = bones[0].getWorldPosition(new T.Vector3());
      const axis = bones[2].getWorldPosition(new T.Vector3()).sub(hip).normalize();
      knee.sub(hip).addScaledVector(axis, -knee.dot(axis));
      expect(knee.z).toBeLessThan(0);
    }
  });
});

describe('production character stair contact', () => {
  it.each([true, false])('keeps both stairways within the existing flat-ground shoe envelope (north=%s)', north => {
    const state = setup(north); let worstStair = Infinity, worstFlat = Infinity;
    for (let frame = 0; frame < 270; frame++) {
      state.step(); const gap = skinGap(state.shoe), z = state.actor.z;
      if ((z >= 1 && z <= 6) || (z >= 16 && z <= 22)) worstStair = Math.min(worstStair, gap);
      if (z > 8 && z < 13) worstFlat = Math.min(worstFlat, gap);
    }
    expect(Number.isFinite(worstFlat)).toBe(true);
    // Existing standing/crouched production tests allow 30mm on flat ground.
    // Stair correction must remove the extra 145-166mm penetration, not change
    // the source gait or impose a new submillimetre art threshold.
    expect(worstStair).toBeGreaterThanOrEqual(Math.min(worstFlat, -.03) - 1e-5);
  });

  it.each([true, false].flatMap(north => [false, true].map(crouching => ({ north, crouching }))))(
    'preserves each foot trajectory and contact on an oblique crossing ($north, crouch=$crouching)', ({ north, crouching }) => {
    const stairs = setup(north, crouching, .05), flat = setup(north);
    const sides = Array.from({ length: stairs.shoe.geometry.attributes.position.count }, (_, i) => {
      const joint = stairs.shoe.geometry.attributes.skinIndex.getX(i);
      return stairs.shoe.skeleton.bones[joint].name.endsWith('_l') ? 0 : 1;
    });
    const worst = [Infinity, Infinity], greatestContactGap = [-Infinity, -Infinity];
    const maxStep = [0, 0], baselineStep = [0, 0];
    const previous: (T.Vector3 | undefined)[] = [], baselinePrevious: (T.Vector3 | undefined)[] = [];
    let onPlateau = false; const corrections = [0, 0];
    for (let frame = 0; frame < (crouching ? 900 : 270); frame++) {
      stairs.step(); flat.match.time = stairs.match.time;
      Object.assign(flat.actor, stairs.actor, { x: stairs.actor.x - 19, y: 0, z: stairs.actor.z + 40 }); flat.pose();
      onPlateau ||= stairs.actor.z > 8 && stairs.actor.z < 13;
      stairs.shoe.skeleton.update(); const gap = [Infinity, Infinity], vertex = new T.Vector3();
      for (let i = 0; i < sides.length; i++) {
        stairs.shoe.getVertexPosition(i, vertex); vertex.applyMatrix4(stairs.shoe.matrixWorld);
        gap[sides[i]] = Math.min(gap[sides[i]], vertex.y - groundHeight(vertex.x, vertex.z));
      }
      for (let leg = 0; leg < 2; leg++) {
        const name = leg ? 'foot_r' : 'foot_l';
        const current = stairs.rig.model.getObjectByName(name)!.getWorldPosition(new T.Vector3());
        const baseline = flat.rig.model.getObjectByName(name)!.getWorldPosition(new T.Vector3())
          .add(new T.Vector3(19, stairs.actor.y, -40));
        expect(Math.hypot(current.x - baseline.x, current.z - baseline.z)).toBeLessThan(1e-6);
        worst[leg] = Math.min(worst[leg], gap[leg]);
        if (current.y - baseline.y > 1e-5) { corrections[leg]++; greatestContactGap[leg] = Math.max(greatestContactGap[leg], gap[leg]); }
        if (previous[leg]) maxStep[leg] = Math.max(maxStep[leg], current.distanceTo(previous[leg]!));
        if (baselinePrevious[leg]) baselineStep[leg] = Math.max(baselineStep[leg], baseline.distanceTo(baselinePrevious[leg]!));
        previous[leg] = current; baselinePrevious[leg] = baseline;
      }
    }
    expect(onPlateau).toBe(true);
    for (let leg = 0; leg < 2; leg++) {
      expect(corrections[leg]).toBeGreaterThan(0);
      expect(Number.isFinite(greatestContactGap[leg])).toBe(true);
      expect(worst[leg]).toBeGreaterThanOrEqual(-.03001);
      // The original root advances in 200mm steps. Compare absolute foot motion
      // with that same source trajectory rather than treating lift delta alone
      // as a pop. This maximum-step envelope does not certify local timing or
      // jerk; continuous motion remains a visual check. Exact triangles may
      // contact between vertices, hence 30mm skin
      // sampling tolerance; an entire lifted shoe must not float above its tread.
      expect(greatestContactGap[leg]).toBeLessThan(.03);
      expect(maxStep[leg]).toBeLessThanOrEqual(baselineStep[leg] + .001);
    }
  });

  it('preserves the collision actor, chest, aim and held weapon while correcting the legs', () => {
    const stairs = setup(), flat = setup();
    for (let frame = 0; frame < 90; frame++) {
      stairs.step();
      Object.assign(stairs.actor, { crouch: .6, pitch: .35, recoilPitch: .02 });
      const before = structuredClone(stairs.actor);
      stairs.pose(.4);
      flat.match.time = stairs.match.time;
      Object.assign(flat.actor, stairs.actor, { x: stairs.actor.x - 19, z: stairs.actor.z + 40, y: 0 });
      flat.pose(.4);
      expect(stairs.actor).toEqual(before);
      for (const name of ['pelvis', 'spine_01', 'spine_03', 'head', 'hand_l', 'hand_r', 'held-weapon']) {
        const a = stairs.rig.model.getObjectByName(name)!, b = flat.rig.model.getObjectByName(name)!;
        expect(a.getWorldQuaternion(new T.Quaternion()).normalize().angleTo(b.getWorldQuaternion(new T.Quaternion()).normalize())).toBeLessThan(1e-6);
        const relative = (node: T.Object3D, state: ReturnType<typeof setup>) => node.getWorldPosition(new T.Vector3()).sub(state.rig.model.position);
        expect(relative(a, stairs).distanceTo(relative(b, flat))).toBeLessThan(1e-7);
      }
    }
  });

  it('does not accumulate a contact pose on paused updates and clears it after a teleport or death', () => {
    const state = setup(); for (let i = 0; i <= 72; i++) state.step();
    const pose = bonePose(state.rig.model);
    for (let i = 0; i < 5; i++) { state.pose(); expectSame(bonePose(state.rig.model), pose); }
    state.match.time += 1 / 60; Object.assign(state.actor, { x: 0, y: 0, z: 40 }); state.pose();
    const fresh = setup(); fresh.match.time = state.match.time; Object.assign(fresh.actor, state.actor); fresh.pose();
    expectSame(bonePose(state.rig.model), bonePose(fresh.rig.model));
    state.actor.hp = 0; fresh.actor.hp = 0; state.pose(); fresh.pose();
    expectSame(bonePose(state.rig.model), bonePose(fresh.rig.model));
  });
});
