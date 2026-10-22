// sprites.held.test.ts — 手持武器的點陣：只畫武器（不畫手臂）的那張給「舉過頭」時疊在頭的前面用
import { describe, it, expect } from 'vitest';
import { armBmp } from './sprites';
import { plainLook } from '../engine/doll';
import { DEFAULT_APPEARANCE } from '../engine/appearance';
import { skinRamp } from './avatarPalette';
import { Bmp } from './pixel';

describe('armBmp', () => {
  const l = plainLook(DEFAULT_APPEARANCE);
  const sk = new Set(skinRamp(l.app.skin).map((c) => c.join()));
  const count = (b: Bmp, f: (c: string) => boolean): number => { let n = 0; for (const v of b.px) if (v >>> 24 && f(Bmp.unpack(v).join())) n++; return n; };
  it('itemOnly：只有刀身 / 鎬（沒有膚色的手），和整張的武器像素一樣多', () => {
    const full = armBmp(l, false, null, 'iron_sword'), only = armBmp(l, false, null, 'iron_sword', true);
    expect(count(full, (c) => sk.has(c))).toBeGreaterThan(3);
    expect(count(only, (c) => sk.has(c))).toBe(0);
    expect(count(only, () => true)).toBeGreaterThan(20);
    expect(count(armBmp(l, false, 'iron_pickaxe', null, true), () => true)).toBeGreaterThan(20);
  });
});
