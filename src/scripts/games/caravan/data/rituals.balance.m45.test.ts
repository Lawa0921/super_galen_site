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
import { ritualEnemyAct, ritualChargeFor } from './rituals.m45';

function scriptedRng(values: number[] = [12, 6, 12, 6, 12, 6]): Rng {
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
  id: 'strike', name: '長劍斬', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 4, bonusStat: 'str' }, narration: '{actor}斬向{target}，造成 {amount} 點傷害！',
};
const guardMove: Move = {
  id: 'guard', name: '架盾', kind: 'guard', target: 'self', hitStat: 'str',
  narration: '{actor}壓低重心舉盾守住陣線。',
};
const stunBash: Move = {
  id: 'shield-bash', name: '盾牆猛擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'blunt',
  damage: { dice: 1, sides: 1 }, applyStatus: { kind: 'stun', duration: 1 },
  narration: '{actor}以盾牆撞向{target}，造成 {amount} 點傷害！',
};
const shot: Move = {
  id: 'quick-shot', name: '疾射', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce',
  damage: { dice: 1, sides: 4, bonusStat: 'dex' }, narration: '{actor}射向{target}，造成 {amount} 點傷害！',
};
const fireball: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 4, bonusStat: 'int' }, narration: '{actor}以火球轟向{target}，造成 {amount} 點傷害！',
};
const ritual: Move = {
  id: 'reliquary-silent-chorus', name: '無聲聖歌', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'frost', area: true,
  damage: { dice: 1, sides: 6, bonusStat: 'int' }, narration: '{actor}放出死寂聖歌掃過{target}，造成 {amount} 點傷害！',
};

function fighter(withControl = true): PartyMember {
  return {
    id: 'fighter', name: '前衛', stats: { str: 16, dex: 12, int: 8, cha: 8, con: 16 },
    maxHp: 40, hp: 40, defense: 12,
    moves: withControl ? [strike, guardMove, stunBash] : [strike, guardMove], formationRow: 'front',
  };
}
function mage(): PartyMember {
  return {
    id: 'mage', name: '法師', stats: { str: 8, dex: 13, int: 16, cha: 10, con: 10 },
    maxHp: 30, hp: 30, defense: 11, moves: [fireball], formationRow: 'back',
  };
}
function ranger(): PartyMember {
  return {
    id: 'ranger', name: '游俠', stats: { str: 10, dex: 16, int: 10, cha: 10, con: 12 },
    maxHp: 34, hp: 34, defense: 12, moves: [shot], formationRow: 'back',
  };
}
function cantor(): EnemyUnit {
  return {
    id: 'cantor', name: '儀式領唱者', stats: { str: 8, dex: 8, int: 16, cha: 12, con: 14 },
    maxHp: 70, hp: 70, defense: 10, moves: [ritual],
    weaknesses: ['blunt', 'fire'], maxPoise: 3,
    intents: [{ weight: 1, moveId: ritual.id }],
  };
}

function forceTurn(state: CombatState, id: string): void {
  state.turnIndex = state.order.indexOf(id);
}

interface Probe {
  bossHp: number;
  frontHp: number;
  mageHp: number;
  mana: number;
  interrupted: boolean;
}

type Policy = 'interrupt' | 'ward' | 'brace' | 'pressure';

