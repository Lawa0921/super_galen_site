# DELVE 線上合作（Co-op）設計

- 日期：2026-10-20　狀態：設計稿（未實作）　分支基準：`feat/delve-races` @ `6322fb3a`
- 路徑縮寫：`delve/` = `src/scripts/games/delve/`，`tetris/net/` = `src/scripts/games/tetris/net/`
- 標記：**【使用者決定】** = 擁有者已拍板，不再討論；**【建造者決定／提案】** = 本稿作者的選擇，實作者可在不違反【使用者決定】的前提下調整，但要在 PR 說明理由。
- 先備研究：`reports/網頁版泰拉瑞亞技術研究.md`（host 權威、三通道、`TileReq → 套用 → 廣播`、里程碑 M4）。

---

## 1. 意圖與為什麼

DELVE 目前是單機沙盒：一個 `DelveGame` 就是一個世界加一個玩家。擁有者要的是**朋友一起冒險**，在同一個世界裡蓋房子、互相送裝備，下次再來時房子還在。

這件事的形狀是 Terraria / Minecraft 區網：世界跟著房主（host）的瀏覽器走，朋友帶自己的角色進來，帶著拿到的東西回去。網路層不是最難的部分，因為 tetris/bomber 已經有信令、WebRTC 跟星狀拓樸。真正要動刀的是兩件事：

1. **存檔裡「角色」和「世界」是綁在一起的**（`SaveHeader` 同時有 `inventory`、`combat`、`levels` 和 `chunks`，見 `delve/save/serialize.ts:105-158`），所以角色帶不走。
2. **引擎假設只有一個玩家**：`DelveGame` 有約 70 個欄位屬於「那一個玩家」（`delve/engine/game.ts:479-645`），怪物 AI、NPC、液體、據點都直接讀 `this.player`。

tetris 的 deterministic lockstep **不適用**，原因有四：浮點物理沒辦法跨瀏覽器逐位元一致；液體模擬有牆鐘預算（`LIQUID_BUDGET_MS = 2`，`delve/engine/game.ts:372`，由 `delve/render/main.ts:92` 設定，同樣的輸入會跑出不同結果）；晚加入的人需要世界快照；只要一個人卡住，lockstep 就會讓所有人一起卡住。所以改走 host 權威的狀態同步。

## 2. 目標／非目標／反目標

**目標**
- 2–4 人在房主的世界裡同時遊玩，包括移動、挖、放、戰鬥、開箱、跟 NPC 交易、睡覺。
- 世界持久化在房主的 IndexedDB。下次房主開同一個世界，朋友蓋的東西都還在。
- 角色和世界分開存。客人的物品、裝備、外觀、等級都寫回客人自己的角色檔。
- 正常的斷線或離開不會複製物品，也不會吃掉物品。
- 現有單機存檔可以無痛遷移，不丟資料。

**非目標（v1 不做）**
- 房主換手（host migration）：房主離開，整個 session 就結束。
- TURN 中繼：對稱型 NAT 連不上就算了，只顯示清楚的錯誤訊息。
- 公開配對或大廳列表：只能用 5 碼房號邀請朋友。
- 在伺服器上存世界，或讓客人離線進房主的世界。
- 單機的多世界管理 UI（v1 仍只有一個世界槽 `main`，見 `delve/render/session.ts:25`）。
- PvP。

**反目標（刻意不追求，之後也不要被拉去做）**
- **防作弊**：角色檔存在客人自己的瀏覽器，客人本來就能改。房主只做格式和上限的驗證（重用 `validInventory`／`strictGear` 等），不做對抗式反作弊。這套設計的前提是一起玩的人是朋友。
- 錢包、帳號、Web3：只用暱稱。
- 把多人機制做成 lockstep 或可重播：多人模式不要求決定性。

## 3. 使用者決定（固定）

| # | 決定 |
|---|------|
| U1 | **【使用者決定】** 做 Co-op，不做 PvP。大家在同一個世界冒險、一起蓋房子、分享或交易裝備。 |
| U2 | **【使用者決定】** 世界要持久化，下一次 session 房子還在。 |
| U3 | **【使用者決定】** 世界存在房主的瀏覽器存檔裡，朋友只能在房主上線時進入，伺服器不存世界。 |
| U4 | **【使用者決定】** 客人帶自己的角色進房主的世界，在那裡拿到的物品、裝備、時裝會跟客人回到他自己的世界。因此角色檔必須和世界檔拆開（Terraria 的 character / world 檔）。 |

