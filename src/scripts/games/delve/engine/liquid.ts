// liquid.ts — 液體元胞自動機（水 / 熔岩 / 蜂蜜）。概念參考泰拉的「活躍格清單 + 先落後攤平」模型，程式為自行重寫：
//   · 每格液體量 0..255 + 種類（world.liquid / world.liquidType）。只更新「活躍格」：每種液體一條 FIFO 佇列
//     （Int32Array 環形緩衝 + 每格一個 inQ 旗標避免重複）；佇列滿了排進溢出區，有空位再補回去。
//   · 單格更新：① 往下落：下方非實心、同種或空 → 盡量往下倒；② 落不完（下方滿 / 實心 / 別種液體）→ 與左右
//     可流入的鄰格平均（整數，餘數留在中央 → 質量守恆、沒有左右偏差）；③ 平均後中央 < 3 → 蒸發 1（薄膜會乾掉）。
//     有改變 → 本格 / 被改的鄰格 / 上方格重新排入；沒改變 → kill+1，連續 RETIRE_AFTER 次沒變就退休（不再更新）。
//   · 水每刻更新；熔岩每 LAVA_EVERY 刻、蜂蜜每 HONEY_EVERY 刻（比較黏）。
//   · 每刻每條佇列最多處理 budget 格（確定性的時間切片）；可另設 timeBudgetMs（瀏覽器用，超時就留到下一刻）。
//     溢出區連續 PANIC_TICKS 刻都還有東西 → 「靜置模式」：預算 ×4 直到清空（大洪水追進度）。
//   · 反應：水 ↔ 熔岩 → 熔岩那格變黑曜石；蜂蜜 ↔ 熔岩 → 酥蜜塊；兩邊各消耗掉熔岩的量。水與蜂蜜不相溶（互相擋住）。
//   · 實心方塊蓋進液體格 → 該格液體消失。world.setFg 會透過 onTileChange 喚醒鄰格（挖開水壩就會流）。
// 全部整數運算、固定處理順序 → 同樣的輸入得到同樣的結果。
import type { World } from './world';
import { LIQ, LIQ_MAX } from './liquidKind';
import { SOLID_LUT, T } from './tiles';

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
  readonly buf: Int32Array;
  head = 0;
  len = 0;
  constructor(readonly cap: number) { this.buf = new Int32Array(cap); }
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
  private readonly inQ: Uint8Array;
  private readonly kill: Uint8Array;
  private events: LiquidEvent[] = [];
  /** (x,y) 有身體（玩家）：反應不放方塊（只冒煙），倒液體不反應——避免把人封進黑曜石 */
  blocked: ((x: number, y: number) => boolean) | null = null;
  private overTicks = 0;
  private quick = false;
  /** 攤平用的鄰格暫存（本格 + 左右各 2） */
  private readonly nb = new Int32Array(5);
  private readonly old = new Int32Array(5);
  private readonly extra = new Uint8Array(5);
  private springs: SpringRt[] = [];
  private springOut = 0;
  private springDrained = 0;

  constructor(readonly world: World, opts: LiquidOptions = {}) {
    const cap = opts.cap ?? DEFAULT_CAP;
    this.budget = opts.budget ?? DEFAULT_BUDGET;
    this.qs = [new Queue(cap), new Queue(cap), new Queue(cap)];
    const n = world.width * world.height;
    this.inQ = new Uint8Array(n);
    this.kill = new Uint8Array(n);
    world.onTileChange = (x, y) => this.wake(x, y);
  }

  /** 排入佇列中的格數（不含溢出區） */
  get queuedCount(): number { return this.qs[0].len + this.qs[1].len + this.qs[2].len; }
  /** 所有活躍格（佇列 + 溢出區） */
  get activeCount(): number { return this.queuedCount + this.over[0].size + this.over[1].size + this.over[2].size; }

  /** 把 tile index i 排入（有液體且還沒排入時） */
  private enqueue(i: number): void {
    if (this.inQ[i]) return;
    const t = this.world.liquidType[i];
    if (t === LIQ.NONE || this.world.liquid[i] === 0) return;
    this.inQ[i] = 1;
    if (!this.qs[t - 1].push(i)) this.over[t - 1].push(i);
  }
  /** (x,y) 有液體就排入 */
  add(x: number, y: number): void {
    if (this.world.inBounds(x, y)) this.enqueue(y * this.world.width + x);
  }
  /** 喚醒 (x,y) 與上下左右的液體格（挖掘 / 放置 / 倒水後） */
  wake(x: number, y: number): void {
    this.add(x, y); this.add(x - 1, y); this.add(x + 1, y); this.add(x, y - 1); this.add(x, y + 1);
  }
  /** 喚醒矩形內所有液體格（tile 座標，x1 / y1 不含） */
  wakeRect(x0: number, y0: number, x1: number, y1: number): void {
    const w = this.world, L = w.liquid;
    const ax = Math.max(0, x0), ay = Math.max(0, y0), bx = Math.min(w.width, x1), by = Math.min(w.height, y1);
    for (let y = ay; y < by; y++) {
      const row = y * w.width;
      for (let x = ax; x < bx; x++) if (L[row + x]) this.enqueue(row + x);
    }
  }
  /** 喚醒全世界的液體格 */
  wakeAll(): void { this.wakeRect(0, 0, this.world.width, this.world.height); }

  drainEvents(): LiquidEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** 設定世界的泉水（世界生成給的；載入時重設） */
  setSprings(list: readonly SpringSpec[]): void {
    const W = this.world.width;
    this.springs = list.map((s) => ({
      i: s.y * W + s.x, type: s.type, tile: s.type === LIQ.LAVA ? T.LAVA_SPRING : T.SPRING, box: s.box, cap: s.cap,
      drains: s.drains.map((d) => d.y * W + d.x), debt: 0, boxTotal: -1, side: 0,
    }));
  }
  get springCount(): number { return this.springs.length; }
  /** 累計出水 / 排水量（debug / 測試） */
  springStats(): { emitted: number; drained: number } { return { emitted: this.springOut, drained: this.springDrained }; }

  private boxTotal(b: SpringSpec['box']): number {
    const w = this.world, L = w.liquid, W = w.width;
    let s = 0;
    const x0 = Math.max(0, b.x0), x1 = Math.min(W, b.x1), y0 = Math.max(0, b.y0), y1 = Math.min(w.height, b.y1);
    for (let y = y0; y < y1; y++) { const r = y * W; for (let x = x0; x < x1; x++) s += L[r + x]; }
    return s;
  }

  /** 泉水出水 + 滲水石排水（每刻；熔岩泉照熔岩節奏） */
  private runSprings(t: number): void {
    const w = this.world, L = w.liquid, LT = w.liquidType, fg = w.fg, F = w.frozen, W = w.width;
    for (const sp of this.springs) {
      const lavaTick = sp.type !== LIQ.LAVA || t % LAVA_EVERY === 0;
      // 滲水石：吸上 / 左 / 右的液體
      for (const d of sp.drains) {
        if (fg[d] !== T.DRAIN) continue;
        for (const j of [d - W, d - 1, d + 1]) {
          if (j < 0 || j >= L.length || !L[j] || F[j]) continue;
          if (LT[j] === LIQ.LAVA && !lavaTick) continue;
          const k = Math.min(L[j], DRAIN_RATE);
          L[j] -= k;
          if (!L[j]) LT[j] = LIQ.NONE;
          w.touchLiquid(j);
          this.kill[j] = 0;
          this.enqueue(j);
          if (j >= W) this.enqueue(j - W);
          this.enqueue(j - 1); this.enqueue(j + 1);
          sp.debt = Math.max(0, sp.debt - k);
          this.springDrained += k;
        }
      }
      if (!lavaTick || fg[sp.i] !== sp.tile) continue;
      if (sp.boxTotal < 0 || t % BOX_EVERY === 0) sp.boxTotal = this.boxTotal(sp.box);
      if (sp.debt > SPRING_SLACK) { if (t % SPRING_DECAY_EVERY === 0) sp.debt--; continue; }
      if (sp.boxTotal >= sp.cap) continue;
      // 出水格：下 → 左右（兩邊都開就輪流）
      const rate = SPRING_RATE[sp.type] ?? 20;
      const ok = (j: number): boolean => j >= 0 && j < L.length && SOLID_LUT[fg[j]] !== 1 && !F[j]
        && (LT[j] === LIQ.NONE || LT[j] === sp.type || L[j] === 0) && L[j] < LIQ_MAX;
      const x = sp.i % W;
      let j = -1;
      if (ok(sp.i + W)) j = sp.i + W;
      else {
        const l = x > 0 && ok(sp.i - 1), r = x < W - 1 && ok(sp.i + 1);
        if (l && r) { sp.side ^= 1; j = sp.side ? sp.i - 1 : sp.i + 1; } else if (l) j = sp.i - 1; else if (r) j = sp.i + 1;
      }
      if (j < 0) continue;
      const k = Math.min(rate, LIQ_MAX - L[j]);
      L[j] += k; LT[j] = sp.type;
      w.touchLiquid(j);
      this.kill[j] = 0;
      this.enqueue(j);
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
      const i = q.shift();
      this.inQ[i] = 0;
      this.update(i);
    }
    return k;
  }

  /** 單格更新（見檔頭） */
  private update(i: number): void {
    const w = this.world, L = w.liquid, LT = w.liquidType, fg = w.fg, W = w.width, F = w.frozen;
    let a = L[i];
    const t = LT[i];
    // 結冰格不流動（融化時 frost.ts 會喚醒）
    if (F[i]) { this.kill[i] = 0; return; }
    if (a === 0 || t === LIQ.NONE) { L[i] = 0; LT[i] = LIQ.NONE; this.kill[i] = 0; return; }
    if (SOLID_LUT[fg[i]] === 1) { L[i] = 0; LT[i] = LIQ.NONE; this.kill[i] = 0; w.touchLiquid(i); return; }
    const x = i % W, y = (i - x) / W;
    const a0 = a;
    let changed = false;
    // ① 往下落
    if (y + 1 < w.height) {
      const j = i + W;
      if (SOLID_LUT[fg[j]] !== 1 && !F[j]) {
        const tb = LT[j];
        if (tb === LIQ.NONE || tb === t || L[j] === 0) {
          const room = LIQ_MAX - L[j];
          if (room > 0) {
            const mv = room < a ? room : a;
            L[j] += mv; LT[j] = t; a -= mv;
            w.touchLiquid(j); this.enqueue(j);
            changed = true;
          }
        } else if (this.react(i, j)) { this.afterChange(i); return; }
      }
    }
    // ② 左右攤平：與左右各最多 2 格連續可流入的格平均（見 spread）
    if (a > 0) {
      const open = (j: number): number => (SOLID_LUT[fg[j]] === 1 || F[j] ? 0 : LT[j] === LIQ.NONE || LT[j] === t || L[j] === 0 ? 1 : 2);
      const ol = x > 0 ? open(i - 1) : 0, or = x < W - 1 ? open(i + 1) : 0;
      if (ol === 2 && this.react(i, i - 1)) { this.afterChange(i); return; }
      if (or === 2 && this.react(i, i + 1)) { this.afterChange(i); return; }
      const nb = this.nb;
      let n = 0;
      nb[n++] = i;
      if (ol === 1) { nb[n++] = i - 1; if (x > 1 && open(i - 2) === 1) nb[n++] = i - 2; }
      if (or === 1) { nb[n++] = i + 1; if (x < W - 2 && open(i + 2) === 1) nb[n++] = i + 2; }
      if (n > 1) {
        L[i] = a;
        if (this.spread(n, t)) changed = true;
        a = L[i];
      }
      // 薄膜蒸發：停住的格量 < 3、周圍也都很少 → 少 1
      if (a > 0 && a < 3 && this.resting(i)) {
        let thin = true;
        for (let k = 1; k < n; k++) if (L[nb[k]] >= 3) { thin = false; break; }
        if (thin) a--;
      }
    }
    if (a !== a0) changed = true;
    L[i] = a;
    if (a === 0) LT[i] = LIQ.NONE;
    if (changed) {
      w.touchLiquid(i);
      this.afterChange(i);
    } else if (++this.kill[i] < RETIRE_AFTER) this.enqueue(i);
    else this.kill[i] = 0;
  }

  /**
   * 把 nb[0..n) 這幾格的液體平均分配：每格 floor(總量 / n)，餘數給「原本量最多」的格（同量依 nb 順序）。
   * 這是與原狀態差異最小的整數分配 → 已經平均（最大最小差 ≤ 1）時完全不變；否則平方和嚴格下降 → 不會來回震盪。
   * nb[0] 是本格（呼叫端已把本格目前量寫進 L）。鄰格有變就排入。回傳是否有改變。
   */
  private spread(n: number, t: number): boolean {
    const L = this.world.liquid, nb = this.nb, old = this.old;
    let total = 0, mx = 0, mn = LIQ_MAX;
    for (let k = 0; k < n; k++) { const v = L[nb[k]]; old[k] = v; total += v; if (v > mx) mx = v; if (v < mn) mn = v; }
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
      if (k === 0) { L[nb[0]] = v; continue; }
      this.setSide(nb[k], v, t);
    }
    return changed;
  }

  /** 下方擋住（實心 / 滿 / 別種液體）→ 液體停在這格 */
  private resting(i: number): boolean {
    const w = this.world, j = i + w.width;
    if (j >= w.liquid.length || SOLID_LUT[w.fg[j]] === 1 || w.frozen[j]) return true;
    return w.liquid[j] >= LIQ_MAX || (w.liquidType[j] !== LIQ.NONE && w.liquidType[j] !== w.liquidType[i]);
  }

  /** 本格有變：重設 kill、排入本格與上方格 */
  private afterChange(i: number): void {
    const w = this.world;
    this.kill[i] = 0;
    this.enqueue(i);
    if (i >= w.width) this.enqueue(i - w.width);
  }

  private setSide(j: number, v: number, t: number): boolean {
    const w = this.world, L = w.liquid, LT = w.liquidType;
    const nt = v === 0 ? LIQ.NONE : t;
    if (L[j] === v && LT[j] === nt) return false;
    L[j] = v; LT[j] = nt;
    w.touchLiquid(j);
    this.kill[j] = 0;
    this.enqueue(j);
    return true;
  }

  /**
   * i（本格）與 j（鄰格）是不同液體：熔岩 + 水 / 蜂蜜 → 熔岩那格變黑曜石 / 酥蜜塊，兩邊各扣熔岩的量。
   * 水 + 蜂蜜不相溶 → 不反應。回傳是否有反應。
   */
  private react(i: number, j: number): boolean {
    const w = this.world, L = w.liquid, LT = w.liquidType;
    const ti = LT[i], tj = LT[j];
    if (ti !== LIQ.LAVA && tj !== LIQ.LAVA) return false;
    const lava = ti === LIQ.LAVA ? i : j, other = lava === i ? j : i;
    const otherType = LT[other];
    const la = L[lava];
    L[lava] = 0; LT[lava] = LIQ.NONE; w.touchLiquid(lava);
    const left = Math.max(0, L[other] - la);
    L[other] = left; if (left === 0) LT[other] = LIQ.NONE;
    w.touchLiquid(other);
    this.enqueue(other);
    const x = lava % w.width, y = (lava - x) / w.width;
    let kind: ReactionKind = 'steam';
    // 只在空氣格凝成方塊：箱子 / 火把 / 門 / 平台等非實心物件裡的熔岩只會冒煙消失（不吞掉物件與內容）
    if (la >= REACT_MIN && w.fg[lava] === T.AIR && !this.blocked?.(x, y)) {
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
    const i = y * w.width + x, ct = w.liquidType[i], ca = w.liquid[i];
    if (ct === LIQ.NONE || ct === type || ca === 0) {
      if (ca >= LIQ_MAX && ct === type) return false;
      w.setLiquid(x, y, Math.min(LIQ_MAX, ca + amount), type);
      this.kill[i] = 0;
      this.wake(x, y);
      return true;
    }
    if (ct !== LIQ.LAVA && type !== LIQ.LAVA) return false;
    // 反應：那格變方塊——只在空氣格、而且沒有人站在那裡
    if (w.fg[i] !== T.AIR || this.blocked?.(x, y)) return false;
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
    if (a === 0 || t === LIQ.NONE || w.frozen[w.idx(x, y)]) return null;
    const k = Math.min(a, max);
    w.setLiquid(x, y, a - k, t);
    this.wake(x, y);
    return { type: t, amount: k };
  }
}
