# Dungeon Arcade — Phase 4：AI 對手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。bot 評估/選點走 TDD（Vitest）；vs-AI 控制器與整合走 build + Playwright 煙霧（AI 無人輸入也會自己下棋）。

**Goal:** 加入電腦對手：一個啟發式 bot（評估盤面、枚舉落點選最佳），透過與玩家相同的 `game.input()` API 驅動對手側，重用 Phase 3 的 `match` 與雙盤渲染，做出 **vs AI 對戰**（難度 簡單/普通/困難）。

**Architecture:** `ai/bot.ts` 為純函式：以 El-Tetris 權重評估盤面（聚合高度/洞/崎嶇/消行），枚舉「每個旋轉 × 每個欄位」的直落落點、模擬鎖定+消行後評分、選最高分回傳目標 `{rotation, x}`。`ai/AiController.ts` watch 對手側 `game` 狀態，依難度的思考間隔，逐步發出 rotate/move/hardDrop 讓棋子走到目標（可見地移動），是「另一個輸入來源」。vs-AI 重用 `TetrisMatch`（A=人類、B=bot），複用 Phase 3 雙盤/計量條/攻擊光束/結算。

**Tech Stack:** TypeScript strict、Vitest、PixiJS v8、Playwright。重用 Phase 1–3 既有模組。

**Spec:** `docs/superpowers/specs/2026-06-03-dungeon-arcade-battle-tetris-design.md`（§3.2 AI、§8 Phase 4）

---

## 檔案結構（本階段）

```
src/scripts/games/tetris/
  ai/
    bot.ts            # 盤面評估 + 落點枚舉 + bestPlacement（純函式，TDD）
    bot.test.ts
    AiController.ts   # 依難度驅動某側 game：逐步走到 bestPlacement（build + 輕測）
    AiController.test.ts
  render/
    aiMain.ts         # vs-AI 進入點：TetrisMatch(A=人類, B=bot)，重用 Phase 3 渲染
src/pages/games/
  tetris.astro        # ?mode=ai 切換 vs-AI（?diff=easy|normal|hard）
tests/e2e/
  games-tetris-ai.spec.ts
```

---

## Task 1：盤面評估（bot.ts — evaluateBoard / scoreBoard）— TDD

**Files:** Create `ai/bot.ts` + `ai/bot.test.ts`

- [ ] **Step 1：寫失敗測試** `ai/bot.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { evaluateBoard, scoreBoard } from './bot';
import { createBoard } from '../engine/board';
import { BOARD_WIDTH, TOTAL_HEIGHT } from '../engine/constants';

describe('evaluateBoard', () => {
  it('空盤：高度/洞/崎嶇/消行皆 0', () => {
    const f = evaluateBoard(createBoard());
    expect(f).toEqual({ aggregateHeight: 0, holes: 0, bumpiness: 0, completeLines: 0 });
  });

  it('單欄疊兩格 → 高度2、崎嶇2（與相鄰兩側各差2，但只算相鄰對）', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    b[last][0] = 'I';
    b[last - 1][0] = 'I';
    const f = evaluateBoard(b);
    expect(f.aggregateHeight).toBe(2);
    // 欄0高2、欄1高0 → |2-0|=2；其餘相鄰皆0
    expect(f.bumpiness).toBe(2);
    expect(f.holes).toBe(0);
  });

  it('頂端有格、其下為空 → 算一個洞', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    b[last - 1][3] = 'I'; // 上方有方塊
    // (last,3) 為空 → 洞 1
    expect(evaluateBoard(b).holes).toBe(1);
  });

  it('填滿底列 → completeLines 1', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) b[last][x] = 'I';
    expect(evaluateBoard(b).completeLines).toBe(1);
  });
});

describe('scoreBoard', () => {
  it('消行越多分越高', () => {
    const b = createBoard();
    expect(scoreBoard(b, 4)).toBeGreaterThan(scoreBoard(b, 0));
  });
  it('有洞分數較低', () => {
    const flat = createBoard();
    const holed = createBoard();
    const last = TOTAL_HEIGHT - 1;
    holed[last - 1][3] = 'I'; // 製造一個洞 + 高度
    expect(scoreBoard(holed, 0)).toBeLessThan(scoreBoard(flat, 0));
  });
});
```

- [ ] **Step 2：執行確認失敗** `npx vitest run src/scripts/games/tetris/ai/bot.test.ts` → FAIL
- [ ] **Step 3：實作 `ai/bot.ts`（評估部分）**