本稿的選擇（實作者可以調整）：
- **【建造者決定／提案】** 2–4 人（沿用 `bomber/net/lobby.ts:21-22` 的 `MIN_PLAYERS=2`、`MAX_PLAYERS=4`）。
- **【建造者決定／提案】** host 權威。客人只對自己的移動有權威，房主會做合理性檢查。
- **【建造者決定／提案】** 沿用 `/api/signal`，namespace 用 `delve:`，跟 `BOMBER_NS = 'bomber:'`（`bomber/net/bomberNetMain.ts:45`）、`nsRoom()`（`tetris/net/signalClient.ts:68`）同一種做法。
- **【建造者決定／提案】** v1 不做換主。房主離開時 session 結束，客人保留最後一次 checkpoint 的角色進度。
- **【建造者決定／提案】** v1 接受沒有 TURN 帶來的 NAT 風險，`RTC_CONFIG` 只有 Google STUN（`tetris/net/webrtcTransport.ts:3-5`）。
- **【建造者決定／提案】** 只用暱稱，不接錢包。
- **【建造者決定／提案】** 外觀（含平行分支正在加的 `Appearance.race`）一定要同步，紙娃娃的 look 走 `look` 訊息。

## 4. 現況盤點（設計依據）

| 項目 | 現況 | 對 co-op 的意義 |
|------|------|-----------------|
| 存檔格式 | `SAVE_FORMAT = 9`（`delve/save/serialize.ts:72`）。二進位格式是 `MAGIC + header JSON + 被改過的 chunk（fg+wall 各 1024 B）`（`:502-520`），gzip 後存進 IDB `delve/saves`，key 是 `slot`（`delve/save/storage.ts:4-6,93`） | 世界的差量格式可以直接拿來當晚加入快照 |
| header 裡屬於玩家的欄位 | `player`、`inventory`、`combat{hp,maxHp,mana,equipment,equipGear}`、`vitals`、`appearance`、`vanity`、`levels`、`extra.codex`、`extra.fishLog`、`folk.buffs`、`bed`、`explored`、`markers`、`discovery`（`:105-158`） | 都要搬進角色檔，或搬進「每角色在這個世界的紀錄」 |
| header 裡屬於世界的欄位 | `chunks`、`chests`、`unlocked`、`keysUsed`、`liquids`、`drops`、`bossActive`、`env`、`settle`、`halves`、`folk.world`、`folk.quests`、`scoutMarks`、`perkDays`、`scouted`、`extra.minedIce`、`extra.rng`、`combat.bosses`、`combat.kills`、`combat.peaceful` | 留在世界檔 |
| 世界尺寸 | `CHUNK=32`、`4200×1200`（`delve/engine/constants.ts:3-5`），共 132×38 = 5016 個 chunk。完整 fg+wall 約 10 MB | 不能送整個世界，只送種子加差量 |
| 世界生成 | `GEN_VERSION=7`（`constants.ts:11`），由 seed 決定，在主執行緒跑 | 客人用 seed 自己重建世界，再貼上差量。要用 chunk 雜湊驗證生成結果一致 |
| 世界變更追蹤 | `modifiedChunks`、`liquidModified`、`dirty`、`onTileChange`（`delve/engine/world.ts:52-62`）。`setFg` 會呼叫 `onTileChange`（`:143-158`），但這個 hook 已被液體佔用（`delve/engine/liquid.ts:130`） | 需要另外加一個「編輯日誌」，不能搶這個 hook |
| 輸入 | `setMoveX/Jump/Up/Drop/Aim/Mining/Use`、`selectSlot`，全部寫在單例欄位上（`game.ts:723-750`） | 要改成每個 actor 各有一份 `PlayerInput` |
| 模擬迴圈 | `step(dt)`（`game.ts:752-843`）依序跑：液體、死亡、睡覺、單一玩家的移動／技能／生命值、挖掘、攻擊、使用、實體、據點、NPC | 要拆成世界階段加每個 actor 的階段 |
| 事件 | 只有一個 `events[]`，`drainEvents()` 取出（`game.ts:535,1767`），共約 60 種，都沒有 pid（`:102-218`） | 要加 `pid`，並分成公開事件和私人事件 |
| 怪物 | `AiCtx` 只有一個 `px/py/playerDead/playerWet`（`delve/engine/enemies.ts:133-147`）。活躍和消失範圍、生成都以單一玩家為中心（`game.ts:2383-2517`；`delve/engine/spawn.ts:48-58`：`ACTIVE 80×56`、`MAX_ENEMIES 40`） | 目標改成最近的活著的玩家；活躍範圍取所有玩家的聯集；生成輪流挑玩家 |
| NPC／據點 | `FolkHost.playerTile/playerOverlaps`（`delve/engine/folk.ts:100-116`）、`SettleHost` 同理（`delve/engine/settlement.ts:193-201`） | 改成 `players()` 加 `anyPlayerOverlaps` |
| 液體 | `liquids.blocked = 只檢查本地玩家`（`game.ts:655`），而且有牆鐘預算 | 只有房主跑液體模擬，客人只收液體差量 |
| 掉落物 | `drops.step` 收單一個 `player`（`game.ts:2465-2470`） | 改成磁吸和撿取都對最近的合格 actor 生效 |
| 暫停 | 選單、地圖、技能樹會暫停模擬（`delve/render/main.ts:114-130`），和 NPC 對話時也會暫停（`:221-229`） | 連線時不能暫停 |
| 睡覺 | `sleepT` 是全世界共用的，會直接把時間跳到日出（`game.ts:1393-1411`） | 要所有活著的玩家都在床上才觸發 |
| 天氣 | `weatherAt(seed, time)` 是決定性的；閃電用 `weatherRng` | 客人用同步過來的 `time` 自己算天氣；閃電靠事件同步 |
| 紙娃娃 | `doll()` 由 appearance、equipment、vanity 組成，有 memo（`game.ts:1296-1304`）；renderer 只畫一個玩家（`delve/render/renderer.ts:780`） | 遠端玩家要有自己的 look 和影格快取 |
| 丟物品 | **目前沒有**「把背包裡的東西丟到地上」的操作（只有 `drops.spawn`，例如 `game.ts:1008`） | 交易 v1 需要新增 `tossSlot` |
| 傳輸 | `WebRtcTransport` 只開一條 `ordered` 的 `'game'` channel，而且只收字串（`tetris/net/webrtcTransport.ts:73-79,83`）。`LoopbackPair` 是同步字串（`tetris/net/transport.ts:15`） | 要擴充成三通道加二進位 |
| 信令 | 槽位 TTL 300 秒（`src/pages/api/signal.ts:7`），單筆上限 60 KB（`:88`），5 碼房號（`:49`）。guest-initiated 星狀接法是 `guest-{i}-offer` 配 `host-ack-{i}`（`tetris/net/ffaNetMain.ts:296-298,1243+`）。`pollSlot` 預設 1.2 秒一次（`signalClient.ts:95`） | 可以直接重用。要注意房主長時間輪詢會吃 Upstash 配額 |

