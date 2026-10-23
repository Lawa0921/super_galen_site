// interp.ts — 客人端的內插緩衝（co-op M-B3；spec §5.3）：每個 id 依房主時間存最近幾筆，
// 取樣時往回推 delayMs，夾在前後兩筆之間線性插值 x / y（其他欄位取較新那筆）；超過最新 → 最新（不外推）。
// 給了 lerp（M-C2）→ 兩筆之間改用它（例：玩家的 pose 連挖掘進度一起內插）。
// 純資料結構：不碰時間與亂數（時間由呼叫端傳入）。
import { INTERP_DELAY_MS } from './protocol';

/** 每個 id 最多留幾筆（15 Hz 時約 0.5 秒，遠大於延遲） */
const MAX_SAMPLES = 8;

interface Sample<T> { at: number; v: T }

export class Interp<T extends { x: number; y: number }> {
  private readonly buf = new Map<number | string, Sample<T>[]>();

  /** lerp(a, b, k)：兩筆之間的取樣（k = 0..1）；省略 = x / y 線性、其他取 b */
  constructor(private readonly delayMs: number = INTERP_DELAY_MS, private readonly lerp?: (a: T, b: T, k: number) => T) {}

  /** at = 房主時間（ms，= ws.time * 1000）；亂序也行（依 at 插入）；同一個 at 取後來的 */
  push(id: number | string, at: number, v: T): void {
    if (!Number.isFinite(at) || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return;
    let l = this.buf.get(id);
    if (!l) { l = []; this.buf.set(id, l); }
    let i = l.length;
    while (i > 0 && l[i - 1].at > at) i--;
    if (i > 0 && l[i - 1].at === at) l[i - 1] = { at, v };
    else l.splice(i, 0, { at, v });
    if (l.length > MAX_SAMPLES) l.splice(0, l.length - MAX_SAMPLES);
  }

  /** now - delay 夾在前後兩筆之間線性插值；超過最新 → 最新（不外推）；早於最舊 → 最舊；沒有這個 id → null */
  sample(id: number | string, now: number): T | null {
    const l = this.buf.get(id);
    if (!l || l.length === 0) return null;
    const t = now - this.delayMs;
    const last = l[l.length - 1];
    if (!(t < last.at)) return last.v;
    if (t <= l[0].at) return l[0].v;
    let i = l.length - 1;
    while (l[i - 1].at > t) i--;
    const a = l[i - 1], b = l[i];
    const k = (t - a.at) / (b.at - a.at);
    if (this.lerp) return this.lerp(a.v, b.v, k);
    return { ...b.v, x: a.v.x + (b.v.x - a.v.x) * k, y: a.v.y + (b.v.y - a.v.y) * k };
  }

  ids(): (number | string)[] { return [...this.buf.keys()]; }

  /** 不在這次 ws 裡的丟掉 */
  retain(ids: ReadonlySet<number | string>): void {
    for (const id of [...this.buf.keys()]) if (!ids.has(id)) this.buf.delete(id);
  }

  delete(id: number | string): void { this.buf.delete(id); }

  clear(): void { this.buf.clear(); }
}
