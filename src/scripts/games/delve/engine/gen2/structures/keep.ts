// keep.ts — gen2 荒野大陸的小地城（M2a Task 18；spec §4.1「荒野大陸的結構以遺跡、地城、小屋、礦坑、隱士為主」）：大陸的 keep 錨點建構器（SURFACE 層）。
// 畫圖與家鄉地城共用 draw/dungeon.ts（generateDungeonOn；排序距離用預設的平方距離），只是房型清單短、不放燈脈古碑：
//   · 預留區 zone = 可用範圍（c.slotX0 / slotX1；anchors.ts 只挑放得下 KEEP_W + 兩側 SLOT_PAD 的槽）置中、寬 KEEP_W（300）；
//     地表 = 塔址（zone 中央 ± 16 欄，同 draw/dungeon.ts 的 gy）地表的中位數；y0 = min(區內最高地表, 塔址地表) − 40、y1 = 塔址地表 + 260。
//   · 房型 = 入口大廳 + 寶藏室 + KEEP_ROOMS（12 間）；和入口連通的自由房間至少 6 間（8 次規劃都不行再用 5 間試；仍不行丟 RangeError，
//     outer.test 的種子都不會發生）。不放燈脈古碑（tablets: false；14 塊石碑都在家鄉）。
//   · 鑰匙 / 上鎖寶箱與家鄉地城相同（draw/dungeon.ts）：上鎖的門數 = 地城鑰匙數、全部在不用開鎖就到得了的房間（箱子 / 陶罐）、
//     金鑰匙在上鎖的神殿、寶藏室的金寶箱（T.LOCKED_CHEST）要金鑰匙——遊戲端是 tile + 物品（game.ts 的 useDoor / LOCKED_CHEST），不依賴 g.dungeon，
//     所以每座小地城各自打得開（outer.test 在遊戲裡開過）。
//   · 規劃 / 施工 / solid / 古碑與地板 / 外框的收尾與家鄉地城共用（structures/dungeon.ts 的 finishDungeonBp）：塔周圍整平帶與外框從區內最高地表往下整片 solid；
//     外框 = 實際畫到的範圍、格子依欄排序並建 colIndex。這裡只決定 zone 與 opts 的差異。
//   · 外框從地表上 40 列到地表下約 280 列：同地帶地下層 / 深層的機率 / 保證藍圖讓位（Q10 的跨層規則；保證小屋改找別的槽，BlueprintIndex.guard），
//     同大陸的地廳錨點不放在它的表層槽下面（anchors.continentAnchors）。
//   · site = { kind: 'dungeon', key: 's' + id, rot: 0, info }（discovery 的地區 = 整座 + 有名字的房間，同家鄉地城；外圍的房間名在自己這座裡唯一）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { DUNGEON_COLORS } from '../../tiles';
import { seedInt } from '../../noise';
import type { ReservedZone, RoomKind } from '../../genTypes';
import { SLOT_PAD, type Blueprint, type BpCtx } from '../bpcore';
import { finishDungeonBp, LEVEL_UP } from './dungeon';

// 預留區寬（= anchors.ANCHOR_MAX_W.keep）；可用範圍至少要 KEEP_W + 兩側 SLOT_PAD（同錨點合約）；地表下的列數
export const KEEP_W = 300;
const DOWN = 260;
// 必要房型（入口大廳與寶藏室另外放）
export const KEEP_ROOMS: readonly RoomKind[] = ['shrine', 'library', 'prison', 'vault', 'hall', 'chamber', 'shaft', 'hall', 'chamber', 'chamber', 'prison', 'hall'];
// 和入口連通的自由房間最少幾間（不行時 finishDungeonBp 退到 5）
const MIN_CONNECTED = 6;
// 塔址取樣半寬（同 draw/dungeon.ts 的 gy）
const TOWER_HALF = 16;

export function buildKeepBp(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  if (c.slotX1 - c.slotX0 < KEEP_W + 2 * SLOT_PAD) throw new RangeError(`gen2: keep ${c.id} does not fit [${c.slotX0}, ${c.slotX1})`);
  const p = c.profile, mid = c.slotX0 + ((c.slotX1 - c.slotX0) >> 1), zx0 = mid - (KEEP_W >> 1), zx1 = zx0 + KEEP_W;
  const cx = (zx0 + zx1) >> 1, tower: number[] = [];
  for (let x = cx - TOWER_HALF; x <= cx + TOWER_HALF; x++) tower.push(p.surfaceAt(x));
  tower.sort((a, b) => a - b);
  const gy = tower[tower.length >> 1];
  let sMin = gy;
  for (let x = zx0; x < zx1; x++) sMin = Math.min(sMin, p.surfaceAt(x));
  const zone: ReservedZone = { x0: zx0, x1: zx1, y0: Math.max(2, sMin - LEVEL_UP), y1: gy + DOWN, side: 'left' };
  const color = DUNGEON_COLORS[(seedInt(c.seed, `g2-keep-color:${c.id}`) >>> 0) % DUNGEON_COLORS.length];
  return finishDungeonBp(c, 'keep', 'keep', { seed: `${c.seed}:g2-keep:${c.id}`, zone, surfaceAt: (x: number) => p.surfaceAt(x), height: p.height, color, natural: true,
    rooms: KEEP_ROOMS, minConnected: MIN_CONNECTED, tablets: false });
}
