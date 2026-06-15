// src/scripts/games/bomber/versus/suddenDeathWarning.ts
import { SUDDEN_DEATH_AT_MS, RING_INTERVAL_MS, MAX_COLLAPSE_RING } from './versusMatch';

/** 縮圈警示提前量（ms）：在某圈真正塌縮前 N 毫秒就開始閃紅提示。 */
export const WARNING_LEAD_MS = 3_000;

/**
 * 縮圈時間表：第 r 圈（1..MAX_COLLAPSE_RING）在
 *   collapseTime(r) = SUDDEN_DEATH_AT_MS + (r - 1) * RING_INTERVAL_MS
 * 這一刻由引擎 stepSuddenDeath 塌縮（與 versusMatch 完全對齊）。
 */
export function ringCollapseTimeMs(ring: number): number {
  return SUDDEN_DEATH_AT_MS + (ring - 1) * RING_INTERVAL_MS;
}

/**
 * 純函式：依 elapsedMs 推算「此刻應閃紅警示哪一圈即將塌縮」。
 *
 * 規則：
 * - 對每個將塌的圈 r（1..MAX_COLLAPSE_RING），其警示視窗為
 *     [collapseTime(r) - WARNING_LEAD_MS, collapseTime(r))
 *   亦即「在塌縮前 WARNING_LEAD_MS 內」閃紅，塌縮當下即停止（讓警示「領先」塌縮）。
 * - 不會警示 r > MAX_COLLAPSE_RING（引擎根本不塌這些圈）。
 * - 視窗外回傳 null（不顯示警示）。
 *
 * 完全決定性：只依賴傳入的 elapsedMs，不碰 Date.now / Math.random。
 *
 * 範例（SUDDEN_DEATH_AT_MS=120000, RING_INTERVAL_MS=3000, LEAD=3000）：
 * - 116999 → null（尚未進入任何視窗）
 * - 117000 → 1（ring1 在 120000 塌，視窗 [117000,120000)）
 * - 119999 → 1
 * - 120000 → 2（ring1 已塌，ring2 在 123000 塌，視窗 [120000,123000)）
 * - 125999 → 3
 * - 126000 → null（ring3 已塌，無 ring4 可警示）
 */
export function warningRing(elapsedMs: number): number | null {
  for (let r = 1; r <= MAX_COLLAPSE_RING; r++) {
    const collapseAt = ringCollapseTimeMs(r);
    if (elapsedMs >= collapseAt - WARNING_LEAD_MS && elapsedMs < collapseAt) {
      return r;
    }
  }
  return null;
}
