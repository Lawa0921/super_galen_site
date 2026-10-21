import type { PolicyTable } from '../engine/policy';

/**
 * The sim player's default policies, one short list per character (spec §12.5's starting proposal; plan 8a Task 4).
 * They belong to each character's "standard" build: when the suggested builds (spec §16) read their policies from build
 * data, the standard ones must equal these. A roster plan that renames a skill changes it here.
 */
export const DEFAULT_POLICIES: PolicyTable = {
  // Chizuru raises a barrier once a boss or an elite is under 30% HP (plan 8c Task 3 tuning, retune.md).
  chizuru: [{ kind: 'ensure-barrier', skills: ['ward', 'purify-ward'], big: true, below: 30 }],
  // Bobby keeps his devices up while a boss or an elite stands; the shield generator is left to the player (plan 8c Task 6 tuning, retune.md).
  // With 雙砲台 he keeps two turrets out (engine/policy.ts, plan 8d Task 8).
  bobby: [{ kind: 'ensure-device', skills: ['turret', 'shock-mine', 'repair-drone'], big: true }],
  // Rin marks a boss or an elite once it is under half its HP (plan 8c Task 2 tuning, retune.md).
  // 8d Task 3 ruling 1: her mark is innate, and she marks a boss or an elite from the first round.
  rin: [{ kind: 'ensure-mark', skill: 'rin-mark', big: true }],
  // Safira keeps the beat, but with one damage skill she casts it again rather than attack (plan 8c Task 5 tuning, retune.md).
  safira: [{ kind: 'alternate', repeat: true }],
  // Liz spends 大手筆 from four coins (plan 8d Task 6 tuning, retune.md: more, smaller spends kept her lineups in parity).
  liz: [{ kind: 'spend-at', gauge: 'coins', min: 6, skill: 'jackpot' }, { kind: 'spend-at', gauge: 'coins', min: 4, skill: 'fortune-strike' }],
  sylvie: [{ kind: 'spend-at', gauge: 'aim', min: 3, skill: 'starfall-arrow' }],
};
