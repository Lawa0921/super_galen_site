// calendar.ts — 曆法（純函式，全部由遊戲時間 time 推出，不另存狀態）：
//   日 / 季 / 年（春夏秋冬各 DAYS_PER_SEASON 天）、每天的日出 / 日落（正弦曲線，夏至在夏季正中、冬至在冬季正中）、
//   月相（8 相、一夜一相）、季節外觀的逐日過渡（每個物件依雜湊在換季後 0..N−1 天內切換）、地表水結冰季。
import { DAY_LENGTH } from './constants';
import { TWILIGHT } from './sky';
import { BIOME } from './world';

export const SEASON = { SPRING: 0, SUMMER: 1, AUTUMN: 2, WINTER: 3 } as const;
export type Season = (typeof SEASON)[keyof typeof SEASON];
export const SEASON_NAMES = ['春', '夏', '秋', '冬'] as const;
/** 每季天數（改這裡就改一年長度） */
export const DAYS_PER_SEASON = 7;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;
/** 月相週期（天）：8 相，一夜一相 */
export const MOON_CYCLE_DAYS = 8;
export const MOON_NAMES = ['新月', '眉月', '上弦月', '盈凸月', '滿月', '虧凸月', '下弦月', '殘月'] as const;
/** 第一晚的月相（盈凸 → 第二晚滿月，新玩家的頭幾夜不會太黑） */
const MOON_OFFSET = 3;
/** 換季外觀過渡天數：每棵樹 / 每片草在換季後 0..N−1 天內各自切換 */
export const SEASON_TRANSITION_DAYS = 3;
/** 白晝比例：平均 0.5，振幅 DAYLIGHT_AMP（夏至 0.62 ≈ 14.9 小時、冬至 0.38 ≈ 9.1 小時） */
export const DAYLIGHT_AMP = 0.12;
/** 曙暮光隨季節的變化比例（夏天 +15%、冬天 −15%） */
const TWILIGHT_AMP = 0.15;

/** 一年中的位置 → 正弦項（春分 = 春季正中 0、夏至 = 夏季正中 1、冬至 −1） */
function yearSine(dayIndex: number): number {
  const doy = ((dayIndex % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  const equinox = DAYS_PER_SEASON / 2;
  return Math.sin((2 * Math.PI * (doy + 0.5 - equinox)) / DAYS_PER_YEAR);
}

export interface SunTimes {
  /** 日出 / 日落（一天的比例；0 = 午夜） */
  sunrise: number;
  sunset: number;
  /** 曙暮光半寬（一天的比例） */
  twilight: number;
}
/** 第 dayIndex 天（0 起算）的日出 / 日落：一天內固定（太陽不會半天跳位置），逐日平滑變化 */
export function sunTimes(dayIndex: number): SunTimes {
  const s = yearSine(Math.floor(dayIndex));
  const daylight = 0.5 + DAYLIGHT_AMP * s;
  return { sunrise: 0.5 - daylight / 2, sunset: 0.5 + daylight / 2, twilight: TWILIGHT * (1 + TWILIGHT_AMP * s) };
}

/** 新世界的起始時間：春 1 日、日出後天已全亮 */
export const START_TIME = DAY_LENGTH * (sunTimes(0).sunrise + sunTimes(0).twilight + 0.012);

export interface GameDate {
  /** 第幾天（0 起算；世界第一天 = 0） */
  dayIndex: number;
  year: number;
  season: Season;
  /** 該季第幾天（1 起算） */
  dayOfSeason: number;
  /** 一年中的第幾天（0 起算） */
  dayOfYear: number;
  hour: number;
  minute: number;
  /** 一天的進度 0..1 */
  frac: number;
}

export function dayIndexOf(time: number): number { return Math.floor(time / DAY_LENGTH + 1e-9); }
export function timeOfDay(time: number): number {
  const f = time / DAY_LENGTH - dayIndexOf(time);
  return f < 0 ? 0 : f;
}

export function dateOf(time: number): GameDate {
  const dayIndex = dayIndexOf(time);
  const dayOfYear = ((dayIndex % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  const frac = timeOfDay(time);
  const mins = Math.floor(frac * 1440 + 1e-6) % 1440;
  return {
    dayIndex, year: Math.floor(dayIndex / DAYS_PER_YEAR) + 1,
    season: Math.floor(dayOfYear / DAYS_PER_SEASON) as Season, dayOfSeason: (dayOfYear % DAYS_PER_SEASON) + 1, dayOfYear,
    hour: Math.floor(mins / 60), minute: mins % 60, frac,
  };
}
export function seasonOf(dayIndex: number): Season {
  const doy = ((dayIndex % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return Math.floor(doy / DAYS_PER_SEASON) as Season;
}

const pad = (n: number): string => String(n).padStart(2, '0');
/** 「第1年 春 3日 06:40」 */
export function formatDate(time: number): string {
  const d = dateOf(time);
  return `第${d.year}年 ${SEASON_NAMES[d.season]} ${d.dayOfSeason}日 ${pad(d.hour)}:${pad(d.minute)}`;
}
/** 一天的比例 → 「HH:MM」 */
export function formatFrac(frac: number): string {
  const mins = Math.round(frac * 1440) % 1440;
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

/** time 之後的下一個日出（日出前 → 當天的日出；日出後 → 隔天的日出） */
export function nextSunrise(time: number): number {
  const d = dayIndexOf(time);
  const today = (d + sunTimes(d).sunrise) * DAY_LENGTH;
  if (today > time + 1e-6) return today;
  return (d + 1 + sunTimes(d + 1).sunrise) * DAY_LENGTH;
}

/** 月相 0..7（0 新月、4 滿月）；午夜後到日出前仍算前一晚 */
export function moonPhase(time: number): number {
  const d = dayIndexOf(time), night = timeOfDay(time) < 0.5 ? d - 1 : d;
  return (((night + MOON_OFFSET) % MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS;
}

/**
 * 物件（雜湊 h ∈ [0,1)）在第 dayIndex 天的季節外觀：換季後延遲 floor(h × SEASON_TRANSITION_DAYS) 天才切換。
 * 第一年的春天開頭不往回推（不會出現冬天外觀）。
 */
export function seasonLook(dayIndex: number, h: number): Season {
  const lag = Math.floor(Math.max(0, Math.min(0.9999, h)) * SEASON_TRANSITION_DAYS);
  return seasonOf(Math.max(0, dayIndex - lag));
}
/** 背景等「整片」的季節混合：season = 目前季節、prev = 上一季、t = 0..1（換季後 SEASON_TRANSITION_DAYS 天內分階上升） */
export function seasonBlend(time: number): { season: Season; prev: Season; t: number } {
  const d = dayIndexOf(time), season = seasonOf(d);
  const doy = ((d % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  const into = (doy % DAYS_PER_SEASON) + timeOfDay(time);
  const prev = d < DAYS_PER_SEASON ? season : (((season + 3) % 4) as Season);
  const t = prev === season ? 1 : Math.min(1, Math.floor((into / SEASON_TRANSITION_DAYS) * 4 + 1) / 4);
  return { season, prev, t };
}

/** 地表水在這天、這個生態區是否結冰（h = 欄位雜湊，讓冰面逐日擴大 / 融化）：森林只有冬天；雪原夏天以外都結冰 */
export function freezeSeason(dayIndex: number, biome: number, h: number): boolean {
  const look = seasonLook(dayIndex, h);
  if (biome === BIOME.SNOW) return look !== SEASON.SUMMER;
  if (biome === BIOME.FOREST) return look === SEASON.WINTER;
  return false;
}
