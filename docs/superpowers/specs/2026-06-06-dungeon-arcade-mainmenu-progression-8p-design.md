# Dungeon Arcade — 主選單 / 進度系統 / 8 人大亂鬥　設計文件

- 日期：2026-06-06
- 範圍：俄羅斯方塊（`/games/tetris`）主選單改版、XP 等級 + 名次制競技積分、最多 8 人大亂鬥線上對戰、私人房 + 公開快速配對、共識 + replay 抽驗防作弊。
- 前提（不可違反）：**不爆帳單** — P2P 直連、無 TURN、無常駐權威遊戲伺服器；Upstash Free / Vercel Hobby 不綁卡（硬上限）；KV 短 TTL／rate limit／ZSET 截斷。

## 1. 現況（已完成、本設計的基礎）

- 引擎 `src/scripts/games/tetris/engine/`：SRS、7-bag、計分、T-spin、attack（垃圾行）、確定性（mulberry32 seed）。
- 渲染：PixiJS v8 像素 + CRT。模式：SOLO、vs AI（easy/normal/hard）。
- 線上 `src/scripts/games/tetris/net/`：1v1 確定性鎖步（`Lockstep`）、`signalStore`、`rankStore`、`elo`（1v1 ELO + 段位）、`auth`（錢包簽章）、`ranking`（雙方一致才入帳）。
- API：`/api/signal`（建房 + offer/answer 中轉）、`/api/match`（簽章驗證 + rate limit）、`/api/leaderboard`。
- 雲端：Upstash for Redis（Free）已建並連到 Vercel 專案，注入 `KV_REST_API_*`；`getSignalStore`/`getRankStore` 兩種命名相容。已雲端驗證牽線 + 排行榜往返。

## 2. 鎖定決策

| 項目 | 決定 |
|---|---|
| 8 人對戰模型 | 大亂鬥（各自模擬 + 垃圾行攻擊，P2P，2–8 人，最後存活者勝） |
| 等級 | XP 等級（只升不降）**＋** 名次制競技積分（會升降，進排行榜）。訪客皆無、可玩不記。 |
| 防作弊 | 名次需房內多數簽章玩家一致簽署 → 後端 `/api/match` 以 seed + 輸入 replay 抽驗自身盤面 → 攻擊事件規則上限 |
| 房間流程 | 私人房（房主開始）**＋** 公開快速配對佇列 |
| netcode 拓樸 | **星狀中繼**（房主與每位 guest 各一條連線、轉發小事件）。理由：signaling 簡單、每瀏覽器連線數少、事件量小房主負擔輕。代價：房主離線該局結束（v1 可接受）。階段 3 實作時可再評估全網狀。 |

## 3. 架構

### A. Tetris 主選單

進 `/games/tetris` 顯示全螢幕像素/CRT 主選單（延續現有 mode-select 視覺與招牌切換動畫），三分頁：

- ▶ **PLAY**：SOLO／vs AI（easy/normal/hard）／線上（建房·加房·快速配對）。沿用現有 `?mode=` deep-link。
- 🏆 **LEADERBOARD**：內嵌排行榜，資料取自 `/api/leaderboard`（欄位：名次、暱稱、等級、段位、積分、場數/勝/前三）。獨立 `/games/leaderboard` 頁保留為可分享的深連結，與內嵌共用同資料來源。
- 👤 **PROFILE**：登入（錢包簽章）玩家顯示等級（XP 進度條）、競技積分、段位、戰績（場數/勝/前三次數）。訪客顯示「🦊 連錢包以建立檔案」CTA，且明確標示訪客無等級/積分。

無 `!important`、無行內樣式；沿用 `Press Start 2P` 像素字。`prefers-reduced-motion` 降級。

### B. 等級與積分（純函式，TDD）

只對「錢包簽章」玩家累積；訪客一律不寫入。

**XP / 等級**（`progression.ts`）
- 每場 XP：`xp = 10（參與） + 5 * (N - placement) + (winner ? 25 : 0)`（N=人數，placement 1=冠軍）。
- 等級曲線：`levelForXp(totalXp)` 為純函式、單調遞增。採三角數門檻：累計到第 L 級所需 XP = `50 * L * (L - 1)`（L≥1）。`levelForXp` 回傳滿足門檻的最大 L。
- 只升不降（XP 永遠累加）。

