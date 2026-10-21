// liquid.ts — 液體元胞自動機（水 / 熔岩 / 蜂蜜）。「活躍格清單 + 先落後攤平」模型：
//   · 每格液體量 0..255 + 種類（world.getLiquid / getLiquidType）。只更新「活躍格」：每種液體一條 FIFO 佇列
//     （存 tile 鍵 world.idx(x, y) 的 Float64Array 環形緩衝——外圍鍵超過 int32；每格一個 inQ 旗標避免重複，
//     存在 TileFlags）；佇列滿了排進溢出區，有空位再補回去。鄰格一律用座標讀寫，世界外 = 實心（getFg 回 STONE）。
//   · 單格更新：① 往下落：下方非實心、同種或空 → 盡量往下倒；② 落不完（下方滿 / 實心 / 別種液體）→ 與左右
//     可流入的鄰格平均（整數，餘數留在中央 → 質量守恆、沒有左右偏差）；③ 平均後中央 < 3 → 蒸發 1（薄膜會乾掉）。
//     有改變 → 本格與被改的鄰格，連同它們上 / 左 / 右能流進來的液體格都重新排入（湖底挖穿時整湖才會跟著補過去）；沒改變 → kill+1，連續 RETIRE_AFTER 次沒變就退休（不再更新）。
//   · 水每刻更新；熔岩每 LAVA_EVERY 刻、蜂蜜每 HONEY_EVERY 刻（比較黏）。
//   · 每刻每條佇列最多處理 budget 格（確定性的時間切片）；可另設 timeBudgetMs（瀏覽器用，超時就留到下一刻）。
//     溢出區連續 PANIC_TICKS 刻都還有東西 → 「靜置模式」：預算 ×4 直到清空（大洪水追進度）。
//   · 反應：水 ↔ 熔岩 → 熔岩那格變黑曜石；蜂蜜 ↔ 熔岩 → 酥蜜塊；兩邊各消耗掉熔岩的量。水與蜂蜜不相溶（互相擋住）。
//   · 實心方塊蓋進液體格 → 該格液體消失。world.setFg 會透過 onTileChange 喚醒鄰格（挖開水壩就會流）。
// 全部整數運算、固定處理順序 → 同樣的輸入得到同樣的結果。
import type { TileWindow } from './world';
import { LIQ, LIQ_MAX } from './liquidKind';
import { SOLID_LUT, T } from './tiles';
import { tileKeyX, tileKeyY } from './coords';
import { CHUNK } from './constants';
import { TileFlags } from './tileFlags';

/**
 * 液體模擬需要的世界介面（與儲存無關）。World（Task 5 後的欄實作）與 GenGrid（舊扁平類別）都要滿足。
 * 越界讀取：getFg = STONE（實心）、getLiquid = 0、getLiquidType = NONE、isFrozen = false；越界寫入被丟掉。
 */
export interface LiquidWorld {
  readonly width: number; readonly height: number; readonly chunksX: number; xMin: number; xMax: number;
  inBounds(x: number, y: number): boolean; idx(x: number, y: number): number; tileXY(k: number): { x: number; y: number };
  getFg(x: number, y: number): number; getLiquid(x: number, y: number): number; getLiquidType(x: number, y: number): number;
  isFrozen(x: number, y: number): boolean; setLiquidRaw(x: number, y: number, a: number, t: number): void;
  touchLiquidAt(x: number, y: number): void; onTileChange: ((x: number, y: number) => void) | null;
  window(x0: number, y0: number, w: number, h: number, out?: TileWindow): TileWindow;
  // 倒液體 / 反應用
  isSolid(x: number, y: number): boolean;
  setFg(x: number, y: number, id: number): boolean;
  setLiquid(x: number, y: number, amount: number, type: number): boolean;
}

