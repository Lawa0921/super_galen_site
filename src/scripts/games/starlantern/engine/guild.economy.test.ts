import { describe, expect, it } from 'vitest';
import { BOARD_CAP, DELIVER_KINDS, GUILD_MAX, GUILD_RUNES, RANKS, REWARD, deliverQty, type DeliverKind } from '../data/guild';
import { BASE_RECIPES, CONSUMABLE_RECIPES, DISMANTLE, OWN_RECIPE, SET_RECIPE } from '../data/forge';
import { ENEMIES } from '../data/enemies';
import { EQUIPMENT } from '../data/equipment';
import { GEAR_SLOTS, SETS } from '../data/gear';
import { ITEMS } from '../data/items';
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
import { memoryStorage, withGuildLive } from './testing';
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
/** Named exceptions (spec §10 item 6, plan A6 Step 2): `rank:depth` with the bound measured, and why. */
const BOARD_CAP_EXCEPTIONS: Record<string, { max: number; why: string }> = {};

describe('6. a board has a ceiling', () => {
  it('one bounty a board, two at four lamps (controller ruling)', () => {
    for (let seed = 0; seed < 1000; seed++) {
      for (let r = 0; r < RANKS.length; r++) {
        const d = DEPTHS[seed % DEPTHS.length];
        const b = postBoard(atDepth(d, r, seed)).guild!.offers;
        const bounties = b.filter((o) => o.kind === 'bounty').length;
        expect(bounties, `rank ${r} depth ${d} seed ${seed}`).toBeLessThanOrEqual(RANKS[r].doubleBounty ? 2 : 1);
        // and only the fixed slots hold one
        b.forEach((o) => { if (o.kind === 'bounty') expect(Number(o.id.split(':')[1]), o.id).toBeLessThan(RANKS[r].doubleBounty ? 2 : 1); });
      }
    }
  });

  it('a thousand boards at every depth stay under BOARD_CAP', () => {
    // measured 2026-10-29 with the one-bounty ruling: every realistic pair under the cap, so none is named
    expect(BOARD_CAP_EXCEPTIONS).toEqual({});
    const worst: Record<string, number> = {};
    for (let seed = 0; seed < 1000; seed++) {
      for (let r = 0; r < RANKS.length; r++) {
        const d = DEPTHS[seed % DEPTHS.length];
        const v = boardValue(postBoard(atDepth(d, r, seed)).guild!.offers);
        const k = `${r}:${d}`;
        worst[k] = Math.max(worst[k] ?? -Infinity, v);
      }
    }
    const over = Object.entries(worst).filter(([k, v]) => v > BOARD_CAP(Number(k.split(':')[1]))).map(([k, v]) => `${k} ${v}/${BOARD_CAP(Number(k.split(':')[1]))}`);
    const unrealistic = over.filter((x) => Number(x.split(':')[1].split(' ')[0]) < RANK_MIN_DEPTH[Number(x.split(':')[0])]);
    console.log(`[guild cap] over the cap where no player stands yet (not asserted): ${unrealistic.join(', ') || 'none'}`);
    for (const [k, v] of Object.entries(worst)) {
      const [r, d] = k.split(':').map(Number);
      if (d < RANK_MIN_DEPTH[r]) continue;
      const ex = BOARD_CAP_EXCEPTIONS[k];
      if (ex) console.log(`[guild cap] exception ${k}: ${v} (bound ${ex.max}, cap ${BOARD_CAP(d)}): ${ex.why}`);
      expect(v, `rank ${r} depth ${d}`).toBeLessThanOrEqual(ex ? ex.max : BOARD_CAP(d));
    }
  });
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
