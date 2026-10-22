import type { MechTone } from '../engine/mechanics/index';

/**
 * Mechanic word colours for the Pixi battle picture (plan 8c): the same values as `$slx-mech` in
 * src/styles/_starlantern-ui.scss (ui2/rarity.test.ts holds them equal, apart from each other, and readable on the window
 * colour). A mechanic is text and colour only: no icon, no drawn shape.
 */
export const MECH_FILL: Record<MechTone, number> = {
  heat: 0xff9a10, expose: 0x5cffa8, mark: 0xff6cd9, veil: 0x92b4ac, ward: 0x4ac2ff, purify: 0xd6ff7b, moon: 0xe6c6ff, coins: 0xd3ae46, aim: 0xff9bb8, embers: 0xff3c2a, beat: 0x3fd8c4, devices: 0xc0a081, plain: 0xf1ead8,
};
