// locks.test.ts — 版本鎖表：新加回 true、toJSON 依 (side, i) 排序、fromJSON 往返與壞資料、frozen 客人副本。
import { describe, it, expect } from 'vitest';
import { LockTable } from './locks';

describe('LockTable', () => {
  it('LockTable', () => { const t = new LockTable();
    expect(t.lock(1, 3, { ver: 0, culture: null })).toBe(true); expect(t.lock(-1, 2, { ver: 0, culture: 'mistbamboo' })).toBe(true); expect(t.lock(1, 3, { ver: 0, culture: null })).toBe(false);
    expect(t.toJSON()).toEqual([[-1, 2, 0, 'mistbamboo'], [1, 3, 0, null]]);
    expect(LockTable.fromJSON(t.toJSON()).toJSON()).toEqual(t.toJSON());
    for (const bad of ['x', [[2, 1, 0, null]], [[1, 1, -1, null]], [[1, 1, 0.5, null]], [[1, 1, 0, 'atlantis']]]) expect(() => LockTable.fromJSON(bad)).toThrow(RangeError);
    const f = LockTable.fromJSON([], { frozen: true }); expect(f.lock(1, 1, { ver: 0, culture: null })).toBe(false); expect(f.get(1, 1)).toBeUndefined(); });

  it('已鎖的不會被覆寫；get 回鎖的內容', () => {
    const t = new LockTable();
    t.lock(1, 2, { ver: 0, culture: 'mistbamboo' });
    expect(t.lock(1, 2, { ver: 3, culture: null })).toBe(false);
    expect(t.get(1, 2)).toEqual({ ver: 0, culture: 'mistbamboo' });
    expect(t.get(-1, 2)).toBeUndefined();
  });

  it('toJSON 依 side 再依 i 數值排序', () => {
    const t = new LockTable();
    for (const [s, i] of [[1, 10], [1, 2], [-1, 11], [0, 0], [-1, 3]] as const) t.lock(s, i, { ver: 0, culture: null });
    expect(t.toJSON().map(([s, i]) => [s, i])).toEqual([[-1, 3], [-1, 11], [0, 0], [1, 2], [1, 10]]);
  });

  it('frozen 副本保留讀進來的鎖、但 lock() 不記', () => {
    const f = LockTable.fromJSON([[1, 2, 0, 'mistbamboo']], { frozen: true });
    expect(f.get(1, 2)).toEqual({ ver: 0, culture: 'mistbamboo' });
    expect(f.lock(-1, 2, { ver: 0, culture: null })).toBe(false);
    expect(f.toJSON()).toEqual([[1, 2, 0, 'mistbamboo']]);
  });

  it('壞資料：不是 4 元組、i 非正整數、side 與 i 不配、重複鍵', () => {
    for (const bad of [null, {}, [1], [[1, 2, 0]], [[1, 2, 0, null, 9]], [[1, 0, 0, null]], [[1, 1.5, 0, null]], [[0, 1, 0, null]], [[1, '2', 0, null]],
      [[1, 2, 0, null], [1, 2, 0, null]], [[1, 2, Number.NaN, null]], [[1, 2, 0, undefined]]]) expect(() => LockTable.fromJSON(bad)).toThrow(RangeError);
    expect(LockTable.fromJSON([[0, 0, 0, null]]).get(0, 0)).toEqual({ ver: 0, culture: null });
  });
});
