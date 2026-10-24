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
//   · 錨點（secret = true，家鄉的 mineshaft_secret）不接斜坡：斜坡伸到地表，會壓到上方的村莊 / 遺跡 / 空島錨點（錨點跨層相交 = RangeError）。
//     實際有斜坡的比例（Task 10 修正 1 實測）：家鄉約 6%（審查量到 6.4%；家鄉多半是錨點礦坑）、外圍約 26–28%。
//   · 沒有斜坡的礦坑一定走得進去（控制者裁決，Task 10 修正 1；同地廳隧道的做法，探測只讀噪聲與 profile、不讀已生成的區塊）：
//     ① 橫向：開口端（沒有密室的那一端）往外延長坑道到接上天然洞穴；② 往下：坑道裡挖 2 格寬、掛繩梯的豎井到下方的洞穴；
//     ③ 擲出的深度接不到就換深度再試（共 DEPTH_TRIES 個）；④ 都不行才往上挖到地表。200 個家鄉實測：橫向 40%、往下 54%、往上 0。
//     往下優先於往上的理由：家鄉的密室礦坑多半在村莊底下（1000 個種子 46% 避不開），往上通地表會壓到村莊錨點（RangeError）。
//   · BpCanvas 的回退讀取假設天然格是實心、沒有洞穴：drawMineshaft 只在「讀到不是實心」時補頂板（yTop − 1）/ 地板（yTop + 4），
//     drawRamp 只在不是實心時補每階腳下那格 → 外框整片併進 solid（箱內不挖噪聲洞穴，頂板 / 地板 / 腳下在成品裡是天然岩；礦照常換）。
//     4 列背景牆：fill.ts 在地表下 3 格起一律寫天然牆（洞穴也有），BpCanvas.wall 的回退同一條規則，所以不靠 solid。
//   · 地標（同舊生成器的 mineCart）：坑道地板上一列（yTop + 3）的空氣格、腳下實心 → 鋪軌道（T.RAIL），礦車（T.ORE_CART、site 'mineshaft'）
//     停在離坑道中央最近、頭頂空氣、左右不是箱子的軌道格。
//   · 密室的地區（Task 15 用 part 1）：密室室內 = 'secret' 箱子那列往上 6 列（箱子在室內離坑道遠的那一端數來第 3 格）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T } from '../../tiles';
import { HRng } from '../hrng';
import { CaveProbe } from '../caves';
import { LAVA_Y } from '../profile';
import { BpCanvas } from '../draw/bpCanvas';
import { drawMineshaft, drawRamp, drawSecretRoom, rampSteps, secretRoomLayout } from '../draw/mineshaft';
import { BP_UNDER, SLOT_PAD, SUB_SLOT_W, clearRange, placeX, type Blueprint, type BpCtx, type BpLandmark } from '../bpcore';

// 總寬上限（Q3）；坑道最短（縮完還短於它 = 這槽不放）
export const MINESHAFT_MAX_W = SUB_SLOT_W - 2 * SLOT_PAD, MINESHAFT_MIN_LEN = 50;
const LEN_MIN = MINESHAFT_MIN_LEN, LEN_MAX = 100, DY_MIN = 28, DY_MAX = 129, RAMP_DEPTH = 100, RAMP_PAD = 6, RW_MIN = 8, RW_MAX = 12, ROOM_PAD = 4;
// 後備豎井的寬；坑道口外那一欄的 4 列裡至少這麼多格是天然洞穴 = 接到洞穴（同地廳隧道）
const SHAFT_W = 2, CAVE_MIN = 3;
// 接到的洞穴至少這麼多格（探測的洪水填充上限；同審查的「走到外框外 ≥ 300 格」）
const CAVE_BIG = 300, REACH_X = 80, REACH_UP = 80, REACH_DOWN = 40;
// 接不到洞穴時另外試的深度數與步長（dy 在 [28, 129] 裡繞）
const DEPTH_TRIES = 4, DEPTH_STEP = 37;

// caveOpen：天然洞穴的判定（預設 CaveProbe；測試注入「全部不通」來走後備豎井）
export interface MineshaftOptions { caveOpen?: (x: number, y: number) => boolean }

// 外框必定放得下的礦坑（force）：secret = true（家鄉的 mineshaft_secret 錨點）一律有密室、不接斜坡；錨點的可用範圍放得下，不會回 null，真的放不下 = RangeError
export function buildMineshaftBp(c: BpCtx, o: { secret?: boolean } & MineshaftOptions = {}): Blueprint {
  const bp = mineshaft(c, o.secret === true, true, o);
  if (!bp) throw new RangeError(`gen2: mineshaft ${c.id} does not fit [${c.slotX0}, ${c.slotX1})`);
  return bp;
}

// 槽位表（地下層；c.slotX0 / slotX1 可以是含坑道槽避開坑道帶的一側）：放不下（主坑道避讓帶、可用範圍太窄）回 null
export function rollMineshaftBp(c: BpCtx, o: { force?: boolean } & MineshaftOptions = {}): Blueprint | null {
  return mineshaft(c, false, o.force === true, o);
}

