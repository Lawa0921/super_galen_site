# Dungeon Arcade — Phase 3：對戰核心 + 本機雙人 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。引擎（attack/match）走 TDD（Vitest）；渲染/整合走 build + 對標 mockup 人工驗收 + Playwright 煙霧。

**Goal:** 在既有單人引擎與 Pixi 渲染之上，加入「垃圾行攻擊 + 抵銷 + KO」的對戰核心（`attack`/`match`），並做出**本機雙人同鍵盤**的對稱雙盤對戰（含中央垃圾計量條、攻擊光束特效、VS 開場與 KO/結算畫面），沿用 Phase 2 的像素/科技/音效語言。

**Architecture:** `TetrisMatch` 包兩個確定性 `TetrisGame`（同 seed → 同方塊序列、公平），消行依攻擊表換算垃圾行、先抵銷自身待入垃圾、餘量送對手；非消行落地時傾倒待入垃圾（帶洞）。Match 統一 drain 兩盤事件、重新發出「帶 side 的 lock/lineClear + attack/garbageIn/ko」供渲染消費（渲染只認 match 事件）。渲染端複用 Phase 2 的 `BoardView`/`HudView`/`Effects`/`SoundManager`，各玩家一份，對稱排版。

**Tech Stack:** TypeScript strict、Vitest、PixiJS v8、Playwright。延用 Phase 1/2 既有模組。

**Spec:** `docs/superpowers/specs/2026-06-03-dungeon-arcade-battle-tetris-design.md`（§3.1 match/attack、§3.3a 對稱版型 C、§5 對戰規格、§6 操作）

---

## 檔案結構（本階段）

```
src/scripts/games/tetris/
  engine/
    attack.ts          # 攻擊表 + 連段 + B2B + 抵銷（純函式，TDD）
    attack.test.ts
    match.ts           # 兩盤對戰協調、垃圾路由/傾倒、KO、match 事件（TDD）
    match.test.ts
  input/
    keymap.ts          # 追加 KEYMAP_2P_A / KEYMAP_2P_B
  render/
    matchLayout.ts     # 對稱雙盤 + 中央計量條的版面計算
    GarbageMeter.ts    # 中央垃圾計量條（每側待入量）
    matchMain.ts       # 對戰進入點：建 match、雙輸入、render loop、VFX/音效、VS/結算
    BattleScreens.ts   # VS 開場 + VICTORY/DEFEAT 疊層
  audio/SoundManager.ts # 追加 attack/garbage 音效
src/pages/games/
  tetris.astro         # 依 ?mode=2p 切換單人 / 本機雙人
public/assets/games/tetris/
  vs-plate.webp        # VS 開場底圖（生成）
  banner-victory.webp / banner-defeat.webp # 結算橫幅（生成）
tests/e2e/
  games-tetris-2p.spec.ts
```

---

## Task 1：攻擊計算（attack.ts）— TDD

**Files:** Create `engine/attack.ts` + `engine/attack.test.ts`

- [ ] **Step 1：寫失敗測試** `engine/attack.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { baseAttack, comboAttack, computeAttack, cancelGarbage } from './attack';

describe('baseAttack', () => {
  it('一般消行：single0 double1 triple2 tetris4', () => {
    expect(baseAttack(1, 'none')).toBe(0);
    expect(baseAttack(2, 'none')).toBe(1);
    expect(baseAttack(3, 'none')).toBe(2);
    expect(baseAttack(4, 'none')).toBe(4);
  });
  it('T-spin(full)：single2 double4 triple6', () => {
    expect(baseAttack(1, 'full')).toBe(2);
    expect(baseAttack(2, 'full')).toBe(4);
    expect(baseAttack(3, 'full')).toBe(6);
  });
});

describe('comboAttack', () => {
  it('combo<=0 無加成；之後遞增', () => {
    expect(comboAttack(0)).toBe(0);
    expect(comboAttack(1)).toBe(1);
    expect(comboAttack(3)).toBe(2);
    expect(comboAttack(99)).toBe(5); // 飽和
  });
});

describe('computeAttack', () => {
  it('0 行不送', () => {
    expect(computeAttack({ count: 0, tSpin: 'none', combo: 5, b2b: true })).toBe(0);
  });
  it('tetris + combo + b2b 疊加', () => {
    // base4 + combo(1)=1 + b2b1 = 6
    expect(computeAttack({ count: 4, tSpin: 'none', combo: 1, b2b: true })).toBe(6);
  });
  it('b2b 只對困難消除生效', () => {
    // single 非困難：base0 + combo0 + 0 = 0
    expect(computeAttack({ count: 1, tSpin: 'none', combo: 0, b2b: true })).toBe(0);
  });
});

describe('cancelGarbage', () => {
  it('送出 >= 待入：清空待入、餘量送出', () => {
    expect(cancelGarbage(3, 5)).toEqual({ incoming: 0, sent: 2 });
  });
  it('送出 < 待入：扣待入、不送出', () => {
    expect(cancelGarbage(5, 2)).toEqual({ incoming: 3, sent: 0 });
  });
});
```

