import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JOBS, memberFromRecord } from './jobs';
import { ITEMS, type ItemDef } from './items';
import type { CompanionRecord } from '../save';
import type { Move } from '../combat';

function makeRecord(overrides: Partial<CompanionRecord> = {}): CompanionRecord {
  return {
    id: 'c1', name: '測試員', job: 'swordsman', level: 1, xp: 0,
    stats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 },
    maxHp: 26, injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
    ...overrides,
  };
}

describe('jobs（武器招約定與 memberFromRecord 裝備整合，M5 Task 1）', () => {
  it('每個職業 moves[0] 都是 kind==="attack"（武器招約定，memberFromRecord 取代 moves[0] 的前提，資料鎖定）', () => {
    for (const job of Object.values(JOBS)) {
      expect(job.moves[0].kind, `${job.id} moves[0] 應為 attack`).toBe('attack');
    }
  });

  describe('memberFromRecord 裝備整合', () => {
    const TEST_WEAPON_MOVE: Move = {
      id: 'test-weapon-move', name: '測試武器技', kind: 'attack', target: 'enemy', hitStat: 'str',
      damage: { dice: 1, sides: 4, bonusStat: 'str' },
      narration: '{actor}揮動測試武器擊向{target}，造成 {amount} 點傷害！',
    };
    const TEST_WEAPON: ItemDef = {
      id: 'test-weapon', name: '測試武器', desc: '測試用武器。', value: 20,
      equip: { slot: 'weapon', bonus: { str: 2 }, move: TEST_WEAPON_MOVE },
    };
    const TEST_ARMOR: ItemDef = {
      id: 'test-armor', name: '測試護甲', desc: '測試用護甲。', value: 20,
      equip: { slot: 'armor', defense: 3, maxHp: 5 },
    };

    beforeEach(() => {
      ITEMS['test-weapon'] = TEST_WEAPON;
      ITEMS['test-armor'] = TEST_ARMOR;
    });
    afterEach(() => {
      delete ITEMS['test-weapon'];
      delete ITEMS['test-armor'];
    });

    it('無裝備時 moves[0] 為職業原本武器招', () => {
      const member = memberFromRecord(makeRecord());
      expect(member.moves[0].id).toBe('heavy-slash');
    });

    it('裝備武器後 moves[0] 被 equip.move 取代，其餘招式不變', () => {
      const withoutWeapon = memberFromRecord(makeRecord()).moves.map((m) => m.id);
      const record = makeRecord({ equipment: { weapon: 'test-weapon', armor: null, trinket: null } });
      const member = memberFromRecord(record);
      expect(member.moves[0].id).toBe('test-weapon-move');
      expect(member.moves.slice(1).map((m) => m.id)).toEqual(withoutWeapon.slice(1));
    });

    it('武器無 move 欄位時 moves[0] 維持職業原招（僅套用屬性加成）', () => {
      ITEMS['test-weapon-no-move'] = {
        id: 'test-weapon-no-move', name: '測試無招武器', desc: '測試用。', value: 10,
        equip: { slot: 'weapon', bonus: { str: 1 } },
      };
      const record = makeRecord({ equipment: { weapon: 'test-weapon-no-move', armor: null, trinket: null } });
      const member = memberFromRecord(record);
      expect(member.moves[0].id).toBe('heavy-slash');
      expect(member.stats.str).toBe(15);
      delete ITEMS['test-weapon-no-move'];
    });

    it('裝備加成套用到 stats/defense/maxHp（武器 str+2、護甲 defense+3/maxHp+5）', () => {
      const record = makeRecord({
        equipment: { weapon: 'test-weapon', armor: 'test-armor', trinket: null },
      });
      const member = memberFromRecord(record);
      expect(member.stats.str).toBe(16); // 14 + 2
      expect(member.defense).toBe(JOBS.swordsman.defense + 3);
      expect(member.maxHp).toBe(26 + 5);
      expect(member.hp).toBe(member.maxHp);
    });

    it('未裝備任何東西時不影響 stats/defense/maxHp（回歸原值）', () => {
      const member = memberFromRecord(makeRecord());
      expect(member.stats).toEqual({ str: 14, dex: 10, int: 8, cha: 10, con: 14 });
      expect(member.defense).toBe(JOBS.swordsman.defense);
      expect(member.maxHp).toBe(26);
    });
  });
});
