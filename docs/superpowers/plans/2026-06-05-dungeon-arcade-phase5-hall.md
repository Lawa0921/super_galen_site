# Dungeon Arcade — Phase 5：遊戲廳 + 模式選單 Implementation Plan

> 本階段以 UI / 整合為主（純邏輯少），走 build + 瀏覽器人工驗收 + Playwright 煙霧。沿用站上 SCSS 慣例（scoped `<style>`、無 `!important`、無行內樣式）與地城霓虹主題。

**Goal:** 建 `/games`「Dungeon Arcade」遊戲廳卡片牆（俄羅斯方塊為首張、其餘 COMING SOON），並在 `/games/tetris` 加**模式選單**（SOLO / vs AI 三難度），用畫面選模式取代手打 URL 參數；deep-link 參數仍可直接開。

**Tech Stack:** Astro 頁面 + scoped style、既有 Pixi 遊戲入口（`startTetris`/`startAi`）、既有素材（`bg-dungeon.webp` 當廳背景）、Press Start 2P 字體、Playwright。

**Spec:** §2 範圍、§3.3a（mockup A 廳、B 模式選單）、§8 Phase 5。對標 `mockups/ui/A-hall.jpg`、`B-mode-select.jpg`。

---

## 檔案結構

```
src/pages/games/
  index.astro      # 已存在（目前是舊版）→ 改為 Dungeon Arcade 廳卡片牆
  tetris.astro     # 加模式選單 overlay（無 ?mode 時顯示）
```

---

## Task 1：Dungeon Arcade 廳頁 `/games`

**Files:** Modify `src/pages/games/index.astro`

- [ ] **Step 1**：用 `BaseLayout`，全螢幕地城背景（`/assets/games/tetris/bg-dungeon.webp` 當 CSS background，深色疊罩）。內容：
  - 頂部霓虹標題 `DUNGEON ARCADE`（Press Start 2P）。
  - 卡片牆（grid）：1 張**啟用卡** `BATTLE TETRIS`（青霓虹邊框、hover 發光、`<a href="/games/tetris">`），+ 3 張 `COMING SOON` 鎖定卡（暗、不可點、紅章）。
  - 啟用卡內放一個用 CSS/方塊拼的小 tetris 圖示或 `block.webp` 點綴。
  - 左上 `← HOME`（回 `/`）。
- [ ] **Step 2**：scoped `<style>`：霓虹邊框（box-shadow glow）、hover 放大/增亮、響應式 grid（手機單欄）。
- [ ] **Step 3：手動驗收**：`/games` 顯示廳、Tetris 卡可點進遊戲、COMING SOON 卡不可點、手機版排版正常。
- [ ] **Step 4：Commit** `feat(tetris): build Dungeon Arcade hall at /games`（commit 附 `Co-Authored-By: Claude <noreply@anthropic.com>`）

---

## Task 2：`/games/tetris` 模式選單 overlay

**Files:** Modify `src/pages/games/tetris.astro`

- [ ] **Step 1：標記**：在 `.tetris-page` 內加一個 `#mode-select` overlay（預設顯示），含標題 `SELECT MODE` 與按鈕：
  - `SOLO`（data-mode="solo"）
  - `vs AI · EASY`（data-mode="ai" data-diff="easy"）、`vs AI · NORMAL`、`vs AI · HARD`
  - 霓虹按鈕樣式（scoped style，hover 發光）。
- [ ] **Step 2：腳本**：
  - 讀 URL params。**若已帶 `?mode=solo|ai`** → 直接啟動對應模式、隱藏 overlay（deep-link / e2e 用）。
  - 否則顯示 overlay；按鈕 click → 隱藏 overlay、依 data-mode/diff 呼叫 `startTetris(canvas)` 或 `startAi(canvas, diff)`、並更新 `#tetris-hint`。
  - 保留現有：`mode=ai` 直接啟動、否則…（改為：無 mode → 顯示 overlay，而非直接 solo）。
  - 啟動後不可重複啟動（記 `started` 旗標）。
- [ ] **Step 3：手動驗收**：`/games/tetris` 顯示選單；點 SOLO → 單人；點 vs AI HARD → 對戰困難 AI；`/games/tetris?mode=ai&diff=hard` 仍直接開（跳過選單）。
- [ ] **Step 4：Commit** `feat(tetris): add mode-select menu on the game page`

---

## Task 3：（選配）廳卡片封面藝術

**Files:** 由協調者用 `nanobanana-image-gen` 生成 `public/assets/games/tetris/card-tetris.webp`（黑底/真 alpha 或滿版），放進 Task 1 的 Tetris 卡。

- [ ] 若時間允許再做；否則 Task 1 用 CSS/方塊圖示即可。

---

## Task 4：Playwright 煙霧 + 全套驗證

**Files:** Create `tests/e2e/games-hall.spec.ts`

- [ ] **Step 1：測試**（chromium-only）：
  - 載入 `/games` → 有 `DUNGEON ARCADE` 文字與指向 `/games/tetris` 的連結。
  - 載入 `/games/tetris`（無參數）→ `#mode-select` 可見；點 `vs AI · HARD` → overlay 消失、等 `__tetrisDebug.match` 出現（vs-AI 啟動）。
  - 載入 `/games/tetris?mode=solo` → 直接啟動（`__tetrisDebug.game` 或 canvas 就緒、無 overlay）。
- [ ] **Step 2：執行** `npx playwright test tests/e2e/games-hall.spec.ts --project=chromium` → PASS。並確認既有 tetris / tetris-ai e2e 仍綠。
- [ ] **Step 3**：`npx vitest run src/scripts/games/tetris/` 全綠、`npx tsc --noEmit` 無新增 tetris 錯誤。
- [ ] **Step 4：Commit** `test(tetris): add games hall + mode-select smoke e2e`

---

## Self-Review
- 範圍：廳（mockup A）+ 模式選單（mockup B，去掉已移除的本機雙人）→ Task 1-2 覆蓋；deep-link 相容、e2e Task 4。
- 無 placeholder（Task 3 為明確選配）。
- 一致性：`startTetris(canvas)` / `startAi(canvas, diff)` 既有簽章；`#tetris-canvas`、`#tetris-hint`、`#mode-select`、`__tetrisDebug` 命名一致。
- solo 模式：`?mode=solo` 與「選單點 SOLO」皆走 `startTetris`；無參數改為顯示選單（不再自動 solo）。
