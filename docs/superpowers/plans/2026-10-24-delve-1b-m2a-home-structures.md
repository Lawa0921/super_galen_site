# DELVE 1b M2a「家鄉結構與外圍內容」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 gen2 在初始之地做到舊 41 階段生成器的水準（spec §4.4 全部清單），並讓荒野大陸、海與島有值得停下的東西（驚喜密度 340 / 1,800）；旗標與舊生成器都還在，預設遊戲行為不變。

**Architecture:** 舊生成器的「畫一個結構」程式碼（村落 / 矮人地廳 / 地城 / 礦坑 + 密室 / 空島）搬進 `engine/gen2/draw/`，改成只透過 `Canvas` 介面讀寫；舊生成器用 `gridCanvas`（整張 GenGrid）呼叫它、輸出由 `world.central.test.ts` 的指紋釘住不變，gen2 用 `BpCanvas`（藍圖外框 + Profile2 推得的天然地層）呼叫它產生藍圖。家鄉的必有內容（地城、村莊、地廳、密室、空島、小生態、石碑 / 遺物點）由 `anchors.ts` 的「錨點」預先保留槽位，其餘照槽位機率；荒野大陸用同一套錨點保證「大東西」的間距。藍圖除了格子還帶出物件（箱子附加物品、陶罐掉落、石碑、地標、聚落、地面覆寫、免挖洞箱），World 載入欄時登錄；聚落改由 `SiteRegistry` 以穩定的 key 登錄（家鄉開局一次、外圍載入時），地區改由 Discovery 的「已知地區」登錄，大地圖 / 日誌 / HUD 都讀它。

**Tech Stack:** TypeScript、Vitest、Playwright、Canvas2D 程式化像素美術（`render/pixel.ts` 色票）、IndexedDB + gzip 存檔、WebRTC 連線（`net/`）。

**Spec:** `docs/superpowers/specs/2026-10-23-delve-infinite-1b-cultures-design.md`（§4.3、§4.4、§8、§9 M2 列為約束；§5 開頭的 2026-10-24 使用者決定由 M2b 執行）；M1 計畫 `docs/superpowers/plans/2026-10-23-delve-1b-m1-world-skeleton.md`（決定 1–7、P1–P16 沿用）；後續 `docs/superpowers/plans/2026-10-24-delve-1b-m2b-switchover.md`。

---

## 關鍵架構決定（作者決定，附理由）

1. **計畫拆成 M2a / M2b 兩份，各自可合併。** M2a = spec §9 M2 列的 A + B（結構、外圍內容、驚喜密度），旗標照舊只在 dev 有效、舊生成器照舊是預設；M2b = 切換、刪舊、凍結。理由：A + B 有 21 個 task、C + D 有 10 個，合在一份超過 22；而且 M2a 合併後線上遊戲完全不變，風險分開。
2. **「搬出共用碼」而不是複製（M1 P10 的做法）：繪製碼搬到 `engine/gen2/draw/`，legacy 反過來 import 它。** 舊碼的全域部分（選址、`free()`/`occupied` 碰撞、湖床 / 液體、洪水填充）留在 legacy，只有「給定外框就畫」的部分搬走；每一處世界讀寫都改走 `Canvas`。舊輸出由 `engine/world.central.test.ts`（CENTRAL_FINGERPRINT / GAME_FINGERPRINT，「不准重錄」）與 `engine/legacy/**` 測試釘住。理由：使用者要求共用；M2b 刪掉 legacy 後共用碼留在 gen2，不必再搬一次。cabin / ruin 在 M1 已是 gen2 自己的版本（舊的 cabin 用 tileRunner 坑道、形狀不同），不回頭合併。
3. **BpCanvas 的讀 = 藍圖畫過的格，否則 = Profile2 推得的天然地層（沒有洞穴）。** 舊碼裡「只在非實心時補木板 / 補土」這類條件在 gen2 一律依天然地層判斷；舊地城「把預留區裡的天然洞穴補實」改成藍圖的 `solid` 免挖洞箱（Filler2 在箱內不挖噪聲洞穴、不放入口、不換礦）。理由：藍圖只能依賴可局部算出的資料（spec §4.3），不能讀其他區塊的生成結果。
4. **分層槽寬：表層（SURFACE）與天空層（SKY）340 格、地下（UNDER）/ 深層（DEEP）/ 小點位（MINOR）170 格。** structureId 的 layer 欄從 2 bit 擴成 3 bit（共 28 bit）。理由：家鄉 4200 格只有約 10 個 340 格的槽，舊生成器的家鄉有 16 小屋 + 8 礦坑 + 5 密室 + 4 小生態 + 地下湖 + 地廳；地下改 170 格才放得下，表層維持 340 不改 M1 的地表觀感。
5. **錨點（Anchor）：家鄉的「必有」內容與外圍的大東西，都是預先保留的 (地區, 層, 槽)。** `homeAnchors` / `continentAnchors` 只由 (seed, Layout, Profile2) 決定；BlueprintIndex 建藍圖時先查錨點、錨點的槽不擲機率；錨點建構器一律 `force`（不回 null，同 M1 P11）。理由：§4.4 的「至少 N 個」與 340 / 1,800 間距都是保證，機率槽給不出保證。
6. **家鄉版面加一個 420 格寬的地城區（`VARIANT.DUNGEON`），緊貼一端沙灘內側。** 地城一份藍圖佔滿這個地區的所有層。理由：舊地城預留區就是 420 格、緊貼沙灘（`worldgen.ts:274-278`）；340 格的槽放不下。版面 v0 尚未凍結，可以改。
7. **藍圖帶出物件：`Blueprint` 加 `pots / tablets / landmarks / floors / ground / solid / site`，箱子加 `extra`。** World 載入欄時登錄（箱子照 M1 規則：所在 chunk 沒改過才登錄；陶罐掉落、石碑、地標改為「那格的 tile 還是該 tile 就登錄」，因為它們沒有存檔資料）。理由：spec §4.3「跨區塊物件的資料全部由藍圖產生，載入區塊時登錄」；地標若照箱子規則，玩家在同 chunk 挖過一格後地標就領不到了。
8. **聚落登錄 `SiteRegistry` + 穩定的 NPC id。** 舊世界照舊以 `v{i}` / `h{i}` 為 key（存檔裡的好感度 / 委託鍵不變）；gen2 聚落 key = `s{structureId}`；聚落 NPC 的 id = `npcIdFor(key)`（雜湊，不再是 populate 的順序號）。家鄉聚落在開局一次登錄（委託板 / 提示 / 日誌要完整清單），外圍聚落在欄載入時登錄。理由：連線時房主與客人載入外圍的順序不同，順序號會對不上（agent 調查：`net/host.ts:530` 用 `n.id` 送位置）。
9. **家鄉的地區、石碑、遺物、地標、聚落在開局由 `homeContent()` 一次算好（只算藍圖，不生成任何 chunk）；外圍的在載入時登錄。** Discovery 新增「已知地區」表（`know` / `region` / `listKnown`），大地圖、日誌、HUD、提示、委託都改讀它。理由：這些消費者都假設完整清單（agent 調查：`discovery.ts:452-461`、`render/mapView.ts:290`、`render/journal.ts:171`）；家鄉有限、可以先算，外圍無限、只能登錄。客人加入只算家鄉藍圖（不生成家鄉格子），符合 spec §4.3。
10. **v0 / v1 沒有文化大陸（文化池只有荒野、所有大陸 culture = null）；霧竹之國的指派（「離家最近、尚未進入過的那片大陸」、ver ≥ 2 閘門）整個留給 M4。** M2a 刪掉 M1 的 c = 1「第一片必有霧竹」規則，不做任何閘門機制。理由：版本一凍結，已進入的大陸永遠用那版規則（spec §5）；spec §4.1 已於 2026-10-24 修訂（commit 593567af5）。見文末「規格模糊處」第 1 條（已解決）與 Preflight 裁決 Q14。

## Global Constraints

- 路徑都相對於 `src/scripts/games/delve/`（e2e 在 repo 根的 `tests/e2e/`）。
- 測試一律 `npx vitest run <path>`（`npm test` / `npm run test` 是 watch 模式會掛住）；每個 task 的 commit 前跑該 task 涉及的資料夾，Task 21 跑全套 `npx vitest run`。
- 型別檢查 `rtk proxy npx tsc --noEmit -p .`：總數維持 773（基準），`games/delve` 路徑 0 個錯誤（`rtk proxy npx tsc --noEmit -p . 2>&1 | grep "games/delve"` 必須沒有輸出）。
- Commit 用 Conventional Commits，訊息最後一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- CRLF 檔案編輯後保持 CRLF（`git ls-files --eol <path>` 看到 `w/crlf`）。本計畫會改到的 CRLF 檔：`engine/game.ts`、`engine/world.ts`、`engine/legacy/worldgen.ts`、`render/journal.ts`、`render/renderer.ts`、`render/model.ts`、`render/session.ts`、`save/serialize.ts`、`tests/e2e/delve.spec.ts`。新檔一律 LF。
- DELVE 介面文字寫死繁體中文（不走 i18n）。
- 美術程式化像素，顏色只取 `render/pixel.ts` 的 `PALETTE_HEX`；禁 `!important`、禁行內樣式。
- 不准用裸的 `git stash`（要用就 `git stash push -u -m "<tag>"`，用 SHA apply）。
- 確定性：`engine/gen2/**`（含 `draw/`、`structures/`）與 `engine/genPrims.ts` 的非測試檔不得出現 `Math.random`、`Math.sin/cos/pow/exp/log/sqrt/hypot`、`**`（註解也不行，用 `//`）；隨機一律走 `engine/noise.ts` 整數雜湊或 `HRng` / legacy `Rng`（共用碼只依賴 `RandomLike`）。
- `engine/gen2/**` 不得 import `engine/legacy/**`（legacy import gen2 可以）；`engine/gen2/draw/*.ts` 與 `structures/*.ts` 不得 import `blueprint.ts`（只依賴 `bpcore.ts` 與葉模組，`structures.import.test.ts` 的規則）。
- tile id 只能附加、上限 256；M2a 不新增 tile（珊瑚礁 / 海底遺跡用既有 tile）。
- **舊輸出不變（每個 task 都要守）**：`engine/world.central.test.ts`、`engine/actor.golden.test.ts`、`engine/legacy/**` 全部測試、`save/bake.test.ts` 不得改任何期待值；它們紅了代表搬移有錯，修程式不是改數字。
- **gen2 v0 尚未凍結**：改到 gen2 輸出的 task 在同一個 commit 重錄 `engine/gen2/gen2.lock.test.ts` 的 `GEN2_HASHES[0]`，commit 訊息寫「re-record gen2 v0 hash (unfrozen)」。M1 的 gen2 測試若因版面 / 槽寬改動而失敗，依本計畫的新規則改寫並在 commit 說明；不得放寬成永遠會過。
- 重的測試（生成正式尺寸舊世界、掃描 > 20,000 欄的 gen2 藍圖、建家鄉內容）一律寫明逾時（`60_000`–`300_000`），檔案內共用一次生成結果（M1 教訓）。vitest 沒有全域 `testTimeout`：預設每個 `it` 5 s、每個 hook 10 s——共用 fixture 的 `beforeAll` 也要給逾時（第二參數）。
- 測試檔在 tsconfig `include` 內（會被型別檢查）：測試只用公開 API，不得呼叫 private 成員或讀不存在的欄位（Preflight Q5 / Q13）。
- 測試本體不得只有註解、空本體、吞例外或永遠會過（M1 P9）。
- 旗標行為不變：預設新世界仍是 genVersion 7 舊生成器；`?gen2=1` 只在 dev 有效。
- spec 數值（原文）：§4.4——4 種生態、出生點平坦森林、兩端海灘、地城在一端海灘內 ≥ 25 個房間且有召喚 / 鑰匙內容；2–4 個村莊、≥ 1 座矮人廳；地標放置率 ≥ 85%；≥ 3 個密室；小屋、遺跡、礦坑、空島；蘑菇 / 水晶小生態；花崗岩 / 大理石；地下湖；熔岩帶；14 塊燈脈石碑與 4 件遺物在初始之地；每種礦在對應深度帶的密度落在舊生成器 ±30%；燈籠守望者召喚材料（發光蘑菇、凝膠、金錠）取得得到；每種生態至少一條地表→洞穴層的路；±50,000 格掃描任意連續 340 格內至少一個值得停下的東西、任意 1,800 格內至少一個大東西。§8——海面每 300 格一個槽位、每槽必有一點；每道海至少 1 座有建物的島（燈塔 / 隱士 / 沉船島）；島寬 40–160。
- 效能（spec §4.3）：32×32 區塊中位數 ≤ 現有 OuterGen 2×、最壞 ≤ 8 ms；自動測試門檻沿用 M1 的 3× 與每欄 p95 ≤ 40 ms，閒置機器實測 ≤ 2× 由 Task 21 報告把關（M1 P5）。大藍圖第一次建構的時間另訂預算（Task 21）。

## Review Focus

1. **生成物件在載入 / 卸載 / 存讀之後不一致**：玩家在地標旁挖一格（chunk 變成已修改）後地標就領不到；外圍領過的地標在讀檔時被 `Discovery.load` 丟掉（它只認建構時的 `landmarkSet`）；陶罐鑰匙在 chunk 改過後不再掉 → Task 2 的登錄規則測試與 Discovery 開放讀檔測試。
2. **連線時外圍聚落的 NPC 對不上**：房主與客人以不同順序載入外圍欄、或客人收到還沒登錄的 NPC 位置 → Task 3 的「兩種登錄順序 id 相同」與 Task 18 的連線測試（未登錄的 NPC 位置被忽略、不丟錯）。
3. **地面覆寫與實際地形不符**：村莊整平、地城塔基、遺跡地基的欄，`world.surfaceAt` 不是第一個實心格 → NPC、出生點、傳送碑浮空或埋住 → Task 2（遺跡）與 Task 9（村莊 / 地城）的「每個有 ground 的藍圖欄 surfaceAt = 第一個實心格」測試。
4. **大藍圖第一次被碰到時卡頓、開局變慢**：地城 / 村莊 / 小地城的藍圖建構與 `homeContent()` → Task 8 的建構時間測試、Task 21 的預算與開局時間測試。
5. **少見種子缺東西**：叢林寬 630 又在地城那一側時沙漠擠不下、候選森林槽都太陡、地城側沒有森林 → Task 7 的錨點不變量（50 個種子）、Task 17 的家鄉總驗（20 個種子）。

## 基準紀錄（執行時填）

- 舊生成器礦物密度（Task 13 量測，`engine/gen2/oreBaseline.ts`，千分比，種子 alpha / beta / gamma 平均）：銅 dirt 13.397 / rock 11.47 / deep 0.001；鐵 dirt 0.012 / rock 5.937 / deep 1.988；銀 rock 0.802 / deep 1.954；金 deep 2.445 / molten 0.514；其餘 0。
  gen2（Task 21 時，`DELVE_MEASURE=1` 的 ores.test）：金 molten 平均 0.489（0.95×）；單一種子的家鄉 alpha 0.98× / beta 1.08× / gamma 0.79×，單片荒野大陸（東 / 西第一片）0.87 / 0.78、1.41 / 0.76、0.99 / 0.64×（Task 13 延後事項：只記錄，不改規則）。
- 舊生成器家鄉 tile 集合（Task 17 量測，`engine/gen2/legacyTiles.ts`）：`LEGACY_HOME_TILES`（alpha / beta / gamma 整個舊世界 fg 的聯集，97 種）；gen2 刻意不做 `NOT_PORTED` = 泉水、熔岩泉、滲水石。
- 大藍圖建構時間、`homePlans()` 開局時間（目標 ≤ 300 ms，Q9）、gen2 開局時間、每欄 fill 中位數比值（Task 21，2026-10-26，**機器沒有閒置**：兩個 Android 模擬器等常駐，量測時 CPU 負載 88–94%）：
  - `gen2.perf.test` 三次（P5）第一組：median ratio 1.75 / 2.02 / 2.29，**中位數 2.02 > 2.00（負載 90–94%）**；第二組（同一份碼，負載 77–94%）：1.15 / 1.78 / 1.65，中位數 1.65。
    同一時段 HEAD（0da73087c）與本 Task 交錯各跑 3 次：HEAD 1.68 / 1.41 / 0.98、本 Task 1.54 / 1.84 / 1.66（v1 中位數本身在 2.1–5.5 ms 之間跳，負載雜訊大於差異）。p95 4.9–9.7 ms（≤ 40）。**閒置機器的 P5 待重量。**
  - `[gen2 budget]`（perf-a / perf-b，ms）第一組（建構器單次）：地城 17.0 / 24.4 / 20.0（≤ 80）、小地城 9.6 / 15.5 / 14.6（≤ 30）、其他 5.4 / 8.6 / 7.9（≤ 10；水晶洞 / 蘑菇林）、`homePlans` 78.4 / 80.9 / 75.4（≤ 300）、homePlans 之後第一次碰地城欄 11.5 / 9.0 / 11.1（≤ 120）、全新 source 第一次碰東側第一片大陸小地城欄 16.9 / 23.2 / 20.4（≤ 120）。
    全套平行跑時「其他」到 11–16 ms（水晶洞）→ 建構器改成同一份 ctx 建 3 次取最快（濾負載抖動，門檻不動）；第二組：地城 11.4 / 11.2 / 11.1、小地城 5.8 / 6.7 / 9.6、其他 4.8 / 5.1 / 5.3、homePlans 56.0 / 62.0 / 48.7、地城欄 6.2 / 6.4 / 7.2、小地城欄 17.7 / 15.0 / 18.8。
  - `homePlans()` 長尾（2000 個家鄉 hp-0..1999，同負載）：改前中位數 74.5 / p99 155.8 / 最差 339.2 ms（hp-1006：蘑菇林錨點走直豎井備案，linksToCave 718 次洪水填充 166 ms）；
    linksToCave 與礦坑接洞的走過表改 typed array（輸出逐位元相同）後中位數 73.5 / p99 122.2 / 最差 254.5 ms；加上 homeContent 最差 256.1 ms。
  - gen2 `DelveGame` 開局（≤ 1,500 ms，game.gen2.test / lore.test 的自動門檻照綠）：12 個種子 boot-ms-0..11 實測 310 / 334 / 271 / 269 / 181 / 155 / 170 / 216 / 181 / 224 / 205 / 194 ms，中位數 216、最差 334（第一個含 JIT 暖機；修正回合 1 量，CPU 負載 100%）。

---

## 檔案結構

| 路徑 | 職責 |
|------|------|
| `engine/genTypes.ts` | 從 legacy 搬出的共用型別：`BiomeSegment`、`StructureKind`、`Structure`、`LandformType`、`Landform`、`ReservedZone`、`GenLayers`、`GenRelic`、`RoomKind`、`DungeonRoom`、`DungeonEdge`、`DungeonKey`、`DungeonInfo`、`GenRect`、`VillageHouse`、`VillageInfo`、`HallInfo`、`LandmarkInfo`；新的 `GenSite` |
| `engine/gen2/structId.ts` | 結構 id 與 gen2 結構地區 id 的編解碼（blueprint 與 discovery 共用，carry「位元配置不再手抄」） |
| `engine/gen2/draw/canvas.ts` | `Canvas`、`RandomLike` 介面 |
| `engine/gen2/draw/bpCanvas.ts` | `BpCanvas`：藍圖用的 Canvas（畫過的格 / 天然地層 / 物件紀錄 → Blueprint） |
| `engine/gen2/draw/{village,hall,dungeon,mineshaft,skyIsland}.ts` | 從 legacy 搬來的繪製碼（只透過 Canvas） |
| `engine/legacy/gen/gridCanvas.ts` | legacy 用的 Canvas（整張 GenGrid） |
| `engine/gen2/anchors.ts` | 錨點：家鄉必有內容、荒野大陸的大東西 |
| `engine/gen2/structures/*.ts` | 各藍圖產生函式（新：dungeon、village、hall、mineshaft、skyIsland、miniBiome、hive、shrine、keep、hermitHut、minor、island、reef、seaRuin） |
| `engine/gen2/home.ts` | `homeContent()`：家鄉的聚落、地城、石碑、遺物、地標、地區、結構清單 |
| `engine/gen2/lore.ts` | 家鄉石碑 / 遺物的指派（LORE_SITES 精神） |
| `engine/gen2/oreBaseline.ts`、`engine/gen2/legacyTiles.ts` | 舊生成器量測出的常數（M2b 刪掉舊生成器後測試仍有對照） |
| `engine/siteRegistry.ts` | `SiteRegistry`、`GenSite`、`npcIdFor`、`legacySites` |

---

### Task 1: 共用型別搬出 legacy、結構 id 編解碼、確定性掃描移出 legacy

**Files:**
- Create: `engine/genTypes.ts`、`engine/gen2/structId.ts`、`engine/gen2/determinism.test.ts`、`engine/gen2/structId.test.ts`
- Modify: `engine/legacy/worldgen.ts`、`engine/legacy/gen/{dungeon,settlements,landmarks}.ts`（型別改 import `genTypes`，不留 re-export）、所有 import 這些型別的檔（`engine/game.ts:13,17,84-85`、`engine/worldBoot.ts:9-12`、`engine/discovery.ts:14-15`、`engine/folk.ts:17`、`engine/world.ts:8`、`save/serialize.ts:78`、`save/legacyMeta.ts`；以 tsc 為準）
- Modify: `engine/gen2/bpcore.ts`（`BP_SKY = 3`、`BP_MINOR = 4`、`type Layer`）、`engine/gen2/blueprint.ts:33-48`（`structureId` / `decode` 改用 structId）、`engine/discovery.ts:315-376`（結構地區 id）
- Modify: `engine/legacy/chunkgen/chunkgen.test.ts:264-285`（(6) 只留 chunkgen 自己的檔；gen2 與 genPrims 的部分移到 `determinism.test.ts`）、`engine/gen2/layout.test.ts:201-209`（刪掉非遞迴的重複掃描）

**Interfaces:**
- Produces（`structId.ts`）：
  ```ts
  export const LAYER_BITS = 3;
  export function encodeStructureId(side: Side, i: number, region: number, slot: number, layer: Layer): number; // i 13 | side 2 | region 5 | slot 5 | layer 3 = 28 bit
  export function decodeStructureId(id: number): { side: Side; i: number; region: number; slot: number; layer: Layer };   // 壞 id 丟 RangeError
  export const GEN2_SITE_BASE = 8589934592;   // 2 的 33 次方（gen2 非測試檔禁 `**`，註解也不行——Q1）
  export function gen2SiteRegionId(sid: number, part: number): number;   // GEN2_SITE_BASE + sid × 64 + part，part ∈ [0, 64)
  export function isGen2SiteRegionId(id: number): boolean;
  export function siteOfRegionId(id: number): { sid: number; part: number };
  ```
  `blueprint.ts` 照舊匯出 `structureId`（= `encodeStructureId`）與 `slotOf`；`bpcore.ts`：`export type Layer = 0 | 1 | 2 | 3 | 4`。
- Produces（`genTypes.ts`）：上表列的型別，欄位與 legacy 現有定義逐字相同；`GenRelic = { x: number; y: number; item: ItemId; where: string }`（原 `GenResult['relics'][number]`）；另新增聚落描述（Task 2 的藍圖與 Task 3 的 SiteRegistry 共用，純型別）：
  ```ts
  export type GenSite =
    | { kind: 'village'; key: string; rot: number; info: VillageInfo }
    | { kind: 'hall'; key: string; rot: number; info: HallInfo }
    | { kind: 'hermit'; key: string; rot: number; at: { x: number; y: number } }
    | { kind: 'dungeon'; key: string; rot: number; info: DungeonInfo };
  ```
- discovery：gen2 結構地區 id 改成 `gen2SiteRegionId(b.id, 0)`（修 agent 調查到的 sub 溢位：slot ≥ 21 會撞到下一個地區 index）；`Discovery.load` 的 id 範圍接受 `[GEN2_SITE_BASE, GEN2_SITE_BASE + 2 ** 34)`。

- [ ] **Step 1: 寫失敗測試**

