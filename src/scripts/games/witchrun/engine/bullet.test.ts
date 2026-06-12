// bullet.test.ts
import { describe, it, expect } from 'vitest';
import { BulletPool } from './bullet';
import { MAX_ENEMY_BULLETS } from './constants';

describe('BulletPool', () => {
  it('spawn 啟用一顆子彈並設定屬性', () => {
    const pool = new BulletPool(8);
    const b = pool.spawn({ x: 10, y: 20, vx: 0, vy: 100, kind: 'rune' });
    expect(b).not.toBeNull();
    expect(b!.active).toBe(true);
    expect(b!.r).toBeGreaterThan(0); // 依 kind 帶入判定半徑
    expect(pool.countActive()).toBe(1);
  });

  it('池滿時 spawn 回傳 null（不擴池）', () => {
    const pool = new BulletPool(2);
    pool.spawn({ x: 0, y: 0, vx: 0, vy: 1, kind: 'rune' });
    pool.spawn({ x: 0, y: 0, vx: 0, vy: 1, kind: 'rune' });
    expect(pool.spawn({ x: 0, y: 0, vx: 0, vy: 1, kind: 'rune' })).toBeNull();
  });

  it('step 依速度積分位置', () => {
    const pool = new BulletPool(4);
    const b = pool.spawn({ x: 0, y: 0, vx: 100, vy: 50, kind: 'rune' })!;
    pool.step(1000);
    expect(b.x).toBeCloseTo(100);
    expect(b.y).toBeCloseTo(50);
  });

  it('加速度改變速度', () => {
    const pool = new BulletPool(4);
    const b = pool.spawn({ x: 0, y: 0, vx: 0, vy: 100, ay: 100, kind: 'rune' })!;
    pool.step(1000);
    expect(b.vy).toBeCloseTo(200);
  });

  it('turnRate 旋轉速度向量、速率不變', () => {
    const pool = new BulletPool(4);
    const b = pool.spawn({ x: 0, y: 0, vx: 100, vy: 0, turnRate: Math.PI / 2, kind: 'rune' })!;
    pool.step(1000); // 轉 90 度
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(100, 0);
    expect(b.vx).toBeCloseTo(0, 0);
  });

  it('出界（含 margin）自動回收', () => {
    const pool = new BulletPool(4);
    pool.spawn({ x: 240, y: 630, vx: 0, vy: 800, kind: 'rune' });
    pool.step(1000);
    expect(pool.countActive()).toBe(0);
  });

  it('clearAll 回收所有子彈並回傳數量', () => {
    const pool = new BulletPool(8);
    pool.spawn({ x: 1, y: 1, vx: 0, vy: 1, kind: 'rune' });
    pool.spawn({ x: 2, y: 2, vx: 0, vy: 1, kind: 'wave' });
    expect(pool.clearAll()).toBe(2);
    expect(pool.countActive()).toBe(0);
  });

  it('預設池上限為 MAX_ENEMY_BULLETS', () => {
    const pool = new BulletPool();
    expect(pool.capacity).toBe(MAX_ENEMY_BULLETS);
  });

  // ---- F1.2：反射與 speedMult ----
  it('bounces=0 出左界即回收', () => {
    const pool = new BulletPool(4);
    const b = pool.spawn({ x: 5, y: 300, vx: -200, vy: 0, kind: 'rune', bounces: 0 })!;
    pool.step(1000); // 5 - 200 = -195，超出左界無 bounces → 回收
    expect(b.active).toBe(false);
  });

  it('bounces=1 第一次出左界反射；vx 反向，bounces 減 1', () => {
    const pool = new BulletPool(4);
    const b = pool.spawn({ x: 5, y: 300, vx: -200, vy: 0, kind: 'rune', bounces: 1 })!;
    pool.step(100); // 5 - 20 = -15 → 出左界，反射
    expect(b.active).toBe(true);
    expect(b.vx).toBeGreaterThan(0);  // 反向
    expect(b.bounces).toBe(0);
  });

  it('bounces=1 第二次出界（第一次已反射）→ 回收', () => {
    const pool = new BulletPool(4);
    // 先讓它反射一次
    const b = pool.spawn({ x: 5, y: 300, vx: -200, vy: 0, kind: 'rune', bounces: 1 })!;
    pool.step(100); // 反射 → bounces=0, vx>0
    expect(b.bounces).toBe(0);
    // 現在向右走超出右界
    b.x = 475; b.vx = 200;
    pool.step(1000);
    expect(b.active).toBe(false);
  });

  it('speedMult=0 完全凍結（位置/速度/turnRate 全不動）', () => {
    const pool = new BulletPool(4);
    const b = pool.spawn({ x: 100, y: 200, vx: 100, vy: 50, ax: 20, turnRate: 1, kind: 'rune' })!;
    const x0 = b.x, y0 = b.y, vx0 = b.vx, vy0 = b.vy;
    pool.step(200, 0);
    expect(b.x).toBeCloseTo(x0);
    expect(b.y).toBeCloseTo(y0);
    expect(b.vx).toBeCloseTo(vx0);
    expect(b.vy).toBeCloseTo(vy0);
  });

  it('speedMult=1.15 位移等比放大（vs speedMult=1）', () => {
    // speedMult=1
    const p1 = new BulletPool(4);
    const b1 = p1.spawn({ x: 200, y: 200, vx: 100, vy: 0, kind: 'rune' })!;
    p1.step(1000, 1);
    // speedMult=1.15
    const p2 = new BulletPool(4);
    const b2 = p2.spawn({ x: 200, y: 200, vx: 100, vy: 0, kind: 'rune' })!;
    p2.step(1000, 1.15);
    expect(b2.x - 200).toBeCloseTo((b1.x - 200) * 1.15, 1);
  });
});
