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
//     外圍（荒野大陸，Task 21）沒有斜坡的礦坑一律直接 ④（從地表走得到；比照外圍地廳的繩梯豎井，Task 18 裁決 2）。
//     ④ 的豎井欄從開口端往內找第一個不碰 surfaceBan（家鄉表層錨點的部件，Task 11 修正 2）的，坑道裡都碰到就把開口端往外延長到不碰的欄；
//     有豎井（往上 / 往下）時藍圖帶部件 = 主體 + 豎井那兩欄（跨層判定用部件；fill 的 solid 也只算部件內，豎井旁的洞穴不再被抹掉）
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
import { BP_UNDER, SLOT_PAD, SUB_SLOT_W, boxHits, clearRange, placeX, type Blueprint, type BpCtx, type BpLandmark } from '../bpcore';

// 總寬上限（Q3）；坑道最短（縮完還短於它 = 這槽不放）
export const MINESHAFT_MAX_W = SUB_SLOT_W - 2 * SLOT_PAD, MINESHAFT_MIN_LEN = 50;
const LEN_MIN = MINESHAFT_MIN_LEN, LEN_MAX = 100, DY_MIN = 28, DY_MAX = 129, RAMP_DEPTH = 100, RAMP_PAD = 6, RW_MIN = 8, RW_MAX = 12, ROOM_PAD = 4;
// 後備豎井的寬；坑道口外那一欄的 4 列裡至少這麼多格是天然洞穴 = 接到洞穴（同地廳隧道）
const SHAFT_W = 2, CAVE_MIN = 3;
// 接到的洞穴至少這麼多格（探測的洪水填充上限；同審查的「走到外框外 ≥ 300 格」）
const CAVE_BIG = 300, REACH_X = 80, REACH_UP = 80, REACH_DOWN = 40;
// 接不到洞穴時另外試的深度數與步長（dy 在 [28, 129] 裡繞）
const DEPTH_TRIES = 4, DEPTH_STEP = 37;

