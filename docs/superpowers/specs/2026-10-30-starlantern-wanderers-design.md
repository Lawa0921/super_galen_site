# 星燈迷宮：地圖上的可見強敵（徘徊者，Wanderers）設計

日期：2026-10-30
狀態：**草案第一版**。使用者選了這個系統（世界樹迷宮的 FOE）；控制者定了方向（§0 標【控制者】的條目），其餘由設計者裁定，控制者審閱時可以改。只有 §13 的事要找使用者。
實作計畫：`docs/superpowers/plans/2026-10-30-starlantern-wanderers.md`（下稱「計畫」）。
起因：
- 迷宮裡現在看得見的危險只有遇敵燈；精英、守關者、救援房是**站著不動的格子**，踩上去才開戰。玩家在一層裡能主動選擇的只有走哪條路，而「走哪條路」沒有理由。
- 使用者的方向：「先把遊戲本身做好」；平衡不是優先（`starlantern-balance-not-priority`），但不能有漏洞。劇情暫停：只寫中性的系統文字。
- 採集（#353–#357）與公會都已上線；本文照採集的開關、鹽、`Run` 旗標與證據的做法接上。

依據（皆已讀過，2026-10-30 在 `origin/master` `699294841`）：
- 文件：採集 spec／計畫全文（格式、證據、開關、鹽）、公會 spec／計畫的開關與 `withGuildOff`、名冊 spec 的守關者（§5.5、裁定 10）、roguelike 地城與 difficulty spec。
- 程式：`engine/dungeon/{gen,rooms,run,gather}.ts`、`engine/encounter.ts`、`engine/game.ts`（`depart`、`move`、`walk`、`stepMod`、`startBattle`、`submitRound`、`battleGear`、`battleRunes`、`wipe`、`revealHere`）、`engine/battle.ts`（逃跑）、`engine/scaling.ts`（`scaleEnemy`、`ELITE`）、`engine/events.ts`（`eliteGroup`）、`engine/loot/drops.ts`、`engine/map.ts`、`engine/testing.ts`、`engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`、`engine/gather.walk.test.ts`、`engine/balance.roster.test.ts`（22i）、`data/{monsters,monsters.test,gather,guild,conditions}.ts`、`render/{markers,MapView,fog}.ts`、`ui2/minimap.ts`、`ui2/scenes/dungeon.ts`、`ui2/debugGather.ts`。
- 字型：本文所有新字（巡、守、追、強敵與 §8 的句子）2026-10-30 以 `data/woff2Cmap.ts` 對 Cubic 11 量過，全部在字型裡。

**標記說明**（照採集 spec）：【控制者】已定；【設計裁定】本文的決定，附一行理由；【起始提案】數字的起點，平衡照「量一次、紅了具名例外」處理。

