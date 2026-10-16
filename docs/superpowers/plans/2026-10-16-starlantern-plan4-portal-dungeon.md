# 星燈迷宮 計畫 4：傳送門 roguelike 迷宮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每次從傳送門廣場選一座傳送門出發，都進入一份新產生、無限往下的迷宮。迷宮依地區有屬性怪物、事件房、本次狀況、小地圖，全滅時失去這趟的戰利品。

**Architecture:**
- 產生器是純函式：輸入（種子、地區、深度、狀況），輸出沿用現有的 `FloorMap`，再加上一份房間內容清單。
- 「一趟潛入」由 `Run` 物件保存。`Game` 不再從固定的 `MAPS` 讀地圖，而是向 `Run` 要當前樓層，樓層在第一次進入時產生並快取。
- 介面沿用 ui2 的場景與 Pixi 的 `MapView`；新美術一律走 art-factory 流程。

**Tech Stack:** TypeScript、Vitest（`npx vitest run`）、Pixi.js 8、Astro 頁面、Playwright e2e、art-factory（Python + codex）。

**Spec:** `docs/superpowers/specs/2026-10-16-starlantern-roguelike-dungeon-design.md`

## Global Constraints
- 測試只能用 `npx vitest run <路徑>`；e2e 用 `E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`；dev server 用 4354 埠，不可用 4321。
- SCSS 禁用 `!important`；禁止行內樣式，包含 JS 的 `element.style`。
- 瀏覽器一律 headless，並加 `--mute-audio`。
- 產生一層地圖必須在 50ms 內完成；同一個種子必須產生相同結果。
- 對 1000 個種子，100% 通過可達性驗證；驗證失敗就換下一個種子重試，最多 20 次，之後退回固定地圖。
- 房間內容：每層至少 1 個寶箱房；精英怪最多 1 隻；寶庫最多 1 間。
- 全滅時，經驗與等級保留；這趟還沒帶回城的戰利品全部失去；金幣扣 25%；不再讀回旅館存檔。
- 深度等級 = 2 + 4 ×（層數 − 1）。每 5 層是頭目層；本道第 3 層是劇情頭目，打倒時觸發通關。
- 存檔版本加 1，變成 3；舊檔直接重置。
- 正式美術一律走流程：生成 → QA → 使用者核准 → 發布。核准之前只能用文字標記（例如「泉」），不可以用假圖示。
- 使用者要求：美術要優化到玩家感受得到用心的程度。每批美術都要有審核頁，放在實際遊戲畫面的情境中呈現。
- commit 結尾加上：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus
1. 走到樓梯、寶箱、事件格的同一步剛好遇敵：只能觸發一件事，不能同時觸發兩件。Task 5 要有測試。
2. 在事件房中的對話或選單開著時，玩家又按方向鍵或右鍵：輸入要被鎖住，不能一邊對話一邊移動。Task 8 要有測試。
3. 全滅後馬上再次出發：這趟的冒險背包已清空，倉庫沒有被扣到，也沒有重複扣金幣。Task 6 要有測試。
4. 深度很深時（第 50 層），敵人能力值與經驗值不能溢位或變成 NaN，也不能超出合理範圍。Task 4 要有測試。
5. 讀檔時，存檔裡不能留有進行中潛入的殘骸：讀檔後一定在城鎮，而且傳送門組合仍然有效。Task 7 要有測試。

---