```ts
import type { Matrix } from '../engine/types';
import { BOARD_WIDTH, TOTAL_HEIGHT } from '../engine/constants';

export interface BoardFeatures {
  aggregateHeight: number;
  holes: number;
  bumpiness: number;
  completeLines: number;
}

// El-Tetris 權重
const W_HEIGHT = -0.510066;
const W_LINES = 0.760666;
const W_HOLES = -0.35663;
const W_BUMP = -0.184483;

/** 每欄高度（TOTAL_HEIGHT - 最高填滿列索引；空欄=0）。 */
function columnHeights(board: Matrix): number[] {
  const heights = new Array(BOARD_WIDTH).fill(0);
  for (let x = 0; x < BOARD_WIDTH; x++) {
    for (let y = 0; y < TOTAL_HEIGHT; y++) {
      if (board[y][x] !== null) {
        heights[x] = TOTAL_HEIGHT - y;
        break;
      }
    }
  }
  return heights;
}

export function evaluateBoard(board: Matrix): BoardFeatures {
  const heights = columnHeights(board);
  const aggregateHeight = heights.reduce((a, h) => a + h, 0);

  let bumpiness = 0;
  for (let x = 0; x < BOARD_WIDTH - 1; x++) bumpiness += Math.abs(heights[x] - heights[x + 1]);

  let holes = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    const top = TOTAL_HEIGHT - heights[x];
    for (let y = top + 1; y < TOTAL_HEIGHT; y++) {
      if (board[y][x] === null) holes++;
    }
  }

  let completeLines = 0;
  for (let y = 0; y < TOTAL_HEIGHT; y++) {
    if (board[y].every((c) => c !== null)) completeLines++;
  }

  return { aggregateHeight, holes, bumpiness, completeLines };
}

/** 盤面評分（lines 為本次落子消除的行數，分開傳入）。越高越好。 */
export function scoreBoard(board: Matrix, lines: number): number {
  const f = evaluateBoard(board);
  return W_LINES * lines + W_HEIGHT * f.aggregateHeight + W_HOLES * f.holes + W_BUMP * f.bumpiness;
}
```

- [ ] **Step 4：執行確認通過** → PASS
- [ ] **Step 5：Commit**（bot.ts + bot.test.ts，訊息附 `Co-Authored-By: Claude <noreply@anthropic.com>`）
  `feat(tetris): add AI board evaluation (El-Tetris features + score)`

---

## Task 2：落點枚舉與選點（bot.ts — dropPlacement / bestPlacement）— TDD

**Files:** Modify `ai/bot.ts` + `ai/bot.test.ts`

- [ ] **Step 1：追加失敗測試** `ai/bot.test.ts`

```ts
import { dropPlacement, bestPlacement } from './bot';
import { canPlace } from '../engine/board';
import { getCells, spawnPiece } from '../engine/piece';
import type { PieceType } from '../engine/types';

describe('dropPlacement', () => {
  it('在空盤直落 O 到底，回傳鎖定後盤面與 0 消行', () => {
    const res = dropPlacement(createBoard(), 'O', 0, 4);
    expect(res).not.toBeNull();
    expect(res!.lines).toBe(0);
    // O 落到最底兩列
    expect(res!.board[TOTAL_HEIGHT - 1][4]).toBe('O');
    expect(res!.board[TOTAL_HEIGHT - 1][5]).toBe('O');
  });
  it('越界的 x 回傳 null', () => {
    expect(dropPlacement(createBoard(), 'O', 0, -5)).toBeNull();
    expect(dropPlacement(createBoard(), 'O', 0, BOARD_WIDTH)).toBeNull();
  });
});

describe('bestPlacement', () => {
  it('對每種方塊在空盤都回傳一個合法落點', () => {
    const types: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    for (const t of types) {
      const p = bestPlacement(createBoard(), t);
      expect(p).not.toBeNull();
      // 該落點以 spawn 旋轉/欄位放在頂端應可放
      expect(canPlace(createBoard(), { type: t, rotation: p!.rotation, x: p!.x, y: 0 })).toBe(true);
    }
  });

  it('能消行時會選擇消行的落點', () => {
    // 底列只缺第 0 欄；直立 I 落在第 0 欄可消 1 行
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    for (let x = 1; x < BOARD_WIDTH; x++) b[last][x] = 'G';
    const p = bestPlacement(b, 'I');
    expect(p).not.toBeNull();
    const res = dropPlacement(b, 'I', p!.rotation, p!.x);
    expect(res!.lines).toBeGreaterThanOrEqual(1);
  });

  it('同盤面同方塊回傳相同落點（確定性）', () => {
    const b = createBoard();
    expect(bestPlacement(b, 'T')).toEqual(bestPlacement(b, 'T'));
  });
});
```

- [ ] **Step 2：執行確認失敗** → FAIL
- [ ] **Step 3：實作 dropPlacement + bestPlacement（append 到 bot.ts）**

