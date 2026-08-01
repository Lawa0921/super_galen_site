import { describe, expect, it } from 'vitest';
import {
  currentActor,
  partyAct,
  partyMoveAvailability,
  startCombat,
  type EnemyUnit,
  type Move,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';

function scriptedRng(values: number[]): Rng {
  let index = 0;
  const take = () => values[index++ % Math.max(1, values.length)] ?? 10;
  return {
    next: () => 0,
    roll: take,
    d20: take,
    pick: (items) => items[0],
    weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
  };
}

const strike: Move = {
  id: 'strike', name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 6, bonusStat: 'str' },
  narration: '{actor}揮擊{target}，造成 {amount} 點傷害！',
};
const fireball: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 2, sides: 6, bonusStat: 'int' },
  narration: '{actor}以火球轟擊{target}，造成 {amount} 點傷害！',
};
const meteor: Move = {
  id: 'meteor-fall', name: '隕石墜', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire', area: true,
  damage: { dice: 1, sides: 4 },
  narration: '{actor}召來隕石砸向{target}，造成 {amount} 點傷害！',
};
const holyStrike: Move = {
  id: 'holy-strike', name: '聖擊', kind: 'attack', target: 'enemy', hitStat: 'cha', element: 'holy',
  damage: { dice: 1, sides: 4 }, narration: '{actor}以聖光擊中{target}，造成 {amount} 點傷害！',
};
const heal: Move = {
  id: 'heal', name: '治癒', kind: 'support', target: 'ally', hitStat: 'cha',
  heal: { dice: 1, sides: 4 }, narration: '{actor}治癒{target}，恢復 {amount} 點生命。',
};
const hymn: Move = {
  id: 'battle-hymn', name: '戰吟', kind: 'support', target: 'ally', hitStat: 'cha',
  applyStatus: { kind: 'strength', duration: 2, potency: 2 }, narration: '{actor}為{target}吟唱戰歌。',
};

function member(id: string, moves: Move[], stats: PartyMember['stats']): PartyMember {
  return { id, name: id, stats, maxHp: 30, hp: 30, defense: 12, moves };
}

function enemy(): EnemyUnit {
  return {
    id: 'dummy', name: '訓練魔像', stats: { str: 10, dex: 5, int: 5, cha: 5, con: 30 },
    maxHp: 300, hp: 300, defense: 8, moves: [strike], intents: [{ weight: 1, moveId: 'strike' }],
  };
}

function forcePartyTurn(state: ReturnType<typeof startCombat>, id: string): void {
  state.turnIndex = state.order.indexOf(id);
}

