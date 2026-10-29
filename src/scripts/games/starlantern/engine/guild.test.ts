import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../data/enemies';
import { MATERIALS } from '../data/materials';
import { REGIONS, type RegionId } from '../data/regions';
import { DELIVER_GIVER, DELIVER_KINDS, GUILD_MAX, GUILD_RUNES, HUNT_N, KIND_GIVER, MERIT, RANKS, REWARD, SWEEP_N, deliverQty, runeTierAt } from '../data/guild';
import { ROSTER_LIVE, TREASURE } from '../data/monsters';
import { MEETINGS } from '../data/meetings';
import { RUNES, RUNE_IDS, RUNE_STACK } from '../data/runes';
import { RUNE_SELL, RUNE_STOCK } from '../data/runeEconomy';
import { SHARD_IDS } from '../data/story/fragments';
import {
  abandon, accept, bountyExcluded, bountyLine, bountyPool, deliverPool, excluded, huntExcluded, huntPool, knownMaterial, natives, postBoard,
  progressOf, questDepth, questSnapshot, questsNewlyDone, rankOf, rankUps, remarkFor, scoutPool, sweepPool, turnIn,
} from './guild';
import { grantRune } from './loot/runes';
import { activeIds, meet } from './party';
import { withGuildLive, withRosterOnly } from './testing';
import { dayOf } from './calendar';
import type { QuestOffer } from './state';
import { MAX_REACHED } from './levels';
import { newGame, type GameState } from './state';

const ALL_REGIONS = Object.keys(REGIONS) as RegionId[];
const LANDS = ALL_REGIONS.filter((r) => r !== 'mainline');

/** A new game whose bestiary holds `ids` seen once and felled `felled` times. */
function withBook(ids: readonly string[], felled = 0, s: GameState = newGame()): GameState {
  s.bestiary = { ...s.bestiary, ...Object.fromEntries(ids.map((id) => [id, { seen: 1, felled }])) };
  return s;
}
function reachedAll(s: GameState, d: number): GameState {
  for (const r of ALL_REGIONS) s.dungeon.reached[r] = d;
  return s;
}
const everyone = Object.keys(ENEMIES);

/** Roster plan ruling 6: the thirteen remnants of a person. */
const REMNANTS = [
  'hollow-hunter', 'bell-watcher', 'keeper-echo', 'mirage-dancer', 'frozen-pilgrim', 'hush-acolyte', 'debt-collector', 'fallen-knight',
  'banner-bearer', 'bell-warden', 'mirage-lead', 'hollow-champion', 'last-commander',
];
/** Spec §5.5 (review H1): the goods of the excluded, 16 signature materials and 9 trophies. */
const EXCLUDED_GOODS = [
  'hollow-buckle', 'grey-cord', 'old-cog', 'lantern-ash', 'mirage-sequin', 'scorpion-stinger', 'komainu-fang', 'prayer-rope', 'blue-ember',
  'torn-page', 'carved-bark', 'hush-bell', 'vault-lock', 'iou-slip', 'knight-crest', 'red-pennant',
  'hundred-hilts', 'mother-light', 'storm-glass', 'mirage-brick', 'rift-ice', 'starfire-core', 'blight-ash', 'titan-hide', 'commander-medal',
];
/** Spec §5.3, the 「進得了懸賞」 column, in the table's order. */
const BOUNTY_TABLE = [
  'fog-warden', 'silent-bell', 'old-city-archon', 'gorged-beast', 'forgotten-festival', 'starless-whale', 'stopped-clock', 'first-lantern',
  'ember-tyrant', 'rime-sovereign', 'white-silence', 'thunder-roc', 'storm-conductor', 'mire-hydra', 'bog-leviathan', 'faceless-host',
  'vault-dragon', 'shadow-parade', 'fortress-colossus', 'requiem-conductor', 'lantern-brood',
];

/** Everything seen and felled, every region reached to `d`. */
const seenAll = (d = 60, felled = 1) => reachedAll(withBook(everyone, felled), d);

