# DELVE 連線 M-C：真網路、大廳與遠端玩家 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 兩個瀏覽器可以透過 5 碼房號真的連進同一個 DELVE 世界一起玩：看得到彼此、一起挖、蓋、打，斷線或離開不會複製或吃掉物品。

**Architecture:** M-B3 的 `NetHost`／`NetGuest` 只認 `NetLink` 介面。M-C 做四件事：
- 用 WebRTC 三條 negotiated data channel 實作 `RtcLink`。
- 用 `/api/signal`（namespace `delve:`）做 guest-initiated 星狀配對。
- 用 DOM-free 的 `CoopHostSession`／`CoopGuestSession` 把信令、連線、`NetLoop`（Worker 計時器）和存檔接起來。
- 把 session 接到標題、暫停選單、HUD 和 renderer。

另外補齊 M-B3 審查留下的 M-C 前必做：確認收到的 checkpoint、`sum` 洪水、延遲關閉、`savedAt`。

**Tech Stack:** TypeScript、Canvas2D、Astro 7、WebRTC DataChannel、Web Worker、IndexedDB、vitest、Playwright（chromium）。

**Spec:** `docs/superpowers/specs/2026-10-20-delve-coop-design.md`（§5.4 通道、§5.7 checkpoint、§5.8 M-C、§6 M-C 測試、R1／R2／R7）。延後項來源：memory `delve-coop-mc-carry`，已整理進下面的 C1–C6。

## Global Constraints

- 路徑縮寫：`delve/` = `src/scripts/games/delve/`，`tetris/net/` = `src/scripts/games/tetris/net/`。
- 測試只用 `npx vitest run <檔案>`；最後跑全套 `npx vitest run`。**絕不用 `npm test`／`npm run test`**（watch 模式會掛住）。
- tsc：`rtk proxy npx tsc --noEmit -p .`。rtk 會把 tsc 輸出過濾成看似零錯誤，一定要加 `rtk proxy`。
- e2e：`npx playwright test <spec> --project=chromium`。
- 換行：**每個檔案自己檢查**（`file <path>` 或看 `\r`）。CRLF 檔只能用 Edit 工具改，不能用 `sed -i`（rtk 會吃掉 CR）。
- 禁 `!important`，禁行內樣式。JS 只能用 `style.setProperty('--x', …)` 設 CSS 變數（`folkUi.ts:444` 的先例）。
- delve 的 UI 文案直接寫繁體中文，不走站台 i18n。
- 遊戲中的 delve CSS 寫在 `src/pages/games/delve.astro` 的 `<style is:global>`。class 用 `delve-` 前綴的 BEM 風格。
- Commit 用 Conventional Commits，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。不 push，不碰合約。
- 人數：房主加最多 3 名客人（`MAX_GUESTS = 3`，`delve/net/protocol.ts:21`）。
- 信令 namespace 是 `'delve:'`，沿用 `/api/signal`。槽位 TTL 300 秒，單筆上限 60 KB。允許的槽位是 `guest-{0..6}-offer`、`host-ack-{0..6}`，**伺服器端不改**。
- `RTC_CONFIG` 只有 Google STUN，v1 不做 TURN（spec R1）。

## Builder Decisions（本計畫拍板，擁有者可推翻）

- **C1 確認收到的 checkpoint，同時讓保留角色寫進存檔**
  - `chk` 多帶 `upTo`，代表房主已經處理到這位客人的第幾個 cmd seq。
  - 客人把 checkpoint 寫進 IDB 之後，回 `chkAck{rev}`。
  - 房主移除客人時，把那份角色存進世界檔的 `held[charId]`。原本的 `retained` 只放在記憶體，M-C 改成透過 `VisitStore` 寫進世界存檔，房主重新整理也不會丟。
  - 客人重進時，`held.rev` 比 hello 帶來的大，就用 held。收到 rev ≥ held.rev 的 `chkAck` 時清掉 held。
  - 斷線時如果還有跨邊界操作沒被 checkpoint 涵蓋（`unconfirmed`），客人存最後一份 chk，並在角色記錄標上 `pendingWorld`。標題畫面會顯示「待同步」，選這個角色時跳確認。
  - **剩下的窗口**：客人沒回原世界，先在別的世界玩，最後一筆跨邊界操作可能重複或消失。依反目標（朋友間不防作弊）接受，UI 會明白告知。
- **C2 `sum` 洪水**
  - 離客人超過 `NET_TILE_COLS` 欄的 `sum`，先停在 `parkedSums`（以 cx 去重，上限 `SUM_PARK_MAX = 32`，超過丟最舊的）。客人走近時才處理，超過 `2 × NET_TILE_COLS` 直接丟（客人那邊也已經卸載，回來時會重送）。
  - 佇列裡同一個 cx 的 sum 只留最新一份。
- **C3 延遲關閉**：房主送 reject、bye 或判定逾時之後，過 `LINGER_MS = 2000` 才 `link.close('linger')`。這段時間只處理 `chkAck` 和 `pong`。`NetHost.close()` 之後 `frame()` 只負責這些延遲關閉。
- **C4 `savedAt`**：由寫入 IDB 的一端蓋 `Date.now()`。客人在 `CoopGuestSession` 的 persist 包裝裡蓋，房主不改。
- **C5 延遲**：雙方都每 `PING_MS = 2000` 在 ctrl 送 `ping{at}`，對方回 `pong{at}`，各自算 RTT。房主看到每位客人的延遲，客人看到自己到房主的延遲。
- **C6 同角色快速重連**：新的 hello 帶同一個 charId，而舊連線已經沉默超過 `REPLACE_SILENT_MS = 5000`，就直接把舊的移除（`'timeout'`），讓新的進來。不必等 90 秒，例如客人重新整理頁面但 RTC 沒及時報斷線。
- **C7 建置版本**：`astro.config.mjs` 用 `vite.define` 注入 `__DELVE_BUILD__ = VERCEL_GIT_COMMIT_SHA ?? 'dev'`。`delve/net/build.ts` 匯出 `DELVE_BUILD`，用 `typeof` 守住沒有 define 的情況（vitest）。
- **C8 房主入口在遊戲中**：暫停選單的「開放加入」。房主一定要先進入自己的世界。客人入口在標題：選角色之後，世界清單面板裡的「加入朋友的世界」。
- **C9 遠端紙娃娃**
  - `Sprites.sheetFor(look, key, need)` 取任意樣子的影格表，不改目前的 `look` 和手臂快取。`SHEET_CACHE` 從 6 改成 10。
  - 遠端玩家只畫身體影格（跑、跳、待機），v1 不畫手持物和揮擊手臂。