// big() 走過的格（模組層共用；見 mineshaft() 裡的 big）
let bigSeen = new Uint32Array(0), bigEpoch = 0;

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
    // 走過的格（Task 21 效能：原本是 Set<number>；走法、順序與結果相同。起點不在範圍內時 Set 版仍把它算 1 格，這裡照算）：
    // 模組層共用的 Uint32Array 記「第幾次呼叫走過」（epoch，同 miniBiome.linksToCave）；open 是純噪聲探針，不會重入 big
    const big = (x: number, y: number, bx0: number, bx1: number, by0: number, by1: number): boolean => {
      if (!open(x, y)) return false;
      const xl = Math.max(c.slotX0, bx0 - REACH_X), xr = Math.min(c.slotX1, bx1 + REACH_X), ry0 = by0 - REACH_UP, ry1 = by1 + REACH_DOWN;
      const W = Math.max(0, xr - xl), size = W * Math.max(0, ry1 - ry0), st = [x, y];
      if (bigSeen.length < size) { bigSeen = new Uint32Array(size); bigEpoch = 0; }
      if (++bigEpoch === 0x100000000) { bigSeen.fill(0); bigEpoch = 1; }
      const seen = bigSeen, e = bigEpoch;
      const inR = (px: number, py: number): boolean => px >= xl && px < xr && py >= ry0 && py < ry1;
      // 起點在範圍內 → 記；不在 → 範圍內的鄰格不會再推它（Set 版的 seen 只擋重複，範圍外的格本來就不會被推）
      if (inR(x, y)) seen[(y - ry0) * W + x - xl] = e;
      let n = 1;
      while (st.length) {
        const cy = st.pop()!, cx = st.pop()!;
        for (let d = 0; d < 4; d++) {
          const nx = d === 0 ? cx - 1 : d === 1 ? cx + 1 : cx, ny = d === 2 ? cy - 1 : d === 3 ? cy + 1 : cy;
          if (!inR(nx, ny)) continue;
          const i = (ny - ry0) * W + nx - xl;
          if (seen[i] === e || (nx >= bx0 && nx < bx1 && ny >= by0 && ny < by1) || !open(nx, ny)) continue;
          seen[i] = e;
          if (++n >= CAVE_BIG) return true;
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
    // 先試擲出的深度，接不到再試另外 DEPTH_TRIES − 1 個深度（在 [28, 129] 裡依 DEPTH_STEP 繞）。
    // 外圍（荒野大陸，Task 21）不接洞穴、一律走 ③ 往上挖到地表：洞穴網不保證連到地表（外圍礦坑實測只有約 1/3 從地表走得到——幾乎都是有斜坡的），
    // 比照外圍地廳一律有通地表的繩梯豎井（Task 18 裁決 2）
    let found: Plan | null = null;
    if (c.region.kind === 'home') for (let t = 0; t < DEPTH_TRIES && !found; t++) found = connect(surfC + DY_MIN + ((dy - DY_MIN + t * DEPTH_STEP) % (DY_MAX - DY_MIN + 1)));
    // ③ 都接不到：擲出的深度往上挖到地表。豎井欄從開口端（右端優先）往內找第一個豎井部件 [col, col + 2) × [地表上一列, 坑道頂)
    //    不碰 surfaceBan（家鄉表層錨點，Task 11 修正 2）的；坑道裡都碰到 → 開口端往外延長坑道（同 ① 的延長法，寬 ≤ cap、不出 room）
    //    到第一個不碰的欄；都不行 → 放不下（回 null；錨點丟 RangeError）
    if (!found) {
      const ban = c.surfaceBan ?? [], upAt = (x: number): number => Math.min(p.surfaceAt(x), p.surfaceAt(x + 1)) - 1;
      const free = (x: number): boolean => !boxHits({ x, y: upAt(x), w: SHAFT_W, h: yTop0 - upAt(x) }, ban);
      const L = x00, R = x00 + len0b;
      let pick: Plan | null = null;
      for (let k = 0; k + SHAFT_W <= len0b && !pick; k++) { const x = rightOpen ? R - SHAFT_W - k : L + k; if (free(x)) pick = { ...plan, col: x, up: upAt(x) }; }
      if (rightOpen) for (let n = 1; !pick && R + n <= room.x1; n++) {
        const r = R + n, l = Math.max(L, r - inner);
        if (free(r - SHAFT_W)) pick = { ...plan, x0: l, len: r - l, col: r - SHAFT_W, up: upAt(r - SHAFT_W) };
      }
      if (leftOpen) for (let n = 1; !pick && L - n >= room.x0; n++) {
        const l = L - n, r = Math.min(R, l + inner);
        if (free(l)) pick = { ...plan, x0: l, len: r - l, col: l, up: upAt(l) };
      }
      if (!pick) return null;
      plan = pick;
    } else plan = found;
  }

  const { yTop, x0, len } = plan;
  const lay = { shaftX0: x0, shaftLen: len, yTop, right, rw }, shell = secretRoomLayout(lay).shell;
  const left = ramp ? x0 - steps : secret && !right ? shell.x : x0, end = secret && right ? shell.x + shell.w : x0 + len;
  const top = Math.min(secret ? shell.y : yTop - 1, ramp ? yTop - steps : Infinity, plan.up), bottom = Math.max(secret ? shell.y + shell.h : yTop + 5, plan.hole);
  const cv = new BpCanvas({ x: left, y: top, w: end - left, h: bottom - top }, p);
  drawMineshaft(cv, { x0, len, yTop }, rng);
  if (ramp) drawRamp(cv, { x0, yTop }, (x) => p.surfaceAt(x));
  const sroom = secret ? drawSecretRoom(cv, lay, rng) : null;
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
  // floors（Task 14，給石碑）：坑道站立列（yTop + 3）與密室地板列的空氣格、頭頂空氣、腳下實心（外框整片 solid，腳下的天然岩在成品裡也是實心）；
  // 坑道的在鋪軌道之前算（軌道鋪滿站立列，石碑蓋掉那一格軌道）。密室室內記進 secret（lore.homeDecor 分開密室與坑道的石碑）
  const stand = (x: number, y: number): boolean => cv.fg(x, y) === T.AIR && cv.fg(x, y - 1) === T.AIR && cv.isSolid(x, y + 1);
  const floors: { x: number; y: number }[] = [];
  for (let x = x0; x < x0 + len; x++) if (stand(x, yTop + 3)) floors.push({ x, y: yTop + 3 });
  if (sroom) for (let x = sroom.x; x < sroom.x + sroom.w; x++) if (stand(x, sroom.chest.y)) floors.push({ x, y: sroom.chest.y });
  // 軌道與礦車在豎井之後鋪（往下的豎井那兩欄地板挖掉了，不鋪軌道；往上的豎井那欄有繩梯，礦車不停在那裡）
  const landmarks = cart(cv, x0, len, yTop);
  const lm = landmarks[0], fl = lm ? floors.filter((f) => f.x !== lm.x || f.y !== lm.y) : floors;
  // 免挖洞箱 = 整個外框（BpBox 是外接矩形，兩個角就夠）；有豎井時 fill 只算與部件相交的部分（bpcore.solidParts）
  cv.fillNatural(left, top); cv.fillNatural(end - 1, bottom - 1);
  const bp = cv.toBlueprint(c.id, 'mineshaft', BP_UNDER, { landmarks, floors: fl });
  if (sroom) bp.secret = { x: sroom.x, y: sroom.y, w: sroom.w, h: sroom.h };
  // 部件（Task 11 修正 2）：有往上 / 往下的豎井時 = 主體（斜坡、密室、坑道的外接矩形）+ 豎井那兩欄；部件外的格都沒畫（KEEP）。
  // 理由：豎井把外框拉到地表 / 洞穴，整片外框會壓到上方的村莊（rv-1247 → 開機 RangeError）、抹掉下方的洞穴（solid）
  const mainTop = Math.min(secret ? shell.y : yTop - 1, ramp ? yTop - steps : Infinity), mainBot = secret ? shell.y + shell.h : yTop + 5;
  const main = { x: left, y: mainTop, w: end - left, h: mainBot - mainTop };
  if (Number.isFinite(plan.up)) bp.parts = [main, { x: sc, y: plan.up, w: SHAFT_W, h: mainTop - plan.up }];
  else if (plan.hole > mainBot) bp.parts = [main, { x: sc, y: mainBot, w: SHAFT_W, h: plan.hole - mainBot }];
  return bp;
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
