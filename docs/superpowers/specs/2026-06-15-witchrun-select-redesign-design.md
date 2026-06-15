# Witch Run 選角頁面重設計（電影檔案式）

**日期**：2026-06-15
**分支**：`feat/witchrun-character-select`
**前置**：選角系統 `2026-06-13-witchrun-character-select-design.md`

## 問題
現況選角是單一置中輪播（立繪卡＋名稱/流派/blurb/pips/dots/START），使用者回饋「很陽春」。

## 方向（使用者看 mockup 後選定：A 電影檔案式）
mockup：`public/assets/games/witchrun/_mockup/select-a.html`。套用範圍：**桌機＋手機**。

### 版面（桌機）
- **全幅背景**：選定角色立繪模糊＋壓暗＋流派色染（取代現有窄背景）。
- **頂列**：← BACK ／ 置中標題「CHOOSE YOUR WITCH」＋副標「詛咒鐘塔 · 選擇你的魔女」。
- **主舞台（左右）**：
  - 左：**框裱藝術卡**——選定立繪置於哥德角飾邊框內，外加流派色光暈＋暗角，底部角色名 caption。
  - 右：**檔案面板**——大名稱（流派色）、流派 pill、定位 blurb、分隔線、SPD/LIFE/POWER 長條、**招式雙卡（主射＋爆彈，含名稱與一句說明）**。
- **底列**：roster 4 縮圖（點擊切換、選定者流派色框＋浮起；取代現有 dots）＋ 大 START。
- 仍保留 ◄► 小箭頭（疊在藝術卡左右緣）供鍵盤/點擊切換。

### 版面（手機，直式）
垂直堆疊：標題 → 框裱藝術卡（置中，約 45vh）→ 名稱＋pill → stats → 招式雙卡 → roster 橫向 4 縮圖 → START。藝術卡左右仍有 ◄►。reduced-motion 時關閉光暈/過場動畫。

## 招式顯示資料
CharacterDef 已有 shotType/bombType；於 astro script 內建顯示名對應（不動 engine）：
- shot：balanced→穩定流／pierce→機關槍／fan→寬幅冰扇／chain→連鎖電
- bomb：inferno→爆炎 INFERNO／gust→陣風 GUST／freeze→冰封 FREEZE／storm→雷暴 STORM

## 實作
改寫 `src/pages/games/witchrun.astro` 的 `#witch-select` 區塊 HTML + CSS + `renderSelect()`：
- **保留所有現有 ID 與行為**：`#witch-select`/`#select-portrait`/`#select-name`/`#select-school`/`#select-blurb`/`#select-stats`/`#select-prev`/`#select-next`/`#select-confirm`/`#select-back`，以及 `--aura`/localStorage/cycle/begin 流程不變（**e2e 相依**）。
- `#select-dots` → 改為 `#select-roster`（同樣 data-i 點擊切換）。
- 新增 `#select-moves` 渲染招式雙卡。
- CSS 用 `:global()` 處理 runtime innerHTML 注入的節點（pips/roster/moves）。

## 驗證
- **e2e**：`witchrun.spec.ts` 須維持全綠（標題→選角→Frost→開局；保留 ID 即可）。
- **build**：綠。
- **視覺**：桌機 + 手機對 4399 逐角截圖肉眼驗收（4 角流派色染、招式正確、roster 切換、START 開局），URL 給使用者。
- 此為純表現層（HTML/CSS/DOM 綁定），以 e2e + 肉眼驗收取代單元測試。

## 不做（YAGNI）
不動 engine/角色數值/遊戲渲染/爆彈；不改 title 畫面；不加新角色。
