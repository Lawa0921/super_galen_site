// collision.test.ts
import { describe, it, expect } from 'vitest';
import { circleHit, sweepPlayerVsBullets } from './collision';
import { BulletPool } from './bullet';
import { makePlayer } from './player';
import { PLAYER_HIT_R, GRAZE_R } from './constants';

describe('circleHit', () => {
  it('距離小於半徑和時為 true', () => {
    expect(circleHit(0, 0, 5, 8, 0, 4)).toBe(true);
    expect(circleHit(0, 0, 5, 10, 0, 4)).toBe(false);
  });
});

describe('sweepPlayerVsBullets', () => {
  it('子彈進入擦彈圈：計 1 次擦彈並標記 grazed', () => {
    const pool = new BulletPool(4);
    const p = makePlayer();
    const b = pool.spawn({ x: p.x + GRAZE_R - 1, y: p.y, vx: 0, vy: 0, kind: 'rune' })!;
    const r1 = sweepPlayerVsBullets(p, pool, 1);
    expect(r1.hit).toBe(false);
    expect(r1.grazes).toBe(1);
    expect(b.grazed).toBe(true);
    const r2 = sweepPlayerVsBullets(p, pool, 1); // 同顆不重複計
    expect(r2.grazes).toBe(0);
  });

  it('子彈進入被彈圈：hit=true 且該彈回收', () => {
    const pool = new BulletPool(4);
    const p = makePlayer();
    const b = pool.spawn({ x: p.x + PLAYER_HIT_R - 1, y: p.y, vx: 0, vy: 0, kind: 'rune' })!;
    const r = sweepPlayerVsBullets(p, pool, 1);
    expect(r.hit).toBe(true);
    expect(b.active).toBe(false);
  });

  it('hitboxMult 縮小被彈圈（咒速羽毛）', () => {
    const pool = new BulletPool(4);
    const p = makePlayer();
    // 距離放在縮小後（mult=0.5）判定圈外、全尺寸判定圈內
    pool.spawn({ x: p.x + (PLAYER_HIT_R + 4) * 0.9, y: p.y, vx: 0, vy: 0, kind: 'rune' });
    const shrunk = sweepPlayerVsBullets(p, pool, 0.5);
    expect(shrunk.hit).toBe(false);
  });

  it('無敵中不判 hit 但仍可擦彈', () => {
    const pool = new BulletPool(4);
    const p = makePlayer();
    p.invulnMs = 1000;
    pool.spawn({ x: p.x, y: p.y, vx: 0, vy: 0, kind: 'rune' });
    const r = sweepPlayerVsBullets(p, pool, 1);
    expect(r.hit).toBe(false);
    expect(r.grazes).toBeGreaterThan(0); // 無敵仍可累積超載
  });
});
