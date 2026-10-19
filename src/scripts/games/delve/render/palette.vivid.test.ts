// palette.vivid.test.ts — 配色要鮮明：男女預設造型各有一個主色 + 對比色，頭髮和衣服不糊成同一色；NPC 不會整身同色系
import { describe, it, expect } from 'vitest';
import { bodyDefaults } from '../engine/appearance';
import { folkLook, ROLES, type FolkRole } from '../engine/folkDefs';
import { Rng } from '../engine/rng';
import { clothRamp, hairRamp } from './avatarPalette';
import type { RGB } from './pixel';

const d2 = (a: RGB, b: RGB): number => { const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db); };
/** 棕 / 卡其 / 橘這一族（暖褐色）的衣服色 */
const BROWNISH = new Set([8, 9]);

describe('配色鮮明', () => {
  for (const body of [0, 1]) {
    it(`體型 ${body} 的預設：主色和副色對比夠、頭髮和主色分得開`, () => {
      const a = bodyDefaults(body);
      expect(a.color1).not.toBe(a.color2);
      expect(d2(clothRamp(a.color1)[3], clothRamp(a.color2)[3])).toBeGreaterThan(180);
      expect(d2(clothRamp(a.color1)[3], hairRamp(a.hairColor)[2])).toBeGreaterThan(150);
    });
  }
  it('NPC：主色和副色不同、不會兩個都是棕 / 卡其（整身糊成一色）', () => {
    for (const role of Object.keys(ROLES) as FolkRole[]) for (let s = 0; s < 120; s++) {
      const l = folkLook(role, new Rng(`v:${role}:${s}`));
      expect(l.app.color1, `${role} ${s}`).not.toBe(l.app.color2);
      expect(BROWNISH.has(l.app.color1) && BROWNISH.has(l.app.color2), `${role} ${s}`).toBe(false);
    }
  });
});
