import type { CharacterId } from '../../engine/types';
import { CHARACTER_IDS } from '../characters';
import { CHAINS } from './chains';
import { TOWN_FRAGMENTS, type TownFragmentId } from './fragments';

export type ActNode = 'act2' | 'act3' | 'act4';
export const ACT_DEPTHS: Record<ActNode, number> = { act2: 4, act3: 10, act4: 16 };
/** The act nodes in story order. */
export const ACT_NODES: ActNode[] = ['act2', 'act3', 'act4'];
export const FINALE_DEPTH = 30;
/**
 * The finale's boss: the 燈喰之獸 under another name (spec §8.4; the name is `STORY.finaleBossName`). `power` multiplies its hp, atk and mag after the party-size
 * scale (1 leaves the ordinary boss as it is). It is a balance knob: 6b Task 20c set it 1 -> 0.8 (band 19b, the finale, .125 -> .575).
 */
export const FINALE_BOSS = { base: 'lanterneater', power: 0.8 };

export type Stage = 'prologue' | 'act1' | 'act2' | 'act3' | 'act4' | 'after';
export const STAGES: Stage[] = ['prologue', 'act1', 'act2', 'act3', 'act4', 'after'];

export type SceneId =
  | 'prologue' | 'prologue-inn' | 'first-return' | 'act1-after' | ActNode | 'rin-reveal' | 'rin-confess' | 'bellkeeper-arrives' | 'hero-alone'
  | 'finale-eve' | 'finale' | 'epilogue'
  | `mem:${CharacterId}:${number}` | `chat:${CharacterId}:${number}` | `town:${TownFragmentId}` | `home:${HomeOwner}`
  | `banter:${BanterPair}:${number}` | GroupScene;

/**
 * Story L (spec §5): the group scene after an act, `group:<act>`. It plays in the reaction slot of the act's own arrival or
 * the next return (`engine/story/events.ts`), as the first thing of the night. Its gate is `GROUP_GATE`; only the ones written
 * are registered in `REACTIONS` (and in `SCENE_IDS`).
 */
export type GroupScene = `group:${ActNode}`;
export const groupScene = (node: ActNode): GroupScene => `group:${node}`;
/**
 * The group scenes written and playable, by the act they follow (story L Tasks 9-11 register each one with its script; each
 * is in `SCENE_IDS` too). Its gate, `GROUP_GATE`, is further down.
 */
export const REACTIONS: Partial<Record<ActNode, GroupScene>> = { act2: 'group:act2', act3: 'group:act3', act4: 'group:act4' };

export const memScene = (id: CharacterId, n: number): SceneId => `mem:${id}:${n}`;

/**
 * The companions whose ending spec §6 places in the town (continuity fix 2): Chizuru's shrine, Safira's dance in the square,
 * Sylvie's sprout, Liz at the shop door. Each `home:<c>` plays once, on the first return after her last piece (lore ledger I-118).
 */
export type HomeOwner = 'chizuru' | 'safira' | 'sylvie' | 'liz';
export const HOME_OWNERS: HomeOwner[] = ['chizuru', 'safira', 'sylvie', 'liz'];
export const homeScene = (id: HomeOwner): SceneId => `home:${id}`;

export const CHAT_COUNT: Record<CharacterId, number> = {
  hero: 5, rin: 4, noel: 2, chizuru: 2, liz: 2, sylvie: 2, scarlet: 2, selene: 2, safira: 2, bobby: 2,
};

/**
 * B1, town banter (voice-pass sample §6): two companions talk among themselves on a return, while Lorne listens. A pair is
 * `<a>-<b>`, the two ids sorted; never the hero. `BANTER_COUNT` is how many banters each pair has (`banter:<pair>:1` up);
 * `BANTER_PAIRS` is the fixed order that breaks ties when the least-heard pair is picked (`nextBanter`).
 */