**競技積分**（擴充 `elo.ts` 成 FFA 廣義 ELO）
- N 人一場，玩家 i 對每位對手 j：實得 `S_ij = 1`（i 名次優於 j）/`0`（劣於）/`0.5`（同名次，不會發生但保留）。
- 期望 `E_ij = expectedScore(Ri, Rj)`（沿用現有函式）。
- 更新：`Ri' = Ri + K * Σ_j (S_ij - E_ij) / (N - 1)`，K=32。
- N=2 時即退化為現有 1v1 ELO（向後相容）。段位 `tierFor` 不變。

**資料模型**（擴充 `rankStore`）
- `player:{addr}` → `{ addr, name, xp, level, rating, games, wins, top3, updatedAt }`
- 排行榜 ZSET `lb`：score = `rating`，member = `addr`，截斷上限 1000（沿用）。
- `getPlayer/setPlayer/topPlayers` 擴充以攜帶上述欄位（目前只存 rating + W/L）。

### C. 8 人大亂鬥 netcode（星狀中繼）

- 每位玩家本機跑**自己的**盤（各自 seed/輸入）。清行 → 依目標策略送垃圾行；最後存活者勝。**不需跨 peer 確定性同步**。
- 只傳輸：
  - `attack`：`{from, to, lines, ts}`（垃圾行攻擊）
  - `state`：`{from, alive, height, ko, placeHint}`（節流的狀態摘要，供 UI/鎖定目標）
  - `seed`：開局各自 seed 交換（用於後端 replay 抽驗）
  - `result`：個人結算（KO 時間、清行數、送出垃圾）
- 目標策略 v1：隨機存活對手（之後可加「最高/被攻擊最多」）。
- 名次判定：被 KO（top-out）順序由後往前排名次；最後存活 = 1st。房主彙整名次。
- 拓樸：**星狀** — 房主 ↔ 每位 guest 各一條 RTCDataChannel；房主轉發事件給其他人。事件量小（非每幀）。
- 斷線：guest 離線即視為該玩家 KO（排在當下最後）；房主離線則該局結束（v1 限制）。
- 帳單：P2P 直連、無 TURN，僅免費公共 STUN。極嚴格 NAT 少數連不上 = v1 已知限制。

### D. 房間 / 配對

**私人房**：房主建房得房號 → 他人輸房號加入（2–8）→ 房主按「開始」。`signal` 擴成多 slot（房主 offer / 每位 guest answer + ICE 中轉）。

**公開快速配對**：玩家按「快速開始」進公開佇列。Upstash 短 TTL presence key（`mm:{id}` TTL ~15s 需心跳續期）+ 倒數；湊滿 8 人或倒數結束就開局，指定其中一人為房主。防濫用：presence TTL 短、佇列大小上限、`/api/matchmake` per-IP rate limit。

### E. 防作弊

1. **用戶端事件驗證**：收到的 `attack` 依規則驗證（每次清行可送垃圾上限、頻率上限），不合理即丟棄。
2. **結算共識**：最終名次需房內「多數已簽章玩家」簽署一致（沿用 `auth` 簽章；FFA 版本對「名次陣列」簽署），多數一致才送後端。單一作弊者無法假造名次。
3. **後端 replay 抽驗**：玩家提交自己這局的 `seed + 輸入 log`；`/api/match` 以引擎重模擬該盤，確認宣稱的清行/分數可由 seed+輸入重現，不符則拒絕入帳。重模擬在 serverless（偶發、低頻），在免費額度內。
4. 沿用 rate limit、TTL、ZSET 截斷。

### F. 帳單安全（貫穿全設計）

- 對戰流量 P2P 直連，不經伺服器；無 TURN。
- 無常駐遊戲伺服器；後端只有偶發的 serverless（牽線、配對、結算/抽驗）。
- Upstash Free / Vercel Hobby 不綁卡 = 硬上限只 throttle 不扣款。
- presence/slot 短 TTL 自動過期、ZSET 截斷 1000、per-IP rate limit。

### G. 測試策略（TDD）

- 純函式：`progression`（XP/等級）、FFA ELO（名次積分）、名次判定 — 單元測試。
- netcode：mock transport 多 peer，測事件路由（星狀轉發）、垃圾路由、KO/名次判定、斷線降級。
- 防作弊：後端 replay 抽驗（合法 replay 過、竄改 replay 拒）、共識（多數一致才入帳、少數作弊被擋）。
- e2e：Playwright 多 context — 先 2–3 context 驗大亂鬥連線 + 名次 + 排行榜寫入；視資源再試更多。

