// crate.ts — gen2 海槽的漂流箱（spec §8「漂流箱：浮在水面的木箱，有少量物資」）：水面上一列 3 格木板
// （y = waterTop − 1）+ 中間一格上面一個箱子（y = waterTop − 2；M2a Task 20 起用專用的少量物資表 'crate'，loot.ts）。
// 置中於槽 ± min(20, floor(槽寬 / 10))（layout.seaJitter，Task 19）。只蓋水面以上的空氣格，不擠掉水（靜態液體不變，spec §4.3）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T } from '../../tiles';
import { HRng } from '../hrng';
import { BpGrid, emptyObjects, BP_SURFACE, SLOT_PAD, type Blueprint, type BpCtx } from '../bpcore';
import { seaJitter } from '../layout';

export function buildCrate(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const rng = new HRng(c.s, c.id), p = c.profile, sw = c.slotX1 - c.slotX0, d = seaJitter(sw);
  const mid = c.slotX0 + (sw >> 1);
  const cx = Math.max(c.slotX0 + SLOT_PAD + 1, Math.min(mid + rng.int(-d, d + 1), c.slotX1 - SLOT_PAD - 2));
  const wt = p.waterTopAt(cx) ?? p.surfaceAt(cx);
  const g = new BpGrid(cx - 1, wt - 2, 3, 2);
  for (let x = cx - 1; x <= cx + 1; x++) { g.fg(x, wt - 1, T.PLANKS); g.liq(x, wt - 1, 0); }
  g.fg(cx, wt - 2, T.CHEST);
  return { id: c.id, kind: 'crate', layer: BP_SURFACE, x: cx - 1, y: wt - 2, w: 3, h: 2, cells: g.cells(), chests: [{ x: cx, y: wt - 2, kind: 'crate' }], ...emptyObjects() };
}
