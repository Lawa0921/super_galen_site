# Witch Run 角色手感層重做（連射／子彈／動畫）

**日期**：2026-06-15
**分支**：`feat/witchrun-character-select`
**前置**：[2026-06-14-witchrun-character-movesets-design.md](2026-06-14-witchrun-character-movesets-design.md)

## 問題（使用者驗收回饋）

1. **連射速度都一樣**：間隔 Mira=Volt 皆 100ms、Gale 60ms、Frost 140ms——差異小且兩角相同，整體都像同一條點點流。
2. **子彈效果都一樣**：4 角共用同一顆 3px 圓點紋理（`circleTex`），只有 tint 顏色不同，形狀/效果無別。
3. **in-game sprite 廉價**：以原生尺寸（~25–32px 寬）直接畫、無放大、靜止不動。

## 目標

讓 4 角在「連射手感／子彈外觀／在場動態」三層都明顯不同，且不無趣。立繪、爆彈、OVERDRIVE、敵彈系統不動。

## 設計

### A. 連射 4 原型分化（engine, TDD）

拉開「間隔／密度／型態」三軸：

| 角色 | 原型 | 間隔(非OD) | 型態 |
|---|---|---|---|
| GALE | 機關槍 | 50ms（最快） | 單列細針、低傷(×0.7)、穿透 |
| MIRA | 穩定流 | 100ms | 平行 power 線、均衡 |
| VOLT | 連鎖電 | 110ms | 中速，命中跳最近敵＋可見電弧 |
| FROST | 霰彈 | 190ms（最慢） | 寬幅冰扇 power+2 枚、單發高傷(×1.3) |

關鍵：間隔序 50 < 100 < 110 < 190 明顯可辨，Mira≠Volt。OD 時一律 /2（維持現行）。

**測試（movesets.test.ts 擴充）**：
- 4 角開局首發間隔 `fireCdMs` 落在預期區間且兩兩不同（Gale<Mira<Volt<Frost）。
- 既有型態斷言（pierce/fan/chain/balanced）維持綠。

### B. Volt 連鎖電弧可見化（engine 事件 + render）

- engine：chain 子彈命中跳轉時，於 `events` 推 `{ kind:'chainArc', x1,y1,x2,y2 }`（from=命中點，to=跳轉目標）。
- **測試**：以兩隻相鄰敵造局，Volt 子彈命中後該 tick 事件含 `chainArc` 且座標對應兩敵。
- render：新增繪製邏輯，收到 `chainArc` 畫一道短暫（~120ms）閃電線，沿用 Volt 流派色。

### C. 各角專屬像素子彈（asset + render）

生成 4 張像素子彈圖（透明底，約 8–16px）：

| 角色 | 外觀 |
|---|---|
| MIRA | 圓火球＋細星芒 |
| GALE | 直立細長針/光矛 |
| FROST | 冰晶菱形＋閃光 |
| VOLT | 鋸齒雷花 |

- 檔名 `bullet-player-${id}.png`，置於 `public/assets/games/witchrun/`。
- `assets.ts`：`playerBullet` 由 `circleTex(...)` 改為載入 `bullet-player-${characterId}.png`；載入失敗時 fallback 回 `circleTex`（保底，不讓遊戲掛掉）。

### D. 角色 idle 動畫（asset + render）

- 每角生成 **idle sprite sheet（4 影格橫排）**，細微待機動作：MIRA 火焰搖曳／GALE 風板浮動／FROST 冰晶微旋／VOLT 雷電劈啪。
- 檔名 `player-${id}-idle.png`（橫排 4 格，等寬切片）。
- `assets.ts`：載入 sheet 切成 `playerFrames: Texture[]`；若 sheet 不存在則退回單張 `player-${id}.png` 包成單格陣列。
- `EntityView`：以累積 dt 切換影格（6–8fps），自機 `scale` 設約 **1.35×** 提升可讀性。
- ⚠️ 風險：4 影格一致＋逐格乾淨去背為最難點。漂移嚴重時降為 **2 影格**（呼吸/浮動）仍達「會動」。

## 驗證

- **engine**：`movesets.test.ts` 全綠（連射間隔、型態、chainArc 事件）。
- **build / e2e**：`npm run build` 綠、`witchrun.spec.ts` e2e 綠。
- **美術**：對 4399 dev server 逐角截圖肉眼驗收（idle 會動、子彈各異、Volt 電弧可見），URL 給使用者。

## 不做（YAGNI）

立繪、爆彈分化、OVERDRIVE、敵彈系統、選角 UI 皆不動。