```ts
// structId.test.ts
it('encode / decode 往返（所有 layer、兩側、邊界值）', () => {
  for (const [side, i, region, slot, layer] of [[0, 0, 0, 0, 0], [1, 8191, 31, 31, 4], [-1, 1, 7, 3, 3], [1, 5, 2, 30, 1]] as const)
    expect(decodeStructureId(encodeStructureId(side, i, region, slot, layer))).toEqual({ side, i, region, slot, layer });
  for (const bad of [[1, 8192, 0, 0, 0], [1, 1, 32, 0, 0], [1, 1, 0, 32, 0], [1, 1, 0, 0, 5], [2, 1, 0, 0, 0]] as const)
    expect(() => encodeStructureId(...(bad as unknown as Parameters<typeof encodeStructureId>))).toThrow(RangeError);
  expect(encodeStructureId(1, 8191, 31, 31, 4)).toBeLessThan(2 ** 31);
});
it('結構地區 id：唯一、可反查、不撞地塊地區 id', () => {
  const a = gen2SiteRegionId(encodeStructureId(1, 3, 2, 20, 0), 0), b = gen2SiteRegionId(encodeStructureId(1, 3, 3, 0, 0), 0);
  expect(a).not.toBe(b); expect(siteOfRegionId(gen2SiteRegionId(12345, 9))).toEqual({ sid: 12345, part: 9 });
  expect(isGen2SiteRegionId(a)).toBe(true); expect(isGen2RegionId(a)).toBe(false); expect(isGen2SiteRegionId(gen2RegionId(1, 2, 0, 0))).toBe(false);
  expect(() => gen2SiteRegionId(1, 64)).toThrow(RangeError);
});
// determinism.test.ts（從 chunkgen.test.ts (6) 移來、改成遞迴；gen2.perf.test.ts 例外同 M1）
it('engine/gen2/**（遞迴，含 draw/、structures/）與 engine/genPrims.ts 沒有禁用 API；gen2 不 import legacy；draw/ 與 structures/ 不 import blueprint.ts', () => {
  const files = gen2SourceFiles();                       // 遞迴、排除 .test.ts、testUtil.ts 照樣掃
  expect(files.length).toBeGreaterThanOrEqual(15);
  for (const f of [...files, GEN_PRIMS]) expect(BANNED.exec(read(f))?.[0] ?? null, f).toBeNull();
  for (const f of files) expect(/from '[^']*legacy\//.test(read(f)), f).toBe(false);
  for (const f of files.filter((p) => /[\\/](draw|structures)[\\/]/.test(p))) expect(/from '\.\.\/blueprint'/.test(read(f)), f).toBe(false);
});
it('gen2 的測試檔也不 import legacy（M1 chunkgen.test.ts:283-286 的檢查照留；gen2.perf.test.ts 例外）——legacy 在 M2a 還在', () => {
  const tests = gen2TestFiles().filter((p) => !p.endsWith('gen2.perf.test.ts'));   // 遞迴，只取 .test.ts
  expect(tests.length).toBeGreaterThanOrEqual(10);
  for (const f of tests) expect(/from '[^']*legacy\//.test(read(f)), f).toBe(false);
});
```
（`BANNED` = M1 的同一個 regex；`gen2SourceFiles` / `gen2TestFiles` / `read` / `GEN_PRIMS` 寫在測試檔內。`structId.ts` 的 `GEN2_SITE_BASE` 寫成字面值 `8589934592` + `// 2 的 33 次方`，所以 BANNED 掃描在 Step 4 會綠（Q1）。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/structId.test.ts src/scripts/games/delve/engine/gen2/determinism.test.ts`；Expected: FAIL（模組不存在）。
- [ ] **Step 3: 實作** — 先搬型別（純 import 改寫、legacy 不留轉接），再寫 `structId.ts`，`blueprint.ts` 的 `structureId` / `decode` 換成它，`discovery.ts:376` 的手抄位元運算換成 `gen2SiteRegionId(b.id, 0)`。layer 改 3 bit 會改變 structureId 的值（hash2 的輸入）→ gen2 輸出改變 → 重錄 `GEN2_HASHES[0]`。
- [ ] **Step 4: 跑測試** — Run: `npx vitest run src/scripts/games/delve`；Expected: 全綠（含 `world.central.test.ts`、legacy 全部、`gen2.lock.test.ts` 重錄後）。tsc：773 / delve 0。
- [ ] **Step 5: Commit** — `refactor(delve): shared gen types out of legacy, structure id codec, recursive gen2 determinism scan`（說明：re-record gen2 v0 hash (unfrozen)；修 gen2 結構地區 id 溢位）。

---

### Task 2: 藍圖物件、地面覆寫、免挖洞箱、分層槽寬、World 與遊戲登錄

**Files:**
- Modify: `engine/gen2/bpcore.ts`（`Blueprint` 新欄位、`Blueprint.layer: Layer`（原 `0 | 1 | 2`，bpcore.ts:14）、`slotWidth`、`BpCtx.groundAt`、`placeX` 的坑道避讓帶）、`engine/gen2/blueprint.ts`（`landSlotCount(r, layer)`、`landSlot(r, q, layer)`、`slotOf` 依層、`overlapping(x0, x1, layers?)`、`ctx()` 填 `groundAt`）、`engine/gen2/structures/{cabin,ruin,lakes,shipwreck,crate}.ts`（新欄位給空值；ruin 設 `ground`）、`engine/gen2/fill.ts`（`solid` 箱）、`engine/gen2/index.ts`（`surfaceAt` 吃地面覆寫、`objectsIn` 加 `extra`、`extrasIn`）、`engine/column.ts:56-67`（`GenExtras`、`ColumnSource.extrasIn?`）、`engine/world.ts:399-418`（`registerObjects` 登錄 extras、`unloadColumn` 清掉）、`engine/game.ts:2202-2204`（`tabletId`）、`:4786-4801`（`claimLandmark`）、`engine/discovery.ts:434-552`（`knowLandmark`、`open` 讀檔）、`engine/loot.ts`（`withExtras`）
- Test: `engine/gen2/objects.test.ts`（新）、`engine/world.source.test.ts`、`engine/discovery.test.ts`、`engine/gen2/structures.test.ts`；必須保持綠：`engine/gen2/blueprint.test.ts`（M1 的坑道避讓測試 `:80-93`——含 shaftX 的槽不放非 DEEP 藍圖、非 DEEP 外框離 sx 在 `[sx − SHAFT_REACH − 1, sx + SHAFT_REACH + 2)` 之外；只把寫死 340 的地下槽判斷改成 `slotWidth`，不改斷言）
- 遊戲層的「讀生成物件」測試（`tabletId` / 領地標）不在本 Task：M1 的藍圖還沒有石碑 / 地標，而登錄要在 gen2 世界驗（Q5）→ 移到 Task 14（第一個帶石碑 / 地標的 gen2 家鄉內容）；本 Task 的 `game.ts` 改動由 Task 14 的測試承接。

**Interfaces:**
- Produces（`bpcore.ts`）：
  ```ts
  export type Layer = 0 | 1 | 2 | 3 | 4;                           // Task 1；Blueprint.layer 改成 Layer
  export const SUB_SLOT_W = 170;
  export function slotWidth(layer: Layer): number;                 // SURFACE / SKY → LAND_SLOT_W (340)，UNDER / DEEP / MINOR → 170
  export interface BpChest { x: number; y: number; kind: ChestKind; extra?: ItemId[] }
  export interface BpPot { x: number; y: number; drops: Drop[] }
  export interface BpTablet { x: number; y: number; id: number }
  export interface BpLandmark { x: number; y: number; tile: number; site: string }
  export interface BpGround { x0: number; tops: Int16Array }        // 欄 x0 + k 的地面（第一個實心格 y）
  export interface BpBox { x: number; y: number; w: number; h: number }
  // Blueprint 新增（全部必填，沒有就給空陣列 / null）：
  //   pots: BpPot[]; tablets: BpTablet[]; landmarks: BpLandmark[]; floors: { x: number; y: number }[] /* 站得住的格（空氣、腳下實心），給石碑 / 地標用 */;
  //   ground: BpGround | null; solid: BpBox | null; site: GenSite | null;  chests: BpChest[]
  //   wholeRegion: boolean   /* true = 佔滿整個地區的錨點（家鄉地城，Task 8）：外框只需在地區 [r.x0, r.x1) 內，豁免 SLOT_PAD 8 格槽邊距（Q2） */
  export const emptyObjects: () => Pick<Blueprint, 'pots' | 'tablets' | 'landmarks' | 'floors' | 'ground' | 'solid' | 'site' | 'wholeRegion'>;
  // BpCtx 新增（Q4）：
  //   groundAt(x: number): number   /* = profile.surfaceAt(x)，被與 x 相交、有 ground 的 SURFACE 層藍圖（最終結果）覆寫；
  //                                    只有 SKY / MINOR 層的建構器可以呼叫（SURFACE / UNDER / DEEP 的建構器讀 c.profile），所以沒有循環 */
  ```
- Produces（`column.ts`）：`interface GenExtras { pots: BpPot[]; tablets: BpTablet[]; landmarks: BpLandmark[]; sites: GenSite[] }`；`ColumnSource.extrasIn?(x0: number, x1: number): GenExtras`（每次回新物件）。
- Produces（`index.ts`）：`Gen2Source.surfaceAt(x)` = 與 x 相交的 **SURFACE 層**藍圖有 `ground` 且涵蓋 x 時取它（依 id 序、後者優先），否則 `profile.surfaceAt(x)`；32 欄一段快取。**地面覆寫只來自 SURFACE 層**（MINOR / SKY 沒有 `ground`），與 `BpCtx.groundAt` 同一個函式（Q4：SKY 需要地面、地面只看 SURFACE、SURFACE 不讀 SKY / MINOR → 沒有循環）。`objectsIn` 的 slots = `withExtras(chestLoot(...), c.extra ?? [])`。`extrasIn(x0, x1)` = 相交藍圖中 x ∈ [x0, x1) 的 pots / tablets / landmarks，與 `site` 錨點 x 在範圍內的聚落。
- Produces（`loot.ts`）：`withExtras(slots: (Stack | null)[], extra: readonly ItemId[]): (Stack | null)[]`——每件放進第一個空格、沒有空格就蓋最後一格（與舊 `worldgen.ts` 的 `addTo` 相同語意）。
- Produces（`world.ts`）：`readonly genTablets: Map<number, number>`（tile 鍵 → 碑文 id）、`readonly genLandmarks: Map<number, LandmarkInfo>`、`onGenSites: ((sites: GenSite[]) => void) | null`。登錄規則：箱子照 M1（chunk 沒改過、chests 沒這鍵、格是箱子 tile）；陶罐掉落 / 石碑 / 地標——**蓋上停放的 chunk 之後，那格的 tile 仍是 T.POT / T.LORE_TABLET / 該地標 tile 就登錄**（不看 chunk 有沒有改過）；卸載時這三種都刪掉（下次載入重登）；`sites` 每次載入都交給 `onGenSites`（重複由 SiteRegistry 去重）。
- Produces（`discovery.ts`）：`DiscoveryOpts.open?: boolean`（gen2 世界傳 true：`load` 保留所有存檔的地標鍵、不經 `landmarkSet` 過濾）；`knowLandmark(key: number): void`（把鍵加進可領集合）。`game.ts`：`tabletId(x, y)` 先查 `tabletAt` 再查 `world.genTablets`；`claimLandmark` 的 info 取 `landmarkAt.get(k) ?? world.genLandmarks.get(k)`；World 登錄地標時呼叫 `discovery.knowLandmark`（每個 actor 的 Discovery 都要，見 `game.ts:1057`）。
- 槽位：表層 / 天空層照 M1（340），地下 / 深層 / 小點位每個陸地地區切成 170 格（最後一槽吃餘數），各自有自己的 slot 序號；外框仍在 `[槽 x0 + 8, 槽 x1 − 8)`（`wholeRegion` 的藍圖例外，Q2）。M1 的機率表搬到新槽寬：地下層（170）小屋 0.35、地下湖 0.12；深層（170）熔岩池 0.2；含 shaftX 的槽照舊不放表層 / 地下藍圖（地下層用 170 格槽判斷）。保證槽（P11）用新的地下槽。
- **坑道避讓帶（Q3）**：UNDER / DEEP 的藍圖外框不得與 `[shaftX − SHAFT_HALF − 4, shaftX + SHAFT_HALF + 4]`（該地區主坑道；`caves.ts` 的 `SHAFT_HALF`）相交——`placeX` 對這兩層把壓到帶子的候選視為不合格（force 時也不放：回 null）。例外：`shaft_cache` 錨點（Task 14，刻意蓋在坑道底）。UNDER（非 DEEP）另外照舊受 M1 更嚴的 `[sx − SHAFT_REACH − 1, sx + SHAFT_REACH + 2)` 約束（`blueprint.test.ts:86-93` 不改、必須綠）；所以帶子實際新增的是 DEEP 層的約束。170 格槽的任何單一外框 ≤ 槽寬 − 16 = 154。

- [ ] **Step 1: 寫失敗測試**

```ts
// objects.test.ts
const src = new Gen2Source('obj');
it('slotWidth 與各層槽：地下 / 深層 / 小點位 170、表層 / 天空 340；slotOf 依層反查；非 wholeRegion 的外框離槽邊 ≥ 8', () => {
  expect([0, 1, 2, 3, 4].map((l) => slotWidth(l as Layer))).toEqual([340, 170, 170, 340, 170]);
  for (const b of src.blueprints.overlapping(-20_000, 20_000)) { const s = slotOf(b.id, src.layout);
    if (b.wholeRegion) { expect(b.x).toBeGreaterThanOrEqual(s.region.x0); expect(b.x + b.w).toBeLessThanOrEqual(s.region.x1); continue; }   // Q2
    expect(s.x1 - s.x0).toBeLessThan(2 * slotWidth(b.layer)); expect(b.x).toBeGreaterThanOrEqual(s.x0 + 8); expect(b.x + b.w).toBeLessThanOrEqual(s.x1 - 8); } }, 120_000);
it('UNDER / DEEP 外框不碰坑道避讓帶 [sx − SHAFT_HALF − 4, sx + SHAFT_HALF + 4]（shaft_cache 例外）（Q3）', () => { const ss = seedInt('obj', 'g2-shaft');
  for (const b of src.blueprints.overlapping(-20_000, 20_000, [BP_UNDER, BP_DEEP]).filter((q) => q.kind !== 'shaft_cache')) {
    const sx = shaftX(ss, slotOf(b.id, src.layout).region); if (!Number.isFinite(sx)) continue;
    expect(b.x + b.w <= sx - SHAFT_HALF - 4 || b.x > sx + SHAFT_HALF + 4, `${b.kind} ${b.x}`).toBe(true); } }, 120_000);
it('遺跡的地面覆寫：surfaceAt = 第一個實心格（外框每一欄）', () => {
  const w = worldOf(src); for (const b of src.blueprints.overlapping(-20_000, 20_000).filter((q) => q.kind === 'ruin').slice(0, 12)) {
    expect(b.ground).not.toBeNull(); loadColumns(w, b.x, b.x + b.w);
    for (let x = b.x; x < b.x + b.w; x++) expect(src.surfaceAt(x), `x ${x}`).toBe(firstSolid(w, x)); } }, 60_000);
it('箱子附加物品：withExtras 放第一個空格、滿了蓋最後一格', () => {
  expect(withExtras([null, { item: 'torch', count: 3 }, null], ['magnet'])).toEqual([{ item: 'magnet', count: 1 }, { item: 'torch', count: 3 }, null]);
  const full = [{ item: 'torch', count: 1 }, { item: 'rope', count: 1 }];
  expect(withExtras(full, ['magnet']).at(-1)).toEqual({ item: 'magnet', count: 1 }); });
// world.source.test.ts（ExtraSource = M1 的最小 HashSource 加 extrasIn：一個陶罐 / 一塊石碑 / 一個地標 / 一個聚落）
it('extras 登錄：tile 還在就登錄（chunk 改過也一樣）、tile 變了就不登錄、卸載清掉、聚落交給 onGenSites', () => {
  const w = new World(4200, 1200, { bounds: 'infinite', source: ex, central: 'source' }), seen: GenSite[][] = [];
  w.onGenSites = (s) => seen.push(s); w.ensureColumn(10);
  expect(w.potDrops.get(w.idx(POT.x, POT.y))).toEqual(POT.drops); expect(w.genTablets.get(w.idx(TAB.x, TAB.y))).toBe(TAB.id);
  expect(w.genLandmarks.get(w.idx(LM.x, LM.y))).toMatchObject({ tile: LM.tile, site: LM.site }); expect(seen).toEqual([[SITE]]);
  w.setFg(LM.x + 3, LM.y, T.AIR); w.touch(LM.x + 3, LM.y);                      // 同 chunk 挖一格
  w.setFg(POT.x, POT.y, T.AIR); w.touch(POT.x, POT.y);                          // 陶罐打破
  w.unloadColumn(10); expect(w.genLandmarks.size).toBe(0); expect(w.potDrops.size).toBe(0); w.ensureColumn(10);
  expect(w.genLandmarks.has(w.idx(LM.x, LM.y))).toBe(true); expect(w.potDrops.has(w.idx(POT.x, POT.y))).toBe(false); });
// discovery.test.ts
it('open：讀檔保留還沒登錄的地標鍵；knowLandmark 之後才領得到', () => {
  const d = new Discovery([], { open: true }); d.load({ regions: [], lore: [], treasures: [], depthRecord: 0, distance: 0, landmarks: [99_000_123] });
  expect([...d.landmarks]).toEqual([99_000_123]); expect(d.claimLandmark(5)).toBe(false); d.knowLandmark(5); expect(d.claimLandmark(5)).toBe(true);
  const closed = new Discovery([]); closed.load({ regions: [], lore: [], treasures: [], depthRecord: 0, distance: 0, landmarks: [99_000_123] }); expect(closed.landmarks.size).toBe(0); });
```
（`firstSolid(w, x)` = 該欄由上往下第一個 `isSolidTile` 的 y，寫在 `testUtil.ts`；`world.source.test.ts` 的 World 是 `central: 'source'`（每一欄都經過 source 登錄），不是 arrays 模式的小世界——arrays 模式的中央欄在建構時就建好、從不呼叫 `registerObjects`（world.ts:170-173），在那裡驗登錄會永遠失敗（Q5）。`shaftX` / `SHAFT_HALF` / `seedInt` 從 `caves.ts` / `noise.ts`。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/objects.test.ts src/scripts/games/delve/engine/world.source.test.ts src/scripts/games/delve/engine/discovery.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** — 如上。Filler2：fill 先取 `overlapping(x0 − FILL_REACH, x1 + FILL_REACH)`，`column()` 對落在任一 `solid` 箱內的格不挖噪聲洞穴、不當入口、不換礦（只填天然材質）；主坑道照挖（地城區沒有主坑道，見 Task 7）。遺跡（M1）的地基補土到 `base`、上方清空 → `ground.tops[k] = base`（外框每欄）。M1 測試裡寫死 340 的地下槽判斷改用 `slotWidth`。`placeX` 加坑道避讓帶（Q3）；`bpcore.ts:54-56` 的「鄰槽碰不到坑道」註解改寫成新規則（340 格槽的舊論證對 170 格槽不成立）。`BlueprintIndex.ctx()` 給 `groundAt`（Q4）。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine src/scripts/games/delve/save src/scripts/games/delve/net`；Expected: 全綠（gen2 v0 雜湊重錄）。
- [ ] **Step 5: Commit** — `feat(delve): gen2 blueprint objects, ground overrides, cave-free boxes, per-layer slot widths`。

---

### Task 3: 聚落登錄（SiteRegistry）與穩定的 NPC id

**Files:**
- Create: `engine/siteRegistry.ts`、`engine/siteRegistry.test.ts`
- Modify: `engine/folk.ts:89-200`（`FolkWorld(seed)`、`addSite`、NPC id）、`engine/game.ts:893-902`（建 registry、legacy 登錄）、`:2585-2586`（委託板找村子）、`:4407-4408`（`FolkHost.underground` 排除所有地城外框）、`:4436-4454`（`siteAt` / `siteName`）、`:4686-4691`（`nextStepHint`）、`render/folkUi.ts:126`（`siteName` 參數）
- Test: `engine/game.folk.test.ts`、`net/coop.test.ts`（或 testRig 既有的 folk 同步測試）

**Interfaces:**
- Consumes: `GenSite`（`engine/genTypes.ts`，Task 1）。
- Produces（`siteRegistry.ts`）：
  ```ts
  export const SITE_NPC_BASE = 1 << 20;
  // 加寬的確定性雜湊（Q6）：a = seedInt(key, 'npc-a')、b = seedInt(key, 'npc-b')；hi = floor(hash2(a, b, 1) × 2147483648)、lo = floor(hash2(b, a, 2) × 2097152)
  // id = SITE_NPC_BASE + hi × 2097152 + lo ∈ [2^20, 2^20 + 2^52)，安全整數（net 的 Ws 以 JSON number 傳 id，net/codec.ts 不打包 npcs）
  export function npcIdFor(key: string): number;
  export function claimNpcId(used: Map<number, string>, id: number, key: string): void;   // 同 id 已被「另一個 key」用 → throw Error('npc id collision: …')；同 key 重來 → 無事。不探測、不 +1
  export function legacySites(villages: readonly VillageInfo[], halls: readonly HallInfo[], dungeon: DungeonInfo | null): GenSite[];  // key 'v{i}' / 'h{i}' / 'd0'，rot = i
  export class SiteRegistry {
    constructor(o: { ranges: 'legacy' | 'gen2' });
    add(s: GenSite): boolean;                                  // 新 key 回 true；同 key 忽略
    byKey(key: string): GenSite | undefined;
    list<K extends GenSite['kind']>(kind: K): Extract<GenSite, { kind: K }>[];   // 依加入順序
    at(x: number, y: number): GenSite | null;
    onAdd(fn: (s: GenSite) => void): void;
  }
  ```
- `at` 的範圍（Q6）：`ranges: 'legacy'`（舊世界）= **今天 `game.siteAt` 的範圍逐字照抄**（game.ts:4436-4446：村落 `x0 − 12 .. x1 + 12`、`ground − 28 .. ground + 4`；地廳 `x0 − 4 .. x1 + 4`、`y0 − 5 .. floorY + 2`；先村落後地廳），旗標關閉時 `safeAt` / 委託板行為不變；`ranges: 'gen2'` 才用新範圍：村落 `x0 − 4 .. x1 + 4`、`ground − 30 .. ground + 6`；地廳：外框 + 隧道；隱士：±8；地城：bbox。
- Produces（`folk.ts`）：`new FolkWorld(seed: string)`；`addSite(w: World, s: GenSite): void`——村落 / 地廳的角色與現在 `populate` 相同（村落 = elder、trader + `VROLES[s.rot % 4]`，地廳三人），NPC key = `` `${s.key}:${role}` ``（舊世界 = `v0:elder`…，與現在逐字相同），NPC id = `npcIdFor(npcKey)`；`FolkNpc.site` 改存 site key（字串）。遇見型 NPC（行商 / 受困者）維持遞增 id（< SITE_NPC_BASE）。`populate` 刪除（由 `registry.onAdd` 觸發 `addSite`）。
- game.ts：`readonly sites: SiteRegistry`；舊世界建構時 `legacySites(...)` 依序 add（行為與現在相同）；`siteAt` 回 `GenSite | null`、`siteName(key)`；委託板 = `sites.at(board)`；`FolkHost.underground` 排除 `sites.list('dungeon')` 每個 bbox。

- [ ] **Step 1: 先錄改動前的值，再寫失敗測試**

