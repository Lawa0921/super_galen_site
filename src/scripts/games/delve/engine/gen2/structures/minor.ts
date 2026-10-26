// minor.ts — gen2 的小點位（MINOR 層，M2a Task 19；spec「任意連續 340 格內至少一個值得停下的東西」）：每個有槽的陸地地區（沙灘、地城區除外）每 170 格一槽
// （四捨五入，最後一槽 85–254 寬，bpcore.landSlotCount），槽的偏好區（minorZone：中段 / 家鄉緊鄰出生點清空區的槽 = 靠出生點那一半）沒有主坑道入口、
// 沒有（讓位後的）表層 / 天空藍圖、也不在排除範圍（家鄉含出生點 ± 80 的槽；BlueprintIndex 判）就放一個小點位（Task 21 調整，驚喜密度 density.test）。種類（雜湊）：
//   · cairn 45%：石堆（兩塊石頭夾著地標 T.CAIRN、一塊石頭上一顆小石子）+ 紅布旗（4 格旗桿、桿頂旁 2 格村旗布），寬 5；
//   · camp 30%：木板帳篷（A 字形、一側開口、室內木板牆）+ 帳篷裡的地標 T.RELIC_PACK + 帳篷外一支火把，寬 6；
//   · stones 25%：3–5 根石柱（兩端 3 格高、中間 2–3 格）排成一圈 + 第一 / 最後一道縫裡各一個陶罐，寬 2n − 1（5–9）。
//   左右鏡像擲一次。寬 ≤ MINOR_MAX_W（12）。擲到的種類放不下（見下）就改放最窄的 cairn（實測：地下層礦坑的外框從地表蓋住槽的大半時）。
//   地標的 site = 'minor'；小點位不立 Discovery 地區（discovery.GEN2_SITE 沒有它），floors 空（家鄉石碑不放這裡）。
// 站在 c.groundAt 上（Q4：profile + SURFACE 層的地面覆寫；小點位自己沒有 ground），只畫地表以上（外框的底 = 中央欄的地面那一列，含在外框裡：
// fill 的地表裝飾、樹不進外框）。不寫地面、不挖不補（不改地形）。
// 對齊（修正回合 1）：相連的格對齊同一個基準欄的地面——石堆三欄對齊地標那欄、旗布對齊旗桿那欄、帳篷各格對齊屋脊（中央）那欄；
// 其他格（火把、石柱、陶罐）對齊自己那欄。對齊後每格都要在自己那欄的地面以上（否則這個位置不成立）；石堆 / 帳篷各欄比基準欄低的部分
// 從基準地面往下補到該欄地面（石堆補石頭、帳篷補木板 + 木板牆），所以沒有懸空；旗布本來就掛在旗桿旁。
// 位置：槽內 [slotX0 + SLOT_PAD, slotX1 − SLOT_PAD) 的每個外框 x，依離雜湊偏好點（槽中央 ± 槽寬 / 4；家鄉緊鄰出生點清空區的槽 = 靠出生點那一端，Task 21）由近到遠、平手取 x 小的，
// 依序試三種地面起伏容許（全平 → 各欄比中央欄低至多 1、高至多 1 → 高至多 2），取第一個成立的：外框各欄是陸地欄、沒有水、不是地表入口欄
// （入口欄的地表那格可能被洞穴挖掉）、各欄地面比中央欄低至多 1（所以每格都 ≤ 中央欄的地面）、對齊後每格在自己那欄地面以上、
// 不碰主坑道避讓帶（bpcore.shaftBand，同 M1 的觸及範圍規則）、外框（往下到最低那欄的地面）不碰 c.surfaceBan（BlueprintIndex.minorBan：
// 同地區其他各層與這一槽相交的原始藍圖部件——外圍地廳的繩梯豎井、礦坑入口、石室 / 熔岩祭壇的豎井等通到地表的部件都在裡面；
// 小點位等級最低，碰到就會被讓位，所以先避開）。都不成立 → null（這槽不放）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import { seedInt } from '../../noise';
import { entranceHit } from '../../genPrims';
import { HRng } from '../hrng';
import { shaftX } from '../caves';
import { COL_LAND } from '../profile';
import { BpGrid, emptyObjects, boxHits, shaftBand, BP_MINOR, KEEP, SLOT_PAD, SPAWN_CLEAR, SUB_SLOT_W, type Blueprint, type BpCtx, type BpLandmark, type MinorSub } from '../bpcore';

export const MINOR_MAX_W = 12;
// 種類的機率（依序累加）
const SUBS: readonly (readonly [MinorSub, number])[] = [['cairn', 0.45], ['camp', 0.3], ['stones', 0.25]];
// 地面起伏容許：[比中央欄高至多幾格, 比中央欄低至多幾格]，依序試
const TOLS: readonly (readonly [number, number])[] = [[0, 0], [1, 1], [2, 1]];