- **C10 背景運作**：連線時 `NetLoop` 用 Worker 計時器。`RoomHost.poll` 也由同一個 loop 驅動，所以房主在背景時客人照樣能加入。主執行緒計時器只用在不影響正確性的 UI。

## Review Focus

1. **房主分頁在背景時有客人加入**：`RoomHost.poll` 必須由 `NetLoop` 驅動，不能靠 rAF 或主執行緒 `setTimeout`。測試在 Task 6 的「poll 只靠 loop 驅動」。
2. **房號輸入小寫、前後有空白，或含 0／O／1／I／L**：小寫要轉大寫並去掉空白；不在字母表裡的直接回 `badRoom`，不送請求。測試在 Task 4。
3. **300 秒 TTL 內殘留的舊槽位資料**：上一位客人留下的 `host-ack-i`（id 不同）必須忽略，不能接上別人的 answer。測試在 Task 4。
4. **連線中房主回標題或關分頁**：客人看到「主機已離線」（或 bye 的文案），最後一份 chk 已經寫入，`savedAt` 大於 0。測試在 Task 6。
5. **客人重新整理後馬上用同一個角色重進**：5 秒內必須能進，不能被 `charInUse` 卡 90 秒（C6）。測試在 Task 1。

---

### Task 1: NetHost／NetGuest 強化（sum 洪水、延遲關閉、ping、快速重連）

**Files:**
- Modify: `delve/net/protocol.ts`、`delve/net/host.ts`、`delve/net/guest.ts`、`delve/net/validate.ts`
- Test: `delve/net/host.test.ts`（沒有就新增 `delve/net/host.harden.test.ts`），用 `delve/net/testRig.ts` 的 `coopRig`

**Interfaces:**
- Produces（protocol.ts）：
  - 常數：`LINGER_MS = 2000`、`PING_MS = 2000`、`SUM_PARK_MAX = 32`、`REPLACE_SILENT_MS = 5000`。
  - HostCtrl 和 GuestCtrl 都新增 `{t:'ping', at:number}`、`{t:'pong', at:number}`。
- Produces（host.ts）：`GuestInfo` 新增 `rttMs: number | null`。新增 getter `get lingering(): number`，代表還在等延遲關閉的連線數。
- Produces（guest.ts）：`get rttMs(): number | null`。
- `close()` 之後 `frame(nowMs, 0)` 只處理延遲關閉。