```ts
// game.folk.test.ts（舊世界 'alpha'，檔案內共用一次，逾時 120 s）
it('舊世界的 NPC key / 角色 / 名字 / 外觀與改動前相同', () => {
  expect(g.folk.npcs.filter((n) => n.origin !== 'road' && n.origin !== 'cave').map((n) => [n.key, n.role, n.name]).sort()).toEqual(FOLK_BEFORE);   // 改 folk.ts 前跑一次錄下
});
it('聚落 NPC 的 id = npcIdFor(key)、彼此不撞', () => { const ids = g.folk.npcs.filter((n) => n.id >= SITE_NPC_BASE).map((n) => n.id);
  for (const n of g.folk.npcs.filter((q) => q.id >= SITE_NPC_BASE)) expect(n.id).toBe(npcIdFor(n.key)); expect(new Set(ids).size).toBe(ids.length); });
// siteRegistry.test.ts
it('兩種登錄順序 → 同一組 key 與 NPC id；重複 add 忽略', () => {
  const sites = [...legacySites(V3, H2, null), hermitSite(77)], a = new FolkWorld('o'), b = new FolkWorld('o'), w = blankWorld();
  for (const s of sites) a.addSite(w, s); for (const s of [...sites].reverse()) b.addSite(w, s);
  const ids = (f: FolkWorld) => f.npcs.map((n) => [n.key, n.id] as const).sort();
  expect(ids(b)).toEqual(ids(a)); const r = new SiteRegistry({ ranges: 'gen2' }); expect(r.add(sites[0])).toBe(true); expect(r.add(sites[0])).toBe(false); });
it('at（legacy）：與改動前的 game.siteAt 逐點相同（V3 / H2 外框 ±20 格的每一格）', () => { const r = new SiteRegistry({ ranges: 'legacy' }); for (const s of legacySites(V3, H2, null)) r.add(s);
  for (const p of gridAround(V3, H2, 20)) expect(siteKeyOf(r.at(p.x, p.y)), `${p.x},${p.y}`).toBe(oldSiteAtKey(V3, H2, p.x, p.y)); });
it('at（gen2）：村落範圍內回村落、範圍外 null', () => { const r = new SiteRegistry({ ranges: 'gen2' }); r.add(legacySites(V3, [], null)[0]);
  expect(r.at(V3[0].board.x, V3[0].board.y)!.key).toBe('v0'); expect(r.at(V3[0].x1 + 40, V3[0].ground)).toBeNull(); });
it('1,000 個 gen2 風格 key（s{sid}:{role}）的 npcIdFor 沒有碰撞、都是安全整數 ≥ SITE_NPC_BASE', () => { const keys = [...Array(1000)].flatMap((_, k) => ['elder', 'trader', 'guide'].map((r) => `s${k * 7919}:${r}`));
  const ids = keys.map(npcIdFor); expect(new Set(ids).size).toBe(keys.length);
  for (const id of ids) { expect(Number.isSafeInteger(id)).toBe(true); expect(id).toBeGreaterThanOrEqual(SITE_NPC_BASE); } });
it('撞號直接丟錯（不探測，id 不依登錄順序）', () => { const used = new Map<number, string>();
  claimNpcId(used, 42, 'a'); expect(() => claimNpcId(used, 42, 'a')).not.toThrow(); expect(() => claimNpcId(used, 42, 'b')).toThrow(/collision/); });
```
（`V3` / `H2` = 測試檔內手寫的 3 個 VillageInfo / 2 個 HallInfo、`hermitSite(sid)`、`blankWorld()` = `new World(400, 200)`；`oldSiteAtKey` = 測試檔內照抄 game.ts:4436-4446 的舊判斷（回 `'v{i}'` / `'h{i}'` / null）、`gridAround`、`siteKeyOf(s) = s?.key ?? null`；連線同步測試沿用 `net/` 既有的 folk 測試，必須仍綠——NPC id 換了但房主與客人用同一個函式。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/siteRegistry.test.ts src/scripts/games/delve/engine/game.folk.test.ts`；Expected: `FOLK_BEFORE` 先 PASS（改碼前錄），新測試 FAIL。
- [ ] **Step 3: 實作** 如上；`npcIdFor` 撞號時**丟錯、不探測**（`FolkWorld.addSite` 每個 NPC 經 `claimNpcId`；探測會讓 id 依登錄順序而變，房主 / 客人載入外圍的順序不同——Q6），測試證明 1,000 組沒有撞。舊世界建 `SiteRegistry({ ranges: 'legacy' })`、gen2 建 `({ ranges: 'gen2' })`。`FolkNpc.site` 改字串後，`n.site < 0` / `>= 0` 的判斷（folk.ts:156, 271, 275, 370, 575、render/folkUi.ts:126）一併改（tsc 會抓到）。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine src/scripts/games/delve/net src/scripts/games/delve/save`；Expected: 全綠（存檔的好感度 / 委託鍵沒變）。
- [ ] **Step 5: Commit** — `refactor(delve): site registry with stable keys; settlement NPC ids from their keys`。

---

### Task 4: 共用繪製畫布 + 村落與矮人地廳的繪製搬出 legacy

**Files:**
- Create: `engine/gen2/draw/canvas.ts`、`engine/gen2/draw/bpCanvas.ts`、`engine/gen2/draw/village.ts`、`engine/gen2/draw/hall.ts`、`engine/legacy/gen/gridCanvas.ts`、`engine/gen2/draw/bpCanvas.test.ts`
- Modify: `engine/legacy/gen/settlements.ts:81-328`（選址留在原檔、畫圖改呼叫 draw/）

**Interfaces:**
- Produces（`canvas.ts`）：
  ```ts
  export interface RandomLike { next(): number; int(lo: number, hi: number): number; chance(n: number): boolean }   // legacy Rng 與 HRng 都符合
  export interface Canvas {
    inBounds(x: number, y: number): boolean;
    fg(x: number, y: number): number; wall(x: number, y: number): number; isSolid(x: number, y: number): boolean;
    setFg(x: number, y: number, t: number): void; setWall(x: number, y: number, w: number): void; clearLiquid(x: number, y: number): void;
    setSurface(x: number, y: number): void;                     // 整平後的地面
    surfaceAt(x: number): number;                               // 讀地面（Q7）：最後一次 setSurface 的值，否則天然地表——村落 shape() 讀 c.surface[x]（settlements.ts:139, 150）改讀這個
    chest(x: number, y: number, kind: ChestKind): void; addItem(x: number, y: number, item: ItemId): void;
    potDrop(x: number, y: number, drops: Drop[]): void;
    fillNatural(x: number, y: number): void;                    // 「這格恢復天然地層，除非它是有背景牆的實心」（舊地城補洞的規則）
  }
  ```
- Produces（`bpCanvas.ts`）：`class BpCanvas implements Canvas { constructor(box: BpBox, profile: Profile2); toBlueprint(id: number, kind: BpKind, layer: Layer, extra?: { landmarks?: BpLandmark[]; tablets?: BpTablet[]; site?: GenSite | null; floors?: { x: number; y: number }[] }): Blueprint }`——讀 = 畫過的格，否則天然地層（`y < 地表` 空氣、`< rock` 泥土、`< deep` 石、`< molten` 深層岩、其下玄武岩，地表 = profile）；`setSurface` 記進 `ground`；`fillNatural` 只把座標併進 `solid` 箱；`chest` 畫 T.CHEST 並記 BpChest、`addItem` 推進該箱 `extra`；畫出外框丟 RangeError（BpGrid 現有行為）。
- Produces（`gridCanvas.ts`）：`gridCanvas(world: GenGrid, seed: string, depthFrac: (x: number, y: number) => number, surface: Int16Array, natural: (x: number, y: number) => readonly [fg: number, wall: number]): Canvas`——讀寫 GenGrid、`chest` = `world.chests.set(i, chestLoot(...))`、`addItem` = 舊 `addTo` 語意、`setSurface` 寫 `surface[x]` 與 `world.surface[x]`、`surfaceAt` 讀 `surface[x]`、`fillNatural` = 舊地城 `dungeon.ts:320-349` 的單格規則，天然材質由 `natural(x, y)` 回呼給（Q7：legacy 傳 `dungeon.ts:31` / `worldgen.ts:1355-1356` 的 rock / deep / molten 分層函式；村落 / 地廳不用它，傳一個丟錯的回呼）。BpCanvas 的天然材質就是它自己的 Profile2 分層，不需要回呼。
- Produces（`village.ts`）：`drawVillage(cv: Canvas, o: { x0: number; vw: number; ground: number; style: number }, rng: RandomLike): VillageInfo`（整平 `shape()`、房子、廣場、旗桿、圍欄；`settlements.ts:138-191`）；`buildHouse(cv, x0, x1, floorY, door, role, rng)`（`:200`）。
- Produces（`hall.ts`）：`drawHall(cv: Canvas, o: { x0: number; hw: number; floorY: number }, rng: RandomLike, tunnelLen: (side: -1 | 1) => number): HallInfo`——隧道長度由呼叫端決定（legacy：照舊逐欄掃到洞穴為止的規則，包成回呼；gen2 在 Task 9 給固定長度）。

- [ ] **Step 1: 確認釘選測試現在是綠的** — Run: `npx vitest run src/scripts/games/delve/engine/world.central.test.ts src/scripts/games/delve/engine/legacy/worldgen.settlements.test.ts src/scripts/games/delve/engine/legacy/worldgen.settlements.many.test.ts`；Expected: PASS（這是本 Task 的回歸網；不新增期待值）。
- [ ] **Step 2: 寫 BpCanvas 的失敗測試**

```ts
it('BpCanvas：沒畫過的格讀天然地層；畫過讀畫的；setSurface → ground；fillNatural → solid 箱；chest + addItem → BpChest.extra', () => {
  const src = new Gen2Source('cv'), x = 3000, s = src.profile.surfaceAt(x), L = src.layersAt(x), cv = new BpCanvas({ x: x - 5, y: s - 20, w: 11, h: 80 }, src.profile);
  expect(cv.fg(x, s - 1)).toBe(T.AIR); expect(cv.fg(x, s + 1)).toBe(T.DIRT); expect(cv.fg(x, L.rock + 1)).toBe(T.STONE);
  cv.setFg(x, s + 1, T.PLANKS); expect(cv.fg(x, s + 1)).toBe(T.PLANKS);
  expect(cv.surfaceAt(x)).toBe(s); cv.setSurface(x, s - 2); expect(cv.surfaceAt(x)).toBe(s - 2); cv.fillNatural(x - 3, s + 10); cv.fillNatural(x + 2, s + 30);
  cv.chest(x + 1, s - 1, 'cabin'); cv.addItem(x + 1, s - 1, 'magnet');
  const b = cv.toBlueprint(1, 'cabin', 1);
  expect(b.ground!.tops[x - b.ground!.x0]).toBe(s - 2); expect(b.solid).toEqual({ x: x - 3, y: s + 10, w: 6, h: 21 });
  expect(b.chests).toEqual([{ x: x + 1, y: s - 1, kind: 'cabin', extra: ['magnet'] }]);
  expect(() => cv.setFg(x + 50, s, T.AIR)).toThrow(RangeError); });
```

- [ ] **Step 3: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/draw/bpCanvas.test.ts`；Expected: FAIL。
- [ ] **Step 4: 實作** — 先寫 `canvas.ts` / `bpCanvas.ts` / `gridCanvas.ts`；再把 `settlements.ts` 的 `shape()`、房子 / 廣場 / 旗桿、`buildHouse`、地廳主體搬到 `draw/`，**亂數抽取的順序與次數一個都不能變**（選址迴圈裡的 `rng` 呼叫留在 legacy，畫圖裡的跟著搬）；legacy 的 `put / putWall / solid / c.surface[x] =` 全換成 `gridCanvas` 的方法、讀 `c.surface[x]` 換成 `cv.surfaceAt(x)`（Q7）。
- [ ] **Step 5: 跑測試** — 同 Step 1 三個檔 + `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: 全 PASS、指紋未改。
- [ ] **Step 6: Commit** — `refactor(delve): canvas-based village and dwarf hall drawing shared by legacy and gen2`（說明：legacy 輸出由 world.central 指紋釘住不變）。

---

### Task 5: 地城繪製搬出 legacy

**Files:**
- Create: `engine/gen2/draw/dungeon.ts`
- Modify: `engine/legacy/gen/dungeon.ts`（只剩包裝：`generateDungeon(world, o)` = `gridCanvas` + `generateDungeonOn`）、`engine/legacy/worldgen.ts:1351-1358`（呼叫不變）

**Interfaces:**
- Produces（`draw/dungeon.ts`）：
  ```ts
  export interface DungeonPlanOpts {
    seed: string; zone: ReservedZone; surfaceAt: (x: number) => number; height: number;
    color: { key: string; brick: number; wall: number };
    natural?: boolean;                 // true = 施工前對外框呼叫 cv.fillNatural（legacy 與 gen2 都傳 true）
    rooms?: readonly RoomKind[];       // 預設 = 舊的 36 個必要房型清單（dungeon.ts:137）
    minConnected?: number;             // 預設 7（舊規則）
    tablets?: boolean;                 // 預設 true：塔 / 神殿 / 寶藏室放古碑
  }
  export function generateDungeonOn(cv: Canvas, o: DungeonPlanOpts): DungeonInfo | null;   // 8 次 plan 嘗試（seed `dungeon-plan-N`）+ build（`dungeon-build`），同舊流程
  ```
  `Math.sqrt` 的 `dist()`（`dungeon.ts:213`）只用來排序比較 → 改比平方距離（順序相同、輸出不變）。`world.surface[x] = gy` / `o.surface[x] = gy` → `cv.setSurface`；`world.chests.set` / `addItem` → `cv.chest` / `cv.addItem`；`world.potDrops.set` → `cv.potDrop`；天然補洞 → `cv.fillNatural`；草地重長（`:465-468`）→ `cv.setFg`（讀 `cv.fg`）。

- [ ] **Step 1: 確認釘選測試是綠的** — Run: `npx vitest run src/scripts/games/delve/engine/world.central.test.ts src/scripts/games/delve/engine/legacy/gen/dungeon.test.ts src/scripts/games/delve/engine/legacy/worldgen.explore.test.ts`；Expected: PASS。
- [ ] **Step 2: 寫失敗測試**（gen2 這一側；legacy 側的回歸網就是 Step 1）

```ts
// draw/dungeon.test.ts
it('generateDungeonOn 在 BpCanvas 上：≥ 25 房、bbox 在 zone 內、一個上鎖寶箱（rune_pickaxe）、神殿箱有 golden_key、陶罐鑰匙 = 上鎖門數 − 箱子鑰匙數', () => {
  const src = new Gen2Source('dg'), zone = { x0: 100, x1: 520, y0: 290, y1: 700, side: 'left' as const };
  const cv = new BpCanvas({ x: zone.x0, y: zone.y0 - 40, w: zone.x1 - zone.x0, h: 480 }, src.profile);
  const d = generateDungeonOn(cv, { seed: 'dg', zone, surfaceAt: (x) => src.profile.surfaceAt(x), height: 1200, color: DUNGEON_COLORS[0], natural: true })!;
  expect(d.rooms.length).toBeGreaterThanOrEqual(25); expect(d.bbox.x).toBeGreaterThanOrEqual(zone.x0); expect(d.bbox.x + d.bbox.w).toBeLessThanOrEqual(zone.x1);
  const b = cv.toBlueprint(1, 'dungeon', 0);
  expect(b.chests.filter((c) => c.kind === 'treasure').map((c) => c.extra)).toEqual([['rune_pickaxe']]);
  expect(b.chests.some((c) => c.extra?.includes('golden_key'))).toBe(true);
  expect(b.pots.flatMap((p) => p.drops).filter((q) => q.item === 'dungeon_key').length + b.chests.filter((c) => c.extra?.includes('dungeon_key')).length).toBe(d.doors.filter((q) => q.locked).length);
  expect(b.solid).not.toBeNull(); });
```
（`DUNGEON_COLORS` 從 `tiles.ts`；鑰匙放箱子還是陶罐以 `draw/dungeon.ts` 搬過來的規則為準，斷言的是總數。）

- [ ] **Step 3: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/draw/dungeon.test.ts`；Expected: FAIL。
- [ ] **Step 4: 實作** 如上（`planDungeon` / `build` 整段搬，`world` 參數換成 `cv` + `o.height`）。
- [ ] **Step 5: 跑測試** — Step 1 的三個檔 + `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: 全 PASS、指紋未改。
- [ ] **Step 6: Commit** — `refactor(delve): canvas-based dungeon drawing shared by legacy and gen2`。

---

### Task 6: 礦坑 + 密室、空島的繪製搬出 legacy

**Files:**
- Create: `engine/gen2/draw/mineshaft.ts`、`engine/gen2/draw/skyIsland.ts`
- Modify: `engine/legacy/worldgen.ts:1160-1247`（礦坑 / 密室）、`:1554-1630`（空島）——選址、`free()`、`occupied`、`structures.push` 留著，畫圖改呼叫 draw/

**Interfaces:**
- Produces（`mineshaft.ts`）：`drawMineshaft(cv: Canvas, o: { x0: number; len: number; yTop: number }, rng: RandomLike): { chest: { x: number; y: number } | null }`（4 列空氣、非實心才補木板地板 / 頂、每 6 格木框、每 3 框一支火把、1/2 機率箱子 'mineshaft'）；`drawRamp(cv, o: { x0: number; yTop: number }, surfaceAt: (x: number) => number): void`；`drawSecretRoom(cv: Canvas, o: { shaftX0: number; shaftLen: number; yTop: number; right: boolean; rw: number }, rng: RandomLike): { x: number; y: number; w: number; h: number; chest: { x: number; y: number } }`（裂紋石塞、石殼、木板牆、'secret' 箱、2 陶罐、蛛網、鐘乳石，不放發光物）。
- Produces（`skyIsland.ts`）：`drawSkyIsland(cv: Canvas, o: { x0: number; iw: number; top: number; thick: number; noiseSeed: number }, rng: RandomLike, groundBelow: (x: number, fromY: number) => number): { chest: { x: number; y: number }; rope: { x: number; y0: number; y1: number } | null }`——`groundBelow` = 繩梯下方第一個實心格的 y（legacy：照舊逐格往下讀 world；gen2：Profile2 / 地面覆寫）。

- [ ] **Step 1: 確認釘選測試是綠的** — Run: `npx vitest run src/scripts/games/delve/engine/world.central.test.ts src/scripts/games/delve/engine/legacy/worldgen.test.ts src/scripts/games/delve/engine/legacy/worldgen.explore.test.ts`；Expected: PASS。
- [ ] **Step 2: 寫失敗測試**

```ts
// draw/mineshaft.test.ts
it('drawSecretRoom 在 BpCanvas 上：裂紋石塞 2 格厚 × 4 列、secret 箱、沒有發光 tile', () => {
  const src = new Gen2Source('sr'), x0 = 3000, yTop = src.profile.surfaceAt(x0) + 60, cv = new BpCanvas({ x: x0 - 20, y: yTop - 10, w: 140, h: 24 }, src.profile);
  drawMineshaft(cv, { x0, len: 80, yTop }, new HRng(1, 2)); const r = drawSecretRoom(cv, { shaftX0: x0, shaftLen: 80, yTop, right: true, rw: 10 }, new HRng(1, 3));
  const b = cv.toBlueprint(1, 'mineshaft', 1), at = cellMap(b);
  for (let y = yTop; y < yTop + 4; y++) for (const dx of [0, 1]) expect(at.get(`${x0 + 80 + dx},${y}`)).toBe(T.CRACKED_STONE);
  expect(b.chests.find((c) => c.x === r.chest.x)!.kind).toBe('secret');
  expect([...at.values()].some((t) => GLOWING.has(t))).toBe(false); });
// draw/skyIsland.test.ts
it('drawSkyIsland：箱子 sky、繩梯下端在 groundBelow − 3', () => { const cv = new BpCanvas({ x: 900, y: 200, w: 60, h: 140 }, new Gen2Source('si').profile);
  const r = drawSkyIsland(cv, { x0: 905, iw: 40, top: 230, thick: 10, noiseSeed: 7 }, new HRng(3, 4), () => 330);
  expect(r.rope).not.toBeNull(); expect(r.rope!.y1).toBe(327); expect(cv.toBlueprint(1, 'sky_island', 3).chests[0].kind).toBe('sky'); });
```
（`cellMap(b)` = `"x,y" → fg` 的 Map、`GLOWING` = `tiles.ts` 的光源 tile 集合（以 `LIGHT` 表或既有 `isLight` 為準），寫在測試檔內。）

- [ ] **Step 3: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/draw`；Expected: FAIL。
- [ ] **Step 4: 實作** 如上，亂數順序不變。
- [ ] **Step 5: 跑測試** — Step 1 三個檔 + `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: 全 PASS、指紋未改。
- [ ] **Step 6: Commit** — `refactor(delve): canvas-based mineshaft, secret room and sky island drawing shared by legacy and gen2`。

---

### Task 7: 家鄉版面的地城區、錨點框架

**Files:**
- Create: `engine/gen2/anchors.ts`、`engine/gen2/anchors.test.ts`
- Modify: `engine/gen2/layout.ts:225-248`（`buildHome`：地城區、沙漠側規則）、`:14`（`VARIANT.DUNGEON = 7`）、`engine/gen2/profile.ts:14-18`（`AMP[DUNGEON] = 0.3`）、`engine/gen2/caves.ts:28-30`（`hasShaft`：地城區沒有主坑道）、`engine/gen2/blueprint.ts`（`build` 先查錨點；錨點建構器登錄表；建構子 `opts.extraAnchors` 測試接縫）、`engine/discovery.ts`（地城區命名：照家鄉森林命名——`landName` 已退回森林名，多半不用改）
- Test: `engine/gen2/layout.test.ts`、`engine/gen2/anchors.test.ts`、`engine/gen2/blueprint.test.ts`（M1 的出生點 ± 80、坑道槽、家鄉沙灘斷言不改、必須綠）

**Interfaces:**
- Produces（`layout.ts`）：`VARIANT.DUNGEON = 7`；家鄉在 `h(9) < 0.5` 的那一側（西 / 東）放 `[70, 490)` 或 `[3710, 4130)` 的地城區（biome FOREST、kind home、variant DUNGEON）；該側的外圍生態（雪或叢林）、沙漠、森林往內排。沙漠原本擲到地城側但放不下（`外圍寬 + 84 + 沙漠寬 + 84 > 1680 − 70 − 420`）時改放另一側。`homeDungeonRegion(m: Landmass): RegionInfo`。
- Produces（`anchors.ts`）：
  ```ts
  export type AnchorKind = 'dungeon' | 'village' | 'hall' | 'mineshaft_secret' | 'sky_island' | 'mushroom_biome' | 'crystal_cave' | 'hive'
    | 'cave_lake' | 'ruin' | 'cabin' | 'alcove_snow' | 'alcove_desert' | 'molten_shrine' | 'shaft_cache' | 'spawn_tablet' | 'keep' | 'hermit_hut'
    | 'test_probe';                                               // 只給測試注入（Q8）：homeAnchors / continentAnchors 永遠不產生、永遠不登錄建構器
  export interface Anchor { kind: AnchorKind; region: RegionInfo; layer: Layer; slot: number; wholeRegion?: boolean /* 地城：佔滿整個地區（Q2） */ }
  export function homeAnchors(seed: string, home: Landmass, profile: Profile2): Anchor[];
  export function continentAnchors(seed: string, m: Landmass, profile: Profile2): Anchor[];   // 本 Task 回 []，Task 18 實作
  export type AnchorBuild = (c: BpCtx) => Blueprint;              // 一律 force，不回 null
  export function registerAnchorBuild(kind: AnchorKind, build: AnchorBuild): void;   // 結構 Task 各自登錄；沒登錄的錨點 = 該槽保留但空著
  ```
  `BlueprintIndex` 建構子加測試接縫 `opts?: { extraAnchors?: (m: Landmass) => readonly Anchor[] }`（併進 `anchorsOf` 的結果；正式碼不傳）。`BlueprintIndex.anchorsOf(m: Landmass): readonly Anchor[]`（快取）；`build()`：地城區只有 `dungeon` 錨點（佔該地區每一層，其他層回 null）；某 (地區, 層, 槽) 有錨點 → 用錨點建構器（沒登錄 → null），不擲機率；其餘照機率表。
- **家鄉錨點規則（作者決定，凍結前可調，測試釘不變量）：**
  - `dungeon`：地城區、SURFACE、slot 0。
  - `village` × 2 + 額外：森林生態、variant 為 PLAIN / HILLS / SPAWN 的地區的 SURFACE 槽，槽中心離出生點 ≥ 200、不含 shaftX；第 1 座取槽中心最接近 `SPAWN_X − 950` 的、第 2 座最接近 `SPAWN_X + 950` 的（那一側沒有就取全家鄉最接近、且不相鄰的）；總數 2 / 3 / 4（`hash` 15% / 60% / 25%），額外的取剩下合格槽中離已選村莊最遠的。
  - `hall` × 1–2（2/3 機率 2 座）：第 1 座 = 非地城那一端的外圍生態地區、離家鄉端點最近的 DEEP 槽；第 2 座 = 地城側、DEEP 槽中心最接近 `SPAWN_X ∓ 1200` 的，與第 1 座相距 ≥ 840。
  - `mineshaft_secret` × 3：UNDER 槽，離出生點 ≥ 160、彼此 ≥ 2 槽，依 `hash` 挑。
  - `sky_island` × 2：SKY 槽，離出生點 ≥ 250、不在地城區。
  - `mushroom_biome` × 1（森林地區 UNDER）、`crystal_cave` × 1（DEEP）、`hive` × 1（叢林地區 UNDER）、`cave_lake` × 1（UNDER）、`ruin` × 1（非雪原、表層）、`cabin` × 2（離出生點最近、不在 ±80 排除區的兩個 UNDER 槽）。
  - `alcove_snow` / `alcove_desert`：雪原 / 沙漠地區各一個 UNDER 槽。
  - `molten_shrine`：DEEP 槽、槽中心離出生點 ≥ 630。
  - `shaft_cache`：家鄉主坑道最深（`shaft.bottom` 最大）的那個地區，其坑道所在的 DEEP 槽（深層不受「坑道槽不放藍圖」限制）。
  - `spawn_tablet`：MINOR 層、出生點東側第一個與 `[SPAWN_X − 80, SPAWN_X + 80]` 不相交、也不含 shaftX 的槽（Q16：M1 `blueprint.test.ts:72-79` 的「± 80 內沒有藍圖、含 ± 80 的槽整槽全空」對所有層都成立，MINOR 不例外）。
  - 回傳順序 = 上面列的順序（測試靠它取「第 1 座地廳」）；同一 (地區, 層, 槽) 至多一個錨點；`SPAWN_X ± 80` 的排除區適用**所有層**（含 MINOR，Q16）；非 DEEP 的錨點不得落在含 shaftX 的槽（M1 `blueprint.test.ts:80-83` 檢查所有非 DEEP 層）；`dungeon` 錨點 `wholeRegion: true`。

