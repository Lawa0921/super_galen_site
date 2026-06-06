# Dungeon Arcade — Phase 2：單人 Pixi 渲染 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> Phase 2 偏視覺迭代：純邏輯接縫走 TDD（Vitest）；Pixi 繪圖走「build + 對標 mockup 人工驗收 + Playwright 煙霧測試」。**Pixi v8 API 與 v7 差異大，實作每個 Pixi 任務前先用 context7 查 `pixi.js` v8 文件確認 API。**

**Goal:** 把 Phase 1 的 headless 引擎接上 PixiJS v8 渲染，做出可單人實際遊玩、視覺對標 `ui/C-battle-symmetric.jpg` 單盤版本的 `/games/tetris` 頁面。

**Architecture:** 引擎仍是唯一事實來源（`getState()` / `drainEvents()`）。渲染層每幀讀狀態重畫，純函式負責座標/版型/上色（可測），Pixi 物件負責呈現（精靈合成 + AdvancedBloom 光暈 + 粒子）。輸入層把鍵盤事件＋DAS/ARR 轉成引擎離散 `input()`。Pixi 只在此頁 code-split 載入。

**Tech Stack:** PixiJS v8.18（已安裝）、pixi-filters v6（AdvancedBloom/Glow）、TypeScript strict、Vitest（純邏輯）、Playwright（煙霧）、Astro `<script>` 打包、Gemini `nanobanana-image-gen`（素材）。

**Spec:** `docs/superpowers/specs/2026-06-03-dungeon-arcade-battle-tetris-design.md`（§3.3 渲染層、§3.3a 介面組合、§3.4 頁面整合、§4 素材）
**對標圖:** `docs/superpowers/specs/dungeon-arcade-mockups/ui/C-battle-symmetric.jpg`（單盤即取其一半的 HUD 佈局）

---

## 檔案結構（本階段）

```
src/scripts/games/tetris/
  render/
    layout.ts          # 純函式：cell→pixel、tetromino→tint、版型選擇、HUD 錨點（TDD）
    layout.test.ts
    PixiStage.ts       # Application 初始化、圖層、AdvancedBloom、resize（build+manual）
    BoardView.ts       # 依 GameState 畫鎖定格/active/ghost（build+manual）
    HudView.ts         # NEXT/HOLD/score/level 面板（build+manual）
    assets.ts          # 素材路徑常數 + Assets.load 包裝
    main.ts            # 進入點：建 game、RAF loop、接 input、掛 debug hook
  input/
    keymap.ts          # 1P 鍵位對應表（純資料）
    InputController.ts # DAS/ARR 狀態機：鍵盤事件→引擎 action（TDD 其時序）
    InputController.test.ts
src/pages/games/
  tetris.astro         # 全螢幕容器 + <canvas> + <script> import main.ts
public/assets/games/tetris/
  bg-dungeon.webp      # 背景
  block.webp           # 中性發光水晶 tile（可 tint）
  block-garbage.webp   # 垃圾塊 tile
  frame-well.webp      # 盤面框（可 tint）
  panel.webp           # HUD 面板框（可 tint / 九宮切）
tests/e2e/
  games-tetris.spec.ts # Playwright 煙霧測試
```

---

## Task 0：素材生成（由協調者互動執行，非 subagent）

> 此任務由主控（controller）以 `nanobanana-image-gen` 生成、先存 `tmp/`、與使用者預覽核可後再移入 `public/assets/games/tetris/`。後續渲染任務依賴這些檔案存在。素材規格：

- `block.webp`：**正方形、透明背景**、置中一顆發光能量水晶立方體，**中性偏白/淺青**（之後用 Pixi `tint` 上 7 色），邊緣乾淨可拼接。建議生成 512×512 再 resize。
- `block-garbage.webp`：同尺寸，灰色裂紋「垃圾塊」，低飽和、不發光。
- `frame-well.webp`：**透明背景**的單一全息霓虹盤面外框（內部鏤空，10:20 比例內容區），細線發光、四角接點。中性白可 tint。
- `panel.webp`：透明背景的小型全息面板框（給 NEXT/HOLD/分數用），九宮可延展或固定尺寸數張。
- `bg-dungeon.webp`：16:9 地城霓虹背景（可直接由既有 `mockups/02-battle-active.jpg` 風格重生為乾淨無 HUD 的純背景）。

