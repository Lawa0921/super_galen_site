import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  JOBS,
  MOVE_LOADOUT_CAP,
  availableMovesFromRecord,
  memberFromRecord,
  preparedMovesFromRecord,
  setPreparedMoves,
} from './jobs';
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

  it('M16：各職業至少有一種清群手段，瞄準射擊提供命中取捨', () => {
    for (const job of Object.values(JOBS)) {
      expect(job.moves.some((move) => move.area), `${job.name} 缺少範圍招式`).toBe(true);
    }
    const aimedShot = JOBS.ranger.moves.find((move) => move.id === 'aimed-shot');
    expect(aimedShot?.hitBonus).toBe(3);
    expect(aimedShot?.area).not.toBe(true);
  });

  describe('M18 戰技配置', () => {
    it('舊存檔在已知招式超過上限時預設攜帶前四招', () => {
      const record = makeRecord({ level: 3 });
      expect(availableMovesFromRecord(record)).toHaveLength(5);
      expect(MOVE_LOADOUT_CAP).toBe(4);
      expect(preparedMovesFromRecord(record).map((move) => move.id))
        .toEqual(['heavy-slash', 'guard', 'whirlwind-slash', 'breaking-combo']);
      expect(record.preparedMoveIds).toBeUndefined();
    });

    it('玩家可在已解鎖招式中配置一至四招，戰鬥成員只帶入該配置', () => {
      const record = makeRecord({ level: 3 });
      expect(setPreparedMoves(record, ['guard', 'strike'])).toEqual(['guard', 'strike']);
      expect(memberFromRecord(record).moves.map((move) => move.id)).toEqual(['guard', 'strike']);
    });

    it('未知、重複、空白或超量配置會拒絕且不修改既有配置', () => {
      const record = makeRecord({ level: 3, preparedMoveIds: ['guard', 'strike'] });
      for (const invalid of [
        [],
        ['guard', 'guard'],
        ['guard', 'not-a-move'],
        ['heavy-slash', 'guard', 'whirlwind-slash', 'breaking-combo', 'strike'],
      ]) {
        expect(() => setPreparedMoves(record, invalid)).toThrow();
        expect(record.preparedMoveIds).toEqual(['guard', 'strike']);
      }
    });

    it('毀損或已過期配置不會讓角色空手進戰鬥，而是退回安全預設', () => {
      const damaged = makeRecord({
        level: 3,
        preparedMoveIds: ['removed-move', 'removed-move'],
      });
      expect(preparedMovesFromRecord(damaged).map((move) => move.id))
        .toEqual(['heavy-slash', 'guard', 'whirlwind-slash', 'breaking-combo']);
    });
  });

  describe('memberFromRecord 裝備整合', () => {
    const TEST_WEAPON_MOVE: Move = {
      id: 'test-weapon-move', name: '測試武器技', kind: 'attack', target: 'enemy', hitStat: 'str',
      damage: { dice: 1, sides: 4, bonusStat: 'str' },
      narration: '{actor}揮動測試武器擊向{target}，造成 {amount} 點傷害！',
    };
    const SECOND_WEAPON_MOVE: Move = {
      id: 'second-weapon-move', name: '第二武器技', kind: 'attack', target: 'enemy', hitStat: 'str',
      damage: { dice: 1, sides: 8, bonusStat: 'str' },
      narration: '{actor}使出第二武器技擊向{target}，造成 {amount} 點傷害！',
    };
    const TEST_WEAPON: ItemDef = {
      id: 'test-weapon', name: '測試武器', desc: '測試用武器。', value: 20,
      equip: { slot: 'weapon', bonus: { str: 2 }, move: TEST_WEAPON_MOVE },
    };
    const SECOND_WEAPON: ItemDef = {
      id: 'second-weapon', name: '第二武器', desc: '另一把測試武器。', value: 30,
      equip: { slot: 'weapon', move: SECOND_WEAPON_MOVE },
    };
    const TEST_ARMOR: ItemDef = {
      id: 'test-armor', name: '測試護甲', desc: '測試用護甲。', value: 20,
      equip: { slot: 'armor', defense: 3, maxHp: 5 },
    };

    beforeEach(() => {
      ITEMS['test-weapon'] = TEST_WEAPON;
      ITEMS['second-weapon'] = SECOND_WEAPON;
      ITEMS['test-armor'] = TEST_ARMOR;
    });
    afterEach(() => {
      delete ITEMS['test-weapon'];
      delete ITEMS['second-weapon'];
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

    it('已配置職業首招時，換上帶招式武器會以武器招平滑取代', () => {
      const record = makeRecord({
        level: 3,
        preparedMoveIds: ['heavy-slash', 'guard', 'strike'],
        equipment: { weapon: 'test-weapon', armor: null, trinket: null },
      });
      expect(memberFromRecord(record).moves.map((move) => move.id))
        .toEqual(['test-weapon-move', 'guard', 'strike']);
    });

    it('已配置武器招時換另一把武器，保留槽位並改成新武器技', () => {
      const record = makeRecord({
        level: 3,
        preparedMoveIds: ['test-weapon-move', 'guard', 'strike'],
        equipment: { weapon: 'second-weapon', armor: null, trinket: null },
      });
      expect(memberFromRecord(record).moves.map((move) => move.id))
        .toEqual(['second-weapon-move', 'guard', 'strike']);
    });

    it('卸下武器後，原武器招槽恢復為職業首招，不會讓角色無預警少一招', () => {
      const record = makeRecord({
        level: 3,
        preparedMoveIds: ['test-weapon-move', 'guard', 'strike'],
        equipment: { weapon: null, armor: null, trinket: null },
      });
      expect(memberFromRecord(record).moves.map((move) => move.id))
        .toEqual(['heavy-slash', 'guard', 'strike']);
    });

    it('玩家刻意不攜帶武器招時，換裝不會擅自加入武器技', () => {
      const record = makeRecord({
        level: 3,
        preparedMoveIds: ['guard', 'whirlwind-slash', 'strike'],
        equipment: { weapon: 'test-weapon', armor: null, trinket: null },
      });
      expect(memberFromRecord(record).moves.map((move) => move.id))
        .toEqual(['guard', 'whirlwind-slash', 'strike']);
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