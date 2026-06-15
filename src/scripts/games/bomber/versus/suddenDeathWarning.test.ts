import { describe, it, expect } from 'vitest';
import { warningRing, ringCollapseTimeMs, WARNING_LEAD_MS } from './suddenDeathWarning';
import { SUDDEN_DEATH_AT_MS, RING_INTERVAL_MS, MAX_COLLAPSE_RING } from './versusMatch';

describe('warningRing (sudden-death lead-in)', () => {
  it('在第一圈視窗開始前回傳 null', () => {
    expect(warningRing(0)).toBeNull();
    expect(warningRing(SUDDEN_DEATH_AT_MS - WARNING_LEAD_MS - 1)).toBeNull(); // 116999
  });

  it('在 ring1 塌縮前 LEAD 內回傳 1（領先塌縮、120s 前就閃）', () => {
    expect(warningRing(SUDDEN_DEATH_AT_MS - WARNING_LEAD_MS)).toBe(1); // 117000 視窗起點（含）
    expect(warningRing(SUDDEN_DEATH_AT_MS - 1)).toBe(1);               // 119999 視窗內
    expect(warningRing(SUDDEN_DEATH_AT_MS - 1500)).toBe(1);           // ~1.5s 前仍為 1
  });

  it('ring1 塌縮當下即切換為警示下一圈（ring2），不再警示 ring1', () => {
    // 120000：ring1 已（或正）塌縮，視窗變為 ring2 的 [120000,123000)
    expect(warningRing(ringCollapseTimeMs(1))).toBe(2);
    expect(warningRing(SUDDEN_DEATH_AT_MS + 1)).toBe(2);
  });

  it('兩次塌縮之間警示「即將塌的那一圈」', () => {
    expect(warningRing(ringCollapseTimeMs(2) - 1)).toBe(2); // 122999 → ring2 即將塌
    expect(warningRing(ringCollapseTimeMs(2))).toBe(3);     // 123000 → 改警示 ring3
    expect(warningRing(ringCollapseTimeMs(3) - 1)).toBe(3); // 125999 → ring3 即將塌
  });

  it('ring3（最後一圈）塌縮後回傳 null（絕不警示 ring4+）', () => {
    expect(warningRing(ringCollapseTimeMs(MAX_COLLAPSE_RING))).toBeNull(); // 126000
    expect(warningRing(999_999)).toBeNull();
  });

  it('時間表與引擎公式對齊：collapseTime(r)=SUDDEN_DEATH_AT_MS+(r-1)*RING_INTERVAL_MS', () => {
    expect(ringCollapseTimeMs(1)).toBe(SUDDEN_DEATH_AT_MS);
    expect(ringCollapseTimeMs(2)).toBe(SUDDEN_DEATH_AT_MS + RING_INTERVAL_MS);
    expect(ringCollapseTimeMs(3)).toBe(SUDDEN_DEATH_AT_MS + 2 * RING_INTERVAL_MS);
  });

  it('是純函式：同一 elapsedMs 多次呼叫結果一致', () => {
    const t = SUDDEN_DEATH_AT_MS - 500;
    expect(warningRing(t)).toBe(warningRing(t));
    expect(warningRing(t)).toBe(1);
  });
});
