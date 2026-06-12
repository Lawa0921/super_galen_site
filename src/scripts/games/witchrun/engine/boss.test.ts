// boss.test.ts
import { describe, it, expect } from 'vitest';
import { BOSS_DEFS, BossRunner } from './boss';
import { createRng } from './rng';

const TARGET = { px: 240, py: 560 };

describe('boss', () => {
  it('4 隻 Boss 都有定義；deadbell 有 3 個 phase', () => {
    expect(Object.keys(BOSS_DEFS)).toEqual(['gargoyle', 'grimoire', 'bellwright', 'deadbell']);
    expect(BOSS_DEFS.deadbell.phases).toHaveLength(3);
    for (const id of ['gargoyle', 'grimoire', 'bellwright'] as const) {
      expect(BOSS_DEFS[id].phases.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('runner 初始 phase 0、滿血、活著', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    expect(r.state.phase).toBe(0);
    expect(r.state.hp).toBe(BOSS_DEFS.gargoyle.hp);
    expect(r.state.alive).toBe(true);
  });

  it('step 依 phase 週期吐彈幕', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    let total = 0;
    for (let i = 0; i < 200; i++) total += r.step(50, TARGET).length; // 10 秒
    expect(total).toBeGreaterThan(0);
  });

  it('血量跨過閾值切 phase 並回報 phaseChanged', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    const def = BOSS_DEFS.gargoyle;
    // 打到第二 phase 閾值以下
    const changed = r.damage(def.hp - Math.floor(def.hp * def.phases[1].hpPct) + 1);
    expect(changed).toBe(true);
    expect(r.state.phase).toBe(1);
  });

  it('血量歸零 alive=false', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    r.damage(999999);
    expect(r.state.alive).toBe(false);
    expect(r.state.hp).toBe(0);
  });

  it('deadbell 發射 bellWave 時 tolls 遞增', () => {
    const r = new BossRunner('deadbell', createRng(1));
    for (let i = 0; i < 400; i++) r.step(50, TARGET); // 20 秒
    expect(r.tolls).toBeGreaterThan(0);
  });
});