export const LAVA_EVERY = 5;
export const HONEY_EVERY = 10;
/** 連續幾次更新沒變化就退休 */
export const RETIRE_AFTER = 8;
/** 每刻每條佇列最多處理幾格 */
export const DEFAULT_BUDGET = 3000;
/** 每條佇列的容量（活躍格上限；超過的進溢出區） */
export const DEFAULT_CAP = 1 << 16;
/** 溢出區持續這麼多刻 → 靜置模式（預算 ×4） */
export const PANIC_TICKS = 600;
/** 熔岩量至少這麼多才會在反應時留下方塊（太少只會冒煙消失） */
export const REACT_MIN = 24;

// ── 泉水 / 滲水石（瀑布）：泉水石每刻往崖外的空格出 SPRING_RATE 的液體（熔岩照熔岩節奏）；
//    滲水石每刻從上 / 左 / 右鄰格吸走最多 DRAIN_RATE（溢流排水）。總量的上限：
//    ① 每座泉水的區域（box）總量到 cap 就停水（滲水石被堵住也不會無限淹）；
//    ② 欠量 debt = 出水 − 它的滲水石排掉的量；超過 SPRING_SLACK 就停水（水被引到區域外時不會無限流），
//       停水時 debt 每 SPRING_DECAY_EVERY 刻 −1（最多一點點涓流）。
export const SPRING_RATE: Record<number, number> = { [LIQ.WATER]: 40, [LIQ.LAVA]: 30, [LIQ.HONEY]: 20 };
export const DRAIN_RATE = 96;
export const SPRING_SLACK = 255 * 256;
export const SPRING_DECAY_EVERY = 4;
/** 每幾刻重算一次區域總量 */
const BOX_EVERY = 8;
export interface SpringSpec {
  x: number; y: number;
  /** LIQ.* */
  type: number;
  /** 區域（tile，x1 / y1 不含）與區域總量上限 */
  box: { x0: number; y0: number; x1: number; y1: number };
  cap: number;
  /** 這座泉水的滲水石 */
  drains: { x: number; y: number }[];
}
/** 執行期的泉水：i = 泉水格的 tile 鍵、drains = 滲水石的 tile 鍵（world.idx） */
interface SpringRt { i: number; type: number; tile: number; box: SpringSpec['box']; cap: number; drains: number[]; debt: number; boxTotal: number; side: number; }

export type ReactionKind = 'obsidian' | 'honeycrisp' | 'steam';
export interface LiquidEvent { x: number; y: number; kind: ReactionKind; }
export interface LiquidOptions { budget?: number; cap?: number; }
export interface LiquidStats {
  /** 上一刻處理了幾格 */
  processed: number;
  /** 上一刻花了幾 ms（只有 timeBudgetMs > 0 或 measure 時才量） */
  ms: number;
  /** 是否在靜置模式 */
  panic: boolean;
}

class Queue {
  /** tile 鍵（外圍鍵超過 int32 → Float64Array） */
  readonly buf: Float64Array;
  head = 0;
  len = 0;
  constructor(readonly cap: number) { this.buf = new Float64Array(cap); }
  push(i: number): boolean {
    if (this.len >= this.cap) return false;
    this.buf[(this.head + this.len) % this.cap] = i;
    this.len++;
    return true;
  }
  shift(): number {
    const v = this.buf[this.head];
    this.head = (this.head + 1) % this.cap;
    this.len--;
    return v;
  }
  /** 只留下 keep(鍵) 為真的（保持順序；欄卸載時用） */
  filter(keep: (k: number) => boolean): void {
    let n = 0;
    for (let k = 0; k < this.len; k++) {
      const v = this.buf[(this.head + k) % this.cap];
      if (keep(v)) this.buf[(this.head + n++) % this.cap] = v;
    }
    this.len = n;
  }
}

/** 溢出區：陣列 + 讀取指標（FIFO，偶爾壓縮） */
class Overflow {
  items: number[] = [];
  head = 0;
  get size(): number { return this.items.length - this.head; }
  push(i: number): void { this.items.push(i); }
  shift(): number {
    const v = this.items[this.head++];
    if (this.head > 4096 && this.head * 2 > this.items.length) { this.items = this.items.slice(this.head); this.head = 0; }
    return v;
  }
  /** 只留下 keep(鍵) 為真的（保持順序） */
  filter(keep: (k: number) => boolean): void {
    this.items = this.items.slice(this.head).filter(keep);
    this.head = 0;
  }
}

