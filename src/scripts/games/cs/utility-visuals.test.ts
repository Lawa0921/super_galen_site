import { describe, expect, it } from 'vitest';
import { createMatch } from './engine';
import { SMOKE, THROW, updateSmoke, type Smoke } from './grenades';
import { eyeFog, puffLayout, viewmodelPose, armThrow, puffShade, sunChord, blastFlash, SOFT_DEPTH } from './utility-visuals';

const smoke = (time: number): Smoke => updateSmoke({ id: 1, actor: 0, x: 0, y: 0, z: 0, at: 0, until: SMOKE.life, radius: 0, density: 0 }, time);

describe('smoke presentation helpers', () => {
  it('fogs the screen fully inside the core of a bloomed smoke and not outside it', () => {
    expect(eyeFog([0, SMOKE.centerY, 0], [smoke(3)])).toBeGreaterThan(.95);
    expect(eyeFog([SMOKE.radius * .8, SMOKE.centerY, 0], [smoke(3)])).toBeGreaterThan(.1);
    expect(eyeFog([SMOKE.radius * .8, SMOKE.centerY, 0], [smoke(3)])).toBeLessThan(eyeFog([0, SMOKE.centerY, 0], [smoke(3)]));
    expect(eyeFog([SMOKE.radius + .5, SMOKE.centerY, 0], [smoke(3)])).toBe(0);
    expect(eyeFog([0, SMOKE.centerY, 0], [smoke(SMOKE.life - .1)])).toBeLessThan(.2);
  });
  it('lays out puffs deterministically inside the unit smoke ellipsoid, filling it', () => {
    const a = puffLayout(36, 7), b = puffLayout(36, 7);
    expect(a).toEqual(b);
    expect(a).toHaveLength(36);
    for (const p of a) {
      expect(Math.hypot(p.x, p.y / SMOKE.vertical, p.z)).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(-SMOKE.vertical);
      expect(p.size).toBeGreaterThan(.3);
    }
    const quadrants = new Set(a.map(p => `${Math.sign(p.x)},${Math.sign(p.z)}`));
    expect(quadrants.size).toBe(4);
    expect(a.some(p => Math.hypot(p.x, p.z) < .35)).toBe(true);
  });
});

describe('first-person grenade motion', () => {
  const actor = () => { const p = createMatch('attack').actors[0]; p.grenades.he = 1; p.held = 'he'; p.heldAt = 10; return p; };
  it('raises a freshly drawn grenade from below the view', () => {
    const p = actor();
    const start = viewmodelPose(p, 10), done = viewmodelPose(p, 10 + THROW.deploy + .05);
    expect(start.y).toBeLessThan(done.y - .08);
    expect(done.visible).toBe(true); expect(done.pin).toBe(true);
  });
  it('pulls the pin and cocks the arm back while held', () => {
    const p = actor(); p.primedAt = 11;
    const idle = viewmodelPose({ ...p, primedAt: -1 }, 11.5), cocked = viewmodelPose(p, 11.5);
    expect(cocked.pin).toBe(false);
    expect(cocked.y).toBeGreaterThan(idle.y); expect(cocked.z).toBeGreaterThan(idle.z);
  });
  it('the grenade leaves the hand at release and the arm follows through out of view', () => {
    const p = actor(); p.primedAt = 11; p.thrownAt = 11.5;
    expect(viewmodelPose(p, 11.5).visible).toBe(false);
    const follow = viewmodelPose(p, 11.5 + THROW.recover * .8);
    expect(follow.y).toBeLessThan(viewmodelPose(p, 11.5).y);
  });
});

describe('third-person throw motion', () => {
  it('is idle with the gun, raised while priming, and swings through after release', () => {
    const p = createMatch('attack').actors[3];
    expect(armThrow(p, 5)).toEqual({ raise: 0, swing: 0 });
    p.held = 'smoke'; p.primedAt = 4.5;
    expect(armThrow(p, 5).raise).toBeGreaterThan(.9);
    p.primedAt = -1; p.thrownAt = 5;
    expect(armThrow(p, 5.12).swing).toBeGreaterThan(.5);
    expect(armThrow(p, 5 + THROW.recover).swing).toBeLessThan(.1);
  });
});

describe('V38 smoke lighting (per-lump sun approximation)', () => {
  // World sun from the renderer, normalised.
  const sun = (() => { const v = [-22, 22, 16], l = Math.hypot(...v); return v.map(x => x / l) as [number, number, number]; })();
  it('the sun travels no cloud to reach a lump on the sunlit shell, and crosses the cloud to reach the far side', () => {
    const lit = sunChord({ x: sun[0] * .8, y: sun[1] * .8 * SMOKE.vertical, z: sun[2] * .8 }, sun);
    const far = sunChord({ x: -sun[0] * .8, y: -sun[1] * .8 * SMOKE.vertical, z: -sun[2] * .8 }, sun);
    expect(lit).toBeLessThan(.3);
    expect(far).toBeGreaterThan(1.2);
  });
  it('lumps facing the sun are clearly brighter than the self-shadowed far side, which never goes black', () => {
    const near = puffShade({ x: sun[0] * .8, y: .1, z: sun[2] * .8 }, sun);
    const far = puffShade({ x: -sun[0] * .8, y: .1, z: -sun[2] * .8 }, sun);
    expect(near).toBeGreaterThan(far * 1.4);
    expect(far).toBeGreaterThan(.3);
    expect(near).toBeLessThanOrEqual(1.25);
  });
  it('the underside of the cloud is darker than its top', () => {
    const top = puffShade({ x: 0, y: .8 * SMOKE.vertical, z: 0 }, sun), bottom = puffShade({ x: 0, y: -.8 * SMOKE.vertical, z: 0 }, sun);
    expect(bottom).toBeLessThan(top * .8);
  });
  it('a lump in the core is shaded by the cloud around it', () => {
    const core = puffShade({ x: 0, y: 0, z: 0 }, sun), shell = puffShade({ x: sun[0] * .8, y: 0, z: sun[2] * .8 }, sun);
    expect(core).toBeLessThan(shell);
  });
});

describe('V38 blast flash and soft-particle depth settings', () => {
  it('the HE light pulse is a ~0.1 s spike: full at detonation, gone by 0.15 s, never before', () => {
    expect(blastFlash(0)).toBe(1);
    expect(blastFlash(.03)).toBeGreaterThan(.5);
    expect(blastFlash(.12)).toBeLessThan(.06);
    expect(blastFlash(.15)).toBe(0); expect(blastFlash(2)).toBe(0); expect(blastFlash(-.01)).toBe(0);
    for (let t = 0; t < .15; t += .01) expect(blastFlash(t + .01)).toBeLessThanOrEqual(blastFlash(t));
  });
  it('fades smoke more gently than fire against scene geometry, and fades lumps at the camera', () => {
    expect(SOFT_DEPTH.smoke).toBeGreaterThan(SOFT_DEPTH.fire);
    expect(SOFT_DEPTH.fire).toBeGreaterThan(.2);
    expect(SOFT_DEPTH.near).toBeGreaterThan(.2);
  });
});
