import type { GameState } from '../engine/state';
import type { MaterialKind } from '../engine/types';
import type { RuneId, RuneTier } from './runes';

/**
 * The guild board (公會委託; guild quests spec §0, §5, §6): its switch, its stream's salt, the lamp ranks, the weights and
 * the reward formulas. Data and pure arithmetic only; the rules live in engine/guild.ts.
 */

/**
 * The switch (spec §0 item 15), as BOND_SWITCH: `live` is GUILD_LIVE, false until the guild plan's PR D; `open` is the
 * unlock, the first act cleared. Shipped code never changes either; tests go through `withGuildLive` (engine/testing.ts).
 */
export const GUILD_SWITCH: { live: boolean; open: (s: GameState) => boolean } = { live: false, open: (s) => s.story.act1Cleared };

/**
 * The one predicate (review M6): every entry of the engine, the screens and the save that reads or writes `guild` asks
 * this and nothing else.
 */
export const guildOpen = (s: GameState): boolean => GUILD_SWITCH.live && GUILD_SWITCH.open(s);

/** Spec §0 item 13: the board's stream, SHA-256's third round constant K[2] (K[0] is WARDEN_SALT, K[1] TROPHY_SALT). */
export const GUILD_SALT = 0xb5c0fbcf;

export type QuestKind = 'hunt' | 'sweep' | 'bounty' | 'scout' | 'deliver';
/** The kinds in the spec's order (§5): the order the weights are walked in. */
export const QUEST_KINDS: readonly QuestKind[] = ['hunt', 'sweep', 'bounty', 'scout', 'deliver'];
export type GiverId = 'anna' | 'marta' | 'glen' | 'orik' | 'doran';
export const GIVERS: readonly GiverId[] = ['anna', 'marta', 'glen', 'orik', 'doran'];

/** The materials a delivery may ask for (spec §5.5): only ever found in the labyrinth. */
export const DELIVER_KINDS: readonly MaterialKind[] = ['monster', 'region', 'trophy'];
export type DeliverKind = 'monster' | 'region' | 'trophy';

/** Spec §7.1: who posts each kind; a delivery's giver goes by the material's kind (`DELIVER_GIVER`). */
export const KIND_GIVER: Record<Exclude<QuestKind, 'deliver'>, GiverId> = { hunt: 'marta', sweep: 'glen', bounty: 'anna', scout: 'glen' };
/** Orik sells monster materials on; Doran forges with region materials and trophies. */
export const DELIVER_GIVER: Record<DeliverKind, GiverId> = { monster: 'orik', region: 'doran', trophy: 'doran' };

export type RankId = 'novice' | 'lamp1' | 'lamp2' | 'lamp3' | 'lamp4';
export interface RankDef {
  id: RankId;
  /** The merit this rank starts at. */
  merit: number;
  /** Notes a board holds at this rank. */
  offers: number;
  /** Quests held at once. */
  cap: number;
  /** The kinds the board may post. */
  kinds: QuestKind[];
  /** A bounty pays a rune too (while runes are open). */
  runeBounty: boolean;
  /** The townsfolk's own requests open (PR E). */
  personal: boolean;
  /** A second fixed bounty on every board. */
  doubleBounty: boolean;
  /** Paid once, on reaching this rank. */
  gift: { gold?: number; items?: Record<string, number> };
}

/** Spec §6.3 【起始提案】: 見習, 一燈 … 四燈. Sweeps and bounties (wardens and bosses together) open at the first lamp (review M4). */
export const RANKS: readonly RankDef[] = [
  { id: 'novice', merit: 0, offers: 3, cap: 3, kinds: ['hunt', 'scout', 'deliver'], runeBounty: false, personal: false, doubleBounty: false, gift: {} },
  { id: 'lamp1', merit: 12, offers: 4, cap: 3, kinds: ['hunt', 'sweep', 'bounty', 'scout', 'deliver'], runeBounty: false, personal: false, doubleBounty: false, gift: { gold: 300, items: { 'return-lamp': 2 } } },
  { id: 'lamp2', merit: 40, offers: 4, cap: 3, kinds: ['hunt', 'sweep', 'bounty', 'scout', 'deliver'], runeBounty: true, personal: true, doubleBounty: false, gift: { items: { phoenix: 1, 'star-tear': 1 } } },
  { id: 'lamp3', merit: 100, offers: 5, cap: 4, kinds: ['hunt', 'sweep', 'bounty', 'scout', 'deliver'], runeBounty: true, personal: true, doubleBounty: false, gift: { items: { 'king-scale': 1, 'shard-vivid': 1 } } },
  { id: 'lamp4', merit: 200, offers: 5, cap: 4, kinds: ['hunt', 'sweep', 'bounty', 'scout', 'deliver'], runeBounty: true, personal: true, doubleBounty: true, gift: { gold: 1000, items: { 'star-tear': 2 } } },
];

