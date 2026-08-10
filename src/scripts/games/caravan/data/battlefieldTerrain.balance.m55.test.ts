import { describe, expect, it } from 'vitest';
import {
  legalEnemyTargetsForMove,
  startCombat,
  targetCoverForecast,
  type EnemyUnit,
  type Move,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import { projectileCoverProfile } from './battlefieldTerrain.m55';
import { createReliquaryEncounter } from './ashenReliquaryCombat';

const rng: Rng = {
  next: () => 0,
  roll: () => 10,
  d20: () => 10,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

const melee: Move = {
  id: 'm55-melee', name: '劍擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}攻擊{target}，造成 {amount} 點傷害！',
};
const reach: Move = {
  id: 'm55-reach', name: '長槍刺擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'pierce', engagement: 'reach',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}以長槍刺向{target}，造成 {amount} 點傷害！',
};
const ranged: Move = {
  id: 'm55-ranged', name: '長弓射擊', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', engagement: 'ranged',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' }, narration: '{actor}射向{target}，造成 {amount} 點傷害！',
};
const rangedArea: Move = {
  ...ranged, id: 'm55-volley', name: '箭雨', area: true,
};
const spell: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 6, bonusStat: 'int' }, narration: '{actor}以火球攻擊{target}，造成 {amount} 點傷害！',
};

function member(id: string, row: 'front' | 'back', moves: Move[]): PartyMember {
  return {
    id, name: id, formationRow: row,
    stats: { str: 14, dex: 14, int: 14, cha: 10, con: 14 }, maxHp: 30, hp: 30, defense: 12, moves,
  };
}

function simpleEnemy(id: string, row: 'front' | 'back'): EnemyUnit {
  return {
    id, name: id, formationRow: row,
    stats: { str: 12, dex: 12, int: 8, cha: 8, con: 12 }, maxHp: 20, hp: 20, defense: 12,
    moves: [melee], intents: [{ weight: 1, moveId: melee.id }],
  };
}

describe('M55 multidimensional player adversarial review', () => {
  it('keeps physical ranged attacks legal under cover instead of turning terrain into a hard ban', () => {
    const shooter = member('shooter', 'back', [ranged]);
    const state = startCombat(rng, [member('front', 'front', [melee]), shooter], createReliquaryEncounter(1));
    const targets = legalEnemyTargetsForMove(state, ranged);
    expect(targets.map((target) => target.id)).toContain('reliquary-cinder-squire');
    const squire = targets.find((target) => target.id === 'reliquary-cinder-squire')!;
    expect(targetCoverForecast(state, ranged, squire)).toMatchObject({ applies: true, hitModifier: -1 });
  });

  it('preserves a non-magical counter-route: melee and reach can break the screen that enables rear cover', () => {
    const state = startCombat(rng, [
      member('sword', 'front', [melee]),
      member('spear', 'back', [reach]),
    ], createReliquaryEncounter(1));
    const knightId = 'reliquary-ash-knight';
    const squireId = 'reliquary-cinder-squire';
    expect(legalEnemyTargetsForMove(state, melee).map((target) => target.id)).toEqual([knightId]);
    expect(legalEnemyTargetsForMove(state, reach).map((target) => target.id)).toEqual([knightId]);
    expect(legalEnemyTargetsForMove(state, ranged).map((target) => target.id)).toEqual([knightId, squireId]);
  });

  it('does not make spellcraft strictly stronger by adding a positive terrain bonus', () => {
    const state = startCombat(rng, [member('front', 'front', [melee]), member('mage', 'back', [spell])], createReliquaryEncounter(1));
    const squire = state.enemies.find((enemy) => enemy.id === 'reliquary-cinder-squire')!;
    const magic = targetCoverForecast(state, spell, squire);
    expect(magic.hitModifier).toBe(0);
    expect(magic.applies).toBe(false);
  });

  it('applies cover per target so an area volley cannot give frontline bodies fake cover', () => {
    const front = simpleEnemy('enemy-front', 'front');
    front.battlefieldTerrainId = 'ruined-battlements';
    const back = simpleEnemy('enemy-back', 'back');
    const state = startCombat(rng, [member('archer', 'back', [rangedArea])], [front, back]);
    expect(targetCoverForecast(state, rangedArea, front).hitModifier).toBe(0);
    expect(targetCoverForecast(state, rangedArea, back).hitModifier).toBe(-2);
  });

  it('keeps symmetric bridge cover at the same -1 for both armies', () => {
    const state = startCombat(rng, [member('front', 'front', [melee]), member('rear', 'back', [ranged])], createReliquaryEncounter(1));
    const enemyRear = state.enemies.find((enemy) => enemy.id === 'reliquary-cinder-squire')!;
    const partyRear = state.party.find((unit) => unit.id === 'rear')!;
    expect(targetCoverForecast(state, ranged, enemyRear).hitModifier).toBe(-1);
    expect(projectileCoverProfile(state.terrain, 'party', partyRear.formationRow, 'ranged', false, true).hitModifier).toBe(-1);
  });

  it('bounds every published cover grade at -2 or better so experimentation stays playable', () => {
    for (const side of ['party', 'enemy'] as const) {
      for (const terrainId of ['open-ground', 'broken-stone-bridge', 'ruined-battlements'] as const) {
        const terrain = terrainId === 'open-ground'
          ? { id: terrainId, name: 'open', description: '', partyRearCover: 'none' as const, enemyRearCover: 'none' as const }
          : terrainId === 'broken-stone-bridge'
            ? { id: terrainId, name: 'bridge', description: '', partyRearCover: 'partial' as const, enemyRearCover: 'partial' as const }
            : { id: terrainId, name: 'walls', description: '', partyRearCover: 'partial' as const, enemyRearCover: 'strong' as const };
        const modifier = projectileCoverProfile(terrain, side, 'back', 'ranged', false, true).hitModifier;
        expect(modifier).toBeGreaterThanOrEqual(-2);
        expect(modifier).toBeLessThanOrEqual(0);
      }
    }
  });

  it('does not randomly invent terrain for legacy encounters that authored none', () => {
    const state = startCombat(rng, [member('hero', 'front', [melee])], [simpleEnemy('legacy-enemy', 'front')]);
    expect(state.terrain).toBeUndefined();
    expect(targetCoverForecast(state, ranged, state.enemies[0])).toMatchObject({ applies: false, hitModifier: 0 });
  });

  it('keeps M55 entirely runtime-scoped instead of introducing persistent combat terrain on party members', () => {
    const hero = member('hero', 'front', [melee]);
    const state = startCombat(rng, [hero], [simpleEnemy('legacy-enemy', 'front')], 'broken-stone-bridge');
    expect(state.terrain?.id).toBe('broken-stone-bridge');
    // Existing combat runtime may legitimately decorate the member with mystic/formation helper fields.
    // M55 specifically must keep battlefield state on CombatState / encounter data, never on the party record.
    expect('terrain' in hero).toBe(false);
    expect('battlefieldTerrainId' in hero).toBe(false);
  });
});
