import { describe, it, expect } from 'vitest';
import {
  XP_TABLE, levelFromXp, pendingLevelUps, applyLevelUp, unlockedMoves,
  generateRecruitPool, hireCost, wagePerTrip,
} from './roster';
import { createRng } from './rng';
import type { CompanionRecord } from './save';
import type { StatBlock } from './types';
import { JOBS } from './data/jobs';

function makeCompanion(overrides: Partial<CompanionRecord> = {}): CompanionRecord {
  return {
    id: 'comp-1', name: '傭兵', job: 'swordsman', level: 1, xp: 0,
    stats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 },
    maxHp: 26, injuredForTrips: 0,
    ...overrides,
  };
}

describe('roster（成長系統）', () => {
  // -----------------------------------------------------------------
  // XP_TABLE / levelFromXp
  // -----------------------------------------------------------------
  it('XP_TABLE：index=level，Lv5 封頂（M4）', () => {
    expect(XP_TABLE).toEqual([0, 0, 50, 120, 210, 320]);
  });

  it('levelFromXp：依門檻推等級', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(49)).toBe(1);
    expect(levelFromXp(50)).toBe(2);
    expect(levelFromXp(119)).toBe(2);
    expect(levelFromXp(120)).toBe(3);
    expect(levelFromXp(209)).toBe(3);
    expect(levelFromXp(210)).toBe(4);
    expect(levelFromXp(319)).toBe(4);
    expect(levelFromXp(320)).toBe(5);
  });

  it('levelFromXp：超過 Lv5 門檻仍封頂在 5', () => {
    expect(levelFromXp(9999)).toBe(5);
  });

  // -----------------------------------------------------------------
  // pendingLevelUps
  // -----------------------------------------------------------------
  it('pendingLevelUps：xp 未達下一等級門檻時為 0', () => {
    const record = makeCompanion({ level: 1, xp: 10 });
    expect(pendingLevelUps(record)).toBe(0);
  });

  it('pendingLevelUps：xp 達門檻但 level 未跟上時為正數', () => {
    const record = makeCompanion({ level: 1, xp: 120 }); // levelFromXp=3
    expect(pendingLevelUps(record)).toBe(2);
  });

  it('pendingLevelUps：level 已跟上 xp 對應等級時為 0', () => {
    const record = makeCompanion({ level: 3, xp: 120 });
    expect(pendingLevelUps(record)).toBe(0);
  });

  // -----------------------------------------------------------------
  // applyLevelUp
  // -----------------------------------------------------------------
  it('applyLevelUp：level+1、配點加到 stats、maxHp 依配點後新體質成長', () => {
    const record = makeCompanion({ level: 1, stats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 }, maxHp: 26 });
    applyLevelUp(record, { con: 2 });
    expect(record.level).toBe(2);
    expect(record.stats.con).toBe(16);
    // statMod(16) = floor((16-10)/2) = 3；maxHp += 3 + 3 = 6
    expect(record.maxHp).toBe(32);
  });

  it('applyLevelUp：配點可分散到兩個屬性，總和仍需恰為 2', () => {
    const record = makeCompanion({ level: 1, stats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 } });
    applyLevelUp(record, { str: 1, dex: 1 });
    expect(record.stats.str).toBe(15);
    expect(record.stats.dex).toBe(11);
    expect(record.stats.con).toBe(14); // 未配點的屬性不變
  });

  it('applyLevelUp：配點總和不為 2 丟 Error（過多）', () => {
    const record = makeCompanion();
    expect(() => applyLevelUp(record, { str: 3 })).toThrow();
  });

  it('applyLevelUp：配點總和不為 2 丟 Error（過少）', () => {
    const record = makeCompanion();
    expect(() => applyLevelUp(record, { str: 1 })).toThrow();
  });

  it('applyLevelUp：空配點丟 Error', () => {
    const record = makeCompanion();
    expect(() => applyLevelUp(record, {})).toThrow();
  });

  it('applyLevelUp：level 已達封頂 5 丟 Error，不修改任何欄位', () => {
    const record = makeCompanion({ level: 5, xp: 320 });
    const before = JSON.parse(JSON.stringify(record));
    expect(() => applyLevelUp(record, { con: 2 })).toThrow();
    expect(record).toEqual(before);
  });

  it('applyLevelUp：無效配點（總和不對）不修改任何欄位', () => {
    const record = makeCompanion({ level: 1 });
    const before = JSON.parse(JSON.stringify(record));
    expect(() => applyLevelUp(record, { str: 5 })).toThrow();
    expect(record).toEqual(before);
  });

  it('applyLevelUp：可連續呼叫直到封頂', () => {
    const record = makeCompanion({ level: 1 });
    applyLevelUp(record, { con: 2 });
    applyLevelUp(record, { con: 2 });
    applyLevelUp(record, { con: 2 });
    applyLevelUp(record, { con: 2 });
    expect(record.level).toBe(5);
    expect(() => applyLevelUp(record, { con: 2 })).toThrow();
  });

  // -----------------------------------------------------------------
  // unlockedMoves
  // -----------------------------------------------------------------
  it('unlockedMoves：Lv1 只拿到無 minLevel（視為 Lv1）的招式', () => {
    const record = makeCompanion({ job: 'swordsman', level: 1 });
    const moves = unlockedMoves(record);
    const ids = moves.map((m) => m.id);
    expect(ids).toEqual(['heavy-slash', 'guard', 'strike']);
    expect(moves.every((m) => (m.minLevel ?? 1) <= 1)).toBe(true);
  });

  it('unlockedMoves：Lv2 額外解鎖該職業的 Lv2 招式', () => {
    const record = makeCompanion({ job: 'swordsman', level: 2 });
    const ids = unlockedMoves(record).map((m) => m.id);
    expect(ids).toContain('whirlwind-slash');
    expect(ids).not.toContain('breaking-combo');
  });

  it('unlockedMoves：Lv3 額外解鎖該職業的 Lv3 招式（含 Lv1/Lv2 全部招式）', () => {
    const record = makeCompanion({ job: 'swordsman', level: 3 });
    const ids = unlockedMoves(record).map((m) => m.id);
    expect(ids).toEqual(['heavy-slash', 'guard', 'whirlwind-slash', 'breaking-combo', 'strike']);
  });

  it('unlockedMoves：其餘三職業 Lv1 招式各自對應正確', () => {
    expect(unlockedMoves(makeCompanion({ job: 'ranger', level: 1 })).map((m) => m.id))
      .toEqual(['quick-shot', 'aimed-shot', 'strike']);
    expect(unlockedMoves(makeCompanion({ job: 'mage', level: 1 })).map((m) => m.id))
      .toEqual(['fireball', 'ice-spike', 'strike']);
    expect(unlockedMoves(makeCompanion({ job: 'cleric', level: 1 })).map((m) => m.id))
      .toEqual(['holy-strike', 'heal', 'strike']);
  });

  it('unlockedMoves：四職業各自都有 Lv2 與 Lv3 招式（M4 內容要求）', () => {
    for (const jobId of ['swordsman', 'ranger', 'mage', 'cleric'] as const) {
      const moves = JOBS[jobId].moves;
      expect(moves.some((m) => m.minLevel === 2), `${jobId} 缺 Lv2 招式`).toBe(true);
      expect(moves.some((m) => m.minLevel === 3), `${jobId} 缺 Lv3 招式`).toBe(true);
    }
  });

  // -----------------------------------------------------------------
  // hireCost / wagePerTrip
  // -----------------------------------------------------------------
  it('hireCost：30 + level×20', () => {
    expect(hireCost(makeCompanion({ level: 1 }))).toBe(50);
    expect(hireCost(makeCompanion({ level: 2 }))).toBe(70);
    expect(hireCost(makeCompanion({ level: 3 }))).toBe(90);
  });

  it('wagePerTrip：8 + level×4', () => {
    expect(wagePerTrip(makeCompanion({ level: 1 }))).toBe(12);
    expect(wagePerTrip(makeCompanion({ level: 2 }))).toBe(16);
    expect(wagePerTrip(makeCompanion({ level: 3 }))).toBe(20);
  });

  // -----------------------------------------------------------------
  // generateRecruitPool
  // -----------------------------------------------------------------
  it('generateRecruitPool：人數落在 3-5 之間，多種子皆覆蓋到 3/4/5', () => {
    const sizes = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const pool = generateRecruitPool(createRng(seed), seed, 0);
      expect(pool.length).toBeGreaterThanOrEqual(3);
      expect(pool.length).toBeLessThanOrEqual(5);
      sizes.add(pool.length);
    }
    expect(sizes).toEqual(new Set([3, 4, 5]));
  });

  it('generateRecruitPool：職業分布均勻覆蓋四職業（多次抽樣）', () => {
    const jobsSeen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      for (const c of generateRecruitPool(createRng(seed), seed, 0)) jobsSeen.add(c.job);
    }
    expect(jobsSeen).toEqual(new Set(['swordsman', 'ranger', 'mage', 'cleric']));
  });

  it('generateRecruitPool：同一池內姓名不重複', () => {
    for (let seed = 0; seed < 50; seed++) {
      const pool = generateRecruitPool(createRng(seed), seed, 0);
      const names = pool.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('generateRecruitPool：一般成員 Lv1/xp0，屬性=職業 baseStats 恰有一項 +1', () => {
    const pool = generateRecruitPool(createRng(1), 1, 0);
    for (const c of pool) {
      expect(c.level).toBe(1);
      expect(c.xp).toBe(0);
      expect(c.injuredForTrips).toBe(0);
      const base = JOBS[c.job].baseStats;
      const statKeys: Array<keyof StatBlock> = ['str', 'dex', 'int', 'cha', 'con'];
      const diffs = statKeys.map((k) => c.stats[k] - base[k]);
      expect(diffs.filter((d) => d === 1).length).toBe(1);
      expect(diffs.filter((d) => d === 0).length).toBe(4);
      expect(c.maxHp).toBe(JOBS[c.job].baseMaxHp);
    }
  });

  it('generateRecruitPool：id 格式為 recruit-<tavernSeed>-<n>', () => {
    const pool = generateRecruitPool(createRng(7), 12345, 0);
    pool.forEach((c, i) => {
      expect(c.id).toBe(`recruit-12345-${i}`);
    });
  });

  it('generateRecruitPool：聲望 <30 時第一名仍是 Lv1（無精英）', () => {
    const pool = generateRecruitPool(createRng(3), 3, 29);
    expect(pool[0].level).toBe(1);
    expect(pool[0].xp).toBe(0);
  });

  it('generateRecruitPool：聲望 >=30 時第一名為 Lv2 精英（xp=XP_TABLE[2]、maxHp+4），其餘仍 Lv1', () => {
    const pool = generateRecruitPool(createRng(3), 3, 30);
    expect(pool[0].level).toBe(2);
    expect(pool[0].xp).toBe(XP_TABLE[2]);
    expect(pool[0].maxHp).toBe(JOBS[pool[0].job].baseMaxHp + 4);
    for (const c of pool.slice(1)) {
      expect(c.level).toBe(1);
      expect(c.xp).toBe(0);
    }
  });
});