export type BanterPair = `${CharacterId}-${CharacterId}`;
export const BANTER_COUNT: Partial<Record<BanterPair, number>> = {
  // B1's three fixtures, then B2 (lore ledger I-158), then the story depth design's friction (§7.2–§7.4).
  // 發佈之前編號可以重排（遊戲還沒上線，舊存檔不必相容：使用者裁定，故事深度 Task 5 取消）；發佈之後，一個配對只往後加。
  'liz-scarlet': 3, 'noel-rin': 2, 'safira-sylvie': 3,
  'bobby-chizuru': 2, 'bobby-liz': 1, 'bobby-noel': 1, 'bobby-sylvie': 2, 'chizuru-rin': 2, 'chizuru-safira': 1, 'chizuru-scarlet': 1,
  'liz-noel': 1, 'liz-selene': 1, 'noel-selene': 3, 'rin-scarlet': 3, 'rin-sylvie': 2, 'safira-scarlet': 2, 'scarlet-selene': 1, 'selene-sylvie': 1,
  'chizuru-noel': 2, 'rin-selene': 2,
};
export const BANTER_PAIRS: BanterPair[] = (Object.keys(BANTER_COUNT) as BanterPair[]).sort();
/**
 * The six closing banters the story depth design names in its ruling 9 (design §9.3 point 10: the payoffs gated on `oath`
 * or `full`, every one heard before depth 30 in the scripted play); the plan's scheduling targets are built on this list.
 * A pair whose next banter is one of them, or leads to one, goes first in the banter pick (`engine/story/events.ts`
 * `pickBanter`; Task 6 third ruling). The §6 setup/payoff banters outside it are checked by the scripted plays too.
 */
export const BANTER_PAYOFFS: ReadonlySet<SceneId> = new Set<SceneId>([
  'banter:rin-scarlet:3', 'banter:rin-selene:2', 'banter:safira-sylvie:3', 'banter:liz-scarlet:3', 'banter:noel-selene:3', 'banter:chizuru-noel:2',
]);
export const banterScene = (pair: BanterPair, n: number): SceneId => `banter:${pair}:${n}`;
/** The two of a banter scene, from its id. */
export const banterTwo = (id: SceneId): [CharacterId, CharacterId] => id.split(':')[1].split('-') as [CharacterId, CharacterId];

/**
 * `prologue-inn` is the first night, right after the prologue and before the town is the player's; `first-return` is the
 * first arrival in town after a won fight (Task 10b: why the two of them go down together; lore ledger I-81 to I-86).
 * `bellkeeper-arrives` is the arrival after Rin's reveal: the society learns of her choice and its keeper comes to town
 * (continuity fix 4; lore ledger I-119).
 * Story depth (design §7.4, §7.5): `rin-confess` is her confession at the dinner of the return after her reveal;
 * `hero-alone` the morning he means to go down alone, played on a departure; `epilogue` the lantern festival, the first
 * return after the finale (controller ruling d: pulled from 6e into the main line).
 * Story L (spec §4.8): `finale-eve`, the night before the descent: one line of narration on the first departure once her
 * choice is made and the main road reaches `EVE_DEPTH`, then up to three companions' untold memories.
 */
export type MajorScene =
  | 'prologue' | 'prologue-inn' | 'first-return' | 'act1-after' | ActNode | 'rin-reveal' | 'rin-confess' | 'bellkeeper-arrives' | 'hero-alone'
  | 'finale-eve' | 'finale' | 'epilogue';
export const MAJOR_SCENES: MajorScene[] = [
  'prologue', 'prologue-inn', 'first-return', 'act1-after', 'act2', 'act3', 'act4', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'hero-alone', 'finale-eve', 'finale', 'epilogue',
];
/** Story L spec §4.8: the main road's deepest reach that queues the night before the descent (once her choice is made). */
export const EVE_DEPTH = 26;
/**
 * The major scenes whose cap is not twelve: Act 1's close; the two short scenes of the opening (Task 10b); and, from the
 * story depth design (§7.4, §7.5), the bellkeeper's arrival (6 -> 10), the lone morning, the finale (12 -> 16) and the festival
 * (six core lines and at most ten more, affinity spec §8.5).
 */
