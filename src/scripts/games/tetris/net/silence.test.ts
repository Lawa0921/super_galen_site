import { describe, it, expect } from 'vitest';
import { SILENCE_TIMEOUT_MS, SILENCE_WARN_MS, silenceWarningText } from './silence';

describe('silence 共用常數（1v1 / FFA）', () => {
  it('判離 30s、警示 10s（切分頁回 LINE 不該 10 秒就被判敗）', () => {
    expect(SILENCE_TIMEOUT_MS).toBe(30_000);
    expect(SILENCE_WARN_MS).toBe(10_000);
  });

  it('警示門檻必須早於判離（倒數區間存在）', () => {
    expect(SILENCE_WARN_MS).toBeLessThan(SILENCE_TIMEOUT_MS);
  });
});

describe('silenceWarningText（畫面倒數警示文字）', () => {
  it('未達警示門檻（含剛好等於）→ null（不顯示）', () => {
    expect(silenceWarningText(0)).toBeNull();
    expect(silenceWarningText(9_999)).toBeNull();
    expect(silenceWarningText(10_000)).toBeNull();
  });

  it('超過門檻 → 顯示剩餘秒數（ceil，不出現 0 秒卻還沒判離的錯覺）', () => {
    expect(silenceWarningText(10_001)).toBe('對手連線不穩… 20 秒後判離');
    expect(silenceWarningText(25_000)).toBe('對手連線不穩… 5 秒後判離');
    expect(silenceWarningText(29_900)).toBe('對手連線不穩… 1 秒後判離');
  });

  it('超過 timeout（判離路徑接手前的同幀）不出現負數', () => {
    expect(silenceWarningText(31_000)).toBe('對手連線不穩… 0 秒後判離');
  });

  it('warn / timeout 可注入（控制器自訂 timeoutMs 時倒數一致）', () => {
    expect(silenceWarningText(3_000, 2_000, 6_000)).toBe('對手連線不穩… 3 秒後判離');
    expect(silenceWarningText(1_000, 2_000, 6_000)).toBeNull();
  });
});
