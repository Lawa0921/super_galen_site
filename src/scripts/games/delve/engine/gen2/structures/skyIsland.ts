// skyIsland.ts — gen2 浮空島（M2a Task 10；spec §4.4「空島」）：家鄉的 sky_island 錨點建構器與非家鄉大陸天空層的機率空島（0.06），SKY 層。
// 畫圖是與舊生成器共用的 draw/skyIsland.ts（drawSkyIsland），畫在 BpCanvas 上再輸出藍圖：
//   · 寬 iw ∈ [30, 48]、厚 thick ∈ [9, 14]、高出 lift ∈ [10, 49]；外框 x 用 placeX（置中；SKY 層沒有坑道避讓帶，iw ≤ 48 一定放得下）。
//   · top = 外框附近（[x0 − 6, x0 + iw + 6)）最高的 profile 地表 − 30 − thick − lift（Q4：相對 Profile2 地表，不看小點位 / 其他天空藍圖，沒有循環）。
//     島身最低一列 ≤ top + thick + 4（drawSkyIsland 的厚度 ≤ 2 + thick + 1.5），所以島身在地表上方 ≥ 36。
//   · 繩梯：groundBelow(x) = c.groundAt(x)（profile + SURFACE 層的地面覆寫；只有 SKY / MINOR 的建構器可以讀它，Q4），下端 = 地面 − 3；
//     地表入口欄（genPrims.entranceHit，純噪聲、局部可算）與海欄回負數（drawSkyIsland 換下一個候選欄；Task 10 修正 1：繩梯不掛在入口坑 / 水面上）。
//     外框往下包到 4 個候選繩梯欄的地面那一列（含；drawSkyIsland 依序試 4 欄，畫出外框會丟 RangeError；包到地面那一列，
//     繩梯底下若是湖 / 其他表層藍圖，外框就與它相交 → 空島讓位，crossYields），往上包到樹冠（top − 9）。
//   · 地標：守望石像（T.GUARDIAN_STATUE、site 'sky_island'），放在離島中央最近、站得住（空氣、頭頂空氣、腳下實心、左右不是箱子）的格。
//   · 沒有 solid（島在空中，不需要擋洞穴）、沒有 ground（只有 SURFACE 層有地面覆寫，Q4）。
// 跨層（blueprint.ts）：SKY 一律讓位給相交的表層藍圖（表層不看 SKY）與液體；家鄉的空島錨點選在沒有表層錨點、不在地廳 / 礦坑密室上方的槽，
// 錨點底下那個表層槽也不擲機率（anchors.ts / BlueprintIndex.build），所以錨點不會被丟。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T } from '../../tiles';
import { HRng } from '../hrng';
import { BpCanvas } from '../draw/bpCanvas';
import { drawSkyIsland, SKY_HH } from '../draw/skyIsland';
import { seedInt } from '../../noise';
import { entranceHit } from '../../genPrims';
import { COL_LAND, COL_SEA } from '../profile';
import { BP_SKY, SLOT_PAD, placeX, type Blueprint, type BpCtx } from '../bpcore';

// 島面離外框附近地表至少 30 + thick + lift；外框附近 = 島兩側各多 6 欄；樹冠最高到 top − 9（樹幹 ≤ 7 + 冠半徑 2）
const AIR_GAP = 30, NEAR = 6, CROWN = 9;
// 島身最低一列離 top 的上限（drawSkyIsland 的 th ≤ round(2 + thick + 1.5)，thick ≤ 14）
const BODY_MAX = 18;
// 島面不高過這一列（世界頂；地表低於 SEA_Y 附近時不會碰到）
const TOP_MIN = CROWN + 4;
const NOISE_SPAN = 0x7fffffff;

// 錨點（家鄉）：一律放、一定有繩梯（Task 21）：4 個候選繩梯欄在可用範圍內任何位置都接不到地面時，改在島下任一接得到地面的欄（ropeFallback）掛繩梯；
// 整個可用範圍都沒有這種欄 → RangeError（anchors.homeAnchors 只挑可用範圍裡有這種欄的天空槽——它的 ropeable 與這裡同一個判定，所以不會發生）
// ground：測試接縫（繩梯欄接得到的地面；預設 = 不是海欄、不是地表入口欄時的 c.groundAt，否則 −1）——正式碼不傳
export interface SkyOptions { ground?: (x: number) => number }
export function buildSkyIslandBp(c: BpCtx, o: SkyOptions = {}): Blueprint {
  return skyIsland(c, true, o)!;
}
// 機率表（非家鄉大陸 0.06）：外框 3 個候選位置都沒有接得到地面的繩梯欄 → 不放（回 null）
export function rollSkyIslandBp(c: BpCtx): Blueprint | null {
  return skyIsland(c, false, {});
}

// 繩梯的 4 個候選欄（drawSkyIsland 的順序）
const ropeCols = (x0: number, iw: number): number[] => [x0 + iw - 5, x0 + 4, x0 + iw - 8, x0 + 7];
// 錨點的後備繩梯（Task 21）：可用範圍 [lo, hi) 裡、寬 iw 的島（外框 x 依離 mid 由近到遠、平手取 x 小的）下方 [x0 + 4, x0 + iw − 4) 第一個 ok 的欄
// → { x0, rx }；都沒有 = null。可用範圍 [lo + 4 + SLOT_PAD, hi − 4 − SLOT_PAD) 有 ok 的欄就一定找得到（x0 = rx − 4 或 rx − iw + 5 放得下）
export function ropeFallback(lo: number, hi: number, iw: number, mid: number, ok: (x: number) => boolean): { x0: number; rx: number } | null {
  const xs: number[] = [];
  for (let x = lo + SLOT_PAD; x + iw <= hi - SLOT_PAD; x++) xs.push(x);
  xs.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  for (const x0 of xs) for (let rx = x0 + 4; rx < x0 + iw - 4; rx++) if (ok(rx)) return { x0, rx };
  return null;
}

