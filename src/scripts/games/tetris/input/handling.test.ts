import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HANDLING_DEFAULT, HANDLING_RANGE, loadHandling, saveHandling } from './handling';

describe('handling 設定（DAS/ARR/SDF）', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未設定時回傳預設值（不汙染：回傳副本）', () => {
    const h = loadHandling();
    expect(h).toEqual({ das: 150, arr: 35, sdf: 30 });
    h.das = 999;
    expect(loadHandling().das).toBe(HANDLING_DEFAULT.das);
  });

  it('save → load 往返一致', () => {
    saveHandling({ das: 80, arr: 0, sdf: 0 });
    expect(loadHandling()).toEqual({ das: 80, arr: 0, sdf: 0 });
  });

  it('越界值 clamp 到範圍內', () => {
    localStorage.setItem('tetris-handling', JSON.stringify({ das: 10, arr: 999, sdf: -5 }));
    expect(loadHandling()).toEqual({
      das: HANDLING_RANGE.das.min,
      arr: HANDLING_RANGE.arr.max,
      sdf: HANDLING_RANGE.sdf.min,
    });
  });

  it('壞 JSON 回預設', () => {
    localStorage.setItem('tetris-handling', '{not json');
    expect(loadHandling()).toEqual(HANDLING_DEFAULT);
  });

  it('欄位缺漏或非數字 → 該欄位回預設', () => {
    localStorage.setItem('tetris-handling', JSON.stringify({ das: 200, arr: 'fast' }));
    expect(loadHandling()).toEqual({ das: 200, arr: HANDLING_DEFAULT.arr, sdf: HANDLING_DEFAULT.sdf });
  });

  it('localStorage 不可用（隱私模式 throw）→ load 回預設、save 靜默', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(loadHandling()).toEqual(HANDLING_DEFAULT);
    expect(() => saveHandling({ das: 100, arr: 20, sdf: 10 })).not.toThrow();
  });
});