function probe(policy: Policy): Probe {
  const front = fighter(true);
  const caster = mage();
  const boss = cantor();
  const state = startCombat(scriptedRng([20, 19, 1]), [front, caster], [boss]);
  caster.mystic!.current = 1; // simulate a real mid-expedition resource posture rather than a fresh duel

  state.enemyIntents[boss.id] = ritual.id;
  forceTurn(state, boss.id);
  ritualEnemyAct(scriptedRng([10]), state, boss.id);
  expect(ritualChargeFor(state, boss.id)).not.toBeNull();

  if (policy === 'interrupt') {
    forceTurn(state, front.id);
    partyAct(scriptedRng([20, 1]), state, front.id, stunBash.id, boss.id);
  } else if (policy === 'ward') {
    forceTurn(state, caster.id);
    partyAct(scriptedRng([10]), state, caster.id, 'arcane-focus', front.id);
  } else if (policy === 'brace') {
    forceTurn(state, front.id);
    partyAct(scriptedRng([10]), state, front.id, guardMove.id, front.id);
  } else {
    // Pressure remains available even when the mage is nearly dry: the martial front-liner can spend tempo on damage.
    forceTurn(state, front.id);
    partyAct(scriptedRng([20, 4]), state, front.id, strike.id, boss.id);
  }

  forceTurn(state, boss.id);
  const result = ritualEnemyAct(scriptedRng([12, 6, 12, 6]), state, boss.id);
  return {
    bossHp: boss.hp,
    frontHp: front.hp,
    mageHp: caster.hp,
    mana: caster.mystic?.current ?? 0,
    interrupted: result.kind === 'interrupted',
  };
}

describe('M45 player-perspective multidimensional ritual review', () => {
  it('gives interrupt, ward, brace and pressure genuinely different advantages', () => {
    const interrupt = probe('interrupt');
    const ward = probe('ward');
    const brace = probe('brace');
    const pressure = probe('pressure');
    console.log('[M45 RITUAL POLICIES]', { interrupt, ward, brace, pressure });

    expect(interrupt.interrupted).toBe(true);
    expect(interrupt.frontHp + interrupt.mageHp).toBeGreaterThan(pressure.frontHp + pressure.mageHp);

    expect(ward.mana).toBeGreaterThan(interrupt.mana);
    expect(ward.frontHp).toBeGreaterThan(pressure.frontHp);

    expect(brace.frontHp).toBeGreaterThan(pressure.frontHp);
    expect(brace.interrupted).toBe(false);

    expect(pressure.bossHp).toBeLessThan(interrupt.bossHp);
    expect(pressure.bossHp).toBeLessThan(ward.bossHp);
  });

  it('keeps a pure martial party alive without requiring a ritual interrupt tool', () => {
    const front = fighter(false);
    const back = ranger();
    const boss = cantor();
    const state = startCombat(scriptedRng([20, 19, 1]), [front, back], [boss]);

    state.enemyIntents[boss.id] = ritual.id;
    forceTurn(state, boss.id);
    ritualEnemyAct(scriptedRng([10]), state, boss.id);

    forceTurn(state, front.id);
    partyAct(scriptedRng([10]), state, front.id, guardMove.id, front.id);
    forceTurn(state, back.id);
    partyAct(scriptedRng([20, 4]), state, back.id, shot.id, boss.id);

    forceTurn(state, boss.id);
    const result = ritualEnemyAct(scriptedRng([12, 6, 12, 6]), state, boss.id);

    expect(result.kind).toBe('resolved');
    expect(front.hp).toBeGreaterThan(0);
    expect(back.hp).toBeGreaterThan(0);
    expect(boss.hp).toBeLessThan(boss.maxHp);
  });

  it('does not permanently silence a ritual caster after one successful interrupt', () => {
    const front = fighter(true);
    const boss = cantor();
    const state = startCombat(scriptedRng([20, 1]), [front], [boss]);

    state.enemyIntents[boss.id] = ritual.id;
    forceTurn(state, boss.id);
    ritualEnemyAct(scriptedRng([10]), state, boss.id);
    boss.statuses = [{ kind: 'stun', remaining: 1, potency: 0 }];
    forceTurn(state, boss.id);
    expect(ritualEnemyAct(scriptedRng([10]), state, boss.id).kind).toBe('interrupted');

    // The only weighted intent is still the ritual; after recovering, it may begin another cast.
    forceTurn(state, boss.id);
    const retry = ritualEnemyAct(scriptedRng([10]), state, boss.id);
    expect(retry.kind).toBe('prepared');
    expect(ritualChargeFor(state, boss.id)).not.toBeNull();
  });
});
