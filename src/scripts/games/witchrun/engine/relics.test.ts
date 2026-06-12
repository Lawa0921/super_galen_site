// relics.test.ts
import { describe, it, expect } from 'vitest';
import { RELICS, draftRelics, computeModifiers, BASE_MODIFIERS } from './relics';
import { createRng } from './rng';
import type { RelicId } from './types';

describe('relics', () => {
  it('遺物池共 15 種且 id 唯一', () => {
    const ids = Object.keys(RELICS);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
  });

  it('9 種 common、6 種 rare', () => {
    const all = Object.values(RELICS);
    expect(all.filter((r) => r.rarity === 'common')).toHaveLength(9);
    expect(all.filter((r) => r.rarity === 'rare')).toHaveLength(6);
  });

  it('six rare ids 正確', () => {
    const rareIds = Object.values(RELICS).filter((r) => r.rarity === 'rare').map((r) => r.id);
    expect(rareIds).toContain('pierce');
    expect(rareIds).toContain('homing');
    expect(rareIds).toContain('chronos');
    expect(rareIds).toContain('pendulum');
    expect(rareIds).toContain('starshard');
    expect(rareIds).toContain('bloodmoon');
  });

  it('draftRelics 抽 3 個不重複且排除已持有', () => {
    const rng = createRng(1);
    const owned: RelicId[] = ['split', 'magnet'];
    const picks = draftRelics(rng, owned);
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
    for (const p of picks) expect(owned).not.toContain(p);
  });

  it('剩餘不足 3 個時抽剩餘全部', () => {
    const rng = createRng(1);
    // 留 2 個未持有（total 15 - 13 = 2）
    const owned = Object.keys(RELICS).slice(0, 13) as RelicId[];
    expect(draftRelics(rng, owned)).toHaveLength(2);
  });

  it('draftRelics 在固定 seed 下可重現（稀有度路由不影響確定性）', () => {
    const picks1 = draftRelics(createRng(42), []);
    const picks2 = draftRelics(createRng(42), []);
    expect(picks1).toEqual(picks2);
  });

  it('draftRelics rare 池全抽空後 fallback common（迴歸）', () => {
    // owned 持有 5 種 rare，剩最後 1 rare + 若干 common；slot wantRare 時必 fallback
    const rng = createRng(1);
    const fiveRare: RelicId[] = ['pierce', 'homing', 'chronos', 'pendulum', 'starshard'];
    // 留 bloodmoon（rare）+ 3 common 可選；wantRare 被消耗完就 fallback
    const picks = draftRelics(rng, fiveRare);
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
    for (const p of picks) expect(fiveRare).not.toContain(p);
  });

  it('computeModifiers：無遺物時回傳基準值', () => {
    expect(computeModifiers([])).toEqual(BASE_MODIFIERS);
  });

  it('computeModifiers：moonlight 為純即時效果，不改任何持續修正', () => {
    expect(computeModifiers(['moonlight'])).toEqual(BASE_MODIFIERS);
  });

  it('computeModifiers：效果聚合', () => {
    const m = computeModifiers(['feather', 'pact', 'echo', 'stardust']);
    expect(m.speedMult).toBeCloseTo(1.2);
    expect(m.hitboxMult).toBeCloseTo(0.85);
    expect(m.atkMult).toBeCloseTo(1.5);
    expect(m.lifeCapDelta).toBe(-1);
    expect(m.overdriveDurMult).toBeCloseTo(1.5);
    expect(m.focusGrazeBonus).toBeCloseTo(0.3);
  });

  it('computeModifiers：布林遺物', () => {
    const m = computeModifiers(['split', 'familiar', 'magnet', 'catalyst']);
    expect(m.splitShot).toBe(true);
    expect(m.familiar).toBe(true);
    expect(m.magnet).toBe(true);
    expect(m.fireField).toBe(true);
  });

  // ── F4 新欄位 ──

  it('computeModifiers：pierce 啟用 pierce', () => {
    const m = computeModifiers(['pierce']);
    expect(m.pierce).toBe(true);
    expect(m.familiar).toBe(false);
    expect(m.homingFamiliar).toBe(false);
  });

  it('computeModifiers：homing 同時設 familiar + homingFamiliar', () => {
    const m = computeModifiers(['homing']);
    expect(m.familiar).toBe(true);
    expect(m.homingFamiliar).toBe(true);
  });

  it('computeModifiers：chronos 啟用 freezeOnOverdrive', () => {
    expect(computeModifiers(['chronos']).freezeOnOverdrive).toBe(true);
  });

  it('computeModifiers：pendulum infernoInvulnBonus = 1200', () => {
    expect(computeModifiers(['pendulum']).infernoInvulnBonus).toBe(1200);
  });

  it('computeModifiers：starshard grazeCoinEvery = 5', () => {
    expect(computeModifiers(['starshard']).grazeCoinEvery).toBe(5);
  });

  it('computeModifiers：bloodmoon critChance = 0.1', () => {
    expect(computeModifiers(['bloodmoon']).critChance).toBeCloseTo(0.1);
  });

  it('BASE_MODIFIERS 包含所有新欄位的預設值', () => {
    expect(BASE_MODIFIERS.pierce).toBe(false);
    expect(BASE_MODIFIERS.homingFamiliar).toBe(false);
    expect(BASE_MODIFIERS.freezeOnOverdrive).toBe(false);
    expect(BASE_MODIFIERS.infernoInvulnBonus).toBe(0);
    expect(BASE_MODIFIERS.grazeCoinEvery).toBe(0);
    expect(BASE_MODIFIERS.critChance).toBe(0);
  });
});
