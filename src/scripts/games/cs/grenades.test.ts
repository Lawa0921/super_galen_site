import { describe, expect, it } from 'vitest';
import {
  GRENADES, HE, SMOKE, THROW, applyBlastArmor, flashAmount, flashStrength, heDamage, launchVelocity,
  nextGrenade, smokeBlocks, smokeOpticalDepth, throwStrength, updateSmoke, type Smoke,
} from './grenades';
import { stepGrenadeBody } from './grenade-physics';

const smokeAt = (x: number, z: number, at = 0, time = 5): Smoke => updateSmoke({ id: 1, actor: 0, x, y: 0, z, at, until: at + SMOKE.life, radius: 0, density: 0 }, time);

describe('grenade catalogue and inventory', () => {
  it('prices and carry limits follow CS2 utility', () => {
    expect([GRENADES.he.price, GRENADES.flash.price, GRENADES.smoke.price]).toEqual([300, 200, 300]);
    expect([GRENADES.he.max, GRENADES.flash.max, GRENADES.smoke.max]).toEqual([1, 2, 1]);
  });
  it('cycles held utility in a fixed order and skips empty slots', () => {
    const actor = { held: 'gun' as const, grenades: { he: 1, flash: 0, smoke: 1 } };
    expect(nextGrenade(actor)).toBe('he');
    expect(nextGrenade({ ...actor, held: 'he' })).toBe('smoke');
    expect(nextGrenade({ ...actor, held: 'smoke' })).toBe('he');
    expect(nextGrenade({ held: 'gun', grenades: { he: 0, flash: 0, smoke: 0 } })).toBeNull();
  });
});

describe('throw model', () => {
  it('maps CS2 primary / secondary / both release to throw strengths', () => {
    expect(throwStrength(true, false)).toBe(1);
    expect(throwStrength(false, true)).toBeCloseTo(.3);
    expect(throwStrength(true, true)).toBeCloseTo(.65);
  });
  it('a level overhand throw leaves at full speed, angled about ten degrees upward', () => {
    const [vx, vy, vz] = launchVelocity(0, 0, 1, { vx: 0, vy: 0, vz: 0 });
    expect(Math.hypot(vx, vy, vz)).toBeCloseTo(THROW.speed, 5);
    expect(vz).toBeLessThan(0); expect(Math.abs(vx)).toBeLessThan(1e-9);
    expect(Math.atan2(vy, -vz) * 180 / Math.PI).toBeCloseTo(10, 4);
  });
  it('an underhand lob is slow, and the thrower velocity is inherited', () => {
    const lob = launchVelocity(0, 0, .3, { vx: 0, vy: 0, vz: 0 });
    expect(Math.hypot(...lob)).toBeCloseTo(THROW.speed * .3, 5);
    const running = launchVelocity(0, 0, 1, { vx: 4, vy: 0, vz: 0 });
    expect(running[0]).toBeCloseTo(5, 5);
  });
  it('the upward bias fades when already looking straight up or down', () => {
    const [, vy, vz] = launchVelocity(0, -Math.PI / 2 + 1e-6, 1, { vx: 0, vy: 0, vz: 0 });
    expect(vy).toBeLessThan(-THROW.speed * .99); expect(Math.abs(vz)).toBeLessThan(.05);
  });
});

describe('grenade physics against the map colliders', () => {
  const body = (x: number, y: number, z: number, vx = 0, vy = 0, vz = 0) => ({ x, y, z, vx, vy, vz, rest: 0, bounces: 0 });
  const run = (b: ReturnType<typeof body>, seconds: number, each?: () => void) => { for (let i = 0; i < seconds * 60; i++) { stepGrenadeBody(b, 1 / 60); each?.(); } return b; };
  it('falls under grenade gravity and comes to rest on the ground', () => {
    const b = run(body(0, 3, 20, 0, 0, 0), 4);
    expect(b.y).toBeCloseTo(THROW.radius, 3);
    expect(Math.hypot(b.vx, b.vy, b.vz)).toBe(0);
    expect(b.rest).toBeGreaterThan(.5);
    expect(b.bounces).toBeGreaterThan(0);
  });
  it('rebounds off the warehouse wall with CS elasticity and never passes through it', () => {
    // Warehouse east face is x = 6 between z -4..4 and up to 7.8 m.
    const b = body(8, 2, 0, -10, 0, 0); let minX = Infinity, bounced = 0;
    for (let i = 0; i < 30; i++) {
      const before = b.vx; stepGrenadeBody(b, 1 / 60); minX = Math.min(minX, b.x);
      if (before < 0 && b.vx > 0) bounced = b.vx / -before;
    }
    expect(minX).toBeGreaterThanOrEqual(6 + THROW.radius - 1e-6);
    expect(bounced).toBeCloseTo(THROW.elasticity, 1);
  });
  it('lands and rests on top of a 1.6 m crate', () => {
    const b = run(body(-18.5, 4, -10.5), 4);
    expect(b.y).toBeCloseTo(1.6 + THROW.radius, 3);
  });
  it('rests on the raised east terrace instead of falling through to street level', () => {
    const b = run(body(19, 5, 10), 4);
    expect(b.y).toBeCloseTo(2.4 + THROW.radius, 3);
  });
  it('rolls to a stop with friction after a shallow throw', () => {
    const b = run(body(5, .5, 20, 0, 0, -6), 6);
    expect(b.vx === 0 && b.vz === 0).toBe(true);
    expect(b.z).toBeGreaterThan(8);
  });
});

