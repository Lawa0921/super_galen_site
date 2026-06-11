import { describe, it, expect } from 'vitest';
import { generateFloor } from './generate';
import { GRID_COLS, GRID_ROWS, SPAWN, BASE_ENEMY_COUNT } from './constants';
import { tileAt } from './board';

describe('generateFloor', () => {
  it('外框皆為 wall', () => {
    const { grid } = generateFloor(1, 1);
    for (let x = 0; x < GRID_COLS; x++) { expect(grid[0][x]).toBe('wall'); expect(grid[GRID_ROWS - 1][x]).toBe('wall'); }
    for (let y = 0; y < GRID_ROWS; y++) { expect(grid[y][0]).toBe('wall'); expect(grid[y][GRID_COLS - 1]).toBe('wall'); }
  });
  it('內側偶數座標為不可炸柱子', () => {
    const { grid } = generateFloor(1, 1);
    for (let y = 2; y < GRID_ROWS - 1; y += 2)
      for (let x = 2; x < GRID_COLS - 1; x += 2) expect(grid[y][x]).toBe('wall');
  });
  it('出生點與其兩鄰格淨空（可走）', () => {
    const { grid } = generateFloor(1, 1);
    expect(tileAt(grid, SPAWN.x, SPAWN.y)).toBe('floor');
    expect(tileAt(grid, SPAWN.x + 1, SPAWN.y)).toBe('floor');
    expect(tileAt(grid, SPAWN.x, SPAWN.y + 1)).toBe('floor');
  });
  it('同 seed/floor 完全可重現', () => {
    expect(JSON.stringify(generateFloor(123, 2))).toEqual(JSON.stringify(generateFloor(123, 2)));
  });
  it('第 1 層敵人數 = BASE_ENEMY_COUNT，且都站在 floor 上、不在出生格', () => {
    const { grid, enemies } = generateFloor(1, 1);
    expect(enemies).toHaveLength(BASE_ENEMY_COUNT);
    for (const e of enemies) {
      expect(grid[e.y][e.x]).toBe('floor');
      expect(e.x === SPAWN.x && e.y === SPAWN.y).toBe(false);
    }
  });
  it('深層敵人更多（floor 5 > floor 1）', () => {
    expect(generateFloor(1, 5).enemies.length).toBeGreaterThan(generateFloor(1, 1).enemies.length);
  });
  it('exit 落在可走的 floor 格', () => {
    const { grid, exit } = generateFloor(1, 1);
    expect(grid[exit.y][exit.x]).toBe('floor');
  });
  it('高層敵人數受可用格上限約束，且永不 throw', () => {
    const { enemies } = generateFloor(999, 50);
    expect(enemies.length).toBeGreaterThan(0);
    expect(enemies.length).toBeLessThanOrEqual(BASE_ENEMY_COUNT + 49);
  });

  it('敵人不會生在被牆/箱完全封死的格（至少一個 floor 鄰格）', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const floor of [1, 4, 8]) {
        const { grid, enemies } = generateFloor(seed, floor);
        for (const e of enemies) {
          const neighbors = [
            grid[e.y - 1]?.[e.x], grid[e.y + 1]?.[e.x],
            grid[e.y]?.[e.x - 1], grid[e.y]?.[e.x + 1],
          ];
          expect(
            neighbors.some((t) => t === 'floor'),
            `seed ${seed} floor ${floor} enemy@(${e.x},${e.y}) 被完全封死`,
          ).toBe(true);
        }
      }
    }
  });

  it('出口與所有敵人永遠在「非牆連通區」內（spawn 出發 flood-fill 可達）', () => {
    const reachable = (grid: ReturnType<typeof generateFloor>['grid']): Set<string> => {
      const seen = new Set<string>([`${SPAWN.x},${SPAWN.y}`]);
      const q = [[SPAWN.x, SPAWN.y]];
      while (q.length) {
        const [x, y] = q.pop()!;
        for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const nx = x+dx, ny = y+dy, k = `${nx},${ny}`;
          if (!seen.has(k) && grid[ny]?.[nx] && grid[ny][nx] !== 'wall') { seen.add(k); q.push([nx, ny]); }
        }
      }
      return seen;
    };
    for (let seed = 1; seed <= 50; seed++) {
      for (const floor of [1, 2, 5, 9]) {
        const { grid, exit, enemies } = generateFloor(seed, floor);
        const R = reachable(grid);
        expect(R.has(`${exit.x},${exit.y}`), `seed ${seed} floor ${floor} 出口被牆封死`).toBe(true);
        for (const e of enemies) {
          expect(R.has(`${e.x},${e.y}`), `seed ${seed} floor ${floor} 敵人@(${e.x},${e.y}) 不可達`).toBe(true);
        }
      }
    }
  });

  it('佈局原型有多樣性（2 層起跨 seeds 至少出現 3 種），且 1 層固定 classic', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(generateFloor(seed, 1).archetype).toBe('classic');
    }
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      for (const floor of [2, 3, 5, 8]) seen.add(generateFloor(seed, floor).archetype);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('crate 密度有層間變化（跨 seeds/樓層的 crate 數量不全相同）', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 10; seed++) {
      for (const floor of [2, 3, 4]) {
        const { grid } = generateFloor(seed, floor);
        counts.add(grid.flat().filter((t) => t === 'crate').length);
      }
    }
    expect(counts.size).toBeGreaterThan(5);
  });

  it('怪物種類隨樓層漸進：1 層只有基本款；2 層起有 ghost；3 層起有 dasher', () => {
    const kindsAt = (floor: number): Set<string> => {
      const s = new Set<string>();
      for (let seed = 1; seed <= 40; seed++) {
        for (const e of generateFloor(seed, floor).enemies) s.add(e.kind);
      }
      return s;
    };
    const f1 = kindsAt(1);
    expect([...f1].sort()).toEqual(['chaser', 'wander']); // 1 層絕無新怪
    const f2 = kindsAt(2);
    expect(f2.has('ghost')).toBe(true);
    expect(f2.has('dasher')).toBe(false); // dasher 3 層才出現
    const f3 = kindsAt(3);
    expect(f3.has('ghost')).toBe(true);
    expect(f3.has('dasher')).toBe(true);
    expect(f3.has('mimic')).toBe(false); // mimic 4 層才出現
    const f4 = kindsAt(4);
    expect(f4.has('mimic')).toBe(true);
    expect(f4.has('tank')).toBe(false);  // tank 5 層才出現
    const f5 = kindsAt(5);
    expect(f5.has('tank')).toBe(true);
    expect(f5.has('sapper')).toBe(false);   // sapper 6 層才出現
    const f6 = kindsAt(6);
    expect(f6.has('sapper')).toBe(true);
    expect(f6.has('splitter')).toBe(false); // splitter 7 層才出現
    const f7 = kindsAt(7);
    expect(f7.has('splitter')).toBe(true);
    expect(f7.has('mini')).toBe(false);     // mini 只由 splitter 分裂產生
  });
});
