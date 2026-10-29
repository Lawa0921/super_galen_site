import { ENEMIES } from '../data/enemies';
import { MATERIALS } from '../data/materials';
import { LEGACY_ENEMY_IDS, MAINLINE_BOSSES, MAINLINE_WARDENS, REGION_BOSSES, REGION_WARDENS, TREASURE, listedEnemy } from '../data/monsters';
import { REGIONS, type RegionId } from '../data/regions';
import {
  ACTIVE_MAX, BOARD_MAX, BOUNTY_SHARDS, DELIVER_GIVER, DELIVER_KINDS, GIVERS, GUILD_MAX, GUILD_RUNES, GUILD_SALT, HUNT_N, KIND_GIVER, MERIT,
  QUEST_KINDS, RANKS, REWARD, SCOUT_FINALE_CAP, SCOUT_K, SWEEP_N, WEIGHTS, deliverQty, guildOpen, runeTierAt, type DeliverKind, type GiverId,
  type QuestKind,
} from '../data/guild';
import { ITEMS } from '../data/items';
import { MEETINGS } from '../data/meetings';
import { parseRuneKey } from '../data/runes';
import { SHARD_IDS, isFragmentItem, shardGrade } from '../data/story/fragments';
import { MAX_DAY, dayOf } from './calendar';
import { MAX_REACHED } from './levels';
import { mix } from './loot/drops';
import { grantRune } from './loot/runes';
import { mulberry32, pick, randInt, type Rng } from './rng';
import { BAND_DEPTHS } from './story/handbook';
import { addItem, type TownResult } from './town';
import type { ActiveQuest, GameState, GuildState, QuestOffer, QuestReward } from './state';
import type { CharacterId } from './types';

/**
 * The guild board's rules (guild quests spec §5, §9; plan rulings 3, 5, 7–12): pure functions of the save. Only the
 * board's own stream (`guildRng`) ever draws, and only when a board is posted.
 */

type Land = Exclude<RegionId, 'mainline'>;
const REGION_IDS = Object.keys(REGIONS) as RegionId[];
const ENEMY_IDS = Object.keys(ENEMIES);
const MATERIAL_IDS = Object.keys(MATERIALS);
const LEGACY = new Set(LEGACY_ENEMY_IDS);

// ---------------------------------------------------------------------------------------------------------------------
// Exclusions (spec §0 item 6)

/**
 * A foe no quest ever names: a person's remnant, a companion's past (`lore`), a story fight's foe, a boss's part, the
 * lantern-mother (the finale's alone); an id this build does not know too.
 */
export function excluded(id: string): boolean {
  const e = ENEMIES[id];
  return !e || !!e.remnant || !!e.lore || !!e.story || e.rank === 'part' || id === 'lantern-mother';
}
/** Review M3: the lantern-eater is also every boss not yet live (`bossFor`); a bounty on it is a bounty on any boss. */
export const bountyExcluded = (id: string): boolean => excluded(id) || id === 'lanterneater';
/** Review M7: a treasure rat flees; hunting one is luck, not work. */
export const huntExcluded = (id: string): boolean => excluded(id) || TREASURE.has(id);

const seen = (s: GameState, id: string): boolean => (s.bestiary?.[id]?.seen ?? 0) >= 1;
/** How many of `id` the party has felled (the bestiary; 0 before any). */
export const felledOf = (s: GameState, id: string): number => s.bestiary?.[id]?.felled ?? 0;

// ---------------------------------------------------------------------------------------------------------------------
// The tables

/** An ordinary foe (no boss, no rank): what a hunt and a sweep count. */
const ordinary = (id: string): boolean => !ENEMIES[id].boss && !ENEMIES[id].rank;

/**
 * Plan ruling 9, spec §5.2: a region's natives a sweep counts: its own ordinary foes, live, neither excluded nor a
 * treasure rat, in ENEMIES order.
 */
export function natives(r: RegionId): string[] {
  if (r === 'mainline') return [];
  return ENEMY_IDS.filter((id) => ENEMIES[id].home === r && ordinary(id) && listedEnemy(id) && !huntExcluded(id));
}

/** One line of the bounty tables (spec §5.3): a warden or boss, where it is first met, and how deep. */
export interface BountyLine { id: string; region: RegionId; depth: number; warden: boolean }

