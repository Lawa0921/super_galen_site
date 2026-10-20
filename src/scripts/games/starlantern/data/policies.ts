import type { PolicyTable } from '../engine/policy';

/**
 * The sim player's default policies, one short list per character (spec §12.5's starting proposal; plan 8a Task 4).
 * They belong to each character's "standard" build: when the suggested builds (spec §16) read their policies from build
 * data, the standard ones must equal these. A roster plan that renames a skill changes it here.
 */
export const DEFAULT_POLICIES: PolicyTable = {
  // Chizuru raises a barrier once a boss or an elite is under 30% HP (plan 8c Task 3 tuning, retune.md).
  chizuru: [{ kind: 'ensure-barrier', skills: ['ward', 'purify-ward'], big: true, below: 30 }],
  bobby: [{ kind: 'ensure-device', skills: ['turret'] }],
  // Rin marks a boss or an elite once it is under half its HP (plan 8c Task 2 tuning, retune.md).
  rin: [{ kind: 'ensure-mark', skill: 'rin-mark', big: true, below: 50 }],
  safira: [{ kind: 'alternate' }],
  liz: [{ kind: 'spend-at', gauge: 'coins', min: 6, skill: 'jackpot' }, { kind: 'spend-at', gauge: 'coins', min: 6, skill: 'fortune-strike' }],
  sylvie: [{ kind: 'spend-at', gauge: 'aim', min: 3, skill: 'starfall-arrow' }],
};
