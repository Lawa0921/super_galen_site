// graze.test.ts
import { describe, it, expect } from 'vitest';
import { Overdrive } from './graze';
import { OVERDRIVE_MAX, GRAZE_GAIN, OVERDRIVE_DURATION_MS } from './constants';

describe('Overdrive', () => {
  it('擦彈累積槽值，封頂 OVERDRIVE_MAX', () => {
    const od = new Overdrive();
    od.addGraze(2, 0);          // 2 次擦彈、無低速加成
    expect(od.gauge).toBe(GRAZE_GAIN * 2);
    od.addGraze(1000, 0);
    expect(od.gauge).toBe(OVERDRIVE_MAX);
  });

  it('低速加成（星屑掃帚 +30%）', () => {
    const od = new Overdrive();
    od.addGraze(1, 0.3);
    expect(od.gauge).toBeCloseTo(GRAZE_GAIN * 1.3);
  });

  it('未滿槽不能引爆；滿槽引爆後進入 active 並清空槽', () => {
    const od = new Overdrive();
    expect(od.activate(1)).toBe(false);
    od.addGraze(1000, 0);
    expect(od.activate(1)).toBe(true);
    expect(od.gauge).toBe(0);
    expect(od.activeMs).toBe(OVERDRIVE_DURATION_MS);
  });

  it('回音鈴：durMult 延長 active 時間', () => {
    const od = new Overdrive();
    od.addGraze(1000, 0);
    od.activate(1.5);
    expect(od.activeMs).toBe(OVERDRIVE_DURATION_MS * 1.5);
  });

  it('tick 遞減 active 時間；active 中再擦彈不累積', () => {
    const od = new Overdrive();
    od.addGraze(1000, 0);
    od.activate(1);
    od.addGraze(5, 0);
    expect(od.gauge).toBe(0);
    od.tick(1000);
    expect(od.activeMs).toBe(OVERDRIVE_DURATION_MS - 1000);
  });

  it('active 結束後恢復累積並可再次引爆', () => {
    const od = new Overdrive();
    od.addGraze(1000, 0);
    od.activate(1);
    od.tick(OVERDRIVE_DURATION_MS);
    expect(od.isActive).toBe(false);
    od.addGraze(2, 0);
    expect(od.gauge).toBeCloseTo(GRAZE_GAIN * 2);
  });

  it('被彈清空槽並中斷 active', () => {
    const od = new Overdrive();
    od.addGraze(10, 0);
    od.onPlayerHit();
    expect(od.gauge).toBe(0);
    expect(od.activeMs).toBe(0);
  });
});
