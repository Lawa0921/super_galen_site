// bakeQueue.ts — 分幀烘焙（純邏輯，無 DOM）：一張影格表有 total 格，
//   need(i) = 這一幀要用到第 i 格 → 沒烘過就馬上烘；pump(budgetMs) = 剩下的格子在時間預算內往下烘（至少一格），
//   prioritize = 先烘哪幾格（例如目前動作的那幾格）。換裝那一幀只烘要用的那格 + 預算內的幾格，不會整張同步烘完卡住。
export class BakeQueue {
  private readonly ok: Uint8Array;
  private left: number;
  private order: number[] = [];
  private cursor = 0;

  constructor(readonly total: number, private readonly bakeOne: (i: number) => void, private readonly now: () => number = () => performance.now()) {
    this.ok = new Uint8Array(total);
    this.left = total;
  }
  get done(): boolean { return this.left === 0; }
  has(i: number): boolean { return this.ok[i] === 1; }
  need(i: number): void {
    if (i < 0 || i >= this.total || this.ok[i]) return;
    this.ok[i] = 1; this.left--;
    this.bakeOne(i);
  }
  /** 先烘這幾格（插在剩下的順序最前面） */
  prioritize(list: readonly number[]): void { this.order = [...list, ...this.order]; }
  /** 在 budgetMs 內往下烘（至少烘一格）；回傳這次烘了幾格 */
  pump(budgetMs: number): number {
    if (this.done) return 0;
    const t0 = this.now();
    let n = 0;
    while (!this.done) {
      const i = this.nextIndex();
      if (i < 0) break;
      this.need(i); n++;
      if (this.now() - t0 >= budgetMs) break;
    }
    return n;
  }
  private nextIndex(): number {
    while (this.order.length) { const i = this.order.shift()!; if (!this.ok[i]) return i; }
    while (this.cursor < this.total && this.ok[this.cursor]) this.cursor++;
    return this.cursor < this.total ? this.cursor : -1;
  }
}
