import { describe, expect, it } from 'vitest';
import {
  partyAct,
  startCombat,
  type CombatState,
  type EnemyUnit,
  type Move,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import { createReliquaryEncounter } from './ashenReliquaryCombat';
import {
  ritualChargeFor,
  ritualEnemyAct,
  ritualIntentText,
} from './rituals.m45';

function scriptedRng(values: number[] = [10, 4, 10, 4]): Rng {
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
  damage: { dice: 1, sides: 1, bonusStat: 'str' },
  narration: '{actor}揮擊{target}，造成 {amount} 點傷害！',
};

const stunBash: Move = {
  id: 'test-stun-bash', name: '震地盾擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'blunt',
  damage: { dice: 1, sides: 1 }, applyStatus: { kind: 'stun', duration: 1 },
  narration: '{actor}以盾緣震擊{target}，造成 {amount} 點傷害！',
};

function fighter(id = 'fighter'): PartyMember {
  return {
    id, name: id, stats: { str: 16, dex: 12, int: 8, cha: 8, con: 16 },
    maxHp: 40, hp: 40, defense: 12, moves: [strike, stunBash], formationRow: 'front',
  };
}

function forceTurn(state: CombatState, id: string): void {
  state.turnIndex = state.order.indexOf(id);
}

describe('M45 interruptible rituals', () => {
  it('spends the first ritual turn on a visible preparation without damage or resource cost', () => {
    const party = [fighter()];
    const cantor = createReliquaryEncounter(2)[0];
    const state = startCombat(scriptedRng([20, 1, 10, 4]), party, [cantor]);
    state.enemyIntents[cantor.id] = 'reliquary-silent-chorus';
    forceTurn(state, cantor.id);

    const hpBefore = party[0].hp;
    const manaBefore = cantor.mystic?.current;
    const result = ritualEnemyAct(scriptedRng([10, 4]), state, cantor.id);

    expect(result).toEqual({ kind: 'prepared', moveId: 'reliquary-silent-chorus' });
    expect(party[0].hp).toBe(hpBefore);
    expect(cantor.mystic?.current).toBe(manaBefore);
    expect(ritualChargeFor(state, cantor.id)?.moveId).toBe('reliquary-silent-chorus');
    expect(ritualIntentText(state, cantor)).toContain('即將完成');
    expect(state.log.some((entry) => entry.text.includes('死寂'))).toBe(true);
  });

  it('lets stun or a poise-break stun cancel a prepared ritual before it resolves', () => {
    const guard = fighter();
    const cantor = createReliquaryEncounter(2)[0];
    const state = startCombat(scriptedRng([20, 1, 10, 4]), [guard], [cantor]);
    state.enemyIntents[cantor.id] = 'reliquary-silent-chorus';
    forceTurn(state, cantor.id);
    ritualEnemyAct(scriptedRng([10]), state, cantor.id);

    forceTurn(state, guard.id);
    partyAct(scriptedRng([20, 1]), state, guard.id, 'test-stun-bash', cantor.id);
    expect(cantor.statuses?.some((status) => status.kind === 'stun')).toBe(true);

    const hpBefore = guard.hp;
    forceTurn(state, cantor.id);
    const result = ritualEnemyAct(scriptedRng([10]), state, cantor.id);

    expect(result.kind).toBe('interrupted');
    expect(guard.hp).toBe(hpBefore);
    expect(ritualChargeFor(state, cantor.id)).toBeNull();
    expect(state.log.some((entry) => entry.text.includes('被打斷'))).toBe(true);
  });

  it('resolves normally on the second action and pays the original spell resource exactly once', () => {
    const guard = fighter();
    guard.maxHp = guard.hp = 80;
    const cantor = createReliquaryEncounter(2)[0];
    const state = startCombat(scriptedRng([20, 1, 10, 4]), [guard], [cantor]);
    state.enemyIntents[cantor.id] = 'reliquary-silent-chorus';
    const manaBefore = cantor.mystic?.current ?? 0;

    forceTurn(state, cantor.id);
    ritualEnemyAct(scriptedRng([10]), state, cantor.id);
    expect(cantor.mystic?.current).toBe(manaBefore);

    forceTurn(state, cantor.id);
    const result = ritualEnemyAct(scriptedRng([20, 4]), state, cantor.id);

    expect(result.kind).toBe('resolved');
    expect(cantor.mystic?.current).toBe(manaBefore - 3);
    expect(guard.hp).toBeLessThan(80);
    expect(ritualChargeFor(state, cantor.id)).toBeNull();
  });

  it('keeps non-ritual enemy actions immediate', () => {
    const guard = fighter();
    const cantor = createReliquaryEncounter(2)[0];
    const state = startCombat(scriptedRng([20, 1, 10, 4]), [guard], [cantor]);
    state.enemyIntents[cantor.id] = 'reliquary-lament-touch';
    forceTurn(state, cantor.id);
    const hpBefore = guard.hp;

    const result = ritualEnemyAct(scriptedRng([20, 4]), state, cantor.id);

    expect(result.kind).toBe('normal');
    expect(guard.hp).toBeLessThan(hpBefore);
    expect(ritualChargeFor(state, cantor.id)).toBeNull();
  });

  it('uses the live dragon-heart breath as a costly, telegraphed pyromancy ritual', () => {
    const guard = fighter();
    guard.maxHp = guard.hp = 100;
    const avatar = createReliquaryEncounter(3)[0];
    const state = startCombat(scriptedRng([20, 1, 10, 4]), [guard], [avatar]);
    const breath = avatar.moves.find((move) => move.id === 'reliquary-ember-breath');
    expect(breath?.name).toContain('秘法 4');
    expect(avatar.mystic?.kind).toBe('mana');
    const manaBefore = avatar.mystic?.current ?? 0;

    state.enemyIntents[avatar.id] = 'reliquary-ember-breath';
    forceTurn(state, avatar.id);
    const prepared = ritualEnemyAct(scriptedRng([10]), state, avatar.id);
    expect(prepared.kind).toBe('prepared');
    expect(guard.hp).toBe(100);
    expect(avatar.mystic?.current).toBe(manaBefore);

    forceTurn(state, avatar.id);
    const resolved = ritualEnemyAct(scriptedRng([20, 5]), state, avatar.id);
    expect(resolved.kind).toBe('resolved');
    expect(avatar.mystic?.current).toBe(manaBefore - 4);
    expect(guard.hp).toBeLessThan(100);
  });
});