// 一格：第 dx 欄、基準欄（base，預設 = dx）地面上第 up 格（1 = 地面上一格）；fg = KEEP 只掛牆
interface Cell { dx: number; up: number; fg: number; wall?: number; base?: number }
// 補地：dxs 各欄比 base 欄低的部分，從 base 的地面那列補到該欄地面上一格（fg / wall）
interface Level { base: number; dxs: readonly number[]; fg: number; wall?: number }
interface Shape { w: number; cells: Cell[]; level: Level[]; mark: { dx: number; up: number; tile: number; base: number } | null }

function cairn(): Shape {
  // 石堆三欄對齊地標那欄（dx 1）；旗桿 dx 3、旗布 dx 4 對齊旗桿那欄
  const cells: Cell[] = [
    { dx: 0, up: 1, fg: T.STONE, base: 1 }, { dx: 0, up: 2, fg: T.SMALL_ROCK, base: 1 }, { dx: 1, up: 1, fg: T.CAIRN }, { dx: 2, up: 1, fg: T.STONE, base: 1 },
  ];
  for (let up = 1; up <= 4; up++) cells.push({ dx: 3, up, fg: T.FLAGPOLE });
  cells.push({ dx: 4, up: 3, fg: T.FLAG_CLOTH, base: 3 }, { dx: 4, up: 4, fg: T.FLAG_CLOTH, base: 3 });
  return { w: 5, cells, level: [{ base: 1, dxs: [0, 2], fg: T.STONE }], mark: { dx: 1, up: 1, tile: T.CAIRN, base: 1 } };
}

function camp(): Shape {
  // A 字形：左坡 dx 0–1、屋脊 dx 2、右坡 dx 3（dx 4 開口），全部對齊屋脊那欄；室內掛木板牆，地標在開口旁；火把在 dx 5（對齊自己那欄）
  const P = { fg: T.PLANKS, wall: W.PLANK_WALL, base: 2 }, IN = { fg: KEEP, wall: W.PLANK_WALL, base: 2 };
  const cells: Cell[] = [
    { dx: 0, up: 1, ...P }, { dx: 1, up: 2, ...P }, { dx: 2, up: 3, ...P }, { dx: 3, up: 2, ...P },
    { dx: 1, up: 1, ...IN }, { dx: 2, up: 1, ...IN }, { dx: 2, up: 2, ...IN },
    { dx: 3, up: 1, fg: T.RELIC_PACK, wall: W.PLANK_WALL, base: 2 },
    { dx: 5, up: 1, fg: T.TORCH },
  ];
  return { w: 6, cells, level: [{ base: 2, dxs: [0, 1, 3], fg: T.PLANKS, wall: W.PLANK_WALL }], mark: { dx: 3, up: 1, tile: T.RELIC_PACK, base: 2 } };
}

function stones(rng: HRng): Shape {
  // 每根石柱、每個陶罐對齊自己那欄（石柱之間不相連）
  const n = rng.int(3, 6), cells: Cell[] = [];
  for (let k = 0; k < n; k++) {
    const hgt = k === 0 || k === n - 1 ? 3 : rng.int(2, 4);
    for (let up = 1; up <= hgt; up++) cells.push({ dx: 2 * k, up, fg: T.STONE });
  }
  cells.push({ dx: 1, up: 1, fg: T.POT }, { dx: 2 * n - 3, up: 1, fg: T.POT });
  return { w: 2 * n - 1, cells, level: [], mark: null };
}

// 小點位槽的偏好區（Task 21；BlueprintIndex.minorPoint 判「槽裡已經有值得停下的東西」與 buildMinorBp 的偏好點共用）：
// 一般的槽 = 中段 [x0 + 寬 / 4, x1 − 寬 / 4)（toSpawn 0）；家鄉緊鄰出生點清空區的槽（槽離清空區 < 一個槽寬）= 靠出生點的那一半
// （toSpawn +1 = 出生點在槽的東邊、−1 = 在西邊；偏好點 = 槽靠出生點的那一端）——清空區 160 格加上兩側的槽，小點位放在槽中段時
// 出生點兩側的東西相距可到 340 以上（驚喜密度，density.test）
export function minorZone(x0: number, x1: number, spawnX?: number): { z0: number; z1: number; toSpawn: -1 | 0 | 1 } {
  const sw = x1 - x0, q4 = sw >> 2, half = sw >> 1;
  if (spawnX !== undefined && x1 <= spawnX && x1 > spawnX - SPAWN_CLEAR - SUB_SLOT_W) return { z0: x1 - half, z1: x1, toSpawn: 1 };
  if (spawnX !== undefined && x0 > spawnX && x0 <= spawnX + SPAWN_CLEAR + SUB_SLOT_W) return { z0: x0, z1: x0 + half, toSpawn: -1 };
  return { z0: x0 + q4, z1: x1 - q4, toSpawn: 0 };
}