describe('M41 arcane and faith combat resources', () => {
  it('initializes only mystical combatants and injects recovery actions without changing ids', () => {
    const mage = member('mage', [fireball, strike], { str: 8, dex: 12, int: 16, cha: 10, con: 9 });
    const cleric = member('cleric', [holyStrike, heal], { str: 10, dex: 10, int: 12, cha: 16, con: 12 });
    const fighter = member('fighter', [strike], { str: 16, dex: 10, int: 8, cha: 8, con: 16 });
    const state = startCombat(scriptedRng([20, 19, 18, 1]), [mage, cleric, fighter], [enemy()]);

    expect(state.party[0]).toBe(mage);
    expect(mage.mystic).toMatchObject({ kind: 'mana', current: 7, max: 7, strain: 0 });
    expect(cleric.mystic).toMatchObject({ kind: 'favor', current: 1, max: 5, strain: 0 });
    expect(fighter.mystic).toBeUndefined();
    expect(mage.moves.some((move) => move.id === 'arcane-focus')).toBe(true);
    expect(cleric.moves.some((move) => move.id === 'field-prayer')).toBe(true);
    expect(mage.moves.find((move) => move.id === 'fireball')?.name).toContain('秘法 2');
  });

  it('spends mana, blocks an unaffordable normal cast without advancing, and restores mana through focus', () => {
    const mage = member('mage', [meteor], { str: 8, dex: 14, int: 16, cha: 10, con: 10 });
    const state = startCombat(scriptedRng([20, 1]), [mage], [enemy()]);
    forcePartyTurn(state, mage.id);

    partyAct(scriptedRng([20, 2]), state, mage.id, 'meteor-fall', 'dummy');
    expect(mage.mystic?.current).toBe(3);

    forcePartyTurn(state, mage.id);
    const beforeTurn = state.turnIndex;
    const blocked = partyAct(scriptedRng([20, 2]), state, mage.id, 'meteor-fall', 'dummy');
    expect(blocked.acted).toBe(false);
    expect(state.turnIndex).toBe(beforeTurn);
    expect(mage.mystic?.current).toBe(3);

    forcePartyTurn(state, mage.id);
    partyAct(scriptedRng([10]), state, mage.id, 'arcane-focus', mage.id);
    expect(mage.mystic?.current).toBe(6);
  });

  it('allows explicit overcasting, applies escalating backlash, and stuns accumulated strain', () => {
    const mage = member('mage', [meteor], { str: 8, dex: 14, int: 16, cha: 10, con: 10 });
    const state = startCombat(scriptedRng([20, 1]), [mage], [enemy()]);
    forcePartyTurn(state, mage.id);
    partyAct(scriptedRng([20, 1]), state, mage.id, 'meteor-fall', 'dummy'); // 7 -> 3

    forcePartyTurn(state, mage.id);
    const preview = partyMoveAvailability(mage, mage.moves.find((move) => move.id === 'meteor-fall')!);
    expect(preview.canOvercast).toBe(true);
    expect(preview.backlash).toBe(4);
    const first = partyAct(scriptedRng([20, 1]), state, mage.id, 'meteor-fall', 'dummy', { overcast: true });
    expect(first).toMatchObject({ acted: true, overcast: true, backlash: 4 });
    expect(mage.hp).toBe(26);
    expect(mage.mystic).toMatchObject({ current: 0, strain: 1 });

    forcePartyTurn(state, mage.id);
    const second = partyAct(scriptedRng([20, 1]), state, mage.id, 'meteor-fall', 'dummy', { overcast: true });
    expect(second.backlash).toBe(12);
    expect(mage.hp).toBe(14);
    expect(mage.mystic?.strain).toBe(5);
    expect(mage.statuses?.some((status) => status.kind === 'stun')).toBe(true);

    forcePartyTurn(state, mage.id);
    const fatal = partyMoveAvailability(mage, mage.moves.find((move) => move.id === 'meteor-fall')!, { overcast: true });
    expect(fatal.allowed).toBe(false);
  });

  it('builds favor through holy actions and refuses miracles when favor is missing', () => {
    const cleric = member('cleric', [holyStrike, heal, hymn], { str: 10, dex: 14, int: 12, cha: 16, con: 12 });
    cleric.hp = 20;
    const state = startCombat(scriptedRng([20, 1]), [cleric], [enemy()]);
    expect(cleric.mystic?.current).toBe(1);

    forcePartyTurn(state, cleric.id);
    partyAct(scriptedRng([20, 1]), state, cleric.id, 'holy-strike', 'dummy');
    expect(cleric.mystic?.current).toBe(2);

    forcePartyTurn(state, cleric.id);
    partyAct(scriptedRng([4]), state, cleric.id, 'heal', cleric.id);
    expect(cleric.mystic?.current).toBe(1);
    expect(cleric.hp).toBe(24);

    forcePartyTurn(state, cleric.id);
    const blocked = partyAct(scriptedRng([10]), state, cleric.id, 'battle-hymn', cleric.id);
    expect(blocked.acted).toBe(false);
    expect(currentActor(state)).toEqual({ side: 'party', id: cleric.id });

    partyAct(scriptedRng([10]), state, cleric.id, 'field-prayer', cleric.id);
    expect(cleric.mystic?.current).toBe(2);
  });

  it('keeps physical actions free and compatible with the original turn loop', () => {
    const fighter = member('fighter', [strike], { str: 16, dex: 14, int: 8, cha: 8, con: 16 });
    const foe = enemy();
    const state = startCombat(scriptedRng([20, 1]), [fighter], [foe]);
    const result = partyAct(scriptedRng([20, 6]), state, fighter.id, 'strike', foe.id);
    expect(result).toMatchObject({ acted: true, overcast: false, backlash: 0 });
    expect(fighter.mystic).toBeUndefined();
    expect(foe.hp).toBeLessThan(300);
    expect(currentActor(state)?.side).toBe('enemy');
  });
});
