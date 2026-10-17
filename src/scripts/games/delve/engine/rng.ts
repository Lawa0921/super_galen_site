// rng.ts — 確定性亂數：xmur3 字串雜湊 + sfc32（128-bit 狀態）。
// 只用整數運算（Math.imul / 位元運算），跨瀏覽器位元一致。世界生成禁用 Math.random。

/** xmur3：把字串雜湊成一串 32-bit 無號整數種子。 */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function seed(): number {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** sfc32：回傳 [0,1) 浮點產生器。 */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  return function next(): number {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** 方便用的包裝：int 為 max-exclusive（與泰拉 genRand.Next(a,b) 同語意）。 */
export class Rng {
  readonly next: () => number;
  constructor(seed: string | number) {
    const s = xmur3(String(seed));
    this.next = sfc32(s(), s(), s(), s());
    for (let i = 0; i < 12; i++) this.next(); // 暖機，打散初始狀態
  }
  /** [min, maxExcl) 整數 */
  int(min: number, maxExcl: number): number {
    return min + Math.floor(this.next() * (maxExcl - min));
  }
  /** [min, max) 浮點 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  /** 1/n 機率為真 */
  chance(n: number): boolean {
    return this.int(0, n) === 0;
  }
}

/** 每個生成 pass 一條獨立亂數流：改一個 pass 不會影響其他 pass 的輸出。 */
export function subSeed(seed: string | number, passName: string): Rng {
  return new Rng(`${seed}:${passName}`);
}