## File Structure
- `engine/dungeon/gen.ts`：地圖產生器，包含房間、走廊、驗證與重試。
- `engine/dungeon/rooms.ts`：房間內容的指定，包含比例、數量限制與狀況加成。
- `engine/dungeon/run.ts`：`Run` 型別、樓層快取、這趟的已開啟／已探索紀錄、冒險背包。
- `data/regions.ts`：6 個地區加上本道，各自的地形、地區詞綴、地區技能、限定掉落的佔位。
- `data/conditions.ts`：6 種本次狀況。
- `engine/scaling.ts`：深度等級、敵人強化、地區變種。
- `engine/events.ts`：泉水、陷阱、商人、祭壇、寶庫與鑰匙、精英怪的規則。
- `engine/game.ts`、`engine/state.ts`、`engine/save.ts`：改寫出發、移動、全滅與存檔。
- `ui2/scenes/gate.ts`：改成傳送門廣場。
- `ui2/scenes/dungeon.ts`、`ui2/minimap.ts`、`render/MapView.ts`：事件標記、小地圖、本次狀況顯示。
- `ui2/scenes/event.ts`：事件房的對話與選擇，作為迷宮場景裡的一層視窗。
- `render/BattleView.ts`：地區變種的色調、精英的★。
- art-factory：傳送門與地區的美術、事件圖示、廣場場景。

### Task 1: 地圖產生器

**Files:** Create `engine/dungeon/gen.ts`, `engine/dungeon/gen.test.ts`

**Interfaces:**
- Produces:
  - `export interface Room { x: number; y: number; w: number; h: number; id: number }`
  - `export interface GenFloor { map: FloorMap; rooms: Room[]; entranceRoom: number; exitRoom: number }`
  - `export function genFloor(seed: number, opts: { depth: number; boss: boolean }): GenFloor`
  - `map.down` 是往下的樓梯；頭目層 `map.boss` 有值、`map.down` 是 null。`map.up` 一律是 null，這次的潛入不往回走。

- [ ] **Step 1：寫失敗的測試**
  - `size grows with depth`：depth 1 的寬高落在 21×15 到 23×17；depth 20 時寬 ≥ 25。
  - `same seed, same floor`：同樣參數連呼叫兩次，`map.tiles` 完全相同。
  - `1000 seeds all reachable`：對 seed 1–1000、depth 1–6 循環。用 `reachable(map, map.entrance)`（engine/map.ts 已有），檢查樓梯或頭目、每個寶箱都在可達集合內；每次耗時 < 50ms，用 `performance.now()` 量。
  - `rooms are 6 to 10 and do not overlap`。
  - `entrance and exit are far apart`：在房間圖上的 BFS 距離 ≥ 房間圖直徑的 70%。
  - `boss floor has a door before the boss room`：`boss: true` 時 `map.boss` 有值，而且進入頭目房的唯一通道上有一格 `door`。