describe('HE damage', () => {
  it('peaks near CS2 HE damage at the centre and falls off to zero at the blast radius', () => {
    expect(heDamage(0)).toBeCloseTo(HE.damage, 5);
    expect(heDamage(2)).toBeLessThan(heDamage(1));
    expect(heDamage(3)).toBeGreaterThan(40);
    expect(heDamage(3)).toBeLessThan(70);
    expect(heDamage(HE.radius)).toBe(0);
    expect(heDamage(HE.radius + 2)).toBe(0);
  });
  it('armor halves health damage and absorbs half of the remainder', () => {
    expect(applyBlastArmor(80, 0)).toEqual({ health: 80, armor: 0 });
    expect(applyBlastArmor(80, 100)).toEqual({ health: 40, armor: 20 });
  });
  it('broken armor lets the remaining damage through', () => {
    expect(applyBlastArmor(80, 5)).toEqual({ health: 70, armor: 5 });
  });
});

describe('flashbang blinding', () => {
  it('a close flash in view gives the full CS-length white-out', () => {
    expect(flashStrength(4, 1)).toBeCloseTo(1, 5);
    expect(THROW.flashMax * flashStrength(4, 1)).toBeGreaterThan(4);
  });
  it('a flash behind the player gives only a brief white-out', () => {
    expect(flashStrength(4, -1)).toBeGreaterThan(0);
    expect(THROW.flashMax * flashStrength(4, -1)).toBeLessThan(1);
  });
  it('side flashes are partial and distant flashes fade out', () => {
    expect(flashStrength(4, 0)).toBeGreaterThan(flashStrength(4, -1));
    expect(flashStrength(4, 0)).toBeLessThan(flashStrength(4, 1));
    expect(flashStrength(20, 1)).toBeLessThan(flashStrength(6, 1));
    expect(flashStrength(40, 1)).toBe(0);
  });
  it('white screen holds, then fades out to nothing by the end time', () => {
    const p = { flashUntil: 10, flashDuration: 4.8 };
    expect(flashAmount(p, 5.5)).toBe(1);
    expect(flashAmount(p, 8.5)).toBeGreaterThan(.2);
    expect(flashAmount(p, 8.5)).toBeLessThan(1);
    expect(flashAmount(p, 10)).toBe(0);
    expect(flashAmount({ flashUntil: 0, flashDuration: 0 }, 3)).toBe(0);
  });
});

describe('smoke volume', () => {
  it('blocks a line of sight through the middle of a bloomed smoke', () => {
    const s = smokeAt(0, 10);
    expect(smokeBlocks([0, 1.5, 16], [0, 0, -1], 12, [s])).toBe(true);
  });
  it('does not block a segment that ends before the smoke or rays that graze its thin edge', () => {
    const s = smokeAt(0, 10);
    expect(smokeBlocks([0, 1.5, 20], [0, 0, -1], 5, [s])).toBe(false);
    expect(smokeBlocks([s.radius - .1, 1.4, 16], [0, 0, -1], 12, [s])).toBe(false);
  });
  it('is thin while blooming and clears after its lifetime', () => {
    expect(smokeBlocks([0, 1.5, 16], [0, 0, -1], 12, [smokeAt(0, 10, 0, .05)])).toBe(false);
    expect(smokeBlocks([0, 1.5, 16], [0, 0, -1], 12, [smokeAt(0, 10, 0, 1.2)])).toBe(true);
    expect(smokeBlocks([0, 1.5, 16], [0, 0, -1], 12, [smokeAt(0, 10, 0, SMOKE.life - .2)])).toBe(false);
  });
  it('lasts 15 to 18 seconds of blocking time, as in CS2', () => {
    let blocking = 0;
    for (let t = 0; t < SMOKE.life; t += .1) if (smokeBlocks([0, 1.5, 16], [0, 0, -1], 12, [smokeAt(0, 10, 0, t)])) blocking += .1;
    expect(blocking).toBeGreaterThan(15); expect(blocking).toBeLessThan(18.2);
  });
  it('optical depth accumulates across overlapping smokes', () => {
    const one = smokeOpticalDepth([0, 1.5, 30], [0, 0, -1], 40, [smokeAt(0, 10)]);
    const two = smokeOpticalDepth([0, 1.5, 30], [0, 0, -1], 40, [smokeAt(0, 10), smokeAt(0, 18)]);
    expect(two).toBeGreaterThan(one * 1.8);
  });
  it('a smoke is covering the area above its canister rather than floating', () => {
    const s = smokeAt(0, 10);
    expect(smokeBlocks([-8, .4, 10], [1, 0, 0], 16, [s])).toBe(true);
    expect(smokeBlocks([-8, 2.6, 10], [1, 0, 0], 16, [s])).toBe(true);
    expect(smokeBlocks([-8, 5.5, 10], [1, 0, 0], 16, [s])).toBe(false);
  });
});