export class LiquidSim {
  /** 已模擬的刻數（熔岩 / 蜂蜜的節奏依它） */
  tick = 0;
  budget: number;
  /** 每刻的時間預算（ms，0 = 不限；只在瀏覽器設定，測試保持確定性） */
  timeBudgetMs = 0;
  /** 量測每刻耗時（debug / perf） */
  measure = false;
  readonly stats: LiquidStats = { processed: 0, ms: 0, panic: false };
  private readonly qs: Queue[];
  private readonly over: Overflow[] = [new Overflow(), new Overflow(), new Overflow()];
  /** 每格：是否已排入佇列 */
  private readonly inQ: TileFlags;
  /** 每格：連續幾次更新沒變化 */
  private readonly kill: TileFlags;
  private events: LiquidEvent[] = [];
  /** (x,y) 有身體（玩家）：反應不放方塊（只冒煙），倒液體不反應——避免把人封進黑曜石 */
  blocked: ((x: number, y: number) => boolean) | null = null;
  private overTicks = 0;
  private quick = false;
  /** 攤平用的鄰格 x 暫存（本格 + 左右各 2；都在本格那一列） */
  private readonly nb = new Int32Array(5);
  private readonly old = new Int32Array(5);
  private readonly extra = new Uint8Array(5);
  private springs: SpringRt[] = [];
  private springOut = 0;
  private springDrained = 0;
  /** keyXY 的輸出（不配置物件） */
  private kx = 0;
  private ky = 0;

  constructor(readonly world: LiquidWorld, opts: LiquidOptions = {}) {
    const cap = opts.cap ?? DEFAULT_CAP;
    this.budget = opts.budget ?? DEFAULT_BUDGET;
    this.qs = [new Queue(cap), new Queue(cap), new Queue(cap)];
    this.inQ = new TileFlags(world.chunksX);
    this.kill = new TileFlags(world.chunksX);
    world.onTileChange = (x, y) => this.wake(x, y);
  }

  /** 排入佇列中的格數（不含溢出區） */
  get queuedCount(): number { return this.qs[0].len + this.qs[1].len + this.qs[2].len; }
  /** 所有活躍格（佇列 + 溢出區） */
  get activeCount(): number { return this.queuedCount + this.over[0].size + this.over[1].size + this.over[2].size; }

  /** tile 鍵 → (this.kx, this.ky)，就地解碼、不配置物件（與 coords.ts tileXY 同一套算術：中央 / 外圍兩段） */
  private keyXY(k: number): void {
    this.kx = tileKeyX(this.world.width, k);
    this.ky = tileKeyY(this.world.width, k);
  }

  /** 把 (x,y) 排入（有液體且還沒排入時；世界外沒有液體 → 不排） */
  private enqueue(x: number, y: number): void {
    // 先看 inQ（TileFlags 任何座標都能讀，世界外恆 0）：大多數呼叫落在已排入的格，省兩次 getter
    if (this.inQ.get(x, y)) return;
    const w = this.world;
    const t = w.getLiquidType(x, y);
    if (t === LIQ.NONE || w.getLiquid(x, y) === 0) return;
    this.inQ.set(x, y, 1);
    const k = w.idx(x, y);
    if (!this.qs[t - 1].push(k)) this.over[t - 1].push(k);
  }
  /** (x,y) 有液體就排入 */
  add(x: number, y: number): void {
    if (this.world.inBounds(x, y)) this.enqueue(x, y);
  }
  /** 喚醒 (x,y) 與上下左右的液體格（挖掘 / 放置 / 倒水後） */
  wake(x: number, y: number): void {
    this.add(x, y); this.add(x - 1, y); this.add(x + 1, y); this.add(x, y - 1); this.add(x, y + 1);
  }
  /** 喚醒矩形內所有液體格（tile 座標，x1 / y1 不含；夾在 [xMin, xMax) × [0, height)） */
  wakeRect(x0: number, y0: number, x1: number, y1: number): void {
    const w = this.world;
    const ax = Math.max(w.xMin, x0), ay = Math.max(0, y0), bx = Math.min(w.xMax, x1), by = Math.min(w.height, y1);
    for (let y = ay; y < by; y++) {
      for (let x = ax; x < bx; x++) if (w.getLiquid(x, y)) this.enqueue(x, y);
    }
  }
  /** 喚醒全世界的液體格 */
  // TODO(Task 8)：無限世界的 [xMin, xMax) 是 ±X_LIMIT，這裡必須改成只掃常駐的欄
  wakeAll(): void { this.wakeRect(this.world.xMin, 0, this.world.xMax, this.world.height); }

