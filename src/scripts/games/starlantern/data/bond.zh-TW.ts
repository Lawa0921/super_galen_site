import type { GiftId } from '../engine/types';
import type { Companion } from './story/bond';
import type { SceneId } from './story/scenes';
import type { SceneLine } from './story.zh-TW';

/**
 * The bond's text (bond plan Task 6 on; spec 2026-10-18 affinity design, 0 D14): only text that is written. Nothing here is
 * a placeholder, and a companion with no entry is simply not offered (the gift and talk lists leave her out). Before
 * writing, read the style bible and spec 6.2 and 6.4; 6.4's voice samples predate the voice pass, and where they differ
 * from the bible, the bible wins. Story text imports from data/story.zh-TW.ts as types only (plan ruling 7).
 */

/**
 * A companion's reactions to gifts (spec 6.4): loved and liked two lines or more, neutral one or more, a line for each
 * material she declines and for each one her healing turns. Each line is her one line of dialogue (MAX_LINE_CHARS).
 */
export interface GiftPools {
  loved: string[];
  liked: string[];
  neutral: string[];
  declined: Partial<Record<GiftId, string>>;
  healed: Partial<Record<GiftId, string>>;
}

/** Gift reactions, registered whole as each one is written (data/bond.test.ts); Rin's here are hers before her choice. */
export const GIFT_LINES: Partial<Record<Companion, GiftPools>> = {};

/** Rin's reactions after her choice; she is offered only once both of hers are written (plan ruling 6). */
export const RIN_OATH_GIFT_LINES: GiftPools | null = null;

/**
 * The bond's scenes as written (bond plan Task 8): each bond scene, after-story, romance and the walk together, keyed by its
 * id, registered in data/story/scenes.ts as it is written; `buildScenes` adds them to `STORY.scenes`. A scene may use the
 * location cards of data/story/places.ts (a new one goes in that table).
 */
export const BOND_SCENES: Partial<Record<SceneId, { lines: SceneLine[]; summary: string }>> = {};

/** Two town lines for the one chosen (plan ruling 13), added to the town's pool under her name once she is chosen. */
export const ROMANCE_LINES: Partial<Record<Companion, string[]>> = {};
