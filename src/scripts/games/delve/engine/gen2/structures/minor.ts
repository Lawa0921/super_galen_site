// minor.ts — gen2 的小點位（MINOR 層，M2a Task 19；spec「任意連續 340 格內至少一個值得停下的東西」）：每個有槽的陸地地區（沙灘、地城區除外）每 170 格一槽，
// 槽內（讓位後）沒有表層 / 天空藍圖、也不在排除範圍（家鄉含出生點 ± 80 的槽、含主坑道的槽；BlueprintIndex 判）就放一個小點位。種類（雜湊）：
//   · cairn 45%：石堆（兩塊石頭夾著地標 T.CAIRN、一塊石頭上一顆小石子）+ 紅布旗（4 格旗桿、桿頂旁 2 格村旗布），寬 5；
//   · camp 30%：木板帳篷（A 字形、一側開口、室內木板牆）+ 帳篷裡的地標 T.RELIC_PACK + 帳篷外一支火把，寬 6；
//   · stones 25%：3–5 根石柱（兩端 3 格高、中間 2–3 格）排成一圈 + 第一 / 最後一道縫裡各一個陶罐，寬 2n − 1（5–9）。
//   左右鏡像擲一次。寬 ≤ MINOR_MAX_W（12）。擲到的種類放不下（見下）就改放最窄的 cairn（實測：地下層礦坑的外框從地表蓋住槽的大半時）。
//   地標的 site = 'minor'；小點位不立 Discovery 地區（discovery.GEN2_SITE 沒有它），floors 空（家鄉石碑不放這裡）。
// 站在 c.groundAt 上（Q4：profile + SURFACE 層的地面覆寫；小點位自己沒有 ground）：每一欄的東西從該欄地面上一格往上疊，只畫地表以上
// （外框的底 = 中央欄的地面那一列，含在外框裡：fill 的地表裝飾、樹不進外框）。不寫地面、不挖不補（不改地形）。
// 位置：槽內 [slotX0 + SLOT_PAD, slotX1 − SLOT_PAD) 的每個外框 x，依離雜湊偏好點（槽中央 ± 槽寬 / 4）由近到遠、平手取 x 小的，
// 依序試三種地面起伏容許（全平 → 各欄比中央欄低至多 1、高至多 1 → 高至多 2），取第一個成立的：外框各欄是陸地欄、沒有水、不是地表入口欄
// （入口欄的地表那格可能被洞穴挖掉）、各欄地面比中央欄低至多 1（所以每格都 ≤ 中央欄的地面）、不碰主坑道避讓帶（bpcore.shaftBand，同 M1 的觸及範圍規則）、
// 外框（往下到最低那欄的地面）不碰 c.surfaceBan（BlueprintIndex.minorBan：同地區其他各層與這一槽相交的原始藍圖部件——外圍地廳的繩梯豎井、
// 礦坑入口、石室 / 熔岩祭壇的豎井等通到地表的部件都在裡面；小點位等級最低，碰到就會被讓位，所以先避開）。都不成立 → null（這槽不放）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import { seedInt } from '../../noise';
import { entranceHit } from '../../genPrims';
import { HRng } from '../hrng';
import { shaftX } from '../caves';
import { COL_LAND } from '../profile';
import { BpGrid, emptyObjects, boxHits, shaftBand, BP_MINOR, KEEP, SLOT_PAD, type Blueprint, type BpCtx, type BpLandmark, type MinorSub } from '../bpcore';

export const MINOR_MAX_W = 12;
// 種類的機率（依序累加）
const SUBS: readonly (readonly [MinorSub, number])[] = [['cairn', 0.45], ['camp', 0.3], ['stones', 0.25]];
// 地面起伏容許：[比中央欄高至多幾格, 比中央欄低至多幾格]，依序試
const TOLS: readonly (readonly [number, number])[] = [[0, 0], [1, 1], [2, 1]];

// 一格：第 dx 欄、地面上第 up 格（1 = 地面上一格）；fg = KEEP 只掛牆
interface Cell { dx: number; up: number; fg: number; wall?: number }
interface Shape { w: number; h: number; cells: Cell[]; mark: { dx: number; up: number; tile: number } | null }

function cairn(): Shape {
  const cells: Cell[] = [
    { dx: 0, up: 1, fg: T.STONE }, { dx: 0, up: 2, fg: T.SMALL_ROCK }, { dx: 1, up: 1, fg: T.CAIRN }, { dx: 2, up: 1, fg: T.STONE },
  ];
  for (let up = 1; up <= 4; up++) cells.push({ dx: 3, up, fg: T.FLAGPOLE });
  cells.push({ dx: 4, up: 3, fg: T.FLAG_CLOTH }, { dx: 4, up: 4, fg: T.FLAG_CLOTH });
  return { w: 5, h: 4, cells, mark: { dx: 1, up: 1, tile: T.CAIRN } };
}