- [ ] **Step 2：執行測試，確認因為模組不存在而失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/engine/dungeon/gen.test.ts`
- [ ] **Step 3：實作 `genFloor`**
  - 演算法照設計 §3.2：
    1. 用 `mulberry32(seed)` 產生亂數；
    2. 放 6–10 個不重疊的房間，房間之間至少留 1 格牆；
    3. 用房間中心做最小生成樹（Prim），再隨機多加 1–2 條邊；
    4. 用 L 形、寬 1 格的走廊連接；
    5. 取房間圖上最遠的兩間房，分別當入口房和出口房。
  - 驗證失敗就用 `seed + 7919 × k` 重試，最多 20 次。都失敗時退回 `parseFloor(FLOORS[(depth - 1) % 3].rows)`，並把 `rooms` 設成空陣列。
- [ ] **Step 4：執行測試，確認通過**
- [ ] **Step 5：commit**：`feat(starlantern): seeded room-and-corridor floor generator`

### Task 2: 地區與本次狀況資料、房間內容

**Files:** Create `data/regions.ts`, `data/conditions.ts`, `engine/dungeon/rooms.ts`, `engine/dungeon/rooms.test.ts`

**Interfaces:**
- Produces:
  - `export type RegionId = 'mainline' | 'blaze' | 'frost' | 'storm' | 'mire' | 'shade' | 'iron'`
  - `export interface RegionDef { id: RegionId; name: string; terrain: 1 | 2 | 3 | 'cycle'; element: Element | null; trait: 'burn' | 'chill' | 'swift' | 'poison' | 'evasive' | 'armored' | null; weak: Element[]; resist: Element[]; skill: EnemySkill | null; material: string | null }`
  - `export const REGIONS: Record<RegionId, RegionDef>`
  - 各地區的數值照設計 §3.0 的表。地區素材的 id：`blaze-core`、`frost-heart`、`storm-stone`、`mire-gland`、`shade-crystal`、`iron-shard`。
  - `export type ConditionId = 'fog' | 'bounty' | 'fierce' | 'calm' | 'starfall' | 'plain'`
  - `export interface ConditionDef { id: ConditionId; name: string; desc: string; encounterMul: number; enemyAtkMul: number; expMul: number; goldMul: number; dropMul: number; extraChests: number; extraTraps: number; eliteEveryFloor: boolean; sight: 0 | 1 }`
  - `export const CONDITIONS: Record<ConditionId, ConditionDef>`
  - 數值照設計 §3.4。濃霧的 `sight` 是 0、遇敵倍率 0.8；靜謐的遇敵倍率 0.6、`extraTraps` 是 1；其他照表。
  - `export type RoomKind = 'empty' | 'chest' | 'fountain' | 'trap' | 'merchant' | 'altar' | 'elite' | 'vault'`
  - `export interface Content { kind: RoomKind; at: Pos; room: number }`，另外還有鑰匙：`{ kind: 'key', at: Pos, room: number }`
  - `export function fillRooms(g: GenFloor, rng: Rng, cond: ConditionDef): { map: FloorMap; contents: Content[] }`
    - 回傳的 `map.tiles` 要放進新的 Tile。
  - `engine/map.ts` 的 `Tile` 要擴充：`'fountain' | 'trap' | 'merchant' | 'altar' | 'elite' | 'vault' | 'key'`。陷阱格在顯示上要能隱藏，見 Task 9。

- [ ] **Step 1：寫失敗的測試**
  - `at least one chest room, at most one elite and one vault`：跑 300 個種子。
  - `a vault always comes with a key on the same floor`。
  - `bounty adds a chest, calm adds a trap, starfall always has an elite`。
  - `contents never sit on the entrance, the stairs or a corridor`：只能放在房間內部。
  - `every non-junk region material exists in data/materials.ts`：先把 6 種地區素材加進 `data/materials.ts`，`price` 都設成 0。它們的用途由計畫 5 的鍛造設計給，所以這一步只先建立 id。
- [ ] **Step 2：執行測試，確認失敗**
- [ ] **Step 3：實作資料與 `fillRooms`**
  - 比例的初始值（實作者可調整，但要符合數量限制）：empty 35%、chest 20%、fountain 8%、trap 10%、merchant 7%、altar 8%、elite 7%、vault 5%。
- [ ] **Step 4：執行測試，確認通過**
- [ ] **Step 5：commit**：`feat(starlantern): regions, run conditions and room contents`

### Task 3: Run 物件與 Game 的出發、移動、換層

**Files:** Create `engine/dungeon/run.ts`, `engine/dungeon/run.test.ts`; Modify `engine/game.ts`, `engine/game.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `genFloor`、Task 2 的 `fillRooms`、`REGIONS`、`CONDITIONS`。
- Produces：
  - `export interface Portal { region: RegionId; condition: ConditionId }`：定義在 `engine/dungeon/run.ts`，Task 7 與 Task 8 都使用這個型別。
  - `export interface Run { seed: number; region: RegionId; condition: ConditionId; startDepth: number; floors: Map<number, { map: FloorMap; contents: Content[] }>; opened: Set<string>; explored: Record<number, string[]>; loot: { items: Record<string, number>; gold: number }; usedFountain: boolean; altarBuffs: { stat: BuffStat; pct: number }[]; keys: Set<number> }`
  - `export function newRun(seed: number, region: RegionId, condition: ConditionId, startDepth: number): Run`
  - `export function floorOf(run: Run, depth: number): { map: FloorMap; contents: Content[] }`：第一次呼叫時產生，之後回傳快取。頭目層的判斷：`depth % 5 === 0`，或本道的 `depth === 3`。
  - `Game.depart(portal: Portal, startDepth: number)` 取代原本的 `depart(floor)`，回傳型別不變。
  - `Game.run: Run | null`；`Game.floor` 改成「目前深度」；`Game.map()` 改成回傳 `floorOf(run, floor).map`。

