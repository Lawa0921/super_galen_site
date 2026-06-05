import type { TSpinType } from './types';

/** 連段攻擊加成表（index = combo，combo 從 0 起算第一次消行）。飽和取末值。 */
export const COMBO_ATTACK = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

export interface AttackInput {
  count: number;
  tSpin: TSpinType;
  combo: number;
  b2b: boolean;
}

/** 消行類型的基礎攻擊行數。 */
export function baseAttack(count: number, tSpin: TSpinType): number {
  if (tSpin !== 'none') return [0, 2, 4, 6][Math.min(count, 3)] ?? 0;
  return [0, 0, 1, 2, 4][Math.min(count, 4)] ?? 0;
}

/** 連段加成。 */
export function comboAttack(combo: number): number {
  if (combo <= 0) return 0;
  return COMBO_ATTACK[Math.min(combo, COMBO_ATTACK.length - 1)];
}

/** 總攻擊行數。0 行不送；B2B 僅對困難消除（tetris / T-spin）加成。 */
export function computeAttack({ count, tSpin, combo, b2b }: AttackInput): number {
  if (count === 0) return 0;
  let atk = baseAttack(count, tSpin) + comboAttack(combo);
  if (b2b && (count === 4 || tSpin !== 'none')) atk += 1;
  return atk;
}

/** 抵銷：outgoing 先抵銷 incoming，回傳剩餘 incoming 與淨送出 sent。 */
export function cancelGarbage(incoming: number, outgoing: number): { incoming: number; sent: number } {
  if (outgoing >= incoming) return { incoming: 0, sent: outgoing - incoming };
  return { incoming: incoming - outgoing, sent: 0 };
}
