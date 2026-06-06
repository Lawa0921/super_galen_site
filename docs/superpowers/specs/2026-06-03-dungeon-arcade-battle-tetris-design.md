# Dungeon Arcade — 對戰俄羅斯方塊 設計文件

- **日期**：2026-06-03
- **狀態**：設計已通過，待寫實作計畫
- **作者**：Galen + Claude
- **專案**：SuperGalen's Dungeon（Astro 5 靜態站 / RPG 主題 / Vercel）

---

## 1. 目標與動機

在網站上新增一款「酷炫的對戰小遊戲」——可對戰的俄羅斯方塊。核心訴求：

- **不要用原生 HTML 排方格**：不用一堆 DOM `<div>` 拼盤面，而是用 Gemini 預先生成的美術素材（發光方塊、HUD 框、背景、特效精靈）在 WebGL 畫布上「貼」出整個遊戲。重的視覺（霓虹光暈、光束、勝利畫面）烤進素材，程式負責合成、粒子、震屏。
- **風格對標**：賽博 × RPG 地城霓虹，與站上「SuperGalen's Dungeon」主視覺一致。
- **純前端**：vs AI 與本機雙人皆不需後端伺服器，契合靜態 Vercel 部署。

### 視覺對標（已生成，存於 `docs/superpowers/specs/dungeon-arcade-mockups/`）

| 檔案 | 狀態 |
|---|---|
| `01-vs-intro.jpg` | 對戰開場 VS（兩側角色徽記 + 中央雷電 VS + BATTLE START） |
| `02-battle-active.jpg` | 對戰進行中（雙場並列、能量水晶方塊、HOLD/NEXT/分數 HUD、中央紅色攻擊計量條） |
| `03-combo-attack.jpg` | 大連擊攻擊（8 COMBO！T-SPIN！光束橫掃、碎塊飛濺、震屏） |
| `04-victory-ko.jpg` | 勝利 / KO（VICTORY 金光 vs DEFEAT 對手棋盤碎裂成像素） |

這 4 張即實作的視覺驗收基準。

### 介面組合對標（已生成，存於 `docs/superpowers/specs/dungeon-arcade-mockups/ui/`）

| 檔案 | 畫面 |
|---|---|
| `A-hall.jpg` | `/games` Dungeon Arcade 遊戲廳：中央 highlight 的 BATTLE TETRIS 卡 + 周圍 COMING SOON 鎖定卡 + 底部功能列（⚠️ 實作移除參考圖殘留的頂部 PLAYER 標籤） |
| `B-mode-select.jpg` | 模式選擇：左 VS A.I.（EASY/NORMAL/HARD）、右 LOCAL 2P |
| `C-battle-symmetric.jpg` | 對戰主版型（採用）：左右對稱等大雙盤，各 HOLD/NEXT/分數/名牌能量條，中央紅色垃圾計量條 |
| `D-battle-asymmetric.jpg` | 對戰聚焦版型（手機降級用）：自己大盤 + 對手右上小監視窗（含 INCOMING ATTACK） |

---

## 2. 範圍

### 包含（In scope）
- `/games`：Dungeon Arcade 遊戲廳入口頁（霓虹卡片牆，俄羅斯方塊為第一款，預留擴充）。
- `/games/tetris`：全螢幕遊戲頁，掛載 PixiJS app。
- 模式選擇：`vs AI`（難度 簡單 / 普通 / 困難）、`線上對戰`（房間配對）。
  - ~~本機雙人同鍵盤~~：**已移除**（2026-06-05）。共用鍵盤的 hotseat 操作體驗太尷尬；對戰核心（attack/match）保留，改由 vs AI 與線上承載對戰。
- 現代 Guideline Tetris 規則 + 對戰（垃圾行攻擊）機制。
- VS 開場、對戰、KO/結算 三畫面流程。
- **線上即時對戰**：WebRTC P2P 直連 + Vercel serverless 牽線（房間碼配對）；最後階段（Phase 6）建置。
- 桌機優先；MVP 為預設語言頁。

### 不包含（YAGNI，已砍 / 延後）
- 多回合 BO3 賽制。
- 手機雙人觸控對戰（兩盤面手機太擠）。
- BGM / 音效 → 列為 Phase 5 選配。
- `[lang]/games` 多語系路由 → 站上慣例後補。

---

## 3. 架構：邏輯與渲染分離

關鍵原則：**核心遊戲引擎為純 TypeScript、零 Pixi 依賴、全部單元測試（遵守 TDD）**；渲染層用 PixiJS，靠 dev server 人工驗收。

