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

function guardMove(id = 'guard'): Move {
  return {
    id,
    name: '架盾',
    kind: 'guard',
    target: 'self',
    hitStat: 'str',
    narration: '{actor}舉盾穩守。',
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

function frontAnchor(id = 'anchor'): PartyMember {
  return member(id, guardMove(`${id}-guard`), 'front', { str: 12, dex: 10, int: 8, cha: 8, con: 12 });
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
    const state = startCombat(scriptedRng([15, 5, 10]), [frontAnchor(), hero], [foe]);

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
    const backState = startCombat(scriptedRng([15, 5, 10]), [frontAnchor('bow-anchor'), backArcher], [backFoe]);
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
    const guard = guardMove();
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

  it('front-row guard still intercepts without inventing a shield item', () => {
    const guard = guardMove();
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
    expect(state.log.some((entry) => entry.text.includes('guardian挺身上前') && entry.text.includes('victim'))).toBe(true);
    expect(state.log.some((entry) => entry.text.includes('持盾'))).toBe(false);
  });

  it('promotes surviving rear members when the frontline falls, so the engagement model follows the battlefield instead of stale setup data', () => {
    const slash = attack('rear-sword', 'str', 'slash');
    const front = member('fragile-front', attack('front-strike', 'str', 'slash'), 'front', { str: 10, dex: 10, int: 8, cha: 8, con: 10 });
    front.hp = 1;
    const rearSword = member('rear-sword-user', slash, 'back', { str: 14, dex: 12, int: 8, cha: 8, con: 12 });
    const rearArcher = member('rear-archer', attack('rear-arrow', 'dex', 'pierce'), 'back', { str: 8, dex: 16, int: 8, cha: 8, con: 10 });
    const foe = enemy();
    const state = startCombat(scriptedRng([5, 18, 7, 6]), [front, rearSword, rearArcher], [foe]);
    state.turnIndex = state.order.indexOf(foe.id);

    enemyAct(scriptedRng([20, 3]), state, foe.id);

    expect(front.hp).toBe(0);
    expect(rearSword.formationRow).toBe('front');
    expect(rearArcher.formationRow).toBe('front');
    expect(state.log.some((entry) => entry.text.includes('前線崩潰') && entry.text.includes('被迫上前接戰'))).toBe(true);

    const foeHpBeforeSword = foe.hp;
    // 10 + STR 2 = 12：被提升為前排後，近戰不再吃舊的後排 -2，應命中。
    partyAct(scriptedRng([10, 4]), state, rearSword.id, slash.id, foe.id);
    expect(foe.hp).toBeLessThan(foeHpBeforeSword);

    const foeHpBeforeArrow = foe.hp;
    // 10 + DEX 3 - 2 = 11：同一崩線會讓弓手真正承受前排近身壓力。
    partyAct(scriptedRng([10, 4]), state, rearArcher.id, rearArcher.moves[0].id, foe.id);
    expect(foe.hp).toBe(foeHpBeforeArrow);
    expect(state.log.some((entry) => entry.text.includes('前排近身壓力') && entry.text.includes('rear-arrow'))).toBe(true);
  });

  it('normalizes an impossible all-rear combat start into an exposed frontline instead of granting a phantom safe row', () => {
    const sword = member('solo-sword', attack('solo-slash', 'str', 'slash'), 'back', { str: 14, dex: 12, int: 8, cha: 8, con: 12 });
    const archer = member('solo-archer', attack('solo-arrow', 'dex', 'pierce'), 'back', { str: 8, dex: 16, int: 8, cha: 8, con: 10 });
    const state = startCombat(scriptedRng([15, 10, 5]), [sword, archer], [enemy()]);

    expect(sword.formationRow).toBe('front');
    expect(archer.formationRow).toBe('front');
    expect(state.log.some((entry) => entry.text.includes('前線崩潰'))).toBe(true);
  });
});
