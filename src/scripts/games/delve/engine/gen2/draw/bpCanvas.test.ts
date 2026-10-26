// bpCanvas.test.ts — BpCanvas：gen2 的共用繪製畫布（外框內畫格、讀不到畫過的就讀天然地層，最後輸出藍圖）
import { describe, it, expect } from 'vitest';
import { Gen2Source } from '../index';
import { BpCanvas } from './bpCanvas';
import { T } from '../../tiles';

describe('BpCanvas', () => {
  it('BpCanvas：沒畫過的格讀天然地層；畫過讀畫的；setSurface → ground；fillNatural → solid 箱；chest + addItem → BpChest.extra', () => {
    const src = new Gen2Source('cv'), x = 3000, s = src.profile.surfaceAt(x), L = src.layersAt(x), cv = new BpCanvas({ x: x - 5, y: s - 20, w: 11, h: 80 }, src.profile);
    expect(cv.fg(x, s - 1)).toBe(T.AIR); expect(cv.fg(x, s + 1)).toBe(T.DIRT); expect(cv.fg(x, L.rock + 1)).toBe(T.STONE);
    cv.setFg(x, s + 1, T.PLANKS); expect(cv.fg(x, s + 1)).toBe(T.PLANKS);
    expect(cv.surfaceAt(x)).toBe(s); cv.setSurface(x, s - 2); expect(cv.surfaceAt(x)).toBe(s - 2); cv.fillNatural(x - 3, s + 10); cv.fillNatural(x + 2, s + 30);
    cv.chest(x + 1, s - 1, 'cabin'); cv.addItem(x + 1, s - 1, 'magnet');
    const b = cv.toBlueprint(1, 'cabin', 1);
    expect(b.ground!.tops[x - b.ground!.x0]).toBe(s - 2); expect(b.solid).toEqual({ x: x - 3, y: s + 10, w: 6, h: 21 });
    expect(b.chests).toEqual([{ x: x + 1, y: s - 1, kind: 'cabin', extra: ['magnet'] }]);
    expect(() => cv.setFg(x + 50, s, T.AIR)).toThrow(RangeError);
  });
});