## 5. 架構

### 5.1 角色／世界存檔拆分（M-A）

**角色檔 `DelveCharacter`（新，`delve/save/character.ts`）**：純 JSON 加 gzip，沒有 chunk。
```
{ cformat: 1, id: uuid, nick, createdAt, savedAt, rev,
  appearance (含 race), vanity, inventory, equipment + equipGear,
  combat: { hp, baseMaxHp, mana }, levels, codex, fishLog,
  undyingCd, buffsLeft: {kind: 剩餘秒}, kills? (見 Q1) }
```
- **【建造者決定／提案】** IDB 加第二個 object store `characters`（keyPath `id`），`DB_VERSION` 從 1 改成 2（`delve/save/storage.ts:5,91-94`）。另一個做法是放在同一個 store、用 `char:` 前綴，但這樣 `listSlots` 要過濾，比較髒。
- `buffs` 現在存的是世界時間的絕對值（`buffOn: this.time < u`，`game.ts:3282`）。帶到別的世界時要換算成剩餘秒數。

**世界檔 format 10**：拿掉上面列的玩家欄位，新增：
```
worldId: uuid, worldName,
visits: { [charId]: { pos, bed, spawnCore, explored, markers, discovery, vitals, lastSeen } }
```
- **【建造者決定／提案】** 「這個角色在這個世界的紀錄」（地圖迷霧、標記、發現、床、重生核心、位置）**存在世界檔裡**，key 是 `charId`，做法跟 Minecraft 的 playerdata 一樣。原因有二：床或核心是不是還有效，要對照這個世界才能判斷；客人也不需要知道 worldId 該怎麼存。`settle.spawnCore`（`delve/engine/settlement.ts:210`）本來屬於世界，這次改成每個角色各一份。`visits` 最多存 8 筆，超過時用 LRU 淘汰。
- `bossesDefeated`、`kills`、`peaceful`、任務、NPC 好感度都屬於世界（見 Q1、Q3）。

**遷移（format ≤ 9 → 10 + 角色）**：在 `session.ts` 讀檔時做一次。
1. 用 `decodeSave` 解出舊 header。從中取出角色欄位，產生 `DelveCharacter`，`nick` 預設「旅人」。其餘欄位寫成 format 10 的世界，`visits[charId]` 填入舊的 `player/bed/explored/markers/discovery/vitals/settle.spawnCore`。
2. **在寫回新格式之前**，先把舊 bytes 原封不動存到 `main.v9.bak`。這一步讓遷移可以回退，符合「破壞性操作前停手」的全域規則。之後每次成功讀檔都保留這份備份，直到下一個版本再處理。
3. `restoreGame` 仍然要能吃 format ≤ 9（現有約 70 個測試檔都依賴它）。新增 `restoreSplit(world, character)` 作為主要路徑。
4. 「讀舊檔、遷移、存檔、再讀檔」之後，背包、裝備、等級、房屋 chunk、箱子都要逐欄相等，這條就是 M-A 的驗收測試。

