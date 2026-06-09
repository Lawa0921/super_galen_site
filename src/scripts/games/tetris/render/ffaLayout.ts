import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';
import { computeMatchLayout } from './matchLayout';
import type { Point } from './layout';

/** 盤面長寬比（10:20 = 0.5）。 */
const BOARD_ASPECT = BOARD_WIDTH / VISIBLE_HEIGHT;

/** 每位玩家一塊版面。isLocal 決定大盤/環繞小盤與 HUD 詳略。 */
export interface FfaSlotLayout {
  id: string;
  cellSize: number;
  origin: Point; // 該盤左上（可見遊玩區，扣掉緩衝列後的第一列）
  isLocal: boolean;
}

export interface FfaLayout {
  slots: FfaSlotLayout[]; // 依 playerIds 順序
  /** 即時名次面板建議錨點（左上）與縮放（相對本機 cellSize）。 */
  standings: { anchor: Point; scale: number };
}

/**
 * 8 種玩家識別色（neon 風，與既有 pieceTint 調性一致）。
 * 取自方塊色盤（青/金/紫/綠/紅/藍/橙）+ 一個粉作第 8 色，皆高彩度霓虹。
 */
export const PLAYER_TINTS: number[] = [
  0x36e6ff, // 青
  0xffd23f, // 金
  0xc15cff, // 紫
  0x4dff88, // 綠
  0xff4d6d, // 紅
  0x4d7bff, // 藍
  0xff9a3c, // 橙
  0xff5fd2, // 粉
];

/** 在一個 (w,h) 的盒子內，依盤面長寬比塞入最大可見盤，回傳 cellSize（>0）。 */
function fitCellSize(boxW: number, boxH: number): number {
  const byWidth = boxW / BOARD_WIDTH;
  const byHeight = boxH / VISIBLE_HEIGHT;
  return Math.max(1, Math.floor(Math.min(byWidth, byHeight)));
}

/** 在盒子 (bx,by,bw,bh) 內置中放一塊 cellSize 的盤，回傳可見區左上 origin。 */
function centerInBox(bx: number, by: number, bw: number, bh: number, cellSize: number): Point {
  const wellW = cellSize * BOARD_WIDTH;
  const wellH = cellSize * VISIBLE_HEIGHT;
  return {
    x: Math.round(bx + (bw - wellW) / 2),
    y: Math.round(by + (bh - wellH) / 2),
  };
}

/**
 * N 人多盤版面：
 *  - N<=2：委派既有 computeMatchLayout（本機盤與單一對手盤，左右對稱、cellSize 與 1v1 一致量級）。
 *  - N=3..8：本機盤大（置於左側區），對手小盤在右側區以網格排列，全部不重疊、cellSize>0。
 * localId 指定哪個是本機（isLocal=true，較大、HUD 較詳）。localId 不在 playerIds 時預設第 0 個。
 */
export function computeFfaLayout(
  playerIds: string[],
  localId: string,
  stageW: number,
  stageH: number,
): FfaLayout {
  if (playerIds.length === 0) {
    throw new Error('computeFfaLayout: playerIds 不可為空');
  }

  // localId 不在名單 → 預設第 0 個為本機（合理降級，不丟錯）
  const local = playerIds.includes(localId) ? localId : playerIds[0];

  // ── N<=2：退化到既有 1v1 雙盤版面（鐵則 #3）──
  // 本機固定取 A 側（左）、對手取 B 側（右）；cellSize 與 1v1 對稱雙盤一致。
  if (playerIds.length <= 2) {
    const m = computeMatchLayout(stageW, stageH);
    const slots: FfaSlotLayout[] = playerIds.map((id) => {
      const isLocal = id === local;
      const src = isLocal ? m.a : m.b;
      return { id, cellSize: m.cellSize, origin: { x: src.origin.x, y: src.origin.y }, isLocal };
    });
    const standingsAnchor: Point = { x: Math.round(stageW * 0.5 - m.cellSize * 1.2), y: Math.round(stageH * 0.04) };
    return { slots, standings: { anchor: standingsAnchor, scale: 1 } };
  }

  // ── N=3..8：本機大盤（左） + 對手小盤網格（右）──
  const n = playerIds.length;
  const opponents = playerIds.filter((id) => id !== local);
  const oppCount = opponents.length; // n-1

  // 左側保留給本機大盤，右側給對手網格。左區寬度比例隨人數收斂。
  const margin = Math.min(stageW, stageH) * 0.03;
  const innerW = stageW - margin * 2;
  const innerH = stageH - margin * 2;
  const gap = Math.max(8, Math.min(stageW, stageH) * 0.015);

  // 本機左區佔比：人少→更大，人多→收斂但仍明顯較大。
  const localFrac = oppCount <= 3 ? 0.5 : 0.46;
  const localBoxW = innerW * localFrac - gap / 2;
  const localBoxH = innerH;
  const localCell = fitCellSize(localBoxW, localBoxH);
  const localOrigin = centerInBox(margin, margin, localBoxW, localBoxH, localCell);

  // 右區網格容納 oppCount 個對手盤。
  const gridX = margin + localBoxW + gap;
  const gridW = innerW - localBoxW - gap;
  const gridH = innerH;

  // 選列數：使每格接近盤面長寬比、且行列乘積 >= oppCount。
  // 候選 cols 取 1..oppCount，挑「cellSize 最大」者。
  let bestCols = 1;
  let bestCell = 0;
  for (let cols = 1; cols <= oppCount; cols++) {
    const rows = Math.ceil(oppCount / cols);
    const cellBoxW = (gridW - gap * (cols - 1)) / cols;
    const cellBoxH = (gridH - gap * (rows - 1)) / rows;
    if (cellBoxW <= 0 || cellBoxH <= 0) continue;
    const cs = fitCellSize(cellBoxW, cellBoxH);
    if (cs > bestCell) {
      bestCell = cs;
      bestCols = cols;
    }
  }
  // 退化保護：grid 太窄時 fitCellSize 至少回 1，bestCell 必 >=1
  if (bestCell <= 0) {
    bestCols = oppCount;
    bestCell = 1;
  }

  const cols = bestCols;
  const rows = Math.ceil(oppCount / cols);
  const cellBoxW = (gridW - gap * (cols - 1)) / cols;
  const cellBoxH = (gridH - gap * (rows - 1)) / rows;
  // 對手盤格大小：取網格格內可塞下者，且不得大於本機盤（本機較大或等大）。
  const oppCell = Math.min(fitCellSize(cellBoxW, cellBoxH), localCell);

  const slots: FfaSlotLayout[] = [];
  let oppIndex = 0;
  for (const id of playerIds) {
    if (id === local) {
      slots.push({ id, cellSize: localCell, origin: { ...localOrigin }, isLocal: true });
      continue;
    }
    const r = Math.floor(oppIndex / cols);
    const c = oppIndex % cols;
    const boxX = gridX + c * (cellBoxW + gap);
    const boxY = margin + r * (cellBoxH + gap);
    const origin = centerInBox(boxX, boxY, cellBoxW, cellBoxH, oppCell);
    slots.push({ id, cellSize: oppCell, origin, isLocal: false });
    oppIndex++;
  }

  const standingsAnchor: Point = { x: Math.round(margin), y: Math.round(margin * 0.4) };
  return { slots, standings: { anchor: standingsAnchor, scale: Math.max(0.6, oppCell / 24) } };
}
