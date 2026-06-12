// enemy.test.ts
import { describe, it, expect } from 'vitest';
import { ENEMY_DEFS, makeEnemy, stepEnemy } from './enemy';
import { FIELD_H } from './constants';

describe('enemy', () => {
  it('9 種敵兵都有定義（hp/速度/開火參數）', () => {
    const kinds = ['bat', 'wisp', 'fairy', 'tome', 'blade', 'gear', 'angel', 'moth', 'chime'] as const;
    for (const k of kinds) {
      const d = ENEMY_DEFS[k];
      expect(d.hp).toBeGreaterThan(0);
      expect(d.fireIntervalMs).toBeGreaterThan(0);
    }
  });

  it('descend 路徑往下移動', () => {
    const e = makeEnemy(1, 'bat', 100, -20, 'descend');
    stepEnemy(e, 1000, { px: 240, py: 560 });
    expect(e.y).toBeGreaterThan(-20);
  });

  it('sine 路徑左右擺、整體下移', () => {
    const e = makeEnemy(1, 'fairy', 200, 0, 'sine');
    const xs: number[] = [];
    for (let i = 0; i < 30; i++) { stepEnemy(e, 100, { px: 240, py: 560 }); xs.push(e.x); }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10); // 有橫向擺動
    expect(e.y).toBeGreaterThan(0);
  });

  it('hover 路徑下降到定點後停住', () => {
    const e = makeEnemy(1, 'tome', 100, -20, 'hover');
    for (let i = 0; i < 100; i++) stepEnemy(e, 100, { px: 240, py: 560 });
    expect(e.y).toBeLessThan(FIELD_H * 0.4); // 停在上半場
  });

  it('開火冷卻歸零時回傳彈幕並重置冷卻', () => {
    const e = makeEnemy(1, 'bat', 240, 100, 'descend');
    e.fireCdMs = 0;
    const out = stepEnemy(e, 16, { px: 240, py: 560 });
    expect(out.length).toBeGreaterThan(0);
    expect(e.fireCdMs).toBe(ENEMY_DEFS.bat.fireIntervalMs);
  });

  it('冷卻未到不開火', () => {
    const e = makeEnemy(1, 'bat', 240, 100, 'descend');
    e.fireCdMs = 5000;
    expect(stepEnemy(e, 16, { px: 240, py: 560 })).toHaveLength(0);
  });
});
