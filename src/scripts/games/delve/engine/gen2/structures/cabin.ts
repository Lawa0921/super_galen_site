// cabin.ts — gen2 地下小屋（照舊生成器的形狀，但兩側坑道是直的、不用 tileRunner）：
// 寬 9–15、高 6–8，頂 y ∈ [地表 + 26, 熔岩層 − 30]（取屋子底下各欄最深的地表與最淺的熔岩層），
// 木板外殼 + 木板牆、兩端 3 格高門洞、兩側各一條 14–30 格長的 3 格高直坑道、工作台、箱子（'cabin'）、火把、蜘蛛網、陶罐。
// 外框 = 屋子 + 兩側坑道。本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import { HRng } from '../hrng';
import { BpGrid, placeX, emptyObjects, BP_UNDER, type Blueprint, type BpCtx } from '../bpcore';

// force（P11）：不回 null（y 範圍不成立時取下限）
export function buildCabin(c: BpCtx, o: { force?: boolean } = {}): Blueprint | null {
  // ctx.ver 0 的規則
  const rng = new HRng(c.s, c.id), p = c.profile;
  const w = rng.int(9, 16), h = rng.int(6, 9), tl = rng.int(14, 31), tr = rng.int(14, 31), fy = rng.next();
  const bw = tl + w + tr;
  // 外框 x = bx 時屋頂 y 的範圍
  const span = (bx: number): { lo: number; hi: number } => {
    let sMax = -1, mMin = p.height;
    for (let x = bx + tl; x < bx + tl + w; x++) { sMax = Math.max(sMax, p.surfaceAt(x)); mMin = Math.min(mMin, p.layersAt(x).molten); }
    return { lo: sMax + 26, hi: mMin - 30 };
  };
  const bx = placeX(c, bw, o.force === true, (x) => { const s = span(x); return s.hi >= s.lo; });
  if (bx === null) return null;
  const { lo, hi } = span(bx);
  const y = hi >= lo ? lo + Math.floor(fy * (hi - lo + 1)) : lo;
  const x = bx + tl, floorY = y + h - 1, inside = floorY - 1;
  const g = new BpGrid(bx, y, bw, h);
  const air = (xx: number, yy: number): void => { g.fg(xx, yy, T.AIR); g.liq(xx, yy, 0); };

  // 兩側直坑道：地板上三列
  for (let yy = floorY - 3; yy < floorY; yy++) {
    for (let xx = bx; xx < x; xx++) air(xx, yy);
    for (let xx = x + w; xx < bx + bw; xx++) air(xx, yy);
  }
  // 屋子：木板外殼、內部空氣、全部木板牆
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const border = yy === y || yy === floorY || xx === x || xx === x + w - 1;
    if (border) { g.fg(xx, yy, T.PLANKS); g.liq(xx, yy, 0); } else air(xx, yy);
    g.wall(xx, yy, W.PLANK_WALL);
  }
  // 兩端門洞（3 格高）
  for (const dx of [x, x + w - 1]) for (let yy = floorY - 3; yy < floorY; yy++) g.fg(dx, yy, T.AIR);
  // 年久失修：屋頂 / 側牆缺幾塊（地板保留）
  for (let xx = x + 1; xx < x + w - 1; xx++) if (rng.chance(9)) g.fg(xx, y, T.AIR);
  for (let yy = y + 1; yy < floorY - 3; yy++) for (const dx of [x, x + w - 1]) if (rng.chance(6)) g.fg(dx, yy, T.AIR);
  // 家具
  const bench = rng.int(x + 2, x + w - 3);
  g.fg(bench, inside, T.WORKBENCH);
  let cx = rng.int(x + 2, x + w - 2);
  if (Math.abs(cx - bench) < 2) cx = bench + 2 < x + w - 1 ? bench + 2 : bench - 2;
  g.fg(cx, inside, T.CHEST);
  g.fg(rng.chance(2) ? x + 1 : x + w - 2, y + 1, T.TORCH);
  for (const qx of [x + 1, x + w - 2]) if (g.getFg(qx, y + 1) === T.AIR && rng.chance(2)) g.fg(qx, y + 1, T.COBWEB);
  if (rng.chance(2)) {
    const px = rng.int(x + 1, x + w - 1);
    if (g.getFg(px, inside) === T.AIR) g.fg(px, inside, T.POT);
  }
  return { id: c.id, kind: 'cabin', layer: BP_UNDER, x: bx, y, w: bw, h, cells: g.cells(), chests: [{ x: cx, y: inside, kind: 'cabin' }], ...emptyObjects() };
}