```ts
import type { ActivePiece, PieceType, Rotation } from '../engine/types';
import { canPlace, lockPiece, clearLines } from '../engine/board';

export interface Placement { rotation: Rotation; x: number; }

/** 把 (type,rotation,x) 從頂端直落到底、鎖定、消行。無法放置回傳 null。 */
export function dropPlacement(
  board: Matrix,
  type: PieceType,
  rotation: Rotation,
  x: number,
): { board: Matrix; lines: number } | null {
  let piece: ActivePiece = { type, rotation, x, y: 0 };
  if (!canPlace(board, piece)) return null;
  while (canPlace(board, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
  const locked = lockPiece(board, piece);
  const { board: cleared, rows } = clearLines(locked);
  return { board: cleared, lines: rows.length };
}

/** 枚舉所有旋轉 × 欄位的直落落點，選評分最高者。確定性 tie-break（先 rotation、後 x）。 */
export function bestPlacement(board: Matrix, type: PieceType): Placement | null {
  let best: Placement | null = null;
  let bestScore = -Infinity;
  for (let rotation = 0 as Rotation; rotation < 4; rotation = (rotation + 1) as Rotation) {
    for (let x = -2; x <= BOARD_WIDTH; x++) {
      const res = dropPlacement(board, type, rotation, x);
      if (!res) continue;
      const score = scoreBoard(res.board, res.lines);
      if (score > bestScore) {
        bestScore = score;
        best = { rotation, x };
      }
    }
  }
  return best;
}
```

> 註：O 方塊四個旋轉形狀相同，枚舉重複但 tie-break 取最先（rotation 0），確定性不受影響。`spawnPiece` import 僅測試用。

- [ ] **Step 4：執行確認通過** → PASS
- [ ] **Step 5：Commit** `feat(tetris): add AI placement enumeration and bestPlacement`

---

## Task 3：AI 驅動控制器（AiController.ts）— build + 輕測

**Files:** Create `ai/AiController.ts` + `ai/AiController.test.ts`

`AiController` 不直接碰渲染：給它一個「下指令的函式」與「讀盤面狀態的函式」，它按難度的思考間隔逐步把當前方塊走到 `bestPlacement`。

- [ ] **Step 1：寫測試** `ai/AiController.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { TetrisGame } from '../engine/game';
import { AiController } from './AiController';

describe('AiController', () => {
  it('在足夠時間內會讓對手盤面落子（自己會下棋）', () => {
    const g = new TetrisGame({ seed: 1 });
    const ai = new AiController((a) => g.input(a), () => g.getState(), 'normal');
    // 推進數秒，AI 應已鎖定至少一塊（盤面出現非空格）
    for (let i = 0; i < 400; i++) { ai.update(16); g.step(16); }
    expect(g.getState().board.flat().filter((c) => c).length).toBeGreaterThan(0);
  });

  it('困難比簡單思考更快（間隔更短）', () => {
    const fast = new AiController(() => {}, () => new TetrisGame({ seed: 1 }).getState(), 'hard');
    const slow = new AiController(() => {}, () => new TetrisGame({ seed: 1 }).getState(), 'easy');
    expect((fast as unknown as { intervalMs: number }).intervalMs)
      .toBeLessThan((slow as unknown as { intervalMs: number }).intervalMs);
  });
});
```

- [ ] **Step 2：執行確認失敗** → FAIL
- [ ] **Step 3：實作 `ai/AiController.ts`**

```ts
import type { GameState } from '../engine/types';
import type { InputAction } from '../engine/game';
import { bestPlacement, type Placement } from './bot';

export type Difficulty = 'easy' | 'normal' | 'hard';

const INTERVALS: Record<Difficulty, number> = { easy: 420, normal: 200, hard: 80 };

/** 依難度的思考間隔，逐步把當前方塊走到 bestPlacement 目標。 */
export class AiController {
  private intervalMs: number;
  private acc = 0;
  private target: Placement | null = null;
  private targetPieceKey = '';

  constructor(
    private emit: (action: InputAction) => void,
    private getState: () => GameState,
    difficulty: Difficulty,
  ) {
    this.intervalMs = INTERVALS[difficulty];
  }

  /** 前進 dtMs；每隔 intervalMs 走一步（旋轉→平移→硬降）。 */
  update(dtMs: number): void {
    const s = this.getState();
    if (s.status !== 'playing' || !s.active) return;

    // 換了新方塊就重新規劃目標
    const key = `${s.active.type}@${s.next[0] ?? ''}:${s.board.length}`;
    if (this.target === null || key !== this.targetPieceKey) {
      this.target = bestPlacement(s.board, s.active.type);
      this.targetPieceKey = key;
    }

    this.acc += dtMs;
    if (this.acc < this.intervalMs) return;
    this.acc = 0;
    if (!this.target) { this.emit('hardDrop'); return; }

    const a = s.active;
    if (a.rotation !== this.target.rotation) this.emit('rotateCW');
    else if (a.x > this.target.x) this.emit('left');
    else if (a.x < this.target.x) this.emit('right');
    else { this.emit('hardDrop'); this.target = null; }
  }
}
```

