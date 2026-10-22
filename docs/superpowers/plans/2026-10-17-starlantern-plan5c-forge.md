# 星燈迷宮 計畫 5c：鍛造屋、製作與素材目錄 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 城鎮新增「鍛造屋」，提供分解、強化（+0 到 +10）、重鑄、合成、製作五個頁籤。所有素材歸入五個類別，每種非雜物素材都至少有一個用途，而且用途可以在介面上看到。

**Architecture:**
- **資料與規則分開。**
  - 所有費用表、成功率、配方、詞綴類別都放在 `data/forge.ts`。
  - 規則是 `engine/forge/` 底下的純函式：輸入 `GameState`，回傳新的 state，不改動輸入，寫法和 `engine/town.ts` 相同。
  - 素材的用途 `materialUses` 是從同一份資料表反推出來的，不另外手寫。所以只要配方存在，用途就一定列得出來；新增素材卻忘了給用途，單元測試就會失敗。
- **亂數。**
  - 鍛造的亂數來自 `forgeRng(state)`。每**實際抽一次**，才用 `mix(state.forgeDraws++ ^ FORGE_SALT, state.nextUid)` 當種子取一個數；只建立 rng 不會前進 `forgeDraws`。
  - 不使用 `game.rng`，所以現有種子測試抽到的序列不變。
  - 每個鍛造動作都透過 `Game` 的方法執行，而且執行後立刻存檔，所以重新讀檔也重抽不到。
- **強化只放大底材自帶的加成**（`implicitStats`），不放大詞綴。平衡模擬的隨機裝備會帶上「期望強化等級」，另外新增一項「全身 +10」的頭目測試。
- **介面。**
  - `ForgeScene` 繼承 `FacilityScene`。指令視窗就是五個頁籤，和道具店的「購買／販賣」做法相同。
  - 只用文字加上稀有度顏色，沒有圖示。裝備與素材的美術留給 5d。

**Tech Stack:** TypeScript、Vitest（happy-dom）、DOM 介面加上 SCSS、Playwright e2e。

**Spec:**
- `docs/superpowers/specs/2026-10-16-starlantern-progression-design.md`：§7、§7.1、§7.2、§9、§11 的鍛造部分。
- 前兩份計畫：
  - `docs/superpowers/plans/2026-10-16-starlantern-plan5a-loot-core.md`：它的已裁定衝突 3 寫的是「自動分解在 5c 之前只做標記」，由本計畫的 Task 14b 處理。
  - `docs/superpowers/plans/2026-10-17-starlantern-plan5b-skills-talents.md`

> 沒有以 `src/` 或 `tests/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。

## Global Constraints
- **單元測試**
  - 只能用 `npx vitest run <路徑>`；全套用 `npx vitest run --testTimeout=20000`。
  - 不可以用 `npm run test`，它是 watch 模式，會卡住。
- **e2e**
  - 用 `E2E_PORT=4352 npx playwright test tests/e2e/starlantern --project=chromium`。
  - 不可以用 4321 埠。
- **工具**：本專案沒有 prettier、eslint，也沒有 type-check 腳本，不要去跑。
- **SCSS**：
  - 禁止 `!important`；
  - 禁止行內樣式，包括 JS 的 `element.style`；
  - 不可以用 `::before`／`::after` 做裝飾。
- **換行**：保留每個檔案原本的換行格式。改檔前先用 `git ls-files --eol <檔案>` 確認。已知的格式如下：
  - LF：`data/materials.ts`、`data/gear.test.ts`、`engine/loot/item.ts`、`engine/loot/drops.ts`、`engine/compare.ts`、`engine/scaling.ts`、`ui2/loot.ts`、`ui2/scenes/equip.ts`、`ui2/scenes/equip.test.ts`
  - CRLF：`engine/types.ts`、`engine/save.ts`、`engine/state.ts`、`engine/sim.ts`、`engine/rng.ts`、`render/artPaths.ts`、`ui2/menu.ts`、`ui2/menu.test.ts`、`ui2/scenes/shop.ts`、`ui2/scenes/town.ts`
  - 混用：`data/text.zh-TW.ts`、`engine/game.ts`、`engine/town.ts`、`engine/balance.test.ts`、`ui2/main.ts`、`ui2/scene.ts`、`ui2/widgets.ts`、`ui2/widgets.test.ts`、`ui2/scenes/facility.ts`、`ui2/scenes/gate.ts`
  - 本表以外的檔案（例如 `engine/scaling.test.ts`），改之前一樣要先查。新檔一律用 LF。
- **commit**
  - 一律寫出完整路徑，不可以用 `git add -A`。
  - 訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **文案**
  - 介面文字放在 `data/text.zh-TW.ts`。
  - 素材名稱照舊放在 `data/materials.ts`。
- **亂數**：一律用帶種子的 `Rng`。鍛造只用 `forgeRng`（Task 5），或是測試傳進來的 rng。只有在機率介於 0 和 1 之間時才抽亂數；沒抽就不前進 `forgeDraws`。
- **平衡**
  - `engine/balance.test.ts` 第 1–14 項的門檻一律不可以放寬。
  - 會影響戰力的任務（Task 3、Task 4），驗證時一律跑全套，包括 balance。
  - 紅了只能依 Task 4 列出的順序調整旋鈕，並且在 commit 訊息裡寫出最後的值。
- **測試寫法**
  - 預期值一律透過常數算出來，例如 `ENHANCE_COST`、`ENHANCE_SUCCESS`、`ENHANCE_STEP`、`DISMANTLE`、`FUSE_GOLD`、`CONSUMABLE_RECIPES`、`SET_RECIPE`、`REROLL`。這樣調整旋鈕或費用時，測試不會壞。
  - 共用的小工具只在一個地方測試：
    - `canPay`／`pay` 在 `engine/forge/cost.test.ts`；
    - `gearLabel` 在 `ui2/rarity.test.ts`；
    - `forgeRows`、`costText` 在 `ui2/scenes/forge.test.ts`。
- **美術**
  - 不可以做假圖示，也不可以用 CSS 形狀畫物品或素材。
  - 新的素材 id 一律加進 `render/artPaths.ts` 裡 `allArtUrls()` 的區域變數 `NO_ICON_YET`，直接在原地編輯，讓 `artPaths.test.ts` 的 219 維持不變。
  - `art.scene`、`art.npc` 的型別要加上 `'forge'`，但不可以加進 `allArtUrls` 的清單，所以 219 不變。鍛造屋的場景與 NPC 圖都留給 5d。
- **存檔**：版本從 5 變成 6，舊檔直接重置。使用者已同意。
- **測試修改規則**
  - 某個任務會弄壞的每一個測試檔，都要列在該任務的 Files 裡，並寫明怎麼改。
  - 改動共用資料形狀的任務，驗證步驟一律跑全套。
- **惡意存檔**：存檔驗證遇到任何不合法的值，一律回報 `corrupt`，不可以丟出例外。
- **城鎮動作**：會改變存檔的鍛造動作，一律經過 `Game` 的方法（Task 10），執行後立刻存檔。介面不可以直接呼叫 `game.apply(...)` 來執行鍛造動作。
- **介面**
  - 每件裝備的名稱都用 `gearLabel`，所以都帶有稀有度用詞，並加上 `.slx-rarity-*`。
  - 列數可能超過 12 的清單，一律用 `MenuView` 的 `rows = 12`，讓 ▲▼ 捲動提示出現。
  - 每個操作都必須能用滑鼠、觸控、鍵盤完成。

## Review Focus
1. **背包已滿（60 件）時製作裝備，或背包在合成途中變化。**
   - 打造底材或套裝時背包已滿：回傳 `full`，金幣與素材都不扣。
   - 合成是放進 3 件、拿出 1 件，所以永遠放得下。
   - 測試在 Task 8、Task 9。
2. **身上穿著的裝備。**
   - 強化和重鑄可以作用在身上的裝備：成員的裝備欄位要更新，重鑄讓 HP 上限下降時，要把 HP、TP 壓回上限。
   - 分解和合成只收背包裡的裝備，傳入身上裝備的 uid 時回傳 `stock`。
   - 測試在 Task 5、Task 6、Task 7、Task 8。
3. **強化失敗的邊界。**
   - 從 +5 升 +6 是第一次可能失敗；從 +4 升 +5 一定成功，而且不抽亂數。
   - 失敗時，素材和金幣照樣扣掉，等級不變，也不會降級。
   - 已經是 +10 時回傳 `max`，什麼都不扣。
   - 測試在 Task 6。
4. **惡意或手改的存檔。**
   - 下列情況都回報 `corrupt`：`enhance` 是 11、−1 或 1.5；`locked` 超出詞綴範圍或不是整數；`forgeDraws` 是負數、不是整數或大於 1e9。
   - 不可以丟出例外。
   - 測試在 Task 2。
5. **重鑄鎖定。**
   - 重鑄過第 1 條詞綴之後，再重鑄第 0 條要回傳 `affixLocked`，而且什麼都不扣。
   - 換詞綴之後，鎖定的仍是同一條（索引不變）。
   - 地區素材對這個欄位沒有可換的詞綴時，回傳 `none`，什麼都不扣。
   - 測試在 Task 7。

---

## File Structure
- `data/materials.ts`：每種素材新增 `kind`；新增 4 種精華；地區素材補上價格。
- `data/forge.ts`（新）：強化、分解、重鑄、合成、製作的全部數值與配方，以及 `Cost` 型別、`expectedEnhance`。
- `engine/forge/uses.ts`（新）：`materialUses`，從配方反推每種素材的用途。
- `engine/forge/cost.ts`（新）：`canPay`、`pay`、`findItem`、`forgeRng`，以及各動作的費用函式。
- `engine/forge/forge.ts`（新）：分解、強化、重鑄、合成。
- `engine/forge/craft.ts`（新）：製作消耗品、打造底材、打造套裝。
- `engine/loot/item.ts`：`implicitStats` 套用強化倍率；export `rollValue`。
- `engine/loot/drops.ts`：export `mix`。
- `engine/state.ts`、`engine/save.ts`、`engine/types.ts`：存檔 v6、`forgeDraws`、`ItemInstance.locked`、`MaterialKind`。
- `engine/game.ts`：鍛造動作的 `Game` 方法，執行後存檔。
- `engine/town.ts`：`sellJunk`。
- `engine/sim.ts`、`engine/balance.test.ts`：期望強化等級，以及新增的第 14 項。
- `engine/compare.ts`、`ui2/loot.ts`：名稱顯示強化等級，說明顯示鎖定的詞綴。
- UI：
  - `ui2/scenes/forge.ts`（新）：場景、分解、強化、重鑄、合成。
  - `ui2/scenes/forgeCraft.ts`（新）：製作頁籤。
  - `ui2/scenes/town.ts`、`ui2/scenes/facility.ts`、`ui2/scene.ts`、`ui2/main.ts`
  - `ui2/menu.ts`、`ui2/widgets.ts`：選單右欄可以帶 class（`rightClass`）。
  - `ui2/scenes/shop.ts`、`ui2/scenes/gate.ts`
  - `src/styles/_starlantern-ui.scss`
- e2e：`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 素材目錄、鍛造資料表與用途索引

