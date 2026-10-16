import { itemName } from '../engine/loot/item';
import type { ItemInstance } from '../engine/types';
import type { Rich, RichPart } from './widgets';

/** A piece of gear as part of a line: its name in its rarity colour. */
export const gearPart = (it: ItemInstance): RichPart => ({ text: itemName(it), cls: `slx-gear-drop slx-rarity-${it.rarity}` });

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
