// village.ts — gen2 地表村莊（M2a Task 9；spec §4.4「2–4 個村莊」）：家鄉的 village 錨點建構器（SURFACE 層）。
// 畫圖是與舊生成器共用的 draw/village.ts（drawVillage），畫在 BpCanvas 上再輸出藍圖：
//   · 寬 vw ∈ [58, 74)、外框 = 村子 x0 − 9 .. x1 + 9（兩側緩坡；drawVillage 對外框外的坡地欄默默略過，所以外框一定涵蓋它們）、
//     外框置中於可用範圍（c.slotX0 / slotX1；錨點的可用範圍 ≥ ANCHOR_MAX_W.village + 2 × SLOT_PAD，置中一定放得下，不靠 placeX 的夾位置）；
//     出生地區（VARIANT.SPAWN，中點 = 出生點，同 caves.ts）裡中心離出生點 ≤ VILLAGE_MIN 時往外移（bpcore.centerAway；
//     anchors.ts 只選移得開的槽，其他地區離出生點 ≥ 420，置中就夠遠）。
//   · ground = 外框各欄 profile 地表的中位數；style = 雜湊 % 3；整平後每欄 setSurface → ground 覆寫長度 = vw + 18（Q4：只讀 c.profile）。
//   · BpCanvas 的回退讀取假設天然格是實心、沒有洞穴：drawVillage 補低時「讀到實心就不填」的格（每欄 [地面, max(地面 + 6, 原地表 + 3))）
//     必須在成品裡真的是實心 → 外框整片併進 solid（fill.ts 在箱內不挖噪聲洞穴、地表不當入口；礦照常換）。
//   · floors = 委託板 + 廣場上的空氣格；site = { kind: 'village', key: 's' + id, rot, info }：
//     家鄉 rot = c.rank（離出生點由近到遠的名次，最近的 0 → 一定有嚮導）；外圍 rot = 雜湊 % 4。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T } from '../../tiles';
import { seedInt } from '../../noise';
import { HRng } from '../hrng';
import { VARIANT } from '../layout';
import { VILLAGE_MIN } from '../anchors';
import { BpCanvas } from '../draw/bpCanvas';
import { drawVillage } from '../draw/village';
import { BP_SURFACE, centerAway, type Blueprint, type BpCtx } from '../bpcore';

// 兩側緩坡的欄數（draw/village.ts）
const SLOPE = 9;
// 整平時往上清 28 列、往下補到 max(地面 + 6, 原地表 + 3)（draw/village.ts 的 shape）
const CLEAR_UP = 28, FILL_DOWN = 6, FILL_BELOW_SURFACE = 3;
// 廣場寬（委託板在廣場中央：plaza0 = 委託板 x − 5）
const PLAZA_W = 12;

export function buildVillageBp(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const p = c.profile, rng = new HRng(c.s, c.id);
  const vw = rng.int(58, 74), W = vw + 2 * SLOPE;
  const r = c.region, sp = r.variant === VARIANT.SPAWN ? (r.x0 + r.x1) >> 1 : Number.NaN;
  const bx = centerAway(c.slotX0, c.slotX1, W, sp, VILLAGE_MIN);
  if (bx === null) throw new RangeError(`gen2: village ${c.id} does not fit [${c.slotX0}, ${c.slotX1})`);
  const x0 = bx + SLOPE, x1 = x0 + vw - 1;
  const surf: number[] = [];
  for (let x = bx; x < bx + W; x++) surf.push(p.surfaceAt(x));
  const ground = [...surf].sort((a, b) => a - b)[W >> 1];
  const style = (seedInt(c.seed, `g2-village-style:${c.id}`) >>> 0) % 3;
  const rot = c.rank ?? (seedInt(c.seed, `g2-village-rot:${c.id}`) >>> 0) % 4;
  // 外框的列：每欄整平後的地面 top（村內 = ground、坡地 = ground + (原地表 − ground) × k / 10），往上清到 min(ground, top) − 28、往下補到 max(top + 6, 原地表 + 3)
  let y0 = Infinity, y1 = -Infinity;
  for (let x = bx; x < bx + W; x++) {
    const s0 = surf[x - bx], k = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    const top = ground + Math.trunc(((s0 - ground) * k) / 10);
    y0 = Math.min(y0, Math.max(1, Math.min(ground, top) - CLEAR_UP));
    y1 = Math.max(y1, Math.max(top + FILL_DOWN, s0 + FILL_BELOW_SURFACE));
  }
  const cv = new BpCanvas({ x: bx, y: y0, w: W, h: y1 - y0 }, p);
  const info = drawVillage(cv, { x0, vw, ground, style }, rng);
  // 免挖洞箱 = 整個外框（BpBox 是外接矩形，兩個角就夠）
  cv.fillNatural(bx, y0); cv.fillNatural(bx + W - 1, y1 - 1);
  const floors = [{ ...info.board }];
  for (let x = info.board.x - 5; x < info.board.x - 5 + PLAZA_W; x++) if (cv.fg(x, ground - 1) === T.AIR) floors.push({ x, y: ground - 1 });
  return cv.toBlueprint(c.id, 'village', BP_SURFACE, { floors, site: { kind: 'village', key: 's' + c.id, rot, info } });
}