**Files:**
- Create：`data/forge.ts`、`data/forge.test.ts`、`engine/forge/uses.ts`、`engine/forge/uses.test.ts`
- Modify：
  - `engine/types.ts`：新增 `MaterialKind`，`MaterialDef` 新增必填的 `kind`。
  - `data/materials.ts`
  - `render/artPaths.ts`：把 4 個精華 id 加進 `NO_ICON_YET`。
  - `data/text.zh-TW.ts`：新增 `T.forge`，內容見下方。
- Test：`data/data.test.ts` 第 20 行的素材數量從 18 改成 22。

**Interfaces:**
- Produces（`engine/types.ts`）：
  - `export type MaterialKind = 'essence' | 'monster' | 'region' | 'rare' | 'junk'`
  - `MaterialDef { id; name; price; kind: MaterialKind }`
- Produces（`data/forge.ts`，只 import 資料檔與 types）：
  - `export interface Cost { gold: number; mats: Record<string, number> }`
  - `ESSENCE_IDS = ['essence-common', 'essence-magic', 'essence-rare', 'essence-legendary']`
  - `ESSENCE_OF: Record<Rarity, string>`：common、magic、rare 對到同名的精華；legendary、unique、set 對到 `essence-legendary`。
  - `DISMANTLE: Record<Rarity, Record<string, number>>`
  - `ENHANCE_MAX = 10`、`ENHANCE_STEP = 0.08`
  - `ENHANCE_COST: Cost[]`：長度 10，索引 `t − 1` 是「升到 +t」的費用。
  - `ENHANCE_SUCCESS: number[]`：長度 10，索引同上。
  - `expectedEnhance(depth: number): number`：等於 `Math.min(ENHANCE_MAX, Math.floor(depth / 2))`。
  - `REROLL = { gold: (ilvl: number) => 20 + 2 * ilvl, essence: { value: 1, swap: 2 }, regionQty: 1, legendaryMat: 'star-tear', legendaryQty: 1 }`
  - `REGION_AFFIX_GROUP: Record<string, AnyStat[]>`：鍵是地區素材的 id。
  - `FUSE_NEXT = { common: 'magic', magic: 'rare', rare: 'legendary' } as const`
  - `FUSE_GOLD: Record<'magic' | 'rare' | 'legendary', number>`
  - `FUSE_SLOT_COST: Record<'magic' | 'rare' | 'legendary', Record<string, number>>`
  - `CONSUMABLE_RECIPES: Record<string, Cost>`：鍵是 `ITEMS` 的 id。
  - `BASE_RECIPES: Record<GearSlot, Record<string, number>>`
  - `baseGold(ilvl: number): number`：等於 `20 + 3 * ilvl`。
  - `CRAFT_MAGIC_CHANCE = 0.25`
  - `SET_RECIPE = { regionQty: 8, rare: 'star-tear', rareQty: 1, gold: 300 }`
- Produces（`engine/forge/uses.ts`）：

```ts
export type MaterialUse =
  | { kind: 'enhance'; level: number }
  | { kind: 'reroll'; tier: 'magic' | 'rare' | 'legendary' }
  | { kind: 'legendaryReroll' }
  | { kind: 'regionReroll'; region: RegionId }
  | { kind: 'fuseSlot'; target: 'magic' | 'rare' | 'legendary' }
  | { kind: 'consumable'; item: string }
  | { kind: 'base'; slot: GearSlot }
  | { kind: 'set'; set: string }
  | { kind: 'unlock'; base: string };
export function materialUses(id: string): MaterialUse[];
```

  - 用途的來源有：
    - `ENHANCE_COST`
    - `REROLL` 與 `ESSENCE_OF`：精華依稀有度對應；普通精華沒有重鑄用途，因為普通裝備沒有詞綴。
    - `REGION_AFFIX_GROUP`、`FUSE_SLOT_COST`、`CONSUMABLE_RECIPES`、`BASE_RECIPES`
    - `SET_RECIPE`：對每一套 `SETS`，用到該地區的素材與 `SET_RECIPE.rare`。
    - `EQUIPMENT[*].unlock`
  - 順序就是上面的順序；同一個用途只列一次。

