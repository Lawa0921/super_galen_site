# DELVE 連線 M-C2：遠端玩家完整動作與 8 人 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每位玩家在每個人的畫面上都跟本地玩家畫得一樣：手持物、揮擊、挖掘、瞄準、攀爬、翻上邊緣、釣魚、划船、受傷閃爍都要看得到。一個世界最多 8 人（房主加 7 位客人）。

**Architecture:**
- 新增一份精簡的 `PlayerPose`，描述「畫一個玩家需要的全部狀態」。引擎用 `game.poseOf(pid)` 產生。
- 房主把每位玩家的 pose 放進 `ws`。客人在本地預測自己的移動，動作狀態（攻擊、挖掘、釣魚）則用房主回報的那一份。
- renderer 的 `drawPlayer` 抽成 `AvatarPainter`，以 pose、紙娃娃和每人各自的動畫狀態作畫。本地和遠端走同一條路。
- `Sprites` 的手臂和翻邊手掌快取改成以紙娃娃 key 分開存。
- 事件的「只給自己看的表現」改成依 pid 過濾。

**Tech Stack:** TypeScript、Canvas2D、vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-20-delve-coop-design.md`（§5.3：客人只對自己的移動有權威，遠端玩家內插；§3：2–4 人原本是建造者提案，擁有者 2026-10-22 要求超過 4 人）。前一份計畫是 `docs/superpowers/plans/2026-10-22-delve-coop-mc-network-lobby.md`，同一個分支 `feat/delve-coop-mc`。

## Global Constraints

- 跟前一份計畫的 Global Constraints 完全相同：
  - 只用 `npx vitest run`，不用 `npm test`。
  - tsc 用 `rtk proxy npx tsc --noEmit -p .`（基準約 773 個既有錯誤）。
  - 每個檔案自己檢查換行；CRLF 檔只用 Edit 改。
  - 禁 `!important`、禁行內樣式。
  - UI 文案寫繁體中文。
  - Conventional Commits，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
  - 不 push。
- **單機行為與畫面不變**：
  - golden、central 等既有測試不能改期望值。
  - 單人時本地玩家的 `playerDraw`、`heldDraws` 輸出必須跟重構前逐欄相同。
- 人數上限是 `MAX_GUESTS = 7`（房主加 7 位客人共 8 人）。信令槽位仍在伺服器允許的 `0..6` 內，**伺服器不改**。

## Builder Decisions（擁有者可推翻）

- **D1 PlayerPose（精簡，不用 `getState()`）**：
  ```ts
  interface PlayerPose {
    x: number; y: number; vx: number; vy: number; onGround: boolean; gfxOffY: number;
    facing: 1 | -1; dead: boolean; iframes: number; boating: boolean; climbing: boolean;
    mantle: { p: number; dir: 1 | -1; edgeX: number; edgeY: number } | null;
    liquidFrac: number;
    held: ItemId | null;
    attack: { item: ItemId; kind: WeaponKind; angle: number; dir: 1 | -1; at: number; dur: number } | null; // at = 世界時間秒
    mining: { x: number; y: number; progress: number; pick: ItemId | null } | null;
    fishing: { state: 'flying' | 'floating' | 'bite'; x: number; y: number; liquid: boolean } | null;
    hurt: number; // 受擊計數 0..255（挨打才 +1；突進 / 重生的無敵時間不算）
  }
  ```
  - attack 的進度在畫的時候用 `(time − at) / dur` 算，揮擊在 60 fps 下才會平滑。
  - mining.progress 在兩筆資料之間線性內插。
- **D2 線格式**
  - `WsPlayer` 加 `pose`（D1 的線上版本，數字保留 2 位小數）。
  - `Ps` 加 `mt: [p, dir, edgeX, edgeY] | null`，讓房主知道客人正在翻上邊緣。`RemoteMotion` 也加 `mantle`。
- **D3 客人自己的動作狀態用房主的**：
  - 客人畫自己時，移動相關欄位（x、y、vx、vy、onGround、climbing、mantle、boating、facing、liquidFrac、held）用本地預測。
  - attack、mining、fishing、iframes 用房主 `ws` 裡自己 pid 的那一份，取最新一筆，不內插。
  - 揮擊大約晚半個 RTT 出現，第一版接受，本地外觀預測留到 M-D。
- **D4 AvatarPainter**
  - `render/avatarDraw.ts` 從 `drawPlayer` 抽出。輸入是 `(ctx, pose, look, key, state: AvatarState, dt, time)`。
  - `AvatarState = { animator, hurtAt, swingPhase, facing, rodTip, rimDraw }`，每個 pid 一份。
  - 本地玩家仍然寫 `playerDraw`、`heldDraws`（e2e 依賴），遠端玩家寫進 `renderer.avatarDraws: Map<pid, {held: boolean; x: number; y: number}>`，給 e2e 檢查。
  - 遠端玩家也畫輪廓光、船和釣線。
- **D5 Sprites 依外觀分開快取**
  - `arm`、`grip`、`shoulder` 改成接 `(look, key, …)`。armPrep、armCache、grips 的 key 前面加上紙娃娃 key，總量用 LRU 限制（armCache 512、armPrep 64、grips 96）。
  - `setDoll` 和「目前樣子」的概念移除；呼叫端都改成明確傳 look 和 key。
  - `SHEET_CACHE` 從 10 改成 16。
  - `dollPreview.armCanvas` 只留給 NPC 用。
- **D6 事件表現依 pid 過濾**
  - 「只屬於自己的表現」只在 `e.pid === undefined || e.pid === game.localPid` 時觸發：攀爬灰塵、衝刺殘影、`pulse` 光環、死亡音效與關背包、甦醒提示、`snapCamera`、釣魚提示、不死提示、旅行／傳送碑反應、死亡與不死的畫面震動。
  - 大家都該聽到的照舊：揮擊、命中、擊殺、挖掘、放置的音效與粒子。
- **D7 8 人**
  - `MAX_GUESTS = 7`。
  - `JOIN_SLOTS` 維持 4，它管的是同時握手的人數，不是總人數。
  - 世界檔 `held` 改用自己的上限 `MAX_HELD = 32`，不再跟 `MAX_VISITS = 8` 共用，免得 7 位在線客人把剛斷線那位的保留角色擠掉。
  - HUD 玩家名單用小字、最多 8 列，不能超出畫面。
- **D8 生怪每位玩家各自計算**（spec Q11）
  - 每位活著的玩家有自己的生怪計時器。上限以那位玩家的活躍範圍內的怪數計算（`MAX_ENEMIES = 40`）。
  - 另加全世界上限 `MAX_ENEMIES_TOTAL = 160`。
  - 只有 1 位玩家時，結果必須跟現在逐位元相同：同樣的 RNG 消耗順序，golden 和 spawn 測試不改。

## Review Focus

1. **單機畫面回歸**：重構後單人的 `playerDraw`、`heldDraws`、`rimDraw` 每一幀都要跟重構前相同。Task 2 有逐幀比對測試。
2. **客人畫自己揮擊**：客人按攻擊後，自己的畫面要出現揮擊。Task 1、Task 2 有測試。
3. **8 個不同外觀同時在畫面上**：本地玩家的手臂快取不能每幀重烘。Task 2 檢查 `bakes.arms` 穩定。
4. **7 位客人在線時有人斷線**：那個人的 held 不能被擠掉。Task 4 有測試。
5. **別人死亡或甦醒**：不能關掉你的背包、移動你的鏡頭，也不能跳「你甦醒了」。Task 3 有測試。

---

### Task 1: PlayerPose、線格式與客人自己的動作狀態

**Files:**
- Modify: `delve/engine/game.ts`（`poseOf`），`delve/engine/actor.ts`（`RemoteMotion.mantle`），`delve/net/protocol.ts`，`delve/net/validate.ts`，`delve/net/host.ts`（`wsParts`、`onPs`），`delve/net/guest.ts`（`sendPs`、`onWs`、`peers`）
- Test: `delve/engine/pose.test.ts`、`delve/net/pose.net.test.ts`

**Interfaces:**
- Produces：
  - `export interface PlayerPose`（D1，放 `engine/pose.ts` 或 `engine/game.ts` 匯出）
  - `DelveGame.poseOf(pid: Pid): PlayerPose`：用 `withActor` 讀 cur，**不呼叫 `getState()`**。`mining.pick` 跟 renderer 現在的 `bestPickItem` 用同一套選法，所以那個函式要搬進 engine 或共用。
  - `WsPlayer.pose: WirePose`；`encodePose(p: PlayerPose): WirePose`、`decodePose(w: unknown): PlayerPose | null`（validate.ts 驗證）
  - `Ps.mt: [number, 1 | -1, number, number] | null`
  - `PeerView.pose: PlayerPose`：x、y 內插，mining.progress 內插，其他欄位取較新的一筆。
  - `NetGuest.ownPose(): Pick<PlayerPose, 'attack' | 'mining' | 'fishing' | 'iframes'> | null`：房主回報的、自己 pid 的最新一份。
- 房主端遠端 actor 的 mantle 來自 `ps.mt`，存進 `RemoteMotion.mantle`，`poseOf` 讀它。

- [ ] **Step 1：寫失敗的測試**
  - `'poseOf：本地揮劍中 → attack 有 item/kind/angle/dir/at/dur，且 (time-at)/dur 等於 getState().attack.progress'`
  - `'poseOf：挖掘中 → mining.progress 等於 getState().mining.progress，pick 為最佳鎬'`
  - `'poseOf 不改 cur（呼叫前後 game.cur 相同）'`
  - `'encode/decode round-trip；壞資料 → null'`
  - `'coopRig：客人揮劍 → 房主 ws 帶 attack → 另一位客人 peers() 的 pose.attack 有值'`
  - `'coopRig：客人揮劍 → 該客人 ownPose().attack 有值（同一 tick 之後一則 ws 內）'`
  - `'coopRig：客人翻上邊緣 → 房主 poseOf(該 pid).mantle 有值'`
  - `'mining.progress 在兩筆 ws 之間線性內插'`
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/engine/pose.test.ts src/scripts/games/delve/net/pose.net.test.ts`
  - Expected: FAIL。
