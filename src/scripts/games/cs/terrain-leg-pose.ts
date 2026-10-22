import * as T from 'three';
import type { Actor, Match } from './engine';
import { elevationBoxes, STEP_HEIGHT, supportHeight } from './elevation';
import { TwoBoneIK } from './two-bone-ik';
import { createTriangleFloorProbe } from './terrain-contact';

type Rig = { actor: T.Group; visual: T.Group; bones: ReadonlyMap<string, T.Bone> };
const REACH = .85, CLEARANCE = .002, MAX_LIFT = STEP_HEIGHT + .03;

/** A leg-only overlay on the existing gait. Contact triangles are selected once
 * from the authored sole; gameplay never scans the complete shoe mesh. */
export function createTerrainLegPose(rig: Rig) {
  let shoe: T.SkinnedMesh | undefined;
  rig.visual.traverse(node => {
    if (node instanceof T.SkinnedMesh && !Array.isArray(node.material) && node.material.name === 'Human.shoes04') shoe = node;
  });
  // Synthetic rigs and the separate development candidate have no production
  // sole contract. They retain their existing pose owner.
  if (!shoe) return null;
  const mesh = shoe, point = new T.Vector3(), inverse = new T.Matrix4();
  rig.actor.updateMatrixWorld(true); mesh.skeleton.update(); inverse.copy(rig.actor.matrixWorld).invert();
  const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
  const legs = (['l', 'r'] as const).map(side => {
    const thigh = rig.bones.get(`thigh_${side}`)!, calf = rig.bones.get(`calf_${side}`)!, foot = rig.bones.get(`foot_${side}`)!;
    if (!thigh || !calf || !foot) throw Error('Terrain pose missing leg bones');
    const vertices = new Map<number, number>();
    for (let i = 0; i < indices.count; i++) {
      let owned = 0;
      for (let slot = 0; slot < 4; slot++) {
        const name = mesh.skeleton.bones[indices.getComponent(i, slot)]?.name;
        if (name === `foot_${side}` || name === `ball_${side}`) owned += weights.getComponent(i, slot);
      }
      if (owned < .999) continue;
      mesh.getVertexPosition(i, point); point.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      vertices.set(i, point.y);
    }
    const bottom = Math.min(...vertices.values()), topology = mesh.geometry.index;
    if (!topology) throw Error('Terrain pose requires indexed authored soles');
    const probes: number[] = [], triangles: number[] = [], unique = new Map<string, number>();
    const position = mesh.geometry.getAttribute('position');
    function sample(index: number) {
      // Split normals/UV seams need only one skin calculation when position and
      // all bone influences are identical; no positional approximation is used.
      const key = [position.getX(index), position.getY(index), position.getZ(index),
        ...[0, 1, 2, 3].flatMap(slot => [indices.getComponent(index, slot), weights.getComponent(index, slot)])].join(',');
      let mapped = unique.get(key);
      if (mapped === undefined) { mapped = probes.length; unique.set(key, mapped); probes.push(index); }
      return mapped;
    }
    for (let i = 0; i < topology.count; i += 3) {
      const face = [topology.getX(i), topology.getX(i + 1), topology.getX(i + 2)];
      if (face.every(index => vertices.has(index)) && face.some(index => vertices.get(index)! < bottom + .04)) triangles.push(...face.map(sample));
    }
    if (!triangles.length) throw Error('Terrain pose missing authored sole triangles');
    const mount = new T.Object3D(); mount.name = `terrain-contact-${side}`; foot.add(mount);
    const posed = [thigh, calf, foot];
    return { thigh, calf, foot, mount, probes, triangles, posed, applied: false, lift: 0,
      points: probes.map(() => new T.Vector3()), bounds: new T.Box3(), solver: new TwoBoneIK(thigh, calf, foot),
      base: posed.map(b => b.quaternion.clone()),
      target: new T.Vector3(), orientation: new T.Quaternion(), pole: new T.Vector3() };
  });
  const forward = new T.Vector3(), actorRotation = new T.Quaternion();
  const nearby: typeof elevationBoxes = [], triangleFloor = createTriangleFloorProbe();
  function restore() {
    for (const leg of legs) if (leg.applied) {
      leg.posed.forEach((bone, i) => bone.quaternion.copy(leg.base[i])); leg.applied = false;
    }
  }
  return { restore, apply(actor: Actor, match: Match) {
    restore();
    if (actor.hp <= 0 || match.phase !== 'live' || Math.abs(actor.vy) > 1e-6 ||
        Math.abs(actor.y - supportHeight(actor.x, actor.z, actor.y)) > .01) return;
    nearby.length = 0;
    for (const box of elevationBoxes) if (box.height > actor.y + .001 && box.height <= actor.y + MAX_LIFT &&
        actor.x > box.minX - REACH && actor.x < box.maxX + REACH && actor.z > box.minZ - REACH && actor.z < box.maxZ + REACH) nearby.push(box);
    if (!nearby.length) return;
    rig.actor.updateMatrixWorld(true); mesh.skeleton.update();
    forward.set(0, 0, -1).applyQuaternion(rig.actor.getWorldQuaternion(actorRotation));
    for (const leg of legs) {
      leg.lift = 0; leg.bounds.makeEmpty();
      leg.probes.forEach((index, i) => {
        mesh.getVertexPosition(index, leg.points[i]); leg.points[i].applyMatrix4(mesh.matrixWorld); leg.bounds.expandByPoint(leg.points[i]);
      });
      for (const box of nearby) {
        if (leg.bounds.max.x < box.minX || leg.bounds.min.x > box.maxX || leg.bounds.max.z < box.minZ || leg.bounds.min.z > box.maxZ) continue;
        for (let i = 0; i < leg.triangles.length; i += 3) {
          const a = leg.points[leg.triangles[i]], b = leg.points[leg.triangles[i + 1]], c = leg.points[leg.triangles[i + 2]];
          if (Math.max(a.x, b.x, c.x) < box.minX || Math.min(a.x, b.x, c.x) > box.maxX ||
              Math.max(a.z, b.z, c.z) < box.minZ || Math.min(a.z, b.z, c.z) > box.maxZ) continue;
          leg.lift = Math.max(leg.lift, box.height + CLEARANCE - triangleFloor(a, b, c, box));
        }
      }
      if (leg.lift < .001) { leg.lift = 0; continue; }
      if (leg.lift > MAX_LIFT) return;
      leg.foot.getWorldPosition(leg.target); leg.target.y += leg.lift;
      leg.foot.getWorldQuaternion(leg.orientation).normalize();
      leg.calf.getWorldPosition(leg.pole).addScaledVector(forward, .6);
      if (!leg.solver.canSolveMount(leg.mount, leg.target, leg.pole, leg.orientation)) return;
    }
    // Preflight every participating chain before committing either leg.
    for (const leg of legs) if (leg.lift) {
      leg.posed.forEach((bone, i) => leg.base[i].copy(bone.quaternion)); leg.applied = true;
      if (!leg.solver.solveMount(leg.mount, leg.target, leg.pole, leg.orientation)) { restore(); return; }
    }
  } };
}
