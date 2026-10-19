import { describe, expect, it } from 'vitest';
import { WAIST_ROW, beardRamp, dwarfify, findChin } from './folkArt';
import { dollPreview } from './dollPreview';
import { dollKey, plainLook } from '../engine/doll';
import { bodyDefaults } from '../engine/appearance';
import { HAIR_RAMPS } from './avatarPalette';
import { AV_FH, AV_FW } from './avatarArt';
import { Bmp, inPalette } from './pixel';

const topRow = (b: Bmp): number => { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) return y; return -1; };
const key = (v: number): number => ((v & 255) << 16) | (((v >>> 8) & 255) << 8) | ((v >>> 16) & 255);

describe('dwarfify（矮人外觀）', () => {
  for (const body of [0, 1]) {
    const app = { ...bodyDefaults(body), hairColor: 1 };
    const l = plainLook(app);
    const f = dollPreview(l, dollKey(l), 'idle', 0);
    it(`體型 ${body}：尺寸不變、變矮、腳底不動`, () => {
      const d = dwarfify(f, null, 5, app.skin);
      expect(d.w).toBe(AV_FW); expect(d.h).toBe(AV_FH);
      expect(topRow(d) - topRow(f)).toBeGreaterThanOrEqual(4);
      for (let y = WAIST_ROW; y < AV_FH; y++) for (let x = 0; x < AV_FW; x++) expect(d.raw(x, y)).toBe(f.raw(x, y));
    });
    it(`體型 ${body}：下巴找得到，鬍子畫在下巴附近、全在色票上、沒有半透明`, () => {
      const plain = dwarfify(f, null, 5, app.skin);
      const c0 = findChin(f, undefined, app.skin)!;
      expect(c0).not.toBeNull();
      const chin = { ...c0, y: c0.y + 5 };
      const beard = beardRamp(app.hairColor);
      const d = dwarfify(f, beard, 5, app.skin);
      const bset = new Set(beard.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
      let n = 0;
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
        const v = d.raw(x, y);
        if (!(v >>> 24)) continue;
        expect(v >>> 24).toBe(255);
        expect(inPalette(Bmp.unpack(v))).toBe(true);
        if (v !== plain.raw(x, y) && bset.has(key(v))) { n++; expect(Math.abs(y - chin.y)).toBeLessThanOrEqual(8); }
      }
      expect(n).toBeGreaterThan(20);
    });
  }
  it('每種膚色（含深色膚色 + 棕色衣服）都找得到下巴、畫得出鬍子', () => {
    for (let skin = 0; skin < 5; skin++) {
      const app = { ...bodyDefaults(1), skin, hairColor: 0 };
      const l = plainLook(app);
      const f = dollPreview(l, dollKey(l), 'walk', 2);
      const c = findChin(f, undefined, skin)!;
      expect(c, `skin ${skin}`).not.toBeNull();
      expect(c.y).toBeGreaterThan(20);
      // 頭 23×22：下巴在第 33 列附近（軀幹從第 34 列開始）
      expect(c.y).toBeLessThan(36);
      const d = dwarfify(f, beardRamp(0), 5, skin), p = dwarfify(f, null, 5, skin);
      let n = 0;
      for (let i = 0; i < d.px.length; i++) if (d.px[i] !== p.px[i]) n++;
      expect(n, `skin ${skin}`).toBeGreaterThan(20);
    }
  });
  it('鬍子色階跟髮色走（超出範圍夾回）', () => {
    expect(beardRamp(3)).toEqual(HAIR_RAMPS[3]);
    expect(beardRamp(99)).toEqual(HAIR_RAMPS[HAIR_RAMPS.length - 1]);
    expect(beardRamp(-1)).toEqual(HAIR_RAMPS[0]);
  });
});
