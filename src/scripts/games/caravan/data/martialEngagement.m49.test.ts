import { describe, expect, it } from 'vitest';
import {
  enemyAct,
  partyAct,
  startCombat,
  type EnemyUnit,
  type Move,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';

function scriptedRng(dies: number[]): Rng {
  let index = 0;
  const take = () => dies[index++ % dies.length];
  return {
    next: () => 0,
    roll: take,
    d20: take,
    pick: (items) => items[0],
    weightedPick: (items) => {
      const hit = items.find((item) => item.weight > 0);
      if (!hit) throw new Error('weightedPick: no weighted item');
      return hit.value;
    },
  };
}

function attack(id: string, hitStat: 'str' | 'dex' | 'int', element: Move['element']): Move {
  return {
    id,
    name: id,
    kind: 'attack',
    target: 'enemy',
    hitStat,
    element,
    damage: { dice: 1, sides: 6, bonusStat: hitStat },
    narration: '{actor}攻擊{target}，造成 {amount} 點傷害！',
  };
}

function member(id: string, move: Move, row: 'front' | 'back', stats: PartyMember['stats']): PartyMember {
  return {
    id,
    name: id,
    stats,
    maxHp: 20,
    hp: 20,
    defense: 12,
    moves: [move],
    formationRow: row,
  };
}

function enemy(id = 'foe', defense = 12): EnemyUnit {
  const strike = attack('enemy-strike', 'str', 'slash');
  return {
    id,
    name: id,
    stats: { str: 12, dex: 10, int: 8, cha: 8, con: 10 },
    maxHp: 20,
    hp: 20,
    defense,
    moves: [strike],
    intents: [{ weight: 1, moveId: strike.id }],
  };
}

describe('M49 live martial engagement integration', () => {
  it('rear-row melee turns a borderline hit into a miss and explains why', () => {
    const slash = attack('test-slash', 'str', 'slash');
    const hero = member('hero', slash, 'back', { str: 14, dex: 14, int: 8, cha: 8, con: 12 });
    const foe = enemy();
    const state = startCombat(scriptedRng([15, 5]), [hero], [foe]);

    // 11 + STR 2 = 13：正常會命中 DEF 12；後排近戰 -2 後只剩 11。
    partyAct(scriptedRng([11, 4]), state, hero.id, slash.id, foe.id);

    expect(foe.hp).toBe(20);
    expect(state.log.some((entry) => entry.text.includes('後排距離限制') && entry.text.includes('命中 -2'))).toBe(true);
  });

  it('front-row ranged attacks suffer pressure while rear-row ranged attacks stay clean', () => {
    const bow = attack('test-arrow', 'dex', 'pierce');
    const frontArcher = member('front-archer', bow, 'front', { str: 8, dex: 16, int: 8, cha: 8, con: 10 });
    const frontFoe = enemy('front-foe');
    const frontState = startCombat(scriptedRng([15, 5]), [frontArcher], [frontFoe]);

    // 10 + DEX 3 = 13：前排弓弩 -2 後為 11，未達 DEF 12。
    partyAct(scriptedRng([10, 4]), frontState, frontArcher.id, bow.id, frontFoe.id);
    expect(frontFoe.hp).toBe(20);
    expect(frontState.log.some((entry) => entry.text.includes('前排近身壓力'))).toBe(true);

    const backArcher = member('back-archer', bow, 'back', { str: 8, dex: 16, int: 8, cha: 8, con: 10 });
    const backFoe = enemy('back-foe');
    const backState = startCombat(scriptedRng([15, 5]), [backArcher], [backFoe]);
    partyAct(scriptedRng([10, 4]), backState, backArcher.id, bow.id, backFoe.id);

    expect(backFoe.hp).toBeLessThan(20);
    expect(backState.log.some((entry) => entry.text.includes('前排近身壓力'))).toBe(false);
  });

  it('true magic ignores mundane formation pressure instead of being misclassified by its damage element', () => {
    const fire = attack('test-fire', 'int', 'fire');
    const mage = member('mage', fire, 'front', { str: 8, dex: 14, int: 16, cha: 8, con: 8 });
    const foe = enemy();
    const state = startCombat(scriptedRng([15, 5]), [mage], [foe]);

    // arcana fallback recognises INT+fire as mana magic. 9 + INT 3 = 12，應正常命中。
    partyAct(scriptedRng([9, 4]), state, mage.id, fire.id, foe.id);

    expect(foe.hp).toBeLessThan(20);
    expect(state.log.some((entry) => entry.text.includes('前排近身壓力') || entry.text.includes('後排距離限制'))).toBe(false);
  });

  it('back-row guard keeps personal defense but can no longer teleport forward to intercept an ally', () => {
    const guard: Move = {
      id: 'guard', name: '架盾', kind: 'guard', target: 'self', hitStat: 'str',
      narration: '{actor}舉盾穩守。',
    };
    const front = member('front', attack('front-strike', 'str', 'slash'), 'front', { str: 12, dex: 10, int: 8, cha: 8, con: 12 });
    front.hp = 6;
    const backGuard = member('back-guard', guard, 'back', { str: 14, dex: 10, int: 8, cha: 8, con: 14 });
    const foe = enemy();
    const state = startCombat(scriptedRng([5, 18, 4]), [front, backGuard], [foe]);
    state.guarding[backGuard.id] = true;
    state.turnIndex = state.order.indexOf(foe.id);

    enemyAct(scriptedRng([20, 3]), state, foe.id);

    expect(front.hp).toBeLessThan(6);
    expect(backGuard.hp).toBe(20);
    expect(state.log.some((entry) => entry.text.includes('替front攔下攻擊'))).toBe(false);
  });

  it('front-row guard still intercepts, preserving the swordsman protector role', () => {
    const guard: Move = {
      id: 'guard', name: '架盾', kind: 'guard', target: 'self', hitStat: 'str',
      narration: '{actor}舉盾穩守。',
    };
    const victim = member('victim', attack('victim-strike', 'str', 'slash'), 'front', { str: 10, dex: 10, int: 8, cha: 8, con: 10 });
    victim.hp = 6;
    const guardian = member('guardian', guard, 'front', { str: 14, dex: 10, int: 8, cha: 8, con: 14 });
    const foe = enemy();
    const state = startCombat(scriptedRng([5, 18, 4]), [victim, guardian], [foe]);
    state.guarding[guardian.id] = true;
    state.turnIndex = state.order.indexOf(foe.id);

    enemyAct(scriptedRng([20, 3]), state, foe.id);

    expect(victim.hp).toBe(6);
    expect(guardian.hp).toBeLessThan(20);
    expect(state.log.some((entry) => entry.text.includes('guardian持盾上前') && entry.text.includes('victim'))).toBe(true);
  });
});