/**
 * Spec §5.3 (plan ruling 10): the four tables `hauntsOf` reads, in order, each id at its first depth: the main road's bosses
 * at 5 × (i + 1), each region's at 5 × (i + 1) (REGIONS order), the main road's wardens at 8 + 5i, a region's warden at 8.
 */
export const BOUNTY_TABLE: readonly BountyLine[] = (() => {
  const out: BountyLine[] = [];
  const add = (id: string, region: RegionId, depth: number, warden: boolean) => { if (!out.some((l) => l.id === id)) out.push({ id, region, depth, warden }); };
  MAINLINE_BOSSES.forEach((id, i) => add(id, 'mainline', 5 * (i + 1), false));
  for (const r of REGION_IDS) if (r !== 'mainline') REGION_BOSSES[r as Land].forEach((id, i) => add(id, r, 5 * (i + 1), false));
  MAINLINE_WARDENS.forEach((id, i) => add(id, 'mainline', 8 + 5 * i, true));
  for (const r of REGION_IDS) if (r !== 'mainline') add(REGION_WARDENS[r as Land], r, 8, true);
  return out;
})();
export const bountyLine = (id: string): BountyLine | undefined => BOUNTY_TABLE.find((l) => l.id === id);

// ---------------------------------------------------------------------------------------------------------------------
// The pools (plan ruling 3): fixed order, no draw

/** Spec §5.1: ordinary foes, live, seen, neither excluded nor a treasure rat, in ENEMIES order. */
export function huntPool(s: GameState): string[] {
  return ENEMY_IDS.filter((id) => ordinary(id) && listedEnemy(id) && !huntExcluded(id) && seen(s, id));
}

/** Spec §5.2: a region gone to its fourth floor with two of its natives seen (never the main road), in REGIONS order. */
export function sweepPool(s: GameState): RegionId[] {
  return REGION_IDS.filter((r) => r !== 'mainline' && s.dungeon.reached[r] >= 4 && natives(r).filter((id) => seen(s, id)).length >= 2);
}

/**
 * Spec §5.3 (review M4): from the first lamp, a warden or boss of the tables, live, seen, not excluded (the lantern-eater
 * neither), whose first depth is no deeper than its region has been reached; in the tables' order. Empty below the rank
 * that posts bounties.
 */
export function bountyPool(s: GameState, rank: number): string[] {
  if (!RANKS[rank]?.kinds.includes('bounty')) return [];
  return BOUNTY_TABLE.filter((l) => listedEnemy(l.id) && !bountyExcluded(l.id) && seen(s, l.id) && l.depth <= s.dungeon.reached[l.region]).map((l) => l.id);
}

/** A region a scout may ask for, and the deepest depth it may ask: `D = min(reached + k, cap)`, always past `reached`. */
export interface ScoutCandidate { region: RegionId; cap: number }

/**
 * Spec §5.4: the main road always, a region once gone into (depth 2); the main road stops short of the finale (29) until
 * it is first cleared, every region at MAX_REACHED. A region already at its cap is left out. REGIONS order.
 */
export function scoutPool(s: GameState): ScoutCandidate[] {
  const out: ScoutCandidate[] = [];
  for (const r of REGION_IDS) {
    const reached = s.dungeon.reached[r];
    if (r !== 'mainline' && reached < 2) continue;
    const cap = r === 'mainline' && !s.story.finaleCleared ? SCOUT_FINALE_CAP : MAX_REACHED;
    if (reached < cap) out.push({ region: r, cap });
  }
  return out;
}

/**
 * Plan ruling 8 (review H1): a delivery's goods the party knows. A monster material or a trophy: some foe that is not
 * excluded, felled at least once, drops it, and its owner (when it has one) is not excluded. A region material: its region
 * gone into (depth 2). Nothing of any other kind.
 */
export function knownMaterial(s: GameState, id: string): boolean {
  return known(s, id, droppedBy(s));
}