const MAJOR_CAPS: Partial<Record<MajorScene, number>> = {
  'act1-after': 3, 'prologue-inn': 10, 'first-return': 10, 'bellkeeper-arrives': 10, 'rin-confess': 12, 'hero-alone': 10, finale: 16, epilogue: 16,
  'finale-eve': 2,   // story L spec §11
};

/** Every scene id, in a fixed order: major scenes, then memories, chats, returns, homecomings, banters (B1) and the group scenes (story L). */
export const SCENE_IDS: SceneId[] = [
  ...MAJOR_SCENES,
  ...CHARACTER_IDS.flatMap((id) => CHAINS[id].pieces.map((_, i) => memScene(id, i + 1))),
  ...CHARACTER_IDS.flatMap((id) => Array.from({ length: CHAT_COUNT[id] }, (_, i): SceneId => `chat:${id}:${i + 1}`)),
  ...TOWN_FRAGMENTS.map((f): SceneId => `town:${f.id}`),
  ...HOME_OWNERS.map(homeScene),
  ...BANTER_PAIRS.flatMap((p) => Array.from({ length: BANTER_COUNT[p] ?? 0 }, (_, i) => banterScene(p, i + 1))),
  ...ACT_NODES.flatMap((n): SceneId[] => (REACTIONS[n] ? [REACTIONS[n]] : [])),   // story L: the written group scenes
];

const SCENE_SET = new Set<string>(SCENE_IDS);
export const isSceneId = (v: unknown): v is SceneId => typeof v === 'string' && SCENE_SET.has(v);

export type SceneKind = 'major' | 'memory' | 'chat' | 'town' | 'home' | 'banter' | 'group';
export function sceneKind(id: SceneId): SceneKind {
  if (id.startsWith('mem:')) return 'memory';
  if (id.startsWith('chat:')) return 'chat';
  if (id.startsWith('town:')) return 'town';
  if (id.startsWith('home:')) return 'home';
  if (id.startsWith('banter:')) return 'banter';
  if (id.startsWith('group:')) return 'group';
  return 'major';
}

const LONG_MEMORIES = new Set<SceneId>(['mem:hero:9', 'mem:hero:10', 'mem:rin:7']);

/** The most lines a scene may have (spec §8.2, §17). */
export function lineCap(id: SceneId): number {
  switch (sceneKind(id)) {
    case 'major': return MAJOR_CAPS[id as MajorScene] ?? 12;
    case 'memory': return LONG_MEMORIES.has(id) ? 12 : 5;
    case 'chat': return 3;
    case 'town': return 8;
    case 'home': return 4;
    case 'banter': return 4;
    case 'group': return 12;
  }
}

/** The fewest lines a group scene may have (story L spec §5.1). */
export const GROUP_MIN_LINES = 8;

/**
 * What a chat, a banter (and from the story depth plan, a return line) waits on; every kind it names has to hold
 * (`engine/story/events.ts` `gateOpen`):
 * - `stage`: the story has reached that stage;
 * - `oath`: Rin has made her choice;
 * - `full`: that one holds all of her memories;
 * - `beforeChoice`: Rin has not made her choice yet. Once she has, the gate is expired (`gateExpired`): the scene never
 *   plays, and it no longer holds back the ones after it (it counts as passed, never as seen);
 * - `pieces`: each one named holds at least that many memory pieces;
 * - `seen`: every scene named has been seen;
 * - `met`: every one named has been met (story L spec §5.2).
 * `full` and `pieces` count a companion's pieces told (`storyPieces`); Lorne's and Rin's count the pieces held.
 */
