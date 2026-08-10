import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  currentActor,
  partyAct,
  startCombat,
  type EnemyUnit,
  type Move,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import { tacticalTargetChoices, tacticalUnitSummary } from './tacticalReadability.m56';

const fixedRng: Rng = {
  next: () => 0,
  roll: () => 4,
  d20: () => 12,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

const melee: Move = {
  id: 'm56-live-melee', name: '劍擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}斬中{target}，造成 {amount} 點傷害！',
};
const ranged: Move = {
  id: 'm56-live-ranged', name: '長弓', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', engagement: 'ranged',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' }, narration: '{actor}射中{target}，造成 {amount} 點傷害！',
};

function hero(): PartyMember {
  return {
    id: 'hero', name: 'hero', formationRow: 'front',
    stats: { str: 16, dex: 16, int: 10, cha: 10, con: 14 }, maxHp: 30, hp: 30, defense: 12,
    moves: [melee, ranged],
  };
}

function foe(id: string, row: 'front' | 'back', hp = 20): EnemyUnit {
  return {
    id, name: id, formationRow: row,
    stats: { str: 12, dex: 12, int: 8, cha: 8, con: 12 }, maxHp: hp, hp, defense: 12,
    moves: [melee], intents: [{ weight: 1, moveId: melee.id }],
  };
}

function dedicatedPage(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('M56 live tactical readability integration', () => {
  it('blocked melee rear click is informational and does not advance the live combat turn', () => {
    const actor = hero();
    const state = startCombat(fixedRng, [actor], [foe('screen', 'front'), foe('rear', 'back')]);
    expect(currentActor(state)).toEqual({ side: 'party', id: actor.id });
    const beforeTurn = state.turnIndex;
    const rearChoice = tacticalTargetChoices(state, actor, melee).find((choice) => choice.id === 'rear')!;
    expect(rearChoice.allowed).toBe(false);

    const result = partyAct(fixedRng, state, actor.id, melee.id, 'rear');
    expect(result.acted).toBe(false);
    expect(state.turnIndex).toBe(beforeTurn);
    expect(currentActor(state)).toEqual({ side: 'party', id: actor.id });
    expect(state.log.at(-1)?.text).toBe(rearChoice.reason);
  });

  it('the same protected rear target is legal for ranged and the UI forecast matches real terrain math', () => {
    const actor = hero();
    const state = startCombat(fixedRng, [actor], [foe('screen', 'front'), foe('rear', 'back')], 'broken-stone-bridge');
    const rear = tacticalTargetChoices(state, actor, ranged).find((choice) => choice.id === 'rear')!;
    expect(rear).toMatchObject({ allowed: true, coverHitModifier: -1 });
    const result = partyAct(fixedRng, state, actor.id, ranged.id, 'rear');
    expect(result.acted).toBe(true);
    expect(state.log.some((entry) => entry.text.includes('斷裂石橋') && entry.text.includes('命中 -1'))).toBe(true);
  });

  it('frontline collapse immediately changes both the card summary and melee target availability', () => {
    const actor = hero();
    const front = foe('screen', 'front', 1);
    const rear = foe('rear', 'back');
    const state = startCombat(fixedRng, [actor], [front, rear], 'broken-stone-bridge');
    expect(tacticalUnitSummary(state, 'enemy', rear)).toContain('受前線保護');
    expect(tacticalTargetChoices(state, actor, melee).find((choice) => choice.id === rear.id)?.allowed).toBe(false);

    partyAct(fixedRng, state, actor.id, melee.id, front.id);
    expect(front.hp).toBe(0);
    expect(rear.formationRow).toBe('front');
    expect(tacticalUnitSummary(state, 'enemy', rear)).toBe('前排｜正面接戰');
    expect(tacticalTargetChoices(state, actor, melee).find((choice) => choice.id === rear.id)?.allowed).toBe(true);
  });

  it('all three dedicated high-level battle pages use the shared M56 target source instead of hp-only target helpers', () => {
    const pages = [
      'src/pages/caravan/ashen-reliquary-battle.astro',
      'src/pages/caravan/endurance.astro',
      'src/pages/caravan/convoy-defense.astro',
    ];
    for (const path of pages) {
      const source = dedicatedPage(path);
      expect(source, `${path} should import tacticalTargetChoices`).toContain('tacticalTargetChoices');
      expect(source, `${path} should display tacticalUnitSummary`).toContain('tacticalUnitSummary');
      expect(source, `${path} should not keep the legacy hp-only targetsFor helper`).not.toContain('function targetsFor(move: Move)');
    }
  });

  it('endurance page honors acted:false before allowing enemy turns', () => {
    const source = dedicatedPage('src/pages/caravan/endurance.astro');
    expect(source).toContain('const result = partyAct(rng, combat, actorId, moveId, targetId, { overcast });');
    expect(source).toContain('if (result.acted) runEnemyTurns();');
    const actBlock = source.slice(source.indexOf('function act(actorId'), source.indexOf('function retreat()', source.indexOf('function act(actorId')));
    expect(actBlock.indexOf('const result = partyAct')).toBeLessThan(actBlock.indexOf('if (result.acted) runEnemyTurns();'));
  });

  it('convoy special actions keep their own objective/morale legality instead of being routed through weapon targeting', () => {
    const source = dedicatedPage('src/pages/caravan/convoy-defense.astro');
    expect(source).toContain('braceConvoy(rng, battle, actor.id)');
    expect(source).toContain('commandAvailability(battle, actor, enemy)');
    expect(source).toContain('commandMorale(rng, battle, actor.id, enemy.id)');
    expect(source).toContain('tacticalTargetChoices(battle.combat, actor, move)');
  });
});