> 沒有以 `docs/`、`scripts/`、`src/styles/`、`tests/`、`art-factory/`、`public/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。行號只供定位。

---

## §0 定案（和下文衝突時以本節為準）

1. **是什麼**：第 4 層起，每層有幾隻強敵畫在地圖上（看見之後）。隊伍每走一步，牠們走一步（回合制，沒有即時）。三種行為：**巡邏**（沿固定的路線來回）、**看守**（站著不動）、**追蹤**（隊伍靠近就追，追丟了回原位）。隊伍撞上牠、或牠走進隊伍的格子，就和牠開戰。【控制者＋設計裁定】
2. **為什麼在乎**：躲得開，繞路就是策略；打贏給稀有的報酬（§5.5），而且這一趟這一層牠不會再出現。【控制者】
3. **一步只發生一件事**：徘徊者只在隊伍的移動結果是 `moved`（一般的一步、沒有遇敵、沒有事件；採集點照一般的格子算）之後行動；踩到事件格（寶箱、陷阱、泉水、商人、回憶光點、樓梯、入口⋯⋯）、撞牆、或這一步遇敵開戰時，牠們這一回合不動。所以接觸與隨機遇敵、事件、固定戰鬥**永遠不會在同一步發生**。【設計裁定】理由：`walk()` 的註解「Event tiles never come through here, so one step triggers one thing」（`engine/game.ts:484`）已經是遊戲的規則；接受的殘留：踩事件格那一步是「免費的一步」。
4. **開關**：`WANDER_LIVE`（`data/wander.ts` 的 `WANDER_SWITCH.live`，PR C 之前是 `false`）。所有讀寫只認 `wanderOpen(s) = WANDER_SWITCH.live && WANDER_SWITCH.open(s)`，`open` 預設 `s.story.act1Cleared`（和公會同一個時點，`data/guild.ts:16`）。關著或還沒打開：沒有徘徊者、`move()` 走的每一行和今天相同、存檔與所有快照逐位元相同。【控制者】
5. **出發時決定**：`depart()` 在 `wanderOpen` 時給這一趟 `Run.wander = true`（不存檔），**緊接在採集那一行之後、`this.map()` 生成出發層之前**（`engine/game.ts:342-356`）。`newRun` 不設它，所以不經過 `Game.depart` 的 `Run`（樓層快照、sim）永遠沒有徘徊者。【設計裁定】
6. **鹽**：`WANDER_SALT = 0x3956c25b`（SHA-256 的第五個輪常數 K[4]；K[0]–K[3] 是 `WARDEN_SALT`、`TROPHY_SALT`、`GUILD_SALT`、`GATHER_SALT`）。加進 `data/monsters.test.ts` 的 `salts are distinct`。實作時 K[4] 若已被用掉，取下一個沒用的 K[i]，同一個 PR 改回本條。【控制者】
7. **放置：最後一步、自己的串流、不寫樓層**：`floorOf()` 在 `placeGather` 之後多一行，用 `mulberry32(floorSeed ^ WANDER_SALT)`，把結果寫進 `run.wanderers[depth]`。**它只讀樓層、不改任何格子或 `contents`**，所以開關打開時，樓層的地圖與內容也逐位元等於今天（比採集更強：不用「去掉點再比」）。【控制者＋設計裁定】
8. **移動不抽亂數**：每一步的去向是位置與狀態的純函式（§5.3）；放置以外不抽任何串流，**永遠不抽 `game.rng`**。只有真的接觸開戰時，戰鬥照既有規則抽 `game.rng`。所以「開著但從沒接觸」的一趟，每一條串流的抽取都和今天相同（§5.6 的證據）。【控制者】
9. **一層幾隻**（§6.1，【起始提案】）：第 1–3 層 0、4–9 層 1、10–19 層 2、20–39 層 3、40 層起 4；**頭目層（每 5 層，以及本道第 3 層）0**；一個房間最多一隻；放不下就少放，不補。入口房、出口房、有精英／守關者／救援的房間不放，徘徊者也走不進去。【控制者＋設計裁定】
10. **不堵唯一的路**：放置時，把所有看守與追蹤的原位、所有巡邏路線的格子當成牆，入口到下樓梯仍要走得通；走不通的那一隻不放（不重抽）。計畫 A2 以抽樣測試證明（§5.2）。【控制者】
11. **是誰、多強**（§6.2）：徘徊者是**守關者**（名冊的 11 位，都有戰鬥圖），**單獨一隻**、走精英的路（`scaleEnemy(..., elite = true)`：HP ×2.2、攻擊 ×1.3、報酬 ×3，`engine/scaling.ts:109-110`）、照這一趟的難度（`fightTier`）。本道是本道的五位，地區是自己的守關者加本道的五位，各有起始深度。強度只有這一條公式，不加旋鈕；計畫 A4 量一次，紅的格子照 §6.3 處理，不卡上線。【控制者＋設計裁定】
12. **報酬**（§5.5）：照**精英**的發法（裝備一件、稀有素材、符文照精英那一列），稀有素材 ×`WANDER_RARE_QTY = 2`（同一種，不多抽）；不給回憶碎片（照守關者，`engine/game.ts:915-916`）；好感的「強敵」點數照精英給。沒有新道具、沒有新圖。【控制者＋設計裁定】
13. **遇敵計量**：徘徊者走路不碰計量；接觸不經過 `walk()`，不加計量、不抽；打完、逃走之後計量照舊（照精英戰：今天只有 `advance()` 遇敵、回城、全滅會歸零，`engine/encounter.ts:21-22`、`engine/game.ts:1775`、`:1969`）。隨機遇敵照舊發生。【控制者】
14. **逃跑與全滅**（§5.4）：逃跑照既有規則（非頭目戰可以逃，`engine/battle.ts:1066-1069`）；逃掉之後牠留在原格、HP 回滿（下一戰重新開始，照精英格）、**停 `WANDER_REST = 3` 回合**、不再追蹤（停完照行為回原位或繼續巡邏）。輸了照 `wipe()`：這一趟結束，徘徊者跟著這一趟消失。【控制者＋設計裁定】
15. **讀檔**：徘徊者的位置、狀態、被打倒都存在 `Run`（不存檔）；在迷宮裡重新整理就回到出發前的城鎮存檔，和採集一樣。同一趟同一層只生成一次（`run.floors` 快取）；`GameState` 不加欄位，`SAVE_VERSION` 不變。【控制者】
16. **看得見才畫**：徘徊者離隊伍的步行距離 ≤ `WANDER_NOTICE = 4`（濃霧時 2）就算看見，之後這一趟一直畫在牠**現在**的位置，連同「下一步」的提示格；看守沒有提示格。圖核准之前用文字標記：巡、守、追（PR B），絕不用佔位圖。戰鬥用牠自己的戰鬥圖。【控制者＋設計裁定】
17. **文字只有中性的系統文字**（§8）：看見、打倒、甩開的一行通知；沒有角色台詞、沒有文字槽。整個功能零個「……」、零個「！」。【控制者】
18. **分期**：A 引擎（開關關著）→ B 介面 → C 上線（打開開關、e2e）→ D 美術（等使用者核准地圖標記的畫風）。【控制者】

---

## 1. 為什麼要做

- 世界樹迷宮的 FOE 讓地圖變成謎題：「這隻每兩步折返一次，我在第三步穿過去」。星燈迷宮的房間與走道已經有了，缺的是**會動、看得見、可以預測**的東西。
- 精英格與守關者房是固定的、踩上去才算；徘徊者是第一個「看見之後要決定躲不躲」的敵人。
- 報酬讓「打」也是一個選擇：多一件精英裝備與兩個稀有素材，代價是一場守關者等級的戰鬥。

## 2. 目標、非目標、反目標

**目標**
1. 第 4 層起每層 1–4 隻，看得見、走法可以預測（巡邏的路線固定、看守不動、追蹤只在近距離追）。
2. 躲得開：不堵唯一的路；入口房、出口房與固定戰鬥的房間是安全的。
3. 打得到東西：精英的發法＋兩個稀有素材。
4. 開關關著或還沒打開時，遊戲逐位元不變；開著但從沒接觸，每一條串流的抽取也不變。

**非目標**：新怪物、新戰鬥圖、新道具、新戰鬥程式；台詞與文字槽；「等一回合」的指令；徘徊者之間的互動（合流、增援）；隱形或會躲的徘徊者；頭目層的徘徊者；在城裡看得到的情報（手冊頁，接口 §11）。

**反目標**

| 失敗樣態 | 為什麼是失敗 | 怎麼防 |
|---|---|---|
| 舊樓層位移 | 快照、相遇、守關者、採集點全部跟著動 | 最後一步、獨立串流、**不寫樓層**（§0 第 7 條） |
| 開著不碰也改了戰鬥 | 潛行快照、遇敵節奏全部重錄 | 移動不抽亂數；接觸之前逐步相同的相對比較（§5.6） |
| 堵死出口 | 玩家只能硬打 | 放置時的通行檢查（§0 第 10 條）；追蹤者追丟就回原位 |
| 看不懂怎麼走 | 繞路變成猜 | 文字標記分三種行為；下一步的提示格（§9） |
| 戰鬥連發 | 逃掉又被同一隻立刻抓回去 | 逃跑後停 3 回合（§0 第 14 條） |
| 同一步兩件事 | 剛被抓又遇敵、或踩寶箱同時被抓 | 只在 `moved` 之後行動（§0 第 3 條） |
| 刷報酬 | 打倒的又回來 | 被打倒記在這一趟、這一層；重新整理回到出發前（§0 第 15 條） |
| 佔位美術 | `AGENTS.md` Game Art Asset Policy | 文字標記，圖等 PR D（§10） |

## 3. 現況（2026-10-30 實讀程式碼）

| 項目 | 現況 | 位置 |
|---|---|---|
| 樓層順序 | `floorOf`：`genFloor` → `fillRooms` → 救援 → 回憶光點 → 守關者 → 採集點（「the very last line」） | `engine/dungeon/run.ts:131-149` |
| 一趟的旗標 | `Run.gather?`（不存檔，`depart` 在 `newRun` 之後設） | `engine/dungeon/run.ts:77-85`；`engine/game.ts:342-344` |
| 房間 | 3–5 × 3–4；出口房是頭目房時只有一個門（`'door'`）；沒有房間時退回固定地圖 | `engine/dungeon/gen.ts:26`、`:118-131`、`:140` |
| 內容與房間 | `Content.room` 記房間 id；精英、守關者、救援都是房間裡的一格 | `engine/dungeon/rooms.ts:17-20` |
| 移動 | `move()` 依格子分派；一般格走 `walk()`；精英、守關者、救援、頭目在 `move()` 裡直接開戰 | `engine/game.ts:364-422` |
| 一步一件事 | `walk()`：一次 `advance()`，遇敵就開戰；註解寫明事件格不走這裡 | `engine/game.ts:484-493` |
| 計量歸零 | 只有 `advance()` 遇敵、出發、回城、全滅；精英、頭目戰不歸零 | `engine/encounter.ts:19-24`；`engine/game.ts:358`、`:1775`、`:1969` |
| 精英的路 | `startBattle(group, false, true, group[0])`；難度的詞綴以 `this.pos` 為鍵 | `engine/game.ts:396-410`、`:1905-1935`（`:1914`） |
| 戰後 | `fled` 回地圖、`lose` 全滅；勝利：`worked`、圖鑑、報酬、精英格改回地板、守關者拿掉房間、好感、碎片（守關者不給） | `engine/game.ts:829-950` |
| 精英的報酬 | `lootRng`：一件 `elite` 裝備、一個稀有素材（`RARE_MATERIALS` 三選一）；`ownUnique` 只看第一隻 | `engine/game.ts:959-999`；`engine/loot/drops.ts:24`、`:172` |
| 逃跑 | 非頭目戰才能逃 | `engine/battle.ts:1066-1069` |
| 精英的強度 | `ELITE = { hp: 2.2, atk: 1.3 }`、`ELITE_REWARD = 3`；守關者不加 ★ | `engine/scaling.ts:109-110`、`:193-223` |
| 守關者 | 本道五位（8、13、18、23、28 層輪替）、地區各一位；`WARDEN_GROUPS` 有護衛 | `data/monsters.ts:189-223` |
| 名冊的開關 | 每一份清單讀 `listedEnemy`／`artEnemy` | `data/monsters.ts:68-72` |
| 守關者的平衡帶 | 22i：每位在前兩個深度、期望隊伍勝率 ≥ 0.6 | `engine/balance.roster.test.ts:601-639` |
| 視野 | `reveal` 以切比雪夫半徑 `sight`（平常 1、濃霧 0）；`fogState` 同 | `engine/map.ts:58-67`；`render/fog.ts:9-12`；`data/conditions.ts` |
| 鹽 | 八個初始字、K[0]–K[3] 已用 | `data/monsters.test.ts:680-699` |
| 測試的開關 | `withGuildLive`／`withGuildOff`、`withGatherLive`／`withGatherOff` | `engine/testing.ts:214-287` |
| 地圖標記 | `markersOf` 只看 `contents`；文字標記 `MARKER_GLYPH`、`GLYPH_FILL` | `render/markers.ts:9-55`；`render/MapView.ts:21-29`、`:166-208` |
| 小地圖 | 事件格金色、陷阱紅、採集綠 | `ui2/minimap.ts:14-29`、`:89-92` |
| 介面的步 | `step()` 依結果分派；`battle`／`boss` 走 `fightOn` | `ui2/scenes/dungeon.ts:333-361`、`:418-428` |
| 固定的腳本 | 潛行快照：本道 1–6 層、舊怪物表（`withRosterOnly([])`）、`stepOnto` 直接放位置；城鎮快照：只在 1–3 層 | `engine/storyL.dive.test.ts:29-68`；`engine/guild.legacy.test.ts:217-221` |

## 4. 核心循環

```
出發（第一幕之後）
  │
