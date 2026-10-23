// weather.test.ts — 天氣：由 seed + 天數決定（確定性）、依季節加權、持續數小時、跨午夜延續、生態區在地化
import { describe, it, expect } from 'vitest';
import {
  SPELL_MIN, SPELL_MAX, WEATHER_KINDS, daySpells, forecast, localWeather, weatherAt, weatherDim, type WeatherKind,
} from './weather';
import { DAY_LENGTH } from './constants';
import { DAYS_PER_SEASON, DAYS_PER_YEAR, SEASON } from './calendar';
import { BIOME } from './world';

const seasonDays = (season: number, years = 12): number[] => {
  const out: number[] = [];
  for (let y = 0; y < years; y++) for (let k = 0; k < DAYS_PER_SEASON; k++) out.push(y * DAYS_PER_YEAR + season * DAYS_PER_SEASON + k);
  return out;
};
/** 某季節所有時段的天氣占比 */
function share(seed: string, season: number): Record<WeatherKind, number> {
  const tot = Object.fromEntries(WEATHER_KINDS.map((k) => [k, 0])) as Record<WeatherKind, number>;
  let all = 0;
  for (const d of seasonDays(season)) for (const s of daySpells(seed, d)) { tot[s.kind] += s.end - s.start; all += s.end - s.start; }
  for (const k of WEATHER_KINDS) tot[k] /= all;
  return tot;
}

describe('daySpells', () => {
  it('確定性：同 seed 同一天一樣，不同 seed 不同', () => {
    expect(daySpells('a', 5)).toEqual(daySpells('a', 5));
    const diff = [0, 1, 2, 3, 4, 5, 6, 7].some((d) => JSON.stringify(daySpells('a', d)) !== JSON.stringify(daySpells('b', d)));
    expect(diff).toBe(true);
  });
  it('一天被連續的時段鋪滿，每段數小時（最後一段可被午夜截短）', () => {
    for (let d = 0; d < 40; d++) {
      const sp = daySpells('cover', d);
      expect(sp.length).toBeGreaterThanOrEqual(2);
      expect(sp[0].start).toBeCloseTo(d, 9);
      expect(sp[sp.length - 1].end).toBeCloseTo(d + 1, 9);
      for (let i = 0; i < sp.length; i++) {
        if (i > 0) expect(sp[i].start).toBeCloseTo(sp[i - 1].end, 9);
        const hours = (sp[i].end - sp[i].start) * 24;
        if (i < sp.length - 1) { expect(hours).toBeGreaterThanOrEqual(SPELL_MIN * 24 - 1e-6); expect(hours).toBeLessThanOrEqual(SPELL_MAX * 24 + 1e-6); }
        expect(hours).toBeGreaterThan(0);
        expect(Math.abs(sp[i].wind)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('季節加權：雪只在冬天、冬天沒有雷雨；夏天晴天最多；春秋會下雨', () => {
    const sp = share('w', SEASON.SPRING), su = share('w', SEASON.SUMMER), au = share('w', SEASON.AUTUMN), wi = share('w', SEASON.WINTER);
    expect(sp.snow + su.snow + au.snow).toBe(0);
    expect(wi.snow).toBeGreaterThan(0.15);
    expect(wi.storm).toBe(0);
    expect(su.clear).toBeGreaterThan(Math.max(su.cloudy, su.rain, su.storm, su.fog));
    expect(sp.rain).toBeGreaterThan(0.1);
    expect(au.fog).toBeGreaterThan(su.fog);
    expect(su.storm).toBeGreaterThan(0);
  });
  it('世界第一天固定晴天', () => {
    for (const seed of ['a', 'b', 'c', 'd']) expect(daySpells(seed, 0).every((s) => s.kind === 'clear')).toBe(true);
  });
  it('跨午夜大多延續前一天最後的天氣', () => {
    let same = 0, n = 0;
    for (let d = 1; d < 200; d++) {
      const prev = daySpells('cont', d - 1), cur = daySpells('cont', d);
      if (prev[prev.length - 1].kind === cur[0].kind) same++;
      n++;
    }
    expect(same / n).toBeGreaterThan(0.5);
  });
});

describe('weatherAt', () => {
  it('時段中間強度 1，換天氣前後漸變（強度 < 1）', () => {
    let found = false;
    for (let d = 0; d < 30 && !found; d++) {
      const sp = daySpells('ramp', d);
      for (let i = 1; i < sp.length; i++) {
        if (sp[i].kind === sp[i - 1].kind) continue;
        const edge = sp[i].start * DAY_LENGTH;
        const a = weatherAt('ramp', edge - 1), b = weatherAt('ramp', edge + 1);
        expect(a.kind).toBe(sp[i - 1].kind);
        expect(b.kind).toBe(sp[i].kind);
        expect(a.intensity).toBeLessThan(0.2);
        expect(b.intensity).toBeLessThan(0.2);
        const mid = weatherAt('ramp', ((sp[i].start + sp[i].end) / 2) * DAY_LENGTH);
        expect(mid.intensity).toBe(1);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe('localWeather / forecast / weatherDim', () => {
  it('雪原：雨 → 雪；沙漠：雪 → 陰、霧 → 晴', () => {
    expect(localWeather('rain', BIOME.SNOW)).toBe('snow');
    expect(localWeather('storm', BIOME.SNOW)).toBe('snow');
    expect(localWeather('snow', BIOME.DESERT)).toBe('cloudy');
    expect(localWeather('fog', BIOME.DESERT)).toBe('clear');
    expect(localWeather('rain', BIOME.FOREST)).toBe('rain');
  });
  it('預報 = 那天白天佔最多時間的天氣', () => {
    for (let d = 0; d < 10; d++) {
      const f = forecast('fc', d);
      const cover: Partial<Record<WeatherKind, number>> = {};
      for (const s of daySpells('fc', d)) {
        const a = Math.max(s.start, d + 0.25), b = Math.min(s.end, d + 0.75);
        if (b > a) cover[s.kind] = (cover[s.kind] ?? 0) + b - a;
      }
      const best = Math.max(...Object.values(cover));
      expect(cover[f]).toBeCloseTo(best, 9);
    }
  });
  it('天空光：晴 1 > 陰 > 雨 > 雷雨', () => {
    expect(weatherDim('clear', 1)).toBe(1);
    expect(weatherDim('cloudy', 1)).toBeLessThan(1);
    expect(weatherDim('rain', 1)).toBeLessThan(weatherDim('cloudy', 1));
    expect(weatherDim('storm', 1)).toBeLessThan(weatherDim('rain', 1));
    expect(weatherDim('storm', 0)).toBe(1);
  });
});

describe('BIOME.OCEAN 天氣', () => {
  it('海洋不改天氣（雨照下、霧照起）', () => {
    for (const k of ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'] as const) expect(localWeather(k, BIOME.OCEAN)).toBe(k);
  });
});
