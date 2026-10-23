import { describe, expect, it } from 'vitest';
import { PIXEL_FONT, pixelText } from './pixelText';

describe('pixelText (legibility Task 4)', () => {
  it('uses Cubic 11 at 12 or 24 px, normal weight, a 1px or 2px outline', () => {
    for (const size of [12, 24] as const) {
      const t = pixelText('暴擊！', size, 0xff9a3c);
      expect(t.text).toBe('暴擊！');
      expect(t.style.fontFamily).toEqual(PIXEL_FONT);
      expect(PIXEL_FONT[0]).toBe('Cubic 11');
      expect(t.style.fontSize).toBe(size);
      expect(t.style.fontWeight).toBe('normal');
      expect(t.style.fill).toBe(0xff9a3c);
      // A stroke straddles the glyph's edge: width size/6 shows as a 1px (12px) or 2px (24px) outline.
      expect(t.style.stroke).toMatchObject({ color: 0x000000, width: size / 6 });
    }
    expect(pixelText('記', 24, 0xe8c46a, 0x14100a).style.stroke).toMatchObject({ color: 0x14100a, width: 4 });
    // Scaled by a tween (a hit's pop, a lunge, the screen's punch), it stays whole pixels, never smeared (T4 review).
    expect(pixelText('30', 24, 0xffffff).textureStyle.scaleMode).toBe('nearest');
  });
});