### 5.2 多玩家引擎重構（M-B）

**`PlayerActor`（新，`delve/engine/actor.ts`）**：把 `game.ts:479-645` 裡屬於玩家的欄位搬進來，包括 `player: Body`、`motion`、`input`、`inventory`、`equipment`、`vanity`、`appearance`、`levels`、`codex`、`hp/mana/dead/respawnT`、`attack/attackCd/iframes/knockT`、`mining`、`fishing`、`openChest`、`breath/burning/honeyT`、`contact`、`skillCd/dash*/slam*`、`recallT`、`aim/aimPx`、`statsCache`、`buffs`、`visit`（bed、explored、markers、discovery）。

```
class DelveGame {
  readonly actors = new Map<Pid, PlayerActor>();   // 至少 1 個
  localPid: Pid;                                    // solo/host = 'h'，replica = 自己的 pid
  mode: 'solo' | 'host' | 'replica';
  // 相容 getter（讓既有測試和 UI 一行都不用改）：
  get player() { return this.local.player }  get inventory() { return this.local.inventory } ...
  input(pid): PlayerInput;                        // setMoveX 等等 = input(localPid).moveX = v
  addActor(pid, character, visit): PlayerActor;  removeActor(pid): DelveCharacter;
}
```
- **【建造者決定／提案】** 相容 getter 是這次重構能不能平安落地的關鍵。`game.ts` 有 3765 行，`this.player` 和 `this.inventory` 的引用超過 100 處，先用 getter 撐住，再一個系統一個系統改成吃 `actor` 參數。不要一次全部重寫。
- `step(dt)` 拆成三段：
  1. 世界前段：時間、天氣、液體（`replica` 模式跳過液體）。
  2. 對每個 actor 跑 `stepActor(a, dt)`：移動、技能、生命值、挖掘、攻擊、使用、釣魚。這段就是現在 `game.ts:762-838` 的內容，只是把 `this.` 換成 `a.`。在 `host` 模式下，**客人 actor 的移動積分要跳過**，改成套用客人回報的位置（見 5.3）。
  3. 世界後段：`updateEntities`、`updateSettlements`、`updateFolk`（`replica` 模式只做內插，不跑 AI）。
- `AiCtx`、`FolkHost`、`SettleHost` 改成提供 `players(): {pid, cx, cy, dead, wet}[]`。怪物鎖定最近的活著的玩家。只要有任何一個玩家在 `ACTIVE` 範圍內，怪物就活躍；離所有玩家都超過 `DESPAWN` 才消失。`trySpawn` 每次輪流挑一個玩家當中心。`MAX_ENEMIES` 是否要乘上人數倍率屬於調參，見 Q11。
- `liquids.blocked` 和 `playerOverlaps` 改成檢查任何一個 actor。
- 睡覺：所有活著的 actor 都在床上（`sleepReady` 旗標）才開始倒數 `sleepT`。HUD 顯示「等待其他人 1/3」。
- 事件：`DelveEvent` 加上 `pid?`。依類型分成**私人事件**（pickup、blocked、select、xp、levelup、hurt、talk、trade、quest、bubble、craft 等，只送給該 pid）和**公開事件**（mine、place、kill、hit、boss、liquid、lightning、sleep、door、chest 等，廣播給所有人）。`drainEvents(pid = localPid)` 只回傳本地需要的事件，房主另外用 `drainAll()` 拿到全部再分送。
- **世界編輯日誌**：`World` 新增 `edits: EditJournal`。`setFg`、`setWall`、`setHalf`、箱子內容、`unlocked` 有變動時都推一筆 `[x, y, fg, wall, half]`。液體不走這裡，走 `liquidModified` 加上給網路用的另一份 dirty set，因為 `drainLiquidDirty` 已經被 renderer 拿去用了（`delve/render/renderer.ts:380`）。這樣門、樹倒、黑曜石反應、震地這類間接編輯都會自動被捕捉。
- **指令匯流排**：UI 目前直接呼叫 `game.craft()`、`takeChestSlot()`、`buy()`、`forge()`、`learnSkill()` 等方法。改成透過 `game.exec(cmd)` 呼叫，`cmd = {op, args}`，`op` 只能是白名單裡的公開方法，並綁定 pid。solo 和 host 直接執行；replica 會把指令送給房主，等 `ack` 回來。這是讓背包權威放在房主身上的唯一入口。

### 5.3 房主模擬與客人預測／內插

