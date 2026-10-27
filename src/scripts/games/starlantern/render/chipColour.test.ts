// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AFFIX_FILL, AILMENT_FILL } from './ailmentStyle';
import { CHIP_DE, HUE, MARGIN, chipCandidates, chipSetOf, deltaE2000, lchOf } from './chipColour';

/** Roster plan B2 review item 9: the forget chip's colour is still the search's pick under the chips the game has now. */
describe('the forget chip colour search (roster plan B9)', () => {
  const scss = readFileSync(resolve(process.cwd(), 'src/styles/_starlantern-ui.scss'), 'utf8');
  const set = chipSetOf(scss, AFFIX_FILL, 'forget', '8fd9b6');

  it('yields #66B87E, the colour the game uses', () => {
    const [pick] = chipCandidates(set);
    expect(pick.hex).toBe('66b87e');
    expect(AILMENT_FILL.forget).toBe(0x66b87e);
    // Its three nearest chips, as the report gives them, and every one clear of CHIP_DE with the margin.
    expect(pick.near.map(([k, d]) => [k, Number(d.toFixed(1))])).toEqual([['mech beat', 15.6], ['mech veil', 15.8], ['mech expose', 16.7]]);
    expect(pick.near[0][1]).toBeGreaterThanOrEqual(CHIP_DE + MARGIN);
    expect(Number(deltaE2000('66b87e', '8fd9b6').toFixed(1))).toBe(11.2);
  }, 120_000);

  it('the hue window is inclusive at both ends, and the art itself is not a candidate', () => {
    expect(HUE).toEqual([150, 200]);
    const [, , h] = lchOf('66b87e');
    expect(h).toBeGreaterThanOrEqual(HUE[0]);
    expect(h).toBeLessThanOrEqual(HUE[1]);
    // The art's colour sits under CHIP_DE against beat, expose and veil.
    for (const k of ['beat', 'expose', 'veil']) expect(deltaE2000('8fd9b6', set.mech[k]), k).toBeLessThan(CHIP_DE);
  });
});
