import { describe, it, expect } from 'vitest';
import { createBag } from './bag';
import { PIECE_TYPES } from './constants';

describe('createBag', () => {
  it('每 7 個輸出恰好包含 7 種方塊各一次', () => {
    const bag = createBag(42);
    const first7 = [bag.next(), bag.next(), bag.next(), bag.next(), bag.next(), bag.next(), bag.next()];
    expect([...first7].sort()).toEqual([...PIECE_TYPES].sort());
    const second7 = [bag.next(), bag.next(), bag.next(), bag.next(), bag.next(), bag.next(), bag.next()];
    expect([...second7].sort()).toEqual([...PIECE_TYPES].sort());
  });

  it('同 seed 兩個 bag 產生相同序列', () => {
    const a = createBag(7);
    const b = createBag(7);
    const seqA = Array.from({ length: 14 }, () => a.next());
    const seqB = Array.from({ length: 14 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('peek(n) 不消耗、且與後續 next 一致', () => {
    const bag = createBag(5);
    const preview = bag.peek(5);
    expect(preview).toHaveLength(5);
    const drawn = [bag.next(), bag.next(), bag.next(), bag.next(), bag.next()];
    expect(drawn).toEqual(preview);
  });
});
