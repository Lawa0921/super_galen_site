# DELVE 連線 M-B1：多玩家引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一個 `DelveGame` 裡可以同時有多個玩家角色（actor）：怪物鎖定最近的活著的玩家、任何玩家在範圍內怪物就活躍、全員上床才睡、事件帶 pid；單機行為與存檔完全不變。

**Architecture:** 把玩家欄位搬進 `PlayerActor`（`engine/actor.ts`）。`DelveGame` 持有 `actors: Map<Pid, PlayerActor>`、`localPid`、`mode`。既有程式碼大量使用 `this.player` / `this.inventory` / `this.hp`…（game.ts 內數百處、外部 53 個檔案）——全部改成**相容 getter / setter**，指向「目前 actor」`this.cur`。`cur` 平時等於本地 actor；`step` 對每個 actor 依序把 `cur` 切過去跑既有的玩家段程式碼。這讓既有玩家邏輯一行不改就能對多個 actor 執行，世界系統（怪物、掉落、投射物、NPC、睡覺）再逐一改成看全部 actor。

**Tech Stack:** TypeScript、vitest。純引擎，沒有網路、沒有 UI 新功能（只有睡覺等待提示）。

**Spec:** `docs/superpowers/specs/2026-10-20-delve-coop-design.md` §5.2、§6 M-B（本計畫是 M-B 的第一段；M-B2 = 編輯日誌 + `exec` 指令匯流排 + `tossSlot`；M-B3 = LoopbackNet + NetHost/NetGuest + `snapshotWorld` + checkpoint）。注意 spec 的行號已過期（game.ts 現為 3890 行；玩家欄位 483-660、`step` 767-866、`drainEvents` 1840）。

## Global Constraints

- 單機（只有一個 actor）行為逐 tick 不變：既有測試**零修改或只有機械性修改**（spec §6 M-B 驗收）；存檔格式不變。
- RNG 決定性：actor 依 `actors` 插入順序（本地 actor 永遠第一個）處理；單 actor 時每個 RNG stream 的呼叫順序與現在相同。
- 不碰 DOM 以外的新 UI；文字繁體中文寫死；禁 `!important`、禁行內樣式；不加 npm 套件。
- 測試：`npx vitest run <path>`（絕不 `npm test`）；e2e `npx playwright test tests/e2e/delve.spec.ts --project=chromium` 每個 task 結束前跑一次全套（單機回歸）。`game.ts`、`serialize.ts` 為 CRLF，維持各檔原行尾。
- Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Builder decisions（Claude 代為決定）

- B1 **`cur` 切換**取代逐系統改參數：相容 getter / setter 讀寫 `this.cur`；`withActor(a, fn)` 暫時切換並在 finally 還原。玩家段（現 step 783-854 與 858-865、`updateDeath`）、`applyCharacter`、`hurtPlayer` 等都在正確的 `cur` 下執行。spec §5.2 的「一個系統一個系統改成吃 actor 參數」留給之後需要時再做。
- B2 輸入 API（`setMoveX`…`selectSlot`、`useSkill`、`talkNearest` 等）一律作用在**本地 actor**（`this.local`），不是 `cur`。另加 `input(pid)` 讓房主（M-B3）餵遠端輸入。
- B3 `mode: 'solo' | 'host' | 'replica'` 欄位加上，但本計畫只實作 `solo` / `host` 的共同行為（全 actor 都在本機積分）；host 跳過客人移動積分、replica 只內插，留給 M-B3。
- B4 事件：`DelveEvent` 加 `pid?: Pid`。`events.push` 改走 `emit(ev)`，自動補 `pid = cur.pid`（世界事件在 actor 迴圈外發出時 `pid` 為空 = 公開）。分類表 `PRIVATE_EVENTS`（spec §5.2 列的 pickup、blocked、select、xp、levelup、hurt、talk、trade、quest、bubble、craft…，以及 chest、mirror、rebirth 這類開 UI 的），`drainEvents(pid = localPid)` 回傳公開事件 + 該 pid 的私人事件；`drainAll()` 回傳全部。`flushLevels` 依事件 pid 記到對應 actor 的 levels（無 pid 的擊殺等世界事件：記給造成者，見 B6）。
- B5 天氣特效 `updateWeatherFx`（以玩家腳下為中心）只對本地 actor 跑——它是表現層；落雷等會改世界的效果若依玩家位置決定，以本地 actor 為準並在報告中列出，M-B3 再決定房主如何處理。
- B6 擊殺歸屬：近戰 / 技能在該 actor 的 `cur` 下發生，自然帶 pid；投射物加 `owner?: Pid`，命中後的 kill / hit 事件帶 owner；荊棘反傷帶被碰的 actor。
- B7 睡覺：`sleepT` / `sleepSkipped` 維持世界層級。`trySleep` 改為把該 actor 標 `sleepReady = true`（仍檢查附近敵人與 boss，以該 actor 為中心）；所有活著的 actor 都 `sleepReady` 時才開始 `sleepT`；任何 ready 的 actor 移動 / 受傷 / 離床即取消其 ready。單 actor 時與現在完全相同。HUD 在 actor 數 > 1 且有人等待時顯示「等待其他人 n/m」。
- B8 掉落物撿取：`PickupHost` 改為多個 picker；每個掉落物由距離最近、可撿、背包有空間的 actor 吸 / 撿。單 actor 時等同現在。