- [ ] **Step 1: 寫失敗測試**

```ts
// layout.test.ts（家鄉）
it('家鄉地城區：420 寬、緊貼一端沙灘、FOREST、50 個種子兩側都出現；四生態都在、沙漠放得下', () => { const sides = new Set<number>();
  for (const seed of SEEDS50) { const h = L(seed).landmassAt(SPAWN_X)!, d = homeDungeonRegion(h);
    expect(d.x1 - d.x0).toBe(420); expect([70, 3710]).toContain(d.x0); expect(d.biome).toBe(BIOME.FOREST); sides.add(d.x0);
    expect(new Set(h.regions.map((r) => r.biome))).toEqual(new Set([0, 1, 2, 3]));
    h.regions.forEach((r, k) => { if (k) expect(r.x0).toBe(h.regions[k - 1].x1); if (r.variant !== VARIANT.BEACH) expect(r.x1 - r.x0).toBeGreaterThanOrEqual(84); }); }
  expect(sides.size).toBe(2); }, 60_000);
// anchors.test.ts（50 個種子）
it('家鄉錨點不變量', () => { for (const seed of SEEDS50) { const g = new Gen2Source(seed), h = g.layout.landmassAt(SPAWN_X)!, a = g.blueprints.anchorsOf(h);
  const n = (k: AnchorKind) => a.filter((q) => q.kind === k).length;
  expect(n('dungeon')).toBe(1); expect(n('village')).toBeGreaterThanOrEqual(2); expect(n('village')).toBeLessThanOrEqual(4);
  expect(n('hall')).toBeGreaterThanOrEqual(1); expect(n('mineshaft_secret')).toBe(3); expect(n('sky_island')).toBe(2);
  for (const k of ['mushroom_biome', 'crystal_cave', 'hive', 'cave_lake', 'ruin', 'alcove_snow', 'alcove_desert', 'molten_shrine', 'shaft_cache', 'spawn_tablet'] as const) expect(n(k), k).toBe(1);
  expect(n('cabin')).toBe(2);
  const keys = a.map((q) => `${q.region.index}:${q.layer}:${q.slot}`); expect(new Set(keys).size).toBe(keys.length);
  for (const q of a.filter((p) => p.kind === 'village')) { expect(q.region.biome).toBe(BIOME.FOREST); expect(Math.abs(slotMid(q) - SPAWN_X)).toBeGreaterThanOrEqual(200); }
  expect(a.find((q) => q.kind === 'hive')!.region.biome).toBe(BIOME.JUNGLE);
  expect(a.find((q) => q.kind === 'alcove_snow')!.region.biome).toBe(BIOME.SNOW); expect(a.find((q) => q.kind === 'alcove_desert')!.region.biome).toBe(BIOME.DESERT);
  expect(Math.abs(slotMid(a.find((q) => q.kind === 'molten_shrine')!) - SPAWN_X)).toBeGreaterThanOrEqual(630);
  const far = a.find((q) => q.kind === 'hall')!, end = homeDungeonRegion(h).x0 < SPAWN_X ? 4200 : 0; expect(Math.abs(slotMid(far) - end)).toBeLessThan(500);
  for (const q of a) expect(slotOverlapsSpawnClear(q), q.kind).toBe(false);                          // 所有層，含 MINOR 的 spawn_tablet（Q16）
  expect(a.filter((q) => q.wholeRegion).map((q) => q.kind)).toEqual(['dungeon']); } }, 120_000);
it('錨點的槽不擲機率：沒登錄建構器的錨點槽是空的（測試專用 test_probe，Q8）', () => { const g = new Gen2Source('anc'), h = g.layout.landmassAt(SPAWN_X)!;
  const free = firstRolledSurfaceSlot(g, h);                         // 家鄉一個不是錨點、機率擲出遺跡 / 湖的 SURFACE 槽
  const idx = new BlueprintIndex('anc', g.layout, g.profile, { extraAnchors: (m) => (m === h ? [{ kind: 'test_probe', region: free.region, layer: BP_SURFACE, slot: free.slot }] : []) });
  expect(idx.overlapping(free.x0, free.x1).filter((b) => b.layer === BP_SURFACE && b.x >= free.x0 && b.x < free.x1)).toEqual([]);
  expect(g.blueprints.overlapping(free.x0, free.x1).filter((b) => b.layer === BP_SURFACE && b.x >= free.x0 && b.x < free.x1).length).toBe(1); });
it('地城區沒有主坑道', () => { for (const seed of SEEDS5) { const g = new Gen2Source(seed); expect(shaftX(seedInt(seed, 'g2-shaft'), homeDungeonRegion(g.layout.landmassAt(SPAWN_X)!))).toBeNaN(); } });
```
（`SEEDS50`、`slotMid(a)` = 錨點槽的中點、`slotOverlapsSpawnClear(a)`、`firstRolledSurfaceSlot(g, h)`（回 `{ region, slot, x0, x1 }`）寫在測試檔內。這個測試在 Task 10 登錄 `sky_island` 之後仍然成立——它不依賴任何正式錨點種類沒登錄。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/layout.test.ts src/scripts/games/delve/engine/gen2/anchors.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。M1 的家鄉測試（`layout.test.ts` 家鄉、`profile.test.ts` 出生平地、`fill.test.ts` 主坑道）照新版面重跑，失敗的依新規則改寫並在 commit 說明。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2 src/scripts/games/delve/engine/discovery.test.ts src/scripts/games/delve/engine/waystones.test.ts`；Expected: 全綠（gen2 v0 雜湊重錄）。
- [ ] **Step 5: Commit** — `feat(delve): gen2 home dungeon zone and anchor slots`。

---

### Task 8: gen2 地城（家鄉）

**Files:**
- Create: `engine/gen2/structures/dungeon.ts`、`engine/gen2/dungeon.test.ts`
- Modify: `engine/gen2/blueprint.ts`（`registerAnchorBuild('dungeon', buildDungeonBp)`；家鄉藍圖的釘選表）、`engine/gen2/bpcore.ts`（`BpKind` 加 `'dungeon'`、`Blueprint.colIndex?`）
- Test 必須保持綠：`engine/gen2/objects.test.ts`（Task 2 的槽邊距測試——地城 `wholeRegion: true`，走地區範圍那一支，Q2）

**Interfaces:**
- Consumes: `generateDungeonOn`、`BpCanvas`（Task 4、5）、錨點（Task 7）、`solid` / `ground` / `pots` / `site` / `wholeRegion`（Task 2）。
- **家鄉藍圖釘選（Q9）**：`BlueprintIndex` 對家鄉地塊的藍圖存進 `private readonly pinned: Map<number, Blueprint | null>`（永不淘汰），與外圍用的 LRU（`CACHE_MAX = 256`）分開；外圍照舊 LRU。
- Produces: `buildDungeonBp(c: BpCtx): Blueprint`——`wholeRegion: true`；zone = 地城區 `[x0 + 4, x1)`（對著沙灘那側留 4 格），`y0 = max(2, 區內最高地表 − 40)`、`y1 = min(LAVA_Y − 60, max(區內最大 rock + 40, 區內最小 deep + floor((區內最小 molten − 區內最小 deep) × 0.32)))`（舊規則 `worldgen.ts:613-617` 改用區內極值）；顏色 = `DUNGEON_COLORS[hash % 3]`；古碑 id 依位置固定：塔 = 6、神殿 = 7、寶藏室 = 12（`LORE_SITES`）；`site = { kind: 'dungeon', key: 's' + c.id, rot: 0, info }`；外框 = 繪製實際範圍。`generateDungeonOn` 回 null（8 次都失敗）時改用較寬鬆的 `minConnected: 5` 再試；仍失敗丟 RangeError（測試證明 50 個種子都不會發生）。
- 地城的 `floors`：每個房間地板列上站得住的格（給 Task 14 的地標 / 古碑不重疊判斷）。
- **召喚 / 鑰匙內容 = 與舊地城相同（Q20a）**：舊地城沒有召喚物件本身（grep 過 `legacy/gen/dungeon.ts`）；spec §4.4 的「召喚 / 鑰匙內容」解讀為舊地城實際有的三樣：陶罐裡的地城鑰匙（`potDrops` `{ item: 'dungeon_key', n: 1 }`，dungeon.ts:608）與箱子裡的地城鑰匙（:620）、上鎖的寶藏室寶箱（`T.LOCKED_CHEST`、`'treasure'` 箱、金鑰匙在上鎖神殿，:593）、以及燈籠守望者召喚物 `wick_offering`（`crafting.ts:92`：發光蘑菇 6 + 凝膠 5 + 金錠 3）的材料路徑——寶藏室的 `'treasure'` 戰利品有 `gold_ore` 20–36（`loot.ts:159`，≥ 12 = 3 金錠 × 4 礦），由 `draw/dungeon.ts` 搬過來的規則照舊產生。

- [ ] **Step 1: 寫失敗測試**（檔案內共用 5 個種子的地城藍圖：`beforeAll(() => { DUNGEONS = … }, 120_000)`——hook 預設只有 10 s，Q18）

```ts
it('§4.4：每個種子的家鄉地城 ≥ 25 房、bbox 寬 ≥ 0.7 高、在地城區內、塔底貼地', () => { for (const [seed, d] of DUNGEONS) {
  expect(d.info.rooms.length).toBeGreaterThanOrEqual(25); expect(d.info.bbox.w).toBeGreaterThanOrEqual(0.7 * d.info.bbox.h);
  const z = homeDungeonRegion(home(seed)); expect(d.info.bbox.x).toBeGreaterThanOrEqual(z.x0); expect(d.info.bbox.x + d.info.bbox.w).toBeLessThanOrEqual(z.x1);
  expect(Math.abs(d.src.surfaceAt(d.info.entrance.x) - (d.info.entrance.y + 1))).toBeLessThanOrEqual(2); } });
it('召喚 / 鑰匙內容：房間圖可解（鑰匙數 = 上鎖門數、不開鎖就拿得到所有鑰匙、金鑰匙在上鎖神殿、寶藏室上鎖）', () => { for (const [, d] of DUNGEONS) expect(solvable(d.info)).toEqual({ ok: true }); });
it('世界整合：載入地城欄後 tile 層級可解（洪水填充）、陶罐鑰匙登錄進 potDrops、上鎖寶箱 tile 與 rune_pickaxe、塔 / 神殿 / 寶藏室古碑 id 6 / 7 / 12', () => {
  const [, d] = DUNGEONS[0], w = worldOf(d.src); loadColumns(w, d.info.bbox.x, d.info.bbox.x + d.info.bbox.w);
  expect(floodSolvable(w, d.info)).toEqual({ ok: true });
  for (const p of d.bp.pots) expect(w.potDrops.get(w.idx(p.x, p.y))).toEqual(p.drops);
  const t = d.info.treasureChest; expect(w.getFg(t.x, t.y)).toBe(T.LOCKED_CHEST); expect(w.chests.get(w.idx(t.x, t.y))!.some((s) => s?.item === 'rune_pickaxe')).toBe(true);
  expect(d.info.tablets.map((q) => [q.site, w.genTablets.get(w.idx(q.x, q.y))]).sort()).toEqual([['shrine', 7], ['tower', 6], ['treasure', 12]]); }, 60_000);
it('召喚 / 鑰匙內容與舊地城相同（Q20a）：陶罐鑰匙 + 箱子鑰匙 = 上鎖門數、金鑰匙在上鎖神殿、寶藏箱的金礦夠做 wick_offering 的 3 金錠', () => { for (const [, d] of DUNGEONS) {
  const locked = d.info.doors.filter((q) => q.locked).length, potKeys = d.bp.pots.flatMap((p) => p.drops).filter((q) => q.item === 'dungeon_key').length;
  expect(potKeys).toBeGreaterThanOrEqual(1); expect(potKeys + d.bp.chests.filter((c) => c.extra?.includes('dungeon_key')).length).toBe(locked);
  expect(d.info.keys.filter((k) => k.golden && k.container === 'chest')).toHaveLength(1);
  const w = worldOf(d.src), t = d.info.treasureChest; loadColumns(w, t.x, t.x + 1);
  expect(w.getFg(t.x, t.y)).toBe(T.LOCKED_CHEST); expect(stackCount(w.chests.get(w.idx(t.x, t.y))!, 'gold_ore')).toBeGreaterThanOrEqual(12);
  expect(recipeOf('wick_offering').inputs).toContainEqual(['gold_bar', 3]); expect(recipeOf('gold_bar').inputs).toEqual([['gold_ore', 4]]); } }, 60_000);
it('地城裡沒有天然洞穴：bbox 內縮 14 的每個空氣格都有地城背景牆', () => { const [, d] = DUNGEONS[1], w = worldOf(d.src), b = d.info.bbox;
  loadColumns(w, b.x, b.x + b.w); expect(naturalHoles(w, { x: b.x + 14, y: b.y + 14, w: b.w - 28, h: b.h - 28 })).toEqual([]); }, 60_000);
it('分段填 = 整欄填（地城跨欄）；地城藍圖單次建構 ≤ 80 ms（直接呼叫建構器，不經索引）', () => { const [, d] = DUNGEONS[2], cx = (d.info.bbox.x >> 5) + 3;
  const whole = fillCol(d.src, cx), parts = new Column(cx, 1200); d.src.fill(parts, cx * 32, cx * 32 + 13); d.src.fill(parts, cx * 32 + 13, cx * 32 + 32);
  expect(bytes(parts)).toEqual(bytes(whole));
  const c = dungeonCtx(new Gen2Source('dg-time')), t0 = performance.now(); buildDungeonBp(c); expect(performance.now() - t0).toBeLessThanOrEqual(80); }, 30_000);
it('家鄉藍圖釘選：碰過外圍 300 份藍圖（超過 LRU 256）之後，再取地城藍圖是同一個物件（沒被淘汰重建）', () => { const g = new Gen2Source('dg-pin'), z = homeDungeonRegion(home('dg-pin'));
  const a = g.blueprints.overlapping(z.x0, z.x1).find((b) => b.kind === 'dungeon')!; touchOuterBlueprints(g, 300);
  expect(g.blueprints.overlapping(z.x0, z.x1).find((b) => b.kind === 'dungeon')).toBe(a); }, 60_000);
it('50 個種子都建得出地城（不丟 RangeError）', () => { for (const seed of SEEDS50) expect(() => dungeonOf(seed)).not.toThrow(); }, 300_000);
```
（`DUNGEONS` = 5 個種子的 `{ src, bp, info }`；`dungeonCtx(src)` = 地城錨點的 `BpCtx`（從 `anchorsOf` 取）、`touchOuterBlueprints(g, n)` = 依序取外圍大陸的藍圖直到碰過 n 份、`stackCount`、`recipeOf` 寫在測試檔或 `testUtil.ts`；`solvable` / `floodSolvable` 照 `legacy/gen/dungeon.test.ts:106-168` 的兩個解謎檢查改寫成吃 `DungeonInfo` / World（**搬到 `engine/gen2/testUtil.ts`**，M2b 刪 legacy 後仍在）；`naturalHoles(w, rect)` = rect 內空氣格中背景牆不是地城牆的座標清單。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/dungeon.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上；大藍圖的格子依 `(x >> 5, y, x)` 排序並記每欄的起訖（`Blueprint.colIndex?: Map<number, [number, number]>`，`stamp` 有它就只掃該欄的範圍）——同一藍圖每格只出現一次，排序不改結果。家鄉地塊的 `get` / `raw` 改走 `pinned`（Q9）。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: PASS。
- [ ] **Step 5: Commit** — `feat(delve): gen2 home dungeon`（re-record gen2 v0 hash）。

---

### Task 9: gen2 村落與矮人地廳（家鄉）+ 居民住進去

**Files:**
- Create: `engine/gen2/structures/village.ts`、`engine/gen2/structures/hall.ts`、`engine/gen2/home.ts`（本 Task 建立、只有 `homeSites`；Task 14 修改加 `homeContent`——Q11）、`engine/gen2/settlements.test.ts`
- Modify: `engine/gen2/blueprint.ts`（登錄 `village` / `hall` 錨點建構器；跨層不重疊規則）、`engine/gen2/bpcore.ts`（`BpKind` 加 `'village'` / `'hall'`）、`engine/worldBoot.ts:84-104`（`bootGen2` 把 `homeSites` 放進 `WorldContent.sites`）、`engine/game.ts`（建構時 `content.sites` 逐一 `sites.add`；`world.onGenSites` → `sites.add`）
- Test 必須保持綠：`engine/gen2/blueprint.test.ts`、`engine/gen2/objects.test.ts`（跨層規則會讓部分機率藍圖消失——M1 的「非保證槽照機率」比例測試若因此偏出，依新規則改寫並在 commit 說明）

**Interfaces:**
- Consumes: `drawVillage` / `drawHall`（Task 4）、`SiteRegistry` / `FolkWorld.addSite`（Task 3）。
- **跨層不重疊（Q10，作者規則）**：同一地帶、不同層的兩份**非液體**藍圖外框不得相交（液體照舊用 M1 的 `liquidYields`）。相交時依優先序丟掉一份（`build` 回 null）：錨點 > 保證槽（P11）> 機率擲出；同級時丟較深的那份（深度序 SURFACE < UNDER < DEEP；SKY 與 MINOR 同級時一律讓位——它們依 SURFACE 地面擺放，Q4，SURFACE 不能反過來依賴它們）。比對的是其他層的 **raw**（讓位前）藍圖，與 M1 `yieldLiquid` 同一種做法，不遞迴；SURFACE / UNDER / DEEP 的最終結果只看這三層的 raw，所以 `groundAt`（= SURFACE 最終結果）不會依賴 SKY / MINOR。錨點彼此由錨點規則保證不相交（測試釘）。這條規則在 Task 10、11、18 新增的種類上一樣適用（小地城的外框會讓同地帶的 UNDER / DEEP 機率藍圖消失）。
- Produces（`blueprint.ts`）：`export function crossYields(b: Blueprint, bRank: 0 | 1 | 2, o: Blueprint, oRank: 0 | 1 | 2): boolean`（rank：2 錨點、1 保證、0 機率；純函式，給測試直接驗優先序）。
- Produces: `buildVillageBp(c: BpCtx): Blueprint`——寬 `vw = 58..73`、置中於槽、`ground` = 外框內地表中位數、`style = hash % 3`；`floors` 含委託板與廣場；`site = { kind: 'village', key: 's' + c.id, rot, info }`（家鄉的 rot = 依離出生點距離排序的名次，最近的 0 → 一定有嚮導；外圍 rot = `hash % 4`）。`buildHallBp(c: BpCtx): Blueprint`——寬 60–77、`floorY ∈ [max(deep + 24) + 13, min(molten − 26))`（外框各欄極值）、隧道每側 20–36 格（固定長度，外框 ≤ 154 = 170 − 16）、礦車地標（`T.ORE_CART`、site `'dwarf_hall'`）、`site = { kind: 'hall', ... }`。
- Produces（`engine/gen2/home.ts`，**本 Task 建立**）：`homeSites(src: Gen2Source): GenSite[]`——家鄉所有聚落錨點的藍圖 `site`（依 x 排序）。`bootGen2`（worldBoot.ts:82-101）拿不到遊戲的 registry，所以放進 `WorldContent.sites: GenSite[]`（新欄位；legacy / flat 給 `[]`），`DelveGame` 建構時逐一 `sites.add`（開局一次）；之後 `world.onGenSites` 交來的同 key 被去重。

- [ ] **Step 1: 寫失敗測試**（20 個種子的錨點建藍圖，逾時 180 s；世界整合用 2 個種子）

```ts
it('跨層優先序（Q10）：錨點 > 保證 > 機率；同級丟較深的；SKY / MINOR 同級讓位；不相交不丟', () => {
  const S = box(BP_SURFACE, 0, 300, 100, 40), U = box(BP_UNDER, 10, 320, 60, 40), K = box(BP_SKY, 0, 250, 40, 20), far = box(BP_DEEP, 500, 320, 40, 40);
  expect(crossYields(U, 0, S, 0)).toBe(true); expect(crossYields(S, 0, U, 0)).toBe(false);
  expect(crossYields(S, 0, U, 2)).toBe(true); expect(crossYields(U, 1, S, 0)).toBe(false);
  expect(crossYields(K, 0, box(BP_SURFACE, 0, 260, 40, 20), 0)).toBe(true); expect(crossYields(U, 0, far, 2)).toBe(false); });
```

```ts
it('§4.4：家鄉 2–4 個村莊、≥ 1 座地廳；村莊在森林、離出生點 > 200、離地城區 > 60、不與其他藍圖重疊', () => { for (const seed of SEEDS20) { const s = sitesOf(seed);
  const v = s.filter((q) => q.kind === 'village'), h = s.filter((q) => q.kind === 'hall');
  expect(v.length).toBeGreaterThanOrEqual(2); expect(v.length).toBeLessThanOrEqual(4); expect(h.length).toBeGreaterThanOrEqual(1);
  for (const q of v) { const c = (q.info.x0 + q.info.x1) >> 1; expect(Math.abs(c - SPAWN_X)).toBeGreaterThan(200); expect(distToDungeonZone(seed, q.info)).toBeGreaterThan(60); }
  expect(overlapPairs(homeBlueprints(seed))).toEqual([]); } }, 180_000);
it('村莊：≥ 2 棟房子（門、床、茅草屋頂、checkRoom 通過）、委託板、2 支旗桿（FLAG_CLOTH 18、FLAG_LAMP 2）、沒有液體；地面覆寫 = 第一個實心格', () => {
  for (const seed of SEEDS2) { const g = new Gen2Source(seed), w = worldOf(g); for (const q of sitesOf(seed).filter((p) => p.kind === 'village')) { const v = q.info;
    loadColumns(w, v.x0 - 12, v.x1 + 12); expect(v.houses.length).toBeGreaterThanOrEqual(2);
    for (const hs of v.houses) expect(checkRoom(w, (hs.x0 + hs.x1) >> 1, hs.floorY - 2)).not.toBeNull();
    expect(w.getFg(v.board.x, v.board.y)).toBe(T.QUEST_BOARD); expect(count(w, v.x0 - 3, v.x1 + 3, T.FLAG_CLOTH)).toBe(18); expect(count(w, v.x0 - 3, v.x1 + 3, T.FLAG_LAMP)).toBe(2);
    expect(liquidCells(w, v.x0 - 10, v.ground - 30, v.x1 + 10, v.ground + 6)).toBe(0);
    for (let x = v.x0; x <= v.x1; x++) expect(g.surfaceAt(x)).toBe(firstSolid(w, x)); } } }, 120_000);
it('地廳：在 deep 與 molten 之間、熔爐 / 礦車 / DWARF_WALL / 兩端軌道', () => { for (const h of hallsOf(SEEDS2)) {
  expect(h.info.floorY).toBeGreaterThan(h.deep); expect(h.info.floorY).toBeLessThan(h.molten); expect(h.w.getFg(h.info.forge.x, h.info.forge.y)).toBe(T.DWARF_FORGE);
  expect(h.w.getFg(h.info.cart.x, h.info.cart.y)).toBe(T.ORE_CART); expect(h.w.getFg(h.info.x0 - 5, h.info.floorY - 1)).toBe(T.RAIL); } }, 120_000);
it('居民住進去：gen2 遊戲開局就有家鄉每座村莊的 elder / trader、地廳三位矮人；白天在村裡、晚上在屋裡；委託板找得到村長', () => {
  const g = new DelveGame({ seed: SEEDS2[0], worldGen: { kind: 'gen2' } }), v = g.sites.list('village');
  expect(v.length).toBeGreaterThanOrEqual(2); for (const s of v) for (const r of ['elder', 'trader']) expect(g.folk.byKey(`${s.key}:${r}`)).not.toBeNull();
  const s0 = v[0], elder = g.folk.byKey(`${s0.key}:elder`)!; g.teleport(s0.info.board.x, s0.info.board.y); for (let k = 0; k < 240; k++) g.step(FIXED_DT);
  const ex = elder.body.x / 16; expect(ex).toBeGreaterThanOrEqual(s0.info.x0 - 2); expect(ex).toBeLessThanOrEqual(s0.info.x1 + 2);
  expect(g.questGiverAt(s0.info.board.x, s0.info.board.y)).toBe(`${s0.key}:elder`); }, 60_000);
