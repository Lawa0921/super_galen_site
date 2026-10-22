# DELVE 連線 M-B3：LoopbackNet、NetHost／NetGuest、按 chunk 同步與 checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一個行程裡兩個（或三個）獨立的 `DelveGame`——房主（mode `host`）與客人副本（mode `replica`）——透過可注入延遲／丟包／亂序的 `LoopbackNet` 連起來，世界、物品與位置都收斂到一致；斷線重連可以接著玩；房主的模擬由計時器驅動、不依賴 rAF；單機逐位元組不變。

**Architecture:** `delve/net/` 是新的純邏輯層（不碰 DOM）。`link.ts` 定義三通道的 `NetLink` 介面（M-C 的 WebRTC `MultiChannelTransport` 實作同一個介面），`loopback.ts` 是測試用的記憶體實作。`chunkSync.ts` 只依賴 `World`：雜湊、整欄回覆、日誌批次上線格式、客人端的 rev 表與暫存。`host.ts`／`guest.ts` 是兩端的協定狀態機，每一幀由 `frame(nowMs, steps)` 推進（先處理收件匣、再跑 `steps` 個固定步、最後依計時送出），時鐘一律由呼叫端傳入，所以測試可決定性重現。引擎只加最少的掛鉤：host 模式下遠端 actor 用回報的位置取代積分、replica 模式只積分本地 actor 的移動、`exec` 在 replica 轉送給房主。

**Tech Stack:** TypeScript、vitest（happy-dom）、Playwright（只做單機回歸）。不加 npm 套件。

**Spec:** `docs/superpowers/specs/2026-10-20-delve-coop-design.md` §5.2–5.7（2026-10-21／22 無限世界修訂版）、§6 M-B、§7 R2／R4／R5／R6／R11、§10 D1–D6 與「M-B3 進場清單」。前兩段：`docs/superpowers/plans/2026-10-21-delve-coop-mb1-multi-actor.md`、`docs/superpowers/plans/2026-10-21-delve-coop-mb2-journal-exec.md`；世界模型：`docs/superpowers/plans/2026-10-21-delve-infinite-1a-chunked-world.md` B1–B8。M-C 才做 WebRTC、信令、大廳與遠端渲染。

## Global Constraints

- 單機逐 tick 不變：`engine/actor.golden.test.ts` 的 GOLDEN／GOLDEN2 與 `engine/world.central.test.ts` **一字不改**地通過；存檔格式與 `snapshotGame` 輸出形狀不變（新欄位一律不存檔）。既有測試零修改，或只有機械性修改（本計畫列出的只有：`removeActor` 回傳值加 `.character`、`exec.test.ts` 兩次 `place` 之間多跑幾步、`writeChunk(…, false)` 改 `{ journal: false }`）。
- 只在 `mode !== 'solo'` 時才會走到的新程式碼不得改變任何 RNG 呼叫順序或事件序列；只在單機也會走到的改動（Task 1、2）必須證明 golden 不變。
- 決定性：`net/` 內不呼叫 `Date.now`／`performance.now`／`Math.random`；時間一律是 `frame(nowMs, …)` 傳進來的值，亂數用 `engine/rng.ts` 的 `Rng`（種子字串）。`LoopbackNet` 在同一個種子與同一串呼叫下逐位元組重現。
- 通道語意（spec §5.4）：`ctrl` 可靠有序（JSON 字串）、`bulk` 可靠有序（二進位）、`state` 不可靠無序（JSON 字串，舊的就丟）。v1 用 JSON，`bulk` 用二進位；量化留給 M-D。
- 頻率（spec §5.4，建造者可調）：`ps` 20 Hz、`ws` 15 Hz、`liq` 5 Hz；checkpoint 每 30 秒（= `AUTOSAVE_INTERVAL_MS`）加跨邊界操作立即送；跨邊界操作後世界存檔 2 秒防抖。
- 房主收到的一切都是不可信輸入：先過驗證（新物件、只拷貝已知欄位、有限數、範圍、列舉），不合法就丟掉，絕不拋例外到迴圈外。客人信任房主（反目標：不做防作弊），但解析失敗一樣只丟掉該則訊息。
- 不加 npm 套件；程式註解與 UI 文字用繁體中文；禁 `!important`、禁行內樣式。
- 測試：`npx vitest run <path>`（絕不用 `npm test`）。每個 task 結束前：`npx vitest run` 全套綠、`npx playwright test tests/e2e/delve.spec.ts --project=chromium` 全綠、`npx tsc --noEmit -p tsconfig.json` 在 `src/scripts/games/delve` 與 `tests/e2e/delve.spec.ts` 沒有**新增**錯誤（Task 1 Step 0 先錄基準到 session scratchpad，不放進 repo）。
- 行尾維持各檔原樣。本計畫會碰到的 CRLF 檔：`engine/game.ts`、`engine/world.ts`、`render/main.ts`、`render/model.ts`、`render/model.test.ts`、`save/character.ts`、`save/serialize.ts`。其餘會碰到的（`engine/actor.ts`、`engine/commands.ts`、`engine/entities.ts`、`save/worldSave.ts`、`save/character.test.ts`、`engine/actors*.test.ts`、`engine/exec.test.ts`、`engine/toss.test.ts`、`engine/world.edits.test.ts`）是 LF；新檔用 LF。
- 路徑：`engine/…`、`render/…`、`save/…`、`net/…` 都在 `src/scripts/games/delve/` 底下（`net/` 是新目錄）。
- Conventional Commits，最後一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Builder decisions（Claude 代為決定，使用者可推翻）

