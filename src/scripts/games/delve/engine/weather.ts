// weather.ts — 天氣（純函式，由 seed + 天數決定，不需要存檔）：
//   每天切成數段「天氣時段」（SPELL_MIN..SPELL_MAX 天，即幾個小時），每段的天氣依季節加權抽、有一定機率延續上一段；
//   新的一天第一段大多延續前一天最後一段（只看前一天自己的抽樣，不遞迴 → O(1)）。換天氣時前後各 RAMP 漸變強度。
//   全域天氣再依玩家所在生態區在地化（雪原下雨 → 下雪、沙漠下雪 → 陰天）。
import { Rng } from './rng';
import { DAY_LENGTH } from './constants';
import { SEASON, dayIndexOf, seasonOf, type Season } from './calendar';
import { BIOME } from './world';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';
export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];
export const WEATHER_NAMES: Record<WeatherKind, string> = { clear: '晴', cloudy: '陰', rain: '雨', storm: '雷雨', snow: '雪', fog: '霧' };
/** 天氣時段長度（一天的比例）：2.4–7.2 小時 */
export const SPELL_MIN = 0.1;
export const SPELL_MAX = 0.3;
/** 換天氣時的漸變長度（一天的比例，約 36 分鐘） */
export const RAMP = 0.025;
/** 同一天裡延續上一段天氣的機率 / 跨午夜延續的機率 */
const PERSIST = 0.35;
const CARRY = 0.65;

/** 季節權重（clear, cloudy, rain, storm, snow, fog） */
export const SEASON_WEIGHTS: Record<Season, Record<WeatherKind, number>> = {
  [SEASON.SPRING]: { clear: 4, cloudy: 3, rain: 3, storm: 0.7, snow: 0, fog: 1.2 },
  [SEASON.SUMMER]: { clear: 6, cloudy: 2, rain: 1.4, storm: 1.6, snow: 0, fog: 0.3 },
  [SEASON.AUTUMN]: { clear: 3.5, cloudy: 3, rain: 2.6, storm: 0.6, snow: 0, fog: 2 },
  [SEASON.WINTER]: { clear: 3.5, cloudy: 3, rain: 0.4, storm: 0, snow: 3.6, fog: 1.4 },
};
const WIND_SCALE: Record<WeatherKind, number> = { clear: 0.25, cloudy: 0.4, rain: 0.6, storm: 1, snow: 0.5, fog: 0.08 };
/** 滿強度時的天空光倍率 */
const DIM: Record<WeatherKind, number> = { clear: 1, cloudy: 0.84, rain: 0.68, storm: 0.5, snow: 0.78, fog: 0.8 };

export interface Spell {
  /** 起訖（以「天」為單位的絕對時間：dayIndex + 比例） */
  start: number; end: number;
  kind: WeatherKind;
  /** 風 −1..1（負 = 往左吹） */
  wind: number;
}

function pick(w: Record<WeatherKind, number>, r: number): WeatherKind {
  let total = 0;
  for (const k of WEATHER_KINDS) total += w[k];
  let x = r * total;
  for (const k of WEATHER_KINDS) { x -= w[k]; if (x < 0 && w[k] > 0) return k; }
  return 'clear';
}

function rawSpells(seed: string, d: number): Spell[] {
  const r = new Rng(`${seed}:wx:${d}`);
  const w = SEASON_WEIGHTS[seasonOf(d)];
  const out: Spell[] = [];
  let t = 0, prev: WeatherKind | null = null;
  while (t < 1 - 1e-9) {
    let dur = SPELL_MIN + r.next() * (SPELL_MAX - SPELL_MIN);
    if (1 - (t + dur) < SPELL_MIN) dur = 1 - t;
    const keep = r.next() < PERSIST;
    // 世界第一天固定晴天（新玩家先熟悉環境）
    const kind: WeatherKind = d === 0 ? 'clear' : keep && prev ? prev : pick(w, r.next());
    const wind = (r.next() * 2 - 1) * WIND_SCALE[kind];
    out.push({ start: d + t, end: d + t + dur, kind, wind });
    t += dur; prev = kind;
  }
  out[out.length - 1].end = d + 1;
  return out;
}

const CACHE = new Map<string, Spell[]>();
/** 第 d 天的天氣時段（確定性；有小快取） */
export function daySpells(seed: string, d: number): Spell[] {
  const key = `${seed}|${d}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const sp = rawSpells(seed, d);
  if (d > 0) {
    const last = rawSpells(seed, d - 1).at(-1)!;
    const r = new Rng(`${seed}:wxc:${d}`);
    if (r.next() < CARRY && SEASON_WEIGHTS[seasonOf(d)][last.kind] > 0) { sp[0].kind = last.kind; sp[0].wind = last.wind; }
  }
  if (CACHE.size > 24) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, sp);
  return sp;
}

export interface WeatherState { kind: WeatherKind; intensity: number; wind: number; }

/** 遊戲時間 time 的全域天氣（強度在換天氣前後漸變） */
export function weatherAt(seed: string, time: number): WeatherState {
  const d = dayIndexOf(time), x = time / DAY_LENGTH;
  const sp = daySpells(seed, d);
  let i = sp.findIndex((s) => x < s.end);
  if (i < 0) i = sp.length - 1;
  const s = sp[i];
  const prev = i > 0 ? sp[i - 1] : d > 0 ? daySpells(seed, d - 1).at(-1)! : s;
  const next = i < sp.length - 1 ? sp[i + 1] : daySpells(seed, d + 1)[0];
  let inten = 1;
  if (prev.kind !== s.kind) inten = Math.min(inten, (x - s.start) / RAMP);
  if (next.kind !== s.kind) inten = Math.min(inten, (s.end - x) / RAMP);
  return { kind: s.kind, intensity: Math.max(0, Math.min(1, inten)), wind: s.wind };
}

/** 依生態區在地化：雪原的雨 / 雷雨 → 雪；沙漠的雪 → 陰、霧 → 晴 */
export function localWeather(kind: WeatherKind, biome: number): WeatherKind {
  if (biome === BIOME.SNOW && (kind === 'rain' || kind === 'storm')) return 'snow';
  if (biome === BIOME.DESERT) {
    if (kind === 'snow') return 'cloudy';
    if (kind === 'fog') return 'clear';
  }
  return kind;
}

/** 預報：第 d 天白天（06:00–18:00）佔最多時間的天氣 */
export function forecast(seed: string, d: number): WeatherKind {
  const cover = new Map<WeatherKind, number>();
  for (const s of daySpells(seed, d)) {
    const a = Math.max(s.start, d + 0.25), b = Math.min(s.end, d + 0.75);
    if (b > a) cover.set(s.kind, (cover.get(s.kind) ?? 0) + b - a);
  }
  let best: WeatherKind = 'clear', bv = -1;
  for (const [k, v] of cover) if (v > bv + 1e-12) { bv = v; best = k; }
  return best;
}

/** 天空光倍率（1 = 不變暗） */
export function weatherDim(kind: WeatherKind, intensity: number): number {
  return 1 - (1 - DIM[kind]) * Math.max(0, Math.min(1, intensity));
}
export function isPrecip(kind: WeatherKind): boolean { return kind === 'rain' || kind === 'storm' || kind === 'snow'; }
