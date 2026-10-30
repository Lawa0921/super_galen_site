# 星燈迷宮 地圖上的可見強敵（徘徊者，Wanderers）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 第一幕之後，第 4 層起每層有 1–4 隻守關者在地圖上徘徊：巡邏（直線來回）、看守（不動）、追蹤（近了就追、追丟回原位）。看見之後地圖與小地圖畫出牠們與下一步的提示格；隊伍每走一般的一步，牠們走一步。撞上或被追上就單挑那位守關者（精英的路、照這一趟的難度），打贏給精英的報酬加兩個稀有素材，這一趟這一層牠不再出現。開關關著或第一幕之前，遊戲逐位元不變；開著但沒碰到，每一條串流的抽取也不變。**沒有角色台詞**，只有中性的系統文字。

**Architecture:**
- **一道開關**：`WANDER_LIVE`（`data/wander.ts` 的 `WANDER_SWITCH.live`），PR C 之前是 `false`；`wanderOpen(s) = WANDER_SWITCH.live && WANDER_SWITCH.open(s)`，`open` 預設 `s.story.act1Cleared`（spec §0 第 4 條）。
- **出發時決定、最後一步放置、不寫樓層**：`depart()` 在 `wanderOpen` 時設 `Run.wander = true`；`floorOf` 在 `placeGather` 之後呼叫 `placeWanderers`（新串流 `WANDER_SALT`），結果寫進 `run.wanderers[depth]`，**不改地圖與 `contents`**（spec §0 第 7 條、§5.2）。
- **移動是純函式**：`engine/wander.ts` 的 `nextOf`、回合、看見都不抽亂數；`Game.move()` 只在 `run.wander` 時多做兩件事：撞上的檢查（在今天的移動之前）、一般的一步（`moved`）之後的回合（spec §0 第 3、8 條、§5.3）。
- **戰鬥接在精英的路上**：`startBattle` 多兩個可選參數（`wander`、`affixAt`），`submitRound` 多一個分支；報酬重用 `battleGear`／`battleRunes` 的精英路徑（spec §5.4、§5.5）。
- **先引擎、再介面、再上線、最後美術**：PR A（開關關著）→ PR B → PR C（打開、e2e）→ PR D（等使用者核准地圖標記的樣本）。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、Python（Pillow／numpy，只在 PR D）、codex 圖片生成（`codex_still.py`，只在 PR D）、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-30-starlantern-wanderers-design.md`（下稱 spec §）。**spec §0 是定案紀錄；本計畫的「計畫裁定」和 spec 正文衝突時以裁定為準，並在同一個 PR 抄回 spec §0。** 另外要讀：`docs/superpowers/plans/2026-10-30-starlantern-gathering.md`（Global Constraints、證據、開關、`withGatherOff`；本計畫照抄並改小）、`engine/gather.walk.test.ts`（相對比較的行走）、`engine/balance.roster.test.ts` 的 22i（強度的量法）。

**範圍外**：台詞與文字槽、寫作任務；新怪物、新戰鬥圖、新道具、新戰鬥程式；「等一回合」的指令；徘徊者之間的互動；頭目層的徘徊者；手冊頁；存檔欄位與遷移；任何平衡旋鈕與凍結檔。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/`、`art-factory/`、`public/`、`.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄是 `.superpowers/sdd/2026-10-30-starlantern-wanderers/<PR 代號>/`，下稱 SDD（已被 `.gitignore` 排除）。行號只用來定位，動手時一律用內容找。

---

## 對照報告：spec 各節 × 2026-10-30 的程式碼（`origin/master` `699294841`）

| spec | 接到哪裡 | 位置 | 備註 |
|---|---|---|---|
| §0.7、§5.2 放置 | `floorOf` 的最後一行 | `engine/dungeon/run.ts:145-148` | `placeGather` 之後、`run.floors.set` 之前 |
| §0.5 出發時決定 | `Run.wander?`、`Run.wanderers?`；`depart` | `engine/dungeon/run.ts:77-85`；`engine/game.ts:342-356` | 照 `Run.gather`：`:344` 的下一行，在 `forceGlimmers`／`this.map()` 之前 |
| §0.6 鹽 | `WANDER_SALT = 0x3956c25b` | `data/monsters.test.ts:680-699` | K[0]–K[3] 已用 |
| §5.2 私有的加權抽 | 照 `pickWeighted` | `engine/dungeon/gather.ts:10-18` | 本檔再寫一份（不 import） |
| §5.2 找格子 | 照 `floorCells` | `engine/dungeon/gather.ts:21-25` | 另排除前面徘徊者佔用的格 |
| §5.2 keepOut | `Content.room`；入口／出口房 | `engine/dungeon/rooms.ts:17-20`；`engine/dungeon/gen.ts:118-131` | `GenFloor.rooms` 的矩形 |
| §5.2 頭目層 | `isBossDepth` | `engine/dungeon/run.ts:98` | 頭目層不抽 |
| §5.2 通行 | `tileAt`、`DELTA` | `engine/map.ts:18-20`、`:69-80`（`reachable` 的寫法） | 另一份擋格的版本 |
| §5.3 看見 | `revealHere`；`sight` | `engine/game.ts:1788-1791`；`data/conditions.ts` | 步行距離，不是 `fogState` |
| §0.3、§5.3 回合 | `move()` | `engine/game.ts:364-422` | 本體搬進私有 `stepParty(dir)`，一行不改 |
| §5.4 開戰 | `startBattle` | `engine/game.ts:1905-1935` | `opts.wander`、`opts.affixAt`（`:1914` 的 `this.pos` 改讀 `affixAt ?? this.pos`） |
| §5.4 戰後 | `submitRound` | `engine/game.ts:829-950` | `:850` 逃、`:851` 敗、`:861-864` 報酬、`:909` 好感、`:916` 碎片 |
| §5.5 報酬 | `battleGear`、`battleRunes` | `engine/game.ts:959-985`、`:1017-1042` | 第二個參數傳 `true` |
| §5.4 逃跑 | `escapeChance`、`!s.boss` | `engine/battle.ts:1066-1069` | 不改 |
| §6.2 名單 | `MAINLINE_WARDENS`、`REGION_WARDENS`、`listedEnemy`、`artEnemy` | `data/monsters.ts:68-70`、`:189-193` | |
| §6.3 量法 | 22i | `engine/balance.roster.test.ts:601-639`；`engine/sim.ts`（`kitParty`、`simBattle`） | 照抄，不 import 凍結檔 |
| §9.1 地圖 | `drawMarkers`、`glyphOf`、`GLYPH_FILL` | `render/MapView.ts:21-29`、`:166-208` | 另一個 `Container` |
| §9.2 小地圖 | `MINIMAP_COLORS`、`draw` | `ui2/minimap.ts:14-29`、`:89-92` | |
| §9.3 場景 | `step()`、`fightOn` | `ui2/scenes/dungeon.ts:333-361`、`:418-428` | `battle` 照舊 |
| §9.3 回到地圖說一次 | 照 `scoutDone` | `engine/game.ts:190-194` | `wanderNotes` 佇列 |
| §5.6 測試的開關 | 照 `withGatherLive`／`withGatherOff` | `engine/testing.ts:254-287` | |
| §5.6 潛行快照 | `stepOnto`、`plantGlimmer`、`plantElite`；舊怪物表 | `engine/storyL.dive.test.ts:33-68`、`:59-61` | |
| §5.6 城鎮快照 | 只到第 3 層 | `engine/guild.legacy.test.ts:206-221` | |
| §5.6 行走 | 照 `gather.walk` | `engine/gather.walk.test.ts:1-30` | BFS 避開固定戰鬥格 |
| e2e 的開關 | 照 `gatherHandle` | `ui2/debugGather.ts:1-12`；`ui2/main.ts` | |

## 計畫裁定

spec 沒寫細的地方，全部是「計畫裁定」，同時抄進 spec §0。

1. **分期與 PR**：照「分期與 PR」表。B 要 A 已合併；C 要 A、B；D 的 D1 隨時可做、D2 之後要使用者核准、D4 要 B 已合併。每個 PR 的第一個任務錄自己的 `gate-0`。
2. **檔名**：`data/wander.ts`、`data/wander.test.ts`、`engine/dungeon/wander.ts`（`placeWanderers`、`openPath`）、`engine/dungeon/wander.test.ts`、`engine/wander.ts`（`nextOf`、`wanderTurn`、`spotWanderers`、`wanderView`）、`engine/wander.test.ts`、`engine/wander.guard.test.ts`、`engine/wander.legacy.test.ts`、`engine/wander.placements.test.ts`、`engine/wander.walk.test.ts`、`engine/wander.bands.test.ts`、`engine/__fixtures__/wander/placements.json`、`ui2/debugWander.ts`。
3. **`data/wander.ts` 的介面**（A1）：
   - `WANDER_SWITCH: { live: boolean; open: (s: GameState) => boolean; pool?: readonly string[] } = { live: false, open: (s) => s.story.act1Cleared }`、`wanderOpen(s)`、`WANDER_SALT = 0x3956c25b`。`pool` 只給測試輔助用（設了就取代名單，不過 `listedEnemy`／`artEnemy`）。
   - `WanderKind = 'patrol' | 'guard' | 'chase'`；`WANDER_KINDS`（這個順序）；`WANDER_WEIGHTS = [4, 3, 3]`；`WANDER_FROM = 4`；`wanderCount(depth)`（spec §6.1）；`WANDER_POOL: Record<RegionId, { id: string; from: number }[]>`（spec §6.2）；`wanderPool(region, depth): string[]`（`from ≤ depth`、`listedEnemy && artEnemy`，表的順序）。
   - `WANDER_ROUTE_MAX = 4`、`WANDER_CHASE = 3`、`WANDER_GIVE_UP = 6`、`WANDER_NOTICE = 4`、`WANDER_NOTICE_FOG = 2`、`WANDER_REST = 3`、`WANDER_RARE_QTY = 2`；`WANDER_EXCEPTIONS: Record<string, { rate: number; why: string }> = {}`（A4 量到才寫）；`WANDER_ART: ReadonlySet<string>`（空，PR D 填）。
4. **型別**（A2）：`Rect = { x; y; w; h }`；`Wanderer = { id: number; foe: string; kind: WanderKind; home: Pos; pos: Pos; route?: Pos[]; leg?: number; dir?: 1 | -1; chasing?: true; rest?: number; seen?: true; down?: true }`（`id` 是這一層的放置順序）；`WanderFloor = { list: Wanderer[]; keepOut: Rect[]; told?: true }`。`Run.wander?: true`、`Run.wanderers?: Record<number, WanderFloor>`，都不存檔。
5. **`placeWanderers` 的抽法**：照 spec §5.2 的順序寫死，註解逐步編號；不抽的情況（沒有房間、太淺、頭目層、名單空、`wanderCount` 是 0）回 `{ list: [], keepOut }` 而且一次都不呼叫 `rng`。路線取段的算式：沿 `axis` 的可用連續格依座標排序成 `line`、`home` 在第 `k` 格、`cap = min(WANDER_ROUTE_MAX, 房間在那個方向的寬 − 1)`；`line.length < 2` 或 `cap < 2` 就換方向；`start = clamp(k − ⌊(cap − 1) ÷ 2⌋, 0, line.length − cap)`；`route = line.slice(start, start + min(cap, line.length))`；`leg = k − start`；`dir = leg === route.length − 1 ? −1 : 1`。
6. **`Game.move` 的形狀**（A3）：今天的 `move(dir)` 本體原封不動搬成 `private stepParty(dir)`；新的 `move(dir)`：
   ```ts
   move(dir: Dir): MoveResult {
     const w = this.run?.wander ? this.wandererAhead(dir) : null;   // phase 'map' and the cell ahead holds a live wanderer
     if (w) { this.facing = dir; this.finaleWaiting = false; return this.meetWanderer(w, 'bump'); }
     const r = this.stepParty(dir);
     if (!this.run?.wander || this.phase !== 'map') return r;
     return (r.kind === 'moved' ? this.wanderTurn() : null) ?? (this.spotWanderers(), r);
   }
   ```
   `wanderTurn()` 先 `spotWanderers()`、跑一回合、再 `spotWanderers()`；有接觸就回 `meetWanderer(w, 'caught')` 的結果，否則 `null`。`run.wander` 為假時，`move` 只多一次讀屬性。
7. **`startBattle` 的兩個參數**：`opts.wander?: number`（這一層的徘徊者 id；`this.wanderFight` 在每一次 `startBattle` 都重設，照 `wardenFight`）、`opts.affixAt?: Pos`（`:1914` 的精英詞綴鍵改成 `opts.affixAt ?? this.pos`；不給時逐一和今天相同）。
8. **`submitRound` 的分支**：讀出並清掉 `wanderFight`（照 `eliteAt`／`wardenFight` 的寫法）；`fled` → 那一隻 `rest = WANDER_REST`、刪 `chasing`，`wanderNotes` 加 `{ how: 'shaken', name }`；`lose` 照舊；勝 → `battleGear(b, elite !== null || wander !== null, tier)`、`battleRunes` 同；`found.rare` 的數量是 `wander ? WANDER_RARE_QTY : 1`；碎片的條件 `b.boss || (elite && !warden)` 不動（徘徊者沒有 `eliteAt`，自然不給）；好感的條件改成 `b.boss || elite || wander`；`down = true`；`wanderNotes` 加 `{ how: 'down', name }`；`BattleEnd.wanderer = foe`。`name` 取 `b.enemies[0].name`（`engine/combatant.ts:18`）。
9. **`wanderNotes`**：`Game.wanderNotes?: { how: 'seen' | 'down' | 'shaken'; name?: string }[]`，不存檔；地圖讀完清掉（照 `scoutDone`，`engine/game.ts:190-194`）。`'seen'`：一層第一次有徘徊者 `seen` 時加一次（`WanderFloor.told`）。
10. **`wanderView()`**（給介面，唯讀）：這一層 `seen && !down` 的每一隻 `{ id, foe, kind, pos, next: Pos | null, chasing, resting }`；`next` 是 `nextOf` 的結果，`rest > 0` 時 `null`。`run.wander` 為假回 `[]`。
11. **快照與證據的做法**（spec §5.6）：
    - **樓層不動**（`engine/wander.legacy.test.ts`，A2）：`withRosterOnly([])` 與 `withWanderLive(f, { open: true, pool: ['false-moon'] })` 下，`newRun` 之後設 `run.wander = true`，每一層的 `map` 與 `contents` 整份等於 `__fixtures__/roster/floors.before.json`（不去掉任何東西）；另一個 `it`：同一個 `Run` 開與關的相對比較，樣本涵蓋 `rescuesFor` 的救援房、`run.glimmers[depth]` 強制的回憶光點、`withRosterLive` 的守關者層、`run.gather = true` 的採集點；每一種另斷言至少一層真的放了徘徊者。
    - **放置釘住**（`engine/wander.placements.test.ts`，A2 錄）：種子 1–3 × 七個地區 × 深度 1–40 的每一層 `{ list, keepOut }`（出貨的名冊），`WANDER_RECORD=1` 寫 `engine/__fixtures__/wander/placements.json`；A2 之後任何任務都不准重錄；fixture 不存在時失敗。
    - **潛行快照**（A3）：`engine/storyL.dive.test.ts` 新 `it('the dive past wanderers it never touches is the dive it was')`：`withRosterOnly([], () => withBondScale(0, () => withWanderLive(() => dive(watch), { open: true, pool: ['false-moon'] })))`；同一份 fixture；`watch` 多記每一層的徘徊者數與「被清掉」的次數；斷言第 4、6 層至少一層有徘徊者、整段沒有接觸（`MoveResult` 沒有 `wanderer`）。測試檔裡 `stepOnto` 在放位置之前，把站在 `from`、目標格與目標格四個鄰格上的徘徊者從 `run.wanderers[floor].list` 拿掉；`plantGlimmer`／`plantElite` 選好格子之後，拿掉站在那一格上的（都記數）。腳本的每一步都經過 `stepOnto`，而接觸只發生在「徘徊者在隊伍這一步的新格子旁邊」時，所以這樣清掉就保證整段沒有接觸；其他輔助函式不動，任何 fixture 都不動。非空的斷言在清之前記（進入那一層時的隻數）。
    - **城鎮快照**（A3）：`engine/guild.legacy.test.ts` 新 `it('the town as it was, with wanderers open')`：`withWanderLive(() => townScript({ strip: true }), { open: true })`；同一份 fixture；斷言每一趟的每一層 `run.wanderers[d].list` 都是空的（腳本只到第 3 層；這是深度閘門的證據，不是非空的證據）。`TownRun` 多記這一項，照採集加 `gathers` 的做法。
    - **接觸之前逐步相同**（`engine/wander.walk.test.ts`，A3）：照 `engine/gather.walk.test.ts` 的骨架（隊伍 50 級、每場戰鬥後補滿、抄來的 `fight()`、BFS 避開會開固定戰鬥的格子；出貨的名冊）；段落：本道 `start: 6`、鋼鐵 `start: 5`，各三層。同一個種子跑兩次：開（`{ open: true }`）與關（`{ open: false }`）；路線由**關的那一次**算出並記下（每層依序走到每個房間的中心再到樓梯），開的那一次照走同一串方向；每一步記結果種類、注入計數的 `game.rng` 次數、計量、位置；兩串逐一相同，直到開的那一次第一次出現 `wanderer`（之後不比、這一段結束）。斷言：全部段落合計，接觸之前徘徊者移動 ≥ 40 步（`wanderTurn` 的移動計數，從 `run.wanderers` 的位置變化算）、至少一隻 `seen`。沒有 fixture。
    - **會壞才算證明**（A3 Step 3b）：暫時把 `floorOf` 的 `placeWanderers` 那一行改成什麼都不做 → 潛行快照的非空斷言與行走的「≥ 40 步」紅；改回來；暫時在 `wanderTurn` 開頭加一次 `this.rng()` → 行走的逐步相同紅；改回來。兩次的輸出存 SDD `A/task-A3-stub.txt`。都不 commit。
12. **不堵路的證明**（A2，`engine/dungeon/wander.test.ts`）：抽樣（Global Constraints 的大小）種子 × 七個地區 × 深度 4–60：`openPath(map, blocked)`（把每一隻的靜態格當牆，從入口走 `tileAt !== 'wall'` 到 `map.down`）為真；另一個 `it`：手工的樓層（兩個房間之間只有一格寬的走道、`rng` 寫死選到會切斷的那一格）證明那一隻被丟掉、`list` 少一隻、`rng` 的呼叫次數照常。
13. **e2e 的開關**：`ui2/debugWander.ts` 只在 dev build 把 `WANDER_SWITCH` 掛到除錯把手上（照 `gatherHandle`），B3 的可讀性 e2e 在開關關著時也能量畫面。
14. **強度量測的處理**（A4，spec §6.3）：一次調整只動 `WANDER_POOL` 的 `from`；`WANDER_EXCEPTIONS` 的鍵是 `<region>:<depth>:<foe>`。量測檔 opt-in，平常的全套不跑它（`describe.skipIf(process.env.WANDER_BANDS !== '1')`，照 `balance.roster.test.ts` 的 opt-in 寫法）。

## 分期與 PR

| PR | 分支 | 內容 | 任務 | sim gate | 美術 |
|---|---|---|---|---|---|
| **A** 引擎 | `feat/starlantern-wander-a` | 基準、開關與資料、放置、移動與戰鬥、強度量測 | A0–A4（5） | identical | 0 |
| **B** 介面 | `feat/starlantern-wander-b` | 地圖與小地圖的標記、場景的通知、可讀性 e2e | B1–B3（3） | identical | 0 |
| **C** 上線 | `feat/starlantern-wander-live` | 打開 `WANDER_LIVE`、`withWanderOff`、e2e | C1–C2（2） | identical | 0 |
| **D** 美術（等使用者） | `feat/starlantern-wander-art` | 地圖標記 ×3：契約、樣本、生成與發布、接線 | D1–D4（4） | 不跑（D4 只動 `ui2/`、`render/`） | 3 張 |

合計 4 個 PR、14 個任務。每一個任務的閘門都是 `gate: identical`（sim 不建 `Game`，徘徊者碰不到它）；沒有任何任務可以重錄 sim gate。沒有寫作任務。

---

## Global Constraints

**使用者的方向（最高依據）**
- 「先把遊戲本身做好」；平衡不是優先，但不能有漏洞。劇情暫停：只寫中性的系統文字。
- 只有畫風與重大取捨找使用者；本計畫唯一要使用者的是 PR D 的地圖標記樣本（spec §13）。

**分支與基準**
- 計畫與 spec 定案在 `docs/starlantern-wanderers`。每個 PR 的實作分支從開工時的 `origin/master` 開出，先 cherry-pick 本計畫的 commit（若還沒合併）。開工前 `git status` 乾淨；要改的檔案有別人未提交的修改，NEEDS_CONTEXT。

**模擬閘門**（每一個碰到 `engine/`、`data/` 的任務都跑；每個 PR 的第一個任務錄 `gate-0`）
- 指令：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-0 > <SDD>/gate-<N>.stdout`；最後一行必須是 `gate: identical`；`cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。`engine/parity.test.ts` 的 `PARITY_TASK` 維持 `between plans`。
- **逐位元的其他證據**（每個碰 `engine/`、`data/` 的任務都跑，一律不重錄；任何一個紅就 BLOCKED）：`engine/legacyFights.test.ts`、`engine/floors.snapshot.test.ts`、`engine/storyL.dive.test.ts`（`STORY_L_RECORD` 不准設）、`engine/guild.legacy.test.ts`（`GUILD_RECORD` 不准設）、`engine/gather.legacy.test.ts`、`engine/gather.points.test.ts`（`GATHER_RECORD` 不准設）、`engine/gather.walk.test.ts`、`engine/game.test.ts` 的 `Normal drops are as before`、`engine/battle.test.ts` 的 `keystones in battle`；A2 起 `engine/wander.legacy.test.ts`、`engine/wander.placements.test.ts`（`WANDER_RECORD` 只在 A2 錄 fixture 時設）；A3 起 `engine/wander.walk.test.ts`。
- 不用 `Math.random`、不讀 `Date`；新串流只有 `WANDER_SALT` 那一條，只在 `placeWanderers` 用。

**測試與檢查**
- **TDD**：先寫失敗的測試，確認它因正確的理由失敗，再實作。
- **vitest**：單檔 `rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套 `rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`（watch 模式）。
- **tsc**：`rtk proxy npx tsc --noEmit -p .`；`src/scripts/games/starlantern/` 與 `tests/e2e/starlantern*.ts` 底下 0 個；全 repo 總數不多於 PR 開工時 `baseline.md` 記的值。
- **e2e**：`E2E_PORT=4353 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts --project=chromium --project=chromium-dpr125 --project=chromium-dpr150`；headless、靜音。**絕不用 4354、4321**；不結束任何程序。**不用 Playwright MCP、任何瀏覽器 MCP、Claude in Chrome、內建瀏覽器、computer-use。**
- **重的工作**（閘門、e2e、全套、`WANDER_FULL=1`、`WANDER_BANDS=1`、生成）之前：照控制者當時指定的 `heavy.lock` 規則；沒有指定時 PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` ≥ 6291456（KB），一次只跑一套；瑪奇的模擬器在跑時先問控制者（`heavy-tests-yield-to-emulators`）。
- 本專案沒有 prettier、eslint。一次性的探測程式跑完就刪，絕不 commit。
- **測試修改規則**：每個任務的 Files 列出已知會紅的既有測試與改法；不放寬門檻、不刪斷言、不加 `skip`／`only`／`todo`／`it.fails`（A4 的 opt-in `skipIf` 是新檔自己的開關，不算）；全套出現沒列到的紅燈就 NEEDS_CONTEXT。
- **抽樣的大小**：種子 × 七地區 × 深度的抽樣（A2）平常跑每組前 40 個種子，`WANDER_FULL=1` 跑一千；PR A 的最後一個碰 `engine/` 的任務跑一次完整的，結果記進報告。

**決定性**
- `engine/dungeon/wander.ts` 只用呼叫者給的 `rng`；`engine/wander.ts` 一個亂數都不抽（`engine/wander.guard.test.ts` 掃原始碼：不出現 `this.rng`、`rng(`、`Rng`、`mulberry32(`、`lootRng`、`memoryRng`、`trophyRng`、`runeRng`、`Math.random`、`Date`；`engine/dungeon/wander.ts` 不出現 `mulberry32(`、`Math.random`、`Date`；`engine/dungeon/run.ts` 裡 `WANDER_SALT` 恰好出現一次）。
- 一層的徘徊者由 `(run.seed, depth, region, 樓層此刻的格子)` 決定；同一個 `Run` 同一層只生成一次。所有清單依資料表、房間 id 或 `list` 的順序。

**存檔**：不加任何欄位；`SAVE_VERSION` 不變；`Run.wander`、`Run.wanderers`、`Game.wanderNotes` 不存檔。

**平衡（凍結）**：`balance*.test.ts`、`builds.bands.*.test.ts`、`tierBands*.test.ts`、`tierBands.ts`、`buildBands.ts`、`bands.ts`、`legacyFights.test.ts` 一個字都不改；不動任何既有旋鈕（`ELITE`、`ELITE_REWARD`、`ENCOUNTER_PACE`、`GEAR_CHANCE`、`RUNE_DROP`、`RARE_MATERIALS`、`TIERS`、`AFFIXES`、`BOND_*`、`FIELD_POINTS`、`WARDEN_GROUPS`、`MAINLINE_WARDENS`、`REGION_WARDENS`）。徘徊者的數字（`data/wander.ts`）是【起始提案】。

**文字**：只有 `data/text.zh-TW.ts` 的 `T.ui2.wander`（spec §8）；先 grep 確認不撞名；`data/terms.test.ts`（「菁英」「回復」等）、`data/glyphs.test.ts`（spec 開頭已量過 spec 裡的字）；字級只有 12／24 px；SCSS 只改 `src/styles/_starlantern-ui.scss`，禁 `!important`、行內樣式、`element.style`；不用 ▶ ◀ ▸ ▾；零個「……」、零個「！」。

**換行**（改檔前 `git ls-files --eol <檔>`，改完 `git diff --stat` 必須等於 `git diff --stat --ignore-cr-at-eol`；整檔被改寫就是換行壞了，立刻再改一次修回；CRLF 與混用檔不可以用 `sed -i`；新檔一律 LF。2026-10-30 量到的：）
- LF：`data/monsters.test.ts`、`engine/dungeon/run.ts`、`engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`、`render/markers.ts`、`ui2/minimap.ts`、`ui2/scenes/dungeon.ts`、`docs/superpowers/**/*.md`。
- CRLF：`engine/{testing,types,map,game.test}.ts`、`art-factory/starlantern/contract.md`。
- 混用（新行照相鄰行）：`engine/game.ts`、`data/text.zh-TW.ts`、`render/MapView.ts`、`ui2/main.ts`、`ui2/scenes/battle.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`。
- 沒列到的檔，動手前先量。

**git**：用完整路徑 add，不可以 `git add -A`／`git add .`；Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；不可以 `git checkout -- <path>`、`restore`、`reset`、`stash`、`clean`、`worktree remove --force`；要撤回就再改一次檔案。不 push（控制者在驗收後決定）。

**收尾 G（每個任務）**
1. 全套全綠；tsc 符合上面的條件。
2. 碰到 `engine/`、`data/` 時跑閘門與 `cmp`，以及「逐位元的其他證據」的每一個檔。
3. 動到 `ui2/`、`render/`、`src/styles/`、`tests/e2e/` 時，或改到的字串在 `tests/e2e/starlantern.spec.ts` 裡逐字出現時（先 grep），跑 e2e 三個專案並全綠。
4. 換行檢查。
5. 報告：新增與修改的測試名；全套兩行、tsc 數字、閘門與 e2e 結果（沒跑寫理由）；改了哪些既有斷言；偏離本計畫的地方與理由。

**子代理**：實作者不派子代理。審查與美術的視覺檢查由控制者另派全新脈絡的代理，模型 Opus；子代理一律不准用 Playwright MCP、任何瀏覽器 MCP、Claude in Chrome、內建瀏覽器或 computer-use。

## Review Focus

1. **關著或沒打開就是今天的遊戲**：`run.wander` 不存在；`move()` 只多讀一次屬性；閘門 identical；所有釘子不動。→ A0、A3、C1。
2. **樓層不動**：放置在最後、只讀樓層、自己的串流；開著時樓層逐一等於快照（不用去掉東西）。→ A2。
3. **開著沒碰就不動，而且證明不是空的**：移動不抽亂數；潛行快照同一份 fixture 而且有徘徊者；行走在接觸之前逐步相同而且徘徊者真的走了；兩種破壞都會紅。→ A3。
4. **一步一件事**：只在 `moved` 之後行動；接觸不走 `walk()`；計量不動；接觸與事件、隨機遇敵、固定戰鬥不同步。→ A3。
5. **不堵路、安全的房間**：通行檢查與窄走道的反例；`keepOut` 的房間走不進去；追丟回原位。→ A2、A3。
6. **戰後的規則**：勝 → 消失、精英報酬、素材 ×2、沒有碎片；逃 → 停 3 回合；敗 → 全滅；詞綴以 `home` 為鍵。→ A3。
7. **看得懂**：看見才畫、現在的位置、提示格與 `nextOf` 同一個函式、文字標記、沒有佔位圖、通知只有系統文字。→ B 系列。

---

## 檔案結構

**新增**：計畫裁定 2 的全部；PR D：`art-factory/starlantern/tools/wander_art.py`、`test_wander_art.py`。

**修改**：
- 資料：`data/monsters.test.ts`（`salts are distinct`）、`data/text.zh-TW.ts`（`T.ui2.wander`，PR B）。
- 引擎：`engine/dungeon/run.ts`（`Run.wander?`、`Run.wanderers?`、`floorOf` 最後一行）、`engine/game.ts`（`depart` 一行、`move`／`stepParty`、`wandererAhead`、`meetWanderer`、`wanderTurn`、`spotWanderers`、`wanderView`、`wanderNotes`、`startBattle` 的兩個參數、`submitRound` 的分支、`BattleEnd.wanderer?`、`MoveResult` 的 `battle` 加 `wanderer?`）、`engine/testing.ts`（`withWanderLive`；PR C `withWanderOff`）；測試：`engine/game.test.ts`、`engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`。
- 介面：`render/markers.ts`（`wanderMarks`）、`render/MapView.ts`、`ui2/minimap.ts`、`ui2/scenes/dungeon.ts`、`ui2/main.ts`（掛除錯把手）、`src/styles/_starlantern-ui.scss`（只在需要時）、對應的測試。
- e2e：`tests/e2e/starlantern.spec.ts`（B3、C2）。
- 美術（PR D）：`art-factory/starlantern/{contract.md,registry.json}`、`public/assets/games/starlantern/tiles/`、manifest、`render/artPaths.ts`、`render/artPaths.test.ts`、`data/wander.ts`（`WANDER_ART`）。
- **不改**：凍結的平衡檔、`engine/battle.ts`、`engine/scaling.ts`、`engine/encounter.ts`、`engine/events.ts`、`engine/loot/*.ts`、`engine/dungeon/{gen,rooms,gather}.ts`、`data/monsters.ts`、`data/enemies*.ts`、`engine/save.ts`、`engine/state.ts`、所有 `__fixtures__/` 既有的檔。`engine/game.ts` 的 `stepParty`（今天的 `move` 本體）、`walk()`、`springTrap()`、`battleGear()`、`battleRunes()` 一行不改。

---

# PR A：引擎（開關關著）

### Task A0：基準

**Files:** SDD `A/baseline.md`。

- [ ] **Step 1**：`git status` 乾淨；`baseline.md` 記下 `git rev-parse HEAD`、tsc 總數與 starlantern 底下的數字、全套兩行、`legacyFights.test.ts` 的兩個釘子值、`floorOf` 的最後一行是什麼（採集之後若又有別的計畫加了一行，徘徊者加在最後，寫明）、SHA-256 的 K[4] `0x3956c25b` 有沒有被用（grep 全 repo）。
- [ ] **Step 2**：讀 `engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`、`engine/gather.walk.test.ts` 的輔助函式：`stepOnto`、`plantGlimmer`、`plantElite`、`fight()`、BFS；記進 `baseline.md`（A3 依此寫「清掉站在那幾格的徘徊者」）。
- [ ] **Step 3**：grep 既有測試裡窮舉 `MoveResult`、`BattleEnd` 鍵、`startBattle` 參數、`Run` 鍵（例如 `Object.keys(run)`、`toEqual(newRun(...))`）的地方，清單記進 `baseline.md`；A2、A3 的「已知會紅」以它為準。
- [ ] **Step 4**：閘門錄 `gate-0`，`cmp` 沒有輸出；逐位元的其他證據全綠。
- [ ] **Step 5**：e2e 三個專案各跑一次，通過數記進 `baseline.md`。（A0 不 commit。）

### Task A1：開關、鹽與資料表

**Files:**
- Create：`data/wander.ts`、`data/wander.test.ts`。
- Modify：`data/monsters.test.ts`（`salts are distinct` 加 `WANDER_SALT`）、`engine/testing.ts`（`withWanderLive(f, opts?: { open?: boolean; pool?: readonly string[] })`：`live = true`；`open: true` 一律開、`false` 一律關、不給照預設；`pool` 設進 `WANDER_SWITCH.pool`；`finally` 三個都還原）。
- 已知會紅：預期沒有。

- [ ] **Step 1：寫失敗的測試**（`data/wander.test.ts`）：
  - `the switch is off`：`WANDER_SWITCH.live === false`、`pool` 不存在；`withWanderLive` 之內為真、之後還原，丟例外也還原；`{ open: false }`、`{ open: true }`、預設（新遊戲假、`act1Cleared` 真）；`pool` 設了之後還原；
  - `how many, by depth`：`wanderCount` 在 1、3、4、9、10、19、20、39、40、250 的值；
  - `who walks`：`WANDER_POOL` 七列逐列等於 spec §6.2；每個 id 是守關者（`ENEMIES[id].rank === 'warden'`）；`wanderPool('mainline', 4)` 只有 `false-moon`、`wanderPool('blaze', 24)` 是 `mirage-lead` 加本道五位；`withRosterOnly([])` 下是空的；`WANDER_SWITCH.pool` 設了就照它；
  - `the numbers are the spec's`：`WANDER_WEIGHTS`、`WANDER_FROM`、`WANDER_ROUTE_MAX`、`WANDER_CHASE`、`WANDER_GIVE_UP`、`WANDER_NOTICE`、`WANDER_NOTICE_FOG`、`WANDER_REST`、`WANDER_RARE_QTY`；`WANDER_EXCEPTIONS` 與 `WANDER_ART` 是空的；
  - `data/monsters.test.ts`：`expect(WANDER_SALT).toBe(0x3956c25b)`，不在已用清單、`WARDEN_SALT`、`TROPHY_SALT`、`GUILD_SALT`、`GATHER_SALT` 裡。
- [ ] **Step 2**：執行，確認紅（模組不存在）。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門、逐位元的其他證據。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): wanderers' switch, salt and tables, all off`。

### Task A2：放置（最後一步、自己的串流、不寫樓層）

**Files:**
- Create：`engine/dungeon/wander.ts`、`engine/dungeon/wander.test.ts`、`engine/wander.legacy.test.ts`、`engine/wander.placements.test.ts`、`engine/__fixtures__/wander/placements.json`。
- Modify：`engine/dungeon/run.ts`（計畫裁定 4 的型別與兩個可選欄位、`floorOf` 最後一行）。
- 已知會紅與改法：A0 Step 3 清單裡窮舉 `Run` 鍵的測試（若有）：可選欄位不存在時不出現，預期不紅；紅了 NEEDS_CONTEXT。任何 fixture 都不重錄。

- [ ] **Step 1：寫失敗的測試**
  - `engine/dungeon/wander.test.ts`：
    - `the draws in order`：寫死回傳序列的假 `rng`，驗 spec §5.2 與計畫裁定 5 的每一步：房間與格子的排序、行為的權重切點、名單的 `pick`、只有巡邏抽方向、路線取段的算式（房間寬 3、4、5 × 兩個方向 × `home` 在邊、中間）、兩個方向都不到 2 格變看守、`rng` 的呼叫次數；
    - `none drawn`：沒有房間、深度 3、頭目層（本道 3、5、10，地區 5）、名單空：`list` 空、`rng` 一次都沒被呼叫；
    - `where they may stand`（抽樣）：每一隻的 `home` 與路線在同一層 `run.wander` 沒設時是 `'floor'`、不在 `keepOut`、一個房間最多一隻、彼此不重疊；隻數 ≤ `wanderCount`；`keepOut` 正好是入口、出口與有精英／守關者／救援的房間；
    - `the way out stays open`（計畫裁定 12）：抽樣的每一層 `openPath` 為真；手工窄走道的反例丟掉一隻；
    - `the same floor twice`：同一個 `(seed, region, depth)` 兩次逐一相同；
    - `the floor is only read`：`placeWanderers` 前後 `f` 用 `structuredClone` 比 `toEqual`。
  - `engine/wander.legacy.test.ts`：計畫裁定 11 的兩個 `it`。
  - `engine/wander.placements.test.ts`：計畫裁定 11 的釘子；`WANDER_RECORD=1` 寫、否則讀。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。`floorOf` 只加最後一行，之前的每一行不動。
- [ ] **Step 4**：錄釘子：`WANDER_RECORD=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/wander.placements.test.ts`；不帶變數再跑兩次都綠。然後這些測試檔、`engine/dungeon/{rooms,run,gen,gather}.test.ts`、全套、tsc、閘門、逐位元的其他證據。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): wanderers placed last from a stream of their own, the floor only read`。

### Task A3：移動、接觸與戰鬥

**Files:**
- Create：`engine/wander.ts`、`engine/wander.test.ts`、`engine/wander.guard.test.ts`、`engine/wander.walk.test.ts`。
- Modify：`engine/game.ts`（計畫裁定 6–10；`depart` 在採集那一行之後加 `if (wanderOpen(this.state)) this.run.wander = true;`）、`engine/game.test.ts`、`engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`（計畫裁定 11）。
- 已知會紅與改法：A0 Step 3 清單裡窮舉 `MoveResult`／`BattleEnd` 鍵的測試：可選欄位不存在時不出現，預期不紅。潛行快照的新情境若有接觸：先確認是輔助函式沒清到（改測試檔的清法），不是就 BLOCKED。

- [ ] **Step 1：寫失敗的測試**
  - `engine/wander.test.ts`（純函式，手工的小地圖）：
    - `a patrol walks its line`：來回、端點折返、被別隻擋住時等待而且不折返、走到隊伍那一格是接觸；
    - `a guard stands`：`nextOf` 永遠 `null`；
    - `a chaser`：距離 3 開始追、4 不追；追的時候到 6 還追、7 放棄並走回原位、回到原位停；沒有路就放棄；鄰格順序「上、右、下、左」的同步數平手；
    - `the safe rooms`：`keepOut` 裡的格子永遠不是 `next`（隊伍站在裡面時追蹤者在邊上等，不接觸）；
    - `rest`：`rest > 0` 時不動、每回合減一；
    - `one contact a turn`：兩隻同時能接觸時只有 `list` 前面那一隻，後面的不動；
    - `seen`：步行距離 4 看見、5 不見、隔牆不算；`sight === 0` 時 2；看見之後一直是 `seen`；
    - `nothing drawn, nothing changed by a look`：`nextOf`、`wanderView` 前後狀態 `toEqual`。
  - `engine/wander.guard.test.ts`：Global Constraints「決定性」的掃描。
  - `engine/game.test.ts`（新 `describe('wanderers in the game (wanderers plan Task A3)')`）：
    - `off, nothing at all`：開關關著，出發之後 `run.wander` 不存在、`run.wanderers` 不存在、`wanderView()` 是 `[]`；同一串 `move()` 的結果、`game.rng` 次數、計量和 `withWanderLive(f, { open: false })` 下逐一相同；
    - `shut until act one is cleared`：`withWanderLive`（不給 `open`）、`act1Cleared` 假：同上；
    - `the start floor has them`：用 `floorOf(newRun(...))` 找一個出發層（第 6 層）會放的種子；`{ open: true }` 下出發，`game.run.wanderers[6].list` 非空；
    - `a bump`：隊伍旁邊放一隻（測試直接改 `pos`）→ `move` 回 `battle` 帶 `wanderer.by === 'bump'`；隊伍沒移動、`facing` 對、計量不變、`game.rng` 在開戰之前沒有被 `walk()` 抽；戰鬥只有那一隻、名字沒有 ★、`scale.elite` 是牠；
    - `caught`：追蹤者在 2 步外 → 隊伍走一般的一步 → 回 `battle` 帶 `by: 'caught'`；隊伍在新的格子上；
    - `one thing a step`：隊伍踩上事件格、撞牆、或這一步遇敵時，徘徊者的位置不變；踩採集點時照常動；
    - `won`：用既有的打法打贏 → `down`、`wanderView()` 不再有牠、這一層再也沒有接觸；報酬：一件裝備、稀有素材 2 個（同一種）、沒有碎片、`lootDraws` 的增量和同一個種子的精英戰相同；`wanderNotes` 有 `down`；
    - `fled`：逃跑成功（注入讓逃跑必中的 `rng` 序列，照既有逃跑測試的做法）→ `rest === 3`、`chasing` 不在、位置不變；接下來三步牠不動；`wanderNotes` 有 `shaken`；
    - `lost`：輸了 → `wipe` 照舊，`run` 是 `null`；
    - `affixes by home`：地獄難度下同一隻在兩個不同的格子被碰到，詞綴相同；
    - `the gauge is left alone`：接觸與戰後計量等於接觸之前；
    - `a reload forgets the trip`：出發、打倒一隻、`loadGame` → 回到城鎮存檔，沒有任何徘徊者的痕跡（`GameState` 沒有新鍵）。
  - `engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`、`engine/wander.walk.test.ts`：計畫裁定 11。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。`stepParty` 是今天 `move` 本體的原樣搬移（`git diff` 只看得到縮排以外的那一行方法名）。
- [ ] **Step 3b：會壞才算證明**（計畫裁定 11）：兩次暫時的破壞，各自確認紅，再用編輯改回（不用 `git checkout`／`restore`），重跑全綠。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門、逐位元的其他證據。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): wanderers walk when the party walks, and fight when they meet`。

### Task A4：強度的量測（opt-in）

**Files:**
- Create：`engine/wander.bands.test.ts`。
- Modify：`data/wander.ts`（只在量到紅時：`WANDER_POOL` 的 `from` 或 `WANDER_EXCEPTIONS`）、`data/wander.test.ts`（照實際值）、spec §6.2 的表（`from` 有改時）。

- [ ] **Step 1**：照 spec §6.3 與名冊 22i 寫測試（期望隊伍、`levelAt`、`KITS`、種子照 22i 抄，不 import 凍結檔）；`WANDER_BANDS` 沒設時跳過；`WANDER_EXCEPTIONS` 裡的格子另斷言「量到的值等於記下的值」。
- [ ] **Step 2**：`WANDER_BANDS=1` 跑一次（重的工作）；每一格的勝率與回合數記進報告。
- [ ] **Step 3**：紅的格子照計畫裁定 14：一次調整（`from`），重跑；還紅就寫進 `WANDER_EXCEPTIONS` 並在 SDD `A/todo.md` 記一條。綠的格子不動。
- [ ] **Step 4**：全套（不設變數，這個檔跳過）、tsc、閘門、逐位元的其他證據；`WANDER_FULL=1` 跑一次 A2 的完整抽樣，結果記進報告。
- [ ] **Step 5**：收尾 G，commit：`test(starlantern): wanderers measured against the expected party`。

**PR A 收尾**：控制者派全新脈絡的審查者看 diff（重點：Review Focus 1–6；`stepParty` 是原樣搬移；樓層只讀；兩種破壞真的會紅）。

---

# PR B：介面（要 A 已合併）

### Task B1：地圖與小地圖

**Files:**
- Modify：`render/markers.ts`（`wanderMarks(game): { x; y; kind: WanderKind; chasing: boolean; memory: boolean; next: Pos | null }[]`，讀 `game.wanderView()`；`WANDER_GLYPH = { patrol: '巡', guard: '守', chase: '追' }`）、`render/MapView.ts`（新的 `threats` `Container`，在霧之上：文字標記 24 px、平常 `0xff8a6a`、追的時候 `0xff3b30`、`memory` 時 alpha 0.6；提示格是 `Graphics` 的半透明紅方塊；`WANDER_ART` 有圖之前不去要圖）、`ui2/minimap.ts`（`MINIMAP_COLORS.wander`、`wanderNext`，畫在事件之後、隊伍之前）、對應的測試檔（`render/markers.test.ts`、`render/MapView.test.ts`、`ui2/minimap.test.ts`，A0 量過哪些存在）。
- 已知會紅：`MINIMAP_COLORS` 的鍵若被逐一釘住，照實際加兩個（意圖不變）。

- [ ] **Step 1：寫失敗的測試**：`wanderers on the map`（看見過的才有標記、位置是現在的、`down` 的沒有、看守沒有提示格、`rest` 時沒有提示格、提示格等於 `nextOf`）；`MapView` 在 `run.wander` 為假時畫的東西和今天逐一相同（`threats` 是空的）；小地圖的兩個顏色與畫的順序。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：全套、tsc、閘門、逐位元的其他證據、e2e。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): wanderers on the map and the minimap, as text until their art`。

### Task B2：場景的通知與除錯把手

**Files:**
- Create：`ui2/debugWander.ts`、`ui2/debugWander.test.ts`。
- Modify：`data/text.zh-TW.ts`（`T.ui2.wander`：spec §8 的三句與三個行為名）、`ui2/scenes/dungeon.ts`（回到地圖與每一步之後讀並清掉 `game.wanderNotes`，用 `say` 說；被追上的那一步先 `refresh()` 再 `fightOn`）、`ui2/main.ts`（照 `gatherHandle` 的掛法）、`ui2/scenes/dungeon.test.ts`（若存在）。
- 已知會紅：預期沒有。

- [ ] **Step 1：寫失敗的測試**：三種通知各說一次、讀完清掉；`run.wander` 為假時場景的行為逐一相同；`debugWander` 在 `dev` 為假時是空物件（照 `ui2/debugGather.test.ts`）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：`data/terms.test.ts`、`data/glyphs.test.ts`、`ui2/typeScale.test.ts`、全套、tsc、閘門、e2e。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): the map says when wanderers are near, beaten or shaken off`。

### Task B3：可讀性 e2e

**Files:** `tests/e2e/starlantern.spec.ts`。

- [ ] **Step 1**：e2e `wanderers are legible`（用 `tests/e2e/starlantern-legibility.ts` 既有的工具）：除錯把手打開開關（`open: () => true`）、注入的存檔（本道到過第 6 層）、從第 6 層出發；用把手讀 `game.wanderView()` 與 `game.run.wanderers`，走到看得見的地方：文字標記不被裁、不壓在隊伍列與小地圖上、提示格在標記旁邊；三個專案（含 dpr 125／150）都量。走路照 spec 檔既有的輔助函式；沒有就在 spec 檔裡加一個小的 BFS（只走 `tileAt !== 'wall'`）。
- [ ] **Step 2**：e2e 三個專案全綠；全套、tsc。
- [ ] **Step 3**：收尾 G，commit：`test(starlantern): wanderers are legible`。

**PR B 收尾**：控制者派全新脈絡的審查者看 diff（重點：開關關著時畫面不變、提示格的來源是引擎、沒有佔位圖與佔位字、標記在霧之上）。

---

# PR C：上線（要 A、B 已合併）

### Task C1：打開開關

**Files:**
- Modify：`data/wander.ts`（`WANDER_SWITCH.live = true`）、`data/wander.test.ts`（`the switch is off` 改成 `the switch is on`）、`engine/testing.ts`（`withWanderOff(f)`，照 `withGatherOff`，自己有一條紅綠測試）、spec §0（計畫裁定與實作偏離抄回）。
- 已知會紅與改法（意圖不變）：測「開關關著」的測試（A3 的 `off, nothing at all` 等）不能再靠預設值：只把「關著的那一半」包進 `withWanderOff`，斷言一個字都不改。`storyL.dive` 與 `guild.legacy` 的原情境：潛行快照用舊怪物表（名單空、不放）、城鎮腳本只到第 3 層，預期仍逐一相同；任何紅燈都是設計被破壞，BLOCKED，不准重錄。其他清單測試若因為打開而多了東西，照實際改並列進報告；其他 NEEDS_CONTEXT。

- [ ] **Step 1**：開關打開前跑一次閘門與逐位元的其他證據：全部 identical。
- [ ] **Step 2**：先寫 `withWanderOff` 的紅綠測試（回傳、丟例外、promise 結束之後都還原），再打開開關，改清單測試。
- [ ] **Step 3**：全套、tsc、閘門 identical、`cmp`、逐位元的其他證據（**一個都不重錄**）。
- [ ] **Step 4**：收尾 G，commit：`feat(starlantern): wanderers go live`。

### Task C2：e2e

**Files:** `tests/e2e/starlantern.spec.ts`。
- 已知會紅：既有的 e2e 若走過第 4 層以後的一般格子（看過第一幕），可能被追上：先查（A0 的基準），有就在那幾步之前用把手把那一層的 `list` 清空，寫進報告；不改既有步驟的意圖。

- [ ] **Step 1：寫失敗的 e2e**：`wanderers: seen, met, beaten, gone`：注入的存檔（`act1Cleared`、本道到過第 6 層、隊伍等級夠）→ 出發第 6 層 → 用把手找到一隻、走到看得見 → 地圖上有標記與提示格 → 撞上去 → 戰鬥畫面的敵人圖是那位守關者的 → 打贏（照 spec 檔既有的打法）→ 回到地圖：通知那一行、標記不見、稀有素材在背包裡是 2 個 → 重新整理之後回到城裡的存檔。
- [ ] **Step 2**：執行，確認綠（C1 之後）。
- [ ] **Step 3**：e2e 三個專案全綠；全套、tsc。
- [ ] **Step 4**：收尾 G，commit：`test(starlantern): e2e for wanderers`。

**PR C 收尾**：控制者派全新脈絡的審查者看 diff，並由控制者在 4321 開一次給使用者看（附可點的網址，`CLAUDE.md` 的鐵則；代理自己不開瀏覽器）。

---

# PR D：美術（要使用者核准地圖標記的樣本）

開工條件：D1 隨時可做；D2 之後要使用者對 spec §13 的樣本回答。沒有核准之前，標記照舊是文字（不是缺陷）。

### Task D1：契約與工具

**Files:**
- Modify：`art-factory/starlantern/contract.md`（新增一列：`tile-wander-<patrol|guard|chase>`，照事件地磚：62×62 透明畫布、主體置中、`shared_block`；方向 B 另寫「守關者戰鬥圖的縮圖＋行為框」的規格）、`art-factory/starlantern/registry.json`。
- Create：`art-factory/starlantern/tools/wander_art.py`、`test_wander_art.py`（照 `roster_art.py`／`gather_art.py` 的 `plan-json`、`gen`、`qa`、`approve`、`publish`；洋紅去背與機械 QA 用既有的函式；沒有樣本核准時 `gen --batch t1` 拒絕）。

- [ ] **Step 1**：`test_wander_art.py` 先寫（尺寸、去背、殘留、霧邊、邊緣殘留、內部過度擦除、沒核准就拒絕）；`rtk proxy python -m pytest art-factory/starlantern/tools -q` 紅。
- [ ] **Step 2**：實作；pytest 綠。
- [ ] **Step 3**：commit：`feat(starlantern): art contract and tools for wanderer markers`。

### Task D2：樣本（使用者核准）

- [ ] **Step 1**：產一張樣本表（三種行為 × 方向 A、B）；機械 QA 全過。
- [ ] **Step 2**：放到使用者打得開的網址（控制者處理），等使用者選。
- [ ] **Step 3**：核准後 `approve --batch t0 --by "<使用者原話> <YYYY-MM-DD>"`；registry 寫 `wander_marker_style_approved`、`wander_marker_style_anchor`。commit：`chore(starlantern): wanderer marker style approved`。

### Task D3：生成、審核、發布

- [ ] **Step 1**：`gen --batch t1`；機械 QA 全過；被淘汰的不進 runtime 路徑。
- [ ] **Step 2**：控制者派全新脈絡的獨立代理（Opus，不准用瀏覽器工具）審核；通過才 `approve`、`publish`。codex 額度用完改用 credits，兩者都用完才暫停回報；絕不用佔位美術。
- [ ] **Step 3**：`WANDER_ART` 填入已發布的鍵；`render/artPaths.ts` 加 `art.wanderTile(kind)`，`allArtUrls` 收已發布的；`render/artPaths.test.ts` 的總數照當下實際值重算；manifest 與 `render/published.test.ts` 綠。
- [ ] **Step 4**：收尾 G，commit：`feat(starlantern): publish wanderer markers`。

### Task D4：介面接線

**Files:** `render/MapView.ts`（有圖時畫圖、沒圖時照舊文字；追的時候用 tint 加紅，不另做圖）、對應的測試。

- [ ] **Step 1：寫失敗的測試**：`wanderers wear their art once it lands`（`NO_ART` 時和 D 之前完全相同；`has` 為真時是 `Sprite`、尺寸對）。
- [ ] **Step 2**：實作；e2e 三個專案、全套、tsc。
- [ ] **Step 3**：收尾 G，commit：`feat(starlantern): wanderers wear their art`。