- [ ] **Step 2：執行確認失敗** `npx vitest run src/scripts/games/tetris/engine/attack.test.ts` → FAIL
- [ ] **Step 3：實作 `engine/attack.ts`**

```ts
import type { TSpinType } from './types';

/** 連段攻擊加成表（index = combo，combo 從 0 起算第一次消行）。飽和取末值。 */
export const COMBO_ATTACK = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

export interface AttackInput {
  count: number;
  tSpin: TSpinType;
  combo: number;
  b2b: boolean;
}

/** 消行類型的基礎攻擊行數。 */
export function baseAttack(count: number, tSpin: TSpinType): number {
  if (tSpin !== 'none') return [0, 2, 4, 6][Math.min(count, 3)] ?? 0;
  return [0, 0, 1, 2, 4][Math.min(count, 4)] ?? 0;
}

/** 連段加成。 */
export function comboAttack(combo: number): number {
  if (combo <= 0) return 0;
  return COMBO_ATTACK[Math.min(combo, COMBO_ATTACK.length - 1)];
}

/** 總攻擊行數。0 行不送；B2B 僅對困難消除（tetris / T-spin）加成。 */
export function computeAttack({ count, tSpin, combo, b2b }: AttackInput): number {
  if (count === 0) return 0;
  let atk = baseAttack(count, tSpin) + comboAttack(combo);
  if (b2b && (count === 4 || tSpin !== 'none')) atk += 1;
  return atk;
}

/** 抵銷：outgoing 先抵銷 incoming，回傳剩餘 incoming 與淨送出 sent。 */
export function cancelGarbage(incoming: number, outgoing: number): { incoming: number; sent: number } {
  if (outgoing >= incoming) return { incoming: 0, sent: outgoing - incoming };
  return { incoming: incoming - outgoing, sent: 0 };
}
```

- [ ] **Step 4：執行確認通過** → PASS
- [ ] **Step 5：Commit**（only attack.ts + attack.test.ts，訊息附 `Co-Authored-By: Claude <noreply@anthropic.com>`）
  `feat(tetris): add battle attack table, combo/B2B and garbage cancellation`

---

## Task 2：對戰協調核心（match.ts）— 建構 / 輸入 / 攻擊路由 — TDD

**Files:** Create `engine/match.ts` + `engine/match.test.ts`

- [ ] **Step 1：寫失敗測試** `engine/match.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { TetrisMatch } from './match';

describe('TetrisMatch 初始化', () => {
  it('兩盤皆 playing、同 seed 方塊序列相同（公平）', () => {
    const m = new TetrisMatch({ seed: 9 });
    expect(m.phase).toBe('playing');
    const sa = m.a.getState();
    const sb = m.b.getState();
    expect(sa.active!.type).toBe(sb.active!.type);
    expect(sa.next).toEqual(sb.next);
  });

  it('input 只路由到指定側', () => {
    const m = new TetrisMatch({ seed: 9 });
    const x0 = m.a.getState().active!.x;
    m.input('A', 'left');
    expect(m.a.getState().active!.x).toBe(x0 - 1);
    expect(m.b.getState().active!.x).toBe(x0); // B 不受影響
  });
});

describe('TetrisMatch 攻擊路由', () => {
  it('A 消行 → 對手 B 累積待入垃圾，並發出 attack 事件', () => {
    const m = new TetrisMatch({ seed: 9 });
    m.drainEvents();
    m.a.debugFillRowExceptOneAndDrop(); // A 清 1 行（single，attack 0）→ 不送
    m.step(0);
    // single 攻擊 0；改用連段或 tetris 才會送。這裡先確認 single 不送。
    expect(m.pendingGarbage('B')).toBe(0);
  });
});
```

