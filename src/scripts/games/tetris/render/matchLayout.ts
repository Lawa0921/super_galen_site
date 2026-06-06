import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';
import type { Point } from './layout';

const HUD_COLS = 4;
const METER_COLS = 2;
/** 左右兩盤 + 兩側 HUD + 中央計量條的總欄數 */
const TOTAL_COLS = 2 * BOARD_WIDTH + 2 * HUD_COLS + METER_COLS; // 30

export const P1_TINT = 0x36e6ff; // 青
export const P2_TINT = 0xff4d6d; // 洋紅

export interface SideLayout {
  origin: Point;
  hudAnchor: Point;
  tint: number;
}
export interface MatchLayout {
  cellSize: number;
  a: SideLayout;
  b: SideLayout;
  meter: { x: number; y: number; w: number; h: number };
}

/** 對稱雙盤版面：A 在左、B 在右、計量條置中。對標 ui/C-battle-symmetric.jpg。 */
export function computeMatchLayout(stageW: number, stageH: number): MatchLayout {
  const byHeight = (stageH * 0.82) / VISIBLE_HEIGHT;
  const byWidth = (stageW * 0.94) / TOTAL_COLS;
  const cs = Math.max(10, Math.floor(Math.min(byHeight, byWidth)));

  const groupW = TOTAL_COLS * cs;
  const startX = Math.round((stageW - groupW) / 2);
  const wellH = cs * VISIBLE_HEIGHT;
  const originY = Math.round((stageH - wellH) / 2);

  const aBoardX = startX;
  const aHudX = Math.round(startX + (BOARD_WIDTH + 0.3) * cs);
  const meterX = Math.round(startX + (BOARD_WIDTH + HUD_COLS) * cs);
  const bHudX = Math.round(startX + (BOARD_WIDTH + HUD_COLS + METER_COLS + 0.3) * cs);
  const bBoardX = Math.round(startX + (BOARD_WIDTH + HUD_COLS + METER_COLS + HUD_COLS) * cs);

  return {
    cellSize: cs,
    a: { origin: { x: aBoardX, y: originY }, hudAnchor: { x: aHudX, y: originY }, tint: P1_TINT },
    b: { origin: { x: bBoardX, y: originY }, hudAnchor: { x: bHudX, y: originY }, tint: P2_TINT },
    meter: { x: meterX + METER_COLS * cs * 0.5 - cs * 0.3, y: originY, w: cs * 0.6, h: wellH },
  };
}
