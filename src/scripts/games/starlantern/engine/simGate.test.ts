import { describe, expect, it } from 'vitest';
import { createBattle, resolveRound, type Action, type BattleScale, type BattleState, type Outcome } from './battle';
import { mulberry32 } from './rng';
import { partyAt, setSimTrace, simBattle, type SimTrace } from './sim';
import { fnv1a, roundHash } from './simGate';
import { makeBattle, makeCombatant } from './testing';

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
    const states: { before: string; after: string }[] = [];
    const ends: { outcome: Outcome; rounds: number; hpLoss: number }[] = [];
    const trace: SimTrace = {
      round: (a, before, after) => { rounds.push(JSON.parse(JSON.stringify(a))); states.push({ before: JSON.stringify(before), after: JSON.stringify(after) }); },
      end: (r) => { ends.push({ ...r }); },
    };
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
    let enemyActs = 0;
    rounds.forEach((actions, i) => {
      expect(Object.keys(actions).sort()).toEqual(s.party.filter((c) => c.alive).map((c) => c.key).sort());
      // The trace sees the state going in and the state coming out, enemies' moves (log, next intents) included.
      expect(states[i].before, `round ${i + 1} in`).toBe(JSON.stringify(s));
      s = resolveRound(s, actions, rng);
      expect(states[i].after, `round ${i + 1} out`).toBe(JSON.stringify(s));
      enemyActs += s.log.filter((e) => e.type === 'act' && e.actor.startsWith('e')).length;
    });
    expect(s.outcome).toBe(traced.outcome);
    expect(enemyActs).toBeGreaterThan(0);
    // No trace installed afterwards: nothing is recorded.
    simBattle(partyAt(6), enemies, false, seed, scale);
    expect(rounds).toHaveLength(traced.rounds);
    expect(ends).toHaveLength(1);
  });

  it('the round hash eats the party actions, the enemy intents going in and the round log', () => {
    const before = makeBattle([makeCombatant({ key: 'hero', side: 'party' })], [makeCombatant({ key: 'e0', side: 'enemy' })],
      { intents: { e0: { kind: 'attack', target: 'hero' } } });
    const after: BattleState = { ...before, log: [{ type: 'act', actor: 'e0', label: '攻擊' }, { type: 'damage', target: 'hero', amount: 9, element: 'phys', mult: 1 }] };
    const actions: Record<string, Action> = { hero: { kind: 'attack', target: 'e0' } };
    const h = roundHash(fnv1a(''), actions, before, after);
    expect(roundHash(fnv1a(''), actions, before, after)).toBe(h);
    // A different party action, enemy intent, enemy move or enemy target each moves the hash.
    expect(roundHash(fnv1a(''), { hero: { kind: 'defend' } }, before, after)).not.toBe(h);
    expect(roundHash(fnv1a(''), actions, { ...before, intents: { e0: { kind: 'enemy-skill', index: 0, target: 'hero' } } }, after)).not.toBe(h);
    expect(roundHash(fnv1a(''), actions, { ...before, intents: undefined }, after)).not.toBe(h);
    expect(roundHash(fnv1a(''), actions, before, { ...after, log: [{ type: 'act', actor: 'e0', label: '毒牙' }, after.log[1]] })).not.toBe(h);
    expect(roundHash(fnv1a(''), actions, before, { ...after, log: [after.log[0], { type: 'miss', target: 'hero' }] })).not.toBe(h);
  });
});
