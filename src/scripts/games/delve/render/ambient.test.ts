// ambient.test.ts — 環境粒子：依所在區域挑種類、數量上限、只用色票色、生在畫面內
import { describe, it, expect } from 'vitest';
import { ambientKind, AmbientField, AMBIENT_CAP, AMBIENT_COLORS, type AmbientKind } from './ambient';
import { inPalette, hex } from './pixel';

const at = (o: Partial<Parameters<typeof ambientKind>[0]>): AmbientKind | null => ambientKind({
  molten: false, mushroom: false, outdoors: false, underground: false, biome: 0, sky: 1, ...o,
});

describe('ambientKind', () => {
  it('熔岩 > 菇林 > 雪原地表 > 森林夜晚地表 > 洞穴', () => {
    expect(at({ molten: true, underground: true })).toBe('ember');
    expect(at({ mushroom: true, underground: true })).toBe('spore');
    expect(at({ outdoors: true, biome: 2 })).toBe('snow');
    expect(at({ outdoors: true, biome: 0, sky: 0.12 })).toBe('firefly');
    expect(at({ outdoors: true, biome: 0, sky: 1 })).toBeNull();
    expect(at({ underground: true })).toBe('dust');
  });
});

describe('AmbientField', () => {
  it('數量有上限、位置在畫面（含邊距）內、顏色都在色票上', () => {
    const f = new AmbientField(() => 0.5);
    let r = 1;
    const rnd = (): number => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    const fr = new AmbientField(rnd);
    for (const k of ['ember', 'spore', 'snow', 'firefly', 'dust'] as AmbientKind[]) {
      for (let i = 0; i < 600; i++) fr.step(1 / 60, k, { x: 1000, y: 2000, w: 640, h: 360 });
      expect(fr.particles.length).toBeLessThanOrEqual(AMBIENT_CAP);
      expect(fr.particles.length).toBeGreaterThan(5);
      for (const p of fr.particles) {
        expect(p.x).toBeGreaterThanOrEqual(1000 - 40); expect(p.x).toBeLessThanOrEqual(1640 + 40);
        expect(p.y).toBeGreaterThanOrEqual(2000 - 40); expect(p.y).toBeLessThanOrEqual(2360 + 40);
      }
      for (const c of AMBIENT_COLORS[k]) expect(inPalette(hex(c))).toBe(true);
    }
    // 沒有種類 → 逐漸淡出清空
    for (let i = 0; i < 600; i++) fr.step(1 / 60, null, { x: 1000, y: 2000, w: 640, h: 360 });
    expect(fr.particles.length).toBe(0);
    void f;
  });
});
