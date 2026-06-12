// pattern.test.ts
import { describe, it, expect } from 'vitest';
import { ring, fan, aimed, spiral, bellWave } from './pattern';

const SPEED = 120;

describe('pattern', () => {
  it('ring：n 顆等角分佈、速率一致', () => {
    const out = ring({ x: 240, y: 100, n: 8, speed: SPEED, kind: 'rune' });
    expect(out).toHaveLength(8);
    for (const b of out) expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(SPEED);
    // 等角：相鄰兩顆夾角 = 2π/8
    const a0 = Math.atan2(out[0].vy, out[0].vx);
    const a1 = Math.atan2(out[1].vy, out[1].vx);
    const diff = (a1 - a0 + 2 * Math.PI) % (2 * Math.PI); // wrap-safe
    expect(diff).toBeCloseTo(Math.PI / 4, 5);
  });

  it('ring：offset 旋轉整圈起始角', () => {
    const a = ring({ x: 0, y: 0, n: 4, speed: SPEED, kind: 'rune' });
    const b = ring({ x: 0, y: 0, n: 4, speed: SPEED, kind: 'rune', offset: Math.PI / 4 });
    const angA = Math.atan2(a[0].vy, a[0].vx);
    const angB = Math.atan2(b[0].vy, b[0].vx);
    expect(angB - angA).toBeCloseTo(Math.PI / 4, 5);
  });

  it('fan：以 aim 為中心展開 spread 弧', () => {
    const out = fan({ x: 0, y: 0, n: 3, speed: SPEED, aim: Math.PI / 2, spread: Math.PI / 4, kind: 'page' });
    expect(out).toHaveLength(3);
    const mid = out[1];
    expect(Math.atan2(mid.vy, mid.vx)).toBeCloseTo(Math.PI / 2, 5);
  });

  it('aimed：朝目標點直射', () => {
    const [b] = aimed({ x: 0, y: 0, tx: 100, ty: 0, speed: SPEED, kind: 'rune' });
    expect(b.vx).toBeCloseTo(SPEED);
    expect(b.vy).toBeCloseTo(0);
  });

  it('spiral：依時間旋進、帶 turnRate', () => {
    const a = spiral({ x: 0, y: 0, tMs: 0, armN: 2, speed: SPEED, rate: 1, kind: 'gear' });
    const b = spiral({ x: 0, y: 0, tMs: 500, armN: 2, speed: SPEED, rate: 1, kind: 'gear' });
    expect(a).toHaveLength(2);
    const angA = Math.atan2(a[0].vy, a[0].vx);
    const angB = Math.atan2(b[0].vy, b[0].vx);
    expect(angB).not.toBeCloseTo(angA, 2); // 不同時間發射角不同
  });

  it('bellWave：完整圓環挖出缺口（gapWidth 弧內無子彈）', () => {
    const gapAt = Math.PI / 2, gapWidth = Math.PI / 6;
    const out = bellWave({ x: 240, y: 160, n: 36, speed: SPEED, gapAt, gapWidth });
    expect(out.length).toBeLessThan(36);   // 有挖掉
    expect(out.length).toBeGreaterThan(28);
    for (const b of out) {
      const ang = Math.atan2(b.vy, b.vx);
      let d = Math.abs(ang - gapAt);
      d = Math.min(d, 2 * Math.PI - d);
      expect(d).toBeGreaterThanOrEqual(gapWidth / 2 - 1e-9); // 缺口內沒有彈
    }
    for (const b of out) expect(b.kind).toBe('bell');
    // 行為驗證（不重複實作公式）：缺口中心方向無彈、缺口外緊鄰方向有彈
    const dirOf = (vx: number, vy: number): number => Math.atan2(vy, vx);
    const nearGapCenter = out.some((b) => Math.abs(dirOf(b.vx, b.vy) - gapAt) < gapWidth / 4);
    const justOutside = out.some((b) => Math.abs(dirOf(b.vx, b.vy) - (gapAt + gapWidth)) < Math.PI / 18);
    expect(nearGapCenter).toBe(false);
    expect(justOutside).toBe(true);
  });
});