- **房主（host）**：跑完整的 `DelveGame`（mode `host`），所有 actor 都在裡面。房主是唯一能修改世界、怪物、掉落物、NPC、箱子，以及**所有已連線角色的物品**的人。
- **客人（replica）**：跑一個 `DelveGame`（mode `replica`）。世界由 seed 重建再套上快照。它**只積分本地 actor 的移動**（`stepPlayer`，對照本地的世界副本），其他東西全部照房主送來的快照內插。
  - **【建造者決定／提案】** 移動採客戶端權威，跟先備研究一致：客人每秒 20 次回報 `ps`。房主檢查兩件事：位移速度不能超過 `RUN_SPEED` 乘以技能和飾品上限再加容差，以及身體不能卡在實心方塊裡。不合理時送 `teleport` 把客人拉回去。Co-op 不需要 Gambetta 式的重播和修正。
  - 被擊退時，房主算出 `knock{vx, vy}` 送給客人，由客人套到自己的 body 上。傳送、回城、旅行、重生也都是房主送 `teleport`。
  - 攻擊、挖掘、使用：客人在本地立刻播放揮擊動畫和挖掘裂紋（純外觀預測）。命中、破壞和產生掉落物都由房主根據該 actor 的 `input`（以 `ps` 裡的 `mine`、`use`、`aim`、`slot` 驅動）判定，大約晚半個 RTT。
  - 遠端玩家、怪物、NPC 都以大約 100 ms 的延遲做內插（2 筆快照之間線性插值）。投射物用初速自己外推，有修正時再校正。
- 房主的分頁在背景時，`requestAnimationFrame` 會停，世界也跟著凍結。見風險 R2。

### 5.4 通道與訊息協定

**通道**（`delve/net/channels.ts`，在 `WebRtcTransport` 旁邊新增 `MultiChannelTransport`，`negotiated: true` 加固定 id，`binaryType='arraybuffer'`）：

| 通道 | 設定 | 用途 |
|------|------|------|
| `ctrl` | 可靠、有序 | 握手、指令和 ack、tile 編輯、私人事件、角色同步、look、聊天、ping |
| `bulk` | 可靠、有序、二進位 | 晚加入快照、液體 chunk、補送 chunk。切成 ≤ 16 KB 的片段，用 `bufferedAmount` 控流，不讓它堵住 `ctrl` |
| `state` | `ordered:false, maxRetransmits:0` | `ps`（客人送房主）、`ws`（房主送客人）的位置快照，舊的就丟掉 |

**訊息**（v1 用 JSON，`bulk` 用二進位；**【建造者決定／提案】** 量化成二進位留到 M-D）：
- 握手：客人送 `hello{proto, build, charId, nick, character}`。房主回 `welcome{pid, worldId, seed, genVersion, w, h, time, tick, peaceful, players[]}`，或回 `reject{reason:'full'|'proto'|'gen'|'charInUse'|'closed'}`。`build` 不一致（網站在 session 中途重新部署）就拒絕。
- 快照：在 `bulk` 上送 `snap{meta}` 加資料片段，客人套用完回 `ready` → 房主開始送差量（見 5.6）。
- 穩態：
  - `state`：客人送 `ps{seq, x, y, vx, vy, flags, facing, aim, mine, use, slot}`，20 Hz。房主送 `ws{tick, time, players[], enemies[], drops[], proj[], npcs[]}`，15 Hz，只含該客人 `ACTIVE` 範圍內的東西（興趣管理）。
  - `ctrl` 房主送客人：`tiles{tick, edits[]}`（每個 tick 批次一次）、`ev[]`（私人事件）、`pub[]`（公開事件，用來播音效和特效）、`ack{seq, ok, reason}`、`char{rev, delta 或完整角色}`、`chk{rev, character}`、`look{pid, look}`、`teleport`、`knock`、`bye{reason}`。
  - `ctrl` 客人送房主：`cmd{seq, op, args}`、`look`、`chat`、`bye`。
  - `bulk` 房主送客人：`liq{chunks, rle}`（重用 `encodeLiquidRle`，`serialize.ts:271`），只送該客人興趣範圍內 dirty 的液體 chunk，5 Hz。
- 存活偵測：重用 `tetris/net/silence.ts:8-11`（10 秒開始警示、30 秒判定斷線）的常數和文案函式。

**頻寬估算（推算值，未實測）**

| 項目 | 單位量 | 每位客人 |
|------|--------|----------|
| `ws` | 興趣範圍內約 15 隻怪 × 60 B，加 4 名玩家 × 80 B，加約 20 個掉落物 × 40 B ≈ 2 KB，15 Hz | ≈ 30 KB/s |
| `ps` 轉發 | 120 B，20 Hz | ≈ 2.4 KB/s |
| tile 和事件 | 平常很少，蓋房子時約 1 KB/s | ≈ 1 KB/s |
| 液體 | 每個 chunk RLE 約 0.2–2 KB，大洪水時峰值 20 KB/s | 0–20 KB/s |