- [ ] **Step 3：照 Interfaces 實作**
- [ ] **Step 4：跑測試確認通過**
  - Run: `npx vitest run src/scripts/games/delve/engine src/scripts/games/delve/net`
  - Expected: PASS。
- [ ] **Step 5：Commit** `feat(delve): player pose on the wire; guests see their own actions`

### Task 2: AvatarPainter——本地和遠端走同一條繪製路徑

**Files:**
- Create: `delve/render/avatarDraw.ts`、`delve/render/avatarDraw.test.ts`
- Modify: `delve/render/renderer.ts`（`drawPlayer`、`drawPlayerRim`、`drawBoats`、`drawFishing` 改用 painter），`delve/render/sprites.ts`（D5），`delve/render/remotePlayers.ts`（改成提供 `{pid, nick, pose, look, key}`，畫的部分交給 painter），`delve/render/dollPreview.ts`（只有在 D5 需要時才改），`delve/render/session.ts` 和 `delve/render/main.ts`（遠端來源改成 pose）
- Test: `delve/render/avatarDraw.test.ts`，以及現有的 `render/remotePlayers.test.ts`、`sprites` 測試（改成新 API）

**Interfaces:**
- Consumes: Task 1 的 `PlayerPose`、`PeerView.pose`、`NetGuest.ownPose()`、`game.poseOf`。
- Produces：
  - `render/avatarDraw.ts`：
    - `interface AvatarState { animator: PlayerAnimator; hurtAt: number; swingPhase: number; facing: 1 | -1; rodTip: {x:number;y:number} | null; rim: RimDraw | null }`
    - `newAvatarState(): AvatarState`
    - `drawAvatar(ctx, sp: Sprites, pose: PlayerPose, look: DollLook, key: string, st: AvatarState, dt: number, time: number, world: AvatarWorld): AvatarDrawOut`
    - `AvatarWorld` 是 painter 需要的世界查詢，例如 `isClimbable`、`atRopeTop` 要用的。只傳函式，不傳整個 game。
    - `AvatarDrawOut` 回傳本地需要的 `playerDraw`、`heldDraws`、`torches`、`coolSeen`。
  - `RemoteView` 改成 `{pid, nick, pose: PlayerPose, look: DollLook | null, key: string}`。
  - `renderer.avatarDraws: ReadonlyMap<Pid, {held: boolean; x: number; y: number}>`
  - Sprites（D5）：
    - `arm(look, key, back, pick, deg, blade?, itemOnly?)`
    - `grip(look, key, meta, fi, hx, hy)`
    - `shoulder(look, back)`
    - 移除 `setDoll`／`dollKey`／`dollSheet`，呼叫端改用 `sheetFor`
