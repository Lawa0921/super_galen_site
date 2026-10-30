import { describe, expect, it } from 'vitest';
import { GATHER_FLOOR_CAP, GATHER_MATERIALS, GATHER_RECIPES, SPOT_REGIONS, SPOT_OF, TOOL_LEVELS } from '../data/gather';
import { BASE_RECIPES, CONSUMABLE_RECIPES, DISMANTLE, FUSE_NEXT, OWN_RECIPE, SET_RECIPE } from '../data/forge';
import { CONDITIONS, type ConditionId } from '../data/conditions';
import { ENEMIES } from '../data/enemies';
import { EQUIPMENT } from '../data/equipment';
import { FLOORS } from '../data/floors';
import { GEAR_SLOTS, SETS } from '../data/gear';
import { GUILD_RUNES, RANKS, REWARD } from '../data/guild';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { REGIONS, type RegionId } from '../data/regions';
import { RUNE_STOCK } from '../data/runeEconomy';
import { SHARD_IDS, TOWN_FRAGMENTS } from '../data/story/fragments';
import { advance, danger } from './encounter';
import { POISON_TP_LOSS_PCT } from './events';
import { Game } from './game';
import { nextStep, outcome, ruleOf, spotHurt } from './gather';
import { RARE_MATERIALS } from './loot/drops';
import { sellPrice } from './loot/item';
import { hasPassive, meet, statsOf } from './party';
import { mulberry32 } from './rng';
import { buyRune } from './runeTrade';
import { newGame, type GameState } from './state';
import { buy, sell, sellJunk } from './town';
import { plainItem } from './testing';
import { craftBase, craftItem, craftSet } from './forge/craft';
import { dismantle, fuse, reroll } from './forge/forge';
import { craftTool } from './forge/gatherTools';
import { floorOf, newRun } from './dungeon/run';
import type { CharacterId, ItemInstance, Rarity } from './types';

/**
 * Gathering plan Task A6 (spec §11): the sweeps that keep gathering from making a loop. Items 3, 4 and 7 are single
 * behaviours, checked where they were built: one point pays once (engine/game.test.ts "a point pays once", "a full pack
 * leaves the point", "a reload in the labyrinth forgets the trip"), a tool is made once (engine/forge/gatherTools.test.ts),
 * nothing draws (engine/game.test.ts "gathering draws nothing", "the forge's gathering work draws nothing";
 * engine/gather.guard.test.ts). Item 6's full board sweep is the gathering plan's PR C; here only its data side.
 * Values as engine/forge/economy.test.ts counts them (helpers copied, not imported): a material at its sell price, gear at
 * the better of its sell price and its essences'. Sweeps run the first 40 seeds; GATHER_FULL=1 runs the full thousand.
 */
const matValue = (mats: Record<string, number>): number => Object.entries(mats).reduce((t, [id, n]) => t + MATERIALS[id].price * n, 0);
const gearValue = (it: ItemInstance): number => Math.max(sellPrice(it), matValue(DISMANTLE[it.rarity]));
const stocked = (): Record<string, number> => Object.fromEntries(Object.keys(MATERIALS).map((m) => [m, 5000]));
const rich = (): GameState => {
  const s = newGame();
  s.gold = 10_000_000;
  s.inventory = stocked();
  return s;
};
const GATHERED = new Set(GATHER_MATERIALS.map((m) => m.id));
/** The gathered goods `b` holds more of than `a`. */
const gainedGathered = (a: GameState, b: GameState): string[] => [...GATHERED].filter((id) => (b.inventory[id] ?? 0) > (a.inventory[id] ?? 0));
const RARITIES: Rarity[] = ['common', 'magic', 'rare', 'epic', 'legendary', 'unique', 'set'];
const REGION_IDS: RegionId[] = ['mainline', 'blaze', 'frost', 'storm', 'mire', 'shade', 'iron'];
const SEEDS = Array.from({ length: process.env.GATHER_FULL === '1' ? 1000 : 40 }, (_, i) => i);
const DEPTHS = Array.from({ length: 60 }, (_, i) => i + 1);
const SWEEP_MS = process.env.GATHER_FULL === '1' ? 7_200_000 : 300_000;

