# 星燈迷宮 採集（Gathering）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 迷宮的房間裡多了採集點：礦脈、藥草叢、菇叢、晶脈，以及每個地區一種帶規則的特產點（燙手、無聲、帶電、毒氣、藏在暗處、鏗鏘）；15％ 是多 2 個的豐點。站上去按確定鍵，視窗預告「輕手採集」與「全力採集」各拿幾個、遇敵燈會變成什麼顏色，玩家自己選。採到的素材在鍛造屋打採集工具（兩級）、做消耗品的第二種配方、釘選重鑄的地區詞綴，在道具店賣，交給公會的收購。開關關著或第一趟回城之前，遊戲逐位元不變；開著但不採集，每一條既有串流的抽取也不變。**本計畫沒有任何角色台詞與寫作任務**（使用者 2026-10-30：劇情整體還沒定，先專心做玩法）；只有中性的系統文字，與空著的文字槽。

**Architecture:**
- **一道開關**：`GATHER_LIVE`（`data/gather.ts` 的 `GATHER_SWITCH.live`），PR D 之前是 `false`。所有讀寫只認 `gatherOpen(s) = GATHER_SWITCH.live && GATHER_SWITCH.open(s)`，`open` 預設 `s.story.seen.includes('first-return')`（spec §0 第 13 條）。
- **放置在出發時決定**：`depart()` 在 `gatherOpen` 時給 `Run.gather = true`（不存檔）；`floorOf` 的最後一行在這個旗標下呼叫 `placeGather`，用新串流 `mulberry32(floorSeed ^ GATHER_SALT)`，只把房間裡的空地板改成 `'gather'`（spec §5.2）。
- **採集點踩上去就是地板**：`move()` 一行不改（`'gather'` 走 `default` 的 `walk()`）；採集是另外的 `Game.gather(mode)`，一個亂數都不抽；`Game.gatherPreview()` 與它共用同一個純函式，預告永遠等於結果（spec §0 第 3、6 條、§5.4）。
- **用途全部接在既有系統上**：鍛造屋的製作清單（工具、消耗品的第二種配方）、重鑄的釘選（`rerollCost`／`swapPool`）、道具店的素材頁、公會的收購池（`DELIVER_KINDS`、`knownMaterial`）。不新增道具、不新增委託種類、不新增設施指令、不加迷宮選單項目。
- **文字槽空著就不說話**：`GATHER_TEXT` 與公會的兩個紙條鍵只註冊、不寫字；選句的規則與文風守門的接線現在就做好，之後填字不改程式（spec §9.2）。
- **先引擎、再介面、最後上線**：PR A（資料、放置、採集、鍛造、存檔、經濟）→ PR B（介面與文字槽）→ PR D（打開開關與 e2e）。PR C（公會收購）只要 A 合併就能做，和 B、D 不衝突。PR E（美術）等使用者核准點的地磚樣本。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、Python（Pillow／numpy，只在 PR E）、codex 圖片生成（`codex_still.py`，只在 PR E）、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-30-starlantern-gathering-design.md`（下稱 spec §）。**spec §0 是定案紀錄；本計畫的「計畫裁定」和 spec 正文衝突時，以裁定為準，並在同一個 PR 抄回 spec §0。** 另外要讀：
- `docs/superpowers/plans/2026-10-29-starlantern-guild-quests.md`：Global Constraints、閘門、城鎮快照、經濟測試、收尾 G（本計畫照抄並改小）；
- `docs/superpowers/plans/2026-10-30-starlantern-story-v6.md`：Global Constraints、PR 3 的 Task 3.1（相遇房改成地板、`engine/meetings.hash.test.ts`）；
- `engine/forge/economy.test.ts`（價值的定義）、`engine/guild.economy.test.ts`（布告上限的量法）、`engine/guild.guard.test.ts`（掃原始碼的守門寫法）、`engine/floors.snapshot.test.ts`（樓層快照）、`engine/game.ts` 的 `springTrap`（地圖外扣 HP／TP 的寫法）。

**範圍外**：角色與鎮民的台詞、寫作任務、冷讀、帳本的新設定；新道具、新戰鬥效果；採集技能或熟練度；季節與月相；難度限定的點；好感度與送禮；新場景、新 NPC、手冊的採集頁（只留 spec §13 的接口）；舊存檔遷移；任何既有劇情、招呼、城鎮台詞的修改；任何平衡旋鈕與凍結檔。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/`、`art-factory/`、`public/`、`.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄是 `.superpowers/sdd/2026-10-30-starlantern-gathering/<PR 代號>/`，下稱 SDD（已被 `.gitignore` 排除）。行號只用來定位，動手時一律用內容找。

---

## 對照報告：spec 各節 × 2026-10-30 的程式碼

| spec | 接到哪裡 | 位置 | 備註 |
|---|---|---|---|
| §0.7、§5.2 放置 | `floorOf` 的最後一行 | `engine/dungeon/run.ts:120-136` | 守關者那一行之後；v6 3.1 若先合併，在它之後 |
| §0.14 出發時決定 | `Run.gather?: true`；`depart` | `engine/dungeon/run.ts:19-75`；`engine/game.ts:327-339` | 照 `Run.worked`（不存檔）；**緊接在 `newRun` 之後設**，`:339` 的 `this.map()` 會生成並快取出發層（審查 M2） |
| §5.3 暗影 | `Run.spotted?: Set<string>` | `engine/dungeon/run.ts:19-75` | 不存檔（審查 L3） |
| §5.4 下一步 | `walk()` 的 `mod` 與 `FLOORS[地形].rate` | `engine/game.ts:467-476`；`engine/encounter.ts:4-24`；`data/conditions.ts` | 預告用同一個 `mod`（審查 L1） |
| §5.3 全員 | `livingMembers()` | `engine/game.ts:493-495` | `party.recruited` 裡活著的（含不在場上的，審查 L2） |
| §10.3 裝不下 | `fullLayer(host, r, retry)` | `ui2/scenes/event.ts:229-262`；`showPickUp` 的重試只認 `pickUpHere`（`:177-179`） | 採集自己的重試（審查 M1） |
| §8.2 地區 | `questLand` | `ui2/scenes/board.ts:51-59` | `deliver` 只認地區素材；特產要 `spotRegionOf`（審查 M3） |
| §8.4 上限 | `capSweep`、`BOARD_CAP_EXCEPTIONS` | `engine/guild.economy.test.ts:258-298` | 已釘住，不動；採集另開 `gatherCapSweep`（審查 M3） |
| §0.15 鹽 | `GATHER_SALT = 0xe9b5dba5` | `data/monsters.test.ts:677-691` | `salts are distinct` 加它 |
| §5.2 只用空地板 | 房間裡 `=== 'floor'` 的格子 | `engine/dungeon/rooms.ts:52-58`、`:121` | 照 `fillRooms`／`placeSpecial` 的找格子寫法 |
| §5.2 新格子 | `Tile` 加 `'gather'`；`Content.kind` 加 `'gather'` | `engine/map.ts:3-7`；`engine/dungeon/rooms.ts:10-25` | `TILE` 對照表加一列 |
| §0.6 踩上去照走 | `move()` 的 `default` | `engine/game.ts:347-405`、`:467-476` | `move()` 不改 |
| §5.4 拿走 | 照 `glimmerHere` | `engine/game.ts:412-436` | 拿掉內容、格子改回 `'floor'`、`grant`、`shortBy` |
| §5.3 地區規則 | 照 `springTrap` | `engine/game.ts:501-515` | `trapDamage`、`POISON_TP_LOSS_PCT`、HP 不低於 1 |
| §6 聲響 | `this.encounter` | `engine/encounter.ts:4-24`；`engine/game.ts:271-273` | 上限 `ENCOUNTER_MAX − 1` |
| §7.1 素材 | `MATERIALS` 的展開順序最後 | `data/materials.ts:30` | `MaterialKind` 加 `'gather'`（`engine/types.ts:347`） |
| §7.2 第二種配方 | `itemRecipeCost`、`craftItem` | `engine/forge/craft.ts:26-42`；`data/forge.ts:68-74` | 原配方不動 |
| §7.3 釘選 | `rerollCost`、`swapPool` | `engine/forge/cost.ts:81-110` | 特產 ×2 |
| §7.4 用途清單 | `materialUses` | `engine/forge/uses.ts:32-51` | 加 `tool` 一種；消耗品與重鑄沿用既有種類 |
| §7.4 種類標籤 | `T.forge.kind` | `data/text.zh-TW.ts:1123` | `Record<MaterialKind, string>`：A1 加 `gather` |
| §8 公會 | `DELIVER_KINDS`、`DELIVER_GIVER`、`knownMaterial`、`noteFor` | `data/guild.ts:32-38`；`engine/guild.ts:134-156`、`:295-299` | PR C |
| §9.2 文字槽的守門 | `storyTexts()`、`speakerOf`、`POLISHED` | `data/story/voiceGates.ts:33-56`；`data/story/voice.test.ts:15-63` | 照公會計畫裁定 16 的 `NIGHT_BEATS` 寫法 |
| §10.1 地圖 | `markersOf`、`MARKER_GLYPH`、`ON_FLOOR`、`GLYPH_FILL` | `render/markers.ts:6-41`；`render/MapView.ts:21-23`、`:166-190` | 文字標記照回憶光點（憶） |
| §10.1 小地圖 | `MINIMAP_COLORS`、標記的顏色 | `ui2/minimap.ts:14-26`、`:86-88` | |
| §10.2 確定鍵 | `DungeonScene.onAction` | `ui2/scenes/dungeon.ts:116-126` | 今天地圖上的 `confirm` 沒有作用 |
| §10.2 提示 | `tapper`、重量讀數 | `ui2/scenes/dungeon.ts:128-133`、`:156-160`；scss `.slx-weight`（:370） | |
| §10.3 視窗 | `eventWindow`、`EventKind` | `ui2/scenes/event.ts:31`、`:58-73` | `start` 參數決定游標預設 |
| §10.5 鍛造屋 | 製作清單、消耗品頁 | `ui2/scenes/forgeCraft.ts:85-125` | `FORGE_TABS` 不加 |
| §10.4 道具店 | 素材頁 | `ui2/scenes/shop.ts:130-150` | |
| §12 圖的清單 | `allArtUrls` 的素材圖示 | `render/artPaths.ts:241`；`data/monsters.ts:77`（`artMaterial`） | 採集素材要過 `GATHER_ART` |
| §5.5（逐位元） | `TILE_CODE: Record<Tile, string>` | `engine/floors.snapshot.test.ts:23-26` | A2 加 `gather: 'G'`（只動測試檔，fixture 不動） |
| §0.16 存檔 | `isValid`、`repairGuild` 之後 | `engine/save.ts:200-202`、`:334-337` | `SAVE_VERSION` 9 |
| §0.13 測試開關 | 照 `withGuildLive` | `engine/testing.ts:213-223` | `withGatherLive(f, { open? })` |

## 計畫裁定

spec 是控制者授權的設計者草案；下面是 spec 沒寫細的地方，全部是「計畫裁定」，同時抄進 spec §0。

1. **分期與 PR**：照「分期與 PR」表。開工條件：B 要 A 已合併；C 要 A 已合併（公會 PR B 已在 master）；D 要 A、B；E 的 E1 隨時可做、E2 之後要使用者核准樣本、E4 要 B 已合併。每個 PR 的第一個任務錄自己的 `gate-0`。
2. **檔名**：`data/gather.ts`（開關、鹽、種類、素材、權重、豐點、地區規則、數量、聲響、工具、配方、釘選、上限、`GATHER_ART`）、`data/gather.test.ts`、`data/gather.zh-TW.ts`（`GATHER_TEXT`，空的槽）、`engine/dungeon/gather.ts`（`placeGather`）、`engine/dungeon/gather.test.ts`、`engine/gather.ts`（產量、聲響、地區規則、預告、選句、存檔的形狀與修復）、`engine/gather.test.ts`、`engine/gather.economy.test.ts`、`engine/gather.guard.test.ts`、`engine/gather.legacy.test.ts`、`engine/gather.points.test.ts`、`engine/__fixtures__/gather/points.json`、`engine/forge/gatherTools.ts`、`engine/forge/gatherTools.test.ts`、`ui2/debugGather.ts`。
3. **`data/gather.ts` 的介面**（A1）：
   - `GATHER_SWITCH: { live: boolean; open: (s: GameState) => boolean } = { live: false, open: (s) => s.story.seen.includes('first-return') }`、`gatherOpen(s)`、`GATHER_SALT = 0xe9b5dba5`。
   - `GatherType = 'vein' | 'herb' | 'fungus' | 'crystal' | 'spot'`；`GENERIC_TYPES`（四種，順序固定）；`REGION_WEIGHTS: Record<RegionId, Record<Exclude<GatherType, 'spot'>, number>>`（spec §5.3 的表）；`SPOT_CHANCE = 0.35`；`RICH_CHANCE = 0.15`、`RICH_BONUS = 2`、`RICH_NOISE = 15`；`DEEP_AT = 15`；`COUNT_CUTS = [0.25, 0.75]`；`gatherQty(roll12, depth) = roll12 + ⌊min(depth, 60) ÷ 20⌋`。
   - `GATHER_TABLE`、`SPOT_OF: Record<Exclude<RegionId, 'mainline'>, string>`、`GATHER_MATERIALS: MaterialDef[]`（spec §7.1 的十四列，`kind: 'gather'`）、`gatherTypeOf(id)`、`spotRegionOf(id)`、`isDeep(id)`。
   - `SpotRule = 'scald' | 'hush' | 'charge' | 'fumes' | 'hidden' | 'clang'`；`SPOT_RULES: Record<Exclude<RegionId, 'mainline'>, { rule: SpotRule; noiseMul: number; qtyMul: number; qtyAdd: number; hurt?: 'hurt' | 'poison'; tp?: true; hidden?: true }>`（spec §5.3 的表：熾焰 `scald`（`hurt: 'hurt'`）、霜凍 `hush`（`noiseMul: 0`）、雷鳴 `charge`（`tp: true`、`qtyAdd: 1`）、腐毒 `fumes`（`hurt: 'poison'`）、暗影 `hidden`（`noiseMul: 0.5`、`hidden: true`）、鋼鐵 `clang`（`noiseMul: 2`、`qtyMul: 2`））。
   - `GatherMode = 'light' | 'full'`；`GATHER_NOISE = 30`、`GATHER_NOISE_TOOL2 = 20`、`LIGHT_SHARE = 0.5`；`TOOL_LEVELS`（spec §6.3 的兩列：名稱鍵、材料 `Cost`、前提）；`GATHER_RECIPES: Record<string, Cost>`（spec §7.2）；`GATHER_PIN_QTY = 2`；`GATHER_FLOOR_CAP(d) = 600 + 10 × min(d, 60)`；`GATHER_MAX = 1e9`；`GATHER_ART: ReadonlySet<string>`（空，PR E 填）。
4. **`engine/gather.ts` 的介面**（A3、A5）：
   - `outcome(s, c, mode, encounter, step: { mod: number; rate: [number, number] }): { qty; noise; gauge: { from; to }; danger: { from; to }; next: 'never' | 'maybe' | 'sure'; toll?: Record<CharacterId, { hp?: number; tp?: number }> }`：spec §5.4 的公式，**唯一的一份**；`toll` 是每一位活著的已加入成員（含不在場上的）的實際變化（`hp − max(1, hp − n)`、`min(tp, ⌊maxTP × 20 ÷ 100⌋)`）；`next` 照 spec §5.4 的 `gMin`／`gMax`。`Game.gatherPreview()` 與 `Game.gather(mode)` 都呼叫它，`step` 由 `Game` 照 `walk()` 的同一個算式給（把 `walk()` 裡的 `mod` 算式抽成私有方法 `stepMod()`，`walk()` 改呼叫它，行為與抽取不變）（spec §11 第 8 條）。
   - `gatherAt(run, depth, pos)`、`spotGather(run, depth, partyPos, explored)`（暗影的特產：已探索而且八方向距離 ≤ 1 就加進 `run.spotted`；`Game.revealHere()` 之後呼叫）、`visibleGather(run, depth, c)`（暗影的特產看 `run.spotted`，其他照舊）、`remarkFor(s, run, c)`、`innerFor(s, item)`、`isGather(v)`、`repairGather(d)`。
   - `Game`：`gatherHere(): { type; item; rich; rule? } | null`（唯讀；`run.gather` 為假回 `null`）、`gatherPreview(): { light; full; rule? } | null`、`gather(mode): GatherResult`、`craftTool(level)`、`craftItem(id, n, alt?)`（既有方法加可選參數）、重鑄的 `mat` 接受特產。全部在 `gatherOpen(this.state)` 或 `run.gather` 之下，否則 `{ kind: 'none' }`、`null` 或 `{ ok: false, reason: 'locked' }`。
5. **`placeGather` 的抽法**：照 spec §5.2 的順序寫死（點數 → 每一點：房間、格子、種類、數量、豐、素材），註解逐步編號。候選房間以 id 排序、格子逐列由左到右；`pickWeighted` 寫成本檔的私有函式（照 `engine/guild.ts:203-211`，不 import 公會的；權重 0 的項目永遠不中）。
6. **選句的規則**（spec §9.2；文字槽空著時永遠不說）：`remarkFor` 只在 `!run.gatherTalked` 時給鍵，給了之後 `Game.gather` 設 `run.gatherTalked = true`；順序 `['sylvie', 'bobby', 'liz']` 依點的種類（`REMARK_TYPES`：希爾薇 `herb`、`fungus`；波比 `vein`、`crystal`；莉茲 `crystal`、`spot`），都不符合而凜在場就凜（`any`）；「在場」＝在 `party.grid` 而且 `hp > 0`；**那一位的池是空的就不給鍵，也不往下找**（填字之後的行為和現在的規則一致）。句子的索引＝採集前 `Σ got` 對池長取餘數。`innerFor`：採集前 `got` 是空的 → `first`；這次的素材是深層、而且採集前沒有任何深層素材的 `got` → `deep`；兩者都成立時只給 `first`；池是空的就不給。`gatherTalked` 只在真的給了鍵時才設（空池不佔掉這一趟的「第一次」）。
7. **存檔的形狀**（A5）：`isGather(v)`：物件；`tool` 不存在或是 1、2；`got` 是非負整數的計數（`isCounts` 的寫法、上限 `GATHER_MAX`）；多的鍵算損毀。`repairGather(d)`：`got` 裡不在 `MATERIALS` 或種類不是 `gather` 的鍵丟掉（不是損毀）；`got` 變空而且沒有 `tool` 就整個欄位拿掉。
8. **快照的做法**：
   - **名冊的樓層快照照用**：`engine/floors.snapshot.test.ts` 的 fixture 不重錄；A2 只在 `TILE_CODE` 加 `gather: 'G'`（型別要求）。
   - **去掉採集點就是原樣**（`engine/gather.legacy.test.ts`，A2）：在 `withRosterOnly([])` 下，`newRun` 之後設 `run.gather = true`，把每一層的 `'gather'` 格改回 `'floor'`、拿掉 `kind: 'gather'` 的內容，整份等於 `__fixtures__/roster/floors.before.json`。
   - **點的位置釘住**（`engine/gather.points.test.ts`，A2 錄）：種子 1–3 × 七個地區 × 深度 1–40 的每一點 `{ at, room, type, item, qty, rich }`，`GATHER_RECORD=1` 寫 `engine/__fixtures__/gather/points.json`；A2 之後任何任務都不准重錄；fixture 不存在時失敗。
   - **相對比較補快照沒有的情況**（A2，審查 L5）：同一個 `Run` 開與關（關的那一份就是今天的程式），去掉採集點之後逐一相同，樣本涵蓋：`rescuesFor` 給的救援房（迷宮裡的相遇與鎮上加入的相遇房）、強制的回憶光點（測試直接設 `run.glimmers[depth]`）、上線的守關者（`withRosterLive` 的守關者層 8、13、18⋯⋯），v6 3.1 合併後再加相遇房清理的情況。
   - **不採集的潛行就是原樣**（A3）：計畫裁定 16。若潛行的找路輔助函式把不認得的格子當牆（A0 Step 2 會先讀），在**測試檔的輔助函式**裡把 `'gather'` 加進可走的格子，列進報告；任何 fixture 都不動。
9. **`GATHER_ART` 閘門**（A1）：`render/artPaths.ts:241` 的素材圖示清單，`kind === 'gather'` 的素材只收 `GATHER_ART.has(id)` 的；所以 A1 加了十四個素材，`allArtUrls` 的總數與 manifest 測試都不變。介面上的圖示一律經 `lateArt`，`ctx.art.has` 為假就不畫。
10. **文字槽的接線**（B1，照公會計畫裁定 16 的做法）：`storyTexts()` 在走完 `STORY` 之後另走 `walk(GATHER_TEXT, ['gather'])`；`speakerOf` 加 `top === 'gather'` 的分支：`remarks.<c>.*` → `c`、`inner.*` → `hero`、`doran.*` → `doran`；前綴 `gather.` 加進 `voice.test.ts` 的 `POLISHED`；`position()` 給 `gather.` 一個「`first-return` 之後」的位置（`position()` 能表示的最早一格；若沒有比 `act1` 更早的，就用 `act1`，寫進報告）。槽全部是空陣列，所以這些檢查今天走過零句；B1 用一份測試專用的非空 `GATHER_TEXT` 驗每一個鍵都解得出說話者。
11. **系統文字的規則**（B1、B3）：`T.ui2.gather` 只寫中性的介面說明（spec §9.1）：不帶角色口吻、不解釋迷宮／燈／霧／碎片、數字用阿拉伯數字、零個「……」、零個「！」。所有新名稱（點名、素材名、規則名、工具名）在 A1 加進名冊 A5 的秘密詞掃描。不寫帳本、不做冷讀。
12. **e2e 的開關**：照公會的 `ui2/debugGuild.ts`，`ui2/debugGather.ts` 只在 dev build 把 `GATHER_SWITCH` 掛到除錯把手上（`import.meta.env.DEV`），讓 B4 的可讀性 e2e 在開關關著時也能量畫面；production 的 console 不准打開。
13. **公會的鍵**（C1）：收購的紙條鍵由素材決定：`monster` → `deliverMonster`、`region` → `deliverRegion`、`trophy` → `deliverTrophy`（公會 B 的既有鍵）、`gather` 的草與菇 → `deliverPantry`、其他 → `deliverOre`。兩個新鍵在 `data/guild.zh-TW.ts` 只註冊、字串空著。公會 PR C1（`speakerOf` 的公會分支）若已合併，C1 把兩個鍵加進它的對應（瑪莎、多蘭）；若還沒，C1 在公會計畫 SDD 的 carry 記一條「公會 C1 要涵蓋 `deliverPantry`、`deliverOre`」，不動公會的守門檔。釘住紙條數量的測試若已存在，照實際值更新，意圖不變。
14. **重鑄釘選的介面**：素材清單的順序：地區素材照舊在前，特產接在後面（`REGIONS` 的順序）；手上不到 2 個的特產不列。
15. **視窗的游標預設**（B2）：全力會讓燈變紅、輕手不會 → 輕手；其他情況 → 全力；`離開` 永遠在最後。用 `eventWindow` 的 `start` 參數。
16. **「開著但不採」的證明要真的開著**（審查 H1，spec §5.5 第 3 條）：
    - `withGatherLive(f, opts?: { open?: boolean })`：`open: true` → `GATHER_SWITCH.open = () => true`（一律打開，不靠 `first-return`）；`open: false` → 一律關；不給 → 照預設。`finally` 還原 `live` 與 `open`。
    - `engine/storyL.dive.test.ts` 與 `engine/guild.legacy.test.ts` 的採集情境一律用 `{ open: true }`，比對**同一份** fixture，另加非空的斷言：腳本裡至少一次出發之後 `game.run.gather === true`；腳本走過的樓層裡（`game.run.floors` 的每一層）至少一層有 `kind: 'gather'` 的內容。
    - 新檔 `engine/gather.walk.test.ts`：種子固定的 `Game`、`withGatherLive(f, { open: true })`、本道與一個地區各一段，跨至少三層；每一層用測試檔裡的 BFS（只走 `tileAt !== 'wall'`）依序走到每一個採集點、再走到樓梯，全部用 `move()`，戰鬥用 `engine/testing.ts` 既有的固定打法打完；記下 `game.rng` 的抽取次數（注入計數的 `rng`）、每一場遇敵的層與位置、每一場戰鬥紀錄的 SHA-256。第二次：同樣的種子、同樣的路線（第一次記下每一層要走過的座標序列，第二次照走），但每進一層、第一次 `move` 之前，測試就把 `floorOf(game.run, game.floor)` 快取裡的 `'gather'` 改回 `'floor'`、拿掉內容；兩次逐一相同。斷言第一次踩過的點 ≥ 3。沒有 fixture，不錄任何東西。
    - **會壞才算證明**：A3 的 Step 2b：暫時把 `floorOf` 的 `placeGather` 那一行改成什麼都不做（不 commit），跑上面三個檔：非空的斷言與「踩過的點 ≥ 3」必須紅；紅了就把那一行改回來，紀錄存 SDD `A/task-A3-stub.txt`。
17. **出發層也有點**（審查 M2）：`depart()` 裡 `this.run = newRun(...)` 的下一行就設 `this.run.gather = true`（`gatherOpen` 時），在 `this.forceGlimmers(startDepth)` 與 `this.map()` 之前；A3 有一條測試：用一個在出發層會放點的種子（測試裡先以 `floorOf` 算好），出發之後 `game.map()` 的那一層有點。
18. **裝不下的重試**（審查 M1）：B2 的 `gatherFull(host, r, mode)` 開 `fullLayer(host, r, () => afterGather(host, game.gather(mode), mode), undefined, [], { left: T.ui2.gather.left })`；`fullLayer` 加一個可選的最後參數 `opts?: { left?: string }`，放棄時說 `opts.left ?? F.left`（既有的呼叫不變）。
19. **公會的上限另開**（審查 M3，spec §8.4）：`engine/guild.economy.test.ts` 的 `capSweep`、它釘住的最壞值與 `BOARD_CAP_EXCEPTIONS` 一個字都不動；C1 加 `gatherCapSweep()`（同一套評等 × 深度 × 種子，存檔情境多「全部採集素材 `got ≥ 1`」）、`GATHER_BOARD_WORST`（完整抽樣量到的合理組合最壞值，逐字釘住）、`GATHER_BOARD_EXCEPTIONS`（空，或量到才寫）。平常跑每組前 40 個種子，`GUILD_CAP_FULL=1` 跑完整的。
20. **和公會 PR D 疊在一起**（審查 M4，spec §5.5 第 4 條）：公會 PR D 會打開 `GUILD_LIVE`，並改 `engine/guild.legacy.test.ts` 原情境的比對方式（它的計畫 D1：解鎖之後刪掉 `guild` 欄位再比）。採集的情境照 PR D 留下的做法疊：PR D 刪欄位，採集的情境也在同一個時點刪 `guild`；PR D 若改用 `withGuildLive(…, { open: false })`，採集的情境包在它裡面。A3 的最後一步：公會 PR D 合併之後，把 A3 rebase 到新的 `origin/master`，重跑城鎮快照的兩個情境，報告寫明用的是哪一種。A3 若在 PR D 之後才開工，直接照當時的樣子寫。
21. **列的 id**（審查 L6）：消耗品的採集配方 `<道具 id>@gather`、工具 `tool@1`、`tool@2`；`pick` 以 `@` 拆開。測試釘住同一個清單裡沒有重複的 id。
22. **視窗的圖**（審查 L4）：B2 的採集視窗不呼叫 `bestPicture`／`eventArt`；`eventWindow` 對 `'gather'` 和 `'full'`、`'stairs'` 一樣跳過圖；E4 才接 `art.gatherTile`。

## 分期與 PR

| PR | 分支 | 內容 | 任務 | sim gate | 美術 |
|---|---|---|---|---|---|
| **A** 骨架 | `feat/starlantern-gather-a` | 基準、開關與資料、放置、採集與預告、鍛造、存檔、經濟 | A0–A6（7） | identical | 0 |
| **B** 介面 | `feat/starlantern-gather-b` | 系統文字、地圖標記、文字槽的接線；提示與採集視窗；鍛造屋與道具店；介面收尾 | B1–B4（4） | identical | 0 |
| **C** 公會收購 | `feat/starlantern-gather-guild` | 收購池、委託人對應、布告上限的完整抽樣 | C1（1） | identical | 0 |
| **D** 上線 | `feat/starlantern-gather-live` | 打開 `GATHER_LIVE`、e2e | D1–D2（2） | identical | 0 |
| **E** 美術（等使用者） | `feat/starlantern-gather-art` | 點的地磚 ×10、素材圖示 ×14、工具圖示 ×2：契約、樣本、生成與發布、介面接線 | E1–E4（4） | 不跑（E4 只動 `ui2/`、`render/`） | 26 張 |

合計 5 個 PR、18 個任務。每一個任務的普通帶報告都是 `gate: identical`（採集不碰戰鬥與掉落）；沒有任何任務可以重錄 sim gate。沒有寫作任務。

---

## Global Constraints

**使用者的方向（最高依據）**
- 「先把遊戲本身做好」：內容、功能、玩家體驗；平衡不是優先（`starlantern-balance-not-priority`），但不能有漏洞。
- 2026-10-30：劇情整體還沒定，暫停劇情工作，專心做玩法：本計畫不寫任何角色或鎮民的台詞、不做冷讀、不寫帳本；只有中性的系統文字與空的文字槽。
- 只有畫風與重大取捨找使用者；技術規格、數值由控制者決定。本計畫唯一要使用者的是 PR E 的點的地磚樣本（spec §15）。

**分支與基準**
- 計畫與 spec 定案在 `docs/starlantern-gathering`（本 commit）。每個 PR 的實作分支從開工時的 `origin/master` 開出，先 cherry-pick 本計畫的 commit（若還沒合併）。
- 開工前 `git status` 乾淨；要改的檔案有別人未提交的修改，NEEDS_CONTEXT。

**模擬閘門**（每一個碰到 `engine/`、`data/` 的任務都跑；每個 PR 的第一個任務錄 `gate-0`）
- 指令：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-0 > <SDD>/gate-<N>.stdout`。
- 每一個任務：最後一行必須是 `gate: identical`；`cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
- `engine/parity.test.ts` 的 `PARITY_TASK` 維持 `between plans`；本計畫不錄任何 `contribution.*.json`。
- **逐位元的其他證據**（每個碰 `engine/`、`data/` 的任務都跑，一律不重錄；任何一個紅就 BLOCKED）：
  - `engine/legacyFights.test.ts`（釘子不變）
  - `engine/floors.snapshot.test.ts`（A2 起只多 `TILE_CODE` 的一列）
  - `engine/storyL.dive.test.ts`（`STORY_L_RECORD` 不准設；A3 起多一個 `withGatherLive` 的 `it`，同一份 fixture）
  - `engine/guild.legacy.test.ts`（`GUILD_RECORD` 不准設；A3 起多一個 `withGatherLive` 的情境，同一份 fixture）
  - `engine/meetings.hash.test.ts`（v6 計畫 3.1 合併之後才有；有就跑）
  - `engine/gather.legacy.test.ts`、`engine/gather.points.test.ts`（A2 起；`GATHER_RECORD` 只在 A2 錄 fixture 時設）
  - `engine/gather.walk.test.ts`（A3 起；相對比較，沒有 fixture）
- 不用 `Math.random`、不讀 `Date`；不為新內容多抽任何既有串流。新串流只有 `GATHER_SALT` 那一條，只在 `placeGather` 用。

**測試與檢查**
- **TDD**：先寫失敗的測試，確認它因正確的理由失敗，再實作。美術任務照工具測試先行。
- **vitest**：單檔 `rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套 `rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`（watch 模式）。
- **tsc**：`rtk proxy npx tsc --noEmit -p .`。`src/scripts/games/starlantern/` 與 `tests/e2e/starlantern*.ts` 底下 0 個；全 repo 總數不多於 PR 開工時 `baseline.md` 記的值。
- **e2e**：`E2E_PORT=4353 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts --project=chromium --project=chromium-dpr125 --project=chromium-dpr150`。一律 headless、靜音（不可以拿掉 `--mute-audio`）。**絕不用 4354**；不結束任何程序。**不用 Playwright MCP 或任何瀏覽器 MCP 工具**（`mcp__plugin_playwright_*`、Claude in Chrome、內建瀏覽器、computer-use）。
- **重的工作**（閘門、e2e、全套、`GUILD_CAP_FULL=1`、經濟測試的一千種子抽樣、生成）之前：照控制者當時指定的 `heavy.lock` 規則（檔案已存在就等，絕不結束程序）；沒有指定時 PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` ≥ 6291456（KB），一次只跑一套重的工作；瑪奇的模擬器（LDPlayer）在跑時先問控制者（`heavy-tests-yield-to-emulators`）。
- 本專案沒有 prettier、eslint。一次性的探測程式跑完就刪，絕不 commit。
- **測試修改規則**：每個任務的 Files 列出已知會紅的既有測試與改法；不放寬門檻、不刪斷言、不加 `skip`／`only`／`todo`／`it.fails`；全套出現沒列到的紅燈就 NEEDS_CONTEXT。
- **抽樣的大小**：一千種子 × 七地區 × 六十層的測試（A2、A6）平常跑每組前 40 個種子，`GATHER_FULL=1` 跑完整的一千（照公會 `GUILD_CAP_FULL` 的做法）；每個 PR 的最後一個碰 `engine/` 的任務跑一次完整的，結果記進報告。

**決定性**
- `engine/dungeon/gather.ts` 只用呼叫者給的 `rng`；`engine/gather.ts`、`engine/forge/gatherTools.ts` 一個亂數都不抽（`engine/gather.guard.test.ts` 掃原始碼、`Game` 層的計數測試）。
- 一層的點由 `(run.seed, depth, region)` 決定；同一個 `Run` 同一層只生成一次（`run.floors` 快取）。
- 預告與結果是同一個函式（計畫裁定 4 的 `outcome`）。
- 所有清單與候選依資料表或房間 id 的順序，不依 `Set` 或物件插入以外的不穩定順序。

**存檔**：新欄位只有 `GameState.gather?`（spec §0 第 16 條）；`SAVE_VERSION` 維持 9；不寫遷移。`Run.gather`、`Run.gatherTalked` 不存檔。

**平衡（凍結）**
- `balance*.test.ts`、`builds.bands.*.test.ts`、`tierBands*.test.ts`、`tierBands.ts`、`buildBands.ts`、`legacyFights.test.ts` 一個字都不改。
- 不動任何既有旋鈕（`ENEMY_POWER`、`ELITE`、`GEAR_CHANCE`、`TIERS`、`AFFIXES`、`BOND_*`、`SHARD_*`、`TOWN_DROP`、`RUNE_*`、`PERKS`、`ENCOUNTER_PACE`、`FLOORS` 的 `rate`、`trapDamage`、`POISON_TP_LOSS_PCT`、`CONSUMABLE_RECIPES`、`REROLL`、店價、賣價、公會的公式）。採集只「加」東西、只「讀」既有的數字。
- 採集的數字（`data/gather.ts`）是【起始提案】；`GATHER_FLOOR_CAP` 紅了只調一次公式，還紅就具名例外加待辦，不卡上線。正確性的經濟測試（spec §11 第 1–4、6–8 條）不准放寬。

**文字**
- 只有系統文字（計畫裁定 11），放 `data/text.zh-TW.ts` 的 `T.ui2.gather`；`data/gather.zh-TW.ts` 只放空的槽。先 grep 確認不撞名。
- 「冒險者公會」不寫成「冒險公會」、「菁英」不寫成「精英」、「回復」不寫成「恢復」（`data/terms.test.ts`）；v6 的 T10（「姑娘」「一刻鐘」「時辰」）照舊。
- 每一個新字都要在 Cubic 11 裡（`data/glyphs.test.ts`；spec §3 已量過 spec 裡的名字與介面字）。不用 ▶ ◀ ▸ ▾。
- 字級只有 12／24 px（`ui2/typeScale.test.ts`）；新介面只用既有元件（`eventWindow`、對話框、`tapper`、`MenuView`、`win`、`confirmBox`、鍛造屋的清單＋詳細欄）；SCSS 只改 `src/styles/_starlantern-ui.scss`，禁 `!important`、行內樣式、`element.style`。
- **介面不顯示任何佔位文字**：文字槽空著時，什麼都不說。

**換行**（改檔前 `git ls-files --eol <檔>`，改完 `git diff --stat` 必須等於 `git diff --stat --ignore-cr-at-eol`；整檔被改寫就是換行壞了，立刻再改一次修回；CRLF 與混用檔不可以用 `sed -i`；新檔一律 LF。2026-10-30 量到的：）
- LF：`data/{forge,guild,materials,monsters,monsters.test}.ts`、`data/story/voiceGates.ts`、`engine/dungeon/{rooms,run}.ts`、`engine/floors.snapshot.test.ts`、`engine/forge/{cost,craft,uses}.ts`、`engine/{guild,guild.test,guild.economy.test}.ts`、`render/markers.ts`、`ui2/minimap.ts`、`ui2/scenes/{dungeon,event,forge,forgeCraft}.ts`、`docs/superpowers/**/*.md`。
- CRLF：`engine/{map,state,testing,types,game.test}.ts`、`render/artPaths.ts`、`ui2/scenes/shop.ts`、`art-factory/starlantern/contract.md`。
- 混用（新行照相鄰行）：`data/text.zh-TW.ts`、`engine/{game,save,save.test}.ts`、`render/MapView.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`。
- 上面沒列到的檔，動手前一律先 `git ls-files --eol` 量。

**git**
- 用完整路徑 add，不可以 `git add -A`／`git add .`。
- Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不可以 `git checkout -- <path>`、`restore`、`reset`、`stash`、`clean`、`worktree remove --force`；要撤回就再改一次檔案。不 push（控制者在驗收後決定）。不碰 `.env`、智能合約、部署腳本。

**收尾 G（每個任務）**
1. 全套全綠；tsc 符合上面的條件。
2. 碰到 `engine/`、`data/` 時跑閘門（`gate-<N>`）與 `cmp`，以及「逐位元的其他證據」的每一個測試檔。
3. 動到 `ui2/`、`render/`、`src/styles/`、`tests/e2e/` 時，或改到的字串在 `tests/e2e/starlantern.spec.ts` 裡逐字出現時（先 grep），跑 e2e 三個專案並全綠。
4. 換行檢查（`git diff --stat` 兩種寫法相同）。
5. 報告：新增與修改的測試名；全套兩行、tsc 數字、閘門與 e2e 結果（沒跑寫理由）；改了哪些既有斷言；偏離本計畫的地方與理由。

**子代理**：實作者不派子代理。審查與美術的視覺檢查由控制者另派全新脈絡的代理，模型 Opus；子代理一律不准用瀏覽器 MCP 或 computer-use。

## Review Focus

1. **關著或沒打開就是今天的遊戲**：`GATHER_LIVE` 為假、或 `first-return` 還沒看過時，沒有點、沒有提示、沒有 `gather` 欄位、鍛造屋與收購池不變、閘門 identical、快照不動。→ A0、A2、A3、D1。
2. **舊樓層不動**：採集是 `floorOf` 的最後一步、只用 `GATHER_SALT` 的串流、只改空地板；去掉採集點的樓層等於名冊的樓層快照。→ A2。
3. **開著不採就不動，而且證明不是空的**：踩上去照 `walk()`；`gather()`、`gatherPreview()` 一個亂數都不抽；潛行與城鎮快照在 `withGatherLive(f, { open: true })` 下逐一相同而且非空；真的踩過點的行走等於改回地板的行走；換掉 `placeGather` 時會紅（計畫裁定 16）。→ A3。
4. **選擇是真的、資訊是完整的**：兩種採法的數量、計量前後的數字、燈、下一步（照 `mod`）、地區規則的 HP／TP 都在視窗裡；預告等於結果；豐點與暗影的特產（`run.spotted`）照規則顯示；出發層就有點；裝不下時丟東西再採重跑的是同一個 `gather(mode)`。→ A3、A6、B2。
5. **沒有迴圈、沒有刷**：採集素材只能採到；做出的消耗品不能賣；工具一次性；一點一次；重新整理回到出發前。→ A4、A6、C1。
6. **讀檔一致**：同一趟同一層同一份點；在迷宮裡重新整理，背包、`got`、點、HP／TP 全部回去；打工具立刻存檔。→ A3、A5。
7. **介面只用既有元件、沒有台詞**：提示不搶輸入；`eventWindow`；12 px；沒有行內樣式；晚到的圖不畫佔位；迷宮選單仍是 12 列；文字槽空著時畫面上沒有任何多出來的話。→ B 系列。

---

## 檔案結構

**新增**：`data/gather.ts`、`data/gather.test.ts`、`data/gather.zh-TW.ts`、`engine/dungeon/gather.ts`、`engine/dungeon/gather.test.ts`、`engine/gather.ts`、`engine/gather.test.ts`、`engine/gather.economy.test.ts`、`engine/gather.guard.test.ts`、`engine/gather.legacy.test.ts`、`engine/gather.points.test.ts`、`engine/gather.walk.test.ts`、`engine/__fixtures__/gather/points.json`、`engine/forge/gatherTools.ts`、`engine/forge/gatherTools.test.ts`、`ui2/debugGather.ts`；PR E：`art-factory/starlantern/tools/gather_art.py`、`test_gather_art.py`。

**修改**：
- 資料：`data/materials.ts`（展開 `GATHER_MATERIALS`）、`data/text.zh-TW.ts`（`T.forge.kind.gather`、`T.forge.use` 的 `tool`、`T.ui2.gather`）、`data/monsters.test.ts`（`salts are distinct`、名字掃描）、`data/story/voiceGates.ts`、`data/story/voice.test.ts`、`data/story/story.test.ts`（`position()`）；PR C：`data/guild.ts`、`data/guild.zh-TW.ts`（兩個空鍵）。
- 引擎：`engine/types.ts`（`MaterialKind`）、`engine/map.ts`（`Tile`）、`engine/dungeon/rooms.ts`（`Content` 的種類與 `gather` 欄位、`TILE`）、`engine/dungeon/run.ts`（`Run.gather?`、`Run.gatherTalked?`、`floorOf` 最後一行）、`engine/state.ts`（`GatherState`、`GameState.gather?`）、`engine/save.ts`、`engine/game.ts`（`depart`、`gatherHere`、`gatherPreview`、`gather`、`craftTool`、`craftItem` 的可選參數、重鑄的 `mat`）、`engine/forge/{craft,cost,uses}.ts`、`engine/testing.ts`（`withGatherLive`）；測試：`engine/floors.snapshot.test.ts`（`TILE_CODE` 一列）、`engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`、`engine/game.test.ts`、`engine/save.test.ts`、`engine/forge/{craft,cost,uses}.test.ts`；PR C：`engine/guild.ts`、`engine/guild.test.ts`、`engine/guild.economy.test.ts`、`ui2/scenes/board.ts`。
- 介面：`render/markers.ts`、`render/MapView.ts`、`render/artPaths.ts`（`GATHER_ART` 閘門；PR E 加 `art.gatherTile`、`art.toolIcon`）、`ui2/minimap.ts`、`ui2/scenes/{dungeon,event,forgeCraft,shop}.ts`（shop 只在需要時）、`ui2/main.ts`（掛除錯把手，照 `guildHandle` 的掛法）、`ui2/lateArtScenes.test.ts`、`src/styles/_starlantern-ui.scss`。
- 文件：spec §0（計畫裁定抄回）。
- e2e：`tests/e2e/starlantern.spec.ts`（B4、D2）。
- 美術（PR E）：`art-factory/starlantern/{contract.md,registry.json}`、`public/assets/games/starlantern/{tiles,icon}/`、manifest、`render/artPaths.test.ts`。
- **不改**：凍結的平衡檔、`data/story.zh-TW.ts`、`data/story/scenes.ts`、`data/bond.zh-TW.ts`、`data/guild.zh-TW.ts` 的既有字串、帳本、聖經、`data/items.ts`、`data/forge.ts`（`CONSUMABLE_RECIPES`、`REROLL` 原樣；新配方在 `data/gather.ts`）、`data/floors.ts`、`engine/battle.ts`、`engine/encounter.ts`、`engine/events.ts`（`trapDamage` 只讀）、`engine/loot/*.ts`、`engine/dungeon/gen.ts`、`engine/story/*.ts`、`engine/__fixtures__/sim-gate/`、`engine/__fixtures__/roster/`、`engine/__fixtures__/story-l/`、`engine/__fixtures__/guild/`。`engine/game.ts` 的 `move()`、`springTrap()` 一行不改；`walk()` 唯一的改動是把 `mod` 的算式抽成私有方法 `stepMod()` 再呼叫它（同一個算式、同樣的抽取；由逐位元的證據保護，計畫裁定 4）。

---

# PR A：骨架（資料、放置、採集、鍛造、存檔、經濟；開關關著）

### Task A0：基準

**Files:**
- SDD `A/baseline.md`。

- [ ] **Step 1**：`git status` 乾淨；`baseline.md` 記下 `git rev-parse HEAD`、tsc 總數與 starlantern 底下的數字、全套兩行、`Object.keys(MATERIALS).length`、`legacyFights.test.ts` 的兩個釘子值、`allArtUrls()` 的長度、v6 計畫 3.1 是否已合併（`engine/meetings.hash.test.ts` 在不在；`floorOf` 最後一行是什麼）、公會計畫 PR C 是否已合併、`trapDamage` 與 `POISON_TP_LOSS_PCT` 的位置與簽名。
- [ ] **Step 2**：讀 `engine/storyL.dive.test.ts` 的找路輔助函式：它把哪些格子當成可以走（`tileAt(...) !== 'wall'`，或一份白名單）。記進 `baseline.md`；A3 依此決定要不要在測試檔的輔助函式加 `'gather'`（計畫裁定 8）。`engine/guild.legacy.test.ts` 的腳本同樣讀一次。
- [ ] **Step 3**：grep 既有測試裡釘住素材總數、`Tile`、`MaterialKind`、`Content['kind']`、`MarkerKind`、`EventKind`、`MaterialUse` 的地方（`Record<Tile`、`Record<MaterialKind`、`Record<MarkerKind`、`MATERIALS).length`、`toHaveLength(120)` 這類），清單記進 `baseline.md`；A1、A2、B1 的「已知會紅」以這份清單為準。
- [ ] **Step 4**：閘門錄 `gate-0`（第一次對自己比），`cmp` 沒有輸出；逐位元的其他證據全綠。
- [ ] **Step 5**：e2e 三個專案各跑一次，通過數記進 `baseline.md`。（A0 不 commit 程式；`baseline.md` 在 SDD 裡。）

### Task A1：開關、鹽與資料表

**Files:**
- Create：`data/gather.ts`、`data/gather.test.ts`。
- Modify：`engine/types.ts`（`MaterialKind` 加 `'gather'`）、`data/materials.ts`（`MATERIALS` 的展開最後加 `...GATHER_MATERIALS`，註解改成「22＋98＋14」）、`data/text.zh-TW.ts`（`T.forge.kind.gather = '採集素材'`）、`render/artPaths.ts`（計畫裁定 9 的 `GATHER_ART` 閘門）、`engine/testing.ts`（`withGatherLive(f, opts?: { open?: boolean })`，照 `withGuildLive`，但 `open: true` 一律打開、`open: false` 一律關，計畫裁定 16）、`data/monsters.test.ts`（`salts are distinct` 加 `GATHER_SALT`；名字掃描涵蓋十四個素材名、spec §5.1 與 §5.3 的點名與規則名、spec §6.3 的工具名：若 `SECRET_WORDS` 的掃描範圍沒有素材，就在同一個 `describe` 加一個 `it` 掃它們）。
- 已知會紅與改法：`T.forge.kind` 是 `Record<MaterialKind, string>`，本任務同時加 `gather`（tsc 的紅在同一個任務消掉）；A0 Step 3 清單裡釘住素材總數的測試：照實際值 +14，意圖不變，列進報告；`render/artPaths.test.ts` 的總數**不准變**（閘門擋住了），變了就是閘門寫錯。

**Interfaces（`data/gather.ts`）**：計畫裁定 3 的全部。

- [ ] **Step 1：寫失敗的測試**（`data/gather.test.ts`）：
  - `the switch is off`：`GATHER_SWITCH.live === false`；`withGatherLive` 之內為真、之後還原，丟例外也還原；`{ open: false }` 時 `gatherOpen` 對看過 `first-return` 的狀態也是假；`{ open: true }` 時對新遊戲也是真；之後 `open` 還原成預設；預設的 `open` 對新遊戲為假、對 `story.seen` 含 `first-return` 的狀態為真；
  - `fourteen gathered materials`：`GATHER_MATERIALS` 的 id、名稱、價格逐列等於 spec §7.1；種類都是 `gather`；沒有 `owner`；id 與名稱不和任何既有素材、道具、裝備撞名；都在 `MATERIALS` 裡而且排在最後十四個；
  - `every point has its materials`：`GATHER_TABLE` 四種各有淺、深；`SPOT_OF` 六個地區各一個、彼此不同；`gatherTypeOf`、`spotRegionOf`、`isDeep` 對十四個都答得出；
  - `every region has its character`：`REGION_WEIGHTS` 七個地區逐列等於 spec §5.3；每一列至少一個正數；`SPOT_RULES` 六個地區逐列等於 spec §5.3（規則、倍數、加值、傷害種類）；
  - `the numbers are the spec's`：`SPOT_CHANCE`、`RICH_CHANCE`、`RICH_BONUS`、`RICH_NOISE`、`DEEP_AT`、`COUNT_CUTS`、`gatherQty` 在深度 1、19、20、39、40、59、60、61、250 的值、`GATHER_NOISE`、`GATHER_NOISE_TOOL2`、`LIGHT_SHARE`、`GATHER_PIN_QTY`、`GATHER_FLOOR_CAP(1/20/60/61)`；
  - `tools and recipes use only what exists`：`TOOL_LEVELS` 與 `GATHER_RECIPES` 的每一個材料 id 在 `MATERIALS`；`GATHER_RECIPES` 的每一個鍵都在 `CONSUMABLE_RECIPES` 裡（只是第二種配方，不是新道具）；二級工具要 `ember-glass` 與 `scrap-iron`；
  - `nothing to draw yet`：`GATHER_ART` 是空的；`allArtUrls()` 的長度等於 `baseline.md` 記的值。
  - `data/monsters.test.ts`：`salts are distinct` 加 `expect(GATHER_SALT).toBe(0xe9b5dba5)` 與「不在已用的清單、`WARDEN_SALT`、`TROPHY_SALT`、`GUILD_SALT` 裡」。
- [ ] **Step 2**：執行，確認紅（模組不存在）。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：這些測試檔、`data/glyphs.test.ts`、`data/terms.test.ts`、`render/artPaths.test.ts`、全套、tsc、閘門 identical、逐位元的其他證據。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): gathering switch, salt, regions and the fourteen gathered materials, all off`。

### Task A2：放置（最後一步、自己的串流）

**Files:**
- Create：`engine/dungeon/gather.ts`、`engine/dungeon/gather.test.ts`、`engine/gather.legacy.test.ts`、`engine/gather.points.test.ts`、`engine/__fixtures__/gather/points.json`。
- Modify：`engine/map.ts`（`Tile` 加 `'gather'`）、`engine/dungeon/rooms.ts`（`Content.kind` 加 `'gather'`、`Content.gather?: { type: GatherType; item: string; qty: number; rich?: true }`、`TILE.gather = 'gather'`）、`engine/dungeon/run.ts`（`Run.gather?: true`、`Run.gatherTalked?: true`、`Run.spotted?: Set<string>` 三個可選欄位與註解；`floorOf` 的最後一行，spec §5.2）、`engine/floors.snapshot.test.ts`（`TILE_CODE` 加 `gather: 'G'`，fixture 不動）。
- 已知會紅與改法：`Record<Tile, …>` 與 `Record<Content['kind'], …>` 的每一處（A0 Step 3 的清單，至少 `floors.snapshot.test.ts:23-26`）：補一列，不改任何既有值；任何 fixture 都不重錄。

- [ ] **Step 1：寫失敗的測試**
  - `engine/dungeon/gather.test.ts`：
    - `only empty floor in an inner room`（抽樣大小照 Global Constraints）：種子 × 七個地區 × 深度 1–60：每一點在 `run.gather` 為假時的同一層是 `'floor'`；在不是入口房也不是出口房的房間裡；一個房間最多一點；點數 1–3；
    - `the draws in order`：以一個寫死回傳序列的假 `rng` 驗 spec §5.2 的每一步（點數的切點、房間與格子的排序、本道不出 `spot`、地區 `SPOT_CHANCE` 的判定在權重之前、權重 0 的種類不中（腐毒的晶）、數量公式、豐點的判定在數量之後、`DEEP_AT` 的淺深）；
    - `regions lean their own way`：完整抽樣下，每個地區各種類的比例和 `REGION_WEIGHTS × (1 − SPOT_CHANCE)` 的期望相差不到 3 個百分點；腐毒沒有晶；本道沒有特產；
    - `a fallback floor holds none`：`g.rooms` 是空的時候不放、不抽；
    - `nothing else moves`：同一層開與關，去掉採集點之後的 `map` 與 `contents` 逐一相等（`toEqual`）；
    - `nothing else moves, with rescues, forced glimmers and wardens`（審查 L5，計畫裁定 8）：同上的相對比較，樣本是 `newRun(..., rescuesFor(region, recruited))` 的每一個地區的相遇層、`run.glimmers[depth]` 設了一到兩位的層、`withRosterLive` 之下的守關者層；每一種情況另斷言那一層至少一次真的放了點（不是空樣本）；v6 3.1 已合併時加相遇房清理的層；
    - `the same floor twice`：同一個 `(seed, region, depth)` 生成兩次，點逐一相同。
  - `engine/gather.legacy.test.ts`：計畫裁定 8 的「去掉採集點就是原樣」，比對 `__fixtures__/roster/floors.before.json`；另一個 `it`：`run.gather` 沒設（`newRun` 的預設）時一個點都沒有。
  - `engine/gather.points.test.ts`：計畫裁定 8 的位置釘子；`GATHER_RECORD=1` 寫、否則讀；fixture 不存在時失敗。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。`placeGather` 照計畫裁定 5；`floorOf` 只加最後一行（`if (run.gather) placeGather(...)`），之前的每一行不動；v6 3.1 若已合併，加在它之後（A0 記的）。
- [ ] **Step 4**：錄位置釘子：`GATHER_RECORD=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/gather.points.test.ts`；不帶變數再跑兩次都綠。然後這些測試檔、`engine/dungeon/{rooms,run,gen}.test.ts`、全套、tsc、閘門、逐位元的其他證據。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): gathering points, placed last from a stream of their own`。

### Task A3：採集與預告（`Game.gather`、`Game.gatherPreview`；不抽亂數）

**Files:**
- Create：`engine/gather.ts`、`engine/gather.test.ts`、`engine/gather.guard.test.ts`、`engine/gather.walk.test.ts`。
- Modify：`engine/state.ts`（`GatherState { tool?: 1 | 2; got: Record<string, number> }`、`GameState.gather?`；`newGame` 不寫它）、`engine/game.ts`（`depart`：計畫裁定 17，`newRun` 的下一行設 `run.gather`；`revealHere()` 之後呼叫 `spotGather`；`walk()` 的 `mod` 抽成 `stepMod()`；`gatherHere()`、`gatherPreview()`、`gather(mode)`、`GatherResult` 型別；`move()`、`springTrap()` 不改）、`engine/game.test.ts`、`engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`（各加一個 `withGatherLive(f, { open: true })` 的 `it`／情境，計畫裁定 16、20）。
- 已知會紅：預期沒有。若 A0 Step 2 記的找路輔助函式不把 `'gather'` 當可走，在那個**測試檔的輔助函式**加上它（不動 fixture），列進報告（spec §5.5 第 5 條）。

- [ ] **Step 1：寫失敗的測試**
  - `engine/gather.test.ts`：
    - `the outcome table`：`outcome` 在下列每一格的數量與聲響等於 spec §5.4 的公式（逐一寫成字面值）：一般點／豐點 × 輕手／全力 × 工具 0／1／2 × 六種地區規則；輕手的數量是 `⌈base ÷ 2⌉`、聲響四捨五入；聲響加上之後上限 99；
    - `the gauge and the lamp`：`gauge` 的前後是數字（例 41 → 74）、`danger` 在計量 0、39、40、74、75、98、99 的燈；
    - `the next step`（審查 L1）：`next` 對 `mod` 1、0.5、0.8、0.6、0.3 × 三種地形的 `rate` × 計量 0、20、39、41、69、98、99，等於 spec §5.4 的 `gMin`／`gMax` 規則；另用 `advance()` 本身驗兩端：以回傳固定值的假 `rng`（增量取最小、最大；黃燈判定取 0 與接近 1）跑一次 `advance(v, rng, rate, mod)`，「不會」時兩端都不遇敵、「一定」時兩端都遇敵、「可能」時至少一端遇敵；
    - `the land's toll`（審查 L2）：燙手與毒氣的 `n` 是 `⌈trapDamage(…, depth) ÷ 2⌉`（深度 1、15、40）；每一位的 HP 變化是 `hp − max(1, hp − n)`（含 hp 是 1、比 n 小、比 n 大的人）；帶電的 TP 變化是 `min(tp, ⌊maxTP × 20 ÷ 100⌋)`（含 tp 是 0 的人）；對象是 `party.recruited` 裡活著的每一位，含不在 `party.grid` 的；倒下的不在 `toll` 裡；無聲、藏在暗處、鏗鏘沒有 `toll`；
    - `hidden until spotted`（審查 L3）：暗影的特產在沒探索、或距離 2 時不進 `run.spotted`；已探索而且距離 ≤ 1（八方向）就進；進了之後走遠仍 `visibleGather`；其他點不看 `run.spotted`；
    - `who would speak`：計畫裁定 6 的每一條（順序、在場的定義、凜的退路、空池不給也不往下找、`gatherTalked` 之後不給、索引是 `Σ got` 的餘數）；`innerFor` 的 `first`、`deep`、兩者同時只給 `first`、空池不給；用一份測試專用的非空 `GATHER_TEXT` 驗「有字時會給」；
    - `none of it draws`：上面每一個函式前後狀態 `toEqual`（純函式）。
  - `engine/gather.guard.test.ts`（照 `engine/guild.guard.test.ts` 讀原始碼文字）：`engine/gather.ts`、`engine/forge/gatherTools.ts`（A4 建立後加入）不出現 `this.rng`、`lootRng`、`memoryRng`、`trophyRng`、`runeRng`、`spotRuneRng`、`forgeRng`、`absorbRng`、`affixRng`、`mulberry32(`、`Math.random`、`Date`；`engine/dungeon/gather.ts` 不出現 `mulberry32(`、`Math.random`、`Date`（它只用呼叫者給的 `rng`），而且 `engine/dungeon/run.ts` 裡 `GATHER_SALT` 恰好出現一次。
  - `engine/game.test.ts`（新 `describe('gathering in the game (gathering plan Task A3)')`）：
    - `off, nothing at all`：開關關著，出發之後 `run.gather` 不存在、每一層沒有點、`gatherHere()` 與 `gatherPreview()` 是 `null`、`gather('full')` 是 `{ kind: 'none' }`、`state.gather === undefined`；
    - `on, shut until the first return`：`withGatherLive`（不給 `open`）、`first-return` 沒看過：同上；`withGatherLive(f, { open: false })` 時看過也一樣；
    - `the start floor has points`（審查 M2，計畫裁定 17）：先用 `floorOf(newRun(...))` 找一個出發層會放點的種子；同一個種子的 `Game` 在 `withGatherLive(f, { open: true })` 下出發，`game.map()` 的那一層有 `'gather'` 格；
    - `on and open`：出發之後 `run.gather === true`；站上一個點（測試直接把 `pos` 放上去）`gatherHere()` 給種類、素材、豐與規則；`gather('full')` 之後背包多了預告的數量、`got` 加了、格子是 `'floor'`、內容不見、計量照預告、`run.worked` 沒有被設；
    - `the preview is the outcome`：每一種地區規則與豐點各一例、`mod` 的四種組合（有沒有 `encounterDown` × 平常／靜謐），`gatherPreview()` 的兩種採法各自等於實際 `gather(mode)` 之後的數量、計量、每一位成員的 HP／TP；
    - `the land takes its toll`：燙手、毒氣照 `max(1, hp − n)`、帶電照 `min(tp, …)`；不在場上的已加入成員也扣；倒下的成員不扣；
    - `a full pack leaves the point`：背包剩的重量不夠時回 `full`，點、計量、HP／TP、`got` 都不變；丟掉一些素材之後同一個 `gather(mode)` 成功（M1 的引擎面）；
    - `a point pays once`（spec §11 第 3 條）：同一點第二次 `none`；採過的格子是 `'floor'`；
    - `gathering draws nothing`（spec §11 第 7 條）：注入計數的 `game.rng`；`gatherPreview()`、`gather()` 前後計數相同，`run.lootDraws`、`memoryDraws`、`trophyDraws`、`runeDraws`、`state.forgeDraws`、`story.pity`、`bestiary` 都不變；
    - `a reload in the labyrinth forgets the trip`：出發、採集（含一次燙手）、不回城直接 `loadGame` → 背包、`got`、樓層、HP 全部回到出發前；
    - `silent while the slots are empty`：真的 `GATHER_TEXT`（全空）下，結果沒有 `remark`、沒有 `inner`，`run.gatherTalked` 沒有被設。
  - `engine/storyL.dive.test.ts`：`the dive that never gathers is the dive it was`（計畫裁定 16：`{ open: true }`、同一份 fixture、非空的斷言）。
  - `engine/guild.legacy.test.ts`：`the town as it was, with gathering open but unused`（計畫裁定 16、20：`{ open: true }`、同一份 fixture、非空的斷言、每一步 `state.gather === undefined`；公會的開關照當時 master 上原情境的做法疊）。
  - `engine/gather.walk.test.ts`：`walking over points is walking`（計畫裁定 16 的相對比較）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。`gather()` 照 spec §5.4 的順序（先算 `outcome`、檢查重量、再一次寫入）；`grant` 與 `shortBy` 用既有的私有方法；地區規則照 `outcome` 的 `toll` 寫入（另寫一個私有方法，不改 `springTrap`）；說話只回傳鍵，不碰文字。
- [ ] **Step 3b：會壞才算證明**（計畫裁定 16）：Step 3 全綠之後，暫時把 `floorOf` 的 `placeGather` 那一行改成什麼都不做（不 commit），跑 `engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`、`engine/gather.walk.test.ts`：採集情境的非空斷言與「踩過的點 ≥ 3」必須紅；輸出存 SDD `A/task-A3-stub.txt`；再把那一行改回來（用編輯，不用 `git checkout`／`restore`），重跑全綠。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門、逐位元的其他證據。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): gather lightly or fully, previewed and drawing nothing`。
- [ ] **Step 6：公會 PR D 合併之後**（計畫裁定 20）：A3 若在公會 PR D 合併之前完成，PR A 合併前把分支 rebase 到新的 `origin/master`，重跑 `engine/guild.legacy.test.ts` 的兩個情境（原情境、採集情境）與逐位元的其他證據；採集情境照 PR D 留下的做法調整（刪 `guild` 欄位，或包進 `withGuildLive(…, { open: false })`），fixture 一個都不重錄；報告寫明用的是哪一種。A3 若在 PR D 之後才開工，Step 1 直接照當時的樣子寫，這一步只做確認。

### Task A4：鍛造屋（工具、第二種配方、釘選）

**Files:**
- Create：`engine/forge/gatherTools.ts`（`toolCost(level)`、`craftTool(s, level)`）、`engine/forge/gatherTools.test.ts`。
- Modify：`engine/forge/craft.ts`（`itemRecipeCost(id, qty, alt = false)`、`craftItem(s, id, qty, alt = false)`：`alt` 讀 `GATHER_RECIPES`）、`engine/forge/cost.ts`（`rerollCost` 的 `mat` 是特產時收 `GATHER_PIN_QTY`；`swapPool` 的組由 `REGION_AFFIX_GROUP[mat] ?? REGION_AFFIX_GROUP[REGIONS[spotRegionOf(mat)].material]` 決定）、`engine/forge/uses.ts`（`MaterialUse` 加 `{ kind: 'tool'; level: 1 | 2 }`；第二種配方推既有的 `consumable`；特產推既有的 `regionReroll`）、`data/text.zh-TW.ts`（`T.forge.use` 的 `tool` 一支）、`engine/game.ts`（`craftTool(level)`、`craftItem(id, n, alt?)` 的 `alt` 與重鑄的特產 `mat` 都要 `gatherOpen`，否則 `locked`；成功都 `saveInTown`）、`engine/forge/{craft,cost,uses}.test.ts`、`engine/game.test.ts`、`engine/gather.guard.test.ts`（加入 `gatherTools.ts`）。
- 已知會紅：預期沒有（原配方、原釘選的結果逐一不變；`uses.test.ts` 裡既有素材的用途清單不變，因為第二種配方只用採集素材）。

- [ ] **Step 1：寫失敗的測試**：
  - `gatherTools.test.ts`：`the first tool`（材料夠就打好、`tool = 1`、扣錢扣料、`forgeDraws` 不變）；`the second needs the first and two lands`；`a tool is made once`（spec §11 第 4 條：再打一次 `invalid`；`tool` 存檔來回不變）；`short of goods`（回 `gold`／`mats`，狀態不變）；
  - `engine/game.test.ts`：`the forge's gathering work draws nothing`（spec §11 第 7 條：`craftTool`、`craftItem(..., true)` 前後，注入計數的 `game.rng` 與 `forgeDraws` 不變；特產釘選照重鑄的既有規則抽 `forgeRng`，它的 `forgeDraws` 增量必須等於同一件裝備用地區素材釘選的增量，`game.rng` 不變）；
  - `craft.test.ts`：`the gathered recipe`：每一個 `GATHER_RECIPES` 的道具用 `alt` 做得出來、扣的是採集素材；不帶 `alt` 的結果逐一等於今天；
  - `cost.test.ts`：`a spot pins its land`：特產當 `mat` 收 2 個、`swapPool` 等於那個地區素材的組；地區素材照舊收 1 個；
  - `uses.test.ts`：採集素材的用途（工具、消耗品、重鑄）逐一列出；既有素材的用途逐一不變；
  - `engine/game.test.ts`：`the forge's gathering work is shut while gathering is`：開關關著時三個入口 `locked`；打開之後成功並存檔。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：這些測試檔、`engine/forge/economy.test.ts`（不改，照舊綠）、全套、tsc、閘門、逐位元的其他證據。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): gathering tools, second recipes and the spot pin at the forge`。

### Task A5：存檔

**Files:**
- Modify：`engine/gather.ts`（`isGather`、`repairGather`，計畫裁定 7）、`engine/save.ts`（`isValid` 檢查 `gather`；`loadGame` 在 `repairGuild` 之後 `repairGather`）、`engine/save.test.ts`。
- 已知會紅：預期沒有。

- [ ] **Step 1：寫失敗的測試**（`engine/save.test.ts` 新 `describe('gathering in the save (gathering plan Task A5)')`）：`the save version stays 9`；`a gathering record round-trips`；`a save without one loads without one`；`bad shapes are corrupt`（`tool` 是 0、3、1.5、字串；`got` 不是物件、值是負數、小數、超過 `GATHER_MAX`；多的鍵）；`unknown materials are dropped, not corrupt`（`got` 裡的 `'moss'`（種類不是 `gather`）與不存在的 id 被丟掉；丟完變空而且沒有 `tool` 時整個欄位不見）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門、逐位元的其他證據。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): gathering in the save, version 9, unknown goods dropped`。

### Task A6：經濟（不會無限循環）

**Files:**
- Create：`engine/gather.economy.test.ts`。
- Modify：只有測試紅了、而且是資料錯時才改 `data/gather.ts`（列進報告）。
- Read：`engine/forge/economy.test.ts`、`engine/guild.economy.test.ts` 全檔（照抄 `matValue`、`gearValue`、`rich`、`spent` 的寫法成本檔的輔助函式，不 import 它們的私有函式）。
- 已知會紅：預期沒有。

- [ ] **Step 1：寫測試**（spec §11 的整體掃描，各一個 `describe`；第 3、4、7 條已在 A3、A4 的紅綠步驟裡（審查 L7），本檔只放一行註解指過去；第 6 條在本 PR 只寫「採集素材不在公會的報酬、賀禮、`GUILD_RUNES` 裡」的資料面斷言，完整抽樣在 C1）：
  1. `gathered goods are only gathered`；
  2. `gather, craft, sell: no loop`（採集配方做出的消耗品 `sell` 回 `invalid`、`sellJunk` 不動它；工具不在 `inventory`；釘選之後少了 2 個特產、裝備的賣價與拆解價值不變）；
  5. `a floor has a ceiling`（抽樣照 Global Constraints；一級工具、全力採；`GATHER_FLOOR_CAP`）；
  6. `the board's rules hold for gathered goods`（資料面）；
  8. `the preview is the outcome, everywhere`（抽樣照 Global Constraints；每一點 × 兩種採法 × 三種工具等級 × `mod` 的四種組合（1、0.5、0.6、0.3）；預告的數量、計量前後、燈、下一步，以及每一位成員的 HP（`max(1, hp − n)`）與 TP（`tp − min(tp, ⌊maxTP × 20 ÷ 100⌋)`），對象是 `party.recruited` 裡活著的每一位（含不在場上的），等於實際 `gather()` 之後的變化）。
- [ ] **Step 2**：執行。第 1、2、6、8 條預期綠（A1–A5 已照規則寫）；紅了就是實作錯，修實作。第 5 條紅了：調 `gatherQty` **一次**，還紅就以 `GATHER_CAP_EXCEPTIONS` 具名放過（理由、最大值），加一條待辦到 SDD `A/carry.md`。
- [ ] **Step 3**：`GATHER_FULL=1` 跑一次完整抽樣（重的工作），結果記進報告；全套、tsc、閘門、逐位元的其他證據。
- [ ] **Step 4**：收尾 G，commit：`test(starlantern): gathering makes no loop`。

**PR A 收尾**：控制者派全新脈絡的審查者（Opus）看整個分支的 diff。重點：放置的最後一步與獨立串流（A2）、踩上去照走與不抽亂數（A3）、預告等於結果（A3、A6）、經濟（A6）、存檔的壞值表（A5）、`GATHER_ART` 閘門（A1）。

---

# PR B：介面（開關仍關著；測試用 `withGatherLive`）

### Task B1：系統文字、地圖標記、小地圖、文字槽的接線、除錯把手

**Files:**
- Modify：`data/text.zh-TW.ts`（`T.ui2.gather`：`points`（四種一般名稱＋六個地區特產點名）、`rich`（「（豐）」）、`hint(name)`、`looks(item)`、`modes`（「輕手採集」「全力採集」）、`modeRow(qty, gaugeFrom, gaugeTo, lamp, next)`（例「3 個  遇敵 21 → 44 黃  下一步：可能」）、`next`（不會／可能／一定）、`rules`（六個規則名與一行說明的格式函式，例：「燙手：不論怎麼採，全員 HP −{n}（最低剩 1）」「帶電：全員 TP −20%」）、`got(item, n)`、`toll(rule, n)`、`full`（採集版的裝不下：說明「還差 {w} 的重量才放得下 {item} ×{n}」、放棄時的 `left`「採集點還在。」）、`tools`（兩級名稱與效果）、`made(name)`、`altTag`、`pinQty`；計畫裁定 11）、`render/markers.ts`（`MarkerKind` 加 `'gather'`、`LIVE` 加、`Marker.type?`、`Marker.rich?`；暗影的特產照 `visibleGather`（`run.spotted`）決定標不標；`GATHER_GLYPH`：礦草菇晶採）、`render/MapView.ts`（`ON_FLOOR` 加；文字標記依 `type` 取字；`GLYPH_FILL.gather = 0x8fd18b`，豐點 `0xe8c46a`；圖的分支先留 `null`，E4 接）、`ui2/minimap.ts`（`MINIMAP_COLORS.gather`、`gatherRich`、標記依種類上色）、`render/markers.test.ts`、`render/MapView.test.ts`、`ui2/minimap.test.ts`。
- Create：`data/gather.zh-TW.ts`（`GATHER_TEXT` 的型別與空的槽，spec §9.2 的表）、`ui2/debugGather.ts`（計畫裁定 12）；Modify：`ui2/main.ts`（照 `guildHandle` 掛上）。
- Modify（文字槽的接線，計畫裁定 10）：`data/story/voiceGates.ts`、`data/story/voice.test.ts`（`POLISHED`）、`data/story/story.test.ts`（`position()`）、`data/gather.test.ts`。
- 已知會紅與改法：`MARKER_GLYPH` 是 `Record<MarkerKind, string>`：加 `gather: '採'`（預設字）；`voice.test.ts` 的 `the polish covers the whole script`：槽是空的所以不紅；若 `storyTexts()` 的總數被某個測試釘住，照實際值更新並列進報告。其他預期沒有。

- [ ] **Step 1：寫失敗的測試**：
  - `points are marked once seen`（`withGatherLive` 造一個有點的樓層：沒看過不標、看過標、採過不標）；`a rich point is gold`；`a hidden spot shows once spotted`（暗影：距離 2 不標、走到距離 1 之後標、再走遠仍標（`run.spotted`）、濃霧之下只有站上去才標；地圖與小地圖一致）；`a point wears its kind's glyph`（五種字、淡綠、記憶裡半透明）；`the minimap shows points`；`off, no marker`（開關關著時樓層沒有點，標記清單等於今天）；
  - `data/gather.test.ts`：`the slots are there and empty`（spec §9.2 的每一個鍵存在、值是空陣列）；`every gathering slot has a speaker`（用測試專用的非空 `GATHER_TEXT` 走 `storyTexts()`，每一個 `gather.` 鍵的 `speakerOf` 等於計畫裁定 10 的對應）；`system words are plain`（`T.ui2.gather` 的每一個字串與格式函式的輸出：沒有「……」、沒有「！」、沒有名冊 A5 的秘密詞、沒有 `SPOILERS`）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：這些測試檔、`data/story`、`data/terms.test.ts`、`data/glyphs.test.ts`、全套、tsc、閘門、逐位元的其他證據、e2e。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): gathering points on the map, plain words and empty slots`。

### Task B2：提示、確定鍵、採集視窗

**Files:**
- Modify：`ui2/scenes/dungeon.ts`（`refresh` 時依 `game.gatherHere()` 顯示或藏起 `slx-gather-hint`（`tapper`，動作 `confirm`）；`onAction` 在沒有 layer、沒有對話時的 `confirm`：站在點上就開採集視窗，否則什麼都不做；採集的結果：`gathered` → `say` 收穫那一行，有地區規則再一行，然後 `remark`、`inner` 有字才說（名牌、臉、心聲的呈現照迷宮對話與 v6 的既有做法；v6 的心聲呈現若還沒合併，`inner` 的鍵一律不說）；`full` → 計畫裁定 18 的 `gatherFull(host, r, mode)`；`none` → `sfx.error`）、`ui2/scenes/event.ts`（`EventKind` 加 `'gather'`；`eventWindow` 對 `'gather'` 不畫圖（計畫裁定 22）；`fullLayer` 加可選的 `opts?: { left?: string }`（計畫裁定 18，既有呼叫不變）；`gatherLayer(host, preview)`：標題（豐點加「（豐）」）、`looks`、規則那一行（帶 `n`）、兩個採法的列（右欄是數量、計量前後、燈、下一步）、`離開`；游標照計畫裁定 15）、`src/styles/_starlantern-ui.scss`（`.slx-gather-hint`：重量讀數之上、12 px、`pointer-events: auto`；位置在本任務依實際量測定）、`ui2/scenes/dungeon.test.ts`、`ui2/scenes/event.test.ts`。
- 已知會紅：預期沒有（全部在 `run.gather` 之下；`dungeon.test.ts` 的選單清單不變）。

- [ ] **Step 1：寫失敗的測試**：
  - `the hint appears on a point and leaves with it`；`confirm on a point opens the window, elsewhere does nothing`；`holding a direction walks over a point without a window`（連續 `move`，layer 數一直是 0）；
  - `the window shows both ways`（兩列的數量、計量前後的數字、燈名、下一步等於 `gatherPreview()`；有 `encounterDown` 與靜謐時「下一步」照 `mod` 變；豐點的標題；六種地區規則各一例的那一行與 `n`）；`the cursor avoids the red`（計畫裁定 15 的三種情況）；
  - `gathering says what came`（收穫那一行與規則那一行；真的 `GATHER_TEXT`（全空）時不多說任何話；測試用一份非空的槽驗會說、名牌對）；
  - `a full pack retries the gathering`（審查 M1）：裝不下時開 `fullLayer`，文字是採集的版本；丟掉一些素材之後重試，呼叫的是同一個 `game.gather(mode)`（不是 `pickUpHere`），成功之後說收穫那一行、點不見；放棄時說「採集點還在。」、點還在；既有的寶箱、寶庫、回憶光點的裝不下視窗逐字不變；
  - `no art is asked for yet`（審查 L4）：採集視窗打開時 `ctx.art` 沒有被要求任何 `tiles/event-gather` 或 `tiles/gather-*` 的路徑；
  - `opening the window draws nothing`（計數的 `game.rng`：開視窗、離開、採集前後計數相同）；
  - `off, confirm does nothing`（開關關著時 `confirm` 照今天）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作；不用行內樣式。
- [ ] **Step 4**：這些測試檔、`ui2/typeScale.test.ts`、全套、tsc、閘門、e2e。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): stand on a point, see both ways, gather`。

### Task B3：鍛造屋與道具店

**Files:**
- Modify：`ui2/scenes/forgeCraft.ts`（`gatherOpen` 時：第一層多一列「採集工具」與它的清單、詳細欄（效果、`costLine`）；`GATHER_TEXT.doran.*` 有字才在對話框說；消耗品清單在有第二種配方的道具下多一列「〇〇（採集材料）」，id 是 `<道具 id>@gather`，`pick` 以 `@` 拆開後呼叫 `game.craftItem(id, n, true)`；工具列 id 是 `tool@1`、`tool@2`（計畫裁定 21））、重鑄的釘選清單（找到既有的檔：`ui2/scenes/forge.ts` 的 `rerollPage` 或它呼叫的模組；計畫裁定 14）、`ui2/scenes/shop.ts`（只在種類標籤或用途文字沒有自動帶上時才改；預期不必改）、對應的測試檔。
- 已知會紅：預期沒有（開關關著時清單逐一不變）。

- [ ] **Step 1：寫失敗的測試**：`the tools row opens with gathering`（關著沒有；打開有兩列；打好的一列標「已打造」；二級在一級之前停用）；`the gathered recipe sits under its item`（它的 id 是 `potion@gather`，選它扣的是採集素材，選原列扣的是原配方）；`no two rows share an id`（審查 L6：工具清單、消耗品清單、釘選清單各自沒有重複的 id）；`a spot joins the pin list at two`；`the shop names the kind and its uses`（採集素材的詳細欄寫「採集素材」與工具、消耗品、重鑄）；`Doran is silent while his slots are empty`。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門、e2e。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): the forge and the shop know gathered goods`。

### Task B4：介面收尾檢查

**Files:**
- Modify：`ui2/lateArtScenes.test.ts`（採集視窗與工具列：圖沒到不畫、到了才畫）、`tests/e2e/starlantern.spec.ts`（可讀性：用 `ui2/debugGather.ts` 的把手在 dev build 打開開關）。
- 已知會紅：預期沒有。

- [ ] **Step 1**：`lateArtScenes.test.ts` 加兩個畫面；`ui2/typeScale.test.ts`、`data/glyphs.test.ts`、「沒有行內樣式」的掃描照舊綠。
- [ ] **Step 2**：e2e `gathering is legible`（用 `tests/e2e/starlantern-legibility.ts` 既有的工具，照 `tests/e2e/starlantern.spec.ts:37-43` 的結尾檢查）：站上一個點：提示的字不被裁、不壓在重量讀數與隊伍列上；開視窗（含一個帶地區規則的點，最長的那一行）：`legibility()` 回傳空陣列、兩列的右欄不被裁；鍛造屋的工具列與詳細欄同樣檢查；三個專案（含 dpr 125／150）都量。點的位置用把手讀 `game.run` 的內容，走過去的路用 spec 檔裡既有的走路輔助函式；沒有就在 spec 檔裡加一個小的 BFS（只走 `tileAt !== 'wall'`）。
- [ ] **Step 3**：e2e 三個專案全綠；全套、tsc。
- [ ] **Step 4**：收尾 G，commit：`test(starlantern): gathering is legible`。

**PR B 收尾**：控制者派全新脈絡的審查者看 diff（重點：提示不搶輸入、確定鍵只在點上作用、預告的數字來自引擎、沒有佔位文字與圖、文字槽空著時沒有多出來的話、開關關著時清單不變）。

---

# PR C：公會收購（要 A 已合併）

### Task C1：收購池、委託人、上限

**Files:**
- Modify：`data/guild.ts`（`DELIVER_KINDS` 加 `'gather'`、`DeliverKind` 加、`deliverGiver(id)` 取代直接查 `DELIVER_GIVER`（原三種的結果不變））、`engine/guild.ts`（`known` 的 `gather` 分支：`(s.gather?.got[id] ?? 0) ≥ 1`；`noteFor` 的委託人用 `deliverGiver`；`remarkFor` 的地區：特產照 `spotRegionOf`，其他採集素材沒有）、`ui2/scenes/board.ts`（紙條鍵照計畫裁定 13；空著就照公會 B 的「沒有就不說」；`questLand`（:51-59）的 `deliver` 分支：地區素材照舊，特產照 `spotRegionOf`，其他照舊是本道（審查 M3））、`ui2/scenes/board.test.ts`、`data/guild.zh-TW.ts`（註冊 `notes.deliverPantry`、`notes.deliverOre` 兩個鍵，字串空著）、`data/story/voiceGates.ts`（只在公會 C1 已合併時：公會分支的兩個新鍵）、`engine/guild.test.ts`、`engine/guild.economy.test.ts`、`data/guild.test.ts`（只在已有紙條數量的釘子時）。
- 已知會紅與改法：紙條數量的釘子（若存在，照實際值更新，計畫裁定 13）；`engine/guild.economy.test.ts` 第 1 條若逐一列舉 `DELIVER_KINDS` 的種類字面值，加上 `gather`（意圖不變）；其他 NEEDS_CONTEXT。

- [ ] **Step 1：寫失敗的測試**：
  - `engine/guild.test.ts`：`gathered goods once gathered`（`got` 空：收購池和今天逐一相同；`got` 有銅礦石：池子多它、排在原有的後面）；`who asks for gathered goods`（草、菇 → 瑪莎；礦、晶、特產 → 多蘭；原三種不變）；`gathered goods are no excluded foe's`（池子和公會 spec §5.5 的 25 個沒有交集）；`a spot's land`（`remarkFor` 的地區）；`the quantities`（spec §8.3 的十四個 Q）；
  - `ui2/scenes/board.test.ts`：`a spot's note is about its land`（特產的收購列：`{place}` 與列圖示是那個地區；一般採集素材是本道；地區素材的結果逐一不變）；
  - `engine/guild.economy.test.ts`（計畫裁定 19）：既有的 `capSweep`、最壞值表、`BOARD_CAP_EXCEPTIONS` 一個字都不改；新增 `gatherCapSweep` 與 `describe('gathered deliveries keep the board under its cap')`：存檔情境是既有的情境再加「全部採集素材都 `got ≥ 1`」，合理組合的最壞值逐字等於 `GATHER_BOARD_WORST`、超過上限的只准是 `GATHER_BOARD_EXCEPTIONS` 裡的；另一條 `the pinned sweep is untouched`：舊的 `capSweep` 的結果等於它釘住的值（防止採集素材混進去）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。公會 C1 還沒合併時，照計畫裁定 13 在公會計畫 SDD 的 carry 記一條。
- [ ] **Step 4**：`GUILD_CAP_FULL=1` 跑完整抽樣**一次**（重的工作，照 Global Constraints 的鎖）：量到的 `gatherCapSweep` 最壞值寫進 `GATHER_BOARD_WORST`（逐字），結果記進報告；合理組合超過就照公會 §0 第 20 條（調公式一次，還超過寫進 `GATHER_BOARD_EXCEPTIONS`，上限＝量到的值＋上限的 0.01），不碰舊的例外表。然後全套、tsc、閘門、逐位元的其他證據、e2e（`ui2/scenes/board.ts` 有改時）。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): the guild buys gathered goods`。

**PR C 收尾**：控制者派全新脈絡的審查者看 diff（重點：收購池在沒採過時逐一不變、完整抽樣的結果、委託人對應、空的紙條槽不顯示佔位文字）。

---

# PR D：上線

### Task D1：打開開關

**Files:**
- Modify：`data/gather.ts`（`GATHER_SWITCH.live = true`）、`data/gather.test.ts`（`the switch is off` 改成 `the switch is on`）、spec §0（計畫裁定抄回）。
- 已知會紅與改法（意圖不變）：`data/gather.test.ts` 的開關測試；`the dive that never gathers` 與 `the town as it was, with gathering open but unused` **不改**（它們本來就在開著的情況下比對同一份 fixture）；原本的 `storyL.dive`、`guild.legacy` 情境若因為開關打開而走到採集點，照 A3 的設計仍逐一相同；任何紅燈都是設計被破壞，BLOCKED，不准重錄。其他清單測試若因為打開而多了一列（例如某個測試的狀態剛好看過 `first-return`，鍛造屋多了「採集工具」），照實際改並列進報告；其他 NEEDS_CONTEXT。

- [ ] **Step 1**：開關打開前跑一次閘門與逐位元的其他證據：全部 identical（證明樹是乾淨的）。
- [ ] **Step 2**：打開開關，改清單測試。
- [ ] **Step 3**：全套、tsc、閘門 identical、`cmp`、逐位元的其他證據（**一個都不重錄**）。
- [ ] **Step 4**：收尾 G，commit：`feat(starlantern): gathering goes live`。

### Task D2：e2e

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`。
- 已知會紅：預期沒有（提示不是視窗；既有步驟不在地圖上按確定鍵）。若既有的某一步剛好在地圖上按確定鍵，NEEDS_CONTEXT。

- [ ] **Step 1：寫失敗的 e2e**：`gathering: see both ways, gather, bring it home, make a tool`：注入的測試存檔（看過 `first-return`、倉庫有銅礦石 ×5、石英碎晶 ×2、150 G 以上）→ 出發本道 → 用把手找到第一個點、走過去 → 提示出現 → 確定 → 視窗的兩列數字等於把手讀到的 `gatherPreview()` → 全力採集 → 收穫那一行、遇敵燈的 class 照預告變化 → 回城 → 道具店的素材頁有它、種類「採集素材」→ 鍛造屋「製作 → 採集工具」打一級 → 「已打造」；重新整理頁面之後工具仍在、背包回到回城時的存檔。另一個 e2e：`a land's toll`：出發熾焰（注入的存檔）→ 找特產點 → 視窗有「燙手」那一行 → 採集 → 隊伍列的 HP 照預告下降。
- [ ] **Step 2**：執行，確認綠（D1 之後）。
- [ ] **Step 3**：e2e 三個專案全綠；全套、tsc。
- [ ] **Step 4**：收尾 G，commit：`test(starlantern): e2e for gathering`。

**PR D 收尾**：控制者派全新脈絡的審查者看 diff，並請控制者在 4321 開一次給使用者看（附可點的網址，`CLAUDE.md` 的鐵則；代理自己不開瀏覽器）。

---

# PR E：美術（點的地磚要使用者先核准樣本）

開工條件：E1 隨時可做；E2 之後要使用者對 spec §15 的樣本回答。沒有核准之前，點照舊用文字標記、素材照舊不畫圖示（不是缺陷）。

### Task E1：契約與工具

**Files:**
- Modify：`art-factory/starlantern/contract.md`（新增三列：`tile-gather-<vein|herb|fungus|crystal|blaze|frost|storm|mire|shade|iron>`（來源 `sheet-gather-tiles`，5×2，照事件地磚：62×62 透明畫布、主體置中、`shared_block`）；採集素材圖示 `icon-<id>`（照既有圖示列：高 32、36×36 方框內）；工具圖示 `icon-tool-1`、`icon-tool-2`（同上））、`art-factory/starlantern/registry.json`。
- Create：`art-factory/starlantern/tools/gather_art.py`、`test_gather_art.py`（照名冊 `roster_art.py` 的 `plan-json`、`gen`、`qa`、`approve`、`publish` 子命令；洋紅去背、alpha 與殘留的機械 QA 用既有的函式；`gen --batch t1`（地磚）在沒有樣本核准時拒絕）。

- [ ] **Step 1**：`test_gather_art.py` 先寫（尺寸、去背、殘留、霧邊、邊緣殘留、內部過度擦除、地磚沒核准就拒絕）；`rtk proxy python -m pytest art-factory/starlantern/tools -q` 紅。
- [ ] **Step 2**：實作；pytest 綠。
- [ ] **Step 3**：commit：`feat(starlantern): art contract and tools for gathering`。

### Task E2：地磚樣本（使用者核准）

- [ ] **Step 1**：`codex_still.py generate` 產一張樣本表（十個點，兩種方向各一版）；機械 QA 全過。
- [ ] **Step 2**：放到使用者打得開的網址（控制者處理，`CLAUDE.md` 的鐵則），等使用者選。
- [ ] **Step 3**：使用者核准後 `approve --batch t0 --by "<使用者原話> <YYYY-MM-DD>"`；registry 寫 `gather_tile_style_approved`、`gather_tile_style_anchor`。commit：`chore(starlantern): gathering tile style approved`。

### Task E3：生成、審核、發布

- [ ] **Step 1**：`gen --batch t1`（地磚 10）與 `gen --batch i1`（素材圖示 14、工具圖示 2；既有圖示畫風，不等 E2）；機械 QA 全過；被淘汰的不進 runtime 路徑。
- [ ] **Step 2**：控制者派全新脈絡的獨立代理（Opus，不准用瀏覽器工具）審核；通過才 `approve`、`publish`（名冊裁定 21 的做法）。codex Plus 額度用完改用 codex credits，兩者都用完才暫停回報；絕不用佔位美術。
- [ ] **Step 3**：`data/gather.ts` 的 `GATHER_ART` 填入已發布的素材 id；`render/artPaths.ts` 加 `art.gatherTile(key)`、`art.toolIcon(level)`，`allArtUrls` 收已發布的；`render/artPaths.test.ts` 的總數照當下實際值重算；manifest 與 `render/published.test.ts` 綠。
- [ ] **Step 4**：收尾 G，commit：`feat(starlantern): publish gathering tiles and icons`。

### Task E4：介面接線

**Files:**
- Modify：`render/MapView.ts`（點的圖：照事件地磚的畫法與浮動；豐點用 tint 加金色光暈）、`ui2/scenes/event.ts`（拿掉 B2 對 `'gather'` 的跳過，採集視窗的頭以 `bestPicture` 帶 `art.gatherTile(key)`，不用 `eventArt('gather')`；計畫裁定 22）、`ui2/scenes/dungeon.ts`（收穫那一行的小圖示）、`ui2/scenes/forgeCraft.ts`（工具圖示）、對應的測試檔、`src/styles/_starlantern-ui.scss`。

- [ ] **Step 1：寫失敗的測試**：`gathering wears its art once it lands`（`NO_ART` 時和 E 之前完全相同；`has` 為真時有 `img`／`Sprite`、尺寸 class 對）。
- [ ] **Step 2**：實作；e2e 三個專案、全套、tsc。
- [ ] **Step 3**：收尾 G，commit：`feat(starlantern): gathering wears its art`。