- 本地玩家的 pose：
  - solo／host：`game.poseOf(game.localPid)`。
  - guest：先 `poseOf(localPid)`，再用 `ownPose()` 覆蓋 attack、mining、fishing、iframes（D3）。
- 遠端 hurt：pose.iframes 從 0 變成大於 0 時，painter 把 `hurtAt` 設成現在。本地仍然由 `hurt` 事件設定。

- [ ] **Step 1：寫失敗的測試**
  - `'單機回歸：同一個種子、同一串輸入（走路、跳、揮劍、挖、拿火把、釣魚、翻邊）跑 300 幀，重構前錄下的 playerDraw/heldDraws/rimDraw 序列與重構後逐幀相同'`
    - 先在**還沒改程式的 commit** 用 mock ctx 錄一份 fixture 檔並 commit，再重構。
  - `'遠端揮劍：pose.attack 有值 → 畫出武器（avatarDraws.get(pid).held === true）'`
  - `'遠端挖掘：畫出鎬與揮動角度隨時間改變'`
  - `'遠端拿火把：畫出火把並回報光源'`
  - `'遠端翻上邊緣：畫 grip 手臂'`
  - `'遠端釣魚：畫釣線'`；`'遠端划船：畫船'`
  - `'8 個不同外觀輪流畫 120 幀，本地玩家的 bakes.arms 在第 60 幀之後不再增加'`
  - `'遠端 iframes 從 0 變正 → 受傷姿勢'`
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/render/avatarDraw.test.ts`
  - Expected: FAIL（模組不存在）。
- [ ] **Step 3：實作**
  - `drawPlayer` 的每一步搬進 `drawAvatar`。原本讀 `g.getState()`、`g.local` 的地方改讀 `pose`，原本的 per-renderer 狀態改放 `AvatarState`。
  - renderer 留一份本地 `AvatarState`，另加 `Map<pid, AvatarState>` 給遠端，pid 消失就刪掉。
- [ ] **Step 4：跑測試確認通過**
  - Run: `npx vitest run src/scripts/games/delve/render src/scripts/games/delve`，以及 `npx playwright test tests/e2e/delve.spec.ts --project=chromium`
  - Expected: PASS。「G 跟其他遊戲鍵」在 master 也會失敗，單獨重跑通過即可。
- [ ] **Step 5：Commit** `refactor(delve): one avatar painter for local and remote players`

### Task 3: 事件表現依 pid 過濾

**Files:**
- Modify: `delve/render/main.ts`（事件迴圈約 :253–389），`delve/render/renderer.ts` 的 `onEvent`（`climb`、`respawn`），`delve/render/levelFx.ts`（`dash`、`pulse`），`delve/render/combatDraw.ts`（`death`、`undying` 震動）
- Test: `delve/render/eventScope.test.ts`

**Interfaces:**
- Produces: `render/eventScope.ts` 匯出 `isMine(e: DelveEvent, localPid: Pid): boolean`，等於 `e.pid === undefined || e.pid === localPid`。
- D6 列的每一種表現都要包上 `isMine`。

- [ ] **Step 1：寫失敗的測試**
  - `'isMine：沒有 pid / 自己 / 別人'`
  - 從 main.ts 抽出事件分派，或用最小的 harness 驅動，至少驗證以下幾條：
    - `'別人的 death 不關背包、不放死亡音效'`
    - `'別人的 respawn 不跳甦醒提示、不 snapCamera'`
    - `'別人的 dash 不在本地玩家身後畫殘影'`
    - `'別人的 attack 仍播揮擊音效'`
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/render/eventScope.test.ts`
  - Expected: FAIL。
