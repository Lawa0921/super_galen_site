# 《商隊與劍》M4：經濟＋傭兵團＋成長＋城鎮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補齊經營層：升級與屬性點、市集買賣（城鎮差價＝商隊玩法）、酒館招募與薪餉、馬車載貨、城鎮完整 UI；同時完成 M3 終審移交的 hardening（遠征快照版本防護、迷宮深度戰利品乘數、隱藏迷宮遞減報酬）。

**Architecture:** 新模組 `roster.ts`（成長）與 `economy.ts`（價格/薪餉/載貨）；towns 為資料檔；存檔升 v4。UI 沿現有 screen 模式。

**Tech Stack:** TypeScript、vitest、Playwright、DOM。

## Global Constraints

- 隨機只經注入 `Rng`；繁中；TDD；Conventional Commits＋`Co-Authored-By: Claude <noreply@anthropic.com>`。
- 存檔 v3→v4 遷移不清檔；`parseAndMigrate` 路徑。
- 經濟基準（M3 終審給定）：一趟路線 ≈60-110 金當量、礦坑 ≈120-220；起始 200 金。薪餉定價使「一趟路線 ≈ 覆蓋 2-3 趟小隊薪餉」→ 每傭兵每趟薪餉 = 8 + level×4 金。
- boss 遺寶（60-70 值）是金錢 sink 素材：商店**收購價=value 的 50%**（全物品通用賣價折扣），買價=value×城鎮係數。
- 測試 `npx vitest run <path>`；e2e `npx playwright test tests/e2e/caravan.spec.ts --project=chromium --workers=1`。

## 介面契約（跨任務鎖定）

```ts
// roster.ts（新）
export const XP_TABLE: number[];  // index=level（1-based 存 index 0 廢棄）；[0, 0, 50, 120, 210, 320] → Lv5 封頂（M4）
export function levelFromXp(xp: number): number;                 // 依 XP_TABLE 推等級（封頂 5）
export function pendingLevelUps(record: CompanionRecord): number; // levelFromXp(xp) - level
export function applyLevelUp(record: CompanionRecord, allocate: Partial<StatBlock>): void;
  // level+1、statPoints 共 2 點依 allocate 加到 stats（總和必須=2，否則丟 Error）、maxHp += 3 + statMod(con 新值)
export function unlockedMoves(record: CompanionRecord): Move[];   // JOBS[job].moves 過濾 minLevel<=level（Move 型別加選填 minLevel）
export function generateRecruitPool(rng: Rng, tavernSeed: number, reputation: number): CompanionRecord[];
  // 3-5 人；職業/名字/微調屬性由 rng；level 1（聲望 ≥30 出 1 名 level 2——M4 唯一聲望效果）
export function hireCost(record: CompanionRecord): number;        // 30 + level×20
export function wagePerTrip(record: CompanionRecord): number;     // 8 + level×4

// economy.ts（新）
export interface TownDef { id: string; name: string; desc: string; priceModifiers: Record<string, number> }
  // priceModifiers: itemId → 係數（如 1.4/0.7）；未列=1.0
export function buyPrice(town: TownDef, itemId: string): number;   // round(ITEMS[itemId].value × 係數)
export function sellPrice(town: TownDef, itemId: string): number;  // round(buyPrice × 0.5)（原鎮）；見 tradeSellPrice
export function tradeSellPrice(town: TownDef, itemId: string): number; // round(ITEMS.value × 係數 × 0.9)——異鎮轉賣（差價空間）
export function cargoCapacity(wagonLevel: number): number;         // 6 + wagonLevel×4（單位=件）
export function wagonUpgradeCost(wagonLevel: number): number;      // 120 + wagonLevel×180
export function totalWage(save: SaveData): number;                 // 未重傷傭兵薪餉合計
```

存檔 v4：`SaveDataV4 = v3 + { wagonLevel: number(0); tavernSeed: number(createdAt 起算); reputation: number(0); visitedBossDungeons: string[] }`；`MIGRATIONS[3]` 補預設。`SaveData` 別名指 v4。
遠征擴充（型別擴充非破壞）：`ExpeditionState` 加 `expeditionVersion: number`（常數 `EXPEDITION_VERSION=2`）與 `destinationTownId?: string`（route 目的城鎮）＋`cargo: Record<string, number>`（本趟押運貨物）。

## 內容（Task 2/4）

- TOWNS 3 鎮：啟程之鎮（基準）、河灣鎮（臨水道終點：ore 1.5/silk 1.4/herb 0.6）、林邊聚落（黑森林徑終點：herb 1.5/hide 1.3/ore 0.7）——差價讓「啟程買低→目的地賣高」單程可賺 20-60 金（受載貨量限制）
- LOCATIONS 的兩條 route 加 `destinationTownId`
- 孤兒物品修復：繃帶/乾糧/銀懷錶/香料包 進各鎮商店貨架（`TownDef` 加 `stock: string[]`——該鎮可購清單）
- 聲望：完成遠征 +5、boss 擊殺 +10（settleExpedition 擴充）

## M3 hardening（Task 5 前置於 e2e）

