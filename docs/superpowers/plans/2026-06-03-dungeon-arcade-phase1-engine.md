# Dungeon Arcade — Phase 1：核心引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打造一個純 TypeScript、零渲染依賴、全單元測試覆蓋的現代 Guideline 俄羅斯方塊單人引擎（含 7-bag、SRS 旋轉+踢牆、消行、計分/combo/B2B/T-spin、單人狀態機）。

**Architecture:** 邏輯與渲染徹底分離。本階段只做 headless 引擎：盤面以 row-major 矩陣表示，方塊以「相對 cell 座標表」表示，狀態機吐出可序列化的 `GameState` 與 `GameEvent[]`，供後續 Pixi 渲染層（Phase 2）與對戰/AI（Phase 3/4）消費。座標系：`x` 向右、`y` 向下（與畫布一致），矩陣 `board[y][x]`。

**Tech Stack:** TypeScript（strict）、Vitest（happy-dom、globals、測試與源碼同目錄 `*.test.ts`）。無新增 npm 依賴。

**Spec:** `docs/superpowers/specs/2026-06-03-dungeon-arcade-battle-tetris-design.md`（§3.1 核心引擎、§5 玩法規格）

---

## 檔案結構（本階段建立）

```
src/scripts/games/tetris/engine/
  types.ts        # 共用型別（PieceType / Rotation / Cell / Matrix / ActivePiece / GameState / GameEvent）
  constants.ts    # 盤面尺寸、方塊 cell 表、SRS 踢牆表、計分表、重力表、spawn 位置
  rng.ts          # 可帶 seed 的確定性 PRNG（mulberry32）
  bag.ts          # 7-bag 亂數產生器
  piece.ts        # 取得方塊 cell 絕對座標、SRS 旋轉 + 踢牆
  board.ts        # 建立空盤、碰撞偵測、鎖定、消行、插入垃圾行
  scoring.ts      # 消行計分、combo、B2B、T-spin 偵測
  game.ts         # 單人狀態機（spawn/重力/lock delay/hold/軟硬降/消行/頂出/事件）
  rng.test.ts
  bag.test.ts
  piece.test.ts
  board.test.ts
  scoring.test.ts
  game.test.ts
```

每個檔案單一職責；`game.ts` 是唯一的協調者，其餘皆為純函式模組（無狀態、無副作用），方便單獨測試。

---

## Task 1：型別與常數骨架

**Files:**
- Create: `src/scripts/games/tetris/engine/types.ts`
- Create: `src/scripts/games/tetris/engine/constants.ts`
- Test: `src/scripts/games/tetris/engine/constants.test.ts`

- [ ] **Step 1：寫失敗測試**

Create `src/scripts/games/tetris/engine/constants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  BOARD_WIDTH, VISIBLE_HEIGHT, BUFFER_ROWS, TOTAL_HEIGHT,
  PIECE_TYPES, SHAPES, SPAWN, KICKS_JLSTZ, KICKS_I,
} from './constants';

describe('constants', () => {
  it('盤面尺寸正確', () => {
    expect(BOARD_WIDTH).toBe(10);
    expect(VISIBLE_HEIGHT).toBe(20);
    expect(BUFFER_ROWS).toBe(2);
    expect(TOTAL_HEIGHT).toBe(22);
  });

  it('七種方塊都有 4 個旋轉態、每態 4 個 cell', () => {
    expect(PIECE_TYPES).toHaveLength(7);
    for (const type of PIECE_TYPES) {
      for (let r = 0 as 0 | 1 | 2 | 3; r < 4; r++) {
        expect(SHAPES[type][r as 0 | 1 | 2 | 3]).toHaveLength(4);
      }
    }
  });

  it('每個方塊都有 spawn 位置', () => {
    for (const type of PIECE_TYPES) {
      expect(SPAWN[type]).toHaveProperty('x');
      expect(SPAWN[type]).toHaveProperty('y');
    }
  });

  it('踢牆表 8 種轉換、每種 5 個候選 offset', () => {
    const keys = ['0>1', '1>0', '1>2', '2>1', '2>3', '3>2', '3>0', '0>3'];
    for (const k of keys) {
      expect(KICKS_JLSTZ[k]).toHaveLength(5);
      expect(KICKS_I[k]).toHaveLength(5);
    }
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/constants.test.ts`
Expected: FAIL（`Cannot find module './constants'`）

- [ ] **Step 3：建立 types.ts**

Create `src/scripts/games/tetris/engine/types.ts`:

```ts
/** 方塊種類 */
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** 旋轉態：0=spawn, 1=順轉, 2=180, 3=逆轉 */
export type Rotation = 0 | 1 | 2 | 3;

/** 盤面格子：方塊種類、'G'=垃圾、null=空 */
export type Cell = PieceType | 'G' | null;

/** row-major 盤面矩陣，board[y][x]，y=0 在最上 */
export type Matrix = Cell[][];

export interface Point { x: number; y: number; }

/** 場上活動方塊：type/rotation + 其 bounding box 左上原點 (x,y) */
export interface ActivePiece {
  type: PieceType;
  rotation: Rotation;
  x: number;
  y: number;
}

export type TSpinType = 'none' | 'mini' | 'full';

/** 可序列化的對外遊戲狀態 */
export interface GameState {
  board: Matrix;
  active: ActivePiece | null;
  hold: PieceType | null;
  canHold: boolean;
  next: PieceType[];
  score: number;
  lines: number;
  level: number;
  combo: number;        // -1 = 無連擊；0,1,2… = 連擊次數
  backToBack: boolean;
  status: 'playing' | 'topout';
}

export type GameEvent =
  | { kind: 'spawn'; type: PieceType }
  | { kind: 'lock' }
  | { kind: 'hold' }
  | { kind: 'lineClear'; rows: number[]; count: number; tSpin: TSpinType; b2b: boolean; combo: number }
  | { kind: 'topout' };
```

- [ ] **Step 4：建立 constants.ts**

Create `src/scripts/games/tetris/engine/constants.ts`:

