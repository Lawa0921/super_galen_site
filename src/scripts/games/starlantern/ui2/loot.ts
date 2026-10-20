import { T } from '../data/text.zh-TW';
import { itemName } from '../engine/loot/item';
import type { ItemInstance } from '../engine/types';
import type { Rich, RichPart } from './widgets';

/**
 * 「皮背心 +1・魔法」: the name, its enhance level (none at +0) and its rarity word (common gear has none), so colour is never
 * the only cue. A starlit piece reads 星輝 before its rarity word: 「雙月槍・星輝傳說」.
 */
export const gearLabel = (it: ItemInstance): string => {
  const name = T.enhanced(itemName(it), it.enhance);
  if (it.rarity === 'common') return name;
  const word = T.rarity[it.rarity];
  return T.gearLabel(name, it.starlit ? T.starlitWord(word) : word);
};

/**
 * The colour class of a piece of gear: `slx-rarity-<rarity>`, plus `slx-starlit` (the star-light text glow) on a starlit
 * piece. The one place a rarity class is built from an item (ui2/rarity.test.ts checks no other file does).
 */
export const rarityClass = (it: Pick<ItemInstance, 'rarity' | 'starlit'>): string =>
  it.starlit ? `slx-rarity-${it.rarity} slx-starlit` : `slx-rarity-${it.rarity}`;

/** Gear the player has put work into that a sale, fusion or dismantle throws away: enhanced, or with a reroll-locked affix. */
export const invested = (it: ItemInstance): boolean => it.enhance > 0 || it.locked !== undefined;

/** A piece of gear as part of a line: its label in its rarity colour. */
export const gearPart = (it: ItemInstance): RichPart => ({ text: gearLabel(it), cls: `slx-gear-drop ${rarityClass(it)}` });

/** Parts joined with 、 (the list separator of every loot line). */
export function joinParts(parts: RichPart[], sep = '、'): Rich {
  return parts.flatMap((p, i) => (i ? [sep, p] : [p]));
}

/** Fill a one-slot copy template (`(list) => \`打開寶庫：${list}\``) with rich parts, so the words stay in the text file. */
export function fillRich(template: (slot: string) => string, parts: Rich): Rich {
  const mark = '\u0000';
  const [before, after = ''] = template(mark).split(mark);
  return [before, ...parts, after].filter((p) => p !== '');
}
