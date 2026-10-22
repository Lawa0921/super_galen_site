// decorPick.ts — 裝飾 tile 在圖集裡用哪一欄（純邏輯，無 DOM）。
//   decorStyle（autotile）決定「形狀」（仙人掌節、藤蔓尖…）；這裡再展開兩種圖集欄：
//   · 蜘蛛網：掛在哪個實心角（上左 / 上右 / 下左 / 下右）× 3 個變體（座標雜湊）→ 欄 = 角 + 4 × 變體
//   · 季節植物（灌木、蕨、仙人掌、枯枝、藤蔓）：欄 = style + 季節 × styles（季節 = 該欄草的季節外觀）
//   第 0 季（春）/ 第 0 變體的欄位和 decorStyle 的舊欄位一致，舊呼叫端仍拿得到合理的圖。
import { T, SOLID_LUT } from '../engine/tiles';
import { DECOR_STYLES, decorStyle, type Neighbor } from './autotile';
import { grassLook } from './seasonLook';

export const COBWEB_CORNER = { TL: 0, TR: 1, BL: 2, BR: 3 } as const;
export const COBWEB_VARIANTS = 3;
/** 會依季節換外觀的裝飾（雪灌木長在雪原，一年到頭都積雪 → 不列入） */
export const SEASONAL_DECOR: readonly number[] = [T.BUSH, T.FERN, T.CACTUS, T.DEAD_BUSH, T.VINE];
const SEASONAL = new Set(SEASONAL_DECOR);
/** 地表以下超過這麼多格：不換季（洞穴裡的蕨、藤蔓固定用夏天） */
export const SEASON_DEPTH = 10;
const SUMMER = 1;

function hash(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y + 0x165667b1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

/** 蜘蛛網掛的角：天花板 / 地板 + 牆 → 那個角；只有牆 → 牆的上角；只有天花板 / 地板 → 依雜湊 h 挑左右 */
export function cobwebCorner(n: Neighbor, h: number): number {
  const s = (dx: number, dy: number): boolean => SOLID_LUT[n(dx, dy)] === 1;
  const up = s(0, -1), dn = s(0, 1), lf = s(-1, 0), rt = s(1, 0);
  if (up && lf) return COBWEB_CORNER.TL;
  if (up && rt) return COBWEB_CORNER.TR;
  if (dn && lf) return COBWEB_CORNER.BL;
  if (dn && rt) return COBWEB_CORNER.BR;
  if (lf) return COBWEB_CORNER.TL;
  if (rt) return COBWEB_CORNER.TR;
  if (dn && !up) return h & 1 ? COBWEB_CORNER.BR : COBWEB_CORNER.BL;
  return h & 1 ? COBWEB_CORNER.TR : COBWEB_CORNER.TL;
}

/** 季節植物的圖集欄 */
export function seasonalColumn(id: number, style: number, season: number): number {
  return style + (season & 3) * (DECOR_STYLES[id] ?? 1);
}

/** 圖集裡這種裝飾佔幾欄 */
export function decorColumns(id: number): number {
  if (id === T.COBWEB) return 4 * COBWEB_VARIANTS;
  const s = DECOR_STYLES[id] ?? 1;
  return SEASONAL.has(id) ? 4 * s : s;
}

/**
 * (x,y) 的裝飾該用圖集哪一欄。day = 曆法天數（季節）；surfaceY = 該欄地表列（深處的植物不換季）。
 */
export function decorStyleAt(id: number, x: number, y: number, n: Neighbor, day: number, surfaceY: number): number {
  if (id === T.COBWEB) {
    const h = hash(x, y);
    return cobwebCorner(n, h >>> 3) + 4 * (h % COBWEB_VARIANTS);
  }
  const style = decorStyle(id, x, y, n);
  if (!SEASONAL.has(id)) return style;
  const season = y > surfaceY + SEASON_DEPTH ? SUMMER : grassLook(x, Math.max(0, day));
  return seasonalColumn(id, style, season);
}
