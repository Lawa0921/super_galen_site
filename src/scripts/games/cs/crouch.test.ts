import { describe, expect, it } from 'vitest';
import { createMatch, currentSpread, stepMatch, type Input, type Match } from './engine';
import { CROUCH_EYE_HEIGHT, CROUCH_SPEED_SCALE, STAND_EYE_HEIGHT, eyeHeight } from './movement';

const live = () => { const m = createMatch('attack'); m.phase = 'live'; m.timer = 100; m.actors[0].x = 0; return m; };
const tick = (m: Match, seconds: number, input: Partial<Input> = {}, hz = 120, others: Record<number, Partial<Input>> = {}) => {
  for (let i = 0; i < Math.round(seconds * hz); i++) stepMatch(m, { ...others, 0: input }, 1 / hz);
};
const speed = (m: Match) => Math.hypot(m.actors[0].vx, m.actors[0].vz);

describe('CS-style hold-to-crouch', () => {
  it('scales the 64u→46u CS eye drop onto the 1.58 m standing eye', () => {
    expect(STAND_EYE_HEIGHT).toBe(1.58);
    expect(CROUCH_EYE_HEIGHT / STAND_EYE_HEIGHT).toBeCloseTo(46 / 64, 2);
  });
  it('lowers the eye smoothly over ~0.15 s while held and restores it on release', () => {
    const m = live(), p = m.actors[0];
    expect(eyeHeight(p)).toBeCloseTo(STAND_EYE_HEIGHT, 6);
    tick(m, .05, { crouch: true });
    expect(eyeHeight(p)).toBeLessThan(STAND_EYE_HEIGHT - .05);
    expect(eyeHeight(p)).toBeGreaterThan(CROUCH_EYE_HEIGHT + .05);
    tick(m, .15, { crouch: true });
    expect(eyeHeight(p)).toBeCloseTo(CROUCH_EYE_HEIGHT, 6);
    tick(m, .05);
    expect(eyeHeight(p)).toBeGreaterThan(CROUCH_EYE_HEIGHT + .05);
    tick(m, .15);
    expect(eyeHeight(p)).toBeCloseTo(STAND_EYE_HEIGHT, 6);
  });
  it('moves at 34% of standing speed and does not stack with walk/aim slowdowns', () => {
    const stand = live(), crouch = live(), crouchWalk = live();
    tick(stand, .6, { right: 1 }); tick(crouch, .6, { right: 1, crouch: true }); tick(crouchWalk, .6, { right: 1, crouch: true, slow: true });
    expect(CROUCH_SPEED_SCALE).toBe(.34);
    expect(speed(crouch) / speed(stand)).toBeCloseTo(.34, 2);
    expect(speed(crouchWalk)).toBeCloseTo(speed(crouch), 4);
  });
  it('fires from the crouched eye and is more accurate than standing when still', () => {
    const m = live(), p = m.actors[0];
    const standing = currentSpread(p);
    tick(m, .3, { crouch: true });
    expect(currentSpread(p)).toBeLessThan(standing * .8);
    expect(currentSpread(p)).toBeGreaterThan(standing * .5);
    p.yaw = 0; p.pitch = 0; tick(m, 1 / 120, { crouch: true, fire: true, yaw: 0, pitch: 0 });
    expect(m.shots.at(-1)!.y).toBeCloseTo(p.y + CROUCH_EYE_HEIGHT, 6);
  });
  it('lowers head and body hitboxes with the crouch', () => {
    // A level shot at standing head height (1.58) heads a standing target but
    // passes over a fully crouched one; aiming at the crouched head still heads it.
    const fireAt = (crouched: boolean, shooterCrouched: boolean) => {
      const m = live(), shooter = m.actors[0], target = m.actors[3];
      Object.assign(shooter, { x: 4, z: 20, yaw: 0, pitch: 0, crouch: shooterCrouched ? 1 : 0 });
      Object.assign(target, { x: 4, z: 14, crouch: crouched ? 1 : 0 });
      stepMatch(m, { 0: { fire: true, aim: true, yaw: 0, pitch: 0, crouch: shooterCrouched }, 3: { crouch: crouched } }, 1 / 120);
      return m.shots.at(-1)!;
    };
    const standHead = fireAt(false, false);
    expect(standHead.target).toBe(3); expect(standHead.head).toBe(true);
    expect(fireAt(true, false).target).toBeNull();
    const crouchHead = fireAt(true, true);
    expect(crouchHead.target).toBe(3); expect(crouchHead.head).toBe(true);
    const crouchedAtStanding = fireAt(false, true);
    expect(crouchedAtStanding.target).toBe(3); expect(crouchedAtStanding.head).toBe(false);
  });
  it('clears crouch on death and on the next round', () => {
    const m = live(), p = m.actors[0];
    tick(m, .3, { crouch: true }); expect(p.crouch).toBe(1);
    p.hp = 0; stepMatch(m, { 0: { crouch: true } }, 1 / 120); expect(p.crouch).toBe(0);
    const n = live(), q = n.actors[0]; tick(n, .3, { crouch: true });
    n.phase = 'round-over'; n.timer = .001; stepMatch(n, {}, 1 / 120);
    expect(q.crouch).toBe(0); expect(eyeHeight(q)).toBe(STAND_EYE_HEIGHT);
  });
  it('ignores non-boolean crouch input and keeps the amount bounded', () => {
    const m = live(), p = m.actors[0];
    tick(m, 1, { crouch: 'yes' as unknown as boolean });
    expect(p.crouch).toBe(0);
    tick(m, 1, { crouch: true });
    expect(p.crouch).toBe(1);
  });
});
