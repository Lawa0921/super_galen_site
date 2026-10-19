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
  | 'prologue' | 'prologue-inn' | 'first-return' | 'act1-after' | ActNode | 'rin-reveal' | 'bellkeeper-arrives' | 'finale'
  | `mem:${CharacterId}:${number}` | `chat:${CharacterId}:${number}` | `town:${TownFragmentId}` | `home:${HomeOwner}`
  | `banter:${BanterPair}:${number}`;

export const memScene = (id: CharacterId, n: number): SceneId => `mem:${id}:${n}`;

/**
 * The companions whose ending spec §6 places in the town (continuity fix 2): Chizuru's shrine, Safira's dance in the square,
 * Sylvie's sprout, Liz at the shop door. Each `home:<c>` plays once, on the first return after her last piece (lore ledger I-118).
 */
export type HomeOwner = 'chizuru' | 'safira' | 'sylvie' | 'liz';
export const HOME_OWNERS: HomeOwner[] = ['chizuru', 'safira', 'sylvie', 'liz'];
export const homeScene = (id: HomeOwner): SceneId => `home:${id}`;

export const CHAT_COUNT: Record<CharacterId, number> = {
  hero: 4, rin: 4, noel: 2, chizuru: 2, liz: 2, sylvie: 2, scarlet: 2, selene: 2, safira: 2, bobby: 2,
};

/**
 * B1, town banter (voice-pass sample §6): two companions talk among themselves on a return, while Lorne listens. A pair is
 * `<a>-<b>`, the two ids sorted; never the hero. `BANTER_COUNT` is how many banters each pair has (`banter:<pair>:1` up);
 * `BANTER_PAIRS` is the fixed order that breaks ties when the least-heard pair is picked (`nextBanter`).
 */
export type BanterPair = `${CharacterId}-${CharacterId}`;
export const BANTER_COUNT: Partial<Record<BanterPair, number>> = { 'liz-scarlet': 1, 'noel-rin': 1, 'safira-sylvie': 1 };
export const BANTER_PAIRS: BanterPair[] = (Object.keys(BANTER_COUNT) as BanterPair[]).sort();
export const banterScene = (pair: BanterPair, n: number): SceneId => `banter:${pair}:${n}`;
/** The two of a banter scene, from its id. */
export const banterTwo = (id: SceneId): [CharacterId, CharacterId] => id.split(':')[1].split('-') as [CharacterId, CharacterId];

/**
 * `prologue-inn` is the first night, right after the prologue and before the town is the player's; `first-return` is the
 * first arrival in town after a won fight (Task 10b: why the two of them go down together; lore ledger I-81 to I-86).
 * `bellkeeper-arrives` is the arrival after Rin's reveal: the society learns of her choice and its keeper comes to town
 * (continuity fix 4; lore ledger I-119).
 */
export type MajorScene = 'prologue' | 'prologue-inn' | 'first-return' | 'act1-after' | ActNode | 'rin-reveal' | 'bellkeeper-arrives' | 'finale';
export const MAJOR_SCENES: MajorScene[] = ['prologue', 'prologue-inn', 'first-return', 'act1-after', 'act2', 'act3', 'act4', 'rin-reveal', 'bellkeeper-arrives', 'finale'];
/** The two short scenes of the opening: ten lines each at most (Task 10b). */
const OPENING_SCENES = new Set<SceneId>(['prologue-inn', 'first-return']);
/** The bellkeeper's arrival is a short scene: six lines at most (continuity fix 4). */
const BELLKEEPER_CAP = 6;

/** Every scene id, in a fixed order: major scenes, then memories, chats, returns, homecomings and banters (B1). */
export const SCENE_IDS: SceneId[] = [
  ...MAJOR_SCENES,
  ...CHARACTER_IDS.flatMap((id) => CHAINS[id].pieces.map((_, i) => memScene(id, i + 1))),
  ...CHARACTER_IDS.flatMap((id) => Array.from({ length: CHAT_COUNT[id] }, (_, i): SceneId => `chat:${id}:${i + 1}`)),
  ...TOWN_FRAGMENTS.map((f): SceneId => `town:${f.id}`),
  ...HOME_OWNERS.map(homeScene),
  ...BANTER_PAIRS.flatMap((p) => Array.from({ length: BANTER_COUNT[p] ?? 0 }, (_, i) => banterScene(p, i + 1))),
];

const SCENE_SET = new Set<string>(SCENE_IDS);
export const isSceneId = (v: unknown): v is SceneId => typeof v === 'string' && SCENE_SET.has(v);

export type SceneKind = 'major' | 'memory' | 'chat' | 'town' | 'home' | 'banter';
export function sceneKind(id: SceneId): SceneKind {
  if (id.startsWith('mem:')) return 'memory';
  if (id.startsWith('chat:')) return 'chat';
  if (id.startsWith('town:')) return 'town';
  if (id.startsWith('home:')) return 'home';
  if (id.startsWith('banter:')) return 'banter';
  return 'major';
}

const LONG_MEMORIES = new Set<SceneId>(['mem:hero:9', 'mem:hero:10', 'mem:rin:7']);

/** The most lines a scene may have (spec §8.2, §17). */
export function lineCap(id: SceneId): number {
  switch (sceneKind(id)) {
    case 'major': return id === 'act1-after' ? 3 : OPENING_SCENES.has(id) ? 10 : id === 'bellkeeper-arrives' ? BELLKEEPER_CAP : 12;
    case 'memory': return LONG_MEMORIES.has(id) ? 12 : 4;
    case 'chat': return 3;
    case 'town': return 8;
    case 'home': return 4;
    case 'banter': return 4;
  }
}

/**
 * Chats that wait: a later `stage`, and/or Rin's choice (`oath`). A chat with no entry is open as soon as the person is met.
 * `position` in the story tests reads it; `nextChat` reads it from Task 3. The first chat of anyone is never gated.
 * Every entry needs a reason in the lore ledger.
 */
export const CHAT_GATE: Partial<Record<SceneId, { stage?: Stage; oath?: true }>> = {
  // Task 6: Lorne's chats follow the acts (lore ledger I-47).
  'chat:hero:2': { stage: 'act2' }, 'chat:hero:3': { stage: 'act3' }, 'chat:hero:4': { stage: 'act4' },
  // Task 7: Rin's chats. She looks away only from her 4th piece (act 3); her last chat is her choice (lore ledger I-54).
  'chat:rin:2': { stage: 'act2' }, 'chat:rin:3': { stage: 'act3' }, 'chat:rin:4': { oath: true },
  // Task 8: Selene is met at depth 2; her 「您每一次，都把大家帶回來了」 waits for act 3, where coming back has its weight (I-64).
  'chat:selene:2': { stage: 'act3' },
};

/**
 * Banters that wait (B1), used like `CHAT_GATE`: a later `stage`, Rin's choice (`oath`), and/or one of the two holding all of
 * her memories (`full`). A banter with no entry is open as soon as both of its two are met; no gate can open it sooner.
 * Every entry needs a reason in the lore ledger.
 */
export interface BanterGate { stage?: Stage; oath?: true; full?: CharacterId }
export const BANTER_GATE: Partial<Record<SceneId, BanterGate>> = {};
