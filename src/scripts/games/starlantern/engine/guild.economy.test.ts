import { describe, expect, it } from 'vitest';
import { BOARD_CAP, DELIVER_KINDS, GUILD_MAX, GUILD_RUNES, RANKS, REWARD, deliverQty, type DeliverKind } from '../data/guild';
import { BASE_RECIPES, CONSUMABLE_RECIPES, DISMANTLE, OWN_RECIPE, SET_RECIPE } from '../data/forge';
import { ENEMIES } from '../data/enemies';
import { EQUIPMENT } from '../data/equipment';
import { GEAR_SLOTS, SETS } from '../data/gear';
import { ITEMS } from '../data/items';
import { GATHER_MATERIALS } from '../data/gather';
import { MATERIALS } from '../data/materials';
import { BOSS_PARTS } from '../data/monsters';
import { RUNE_SELL, RUNE_STOCK } from '../data/runeEconomy';
import { SHARD_IDS, SHARD_PRICE, isFragmentItem } from '../data/story/fragments';
import { craftBase, craftItem, craftSet } from './forge/craft';
import { dismantle } from './forge/forge';
import { abandon, accept, bountyLine, postBoard, turnIn } from './guild';
import { BAND_DEPTHS } from './story/handbook';
import { buyRune } from './runeTrade';
import { loadGame, saveGame } from './save';
import { newGame, type GameState, type QuestOffer } from './state';
import { memoryStorage, withGatherLive, withGuildLive } from './testing';
import { buy } from './town';
import type { Rarity } from './types';

/**
 * Guild quests plan Task A6 (spec §10): the board makes no loop. Values as engine/forge/economy.test.ts counts them:
 * materials at their sell price (its helpers copied here, not imported). A consumable counts at its shop price, a shard
 * at its sell price, a rune at RUNE_SELL.
 */
const stocked = (): Record<string, number> => Object.fromEntries(Object.keys(MATERIALS).map((m) => [m, 5000]));
const rich = (): GameState => {
  const s = newGame();
  s.gold = 10_000_000;
  s.inventory = stocked();
  return s;
};
const deliverable = (id: string): boolean => !!MATERIALS[id] && DELIVER_KINDS.includes(MATERIALS[id].kind);
const GOODS = Object.keys(MATERIALS).filter(deliverable);
const SHARD_VALUE: Record<string, number> = Object.fromEntries(Object.entries(SHARD_IDS).map(([g, id]) => [id, SHARD_PRICE[g as keyof typeof SHARD_PRICE]]));
const itemValue = (id: string): number => MATERIALS[id]?.price ?? ITEMS[id]?.price ?? SHARD_VALUE[id];
const RARITIES: Rarity[] = ['common', 'magic', 'rare', 'epic', 'legendary', 'unique', 'set'];
/** The goods `b` holds more of than `a`. */
const goodsGained = (a: GameState, b: GameState): string[] => GOODS.filter((id) => (b.inventory[id] ?? 0) > (a.inventory[id] ?? 0));