- **C1 傳輸介面。** `NetLink` 是一個對等端點：`send(ch, data)`、`onMessage`、`onClose`、`close`、`buffered(ch)`。分片（≤ 16 KB）與 `bufferedAmount` 屬於 M-C 的 RTC 實作；`NetLink.send` 接受任意大小。`LoopbackNet` 是 delve 自己的新檔，**不改** `tetris/net/transport.ts`（那是單通道字串介面，tetris／bomber 在用；spec §9 允許決定不共用）。
- **C2 收件匣。** 兩端的 `onMessage` 只把訊息排進收件匣；`frame()` 開頭依到達順序處理。真網路（M-C）的事件在兩幀之間到達，效果一樣。
- **C3 rev 與三種狀態**（spec §5.5 第 6 點、§5.6 第 5 點）。客人端每個 chunk 是 `unsynced`（那欄不在同步集合裡 → 收到的 `tiles` 直接丟）、`pending`（已送 `sum` 等回覆，或收到 `full` 標記等整塊 → 暫存 `tiles`）、`live`（只套 `rev` 比目前大的批次）。整塊（`col` 的差異 chunk、`chunk`）套上後，只重放暫存裡 `rev` 比整塊新的批次。房主把日誌的 `full` 批次以「只有標記、沒有格子」的形式放進 `ctrl` 的 `tiles`，同時在 `bulk` 送 `chunk`：標記先到 → 客人轉 `pending` 等資料；資料先到 → 標記的 rev 不大於目前值，忽略。
- **C4 `sum` 的回覆是整欄一則**（`bulk` 的 `col`）：38 個 chunk 的目前 rev，加上雜湊不同的那些 chunk 的資料與箱子，一次送完。這樣「雜湊相同」的 chunk 也知道基準 rev（spec 只說不同才回，但客人需要相同那些的 rev 才能結束暫存）。
- **C5 雜湊含箱子。** `chunkSum` = FNV-1a 32 位元，依序吃六層（fg、wall、liquid、liquidType、frozen、half，各 1024 B），再吃這個 chunk 內每個箱子（tile 鍵升冪；`JSON.stringify(slots)` 的 UTF-16 碼元 + `unlocked` 旗標）。理由：箱子被拿空但格子沒變時，只比六層會漏掉（spec §5.6 第 3 點只說六層）。
- **C6 興趣範圍**（spec §10 D3）。`ws` 只含房主端該客人位置左右 `LOAD_COLS`（6）欄內的東西。`tiles`／`liq` 用較寬的 `NET_TILE_COLS = UNLOAD_COLS + 2`（13）欄：客人用自己的（領先半個 RTT 的）位置判斷同步集合，最遠到 `UNLOAD_COLS`；房主用落後的位置，多 2 欄才保證是客人手上那些欄的超集合。客人端：欄進入自己 `LOAD_COLS` 內就送 `sum`、離開 `UNLOAD_COLS` 就忘掉（清 rev、暫存、改回 `unsynced`），中央欄常駐也一樣忘掉（spec §10 D4 的「回來時重新比對」）。
- **C7 事件分送不用 `drainAll`。** spec §5.2 說房主用 `drainAll()` 分送，但 `drainAll` 會把本地玩家的游標一起跳到最後，房主自己的 HUD 會漏事件（與現行引擎衝突）。改成每位客人各用 `drainEvents(guestPid)`：拿到的正好是「公開 + 他自己的私人事件」，分成 `ev`（`pid === 他`）與 `pub`（其餘）送出。v1 不依位置過濾公開事件（座標單位不一，數量少）。
- **C8 客人離線、逾時與重連**（spec §5.7、U9）。逾時 `GUEST_TIMEOUT_MS = 90_000`：spec §5.4 說重用 `tetris/net/silence.ts` 的 30 秒，但 U9 要求容忍 Chrome 背景強化節流（約 1 分鐘醒一次），30 秒會誤判斷線——取 90 秒、10 秒起警示（重用 `SILENCE_WARN_MS`）。超過 `PS_STALE_MS = 500` 沒收到 `ps`：房主放開該 actor 的挖／用（角色原地不動、照樣會受傷，U9）。連線關閉（`onClose`）立刻移除 actor；靜默逾時也移除。兩者都把 `visit` 寫回世界、把最後的角色留在 `retained[charId] = { character, rev }`（spec「保留它最後的 char rev」）。同一個 charId 再 `hello`：還在線上且沒逾時 → `reject charInUse`；否則加入，角色取 `retained` 與 hello 帶來的兩者中 rev 較大的那份（房主那份較新 → 斷線前撿到但還沒 checkpoint 的東西不會丟）。寬限期內保留 actor 原地重接是 M-D，不在本段。
- **C9 checkpoint rev。** 房主每位客人一個 `charRev`，從 hello 角色的 `rev` 起算，每送一次 `chk` 加 1，且 `chk.character.rev === chk.rev`。客人只把 `chk` 交給 `onCheckpoint`（M-C 寫 IDB，1 秒防抖），絕不存本地預測狀態。跨邊界指令（`BOUNDARY_OPS`）與「撿到有詞條的裝備」（該客人的 `pickup` 事件帶 `rarity`）在同一幀結束時立刻送 `chk`，並觸發 `requestSave` 的 2 秒防抖。
- **C10 角色快照不走 `snapshotGame`。** `removeActor` 現在用 `splitSnapshot(snapshotGame(…))` 拍角色——那會序列化整個世界的 chunk，5 Hz 的 `char` 同步與每次 checkpoint 都這樣做太貴（與現行引擎衝突）。新增 `characterOf(pid)`／`visitOf(pid)` 直接從 actor 欄位組出 `DelveCharacter`／`VisitSave`（欄位對應同 `splitSnapshot`），用測試證明與舊路徑相等（`savedAt`／`lastSeen` 除外）。`char` 每 1/5 秒比較 `JSON.stringify(characterOf(pid))`，不同才送。
- **C11 遠端移動**（spec §5.3）。客人每則 `ps` 帶位置與輸入；房主用 `net/motion.ts` 的 `checkMove` 檢查（速度上限與不卡進實心），通過就 `setRemoteMotion`；host 模式下遠端 actor 的玩家段以它取代 `stepPlayer`／`stepBoating`（技能、摔落、液體、挖、打、用照跑）。不通過：`teleSeq` 加 1（不移動），由房主送 `teleport{x, y, tseq}` 把客人拉回。房主端的 `teleport()`（重生、傳送、回城、旅行）與擊退也各有計數器（`teleSeq`、`knockSeq`），fanout 時比對、送 `teleport`／`knock`。客人在 `ps.tseq` 回報最後收到的 tseq，房主忽略 tseq 舊的 `ps`。這些計數器純加法、不存檔、不碰 RNG，單機等價。
- **C12 客人副本跑什麼**（spec §5.2 第 1、3 點、§5.3）。replica 的 `step`：串流（不停放，D4）→ tick／time → 本地 actor 若活著：`preMoveSkills` → `stepPlayer`／`stepBoating` → `postMoveSkills`（**不打**震地衝擊波）→ `knockT`／`iframes` 倒數 → `updateExploration`。不跑液體、結冰、換日副作用、怪物／掉落物／投射物／NPC／據點、經驗換算（`flushLevels` 在 replica 是空操作：經驗來自房主的 `char`）。怪物、掉落物、投射物、NPC 的列表由 `NetGuest` 依 `ws` 內插後直接寫進 replica 的 `enemies`／`drops.list`／`projectiles.list`／NPC 位置，現有 renderer 不必改就畫得出來（M-C 再畫遠端玩家）。
- **C13 replica 的 `exec`。** `exec(localPid, cmd)` 在 replica 交給 `cmdSink` 並回傳 `CMD_PENDING[op]`（該型別中性、不觸發錯誤提示的值）；技能（`op: 'skill'`）另外在本地執行一次當移動預測（突進位移由客人權威）。失敗提示不必另外處理：房主執行時發出的 `blocked` 等私人事件會經 `ev` 回來。R11 的「不在白名單的直接呼叫 throw」不另做執行期守衛，由 M-B2 的 `render/execRoutes.test.ts` 掃描把關。
- **C14 放置**（spec §5.5、M-B2 B3）。手上是可放置物且瞄準格不是可互動物（`isInteractive`）、沒有 NPC 時，客人遮掉 `ps.use`，改送 `cmd place`；只有單格方塊（`ITEMS[item].place` 定義、不是門／床／箱子／家具／成對家具，瞄準格是空氣、在觸及範圍內、不壓到自己）才樂觀套用，記 `pending[seq] = { x, y, old, placed }`；本地冷卻 `PLACE_COOLDOWN`。`ack ok:false` 時，如果那格仍是 `placed` 就還原成 `old`（期間房主的 `tiles` 改過那格就不動）。房主端 `place` 指令依進場清單擋掉死亡、划船、`placeCooldown` 未到，成功後設 `placeCooldown`；遠端 actor 的觸及距離多給 `REMOTE_REACH_SLACK = 1.5` 格。全部指令每位客人一個權杖桶：每秒 `CMD_RATE = 30`、上限 `CMD_BURST = 60`，超過回 `ack{ ok: false, reason: 'rate' }`。
- **C15 世界層級狀態**（spec §5.6 第 2 點）。`snapshotWorld` 只拿元件自己的 `toJSON`（與 `snapshotGame` 同一批序列化函式），不呼叫 `snapshotGame`。加入時送一次；之後房主每秒算一次 `worldSig`（去掉 NPC／旅人座標後的 FNV-1a），變了才重送 `world`（NPC 位置走 `ws`）。
- **C16 世界層級權限**（進場清單第 4 項）。據點藥師的祝福改成**每個玩家每天一次**：本地 actor 照舊讀寫 `perkDays.healer`（存檔欄位），其他 actor 用不存檔的 `PlayerActor.healerDay`。委託清單共用（spec Q3）：任何人都能接、能交，獎勵給交的人；沒有「放棄」指令，不另設房主專屬指令。和平模式本來就不在 `Cmd` 裡，只有房主能切換。
- **C17 M-B1 遺留**。`DelveOptions.localPid`／`mode`；`removeActor` 回傳 `{ character, visit }`；`addActor` 吃 `visit`；多人時「沒人在等了」也發一次 `sleep wait`（`ready: 0`），HUD 才收得掉提示；天氣特效的中心改成「天氣錨點」（本地 actor 活著 = 本地；非單機時本地死了 = 第一個活著的 actor；單機死亡時照舊沒有）；委託的 `progress`／`ready`／`failed` 改在世界段發（公開），`accept`／`done` 維持給做的人；挖掉床時，把那張床設成重生點的**每個** actor 都清掉並各自收到 `spawn set:false`。
- **C18 房主不暫停**（U8、R2）。`net/loop.ts` 的 `NetLoop` 用可注入的 `Ticker` 推進 `FixedStepper`（`HOST_MAX_FRAME_S = 1.0`：計時器被節流到 1 秒一次時一次補 60 步，不掉速）；M-B3 附 `intervalTicker`（`setInterval`），M-C 換成 Worker 計時器並實測。`render/main.ts` 在 `mode !== 'solo'` 時 rAF 只畫不跑模擬，選單／地圖／技能樹／對話／梳妝台／轉生的暫停只放開按鍵（M-B1 遺留：「衣櫥／轉生面板在連線時不能暫停」）。
- **C19 不在本段**：`importWorld` 重複匯入同一個世界檔會得到相同 `worldId`——spec 沒有把它排進 M-B3，目前也沒有任何東西依賴 worldId 唯一（`welcome.worldId` 只是資訊），留給 M-C 開房選世界時處理。客人挖掘裂紋的外觀預測、遠端紙娃娃、`chat`、客人送 `look` 都是 M-C／M-D。

## Review Focus

1. **跨通道亂序**：`tiles`（ctrl）比 `col`／`chunk`（bulk）早到或晚到、`full` 標記比資料早到或晚到、同一 chunk 兩批 rev 顛倒 → 最後都與房主逐格相同，舊批次不會蓋掉新資料 → Task 5 的亂序表格測試。
2. **客人回報的垃圾移動**：`ps` 裡 NaN／Infinity、一步瞬移 500 格、身體埋進石頭、tseq 舊的 → 房主不當機、不採用、送 `teleport` 把人拉回；之後的合法 `ps` 照常採用 → Task 6（`checkMove`）+ Task 8（tseq）。
3. **客人送來的垃圾訊息與洪水**：不是 JSON、未知 `t`、`sum` 的 `cx` 超出邊界或陣列長度錯、每秒 500 則 `cmd` → 房主丟掉或回 `rate`，不拋例外，其他客人不受影響 → Task 8。
4. **靜默斷線後重連**：撿了東西但還沒 checkpoint 就斷線，重連 → 東西還在（不丟也不複製）、位置是斷線前的 visit、rev 表重來 → Task 11 A7。
5. **兩個客人同時改同一格**：A 放、B 挖同一格同一刻 → 以房主收到的順序為準，房主與兩個副本三方一致 → Task 11 A2。

---

### Task 1：M-B2 進場清單（place 守門、丟出結束挖掘、掉落物淘汰順序、`writeChunk` 選項）

**Files:**
- Modify: `engine/game.ts`（`runCmd` 的 `place` 約 1046 行；`tossSlot` 約 2368 行）、`engine/entities.ts`（`DropList.spawn` 129、152 行的 `shift()`）、`engine/world.ts`（`writeChunk` 303 行）、`save/serialize.ts`（933 行的呼叫端）、`engine/world.edits.test.ts`（90 行，機械性）、`engine/exec.test.ts`（152–163 行，機械性）
- Test: `engine/toss.test.ts`、新 `engine/drops.evict.test.ts`、`engine/exec.test.ts`

**Interfaces — Produces:**
```ts
// engine/world.ts
export interface WriteChunkOpts { /** 編輯日誌把這個 chunk 標 full（預設 true；讀檔還原傳 false） */ journal?: boolean }
writeChunk(cx: number, cy: number, d: ChunkData, opts?: WriteChunkOpts): void;
// engine/entities.ts：超過 MAX_DROPS 時淘汰「最舊的沒有 owner 或 ownerDelay ≤ 0 的堆」，都沒有才淘汰最舊的
```