- [ ] **Step 2：執行確認失敗** → FAIL（模組不存在）
- [ ] **Step 3：實作 `engine/match.ts`（核心：建構 / input / step 攻擊路由；垃圾傾倒與 KO 於 Task 3 補）**

```ts
import { TetrisGame, type InputAction } from './game';
import type { ActivePiece, TSpinType } from './types';
import { computeAttack, cancelGarbage } from './attack';
import { createRng } from './rng';
import { BOARD_WIDTH } from './constants';

export type Side = 'A' | 'B';
export type MatchPhase = 'intro' | 'playing' | 'result';

export type MatchEvent =
  | { kind: 'lock'; side: Side; piece: ActivePiece }
  | { kind: 'lineClear'; side: Side; rows: number[]; count: number; tSpin: TSpinType; combo: number; b2b: boolean }
  | { kind: 'attack'; from: Side; amount: number }
  | { kind: 'garbageIn'; side: Side; amount: number }
  | { kind: 'ko'; winner: Side };

export interface MatchOptions { seed?: number; }

export class TetrisMatch {
  readonly a: TetrisGame;
  readonly b: TetrisGame;
  phase: MatchPhase = 'playing';
  winner: Side | null = null;

  private incoming: Record<Side, number> = { A: 0, B: 0 };
  private holeRng: () => number;
  private events: MatchEvent[] = [];

  constructor(opts: MatchOptions = {}) {
    const seed = opts.seed ?? 1;
    this.a = new TetrisGame({ seed });
    this.b = new TetrisGame({ seed });
    this.holeRng = createRng((seed ^ 0x9e3779b9) >>> 0); // 垃圾洞獨立但可重現
  }

  input(side: Side, action: InputAction): void {
    if (this.phase !== 'playing') return;
    (side === 'A' ? this.a : this.b).input(action);
  }

  pendingGarbage(side: Side): number {
    return this.incoming[side];
  }

  drainEvents(): MatchEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private holeCol(): number {
    return Math.floor(this.holeRng() * BOARD_WIDTH);
  }

  private game(side: Side): TetrisGame {
    return side === 'A' ? this.a : this.b;
  }

  /** 處理某側本幀事件：攻擊路由（Task 2）+ 垃圾傾倒/KO（Task 3）。 */
  private process(side: Side): void {
    const opp: Side = side === 'A' ? 'B' : 'A';
    const game = this.game(side);
    const evs = game.drainEvents();
    let cleared = false;

    for (const ev of evs) {
      if (ev.kind === 'lock') {
        this.events.push({ kind: 'lock', side, piece: ev.piece });
      } else if (ev.kind === 'lineClear') {
        cleared = true;
        this.events.push({ kind: 'lineClear', side, rows: ev.rows, count: ev.count, tSpin: ev.tSpin, combo: ev.combo, b2b: ev.b2b });
        const out = computeAttack({ count: ev.count, tSpin: ev.tSpin, combo: ev.combo, b2b: ev.b2b });
        const res = cancelGarbage(this.incoming[side], out);
        this.incoming[side] = res.incoming;
        if (res.sent > 0) {
          this.incoming[opp] += res.sent;
          this.events.push({ kind: 'attack', from: side, amount: res.sent });
        }
      }
      // topout 於 Task 3 處理
    }
    void cleared; // Task 3 使用
  }

  step(dtMs: number): void {
    if (this.phase !== 'playing') return;
    this.a.step(dtMs);
    this.b.step(dtMs);
    this.process('A');
    this.process('B');
  }
}
```

- [ ] **Step 4：執行確認通過** → PASS
- [ ] **Step 5：Commit**（match.ts + match.test.ts）
  `feat(tetris): add match core with fair seeding and attack routing`

---

## Task 3：垃圾傾倒、抵銷、KO（match.ts）— TDD

**Files:** Modify `engine/match.ts` + `engine/match.test.ts`

- [ ] **Step 1：追加失敗測試** `engine/match.test.ts`

