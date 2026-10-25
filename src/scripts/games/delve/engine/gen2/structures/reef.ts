// reef.ts — gen2 海槽的珊瑚礁（M2a Task 20，spec §8）：海床上的石 / 砂岩丘（寬 9–15、中央高 3–6，往兩端拋物線遞減、每欄至少 1），
// 丘裡一團 6–12 格的銀礦或金礦（同一種，金 1/3；從丘心長出、四鄰都是丘或天然海床——不碰水）；丘頂中央泡在水裡的遺落行囊
// （地標 T.RELIC_PACK、site 'reef'；水下不用石堆 T.CAIRN）。置中於槽 ± min(20, floor(槽寬 / 10))（layout.seaJitter，同沉船 / 漂流箱）。
// 靜態液體（spec §4.3）：丘的格是實心、清掉水；行囊不是實心、保留水（KEEP）；丘頂離水面 ≥ 2 格，全部格在水面下（y > waterTop）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T } from '../../tiles';
import { HRng } from '../hrng';
import { BpGrid, emptyObjects, BP_SURFACE, KEEP, SLOT_PAD, type Blueprint, type BpCtx } from '../bpcore';
import { seaJitter } from '../layout';

export function buildReefBp(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const rng = new HRng(c.s, c.id), p = c.profile, sw = c.slotX1 - c.slotX0, d = seaJitter(sw);
  const w = rng.int(9, 16), hm = rng.int(3, 7), mid = c.slotX0 + (sw >> 1), half = (w >> 1) + 1;
  const cx = Math.max(c.slotX0 + SLOT_PAD + (w >> 1), Math.min(mid + rng.int(-d, d + 1), c.slotX1 - SLOT_PAD - w + (w >> 1)));
  const bx = cx - (w >> 1), wt = p.waterTopAt(cx) ?? p.surfaceAt(cx) - 2;
  // 每欄的丘頂（離水面 ≥ 2）與海床
  const tops: number[] = [], beds: number[] = [];
  for (let k = 0; k < w; k++) {
    const x = bx + k, dx = x - cx, s = p.surfaceAt(x), h = Math.max(1, Math.round(hm * (1 - (dx * dx) / (half * half))));
    beds.push(s); tops.push(Math.max(wt + 2, s - h));
  }
  const y0 = Math.min(...tops) - 1, y1 = Math.max(...beds) + 2;
  const g = new BpGrid(bx, y0, w, y1 - y0);
  // 丘：丘頂到海床下 1 格，石或砂岩（砂岩 1/3）
  const inMound = (x: number, y: number): boolean => x >= bx && x < bx + w && y >= tops[x - bx] && y <= beds[x - bx] + 1;
  for (let k = 0; k < w; k++) for (let y = tops[k]; y <= beds[k] + 1; y++) { g.fg(bx + k, y, rng.chance(3) ? T.SANDSTONE : T.STONE); g.liq(bx + k, y, 0); }
  // 礦團：從丘心（中央欄、丘頂與海床的中間）長出；候選 = 已選格的四鄰裡在丘內、不是丘頂那一格、四鄰都是丘或天然海床（不碰水）的格
  const dry = (x: number, y: number): boolean => inMound(x, y) || y >= p.surfaceAt(x);
  const ok = (x: number, y: number): boolean => inMound(x, y) && y > tops[x - bx] && dry(x - 1, y) && dry(x + 1, y) && dry(x, y - 1) && dry(x, y + 1);
  const ore = rng.chance(3) ? T.GOLD_ORE : T.SILVER_ORE, n = rng.int(6, 13), k0 = cx - bx;
  const got: [number, number][] = [[cx, (tops[k0] + beds[k0] + 2) >> 1]], has = (x: number, y: number): boolean => got.some((q) => q[0] === x && q[1] === y);
  while (got.length < n) {
    const cand: [number, number][] = [];
    for (const [x, y] of got) for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) if (ok(nx, ny) && !has(nx, ny) && !cand.some((q) => q[0] === nx && q[1] === ny)) cand.push([nx, ny]);
    if (!cand.length) break;
    got.push(cand[rng.int(0, cand.length)]);
  }
  for (const [x, y] of got) g.fg(x, y, ore);
  // 丘頂中央的遺落行囊（泡在水裡）
  const ly = tops[k0] - 1;
  g.fg(cx, ly, T.RELIC_PACK); g.liq(cx, ly, KEEP);
  return { id: c.id, kind: 'reef', layer: BP_SURFACE, x: bx, y: y0, w, h: y1 - y0, cells: g.cells(), chests: [], ...emptyObjects(),
    landmarks: [{ x: cx, y: ly, tile: T.RELIC_PACK, site: 'reef' }] };
}