- [ ] **Step 3：實作**
- [ ] **Step 4：跑測試確認通過**
  - Run: `npx vitest run src/scripts/games/delve/render`
  - Expected: PASS。
- [ ] **Step 5：Commit** `fix(delve): keep other players' events off your own HUD and camera`

### Task 4: 8 人、held 上限、每人各自生怪、HUD 名單

**Files:**
- Modify: `delve/net/protocol.ts`（`MAX_GUESTS = 7`），`delve/save/worldSave.ts`、`delve/save/split.ts`（`MAX_HELD = 32`），`delve/engine/spawn.ts` 和 `delve/engine/game.ts`（D8），`src/pages/games/delve.astro`（`.delve-players` 版面），`delve/net/host.test.ts`（cap 測試）
- Test: `delve/net/coop.eight.test.ts`、`delve/engine/spawn.coop.test.ts`、`delve/save/worldSave.test.ts`

**Interfaces:**
- `MAX_GUESTS = 7`。pid 是 `p1..p7`，第 8 位客人回 `full`。
- `MAX_HELD = 32`，held 的 LRU 改用它。
- `MAX_ENEMIES_TOTAL = 160`。

- [ ] **Step 1：寫失敗的測試**
  - `'7 位客人都能 live；第 8 位收到 full'`
  - `'7 位客人同時編輯不同格，最後每位客人的 tile 都跟房主一致'`：用 coopRig，`latencyMs: [20, 60]`。
  - `'7 位在線、1 位斷線且最後 chk 未 ack → held 仍在（不被其餘 6 位的每 30 秒 held 擠掉）'`
  - `'held LRU 上限 32'`
  - `'生怪：2 位玩家相距很遠，各自身邊的怪數都會長到接近單人時的數量'`
  - `'生怪：單人時 spawn 結果跟改動前逐位元相同'`：現有的 spawn 和 golden 測試全綠，加上一個固定種子的 600 tick 序列比對。
  - `'全世界怪數不超過 160'`
