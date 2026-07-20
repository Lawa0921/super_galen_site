import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  XP_TABLE, levelFromXp, pendingLevelUps, applyLevelUp, unlockedMoves,
  generateRecruitPool, hireCost, wagePerTrip, equipItem, unequipItem, equipmentBonus,
  SPECIALIZATIONS, chooseSpecialization, bondTier, partyCheckBonus,
  TRAITS, partyCheckBonus,
} from './roster';
import { memberFromRecord } from './data/jobs';
import { createRng } from './rng';
import { newGame, type SaveData, type CompanionRecord } from './save';
import type { StatBlock } from './types';
import { JOBS, memberFromRecord } from './data/jobs';
import { ITEMS, type ItemDef } from './data/items';

function makeCompanion(overrides: Partial<CompanionRecord> = {}): CompanionRecord {
  return {
    id: 'comp-1', name: '傭兵', job: 'swordsman', level: 1, xp: 0,
    stats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 },
    maxHp: 26, injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
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

  it('applyLevelUp：配點含負數丟 Error，不修改任何欄位（M5 終審移交防禦）', () => {
    const record = makeCompanion({ level: 1 });
    const before = JSON.parse(JSON.stringify(record));
    // str:-1 + dex:3 總和恰為 2，但單項為負，應被擋下
    expect(() => applyLevelUp(record, { str: -1, dex: 3 })).toThrow();
    expect(record).toEqual(before);
  });

  it('applyLevelUp：配點含非整數（小數）丟 Error，不修改任何欄位（M5 終審移交防禦）', () => {
    const record = makeCompanion({ level: 1 });
    const before = JSON.parse(JSON.stringify(record));
    expect(() => applyLevelUp(record, { str: 1.5, dex: 0.5 })).toThrow();
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
      expect(c.equipment).toEqual({ weapon: null, armor: null, trinket: null });
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

  // -----------------------------------------------------------------
  // equipItem / unequipItem / equipmentBonus（M5 Task 1：裝備三欄系統）
  // -----------------------------------------------------------------
  describe('裝備三欄系統（equipItem/unequipItem/equipmentBonus）', () => {
    const TEST_WEAPON: ItemDef = {
      id: 'test-sword', name: '測試劍', desc: '測試用。', value: 30,
      equip: { slot: 'weapon', bonus: { str: 1 } },
    };
    const TEST_WEAPON_2: ItemDef = {
      id: 'test-axe', name: '測試斧', desc: '測試用。', value: 30,
      equip: { slot: 'weapon', bonus: { str: 2 } },
    };
    const TEST_ARMOR: ItemDef = {
      id: 'test-plate', name: '測試甲', desc: '測試用。', value: 40,
      equip: { slot: 'armor', defense: 2, maxHp: 4 },
    };
    const TEST_TRINKET_HIGH_LEVEL: ItemDef = {
      id: 'test-amulet', name: '測試護符', desc: '測試用。', value: 40,
      equip: { slot: 'trinket', minLevel: 3, bonus: { cha: 1 } },
    };

    beforeEach(() => {
      ITEMS['test-sword'] = TEST_WEAPON;
      ITEMS['test-axe'] = TEST_WEAPON_2;
      ITEMS['test-plate'] = TEST_ARMOR;
      ITEMS['test-amulet'] = TEST_TRINKET_HIGH_LEVEL;
    });
    afterEach(() => {
      delete ITEMS['test-sword'];
      delete ITEMS['test-axe'];
      delete ITEMS['test-plate'];
      delete ITEMS['test-amulet'];
    });

    function makeSave(): SaveData {
      return newGame(1000);
    }

    describe('equipItem', () => {
      it('成功裝備武器：扣庫存 1、寫入 equipment.weapon', () => {
        const save = makeSave();
        save.inventory['test-sword'] = 1;
        equipItem(save, 'protagonist', 'test-sword');
        expect(save.protagonist.equipment.weapon).toBe('test-sword');
        expect(save.inventory['test-sword']).toBeUndefined();
      });

      it('庫存有多件時只扣 1 件', () => {
        const save = makeSave();
        save.inventory['test-sword'] = 3;
        equipItem(save, 'protagonist', 'test-sword');
        expect(save.inventory['test-sword']).toBe(2);
      });

      it('換裝同一 slot 時舊裝備自動退回 inventory', () => {
        const save = makeSave();
        save.inventory['test-sword'] = 1;
        save.inventory['test-axe'] = 1;
        equipItem(save, 'protagonist', 'test-sword');
        equipItem(save, 'protagonist', 'test-axe');
        expect(save.protagonist.equipment.weapon).toBe('test-axe');
        expect(save.inventory['test-sword']).toBe(1); // 舊武器退回
        expect(save.inventory['test-axe']).toBeUndefined();
      });

      it('可裝備到傭兵身上（非主角）', () => {
        const save = makeSave();
        save.companions.push(makeCompanion({ id: 'comp-1' }));
        save.inventory['test-sword'] = 1;
        equipItem(save, 'comp-1', 'test-sword');
        expect(save.companions[0].equipment.weapon).toBe('test-sword');
        expect(save.protagonist.equipment.weapon).toBeNull();
      });

      it('物品無 equip 欄丟 Error', () => {
        const save = makeSave();
        save.inventory['herb'] = 1;
        expect(() => equipItem(save, 'protagonist', 'herb')).toThrow();
      });

      it('未知物品 id 丟 Error', () => {
        const save = makeSave();
        expect(() => equipItem(save, 'protagonist', 'not-an-item')).toThrow();
      });

      it('等級不足（item.equip.minLevel > 成員 level）丟 Error', () => {
        const save = makeSave(); // protagonist level 1
        save.inventory['test-amulet'] = 1; // minLevel 3
        expect(() => equipItem(save, 'protagonist', 'test-amulet')).toThrow();
      });

      it('成員不存在丟 Error', () => {
        const save = makeSave();
        save.inventory['test-sword'] = 1;
        expect(() => equipItem(save, 'no-such-member', 'test-sword')).toThrow();
      });

      it('庫存 0（未持有）丟 Error', () => {
        const save = makeSave();
        expect(() => equipItem(save, 'protagonist', 'test-sword')).toThrow();
      });

      it('丟 Error 時不修改 save（inventory/equipment 皆不變）', () => {
        const save = makeSave();
        const before = JSON.parse(JSON.stringify(save));
        expect(() => equipItem(save, 'protagonist', 'test-sword')).toThrow(); // 庫存 0
        expect(save).toEqual(before);
      });
    });

    describe('unequipItem', () => {
      it('卸下後 equipment[slot] 清空、物品退回 inventory', () => {
        const save = makeSave();
        save.inventory['test-sword'] = 1;
        equipItem(save, 'protagonist', 'test-sword');
        unequipItem(save, 'protagonist', 'weapon');
        expect(save.protagonist.equipment.weapon).toBeNull();
        expect(save.inventory['test-sword']).toBe(1);
      });

      it('空 slot 卸裝為 no-op，不影響 inventory', () => {
        const save = makeSave();
        unequipItem(save, 'protagonist', 'weapon');
        expect(save.protagonist.equipment.weapon).toBeNull();
        expect(save.inventory).toEqual({});
      });

      it('成員不存在丟 Error', () => {
        const save = makeSave();
        expect(() => unequipItem(save, 'no-such-member', 'weapon')).toThrow();
      });
    });

    describe('equipmentBonus', () => {
      it('無裝備回全 0/空', () => {
        const record = makeCompanion();
        expect(equipmentBonus(record)).toEqual({ stats: {}, defense: 0, maxHp: 0 });
      });

      it('三個 slot 的 bonus/defense/maxHp 各自加總', () => {
        const record = makeCompanion({
          equipment: { weapon: 'test-sword', armor: 'test-plate', trinket: null },
        });
        const bonus = equipmentBonus(record);
        expect(bonus.stats).toEqual({ str: 1 });
        expect(bonus.defense).toBe(2);
        expect(bonus.maxHp).toBe(4);
      });

      it('多個裝備的同屬性 bonus 會加總', () => {
        ITEMS['test-charm'] = {
          id: 'test-charm', name: '測試護符2', desc: '測試用。', value: 10,
          equip: { slot: 'trinket', bonus: { str: 3 } },
        };
        const record = makeCompanion({
          equipment: { weapon: 'test-sword', armor: null, trinket: 'test-charm' },
        });
        expect(equipmentBonus(record).stats).toEqual({ str: 4 });
        delete ITEMS['test-charm'];
      });
    });
  });
});

describe('旅伴特質（M7）', () => {
  it('TRAITS：至少 8 種、id 唯一、皆有名稱與描述', () => {
    expect(TRAITS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(TRAITS.map((t: { id: string }) => t.id)).size).toBe(TRAITS.length);
    for (const t of TRAITS) { expect(t.name).toBeTruthy(); expect(t.desc).toBeTruthy(); }
  });

  it('招募池每人帶特質；主角無特質', () => {
    const pool = generateRecruitPool(createRng(99), 99, 0);
    for (const r of pool) {
      expect(r.trait, `${r.name} 缺特質`).toBeTruthy();
      expect(TRAITS.some((t: { id: string }) => t.id === r.trait)).toBe(true);
    }
    expect(newGame().protagonist.trait).toBeNull();
  });

  it('特質影響薪餉與雇用費（greedy：便宜請、養得貴）', () => {
    const r = generateRecruitPool(createRng(1), 1, 0)[0];
    const asTrait = (trait: string | null) => ({ ...r, trait });
    const baseWage = wagePerTrip(asTrait(null));
    expect(wagePerTrip(asTrait('greedy'))).toBe(baseWage + 3);
    expect(wagePerTrip(asTrait('frugal'))).toBe(baseWage - 2);
    expect(hireCost(asTrait('greedy'))).toBe(hireCost(asTrait(null)) - 10);
  });

  it('特質屬性/HP 加成進入 memberFromRecord；partyCheckBonus 加總老練', () => {
    const r = generateRecruitPool(createRng(2), 2, 0)[0];
    const brawny = memberFromRecord({ ...r, trait: 'brawny' });
    const plain = memberFromRecord({ ...r, trait: null });
    expect(brawny.stats.str).toBe(plain.stats.str + 2);
    const tough = memberFromRecord({ ...r, trait: 'tough' });
    expect(tough.maxHp).toBe(plain.maxHp + 4);

    const save = newGame();
    expect(partyCheckBonus(save)).toBe(0);
    save.companions.push({ ...r, trait: 'seasoned' }, { ...r, id: 'x2', trait: 'seasoned' });
    expect(partyCheckBonus(save)).toBe(2);
  });
});

describe('M11 職業專精（Lv4 二選一）', () => {
  const mk = (over: Partial<CompanionRecord> = {}): CompanionRecord => ({
    id: 'protagonist', name: '你', job: 'swordsman', level: 4, xp: 210,
    stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 }, maxHp: 22,
    injuredForTrips: 0, trait: null,
    equipment: { weapon: null, armor: null, trinket: null },
    ...over,
  });

  it('SPECIALIZATIONS：每職業恰 2 個選項，各有名稱/說明/專屬招', () => {
    for (const job of ['swordsman', 'ranger', 'mage', 'cleric'] as const) {
      const specs = SPECIALIZATIONS[job];
      expect(specs).toHaveLength(2);
      for (const spec of specs) {
        expect(spec.name.length).toBeGreaterThan(0);
        expect(spec.desc.length).toBeGreaterThan(0);
        expect(spec.move.id.length).toBeGreaterThan(0);
      }
    }
  });

  it('chooseSpecialization：Lv4 可選；選後寫入 record.specialization', () => {
    const r = mk();
    chooseSpecialization(r, 'berserker');
    expect(r.specialization).toBe('berserker');
  });

  it('chooseSpecialization：Lv<4 丟錯；已有專精再選丟錯；非本職業選項丟錯', () => {
    expect(() => chooseSpecialization(mk({ level: 3 }), 'berserker')).toThrow();
    const chosen = mk({ specialization: 'berserker' });
    expect(() => chooseSpecialization(chosen, 'bulwark')).toThrow();
    expect(() => chooseSpecialization(mk(), 'hawkeye')).toThrow(); // 游俠專精配劍士
  });

  it('memberFromRecord：專精被動疊上（狂戰士 +2 力量）且專屬招入列', () => {
    const base = memberFromRecord(mk());
    const spec = memberFromRecord(mk({ specialization: 'berserker' }));
    expect(spec.stats.str).toBe(base.stats.str + 2);
    expect(spec.moves.some((m) => m.id === SPECIALIZATIONS.swordsman[0].move.id)).toBe(true);
    expect(base.moves.some((m) => m.id === SPECIALIZATIONS.swordsman[0].move.id)).toBe(false);
  });

  it('memberFromRecord：鐵壁衛防禦與生命被動生效', () => {
    const base = memberFromRecord(mk());
    const spec = memberFromRecord(mk({ specialization: 'bulwark' }));
    expect(spec.defense).toBeGreaterThan(base.defense);
    expect(spec.maxHp).toBeGreaterThan(base.maxHp);
  });
});