- [ ] **Step 0：錄型別基準**：`npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/scripts/games/delve|tests/e2e/delve.spec.ts" > <scratchpad>/tsc-base.txt`。
- [ ] **Step 1：寫失敗測試**
  - `engine/exec.test.ts` 新增 `place 守門`：arena，B 在 (50, 59)、第 1 格 10 個 dirt。`exec('b', place 52)` → `true`；**緊接著** `exec('b', place 53)` → `false`（冷卻），dirt 剩 9；`steps(g, 8)` 後 `place 53` → `true`。B 死亡（`withActor(b, () => g.hp = 0)` 再 `steps(g, 1)`）→ `false`。B `boating = true` → `false`。既有 `place` 測試在第二次呼叫前加 `steps(g, 8)`（機械性）。
  - `engine/toss.test.ts` 新增 `丟掉手上的工具會結束挖掘`：選中第 0 格鎬子、`setAim` 到泥土、`setMining(true)` 跑 10 步（`g.cur.mining !== null`）→ `act({ op: 'toss', slot: 0 })` → 還沒 `step` 就 `g.local.mining === null`。`丟掉釣竿會收線`：拋竿後 `act toss` 那格 → `steps(g, 1)` 後 `g.local.fishing === null`。
  - `engine/drops.evict.test.ts`：`new DropList()`；先丟 1 堆帶 owner（`{ pid: 'h', delay: 1.5 }`）的 `torch`，再丟 `MAX_DROPS` 堆不同位置的一般 `dirt` → owner 那堆還在、最舊的 dirt 被淘汰；全部都是 delay > 0 的 owner 堆時 → 淘汰最舊的；`step` 讓 ownerDelay 歸零後再塞 → 那堆照一般順序被淘汰。
  - `engine/world.edits.test.ts` 90 行改成 `w.writeChunk(0, 0, w.readChunk(0, 0)!, { journal: false })`（機械性），斷言不變。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/engine/exec.test.ts src/scripts/games/delve/engine/toss.test.ts src/scripts/games/delve/engine/drops.evict.test.ts src/scripts/games/delve/engine/world.edits.test.ts`。預期：冷卻那條、淘汰那條 FAIL；挖掘那條若現在已經會結束就 PASS（那就只留測試）。
- [ ] **Step 3：實作**：`place` 在 `selectOf` 之前回 `false` 的三個條件、成功後 `placeCooldown = PLACE_COOLDOWN`；`tossSlot` 丟的是 `inventory.selected` 那格時 `mining = null`（釣竿交給 `updateFishing` 既有的「沒拿釣竿」路徑，沒有就呼叫同一個收線 `end('reel')`）；`DropList` 私有 `evict()` 取代兩處 `shift()`；`writeChunk` 改選項物件，`serialize.ts:933` 改 `{ journal: false }`。
- [ ] **Step 4：跑測試確認通過**：上面四檔 PASS；`npx vitest run src/scripts/games/delve/engine/actor.golden.test.ts src/scripts/games/delve/engine/world.central.test.ts` PASS；全套 vitest、delve e2e、tsc 無新增錯誤。
- [ ] **Step 5：Commit** `fix(delve): gate exec place, end mining on toss, evict ownerless drops first`

### Task 2：M-B1 遺留（localPid／mode 選項、visit 進出、睡覺、天氣錨點、委託、床、藥師）

**Files:**
- Modify: `engine/game.ts`（建構子 795–800；`addActor` 967；`removeActor` 992；`breakTile` 1457；`emitSleepWait` 1953；`stepActor` 1211 的天氣；`talkTo` 3772；委託事件 4364、4374、4378）、`engine/actor.ts`（`healerDay`）、`engine/actors.test.ts`／`engine/actors.sleep.test.ts`／`engine/actors.world.test.ts`（`removeActor(...)` 的回傳值用法，機械性）
- Test: Create `engine/actors.mb3.test.ts`

**Interfaces — Consumes:** M-B1 `addActor`／`withActor`／`emit`／`inWorld`；`save/worldSave.ts` 的 `VisitSave`（只 `import type`）。**Produces:**
```ts
// DelveOptions
localPid?: Pid;     // 省略 = SOLO_PID（'h'）
mode?: GameMode;    // 省略 = 'solo'
// DelveGame
addActor(pid: Pid, character: DelveCharacter, at?: { x: number; y: number } | null, visit?: VisitSave): PlayerActor;
removeActor(pid: Pid): { character: DelveCharacter; visit: VisitSave };
characterOf(pid: Pid, now?: number): DelveCharacter;   // C10：不經 snapshotGame
visitOf(pid: Pid, now?: number): VisitSave;
// PlayerActor
healerDay: number;  // 預設 -1；不存檔（C16）
```
`addActor` 有 `visit` 時：先 `ensureAround` visit 位置的 tile 欄，把身體放到 `visit.pos`（px），載入 `explored`（`ExploredMap.decode`，含 `exploredOuter`）、`markers`、`discovery`、`bed`（床頭格還在才留）、`spawnCore`、`vitals`；沒有 `visit` 走現在的路徑。`removeActor` = `flushLevels` → `{ character: characterOf(pid), visit: visitOf(pid) }` → 刪除。

- [ ] **Step 1：寫失敗測試** `engine/actors.mb3.test.ts`（arena 與 `hero()` 同 `engine/actors.test.ts`）：
  - `localPid 與 mode 選項`：`new DelveGame({ seed: 'mb3', width: 160, height: 100, localPid: 'p1', mode: 'replica' })` → `g.localPid === 'p1'`、`g.local.pid === 'p1'`、`g.mode === 'replica'`、`actors.size === 1`；不給 → `'h'`／`'solo'`。
  - `characterOf 等於舊路徑`：B 加入、給 `wood` 與一件 `giveGear('iron_sword', 2)`、`addXp(500)` → `characterOf('b')` 去掉 `savedAt` 後 `toEqual` `splitSnapshot(snapshotGame(g, 0), who, where, 0).character`（在 `withActor(b)` 下拍）；`visitOf('b')` 去掉 `lastSeen` 後等於同一份快照的 `world.header.visits[who.id]`。
  - `removeActor 回傳 visit、addActor 吃回去`：B 走到 (60, 59)、在 (62, 59) 放床頭並 `useBed`（白天也記床）、標一個 marker → `removeActor('b')` 的 `visit.pos.x` 等於 B 的 px、`visit.bed` 等於 `{ x: 62, y: 59 }`；`addActor('b', character, null, visit)` → B 的身體 px 與移除前相同、`bed`、`markers` 相同、`explored.isRevealed(60, 59)` 為 true。
  - `沒人在等了也通知`：夜晚、A 上床（`sleepWaiting()` 是 `{ 1, 2 }`、事件 `sleep wait ready 1`）→ A `setMoveX(1)` 一步 → `drainEvents('b')` 含 `{ type: 'sleep', phase: 'wait', ready: 0, total: 2 }`；單 actor 夜晚上床再起來 → 沒有任何 `phase: 'wait'` 事件。
  - `天氣錨點`：`mode = 'host'`、兩人、`forceWeather('storm')`、站在地表；本地 `hp = 0` 進入死亡、`g.local.respawnT = 999`（一直死著）→ 跑 1800 步內有 `lightning` 事件；同樣設定但只有本地一人（單機）→ 1800 步內沒有 `lightning`（現行行為）。
  - `委託進度是公開的`：兩人；A 接一個擊殺委託（`acceptQuest`）→ `accept` 只在 `drainEvents('h')`；擊殺推進後 `progress` 事件兩邊都有、沒有 `pid`。
  - `挖掉別人的床會通知他`：B 的床在 (62, 59)；A `mineInstant(62, 59)` → `actors.get('b')!.bed === null`、`drainEvents('b')` 含 `{ type: 'spawn', set: false }` 且 `pid: 'b'`、`drainEvents('h')` 沒有這則私人事件。
  - `藥師祝福每人每天一次`：據點有藥師（沿用 `game.settle.test.ts` 的 fixture 寫法）；A 說話 → A 有 `bless`；同一天 B 說話 → B 也有 `bless`；A 再說話 → 不重給；隔天 A 再說 → 再給；`perkDays.healer` 只跟著 A（本地）變。
  - golden：`npx vitest run src/scripts/games/delve/engine/actor.golden.test.ts` 仍 PASS（同一個 step 也跑）。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/engine/actors.mb3.test.ts` FAIL（`localPid` 被忽略、`removeActor` 回傳角色、沒有 `ready: 0`…）。
- [ ] **Step 3：實作**（C10、C16、C17）。天氣錨點在每步的 actor 迴圈前算一次（`weatherAnchor(): PlayerActor | null`），呼叫位置維持在該 actor 的 `stepActor` 原處（`updateVitals` 之後），單機的呼叫時機因此不變。三個既有測試檔裡 `g.removeActor('b')` 若用到回傳值，改 `.character`（機械性）。
- [ ] **Step 4：跑測試確認通過**：新檔 PASS；golden、central、`engine/actors*.test.ts`、全套 vitest、delve e2e PASS；tsc 無新增錯誤。
- [ ] **Step 5：Commit** `feat(delve): actor visits in and out, wake-up notices and per-player healer blessing`

### Task 3：`NetLink` 與 `LoopbackNet`

**Files:**
- Create: `net/link.ts`、`net/loopback.ts`、`net/loopback.test.ts`

**Interfaces — Produces:**
```ts
// net/link.ts
export type Channel = 'ctrl' | 'bulk' | 'state';
export type Payload = string | Uint8Array;
export interface NetLink {
  readonly open: boolean;
  send(ch: Channel, data: Payload): void;             // 關閉後靜默丟掉
  onMessage(cb: (ch: Channel, data: Payload) => void): void;
  onClose(cb: (reason: string) => void): void;
  close(reason?: string): void;                        // 兩端都觸發 onClose（各一次）
  /** 這個方向還沒送達的位元組數（bulk 背壓；M-C = RTCDataChannel.bufferedAmount） */
  buffered(ch: Channel): number;
}
// net/loopback.ts
export interface LoopbackOptions {
  seed?: string;                 // 預設 'loopback'
  latencyMs?: [number, number];  // 單程延遲均勻分布，預設 [0, 0]
  loss?: number;                 // 0..1：state 丟包率；ctrl / bulk 以同機率多等 retransmitMs（可靠通道不丟）
  retransmitMs?: number;         // 預設 200
  reorder?: boolean;             // state 每則各自抽延遲（會亂序）；預設 true。ctrl / bulk 永遠有序
}
export class LoopbackNet {
  constructor(opts?: LoopbackOptions);
  readonly now: number;                               // 虛擬時鐘（ms）
  pair(): { host: NetLink; guest: NetLink };
  advance(ms: number): void;                          // 時鐘前進並送達到期訊息（送達時間升冪；同時間依送出順序）
  flush(): void;                                      // 送達全部在途訊息，時鐘跳到最後一筆
  sever(link: NetLink, reason?: string): void;        // 斷網：在途全丟，兩端 onClose
  stats(): { sent: number; dropped: number; delivered: number };
}
```
可靠通道：`deliverAt = max(上一則同方向同通道的 deliverAt, now + 延遲 + 重傳等待)`。送出時 `Uint8Array` 先複製，收方拿到的不是同一個 buffer。

- [ ] **Step 1：寫失敗測試** `net/loopback.test.ts`：
  - `零延遲：advance(0) 才送達、不在 send 裡同步回呼`：`send` 之後回呼次數 0；`advance(0)` 後 1。
  - `可靠通道有序`：`latencyMs: [50, 150]`、`loss: 0.5`；`ctrl` 送 200 則序號 → `flush()` 後收到的序號正好 0..199 依序；`bulk` 同樣。
  - `state 丟包率`：`loss: 0.3`、送 10 000 則 → `dropped / sent` 在 0.27–0.33；`reorder: true` 時收到的序號不是單調遞增；`reorder: false` 時單調。
  - `延遲範圍`：`[100, 200]`；在 t = 0 送一則 `ctrl`，`advance(99)` 沒收到、`advance(101)` 收到。
  - `決定性`：同一個 seed、同一串 send／advance → 兩次收到的 `(時間, 通道, 內容)` 序列 `toEqual`；換 seed 不同。
  - `複製 Uint8Array`：送出後改原陣列 → 收到的內容是改之前的。
  - `close 與 sever`：`host.close('bye')` → 兩端 `onClose` 各一次、`open === false`、之後 `send` 不送達；`sever` 丟掉在途訊息（`stats().dropped` 增加）。
  - `buffered`：`bulk` 送 3 則 1000 B、延遲 100 → `buffered('bulk') === 3000`；送達後 0。
  - `多對`：`pair()` 兩次，A 對的訊息不會出現在 B 對。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/net/loopback.test.ts`（模組不存在）。
- [ ] **Step 3：實作** `net/link.ts`、`net/loopback.ts`（在途佇列用一個依 `(deliverAt, 送出序號)` 排序的陣列；亂數用 `new Rng(seed)`）。
- [ ] **Step 4：跑測試確認通過**：該檔 PASS；全套 vitest。
- [ ] **Step 5：Commit** `feat(delve): three-channel NetLink and a deterministic loopback network`

### Task 4：協定型別、二進位編碼、房主端輸入驗證、嚴格角色驗證

**Files:**
- Create: `net/protocol.ts`、`net/codec.ts`、`net/validate.ts`、`net/codec.test.ts`、`net/validate.test.ts`
- Modify: `save/character.ts`（新增 `validateCharacterStrict`）、`save/character.test.ts`

**Interfaces — Consumes:** Task 3 的 `Payload`；`engine/commands.ts` 的 `Cmd`、`validCmd`。**Produces:**
```ts
// net/protocol.ts
export const PROTO = 1;
export const MAX_GUESTS = 3;                    // MAX_PLAYERS 4（含房主）
export const PS_HZ = 20, WS_HZ = 15, LIQ_HZ = 5, CHAR_HZ = 5;
export const WORLD_SIG_MS = 1000, LOOK_MS = 1000, CHK_MS = 30_000, SAVE_DEBOUNCE_MS = 2000;
export const GUEST_TIMEOUT_MS = 90_000, HOST_TIMEOUT_MS = 90_000, PS_STALE_MS = 500;   // C8
export const INTERP_DELAY_MS = 100, CMD_RATE = 30, CMD_BURST = 60, REMOTE_REACH_SLACK = 1.5;
export const NET_TILE_COLS = UNLOAD_COLS + 2;  // C6
export const BULK_HIGH_WATER = 256 * 1024;      // bulk 在途超過就排隊（R6）
export type RejectReason = 'full' | 'proto' | 'gen' | 'charInUse' | 'closed' | 'char';
export type ByeReason = 'leave' | 'closed' | 'timeout';
export const PS_GROUND = 1, PS_BOAT = 2, PS_CLIMB = 4;           // Ps.flags 位元
export type WireChest = [key: number, slots: (Stack | null)[] | null, unlocked: 0 | 1];
export interface WireBatch { chunk: number; rev: number; tiles: number[]; chests: WireChest[]; full: boolean }
export interface PeerInfo { pid: Pid; nick: string; look: DollLook }
export interface Welcome { t: 'welcome'; pid: Pid; worldId: string; seed: string; genVersion: number; outerGenVersion: number;
  bounds: WorldBounds; w: number; h: number; time: number; tick: number; peaceful: boolean; you: { x: number; y: number }; players: PeerInfo[] }
