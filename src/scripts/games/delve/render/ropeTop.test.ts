// ropeTop.test.ts — 爬到繩頂：繩子在最上面那隻手的高度以下就到頭了 → 換成「手抓在胸口」的繩頂影格
import { describe, it, expect } from 'vitest';
import { atRopeTop } from './playerAnim';

describe('atRopeTop', () => {
  it('爬繩 / 掛著 / 往下爬時，繩頂比舉高的手低超過 2 px → 用繩頂影格', () => {
    expect(atRopeTop('climb', 100, 103)).toBe(true);
    expect(atRopeTop('hang', 100, 140)).toBe(true);
    expect(atRopeTop('climbdown', 100, 110)).toBe(true);
  });
  it('繩子還在手的上面（或剛好在手那裡）→ 照常爬', () => {
    expect(atRopeTop('climb', 100, 60)).toBe(false);
    expect(atRopeTop('climb', 100, 101)).toBe(false);
  });
  it('不是在繩上的動作 → 不管', () => {
    expect(atRopeTop('idle', 100, 140)).toBe(false);
    expect(atRopeTop('mantle', 100, 140)).toBe(false);
  });
});