> 註：以「換方塊」重規劃（`targetPieceKey` 含 active type、下一塊、盤面高度），落子後 `target=null` 觸發下一塊規劃。SRS 旋轉可能改變 x，故每步重讀 `s.active` 再決定 → 迭代收斂。難度差異於本階段先做思考間隔；最佳化/隨機性（簡單偶爾亂下）列為後續可加。

- [ ] **Step 4：執行確認通過** → PASS
- [ ] **Step 5：Commit** `feat(tetris): add AI controller that drives a side toward best placement`

---

## Task 4：vs-AI 進入點（aiMain.ts）— build + manual

**Files:** Create `render/aiMain.ts`（以 Phase 3 已移除的 hotseat `matchMain` 為結構參考重建：A=人類、B=bot）

- [ ] **Step 1：實作 `startAi(canvas, difficulty)`**：
  - 與 Phase 3 對戰渲染相同骨架：`PixiStage`、`computeMatchLayout`、兩組 `BoardView`/`HudView`（A 青=人類、B 洋紅=AI）、`GarbageMeter`、兩個 `Effects`、`SoundManager`、開場倒數、結算 banner（"YOU WIN" / "AI WINS" + R 重開）。
  - `TetrisMatch`；A 輸入＝`KEYMAP_1P` + 一個 `InputController`（人類）；B 輸入＝`new AiController((act)=>match.input('B', act), ()=>match.b.getState(), difficulty)`，每幀 `ai.update(dt)`。
  - 事件分派、攻擊光束、垃圾、KO 同 Phase 3。
  - debug hook：`window.__tetrisDebug = { get match(){...}, stage, ai }`。
- [ ] **Step 2：手動驗收**：開 vs-AI，AI 自己下棋、會消行、會送垃圾；人類可對打；KO 結算。
- [ ] **Step 3：Commit** `feat(tetris): add vs-AI battle entry reusing match render`

---

## Task 5：頁面模式切換（?mode=ai&diff=）— build

**Files:** Modify `src/pages/games/tetris.astro`

- [ ] **Step 1**：讀 `?mode=ai`（與可選 `?diff=easy|normal|hard`，預設 normal）→ import `startAi` 並啟動；否則維持單人 `startTetris`。更新操作提示（人類用 1P 鍵位 + 難度顯示）。
- [ ] **Step 2：手動驗收**：`/games/tetris?mode=ai&diff=hard` 可玩；單人 `/games/tetris` 不受影響。
- [ ] **Step 3：Commit** `feat(tetris): add vs-AI page mode and difficulty param`

---

## Task 6：Playwright vs-AI 煙霧 + 全套驗證

**Files:** Create `tests/e2e/games-tetris-ai.spec.ts`

- [ ] **Step 1：寫測試**（chromium-only）：載入 `?mode=ai`；等 `__tetrisDebug.match`；等開場結束；**不給任何輸入**，等待約 4 秒；斷言 **B（AI）盤面已出現鎖定格**（AI 自己下了棋）、match phase 仍合理（playing 或 result）。
- [ ] **Step 2：執行** `npx playwright test tests/e2e/games-tetris-ai.spec.ts --project=chromium` → PASS
- [ ] **Step 3：全套**：`npx vitest run src/scripts/games/tetris/` 全綠；`npx tsc --noEmit` 無新增 tetris 錯誤；單人 e2e 仍綠。
- [ ] **Step 4：Commit** `test(tetris): add vs-AI smoke e2e`

---

## Self-Review（撰寫者自檢）

**Spec 覆蓋（§3.2）：** 啟發式評估（高度/洞/崎嶇/消行 + El-Tetris 權重）T1；落點枚舉 + bestPlacement T2；難度（思考間隔）T3；vs-AI 對戰重用 match/雙盤渲染 T4-5；煙霧 T6。最佳化/1-塊預看/隨機性為後續強化，非本階段缺口（已註明）。

**Placeholder 掃描：** 無 TODO；T2 的 `spawnPiece` import 僅測試使用，已註明。

**型別一致性：** `BoardFeatures`、`scoreBoard(board, lines)`、`dropPlacement(board,type,rotation,x)`、`Placement{rotation,x}`、`bestPlacement(board,type)`、`AiController(emit, getState, difficulty)`、`Difficulty`、`startAi(canvas, difficulty)` 跨任務一致。重用 `TetrisMatch.input('B', action)` 把 AI 當「另一個輸入來源」。

**相依：** T3 依賴 T2 的 bestPlacement；T4 依賴 T1-3 與 Phase 3 的 match/render 元件（matchLayout/GarbageMeter/Effects/BoardView/HudView/SoundManager 皆已存在）；T6 依賴 T4-5 的 debug hook 與頁面。