describe('guild pools: only what the party has seen (guild quests plan Task A2)', () => {
  it('a new game offers nothing to hunt', () => {
    const s = newGame();
    expect(huntPool(s)).toEqual([]);
    expect(sweepPool(s)).toEqual([]);
    for (let r = 0; r < RANKS.length; r++) expect(bountyPool(s, r)).toEqual([]);
    expect(deliverPool(s)).toEqual([]);
    expect(scoutPool(s)).toEqual([{ region: 'mainline', cap: 29 }]);
  });

  it('only what was seen', () => {
    // seen and felled in every mix: the hunt and the bounty read `seen`, the delivery what was felled
    const s = reachedAll(newGame(), 1);
    s.dungeon.reached.mainline = 12;
    s.bestiary = {
      slime: { seen: 1, felled: 0 }, bat: { seen: 3, felled: 2 }, 'paper-moth': { seen: 0, felled: 0 }, 'root-hound': { seen: 2, felled: 1 },
      'fog-warden': { seen: 1, felled: 0 }, 'silent-bell': { seen: 1, felled: 1 }, 'hollow-champion': { seen: 1, felled: 1 },
      'bell-watcher': { seen: 1, felled: 1 }, hoarder: { seen: 1, felled: 1 },
    };
    expect(huntPool(s)).toEqual(['slime', 'bat', 'root-hound']);
    expect(bountyPool(s, 1)).toEqual(['fog-warden', 'silent-bell']);
    expect(bountyPool(s, 0)).toEqual([]);   // a novice posts no bounty
    const goods = deliverPool(s);
    expect(goods).toEqual(Object.keys(MATERIALS).filter((id) => knownMaterial(s, id)));
    // what bat, root-hound, the silent bell and the treasure rat (no hunt, but its goods are fair) drop; nothing of slime's
    // (seen, not felled) or the remnants'
    const dropped = new Set(['bat', 'root-hound', 'silent-bell', 'hoarder'].flatMap((id) => ENEMIES[id].drops.map((d) => d.mat)));
    expect(goods.length).toBeGreaterThan(0);
    for (const id of goods) expect(dropped.has(id), id).toBe(true);
    for (const d of ENEMIES.slime.drops) if (!dropped.has(d.mat)) expect(goods).not.toContain(d.mat);
  });

  it("remnants and companions' pasts never come up", () => {
    const s = seenAll();
    for (const id of REMNANTS) expect(ENEMIES[id].remnant, id).toBe(true);
    expect(everyone.filter((id) => ENEMIES[id].remnant)).toHaveLength(13);
    const shut = (id: string) => !!(ENEMIES[id].remnant || ENEMIES[id].lore || ENEMIES[id].story || ENEMIES[id].rank === 'part' || id === 'lantern-mother');
    const pools = [...huntPool(s), ...bountyPool(s, 4), ...sweepPool(s).flatMap((r) => natives(r))];
    expect(pools.length).toBeGreaterThan(40);
    for (const id of pools) expect(shut(id), id).toBe(false);
    for (const id of [...REMNANTS, 'lantern-mother', 'scarlet-foe', 'archon-hand', 'rime-pillar', 'false-moon', 'sandstorm-maw']) {
      expect(excluded(id), id).toBe(true);
      expect(pools, id).not.toContain(id);
    }
  });

  it('the lantern-eater is nobody\'s bounty', () => {
    const s = seenAll(30);
    expect(s.bestiary!.lanterneater.seen).toBe(1);
    for (let r = 0; r < RANKS.length; r++) expect(bountyPool(s, r)).not.toContain('lanterneater');
    expect(bountyExcluded('lanterneater')).toBe(true);
    expect(excluded('lanterneater')).toBe(false);
  });

  it('treasure rats are luck, not work', () => {
    const s = seenAll();
    expect([...TREASURE]).toEqual(['hoarder', 'gilded-hoarder']);
    for (const id of TREASURE) {
      expect(huntPool(s)).not.toContain(id);
      expect(huntExcluded(id)).toBe(true);
      expect(excluded(id)).toBe(false);
    }
  });

  it('goods from the excluded never come up', () => {
    const s = seenAll(10);
    const goods = deliverPool(s);
    for (const id of EXCLUDED_GOODS) {
      expect(MATERIALS[id], id).toBeDefined();
      expect(goods, id).not.toContain(id);
      expect(knownMaterial(s, id), id).toBe(false);
    }
    // the same set, from the data: an excluded owner, or only excluded droppers
    const fromData = Object.keys(MATERIALS).filter((id) => {
      const m = MATERIALS[id];
      if (!DELIVER_KINDS.includes(m.kind)) return false;
      if (m.owner && excluded(m.owner)) return true;
      const by = everyone.filter((e) => ENEMIES[e].drops.some((d) => d.mat === id));
      return by.length > 0 && by.every(excluded);
    });
    expect(fromData).toEqual(EXCLUDED_GOODS);
    // and everything else that may be asked for is known once all is felled
    expect(goods.length + EXCLUDED_GOODS.length).toBe(Object.values(MATERIALS).filter((m) => DELIVER_KINDS.includes(m.kind)).length);
  });

  it('a bounty waits for the road', () => {
    // a boss: the fog warden at main road depth 5; a warden: the requiem conductor at 23; a region boss at 5 and 10
    const s = withBook(['fog-warden', 'requiem-conductor', 'rime-sovereign', 'white-silence']);
    s.dungeon.reached.mainline = 4;
    s.dungeon.reached.frost = 9;
    expect(bountyPool(s, 1)).toEqual(['rime-sovereign']);
    s.dungeon.reached.mainline = 5;
    s.dungeon.reached.frost = 10;
    expect(bountyPool(s, 1)).toEqual(['fog-warden', 'rime-sovereign', 'white-silence']);
    s.dungeon.reached.mainline = 22;
    expect(bountyPool(s, 1)).not.toContain('requiem-conductor');
    s.dungeon.reached.mainline = 23;
    expect(bountyPool(s, 1)).toEqual(['fog-warden', 'rime-sovereign', 'white-silence', 'requiem-conductor']);
  });

  it('every lamp has work', () => {
    // a typical first-lamp player: main road 8, the frost 5; the old foes and the road's B band seen, the fog warden, the
    // permafrost and two frost natives
    const oneLamp = () => {
      const old = ['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade'];
      const bandB = everyone.filter((id) => ENEMIES[id].band === 'B');
      const s = withBook([...old, ...bandB, 'fog-warden', 'rime-sovereign', 'frost-doll', 'snow-caller'], 1);
      s.dungeon.reached.mainline = 8;
      s.dungeon.reached.frost = 5;
      return s;
    };
    const twoLamps = () => {
      const s = oneLamp();
      s.dungeon.reached.mainline = 20;
      s.dungeon.reached.storm = 10;
      return s;
    };
    const has = (s: GameState, rank: number, kind: string): boolean => ({
      hunt: huntPool(s).length, sweep: sweepPool(s).length, bounty: bountyPool(s, rank).length, scout: scoutPool(s).length, deliver: deliverPool(s).length,
    } as Record<string, number>)[kind] > 0;
    for (let r = 0; r < RANKS.length; r++) {
      const s = r <= 1 ? oneLamp() : twoLamps();
      for (const k of RANKS[r].kinds) expect(has(s, r, k), `${RANKS[r].id} ${k}`).toBe(true);
    }
    expect(bountyPool(oneLamp(), 1)).toEqual(['fog-warden', 'rime-sovereign']);
  });

  it("the bounty table is the spec's", () => {
    expect(bountyPool(seenAll(), 1)).toEqual(BOUNTY_TABLE);
    expect(bountyPool(seenAll(), 4)).toEqual(BOUNTY_TABLE);
  });

  it('a sweep needs two natives seen and the fourth floor', () => {
    const s = withBook(['frost-doll']);
    s.dungeon.reached.frost = 4;
    expect(sweepPool(s)).toEqual([]);   // one native seen
    withBook(['snow-caller'], 0, s);
    expect(sweepPool(s)).toEqual(['frost']);
    s.dungeon.reached.frost = 3;
    expect(sweepPool(s)).toEqual([]);   // not the fourth floor
    // a remnant or a companion's past is no native (ice-komainu has lore; frozen-pilgrim is a remnant)
    const t = withBook(['frost-doll', 'ice-komainu', 'frozen-pilgrim']);
    t.dungeon.reached.frost = 8;
    expect(sweepPool(t)).toEqual([]);
    expect(natives('frost')).toEqual(['frost-doll', 'glacier-tortoise', 'snow-caller']);
    // the shade's two natives, both seen
    const u = withBook(['mirror-thief', 'veil-stalker']);
    u.dungeon.reached.shade = 4;
    expect(sweepPool(u)).toEqual(['shade']);
    expect(LANDS.map((r) => natives(r).length)).toEqual([3, 3, 3, 4, 2, 3]);
    // the main road is never swept
    const all = seenAll();
    expect(sweepPool(all)).toEqual(LANDS);
  });

  it('a scout stops short of the finale', () => {
    const s = newGame();
    s.dungeon.reached.mainline = 27;
    expect(scoutPool(s)).toEqual([{ region: 'mainline', cap: 29 }]);
    s.dungeon.reached.mainline = 29;
    expect(scoutPool(s)).toEqual([]);   // no depth past 29 before the finale
    s.story.finaleCleared = true;
    s.story.act1Cleared = true;
    expect(scoutPool(s)).toEqual([{ region: 'mainline', cap: MAX_REACHED }]);
    // a region needs to have been gone into (depth 2); one at MAX_REACHED is done
    s.dungeon.reached.iron = 2;
    s.dungeon.reached.blaze = MAX_REACHED;
    expect(scoutPool(s)).toEqual([{ region: 'mainline', cap: MAX_REACHED }, { region: 'iron', cap: MAX_REACHED }]);
  });

  it('delivered goods are only dropped goods', () => {
    const goods = deliverPool(seenAll());
    expect(goods.length).toBeGreaterThan(40);
    for (const id of goods) expect(DELIVER_KINDS, id).toContain(MATERIALS[id].kind);
    // a region's material is known once the region is gone into, felled or not
    const s = newGame();
    s.dungeon.reached.frost = 2;
    expect(deliverPool(s)).toEqual(['frost-heart']);
    s.dungeon.reached.frost = 1;
    expect(deliverPool(s)).toEqual([]);
  });

  it('quest depth', () => {
    const s = newGame();
    expect(['slime', 'shade', 'paper-moth', 'tongueless-bell', 'old-city-sentinel', 'wick-shade', 'music-box', 'frost-doll', 'herald-engine'].map((id) => questDepth('hunt', id, s)))
      .toEqual([2, 2, 4, 10, 16, 25, 31, 4, 4]);
    expect(['fog-warden', 'silent-bell', 'first-lantern', 'ember-tyrant', 'white-silence', 'bog-leviathan', 'requiem-conductor', 'lantern-brood'].map((id) => questDepth('bounty', id, s)))
      .toEqual([5, 10, 50, 5, 10, 15, 23, 28]);
    s.dungeon.reached.frost = 12;
    s.dungeon.reached.iron = 45;
    expect(questDepth('sweep', 'frost', s)).toBe(12);
    expect(questDepth('sweep', 'iron', s)).toBe(30);
    expect(questDepth('scout', 'frost', s, 17)).toBe(17);
  });

  it('the pools are in table order', () => {
    const s = seenAll();
    expect(huntPool(s)).toEqual(huntPool(s));
    expect(huntPool(s)).toEqual(everyone.filter((id) => huntPool(s).includes(id)));
    expect(deliverPool(s)).toEqual(Object.keys(MATERIALS).filter((id) => deliverPool(s).includes(id)));
    expect(sweepPool(s)).toEqual(ALL_REGIONS.filter((r) => sweepPool(s).includes(r)));
    expect(scoutPool(s).map((x) => x.region)).toEqual(LANDS);   // the main road, past 29 before the finale, is not scouted
    expect(huntPool(s)).toHaveLength(49);
  });
});

