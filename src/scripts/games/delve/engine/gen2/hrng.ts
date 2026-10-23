// hrng.ts — gen2 結構用的雜湊亂數流：第 k 次取值 = hash2(id, k, s)。同一份藍圖（id）不管何時、從哪一欄算，取到的數列都一樣。
// int / chance 的語意與 engine/rng.ts 的 Rng 相同（int 是 [lo, hi)、chance(n) 是 1/n），舊生成器的形狀規則可以照抄參數。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { hash2 } from '../noise';

export class HRng {
  private k = 0;
  constructor(private readonly s: number, private readonly id: number) {}
  // [0, 1)
  next(): number { return hash2(this.id, this.k++, this.s); }
  // [lo, hi) 整數
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo)); }
  // 1/n 機率為真
  chance(n: number): boolean { return this.int(0, n) === 0; }
}
