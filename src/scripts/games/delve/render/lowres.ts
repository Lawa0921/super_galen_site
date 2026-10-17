// lowres.ts — 像素完美管線的純邏輯（無 DOM）：
//   世界先以原生美術解析度畫進低解析緩衝，再以「整數倍」放大貼到螢幕（每個美術像素 = N×N 裝置像素）。
//   鏡頭內部保持平滑，繪製時對齊整數美術像素；光照分成 LIGHT_LEVELS 階，階與階之間用 4×4 Bayer 抖動。
import { bayer } from './pixel';

/** 目標：畫面短邊約多少美術 px */
export const TARGET_ART_PX = 520;

/** 選出讓短邊最接近 target 美術 px 的整數倍率（≥1）。devW/devH 為裝置像素。 */
export function pickScale(devW: number, devH: number, target: number = TARGET_ART_PX): number {
  const side = Math.max(1, Math.min(devW, devH));
  let best = 1, bestErr = Infinity;
  for (let k = 1; k <= 16; k++) {
    const err = Math.abs(side / k - target);
    if (err < bestErr) { bestErr = err; best = k; }
  }
  return best;
}

// ── 縮放：使用者在預設倍率上加減（仍然只用整數倍率，維持像素完美） ──────────
/** 最小可視短邊（美術 px）：放大上限 = 短邊 / 這個值 */
export const MIN_VIEW_ART_PX = 160;
export const MAX_ZOOM_OFFSET = 6;

/**
 * 預設倍率：短邊約 TARGET_ART_PX 美術 px，但至少 ceil(dpr)——每個美術 px ≥ 1 CSS px，
 * 一格（16 美術 px）≥ 16 CSS px。高 DPR 手機（390 寬、DPR 3）若只看短邊會選 2 倍 → 每格 10.7 CSS px，太小點不到。
 */
function scaleRange(devW: number, devH: number, dpr = 1): { base: number; max: number } {
  const side = Math.max(1, Math.min(devW, devH));
  const base = Math.max(pickScale(devW, devH), Math.ceil(Math.max(1, dpr) - 0.01));
  return { base, max: Math.max(base, Math.floor(side / MIN_VIEW_ART_PX)) };
}
/** offset > 0 放大（倍率變大、看到的格子變少），< 0 縮小。結果夾在 1..max。dpr = 裝置像素比（預設 1）。 */
export function zoomScale(devW: number, devH: number, offset: number, dpr = 1): number {
  const { base, max } = scaleRange(devW, devH, dpr);
  return Math.max(1, Math.min(max, base + Math.round(offset)));
}
/** 把 offset 收斂到這個畫面有效的範圍 */
export function clampZoom(offset: number, devW: number, devH: number, dpr = 1): number {
  return zoomScale(devW, devH, offset, dpr) - scaleRange(devW, devH, dpr).base;
}
/** localStorage 字串 → offset（壞值 0） */
export function parseZoomPref(v: string | null | undefined): number {
  if (v === null || v === undefined || !/^-?\d+$/.test(v.trim())) return 0;
  const n = Number(v);
  return Math.max(-MAX_ZOOM_OFFSET, Math.min(MAX_ZOOM_OFFSET, n));
}

/** 低解析緩衝尺寸：無條件進位，放大後蓋滿整個畫布（右 / 下多出的部分裁掉）。 */
export function bufferSize(devW: number, devH: number, k: number): { w: number; h: number } {
  return { w: Math.max(1, Math.ceil(devW / k)), h: Math.max(1, Math.ceil(devH / k)) };
}

/** 對齊整數美術像素（避免 -0） */
export function snapPx(v: number): number { return Math.round(v) + 0; }

export function snapCam(c: { x: number; y: number }): { x: number; y: number } {
  return { x: snapPx(c.x), y: snapPx(c.y) };
}

/** 光照階數（含全亮與全暗） */
export const LIGHT_LEVELS = 8;
/** 離階多近就視為平台、不抖動（0..0.5） */
export const PLATEAU = 0.3;

/**
 * 暗度 a（0 = 全亮、1 = 全暗）→ 階索引 0..levels-1。靠近某階時是平台；
 * 兩階之間的過渡帶用 4×4 Bayer（以世界座標 x,y 取樣，畫面移動時圖樣不閃爍）。
 */
export function lightLevel(a: number, x: number, y: number, levels: number = LIGHT_LEVELS): number {
  const v = Math.max(0, Math.min(1, a)) * (levels - 1);
  const fl = Math.floor(v), f = v - fl;
  if (fl >= levels - 1) return levels - 1;
  if (f < PLATEAU) return fl;
  if (f > 1 - PLATEAU) return fl + 1;
  const t = (f - PLATEAU) / (1 - 2 * PLATEAU);
  return bayer(x, y) < t ? fl + 1 : fl;
}

/** 整體（例如晝夜）亮度直接吸附到最近的階，避免大面積抖動 */
export function quantizeLevel(a: number, levels: number = LIGHT_LEVELS): number {
  return Math.round(Math.max(0, Math.min(1, a)) * (levels - 1)) / (levels - 1);
}

/**
 * 傷害數字 / 飄字的放大倍數（整數）：窄畫面（手機，CSS 寬 < 900）上數字（5 美術 px 高）至少要約 12 CSS px 高；
 * 桌機寬畫面維持 1（原本的像素大小）。zoom = 每個美術 px 佔幾 CSS px。
 */
export function floatTextScale(viewCssW: number, zoom: number): number {
  if (viewCssW >= 900 || zoom <= 0) return 1;
  return Math.max(1, Math.min(3, Math.ceil(12 / (5 * zoom))));
}