/** The first depth a foe can be met at: its table's, its band's, a native's and the old foes' 1 (for the depth scenarios). */
function firstDepth(id: string): number {
  const body = Object.keys(BOSS_PARTS).find((b) => BOSS_PARTS[b].includes(id));
  if (body) return firstDepth(body);
  const line = bountyLine(id);
  if (line) return line.depth;
  if (id === 'lantern-mother') return 30;
  const band = ENEMIES[id].band;
  return band ? BAND_DEPTHS[band][0] : 1;
}
/** A player at depth `d` everywhere, every foe met by then seen and felled, at rank `r`, runes open; the finale cleared from 30. */
function atDepth(d: number, r: number, seed: number): GameState {
  const s = newGame();
  s.bestiary = Object.fromEntries(Object.keys(ENEMIES).filter((id) => firstDepth(id) <= d).map((id) => [id, { seen: 1, felled: 1 }]));
  for (const k of Object.keys(s.dungeon.reached) as (keyof typeof s.dungeon.reached)[]) s.dungeon.reached[k] = d;
  s.runesOpen = true;
  s.story.act1Cleared = true;
  if (d >= 30) s.story.finaleCleared = true;
  s.forgeSalt = (seed * 2654435761) >>> 0;
  s.guild = { day: 0, offers: [], active: [], merit: RANKS[r].merit, paid: r };
  return s;
}
const DEPTHS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('1. nothing the board asks for can be bought or made', () => {
  it('no shop, recipe or forge output is a deliverable good', () => {
    expect(GOODS.length).toBeGreaterThan(50);
    for (const id of GOODS) {
      expect(ITEMS[id], id).toBeUndefined();
      expect(EQUIPMENT[id], id).toBeUndefined();
      expect(CONSUMABLE_RECIPES[id], id).toBeUndefined();
      for (const r of RARITIES) expect(DISMANTLE[r][id], `${r} dismantles into ${id}`).toBeUndefined();
      expect((RUNE_STOCK as readonly string[]).includes(id)).toBe(false);
    }
    // The forge's other outputs are gear, not materials: a base, a set piece, an own unique (their recipes only take
    // materials in), and fusion turns gear into gear. Listed by what they make:
    for (const recipe of [...Object.values(BASE_RECIPES)]) for (const id of Object.keys(recipe)) expect(MATERIALS[id], id).toBeDefined();
    expect(MATERIALS[SET_RECIPE.rare].kind).toBe('rare');
    expect(MATERIALS[OWN_RECIPE.rare].kind).toBe('rare');
  });

  it('for real: buying, crafting and dismantling everything adds none of them', () => {
    const s = rich();
    s.sold = Object.fromEntries(Object.keys(MATERIALS).map((m) => [m, 999]));
    s.runesOpen = true;
    for (const id of [...Object.keys(ITEMS), ...Object.keys(EQUIPMENT).filter((e) => EQUIPMENT[e].price !== undefined)]) {
      const r = buy({ ...s, bag: [] }, id);
      expect(r.ok, id).toBe(true);
      if (r.ok) expect(goodsGained(s, r.state), id).toEqual([]);
    }
    for (const id of Object.keys(CONSUMABLE_RECIPES)) {
      const r = craftItem(s, id, 1);
      expect(r.ok, id).toBe(true);
      if (r.ok) expect(goodsGained(s, r.state), id).toEqual([]);
    }
    for (const slot of GEAR_SLOTS) {
      const r = craftBase(s, slot);
      expect(r.ok, slot).toBe(true);
      if (!r.ok) continue;
      expect(goodsGained(s, r.state), slot).toEqual([]);
      // and dismantling what it made, at every rarity
      for (const rarity of RARITIES) {
        const t = structuredClone(r.state);
        t.bag[t.bag.length - 1].rarity = rarity;
        const d = dismantle(t, [t.bag[t.bag.length - 1].uid]);
        expect(d.ok, `${slot} ${rarity}`).toBe(true);
        if (d.ok) expect(goodsGained(t, d.state), `${slot} ${rarity}`).toEqual([]);
      }
    }
    const set = craftSet(s, SETS['set-blaze'].pieces[0]);
    expect(set.ok).toBe(true);
    if (set.ok) expect(goodsGained(s, set.state)).toEqual([]);
    for (const id of RUNE_STOCK) {
      const r = buyRune(s, { id, tier: 'common' });
      expect(r.ok, id).toBe(true);
      if (r.ok) expect(goodsGained(s, r.state), id).toEqual([]);
    }
  });
});

