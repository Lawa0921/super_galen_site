import { describe, expect, it } from 'vitest';
import type { Move, PartyMember } from '../combat';
import { combatMoveDisplayName, combatMoveForecast } from './combatReadability.m50';

function member(row: 'front' | 'back'): PartyMember {
  return {
    id: `review-${row}`, name: `review-${row}`,
    stats: { str: 14, dex: 16, int: 16, cha: 16, con: 12 },
    maxHp: 20, hp: 20, defense: 12, formationRow: row, moves: [],
  };
}

const samples: Array<{ move: Move; mystical: boolean }> = [
  { mystical: false, move: { id: 'sword', name: '重斬', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash', damage: { dice: 1, sides: 10, bonusStat: 'str' }, narration: '' } },
  { mystical: false, move: { id: 'arrow', name: '疾射', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', damage: { dice: 1, sides: 8, bonusStat: 'dex' }, narration: '' } },
  { mystical: true, move: { id: 'fireball', name: '炎術・火球〔秘法 2〕', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire', damage: { dice: 2, sides: 6, bonusStat: 'int' }, narration: '' } },
  { mystical: true, move: { id: 'holy-strike', name: '神術・聖擊〔神恩 +1〕', kind: 'attack', target: 'enemy', hitStat: 'cha', element: 'holy', damage: { dice: 1, sides: 6, bonusStat: 'cha' }, narration: '' } },
];

describe('M50 multidimensional player readability review', () => {
  it('never hides a real mundane row penalty from the pre-action label', () => {
    for (const row of ['front', 'back'] as const) {
      const actor = member(row);
      for (const { move, mystical } of samples.filter((sample) => !sample.mystical)) {
        const forecast = combatMoveForecast(actor, move, mystical);
        const label = combatMoveDisplayName(actor, move, mystical);
        if (forecast.penalized) expect(label).toContain('-2');
        else expect(label).not.toContain('-2');
      }
    }
  });

  it('does not turn correct positioning into an extra hidden positive modifier', () => {
    const frontSword = combatMoveForecast(member('front'), samples[0].move, false);
    const backBow = combatMoveForecast(member('back'), samples[1].move, false);
    expect(frontSword.penalized).toBe(false);
    expect(backBow.penalized).toBe(false);
    expect(frontSword.hint).toContain('不會受到額外命中懲罰');
    expect(backBow.hint).toContain('不會受到額外命中懲罰');
    expect(combatMoveDisplayName(member('front'), samples[0].move, false)).toBe('重斬〔近戰〕');
    expect(combatMoveDisplayName(member('back'), samples[1].move, false)).toBe('疾射〔遠程〕');
  });

  it('preserves spell school/resource readability in both rows', () => {
    for (const row of ['front', 'back'] as const) {
      const actor = member(row);
      for (const { move } of samples.filter((sample) => sample.mystical)) {
        const label = combatMoveDisplayName(actor, move, true);
        expect(label).toBe(move.name);
        expect(label).not.toMatch(/近戰|遠程|-2/);
      }
    }
  });

  it('keeps added button text compact enough for the existing dense combat action grids', () => {
    const cases = [
      combatMoveDisplayName(member('front'), samples[0].move, false),
      combatMoveDisplayName(member('back'), samples[0].move, false),
      combatMoveDisplayName(member('back'), samples[1].move, false),
      combatMoveDisplayName(member('front'), samples[1].move, false),
    ];
    for (const label of cases) expect(label.length).toBeLessThanOrEqual(12);
  });

  it('makes guard meaning explicit before action without requiring a shield item that does not exist in the equipment schema', () => {
    const guard: Move = { id: 'guard', name: '架盾', kind: 'guard', target: 'self', hitStat: 'str', narration: '' };
    expect(combatMoveDisplayName(member('front'), guard)).toBe('防禦架勢〔護衛〕');
    expect(combatMoveDisplayName(member('back'), guard)).toBe('防禦架勢〔自保〕');
    expect(combatMoveForecast(member('front'), guard).hint).toContain('防禦 +4');
    expect(combatMoveForecast(member('back'), guard).hint).toContain('防禦 +4');
  });
});
