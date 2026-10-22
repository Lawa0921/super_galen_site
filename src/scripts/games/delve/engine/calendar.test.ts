// calendar.test.ts — 曆法：日 / 季 / 年、季節日出日落、月相、季節外觀的逐日過渡、結冰季
import { describe, it, expect } from 'vitest';
import {
  DAYS_PER_SEASON, DAYS_PER_YEAR, MOON_CYCLE_DAYS, SEASON_TRANSITION_DAYS, START_TIME,
  dateOf, formatDate, sunTimes, moonPhase, seasonLook, freezeSeason, timeOfDay, nextSunrise, SEASON,
} from './calendar';
import { DAY_LENGTH } from './constants';
import { BIOME } from './world';
import { sunPhase } from './sky';

describe('calendar constants', () => {
  it('四季各 N 天、一年 4N 天', () => {
    expect(DAYS_PER_SEASON).toBeGreaterThanOrEqual(3);
    expect(DAYS_PER_YEAR).toBe(DAYS_PER_SEASON * 4);
    expect(MOON_CYCLE_DAYS).toBe(8);
  });
});

describe('dateOf', () => {
  it('新世界：第 1 年 春 1 日 早上（日出之後、已天亮）', () => {
    const d = dateOf(START_TIME);
    expect(d).toMatchObject({ year: 1, season: SEASON.SPRING, dayOfSeason: 1, dayIndex: 0 });
    const s = sunTimes(0);
    expect(d.frac).toBeGreaterThan(s.sunrise);
    expect(sunPhase(d.frac, s.sunrise, s.sunset, s.twilight).elevation).toBeGreaterThan(0.1);
    expect(d.hour).toBeLessThan(10);
  });
  it('日 → 季 → 年進位', () => {
    expect(dateOf(DAY_LENGTH * 2 + 1)).toMatchObject({ dayIndex: 2, season: SEASON.SPRING, dayOfSeason: 3 });
    expect(dateOf(DAY_LENGTH * DAYS_PER_SEASON)).toMatchObject({ season: SEASON.SUMMER, dayOfSeason: 1, year: 1 });
    expect(dateOf(DAY_LENGTH * (DAYS_PER_SEASON * 3 + 1))).toMatchObject({ season: SEASON.WINTER, dayOfSeason: 2 });
    expect(dateOf(DAY_LENGTH * DAYS_PER_YEAR)).toMatchObject({ year: 2, season: SEASON.SPRING, dayOfSeason: 1, dayOfYear: 0 });
  });
  it('時 / 分', () => {
    expect(dateOf(DAY_LENGTH * (5 + 0.25))).toMatchObject({ hour: 6, minute: 0 });
    expect(dateOf(DAY_LENGTH * (5 + 0.5 + 1 / 48))).toMatchObject({ hour: 12, minute: 30 });
  });
  it('formatDate：第1年 春 3日 06:40', () => {
    const t = DAY_LENGTH * (2 + (6 * 60 + 40) / 1440) + 0.01;
    expect(formatDate(t)).toBe('第1年 春 3日 06:40');
    expect(formatDate(DAY_LENGTH * (DAYS_PER_YEAR + DAYS_PER_SEASON * 3) + DAY_LENGTH * 0.75)).toBe('第2年 冬 1日 18:00');
  });
});

