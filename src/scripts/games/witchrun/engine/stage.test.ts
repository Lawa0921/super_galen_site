// stage.test.ts
import { describe, it, expect } from 'vitest';
import { STAGES, StageRunner } from './stage';
import type { StageId } from './types';

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

  // ---- F3.2 elite 中型機 ----

  it('每關恰好有一筆 elite=true 的波次', () => {
    for (const s of [1, 2, 3, 4] as StageId[]) {
      const elites = STAGES[s].waves.filter((w) => w.elite === true);
      expect(elites).toHaveLength(1);
    }
  });

  it('每關 elite 出現時間在 45000–60000 ms 之間', () => {
    for (const s of [1, 2, 3, 4] as StageId[]) {
      const elite = STAGES[s].waves.find((w) => w.elite === true)!;
      expect(elite.atMs).toBeGreaterThanOrEqual(45000);
      expect(elite.atMs).toBeLessThanOrEqual(60000);
    }
  });

  it('S1 elite 是 fairy，S2 tome，S3 gear，S4 chime', () => {
    expect(STAGES[1].waves.find((w) => w.elite)!.kind).toBe('fairy');
    expect(STAGES[2].waves.find((w) => w.elite)!.kind).toBe('tome');
    expect(STAGES[3].waves.find((w) => w.elite)!.kind).toBe('gear');
    expect(STAGES[4].waves.find((w) => w.elite)!.kind).toBe('chime');
  });

  it('StageRunner.step 透傳 elite 旗標給 StageSpawn', () => {
    const r = new StageRunner(1);
    const eliteEntry = STAGES[1].waves.find((w) => w.elite)!;
    // 推進到 elite 出現時間前
    r.step(eliteEntry.atMs - 1);
    const before = r.step(2);
    const eliteSpawn = before.find((sp) => sp.elite === true);
    expect(eliteSpawn).toBeDefined();
  });
});
