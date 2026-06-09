/**
 * N 人名次制 ELO 測試（TDD）。
 * 最關鍵：N=2 時數學退化為 1v1 updateRatings。
 */
import { describe, it, expect } from 'vitest';
import { placementScore, updateRatingsNWay } from './ffaElo';
import { updateRatings } from './elo';

// ---------------------------------------------------------------------------
// placementScore 基本正確
// ---------------------------------------------------------------------------
describe('placementScore', () => {
  it('我比對手名次前（數字小）→ 1', () => {
    expect(placementScore(1, 2)).toBe(1);
    expect(placementScore(1, 8)).toBe(1);
    expect(placementScore(3, 7)).toBe(1);
  });

  it('我比對手名次後（數字大）→ 0', () => {
    expect(placementScore(2, 1)).toBe(0);
    expect(placementScore(8, 1)).toBe(0);
    expect(placementScore(7, 3)).toBe(0);
  });

  it('同名次 → 0.5', () => {
    expect(placementScore(1, 1)).toBe(0.5);
    expect(placementScore(3, 3)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// N=2 等價：updateRatingsNWay 必須與 updateRatings 逐位相同
// ---------------------------------------------------------------------------
describe('N=2 退化等價（最關鍵）', () => {
  it('1000 vs 1200，a 贏（placement 1）', () => {
    const ffa = updateRatingsNWay([
      { id: 'a', rating: 1000, placement: 1 },
      { id: 'b', rating: 1200, placement: 2 },
    ]);
    const v1v1 = updateRatings(1000, 1200, 'a');
    expect(ffa['a']).toBe(v1v1.a);
    expect(ffa['b']).toBe(v1v1.b);
  });

  it('1000 vs 1200，b 贏（placement 1）', () => {
    const ffa = updateRatingsNWay([
      { id: 'a', rating: 1000, placement: 2 },
      { id: 'b', rating: 1200, placement: 1 },
    ]);
    const v1v1 = updateRatings(1000, 1200, 'b');
    expect(ffa['a']).toBe(v1v1.a);
    expect(ffa['b']).toBe(v1v1.b);
  });

  it('1500 vs 1500，a 贏', () => {
    const ffa = updateRatingsNWay([
      { id: 'a', rating: 1500, placement: 1 },
      { id: 'b', rating: 1500, placement: 2 },
    ]);
    const v1v1 = updateRatings(1500, 1500, 'a');
    expect(ffa['a']).toBe(v1v1.a);
    expect(ffa['b']).toBe(v1v1.b);
  });

  it('800 vs 1600，b 贏（冷門）', () => {
    const ffa = updateRatingsNWay([
      { id: 'a', rating: 800, placement: 2 },
      { id: 'b', rating: 1600, placement: 1 },
    ]);
    const v1v1 = updateRatings(800, 1600, 'b');
    expect(ffa['a']).toBe(v1v1.a);
    expect(ffa['b']).toBe(v1v1.b);
  });
});

// ---------------------------------------------------------------------------
// 3 人：合理方向
// ---------------------------------------------------------------------------
describe('N=3 合理方向', () => {
  it('實力相近：名次 1 漲、名次 3 跌、名次 2 介中', () => {
    const before = { a: 1000, b: 1000, c: 1000 };
    const result = updateRatingsNWay([
      { id: 'a', rating: before.a, placement: 1 },
      { id: 'b', rating: before.b, placement: 2 },
      { id: 'c', rating: before.c, placement: 3 },
    ]);
    expect(result['a']).toBeGreaterThan(before.a);   // 冠軍漲
    expect(result['c']).toBeLessThan(before.c);       // 末位跌
    expect(result['b']).toBeGreaterThan(before.b - 1); // 中間介中（可輕漲或輕跌）
    expect(result['b']).toBeLessThan(before.b + 1);   // 中間介中
    // 名次越前越高
    expect(result['a']).toBeGreaterThan(result['b']);
    expect(result['b']).toBeGreaterThan(result['c']);
  });

  it('高 rating 拿差名次，跌分比低 rating 拿差名次更多', () => {
    // a 是高手(1400)卻拿第 3，b 是新手(800)也拿第 3 → a 跌更多
    const highRated = updateRatingsNWay([
      { id: 'a', rating: 1400, placement: 3 },
      { id: 'b', rating: 1000, placement: 1 },
      { id: 'c', rating: 1000, placement: 2 },
    ]);
    const lowRated = updateRatingsNWay([
      { id: 'a', rating: 800, placement: 3 },
      { id: 'b', rating: 1000, placement: 1 },
      { id: 'c', rating: 1000, placement: 2 },
    ]);
    const highDrop = 1400 - highRated['a'];   // 跌分量（正值）
    const lowDrop = 800 - lowRated['a'];
    expect(highDrop).toBeGreaterThan(lowDrop);
  });
});

// ---------------------------------------------------------------------------
// 8 人：冠軍漲、墊底跌
// ---------------------------------------------------------------------------
describe('N=8 合理方向', () => {
  it('相同 rating，冠軍漲、墊底跌', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      rating: 1000,
      placement: i + 1,
    }));
    const result = updateRatingsNWay(players);
    expect(result['p1']).toBeGreaterThan(1000);  // 冠軍漲
    expect(result['p8']).toBeLessThan(1000);      // 墊底跌
    // 名次越前，rating 越高
    for (let i = 1; i <= 7; i++) {
      expect(result[`p${i}`]).toBeGreaterThanOrEqual(result[`p${i + 1}`]);
    }
  });

  it('8 人總分不變（理論上整數四捨五入有微差）', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      rating: 1000,
      placement: i + 1,
    }));
    const result = updateRatingsNWay(players);
    const totalBefore = players.reduce((s, p) => s + p.rating, 0);
    const totalAfter = Object.values(result).reduce((s, r) => s + r, 0);
    // 允許四捨五入造成最多 ±N 的誤差
    expect(Math.abs(totalAfter - totalBefore)).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// 邊界：N=1
// ---------------------------------------------------------------------------
describe('邊界情況', () => {
  it('N=1：rating 不變', () => {
    const result = updateRatingsNWay([{ id: 'solo', rating: 1234, placement: 1 }]);
    expect(result['solo']).toBe(1234);
  });
});
