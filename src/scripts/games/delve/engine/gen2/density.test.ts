// density.test.ts — gen2 驚喜密度（M2a Task 21，spec §4.4「±50,000 格內（陸 + 海）任意連續 340 格至少一個值得停下的東西、
// 任意 1,800 格至少一個大東西」）。「值得停下的東西」與「大東西」的定義見 testUtil.pois（計畫「規格模糊處與作者裁決」5）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { pois, maxGap, gapsOf } from './testUtil';

// 最大的幾個空隙（失敗訊息用）
const worst = (g: { at: number; w: number }[]): string => [...g].sort((p, q) => q.w - p.w).slice(0, 3).map((q) => `${q.w}@${q.at}`).join(' ');

describe('gen2 驚喜密度（Task 21）', () => {
  // 修正回合 2（T21-12）：種子從 3 個擴到 10 個（dens-e / f / g 在「含坑道的槽不放小點位」時是 350 / 343 / 341）；每個種子約 1–2 s
  it('驚喜密度（陸地 + 海，±50,000，10 個種子）：任意 340 格內有東西、任意 1,800 格內有大東西', () => {
    for (const seed of ['dens-a', 'dens-b', 'dens-c', 'dens-d', 'dens-e', 'dens-f', 'dens-g', 'dens-h', 'dens-i', 'dens-j']) {
      const { small, big } = pois(new Gen2Source(seed), -50_000, 50_000);
      // DELVE_MEASURE=1 時印出各種子的最大空隙（報告用）；平常不印
      if (process.env.DELVE_MEASURE === '1') console.info('[gen2 density]', seed, 'small max gap', maxGap(small), 'big max gap', maxGap(big), 'small n', small.length, 'big n', big.length);
      expect(maxGap(small), `${seed} small ${worst(gapsOf(small))}`).toBeLessThan(340);
      expect(maxGap(big), `${seed} big ${worst(gapsOf(big))}`).toBeLessThan(1800);
    }
  }, 300_000);

  // 修正回合 1：家鄉補空隙地廳的規則（anchors.homeAnchors）用的是保守估計（homeBigCover）；這裡用真實的藍圖外框驗 150 個家鄉
  it('家鄉（150 個種子，真實藍圖外框）：大東西之間沒有 ≥ 1,800 的空隙', () => {
    const bad: string[] = [];
    for (let k = 0; k < 150; k++) {
      const seed = `dens-home-${k}`, g = new Gen2Source(seed), h = g.layout.origin.home!, { big } = pois(g, h.x0, h.x1), w = maxGap(big);
      if (w >= 1800) bad.push(`${seed} ${worst(gapsOf(big))}`);
    }
    expect(bad).toEqual([]);
  }, 300_000);

  it('海上單獨也符合（只看海地塊的範圍）', () => {
    const g = new Gen2Source('dens-sea');
    for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7, 9]) {
      const m = g.layout.landmass(side, i), p = pois(g, m.x0, m.x1);
      expect(m.kind).toBe('sea');
      expect(maxGap(p.small, m.x0, m.x1), `${side}:${i} ${worst(gapsOf(p.small, m.x0, m.x1))}`).toBeLessThan(340);
      expect(p.big.length, `${side}:${i}`).toBeGreaterThanOrEqual(1);
    }
  }, 120_000);
});
