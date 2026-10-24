// mineshaft.ts — gen2 礦坑（M2a Task 10；spec §4.4「至少 3 個密室；…礦坑」）：地下層的機率礦坑（外圍 0.15、家鄉 0.45，blueprint.ts）與家鄉的 mineshaft_secret 錨點建構器（UNDER 層）。
// 畫圖是與舊生成器共用的 draw/mineshaft.ts（drawMineshaft / drawRamp / drawSecretRoom），畫在 BpCanvas 上再輸出藍圖：
//   · 先擲：長 len0 ∈ [50, 100]、深 dy ∈ [28, 129]（yTop = 槽中心的 profile 地表 + dy）、斜坡 1/2（dy < 100 時）、密室（secret 為 true 或 1/4）、
//     密室室內寬 rw ∈ [8, 12]、密室在右端 1/2（有斜坡時一定在右端：斜坡佔著左端）。
//   · 總寬上限（Q3）：len + 斜坡寬（dy + 6，有斜坡時）+ 密室寬（rw + 4，有密室時）≤ cap = min(slotWidth(UNDER) − 16 = 154, 可用範圍 − 16)；
//     len = min(len0, cap − 斜坡寬 − 密室寬)，len < MINESHAFT_MIN_LEN（50）就拿掉斜坡（密室保留），還是 < 50 → 不放（回 null；錨點丟 RangeError）。
//     可用範圍 < 170 只發生在家鄉含主坑道的槽（控制者裁決：家鄉的機率礦坑可以用含坑道的槽，可用範圍 = 避開坑道帶較大的一側，礦坑長度縮到放得下）；
//     整槽 ≥ 170 時 cap = 154、len 上限照舊（錨點、外圍的輸出不變）。
//     外框 x 用 placeX（UNDER：外框避開主坑道避讓帶，Q3 / Q3b；錨點的可用範圍 ≥ 154 + 16，置中一定放得下、不靠夾位置）。
//   · 斜坡：實際走幾欄由 draw/mineshaft.rampSteps 照 profile 地表算（同 drawRamp 的停止規則）；比預留的斜坡寬長（左邊地表往上爬）就不畫斜坡。
//   · 錨點（secret = true，家鄉的 mineshaft_secret）不接斜坡：斜坡伸到地表，會壓到上方的村莊 / 遺跡 / 空島錨點（錨點跨層相交 = RangeError）；
//     沒有斜坡時外框在槽中心地表下 ≥ 24（密室石殼頂 = yTop − 4）。
//   · BpCanvas 的回退讀取假設天然格是實心、沒有洞穴：drawMineshaft 只在「讀到不是實心」時補頂板（yTop − 1）/ 地板（yTop + 4），
//     drawRamp 只在不是實心時補每階腳下那格 → 外框整片併進 solid（箱內不挖噪聲洞穴，頂板 / 地板 / 腳下在成品裡是天然岩；礦照常換）。
//     4 列背景牆：fill.ts 在地表下 3 格起一律寫天然牆（洞穴也有），BpCanvas.wall 的回退同一條規則，所以不靠 solid。
//   · 地標（同舊生成器的 mineCart）：坑道地板上一列（yTop + 3）的空氣格、腳下實心 → 鋪軌道（T.RAIL），礦車（T.ORE_CART、site 'mineshaft'）
//     停在離坑道中央最近、頭頂空氣、左右不是箱子的軌道格。
//   · 密室的地區（Task 15 用 part 1）：密室室內 = 'secret' 箱子那列往上 6 列（箱子在室內離坑道遠的那一端數來第 3 格）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T } from '../../tiles';
import { HRng } from '../hrng';
import { BpCanvas } from '../draw/bpCanvas';
import { drawMineshaft, drawRamp, drawSecretRoom, rampSteps, secretRoomLayout } from '../draw/mineshaft';
import { BP_UNDER, SLOT_PAD, SUB_SLOT_W, placeX, type Blueprint, type BpCtx, type BpLandmark } from '../bpcore';

// 總寬上限（Q3）；坑道最短（縮完還短於它 = 這槽不放）
export const MINESHAFT_MAX_W = SUB_SLOT_W - 2 * SLOT_PAD, MINESHAFT_MIN_LEN = 50;
const LEN_MIN = MINESHAFT_MIN_LEN, LEN_MAX = 100, DY_MIN = 28, DY_MAX = 129, RAMP_DEPTH = 100, RAMP_PAD = 6, RW_MIN = 8, RW_MAX = 12, ROOM_PAD = 4;

// 外框必定放得下的礦坑（force）：secret = true（家鄉的 mineshaft_secret 錨點）一律有密室、不接斜坡；錨點的可用範圍放得下，不會回 null，真的放不下 = RangeError
export function buildMineshaftBp(c: BpCtx, o: { secret?: boolean } = {}): Blueprint {
  const bp = mineshaft(c, o.secret === true, true);
  if (!bp) throw new RangeError(`gen2: mineshaft ${c.id} does not fit [${c.slotX0}, ${c.slotX1})`);
  return bp;
}