房主上傳在 3 名客人時約 100–150 KB/s（約 1 Mbps），WebRTC 可以應付。量化成二進位之後應該能降到 3–4 倍以下。客人上傳約 3 KB/s。

### 5.5 世界編輯流程

1. 客人按下放置。如果是單格方塊，本地先**樂觀套用**，記下 `pending[seq] = 原本的 tile`。門、床、多格家具、液體工具不樂觀套用。
2. 客人送出 `cmd{seq, op:'place', args:{x, y, slot}}`。
3. 房主以該 actor 的身分執行既有的 `tryPlace` 邏輯，檢查可觸及距離（`canReach` 多給 +1.5 格的延遲容差）、房主那份客人背包裡有沒有這個物品、支撐、會不會跟身體重疊。
4. 成功時，編輯日誌會產生 `tiles` 並廣播給所有人（包括發起的客人），再回 `ack{seq, ok:true}`。失敗時回 `ack{seq, ok:false, reason}`，客人還原 `pending[seq]` 並顯示既有的 `blocked` 文案。
5. 挖掘不做樂觀破壞。房主那邊的 `elapsed` 到達 `need` 時，廣播破壞和 `drops` 生成。
6. 兩個人同時編輯同一格：以房主收到的順序為準。每個 chunk 帶 `rev`，客人丟掉比目前 rev 舊的 `tiles`。

### 5.6 晚加入快照

1. 房主收到 `hello`，驗證角色後呼叫 `addActor(pid, character, world.visits[charId] ?? 新紀錄)`，回 `welcome`。
2. 房主呼叫 `snapshotWorld(game)`，**跟 M-A 的世界檔是同一個函式**，內容是被改過的 chunk、`liquidModified` chunk 的液體 RLE、箱子、`unlocked`、`halves`、`env`、據點和 NPC 的世界狀態，再加上該角色的 `visit`（迷霧和標記）。gzip 後在 `bulk` 上分片送出，同時附上 **5016 個 chunk 的 FNV-1a 雜湊表**（約 20 KB）。
3. 客人呼叫 `generateWorld(seed, {w, h})`，套用快照，再逐 chunk 比對雜湊。雜湊不符的 chunk（例如 Safari 和 V8 數學函式有差異）用 `need{chunks}` 向房主要完整資料。
4. 房主在快照的那個 tick T 之後，把產生的 `tiles` 和 `liq` **先暫存**。客人回 `ready` 後依序補送，客人用 chunk rev 去重。
5. 量級推算：500 個被改過的 chunk 原始約 1 MB，gzip 後約 150–250 KB，以 16 KB 分片大約 1–3 秒送完，加上客人自己生成世界的時間（尚未量測，是 M-B 的待辦）。

### 5.7 物品分享／交易與防複製

- **權威**：客人連線期間，**房主持有該客人角色的唯一權威副本**，包括背包、裝備、等級和所有數量。客人 UI 顯示的是房主同步過來的 `char`。客人本地對物品的修改一律透過 `cmd` 進行，不會直接寫入。
- **交易 v1【建造者決定／提案】**：新增 `tossSlot(slot, n)`，把物品丟到地上（掉落物帶 `owner` 和 `pickDelay`，丟出的人 1.5 秒內撿不回來），再加上共用箱子。兩邊各自確認的交易視窗留到 M-D。
- **Checkpoint**：
  - 房主每 30 秒（跟 `AUTOSAVE_INTERVAL_MS` 一致，`delve/save/storage.ts:7`）送一次 `chk{rev, character}`。
  - 遇到**跨越邊界的操作**時立刻送：存入或取出箱子、丟出、撿起有詞條的裝備、商店交易、鍛造。客人收到後在 1 秒防抖內寫入 IDB。
  - 房主在這類操作之後也會在 2 秒防抖內存一次世界，把「世界少了、角色多了」不同步的時間窗壓到幾秒。
- **斷線**：
  - 客人主動離開：房主送最後一份 `chk`，再 `removeActor`，把 `visit` 寫回世界。
  - 客人靜默逾時：房主保留它最後的 `char` rev，世界照常移除 actor。
  - 客人只會寫入**最後一次收到的 `chk`**，絕不寫入自己本地的預測狀態。
  - 房主離開：客人保留最後的 `chk`，回到標題畫面，顯示「主機已離線」。
- **鎖**：客人用 `navigator.locks.request('delve-char-'+id, {ifAvailable:true})` 防止同一個角色同時開在兩個分頁。房主拒絕已經在 session 裡的 `charId`。
- **已知剩餘窗口**：房主在 checkpoint 和存世界之間崩潰，可能複製或遺失「最後幾秒」的跨邊界物品。這在反目標的範圍內可以接受，寫成測試記錄行為，不追求零窗口。

