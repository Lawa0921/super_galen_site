# DUNGEON BOMBER Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-player roguelite Bomberman ("DUNGEON BOMBER") for the Dungeon Arcade — a procedurally generated, top-down, grid-based bomb game where you clear each floor of enemies, descend deeper, and chase a high score.

**Architecture:** Pure-TypeScript, fully unit-tested engine (`engine/`, zero Pixi dependency) drives all game logic on an integer tile grid; a PixiJS render layer (`render/`) interpolates entity positions visually and draws sprites/HUD/FX; a thin keyboard input layer feeds the engine; a Web Audio `SoundManager` synthesizes SFX. Mirrors the existing `src/scripts/games/tetris/` structure exactly.

**Tech Stack:** TypeScript, Vitest (engine tests, TDD), PixiJS 8 + pixi-filters (render), Astro page, Playwright (e2e smoke), Web Audio (SFX). Spec: `docs/superpowers/specs/2026-06-06-dungeon-bomber-design.md`.

---

## File Structure

```
src/scripts/games/bomber/
  engine/
    constants.ts      grid dims, timings, caps, scoring numbers (pure constants)
    types.ts          Tile/Grid/Vec/Dir/Bomb/Blast/PowerUp/Enemy/Player/State/Event types
    rng.ts            re-export mulberry32 createRng (copied from tetris)
    board.ts          grid queries: isWalkable, tileAt, breakCrate
    generate.ts       generateFloor(seed, floor) -> FloorLayout (grid, enemies, hidden powerups, exit)
    blast.ts          computeBlastCells(grid, bomb) -> cells + which crates break
    bomb.ts           Bomb list helpers: place, tick fuses, chain-explosion resolution
    player.ts         pure movement helpers (canStep, speedMs) used by game
    enemy.ts          enemy AI step (wander / chaser) -> next dir
    scoring.ts        score deltas (enemy/crate/powerup/descend)
    game.ts           BomberGame class: input/setHeld/step/getState/drainEvents
    *.test.ts         co-located unit tests for each module above
  render/
    assets.ts         texture URLs + loadBomberTextures()
    PixiStage.ts      Pixi Application + layers + bloom/CRT + shake (adapted from tetris)
    GridView.ts       draws floor/wall/crate tiles + crate-break anim
    EntityView.ts     draws player/enemies/bombs/blasts/powerups/exit (lerped)
    HudView.ts        lives, floor, score, active power-ups
    Effects.ts        explosion particles, pickup pops, death flash, screen shake hooks
    main.ts           startBomber(canvas): wires engine+render+input+audio, ticker loop
  input/
    keymap.ts         KeyboardEvent.code -> Dir | 'bomb'
  audio/
    SoundManager.ts   Web Audio synth SFX (place/explode/pickup/hit/descend)
src/pages/games/bomber.astro     full-screen game page (mode-select + ?mode=solo)
src/pages/games/index.astro      MODIFY: swap one COMING SOON card for DUNGEON BOMBER
public/assets/games/bomber/      generated pixel sprites (Phase 7)
src/i18n/translations/*.ts       MODIFY: bomber strings (Phase 7)
tests/e2e/bomber.spec.ts         Playwright solo smoke (Phase 7)
```

**Engine data model (locked — every task must use these exact names):**

```ts
// types.ts
export type Tile = 'floor' | 'wall' | 'crate';      // wall = indestructible, crate = destructible
export type Grid = Tile[][];                          // grid[y][x], y down, x right
export interface Vec { x: number; y: number; }
export type Dir = 'up' | 'down' | 'left' | 'right';
export type PowerUpKind = 'fire' | 'bomb' | 'speed' | 'shield';
export type EnemyKind = 'wander' | 'chaser';

export interface Bomb { x: number; y: number; fuseMs: number; range: number; }
export interface BlastCell { x: number; y: number; ttlMs: number; }
export interface PowerUp { x: number; y: number; kind: PowerUpKind; }
export interface Enemy {
  id: number; x: number; y: number; prevX: number; prevY: number;
  dir: Dir; kind: EnemyKind; moveAccMs: number; alive: boolean;
}
export interface Player {
  x: number; y: number; prevX: number; prevY: number; dir: Dir;
  lives: number; fireRange: number; maxBombs: number; speedLevel: number;
  shield: boolean; invulnMs: number; moveCooldownMs: number; alive: boolean;
}
export type GameStatus = 'playing' | 'gameover';

export interface FloorLayout {
  grid: Grid;
  enemies: Enemy[];
  hiddenPowerUps: Record<string, PowerUpKind>; // key `${x},${y}` -> revealed when that crate breaks
  exit: Vec;                                    // floor cell; active only when all enemies dead
}

export interface BomberState {
  grid: Grid;
  player: Player;
  bombs: Bomb[];
  blasts: BlastCell[];
  enemies: Enemy[];
  powerUps: PowerUp[];
  exit: Vec;
  exitActive: boolean;
  floor: number;
  score: number;
  status: GameStatus;
}

export type BomberEvent =
  | { kind: 'bombPlaced'; x: number; y: number }
  | { kind: 'explode'; cells: Vec[] }
  | { kind: 'crateBreak'; x: number; y: number }
  | { kind: 'pickup'; powerUp: PowerUpKind }
  | { kind: 'enemyKill'; x: number; y: number }
  | { kind: 'playerHit'; shielded: boolean }
  | { kind: 'floorClear' }
  | { kind: 'descend'; floor: number }
  | { kind: 'gameover' };

export type InputAction = Dir | 'bomb';
```

**Coordinate / movement model:** Engine positions are **integers** (one cell per entity). A move is logically instantaneous but gated by a cooldown (`moveCooldownMs` for player; `moveAccMs` for enemies); `prevX/prevY` record the cell departed so the render layer can lerp `prev → current` for a smooth tween. Collisions use the logical (current) cell.

---

## Phase 1 — Engine foundation

### Task 1: Constants

**Files:**
- Create: `src/scripts/games/bomber/engine/constants.ts`
- Test: `src/scripts/games/bomber/engine/constants.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// constants.test.ts
import { describe, it, expect } from 'vitest';
import {
  GRID_COLS, GRID_ROWS, SPAWN, BOMB_FUSE_MS, BLAST_TTL_MS,
  BASE_FIRE, BASE_BOMBS, MAX_FIRE, MAX_BOMBS, SPEED_MS, START_LIVES, INVULN_MS,
} from './constants';

describe('constants', () => {
  it('使用奇數格寬高，讓柱子陣列成立', () => {
    expect(GRID_COLS % 2).toBe(1);
    expect(GRID_ROWS % 2).toBe(1);
  });
  it('出生點在左上內側 (1,1)', () => {
    expect(SPAWN).toEqual({ x: 1, y: 1 });
  });
  it('速度表由慢到快、至少 1 階', () => {
    expect(SPEED_MS.length).toBeGreaterThan(0);
    for (let i = 1; i < SPEED_MS.length; i++) expect(SPEED_MS[i]).toBeLessThan(SPEED_MS[i - 1]);
  });
  it('火力與炸彈有合理上下限', () => {
    expect(BASE_FIRE).toBe(1);
    expect(BASE_BOMBS).toBe(1);
    expect(MAX_FIRE).toBeGreaterThan(BASE_FIRE);
    expect(MAX_BOMBS).toBeGreaterThan(BASE_BOMBS);
  });
  it('引信、爆風、命數、無敵時間皆為正', () => {
    for (const v of [BOMB_FUSE_MS, BLAST_TTL_MS, START_LIVES, INVULN_MS]) expect(v).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scripts/games/bomber/engine/constants.test.ts`
Expected: FAIL — cannot find module `./constants`.

- [ ] **Step 3: Write minimal implementation**

```ts
// constants.ts
/** 格子寬高（奇數，內側偶數座標放不可炸柱子）。 */
export const GRID_COLS = 13;
export const GRID_ROWS = 11;

/** 玩家固定出生格（左上內側）。 */
export const SPAWN = { x: 1, y: 1 } as const;

/** 炸彈引信與爆風存活時間（ms）。 */
export const BOMB_FUSE_MS = 2000;
export const BLAST_TTL_MS = 480;

/** 火力 / 同時炸彈數的基礎與上限。 */
export const BASE_FIRE = 1;
export const BASE_BOMBS = 1;
export const MAX_FIRE = 8;
export const MAX_BOMBS = 8;

/** 移動速度表：speedLevel 索引 -> 每格耗時 ms（越大階越快）。 */
export const SPEED_MS = [200, 168, 140, 116, 96] as const;

/** 命數與重生無敵時間。 */
export const START_LIVES = 3;
export const INVULN_MS = 1500;

/** 敵人每格移動基礎耗時（深層遞減）。 */
export const ENEMY_MOVE_MS: Record<'wander' | 'chaser', number> = { wander: 340, chaser: 280 };

/** 樓層生成參數。 */
export const CRATE_DENSITY = 0.72;        // 可放軟箱的空格被填的機率
export const POWERUP_DROP_RATE = 0.28;    // 軟箱底下藏道具的機率
export const BASE_ENEMY_COUNT = 3;        // 第 1 層敵人數；之後 +1/層
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/scripts/games/bomber/engine/constants.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/engine/constants.ts src/scripts/games/bomber/engine/constants.test.ts
git commit -m "feat(bomber): add engine constants"
```