- [ ] **Step 1：寫失敗的測試**（每個 `it` 一個行為）
  - `'遠方欄的 sum 先停放，走近才回 col'`
    - 客人送 `sum{cx: 遠方}`，其中 `|cx − 客人 cx| > NET_TILE_COLS`。
    - `run(500)` 之後，房主沒有對它呼叫 `ensureColumn`：spy `game.world.ensureColumn`，斷言沒有以該 cx 被呼叫。客人也沒收到該 cx 的 `col`。
    - 把客人 actor 傳送到該欄附近，`run(500)` 之後收到 `col`。
  - `'停放上限 32，同 cx 只留最新'`
    - 送 40 個不同的遠方 cx，房主內部停放數 ≤ 32。透過測試用 getter `host.debugParked(pid)`，只在測試中使用。
    - 同一個 cx 送 2 次，只算 1 筆。
  - `'reject 後 2 秒才關連線'`
    - 第 5 個人加入時被 `full` 拒絕。被拒的客人 `state === 'ended'`，`endText === END_TEXT.full`；房主那端的 link 在 `run(1900)` 時仍 `open`。
    - `run(200)` 之後關閉，`host.lingering === 0`。
  - `'close() 之後 bye 送達、2 秒後關閉'`
    - `host.close()` 之後持續呼叫 `frame`。客人收到 bye，`endText` 是 `END_TEXT.closed`。
    - 2 秒後房主那端的 link 已關閉。
  - `'ping 讓雙方都有 rtt'`
    - `coopRig({latencyMs:[40,40]})`，`run(3000)` 之後 `host.guests()[0].rttMs` 介於 70 到 200，`guest.rttMs` 也介於 70 到 200。
  - `'同角色舊連線沉默 5 秒以上 → 新 hello 取代'`
    - 不要 `sever`（它會觸發兩端 onClose）。讓舊客人停止呼叫 `frame`，舊 link 保持開著但不送訊息，模擬 RTC 沒及時報斷線。
    - 6 秒後用同一個角色、新的 pair 再 join，結果 `state` 會到 `'live'`，不是 `charInUse`。
    - 4 秒就重 join，結果是 `charInUse`。
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/net/host.harden.test.ts`
  - Expected: FAIL，原因是缺 `lingering`／`rttMs`、遠方 sum 被直接回覆。
- [ ] **Step 3：實作**
  - **host.ts**
    - `handle` 收到 `sum`：
      - 在 `NET_TILE_COLS` 內：如果 `g.jobs` 已經有同 cx 的 sum job，就換掉它的 sums；沒有才 push。
      - 在範圍外：放進 `g.parkedSums: Map<number, number[]>`，先 delete 再 set，讓它排到最新。超過 `SUM_PARK_MAX` 就刪掉最舊的。
    - `flush` 每次掃 `parkedSums`：
      - 距離 ≤ `NET_TILE_COLS`：移進 jobs。
      - 距離 > `2*NET_TILE_COLS`：丟掉。
      - 距離用 `chunkOfX(actor 中心 x)`，跟現有興趣範圍的計算一致。
    - 延遲關閉：
      - `reject()` 和帶 bye 的 `remove()` 把 `{link, at: now + LINGER_MS, charId}` 放進 `lingerQ`。
      - 每個 `frame` 開頭關掉到期的。
      - 延遲中的 link 收到訊息只處理 `pong`。`chkAck` 在 Task 2 加。
    - ping：每位客人 `nextPing`，到期送 `ping{at: now}`。收到 `pong{at}` → `rttMs = now - at`。收到客人的 `ping{at}` → 回 `pong{at}`。
    - `onHello`：同 charId 的舊連線沉默超過 `REPLACE_SILENT_MS` 就 `remove(dup,'timeout')`。這條取代原本的 `GUEST_TIMEOUT_MS` 判斷。
  - **guest.ts**：同樣的 ping 和 pong，`rttMs` 從第一個 pong 才開始有值。
  - **validate.ts**：`parseGuestCtrl` 和客人端解析都接受 `ping`／`pong`，`at` 必須是有限數。
- [ ] **Step 4：跑測試確認通過，再跑 `delve/net` 全部測試確認沒回歸**
  - Run: `npx vitest run src/scripts/games/delve/net`
  - Expected: 全部 PASS。
- [ ] **Step 5：Commit** `fix(delve): co-op host hardening — park far sums, linger close, ping, fast rejoin`

### Task 2: 確認收到的 checkpoint 與存進世界檔的 held 角色（C1）

**Files:**
- Modify: `delve/net/protocol.ts`、`delve/net/host.ts`、`delve/net/guest.ts`、`delve/net/validate.ts`、`delve/net/testRig.ts`、`delve/save/worldSave.ts`、`delve/save/split.ts`
- Test: `delve/net/coop.test.ts`（A10c 改寫並新增）、`delve/save/worldSave.test.ts`、`delve/save/split.test.ts`（沒有就新增）

**Interfaces:**
- Produces（protocol.ts）：
  - `export const BOUNDARY_OPS: ReadonlySet<Cmd['op']>`，從 host.ts 搬過來，內容不變。
  - `chk` 改成 `{t:'chk', rev, character, upTo:number}`。
  - GuestCtrl 新增 `{t:'chkAck', rev:number}`。
- Produces（worldSave.ts）：
  - `export interface HeldChar { rev: number; character: DelveCharacter; at: number }`
  - `export type HeldMap = Record<string, HeldChar>`
  - `WorldHeader` 和 `WorldIdentity` 新增 `held?: HeldMap`（可選，**不升 format**）。
  - 讀檔時單筆 held 不合法只丟那一筆：`validateCharacter` 失敗，或 rev 不是 ≥0 的整數。
  - 寫檔用 LRU，以 `at` 為準，上限 `MAX_VISITS`。
- Produces（host.ts）：`VisitStore` 新增 `getHeld(charId: string): HeldChar | undefined` 和 `putHeld(charId: string, h: HeldChar | null): void`。`retained` 這個 Map 移除，改用 store。`GuestInfo` 新增 `ackedRev: number`。
- Produces（split.ts `SplitSession`，即正式的 `VisitStore`）：
  - `get worldId(): string`
  - `get(charId): VisitSave | undefined`、`put(charId, v: VisitSave): void`（用 `upsertVisit`）
  - `getHeld(charId)`、`putHeld(charId, h)`
  - `snapshotData` 寫出的 world header 要帶 `held`。
- Produces（guest.ts）：
  - `NetGuestOptions.onCheckpoint?: (c: DelveCharacter, rev: number) => void | Promise<void>`
  - `lastCheckpoint: {rev, character, upTo} | null`
  - `get unconfirmed(): boolean`：最後一個送出的跨邊界 cmd seq 大於 `lastCheckpoint?.upTo ?? 0`。
  - `get worldId(): string | null`

- [ ] **Step 1：寫失敗的測試**
  - `coop.test.ts`，A10c 改寫為 `'A10c：chk 在途中斷線 → 房主重新載入世界後重連，總數仍是 1'`
    - 情境同現行：存入箱子後立刻 `sever`。
    - 接著用**同一個** VisitStore 和同一個 game 建立新的 `NetHost` 並 `open()`，模擬房主重新整理。testRig 加 `rehost()` 輔助。
    - 客人 `reconnect` 之後：`invCount + chests === 1`。
    - 斷線當下 `guests[0].unconfirmed === true`。
  - `'A10d：正常 chk 送達並 ack 後，held 被清掉'`
    - 存入箱子，`run(500)`，客人離開。
    - `run(3000)` 之後，`store.getHeld(charId) === undefined`。
  - `'chkAck 等 onCheckpoint 的 promise 完成才送'`
    - onCheckpoint 回傳一個手動 resolve 的 promise。resolve 之前房主的 `ackedRev` 不變，resolve 並 `run(100)` 之後 `ackedRev === rev`。
  - `'chk.upTo 跟上最後處理的 cmd'`
    - 客人送 3 個 cmd，其中最後一個是跨邊界操作。`run(500)` 之後 `lastCheckpoint.upTo` 等於那個 seq，`unconfirmed === false`。
  - `worldSave.test.ts`：
    - `'held round-trip'`
    - `'不合法的 held 只丟那一筆'`
    - `'held LRU：第 9 筆擠掉 at 最舊的'`
  - `split.test.ts`：
    - `'SplitSession.put/get/putHeld 之後 snapshot 的 world header 帶 visits 與 held'`
    - `'snapshot 不會把其他角色的 held 清掉'`
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/net/coop.test.ts src/scripts/games/delve/save`
  - Expected: FAIL。
- [ ] **Step 3：實作**
  - **host.ts**
    - `g.lastCmdSeq` 記錄處理過的最大 seq，`chk` 帶 `upTo: g.lastCmdSeq`。
    - `remove()`：`putHeld(charId, {rev, character, at: Date.now()})`，取代 `retained.set`。
    - `onHello`：用 `getHeld` 比 rev，加入成功後 `putHeld(charId, null)`。
    - 收到 `chkAck{rev}`，正常 link 或延遲中的 link 都算：
      - `g.ackedRev = max(g.ackedRev, rev)`。
      - 如果這位客人已經被移除，且 `held.rev ≤ rev`，就 `putHeld(charId, null)` 並 `saveSoon()`。
  - **guest.ts**
    - 送 cmd 時，op 在 `BOUNDARY_OPS` 裡就記下 `boundarySeq = seq`。
    - 收到 chk 先存 `lastCheckpoint`，等 `onCheckpoint` 的 promise resolve 之後，如果 link 還開著就送 `chkAck{rev}`。
    - `drainAfterLeave` 要等最後一份 chk 的 ack 送出才 `close`，最晚 `LEAVE_GRACE_MS`。
  - **worldSave.ts／split.ts**：照 Interfaces 實作。`held` 跟 visits 一樣以角色 id 為 key，驗證寫法比照 visits。
