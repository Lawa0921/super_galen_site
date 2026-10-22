// scene.ts — 場景的純邏輯（無 DOM）：從 tile 資料找出樹（樹基 / 樹頂 / 樹冠半徑）、樹種、天空時段調色。
import { SOLID_LUT, T, isSolidTile, isPlatformTile } from '../engine/tiles';

export interface TreeInfo {
  x: number;
  /** 最下面那格樹幹 y */
  baseY: number;
  /** 最上面那格樹幹 y */
  topY: number;
  /** 樹頂正上方連續樹葉格數（0 = 光禿樹樁） */
  leafR: number;
  /** 樹基下方是實心地面（畫樹根） */
  grounded: boolean;
  variant: number;
  /** 樹基下方的 tile（挑樹種用） */
  ground: number;
}

/** 樹種：0–2 森林三種（scene.treeVariant）、3 雪原松樹、4 叢林大樹 */
export const TREE_KIND = { PINE: 3, JUNGLE: 4 } as const;
export function treeKind(ground: number, variant: number): number {
  if (ground === T.SNOW || ground === T.ICE) return TREE_KIND.PINE;
  if (ground === T.JUNGLE_GRASS || ground === T.MUD) return TREE_KIND.JUNGLE;
  return variant;
}

/** 樹幹最高 12 格 + 樹冠：往下多掃這麼多格，讓樹基在視窗外的樹也畫得出來 */
const SCAN_BELOW = 26;

export function treeVariant(x: number): number {
  let h = Math.imul(x ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  return ((h ^ (h >>> 13)) >>> 0) % 3;
}

/** 掃描 [x0,x1) × [y0,y1) 內（以及下方 SCAN_BELOW 格）的樹。 */
export function scanTrees(get: (x: number, y: number) => number, x0: number, y0: number, x1: number, y1: number): TreeInfo[] {
  const out: TreeInfo[] = [];
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1 + SCAN_BELOW; y++) {
      if (get(x, y) !== T.WOOD || get(x, y + 1) === T.WOOD) continue;
      let top = y;
      while (get(x, top - 1) === T.WOOD) top--;
      let r = 0;
      while (r < 7 && get(x, top - 1 - r) === T.LEAVES) r++;
      if (top - r - 3 >= y1) continue;
      out.push({ x, baseY: y, topY: top, leafR: r, grounded: SOLID_LUT[get(x, y + 1)] === 1, variant: treeVariant(x), ground: get(x, y + 1) });
    }
  }
  return out;
}

// ── 天空 ─────────────────────────────────────────────────
type RGB = [number, number, number];
export interface SkyColors {
  top: RGB;
  bottom: RGB;
  /** 遠山、中丘、近林剪影的基色 */
  layers: [RGB, RGB, RGB];
  /** 星星不透明度 0..1 */
  stars: number;
  /** 雲的顏色 */
  cloud: RGB;
}

interface Key { d: number; top: string; bottom: string; layers: [string, string, string]; stars: number; cloud: string; }
// 全部取自統一色票（pixel.ts）；時段之間的插值結果在繪製時再吸附回色票 → 天色是一階一階地變。
// 夜間顏色偏亮：光照遮罩會在夜裡把整個戶外（含天空）壓暗
const NIGHT: Omit<Key, 'd'> = { top: '#18204a', bottom: '#2c4486', layers: ['#463c78', '#2c2450', '#18204a'], stars: 1, cloud: '#463c78' };
const DAWN: Omit<Key, 'd'> = { top: '#2c4486', bottom: '#f2b888', layers: ['#7a5a8c', '#463c78', '#2c2450'], stars: 0.2, cloud: '#f2b888' };
const DAY: Omit<Key, 'd'> = { top: '#3e74c4', bottom: '#cceaf8', layers: ['#7f9cc4', '#6a9c88', '#3f7468'], stars: 0, cloud: '#ffffff' };
const DUSK: Omit<Key, 'd'> = { top: '#463c78', bottom: '#d98f66', layers: ['#b8788e', '#7a5a8c', '#2c2450'], stars: 0.1, cloud: '#ffa93a' };
/** 關鍵時刻相對日出 / 日落的位置（以曙暮光寬 tw 為單位；預設 tw = 0.05 → 0.19 / 0.235 / 0.3 / 0.7 / 0.765 / 0.81） */
function keys(sunrise: number, sunset: number, tw: number): Key[] {
  return [
    { d: 0, ...NIGHT }, { d: sunrise - tw * 1.2, ...NIGHT }, { d: sunrise - tw * 0.3, ...DAWN }, { d: sunrise + tw, ...DAY },
    { d: sunset - tw, ...DAY }, { d: sunset + tw * 0.3, ...DUSK }, { d: sunset + tw * 1.2, ...NIGHT }, { d: 1, ...NIGHT },
  ];
}
const KEY_CACHE = new Map<string, Key[]>();

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a: string, b: string, t: number): RGB {
  const x = hex(a), y = hex(b);
  return [0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * t)) as RGB;
}