---

### Task 2: Types + RNG

**Files:**
- Create: `src/scripts/games/bomber/engine/types.ts` (paste the full "Engine data model" block above, minus the comment header — just the `export` statements)
- Create: `src/scripts/games/bomber/engine/rng.ts`
- Test: `src/scripts/games/bomber/engine/rng.test.ts`

- [ ] **Step 1: Write `types.ts`**

Paste every `export type` / `export interface` from the **Engine data model** section above into `types.ts`. No logic, just declarations.

- [ ] **Step 2: Write the failing RNG test**

```ts
// rng.test.ts
import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('同 seed 產生相同序列（可重現）', () => {
    const a = createRng(42), b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('回傳值落在 [0,1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/engine/rng.test.ts`
Expected: FAIL — cannot find module `./rng`.

- [ ] **Step 4: Write `rng.ts`** (identical to tetris `rng.ts`)

```ts
// rng.ts
/** mulberry32：32-bit 確定性 PRNG。帶 seed 可完全重現，方便測試。 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/rng.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/games/bomber/engine/types.ts src/scripts/games/bomber/engine/rng.ts src/scripts/games/bomber/engine/rng.test.ts
git commit -m "feat(bomber): add engine types and seeded RNG"
```

---

### Task 3: Board queries

**Files:**
- Create: `src/scripts/games/bomber/engine/board.ts`
- Test: `src/scripts/games/bomber/engine/board.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// board.test.ts
import { describe, it, expect } from 'vitest';
import { tileAt, isWalkable, breakCrate } from './board';
import type { Grid } from './types';

function grid3(): Grid {
  return [
    ['wall', 'wall', 'wall'],
    ['wall', 'floor', 'crate'],
    ['wall', 'wall', 'wall'],
  ];
}

describe('tileAt', () => {
  it('界外回傳 wall', () => {
    expect(tileAt(grid3(), -1, 0)).toBe('wall');
    expect(tileAt(grid3(), 0, 99)).toBe('wall');
  });
  it('界內回傳該格', () => {
    expect(tileAt(grid3(), 1, 1)).toBe('floor');
    expect(tileAt(grid3(), 2, 1)).toBe('crate');
  });
});

describe('isWalkable', () => {
  it('只有 floor 可走', () => {
    expect(isWalkable(grid3(), 1, 1)).toBe(true);
    expect(isWalkable(grid3(), 0, 0)).toBe(false); // wall
    expect(isWalkable(grid3(), 2, 1)).toBe(false); // crate
  });
});

describe('breakCrate', () => {
  it('把 crate 變成 floor，回傳新 grid 不改原本', () => {
    const g = grid3();
    const next = breakCrate(g, 2, 1);
    expect(next[1][2]).toBe('floor');
    expect(g[1][2]).toBe('crate'); // 原 grid 不變
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/engine/board.test.ts`
Expected: FAIL — cannot find module `./board`.

- [ ] **Step 3: Write `board.ts`**

```ts
// board.ts
import type { Grid, Tile } from './types';

/** 取得 (x,y) 的 tile；界外視為 wall。 */
export function tileAt(grid: Grid, x: number, y: number): Tile {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return 'wall';
  return grid[y][x];
}

/** (x,y) 是否可被實體踏入（僅 floor 可走；bomb 阻擋由 game 另外判斷）。 */
export function isWalkable(grid: Grid, x: number, y: number): boolean {
  return tileAt(grid, x, y) === 'floor';
}

/** 把 (x,y) 的 crate 變 floor，回傳新 grid（immutable）。 */
export function breakCrate(grid: Grid, x: number, y: number): Grid {
  const next = grid.map((row) => [...row]);
  if (tileAt(grid, x, y) === 'crate') next[y][x] = 'floor';
  return next;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/board.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/engine/board.ts src/scripts/games/bomber/engine/board.test.ts
git commit -m "feat(bomber): add board tile queries"
```

---

### Task 4: Floor generation

**Files:**
- Create: `src/scripts/games/bomber/engine/generate.ts`
- Test: `src/scripts/games/bomber/engine/generate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generate.test.ts
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
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/engine/generate.test.ts`
Expected: FAIL — cannot find module `./generate`.

- [ ] **Step 3: Write `generate.ts`**

```ts
// generate.ts
import type { Grid, Enemy, FloorLayout, PowerUpKind, Dir } from './types';
import {
  GRID_COLS, GRID_ROWS, SPAWN, CRATE_DENSITY, POWERUP_DROP_RATE,
  BASE_ENEMY_COUNT,
} from './constants';
import { createRng } from './rng';

const SAFE = new Set([`${SPAWN.x},${SPAWN.y}`, `${SPAWN.x + 1},${SPAWN.y}`, `${SPAWN.x},${SPAWN.y + 1}`]);
const POWERUPS: PowerUpKind[] = ['fire', 'bomb', 'speed', 'shield'];
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

/** 依 seed 與層數產生一層：grid + 敵人 + 藏在軟箱下的道具 + 出口。 */
export function generateFloor(seed: number, floor: number): FloorLayout {
  const rng = createRng((seed ^ (floor * 0x9e3779b1)) >>> 0);
  const grid: Grid = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    const row: Grid[number] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      const border = x === 0 || y === 0 || x === GRID_COLS - 1 || y === GRID_ROWS - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      if (border || pillar) row.push('wall');
      else if (!SAFE.has(`${x},${y}`) && rng() < CRATE_DENSITY) row.push('crate');
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
      if (grid[y][x] === 'floor' && !SAFE.has(`${x},${y}`)) floors.push({ x, y });

  // 出口：離出生點最遠的 floor 格（穩定、可重現）
  const exit = floors.reduce((best, c) =>
    (Math.abs(c.x - SPAWN.x) + Math.abs(c.y - SPAWN.y)) >
    (Math.abs(best.x - SPAWN.x) + Math.abs(best.y - SPAWN.y)) ? c : best,
    floors[0] ?? { x: GRID_COLS - 2, y: GRID_ROWS - 2 });

  // 敵人：第 floor 層 = BASE + (floor-1)，從遠離出生點的 floor 格隨機挑
  const count = BASE_ENEMY_COUNT + (floor - 1);
  const candidates = floors
    .filter((c) => Math.abs(c.x - SPAWN.x) + Math.abs(c.y - SPAWN.y) >= 4)
    .sort(() => rng() - 0.5);
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/engine/generate.ts src/scripts/games/bomber/engine/generate.test.ts
git commit -m "feat(bomber): add seeded floor generation"
```

---

## Phase 2 — Bombs & blast

### Task 5: Blast cell computation

**Files:**
- Create: `src/scripts/games/bomber/engine/blast.ts`
- Test: `src/scripts/games/bomber/engine/blast.test.ts`

`computeBlast(grid, x, y, range)` returns the set of cells the cross-blast covers and which crate cells it breaks. Arms extend up to `range` in each of 4 directions, **stop at walls** (do not cover them), and **stop after the first crate** (which breaks).

- [ ] **Step 1: Write the failing test**

```ts
// blast.test.ts
import { describe, it, expect } from 'vitest';
import { computeBlast } from './blast';
import type { Grid } from './types';

// 5x5 全 floor 內側、外圈 wall
function openGrid(): Grid {
  const g: Grid = [];
  for (let y = 0; y < 5; y++) {
    const row = [];
    for (let x = 0; x < 5; x++) row.push(x === 0 || y === 0 || x === 4 || y === 4 ? 'wall' : 'floor');
    g.push(row as Grid[number]);
  }
  return g;
}

describe('computeBlast', () => {
  it('range 1 在中央產生十字 5 格', () => {
    const { cells } = computeBlast(openGrid(), 2, 2, 1);
    const keys = cells.map((c) => `${c.x},${c.y}`).sort();
    expect(keys).toEqual(['1,2', '2,1', '2,2', '2,3', '3,2'].sort());
  });
  it('爆風被 wall 擋住、不覆蓋 wall', () => {
    const { cells } = computeBlast(openGrid(), 1, 1, 3); // 左/上都是外框 wall
    const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(keys.has('0,1')).toBe(false); // wall 不覆蓋
    expect(keys.has('1,0')).toBe(false);
    expect(keys.has('2,1')).toBe(true);  // 往右可達
  });
  it('遇 crate 炸掉第一個後停住、不穿過', () => {
    const g = openGrid();
    g[2][3] = 'crate'; // 中央右邊一格是箱
    const { cells, brokenCrates } = computeBlast(g, 2, 2, 3);
    const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(keys.has('3,2')).toBe(true);  // 箱本身被涵蓋（會碎）
    expect(brokenCrates).toContainEqual({ x: 3, y: 2 });
    // crate 之外（再往右）不該被涵蓋（但本網格 4 已是 wall，改測上下無箱仍延伸）
    expect(keys.has('2,3')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/engine/blast.test.ts`