### 3.1 核心引擎（純 TS，可測）

目錄：`src/scripts/games/tetris/engine/`

| 模組 | 職責 | 對外介面（概要） |
|---|---|---|
| `constants.ts` | 盤面尺寸、SRS 資料、攻擊表、計分表 | 純常數 |
| `board.ts` | 盤面矩陣、碰撞偵測、消行 | `canPlace(matrix, piece, pos)`, `lockPiece()`, `clearLines(): number[]`, `insertGarbage(rows, holeCol)` |
| `piece.ts` | 七種方塊形狀、SRS 旋轉 + wall kick | `rotate(piece, dir): {cells, kicks}`, `spawnState(type)` |
| `bag.ts` | 7-bag 亂數，可帶 seed | `createBag(seed?)`, `next(): PieceType` |
| `game.ts` | 單人狀態機 | `step(dt)`, `input(action)`, `getState(): GameState`，事件：`onLineClear`, `onLock`, `onTopOut` |
| `scoring.ts` | 計分、等級、combo、B2B、T-spin 判定 | `score(clearInfo, state): number`, `detectTSpin(...)` |
| `attack.ts` | 消行→送垃圾行、combo/B2B 加成、垃圾佇列與抵銷 | `linesToGarbage(clearInfo): number`, `applyIncoming(queue, cleared)` |
| `match.ts` | 兩個 game 對接、攻擊交換、KO、VS 流程狀態機 | `state: 'intro'\|'playing'\|'result'`, `tick(dt)`, `getWinner()` |

`game` 與 `match` 皆**不直接觸碰 DOM/Pixi**，僅吐出可序列化的狀態與事件，供渲染層讀取。

### 3.2 AI 對手

目錄：`src/scripts/games/tetris/ai/`

- `bot.ts`：對「目前方塊 × 所有旋轉 × 所有欄位」枚舉終局落點，以啟發式評分挑最佳：
  - 特徵：aggregate height、complete lines、holes、bumpiness（標準 4 特徵；可選 Dellacherie）。
  - 困難度可選 1 塊預看（用 next piece）。
- 難度參數：
  - **簡單**：思考延遲長、偶爾選次佳、無預看、落速慢。
  - **普通**：中等延遲、無/淺預看。
  - **困難**：近最佳、快、用 next 預看、積極送攻擊。
- Bot 透過與玩家**相同的 move API**（left/right/rotate/softdrop/harddrop/hold）操作一個真正的 `game` 實例 → 公平、可被同一套測試覆蓋。

### 3.3 渲染層（PixiJS v8 + pixi-filters）

目錄：`src/scripts/games/tetris/render/`

| 模組 | 職責 |
|---|---|
| `PixiStage.ts` | 建立 Pixi Application、圖層、`AdvancedBloomFilter` 全域光暈、resize |
| `BoardView.ts` | 每幀依 `game` 狀態畫方塊（中性水晶精靈 + `tint` 上色）、ghost piece |
| `HudView.ts` | NEXT 佇列、HOLD、分數/等級、combo、中央攻擊計量條 |
| `Effects.ts` | 消行粒子爆裂、跨場攻擊光束、震屏、COMBO/T-SPIN 文字彈出、shockwave 環 |
| `Screens.ts` | VS 開場、VICTORY/DEFEAT 結算（對標 mockup ①④） |
| `main.ts` | 客戶端進入點：讀模式、建 match、接 input、驅動 render loop |

- 粒子用 Pixi v8 `ParticleContainer`（或 `@pixi/particle-emitter`，實作時定）。
- combo 數字、分數等動態文字用 Pixi `Text` + glow filter，不烤進素材。
- Pixi 僅在 `/games/tetris` 頁 **code-split 載入**，不進首頁 bundle。

### 3.3a 介面組合（已敲定）

- **對戰主版型＝C 對稱雙盤**（對標 `ui/C-battle-symmetric.jpg`）：vs AI 與本機雙人**共用同一版型**，雙方等大、對等公平。每盤元件：HOLD（左上）、NEXT 佇列（外側，3 塊）、SCORE/LEVEL、底部名牌＋能量條、ghost piece；中央為共用的紅色垃圾攻擊計量條。
- **手機 / 窄螢幕降級＝D 聚焦版型**（對標 `ui/D-battle-asymmetric.jpg`）：自己盤面放大為主、對手縮為右上小監視窗（含 HP 與 INCOMING ATTACK 警示）。
- **一套渲染邏輯、兩種排版**：`BoardView`/`HudView` 元件不變，由 `layout` 設定（`symmetric` / `focus`）依視窗寬度切換定位與縮放（CSS/Pixi resize 觀察斷點）。
- **遊戲廳 `/games`**＝A 版型；**模式選擇**＝B 版型。