```ts
describe('TetrisMatch 垃圾傾倒與抵銷', () => {
  it('有待入垃圾、落地未消行 → 傾倒到自己盤面並發 garbageIn', () => {
    const m = new TetrisMatch({ seed: 3 });
    // 直接灌 B 的待入垃圾
    (m as unknown as { incoming: Record<string, number> }).incoming.B = 3;
    m.drainEvents();
    m.b.input('hardDrop'); // 一般落地、未消行
    m.step(0);
    const evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'garbageIn' && e.side === 'B' && e.amount === 3)).toBe(true);
    expect(m.pendingGarbage('B')).toBe(0);
    expect(m.b.getState().board.flat().filter((c) => c === 'G').length).toBeGreaterThan(0);
  });

  it('消行可抵銷待入垃圾（不傾倒）', () => {
    const m = new TetrisMatch({ seed: 3 });
    (m as unknown as { incoming: Record<string, number> }).incoming.A = 1;
    m.drainEvents();
    m.a.debugFillRowExceptOneAndDrop(); // 清 1 行（attack 0），但消行就不傾倒
    m.step(0);
    // 未傾倒：A 盤面不應因垃圾增加（仍有抵銷邏輯，single attack 0 不足以清 1，但「消行不傾倒」規則成立）
    const evs = m.drainEvents();
    expect(evs.some((e) => e.kind === 'garbageIn' && e.side === 'A')).toBe(false);
  });

  it('頂出 → result、對手勝、發 ko', () => {
    const m = new TetrisMatch({ seed: 3 });
    for (let i = 0; i < 25; i++) m.a.receiveGarbage(1, 0);
    m.drainEvents();
    m.a.input('hardDrop'); // 觸發 spawn 失敗 → topout
    m.step(0);
    const evs = m.drainEvents();
    expect(m.phase).toBe('result');
    expect(m.winner).toBe('B');
    expect(evs.some((e) => e.kind === 'ko' && e.winner === 'B')).toBe(true);
  });

  it('同 seed 兩場 match 垃圾洞序列相同（可重現）', () => {
    const holes = (seed: number) => {
      const m = new TetrisMatch({ seed });
      const r = (m as unknown as { holeRng: () => number }).holeRng;
      return [r(), r(), r()];
    };
    expect(holes(7)).toEqual(holes(7));
  });
});
```

- [ ] **Step 2：執行確認失敗** → FAIL
- [ ] **Step 3：在 `process()` 補垃圾傾倒與 topout**

把 Task 2 的 `process()` 內 `void cleared;` 替換為下列邏輯（並在迴圈中處理 topout）：

```ts
    for (const ev of evs) {
      if (ev.kind === 'lock') {
        this.events.push({ kind: 'lock', side, piece: ev.piece });
      } else if (ev.kind === 'lineClear') {
        cleared = true;
        this.events.push({ kind: 'lineClear', side, rows: ev.rows, count: ev.count, tSpin: ev.tSpin, combo: ev.combo, b2b: ev.b2b });
        const out = computeAttack({ count: ev.count, tSpin: ev.tSpin, combo: ev.combo, b2b: ev.b2b });
        const res = cancelGarbage(this.incoming[side], out);
        this.incoming[side] = res.incoming;
        if (res.sent > 0) {
          this.incoming[opp] += res.sent;
          this.events.push({ kind: 'attack', from: side, amount: res.sent });
        }
      } else if (ev.kind === 'topout') {
        this.phase = 'result';
        this.winner = opp;
        this.events.push({ kind: 'ko', winner: opp });
      }
    }

    // 非消行落地：傾倒待入垃圾（單一洞口）
    const locked = evs.some((e) => e.kind === 'lock');
    if (locked && !cleared && this.incoming[side] > 0) {
      const amount = this.incoming[side];
      this.incoming[side] = 0;
      game.receiveGarbage(amount, this.holeCol());
      this.events.push({ kind: 'garbageIn', side, amount });
    }
```

- [ ] **Step 4：執行確認通過** → PASS（`npx vitest run src/scripts/games/tetris/engine/match.test.ts`）
- [ ] **Step 5：Commit**
  `feat(tetris): add garbage dump, cancellation and KO to match`

---

## Task 4：雙人鍵位（keymap.ts）

**Files:** Modify `input/keymap.ts`

- [ ] **Step 1：追加並 export**（沿用 `InputAction`）