  /**
   * 第 cx 欄卸載：丟掉那欄的 inQ / kill 旗標，並把那欄的格從佇列 / 溢出區拿掉（順序不變）。
   * 重新載入後由喚醒重新排入。
   */
  forgetColumn(cx: number): void {
    const x0 = cx * CHUNK, x1 = x0 + CHUNK;
    const keep = (k: number): boolean => { this.keyXY(k); return this.kx < x0 || this.kx >= x1; };
    for (const q of this.qs) q.filter(keep);
    for (const o of this.over) o.filter(keep);
    this.inQ.dropColumn(cx);
    this.kill.dropColumn(cx);
  }

  drainEvents(): LiquidEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** 設定世界的泉水（世界生成給的；載入時重設） */
  setSprings(list: readonly SpringSpec[]): void {
    const w = this.world;
    this.springs = list.map((s) => ({
      i: w.idx(s.x, s.y), type: s.type, tile: s.type === LIQ.LAVA ? T.LAVA_SPRING : T.SPRING, box: s.box, cap: s.cap,
      drains: s.drains.map((d) => w.idx(d.x, d.y)), debt: 0, boxTotal: -1, side: 0,
    }));
  }
  get springCount(): number { return this.springs.length; }
  /** 累計出水 / 排水量（debug / 測試） */
  springStats(): { emitted: number; drained: number } { return { emitted: this.springOut, drained: this.springDrained }; }

  private boxTotal(b: SpringSpec['box']): number {
    const w = this.world;
    let s = 0;
    const x0 = Math.max(w.xMin, b.x0), x1 = Math.min(w.xMax, b.x1), y0 = Math.max(0, b.y0), y1 = Math.min(w.height, b.y1);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += w.getLiquid(x, y);
    return s;
  }

  /** 滲水石 (dx,dy) 吸鄰格 (x,y) 的液體（上 / 左 / 右各叫一次） */
  private drainAt(sp: SpringRt, x: number, y: number, lavaTick: boolean): void {
    const w = this.world;
    const a = w.getLiquid(x, y);
    if (!a || w.isFrozen(x, y)) return;
    const lt = w.getLiquidType(x, y);
    if (lt === LIQ.LAVA && !lavaTick) return;
    const k = Math.min(a, DRAIN_RATE);
    const left = a - k;
    w.setLiquidRaw(x, y, left, left ? lt : LIQ.NONE);
    w.touchLiquidAt(x, y);
    this.kill.set(x, y, 0);
    this.enqueue(x, y);
    this.enqueue(x, y - 1);
    this.enqueue(x - 1, y); this.enqueue(x + 1, y);
    sp.debt = Math.max(0, sp.debt - k);
    this.springDrained += k;
  }

  /** 泉水能出水到 (x,y)：非實心、沒結冰、空或同種、還沒滿（世界外 = 實心） */
  private springOk(x: number, y: number, type: number): boolean {
    const w = this.world;
    if (SOLID_LUT[w.getFg(x, y)] === 1 || w.isFrozen(x, y)) return false;
    const a = w.getLiquid(x, y), lt = w.getLiquidType(x, y);
    return (lt === LIQ.NONE || lt === type || a === 0) && a < LIQ_MAX;
  }

