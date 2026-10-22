import { describe, expect, it } from 'vitest';
import { Bmp, inPalette } from './pixel';
import { activeKeyBmp, badgeBmp, badgeTier, iconBmp, nodeBmp, raysBmp, xpBarBmp, XP_BAR_W, NODE_PX } from './levelArt';
import { SKILLS } from '../engine/skills';

/** 每個像素：完全透明或完全不透明，而且顏色在統一色票裡 */
function clean(b: Bmp): boolean {
  for (const v of b.px) {
    const a = v >>> 24;
    if (a === 0) continue;
    if (a !== 255 || !inPalette(Bmp.unpack(v))) return false;
  }
  return true;
}
const filled = (b: Bmp): number => b.px.reduce((n, v) => n + (v >>> 24 ? 1 : 0), 0);

describe('levelArt', () => {
  it('every skill has an icon; locked icons are grey; all palette-only with no semi-transparent pixels', () => {
    for (const s of SKILLS) {
      const a = iconBmp(s.id), g = iconBmp(s.id, true);
      expect(filled(a)).toBeGreaterThan(10);
      expect(clean(a) && clean(g)).toBe(true);
      expect(a.w).toBeLessThanOrEqual(NODE_PX - 6);
      expect(a.h).toBeLessThanOrEqual(NODE_PX - 8);
      for (const look of ['locked', 'open', 'partial', 'learned'] as const) {
        const n = nodeBmp(s.id, s.kind, look, 1, s.max, look === 'open');
        expect(n.w).toBe(NODE_PX);
        expect(clean(n)).toBe(true);
      }
    }
  });
  it('node frames differ by kind (passive square, active / keystone cut corners)', () => {
    const p = nodeBmp('b_vigor', 'passive', 'open', 0, 5), a = nodeBmp('b_dash', 'active', 'open', 0, 1), k = nodeBmp('b_fury', 'keystone', 'open', 0, 1);
    expect(p.on(2, 2)).toBe(true);
    expect(a.on(1, 1)).toBe(false);
    expect(k.on(3, 3)).toBe(false);
    expect(k.on(11, 1)).toBe(true);
  });
  it('xp bar fill follows the fraction; flash turns it gold', () => {
    const empty = xpBarBmp(0), half = xpBarBmp(0.5), full = xpBarBmp(1), gold = xpBarBmp(0.5, true);
    expect(empty.w).toBe(XP_BAR_W);
    const greenAt = (b: Bmp, x: number): boolean => { const c = b.get(x, 3); return c[1] > c[0] && c[1] > 120; };
    expect(greenAt(empty, 10)).toBe(false);
    expect(greenAt(half, 10)).toBe(true);
    expect(greenAt(half, XP_BAR_W - 10)).toBe(false);
    expect(greenAt(full, XP_BAR_W - 4)).toBe(true);
    expect(gold.get(10, 3)).not.toEqual(half.get(10, 3));
    for (const b of [empty, half, full, gold]) expect(clean(b)).toBe(true);
  });
  it('badge widens with digits; milestone tiers change the frame colour', () => {
    expect(badgeBmp(9).w).toBeLessThan(badgeBmp(10).w);
    expect(badgeTier(4).zh).not.toBe(badgeTier(5).zh);
    expect(badgeTier(50).zh).toBe(badgeTier(40).zh);
    expect(badgeBmp(1).get(2, 2)).not.toEqual(badgeBmp(25).get(2, 2));
    expect(clean(badgeBmp(37)) && clean(badgeBmp(3, true))).toBe(true);
  });
  it('active key faces and rays are clean too', () => {
    for (const a of ['dash', 'slam', 'pulse'] as const) for (const cd of [0, 0.5, 1]) expect(clean(activeKeyBmp(a, cd))).toBe(true);
    expect(clean(raysBmp(60, 30, 0.3))).toBe(true);
  });
});