export interface StoryGate {
  stage?: Stage;
  oath?: true;
  full?: CharacterId;
  beforeChoice?: true;
  pieces?: Partial<Record<CharacterId, number>>;
  seen?: SceneId[];
  met?: CharacterId[];
  /** Story depth Task 15 review: where Rin's confession was told (`StoryState.confession`); the other place expires it. */
  confession?: 'dinner';
}

/**
 * Chats that wait (`StoryGate`). A chat with no entry is open as soon as the person is met.
 * `position` in the story tests reads it; `nextChat` reads it from Task 3. The first chat of anyone is never gated.
 * Every entry needs a reason in the lore ledger.
 */
export const CHAT_GATE: Partial<Record<SceneId, StoryGate>> = {
  // Task 6: Lorne's chats follow the acts (lore ledger I-47).
  'chat:hero:2': { stage: 'act2' }, 'chat:hero:3': { stage: 'act3' }, 'chat:hero:4': { stage: 'act4' },
  // Task 7: Rin's chats. She looks away only from her 4th piece (act 3); her last chat is her choice (lore ledger I-54).
  'chat:rin:2': { stage: 'act2' }, 'chat:rin:3': { stage: 'act3' }, 'chat:rin:4': { oath: true },
  // Task 8: Selene is met at depth 2; her 「您每一次，都把大家帶回來了」 waits for act 3, where coming back has its weight (I-64).
  'chat:selene:2': { stage: 'act3' },
  // Story depth (design §7.4): Anna has stopped counting the papers on the guild door; it waits for act 4, when the town turns.
  'chat:hero:5': { stage: 'act4' },
};

/**
 * Story L spec §5.2: who a group scene needs met (Lorne aside). It has two chances, its act's arrival and the next return
 * (`StoryState.reacts`); `group:act3` also expires once Rin has made her choice.
 */
export const GROUP_GATE: Record<GroupScene, StoryGate> = {
  'group:act2': { met: ['selene', 'noel'] },
  'group:act3': { met: ['sylvie', 'bobby'], beforeChoice: true },
  'group:act4': { met: ['liz', 'scarlet', 'chizuru', 'safira'] },
};

/**
 * Banters that wait (B1), used like `CHAT_GATE` (`StoryGate`). A banter with no entry is open as soon as both of its two are
 * met; no gate can open it sooner. Every entry needs a reason in the lore ledger.
 */
export const BANTER_GATE: Partial<Record<SceneId, StoryGate>> = {
  // B2 (lore ledger §5): later chapters of a pair. A stage for time spent together, Rin's choice for the Rin who teases back,
  // a full memory for the one who has changed.
  'banter:liz-noel:1': { stage: 'act3' }, 'banter:noel-rin:2': { oath: true },
  // Story depth (design §7.2–§7.4; lore ledger §5): the friction. Pieces for what one has learnt of the other; before her
  // choice for what only fits then (missed, it holds nothing back); the confession for the seventh night.
  'banter:chizuru-noel:1': { pieces: { noel: 1 } },
  'banter:liz-scarlet:2': { stage: 'act2', pieces: { scarlet: 2 } },
  'banter:safira-sylvie:2': { pieces: { safira: 2 } },
  'banter:rin-sylvie:1': { stage: 'act3', beforeChoice: true },
  'banter:rin-selene:1': { stage: 'act3', beforeChoice: true },
  'banter:safira-scarlet:2': { stage: 'act3', pieces: { safira: 2 } },
  'banter:noel-selene:2': { pieces: { noel: 3 } },
  'banter:bobby-chizuru:2': { pieces: { bobby: 4, chizuru: 3 } },   // Task 4 ruling: Bobby's apology is her fourth piece
  'banter:bobby-sylvie:2': { stage: 'act3' },
  'banter:rin-scarlet:2': { oath: true, seen: ['rin-confess'], confession: 'dinner' },
  'banter:rin-scarlet:3': { oath: true, full: 'scarlet', seen: ['rin-confess'] },
  'banter:rin-selene:2': { oath: true, full: 'selene' },
  'banter:rin-sylvie:2': { oath: true },
  'banter:chizuru-rin:2': { oath: true },
  'banter:chizuru-noel:2': { full: 'noel' },
  // the three moved ones keep their old gates, with a stage (design §7.4)
  'banter:safira-sylvie:3': { stage: 'act3', full: 'safira' },
  'banter:liz-scarlet:3': { stage: 'act3', full: 'scarlet' },
  'banter:noel-selene:3': { stage: 'act3', full: 'selene' },
};