/** `s` at rank `r` (its merit at the rank's threshold, the gifts paid), with an old board of day 0. */
function atRank(s: GameState, r: number): GameState {
  s.guild = { day: 0, offers: [], active: [], merit: RANKS[r].merit, paid: r };
  return s;
}
const same = (o: QuestOffer) => `${o.kind}:${o.target}`;
const shape = (s: GameState) => s.guild!.offers.map((o) => [o.kind, o.target, o.n]);
const SHARD_ITEMS = new Set(Object.values(SHARD_IDS));
const OLD = ['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade'];
/** Every offer's reward but its shards and rune, from the formulas (plan ruling 5, spec §6.1). */
function formula(o: QuestOffer): { gold: number; items?: Record<string, number> } {
  switch (o.kind) {
    case 'hunt': return REWARD.hunt(o.n, o.depth);
    case 'sweep': return REWARD.sweep(o.depth);
    case 'bounty': return bountyLine(o.target)!.warden ? REWARD.warden(o.depth) : REWARD.boss(o.depth);
    case 'scout': return REWARD.scout(o.n);
    case 'deliver': return REWARD.deliver(o.n, MATERIALS[o.target].price);
  }
}
const withoutDrawn = (o: QuestOffer) => {
  const items = Object.fromEntries(Object.entries(o.reward.items ?? {}).filter(([id]) => !SHARD_ITEMS.has(id)));
  return Object.keys(items).length ? { gold: o.reward.gold, items } : { gold: o.reward.gold };
};

