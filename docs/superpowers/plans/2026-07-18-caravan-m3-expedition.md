# 《商隊與劍》M3：遠征事件鏈＋迷宮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓玩家能真正出遠征：委託板選目標（貿易路線／迷宮）→ 事件卡鏈（敘事＋擲骰）→ 戰鬥遭遇（接 M2 引擎＋戰利品＋傷亡寫回）→ 迷宮逐層房卡 → 歸返結算。含探索深度機制：隱藏地點發現、事件旗標鏈、迷宮分歧。

**Architecture:** `expedition.ts` 為遠征狀態機（純函式＋注入 Rng），事件卡/迷宮/物品全資料檔；存檔升 v3（背包＋遠征快照＋傷癒趟數）；UI 沿 M2 模式讀狀態渲染。

**Tech Stack:** TypeScript、vitest、Playwright、DOM。

## Global Constraints

- 隨機只經注入 `Rng`；禁 `Math.random()`。繁中敘事。
- 檢定用 `resolveCheck`（nat1/nat20 規則）；戰鬥用 M2 `combat.ts` 全套。
- 存檔遷移不清檔（v2→v3）；毀損回 null；`parseAndMigrate` 路徑不變。
- **M2 終審移交必修（Task 1 完成，否則敵方 support 招上線即 bug）**：`enemyAct` 依 `move.kind/target` 選目標（attack→hp 最低存活隊員；support/heal→hp 損最重的存活敵方同伴）；`attemptRetreat` 殿後攻擊改選敵人的**第一個 attack 招**（無攻擊招則不攻擊，僅記 log）。
- 事件卡 schema 照規格 §3.2（context/weight/conditions/options/check/success/failure Effect 清單）。
- Effect DSL 種類（M3 鎖定）：`{type:'gold',amount}`／`{type:'item',itemId,count}`（負數=失去）／`{type:'hp',target:'protagonist'|'party',amount}`／`{type:'flag',flag,value}`／`{type:'fight',encounterId}`／`{type:'discover',locationId}`（探索：解鎖隱藏地點）／`{type:'log',text}`。
- 測試 `npx vitest run <path>`；e2e `npx playwright test tests/e2e/caravan.spec.ts --project=chromium --workers=1`。
- Conventional Commits＋`Co-Authored-By: Claude <noreply@anthropic.com>`。

## File Structure（M3 鎖定）

```
src/scripts/games/caravan/
├── combat.ts / combat.test.ts       # modify：M2 移交必修＋EnemyUnit.loot
├── expedition.ts / expedition.test.ts  # create：遠征狀態機＋事件結算＋迷宮
├── save.ts / save.test.ts           # modify：v3（inventory/expedition 快照/injuredForTrips 結算）
├── data/items.ts                    # create：物品表（M3 約 12 種）
├── data/events.ts                   # create：事件卡（M3 首批 15 張，含旗標鏈與 discover）
├── data/locations.ts                # create：路線 2 條＋迷宮 1 座（房卡表、深度係數、boss）＋隱藏地點 1 處
├── data/enemies.ts                  # modify：擴充（狼群/盜匪/迷宮敵＋boss，含 loot 與 support 招示範）
src/pages/games/caravan.astro        # modify：委託板/遠征畫面/擲骰結果/歸返結算
tests/e2e/caravan.spec.ts            # modify：遠征全流程案例
```

## 介面契約（跨任務鎖定，簽名照抄）

