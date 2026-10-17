import { describe, expect, it } from 'vitest';
import { createBattle } from './battle';
import { attackAll, partyAt, simBattle } from './sim';

describe('sim: the attack-only player (全員攻擊)', () => {
  it('orders every living member to attack the first living enemy', () => {
    const s = createBattle({ party: partyAt(1), enemyIds: ['slime', 'bat'], boss: false, inventory: {}, revealed: {} });
    s.enemies[0].alive = false;
    const acts = attackAll(s);
    const alive = s.party.filter((c) => c.alive).map((c) => c.key);
    expect(Object.keys(acts).sort()).toEqual([...alive].sort());
    for (const a of Object.values(acts)) expect(a).toEqual({ kind: 'attack', target: s.enemies[1].key });
  });

  it('simBattle with the attack-only player fights differently from the skill player', () => {
    const a = simBattle(partyAt(1), ['wolf', 'bat'], false, 7919, undefined, undefined, 'attack');
    const b = simBattle(partyAt(1), ['wolf', 'bat'], false, 7919);
    expect([a.rounds, a.hpLoss]).not.toEqual([b.rounds, b.hpLoss]);
  });
});
