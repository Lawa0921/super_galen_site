// shipwreck.ts — gen2 海槽的沉船（spec §8「沉船（水下半埋，有寶箱）」）：寬 18–26、船殼高 6–8，
// 船底（龍骨列）= 船寬內海床平均 + 2（半埋在海床裡）；木板船殼（底兩列內縮成船形）、側板與甲板殘缺、
// 木樑桅杆殘段（從船內地板往上、高出船舷 1–4 格）、船殼與船內水中的格掛深色木板牆、一個箱子（M1 用 'ruin' 戰利品）。
// 置中於槽 ± min(20, floor(槽寬 / 10))（layout.seaJitter，Task 19）。
// 靜態液體（spec §4.3）：實心格（木板）清掉水；非實心格（桅杆、箱子）與船內格的液體保留（KEEP）——
// 海水本來就滿格，所以船內、箱子與桅杆都泡在滿格水裡、不會流動；船內海床以下的沙不動（半埋）。
// 全部格在水面下（y > waterTop）。
// drawHull（M2a Task 20）：船殼 / 甲板 / 桅杆的形狀函式；hullPlan（修正回合 1）：龍骨 / 地板 / 桅杆 / 箱子的佈局。沉船與沉船島（structures/island.ts）共用兩者，
// 抽出前後 M1 沉船與沉船島逐格相同（islands.test 釘 SHIPWRECK_HASH / WRECK_ISLE_HASH）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W, isSolidTile } from '../../tiles';
import { HRng } from '../hrng';
import { BpGrid, emptyObjects, BP_SURFACE, KEEP, SLOT_PAD, type Blueprint, type BpCtx } from '../bpcore';
import { seaJitter } from '../layout';
import type { Profile2 } from '../profile';

// drawHull 畫格的介面：put = 畫前景（液體怎麼處理由呼叫端決定）、wall = 掛深色木板牆；兩者都由呼叫端裁掉不能畫的列
export interface HullCanvas { put(x: number, y: number, t: number): void; wall(x: number, y: number): void }
// hh = 船殼高、mast = 桅杆的欄、stub = 桅杆高出船舷幾格、floorAt(x) = 船內該欄的地板（第一個實心格）
export interface HullShape { hh: number; mast: number; stub: number; floorAt(x: number): number }

// 船的佈局（外框 [bx, bx + w)、船殼高 hh）：龍骨 = 船寬內地表平均 + 2（半埋）、船舷 = 龍骨 − hh + 1；船內某欄的地板（第一個實心格）= 地表或龍骨取淺的；
// 桅杆在中央 ± 2、高出船舷 stub（1–4）格；箱子的欄離桅杆 ≥ 2（都在第 1 列的船內），箱子在該欄地板上一格。亂數依序：桅杆偏移、殘段、箱子欄（同 M1）
export interface HullPlan extends HullShape { keel: number; gunwale: number; cx: number; chestY: number }
export function hullPlan(p: Profile2, bx: number, w: number, hh: number, rng: HRng): HullPlan {
  let sum = 0;
  for (let x = bx; x < bx + w; x++) sum += p.surfaceAt(x);
  const keel = Math.round(sum / w) + 2, gunwale = keel - hh + 1;
  const floorAt = (x: number): number => Math.min(p.surfaceAt(x), keel);
  const mast = bx + (w >> 1) + rng.int(-2, 3), stub = rng.int(1, 5);
  let cx = rng.int(bx + 3, bx + w - 3);
  if (Math.abs(cx - mast) < 2) cx = mast + 2 <= bx + w - 4 ? mast + 2 : mast - 2;
  return { hh, keel, gunwale, floorAt, mast, stub, cx, chestY: floorAt(cx) - 1 };
}

// 船殼 [x0, x0 + w) × 龍骨列 keelY 往上 hh 列、甲板殘段、桅杆。亂數依序：船殼每格的缺板 / 爛牆、甲板斷口寬與位置（與 M1 的 buildShipwreck 同一個順序）
export function drawHull(cv: HullCanvas, x0: number, w: number, keelY: number, o: HullShape, rng: HRng): void {
  const { hh, floorAt } = o, gunwale = keelY - hh + 1;
  // 船殼：第 r 列（龍骨 r = 0）內縮 max(0, 2 − r)；龍骨整列、其餘列兩側各一格（r ≥ 2 的側板 1/4 缺一塊）
  for (let r = 0; r < hh; r++) {
    const y = keelY - r, inset = Math.max(0, 2 - r), L = x0 + inset, R = x0 + w - 1 - inset;
    for (let x = L; x <= R; x++) {
      const side = x === L || x === R;
      if (r === 0 || (side && (r < 2 || !rng.chance(4)))) cv.put(x, y, T.PLANKS);
      // 船殼與船內（地板以上）的牆，1/5 爛掉
      if ((side || r === 0 || y < floorAt(x)) && !rng.chance(5)) cv.wall(x, y);
    }
  }
  // 甲板殘段：船舷下 2 列，中間斷一段 4–7 格
  const deckY = gunwale + 2, gap = rng.int(4, 8), g0 = rng.int(x0 + 2, x0 + w - 2 - gap);
  for (let x = x0 + 1; x < x0 + w - 1; x++) if ((x < g0 || x >= g0 + gap) && deckY < floorAt(x)) cv.put(x, deckY, T.PLANKS);
  // 桅杆：從船內地板往上到船舷上 stub 格（蓋過甲板）
  for (let y = floorAt(o.mast) - 1; y >= gunwale - o.stub; y--) cv.put(o.mast, y, T.BEAM);
}

export function buildShipwreck(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const rng = new HRng(c.s, c.id), p = c.profile;
  const w = rng.int(18, 27), hh = rng.int(6, 9), sw = c.slotX1 - c.slotX0, d = seaJitter(sw);
  const mid = c.slotX0 + (sw >> 1), off = rng.int(-d, d + 1);
  const bx = Math.max(c.slotX0 + SLOT_PAD, Math.min(mid + off - (w >> 1), c.slotX1 - SLOT_PAD - w));
  const cxm = bx + (w >> 1), wt = p.waterTopAt(cxm) ?? p.surfaceAt(cxm) - 2;
  const plan = hullPlan(p, bx, w, hh, rng), { keel, gunwale, stub, cx, chestY } = plan;
  // 全部格在水面下
  const lim = wt + 1, top = Math.max(lim, Math.min(gunwale - stub, chestY));
  const g = new BpGrid(bx, top, w, keel - top + 1);
  const ok = (y: number): boolean => y >= top && y <= keel;
  // 實心格清水；非實心格保留水
  const put = (x: number, y: number, t: number): void => { if (!ok(y)) return; g.fg(x, y, t); g.liq(x, y, isSolidTile(t) ? 0 : KEEP); };
  const wall = (x: number, y: number): void => { if (ok(y)) g.wall(x, y, W.DARK_PLANK_WALL); };
  drawHull({ put, wall }, bx, w, keel, plan, rng);
  put(cx, chestY, T.CHEST);
  return { id: c.id, kind: 'shipwreck', layer: BP_SURFACE, x: bx, y: top, w, h: keel - top + 1, cells: g.cells(), chests: [{ x: cx, y: chestY, kind: 'ruin' }], ...emptyObjects() };
}
