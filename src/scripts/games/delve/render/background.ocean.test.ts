// background.ocean.test.ts — BIOME.OCEAN 的遠景組：有自己的剪影、色表與天色傾向，全部取自統一色票。
import { describe, it, expect, afterAll } from 'vitest';
import { installFakeCanvas } from './fakeCanvas';
import { Background, BIOME_DAY, BIOME_LITE, BIOME_DARK, SKY_TINT } from './background';
import { PALETTE_HEX } from './pixel';

const restore = installFakeCanvas();
afterAll(() => restore());

describe('BIOME.OCEAN 遠景', () => {
  it('海有自己的三層剪影（不是森林的）', () => {
    const bg = new Background(7);
    for (let k = 0; k < 3; k++) expect(bg.layerFor(4, k)).not.toBe(bg.layerFor(0, k));
  });
  it('近層 deep、遠 / 中 / 近各有內容', () => {
    const bg = new Background(7);
    expect(bg.layerFor(4, 2).deep).toBe(true);
    for (let k = 0; k < 3; k++) expect(bg.layerFor(4, k).idx.some((v) => v > 0)).toBe(true);
  });
  it('色表與天色傾向都在色票內', () => {
    for (const t of [BIOME_DAY, BIOME_LITE, BIOME_DARK]) for (const c of t[4]) expect(PALETTE_HEX).toContain(c);
    expect(SKY_TINT[4].every((c) => (PALETTE_HEX as readonly string[]).includes(c))).toBe(true);
  });
});