```
（`sitesOf(seed)` = `homeSites(new Gen2Source(seed))`；`overlapPairs(bps)` = 所有層之間外框相交、且兩份都不是液體的配對（同層的配對由槽保證不相交，也一併檢查），寫在 `testUtil.ts`——Task 10、11、14、19 加新種類後這條仍必須綠（Q10）；`box(layer, x, y, w, h)` = 只有外框的假藍圖；`homeBlueprints`、`distToDungeonZone`、`count`、`liquidCells`、`hallsOf` 寫在測試檔或 `testUtil.ts`；`T.QUEST_BOARD`、`questGiverAt`（委託板 → 給委託的 NPC key）以 `tiles.ts` / `game.ts:2585` 的實際名稱為準——沒有對應的公開方法就在本 Task 抽出一個；晚上在屋裡的斷言照 `game.folk.test.ts` 既有的「入夜回屋」寫法加一條。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/settlements.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。`FolkWorld.addSite` 的站位：`findStandSpot` 在欄未載入時讀到 STONE 會失敗 → 後備位置用 `VillageInfo.ground − 1` / `HallInfo.floorY − 1`（就是正確的地面，因為 ground 來自藍圖）。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine src/scripts/games/delve/net`；Expected: 全綠。
- [ ] **Step 5: Commit** — `feat(delve): gen2 villages and dwarf halls with residents`（re-record gen2 v0 hash）。

---

### Task 10: gen2 礦坑、密室、空島

**Files:**
- Create: `engine/gen2/structures/mineshaft.ts`、`engine/gen2/structures/skyIsland.ts`、`engine/gen2/underground.test.ts`
- Modify: `engine/gen2/blueprint.ts`（機率表：地下層加礦坑 0.15；天空層空島：家鄉只靠錨點、非家鄉大陸 0.06；登錄 `mineshaft_secret` / `sky_island` 錨點）、`engine/gen2/bpcore.ts`（`BpKind` 加 `'mineshaft'` / `'sky_island'`）
- Test 必須保持綠：`engine/gen2/blueprint.test.ts`（M1 坑道避讓 `:80-93`）、`engine/gen2/objects.test.ts`（槽邊距、坑道避讓帶）、`engine/gen2/anchors.test.ts`（「沒登錄建構器的錨點槽是空的」用 `test_probe`，登錄 `sky_island` 不影響它——Q8）、`engine/gen2/settlements.test.ts`（家鄉藍圖零重疊——Q10）

**Interfaces:**
- Consumes: `drawMineshaft` / `drawRamp` / `drawSecretRoom` / `drawSkyIsland`（Task 6）、`BpCtx.groundAt`（Task 2）。
- Produces: `buildMineshaftBp(c: BpCtx, o?: { secret?: boolean }): Blueprint`——`yTop = 槽中心地表 + 28..129`、斜坡 1/2（深度 < 100 時；斜坡在外框內）、`secret` 為 true 或 25% 機率接一間密室；地標 `T.ORE_CART`（site `'mineshaft'`，鋪軌道）；密室的地區用 part 1（Task 15）。**總寬上限（Q3）**：`len + 斜坡寬（yTop − 地表 + 6，有斜坡時）+ 密室寬（rw + 4，有密室時）≤ slotWidth(UNDER) − 16 = 154`——先擲斜坡與密室，`len = min(擲出的 50–100, 154 − 斜坡寬 − 密室寬)`；`len < 50` 時拿掉斜坡（密室保留：密室寬 ≤ 17，沒有斜坡時 len 上限 ≥ 137，一定放得下）；外框也受 Task 2 的坑道避讓帶約束。`buildSkyIslandBp(c: BpCtx): Blueprint`——寬 30–48、`top = 外框附近最高的 profile 地表 − 30 − thick − (10..49)`（**相對 Profile2 地表，不看小點位 / 其他天空藍圖**——Q4）、`groundBelow = (x) => c.groundAt(x)`（profile + SURFACE 層地面覆寫）、地標 `T.GUARDIAN_STATUE`（site `'sky_island'`）。

- [ ] **Step 1: 寫失敗測試**（5 個種子，逾時 120 s）

```ts
it('§4.4：家鄉 ≥ 3 間密室（裂紋石塞、secret 箱、洪水填充不出密室、不發光）、≥ 4 條礦坑、≥ 2 座空島', () => { for (const seed of SEEDS5) { const bp = homeBlueprints(seed);
  const shafts = bp.filter((b) => b.kind === 'mineshaft'), secrets = shafts.flatMap((b) => b.chests.filter((c) => c.kind === 'secret'));
  expect(secrets.length).toBeGreaterThanOrEqual(3); expect(shafts.length).toBeGreaterThanOrEqual(4); expect(bp.filter((b) => b.kind === 'sky_island').length).toBeGreaterThanOrEqual(2);
  const w = worldOf(srcOf(seed)); for (const c of secrets) { loadColumns(w, c.x - 20, c.x + 20); expect(secretRoomSealed(w, c)).toBe(true); } } }, 120_000);
it('空島：箱子 sky、底部在地表上方 > 20、繩梯下端離地 ≤ 3', () => { for (const seed of SEEDS5) for (const b of homeBlueprints(seed).filter((q) => q.kind === 'sky_island')) {
  const src = srcOf(seed), rope = ropeOf(b)!; expect(b.chests[0].kind).toBe('sky'); expect(b.y + b.h).toBeLessThan(src.surfaceAt(b.x) - 20);
  expect(src.surfaceAt(rope.x) - rope.y1).toBeLessThanOrEqual(4); } }, 120_000);
it('分段填 = 整欄填（礦坑、空島各一份跨欄的）', () => { for (const k of ['mineshaft', 'sky_island']) { const { src, b } = firstCrossing(k), cx = b.x >> 5;
  const parts = new Column(cx, 1200); src.fill(parts, cx * 32, b.x + 1); src.fill(parts, b.x + 1, cx * 32 + 32); expect(bytes(parts)).toEqual(bytes(fillCol(src, cx))); } }, 60_000);
it('礦坑總寬 ≤ 154（長 + 斜坡 + 密室，Q3）、50 個種子的 secret 錨點都建得出來', () => { for (const seed of SEEDS50) for (const b of homeBlueprints(seed).filter((q) => q.kind === 'mineshaft')) {
  expect(b.w, `${seed} ${b.x}`).toBeLessThanOrEqual(154); const s = slotOf(b.id, srcOf(seed).layout); expect(b.x).toBeGreaterThanOrEqual(s.x0 + 8); expect(b.x + b.w).toBeLessThanOrEqual(s.x1 - 8); } }, 300_000);
```
（`SEEDS50` / `homeBlueprints` 共用 `testUtil.ts`；`secretRoomSealed(w, chest)` = 從箱子格做 4 鄰空氣洪水填充，碰到的格都在密室外框內、且外框邊有裂紋石；`ropeOf(b)` = 藍圖裡 T.ROPE 格的 x 與最低 y；`firstCrossing(kind)` = 依序找種子中第一份跨欄的該種藍圖。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/underground.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: PASS。
- [ ] **Step 5: Commit** — `feat(delve): gen2 mineshafts, secret rooms and sky islands`（re-record gen2 v0 hash）。

---

### Task 11: gen2 小生態（蘑菇林 / 水晶洞）與蜂巢

**Files:**
- Create: `engine/gen2/structures/miniBiome.ts`、`engine/gen2/structures/hive.ts`、`engine/gen2/minibiome.test.ts`
- Modify: `engine/gen2/blueprint.ts`（機率表：地下層蘑菇林 0.05（只在森林 / 叢林）、蜂巢 0.1（只在叢林）；深層水晶洞 0.08；登錄三種錨點）、`engine/gen2/bpcore.ts`（`BpKind` 加三種）、`engine/gen2/testUtil.ts`（收 `snapshotLiquid`；`liquidInvariant` 認得蜂蜜）、`engine/gen2/lakes.test.ts`（改 import `snapshotLiquid`）
- Test 必須保持綠：`engine/gen2/lakes.test.ts`、`engine/gen2/settlements.test.ts`（家鄉零重疊，Q10）、`engine/gen2/objects.test.ts`（坑道避讓帶，Q3）

**Interfaces:**
- Produces: `buildMushroomBp(c: BpCtx): Blueprint`——橢圓 rx 40–70、ry 22–34，中心 y ∈ [rock + ry + 10, rock + 0.4 × (deep − rock) + ry]；外框內挖出洞腔（雜湊邊緣）、殼改泥巴 + 泥巴牆、露出的地板 = `T.MUSHROOM_GRASS`、地板上 38% `T.GLOW_MUSHROOM`、天花板 10% 藤；地標 `T.SPORE_TOTEM`（site `'mushroom_biome'`）。`buildCrystalBp(c: BpCtx): Blueprint`——rx 40–60、ry 24–34、中心 y ∈ [deep, molten − ry − 12]；殼改大理石 + 冰牆、地板 28% / 天花板 22% `T.CRYSTAL`；地標 `T.GEODE`。`buildHiveBp(c: BpCtx): Blueprint`——rx 10–15、ry 7–10、中心 y ∈ [rock + ry + 4, deep + 20]、2.5 格厚 `T.HIVE` 殼 + 蜂巢牆、`cy + 0.15 × ry` 以下滿蜂蜜（`LIQ.HONEY`，靜止平面）、3 個垂掛蜂巢；地標 `T.HONEY_JAR`。三種都不用 `Math.sqrt`（橢圓用整數比較 `dx² ry² + dy² rx² ≤ rx² ry²`）。

- [ ] **Step 1: 寫失敗測試**（5 個種子，逾時 120 s）

```ts
it('§4.4：家鄉 ≥ 1 蘑菇林（蘑菇草 > 150、發光蘑菇 > 40）、≥ 1 水晶洞（水晶 > 30、大理石 > 200）、叢林 ≥ 1 蜂巢（蜂蜜 > 20）', () => { for (const seed of SEEDS5) { const w = worldOf(srcOf(seed));
  const m = homeBlueprints(seed).filter((b) => b.kind === 'mushroom_biome'), c = homeBlueprints(seed).filter((b) => b.kind === 'crystal_cave'), h = homeBlueprints(seed).filter((b) => b.kind === 'hive');
  expect(m.length).toBeGreaterThanOrEqual(1); expect(c.length).toBeGreaterThanOrEqual(1); expect(h.length).toBeGreaterThanOrEqual(1);
  loadBox(w, m[0]); expect(countIn(w, m[0], T.MUSHROOM_GRASS)).toBeGreaterThan(150); expect(countIn(w, m[0], T.GLOW_MUSHROOM)).toBeGreaterThan(40);
  loadBox(w, c[0]); expect(countIn(w, c[0], T.CRYSTAL)).toBeGreaterThan(30); expect(countIn(w, c[0], T.MARBLE)).toBeGreaterThan(200);
  loadBox(w, h[0]); expect(liquidIn(w, h[0], LIQ.HONEY)).toBeGreaterThan(20); expect(srcOf(seed).biomeAt(h[0].x)).toBe(BIOME.JUNGLE); } }, 120_000);
it('蜂蜜是靜止的：liquidInvariant 沒有違規、喚醒 300 步不變', () => { const { src, b } = firstOf('hive'), w = worldOf(src), sim = new LiquidSim(w); loadBox(w, b);
  expect(liquidInvariant(w, b.x - 2, b.x + b.w + 2)).toEqual([]); const before = snapshotLiquid(w, b); sim.wakeRect(b.x, b.y, b.x + b.w, b.y + b.h);
  for (let k = 0; k < 300; k++) sim.step(); expect(snapshotLiquid(w, b)).toEqual(before); }, 60_000);
```
（`loadBox` / `countIn` / `liquidIn` / `firstOf` 寫在 `testUtil.ts`；`snapshotLiquid` 從 M1 的 `lakes.test.ts` 搬到 `testUtil.ts` 共用；`liquidInvariant` 要認得蜂蜜（M1 只看水 / 熔岩時一併擴充）。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/minibiome.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: PASS。
- [ ] **Step 5: Commit** — `feat(delve): gen2 mushroom groves, crystal caves and hives`（re-record gen2 v0 hash）。

---

### Task 12: 填格新特徵：花崗岩 / 大理石、熔岩帶、地表與地下裝飾

**Files:**
- Modify: `engine/gen2/fill.ts`（`column()` 加三個 pass；全部只看本欄、由上往下一次掃完）、`engine/genPrims.ts`（只新增：`blobNoise(s: number): ColNoise`（2D 團塊噪聲取樣，**不改既有函式**——v1 的 `V1_FILL_HASH` 必須仍綠））
- Test: `engine/gen2/features.test.ts`（新）

**Interfaces:**
- 規則（ctx.ver 0；數值照舊生成器 `worldgen.ts:826-838, 731-756, 1027-1101, 1439-1551`，改成逐欄局部判斷）：
  - 花崗岩：`y ∈ [deep + 20, molten − 25)` 且 `blobNoise(g2-granite) > 0.72` → 石 / 深層岩換 `T.GRANITE`；大理石：`y ∈ [rock + 30, deep + 80)` 且 `blobNoise(g2-marble) > 0.74` → 換 `T.MARBLE`（礦之前判、礦不換花崗岩 / 大理石）。
  - 熔岩帶（`y ∈ [molten, LAVA_Y)`）：額外的開闊帶 `blobNoise(g2-molten) > 0.55` 挖空（不留牆）；挖空格正下方的玄武岩表面往下 2–4 格換 `T.ASH`；`blobNoise(g2-obsidian) > 0.8` 的玄武岩換 `T.OBSIDIAN`、`> 0.86` 的換 `T.MAGMA_ROCK`。`LAVA_Y` 以下照 M1 全是熔岩。
  - 地表裝飾（陸地欄、草 / 沙 / 雪 / 叢林草上方那格是空氣、不在表層藍圖外框內、不在水下）：機率照舊（草：高草 24%、花 8%、蘑菇 2%、小石 1.5%、灌木 3.5%、南瓜 0.7%；沙漠沙：枯木叢 12%、小石 2%；雪：雪灌木 7%、小石 1.5%；叢林草：蕨 24%、高草 10%、花 4%、蘑菇 1%、灌木 5%），擲 `hash2(x, 0, g2-decor)`。
  - 地下裝飾（`y > surface + 1` 的空氣格、不在任何藍圖外框內）：地板（下方實心）——深於 `surface + 12` 陶罐 1.2%、石上石筍 4%、`y ≥ deep` 發光蘑菇 1.2%、泥巴 / 叢林草上蕨 12%；天花板（上方實心）——石下鐘乳石 4.5%、叢林泥巴下藤 24%（長 2–7，只往下長到本欄空氣用完為止）；牆邊蛛網 2%。擲 `hash2(x, y, g2-ugdecor)`。

- [ ] **Step 1: 寫失敗測試**（3 個種子、家鄉 [0, 4200)，逐欄 `fillCol`；檔案內共用欄資料：`beforeAll(() => { HOME3 = … }, 180_000)`（hook 預設 10 s，Q18）；之後每個 `it` 只讀統計，各給 `30_000`）

```ts
it('§4.4 花崗岩 / 大理石：各 > 300 格；花崗岩在深層的比在岩層的多', () => { for (const s of HOME3) {
  expect(s.count(T.GRANITE)).toBeGreaterThan(300); expect(s.count(T.MARBLE)).toBeGreaterThan(300); expect(s.countBand(T.GRANITE, 'deep')).toBeGreaterThan(s.countBand(T.GRANITE, 'rock')); } }, 30_000);
it('§4.4 熔岩帶：molten..LAVA_Y 的空氣 > 15%、灰燼 > 500、黑曜石 > 300、熔岩岩 > 200、熔岩 > 1500', () => { for (const s of HOME3) {
  expect(s.airShare('molten')).toBeGreaterThan(0.15); expect(s.count(T.ASH)).toBeGreaterThan(500); expect(s.count(T.OBSIDIAN)).toBeGreaterThan(300);
  expect(s.count(T.MAGMA_ROCK)).toBeGreaterThan(200); expect(s.lavaCells()).toBeGreaterThan(1500); } }, 30_000);
it('裝飾：每種 > 30 格（南瓜 > 5），每一格的支撐都合法（地板類下方實心、天花板類上方實心、藤往上接藤或實心）', () => { for (const s of HOME3) {
  for (const t of [T.FLOWER, T.TALL_GRASS, T.MUSHROOM, T.SMALL_ROCK, T.BUSH, T.DEAD_BUSH, T.SNOW_SHRUB, T.FERN, T.VINE, T.GLOW_MUSHROOM, T.STALACTITE, T.STALAGMITE, T.COBWEB, T.POT]) expect(s.count(t), String(t)).toBeGreaterThan(30);
  expect(s.count(T.PUMPKIN)).toBeGreaterThan(5); expect(s.badSupport()).toEqual([]); } }, 30_000);
it('分段填 = 整欄填（裝飾 / 熔岩帶在欄內、與分段無關）', () => { const src = new Gen2Source('feat'); for (const cx of [20, 66, 110]) {
  const parts = new Column(cx, 1200); src.fill(parts, cx * 32, cx * 32 + 7); src.fill(parts, cx * 32 + 7, cx * 32 + 32); expect(bytes(parts)).toEqual(bytes(fillCol(src, cx))); } }, 30_000);
```
（`HOME3` = 3 個種子各自 `fillCol` 0..131 欄的統計物件（`count`、`countBand(tile, 'dirt' | 'rock' | 'deep' | 'molten')`、`airShare`、`lavaCells`、`badSupport`），寫在測試檔內；tile 名稱以 `tiles.ts` 為準。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/features.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2 src/scripts/games/delve/engine/legacy/chunkgen`；Expected: PASS（`V1_FILL_HASH` / `V1_SEA_HASH` 不變）。
- [ ] **Step 5: Commit** — `feat(delve): gen2 granite and marble, molten band, surface and cave decorations`（re-record gen2 v0 hash）。

---

### Task 13: 礦物密度對齊舊生成器、燈籠守望者召喚材料

**Files:**
- Create: `engine/legacy/oreBaseline.measure.test.ts`、`engine/gen2/oreBaseline.ts`、`engine/gen2/ores.test.ts`
- Modify: `engine/gen2/fill.ts`（gen2 自己的礦門檻表，依深度帶分開；不動 `genPrims.ORE_THR`——那是 v1 的）

**Interfaces:**
- 深度帶（相對該欄層線）：`dirt = [surface, rock)`、`rock = [rock, deep)`、`deep = [deep, molten)`、`molten = [molten, H)`。密度 = 該帶內礦格數 ÷ 該帶總格數（千分比），x ∈ [100, 4100)、3 個種子平均。
- Produces（`oreBaseline.ts`）：`export const LEGACY_ORE_DENSITY: Readonly<Record<'copper' | 'iron' | 'silver' | 'gold', Readonly<Record<'dirt' | 'rock' | 'deep' | 'molten', number>>>>`（量測值貼上，檔頭寫量測 commit 與種子 `alpha` / `beta` / `gamma`）。
- `oreBaseline.measure.test.ts`：`it.runIf(process.env.DELVE_MEASURE === '1')`，用 `generateWorld` 量三個種子、先 `console.info(JSON.stringify(...))` 再斷言（Q17：不准只印不驗），逾時 `300_000`；M2b 刪 legacy 時它跟著刪，常數留著。
  ```ts
  it.runIf(process.env.DELVE_MEASURE === '1')('舊生成器礦物密度 = LEGACY_ORE_DENSITY（±30%）', () => {
    const m = measureLegacy(['alpha', 'beta', 'gamma']); console.info('[ore baseline]', JSON.stringify(m));
    for (const ore of ORES4) { expect(Math.max(...BANDS4.map((b) => m[ore][b])), ore).toBeGreaterThan(0);
      for (const band of BANDS4) { const rec = LEGACY_ORE_DENSITY[ore][band], now = m[ore][band]; expect(Number.isFinite(now)).toBe(true);
        if (rec >= 0.2) { expect(now, `${ore}/${band}`).toBeGreaterThanOrEqual(rec * 0.7); expect(now, `${ore}/${band}`).toBeLessThanOrEqual(rec * 1.3); }
        else expect(now, `${ore}/${band}`).toBeLessThan(0.5); } } }, 300_000);
  ```
  （第一次跑時常數還是佔位值 → 測試紅、但先印出量測值；貼進 `oreBaseline.ts` 後重跑必須綠——證明貼上的數字就是量到的。）

- [ ] **Step 1: 量舊生成器** — Run: `DELVE_MEASURE=1 npx vitest run src/scripts/games/delve/engine/legacy/oreBaseline.measure.test.ts`；把 `[ore baseline]` 輸出貼進 `oreBaseline.ts` 與本計畫「基準紀錄」，重跑一次 Expected: PASS。
- [ ] **Step 2: 寫失敗測試**

```ts
it('§4.4：每種礦在舊生成器密度 ≥ 0.2‰ 的帶裡，gen2 密度落在 ±30%；舊的 < 0.2‰ 的帶 gen2 也 < 0.5‰', () => {
  const g2 = densityOf(['alpha', 'beta', 'gamma']);                       // 同一個量法、gen2 家鄉逐欄 fillCol
  for (const ore of ORES4) for (const band of BANDS4) { const old = LEGACY_ORE_DENSITY[ore][band], now = g2[ore][band];
    if (old >= 0.2) { expect(now, `${ore}/${band}`).toBeGreaterThanOrEqual(old * 0.7); expect(now, `${ore}/${band}`).toBeLessThanOrEqual(old * 1.3); }
    else expect(now, `${ore}/${band}`).toBeLessThan(0.5); } }, 180_000);
it('礦成團：每種礦 > 1500 格、與同種相鄰的比例 > 0.6', () => { for (const ore of ORES4) { expect(g2Count(ore)).toBeGreaterThan(1500); expect(clustered(ore)).toBeGreaterThan(0.6); } }, 180_000);
it('§4.4 燈籠守望者召喚材料：配方 = 發光蘑菇 6 + 凝膠 5 + 金錠 3；家鄉有發光蘑菇 > 40、金礦 > 300；森林地表白天的生怪表有掉凝膠的怪', () => {
  expect(recipeOf('wick_offering').inputs).toEqual([['glow_mushroom', 6], ['gel', 5], ['gold_bar', 3]]);
  expect(homeCount(T.GLOW_MUSHROOM)).toBeGreaterThan(40); expect(homeCount(T.GOLD_ORE)).toBeGreaterThan(300);
  const kinds = spawnTable(hab({ zone: 'surface', biome: BIOME.FOREST, night: false })).map((e) => e.kind);
  expect(kinds.some((k) => ENEMIES[k].drops.some((d) => d.item === 'gel'))).toBe(true); expect(recipeOf('gold_bar').inputs).toEqual([['gold_ore', 4]]); }, 180_000);
```
（`densityOf` / `g2Count` / `clustered` / `homeCount` / `recipeOf` / `hab` / `measureLegacy` 寫在測試檔內（`measureLegacy` 在 legacy 的 measure 檔，gen2 測試不 import legacy）；三個 `it` 共用的 gen2 家鄉欄資料放 `beforeAll(…, 180_000)`；`ENEMIES[k].drops` 與配方的確切形狀以 `enemies.ts` / `crafting.ts:53,92` 為準。）

- [ ] **Step 3: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/ores.test.ts`；Expected: FAIL（M1 的礦門檻是被測試窗口調出來的，密度不對）。
- [ ] **Step 4: 實作** — gen2 礦門檻改成每種礦 × 每個帶一個值（`G2_ORE_THR[ore][band]`），調到 Step 2 通過；只換石頭類（P10 照舊）。
- [ ] **Step 5: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: PASS。
- [ ] **Step 6: Commit** — `feat(delve): gen2 ore densities matched to the old generator per depth band`（re-record gen2 v0 hash；commit 說明貼量測值）。

---

### Task 14: 石碑、遺物、地標的家鄉指派與 bootGen2 的家鄉內容

**Files:**
- Create: `engine/gen2/lore.ts`、`engine/gen2/structures/shrine.ts`、`engine/gen2/lore.test.ts`
- Modify: `engine/gen2/home.ts`（Task 9 建立；本 Task 加 `homeContent`——Q11）、`engine/gen2/blueprint.ts`（`homePlans()`：家鄉藍圖開局一次建完 + 「裝飾」步，存進 Task 8 的 `pinned`）、`engine/gen2/structures/{cabin,ruin,lakes}.ts`（M1 建構器補地標）、`engine/gen2/bpcore.ts`（`BpKind` 加 alcove / molten_shrine / shaft_cache / spawn_tablet）、`engine/worldBoot.ts:84-104`（`bootGen2` 先 `homePlans()` 再填 `HomeContent`）、`engine/game.ts:886-902, 1057`（gen2 世界：`tabletAt` / `landmarkAt` / Discovery 的 `loreTotal: 14`、`landmarks`、`open: true`）
- Test 必須保持綠：`engine/gen2/structures.import.test.ts`、`engine/gen2/structures.test.ts`、`engine/gen2/blueprint.test.ts`（出生點 ± 80——`spawn_tablet` 已移到 ± 80 外，Q16）、`engine/gen2/settlements.test.ts`（零重疊）、`engine/gen2/dungeon.test.ts`