- [ ] **Step 4：跑測試確認通過**
  - Run: `npx vitest run src/scripts/games/delve/net src/scripts/games/delve/save`
  - Expected: 全部 PASS。
- [ ] **Step 5：Commit** `feat(delve): acknowledged co-op checkpoints with held characters in the world save`

### Task 3: `RtcLink`：三通道 WebRTC 的 NetLink

**Files:**
- Create: `delve/net/rtcLink.ts`、`delve/net/rtcLink.test.ts`
- Modify: `tetris/net/webrtcTransport.ts`，只把 `RTC_CONFIG` 加上 `export`

**Interfaces:**
- Consumes: `NetLink`、`Channel`、`Payload`（`delve/net/link.ts`），`RTC_CONFIG` 和 `waitIceGatherComplete`（`tetris/net/webrtcTransport.ts`）。
- Produces:
  ```ts
  export const CHANNEL_IDS = { ctrl: 0, bulk: 1, state: 2 } as const;
  export const FRAG_BYTES = 16 * 1024;
  export const STATE_MAX_BYTES = 16 * 1024;
  export interface RtcPeer {
    readonly link: NetLink;
    createOffer(): Promise<string>;
    createAnswer(offer: string): Promise<string>;
    acceptAnswer(answer: string): Promise<void>;
    waitOpen(timeoutMs?: number): Promise<void>;   // 預設 20000；三條都 open 才 resolve；逾時 reject 'rtc open timeout' 並清掉計時器
  }
  export function createRtcPeer(makePc?: () => RTCPeerConnection): RtcPeer;
  ```
- 行為：
  - 建構時兩端都用 `negotiated:true` 和固定 id 開三條 channel：ctrl、bulk 是 `ordered:true`，state 是 `ordered:false, maxRetransmits:0`。全部設 `binaryType='arraybuffer'`。
  - 可靠通道（ctrl、bulk）一律送二進位片段：`[flags, ...payload]`，flags 的 bit0 是 FINAL，bit1 是 TEXT（ctrl 的字串用 TextEncoder 轉）。每片 payload ≤ `FRAG_BYTES`。收端重組後交給 `onMessage`：ctrl 交字串，bulk 交 `Uint8Array`。
  - state 直接送字串。超過 `STATE_MAX_BYTES` 就靜默丟掉。
  - `buffered(ch)` 回傳該 channel 的 `bufferedAmount`。
  - `onClose` 只觸發一次，觸發條件：
    - 任一條 channel 的 close 或 error，reason 是 `'closed'`。
    - `pc.connectionState` 變成 `'failed'`（reason `'failed'`）或 `'closed'`（reason `'closed'`）。
    - **`'disconnected'` 不算**，可能會自己恢復（U9）。
  - 本地 `close(reason)` 會關掉 pc，本地 onClose 帶這個 reason。關閉後 `send` 靜默丟掉。