驗收：透明度正確、tint 後顏色乾淨、拼接無接縫。核可後移入 `public/assets/games/tetris/` 並 `git add` 該資料夾。

---

## Task 1：座標 / 版型 / 上色純函式（layout.ts）— TDD

**Files:** Create `src/scripts/games/tetris/render/layout.ts` + `layout.test.ts`

- [ ] **Step 1：寫失敗測試** `layout.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { cellToPixel, pieceTint, chooseLayout, GARBAGE_TINT } from './layout';
import { BUFFER_ROWS } from '../engine/constants';

describe('cellToPixel', () => {
  it('把盤面格 (x,y) 換成像素左上角，並扣掉緩衝列', () => {
    // origin (100,50), cellSize 30；可見列從 BUFFER_ROWS 起算
    const p = cellToPixel(0, BUFFER_ROWS, 30, { x: 100, y: 50 });
    expect(p).toEqual({ x: 100, y: 50 }); // 第一個可見列對齊 origin.y
    const p2 = cellToPixel(2, BUFFER_ROWS + 1, 30, { x: 100, y: 50 });
    expect(p2).toEqual({ x: 160, y: 80 });
  });
});

describe('pieceTint', () => {
  it('七種方塊各有固定顏色，且為數字色碼', () => {
    for (const t of ['I','O','T','S','Z','J','L'] as const) {
      expect(typeof pieceTint(t)).toBe('number');
    }
    expect(pieceTint('I')).not.toBe(pieceTint('O'));
    expect(GARBAGE_TINT).toBeTypeOf('number');
  });
});

describe('chooseLayout', () => {
  it('寬螢幕用 symmetric、窄螢幕用 focus', () => {
    expect(chooseLayout(1280)).toBe('symmetric');
    expect(chooseLayout(700)).toBe('focus');
  });
});
```

- [ ] **Step 2：執行確認失敗** `npx vitest run src/scripts/games/tetris/render/layout.test.ts` → FAIL（模組不存在）
- [ ] **Step 3：實作 layout.ts**

```ts
import type { PieceType } from '../engine/types';
import { BUFFER_ROWS } from '../engine/constants';

export interface Point { x: number; y: number; }
export type LayoutMode = 'symmetric' | 'focus';

/** 盤面格 (cellX, cellY) → 像素左上角；扣掉頂部 BUFFER_ROWS（緩衝列不顯示）。 */
export function cellToPixel(cellX: number, cellY: number, cellSize: number, origin: Point): Point {
  return {
    x: origin.x + cellX * cellSize,
    y: origin.y + (cellY - BUFFER_ROWS) * cellSize,
  };
}

const TINTS: Record<PieceType, number> = {
  I: 0x36e6ff, // 青
  O: 0xffd23f, // 金
  T: 0xc15cff, // 紫
  S: 0x4dff88, // 綠
  Z: 0xff4d6d, // 紅
  J: 0x4d7bff, // 藍
  L: 0xff9a3c, // 橙
};
export const GARBAGE_TINT = 0x6b7280; // 灰

export function pieceTint(type: PieceType): number {
  return TINTS[type];
}

/** 視窗寬 < 920 用聚焦版（手機/窄），否則對稱雙盤。 */
export function chooseLayout(viewportWidth: number): LayoutMode {
  return viewportWidth < 920 ? 'focus' : 'symmetric';
}
```

- [ ] **Step 4：執行確認通過** → PASS
- [ ] **Step 5：Commit**（only `layout.ts` + `layout.test.ts`，commit 訊息附 `Co-Authored-By: Claude <noreply@anthropic.com>`）
  `feat(tetris): add render layout/coord/tint pure helpers`

---

## Task 2：輸入 DAS/ARR 狀態機（InputController.ts）— TDD

DAS（Delayed Auto Shift）/ARR（Auto Repeat Rate）只處理「左右移動」的長按重複；旋轉/hold/硬降為單次觸發。狀態機以 `update(dt)` 推進、不直接碰 DOM（DOM 綁定在 main.ts）。