describe('2. rewards never feed a request', () => {
  it('no reward, gift or rune is a deliverable good', () => {
    const paid = new Set<string>();
    for (const d of DEPTHS) {
      for (const r of [REWARD.hunt(6, d), REWARD.sweep(d), REWARD.warden(d), REWARD.boss(d), REWARD.scout(d)]) for (const id of Object.keys(r.items ?? {})) paid.add(id);
    }
    for (const rank of RANKS) for (const id of Object.keys(rank.gift.items ?? {})) paid.add(id);
    for (const id of Object.values(SHARD_IDS)) paid.add(id);   // a bounty's shards
    for (const id of paid) {
      expect(deliverable(id), id).toBe(false);
      expect(MATERIALS[id]?.kind === 'essence' || MATERIALS[id]?.kind === 'rare' || isFragmentItem(id) || id in ITEMS, id).toBe(true);
    }
    expect([...paid].sort()).toEqual(['ancient-gear', 'essence-magic', 'essence-rare', 'king-scale', 'phoenix', 'return-lamp', 'shard-clear', 'shard-dim', 'shard-vivid', 'star-tear']);
    for (const id of GUILD_RUNES) expect(MATERIALS[id], id).toBeUndefined();   // a rune is a rune, never a material
    // and on a thousand real boards
    for (let seed = 0; seed < 1000; seed++) {
      for (const o of postBoard(atDepth(1 + (seed % 60), seed % RANKS.length, seed)).guild!.offers) {
        for (const id of Object.keys(o.reward.items ?? {})) expect(deliverable(id), `${o.kind}:${o.target} pays ${id}`).toBe(false);
      }
    }
  });
});

describe('3. a delivery pays for goods, not gold', () => {
  it('only gold, 1.6 times the goods', () => {
    for (const id of GOODS) {
      const m = MATERIALS[id];
      const q = deliverQty(m.price, m.kind as DeliverKind);
      expect(REWARD.deliver(q, m.price), id).toEqual({ gold: Math.round(1.6 * q * m.price) });
    }
    for (let seed = 0; seed < 300; seed++) {
      for (const o of postBoard(atDepth(1 + (seed % 60), seed % RANKS.length, seed)).guild!.offers) {
        if (o.kind !== 'deliver') continue;
        expect(o.reward, o.target).toEqual({ gold: Math.round(1.6 * o.n * MATERIALS[o.target].price) });
      }
    }
  });
});

/** A board holding one scout of the main road, done (reached 12), and one hunt not done. */
function twoNotes(): GameState {
  const s = atDepth(12, 0, 1);
  const note = (id: string, kind: QuestOffer['kind'], target: string, n: number): QuestOffer => ({
    id, kind, giver: kind === 'scout' ? 'glen' : 'marta', variant: 0, target, n, depth: n, reward: { gold: 100, items: { 'return-lamp': 1 } }, merit: 3,
  });
  s.guild!.day = 1;
  s.guild!.offers = [note('1:0', 'scout', 'mainline', 10), note('1:1', 'hunt', 'slime', 6)];
  return s;
}
const ok = <R extends { ok: boolean }>(r: R): Extract<R, { ok: true }> => {
  expect(r.ok).toBe(true);
  return r as Extract<R, { ok: true }>;
};

describe('4. a note pays once', () => {
  it('turned in once, dropped for good, one board a day', () => withGuildLive(() => {
    const s = twoNotes();
    const t = ok(accept(s, '1:0')).state;
    const paid = ok(turnIn(t, '1:0')).state;
    expect(paid.guild!.active).toEqual([]);
    expect(turnIn(paid, '1:0')).toEqual({ ok: false, reason: 'invalid' });
    expect(accept(paid, '1:0')).toEqual({ ok: false, reason: 'invalid' });
    const dropped = ok(abandon(ok(accept(s, '1:1')).state, '1:1')).state;
    expect(accept(dropped, '1:1')).toEqual({ ok: false, reason: 'invalid' });
    // the same day again: the board is as it was, taken notes and all
    expect(postBoard(t)).toBe(t);
    expect(postBoard(paid).guild).toEqual(paid.guild);
  }));
});

