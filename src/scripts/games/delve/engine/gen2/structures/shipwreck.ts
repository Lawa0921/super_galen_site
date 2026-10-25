// shipwreck.ts — gen2 海槽的沉船（spec §8「沉船（水下半埋，有寶箱）」）：寬 18–26、船殼高 6–8，
// 船底（龍骨列）= 船寬內海床平均 + 2（半埋在海床裡）；木板船殼（底兩列內縮成船形）、側板與甲板殘缺、
// 木樑桅杆殘段（從船內地板往上、高出船舷 1–4 格）、船殼與船內水中的格掛深色木板牆、一個箱子（M1 用 'ruin' 戰利品）。
// 置中於槽 ± min(20, floor(槽寬 / 10))（layout.seaJitter，Task 19）。
// 靜態液體（spec §4.3）：實心格（木板）清掉水；非實心格（桅杆、箱子）與船內格的液體保留（KEEP）——
// 海水本來就滿格，所以船內、箱子與桅杆都泡在滿格水裡、不會流動；船內海床以下的沙不動（半埋）。
// 全部格在水面下（y > waterTop）。本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W, isSolidTile } from '../../tiles';
import { HRng } from '../hrng';
import { BpGrid, emptyObjects, BP_SURFACE, KEEP, SLOT_PAD, type Blueprint, type BpCtx } from '../bpcore';
import { seaJitter } from '../layout';

export function buildShipwreck(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const rng = new HRng(c.s, c.id), p = c.profile;
  const w = rng.int(18, 27), hh = rng.int(6, 9), sw = c.slotX1 - c.slotX0, d = seaJitter(sw);
  const mid = c.slotX0 + (sw >> 1), off = rng.int(-d, d + 1);
  const bx = Math.max(c.slotX0 + SLOT_PAD, Math.min(mid + off - (w >> 1), c.slotX1 - SLOT_PAD - w));
  const cxm = bx + (w >> 1), wt = p.waterTopAt(cxm) ?? p.surfaceAt(cxm) - 2;
  let sum = 0;
  for (let x = bx; x < bx + w; x++) sum += p.surfaceAt(x);
  const keel = Math.round(sum / w) + 2, gunwale = keel - hh + 1;
  // 船內某欄的地板（第一個實心格）：海床或龍骨，取淺的
  const floorAt = (x: number): number => Math.min(p.surfaceAt(x), keel);
  // 桅杆與箱子的欄（箱子離桅杆 ≥ 2 格，都在第 1 列的船內）
  const mx = cxm + rng.int(-2, 3), stub = rng.int(1, 5);
  let cx = rng.int(bx + 3, bx + w - 3);
  if (Math.abs(cx - mx) < 2) cx = mx + 2 <= bx + w - 4 ? mx + 2 : mx - 2;
  const chestY = floorAt(cx) - 1;
  // 全部格在水面下
  const lim = wt + 1, top = Math.max(lim, Math.min(gunwale - stub, chestY));
  const g = new BpGrid(bx, top, w, keel - top + 1);
  const ok = (y: number): boolean => y >= top && y <= keel;
  // 實心格清水；非實心格保留水
  const put = (x: number, y: number, t: number): void => { if (!ok(y)) return; g.fg(x, y, t); g.liq(x, y, isSolidTile(t) ? 0 : KEEP); };
  const wall = (x: number, y: number): void => { if (ok(y)) g.wall(x, y, W.DARK_PLANK_WALL); };

  // 船殼：第 r 列（龍骨 r = 0）內縮 max(0, 2 − r)；龍骨整列、其餘列兩側各一格（r ≥ 2 的側板 1/4 缺一塊）
  for (let r = 0; r < hh; r++) {
    const y = keel - r, inset = Math.max(0, 2 - r), L = bx + inset, R = bx + w - 1 - inset;
    for (let x = L; x <= R; x++) {
      const side = x === L || x === R;
      if (r === 0 || (side && (r < 2 || !rng.chance(4)))) put(x, y, T.PLANKS);
      // 船殼與船內（海床以上）的牆，1/5 爛掉
      if ((side || r === 0 || y < floorAt(x)) && !rng.chance(5)) wall(x, y);
    }
  }
  // 甲板殘段：船舷下 2 列，中間斷一段 4–7 格
  const deckY = gunwale + 2, gap = rng.int(4, 8), g0 = rng.int(bx + 2, bx + w - 2 - gap);
  for (let x = bx + 1; x < bx + w - 1; x++) if ((x < g0 || x >= g0 + gap) && deckY < floorAt(x)) put(x, deckY, T.PLANKS);
  // 桅杆：從船內地板往上到船舷上 stub 格（蓋過甲板）
  for (let y = floorAt(mx) - 1; y >= gunwale - stub; y--) put(mx, y, T.BEAM);
  put(cx, chestY, T.CHEST);
  return { id: c.id, kind: 'shipwreck', layer: BP_SURFACE, x: bx, y: top, w, h: keel - top + 1, cells: g.cells(), chests: [{ x: cx, y: chestY, kind: 'ruin' }], ...emptyObjects() };
}