- [ ] **Step 1：寫失敗的測試**
  - `departing twice gives different floors`：兩次出發用不同種子（由 `game.rng` 產生），第 1 層的 `tiles` 不同。
  - `stairs go one deeper and never back`。
  - `the mainline boss is on depth 3 and its defeat clears the game`：沿用現有的通關流程。
  - `a random region keeps going past depth 3`：第 4、5 層存在，第 5 層是頭目層。
  - `start depth cannot exceed the region's deepest reached, and must be 1 or a multiple of 5`。
  - 現有的 `game.test.ts` 裡依賴固定地圖座標的測試（例如走到第 1 層的某格開寶箱）要改寫成依 `contents` 找目標座標。不可刪測試、降低斷言，只能換目標座標的取得方式。
- [ ] **Step 2：執行測試，確認失敗**
- [ ] **Step 3：實作**
  - 寶箱：`openChest` 改用 `run.opened`，內容先沿用 `FLOORS[(terrain - 1)].chestLoot` 抽一項，數量乘上狀況的 `dropMul` 並四捨五入。
  - 已探索紀錄改用 `run.explored`。
  - `dungeon.reachedFloor` 改成 `dungeon.reached: Record<RegionId, number>`。
- [ ] **Step 4：執行測試，確認通過**
  - 同時執行 `npx vitest run src/scripts/games/starlantern`，全部通過。依賴固定地圖的 ui2 測試，用同樣方式改寫目標座標。
- [ ] **Step 5：commit**：`feat(starlantern): runs — a fresh dungeon each departure, going ever deeper`

### Task 4: 深度強化與地區變種

**Files:** Create `engine/scaling.ts`, `engine/scaling.test.ts`; Modify `engine/battle.ts`（`createBattle` 接受強化參數）、`engine/game.ts`（`startBattle`）

**Interfaces:**
- Produces：
  - `export function depthLevel(depth: number): number`：回傳 `2 + 4 * (depth - 1)`。
  - `export function scaleEnemy(def: EnemyDef, depth: number, region: RegionDef, elite: boolean): EnemyDef`
    - 能力值依深度：第 1 輪不變；從第 4 層開始，每多一層，HP、攻擊、魔力乘以 1.12，防禦、魔防乘以 1.08；以設計 §3.7 的平衡要求為準，實作者可微調。
    - 經驗值與金幣跟著提高，乘以 1.15 的（層數 − 1）次方。
    - 地區：`weak`、`resist` 換成地區的設定；技能清單加上地區技能；名稱加上地區前綴，例如「熾焰・荊棘狼」；深度 ≥ 4 時再加「深層」。
    - 精英：HP ×2.2、攻擊 ×1.3，名稱加 ★，經驗值與金幣 ×3。
  - `createBattle` 新增一個選填欄位 `scale?: { depth: number; region: RegionId; elite?: string }`。
  - `Combatant` 新增 `tint?: Element | 'elite'`，給畫面著色用。

- [ ] **Step 1：寫失敗的測試**
  - `depth 1 mainline enemies are unchanged`：和現在的數值完全相同，保護現有平衡。
  - `deeper is stronger, monotonic, and stays finite at depth 50`：HP 是有限數字，而且 < 1e7。
  - `a blaze wolf resists fire, is weak to ice, and knows 烈焰吐息`。
  - `an elite is marked and gives triple exp`。
  - balance：在 `engine/balance.test.ts` 加一項 `7. same depth level, same odds`：用 `partyAt(depthLevel(d))` 對 d = 4、6、8、10 的一般戰鬥，勝率 ≥ 0.6。這需要讓 `engine/sim.ts` 的 `simBattle` 接受 `scale` 參數。
