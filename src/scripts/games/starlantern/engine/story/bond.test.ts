import { describe, it, expect } from 'vitest';
import { newMember } from '../party';
import { chainLength } from '../../data/story/chains';
import { COMPANIONS, GIFTABLE, GIFT_TASTE, type Companion } from '../../data/story/bond';
import type { BondRecord, Member } from '../types';
import { BOND_SWITCH, addField, bondOpen, nextBond, romanceCandidates, talkPoints, bondOf, bondPoints, bondTier, giftLine, giftMood, giftPools, giftPoints, giveGift, inDanger, knownTaste, tasteOf, tierAt, today } from './bond';
import { withTold } from '../testing';
import type { GiftPools } from '../../data/bond.zh-TW';
import { meet } from '../party';
import { mulberry32 } from '../rng';
import { memScene } from '../../data/story/scenes';
import type { GameState } from '../state';
import { BOND_CAP, BOND_RUN_CAP } from '../../data/story/bond';
import { newRun } from '../dungeon/run';
import { newGame } from '../state';

/** A member of `id` with `memories` pieces held and `bond` as her record. */
const who = (id: Member['id'], memories = 0, bond?: BondRecord): Member => ({ ...newMember(id), memories, ...(bond ? { bond } : {}) });
/** A record with only gifts. */
const gifts = (g: BondRecord['gifts']): BondRecord => ({ talk: 0, field: 0, gifts: g });
/** Gifts worth exactly the gift cap of 30: her first loved material, 24 times (4 × 2 + 22 × 1). */
const fullGifts = (c: Companion): BondRecord['gifts'] => ({ [GIFT_TASTE[c].loved[0]]: 24 });