// 接法：坑道 [x0, x0 + len)、yTop；hole > 0 = 往下的豎井挖到 hole − 1（洞穴在 hole 那一列）；up < ∞ = 往上的豎井從 up 挖起；col = 豎井左欄
interface Plan { yTop: number; x0: number; len: number; hole: number; up: number; col: number }

// ctx.ver 0 的規則
function mineshaft(c: BpCtx, anchor: boolean, force: boolean, o: MineshaftOptions): Blueprint | null {
  const p = c.profile, rng = new HRng(c.s, c.id);
  const len0 = rng.int(LEN_MIN, LEN_MAX + 1), dy = rng.int(DY_MIN, DY_MAX + 1), rampRoll = rng.chance(2), secretRoll = rng.chance(4);
  const rw = rng.int(RW_MIN, RW_MAX + 1), rightRoll = rng.chance(2);
  const surfC = p.surfaceAt((c.slotX0 + c.slotX1) >> 1), yTop0 = surfC + dy;
  const secret = anchor || secretRoll, secW = secret ? rw + ROOM_PAD : 0;
  // 錨點不接斜坡（理由：斜坡伸到地表會壓到上方的錨點 → 跨層相交 RangeError；家鄉的槽不夠讓密室礦坑全部避開表層錨點）
  let rampW = !anchor && rampRoll && dy < RAMP_DEPTH ? dy + RAMP_PAD : 0;
  const cap = Math.min(MINESHAFT_MAX_W, c.slotX1 - c.slotX0 - 2 * SLOT_PAD);
  let len0b = Math.min(len0, cap - rampW - secW);
  if (len0b < LEN_MIN) { rampW = 0; len0b = Math.min(len0, cap - secW); }
  if (len0b < LEN_MIN) return null;
  const right = rampW > 0 || rightRoll, w0 = rampW + len0b + secW;
  const bx = placeX(c, w0, force, () => true);
  if (bx === null) return null;
  // 版面（左到右）：斜坡 | 左側密室 | 坑道 | 右側密室
  const x00 = bx + rampW + (secret && !right ? secW : 0);
  const steps = rampW > 0 ? rampSteps({ x0: x00, yTop: yTop0 }, (x) => p.surfaceAt(x)) : 0, ramp = steps > 0 && steps <= rampW;
  const leftOpen = !(secret && !right), rightOpen = !(secret && right), sec = { l: secret && !right ? secW : 0, r: secret && right ? secW : 0 };
  let plan: Plan = { yTop: yTop0, x0: x00, len: len0b, hole: 0, up: Infinity, col: 0 };

  if (!ramp) {
    const probe = new CaveProbe(c.seed), memo = new Map<number, boolean>();
    const raw = o.caveOpen ?? ((x: number, y: number): boolean => y < LAVA_Y && probe.open(x, y, p.info(x)));
    const open = (x: number, y: number): boolean => {
      const k = x * 4096 + y;
      let v = memo.get(k);
      if (v === undefined) { v = y >= 0 && y < p.height && raw(x, y); memo.set(k, v); }
      return v;
    };
    // (x, y) 起的天然洞穴（4 鄰、不進外框 [bx0, bx1) × [by0, by1)、只在外框附近：左右 REACH_X 欄且不出自己的槽（鄰槽藍圖的 solid 會切斷洞穴）、
    // 上 REACH_UP 列、下 REACH_DOWN 列）至少 CAVE_BIG 格才算接到洞穴（小氣泡不算；只讀噪聲，與 fill 的挖洞同一份判定）
    const big = (x: number, y: number, bx0: number, bx1: number, by0: number, by1: number): boolean => {
      if (!open(x, y)) return false;
      const xl = Math.max(c.slotX0, bx0 - REACH_X), xr = Math.min(c.slotX1, bx1 + REACH_X), seen = new Set<number>([x * 4096 + y]), st = [x, y];
      while (st.length) {
        const cy = st.pop()!, cx = st.pop()!;
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          const k = nx * 4096 + ny;
          if (seen.has(k) || nx < xl || nx >= xr || ny < by0 - REACH_UP || ny >= by1 + REACH_DOWN || (nx >= bx0 && nx < bx1 && ny >= by0 && ny < by1) || !open(nx, ny)) continue;
          seen.add(k);
          if (seen.size >= CAVE_BIG) return true;
          st.push(nx, ny);
        }
      }
      return false;
    };
    const room = clearRange(c, bx, w0), inner = cap - secW;
    // 深度 yt 時接得到洞穴的接法；接不到 = null
    const connect = (yt: number): Plan | null => {
      const boxTop = secret ? yt - 4 : yt - 1, boxBot = secret ? yt + 7 : yt + 5;
      // ① 橫向：坑道 [l, r) 時坑道口外那一欄 x 的 4 列裡 ≥ CAVE_MIN 格是洞穴、其中一格連到夠大的洞穴。開口端往外移 n 欄
      //    （整個礦坑 = 坑道 + 密室，寬 ≤ cap；超過就把另一端（連同那端的密室）往內收，坑道仍 ≥ 50），取最小的 n（兩端平手取左）
      const mouth = (x: number, l: number, r: number): boolean => {
        let n = 0, from = -1;
        for (let y = yt; y < yt + 4; y++) if (open(x, y)) { n++; from = y; }
        return n >= CAVE_MIN && big(x, from, l - sec.l, r + sec.r, boxTop, boxBot);
      };
      const L = x00, R = x00 + len0b;
      let best: { n: number; l: number; r: number } | null = null;
      if (leftOpen) for (let n = 0; n <= L - room.x0; n++) {
        const l = L - n, r = Math.min(R, l + inner);
        if (mouth(l - 1, l, r)) { best = { n, l, r }; break; }
      }
      if (rightOpen) for (let n = 0; n <= room.x1 - R && (!best || n < best.n); n++) {
        const r = R + n, l = Math.max(L, r - inner);
        if (mouth(r, l, r)) { best = { n, l, r }; break; }
      }
      if (best) return { yTop: yt, x0: best.l, len: best.r - best.l, hole: 0, up: Infinity, col: 0 };
      // ② 往下：從開口端往內逐欄試 2 欄寬的豎井，每欄取 deep 線以上最淺、兩欄都是洞穴且連到夠大洞穴的列；選最淺的（平手取離開口端近的）。
      //    'mineshaft' 箱子那一欄不挖（箱子底下不能空；箱子位置用同一條亂數流試畫 drawMineshaft 得到）
      const dry = new BpCanvas({ x: L, y: yt - 1, w: len0b, h: 6 }, p), chest = drawMineshaft(dry, { x0: L, len: len0b, yTop: yt }, rng.clone()).chest;
      let hole = Infinity, col = 0;
      for (let k = 0; k + SHAFT_W <= len0b; k++) {
        const cx = rightOpen ? R - SHAFT_W - k : L + k;
        if (chest && chest.x >= cx && chest.x < cx + SHAFT_W) continue;
        const lim = Math.min(p.layersAt(cx).deep, p.layersAt(cx + 1).deep, LAVA_Y, hole);
        for (let y = boxBot; y < lim; y++) if (open(cx, y) && open(cx + 1, y) && big(cx, y, L - sec.l, R + sec.r, boxTop, y)) { hole = y; col = cx; break; }
      }
      return Number.isFinite(hole) ? { yTop: yt, x0: L, len: len0b, hole, up: Infinity, col } : null;
    };
    // 先試擲出的深度，接不到再試另外 DEPTH_TRIES − 1 個深度（在 [28, 129] 裡依 DEPTH_STEP 繞）
    let found: Plan | null = null;
    for (let t = 0; t < DEPTH_TRIES && !found; t++) found = connect(surfC + DY_MIN + ((dy - DY_MIN + t * DEPTH_STEP) % (DY_MAX - DY_MIN + 1)));
    // ③ 都接不到：擲出的深度、開口端（右端優先）往上挖到地表
    const col = rightOpen ? x00 + len0b - SHAFT_W : x00;
    plan = found ?? { ...plan, col, up: Math.min(p.surfaceAt(col), p.surfaceAt(col + 1)) - 1 };
  }

  const { yTop, x0, len } = plan;
  const lay = { shaftX0: x0, shaftLen: len, yTop, right, rw }, shell = secretRoomLayout(lay).shell;
  const left = ramp ? x0 - steps : secret && !right ? shell.x : x0, end = secret && right ? shell.x + shell.w : x0 + len;
  const top = Math.min(secret ? shell.y : yTop - 1, ramp ? yTop - steps : Infinity, plan.up), bottom = Math.max(secret ? shell.y + shell.h : yTop + 5, plan.hole);
  const cv = new BpCanvas({ x: left, y: top, w: end - left, h: bottom - top }, p);
  drawMineshaft(cv, { x0, len, yTop }, rng);
  if (ramp) drawRamp(cv, { x0, yTop }, (x) => p.surfaceAt(x));
  if (secret) drawSecretRoom(cv, lay, rng);
  const sc = plan.col;
  if (Number.isFinite(plan.up)) {
    // 往上的豎井：[col, col + 2) 從地表上一格挖到坑道頂板（含），繩梯從地表垂到坑道地板上一格
    for (let y = plan.up; y < yTop; y++) for (let x = sc; x < sc + SHAFT_W; x++) { cv.setFg(x, y, T.AIR); cv.clearLiquid(x, y); }
    for (let y = plan.up + 1; y <= yTop + 2; y++) cv.setFg(sc, y, T.ROPE);
  }
  if (plan.hole) {
    // 往下的豎井：[col, col + 2) 從坑道地板挖到洞穴上一列，繩梯從坑道站立列垂到洞穴上一列
    for (let y = yTop + 4; y < plan.hole; y++) for (let x = sc; x < sc + SHAFT_W; x++) { cv.setFg(x, y, T.AIR); cv.clearLiquid(x, y); }
    for (let y = yTop + 3; y < plan.hole; y++) cv.setFg(sc, y, T.ROPE);
  }
  // 軌道與礦車在豎井之後鋪（往下的豎井那兩欄地板挖掉了，不鋪軌道；往上的豎井那欄有繩梯，礦車不停在那裡）
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
