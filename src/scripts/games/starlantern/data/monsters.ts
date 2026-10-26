/**
 * The monster roster's switches and tables (roster plan, spec §11.1). New definitions sit in ENEMIES, MATERIALS and
 * SPECIALS from the start, for lookups; every *list* (encounter tables, NORMAL_ENEMIES, the handbook, allArtUrls, warden
 * rooms, bossFor) reads these switches instead. With both sets empty the game is the game it was, bit for bit.
 *
 * This module imports no data of its own (only ids), so anything can read it without a cycle.
 */

/** The ten enemies of the game before the roster: always listed and drawn. */
export const LEGACY_ENEMY_IDS: readonly string[] = ['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade', 'lanterneater', 'scarlet-foe'];
const LEGACY = new Set(LEGACY_ENEMY_IDS);

/**
 * Roster ids whose art is published (the enemy art, its signature material's or trophy's icon, and its own unique's gear
 * art). Only an art batch's publish commit adds to it.
 */
export const ROSTER_ART: ReadonlySet<string> = new Set<string>([]);
/**
 * Roster ids met in the encounter tables, the boss table, warden rooms and the bestiary. Only a go-live commit adds to it,
 * and it must stay inside ROSTER_ART.
 */
export const ROSTER_LIVE: ReadonlySet<string> = new Set<string>([]);

/** An enemy any list may show: a legacy one, or a roster one gone live. */
export const listedEnemy = (id: string): boolean => LEGACY.has(id) || ROSTER_LIVE.has(id);
/** An enemy with art to load: a legacy one, or a roster one whose art is published. */
export const artEnemy = (id: string): boolean => LEGACY.has(id) || ROSTER_ART.has(id);
/** The roster ids gone live, in the order they were added. */
export const liveRosterIds = (): string[] => [...ROSTER_LIVE];