```ts
// expedition.ts
export type EffectSpec =
  | { type: 'gold'; amount: number }
  | { type: 'item'; itemId: string; count: number }
  | { type: 'hp'; target: 'protagonist' | 'party'; amount: number }
  | { type: 'flag'; flag: string; value: boolean }
  | { type: 'fight'; encounterId: string }
  | { type: 'discover'; locationId: string }
  | { type: 'log'; text: string };

export interface EventOption {
  label: string;
  requirement?: { job?: JobId; itemId?: string };
  check?: { stat: Stat; dc: number };
  success: EffectSpec[];
  failure?: EffectSpec[];
}
export interface EventCard {
  id: string;
  context: { locationIds?: string[]; kind?: 'route' | 'dungeon' };
  weight: number;
  requiresFlags?: Record<string, boolean>;
  title: string; body: string;
  options: EventOption[];
}
export type RoomKind = 'fight' | 'treasure' | 'event' | 'rest' | 'unknown';
export interface LocationDef {
  id: string; name: string; kind: 'route' | 'dungeon';
  hidden?: boolean;                       // 需 discover 才會出現在委託板
  legs?: number;                          // route：事件數
  floors?: number; roomsPerFloor?: [number, number]; bossEncounterId?: string; // dungeon
  encounterTable: Array<{ weight: number; encounterId: string }>;
  depthHpBonus?: number;                  // dungeon：每層敵人 maxHp 加值
}
export interface ExpeditionState {
  locationId: string; kind: 'route' | 'dungeon';
  step: number;                           // route: 第幾段；dungeon: 第幾層
  totalSteps: number;
  phase: 'event' | 'room-choice' | 'combat' | 'aftermath' | 'done';
  currentEventId: string | null;
  roomChoices: RoomKind[] | null;         // dungeon 每層抽出的房卡
  pendingEncounterId: string | null;
  loot: { gold: number; items: Record<string, number> };
  eventLog: string[];                     // 遠征日誌（歸返結算顯示）
  retreated: boolean;
}
export function startExpedition(rng: Rng, save: SaveData, locationId: string): ExpeditionState;
export function drawEvent(rng: Rng, state: ExpeditionState, save: SaveData): EventCard;         // 過濾 context/requiresFlags 後加權抽；設 currentEventId
export function availableOptions(option 過濾): EventOption[] 不需要——UI 端以 requirement 判斷 disabled；
export function optionAvailable(save: SaveData, opt: EventOption): boolean;                     // job 在隊上？item 在包內？
export function resolveOption(rng: Rng, state: ExpeditionState, save: SaveData, card: EventCard, optIndex: number):
  { check: CheckResult | null; effects: EffectSpec[] };   // 擲骰（用主角對應屬性）、套 effects（fight 設 pendingEncounterId+phase='combat'；其餘立即入 loot/save）、推進 phase/step
export function drawRooms(rng: Rng, state: ExpeditionState): RoomKind[];                        // dungeon 每層 2-3 張；boss 層固定 ['fight']
export function chooseRoom(rng: Rng, state: ExpeditionState, save: SaveData, room: RoomKind):
  { event?: EventCard; encounterId?: string; restHealed?: number; treasureGold?: number };      // 依房型分派
export function buildEncounter(rng: Rng, state: ExpeditionState, encounterId: string): EnemyUnit[]; // 查表生成敵人並套深度加成
export function finishCombat(state: ExpeditionState, save: SaveData, combat: CombatState,
  fates: Array<{ id: string; fate: 'injured' | 'dead' }>): void;   // victory→敵 loot 入 state.loot、continue；retreated→retreated=true 掉一半金幣戰利品、跳到 aftermath；defeat→retreated 同等處理＋全隊傷亡已由 fates 呈現；套 fates 到 save（injuredForTrips=2/移除死亡傭兵——主角除外）
export function advanceExpedition(rng: Rng, state: ExpeditionState): void;  // step+1；超過 totalSteps→phase='done'；dungeon 未到頂層→'room-choice'；route→'event'
export function settleExpedition(state: ExpeditionState, save: SaveData): { goldGained: number; itemsGained: Record<string, number>; xpGained: number };
  // loot 入 save.gold/inventory；每存活出征者 xp += 20 + step*5；injuredForTrips>0 的隊員 -1；自動 saveGame 由 UI 呼叫
```

`data/items.ts`：`export interface ItemDef { id: string; name: string; desc: string; value: number }`＋`export const ITEMS: Record<string, ItemDef>`。
`data/locations.ts`：`export const LOCATIONS: Record<string, LocationDef>`＋`export function visibleLocations(save: SaveData): LocationDef[]`（hidden 未 discover 的不回傳；discover 旗標格式 `discovered:<locationId>` 存 save.flags）。
`data/enemies.ts` 追加：`export const ENCOUNTERS: Record<string, () => EnemyUnit[]>`（M2 的 TRAINING_ENCOUNTER 保留）；`EnemyUnit` 增 `loot?: { gold: [number, number]; itemId?: string; itemChance?: number }`（combat.ts 型別上加、finishCombat 消費：gold 區間內 rng 均勻取整）。
存檔 v3：`SaveDataV3 = v2 + { inventory: Record<string, number>; expedition: ExpeditionState | null }`；`MIGRATIONS[2]` 補 `inventory:{}` 與 `expedition:null`；`newGame` 產 v3；shape 驗證加這兩欄。

