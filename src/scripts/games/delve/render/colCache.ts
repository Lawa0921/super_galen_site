// colCache.ts — 每欄數值（生態區、地表高度）的惰性快取：按 chunk 欄（32 欄）一段 Int16Array，第一次用到才整段算。
// 外圍的 world.biomeAt / surfaceAt 每次要算約 20 個雜湊 → 畫面每幀每欄要問的（遠景混合、地下背景交界、地平線）
// 都走這裡；同一 chunk 欄連續查詢不查 Map。值只由 x 決定（生成時的資料，挖掘不改），所以不必失效，只限制大小。
import { CHUNK } from '../engine/constants';
import { chunkOfX, localX } from '../engine/coords';
import type { World } from '../engine/world';

/**
 * 遠景地平線用的「看得到的地表」：中央照舊 surfaceAt；外圍有水的欄（海）取 min(地表, 水面)——
 * surfaceAt 在海上是海床（水面下 ~46 格），拿它當地平線遠山會沉到水裡。
 */
export function horizonSurfaceAt(w: Pick<World, 'width' | 'source' | 'surfaceAt' | 'isLegacyCentral'>, x: number): number {
  const s = w.surfaceAt(x);
  if (w.isLegacyCentral(x)) return s;
  const top = w.source?.waterTopAt?.(x);
  return top === null || top === undefined ? s : Math.min(s, top);
}

export class ColumnCache {
  private cols = new Map<number, Int16Array>();
  private lcx = NaN;
  private lcol: Int16Array | null = null;
  /** fn(x) = 第 x 欄的值（整數、Int16 範圍內）；maxCols = 最多留幾個 chunk 欄（超過就整個清掉重來） */
  constructor(private readonly fn: (x: number) => number, readonly maxCols = 64) {}
  at(x: number): number {
    const fx = Math.floor(x), cx = chunkOfX(fx);
    let col = cx === this.lcx ? this.lcol : null;
    if (!col) {
      col = this.cols.get(cx) ?? null;
      if (!col) {
        if (this.cols.size >= this.maxCols) this.cols.clear();
        col = new Int16Array(CHUNK);
        const x0 = cx * CHUNK;
        for (let i = 0; i < CHUNK; i++) col[i] = this.fn(x0 + i);
        this.cols.set(cx, col);
      }
      this.lcx = cx;
      this.lcol = col;
    }
    return col[localX(fx)];
  }
  get size(): number { return this.cols.size; }
  clear(): void { this.cols.clear(); this.lcx = NaN; this.lcol = null; }
}