/** What the foes felled at least once drop, the excluded foes left out. */
function droppedBy(s: GameState): Set<string> {
  const out = new Set<string>();
  for (const e of ENEMY_IDS) if (!excluded(e) && felledOf(s, e) >= 1) for (const d of ENEMIES[e].drops) out.add(d.mat);
  return out;
}
function known(s: GameState, id: string, dropped: Set<string>): boolean {
  const m = MATERIALS[id];
  if (!m || !DELIVER_KINDS.includes(m.kind)) return false;
  if (m.kind === 'region') return REGION_IDS.some((r) => REGIONS[r].material === id && s.dungeon.reached[r] >= 2);
  if (m.owner && excluded(m.owner)) return false;
  return dropped.has(id);
}

/** Spec §5.5: the goods a delivery may ask for, in MATERIALS order. */
export function deliverPool(s: GameState): string[] {
  const dropped = droppedBy(s);
  return MATERIAL_IDS.filter((id) => known(s, id, dropped));
}

/**
 * Spec §5, plan ruling 7: the depth a quest's rewards read. A hunt: the old eight 2, a road band its first depth, a native
 * 4. A sweep: the region's reached, at most 30. A bounty: its first depth on the tables. A scout: its own depth `n`. A
 * delivery pays by the goods' price and reads none (0).
 */
