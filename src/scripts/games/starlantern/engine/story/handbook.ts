import { CHARACTER_IDS, titleOf } from '../../data/characters';
import { ENEMIES } from '../../data/enemies';
import { SETS, SPECIALS } from '../../data/gear';
import { REGIONS } from '../../data/regions';
import { CHAINS, chainLength } from '../../data/story/chains';
import { TOWN_FRAGMENTS, type TownFragmentId } from '../../data/story/fragments';
import { BANTER_COUNT, BANTER_PAIRS, CHAT_COUNT, HOME_OWNERS, SEASON_SCENES, banterScene, groupScene, homeScene, memScene, type HomeOwner, type SceneId, type Stage, STAGES } from '../../data/story/scenes';
import { STORY } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { memoriesOf } from '../progression';
import type { GameState } from '../state';
import type { CharacterId, Element } from '../types';
import { MEETINGS } from '../../data/meetings';
import { followedLeads, nextLead, type Lead } from './leads';
import { storyPieces } from './events';

/**
 * A found piece plays when it is told (`seen`) or still untold (story L spec §4.7: the handbook may tell it early). `fresh` is
 * the 新 mark: opened by the story setting's auto-skip and not read since, or untold.
 */
export interface PiecePage { n: number; scene: SceneId; found: boolean; seen: boolean; untold: boolean; fresh: boolean; hint: string }
/** `fresh`: her row's 新 mark, while any piece of hers is new (untold, or not read since an auto-skip). */
export interface MemoryPage { id: CharacterId; met: boolean; fresh: boolean; pieces: PiecePage[] }
/** A scene the handbook can replay: only scenes already seen are listed. */
export interface SceneEntry { scene: SceneId; title: string; fresh: boolean }
export interface PersonPage { id: CharacterId; met: boolean; title: string; segments: string[]; scenes: SceneEntry[] }
export interface TownPage { id: TownFragmentId; status: 'unknown' | 'held' | 'returned'; lines: string[]; scene: SceneEntry | null }
export interface CodexPage { specials: string[]; sets: string[]; monsters: { id: string; name: string; weak: Element[] | null }[] }
export interface TruthPage { stage: Stage; unlocked: boolean; text: string | null; scenes: SceneEntry[] }
/** The guild's leads (6c Task 16): the one to follow now, the ones already followed, and whether anyone is left at all. */
export interface LeadsPage { current: Lead | null; followed: Lead[]; allMet: boolean }
export interface Handbook { memories: MemoryPage[]; people: PersonPage[]; town: TownPage[]; codex: CodexPage; truths: TruthPage[]; leads: LeadsPage }

/** The one major scene each truth page replays. */
const TRUTH_SCENE: Record<Stage, SceneId> = {
  prologue: 'prologue', act1: 'act1-after', act2: 'act2', act3: 'act3', act4: 'act4', after: 'finale',
};

/**
 * How deep a piece lies (spec §7.6): the example reads 「熾焰之地・深處」. A piece that waits on the moon says which (time
 * and moon ruling 4): 「…・深處・滿月」, several joined by 「、」.
 */
const hintOf = (id: CharacterId, i: number): string => {
  const p = CHAINS[id].pieces[i];
  const moon = p.when?.moon?.map((m) => T.ui2.calendar.moon[m]).join('、');
  return T.ui2.handbook.pieceHint(p.regions.map((r) => REGIONS[r].name).join('、'), p.minDepth >= 6, moon);
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
  const untold = new Set<SceneId>(s.story.untold ?? []);
  const memories = CHARACTER_IDS.map((id): MemoryPage => {
    const have = memoriesOf(s.party.roster[id]);
    const met = s.party.recruited.includes(id);
    const pieces = CHAINS[id].pieces.map((_, i): PiecePage => {
      const scene = memScene(id, i + 1);
      const found = i + 1 <= have;
      const waits = found && untold.has(scene);
      return { n: i + 1, scene, found, seen: seen.has(scene), untold: waits, fresh: fresh.has(scene) || waits, hint: hintOf(id, i) };
    });
    return { id, met, fresh: met && pieces.some((p) => p.found && (p.seen || p.untold) && p.fresh), pieces };
  });
  const people = CHARACTER_IDS.map((id): PersonPage => {
    const m = s.party.roster[id];
    const met = s.party.recruited.includes(id);
    const have = storyPieces(s, id);   // story L spec §4.9: a companion's page opens by her pieces told
    const len = chainLength(id);
    // Rin's fourth page tells her choice: it opens with her oath, not with a piece (continuity fix 3).
    const k = !met ? 0 : id === 'rin' && m.oath ? 4 : have >= len ? 3 : have >= Math.ceil(len / 2) ? 2 : 1;
    const chats = Array.from({ length: CHAT_COUNT[id] }, (_, i): SceneId => `chat:${id}:${i + 1}`);
    const home: SceneId[] = (HOME_OWNERS as string[]).includes(id) ? [homeScene(id as HomeOwner)] : [];
    // Time and moon ruling 7: the spring festival at her shrine sits on Chizuru's page, after her homecoming.
    if (id === 'chizuru' && SEASON_SCENES.spring) home.push(SEASON_SCENES.spring);
    // B1: a banter sits on the page of each of its two, after her chats, in the pairs' fixed order.
    const banters = BANTER_PAIRS.filter((p) => p.split('-').includes(id))
      .flatMap((p) => Array.from({ length: BANTER_COUNT[p] ?? 0 }, (_, i) => banterScene(p, i + 1)));
    // Rin's page also replays the two of them before her story (the inn night and the first return, Task 10b), her
    // confession, the bellkeeper's arrival and the lone morning after it (continuity fix 4; story depth plan ruling 12); a
    // homecoming sits last on its owner's page (continuity fix 2).
    const own: SceneId[] = id === 'rin'
      ? ['prologue-inn', 'first-return', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'hero-alone', ...chats, ...banters]
      : [...chats, ...banters, ...home];
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
  // An act's page opens once its scene has played as well (final review I-2): the depth alone can come a whole stay early,
  // when Rin's reveal plays alone and holds the act for the next return.
  const open = (stage: Stage): boolean => {
    switch (stage) {
      case 'prologue': return true;
      case 'act1': return s.story.act1Cleared && seen.has(TRUTH_SCENE.act1);
      case 'after': return s.story.finaleCleared;
      default: return s.story.nodes.includes(stage) && seen.has(TRUTH_SCENE[stage]);
    }
  };
  // The after page replays the finale, then the lantern festival (story depth plan ruling 12). Story L: an act's page
  // replays its group scene after the act (spec §5.1), and the act 4 page then the night before the descent.
  const pageScenes = (stage: Stage): SceneId[] => {
    if (stage === 'after') return ['finale', 'epilogue'];
    if (stage === 'act2' || stage === 'act3' || stage === 'act4') return [TRUTH_SCENE[stage], groupScene(stage), ...(stage === 'act4' ? ['finale-eve' as const] : [])];
    return [TRUTH_SCENE[stage]];
  };
  const truths = STAGES.map((stage): TruthPage => ({
    stage, unlocked: open(stage), text: open(stage) ? STORY.truths[stage] : null, scenes: entries(pageScenes(stage)),
  }));
  const followed = followedLeads(s);
  const leads: LeadsPage = { current: nextLead(s), followed, allMet: followed.length === MEETINGS.length };
  return { memories, people, town, codex, truths, leads };
}
