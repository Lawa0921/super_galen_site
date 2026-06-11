import type { Grid, Enemy, FloorLayout, FloorArchetype, PowerUpKind, Dir, EnemyKind } from './types';
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

const ARCHETYPES: FloorArchetype[] = ['classic', 'chambers', 'arena', 'maze'];

/** 依 seed 與層數產生一層：grid + 敵人 + 藏在軟箱下的道具 + 出口。
 *  佈局原型：1 層固定 classic（溫和起步），2 層起每層隨機抽——
 *  classic 經典柱陣 / chambers 房室隔牆（留門） / arena 開闊疏柱 / maze 迷宮斷牆。
 *  crate 密度每層浮動；出口與敵人一律取自 spawn 出發的非牆連通區（牆封不死）。 */
export function generateFloor(seed: number, floor: number): FloorLayout {
  const rng = createRng((seed ^ (floor * 0x9e3779b1)) >>> 0);
  const safe = new Set([
    `${SPAWN.x},${SPAWN.y}`,
    `${SPAWN.x + 1},${SPAWN.y}`,
    `${SPAWN.x},${SPAWN.y + 1}`,
  ]);

  const archetype: FloorArchetype =
    floor === 1 ? 'classic' : ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];

  // 柱陣：arena 疏柱（隔行抽柱），其餘經典 2x2
  const isPillar = (x: number, y: number): boolean =>
    archetype === 'arena'
      ? x % 4 === 0 && y % 2 === 0
      : x % 2 === 0 && y % 2 === 0;

  // crate 密度：原型修正 × 每層 ±15% 浮動
  const densityMod = archetype === 'arena' ? 0.7 : archetype === 'maze' ? 1.15 : 1;
  const density = Math.min(0.85, CRATE_DENSITY * densityMod * (0.85 + rng() * 0.3));

  const grid: Grid = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    const row: Grid[number] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      const border = x === 0 || y === 0 || x === GRID_COLS - 1 || y === GRID_ROWS - 1;
      if (border || isPillar(x, y)) row.push('wall');
      else if (!safe.has(`${x},${y}`) && rng() < density) row.push('crate');
      else row.push('floor');
    }
    grid.push(row);
  }

  // chambers：縱向隔牆（留 2 個門）＋ 50% 加一道橫牆（留 2 個門）
  if (archetype === 'chambers') {
    const vx = [4, 6, 8][Math.floor(rng() * 3)];
    const doorYs = new Set([1 + Math.floor(rng() * (GRID_ROWS - 2)), 1 + Math.floor(rng() * (GRID_ROWS - 2))]);
    for (let y = 1; y < GRID_ROWS - 1; y++) {
      if (!doorYs.has(y) && !safe.has(`${vx},${y}`)) grid[y][vx] = 'wall';
    }
    if (rng() < 0.5) {
      const hy = [4, 6][Math.floor(rng() * 2)];
      const doorXs = new Set([1 + Math.floor(rng() * (GRID_COLS - 2)), 1 + Math.floor(rng() * (GRID_COLS - 2))]);
      for (let x = 1; x < GRID_COLS - 1; x++) {
        if (!doorXs.has(x) && !safe.has(`${x},${hy}`)) grid[hy][x] = 'wall';
      }
    }
  }

  // maze：4-6 段短牆（長 2-3，避開安全區）
  if (archetype === 'maze') {
    const segs = 4 + Math.floor(rng() * 3);
    for (let s = 0; s < segs; s++) {
      const horizontal = rng() < 0.5;
      const len = 2 + Math.floor(rng() * 2);
      const sx = 1 + Math.floor(rng() * (GRID_COLS - 2 - (horizontal ? len : 0)));
      const sy = 1 + Math.floor(rng() * (GRID_ROWS - 2 - (horizontal ? 0 : len)));
      for (let i = 0; i < len; i++) {
        const x = sx + (horizontal ? i : 0);
        const y = sy + (horizontal ? 0 : i);
        if (!safe.has(`${x},${y}`) && grid[y]?.[x]) grid[y][x] = 'wall';
      }
    }
  }

  // 非牆連通區（crate 可炸、ghost 可穿 → 以「非牆」算可達）：
  // 出口與敵人只從這裡挑，保證牆永遠封不死進度。
  const reach = new Set<string>([`${SPAWN.x},${SPAWN.y}`]);
  {
    const q: [number, number][] = [[SPAWN.x, SPAWN.y]];
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (!reach.has(k) && grid[ny]?.[nx] && grid[ny][nx] !== 'wall') {
          reach.add(k);
          q.push([nx, ny]);
        }
      }
    }
  }

  // 藏道具在部分軟箱底下
  const hiddenPowerUps: Record<string, PowerUpKind> = {};
  for (let y = 1; y < GRID_ROWS - 1; y++)
    for (let x = 1; x < GRID_COLS - 1; x++)
      if (grid[y][x] === 'crate' && rng() < POWERUP_DROP_RATE) {
        const r = rng();
        hiddenPowerUps[`${x},${y}`] = r < 0.1 ? 'heart' : POWERUPS[Math.floor((r - 0.1) / 0.9 * POWERUPS.length)];
      }

  // 收集「可達」的 floor 格（排除出生安全區）供敵人 / 出口佈點
  const floors: { x: number; y: number }[] = [];
  for (let y = 1; y < GRID_ROWS - 1; y++)
    for (let x = 1; x < GRID_COLS - 1; x++)
      if (grid[y][x] === 'floor' && !safe.has(`${x},${y}`) && reach.has(`${x},${y}`))
        floors.push({ x, y });

  // 出口：離出生點最遠的 floor 格（穩定、可重現）
  const exit = floors.reduce((best, c) =>
    (Math.abs(c.x - SPAWN.x) + Math.abs(c.y - SPAWN.y)) >
    (Math.abs(best.x - SPAWN.x) + Math.abs(best.y - SPAWN.y)) ? c : best,
    floors[0] ?? { x: GRID_COLS - 2, y: GRID_ROWS - 2 });

  // 敵人：第 floor 層 = BASE + (floor-1)，從遠離出生點的 floor 格隨機挑。
  // 排除被牆/箱完全封死的格（至少要有一個 floor 鄰格），否則怪物會原地卡死。
  const hasOpenNeighbor = (c: { x: number; y: number }): boolean =>
    [grid[c.y - 1]?.[c.x], grid[c.y + 1]?.[c.x], grid[c.y]?.[c.x - 1], grid[c.y]?.[c.x + 1]]
      .some((t) => t === 'floor');
  const count = BASE_ENEMY_COUNT + (floor - 1);
  const candidates = shuffle(
    floors.filter((c) =>
      Math.abs(c.x - SPAWN.x) + Math.abs(c.y - SPAWN.y) >= 4 && hasOpenNeighbor(c)),
    rng,
  );
  // 怪物池隨樓層擴張：1 層基本款；2 層+穿箱幽靈；3 層+衝刺獸；4 層+寶箱怪；5 層+裝甲魔像
  const kindPool: EnemyKind[] = ['wander', 'chaser'];
  if (floor >= 2) kindPool.push('ghost');
  if (floor >= 3) kindPool.push('dasher');
  if (floor >= 4) kindPool.push('mimic');
  if (floor >= 5) kindPool.push('tank');

  const enemies: Enemy[] = [];
  for (let i = 0; i < count && i < candidates.length; i++) {
    const c = candidates[i];
    const kind = kindPool[Math.floor(rng() * kindPool.length)];
    enemies.push({
      id: i, x: c.x, y: c.y, prevX: c.x, prevY: c.y,
      dir: DIRS[Math.floor(rng() * 4)],
      kind,
      moveAccMs: 0, alive: true,
      ...(kind === 'mimic' ? { awake: false } : {}),
      ...(kind === 'tank' ? { hp: 2 } : {}),
    });
  }

  return { grid, enemies, hiddenPowerUps, exit, archetype };
}