export interface Ps { t: 'ps'; seq: number; tseq: number; x: number; y: number; vx: number; vy: number; flags: number;
  facing: 1 | -1; aim: [number, number]; mine: boolean; use: boolean; slot: number }
export interface WsPlayer { pid: Pid; x: number; y: number; vx: number; vy: number; facing: 1 | -1; hp: number; maxHp: number; mana: number; dead: boolean }
export interface WsEnemy { id: number; kind: EnemyKind; x: number; y: number; dir: 1 | -1; hp: number; maxHp: number; state: string }
export interface WsDrop { id: number; item: ItemId; count: number; x: number; y: number }
export interface WsProj { id: number; kind: ProjKind; x: number; y: number; vx: number; vy: number; hostile: boolean }
export interface WsNpc { id: number; src: 0 | 1; x: number; y: number; dir: 1 | -1 }   // src 0 = 據點居民、1 = 世界 NPC
export interface Ws { t: 'ws'; tick: number; time: number; players: WsPlayer[]; enemies: WsEnemy[]; drops: WsDrop[]; proj: WsProj[]; npcs: WsNpc[] }
export type HostCtrl = Welcome | { t: 'reject'; reason: RejectReason } | { t: 'tiles'; tick: number; batches: WireBatch[] }
  | { t: 'ev'; list: DelveEvent[] } | { t: 'pub'; list: DelveEvent[] } | { t: 'ack'; seq: number; ok: boolean; reason?: string }
  | { t: 'char'; rev: number; character: DelveCharacter } | { t: 'chk'; rev: number; character: DelveCharacter }
  | { t: 'look'; pid: Pid; nick: string; look: DollLook } | { t: 'gone'; pid: Pid }
  | { t: 'teleport'; x: number; y: number; tseq: number } | { t: 'knock'; vx: number; vy: number; dur: number }
  | { t: 'world'; snap: WorldSnap } | { t: 'bye'; reason: ByeReason };
export type GuestCtrl = { t: 'hello'; proto: number; build: string; charId: string; nick: string; character: unknown }
  | { t: 'ready' } | { t: 'cmd'; seq: number; cmd: Cmd } | { t: 'sum'; cx: number; sums: number[] } | { t: 'bye'; reason: ByeReason };
// bulk 的標頭（payload 另外帶）
export interface WorldSnap {        // spec §5.6 第 2 點：只有世界層級（Task 7 產生 / 套用）
  time: number; tick: number; peaceful: boolean;
  unlocked: number[]; keysUsed: number; bosses: string[]; kills: Partial<Record<EnemyKind, number>>;
  bossActive: EnemyKind | null; weather: EnvSave['weather'] | null; minedIce: number[];
  settle: SettlementJSON; folk: FolkJSON; quests: QuestLogJSON;
  scoutMarks: ScoutMark[]; perkDays: { guide: number; healer: number }; scouted: string[]; stones: number[];
  visit: VisitSave | null;           // 只有加入時給該客人的那份帶；之後重送的 world 一律 null
}
export type BulkHead = { t: 'snap'; snap: WorldSnap } | { t: 'col'; cx: number; revs: number[]; diff: { cy: number; chests: WireChest[] }[] }
  | { t: 'chunk'; key: number; rev: number; chests: WireChest[] } | { t: 'liq'; chunks: number[] };
// net/codec.ts
export function fnv1a(bytes: Uint8Array, h?: number): number;                    // 32 位元，預設初值 0x811c9dc5
export function fnv1aStr(s: string, h?: number): number;                         // 吃 UTF-16 碼元
export function rleEncode(bytes: Uint8Array): Uint8Array;                        // varint 長度 + 值
export function rleDecode(bytes: Uint8Array, n: number, at?: number): { out: Uint8Array; next: number };
export function encodeChunkData(d: ChunkData): Uint8Array;                       // 六層依序各自 rleEncode
export function decodeChunkData(bytes: Uint8Array, at?: number): { data: ChunkData; next: number };
export function encodeBulk(head: BulkHead, payload?: Uint8Array): Uint8Array;    // u32 LE 標頭長 + UTF-8 JSON + payload
export function decodeBulk(bytes: Uint8Array): { head: BulkHead; payload: Uint8Array } | null;
// net/validate.ts（房主收客人：新物件、只拷貝已知欄位；不合法 → null，不拋）
export function parseGuestCtrl(data: Payload, chunksY: number, cxRange: { lo: number; hi: number }): GuestCtrl | null;
export function parsePs(data: Payload): Ps | null;
// save/character.ts
export function validateCharacterStrict(raw: unknown): DelveCharacter;          // 不合法 → SaveFormatError
```
`parseGuestCtrl`：`hello.character` 原樣保留（Task 8 再嚴格驗證）、`cmd.cmd` 過 `validCmd`、`sum.cx` 是 `cxRange` 內的安全整數、`sums` 長度等於 `chunksY` 且每個是 0..2³²−1 的整數、`seq` 是 0..2³¹ 的整數、字串 ≤ 64 字。`parsePs`：所有數值有限，`|x|`、`|y|` ≤ `X_LIMIT * TILE_SIZE`，`slot` 在快捷欄內，`facing` ±1。`validateCharacterStrict` = `validateCharacter` 再加：`equipGear` 每件過 `strictGear`、`0 ≤ hp ≤ 2 × MAX_HP_CAP`、`1 ≤ baseMaxHp ≤ MAX_HP_CAP`、`0 ≤ mana ≤ 1000`、`0 ≤ undyingCd ≤ 3600`、每個 `buffsLeft` ≤ 3600 秒、`nick` 原樣不能超過 `MAX_NICK`（寬鬆版會改成旅人，嚴格版拒絕）。

- [ ] **Step 1：寫失敗測試**
  - `net/codec.test.ts`：`fnv1a(new Uint8Array([]))` 是 `0x811c9dc5`、`fnv1aStr('a')` 是 `0xe40c292c`；`rleEncode`／`rleDecode` 往返（全 0、全相異、長度 200 的連續段、隨機 1024 B 各一）；`decodeChunkData(encodeChunkData(d))` 六層逐位元組相等，且全空氣 chunk 編碼後 < 40 B；`decodeBulk(encodeBulk(head, payload))` 往返（含空 payload、含中文的標頭）；截斷的 bytes → `null`。
  - `net/validate.test.ts`：每種 `GuestCtrl` 合法樣本原樣通過；垃圾一律 `null`：`'not json'`、`'{"t":"nuke"}'`、`sum` 的 `cx` 超出、`sums` 長度少一、`sums` 含 −1／2³²／0.5、`cmd` 的 `cmd` 是 `{ op: 'nuke' }`、`seq` 是 −1、`hello.build` 長 65、`Uint8Array` 送到 ctrl；`__proto__` 欄位不會汙染 `Object.prototype`。`parsePs`：NaN、`Infinity`、`x` 是 `1e12`、`slot` 是 99、`facing` 是 0 → `null`。
  - `save/character.test.ts` 新增：`createCharacter` 的結果過 `validateCharacterStrict` 不拋；`hp: 1e9`、`baseMaxHp: 999`、`mana: -1`、`equipGear` 裡一件詞條不合法、`buffsLeft.bless: 99999`、`nick` 17 字 → 各自拋 `SaveFormatError`；同樣的輸入給 `validateCharacter` 照舊不拋（寬鬆版不變）。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/net/codec.test.ts src/scripts/games/delve/net/validate.test.ts src/scripts/games/delve/save/character.test.ts`。
- [ ] **Step 3：實作**上述三個新檔與 `validateCharacterStrict`。
- [ ] **Step 4：跑測試確認通過**：三檔 PASS；全套 vitest；tsc 無新增錯誤。
- [ ] **Step 5：Commit** `feat(delve): co-op wire types, bulk codec and host-side input validation`

### Task 5：按 chunk 同步核心（雜湊、整欄回覆、日誌上線格式、客人 rev 表、液體）

**Files:**
- Create: `net/chunkSync.ts`、`net/chunkSync.test.ts`
- Modify: `engine/world.ts`（`setFrozen` 465 行：值有變時把該 chunk 加進 `netLiquid`——D5「結冰跟著液體走」）