describe('bond score', () => {
  it('bondTier thresholds', () => {
    const want: [number, number][] = [[0, 0], [19, 0], [20, 1], [39, 1], [40, 2], [59, 2], [60, 3], [84, 3], [85, 4], [100, 4]];
    for (const [points, tier] of want) expect(tierAt(points)).toBe(tier);
  });

  it('the hero has no bond', () => {
    expect(bondPoints(newMember('hero'))).toBe(0);
    expect(bondTier(newMember('hero'))).toBe(0);
    // Even a record forced onto him counts for nothing (the save refuses it, bond plan Task 2).
    const forced = who('hero', 5, { talk: 12, field: 40, gifts: { moss: 9 } });
    expect(bondPoints(forced)).toBe(0);
    expect(giftPoints(forced)).toBe(0);
  });

  it('Rin starts at ten', () => {
    expect(bondPoints(newMember('rin'))).toBe(10);
    expect(bondOf(newMember('rin'))).toEqual({ talk: 0, field: 0, gifts: {} });
    expect(bondPoints(who('rin', 3))).toBe(19);
    expect(bondTier(who('rin', 3))).toBe(0);
  });

  it('bondPoints follows the formula', () => {
    // 10 + 3 × 3 + 7 + (dusk-cloth loved ×3 = 4 + 4 + 1, star-tear liked ×1 = 2) + 13 = 50.
    const rin = who('rin', 3, { talk: 7, field: 13, gifts: { 'dusk-cloth': 3, 'star-tear': 1 } });
    expect(giftPoints(rin)).toBe(11);
    expect(bondPoints(rin)).toBe(50);
    expect(bondTier(rin)).toBe(2);
    // Each field is cut at its own cap.
    expect(bondPoints(who('rin', 0, { talk: 20, field: 0, gifts: {} }))).toBe(10 + 12);
    expect(bondPoints(who('rin', 0, { talk: 0, field: 99, gifts: {} }))).toBe(10 + 40);
    const many = who('selene', 0, gifts({ 'star-tear': 40 }));
    expect(giftPoints(many)).toBe(4 + 4 + 38);
    expect(bondPoints(many)).toBe(10 + 30);
    // Held pieces past her chain count as her chain.
    expect(bondPoints(who('selene', 99))).toBe(10 + 3 * chainLength('selene'));
    // The sum is cut at 100.
    expect(bondPoints(who('rin', 7, { talk: 12, field: 40, gifts: fullGifts('rin') }))).toBe(100);
  });

  it('bond caps keep every single source and every pair below 心契', () => {
    for (const c of ['rin', 'selene'] as const) {
      const sources: Record<'memory' | 'talk' | 'gift' | 'field', { memories: number; bond: BondRecord }> = {
        memory: { memories: chainLength(c), bond: { talk: 0, field: 0, gifts: {} } },
        talk: { memories: 0, bond: { talk: 12, field: 0, gifts: {} } },
        gift: { memories: 0, bond: gifts(fullGifts(c)) },
        field: { memories: 0, bond: { talk: 0, field: 40, gifts: {} } },
      };
      const keys = Object.keys(sources) as (keyof typeof sources)[];
      const merge = (ks: (keyof typeof sources)[]): Member => who(c, Math.max(0, ...ks.map((k) => sources[k].memories)), {
        talk: Math.max(0, ...ks.map((k) => sources[k].bond.talk)),
        field: Math.max(0, ...ks.map((k) => sources[k].bond.field)),
        gifts: Object.assign({}, ...ks.map((k) => sources[k].bond.gifts)),
      });
      for (const k of keys) expect(bondTier(merge([k])), `${c}: ${k} alone`).toBeLessThanOrEqual(2);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        expect(bondPoints(merge([keys[i], keys[j]])), `${c}: ${keys[i]} + ${keys[j]}`).toBeLessThan(85);
      }
      expect(bondPoints(merge(keys))).toBe(100);
      expect(bondTier(merge(keys))).toBe(4);
    }
  });

  it('gift repeats fall to one', () => {
    for (const [n, points] of [[1, 4], [2, 8], [3, 9], [4, 10]] as const) expect(giftPoints(who('rin', 0, gifts({ 'dusk-cloth': n })))).toBe(points);
    expect(giftPoints(who('rin', 0, gifts({ moss: 3 })))).toBe(3);
    expect(giftPoints(who('rin', 0, gifts({ 'star-tear': 3 })))).toBe(2 + 2 + 1);
    // A healed taste is the one the record reads: Selene's old coins are liked.
    expect(giftPoints(who('selene', 5, gifts({ 'old-coin': 2 })))).toBe(4);
  });

  it('a gift already taken never changes value', () => {
    for (const c of COMPANIONS) for (const mat of GIFTABLE) {
      const before = tasteOf(c, mat, false);
      if (before === 'declined') continue;
      expect(tasteOf(c, mat, true), `${c} ${mat}`).toBe(before);
    }
  });

  it('field points: the run cap, the lifetime cap, never the hero, nothing while switched off', () => {
    const g = newGame(undefined, 0, ['hero', 'rin', 'selene']);
    const run = newRun(1, 'mainline', 'plain', 1);
    let p = g.party;
    const gained: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = addField(p, run, ['hero', 'rin'], 2);
      p = r.party;
      gained.push(r.gained.rin ?? 0);
      for (const [id, n] of Object.entries(r.gained)) run.bond[id as Companion] = (run.bond[id as Companion] ?? 0) + n!;
    }
    expect(BOND_RUN_CAP).toBe(5);
    expect(gained).toEqual([2, 2, 1, 0]);   // four +2 on one dive stop at the cap
    expect(p.roster.rin.bond!.field).toBe(BOND_RUN_CAP);
    expect(p.roster.hero.bond).toBeUndefined();
    expect(g.party.roster.rin.bond).toBeUndefined();   // the party given is not changed
    expect(run.bond).toEqual({ rin: BOND_RUN_CAP });
    // the lifetime cap: at 39, +2 gives 1
    const near = { ...p, roster: { ...p.roster, selene: { ...p.roster.selene, bond: { talk: 0, field: BOND_CAP.field - 1, gifts: {} } } } };
    const r = addField(near, newRun(2, 'mainline', 'plain', 1), ['selene'], 2);
    expect(r.gained).toEqual({ selene: 1 });
    expect(r.party.roster.selene.bond!.field).toBe(BOND_CAP.field);
    expect(addField(r.party, newRun(3, 'mainline', 'plain', 1), ['selene'], 2).gained).toEqual({});
    // switched off, nothing at all
    BOND_SWITCH.earn = false;
    try {
      const off = addField(g.party, newRun(4, 'mainline', 'plain', 1), ['rin'], 2);
      expect(off.party).toBe(g.party);
      expect(off.gained).toEqual({});
    } finally {
      BOND_SWITCH.earn = true;
    }
  });

  it('inDanger: down, or at 30 % of her max HP or less', () => {
    expect(inDanger({ hp: 30, max: { hp: 100 } })).toBe(true);
    expect(inDanger({ hp: 31, max: { hp: 100 } })).toBe(false);
    expect(inDanger({ hp: 0, max: { hp: 100 } })).toBe(true);
    expect(inDanger({ hp: 3, max: { hp: 10 } })).toBe(true);
    expect(inDanger({ hp: 4, max: { hp: 10 } })).toBe(false);
  });

  it('today reads only today', () => {
    const g = newGame();
    expect(today(g)).toEqual({ gifted: [], talked: false });   // no fields
    g.story.day = 6;
    g.story.bondDay = 6;
    g.story.gifted = ['rin'];
    g.story.talked = true;
    expect(today(g)).toEqual({ gifted: ['rin'], talked: true });
    g.story.bondDay = 5;   // yesterday's
    expect(today(g)).toEqual({ gifted: [], talked: false });
    const fresh = newGame();
    fresh.story.bondDay = 1;   // a new game reads as day 1
    fresh.story.talked = true;
    expect(today(fresh)).toEqual({ gifted: [], talked: true });
  });

  it('tasteOf reads the table and the healing', () => {
    expect(tasteOf('rin', 'dusk-cloth', false)).toBe('loved');
    expect(tasteOf('rin', 'shade-crystal', false)).toBe('liked');
    expect(tasteOf('rin', 'moss', false)).toBe('neutral');
    expect(tasteOf('rin', 'king-scale', false)).toBe('declined');
    expect(tasteOf('rin', 'king-scale', true)).toBe('declined');
    expect(tasteOf('selene', 'old-coin', false)).toBe('declined');
    expect(tasteOf('selene', 'old-coin', true)).toBe('liked');
    expect(tasteOf('sylvie', 'mire-gland', true)).toBe('neutral');
    expect(tasteOf('chizuru', 'frost-heart', true)).toBe('declined');
    expect(tasteOf('rin', 'essence-common', false)).toBeNull();
    expect(tasteOf('rin', 'potion', false)).toBeNull();
  });
});

