import { CHARACTER_IDS, titleOf } from '../../data/characters';
import { ENEMIES } from '../../data/enemies';
import { BOSS_PARTS, LEGACY_ENEMY_IDS, MAINLINE_BOSSES, MAINLINE_WARDENS, REGION_BOSSES, REGION_WARDENS, listedEnemy } from '../../data/monsters';
import { BESTIARY, BESTIARY_UI } from '../../data/bestiary.zh-TW';
import { SETS, SPECIALS } from '../../data/gear';
import { REGIONS, type RegionId } from '../../data/regions';
import { CHAINS, chainLength } from '../../data/story/chains';
import { TOWN_FRAGMENTS, type TownFragmentId } from '../../data/story/fragments';
import { BANTER_COUNT, BANTER_PAIRS, CHAT_COUNT, HOME_OWNERS, SEASON_SCENES, banterScene, bondScene, groupScene, homeScene, memScene, type HomeOwner, type SceneId, type Stage, STAGES } from '../../data/story/scenes';
import { STORY } from '../../data/story.zh-TW';
import { T } from '../../data/text.zh-TW';
import { memoriesOf } from '../progression';
import type { GameState } from '../state';
import type { AnyStat, CharacterId, Element, EnemyDef } from '../types';
import { MEETINGS } from '../../data/meetings';
import { followedLeads, nextLead, type Lead } from './leads';
import { gateOpen, storyPieces } from './events';
import { bondOf, bondPoints, bondTier, giftPoints, knownTaste } from './bond';
import { BOND_CAP, BOND_PER_PIECE, GIFTABLE, type BondTier, type Companion, type Taste } from '../../data/story/bond';
import type { GiftId } from '../types';

/**
 * A found piece plays when it is told (`seen`) or still untold (story L spec §4.7: the handbook may tell it early). `fresh` is
 * the 新 mark: opened by the story setting's auto-skip and not read since, or untold.
 */
export interface PiecePage { n: number; scene: SceneId; found: boolean; seen: boolean; untold: boolean; fresh: boolean; hint: string }
/** `fresh`: her row's 新 mark, while any piece of hers is new (untold, or not read since an auto-skip). */
export interface MemoryPage { id: CharacterId; met: boolean; fresh: boolean; pieces: PiecePage[] }
/** A scene the handbook can replay: only scenes already seen are listed. */
export interface SceneEntry { scene: SceneId; title: string; fresh: boolean }
/** Bond plan Task 14: a companion's bond on her page: her tier and points, each source against its cap, what she was offered. */
export interface BondPage {
  tier: BondTier; points: number;
  sources: { memory: [number, number]; talk: [number, number]; gift: [number, number]; field: [number, number] };
  tastes: { mat: GiftId; taste: Taste }[];
}
export interface PersonPage { id: CharacterId; met: boolean; title: string; segments: string[]; scenes: SceneEntry[]; bond?: BondPage }
export interface TownPage { id: TownFragmentId; status: 'unknown' | 'held' | 'returned'; lines: string[]; scene: SceneEntry | null }
/** Roster plan Task C6: the bestiary's three filters (spec §10). */
export type BeastFilter = 'road' | 'lands' | 'bosses';
export const BEAST_FILTERS: readonly BeastFilter[] = ['road', 'lands', 'bosses'];
/**
 * One kind of foe on the bestiary page (roster plan Task C6, spec §10, rulings 17-18). Not seen yet: its name is
 * 「？？？」 and only `haunts` is told (no silhouette). Seen: its name, weakness (`prism`, one that turns), tallies and
 * `trait`. Felled: its `lines` whose gates are open, its materials and its inscription key. A boss or warden with an own
 * unique says whether the codex holds it.
 */
export interface MonsterPage {
  id: string; name: string; filter: BeastFilter; seen: number; felled: number; haunts: string;
  weak: Element[] | 'prism' | null; trait: string | null; lines: string[]; mats: string[]; inscription: AnyStat | null;
  inscribed?: true; own?: { id: string; got: boolean };
}
export interface CodexPage { specials: string[]; sets: string[]; monsters: MonsterPage[] }
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
    // bond plan Task 14: her bond scenes after her chats; her after-story and her romance last (only the ones seen show)
    const bonds = id === 'hero' ? [] : [1, 2, 3, 4].map((n) => bondScene(id, n));
    const after: SceneId[] = id === 'hero' ? [] : [`ending:${id}`, `romance:${id}`];
    const own: SceneId[] = id === 'rin'
      ? ['prologue-inn', 'first-return', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'hero-alone', ...chats, ...bonds, ...banters, ...after]
      : [...chats, ...bonds, ...banters, ...home, ...after];
    return { id, met, title: titleOf(m), segments: STORY.people[id].slice(0, k), scenes: entries(own), ...(met && id !== 'hero' ? { bond: bondPage(s, id) } : {}) };
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
    monsters: Object.values(ENEMIES).filter((e) => listedEnemy(e.id) && !e.story).map((e) => monsterPage(s, e)),
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