  /** 泉水出水 + 滲水石排水（每刻；熔岩泉照熔岩節奏） */
  private runSprings(t: number): void {
    const w = this.world;
    for (const sp of this.springs) {
      const lavaTick = sp.type !== LIQ.LAVA || t % LAVA_EVERY === 0;
      // 滲水石：吸上 / 左 / 右的液體
      for (const d of sp.drains) {
        this.keyXY(d);
        const dx = this.kx, dy = this.ky;
        if (w.getFg(dx, dy) !== T.DRAIN) continue;
        this.drainAt(sp, dx, dy - 1, lavaTick);
        this.drainAt(sp, dx - 1, dy, lavaTick);
        this.drainAt(sp, dx + 1, dy, lavaTick);
      }
      this.keyXY(sp.i);
      const x = this.kx, y = this.ky;
      if (!lavaTick || w.getFg(x, y) !== sp.tile) continue;
      if (sp.boxTotal < 0 || t % BOX_EVERY === 0) sp.boxTotal = this.boxTotal(sp.box);
      if (sp.debt > SPRING_SLACK) { if (t % SPRING_DECAY_EVERY === 0) sp.debt--; continue; }
      if (sp.boxTotal >= sp.cap) continue;
      // 出水格：下 → 左右（兩邊都開就輪流）
      const rate = SPRING_RATE[sp.type] ?? 20;
      let jx = 0, jy = 0, found = false;
      if (this.springOk(x, y + 1, sp.type)) { jx = x; jy = y + 1; found = true; }
      else {
        const l = this.springOk(x - 1, y, sp.type), r = this.springOk(x + 1, y, sp.type);
        if (l && r) { sp.side ^= 1; jx = sp.side ? x - 1 : x + 1; jy = y; found = true; }
        else if (l) { jx = x - 1; jy = y; found = true; } else if (r) { jx = x + 1; jy = y; found = true; }
      }
      if (!found) continue;
      const a = w.getLiquid(jx, jy);
      const k = Math.min(rate, LIQ_MAX - a);
      w.setLiquidRaw(jx, jy, a + k, sp.type);
      w.touchLiquidAt(jx, jy);
      this.kill.set(jx, jy, 0);
      this.enqueue(jx, jy);
      sp.debt += k; sp.boxTotal += k;
      this.springOut += k;
    }
  }

  /** 模擬一刻 */
  step(): void {
    const t = this.tick;
    const timed = this.timeBudgetMs > 0 || this.measure;
    const t0 = timed ? performance.now() : 0;
    if (this.springs.length) this.runSprings(t);
    const anyOver = this.over[0].size + this.over[1].size + this.over[2].size > 0;
    this.overTicks = anyOver ? this.overTicks + 1 : 0;
    this.stats.panic = this.overTicks > PANIC_TICKS;
    const budget = this.stats.panic ? this.budget * 4 : this.budget;
    let processed = this.runList(LIQ.WATER, budget, t0);
    if (t % LAVA_EVERY === 0) processed += this.runList(LIQ.LAVA, budget, t0);
    if (t % HONEY_EVERY === 0) processed += this.runList(LIQ.HONEY, budget, t0);
    this.stats.processed = processed;
    if (timed) this.stats.ms = performance.now() - t0;
    this.tick++;
  }

  /**
   * 快速靜置：每刻三種液體都更新、不限預算，直到沒有活躍格或到 maxTicks。世界生成 / 載入用。
   * 回傳模擬了幾刻、處理了幾格、耗時。
   */
  settle(maxTicks: number): { ticks: number; processed: number; ms: number } {
    const t0 = performance.now();
    this.quick = true;
    let ticks = 0, processed = 0;
    while (ticks < maxTicks && this.activeCount > 0) {
      for (const type of [LIQ.WATER, LIQ.LAVA, LIQ.HONEY]) processed += this.runList(type, Infinity, 0);
      ticks++;
    }
    this.quick = false;
    return { ticks, processed, ms: performance.now() - t0 };
  }

