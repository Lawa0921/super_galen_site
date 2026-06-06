/**
 * mulberry32：32-bit 確定性 PRNG。回傳一個每次呼叫產生 [0,1) 的函式。
 * 帶 seed 時可完全重現，方便測試與對戰雙方同步。
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
