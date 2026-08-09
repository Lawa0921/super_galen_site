import type { Move } from '../combat';
import type { CompanionRecord } from '../save';

export type VeteranMasteryRank = 0 | 1 | 2 | 3;

/**
 * Lv5 本身就是第一階老兵門檻；之後讓既有、仍持續累積的 XP 成為橫向精通進度。
 * 不抬高角色等級，也不增加永久屬性，避免破壞 M22–M30 的 Lv1–Lv5 職涯邊界。
 */
export const VETERAN_XP_THRESHOLDS = [320, 500, 750] as const;

export interface VeteranMasteryProfile {
  rank: VeteranMasteryRank;
  nextXp: number | null;
  title: string;
}

export const VETERAN_REPOSITION_MOVE_ID = 'veteran-reposition';

export const VETERAN_REPOSITION_MOVE: Move = {
  id: VETERAN_REPOSITION_MOVE_ID,
  name: '戰術換位',
  kind: 'support',
  target: 'self',
  hitStat: 'dex',
  formationShift: 'toggle',
  narration: '{actor}抓住陣線空隙重新調整站位。',
};

export function veteranMasteryRank(record: Pick<CompanionRecord, 'level' | 'xp'>): VeteranMasteryRank {
  if (record.level < 5 || record.xp < VETERAN_XP_THRESHOLDS[0]) return 0;
  if (record.xp >= VETERAN_XP_THRESHOLDS[2]) return 3;
  if (record.xp >= VETERAN_XP_THRESHOLDS[1]) return 2;
  return 1;
}

export function veteranMasteryProfile(record: Pick<CompanionRecord, 'level' | 'xp'>): VeteranMasteryProfile {
  const rank = veteranMasteryRank(record);
  const nextXp = rank === 0
    ? VETERAN_XP_THRESHOLDS[0]
    : rank === 1
      ? VETERAN_XP_THRESHOLDS[1]
      : rank === 2
        ? VETERAN_XP_THRESHOLDS[2]
        : null;
  return {
    rank,
    nextXp,
    title: rank === 0 ? '尚未成為老兵' : `老兵精通 ${['', 'I', 'II', 'III'][rank]}`,
  };
}

/** 老兵戰術屬於職涯之外的通用戰場素養，不佔原本四格戰技配置。 */
export function appendVeteranMasteryMoves(record: Pick<CompanionRecord, 'level' | 'xp'>, moves: Move[]): Move[] {
  if (veteranMasteryRank(record) === 0 || moves.some((move) => move.id === VETERAN_REPOSITION_MOVE_ID)) {
    return moves.map((move) => ({ ...move }));
  }
  return [...moves.map((move) => ({ ...move })), { ...VETERAN_REPOSITION_MOVE }];
}
