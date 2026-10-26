/**
 * The monster roster's switches and tables (roster plan, spec §11.1). New definitions sit in ENEMIES, MATERIALS and
 * SPECIALS from the start, for lookups; every *list* (encounter tables, NORMAL_ENEMIES, the handbook, allArtUrls, warden
 * rooms, bossFor) reads these switches instead. With both sets empty the game is the game it was, bit for bit.
 *
 * It reads MATERIALS and SPECIALS for an owner only; neither imports anything that reads this module.
 */
import { SPECIALS } from './gear';
import { MATERIALS } from './materials';

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

/** The roster foe a material belongs to (its signature, trophy or keepsake); undefined for the game's own. */
export const ownerOf = (mat: string): string | undefined => MATERIALS[mat]?.owner;
/** A material with an icon to load: one of the game's own, or one whose owner's art is published. */
export const artMaterial = (id: string): boolean => { const o = ownerOf(id); return !o || ROSTER_ART.has(o); };
/** A special with gear art to load: one of the game's own, or a roster unique whose owner's art is published. */
export const artSpecial = (id: string): boolean => { const o = SPECIALS[id]?.owner; return !o || ROSTER_ART.has(o); };
