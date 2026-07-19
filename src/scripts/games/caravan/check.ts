import type { Rng } from './rng';
import type { Stat } from './types';

export interface CheckInput {
  stat: Stat;
  dc: number;
  /** 屬性調整值 */
  modifier: number;
  /** 情境/隊伍加成 */
  bonus?: number;
}

export interface CheckResult {
  die: number;
  total: number;
  dc: number;
  success: boolean;
  critical: 'success' | 'failure' | null;
}

/** D&D 式屬性調整值 */
export function statMod(value: number): number {
  return Math.floor((value - 10) / 2);
}

export function resolveCheck(rng: Rng, input: CheckInput): CheckResult {
  const die = rng.d20();
  const total = die + input.modifier + (input.bonus ?? 0);
  const critical = die === 20 ? 'success' : die === 1 ? 'failure' : null;
  const success = die === 20 ? true : die === 1 ? false : total >= input.dc;
  return { die, total, dc: input.dc, success, critical };
}
