import type { AilmentShown } from '../engine/ailments';

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
