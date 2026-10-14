import data from './map-data.json';
import surfaces from './city-surfaces.json';
import { elevationBoxes } from './elevation';
import { THROW } from './grenades';

export interface GrenadeBody { x: number; y: number; z: number; vx: number; vy: number; vz: number; rest: number; bounces: number }
type Box = readonly [number, number, number, number, number, number];
// Same solid volumes as bullets and movement: nine-plus map colliders, the
// authored stair treads/terrace and the solid exterior plinths/buildings.
const boxes: readonly Box[] = [
  ...data.obstacles.map(b => [b.minX, 0, b.minZ, b.maxX, b.height, b.maxZ] as const),
  ...elevationBoxes.map(b => [b.minX, 0, b.minZ, b.maxX, b.height, b.maxZ] as const),
  ...surfaces.surfaces.map(s => [s.min[0], s.min[1], s.min[2], s.max[0], s.max[1], s.max[2]] as const),
];
const ROLL_FRICTION = 5, STOP_SPEED = .1, LAND_SPEED = .9, IMPACT_FRICTION = .8;
const p = [0, 0, 0], q = [0, 0, 0], v = [0, 0, 0];
/** Advance one projectile; returns true when an audible bounce happened. */
export function stepGrenadeBody(body: GrenadeBody, dt: number) {
  if (!(dt > 0)) return false;
  const r = THROW.radius, slices = Math.ceil(dt / (1 / 240)), h = dt / slices;
  let audible = false;
  for (let step = 0; step < slices; step++) {
    if (body.rest > 0 && body.vx === 0 && body.vy === 0 && body.vz === 0) { body.rest += h; continue; }
    p[0] = body.x; p[1] = body.y; p[2] = body.z; v[0] = body.vx; v[1] = body.vy - THROW.gravity * h; v[2] = body.vz;
    for (let i = 0; i < 3; i++) q[i] = p[i] + v[i] * h;
    let grounded = false;
    const resolve = (axis: number, plane: number, normal: number) => {
      q[axis] = plane + normal * 1e-5;
      const speed = Math.abs(v[axis]);
      v[axis] = -v[axis] * THROW.elasticity;
      for (let i = 0; i < 3; i++) if (i !== axis) v[i] *= IMPACT_FRICTION;
      if (axis === 1 && normal > 0 && Math.abs(v[1]) < LAND_SPEED * THROW.elasticity) { v[1] = 0; grounded = true; }
      if (speed > LAND_SPEED) { body.bounces++; audible = true; }
    };
    for (const b of boxes) {
      const min = [b[0] - r, b[1] - r, b[2] - r], max = [b[3] + r, b[4] + r, b[5] + r];
      if (q[0] <= min[0] || q[0] >= max[0] || q[1] <= min[1] || q[1] >= max[1] || q[2] <= min[2] || q[2] >= max[2]) continue;
      // The face whose slab was entered last is the one actually crossed.
      let axis = -1, normal = 0, plane = 0, latest = -Infinity;
      for (let i = 0; i < 3; i++) {
        const delta = q[i] - p[i];
        if (p[i] <= min[i] && delta > 0) { const t = (min[i] - p[i]) / delta; if (t > latest) { latest = t; axis = i; normal = -1; plane = min[i]; } }
        else if (p[i] >= max[i] && delta < 0) { const t = (max[i] - p[i]) / delta; if (t > latest) { latest = t; axis = i; normal = 1; plane = max[i]; } }
      }
      if (axis < 0) {
        // Started inside (spawned against a wall): leave by the shallowest face.
        let depth = Infinity;
        for (let i = 0; i < 3; i++) {
          if (q[i] - min[i] < depth) { depth = q[i] - min[i]; axis = i; normal = -1; plane = min[i]; }
          if (max[i] - q[i] < depth) { depth = max[i] - q[i]; axis = i; normal = 1; plane = max[i]; }
        }
      }
      resolve(axis, plane, normal);
    }
    if (q[1] < r) resolve(1, r, 1);
    // Resting contact: the support face cancels gravity, then rolling friction.
    if (!grounded && v[1] <= 0) {
      const below = q[1] - r;
      if (below <= 2e-3 || boxes.some(b => q[0] > b[0] - r * .5 && q[0] < b[3] + r * .5 && q[2] > b[2] - r * .5 && q[2] < b[5] + r * .5 && Math.abs(below - b[4]) < 2e-3)) {
        if (Math.abs(v[1]) < LAND_SPEED * THROW.elasticity) { v[1] = 0; grounded = true; }
      }
    }
    if (grounded) {
      const speed = Math.hypot(v[0], v[2]), next = Math.max(0, speed - ROLL_FRICTION * h);
      if (next < STOP_SPEED) { v[0] = v[2] = 0; } else { v[0] *= next / speed; v[2] *= next / speed; }
    }
    body.x = q[0]; body.y = q[1]; body.z = q[2]; body.vx = v[0]; body.vy = v[1]; body.vz = v[2];
    body.rest = grounded && v[0] === 0 && v[2] === 0 ? body.rest + h : 0;
  }
  return audible;
}
