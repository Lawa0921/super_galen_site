import { describe, it, expect } from 'vitest';
import { xpForMatch, xpForLevel, levelForXp, levelProgress } from './progression';

describe('xpForMatch', () => {
  it('1v1 勝方：參與10 + 名次5 + 勝25 = 40', () => {
    expect(xpForMatch(2, 1, true)).toBe(40);
  });
  it('1v1 敗方：參與10 + 名次0 + 勝0 = 10', () => {
    expect(xpForMatch(2, 2, false)).toBe(10);
  });
  it('8 人冠軍：10 + 5*(8-1) + 25 = 70', () => {
    expect(xpForMatch(8, 1, true)).toBe(70);
  });
  it('8 人墊底：10 + 5*(8-8) + 0 = 10', () => {
    expect(xpForMatch(8, 8, false)).toBe(10);
  });
});

describe('xpForLevel / levelForXp（三角數門檻 50*L*(L-1)）', () => {
  it('門檻：L1=0, L2=100, L3=300', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
  });
  it('levelForXp：0→1、99→1、100→2、299→2、300→3', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(300)).toBe(3);
  });
});

describe('levelProgress', () => {
  it('150 XP → 等級2、本級進度 50/200 = 0.25', () => {
    const p = levelProgress(150);
    expect(p.level).toBe(2);
    expect(p.into).toBe(50);
    expect(p.need).toBe(200);
    expect(p.ratio).toBeCloseTo(0.25, 5);
  });
});
