import type { CharacterId, GiftId, MaterialDef, MaterialKind } from '../../engine/types';
import type { StoryMood } from '../../render/artPaths';
import { CHARACTER_IDS } from '../characters';
import { MATERIALS } from '../materials';
import type { SceneId, StoryGate } from './scenes';

/**
 * Bond (好感度) with Lorne: every constant and table, data only (bond plan Task 1; spec
 * `docs/superpowers/specs/2026-10-18-starlantern-affinity-expressions-design.md`, §0 rules over the rest). The logic that
 * reads them is `engine/story/bond.ts`. In code it is always `bond`, never `affinity` (that is a character's main stat).
 * The numbers are the spec's proposal (spec §4, §5, §6.3, §7.2, §13); only the bond band (item 21) may lower `BOND_PCT`.
 */

/** Rin and the eight: everyone who can have a bond (spec §3). Lorne never does. */
export type Companion = Exclude<CharacterId, 'hero'>;
/** `CHARACTER_IDS` without the hero, in the same order. */
export const COMPANIONS: Companion[] = CHARACTER_IDS.filter((c): c is Companion => c !== 'hero');

/** 相識, 同行, 信賴, 羈絆, 心契 (spec §4.2). */
export type BondTier = 0 | 1 | 2 | 3 | 4;
/** The fewest points of each tier, by tier. 85, not 80: 心契 takes three sources or more (spec §4.4). */
export const BOND_TIER_AT: readonly number[] = [0, 20, 40, 60, 85];
export const BOND_MAX = 100;
/** Where she starts when met (Rin is met from the start). */
export const BOND_START = 10;
/** Each memory piece of hers she holds (spec §0 D2: held pieces for the score; told pieces for gates and lines). */
export const BOND_PER_PIECE = 3;
/** Each source's lifetime cap (spec §4.3). Memories are capped by her chain's length. */
export const BOND_CAP = { talk: 12, gift: 30, field: 40 } as const;
/**
 * The most field points one companion earns on one dive (one day, spec §0 D3). Spec §13 proposed 4; band 21p (bond plan
 * Task 4, tuning round 1) found the three companions along on every dive short of 羈絆 by depth 30 (57), so 5 (63).
 */
export const BOND_RUN_CAP = 5;
/**
 * The battle bonus, in percent of her own base and growth stats, by tier (spec §5.1). Item 21 may only lower it: spec §13
 * proposed 0/1/2/3/4; band 21b (bond plan Task 4) lost its 10% HP floor at mainline depth 4 and blaze depth 8 with 4 %
 * (.098, .099) and with 3 % at 心契 (.098, .099), and holds with 2 % from 信賴 up (.101, .102).
 */
export const BOND_PCT: Record<BondTier, number> = { 0: 0, 1: 1, 2: 2, 3: 2, 4: 2 };
/** 0 turns the battle bonus off (the endgame's versus, spec §5.5), as `MEMORY_SCALE` does for memories. */
export const BOND_SCALE = 1;
/** Fighting and exploring together (spec §4.3): a floor gone down with her, a boss or elite won with her, her life saved. */
export const FIELD_POINTS = { floor: 1, strong: 2, saved: 2 } as const;
/** In danger: down, or at this percent of her max HP or less (spec §0 D4). */
export const DANGER_PCT = 30;

/** How a companion takes a material (spec §6.2): anything not in her row is neutral. */
export type Taste = 'loved' | 'liked' | 'neutral' | 'declined';
/** A declined gift is handed back: no points, nothing used up (spec §6.3). */
export const GIFT_VALUE = { loved: 4, liked: 2, neutral: 1 } as const;
/** The first this many of one material to one companion are worth their taste; every one after is worth 1. */
export const GIFT_REPEAT_FULL = 2;

/** The three ways Lorne says the same care (spec §7.2): ask, stay, promise. */
export type Tone = 'ask' | 'stay' | 'promise';
/** A bond scene's choice: her preferred tone, any other, or skipped (spec §7.2). No answer is wrong. */
export const TALK_POINTS = { preferred: 3, other: 2, skipped: 2 } as const;

/**
 * The material kinds a gift may be (spec §6.1). Essences are the forge's currency; consumables, gear and fragments are not
 * materials at all. GIFTABLE is derived from this, never listed by hand, so a new material of these kinds is giftable.
 */
/** Roster plan ruling 13: a keepsake is giftable, a trophy never is (a boss's spoil buys no bond). */
export const GIFT_KINDS: readonly MaterialKind[] = ['monster', 'junk', 'rare', 'region', 'keepsake'];
/** The ids of `materials` whose kind is giftable, in their order. */
export const giftableOf = (materials: Record<string, MaterialDef>): GiftId[] =>
  Object.values(materials).filter((m) => GIFT_KINDS.includes(m.kind)).map((m) => m.id);
/** Every giftable material: the 18 of spec §6.1, then the roster's signatures and keepsakes. */
export const GIFTABLE: GiftId[] = giftableOf(MATERIALS);

/** One companion's tastes. `healed`: what a declined material becomes once her memories are all told. */
export interface GiftTaste {
  loved: GiftId[];
  liked: GiftId[];
  declined: GiftId[];
  healed: Partial<Record<GiftId, 'liked' | 'neutral'>>;
}
/**
 * Spec §6.2, from each one's background (reviewed against the lore ledger in bond plan Task 1, spec §0 D19). Healing only
 * turns a declined material into liked or neutral, so a material she has taken never changes its worth. A companion's own
 * keepsake (roster plan ruling 13) is declined until her pieces are all told, then liked: Rin's and Selene's from L1a,
 * Bobby's from L2a.
 */
