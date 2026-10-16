import { AFFIXES, AFFIX_COUNT, GEAR_SLOTS, IMPLICIT_PER_ILVL, ROLL_FLOOR, SLOT_WEIGHT, SPECIALS, affixRange } from '../../data/gear';
import { EQUIPMENT } from '../../data/equipment';
import { depthLevel } from '../levels';
import { pick, randInt, type Rng } from '../rng';
import type { AnyStat, GearSlot, ItemInstance, Rarity, Sheet, Stats } from '../types';

export type DropSource = 'monster' | 'chest' | 'elite' | 'vault' | 'boss';

const SOURCE_BONUS: Record<DropSource, number> = { monster: 0, chest: 0, elite: 2, vault: 2, boss: 4 };
/** Gold multiplier by rarity: sell price = round((10 + 2 x ilvl) x m). */
const SELL_MUL: Record<Rarity, number> = { common: 1, magic: 2, rare: 4, legendary: 10, unique: 10, set: 8 };

export const itemLevel = (depth: number, source: DropSource): number => depthLevel(depth) + SOURCE_BONUS[source];

/** A base for a slot: one of the two best bases at or under `ilvl`, else the slot's lowest. */
export function baseFor(rng: Rng, slot: GearSlot, ilvl: number): string {
  const inSlot = Object.values(EQUIPMENT).filter((e) => e.slot === slot);
  const fits = inSlot.filter((e) => e.ilvl <= ilvl).sort((a, b) => b.ilvl - a.ilvl || a.id.localeCompare(b.id));
  if (fits.length === 0) return inSlot.sort((a, b) => a.ilvl - b.ilvl || a.id.localeCompare(b.id))[0].id;
  const top = fits.slice(0, 2);
  return top.length === 1 ? top[0].id : pick(rng, top).id;
}

interface RollOpts { uid: number; ilvl: number; rarity: Rarity; slot?: GearSlot; base?: string; special?: string }

function bestBase(slot: GearSlot): string {
  return Object.values(EQUIPMENT).filter((e) => e.slot === slot).sort((a, b) => b.ilvl - a.ilvl || a.id.localeCompare(b.id))[0].id;
}

function rollValue(rng: Rng, key: AnyStat, ilvl: number, rarity: Rarity): number {
  const [lo, hi] = affixRange(key, Math.max(1, ilvl));
  const floor = ROLL_FLOOR[rarity];
  const f = floor + (1 - floor) * rng();
  return Math.max(1, Math.round(lo + (hi - lo) * f));
}

/** Rolls one piece of gear. A special item takes its own rarity, slot and (for uniques and sets) its fixed affixes. */
export function rollItem(rng: Rng, o: RollOpts): ItemInstance {
  const sp = o.special ? SPECIALS[o.special] : undefined;
  if (o.special && !sp) throw new Error(`unknown special: ${o.special}`);
  const rarity = sp ? sp.rarity : o.rarity;
  const slot: GearSlot = (o.base ? EQUIPMENT[o.base]?.slot : undefined) ?? sp?.slot ?? o.slot ?? pick(rng, GEAR_SLOTS);
  const base = o.base ?? (sp ? bestBase(slot) : baseFor(rng, slot, o.ilvl));

  let keys: AnyStat[];
  if (sp?.fixed) {
    keys = [...sp.fixed];
  } else {
    const range = rarity === 'common' ? [0, 0] : (AFFIX_COUNT as Record<string, readonly number[]>)[rarity] ?? AFFIX_COUNT.rare;
    const count = range[0] === range[1] ? range[0] : randInt(rng, range[0], range[1]);
    const left = (Object.keys(AFFIXES) as AnyStat[]).filter((k) => AFFIXES[k].slots.includes(slot));
    keys = [];
    for (let i = 0; i < count && left.length > 0; i++) keys.push(left.splice(Math.floor(rng() * left.length), 1)[0]);
  }
  const affixes = keys.map((key) => ({ key, value: rollValue(rng, key, o.ilvl, rarity) }));
  const item: ItemInstance = { uid: o.uid, base, rarity, ilvl: o.ilvl, affixes, enhance: 0 };
  if (sp) item.special = sp.id;
  return item;
}

/** The base's own bonus, grown IMPLICIT_PER_ILVL per item level above the base's level. */
export function implicitStats(it: ItemInstance): Partial<Stats> {
  const b = EQUIPMENT[it.base];
  const grow = 1 + IMPLICIT_PER_ILVL * Math.max(0, it.ilvl - b.ilvl);
  const out: Partial<Stats> = {};
  for (const [k, v] of Object.entries(b.bonus) as [keyof Stats, number][]) out[k] = Math.round(v * grow);
  return out;
}

export function itemStats(it: ItemInstance): Partial<Sheet> {
  const out: Partial<Sheet> = { ...implicitStats(it) };
  for (const a of it.affixes) out[a.key] = (out[a.key] ?? 0) + a.value;
  return out;
}

export const itemName = (it: ItemInstance): string => (it.special ? SPECIALS[it.special].name : EQUIPMENT[it.base].name);
export const itemSlot = (it: ItemInstance): GearSlot => EQUIPMENT[it.base].slot;
export const itemWeight = (it: ItemInstance): number => SLOT_WEIGHT[itemSlot(it)];
export const sellPrice = (it: ItemInstance): number => Math.round((10 + 2 * it.ilvl) * SELL_MUL[it.rarity]);