**素材表**（以下都是 (implementer's call → fixed here)）：

| id | 名稱 | 類別 | 價格 |
|---|---|---|---|
| essence-common | 普通精華 | essence | 4 |
| essence-magic | 魔法精華 | essence | 12 |
| essence-rare | 稀有精華 | essence | 30 |
| essence-legendary | 傳說精華 | essence | 80 |
| moss、bat-wing、thorn-fang、crystal-shell、ice-crystal、lizard-scale、star-stone、dusk-cloth | 不變 | monster | 不變 |
| ancient-gear、star-tear、king-scale | 不變 | rare | 不變 |
| blaze-core、frost-heart、storm-stone、mire-gland、shade-crystal、iron-shard | 不變 | region | 0 改成 25 |
| old-coin | 古代銀幣（不改名） | junk | 40 |

**分解 `DISMANTLE`**：
- common：普通 ×1
- magic：魔法 ×1、普通 ×1
- rare：稀有 ×1、魔法 ×1
- legendary、unique、set：傳說 ×1、稀有 ×1

**強化**（升到 +t 的費用與成功率）：

| t | 精華 | 其他 | 金幣 | 成功率 |
|---|---|---|---|---|
| 1 | 普通 ×2 | — | 20 | 1 |
| 2 | 普通 ×3 | — | 40 | 1 |
| 3 | 普通 ×4 | — | 60 | 1 |
| 4 | 魔法 ×2 | — | 100 | 1 |
| 5 | 魔法 ×3 | — | 140 | 1 |
| 6 | 魔法 ×4 | — | 200 | 0.8 |
| 7 | 稀有 ×2 | — | 280 | 0.7 |
| 8 | 稀有 ×3 | ancient-gear ×1 | 380 | 0.6 |
| 9 | 傳說 ×1、稀有 ×2 | ancient-gear ×1 | 500 | 0.5 |
| 10 | 傳說 ×2 | king-scale ×1 | 700 | 0.4 |

**詞綴類別 `REGION_AFFIX_GROUP`**（各組不重疊）：
- blaze-core：fireDmg、fireRes、atk、str
- frost-heart：iceDmg、iceRes、mag、int
- storm-stone：thunderDmg、thunderRes、spd、agi
- mire-gland：poisonRes、sleepRes、hp、heal、wil
- shade-crystal：crit、critDmg、vuln、multi、evasion
- iron-shard：armor、def、block、meleeDR、rangedDR、res

**合成**：
- `FUSE_GOLD`：magic 30、rare 80、legendary 200。
- `FUSE_SLOT_COST`（指定欄位時另外付）：
  - magic：普通精華 ×2
  - rare：魔法精華 ×2
  - legendary：king-scale ×1

**消耗品配方 `CONSUMABLE_RECIPES`**：

| 物品 | 素材 | 金幣 |
|---|---|---|
| potion | moss ×2 | 6 |
| antidote | moss ×1 | 3 |
| ether | bat-wing ×2、crystal-shell ×1 | 10 |
| return-lamp | star-stone ×1、thorn-fang ×1 | 10 |
| phoenix | dusk-cloth ×1、ice-crystal ×2、lizard-scale ×1 | 25 |

**底材配方 `BASE_RECIPES`**：

| 欄位 | 素材 |
|---|---|
| weapon | thorn-fang ×3、star-stone ×1 |
| offhand | crystal-shell ×3 |
| head | lizard-scale ×2、bat-wing ×1 |
| body | dusk-cloth ×2、lizard-scale ×1 |
| hands | thorn-fang ×2、moss ×2 |
| feet | bat-wing ×3 |
| neck | ice-crystal ×2、moss ×1 |
| ring | star-stone ×2 |

**文案 `T.forge`**：
- `kind: Record<MaterialKind, string>`：精華、怪物素材、地區素材、稀有素材、雜物。
- `group: Record<RegionId, string>`：
  - mainline：空字串
  - blaze：火焰系
  - frost：冰霜系
  - storm：雷鳴系
  - mire：毒抗與恢復系
  - shade：暴擊系
  - iron：防禦系
- `use(u: MaterialUse): string`：
  - enhance：`強化 +${level}`
  - reroll：`重鑄${T.rarity[tier]}裝備`
  - legendaryReroll：`重鑄傳說裝備`
  - regionReroll：`重鑄時鎖定${group}詞綴`
  - fuseSlot：`合成${T.rarity[target]}時指定欄位`
  - consumable：物品名稱
  - base：`${T.slotKind[slot]}打造`
  - set：`${套裝名稱}打造`
  - unlock：`${底材名稱}解鎖`
- `usedFor(list: string): string`：`用於：${list}`
- `junkOnly`：`雜物：只能賣錢`

- [ ] **Step 1: 寫失敗的測試**
  - `forge.test.ts`（data）：
    - `essences cover every rarity and dismantling yields only essences`
    - `enhance tables have ENHANCE_MAX rows; success is 1 up to +5, below 1 from +6, never rising`
      - 也就是 `ENHANCE_SUCCESS[4] === 1`，`ENHANCE_SUCCESS[5] < 1`，而且整個陣列單調不升。
    - `each enhance tier asks for a different essence mix and +8 and above need a rare material`：
      - 令 `top(t)` 是 `ENHANCE_COST[t − 1].mats` 裡、在 `ESSENCE_IDS` 中索引最大的精華；
      - `top(1..10)` 單調不降，而且 `new Set(top(1..10))` 的大小是 4，也就是四種精華各自是某幾段的主精華；
      - 令 `essenceMix(t)` 是 `ENHANCE_COST[t − 1].mats` 裡精華 id 的集合，排序後接成字串；`top` 改變的那幾段（`top(t) !== top(t − 1)` 的 t），`essenceMix(t) !== essenceMix(t − 1)`；
      - `ENHANCE_COST[7..9]` 都用到 `kind === 'rare'` 的素材，`ENHANCE_COST[0..6]` 都沒有用到。
    - `region affix groups are disjoint affix keys, one per region material`
    - `crafting a consumable is cheaper than buying it`：對每個配方，`gold + Σ MATERIALS[m].price × qty < ITEMS[id].price`。
    - `every gear slot has a base recipe of monster materials`
    - `expectedEnhance grows with depth and stops at ENHANCE_MAX`
  - `uses.test.ts`：
    - `every material but junk has a use, and junk has none`：
      - 對 `MATERIALS` 的每一項，`kind === 'junk'` 若且唯若 `materialUses(id).length === 0`。
      - 這就是 spec 要求的「新增素材忘了給用途就會失敗」。
    - `kinds match the hooks from 5a`：
      - `kind === 'rare'` 的 id 集合等於 `RARE_MATERIALS`；
      - `kind === 'region'` 的 id 集合等於 `REGIONS` 各地區的 `material`（去掉 null）；
      - `old-coin` 是 junk。
    - `moss is used for potions, antidotes and two base recipes`：
      - 依序包含 `{ kind: 'consumable', item: 'potion' }`、`{ kind: 'consumable', item: 'antidote' }`、`{ kind: 'base', slot: 'hands' }`、`{ kind: 'base', slot: 'neck' }`。
    - `star-tear is used for legendary rerolls and every set`：用途裡有 6 個 `kind: 'set'`。
    - `the unlock tally shows as a use`：`thorn-fang` 的用途包含 `{ kind: 'unlock', base: 'thorn-gauntlets' }`。
    - `every use has words`：每一個用途的 `T.forge.use(u)` 都是非空字串。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/data src/scripts/games/starlantern/engine/forge`
  - 預期：失敗，原因是 `data/forge` 不存在。
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - 原因：`MaterialDef` 的形狀有變，`artPaths` 的素材清單也有變。
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): material catalogue with kinds, essences and forge tables; every non-junk material has a use`

### Task 2: 存檔 v6

**Files:**
- Modify：
  - `engine/types.ts`：
    - `ItemInstance` 新增 `locked?: number`；
    - 更新註解：`enhance` 的範圍是 0 到 `ENHANCE_MAX`。
  - `engine/state.ts`：`SAVE_VERSION = 6`；`GameState` 新增 `forgeDraws: number`；`newGame` 給 0。
  - `engine/save.ts`
- Test：`engine/save.test.ts`：新增，寫法照第 135 行的 v4 測試。

**Interfaces:**
- Consumes：Task 1 的 `ENHANCE_MAX`。
- Produces：
  - `GameState.forgeDraws`：鍛造亂數已經用掉的次數。`newGame` **不會**從傳入的 rng 抽亂數，所以 `game.rng` 的序列不變。
  - `ItemInstance.locked`：第一次重鑄過的詞綴索引。之後只能重鑄這一條。
- `isItem` 新增的檢查：
  - `enhance` 是整數，而且介於 0 和 `ENHANCE_MAX` 之間；
  - `locked` 不存在，或是滿足 `0 ≤ locked < affixes.length` 的整數。
- `isValid` 新增的檢查：`forgeDraws` 是安全整數，而且介於 0 和 `MAX_UID`（1e9）之間。

- [ ] **Step 1: 寫失敗的測試**
  - `save.test.ts`：
    - `a version-5 save reports version`
    - `round-trips forgeDraws, an enhanced item and a locked affix`
    - Review Focus 4：`rejects enhance 11, -1 and 1.5, a locked index out of range or fractional, and a bad forgeDraws`
      - 每一種都回報 `corrupt`，不會丟出例外。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/save.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - 原因：`GameState` 的形狀有變。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): save v6 with forge draws, enhance levels and locked affixes`

### Task 3: 強化等級放大底材加成

**Files:**
- Modify：`engine/loot/item.ts`、`engine/loot/item.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `ENHANCE_STEP`。
- Produces：
  - `implicitStats(it)`：每一項等於 `Math.round(v × grow × (1 + ENHANCE_STEP × it.enhance))`；`grow` 和現在相同。
  - `itemStats` 不改，因為它本來就是讀 `implicitStats`。詞綴不受強化影響。
  - `export function rollValue(rng: Rng, key: AnyStat, ilvl: number, rarity: Rarity): number`：只是把現有的私有函式改成 export，公式不變。

- [ ] **Step 1: 寫失敗的測試**
  - `item.test.ts`：
    - `enhancement scales the base bonus by ENHANCE_STEP per level and leaves affixes alone`：
      - 一件 `iron-sword` 的魔法實體，`enhance` 是 0 和 5；
      - +5 的 `implicitStats` 等於 `Math.round(+0 那件的未取整值 × (1 + 5 × ENHANCE_STEP))`，預期值在測試裡用 `EQUIPMENT` 與 `IMPLICIT_PER_ILVL` 算；
      - 兩件的詞綴相同。
    - `an +ENHANCE_MAX item at item level 202 stays finite`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/loot/item.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - 現在所有裝備都是 +0，所以 balance 的數字不會變。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): enhancement raises a base's own bonus`

### Task 4: 平衡模擬加入期望強化等級

**為什麼要做：** 強化會提高戰力，所以平衡模擬必須帶上強化。
- 現在的基準（預檢，HEAD 6001ed6e）：第 10 項最緊的一格是 mainline 第 10 層，hpLoss 0.1073（下限 0.10）；mainline 第 4 層是 0.1105。
- 預檢在 `ENHANCE_STEP = 0.08` 下實測：
  - mainline 第 10 層 +5 是 0.0939，第 10 項會失敗；
  - 第 4 層 +2 是 0.1016，只剩 0.0016 的餘裕；
  - 勝率全部是 1.000。
- 所以這個任務一定要調旋鈕。