describe('sunTimes（季節日出 / 日落）', () => {
  const mid = (season: number): number => season * DAYS_PER_SEASON + Math.floor(DAYS_PER_SEASON / 2);
  it('夏天白晝長、冬天白晝短；正午固定 12:00', () => {
    const su = sunTimes(mid(SEASON.SUMMER)), wi = sunTimes(mid(SEASON.WINTER)), sp = sunTimes(mid(SEASON.SPRING));
    expect(su.sunset - su.sunrise).toBeGreaterThan(0.58);
    expect(wi.sunset - wi.sunrise).toBeLessThan(0.42);
    expect(Math.abs(sp.sunset - sp.sunrise - 0.5)).toBeLessThan(0.03);
    for (const s of [su, wi, sp]) expect((s.sunrise + s.sunset) / 2).toBeCloseTo(0.5, 6);
    expect(su.sunrise).toBeLessThan(wi.sunrise);
  });
  it('逐日平滑（相鄰兩天差很小），跨年無縫', () => {
    for (let d = 0; d < DAYS_PER_YEAR * 2; d++) {
      expect(Math.abs(sunTimes(d + 1).sunrise - sunTimes(d).sunrise)).toBeLessThan(0.015);
    }
    expect(sunTimes(DAYS_PER_YEAR + 3).sunrise).toBeCloseTo(sunTimes(3).sunrise, 9);
  });
  it('曙暮光長度合理（夏天略長）', () => {
    const su = sunTimes(mid(SEASON.SUMMER)), wi = sunTimes(mid(SEASON.WINTER));
    expect(su.twilight).toBeGreaterThan(wi.twilight);
    expect(wi.twilight).toBeGreaterThan(0.03);
    expect(su.twilight).toBeLessThan(0.07);
  });
  it('timeOfDay / nextSunrise：睡到下一個日出', () => {
    const t = DAY_LENGTH * (3 + 0.9);
    const n = nextSunrise(t);
    expect(n).toBeGreaterThan(t);
    expect(dateOf(n).dayIndex).toBe(4);
    expect(timeOfDay(n)).toBeCloseTo(sunTimes(4).sunrise, 3);
    // 凌晨（日出前）→ 同一天的日出
    const early = DAY_LENGTH * (3 + 0.05);
    expect(dateOf(nextSunrise(early)).dayIndex).toBe(3);
  });
});

describe('moonPhase', () => {
  it('8 個月相，一夜一相，凌晨仍算前一晚', () => {
    const seen = new Set<number>();
    for (let d = 0; d < MOON_CYCLE_DAYS; d++) seen.add(moonPhase(DAY_LENGTH * (d + 0.9)));
    expect(seen.size).toBe(8);
    expect(moonPhase(DAY_LENGTH * (4 + 0.05))).toBe(moonPhase(DAY_LENGTH * (3 + 0.9)));
    expect(moonPhase(DAY_LENGTH * (3 + 0.9 + MOON_CYCLE_DAYS))).toBe(moonPhase(DAY_LENGTH * (3 + 0.9)));
  });
});

describe('seasonLook（季節外觀逐日過渡）', () => {
  it('每個物件在換季後 0..TRANSITION-1 天內切換（依雜湊），之後全部換好', () => {
    const start = DAYS_PER_SEASON; // 夏 1 日
    const hs = [0, 0.2, 0.4, 0.6, 0.8, 0.99];
    const switched = (day: number): number => hs.filter((h) => seasonLook(day, h) === SEASON.SUMMER).length;
    expect(switched(start - 1)).toBe(0);
    expect(switched(start)).toBeGreaterThan(0);
    expect(switched(start)).toBeLessThan(hs.length);
    expect(switched(start + SEASON_TRANSITION_DAYS - 1)).toBe(hs.length);
  });
  it('第一年春天不會倒退成冬天外觀', () => {
    for (const h of [0, 0.5, 0.99]) expect(seasonLook(0, h)).toBe(SEASON.SPRING);
  });
});

describe('freezeSeason（地表水結冰）', () => {
  it('森林只有冬天結冰、雪原除了夏天都結冰、沙漠 / 叢林不結冰', () => {
    const day = (s: number): number => s * DAYS_PER_SEASON + DAYS_PER_SEASON - 1;
    expect(freezeSeason(day(SEASON.WINTER), BIOME.FOREST, 0.5)).toBe(true);
    expect(freezeSeason(day(SEASON.SUMMER), BIOME.FOREST, 0.5)).toBe(false);
    expect(freezeSeason(day(SEASON.SPRING), BIOME.FOREST, 0.5)).toBe(false);
    expect(freezeSeason(day(SEASON.AUTUMN), BIOME.SNOW, 0.5)).toBe(true);
    expect(freezeSeason(day(SEASON.SUMMER), BIOME.SNOW, 0.5)).toBe(false);
    expect(freezeSeason(day(SEASON.WINTER), BIOME.DESERT, 0.5)).toBe(false);
    expect(freezeSeason(day(SEASON.WINTER), BIOME.JUNGLE, 0.5)).toBe(false);
  });
});
