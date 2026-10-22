// game.balance.test.ts — 新玩家第一夜：起始裝備有武器；出生點第一夜同時在附近的怪物不超過 3 隻，站著不動不會很快死
// （修正前：沒裝備站著不動 ~14 秒被 9 隻怪打死；現在完全掛機也要撐 30 秒以上，拿木劍就打得過）
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { starterInventory } from './inventory';
import { ENEMIES } from './enemies';
import { DAY_LENGTH, FIXED_DT, TILE_SIZE as S } from './constants';

describe('新玩家平衡', { timeout: 120_000 }, () => {
  it('起始背包有木劍（能打怪）', () => {
    const inv = starterInventory();
    expect(inv.count('wood_sword')).toBe(1);
    expect(inv.count('wood_pickaxe')).toBe(1);
    expect(inv.count('torch')).toBe(10);
  });

  it('第一夜在出生點站著不動：附近怪物最多 3 隻、掛機 30 秒內不會死', () => {
    const g = new DelveGame({ seed: 'first-night', width: 900, height: 400 });
    g.time = DAY_LENGTH * 0.8 + 1; // 第一夜剛開始
    let maxNear = 0, died = false;
    for (let i = 0; i < 60 * 60; i++) {
      g.step(FIXED_DT);
      if (g.dead && i < 60 * 30) died = true;
      const pc = g.playerCenter();
      const near = g.enemies.filter((e) => !ENEMIES[e.kind].minion
        && Math.abs(e.body.x / S - pc.x / S) < 80 && Math.abs(e.body.y / S - pc.y / S) < 56).length;
      maxNear = Math.max(maxNear, near);
    }
    expect(maxNear).toBeLessThanOrEqual(3);
    expect(died).toBe(false);
  });
});
