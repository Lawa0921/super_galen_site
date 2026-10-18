import type { CharacterId } from '../../engine/types';
import { CHARACTER_IDS } from '../characters';
import { CHAINS } from './chains';
import { TOWN_FRAGMENTS, type TownFragmentId } from './fragments';

export type ActNode = 'act2' | 'act3' | 'act4';
export const ACT_DEPTHS: Record<ActNode, number> = { act2: 4, act3: 10, act4: 16 };
export const FINALE_DEPTH = 30;
/**
 * The finale's boss: the 燈喰之獸 under another name (spec §8.4; the name is `STORY.finaleBossName`). `power` multiplies its hp, atk and mag after the party-size
 * scale (1 leaves the ordinary boss as it is). It is a balance knob: 6b Task 20c set it 1 -> 0.8 (band 19b, the finale, .125 -> .575).
 */
export const FINALE_BOSS = { base: 'lanterneater', power: 0.8 };

export type Stage = 'prologue' | 'act1' | 'act2' | 'act3' | 'act4' | 'after';
export const STAGES: Stage[] = ['prologue', 'act1', 'act2', 'act3', 'act4', 'after'];

export type SceneId =
  | 'prologue' | 'act1-after' | ActNode | 'rin-reveal' | 'finale'
  | `mem:${CharacterId}:${number}` | `chat:${CharacterId}:${number}` | `town:${TownFragmentId}`;

export const memScene = (id: CharacterId, n: number): SceneId => `mem:${id}:${n}`;

export const CHAT_COUNT: Record<CharacterId, number> = {
  hero: 4, rin: 4, noel: 2, chizuru: 2, liz: 2, sylvie: 2, scarlet: 2, selene: 2, safira: 2, bobby: 2,
};

export type MajorScene = 'prologue' | 'act1-after' | ActNode | 'rin-reveal' | 'finale';
export const MAJOR_SCENES: MajorScene[] = ['prologue', 'act1-after', 'act2', 'act3', 'act4', 'rin-reveal', 'finale'];

/** Every scene id, in a fixed order: major scenes, then memories, chats and returns. */
export const SCENE_IDS: SceneId[] = [
  ...MAJOR_SCENES,
  ...CHARACTER_IDS.flatMap((id) => CHAINS[id].pieces.map((_, i) => memScene(id, i + 1))),
  ...CHARACTER_IDS.flatMap((id) => Array.from({ length: CHAT_COUNT[id] }, (_, i): SceneId => `chat:${id}:${i + 1}`)),
  ...TOWN_FRAGMENTS.map((f): SceneId => `town:${f.id}`),
];

const SCENE_SET = new Set<string>(SCENE_IDS);
export const isSceneId = (v: unknown): v is SceneId => typeof v === 'string' && SCENE_SET.has(v);

export type SceneKind = 'major' | 'memory' | 'chat' | 'town';
export function sceneKind(id: SceneId): SceneKind {
  if (id.startsWith('mem:')) return 'memory';
  if (id.startsWith('chat:')) return 'chat';
  if (id.startsWith('town:')) return 'town';
  return 'major';
}

const LONG_MEMORIES = new Set<SceneId>(['mem:hero:9', 'mem:hero:10', 'mem:rin:7']);

/** The most lines a scene may have (spec §8.2, §17). */
export function lineCap(id: SceneId): number {
  switch (sceneKind(id)) {
    case 'major': return id === 'act1-after' ? 3 : 12;
    case 'memory': return LONG_MEMORIES.has(id) ? 12 : 4;
    case 'chat': return 3;
    case 'town': return 8;
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
};
