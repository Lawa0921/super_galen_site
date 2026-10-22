/** CS2-style utility rules in this game's metre scale. Pure math only: map
 * collision lives in grenade-physics.ts and match integration in engine.ts.
 *
 * Scale: the crouch model maps CS 64u eye height to 1.58 m (1u ≈ 0.0247 m).
 * HE radius 350u → 8.6 m and the gaussian falloff (σ = radius / 3) are kept.
 * CS throw speed 750u/s × 0.9 ≈ 16.7 m/s is reduced to 14 m/s because the
 * 48 × 56 m map is about half a competitive CS map; grenade gravity is CS
 * 0.4 × 800u/s² ≈ 7.9 m/s², elasticity 0.45. */
export type GrenadeId = 'he' | 'flash' | 'smoke';
export const GRENADE_ORDER: readonly GrenadeId[] = ['he', 'flash', 'smoke'];
export const GRENADES: Record<GrenadeId, { name: string; short: string; price: number; max: number }> = {
  he: { name: 'HE 手雷', short: 'HE', price: 300, max: 1 },
  flash: { name: '閃光彈', short: 'FLASH', price: 200, max: 2 },
  smoke: { name: '煙霧彈', short: 'SMOKE', price: 300, max: 1 },
};
export const MAX_GRENADES = 4;
export const THROW = {
  speed: 14, gravity: 7.9, elasticity: .45, radius: .06,
  /** HE / flash fuse after release (CS2 ≈ 1.6 s). */
  fuse: 1.6,
  /** Draw time before the pin can be pulled, pin pull, and post-throw recovery. */
  deploy: .35, pin: .25, recover: .5,
  bias: 10 * Math.PI / 180, inherit: 1.25,
  /** Longest white-out of a point-blank flash in view, seconds. */
  flashMax: 4.9,
  /** Smoke pops after resting this long; failsafe if it never settles. */
  smokeSettle: .25, smokeFailsafe: 6,
} as const;
export const HE = { damage: 98, radius: 8.6 } as const;
/** Ellipsoid smoke: 3.5 m radius (CS 144u), ~3.3 m tall over the canister. */
export const SMOKE = { radius: 3.5, vertical: .55, centerY: 1.3, bloom: 1, fadeStart: 15, life: 18, threshold: 1 } as const;

export interface Smoke { id: number; actor: number; x: number; y: number; z: number; at: number; until: number; radius: number; density: number }
export interface Holder { held: 'gun' | GrenadeId; grenades: Record<GrenadeId, number> }

