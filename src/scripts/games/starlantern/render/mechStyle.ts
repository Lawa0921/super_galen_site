import type { MechTone } from '../engine/mechanics/index';

/**
 * Mechanic word colours for the Pixi battle picture (plan 8c): the same values as `$slx-mech` in
 * src/styles/_starlantern-ui.scss (ui2/rarity.test.ts holds them equal, apart from each other, and readable on the window
 * colour). A mechanic is text and colour only: no icon, no drawn shape.
 */
export const MECH_FILL: Record<MechTone, number> = {
  heat: 0xffb000, expose: 0x5cffa8, mark: 0xff6fd8, veil: 0x9aa4c8, ward: 0x7fd4ff, purify: 0xd8ff7a, moon: 0xe4d4ff, coins: 0xffd86b, aim: 0xffa08a, embers: 0xff3d2e, beat: 0x3fd8c4, plain: 0xf1ead8,
};