### 3.4 Astro 頁面整合

- `src/pages/games/index.astro`：遊戲廳卡片牆。
- `src/pages/games/tetris.astro`：全螢幕容器 + `<canvas>`，以 Astro `<script>` import `render/main.ts`，交由 Vite 打包 Pixi。
- 沿用 `BaseLayout`、現有 i18n；遊戲內文字標籤用既有 client i18n manager（有則用，無則英文/通用符號）。

### 3.5 線上對戰架構（Phase 6）

**連線方式＝WebRTC P2P + Vercel Serverless 牽線**（靜態站無常駐後端，故用點對點直連 + 極小牽線層）。

- **牽線（signaling）**：一個 Vercel serverless function（`/api/signal`）只負責房間配對與交換 WebRTC offer/answer/ICE candidate；連線建立後即不再經過它。搭配免費公共 STUN 取得對外位址。少數嚴格 NAT 需 TURN 中繼，列為後續強化。
  - 房間以短碼（room code）建立/加入；牽線可用「短輪詢 serverless KV / Upstash」或 serverless 內的暫存配對通道實作（Phase 6 細部計畫再定）。
- **傳輸**：建立 `RTCDataChannel`（unreliable/ordered 視需求）傳遊戲訊息。
- **同步模型＝確定性鎖步（deterministic lockstep）**：雙方共用同一 `seed` 建立 `match`，**只交換離散輸入事件 + frame/tick 編號**，各自在本地用 Phase 1 的確定性引擎重演 → 頻寬極小、天然防作弊、不需傳整個盤面。
  - 需處理：開局 seed 協商、輸入延遲緩衝（input delay）、斷線/重連、對方頂出判定一致性。
- **角色**：建立房間者為 host（決定 seed 與開局時序），加入者為 guest；邏輯對等（非權威伺服器，因為是 P2P）。
- **重用**：直接重用 Phase 3 的 `match` 對戰核心與攻擊/垃圾邏輯；網路層只是「另一個輸入來源」，把遠端輸入餵進本地 `match`。

> 安全/隱私：牽線 function 不儲存對戰內容；房間碼短期有效。P2P 會暴露雙方 IP 給對方（WebRTC 特性），於說明中告知。

---

## 4. 美術素材清單（Gemini `nanobanana-image-gen`）

先產到 `tmp/`，驗收後移入 `public/assets/games/tetris/`。盡量用單張中性素材 + Pixi `tint` 降低數量、維持一致。

| 素材 | 說明 | 數量策略 |
|---|---|---|
| 地城霓虹背景 | 全螢幕 backdrop（對標 ②） | 1（對戰）+ 1（廳） |
| 能量水晶方塊 tile | 中性發光水晶 → tint 出 7 色 | 1 + 垃圾塊 1（裂紋灰） |
| 盤面框 / HUD 面板 | 全息霓虹框 → tint P1 青 / P2 洋紅 | 框 1 + 面板組 |
| 特效精靈 | 火花、碎晶、攻擊光束、shockwave 環、消行閃光 | 透明 PNG 數張 |
| 角色徽記 | 賽博武士 / 機甲（對標 ①） | 2 |
| 結算橫幅 | VICTORY / K.O. / DEFEAT 藝術字 | 3 |
| 遊戲廳卡片 | 俄羅斯方塊封面 | 1 |

---

## 5. 玩法規格（現代 Guideline Tetris）

- 盤面 10×20 可見（+ 上方緩衝列）。
- 7-bag 亂數。
- SRS 旋轉系統 + wall kick。
- Hold（每塊一次）、Ghost piece。
- 硬降（hard drop）、軟降（soft drop）。
- Lock delay（移動重置，有上限）。
- DAS / ARR 平滑移動。
- 標準計分：single/double/triple/tetris、T-spin 加成、combo、back-to-back。
- 單人模式有等級與重力加速；對戰模式重力固定或緩升。

