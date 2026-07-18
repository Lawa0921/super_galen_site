import { describe, it, expect } from 'vitest';
import { statMod } from './check';
import { startCombat, currentActor, advanceTurn } from './combat';
import type { PartyMember, EnemyUnit, Move } from './combat';
import type { Rng } from './rng';

/** 依序回傳指定骰值的假 RNG（骰完循環）；next 固定 0（weightedPick 取第一個非零權重項） */
export function scriptedRng(dies: number[]): Rng {
  let i = 0;
  const take = () => dies[i++ % dies.length];
  return {
    next: () => 0,
    roll: take,
    d20: take,
    pick: (arr) => arr[0],
    weightedPick: (items) => {
      const hit = items.find((it) => it.weight > 0);
      if (!hit) throw new Error('weightedPick: 空清單或總權重為 0');
      return hit.value;
    },
  };
}

const strike: Move = { id: 'strike', name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}揮擊{target}，造成 {amount} 點傷害！' };

export function makeMember(id: string, dex: number, extra: Partial<PartyMember> = {}): PartyMember {
  return { id, name: id, stats: { str: 14, dex, int: 10, cha: 10, con: 12 },
    maxHp: 20, hp: 20, defense: 12, moves: [strike], ...extra };
}
export function makeEnemy(id: string, dex: number, extra: Partial<EnemyUnit> = {}): EnemyUnit {
  return { id, name: id, stats: { str: 12, dex, int: 8, cha: 6, con: 10 },
    maxHp: 10, hp: 10, defense: 10, moves: [strike], intents: [{ weight: 1, moveId: 'strike' }], ...extra };
}

describe('statMod', () => {
  it('D&D 式調整值', () => {
    expect(statMod(10)).toBe(0);
    expect(statMod(14)).toBe(2);
    expect(statMod(8)).toBe(-1);
    expect(statMod(20)).toBe(5);
  });
});

describe('startCombat / 先攻與回合', () => {
  it('先攻 = d20 + statMod(dex)，高到低排序', () => {
    // hero dex14(+2), foe dex10(+0)：骰 5(hero)=7、10(foe)=10 → foe 先
    const state = startCombat(scriptedRng([5, 10]), [makeMember('hero', 14)], [makeEnemy('foe', 10)]);
    expect(state.order).toEqual(['foe', 'hero']);
    expect(currentActor(state)).toEqual({ side: 'enemy', id: 'foe' });
  });

  it('同分依傳入順序穩定（隊伍在前）', () => {
    const state = startCombat(scriptedRng([10, 10]), [makeMember('hero', 10)], [makeEnemy('foe', 10)]);
    expect(state.order).toEqual(['hero', 'foe']);
  });

  it('開場為每個敵人預告意圖並記 log', () => {
    const state = startCombat(scriptedRng([10, 5]), [makeMember('hero', 14)], [makeEnemy('foe', 10)]);
    expect(state.enemyIntents['foe']).toBe('strike');
    expect(state.log.some((e) => e.kind === 'info')).toBe(true);
    expect(state.round).toBe(1);
    expect(state.outcome).toBe('ongoing');
  });

  it('advanceTurn 跳過倒地者並在繞回時 round+1', () => {
    const state = startCombat(scriptedRng([15, 10, 5]),
      [makeMember('a', 14), makeMember('b', 10)], [makeEnemy('foe', 10)]);
    // 先攻：a=17, foe=10, b=6 → order [a, foe, b]
    expect(state.order).toEqual(['a', 'foe', 'b']);
    state.enemies[0].hp = 0;               // foe 倒地
    advanceTurn(state);                    // 從 a 前進，跳過 foe
    expect(currentActor(state)).toEqual({ side: 'party', id: 'b' });
    advanceTurn(state);                    // b → 繞回 a
    expect(currentActor(state)).toEqual({ side: 'party', id: 'a' });
    expect(state.round).toBe(2);
  });

  it('行動者輪到時解除自己的架盾標記', () => {
    const state = startCombat(scriptedRng([15, 5]), [makeMember('a', 14)], [makeEnemy('foe', 10)]);
    state.guarding['a'] = true;
    advanceTurn(state);                    // foe
    advanceTurn(state);                    // 繞回 a → a 的架盾解除
    expect(state.guarding['a']).toBeFalsy();
  });
});
