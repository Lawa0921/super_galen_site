/**
 * The monster roster's switches and tables (roster plan, spec §11.1). New definitions sit in ENEMIES, MATERIALS and
 * SPECIALS from the start, for lookups; every *list* (encounter tables, NORMAL_ENEMIES, the handbook, allArtUrls, warden
 * rooms, bossFor) reads these switches instead. With both sets empty the game is the game it was, bit for bit.
 *
 * It reads MATERIALS and SPECIALS for an owner only; neither imports anything that reads this module.
 */
import { SPECIALS } from './gear';
import { MATERIALS } from './materials';
import type { RegionId } from './regions';

/** The ten enemies of the game before the roster: always listed and drawn. */
export const LEGACY_ENEMY_IDS: readonly string[] = ['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade', 'lanterneater', 'scarlet-foe'];
const LEGACY = new Set(LEGACY_ENEMY_IDS);

/**
 * Roster ids whose art is published (the enemy art, its signature material's or trophy's icon, and its own unique's gear
 * art). Only an art batch's publish commit adds to it.
 */
export const ROSTER_ART: ReadonlySet<string> = new Set<string>([
  'paper-moth', 'root-hound', 'bell-watcher', 'false-moon', 'fog-warden', 'lamp-wight', 'tin-soldier', 'dust-mimic',
  'market-ghost', 'tongueless-bell', 'hollow-hunter', 'mist-twin', 'moon-crow', 'sleepwalker', 'hoarder',
  'silent-bell', 'hollow-champion', 'bell-warden', 'old-city-sentinel', 'requiem-choir', 'lantern-larva',
  'epitaph-golem', 'ancestor-automaton', 'ash-archivist', 'wick-shade', 'keeper-echo', 'ember-maw', 'sorrow-crystal',
  'deep-tendril', 'music-box', 'paper-cranes', 'lost-shadow', 'returning-light', 'gilded-hoarder', 'old-city-archon',
  'gorged-beast', 'lantern-mother', 'forgotten-festival', 'starless-whale', 'stopped-clock', 'first-lantern',
  'archon-hand', 'toppled-automaton', 'requiem-conductor', 'lantern-brood', 'cinder-imp', 'forge-hound',
  'mirage-dancer', 'sand-scorpion', 'frost-doll', 'glacier-tortoise', 'snow-caller', 'ice-komainu', 'frozen-pilgrim',
  'thunder-kite', 'storm-totem', 'charge-jelly', 'star-ember', 'stolen-tome', 'ember-tyrant', 'sandstorm-maw',
  'mirage-city', 'rime-sovereign', 'white-silence', 'rift-maw', 'thunder-roc', 'storm-conductor',
  'starfire-colossus', 'mirage-lead', 'ice-shrine', 'burning-page', 'rime-pillar', 'bog-mother', 'rot-lily',
  'leech-knight', 'ashen-treant', 'spore-moth', 'mirror-thief', 'veil-stalker', 'hush-acolyte', 'vault-mimic',
  'debt-collector', 'rivet-golem', 'siege-crab', 'herald-engine', 'fallen-knight', 'banner-bearer', 'mire-hydra',
  'grey-blight', 'bog-leviathan', 'faceless-host', 'vault-dragon', 'shadow-parade', 'fortress-colossus',
  'siege-titan', 'last-commander', 'grey-elder', 'locked-vault', 'gate-breaker', 'ash-mourner',
]);
/**
 * Roster ids met in the encounter tables, the boss table, warden rooms and the bestiary. Only a go-live commit adds to it,
 * and it must stay inside ROSTER_ART.
 */
