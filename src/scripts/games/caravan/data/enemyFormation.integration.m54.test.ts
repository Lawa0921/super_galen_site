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

const melee: Move = {
  id: 'm54-live-sword', name: '長劍', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}斬向{target}，造成 {amount} 點傷害！',
};
const ranged: Move = {
  id: 'm54-live-arrow', name: '長弓箭', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' }, narration: '{actor}射向{target}，造成 {amount} 點傷害！',
};
const magic: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 6, bonusStat: 'int' }, narration: '{actor}灼燒{target}，造成 {amount} 點傷害！',
};
const guard: Move = { id: 'm54-live-guard', name: '守勢', kind: 'guard', target: 'self', hitStat: 'con', narration: '{actor}架起防禦。' };

const initRng: Rng = {
  next: () => 0,
  roll: () => 2,
  d20: () => 10,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

function actionRng(d20: number, roll = 2): Rng {
  return {
    next: () => 0,
    roll: () => roll,
    d20: () => d20,
    pick: (items) => items[0],
    weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
  };
}

function party(id: string, row: 'front' | 'back', hp = 30, moves: Move[] = [melee, guard]): PartyMember {
  return {
    id, name: id, formationRow: row,
    stats: { str: 14, dex: 14, int: 14, cha: 10, con: 12 },
    maxHp: 30, hp, defense: 12, moves: moves.map((move) => ({ ...move })),
  };
}

function enemy(id: string, row: 'front' | 'back' | undefined, moves: Move[], hp = 20): EnemyUnit {
  return {
    id, name: id, formationRow: row,
    stats: { str: 14, dex: 14, int: 14, cha: 10, con: 12 },
    maxHp: 20, hp, defense: 12,
    moves: moves.map((move) => ({ ...move })),
    intents: moves.filter((move) => move.kind !== 'guard' || moves.length === 1).map((move) => ({ weight: 1, moveId: move.id })),
  };
}

function currentHp(state: ReturnType<typeof startCombat>, id: string): number {
  return state.party.find((member) => member.id === id)!.hp;
}

describe('M54 live enemy formation parity', () => {
  it('initializes a mixed enemy screen and publishes it in the combat log', () => {
    const screen = enemy('screen', 'front', [melee]);
    const archer = enemy('archer', 'back', [ranged]);
    const state = startCombat(initRng, [party('hero', 'front')], [screen, archer]);
    expect(screen.formationRow).toBe('front');
    expect(archer.formationRow).toBe('back');
    expect(state.log.some((entry) => entry.text.includes('敵陣：前排 screen｜後排 archer'))).toBe(true);
  });

  it('rejects melee sniping of a protected enemy rear without spending the turn', () => {
    const hero = party('hero', 'front');
    const screen = enemy('screen', 'front', [melee]);
    const archer = enemy('archer', 'back', [ranged]);
    const state = startCombat(initRng, [hero], [screen, archer]);
    const beforeTurn = state.turnIndex;
    const result = partyAct(actionRng(20), state, hero.id, melee.id, archer.id);
    expect(result.acted).toBe(false);
    expect(result.reason).toContain('前線尚未突破');
    expect(state.turnIndex).toBe(beforeTurn);
    expect(archer.hp).toBe(archer.maxHp);
  });

  it('lets player ranged attacks and true magic bypass the enemy screen', () => {
    const ranger = party('ranger', 'back', 30, [ranged]);
    const mage = party('mage', 'back', 30, [magic]);
    const screen = enemy('screen', 'front', [melee]);
    const archer = enemy('archer', 'back', [ranged]);
    const rangedState = startCombat(initRng, [ranger], [screen, archer]);
    const rangedResult = partyAct(actionRng(20), rangedState, ranger.id, ranged.id, archer.id);
    expect(rangedResult.acted).toBe(true);
    expect(archer.hp).toBeLessThan(archer.maxHp);

    const screen2 = enemy('screen-2', 'front', [melee]);
    const caster = enemy('caster', 'back', [magic]);
    const magicState = startCombat(initRng, [mage], [screen2, caster]);
    const magicResult = partyAct(actionRng(20), magicState, mage.id, magic.id, caster.id);
    expect(magicResult.acted).toBe(true);
    expect(caster.hp).toBeLessThan(caster.maxHp);
  });

  it('forces enemy rear units forward when their screen falls, changing ranged hit math immediately', () => {
    const hero = party('hero', 'front');
    const screen = enemy('screen', 'front', [melee], 1);
    const archer = enemy('archer', 'back', [ranged]);
    const state = startCombat(initRng, [hero], [screen, archer]);
    partyAct(actionRng(20, 6), state, hero.id, melee.id, screen.id);
    expect(screen.hp).toBe(0);
    expect(archer.formationRow).toBe('front');
    expect(state.log.some((entry) => entry.text.includes('敵方前線崩潰'))).toBe(true);

    hero.hp = hero.maxHp;
    enemyAct(actionRng(11), state, archer.id);
    expect(hero.hp).toBe(hero.maxHp); // d20 11 + DEX mod 2 - front-ranged 2 = 11 < DEF 12

    const freshHero = party('fresh-hero', 'front');
    const freshScreen = enemy('fresh-screen', 'front', [melee]);
    const rearArcher = enemy('rear-archer', 'back', [ranged]);
    const rearState = startCombat(initRng, [freshHero], [freshScreen, rearArcher]);
    enemyAct(actionRng(11), rearState, rearArcher.id);
    expect(freshHero.hp).toBeLessThan(freshHero.maxHp); // same die from rear: 11 + 2 >= 12
  });

  it('lets enemy ranged attacks threaten a low-HP player rear while enemy melee remains pinned to the frontline', () => {
    const front = party('front', 'front', 30);
    const rear = party('rear', 'back', 5);
    const archer = enemy('archer', 'back', [ranged]);
    const screen = enemy('screen', 'front', [melee]);
    const rangedState = startCombat(initRng, [front, rear], [screen, archer]);
    const rearBefore = rear.hp;
    enemyAct(actionRng(20), rangedState, archer.id);
    expect(rear.hp).toBeLessThan(rearBefore);
    expect(front.hp).toBe(front.maxHp);

    const front2 = party('front-2', 'front', 30);
    const rear2 = party('rear-2', 'back', 5);
    const thug = enemy('thug', 'front', [melee]);
    const meleeState = startCombat(initRng, [front2, rear2], [thug]);
    enemyAct(actionRng(20), meleeState, thug.id);
    expect(front2.hp).toBeLessThan(front2.maxHp);
    expect(rear2.hp).toBe(5);
  });

  it('keeps frontline Guard as counterplay when an enemy archer tries to pick off the rear', () => {
    const front = party('front', 'front', 30);
    const rear = party('rear', 'back', 5);
    const screen = enemy('screen', 'front', [melee]);
    const archer = enemy('archer', 'back', [ranged]);
    const state = startCombat(initRng, [front, rear], [screen, archer]);
    state.guarding[front.id] = true;
    enemyAct(actionRng(20), state, archer.id);
    expect(rear.hp).toBe(5);
    expect(front.hp).toBeLessThan(front.maxHp);
    expect(state.log.some((entry) => entry.text.includes('替rear攔下攻擊'))).toBe(true);
  });

  it('keeps physical melee area attacks on the frontline instead of bypassing ranks', () => {
    const front = party('front', 'front', 30);
    const rear = party('rear', 'back', 30);
    const sweep: Move = { ...melee, id: 'enemy-sweep', name: '橫掃', area: true };
    const brute = enemy('brute', 'front', [sweep]);
    const state = startCombat(initRng, [front, rear], [brute]);
    enemyAct(actionRng(20), state, brute.id);
    expect(front.hp).toBeLessThan(front.maxHp);
    expect(rear.hp).toBe(rear.maxHp);
  });
});
