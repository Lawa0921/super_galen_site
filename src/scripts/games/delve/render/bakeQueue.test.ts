// bakeQueue.test.ts — 分幀烘焙：要用的那格立刻烘、其餘每幀在時間預算內慢慢烘完
import { describe, it, expect } from 'vitest';
import { BakeQueue } from './bakeQueue';

function setup(total: number, cost: number) {
  let t = 0;
  const baked: number[] = [];
  const q = new BakeQueue(total, (i) => { baked.push(i); t += cost; }, () => t);
  return { q, baked, tick: (dt: number) => { t += dt; } };
}

describe('BakeQueue', () => {
  it('need：要用的那格沒烘過就馬上烘（只烘一次）', () => {
    const { q, baked } = setup(10, 1);
    q.need(7); q.need(7);
    expect(baked).toEqual([7]);
    expect(q.has(7)).toBe(true);
    expect(q.has(3)).toBe(false);
  });
  it('pump：在預算內往下烘、超過預算就停，下一幀接著烘；優先烘指定的那幾格', () => {
    const { q, baked } = setup(10, 1);
    q.prioritize([4, 5]);
    q.pump(2.5);
    expect(baked).toEqual([4, 5, 0]);
    q.pump(2.5);
    expect(baked).toEqual([4, 5, 0, 1, 2, 3]);
    while (!q.done) q.pump(3);
    expect([...baked].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(q.pump(3)).toBe(0);
  });
  it('一幀至少烘一格（預算再小也會前進），烘完 done = true', () => {
    const { q } = setup(3, 50);
    expect(q.pump(1)).toBe(1);
    expect(q.done).toBe(false);
    q.pump(1); q.pump(1);
    expect(q.done).toBe(true);
  });
});