export const ROSTER_LIVE: ReadonlySet<string> = new Set<string>([
  // L1b, the first wave: the main road's B and C bands, the treasure rat, the bosses at 5, 10, 15 and the wardens at 8, 13
  'paper-moth', 'lamp-wight', 'root-hound', 'tin-soldier', 'dust-mimic', 'market-ghost', 'tongueless-bell', 'hollow-hunter', 'mist-twin',
  'moon-crow', 'bell-watcher', 'sleepwalker', 'hoarder', 'fog-warden', 'silent-bell', 'hollow-champion', 'false-moon', 'bell-warden',
  // L2b, the second wave: the main road's D, E and F bands, the gilded rat, the bosses at 20 to 50 (and the archon's hands) and
  // the wardens at 18, 23, 28; the lantern-mother joins with the finale (L2c)
  'old-city-sentinel', 'requiem-choir', 'lantern-larva', 'epitaph-golem', 'ancestor-automaton', 'ash-archivist', 'wick-shade', 'keeper-echo',
  'ember-maw', 'sorrow-crystal', 'deep-tendril', 'music-box', 'paper-cranes', 'lost-shadow', 'returning-light', 'gilded-hoarder',
  'old-city-archon', 'gorged-beast', 'forgotten-festival', 'starless-whale', 'stopped-clock', 'first-lantern', 'archon-hand',
  'toppled-automaton', 'requiem-conductor', 'lantern-brood',
  // L2c: the finale's foe in her own shape
  'lantern-mother',
  // L3b, the third wave: the fire, frost and storm lands' natives, their bosses at 5, 10, 15 (the permafrost with its pillars)
  // and their wardens from depth 8
  'cinder-imp', 'forge-hound', 'ash-mourner', 'mirage-dancer', 'sand-scorpion', 'frost-doll', 'glacier-tortoise', 'snow-caller',
  'ice-komainu', 'frozen-pilgrim', 'thunder-kite', 'storm-totem', 'charge-jelly', 'star-ember', 'stolen-tome', 'ember-tyrant',
  'sandstorm-maw', 'mirage-city', 'rime-sovereign', 'white-silence', 'rift-maw', 'thunder-roc', 'storm-conductor', 'starfire-colossus',
  'mirage-lead', 'ice-shrine', 'burning-page', 'rime-pillar',
  // L4b, the fourth wave: the mire, shade and iron lands' natives, their bosses at 5, 10, 15 and their wardens from depth 8;
  // with it every roster id is live
  'bog-mother', 'rot-lily', 'leech-knight', 'ashen-treant', 'spore-moth', 'mirror-thief', 'veil-stalker', 'hush-acolyte', 'vault-mimic',
  'debt-collector', 'rivet-golem', 'siege-crab', 'herald-engine', 'fallen-knight', 'banner-bearer', 'mire-hydra', 'grey-blight',
  'bog-leviathan', 'faceless-host', 'vault-dragon', 'shadow-parade', 'fortress-colossus', 'siege-titan', 'last-commander', 'grey-elder',
  'locked-vault', 'gate-breaker',
]);

/** An enemy any list may show: a legacy one, or a roster one gone live. */
export const listedEnemy = (id: string): boolean => LEGACY.has(id) || ROSTER_LIVE.has(id);
/** An enemy with art to load: a legacy one, or a roster one whose art is published. */
export const artEnemy = (id: string): boolean => LEGACY.has(id) || ROSTER_ART.has(id);
/** The roster ids gone live, in the order they were added. */
export const liveRosterIds = (): string[] => [...ROSTER_LIVE];

/** The roster foe a material belongs to (its signature, trophy or keepsake); undefined for the game's own. */
export const ownerOf = (mat: string): string | undefined => MATERIALS[mat]?.owner;
/** A material with an icon to load: one of the game's own, or one whose owner's art is published. */
export const artMaterial = (id: string): boolean => { const o = ownerOf(id); return !o || ROSTER_ART.has(o); };
/** A special with gear art to load: one of the game's own, or a roster unique whose owner's art is published. */
export const artSpecial = (id: string): boolean => { const o = SPECIALS[id]?.owner; return !o || ROSTER_ART.has(o); };

// ---------------------------------------------------------------------------------------------------------------------
// The tables (roster plan Task A4, spec §8). They hold every group in full; `encounterTable`, `bossFor` and `wardenFor`
// read them through the live set, so nothing here is met until a go-live commit adds its ids to ROSTER_LIVE.

export type Band = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type RosterBand = Exclude<Band, 'A'>;
type Land = Exclude<RegionId, 'mainline'>;