/** 天氣對天色的影響：kind / intensity（weather.ts）+ 閃電閃光 0..1 */
export interface SkyWeather { kind: string; intensity: number; flash: number; }
/** 滿強度時的「灰化」比例與壓暗倍率 */
const OVERCAST: Record<string, [number, number]> = {
  clear: [0, 1], cloudy: [0.5, 0.92], rain: [0.72, 0.8], storm: [0.88, 0.62], snow: [0.6, 0.94], fog: [0.66, 0.96],
};
/** 往同亮度、略帶藍的灰靠（cloud 灰的色相取自色票冷灰），再壓暗 */
function overcast(c: RGB, o: number, dark: number): RGB {
  if (o <= 0 && dark >= 1) return c;
  const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const g: RGB = [l * 0.94, l * 0.97, l * 1.08];
  return [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round((c[i] + (g[i] - c[i]) * o) * dark)))) as RGB;
}
function brighten(c: RGB, f: number): RGB {
  return [0, 1, 2].map((i) => Math.round(c[i] + (([236, 242, 255] as RGB)[i] - c[i]) * f)) as RGB;
}

/**
 * d = 一天進度 0..1（0 = 午夜、0.5 = 正午）；日出 / 日落 / 曙暮光由曆法每天餵入（預設 = 舊的固定時段）。
 * wx：天氣讓天色變灰變暗、雲遮住星星；閃電把整片天空往白推（之後吸附回色票 → 一階一階）。
 */
export function skyColors(d: number, sunrise = 0.25, sunset = 0.75, tw = 0.05, wx?: SkyWeather): SkyColors {
  const p = d - Math.floor(d);
  const kk = `${sunrise}|${sunset}|${tw}`;
  let K = KEY_CACHE.get(kk);
  if (!K) { K = keys(sunrise, sunset, tw); if (KEY_CACHE.size > 64) KEY_CACHE.clear(); KEY_CACHE.set(kk, K); }
  let k = 0;
  while (k < K.length - 2 && K[k + 1].d <= p) k++;
  const a = K[k], b = K[k + 1];
  const t = b.d > a.d ? Math.min(1, Math.max(0, (p - a.d) / (b.d - a.d))) : 0;
  let out: SkyColors = {
    top: lerp(a.top, b.top, t),
    bottom: lerp(a.bottom, b.bottom, t),
    layers: [lerp(a.layers[0], b.layers[0], t), lerp(a.layers[1], b.layers[1], t), lerp(a.layers[2], b.layers[2], t)],
    stars: a.stars + (b.stars - a.stars) * t,
    cloud: lerp(a.cloud, b.cloud, t),
  };
  if (wx && (wx.intensity > 0 || wx.flash > 0)) {
    const [o0, d0] = OVERCAST[wx.kind] ?? OVERCAST.clear;
    const o = o0 * wx.intensity, dk = 1 - (1 - d0) * wx.intensity;
    const f = (c: RGB): RGB => { const v = overcast(c, o, dk); return wx.flash > 0 ? brighten(v, wx.flash * 0.8) : v; };
    out = {
      top: f(out.top), bottom: f(out.bottom), layers: [f(out.layers[0]), f(out.layers[1]), f(out.layers[2])],
      stars: wx.flash > 0 ? 0 : out.stars * (1 - Math.min(1, o * 1.6)),
      cloud: f(out.cloud),
    };
  }
  return out;
}

/** 白天程度 0..1：日出前後一個曙暮光之間線性（背景的生態區色調用） */
export function dayness(d: number, sunrise = 0.25, sunset = 0.75, tw = 0.05): number {
  const p = d - Math.floor(d);
  if (p <= sunrise - tw || p >= sunset + tw) return 0;
  if (p >= sunrise + tw && p <= sunset - tw) return 1;
  return p < 0.5 ? (p - (sunrise - tw)) / (2 * tw) : (sunset + tw - p) / (2 * tw);
}

export type TorchMount = 'floor' | 'left' | 'right' | 'back';
/** 火把精靈依支撐：下方實心（或平台）→ 地板直立；否則貼左 / 右牆 → 往牆外斜的壁掛；都沒有 → 插在背牆上（直立） */
export function torchMount(below: number, left: number, right: number): TorchMount {
  if (isSolidTile(below) || isPlatformTile(below)) return 'floor';
  if (isSolidTile(left)) return 'left';
  if (isSolidTile(right)) return 'right';
  return 'back';
}
