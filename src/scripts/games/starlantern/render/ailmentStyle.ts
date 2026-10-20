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
  poison: 0xb48cff, sleep: 0xc4c8dc, burn: 0xff8a4a, freeze: 0x8fe8ff, chill: 0x8fa8ff, shock: 0xffe45c, bleed: 0xff5a6e,
};

/** The ink colour of a row's 「+N」 (the folded ailments are not one colour). */
export const AILMENT_MORE_FILL = 0xf1ead8;

/**
 * The order a row shows ailments in, most severe first (plan 8b follow-up): what costs a turn (freeze, sleep), then
 * damage every round (bleed, which stacks; burn; poison), then what only shifts numbers (shock, chill). Fixed, so the
 * same ailments always read the same way, and a full row folds the mildest into 「+N」.
 */
export const AILMENT_SEVERITY: readonly AilmentShown[] = ['freeze', 'sleep', 'bleed', 'burn', 'poison', 'shock', 'chill'];

export const bySeverity = (chips: readonly AilmentChip[]): AilmentChip[] =>
  [...chips].sort((a, b) => AILMENT_SEVERITY.indexOf(a.id) - AILMENT_SEVERITY.indexOf(b.id));

/** A label's width at `size` px, estimated without measuring (no canvas or layout needed): a CJK character is a full em, anything else (digits, ×, +) 0.6 em. */
export const textWidth = (text: string, size: number): number =>
  [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.6), 0);

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
