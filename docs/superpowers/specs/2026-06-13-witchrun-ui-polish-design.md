# Witch Run 介面完成度打磨設計

**日期**：2026-06-13
**範圍**：`/games/witchrun` 縱向彈幕遊戲的 4 點介面調整（不改遊戲核心邏輯/平衡）
**來源**：接手 Codex session `019ebec7` 的「最高水準檢視」結論——功能與測試（152 unit + 8 e2e）皆通過、底子穩，但完成度上有 4 點介面問題。

## 背景

Codex 用 production build 靜態產物在桌機 / Pixel 5 / 375px 截圖檢視，確認：

1. **手機觸控鈕透出**：`.witch-touch`（BOMB/OD）以純 CSS `@media(pointer:coarse){display:flex}` 永遠顯示；title（半透明背景）與 overlay（半透明）都比它高層，但因半透明導致下層圓鈕隱約透出。
2. **手機上下黑邊**：`relayout()` 用 `Math.min` fit-contain，3:4 場域（`FIELD_W/H=480/640`）在細長手機 letterbox，黑邊置中到上方（Pixel 5 `baseY≈101.5`）。連 `BackgroundView` 都跟著被裁，黑邊是純黑死區。
3. **Title 偏空 / 手機重心偏低**：桌機 title 像 placeholder，手機內容垂直偏低、頂部留白過多。
4. **開局太慢**：每關第一波在 `atMs:2000`，開局 2 秒只有自機彈、無敵人，張力不足。

## 決策（已與使用者確認）

- 範圍：**4 點全做**。
- #3 方向：**活背景＋美術點綴**（非完整 attract mode、非靜態圖）。重用既有 `card-witchrun.webp` + `bg-stage1.webp`，不新生成圖。

## 各點設計

### #1 觸控鈕可見性改為狀態驅動

**檔案**：`src/pages/games/witchrun.astro`

- `<main class="witch">` 加 `data-phase="title"`；遊戲開始時設為 `playing`；任一 overlay 開啟時加 `data-overlay` 屬性。
- CSS 改為：
  - `.witch-touch { display: none; }`（恆預設隱藏）
  - `@media (pointer: coarse) { .witch[data-phase="playing"]:not([data-overlay]) .witch-touch { display: flex; } }`
- `start()` 成功後設 `witchEl.dataset.phase = 'playing'`。
- overlay 開關需同步 `data-overlay`：`src/scripts/games/witchrun/render/main.ts` 既有 `showDraft` / `onDraftClick` / game over / clear 的 show/hide 各處加一行切換 `.witch` 的 `data-overlay`（新增小 helper `setOverlay(open)`）。

**驗收**：Playwright coarse-pointer 截圖——title 無觸控鈕、playing 顯示、draft overlay 開啟時隱藏。

### #2 背景填滿 viewport，戰場維持 3:4 並加框

**檔案**：`src/scripts/games/witchrun/render/BackgroundView.ts`、`render/main.ts`

- `BackgroundView` 新增 `resize(w, h)`：把 base/tiling/fade 三個 Graphics/Sprite 尺寸改為傳入的全畫面尺寸（背景不再綁 `fieldW×fieldH`）。
- `relayout()` 拆成兩套縮放：
  - **content（戰場）**：維持 `Math.min` contain，置中 → `stage.baseX/baseY`（不變，保留 shake 中心語意）。
  - **bgLayer（背景）**：改用 `Math.max` cover 縮放並置中（`bgScale = max(w/FIELD_W, h/FIELD_H)`），溢出裁切、不橫向重複拼接；填滿整個 viewport。
- **戰場框**：在 `content` 的 index 0 加一個 `frameGfx`（細邊框 + 柔光/內陰影，繪於 `0,0,FIELD_W,FIELD_H`），界定 3:4 戰場、隨 content 一起 shake。背景填滿後 CRT vignette 自然加強邊緣壓暗。

**驗收**：Pixel 5 / 375px / 桌機截圖——無純黑死區、戰場邊界清楚。

### #3 活 title 背景（重用既有素材）

**檔案**：`render/main.ts`（入口拆分）、`witchrun.astro`（mount 流程 + title 樣式）

- **入口拆分**：`startWitchrun(canvas)` 重構為「mount 階段」與「begin 階段」：
  - mount：建 stage、載 textures、`BackgroundView`（跑 stage-1 捲動）、ember 粒子（輕量，floating 上升），啟動 RAF 只渲染背景＋粒子＋relayout，不跑遊戲邏輯。回傳 `{ begin(), destroy() }`。
  - begin：實際啟動 `WitchGame` 與輸入/HUD/碰撞迴圈。
- **astro 腳本**：頁面載入即 dynamic-import 並 mount（title 背後立刻是活鐘塔＋餘燼）；START / Enter / Space 呼叫 `handle.begin()`；`?autostart=1` → mount 後立即 begin（保 e2e 不變）。
- **美術點綴**：title overlay 內加入 `card-witchrun.webp` 作為氛圍剪影/插圖元素（CSS 定位、低透明度融入漸層），不只純文字。
- **手機垂直節奏**：`.witch-title` 在矮螢幕（`@media (max-height: 760px)` 等）收斂 `gap`/`padding`、調整對齊，避免重心偏低、頂部過空。

**驗收**：桌機 title 有活背景＋剪影不再空；Pixel 5 / 375px title 垂直分布平衡；START 後正常進遊戲；`?autostart=1` e2e 仍綠。

**風險**：此點動到載入/init 流程，是 4 點中回歸風險最高者。begin 拆分後要確保 e2e（`witchrun.spec.ts`、`games-hall.spec.ts`）與 autostart 全綠才算完成。

### #4 開局節奏提前

**檔案**：`src/scripts/games/witchrun/engine/stage.ts`（+ `stage.test.ts`）

- 每關第一波 `atMs` 由 `2000` 提前到 ~`700`；stage 1 另加一隻 ~`400ms` 前導 bat 製造即時張力。
- 不動敵種、不動 elite（45000–60000ms）、不動波次排序、波數仍 >5——既有 `stage.test.ts` 斷言全部維持綠。
- **TDD**：先加行為鎖定測試 `STAGES[1].waves[0].atMs < 1000`（紅 → 改 data → 綠）。

**驗收**：`npm run test -- --run src/scripts/games/witchrun/engine` 全綠（含新測試）。

## 實作順序與相依

1. **#4**（engine data + test，獨立、TDD）
2. **#1**（DOM/CSS，獨立）
3. **#2**（render relayout + BackgroundView resize）
4. **#3**（依賴 #2 的背景填滿與 BackgroundView；入口拆分，風險最高，最後做）

## 不做（YAGNI）

- 不做完整 attract mode（敵人/自動 AI demo）。
- 不改 `FIELD_W/H`、不改遊戲平衡或關卡敵種。
- 不新生成美術圖（重用既有 `card-witchrun.webp`）。
- 不碰其他 arcade 遊戲或全站樣式。

## 全域驗收（交付前）

- `npm run test -- --run src/scripts/games/witchrun/engine`：全綠。
- `npx playwright test tests/e2e/witchrun.spec.ts tests/e2e/games-hall.spec.ts --project=chromium`：全綠。
- `npm run build`：成功。
- production-like 靜態產物截圖（桌機 / Pixel 5 / 375px）：4 點皆改善，附 before/after。
- 4321 dev 驗收 URL：`http://localhost:4321/games/witchrun`。