export const GIFT_TASTE: Record<Companion, GiftTaste> = {
  rin: { loved: ['dusk-cloth', 'thorn-fang'], liked: ['shade-crystal', 'star-tear'], declined: ['king-scale', 'tower-dust'], healed: { 'tower-dust': 'liked' } },
  noel: { loved: ['storm-stone', 'crystal-shell'], liked: ['king-scale', 'star-tear'], declined: ['star-stone'], healed: { 'star-stone': 'liked' } },
  chizuru: { loved: ['old-coin', 'moss'], liked: ['star-stone', 'crystal-shell'], declined: ['ice-crystal', 'frost-heart'], healed: {} },
  liz: { loved: ['old-coin', 'king-scale'], liked: ['star-tear', 'ancient-gear'], declined: ['shade-crystal'], healed: { 'shade-crystal': 'neutral' } },
  sylvie: { loved: ['moss', 'thorn-fang'], liked: ['bat-wing', 'lizard-scale'], declined: ['mire-gland'], healed: { 'mire-gland': 'neutral' } },
  scarlet: { loved: ['blaze-core', 'dusk-cloth'], liked: ['king-scale', 'star-stone'], declined: ['iron-shard'], healed: { 'iron-shard': 'liked' } },
  selene: { loved: ['star-tear', 'crystal-shell'], liked: ['moss', 'ice-crystal', 'star-stone'], declined: ['old-coin', 'moon-silver'], healed: { 'old-coin': 'liked', 'moon-silver': 'liked' } },
  safira: { loved: ['lizard-scale', 'king-scale'], liked: ['star-stone', 'bat-wing'], declined: ['blaze-core'], healed: { 'blaze-core': 'liked' } },
  bobby: { loved: ['ancient-gear', 'iron-shard'], liked: ['star-stone', 'crystal-shell', 'storm-stone'], declined: ['mire-gland', 'automaton-core'], healed: { 'automaton-core': 'liked' } },
};

/** Her face as she reacts to a gift (spec §6.4); each is one of her own faces (`moodsFor`). */
const giftFaces = (loved: StoryMood = 'smile'): Record<Taste, StoryMood> => ({ loved, liked: 'smile', neutral: 'normal', declined: 'sad' });
export const GIFT_MOOD: Record<Companion, Record<Taste, StoryMood>> = {
  rin: giftFaces('averted'), noel: giftFaces('smug'), chizuru: giftFaces(), liz: giftFaces('scheming'), sylvie: giftFaces(),
  scarlet: giftFaces('serious'), selene: giftFaces(), safira: giftFaces(), bobby: giftFaces('excited'),
};
/** Rin before her choice wears this face for any gift: a gift has no gate, and her averted face waits for her 4th piece. */
export const RIN_GIFT_MOOD_BEFORE_OATH: StoryMood = 'normal';

/** Each one's preferred tone (spec §7.2); never shown, felt only in her reply. */
export const TONE_PREF: Record<Companion, Tone> = {
  rin: 'stay', noel: 'ask', chizuru: 'promise', liz: 'promise', sylvie: 'stay', scarlet: 'stay', selene: 'promise', safira: 'ask', bobby: 'ask',
};

/** Who may be chosen for the romance ending (spec §9.1): every companion. */
export const ROMANCEABLE: Companion[] = COMPANIONS;

/** A bond scene's step: the 4th is 心契. */
export type BondStep = 1 | 2 | 3 | 4;
/**
 * What each bond scene waits on (bond plan ruling 9; spec §0 D5, D6): her tier, and the story's own `StoryGate`, read by
 * `gateOpen` and `gateExpired` (`pieces` and `full` count a companion's pieces told; Rin's count the pieces held).
 * Rin's first two expire at her choice (`beforeChoice`): an expired one is passed over, not seen, and holds nothing back.
 */
const companionGate = (c: Exclude<Companion, 'rin'>): Record<BondStep, StoryGate & { tier: BondTier }> => ({
  1: { tier: 1, pieces: { [c]: 1 } }, 2: { tier: 2, pieces: { [c]: 3 } }, 3: { tier: 3, pieces: { [c]: 4 } },
  4: { tier: 4, full: c, ...(HOMECOMING.includes(c) ? { seen: [`home:${c}` as SceneId] } : {}) },
});
/**
 * The four whose ending already played in the town (`HOME_OWNERS`, data/story/scenes.ts, kept apart here: that module
 * reads this one): their 心契 stands on it (the shrine, the sapling, the hat), so it waits for it (review 5 P1).
 */
const HOMECOMING: readonly Companion[] = ['chizuru', 'safira', 'sylvie', 'liz'];
export const BOND_GATE: Record<Companion, Record<BondStep, StoryGate & { tier: BondTier }>> = {
  rin: {
    1: { tier: 1, pieces: { rin: 2 }, beforeChoice: true }, 2: { tier: 2, pieces: { rin: 4 }, beforeChoice: true },
    3: { tier: 3, oath: true }, 4: { tier: 4, oath: true },
  },
  noel: companionGate('noel'), chizuru: companionGate('chizuru'), liz: companionGate('liz'), sylvie: companionGate('sylvie'),
  scarlet: companionGate('scarlet'), selene: companionGate('selene'), safira: companionGate('safira'), bobby: companionGate('bobby'),
};
