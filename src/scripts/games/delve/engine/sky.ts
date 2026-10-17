// sky.ts — 天空光的顏色（純函式，無狀態）。
//   sunPhase(dayFrac, sunrise, sunset) → 太陽高度 elevation ∈ [−1, 1] + 上午 / 下午旗標；
//   skyLightColor(elevation, rising) → 天空光 RGB（夜晚深藍、黎明粉、白天白、黃昏橘）。
//   日出 / 日落是參數（以「一天的比例」表示）：季節 / 曆法 pass 每天餵入不同的值即可，不用改這裡的時鐘。
import { DAY_LENGTH } from './constants';

export type SkyRGB = readonly [number, number, number];

/** 預設日出 / 日落（一天的比例；0 = 午夜、0.5 = 正午） */
export const DEFAULT_SUNRISE = 0.25;
export const DEFAULT_SUNSET = 0.75;
/** 曙暮光半寬（一天的比例）：日出前後各這麼久從夜色漸變到白天 */
export const TWILIGHT = 0.05;

export interface SunPhase {
  /** −1 = 夜（離日出 / 日落超過 TWILIGHT）、0 = 日出 / 日落那一刻、1 = 白天 */
  elevation: number;
  /** 上午（黎明那側）為 true，下午 / 黃昏那側為 false */
  rising: boolean;
}

export function sunPhase(dayFrac: number, sunrise = DEFAULT_SUNRISE, sunset = DEFAULT_SUNSET, twilight = TWILIGHT): SunPhase {
  let f = dayFrac - Math.floor(dayFrac);
  if (f < 0) f += 1;
  const circ = (a: number, b: number): number => { const x = Math.abs(a - b) % 1; return Math.min(x, 1 - x); };
  const toRise = circ(f, sunrise), toSet = circ(f, sunset);
  // 白天內為正、夜裡為負：離最近那個日出 / 日落的帶號距離（夜裡跨午夜也算對）
  const day = f >= sunrise && f <= sunset;
  const d = day ? Math.min(f - sunrise, sunset - f) : -Math.min(toRise, toSet);
  return { elevation: Math.max(-1, Math.min(1, d / twilight)), rising: toRise < toSet };
}

const NIGHT: SkyRGB = [0.07, 0.09, 0.19];
const DAWN: SkyRGB = [0.64, 0.44, 0.56];
const DUSK: SkyRGB = [0.64, 0.4, 0.22];
const DAY: SkyRGB = [1, 1, 1];

function lerp3(a: SkyRGB, b: SkyRGB, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** 太陽高度 → 天空光 RGB（已含亮度）：−1..0 夜色 → 黎明粉 / 黃昏橘，0..1 → 白天白 */
export function skyLightColor(elevation: number, rising: boolean): [number, number, number] {
  const e = Math.max(-1, Math.min(1, elevation));
  const mid = rising ? DAWN : DUSK;
  return e < 0 ? lerp3(NIGHT, mid, e + 1) : lerp3(mid, DAY, e);
}

/** 遊戲時間 t（秒）→ 天空光 RGB；sunrise / sunset 由呼叫端（日後的季節系統）提供 */
export function skyColor(t: number, sunrise = DEFAULT_SUNRISE, sunset = DEFAULT_SUNSET, twilight = TWILIGHT): [number, number, number] {
  const p = sunPhase(t / DAY_LENGTH, sunrise, sunset, twilight);
  return skyLightColor(p.elevation, p.rising);
}

/** 夜晚：比日出早、或比日落晚超過一個曙暮光（預設 = 一天的前 / 後 20%） */
export function isNight(dayFrac: number, sunrise = DEFAULT_SUNRISE, sunset = DEFAULT_SUNSET, twilight = TWILIGHT): boolean {
  let f = dayFrac - Math.floor(dayFrac);
  if (f < 0) f += 1;
  return f < sunrise - twilight - 1e-9 || f >= sunset + twilight - 1e-9;
}
