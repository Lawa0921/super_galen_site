import { SMOKE, THROW, type Smoke, type GrenadeId } from './grenades';

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const x = clamp(v); return x * x * (3 - 2 * x); };

/** Grey-out amount for a camera inside smoke: core density, soft toward the edge. */
export function eyeFog(eye: readonly number[], smokes: readonly Smoke[]) {
  let fog = 0;
  for (const s of smokes) {
    if (s.density <= 0 || s.radius <= 0) continue;
    const x = (eye[0] - s.x) / s.radius, y = (eye[1] - s.y - SMOKE.centerY) / (s.radius * SMOKE.vertical), z = (eye[2] - s.z) / s.radius;
    fog += Math.max(0, 1 - (x * x + y * y + z * z)) * s.density * 1.6;
  }
  return clamp(fog);
}
export interface Puff { x: number; y: number; z: number; size: number; spin: number; phase: number }
/** Deterministic puff centres in the unit smoke ellipsoid (radius 1, height
 * SMOKE.vertical), kept off the floor; sizes are fractions of the radius. */
export function puffLayout(count: number, seed: number): Puff[] {
  let state = (seed * 2654435761) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const floor = Math.max(-SMOKE.vertical, -(SMOKE.centerY - .35) / SMOKE.radius);
  const puffs: Puff[] = [];
  // A few core puffs first so the centre is always filled, then shell fill.
  while (puffs.length < count) {
    const core = puffs.length < Math.ceil(count / 6);
    const x = (random() * 2 - 1) * (core ? .45 : 1), z = (random() * 2 - 1) * (core ? .45 : 1), y = (random() * 2 - 1) * SMOKE.vertical * (core ? .5 : 1);
    if (x * x + (y / SMOKE.vertical) ** 2 + z * z > .82 || y < floor) continue;
    puffs.push({ x, y, z, size: .6 + random() * .32, spin: random() * Math.PI * 2, phase: random() });
  }
  return puffs;
}
export interface ViewPose { visible: boolean; pin: boolean; x: number; y: number; z: number; pitch: number; roll: number }
type Holder = { held: 'gun' | GrenadeId; heldAt: number; primedAt: number; thrownAt: number };
/** First-person offsets (camera space, metres/radians) from the rest hold:
 * draw from below, cock back while the pin is out, swing through on release. */
export function viewmodelPose(p: Holder, time: number): ViewPose {
  const pose: ViewPose = { visible: true, pin: true, x: 0, y: 0, z: 0, pitch: 0, roll: 0 };
  const draw = smooth((time - p.heldAt) / THROW.deploy);
  pose.y -= .22 * (1 - draw); pose.pitch -= .5 * (1 - draw);
  if (p.thrownAt > p.heldAt && time >= p.thrownAt) {
    const s = (time - p.thrownAt) / THROW.recover;
    pose.visible = false; pose.pin = false;
    // Start from the cocked hold, lunge forward, then drop out of frame.
    const lunge = smooth(s / .3), drop = smooth((s - .1) / .6);
    pose.y += .05 * (1 - lunge) - .38 * drop; pose.z += .08 - .3 * lunge; pose.pitch += .25 - .9 * lunge; pose.roll -= .35 * lunge;
    return pose;
  }
  if (p.primedAt >= 0) {
    const cock = smooth((time - p.primedAt) / THROW.pin);
    pose.pin = time - p.primedAt < THROW.pin * .4;
    pose.y += .05 * cock; pose.z += .08 * cock; pose.pitch += .25 * cock; pose.x += .02 * cock;
  }
  return pose;
}
/** Third-person right-arm layer: raise while priming, overhand swing after release. */
export function armThrow(p: { held?: 'gun' | GrenadeId; primedAt?: number; thrownAt?: number }, time: number) {
  const raise = p.held && p.held !== 'gun' && (p.primedAt ?? -1) >= 0 ? smooth((time - p.primedAt!) / .2) : 0;
  const since = (p.thrownAt ?? -1) >= 0 ? time - p.thrownAt! : -1;
  const s = since >= 0 && since <= THROW.recover ? since / THROW.recover : -1;
  const swing = s < 0 ? 0 : s < .25 ? s / .25 : Math.max(0, 1 - (s - .25) / .6);
  return { raise, swing };
}

type Vec = readonly [number, number, number];
type Lump = { x: number; y: number; z: number };
/** Distance (in cloud radii) sunlight travels inside the unit smoke ellipsoid
 * to reach a lump at layout position p: 0 on the sunlit shell, ~a diameter
 * on the far side. Layout y spans ±SMOKE.vertical. */
export function sunChord(p: Lump, sun: Vec) {
  const qx = p.x, qy = p.y / SMOKE.vertical, qz = p.z, dx = sun[0], dy = sun[1] / SMOKE.vertical, dz = sun[2];
  const a = dx * dx + dy * dy + dz * dz, b = qx * dx + qy * dy + qz * dz, c = qx * qx + qy * qy + qz * qz - 1;
  return c >= 0 && b >= 0 ? 0 : Math.max(0, (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a);
}
/** Brightness of one smoke lump: lambert toward the sun on the shell, Beer
 * self-shadow through the cloud, a darker underside and an ambient floor. */
export function puffShade(p: Lump, sun: Vec) {
  const qx = p.x, qy = p.y / SMOKE.vertical, qz = p.z, length = Math.hypot(qx, qy, qz);
  const facing = length > 1e-4 ? (qx * sun[0] + qy * sun[1] + qz * sun[2]) / length * Math.min(1, length * 1.4) : 0;
  const lambert = .5 + .5 * facing, transmit = Math.exp(-sunChord(p, sun) * 1.1);
  const height = .75 + .25 * clamp(qy * .5 + .5);
  return Math.min(1.2, height * (.36 + .9 * transmit * lambert));
}
/** HE/flash light pulse: full at detonation, gone after 0.15 s. */
export function blastFlash(age: number) {
  if (age < 0 || age >= .15) return 0;
  const k = 1 - age / .15; return k * k;
}
/** Soft-particle fade distances (metres) against the scene depth, and the
 * camera-near fade that keeps lumps from popping through the lens. */
export const SOFT_DEPTH = { smoke: 1.2, fire: .45, near: .5 } as const;