describe('the guild posts its board from a stream of its own (guild quests plan Task A3)', () => {
  it('one day, one board', () => {
    const s = atRank(seenAll(12), 1);
    s.story.day = 7;
    const a = postBoard(s);
    expect(a.guild!.day).toBe(7);
    expect(postBoard(s)).toEqual(a);
    expect(postBoard(a)).toBe(a);   // the same day again: as it is
    expect(s.guild!.day).toBe(0);   // `s` itself is left alone
    // another day, another board: in at least 99% of a thousand games
    let differ = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const t = atRank(seenAll(12), 1);
      t.forgeSalt = seed * 7919 + 1;
      t.story.day = 7;
      const d7 = shape(postBoard(t));
      t.story.day = 8;
      if (JSON.stringify(d7) !== JSON.stringify(shape(postBoard(t)))) differ++;
    }
    expect(differ).toBeGreaterThanOrEqual(990);
  });

  it('the board keeps what was taken', () => {
    const s = atRank(seenAll(12), 1);
    s.story.day = 3;
    const first = postBoard(s);
    const taken = { ...first.guild!.offers[1], base: 0 };
    first.guild!.active = [taken];
    first.guild!.offers = first.guild!.offers.filter((o) => o.id !== taken.id);
    first.story.day = 4;
    const next = postBoard(first);
    expect(next.guild!.active).toEqual([taken]);
    expect(next.guild!.day).toBe(4);
    expect(next.guild!.offers.length).toBeGreaterThan(0);
    expect(next.guild!.offers.every((o) => o.id.startsWith('4:'))).toBe(true);
    expect(next.guild!.merit).toBe(first.guild!.merit);
    // no board yet: the first one starts the record
    const fresh = postBoard(seenAll(12));
    expect({ ...fresh.guild!, offers: [] }).toEqual({ day: dayOf(fresh), offers: [], active: [], merit: 0, paid: 0 });
  });

  it('the first slot is a bounty from the first lamp', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = atRank(seenAll(12), 1);
      s.forgeSalt = seed;
      expect(postBoard(s).guild!.offers[0].kind).toBe('bounty');
      const n = atRank(seenAll(12), 0);
      n.forgeSalt = seed;
      expect(postBoard(n).guild!.offers.some((o) => o.kind === 'bounty' || o.kind === 'sweep')).toBe(false);
    }
  });

  it('two bounties at four lamps', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = atRank(seenAll(30), 4);
      s.forgeSalt = seed;
      const b = postBoard(s).guild!.offers;
      expect([b[0].kind, b[1].kind]).toEqual(['bounty', 'bounty']);
      expect(b[0].target).not.toBe(b[1].target);
    }
  });

  it('no twice the same', () => {
    for (let seed = 0; seed < 500; seed++) {
      const s = atRank(seenAll(12), seed % 5);
      s.forgeSalt = seed;
      const b = postBoard(s).guild!.offers;
      expect(new Set(b.map(same)).size).toBe(b.length);
      expect(new Set(b.map((o) => o.id)).size).toBe(b.length);
    }
  });

  it('as many as the rank allows', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (let r = 0; r < RANKS.length; r++) {
        const s = atRank(seenAll(12), r);
        s.forgeSalt = seed;
        expect(postBoard(s).guild!.offers.length).toBeLessThanOrEqual(RANKS[r].offers);
      }
      // a new game has only the main road to scout: one note, the other slots left empty, nothing put in their place
      const n = newGame();
      n.forgeSalt = seed;
      expect(postBoard(n).guild!.offers.map(same)).toEqual(['scout:mainline']);
    }
  });

  it('a thousand boards spoil nothing', () => {
    const scenarios: [string, () => GameState][] = [
      ['just unlocked', () => {
        const s = withBook(['slime', 'bat', 'lanterneater'], 1);
        s.dungeon.reached.mainline = 3;
        s.story.act1Cleared = true;
        return s;
      }],
      ['only the old foes', () => reachedAll(withBook([...OLD, 'lanterneater'], 2), 9)],
      ['half seen', () => reachedAll(withBook(everyone.filter((_, i) => i % 2 === 0), 1), 20)],
      ['all seen', () => seenAll(45)],
    ];
    const excludedGoods = new Set(EXCLUDED_GOODS);
    let bounties = 0, runes = 0;
    for (const [name, make] of scenarios) {
      for (let seed = 0; seed < 1000; seed++) {
        const r = seed % RANKS.length;
        const s = atRank(make(), r);
        s.forgeSalt = (seed * 2654435761) >>> 0;
        if (seed % 2) s.runesOpen = true;
        const pools = { hunt: huntPool(s), sweep: sweepPool(s), bounty: bountyPool(s, r), scout: scoutPool(s).map((c) => c.region), deliver: deliverPool(s) };
        for (const o of postBoard(s).guild!.offers) {
          const at = `${name} #${seed} ${same(o)}`;
          expect(RANKS[r].kinds, at).toContain(o.kind);
          expect((pools[o.kind] as string[]).includes(o.target), at).toBe(true);
          if (o.kind === 'deliver') {
            expect(knownMaterial(s, o.target), at).toBe(true);
            expect(excludedGoods.has(o.target), at).toBe(false);
          }
          if (o.kind === 'hunt') expect(huntExcluded(o.target), at).toBe(false);
          if (o.kind === 'bounty') {
            bounties++;
            expect(bountyExcluded(o.target), at).toBe(false);
            const shards = Object.entries(o.reward.items ?? {}).filter(([id]) => SHARD_ITEMS.has(id));
            expect(shards.reduce((t, [, n]) => t + n, 0), at).toBe(2);
          } else {
            expect(Object.keys(o.reward.items ?? {}).some((id) => SHARD_ITEMS.has(id)), at).toBe(false);
          }
          if (o.reward.rune) {
            runes++;
            expect(o.kind, at).toBe('bounty');
            expect(r >= 2 && !!s.runesOpen, at).toBe(true);
            const [id, tier] = o.reward.rune.split('@');
            expect(GUILD_RUNES as readonly string[], at).toContain(id);
            expect(tier, at).toBe(runeTierAt(o.depth));
          } else if (o.kind === 'bounty') {
            expect(r >= 2 && !!s.runesOpen, at).toBe(false);
          }
        }
      }
    }
    expect(bounties).toBeGreaterThan(1000);
    expect(runes).toBeGreaterThan(300);
  });

  it('rewards are written on the note', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const s = atRank(seenAll(18), seed % 5);
      s.forgeSalt = seed;
      s.story.day = seed + 1;
      for (const o of postBoard(s).guild!.offers) {
        kinds.add(o.kind);
        expect(withoutDrawn(o), same(o)).toEqual(formula(o));
        expect(o.variant).toBe((seed + 1) % 2);
        expect(o.giver).toBe(o.kind === 'deliver' ? DELIVER_GIVER[MATERIALS[o.target].kind as 'monster'] : KIND_GIVER[o.kind]);
        const e = ENEMIES[o.target];
        const n = o.kind === 'hunt' ? (OLD.includes(o.target) ? HUNT_N.old : e.band ? HUNT_N[e.band] : HUNT_N.native)
          : o.kind === 'sweep' ? SWEEP_N : o.kind === 'bounty' ? 1
          : o.kind === 'deliver' ? deliverQty(MATERIALS[o.target].price, MATERIALS[o.target].kind as 'monster') : o.n;
        expect(o.n, same(o)).toBe(n);
        expect(o.depth, same(o)).toBe(questDepth(o.kind, o.target, s, o.n));
        if (o.kind === 'scout') {
          const reached = s.dungeon.reached[o.target as RegionId];
          // D = reached + k, k in 3..5, never past the cap (29 on the main road before the finale)
          expect(o.n - reached, same(o)).toBeGreaterThanOrEqual(o.target === 'mainline' ? 1 : 3);
          expect(o.n - reached, same(o)).toBeLessThanOrEqual(5);
          if (o.target === 'mainline') expect(o.n).toBeLessThanOrEqual(29);
        }
        expect(o.merit).toBe(o.kind === 'bounty' ? (bountyLine(o.target)!.warden ? MERIT.warden : MERIT.boss) : MERIT[o.kind]);
      }
    }
    expect([...kinds].sort()).toEqual(['bounty', 'deliver', 'hunt', 'scout', 'sweep']);
  });

  it('GUILD_RUNES are real runes', () => {
    expect(GUILD_RUNES).toEqual(RUNE_IDS.filter((id) => RUNES[id].group !== 'legendary' && !RUNE_STOCK.includes(id)));
    expect(GUILD_RUNES).toHaveLength(22);
    for (const id of GUILD_RUNES) {
      expect(RUNES[id], id).toBeDefined();
      expect(RUNES[id].group).not.toBe('legendary');
      expect(RUNE_STOCK).not.toContain(id);
    }
  });
});

