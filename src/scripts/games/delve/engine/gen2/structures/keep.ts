// keep.ts — gen2 荒野大陸的小地城（M2a Task 18；spec §4.1「荒野大陸的結構以遺跡、地城、小屋、礦坑、隱士為主」）：大陸的 keep 錨點建構器（SURFACE 層）。
// 畫圖與家鄉地城共用 draw/dungeon.ts（generateDungeonOn；排序距離用預設的平方距離），只是房型清單短、不放燈脈古碑：
//   · 預留區 zone = 可用範圍（c.slotX0 / slotX1；anchors.ts 只挑放得下 KEEP_W + 兩側 SLOT_PAD 的槽）置中、寬 KEEP_W（300）；
//     地表 = 塔址（zone 中央 ± 16 欄，同 draw/dungeon.ts 的 gy）地表的中位數；y0 = min(區內最高地表, 塔址地表) − 40、y1 = 塔址地表 + 260。
//   · 房型 = 入口大廳 + 寶藏室 + KEEP_ROOMS（12 間）；和入口連通的自由房間至少 6 間（8 次規劃都不行再用 5 間試；仍不行丟 RangeError，
//     outer.test 的種子都不會發生）。不放燈脈古碑（tablets: false；14 塊石碑都在家鄉）。
//   · 鑰匙 / 上鎖寶箱與家鄉地城相同（draw/dungeon.ts）：上鎖的門數 = 地城鑰匙數、全部在不用開鎖就到得了的房間（箱子 / 陶罐）、
//     金鑰匙在上鎖的神殿、寶藏室的金寶箱（T.LOCKED_CHEST）要金鑰匙——遊戲端是 tile + 物品（game.ts 的 useDoor / LOCKED_CHEST），不依賴 g.dungeon，
//     所以每座小地城各自打得開（outer.test 在遊戲裡開過）。
//   · solid 與家鄉地城相同（BpCanvas 的回退讀取假設天然格是實心）：塔周圍整平帶與外框從區內最高地表往下整片；外框 = 實際畫到的範圍、格子依欄排序並建 colIndex。
//   · 外框從地表上 40 列到地表下約 280 列：同地帶地下層 / 深層的機率 / 保證藍圖讓位（Q10 的跨層規則；保證小屋改找別的槽，BlueprintIndex.guard），
//     同大陸的地廳錨點不放在它的表層槽下面（anchors.continentAnchors）。
//   · site = { kind: 'dungeon', key: 's' + id, rot: 0, info }（discovery 的地區 = 整座 + 有名字的房間，同家鄉地城；外圍的房間名在自己這座裡唯一）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, SOLID_LUT, DUNGEON_COLORS } from '../../tiles';
import { seedInt } from '../../noise';
import type { ReservedZone, RoomKind } from '../../genTypes';
import { BpCanvas } from '../draw/bpCanvas';
import { generateDungeonOn } from '../draw/dungeon';
import { BP_SURFACE, indexColumns, type Blueprint, type BpCtx } from '../bpcore';
import { drawnBox } from './dungeon';

// 預留區寬（= anchors.ANCHOR_MAX_W.keep）；地表上 / 下的列數
export const KEEP_W = 300;
const UP = 40, DOWN = 260;
// 必要房型（入口大廳與寶藏室另外放）
export const KEEP_ROOMS: readonly RoomKind[] = ['shrine', 'library', 'prison', 'vault', 'hall', 'chamber', 'shaft', 'hall', 'chamber', 'chamber', 'prison', 'hall'];
// 和入口連通的自由房間最少幾間（備案）
const MIN_CONNECTED = 6, MIN_CONNECTED_FALLBACK = 5;
// 畫布在 zone.y1 以下多留（同 structures/dungeon.ts）；塔址取樣半寬（同 draw/dungeon.ts）；塔周圍整平帶（同 structures/dungeon.ts）
const BELOW = 20, TOWER_HALF = 16, LEVEL_HALF = 34, LEVEL_UP = 40, LEVEL_DOWN = 8;

export function buildKeepBp(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const p = c.profile, mid = c.slotX0 + ((c.slotX1 - c.slotX0) >> 1), zx0 = mid - (KEEP_W >> 1), zx1 = zx0 + KEEP_W;
  if (zx1 - zx0 > c.slotX1 - c.slotX0) throw new RangeError(`gen2: keep ${c.id} does not fit [${c.slotX0}, ${c.slotX1})`);
  const cx = (zx0 + zx1) >> 1, tower: number[] = [];
  for (let x = cx - TOWER_HALF; x <= cx + TOWER_HALF; x++) tower.push(p.surfaceAt(x));
  tower.sort((a, b) => a - b);
  const gy = tower[tower.length >> 1];
  let sMin = gy;
  for (let x = zx0; x < zx1; x++) sMin = Math.min(sMin, p.surfaceAt(x));
  const zone: ReservedZone = { x0: zx0, x1: zx1, y0: Math.max(2, sMin - UP), y1: gy + DOWN, side: 'left' };
  const cv = new BpCanvas({ x: zone.x0, y: zone.y0, w: zone.x1 - zone.x0, h: zone.y1 + BELOW - zone.y0 }, p);
  const color = DUNGEON_COLORS[(seedInt(c.seed, `g2-keep-color:${c.id}`) >>> 0) % DUNGEON_COLORS.length];
  const opts = { seed: `${c.seed}:g2-keep:${c.id}`, zone, surfaceAt: (x: number) => p.surfaceAt(x), height: p.height, color, natural: true,
    rooms: KEEP_ROOMS, minConnected: MIN_CONNECTED, tablets: false };
  // 規劃失敗時不會畫任何格（generateDungeonOn 只在規劃成功後施工），同一張畫布可以再試
  const info = generateDungeonOn(cv, opts) ?? generateDungeonOn(cv, { ...opts, minConnected: MIN_CONNECTED_FALLBACK });
  if (!info) throw new RangeError(`gen2: keep ${c.id} has no plan`);

  const ex = info.entrance.x - 4, ey = info.entrance.y + 1;
  if (!cv.inBounds(ex - LEVEL_HALF - 1, ey - LEVEL_UP) || !cv.inBounds(ex + LEVEL_HALF + 1, ey + LEVEL_DOWN)) {
    throw new RangeError(`gen2: keep ${c.id} leveling band outside its canvas`);
  }
  // 整平帶 [gy, gy + 8) 與外框從區內最高地表往下：併進 solid（BpBox 是外接矩形，兩個角就夠）
  cv.fillNatural(ex - LEVEL_HALF, ey); cv.fillNatural(ex + LEVEL_HALF, ey + LEVEL_DOWN - 1);
  let top = ey;
  for (let x = info.bbox.x; x < info.bbox.x + info.bbox.w; x++) top = Math.min(top, p.surfaceAt(x));
  cv.fillNatural(info.bbox.x, Math.max(zone.y0, top)); cv.fillNatural(info.bbox.x + info.bbox.w - 1, Math.max(zone.y0, top));

  const floors: { x: number; y: number }[] = [];
  for (const q of info.rooms) {
    const fy = q.y + q.h - 1;
    for (let x = q.x; x < q.x + q.w; x++) if (cv.fg(x, fy) === T.AIR && SOLID_LUT[cv.fg(x, fy + 1)] === 1) floors.push({ x, y: fy });
  }
  const bp = cv.toBlueprint(c.id, 'keep', BP_SURFACE, { floors, site: { kind: 'dungeon', key: 's' + c.id, rot: 0, info } });
  const { cells, colIndex } = indexColumns(bp.cells);
  return { ...bp, ...drawnBox(bp), cells, colIndex };
}
