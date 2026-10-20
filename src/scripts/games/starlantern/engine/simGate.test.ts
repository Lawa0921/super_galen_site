import { describe, expect, it } from 'vitest';
import { createBattle, resolveRound, type Action, type BattleScale, type Outcome } from './battle';
import { mulberry32 } from './rng';
import { partyAt, setSimTrace, simBattle, type SimTrace } from './sim';
import { fnv1a } from './simGate';

describe('sim gate', () => {
  it('fnv1a matches the published FNV-1a vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
    expect(fnv1a('b', fnv1a('a'))).toBe(fnv1a('ab'));
    // UTF-8 bytes, not UTF-16 code units: a CJK string chains the same as its pieces.
    expect(fnv1a('燈', fnv1a('星'))).toBe(fnv1a('星燈'));
    expect(fnv1a('星燈')).toBe(0x3f299dd6);
  });

  it('the sim trace sees every round, then the end, and changes nothing', () => {
    const scale: BattleScale = { depth: 2, region: 'mainline' };
    const enemies = ['slime', 'bat'];
    const seed = 7919;
    const plain = simBattle(partyAt(6), enemies, false, seed, scale);
    const rounds: Record<string, Action>[] = [];
    const ends: { outcome: Outcome; rounds: number; hpLoss: number }[] = [];
    const trace: SimTrace = { round: (a) => { rounds.push(JSON.parse(JSON.stringify(a))); }, end: (r) => { ends.push({ ...r }); } };
    let traced: ReturnType<typeof simBattle>;
    try {
      setSimTrace(trace);
      traced = simBattle(partyAt(6), enemies, false, seed, scale);
    } finally {
      setSimTrace(null);
    }
    expect(traced).toEqual(plain);
    expect(plain.rounds).toBeGreaterThan(0);
    expect(rounds).toHaveLength(traced.rounds);
    expect(ends).toEqual([traced]);
    // Replaying the traced actions reproduces the fight, and each round's keys are the members alive that round.
    const party = partyAt(6);
    const rng = mulberry32(seed);
    let s = createBattle({ party, enemyIds: enemies, boss: false, inventory: {}, revealed: {}, scale });
    for (const actions of rounds) {
      expect(Object.keys(actions).sort()).toEqual(s.party.filter((c) => c.alive).map((c) => c.key).sort());
      s = resolveRound(s, actions, rng);
    }
    expect(s.outcome).toBe(traced.outcome);
    // No trace installed afterwards: nothing is recorded.
    simBattle(partyAt(6), enemies, false, seed, scale);
    expect(rounds).toHaveLength(traced.rounds);
    expect(ends).toHaveLength(1);
  });
});