/** An open board (the act cleared) holding `offers`, at rank `r`. */
function boardWith(offers: QuestOffer[], r = 0, s: GameState = seenAll(12, 0)): GameState {
  s.story.act1Cleared = true;
  s.guild = { day: dayOf(s), offers, active: [], merit: RANKS[r].merit, paid: r };
  return s;
}
let nth = 0;
const offer = (kind: QuestOffer['kind'], target: string, n: number, extra: Partial<QuestOffer> = {}): QuestOffer => ({
  id: `1:${nth++}`, kind, giver: kind === 'deliver' ? 'orik' : KIND_GIVER[kind], variant: 0, target, n, depth: 4,
  reward: { gold: 100, items: { 'essence-magic': 1 } }, merit: 2, ...extra,
});
const ok = <R extends { ok: boolean }>(r: R): Extract<R, { ok: true }> => {
  expect(r.ok).toBe(true);
  return r as Extract<R, { ok: true }>;
};
const live = <T>(f: () => T): T => withGuildLive(f);
const fell = (s: GameState, id: string, n: number) => { s.bestiary![id] = { seen: Math.max(1, s.bestiary![id]?.seen ?? 0), felled: (s.bestiary![id]?.felled ?? 0) + n }; };

describe('take, track, drop and turn in guild quests; the lamp ranks (guild quests plan Task A4)', () => {
  it('accepting records where the count stood', () => live(() => {
    const s = boardWith([offer('hunt', 'slime', 6), offer('hunt', 'bat', 6), offer('sweep', 'frost', 8), offer('bounty', 'fog-warden', 1)], 1);
    s.bestiary!.slime.felled = 3;
    delete s.bestiary!.bat;
    s.bestiary!['frost-doll'].felled = 2;
    s.bestiary!['snow-caller'].felled = 1;
    s.bestiary!['frozen-pilgrim'].felled = 9;   // a remnant: no native of the sweep
    s.bestiary!['fog-warden'].felled = 1;
    const [a, b, c, d] = s.guild!.offers.map((o) => o.id);
    const t1 = ok(accept(s, a)).state;
    expect(t1.guild!.active).toEqual([{ ...s.guild!.offers[0], base: 3 }]);
    expect(t1.guild!.offers.map((o) => o.id)).toEqual([b, c, d]);
    const t2 = ok(accept(t1, b)).state;
    expect(t2.guild!.active[1].base).toBe(0);   // no record yet: 0
    const t3 = ok(accept(t2, c)).state;
    expect(t3.guild!.active[2]).toEqual({ ...s.guild!.offers[2], base: 3, ids: ['frost-doll', 'glacier-tortoise', 'snow-caller'] });
    expect(t3.guild!.offers.map((o) => o.id)).toEqual([d]);
    // the scout and the delivery read the state as it is: no count to start from
    const u = boardWith([offer('scout', 'mainline', 9), offer('deliver', 'moss', 5)]);
    const u2 = ok(accept(ok(accept(u, u.guild!.offers[0].id)).state, u.guild!.offers[1].id)).state;
    expect(u2.guild!.active.map((q) => q.base)).toEqual([0, 0]);
    expect(u2.guild!.active.some((q) => 'ids' in q)).toBe(false);
  }));

  it('the cap holds', () => live(() => {
    const s = boardWith([offer('hunt', 'slime', 6), offer('hunt', 'bat', 6), offer('hunt', 'wolf', 6), offer('hunt', 'beetle', 6)]);
    let t = s;
    for (const o of s.guild!.offers.slice(0, 3)) t = ok(accept(t, o.id)).state;
    expect(accept(t, s.guild!.offers[3].id)).toEqual({ ok: false, reason: 'full' });
    t.guild!.merit = RANKS[3].merit;   // three lamps hold four
    expect(ok(accept(t, s.guild!.offers[3].id)).state.guild!.active).toHaveLength(4);
    expect(accept(t, 'nope')).toEqual({ ok: false, reason: 'invalid' });
  }));

  it('progress reads the state', () => live(() => {
    const s = boardWith([offer('hunt', 'slime', 6), offer('sweep', 'frost', 8), offer('bounty', 'fog-warden', 1), offer('deliver', 'moss', 5)], 3);
    let t = s;
    for (const o of s.guild!.offers) t = ok(accept(t, o.id)).state;
    // a fifth, the scout, read on the same state (no more than four are ever held)
    t.dungeon.reached.frost = 4;
    const scout = { ...offer('scout', 'frost', 9), base: 0 };
    const [hunt, sweep, bounty, deliver] = t.guild!.active;
    expect([...t.guild!.active, scout].map((q) => progressOf(t, q))).toEqual([
      { have: 0, need: 6, done: false }, { have: 0, need: 8, done: false }, { have: 0, need: 1, done: false },
      { have: 0, need: 5, done: false }, { have: 4, need: 9, done: false },
    ]);
    fell(t, 'slime', 6);
    fell(t, 'frost-doll', 5);
    fell(t, 'glacier-tortoise', 3);
    fell(t, 'fog-warden', 1);
    t.dungeon.reached.frost = 9;
    t.inventory.moss = 7;
    expect([hunt, sweep, bounty, scout, deliver].map((q) => progressOf(t, q).done)).toEqual([true, true, true, true, true]);
    expect(progressOf(t, sweep).have).toBe(8);
    t.inventory.moss = 4;   // fewer goods, less progress
    expect(progressOf(t, deliver)).toEqual({ have: 4, need: 5, done: false });
  }));

  it('a sweep counts only the frozen kinds', () => live(() => {
    // the snow caller goes live only after the sweep is taken: it is not on the frozen list and does not count
    const s = boardWith([offer('sweep', 'frost', 8)]);
    const t = withRosterOnly([...ROSTER_LIVE].filter((id) => id !== 'snow-caller'), () => ok(accept(s, s.guild!.offers[0].id)).state);
    const q = t.guild!.active[0];
    expect(q.ids).toEqual(['frost-doll', 'glacier-tortoise']);
    fell(t, 'snow-caller', 8);
    fell(t, 'frozen-pilgrim', 8);
    fell(t, 'ice-komainu', 8);
    expect(progressOf(t, q)).toEqual({ have: 0, need: 8, done: false });
    fell(t, 'frost-doll', 8);
    expect(progressOf(t, q).done).toBe(true);
  }));

  it('turning in pays what the note said', () => live(() => {
    const s = boardWith([
      offer('bounty', 'fog-warden', 1, { reward: { gold: 300, items: { 'ancient-gear': 1, 'shard-clear': 1, 'shard-dim': 1 }, rune: 'focus@magic' }, merit: 6 }),
      offer('deliver', 'moss', 5, { reward: { gold: 48 }, merit: 2 }),
    ], 2);
    s.gold = 1000;
    s.inventory.moss = 7;
    s.sold.moss = 3;
    let t = ok(accept(s, s.guild!.offers[0].id)).state;
    t = ok(accept(t, s.guild!.offers[1].id)).state;
    fell(t, 'fog-warden', 1);
    const r = ok(turnIn(t, t.guild!.active[0].id));
    expect(r.reward).toEqual(t.guild!.active[0].reward);
    expect(r.state.gold).toBe(1300);
    expect([r.state.inventory['ancient-gear'], r.state.inventory['shard-clear'], r.state.inventory['shard-dim']]).toEqual([1, 1, 1]);
    expect(r.state.runes!['focus@magic']).toBe(1);
    expect(r.runeGold).toBe(0);
    expect(r.state.guild!.merit).toBe(RANKS[2].merit + 6);
    expect(r.state.guild!.active.map((q) => q.kind)).toEqual(['deliver']);
    const d = ok(turnIn(r.state, r.state.guild!.active[0].id));
    expect(d.state.inventory.moss).toBe(2);   // five handed over
    expect(d.state.sold.moss).toBe(3);   // not a sale to the shop
    expect(d.state.gold).toBe(1348);
    expect(d.state.guild!.active).toEqual([]);
    expect(d.state.guild!.merit).toBe(RANKS[2].merit + 8);
  }));

  it('not done, not paid', () => live(() => {
    const s = boardWith([offer('hunt', 'slime', 6), offer('deliver', 'moss', 5)]);
    let t = ok(accept(s, s.guild!.offers[0].id)).state;
    t = ok(accept(t, s.guild!.offers[1].id)).state;
    t.inventory.moss = 4;
    expect(turnIn(t, t.guild!.active[0].id)).toEqual({ ok: false, reason: 'invalid' });
    expect(turnIn(t, t.guild!.active[1].id)).toEqual({ ok: false, reason: 'stock' });
    expect(turnIn(t, 'nope')).toEqual({ ok: false, reason: 'invalid' });
    expect(abandon(t, 'nope')).toEqual({ ok: false, reason: 'invalid' });
  }));

  it('ranks and gifts', () => live(() => {
    expect([0, 11, 12, 39, 40, 99, 100, 199, 200, 1e9].map(rankOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(rankUps(10, 12)).toEqual([1]);
    expect(rankUps(11, 41)).toEqual([1, 2]);
    expect(rankUps(12, 39)).toEqual([]);
    const done = (merit: number, at: number) => {
      const s = boardWith([offer('scout', 'mainline', 2, { reward: { gold: 10 }, merit })]);
      s.guild!.merit = at;
      s.guild!.paid = rankOf(at);
      s.gold = 0;
      return ok(turnIn(ok(accept(s, s.guild!.offers[0].id)).state, s.guild!.offers[0].id));
    };
    const one = done(2, 10);
    expect(one.rankUps).toEqual([1]);
    expect(one.state.guild!.paid).toBe(1);
    expect(one.state.gold).toBe(310);
    expect(one.state.inventory['return-lamp']).toBe(1 + 2);   // the new game's one and the gift's two
    const two = done(30, 11);
    expect(two.rankUps).toEqual([1, 2]);
    expect(two.state.guild!.paid).toBe(2);
    expect(two.state.gold).toBe(310);
    expect([two.state.inventory['return-lamp'], two.state.inventory.phoenix, two.state.inventory['star-tear']]).toEqual([3, 1, 1]);
    const none = done(2, 20);
    expect(none.rankUps).toEqual([]);
    expect(none.state.gold).toBe(10);
    const top = done(5, GUILD_MAX - 1);
    expect(top.state.guild!.merit).toBe(GUILD_MAX);
  }));

  it('abandoning costs nothing and returns nothing', () => live(() => {
    const s = boardWith([offer('hunt', 'slime', 6), offer('hunt', 'bat', 6)]);
    s.guild!.merit = 7;
    const t = ok(accept(s, s.guild!.offers[0].id)).state;
    const a = ok(abandon(t, t.guild!.active[0].id)).state;
    expect(a.guild!.active).toEqual([]);
    expect(a.guild!.offers).toEqual(t.guild!.offers);
    expect(a.guild!.merit).toBe(7);
    expect(a.gold).toBe(t.gold);
    expect(accept(a, s.guild!.offers[0].id)).toEqual({ ok: false, reason: 'invalid' });   // it is not put back
  }));

  it("a companion speaks for her own land", () => live(() => {
    const quests = [
      offer('sweep', 'frost', 8), offer('scout', 'frost', 9), offer('hunt', 'frost-doll', 4), offer('bounty', 'rime-sovereign', 1),
      offer('deliver', 'frost-heart', 5), offer('deliver', 'moss', 5), offer('hunt', 'slime', 6), offer('scout', 'mainline', 9),
    ].map((o) => ({ ...o, base: 0 }));
    const s = boardWith([]);
    expect(quests.map((q) => remarkFor(s, q))).toEqual(quests.map(() => undefined));   // not met
    s.party = meet(s.party, 'chizuru', 1);
    expect(activeIds(s.party)).toContain('chizuru');
    expect(quests.map((q) => remarkFor(s, q))).toEqual(['chizuru', 'chizuru', 'chizuru', 'chizuru', 'chizuru', undefined, undefined, undefined]);
    s.party.grid = s.party.grid.map((c) => (c === 'chizuru' ? null : c));   // on the bench
    expect(quests.map((q) => remarkFor(s, q))).toEqual(quests.map(() => undefined));
    // the main road's companions say nothing for it
    s.party = meet(s.party, 'selene', 1);
    expect(remarkFor(s, quests[7])).toBeUndefined();
    // turning in carries it
    const t = boardWith([offer('scout', 'iron', 2)]);
    t.party = meet(t.party, 'scarlet', 1);
    const r = ok(turnIn(ok(accept(t, t.guild!.offers[0].id)).state, t.guild!.offers[0].id));
    expect(r.remark).toBe('scarlet');
  }));

  it('one companion a land', () => {
    const lands = MEETINGS.filter((m) => m.region !== 'mainline').map((m) => m.region);
    expect([...lands].sort()).toEqual([...LANDS].sort());
    expect(new Set(lands).size).toBe(lands.length);
  });

  it('newly done', () => live(() => {
    const s = boardWith([offer('hunt', 'slime', 2), offer('sweep', 'frost', 8), offer('bounty', 'fog-warden', 1), offer('deliver', 'moss', 5)], 3);
    s.bestiary!.slime.felled = 1;
    s.bestiary!['frost-doll'].felled = 2;
    s.bestiary!['snow-caller'].felled = 1;
    let t = s;
    for (const o of s.guild!.offers) t = ok(accept(t, o.id)).state;
    const [hunt, sweep, bounty] = t.guild!.active;
    const snap = questSnapshot(t);
    expect(snap).toEqual({ [hunt.id]: 1, [sweep.id]: 3, [bounty.id]: 0 });
    fell(t, 'slime', 1);   // not yet: 1 of 2
    expect(questsNewlyDone(snap, t)).toEqual([]);
    fell(t, 'slime', 1);
    fell(t, 'fog-warden', 1);
    t.inventory.moss = 9;   // a delivery is never told in the labyrinth
    expect(questsNewlyDone(snap, t)).toEqual([hunt.id, bounty.id]);
    // done already before: not new
    expect(questsNewlyDone(questSnapshot(t), t)).toEqual([]);
    fell(t, 'glacier-tortoise', 8);
    expect(questsNewlyDone(snap, t)).toEqual([hunt.id, sweep.id, bounty.id]);
  }));

  it('turning in a rune', () => live(() => {
    const s = boardWith([offer('bounty', 'fog-warden', 1, { reward: { gold: 0, rune: 'heavy@rare' } })], 2);
    s.runes = { 'heavy@rare': RUNE_STACK };
    s.gold = 0;
    const t = ok(accept(s, s.guild!.offers[0].id)).state;
    fell(t, 'fog-warden', 1);
    const r = ok(turnIn(t, t.guild!.active[0].id));
    expect(r.state.runes!['heavy@rare']).toBe(RUNE_STACK);
    expect(r.runeGold).toBe(RUNE_SELL.rare);
    expect(r.state.gold).toBe(RUNE_SELL.rare);
    expect(r.state.gold).toBe(grantRune(t, { id: 'heavy', tier: 'rare' }).gold);
  }));

  it('locked while the board is shut', () => {
    const s = boardWith([offer('hunt', 'slime', 6)]);
    expect(accept(s, s.guild!.offers[0].id)).toEqual({ ok: false, reason: 'locked' });
    const t = ok(live(() => accept(s, s.guild!.offers[0].id))).state;
    fell(t, 'slime', 6);
    const q = t.guild!.active[0].id;
    for (const shut of [<T>(f: () => T) => f(), <T>(f: () => T) => withGuildLive(f, { open: false })]) {
      shut(() => {
        expect(accept(s, s.guild!.offers[0].id)).toEqual({ ok: false, reason: 'locked' });
        expect(abandon(t, q)).toEqual({ ok: false, reason: 'locked' });
        expect(turnIn(t, q)).toEqual({ ok: false, reason: 'locked' });
      });
    }
  });

  it('none of it draws', () => live(() => {
    const s = boardWith([offer('hunt', 'slime', 1), offer('bounty', 'fog-warden', 1, { reward: { gold: 1, rune: 'focus@magic', items: { 'shard-dim': 2 } } }), offer('deliver', 'moss', 2)], 2);
    s.inventory.moss = 2;
    s.forgeDraws = 17;
    s.story.pity = { hero: 3 };
    const check = (before: GameState, run: (x: GameState) => { ok: boolean; state?: GameState }) => {
      const copy = structuredClone(before);
      const r = run(before);
      expect(before).toEqual(copy);   // the state given is never changed
      expect(r.ok).toBe(true);
      expect(r.state!.forgeDraws).toBe(17);
      expect(r.state!.story).toEqual(copy.story);
      expect(r.state!.bestiary).toEqual(copy.bestiary);
      return r.state!;
    };
    let t = s;
    for (const o of s.guild!.offers) t = check(t, (x) => accept(x, o.id));
    fell(t, 'slime', 1);
    fell(t, 'fog-warden', 1);
    for (const q of [...t.guild!.active].slice(0, 2)) t = check(t, (x) => turnIn(x, q.id));
    t = check(t, (x) => abandon(x, x.guild!.active[0].id));
    expect(t.guild!.active).toEqual([]);
  }));
});
