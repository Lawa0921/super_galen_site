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
  /** M17：實際負責這次遠征檢定的出征者。 */
  actorId?: string;
  actorName?: string;
  /** M17：UI 顯示完整公式，避免玩家只看到不透明總值。 */
  breakdown?: {
    stat: number;
    skill: number;
    role: number;
    party: number;
    captain: number;
    condition: number;
  };
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
