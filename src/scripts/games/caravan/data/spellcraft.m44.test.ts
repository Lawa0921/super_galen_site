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
  damage: { dice: 1, sides: 1 }, narration: '{actor}揮擊{target}，造成 {amount} 點傷害！',
};

const meteor: Move = {
  id: 'meteor-fall', name: '隕石墜', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 1 }, narration: '{actor}召來隕石砸向{target}，造成 {amount} 點傷害！',
};

const saltSpell: Move = {
  id: 'salt-shard-throw', name: '鹽刃投擲', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'frost',
  damage: { dice: 1, sides: 1 }, narration: '{actor}凝出寒鹽之刃射向{target}，造成 {amount} 點傷害！',
};

const frostBind: Move = {
  id: 'frost-bind', name: '寒冰束縛', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'frost',
  damage: { dice: 1, sides: 1 }, applyStatus: { kind: 'stun', duration: 1 },
  narration: '{actor}以寒冰束縛{target}，造成 {amount} 點傷害！',
};

const banditMend: Move = {
  id: 'bandit-mend', name: '禁咒止血', kind: 'support', target: 'ally', hitStat: 'cha',
  heal: { dice: 1, sides: 1 }, narration: '{actor}為{target}止血，恢復 {amount} 點生命。',
};

function member(id: string, moves: Move[], stats: PartyMember['stats'] = { str: 14, dex: 12, int: 10, cha: 10, con: 14 }): PartyMember {
  return { id, name: id, stats, maxHp: 40, hp: 40, defense: 10, moves };
}

function casterEnemy(id: string, moves: Move[], intents?: EnemyUnit['intents']): EnemyUnit {
  return {
    id,
    name: id,
    stats: { str: 8, dex: 8, int: 12, cha: 14, con: 10 },
    maxHp: 40,
    hp: 40,
    defense: 8,
    moves,
    intents: intents ?? moves.map((move) => ({ weight: 1, moveId: move.id })),
  };
}

function forceTurn(state: ReturnType<typeof startCombat>, id: string): void {
  state.turnIndex = state.order.indexOf(id);
}