describe('1. gathered goods are only gathered', () => {
  it('gathered goods are only gathered', () => {
    expect(GATHERED.size).toBe(14);
    for (const id of GATHERED) {
      expect(MATERIALS[id].kind, id).toBe('gather');
      expect(ITEMS[id], id).toBeUndefined();
      expect(EQUIPMENT[id], id).toBeUndefined();
      expect((RUNE_STOCK as readonly string[]).includes(id), id).toBe(false);
      expect(CONSUMABLE_RECIPES[id], id).toBeUndefined();
      expect(GATHER_RECIPES[id], id).toBeUndefined();
      for (const r of RARITIES) expect(DISMANTLE[r][id], `${r} dismantles into ${id}`).toBeUndefined();
      expect(RARE_MATERIALS.includes(id), id).toBe(false);
      expect(Object.values(SHARD_IDS).includes(id as never), id).toBe(false);
      expect(JSON.stringify(TOWN_FRAGMENTS).includes(`"${id}"`), `a townsfolk fragment pays ${id}`).toBe(false);
      for (const f of FLOORS) expect(f.chestLoot.some((l) => l.item === id), `floor ${f.id} chest ${id}`).toBe(false);
      for (const e of Object.values(ENEMIES)) expect(e.drops.some((x) => x.mat === id), `${e.id} drops ${id}`).toBe(false);
    }
    // the forge's outputs: consumables (both recipes' outputs are items), gear, and the tools (no item at all)
    for (const out of [...Object.keys(CONSUMABLE_RECIPES), ...Object.keys(GATHER_RECIPES)]) expect(ITEMS[out], out).toBeDefined();
    for (const t of TOOL_LEVELS) expect(MATERIALS[`tool@${t.level}`] ?? ITEMS[`tool@${t.level}`]).toBeUndefined();
    expect(MATERIALS[SET_RECIPE.rare].kind).toBe('rare');
    expect(MATERIALS[OWN_RECIPE.rare].kind).toBe('rare');
    for (const recipe of Object.values(BASE_RECIPES)) for (const id of Object.keys(recipe)) expect(GATHERED.has(id), id).toBe(false);
  });

  it('for real: buying, crafting, dismantling and fusing everything gathers nothing', () => {
    const s = rich();
    s.sold = Object.fromEntries(Object.keys(MATERIALS).map((m) => [m, 999]));
    s.runesOpen = true;
    for (const id of [...Object.keys(ITEMS), ...Object.keys(EQUIPMENT).filter((e) => EQUIPMENT[e].price !== undefined)]) {
      const r = buy({ ...s, bag: [] }, id);
      expect(r.ok, id).toBe(true);
      if (r.ok) expect(gainedGathered(s, r.state), id).toEqual([]);
    }
    for (const [recipes, alt] of [[CONSUMABLE_RECIPES, false], [GATHER_RECIPES, true]] as const) {
      for (const id of Object.keys(recipes)) {
        const r = craftItem(s, id, 1, alt);
        expect(r.ok, id).toBe(true);
        if (r.ok) expect(gainedGathered(s, r.state), id).toEqual([]);
      }
    }
    const t1 = craftTool(s, 1);
    expect(t1.ok && gainedGathered(s, t1.state)).toEqual([]);
    for (const slot of GEAR_SLOTS) {
      const r = craftBase(s, slot);
      expect(r.ok, slot).toBe(true);
      if (!r.ok) continue;
      expect(gainedGathered(s, r.state), slot).toEqual([]);
      for (const rarity of RARITIES) {
        const t = structuredClone(r.state);
        t.bag[t.bag.length - 1].rarity = rarity;
        const d = dismantle(t, [t.bag[t.bag.length - 1].uid]);
        expect(d.ok, `${slot} ${rarity}`).toBe(true);
        if (d.ok) expect(gainedGathered(t, d.state), `${slot} ${rarity}`).toEqual([]);
      }
    }
    for (const from of Object.keys(FUSE_NEXT) as (keyof typeof FUSE_NEXT)[]) {
      const t = { ...structuredClone(s), bag: [1, 2, 3].map((uid) => ({ ...plainItem('moss-charm', uid), rarity: from })), nextUid: 10 };
      const r = fuse(t, [1, 2, 3]);
      expect(r.ok, from).toBe(true);
      if (r.ok) expect(gainedGathered(t, r.state), from).toEqual([]);
    }
    const set = craftSet(s, SETS['set-blaze'].pieces[0]);
    expect(set.ok && gainedGathered(s, set.state)).toEqual([]);
    for (const id of RUNE_STOCK) {
      const r = buyRune(s, { id, tier: 'common' });
      expect(r.ok, id).toBe(true);
      if (r.ok) expect(gainedGathered(s, r.state), id).toEqual([]);
    }
  });
});