export function questDepth(kind: QuestKind, target: string, s: GameState, n = 0): number {
  switch (kind) {
    case 'hunt': {
      if (LEGACY.has(target)) return 2;
      const e = ENEMIES[target];
      if (e.band) return BAND_DEPTHS[e.band][0];
      return 4;
    }
    case 'sweep': return Math.min(s.dungeon.reached[target as RegionId], 30);
    case 'bounty': return bountyLine(target)!.depth;
    case 'scout': return n;
    case 'deliver': return 0;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Ranks (spec §6.3)

/** The lamp rank of `merit`: the last rank whose threshold it has reached (0, 見習, to 4, 四燈). */
export function rankOf(merit: number): number {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (merit >= RANKS[i].merit) r = i;
  return r;
}
/** The ranks reached on the way from `before` to `after` merit, in order (empty when none). */
export function rankUps(before: number, after: number): number[] {
  const out: number[] = [];
  for (let r = rankOf(before) + 1; r <= rankOf(after); r++) out.push(r);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The board (spec §9.1, plan ruling 5)

/** Spec §0 item 13: the board's own stream for `day`. It is the only stream this module builds. */
export function guildRng(s: GameState, day: number): Rng {
  return mulberry32(mix(s.forgeSalt ^ GUILD_SALT, day));
}

/** One weighted draw: the index whose share of the total holds the roll. Some weight must be above 0. */
function pickWeighted(rng: Rng, weights: readonly number[]): number {
  let roll = rng() * weights.reduce((t, w) => t + w, 0);
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    if (roll < weights[i]) return i;
    roll -= weights[i];
  }
  return weights.findLastIndex((w) => w > 0);
}

/** How many of one kind a hunt asks for (spec §5.1). */
function huntN(id: string): number {
  if (LEGACY.has(id)) return HUNT_N.old;
  const e = ENEMIES[id];
  return e.band ? HUNT_N[e.band] : HUNT_N.native;
}

/** Picks of a slot's target before a slot that would repeat a note is left empty (spec §5.6). */
const PICK_TRIES = 8;

/**
 * The notes for `day` (plan ruling 5). Slot by slot, in order:
 *   1. the kind: slot 0 is a bounty from the first lamp on while there is any bounty to post, and slot 1 too at four
 *      lamps; any other slot draws its kind by WEIGHTS among the kinds the rank posts that have a candidate (none: empty);
 *   2. the target: a pick of that kind's pool, picked again while it repeats a note of the same kind and target already
 *      on the board, PICK_TRIES picks at most; none left, the slot stays empty (the board is shorter, nothing fills it);
 *   3. a scout draws k (SCOUT_K) for its depth, min(reached + k, cap);
 *   4. a bounty draws its two shards' grades (`shardGrade`), then, at a rank that pays one while runes are open, its rune;
 *   5. the variant is `day % 2`, the giver follows the kind, the reward is the formula's (data/guild.ts).
 * How many draws a board takes varies, but each slot's draws depend only on the slots before it and the save, so one
 * (forgeSalt, day, save) is always one board.
 */
function drawBoard(s: GameState, day: number): QuestOffer[] {
  const rank = rankOf(s.guild?.merit ?? 0);
  const R = RANKS[rank];
  const rng = guildRng(s, day);
  const scouts = scoutPool(s);
  const pools: Record<QuestKind, readonly string[]> = {
    hunt: huntPool(s), sweep: sweepPool(s), bounty: bountyPool(s, rank), scout: scouts.map((c) => c.region), deliver: deliverPool(s),
  };
  const offers: QuestOffer[] = [];
  for (let slot = 0; slot < R.offers; slot++) {
    let kind: QuestKind;
    if (pools.bounty.length && (slot === 0 || (slot === 1 && R.doubleBounty))) kind = 'bounty';
    else {
      const weights = QUEST_KINDS.map((k) => (R.kinds.includes(k) && pools[k].length ? WEIGHTS[k] : 0));
      if (!weights.some((w) => w > 0)) continue;
      kind = QUEST_KINDS[pickWeighted(rng, weights)];
    }
    let target: string | null = null;
    for (let t = 0; t < PICK_TRIES && target === null; t++) {
      const c = pick(rng, pools[kind]);
      if (!offers.some((o) => o.kind === kind && o.target === c)) target = c;
    }
    if (target === null) continue;
    offers.push(noteFor(s, rng, `${day}:${slot}`, kind, target, (day % 2) as 0 | 1, rank, scouts));
  }
  return offers;
}

const reward = (r: { gold: number; items?: Record<string, number> }): QuestReward => (r.items ? { gold: r.gold, items: { ...r.items } } : { gold: r.gold });

/** One note's numbers and reward (steps 3 to 5 of `drawBoard`). */
function noteFor(s: GameState, rng: Rng, id: string, kind: QuestKind, target: string, variant: 0 | 1, rank: number, scouts: ScoutCandidate[]): QuestOffer {
  const base = { id, kind, variant, target };
  switch (kind) {
    case 'hunt': {
      const n = huntN(target), depth = questDepth('hunt', target, s);
      return { ...base, giver: KIND_GIVER.hunt, n, depth, reward: reward(REWARD.hunt(n, depth)), merit: MERIT.hunt };
    }
    case 'sweep': {
      const depth = questDepth('sweep', target, s);
      return { ...base, giver: KIND_GIVER.sweep, n: SWEEP_N, depth, reward: reward(REWARD.sweep(depth)), merit: MERIT.sweep };
    }
    case 'scout': {
      const cap = scouts.find((c) => c.region === target)!.cap;
      const n = Math.min(s.dungeon.reached[target as RegionId] + randInt(rng, SCOUT_K[0], SCOUT_K[1]), cap);
      return { ...base, giver: KIND_GIVER.scout, n, depth: n, reward: reward(REWARD.scout(n)), merit: MERIT.scout };
    }
    case 'bounty': {
      const line = bountyLine(target)!;
      const depth = line.depth;
      const r = line.warden ? REWARD.warden(depth) : REWARD.boss(depth);
      const items = { ...r.items };
      for (let i = 0; i < BOUNTY_SHARDS; i++) {
        const shard = SHARD_IDS[shardGrade(depth, rng())];
        items[shard] = (items[shard] ?? 0) + 1;
      }
      const rune = RANKS[rank].runeBounty && s.runesOpen ? `${pick(rng, GUILD_RUNES)}@${runeTierAt(depth)}` : undefined;
      return { ...base, giver: KIND_GIVER.bounty, n: 1, depth, reward: { gold: r.gold, items, ...(rune ? { rune } : {}) }, merit: line.warden ? MERIT.warden : MERIT.boss };
    }
    case 'deliver': {
      const m = MATERIALS[target];
      const n = deliverQty(m.price, m.kind as DeliverKind);
      return { ...base, giver: DELIVER_GIVER[m.kind as DeliverKind], n, depth: questDepth('deliver', target, s), reward: reward(REWARD.deliver(n, m.price)), merit: MERIT.deliver };
    }
  }
}

/**
 * Spec §9.1: today's board. The same day again returns `s` itself (one day, one board). Otherwise a new state whose notes
 * are today's while its taken quests, merit and gifts stay; the first board starts the record. Draws only from
 * `guildRng`; whether to post at all (`guildOpen`, a dive that counted) is the caller's to decide.
 */
export function postBoard(s: GameState): GameState {
  const day = dayOf(s);
  if (s.guild?.day === day) return s;
  const n = structuredClone(s);
  const g: GuildState = n.guild ?? { day, offers: [], active: [], merit: 0, paid: 0 };
  g.day = day;
  g.offers = drawBoard(n, day);
  n.guild = g;
  return n;
}

// ---------------------------------------------------------------------------------------------------------------------
// Taking, tracking, dropping and turning in (spec §5, §6, §8.4); none of it draws

/** Where a quest stands (spec §5): `have` of `need`, from the bestiary, the depths reached or the stock as they are now. */
export interface Progress { have: number; need: number; done: boolean }

const sumFelled = (s: GameState, ids: readonly string[]): number => ids.reduce((t, id) => t + felledOf(s, id), 0);

/** The count a hunt, bounty or sweep reads now; a sweep reads only its frozen kinds (plan ruling 9). */
function countOf(s: GameState, q: ActiveQuest): number {
  return q.kind === 'sweep' ? sumFelled(s, q.ids ?? []) : felledOf(s, q.target);
}

/**
 * Spec §5: hunts, sweeps and bounties count the felled since the quest was taken (`base`); a scout reads the region's
 * deepest reached, a delivery the stock (what is still in the run pack does not count until it is home).
 */
export function progressOf(s: GameState, q: ActiveQuest): Progress {
  const have = q.kind === 'scout' ? s.dungeon.reached[q.target as RegionId] ?? 0
    : q.kind === 'deliver' ? s.inventory[q.target] ?? 0
      : Math.max(0, countOf(s, q) - q.base);
  return { have, need: q.n, done: have >= q.n };
}

const fail = (reason: 'locked' | 'full' | 'stock' | 'invalid'): { ok: false; reason: typeof reason } => ({ ok: false, reason });

/**
 * Takes note `offerId` off the board (spec §0 item 3): it moves to the quests held, with the count it starts from (plan
 * ruling 9: a sweep freezes its kinds). `locked` while the board is shut, `full` at the rank's cap, `invalid` for a note
 * not on the board. Never changes `s`.
 */
export function accept(s: GameState, offerId: string): TownResult {
  if (!guildOpen(s)) return fail('locked');
  const g = s.guild;
  const o = g?.offers.find((x) => x.id === offerId);
  if (!g || !o) return fail('invalid');
  if (g.active.length >= RANKS[rankOf(g.merit)].cap) return fail('full');
  const n = structuredClone(s);
  const ng = n.guild!;
  const ids = o.kind === 'sweep' ? natives(o.target as RegionId) : undefined;
  const base = o.kind === 'sweep' ? sumFelled(n, ids!) : o.kind === 'hunt' || o.kind === 'bounty' ? felledOf(n, o.target) : 0;
  ng.active.push({ ...structuredClone(o), base, ...(ids ? { ids } : {}) });
  ng.offers = ng.offers.filter((x) => x.id !== offerId);
  return { ok: true, state: n };
}

/** Drops quest `questId` (spec §0 item 3): free, no merit lost, and the note does not go back on the board. */
export function abandon(s: GameState, questId: string): TownResult {
  if (!guildOpen(s)) return fail('locked');
  if (!s.guild?.active.some((q) => q.id === questId)) return fail('invalid');
  const n = structuredClone(s);
  n.guild!.active = n.guild!.active.filter((q) => q.id !== questId);
  return { ok: true, state: n };
}

/** A turn-in, paid: what the note said, the gold of a rune paid as gold (RUNE_STACK), the ranks reached, who has a word. */
export type TurnIn = { ok: true; state: GameState; reward: QuestReward; runeGold: number; rankUps: number[]; remark?: CharacterId }
  | { ok: false; reason: 'locked' | 'stock' | 'invalid' };

/**
 * Turns in quest `questId` (spec §6, §8.4): pays the note's reward as written (a rune through `grantRune`, so a full stack
 * pays its gold), adds its merit up to GUILD_MAX, and pays each rank's gift not paid yet (`paid` + 1 to the new rank, in
 * order). A delivery hands its goods over from the stock (not a sale: `sold` stays). `invalid` when not done or not
 * held, `stock` for a delivery short of goods. Never changes `s`.
 */
export function turnIn(s: GameState, questId: string): TurnIn {
  if (!guildOpen(s)) return fail('locked') as TurnIn;
  const q = s.guild?.active.find((x) => x.id === questId);
  if (!q) return fail('invalid') as TurnIn;
  if (!progressOf(s, q).done) return fail(q.kind === 'deliver' ? 'stock' : 'invalid') as TurnIn;
  let n = structuredClone(s);
  if (q.kind === 'deliver') addItem(n.inventory, q.target, -q.n);
  n.gold += q.reward.gold;
  for (const [id, k] of Object.entries(q.reward.items ?? {})) addItem(n.inventory, id, k);
  let runeGold = 0;
  const rune = q.reward.rune ? parseRuneKey(q.reward.rune) : null;
  if (rune) {
    const r = grantRune(n, rune);
    n = r.state;
    runeGold = r.gold;
  }
  const g = n.guild!;
  const before = g.merit;
  g.merit = Math.min(GUILD_MAX, g.merit + q.merit);
  const rank = rankOf(g.merit);
  for (let r = g.paid + 1; r <= rank; r++) {
    const gift = RANKS[r].gift;
    n.gold += gift.gold ?? 0;
    for (const [id, k] of Object.entries(gift.items ?? {})) addItem(n.inventory, id, k);
  }
  g.paid = Math.max(g.paid, rank);
  g.active = g.active.filter((x) => x.id !== questId);
  const remark = remarkFor(s, q);
  return { ok: true, state: n, reward: structuredClone(q.reward), runeGold, rankUps: rankUps(before, g.merit), ...(remark ? { remark } : {}) };
}

/** The quests held that a won fight can finish now, each one number: its target's felled, a sweep's frozen kinds' sum (review L8). */
export function questSnapshot(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of s.guild?.active ?? []) if (q.kind === 'hunt' || q.kind === 'sweep' || q.kind === 'bounty') out[q.id] = countOf(s, q);
  return out;
}

/** The quests in `snap` that were not done then and are done in `s`, in the order held (spec §8.5). */
export function questsNewlyDone(snap: Record<string, number>, s: GameState): string[] {
  return (s.guild?.active ?? []).filter((q) => q.id in snap && snap[q.id] - q.base < q.n && progressOf(s, q).done).map((q) => q.id);
}

/**
 * The region a quest is about (plan ruling 12): a sweep's or scout's own, a hunt's foe's home, a bounty's table, a region
 * material's region; none otherwise.
 */
function questRegion(q: QuestOffer): RegionId | undefined {
  switch (q.kind) {
    case 'sweep': case 'scout': return q.target as RegionId;
    case 'hunt': return ENEMIES[q.target]?.home;
    case 'bounty': return bountyLine(q.target)?.region;
    case 'deliver': return REGION_IDS.find((r) => REGIONS[r].material === q.target);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The save (spec §9.4, plan ruling 21)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown, lo: number, hi: number): boolean => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
/** Far above any depth or count a quest names; bounds a hand-edited save. */
const MAX_QUEST_N = 1e9;
const RUNE_TIER_NAMES: readonly string[] = ['common', 'magic', 'rare', 'epic', 'legendary'];

/** A reward's shape: whole gold, each item a whole count above 0, a rune key 「id@tier」 with a real tier. */
function isReward(v: unknown): boolean {
  if (!isObj(v) || !whole(v.gold, 0, MAX_QUEST_N)) return false;
  if (v.items !== undefined && !(isObj(v.items) && Object.values(v.items).every((n) => whole(n, 1, MAX_QUEST_N)))) return false;
  if (v.rune === undefined) return true;
  if (typeof v.rune !== 'string') return false;
  const parts = v.rune.split('@');
  return parts.length === 2 && parts[0].length > 0 && RUNE_TIER_NAMES.includes(parts[1]);
}
function isNote(v: unknown): v is Record<string, unknown> {
  return isObj(v) && typeof v.id === 'string' && QUEST_KINDS.includes(v.kind as QuestKind) && GIVERS.includes(v.giver as GiverId)
    && (v.variant === 0 || v.variant === 1) && typeof v.target === 'string' && whole(v.n, 1, MAX_QUEST_N) && whole(v.depth, 0, MAX_QUEST_N)
    && whole(v.merit, 0, GUILD_MAX) && isReward(v.reward);
}
function isHeld(v: unknown): boolean {
  if (!isNote(v) || !whole(v.base, 0, MAX_QUEST_N)) return false;
  return v.ids === undefined || (Array.isArray(v.ids) && v.ids.every((x) => typeof x === 'string'));
}

/**
 * Spec §9.4: the board's shape, and only its shape (`repairGuild` looks the targets up): whole numbers in range, the
 * kinds and givers known, at most BOARD_MAX notes and ACTIVE_MAX held, `paid` a rank, ids once each, rune keys well formed.
 */
export function isGuild(v: unknown): boolean {
  if (!isObj(v) || !whole(v.day, 1, MAX_DAY) || !whole(v.merit, 0, GUILD_MAX) || !whole(v.paid, 0, RANKS.length - 1)) return false;
  if (v.viewed !== undefined && !whole(v.viewed, 1, MAX_DAY)) return false;
  if (v.intro !== undefined && v.intro !== true) return false;
  if (!Array.isArray(v.offers) || v.offers.length > BOARD_MAX || !v.offers.every(isNote)) return false;
  if (!Array.isArray(v.active) || v.active.length > ACTIVE_MAX || !v.active.every(isHeld)) return false;
  const ids = [...v.offers, ...v.active].map((q) => (q as { id: string }).id);
  return new Set(ids).size === ids.length;
}

/** Whether an item id is one this build knows: a consumable, a material, or a fragment. */
const knownItem = (id: string): boolean => Object.hasOwn(ITEMS, id) || Object.hasOwn(MATERIALS, id) || isFragmentItem(id);

/** Plan ruling 21 (review L7): a quest's target, looked up in its own kind's table. */
function knownTarget(q: { kind: QuestKind; target: string }): boolean {
  switch (q.kind) {
    case 'hunt': case 'bounty': return Object.hasOwn(ENEMIES, q.target);
    case 'deliver': return Object.hasOwn(MATERIALS, q.target);
    case 'scout': case 'sweep': return Object.hasOwn(REGIONS, q.target);
  }
}

/**
 * Spec §9.4: what this build does not know is dropped on load, never a corrupt save (as `repairBestiary`). A note or a
 * held quest whose target is not in its kind's table goes; a sweep keeps the frozen kinds it knows, and goes with none
 * left; a reward loses an unknown item, and a rune key of the right shape whose rune (or tier of it) is not in this build.
 * Run after the shape check.
 */
export function repairGuild(d: Record<string, unknown>): void {
  const g = d.guild;
  if (!isObj(g)) return;
  const fix = <Q extends QuestOffer>(list: Q[]): Q[] => list.filter((q) => {
    if (!knownTarget(q)) return false;
    const held = q as unknown as ActiveQuest;
    if (held.ids) {
      held.ids = held.ids.filter((id) => Object.hasOwn(ENEMIES, id));
      if (!held.ids.length) return false;
    }
    const items = q.reward.items;
    if (items) {
      for (const id of Object.keys(items)) if (!knownItem(id)) delete items[id];
      if (!Object.keys(items).length) delete q.reward.items;
    }
    if (q.reward.rune && !parseRuneKey(q.reward.rune)) delete q.reward.rune;
    return true;
  });
  g.offers = fix(g.offers as QuestOffer[]);
  g.active = fix(g.active as ActiveQuest[]);
}

/**
 * Plan ruling 12: the companion who has a word on a quest turned in: the one met in the quest's region (MEETINGS), when
 * she is recruited and on the field. Never on the main road. One companion a region (review L9), so never two.
 */
export function remarkFor(s: GameState, q: QuestOffer): CharacterId | undefined {
  const r = questRegion(q);
  if (!r || r === 'mainline') return undefined;
  const c = MEETINGS.find((m) => m.region === r)?.id;
  return c && s.party.recruited.includes(c) && s.party.grid.includes(c) ? c : undefined;
}
