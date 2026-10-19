// heldLayout.ts — 手上拿的東西怎麼擺（純邏輯，無 DOM）：手持物一律畫在頭和臉的前面（圖層順序前後一致），
//   避免蓋到臉靠「握點」：手持物的不透明像素只要碰到臉上「眼睛 + 嘴」那一塊（faceGuard），就把握點往身體前側外推
//   （手臂往前伸）到剛好碰不到為止。舉高 / 往上瞄準時手會在臉的前方以外，弓 / 法杖 / 矛 / 劍 / 火把都在臉的前面外側。
//   座標一律是影格座標（面向右；面向左由繪製時鏡像）。
import type { Bmp } from './pixel';
import { AV_HEAD } from './avatarArt';
import { EYE_BACK, EYE_FRONT, EYE_Y, MOUTH_Y } from './avatarHead';

/** 一張精靈的不透明範圍：每列 [最左, 最右]（沒有 = −1） */
export interface Spans { w: number; h: number; lo: Int16Array; hi: Int16Array; }
export function spansOf(b: Bmp): Spans {
  const lo = new Int16Array(b.h).fill(-1), hi = new Int16Array(b.h).fill(-1);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (!b.on(x, y)) continue;
    if (lo[y] < 0) lo[y] = x;
    hi[y] = x;
  }
  return { w: b.w, h: b.h, lo, hi };
}
export interface Rect { x0: number; y0: number; x1: number; y1: number; }
/**
 * 臉上不能被手持物蓋到的那一塊（影格座標）：後眼的後緣 − 1 到前眼睫毛 + 1、眼睛上一列到嘴下面一列；
 * (dx, dy) = 這一格身體的位移（頭跟著動，走路 / 呼吸時頭再差 1 格：外擴一格）。
 */
export function faceGuard(dx = 0, dy = 0): Rect {
  return {
    x0: AV_HEAD.x + EYE_BACK - 2 + dx, x1: AV_HEAD.x + EYE_FRONT + 4 + dx,
    y0: AV_HEAD.y + EYE_Y - 2 + dy, y1: AV_HEAD.y + MOUTH_Y + 2 + dy,
  };
}
/** 精靈畫在 (x, y)（左上角）時要往前（右）推幾格才碰不到 r（0 = 本來就碰不到） */
export function clearShift(s: Spans, x: number, y: number, r: Rect, max = 24): number {
  let need = 0;
  for (let j = 0; j < s.h; j++) {
    const yy = y + j;
    if (yy < r.y0 || yy > r.y1 || s.lo[j] < 0) continue;
    if (x + s.hi[j] < r.x0) continue;
    need = Math.max(need, r.x1 + 1 - (x + s.lo[j]));
  }
  return Math.max(0, Math.min(max, need));
}
/** 好幾張一起移動（同一隻手上的東西）：取最大的推移量 */
export function clearShiftAll(parts: { s: Spans; x: number; y: number }[], r: Rect): number {
  return parts.reduce((m, p) => Math.max(m, clearShift(p.s, p.x, p.y, r)), 0);
}