describe('2. gather, craft, sell: no loop', () => {
  it('gather, craft, sell: no loop', () => {
    for (const id of Object.keys(GATHER_RECIPES)) {
      const s = rich();
      const r = craftItem(s, id, 1, true);
      expect(r.ok, id).toBe(true);
      if (!r.ok) continue;
      // what it took is worth something; what it made cannot be sold back
      expect(matValue(GATHER_RECIPES[id].mats) + GATHER_RECIPES[id].gold, id).toBeGreaterThan(0);
      expect(sell(r.state, id, 1), id).toEqual({ ok: false, reason: 'invalid' });
      const junk = sellJunk(r.state);
      expect(junk.ok && junk.state.inventory[id], id).toBe(r.state.inventory[id]);
    }
    // a tool is no item: nothing to sell, nothing in the inventory
    const s = rich();
    const t = craftTool(s, 1);
    expect(t.ok).toBe(true);
    if (t.ok) {
      expect(Object.keys(t.state.inventory).filter((k) => !(k in s.inventory))).toEqual([]);
      expect(sell(t.state, 'tool@1', 1)).toEqual({ ok: false, reason: 'invalid' });
    }
    // the gathered goods sell at their price, as any material, and only that
    for (const id of GATHERED) {
      const r = sell(rich(), id, 1);
      expect(r.ok, id).toBe(true);
      if (r.ok) expect(r.state.gold - rich().gold, id).toBe(MATERIALS[id].price);
    }
    // a spot's pin only spends: two spots fewer, the piece worth what it was
    for (const r of SPOT_REGIONS) {
      const spot = SPOT_OF[r];
      const g = rich();
      g.bag = [{ ...plainItem('moss-charm', 1), rarity: 'rare', ilvl: 20, affixes: [{ key: 'str', value: 5 }, { key: 'hp', value: 30 }, { key: 'spd', value: 2 }] }];
      g.nextUid = 100;
      const out = reroll(g, 1, 1, { swap: true, mat: spot });
      if (!out.ok) {
        expect(out.reason, spot).toBe('none');   // nothing of that group fits the piece: refused, nothing spent
        continue;
      }
      expect(out.state.inventory[spot], spot).toBe(g.inventory[spot] - 2);
      expect(gearValue(out.state.bag[0]), spot).toBe(gearValue(g.bag[0]));
    }
  });
});