/**
 * Fix round 3: the closing memory pieces: each chain's last piece, and Lorne's and Rin's last two (the keeper and the lamp key;
 * her code name and her errand). Derived from the chain lengths; a middle piece stays light. A memory piece normally plays in
 * the dungeon the moment it drops, so it never reaches the town arrival; only the hero's depth-25 top-up and the pieces of the
 * finale fight are queued for town (`Game.takePieces`). In practice this list suppresses a banter for `mem:hero:9` alone; the
 * closing pieces are listed so the rule still holds if more pieces ever play on the arrival.
 */
export const CLOSING_PIECES: SceneId[] = CHARACTER_IDS.flatMap((id) => {
  const n = CHAINS[id].pieces.length;
  return (id === 'hero' || id === 'rin' ? [n - 1, n] : [n]).map((k) => memScene(id, k));
});
/**
 * Story depth Task 3 (plan ruling 5). `ALONE`: a scene that plays by itself on its arrival (the reveal first); the chat and
 * the banter wait for the next return. `HEAVY_MAJORS`: one of them an arrival, the first in play order; the others stay in
 * the queue for the next return. `DEPARTURE_SCENES`: played on a departure (`Game.departScenes`), never on an arrival.
 */
export const ALONE: readonly SceneId[] = ['rin-reveal', 'rin-confess'];
export const HEAVY_MAJORS: ReadonlySet<SceneId> = new Set<SceneId>(['act2', 'act3', 'act4', 'bellkeeper-arrives', 'epilogue']);
export const DEPARTURE_SCENES: readonly SceneId[] = ['finale-eve', 'hero-alone'];

// ---- Light or heavy (style bible §2.2; moved here from voiceGates.ts in story depth Task 3: the engine reads it) ----

const HEAVY_SCENES = new Set<SceneId>([
  'prologue', 'act2', 'act3', 'act4', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'hero-alone', 'finale', 'epilogue',
  'chat:rin:2', 'chat:rin:3', 'chat:rin:4', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4',
]);
/** Whether a scene is heavy: every memory, every townsfolk return, every group scene (story L), and the scenes the bible names. */
export function heavyScene(id: SceneId): boolean {
  const kind = sceneKind(id);
  return kind === 'memory' || kind === 'town' || kind === 'group' || HEAVY_SCENES.has(id);
}

/**
 * B1 ruling (fix round 1): no light banter after a heavy arrival. A return whose arrival (the queue, and the scene in the chat
 * slot) holds one of these plays no banter; the banter waits for the next return (it is never queued, so nothing is lost). An
 * entry ending in `:` is a prefix (6d's `romance:<c>`); any other is an exact id. Rin's reveal plays alone anyway; the return
 * right after the finale is heavy too (`arrivalScenes`' `afterFinale`). Light, by ruling: `home:*` and 6d's `ending:<c>`
 * (a companion's happy after-story; the warm line comes last), middle memory pieces, `first-return`, `act1-after`.
 * 6d adds its heavy scenes here.
 */
export const HEAVY_ARRIVAL: readonly string[] = ['rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'hero-alone', ...ACT_NODES, ...CLOSING_PIECES, 'finale', 'epilogue', 'romance:'];
export const isHeavyArrival = (id: string): boolean => HEAVY_ARRIVAL.some((h) => (h.endsWith(':') ? id.startsWith(h) : id === h));
