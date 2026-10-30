import { favouredRegions } from '../data/meetings';
import type { ActNode, BanterPair, GroupScene, SceneId } from '../data/story/scenes';
import type { TownFragmentId } from '../data/story/fragments';
import type { Companion } from '../data/story/bond';
import type { RegionId } from '../data/regions';
import type { Difficulty } from './battle';
import type { Portal } from './dungeon/run';
import type { AutoJunk } from './loot/bag';
import type { Bestiary } from './bestiary';
import type { GiverId, QuestKind } from '../data/guild';
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
  /**
   * The tier last chosen at the gates (difficulty plan ruling 21); absent until the player has seen the tier row, and
   * then written, Normal included. Derived unlocks are not stored (engine/tiers.ts tierUnlocked).
   */
  tier?: Difficulty;
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
  /**
   * Time and moon plan ruling 1: today, a whole number from 1 to MAX_DAY (`engine/calendar.ts`). A departure is one day, its
   * return and that night included; a night at the inn is one more. Absent reads as 1 (a new game).
   */
  day?: number;
  /** Ruling 6: the day spring comes, written when the finale is cleared (that day + SPRING_AFTER). Absent after the finale: spring already. */
  springDay?: number;
  /**
   * Ruling 7 (Task 7 review): the season's scene the last return's night holds (`season:spring`), decided on that return
   * and saved with it; a reload plays it again until it is seen, and never decides it from the calendar. Absent: none.
   */
  festival?: SceneId;
  /**
   * Bond plan ruling 10 (spec §0 D3): the day `gifted` and `talked` belong to. Another day reads them as empty (`today` in
   * engine/story/bond.ts), so nothing clears them on a departure. Absent: nothing given or talked yet.
   */
  bondDay?: number;
  /** Who took a gift on `bondDay`, each once (spec §6.3). Only with `bondDay`. */
  gifted?: Companion[];
  /** A bond scene was opened on `bondDay` (spec §8.2). Only ever true, only with `bondDay`. */
  talked?: true;
  /** The one chosen for the romance ending (spec §9), after the finale; never changed once written. */
  romance?: Companion;
}

/** A new game opens with the prologue and the inn night after it waiting for its first arrival in town. */
export const newStory = (): StoryState => ({ act1Cleared: false, finaleCleared: false, seen: [], fresh: [], queue: ['prologue', 'prologue-inn'], nodes: [], pity: {}, returned: [], fed: false });

/**
 * Guild quests spec §9.3: what a quest pays, written on the note when the board is posted (plan ruling 5), so turning it
 * in draws nothing. `rune` is a rune key, 「id@tier」.
 */
export interface QuestReward { gold: number; items?: Record<string, number>; rune?: string }
/** One note on the guild board (spec §9.3). */
export interface QuestOffer {
  /** `${day}:${slot}`: once in a save. */
  id: string;
  kind: QuestKind; giver: GiverId; variant: 0 | 1;
  /** An enemy id (hunt, bounty), a material id (deliver), or a region id (scout, sweep). */
  target: string;
  /** How many (hunt, sweep, bounty, deliver), or the depth to reach (scout). */
  n: number;
  /** The quest depth its rewards were read at (spec §5); never shown. */
  depth: number;
  reward: QuestReward; merit: number;
}
/** A note taken (spec §9.3): where the count stood (`base`), and for a sweep the kinds it counts, frozen (plan ruling 9). */
export interface ActiveQuest extends QuestOffer { base: number; ids?: string[] }
/**
 * Gathering spec §0 item 16: the gathering tool made at the forge (none, 1 or 2) and how many of each gathered good was ever
 * gathered (`got`, the guild's `knownMaterial` and the inner voice read it). Absent until either is written.
 */
export interface GatherState {
  tool?: 1 | 2;
  got: Record<string, number>;
}

/** The guild board (spec §9.3); absent until the first board is posted, and never written while the board is shut. */
export interface GuildState {
  /** The day this board was posted on (its stream's key). */
  day: number;
  /** The notes still on it: at most BOARD_MAX. */
  offers: QuestOffer[];
  /** The quests taken: at most ACTIVE_MAX. */
  active: ActiveQuest[];
  /** 0 to GUILD_MAX; the lamp rank is derived from it (`rankOf`). */
  merit: number;
  /** The rank whose gift was paid last (0 to 4). */
  paid: number;
  /** The day whose board was looked at (the town's 新 mark). */
  viewed?: number;
  /** Anna has told how the board works. */
  intro?: true;
}

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
  /**
   * Roster plan Task C3 (spec §10, ruling 17): each kind of foe seen and felled, by definition id (engine/bestiary.ts).
   * Absent: nothing met yet. Unknown ids are dropped on load.
   */
  bestiary?: Bestiary;
  /**
   * Guild quests spec §9.3, §0 item 14: the guild board. Absent while the board is shut (`guildOpen`) and until the first
   * board is posted; unknown targets are dropped on load (`repairGuild`).
   */
  guild?: GuildState;
  /**
   * Gathering spec §0 item 16: the tool and what was gathered. Absent while gathering is shut (`gatherOpen`) and until the
   * first gathering or tool; unknown goods are dropped on load (`repairGather`).
   */
  gather?: GatherState;
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
