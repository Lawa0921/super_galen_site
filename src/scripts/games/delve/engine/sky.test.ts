// sky.test.ts — 太陽相位 → 天空光顏色（季節 pass 會餵入每天不同的日出 / 日落）
import { describe, it, expect } from 'vitest';
import { sunPhase, skyLightColor, skyColor, isNight, DEFAULT_SUNRISE, DEFAULT_SUNSET } from './sky';
import { skyBrightness } from './lighting';
import { DAY_LENGTH } from './constants';

describe('sunPhase', () => {
  it('日出 / 日落時 elevation = 0，正午 1，午夜 −1；rising 只在上午為真', () => {
    expect(sunPhase(DEFAULT_SUNRISE).elevation).toBeCloseTo(0, 6);
    expect(sunPhase(DEFAULT_SUNSET).elevation).toBeCloseTo(0, 6);
    expect(sunPhase(0.5).elevation).toBe(1);
    expect(sunPhase(0).elevation).toBe(-1);
    expect(sunPhase(0.26).rising).toBe(true);
    expect(sunPhase(0.74).rising).toBe(false);
  });
  it('日出 / 日落時間是參數（夏天日出早、日落晚）', () => {
    const summer = { sunrise: 0.2, sunset: 0.82 };
    expect(sunPhase(0.2, summer.sunrise, summer.sunset).elevation).toBeCloseTo(0, 6);
    expect(sunPhase(0.22, summer.sunrise, summer.sunset).elevation).toBeGreaterThan(sunPhase(0.22).elevation);
    expect(sunPhase(0.8, summer.sunrise, summer.sunset).elevation).toBeGreaterThan(0);
    expect(sunPhase(0.8).elevation).toBeLessThan(0);
  });
});

describe('skyLightColor / skyColor', () => {
  it('黎明粉、白天白、黃昏橘、夜晚深藍', () => {
    const night = skyLightColor(-1, true), dawn = skyLightColor(0, true), day = skyLightColor(1, false), dusk = skyLightColor(0, false);
    expect(night[2]).toBeGreaterThan(night[0] * 1.5);
    expect(Math.max(...night)).toBeLessThan(0.3);
    expect(dawn[0]).toBeGreaterThan(dawn[1]);
    expect(dawn[2]).toBeGreaterThan(dawn[1]);
    for (const c of day) expect(c).toBeCloseTo(1, 5);
    expect(dusk[0]).toBeGreaterThan(dusk[1]);
    expect(dusk[1]).toBeGreaterThan(dusk[2]);
  });
  it('skyColor(t)：連續，最大通道 ≈ skyBrightness', () => {
    for (let t = 0; t < DAY_LENGTH; t += 1) {
      const a = skyColor(t), b = skyColor(t + 1);
      for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.05);
      expect(Math.abs(Math.max(...a) - skyBrightness(t))).toBeLessThan(0.12);
    }
  });
});

describe('季節化的天空亮度 / 夜晚判定', () => {
  it('skyBrightness 接受日出 / 日落 / 曙暮光參數（預設值行為不變）', () => {
    expect(skyBrightness(DAY_LENGTH * 0.27)).toBeCloseTo(skyBrightness(DAY_LENGTH * 0.27, 0.25, 0.75, 0.05), 9);
    // 冬天：0.31 日出 → 07:12 還很暗；夏天 0.19 日出 → 07:12 全亮
    expect(skyBrightness(DAY_LENGTH * 0.3, 0.31, 0.69, 0.045)).toBeLessThan(0.6);
    expect(skyBrightness(DAY_LENGTH * 0.3, 0.19, 0.81, 0.055)).toBe(1);
    expect(skyBrightness(DAY_LENGTH * 0.8, 0.19, 0.81, 0.055)).toBeGreaterThan(0.12);
  });
  it('isNight(frac, sunrise, sunset, tw)：預設 = 一天前 / 後 20%', () => {
    expect(isNight(0.19)).toBe(true);
    expect(isNight(0.2)).toBe(false);
    expect(isNight(0.79)).toBe(false);
    expect(isNight(0.8)).toBe(true);
    expect(isNight(0.26, 0.31, 0.69, 0.045)).toBe(true);
    expect(isNight(0.84, 0.19, 0.81, 0.055)).toBe(false);
  });
});