**Files:** Create `src/scripts/games/tetris/input/keymap.ts`, `InputController.ts`, `InputController.test.ts`

- [ ] **Step 1：寫失敗測試** `InputController.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { InputController } from './InputController';

describe('InputController DAS/ARR', () => {
  it('按下左鍵立即觸發一次，DAS 後依 ARR 重複', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40 });
    ic.press('left');
    expect(actions).toEqual(['left']);        // 立即一次
    ic.update(100); expect(actions).toEqual(['left']);            // 未達 DAS
    ic.update(80);  expect(actions).toEqual(['left','left']);     // 跨過 DAS(160) → 第二次
    ic.update(40);  expect(actions).toEqual(['left','left','left']); // 每 ARR 再一次
  });

  it('放開左鍵停止重複', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40 });
    ic.press('left');
    ic.release('left');
    ic.update(1000);
    expect(actions).toEqual(['left']); // 放開後不再重複
  });

  it('旋轉是單次、不重複', () => {
    const actions: string[] = [];
    const ic = new InputController((a) => actions.push(a), { das: 160, arr: 40 });
    ic.press('rotateCW');
    ic.update(1000);
    expect(actions).toEqual(['rotateCW']);
  });
});
```

- [ ] **Step 2：執行確認失敗** → FAIL
- [ ] **Step 3：實作 `keymap.ts`**

```ts
import type { InputAction } from '../engine/game';

/** 1P（vs AI）鍵位 → 引擎 action。key 用 KeyboardEvent.code 或 key。 */
export const KEYMAP_1P: Record<string, InputAction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'softDrop',
  ArrowUp: 'rotateCW',
  KeyX: 'rotateCW',
  KeyZ: 'rotateCCW',
  Space: 'hardDrop',
  ShiftLeft: 'hold',
  KeyC: 'hold',
};
```

- [ ] **Step 4：實作 `InputController.ts`**

```ts
import type { InputAction } from '../engine/game';

export interface DasArr { das: number; arr: number; }
type Emit = (action: InputAction) => void;

const REPEATABLE: InputAction[] = ['left', 'right'];

/** 管理左右長按的 DAS/ARR；其餘 action 單次觸發。以 update(dt) 推進。 */
export class InputController {
  private held: Partial<Record<InputAction, { sinceMs: number; charged: boolean }>> = {};
  constructor(private emit: Emit, private cfg: DasArr) {}

  press(action: InputAction): void {
    this.emit(action); // 立即一次
    if (REPEATABLE.includes(action)) {
      // 同向覆蓋（最後按下優先）
      if (action === 'left') delete this.held['right'];
      if (action === 'right') delete this.held['left'];
      this.held[action] = { sinceMs: 0, charged: false };
    }
  }

  release(action: InputAction): void {
    delete this.held[action];
  }

  update(dtMs: number): void {
    for (const action of REPEATABLE) {
      const st = this.held[action];
      if (!st) continue;
      st.sinceMs += dtMs;
      if (!st.charged) {
        if (st.sinceMs >= this.cfg.das) {
          st.charged = true;
          st.sinceMs -= this.cfg.das;
          this.emit(action);
        }
      }
      if (st.charged) {
        while (st.sinceMs >= this.cfg.arr) {
          st.sinceMs -= this.cfg.arr;
          this.emit(action);
        }
      }
    }
  }
}
```

- [ ] **Step 5：執行確認通過** → PASS（修正：第一個測試中 `update(80)` 後 sinceMs=180≥160 觸發一次並餘 20；`update(40)` 後 60≥40 觸發一次餘 20。符合期望序列。）
- [ ] **Step 6：Commit**（`keymap.ts`,`InputController.ts`,`InputController.test.ts`）
  `feat(tetris): add keyboard mapping and DAS/ARR input controller`

---

## Task 3：PixiStage（Application + Bloom + resize）— build + manual

> 先用 context7 查 Pixi v8：`new Application()` + `await app.init({...})`、`Container`、`app.ticker`、`app.renderer.resize`、pixi-filters `AdvancedBloomFilter`。

