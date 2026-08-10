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

function scriptedRng(values: number[] = [20, 1]): Rng {
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
  damage: { dice: 1, sides: 1, bonusStat: 'str' }, narration: '{actor}揮擊{target}，造成 {amount} 點傷害！',
};
const shot: Move = {
  id: 'quick-shot', name: '疾射', kind: 'attack', target: 'enemy', hitStat: 'dex',
  damage: { dice: 1, sides: 1, bonusStat: 'dex' }, narration: '{actor}射擊{target}，造成 {amount} 點傷害！',
};
const fireball: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 1, bonusStat: 'int' }, narration: '{actor}以火球轟擊{target}，造成 {amount} 點傷害！',
};
const saltSpell: Move = {
  id: 'salt-shard-throw', name: '鹽刃投擲', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'frost',
  damage: { dice: 1, sides: 1, bonusStat: 'int' }, narration: '{actor}凝成寒鹽刃射向{target}，造成 {amount} 點傷害！',
};
const dagger: Move = {
  id: 'dagger', name: '短刀', kind: 'attack', target: 'enemy', hitStat: 'dex',
  damage: { dice: 1, sides: 1, bonusStat: 'dex' }, narration: '{actor}以短刀刺向{target}，造成 {amount} 點傷害！',
};

function fighter(): PartyMember {
  return {
    id: 'fighter', name: '前衛', stats: { str: 16, dex: 12, int: 8, cha: 8, con: 16 },
    maxHp: 50, hp: 50, defense: 10, moves: [strike], formationRow: 'front',
  };
}
function ranger(): PartyMember {
  return {
    id: 'ranger', name: '游俠', stats: { str: 10, dex: 16, int: 10, cha: 10, con: 12 },
    maxHp: 38, hp: 38, defense: 10, moves: [shot], formationRow: 'back',
  };
}
function mage(): PartyMember {
  return {
    id: 'mage', name: '法師', stats: { str: 8, dex: 14, int: 16, cha: 10, con: 10 },
    maxHp: 34, hp: 34, defense: 10, moves: [fireball], formationRow: 'back',
  };
}
function spellblade(mixed = false): EnemyUnit {
  const moves = mixed ? [saltSpell, dagger] : [saltSpell];
  return {
    id: 'spellblade', name: '寒鹽術士', stats: { str: 8, dex: 12, int: 12, cha: 8, con: 12 },
    maxHp: 70, hp: 70, defense: 8, moves,
    intents: mixed
      ? [{ weight: 2, moveId: 'salt-shard-throw' }, { weight: 1, moveId: 'dagger' }]
      : [{ weight: 1, moveId: 'salt-shard-throw' }],
  };
}

function forceTurn(state: ReturnType<typeof startCombat>, id: string): void {
  state.turnIndex = state.order.indexOf(id);
}

interface Probe {
  enemyHp: number;
  threatenedHp: number;
  mageMana: number;
  partyActions: number;
}

function twoCycleProbe(policy: 'pressure' | 'warded'): Probe {
  const front = fighter();
  const caster = mage();
  const foe = spellblade();
  const state = startCombat(scriptedRng([20, 19, 1]), [front, caster], [foe]);
  let partyActions = 0;

  // M54 lets hostile magic cross the line and pressure the actual low-HP rear target.
  // A rational ward plan protects that threatened caster instead of a frontliner the spell will not choose.
  forceTurn(state, caster.id);
  if (policy === 'pressure') partyAct(scriptedRng([20, 1]), state, caster.id, 'fireball', foe.id);
  else partyAct(scriptedRng([10]), state, caster.id, 'arcane-focus', caster.id);
  partyActions += 1;

  forceTurn(state, foe.id);
  state.enemyIntents[foe.id] = 'salt-shard-throw';
  enemyAct(scriptedRng([20, 1]), state, foe.id);

  forceTurn(state, front.id);
  partyAct(scriptedRng([20, 1]), state, front.id, 'strike', foe.id);
  partyActions += 1;

  // Cycle 2: both plans now attack; warded plan paid one earlier action for survival and mana posture.
  forceTurn(state, caster.id);
  partyAct(scriptedRng([20, 1]), state, caster.id, 'fireball', foe.id);
  partyActions += 1;

  forceTurn(state, foe.id);
  state.enemyIntents[foe.id] = 'salt-shard-throw';
  enemyAct(scriptedRng([20, 1]), state, foe.id);

  return {
    enemyHp: foe.hp,
    threatenedHp: caster.hp,
    mageMana: caster.mystic?.current ?? 0,
    partyActions,
  };
}