  private runList(type: number, budget: number, t0: number): number {
    const q = this.qs[type - 1], ov = this.over[type - 1];
    while (ov.size > 0 && q.len < q.cap) q.push(ov.shift());
    const n = Math.min(q.len, budget);
    const tb = this.quick ? 0 : this.timeBudgetMs;
    let k = 0;
    for (; k < n; k++) {
      if (tb > 0 && (k & 255) === 255 && performance.now() - t0 > tb) break;
      this.keyXY(q.shift());
      const x = this.kx, y = this.ky;
      this.inQ.set(x, y, 0);
      this.update(x, y);
    }
    return k;
  }

  /** (x,y) 對液體種類 t 是否可流入：0 = 實心 / 結冰（含世界外）、1 = 空或同種、2 = 別種液體 */
  private open(x: number, y: number, t: number): number {
    const w = this.world;
    if (SOLID_LUT[w.getFg(x, y)] === 1 || w.isFrozen(x, y)) return 0;
    const lt = w.getLiquidType(x, y);
    return lt === LIQ.NONE || lt === t || w.getLiquid(x, y) === 0 ? 1 : 2;
  }

  /** 單格更新（見檔頭） */
  private update(x: number, y: number): void {
    const w = this.world;
    let a = w.getLiquid(x, y);
    const t = w.getLiquidType(x, y);
    // 結冰格不流動（融化時 frost.ts 會喚醒）
    if (w.isFrozen(x, y)) { this.kill.set(x, y, 0); return; }
    if (a === 0 || t === LIQ.NONE) { w.setLiquidRaw(x, y, 0, LIQ.NONE); this.kill.set(x, y, 0); return; }
    if (SOLID_LUT[w.getFg(x, y)] === 1) { w.setLiquidRaw(x, y, 0, LIQ.NONE); this.kill.set(x, y, 0); w.touchLiquidAt(x, y); return; }
    const a0 = a;
    let changed = false;
    // ① 往下落（世界底下 = 實心）
    const by = y + 1;
    if (SOLID_LUT[w.getFg(x, by)] !== 1 && !w.isFrozen(x, by)) {
      const tb = w.getLiquidType(x, by), lb = w.getLiquid(x, by);
      if (tb === LIQ.NONE || tb === t || lb === 0) {
        const room = LIQ_MAX - lb;
        if (room > 0) {
          const mv = room < a ? room : a;
          w.setLiquidRaw(x, by, lb + mv, t); a -= mv;
          w.touchLiquidAt(x, by); this.enqueue(x, by);
          changed = true;
        }
      } else if (this.react(x, y, x, by)) { this.afterChange(x, y); return; }
    }
    // ② 左右攤平：與左右各最多 2 格連續可流入的格平均（見 spread）
    if (a > 0) {
      const ol = this.open(x - 1, y, t), or = this.open(x + 1, y, t);
      if (ol === 2 && this.react(x, y, x - 1, y)) { this.afterChange(x, y); return; }
      if (or === 2 && this.react(x, y, x + 1, y)) { this.afterChange(x, y); return; }
      const nb = this.nb;
      let n = 0;
      nb[n++] = x;
      if (ol === 1) { nb[n++] = x - 1; if (this.open(x - 2, y, t) === 1) nb[n++] = x - 2; }
      if (or === 1) { nb[n++] = x + 1; if (this.open(x + 2, y, t) === 1) nb[n++] = x + 2; }
      if (n > 1) {
        w.setLiquidRaw(x, y, a, t);
        if (this.spread(n, y, t)) changed = true;
        a = w.getLiquid(x, y);
      }
      // 薄膜蒸發：停住的格量 < 3、周圍也都很少 → 少 1
      if (a > 0 && a < 3 && this.resting(x, y, t)) {
        let thin = true;
        for (let k = 1; k < n; k++) if (w.getLiquid(nb[k], y) >= 3) { thin = false; break; }
        if (thin) a--;
      }
    }
    if (a !== a0) changed = true;
    w.setLiquidRaw(x, y, a, a === 0 ? LIQ.NONE : t);
    if (changed) {
      w.touchLiquidAt(x, y);
      this.afterChange(x, y);
    } else {
      const kc = this.kill.get(x, y) + 1;
      this.kill.set(x, y, kc);
      if (kc < RETIRE_AFTER) this.enqueue(x, y);
      else this.kill.set(x, y, 0);
    }
  }