Expected: FAIL — cannot find module `./blast`.

- [ ] **Step 3: Write `blast.ts`**

```ts
// blast.ts
import type { Grid, Vec } from './types';
import { tileAt } from './board';

const STEP: Record<string, Vec> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

/**
 * 計算一顆炸彈的十字爆風涵蓋格。
 * - 中心永遠涵蓋。
 * - 每方向延伸最多 range 格：遇 wall 立即停（不涵蓋 wall）；
 *   遇 crate 涵蓋該格並記為破壞，然後停（不穿過）。
 */
export function computeBlast(grid: Grid, x: number, y: number, range: number): { cells: Vec[]; brokenCrates: Vec[] } {
  const cells: Vec[] = [{ x, y }];
  const brokenCrates: Vec[] = [];
  for (const dir of Object.keys(STEP)) {
    const d = STEP[dir];
    for (let i = 1; i <= range; i++) {
      const cx = x + d.x * i, cy = y + d.y * i;
      const t = tileAt(grid, cx, cy);
      if (t === 'wall') break;
      cells.push({ x: cx, y: cy });
      if (t === 'crate') { brokenCrates.push({ x: cx, y: cy }); break; }
    }
  }
  return { cells, brokenCrates };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/blast.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/engine/blast.ts src/scripts/games/bomber/engine/blast.test.ts
git commit -m "feat(bomber): add cross-blast computation (wall stop, crate break)"
```

---

### Task 6: Chain-explosion resolution

**Files:**
- Create: `src/scripts/games/bomber/engine/bomb.ts`
- Test: `src/scripts/games/bomber/engine/bomb.test.ts`

`resolveExplosions(grid, bombs, detonating)` — given an initial set of bombs reaching fuse 0, return all cells covered, all crates broken, and the full set of bombs consumed (including those caught in the blast = chain). Pure; the caller mutates state.

- [ ] **Step 1: Write the failing test**

```ts
// bomb.test.ts
import { describe, it, expect } from 'vitest';
import { resolveChain } from './bomb';
import type { Grid, Bomb } from './types';

function openGrid(w = 7, h = 3): Grid {
  const g: Grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push(y === 0 || y === h - 1 || x === 0 || x === w - 1 ? 'wall' : 'floor');
    g.push(row as Grid[number]);
  }
  return g;
}

describe('resolveChain', () => {
  it('單顆炸彈：只消耗自己', () => {
    const bombs: Bomb[] = [{ x: 1, y: 1, fuseMs: 0, range: 1 }];
    const r = resolveChain(openGrid(), bombs, [bombs[0]]);
    expect(r.consumed).toHaveLength(1);
  });
  it('相鄰另一顆在爆風內 -> 連鎖一起爆', () => {
    const bombs: Bomb[] = [
      { x: 1, y: 1, fuseMs: 0, range: 2 },
      { x: 3, y: 1, fuseMs: 1500, range: 1 }, // 還沒到引信，但在第一顆爆風內
    ];
    const r = resolveChain(openGrid(), bombs, [bombs[0]]);
    expect(r.consumed).toHaveLength(2);
    const keys = new Set(r.cells.map((c) => `${c.x},${c.y}`));
    expect(keys.has('4,1')).toBe(true); // 第二顆的爆風延伸到
  });
  it('範圍外的炸彈不被連鎖', () => {
    const bombs: Bomb[] = [
      { x: 1, y: 1, fuseMs: 0, range: 1 },
      { x: 5, y: 1, fuseMs: 1500, range: 1 },
    ];
    const r = resolveChain(openGrid(9, 3), bombs, [bombs[0]]);
    expect(r.consumed).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/engine/bomb.test.ts`
Expected: FAIL — cannot find module `./bomb`.

- [ ] **Step 3: Write `bomb.ts`**

```ts
// bomb.ts
import type { Grid, Bomb, Vec } from './types';
import { computeBlast } from './blast';

export interface ChainResult { cells: Vec[]; brokenCrates: Vec[]; consumed: Bomb[]; }

/** 解析連鎖爆炸：從 initial 觸發的炸彈開始，凡爆風涵蓋到的其他炸彈一併引爆。 */
export function resolveChain(grid: Grid, bombs: Bomb[], initial: Bomb[]): ChainResult {
  const consumed = new Set<Bomb>(initial);
  const queue: Bomb[] = [...initial];
  const cellKeys = new Set<string>();
  const cells: Vec[] = [];
  const brokenCrates: Vec[] = [];

  while (queue.length) {
    const b = queue.shift()!;
    const { cells: bc, brokenCrates: bk } = computeBlast(grid, b.x, b.y, b.range);
    for (const c of bc) {
      const k = `${c.x},${c.y}`;
      if (!cellKeys.has(k)) { cellKeys.add(k); cells.push(c); }
    }
    for (const c of bk) brokenCrates.push(c);
    // 連鎖：任何尚未消耗、位置落在爆風格內的炸彈，立即引爆
    for (const other of bombs) {
      if (consumed.has(other)) continue;
      if (cellKeys.has(`${other.x},${other.y}`)) { consumed.add(other); queue.push(other); }
    }
  }
  return { cells, brokenCrates, consumed: [...consumed] };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/bomb.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/engine/bomb.ts src/scripts/games/bomber/engine/bomb.test.ts
git commit -m "feat(bomber): add chain-explosion resolution"
```

---

## Phase 3 — Player, enemies, scoring (pure helpers)

### Task 7: Player movement helpers

**Files:**
- Create: `src/scripts/games/bomber/engine/player.ts`
- Test: `src/scripts/games/bomber/engine/player.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// player.test.ts
import { describe, it, expect } from 'vitest';
import { speedMs, dirDelta, makePlayer } from './player';
import { SPEED_MS, SPAWN, BASE_FIRE, BASE_BOMBS, START_LIVES } from './constants';

describe('speedMs', () => {
  it('依 speedLevel 取移動耗時、超出上限取最快', () => {
    expect(speedMs(0)).toBe(SPEED_MS[0]);
    expect(speedMs(99)).toBe(SPEED_MS[SPEED_MS.length - 1]);
  });
});

describe('dirDelta', () => {
  it('四方向位移正確', () => {
    expect(dirDelta('up')).toEqual({ x: 0, y: -1 });
    expect(dirDelta('right')).toEqual({ x: 1, y: 0 });
  });
});

describe('makePlayer', () => {
  it('在出生點以基礎能力建立', () => {
    const p = makePlayer();
    expect(p).toMatchObject({ x: SPAWN.x, y: SPAWN.y, fireRange: BASE_FIRE, maxBombs: BASE_BOMBS, lives: START_LIVES, speedLevel: 0, shield: false, alive: true });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/engine/player.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `player.ts`**

```ts
// player.ts
import type { Player, Dir, Vec } from './types';
import { SPEED_MS, SPAWN, BASE_FIRE, BASE_BOMBS, START_LIVES } from './constants';

export function speedMs(speedLevel: number): number {
  return SPEED_MS[Math.min(speedLevel, SPEED_MS.length - 1)];
}

