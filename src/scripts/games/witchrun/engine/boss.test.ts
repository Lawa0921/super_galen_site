// boss.test.ts
import { describe, it, expect } from 'vitest';
import { BOSS_DEFS, BossRunner } from './boss';
import { createRng } from './rng';
import { BOSS_DASH_CD_MS, BOSS_DASH_DUR_MS, FIELD_W } from './constants';

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

  it('切 phase 後攻擊計時器依新 phase everyMs 重置', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    r.step(1599, TARGET); // phase0 首攻 everyMs=1600，尚未發射
    const def = BOSS_DEFS.gargoyle;
    r.damage(def.hp - Math.floor(def.hp * def.phases[1].hpPct) + 1); // 切到 phase1
    expect(r.step(1, TARGET)).toHaveLength(0); // 新計時器重新起算，不應立即發射
  });

  it('deadbell 發射 bellWave 時 tolls 遞增', () => {
    const r = new BossRunner('deadbell', createRng(1));
    for (let i = 0; i < 400; i++) r.step(50, TARGET); // 20 秒
    expect(r.tolls).toBeGreaterThan(0);
  });

  // ---- F2.3 Boss 衝刺 ----

  it('衝刺 CD 到期後，boss.x 移向目標 x（鉗制在 [80, FIELD_W-80]）', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    // target 在右側
    const target = { px: 420, py: 560 };
    const x0 = r.state.x;
    // 推進超過 BOSS_DASH_CD_MS
    for (let t = 0; t < BOSS_DASH_CD_MS + BOSS_DASH_DUR_MS + 100; t += 50) {
      r.step(50, target);
    }
    // 衝刺完成後 x 應更接近目標（或到達鉗制邊界）
    const xAfter = r.state.x;
    const clampedTarget = Math.max(80, Math.min(FIELD_W - 80, target.px));
    // 完成 dash 後 x 應非常接近鉗制目標
    expect(Math.abs(xAfter - clampedTarget)).toBeLessThan(20);
  });

  it('衝刺後 homeX 更新，漂移基準隨之改變', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    const target = { px: 400, py: 560 };
    // 推進足夠時間完成一次衝刺
    for (let t = 0; t < BOSS_DASH_CD_MS + BOSS_DASH_DUR_MS + 500; t += 50) {
      r.step(50, target);
    }
    // 衝刺後繼續漂移，x 應在 dashToX 附近（而非原始 def.x 附近）
    const xAfterDash = r.state.x;
    const clampedTarget = Math.max(80, Math.min(FIELD_W - 80, target.px));
    expect(Math.abs(xAfterDash - clampedTarget)).toBeLessThan(80); // 70px 漂移幅度
  });

  it('pendingSummon 在 phase 切換時為 true，consumeSummon 後為 false', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    expect(r.pendingSummon).toBe(false);
    const def = BOSS_DEFS.gargoyle;
    r.damage(def.hp - Math.floor(def.hp * def.phases[1].hpPct) + 1);
    expect(r.pendingSummon).toBe(true);
    r.consumeSummon();
    expect(r.pendingSummon).toBe(false);
  });

  it('damage 致死不觸發 pendingSummon', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    r.damage(999999);
    expect(r.state.alive).toBe(false);
    expect(r.pendingSummon).toBe(false);
  });
});
