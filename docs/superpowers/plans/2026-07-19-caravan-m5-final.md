# 《商隊與劍》M5：裝備＋內容擴充＋美術＋收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成遊戲：裝備三欄系統（規格 §3.7 移交項）、探索內容大擴充（事件 15→40+、第三路線與高階迷宮、聲望解鎖）、動漫平塗美術接線、BGM、平衡收尾。

**Architecture:** 裝備為 ITEMS 的擴充欄位（`equip`），效果在 `memberFromRecord` 套用；內容純資料檔擴充；美術為靜態資產＋data 的 `art` 欄位接線。存檔 v5。

## Global Constraints

- 隨機只經 `Rng`；繁中；TDD；Conventional Commits＋`Co-Authored-By: Claude <noreply@anthropic.com>`。
- 存檔 v4→v5 遷移不清檔。既有 240 引擎測試與 18 e2e 不得弱化斷言。
- **套利裁決（終審移交，已定）**：`equip` 類物品的 `tradeSellPrice` 不吃異鎮 0.9 係數——一律 `round(value×0.5)`（與原鎮 sellPrice 同）＝裝備要嘛用、要嘛半價賣，無套利。
- **applyLevelUp 防禦（終審移交）**：配點每項必須為非負整數（負數丟 Error）。
- 美術：nanobanana-image-gen skill、動漫平塗（cel-shading/乾淨線稿/明快配色）、先產風格錨定圖再 `--ref` 鏈維持一致；輸出 webp（`--webp --resize`）至 `public/assets/img/games/caravan/`。
- 測試 `npx vitest run <path>`；e2e `npx playwright test tests/e2e/caravan.spec.ts --project=chromium --workers=1`。

## 介面契約（M5 鎖定）

```ts
// items.ts 擴充
export interface ItemDef {
  id: string; name: string; desc: string; value: number;
  equip?: {
    slot: 'weapon' | 'armor' | 'trinket';
    minLevel?: number;
    bonus?: Partial<StatBlock>;          // 穿戴時屬性加值
    defense?: number;                    // armor/trinket 常用
    maxHp?: number;
    move?: Move;                         // weapon 專用：取代職業的武器招（moves 陣列第一招視為武器招——見 jobs 約定）
  };
}

// CompanionRecord 擴充（save v5）
equipment: { weapon: string | null; armor: string | null; trinket: string | null };

// roster.ts 追加
export function equipItem(save: SaveData, memberId: string, itemId: string): void;
  // 從 save.inventory 扣 1、舊裝備退回 inventory、寫入 equipment[slot]；不可裝（無 equip/等級不足/成員不存在/庫存 0）丟 Error
export function unequipItem(save: SaveData, memberId: string, slot: 'weapon'|'armor'|'trinket'): void;
export function equipmentBonus(record: CompanionRecord): { stats: Partial<StatBlock>; defense: number; maxHp: number };
// memberFromRecord 整合：stats 加 bonus、defense 加 defense、maxHp 加 maxHp；weapon 有 move → 取代 moves[0]（武器招約定：JOBS 每職業 moves[0] 為武器招——現況已然，資料測試鎖定）
```

## 內容要求（Task 3）

- **事件 15→42**（+27）：第三路線「霧嶺古道」限定 5、鹽晶洞窟（新高階迷宮）限定 4、跨路線通用 10（含 2 條新旗標鏈：「褪色的軍旗→傭兵團遺跡→discover 古戰場」（隱藏路線）、「奇怪的商人三連環（連續遠征出現、給獨特飾品）」）、稀有事件 4（weight 1-2：寶藏地圖/流浪劍聖切磋/月光市集/受傷的信使）、迷宮通用 4。五屬性覆蓋維持；fight 效果末位；敘事語感同 M3（60-120 字）。
- **地點**：第三路線「霧嶺古道」（legs 6、destinationTownId 新鎮「鹽泉城」、reputation ≥40 才在委託板出現——`LocationDef` 加 `minReputation?`）；高階迷宮「鹽晶洞窟」（floors 5、depthHpBonus 3、reputation ≥60 解鎖）；隱藏路線「古戰場」（旗標鏈 discover、legs 3、高報酬）。
- **城鎮**：第 4 鎮「鹽泉城」（鹽/裝備溢價）。
- **敵人 +7**（霧嶺山賊×2、鹽晶魔物×2、古戰場亡靈×2、洞窟主 boss）；帶 loot；至少一組帶 guard 招（驗架盾 AI 路徑——enemyAct 對 guard 招目標=自己，需 Task 1 順手確認支援，缺就修）。
- **裝備物品 +12**：武器 4（各職業一件 Lv2 升級武器，帶新 move）、護甲 4（皮/鎖/法袍/聖袍）、飾品 4（含既有 2 個 boss 遺寶轉裝備——overseer-ledger/den-idol 加 equip 欄）。
- 資料完整性測試同步擴充（equip.slot 引用、move 結構、minReputation 地點的可見性測試）。