```ts
/** 本機雙人 — P1（左手 WASD + QE 旋轉 + 左 Shift hold） */
export const KEYMAP_2P_A: Record<string, InputAction> = {
  KeyA: 'left', KeyD: 'right', KeyS: 'softDrop', KeyW: 'hardDrop',
  KeyQ: 'rotateCCW', KeyE: 'rotateCW', ShiftLeft: 'hold',
};

/** 本機雙人 — P2（方向鍵 + ,/. 旋轉 + 右 Shift hold） */
export const KEYMAP_2P_B: Record<string, InputAction> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'softDrop', ArrowUp: 'hardDrop',
  Comma: 'rotateCCW', Period: 'rotateCW', ShiftRight: 'hold',
};
```

- [ ] **Step 2：Commit**（keymap.ts）`feat(tetris): add local 2P keymaps`

---

## Task 5：對稱雙盤版面（matchLayout.ts）+ 雙 BoardView/HudView — build + manual

**Files:** Create `render/matchLayout.ts`；於 `matchMain.ts`（Task 9）使用。

- [ ] **Step 1：實作 `matchLayout.ts`**：`computeMatchLayout(stageW, stageH)` 回傳對稱雙盤版面：
  - `cellSize`：依 `min(高度約束, 寬度約束)`；寬度約束需容納「兩盤 + 各自 HUD + 中央計量條」：總欄數 ≈ `2*(BOARD_WIDTH + hudCols) + meterCols`（hudCols≈4、meterCols≈2）。
  - 回傳 `{ cellSize, a: {origin, hudAnchor}, b: {origin, hudAnchor}, meter: {x, y, w, h} }`，A 在左、B 在右、計量條置中。
  - 對標 `mockups/ui/C-battle-symmetric.jpg`。
- [ ] **Step 2：手動驗收**：兩盤等大、對稱、置中、不出框（沿用 Phase 3 修正過的 renderer-resize 綁定；多尺寸 fit 檢查同 Phase 2 方法）。
- [ ] **Step 3：Commit** `feat(tetris): add symmetric two-board match layout`

---

## Task 6：中央垃圾計量條（GarbageMeter.ts）— build + manual

**Files:** Create `render/GarbageMeter.ts`

- [ ] **Step 1：實作**：兩條垂直計量條（A/B 各一，或中央雙色），`setLayout(rect)`、`render(pendingA, pendingB)`：以紅色由下往上填，量越多越滿、接近滿時閃爍警示（對標 mockup②）。用 Graphics + glow。
- [ ] **Step 2：手動驗收**：A/B 待入垃圾即時反映高度。
- [ ] **Step 3：Commit** `feat(tetris): add central garbage warning meter`

---

## Task 7：攻擊光束與垃圾注入特效（Effects 擴充）— build + manual

**Files:** Modify `render/Effects.ts`

- [ ] **Step 1：實作** `attackBeam(fromX, fromY, toX, toY, color)`：用 `fx-glow`（或新生成的 beam 素材）拉伸成光束、自攻擊方盤面飛向對手、短暫亮起淡出；`garbageInFlash(rect, color)`：被注入垃圾的盤面紅閃 + 底部上推塵爆。
- [ ] **Step 2：手動驗收**：A 送攻擊時光束橫越、B 被注入時紅閃。
- [ ] **Step 3：Commit** `feat(tetris): add attack beam and garbage-in VFX`

---

## Task 8：VS 開場 + KO/結算畫面（BattleScreens.ts）— build + manual

**Files:** Create `render/BattleScreens.ts`；素材由協調者生成（VS 底圖、VICTORY/DEFEAT 橫幅，黑底/透明、對標 mockup①④）。

- [ ] **Step 1：素材生成**（協調者，`nanobanana-image-gen`→ 真 alpha）：`vs-plate`、`banner-victory`、`banner-defeat`。
- [ ] **Step 2：實作** `BattleScreens`：`showIntro(onDone)`（VS 字樣 + 倒數 3-2-1-GO，結束呼叫 onDone 開始對戰）、`showResult(winnerSide)`（勝方 VICTORY 金光 + 敗方 DEFEAT/碎裂，提供 Restart）。
- [ ] **Step 3：手動驗收**：開場 VS→倒數→對戰；KO→結算。
- [ ] **Step 4：Commit** `feat(tetris): add VS intro and victory/defeat screens`

---

## Task 9：對戰進入點 matchMain.ts + 頁面模式切換 — build + manual