describe('5. a gift pays once a lamp', () => {
  it('paid on the way up, never again', () => withGuildLive(() => {
    const s = twoNotes();
    s.guild!.merit = 10;
    s.guild!.offers.push({ ...s.guild!.offers[0], id: '1:2' });
    const t = ok(accept(ok(accept(s, '1:0')).state, '1:2')).state;
    const up = ok(turnIn(t, '1:0'));
    expect(up.rankUps).toEqual([1]);
    const giftGold = RANKS[1].gift.gold!;
    expect(up.state.gold - t.gold).toBe(100 + giftGold);
    // another turn-in at the same rank pays the note alone
    const again = ok(turnIn(up.state, '1:2'));
    expect(again.rankUps).toEqual([]);
    expect(again.state.gold - up.state.gold).toBe(100);
    expect(again.state.guild!.paid).toBe(1);
    // through a save and a load: the next rank pays its own gift only
    const st = memoryStorage();
    const before = structuredClone(again.state);
    before.guild!.merit = RANKS[2].merit - 1;
    before.guild!.offers = [{ ...s.guild!.offers[0], id: '1:3' }];
    expect(saveGame(st, before)).toBe(true);
    const r = loadGame(st);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const two = ok(turnIn(ok(accept(r.state, '1:3')).state, '1:3'));
    expect(two.rankUps).toEqual([2]);
    expect(two.state.guild!.paid).toBe(2);
    expect(two.state.gold - r.state.gold).toBe(100);   // the second lamp pays goods, no gold; the first is not paid again
    expect(two.state.inventory.phoenix).toBe((r.state.inventory.phoenix ?? 0) + 1);
    expect(two.state.inventory['return-lamp']).toBe((r.state.inventory['return-lamp'] ?? 0) + 1);
    // merit stops at its cap
    const top = structuredClone(r.state);
    top.guild!.merit = GUILD_MAX - 1;
    top.guild!.paid = 4;
    expect(ok(turnIn(ok(accept(top, '1:3')).state, '1:3')).state.guild!.merit).toBe(GUILD_MAX);
  }));
});

/**
 * Controller ruling (2026-10-29, guild spec §0): the earliest depth a player can plausibly hold each rank at. Merit comes
 * from quests turned in: about 7 a dive at 見習 (three held, 2 to 3 merit each) and about 10 from the first lamp (sweeps 3,
 * bounties 5 to 6), 13 from the third (four held). From the unlock at depth 3, and counting each dive as at least one
 * floor deeper (a dive that counts wins a fight or goes down a floor; scouts ask 3 to 5 more):
 *   見習 0: from depth 1 (the board itself opens at 3; earlier depths are measured too);
 *   一燈 12: 12 / 7 ≈ 2 dives, depth 3 + 2 = 5;
 *   二燈 40: 28 more / 10 ≈ 3 dives, depth 8;
 *   三燈 100: 60 more / 10 = 6 dives, depth 14;
 *   四燈 200: 100 more / 13 ≈ 8 dives, depth 22.
 */
const RANK_MIN_DEPTH = [1, 5, 8, 14, 22];
/**
 * Spec §10 item 6: a board's rewards, at most BOARD_CAP(d). Gold, materials at their sell price, consumables at their
 * shop price, shards at their sell price, a rune at RUNE_SELL. A delivery counts net (controller ruling): its gold less
 * the goods given up at their sell price, since it trades goods for gold.
 */
function boardValue(offers: readonly QuestOffer[]): number {
  let v = 0;
  for (const o of offers) {
    v += o.reward.gold;
    if (o.kind === 'deliver') v -= MATERIALS[o.target].price * o.n;
    for (const [id, n] of Object.entries(o.reward.items ?? {})) v += itemValue(id) * n;
    if (o.reward.rune) v += RUNE_SELL[o.reward.rune.split('@')[1] as keyof typeof RUNE_SELL];
  }
  return v;
}
/**
 * Named exceptions (spec §10 item 6, plan A6 Step 2, §0 item 20): a realistic `rank:depth` pair over BOARD_CAP in the full
 * sweep. `measured` is the worst board the full sweep finds there (pinned exactly when it runs); `max`, the bound asserted,
 * is `measured` + 0.01 × BOARD_CAP(d). Carried as a to-do in the SDD's A/carry.md.
 */