  /**
   * 把 nb[0..n) 這幾格（第 y 列）的液體平均分配：每格 floor(總量 / n)，餘數給「原本量最多」的格（同量依 nb 順序）。
   * 這是與原狀態差異最小的整數分配 → 已經平均（最大最小差 ≤ 1）時完全不變；否則平方和嚴格下降 → 不會來回震盪。
   * nb[0] 是本格（呼叫端已把本格目前量寫進世界）。鄰格有變就排入。回傳是否有改變。
   */
  private spread(n: number, y: number, t: number): boolean {
    const w = this.world, nb = this.nb, old = this.old;
    let total = 0, mx = 0, mn = LIQ_MAX;
    for (let k = 0; k < n; k++) { const v = w.getLiquid(nb[k], y); old[k] = v; total += v; if (v > mx) mx = v; if (v < mn) mn = v; }
    if (mx - mn <= 1) return false;
    const avg = (total / n) | 0;
    let rem = total - avg * n;
    // 依原量由多到少挑 rem 格 +1（n ≤ 5，直接選）
    const extra = this.extra;
    extra.fill(0);
    while (rem > 0) {
      let best = -1;
      for (let k = 0; k < n; k++) if (!extra[k] && (best < 0 || old[k] > old[best])) best = k;
      extra[best] = 1; rem--;
    }
    let changed = false;
    for (let k = 0; k < n; k++) {
      const v = avg + extra[k];
      if (v === old[k]) continue;
      changed = true;
      // 本格只改量（種類照舊是 t；v ≥ 1：餘數優先給原量最多、同量先給本格，本格原量 ≥ 1）
      if (k === 0) { w.setLiquidRaw(nb[0], y, v, t); continue; }
      this.setSide(nb[k], y, v, t);
    }
    return changed;
  }

  /** 下方擋住（實心 / 結冰 / 滿 / 別種液體；世界底下 = 實心）→ 液體停在這格。t = 本格種類 */
  private resting(x: number, y: number, t: number): boolean {
    const w = this.world, by = y + 1;
    if (SOLID_LUT[w.getFg(x, by)] === 1 || w.isFrozen(x, by)) return true;
    const lt = w.getLiquidType(x, by);
    return w.getLiquid(x, by) >= LIQ_MAX || (lt !== LIQ.NONE && lt !== t);
  }

  /** 本格有變：重設 kill、排入本格與能流進來的鄰格（上 / 左 / 右） */
  private afterChange(x: number, y: number): void {
    this.kill.set(x, y, 0);
    this.wakeAround(x, y);
  }

  /**
   * 排入 (x,y) 與上 / 左 / 右的液體格。格的量變了（尤其是變少、甚至落光變空）時，能流進它的鄰格都要醒來：
   * 空掉的格本身排不進佇列（enqueue 要有液體），只叫上方的話，左右已退休的湖水永遠不會補過來
   * → 挖穿湖底只有破口那一欄洩光。下方格不用叫：它不會因為上面變少而改變。世界外沒有液體 → enqueue 自己略過。
   */
  private wakeAround(x: number, y: number): void {
    this.enqueue(x, y);
    this.enqueue(x, y - 1);
    this.enqueue(x - 1, y);
    this.enqueue(x + 1, y);
  }

  private setSide(x: number, y: number, v: number, t: number): boolean {
    const w = this.world;
    const nt = v === 0 ? LIQ.NONE : t;
    if (w.getLiquid(x, y) === v && w.getLiquidType(x, y) === nt) return false;
    w.setLiquidRaw(x, y, v, nt);
    w.touchLiquidAt(x, y);
    this.kill.set(x, y, 0);
    this.wakeAround(x, y);
    return true;
  }

