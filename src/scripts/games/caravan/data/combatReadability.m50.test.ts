import { describe, expect, it } from 'vitest';
import type { Move, PartyMember } from '../combat';
import { combatMoveForecast } from './combatReadability.m50';

const makeActor = (row: 'front' | 'back'): PartyMember => ({
  id: `preview-${row}`,
  name: `preview-${row}`,
  stats: { str: 14, dex: 14, int: 16, cha: 14, con: 12 },
  maxHp: 20,
  hp: 20,
  defense: 12,
  formationRow: row,
  moves: [],
});

const melee: Move = { id: 'preview-sword', name: '長劍斬擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash', damage: { dice: 1, sides: 8, bonusStat: 'str' }, narration: '' };
const ranged: Move = { id: 'preview-arrow', name: '長弓射擊', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', damage: { dice: 1, sides: 8, bonusStat: 'dex' }, narration: '' };
const magic: Move = { id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire', damage: { dice: 2, sides: 6, bonusStat: 'int' }, narration: '' };
const guard: Move = { id: 'guard', name: '防禦架勢', kind: 'guard', target: 'self', hitStat: 'str', narration: '' };

describe('M50 pre-action combat readability', () => {
  it('warns about wrong-row mundane attacks before execution', () => {
    const rearMelee = combatMoveForecast(makeActor('back'), melee);
    const frontRanged = combatMoveForecast(makeActor('front'), ranged);
    expect(rearMelee.penalized).toBe(true);
    expect(rearMelee.shortLabel).toContain('命中 -2');
    expect(rearMelee.hint).toContain('後排距離限制');
    expect(frontRanged.penalized).toBe(true);
    expect(frontRanged.shortLabel).toContain('命中 -2');
    expect(frontRanged.hint).toContain('前排近身壓力');
  });

  it('shows correct positioning and magic neutrality without inventing a positive bonus', () => {
    expect(combatMoveForecast(makeActor('front'), melee).shortLabel).toContain('站位適配');
    expect(combatMoveForecast(makeActor('back'), ranged).shortLabel).toContain('站位適配');
    for (const row of ['front', 'back'] as const) {
      const forecast = combatMoveForecast(makeActor(row), magic);
      expect(forecast.penalized).toBe(false);
      expect(forecast.shortLabel).toBe('魔法・站位自由');
    }
  });

  it('explains frontline interception versus rear-row self-protection', () => {
    const front = combatMoveForecast(makeActor('front'), guard);
    const back = combatMoveForecast(makeActor('back'), guard);
    expect(front.shortLabel).toBe('守勢・可護衛');
    expect(front.hint).toContain('替隊友攔截');
    expect(back.shortLabel).toBe('守勢・自保');
    expect(back.hint).toContain('只能保護自己');
  });
});