**Files:** Create `src/scripts/games/tetris/render/PixiStage.ts`, `assets.ts`

- [ ] **Step 1：實作 `assets.ts`** — 匯出素材路徑常數與 `loadGameTextures()`（用 `Assets.load`）。路徑指向 `/assets/games/tetris/*.webp`（Astro public 對應 `/assets/...`）。
- [ ] **Step 2：實作 `PixiStage.ts`**：
  - `export class PixiStage { app: Application; root: Container; ... }`
  - `static async create(canvas: HTMLCanvasElement): Promise<PixiStage>`：`new Application()`、`await app.init({ canvas, resizeTo: canvas.parentElement, backgroundAlpha: 0, antialias: true, resolution: devicePixelRatio, autoDensity: true })`。
  - 建立圖層 Container：`bgLayer`（背景 Sprite）、`playLayer`（盤面/方塊，套 `AdvancedBloomFilter`）、`hudLayer`、`fxLayer`。
  - `resize()` 重新計算 cellSize/origin 並通知 views。
- [ ] **Step 3：手動驗收**：在 `tetris.astro` 暫時掛一個只顯示背景 + bloom 測試方塊的版本，`npm run dev` 開 `http://localhost:4321/games/tetris`，確認 canvas 滿版、背景顯示、bloom 生效、resize 不破版。
- [ ] **Step 4：Commit**（`PixiStage.ts`,`assets.ts`）
  `feat(tetris): add Pixi stage, layers and bloom setup`

---

## Task 4：BoardView（畫鎖定格 + active + ghost）— build + manual

**Files:** Create `src/scripts/games/tetris/render/BoardView.ts`

- [ ] **Step 1：實作**：
  - 建構接收 `playLayer` Container、cellSize、origin、玩家色（P1 tint）。
  - `render(state: GameState)`：清除舊方塊精靈（或物件池複用），依 `state.board` 畫每個非 null 格（`block.webp` Sprite，`tint = pieceTint(cell)` 或 `GARBAGE_TINT`），用 `cellToPixel` 定位；畫 `state.active` 的 cells；畫 ghost（active 落點，半透明）。
  - 盤面框 `frame-well.webp` Sprite（tint 玩家色）疊在格子層外。
  - 用物件池避免每幀 new Sprite（效能）。
- [ ] **Step 2：手動驗收**：接上真實 `TetrisGame`，鍵盤可移動/旋轉/硬降，方塊與 ghost 正確顯示、消行即時更新，對標 mockup 單盤。
- [ ] **Step 3：Commit** `feat(tetris): render board, active piece and ghost`

---

## Task 5：HudView（NEXT / HOLD / 分數 / 等級）— build + manual

**Files:** Create `src/scripts/games/tetris/render/HudView.ts`

- [ ] **Step 1：實作**：用 `panel.webp` 面板框 + Pixi `Text`（霓虹樣式 + GlowFilter）顯示：HOLD 方塊（mini 精靈）、NEXT 佇列（`state.next` 前 3~5 顆 mini 精靈）、SCORE、LEVEL、LINES、COMBO。位置由 layout 的 HUD 錨點決定。
- [ ] **Step 2：手動驗收**：數值即時更新、hold/next 正確、版面對標 mockup 的 HUD 區。
- [ ] **Step 3：Commit** `feat(tetris): render HUD (next/hold/score/level)`

---

## Task 6：main.ts 進入點（RAF loop + 輸入綁定 + debug hook）— build + manual

**Files:** Create `src/scripts/games/tetris/render/main.ts`

- [ ] **Step 1：實作**：
  - `export async function startTetris(canvas)`：建 `PixiStage`、`await loadGameTextures()`、`new TetrisGame({ seed })`、`BoardView`、`HudView`、`InputController`。
  - DOM 綁定：`keydown`/`keyup` → 查 `KEYMAP_1P` → `ic.press/release`；`ic` 的 emit 回呼呼叫 `game.input(action)`。`keydown` 要擋瀏覽器預設（方向鍵/空白捲動）。
  - RAF loop（用 `app.ticker.add`）：每幀 `game.step(deltaMS)`、`ic.update(deltaMS)`、`game.drainEvents()`（先記錄，Phase 3 接特效）、`boardView.render(state)`、`hudView.render(state)`。
  - 掛 `window.__tetrisDebug = { game }` 供 e2e 斷言。