// 槽位表（地下層；c.slotX0 / slotX1 可以是含坑道槽避開坑道帶的一側）：放不下（主坑道避讓帶、可用範圍太窄）回 null
export function rollMineshaftBp(c: BpCtx, o: { force?: boolean } = {}): Blueprint | null {
  return mineshaft(c, false, o.force === true);
}

// ctx.ver 0 的規則
function mineshaft(c: BpCtx, anchor: boolean, force: boolean): Blueprint | null {
  const p = c.profile, rng = new HRng(c.s, c.id);
  const len0 = rng.int(LEN_MIN, LEN_MAX + 1), dy = rng.int(DY_MIN, DY_MAX + 1), rampRoll = rng.chance(2), secretRoll = rng.chance(4);
  const rw = rng.int(RW_MIN, RW_MAX + 1), rightRoll = rng.chance(2);
  const yTop = p.surfaceAt((c.slotX0 + c.slotX1) >> 1) + dy;
  const secret = anchor || secretRoll, secW = secret ? rw + ROOM_PAD : 0;
  // 錨點不接斜坡（理由：斜坡伸到地表會壓到上方的錨點 → 跨層相交 RangeError；家鄉的槽不夠讓密室礦坑全部避開表層錨點）
  let rampW = !anchor && rampRoll && dy < RAMP_DEPTH ? dy + RAMP_PAD : 0;
  const cap = Math.min(MINESHAFT_MAX_W, c.slotX1 - c.slotX0 - 2 * SLOT_PAD);
  let len = Math.min(len0, cap - rampW - secW);
  if (len < LEN_MIN) { rampW = 0; len = Math.min(len0, cap - secW); }
  if (len < LEN_MIN) return null;
  const right = rampW > 0 || rightRoll;
  const bx = placeX(c, rampW + len + secW, force, () => true);
  if (bx === null) return null;
  // 版面（左到右）：斜坡 | 左側密室 | 坑道 | 右側密室
  const x0 = bx + rampW + (secret && !right ? secW : 0);
  const steps = rampW > 0 ? rampSteps({ x0, yTop }, (x) => p.surfaceAt(x)) : 0, ramp = steps > 0 && steps <= rampW;
  const lay = { shaftX0: x0, shaftLen: len, yTop, right, rw }, shell = secretRoomLayout(lay).shell;
  const left = ramp ? x0 - steps : secret && !right ? shell.x : x0, end = secret && right ? shell.x + shell.w : x0 + len;
  const top = Math.min(secret ? shell.y : yTop - 1, ramp ? yTop - steps : Infinity), bottom = secret ? shell.y + shell.h : yTop + 5;
  const cv = new BpCanvas({ x: left, y: top, w: end - left, h: bottom - top }, p);
  drawMineshaft(cv, { x0, len, yTop }, rng);
  if (ramp) drawRamp(cv, { x0, yTop }, (x) => p.surfaceAt(x));
  if (secret) drawSecretRoom(cv, lay, rng);
  const landmarks = cart(cv, x0, len, yTop);
  // 免挖洞箱 = 整個外框（BpBox 是外接矩形，兩個角就夠）
  cv.fillNatural(left, top); cv.fillNatural(end - 1, bottom - 1);
  return cv.toBlueprint(c.id, 'mineshaft', BP_UNDER, { landmarks });
}

// 軌道 + 礦車（舊生成器 legacy/gen/landmarks.ts 的 mineCart 規則，只看畫布）；找不到站得住的軌道格就只有軌道
function cart(cv: BpCanvas, x0: number, len: number, yTop: number): BpLandmark[] {
  const fy = yTop + 3, mid = x0 + (len >> 1);
  for (let x = x0; x < x0 + len; x++) if (cv.fg(x, fy) === T.AIR && cv.isSolid(x, fy + 1)) cv.setFg(x, fy, T.RAIL);
  const chestAt = (x: number): boolean => cv.inBounds(x, fy) && cv.fg(x, fy) === T.CHEST;
  const stand = (x: number): boolean => cv.fg(x, fy) === T.RAIL && cv.fg(x, fy - 1) === T.AIR && !chestAt(x - 1) && !chestAt(x + 1);
  for (let d = 0; d <= len >> 1; d++) for (const x of [mid - d, mid + d]) {
    if (x < x0 || x >= x0 + len || !stand(x)) continue;
    cv.setFg(x, fy, T.ORE_CART);
    return [{ x, y: fy, tile: T.ORE_CART, site: 'mineshaft' }];
  }
  return [];
}