/** Spec §3.1: A 1-3 (never changes), B 4-9, C 10-15, D 16-24, E 25-30, F 31 and on. */
export function bandOf(depth: number): Band {
  return depth <= 3 ? 'A' : depth <= 9 ? 'B' : depth <= 15 ? 'C' : depth <= 24 ? 'D' : depth <= 30 ? 'E' : 'F';
}

/** The treasure foes (spec §5.3, archetype 寶): they flee, so the tables count them as paying nothing. */
export const TREASURE: ReadonlySet<string> = new Set(['hoarder', 'gilded-hoarder']);

const x2 = (id: string) => [id, id];
const x3 = (id: string) => [id, id, id];

/** Spec §8.2: twelve groups a band on the main road (the legacy ids are always live). */
export const MAINLINE_TABLES: Record<RosterBand, string[][]> = {
  // L1b (spec §0 item 21): out, tin+lamp, tin+beetle, golem+lamp (band 8's elite heavy behind a guard or a healer) and
  // wisp+market-ghost (the softest crowd); in, the tin soldier alone and behind a lighter lead (moth, mimic, wisp).
  B: [
    x3('paper-moth'), ['root-hound', 'wolf'], ['lamp-wight', 'root-hound'], ['dust-mimic'],
    ['market-ghost', ...x2('paper-moth')], x2('root-hound'), ['tin-soldier'],
    ['dust-mimic', 'shade'], ['hoarder'], ['paper-moth', 'tin-soldier'], ['dust-mimic', 'tin-soldier'], ['wisp', 'tin-soldier'],
  ],
  C: [
    ['tongueless-bell', 'hollow-hunter'], x2('mist-twin'), x2('moon-crow'), x2('bell-watcher'), ['sleepwalker', 'bell-watcher'],
    ['hollow-hunter', 'lamp-wight'], ['tongueless-bell', 'tin-soldier'], ['moon-crow', 'root-hound'], [...x2('mist-twin'), 'paper-moth'],
    ['sleepwalker'], ['bell-watcher', 'market-ghost'], ['hoarder'],
  ],
  // L2b (spec §0 item 22, the one attempt on band 19a): out of D, the two automatons, the golem with the crow, the larva with
  // the twins and the sleepwalker with the choir (C-band foes at depth 20 and the automaton wall); in, the choir, the
  // archivist and the golem each with a lighter partner, so D stays twelve (the hollow hunter, the bell watcher and the
  // treasure rat keep their groups). Out of E, the maw with the sentinel and the golem with a wick; in, the bearer with a
  // larva and the archivist with the sentinel (E keeps a D foe, so it shares no more than six in ten with F).
  D: [
    ['old-city-sentinel', 'requiem-choir'], x2('lantern-larva'), ['epitaph-golem'], ['ancestor-automaton', 'lantern-larva'],
    ['ash-archivist', 'old-city-sentinel'], ['requiem-choir', 'hollow-hunter'], ['requiem-choir', 'lantern-larva'], ['ash-archivist', 'lantern-larva'],
    ['ash-archivist', 'bell-watcher'], ['epitaph-golem', 'ash-archivist'], ['ancestor-automaton', 'requiem-choir'], ['hoarder'],
  ],
  E: [
    x3('wick-shade'), ['keeper-echo'], ['ember-maw'], x2('sorrow-crystal'), ['deep-tendril', ...x2('wick-shade')], ['keeper-echo', 'requiem-choir'],
    ['keeper-echo', 'lantern-larva'], ['sorrow-crystal', 'lantern-larva'], x2('deep-tendril'), ['ash-archivist', 'old-city-sentinel'],
    ['ash-archivist', 'keeper-echo'], ['gilded-hoarder'],
  ],
  F: [
    ['music-box', ...x2('paper-cranes')], x2('lost-shadow'), ['returning-light', 'lost-shadow'], x3('paper-cranes'), ['music-box', 'keeper-echo'],
    ['sorrow-crystal', ...x2('paper-cranes')], ['lost-shadow', 'deep-tendril'], ['returning-light', 'ember-maw'], ['music-box', 'sorrow-crystal'],
    ['lost-shadow', ...x2('wick-shade')], ['keeper-echo', 'paper-cranes'], ['gilded-hoarder'],
  ],
};