function camp(): Shape {
  // A 字形：左坡 dx 0–1、屋脊 dx 2、右坡 dx 3（dx 4 開口）；室內掛木板牆，地標在開口旁；火把在 dx 5
  const cells: Cell[] = [
    { dx: 0, up: 1, fg: T.PLANKS, wall: W.PLANK_WALL }, { dx: 1, up: 2, fg: T.PLANKS, wall: W.PLANK_WALL }, { dx: 2, up: 3, fg: T.PLANKS, wall: W.PLANK_WALL },
    { dx: 3, up: 2, fg: T.PLANKS, wall: W.PLANK_WALL },
    { dx: 1, up: 1, fg: KEEP, wall: W.PLANK_WALL }, { dx: 2, up: 1, fg: KEEP, wall: W.PLANK_WALL }, { dx: 2, up: 2, fg: KEEP, wall: W.PLANK_WALL },
    { dx: 3, up: 1, fg: T.RELIC_PACK, wall: W.PLANK_WALL },
    { dx: 5, up: 1, fg: T.TORCH },
  ];
  return { w: 6, h: 3, cells, mark: { dx: 3, up: 1, tile: T.RELIC_PACK } };
}

function stones(rng: HRng): Shape {
  const n = rng.int(3, 6), cells: Cell[] = [];
  for (let k = 0; k < n; k++) {
    const hgt = k === 0 || k === n - 1 ? 3 : rng.int(2, 4);
    for (let up = 1; up <= hgt; up++) cells.push({ dx: 2 * k, up, fg: T.STONE });
  }
  cells.push({ dx: 1, up: 1, fg: T.POT }, { dx: 2 * n - 3, up: 1, fg: T.POT });
  return { w: 2 * n - 1, h: 3, cells, mark: null };
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
  if (end - lo < MINOR_MAX_W) return null;
  // 槽內各欄 [lo, end)：地面、能不能放（陸地欄、沒有水、不是地表入口欄）
  const g: number[] = [], colOk: boolean[] = [];
  for (let x = lo; x < end; x++) { g.push(c.groundAt(x)); colOk.push(p.info(x).kind === COL_LAND && p.waterTopAt(x) === null && !entranceHit(x, sEnt)); }
  const sx = shaftX(seedInt(c.seed, 'g2-shaft'), c.region), band = shaftBand(sx);
  // 寬 w、高 h 的外框：離偏好點由近到遠、三種起伏容許依序試的第一個成立的 → { x, y, h }（底 = 中央欄的地面）
  const place = (w: number, h: number): { x: number; y: number; h: number } | null => {
    const pref = c.slotX0 + (sw >> 1) - (w >> 1) + off, xs: number[] = [];
    for (let x = lo; x <= end - w; x++) if (!Number.isFinite(sx) || x + w <= band.l || x >= band.r) xs.push(x);
    xs.sort((a, b) => Math.abs(a - pref) - Math.abs(b - pref) || a - b);
    const fit = (x: number, upT: number, downT: number): { y: number; h: number } | null => {
      const gc = g[x + (w >> 1) - lo];
      let top = Infinity, low = -Infinity;
      for (let k = 0; k < w; k++) {
        const i = x + k - lo, gy = g[i];
        if (!colOk[i] || gy > gc + downT || gy < gc - upT) return null;
        top = Math.min(top, gy - h); low = Math.max(low, gy);
      }
      // 禁區看到最低那欄的地面（比外框多看至多一列，外框本身一定也不碰）
      if (boxHits({ x, y: top, w, h: low - top + 1 }, ban)) return null;
      return { y: top, h: gc - top + 1 };
    };
    for (const [upT, downT] of TOLS) for (const x of xs) { const f = fit(x, upT, downT); if (f) return { x, ...f }; }
    return null;
  };
  let at = place(shape.w, shape.h);
  if (!at && sub !== 'cairn') { sub = 'cairn'; shape = cairn(); at = place(shape.w, shape.h); }
  if (!at) return null;
  const w = shape.w, { x: bx, y: by, h: bh } = at, grid = new BpGrid(bx, by, w, bh);
  const colX = (dx: number): number => bx + (mirror ? w - 1 - dx : dx), rowY = (x: number, up: number): number => g[x - lo] - up;
  for (const e of shape.cells) {
    const x = colX(e.dx), y = rowY(x, e.up);
    if (e.fg !== KEEP) grid.fg(x, y, e.fg);
    if (e.wall !== undefined) grid.wall(x, y, e.wall);
  }
  const landmarks: BpLandmark[] = [];
  if (shape.mark) { const x = colX(shape.mark.dx); landmarks.push({ x, y: rowY(x, shape.mark.up), tile: shape.mark.tile, site: 'minor' }); }
  return { id: c.id, kind: 'minor', layer: BP_MINOR, x: bx, y: by, w, h: bh, cells: grid.cells(), chests: [], ...emptyObjects(), landmarks, sub };
}
