export interface Rng {
  /** [0, 1) */
  next(): number;
  /** 1..sides 整數骰 */
  roll(sides: number): number;
  d20(): number;
  pick<T>(arr: readonly T[]): T;
  weightedPick<T>(items: ReadonlyArray<{ weight: number; value: T }>): T;
}

/** mulberry32：小而夠用的種子化 PRNG，遊戲全部隨機都走這裡（禁直接 Math.random） */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const roll = (sides: number): number => Math.floor(next() * sides) + 1;
  return {
    next,
    roll,
    d20: () => roll(20),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weightedPick: (items) => {
      const total = items.reduce((sum, it) => sum + it.weight, 0);
      if (items.length === 0 || total <= 0) {
        throw new Error('weightedPick: 空清單或總權重為 0');
      }
      let cursor = next() * total;
      for (const it of items) {
        cursor -= it.weight;
        if (cursor < 0) return it.value;
      }
      return items[items.length - 1].value;
    },
  };
}
