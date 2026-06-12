// stage.test.ts
import { describe, it, expect } from 'vitest';
import { STAGES, StageRunner } from './stage';

describe('stage', () => {
  it('4 關都有波次表與 Boss', () => {
    for (const s of [1, 2, 3, 4] as const) {
      expect(STAGES[s].waves.length).toBeGreaterThan(5);
      expect(STAGES[s].boss).toBeTruthy();
      // 波次表按時間排序
      const times = STAGES[s].waves.map((w) => w.atMs);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it('關卡敵種符合場景語言', () => {
    expect(STAGES[1].waves.every((w) => ['bat', 'wisp', 'fairy'].includes(w.kind))).toBe(true);
    expect(STAGES[2].waves.every((w) => ['tome', 'blade', 'fairy'].includes(w.kind))).toBe(true);
    expect(STAGES[3].waves.every((w) => ['gear', 'angel', 'blade'].includes(w.kind))).toBe(true);
    expect(STAGES[4].waves.every((w) => ['moth', 'chime', 'fairy'].includes(w.kind))).toBe(true);
    expect(STAGES[4].boss).toBe('deadbell');
  });

  it('runner 依時間吐出生成、不重複', () => {
    const r = new StageRunner(1);
    const first = STAGES[1].waves[0];
    expect(r.step(first.atMs - 1)).toHaveLength(0);
    const spawns = r.step(2); // 跨過第一筆
    expect(spawns.length).toBeGreaterThanOrEqual(1);
    expect(spawns[0].kind).toBe(first.kind);
  });

  it('波次跑完 → wavesDone=true', () => {
    const r = new StageRunner(1);
    r.step(10 * 60 * 1000);
    expect(r.wavesDone).toBe(true);
  });
});