function dominates(a: Probe, b: Probe): boolean {
  const noWorse = a.enemyHp <= b.enemyHp
    && a.threatenedHp >= b.threatenedHp
    && a.mageMana >= b.mageMana
    && a.partyActions <= b.partyActions;
  const strictlyBetter = a.enemyHp < b.enemyHp
    || a.threatenedHp > b.threatenedHp
    || a.mageMana > b.mageMana
    || a.partyActions < b.partyActions;
  return noWorse && strictlyBetter;
}

describe('M44 player-perspective multidimensional adversarial review', () => {
  it('creates a real Pareto tradeoff between pressure and warded spellcraft', () => {
    const pressure = twoCycleProbe('pressure');
    const warded = twoCycleProbe('warded');
    console.log(`[M44 SPELLCRAFT] pressure=${JSON.stringify(pressure)} warded=${JSON.stringify(warded)}`);

    expect(pressure.enemyHp).toBeLessThan(warded.enemyHp); // 壓力流更快削血
    expect(warded.threatenedHp).toBeGreaterThan(pressure.threatenedHp); // 護法流保住實際被敵方法術越線鎖定的後排
    expect(warded.mageMana).toBeGreaterThan(pressure.mageMana); // 護持同時建立更健康的資源姿態
    expect(dominates(pressure, warded)).toBe(false);
    expect(dominates(warded, pressure)).toBe(false);
  });

  it('keeps a pure martial party functional because hostile magic has an exhaustion window', () => {
    const front = fighter();
    const back = ranger();
    const foe = spellblade();
    front.maxHp = front.hp = 80;
    const state = startCombat(scriptedRng([20, 19, 1]), [front, back], [foe]);

    for (let cycle = 0; cycle < 3; cycle++) {
      forceTurn(state, front.id);
      partyAct(scriptedRng([20, 1]), state, front.id, 'strike', foe.id);
      forceTurn(state, back.id);
      partyAct(scriptedRng([20, 1]), state, back.id, 'quick-shot', foe.id);
      forceTurn(state, foe.id);
      state.enemyIntents[foe.id] = 'salt-shard-throw';
      enemyAct(scriptedRng([20, 1]), state, foe.id);
    }

    expect(foe.mystic?.current).toBe(0);
    expect(state.enemyIntents[foe.id]).toBe('arcane-focus');
    expect(front.hp).toBeGreaterThan(0);
    expect(foe.hp).toBeLessThan(70);
    console.log(`[M44 SPELLCRAFT] martial-window frontHp=${front.hp} foeHp=${foe.hp} next=${state.enemyIntents[foe.id]}`);
  });

  it('does not reward ward spam against a purely physical threat', () => {
    const front = fighter();
    const caster = mage();
    const foe: EnemyUnit = {
      id: 'thug', name: '重裝打手', stats: { str: 14, dex: 10, int: 8, cha: 8, con: 14 },
      maxHp: 60, hp: 60, defense: 8, moves: [dagger], intents: [{ weight: 1, moveId: 'dagger' }],
    };
    const state = startCombat(scriptedRng([20, 19, 1]), [front, caster], [foe]);

    forceTurn(state, caster.id);
    partyAct(scriptedRng([10]), state, caster.id, 'arcane-focus', front.id);
    const before = front.hp;
    forceTurn(state, foe.id);
    enemyAct(scriptedRng([20, 1]), state, foe.id);

    expect(front.hp).toBeLessThan(before);
    expect(front.statuses?.some((status) => status.kind === 'ward')).toBe(true);
    console.log(`[M44 SPELLCRAFT] physical-threat ward-preserved=${front.statuses?.some((status) => status.kind === 'ward')} hp=${front.hp}`);
  });

  it('caps repeated protection at one pending magical hit so dual casters cannot bank an invulnerable shield', () => {
    const front = fighter();
    const mageA = mage();
    mageA.id = 'mage-a';
    mageA.name = '法師甲';
    const mageB = mage();
    mageB.id = 'mage-b';
    mageB.name = '法師乙';
    const foe = spellblade(true);
    const state = startCombat(scriptedRng([20, 19, 18, 1]), [front, mageA, mageB], [foe]);

    forceTurn(state, mageA.id);
    partyAct(scriptedRng([10]), state, mageA.id, 'arcane-focus', front.id);
    forceTurn(state, mageB.id);
    partyAct(scriptedRng([10]), state, mageB.id, 'arcane-focus', front.id);

    expect(front.statuses?.find((status) => status.kind === 'ward')).toMatchObject({ remaining: 1, potency: 4 });
  });
});