- [ ] **Step 1：寫失敗的測試**
  - 在測試檔內寫 `MockPc`／`MockDc`，形狀參考 `tetris/net/webrtcTransport.test.ts:93-136`。`linkPair(a, b)` 用 `queueMicrotask` 把兩邊同 id 的 channel 接起來，並模擬 `onopen`。安裝方式是 `createRtcPeer(() => new MockPc() as unknown as RTCPeerConnection)`。
  - `'ctrl 100 KB 字串分片後完整收到'`：每片 ≤ `FRAG_BYTES + 1`。
  - `'bulk 70 KB 位元組逐位元相等'`
  - `'state 小訊息直接送；超過 16 KB 丟掉'`
  - `'buffered 回傳 bufferedAmount'`
  - `'遠端關閉 → onClose 一次'`
  - `'connectionState disconnected 不關；failed 關且 reason=failed'`
  - `'waitOpen 逾時 reject 且不留計時器'`：用 `vi.useFakeTimers()`，結束時 `vi.getTimerCount() === 0`。
  - `'關閉後 send 靜默'`
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/net/rtcLink.test.ts`
  - Expected: FAIL，找不到模組。
- [ ] **Step 3：照 Interfaces 實作 `delve/net/rtcLink.ts`**
  - offer 和 answer 的流程照抄 `WebRtcTransport.createOffer/createAnswer/acceptAnswer`（`tetris/net/webrtcTransport.ts:82-101`），也就是非 trickle 的 `waitIceGatherComplete`。
- [ ] **Step 4：跑測試確認通過**
  - Run: `npx vitest run src/scripts/games/delve/net/rtcLink.test.ts src/scripts/games/tetris/net`
  - Expected: 全部 PASS。
- [ ] **Step 5：Commit** `feat(delve): three-channel WebRTC NetLink`

### Task 4: 信令：`RoomHost` 與 `joinRoom`

**Files:**
- Create: `delve/net/rtcSignal.ts`、`delve/net/rtcSignal.test.ts`、`delve/net/fakeRtc.ts`（測試用的假信令和假 peer，跟 `testRig.ts` 同性質）

**Interfaces:**
- Consumes: `RtcPeer`（Task 3），`createRoom`、`putSlot`、`getSlot`（`tetris/net/signalClient.ts:55,72,82`，第 4 個參數是 ns）。
- Produces（rtcSignal.ts）：
  ```ts
  export const DELVE_NS = 'delve:';
  export const JOIN_SLOTS = 4;            // 用 guest-0..3-offer / host-ack-0..3
  export const HOST_POLL_MS = 3000;
  export const JOIN_IDLE_MS = 600_000;    // 開放加入後 10 分鐘沒有新客人 → 自動停止加入（R7）
  export const ACK_POLL_MS = 1200;
  export const ACK_TIMEOUT_MS = 30_000;
  export const ROOM_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/;
  export interface SignalApi { createRoom(): Promise<string>; put(room: string, slot: string, data: string): Promise<void>; get(room: string, slot: string): Promise<string | null> }
  export const realSignalApi: SignalApi;  // 包 tetris signalClient，put/get 帶 DELVE_NS
  export function normalizeRoom(raw: string): string | null;   // trim + toUpperCase；不符 ROOM_RE → null
  export type JoinErrorCode = 'full' | 'noHost' | 'rtc' | 'badRoom';
  export const JOIN_ERROR_TEXT: Record<JoinErrorCode, string>;
  export class JoinError extends Error { constructor(readonly code: JoinErrorCode) }
  export class RoomHost {
    constructor(api: SignalApi, makePeer: () => RtcPeer, onLink: (link: NetLink) => void);
    open(nowMs: number, room?: string): Promise<string>;  // 沒給 room → api.createRoom()
    poll(nowMs: number): void;    // 距上次 < HOST_POLL_MS 或上一輪還在跑 → 什麼都不做
    reopen(nowMs: number): void;  // 自動停止後重新開放（同一個房號）
    close(): void;
    get room(): string | null;
    get joining(): boolean;
  }
  export function joinRoom(api: SignalApi, makePeer: () => RtcPeer, rawRoom: string,
    opts?: { sleep?: (ms: number) => Promise<void>; now?: () => number }): Promise<NetLink>;
  ```
- `JOIN_ERROR_TEXT`（逐字）：
  - `full: '房間已滿'`
  - `noHost: '找不到這個房號，或主機沒有開放加入'`
  - `rtc: '連線失敗，可能是網路環境不支援直連（NAT）'`
  - `badRoom: '房號是 5 個英數字'`
- 槽位內容：
  - `guest-i-offer` 放 `JSON {id, offer}`。
  - `host-ack-i` 放 `JSON {id, answer}`。
  - 墓碑是空字串 `''`。讀到 `null` 或 `''` 都當作空槽。
- `RoomHost` 每一輪掃 `0..JOIN_SLOTS-1`：
  1. 讀到非空且 id 沒看過的 offer → 記下 id，`put(guest-i-offer, '')`。
  2. `makePeer().createAnswer(offer)` → `put(host-ack-i, JSON{id, answer})` → `waitOpen()` → `onLink(peer.link)`。
  3. 每位客人並行處理，單一客人失敗不影響輪詢。
  4. `nowMs - lastJoinAt > JOIN_IDLE_MS` 時 `joining = false`。`lastJoinAt` 從 `open` 那一刻開始算，每有一位客人連上就更新。
- `joinRoom`：
  1. `normalizeRoom`，不合法丟 `badRoom`。
  2. `createOffer`。
  3. 依序找空槽寫入，沒有空槽丟 `full`。
  4. 每 `ACK_POLL_MS` 讀一次 `host-ack-i`，id 不同就忽略。
  5. 對上之後 `put(host-ack-i,'')` → `acceptAnswer` → `waitOpen(20000)`，失敗丟 `rtc`。
  6. 超過 `ACK_TIMEOUT_MS` 就 `put(guest-i-offer,'')` 並丟 `noHost`。
- Produces（fakeRtc.ts）：
  - `class FakeSignal implements SignalApi`：用 Map 存，`createRoom` 回傳固定序列 `'ABCDE'`、`'FGHJK'`…，並提供 `calls` 計數。
  - `fakePeerFactory(net: LoopbackNet): () => RtcPeer`：offer 字串帶一個 token，answer 端用 token 配對同一個 `net.pair()`，`waitOpen` 立即 resolve。
  - `manualTicker(): Ticker & { fire(nowMs: number): void }`

- [ ] **Step 1：寫失敗的測試**，用 `FakeSignal`、`fakePeerFactory` 和注入的 `sleep`
  - `'host open 回房號；guest join 後雙方拿到同一對 link'`
  - `'房號小寫加空白可加入；含 O 或 1 直接 badRoom 且沒有呼叫 api'`
  - `'殘留的別人 host-ack 被忽略'`：預先在 `host-ack-0` 寫入 id 不同的 ack，客人仍然等到自己的 answer。
  - `'4 個槽都被占 → full'`
  - `'沒有房主 → 30 秒後 noHost，且自己的 offer 槽被清成空字串'`
  - `'poll 3 秒內只掃一輪'`：計算 `FakeSignal.calls.get`。
  - `'開放 10 分鐘沒人來 → joining=false；reopen 後恢復'`
  - `'同一個 offer id 只處理一次'`
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/net/rtcSignal.test.ts`
  - Expected: FAIL。
- [ ] **Step 3：照 Interfaces 實作 `rtcSignal.ts` 和 `fakeRtc.ts`**
- [ ] **Step 4：跑測試確認通過**
  - Run: `npx vitest run src/scripts/games/delve/net/rtcSignal.test.ts`
  - Expected: PASS。
- [ ] **Step 5：Commit** `feat(delve): room-code signaling for co-op (guest-initiated star)`

### Task 5: Worker 計時器與建置版本

**Files:**
- Create: `delve/net/workerTicker.ts`、`delve/net/workerTicker.test.ts`、`delve/net/build.ts`
- Modify: `astro.config.mjs`（`vite.define`），`src/env.d.ts`（`declare const __DELVE_BUILD__: string | undefined;`；檔案不存在就找現有的 `*.d.ts` 加）

**Interfaces:**
- Consumes: `Ticker`、`intervalTicker`（`delve/net/loop.ts:6,9`）。
- Produces:
  ```ts
  export interface TickWorker { postMessage(ms: number): void; onmessage: ((e: { data: unknown }) => void) | null; terminate(): void }
  export function workerTicker(make?: () => TickWorker): Ticker;
  export const DELVE_BUILD: string;   // build.ts
  ```
- 行為：
  - 預設的 `make` 用 Blob URL 建 Worker，原始碼是：
    ```js
    let id = 0; onmessage = (e) => { clearInterval(id); if (e.data > 0) id = setInterval(() => postMessage(0), e.data); };
    ```
  - `typeof Worker !== 'function'` 或建構時丟錯，就退回 `intervalTicker()`。
  - `start(cb, everyMs)` 送出 `postMessage(everyMs)`，每收到一則訊息就呼叫 `cb(performance.now())`。
  - `stop()` 送 `postMessage(0)` 並 `terminate()`。