**期望強化等級** `expectedEnhance(depth) = ⌊depth / 2⌋`，最多 +10。(implementer's call → fixed here)
- 依據：
  - 每分解 1 件裝備，只得到 1–2 個精華；
  - 強化到 +5 每件要 9 個普通精華與 5 個魔法精華；
  - +6 以上會失敗，而且要稀有精華與稀有素材。
- 所以在深度 d 時，全身穿到大約 +d/2 已經是偏高的估計。
- 最壞的情況另外用第 14 項測：全身 +10。
- `ENHANCE_STEP` 維持 0.08，讓強化有手感：+10 時底材加成是 1.8 倍。減半會讓強化變得沒有意義。它可以調，但絕不可以低於 0.06。

**Files:**
- Modify：
  - `engine/sim.ts`：
    - `kitParty` 新增**明確的**參數 `enhance`，預設 0；
    - `winRate` 新增最後一個參數 `kitEnhance = 0`，有 `kitSeed` 時傳給 `kitParty`。
    - 現有的呼叫端都不傳，所以仍然是 +0。
  - `engine/balance.test.ts`：第 10、11 項明確傳入 `expectedEnhance(d)`，並新增第 14 項。第 1–13 項的門檻不動。
  - 平衡旋鈕，依下列順序使用：
    1. `engine/scaling.ts` 的 `ENEMY_POWER`：5b 用的共用進度旋鈕。可以多一個參數，例如斜坡或第二階（`from2`／`amount2`）。
       - 它也會影響沒穿裝備的第 4–9、13 項，所以調了之後要重跑全套。
       - 形狀改了的話，`engine/scaling.test.ts` 第 276–282 行（`enemyPower(50)` 等於 `1 + amount`）會壞。要改成透過 `ENEMY_POWER` 的欄位算出預期值，並列入這個任務的 commit。
    2. `data/forge.ts` 的 `ENHANCE_STEP`：下限 0.06。
    3. `data/gear.ts` 的 `IMPLICIT_PER_ILVL`。
    4. `data/gear.ts` 的 `AFFIX_SCALE`。
  - `data/gear.test.ts` 第 82–83 行把 `AFFIX_SCALE` 0.8、`IMPLICIT_PER_ILVL` 0.02 寫死了。不論有沒有調，都改成 `toBeGreaterThan(0)`，讓測試不再寫死旋鈕的值。
- **會移動的現有數字：**
  - 第 10 項的全部 8 格：第 4、6、8、10 層，各帶 +2、+3、+4、+5，mainline 與 blaze 都有；
  - 第 11 項：第 5 層 +2、第 10 層 +5。
  - 第 1–9、12、13 項只有在調 `ENEMY_POWER` 時才會移動（第 6 項的頭目在 Lv12，也在範圍內）。
- **餘裕**：每一項有約束力的門檻，都要留至少 0.005 的餘裕。例如 hpLoss ≥ 0.105（下限 0.10）、≤ 0.445（上限 0.45），勝率 ≥ 0.855（下限 0.85）。任何組合都做不到時，停下來回報，不可以放寬門檻，也不可以改 `expectedEnhance`。

**Interfaces:**
- Consumes：Task 1 的 `expectedEnhance`、`ENHANCE_MAX`；Task 3 的 `implicitStats`。
- Produces：
  - `kitParty(level: number, depth: number, seed: number, rarity?: Rarity, enhance = 0): Party`：每件物品的 `enhance` 都設成這個值。
  - `winRate(level, groups, boss, seeds, scale, altar, kitSeed, player, kitEnhance = 0)`

- [ ] **Step 0: 記錄改動前的基準**
  - 在改任何程式之前，跑第 10 項（8 格）與第 11 項，記下每一格的 rate、hpLoss，以及第 11 項的最少回合數。
  - 寫進這個任務的 commit 訊息。
- [ ] **Step 1: 寫失敗的測試**
  - 第 10 項：
    - 每一格改成 `winRate(..., kitSeed, undefined, expectedEnhance(d))`；
    - 開頭的 kit 檢查改成 `kitParty(depthLevel(4), 4, 1, undefined, expectedEnhance(4))`，並加上 `worn.every((it) => it!.enhance === expectedEnhance(4))`。
  - 第 11 項改成 `kitParty(depthLevel(d), d, seed, 'rare', expectedEnhance(d))`，門檻不變。
  - 新增：`14. a boss never falls in one round, even to a +ENHANCE_MAX rare kit, and the test sees enhancement`
    - d 取 5 與 10，seed 取 1–20；
    - 每一場 `simBattle(kitParty(depthLevel(d), d, seed, 'rare', ENHANCE_MAX), ['lanterneater'], true, seed, { depth: d, region: 'mainline' })` 的 `rounds` 都 ≥ 2。這是 spec 的反目標「頭目一回合就倒」。
    - 在同一層、同一組 seed 下，+10 的平均回合數**嚴格小於** +0（`enhance = 0`）的平均回合數。這證明測試真的看得到強化。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/balance.test.ts --testTimeout=20000`
  - 預期：失敗，原因是 `kitParty` 還不收第 5 個參數，kit 檢查的 enhance 是 0。
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認第 1–14 項全部通過，而且每一項都有 0.005 的餘裕**
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
  - 用一個暫時的腳本印出第 4–11、13 項每一格的值，確認餘裕；腳本不 commit。
  - 紅了，或餘裕不夠，就依上面的順序調整旋鈕。
- [ ] **Step 5: commit**
  - 訊息：`test(starlantern): balance with the expected enhancement level and a +10 boss check`
  - 訊息裡寫出 Step 0 的基準、調整後每一格的數字，以及最後的旋鈕值。

### Task 5: 鍛造共用工具與分解

**Files:**
- Create：`engine/forge/cost.ts`、`engine/forge/cost.test.ts`、`engine/forge/forge.ts`、`engine/forge/forge.test.ts`
- Modify：`engine/loot/drops.ts`：`mix` 改成 export，內容不變。

**Interfaces:**
- Consumes：Task 1 的 `Cost`、`DISMANTLE`；Task 2 的 `forgeDraws`；`engine/town.ts` 的 `addItem`。
- Produces（`engine/forge/cost.ts`）：
  - `type ForgeFail = 'invalid' | 'stock' | 'gold' | 'mats' | 'max' | 'full' | 'affixLocked' | 'none' | 'phase'`
    - `'phase'` 只有 Task 10 的 `Game` 會回傳；引擎函式不會。
    - 用 `affixLocked` 而不是 `locked`，因為 `T.reasons.locked` 已經是商店與傳送門的「尚未解鎖」。
  - `type ForgeResult<O> = { ok: true; state: GameState; out: O } | { ok: false; reason: ForgeFail }`
  - `canPay(s: GameState, c: Cost): 'gold' | 'mats' | null`：先檢查金幣。
  - `pay(s: GameState, c: Cost): void`：直接改 `s`，所以要在複本上呼叫。只扣 `gold` 與 `inventory`，**不會動 `sold`**。
  - `addCost(a: Cost, b: Cost): Cost`
  - `findItem(s: GameState, uid: number): { it: ItemInstance; member?: CharacterId; slot?: Slot } | null`：先找背包，再找已招募成員身上的裝備。
  - `FORGE_SALT = 0x2f6b1d3a`
  - `forgeRng(s: GameState): Rng`：回傳一個函式，**每被呼叫一次**才執行 `mulberry32(mix(s.forgeDraws++ ^ FORGE_SALT, s.nextUid))()`。
    - 只建立、不呼叫時，`forgeDraws` 不變。
    - 會改動 `s`，所以要用複本建立。
- Produces（`engine/forge/forge.ts`）：
  - `dismantleYield(its: ItemInstance[]): Record<string, number>`：`DISMANTLE` 的加總。
  - `dismantle(s: GameState, uids: number[]): ForgeResult<{ essences: Record<string, number> }>`
    - 空清單或有重複的 uid：`invalid`；
    - 有任何一個 uid 不在背包裡，包括身上穿著的：`stock`；
    - 成功時，物品從背包移除，精華加進 `inventory`。
    - 強化等級不退還任何東西。(implementer's call → fixed here)

- [ ] **Step 1: 寫失敗的測試**
  - `cost.test.ts`（這些工具只在這裡測）：
    - `canPay checks gold first, then each material`
    - `pay takes gold and materials and never touches the sold tally`
    - `findItem finds bag items and worn items with their wearer and slot`
    - `forgeRng advances forgeDraws once per draw, not on creation, and is reproducible from the state`
  - `forge.test.ts`：
    - `dismantling yields DISMANTLE by rarity and removes the items`：用一件普通、一件稀有、一件套裝，預期值用 `DISMANTLE` 加總。
    - `dismantling only the marked items leaves the rest`
    - Review Focus 2：`a worn uid or a duplicate is refused and nothing changes`：用 `structuredClone` 前後比對。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/forge`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
  - 同一個指令，外加 `npx vitest run src/scripts/games/starlantern/engine/loot`。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): forge helpers and dismantling into essences`

### Task 6: 強化

**Files:**
- Modify：`engine/forge/cost.ts`、`engine/forge/forge.ts`、`engine/forge/forge.test.ts`

**Interfaces:**
- Consumes：Task 5 的 `canPay`、`pay`、`findItem`、`forgeRng`；Task 1 的 `ENHANCE_COST`、`ENHANCE_SUCCESS`、`ENHANCE_MAX`。
- Produces：
  - `enhanceCost(it: ItemInstance): Cost | null`：已經是 +10 時回傳 null。
  - `enhanceChance(it: ItemInstance): number`
  - `enhance(s: GameState, uid: number, rng?: Rng): ForgeResult<{ success: boolean; level: number }>`
    - 找不到物品：`stock`；已經是 +10：`max`；付不起：`gold` 或 `mats`。以上情況都不改動任何東西，也不前進 `forgeDraws`。
    - 先付費。只有在成功率 < 1 時才抽亂數，`rng() < 成功率` 就算成功。沒有傳入 `rng` 時，用複本的 `forgeRng`。
    - 成功時 `enhance + 1`。失敗時等級不變，費用照扣。
    - 身上穿著的物品，直接在成員的欄位裡更新。

- [ ] **Step 1: 寫失敗的測試**
  - `+1 through +5 always succeed and draw no random number`：
    - 用一個會計數的 rng，從 +0 一路升到 +5，呼叫次數是 0；
    - 不傳 rng（用 `forgeRng`）時，`forgeDraws` 仍然是 0。
  - `the step to +6 draws once`：不傳 rng，`forgeDraws` 從 0 變成 1。
  - Review Focus 3：`from +5 the step to +6 can fail; a failure keeps the level and still pays`
    - 傳入 `constRng(0.999)`：結果 `success: false`、`level: 5`，金幣與素材都少了 `ENHANCE_COST[5]`。
  - Review Focus 3：`at +ENHANCE_MAX enhance is refused and costs nothing`
  - `success at +6 happens about ENHANCE_SUCCESS[5] of the time`：用 4000 個不同的 `forgeDraws`，容許 4σ。
  - Review Focus 2：`a worn item is enhanced in place on its wearer`
  - `lacking gold or materials is refused and forgeDraws stays`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/forge/forge.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): enhancement from +0 to +10, fallible from +6, never downgrading`

### Task 7: 重鑄

**Files:**
- Modify：`engine/forge/cost.ts`、`engine/forge/forge.ts`、`engine/forge/forge.test.ts`
- Modify：`engine/town.ts`：`clampToMax` 改成 export，內容不變。

**Interfaces:**
- Consumes：Task 3 的 `rollValue`；`data/gear.ts` 的 `AFFIXES`、`affixRange`、`ROLL_FLOOR`；Task 1 的 `REROLL`、`ESSENCE_OF`、`REGION_AFFIX_GROUP`。
- Produces：
  - `type RerollOpts = { swap: boolean; mat?: string }`
  - `rerollCost(it: ItemInstance, o: RerollOpts): Cost`
    - 精華：`ESSENCE_OF[it.rarity]` × `REROLL.essence.value`（換詞綴時是 `.swap`）。
    - 金幣：`REROLL.gold(it.ilvl)`，換詞綴時乘 2。
    - 有 `mat` 時，加上那個素材 × `REROLL.regionQty`。
    - 傳說物品再加上 `REROLL.legendaryMat` × `REROLL.legendaryQty`。
  - `rerollRange(it: ItemInstance, index: number): [number, number]`：等於 `[max(1, round(lo + (hi − lo) × floor)), max(1, round(hi))]`，`floor = ROLL_FLOOR[it.rarity]`。
  - `swapPool(it: ItemInstance, index: number, mat?: string): AnyStat[]`
    - 該欄位的詞綴池，扣掉這件物品現有的全部詞綴鍵；
    - 有 `mat` 時，再和 `REGION_AFFIX_GROUP[mat]` 取交集。
  - `reroll(s: GameState, uid: number, index: number, o: RerollOpts, rng?: Rng): ForgeResult<{ before: { key: AnyStat; value: number }; after: { key: AnyStat; value: number } }>`
