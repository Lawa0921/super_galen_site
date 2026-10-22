import { describe, expect, it } from 'vitest';
import { createSoleContactProfile, sampleSoleContact, type SolePoint } from './sole-contact';

const radians = (degrees: number) => degrees * Math.PI / 180;
const rectangle: SolePoint[] = [-.1, .1].flatMap(z => [-.04, .04].map(x => ({ point: [x, 0, z], ballWeight: 0 })));

describe('source-derived rolling sole contact', () => {
  it('rolls around the actual supporting edge without ground penetration or sliding', () => {
    const profile = createSoleContactProfile(rectangle, [0, 0, -.05]);
    for (const degrees of [-10, -7.13, -2.31, 0, 1.17, 6.28, 10]) {
      const angle = radians(degrees), contact = sampleSoleContact(profile, angle);
      expect(contact.offsetY).toBeCloseTo(.1 * Math.abs(Math.sin(angle)), 6);
      expect(contact.offsetZ).toBeCloseTo(Math.sign(angle) * .1 * (1 - Math.cos(angle)), 6);
      const supportingZ = angle >= 0 ? .1 : -.1;
      expect(-supportingZ * Math.sin(angle) + contact.offsetY).toBeCloseTo(0, 6);
      expect(supportingZ * Math.cos(angle) + contact.offsetZ).toBeCloseTo(supportingZ, 6);
    }
  });

  it('counter-rotates the ball only during toe-off and uses the resulting skin surface', () => {
    const points: SolePoint[] = [{ point: [0, 0, .1], ballWeight: 0 }, { point: [0, 0, -.15], ballWeight: 1 }];
    const profile = createSoleContactProfile(points, [0, 0, -.05]);
    const angle = radians(-10), contact = sampleSoleContact(profile, angle);
    expect(contact.ballPitch).toBeCloseTo(-angle, 12);
    // The fully ball-weighted toe stays parallel to its unposed orientation;
    // only the transformed ball pivot contributes to its height and roll arc.
    expect(contact.offsetY).toBeCloseTo(-.05 * Math.sin(angle), 7);
    expect(contact.offsetZ).toBeCloseTo(-.05 * (1 - Math.cos(angle)), 7);
    expect(sampleSoleContact(profile, radians(10)).ballPitch).toBe(0);
  });

  it('does not mutate calibration and reuses the supplied output object', () => {
    const frozen = JSON.stringify(rectangle);
    const profile = createSoleContactProfile(rectangle, [0, 0, -.05]);
    const output = { offsetY: 999, offsetZ: 999, ballPitch: 999, supportMask: 999 };
    expect(sampleSoleContact(profile, 0, output)).toBe(output);
    expect(output).toEqual({ offsetY: 0, offsetZ: 0, ballPitch: 0, supportMask: 0 });
    expect(JSON.stringify(rectangle)).toBe(frozen);
  });

  it('rejects invalid source data and angles outside the measured profile', () => {
    expect(() => createSoleContactProfile([], [0, 0, 0])).toThrow();
    expect(() => createSoleContactProfile([{ point: [0, NaN, 0], ballWeight: .5 }], [0, 0, 0])).toThrow();
    expect(() => createSoleContactProfile([{ point: [0, 0, 0], ballWeight: 1.01 }], [0, 0, 0])).toThrow();
    const profile = createSoleContactProfile(rectangle, [0, 0, -.05]);
    expect(() => sampleSoleContact(profile, radians(10.01))).toThrow();
    expect(() => sampleSoleContact(profile, NaN)).toThrow();
  });

  it('keeps the lower forefoot as support at small positive pitch instead of guessing heel from the sign', () => {
    const profile = createSoleContactProfile([
      { point: [0, -.0014, -.107], ballWeight: 0, contactMask: 2 },
      { point: [0, 0, 0], ballWeight: 0, contactMask: 1 },
    ], [0, 0, -.05]);
    expect(sampleSoleContact(profile, radians(.3)).supportMask).toBe(2);
    expect(sampleSoleContact(profile, radians(3)).supportMask).toBe(1);
  });

  it('includes a third support patch which becomes lowest only inside a lookup cell', () => {
    const profile = createSoleContactProfile([
      { point: [0, 0, -.1], ballWeight: 0, contactMask: 1 },
      { point: [0, .1 * Math.tan(radians(.25)), .1], ballWeight: 0, contactMask: 1 },
      { point: [0, .0001, 0], ballWeight: 0, contactMask: 2 },
    ], [0, 0, -.05]);
    expect(sampleSoleContact(profile, 0).supportMask).toBe(1);
    expect(sampleSoleContact(profile, radians(.25)).supportMask).toBe(1);
    expect(sampleSoleContact(profile, radians(.125)).supportMask & 2).toBe(2);
  });
});