const BOARD_CAP_EXCEPTIONS: Record<string, { measured: number; max: number; why: string }> = {
  // measured 2026-10-29 with the full sweep (GUILD_CAP_FULL=1), the formulas untouched (spec §0 item 20)
  '1:5': { measured: 1210, max: 1222, why: 'seed 902 of the full sweep: 1210 against a cap of 1200 (to-do G1 in carry.md)' },
  '4:22': { measured: 3308, max: 3340.4, why: 'seed 357 of the full sweep: 3308 against a cap of 3240 (to-do G1 in carry.md)' },
};

/**
 * Review M1 of PR A: how many seeds each (rank, depth) pair is sampled with. The full sweep (`GUILD_CAP_FULL=1`) is every
 * rank × depths 1–60 × seeds 0–999, 300 000 boards: the exceptions were measured with it. The everyday run takes seeds
 * 0–39 of every pair (12 000 boards), the same boards the full sweep begins with, so it can only find less.
 */
const CAP_FULL = process.env.GUILD_CAP_FULL === '1';
const CAP_SEEDS = CAP_FULL ? 1000 : 40;
const SWEEP_MS = CAP_FULL ? 1_800_000 : 120_000;

/** One sweep of every rank × depth × CAP_SEEDS seeds, shared by the two tests: each pair's worst board, and bounty misplacements. */
let capMemo: { worst: Record<string, { v: number; seed: number }>; misplaced: string[] } | null = null;
function capSweep() {
  if (capMemo) return capMemo;
  const worst: Record<string, { v: number; seed: number }> = {};
  const misplaced: string[] = [];
  for (let r = 0; r < RANKS.length; r++) {
    const most = RANKS[r].doubleBounty ? 2 : 1;
    for (const d of DEPTHS) {
      const k = `${r}:${d}`;
      for (let seed = 0; seed < CAP_SEEDS; seed++) {
        const b = postBoard(atDepth(d, r, seed)).guild!.offers;
        const bounties = b.filter((o) => o.kind === 'bounty');
        // at most one a board (two at four lamps), and only in the fixed slots
        if (bounties.length > most || bounties.some((o) => Number(o.id.split(':')[1]) >= most)) misplaced.push(`${k} seed ${seed}: ${bounties.map((o) => o.id).join(', ')}`);
        const v = boardValue(b);
        if (!worst[k] || v > worst[k].v) worst[k] = { v, seed };
      }
    }
  }
  return (capMemo = { worst, misplaced });
}

describe('6. a board has a ceiling', () => {
  it('one bounty a board, two at four lamps (controller ruling)', () => {
    const { worst, misplaced } = capSweep();
    expect(Object.keys(worst)).toHaveLength(RANKS.length * DEPTHS.length);
    expect(misplaced).toEqual([]);
  }, SWEEP_MS);

  it(`boards at every depth stay under BOARD_CAP (${CAP_SEEDS} seeds a pair)`, () => {
    const { worst } = capSweep();
    const cap = (k: string) => BOARD_CAP(Number(k.split(':')[1]));
    const realistic = (k: string) => Number(k.split(':')[1]) >= RANK_MIN_DEPTH[Number(k.split(':')[0])];
    const over = Object.entries(worst).filter(([k, w]) => w.v > cap(k));
    console.log(`[guild cap] ${CAP_SEEDS} seeds a pair; over the cap where no player stands yet (not asserted): ${over.filter(([k]) => !realistic(k)).map(([k, w]) => `${k} ${w.v}/${cap(k)} (seed ${w.seed})`).join(', ') || 'none'}`);
    console.log(`[guild cap] realistic pairs over the cap: ${over.filter(([k]) => realistic(k)).map(([k, w]) => `${k} ${w.v}/${cap(k)} (seed ${w.seed})`).join(', ') || 'none'}`);
    for (const [k, ex] of Object.entries(BOARD_CAP_EXCEPTIONS)) {
      expect(realistic(k), `${k} is a realistic pair`).toBe(true);
      expect(ex.max, k).toBe(Math.round((ex.measured + 0.01 * cap(k)) * 100) / 100);
      // the full sweep finds exactly what was measured; a smaller one never more
      if (CAP_FULL) expect(worst[k].v, `${k} measured`).toBe(ex.measured);
      else expect(worst[k].v, `${k} measured`).toBeLessThanOrEqual(ex.measured);
    }
    for (const [k, w] of Object.entries(worst)) {
      if (!realistic(k)) continue;
      const ex = BOARD_CAP_EXCEPTIONS[k];
      if (ex) console.log(`[guild cap] exception ${k}: ${w.v} (bound ${ex.max}, cap ${cap(k)}): ${ex.why}`);
      expect(w.v, `${k} seed ${w.seed}`).toBeLessThanOrEqual(ex ? ex.max : cap(k));
    }
  }, SWEEP_MS);
});

