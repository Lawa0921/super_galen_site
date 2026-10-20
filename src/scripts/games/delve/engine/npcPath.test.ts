import { describe, expect, it } from 'vitest';
import { World } from './world';
import { T } from './tiles';
import { buildHouse, flatWorld } from './houseFixture';
import { findPath, standable } from './npcPath';
import { Settlements, type SettleHost } from './settlement';
import { sunTimes } from './calendar';
import { TILE_SIZE as S } from './constants';

/** 高腳屋：地面在 32（腳踩 31）、房子內部 10..17 × 21..25、地板 26 + 地基 27；門在左牆，屋子下面可以走 */
function stilts(): World {
  const w = new World(80, 50);
  flatWorld(w, 32);
  buildHouse(w, 10, 21, 8, 5);
  for (let y = 28; y < 32; y++) w.setFg(18, y, T.AIR);
  return w;
}

describe('npc pathfinding', () => {
  it('walks straight on flat ground', () => {
    const w = new World(40, 20);
    flatWorld(w, 15);
    const p = findPath(w, 5, 14, 20);
    expect(p[0]).toEqual({ x: 5, y: 14 });
    expect(p[p.length - 1]).toEqual({ x: 20, y: 14 });
    expect(p.every((n) => n.y === 14)).toBe(true);
  });

  it('steps up one tile and jumps up two, but not three', () => {
    const w = new World(40, 20);
    flatWorld(w, 15);
    w.setFg(8, 14, T.STONE);                       // 1 格台階
    w.setFg(12, 14, T.STONE); w.setFg(12, 13, T.STONE); // 2 格
    let p = findPath(w, 5, 14, 16);
    expect(p[p.length - 1].x).toBe(16);
    for (let y = 11; y < 15; y++) w.setFg(20, y, T.STONE); // 4 格牆：過不去
    p = findPath(w, 14, 14, 30);
    expect(p[p.length - 1].x).toBeLessThan(20);
  });

  it('leaves through the door on the far side to reach a goal under the house', () => {
    const w = stilts();
    expect(standable(w, 14, 25)).toBe(true);
    const p = findPath(w, 15, 25, 14, 31);
    expect(p[p.length - 1]).toEqual({ x: 14, y: 31 });
    // 先往左走出門（x = 9），再掉下去、往右走到屋子下面
    const minX = Math.min(...p.map((n) => n.x));
    expect(minX).toBeLessThanOrEqual(8);
    expect(p.some((n) => n.x === 9 && n.y === 25)).toBe(true);
  });

  it('respects the node budget', () => {
    const w = new World(400, 20);
    flatWorld(w, 15);
    const p = findPath(w, 2, 14, 390, undefined, 50);
    expect(p.length).toBeLessThan(60);
    expect(p[p.length - 1].x).toBeLessThan(390);
  });

  it('a settler follows the path out of the door instead of pushing against the wall', () => {
    const w = stilts();
    w.setFg(40, 31, T.HEARTH);
    const s = new Settlements();
    s.found(40, 31);
    s.refresh(w, true);
    const h: SettleHost = { world: w, time: 0, isNight: () => false, sun: () => sunTimes(0), dayFrac: () => 0.5, playerTiles: () => [{ x: 30, y: 30 }], playerOverlaps: () => false };
    const n = s.moveIn('merchant', s.cores[0].id, w, true)!;
    n.body.x = 15 * S; n.body.y = 26 * S - n.body.h;
    for (let i = 0; i < 60 * 15; i++) {
      n.act = 'work'; n.targetX = 14.5 * S; n.goalY = 31; n.state = 'walk';
      s.update(1 / 60, h);
      n.act = 'work';
      if (Math.floor((n.body.y + n.body.h - 1) / S) === 31 && Math.abs(n.body.x + n.body.w / 2 - 14.5 * S) < 4) break;
    }
    expect(Math.floor((n.body.y + n.body.h - 1) / S)).toBe(31);
    expect(Math.abs(n.body.x + n.body.w / 2 - 14.5 * S)).toBeLessThan(8);
    expect(w.getFg(9, 25)).toBe(T.DOOR_CLOSED); // 走過後門關回去
  });
});