/** Merit stops here (far above any play), as BESTIARY_MAX. */
export const GUILD_MAX = 1e9;
/** The most notes a board holds, and the most quests held, at any rank (the save's bounds, spec §9.4). */
export const BOARD_MAX = 5;
export const ACTIVE_MAX = 4;

/** Spec §5.6 【起始提案】: each kind's weight on a slot not fixed to a bounty (0 below its rank, or with no candidate). */
export const WEIGHTS: Record<QuestKind, number> = { hunt: 3, sweep: 2, bounty: 2, scout: 2, deliver: 3 };

/** Spec §5.1: how many of one kind a hunt asks for: the old eight 6, the main road's bands, a region's natives 4. */
export const HUNT_N = { old: 6, B: 5, C: 5, D: 4, E: 4, F: 3, native: 4 } as const;
/** Spec §5.2: a sweep's count, all its natives together. */
export const SWEEP_N = 8;
/** Spec §5.4: how far past the deepest reached a scout asks, drawn in this range. */
export const SCOUT_K: readonly [number, number] = [3, 5];
/** Spec §5.4: the main road's depth a scout stops short of before the finale is first cleared. */
export const SCOUT_FINALE_CAP = 29;
/** Spec §5.5, §6.1: a delivery pays this many times the goods' price. */
export const DELIVER_MUL = 1.6;

/** Spec §5.5: how many a delivery asks for; a trophy is always 2 (it is its own unique's craft material too). */
export function deliverQty(price: number, kind: DeliverKind): number {
  if (kind === 'trophy') return 2;
  return Math.min(8, Math.max(2, Math.round(120 / price)));
}

/** Spec §6.1: the depth the rewards read stops at 60. */
export const rewardLv = (d: number): number => Math.min(d, 60);

export interface RewardPart { gold: number; items?: Record<string, number> }

/**
 * Spec §6.1 【起始提案】: each kind's gold and goods at quest depth `d`. A bounty's two ownerless shards and its rune are
 * drawn by the board (engine/guild.ts), not here.
 */
export const REWARD = {
  hunt: (n: number, d: number): RewardPart => ({ gold: Math.round(n * (8 + 2.5 * rewardLv(d))), items: { [d < 15 ? 'essence-magic' : 'essence-rare']: 1 } }),
  sweep: (d: number): RewardPart => ({ gold: Math.round(70 + 12 * rewardLv(d)), items: { 'essence-rare': 1 } }),
  warden: (d: number): RewardPart => ({ gold: Math.round(120 + 18 * rewardLv(d)), items: { 'ancient-gear': 1 } }),
  boss: (d: number): RewardPart => ({ gold: Math.round(180 + 24 * rewardLv(d)), items: { [d >= 15 ? 'star-tear' : 'ancient-gear']: 1 } }),
  scout: (d: number): RewardPart => ({ gold: Math.round(50 + 10 * rewardLv(d)), items: { 'return-lamp': 1 } }),
  deliver: (q: number, price: number): RewardPart => ({ gold: Math.round(DELIVER_MUL * q * price) }),
};

/** Spec §6.1: merit a quest pays; a bounty's by what it is. */
export const MERIT = { hunt: 2, sweep: 3, warden: 5, boss: 6, scout: 3, deliver: 2 } as const;

/** Spec §6.1: a bounty pays this many ownerless shards, each grade drawn on posting (`shardGrade`). */
export const BOUNTY_SHARDS = 2;

/** Spec §6.1: a bounty rune's tier by quest depth; never legendary. */
export const runeTierAt = (d: number): RuneTier => (d < 15 ? 'magic' : d < 30 ? 'rare' : 'epic');

/** Spec §10 item 6 (loose): what one board's rewards may be worth, all told, around depth `d`. */
export const BOARD_CAP = (d: number): number => 600 + 120 * Math.min(d, 60);

/**
 * Plan ruling 6: the runes a bounty can pay, the normal runes (no legendary) that Orik's shop does not stock (RUNE_STOCK),
 * in RUNE_IDS order; written out from the data in Task A3 (engine/guild.test.ts checks it against them).
 */
export const GUILD_RUNES: readonly RuneId[] = [
  'focus', 'bounce', 'heavy', 'flame', 'rime', 'thunderclap', 'ignite', 'jolt', 'tear', 'frostbite', 'venom', 'aftermath', 'on-crit',
  'on-kill', 'on-struck', 'regain', 'charge', 'drain', 'share', 'lasting', 'dispel', 'armor-break',
];