**Files:** Create `render/matchMain.ts`；Modify `src/pages/games/tetris.astro`

- [ ] **Step 1：實作 `matchMain.ts`** `startMatch(canvas)`：
  - 建 `PixiStage`、載素材、`computeMatchLayout`；建兩組 `BoardView`/`HudView`（A tint 青、B tint 洋紅）、`GarbageMeter`、`Effects`、`BattleScreens`、`SoundManager`。
  - 兩個 `InputController`（A/B 各一，獨立 DAS/ARR）；`keydown` 依 `KEYMAP_2P_A`/`KEYMAP_2P_B` 路由到 `match.input('A'|'B', action)`。
  - `BattleScreens.showIntro` → 結束後開始 ticker loop：`match.step(dt)`；`match.drainEvents()` 分派到對應側的 `BoardView`/`Effects`/`SoundManager`（lock/lineClear）、`attack`→光束+對手 meter、`garbageIn`→紅閃、`ko`→`BattleScreens.showResult`。
  - 每幀 `boardA/B.render(match.a/b.getState())`、`hudA/B.render(...)`、`meter.render(match.pendingGarbage('A'), match.pendingGarbage('B'))`。
  - debug hook：`window.__tetrisDebug = { match, stage, fx }`。
- [ ] **Step 2：頁面切換**：`tetris.astro` 讀 `?mode=2p`；2P → import `startMatch`，否則 `startTetris`（單人）。更新操作提示文字。
- [ ] **Step 3：手動驗收**：`/games/tetris?mode=2p` 兩人可同鍵盤對打至 KO，攻擊/垃圾/抵銷/特效/音效皆運作。
- [ ] **Step 4：Commit** `feat(tetris): wire local 2P battle mode and page switch`

---

## Task 10：Playwright 2P 煙霧 + 全套驗證

**Files:** Create `tests/e2e/games-tetris-2p.spec.ts`

- [ ] **Step 1：寫測試**（chromium-only，同 Phase 2）：載入 `/games/tetris?mode=2p`；等 `window.__tetrisDebug.match`；（必要時跳過開場）；對 A、B 模擬各自鍵位 → 斷言兩盤 active 各自移動、互不干擾；灌 B 待入垃圾並讓 B 落地 → 斷言 B 盤面出現 'G'。
- [ ] **Step 2：執行**：`npx playwright test tests/e2e/games-tetris-2p.spec.ts --project=chromium` → PASS
- [ ] **Step 3：全套**：`npx vitest run src/scripts/games/tetris/`（含 attack/match 新測試）全綠；`npx tsc --noEmit` 無新增 tetris 錯誤。
- [ ] **Step 4：對標驗收**：dev server 截圖對照 `ui/C-battle-symmetric.jpg`（雙盤）、`01-vs-intro.jpg`（開場）、`04-victory-ko.jpg`（結算）。
- [ ] **Step 5：Commit** `test(tetris): add local 2P battle smoke e2e`

---

## Self-Review（撰寫者自檢）

**Spec 覆蓋（§3.1/§3.3a/§5/§6）：** attack 表 + 連段 + B2B + 抵銷（T1）✓；match 兩盤/路由/傾倒/KO/事件/可重現（T2-3）✓；對稱雙盤版型 C（T5）✓；中央計量條（T6）✓；攻擊光束/垃圾特效（T7）✓；VS/結算（T8）✓；本機雙人鍵位與路由（T4、T9）✓；mode 切換（T9）✓。AI（Phase 4）、線上（Phase 6）不在本階段。

**Placeholder 掃描：** T2 `process()` 的 `void cleared;` 是刻意佔位、T3 立即以完整邏輯替換並已標明替換位置，非殘留。

**型別一致性：** `Side`、`MatchPhase`、`MatchEvent`（含帶 side 的 lock/lineClear）、`computeAttack`/`cancelGarbage`、`KEYMAP_2P_A/B`、`startMatch(canvas)`、`window.__tetrisDebug.match` 跨任務一致。`TetrisMatch.a/b` 為公開 `TetrisGame`，渲染層直接 `getState()`。

**相依：** 渲染（T5-9）依賴 attack/match（T1-3）；T9 整合所有渲染元件；T10 依賴 T9 的 debug hook 與頁面。複用 Phase 2 的 `BoardView`/`HudView`/`Effects`/`SoundManager`（皆已參數化版面/側別）。
