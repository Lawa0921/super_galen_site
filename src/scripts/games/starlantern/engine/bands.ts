/**
 * Which band files hold which difficulty (spec §13 hook 2, plan 8h ruling 16): the Normal bands are the four balance
 * files (no build, no rune: the default build) and the rune bands of the suggested builds, one file a member (opt-in:
 * BANDS=1). Nightmare and Hell hold the difficulty bands (difficulty plan Task 5a), opt-in the same way.
 */
import { CHARACTER_IDS } from '../data/characters';
import type { Difficulty } from './battle';

export const BANDS: Record<Difficulty, readonly string[]> = {
  normal: [
    'balance.test.ts', 'balance.deep.test.ts', 'balance.lineups.test.ts', 'balance.pace.test.ts',
    // Band 21 (bond plan Task 4): every companion at 心契; opt-in (BOND_BANDS=1), so the sim gate's four files stay as they are.
    'balance.bond.test.ts',
    // Band 22 (roster plan B12): the monster roster; opt-in (ROSTER_BANDS=1), outside the sim gate the same way.
    'balance.roster.test.ts',
    ...CHARACTER_IDS.map((id) => `builds.bands.${id}.test.ts`),
  ],
  // The difficulty bands (difficulty plan Task 5a, spec §6.2): one opt-in file a tier, the party on the cell's builds.
  // Band 22j (roster plan B12): the roster's bosses and wardens on both tiers, one opt-in file in each.
  nightmare: ['tierBands.nightmare.test.ts', 'tierBands.roster.test.ts'],
  hell: ['tierBands.hell.test.ts', 'tierBands.roster.test.ts'],
};
