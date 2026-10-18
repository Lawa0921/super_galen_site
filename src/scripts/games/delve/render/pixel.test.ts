// pixel.test.ts — 點陣工具：描邊、scale2x、RotSprite 旋轉。
import { describe, it, expect } from 'vitest';
import { Bmp, scale2x, rotPrep, rotate, INK, bayer, PALETTE, snap, snapBmp, nudge, inPalette, luma } from './pixel';

const RED: [number, number, number] = [200, 30, 30];

describe('Bmp.outline', () => {
  it('只在 4 鄰外圍補一圈描邊', () => {
    const b = new Bmp(5, 5);
    b.set(2, 2, RED);
    b.outline();
    const on = [...b.px].filter((v) => v !== 0).length;
    expect(on).toBe(5);
    expect(b.get(2, 1)).toEqual(INK);
    expect(b.on(1, 1)).toBe(false);
  });
});

describe('scale2x', () => {
  it('尺寸加倍、方塊外角被修圓、內部不變', () => {
    const b = new Bmp(3, 3);
    b.rect(0, 0, 3, 3, RED);
    const o = scale2x(b);
    expect(o.w).toBe(6);
    expect(o.on(0, 0)).toBe(false);
    expect(o.on(1, 0)).toBe(true);
    for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) expect(o.on(x, y)).toBe(true);
  });
  it('對角線不會被放大成鋸齒階梯（EPX 補角）', () => {
    const b = new Bmp(3, 3);
    b.set(0, 0, RED); b.set(1, 1, RED); b.set(2, 2, RED);
    const o = scale2x(b);
    // 對角之間的缺口被補上 (2,1)，遠離對角線的 (3,0) 保持透明
    expect(o.on(2, 1)).toBe(true);
    expect(o.on(3, 0)).toBe(false);
  });
});

describe('rotate', () => {
  it('0 度旋轉 = 原圖（以軸心置中）', () => {
    const b = new Bmp(4, 6);
    b.rect(1, 0, 2, 6, RED);
    const r = rotate(rotPrep(b), 2, 0, 0, 16);
    // 軸心 (2,0) → (8,8)；直條在 x=7..8、y=8..13
    for (let y = 8; y < 14; y++) { expect(r.on(7, y)).toBe(true); expect(r.on(8, y)).toBe(true); expect(r.on(9, y)).toBe(false); }
    expect(r.on(7, 7)).toBe(false);
  });
  it('90 度（順時針）後直條變成往左的橫條', () => {
    const b = new Bmp(4, 6);
    b.rect(1, 0, 2, 6, RED);
    const r = rotate(rotPrep(b), 2, 0, Math.PI / 2, 16);
    expect(r.on(4, 7) || r.on(4, 8)).toBe(true);
    expect(r.on(12, 8)).toBe(false);
  });
});

describe('bayer', () => {
  it('門檻落在 (0,1) 且 4×4 內不重複', () => {
    const s = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = bayer(x, y); expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); s.add(v); }
    expect(s.size).toBe(16);
  });
});

describe('統一色票', () => {
  it('32–51 色、不重複、INK 在色票內（第 51 色 = 史詩紫）', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(32);
    expect(PALETTE.length).toBeLessThanOrEqual(51);
    expect(new Set(PALETTE.map((c) => c.join())).size).toBe(PALETTE.length);
    expect(inPalette(INK)).toBe(true);
  });
  it('snap：色票內的顏色不變；任意顏色都吸附到色票上的最近色', () => {
    for (const c of PALETTE) expect(snap(c)).toEqual(c);
    for (const c of [[0, 0, 0], [255, 255, 255], [120, 80, 200], [30, 160, 90], [250, 128, 10]] as [number, number, number][]) {
      expect(inPalette(snap(c))).toBe(true);
    }
    // 接近純白 → 白
    expect(snap([250, 252, 251])).toEqual([255, 255, 255]);
  });
  it('snapBmp：只改不透明像素、輸出全部在色票內、透明保持透明且不產生半透明', () => {
    const b = new Bmp(4, 4);
    b.set(0, 0, [123, 45, 67]);
    b.set(1, 0, [10, 200, 10], 128);
    b.set(2, 0, [200, 200, 30]);
    snapBmp(b);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const a = b.alpha(x, y);
      if (x <= 2 && y === 0) {
        expect(a).toBe(255);
        expect(inPalette(b.get(x, y))).toBe(true);
      } else expect(a).toBe(0);
    }
  });
  it('nudge：往暗 / 往亮一階，結果在色票內且確實不同', () => {
    for (const c of PALETTE) {
      const d = nudge(c, -1), l = nudge(c, 1);
      expect(inPalette(d)).toBe(true);
      expect(inPalette(l)).toBe(true);
      expect(luma(d)).toBeLessThanOrEqual(luma(c));
      expect(luma(l)).toBeGreaterThanOrEqual(luma(c));
    }
    const mid: [number, number, number] = PALETTE[Math.floor(PALETTE.length / 2)];
    expect(nudge(mid, -1)).not.toEqual(mid);
    // 霧綠往暗要留在綠 / 青色系，不能跳到亮度幾乎一樣的藍灰
    const d = nudge([0x6a, 0x9c, 0x88], -1);
    expect(luma([0x6a, 0x9c, 0x88]) - luma(d)).toBeGreaterThanOrEqual(15);
    expect(d[1]).toBeGreaterThan(d[0]);
  });
});
