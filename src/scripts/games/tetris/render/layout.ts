import type { PieceType } from '../engine/types';
import { BUFFER_ROWS } from '../engine/constants';

export interface Point { x: number; y: number; }
export type LayoutMode = 'symmetric' | 'focus';

/** 盤面格 (cellX, cellY) → 像素左上角；扣掉頂部 BUFFER_ROWS（緩衝列不顯示）。 */
export function cellToPixel(cellX: number, cellY: number, cellSize: number, origin: Point): Point {
  return {
    x: origin.x + cellX * cellSize,
    y: origin.y + (cellY - BUFFER_ROWS) * cellSize,
  };
}

const TINTS: Record<PieceType, number> = {
  I: 0x36e6ff, // 青
  O: 0xffd23f, // 金
  T: 0xc15cff, // 紫
  S: 0x4dff88, // 綠
  Z: 0xff4d6d, // 紅
  J: 0x4d7bff, // 藍
  L: 0xff9a3c, // 橙
};
export const GARBAGE_TINT = 0x6b7280; // 灰

export function pieceTint(type: PieceType): number {
  return TINTS[type];
}

/** 視窗寬 < 920 用聚焦版（手機/窄），否則對稱雙盤。 */
export function chooseLayout(viewportWidth: number): LayoutMode {
  return viewportWidth < 920 ? 'focus' : 'symmetric';
}
