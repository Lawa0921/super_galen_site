# Dungeon Bomber 連線對戰（Versus Online）設計

日期：2026-06-11
狀態：已與使用者確認設計，待實作

## 目標

為 `/games/bomber` 加入 2-4 人連線對戰：8 張美術各異的固定對稱競技場；
玩家透過遊玩累積 XP（等級，只升不降）並以勝負累積 Elo 牌位分（獨立 bomber 天梯）。

## 既定決策（與使用者確認）

| 議題 | 決定 |
|---|---|
| 人數/形式 | 2-4 人彈性房（房間碼 lobby） |
| 單場規則 | 經典生存戰：每人 1 命、last man standing、120s 後 sudden death |
| 地圖 | 8 張手工固定對稱佈局；箱位/道具由 seed 鏡像對稱撒佈 |
| 地圖美術 | 5 套現有生態區磚組＋3 套新主題（毒沼澤、黃金寶庫、月光庭園） |
| 牌位 | Elo 牌位（勝負）＋XP 等級（累積）雙軌；bomber 獨立天梯 |
| 角色 | 保留 4 角色＋專屬技能；對戰平衡：起始屬性統一表、技能冷卻 ×1.5 |
| 架構 | 方案 A：獨立 `VersusMatch` 引擎＋複用 tetris FFA 網路棧 |

## 架構總覽

```
src/scripts/games/bomber/
├── engine/            # 既有單機引擎（不動）
│   ├── blast.ts board.ts rng.ts characters.ts …  # versus 共用的原語
├── versus/            # 新：純 TS 對戰引擎（零 Pixi、全單測）
│   ├── arenas.ts      # 8 張固定佈局模板 + 主題綁定
│   ├── versusMatch.ts # VersusMatch：N 玩家規則核心
│   ├── suddenDeath.ts # 塌縮圈邏輯
│   └── types.ts
├── net/               # 新：連線層（仿 tetris net/ 模式）
│   ├── bomberLockstep.ts   # 固定幀 lockstep（輸入延遲制，仿 ffaLockstep）
│   ├── bomberTransport.ts  # WebRTC 傳輸（複用 signalClient + 8P 拓撲）
│   └── bomberRanking.ts    # 結算 claim 組裝（送 /api 共識回報）
└── render/            # 既有 render 擴充 versus 畫面（多玩家、塌縮圈、結算面板）
```

- 單機 `BomberGame` 完全不動；`VersusMatch` 與其共用 `engine/` 的
  `computeBlast`、`board`、`createRng`、`CHARACTERS` 原語。
- 網路與牌位後端複用 tetris 既有件：`/api/signal`（房間信令）、
  `/api/ffa-match` 模式（多方共識結算）、`rankStore`（Upstash）、
  `elo.ts` / `ffaElo.ts` / `progression.ts`（公式原樣）。

## Versus 引擎規則

- 玩家 2-4 人，各選角色（可重複）。出生於佈局模板的對稱出生點。
- **對戰平衡**：所有角色起始屬性統一（命 1、火力 2、炸彈 1、速度 1；
  上限沿用各角 caps 但 lives 鎖 1）；專屬技能保留、冷卻 = 單機 ×1.5。
- 軟箱道具：fire / bomb / speed / shield（**無 heart**）。shield 擋一次死。
- 死亡即淘汰（觀戰至場終）。最後存活者勝；全滅同幀 = 平局（無勝者）。
- **Sudden death**：120s 起外圈每 3 秒向內塌一圈（變實心牆），
  塌到的格上玩家即死；塌至中央 3×3 為止。理論場終上限 ≈ 135s。
- 引擎完全決定性：mulberry32(seed)，seed 由房主產生並廣播；
  輸入 = `{ held(dir,bool), bomb, ability }` 逐幀同步。

## 8 張競技場（arenas.ts）

字串模板（13×11）：`W` 實心牆、`C` 必箱、`?` seed 決定箱(50%)、`.` 地板、
`1-4` 出生點（2 人場用 1/2，3 人場用 1/2/3）。出生點佈局點對稱/軸對稱保證公平。
箱內道具由 seed 撒佈且按地圖對稱軸鏡像（雙方拿到等價資源）。