## 4. 四階段路線圖

1. **階段 1：主選單 + Profile/等級 UI + 排行榜內嵌**（UI/資料層；先用現有 1v1 線上產生資料）。風險低、立即有畫面。
2. **階段 2：名次制積分 + XP + 後端 replay 抽驗 + 共識簽署**（積分/防作弊核心，純函式 + 後端）。
3. **階段 3：8 人大亂鬥 netcode（星狀中繼）+ 私人房 2–8 + 攻擊路由/名次判定**（最大、最難的網路重構）。
4. **階段 4：公開快速配對佇列**（額外基建，最後做）。

每階段各自 spec → plan → 實作 → 可單獨上線。

## 5. 階段 1 詳細 spec（先做）

**目標**：把 `/games/tetris` 的入場畫面從「模式按鈕」升級為三分頁主選單，並讓玩家看得到自己的等級/積分與內嵌排行榜。此階段**不改 netcode**，沿用現有 1v1 線上產生 profile/排行榜資料。

**範圍內**
- 主選單三分頁 shell（PLAY / LEADERBOARD / PROFILE）+ 分頁切換動畫；PLAY 分頁沿用現有 SOLO/AI/online 入口與面板。
- PROFILE 分頁：已簽章 → 讀 `player:{addr}` 顯示等級（XP 進度條）/段位/積分/戰績；訪客 → 「連錢包以建立檔案」CTA + 明示無資料。
- LEADERBOARD 分頁：取 `/api/leaderboard`，顯示名次/暱稱/等級/段位/積分/戰績；空狀態與載入狀態。
- 資料模型擴充：`rankStore` 的 `PlayerRecord` 與 `getPlayer/setPlayer/topPlayers` 加上 `xp/level/games/wins/top3`（向後相容預設值）；`progression.levelForXp` 純函式 + 測試。
- **XP 寫入接線**：在現有 1v1 結算入帳路徑（`ranking`/`/api/match`）順帶呼叫 `progression.xpForMatch`（N=2）累加 `xp` 並重算 `level/games/wins/top3`，使 PROFILE/LEADERBOARD 顯示的是真實資料。名次制競技積分的改寫仍留待階段 2（此階段 rating 沿用現有 1v1 ELO）。
- `/api/leaderboard` 回傳擴充欄位（名稱/等級/段位）；`/api/profile?addr=`（GET）回單一玩家檔案（找不到回空檔）。

**範圍外（留待階段 2+）**：名次制積分計算改寫、replay 抽驗、共識、8 人 netcode、快速配對。階段 1 的積分/XP 寫入沿用現有 1v1 `ranking`（之後階段 2 換成 FFA 版）。

**元件邊界**
- `progression.ts`（純函式：`xpForMatch`、`levelForXp`、`levelProgress`）— 無 IO，可單測。
- `rankStore` 擴充（資料層；MemoryRankStore + UpstashRankStore 同步擴充）。
- `/api/profile`（薄 handler，呼叫 `getRankStore().getPlayer`）。
- 主選單 UI（`tetris.astro` + 對應 TS；分頁切換、profile 渲染、leaderboard 渲染）。

**驗收**
- 單元測試：`progression` 綠；`rankStore` 擴充欄位往返綠。
- 本機：訪客進選單三分頁可切換、PROFILE 顯示 CTA、LEADERBOARD 顯示（空或現有資料）。
- 連錢包後 PROFILE 顯示等級/積分（用既有或測試資料）。
- 不破壞既有 SOLO/AI/1v1 線上與既有 e2e。

## 6. 風險與未決

- 星狀中繼房主離線 = 該局中止（v1 接受；階段 3 可評估全網狀或房主遷移）。
- 8 context Playwright 資源吃重，e2e 先以 2–3 context 驗證，8 人靠單元 + 手動。
- replay 抽驗需引擎可在 serverless 重跑（純 TS，無瀏覽器相依）— 需確認 engine 不依賴 DOM/Pixi（目前 engine 與 render 分離，應 OK，階段 2 驗證）。
- 名次制 ELO 取代 1v1 ELO 時的資料遷移：沿用同一 rating 欄位，平滑。