- **規則**（檢查順序就是下面的順序，每一種拒絕都不改動任何東西）：
  1. 找不到物品：`stock`。
  2. 普通物品，或 `index` 超出範圍：`invalid`。
  3. `locked` 已經設定，而且不等於 `index`：`affixLocked`。
  4. 獨特或套裝物品要換詞綴：`invalid`。這兩種的詞綴是固定的，只能重抽數值。
  5. 重抽數值時帶了 `mat`，或 `mat` 不是 `REGION_AFFIX_GROUP` 的鍵：`invalid`。
  6. 要換詞綴，但 `swapPool` 是空的：`none`。
  7. 付不起：`gold` 或 `mats`。
- **成功時：**
  - 重抽數值：用 `rollValue(rng, key, it.ilvl, it.rarity)`。
  - 換詞綴：從 `swapPool` 平均抽一個鍵，再用 `rollValue` 擲數值。
  - 設定 `locked = index`。
  - 身上穿著的物品，在成員身上更新，並用 `clampToMax` 把 HP、TP 壓回上限。為此把 `town.ts` 的 `clampToMax` 改成 export。
- 傳說特效不會被重鑄。見文末的衝突 2。

- [ ] **Step 1: 寫失敗的測試**
  - `a value reroll stays in rerollRange and locks that affix`：
    - `constRng(0)` 得到 `rerollRange` 的下限；
    - `constRng(0.9999)` 的預期值用程式的同一個取整算：`Math.max(1, Math.round(lo + (hi − lo) × (floor + (1 − floor) × 0.9999)))`，`[lo, hi] = affixRange(key, ilvl)`，所以不會差 1；
    - 這個值 ≤ `rerollRange` 的上限。
  - Review Focus 5：`after rerolling affix 1, affix 0 is refused as affixLocked and nothing is spent`
  - Review Focus 5：`a swap changes the key, keeps the index locked and never repeats a key on the item`
  - `a region material limits the new key to its group`
    - 對每個 `REGION_AFFIX_GROUP` 的鍵，跑 200 個 rng，新的鍵 ∈ 該組；
    - 費用包含那個素材 × `REROLL.regionQty`。
  - `a value reroll draws once`：不傳 rng，`forgeDraws` 從 0 變成 1。
  - Review Focus 5：`a group with nothing left for the slot is refused as none and nothing is spent`：用一件手部物品，詞綴是 atk 與 str，再加上 `blaze-core`。手部的詞綴池裡，火焰系只有 atk 與 str，所以 `swapPool` 是空集合。
  - `uniques and set pieces reroll values only; a legendary also pays REROLL.legendaryMat`
  - Review Focus 2：`rerolling worn hp down holds HP at the new maximum`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行 `engine` 全部測試，確認通過**
  - `npx vitest run src/scripts/games/starlantern/engine`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): reroll one locked affix, region materials pick the category`

### Task 8: 合成

**Files:**
- Modify：`engine/forge/cost.ts`、`engine/forge/forge.ts`、`engine/forge/forge.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `FUSE_NEXT`、`FUSE_GOLD`、`FUSE_SLOT_COST`；`engine/loot/item.ts` 的 `rollItem`；`data/gear.ts` 的 `generalLegendaries`、`GEAR_SLOTS`；`engine/loot/bag.ts` 的 `mintUid`。
- Produces：
  - `fuseSlots(target: 'magic' | 'rare' | 'legendary'): GearSlot[]`
    - magic 與 rare：全部 8 個欄位；
    - legendary：有通用傳說的欄位，所以沒有 body。
  - `fuseCost(target, slot?: GearSlot): Cost`：等於 `FUSE_GOLD[target]` 金幣；有 `slot` 時再加上 `FUSE_SLOT_COST[target]`。
  - `fuse(s: GameState, uids: number[], slot?: GearSlot, rng?: Rng): ForgeResult<{ item: ItemInstance }>`
- **規則**（每一種拒絕都不改動任何東西）：
  - 不是剛好 3 個不重複的 uid：`invalid`。
  - 有任何一件不在背包裡：`stock`。
  - 稀有度不同，或稀有度不是 common、magic、rare：`invalid`。
  - `slot` 不在 `fuseSlots(target)` 裡：`invalid`。
  - 付不起：`gold` 或 `mats`。
- **結果**：
  - 物品等級是 3 件的平均，無條件捨去。
  - target 是 magic 或 rare 時：`rollItem(rng, { uid: mintUid(n), ilvl, rarity: target, slot })`，沒有 `slot` 時隨機。
  - target 是 legendary 時：從 `generalLegendaries()` 抽，有 `slot` 時只抽那個欄位的。地區限定裝備仍然只會在地區掉落，見文末的衝突 5。
  - 特殊物品的 id 加進 `codex`，不重複。
  - 3 件素材物品被移除，新物品放進背包，所以背包一定放得下。

- [ ] **Step 1: 寫失敗的測試**
  - `three commons become one magic item at their floored average level and cost FUSE_GOLD.magic`
  - `three rares become a general legendary; a chosen slot also costs FUSE_SLOT_COST.legendary`
  - `body is never a legendary fusion slot`
  - `mixed rarities, two items, a worn uid or a set piece are refused and nothing changes`
  - Review Focus 1：`fusing with a full bag works: 3 out, 1 in`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): fuse three items into one of the next rarity`

### Task 9: 製作（消耗品、底材、套裝）

**Files:**
- Create：`engine/forge/craft.ts`、`engine/forge/craft.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `CONSUMABLE_RECIPES`、`BASE_RECIPES`、`baseGold`、`CRAFT_MAGIC_CHANCE`、`SET_RECIPE`；Task 5 的工具；`engine/loot/item.ts` 的 `itemLevel`、`rollItem`；`engine/loot/bag.ts` 的 `BAG_SIZE`、`mintUid`。
- Produces：
  - `craftLevel(s: GameState): number`：等於 `itemLevel(max(Object.values(s.dungeon.reached)), 'monster')`。(implementer's call → fixed here)
  - `itemRecipeCost(id: string, qty: number): Cost | null`
  - `craftItem(s: GameState, id: string, qty: number): ForgeResult<{ id: string; qty: number }>`
    - 不是正整數，或沒有這個配方：`invalid`。
    - 付不起：`gold` 或 `mats`。
  - `baseCost(s: GameState, slot: GearSlot): Cost`：`BASE_RECIPES[slot]` 加上 `baseGold(craftLevel(s))`。
  - `craftBase(s: GameState, slot: GearSlot, rng?: Rng): ForgeResult<{ item: ItemInstance }>`
    - 背包已滿：`full`，這項檢查在付費之前。
    - 稀有度：`CRAFT_MAGIC_CHANCE` 的機率是 magic，否則是 common；接著呼叫 `rollItem(rng, { uid, ilvl: craftLevel(s), rarity, slot })`。
  - `setCost(pieceId: string): Cost | null`：不是套裝部件時回傳 null，不丟例外。否則是該套地區的素材 × `SET_RECIPE.regionQty`，加上 `SET_RECIPE.rare` × `rareQty`，加上 `SET_RECIPE.gold`。
  - `craftSet(s: GameState, pieceId: string, rng?: Rng): ForgeResult<{ item: ItemInstance }>`
    - `pieceId` 不是套裝部件：`invalid`；背包已滿：`full`；付不起：`gold` 或 `mats`。
    - 結果用 `rollItem` 產生，`rarity: 'set'`、`special: pieceId`、`ilvl: craftLevel(s)`。
    - 部件 id 與套裝 id 都加進 `codex`，不重複。

- [ ] **Step 1: 寫失敗的測試**
  - `crafting potions takes the recipe times qty and adds to the inventory`：預期值用 `CONSUMABLE_RECIPES.potion` 算。
  - `crafting spends materials but never the shop's sold tally`：
    - 先 `sell` 5 個 thorn-fang，再用 `craftBase` 打造武器；
    - `sold['thorn-fang']` 仍然是 5，`isUnlocked(s, 'thorn-gauntlets')` 的結果不變。
  - `a crafted base is common or magic, in the chosen slot, at craftLevel; magic about CRAFT_MAGIC_CHANCE of the time`：用 2000 個 forgeDraws，容許 4σ。
  - `a set piece costs setCost and enters the codex with its set`
  - `setCost of a non-set id is null and craftSet refuses it as invalid`
  - Review Focus 1：`a full bag refuses craftBase and craftSet and spends nothing`
  - `craftLevel follows the deepest depth reached in any region`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/forge/craft.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): craft consumables, bases and set pieces at the forge`

### Task 10: 鍛造動作的 Game 方法（執行後存檔）

**Files:**
- Modify：
  - `engine/game.ts`、`engine/game.test.ts`（新增測試）
  - `data/text.zh-TW.ts`：`T.ui2.town.toTitle` 的文案，見下方。

**Interfaces:**
- Consumes：Task 5–9 的全部引擎函式與 `ForgeResult`。
- Produces（`Game`）：
  - `dismantle(uids: number[])`
  - `enhance(uid: number)`
  - `reroll(uid: number, index: number, o: RerollOpts)`
  - `fuse(uids: number[], slot?: GearSlot)`
  - `craftItem(id: string, qty: number)`
  - `craftBase(slot: GearSlot)`
  - `craftSet(pieceId: string)`
  - 回傳型別都和對應的引擎函式相同，也就是 `ForgeResult<O>`，失敗原因包含 `'phase'`。
- 共用的私有方法 `forgeAct<O>(run: (s: GameState) => ForgeResult<O>): ForgeResult<O>`：
  - **phase 只在這裡檢查一次**：`phase !== 'town'` 時回傳 `{ ok: false, reason: 'phase' }`，不呼叫 `run`。
  - 成功時寫回 `this.state`，然後立刻 `saveGame`；存檔失敗時，設定 `notice = 'save-failed'`。
  - 七個公開方法都只有一行，例如 `return this.forgeAct((s) => enhance(s, uid))`，不重複檢查 phase。
- 不需要傳 rng，引擎會用 `forgeRng`。
- **存檔的副作用（已接受）**：在城鎮存檔，也會存下上次住旅館之後的其他進度，例如剛帶回的戰利品。旅館的重置配點（5b）已經是這樣。
  - 現在的 `toTitle` 是「要回到標題畫面嗎？上次在旅館存檔之後的進度不會保留。」。有了重置配點與鍛造之後，這句話已經不正確。
  - 改成「要回到標題畫面嗎？上次存檔之後的進度不會保留。」。(implementer's call → fixed here)
  - `town.test.ts` 只斷言包含「標題」，所以不用改。開工前先 `grep -rn "旅館存檔" src/scripts/games/starlantern tests/e2e`，有其他斷言就一起改，並列入 commit。

- [ ] **Step 1: 寫失敗的測試**
  - `game.test.ts`：
    - `each forge action saves at once in town`：用會記錄的 storage，對 7 個方法各跑一次成功的呼叫，每次之後 `loadGame(storage).state` 都等於 `g.state`。
    - `forge actions are refused in the labyrinth with phase and change nothing`：7 個方法都測，`forgeDraws` 與 storage 都不變。
    - `an enhance that cannot fail draws nothing; the step to +6 draws once and survives a reload`：
      - +0 → +1 之後，`forgeDraws` 仍然是 0；
      - 把物品設成 +5，再強化一次：`forgeDraws` 是 1；
      - 讀檔之後 `forgeDraws` 仍然是 1，物品的等級和讀檔前相同；
      - 再強化一次（從 +5 或 +6），`forgeDraws` 是 2。
    - `a failed save leaves the save-failed notice`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/game.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): forge actions go through Game and save at once`