**Interfaces:**
- Produces（`shrine.ts`，錨點建構器）：`buildAlcoveBp(c: BpCtx, tag: 'snow' | 'desert'): Blueprint`（y ∈ [rock, deep) 的 9×5 石室，地板 + 陶罐）；`buildMoltenShrineBp(c: BpCtx): Blueprint`（y ∈ [molten + 8, LAVA_Y − 12) 的玄武岩小室、黑曜石台、箱子 `'relic'`）；`buildShaftCacheBp(c: BpCtx): Blueprint`（該地區主坑道底端圓室的地板：3 格石地板 + 箱子 `'relic'`；座標由 `caves.shaftOf` 算）；`buildSpawnTabletBp(c: BpCtx): Blueprint`（錨點槽（出生點東側第一個與 ± 80 不相交的 MINOR 槽，Task 7 / Q16）內、離出生點最近的第一個平地欄的地表石碑 + 清掉草；站在 `c.groundAt`）。
- Produces（`lore.ts`）：
  ```ts
  export interface HomeDecor { tablets: Map<number /* sid */, BpTablet[]>; extras: Map<number /* sid */, Map<string /* "x,y" */, ItemId[]>> }
  export function homeDecor(raw: readonly Blueprint[], spawnX: number): HomeDecor;
  ```
  指派（LORE_SITES 的 id）：0 spawn → `spawn_tablet`；1 secret → 離出生點最近的密室；2 cabin → 最近的小屋；3 crystal / 4 mushroom / 5 sky / 9 mineshaft / 13 ruin → 該種離出生點最近的一份；6 / 7 / 12 → 地城（Task 8 已放）；8 molten → `molten_shrine`；10 / 11 → `alcove_snow` / `alcove_desert`。石碑放在該藍圖 `floors` 中第一個不與箱子 / 地標相鄰的格。遺物（`extra`）：jump_boots → 最近空島的箱子；swift_boots → `shaft_cache`（「最深的裂谷」精神 = 最深的主坑道底）；night_amulet → `molten_shrine`；magnet → 最近密室的箱子；compass / depth_meter → 最近兩間小屋的箱子。
- Produces（`home.ts`）：
  ```ts
  export interface HomeContent { villages: VillageInfo[]; halls: HallInfo[]; dungeon: DungeonInfo | null; tablets: { x: number; y: number; id: number }[];
    relics: GenRelic[]; landmarks: LandmarkInfo[]; structures: Structure[]; sites: GenSite[] }
  export function homeContent(src: Gen2Source): HomeContent;   // 讀 homePlans() 的結果，不生成任何格子；結果快取在 src 上
  ```
  `bootGen2` 把它放進 `WorldContent`（`structures` 給 `render/underground.ts` 的地下背景：`mushroom_biome` / `dungeon`；`sites` 照 Task 9；`regions` 仍是 `[]`，地區走 Task 15）。
- Produces（`blueprint.ts`，Q9）：`BlueprintIndex.homePlans(): readonly Blueprint[]`——家鄉地塊所有層、所有槽的原始藍圖一次建完 → `homeDecor` → 最終藍圖，全部寫進 `pinned`（永不淘汰，與外圍的 LRU 256 分開）；只建一次（第二次呼叫直接回快取）。`bootGen2` 開局呼叫它（客人加入也一樣，只算藍圖不生成格子）；之後碰到家鄉欄只是讀 `pinned`，所以「第一次碰到某欄」的 fill 預算不含建家鄉藍圖。開局的家鄉藍圖建構另有預算：**目標 ≤ 300 ms**（Task 21 量測、報告；本 Task 的測試先釘 `homePlans` 只建一次）。家鄉以外的地塊沒有裝飾步，照舊逐份建、走 LRU。

- [ ] **Step 1: 寫失敗測試**（5 個種子，逾時 180 s）

```ts
it('§4.4：14 塊石碑 id 0..13 各恰一次、都在家鄉、站在地板上（載入後 上方空氣 / 下方實心）', () => { for (const seed of SEEDS5) { const hc = homeOf(seed), w = worldOf(srcOf(seed));
  expect(hc.tablets.map((t) => t.id).sort((a, b) => a - b)).toEqual([...Array(14).keys()]);
  for (const t of hc.tablets) { expect(t.x).toBeGreaterThanOrEqual(0); expect(t.x).toBeLessThan(4200); loadColumns(w, t.x, t.x + 1);
    expect(w.getFg(t.x, t.y)).toBe(T.LORE_TABLET); expect(w.genTablets.get(w.idx(t.x, t.y))).toBe(t.id); expect(isSolidTile(w.getFg(t.x, t.y + 1))).toBe(true); } } }, 180_000);
it('§4.4：4 件遺物 + 指南針 / 深度計各恰一次、在對的地方、箱子裡真的有', () => { for (const seed of SEEDS5) { const hc = homeOf(seed), w = worldOf(srcOf(seed));
  expect(hc.relics.map((r) => [r.item, r.where]).sort()).toEqual([['jump_boots', 'sky_island'], ['magnet', 'secret_room'], ['night_amulet', 'molten'], ['swift_boots', 'shaft']]);
  for (const r of hc.relics) { loadColumns(w, r.x, r.x + 1); expect(w.chests.get(w.idx(r.x, r.y))!.some((s) => s?.item === r.item)).toBe(true); }
  const m = hc.relics.find((r) => r.item === 'night_amulet')!; expect(m.y).toBeGreaterThanOrEqual(srcOf(seed).layersAt(m.x).molten);
  for (const it of ['compass', 'depth_meter'] as const) expect(chestItemCount(w, hc, it)).toBe(1); } }, 180_000);
it('§4.4：地標放置率 ≥ 85%（有地標種類的家鄉藍圖中真的放了地標的比例），且含 RELIC_PACK / ORE_CART / GUARDIAN_STATUE / GEODE / SPORE_TOTEM / HONEY_JAR / CAIRN', () => {
  for (const seed of SEEDS5) { const bp = homeBlueprints(seed), elig = bp.filter((b) => LANDMARK_KINDS.has(b.kind));
    expect(elig.filter((b) => b.landmarks.length > 0).length / elig.length).toBeGreaterThanOrEqual(0.85); }
  expect(new Set(SEEDS5.flatMap((s) => homeOf(s).landmarks.map((l) => l.tile)))).toEqual(new Set([T.RELIC_PACK, T.ORE_CART, T.GUARDIAN_STATUE, T.GEODE, T.SPORE_TOTEM, T.HONEY_JAR, T.CAIRN])); }, 180_000);
it('gen2 遊戲：日誌古碑 0 / 14、地標總數 = 家鄉地標數；開局 < 1500 ms', () => { const t0 = performance.now(), g = new DelveGame({ seed: 'home-c', worldGen: { kind: 'gen2' } });
  expect(performance.now() - t0).toBeLessThan(1500); const st = g.discovery.stats();
  expect(st.lore).toEqual({ found: 0, total: 14 }); expect(st.landmarks.total).toBe(homeOf('home-c').landmarks.length); }, 60_000);
it('homePlans 只建一次、之後碰家鄉欄不重建（Q9）', () => { const src = new Gen2Source('home-pin'), a = src.blueprints.homePlans();
  expect(src.blueprints.homePlans()).toBe(a); touchOuterBlueprints(src, 300);
  const d = a.find((b) => b.kind === 'dungeon')!; expect(src.blueprints.overlapping(d.x, d.x + 1).find((b) => b.kind === 'dungeon')).toBe(d); }, 60_000);
// 遊戲讀生成物件（從 Task 2 移來：要真的 gen2 世界才有登錄，Q5；只用公開 API——interact + drainEvents，不呼叫 private claimLandmark）
it('gen2 遊戲：古碑互動回藍圖的碑文 id；地標第一次 first: true、第二次 first: false；讀檔後仍是已領', () => {
  const g = new DelveGame({ seed: 'home-c', worldGen: { kind: 'gen2' } }), hc = homeOf('home-c');
  const t = hc.tablets.find((q) => q.id === 0)!; g.teleport(t.x + 1, t.y); g.step(FIXED_DT); g.drainEvents();
  expect(g.interact(t.x, t.y)).toBe(true); expect(g.drainEvents().find((e) => e.type === 'lore')).toMatchObject({ type: 'lore', id: 0, first: true });
  const l = hc.landmarks[0]; g.teleport(l.x + 1, l.y); g.step(FIXED_DT); g.drainEvents();
  expect(g.interact(l.x, l.y)).toBe(true); expect(g.drainEvents().find((e) => e.type === 'landmark')).toMatchObject({ type: 'landmark', first: true });
  g.interact(l.x, l.y); expect(g.drainEvents().find((e) => e.type === 'landmark')).toMatchObject({ first: false });
  const d2 = new Discovery([], { open: true }); d2.load(g.discovery.toJSON()); expect(d2.landmarks.has(g.world.idx(l.x, l.y))).toBe(true); }, 60_000);
```
（`LANDMARK_KINDS` = 有地標的 gen2 種類（cabin、mineshaft、ruin、sky_island、crystal_cave、mushroom_biome、hive、cave_lake、lake、hall），`lake` 的地標是岸邊 `T.CAIRN`、`cave_lake` 是 `T.RELIC_PACK`——M1 的小屋 / 遺跡 / 湖 / 地下湖建構器在本 Task 補上地標（Task 9–11 的建構器各自已放）；`chestItemCount` 寫在測試檔內。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/lore.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** — `homePlans()`：先建全部原始藍圖 → `homeDecor` → 最終藍圖 = 原始 + 石碑格 + 箱子 extra（裝飾只依賴原始藍圖，沒有循環），寫進 `pinned`（Q9）。M1 的 cabin / ruin / lake / cave_lake 建構器補地標（站位取自己的 `floors`）。`game.ts` 的 Task 2 改動（`tabletId` 查 `world.genTablets`、領地標的 info 查 `world.genLandmarks`、World 登錄地標時 `discovery.knowLandmark`）由上面的遊戲測試承接。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine`；Expected: 全綠。
- [ ] **Step 5: Commit** — `feat(delve): gen2 home lore tablets, relics and landmarks; boot fills home content`（re-record gen2 v0 hash）。

---

### Task 15: gen2 地區：所有結構種類、已知地區表、id 反查

**Files:**
- Modify: `engine/discovery.ts:315-400`（`gen2Regions` 涵蓋全部 gen2 種類 + 地城房間；`Discovery` 的已知地區表）、`engine/worldBoot.ts`（家鄉地區開局交給 `Discovery.know`）、`engine/game.ts:897-898, 1057-1058`
- Test: `engine/discovery.test.ts`

**Interfaces:**
- 種類對應（gen2 藍圖 → 地區 kind / cat；名字取 `NAMES[kind]`，新種類在 `NAMES` 加名單）：cabin / ruin / shipwreck / mineshaft / sky_island / lake（→ `'pond'`）→ `site`；village / hall（→ `'dwarf_hall'`）→ `site`；mushroom_biome / crystal_cave / hive / cave_lake（→ `'underground_lake'`）→ `cave`；mineshaft 的密室（part 1）→ `secret`（kind `'secret_room'`）；dungeon（part 0 = 整座、part 1.. = 有名字的房間，`ROOM_NAMES`）→ `dungeon` 類別同舊；keep（Task 18）→ `dungeon`、hermit_hut（Task 18，荒野大陸的隱士小屋 → kind `'hermit'`）→ `site`、lighthouse / hermit / wreck 島 / reef / sea_ruin（Task 20）→ `site`。地區形狀：結構 = 外框矩形；蘑菇林 / 水晶洞 / 蜂巢 = 橢圓。id = `gen2SiteRegionId(sid, part)`。
- Produces（`discovery.ts`）：
  ```ts
  // Discovery 新增
  know(regions: readonly Region[]): void;          // 加進已知表（同 id 不重複）
  region(id: number): Region | null;               // 中央 regions[id] → 已知表 → resolver
  listKnown(): Region[];                           // 中央 ∪ 已知表，依 id 排序
  setResolver(fn: ((id: number) => Region | null) | null): void;
  export function gen2RegionById(seed: string, src: Gen2Source): (id: number) => Region | null;   // 地塊地區 id 與結構地區 id 都能反查；不存在 → null
  // DiscoveryOpts 新增（Q12）：trackOuter?: boolean   /* gen2 世界傳 true：visit 到的外圍地區自動 know()；舊世界不傳 */
  // toJSON() 新增 known?: number[]（trackOuter 時：外圍自動加入的地區 id）；load() 對每個 id 經 resolver 反查後 know()，所以讀檔後 listKnown / 總數相同
  ```
  `stats()` 的各類別總數 = `listKnown()` 裡該類別的數目（家鄉開局全知 → 家鄉內是精確總數）。**只有 gen2 世界（`trackOuter: true`）會把 visit 到的外圍地區自動加進已知表、並存進存檔**（Q12）；舊世界的 v1 外圍地區照 discovery.ts:6-7 不進總數，舊世界的日誌總數與讀檔前後都與現在相同。gen2 世界：開局 `know(homeRegions)`（`homeContent` 的藍圖 + 家鄉地塊地區）、`setResolver(gen2RegionById(...))`、`trackOuter: true`。

- [ ] **Step 1: 寫失敗測試**

```ts
const src = new Gen2Source('rg2'), q = gen2Regions('rg2', src), byId = gen2RegionById('rg2', src);
it('所有 gen2 種類都有地區、id 唯一、可反查回同名同範圍', () => { const kinds = new Set<string>(), seen = new Map<number, string>();
  for (let x = -20_000; x < 20_000; x += 7) for (const y of [300, 420, 700, 900]) for (const r of q(x, y)) { kinds.add(r.kind);
    if (seen.has(r.id)) expect(seen.get(r.id)).toBe(r.name); else seen.set(r.id, r.name);
    expect(byId(r.id)).toMatchObject({ id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h }); }
  for (const k of ['cabin', 'ruin', 'mineshaft', 'secret_room', 'sky_island', 'village', 'dwarf_hall', 'dungeon', 'mushroom_biome', 'crystal_cave', 'underground_lake']) expect(kinds, k).toContain(k); }, 120_000);
it('Discovery（gen2，trackOuter）：visit 之後 listKnown 有它；讀檔後 listKnown 與各類別總數完全相同', () => {
  const d = new Discovery([], { open: true, trackOuter: true }); d.setOuter(q); d.setResolver(byId); const r = q(SPAWN_X, 300).at(-1)!; d.visit(SPAWN_X, 300);
  expect(d.listKnown().map((k) => k.id)).toContain(r.id); const j = d.toJSON(), d2 = new Discovery([], { open: true, trackOuter: true }); d2.setResolver(byId); d2.load(j);
  expect(d2.region(r.id)!.name).toBe(r.name); expect(d2.listKnown().map((k) => k.id)).toEqual(d.listKnown().map((k) => k.id)); expect(d2.stats()).toEqual(d.stats()); });
it('舊世界（沒有 trackOuter）：visit v1 外圍地區不改 listKnown 與日誌總數，讀檔前後相同（Q12）', () => {
  const regs = buildRegions(source()), f = outerRegions('od', profile), d = new Discovery(regs); d.setOuter(f); const before = d.stats();
  const [ox, oy] = OUTER_PT; expect(f(ox, oy).length).toBeGreaterThan(0); d.visit(ox, oy);
  expect(d.listKnown()).toHaveLength(regs.length); expect(totals(d.stats())).toEqual(totals(before));
  const d2 = new Discovery(regs); d2.setOuter(f); d2.load(d.toJSON()); expect(totals(d2.stats())).toEqual(totals(before)); });
it('gen2 遊戲開局：家鄉每座村莊 / 地廳 / 地城都在 listKnown，日誌 site 類別總數 ≥ 村莊數 + 地廳數', () => { const g = new DelveGame({ seed: 'rg2', worldGen: { kind: 'gen2' } });
  const k = g.discovery.listKnown(); expect(k.filter((r) => r.kind === 'village').length).toBe(g.sites.list('village').length);
  expect(k.filter((r) => r.kind === 'dungeon').length).toBe(1); }, 60_000);
```
（`source()`、`profile`（`OuterProfile('od', OUTER_FRAME)`）是 `discovery.test.ts:12, 133-134` 既有的 fixture；`OUTER_PT` = 該 profile 下 `outerRegions` 回非空的一點（在測試檔內挑一個寫死）；`totals(s)` = 各類別的 `total`。第一個 `it`（±20,000 掃描）逾時 120 s 已寫。）
- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/discovery.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine src/scripts/games/delve/save`；Expected: 全綠（舊世界的 `buildRegions` 與 id 不變、舊世界日誌總數不變）。
- [ ] **Step 5: Commit** — `feat(delve): gen2 regions for every structure kind; known-region registry with id resolver`。

---

### Task 16: 地區的消費者：大地圖（含外圍地區名稱）、日誌、HUD、提示 / 委託 / 探路

**Files:**
- Modify: `render/mapModel.ts:192-254`（`mapPins` / `mapLabels` 吃 `listKnown()`；新種類圖示沿用既有）、`render/mapView.ts:17, 290, 311-313`（`g.regions[lb.id]` → `discovery.region(id)`）、`render/journal.ts:171, 178, 210-223`、`render/hud.ts:704-705`（地區名含外圍 / gen2）、`render/renderer.ts:1083`（蘑菇環境音含 gen2 地區）、`engine/game.ts:4252`（嚮導 reveal）、`:4661-4666`（scout）、`:4686-4693`（提示）、`:4705-4706`（委託 `nearestUnfound`）、`:4742-4743`（markDone）、`engine/quests.ts:74`
- Test: `render/mapModel.test.ts`、`render/hud.test.ts`（或既有 HUD 地區名測試）、`engine/game.explore.test.ts`、`tests/e2e/delve-gen2.spec.ts`

**Interfaces:**
- Consumes: `Discovery.listKnown / region / know`（Task 15）。
- `mapLabels(regions, d)` / `mapPins(regions, d, showAll)` 的呼叫端改傳 `discovery.listKnown()`；外圍地塊地區（`cat 'land'`：大陸地區、海、島）找到後畫名稱（spec §4.2「大地圖要畫出外圍地區名稱」）。`ICON_OF` 新增：`pond → 'lake'`、`keep → 'dungeon'`、`lighthouse / hermit / wreck_isle → 'cabin'`、`reef / sea_ruin → 'ruin'`（沿用既有圖示，不新增美術）。
- HUD 地區名：`discovery.areaAt(x, y): Region | null`（新：中央 regionsAt ∪ 外圍查詢，取最小的那個）。
- scout 的真實介面（Q13，不改形狀）：`scout(): { name: string; x: number; y: number } | null`（game.ts:4653）、候選 = `this.landmarks`（未領）+ 地區（`r.ax / r.ay`）；本 Task 只把地區候選從 `this.regions` 換成 `discovery.listKnown()`；標記走 `addScoutMark(x, y)` → `scoutMarks: MapMarker[]`（`{ x, y }`），`markDone` 的地區查詢同樣換成 `listKnown()`。
- 提示 / 委託 / 探路 / 嚮導 reveal：候選 = `listKnown()` 中未找到的（gen2 世界家鄉全知，所以照舊能指路）。

- [ ] **Step 1: 寫失敗測試**

```ts
// mapModel.test.ts
it('外圍地區找到後大地圖畫名字：東方大海、島、荒野地區', () => { const { g, d } = gen2Explorer('lbl');   // gen2 遊戲 + 依序 visit 第一道東海、它的第一座島、東側第一片大陸中點
  const names = mapLabels(d.listKnown(), d).map((l) => l.name);
  expect(names).toContain('東方大海'); expect(names).toContain(regionName(g, firstIsland(g))); expect(names).toContain(regionName(g, firstContinentMid(g))); }, 60_000);
it('gen2 家鄉的村莊 / 地城圖釘：找到前 showAll 才畫、找到後畫', () => { const { g, d } = gen2Explorer('pin');
  const v = d.listKnown().find((r) => r.kind === 'village')!; expect(mapPins(d.listKnown(), d, false).some((p) => p.id === v.id)).toBe(false);
  d.visit(v.ax, v.ay); expect(mapPins(d.listKnown(), d, false).some((p) => p.id === v.id && p.icon === 'village')).toBe(true); }, 60_000);
// hud / game.explore
it('HUD 地區名：gen2 出生點 = 家鄉林地、第一道東海 = 東方大海（不是「未知之地」）', () => { const g = new DelveGame({ seed: 'hud2', worldGen: { kind: 'gen2' } });
  expect(areaLabel(g, SPAWN_X, g.spawn.y)).toBe('家鄉林地'); g.teleport(4300, SEA_Y - 2); g.step(FIXED_DT); expect(areaLabel(g, 4300, SEA_Y - 2)).toBe('東方大海'); }, 60_000);
it('gen2：提示指向家鄉沒去過的村莊；探路（scout）標出的地點在 listKnown 裡', () => { const g = new DelveGame({ seed: 'hint2', worldGen: { kind: 'gen2' } });
  expect(g.nextStepHint()).toMatch(/村/); const m = g.scout(); expect(m).not.toBeNull();          // scout(): { name, x, y } | null（game.ts:4653，沒有 id——Q13）
  const known = g.discovery.listKnown().find((r) => r.ax === m!.x && r.ay === m!.y), lm = g.landmarks.find((l) => l.x === m!.x && l.y === m!.y);
  expect(Boolean(known) || Boolean(lm)).toBe(true); if (known) expect(known.name).toBe(m!.name);
  expect(g.scoutMarks).toContainEqual({ x: m!.x, y: m!.y }); }, 60_000);              // scoutMarks: MapMarker[] = { x, y }（explore.ts:14）
```
```ts
// tests/e2e/delve-gen2.spec.ts（LF）
test('?gen2=1：大地圖模型在走到東方大海後有「東方大海」標籤', async ({ page }) => {
  await page.goto('/games/delve?seed=e2e-map&autostart=1&fresh=1&gen2=1'); await page.waitForFunction(() => window.__delveDebug?.game);
  await page.evaluate(() => { const g = window.__delveDebug!.game; g.teleport(4300, 330); });
  await expect.poll(() => page.evaluate(() => window.__delveDebug!.mapLabels().map((l: { name: string }) => l.name))).toContain('東方大海');
});
```
（`gen2Explorer` / `regionName` / `firstIsland` / `firstContinentMid` / `areaLabel`（HUD 用的取名函式，以 `render/hud.ts:704` 的實際函式為準）寫在測試檔內；`__delveDebug.mapLabels()` 若不存在就在 `render/session.ts:320` 的除錯鉤子加一個（只讀）。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/render/mapModel.test.ts src/scripts/games/delve/engine/game.explore.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上；舊世界的行為（中央 regions 即 listKnown 的全部）不變。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve` 與 `npx playwright test tests/e2e/delve-gen2.spec.ts --project=chromium`；Expected: 全 PASS。
- [ ] **Step 5: Commit** — `feat(delve): big map, journal, HUD, hints and quests read known regions; outer region names on the map`。

---

### Task 17: 家鄉品質總驗（§4.4）、舊生成器 tile 集合對照、每種生態的地表→洞穴路

**Files:**
- Create: `engine/legacy/legacyTiles.measure.test.ts`、`engine/gen2/legacyTiles.ts`、`engine/gen2/home.quality.test.ts`
- Modify（只在 Step 4 需要補做時）：`engine/gen2/fill.ts`（Task 12 的 pass）

**Interfaces:**
- `legacyTiles.measure.test.ts`（Q17：不准只印不驗）：`it.runIf(process.env.DELVE_MEASURE === '1')`，量 3 個種子（`alpha` / `beta` / `gamma`）的舊家鄉 fg tile 集合，先 `console.info('[legacy tiles]', …)` 再斷言 `expect([...measured].sort((a, b) => a - b)).toEqual(LEGACY_HOME_TILES)` 與 `expect(measured.size).toBeGreaterThan(40)`，逾時 `300_000`（第一次跑常數是空的 → 紅、但先印出；貼上後重跑必須綠）。
- Produces（`legacyTiles.ts`）：`export const LEGACY_HOME_TILES: readonly number[]`（舊生成器 3 個種子家鄉出現過的所有 fg tile id，量測貼上）、`export const NOT_PORTED: Readonly<Record<number, string>>`（gen2 刻意不做的 tile 與理由，作者決定：`T.SPRING` / `T.LAVA_SPRING` / `T.DRAIN`（泉水瀑布不移植：需要液體模擬，§4.3 禁止生成後模擬）、`T.CLAY` / `T.GRAVEL`（乾湖床 / 土石互滲不移植，§4.4 沒列）、`T.ICE`（結冰湖不移植），每項一行理由；量測後若還有其他 tile 只在舊世界出現，**先補 gen2 做法**，真的不做才列進來並在 commit 說明）。
- `home.quality.test.ts` 把 §4.4 每一條在 20 個種子上再驗一次（各 Task 的測試是 5 個種子的細節版），全部只用藍圖 + `homeContent` + 抽樣欄的 fill，逾時 300 s。

- [ ] **Step 1: 量舊生成器** — Run: `DELVE_MEASURE=1 npx vitest run src/scripts/games/delve/engine/legacy/legacyTiles.measure.test.ts`；把 `[legacy tiles]` 輸出貼進 `legacyTiles.ts`，重跑一次 Expected: PASS。
- [ ] **Step 2: 寫失敗測試**

```ts
it('§4.4 總驗（20 個種子）', () => { for (const seed of SEEDS20) { const src = new Gen2Source(seed), h = src.layout.landmassAt(SPAWN_X)!, hc = homeContent(src), bp = homeBlueprints(seed);
  expect(new Set(h.regions.map((r) => r.biome))).toEqual(new Set([0, 1, 2, 3]));
  expect(src.layout.regionAt(SPAWN_X)!.biome).toBe(BIOME.FOREST); expect(flatAround(src, SPAWN_X, 60)).toBe(true);
  expect(src.layout.regionAt(5)!.variant).toBe(VARIANT.BEACH); expect(src.layout.regionAt(4195)!.variant).toBe(VARIANT.BEACH);
  expect(hc.dungeon!.rooms.length).toBeGreaterThanOrEqual(25); expect(hc.dungeon!.keys.length).toBeGreaterThan(0);
  expect(hc.villages.length).toBeGreaterThanOrEqual(2); expect(hc.villages.length).toBeLessThanOrEqual(4); expect(hc.halls.length).toBeGreaterThanOrEqual(1);
  expect(bp.flatMap((b) => b.chests).filter((c) => c.kind === 'secret').length).toBeGreaterThanOrEqual(3);
  for (const k of ['cabin', 'ruin', 'mineshaft', 'sky_island', 'mushroom_biome', 'crystal_cave', 'cave_lake']) expect(bp.some((b) => b.kind === k), `${seed} ${k}`).toBe(true);
  expect(hc.tablets).toHaveLength(14); expect(hc.relics).toHaveLength(4); } }, 300_000);