### 5.8 連線、大廳與 UI（M-C）

- 信令：沿用 guest-initiated 星狀流程（`ffaNetMain.ts:296-298`，bomber 也是同一套），namespace 用 `delve:`。
  - 房主按下「開放加入」才開始輪詢 `guest-{0..6}-offer`。**【建造者決定／提案】** 有客人在線時每 3 秒輪詢一次，連續 10 分鐘沒有新客人就自動關閉，以免長時間輪詢吃光 Upstash 配額（見 R7）。
  - 讀完槽位後寫入空字串當墓碑，讓槽位可以重用。
- 標題畫面：新增「角色」選單（建立、選擇、匯出、匯入），以及「多人」入口（建立房間顯示 5 碼房號，或輸入房號加入），加上暱稱欄位。
- 遊戲中：玩家名單和延遲顯示、名牌、遠端紙娃娃（`SpriteCache` 改成以 `dollKey` 為 key 的多筆 LRU）、等待睡覺的提示、房主斷線的提示。
- 文案：依照 delve 目前的慣例，UI 直接寫中文。如果改走站台 i18n，**兩套檔都要改**（CLAUDE.md 雷 1）。

## 6. 里程碑與測試策略

全部遵守 TDD：先寫失敗的測試，最後跑 `npx vitest run` 全套，必須全綠。不要用 `npm run test`，它是 watch 模式。

**M-A 存檔拆分（沒有網路）**
- 內容：`DelveCharacter`、世界 format 10、`visits`、IDB `characters` store、遷移和 `.v9.bak`、標題畫面最小可用的角色選擇（遷移後自動選中唯一的那個角色）。
- 測試：
  - 用 format 9 的固定 fixture（由現行 `serializeGame` 產生後凍結）做遷移，結果逐欄相等。
  - 角色檔和世界檔各自 round-trip。
  - 同一個角色進另一個世界時，物品還在、`visits` 是新的。
  - 壞掉的角色檔會被拒絕，世界不受影響。
  - `tests/e2e/delve.spec.ts` 維持綠燈。
- 驗收：用舊存檔讀進來，房子、背包、等級都一樣；備份檔存在。

**M-B 多玩家引擎加 loopback**
- 內容：`PlayerActor` 和相容 getter、`actors`、`mode`、多玩家 AiCtx／FolkHost／SettleHost、事件 pid、編輯日誌、`exec` 指令匯流排、`NetHost`／`NetGuest`（純邏輯，不碰 DOM）、`snapshotWorld`、`tossSlot`。
- 傳輸：`LoopbackNet` 擴充 `tetris/net/transport.ts` 的 `LoopbackPair`，提供三條通道、可注入延遲和丟包、手動 `flush()`，讓測試可以決定性地重現。
- 測試：
  - 一個 `DelveGame` 裡有 2 個 actor：怪物鎖定較近的那一個；任一玩家在活躍範圍內怪物就活躍；睡覺要求全員在床上。
  - host 加 2 個 replica 透過 loopback：客人 A 放置方塊，房主和客人 B 的 tile 都一致。
  - 被拒絕的放置會回滾。
  - 晚加入的客人，chunk 雜湊表跟房主完全一致。
  - 防複製不變式：存入箱子後斷線，物品總數「箱子 + 最後一次 chk」等於 1。丟出的物品被另一位撿走，數量守恆。
  - 在 `state` 通道注入 30% 丟包，最終位置仍然收斂。
- 驗收：全套 vitest 綠燈，單機模式行為不變，既有測試零修改或只有機械性修改。

**M-C 網路與大廳 UI**
- 內容：`MultiChannelTransport`、使用 `delve:` 的信令流程、大廳狀態機（參考 `bomber/net/lobby.ts`，但允許遊戲中途加入）、標題和 HUD UI、遠端渲染、連線時不暫停、房主背景分頁的心跳。
- 測試：
  - vitest：用 mock 的 RTCPeerConnection 測三通道的建立和二進位收發，寫法參考 `tetris/net/webrtcTransport.test.ts`。
  - Playwright 新增 `tests/e2e/delve-online.spec.ts`：照 `tests/e2e/bomber-online.spec.ts` 的方式開 2 個 browser context，只跑 chromium。流程是房主建房、客人輸入房號，雙方透過 `window.__delveDebug`（`session.ts:189`）看到 2 名玩家；客人放一塊方塊，房主那邊的 tile 也變了；客人離線後，角色檔裡有剛撿的物品。
  - 指令：`npx playwright test tests/e2e/delve-online.spec.ts --project=chromium`。
- 驗收：兩台實機（同一個 Wi-Fi，加上一台用手機熱點）可以連線。附上 4321 連結給擁有者實測。