| # | 名稱 | 主題磚組 | 特色地形 |
|---|---|---|---|
| 1 | 石牢廣場 | 石牢（現有） | 經典柱陣、開闊中央 |
| 2 | 白骨迴廊 | 墓窖（現有） | 房室隔牆、雙走廊 |
| 3 | 熔火工坊 | 鍛造廠（現有） | 中央十字熱通道 |
| 4 | 寒冰天井 | 冰窖（現有） | 四象限、角落保險箱區 |
| 5 | 虛空祭壇 | 虛空（現有） | 環形祭壇、稀疏柱 |
| 6 | 毒霧沼澤 | **新：毒沼** | 蜿蜒泥路、密箱 |
| 7 | 黃金寶庫 | **新：寶庫** | 金磚陣、道具豐沛 |
| 8 | 月光庭園 | **新：庭園** | 對角花園、長直線對狙 |

新磚組製程沿用既有管線（floor/wall/crate 各 64px，192×64 條）；
每張地圖另配 2 個專屬地面裝飾（沿用 decor hash 佈點）。

## 網路層

- **信令/房間**：複用 `/api/signal` 與 `signalClient`，房間碼 5 碼。
  bomber 房間 key 加 `bomber:` 前綴避免與 tetris 房互撞。
- **傳輸**：複用 tetris 8P 的 WebRTC 拓撲（`ffaTransport` 模式）。
- **Lockstep**：`bomberLockstep.ts` 仿 `ffaLockstep`——固定 60fps 模擬、
  輸入延遲 3 幀、缺幀等待；房主廣播 `{seed, arenaId, players[]}` 開局。
- **斷線**：斷線者立即判死（名次=當下淘汰序）；剩 1 人即場終。

## 結算與牌位

- 結算走 **多方共識回報**（仿 `/api/ffa-match`）：每端送出名次 claim，
  過半一致才入帳；`SETTLED` 標記防重複計分。新增 `game: 'bomber'` 維度，
  rankStore key 前綴 `bomber:` ⇒ 與 tetris 天梯完全隔離。
- **Elo**：2 人場用 `elo.ts` 雙人公式；3-4 人場用 `ffaElo.ts` N-way。
  牌位階級沿用既有 tiers。
- **XP**：`progression.xpForMatch(players, placement, isWinner)` 原樣
  （參與 10＋名次獎勵 5×(人數-名次)＋勝利 25），等級只升不降。
- 身分：沿用 tetris 的玩家身分機制（錢包/訪客 id）。
- 結算畫面：名次表、Elo 變動（±）、XP 獲得與等級進度條、再戰按鈕。

## UI 流程

1. 選角畫面新增 **ONLINE** 入口（與 START 並列）。
2. Lobby：建房（顯示房間碼）/ 輸碼加入；房內顯示玩家列（角色頭像＋ready）；
   房主選地圖（8 張卡輪播，顯示主題縮圖）；全員 ready 即開局。
3. 對戰 HUD：各玩家角色頭像＋存活狀態；sudden death 倒數與塌縮警告。
4. 結算 → 再戰（同房重開）或回 lobby。
5. `/games/leaderboard` 加 bomber 分頁（沿用現有頁面元件）。

## 測試策略

- **引擎 vitest**：規則（淘汰/勝負/平局）、sudden death 塌縮時序與即死、
  道具對稱撒佈、技能在 versus 平衡表下的行為、
  **N 端決定性重放**（同 seed＋同輸入流 → 全端狀態 hash 一致）。
- **arenas**：8 張模板解析正確、出生點對稱性、連通性（flood fill）。
- **lockstep**：仿 tetris `determinism.test` —— 模擬延遲/亂序輸入下不 desync。
- **結算 API**：共識/衝突/重複回報路徑。
- **e2e**：雙頁籤建房-加入-對戰-結算 smoke（仿 `games-tetris-online.spec`）。

## 分期實作

- **P1 Versus 引擎＋8 競技場**：純 TS 全部規則＋地圖模板＋3 新磚組美術＋本機熱座驗證（同鍵盤雙人 debug 模式）。
- **P2 連線**：lockstep/transport/lobby UI，雙端實測。
- **P3 結算與牌位**：API、Elo/XP、結算畫面、排行榜分頁。

## 風險與緩解

- **WebRTC N 人連線穩定性**：直接沿用 tetris 8P 已驗證的拓撲與重連策略。
- **Desync**：引擎零 `Math.random`/`Date.now`（沿用單機紀律）＋狀態 hash 校驗幀。
- **平衡**：技能冷卻 ×1.5 為初版參數，上線後依數據調。
- **Upstash 環境**：需 `UPSTASH_*` env（tetris 已用，無新增依賴）。
