/**
 * 進度系統（純函式）：XP / 等級。只升不降，與 IO 無關，可單測。
 */

/** 一場對戰可得 XP：參與 10 + 名次獎勵 5*(人數-名次) + 勝利 25。placement 1 = 冠軍。 */
export function xpForMatch(players: number, placement: number, isWinner: boolean): number {
  const base = 10;
  const placeBonus = 5 * Math.max(0, players - placement);
  const winBonus = isWinner ? 25 : 0;
  return base + placeBonus + winBonus;
}

/** 累計到第 L 級（L>=1）所需總 XP：三角數門檻 50 * L * (L-1)。 */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

/** 由總 XP 推算等級（滿足門檻的最大 L，最低 1）。 */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

/** 等級進度：目前等級、本級已累積 into、本級需要 need、比例 ratio(0..1)。 */
export function levelProgress(totalXp: number): { level: number; into: number; need: number; ratio: number } {
  const level = levelForXp(totalXp);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const into = totalXp - cur;
  const need = next - cur;
  return { level, into, need, ratio: need > 0 ? into / need : 0 };
}