### 對戰 / 攻擊規格
- 消行依**標準攻擊表**送垃圾行（single=0、double=1、triple=2、tetris=4，T-spin 變體更高，+combo、+B2B 加成）。
- 垃圾進對手中央佇列；延遲後從底部插入帶單孔列。
- **反殺/抵銷**：自己消行可先抵銷待入垃圾，超出才送出。
- **KO**：盤面頂出（無法 spawn）即落敗，對手勝。
- MVP 單局定勝負。

---

## 6. 操作

| 動作 | vs AI（1P） | 本機雙人 P1 | 本機雙人 P2 |
|---|---|---|---|
| 左 / 右 | ← / → | A / D | ← / → |
| 軟降 | ↓ | S | ↓ |
| 硬降 | Space | W | ↑ |
| 旋轉 CW | ↑ / X | E | `.` |
| 旋轉 CCW | Z | Q | `,` |
| Hold | Shift / C | LeftShift | RightShift |

鍵位集中定義於 `input/keymap.ts`，可調。

---

## 7. 測試策略（TDD）

### 單元測試（Vitest）— 覆蓋所有純引擎模組
- 碰撞與落地、消行（含多行）。
- SRS 旋轉與 wall kick（逐 kick 驗 offset）。
- 7-bag 分佈（帶 seed 可重現，驗每袋恰含 7 種）。
- 計分表、combo、B2B、T-spin 偵測。
- 攻擊計算（攻擊表）、垃圾插入與抵銷邏輯。
- AI 落點合法性與（帶 seed）可重現性。

### E2E（Playwright）煙霧測試
- 載入 `/games/tetris` → canvas 存在 → 開局 vs AI → 模擬按鍵 → 透過 `window.__tetrisDebug` debug hook 斷言狀態（行數、分數、是否仍在進行）。

### 渲染
- dev server 人工對標 4 張 mockup。

---

## 8. 分階段實作（每階段可獨立驗收）

1. **核心引擎（TDD，headless）**：constants/board/piece/SRS/bag/game/scoring。可純靠測試驗證。
2. **單人 Pixi 渲染**：掛 Pixi、方塊（tint）/盤面框/HUD/ghost/bloom/消行粒子；產核心素材 → `/games/tetris` 能單人玩。
3. **對戰層**（已完成）：`attack`/`match`、雙場、垃圾、中央計量條、攻擊光束 VFX、KO、結算 banner。（本機雙人 hotseat 在此階段做出後移除；引擎/渲染核心保留。）
4. **AI 對手**：`ai/bot` 啟發式 + 難度，接成對手側 → vs AI 對戰（重用對戰層雙盤渲染/攻擊/垃圾；人類用 1P 鍵位、對手側由 bot 驅動）。
5. **遊戲廳 + 收尾**：`/games` 卡片牆、模式選單、響應式 / 手機降級處理、音效（選配）、e2e、最終素材一輪。
6. **線上對戰**：`/api/signal` 牽線 serverless、WebRTC `RTCDataChannel` 連線層、房間碼建立/加入 UI、確定性鎖步同步（重用 Phase 3 `match`）、斷線處理。建立在 Phase 2–3 之上，故排最後。

---

## 9. 依賴與風險

- **新增依賴**：`pixi.js`（v8）、`pixi-filters`（bloom/glow）、可能 `@pixi/particle-emitter`。僅 `/games/tetris` 頁載入，code-split 不影響首頁。
- **新增後端面（Phase 6）**：Vercel serverless function `/api/signal`（牽線）；可能 Upstash/Vercel KV 暫存房間配對。WebRTC 用瀏覽器原生 API（免額外函式庫，或評估 PeerJS 簡化）。
- **風險**：
  - 視覺達不到 mockup 質感 → 緩解：重的光感烤進素材 + AdvancedBloom，程式只合成。
  - 手機雙板太擠 → MVP 桌機優先，手機 vs AI 單盤聚焦 / 提示最佳體驗在桌機。
  - SRS / 攻擊表正確性 → 用 TDD 鎖死，對照公開 guideline 數值。
  - 線上連線：嚴格 NAT 可能 P2P 失敗（需 TURN）；延遲/抖動 → 用 input delay 緩衝 + 確定性鎖步；斷線重連需明確 UX。P2P 會把 IP 暴露給對方，需告知。

---

## 10. 完成定義（MVP）

- `/games` 與 `/games/tetris` 可達，主視覺對標 4 張 mockup。
- vs AI（三難度）與本機雙人皆可完整對戰至 KO，含攻擊/垃圾/抵銷。
- 引擎單元測試綠燈、Playwright 煙霧測試綠燈。
- Pixi 不進首頁 bundle。
