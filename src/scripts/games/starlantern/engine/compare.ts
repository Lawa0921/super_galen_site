import { POWERS, SETS, SPECIALS } from '../data/gear';
import { T } from '../data/text.zh-TW';
import { implicitStats } from './loot/item';
import { setCounts, sheetOf } from './party';
import type { AnyStat, ItemInstance, Member, Sheet, Slot } from './types';

export interface ItemLine { kind: 'implicit' | 'affix' | 'power' | 'set' | 'lore'; text: string; active?: boolean }

const EPS = 1e-6;

/** What wearing `item` in `slot` (or nothing, with null) would change on the member's sheet; zero changes are left out. */
export function compareDelta(m: Member, slot: Slot, item: ItemInstance | null): Partial<Record<AnyStat, number>> {
  const equip = { ...m.equip };
  if (item) equip[slot] = item;
  else delete equip[slot];
  const before = sheetOf(m);
  const after = sheetOf({ ...m, equip });
  const out: Partial<Record<AnyStat, number>> = {};
  for (const k of Object.keys(after) as AnyStat[]) {
    const d = Math.round((after[k] - before[k]) * 1e6) / 1e6;
    if (Math.abs(d) > EPS) out[k] = d;
  }
  return out;
}

const statText = (stats: Partial<Sheet>): string =>
  (Object.entries(stats) as [AnyStat, number][]).map(([k, v]) => T.gear.affix(k, v)).join('、');

function setLines(setId: string, reached?: number): ItemLine[] {
  const s = SETS[setId];
  if (!s) return [];
  return [
    { kind: 'set', text: T.gear.setBonus(2, statText(s.two)), active: (reached ?? 0) >= 2 },
    { kind: 'set', text: T.gear.setBonus(4, `${statText(s.four)}${T.gear.setFour}`), active: (reached ?? 0) >= 4 },
  ];
}

/** Lines for one piece of gear: its base bonus, rolled affixes, then power, set bonuses and story. `wearer` marks the set bonuses reached. */
export function itemLines(it: ItemInstance, wearer?: Member): ItemLine[] {
  const out: ItemLine[] = [];
  const implicit = statText(implicitStats(it) as Partial<Sheet>);
  if (implicit) out.push({ kind: 'implicit', text: implicit });
  for (const a of it.affixes) out.push({ kind: 'affix', text: T.gear.affix(a.key, a.value) });
  const sp = it.special ? SPECIALS[it.special] : undefined;
  if (sp) out.push(...specialLines(sp.id, wearer));
  return out;
}

/** Power, set bonuses and story from an id alone: a special item's id or a set's id. For catalogue cards. */
export function specialLines(id: string, wearer?: Member): ItemLine[] {
  const sp = SPECIALS[id];
  if (!sp) return setLines(id);
  const out: ItemLine[] = [];
  const power = sp.power ? POWERS[sp.power] : undefined;
  if (power) out.push({ kind: 'power', text: power.text });
  if (sp.set) out.push(...setLines(sp.set, wearer ? setCounts(wearer)[sp.set] ?? 0 : undefined));
  out.push({ kind: 'lore', text: sp.lore });
  return out;
}