**Interfaces — Consumes:** Task 4 的 codec 與型別；`World.readChunk`／`writeChunk(…, { journal: false })`／`chunkIndex`／`chunkCoords`／`chests`／`unlocked`／`edits`／`drainNetLiquid`；`encodeLiquidRle`／`decodeLiquidRle`。**Produces:**
```ts
export function chunkSum(w: World, cx: number, cy: number): number;          // C5；欄沒常駐也沒停放 → 0
export function columnSums(w: World, cx: number): number[];                   // 長度 chunksY
export function answerSum(w: World, cx: number, sums: readonly number[]): { head: Extract<BulkHead, { t: 'col' }>; payload: Uint8Array };
  // 先 ensureColumn(cx)；revs[cy] = w.edits.rev(key)；雜湊不同的 cy 進 diff，資料依 diff 順序串在 payload
export function wireBatch(w: World, b: EditBatch): WireBatch;                // 箱子 tile 鍵 → [鍵, 內容或 null, unlocked]；另外對 tiles 裡每個有箱子的格補一筆
export function chunkMessage(w: World, key: number): { head: Extract<BulkHead, { t: 'chunk' }>; payload: Uint8Array } | null;
export function encodeLiq(w: World, keys: readonly number[]): { head: Extract<BulkHead, { t: 'liq' }>; payload: Uint8Array };
  // 每個 chunk：encodeLiquidRle(liquid, liquidType) 的長度（u32）+ 內容 + rleEncode(frozen) 的長度 + 內容
export function applyLiq(w: World, head: Extract<BulkHead, { t: 'liq' }>, payload: Uint8Array): void;   // 只寫常駐欄；不進日誌
export type ChunkState = 'unsynced' | 'pending' | 'live';
export class ChunkSyncGuest {
  constructor(w: World);
  reset(): void;                                                  // welcome：清空 rev 表、暫存、同步集合
  /** 本地 actor 的 tile x：新進 LOAD_COLS 的常駐欄 → 回傳要送的 sum；離開 UNLOAD_COLS 或已卸載的欄 → 忘掉 */
  updateInterest(tileX: number): { cx: number; sums: number[] }[];
  onTiles(batches: readonly WireBatch[]): void;
  onCol(head: Extract<BulkHead, { t: 'col' }>, payload: Uint8Array): void;
  onChunk(head: Extract<BulkHead, { t: 'chunk' }>, payload: Uint8Array): void;
  state(key: number): ChunkState;
  rev(key: number): number;
  /** 有沒有房主寫過 (x, y)（從 since 這個計數之後）：樂觀放置回滾用 */
  writtenSince(x: number, y: number, since: number): boolean;
  readonly writes: number;                                        // 每套一格加 1
}
```
套 `tiles` 的格子：`setFg`、`setWall`、`setHalf`；套箱子：有內容 → 覆寫 `w.chests`、沒有 → 刪除；`unlocked` 加或刪。套整塊：`writeChunk(cx, cy, data, { journal: false })`，再把箱子設成清單內容、刪掉這個 chunk 裡清單沒有的箱子。暫存依 rev 升冪重放。

- [ ] **Step 1：寫失敗測試** `net/chunkSync.test.ts`（兩個 `new World(64, 64, { bounds: 'infinite', source: new TestSource() })`，`TestSource` 抄 `engine/world.stream.test.ts`；房主世界叫 `H`、客人叫 `G`；`run(H, G)` 輔助：把 `H.edits.drain()` 轉成 `wireBatch` 交給 `onTiles`）：
  - `chunkSum：相同為等、改一格就變、只改箱子內容也變`：兩邊 `ensureColumn(2)` → `columnSums` 相等；`H.setFg` 一格 → 那個 cy 不同、其他相同；`H` 放箱子再 `G` 放同一格箱子 → 相等；`H.chests` 那格塞一個 dirt、`touchChest` → 不同。
  - `answerSum 只送不同的、revs 全帶`：`H` 改 cy 0、3 → `diff.map(d => d.cy)` 是 `[0, 3]`、`revs[0] === H.edits.rev(H.chunkIndex(2, 0))`、`revs[1] === 0`；`G.onCol` 後兩邊 `readChunk(2, cy)` 逐層相等（全部 cy）。
  - `停放中的 chunk`：`H` 在 cx 5 改一格 → `unloadColumn(5)`（停放）→ `answerSum(H, 5, columnSums(G, 5))` 有那個 cy、套上後相等，而且 `H.isResident(5)`。
  - 亂序表格（每列一個 `it`，最後一律斷言兩邊六層與箱子相等）：① 客人送 sum 後、col 到之前房主又改了同一 chunk（tiles rev 較大先到）→ 暫存、col 套完重放；② 同上但房主的改動發生在 `answerSum` 之前（tiles rev ≤ col rev）→ 重放時跳過；③ `full` 標記先到、`chunk` 後到；④ `chunk` 先到、`full` 標記後到（忽略標記）；⑤ 兩批 rev 顛倒到達（舊的被丟）；⑥ 那欄還沒送 sum 時到的 tiles → 丟（`state === 'unsynced'`），之後 sum／col 還是一致。
  - `離開範圍會忘掉、回來重送 sum`：`updateInterest(64)` 回傳 cx −4..8 中常駐的那幾欄；走到 `tileX = 64 + 32 * 20` → 原本的欄變 `unsynced`、`rev` 歸 0；走回來 → 再回傳那幾欄的 sum。
  - `reset 清空 rev 表`：同步後 `reset()` → `state(k) === 'unsynced'`、`rev(k) === 0`。
  - `液體與結冰`：`H.setLiquid` 幾格、`H.setFrozen` 一格（值變了）→ `H.drainNetLiquid()` 含兩個 chunk；`applyLiq(G, …encodeLiq(H, keys))` 後 liquid／liquidType／frozen 三層相等；`setFrozen` 設成同值 → 不加進集合。
  - `writtenSince`：`onTiles` 寫了 (3, 4) 之後 `writtenSince(3, 4, before) === true`、`(3, 5)` 是 false。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/net/chunkSync.test.ts`。
- [ ] **Step 3：實作**（C3–C6）。
- [ ] **Step 4：跑測試確認通過**：該檔 PASS；`engine/world.edits.test.ts`、`engine/world.perf.test.ts`、golden、central、`engine/frost.test.ts` PASS；全套 vitest；tsc。
- [ ] **Step 5：Commit** `feat(delve): per-chunk sync — hashes, column replies, rev table and liquid frames`

### Task 6：引擎的 host／replica 模式

**Files:**
- Create: `net/motion.ts`、`net/motion.test.ts`、`engine/modes.test.ts`
- Modify: `engine/game.ts`（`stepWorld` 1142、`stepActor` 1185–1192、`columnEvents` 933、`newDay` 2157、`flushLevels` 4420、`postMoveSkills` 4527、`teleport` 4632、擊退 2795、`exec` 1034、`tryPlace` 的觸及判斷）、`engine/actor.ts`、`engine/world.ts`（`noPark`；`unloadColumn` 252）、`engine/commands.ts`（`CMD_PENDING`）

**Interfaces — Consumes:** Task 2 的 `mode`／`localPid` 選項、Task 4 的 `REMOTE_REACH_SLACK`。**Produces:**
```ts
// engine/actor.ts
export interface RemoteMotion { x: number; y: number; vx: number; vy: number; onGround: boolean; boating: boolean; climbing: boolean; facing: 1 | -1 }
// PlayerActor 新欄位（都不存檔）
remote: RemoteMotion | null;   // host 模式的遠端 actor：最近一筆被接受的位置
teleSeq: number;               // teleport() 每次 +1
knockSeq: number; knockV: { vx: number; vy: number };   // 擊退每次 +1，記下擊退速度
// engine/world.ts
noPark: boolean;               // true：unloadColumn 直接丟掉（不停放）並清掉那些 chunk 的 modified / liquidModified
// engine/commands.ts
export const CMD_PENDING: { readonly [K in CmdOp]: CmdResults[K] };   // C13：boolean → true、craft / 鍛造 → { ok: true }、
  // chestTakeAll → 0、void → undefined、lock / salvage / learnSkill → null、salvageAll → 全 0、服務 → { ok: true, msg: '' }、
  // respec → respecSkills 什麼都沒退時的回傳、marker → 'added'
// engine/game.ts（DelveGame）
cmdSink: ((cmd: Cmd) => void) | null;          // replica：exec(localPid) 交給它
setRemoteMotion(pid: Pid, m: RemoteMotion): void;
pushNetEvents(list: readonly DelveEvent[]): void;   // replica：房主的事件直接進佇列（不補 pid、不換算經驗）
applyNetCharacter(c: DelveCharacter): void;         // replica：withActor(local, applyCharacter(characterState(c, time), false))
// net/motion.ts
export const MOVE_MAX_VX: number;   // max(RUN_SPEED * 2, DASH_SPEED, BOAT_SPEED) * 1.5
export const MOVE_MAX_VY: number;   // max(MAX_FALL, JUMP_SPEED * 2) * 1.5
export const MOVE_TOL_PX = 2 * TILE_SIZE;
export type MoveCheck = 'ok' | 'fast' | 'solid' | 'bad';
export function checkMove(prev: { x: number; y: number } | null, next: RemoteMotion, dtSec: number, body: { w: number; h: number }, env: PhysEnv): MoveCheck;
  // prev null = 第一筆只檢查 solid；dtSec 夾在 [0.05, 2]
```
規則：`mode === 'host'` 且 `cur !== local` 時，`stepActor` 不跑 `stepPlayer`／`stepBoating`，改套 `cur.remote`（沒有就讓身體停住），並把 `boating`、`motion.climbing`、`facing` 照抄；`tryPlace` 的觸及距離加 `REMOTE_REACH_SLACK`。`mode === 'replica'`：`stepWorld` 只做 C12 列的那幾件；`columnEvents` 只呼叫 `liquids.forgetColumn`；`newDay` 只更新 `lastDay`；`flushLevels` 把 `lvScan` 推到佇列尾巴就返回；`postMoveSkills` 落地時結束震地但不呼叫 `slamShock`；`exec(localPid, cmd)` → `cmdSink?.(cmd)`，`op === 'skill'` 時另外跑一次 `useSkillCur`，回傳 `CMD_PENDING[op]`（`exec` 其他 pid 在 replica 丟例外）。建構子 `mode === 'replica'` 時設 `world.noPark = true`。

- [ ] **Step 1：寫失敗測試**
  - `net/motion.test.ts`：平地 `World`；走路一步（dt 0.05、位移 9 px）→ `'ok'`；dt 0.05 位移 500 px → `'fast'`；位置落在石頭裡 → `'solid'`；NaN → `'bad'`；`prev` null 且合法 → `'ok'`；坐船速度 270 px/s 持續 1 秒 → `'ok'`；突進 560 px/s 0.2 秒 → `'ok'`。
  - `engine/modes.test.ts`（arena 同 `actors.test.ts`）：
    - `host：遠端 actor 用回報的位置`：`g.mode = 'host'`、加入 B；`setRemoteMotion('b', { x: 900, y: B.y, vx: 50, … })`、`input('b').moveX = 1` → `step` 後 B 的 px 等於 900（不是積分出來的）、`facing` 照抄；本地 actor 照常積分。
    - `host：遠端 actor 仍會挖`：B 的 remote 停在 (50, 59)、`input('b')` 瞄 (51, 60) 的泥土、`mining = true`、選鎬子 → 跑到挖掉，那格變空氣、掉落物出現。
    - `host：放置觸及多 1.5 格`：B 在 (50, 59)，`exec('b', place x: 57)`（7 格，> `REACH_TILES` 6、≤ 7.5）→ `true`；本地玩家同距離 `act place` → `false`。
    - `teleSeq／knockSeq`：`withActor(b, () => g.teleport(60, 59))` → B 的 `teleSeq` 加 1；敵方投射物打中 B（同 `actors.world.test.ts` 的寫法）→ `knockSeq` 加 1、`knockV.vx !== 0`。
    - `replica：只動本地 actor、世界不動`：`new DelveGame({ seed: 'actors', width: 160, height: 100, localPid: 'p1', mode: 'replica' })`；放一隻怪、地上一個掉落物、一格水 → `setMoveX(1)` 跑 60 步 → 本地有移動；怪物位置、掉落物、水量、`world.edits.pending()` 與跑之前完全相同；`liquids` 沒被 step（`liquidTotal` 不變）。
    - `replica：exec 轉送`：`cmdSink` 收集；`act({ op: 'craft', recipe: 'planks' })` 回 `{ ok: true }`、收集到那個指令、背包不變；`act({ op: 'skill', skill: 'dash' })`（先學會）→ 本地 `dashT > 0` 而且也轉送了；`exec('zz', …)` 丟例外。
    - `replica：事件與經驗`：`pushNetEvents([{ type: 'kill', … , pid: 'p1' }])` → `drainEvents()` 拿到那則；本地 `levels` 的經驗不變。
    - `replica：卸載不停放`：infinite 小世界（`width: 200, height: 100, bounds: 'infinite', columnSource: new StoneSource()`，抄 `save/worldSave.v11.test.ts`）、`mode: 'replica'`；在 cx 20 `writeChunk` 一塊 → `unloadColumn(20)` → `parkedChunks()` 是 `[]`、`modifiedChunks` 不含那些 chunk。
    - `solo 不變`：golden 與 central 測試照跑（Step 4）。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/net/motion.test.ts src/scripts/games/delve/engine/modes.test.ts`。
