import { describe, it, expect } from 'vitest';
import { expectedScore, updateRatings, tierFor, DEFAULT_RATING, K_FACTOR } from './elo';

describe('expectedScore', () => {
  it('同分時期望勝率 0.5', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 5);
  });
  it('高分方期望勝率 > 0.5', () => {
    expect(expectedScore(1400, 1200)).toBeGreaterThan(0.5);
  });
});

describe('updateRatings', () => {
  it('同分對局：贏家 +K/2、輸家 -K/2', () => {
    const r = updateRatings(1000, 1000, 'a');
    expect(r.a).toBe(1000 + K_FACTOR / 2);
    expect(r.b).toBe(1000 - K_FACTOR / 2);
  });
  it('爆冷（低分贏高分）拿到的分數比常態多', () => {
    const upset = updateRatings(1000, 1400, 'a'); // 低分 A 贏
    const normal = updateRatings(1400, 1000, 'a'); // 高分 A 贏
    const upsetGain = upset.a - 1000;
    const normalGain = normal.a - 1400;
    expect(upsetGain).toBeGreaterThan(normalGain);
  });
  it('總分大致守恆（零和）', () => {
    const r = updateRatings(1320, 1180, 'b');
    expect(r.a + r.b).toBeGreaterThanOrEqual(1320 + 1180 - 1);
    expect(r.a + r.b).toBeLessThanOrEqual(1320 + 1180 + 1);
  });
});

describe('tierFor', () => {
  it('預設分數為 Bronze', () => {
    expect(tierFor(DEFAULT_RATING)).toBe('Bronze');
  });
  it('段位門檻邊界', () => {
    expect(tierFor(0)).toBe('Bronze');
    expect(tierFor(1099)).toBe('Bronze');
    expect(tierFor(1100)).toBe('Silver');
    expect(tierFor(1300)).toBe('Gold');
    expect(tierFor(1700)).toBe('Diamond');
    expect(tierFor(9999)).toBe('Master');
  });
});