第 4 層起的一層 ─→ 走近：地圖上出現「巡」「守」「追」，旁邊一格淡紅色是牠下一步要去的地方
  │                 ├─ 繞路：算好巡邏折返的時機穿過去；看守不動，繞開就好；追蹤的離遠一點
  │                 ├─ 撞上去（或被追上）→ 和這隻守關者單挑
  │                 │     ├─ 贏：精英裝備一件＋稀有素材 ×2，這一層牠不會再出現
  │                 │     ├─ 逃：牠停 3 回合，可以趁機走開
  │                 │     └─ 輸：全滅，照舊
  │                 └─ 入口房、出口房、精英／守關者／救援的房間牠進不來
  └─ 下樓：新的一層，新的一批
```

## 5. 徘徊者

### 5.1 三種行為（`WanderKind`）

| 行為 | 標記 | 怎麼走 | 提示格 |
|---|---|---|---|
| `patrol` 巡邏 | 巡 | 在自己的房間裡沿一條直線來回（路線 2–4 格，放置時決定）；到端點折返 | 路線上的下一格 |
| `guard` 看守 | 守 | 不動 | 沒有 |
| `chase` 追蹤 | 追 | 待在原位；隊伍的步行距離 ≤ `WANDER_CHASE = 3` 時開始追，追到距離 > `WANDER_GIVE_UP = 6` 或沒有路就放棄，走回原位 | 朝隊伍（追的時候）或朝原位（回去的時候）的下一格 |

- 權重 `WANDER_WEIGHTS = { patrol: 4, guard: 3, chase: 3 }`（【起始提案】）。
- 「步行距離」是只走「牠能走的格」與隊伍那一格的最短步數（§5.3）。

### 5.2 放置（`engine/dungeon/wander.ts` 的 `placeWanderers`）

`floorOf` 的最後一行（`placeGather` 之後）：

```ts
if (run.wander) (run.wanderers ??= {})[depth] = placeWanderers(f, g, mulberry32(seed ^ WANDER_SALT), run.region, depth);
```

`placeWanderers(f, g, rng, region, depth): WanderFloor` 只讀 `f`，回傳 `{ list: Wanderer[]; keepOut: Rect[] }`。

- **不抽、不放**：`g.rooms` 是空的（備用樓層）、`depth < WANDER_FROM (4)`、`isBossDepth(region, depth)`、`wanderPool(region, depth)` 是空的：回 `{ list: [], keepOut }`，一個亂數都不抽。
- **`keepOut`**：入口房、出口房、`contents` 裡有 `elite`／`warden`／`rescue` 的房間的矩形，依房間 id 排序（不抽）。
- 抽取的順序（寫死，計畫 A2 照抄進註解）：對 `i = 0 … wanderCount(depth) − 1`：
  1. **房間**：候選＝不在 `keepOut`、還沒有徘徊者、而且至少有一格「此刻是 `'floor'` 而且沒被前面的徘徊者佔用（原位或路線）」的房間，依 id 排序；空了就停。`room = pick(rng, 候選)`。
  2. **格子**：那個房間裡上述的格子，逐列由左到右；`home = pick(rng, 格子)`。
  3. **行為**：`pickWeighted(rng, [4, 3, 3])`（巡邏、看守、追蹤；本檔私有的 `pickWeighted`，照 `engine/dungeon/gather.ts:10-18`）。
  4. **是誰**：`foe = pick(rng, wanderPool(region, depth))`。
  5. **巡邏才有**：`axis = rng() < 0.5 ? 'h' : 'v'`（一次抽取）。路線不抽：沿 `axis` 經過 `home`、在房間矩形內、連續的可用 `'floor'` 格；長度上限 `min(WANDER_ROUTE_MAX (4), 房間在那個方向的寬 − 1)`（所以一條路線永遠不會切斷整個房間）；取包含 `home`、以它為中心往前靠的一段。這個方向不到 2 格就換另一個方向；兩個方向都不到 2 格就變成看守。
  6. **通行檢查**（不抽）：把已接受的徘徊者與這一隻的「靜態格」（看守與追蹤的 `home`、巡邏的整條路線）當成牆，從 `map.entrance` 到 `map.down` 走 `tileAt !== 'wall'` 的格子；走不通就**丟掉這一隻**（房間仍算用過，不重抽）。
- **不位移的理由**：它在 `floorOf` 的最後、只讀 `f`、只用自己的串流；之前的每一步都看不到它，`f` 也沒有被改。
- **和採集**：採集點已經放好，所以徘徊者的原位與路線都是此刻的 `'floor'`；採集點本身不是 `'floor'`，徘徊者不會站上去（採完變回地板之後才能走）。

### 5.3 移動（`engine/wander.ts`）

**牠能走的格**：`'floor'`、不在 `keepOut` 的矩形裡、沒有別的還沒被打倒的徘徊者。隊伍那一格另算（走進去就是接觸，不論那一格是什麼）。

**一回合**（只在隊伍這一步的結果是 `moved`、還在地圖上之後，§0 第 3 條）：依 `list` 的順序，每一隻：
1. 打倒的跳過；`rest > 0` 就減一、不動。
2. 算 `next`（純函式 `nextOf(w, floor, map, party)`）：看守 `null`；巡邏是路線上的下一格（走到端點就折返）；追蹤照 §5.1 的狀態：追的時候是往隊伍的最短路的第一步、回去的時候是往 `home` 的第一步、在原位而隊伍不夠近是 `null`。
3. `next` 是隊伍那一格 → **接觸**：這一回合到此為止（後面的不動），開戰（§5.4）。
4. `next` 能走 → 移過去（巡邏更新路線的位置與方向）。不能走（被別隻擋住）→ 這一回合不動，巡邏**不**折返。
- 最短路：廣度優先，鄰格順序固定「上、右、下、左」，同步數時先到的方向贏；搜尋只到 `WANDER_GIVE_UP` 步為止。
- 追蹤的狀態：`chasing = 距離 ≤ WANDER_GIVE_UP && (chasing || 距離 ≤ WANDER_CHASE)`，每回合移動之前更新。
- **看見**：隊伍每次移動之後、以及每一回合之後，還沒看見的徘徊者若和隊伍的步行距離（`tileAt !== 'wall'` 的格子）≤ `WANDER_NOTICE`（4；這一趟的狀況 `sight === 0` 時 `WANDER_NOTICE_FOG = 2`）就 `seen = true`。
- 全部不抽亂數；`nextOf` 不改狀態，介面的提示格用同一個函式（追蹤者的提示是「隊伍站著不動時」的下一步；隊伍先動，所以實際的一步朝隊伍的新位置，§9.1 寫明）。

### 5.4 接觸與戰鬥

- **撞上**（`move(dir)` 的目標格有一隻還沒被打倒的徘徊者）：隊伍**不移動**（面向牠），不走 `walk()`（不加計量、不抽），直接開戰。
- **被追上**（§5.3 第 3 步）：隊伍已經在新的格子上，開戰。
- 開戰：`startBattle([foe], false, true, foe, 0, { wander: id, affixAt: home })`：單獨一隻、精英的路；難度的詞綴以牠的 `home` 為鍵（`rollAffixes(run.seed, floor, eliteAffixes, home)`），所以同一隻在哪裡被碰到都是同一組詞綴。
- 回傳 `{ kind: 'battle', wanderer: { foe, by: 'bump' | 'caught' } }`（既有的 `battle` 加一個可選欄位，介面照舊走 `fightOn`）。
- 戰鬥的結果（`submitRound`）：
  - **勝**：`down = true`；照精英發報酬（§5.5）；`worked`、圖鑑、經驗、公會的完成照舊（和任何勝利一樣）；不改任何格子。`BattleEnd.wanderer = foe`。
  - **逃**：`rest = WANDER_REST (3)`、`chasing` 清掉；牠留在原格（追蹤者停完之後若隊伍不夠近就走回原位）。
  - **敗**：`wipe()`，照舊。
- 一回合裡至多一場接觸；接觸那一回合後面的徘徊者不動。

### 5.5 報酬

- 照**精英**：`battleGear(b, true, tier)` 與 `battleRunes(b, true, tier)`（一件 `elite` 來源的裝備、一個稀有素材、符文照精英那一列；守關者的專屬傳說照 `ownUnique` 的既有規則可能換上）。
- 稀有素材 ×`WANDER_RARE_QTY = 2`（同一種；不多抽，`lootRng` 的抽取次數和精英相同）。背包裝不下的照既有規則留下（`left`）。
- 不給回憶碎片（照守關者，`engine/game.ts:915-916`）；好感的 `FIELD_POINTS.strong` 照精英給（`:909`）。
- 經驗與金幣是 `scaleEnemy` 的精英報酬（×3），不另加。

### 5.6 決定性、讀檔與證據

- **串流**：新串流只有 `mulberry32(floorSeed ^ WANDER_SALT)`，只在 `placeWanderers` 用；`nextOf`、回合、看見、預覽一個亂數都不抽。所有既有串流（`game.rng`、`lootRng`、`memoryRng`、`trophyRng`、`runeRng`、`spotRuneRng`、`forgeRng`、詞綴串流、採集的串流）的抽取，在沒有接觸的情況下不變；接觸之後的戰鬥照既有規則抽。
- **讀檔**：§0 第 15 條。
- **證據**（計畫 Global Constraints 照這份清單）：
  1. **關著**：sim gate identical、`contribution.json` 等於 `contribution.8d-final.160.json`；`engine/legacyFights.test.ts`、`engine/floors.snapshot.test.ts`、`engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`、`engine/gather.{legacy,points,walk}.test.ts`、`engine/game.test.ts` 的「Normal drops are as before」、`engine/battle.test.ts` 的 keystones，全部不重錄。
  2. **樓層不動**：`run.wander = true` 時，每一層的 `map` 與 `contents` 和沒設時**逐一相同**（不用去掉什麼），在名冊樓層快照的 fixture 上、以及救援房、強制的回憶光點、上線的守關者、採集點打開的相對比較上（計畫 A2）。
  3. **開著但沒碰**：
     - 潛行快照在 `withWanderLive(f, { open: true, pool: ['false-moon'] })` 下整段重跑（它用舊怪物表，守關者沒上線，所以測試指定一位），逐一等於**同一份** fixture；非空：第 4、6 層至少一層有徘徊者；腳本用 `stepOnto` 直接放位置、把東西種在第一個空地板：測試檔裡這幾個輔助函式先把站在那幾格（與目標格的鄰格）上的徘徊者從 `run.wanderers` 拿掉（記數、寫進報告），斷言整段沒有任何接觸。
     - 城鎮快照的腳本只到第 3 層（`engine/guild.legacy.test.ts:217-221`）：開著也一隻都沒有，斷言逐一相同而且 `run.wanderers` 每層都是空的（證明深度的閘門，不當作非空的證據）。
     - **接觸之前逐步相同**（`engine/wander.walk.test.ts`）：種子固定、跨好幾層的行走，開與關各跑一次，同樣的路線；每一步的結果種類、`game.rng` 的抽取次數、計量、位置逐一相同，直到開的那一次第一次接觸為止；斷言接觸之前徘徊者至少走了 40 步、至少一隻被看見。
     - **會壞才算證明**：把 `placeWanderers` 換成什麼都不做時，非空的斷言必須紅；在回合裡多抽一次 `game.rng` 時，逐步相同必須紅（計畫 A3 實際做一次）。
  4. **放置釘住**：`engine/__fixtures__/wander/placements.json`（A2 錄一次，之後不准重錄）。
  5. **不堵路**：§0 第 10 條的抽樣測試，另以一個手工的窄走道樓層證明檢查真的會丟掉一隻。

## 6. 數量與強度

### 6.1 一層幾隻（`wanderCount(depth)`，【起始提案】）

| 深度 | 1–3 | 4–9 | 10–19 | 20–39 | 40 起 |
|---|---|---|---|---|---|
| 隻數上限 | 0 | 1 | 2 | 3 | 4 |

頭目層 0；可用的房間不夠、或通行檢查丟掉時更少。

### 6.2 是誰（`WANDER_POOL`，【起始提案】）

| 地區 | 名單（`from` 起出現） |
|---|---|
| 本道 | `false-moon` 4、`bell-warden` 9、`toppled-automaton` 14、`requiem-conductor` 19、`lantern-brood` 24 |
| 六個地區 | 自己的守關者（`REGION_WARDENS`）4，加上本道那五位（同樣的 `from`） |

- 地區也混本道的守關者：地區的遇敵表本來就混本道的組（`data/monsters.ts:233-242`）。
- `wanderPool(region, depth)` 只收 `listedEnemy && artEnemy` 的 id（名冊的開關照舊有效：名冊關著時名單是空的、不放、不抽）；測試可以用 `WANDER_SWITCH.pool` 指定（只給測試輔助用，§5.6）。
- 單獨一隻，**不帶** `WARDEN_GROUPS` 的護衛（地圖上是一個標記，戰鬥也是一隻）。

### 6.3 強度的量測（計畫 A4，【起始提案】）

- 公式只有一條：§0 第 11 條。不加任何旋鈕。
- 量法照名冊 22i（`engine/balance.roster.test.ts:601-639`）：期望隊伍、`KITS = 3` × 6 個種子，`simBattle(party, [foe], false, seed × 7919, { depth, region, elite: foe })`；格子＝每個地區 × 深度 4、9、14、19、24 × 那個深度名單上的每一位。門檻：勝率 ≥ 0.6。
- 新檔 `engine/wander.bands.test.ts`，opt-in（`WANDER_BANDS=1`），不在 sim gate、不進 `engine/bands.ts`；凍結的平衡檔一個字都不改。
- 紅的格子：**一次調整**＝把那一位在那個名單的 `from` 往後移到第一個綠的取樣深度（只改資料）；還紅就寫進 `WANDER_EXCEPTIONS`（格子、量到的值、一行理由）並記待辦。永遠不卡上線（`starlantern-balance-not-priority`）。

## 7. 和其他系統

| 系統 | 規則 |
|---|---|
| 遇敵計量 | 不受影響（§0 第 13 條）；`encounterDown`、狀況的倍率都不影響徘徊者 |
| 採集點 | 放置在採集點之後、不站在採集點上；隊伍站在採集點上也會被追上；`gather()` 不是一步，徘徊者不動 |
| 救援房、精英、守關者房 | 不放、走不進（`keepOut`）；那些格子是固定戰鬥，徘徊者也不會踩 |
| 強制的回憶光點、寶箱、泉水等事件格 | 不是 `'floor'`，徘徊者不踩；踩事件格的那一步牠們不動 |
| 頭目層、本道第 3 層、終章 | 沒有徘徊者 |
| 樓梯、入口 | 在出口房與入口房裡，牠們進不去 |
| 難度 | 隻數與名單不變；強度照 `fightTier`；詞綴照精英，鍵是 `home` |
| 公會 | 打倒算一般的勝利（`worked`、圖鑑、討伐的完成照舊） |
| 好感 | 照精英給「強敵」點數；送禮不變 |
| 圖鑑 | 開戰時照舊記見過 |
| 存檔 | 不加欄位 |

## 8. 文字（`T.ui2.wander`，PR B）

- 只有中性的介面說明，數字用阿拉伯數字，零個「……」、零個「！」：
  - 看見（這一層第一次看見任何一隻時，地圖上的一行）：「附近有強敵在徘徊。」
  - 打倒（回到地圖時）：「擊退了{名字}。這一層不會再遇到牠。」
  - 甩開（逃跑成功回到地圖時）：「甩開了{名字}，牠停了下來。」
  - 行為名（選單或說明用）：巡邏、看守、追蹤。
- 名字照戰鬥裡的名字（`scaleEnemy` 加過地區與深層的前綴）。
- 檢查：`data/terms.test.ts`、`data/glyphs.test.ts`、`ui2/typeScale.test.ts`。

## 9. 介面

一律用 ui2 既有元件；字只有 12／24 px；位置寫在 `src/styles/_starlantern-ui.scss` 的 class；禁 `!important`、行內樣式、`element.style`。

### 9.1 地圖
- 看見過、還沒被打倒的徘徊者，在牠**現在**的格子畫 24 px 的文字標記：巡、守、追；平常 `0xff8a6a`（精英的顏色），追蹤者正在追時 `0xff3b30`。牠的格子不在視野內（`fogState` 不是 `visible`）時半透明（0.6，照 `memory` 的規則）。
- 提示格：`nextOf` 的那一格畫一個半透明的紅色方塊（`Graphics`，alpha 0.25；像游標一樣的介面回饋，不是美術）。看守沒有；停著（`rest > 0`）的沒有。追蹤者的提示是「隊伍不動時」的下一步，介面不另外說明。
- 徘徊者的標記畫在霧之上（牠可能走進還沒探索的格子）；標記與提示格在自己的 `Container`，不混進 `markersOf`（`MarkerKind` 不加種類）。

### 9.2 小地圖
- `MINIMAP_COLORS.wander = '#ff5a4a'`、`wanderNext = '#7a2e28'`；畫在事件之後、隊伍之前。

### 9.3 迷宮的場景
- `step()` 的 `battle` 照舊走 `fightOn`（`wanderer` 欄位不影響）；被追上的那一步先畫完隊伍的移動再轉場。
- 回到地圖時，若上一場是徘徊者：勝 → 「擊退了⋯⋯」那一行；逃 → 「甩開了⋯⋯」那一行（用 `say`）。
- 這一層第一次看見徘徊者時說一次「附近有強敵在徘徊。」。
- 不加迷宮選單項目、不加按鍵。

## 10. 美術

| 項目 | 用途 | 數量 | 做法 | 狀態 |
|---|---|---|---|---|
| **地圖標記** | 地圖上的徘徊者 | 3（巡邏、看守、追蹤） | **codex 生成；事件地磚的既有類型（62×62 透明畫布、主體置中），新的一族；先給使用者看樣本表** | PR D；核准前用文字標記 |
| 戰鬥圖 | 戰鬥 | 0 | 守關者既有的戰鬥圖 | 不需要新圖 |
| 提示格、小地圖 | 地圖 | ── | 程式畫的色塊（介面回饋） | 不需要新圖 |

- 不在圖裡放字；被淘汰的圖不留在 runtime 路徑。
- `WANDER_ART`（空集合，PR D 填）：標記圖發布前，`MapView` 不去要圖。

## 11. 接口（不設計，只留位置）

- **手冊**：圖鑑已經記見過與打倒；之後可以加「在地圖上遇過」的註記，不改存檔。
- **難度限定**：噩夢、地獄多一隻或換更強的名單：在 `placeWanderers` 的所有既有抽取之後才多抽，普通難度逐一不變。
- **等一回合**：若之後要加「原地等待」的指令，它就是一個不移動的 `moved`，`nextOf` 不用改。
- **劇情**：文字槽之後要加，照採集的 `GATHER_TEXT` 做法另開。

## 12. 驗收

1. 開關關著、或開著但還沒打開：§5.6 證據第 1 條全部成立。
2. 開著、強制打開、從不接觸：§5.6 證據第 2、3 條成立，而且非空；換掉放置或在回合裡多抽一次時會紅。
3. 不堵路的抽樣全綠，窄走道的反例真的丟掉一隻。
4. 打開之後（e2e，PR C）：第 4 層看見標記與提示格、撞上去開戰（戰鬥圖是那位守關者）、打贏之後標記消失、拿到精英的報酬與兩個稀有素材；重新整理回到出發前。
5. A4 的量測跑過一次，紅的格子照 §6.3 處理並寫進報告。
6. 介面：字級、Cubic 11 字表、沒有行內樣式、文字標記不被裁、標記圖沒發布前不畫佔位。

## 13. 需要使用者

1. **地圖標記的樣子**：徘徊者是地圖上會動的新東西。PR D 先產一張樣本表（三種行為的標記，兩個方向各一版：A「專屬的標記圖」；B「把那位守關者既有的戰鬥圖縮成一格的頭像，外加行為的框」），請使用者選。B 不需要新的怪物圖，但改了地圖的觀感，所以一樣要核准。這是 PR D 的開工條件；其他 PR 不等它，上線時用文字標記。
