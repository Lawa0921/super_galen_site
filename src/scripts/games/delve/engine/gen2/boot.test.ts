// boot.test.ts — gen2 家鄉完整開機（Task 11 修正 2）：homeSites（開局登錄聚落）+ 建家鄉全部藍圖，0 個 RangeError、0 個跨層重疊（部件判定）。
// 新前綴 boot- 的 5000 個家鄉（切成 3 段，各自逾時），另含先前抓到的開機失敗種子 rv-1247、zz-937（礦坑密室通地表撞村莊，T10 既有）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { homeSites } from './home';
import { overlapPairs } from './testUtil';

function boot(seeds: readonly string[]): string[] {
  const bad: string[] = [];
  for (const seed of seeds) {
    try {
      // 每個種子新建一份（不進 srcOf 的快取）
      const g = new Gen2Source(seed), h = g.layout.origin.home!;
      homeSites(g);
      const op = overlapPairs(g.blueprints.overlapping(h.x0, h.x1));
      if (op.length) bad.push(`${seed}: overlap ${JSON.stringify(op[0])}`);
    } catch (e) { if (!(e instanceof RangeError)) throw e; bad.push(`${seed}: ${e.message}`); }
  }
  return bad;
}

describe('gen2 家鄉完整開機', () => {
  it('先前的開機失敗種子：rv-1247、zz-937 0 個 RangeError、0 個跨層重疊', () => { expect(boot(['rv-1247', 'zz-937'])).toEqual([]); }, 60_000);
  for (const [a, b] of [[0, 1700], [1700, 3400], [3400, 5000]] as const) {
    it(`boot-${a}..${b - 1}：0 個 RangeError、0 個跨層重疊`, () => {
      expect(boot(Array.from({ length: b - a }, (_, k) => `boot-${a + k}`)).slice(0, 5)).toEqual([]);
    }, 300_000);
  }
});
