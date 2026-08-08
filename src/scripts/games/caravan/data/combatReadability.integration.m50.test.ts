import { describe, expect, it } from 'vitest';
import { startCombat, type EnemyUnit, type Move, type PartyMember } from '../combat';
import type { Rng } from '../rng';

const rng: Rng = {
  next: () => 0,
  roll: () => 10,
  d20: () => 10,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

const enemy = (): EnemyUnit => ({
  id: 'dummy', name: '木樁',
  stats: { str: 10, dex: 10, int: 8, cha: 8, con: 10 },
  maxHp: 30, hp: 30, defense: 10,
  moves: [{ id: 'dummy-hit', name: '木棍', kind: 'attack', target: 'enemy', hitStat: 'str', damage: { dice: 1, sides: 4 }, narration: '' }],
  intents: [{ weight: 1, moveId: 'dummy-hit' }],
});

function member(id: string, row: 'front' | 'back', moves: Move[]): PartyMember {
  return {
    id, name: id,
    stats: { str: 14, dex: 16, int: 16, cha: 14, con: 12 },
    maxHp: 20, hp: 20, defense: 12,
    formationRow: row,
    moves,
  };
}

const sword: Move = { id: 'sword', name: '長劍斬擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash', damage: { dice: 1, sides: 8, bonusStat: 'str' }, narration: '' };
const bow: Move = { id: 'bow', name: '長弓射擊', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', damage: { dice: 1, sides: 8, bonusStat: 'dex' }, narration: '' };
const fireball: Move = { id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire', damage: { dice: 2, sides: 6, bonusStat: 'int' }, narration: '' };
const guard: Move = { id: 'guard', name: '架盾', kind: 'guard', target: 'self', hitStat: 'str', narration: '{actor}舉盾穩守。' };

describe('M50 live combat readability integration', () => {
  it('surfaces current row consequences directly in live move names', () => {
    const swordsman = member('swordsman', 'back', [sword, guard]);
    const archer = member('archer', 'front', [bow]);
    startCombat(rng, [swordsman, archer], [enemy()]);

    expect(swordsman.moves[0].name).toBe('長劍斬擊〔近戰 -2〕');
    expect(swordsman.moves[1].name).toBe('防禦架勢〔自保〕');
    expect(archer.moves[0].name).toBe('長弓射擊〔遠程 -2〕');
  });

  it('updates the same live label when battlefield row changes after combat starts', () => {
    const swordsman = member('swordsman', 'back', [sword]);
    startCombat(rng, [swordsman], [enemy()]);
    // all-rear start is immediately exposed by M49 frontline collapse
    expect(swordsman.formationRow).toBe('front');
    expect(swordsman.moves[0].name).toBe('長劍斬擊〔近戰〕');

    swordsman.formationRow = 'back';
    expect(swordsman.moves[0].name).toBe('長劍斬擊〔近戰 -2〕');
    swordsman.formationRow = 'front';
    expect(swordsman.moves[0].name).toBe('長劍斬擊〔近戰〕');
  });

  it('keeps real magic resource labels clean instead of stacking a mundane range suffix', () => {
    const mage = member('mage', 'front', [fireball]);
    startCombat(rng, [mage], [enemy()]);
    expect(mage.moves[0].name).toBe('炎術・火球〔秘法 2〕');
    mage.formationRow = 'back';
    expect(mage.moves[0].name).toBe('炎術・火球〔秘法 2〕');
  });

  it('changes party guard narration to equipment-neutral wording while preserving the guard id', () => {
    const defender = member('defender', 'front', [guard]);
    startCombat(rng, [defender], [enemy()]);
    expect(defender.moves[0].id).toBe('guard');
    expect(defender.moves[0].name).toBe('防禦架勢〔護衛〕');
    expect(defender.moves[0].narration).not.toContain('盾');
    expect(defender.moves[0].narration).toContain('武器與護具');
  });

  it('does not duplicate M50 suffixes if the same runtime member is initialized again', () => {
    const fighter = member('fighter', 'front', [sword]);
    startCombat(rng, [fighter], [enemy()]);
    expect(fighter.moves[0].name).toBe('長劍斬擊〔近戰〕');
    startCombat(rng, [fighter], [enemy()]);
    expect(fighter.moves[0].name).toBe('長劍斬擊〔近戰〕');
  });
});