- [ ] **Step 3：實作**（C11–C13）。
- [ ] **Step 4：跑測試確認通過**：兩檔 PASS；golden、central、`engine/exec.test.ts`、`engine/actors*.test.ts`、全套 vitest、delve e2e；tsc。
- [ ] **Step 5：Commit** `feat(delve): host and replica engine modes`

### Task 7：`snapshotWorld`／`applyWorldSnap`／`worldSig`

**Files:**
- Create: `net/snapshot.ts`、`net/snapshot.test.ts`

**Interfaces — Consumes:** Task 4 的 `WorldSnap`、`fnv1aStr`；元件序列化：`settle.toJSON()`、`folk.toJSON()`、`quests.toJSON()`、`scoutMarks`、`perkDays`、`scouted`、`stonesUnlocked`、`bossesDefeated`、`kills`、`peaceful`、`bossActive`、`weatherOverride`、`minedIce`、`world.unlocked`、`world.keysUsed`（與 `snapshotGame` 同一批；讀回用 `restoreGame` 1205–1213 行同一批 `load`）；Task 2 的 `visitOf`。**Produces:**
```ts
export function snapshotWorld(game: DelveGame, visit: VisitSave | null): WorldSnap;
export function applyWorldSnap(game: DelveGame, snap: WorldSnap): void;   // replica 用；visit 套到本地 actor（迷霧、標記、發現、床、重生核心）
export function worldSig(snap: WorldSnap): number;                         // 去掉 settle.npcs / folk.travellers 的 x、y 與 time / tick / visit 後的 fnv1aStr
```
`snap` 裡沒有 chunk、沒有液體、沒有掉落物（spec §5.6 第 2 點）。`applyWorldSnap` 的 `perkDays.healer` 不套到 replica 的本地玩家（C16：那是房主自己的）。

- [ ] **Step 1：寫失敗測試** `net/snapshot.test.ts`：
  - `往返`：房主 arena 建一個據點（爐心 + 房間，沿用 `game.settle.test.ts` 的 fixture）、接一個委託、解鎖一個傳送碑、殺一隻怪、開一個鎖住的箱子（`unlocked`）、`forceWeather('rain')`；`applyWorldSnap(replica, snapshotWorld(host, null))` 後：`replica.settle.toJSON()`、`replica.quests.toJSON()`、`stonesUnlocked`、`kills`、`world.unlocked`、`weather().kind`、`time` 都等於房主。
  - `不送 chunk`：`JSON.stringify(snapshotWorld(host, null)).length` 不隨房主改過的 chunk 數增加（改 200 個 chunk 前後長度相同）。
  - `visit 套到本地`：`visit` 有 marker 與已揭露的 (60, 59) → 套上後 replica 本地 `markers` 相同、`explored.isRevealed(60, 59)`。
  - `worldSig`：NPC 走動（`steps(host, 120)`，只有位置改變）→ 相同；接一個委託 → 不同；`time` 不同 → 相同。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/net/snapshot.test.ts`。
- [ ] **Step 3：實作** `net/snapshot.ts`。
- [ ] **Step 4：跑測試確認通過**：該檔 PASS；全套 vitest；tsc。
- [ ] **Step 5：Commit** `feat(delve): world-level snapshot for joining guests`

### Task 8：`NetHost`

**Files:**
- Create: `net/host.ts`、`net/host.test.ts`

**Interfaces — Consumes:** Task 3–7 的全部；`exec`、`input(pid)`、`addActor`／`removeActor`、`characterOf`、`drainEvents(pid)`、`doll()`（look）、`world.edits.drain`、`world.drainNetLiquid`。**Produces:**
```ts
export interface VisitStore { get(charId: string): VisitSave | undefined; put(charId: string, v: VisitSave): void }
export interface NetHostOptions {
  build: string; worldId: string; visits: VisitStore;
  requestSave?: () => void;        // 跨邊界操作後 SAVE_DEBOUNCE_MS 防抖（spec §5.7）
  maxGuests?: number;              // 預設 MAX_GUESTS
}
export type GuestPhase = 'hello' | 'syncing' | 'live';
export interface GuestInfo { pid: Pid; charId: string; nick: string; phase: GuestPhase; silentMs: number }
export const BOUNDARY_OPS: ReadonlySet<CmdOp>;   // chestTake chestTakeAll chestDeposit toss buy sell folkBuy folkSell service
                                                 // residentService folkService reroll upgrade ascend deepforge salvage salvageAll
export class NetHost {
  constructor(game: DelveGame, opts: NetHostOptions);
  open(): void;                    // mode = 'host'；drain 一次日誌與 netLiquid 當基準（進場清單 B4）
  accept(link: NetLink): void;     // 新連線：等 hello
  frame(nowMs: number, steps: number): void;
  close(): void;                   // 每位客人 bye closed + 最後的 chk，移除 actor，mode 回 'solo'
  guests(): GuestInfo[];
}
```
`frame` 的順序：① 收件匣依到達順序處理；② 跑 `steps` 次 `game.step()`，每步之後 fanout：`edits.drain()` 一次 → 每位 live 客人把 `NET_TILE_COLS` 內的批次轉 `wireBatch` 累積（`full` 的批次另排 `chunkMessage`）；`drainNetLiquid()` 聯集進每位 live 客人範圍內的待送集合；`drainEvents(pid)` 分成 `ev`／`pub`；`teleSeq`／`knockSeq` 變了 → `teleport`／`knock`；③ 依計時送：每步累積的 `tiles` 一則、`ws`（15 Hz，`LOAD_COLS` 內）、`liq`（5 Hz）、`char`（5 Hz、有變才送）、`chk`（30 秒或本幀有跨邊界）、`world`（`worldSig` 變了）、`look`（1 秒檢查一次 `doll()` 的 key）、`requestSave` 防抖；④ 逾時與 `PS_STALE_MS`。`bulk` 在途超過 `BULK_HIGH_WATER` 就把 `col`／`chunk`／`liq` 留到下一幀。

處理客人訊息：`hello` → `proto`／`build` 不同 → `reject proto`；滿了 → `full`；`validateCharacterStrict` 拋 → `char`；同 charId 在線且未逾時 → `charInUse`；否則挑角色（C8）、配 pid（`'p1'`…`'p3'` 最小的空號）、`addActor(pid, character, null, visits.get(charId))`、送 `welcome`（`you` = 落點 px）與 `bulk snap`（帶 visit）、記 `teleSeq`／`knockSeq` 基準、廣播 `look`。`ready` → `live`。`sum` → `answerSum` 排進 bulk。`cmd` → 權杖桶 → `exec(pid, cmd)` → `ack{ seq, ok, reason }`（`ok` = 結果不是 `false`／`null`／`{ ok: false }`；`reason` 取結果的 `reason`）；`BOUNDARY_OPS` → 標記本幀要送 `chk`。`ps`（state）→ `parsePs` → `tseq` 舊的丟 → `checkMove`（`prev` = 上一筆接受的位置、`dt` = 兩筆的房主時間差）→ `ok`：`setRemoteMotion` + `input(pid)` 的 aim／mining／use／selected；否則 `teleSeq++`。`bye` 或 `onClose` → 送最後的 `chk`（連線還開著才送）、`removeActor` → `visits.put` → `retained` → 對其他客人送 `gone`。

- [ ] **Step 1：寫失敗測試** `net/host.test.ts`（arena 房主 + `LoopbackNet`；客人端用一個手寫的 `ScriptedGuest`：直接送 JSON／bytes、把收到的訊息依 `t` 收集）：
  - `握手`：hello → 收到 `welcome`（`pid 'p1'`、`seed`、`w`、`h`、`bounds 'legacy'`、`you`）與 `bulk snap`；`game.actors.has('p1')`；`proto: 2` → `reject proto`；`build` 不同 → `reject proto`；第 4 位客人 → `reject full`；角色 `hp: 1e9` → `reject char`；同 charId 第二條連線 → `reject charInUse`。
  - `開房基準`：`open()` 之前 arena 改過的格子不會出現在任何 `tiles`。
  - `sum → col`：ready 後送 cx 0..4 的 `columnSums`（用一個從同 seed 新生成、沒改過的世界算）→ 每欄收到一則 `col`，arena 改過的 chunk 在 `diff` 裡、沒改過的不在。
  - `tiles 只給範圍內的客人`（infinite 小世界 `width: 200, height: 100, bounds: 'infinite', columnSource: new StoneSource()`）：客人在 x 40；房主本地在 x 40 挖一格 → 收到 `tiles`；房主本地傳送到 x = 40 + 32 × 20（> `NET_TILE_COLS` 欄）再挖 → 沒收到。
  - `cmd 與 ack`：送 `cmd craft`（背包先由房主 `exec('p1')` 外塞 wood）→ `ack ok`、之後一則 `char` 含 planks；`cmd chestDeposit` → 同一幀有 `chk`，`chk.character.rev === chk.rev`、rev 單調遞增；`requestSave` 在 2 秒內被呼叫恰好一次；每 1 ms 送一則 `cmd respec` 共 200 則 → 至少 100 則 `ack reason 'rate'`，房主不拋。
  - `ps`：合法的走路序列 → 房主端 p1 的 px 跟著動；一則瞬移 500 格 → 收到 `teleport`，px 沒跳；同 tseq 舊的 `ps` 被忽略；回報新 tseq 後的合法 `ps` 照常採用；NaN `ps` 丟掉、不拋。`ps` 停 600 ms → `input('p1').mining === false`。
  - `事件分送`：p1 撿到東西 → `ev` 有 pickup；房主本地 craft → p1 收不到那則（私人），`drainEvents('h')` 還拿得到（C7：房主自己的 HUD 沒漏）。
  - `逾時與關閉`：客人沉默 89 秒 → 還在（`guests()[0].silentMs` ≥ 89 000）；91 秒 → 移除、`visits.put` 被呼叫、其他客人收到 `gone`；另一條：客人端 `close()` → 同一幀就移除。
  - `垃圾訊息`：Review Focus 3 的每一種送進 ctrl／state／bulk → 房主不拋、該客人仍連著、另一位客人的 `ws` 照常。
  - `close`：兩位客人各收到 `bye closed` 與一則 `chk`；`game.actors.size === 1`、`game.mode === 'solo'`。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/net/host.test.ts`。