- [ ] **Step 1：寫失敗的測試**
  - `'start 把間隔送給 worker；訊息觸發 cb'`
  - `'stop 後 terminate，之後的訊息不再呼叫 cb'`
  - `'沒有 Worker → 退回 setInterval'`：用 `vi.useFakeTimers()`，`vi.stubGlobal('Worker', undefined)`。
  - `'DELVE_BUILD 在 vitest 下是 dev'`
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/net/workerTicker.test.ts`
  - Expected: FAIL。
- [ ] **Step 3：實作，並在 `astro.config.mjs` 的 `vite` 加上 `define: { __DELVE_BUILD__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev') }`**
  - 先看 `vite` 區塊是否已經有 `define`，有就合併。
- [ ] **Step 4：跑測試確認通過**
  - Run: `npx vitest run src/scripts/games/delve/net/workerTicker.test.ts`，以及 `rtk proxy npx tsc --noEmit -p .`
  - Expected: PASS，tsc 沒有新錯誤。
- [ ] **Step 5：Commit** `feat(delve): worker-driven net ticker and build id`

### Task 6: `CoopHostSession`／`CoopGuestSession`（DOM-free 協調層）

**Files:**
- Create: `delve/net/hostSession.ts`、`delve/net/guestSession.ts`、`delve/net/coopSession.test.ts`
- Modify: `delve/save/split.ts` 的 `SplitStore.putCharacter`，`delve/save/storage.ts` 的 `CharacterRecord`、`CharacterMeta`、`putCharacter`、`listCharacters`

**Interfaces:**
- Consumes:
  - `NetHost`、`VisitStore`（Task 2）、`NetGuest`、`GuestState`、`PeerView`、`END_TEXT`
  - `NetLoop`、`Ticker`、`LOOP_EVERY_MS`
  - `RoomHost`、`joinRoom`、`SignalApi`、`JoinError`（Task 4）
  - `RtcPeer`（Task 3）、`LINGER_MS`（Task 1）
- Produces（storage／split）：
  - `putCharacter(c: DelveCharacter, opts?: { pendingWorld?: string | null }): Promise<void>`。不給或給 null 都會清掉記錄上的 `pendingWorld`。
  - `CharacterMeta.pendingWorld?: string`
- Produces（hostSession.ts）：
  ```ts
  export interface CoopPlayer { pid: string; nick: string; self: boolean; rttMs: number | null; phase: 'hello' | 'syncing' | 'live' }
  export interface HostSessionDeps { signal: SignalApi; makePeer: () => RtcPeer; ticker: Ticker; build: string; visits: VisitStore & { worldId: string }; requestSave: () => void; nick: string }
  export class CoopHostSession {
    constructor(game: DelveGame, deps: HostSessionDeps);
    open(): Promise<string>;                 // NetHost.open() → NetLoop.start() → RoomHost.open()；回房號
    get room(): string | null; get joining(): boolean; reopenJoin(): void;
    players(): CoopPlayer[];                 // 自己（pid = game.localPid）排第一
    onChange(cb: (e: { type: 'join' | 'leave'; nick: string }) => void): void;  // 以 phase 變成 live／從 guests() 消失判定
    close(): Promise<void>;                  // 停止加入 → host.close() → loop 再跑 LINGER_MS → stop；resolve 時 game.mode === 'solo'
  }
  ```
  loop 的 run 是 `(t, s) => { host.frame(t, s); room.poll(t); diffPlayers(); }`。
- Produces（guestSession.ts）：
  ```ts
  export type CoopGuestPhase = 'signaling' | GuestState | 'failed';
  export interface GuestSessionDeps { signal: SignalApi; makePeer: () => RtcPeer; ticker: Ticker; build: string; character: DelveCharacter;
    persist: (c: DelveCharacter, pendingWorld: string | null) => Promise<void>; now?: () => number }
  export class CoopGuestSession {
    constructor(deps: GuestSessionDeps);
    join(room: string): Promise<void>;      // 失敗 reject JoinError，phase='failed'；成功後 phase 跟著 NetGuest.state
    get phase(): CoopGuestPhase; get game(): DelveGame | null; get endText(): string | null;
    get worldId(): string | null; get rttMs(): number | null; peers(): PeerView[];
    onPhase(cb: (p: CoopGuestPhase) => void): void;
    leave(): Promise<void>;                  // guest.leave()，loop 跑到 link 關閉或 LEAVE_GRACE + 500 ms
  }
  ```
  - `onCheckpoint = (c) => persist({ ...c, savedAt: now() }, null)`（C4）。
  - phase 變成 `'ended'` 時，如果 `guest.unconfirmed` 而且有 `lastCheckpoint`，就呼叫 `persist({ ...lastCheckpoint.character, savedAt: now() }, worldId)`，然後停止 loop。

- [ ] **Step 1：寫失敗的測試**（`coopSession.test.ts`）
  - 共用設定：`FakeSignal` + `fakePeerFactory(new LoopbackNet())` + `manualTicker()`。用迴圈 `fire(t += FRAME)` 推進時間，並在其中 `net.advance(FRAME)`。
  - `'房主開房 → 客人加入 → 雙方 players/peers 都有 2 人，客人 phase=live'`
  - `'poll 只靠 loop 驅動'`：不呼叫 `fire` 時，`FakeSignal.calls` 不增加（Review Focus 1）。
  - `'onChange 收到 join 與 leave，nick 正確'`
  - `'客人收到 chk → persist 的 savedAt > 0、pendingWorld=null'`
  - `'客人 leave → persist 最後一份 chk，phase=ended，link 關閉'`
  - `'房主 close → 客人 endText 是 END_TEXT.closed，最後 chk 已 persist'`（Review Focus 4）
  - `'跨邊界操作後立刻斷線 → persist 帶 pendingWorld=worldId'`
  - `'close() resolve 後 game.mode === solo、loop 停止'`
  - `storage`：`'putCharacter 帶 pendingWorld 時 listCharacters 看得到；之後一般 putCharacter 會清掉'`。用現有 storage 測試的 fake-indexeddb 寫法，先 grep `fake-indexeddb`；沒有就改在 split 的記憶體 store 測。
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/net/coopSession.test.ts`
  - Expected: FAIL。
- [ ] **Step 3：照 Interfaces 實作**
- [ ] **Step 4：跑測試確認通過**
  - Run: `npx vitest run src/scripts/games/delve/net src/scripts/games/delve/save`
  - Expected: PASS。
- [ ] **Step 5：Commit** `feat(delve): co-op host/guest sessions over signaling and RTC`

### Task 7: 遠端玩家渲染與名牌

**Files:**
- Create: `delve/render/remotePlayers.ts`、`delve/render/remotePlayers.test.ts`、`delve/render/nameplates.ts`
- Modify: `delve/render/sprites.ts`（`sheetFor`、`SHEET_CACHE`），`delve/render/renderer.ts`（`setRemoteSource` 和繪製順序），`src/pages/games/delve.astro`（`.delve-nameplate` CSS）

**Interfaces:**
- Consumes: `PeerView`（`delve/net/guest.ts:43`），`PlayerAnimator`／`AnimInput`（`delve/render/playerAnim.ts:29,44`），`game.withActor`、`game.doll()`、`dollKey`（sprites.ts 現在 import 的來源），`renderer.worldToScreen`（`renderer.ts:310`）。
- Produces:
  ```ts
  // sprites.ts
  sheetFor(look: DollLook, key: string, need?: number): DollSheet;   // dollSheet(need) 改成 sheetFor(this.look, this.key, need)
  // remotePlayers.ts
  export interface RemoteView { pid: string; nick: string; look: DollLook | null; key: string; x: number; y: number; vx: number; vy: number; facing: 1 | -1; dead: boolean }
  export function hostRemoteViews(game: DelveGame): RemoteView[];      // 非本地 actor；nick = a.who?.nick ?? ''；look 來自 withActor(a, () => game.doll())
  export class GuestViews { views(peers: PeerView[], dt: number): RemoteView[] }   // vx/vy 用前一幀位置差 / dt；key = dollKey(look)
  export class RemotePlayers { draw(ctx: CanvasRenderingContext2D, sprites: Sprites, views: RemoteView[], dt: number, toPx: (x: number, y: number) => { x: number; y: number }): void }
  // nameplates.ts
  export class Nameplates { constructor(container: HTMLElement); update(views: RemoteView[], worldToScreen: (x: number, y: number) => { x: number; y: number }): void; destroy(): void }
  // renderer.ts
  setRemoteSource(fn: (() => RemoteView[]) | null): void;
  ```
- 行為：
  - 繪製順序：`folkLayer.drawWorld` 之後、`drawPlayer` 之前畫遠端玩家。
  - 每個 pid 有自己的 `PlayerAnimator`，輸入是 `{dt, dead, climbing:false, mantle:null, onGround: |vy| < 0.05, vx, vy, swim:false, sinceHurt: 99}`。
  - 死掉的玩家和 `look === null` 的不畫身體。名牌照樣顯示，死掉的名牌加上 `is-dead`。
  - 名牌是 `span.delve-nameplate`，放在 `#delve-wlabels`，用 `--x`／`--y` 定位在頭頂上方。消失的 pid 要移除元素。

- [ ] **Step 1：寫失敗的測試**
  - `'sheetFor 不改 dollKey，也不清手臂快取'`：記下 `bakes.arms`；呼叫 `arm()`，再 `sheetFor(另一個 look)`，再呼叫同樣的 `arm()`，`bakes.arms` 不增加。
  - `'hostRemoteViews 排除本地 actor，帶 nick 與 look'`：用 `testRig` 的 `arenaGame` 加一個 actor。
  - `'GuestViews 由位置差算 vx'`
  - `'RemotePlayers.draw：活著且有 look 的才 drawImage'`：mock ctx 計數 `drawImage`。
  - `'Nameplates：新增、移動、移除元素'`：先看現有 DOM 測試用的環境，例如 `// @vitest-environment happy-dom` 或 jsdom，照抄。
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/render/remotePlayers.test.ts src/scripts/games/delve/render/sprites.test.ts`
  - Expected: FAIL。
- [ ] **Step 3：照 Interfaces 實作**，CSS 加 `.delve-nameplate`，風格比照 `.delve-say`（`delve.astro` 約 1961 行）。
- [ ] **Step 4：跑測試確認通過**
  - Run: `npx vitest run src/scripts/games/delve/render`
  - Expected: PASS。
- [ ] **Step 5：Commit** `feat(delve): draw remote players with nameplates`

### Task 8: UI 接線（開放加入、加入房間、玩家名單、離開與結束）

**Files:**
- Create: `delve/render/coopUi.ts`（HUD 的房號和玩家名單、暫停選單按鈕狀態）
- Modify: `src/pages/games/delve.astro`（markup 和 CSS），`delve/render/titleUi.ts`（新增 `join` 面板、角色列的「待同步」），`delve/render/session.ts`（host 和 guest 流程、`__delveDebug.coop`），`delve/render/main.ts`（`StartOptions.remotes`）

**Interfaces:**
- Consumes: Task 6 的 `CoopHostSession`、`CoopGuestSession`、`CoopPlayer`，Task 7 的 `hostRemoteViews`、`GuestViews`、`Nameplates`、`setRemoteSource`，`realSignalApi`、`JOIN_ERROR_TEXT`、`createRtcPeer`、`workerTicker`、`DELVE_BUILD`。
- Produces:
  - `StartOptions.remotes?: () => RemoteView[]`
  - `TitlePanel` 加入 `'join'`（parent `'worlds'`）
  - `TitleHandlers.onJoin(room: string): void`
  - `window.__delveDebug.coop?: { role: 'host' | 'guest'; room: string | null; phase: string; players(): { pid: string; nick: string }[] }`
  - `root.dataset.coop = 'host' | 'guest'`，不在連線中時刪掉
- Markup（id 和文案逐字）：
  - 暫停選單 `#delve-save` 之前加 `<button class="delve-btn" id="delve-coop">開放加入</button>`。房間開著時文字是「停止加入」，自動停止後是「重新開放加入」。
  - HUD 加 `<div class="delve-coop-box" id="delve-coop-box" hidden>`，內容：
    - `<p class="delve-chip" id="delve-room-chip">`，文字「房號 ABCDE」。
    - `<ul class="delve-players" id="delve-players">`，每列是 `li`，文字「暱稱 · 45ms」；自己標「（你）」；還沒有延遲時顯示「暱稱 · …」。
  - 世界清單面板加 `<button class="delve-btn" id="delve-join-open">加入朋友的世界</button>`。
  - 新面板 `<section class="delve-tpanel" data-tpanel="join" id="delve-joinpanel" hidden role="dialog">`，結構照現有 tpanel，標題「加入朋友的世界」。內容：
    - `<input class="delve-input" id="delve-room" maxlength="5" autocomplete="off" placeholder="房號">`
    - `<button class="delve-btn" id="delve-join">加入</button>`
    - `<p class="delve-msg" id="delve-join-msg">`
  - 角色列：`pendingWorld` 有值時，在 row 裡加 `span.delve-trow-badge`，文字「待同步」。
- 流程：
  - **房主**
    - 按 `#delve-coop`，用 `SplitSession` 當 `visits` 建 `CoopHostSession`，`requestSave` 用 `saveNow`。
    - `open()` 之後設 `dataset.coop='host'`，顯示房號。
    - 客人加入或離開時 toast：「「暱稱」加入了世界」／「「暱稱」離開了世界」。
    - `renderer` 的 remotes 用 `hostRemoteViews(game)`。
    - 回標題時先 `await coop.close()` 再 `saveNow()`。
  - **客人**
    - 在 `#delve-join` 時：`normalizeRoom` 不合法就在 `#delve-join-msg` 顯示 `JOIN_ERROR_TEXT.badRoom`。
    - `lockFor([charLock(id)])` 之後 `transition('連線中…', …)`。
    - phase 是 `'syncing'` 時，載入文字改成「同步世界中…」。到 `'live'` 時 `beginGuest(guest.game)`：跟 `begin()` 一樣，但**不啟動世界 autosave，不取世界鎖**，`save` 是 no-op。remotes 用 `GuestViews`。
    - JoinError 時回到 join 面板，顯示 `JOIN_ERROR_TEXT[code]`。
    - 遊戲中 phase 變成 `'ended'`：回標題，`#delve-title-msg` 顯示 `endText`。
    - `#delve-to-title` 在客人模式的文字是「離開房間」，按下 `await leave()` 再回標題。
  - **`[data-coop="guest"]` 時用 CSS 隱藏** `#delve-save`、`#delve-export`、`#delve-import-menu`、`#delve-peaceful`、`#delve-coop`。
  - **選到 `pendingWorld` 的角色**：用現有的 `askConfirm` 跳確認，文案逐字：「這個角色上次在朋友的世界斷線時，最後一筆交易還沒確認。回到那個世界會以主機的紀錄為準；先在別的世界玩，那筆物品可能重複或消失。要繼續嗎？」

- [ ] **Step 1：寫失敗的測試**
  - `titleUi`：如果有現成測試檔，就加 `'join 面板：Esc 回到 worlds'` 和 `'pendingWorld 的角色列有待同步徽章'`。
  - `coopUi.test.ts`：`'玩家名單：自己排第一、延遲格式「暱稱 · 45ms」、沒有延遲顯示 …'`、`'房號 chip 文字'`。DOM 環境照 Task 7。
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/render`
  - Expected: FAIL。
- [ ] **Step 3：照上面實作**
- [ ] **Step 4：跑測試確認通過**
  - Run: `npx vitest run src/scripts/games/delve`，以及 `rtk proxy npx tsc --noEmit -p .`
  - Expected: PASS，沒有新的 tsc 錯誤。
  - 再跑 `npx playwright test tests/e2e/delve.spec.ts --project=chromium`，確認單機沒回歸。「G 跟其他遊戲鍵」在 master 也會失敗，單獨重跑通過即可。
- [ ] **Step 5：Commit** `feat(delve): co-op lobby UI — open room, join by code, player list`

### Task 9: 雙瀏覽器 e2e，以及 spec 和文件收尾

**Files:**
- Create: `tests/e2e/delve-online.spec.ts`
- Modify: `docs/superpowers/specs/2026-10-20-delve-coop-design.md`

**Interfaces:**
- Consumes: Task 8 的 DOM id 和 `__delveDebug.coop`。

- [ ] **Step 1：寫 e2e**
  - 照 `tests/e2e/bomber-online.spec.ts` 的方式：只跑 chromium，`test.setTimeout(180_000)`，2 個 `browser.newContext()`，打真的 `/api/signal`（e2e server 是單一 process，用 MemoryStore）。
  - 房主：`/games/delve?seed=coop-e2e&autostart=1&fresh=1` → `waitGame` → 開選單（`#delve-menu-btn`）→ 按 `#delve-coop` → 從 `#delve-room-chip` 讀出 5 碼。
  - 客人：`pressStart` → 新角色（暱稱「客人」）→ 世界面板按 `#delve-join-open` → 填 `#delve-room` → 按 `#delve-join` → `waitForFunction(() => window.__delveDebug?.coop?.phase === 'live')`，60 秒。
  - 斷言：
    - 雙方 `__delveDebug.coop.players().length === 2`。
    - 在房主那端用測試現有的給物品方法給客人 actor 一個土塊。grep `delve.spec.ts` 看是怎麼給的，改成對客人的 actor。
    - 客人以真實輸入放下那個方塊（照 `delve.spec.ts` 的放置寫法），房主那端 `game.world` 同一格的 fg 變成那個方塊。
    - 房主 `document.querySelectorAll('.delve-nameplate')` 有 1 個，文字是「客人」。
    - 客人按「離開房間」回到標題後，在客人頁面讀 IDB `delve`／`characters`，該角色的 `savedAt > 0`。
- [ ] **Step 2：跑 e2e**
  - Run: `npx playwright test tests/e2e/delve-online.spec.ts --project=chromium`
  - Expected: PASS。失敗時先依 `docs/claude/verify.md` 排查環境（4002 埠、MemoryStore 是否同一個 process），再改程式碼。
- [ ] **Step 3：更新 spec**
  - 修訂行加一句「2026-10-22 M-C」。
  - §5.7 的「已知剩餘窗口」改成 C1 的描述。
  - §5.8 補 C2–C10。
  - §6 M-C 的驗收補「背景 10 分鐘、兩台實機由擁有者實測」。
- [ ] **Step 4：全套驗證**
  - Run: `npx vitest run`
  - Expected: 只允許已知的 tetris ffaLayout 5 秒逾時失敗。
  - 另外跑 `rtk proxy npx tsc --noEmit -p .`，Expected: 沒有新錯誤。
- [ ] **Step 5：Commit** `test(delve): two-browser co-op e2e; docs: co-op spec M-C decisions`

## 擁有者實測（合併前，附 4321 連結）

1. 同一台電腦開兩個視窗，一個 Chrome、一個 Edge 或無痕視窗：房主開放加入，客人輸入房號加入，雙方互相看得到並一起挖。
2. 房主把分頁切到背景 10 分鐘，客人持續遊玩，世界不會停（U8）。
3. 客人切到背景 10 分鐘再回來，沒有斷線（U9）。
4. 兩台實機：同一個 Wi-Fi，加上一台用手機熱點。