/**
 * Spec §8.3: six native groups a region, joined by the band's first six main-road groups. The shape follows spec §8.3
 * (a swarm of three, a lone one, a pair, a swarm with its support, two of a kind, a heavy with company) as far as a region's
 * five archetypes allow; every native sits in two groups at least, and the komainu always come two by two.
 */
export const NATIVE_GROUPS: Record<Land, string[][]> = {
  blaze: [
    x3('cinder-imp'), ['forge-hound', 'sand-scorpion'], ['ash-mourner', 'mirage-dancer'], [...x2('cinder-imp'), 'ash-mourner'],
    x2('sand-scorpion'), ['forge-hound', 'mirage-dancer'],
  ],
  frost: [
    x2('ice-komainu'), ['frozen-pilgrim', 'glacier-tortoise'], ['snow-caller', 'frozen-pilgrim'], ['frost-doll', 'snow-caller'],
    ['glacier-tortoise', 'frost-doll'], [...x2('ice-komainu'), 'snow-caller'],
  ],
  storm: [
    x3('thunder-kite'), ['stolen-tome'], ['storm-totem', 'star-ember'], [...x2('thunder-kite'), 'storm-totem'],
    ['charge-jelly', 'star-ember'], ['stolen-tome', 'charge-jelly'],
  ],
  mire: [
    x3('spore-moth'), ['leech-knight', 'ashen-treant'], ['rot-lily', 'leech-knight'], [...x2('spore-moth'), 'rot-lily'],
    ['ashen-treant', 'bog-mother'], ['bog-mother', 'spore-moth'],
  ],
  shade: [
    x2('veil-stalker'), ['vault-mimic'], ['hush-acolyte', 'debt-collector'], ['mirror-thief', 'hush-acolyte'],
    ['debt-collector', 'mirror-thief'], ['vault-mimic', 'veil-stalker'],
  ],
  // L4b (spec §0 item 24, controller ruling 2026-10-29): frozen band 18b's allPhys walls at iron depths 4 and 8 were the heavy
  // pairs; five natives in two groups each force four native pairs, so the crab stands alone twice and the two buffers pair up.
  iron: [
    ['siege-crab'], ['siege-crab'], ['herald-engine', 'banner-bearer'], ['fallen-knight', 'herald-engine'],
    ['rivet-golem', 'banner-bearer'], ['fallen-knight', 'rivet-golem'],
  ],
};

/**
 * Spec §5.6, ruling 11: the main road's bosses at depths 5, 10 ... 50, cycling after; depth 30 is the lantern-eater (the
 * lantern-mother is the finale's alone).
 */
export const MAINLINE_BOSSES: readonly string[] = [
  'fog-warden', 'silent-bell', 'hollow-champion', 'old-city-archon', 'gorged-beast', 'lanterneater', 'forgotten-festival', 'starless-whale',
  'stopped-clock', 'first-lantern',
];
/** Spec §5.6: each region's three bosses at depths 5, 10 and 15, cycling after (§4.2's depths fix the order). */
export const REGION_BOSSES: Record<Land, readonly string[]> = {
  blaze: ['ember-tyrant', 'sandstorm-maw', 'mirage-city'], frost: ['rime-sovereign', 'white-silence', 'rift-maw'],
  storm: ['thunder-roc', 'storm-conductor', 'starfire-colossus'], mire: ['mire-hydra', 'grey-blight', 'bog-leviathan'],
  shade: ['faceless-host', 'vault-dragon', 'shadow-parade'], iron: ['fortress-colossus', 'siege-titan', 'last-commander'],
};
/** A many-part boss comes with its parts (spec §5.6), the parts first in its line (roster plan B12: the first foe is the one a
 * plain attack meets, and 「先拆部件」 is the fight's lesson). */
export const BOSS_PARTS: Record<string, string[]> = { 'old-city-archon': x2('archon-hand'), 'rime-sovereign': x2('rime-pillar') };

