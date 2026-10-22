// edits.test.ts — EditJournal：同格合併、chunk 順序、rev、cap 滿了改標 full、箱子去重（co-op M-B2 Task 1）
import { describe, it, expect } from 'vitest';
import { EditJournal, EDIT_CAP } from './edits';

describe('EditJournal', () => {
  it('record 兩次同格 → 一筆最後狀態、rev 2', () => {
    const j = new EditJournal();
    j.record(7, 1, 2, 3, 0, 0);
    j.record(7, 1, 2, 4, 5, 1);
    expect(j.pending()).toBe(1);
    expect(j.drain()).toEqual([{ chunk: 7, rev: 2, tiles: [1, 2, 4, 5, 1], chests: [], full: false }]);
    expect(j.rev(7)).toBe(2);
    expect(j.drain()).toEqual([]);
    expect(j.pending()).toBe(0);
    expect(j.rev(7)).toBe(2);
    expect(j.rev(8)).toBe(0);
  });

  it('兩個 chunk 依第一次被改的順序', () => {
    const j = new EditJournal();
    j.record(9, 0, 0, 1, 0, 0);
    j.record(3, 5, 5, 1, 0, 0);
    j.record(9, 1, 0, 1, 0, 0);
    expect(j.drain().map((b) => b.chunk)).toEqual([9, 3]);
  });

  it('同一 chunk 不同格依第一次被改的順序；負 x 與大 y 不撞鍵', () => {
    const j = new EditJournal();
    j.record(1, -90, 10, 1, 0, 0);
    j.record(1, 90, 10, 2, 0, 0);
    j.record(1, -90, 4095, 3, 0, 0);
    j.record(1, -90, 10, 4, 0, 0);
    expect(j.drain()[0].tiles).toEqual([-90, 10, 4, 0, 0, 90, 10, 2, 0, 0, -90, 4095, 3, 0, 0]);
  });

  it('超過 cap 改標 full', () => {
    const j = new EditJournal(4);
    for (let i = 0; i < 3; i++) j.record(1, i, 0, 1, 0, 0);
    for (let i = 0; i < 2; i++) j.record(2, i, 0, 1, 0, 0);
    const out = j.drain();
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ chunk: 1, full: false, rev: 3 });
    expect(out[0].tiles.length).toBe(15);
    expect(out[1]).toEqual({ chunk: 2, rev: 2, tiles: [], chests: [], full: true });
    // drain 之後額度回來
    for (let i = 0; i < 4; i++) j.record(5, i, 0, 1, 0, 0);
    const again = j.drain();
    expect(again).toHaveLength(1);
    expect(again[0].full).toBe(false);
    expect(again[0].tiles.length).toBe(20);
  });

  it('full 的 chunk 之後的 record 只加 rev', () => {
    const j = new EditJournal(1);
    j.record(1, 0, 0, 1, 0, 0);
    j.record(1, 1, 0, 1, 0, 0);
    j.record(1, 2, 0, 1, 0, 0);
    expect(j.drain()).toEqual([{ chunk: 1, rev: 3, tiles: [], chests: [], full: true }]);
  });

  it('markFull 丟掉格子清單、rev 加 1', () => {
    const j = new EditJournal();
    j.record(4, 0, 0, 1, 0, 0);
    j.markFull(4);
    expect(j.drain()).toEqual([{ chunk: 4, rev: 2, tiles: [], chests: [], full: true }]);
  });

  it('chest 去重', () => {
    const j = new EditJournal();
    j.chest(6, 1234);
    j.chest(6, 1234);
    expect(j.drain()).toEqual([{ chunk: 6, rev: 2, tiles: [], chests: [1234], full: false }]);
    j.chest(6, 1234);
    expect(j.drain()).toEqual([{ chunk: 6, rev: 3, tiles: [], chests: [1234], full: false }]);
  });

  it('十萬次編輯有上限', () => {
    const j = new EditJournal();
    for (let n = 0; n < 100_000; n++) {
      const chunk = n % 1000, k = Math.floor(n / 1000);
      // 每個 chunk 100 個不同格
      j.record(chunk, chunk * 32 + (k & 31), k >> 5, 1, 0, 0);
    }
    expect(j.pending()).toBe(1000);
    const out = j.drain();
    const cells = out.reduce((s, b) => s + b.tiles.length / 5, 0);
    expect(cells).toBeLessThanOrEqual(EDIT_CAP);
    const full = out.filter((b) => b.full).length, notFull = out.filter((b) => !b.full).length;
    expect(full + notFull).toBe(1000);
    expect(full).toBeGreaterThan(0);
    expect(out.every((b) => b.rev === 100)).toBe(true);
  });
});
