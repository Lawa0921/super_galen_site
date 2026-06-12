import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';
import type { Point } from './layout';

const HUD_COLS = 4;
const METER_COLS = 2;
/** 本機側 HOLD 槽寬（格）＋與盤的間距（格）——對齊 SOLO 慣例（main.ts holdW 3.2 / sideGap 0.9）。 */
export const HOLD_W_CELLS = 3.2;
export const HOLD_GAP_CELLS = 0.9;
const HOLD_COLS = HOLD_W_CELLS + HOLD_GAP_CELLS; // 4.1
/** 左右兩盤 + 兩側 HUD + 中央計量條 + 本機側盤左 HOLD 欄的總欄數 */
const TOTAL_COLS = HOLD_COLS + 2 * BOARD_WIDTH + 2 * HUD_COLS + METER_COLS; // 34.1

export const P1_TINT = 0x36e6ff; // 青
export const P2_TINT = 0xff4d6d; // 洋紅

export type MatchSide = 'A' | 'B';

export interface SideLayout {
  origin: Point;
  /** 單欄 HUD 錨點；本機側時為 NEXT/分數欄（盤右）。 */
  hudAnchor: Point;
  /** 僅本機側有值：HOLD 槽錨點（盤左，對齊 SOLO 慣例）。對手側維持單欄堆疊、無此欄。 */
  holdAnchor?: Point;
  tint: number;
}
export interface MatchLayout {
  cellSize: number;
  a: SideLayout;
  b: SideLayout;
  meter: { x: number; y: number; w: number; h: number };
}

/**
 * 對稱雙盤版面：A 在左、B 在右、計量條置中。對標 ui/C-battle-symmetric.jpg。
 * G2：本機側（localSide）HOLD 拆到該盤左側、NEXT/分數留盤右（對齊 SOLO 慣例、防 hold/next 誤認）；
 * 對手側維持單欄堆疊。多出的 HOLD 欄已計入 TOTAL_COLS → cellSize 自然縮一檔、保不重疊。
 */
export function computeMatchLayout(stageW: number, stageH: number, localSide: MatchSide = 'A'): MatchLayout {
  const byHeight = (stageH * 0.82) / VISIBLE_HEIGHT;
  const byWidth = (stageW * 0.94) / TOTAL_COLS;
  const cs = Math.max(10, Math.floor(Math.min(byHeight, byWidth)));

  const groupW = TOTAL_COLS * cs;
  const startX = Math.round((stageW - groupW) / 2);
  const wellH = cs * VISIBLE_HEIGHT;
  const originY = Math.round((stageH - wellH) / 2);

  const meterRect = (meterX: number) => ({
    x: meterX + METER_COLS * cs * 0.5 - cs * 0.3,
    y: originY,
    w: cs * 0.6,
    h: wellH,
  });

  if (localSide === 'A') {
    // 欄序：[A HOLD][A 盤][A 資訊][計量條][B HUD][B 盤]
    const aHoldX = startX;
    const aBoardX = Math.round(startX + HOLD_COLS * cs);
    const aInfoX = Math.round(startX + (HOLD_COLS + BOARD_WIDTH + HOLD_GAP_CELLS) * cs);
    const meterX = Math.round(startX + (HOLD_COLS + BOARD_WIDTH + HUD_COLS) * cs);
    const bHudX = Math.round(startX + (HOLD_COLS + BOARD_WIDTH + HUD_COLS + METER_COLS + 0.3) * cs);
    const bBoardX = Math.round(startX + (HOLD_COLS + BOARD_WIDTH + HUD_COLS + METER_COLS + HUD_COLS) * cs);
    return {
      cellSize: cs,
      a: {
        origin: { x: aBoardX, y: originY },
        hudAnchor: { x: aInfoX, y: originY },
        holdAnchor: { x: aHoldX, y: originY },
        tint: P1_TINT,
      },
      b: { origin: { x: bBoardX, y: originY }, hudAnchor: { x: bHudX, y: originY }, tint: P2_TINT },
      meter: meterRect(meterX),
    };
  }

  // localSide === 'B'：欄序 [A 盤][A HUD][計量條][B HOLD][B 盤][B 資訊]
  const aBoardX = startX;
  const aHudX = Math.round(startX + (BOARD_WIDTH + 0.3) * cs);
  const meterX = Math.round(startX + (BOARD_WIDTH + HUD_COLS) * cs);
  const bHoldX = Math.round(startX + (BOARD_WIDTH + HUD_COLS + METER_COLS) * cs);
  const bBoardX = Math.round(startX + (BOARD_WIDTH + HUD_COLS + METER_COLS + HOLD_COLS) * cs);
  const bInfoX = Math.round(
    startX + (BOARD_WIDTH + HUD_COLS + METER_COLS + HOLD_COLS + BOARD_WIDTH + HOLD_GAP_CELLS) * cs,
  );
  return {
    cellSize: cs,
    a: { origin: { x: aBoardX, y: originY }, hudAnchor: { x: aHudX, y: originY }, tint: P1_TINT },
    b: {
      origin: { x: bBoardX, y: originY },
      hudAnchor: { x: bInfoX, y: originY },
      holdAnchor: { x: bHoldX, y: originY },
      tint: P2_TINT,
    },
    meter: meterRect(meterX),
  };
}
