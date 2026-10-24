// skyIsland.ts — gen2 浮空島（M2a Task 10；spec §4.4「空島」）：家鄉的 sky_island 錨點建構器與非家鄉大陸天空層的機率空島（0.06），SKY 層。
// 畫圖是與舊生成器共用的 draw/skyIsland.ts（drawSkyIsland），畫在 BpCanvas 上再輸出藍圖：
//   · 寬 iw ∈ [30, 48]、厚 thick ∈ [9, 14]、高出 lift ∈ [10, 49]；外框 x 用 placeX（置中；SKY 層沒有坑道避讓帶，iw ≤ 48 一定放得下）。
//   · top = 外框附近（[x0 − 6, x0 + iw + 6)）最高的 profile 地表 − 30 − thick − lift（Q4：相對 Profile2 地表，不看小點位 / 其他天空藍圖，沒有循環）。
//     島身最低一列 ≤ top + thick + 4（drawSkyIsland 的厚度 ≤ 2 + thick + 1.5），所以島身在地表上方 ≥ 36。
//   · 繩梯：groundBelow(x) = c.groundAt(x)（profile + SURFACE 層的地面覆寫；只有 SKY / MINOR 的建構器可以讀它，Q4），下端 = 地面 − 3。
//     外框往下包到 4 個候選繩梯欄的「地面 − 3」最低者（drawSkyIsland 依序試 4 欄，畫出外框會丟 RangeError），往上包到樹冠（top − 9）。
//   · 地標：守望石像（T.GUARDIAN_STATUE、site 'sky_island'），放在離島中央最近、站得住（空氣、頭頂空氣、腳下實心、左右不是箱子）的格。
//   · 沒有 solid（島在空中，不需要擋洞穴）、沒有 ground（只有 SURFACE 層有地面覆寫，Q4）。
// 跨層（blueprint.ts）：SKY 一律讓位給相交的表層藍圖（表層不看 SKY）與液體；家鄉的空島錨點選在沒有表層錨點、不在地廳 / 礦坑密室上方的槽，
// 錨點底下那個表層槽也不擲機率（anchors.ts / BlueprintIndex.build），所以錨點不會被丟。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T } from '../../tiles';
import { HRng } from '../hrng';
import { BpCanvas } from '../draw/bpCanvas';
import { drawSkyIsland, SKY_HH } from '../draw/skyIsland';
import { BP_SKY, placeX, type Blueprint, type BpCtx } from '../bpcore';

// 島面離外框附近地表至少 30 + thick + lift；外框附近 = 島兩側各多 6 欄；樹冠最高到 top − 9（樹幹 ≤ 7 + 冠半徑 2）
const AIR_GAP = 30, NEAR = 6, CROWN = 9;
// 島身最低一列離 top 的上限（drawSkyIsland 的 th ≤ round(2 + thick + 1.5)，thick ≤ 14）
const BODY_MAX = 18;
// 島面不高過這一列（世界頂；地表低於 SEA_Y 附近時不會碰到）
const TOP_MIN = CROWN + 4;
const NOISE_SPAN = 0x7fffffff;

export function buildSkyIslandBp(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const p = c.profile, rng = new HRng(c.s, c.id);
  const iw = rng.int(30, 49), thick = rng.int(9, 15), lift = rng.int(10, 50), noiseSeed = Math.floor(rng.next() * NOISE_SPAN);
  const x0 = placeX(c, iw, true, () => true);
  if (x0 === null) throw new RangeError(`gen2: sky island ${c.id} does not fit [${c.slotX0}, ${c.slotX1})`);
  let minTop = p.height;
  for (let x = x0 - NEAR; x < x0 + iw + NEAR; x++) minTop = Math.min(minTop, p.surfaceAt(x));
  const top = Math.max(TOP_MIN, minTop - AIR_GAP - thick - lift);
  // 外框下緣：島身、與 4 個候選繩梯欄的下端（drawSkyIsland 的順序）
  let low = top + BODY_MAX;
  for (const rx of [x0 + iw - 5, x0 + 4, x0 + iw - 8, x0 + 7]) low = Math.max(low, c.groundAt(rx) - 3);
  const y = top - CROWN, cv = new BpCanvas({ x: x0, y, w: iw, h: low + 1 - y }, p);
  drawSkyIsland(cv, { x0, iw, top, thick, noiseSeed }, rng, (x) => c.groundAt(x));
  return cv.toBlueprint(c.id, 'sky_island', BP_SKY, { landmarks: statue(cv, x0, iw, top) });
}

// 離島中央（x0 + iw / 2、島面上一列）最近（曼哈頓距離）的站得住的格（平手取 y 小、再取 x 小的）放守望石像；沒有就不放
function statue(cv: BpCanvas, x0: number, iw: number, top: number): Blueprint['landmarks'] {
  const cx = x0 + (iw >> 1), chestAt = (x: number, y: number): boolean => cv.inBounds(x, y) && cv.fg(x, y) === T.CHEST;
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = top - SKY_HH; y <= top + 2; y++) for (let x = x0 + 1; x < x0 + iw - 1; x++) {
    if (cv.fg(x, y) !== T.AIR || cv.fg(x, y - 1) !== T.AIR || !cv.isSolid(x, y + 1) || chestAt(x - 1, y) || chestAt(x + 1, y)) continue;
    const d = Math.abs(x - cx) + Math.abs(y - (top - 1));
    if (!best || d < best.d) best = { x, y, d };
  }
  if (!best) return [];
  cv.setFg(best.x, best.y, T.GUARDIAN_STATUE);
  return [{ x: best.x, y: best.y, tile: T.GUARDIAN_STATUE, site: 'sky_island' }];
}