**M-D 打磨**
- 內容：兩邊確認的交易視窗、聊天和表情、名牌樣式、二進位量化快照和頻寬儀表、客人在寬限期內用同一個 `charId` 重連、怪物血量依人數縮放（等 Q11 決定）、連線失敗時提示「可能是 NAT」。
- 測試：每一項先寫 vitest 單元測試，再擴充 e2e；用頻寬儀表測一次 3 名客人時的房主上傳量並記錄下來。

## 7. 風險

| # | 風險 | 緩解 |
|---|------|------|
| R1 | 沒有 TURN，對稱型 NAT 或部分行動網路連不上（研究引用的數字約 17.7%） | v1 接受。失敗時給明確文案。M-D 以後才評估 TURN 憑證 API |
| R2 | 房主分頁切到背景時，rAF 會停、計時器會被節流，世界跟著凍結 | 連線時改用 Worker 計時器驅動 `step`，並提示房主保持分頁可見。Chrome 對有 WebRTC 連線的頁面是否豁免節流需要實測（Q12） |
| R3 | `game.ts` 3765 行的大型重構會讓既有測試大量回歸 | 用相容 getter，一個系統一個 PR，每一步都跑全套 vitest |
| R4 | 跨瀏覽器（Safari／JSC）的世界生成結果不一致 | chunk 雜湊表加 `need` 補送 |
| R5 | 斷線或崩潰時的複製或遺失窗口 | 跨邊界操作立即 checkpoint，世界在 2 秒防抖內存檔，並用測試把現有行為固定下來 |
| R6 | 液體洪水打爆頻寬 | 興趣範圍、5 Hz、`bufferedAmount` 背壓；落後太多時改送整個 chunk 覆蓋 |
| R7 | 房主長時間輪詢信令吃掉 Upstash 配額 | 「開放加入」是手動開關，3 秒一次，閒置自動關閉 |
| R8 | 遷移時丟資料 | 先寫 `.v9.bak` 再轉換，並用固定 fixture 測試 |
| R9 | 跟平行分支 `race`（`Appearance` 加欄位）以及 `serialize.ts` 衝突 | M-A 開工前先合併 race 分支，角色檔直接收 `appearance` 整包 |
| R10 | 玩家分散時，房主 CPU 要同時跑 4 個活躍區（怪物和液體） | 量測後再決定上限，必要時限制客人和房主的最大距離 |
| R11 | UI 直接呼叫 game 方法的地方很多（folkUi、settleUi、levelsUi、wardrobe、hud…） | `exec` 白名單，用 grep 盤點後逐一改；replica 模式下，不在白名單的呼叫直接 throw |

## 8. 待擁有者回答的問題

- Q1 經驗值和擊殺怎麼分？提案：擊殺者附近 N 格內的玩家各自拿全額 XP。`kills` 算世界的還是角色的？
- Q2 掉落物：共用、先撿先得（Terraria 一般掉落的做法），還是首領掉落每人各一份？
- Q3 任務（QuestLog）是全世界共用一份，還是每個角色各自一份？提案是世界共用，誰交付誰拿獎勵。
- Q4 地圖迷霧和發現進度存在房主的世界檔裡（以角色為 key）可以嗎？代價是客人在自己的瀏覽器上看不到「在朋友世界的地圖」。
- Q5 客人可以拆房主的建築、開房主的箱子嗎？v1 提案是完全信任，之後再考慮「保護」開關。
- Q6 和平模式是否只有房主能切換？
- Q7 睡覺是否要全員都在床上？
- Q8 死亡時掉出的錢幣，其他人可以撿嗎？
- Q9 v1 只有一個世界槽可以接受嗎？客人「回到自己的世界」等於回到他唯一的 `main` 世界。
- Q10 角色進度可以跨世界帶（Terraria 式，在朋友的後期世界拿到好裝備，帶回自己的前期世界），可以接受嗎？
- Q11 怪物血量和數量要不要依人數縮放？
- Q12 房主一定要保持分頁可見嗎？還是要投資讓模擬在 Worker 裡跑（工程量大）？

## 9. 留給建造者的決定

- 線格式（JSON 或二進位）、各種頻率（20/15/5 Hz）、興趣範圍、分片大小、內插延遲：調參時以實測為準。
- `exec` 白名單的完整清單和檔案拆分方式（`delve/net/*`、`delve/save/character.ts`、`delve/engine/actor.ts` 只是建議）。
- chunk 雜湊演算法、角色鎖的實作方式、`visits` 的 LRU 上限。
- 角色選單和大廳的版面（走 delve 現有的 titleUi 風格，禁止 `!important` 和行內樣式）。
- 是否把 `MultiChannelTransport` 抽回 `tetris/net/` 共用。
- M-B 要不要再拆成 B1（actor 化，不碰網路）和 B2（NetHost／NetGuest 加 loopback）。