## 內容要求（Task 4 資料檔，繁中原創、風格：簡潔有畫面感）

- 事件 15 張：路線通用 8（含 2 張旗標鏈：`ev_merchant_map` 成功設 `clue:goblin-cave` → `ev_cave_entrance` requiresFlags 該旗標、成功 `discover` 隱藏迷宮）、森林路線限定 3、迷宮限定 4（含 rest/unknown 房抽到的）
- 地點：路線「臨水道」（legs 4，狼/盜匪表）、「黑森林徑」（legs 5，狼/哥布林表）；迷宮「廢棄礦坑」（floors 4、每層 2-3 房、boss `enc_mine_overseer`、depthHpBonus 2）；隱藏迷宮「哥布林巢穴」（hidden，floors 3，由旗標鏈 discover）
- 敵人：狼、盜匪×2 種（一含治療師——**驗證 enemyAct support 修繕**）、礦坑蜘蛛、監工 boss、巢穴頭目；全部帶 loot
- 物品 12 種：藥草（事件可用 requirement）、繃帶、火把、哥布林耳環（賣錢）、礦石、蛛絲、boss 遺寶×2、雜項

## Task 1: M2 移交必修＋戰利品欄位（combat.ts）

**Files:** Modify combat.ts / combat.test.ts
**要點（TDD，先寫失敗測試）：**
- `EnemyUnit` 加 `loot?: { gold: [number, number]; itemId?: string; itemChance?: number }`（純型別，無行為測試）
- `enemyAct`：意圖招式 `kind==='support'&&heal` → 目標＝敵方存活同伴中 `maxHp-hp` 最大者（含自己）；attack → 現行 hp 最低存活隊員。測試：敵治療師預告 heal → 治到受傷同伴而非玩家。
- `attemptRetreat`：殿後攻擊改用 `aliveEnemy.moves.find(m => m.kind === 'attack')`；全無攻擊招→不攻擊只記 log。測試：敵只有 heal 招時撤退不受傷。
- Commit：`fix(caravan): enemyAct 依招式類型選目標＋撤退攻擊選攻擊招（M2 終審移交）`

## Task 2: expedition.ts 核心——事件抽選/選項結算/Effect DSL

**Files:** Create expedition.ts / expedition.test.ts；Modify save.ts / save.test.ts（v3）
**要點（TDD）：**
- 先做存檔 v3（遷移＋newGame＋shape；測試：v2 檔遷移補 inventory/expedition、v1 直通 v3）
- `startExpedition`/`drawEvent`（context/requiresFlags 過濾＋加權；測試用 2-3 張假卡驗過濾與 weight=0 排除）
- `optionAvailable`（job 在隊上（主角+未重傷傭兵）/item 持有）
- `resolveOption`：無 check 直接 success；有 check 用主角屬性 resolveCheck；套 EffectSpec 每一種（gold 疊 loot、item 進 loot.items 負數扣 save.inventory、hp 傷主角或全隊（不低於 1——遠征事件不打死人，戰鬥才會）、flag 寫 save.flags、fight 設 pending+phase、discover 寫 `discovered:<id>` 旗標＋eventLog、log 進 eventLog）；結算後非 fight→advanceExpedition
- `advanceExpedition`/`settleExpedition`（xp 公式、傷癒趟數 -1、loot 入包、expedition 清 null）
- 測試全種子化；至少 20 案例
- Commit：`feat(caravan): 遠征狀態機——事件抽選/選項結算/Effect DSL/存檔 v3（M3）`

## Task 3: 迷宮與戰鬥整合

