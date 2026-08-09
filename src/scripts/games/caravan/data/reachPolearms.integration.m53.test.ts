import { describe, expect, it } from 'vitest';
import {
  enemyAct,
  partyAct,
  startCombat,
  type EnemyUnit,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import type { CompanionRecord } from '../save';
import { memberFromRecord } from './jobs';

function rng(d20 = 10, roll = 2): Rng {
  return {
    next: () => 0,
    roll: () => roll,
    d20: () => d20,
    pick: (items) => items[0],
    weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
  };
}

function spearRecord(id: string): CompanionRecord {
  return {
    id,
    name: '槍兵',
    job: 'swordsman',
    level: 5,
    xp: 750,
    stats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 },
    maxHp: 26,
    injuredForTrips: 0,
    equipment: { weapon: 'ashwood-war-spear', armor: null, trinket: null },
  };
}

function anchor(id = 'anchor', hp = 20): PartyMember {
  return {
    id,
    name: '前排同伴',
    stats: { str: 10, dex: 10, int: 8, cha: 8, con: 10 },
    maxHp: 20,
    hp,
    defense: 10,
    formationRow: 'front',
    moves: [{ id: `${id}-hit`, name: '短劍', kind: 'attack', target: 'enemy', hitStat: 'str', narration: '' }],
  };
}

function enemy(id = 'foe', defense = 12): EnemyUnit {
  return {
    id,
    name: '敵兵',
    stats: { str: 10, dex: 10, int: 8, cha: 8, con: 10 },
    maxHp: 30,
    hp: 30,
    defense,
    moves: [{
      id: 'foe-hit', name: '砍擊', kind: 'attack', target: 'enemy', hitStat: 'str',
      damage: { dice: 1, sides: 4 }, narration: '{actor}砍向{target}，造成 {amount} 點傷害！',
    }],
    intents: [{ weight: 1, moveId: 'foe-hit' }],
  };
}

function spearMove(member: PartyMember) {
  const move = member.moves.find((candidate) => candidate.id === 'second-rank-thrust');
  if (!move) throw new Error('missing M53 spear move');
  return move;
}

describe('M53 live reach integration', () => {
  it('turns the same borderline roll into a rear-rank hit and a frontline miss', () => {
    const rearSpear = memberFromRecord(spearRecord('rear-spear'));
    rearSpear.formationRow = 'back';
    const rearEnemy = enemy('rear-foe');
    const rearState = startCombat(rng(), [anchor('rear-anchor'), rearSpear], [rearEnemy]);
    const rearMove = spearMove(rearSpear);
    expect(rearMove.name).toBe('越肩突刺〔長柄〕');
    partyAct(rng(9, 3), rearState, rearSpear.id, rearMove.id, rearEnemy.id);
    expect(rearEnemy.hp).toBeLessThan(rearEnemy.maxHp);

    const frontSpear = memberFromRecord(spearRecord('front-spear'));
    frontSpear.formationRow = 'front';
    const frontEnemy = enemy('front-foe');
    const frontState = startCombat(rng(), [frontSpear], [frontEnemy]);
    const frontMove = spearMove(frontSpear);
    expect(frontMove.name).toBe('越肩突刺〔長柄 -1〕');
    partyAct(rng(9, 3), frontState, frontSpear.id, frontMove.id, frontEnemy.id);
    expect(frontEnemy.hp).toBe(frontEnemy.maxHp);
    expect(frontState.log.some((entry) => entry.text.includes('長柄近身壓力') && entry.text.includes('命中 -1'))).toBe(true);
  });

  it('updates both real row and live label when the protecting frontline collapses', () => {
    const spear = memberFromRecord(spearRecord('collapse-spear'));
    spear.formationRow = 'back';
    const fragile = anchor('fragile', 1);
    const foe = enemy();
    const state = startCombat(rng(), [fragile, spear], [foe]);
    expect(spearMove(spear).name).toBe('越肩突刺〔長柄〕');

    state.turnIndex = state.order.indexOf(foe.id);
    enemyAct(rng(20, 3), state, foe.id);

    expect(fragile.hp).toBe(0);
    expect(spear.formationRow).toBe('front');
    expect(spearMove(spear).name).toBe('越肩突刺〔長柄 -1〕');
    expect(state.log.some((entry) => entry.text.includes('前線崩潰'))).toBe(true);
  });

  it('normalizes an impossible all-rear opening, so reach never creates a phantom safe rank', () => {
    const spear = memberFromRecord(spearRecord('solo-spear'));
    spear.formationRow = 'back';
    const otherRear = anchor('other-rear');
    otherRear.formationRow = 'back';
    const state = startCombat(rng(), [spear, otherRear], [enemy()]);

    expect(state.party.every((member) => member.formationRow === 'front')).toBe(true);
    expect(spearMove(spear).name).toBe('越肩突刺〔長柄 -1〕');
  });

  it('keeps reach labels idempotent across repeated combat initialization', () => {
    const spear = memberFromRecord(spearRecord('repeat-spear'));
    spear.formationRow = 'back';
    startCombat(rng(), [anchor('first-anchor'), spear], [enemy('first-foe')]);
    const once = spearMove(spear).name;
    startCombat(rng(), [anchor('second-anchor'), spear], [enemy('second-foe')]);
    const twice = spearMove(spear).name;
    expect(twice).toBe(once);
    expect((twice.match(/長柄/g) ?? []).length).toBe(1);
  });
});