## Task 1: 裝備系統引擎＋存檔 v5＋終審移交修繕

TDD。items equip 欄位、equipItem/unequipItem/equipmentBonus、memberFromRecord 整合（武器招取代 moves[0]）、save v5（equipment 欄遷移預設 null×3）、tradeSellPrice 裝備排除套利、applyLevelUp 非負驗證、enemyAct guard 招目標=自己（若未支援）。既有測試不弱化。
Commit：`feat(caravan): 裝備三欄系統——效果整合/存檔 v5/套利修正（M5）`

## Task 2: 裝備 UI＋e2e

roster 卡裝備三欄（`.equip-slot[data-slot]`>穿脫按鈕 `.equip-btn[data-item-id]`/`.unequip-btn`、可裝清單）；市集裝備區（equip 物品照常買賣）；結算獲得裝備顯示。e2e：買武器→裝→roster 顯示屬性/招式變化→訓練場招式列變化；遺寶裝備 e2e。既有 18 綠。
Commit：`feat(caravan): 裝備 UI——穿脫/市集/戰鬥招式接線＋e2e（M5）`

## Task 3: 內容大擴充

照「內容要求」。資料測試先行擴充。敘事自審。
Commit：`feat(caravan): M5 內容擴充——42 事件/第四鎮/霧嶺古道/鹽晶洞窟/古戰場/裝備物品（M5）`

## Task 4: 美術生成與接線

nanobanana（動漫平塗）：風格錨定 1 張（商隊行進黃昏場景）→ `--ref` 鏈批量：標題橫幅 1、職業立繪 5（含主角）、敵人立繪 12（既有+新）、城鎮橫幅 4、關鍵事件插圖 10（旗標鏈與稀有事件優先）、遊戲廳卡片 art 1。webp 輸出。接線：`EventCard.art`/`LocationDef` 加 `art`、戰鬥敵人立繪（`EnemyUnit` 加 `art`）、標題畫面、遊戲廳 GAMES 註冊補 art。UI `<img>` 全部 `loading="lazy"`＋width/height（CLS）。e2e 不驗圖存在（美術可迭代），但資料測試驗 art 路徑檔案存在（fs 檢查）。
Commit：`feat(caravan): 動漫平塗美術——標題/職業/敵人/城鎮/事件插圖接線（M5）`

## Task 5: BGM＋平衡收尾＋最終驗證

gemini-music-gen 產 1 首（奇幻旅途、中板、可循環）→ `ArcadeBgm` 模式接入（preload=none＋手勢後播）。平衡 pass：新內容數值跑 sanity（霧嶺淨利>黑森林、鹽晶洞報酬>礦坑、裝備價格 vs 收入曲線——寫進資料測試）。全套 vitest＋e2e＋（大改動收尾）`npx playwright test --project=chromium` 全站 e2e。README/spec 文件狀態更新（§3.7 標已完成）。
Commit：`feat(caravan): BGM＋平衡收尾——M5 完成（M5）`

## M5 完成判準

- vitest 全套綠（caravan ≥280）；caravan e2e ≥24 全綠；全站 chromium e2e 無新增失敗（既知 flake 除外）
- 實跑：裝備穿脫影響戰鬥、聲望解鎖第三路線、隱藏路線旗標鏈、美術顯示、BGM 播放
- 規格 §1-§3.7 全部落地或明確標注設計變更