**Files:** Modify expedition.ts / expedition.test.ts / combat.ts（若需）
**要點（TDD）：**
- `drawRooms`（每層 rng 取 2-3 張、種類加權 fight40/treasure20/event20/rest10/unknown10；頂層 `['fight']` boss；unknown 進場時 rng 二選一實際化為 fight 或 treasure——探索的驚喜感）
- `chooseRoom`：fight→encounterId（樓層表）、treasure→gold 骰＋機率物品、rest→全隊回 1d6+2（不超過 max）、event→抽 dungeon context 事件
- `buildEncounter`：查 ENCOUNTERS＋depthHpBonus×(step-1) 套到 maxHp/hp
- `finishCombat`：victory loot（每敵 gold 區間骰＋itemChance）、retreated/defeat 掉一半 loot 金幣（向下取整）、fates 套 save（傭兵 dead 從 companions 移除、injured 設 injuredForTrips=2；主角 injured 設 2——但主角不移除）
- 測試：boss 層、深度加成數學、撤退折損、傭兵死亡移除
- Commit：`feat(caravan): 迷宮房卡/深度加成/戰鬥結算整合（M3）`

## Task 4: 內容資料檔

**Files:** Create data/items.ts、data/events.ts、data/locations.ts；Modify data/enemies.ts
**要點：** 照「內容要求」節；schema 正確性用 vitest 驗（新 data.test.ts：所有 encounterId/itemId/locationId 引用存在、事件 options 至少 1、weight>0、旗標鏈兩端對得上——**資料完整性測試**，防手滑）；敘事品質自審（每張卡讀起來像規格 §1 的示例語感）。
- Commit：`feat(caravan): M3 首批內容——15 事件/2 路線/2 迷宮/12 物品/敵人擴充（M3）`

## Task 5: UI 與 e2e 全流程

**Files:** Modify src/pages/games/caravan.astro、tests/e2e/caravan.spec.ts
**DOM 合約：** 城鎮加 `#btn-quest-board`；`#screen-quest`（`.quest-item[data-location-id]` 每地點一項＋`.quest-hidden-hint` 若有未發現地點顯示「？」）；`#screen-expedition`（`#exp-progress`「第 x/y 段」、`#event-card`>`#event-title`/`#event-body`、`#event-options .event-opt[data-opt-index]`（不可用加 `disabled`）、`#check-result`（骰面/總值/成敗，動畫 0.6s 內完成即可）、`#room-choices .room-btn[data-room]`、`#btn-exp-continue`）；戰鬥沿 M2 `#screen-combat`（多敵時 `#combat-targets .target-btn[data-target-id]` 啟用——M2 預留）；`#screen-settlement`（`#settle-gold`/`#settle-items`/`#settle-xp`/`#settle-log`、`#btn-settle-back`）。
**流程：** 委託板列 `visibleLocations`；遠征各 phase 對應畫面；戰鬥結束呼 `finishCombat`＋`resolveCasualties`；`settleExpedition` 後 saveGame＋回城鎮（酒館補位 M4，本里程碑傭兵死了就是少人）；**每次事件結算後 saveGame（規格：每事件自動存）**；重整頁面若 save.expedition 非 null →「繼續遠征」回到當前 phase（combat 中途重整=回到該步 phase 前狀態，可接受）。
**e2e（追加 describe，seed 選定原則：Task 5 實作者先用腳本掃出「臨水道第一事件為特定卡且首選項成功」的 seed，斷言確定性）：** (1) 委託板顯示 2 條路線＋隱藏提示；(2) 出遠征走完 4 段（含至少一次擲骰結果顯示）到結算畫面、金幣寫回城鎮顯示；(3) 遠征中重整→繼續遠征回到同段；(4) 迷宮：進礦坑選房卡（treasure 房拿金幣）、撤退回結算。
- Commit：`feat(caravan): 遠征/迷宮/結算 UI 與全流程 e2e（M3）`

## M3 完成判準

- `npx vitest run` 全套綠（caravan ≥90）；e2e caravan spec 全綠（≥12 案例）
- 實跑：完整走一遍 路線遠征→事件→戰鬥→歸返結算；礦坑 2 層＋撤退
- 隱藏迷宮鏈可觸發（旗標→discover→委託板出現）
- diff 只含 M3

## M4 預告

經濟（市集買賣/城鎮差價）、酒館招募/薪餉、委託型別擴充、升級加點 UI。M3 的 xp 已累積、items 已有 value 欄位供買賣。
