// seaRuin.ts — gen2 海槽的海底遺跡（M2a Task 20，spec §8）：半埋在海床裡的石磚殘屋（寬 10–14、高 6–8；照地表遺跡 ruin.ts 的形狀：
// 一側坍塌、外殼偶爾缺磚、一側牆底 3 格門洞），地板（石磚列）= 屋寬內海床平均 + 2（半埋）；'ruin' 箱、守望石像（地標 T.GUARDIAN_STATUE、site 'sea_ruin'）。
// 置中於槽 ± min(20, floor(槽寬 / 10))（layout.seaJitter，同沉船 / 漂流箱）。
// 靜態液體（spec §4.3，同 M1 沉船）：石磚清掉水；其他格不動液體（KEEP）——屋內海床以上本來就是滿格的海水（內部保留水），海床以下的沙不動（半埋）；
// 箱子 / 石像放在該欄地板（海床或石磚地板，取淺的）上一格，泡在水裡；石磚牆背景只掛在屋內有水的格。全部格在水面下（屋頂離水面 ≥ 2 格）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import { HRng } from '../hrng';
import { BpGrid, emptyObjects, BP_SURFACE, KEEP, SLOT_PAD, type Blueprint, type BpCtx, type BpLandmark } from '../bpcore';
import { seaJitter } from '../layout';

export function buildSeaRuinBp(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const rng = new HRng(c.s, c.id), p = c.profile, sw = c.slotX1 - c.slotX0, d = seaJitter(sw);
  const w = rng.int(10, 15), h = rng.int(6, 9), mid = c.slotX0 + (sw >> 1);
  const cxm = Math.max(c.slotX0 + SLOT_PAD + (w >> 1), Math.min(mid + rng.int(-d, d + 1), c.slotX1 - SLOT_PAD - w + (w >> 1)));
  const bx = cxm - (w >> 1), wt = p.waterTopAt(cxm) ?? p.surfaceAt(cxm) - 2;
  let sum = 0;
  for (let x = bx; x < bx + w; x++) sum += p.surfaceAt(x);
  const base = Math.round(sum / w) + 2, roof = Math.max(wt + 2, base - h), hh = base - roof;
  // 屋內某欄的地板（第一個實心格）：海床或石磚地板，取淺的
  const floorAt = (x: number): number => Math.min(p.surfaceAt(x), base);
  const g = new BpGrid(bx, roof, w, hh + 1);
  const brick = (x: number, y: number): void => { g.fg(x, y, T.STONE_BRICK); g.liq(x, y, 0); };
  // 石磚殘屋：坍塌側（右）高度往右遞減；門洞在左牆底 3 格；外殼 1/8 缺磚、屋內有水的格 80% 石牆
  const breakAt = bx + Math.floor(w * (0.45 + 0.25 * rng.next()));
  for (let x = bx; x < bx + w; x++) {
    brick(x, base);
    const keep = x < breakAt ? hh : Math.max(1, Math.floor(hh * (1 - (x - breakAt + 1) / (bx + w - breakAt + 1))) - rng.int(0, 3));
    for (let y = base - 1; y >= roof; y--) {
      if (base - y > keep) break;
      const shell = x === bx || x === bx + w - 1 || y === roof;
      if (shell && !(x === bx && y >= base - 3) && !rng.chance(8)) brick(x, y);
      if (!shell && y < p.surfaceAt(x) && rng.next() < 0.8) g.wall(x, y, W.STONE_WALL);
    }
  }
  // 箱子：屋內左半（坍塌側的另一邊）；守望石像：離屋子中央最近、不是箱子左右的欄（平手取左邊的）
  const cx = bx + 2 + rng.int(0, Math.max(1, Math.floor(w / 2) - 2)), cy = floorAt(cx) - 1;
  g.fg(cx, cy, T.CHEST);
  const landmarks: BpLandmark[] = [], m = bx + (w >> 1);
  for (let k = 0; k <= w >> 1 && !landmarks.length; k++) for (const x of [m - k, m + k]) {
    const y = floorAt(x) - 1;
    if (x <= bx || x >= bx + w - 1 || Math.abs(x - cx) <= 1 || y <= roof || g.getFg(x, y) !== KEEP) continue;
    g.fg(x, y, T.GUARDIAN_STATUE); landmarks.push({ x, y, tile: T.GUARDIAN_STATUE, site: 'sea_ruin' }); break;
  }
  return { id: c.id, kind: 'sea_ruin', layer: BP_SURFACE, x: bx, y: roof, w, h: hh + 1, cells: g.cells(), chests: [{ x: cx, y: cy, kind: 'ruin' }], ...emptyObjects(), landmarks };
}