- [ ] **Step 2：手動驗收**：完整單人可玩（移動手感含 DAS/ARR、重力下落、消行計分、頂出停止）。
- [ ] **Step 3：Commit** `feat(tetris): wire game loop, input binding and debug hook`

---

## Task 7：Astro 頁面 `/games/tetris`

**Files:** Create `src/pages/games/tetris.astro`

- [ ] **Step 1：實作**：用 `BaseLayout`，全螢幕深色容器 + `<canvas id="tetris-canvas">`，以 `<script>` import 並呼叫 `startTetris(canvas)`（Astro 會用 Vite 打包 Pixi，達成 code-split）。基本 SEO/標題。確保此頁不載入無關的 RPG 首頁腳本。
- [ ] **Step 2：手動驗收**：`http://localhost:4321/games/tetris` 直接可玩；檢查首頁 bundle 未被 Pixi 污染（`npm run build` 後看 chunk）。
- [ ] **Step 3：Commit** `feat(tetris): add /games/tetris page mounting the Pixi game`

---

## Task 8：Playwright 煙霧測試

**Files:** Create `tests/e2e/games-tetris.spec.ts`

- [ ] **Step 1：寫測試**：導向 `/games/tetris`；等待 `#tetris-canvas` 出現；等待 `window.__tetrisDebug` 就緒；讀初始 `getState()`（active 非 null、status playing）；`page.keyboard.press` 模擬 ArrowLeft/ArrowRight/Space；斷言狀態有變化（如 active.x 變動或 lines/score 改變）。
- [ ] **Step 2：執行** `npx playwright test tests/e2e/games-tetris.spec.ts`（必要時先 `npm run build && npm run preview` 或用既有 e2e 啟動設定）→ PASS
- [ ] **Step 3：Commit** `test(tetris): add /games/tetris smoke e2e`

---

## Task 9：對標驗收 + 全套綠燈

- [ ] **Step 1**：`npx vitest run src/scripts/games/tetris/`（含 Phase 1 + layout + input）全綠。
- [ ] **Step 2**：`npx tsc --noEmit` 無新增 tetris 相關錯誤。
- [ ] **Step 3**：dev server 截圖（Playwright `browser_take_screenshot` 或 `page.screenshot`）對照 `ui/C-battle-symmetric.jpg`（單盤 HUD 佈局）；視覺差異列點，必要時回頭微調 BoardView/HudView/素材。
- [ ] **Step 4**：把使用者驗收 URL（`http://localhost:4321/games/tetris`）回報。

---

## Self-Review（撰寫者自檢）

**Spec 覆蓋（§3.3 / §3.3a / §3.4 / §4）：** 渲染層 PixiStage/BoardView/HudView ✓；版型純函式（symmetric/focus 切換）✓；素材清單（block/garbage/frame/panel/bg + tint 策略）✓；頁面整合 + code-split ✓；DAS/ARR（spec §5 延後至本階段輸入層）✓。Effects（粒子/攻擊光束/震屏）與雙盤/攻擊屬 Phase 3，本階段僅單盤、`drainEvents` 先記錄不接特效 — 非遺漏。

**Placeholder 掃描：** Task 0 素材為協調者互動任務（含明確規格與驗收），非 TODO。Pixi 任務以「build + 對標 + Playwright」驗收取代逐行程式碼，並要求實作前用 context7 確認 v8 API（因 v8≠v7，硬寫易錯）。

**型別一致性：** `InputAction`（來自 `engine/game`）、`GameState`、`cellToPixel/pieceTint/chooseLayout`、`startTetris(canvas)`、`window.__tetrisDebug.game` 跨任務一致。

**相依：** Task 3–7 依賴 Task 0 素材檔存在；Task 8 依賴 Task 6 的 `window.__tetrisDebug` 與 Task 7 頁面。
