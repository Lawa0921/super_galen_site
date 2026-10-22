# DELVE（深掘）M1 實作計畫 — 網頁版泰拉風沙盒，單機核心循環

研究依據：`C:/Users/bag57/projects/super_galen_site/reports/網頁版泰拉瑞亞技術研究.md`（main worktree，未入庫）。
使用者選擇「直接開始做」，以下決策皆為 Claude 的預設，未經使用者逐條確認。

## 決策（Claude 的判斷）

- 名稱：**DELVE 深掘**，路由 `/games/delve`。刻意不用 Terraria 任何名稱、素材、道具名（版權/商標）。
- 技術：原生 TypeScript + **Canvas2D**，不裝任何新依賴（不用 Pixi/Phaser）。
- 分層（仿 witchrun/defense）：`src/scripts/games/delve/{engine,render,input,save}`；engine 純邏輯、無 DOM，可 vitest 測。
- 迴圈：**固定 60Hz 步長**（accumulator，frame dt 上限 250ms），渲染每 rAF 一次。
- 世界：固定大小 **1600×500 格**、16px/格、chunk 32×32；每層一個 typed array（fg `Uint8Array`、wall `Uint8Array`、variant `Uint8Array`）。
- 美術：程式產生像素材質（seeded 雜訊上色、每 tile 3 變體），不生圖檔；角色用程式繪製的像素小人。卡片圖用 playwright 截遊戲畫面轉 webp。

## M1 範圍

1. `engine/rng.ts`：xmur3 雜湊 + sfc32；`subSeed(seed, passName)`。
2. `engine/tiles.ts`：tile 定義表（id、名稱 zh/en、solid、hardness(挖掘秒數)、drop、lightEmit、lightBlock、color）。至少：air、dirt、grass、stone、sand、wood(樹幹,非實心)、leaves(非實心)、planks、copper_ore、iron_ore、torch(非實心,發光)、workbench。牆：dirt_wall、stone_wall。
3. `engine/world.ts`：World 類（width,height,fg,wall,get/set,inBounds,chunk dirty set、modified chunk set）。
4. `engine/worldgen.ts`：確定性生成（同 seed → 位元相同）：地表隨機漫步（Plateau/Hill/Dale 類型切換）、dirt→stone 分層、TileRunner（菱形筆刷隨機漫步）挖洞穴與灑礦、沙地、樹、地表下方填牆；回傳 spawn 點。
5. `engine/physics.ts`：AABB 分軸移動 vs tile，step-up 1 格、重力、跳躍、終端速度、每 tick 子步避免穿透。
6. `engine/lighting.ts`：泰拉式兩輪可分離掃描（每輪：每欄下→上、上→下，每列左→右、右→左；空氣乘 0.91、實心乘 0.56，<0.0185 停止），光源：天空光（地表以上、無前景且牆空的格）、火把；只算視窗+28 格外框；輸出 Float32Array。日夜循環調整天空亮度（10 分鐘一天）。
7. `engine/inventory.ts`：40 格背包、前 10 格為快捷欄、堆疊上限 999；`engine/crafting.ts`：配方——徒手：1 wood → 4 planks、1 wood → 3 torch、10 planks → 1 workbench；需在 workbench 4 格內：5 planks + 8 copper_ore → copper_pickaxe（挖掘速度 ×2）、5 planks + 8 iron_ore → iron_pickaxe（×3，且才能挖 iron_ore）。初始背包：木鎬（基礎速度）、10 torch。
8. `engine/game.ts`：DelveGame：step(dtFixed)、玩家輸入狀態、挖掘（按住游標格累積進度，觸及距離 6 格）、放置（不可放在玩家身體上、需鄰接實心或牆）、掉落直接進背包、事件佇列（mine/place/craft）。`getState()` 給 e2e。
9. `save/`：存「seed + 生成器版本 + 被修改 chunk 的 fg/wall 內容 + 玩家位置/背包」；CompressionStream gzip（不支援就不壓縮）；IndexedDB；每 30 秒與 pagehide 自動存；`navigator.storage.persist()`；匯出/匯入 .delve 檔按鈕。序列化/反序列化與 diff 邏輯要單元測試（IndexedDB 部分可薄封裝不測）。
10. `render/`：chunk 離屏 canvas 快取＋dirty 重畫（每幀最多重畫 N 個）、簡易接邊（4 鄰 bitmask 邊緣描暗/草邊）、背景天空漸層與視差山、光照圖畫到小 canvas 後放大（imageSmoothing 開）以 multiply 疊加、玩家、挖掘裂痕、游標框、HUD（DOM 快捷欄＋背包/合成面板，按 E 開關）。`devicePixelRatio` 上限 2。
11. `input/`：鍵盤 A/D 或方向鍵移動、Space/W 跳、1–0/滾輪換格、滑鼠左鍵挖/用、右鍵放置；觸控：`touch-action:none`、左側虛擬搖桿、右側跳躍鈕、點畫面格子＝對該格「挖或放」（依手上物品：手持方塊就放、否則挖），用 Pointer Events。
12. 頁面 `src/pages/games/delve.astro`：BaseLayout、標題畫面（新世界/繼續/匯入）、canvas `#delve-canvas`、`window.__delveDebug = { game }`。scoped style、禁 `!important`、禁行內樣式。
13. 遊戲廳 `src/pages/games/index.astro` 加卡片；`public/assets/games/delve/card-delve.webp`；`tests/tooling/seo-build.test.mjs` sitemap 數 222→223（以實際為準）。
14. e2e `tests/e2e/delve.spec.ts`（chromium）：頁面載入→開始→`__delveDebug.game` 存在；同 seed 世界一致；用 debug API 挖一格後背包增加；存檔→重新整理→繼續後修改仍在；遊戲廳連結可點。

## 不做（延後）

敵人/戰鬥/Boss、液體、生態區、多人連線、BGM、無限世界、電路。

## 完成判準

- TDD：engine 與 save 模組先寫失敗測試。
- `npx vitest run` 全套綠；`npx playwright test tests/e2e/delve.spec.ts --project=chromium` 綠；`npm run build` 成功（含 seo-build 測試若有對應指令）。
- 實跑截圖確認畫面正常、桌機 60fps 量級（記錄 debug 量到的平均 frame ms）。