### Task 11: 名稱顯示強化等級，說明顯示鎖定的詞綴

**Files:**
- Modify：
  - `ui2/loot.ts`
  - `engine/compare.ts`：`ItemLine` 新增 `locked?: boolean`。
  - `ui2/scenes/equip.ts`：第 355、374、432 行直接用 `itemName`，所以看不到 +n。
    - 第 355 行（背包格）與第 374 行（人形格）改成 `T.enhanced(short(itemName(it)), it.enhance)`：先截短名稱，再接「 +n」，讓 +n 不會被截掉；
    - 第 432 行（說明的穿著列）改成 `T.enhanced(itemName(worn), worn.enhance)`。
  - `data/text.zh-TW.ts`：`T.enhanced(name, n)`、`T.gear.lockedAffix`。
- Test：
  - `ui2/rarity.test.ts`：新增。
  - `engine/compare.test.ts`：新增。
  - `ui2/scenes/equip.test.ts`：新增。現有的斷言都是 +0 的物品，不會變。

**Interfaces:**
- Produces：
  - `T.enhanced(name: string, n: number)`：`n > 0` 時是 `${name} +${n}`，否則就是 `name`。
  - `gearLabel(it)`：
    - 先把 `itemName(it)` 套上 `T.enhanced(…, it.enhance)`；
    - 其餘不變：普通物品不加稀有度用詞。
    - 例如「鐵劍 +3・魔法」、「皮背心 +1」。
  - `itemLines`：
    - 底材加成那一行，本來就用 `implicitStats`，所以會自動包含強化；
    - `it.locked === i` 的詞綴行，帶 `locked: true`，文字後面接 `T.gear.lockedAffix`「（重鑄鎖定）」。
- `gearLabel` 是共用的，只在 `rarity.test.ts` 測試。用 `gearLabel` 的呼叫端會自動跟著改；`equip.ts` 那三處沒有用 `gearLabel`，所以在 Files 裡另外改。

- [ ] **Step 1: 寫失敗的測試**
  - `rarity.test.ts`：`an enhanced item reads 名稱 +n before its rarity word; +0 reads as before`
  - `equip.test.ts`：`a +3 item reads +3 in its bag cell, its doll slot and the detail`
  - `compare.test.ts`：
    - `the locked affix is marked`
    - `the implicit line of a +5 item shows the enhanced value`：預期值用 `implicitStats` 算。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/rarity.test.ts src/scripts/games/starlantern/engine/compare.test.ts src/scripts/games/starlantern/ui2/scenes/equip.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - 原因：`gearLabel` 的呼叫端很多。現有的物品都是 +0，所以斷言不會變。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): gear names show enhancement and lines mark the locked affix`

### Task 12: 道具店：雜物、一鍵賣出、素材的用途

**Files:**
- Modify：
  - `engine/town.ts`：新增 `sellJunk`。
  - `engine/town.test.ts`：新增。
  - `ui2/scenes/shop.ts`
  - `ui2/scenes/shop.test.ts`：新增。現有測試的庫存裡沒有雜物（已用 grep 確認沒有 `old-coin`），所以不會多出第一列。
  - `data/text.zh-TW.ts`：`T.ui2.shop.sellJunk(n, g)`、`soldJunk(n, g)`、`junkTag`。
  - `src/styles/_starlantern-ui.scss`：`.slx-junk-mat`，灰色文字。

**Interfaces:**
- Consumes：Task 1 的 `MATERIALS[*].kind`、`materialUses`、`T.forge.use`、`T.forge.usedFor`、`T.forge.kind`、`T.forge.junkOnly`。
- Produces：
  - `sellJunk(s: GameState): TownResult`：
    - 賣掉 `inventory` 裡所有 `kind === 'junk'` 的素材，計入 `sold`，和 `sell` 相同；
    - 沒有雜物時回傳 `stock`。
  - 販賣的「素材」頁：
    - 有雜物時，第一列是 `T.ui2.shop.sellJunk(個數, 金額)`「賣出全部雜物（n 個，g G）」。按一下就賣，不跳確認框，因為雜物沒有其他用途。(implementer's call → fixed here)
    - 雜物那幾列：文字是 `${名稱}（雜物）`，`cls` 是 `slx-junk-mat`。
    - 新增 `.slx-info` 說明窗，寫法照 `buyList`。內容依序是：名稱、`T.forge.kind[kind]`、單價，最後一行是：
      - 非雜物：`T.forge.usedFor(materialUses(id).map(T.forge.use).join('、'))`；
      - 雜物：`T.forge.junkOnly`。
- 素材販賣仍然用 `ctx.game.apply`，和現在一樣，不另外存檔。只有鍛造動作需要立刻存檔。

- [ ] **Step 1: 寫失敗的測試**
  - `town.test.ts`：
    - `sellJunk sells only junk and counts it as sold`
    - `sellJunk without junk is refused`
  - `shop.test.ts`：
    - `junk shows grey with 雜物 and one press sells it all`
    - `the material detail lists every use`：發光苔的說明包含 `T.forge.usedFor(materialUses('moss').map(T.forge.use).join('、'))`，也就是回復藥、解毒藥與兩個打造用途。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/town.test.ts src/scripts/games/starlantern/ui2/scenes/shop.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): junk sells in one press and materials say what they are for`

### Task 13: 傳送門卡片的「主要掉落」附上用途

**Files:**
- Modify：`ui2/scenes/gate.ts`、`ui2/scenes/gate.test.ts`、`data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 1 的 `materialUses`、`T.forge.use`、`T.forge.usedFor`。
- `.slx-portal-drop` 的文字不變，所以 `gate.test.ts` 第 42–44 行照舊通過。
- 地區卡片在它下面新增 `.slx-portal-drop-use`，文字是 `T.forge.usedFor(...)`。本道卡片沒有這一行。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `a regional card says what its material is for; the mainline card does not`：
    - 熾焰卡片包含「重鑄時鎖定火焰系詞綴」與「焰紋套裝打造」；
    - `cards()[0]` 沒有 `.slx-portal-drop-use`。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/scenes/gate.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): portal cards say what the region material is for`

### Task 14a: 鍛造屋場景、城鎮入口與頁籤外殼