- [ ] **Step 3：實作** `net/host.ts`（C6–C10、C14）。
- [ ] **Step 4：跑測試確認通過**：該檔 PASS；全套 vitest；tsc。
- [ ] **Step 5：Commit** `feat(delve): NetHost — handshake, chunk sync, fanout and checkpoints`

### Task 9：`NetGuest` 與內插

**Files:**
- Create: `net/interp.ts`、`net/interp.test.ts`、`net/guest.ts`、`net/guest.test.ts`

**Interfaces — Consumes:** Task 3–8；`applyWorldSnap`、`applyNetCharacter`、`pushNetEvents`、`cmdSink`、`makeEnemy`、`DropList`、`GEN_VERSION`、`OUTER_GEN_VERSION`。**Produces:**
```ts
// net/interp.ts
export class Interp<T extends { x: number; y: number }> {
  constructor(delayMs?: number);                  // 預設 INTERP_DELAY_MS
  push(id: number | string, at: number, v: T): void;   // at = 房主時間（ms，= ws.time * 1000）
  sample(id: number | string, now: number): T | null;  // now - delay 夾在最新兩筆之間線性插值；超過最新 → 用最新（不外推）
  ids(): (number | string)[];
  retain(ids: ReadonlySet<number | string>): void;     // 不在這次 ws 裡的丟掉
}
// net/guest.ts
export interface NetGuestOptions {
  build: string;
  character: DelveCharacter;                                    // 最後一次 chk 的角色（沒有就是本地角色檔）
  onCheckpoint?: (c: DelveCharacter, rev: number) => void;
  createReplica?: (w: Welcome) => DelveGame;                    // 測試注入（gen 快取 / columnSource）；預設依 welcome 建 replica
}
export type GuestState = 'connecting' | 'syncing' | 'live' | 'ended';
export interface PeerView { pid: Pid; nick: string; look: DollLook | null; x: number; y: number; facing: 1 | -1; hp: number; maxHp: number; dead: boolean }
export const END_TEXT: Readonly<Record<RejectReason | ByeReason | 'hostGone', string>>;
  // full 房間已滿 / proto 版本不同，請重新整理頁面 / gen 世界版本不同，無法加入 / charInUse 這個角色已經在房間裡 /
  // char 角色檔格式不正確 / closed 主機已離線 / hostGone 主機已離線 / timeout 連線逾時 / leave 已離開
export class NetGuest {
  constructor(link: NetLink, opts: NetGuestOptions);
  readonly state: GuestState;
  readonly endText: string | null;
  readonly game: DelveGame | null;
  readonly pid: Pid | null;
  readonly lastCheckpoint: { rev: number; character: DelveCharacter } | null;
  frame(nowMs: number, steps: number): void;
  peers(): PeerView[];
  leave(): void;                         // bye leave；state ended
  reconnect(link: NetLink): void;        // 用 lastCheckpoint（沒有就 opts.character）重新 hello；舊 replica 丟掉
}
```
流程：建構即送 `hello`。`welcome` → 檢查 `genVersion === GEN_VERSION`、`outerGenVersion === OUTER_GEN_VERSION`（不同 → `bye`、`ended gen`）→ `createReplica` → `ChunkSyncGuest.reset()` → 本地身體放到 `you`、`applyNetCharacter(opts.character)`；`bulk snap` → `applyWorldSnap` → 送 `ready` → `live`。`frame`：處理收件匣（`tiles`→`onTiles`、`col`／`chunk`→同名、`liq`→`applyLiq`、`ev`／`pub`→`pushNetEvents`、`char`→`applyNetCharacter`、`chk`→`lastCheckpoint` 與 `onCheckpoint`、`teleport`→身體 px 歸位、速度歸零、記 tseq、`knock`→身體速度與 `knockT = dur`、`world`→`applyWorldSnap`、`ack ok:false`→C14 回滾、`ws`→內插緩衝與本地 hp／mana／dead／time（內插的「現在」= 最新一則 `ws.time * 1000` 加上它到達後經過的本地 ms）、`gone`／`look`→peers）→ 樂觀放置與 `ps.use` 遮罩（C14）→ 跑 `steps` 次 `game.step()` → `updateInterest` 送 `sum` → 每 1/20 秒送 `ps` → 把 `Interp` 取樣寫進 replica 的 `enemies`（用 `makeEnemy` 建、id 照抄）、`drops.list`、`projectiles.list`、NPC 位置 → `world.edits.drain()` 丟掉（副本自己的日誌沒有人用）→ 房主沉默超過 `HOST_TIMEOUT_MS` 或 `onClose` → `ended hostGone`。

- [ ] **Step 1：寫失敗測試**
  - `net/interp.test.ts`：t = 0 在 x 0、t = 100 在 x 100 → `sample(id, 150)`（延遲 100 → 取 50）是 50；只有一筆 → 那筆；`now` 超過最新 + 延遲 → 最新（不外推）；亂序 push（先 100 再 0）結果相同；`retain` 之後消失的 id 回 `null`。
  - `net/guest.test.ts`（真的 `NetHost` + `NetGuest`，arena，`LoopbackNet` 零延遲；`tick(ms)` 輔助：每 1000/60 ms 呼叫 `net.advance`、`host.frame`、`guest.frame`，各跑 `FixedStepper` 算出的步數）：
    - `加入`：`state` 依序 connecting → syncing → live；`guest.game.mode === 'replica'`、`localPid === 'p1'`；live 之後 1 秒，客人範圍內每個 chunk 與房主逐層相等（arena 的平地被 `col` 補過來）。
    - `走路互相看得到`：客人 `setMoveX(1)` 1 秒 → 房主端 p1 的 px 與客人本地相差 ≤ 1 px（停下後 0.5 秒）；房主本地走動 → `peers()` 裡 'h' 的 x 在 0.3 秒內跟上（容差 2 px）。
    - `怪物進 replica 的列表`：房主在客人旁邊放一隻史萊姆 → 0.5 秒後 `guest.game.enemies` 有同 id 的一隻，位置與房主相差 ≤ 一個內插延遲的位移。
    - `被拒的放置回滾`：客人手上 dirt、瞄準 (45, 59)；房主在指令到達前先在那格 `setFg(T.STONE)`（`LoopbackNet` 延遲 100 ms 讓順序可控）→ 客人那格先變 DIRT（樂觀）→ `ack ok:false` 後變 STONE；客人背包 dirt 數不變（`char`）。
    - `rev 表在 welcome 重來`：`reconnect` 之後 `sync.rev(k) === 0`，再同步一次後一致。
    - `checkpoint`：客人 `act({ op: 'toss', slot })` → `onCheckpoint` 收到一則，角色背包少了那些東西；30 秒（模擬時間）後再收到一則。
    - `主機離線`：`host.close()` → `state 'ended'`、`endText === '主機已離線'`、`lastCheckpoint` 是最後那則；`sever` 也一樣。
    - `世界版本不同`：`createReplica` 前把 welcome 的 `genVersion` 改掉（用 `ScriptedHost` 回一則假的 welcome）→ `ended`、`endText === '世界版本不同，無法加入'`。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/net/interp.test.ts src/scripts/games/delve/net/guest.test.ts`。
- [ ] **Step 3：實作** `net/interp.ts`、`net/guest.ts`（C3、C6、C9、C12–C14）。
- [ ] **Step 4：跑測試確認通過**：兩檔 PASS；`net/host.test.ts`；全套 vitest；tsc。
- [ ] **Step 5：Commit** `feat(delve): NetGuest replica with interpolation, optimistic place and checkpoints`

### Task 10：計時器驅動的 `NetLoop` 與連線時不暫停

**Files:**
- Create: `net/loop.ts`、`net/loop.test.ts`
- Modify: `render/model.ts`（新增 `stepsInFrame`）、`render/model.test.ts`、`render/main.ts`（`frame` 234–239 行、`setPaused` 430 行一帶）

**Interfaces — Consumes:** `FixedStepper`（`render/model.ts`）、`FIXED_DT`。**Produces:**
```ts
// net/loop.ts
export interface Ticker { start(cb: (nowMs: number) => void, everyMs: number): void; stop(): void }
export function intervalTicker(): Ticker;          // setInterval + performance.now；M-C 換 Worker 計時器（U8）
export const HOST_MAX_FRAME_S = 1.0, LOOP_EVERY_MS = 1000 / 60;
export class NetLoop {
  constructor(ticker: Ticker, run: (nowMs: number, steps: number) => void);   // run = host.frame 或 guest.frame
  start(): void; stop(): void;
  readonly running: boolean;
}
// render/model.ts
/** rAF 這一幀要不要跑模擬：只有單機、沒暫停、沒在對話時（連線時模擬由 NetLoop 跑，UI 暫停只放開按鍵） */
export function stepsInFrame(mode: GameMode, paused: boolean, talking: boolean): boolean;
```
`render/main.ts`：rAF 迴圈的 `controls.update()` 照舊每幀跑（`!paused` 時），但 `stepper.advance` → `game.step` 只在 `stepsInFrame(game.mode, paused, talking)` 為真時跑；`talkPaused` 的判斷也改成只在 `mode === 'solo'` 時成立。單機的行為不變。

- [ ] **Step 1：寫失敗測試**
  - `net/loop.test.ts`（`FakeTicker`：手動 `fire(now)`）：每 16.67 ms 觸發 60 次 → `run` 收到的 `steps` 總和是 60；**背景節流**：每 1000 ms 觸發一次、共 30 次 → 每次 `steps === 60`、總和 1800（不掉速，HOST_MAX_FRAME_S）；一次間隔 5000 ms → 只補 60 步（上限）；`stop()` 後 `fire` 不再呼叫 `run`。另一條：`NetLoop` + 真的 `NetHost`（arena），整個過程沒有任何 rAF／render 呼叫，30 次 1 秒觸發後 `game.time` 前進 ≥ 29.9 秒、`game.tick` 前進 1800。
  - `render/model.test.ts`：`stepsInFrame('solo', false, false) === true`；`('solo', true, false)`、`('solo', false, true)` false；`('host', …)`、`('replica', …)` 四種組合一律 false。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/net/loop.test.ts src/scripts/games/delve/render/model.test.ts`。
- [ ] **Step 3：實作**（C18）。
- [ ] **Step 4：跑測試確認通過**：兩檔 PASS；全套 vitest；`npx playwright test tests/e2e/delve.spec.ts --project=chromium` 全綠（選單、地圖、技能樹、衣櫥、轉生在單機照舊暫停）；tsc。
- [ ] **Step 5：Commit** `feat(delve): timer-driven net loop; co-op never pauses the simulation`

### Task 11：驗收——同一行程裡的房主與客人

**Files:**
- Create: `net/testRig.ts`（測試輔助，不被正式程式碼 import）、`net/coop.test.ts`、`net/coop.infinite.test.ts`