describe('gifts (bond plan Task 6)', () => {
  /** Whole reaction tables, each line naming its pool and index, so a test can read which one was picked. */
  const pools = (c: Companion): GiftPools => ({
    loved: ['最愛一', '最愛二'], liked: ['喜歡一', '喜歡二', '喜歡三'], neutral: ['普通一'],
    declined: Object.fromEntries(GIFT_TASTE[c].declined.map((m) => [m, `婉拒${m}`])),
    healed: Object.fromEntries(Object.keys(GIFT_TASTE[c].healed).map((m) => [m, `痊癒${m}`])),
  });
  const ALL = Object.fromEntries(COMPANIONS.map((c) => [c, pools(c)])) as Record<Companion, GiftPools>;
  const RIN_OATH: GiftPools = { ...pools('rin'), loved: ['誓約最愛'] };
  /** Day 3; Rin and Selene met; plenty of every giftable material. */
  const town = (): GameState => {
    const g = newGame();
    g.story.day = 3;
    g.party = meet(g.party, 'selene', 1);
    for (const m of GIFTABLE) g.inventory[m] = 50;
    return g;
  };
  const give = (s: GameState, c: Companion | 'hero', mat: string, lines: Partial<Record<Companion, GiftPools>> = ALL, oath: GiftPools | null = RIN_OATH) =>
    giveGift(s, c as Companion, mat, lines, oath);
  /** Selene with `n` of her pieces held and told. */
  const told = (s: GameState, n: number): GameState => {
    s.party.roster.selene.memories = n;
    for (let k = 1; k <= n; k++) s.story.seen.push(memScene('selene', k));
    return s;
  };

  it('every reason a gift fails', () => {
    const s = town();
    expect(give(s, 'hero', 'moss')).toEqual({ ok: false, reason: 'hero' });
    expect(give(s, 'sylvie', 'moss')).toEqual({ ok: false, reason: 'unmet' });
    const once = give(s, 'rin', 'moss');
    if (!once.ok) throw new Error(once.reason);
    expect(give(once.state, 'rin', 'moss')).toEqual({ ok: false, reason: 'today' });
    expect(give({ ...s, inventory: {} }, 'rin', 'moss')).toEqual({ ok: false, reason: 'stock' });
    expect(give({ ...s, inventory: { 'essence-common': 3 } }, 'rin', 'essence-common')).toEqual({ ok: false, reason: 'ungiftable' });
    expect(give({ ...s, inventory: { potion: 3 } }, 'rin', 'potion')).toEqual({ ok: false, reason: 'ungiftable' });
    const { selene: _s, ...noSelene } = ALL;
    expect(give(s, 'selene', 'moss', noSelene)).toEqual({ ok: false, reason: 'unwritten' });
    expect(give(s, 'rin', 'moss', ALL, null)).toEqual({ ok: false, reason: 'unwritten' });   // Rin needs both tables
    const { rin: _r, ...noRin } = ALL;
    expect(give(s, 'rin', 'moss', noRin)).toEqual({ ok: false, reason: 'unwritten' });
    expect(s.inventory.moss).toBe(50);   // nothing that failed took anything
  });

  it('a loved gift', () => {
    const s = town();
    const before = bondPoints(s.party.roster.rin);
    const r = give(s, 'rin', 'dusk-cloth');
    if (!r.ok) throw new Error(r.reason);
    expect([r.taste, r.healed, r.count, r.gained]).toEqual(['loved', false, 1, 4]);
    expect(bondPoints(r.state.party.roster.rin)).toBe(before + 4);
    expect(r.state.inventory['dusk-cloth']).toBe(49);
    expect(r.state.party.roster.rin.bond!.gifts).toEqual({ 'dusk-cloth': 1 });
    expect(today(r.state).gifted).toEqual(['rin']);
    expect(r.state.story.bondDay).toBe(3);
    expect(s.inventory['dusk-cloth']).toBe(50);   // the state given is not changed
    expect(s.party.roster.rin.bond).toBeUndefined();
    expect(give(r.state, 'rin', 'thorn-fang')).toEqual({ ok: false, reason: 'today' });
    // someone else may still take one today
    const other = give(r.state, 'selene', 'star-tear');
    expect(other.ok && today(other.state).gifted).toEqual(['rin', 'selene']);
  });

  it('a new day, a new gift', () => {
    const s = town();
    const r = give(s, 'rin', 'dusk-cloth');
    if (!r.ok) throw new Error(r.reason);
    r.state.story.talked = true;
    r.state.story.day = 4;
    expect(today(r.state)).toEqual({ gifted: [], talked: false });
    const next = give(r.state, 'rin', 'dusk-cloth');
    if (!next.ok) throw new Error(next.reason);
    expect([next.count, next.gained]).toEqual([2, 4]);
    expect(next.state.story.bondDay).toBe(4);
    expect(next.state.story.gifted).toEqual(['rin']);       // yesterday's list cleared
    expect(next.state.story.talked).toBeUndefined();        // and yesterday's talk
  });

  it('a declined gift is handed back', () => {
    const s = town();
    const before = bondPoints(s.party.roster.rin);
    const r = give(s, 'rin', 'king-scale');
    if (!r.ok) throw new Error(r.reason);
    expect([r.taste, r.count, r.gained]).toEqual(['declined', 0, 0]);
    expect(r.state.inventory['king-scale']).toBe(50);
    expect(bondOf(r.state.party.roster.rin).gifts).toEqual({});
    expect(r.state.party.roster.rin.bond!.refused).toEqual(['king-scale']);
    expect(today(r.state).gifted).toEqual([]);
    expect(bondPoints(r.state.party.roster.rin)).toBe(before);
    expect(giftLine(r, ALL.rin)).toBe('婉拒king-scale');
    // handed back twice, still once in the list; and a real gift is still open today
    const again = give(r.state, 'rin', 'king-scale');
    expect(again.ok && again.state.party.roster.rin.bond!.refused).toEqual(['king-scale']);
    expect(give(r.state, 'rin', 'moss').ok).toBe(true);
  });

  it('healed tastes wait for the last piece told', () => {
    const four = give(told(town(), 4), 'selene', 'old-coin');
    expect(four.ok && four.taste).toBe('declined');
    const held = town();
    held.party.roster.selene.memories = 5;   // all held, four told
    for (let k = 1; k <= 4; k++) held.story.seen.push(memScene('selene', k));
    const untold = give(held, 'selene', 'old-coin');
    expect(untold.ok && untold.taste).toBe('declined');
    const five = give(told(town(), 5), 'selene', 'old-coin');
    if (!five.ok) throw new Error(five.reason);
    expect([five.taste, five.healed, five.count, five.gained]).toEqual(['liked', true, 1, 2]);
    expect(giftLine(five, ALL.selene)).toBe('痊癒old-coin');
    five.state.story.day = 4;
    const second = give(five.state, 'selene', 'old-coin');
    if (!second.ok) throw new Error(second.reason);
    expect(giftLine(second, ALL.selene)).toBe('喜歡二');   // the second: the liked pool, index 1
  });

  it('the gift cap', () => {
    const s = town();
    s.party.roster.rin.bond = { talk: 0, field: 0, gifts: { 'dusk-cloth': 24 } };   // 30
    const r = give(s, 'rin', 'thorn-fang');
    if (!r.ok) throw new Error(r.reason);
    expect([r.taste, r.count, r.gained]).toEqual(['loved', 1, 0]);
    expect(r.state.inventory['thorn-fang']).toBe(49);   // taken all the same
    expect(giftPoints(r.state.party.roster.rin)).toBe(34);
  });

  it('giftLine cycles by count', () => {
    let s = town();
    const lines: (string | undefined)[] = [];
    for (let day = 3; day < 8; day++) {
      s.story.day = day;
      const r = give(s, 'rin', 'shade-crystal');   // liked: three lines
      if (!r.ok) throw new Error(r.reason);
      lines.push(giftLine(r, ALL.rin));
      s = r.state;
    }
    expect(lines).toEqual(['喜歡一', '喜歡二', '喜歡三', '喜歡一', '喜歡二']);
  });

  it("Rin's gifts read her choice", () => {
    const s = town();
    expect(giftPools(s, 'rin', ALL, RIN_OATH)).toBe(ALL.rin);
    expect(giftMood('rin', 'loved', false)).toBe('normal');
    expect(giftMood('rin', 'declined', false)).toBe('normal');
    s.party.roster.rin.memories = chainLength('rin');
    s.party.roster.rin.oath = true;
    expect(giftPools(s, 'rin', ALL, RIN_OATH)).toBe(RIN_OATH);
    expect(giftMood('rin', 'loved', true)).toBe('averted');
    expect(giftMood('noel', 'loved', false)).toBe('smug');
    expect(giftMood('selene', 'declined', false)).toBe('sad');
    const r = give(s, 'rin', 'dusk-cloth');
    expect(r.ok && giftLine(r, giftPools(r.state, 'rin', ALL, RIN_OATH)!)).toBe('誓約最愛');
    expect(giftPools(s, 'selene', ALL, RIN_OATH)).toBe(ALL.selene);
    const { selene: _s, ...noSelene } = ALL;
    expect(giftPools(s, 'selene', noSelene, RIN_OATH)).toBeUndefined();
  });

  it('bond never falls', () => {
    const rng = mulberry32(1);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
    for (let chain = 0; chain < 200; chain++) {
      let s = town();
      for (const c of COMPANIONS) if (c !== 'rin' && c !== 'selene') s.party = meet(s.party, c, 1);
      let was = COMPANIONS.map((c) => bondPoints(s.party.roster[c]));
      for (let step = 0; step < 30; step++) {
        const c = pick(COMPANIONS);
        const op = pick(['gift', 'field', 'talk', 'piece', 'day'] as const);
        if (op === 'gift') {
          const r = give(s, c, pick([...GIFTABLE, 'essence-common', 'potion']));
          if (r.ok) s = r.state;
        } else if (op === 'field') {
          const r = addField(s.party, newRun(chain, 'mainline', 'plain', 1), [c], pick([1, 2]));
          s = { ...s, party: r.party };
        } else if (op === 'talk') {
          const b = bondOf(s.party.roster[c]);
          s.party.roster[c] = { ...s.party.roster[c], bond: { ...b, gifts: { ...b.gifts }, talk: Math.min(12, b.talk + pick([2, 3])) } };
        } else if (op === 'piece') {
          const m = s.party.roster[c];
          const n = Math.min(chainLength(c), (m.memories ?? 0) + 1);
          s.party.roster[c] = { ...m, memories: n };
          if (!s.story.seen.includes(memScene(c, n))) s.story.seen.push(memScene(c, n));
        } else s.story.day = (s.story.day ?? 1) + 1;
        const now = COMPANIONS.map((x) => bondPoints(s.party.roster[x]));
        now.forEach((p, i) => expect(p, `chain ${chain} step ${step} ${op} ${COMPANIONS[i]}`).toBeGreaterThanOrEqual(was[i]));
        was = now;
      }
    }
  });
});