```ts
import type { PieceType, Rotation, Point } from './types';

export const BOARD_WIDTH = 10;
export const VISIBLE_HEIGHT = 20;
export const BUFFER_ROWS = 2;           // 視覺上方緩衝列（spawn 區）
export const TOTAL_HEIGHT = VISIBLE_HEIGHT + BUFFER_ROWS; // 22

export const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** 每個方塊 4 個旋轉態的 filled cell（相對其 bounding box 左上原點，x 右 / y 下） */
export const SHAPES: Record<PieceType, Record<Rotation, Point[]>> = {
  I: {
    0: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
    1: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
    2: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }],
    3: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }],
  },
  O: {
    0: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    1: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    2: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    3: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  },
  T: {
    0: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    1: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    2: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    3: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  },
  S: {
    0: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    1: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    2: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
    3: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  },
  Z: {
    0: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    1: [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    2: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    3: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }],
  },
  J: {
    0: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    1: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
    2: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    3: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  },
  L: {
    0: [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    1: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    2: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }],
    3: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
  },
};

/** spawn 時 bounding box 左上原點位置（y 在緩衝區頂端） */
export const SPAWN: Record<PieceType, Point> = {
  I: { x: 3, y: 0 },
  O: { x: 4, y: 0 },
  T: { x: 3, y: 0 },
  S: { x: 3, y: 0 },
  Z: { x: 3, y: 0 },
  J: { x: 3, y: 0 },
  L: { x: 3, y: 0 },
};

/**
 * SRS 踢牆表（已轉成 y 向下座標系）。key = `${from}>${to}`。
 * 旋轉時依序嘗試這些 (x,y) 偏移，第一個不碰撞者成立。
 */
export const KICKS_JLSTZ: Record<string, Point[]> = {
  '0>1': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }],
  '1>0': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }],
  '1>2': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }],
  '2>1': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }],
  '2>3': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  '3>2': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }],
  '3>0': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }],
  '0>3': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
};

export const KICKS_I: Record<string, Point[]> = {
  '0>1': [{ x: 0, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 }],
  '1>0': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 }],
  '1>2': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 }],
  '2>1': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 }],
  '2>3': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 }],
  '3>2': [{ x: 0, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 }],
  '3>0': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 }],
  '0>3': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 }],
};

/** 每行消除基礎分（×等級）。索引 = 消除行數 */
export const LINE_SCORES = [0, 100, 300, 500, 800];

/** T-spin 計分（×等級） */
export const TSPIN_SCORES = {
  mini: [100, 200, 400],        // 0,1,2 行
  full: [400, 800, 1200, 1600], // 0,1,2,3 行
};

export const SOFT_DROP_POINTS = 1;   // 每格
export const HARD_DROP_POINTS = 2;   // 每格
export const COMBO_BASE = 50;        // combo 加分 ×combo×等級
export const B2B_MULTIPLIER = 1.5;   // back-to-back 倍率

export const LINES_PER_LEVEL = 10;

/** 重力：每一格下落間隔（毫秒），依等級。超出陣列用最後一個值。 */
export const GRAVITY_MS = [1000, 793, 618, 473, 355, 262, 190, 135, 94, 64, 43, 28, 18, 11, 7];

export const LOCK_DELAY_MS = 500;
export const LOCK_RESET_LIMIT = 15;
export const NEXT_QUEUE_SIZE = 5;
```

