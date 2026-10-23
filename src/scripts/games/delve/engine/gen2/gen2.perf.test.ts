// gen2.perf.test.ts — gen2 每欄 fill 效能。自動門檻放寬到 3×（機器負載容忍）；spec §4.3 的 2× / 每 chunk 8 ms 由閒置機器實測把關（裁決 P5）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { OuterGen, type CentralFrame } from '../legacy/chunkgen';
import type { ColumnSource } from '../column';
import { fillCol, range } from './testUtil';

const F: CentralFrame = { width: 4200, height: 1200, edgeL: 330, edgeR: 345, cavernY: 560, moltenY: 1010 };

describe('gen2 效能', () => {
  it('每欄 fill：中位數 ≤ 3 × v1（負載容忍）、p95 ≤ 40 ms（最壞值只記錄；單一最慢樣本會被負載抖動拉高；一欄 38 個 chunk → 每 chunk 遠低於 8 ms）', () => {
    const v1 = new OuterGen('perf', F), g2 = new Gen2Source('perf');
    const time = (src: ColumnSource, cxs: number[]): number[] => {
      for (const cx of [...cxs.slice(0, 10), ...cxs.slice(Math.floor(cxs.length / 2), Math.floor(cxs.length / 2) + 10)]) fillCol(src, cx); // 暖機（前後兩段範圍各 10 欄）
      return cxs.map((cx) => { const t0 = performance.now(); fillCol(src, cx); return performance.now() - t0; }).sort((a, b) => a - b);
    };
    const t1 = time(v1, range(160, 200)), t2 = time(g2, [...range(160, 200), ...range(20, 60)]);
    const m1 = t1[t1.length >> 1], m2 = t2[t2.length >> 1], worst = t2.at(-1)!, p95 = t2[Math.ceil(t2.length * 0.95) - 1];
    console.info('[gen2 perf] v1 median ms', m1.toFixed(3), 'gen2 median ms', m2.toFixed(3), 'median ratio', (m2 / m1).toFixed(2), 'p95 ms', p95.toFixed(2), 'worst ms', worst.toFixed(2));
    expect(m2).toBeLessThanOrEqual(3 * m1);
    expect(p95).toBeLessThanOrEqual(40);
  });
});
