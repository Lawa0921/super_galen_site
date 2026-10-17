import { describe, it, expect } from 'vitest';
import { FRAGMENT_WEIGHT, SHARD_DROP, SHARD_IDS, TOWN_DROP, TOWN_FRAGMENTS, type TownFragmentId } from '../../data/story/fragments';
import { weightOf } from '../../data/weights';
import { newRun } from '../dungeon/run';
import { mulberry32 } from '../rng';
import { newGame } from '../state';
import { fragmentItem, lootFragments, townFragmentEligible } from './fragments';

const fresh = () => ({ s: newGame(mulberry32(1), 0), run: newRun(7, 'mainline', 'plain', 1) });
const ids: TownFragmentId[] = TOWN_FRAGMENTS.map((f) => f.id);

describe('townsfolk fragment eligibility', () => {
  it('a town fragment waits for its place and depth', () => {
    const { s, run } = fresh();
    expect(townFragmentEligible(s, run, 'orik', 'shade', 4)).toBe(true);
    expect(townFragmentEligible(s, run, 'orik', 'shade', 3)).toBe(false);
    expect(townFragmentEligible(s, run, 'orik', 'mainline', 4)).toBe(false);
    for (const region of ['mainline', 'shade', 'iron'] as const) expect(townFragmentEligible(s, run, 'anna', region, 8)).toBe(true);
    expect(townFragmentEligible(s, run, 'anna', 'shade', 7)).toBe(false);
  });

  it('a fragment held, carried or returned never drops again', () => {
    const { s, run } = fresh();
    expect(townFragmentEligible(s, run, 'anna', 'iron', 9)).toBe(true);
    s.story.returned.push('anna');
    expect(townFragmentEligible(s, run, 'anna', 'iron', 9)).toBe(false);
    s.story.returned = [];
    s.inventory['tf-anna'] = 1;
    expect(townFragmentEligible(s, run, 'anna', 'iron', 9)).toBe(false);
    delete s.inventory['tf-anna'];
    run.loot.items['tf-anna'] = 1;
    expect(townFragmentEligible(s, run, 'anna', 'iron', 9)).toBe(false);
    delete run.loot.items['tf-anna'];
    run.rolls['frag:1:2,3'] = { item: '', qty: 0, frags: ['shard-dim', 'tf-anna'] };
    expect(townFragmentEligible(s, run, 'anna', 'iron', 9)).toBe(false);
    expect(townFragmentEligible(s, run, 'doran', 'iron', 9)).toBe(true);
  });
});

describe('fragment loot', () => {
  const boss = (seed: number) => {
    const { s, run } = fresh();
    return lootFragments(s, run, { region: 'mainline', depth: 6, source: 'boss' }, mulberry32(seed));
  };

  it('a boss always leaves one ownerless shard', () => {
    for (let seed = 0; seed < 1000; seed++) {
      expect(boss(seed).filter((f) => f.kind === 'shard').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('the same seed loots the same fragments, from the seed alone', () => {
    const { s, run } = fresh();
    const frozen = structuredClone({ s, run });
    const first = lootFragments(s, run, { region: 'mainline', depth: 6, source: 'boss' }, mulberry32(9));
    expect({ s, run }).toEqual(frozen);   // it reads state and writes none
    expect(lootFragments(s, run, { region: 'mainline', depth: 6, source: 'boss' }, mulberry32(9))).toEqual(first);
    const grades = new Set(Array.from({ length: 200 }, (_, seed) => JSON.stringify(boss(seed))));
    expect(grades.size).toBeGreaterThan(1);   // and other seeds do loot differently
  });

  it('at most one town fragment, taken in table order, and only when eligible', () => {
    const { s, run } = fresh();
    const all = { ...TOWN_DROP };
    try {
      TOWN_DROP.boss = 1;
      const got = lootFragments(s, run, { region: 'shade', depth: 20, source: 'boss' }, mulberry32(3)).filter((f) => f.kind === 'town');
      const first = TOWN_FRAGMENTS.find((f) => f.regions === 'any' || f.regions.includes('shade'));
      expect(got).toEqual([{ kind: 'town', id: first!.id }]);
      const none = lootFragments(s, run, { region: 'shade', depth: 1, source: 'boss' }, mulberry32(3)).filter((f) => f.kind === 'town');
      expect(none).toEqual([]);
    } finally { Object.assign(TOWN_DROP, all); }
  });

  it('a chest pays a shard only on its chance', () => {
    const { s, run } = fresh();
    let hits = 0;
    for (let seed = 0; seed < 2000; seed++) {
      hits += lootFragments(s, run, { region: 'mainline', depth: 1, source: 'chest' }, mulberry32(seed)).filter((f) => f.kind === 'shard').length;
    }
    expect(hits / 2000).toBeGreaterThan(SHARD_DROP.chest * 0.5);
    expect(hits / 2000).toBeLessThan(SHARD_DROP.chest * 1.5);
  });

  it('fragments weigh FRAGMENT_WEIGHT, memory pieces weigh nothing', () => {
    expect(weightOf(SHARD_IDS.dim)).toBe(FRAGMENT_WEIGHT);
    expect(weightOf('tf-orik')).toBe(FRAGMENT_WEIGHT);
    expect(fragmentItem({ kind: 'town', id: 'orik' })).toBe('tf-orik');
    expect(fragmentItem({ kind: 'shard', grade: 'vivid' })).toBe(SHARD_IDS.vivid);
    expect(fragmentItem({ kind: 'piece', id: 'rin', n: 1, play: false })).toBeUndefined();
    expect(ids.length).toBeGreaterThan(0);
  });
});