- [ ] **Step 2：執行測試，確認失敗**
- [ ] **Step 3：實作；`startBattle` 傳入 `scale`；遇敵表依設計 §3.7 抽組合**
- [ ] **Step 4：執行測試，確認通過；平衡測試必須全部通過，不可放寬門檻**
- [ ] **Step 5：commit**：`feat(starlantern): depth scaling, regional variants and elites`

### Task 5: 事件房規則

**Files:** Create `engine/events.ts`, `engine/events.test.ts`; Modify `engine/game.ts`（`move` 的分支）

**Interfaces:**
- Produces：
  - `MoveResult` 新增：`{ kind: 'event'; content: Content }`、`{ kind: 'trap'; effect: 'hurt' | 'poison'; amount: number }`、`{ kind: 'key' }`。
  - `export const ALTARS: { id: string; text: string; cost: { hpPct?: number; gold?: number }; gain: { stat: BuffStat; pct: number } }[]`：3 到 5 種，數值要通過平衡模擬。
  - `Game.useFountain(): boolean`：回復全隊 HP 和 TP 的 30%，每趟只能用一次。
  - `Game.buy(merchantAt: Pos, item: string): TownResult`：商人在每層產生時，從 `ITEMS` 中 `price > 0` 的物品抽 3 樣，存在 `Content` 上（Task 2 的 `Content` 新增 `stock?: string[]`）。
  - `Game.altar(at: Pos, accept: boolean): boolean`。
  - `Game.openVault(at: Pos): MoveResult | null`：需要 `run.keys` 含有本層。內容是 3 倍寶箱量，加上 1 個稀有素材的佔位（計畫 5 才有稀有素材，這裡先給 `old-coin` ×5，並在程式中標註 TODO 指向計畫 5）。
  - 精英：走到 `elite` 格時開戰，傳入 `elite` 參數；打倒後把該格改成 `floor`。

- [ ] **Step 1：寫失敗的測試**
  - `the fountain heals 30% once per run`。
  - `a trap hurts or poisons and is spent afterwards`。
  - `the merchant sells three items and charges the price`。
  - `an altar applies its cost and its run-long buff, or nothing when declined`：buff 在後續戰鬥中生效，用 `createBattle` 套上去。
  - `the vault opens only with this floor's key`。
  - Review Focus 1：`one step triggers one thing`：在 `encounter = 99` 的狀態下走上事件格，只回傳 `event`，不回傳 `battle`，而且遇敵量表不歸零也不增加。
- [ ] **Step 2：執行測試，確認失敗**
- [ ] **Step 3：實作**
- [ ] **Step 4：執行測試，確認通過**
- [ ] **Step 5：commit**：`feat(starlantern): fountains, traps, merchants, altars, vaults and elites`

### Task 6: 冒險背包與全滅懲罰

**Files:** Modify `engine/game.ts`, `engine/game.test.ts`

**Interfaces:**
- 戰鬥勝利得到的掉落和金幣、寶箱、寶庫的內容，都先放進 `run.loot`。平安回城時（走回入口或用歸還之燈）再併入 `state.inventory` 和 `state.gold`。
- 消耗品例外：寶箱開出的回復藥等消耗品直接放進 `state.inventory`，因為要在冒險中使用。
- `wipe()`：保留經驗與等級；清空 `run.loot`；`state.gold` 改成 `Math.floor(state.gold * 0.75)`；`phase` 設為 town；`notice` 設為 `'wipe'`；不讀存檔。
- `BattleEnd` 和 `MoveResult` 不變；`Notice` 新增 `'banked'`，回城時提示帶回了什麼。

