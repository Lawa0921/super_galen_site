// oreBaseline.measure.test.ts — 量舊生成器（generateWorld，正式尺寸 4200 × 1200）的礦物密度，對 gen2/oreBaseline.ts 的 LEGACY_ORE_DENSITY（M2a Task 13）。
// 平常不跑（每個種子生成一次整個舊世界）：DELVE_MEASURE=1 npx vitest run src/scripts/games/delve/engine/legacy/oreBaseline.measure.test.ts
// 量法同 gen2/ores.test.ts（gen2/testUtil.oreTally）：層線用舊生成器自己的 surface / layers.rock / deep / molten（每欄一條），x ∈ [100, 4100)。
// 先印出量測值再斷言：常數是佔位值時測試紅、但印出的值可以直接貼進 oreBaseline.ts；貼上後重跑必須綠。M2b 刪 legacy 時本檔跟著刪，常數留著。
import { describe, it, expect } from 'vitest';
import { generateWorld } from './worldgen';
import { LEGACY_ORE_DENSITY, ORES4, BANDS4 } from '../gen2/oreBaseline';
import { newOreTally, tallyColumn, oreDensity, meanDensity, ORE_X0, ORE_X1, type OreTally } from '../gen2/testUtil';

function measureSeed(seed: string): OreTally {
  const r = generateWorld(seed), g = r.world, W = g.width, H = g.height, fg = g.fg;
  const t = newOreTally();
  for (let x = ORE_X0; x < ORE_X1; x++) {
    tallyColumn(t, (y) => fg[y * W + x], { surface: r.surface[x], rock: r.layers.rock[x], deep: r.layers.deep[x], molten: r.layers.molten[x] }, H);
  }
  return t;
}

function measureLegacy(seeds: readonly string[]): ReturnType<typeof meanDensity> {
  const ts = seeds.map(measureSeed);
  // 每個種子各帶的礦格數與總格數一併印出（報告用）
  console.info('[ore baseline counts]', JSON.stringify(ts.map((t) => ({ ore: t.ore, cells: t.cells }))));
  return meanDensity(ts.map(oreDensity));
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

describe('舊生成器礦物密度基準', () => {
  it.runIf(process.env.DELVE_MEASURE === '1')('舊生成器礦物密度 = LEGACY_ORE_DENSITY（±30%）', () => {
    const m = measureLegacy(['alpha', 'beta', 'gamma']);
    const shown = Object.fromEntries(ORES4.map((o) => [o, Object.fromEntries(BANDS4.map((b) => [b, round3(m[o][b])]))]));
    console.info('[ore baseline]', JSON.stringify(shown));
    for (const ore of ORES4) {
      expect(Math.max(...BANDS4.map((b) => m[ore][b])), ore).toBeGreaterThan(0);
      for (const band of BANDS4) {
        const rec = LEGACY_ORE_DENSITY[ore][band], now = m[ore][band];
        expect(Number.isFinite(now)).toBe(true);
        if (rec >= 0.2) { expect(now, `${ore}/${band}`).toBeGreaterThanOrEqual(rec * 0.7); expect(now, `${ore}/${band}`).toBeLessThanOrEqual(rec * 1.3); }
        else expect(now, `${ore}/${band}`).toBeLessThan(0.5);
      }
    }
  }, 300_000);
});