describe('M44 spellcraft counterplay', () => {
  it('turns arcane recovery into a one-charge ally ward without stacking charges', () => {
    const mage = member('mage', [meteor], { str: 8, dex: 14, int: 16, cha: 10, con: 10 });
    const guard = member('guard', [strike]);
    const dummy = casterEnemy('dummy', [strike]);
    const state = startCombat(scriptedRng([20, 19, 1]), [mage, guard], [dummy]);

    forceTurn(state, mage.id);
    partyAct(scriptedRng([20, 1]), state, mage.id, 'meteor-fall', dummy.id);
    expect(mage.mystic?.current).toBe(3);

    forceTurn(state, mage.id);
    partyAct(scriptedRng([10]), state, mage.id, 'arcane-focus', guard.id);
    expect(mage.mystic?.current).toBe(6);
    expect(guard.statuses?.find((status) => status.kind === 'ward')).toMatchObject({ remaining: 1, potency: 4 });

    forceTurn(state, mage.id);
    partyAct(scriptedRng([10]), state, mage.id, 'arcane-focus', guard.id);
    expect(guard.statuses?.find((status) => status.kind === 'ward')).toMatchObject({ remaining: 1, potency: 4 });
  });

  it('wards only magical damage while leaving physical attacks untouched', () => {
    const guard = member('guard', [strike]);
    guard.statuses = [{ kind: 'ward', remaining: 1, potency: 4 }];
    const caster = casterEnemy('salt-wraith', [saltSpell, strike], [
      { weight: 1, moveId: 'salt-shard-throw' },
      { weight: 1, moveId: 'strike' },
    ]);
    const state = startCombat(scriptedRng([20, 1]), [guard], [caster]);

    state.enemyIntents[caster.id] = 'salt-shard-throw';
    forceTurn(state, caster.id);
    enemyAct(scriptedRng([20, 1]), state, caster.id);
    expect(guard.hp).toBe(40); // 1 點魔法傷害被 4 點護法完全吃掉
    expect(guard.statuses?.some((status) => status.kind === 'ward')).toBe(false);

    guard.statuses = [{ kind: 'ward', remaining: 1, potency: 4 }];
    state.enemyIntents[caster.id] = 'strike';
    forceTurn(state, caster.id);
    enemyAct(scriptedRng([20, 1]), state, caster.id);
    expect(guard.hp).toBe(39);
    expect(guard.statuses?.find((status) => status.kind === 'ward')?.remaining).toBe(1);
  });

  it('fully warded spells do not sneak their magical rider status through zero damage', () => {
    const guard = member('guard', [strike]);
    guard.statuses = [{ kind: 'ward', remaining: 1, potency: 4 }];
    const caster = casterEnemy('binder', [frostBind]);
    const state = startCombat(scriptedRng([20, 1]), [guard], [caster]);

    forceTurn(state, caster.id);
    enemyAct(scriptedRng([20, 1]), state, caster.id);
    expect(guard.hp).toBe(40);
    expect(guard.statuses?.some((status) => status.kind === 'stun')).toBe(false);
  });

  it('makes enemy mages spend mana, then publicly switch to recovery instead of free overcasting', () => {
    const guard = member('guard', [strike]);
    guard.maxHp = guard.hp = 100;
    const caster = casterEnemy('salt-wraith', [saltSpell]);
    const state = startCombat(scriptedRng([20, 1]), [guard], [caster]);
    expect(caster.mystic).toMatchObject({ kind: 'mana', current: 6, max: 6, strain: 0 });

    for (const expected of [4, 2, 0]) {
      forceTurn(state, caster.id);
      enemyAct(scriptedRng([20, 1]), state, caster.id);
      expect(caster.mystic?.current).toBe(expected);
    }
    expect(state.enemyIntents[caster.id]).toBe('arcane-focus');

    forceTurn(state, caster.id);
    enemyAct(scriptedRng([10]), state, caster.id);
    expect(caster.mystic?.current).toBe(3);
    expect(caster.mystic?.strain).toBe(0);
    expect(caster.hp).toBe(40);
    expect(caster.statuses?.some((status) => status.kind === 'ward')).toBe(true);
  });

  it('makes hostile priests alternate spent favor with visible prayer recovery', () => {
    const guard = member('guard', [strike]);
    const priest = casterEnemy('bandit-priest', [banditMend]);
    priest.hp = 30;
    const state = startCombat(scriptedRng([20, 1]), [guard], [priest]);
    expect(priest.mystic).toMatchObject({ kind: 'favor', current: 1 });

    forceTurn(state, priest.id);
    enemyAct(scriptedRng([1]), state, priest.id);
    expect(priest.hp).toBe(31);
    expect(priest.mystic?.current).toBe(0);
    expect(state.enemyIntents[priest.id]).toBe('field-prayer');

    forceTurn(state, priest.id);
    enemyAct(scriptedRng([10]), state, priest.id);
    expect(priest.mystic?.current).toBe(1);
    expect(priest.statuses?.some((status) => status.kind === 'ward')).toBe(true);
  });

  it('rejects player-side illegal targets instead of trusting the UI to prevent abuse', () => {
    const mage = member('mage', [meteor], { str: 8, dex: 14, int: 16, cha: 10, con: 10 });
    const ally = member('ally', [strike]);
    const foe = casterEnemy('foe', [strike]);
    const state = startCombat(scriptedRng([20, 19, 1]), [mage, ally], [foe]);

    forceTurn(state, mage.id);
    const attackAlly = partyAct(scriptedRng([20, 1]), state, mage.id, 'meteor-fall', ally.id);
    expect(attackAlly).toMatchObject({ acted: false, reason: '這個招式不能指定該目標。' });
    expect(ally.hp).toBe(40);

    forceTurn(state, mage.id);
    const wardEnemy = partyAct(scriptedRng([10]), state, mage.id, 'arcane-focus', foe.id);
    expect(wardEnemy).toMatchObject({ acted: false, reason: '這個招式不能指定該目標。' });
    expect(foe.statuses?.some((status) => status.kind === 'ward')).toBe(false);
  });
});