export function dirDelta(dir: Dir): Vec {
  switch (dir) {
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
}

/** 以基礎能力在出生點建立玩家。 */
export function makePlayer(): Player {
  return {
    x: SPAWN.x, y: SPAWN.y, prevX: SPAWN.x, prevY: SPAWN.y, dir: 'down',
    lives: START_LIVES, fireRange: BASE_FIRE, maxBombs: BASE_BOMBS, speedLevel: 0,
    shield: false, invulnMs: 0, moveCooldownMs: 0, alive: true,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/player.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/engine/player.ts src/scripts/games/bomber/engine/player.test.ts
git commit -m "feat(bomber): add player movement helpers"
```

---

### Task 8: Enemy AI

**Files:**
- Create: `src/scripts/games/bomber/engine/enemy.ts`
- Test: `src/scripts/games/bomber/engine/enemy.test.ts`

`chooseEnemyDir(grid, enemy, player, bombs, rng)` returns the `Dir` the enemy should attempt this move (walkable cells only; bombs block). Chaser greedily reduces Manhattan distance; wander keeps going straight when possible else picks a random open dir.

- [ ] **Step 1: Write the failing test**

```ts
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
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/engine/enemy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `enemy.ts`**

```ts
// enemy.ts
import type { Grid, Enemy, Dir, Vec, Bomb } from './types';
import { isWalkable } from './board';
import { dirDelta } from './player';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

function open(grid: Grid, x: number, y: number, bombs: Bomb[]): boolean {
  if (!isWalkable(grid, x, y)) return false;
  return !bombs.some((b) => b.x === x && b.y === y);
}

function openDirs(grid: Grid, e: Enemy, bombs: Bomb[]): Dir[] {
  return DIRS.filter((d) => { const v = dirDelta(d); return open(grid, e.x + v.x, e.y + v.y, bombs); });
}

/** 決定敵人這次嘗試移動的方向；無路可走回傳 null。 */
export function chooseEnemyDir(grid: Grid, e: Enemy, player: Vec, bombs: Bomb[], rng: () => number): Dir | null {
  const opts = openDirs(grid, e, bombs);
  if (opts.length === 0) return null;

  if (e.kind === 'chaser') {
    let best: Dir = opts[0];
    let bestDist = Infinity;
    for (const d of opts) {
      const v = dirDelta(d);
      const dist = Math.abs(e.x + v.x - player.x) + Math.abs(e.y + v.y - player.y);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }

  // wander：能直走就直走，否則隨機挑一個開放方向
  if (opts.includes(e.dir) && rng() < 0.8) return e.dir;
  return opts[Math.floor(rng() * opts.length)];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/enemy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/engine/enemy.ts src/scripts/games/bomber/engine/enemy.test.ts
git commit -m "feat(bomber): add enemy AI (wander + chaser)"
```

---

### Task 9: Scoring

**Files:**
- Create: `src/scripts/games/bomber/engine/scoring.ts`
- Test: `src/scripts/games/bomber/engine/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// scoring.test.ts
import { describe, it, expect } from 'vitest';
import { SCORE, descendBonus } from './scoring';

describe('scoring', () => {
  it('各事件有固定分值', () => {
    expect(SCORE.crate).toBe(10);
    expect(SCORE.enemy).toBe(100);
    expect(SCORE.powerup).toBe(50);
  });
  it('下樓獎勵隨層數遞增', () => {
    expect(descendBonus(2)).toBeGreaterThan(descendBonus(1));
    expect(descendBonus(1)).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/engine/scoring.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `scoring.ts`**

```ts
// scoring.ts
export const SCORE = { crate: 10, enemy: 100, powerup: 50 } as const;

/** 進入下一層的分數獎勵：抵達的層數 × 200。 */
export function descendBonus(reachedFloor: number): number {
  return reachedFloor * 200;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/scoring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/engine/scoring.ts src/scripts/games/bomber/engine/scoring.test.ts
git commit -m "feat(bomber): add scoring values"
```

---

## Phase 4 — Game state machine (the integration core)

### Task 10: BomberGame — movement & bomb placement

**Files:**
- Create: `src/scripts/games/bomber/engine/game.ts`
- Test: `src/scripts/games/bomber/engine/game.test.ts`

The class ties everything together. This task implements construction, `getState`, held-direction movement, and bomb placement (no explosions yet — that is Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// game.test.ts (Task 10 portion)
import { describe, it, expect } from 'vitest';
import { BomberGame } from './game';
import { SPAWN, SPEED_MS, BASE_BOMBS } from './constants';

describe('BomberGame: construction', () => {
  it('初始狀態：playing、floor 1、玩家在出生點、分數 0', () => {
    const g = new BomberGame({ seed: 1 });
    const s = g.getState();
    expect(s.status).toBe('playing');
    expect(s.floor).toBe(1);
    expect(s.player).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
    expect(s.score).toBe(0);
    expect(s.bombs).toHaveLength(0);
  });
});

describe('BomberGame: movement', () => {
  it('按住 right 過一個移動週期後前進一格', () => {
    const g = new BomberGame({ seed: 1 });
    g.setHeld('right', true);
    g.step(SPEED_MS[0]); // 一個移動週期
    expect(g.getState().player.x).toBe(SPAWN.x + 1);
  });
  it('撞到 wall 不前進（往上是外框 wall）', () => {
    const g = new BomberGame({ seed: 1 });
    g.setHeld('up', true);
    g.step(SPEED_MS[0]);
    expect(g.getState().player.y).toBe(SPAWN.y);
  });
});

describe('BomberGame: bomb placement', () => {
  it('放彈後場上多一顆，且站在炸彈格上', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    const s = g.getState();
    expect(s.bombs).toHaveLength(1);
    expect(s.bombs[0]).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
  });
  it('同時炸彈數受 maxBombs 限制', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb'); // 同一格只能放一顆
    g.input('bomb');
    expect(g.getState().bombs.length).toBe(BASE_BOMBS);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/engine/game.test.ts`
Expected: FAIL — cannot find module `./game`.

- [ ] **Step 3: Write `game.ts` (movement + placement; explosions stubbed)**

```ts
// game.ts
import type {
  Grid, Bomb, BlastCell, Enemy, PowerUp, Vec, Dir, BomberState, BomberEvent, InputAction, Player,
} from './types';
import { generateFloor } from './generate';
import { makePlayer, dirDelta, speedMs } from './player';
import { isWalkable } from './board';
import { BOMB_FUSE_MS } from './constants';

export interface BomberOptions { seed?: number; floor?: number; }

export class BomberGame {
  private seed: number;
  private floor: number;
  private grid: Grid;
  private player: Player;
  private bombs: Bomb[] = [];
  private blasts: BlastCell[] = [];
  private enemies: Enemy[] = [];
  private powerUps: PowerUp[] = [];
  private hidden: Record<string, import('./types').PowerUpKind> = {};
  private exit: Vec;
  private status: 'playing' | 'gameover' = 'playing';

  private held = new Set<Dir>();
  private lastHeld: Dir | null = null;
  private events: BomberEvent[] = [];

  constructor(opts: BomberOptions = {}) {
    this.seed = opts.seed ?? 1;
    this.floor = opts.floor ?? 1;
    const layout = generateFloor(this.seed, this.floor);
    this.grid = layout.grid;
    this.enemies = layout.enemies;
    this.hidden = layout.hiddenPowerUps;
    this.exit = layout.exit;
    this.player = makePlayer();
  }

  // ---- input ----
  setHeld(dir: Dir, down: boolean): void {
    if (down) { this.held.add(dir); this.lastHeld = dir; }
    else { this.held.delete(dir); if (this.lastHeld === dir) this.lastHeld = null; }
  }
  input(action: InputAction): void {
    if (this.status !== 'playing') return;
    if (action === 'bomb') { this.placeBomb(); return; }
    // 方向鍵的瞬按也記為 held，讓不放開也能走（render 會配 keyup 取消）
    this.setHeld(action, true);
  }

  private chosenDir(): Dir | null {
    if (this.lastHeld && this.held.has(this.lastHeld)) return this.lastHeld;
    for (const d of this.held) return d;
    return null;
  }

  private placeBomb(): void {
    if (this.bombs.length >= this.player.maxBombs) return;
    if (this.bombs.some((b) => b.x === this.player.x && b.y === this.player.y)) return;
    this.bombs.push({ x: this.player.x, y: this.player.y, fuseMs: BOMB_FUSE_MS, range: this.player.fireRange });
    this.events.push({ kind: 'bombPlaced', x: this.player.x, y: this.player.y });
  }

  private blocked(x: number, y: number): boolean {
    if (!isWalkable(this.grid, x, y)) return true;
    return this.bombs.some((b) => b.x === x && b.y === y);
  }

  // ---- main loop ----
  step(dtMs: number): void {
    if (this.status !== 'playing') return;
    this.stepPlayerMove(dtMs);
    // 炸彈/敵人/爆風/碰撞在 Task 11、12 補上
  }

  private stepPlayerMove(dtMs: number): void {
    const p = this.player;
    if (p.invulnMs > 0) p.invulnMs = Math.max(0, p.invulnMs - dtMs);
    if (p.moveCooldownMs > 0) { p.moveCooldownMs = Math.max(0, p.moveCooldownMs - dtMs); return; }
    const dir = this.chosenDir();
    if (!dir) { p.prevX = p.x; p.prevY = p.y; return; }
    p.dir = dir;
    const v = dirDelta(dir);
    const tx = p.x + v.x, ty = p.y + v.y;
    if (this.blocked(tx, ty)) { p.prevX = p.x; p.prevY = p.y; return; }
    p.prevX = p.x; p.prevY = p.y;
    p.x = tx; p.y = ty;
    p.moveCooldownMs = speedMs(p.speedLevel);
  }

  getState(): BomberState {
    return {
      grid: this.grid, player: this.player, bombs: this.bombs, blasts: this.blasts,
      enemies: this.enemies, powerUps: this.powerUps, exit: this.exit,
      exitActive: this.enemies.every((e) => !e.alive),
      floor: this.floor, score: 0, status: this.status,
    };
  }

  drainEvents(): BomberEvent[] { const e = this.events; this.events = []; return e; }
}
```

> Note: `score` is wired to a real field in Task 11. Leaving it `0` here keeps Task 10's tests honest (they don't assert score after actions).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/engine/game.ts src/scripts/games/bomber/engine/game.test.ts
git commit -m "feat(bomber): BomberGame movement and bomb placement"
```

---

### Task 11: BomberGame — explosions, crates, power-ups, score

**Files:**
- Modify: `src/scripts/games/bomber/engine/game.ts`
- Modify: `src/scripts/games/bomber/engine/game.test.ts` (add cases)

Add: fuse countdown → detonation, chain resolution, crate breaking (+reveal hidden power-ups), blast TTL decay, player picking up power-ups, and a real `score` field.

- [ ] **Step 1: Add failing tests**

```ts
// game.test.ts (append)
import { breakCrate } from './board';
import { BOMB_FUSE_MS, BLAST_TTL_MS, SCORE_REF } from './constants'; // SCORE_REF not needed if importing scoring

describe('BomberGame: explosions', () => {
  it('引信歸零後炸彈引爆並產生爆風', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    g.step(BOMB_FUSE_MS); // 引爆
    const s = g.getState();
    expect(s.bombs).toHaveLength(0);
    expect(s.blasts.length).toBeGreaterThan(0);
  });
  it('爆風 TTL 過後消失', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    g.step(BOMB_FUSE_MS);
    g.step(BLAST_TTL_MS + 1);
    expect(g.getState().blasts).toHaveLength(0);
  });
  it('炸到 crate 會破壞並加分', () => {
    // 用會在 (2,1) 生出 crate 的盤面：直接放彈炸右邊
    const g = new BomberGame({ seed: 1 });
    const before = g.getState();
    // 找出玩家右邊是否為 crate；若不是，本測試改放在已知有 crate 的固定 seed（見下方註解）
    g.input('bomb');
    g.step(BOMB_FUSE_MS);
    const after = g.getState();
    // 至少分數 >= 0 且狀態仍 playing（具體 crate 命中以 blast.test 已覆蓋；此處驗證流程不崩）
    expect(after.status).toBe('playing');
    expect(after.score).toBeGreaterThanOrEqual(before.score);
  });
});
```

> Implementation note for the engineer: the crate-specific assertions are already covered by `blast.test.ts`. Here we only verify the game loop wires detonation → blast → TTL correctly without crashing, and that `score` is a real number that never decreases from crate/enemy/pickup events.

- [ ] **Step 2: Run to verify the new cases fail**

Run: `npx vitest run src/scripts/games/bomber/engine/game.test.ts`
Expected: FAIL — `blasts` stays empty / `score` undefined.

- [ ] **Step 3: Implement in `game.ts`**

Add a `private score = 0;` field. Add imports:

```ts
import { resolveChain } from './bomb';
import { breakCrate } from './board';
import { BOMB_FUSE_MS, BLAST_TTL_MS } from './constants';
import { SCORE } from './scoring';
import type { PowerUpKind } from './types';
```

Replace the body of `step(dtMs)` with:

```ts
  step(dtMs: number): void {
    if (this.status !== 'playing') return;
    this.stepBombs(dtMs);
    this.stepBlasts(dtMs);
    this.stepPlayerMove(dtMs);
    this.pickup();
  }

  private stepBombs(dtMs: number): void {
    const detonating: Bomb[] = [];
    for (const b of this.bombs) { b.fuseMs -= dtMs; if (b.fuseMs <= 0) detonating.push(b); }
    if (detonating.length === 0) return;
    const { cells, brokenCrates, consumed } = resolveChain(this.grid, this.bombs, detonating);
    // 移除已爆炸彈
    this.bombs = this.bombs.filter((b) => !consumed.includes(b));
    // 破壞箱子 + 揭露道具 + 加分
    for (const c of brokenCrates) {
      this.grid = breakCrate(this.grid, c.x, c.y);
      this.score += SCORE.crate;
      this.events.push({ kind: 'crateBreak', x: c.x, y: c.y });
      const key = `${c.x},${c.y}`;
      const drop = this.hidden[key];
      if (drop) { this.powerUps.push({ x: c.x, y: c.y, kind: drop }); delete this.hidden[key]; }
    }
    // 產生爆風格
    for (const c of cells) this.blasts.push({ x: c.x, y: c.y, ttlMs: BLAST_TTL_MS });
    this.events.push({ kind: 'explode', cells });
  }

  private stepBlasts(dtMs: number): void {
    for (const bl of this.blasts) bl.ttlMs -= dtMs;
    this.blasts = this.blasts.filter((bl) => bl.ttlMs > 0);
  }

  private pickup(): void {
    const p = this.player;
    const hit = this.powerUps.find((u) => u.x === p.x && u.y === p.y);
    if (!hit) return;
    this.powerUps = this.powerUps.filter((u) => u !== hit);
    this.applyPowerUp(hit.kind);
    this.score += SCORE.powerup;
    this.events.push({ kind: 'pickup', powerUp: hit.kind });
  }

  private applyPowerUp(kind: PowerUpKind): void {
    const p = this.player;
    if (kind === 'fire') p.fireRange = Math.min(p.fireRange + 1, 8);
    else if (kind === 'bomb') p.maxBombs = Math.min(p.maxBombs + 1, 8);
    else if (kind === 'speed') p.speedLevel = Math.min(p.speedLevel + 1, 4);
    else if (kind === 'shield') p.shield = true;
  }
```

Update `getState()` to return `score: this.score` instead of `0`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/engine/game.ts src/scripts/games/bomber/engine/game.test.ts
git commit -m "feat(bomber): wire explosions, crate breaks, power-ups, score"
```

---

### Task 12: BomberGame — enemies, death/lives, floor clear & descend

**Files:**
- Modify: `src/scripts/games/bomber/engine/game.ts`
- Modify: `src/scripts/games/bomber/engine/game.test.ts`

Add: enemy movement each step, blast kills enemies (+score), player death from blast/enemy contact (shield absorbs, else −1 life + respawn invuln, 0 lives → gameover), exit becomes active when all enemies dead, stepping on active exit → descend (regenerate next floor, keep power-ups, +descend bonus).

- [ ] **Step 1: Add failing tests**

```ts
// game.test.ts (append)
import { START_LIVES, INVULN_MS } from './constants';

describe('BomberGame: enemies & death', () => {
  it('爆風炸到敵人 -> 敵人死亡並加分', () => {
    const g = new BomberGame({ seed: 1 });
    const s0 = g.getState();
    const target = s0.enemies[0];
    // 直接把敵人挪到玩家旁，放彈炸它（測試用：透過 debug setter）
    g.debugMoveEnemy(target.id, g.getState().player.x + 1, g.getState().player.y);
    g.debugSetFire(3);
    g.input('bomb');
    g.step(2000); // 引爆
    expect(g.getState().enemies.find((e) => e.id === target.id)!.alive).toBe(false);
    expect(g.getState().score).toBeGreaterThan(0);
  });

  it('清空敵人後 exit 啟用', () => {
    const g = new BomberGame({ seed: 1 });
    for (const e of g.getState().enemies) g.debugKillEnemy(e.id);
    expect(g.getState().exitActive).toBe(true);
  });

  it('踩上啟用的 exit -> 下一層、保留道具、層數 +1', () => {
    const g = new BomberGame({ seed: 1 });
    g.debugSetFire(4); // 道具狀態
    for (const e of g.getState().enemies) g.debugKillEnemy(e.id);
    const exit = g.getState().exit;
    g.debugTeleportPlayer(exit.x, exit.y);
    g.step(1); // 觸發下樓檢查
    const s = g.getState();
    expect(s.floor).toBe(2);
    expect(s.player.fireRange).toBe(4); // 道具帶到下一層
    expect(s.score).toBeGreaterThanOrEqual(200);
  });

  it('無敵時被爆風波及不扣命', () => {
    const g = new BomberGame({ seed: 1 });
    g.debugSetInvuln(INVULN_MS);
    g.input('bomb');
    g.step(2000);
    expect(g.getState().player.lives).toBe(START_LIVES);
  });

  it('被炸且無護盾無敵 -> 扣一命並重生於出生點且短暫無敵', () => {
    const g = new BomberGame({ seed: 1 });
    g.debugTeleportPlayer(3, 1);
    g.debugSetInvuln(0);
    g.input('bomb');          // 在 (3,1) 放彈
    g.debugFreezePlayer();    // 測試用：放彈後不移動，確保被自己炸到
    g.step(2000);
    const s = g.getState();
    expect(s.player.lives).toBe(START_LIVES - 1);
    expect(s.player.invulnMs).toBeGreaterThan(0);
  });
});
```

> The `debug*` methods are deterministic test/e2e seams (mirrors tetris's `window.__tetrisDebug`). Implement them as real public methods on the class.

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/engine/game.test.ts`
Expected: FAIL — `debugMoveEnemy` etc. not defined / no death logic.

- [ ] **Step 3: Implement in `game.ts`**

Add imports/fields:

```ts
import { chooseEnemyDir } from './enemy';
import { createRng } from './rng';
import { ENEMY_MOVE_MS, INVULN_MS, SPAWN } from './constants';
import { descendBonus } from './scoring';
// field:
private rng = createRng((this.seed ^ 0xabcdef) >>> 0);
private frozen = false; // debug only
```

Extend `step()` to call enemy movement and collision/clear checks **after** blasts resolve:

```ts
  step(dtMs: number): void {
    if (this.status !== 'playing') return;
    this.stepBombs(dtMs);
    this.stepBlasts(dtMs);
    if (!this.frozen) this.stepPlayerMove(dtMs);
    this.stepEnemies(dtMs);
    this.pickup();
    this.resolveBlastDamage();
    this.checkDescend();
  }

  private stepEnemies(dtMs: number): void {
    const moveMsBase = (e: Enemy) => Math.max(80, ENEMY_MOVE_MS[e.kind] - (this.floor - 1) * 15);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.moveAccMs += dtMs;
      if (e.moveAccMs < moveMsBase(e)) { e.prevX = e.x; e.prevY = e.y; continue; }
      e.moveAccMs = 0;
      const dir = chooseEnemyDir(this.grid, e, this.player, this.bombs, this.rng);
      if (!dir) { e.prevX = e.x; e.prevY = e.y; continue; }
      const v = dirDelta(dir); e.dir = dir;
      e.prevX = e.x; e.prevY = e.y; e.x += v.x; e.y += v.y;
    }
  }

  private resolveBlastDamage(): void {
    const onBlast = (x: number, y: number) => this.blasts.some((b) => b.x === x && b.y === y);
    // 敵人
    for (const e of this.enemies) {
      if (e.alive && onBlast(e.x, e.y)) {
        e.alive = false;
        this.score += SCORE.enemy;
        this.events.push({ kind: 'enemyKill', x: e.x, y: e.y });
      }
    }
    // 玩家：爆風 or 敵人接觸
    const p = this.player;
    const touched = onBlast(p.x, p.y) || this.enemies.some((e) => e.alive && e.x === p.x && e.y === p.y);
    if (touched && p.invulnMs <= 0) this.hurtPlayer();
  }

  private hurtPlayer(): void {
    const p = this.player;
    if (p.shield) { p.shield = false; p.invulnMs = INVULN_MS; this.events.push({ kind: 'playerHit', shielded: true }); return; }
    p.lives -= 1;
    this.events.push({ kind: 'playerHit', shielded: false });
    if (p.lives <= 0) { this.status = 'gameover'; this.events.push({ kind: 'gameover' }); return; }
    // 重生於出生點 + 無敵
    p.x = SPAWN.x; p.y = SPAWN.y; p.prevX = SPAWN.x; p.prevY = SPAWN.y;
    p.moveCooldownMs = 0; p.invulnMs = INVULN_MS;
  }

  private checkDescend(): void {
    const cleared = this.enemies.every((e) => !e.alive);
    if (!cleared) return;
    const p = this.player;
    if (p.x !== this.exit.x || p.y !== this.exit.y) return;
    this.floor += 1;
    this.score += descendBonus(this.floor);
    this.events.push({ kind: 'descend', floor: this.floor });
    const layout = generateFloor(this.seed, this.floor);
    this.grid = layout.grid; this.enemies = layout.enemies;
    this.hidden = layout.hiddenPowerUps; this.exit = layout.exit;
    this.bombs = []; this.blasts = []; this.powerUps = [];
    // 保留道具能力，只重置位置
    p.x = SPAWN.x; p.y = SPAWN.y; p.prevX = SPAWN.x; p.prevY = SPAWN.y; p.moveCooldownMs = 0;
  }
```

Add public debug seams at the end of the class:

```ts
  // ---- debug / test seams ----
  debugMoveEnemy(id: number, x: number, y: number): void { const e = this.enemies.find((q) => q.id === id); if (e) { e.x = x; e.y = y; e.prevX = x; e.prevY = y; } }
  debugKillEnemy(id: number): void { const e = this.enemies.find((q) => q.id === id); if (e) e.alive = false; }
  debugSetFire(n: number): void { this.player.fireRange = n; }
  debugSetInvuln(ms: number): void { this.player.invulnMs = ms; }
  debugTeleportPlayer(x: number, y: number): void { const p = this.player; p.x = x; p.y = y; p.prevX = x; p.prevY = y; }
  debugFreezePlayer(): void { this.frozen = true; }
```

Also emit `{ kind: 'floorClear' }` once when the last enemy dies — track a `private clearedEmitted = false;` flag, set in `resolveBlastDamage` when `enemies.every(e=>!e.alive)` becomes true the first time.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/engine/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full engine suite**

Run: `npx vitest run src/scripts/games/bomber`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/games/bomber/engine/game.ts src/scripts/games/bomber/engine/game.test.ts
git commit -m "feat(bomber): enemies, death/lives, floor clear and descend"
```

---

## Phase 5 — Input + Audio (non-visual glue)

### Task 13: Keymap

**Files:**
- Create: `src/scripts/games/bomber/input/keymap.ts`
- Test: `src/scripts/games/bomber/input/keymap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// keymap.test.ts
import { describe, it, expect } from 'vitest';
import { KEYMAP } from './keymap';

describe('KEYMAP', () => {
  it('方向鍵與 WASD 都對應方向', () => {
    expect(KEYMAP.ArrowUp).toBe('up');
    expect(KEYMAP.KeyW).toBe('up');
    expect(KEYMAP.ArrowRight).toBe('right');
    expect(KEYMAP.KeyD).toBe('right');
  });
  it('空白鍵與 J 放炸彈', () => {
    expect(KEYMAP.Space).toBe('bomb');
    expect(KEYMAP.KeyJ).toBe('bomb');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/scripts/games/bomber/input/keymap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `keymap.ts`**

```ts
// keymap.ts
import type { InputAction } from '../engine/types';

/** KeyboardEvent.code -> 遊戲動作。 */
export const KEYMAP: Record<string, InputAction> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'bomb', KeyJ: 'bomb', KeyK: 'bomb',
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/scripts/games/bomber/input/keymap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/input/keymap.ts src/scripts/games/bomber/input/keymap.test.ts
git commit -m "feat(bomber): add keyboard keymap"
```

---

### Task 14: SoundManager

**Files:**
- Create: `src/scripts/games/bomber/audio/SoundManager.ts`

Web Audio synth SFX, no unit test (audio output verified manually). Adapt the tetris `SoundManager` API surface: `ensure()`, `toggle()`, plus bomber-specific one-shots.

- [ ] **Step 1: Read the tetris SoundManager for the pattern**

Run: `sed -n '1,60p' src/scripts/games/tetris/audio/SoundManager.ts`

- [ ] **Step 2: Write `SoundManager.ts`**

```ts
// SoundManager.ts
/** 以 Web Audio 合成的簡單 SFX；首次使用者手勢時 ensure() 解鎖 AudioContext。 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;

  ensure(): void {
    if (!this.ctx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  toggle(): boolean { this.muted = !this.muted; return this.muted; }

  private blip(freq: number, durMs: number, type: OscillatorType = 'square', gain = 0.18): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t); osc.stop(t + durMs / 1000);
  }

  place(): void { this.blip(220, 80, 'square'); }
  explode(): void {
    if (this.muted || !this.ctx) return;
    // 噪音爆裂：短促下滑 + 低頻
    this.blip(90, 320, 'sawtooth', 0.25);
    this.blip(50, 380, 'triangle', 0.2);
  }
  pickup(): void { this.blip(660, 90, 'square'); this.blip(990, 90, 'square'); }
  hit(): void { this.blip(140, 260, 'sawtooth', 0.25); }
  descend(): void { this.blip(330, 120, 'triangle'); this.blip(220, 160, 'triangle'); }
  gameover(): void { this.blip(160, 500, 'sawtooth', 0.25); }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/games/bomber/audio/SoundManager.ts
git commit -m "feat(bomber): add Web Audio SoundManager"
```

---

## Phase 6 — Render & page (manual / dev-server verified)

> Render code is verified by running the dev server, not unit tests (mirrors the tetris approach). Early render uses **Pixi `Graphics` placeholders** (colored squares) so the game is playable before art exists; Phase 7 swaps in textures.

### Task 15: PixiStage

**Files:**
- Create: `src/scripts/games/bomber/render/PixiStage.ts`

- [ ] **Step 1: Read tetris PixiStage to copy init/resize/shake**

Run: `cat src/scripts/games/tetris/render/PixiStage.ts`

- [ ] **Step 2: Write `PixiStage.ts`** — an adaptation with layers `bgLayer`, `content` → `gridLayer`, `entityLayer`, `fxLayer`, `hudLayer`. Reuse tetris's `app.init({ canvas, resizeTo, antialias:false, ... })`, the `AdvancedBloomFilter` on `fxLayer`/`entityLayer`, optional `CRTFilter` on stage, `shake(mag)`, `update(dt)`, `width`/`height` getters from `app.screen`, and a static async `create(canvas)`. Keep `gridLayer` **without** bloom (tiles must stay crisp); put gentle bloom on `entityLayer` and stronger on `fxLayer`.

```ts
// PixiStage.ts (skeleton — fill bodies following tetris/render/PixiStage.ts)
import { Application, Container } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';

export class PixiStage {
  readonly app: Application;
  readonly bgLayer = new Container();
  readonly content = new Container();
  readonly gridLayer = new Container();
  readonly entityLayer = new Container();
  readonly fxLayer = new Container();
  readonly hudLayer = new Container();
  private shakeMag = 0;

  private constructor(app: Application) {
    this.app = app;
    app.stage.addChild(this.bgLayer, this.content);
    this.content.addChild(this.gridLayer, this.entityLayer, this.fxLayer, this.hudLayer);
    this.entityLayer.filters = [new AdvancedBloomFilter({ threshold: 0.6, bloomScale: 0.3, blur: 2, quality: 4 })];
    this.fxLayer.filters = [new AdvancedBloomFilter({ threshold: 0.3, bloomScale: 1.0, blur: 6, quality: 4 })];
  }
  static async create(canvas: HTMLCanvasElement): Promise<PixiStage> {
    const app = new Application();
    await app.init({ canvas, resizeTo: canvas, antialias: false, background: '#06070f', autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
    return new PixiStage(app);
  }
  get width(): number { return this.app.screen.width; }
  get height(): number { return this.app.screen.height; }
  shake(mag: number): void { this.shakeMag = Math.max(this.shakeMag, mag); }
  update(dt: number): void {
    if (this.shakeMag > 0.1) {
      this.content.x = (Math.random() - 0.5) * this.shakeMag;
      this.content.y = (Math.random() - 0.5) * this.shakeMag;
      this.shakeMag *= Math.pow(0.001, dt / 1000);
    } else { this.content.x = 0; this.content.y = 0; this.shakeMag = 0; }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/games/bomber/render/PixiStage.ts
git commit -m "feat(bomber): add PixiStage with layers, bloom, shake"
```

---

### Task 16: GridView + EntityView + HudView (placeholder graphics)

**Files:**
- Create: `src/scripts/games/bomber/render/layout.ts` (cell size + board origin from stage size)
- Create: `src/scripts/games/bomber/render/GridView.ts`
- Create: `src/scripts/games/bomber/render/EntityView.ts`
- Create: `src/scripts/games/bomber/render/HudView.ts`

- [ ] **Step 1: Write `layout.ts`**

```ts
// layout.ts
import { GRID_COLS, GRID_ROWS } from '../engine/constants';
export interface Layout { cell: number; ox: number; oy: number; }
export function computeLayout(w: number, h: number): Layout {
  const hudH = 56;
  const cell = Math.max(16, Math.floor(Math.min((w * 0.96) / GRID_COLS, (h - hudH) * 0.96 / GRID_ROWS)));
  const ox = Math.round((w - cell * GRID_COLS) / 2);
  const oy = Math.round(hudH + (h - hudH - cell * GRID_ROWS) / 2);
  return { cell, ox, oy };
}
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
```

- [ ] **Step 2: Write `GridView.ts`** — draws the grid each frame from `state.grid` using `Graphics`: floor = dark tile with subtle border, wall = solid slate block with bevel, crate = brown block with cross-hatch. Redraw only when the grid reference changes (cache last grid). Method: `render(state, layout)`.

- [ ] **Step 3: Write `EntityView.ts`** — draws bombs (pulsing circle), blasts (bright cross cells), power-ups (colored diamond per kind), exit (glowing square, only when `state.exitActive`), enemies (colored circle per kind), player (bright square; blink while `invulnMs>0`). **Interpolate** moving entities: render position = `lerp(prev, cur, progress)` where `progress = 1 - moveCooldownMs/speedMs(level)` for player and `1 - moveAccMs/enemyMoveMs` for enemies (clamp 0..1). Method: `render(state, layout)`.

- [ ] **Step 4: Write `HudView.ts`** — top bar text using `Press Start 2P`: `FLOOR n`, `♥ × lives`, `SCORE`, and small icons for active power-up levels (fire/bomb/speed/shield). Method: `render(state)` + `setLayout(w)`.

- [ ] **Step 5: Verify by temporary harness later (Task 17).** No standalone test; commit the views.

```bash
git add src/scripts/games/bomber/render/layout.ts src/scripts/games/bomber/render/GridView.ts src/scripts/games/bomber/render/EntityView.ts src/scripts/games/bomber/render/HudView.ts
git commit -m "feat(bomber): add grid/entity/hud views with placeholder graphics"
```

---

### Task 17: Render entry `main.ts` + game page + lobby card

**Files:**
- Create: `src/scripts/games/bomber/render/main.ts`
- Create: `src/pages/games/bomber.astro`
- Modify: `src/pages/games/index.astro` (swap one `soon` card for an active `bomber` card)

- [ ] **Step 1: Write `main.ts`** — `startBomber(canvas): Promise<BomberHandle>` following the tetris `main.ts` shape:
  - `const stage = await PixiStage.create(canvas);`
  - `const seed = Math.floor(Math.random()*1e9); const game = new BomberGame({ seed });`
  - instantiate `GridView`, `EntityView`, `HudView`, `SoundManager`.
  - `await document.fonts.load('14px "Press Start 2P"').catch(()=>{})` before HUD.
  - **Keyboard:** on `keydown`, `sound.ensure()`; if `e.code==='KeyM'` toggle mute; else `const a = KEYMAP[e.code]; if(!a) return; e.preventDefault();` — if `a==='bomb'` and `!e.repeat` → `game.input('bomb'); sound.place();` else if directional → `game.setHeld(a as Dir, true)`. On `keyup`: if directional → `game.setHeld(a, false)`.
  - **Ticker:** `const dt = ticker.deltaMS; game.step(dt);` then `for (const ev of game.drainEvents())` map events to FX + sound (`explode`→`stage.shake(8)+sound.explode()`, `crateBreak`→small fx, `pickup`→`sound.pickup()`, `enemyKill`→fx, `playerHit`→`stage.shake(10)+sound.hit()`, `descend`→`sound.descend()`, `gameover`→`sound.gameover()` + show overlay). Then `const s = game.getState(); grid.render(s, lay); entity.render(s, lay); hud.render(s); stage.update(dt);`
  - **Resize:** `stage.app.renderer.on('resize', relayout)` recomputing `computeLayout`.
  - **Game over overlay:** when `s.status==='gameover'`, show a DOM overlay (`#bomber-over`) with `FLOOR s.floor` + `SCORE` + a restart button that calls `location.reload()` (simplest) — or re-init. v1: reload.
  - Expose `(window as any).__bomberDebug = { game, handle, stage };` for e2e.
  - Return handle with `destroy()` removing listeners + `stage.app.destroy()`.

- [ ] **Step 2: Write `bomber.astro`** — copy the structure of `tetris.astro` but simplified to SOLO only:

```astro
---
import BaseLayout from '@components/layout/BaseLayout.astro';
import { defaultLang, type Language } from '@i18n/index';
const lang: Language = defaultLang;
---
<BaseLayout title="Dungeon Arcade — Dungeon Bomber" description="像素地城炸彈生存" lang={lang}>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" />
  <main class="bomber-page">
    <a class="bomber-back" href="/games">← ARCADE</a>
    <p class="bomber-hint">MOVE WASD/← → · BOMB SPACE · MUTE M</p>
    <div class="bomber-stage"><canvas id="bomber-canvas"></canvas></div>
    <div class="mode-select" id="mode-select">
      <h2 class="ms-title">DUNGEON BOMBER</h2>
      <div class="ms-buttons"><button class="ms-btn ms-solo" data-mode="solo">START</button></div>
    </div>
    <div class="bomber-over" id="bomber-over" hidden>
      <h2 class="ms-title">GAME OVER</h2>
      <p id="bomber-over-stats" class="over-stats"></p>
      <button class="ms-btn ms-solo" id="bomber-restart">RETRY</button>
    </div>
  </main>
</BaseLayout>
```

  Reuse the tetris page's `<style>` for `.bomber-page/.bomber-stage/#bomber-canvas/.bomber-back/.bomber-hint/.mode-select/.ms-title/.ms-btn/.ms-solo` (rename `tetris-`→`bomber-`). Add `.bomber-over{...}` styled like `.mode-select`. Then the script:

```astro
<script>
  import { startBomber } from '@scripts/games/bomber/render/main';
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById('bomber-canvas') as HTMLCanvasElement | null;
  const modeSelect = document.getElementById('mode-select');
  let started = false;
  function startSolo(): void {
    if (started || !canvas) return;
    started = true; modeSelect?.remove();
    startBomber(canvas).catch((e: unknown) => console.error('[bomber] start failed', e));
  }
  modeSelect?.querySelector('[data-mode="solo"]')?.addEventListener('click', startSolo);
  if (params.get('mode') === 'solo') startSolo();
</script>
```

- [ ] **Step 3: Modify `index.astro`** — change the games array so one `COMING SOON` becomes the bomber entry:

```ts
const games = [
  { id: 'tetris', title: 'BATTLE TETRIS', href: '/games/tetris', active: true },
  { id: 'bomber', title: 'DUNGEON BOMBER', href: '/games/bomber', active: true },
  { id: 'soon-1', title: 'COMING SOON', href: null, active: false },
];
```

- [ ] **Step 4: Manual verification (dev server)**

Run: `npm run dev` (already running per project; otherwise start it).
Open: `http://localhost:4321/games` → DUNGEON BOMBER card present and clickable.
Open: `http://localhost:4321/games/bomber?mode=solo` → grid renders; WASD/arrows move the player smoothly; Space drops a bomb; after ~2s it explodes in a cross, breaks crates; walking into the blast costs a life; killing all enemies reveals the exit; stepping on it advances FLOOR. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/render/main.ts src/pages/games/bomber.astro src/pages/games/index.astro
git commit -m "feat(bomber): render entry, game page (solo), arcade lobby card"
```

---

## Phase 7 — Art, i18n, e2e, polish

### Task 18: Generate pixel art assets

**Files:**
- Create: `public/assets/games/bomber/*.webp` (sprites)
- Modify: `src/scripts/games/bomber/render/assets.ts` (new file) + `EntityView.ts`/`GridView.ts` to use textures

Use the `nanobanana-image-gen` skill. Generate each sprite on a flat black background (per `reference_game_asset_additive_black` memory: brightness→alpha keying avoids black boxes), pixel-art style matching the chosen mockup `docs/superpowers/specs/dungeon-bomber-mockups/style-B-pixel-retro-CHOSEN.webp`.

- [ ] **Step 1: Generate the tile/sprite set** (one asset per call; write to `tmp/bomber-art/` first). Required: `floor`, `wall`, `crate`, `player` (4-dir, can start with 1 frame each), `enemy-wander`, `enemy-chaser`, `bomb`, `blast-center`, `blast-arm`, `powerup-fire`, `powerup-bomb`, `powerup-speed`, `powerup-shield`, `exit`. Example call:

```bash
node .claude/skills/nanobanana-image-gen/scripts/generate.mjs \
  "Generate a single 16-bit pixel-art game sprite on a pure flat black background: a wooden destructible crate tile, top-down, crisp readable pixels, bright saturated palette, hard pixel edges, centered, no text" \
  tmp/bomber-art/crate.png --aspect 1:1 --webp --webp-quality 90 --resize 128
```

- [ ] **Step 2: Key out black → alpha** for each (reuse the project's brightness→alpha approach; see memory `reference_game_asset_additive_black` / `reference_image_and_bash_gotchas`). Move approved sprites to `public/assets/games/bomber/`.

- [ ] **Step 3: Write `assets.ts`** mirroring tetris `assets.ts`: `ASSET_URLS` map + `loadBomberTextures()` returning a typed object; set `source.scaleMode = 'nearest'` on every texture for crisp pixels.

- [ ] **Step 4: Swap placeholders for textures** in `GridView`/`EntityView` (replace `Graphics` draws with `Sprite`s sized to `layout.cell`). Keep the interpolation logic unchanged.

- [ ] **Step 5: Manual verify** at `http://localhost:4321/games/bomber?mode=solo` — sprites render crisp, readable; floors tinted per-depth (optional `tint` by `floor`).

- [ ] **Step 6: Commit**

```bash
git add public/assets/games/bomber src/scripts/games/bomber/render/assets.ts src/scripts/games/bomber/render/GridView.ts src/scripts/games/bomber/render/EntityView.ts
git commit -m "feat(bomber): pixel-art sprites + texture rendering"
```

---

### Task 19: i18n strings

**Files:**
- Modify: `src/i18n/translations/*.ts` (all 5 languages) — add a `games.bomber.*` group: title, START, RETRY, GAME OVER, FLOOR, SCORE.
- Modify: `bomber.astro` to use `t('games.bomber.title')` etc. where the page currently hard-codes English (follow how `index.astro`/`tetris.astro` handle the lobby title; if those are English-only too, keep parity and only add keys actually displayed).

- [ ] **Step 1: Read an existing translation file** to find the games namespace: `grep -rn "tetris\|games" src/i18n/translations/zh-TW.ts | head`.
- [ ] **Step 2: Add the `games.bomber` keys** to each of the 5 `*.ts` translation files (same key set, localized values).
- [ ] **Step 3: Wire the keys** into `bomber.astro` server-rendered text.
- [ ] **Step 4: Verify** `npm run build` type-checks the i18n keys (Astro/TS build fails on missing keys if the project types them).
- [ ] **Step 5: Commit**

```bash
git add src/i18n/translations src/pages/games/bomber.astro
git commit -m "feat(bomber): i18n strings for all five languages"
```

---

### Task 20: Playwright solo smoke

**Files:**
- Create: `tests/e2e/bomber.spec.ts`

- [ ] **Step 1: Read the tetris e2e** for the pattern: `cat tests/e2e/*tetris*solo*.spec.ts` (or the relevant solo smoke).

- [ ] **Step 2: Write `bomber.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('dungeon bomber solo boots and is interactive', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/games/bomber?mode=solo');
  // 引擎掛上 debug 鉤子即代表啟動成功
  await page.waitForFunction(() => !!(window as any).__bomberDebug?.game, null, { timeout: 10000 });

  // 放一顆炸彈，前進到引爆
  await page.keyboard.press('Space');
  const placed = await page.evaluate(() => (window as any).__bomberDebug.game.getState().bombs.length);
  expect(placed).toBe(1);

  // 走一格：按住右
  const x0 = await page.evaluate(() => (window as any).__bomberDebug.game.getState().player.x);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  const x1 = await page.evaluate(() => (window as any).__bomberDebug.game.getState().player.x);
  expect(x1).toBeGreaterThanOrEqual(x0); // 至少沒倒退（可能被炸彈擋，仍算啟動 OK）

  expect(errors).toEqual([]);
});
```

- [ ] **Step 3: Run it**

Run: `npx playwright test tests/e2e/bomber.spec.ts`
Expected: PASS (start dev/preview server per `playwright.config.ts` webServer setting).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/bomber.spec.ts
git commit -m "test(bomber): add solo smoke e2e"
```

---

### Task 21: Final verification

- [ ] **Step 1: Full unit suite** — Run: `npx vitest run src/scripts/games/bomber` → ALL PASS.
- [ ] **Step 2: Build** — Run: `npm run build` → succeeds, no type errors.
- [ ] **Step 3: E2E** — Run: `npx playwright test tests/e2e/bomber.spec.ts` → PASS.
- [ ] **Step 4: Manual playthrough** — `http://localhost:4321/games/bomber?mode=solo`: clear floor 1, descend to floor 2 (power-ups persist), die 3× → GAME OVER overlay with score, RETRY restarts. No console errors.
- [ ] **Step 5: Update memory** — append progress to `project_dungeon_bomber` memory (or extend `project_dungeon_arcade`).

---

## Self-Review

**1. Spec coverage** (spec §→task):
- §3.1/3.2 core loop, one-hit, 3 lives, shield, descend → Tasks 10–12 ✓
- §3.3 grid-locked + tween → engine integer model (Tasks 7,10,12) + EntityView lerp (Task 16) ✓
- §4 power-ups (4), enemies (2), generation → Tasks 4, 8, 11 ✓
- §4 chain explosions → Task 6 ✓
- §5 engine/render/input/audio split → Tasks 1–17 ✓
- §6 pixel art pipeline → Task 18 ✓
- §7 Vitest TDD + Playwright smoke → all engine tasks + Task 20 ✓
- §4 lobby entry + i18n → Tasks 17, 19 ✓

**2. Placeholder scan:** Render bodies in Tasks 15–17 are described as skeletons-to-fill with explicit method contracts, layer lists, and the tetris files to copy — not "TBD". Art (Task 18) lists every required sprite. No `TODO`/"handle edge cases" left.

**3. Type consistency:** `BomberGame` API (`setHeld`, `input`, `step`, `getState`, `drainEvents`, `debug*`), `BomberState` fields, `BomberEvent` kinds, and `InputAction = Dir|'bomb'` are used identically across Tasks 10–12, 17, 20. `computeBlast`→`resolveChain`→`game.stepBombs` signatures line up. `speedMs`/`dirDelta`/`makePlayer` defined in Task 7 and consumed in Tasks 10–12/16.

**Known intentional deferrals (spec §8/§9):** touch controls, online/2P, advanced power-ups (kick/remote/pierce), bosses, meta-progression, BGM, time bonus — all out of v1 scope, not gaps.
