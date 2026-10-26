// legacyTiles.measure.test.ts — 量舊生成器（generateWorld，正式尺寸 4200 × 1200）家鄉出現過的前景 tile 集合，對 gen2/legacyTiles.ts 的 LEGACY_HOME_TILES（M2a Task 17）。
// 平常不跑（每個種子生成一次整個舊世界）：DELVE_MEASURE=1 npx vitest run src/scripts/games/delve/engine/legacy/legacyTiles.measure.test.ts
// 先印出量測值再斷言：常數是空的時測試紅、但印出的值可以直接貼進 legacyTiles.ts；貼上後重跑必須綠。M2b 刪 legacy 時本檔跟著刪，常數留著。
import { describe, it, expect } from 'vitest';
import { generateWorld } from './worldgen';
import { LEGACY_HOME_TILES } from '../gen2/legacyTiles';

describe('舊生成器家鄉的 tile 集合', () => {
  it.runIf(process.env.DELVE_MEASURE === '1')('alpha / beta / gamma 家鄉 fg 的聯集 = LEGACY_HOME_TILES', () => {
    const measured = new Set<number>();
    for (const seed of ['alpha', 'beta', 'gamma']) for (const t of generateWorld(seed).world.fg) measured.add(t);
    const sorted = [...measured].sort((a, b) => a - b);
    console.info('[legacy tiles]', JSON.stringify(sorted));
    expect(sorted).toEqual(LEGACY_HOME_TILES);
    expect(measured.size).toBeGreaterThan(40);
  }, 300_000);
});
