# Dungeon Defense（塔防）

**日期**：2026-06-16　**分支**：feat/tower-defense（自 master）
**定位**：Dungeon Arcade 第 4 款。固定路徑、輕鬆休閒塔防、像素風（畫風對齊使用者指定的 TBH，截圖到位後再產素材）。

## 範圍（ponytail：最小可玩，先做核心迴圈）
- **1 張地圖**：地城蜿蜒固定路徑（waypoints），敵人入口→封印門；路徑旁固定建塔格。
- **4 塔**：弩箭(快/單體)、炸彈(慢/AoE)、冰霜(減速)、奧術(高 DPS)。各可升 1 級。
- **4 敵**：史萊姆(基本)、骷髏(高血)、蝙蝠(快)、Boss(每數波一隻、大血量)。全地面。
- **12 波**遞增；殺敵得金幣＋過波獎勵；封印門 20 HP，破門 = Game Over；清 12 波 = Win。
- **操作**：點/觸控建塔格→建塔/升級選單；放置顯示射程圈；按鈕開始下一波。

## 架構（沿用 arcade pattern）
`src/scripts/games/defense/{engine,render,input,audio}`、`src/pages/games/defense.astro`、index.astro 加卡、`public/assets/games/defense/`。
- **engine（純函式、TDD、確定性，無 RNG）**：`step(dtMs)` 推進。
  - path：waypoint 陣列；`advanceAlongPath(pos, dist)` 純函式。
  - enemies：hp/speed/gold/pathT/alive；沿 path 走，到門 → 扣門 HP。
  - towers：slot/type/level/range/fireCdMs/dmg/effect；鎖定範圍內最前敵（純函式 `pickTarget`），開火生 projectile。
  - projectiles：飛向目標扣血；炸彈 AoE、冰霜加 slow debuff。
  - economy：gold；買/升塔扣錢。base HP。status：building/wave/won/lost。
  - waves：12 波資料表（種類/數量/間隔）。
- **render（Pixi）**：path tile、towers、enemies、projectiles、range ring、HUD（gold/HP/wave/開波鈕）。**Phase 1 用程式繪製圖形可玩；Phase 2 換像素 sprite（TBH 風）**。
- **input**：tap 建塔格→選單；audio 用既有合成 SFX pattern。

## 驗證
engine 純邏輯 TDD（移動/鎖定/開火/AoE/減速/經濟/勝負）；e2e（載入→建塔→開波→殺敵→勝/負）；build 綠；4399 肉眼。

## 不做（之後再加）
迷宮自建、空中分流、多地圖、無限模式、連線排行、塔的多分支升級樹。