1. **遠征快照版本防護**：`loadGame` 後若 `save.expedition` 存在且 `expeditionVersion !== EXPEDITION_VERSION` → 丟棄遠征（=null）保留主存檔，UI 顯示「遠征記錄已過期」提示。測試：手造 v1 快照（無 expeditionVersion 欄位）→ load 後 expedition 為 null、gold 等完好。
2. **迷宮深度戰利品乘數**：`finishCombat` victory 的 gold loot × (1 + 0.25×(step-1))（dungeon 限定、向下取整）。
3. **隱藏迷宮遞減報酬**：boss 擊殺時將 locationId 記入 `visitedBossDungeons`；再次擊殺同 boss loot 折半且 itemChance 減半。測試覆蓋首殺/再殺。

## Task 1: 成長系統 roster.ts＋存檔 v4

TDD。XP_TABLE/levelFromXp/pendingLevelUps/applyLevelUp（配點驗證、maxHp 公式）/unlockedMoves（jobs.ts 每職業補 Lv2/Lv3 招式各一、Move 加 minLevel、既有招式無 minLevel=Lv1）/hireCost/wagePerTrip/generateRecruitPool（3-5 人組成、名字池 ≥12 個繁中名、聲望門檻）。存檔 v4 遷移＋shape。`memberFromRecord` 改用 `unlockedMoves`。既有測試不得改斷言（jobs 數值不變）。
Commit：`feat(caravan): 成長系統——升級/屬性點/招式解鎖/招募池＋存檔 v4（M4）`

## Task 2: 經濟 economy.ts＋城鎮資料

TDD。buyPrice/sellPrice/tradeSellPrice/cargoCapacity/wagonUpgradeCost/totalWage；`data/towns.ts`（TOWNS 3 鎮＋stock 含孤兒物品）；資料測試：priceModifiers/stock 的 itemId 都存在、差價空間 sanity（河灣 ore 賣價 > 啟程買價）。routes 加 destinationTownId（locations.ts）＋資料測試同步。
Commit：`feat(caravan): 經濟系統——城鎮價格/載貨/薪餉/馬車＋3 城鎮資料（M4）`

## Task 3: 遠征整合——薪餉/押貨/聲望/hardening 引擎面

TDD。`startExpedition` 擴充：扣 totalWage（不足丟 Error——UI 先擋）、cargo 從 save.inventory 移入（參數 `cargo: Record<string,number>`，總件數 ≤ cargoCapacity）、expeditionVersion 戳記；route 抵達（phase='done' 且未 retreated）時 destinationTownId 可用（settle 前 UI 可交易——引擎面：`settleExpedition` 擴充參數 `tradeSales?: Array<{itemId, count}>`（用 tradeSellPrice 折現 cargo/loot.items）；聲望 +5/boss+10；visitedBossDungeons 記錄與遞減報酬；深度 loot 乘數；快照版本防護（save.ts）。retreat/defeat 時 cargo 損失一半（向下取整——押貨風險）。
Commit：`feat(caravan): 遠征經營整合——薪餉/押貨/聲望/深度乘數/快照防護（M4）`

## Task 4: 城鎮 UI 全面化

DOM 合約：城鎮改多分頁（`#town-tabs`：`.town-tab[data-town-tab]`＝market/tavern/roster/wagon）；`#screen-market`（`.market-row[data-item-id]`>`.buy-btn`/`.sell-btn`、`#market-gold`）；`#screen-tavern`（`.recruit-card[data-recruit-id]`>`.hire-btn`、顯示 hireCost/wage）；`#screen-roster`（`.roster-card[data-member-id]`：等級/xp/屬性/招式、`.levelup-btn` 開 `#levelup-panel`（`.alloc-plus[data-stat]`、`#alloc-confirm`）、`.dismiss-btn`）；`#wagon-panel`（`#btn-wagon-upgrade`）；出發流程加押貨選擇 `#cargo-picker`（`.cargo-plus[data-item-id]`、`#cargo-space`）與薪餉預覽 `#wage-preview`、金不足 disabled；抵達目的鎮交易 `#screen-trade`（tradeSellPrice 列表、`#btn-trade-done` 進結算）。招募池在歸返結算後輪替（tavernSeed+1）。
Commit：`feat(caravan): 城鎮 UI——市集/酒館/隊伍/馬車/押貨出發/異鎮交易（M4）`

## Task 5: e2e 與收尾

e2e 追加（seed 掃描法）：(1) 市集買賣（買繃帶→金幣減、賣回→金幣半價回收）；(2) 酒館招募→隊伍多一人→出發薪餉扣款；(3) 升級：模擬 xp（走一趟遠征或 debug 途徑——用真遠征）→ 升級面板配 2 點→屬性變化；(4) 押貨：啟程買 ore→臨水道→河灣鎮賣→差價利潤驗證；(5) 快照防護：手塞舊版遠征快照→load→遠征丟棄主檔完好。全套 vitest＋e2e 全綠；瀏覽器實走。
Commit：`feat(caravan): M4 e2e——市集/招募/升級/押貨貿易/快照防護（M4）`

## M4 完成判準

- vitest 全套綠（caravan ≥200）；e2e ≥17 全綠；實跑完整經營循環（招募→押貨→遠征→異鎮交易→歸返→升級）
- 經濟 sanity：一趟押貨（滿載 ore）淨利 20-60 金；薪餉 2 人隊 ≈ 24-32 金/趟

## M5 預告

內容擴充（事件 40+、第三路線、巢穴強化）、**裝備三欄系統（規格 §3.7，M4 未實作、明確移交 M5）**、動漫平塗美術、BGM、成就與收尾平衡；boss 遺寶異鎮轉賣套利（63 vs 原鎮 35）需裁決。