/**
 * Gathering plan Task C1 (ruling 19, gathering spec §8.4, review M3): gathered goods get a sweep of their own, so the
 * pinned one above (`capSweep`, BOARD_CAP_EXCEPTIONS) is never touched. The same ranks × depths × seeds, each save also
 * having gathered every gathered good once (gathering open). Its own worst board and its own named exceptions, measured
 * the same way (realistic pairs, a delivery counted net; guild spec §0 item 20: no formula is changed).
 */
const GATHERED = GATHER_MATERIALS.map((m) => m.id);
/** FNV-1a over a sweep's worst boards, in the order the sweep walks the pairs. */
function sweepDigest(worst: Record<string, { v: number; seed: number }>): string {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(worst)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
/** The pinned sweep's worst boards at 40 seeds a pair, digested, measured 2026-10-30 before gathered goods could be asked for. */
const CAP_SWEEP_40 = '54145de0';
/**
 * The realistic pair whose worst board comes nearest its cap (or goes furthest over it), from the full sweep with every
 * good gathered (GUILD_CAP_FULL=1, measured 2026-10-30): the full sweep finds exactly this, a smaller one never worse.
 */
const GATHER_BOARD_WORST: { pair: string; seed: number; v: number } = { pair: '4:22', seed: 297, v: 3290 };
/** Named exceptions of the gathered sweep, as BOARD_CAP_EXCEPTIONS (bound = measured + 0.01 × cap). */
const GATHER_BOARD_EXCEPTIONS: Record<string, { measured: number; max: number; why: string }> = {
  // measured 2026-10-30 with the full sweep (GUILD_CAP_FULL=1), the formulas untouched (guild spec §0 item 20)
  '4:22': { measured: 3290, max: 3322.4, why: 'seed 297 of the full gathered sweep: 3290 against a cap of 3240 (the pair of BOARD_CAP_EXCEPTIONS 4:22, to-do G1)' },
};

let gatherMemo: { worst: Record<string, { v: number; seed: number }>; asked: number } | null = null;
function gatherCapSweep() {
  if (gatherMemo) return gatherMemo;
  return withGatherLive(() => {
    const worst: Record<string, { v: number; seed: number }> = {};
    let asked = 0;
    for (let r = 0; r < RANKS.length; r++) {
      for (const d of DEPTHS) {
        const k = `${r}:${d}`;
        for (let seed = 0; seed < CAP_SEEDS; seed++) {
          const s = atDepth(d, r, seed);
          s.gather = { got: Object.fromEntries(GATHERED.map((id) => [id, 1])) };
          const b = postBoard(s).guild!.offers;
          asked += b.filter((o) => o.kind === 'deliver' && GATHERED.includes(o.target)).length;
          const v = boardValue(b);
          if (!worst[k] || v > worst[k].v) worst[k] = { v, seed };
        }
      }
    }
    return (gatherMemo = { worst, asked });
  }, { open: true });
}

describe('6b. gathered deliveries keep the board under its cap', () => {
  const cap = (k: string) => BOARD_CAP(Number(k.split(':')[1]));
  const realistic = (k: string) => Number(k.split(':')[1]) >= RANK_MIN_DEPTH[Number(k.split(':')[0])];

  it('the pinned sweep is untouched', () => {
    const { worst } = capSweep();
    if (CAP_FULL) {
      expect(worst['1:5']).toEqual({ v: 1210, seed: 902 });
      expect(worst['4:22']).toEqual({ v: 3308, seed: 357 });
    } else {
      expect(sweepDigest(worst)).toBe(CAP_SWEEP_40);
    }
  }, SWEEP_MS);

  it(`gathered deliveries keep the board under BOARD_CAP (${CAP_SEEDS} seeds a pair)`, () => {
    const { worst, asked } = gatherCapSweep();
    expect(Object.keys(worst)).toHaveLength(RANKS.length * DEPTHS.length);
    const over = Object.entries(worst).filter(([k, w]) => w.v > cap(k));
    console.log(`[gather cap] ${CAP_SEEDS} seeds a pair, ${asked} gathered deliveries; over the cap where no player stands yet (not asserted): ${over.filter(([k]) => !realistic(k)).map(([k, w]) => `${k} ${w.v}/${cap(k)} (seed ${w.seed})`).join(', ') || 'none'}`);
    console.log(`[gather cap] realistic pairs over the cap: ${over.filter(([k]) => realistic(k)).map(([k, w]) => `${k} ${w.v}/${cap(k)} (seed ${w.seed})`).join(', ') || 'none'}`);
    // the realistic pair nearest (or furthest over) its cap, the first found on a tie
    let top: { pair: string; seed: number; v: number } | undefined;
    for (const [k, w] of Object.entries(worst)) if (realistic(k) && (!top || w.v - cap(k) > top.v - cap(top.pair))) top = { pair: k, seed: w.seed, v: w.v };
    console.log(`[gather cap] worst realistic board: ${top!.pair} ${top!.v}/${cap(top!.pair)} (seed ${top!.seed})`);
    expect(asked, 'gathered goods were really asked for').toBeGreaterThan(CAP_SEEDS * 20);
    if (CAP_FULL) expect(top).toEqual(GATHER_BOARD_WORST);
    else expect(top!.v - cap(top!.pair)).toBeLessThanOrEqual(GATHER_BOARD_WORST.v - cap(GATHER_BOARD_WORST.pair));
    for (const [k, ex] of Object.entries(GATHER_BOARD_EXCEPTIONS)) {
      expect(realistic(k), `${k} is a realistic pair`).toBe(true);
      expect(ex.max, k).toBe(Math.round((ex.measured + 0.01 * cap(k)) * 100) / 100);
      if (CAP_FULL) expect(worst[k].v, `${k} measured`).toBe(ex.measured);
      else expect(worst[k].v, `${k} measured`).toBeLessThanOrEqual(ex.measured);
    }
    for (const [k, w] of Object.entries(worst)) {
      if (!realistic(k)) continue;
      const ex = GATHER_BOARD_EXCEPTIONS[k];
      if (ex) console.log(`[gather cap] exception ${k}: ${w.v} (bound ${ex.max}, cap ${cap(k)}): ${ex.why}`);
      expect(w.v, `${k} seed ${w.seed}`).toBeLessThanOrEqual(ex ? ex.max : cap(k));
    }
  }, SWEEP_MS);
});

describe('7. taking, dropping and turning in draw nothing', () => {
  it('the forge draws, the pity and the bestiary stay', () => withGuildLive(() => {
    const s = twoNotes();
    s.forgeDraws = 23;
    s.story.pity = { hero: 4, rin: 1 };
    const keep = (t: GameState) => {
      expect(t.forgeDraws).toBe(23);
      expect(t.story.pity).toEqual({ hero: 4, rin: 1 });
      expect(t.bestiary).toEqual(s.bestiary);
    };
    const a = ok(accept(s, '1:0')).state;
    keep(a);
    const b = ok(accept(a, '1:1')).state;
    keep(b);
    keep(ok(turnIn(b, '1:0')).state);
    keep(ok(abandon(b, '1:1')).state);
    const next = structuredClone(b);
    next.story.day = 2;
    keep(postBoard(next));
  }));
});
