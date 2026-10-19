import { CHARACTER_IDS, titleOf } from '../../data/characters';
import { ENEMIES } from '../../data/enemies';
import { SETS, SPECIALS } from '../../data/gear';
import { REGIONS } from '../../data/regions';
import { CHAINS, chainLength } from '../../data/story/chains';
import { TOWN_FRAGMENTS, type TownFragmentId } from '../../data/story/fragments';
import { CHAT_COUNT, HOME_OWNERS, homeScene, memScene, type HomeOwner, type SceneId, type Stage, STAGES } from '../../data/story/scenes';
import { STORY } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { memoriesOf } from '../progression';
import type { GameState } from '../state';
import type { CharacterId, Element } from '../types';

/** `seen` is what makes a piece replayable: a found piece can still be waiting in the story queue. */
export interface PiecePage { n: number; scene: SceneId; found: boolean; seen: boolean; fresh: boolean; hint: string }
export interface MemoryPage { id: CharacterId; met: boolean; pieces: PiecePage[] }
/** A scene the handbook can replay: only scenes already seen are listed. */
export interface SceneEntry { scene: SceneId; title: string; fresh: boolean }
export interface PersonPage { id: CharacterId; met: boolean; title: string; segments: string[]; scenes: SceneEntry[] }
export interface TownPage { id: TownFragmentId; status: 'unknown' | 'held' | 'returned'; lines: string[]; scene: SceneEntry | null }
export interface CodexPage { specials: string[]; sets: string[]; monsters: { id: string; name: string; weak: Element[] | null }[] }
export interface TruthPage { stage: Stage; unlocked: boolean; text: string | null; scenes: SceneEntry[] }
export interface Handbook { memories: MemoryPage[]; people: PersonPage[]; town: TownPage[]; codex: CodexPage; truths: TruthPage[] }

/** The one major scene each truth page replays. */
const TRUTH_SCENE: Record<Stage, SceneId> = {
  prologue: 'prologue', act1: 'act1-after', act2: 'act2', act3: 'act3', act4: 'act4', after: 'finale',
};

/** How deep a piece lies (spec §7.6): the example reads 「熾焰之地・深處」. */
const hintOf = (id: CharacterId, i: number): string => {
  const p = CHAINS[id].pieces[i];
  return T.ui2.handbook.pieceHint(p.regions.map((r) => REGIONS[r].name).join('、'), p.minDepth >= 6);
};

/** Titles, newness and the seen-only rule, for one state. */
function entryMaker(s: GameState) {
  const seen = new Set<SceneId>(s.story.seen);
  const fresh = new Set<SceneId>(s.story.fresh);
  const entry = (scene: SceneId): SceneEntry | null => (seen.has(scene) ? { scene, title: STORY.scenes[scene].title, fresh: fresh.has(scene) } : null);
  const entries = (scenes: SceneId[]): SceneEntry[] => scenes.flatMap((id) => entry(id) ?? []);
  return { entry, entries, fresh, seen };
}

/** Everything the adventurer's handbook shows, from the state alone. */
export function handbook(s: GameState): Handbook {
  const { entry, entries, fresh, seen } = entryMaker(s);
  const memories = CHARACTER_IDS.map((id): MemoryPage => {
    const have = memoriesOf(s.party.roster[id]);
    return {
      id, met: s.party.recruited.includes(id),
      pieces: CHAINS[id].pieces.map((_, i) => {
        const scene = memScene(id, i + 1);
        return { n: i + 1, scene, found: i + 1 <= have, seen: seen.has(scene), fresh: fresh.has(scene), hint: hintOf(id, i) };
      }),
    };
  });
  const people = CHARACTER_IDS.map((id): PersonPage => {
    const m = s.party.roster[id];
    const met = s.party.recruited.includes(id);
    const have = memoriesOf(m);
    const len = chainLength(id);
    // Rin's fourth page tells her choice: it opens with her oath, not with a piece (continuity fix 3).
    const k = !met ? 0 : id === 'rin' && m.oath ? 4 : have >= len ? 3 : have >= Math.ceil(len / 2) ? 2 : 1;
    const chats = Array.from({ length: CHAT_COUNT[id] }, (_, i): SceneId => `chat:${id}:${i + 1}`);
    const home: SceneId[] = (HOME_OWNERS as string[]).includes(id) ? [homeScene(id as HomeOwner)] : [];
    // Rin's page also replays the two of them before her story (the inn night and the first return, Task 10b) and the
    // bellkeeper's arrival after it (continuity fix 4); a homecoming sits last on its owner's page (continuity fix 2).
    const own: SceneId[] = id === 'rin' ? ['prologue-inn', 'first-return', 'rin-reveal', 'bellkeeper-arrives', ...chats] : [...chats, ...home];
    return { id, met, title: titleOf(m), segments: STORY.people[id].slice(0, k), scenes: entries(own) };
  });
  const town = TOWN_FRAGMENTS.map((f): TownPage => {
    const lines = STORY.town[f.id];
    const returned = s.story.returned.includes(f.id);
    const held = (s.inventory[f.item] ?? 0) > 0;
    const status = returned ? 'returned' : held ? 'held' : 'unknown';
    return {
      id: f.id, status, scene: returned ? entry(`town:${f.id}`) : null,
      lines: status === 'returned' ? [lines.lost, lines.after] : status === 'held' ? [lines.lost] : [],
    };
  });
  const codex: CodexPage = {
    // A set piece sits in SPECIALS too, but it is listed under its set, not twice.
    specials: s.codex.filter((id) => Object.hasOwn(SPECIALS, id) && !SPECIALS[id].set),
    sets: s.codex.filter((id) => Object.hasOwn(SETS, id)),
    monsters: Object.values(ENEMIES).filter((e) => !e.story).map((e) => ({ id: e.id, name: e.name, weak: s.revealed[e.id] ? [...s.revealed[e.id]] : null })),
  };
  const open = (stage: Stage): boolean => {
    switch (stage) {
      case 'prologue': return true;
      case 'act1': return s.story.act1Cleared;
      case 'after': return s.story.finaleCleared;
      default: return s.story.nodes.includes(stage);
    }
  };
  const truths = STAGES.map((stage): TruthPage => ({
    stage, unlocked: open(stage), text: open(stage) ? STORY.truths[stage] : null, scenes: entries([TRUTH_SCENE[stage]]),
  }));
  return { memories, people, town, codex, truths };
}
