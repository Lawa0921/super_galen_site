import type { Grid, Enemy, FloorLayout, PowerUpKind, Dir } from './types';
import {
  GRID_COLS, GRID_ROWS, SPAWN, CRATE_DENSITY, POWERUP_DROP_RATE,
  BASE_ENEMY_COUNT,
} from './constants';
import { createRng } from './rng';

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const POWERUPS: PowerUpKind[] = ['fire', 'bomb', 'speed', 'shield'];
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

/** 依 seed 與層數產生一層：grid + 敵人 + 藏在軟箱下的道具 + 出口。 */
export function generateFloor(seed: number, floor: number): FloorLayout {
  const rng = createRng((seed ^ (floor * 0x9e3779b1)) >>> 0);
  const safe = new Set([
    `${SPAWN.x},${SPAWN.y}`,
    `${SPAWN.x + 1},${SPAWN.y}`,
    `${SPAWN.x},${SPAWN.y + 1}`,
  ]);
  const grid: Grid = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    const row: Grid[number] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      const border = x === 0 || y === 0 || x === GRID_COLS - 1 || y === GRID_ROWS - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      if (border || pillar) row.push('wall');
      else if (!safe.has(`${x},${y}`) && rng() < CRATE_DENSITY) row.push('crate');
      else row.push('floor');
    }
    grid.push(row);
  }

  // 藏道具在部分軟箱底下
  const hiddenPowerUps: Record<string, PowerUpKind> = {};
  for (let y = 1; y < GRID_ROWS - 1; y++)
    for (let x = 1; x < GRID_COLS - 1; x++)
      if (grid[y][x] === 'crate' && rng() < POWERUP_DROP_RATE)
        hiddenPowerUps[`${x},${y}`] = POWERUPS[Math.floor(rng() * POWERUPS.length)];

  // 收集所有 floor 格（排除出生安全區）供敵人 / 出口佈點
  const floors: { x: number; y: number }[] = [];
  for (let y = 1; y < GRID_ROWS - 1; y++)
    for (let x = 1; x < GRID_COLS - 1; x++)
      if (grid[y][x] === 'floor' && !safe.has(`${x},${y}`)) floors.push({ x, y });

  // 出口：離出生點最遠的 floor 格（穩定、可重現）
  const exit = floors.reduce((best, c) =>
    (Math.abs(c.x - SPAWN.x) + Math.abs(c.y - SPAWN.y)) >
    (Math.abs(best.x - SPAWN.x) + Math.abs(best.y - SPAWN.y)) ? c : best,
    floors[0] ?? { x: GRID_COLS - 2, y: GRID_ROWS - 2 });

  // 敵人：第 floor 層 = BASE + (floor-1)，從遠離出生點的 floor 格隨機挑
  const count = BASE_ENEMY_COUNT + (floor - 1);
  const candidates = shuffle(
    floors.filter((c) => Math.abs(c.x - SPAWN.x) + Math.abs(c.y - SPAWN.y) >= 4),
    rng,
  );
  const enemies: Enemy[] = [];
  for (let i = 0; i < count && i < candidates.length; i++) {
    const c = candidates[i];
    enemies.push({
      id: i, x: c.x, y: c.y, prevX: c.x, prevY: c.y,
      dir: DIRS[Math.floor(rng() * 4)],
      kind: rng() < 0.5 ? 'chaser' : 'wander',
      moveAccMs: 0, alive: true,
    });
  }

  return { grid, enemies, hiddenPowerUps, exit };
}
