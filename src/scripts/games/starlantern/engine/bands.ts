/**
 * Which band files hold which difficulty (spec §13 hook 2, plan 8h ruling 16): the Normal bands are the four balance
 * files (no build, no rune: the default build) and the rune bands of the suggested builds, one file a member (opt-in:
 * BANDS=1). The difficulty plans fill the other two.
 */
import { CHARACTER_IDS } from '../data/characters';
import type { Difficulty } from './battle';

export const BANDS: Record<Difficulty, readonly string[]> = {
  normal: [
    'balance.test.ts', 'balance.deep.test.ts', 'balance.lineups.test.ts', 'balance.pace.test.ts',
    ...CHARACTER_IDS.map((id) => `builds.bands.${id}.test.ts`),
  ],
  nightmare: [],
  hell: [],
};