- [ ] **Step 5：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/constants.test.ts`
Expected: PASS（4 個測試通過）

- [ ] **Step 6：Commit**

```bash
git add src/scripts/games/tetris/engine/types.ts src/scripts/games/tetris/engine/constants.ts src/scripts/games/tetris/engine/constants.test.ts
git commit -m "feat(tetris): add engine types and Guideline constants (shapes, SRS kicks, scoring)"
```

---

## Task 2：確定性 PRNG（rng.ts）

**Files:**
- Create: `src/scripts/games/tetris/engine/rng.ts`
- Test: `src/scripts/games/tetris/engine/rng.test.ts`

- [ ] **Step 1：寫失敗測試**

Create `src/scripts/games/tetris/engine/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('同 seed 產生相同序列（可重現）', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('不同 seed 產生不同序列', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('輸出落在 [0,1)', () => {
    const r = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/rng.test.ts`
Expected: FAIL（`Cannot find module './rng'`）

- [ ] **Step 3：實作 rng.ts**

Create `src/scripts/games/tetris/engine/rng.ts`:

```ts
/**
 * mulberry32：32-bit 確定性 PRNG。回傳一個每次呼叫產生 [0,1) 的函式。
 * 帶 seed 時可完全重現，方便測試與對戰雙方同步。
 */
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

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/rng.test.ts`
Expected: PASS（3 個測試通過）

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/rng.ts src/scripts/games/tetris/engine/rng.test.ts
git commit -m "feat(tetris): add seedable mulberry32 PRNG"
```

---

## Task 3：7-bag 亂數（bag.ts）

**Files:**
- Create: `src/scripts/games/tetris/engine/bag.ts`
- Test: `src/scripts/games/tetris/engine/bag.test.ts`

- [ ] **Step 1：寫失敗測試**

Create `src/scripts/games/tetris/engine/bag.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createBag } from './bag';
import { PIECE_TYPES } from './constants';

describe('createBag', () => {
  it('每 7 個輸出恰好包含 7 種方塊各一次', () => {
    const bag = createBag(42);
    const first7 = [bag.next(), bag.next(), bag.next(), bag.next(), bag.next(), bag.next(), bag.next()];
    expect([...first7].sort()).toEqual([...PIECE_TYPES].sort());
    const second7 = [bag.next(), bag.next(), bag.next(), bag.next(), bag.next(), bag.next(), bag.next()];
    expect([...second7].sort()).toEqual([...PIECE_TYPES].sort());
  });

  it('同 seed 兩個 bag 產生相同序列', () => {
    const a = createBag(7);
    const b = createBag(7);
    const seqA = Array.from({ length: 14 }, () => a.next());
    const seqB = Array.from({ length: 14 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('peek(n) 不消耗、且與後續 next 一致', () => {
    const bag = createBag(5);
    const preview = bag.peek(5);
    expect(preview).toHaveLength(5);
    const drawn = [bag.next(), bag.next(), bag.next(), bag.next(), bag.next()];
    expect(drawn).toEqual(preview);
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/bag.test.ts`
Expected: FAIL（`Cannot find module './bag'`）

- [ ] **Step 3：實作 bag.ts**

Create `src/scripts/games/tetris/engine/bag.ts`:

```ts
import type { PieceType } from './types';
import { PIECE_TYPES } from './constants';
import { createRng } from './rng';

export interface Bag {
  next(): PieceType;
  peek(count: number): PieceType[];
}

/** 7-bag：每袋含 7 種各一，洗牌後依序發出，袋空再補新袋。 */
export function createBag(seed: number): Bag {
  const rng = createRng(seed);
  let queue: PieceType[] = [];

  function refill(): void {
    const bag = [...PIECE_TYPES];
    // Fisher–Yates 洗牌
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    queue.push(...bag);
  }

  function ensure(count: number): void {
    while (queue.length < count) refill();
  }

  return {
    next(): PieceType {
      ensure(1);
      return queue.shift()!;
    },
    peek(count: number): PieceType[] {
      ensure(count);
      return queue.slice(0, count);
    },
  };
}
```

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/bag.test.ts`
Expected: PASS（3 個測試通過）

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/bag.ts src/scripts/games/tetris/engine/bag.test.ts
git commit -m "feat(tetris): add 7-bag randomizer with peek preview"
```

---

## Task 4：方塊絕對座標（piece.ts — getCells）

**Files:**
- Create: `src/scripts/games/tetris/engine/piece.ts`
- Test: `src/scripts/games/tetris/engine/piece.test.ts`

- [ ] **Step 1：寫失敗測試**

Create `src/scripts/games/tetris/engine/piece.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getCells, spawnPiece } from './piece';
import { SPAWN } from './constants';

describe('getCells', () => {
  it('回傳 4 個絕對座標（box 原點 + 相對 cell）', () => {
    const cells = getCells({ type: 'O', rotation: 0, x: 4, y: 0 });
    expect(cells).toHaveLength(4);
    // O 在 (0,0)(1,0)(0,1)(1,1)，原點 (4,0) → (4,0)(5,0)(4,1)(5,1)
    expect(cells).toEqual([
      { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 },
    ]);
  });

  it('T 方塊 spawn 態座標正確', () => {
    const cells = getCells({ type: 'T', rotation: 0, x: 3, y: 0 });
    // T R0: (1,0)(0,1)(1,1)(2,1) + (3,0) → (4,0)(3,1)(4,1)(5,1)
    expect(cells).toEqual([
      { x: 4, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 },
    ]);
  });
});

describe('spawnPiece', () => {
  it('以該方塊的 SPAWN 位置與 rotation 0 建立', () => {
    const p = spawnPiece('L');
    expect(p).toEqual({ type: 'L', rotation: 0, x: SPAWN.L.x, y: SPAWN.L.y });
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/piece.test.ts`
Expected: FAIL（`Cannot find module './piece'`）

- [ ] **Step 3：實作 piece.ts（getCells + spawnPiece）**

Create `src/scripts/games/tetris/engine/piece.ts`:

```ts
import type { ActivePiece, PieceType, Point, Rotation } from './types';
import { SHAPES, SPAWN } from './constants';

/** 回傳活動方塊在盤面上的 4 個絕對 cell 座標 */
export function getCells(piece: ActivePiece): Point[] {
  return SHAPES[piece.type][piece.rotation].map((c) => ({
    x: piece.x + c.x,
    y: piece.y + c.y,
  }));
}

/** 以 spawn 位置建立新方塊（rotation 0） */
export function spawnPiece(type: PieceType): ActivePiece {
  return { type, rotation: 0, x: SPAWN[type].x, y: SPAWN[type].y };
}

/** 旋轉方向：+1 順轉、-1 逆轉，回傳 0..3 */
export function rotateIndex(rotation: Rotation, dir: 1 | -1): Rotation {
  return (((rotation + dir) % 4) + 4) % 4 as Rotation;
}
```

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/piece.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/piece.ts src/scripts/games/tetris/engine/piece.test.ts
git commit -m "feat(tetris): add piece cell resolution and spawn"
```

---

## Task 5：SRS 旋轉 + 踢牆（piece.ts — tryRotate）

**Files:**
- Modify: `src/scripts/games/tetris/engine/piece.ts`
- Modify: `src/scripts/games/tetris/engine/piece.test.ts`

`tryRotate` 需要「碰撞判定」。為避免循環相依，碰撞函式以參數注入（`game.ts` 會傳入 `board.ts` 的 `canPlace`）。

- [ ] **Step 1：追加失敗測試**

Append to `src/scripts/games/tetris/engine/piece.test.ts`:

```ts
import { tryRotate } from './piece';
import type { ActivePiece } from './types';

describe('tryRotate', () => {
  // 空間永遠夠用的碰撞函式 → 必走第一個 offset (0,0)
  const always = () => true;

  it('順轉後 rotation 變成 1、套用第一個成功的 offset', () => {
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 5 };
    const result = tryRotate(p, 1, always);
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(1);
    expect(result!.x).toBe(3);
    expect(result!.y).toBe(5);
  });

  it('逆轉 from 0 → rotation 3', () => {
    const p: ActivePiece = { type: 'J', rotation: 0, x: 3, y: 5 };
    const result = tryRotate(p, -1, always);
    expect(result!.rotation).toBe(3);
  });

  it('當第一個 offset 碰撞、改用下一個成功 offset（踢牆）', () => {
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 5 };
    // 只在第一個 (0,0) 候選位置回報碰撞，其餘可放 → 應採用 0>1 的第二個 offset (-1,0)
    const collideAtOrigin = (cand: ActivePiece) => !(cand.x === 3 && cand.y === 5);
    const result = tryRotate(p, 1, collideAtOrigin);
    expect(result!.rotation).toBe(1);
    expect(result!.x).toBe(2); // 3 + (-1)
    expect(result!.y).toBe(5);
  });

  it('所有 offset 都碰撞時回傳 null', () => {
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 5 };
    const result = tryRotate(p, 1, () => false);
    expect(result).toBeNull();
  });

  it('O 方塊旋轉不改變 cell 形狀', () => {
    const p: ActivePiece = { type: 'O', rotation: 0, x: 4, y: 5 };
    const result = tryRotate(p, 1, always);
    expect(result!.rotation).toBe(1);
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/piece.test.ts`
Expected: FAIL（`tryRotate is not a function`）

- [ ] **Step 3：實作 tryRotate**

Append to `src/scripts/games/tetris/engine/piece.ts`:

```ts
import { KICKS_I, KICKS_JLSTZ } from './constants';

/** 旋轉後測試一個候選位置是否可放（true=可放） */
export type PlaceTest = (candidate: ActivePiece) => boolean;

/**
 * 嘗試 SRS 旋轉。dir=+1 順轉 / -1 逆轉。
 * 依踢牆表逐一嘗試 offset，第一個 test 通過者回傳；全失敗回傳 null。
 * O 方塊不踢牆（只試原位）。
 */
export function tryRotate(piece: ActivePiece, dir: 1 | -1, test: PlaceTest): ActivePiece | null {
  const to = rotateIndex(piece.rotation, dir);

  if (piece.type === 'O') {
    const cand: ActivePiece = { ...piece, rotation: to };
    return test(cand) ? cand : null;
  }

  const key = `${piece.rotation}>${to}`;
  const table = piece.type === 'I' ? KICKS_I : KICKS_JLSTZ;
  const offsets = table[key];

  for (const off of offsets) {
    const cand: ActivePiece = { type: piece.type, rotation: to, x: piece.x + off.x, y: piece.y + off.y };
    if (test(cand)) return cand;
  }
  return null;
}
```

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/piece.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/piece.ts src/scripts/games/tetris/engine/piece.test.ts
git commit -m "feat(tetris): add SRS rotation with wall kicks"
```

---

## Task 6：盤面建立與碰撞偵測（board.ts — createBoard / canPlace）

**Files:**
- Create: `src/scripts/games/tetris/engine/board.ts`
- Test: `src/scripts/games/tetris/engine/board.test.ts`

- [ ] **Step 1：寫失敗測試**

Create `src/scripts/games/tetris/engine/board.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createBoard, canPlace } from './board';
import { BOARD_WIDTH, TOTAL_HEIGHT } from './constants';
import type { ActivePiece } from './types';

describe('createBoard', () => {
  it('建立 TOTAL_HEIGHT × BOARD_WIDTH 全空盤', () => {
    const b = createBoard();
    expect(b).toHaveLength(TOTAL_HEIGHT);
    expect(b[0]).toHaveLength(BOARD_WIDTH);
    expect(b.every((row) => row.every((c) => c === null))).toBe(true);
  });
});

describe('canPlace', () => {
  it('空盤上方塊可放', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
    expect(canPlace(b, p)).toBe(true);
  });

  it('超出左牆不可放', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'T', rotation: 0, x: -2, y: 0 };
    expect(canPlace(b, p)).toBe(false);
  });

  it('超出右牆不可放', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'T', rotation: 0, x: BOARD_WIDTH - 1, y: 0 };
    expect(canPlace(b, p)).toBe(false);
  });

  it('超出底部不可放', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: TOTAL_HEIGHT - 1 };
    expect(canPlace(b, p)).toBe(false);
  });

  it('與既有格子重疊不可放', () => {
    const b = createBoard();
    b[1][4] = 'I'; // T R0 在 (3,0) 時佔 (4,0)(3,1)(4,1)(5,1)，與 (4,1) 衝突
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
    expect(canPlace(b, p)).toBe(false);
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/board.test.ts`
Expected: FAIL（`Cannot find module './board'`）

- [ ] **Step 3：實作 board.ts（createBoard + canPlace）**

Create `src/scripts/games/tetris/engine/board.ts`:

```ts
import type { ActivePiece, Matrix } from './types';
import { BOARD_WIDTH, TOTAL_HEIGHT } from './constants';
import { getCells } from './piece';

/** 建立全空盤面 */
export function createBoard(): Matrix {
  return Array.from({ length: TOTAL_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null),
  );
}

/** 方塊是否能放在盤面（不出界、不重疊） */
export function canPlace(board: Matrix, piece: ActivePiece): boolean {
  for (const { x, y } of getCells(piece)) {
    if (x < 0 || x >= BOARD_WIDTH) return false;
    if (y < 0 || y >= TOTAL_HEIGHT) return false;
    if (board[y][x] !== null) return false;
  }
  return true;
}
```

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/board.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/board.ts src/scripts/games/tetris/engine/board.test.ts
git commit -m "feat(tetris): add board creation and collision detection"
```

---

## Task 7：鎖定方塊與消行（board.ts — lockPiece / clearLines）

**Files:**
- Modify: `src/scripts/games/tetris/engine/board.ts`
- Modify: `src/scripts/games/tetris/engine/board.test.ts`

- [ ] **Step 1：追加失敗測試**

Append to `src/scripts/games/tetris/engine/board.test.ts`:

```ts
import { lockPiece, clearLines } from './board';

describe('lockPiece', () => {
  it('回傳新盤面並把方塊格子寫成其顏色（不改原盤）', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'O', rotation: 0, x: 4, y: 0 };
    const next = lockPiece(b, p);
    expect(next[0][4]).toBe('O');
    expect(next[0][5]).toBe('O');
    expect(next[1][4]).toBe('O');
    expect(next[1][5]).toBe('O');
    expect(b[0][4]).toBe(null); // 原盤不變（immutable）
  });
});

describe('clearLines', () => {
  it('清掉填滿的列、上方下移、回傳被清列索引', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) b[last][x] = 'I'; // 填滿最底列
    b[last - 1][0] = 'T'; // 上方留一格

    const { board: cleared, rows } = clearLines(b);
    expect(rows).toEqual([last]);
    expect(cleared[last][0]).toBe('T'); // 原本上方那格掉到最底
    expect(cleared[last].slice(1).every((c) => c === null)).toBe(true);
  });

  it('沒有滿列時回傳空陣列且盤面不變', () => {
    const b = createBoard();
    b[TOTAL_HEIGHT - 1][0] = 'I';
    const { rows } = clearLines(b);
    expect(rows).toEqual([]);
  });

  it('一次清除多列', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      b[last][x] = 'I';
      b[last - 1][x] = 'I';
    }
    const { rows } = clearLines(b);
    expect(rows.sort((a, c) => a - c)).toEqual([last - 1, last]);
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/board.test.ts`
Expected: FAIL（`lockPiece is not a function`）

- [ ] **Step 3：實作 lockPiece + clearLines**

Append to `src/scripts/games/tetris/engine/board.ts`:

```ts
/** 把方塊鎖進盤面，回傳新盤面（不修改輸入） */
export function lockPiece(board: Matrix, piece: ActivePiece): Matrix {
  const next = board.map((row) => [...row]);
  for (const { x, y } of getCells(piece)) {
    if (y >= 0 && y < TOTAL_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
      next[y][x] = piece.type;
    }
  }
  return next;
}

/** 消除填滿的列，上方往下補，回傳新盤面與被清列索引 */
export function clearLines(board: Matrix): { board: Matrix; rows: number[] } {
  const rows: number[] = [];
  for (let y = 0; y < TOTAL_HEIGHT; y++) {
    if (board[y].every((c) => c !== null)) rows.push(y);
  }
  if (rows.length === 0) return { board, rows };

  const kept = board.filter((_, y) => !rows.includes(y));
  const empty: Matrix = Array.from({ length: rows.length }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null),
  );
  return { board: [...empty, ...kept], rows };
}
```

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/board.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/board.ts src/scripts/games/tetris/engine/board.test.ts
git commit -m "feat(tetris): add piece locking and line clearing"
```

---

## Task 8：插入垃圾行（board.ts — insertGarbage）

對戰用（Phase 3 會呼叫），但屬盤面操作，先在此實作並測試。

**Files:**
- Modify: `src/scripts/games/tetris/engine/board.ts`
- Modify: `src/scripts/games/tetris/engine/board.test.ts`

- [ ] **Step 1：追加失敗測試**

Append to `src/scripts/games/tetris/engine/board.test.ts`:

```ts
import { insertGarbage } from './board';

describe('insertGarbage', () => {
  it('從底部插入 n 列垃圾、原內容上移、垃圾列含一個洞', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    b[last][3] = 'T'; // 底部放一格做位移標記

    const next = insertGarbage(b, 2, 4); // 插 2 列、洞在第 4 欄
    // 原底列內容被往上推 2 列
    expect(next[last - 2][3]).toBe('T');
    // 新底 2 列為垃圾，洞欄為 null、其餘為 'G'
    for (const y of [last, last - 1]) {
      expect(next[y][4]).toBe(null);
      expect(next[y][0]).toBe('G');
      expect(next[y].filter((c) => c === 'G')).toHaveLength(BOARD_WIDTH - 1);
    }
  });

  it('插入 0 列時盤面不變', () => {
    const b = createBoard();
    b[TOTAL_HEIGHT - 1][0] = 'I';
    const next = insertGarbage(b, 0, 2);
    expect(next[TOTAL_HEIGHT - 1][0]).toBe('I');
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/board.test.ts`
Expected: FAIL（`insertGarbage is not a function`）

- [ ] **Step 3：實作 insertGarbage**

Append to `src/scripts/games/tetris/engine/board.ts`:

```ts
/** 從盤面底部插入 count 列垃圾行（每列在 holeCol 處留一個洞），原內容上移。 */
export function insertGarbage(board: Matrix, count: number, holeCol: number): Matrix {
  if (count <= 0) return board;
  const garbageRows: Matrix = Array.from({ length: count }, () =>
    Array.from({ length: BOARD_WIDTH }, (_, x) => (x === holeCol ? null : 'G')),
  );
  // 去掉最上面 count 列（被擠出），其餘保留，再接上底部垃圾
  const kept = board.slice(count);
  return [...kept, ...garbageRows];
}
```

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/board.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/board.ts src/scripts/games/tetris/engine/board.test.ts
git commit -m "feat(tetris): add garbage row insertion"
```

---

## Task 9：計分、Combo、B2B、T-spin（scoring.ts）

**Files:**
- Create: `src/scripts/games/tetris/engine/scoring.ts`
- Test: `src/scripts/games/tetris/engine/scoring.test.ts`

`detectTSpin` 採用 3-corner 規則：T 方塊、且最後一步是旋轉時，檢查 T 的中心對角四角中被佔（或出界）的數量；≥3 為 T-spin，否則 none；面向側兩角皆滿為 full、否則 mini。

- [ ] **Step 1：寫失敗測試**

Create `src/scripts/games/tetris/engine/scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreClear, detectTSpin } from './scoring';
import { createBoard } from './board';
import { TOTAL_HEIGHT, BOARD_WIDTH } from './constants';
import type { ActivePiece } from './types';

describe('scoreClear', () => {
  it('一般消行：single/double/triple/tetris × 等級', () => {
    expect(scoreClear({ count: 1, tSpin: 'none', level: 1, b2b: false })).toBe(100);
    expect(scoreClear({ count: 2, tSpin: 'none', level: 1, b2b: false })).toBe(300);
    expect(scoreClear({ count: 3, tSpin: 'none', level: 2, b2b: false })).toBe(1000); // 500*2
    expect(scoreClear({ count: 4, tSpin: 'none', level: 1, b2b: false })).toBe(800);
  });

  it('T-spin full single/double 計分', () => {
    expect(scoreClear({ count: 1, tSpin: 'full', level: 1, b2b: false })).toBe(800);
    expect(scoreClear({ count: 2, tSpin: 'full', level: 1, b2b: false })).toBe(1200);
  });

  it('back-to-back 套用 1.5 倍（無條件捨去）', () => {
    // tetris 800 ×1.5 = 1200
    expect(scoreClear({ count: 4, tSpin: 'none', level: 1, b2b: true })).toBe(1200);
  });

  it('0 行（落地未消）得 0 分', () => {
    expect(scoreClear({ count: 0, tSpin: 'none', level: 5, b2b: false })).toBe(0);
  });
});

describe('detectTSpin', () => {
  it('非 T 方塊一律 none', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'L', rotation: 0, x: 3, y: TOTAL_HEIGHT - 2 };
    expect(detectTSpin(b, p, true)).toBe('none');
  });

  it('最後一步非旋轉時為 none', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: TOTAL_HEIGHT - 2 };
    expect(detectTSpin(b, p, false)).toBe('none');
  });

  it('四角有 3 個被佔/出界 → 至少 mini 或 full（非 none）', () => {
    const b = createBoard();
    // 把 T 放在左邊：左兩角靠左牆出界(各算1)，右下角放一格 → 共 3 角
    const p: ActivePiece = { type: 'T', rotation: 2, x: -1, y: TOTAL_HEIGHT - 3 };
    // 四角檢查點為 x∈{-1,1}, y∈{H-3,H-1}；右下角 (1, H-1) 放一格湊到第 3 角
    b[TOTAL_HEIGHT - 1][1] = 'I';
    const result = detectTSpin(b, p, true);
    expect(result).not.toBe('none');
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/scoring.test.ts`
Expected: FAIL（`Cannot find module './scoring'`）

- [ ] **Step 3：實作 scoring.ts**

Create `src/scripts/games/tetris/engine/scoring.ts`:

```ts
import type { ActivePiece, Matrix, TSpinType } from './types';
import { BOARD_WIDTH, TOTAL_HEIGHT, LINE_SCORES, TSPIN_SCORES, B2B_MULTIPLIER, COMBO_BASE } from './constants';

export interface ClearScoreInput {
  count: number;       // 消除行數 0..4
  tSpin: TSpinType;    // none / mini / full
  level: number;       // 當前等級（≥1）
  b2b: boolean;        // 本次是否觸發 back-to-back 加成
}

/** 計算單次落地的得分（不含 combo；combo 由 game.ts 另計） */
export function scoreClear({ count, tSpin, level, b2b }: ClearScoreInput): number {
  let base: number;
  if (tSpin === 'full') base = TSPIN_SCORES.full[count] ?? 0;
  else if (tSpin === 'mini') base = TSPIN_SCORES.mini[Math.min(count, 2)] ?? 0;
  else base = LINE_SCORES[count] ?? 0;

  let total = base * level;
  if (b2b && (count === 4 || tSpin !== 'none')) total = Math.floor(total * B2B_MULTIPLIER);
  return total;
}

/** combo 加分：COMBO_BASE × combo × level（combo<=0 不加） */
export function scoreCombo(combo: number, level: number): number {
  return combo > 0 ? COMBO_BASE * combo * level : 0;
}

/** 該次消行是否屬於「困難消除」（用於 back-to-back 判定） */
export function isDifficultClear(count: number, tSpin: TSpinType): boolean {
  return count === 4 || tSpin !== 'none';
}

const CORNERS = [
  { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 },
];

function occupied(board: Matrix, x: number, y: number): boolean {
  if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= TOTAL_HEIGHT) return true; // 出界視為佔據
  return board[y][x] !== null;
}

/**
 * 3-corner T-spin 偵測。需：方塊為 T 且最後一步為旋轉。
 * 中心位於 box 的 (1,1)。四角佔據數 ≥3 為 T-spin。
 * （簡化：≥3 角即判 full；本階段不細分 mini/full 的面向規則，Phase 後續可細化。）
 */
export function detectTSpin(board: Matrix, piece: ActivePiece, lastMoveWasRotation: boolean): TSpinType {
  if (piece.type !== 'T' || !lastMoveWasRotation) return 'none';
  let filled = 0;
  for (const c of CORNERS) {
    if (occupied(board, piece.x + c.x, piece.y + c.y)) filled++;
  }
  return filled >= 3 ? 'full' : 'none';
}
```

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/scoring.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/scoring.ts src/scripts/games/tetris/engine/scoring.test.ts
git commit -m "feat(tetris): add scoring, combo, back-to-back and T-spin detection"
```

---

## Task 10：單人狀態機（game.ts — 建立、spawn、移動/旋轉）

**Files:**
- Create: `src/scripts/games/tetris/engine/game.ts`
- Test: `src/scripts/games/tetris/engine/game.test.ts`

- [ ] **Step 1：寫失敗測試**

Create `src/scripts/games/tetris/engine/game.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TetrisGame } from './game';

describe('TetrisGame 初始化', () => {
  it('開局有 active 方塊、next 佇列、status=playing', () => {
    const g = new TetrisGame({ seed: 1 });
    const s = g.getState();
    expect(s.active).not.toBeNull();
    expect(s.next.length).toBeGreaterThanOrEqual(5);
    expect(s.status).toBe('playing');
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
    expect(s.combo).toBe(-1);
  });

  it('同 seed 兩局 active/next 完全相同', () => {
    const a = new TetrisGame({ seed: 7 }).getState();
    const b = new TetrisGame({ seed: 7 }).getState();
    expect(a.active!.type).toBe(b.active!.type);
    expect(a.next).toEqual(b.next);
  });
});

describe('TetrisGame 移動與旋轉', () => {
  it('left/right 改變 active.x', () => {
    const g = new TetrisGame({ seed: 1 });
    const x0 = g.getState().active!.x;
    g.input('left');
    expect(g.getState().active!.x).toBe(x0 - 1);
    g.input('right');
    g.input('right');
    expect(g.getState().active!.x).toBe(x0 + 1);
  });

  it('rotateCW 改變 rotation', () => {
    const g = new TetrisGame({ seed: 1 });
    const r0 = g.getState().active!.rotation;
    g.input('rotateCW');
    expect(g.getState().active!.rotation).toBe((r0 + 1) % 4);
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/game.test.ts`
Expected: FAIL（`Cannot find module './game'`）

- [ ] **Step 3：實作 game.ts（建構、spawn、move、rotate、getState、drainEvents）**

Create `src/scripts/games/tetris/engine/game.ts`:

```ts
import type { ActivePiece, GameEvent, GameState, PieceType } from './types';
import { createBag, type Bag } from './bag';
import { spawnPiece, tryRotate, type PlaceTest } from './piece';
import { canPlace, createBoard, lockPiece, clearLines, insertGarbage } from './board';
import { detectTSpin, scoreClear, scoreCombo, isDifficultClear } from './scoring';
import {
  NEXT_QUEUE_SIZE, GRAVITY_MS, LOCK_DELAY_MS, LOCK_RESET_LIMIT,
  LINES_PER_LEVEL, SOFT_DROP_POINTS, HARD_DROP_POINTS, BOARD_WIDTH,
} from './constants';
import type { Matrix } from './types';

export type InputAction =
  | 'left' | 'right' | 'rotateCW' | 'rotateCCW' | 'softDrop' | 'hardDrop' | 'hold';

export interface GameOptions { seed?: number; startLevel?: number; }

export class TetrisGame {
  private board: Matrix = createBoard();
  private bag: Bag;
  private active: ActivePiece | null = null;
  private holdType: PieceType | null = null;
  private canHoldNow = true;
  private score = 0;
  private lines = 0;
  private level: number;
  private combo = -1;
  private backToBack = false;
  private status: 'playing' | 'topout' = 'playing';
  private lastMoveWasRotation = false;

  // 計時
  private gravityAcc = 0;
  private lockTimer = 0;
  private locking = false;
  private lockResets = 0;

  private events: GameEvent[] = [];

  constructor(opts: GameOptions = {}) {
    this.bag = createBag(opts.seed ?? 1);
    this.level = opts.startLevel ?? 1;
    this.spawn();
  }

  private placeTest: PlaceTest = (cand) => canPlace(this.board, cand);

  private spawn(): void {
    const type = this.bag.next();
    const piece = spawnPiece(type);
    if (!canPlace(this.board, piece)) {
      this.active = null;
      this.status = 'topout';
      this.events.push({ kind: 'topout' });
      return;
    }
    this.active = piece;
    this.canHoldNow = true;
    this.lastMoveWasRotation = false;
    this.locking = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.events.push({ kind: 'spawn', type });
  }

  private tryMove(dx: number, dy: number): boolean {
    if (!this.active) return false;
    const cand: ActivePiece = { ...this.active, x: this.active.x + dx, y: this.active.y + dy };
    if (canPlace(this.board, cand)) {
      this.active = cand;
      this.lastMoveWasRotation = false;
      this.onSuccessfulShift();
      return true;
    }
    return false;
  }

  /** 移動/旋轉成功後，若處於 lock delay 中且未超過 reset 上限，重置 lock 計時 */
  private onSuccessfulShift(): void {
    if (this.locking && this.lockResets < LOCK_RESET_LIMIT) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  input(action: InputAction): void {
    if (this.status !== 'playing' || !this.active) return;
    switch (action) {
      case 'left': this.tryMove(-1, 0); break;
      case 'right': this.tryMove(1, 0); break;
      case 'softDrop':
        if (this.tryMove(0, 1)) this.score += SOFT_DROP_POINTS;
        break;
      case 'rotateCW': this.rotate(1); break;
      case 'rotateCCW': this.rotate(-1); break;
      case 'hardDrop': this.hardDrop(); break;
      case 'hold': this.hold(); break;
    }
  }

  private rotate(dir: 1 | -1): void {
    if (!this.active) return;
    const result = tryRotate(this.active, dir, this.placeTest);
    if (result) {
      this.active = result;
      this.lastMoveWasRotation = true;
      this.onSuccessfulShift();
    }
  }

  getState(): GameState {
    return {
      board: this.board.map((r) => [...r]),
      active: this.active ? { ...this.active } : null,
      hold: this.holdType,
      canHold: this.canHoldNow,
      next: this.bag.peek(NEXT_QUEUE_SIZE),
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: this.combo,
      backToBack: this.backToBack,
      status: this.status,
    };
  }

  /** 取出並清空累積事件 */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // hardDrop / hold / step / lock 於後續 Task 實作
  private hardDrop(): void { /* Task 11 */ }
  private hold(): void { /* Task 12 */ }
}
```

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/game.test.ts`
Expected: PASS（4 個測試通過）

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/game.ts src/scripts/games/tetris/engine/game.test.ts
git commit -m "feat(tetris): add game state machine core (spawn, move, rotate)"
```

---

## Task 11：硬降、鎖定、消行結算（game.ts — hardDrop / lockAndResolve）

**Files:**
- Modify: `src/scripts/games/tetris/engine/game.ts`
- Modify: `src/scripts/games/tetris/engine/game.test.ts`

- [ ] **Step 1：追加失敗測試**

Append to `src/scripts/games/tetris/engine/game.test.ts`:

```ts
describe('TetrisGame 硬降與消行', () => {
  it('hardDrop 後鎖定並 spawn 新方塊（active 換人、發出 lock 事件）', () => {
    const g = new TetrisGame({ seed: 1 });
    g.drainEvents();
    g.input('hardDrop');
    const kinds = g.drainEvents().map((e) => e.kind);
    expect(kinds).toContain('lock');
    expect(kinds).toContain('spawn');
    expect(g.getState().active).not.toBeNull();
  });

  it('填滿一整列後 hardDrop 觸發 lineClear、lines 增加、分數上升', () => {
    const g = new TetrisGame({ seed: 1 });
    // 直接灌入「只差一格就填滿的最底列」來驗證消行管線
    g.debugFillRowExceptOneAndDrop();
    const s = g.getState();
    expect(s.lines).toBeGreaterThanOrEqual(1);
    expect(s.score).toBeGreaterThan(0);
  });

  it('hardDrop 得分 = 下落格數 × HARD_DROP_POINTS（至少 >0）', () => {
    const g = new TetrisGame({ seed: 1 });
    g.input('hardDrop');
    expect(g.getState().score).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/game.test.ts`
Expected: FAIL（`debugFillRowExceptOneAndDrop is not a function` 等）

- [ ] **Step 3：實作 hardDrop / lockAndResolve（並加測試輔助）**

在 `game.ts` 中，將 `private hardDrop()` 佔位實作替換為以下內容，並新增 `lockAndResolve`、`ghostDropDistance` 與測試輔助方法：

```ts
  private ghostDropDistance(): number {
    if (!this.active) return 0;
    let dist = 0;
    while (canPlace(this.board, { ...this.active, y: this.active.y + dist + 1 })) dist++;
    return dist;
  }

  private hardDrop(): void {
    if (!this.active) return;
    const dist = this.ghostDropDistance();
    this.active = { ...this.active, y: this.active.y + dist };
    this.score += dist * HARD_DROP_POINTS;
    this.lockAndResolve();
  }

  private lockAndResolve(): void {
    if (!this.active) return;
    const piece = this.active;
    const tSpin = detectTSpin(this.board, piece, this.lastMoveWasRotation);
    this.board = lockPiece(this.board, piece);
    this.events.push({ kind: 'lock' });

    const { board: cleared, rows } = clearLines(this.board);
    this.board = cleared;
    const count = rows.length;

    if (count > 0) {
      this.combo += 1;
      const difficult = isDifficultClear(count, tSpin);
      const applyB2B = difficult && this.backToBack;
      this.score += scoreClear({ count, tSpin, level: this.level, b2b: applyB2B });
      this.score += scoreCombo(this.combo, this.level);
      this.lines += count;
      this.level = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
      this.backToBack = difficult;
      this.events.push({ kind: 'lineClear', rows, count, tSpin, b2b: applyB2B, combo: this.combo });
    } else {
      this.combo = -1;
    }

    this.active = null;
    this.spawn();
  }

  /** 測試輔助：填滿最底列只留 1 欄，放一個能填那欄的方塊並硬降。 */
  debugFillRowExceptOneAndDrop(): void {
    const lastY = this.board.length - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) this.board[lastY][x] = 'G';
    this.board[lastY][0] = null; // 留第 0 欄
    this.board[lastY - 1][0] = null;
    this.board[lastY - 2][0] = null;
    this.board[lastY - 3][0] = null;
    // 用 I 方塊直立填第 0 欄
    this.active = { type: 'I', rotation: 1, x: -2, y: lastY - 3 };
    // I R1 的 cell 在 box x=2 那一直行；x=-2 → 絕對 x=0
    this.hardDrop();
  }
```

> 註：`debugFillRowExceptOneAndDrop` 僅供測試，命名以 `debug` 前綴標示；保留於正式碼可協助 Phase 3 對戰除錯。

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/game.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/game.ts src/scripts/games/tetris/engine/game.test.ts
git commit -m "feat(tetris): add hard drop, lock resolution, line-clear scoring pipeline"
```

---

## Task 12：Hold 與重力/Lock Delay（game.ts — hold / step）

**Files:**
- Modify: `src/scripts/games/tetris/engine/game.ts`
- Modify: `src/scripts/games/tetris/engine/game.test.ts`

- [ ] **Step 1：追加失敗測試**

Append to `src/scripts/games/tetris/engine/game.test.ts`:

```ts
describe('TetrisGame hold', () => {
  it('首次 hold 把 active 收進 hold、換成新方塊、且本回合不能再 hold', () => {
    const g = new TetrisGame({ seed: 1 });
    const before = g.getState().active!.type;
    g.input('hold');
    const s = g.getState();
    expect(s.hold).toBe(before);
    expect(s.canHold).toBe(false);
    g.input('hold'); // 第二次應被忽略
    expect(g.getState().hold).toBe(before);
  });

  it('鎖定後可再次 hold（canHold 重置）', () => {
    const g = new TetrisGame({ seed: 1 });
    g.input('hold');
    g.input('hardDrop');
    expect(g.getState().canHold).toBe(true);
  });
});

describe('TetrisGame step 重力', () => {
  it('累積足夠時間後 active 下落一格', () => {
    const g = new TetrisGame({ seed: 1 });
    const y0 = g.getState().active!.y;
    g.step(2000); // 遠大於第 1 級重力間隔
    expect(g.getState().active!.y).toBeGreaterThan(y0);
  });

  it('落地後持續 step 超過 lock delay 會鎖定並換方塊', () => {
    const g = new TetrisGame({ seed: 1 });
    // 先硬性把方塊推到底
    for (let i = 0; i < 25; i++) g.step(2000);
    g.drainEvents();
    for (let i = 0; i < 5; i++) g.step(2000);
    expect(g.drainEvents().some((e) => e.kind === 'lock')).toBe(true);
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/game.test.ts`
Expected: FAIL（`g.step is not a function`、hold 佔位無效果）

- [ ] **Step 3：實作 hold 與 step**

將 `game.ts` 的 `private hold()` 佔位實作替換為下列內容，並新增 `step` 與重力/鎖定處理：

```ts
  private hold(): void {
    if (!this.active || !this.canHoldNow) return;
    const current = this.active.type;
    this.events.push({ kind: 'hold' });
    if (this.holdType === null) {
      this.holdType = current;
      this.active = null;
      this.spawn();              // spawn() 會把 canHoldNow 設回 true…
    } else {
      const swap = this.holdType;
      this.holdType = current;
      this.active = spawnPiece(swap);
      this.lastMoveWasRotation = false;
      this.locking = false;
      this.lockTimer = 0;
      this.lockResets = 0;
    }
    this.canHoldNow = false;     // …因此務必在 spawn 之後再鎖定 hold
  }

  /** 前進 dtMs 毫秒：處理重力下落與 lock delay。 */
  step(dtMs: number): void {
    if (this.status !== 'playing' || !this.active) return;
    const interval = GRAVITY_MS[Math.min(this.level - 1, GRAVITY_MS.length - 1)];

    this.gravityAcc += dtMs;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (canPlace(this.board, { ...this.active, y: this.active.y + 1 })) {
        this.active = { ...this.active, y: this.active.y + 1 };
        this.lastMoveWasRotation = false;
        this.locking = false;
        this.lockTimer = 0;
      } else {
        this.locking = true;
        break;
      }
    }

    if (this.locking) {
      this.lockTimer += dtMs;
      if (this.lockTimer >= LOCK_DELAY_MS) {
        this.lockAndResolve();
      }
    }
  }
```

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/game.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/game.ts src/scripts/games/tetris/engine/game.test.ts
git commit -m "feat(tetris): add hold mechanic and gravity/lock-delay stepping"
```

---

## Task 13：頂出與外部垃圾注入 API（game.ts — receiveGarbage / topout）

對戰（Phase 3）需要對 game 注入垃圾並讀取頂出。先補上 API 與測試。

**Files:**
- Modify: `src/scripts/games/tetris/engine/game.ts`
- Modify: `src/scripts/games/tetris/engine/game.test.ts`

- [ ] **Step 1：追加失敗測試**

Append to `src/scripts/games/tetris/engine/game.test.ts`:

```ts
describe('TetrisGame 垃圾與頂出', () => {
  it('receiveGarbage 從底部加入垃圾列', () => {
    const g = new TetrisGame({ seed: 1 });
    g.receiveGarbage(3, 4);
    const board = g.getState().board;
    const lastY = board.length - 1;
    expect(board[lastY].filter((c) => c === 'G').length).toBe(9);
    expect(board[lastY][4]).toBe(null); // 洞
  });

  it('堆到頂時 spawn 失敗 → status=topout、發出 topout 事件', () => {
    const g = new TetrisGame({ seed: 1 });
    // 注入大量垃圾把盤面塞滿到頂
    for (let i = 0; i < 25; i++) g.receiveGarbage(1, 0);
    g.input('hardDrop'); // 觸發下一次 spawn
    expect(g.getState().status).toBe('topout');
  });
});
```

- [ ] **Step 2：執行測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/engine/game.test.ts`
Expected: FAIL（`g.receiveGarbage is not a function`）

- [ ] **Step 3：實作 receiveGarbage**

Append 至 `game.ts` 的 `TetrisGame` class（在 class 內新增方法）：

```ts
  /** 外部（對戰）注入垃圾行：底部加 count 列、holeCol 留洞。 */
  receiveGarbage(count: number, holeCol: number): void {
    this.board = insertGarbage(this.board, count, holeCol);
    // 若活動方塊因上推而與既有格重疊，嘗試上移修正
    if (this.active && !canPlace(this.board, this.active)) {
      for (let dy = 1; dy <= count; dy++) {
        const lifted = { ...this.active, y: this.active.y - dy };
        if (canPlace(this.board, lifted)) { this.active = lifted; break; }
      }
    }
  }
```

- [ ] **Step 4：執行測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/engine/game.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/scripts/games/tetris/engine/game.ts src/scripts/games/tetris/engine/game.test.ts
git commit -m "feat(tetris): add external garbage injection API for battle mode"
```

---

## Task 14：全套引擎測試綠燈 + 型別檢查

**Files:** 無新檔，驗證整體。

- [ ] **Step 1：跑整個 tetris 引擎測試**

Run: `npx vitest run src/scripts/games/tetris/`
Expected: 全部 PASS（constants/rng/bag/piece/board/scoring/game）

- [ ] **Step 2：TypeScript 型別檢查（無 emit）**

Run: `npx tsc --noEmit`
Expected: 無錯誤（若既有專案已有無關錯誤，至少不得新增 tetris 相關錯誤）

- [ ] **Step 3：（可選）覆蓋率檢視**

Run: `npx vitest run --coverage src/scripts/games/tetris/`
Expected: engine 各模組覆蓋率高（目標主要邏輯分支覆蓋）

- [ ] **Step 4：Commit（若有微調）**

```bash
git add -A src/scripts/games/tetris/
git commit -m "test(tetris): verify full engine suite green and types clean"
```

---

## Self-Review（撰寫者自檢結果）

**Spec 覆蓋（§3.1 / §5）：**
- 10×20(+2 buffer) 盤面、7-bag、SRS+kick、Hold、硬/軟降、lock delay、計分(含 T-spin/combo/B2B)、頂出 → Task 1–13 全覆蓋。
- Ghost：`ghostDropDistance()` 已於 Task 11 提供（渲染層 Phase 2 取用）。
- DAS/ARR：屬輸入層手感，歸 Phase 2（渲染/輸入），本階段引擎只接收離散 `input()`；spec §5 列為玩法，於此標註延後至 Phase 2 輸入層，非遺漏。
- 垃圾插入/接收：Task 8 + Task 13（attack 行數對應表屬 Phase 3 `attack.ts`）。

**Placeholder 掃描：** Task 10 的 `hardDrop`/`hold` 是「刻意佔位、下一個 Task 立即替換」並已明確標註替換位置，非殘留 TODO。其餘無 placeholder。

**型別一致性：** `PlaceTest`、`ActivePiece`、`GameEvent`、`InputAction`、`Bag`、`scoreClear` 參數物件等跨 Task 命名一致；`tryRotate(piece, dir, test)`、`canPlace(board, piece)`、`clearLines(board)→{board,rows}`、`insertGarbage(board,count,holeCol)`、`receiveGarbage(count,holeCol)` 簽章前後一致。

**已知後續相依（非本階段缺口）：** `attack.ts`（行數→垃圾對應、抵銷）與 `match.ts`（雙人協調）為 Phase 3；`ai/bot.ts` 為 Phase 4；Pixi 渲染與 DAS/ARR 輸入為 Phase 2。