**Files:**
- Create：`ui2/scenes/forge.ts`、`ui2/scenes/forge.test.ts`
- Modify：
  - `ui2/scenes/facility.ts`：
    - `FacilityId` 新增 `'forge'`；
    - `say(text: string | Rich, mood)`，因為 `Dialogue.say` 本來就接受 `Rich`。
  - `ui2/scene.ts`：`SceneName` 新增 `'forge'`。
  - `ui2/main.ts`：建立 `ForgeScene`。
  - `ui2/scenes/town.ts`：
    - `FACILITIES` 改成 `['guild', 'shop', 'inn', 'gate', 'forge', 'settings']`。鍛造屋放在傳送門廣場之後，這樣 e2e 第 106 行「按兩次下到旅館」不用改。(implementer's call → fixed here)
    - 第 100 行 `pick()` 的 id 白名單加上 `'forge'`。沒有加的話，選鍛造屋只會顯示「製作中」。
  - `render/artPaths.ts`：`art.scene` 與 `art.npc` 的 id 型別加上 `'forge'`。`allArtUrls` 不變。
  - `data/text.zh-TW.ts`：
    - `T.ui2.town.facilities.forge` 是「鍛造屋」；
    - `T.ui2.facility.forge = { place: '鍛造屋', npc: '多蘭', greet: [...] }`，兩句招呼語自己寫；
    - `T.ui2.forge.tabs`：分解、強化、重鑄、合成、製作；`T.ui2.forge.saveFailed`；
    - `T.reasons` 新增 `mats: '素材不足'`、`max: '已經強化到最高了'`、`affixLocked: '這件裝備只能重鑄已鎖定的詞綴'`、`none: '沒有可以換的詞綴'`。
    - **不可以改 `T.reasons.locked`**，它是商店與傳送門的「尚未解鎖」。
  - `src/styles/_starlantern-ui.scss`：`.slx-forge` 的版面，沿用 `.slx-list`、`.slx-info`；新增 `.slx-lack`（文字色）。
- Test：
  - `ui2/scenes/town.test.ts`：
    - 第 16 行的清單改成 `['冒險者公會', '道具店', '旅館', '傳送門廣場', '鍛造屋', '設定']`；
    - 第 28 行的迴圈從 4 次改成 5 次；
    - 新增：`鍛造屋 opens the forge`：`go` 被呼叫，參數是 `'forge'`。

**Interfaces:**
- Consumes：Task 10 的 `ForgeResult` 與 `Game` 的鍛造方法；Task 11 的 `gearLabel`。
- Produces（`ui2/scenes/forge.ts`）：
  - `class ForgeScene extends FacilityScene`：指令是 `dismantle`、`enhance`、`reroll`、`fuse`、`craft`，這五個就是頁籤。在對應的任務完成之前，每個頁籤都顯示 `T.ui2.town.soon`。
  - `interface ForgeHost`：給頁籤用的轉接物件。`FacilityScene` 的 `push`、`pop`、`popAll`、`say`、`stage` 都是 `protected`，所以不能把 `ForgeScene` 本身傳出去。
    - `{ ctx: SceneCtx; layerRoot: HTMLElement; push(l: Layer): void; pop(silent?: boolean): void; popAll(): void; say(text: string | Rich, mood?: 'normal' | 'happy'): Promise<void>; afterAct<O>(r: ForgeResult<O>, okLine: (out: O) => Rich): void }`
    - `layerRoot` 就是 `FacilityScene.stage`。改名是為了不和 `SceneCtx.stage`（Pixi）混淆。
    - `ForgeScene` 用私有方法 `host(): ForgeHost` 產生這個物件，每個函式都是包住 `this` 的箭頭函式。
  - `afterAct`：
    - 成功：`sfx.confirm`，用 `say(okLine(r.out), 'happy')`；
    - 失敗：`this.fail(reason)`；
    - 之後如果 `game.notice === 'save-failed'`：說 `T.ui2.forge.saveFailed`，並清掉 notice。
  - `forgeRows(s: GameState, o: { worn: boolean; filter?: (it: ItemInstance) => boolean; right: (it: ItemInstance) => string }): MenuItem[]`
    - 先列背包；`worn` 為真時，再依 `recruited` 的順序列出身上的裝備。
    - 每一列：
      - `id` 是 `g${uid}`；
      - `label` 是 `gearLabel`，身上的裝備再接 `T.ui2.forge.wornBy(成員名稱)`；
      - `cls` 是 `slx-rarity-${r}`，已標記的再加上 `slx-junk`。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `forge.test.ts`：
    - `forgeRows lists the bag, then worn gear with its wearer, each in its rarity colour`（這個工具只在這裡測）
    - `the forge offers 分解 強化 重鑄 合成 製作 and every tab is reachable by keyboard and by click`
    - `afterAct speaks the ok line, or the reason, and reports a failed save`：用一個假的 `ForgeResult`。
    - `no element carries a style attribute`
  - `town.test.ts`：照 Files 修改。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/scenes/forge.test.ts src/scripts/games/starlantern/ui2/scenes/town.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行 ui2 與 render 測試，確認通過**
  - `npx vitest run src/scripts/games/starlantern/ui2 src/scripts/games/starlantern/render`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): the forge in town with its five tabs`

### Task 14b: 分解頁與「分解全部已標記」

**Files:**
- Modify：`ui2/scenes/forge.ts`、`ui2/scenes/forge.test.ts`、`data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 14a 的 `forgeRows`、`afterAct`；Task 10 的 `Game.dismantle`；Task 5 的 `dismantleYield`。
- **分解頁：**
  - 清單是 `forgeRows(s, { worn: false, right: (it) => T.ui2.forge.yields(dismantleYield([it])) })`，`MenuView` 的 rows 是 12。
  - 背包裡有已標記的物品時，最上面一列是 `T.ui2.forge.dismantleMarked(n)`「分解全部已標記（n 件）」。
    - 這就是 5a「自動分解只做標記」的一鍵分解。(implementer's call → fixed here)
  - 選了之後跳確認框，預設游標在「否」，文字列出會得到的精華。
    - 有傳說、獨特、套裝，或強化 > 0 的物品時，另外加一句 `T.ui2.forge.warnPrecious`。
  - 「是」：呼叫 `game.dismantle(uids)`，再 `afterAct`，成功文字是 `T.ui2.forge.dismantled(精華清單)`。
  - 之後刷新清單；背包空了就關掉這一層。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `dismantling one item asks first, 否 by default, then pays essences and saves`：用會記錄的 storage，確認有存檔。
  - `分解全部已標記 dismantles exactly the marked items and warns about a legendary`
  - `a bag of 15 shows the ▼ scroll cue`
  - `a click on a row and on 是 dismantles too`：用 `click()` 走完整個流程。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/scenes/forge.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): forge dismantle tab with one-press dismantling of marked gear`

### Task 15: 強化頁

**Files:**
- Modify：`ui2/scenes/forge.ts`、`ui2/scenes/forge.test.ts`、`data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 14a 的 `forgeRows`、`afterAct`；Task 6 的 `enhanceCost`、`enhanceChance`；Task 5 的 `findItem`；Task 10 的 `Game.enhance`；5a 的 `compareDelta` 與 `itemLines`。
- Produces：`costText(s: GameState, c: Cost): RichPart[]`
  - 例如「魔法精華 3／5、140 G」：每一項是「名稱 擁有數／需要數」。
  - 不夠的項目加上 `cls: 'slx-lack'`，文字後面接「（不足）」。所以顏色不是唯一的提示。
  - 它是說明窗用的 `Rich`；選單右欄的不足標示在 Task 18 用 `rightClass`。
  - 這個工具只在這裡測。
- **清單**：`forgeRows(s, { worn: true, right: (it) => it.enhance >= ENHANCE_MAX ? T.ui2.forge.maxed : `+${it.enhance}` })`
- **說明窗**（游標移動時更新，這就是確認前的比較）：
  - `gearLabel`；
  - 底材加成：目前 → 下一級，數字用 `implicitStats` 算；
  - 成功率 `T.ui2.forge.chance(pct)`；`chance < 1` 時加上 `T.ui2.forge.failNote`「失敗不會降級，但素材照樣消耗」；
  - 費用 `costText`；
  - 身上穿著的物品，再列出穿戴者的 `compareDelta(m, slot, { ...it, enhance: it.enhance + 1 })`，用 `.slx-up`。
- **確認**：
  - Enter 跳確認框，預設在「否」。
  - 「是」：呼叫 `game.enhance(uid)`。
    - 成功：說 `T.ui2.forge.enhanceOk(label)`，`label` 是新的 `gearLabel`。
    - 失敗：播 `sfx.error`，說 `T.ui2.forge.enhanceFail(label)`，沒有開心的表情。
  - 之後留在清單上，同一列刷新，方便連續強化。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `costText marks what is lacking with words and a class`
  - `the detail compares the base bonus now and at the next level, with chance and cost`
  - `a worn item shows its wearer's gains`
  - `yes on a +0 item makes it +1 and says so; the row reads +1`
  - `a failed +6 attempt plays error, keeps +5 and spends the cost`：先把 `state.forgeDraws` 設成一個會失敗的值，在測試裡用 `forgeRng` 與 `ENHANCE_SUCCESS[5]` 找出來。
  - `a +10 item shows 已達上限 and Enter refuses with the reason`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/scenes/forge.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): forge enhance tab with before-and-after and success or failure feedback`

### Task 16: 重鑄頁

**Files:**
- Modify：`ui2/scenes/forge.ts`、`ui2/scenes/forge.test.ts`、`data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 7 的 `rerollCost`、`rerollRange`、`swapPool`；Task 10 的 `Game.reroll`；Task 15 的 `costText`。
- **流程**（每一層都是 `MenuView`，Esc 回上一層）：
  1. **物品**：`forgeRows(s, { worn: true, filter: (it) => it.affixes.length > 0, right: ... })`。
     - `right` 是鎖定的詞綴名稱，或 `T.ui2.forge.unlocked`「未鎖定」。
  2. **詞綴**：每條詞綴一列，文字是 `T.gear.affix`。
     - 已經鎖定其他詞綴時，那幾列 `disabled`，`note` 是 `T.ui2.forge.lockedOther`。
  3. **方式**：
     - `T.ui2.forge.rerollValue`「重抽數值」；
     - `T.ui2.forge.rerollSwap`「換成其他詞綴」；
     - 每個 `swapPool(it, i, mat)` 不是空的地區素材，各一列 `T.ui2.forge.rerollWith(素材名稱, T.forge.group[region])`。
     - 獨特與套裝物品只有第一列。
     - 每一列的 `right` 是費用摘要。
  4. **說明窗與確認**：
     - 說明窗：目前的值；
       - 重抽數值時，顯示 `rerollRange`「可能的範圍 a–b」；
       - 換詞綴時，列出 `swapPool` 的屬性名稱「可能換成：…」；
       - 再顯示 `costText`；
       - 第一次重鑄時，加上 `T.ui2.forge.lockWarn`「重鑄後，這件裝備以後只能重鑄這條詞綴」。
     - 確認框預設在「否」。
  5. **結果**：說 `T.ui2.forge.rerolled(before, after)`，例如「暴擊率 +3% → 暴擊傷害 +18%」，然後回到詞綴層並刷新。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `the first reroll warns about the lock; afterwards only that affix is selectable`
  - `the value preview shows rerollRange; the swap preview lists swapPool names`
  - `region-material rows appear only where the group has a key left for the slot`
  - `a unique offers only 重抽數值`
  - `yes rerolls, says before and after, and saves`
  - `the whole flow works by click`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): forge reroll tab with the affix lock and region categories`

### Task 17: 合成頁

**Files:**
- Modify：`ui2/scenes/forge.ts`、`ui2/scenes/forge.test.ts`、`data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 8 的 `fuseSlots`、`fuseCost`；Task 10 的 `Game.fuse`。
- **流程：**
  1. **階級**：3 列，`T.ui2.forge.fuseTier(from, to)`，例如「普通 ×3 → 魔法」。
     - `right` 是背包裡這個稀有度的件數；少於 3 件的列 `disabled`。
  2. **挑選**：
     - 第一列是 `T.ui2.forge.fuseGo(n)`「合成（已選 n／3）」，n 不是 3 時 `disabled`。
     - 下面是 `forgeRows(s, { worn: false, filter: 同稀有度, right: 已選 ? T.ui2.forge.picked : '' })`。
     - Enter 或點擊會切換選取；已經選了 3 件時，再選第 4 件會播 `sfx.error`，不會選取。
  3. **欄位**：
     - 第一列是 `T.ui2.forge.randomSlot`「隨機欄位」；
     - 之後每個 `fuseSlots(target)` 各一列；
     - `right` 是 `fuseCost(target, slot)` 的摘要。
  4. **確認**：說明窗寫出結果的稀有度、欄位與物品等級（3 件平均，無條件捨去），以及 `costText`；預設在「否」。
  5. **結果**：說 `T.ui2.forge.fused(gearPart(item))`，並用 `ctx.sfx.loot?.(item.rarity)` 播放音效。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `a tier with fewer than three items is disabled`
  - `picking toggles; a fourth pick is refused; 合成 enables at three`
  - `legendary fusion offers no body slot; a chosen slot shows its extra cost`
  - `yes fuses, names the new item in its rarity colour and plays loot`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): forge fusion tab`

### Task 18: 製作頁

**Files:**
- Create：`ui2/scenes/forgeCraft.ts`
- Modify：
  - `ui2/scenes/forge.ts`：`craft` 指令改呼叫 `openCraft(this.host())`。
  - `ui2/menu.ts`：`MenuItem` 新增 `rightClass?: string`。
  - `ui2/widgets.ts`：`MenuView` 畫右欄時，`class` 是 `slx-right`，有 `rightClass` 時再接上它（第 103 行附近）。
  - `data/text.zh-TW.ts`
- Test：
  - `ui2/widgets.test.ts`：新增 `a row's rightClass is added to its right column, and a row without one keeps plain slx-right`。
  - `ui2/scenes/forge.test.ts`：新增，見下方。

