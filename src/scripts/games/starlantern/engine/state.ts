import { favouredRegions } from '../data/meetings';
import type { ActNode, BanterPair, GroupScene, SceneId } from '../data/story/scenes';
import type { TownFragmentId } from '../data/story/fragments';
import type { RegionId } from '../data/regions';
import type { Portal } from './dungeon/run';
import type { AutoJunk } from './loot/bag';
import { newParty, START_LINEUP } from './party';
import { rollPortals } from './portals';
import { mulberry32, type Rng } from './rng';
import type { CharacterId, Element, ItemInstance, Party } from './types';

export const SAVE_VERSION = 9;

/** What a new game carries. */
export const START_ITEMS: Record<string, number> = { potion: 5, 'return-lamp': 1 };

export interface DungeonProgress {
  /** Deepest depth reached in each region; 1 until a run goes deeper. Runs start at 1 or a multiple of 5 up to this. */
  reached: Record<RegionId, number>;
  /** Boss kills per `${region}:${depth}`. */
  bossKills: Record<string, number>;
  /** The three gates open in town: the mainline first, then two regions. Rerolled on every arrival in town. */
  portals: Portal[];
}

export const newReached = (): Record<RegionId, number> => ({ mainline: 1, blaze: 1, frost: 1, storm: 1, mire: 1, shade: 1, iron: 1 });

/** Where the story stands. Scenes are data (data/story); this is only what the player has done and what waits. */
export interface StoryState {
  act1Cleared: boolean; finaleCleared: boolean;
  /** Scenes played, skipped or auto-skipped. */
  seen: SceneId[];
  /** Seen but not yet opened in the handbook (the 新 mark). */
  fresh: SceneId[];
  /** Scenes waiting for the next arrival in town, in play order. */
  queue: SceneId[];
  nodes: ActNode[];
  /** Pity per memory chain (spec §7.2). */
  pity: Partial<Record<CharacterId, number>>;
  returned: TownFragmentId[];
  /** Marta's meal waits for the next departure (Task 9). */
  fed: boolean;
  /** Story depth Task 6 review: how many returns each banter pair has had one ready and not heard it (`nextBanter`'s tie-break). */
  waited?: Partial<Record<BanterPair, number>>;
  /** Story depth Task 15 review: where Rin told the table (`rin-confess`), at dinner or at the depth-30 rest before the finale. */
  confession?: 'dinner' | 'depth30';
  /**
   * Story L spec §4.1, §11: memory pieces taken and not told yet, in pickup order. Absent reads as empty. A piece's effects
   * land at pickup; only its scene waits here, for a night in town or the handbook.
   */
  untold?: SceneId[];
  /** Story L: the memories this return's night picked (a subset of `untold`), so a reload plays the same ones. Absent reads as empty. */
  tonight?: SceneId[];
  /** Story L spec §4.4.1: the cursor into `NIGHT_BEATS`, the next beat between two memories. Absent reads as 0. */
  beat?: number;
  /**
   * Story L spec §5.2, §11: a group scene's chances left. Its act said, it is 0; the next return makes it 1, the one after
   * removes it (expired), and so does the group said, or the next act said. Absent reads as empty.
   */
  reacts?: Partial<Record<GroupScene, 0 | 1>>;
  /**
   * 【控制者裁定 2026-10-24】 The dawn before departure: the one untold memory (not one of tonight's) the next departure
   * tells, picked on the return (`dawnMemory`) so a reload offers the same one. Absent: none.
   */
  dawn?: SceneId;
}

/** A new game opens with the prologue and the inn night after it waiting for its first arrival in town. */
export const newStory = (): StoryState => ({ act1Cleared: false, finaleCleared: false, seen: [], fresh: [], queue: ['prologue', 'prologue-inn'], nodes: [], pity: {}, returned: [], fed: false });

export interface GameState {
  version: typeof SAVE_VERSION;
  gold: number;
  inventory: Record<string, number>;
  /** Gear only (at most BAG_SIZE); materials and consumables stay in `inventory`. */
  bag: ItemInstance[];
  /** The next item uid to hand out; above every uid in the bag or worn. */
  nextUid: number;
  sold: Record<string, number>;
  party: Party;
  dungeon: DungeonProgress;
  revealed: Record<string, Element[]>;
  /** Ids of the special items and sets found so far. */
  codex: string[];
  autoJunk: AutoJunk;
  /** Forge random draws used so far; seeds each craft, so reloading cannot reroll it. */
  forgeDraws: number;
  /**
   * Set once when the game starts and never changed: with forgeDraws it is the whole forge seed. Nothing else the player
   * can change (nextUid, gold, the bag) feeds the seed, so a reload after a failed save cannot steer a roll.
   */
  forgeSalt: number;
  story: StoryState;
  /** The rune bag (plan 8e): unsocketed runes by key, 「spread@magic」 (data/runes runeKey). Absent: empty. */
  runes?: Record<string, number>;
  /**
   * Set by the first boss won in the labyrinth (plan 8f ruling 5): from then on runes drop and Orik sells them. Absent
   * on an old save past its first boss too; its next boss sets it.
   */
  runesOpen?: true;
  /**
   * The rune tutorial has been shown (plan 8g ruling 13): after the battle that first gave a rune, or on the first
   * workshop visit of a player who already holds one. Absent: not yet.
   */
  runeTutorialSeen?: true;
}

/**
 * A new game; its first gates come from `rng` (a fixed seed when none is given, so the result is deterministic).
 * `forgeSalt` is taken as given rather than drawn, so the rng sequence stays as it was.
 */
export function newGame(rng: Rng = mulberry32(0), forgeSalt = 0, start: CharacterId[] = START_LINEUP): GameState {
  return {
    version: SAVE_VERSION, gold: 150, inventory: { ...START_ITEMS }, bag: [], nextUid: 1, sold: {}, party: newParty(start),
    dungeon: { reached: newReached(), bossKills: {}, portals: rollPortals(rng, favouredRegions(start)) }, revealed: {}, codex: [], autoJunk: 'off', forgeDraws: 0,
    forgeSalt, story: newStory(),
  };
}