export function grenadeCount(p: { grenades?: Record<GrenadeId, number> }) {
  return p.grenades ? p.grenades.he + p.grenades.flash + p.grenades.smoke : 0;
}
/** CS slot-4 behaviour: each press moves to the next carried grenade type. */
export function nextGrenade(p: Holder): GrenadeId | null {
  const start = p.held === 'gun' ? -1 : GRENADE_ORDER.indexOf(p.held);
  for (let i = 1; i <= GRENADE_ORDER.length; i++) {
    const id = GRENADE_ORDER[(start + i + GRENADE_ORDER.length) % GRENADE_ORDER.length];
    if (p.grenades[id] > 0) return id;
  }
  return null;
}
/** Speed factor from the buttons held at release: left 1, right .3, both .65. */
export function throwStrength(primary: boolean, secondary: boolean) {
  return primary && secondary ? .65 : primary ? 1 : secondary ? .3 : 0;
}
export function launchVelocity(yaw: number, pitch: number, strength: number, carrier: { vx: number; vy: number; vz: number }): [number, number, number] {
  // CS lifts the throw by 10° at the horizon, fading to 0° looking straight up/down.
  const up = pitch + THROW.bias * Math.max(0, 1 - Math.abs(pitch) / (Math.PI / 2));
  const speed = THROW.speed * strength, flat = Math.cos(up);
  return [
    -Math.sin(yaw) * flat * speed + carrier.vx * THROW.inherit,
    Math.sin(up) * speed + carrier.vy * THROW.inherit,
    -Math.cos(yaw) * flat * speed + carrier.vz * THROW.inherit,
  ];
}
const sigma = HE.radius / 3, gaussian = (d: number) => Math.exp(-d * d / (2 * sigma * sigma)), tail = gaussian(HE.radius);
/** Raw HE damage before armor; gaussian falloff shifted to reach 0 at the radius. */
export function heDamage(distance: number) {
  if (!Number.isFinite(distance) || distance >= HE.radius) return 0;
  return HE.damage * Math.max(0, (gaussian(Math.max(0, distance)) - tail) / (1 - tail));
}
/** CS armor model for blasts: ratio .5, bonus .5. Returns health and armor lost. */
export function applyBlastArmor(raw: number, armor: number) {
  if (armor <= 0 || raw <= 0) return { health: Math.max(0, raw), armor: 0 };
  let health = raw * .5, cost = (raw - health) * .5;
  if (cost > armor) { cost = armor; health = raw - armor * 2; }
  return { health, armor: cost };
}
/** 0..1 white-out strength from distance (m) and the cosine between view and flash. */
export function flashStrength(distance: number, facing: number) {
  if (!Number.isFinite(distance) || distance >= 34) return 0;
  const range = distance <= 6 ? 1 : 1 - (distance - 6) / 28;
  const angle = facing >= .6 ? 1 : facing <= -.3 ? .15 : .15 + .85 * (facing + .3) / .9;
  return Math.max(0, Math.min(1, range * angle));
}
/** Screen whiteness: full white, then the last ≤3 s fade linearly to clear. */
export function flashAmount(p: { flashUntil?: number; flashDuration?: number }, time: number) {
  const remaining = (p.flashUntil ?? 0) - time, duration = p.flashDuration ?? 0;
  if (remaining <= 0 || duration <= 0) return 0;
  return Math.min(1, remaining / Math.min(duration, 3));
}
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
export function updateSmoke(s: Smoke, time: number) {
  const age = time - s.at, grow = smooth(age / SMOKE.bloom);
  const fade = age <= SMOKE.fadeStart ? 1 : Math.max(0, 1 - (age - SMOKE.fadeStart) / (SMOKE.life - SMOKE.fadeStart));
  s.radius = SMOKE.radius * (.3 + .7 * grow); s.density = age < 0 ? 0 : grow * fade;
  return s;
}
/** ∫ density·(1 − ρ²) along the segment, ρ = normalised ellipsoid radius. The
 * core is opaque; a ray grazing the soft edge accumulates almost nothing. */
export function smokeOpticalDepth(o: readonly number[], d: readonly number[], length: number, smokes: readonly Smoke[]) {
  let depth = 0;
  for (const s of smokes) {
    if (s.density <= 0 || s.radius <= 0) continue;
    const r = s.radius, ry = r * SMOKE.vertical;
    // Normalised space: the ellipsoid becomes a unit sphere; t stays in metres.
    const ox = (o[0] - s.x) / r, oy = (o[1] - s.y - SMOKE.centerY) / ry, oz = (o[2] - s.z) / r;
    const dx = d[0] / r, dy = d[1] / ry, dz = d[2] / r;
    const a = dx * dx + dy * dy + dz * dz, b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - 1;
    const disc = b * b - a * c;
    if (a <= 0 || disc <= 0) continue;
    const root = Math.sqrt(disc), t0 = Math.max(0, (-b - root) / a), t1 = Math.min(length, (-b + root) / a);
    if (t1 <= t0) continue;
    // ρ²(t) = a t² + 2b t + c + 1, integrate (1 − ρ²) = −(a t² + 2b t + c).
    const F = (t: number) => -(a * t * t * t / 3 + b * t * t + c * t);
    depth += s.density * (F(t1) - F(t0));
  }
  return depth;
}
export function smokeBlocks(o: readonly number[], d: readonly number[], length: number, smokes: readonly Smoke[] | undefined) {
  return !!smokes?.length && smokeOpticalDepth(o, d, length, smokes) > SMOKE.threshold;
}
