/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EQUIPMENT } from '../data/equipment';
import { SETS, SPECIALS, regionSpecials } from '../data/gear';
import { MATERIALS } from '../data/materials';
import { REGIONS, type RegionId } from '../data/regions';
import { SKILLS } from '../data/skills';

/** Written by `python art-factory/starlantern/tools/gear_art.py plan-json` (plan 5d); null is a discarded cell. */
interface GearPlan {
  sheets: Record<string, (string | null)[]>;
  batches: Record<string, string>;
  regionLimited: string[];
  setFirst: Record<string, string>;
  /** Plan 5d addendum 2: the slot of every gear cell (the size gate's short-edge and mass limits follow it). */
  slots: Record<string, string>;
  /** Controller ruling 2026-10-20: the weapon kind of every weapon cell (thin kinds, spear and bow, get their own mass floor). */
  kinds: Record<string, string>;
}
const plan = JSON.parse(readFileSync('art-factory/starlantern/gear-plan.json', 'utf8')) as GearPlan;

/**
 * Roster ids (monster roster spec 11.1): 7b merges data/*.roster.ts into SPECIALS and MATERIALS, and their art belongs
 * to plan 5f, so plan 5d's cross-checks leave them out. No roster file yet means an empty set.
 */
const rosterModules = import.meta.glob('../data/*.roster.ts', { eager: true }) as Record<string, Record<string, unknown>>;
const idOf = (v: unknown): string | null =>
  v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? (v as { id: string }).id : null;
/**
 * Only real definitions count: an export that is a list of `{ id }` objects, or a record whose every value is a `{ id }`
 * object. Anything else a roster file exports (weights, names, plain string lists) adds nothing, so it can never hide
 * a missing 5d cell.
 */
function idsIn(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
  const ids = items.map(idOf);
  return items.length > 0 && ids.every((id): id is string => id !== null) ? ids : [];
}
const ROSTER = new Set(Object.values(rosterModules).flatMap((m) => Object.values(m).flatMap(idsIn)));

const cellsOf = (prefix: string): string[] =>
  Object.entries(plan.sheets).filter(([id]) => id.startsWith(prefix)).flatMap(([, parts]) => parts)
    .filter((p): p is string => p !== null);
/** Material icons already approved before plan 5d (monster materials, ancient gear, the old coin). */
const MATERIALS_WITH_ART = ['moss', 'bat-wing', 'thorn-fang', 'crystal-shell', 'ice-crystal', 'lizard-scale', 'star-stone', 'dusk-cloth', 'old-coin', 'ancient-gear'];

/** The skills plan 8c replaced, old → new (data/roster.test.ts holds the same list as spec §8 names it). */
const REPLACED: Readonly<Record<string, string>> = {
  'sacred-sake': 'purify-ward', 'thunder-thrust': 'exorcism-thrust', blessing: 'moon-recall', sanctuary: 'full-moon-night',
  'triple-slash': 'pickpocket', 'shadow-flurry': 'jackpot', 'venom-edge': 'appraise',
  'snare-shot': 'sunder-arrow', 'fire-arrow': 'scatter-shot', 'storm-volley': 'deluge-volley',
  'guardian-roar': 'cover', fortress: 'atoning-flame', 'veil-dance': 'clap', sirocco: 'mirage-step',
  'repair-kit': 'repair-drone',
};

describe('plan 5d gear art plan (art-factory/starlantern/gear-plan.json)', () => {
  it('roster ids come only from real id fields', () => {
    expect(idsIn([{ id: 'a' }, { id: 'b' }])).toEqual(['a', 'b']);
    expect(idsIn({ x: { id: 'a', name: 'A' }, y: { id: 'b' } })).toEqual(['a', 'b']);
    expect(idsIn(['iron-sword', 'moss'])).toEqual([]);                 // a plain string list
    expect(idsIn({ 'iron-sword': 3, moss: 1 })).toEqual([]);            // weights keyed by id
    expect(idsIn({ a: { id: 'a' }, w: 2 })).toEqual([]);                // mixed: not a definition table
    expect(idsIn('iron-sword')).toEqual([]);
    expect(idsIn([])).toEqual([]);
  });

  it('every base and special has exactly one gear cell', () => {
    const cells = cellsOf('sheet-gear-');
    expect(cells).toHaveLength(new Set(cells).size);
    const want = [...Object.keys(EQUIPMENT), ...Object.keys(SPECIALS)].filter((id) => !ROSTER.has(id));
    expect(new Set(cells)).toEqual(new Set(want));
    expect(want).toHaveLength(69);   // 25 bases + 44 specials
  });

  it('every gear cell names the slot of its item', () => {
    const want = [...Object.keys(EQUIPMENT), ...Object.keys(SPECIALS)].filter((id) => !ROSTER.has(id));
    expect(new Set(Object.keys(plan.slots ?? {}))).toEqual(new Set(want));
    expect(Object.keys(plan.slots)).toHaveLength(69);
    for (const [id, slot] of Object.entries(plan.slots)) expect(slot, id).toBe((EQUIPMENT[id] ?? SPECIALS[id]).slot);
  });

  it('every weapon cell names the weapon kind of its item', () => {
    const weapons = Object.entries(plan.slots).filter(([, slot]) => slot === 'weapon').map(([id]) => id);
    expect(new Set(Object.keys(plan.kinds ?? {}))).toEqual(new Set(weapons));
    for (const [id, kind] of Object.entries(plan.kinds)) expect(kind, id).toBe(EQUIPMENT[id]?.weaponKind ?? SPECIALS[id]?.weaponKind);
    expect(Object.values(plan.kinds)).toContain('spear');
  });

  it('every material without art and every tree skill has exactly one icon cell', () => {
    const cells = [...cellsOf('sheet-mat-'), ...cellsOf('sheet-skill-')];
    expect(cells).toHaveLength(new Set(cells).size);
    // The gathered goods' icons are the gathering plan's PR E, listed through GATHER_ART (data/gather.ts), never these sheets.
    const mats = Object.keys(MATERIALS).filter((id) => !MATERIALS_WITH_ART.includes(id) && !ROSTER.has(id) && MATERIALS[id].kind !== 'gather');
    expect(mats).toHaveLength(12);
    // Addendum S2: every skill plan 4 drew no icon for (the plan 4 ones are re-derived from their sheets, `sheet-icons-*`).
    // Plan 8c ruling 2: a replaced skill keeps its cell (step 9 leaves it out of the batch), and its successor is G4's.
    const replaced = new Set(Object.keys(REPLACED)), successors = new Set(Object.values(REPLACED));
    const plan4 = new Set(cellsOf('sheet-icons-'));
    const skills = Object.keys(SKILLS).filter((id) => !plan4.has(id) && !successors.has(id));
    expect(new Set(cells.filter((id) => !replaced.has(id)))).toEqual(new Set([...mats, ...skills]));
  });

  it('silhouette sources match regionSpecials and the first piece of each set', () => {
    const regions = Object.keys(REGIONS) as RegionId[];
    const limited = regions.flatMap((r) => regionSpecials(r).map((s) => s.id)).filter((id) => !ROSTER.has(id));
    expect(new Set(plan.regionLimited)).toEqual(new Set(limited));
    expect(plan.regionLimited).toHaveLength(limited.length);
    expect(plan.setFirst).toEqual(Object.fromEntries(Object.values(SETS).map((s) => [s.id, s.pieces[0]])));
  });
});
