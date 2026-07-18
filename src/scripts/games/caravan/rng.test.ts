import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng（種子化隨機）', () => {
  it('同種子產生相同序列（測試可重現的基石）', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('不同種子產生不同序列', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect([a.next(), a.next()]).not.toEqual([b.next(), b.next()]);
  });

  it('next() 落在 [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('roll(6) 產生 1..6 整數且六面都出現過', () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      const v = rng.roll(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('d20() 等同 roll(20)', () => {
    const a = createRng(5);
    const b = createRng(5);
    expect(a.d20()).toBe(b.roll(20));
  });

  it('pick 從陣列取元素且分布覆蓋全部', () => {
    const rng = createRng(11);
    const arr = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(rng.pick(arr));
    expect(seen).toEqual(new Set(['a', 'b', 'c']));
  });

  it('weightedPick 尊重權重（權重 0 永不出現、高權重壓倒性勝出）', () => {
    const rng = createRng(13);
    let heavy = 0;
    for (let i = 0; i < 1000; i++) {
      const v = rng.weightedPick([
        { weight: 0, value: 'never' },
        { weight: 1, value: 'rare' },
        { weight: 99, value: 'common' },
      ]);
      expect(v).not.toBe('never');
      if (v === 'common') heavy++;
    }
    expect(heavy).toBeGreaterThan(900);
  });

  it('weightedPick 空陣列或總權重 0 擲出 Error（M1 遺留 guard）', () => {
    const rng = createRng(1);
    expect(() => rng.weightedPick([])).toThrow();
    expect(() => rng.weightedPick([{ weight: 0, value: 'x' }])).toThrow();
  });
});