it('§4.4 每種生態至少一條從地表走得到洞穴層的路（家鄉，5 個種子）', () => { for (const seed of SEEDS5) { const src = new Gen2Source(seed), w = worldOf(src);
  for (const biome of [0, 1, 2, 3]) { const r = homeRegionsOf(src, biome).find((q) => Number.isFinite(shaftX(seedInt(seed, 'g2-shaft'), q)))!;
    expect(r, `${seed} biome ${biome}`).toBeDefined(); const sx = shaftX(seedInt(seed, 'g2-shaft'), r); loadColumns(w, sx - 20, sx + 20);
    expect(bfsReachesDepth(w, sx, src.surfaceAt(sx) - 1, (x) => src.layersAt(x).deep, sx - 20, sx + 20)).toBe(true); } } }, 120_000);
it('家鄉不輸舊版：舊生成器家鄉出現過的 tile，gen2 家鄉（3 個種子聯集）都有，除了 NOT_PORTED', () => {
  const now = homeTileSet(['alpha', 'beta', 'gamma']); expect(LEGACY_HOME_TILES.filter((t) => !now.has(t) && !(t in NOT_PORTED))).toEqual([]); }, 180_000);
```
（`flatAround(src, x, r)` = ±r 欄地表都相同；`homeRegionsOf(src, biome)` = 家鄉中該生態的非沙灘地區；`homeTileSet` = 家鄉 0..131 欄 `fillCol` 的 fg tile 集合。）

- [ ] **Step 3: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/home.quality.test.ts`；Expected: 若前面 Task 都完成，前兩個測試應 PASS（它們是總驗）；第三個依量測結果決定要補什麼。
- [ ] **Step 4: 補做** — 第三個測試列出的缺項：能用既有機制補的（裝飾、地層材質）補進 Task 12 的 pass；不補的寫進 `NOT_PORTED` 附理由。
- [ ] **Step 5: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: PASS。
- [ ] **Step 6: Commit** — `test(delve): gen2 home quality checklist (§4.4) and legacy tile coverage`。

---

### Task 18: 荒野大陸的大東西（村莊 / 小地城 / 地廳）與隱士小屋、v0 只有荒野大陸

**Files:**
- Create: `engine/gen2/structures/keep.ts`、`engine/gen2/structures/hermitHut.ts`、`engine/gen2/outer.test.ts`
- Modify: `engine/gen2/anchors.ts`（`continentAnchors`）、`engine/gen2/blueprint.ts`（登錄 `keep` / `village` / `hall` / `hermit_hut` 的大陸錨點；`guard()` 跳過錨點槽）、`engine/gen2/bpcore.ts`（`BpKind` 加 `'keep'` / `'hermit_hut'`）、`engine/gen2/cultures.ts`（`CULTURE_POOL = { 0: [null] }`）、`engine/gen2/layout.ts:182-189`（刪掉 c = 1 的「第一片必有霧竹」規則——Q14）、`engine/folkDefs.ts`（`FolkRole` 加 `'hermit'`、`ROLES.hermit`——Task 20 沿用並加 `chart` 服務）、`engine/folk.ts`（隱士站位：`addSite` 認得 `kind: 'hermit'`）、`engine/game.ts`（`world.onGenSites` 已接——外圍聚落 NPC 在欄載入時出現）、`net/`（客人收到未登錄 NPC 的位置時略過）
- Test: `engine/gen2/layout.test.ts`（M1 的文化測試 `:88-89`、`:179` 改寫；鎖表注入霧竹的 `:150-151` 照留）、`engine/gen2/outer.test.ts`、`net/coop.gen2.test.ts`；必須保持綠：`engine/gen2/blueprint.test.ts`（P11：每片大陸 ≥ 1 小屋、≥ 1 遺跡，`:65-71`）、`engine/discovery.test.ts`（M1「霧竹大陸的地區名」測試改用 `LockTable` 鎖一片 `{ ver: 0, culture: 'mistbamboo' }` 的大陸——既有機制，不加 Layout 參數）

**Interfaces:**
- Produces（`cultures.ts` / `layout.ts`，Q14）：`CULTURE_POOL = { 0: [null] }`；c = 1 規則刪除 → v0（以及 M2b 凍結的 v1）所有大陸 `culture === null`、kind `'wild'`。**不做任何文化閘門**：霧竹的指派（「離家最近、尚未進入過的那片大陸」、ver ≥ 2）整個是 M4 的工作（spec §4.1 2026-10-24 修訂）。鎖表裡已存的 culture 照舊尊重（`locked !== undefined` 那一支不動）。
- Produces（`anchors.ts`）：`continentAnchors`——大東西的目標點：`x0 + 200`、`x1 − 200` 與兩者之間均分、相鄰目標距離 ≤ 1,100；每個目標取「槽中心最接近它的合格槽」（village / keep：SURFACE；hall：DEEP），已用過的槽跳過。種類（雜湊）：tier 1 village 50% / keep 30% / hall 20%；tier ≥ 2 village 35% / keep 45% / hall 20%；外圍村莊可以放在任何生態（雪原、沙漠、叢林也有村子），只排除 HIGH 變體的地區（太陡）——目標附近只有 HIGH 地區時改放 keep。另加 **1 個 `hermit_hut` 錨點**（Q20b）：大陸中點附近、還沒被大東西用掉的 SURFACE 槽（槽中心最接近 `(x0 + x1) / 2` 的）。
- **錨點 vs 保證槽（Q15）**：錨點優先。`guard()` 的合格槽清單先剔除該大陸所有錨點佔用的 (地區, 層, 槽)，再照 M1 的起點 g 往後找小屋 / 遺跡——保證仍是每片大陸各 ≥ 1，只是改在剩下的槽裡找；剔除後沒有合格槽 = 版面壞了，照 M1 丟 RangeError（P11 不能默默失效）。
- **小地城的外框（Q10）**：keep 是錨點，Task 9 的跨層規則讓同地帶 UNDER / DEEP 的機率 / 保證藍圖讓位（不會切開房間或鎖）；本 Task 的測試驗「keep 外框內沒有其他非液體藍圖」。
- Produces（`keep.ts`）：`buildKeepBp(c: BpCtx): Blueprint`——小地城：zone = 槽內寬 300、`y0 = 地表 − 40`、`y1 = 地表 + 260`；`generateDungeonOn(..., { rooms: KEEP_ROOMS, minConnected: 6 })`，`KEEP_ROOMS = ['shrine', 'library', 'prison', 'vault', 'hall', 'chamber', 'shaft', 'hall', 'chamber', 'chamber', 'prison', 'hall']`；不放燈脈古碑（`tablets: false`）；`site = { kind: 'dungeon', ... }`。
- Produces（`hermitHut.ts`，Q20b）：`drawHermitHut(cv: Canvas, o: { x0: number; w: number; floorY: number }, rng: RandomLike): { at: { x: number; y: number } }`（木屋寬 9–11、門、床、火把；Task 20 的隱士島共用同一個繪製函式，不複製）；`buildHermitHutBp(c: BpCtx): Blueprint`——站在 `c.profile` 地表（SURFACE 層，不讀 `groundAt`），`ground` 覆寫屋底欄、`site = { kind: 'hermit', key: 's' + c.id, rot: 0, at }`。spec §4.1「荒野大陸的結構以遺跡、地城、小屋、礦坑、**隱士**為主」。
- Produces（folk）：`FolkRole` 加 `'hermit'`；`ROLES.hermit`（人類、獨居、台詞 3 句繁中、商店：繩索 / 火把 / 烤魚；服務本 Task 先空著，Task 20 加 `chart`）；`addSite` 遇 `kind: 'hermit'` 放 1 位 `${key}:hermit`，站在 `at`。小屋不算「大東西」（Task 21 的判定照舊）。

- [ ] **Step 1: 寫失敗測試**

```ts
// layout.test.ts（M1 的文化測試改寫，Q14：v0 / v1 只有荒野，霧竹指派是 M4）
it('v0：所有大陸都是荒野（culture null、kind wild），含第一片東 / 西大陸', () => { for (const seed of SEEDS20) for (const side of [1, -1] as const) for (let i = 2; i <= 12; i += 2) {
  const m = L(seed).landmass(side, i); expect(m.culture, `${seed} ${side}:${i}`).toBeNull(); expect(m.regions.every((r) => r.kind === 'wild')).toBe(true); } }, 30_000);
it('鎖表裡已存的 culture 照舊尊重（M1 :150-151 的鎖表測試照留）', () => { const locks = new LockTable(); locks.lock(1, 2, { ver: 0, culture: 'mistbamboo' });
  expect(L('s', locks).landmass(1, 2).culture).toBe('mistbamboo'); expect(L('s', locks).landmass(-1, 2).culture).toBeNull(); });
// outer.test.ts（20 個種子 × 每側 3 片大陸，逾時 300 s）
it('荒野大陸的大東西：兩端 500 格內各有一個、相鄰兩個的外框間隔 < 1,700', () => { for (const seed of SEEDS20) { const g = new Gen2Source(seed);
  for (const side of [1, -1] as const) for (const i of [2, 4, 6]) { const m = g.layout.landmass(side, i), big = bigBoxes(g, m.x0, m.x1).sort((a, b) => a[0] - b[0]);
    expect(big[0][0]).toBeLessThan(m.x0 + 500); expect(big.at(-1)![1]).toBeGreaterThan(m.x1 - 500);
    for (let k = 1; k < big.length; k++) expect(big[k][0] - big[k - 1][1]).toBeLessThan(1700); } } }, 300_000);
it('小地城：≥ 8 房、房間圖可解、有上鎖寶箱；外圍村莊有居民（欄載入後 elder 存在）', () => { const { src, keep, village } = firstOuter('outer-k');
  expect(keep.info.rooms.length).toBeGreaterThanOrEqual(8); expect(solvable(keep.info)).toEqual({ ok: true });
  const g = new DelveGame({ seed: 'outer-k', worldGen: { kind: 'gen2' } }); g.teleport(village.info.board.x, village.info.board.y); for (let k = 0; k < 30; k++) g.step(FIXED_DT);
  expect(g.folk.byKey(`${village.key}:elder`)).not.toBeNull(); }, 120_000);
it('錨點 vs 保證槽（Q15）：保證小屋 / 遺跡不落在錨點槽，且每片大陸仍各 ≥ 1；keep 外框內沒有其他非液體藍圖（Q10）', () => { for (const seed of SEEDS20) { const g = new Gen2Source(seed);
  for (const side of [1, -1] as const) for (const i of [2, 4, 6]) { const m = g.layout.landmass(side, i), anc = new Set(g.blueprints.anchorsOf(m).map(slotKey)), bps = bpsIn(g, m);
    expect(bps.filter((b) => b.kind === 'cabin').length).toBeGreaterThanOrEqual(1); expect(bps.filter((b) => b.kind === 'ruin').length).toBeGreaterThanOrEqual(1);
    for (const b of bps.filter((q) => (q.kind === 'cabin' || q.kind === 'ruin') && isGuaranteed(g, m, q))) expect(anc.has(slotKeyOf(b, g.layout)), `${seed} ${b.kind} ${b.x}`).toBe(false);
    for (const k of bps.filter((q) => q.kind === 'keep')) expect(bps.filter((o) => o !== k && !LIQUID_KINDS.has(o.kind) && meets(o, k))).toEqual([]); } } }, 300_000);
it('隱士小屋（Q20b）：每片荒野大陸 1 座；欄載入後隱士 NPC 在屋裡', () => { for (const seed of SEEDS20) { const g = new Gen2Source(seed);
  for (const side of [1, -1] as const) for (const i of [2, 4, 6]) expect(bpsIn(g, g.layout.landmass(side, i)).filter((b) => b.kind === 'hermit_hut' && b.site?.kind === 'hermit'), `${seed} ${side}:${i}`).toHaveLength(1); }
  const g = new DelveGame({ seed: 'outer-h', worldGen: { kind: 'gen2' } }), h = firstHermitHut(g); g.teleport(h.at.x, h.at.y); for (let k = 0; k < 30; k++) g.step(FIXED_DT);
  const npc = g.folk.byKey(`${h.key}:hermit`)!; expect(npc).not.toBeNull(); expect(Math.abs(npc.body.x / 16 - h.at.x)).toBeLessThanOrEqual(8); }, 300_000);
// coop.gen2.test.ts
it('外圍村莊：客人在房主之後才載入那段 → NPC key / id 與房主相同；之前收到的位置被略過、不丟錯', () => {
  const rig = coopRig({ world: 'gen2' }); rig.run(2000); rig.hostTeleport(outerVillageBoard(rig)); rig.run(30 * FRAME);
  expect(() => rig.run(30 * FRAME)).not.toThrow(); rig.guestTeleport(outerVillageBoard(rig)); rig.run(120 * FRAME);
  expect(siteNpcIds(rig.guests[0].game!)).toEqual(siteNpcIds(rig.hostGame)); }, 120_000);
```
（`bigBoxes(g, x0, x1)` = 該範圍內 village / keep（dungeon site）/ hall 藍圖的 `[x, x + w]`；`bpsIn(g, m)` = `overlapping(m.x0, m.x1)` 中落在 m 內的；`slotKey(a)` / `slotKeyOf(b, layout)` = `"region:layer:slot"`；`isGuaranteed` = 該藍圖是不是 `guard()` 選的那份（比對 `structureId` 與重算的保證槽）；`meets` = 外框相交；`LIQUID_KINDS` = lake / cave_lake / lava_pool；`firstHermitHut(g)` = 東側第一片大陸的 `hermit_hut` 藍圖的 `site`；`firstOuter`、`outerVillageBoard`、`siteNpcIds`、`hostTeleport` / `guestTeleport` 以 testRig 既有成員為準，沒有就在 testRig 加。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/layout.test.ts src/scripts/games/delve/engine/gen2/outer.test.ts src/scripts/games/delve/net/coop.gen2.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上；M1 Task 14 的 gen2 文化命名測試（「霧竹大陸的地區名」）改用 `LockTable` 鎖一片霧竹大陸（不加 Layout 參數、不做 `CULTURE_SINCE`——Q14）；M1 `layout.test.ts:88-89, 179` 的「第一片東西大陸恰一片霧竹」斷言刪除，commit 說明寫「v0 / v1 只有荒野（spec §4.1 修訂），霧竹指派由 M4 實作」。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine src/scripts/games/delve/net`；Expected: 全綠。
- [ ] **Step 5: Commit** — `feat(delve): wild continents get villages, keeps, halls and a hermit hut; v0 is wild-only`（re-record gen2 v0 hash）。

---

### Task 19: 小點位（MINOR 層）、沙灘點位、海上點位間距

**Files:**
- Create: `engine/gen2/structures/minor.ts`
- Modify: `engine/gen2/blueprint.ts`（MINOR 層：每個有槽的陸地地區（不含沙灘、不含地城區）切 170 格槽；槽內沒有其他表層 / 天空藍圖的外框相交、且不在下面的排除範圍，就放一個小點位）、`engine/gen2/bpcore.ts`（`BpKind` 加 `'minor'`——M2b Task 9 依賴這個名字）、`engine/gen2/layout.ts:150-160`（海槽的島 / 沉船偏移 ± `min(20, floor(槽寬 / 10))`）、`engine/gen2/structures/shipwreck.ts`（同）
- Test: `engine/gen2/minor.test.ts`、`engine/gen2/layout.test.ts`、`engine/gen2/sea.test.ts`；必須保持綠、**不改斷言**（Q16）：`engine/gen2/blueprint.test.ts`——`:72-79`（出生點 ± 80 內沒有藍圖、含 ± 80 的槽整槽全空，所有層含 MINOR）、`:80-93`（含 shaftX 的槽不放非 DEEP 藍圖、非 DEEP 外框離 sx 在 SHAFT_REACH 範圍外）、`:100-111`（家鄉兩端沙灘沒有藍圖）；`engine/gen2/settlements.test.ts`（家鄉零重疊，Q10）

**Interfaces:**
- Produces（`minor.ts`）：`buildMinorBp(c: BpCtx): Blueprint`（kind `'minor'`、`sub: 'cairn' | 'camp' | 'stones'` 記在藍圖上）——種類（雜湊）：`cairn`（石堆 + 紅布旗，地標 `T.CAIRN`）45%、`camp`（木板帳篷 + 火把 + 地標 `T.RELIC_PACK`）30%、`stones`（3–5 根石柱圍一圈 + 2 個陶罐）25%；寬 ≤ 12、站在 `c.groundAt(x)` 上（Q4：只看 profile + SURFACE 層的地面覆寫；**小點位自己沒有 `ground`**；只畫地表以上與地表那一格）。`spawn_tablet` 錨點佔用它所在的 MINOR 槽（Task 7：在 ± 80 之外）。
- **排除範圍（Q16）**：小點位外框不得落在——家鄉兩端沙灘（`[0, 70)`、`[4130, 4200)`）；出生點清空區（含 `SPAWN_X ± 80` 的 MINOR 槽整槽不放）；主坑道 `[shaftX − (SHAFT_HALF + 2), shaftX + (SHAFT_HALF + 2)]`（另外 M1 測試要求外框離 sx 在 `SHAFT_REACH` 範圍外，比這條嚴，以 M1 為準；原本也要求含 shaftX 的槽整槽不放——**2026-10-26 修訂（T21-12）**：含主坑道的槽可以放小點位，條件是主坑道入口 `[sx − 1, sx + 3)` 不在槽的偏好區 minorZone、外框完全在 shaftBand 外，因為規格 §4.4「任意 340 格內有東西」要對任意種子成立，整槽不放在 dens-e / f / g 留下 341–350 的空隙）；湖藍圖的外框（`kind === 'lake'` 的 SURFACE 藍圖，M1 Task 10 起就有——湖的資料在 M2a 就拿得到，不等 M2b 的 `waterTopAt`）；海（`waterTopAt(x) !== null`）。被排除的槽不放小點位（不往旁邊挪）。
- 小點位不建地區（不進 Discovery 地區），但地標照常登錄。

- [ ] **Step 1: 寫失敗測試**

```ts
it('每個陸地的 MINOR 槽至少有一個值得停下的東西（小點位，或與表層 / 天空藍圖相交）', () => { for (const seed of SEEDS5) { const g = new Gen2Source(seed);
  for (const s of minorSlots(g, -15_000, 15_000)) { const hit = g.blueprints.overlapping(s.x0, s.x1, [BP_SURFACE, BP_SKY, BP_MINOR]).filter((b) => b.x < s.x1 && b.x + b.w > s.x0);
    expect(hit.length, `${seed} ${s.x0}`).toBeGreaterThanOrEqual(1); } } }, 120_000);
it('海槽偏移 ≤ 20：島與沉船的中心離槽中心 ≤ 20', () => { for (const seed of SEEDS20) for (const side of [1, -1] as const) for (const i of [1, 3, 5]) { const m = L(seed).landmass(side, i);
  for (const d of m.islands) { const s = m.slots[d.slot]; expect(Math.abs(((d.x0 + d.x1) >> 1) - ((s.x0 + s.x1) >> 1))).toBeLessThanOrEqual(20 + 1); } } }, 30_000);
it('小點位站在地面上、不在水上', () => { const g = new Gen2Source('mn'), w = worldOf(g); for (const b of g.blueprints.overlapping(-8000, 8000, [BP_MINOR]).slice(0, 40)) {
  loadColumns(w, b.x, b.x + b.w); for (let x = b.x; x < b.x + b.w; x++) expect(g.waterTopAt(x)).toBeNull(); expect(b.y + b.h - 1).toBeLessThanOrEqual(g.surfaceAt(b.x + (b.w >> 1))); } }, 60_000);
it('小點位的排除範圍（Q16）：不在家鄉沙灘、出生點 ± 80 的槽、坑道 ± (SHAFT_HALF + 2)、湖藍圖外框上；小點位沒有 ground', () => { for (const seed of SEEDS5) { const g = new Gen2Source(seed), ss = seedInt(seed, 'g2-shaft');
  const lakes = g.blueprints.overlapping(-15_000, 15_000, [BP_SURFACE]).filter((b) => b.kind === 'lake');
  for (const b of g.blueprints.overlapping(-15_000, 15_000, [BP_MINOR]).filter((q) => q.kind === 'minor')) { const s = slotOf(b.id, g.layout), sx = shaftX(ss, s.region);
    expect(b.ground).toBeNull(); expect((b.x < 70 && b.x + b.w > 0) || (b.x < 4200 && b.x + b.w > 4130), `${seed} beach ${b.x}`).toBe(false);
    expect(s.x0 <= SPAWN_X + 80 && s.x1 > SPAWN_X - 80, `${seed} ${b.x}`).toBe(false);
    if (Number.isFinite(sx)) expect(b.x + b.w <= sx - SHAFT_HALF - 2 || b.x > sx + SHAFT_HALF + 2, `${seed} ${b.x}`).toBe(true);
    expect(lakes.filter((l) => l.x < b.x + b.w && b.x < l.x + l.w), `${seed} ${b.x}`).toEqual([]); } } }, 120_000);
