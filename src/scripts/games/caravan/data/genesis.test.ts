import { describe, expect, it } from 'vitest';
import { ITEMS } from './items';
import {
  GENESIS_APTITUDES,
  GENESIS_BURDENS,
  GENESIS_LIFEPATHS,
  genesisName,
  resolveCharacterGenesis,
  type GenesisTraitId,
} from './genesis';
import { newGame, STARTING_PROFILE, type CharacterChoice } from '../save';
import type { StatBlock } from '../types';

const JOBS = ['swordsman', 'ranger', 'mage', 'cleric'] as const;
const TRAITS = Object.keys(GENESIS_LIFEPATHS) as GenesisTraitId[];
const STATS = ['str', 'dex', 'int', 'cha', 'con'] as const;

function statShape(high: keyof StatBlock, low: keyof StatBlock): StatBlock {
  const stats: StatBlock = { str: 10, dex: 10, int: 10, cha: 10, con: 10 };
  stats[high] = 15;
  stats[low] = high === low ? 15 : 6;
  return stats;
}

function choice(job: typeof JOBS[number], trait: GenesisTraitId): CharacterChoice {
  return { job, trait };
}

describe('M22 角色命運矩陣', () => {
  it('無出身特性維持舊版開局，不偷偷改動金幣、聲望、物資或命運欄位', () => {
    const save = newGame(1000, { job: 'swordsman' });
    expect(save.gold).toBe(200);
    expect(save.reputation).toBe(0);
    expect(save.inventory).toEqual({});
    expect(save.protagonist.genesis).toBeUndefined();
    expect(save.protagonist.skills).toBeUndefined();
    expect(save.protagonist.skillPoints).toBeUndefined();
  });

  it('四職業 × 六出身全部能安全開局，且所有物資與技能資料有效', () => {
    for (const job of JOBS) {
      for (const trait of TRAITS) {
        const save = newGame(1000, choice(job, trait));
        expect(save.protagonist.genesis?.lifepathId).toBe(trait);
        expect(save.gold, `${job}/${trait} 資金死局`).toBeGreaterThanOrEqual(50);
        expect(save.protagonist.maxHp, `${job}/${trait} 生命死局`).toBeGreaterThanOrEqual(8);
        expect(save.reputation).toBeGreaterThanOrEqual(0);
        expect(save.reputation).toBeLessThan(10);
        for (const [itemId, count] of Object.entries(save.inventory)) {
          expect(ITEMS[itemId], `${job}/${trait} 引用未知物品 ${itemId}`).toBeDefined();
          expect(count).toBeGreaterThan(0);
        }
        for (const rank of Object.values(save.protagonist.skills ?? {})) {
          expect(rank).toBeGreaterThanOrEqual(1);
          expect(rank).toBeLessThanOrEqual(2);
        }
        expect(save.protagonist.skillPoints ?? 0).toBeLessThanOrEqual(2);
      }
    }
  });

  it('最強屬性與最弱屬性各有五種可推導結果，平手採固定順序並可重現', () => {
    for (const high of STATS) {
      for (const low of STATS) {
        if (high === low) continue;
        const stats = statShape(high, low);
        const first = resolveCharacterGenesis(stats, 'seasoned');
        const second = resolveCharacterGenesis({ ...stats }, 'seasoned');
        expect(first?.profile.aptitudeId).toBe(high);
        expect(first?.profile.burdenId).toBe(low);
        expect(second).toEqual(first);
      }
    }

    const tied = resolveCharacterGenesis({ str: 12, dex: 12, int: 10, cha: 10, con: 10 }, 'nimble');
    expect(tied?.profile.aptitudeId).toBe('str');
    expect(tied?.profile.burdenId).toBe('con');
  });

  it('擲骰與配點後的實際數值會改變命運方向，而不是被職業模板寫死', () => {
    const base = STARTING_PROFILE.mage.stats;
    const ordinary = newGame(1000, { job: 'mage', trait: 'learned' });
    const transformed = newGame(1000, {
      job: 'mage', trait: 'learned',
      statRoll: { ...base, str: base.str + 3, int: base.int - 2, con: base.con + 3 },
      allocation: { str: 3 },
    });
    expect(ordinary.protagonist.genesis?.aptitudeId).toBe('int');
    expect(transformed.protagonist.genesis?.aptitudeId).toBe('str');
    expect(transformed.protagonist.genesis).not.toEqual(ordinary.protagonist.genesis);
  });

  it('每條出身都有優勢與代價，沒有單一選項同時擁有最高資金、聲望、生命與技能', () => {
    const outcomes = TRAITS.map((trait) => {
      const save = newGame(1000, { job: 'swordsman', trait });
      return {
        trait,
        gold: save.gold,
        reputation: save.reputation,
        hp: save.protagonist.maxHp,
        skillPower: Object.values(save.protagonist.skills ?? {}).reduce((sum, rank) => sum + rank, 0)
          + (save.protagonist.skillPoints ?? 0),
        items: Object.values(save.inventory).reduce((sum, count) => sum + count, 0),
      };
    });
    const maxima = {
      gold: Math.max(...outcomes.map((x) => x.gold)),
      reputation: Math.max(...outcomes.map((x) => x.reputation)),
      hp: Math.max(...outcomes.map((x) => x.hp)),
      skillPower: Math.max(...outcomes.map((x) => x.skillPower)),
      items: Math.max(...outcomes.map((x) => x.items)),
    };
    expect(outcomes.some((x) =>
      x.gold === maxima.gold && x.reputation === maxima.reputation && x.hp === maxima.hp &&
      x.skillPower === maxima.skillPower && x.items === maxima.items
    )).toBe(false);
  });

  it('命運名稱完整揭露出身、天賦與缺陷三個軸', () => {
    const result = resolveCharacterGenesis(statShape('cha', 'con'), 'charming');
    expect(result).not.toBeNull();
    const name = genesisName(result!.profile);
    expect(name).toContain(GENESIS_LIFEPATHS.charming.name);
    expect(name).toContain(GENESIS_APTITUDES.cha.name);
    expect(name).toContain(GENESIS_BURDENS.con.name);
  });

  it('未知或空特性不啟動命運矩陣，避免毀損存檔取得未驗證資源', () => {
    const stats = statShape('str', 'con');
    expect(resolveCharacterGenesis(stats, null)).toBeNull();
    expect(resolveCharacterGenesis(stats, 'not-a-trait')).toBeNull();
  });
});