**Interfaces:**
- Consumes：Task 9 的 `itemRecipeCost`、`baseCost`、`setCost`、`craftLevel`；Task 10 的 `Game.craftItem`、`craftBase`、`craftSet`；Task 14a 的 `ForgeHost`；Task 15 的 `costText`；5a 的 `specialLines`、`codexName`。
- Produces（`ui2/scenes/forgeCraft.ts`）：`openCraft(host: ForgeHost): void`。
  - 只拿到 Task 14a 的小型轉接物件 `ForgeHost`，不拿 `ForgeScene` 本身。
  - 放在獨立的檔案，讓 `forge.ts` 不會繼續變大。(implementer's call → fixed here)
- **流程：**
  - 分類：消耗品、底材、套裝。
  - **消耗品**：
    - 每個配方一列，`right` 是單份的費用摘要。
    - Enter 開 `QtyView`，最大值是「付得起的份數」與 99 取小；一份都付不起時，直接說原因。
  - **底材**：
    - 8 個欄位，各一列；
    - 說明窗：`T.ui2.forge.craftLevel(craftLevel(s))`、`T.ui2.forge.magicChance(pct)`、`costText`。
  - **套裝**：
    - 先選套裝（6 套，名稱用 `codexName`），再選部件，部件名稱帶 `.slx-rarity-set`；
    - 說明窗是 `specialLines(pieceId)` 加上 `costText(setCost(pieceId))`。
  - 底材與套裝都要先確認，預設在「否」；結果用 `gearPart` 說出來，並播放 `sfx.loot?.(rarity)`。
  - 素材不夠的列不設成 `disabled`，讓玩家仍然看得到說明。這種列的 `right` 文字後面接「（不足）」，`rightClass` 是 `slx-lack`；按下去才說原因。(implementer's call → fixed here)

- [ ] **Step 1: 寫失敗的測試**
  - `widgets.test.ts`：照 Files 新增。
  - `forge.test.ts`：
    - `three categories; a potion recipe crafts the chosen quantity`
    - `the quantity box stops at what the materials and gold allow`
    - `a base recipe shows craftLevel, the magic chance and its cost`
    - `a set piece crafts after a yes and is named in green`
    - `a lacking recipe stays readable, its right column says 不足 with slx-lack, and Enter refuses with 素材不足`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/widgets.test.ts src/scripts/games/starlantern/ui2/scenes/forge.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行 ui2 全部測試，確認通過**
  - 原因：`MenuItem` 的形狀有變。
  - `npx vitest run src/scripts/games/starlantern/ui2`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): forge crafting tab for consumables, bases and set pieces`

### Task 19: 端對端、全套測試、截圖與審查

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`

- [ ] **Step 1：e2e `the forge enhances, dismantles and crafts, and the save keeps it`**
  - 用 `__starlanternDebug.game` 準備資料：
    - `state.gold = 2000`；
    - `inventory` 放入普通精華 ×20、魔法精華 ×4、moss ×4；
    - 背包放兩件普通物品，uid 用 `g.mintUid()`，並記下來：
      - `keepUid`：沒有標記，`enhance: 5`；
      - `junkUid`：`junk: true`，`enhance: 0`。
  - 城鎮用鍵盤走到「鍛造屋」：往下 4 次再按 Enter。
  - 強化：點 `[data-id=g${keepUid}]`，按「是」。這是 +5 → +6，一定會抽亂數。
    - 對話出現「強化成功」或「強化失敗」其中之一；
    - 記下那一列現在的文字（「+6」或「+5」）；
    - `g.state.forgeDraws` 是 1。
  - 分解：「分解全部已標記（1 件）」→「是」，對話出現「普通精華」；`keepUid` 那件仍然在背包裡。
  - 製作：消耗品 → 回復藥 → 數量 2；回到城鎮後，道具店的購買清單顯示持有數加 2。
  - 重新整理後選「繼續」：
    - `keepUid` 那件的強化等級，和重新整理前記下的相同；
    - `forgeDraws` 仍然是 1，也就是大於 0，而且沒有因為讀檔而重抽。
  - 全程沒有 console error。
- [ ] **Step 2：全套測試與截圖**
  - `npx vitest run --testTimeout=20000`，以及 e2e 全套。
  - 截圖：
    - 鍛造屋的五個頁籤；
    - 分解全部已標記的確認框；
    - 強化的比較與失敗訊息；
    - 重鑄的鎖定提示；
    - 合成的挑選畫面；
    - 製作的套裝說明；
    - 道具店的雜物與素材用途；
    - 傳送門卡片的素材用途。
- [ ] **Step 3：審查**
  - 派一個沒參與開發的 opus 代理，用 `~/.claude/skills/review-pr/SKILL.md` 審查本計畫的 diff，並處理它提出的問題。
- [ ] **Step 4：commit**
  - 訊息：`test(starlantern): forge end-to-end`

---

## 本計畫裁定的 spec 衝突
1. **鑲嵌**：spec 本來就寫「這次不做」，本計畫維持不做。
2. **「稀有素材：傳說物品重鑄專屬特效」做不到。**
   - 傳說特效綁在特殊物品的 id 上（5a 的 `SPECIALS[id].power`）。換掉特效，等於把這件物品變成另一件傳說。
   - **裁定**：重鑄傳說物品的詞綴時，要多付 1 個星燈之淚。特效本身不能重鑄。
3. **「地區素材：提升套裝的品質」這次不做。**
   - 地區素材已經有兩個用途：重鑄鎖定類別、打造套裝。所以「每種素材至少一個用途」的規則仍然成立。
   - 「品質」需要另外一套數值規則，留給之後擴充。
4. **雜物的例子（破布、碎骨、生鏽的鈕扣）沒有新增。**
   - 新增它們需要新的掉落來源，會改變現有的掉落結果與測試。
   - 目前只有古代銀幣（`old-coin`）是雜物，而且沿用原本的名稱，沒有改成「舊硬幣」。
   - 雜物的灰色顯示、一鍵賣出、不需要用途，都是依 `kind` 判斷，以後新增雜物時不用改程式。
5. **合成成傳說時，只會出現通用傳說。** spec §5 規定地區限定裝備只在特定地區掉落，所以合成不能成為取得地區限定裝備的捷徑。套裝的保底路線是「製作」頁的套裝打造。
6. **「+6 以上有失敗機率」的解讀**：從 +5 升到 +6 開始可能失敗，升到 +1～+5 一定成功。
7. **地區素材原本的價格是 0。** 有了用途之後，改成 25 G，讓它也可以賣。
8. **「自動分解：普通／魔法」不在撿取時自動執行。** 5a 已經做成「撿到時自動標記」。本計畫在鍛造屋加上「分解全部已標記」，一次分解。
   - 理由：迷宮裡撿到的物品，全滅時會一起失去；如果在迷宮裡自動分解，精華也得放進冒險背包並計算重量，規則會變複雜。
9. **「鍛造屋的頁籤」**：沿用設施的指令視窗作為五個頁籤（和道具店的購買／販賣相同），不另外做一列橫向頁籤。滑鼠、觸控、鍵盤都已經支援。
10. **底材打造的物品等級**：spec 沒有規定。本計畫用「各地區最深到達深度」的怪物物品等級（`craftLevel`），讓打造的底材跟著進度變強，但仍然只有普通或魔法級。
11. **在鍛造屋存檔，也會存下旅館之後的其他進度。** 旅館的重置配點已經是這樣。本計畫接受這一點，並把回標題的警告改成「上次存檔之後的進度不會保留」（Task 10）。