- [ ] **Step 1：寫失敗的測試**
  - `loot waits in the run pack and is banked on return`。
  - `a wipe keeps levels, drops the run pack and a quarter of the gold, and does not reload the save`：存檔中故意放不同的數值，證明沒有讀回。
  - Review Focus 3：`departing again after a wipe starts with an empty pack and charges no second penalty`。
- [ ] **Step 2–4：先確認測試失敗，再實作，最後確認通過**
- [ ] **Step 5：commit**：`feat(starlantern): run pack — loot counts once you bring it home`

### Task 7: 存檔 v3 與傳送門組合

**Files:** Modify `engine/state.ts`, `engine/save.ts`, `engine/save.test.ts`；Create `engine/portals.ts`, `engine/portals.test.ts`

**Interfaces:**
- Produces：
  - `export function rollPortals(rng: Rng): Portal[]`：`Portal` 用 Task 3 的定義。：第 1 座固定是 mainline，另外 2 座是不重複的隨機地區，每座的狀況隨機。
  - `GameState.dungeon` 改成 `{ reached: Record<RegionId, number>; bossDefeated: boolean; portals: Portal[] }`。
  - `SAVE_VERSION = 3`。
  - 回城時，在 `toTown` 裡重抽 `portals`。
- [ ] **Step 1：寫失敗的測試**
  - `the mainline portal is always first and the other two differ`。
  - `portals are rerolled on return and kept across a save and reload`。
  - `save validation rejects a bad region or depth`。
  - Review Focus 5：`a loaded game is in town with valid portals`。
- [ ] **Step 2–4：先確認測試失敗，再實作，最後確認通過**
- [ ] **Step 5：commit**：`feat(starlantern): save v3 with portals and per-region depth`

### Task 8: 傳送門廣場與事件介面

**Files:** Modify `ui2/scenes/gate.ts`, `ui2/scenes/gate.test.ts`, `data/text.zh-TW.ts`, `src/styles/_starlantern-ui.scss`；Create `ui2/scenes/event.ts`, `ui2/scenes/event.test.ts`

**Interfaces:**
- 傳送門廣場：
  - 3 張橫排的傳送門卡片。每張卡片有：地區名、屬性圖示（美術核准前用文字）、怪物特性、會出現的怪物名稱、本次狀況、限定裝備（計畫 5 前顯示「？？？」）。
  - 選卡片後，選擇起始深度，只能選 1 或 5 的倍數，而且不超過這個地區已抵達的最深層。
  - 最後確認出發，畫面顯示本次狀況的橫幅。
  - 鍵盤：左右鍵選卡片；滑鼠可以直接點。
- `EventLayer`：在迷宮場景中作為一層視窗出現。依 `Content.kind` 呈現：
  - 泉水：要不要飲用；
  - 商人：購買清單；
  - 祭壇：顯示代價和收益，選接受或拒絕；
  - 寶庫：開啟，或顯示「需要鑰匙」；
  - 精英：問「要挑戰嗎？」。
- `DungeonScene` 收到 `event` 結果時開啟這一層；收到 `trap` 時顯示對話並讓畫面閃紅；收到 `key` 時顯示對話。

- [ ] **Step 1：寫失敗的測試**
  - `the plaza shows three portals with the mainline first`。
  - `start depth offers only 1 and reached multiples of 5`。
  - `each event opens its layer and applies through Game`。
  - Review Focus 2：`moves and right-click are ignored while an event layer is open`。
- [ ] **Step 2–4：先確認測試失敗，再實作，最後確認通過**
- [ ] **Step 5：commit**：`feat(starlantern): portal plaza and event rooms`

### Task 9: 地圖上的事件標記、小地圖、本次狀況、戰鬥中的變種色調