```
（`minorSlots(g, x0, x1)` = 範圍內所有有槽的陸地地區（非沙灘、非地城區）的 170 格 MINOR 槽，**扣掉排除的槽**（出生點 ± 80 的槽、含 shaftX 的槽——那裡的主坑道入口本身就是 Task 21 定義的「值得停下的東西」、與湖相交的槽）；`overlapping` 的第三參數是 Task 2 的 `layers` 篩選。三個 `it` 都寫明逾時。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/minor.test.ts src/scripts/games/delve/engine/gen2/layout.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: PASS。
- [ ] **Step 5: Commit** — `feat(delve): gen2 minor points of interest every 170 tiles; tighter sea point jitter`（re-record gen2 v0 hash）。

---

### Task 20: 島的種類（燈塔 / 隱士 / 沉船島）、珊瑚礁、海底遺跡、隱士 NPC

**Files:**
- Create: `engine/gen2/structures/island.ts`、`engine/gen2/structures/reef.ts`、`engine/gen2/structures/seaRuin.ts`、`engine/gen2/islands.test.ts`
- Modify: `engine/gen2/layout.ts:20-21, 130-170`（`IslandInfo.type`、`SeaSlot.poi`）、`engine/gen2/blueprint.ts`（島槽有藍圖、新海點）、`engine/gen2/fill.ts`（島的表層照舊，建物蓋在上面）、`engine/loot.ts`（`ChestKind` 加 `'crate'`：漂流箱的少量物資表）、`engine/gen2/structures/crate.ts`（用 `'crate'`）、`engine/gen2/structures/shipwreck.ts`（抽出 `drawHull`）、`engine/gen2/bpcore.ts`（`BpKind` 加 `'island'` / `'reef'` / `'sea_ruin'`）、`engine/folkDefs.ts`（`FolkService` 加 `'chart'`、`ROLES.hermit.services` 加 chart——`'hermit'` 角色本身是 Task 18 建的）、`engine/game.ts`（`chart` 服務走既有的 `folkService` → `doService`）、`engine/discovery.ts`（`NAMES` 加 lighthouse / hermit / wreck_isle / reef / sea_ruin 名單）
- Test: `engine/gen2/islands.test.ts`、`engine/gen2/layout.test.ts`、`engine/game.folk.test.ts`；必須保持綠：`engine/gen2/sea.test.ts`、`engine/gen2/structures.test.ts`（M1 沉船形狀——`drawHull` 抽出後逐格相同）、`engine/gen2/outer.test.ts`（Task 18 的隱士小屋 NPC）

**Interfaces:**
- Produces（`layout.ts`）：`export type IslandType = 'plain' | 'lighthouse' | 'hermit' | 'wreck'`；`IslandInfo.type`；每道海依槽序的第一座島 = 有建物（三種依雜湊均分），其餘 40% 有建物、60% `plain`；`SeaSlot.poi: 'island' | 'shipwreck' | 'crate' | 'reef' | 'sea_ruin'`，非島槽 shipwreck 30% / crate 30% / reef 20% / sea_ruin 20%。
- Produces（structures）：`buildIslandBp(c: BpCtx, type: IslandType): Blueprint`——`lighthouse`：石磚塔（寬 5、高 18–24、內部平台每 4 格一層可爬、頂部 `'ruin'` 箱 + 光源）、地標 `T.GUARDIAN_STATUE`；`hermit`：木屋（Task 18 的 `drawHermitHut`，寬 9–11）+ `site = { kind: 'hermit', key: 's' + id, rot: 0, at }`；`wreck`：擱淺在島灘上的船殼（沿用 M1 沉船的形狀函式，抽成 `drawHull(cv, x0, w, keelY)` 共用）+ `'ruin'` 箱；`plain` 回 null（只有地形與樹）。`buildReefBp(c: BpCtx): Blueprint`（海床上的石 / 砂岩丘、內含 6–12 格銀 / 金礦團、地標 `T.CAIRN` 不放——水下用 `T.RELIC_PACK`）；`buildSeaRuinBp(c: BpCtx): Blueprint`（半埋海床的石磚殘屋、內部保留水、`'ruin'` 箱、地標 `T.GUARDIAN_STATUE`）。
- Produces（folk）：`ROLES.hermit`（Task 18 建的角色）加服務 `{ kind: 'chart', zh: '標出下一片大陸上一處還沒去過的地點', price: 120 }`；`chart` 服務（呼叫路徑 = 既有的 `folkService(key, 'chart'): { ok: boolean; msg: string }`，game.ts:4574）：取該隱士所在地塊朝外的下一片大陸（島上的隱士 = 該海朝外；荒野大陸上的隱士小屋 = 該大陸朝外），從它的錨點大東西中挑一個未找到的（`Discovery.region` 查得到），經既有的 private `addScoutMark(x, y)`（game.ts:4731）加進 `scoutMarks: MapMarker[]`（`{ x, y }`，explore.ts:14）；都找到了就退回一般 `scout()`。不新增 `useFolkService` / `give`（不存在；Q13）。

- [ ] **Step 1: 寫失敗測試**

```ts
it('§8：每道海至少 1 座有建物的島（燈塔 / 隱士 / 沉船島），三種都出現過（20 個種子）', () => { const types = new Set<string>();
  for (const seed of SEEDS20) for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7]) { const m = L(seed).landmass(side, i);
    expect(m.islands.some((d) => d.type !== 'plain')).toBe(true); for (const d of m.islands) types.add(d.type); }
  expect([...types].sort()).toEqual(['hermit', 'lighthouse', 'plain', 'wreck']); });
it('每個海槽恰一個點（島槽：有建物的島有一份藍圖；其他槽一份對應的藍圖）', () => { for (const seed of SEEDS5) { const g = new Gen2Source(seed);
  for (const side of [1, -1] as const) for (const i of [1, 3]) for (const s of g.layout.landmass(side, i).slots) { const bps = g.blueprints.overlapping(s.x0, s.x1, [BP_SURFACE]).filter((b) => b.x >= s.x0 && b.x < s.x1);
    const isl = g.layout.landmass(side, i).islands.find((d) => d.slot === s.k);
    if (isl) expect(bps.map((b) => b.kind)).toEqual(isl.type === 'plain' ? [] : ['island']); else expect(bps.map((b) => b.kind)).toEqual([s.poi]); } } }, 120_000);
it('燈塔可以從底爬到頂（平台間距 ≤ 4）、頂部有箱子；海底遺跡與珊瑚礁在水面下且液體靜止', () => { const { src, bp } = seaKinds('isl2'), w = worldOf(src);
  for (const b of bp) loadColumns(w, b.x, b.x + b.w);
  const tower = bp.find((b) => b.kind === 'island' && islandOf(src, b)!.type === 'lighthouse')!;   // 明確挑燈塔島（沉船島也有箱子——Q21）
  expect(tower).toBeDefined(); expect(climbable(w, tower)).toBe(true); expect(tower.chests.length).toBeGreaterThanOrEqual(1);
  for (const b of bp.filter((q) => q.kind === 'reef' || q.kind === 'sea_ruin')) { expect(b.y).toBeGreaterThan(src.waterTopAt(b.x)!); expect(liquidInvariant(w, b.x - 2, b.x + b.w + 2)).toEqual([]); } }, 60_000);
it('隱士：島上有隱士 NPC；chart 服務把下一片大陸的一處未找到的大東西標上地圖', () => { const g = new DelveGame({ seed: 'hermit', worldGen: { kind: 'gen2' } }), h = firstHermit(g);
  g.teleport(h.at.x, h.at.y); for (let k = 0; k < 30; k++) g.step(FIXED_DT); const npc = g.folk.byKey(`${h.key}:hermit`)!; expect(npc).not.toBeNull();
  g.inventory.add('copper_coin', 500); const before = g.scoutMarks.length, coins = g.coins();
  expect(g.folkService(npc.key, 'chart').ok).toBe(true); expect(g.coins()).toBeLessThan(coins);
  expect(g.scoutMarks.length).toBe(before + 1); const mark = g.scoutMarks.at(-1)!, next = nextContinentOf(g, h.at.x);   // MapMarker = { x, y }，沒有 id（Q13）
  expect(mark.x).toBeGreaterThanOrEqual(next.x0); expect(mark.x).toBeLessThan(next.x1);
  expect(g.discovery.listKnown().concat(bigRegionsOf(g, next)).some((r) => r.ax === mark.x && r.ay === mark.y)).toBe(true); }, 120_000);
```
（`seaKinds(seed)` = 前兩道海每種海點（含燈塔島）至少一份的種子搜尋；`islandOf(src, b)` = 該藍圖所在海槽的 `IslandInfo`（`layout.landmass(side, i).islands.find((d) => d.slot === slot)`）；`climbable(w, b)` = 塔內從底往上每一列的下一個可站平台 ≤ 4 格；`firstHermit` / `nextContinentOf` / `bigRegionsOf`（下一片大陸錨點大東西的地區，經 `discovery.region` 反查）寫在測試檔內。真實 API（Q13）：`folkService(key, kind): { ok, msg }`、`scoutMarks: MapMarker[]`（`{ x, y }`）、`inventory.add(item, n)`、`coins()`、錢幣 `'copper_coin'`；SCOUT_MAX = 60，新遊戲不會滿，`at(-1)` 就是新標的那個。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/islands.test.ts src/scripts/games/delve/engine/gen2/layout.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上（M1 的沉船形狀抽成 `drawHull` 給沉船與沉船島共用，不複製）。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine src/scripts/games/delve/render`；Expected: 全綠。
- [ ] **Step 5: Commit** — `feat(delve): built islands (lighthouse, hermit, wreck), reefs, sunken ruins, hermit chart service`（re-record gen2 v0 hash）。

---

### Task 21: 驚喜密度掃描、效能預算、M2a 驗收

**Files:**
- Create: `engine/gen2/density.test.ts`
- Modify: `engine/gen2/gen2.perf.test.ts`（新增大藍圖建構預算與開局時間）、`engine/gen2/gen2.lock.test.ts`（`COLS` 加家鄉地城塔欄與一座村莊欄，見下）、本計畫「基準紀錄」

**Interfaces:**
- 「值得停下的東西」（小）= SURFACE / SKY / MINOR 層的藍圖外框、島（含 plain）、每個海點的藍圖、主坑道入口（`[shaftX − 1, shaftX + 3)`）；「大東西」= village、keep / 地城（dungeon site）、hall、有建物的島。以 x 區間判斷：排序後相鄰區間的空隙 `下一個.x0 − 上一個.x1` 全部 < 340（小）/ < 1,800（大）⇔ 任意連續 340 / 1,800 格內至少一個。
- 效能預算（作者決定；Q9 修訂）：任一份藍圖單次建構（直接呼叫建構器）≤ 80 ms（地城）、≤ 30 ms（小地城）、≤ 10 ms（其他）；**開局建家鄉藍圖 `homePlans()`（含裝飾）目標 ≤ 300 ms**——自己一條預算、量測並寫進「基準紀錄」；gen2 `DelveGame` 開局 ≤ 1,500 ms（自動，M1 門檻，含 `homePlans`）；**第一次碰到某欄**的 fill 最壞 ≤ 120 ms（≈ 每 chunk 3.2 ms，< 8 ms）——家鄉欄量的是 `homePlans()` 已在開局建好之後的那次 fill（不含建家鄉藍圖；家鄉藍圖在 `pinned`、永不淘汰），外圍欄（小地城所在欄）照舊含第一次建藍圖；暖機後每欄中位數 ≤ 3 × v1、p95 ≤ 40 ms（M1）。

- [ ] **Step 1: 寫失敗測試**

```ts
it('驚喜密度（陸地 + 海，±50,000，3 個種子）：任意 340 格內有東西、任意 1,800 格內有大東西', () => { for (const seed of ['dens-a', 'dens-b', 'dens-c']) {
  const { small, big } = pois(new Gen2Source(seed), -50_000, 50_000);
  expect(maxGap(small), `${seed} small`).toBeLessThan(340); expect(maxGap(big), `${seed} big`).toBeLessThan(1800); } }, 300_000);
it('海上單獨也符合（只看海地塊的範圍）', () => { const g = new Gen2Source('dens-sea'); for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7, 9]) { const m = g.layout.landmass(side, i), p = pois(g, m.x0, m.x1);
  expect(maxGap(p.small, m.x0, m.x1)).toBeLessThan(340); expect(p.big.length).toBeGreaterThanOrEqual(1); } }, 120_000);
// gen2.perf.test.ts
it('大藍圖建構與開局預算', () => { const t = buildTimes(['perf-a', 'perf-b']);
  console.info('[gen2 budget]', JSON.stringify(t)); expect(t.dungeon).toBeLessThanOrEqual(80); expect(t.keep).toBeLessThanOrEqual(30); expect(t.other).toBeLessThanOrEqual(10);
  expect(t.homePlans).toBeLessThanOrEqual(300);                                       // Q9：開局建家鄉藍圖的獨立預算
  expect(t.firstTouchHomeColumn).toBeLessThanOrEqual(120); expect(t.firstTouchKeepColumn).toBeLessThanOrEqual(120); }, 120_000);
```
（`pois(src, x0, x1)` 寫在 `testUtil.ts`，用 `overlapping(x0, x1, [BP_SURFACE, BP_SKY, BP_MINOR])` + 海點 + 島 + 主坑道；`maxGap(intervals, x0?, x1?)` 也算進範圍兩端的空隙；`buildTimes` 量：每種藍圖直接呼叫建構器的單次最大值、新 `Gen2Source` 上 `blueprints.homePlans()` 的時間、`homePlans()` 之後地城所在欄第一次 `fillCol` 的時間（`firstTouchHomeColumn`，不含建家鄉藍圖）、東側第一片大陸小地城所在欄在全新 source 上第一次 `fillCol` 的時間（`firstTouchKeepColumn`，含建藍圖）。兩個密度 `it` 的逾時已寫。）

- [ ] **Step 2: 跑** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/density.test.ts src/scripts/games/delve/engine/gen2/gen2.perf.test.ts`；Expected: PASS（若 FAIL：密度不足 → 調 Task 18 / 19 的規則，不放寬門檻；預算不足 → 查藍圖快取與 `colIndex`）。
- [ ] **Step 3: 雜湊鎖涵蓋新結構** — `gen2.lock.test.ts` 的 `COLS` 加上種子 `'gen2-lock'` 家鄉地城塔所在欄與第一座村莊所在欄（跑一次查出來後寫成常數），並加一條守衛斷言：那兩欄真的與 dungeon / village 藍圖相交；重錄 `GEN2_HASHES[0]`。
- [ ] **Step 4: 全套** — Run: `npx vitest run`；`rtk proxy npx tsc --noEmit -p .`（773 / delve 0）；`npx playwright test tests/e2e/delve.spec.ts tests/e2e/delve-gen2.spec.ts tests/e2e/delve-online.spec.ts --project=chromium`；Expected: 全 PASS。
- [ ] **Step 5: 閒置機器效能實測（M1 P5）** — 關掉 dev server 等重負載，`npx vitest run src/scripts/games/delve/engine/gen2/gen2.perf.test.ts` 跑三次，三次 `median ratio` 的中位數必須 ≤ 2.00，連同 `[gen2 budget]`（含 `homePlans` 的三次值——Q9 的開局預算報告）寫進「基準紀錄」與 commit 說明；不達標本 Task 失敗。
- [ ] **Step 6: 給使用者 4321 連結** — 先確認 4321 是這個 worktree 起的 dev server（`docs/claude/verify.md`）；附 `http://localhost:4321/games/delve?gen2=1&autostart=1&fresh=1&seed=m2a-demo`，說明：家鄉有地城（在 `homeDungeonRegion` 那端）、村莊、地廳、石碑；往東過海可以看到燈塔 / 隱士島與荒野大陸的村莊、小地城。預設（不加 `?gen2=1`）仍是舊世界。
- [ ] **Step 7: Commit** — `test(delve): gen2 surprise density scan and build budgets`；然後派 fresh-context 驗收 agent（spec §9），清單 = 本計畫 Review Focus 五條 + 規格對照表。

---

## 規格對照（自我檢查）

| spec 要求 | Task |
|-----------|------|
| §4.3 結構以槽位藍圖局部生成、跨區塊物件由藍圖產生、載入時登錄 | 2、7 |
| §4.4 四生態 / 出生點 / 兩端海灘 | 7、17 |
| §4.4 地城在一端海灘內、≥ 25 房、召喚 / 鑰匙內容（= 舊地城的陶罐 / 箱子鑰匙、上鎖寶箱、wick_offering 的金礦路徑，Q20a） | 5、7、8 |
| §4.1 荒野大陸的結構含「隱士」（Q20b） | 18（隱士小屋 + 隱士 NPC）、20（chart 服務） |
| §8 OCEAN 海上遠景「海平線與遠方島影」（Q20c） | 已完成：M1 Task 4（`buildSeaHorizon` 等，`background.ts`） |
| §8 鳥巢礁（Q20d） | 延到 1b 之後（需要新物品與美術；作者決定 2026-10-24，已記入 spec §8） |
| §4.4 2–4 村莊、≥ 1 地廳、居民 | 3、4、9 |
| §4.4 地標 ≥ 85% | 14 |
| §4.4 ≥ 3 密室、小屋、遺跡、礦坑、空島 | 6、10、17 |
| §4.4 蘑菇 / 水晶小生態、花崗岩 / 大理石、地下湖、熔岩帶 | 11、12、17 |
| §4.4 14 石碑 + 4 遺物 | 14 |
| §4.4 礦物 ±30% | 13 |
| §4.4 召喚材料 | 13 |
| §4.4 每生態地表→洞穴 | 17 |
| §4.4 驚喜密度 ±50,000（陸 + 海） | 19、21 |
| §4.2 大地圖外圍地區名稱 | 16 |
| §8 島種類、珊瑚礁、海底遺跡、每道海 ≥ 1 建物島、漂流箱少量物資 | 20 |
| §9 M2「荒野大陸內容」 | 18 |
| 共用碼不複製（使用者 / M1 P10） | 4、5、6、20 |
| carry「結構 id 位元配置不再手抄」 | 1 |
| §9 M2 其餘（刪舊、拿旗標、凍結、測試處置、舊世界重生） | M2b |

## 規格模糊處與作者裁決

1. **v1 凍結時有沒有文化大陸（已解決：spec §4.1 於 2026-10-24 修訂，commit 593567af5）**：spec §4.1「第一片東 / 西大陸必有一片霧竹之國」與 §5「已進入的大陸永遠用那版規則」在 M2 凍結 v1、M4 才有霧竹內容時互相衝突。定案：v0 / v1 只有荒野大陸（決定 10，Task 18 測試釘「所有大陸 culture null」）；M4 以 ver ≥ 2 閘門把霧竹指派給「離家最近、尚未進入過的那片大陸」——閘門與指派規則都在 M4 實作，M2a 不做任何閘門（Preflight Q14）。代價：M4 前兩片第一大陸都去過的世界，霧竹之國會出現在 tier 2 以後。
2. **「地城在一端海灘內」**：照舊生成器的實際做法解讀為「緊貼一端沙灘的內側」（`worldgen.ts:274-278`），在家鄉版面加 420 格的地城區（決定 6）。
3. **14 塊石碑的地點**：沿用 `LORE_SITES`；舊生成器沒有的地點換成 gen2 的同類：`molten` → 熔岩祠（新的小藍圖）、`snow` / `desert` → 該生態地下的石室、`spawn` → 出生點旁的地表石碑。遺物 swift_boots 的「最深的裂谷」改成「最深的主坑道底」（gen2 沒有裂谷；主坑道是 gen2 的垂直通道）。
4. **舊生成器的地形特徵哪些不移植**：§4.4 是有約束力的清單；不在清單、又需要全域模擬或洪水填充的——泉水 / 瀑布（`SpringSpec`）、乾湖床、結冰湖、裂谷 / 峽谷 / 天坑、綠洲、土石互滲——M2 不移植，由 Task 17 的 `NOT_PORTED` 逐項記理由；蜂巢有獨特的物品來源（蜂蜜），所以移植（Task 11）。
5. **「值得停下的東西」與「大東西」的判定**：小 = 地表看得到的結構外框、小點位、島、海點、主坑道入口（地下結構不算，因為走在地表的人看不到）；大 = 村莊、地城 / 小地城、矮人地廳、有建物的島（M3 的菁英守衛點、M4 的神社加入後也算）。矮人地廳在地下，但它是聚落（spec 列的「村莊」同類），算大東西。
6. **海點偏移**：spec §8「每 300 格一個點」在 M1 的 ±槽寬/10（30）偏移下最大空隙可達 357 > 340；凍結前把偏移收到 ±20（Task 19），使 340 規則在海上嚴格成立。
7. **鳥巢礁（§8 列出）**：需要新的空島材料物品與美術，延到 1b 之後（作者決定 2026-10-24，已記入 spec §8；Preflight Q20d）。島種類 = 燈塔 / 隱士 / 沉船島 + 普通島。
8. **珊瑚礁「水下礦」**：用既有 tile（石 / 砂岩丘 + 銀 / 金礦團），不新增珊瑚 tile（tile 上限與美術成本；M4 要新增 14 個 tile）。
9. **大藍圖的效能**：spec「單一區塊最壞 8 ms」解讀為每 chunk；一欄 38 個 chunk，含第一次建地城藍圖的那一欄上限 120 ms（≈ 每 chunk 3.2 ms），另訂藍圖建構預算（Task 21）。客人加入時會建家鄉藍圖（`homePlans()`，目標 ≤ 300 ms，Q9）但不生成家鄉格子，符合「客人加入不需要生成家鄉整片」。
10. **舊 cabin / ruin**：M1 已是 gen2 版（不同形狀），不回頭與舊碼合併；「搬出共用碼」適用於 M2 新移植的結構。

## Preflight rulings Q1–Q21（2026-10-24，已套進各 Task）

來源：`.superpowers/sdd/2026-10-24-delve-1b-m2a-home-structures/preflight-scan.md`（衝突掃描）與同資料夾 `progress.md` 的「Preflight scan — rulings」。

- **Q1**（Task 1）：`GEN2_SITE_BASE = 8589934592` 字面值 + `// 2 的 33 次方`；移出的確定性掃描保留 M1「gen2 測試檔不 import legacy（gen2.perf.test.ts 例外）」。
- **Q2**（Task 2、7、8）：整區錨點（家鄉地城）帶 `wholeRegion`，豁免 8 格槽邊距測試、改驗在地區內；其他藍圖照舊。
- **Q3**（Task 2、10）：UNDER / DEEP 外框不碰 `[shaftX − SHAFT_HALF − 4, shaftX + SHAFT_HALF + 4]`（`shaft_cache` 例外）；礦坑長 + 斜坡 + 密室 ≤ 槽寬 − 16 = 154；M1 `blueprint.test.ts` 坑道避讓測試照綠。
- **Q4**（Task 2、10、19）：地面覆寫只來自 SURFACE 層；`BpCtx.groundAt(x)`；空島相對 profile 地表擺放、繩梯用 `groundAt`；小點位沒有 `ground` → 沒有循環。
- **Q5**（Task 2 → 14）：測試只用公開 API（`interact` + `drainEvents`）；需要登錄的測試用 gen2 世界（遊戲層測試移到 Task 14），World 層用 `central: 'source'`。
- **Q6**（Task 3）：NPC id = 兩次 hash2 組成的 53-bit 安全整數；撞號丟錯、不探測；舊世界 `SiteRegistry({ ranges: 'legacy' })` 逐字照抄今天的 `siteAt` 範圍，新範圍只給 gen2。
- **Q7**（Task 4）：`Canvas.surfaceAt(x)`；`gridCanvas(…, natural)` 天然材質回呼。
- **Q8**（Task 7）：「沒登錄建構器的錨點槽是空的」改用測試專用 `test_probe` 錨點（`extraAnchors` 測試接縫）。
- **Q9**（Task 8、14、21）：家鄉藍圖開局 `homePlans()` 一次建完、存 `pinned`（不進 LRU 256）；開局預算目標 ≤ 300 ms（量測、報告）；第一次碰欄的預算不含建家鄉藍圖；地城 80 ms 改測建構器本身。
- **Q10**（Task 9；10、11、18 適用）：跨層非液體藍圖不重疊；錨點 > 保證 > 機率，同級丟較深的（SKY / MINOR 同級讓位）；`crossYields` 純函式測試；Task 9 零重疊測試必須一路綠。
- **Q11**（Task 9、14）：`engine/gen2/home.ts` 由 Task 9 建立、Task 14 修改；家鄉聚落經 `WorldContent.sites` 交給遊戲。
- **Q12**（Task 15）：只有 gen2（`trackOuter`）把 visit 到的外圍地區加進已知表並存檔，讀檔後總數相同；舊世界日誌總數不變（測試）。
- **Q13**（Task 16、20）：用真名——`scout(): { name, x, y } | null`、`scoutMarks: MapMarker[]`（`{ x, y }`）、`folkService(key, kind): { ok, msg }`、`inventory.add`、`coins()`；不存在的 `id` / `useFolkService` / `give` 全拿掉。
- **Q14**（Task 18、決定 10、規格模糊處 1）：v1 只有荒野大陸（全部 culture null，測試釘）；刪 c = 1 規則，不做 `CULTURE_SINCE`；霧竹指派（最近未進入、ver ≥ 2）是 M4。
- **Q15**（Task 18）：錨點優先於 P11 保證小屋 / 遺跡；`guard()` 在剩下的槽重找，仍各 ≥ 1（測試）。
- **Q16**（Task 7、14、19；2026-10-26 修訂 T21-12）：小點位排除家鄉沙灘、出生點清空區、坑道 ±(SHAFT_HALF + 2)、湖藍圖外框；`spawn_tablet` 移到 ± 80 之外的 MINOR 槽；M1 `blueprint.test.ts` 列入並保持綠——其中「含坑道的槽沒有非 DEEP 藍圖」那條斷言修訂為排除 MINOR 層（小點位可放進含坑道的槽：入口不在 minorZone、外框在 shaftBand 外，由新增的正向斷言與 SHAFT_REACH 距離斷言把關）。修訂理由：Q16 是作者自訂規則，字面不能壓過規格 §4.4「任意 340 格內有東西」（對任意種子成立）。
- **Q17**（Task 13、17）：量測測試印出後斷言（礦物密度對記錄值 ±30%、tile 集合相等），逾時 300 s；沒有只印不驗的測試。
- **Q18**（Task 2、7、8、10、11、12、13、20）：重測試一律寫逾時；Task 8 / 12 的共用 fixture 用 `beforeAll(…, timeout)`。
- **Q19**（M2b Task 8）：退役表加 `FOLK_BEFORE`。
- **Q20**：(a) Task 8 地城的召喚 / 鑰匙內容 = 舊地城（陶罐 / 箱子鑰匙、上鎖寶箱、wick_offering 金礦路徑），有測試；(b) Task 18 荒野大陸的隱士小屋（隱士角色在 Task 18 建、Task 20 加 chart）；(c) 海上遠景已在 M1 Task 4 完成；(d) 鳥巢礁延到 1b 之後，記入 spec §8。
- **Q21**（Task 20）：燈塔測試明確挑 `type === 'lighthouse'` 的島。
