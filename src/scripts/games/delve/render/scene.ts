// scene.ts — 場景的純邏輯（無 DOM）：從 tile 資料找出樹（樹基 / 樹頂 / 樹冠半徑）、樹種、天空時段調色。
import { SOLID_LUT, T } from '../engine/tiles';

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
}

/** 樹幹最高 12 格 + 樹冠：往下多掃這麼多格，讓樹基在視窗外的樹也畫得出來 */
const SCAN_BELOW = 16;

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
      while (r < 6 && get(x, top - 1 - r) === T.LEAVES) r++;
      if (top - r - 3 >= y1) continue;
      out.push({ x, baseY: y, topY: top, leafR: r, grounded: SOLID_LUT[get(x, y + 1)] === 1, variant: treeVariant(x) });
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
// 夜間顏色偏亮：光照遮罩會在夜裡把整個戶外（含天空）壓暗約 44%
const NIGHT: Omit<Key, 'd'> = { top: '#141e4c', bottom: '#34407a', layers: ['#303c6c', '#232c54', '#141a38'], stars: 1, cloud: '#46528e' };
const DAWN: Omit<Key, 'd'> = { top: '#3b4a8a', bottom: '#f2a476', layers: ['#7a6a92', '#4e4a70', '#2a2842'], stars: 0.2, cloud: '#f4c0a0' };
const DAY: Omit<Key, 'd'> = { top: '#4f93dc', bottom: '#c2e5f6', layers: ['#a2c0da', '#7aa898', '#4c7c64'], stars: 0, cloud: '#ffffff' };
const DUSK: Omit<Key, 'd'> = { top: '#4a4a8c', bottom: '#f08a5a', layers: ['#8c6286', '#5a4262', '#2c2238'], stars: 0.1, cloud: '#f6a882' };
const KEYS: Key[] = [
  { d: 0, ...NIGHT }, { d: 0.19, ...NIGHT }, { d: 0.235, ...DAWN }, { d: 0.3, ...DAY },
  { d: 0.7, ...DAY }, { d: 0.765, ...DUSK }, { d: 0.81, ...NIGHT }, { d: 1, ...NIGHT },
];

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a: string, b: string, t: number): RGB {
  const x = hex(a), y = hex(b);
  return [0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * t)) as RGB;
}

/** d = 一天進度 0..1（0 = 午夜、0.5 = 正午） */
export function skyColors(d: number): SkyColors {
  const p = d - Math.floor(d);
  let k = 0;
  while (k < KEYS.length - 2 && KEYS[k + 1].d <= p) k++;
  const a = KEYS[k], b = KEYS[k + 1];
  const t = b.d > a.d ? Math.min(1, Math.max(0, (p - a.d) / (b.d - a.d))) : 0;
  return {
    top: lerp(a.top, b.top, t),
    bottom: lerp(a.bottom, b.bottom, t),
    layers: [lerp(a.layers[0], b.layers[0], t), lerp(a.layers[1], b.layers[1], t), lerp(a.layers[2], b.layers[2], t)],
    stars: a.stars + (b.stars - a.stars) * t,
    cloud: lerp(a.cloud, b.cloud, t),
  };
}