**Interfaces — Consumes:** Task 3–10 的全部。**Produces（只給測試用）：**
```ts
export interface RigOptions { latencyMs?: [number, number]; loss?: number; seed?: string; guests?: number; world?: 'arena' | 'infinite' | 'real' }
export interface Rig {
  net: LoopbackNet; host: NetHost; hostGame: DelveGame; guests: NetGuest[]; visits: Map<string, VisitSave>; checkpoints: DelveCharacter[][];
  run(ms: number): void;                          // 每 1000/60 ms：net.advance、host.frame、每位 guest.frame（各自 FixedStepper）
  pause(i: number, on: boolean): void;            // 模擬客人分頁在背景：不呼叫他的 frame
  sameTiles(i: number): { key: number; layer: string }[];   // 客人 i 同步集合內所有 chunk 與房主逐層比對的差異（空 = 一致）
  count(item: ItemId): { host: number; guestsOnHost: number[]; drops: number; chests: number; lastChk: number[] };
}
export function coopRig(o?: RigOptions): Rig;
```
世界：`arena` = `engine/actors.test.ts` 的平地（160×100、legacy）；`infinite` = `{ width: 200, height: 100, bounds: 'infinite', columnSource: new HashSource() }`（`HashSource` 抄 `engine/world.stream.test.ts` 的 `TestSource`，房主與客人各 new 一個）；`real` = 正式尺寸、固定種子、`generateWorld` 只跑一次、房主與客人共用 `gen`（`World.fromGen` 會複製）。

- [ ] **Step 1：寫失敗測試**（每條結束前 `run` 到靜止，再斷言 `sameTiles(i)` 是 `[]`）
  - **A1 客人挖／放 → 一致**（`arena`）：客人瞄 (45, 60) 泥土、按住挖 → 房主與客人那格都是空氣；掉落物被客人撿走：房主端 p1 背包 +1 dirt、客人 `game.inventory` 經 `char` 也 +1；客人再把 dirt 放回 (45, 60) → 兩邊都是 DIRT。
  - **A2 兩位客人**（`arena`、`guests: 2`）：A 放一格 → 房主與 B 一致（spec §6 M-B）；**同一格同一刻** A 放、B 挖（同一幀送出）→ 三方一致（Review Focus 5）。
  - **A3 房主在遠方改的東西，客人走過去才看到**（`infinite`）：房主本地傳送到 x = 3000、挖 10 格、放 5 格、走回出生點，等 `UNLOAD_EVERY` 讓那欄停放（`hostGame.world.parkedChunks()` 非空）；客人加入後由房主 `withActor(p1, () => teleport(3000, …))` 送過去 → `sameTiles` 為空，那 15 格在客人副本上都對。
  - **A4 晚加入的客人**（`infinite`）：房主先玩：中央改 30 格、外圍 x = −2500 改 20 格並停放、`saveSplitGame` → `restoreSplit`（遠方 chunk 透過 FarChunks 停放）→ 新的 `NetHost` 開房 → 客人加入 → 依序傳送到出生點、−2500 → 每處 `sameTiles` 為空。
  - **A5 真實世界的外圍**（`real`；這條單獨一個 `it`，timeout 60 秒）：客人走進中央以外第一片海與生態段（OuterGen 生成）→ `sameTiles` 為空，且外圍沒改過的 chunk 不在任何 `col.diff` 裡（客人自己生成、雜湊相同）。
  - **A6 延遲 100–200 ms、30% 丟包**（`arena`，`latencyMs: [100, 200], loss: 0.3`）：客人往右走 3 秒停下 → 1 秒內房主端 p1 的 px 與客人本地差 ≤ 1 px；房主本地走動停下 → 1 秒內 `peers()` 的 'h' 差 ≤ 2 px；客人連挖 10 格、放 10 格 → 靜止後 `sameTiles` 為空；房主端 p1 的 dirt 數與客人副本一致。
  - **A7 斷線重連**（`arena`；Review Focus 4）：客人撿 5 個 torch（沒有跨邊界、沒有 chk）→ `net.sever(guest link)` → 房主移除 p1、`visits` 有他的 charId → `guests[0].reconnect(net.pair().guest)`（rig 同時 `host.accept` 另一端）→ live；客人背包有那 5 個 torch（房主 `retained` 較新）且不是 10 個；位置是斷線前的 visit；`sameTiles` 為空。另一條：客人沒斷線、只是 `pause(0, true)` 沉默 30 秒（舊 session 還沒逾時），用同 charId 從第二條連線 hello → `reject charInUse`，舊的那位恢復後照常 live。
  - **A8 房主分頁在背景不停**（`arena`）：房主改用 `NetLoop` + `FakeTicker` 每 1000 ms 觸發一次、共 20 次（沒有任何 rAF）→ `hostGame.time` 前進 ≥ 19.9 秒；客人照常收到 `ws`（`peers()` 更新）、`state === 'live'`。
  - **A9 客人分頁在背景**（`arena`，非和平、客人旁邊一隻史萊姆）：`pause(0, true)` 60 秒 → 房主端 p1 沒被移除、px 不變、hp 下降（照樣受傷，U9）；`pause(0, false)` 後 1 秒內恢復 `ps`、仍是 live。
  - **A10 物品守恆**（`arena`）：客人丟 10 dirt、房主本地走過去撿 → 每一幀 `host + guestsOnHost[0] + drops === 10`；客人把 1 個 `gold_coin` 存進箱子後立刻 `sever` → `chests + lastChk[0] === 原本的數量`、`retained` 的角色也不含那 1 個（spec §6 M-B 防複製不變式）；房主本地與客人互丟各 3 次 → 總數不變。
  - **A11 單機不變**：`npx vitest run src/scripts/games/delve/engine/actor.golden.test.ts src/scripts/games/delve/engine/world.central.test.ts` PASS（在 Step 4 跑，不寫新測試）。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/net/coop.test.ts src/scripts/games/delve/net/coop.infinite.test.ts`。預期：缺 `testRig`；補上 rig 之後若有失敗，回到對應 task 修（例如 A6 的位置收斂失敗 → Task 9 的內插或 `ps` 頻率）。
- [ ] **Step 3：實作** `net/testRig.ts`，並修正驗收過程發現的問題（每個修正都先在擁有它的 task 檔案補一條會失敗的單元測試）。
- [ ] **Step 4：跑測試確認通過**：兩檔 PASS；golden、central；`npx vitest run` 全套綠；`npx playwright test tests/e2e/delve.spec.ts --project=chromium` 全綠；tsc 與 Step 0 基準相比沒有新增錯誤。
- [ ] **Step 5：Commit** `test(delve): co-op acceptance over loopback — edits, late join, loss, reconnect, background`

---

## Self-review

- **Spec 覆蓋**：§5.2 `mode`／replica 只內插不跑 AI、host 跳過客人移動積分 → Task 6；`drainEvents(pid)` 分送 → Task 8（C7 偏離 `drainAll`，理由見 C7）；`exec` 的 replica 分支 → Task 6（C13）。§5.3 客人權威移動、20 Hz `ps`、速度／卡牆檢查、`teleport`／`knock`、約 100 ms 內插 → Task 6、8、9。§5.4 三通道 → Task 3；`hello`／`welcome`／`reject`、`snap`／`ready`、`ps`／`ws`（興趣管理）、`tiles`／`ev`／`pub`／`ack`／`char`／`chk`／`look`／`teleport`／`knock`／`bye`、`cmd`、`sum`／`chunk`、`liq` 5 Hz → Task 4、8、9；`chat` 與客人送 `look` 留 M-C／M-D（C19）；存活偵測改 90 秒（C8 與 U9 的衝突）。§5.5 樂觀放置、`canReach` +1.5、ack 回滾、rev 丟棄、未載入丟、等整塊暫存 → Task 5、6、9。§5.6 1–6 → Task 5（雜湊、整欄回覆、暫存重放、卸載忘掉）、Task 7（`snapshotWorld`）、Task 8（ensure 欄、`answerSum`）、Task 9（welcome 清 rev 表）。§5.7 權威在房主、`tossSlot`＋共用箱子、30 秒與跨邊界 checkpoint、1 秒防抖（M-C 寫 IDB；本段只交 `onCheckpoint`）、2 秒存世界防抖、主動離開／逾時／房主離開、拒絕重複 charId → Task 8、9、11。§6 M-B 的 loopback 測試（2 個 replica、回滾、載入欄內每個 chunk 一致含停放與外圍、防複製不變式、丟包收斂）→ Task 11 A1–A10。§7 R2 → Task 10；R4 → Task 5（同一條路）＋ Task 11 A5；R5 → C9＋A10；R6 → `BULK_HIGH_WATER` 與 5 Hz（Task 8）；R11 → C13。§10 進場清單七項：place 守門＋速率 → Task 1＋C14；開房基準 → Task 8 `open()`；welcome 清 rev 表 → Task 9；世界層級權限 → Task 2（C16）；`MAX_DROPS` → Task 1；`writeChunk` 選項 → Task 1；`tossSlot` 與挖掘／釣魚 → Task 1。使用者列的 M-B1 遺留：localPid、visit、沒人在等、天氣、委託、床、衣櫥／轉生不暫停、嚴格角色驗證 → Task 2、4、10；重複 worldId → C19（spec 沒排進本段）。
- **型別一致**：`NetLink`／`Channel`／`Payload` 只在 Task 3；`WireBatch`／`WireChest`／`BulkHead`／`Ps`／`Ws`／`Welcome`／`HostCtrl`／`GuestCtrl`／`WorldSnap` 只在 Task 4（Task 7 只實作產生與套用）；`chunkSum`／`answerSum`／`wireBatch`／`chunkMessage`／`encodeLiq`／`applyLiq`／`ChunkSyncGuest` 只在 Task 5，Task 8、9、11 用同名；`RemoteMotion`／`teleSeq`／`knockSeq`／`knockV`／`setRemoteMotion`／`pushNetEvents`／`applyNetCharacter`／`cmdSink`／`CMD_PENDING`／`noPark` 只在 Task 6；`characterOf`／`visitOf`／`removeActor` 的 `{ character, visit }`／`addActor(…, visit)` 只在 Task 2；`snapshotWorld`／`applyWorldSnap`／`worldSig` 只在 Task 7；`NetHost`／`VisitStore`／`BOUNDARY_OPS` 只在 Task 8；`NetGuest`／`Interp`／`END_TEXT` 只在 Task 9；`NetLoop`／`Ticker`／`stepsInFrame` 只在 Task 10。`knock` 訊息的持續時間欄位叫 `dur`（`t` 已是訊息種類），Task 4、8、9 一致。
- **Review Focus** 五條都已寫成測試：1 → Task 5 亂序表格；2 → Task 6 `checkMove` 表＋Task 8 `ps` 測試；3 → Task 8 垃圾訊息與 `cmd` 洪水；4 → Task 11 A7；5 → Task 11 A2。
- **比例**：沒有函式本體；只有簽名、數值、規則與斷言。演算法只寫在簽名決定不了的地方（C3 的暫存重放、`frame` 的順序、可靠通道的 `deliverAt`）。
