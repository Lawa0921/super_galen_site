// enemy.test.ts
import { describe, it, expect } from 'vitest';
import { ENEMY_DEFS, makeEnemy, stepEnemy } from './enemy';
import { FIELD_H } from './constants';

/** 固定種子 RNG（線性同餘，可重現） */
function makeRng(seed = 42): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

describe('enemy', () => {
  it('9 種敵兵都有定義（hp/速度/開火參數）', () => {
    const kinds = ['bat', 'wisp', 'fairy', 'tome', 'blade', 'gear', 'angel', 'moth', 'chime'] as const;
    for (const k of kinds) {
      const d = ENEMY_DEFS[k];
      expect(d.hp).toBeGreaterThan(0);
      expect(d.fireIntervalMs).toBeGreaterThan(0);
    }
  });

  it('descend 路徑往下移動', () => {
    const e = makeEnemy(1, 'bat', 100, -20, 'descend');
    stepEnemy(e, 1000, { px: 240, py: 560 }, makeRng());
    expect(e.y).toBeGreaterThan(-20);
  });

  it('sine 路徑左右擺、整體下移', () => {
    const e = makeEnemy(1, 'fairy', 200, 0, 'sine');
    const xs: number[] = [];
    const rng = makeRng();
    for (let i = 0; i < 30; i++) { stepEnemy(e, 100, { px: 240, py: 560 }, rng); xs.push(e.x); }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10); // 有橫向擺動
    expect(e.y).toBeGreaterThan(0);
  });

  it('hover 路徑下降到定點後停住', () => {
    const e = makeEnemy(1, 'tome', 100, -20, 'hover');
    const rng = makeRng();
    for (let i = 0; i < 100; i++) stepEnemy(e, 100, { px: 240, py: 560 }, rng);
    expect(e.y).toBeLessThan(FIELD_H * 0.4); // 停在上半場
  });

  it('開火冷卻歸零時回傳彈幕並重置冷卻', () => {
    const e = makeEnemy(1, 'bat', 240, 100, 'descend');
    e.fireCdMs = 0;
    const { spawns } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns.length).toBeGreaterThan(0);
    expect(e.fireCdMs).toBe(ENEMY_DEFS.bat.fireIntervalMs);
  });

  it('冷卻未到不開火', () => {
    const e = makeEnemy(1, 'bat', 240, 100, 'descend');
    e.fireCdMs = 5000;
    const { spawns } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns).toHaveLength(0);
  });

  // ---- F1.4：一敵一語言 ----

  it('bat (burst3)：開火出 3 顆同方向不同速', () => {
    const e = makeEnemy(1, 'bat', 240, 100, 'descend');
    e.fireCdMs = 0;
    const { spawns } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns).toHaveLength(3);
    // 三顆方向相同
    const a0 = Math.atan2(spawns[0].vy, spawns[0].vx);
    const a1 = Math.atan2(spawns[1].vy, spawns[1].vx);
    const a2 = Math.atan2(spawns[2].vy, spawns[2].vx);
    expect(a1).toBeCloseTo(a0, 4);
    expect(a2).toBeCloseTo(a0, 4);
    // 速率各不同
    const speeds = spawns.map((b) => Math.hypot(b.vx, b.vy));
    expect(speeds[0]).not.toBeCloseTo(speeds[1], 0);
    expect(speeds[1]).not.toBeCloseTo(speeds[2], 0);
  });

  it('wisp (drift)：開火出 1 顆帶 ax 偏移加速度', () => {
    const e = makeEnemy(1, 'wisp', 240, 100, 'descend');
    e.fireCdMs = 0;
    const { spawns } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns).toHaveLength(1);
    // drift 有 ax（偏移漂移）
    expect(spawns[0].ax).toBeDefined();
  });

  it('fairy (fan5)：開火出 5 顆扇形', () => {
    const e = makeEnemy(1, 'fairy', 240, 100, 'descend');
    e.fireCdMs = 0;
    const { spawns } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns).toHaveLength(5);
  });

  it('tome (spinRing)：開火出 8 顆環形', () => {
    const e = makeEnemy(1, 'tome', 240, 100, 'descend');
    e.fireCdMs = 0;
    const { spawns } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns).toHaveLength(8);
    // 速率一致
    const speeds = spawns.map((b) => Math.hypot(b.vx, b.vy));
    const s0 = speeds[0];
    for (const s of speeds) expect(s).toBeCloseTo(s0, 1);
  });

  it('blade (boomerang)：開火出 1 顆帶反向加速度', () => {
    const e = makeEnemy(1, 'blade', 240, 100, 'descend');
    e.fireCdMs = 0;
    const { spawns } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns).toHaveLength(1);
    // boomerang 有 ax/ay（非零）
    const b = spawns[0];
    expect(Math.hypot(b.ax ?? 0, b.ay ?? 0)).toBeGreaterThan(0);
  });

  it('gear (bounce)：開火出 3 顆 bounces=1', () => {
    const e = makeEnemy(1, 'gear', 240, 100, 'descend');
    e.fireCdMs = 0;
    const { spawns } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns).toHaveLength(3);
    for (const b of spawns) expect(b.bounces).toBe(1);
  });

  it('angel (beam) 第一次：回 telegraph，無彈幕，beamAim 設定', () => {
    const e = makeEnemy(1, 'angel', 240, 100, 'descend');
    e.fireCdMs = 0;
    const { spawns, telegraph } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns).toHaveLength(0);
    expect(telegraph).toBeDefined();
    expect(telegraph!.durMs).toBeGreaterThan(0);
    expect(e.beamAim).toBeDefined();
  });

  it('angel (beam) 第二次：出 8 顆同向，清除 beamAim', () => {
    const e = makeEnemy(1, 'angel', 240, 100, 'descend');
    // 模擬第一次已設定 beamAim
    e.beamAim = Math.PI / 2;
    e.fireCdMs = 0;
    const { spawns, telegraph } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns).toHaveLength(8);
    expect(telegraph).toBeUndefined();
    expect(e.beamAim).toBeUndefined();
    // 全部同向
    const a0 = Math.atan2(spawns[0].vy, spawns[0].vx);
    for (const b of spawns) {
      expect(Math.atan2(b.vy, b.vx)).toBeCloseTo(a0, 4);
    }
  });

  it('moth (dustCloud)：開火出 10 顆，種子固定可重現', () => {
    const e1 = makeEnemy(1, 'moth', 240, 100, 'descend');
    e1.fireCdMs = 0;
    const { spawns: s1 } = stepEnemy(e1, 16, { px: 240, py: 560 }, makeRng(123));
    expect(s1).toHaveLength(10);

    const e2 = makeEnemy(1, 'moth', 240, 100, 'descend');
    e2.fireCdMs = 0;
    const { spawns: s2 } = stepEnemy(e2, 16, { px: 240, py: 560 }, makeRng(123));
    // 相同種子→相同角度
    for (let i = 0; i < s1.length; i++) {
      expect(s1[i].vx).toBeCloseTo(s2[i].vx, 5);
      expect(s1[i].vy).toBeCloseTo(s2[i].vy, 5);
    }
  });

  it('chime (waveRing)：開火出 8 顆環形', () => {
    const e = makeEnemy(1, 'chime', 240, 100, 'descend');
    e.fireCdMs = 0;
    const { spawns } = stepEnemy(e, 16, { px: 240, py: 560 }, makeRng());
    expect(spawns).toHaveLength(8);
  });

  it('chime：deathBurst 旗標存在於 ENEMY_DEFS', () => {
    expect(ENEMY_DEFS.chime.deathBurst).toBe(true);
  });
});
