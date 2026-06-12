/**
 * 快速配對撮合規則（純函式，無 I/O）。
 *
 * 規則（v1 刻意簡單，spec：2026-06-11-dungeon-arcade-matchmaking-queue-design）：
 * - waiting 依 joinedAt 升冪（同分以 id 字典序決勝，撮合穩定）。
 * - 最早者等待 < windowMs → 先不撮（給更多人湊團的機會窗）。
 * - ≥3 人 → 取最早 min(n, 8) 人開 FFA。
 * - =2 人 → 1v1。
 * - <2 人 → null。
 */
export interface QueueEntry {
  id: string;
  name: string;
  rating: number;
  joinedAt: number;
}

export type MatchMode = '1v1' | 'ffa';

export interface FormedMatch {
  players: QueueEntry[];
  mode: MatchMode;
}

/** 湊團機會窗：最早者至少等這麼久才撮合。 */
export const MATCH_WINDOW_MS = 10_000;

/** FFA 單局人數上限。 */
export const FFA_MAX_PLAYERS = 8;

export function tryFormMatch(
  waiting: QueueEntry[],
  now: number,
  windowMs: number = MATCH_WINDOW_MS,
): FormedMatch | null {
  if (waiting.length < 2) return null;

  // 不改動呼叫端陣列；同 joinedAt 以 id 次序決勝
  const sorted = [...waiting].sort(
    (a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  if (now - sorted[0].joinedAt < windowMs) return null;

  if (sorted.length >= 3) {
    return { players: sorted.slice(0, FFA_MAX_PLAYERS), mode: 'ffa' };
  }
  return { players: sorted, mode: '1v1' };
}