function skyIsland(c: BpCtx, force: boolean, o: SkyOptions): Blueprint | null {
  // ctx.ver 0 的規則
  const p = c.profile, rng = new HRng(c.s, c.id);
  const iw = rng.int(30, 49), thick = rng.int(9, 15), lift = rng.int(10, 50), noiseSeed = Math.floor(rng.next() * NOISE_SPAN);
  // 繩梯可以接的地面：不是海欄、不是地表入口欄（入口噪聲同 fill.ts）；否則 −1（drawSkyIsland 換下一欄）
  const sEnt = seedInt(c.seed, 'g2-entrance');
  const ground = o.ground ?? ((x: number): number => { const k = p.info(x).kind; return k === COL_SEA || (k === COL_LAND && entranceHit(x, sEnt)) ? -1 : c.groundAt(x); });
  // 外框 x：placeX 的候選裡第一個有接得到地面的繩梯欄的
  const ropeOk = (x: number): boolean => ropeCols(x, iw).some((rx) => ground(rx) >= 0);
  let x0 = placeX(c, iw, force, ropeOk);
  if (x0 === null) return null;
  // 錨點（force）：placeX 的 3 個候選都接不到地面（Task 14：家鄉 anc-10 出現過沒有繩梯的空島）→ 可用範圍內離中央近的放得下的 x 依序找第一個接得到的；
  // 都沒有（Task 21）：ropeFallback 在島下任一欄掛繩梯；整個可用範圍都沒有接得到地面的欄 → RangeError（錨點一定有繩梯）
  let extra: number | null = null;
  if (force && !ropeOk(x0)) {
    const mid = (c.slotX0 + c.slotX1 - iw) >> 1, xs: number[] = [];
    for (let x = c.slotX0 + SLOT_PAD; x + iw <= c.slotX1 - SLOT_PAD; x++) xs.push(x);
    const hit = xs.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b).find(ropeOk);
    if (hit !== undefined) x0 = hit;
    else {
      const f = ropeFallback(c.slotX0, c.slotX1, iw, mid, (x) => ground(x) >= 0);
      if (!f) throw new RangeError(`gen2: sky_island ${c.id} has no rope column in [${c.slotX0}, ${c.slotX1})`);
      x0 = f.x0; extra = f.rx;
    }
  }
  let minTop = p.height;
  for (let x = x0 - NEAR; x < x0 + iw + NEAR; x++) minTop = Math.min(minTop, p.surfaceAt(x));
  const top = Math.max(TOP_MIN, minTop - AIR_GAP - thick - lift);
  // 外框下緣：島身、與 4 個候選繩梯欄（與後備繩梯欄）的地面那一列
  let low = top + BODY_MAX;
  for (const rx of ropeCols(x0, iw)) low = Math.max(low, c.groundAt(rx));
  if (extra !== null) low = Math.max(low, ground(extra));
  const y = top - CROWN, cv = new BpCanvas({ x: x0, y, w: iw, h: low + 1 - y }, p);
  const drawn = drawSkyIsland(cv, { x0, iw, top, thick, noiseSeed }, rng, ground);
  // 錨點的繩梯沒畫成（後備欄、或 4 欄都離地 < 8 格）：在第一個接得到地面的欄（後備欄優先、再照 4 欄的順序）從島底垂到地面上 3 格（至少 1 格）
  if (force && !drawn.rope) {
    const rx = [...(extra === null ? [] : [extra]), ...ropeCols(x0, iw)].find((x) => ground(x) >= 0);
    if (rx === undefined) throw new RangeError(`gen2: sky_island ${c.id} has no rope column`);
    // 島底（修正回合 1）：先跳過島面以上的空氣（那一欄的島身可能從 top 以下才開始），再走過島身；繩梯從島底下一格起，不會蓋到島身
    let by = top - 1;
    while (by + 1 < top + BODY_MAX && cv.inBounds(rx, by + 1) && !cv.isSolid(rx, by + 1)) by++;
    while (cv.inBounds(rx, by + 1) && cv.isSolid(rx, by + 1)) by++;
    const end = Math.max(by + 1, ground(rx) - 3);
    for (let yy = by + 1; yy <= end; yy++) cv.setFg(rx, yy, T.ROPE);
  }
  const landmarks = statue(cv, x0, iw, top);
  // floors（Task 14，給石碑）：島面上站得住的格（同石像的條件；空中的天然格就是空氣，畫布的回退讀取在這裡是準的）
  const floors: { x: number; y: number }[] = [];
  for (let y = top - SKY_HH; y <= top + 2; y++) for (let x = x0 + 1; x < x0 + iw - 1; x++) {
    if (cv.fg(x, y) === T.AIR && cv.fg(x, y - 1) === T.AIR && cv.isSolid(x, y + 1)) floors.push({ x, y });
  }
  return cv.toBlueprint(c.id, 'sky_island', BP_SKY, { landmarks, floors });
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