## Review Focus

1. 單 actor 時逐 tick 完全一致：固定種子跑 N 秒，`snapshotGame` 前後 bytes 相同 → Task 1、Task 2 都要有這個「golden」測試（重構前錄下）。
2. `withActor` 內丟出例外時 `cur` 會還原（不留在別人身上）→ Task 2。
3. 兩個 actor 時，A 的事件不會出現在 `drainEvents(B)`；公開事件兩邊都看得到 → Task 2。
4. 怪物在 A 死亡 / 離開後改鎖 B；兩人都離開 `DESPAWN` 才消失 → Task 3。
5. 兩人一起睡：A 上床、B 沒上床 → 不跳夜；B 上床 → 跳夜；A 在等待時被打 → 取消 → Task 4。

---

### Task 1: `PlayerActor` 與相容 getter（純機械搬移）

**Files:** Create `src/scripts/games/delve/engine/actor.ts`；Modify `engine/game.ts`（欄位 483-660 的玩家欄位搬走，換成 getter / setter）。Test：新 `engine/actor.golden.test.ts`。

**Interfaces — Produces:** `type Pid = string`；`class PlayerActor { readonly pid: Pid; player: Body; inventory; appearance; vanity; equipment; levels; codex; fishLog; explored; discovery; markers; bed; hp; baseMaxHp; mana; dead; respawnT; buffs; …（所有 §1 列為玩家的欄位，含 private 的輸入 / 戰鬥 / 液體 / 技能狀態）}`；`DelveGame.actors: Map<Pid, PlayerActor>`、`localPid: Pid`（solo = `'h'`）、`get local(): PlayerActor`、`cur: PlayerActor`（Task 1 中恆等於 local）、`mode`。

規則：private 欄位搬到 actor 後，以 actor 上的公開欄位（或 `/** @internal */`）存取，DelveGame 端保留同名 private getter / setter，讓 game.ts 內部引用不變。外部模組（render / save / tests）一律不改。

- [ ] **Step 1: 失敗前先錄 golden**：`actor.golden.test.ts` — 固定 seed 小世界，腳本化輸入（移動、跳、挖、放、攻擊、喝藥、釣魚、睡覺各一段）跑 600 tick，記下每 60 tick 的 `snapshotGame` hash 與 `drainEvents` 類型序列；把期待值寫死在測試裡（用重構前的程式碼產生）。另加 `actors.size === 1`、`local === cur`、`local.pid === 'h'` 的斷言（此時 FAIL）。
- [ ] **Step 2:** 跑 → 只有 actor 相關斷言 FAIL，golden 通過。
- [ ] **Step 3:** 搬移欄位。
- [ ] **Step 4:** golden 不變、`npx vitest run src/scripts/games/delve` 全綠、delve e2e 全綠。
- [ ] **Step 5: Commit** `refactor(delve): move player state into PlayerActor`

### Task 2: 多個 actor、`cur` 切換、輸入、事件 pid

**Files:** `engine/game.ts`（`addActor` / `removeActor` / `withActor` / `input(pid)` / `step` 迴圈 / `emit` / `drainEvents` / `drainAll` / `flushLevels`）、`engine/actor.ts`、`save/serialize.ts`（只在 `applyCharacter` 需要指定 actor 時）。Test：新 `engine/actors.test.ts`。

**Interfaces — Consumes:** Task 1。**Produces:** `addActor(pid: Pid, character: DelveCharacter, at?: { x: number; y: number }): PlayerActor`（用 `withActor` + 既有 `applyCharacter` 套角色；無 `at` 時出生在 `respawnPoint` 規則對應的位置）；`removeActor(pid): DelveCharacter`（以該 actor 為 cur 拍角色快照；不可移除本地 actor）；`withActor<T>(a, fn: () => T): T`；`input(pid): ActorInput`（`moveX, jump, up, drop, aim, mining, use, selected`）；`DelveEvent.pid?`；`PRIVATE_EVENTS: ReadonlySet<DelveEvent['type']>`；`drainEvents(pid = localPid)`、`drainAll()`。

`step(dt)` 新結構：世界前段（flushLevels、time、新的一天、閃光、液體）→ 睡覺分支（B7，世界層級）→ **對每個 actor `withActor`**：死亡分支（`updateDeath`）或玩家段（現 783-854 + 858-865）→ 世界後段（`updateEntities`、`updateSettlements`、`updateFolk`，此 task 仍以 local 為中心，Task 3 改多人）。單 actor 時呼叫順序要與現在相同（golden 守住）——特別注意現在「死亡時跳過 updateFolk」「睡覺時跳過 updateEntities」的分支：多 actor 時以「所有 actor 都死亡」才跳過 folk，維持單 actor 等價。

