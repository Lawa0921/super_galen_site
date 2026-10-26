import type { AilmentChip, AilmentShown } from '../engine/ailments';
import { T } from '../data/text.zh-TW';

/**
 * Ailment label colours for the Pixi battle picture: the same values as `$slx-ailment` in src/styles/_starlantern-ui.scss
 * (ui2/rarity.test.ts holds them equal, apart from each other, and readable on the window colour).
 *
 * When the art plan publishes the ailment icons (spec §15, §17 ⑨), each label gets its icon in front of the word, only
 * when `ctx.art.has(url)`; the word stays. This plan defines no art keys and asks for no image.
 */
export const AILMENT_FILL: Record<AilmentShown, number> = {
  poison: 0xb889fe, sleep: 0xc1c5d6, burn: 0xfe8a57, freeze: 0x92ebfd, chill: 0x8ea8fe, shock: 0xffe845, bleed: 0xff5c74,
  // Roster plan B9: the art-tools PR's colour for 遺忘 (its icon publishes with E1c).
  forget: 0x8fd9b6,
};

/** The ink colour of a row's 「+N」 (the folded ailments are not one colour). */
export const AILMENT_MORE_FILL = 0xf1ead8;

/**
 * The ink of an elite's or a boss's affix words, which lead its row (difficulty plan Task 7b): a pale peach, apart from
 * every ailment and mechanic colour (ui2/rarity.test.ts) and readable on the window. Text only, no icon (spec §7.3).
 */
export const AFFIX_FILL = 0xffccbb;

/**
 * The order a row shows ailments in, most severe first (plan 8b follow-up): what costs a turn (freeze, sleep), what costs
 * the skills of one (forget, roster plan B9), then damage every round (bleed, which stacks; burn; poison), then what only
 * shifts numbers (shock, chill). Fixed, so the same ailments always read the same way, and a full row folds the mildest
 * into 「+N」.
 */
export const AILMENT_SEVERITY: readonly AilmentShown[] = ['freeze', 'sleep', 'forget', 'bleed', 'burn', 'poison', 'shock', 'chill'];

export const bySeverity = (chips: readonly AilmentChip[]): AilmentChip[] =>
  [...chips].sort((a, b) => AILMENT_SEVERITY.indexOf(a.id) - AILMENT_SEVERITY.indexOf(b.id));

/**
 * A label's width at `size` px, estimated without measuring (no canvas or layout needed), as Cubic 11 advances it
 * (unitsPerEm 1200): a CJK character 1300 units (13/12 em), anything else (digits, ×, +) 800 units (8/12 em).
 */
export const textWidth = (text: string, size: number): number =>
  [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? (size * 13) / 12 : (size * 8) / 12), 0);

/**
 * A label no wider than `max`: the first of `options` (longest first) that fits; when none does, `cut.head` shortened with
 * 「…」 and `cut.tail` kept after it (a foe's letter), as long as fits. The whole text stays one action away (the target
 * list, the message line, the target note), so a cut loses nothing.
 */
export function fitLabel(options: readonly string[], max: number, widthOf: (t: string) => number, cut: { head: string; tail?: string }): string {
  for (const o of options) if (widthOf(o) <= max) return o;
  const chars = [...cut.head];
  const tail = cut.tail ?? '';
  let k = chars.length - 1;
  while (k > 1 && widthOf(`${chars.slice(0, k).join('')}…${tail}`) > max) k--;
  return `${chars.slice(0, Math.max(1, k)).join('')}…${tail}`;
}

/** Freeze and sleep cost a turn: a row never folds them away (plan 8c final). */
export const isHalting = (c: AilmentChip): boolean => c.id === 'freeze' || c.id === 'sleep';

/**
 * One line of words in priority order no wider than `max`: every one when they all fit; otherwise the longest prefix
 * that fits beside a 「+N」 counting the rest. The first `keep` always stand, whatever the width (freeze and sleep).
 */
export function fitRow<W>(words: readonly W[], max: number, widthOf: (w: W) => number, moreWidth: (n: number) => number, gap: number, keep = 0): { shown: W[]; more: number } {
  const ws = words.map(widthOf);
  const line = (k: number, more: number) => ws.slice(0, k).reduce((a, b) => a + b, 0) + (more ? moreWidth(more) : 0) + gap * Math.max(0, k + (more ? 1 : 0) - 1);
  if (line(words.length, 0) <= max) return { shown: [...words], more: 0 };
  let k = words.length - 1;
  while (k > keep && line(k, words.length - k) > max) k--;
  return { shown: words.slice(0, k), more: words.length - k };
}

/**
 * One line of ailments no wider than `max`: in severity order, every one when they all fit; otherwise as many of the
 * most severe as fit beside a 「+N」 counting the rest (only the 「+N」 when not even one does). `widthOf` is a word's
 * width from its text, `gap` the space between two words.
 */
export function fitChips(chips: readonly AilmentChip[], max: number, widthOf: (text: string) => number, gap: number): { shown: AilmentChip[]; more: number } {
  const ordered = bySeverity(chips);
  const widths = ordered.map((c) => widthOf(T.ailmentChip(c)));
  const lineOf = (k: number, more: number) =>
    widths.slice(0, k).reduce((a, b) => a + b, 0) + (more ? widthOf(T.ailmentMore(more)) : 0) + gap * Math.max(0, k + (more ? 1 : 0) - 1);
  if (lineOf(ordered.length, 0) <= max) return { shown: ordered, more: 0 };
  let k = ordered.length - 1;
  while (k > 0 && lineOf(k, ordered.length - k) > max) k--;
  return { shown: ordered.slice(0, k), more: ordered.length - k };
}