  /**
   * (ix,iy)（本格）與 (jx,jy)（鄰格）是不同液體：熔岩 + 水 / 蜂蜜 → 熔岩那格變黑曜石 / 酥蜜塊，兩邊各扣熔岩的量。
   * 水 + 蜂蜜不相溶 → 不反應。回傳是否有反應。
   */
  private react(ix: number, iy: number, jx: number, jy: number): boolean {
    const w = this.world;
    const ti = w.getLiquidType(ix, iy), tj = w.getLiquidType(jx, jy);
    if (ti !== LIQ.LAVA && tj !== LIQ.LAVA) return false;
    const lavaI = ti === LIQ.LAVA;
    const x = lavaI ? ix : jx, y = lavaI ? iy : jy;
    const ox = lavaI ? jx : ix, oy = lavaI ? jy : iy;
    const otherType = w.getLiquidType(ox, oy);
    const la = w.getLiquid(x, y);
    w.setLiquidRaw(x, y, 0, LIQ.NONE); w.touchLiquidAt(x, y);
    const left = Math.max(0, w.getLiquid(ox, oy) - la);
    w.setLiquidRaw(ox, oy, left, left === 0 ? LIQ.NONE : otherType);
    w.touchLiquidAt(ox, oy);
    this.wakeAround(ox, oy);
    this.wakeAround(x, y);
    let kind: ReactionKind = 'steam';
    // 只在空氣格凝成方塊：箱子 / 火把 / 門 / 平台等非實心物件裡的熔岩只會冒煙消失（不吞掉物件與內容）
    if (la >= REACT_MIN && w.getFg(x, y) === T.AIR && !this.blocked?.(x, y)) {
      kind = otherType === LIQ.HONEY ? 'honeycrisp' : 'obsidian';
      w.setFg(x, y, kind === 'obsidian' ? T.OBSIDIAN : T.CRISPY_HONEY);
    }
    this.events.push({ x, y, kind });
    return true;
  }

  /**
   * 倒液體到 (x,y)：空格或同種液體 → 加量；倒在別種液體上 → 直接反應（水 / 蜂蜜倒進熔岩 → 方塊）。
   * 實心、已滿、水 ↔ 蜂蜜、要反應的格不是空氣或有人站著 → false。
   */
  pour(x: number, y: number, type: number, amount: number): boolean {
    const w = this.world;
    if (!w.inBounds(x, y) || w.isSolid(x, y) || amount <= 0) return false;
    const ct = w.getLiquidType(x, y), ca = w.getLiquid(x, y);
    if (ct === LIQ.NONE || ct === type || ca === 0) {
      if (ca >= LIQ_MAX && ct === type) return false;
      w.setLiquid(x, y, Math.min(LIQ_MAX, ca + amount), type);
      this.kill.set(x, y, 0);
      this.wake(x, y);
      return true;
    }
    if (ct !== LIQ.LAVA && type !== LIQ.LAVA) return false;
    // 反應：那格變方塊——只在空氣格、而且沒有人站在那裡
    if (w.getFg(x, y) !== T.AIR || this.blocked?.(x, y)) return false;
    w.setLiquid(x, y, 0, LIQ.NONE);
    const honey = ct === LIQ.HONEY || type === LIQ.HONEY;
    w.setFg(x, y, honey ? T.CRISPY_HONEY : T.OBSIDIAN);
    this.events.push({ x, y, kind: honey ? 'honeycrisp' : 'obsidian' });
    return true;
  }

  /** 從 (x,y) 取走最多 max 的液體；沒有 → null */
  take(x: number, y: number, max: number): { type: number; amount: number } | null {
    const w = this.world;
    const a = w.getLiquid(x, y), t = w.getLiquidType(x, y);
    if (a === 0 || t === LIQ.NONE || w.isFrozen(x, y)) return null;
    const k = Math.min(a, max);
    w.setLiquid(x, y, a - k, t);
    this.wake(x, y);
    return { type: t, amount: k };
  }
}