- [ ] **Step 2：跑測試確認失敗**
  - Run: `npx vitest run src/scripts/games/delve/net/coop.eight.test.ts src/scripts/games/delve/engine/spawn.coop.test.ts src/scripts/games/delve/save`
  - Expected: FAIL。
- [ ] **Step 3：實作**
  - HUD 名單在 8 列時字級縮小，不超出 `.delve-coop-box`，手機版也要能看完整。
- [ ] **Step 4：跑測試確認通過，再跑全套**
  - Run: `npx vitest run`，以及 `npx playwright test tests/e2e/delve-online.spec.ts tests/e2e/delve.spec.ts --project=chromium`
  - Expected: 只允許已知 flake。
- [ ] **Step 5：擴充 e2e**
  - `tests/e2e/delve-online.spec.ts` 新增一段：房主給客人一把鎬，客人按住挖掘，房主頁面的 `renderer.avatarDraws.get(客人 pid).held === true`。
  - 新增第 2、3 位客人加入（3 個 context）的測試，確認三方 `players().length === 4`。
- [ ] **Step 6：更新 spec**
  - §3 的人數改成「最多 8 人（擁有者 2026-10-22 要求超過 4 人）」。
  - §5.3 補 D1–D3。
  - §8 Q11 補 D8。
- [ ] **Step 7：Commit** `feat(delve): co-op up to 8 players with per-player spawning`
