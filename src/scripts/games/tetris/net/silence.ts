/**
 * 對手靜默逾時（中離兜底）共用常數與倒數警示文案——1v1（netMain）與 FFA（ffaNetMain）共用。
 *
 * 設計理由（保留）：鎖步協定下，靜默的一方會凍結全場（缺其輸入幀其他端無法推進），
 * 判離是防「掛機綁架全場」的兜底。但 10 秒會誤殺只是切分頁/暫離（如回 LINE）的玩家，
 * 故放寬到 30 秒，並從 10 秒起在畫面顯示倒數警示，讓留守方知道發生什麼事。
 */
export const SILENCE_TIMEOUT_MS = 30_000;

/** 靜默警示門檻：對手靜默超過此值即顯示「N 秒後判離」倒數；對手恢復送訊即消失。 */
export const SILENCE_WARN_MS = 10_000;

/**
 * 純函式：依對手靜默毫秒數回傳倒數警示文字；未達警示門檻（含剛好等於）回 null。
 * 剩餘秒數取 ceil（剩 0.1s 仍顯示 1 秒）；超過 timeout 的同幀夾到 0，由判離路徑接手。
 */
export function silenceWarningText(
  silentMs: number,
  warnMs: number = SILENCE_WARN_MS,
  timeoutMs: number = SILENCE_TIMEOUT_MS,
): string | null {
  if (silentMs <= warnMs) return null;
  const remainSec = Math.max(0, Math.ceil((timeoutMs - silentMs) / 1000));
  return `對手連線不穩… ${remainSec} 秒後判離`;
}
