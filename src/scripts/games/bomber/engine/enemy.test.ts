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
    expect(chooseEnemyDir(corridor(), e, player, [], [], createRng(1))).toBe('right');
  });
  it('不會選到 wall（死路時回傳 null）', () => {
    const boxed: Grid = [['wall','wall','wall'],['wall','floor','wall'],['wall','wall','wall']];
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'up', kind: 'wander', moveAccMs: 0, alive: true };
    expect(chooseEnemyDir(boxed, e, { x: 1, y: 1 }, [], [], createRng(1))).toBeNull();
  });
  it('bomb 視為阻擋', () => {
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'right', kind: 'chaser', moveAccMs: 0, alive: true };
    const dir = chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [{ x: 2, y: 1, fuseMs: 1000, range: 1 }], [], createRng(1));
    expect(dir).toBeNull(); // 右邊被炸彈擋、其他方向是 wall
  });
  it('wander：能直走且亂數<0.8 時保持原方向', () => {
    // 走廊中列：左右皆 floor。enemy 朝右、右邊開放
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'right', kind: 'wander', moveAccMs: 0, alive: true };
    expect(chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [], [], () => 0)).toBe('right');
  });
  it('wander：無法直走時改選一個開放方向', () => {
    // enemy 朝上（上方是 wall，不能直走），必須回傳一個開放方向（走廊裡是 left 或 right）
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'up', kind: 'wander', moveAccMs: 0, alive: true };
    const d = chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [], [], () => 0.99);
    expect(['left', 'right']).toContain(d);
  });
});

describe('chooseEnemyDir: 危險感知（不腦殘走進爆風）', () => {
  it('wander 不會直走進現存爆風格：安全格上寧可停住（null）', () => {
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'right', kind: 'wander', moveAccMs: 0, alive: true };
    // 走廊上唯一開放方向 right=(2,1) 是現存爆風 → 停住
    const d = chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [], [{ x: 2, y: 1, ttlMs: 300 }], () => 0);
    expect(d).toBeNull();
  });
  it('chaser 也不會為了追玩家走進爆風', () => {
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'left', kind: 'chaser', moveAccMs: 0, alive: true };
    const d = chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [], [{ x: 2, y: 1, ttlMs: 300 }], createRng(1));
    expect(d).toBeNull();
  });
  it('預判快爆的炸彈（fuse 將盡）：避開其爆風範圍', () => {
    // 5 格走廊，炸彈在 (3,1) fuse 300ms range1 → 危險格含 (2,1)；敵人在 (1,1) 唯一開放方向是 right=(2,1)
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'right', kind: 'wander', moveAccMs: 0, alive: true };
    const d = chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [{ x: 3, y: 1, fuseMs: 300, range: 1 }], [], () => 0);
    expect(d).toBeNull(); // (2,1) 在即將引爆的範圍內 → 停住
  });
  it('炸彈引信還長（不急）：照常通行其未來爆風格', () => {
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'right', kind: 'wander', moveAccMs: 0, alive: true };
    const d = chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [{ x: 3, y: 1, fuseMs: 1800, range: 1 }], [], () => 0);
    expect(d).toBe('right'); // (2,1) 尚不危險
  });
  it('已站在爆風中：往任一開放方向逃命（不停在火裡）', () => {
    const e: Enemy = { id: 0, x: 1, y: 1, prevX: 1, prevY: 1, dir: 'right', kind: 'wander', moveAccMs: 0, alive: true };
    // 自己腳下 (1,1) 是爆風，右邊 (2,1) 也是爆風 → 沒有安全方向，但站著必死 → 選開放方向逃
    const d = chooseEnemyDir(corridor(), e, { x: 3, y: 1 }, [], [{ x: 1, y: 1, ttlMs: 300 }, { x: 2, y: 1, ttlMs: 300 }], () => 0);
    expect(d).toBe('right');
  });
});