export function buildMinorBp(c: BpCtx): Blueprint | null {
  // ctx.ver 0 的規則
  const p = c.profile, rng = new HRng(c.s, c.id), ban = c.surfaceBan ?? [], sEnt = seedInt(c.seed, 'g2-entrance');
  const u = rng.next();
  let acc = 0, sub: MinorSub = SUBS[SUBS.length - 1][0];
  for (const [k, q] of SUBS) { acc += q; if (u < acc) { sub = k; break; } }
  let shape = sub === 'cairn' ? cairn() : sub === 'camp' ? camp() : stones(rng);
  const mirror = rng.chance(2), sw = c.slotX1 - c.slotX0, q4 = Math.floor(sw / 4), off = rng.int(-q4, q4 + 1);
  const lo = c.slotX0 + SLOT_PAD, end = c.slotX1 - SLOT_PAD;
  const { toSpawn } = minorZone(c.slotX0, c.slotX1, c.spawnX);
  if (end - lo < MINOR_MAX_W) return null;
  // 槽內各欄 [lo, end)：地面、能不能放（陸地欄、沒有水、不是地表入口欄）
  const g: number[] = [], colOk: boolean[] = [];
  for (let x = lo; x < end; x++) { g.push(c.groundAt(x)); colOk.push(p.info(x).kind === COL_LAND && p.waterTopAt(x) === null && !entranceHit(x, sEnt)); }
  const sx = shaftX(seedInt(c.seed, 'g2-shaft'), c.region), band = shaftBand(sx);
  const gAt = (x: number): number => g[x - lo];
  // 外框 x 起、形狀 sh 的第 dx 欄的世界 x；格 e 的列（對齊基準欄的地面）
  const colOf = (x: number, w: number, dx: number): number => x + (mirror ? w - 1 - dx : dx);
  const rowOf = (x: number, w: number, e: { dx: number; up: number; base?: number }): number => gAt(colOf(x, w, e.base ?? e.dx)) - e.up;
  // 形狀 sh：離偏好點由近到遠、三種起伏容許依序試的第一個成立的外框 → { x, y, h }（底 = 中央欄的地面）
  const place = (sh: Shape): { x: number; y: number; h: number } | null => {
    const w = sh.w, pref = toSpawn === 0 ? c.slotX0 + (sw >> 1) - (w >> 1) + off : toSpawn > 0 ? end - w : lo, xs: number[] = [];
    for (let x = lo; x <= end - w; x++) if (!Number.isFinite(sx) || x + w <= band.l || x >= band.r) xs.push(x);
    xs.sort((a, b) => Math.abs(a - pref) - Math.abs(b - pref) || a - b);
    const fit = (x: number, upT: number, downT: number): { y: number; h: number } | null => {
      const gc = gAt(x + (w >> 1));
      let top = Infinity, low = -Infinity;
      for (let k = 0; k < w; k++) {
        const i = x + k - lo, gy = g[i];
        if (!colOk[i] || gy > gc + downT || gy < gc - upT) return null;
        low = Math.max(low, gy);
      }
      // 對齊後每格都在自己那欄的地面以上
      for (const e of sh.cells) {
        const y = rowOf(x, w, e);
        if (y >= gAt(colOf(x, w, e.dx))) return null;
        top = Math.min(top, y);
      }
      // 禁區看到最低那欄的地面（比外框多看至多一列，外框本身一定也不碰）
      if (boxHits({ x, y: top, w, h: low - top + 1 }, ban)) return null;
      return { y: top, h: gc - top + 1 };
    };
    for (const [upT, downT] of TOLS) for (const x of xs) { const f = fit(x, upT, downT); if (f) return { x, ...f }; }
    return null;
  };
  let at = place(shape);
  if (!at && sub !== 'cairn') { sub = 'cairn'; shape = cairn(); at = place(shape); }
  if (!at) return null;
  const w = shape.w, { x: bx, y: by, h: bh } = at, grid = new BpGrid(bx, by, w, bh);
  // 補地先畫（之後的格蓋在它上面；補的格都在基準地面以下、該欄地面以上）
  for (const lv of shape.level) {
    const gb = gAt(colOf(bx, w, lv.base));
    for (const dx of lv.dxs) {
      const x = colOf(bx, w, dx);
      for (let y = gb; y < gAt(x); y++) { grid.fg(x, y, lv.fg); if (lv.wall !== undefined) grid.wall(x, y, lv.wall); }
    }
  }
  for (const e of shape.cells) {
    const x = colOf(bx, w, e.dx), y = rowOf(bx, w, e);
    if (e.fg !== KEEP) grid.fg(x, y, e.fg);
    if (e.wall !== undefined) grid.wall(x, y, e.wall);
  }
  const landmarks: BpLandmark[] = [];
  if (shape.mark) { const x = colOf(bx, w, shape.mark.dx); landmarks.push({ x, y: rowOf(bx, w, shape.mark), tile: shape.mark.tile, site: 'minor' }); }
  return { id: c.id, kind: 'minor', layer: BP_MINOR, x: bx, y: by, w, h: bh, cells: grid.cells(), chests: [], ...emptyObjects(), landmarks, sub };
}
