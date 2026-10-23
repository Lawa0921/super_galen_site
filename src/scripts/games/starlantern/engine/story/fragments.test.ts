import { describe, it, expect } from 'vitest';
import { ABSORB_CAP, ABSORB_GAIN, PERKS, SHARD_PRICE, FRAGMENT_WEIGHT, SHARD_DROP, SHARD_IDS, TOWN_DROP, TOWN_FRAGMENTS, type TownFragmentId } from '../../data/story/fragments';
import { weightOf } from '../../data/weights';
import { newRun } from '../dungeon/run';
import { mulberry32 } from '../rng';
import { newGame } from '../state';
import { STORY } from '../../data/story.zh-TW';
import { meet, memoryStats } from '../party';
import type { ShardGrade } from '../../data/story/fragments';
import { fragmentItem, lootFragments, townFragmentEligible, shardPrice, sellShards, absorb, absorbRng, returnFragment, hasPerk } from './fragments';

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
    expect(fragmentItem({ kind: 'piece', id: 'rin', n: 1 })).toBeUndefined();
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe('the fragment exchange', () => {
  const held = (grade: ShardGrade, n: number) => {
    const s = newGame(mulberry32(1), 0);
    s.party = meet(s.party, 'bobby', 1);
    s.inventory[SHARD_IDS[grade]] = n;
    return s;
  };
  const grades = Object.keys(SHARD_PRICE) as ShardGrade[];

  it('selling shards pays their price and unlocks nothing', () => {
    for (const g of grades) {
      const s = held(g, 3);
      const sold = { ...s.sold };
      const r = sellShards(s, g, 2);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.state.gold).toBe(s.gold + SHARD_PRICE[g] * 2);
      expect(r.state.inventory[SHARD_IDS[g]]).toBe(1);
      expect(r.state.sold).toEqual(sold);
      expect(s.inventory[SHARD_IDS[g]]).toBe(3);   // the input is untouched
    }
  });

  it('anna returned lifts the price, rounded', () => {
    const s = held('dim', 2);
    expect(shardPrice(s, 'dim')).toBe(SHARD_PRICE.dim);
    const plain = sellShards(s, 'dim', 1);
    expect(plain.ok && plain.state.gold).toBe(s.gold + SHARD_PRICE.dim);
    s.story.returned.push('anna');
    const lifted = Math.round(SHARD_PRICE.dim * PERKS.shardPriceMul);
    expect(shardPrice(s, 'dim')).toBe(lifted);
    expect(lifted).toBeGreaterThan(SHARD_PRICE.dim);
    const r = sellShards(s, 'dim', 2);
    expect(r.ok && r.state.gold).toBe(s.gold + lifted * 2);
  });

  it('absorbing works for the hero and for Rin', () => {
    for (const who of ['hero', 'rin'] as const) {
      const s = held('clear', 1);
      s.party = meet(s.party, who, 1);
      const a = absorb(s, who, 'clear');
      expect(a.ok).toBe(true);
      if (!a.ok) continue;
      expect(a.gain.amount).toBe(ABSORB_GAIN.clear[a.gain.stat]);
      expect(a.state.party.roster[who].absorbed).toEqual([a.gain]);
      expect(a.state.inventory[SHARD_IDS.clear] ?? 0).toBe(0);
    }
  });

  it('selling refuses bad quantities and short stock, and sells nothing twice', () => {
    const s = held('clear', 2);
    const frozen = structuredClone(s);
    for (const q of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(sellShards(s, 'clear', q)).toEqual({ ok: false, reason: 'invalid' });
    expect(sellShards(s, 'nope' as ShardGrade, 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(sellShards(s, 'clear', 3)).toEqual({ ok: false, reason: 'stock' });
    expect(sellShards(s, 'dim', 1)).toEqual({ ok: false, reason: 'stock' });
    expect(s).toEqual(frozen);
    let cur = s;
    for (let i = 0; i < 5; i++) { const r = sellShards(cur, 'clear', 1); if (r.ok) cur = r.state; }
    expect(cur.gold).toBe(s.gold + SHARD_PRICE.clear * 2);
    expect(cur.inventory[SHARD_IDS.clear] ?? 0).toBe(0);
  });

  it("absorbing gives a seeded gain from the grade's table", () => {
    for (const g of grades) {
      const s = held(g, 2);
      const a = absorb(s, 'bobby', g);
      expect(a.ok).toBe(true);
      if (!a.ok) continue;
      expect(a.gain.amount).toBe(ABSORB_GAIN[g][a.gain.stat]);
      expect(STORY.absorb).toContain(a.line);
      expect(a.state.party.roster.bobby.absorbed).toEqual([a.gain]);
      expect(a.state.inventory[SHARD_IDS[g]]).toBe(1);
      expect(s.party.roster.bobby.absorbed ?? []).toEqual([]);   // the input is untouched
      const b = absorb(s, 'bobby', g);
      expect(b).toEqual(a);   // the same state rolls the same
      expect(memoryStats(a.state.party.roster.bobby)[a.gain.stat] ?? 0).toBeGreaterThanOrEqual(a.gain.amount);
    }
  });

  it('the draw follows the absorbed count, so a run of absorbs reaches several stats', () => {
    let s = held('dim', ABSORB_CAP);
    const stats = new Set<string>();
    expect(absorbRng(s)()).toBe(absorbRng(s)());
    for (let i = 0; i < ABSORB_CAP; i++) {
      const a = absorb(s, 'bobby', 'dim');
      expect(a.ok).toBe(true);
      if (!a.ok) return;
      stats.add(a.gain.stat);
      s = a.state;
    }
    expect(stats.size).toBeGreaterThan(1);
    expect(s.party.roster.bobby.absorbed).toHaveLength(ABSORB_CAP);
  });

  it('a member stops at ABSORB_CAP', () => {
    let s = held('dim', ABSORB_CAP + 3);
    s.party.roster.bobby.absorbed = Array.from({ length: ABSORB_CAP }, () => ({ stat: 'atk' as const, amount: ABSORB_GAIN.dim.atk }));
    const frozen = structuredClone(s);
    expect(absorb(s, 'bobby', 'dim')).toEqual({ ok: false, reason: 'cap' });
    expect(s).toEqual(frozen);
    s = held('dim', ABSORB_CAP + 3);
    for (let i = 0; i < ABSORB_CAP + 3; i++) { const a = absorb(s, 'bobby', 'dim'); if (a.ok) s = a.state; }
    expect(s.party.roster.bobby.absorbed).toHaveLength(ABSORB_CAP);
    expect(s.inventory[SHARD_IDS.dim]).toBe(3);   // the shards past the cap were not spent
  });

  it('absorbing needs the shard and a member who was met', () => {
    const s = held('dim', 1);
    const frozen = structuredClone(s);
    expect(absorb(s, 'sylvie', 'dim')).toEqual({ ok: false, reason: 'invalid' });
    expect(absorb(s, 'nobody' as never, 'dim')).toEqual({ ok: false, reason: 'invalid' });
    expect(absorb(s, 'bobby', 'nope' as ShardGrade)).toEqual({ ok: false, reason: 'invalid' });
    expect(absorb(s, 'bobby', 'vivid')).toEqual({ ok: false, reason: 'stock' });
    expect(s).toEqual(frozen);
  });

  it('no mix of selling and absorbing makes gold or stats from nothing', () => {
    let s = held('dim', 4);
    const total = () => (s.inventory[SHARD_IDS.dim] ?? 0) + (s.party.roster.bobby.absorbed?.length ?? 0);
    const gold0 = s.gold;
    let soldN = 0;
    for (let i = 0; i < 12; i++) {
      const r = i % 3 === 0 ? sellShards(s, 'dim', 1) : absorb(s, 'bobby', 'dim');
      if (r.ok) { if (i % 3 === 0) soldN++; s = r.state; }
      expect(total() + soldN).toBe(4);
    }
    expect(s.gold).toBe(gold0 + SHARD_PRICE.dim * soldN);
  });
});

describe('returning a townsfolk fragment', () => {
  const holding = (id: TownFragmentId) => {
    const s = newGame(mulberry32(1), 0);
    s.inventory[TOWN_FRAGMENTS.find((f) => f.id === id)!.item] = 1;
    return s;
  };

  it('returning a fragment pays its reward and records it', () => {
    for (const def of TOWN_FRAGMENTS) {
      const s = holding(def.id);
      const frozen = structuredClone(s);
      const r = returnFragment(s, def.id);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.state.gold).toBe(s.gold + (def.reward.gold ?? 0));
      for (const [item, n] of Object.entries(def.reward.items ?? {})) expect(r.state.inventory[item] ?? 0).toBe((s.inventory[item] ?? 0) + n);
      expect(r.state.story.returned).toContain(def.id);
      expect(r.state.inventory[def.item]).toBeUndefined();
      expect(hasPerk(r.state, def.perk)).toBe(true);
      expect(hasPerk(s, def.perk)).toBe(false);
      expect(s).toEqual(frozen);   // the input is untouched
    }
  });

  it('a returned fragment never drops again', () => {
    const { s, run } = fresh();
    s.inventory['tf-anna'] = 1;
    const r = returnFragment(s, 'anna');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(townFragmentEligible(r.state, run, 'anna', 'iron', 20)).toBe(false);
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      expect(lootFragments(r.state, run, { region: 'iron', depth: 20, source: 'boss' }, rng).some((g) => g.kind === 'town' && g.id === 'anna')).toBe(false);
    }
  });

  it('a fragment can be returned once, and only when held', () => {
    const s = holding('orik');
    expect(returnFragment(newGame(mulberry32(1), 0), 'orik')).toEqual({ ok: false, reason: 'stock' });
    expect(returnFragment(s, 'nobody' as TownFragmentId)).toEqual({ ok: false, reason: 'invalid' });
    const a = returnFragment(s, 'orik');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(returnFragment(a.state, 'orik')).toEqual({ ok: false, reason: 'invalid' });
    // a hostile state that holds the item although it was returned still pays nothing
    const dup = structuredClone(a.state);
    dup.inventory['tf-orik'] = 1;
    expect(returnFragment(dup, 'orik')).toEqual({ ok: false, reason: 'invalid' });
  });
});