describe('5. a floor has a ceiling', () => {
  it('a floor has a ceiling', () => {
    const s = newGame();
    s.gather = { tool: 1, got: {} };
    let worst = { value: 0, key: '' };
    for (const seed of SEEDS) for (const region of REGION_IDS) {
      const run = newRun(seed, region, 'plain', 1);
      run.gather = true;
      for (const d of DEPTHS) {
        const points = floorOf(run, d).contents.filter((c) => c.kind === 'gather');
        const value = points.reduce((t, c) => t + outcome(s, c, 'full', 0, { mod: 1, rate: [6, 12] }, d).qty * MATERIALS[c.gather!.item].price, 0);
        const key = `${seed}:${region}:${d}`;
        expect(value, key).toBeLessThanOrEqual(GATHER_FLOOR_CAP(d));
        if (value / GATHER_FLOOR_CAP(d) > worst.value) worst = { value: value / GATHER_FLOOR_CAP(d), key };
      }
    }
    // the cap is a guard rail, not the usual floor
    expect(worst.value).toBeGreaterThan(0);
    expect(worst.value).toBeLessThanOrEqual(1);
  }, SWEEP_MS);
});

describe("6. the board's rules hold for gathered goods (data; the full sweep is PR C)", () => {
  it("the board's rules hold for gathered goods", () => {
    const paid = new Set<string>();
    for (const d of DEPTHS) {
      for (const r of [REWARD.hunt(6, d), REWARD.sweep(d), REWARD.warden(d), REWARD.boss(d), REWARD.scout(d)]) for (const id of Object.keys(r.items ?? {})) paid.add(id);
    }
    for (const rank of RANKS) for (const id of Object.keys(rank.gift.items ?? {})) paid.add(id);
    expect(paid.size).toBeGreaterThan(0);
    for (const id of paid) expect(GATHERED.has(id), id).toBe(false);
    for (const id of GUILD_RUNES) expect(GATHERED.has(id), id).toBe(false);
    // no owner: never one of the board's excluded roster goods
    for (const id of GATHERED) expect(MATERIALS[id].owner, id).toBeUndefined();
  });
});

