// enemy.test.ts
import { describe, it, expect } from 'vitest';
import { chooseEnemyDir } from './enemy';
import { createRng } from './rng';
import type { Grid, Enemy, Vec } from './types';

function corridor(): Grid {
  // 3 列：中列為 floor 走廊
  return [
    ['wall', 'wall', 'wall', 'wall', 'wall'],
    ['wall', 'floor', 'floor', 'floor', 'wall'],
    ['wall', 'wall', 'wall', 'wall', 'wall'],
  ];
}

describe('chooseEnemyDir', () => {
  it('chaser 朝玩家方向（玩家在右 -> right）', () => {
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'left', kind: 'chaser', moveAccMs: 0, alive: true };
    const player: Vec = { x: 3, y: 1 };
    expect(chooseEnemyDir(corridor(), e, player, [], createRng(1))).toBe('right');
  });
  it('不會選到 wall（死路時回傳 null）', () => {
    const boxed: Grid = [['wall','wall','wall'],['wall','floor','wall'],['wall','wall','wall']];
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'up', kind: 'wander', moveAccMs: 0, alive: true };
    expect(chooseEnemyDir(boxed, e, { x: 1, y: 1 }, [], createRng(1))).toBeNull();
  });
  it('bomb 視為阻擋', () => {
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'right', kind: 'chaser', moveAccMs: 0, alive: true };
    const dir = chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [{ x: 2, y: 1, fuseMs: 1000, range: 1 }], createRng(1));
    expect(dir).toBeNull(); // 右邊被炸彈擋、其他方向是 wall
  });
  it('wander：能直走且亂數<0.8 時保持原方向', () => {
    // 走廊中列：左右皆 floor。enemy 朝右、右邊開放
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'right', kind: 'wander', moveAccMs: 0, alive: true };
    expect(chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [], () => 0)).toBe('right');
  });
  it('wander：無法直走時改選一個開放方向', () => {
    // enemy 朝上（上方是 wall，不能直走），必須回傳一個開放方向（走廊裡是 left 或 right）
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'up', kind: 'wander', moveAccMs: 0, alive: true };
    const d = chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [], () => 0.99);
    expect(['left', 'right']).toContain(d);
  });
});