**Files:** Modify `render/MapView.ts`, `render/MapView.test.ts`, `render/BattleView.ts`, `ui2/scenes/dungeon.ts`；Create `ui2/minimap.ts`, `ui2/minimap.test.ts`

**Interfaces:**
- `MapView.draw` 依 `contents` 畫標記：
  - 有圖示美術時畫閃爍的圖示；
  - 沒有時畫文字標記：「箱」「泉」「商」「壇」「★」「庫」「鑰」；
  - 陷阱觸發前不畫。
- 新的 Tile 種類在地磚上一律先畫地板，再疊上標記。
- `Minimap`：DOM `<canvas>`，放在右上角、選單按鈕下方，大小 120×88。
  - 畫出已探索的格子、自己的位置、已發現的樓梯與事件。
  - 依 Global Constraints，繪圖只用 canvas 2D API，不寫行內樣式。
- `slx-condition` 角標顯示本次狀況名稱，滑鼠移上去時顯示說明。
- 戰鬥中，`Combatant.tint` 讓敵人套上屬性色調，精英加上金色描邊和★。色調用 ColorMatrixFilter 和外光暈，是程式效果。

- [ ] **Step 1：寫失敗的測試**
  - `markers are drawn for seen contents and never for an untriggered trap`。
  - `the minimap shows explored cells and the player`：讀 canvas 的像素，或測試繪圖呼叫的計數，實作者擇一。
  - `regional enemies are tinted and elites starred`。
- [ ] **Step 2–4：先確認測試失敗，再實作，最後確認通過**
- [ ] **Step 5：commit**：`feat(starlantern): event markers, minimap, run condition badge, regional tints`

### Task 10: 美術（與 Task 1–9 並行，由 art-factory 背景生成）

**Files:** art-factory/starlantern（batch.py、contract.md、registry.json、審核頁）；核准後才動 public/ 與 `render/artPaths.ts`。

要產出的素材（全部走流程，每批都要有審核頁）：
1. 傳送門廣場場景，640×360：取代目前的迷宮入口場景，裡面有 3 座傳送門的空位。
2. 傳送門卡片插圖，7 張（本道加 6 個地區）：每張是該地區的風景小圖，約 180×110。
3. 屬性與特性圖示，6 個：火、冰、雷、毒、影、鋼。
4. 事件地磚圖示，8 個：泉水、商人、祭壇、精英標記、寶庫（關閉與開啟）、鑰匙、觸發後的陷阱。這些疊在地板上，透明背景，大小配合 48px 的地圖格。
5. 地區色調預覽：把現有敵人套上色調後的實際畫面，給使用者確認程式色調是否足夠，或要另外生成變種美術。

- 審核頁必須呈現實際使用情境：傳送門卡片排成廣場上的樣子；事件圖示放在迷宮截圖的格子上。
- 核准後的發布：在 `render/artPaths.ts` 加上路徑與 `allArtUrls`，並更新 `artPaths.test.ts` 的數量。
- commit（每批分開）：`art(starlantern): <batch>`

### Task 11: 端對端、平衡、截圖與審查

**Files:** Modify `tests/e2e/starlantern.spec.ts`

- [ ] **Step 1：e2e**：`each departure is a new dungeon`——出發、記下第 1 層入口附近的地形、回城、再出發，兩次的地形不同；全程不得有 console error。
- [ ] **Step 2：e2e**：`a portal run reaches depth 2 and banks the loot`——用 debug 調整遇敵，走到樓梯、下樓、用歸還之燈回城，確認回城提示裡有帶回的戰利品。
- [ ] **Step 3**：執行 `npx vitest run --testTimeout=20000` 全套，以及 e2e 全套；截圖每種事件、每種狀況的橫幅、小地圖、傳送門廣場。
- [ ] **Step 4**：派一個沒參與開發的 opus 代理審查本計畫的 diff，並處理它找到的問題。
- [ ] **Step 5：commit**：`test(starlantern): portal dungeon end-to-end`
