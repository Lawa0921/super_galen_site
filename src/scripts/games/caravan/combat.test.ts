import { describe, it, expect } from 'vitest';
import { statMod } from './check';
import { startCombat, currentActor, advanceTurn, partyAct, enemyAct, attemptRetreat, resolveCasualties } from './combat';
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

  it('三方同分：隊伍成員全部排在敵人前（傳入順序穩定）', () => {
    const state = startCombat(scriptedRng([10, 10, 10]),
      [makeMember('p1', 10), makeMember('p2', 10)], [makeEnemy('e1', 10)]);
    expect(state.order).toEqual(['p1', 'p2', 'e1']);
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

describe('動作結算', () => {
  function freshState(dies: number[]) {
    // hero 先攻（骰 15+2 vs 5+0）
    return { rng: scriptedRng(dies), state: startCombat(scriptedRng([15, 5]), [makeMember('hero', 14)], [makeEnemy('foe', 10)]) };
  }

  it('攻擊命中：d20+statMod(str) >= defense，傷害=骰+statMod、log damage、輪到敵方', () => {
    const { state } = freshState([]);
    // 命中骰 10+2=12 >= 10；傷害骰 4 + str(+2) = 6
    partyAct(scriptedRng([10, 4]), state, 'hero', 'strike', 'foe');
    expect(state.enemies[0].hp).toBe(4);
    expect(state.log.some((e) => e.kind === 'damage' && e.text.includes('6'))).toBe(true);
    expect(currentActor(state)).toEqual({ side: 'enemy', id: 'foe' });
  });

  it('攻擊未中：不扣血、log 落空', () => {
    const { state } = freshState([]);
    partyAct(scriptedRng([5]), state, 'hero', 'strike', 'foe'); // 5+2=7 < 10
    expect(state.enemies[0].hp).toBe(10);
    expect(state.log.at(-1)?.text).toContain('落空');
  });

  it('nat1 必失手即使修正足夠；nat20 必中', () => {
    const a = freshState([]).state;
    a.enemies[0].defense = 1;
    partyAct(scriptedRng([1, 6]), a, 'hero', 'strike', 'foe');
    expect(a.enemies[0].hp).toBe(10);
    const b = freshState([]).state;
    b.enemies[0].defense = 30;
    partyAct(scriptedRng([20, 4]), b, 'hero', 'strike', 'foe');
    expect(b.enemies[0].hp).toBe(4);
  });

  it('架盾使受擊方 defense +4', () => {
    const state = startCombat(scriptedRng([5, 15]), [makeMember('hero', 14)], [makeEnemy('foe', 10)]);
    // foe 先動；hero 設架盾
    state.guarding['hero'] = true;
    // foe 攻 hero：骰 13+1(str12)=14 < 12+4 → 未中
    enemyAct(scriptedRng([13, 3]), state, 'foe');
    expect(state.party[0].hp).toBe(20);
  });

  it('治療不超過 maxHp、log heal', () => {
    const healMove: Move = { id: 'heal', name: '治癒', kind: 'support', target: 'ally', hitStat: 'cha',
      heal: { dice: 1, sides: 8, bonusStat: 'cha' }, narration: '{actor}治癒了{target}，恢復 {amount} 點！' };
    const cleric = makeMember('cleric', 10, { moves: [healMove], stats: { str: 8, dex: 10, int: 10, cha: 16, con: 10 } });
    const state = startCombat(scriptedRng([15, 5]), [cleric], [makeEnemy('foe', 10)]);
    cleric.hp = 15;
    partyAct(scriptedRng([6]), state, 'cleric', 'heal', 'cleric'); // 6 + cha(+3) = 9 → cap 至 20
    expect(cleric.hp).toBe(20);
    expect(state.log.some((e) => e.kind === 'heal')).toBe(true);
  });

  it('敵方全滅 → victory；隊伍全滅 → defeat', () => {
    const { state } = freshState([]);
    state.enemies[0].hp = 3;
    partyAct(scriptedRng([10, 4]), state, 'hero', 'strike', 'foe'); // 6 傷 → 倒地
    expect(state.outcome).toBe('victory');
    expect(currentActor(state)).toBeNull();

    const s2 = startCombat(scriptedRng([5, 15]), [makeMember('hero', 14)], [makeEnemy('foe', 10)]);
    s2.party[0].hp = 1;
    enemyAct(scriptedRng([15, 6]), s2, 'foe'); // 命中 → hero 倒地
    expect(s2.outcome).toBe('defeat');
  });

  it('enemyAct 用預告招式攻擊 hp 最低隊員並重新預告', () => {
    const a = makeMember('a', 14); const b = makeMember('b', 12);
    b.hp = 5;
    const state = startCombat(scriptedRng([5, 15, 6]), [a, b], [makeEnemy('foe', 10)]);
    expect(currentActor(state)?.id).toBe('foe');
    enemyAct(scriptedRng([15, 3]), state, 'foe');   // 攻 b（hp 最低）：15+1=16 >= 12 → 3+1=4 傷
    expect(b.hp).toBe(1);
    expect(state.enemyIntents['foe']).toBe('strike'); // 重新預告
  });

  it('attemptRetreat：outcome=retreated、殿後者（先攻最低存活）受一擊', () => {
    const a = makeMember('a', 14); const b = makeMember('b', 8);
    const state = startCombat(scriptedRng([15, 5, 10]), [a, b], [makeEnemy('foe', 10)]);
    attemptRetreat(scriptedRng([18, 4]), state);    // foe 攻殿後者 b：18+1 命中、4+1=5 傷
    expect(state.outcome).toBe('retreated');
    expect(b.hp).toBe(15);
    expect(state.log.some((e) => e.kind === 'retreat')).toBe(true);
  });

  it('resolveCasualties：主角必重傷；傭兵過 DC10 重傷、不過死亡', () => {
    const boss = makeMember('boss', 10, { isProtagonist: true });
    const merc1 = makeMember('m1', 10); const merc2 = makeMember('m2', 10);
    const state = startCombat(scriptedRng([10, 9, 8, 5]), [boss, merc1, merc2], [makeEnemy('foe', 10)]);
    boss.hp = 0; merc1.hp = 0; merc2.hp = 0;
    // merc1 擲 12+1(con12)=13 >= 10 → injured；merc2 擲 3+1=4 → dead
    const fates = resolveCasualties(scriptedRng([12, 3]), state);
    expect(fates).toEqual([
      { id: 'boss', fate: 'injured' },
      { id: 'm1', fate: 'injured' },
      { id: 'm2', fate: 'dead' },
    ]);
  });
});