/** Spec §5.5: the main road's wardens at depths 8, 13, 18, 23, 28, cycling after. */
export const MAINLINE_WARDENS: readonly string[] = ['false-moon', 'bell-warden', 'toppled-automaton', 'requiem-conductor', 'lantern-brood'];
/** Spec §5.5: each region's one warden. */
export const REGION_WARDENS: Record<Land, string> = {
  blaze: 'mirage-lead', frost: 'ice-shrine', storm: 'burning-page', mire: 'grey-elder', shade: 'locked-vault', iron: 'gate-breaker',
};
/** Ruling 10: a warden fights alone or with one escort of its own story (the escort joins once it is live, plan B5). */
export const WARDEN_GROUPS: Record<string, string[]> = {
  'false-moon': ['false-moon'], 'bell-warden': ['bell-warden', 'bell-watcher'], 'toppled-automaton': ['toppled-automaton', 'ancestor-automaton'],
  'requiem-conductor': ['requiem-conductor', 'requiem-choir'], 'lantern-brood': ['lantern-brood', 'lantern-larva'], 'mirage-lead': ['mirage-lead'],
  'ice-shrine': ['ice-shrine'], 'burning-page': ['burning-page', 'stolen-tome'], 'grey-elder': ['grey-elder'], 'locked-vault': ['locked-vault'],
  'gate-breaker': ['gate-breaker', 'fallen-knight'],
};

/** A warden's fight (ruling 10, plan B5): the warden, and its escort only once that escort is live. */
export function wardenGroup(id: string): string[] {
  return (WARDEN_GROUPS[id] ?? [id]).filter((x, i) => i === 0 || listedEnemy(x));
}

/**
 * The boss group at a depth that is a multiple of 5 (ruling 11). The main road's depth 3 and the finale are decided before
 * this (engine/game.ts, plan B5). A boss not yet live, or one whose parts are not, is the lantern-eater, as before.
 */
export function bossFor(region: RegionId, depth: number): string[] {
  const i = depth / 5 - 1;
  const id = region === 'mainline' ? MAINLINE_BOSSES[i % MAINLINE_BOSSES.length] : REGION_BOSSES[region][i % 3];
  const group = [...(BOSS_PARTS[id] ?? []), id];
  return group.every(listedEnemy) ? group : ['lanterneater'];
}

/** The warden of a depth (ruling 10): depth 8 and on, a depth ending in 3 or 8, and live; null otherwise. */
export function wardenFor(region: RegionId, depth: number): string | null {
  if (depth < 8 || depth % 5 !== 3) return null;
  const id = region === 'mainline' ? MAINLINE_WARDENS[((depth - 8) / 5) % MAINLINE_WARDENS.length] : REGION_WARDENS[region];
  return ROSTER_LIVE.has(id) ? id : null;
}

/**
 * Spec §8.1 steps 2-5: the table for a depth past 3, given the legacy one. Only groups whose every id is live count; with
 * none holding a roster id the legacy table stands, with fewer than six the live new ones join it, else they replace it.
 * A region's table is replaced only once all its native groups are live (controller ruling, PR A review): before that a
 * region keeps its legacy table whole and the live main-road groups only join it, so it never turns into a main-road table
 * with no natives. A treasure foe's lone group never joins a legacy table by itself: one group in four or five would be a
 * treasure foe there, where its band's table has one in twelve.
 */
export function rosterTable(region: RegionId, depth: number, legacy: string[][]): string[][] {
  const band = bandOf(depth);
  if (band === 'A') return legacy;
  const full = region === 'mainline' ? MAINLINE_TABLES[band] : [...NATIVE_GROUPS[region], ...MAINLINE_TABLES[band].slice(0, 6)];
  const live = full.filter((g) => g.every(listedEnemy));
  const fresh = live.filter((g) => g.some((id) => !LEGACY.has(id)));
  if (!fresh.some((g) => !g.every((id) => TREASURE.has(id)))) return legacy;
  const own = region === 'mainline' || NATIVE_GROUPS[region].every((g) => g.every(listedEnemy));
  return !own || live.length < 6 ? [...legacy, ...fresh] : live;
}