- [ ] **Step 1: 失敗測試**：`addActor` 兩人後各自的背包 / 血量獨立；`input('b').moveX = 1` 只讓 B 移動；`withActor` 中丟例外後 `cur === local`；A 撿東西的 pickup 事件只出現在 `drainEvents('h')`，`mine` 事件兩邊都有；`removeActor('b')` 回傳的角色含 B 的背包；golden 測試仍通過。
- [ ] **Step 2–4:** FAIL → 實作 → vitest 全綠 + golden 不變 + delve e2e 全綠。
- [ ] **Step 5: Commit** `feat(delve): run several player actors in one game`

### Task 3: 世界系統看所有玩家

**Files:** `engine/game.ts`（`updateEntities` 2461-2550、`trySpawn` 2558-2594、`impSpot`、`summonBoss`、`tileOverlapsPlayer` 1212、AiCtx 建構 2472-2482、FolkHost 3249-3265、SettleHost 2976-2980）、`engine/enemies.ts`（AiCtx）、`engine/entities.ts`（PickupHost 多 picker）、`engine/projectiles.ts`（`owner?: Pid`）、`engine/folk.ts` / `engine/settlement.ts`（host 介面）。Test：新 `engine/actors.world.test.ts`。

**Interfaces — Produces:** `players(): { pid: Pid; cx: number; cy: number; dead: boolean; wet: boolean }[]`（DelveGame 公開）；`AiCtx` 由每隻怪的「最近的活著的玩家」填 `px/py/playerDead/playerWet`（全員死亡時用最近的屍體位置 + `playerDead = true`，與現在單人死亡時的行為一致）；`FolkHost` / `SettleHost` 的 `playerTile()` 換成 `playerTiles(): {x, y}[]`，呼叫端取最近者，`playerOverlaps` 改任一 actor；`PickupHost` → `pickers: Picker[]`；`Projectile.owner?: Pid`。

規則（spec §5.2）：怪物鎖定最近的活著的玩家；任一玩家在 `ACTIVE` 內就活躍；離**所有**玩家都超過 `DESPAWN` 才消失；`trySpawn` 每次輪流以一個活著的玩家為中心（spawnRng 呼叫次數在單 actor 時不變）；`BED_SAFE` 與「不在畫面內」對任一玩家檢查；`MAX_ENEMIES` 不變（Q11 留調參）；接觸傷害 / 敵方投射物對每個 actor 檢查並在該 actor 的 `cur` 下 `hurtPlayer`；迴力鏢回到 owner；`liquids.blocked` 與放置重疊檢查看任一 actor。

- [ ] **Step 1: 失敗測試**：兩個 actor A（近）B（遠）→ 怪物朝 A；A 死亡 → 改朝 B；A 在 ACTIVE 內、B 遠 → 怪物活躍；兩人都超過 DESPAWN → 消失；只有 B 在 DESPAWN 內 → 不消失；接觸傷害打到重疊的那個人；敵方投射物打到 B 時只有 B 扣血、hurt 事件帶 B 的 pid；掉落物被較近的人撿走；液體不會流進 B 站的格子；golden 不變。
- [ ] **Step 2–4:** 同上。
- [ ] **Step 5: Commit** `feat(delve): enemies, drops and NPCs see every player`

### Task 4: 全員上床才睡

**Files:** `engine/game.ts`（`useBed` 1424、`trySleep` 1434-1450、`updateSleep` 1451-1469、step 睡覺分支）、`engine/actor.ts`（`sleepReady`）、`render/hud.ts`（等待提示）+ `src/pages/games/delve.astro`（提示元素與樣式）。Test：新 `engine/actors.sleep.test.ts`。

**Interfaces — Produces:** `PlayerActor.sleepReady: boolean`；`sleepWaiting(): { ready: number; total: number } | null`（actor 數 > 1 且至少一人 ready 但未開始睡時回傳）；事件 `{ type: 'sleep', phase: 'wait', ready, total }`（公開）。

- [ ] **Step 1: 失敗測試**：單 actor 夜晚上床 → 跟現在一樣開始睡（golden）；兩人：A 上床 → 不開始、`sleepWaiting() = {1, 2}`；B 也上床 → 開始，跳到早上，兩人都回滿血；A 等待中移動或受傷 → A 取消 ready；B 死亡（不算活著）→ 只要 A 上床就能睡；附近有敵人時該 actor 無法 ready（沿用 `block('use','sleep')`）。
- [ ] **Step 2–4:** 同上；HUD 提示目測（dev server 上用 `__delveDebug.game.addActor` 加第二人並讓 A 上床，截圖）。
- [ ] **Step 5: Commit** `feat(delve): everyone must be in bed to sleep`