describe('8. the preview is the outcome, everywhere', () => {
  it('the preview is the outcome, everywhere', () => {
    const COMBOS: { condition: ConditionId; stealth: boolean }[] = [
      { condition: 'plain', stealth: false }, { condition: 'fog', stealth: false }, { condition: 'calm', stealth: false },
      { condition: 'plain', stealth: true }, { condition: 'fog', stealth: true }, { condition: 'calm', stealth: true },
    ];
    const g = Game.fresh(mulberry32(0x6a7e), null);
    for (const id of ['chizuru', 'liz', 'noel', 'sylvie'] as CharacterId[]) g.state.party = meet(g.state.party, id, 20);
    g.state.party.roster.liz.tree = { 'twin-slash': 1, stealth: 1 };
    const fieldGrid = [...g.state.party.grid];
    const benchedLiz = fieldGrid.map((id) => (id === 'liz' ? null : id));
    expect(g.state.party.grid.includes('sylvie')).toBe(false);   // a bench member: recruited, not on the field
    const party = g.state.party;
    // HP and TP that meet every edge of the toll: 1, low, high, 0 TP, a fallen member
    const base: Record<string, { hp: number; tp: number }> = {
      hero: { hp: 1, tp: 0 }, rin: { hp: 5, tp: 3 }, chizuru: { hp: statsOf(party.roster.chizuru).hp, tp: statsOf(party.roster.chizuru).tp },
      liz: { hp: 40, tp: 1 }, noel: { hp: 0, tp: 10 }, sylvie: { hp: 23, tp: statsOf(party.roster.sylvie).tp },
    };
    let checked = 0;
    /** Every mismatch, as words (one expect at the end: a million expects would take the sweep past its time). */
    const bad: string[] = [];
    for (const seed of SEEDS) for (const region of REGION_IDS) {
      const run = newRun(seed, region, 'plain', 1);
      run.gather = true;
      g.run = run;
      g.phase = 'map';
      for (const d of DEPTHS) {
        g.floor = d;
        const f = floorOf(run, d);
        for (const c of f.contents.filter((x) => x.kind === 'gather')) {
          const rule = ruleOf(c);
          for (const combo of COMBOS) for (const tool of [0, 1, 2] as const) for (const mode of ['light', 'full'] as const) {
            const key = () => `${seed}:${region}:${d} ${c.at.x},${c.at.y} ${combo.condition} ${combo.stealth} tool ${tool} ${mode}`;
            const miss = (what: string, got: unknown, want: unknown) => bad.push(`${key()} ${what}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
            // the trip's condition and stealth set the multiplier; the floor is the one made
            run.condition = combo.condition;
            party.grid = combo.stealth ? [...fieldGrid] : [...benchedLiz];
            const mod = (combo.stealth ? 0.5 : 1) * CONDITIONS[combo.condition].encounterMul;
            for (const [id, v] of Object.entries(base)) Object.assign(party.roster[id as CharacterId], v);
            if (hasPassive(party, 'encounterDown') !== combo.stealth) miss('stealth', !combo.stealth, combo.stealth);
            if (tool) g.state.gather = { tool, got: {} };
            else delete g.state.gather;
            run.loot.items = {};
            const from = (seed * 13 + d * 7 + c.at.x) % 100;
            g.encounter = from;
            g.pos = { ...c.at };
            const p = g.gatherPreview()![mode];
            const r = g.gather(mode);
            if (r.kind !== 'gathered') { miss('kind', r.kind, 'gathered'); continue; }
            // the goods, the gauge, the lamp
            if (run.loot.items[c.gather!.item] !== p.qty) miss('goods', run.loot.items[c.gather!.item], p.qty);
            if (p.gauge.from !== from || p.gauge.to !== g.encounter) miss('gauge', p.gauge, { from, to: g.encounter });
            if (p.danger.from !== danger(from) || p.danger.to !== danger(g.encounter)) miss('lamp', p.danger, [danger(from), danger(g.encounter)]);
            // the next step: the same multiplier and rate as walk(), and advance() at both ends agrees
            const rate = FLOORS[g.terrain() - 1].rate;
            if (p.next !== nextStep(g.encounter, { mod, rate })) miss('next', p.next, nextStep(g.encounter, { mod, rate }));
            const ends = [0, 0.999999].flatMap((gain) => [0, 0.999999].map((roll) => {
              const seq = [gain, roll];
              let i = 0;
              return advance(g.encounter, () => seq[i++ % 2], rate, mod).encounter;
            }));
            const endsOk = p.next === 'never' ? ends.every((e) => !e) : p.next === 'sure' ? ends.every((e) => e) : ends.some((e) => e);
            if (!endsOk) miss(`advance ends (${p.next})`, ends, p.next);
            // the land's toll on each recruited member, bench included, the fallen untouched
            const n = rule?.hurt ? spotHurt(rule.hurt, d) : 0;
            for (const id of party.recruited) {
              const was = base[id], m = party.roster[id];
              const hp = was.hp > 0 && rule?.hurt ? Math.max(1, was.hp - n) : was.hp;
              const tp = was.hp > 0 && rule?.tp ? was.tp - Math.min(was.tp, Math.floor((statsOf(m).tp * POISON_TP_LOSS_PCT) / 100)) : was.tp;
              if (m.hp !== hp || m.tp !== tp) miss(`${id} hp/tp`, [m.hp, m.tp], [hp, tp]);
              const toll = p.toll?.[id] ?? {};
              const want = was.hp > 0 && rule?.hurt ? { hp: was.hp - hp } : was.hp > 0 && rule?.tp ? { tp: was.tp - tp } : {};
              if (JSON.stringify(toll) !== JSON.stringify(want)) miss(`${id} toll`, toll, want);
            }
            // the point back, for the next way of gathering it
            f.contents.push(c);
            f.map.tiles[c.at.y][c.at.x] = 'gather';
            checked++;
          }
        }
      }
    }
    expect(bad.slice(0, 20), `${bad.length} mismatches`).toEqual([]);
    expect(checked).toBeGreaterThan(SEEDS.length * REGION_IDS.length * DEPTHS.length * 36);
  }, SWEEP_MS);
});