/** Which filter a kind sits under: bosses, wardens and parts; a region's natives; the rest is the main road. */
const filterOf = (e: EnemyDef): BeastFilter => (e.boss || e.rank ? 'bosses' : e.home ? 'lands' : 'road');

/** The depths of the main road's bands (spec §3.1); F has no floor. */
export const BAND_DEPTHS: Record<NonNullable<EnemyDef['band']>, [number, number?]> = { B: [4, 9], C: [10, 15], D: [16, 24], E: [25, 30], F: [31] };

/** Where a kind is met (spec §10): from the tables that list it (data/monsters.ts). */
export function hauntsOf(e: EnemyDef): string {
  const U = BESTIARY_UI.haunts;
  if (LEGACY_ENEMY_IDS.includes(e.id)) return e.boss ? U.bossFloors : U.everywhere;
  const body = Object.keys(BOSS_PARTS).find((b) => BOSS_PARTS[b].includes(e.id));
  if (body) return hauntsOf(ENEMIES[body]);
  const main = MAINLINE_BOSSES.indexOf(e.id);
  if (main >= 0) return U.depth(U.main, 5 * (main + 1));
  for (const [r, list] of Object.entries(REGION_BOSSES)) if (list.includes(e.id)) return U.depth(REGIONS[r as RegionId].name, 5 * (list.indexOf(e.id) + 1));
  const warden = MAINLINE_WARDENS.indexOf(e.id);
  if (warden >= 0) return U.depth(U.main, 8 + 5 * warden);
  for (const [r, id] of Object.entries(REGION_WARDENS)) if (id === e.id) return U.from(REGIONS[r as RegionId].name, 8);
  if (e.boss) return U.finale;   // the lantern-mother: the finale's alone (ruling 11)
  if (e.home) return REGIONS[e.home].name;
  if (e.band) { const [lo, hi] = BAND_DEPTHS[e.band]; return U.road(lo, hi); }
  return U.deep;
}

/** Roster plan Task C6: one kind's page, from the bestiary and the story (`gateOpen`); nothing is shown before it is met. */
function monsterPage(s: GameState, e: EnemyDef): MonsterPage {
  const rec = s.bestiary?.[e.id];
  const seen = rec?.seen ?? 0, felled = rec?.felled ?? 0;
  const base = { id: e.id, filter: filterOf(e), seen, felled, haunts: hauntsOf(e) };
  if (!seen) return { ...base, name: BESTIARY_UI.unknown, weak: null, trait: null, lines: [], mats: [], inscription: null };
  const text = BESTIARY[e.id];
  const own = Object.values(SPECIALS).find((sp) => sp.owner === e.id);
  return {
    ...base, name: e.name,
    weak: e.prism ? 'prism' : s.revealed[e.id] ? [...s.revealed[e.id]] : null,
    trait: text?.trait ?? null,
    lines: felled && text ? text.lines.filter((l) => gateOpen(s, l.after)).map((l) => l.text) : [],
    mats: felled ? [...new Set(e.drops.map((d) => d.mat))] : [],
    inscription: felled ? (e.inscribe ?? null) : null,
    ...(felled && rec?.inscribed ? { inscribed: true as const } : {}),
    ...(own ? { own: { id: own.id, got: s.codex.includes(own.id) } } : {}),
  };
}

/** Bond plan Task 14: her bond page (spec §4.8): memory 3 a piece held of her chain's, each other source to its cap; a taste once offered. */
function bondPage(s: GameState, c: Companion): BondPage {
  const m = s.party.roster[c];
  const b = bondOf(m);
  const tastes = GIFTABLE.flatMap((mat): { mat: GiftId; taste: Taste }[] => {
    const taste = knownTaste(s, c, mat);
    return taste ? [{ mat, taste }] : [];
  });
  return {
    tier: bondTier(m), points: bondPoints(m), tastes,
    sources: {
      memory: [BOND_PER_PIECE * memoriesOf(m), BOND_PER_PIECE * chainLength(c)],
      talk: [Math.min(b.talk, BOND_CAP.talk), BOND_CAP.talk],
      gift: [Math.min(giftPoints(m), BOND_CAP.gift), BOND_CAP.gift],
      field: [Math.min(b.field, BOND_CAP.field), BOND_CAP.field],
    },
  };
}