describe('M11 旅伴羈絆', () => {
  it('bondTier：0-1 趟=0、2-4=1、5-8=2、9+=3', () => {
    expect(bondTier(0)).toBe(0);
    expect(bondTier(1)).toBe(0);
    expect(bondTier(2)).toBe(1);
    expect(bondTier(4)).toBe(1);
    expect(bondTier(5)).toBe(2);
    expect(bondTier(8)).toBe(2);
    expect(bondTier(9)).toBe(3);
    expect(bondTier(undefined)).toBe(0);
  });

  it('partyCheckBonus 計入旅伴羈絆 tier 總和', () => {
    const save = newGame(1000);
    const base = partyCheckBonus(save);
    save.companions.push({
      id: 'c1', name: '甲', job: 'ranger', level: 1, xp: 0,
      stats: { str: 10, dex: 14, int: 10, cha: 10, con: 11 }, maxHp: 20,
      injuredForTrips: 0, trait: null, bond: 5,
      equipment: { weapon: null, armor: null, trinket: null },
    });
    expect(partyCheckBonus(save)).toBe(base + 2); // bond 5 → tier 2
  });

  it('memberFromRecord：羈絆 tier 每階 +2 maxHp（主角無羈絆不加）', () => {
    const rec: CompanionRecord = {
      id: 'c1', name: '甲', job: 'ranger', level: 1, xp: 0,
      stats: { str: 10, dex: 14, int: 10, cha: 10, con: 11 }, maxHp: 20,
      injuredForTrips: 0, trait: null,
      equipment: { weapon: null, armor: null, trinket: null },
    };
    const noBond = memberFromRecord(rec);
    const bonded = memberFromRecord({ ...rec, bond: 9 }); // tier 3
    expect(bonded.maxHp).toBe(noBond.maxHp + 6);
  });
});