describe('talk points (bond plan Task 8)', () => {
  it('talk points never miss', () => {
    for (const c of COMPANIONS) {
      const pts = (['ask', 'stay', 'promise'] as const).map((t) => talkPoints(c, t));
      for (const p of pts) expect([2, 3], c).toContain(p);
      expect(Math.max(...pts) - Math.min(...pts), c).toBeLessThanOrEqual(1);
      expect(pts.filter((p) => p === 3), c).toHaveLength(1);   // her preferred tone
      expect(talkPoints(c, null), c).toBe(2);
    }
    expect(talkPoints('selene', 'promise')).toBe(3);
    expect(talkPoints('selene', 'ask')).toBe(2);
  });
});

describe('heart-to-hearts: the gates (bond plan Task 9)', () => {
  /** Selene met, holding and having told `told` pieces (held `held`, default the same), with a record worth `extra` points. */
  const selene = (told: number, extra = 0, held = told): GameState => {
    const s = newGame();
    s.party = meet(s.party, 'selene', 1);
    s.party.roster.selene.memories = held;
    for (let k = 1; k <= told; k++) s.story.seen.push(memScene('selene', k));
    s.party.roster.selene.bond = { talk: 0, field: Math.min(40, extra), gifts: {} };
    return s;
  };
  const W = ['selene', 'rin'] as Companion[];

  it('BOND_GATE opens in order', () => {
    // one piece told: 10 + 3 = 13, 相識; seven field points make 20, 同行
    expect(nextBond(selene(1), 'selene', W)).toBeNull();
    expect(nextBond(selene(1, 7), 'selene', W)).toBe('bond:selene:1');
    const s = selene(3, 21);   // 10 + 9 + 21 = 40, 信賴
    expect(nextBond(s, 'selene', W)).toBe('bond:selene:1');   // never skips a number
    s.story.seen.push('bond:selene:1');
    expect(nextBond(s, 'selene', W)).toBe('bond:selene:2');
    s.story.seen.push('bond:selene:2');
    expect(nextBond(s, 'selene', W)).toBeNull();   // the 3rd waits for 羈絆 and her 4th piece
    const deep = selene(4, 40);   // 10 + 12 + 40 = 62, 羈絆
    deep.story.seen.push('bond:selene:1', 'bond:selene:2');
    expect(nextBond(deep, 'selene', W)).toBe('bond:selene:3');
    deep.story.seen.push('bond:selene:3');
    expect(nextBond(deep, 'selene', W)).toBeNull();   // 心契 waits for 85 and all her pieces told
    const all = selene(5, 40);
    all.party.roster.selene.bond = { talk: 12, field: 40, gifts: { 'star-tear': 6 } };   // 10 + 15 + 12 + 12 + 40 = 89
    all.story.seen.push('bond:selene:1', 'bond:selene:2', 'bond:selene:3');
    expect(nextBond(all, 'selene', W)).toBe('bond:selene:4');
    all.story.seen.push('bond:selene:4');
    expect(nextBond(all, 'selene', W)).toBeNull();
  });

  it("Rin's first two expire with her choice", () => {
    const s = newGame();
    s.party.roster.rin.memories = chainLength('rin');
    s.party.roster.rin.bond = { talk: 0, field: 40, gifts: {} };   // 10 + 21 + 40 = 71, 羈絆
    expect(nextBond(s, 'rin', W)).toBe('bond:rin:1');
    s.party.roster.rin.oath = true;
    expect(nextBond(s, 'rin', W)).toBe('bond:rin:3');   // 1 and 2 passed over, never seen
    expect(s.story.seen).not.toContain('bond:rin:1');
  });

  it("a companion's gate reads pieces told", () => {
    const s = selene(2, 40, 4);   // four held, two told: 10 + 12 + 40 = 62
    s.story.seen.push('bond:selene:1');
    expect(bondTier(s.party.roster.selene)).toBe(3);
    expect(nextBond(s, 'selene', W)).toBeNull();   // the 2nd waits on three told
    s.story.seen.push('mem:selene:3');
    expect(nextBond(s, 'selene', W)).toBe('bond:selene:2');
  });

  it('unwritten, not offered', () => {
    const s = selene(1, 7);
    expect(nextBond(s, 'selene', [])).toBeNull();
    expect(nextBond(s, 'selene')).toBeNull();   // nothing is registered today
    expect(bondOpen(s, W)).toEqual(['bond:selene:1']);
    expect(bondOpen(s, [])).toEqual([]);
    s.party.roster.rin.bond = { talk: 0, field: 10, gifts: {} };
    s.party.roster.rin.memories = 2;   // 10 + 6 + 10 = 26, 同行, two pieces
    expect(bondOpen(s, W)).toEqual(['bond:rin:1', 'bond:selene:1']);   // CHARACTER_IDS order
    expect(nextBond(s, 'sylvie', ['sylvie'])).toBeNull();   // not met
  });
});

