import type { MechTone } from '../engine/mechanics/index';

/**
 * Mechanic word colours for the Pixi battle picture (plan 8c): the same values as `$slx-mech` in
 * src/styles/_starlantern-ui.scss (ui2/rarity.test.ts holds them equal, apart from each other, and readable on the window
 * colour). A mechanic is text and colour only: no icon, no drawn shape.
 */
export const MECH_FILL: Record<MechTone, number> = {
  heat: 0xffb000, expose: 0x5cffa8, mark: 0xff6fd8, veil: 0x9aa4c8, plain: 0xf1ead8,
};