describe('romance candidates (bond plan Task 10)', () => {
  /** After the finale and the festival; `c` met, whole, at 心契 with her 4th bond scene seen. */
  const eligible = (cs: Companion[]): GameState => {
    const s = newGame();
    s.story.act1Cleared = true;
    s.story.finaleCleared = true;
    s.story.seen.push('epilogue');
    for (const c of cs) {
      if (!s.party.recruited.includes(c)) s.party = meet(s.party, c, 1);
      s.party.roster[c].memories = chainLength(c);
      s.party.roster[c].bond = { talk: 12, field: 40, gifts: { [GIFT_TASTE[c].loved[0]]: 24 } };
      s.story.seen.push(`bond:${c}:4`);
    }
    return s;
  };
  const W: Companion[] = ['liz', 'rin', 'noel'];
  it('romance candidates', () => {
    expect(romanceCandidates(eligible(['liz']), W)).toEqual(['liz']);
    expect(romanceCandidates(eligible(['liz']))).toEqual([]);   // nothing is registered today
    const cut: [string, (s: GameState) => void][] = [
      ['no finale', (s) => { s.story.finaleCleared = false; }],
      ['no festival', (s) => { s.story.seen = s.story.seen.filter((x) => x !== 'epilogue'); }],
      ['chosen already', (s) => { s.story.romance = 'rin'; }],
      ['not met', (s) => { s.party.recruited = s.party.recruited.filter((c) => c !== 'liz'); }],
      ['not 心契', (s) => { s.party.roster.liz.bond = { talk: 12, field: 0, gifts: {} }; }],
      ['her 心契 not seen', (s) => { s.story.seen = s.story.seen.filter((x) => x !== 'bond:liz:4'); }],
    ];
    for (const [why, mut] of cut) { const s = eligible(['liz']); mut(s); expect(romanceCandidates(s, W), why).toEqual([]); }
    expect(romanceCandidates(eligible(['liz']), ['rin'])).toEqual([]);   // not registered
    // highest bond first, CHARACTER_IDS breaks a tie
    const three = eligible(['liz', 'noel', 'rin']);
    expect(romanceCandidates(three, W)).toEqual(['rin', 'noel', 'liz']);   // all at 100: CHARACTER_IDS order
    three.party.roster.rin.memories = 0;
    three.party.roster.rin.bond = { talk: 12, field: 40, gifts: { 'dusk-cloth': 24 } };   // 92
    expect(romanceCandidates(three, W)).toEqual(['noel', 'liz', 'rin']);
  });
});

describe('the taste she has shown (review of bond plan Tasks 12-14)', () => {
  it('a refusal stays 婉拒 after her healing until she is given it again; nothing offered shows nothing', () => {
    const s = withTold(newGame(), 'noel', chainLength('noel'));   // healed: her star stones would now be liked
    expect(knownTaste(s, 'noel', 'star-stone')).toBeUndefined();
    s.party.roster.noel.bond = { talk: 0, field: 0, gifts: { 'storm-stone': 1 }, refused: ['star-stone'] };
    expect(knownTaste(s, 'noel', 'star-stone')).toBe('declined');
    expect(knownTaste(s, 'noel', 'storm-stone')).toBe('loved');
    expect(knownTaste(s, 'noel', 'moss')).toBeUndefined();
    s.party.roster.noel.bond.gifts['star-stone'] = 1;   // given again, healed: her new taste
    expect(knownTaste(s, 'noel', 'star-stone')).toBe('liked');
  });
});
