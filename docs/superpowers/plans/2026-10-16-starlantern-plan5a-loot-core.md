# 星燈迷宮 計畫 5a：打寶核心（屬性、稀有度、詞綴、掉落、裝備介面）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把固定的 3 格商店裝備，換成會掉落的 9 格「物品實體」。內容包括：
- 主屬性與衍生屬性；
- 六種稀有度，以及通用詞綴池；
- 地區限定的傳說、獨特、套裝；
- 依稀有度變化的掉落光柱；
- 能比較增減的人形裝備頁，以及 60 格的背包。

**Architecture:**
- **屬性分兩層。**
  - 舊的 7 項（`Stats`）照舊是底層。
  - 主屬性與衍生屬性合起來叫 `Sheet`。
  - 角色自然成長的主屬性只顯示、不換算，因為它已經算在舊 7 項裡；只有裝備和套裝給的主屬性會換算。
  - 所以沒穿裝備的隊伍，數值和現在完全一樣。
- **物品是純資料 `ItemInstance`。**
  - 產生、掉落、背包都是 `engine/loot/` 底下的純函式，輸入一定帶著 `Rng`。
  - 迷宮裡和裝備有關的亂數，都從這趟潛入的種子另外衍生，不從 `game.rng` 拿。因此現有種子測試抽到的亂數序列不變。
- **介面沿用 ui2 的 `MenuView`、`win`、`STATUS_TABS`。**
  - 物品沒有圖示（圖示留給 5d），只顯示文字，再依稀有度加上 SCSS 的顏色與外框。
- **相依關係：**
  - `engine/levels.ts` 是最底層的模組。
  - `engine/loot/*` 只依賴 levels、資料檔和 rng，不依賴 `party` 或 `scaling`。
  - `party` 依賴 `loot/item`。

**Tech Stack:** TypeScript、Vitest（happy-dom）、DOM 介面加上 SCSS、Web Audio 合成音效、Playwright e2e。

**Spec:**
- `docs/superpowers/specs/2026-10-16-starlantern-progression-design.md`：§3、§4、§5、§8 的裝備部分、§9。
- 接點：`docs/superpowers/specs/2026-10-16-starlantern-roguelike-dungeon-design.md`：§3.1、§3.3、§3.7。
- 已核定的裁決：`.superpowers/sdd/2026-10-16-starlantern-plan5a-loot-core/progress.md`。

> 沒有以 `src/` 或 `tests/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。

## Global Constraints
- **單元測試**
  - 只能用 `npx vitest run <路徑>`；全套用 `npx vitest run --testTimeout=20000`。
  - 不可以用 `npm run test`，它是 watch 模式，會卡住。
- **e2e**
  - 用 `E2E_PORT=4352 npx playwright test tests/e2e/starlantern --project=chromium`。
  - 這個參數是篩選字串，會對到 `tests/e2e/starlantern.spec.ts`。
  - 不可以用 4321 埠。
- **工具**：本專案沒有 prettier、eslint，也沒有 type-check 腳本，不要去跑。
- **SCSS**：禁止 `!important`；禁止行內樣式，包括 JS 的 `element.style`。
- **換行**：保留每個檔案原本的換行格式（CRLF、LF 或混用）。改檔前先用 `git ls-files --eol <檔案>` 確認。
- **commit**
  - 一律寫出完整路徑，不可以用 `git add -A`。
  - 訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **文案**：繁體中文一律放在 `data/text.zh-TW.ts`。
- **亂數**：一律用帶種子的 `Rng`，也就是 `engine/rng.ts` 的 `mulberry32`。
  - 唯一的例外是 SoundManager 現有的白噪音。
- **平衡**：`engine/balance.test.ts` 的門檻一律不可以放寬。
- **美術**
  - 不可以做假圖示，也不可以用 CSS 形狀畫物品。
  - 光柱是程式效果，已經裁定通過。
  - 新的底材 id 與稀有素材 id，都要加進 `render/artPaths.ts` 裡 `allArtUrls()` 的區域變數 `NO_ICON_YET`，直接在原地編輯。這樣 `artPaths.test.ts` 的 219 與 registry 比對都不會變。
- **存檔**：版本從 3 變成 4，舊檔直接重置。
- **測試修改規則**
  - 某個任務會弄壞的每一個測試檔，都要列在該任務的 Files 裡，並寫明怎麼改。
  - 改動共用資料形狀的任務，驗證步驟一律跑全套。
  - 因為亂數序列改變而受影響的測試，改成斷言行為，不可以寫死新的數字。
- **擲值公式**（全計畫只寫在這裡一次）
  - 數值 = `round(lo + (hi − lo) × f)`，最少是 1。
  - `f = floor + (1 − floor) × u`，其中 `u = rng()`，`floor = ROLL_FLOOR[rarity]`。
  - `[lo, hi] = affixRange(key, ilvl)`，這個範圍已經乘過 `AFFIX_SCALE`。
  - 所有稀有度都用這條公式，包括獨特和套裝。

## Review Focus
1. **背包或負重滿了，裝備絕不能悄悄消失。**
   - 撿不起來時，留在原地並回報 `full`。
   - 倉庫滿 60 格時，卸下裝備和購買都要被拒絕。
   - 測試在 Task 4、Task 5、Task 10。
2. **極深的樓層。** 第 50 層的頭目掉落，物品等級是 202。
   - 詞綴、`sheetOf`、傷害都必須是有限數字。
   - 百分比屬性不能超過上限；減傷最多 75%，閃避最多 50%。
   - 測試在 Task 1、Task 3、Task 7。
3. **兩個戒指格。**
   - 同一個 `uid` 不能戴兩次。
   - 兩格都滿時，換掉玩家指定的那一格。
   - 同一件套裝部件戴兩件，只算 1 件。
   - 測試在 Task 4。
4. **全滅與重複頭目。**
   - 全滅時，這趟撿到的裝備全部失去，也不記入圖鑑。
   - 重複頭目依「地區＋深度」分開計算。
   - 存檔後重讀，頭目擊殺次數仍在。
   - 測試在 Task 5 與 Task 10。
5. **靜音。**
   - 音量是 0 時，不建立任何音訊節點，但光柱照樣出現。
   - fast 模式下光柱不留計時器。
   - 測試在 Task 17。

---

## File Structure
- `engine/levels.ts`（新）：`depthLevel` 等純粹的等級計算，是最底層的模組。
- `engine/stats.ts`（新）：屬性分類、主屬性換算、上限、收益遞減、敵人的深度屬性與補償。
- `data/equipment.ts`：25 件普通底材。
- `data/gear.ts`（新）：稀有度、詞綴池、欄位重量、特效、獨特與套裝，以及查名稱的小工具。
- `engine/loot/item.ts`（新）：物品等級、擲物品、底材加成、物品數值、名稱、重量、賣價。
- `engine/loot/drops.ts`（新）：稀有度權重、各種來源的掉落、地區限定、頭目、稀有素材、迷宮裡的掉落亂數。
- `engine/loot/bag.ts`（新）：背包上限、排序、自動標記。
- `engine/party.ts`：屬性來源改讀物品實體、套裝、特效、戒指的預設格。
- `engine/state.ts`、`engine/save.ts`、`engine/town.ts`：存檔 v4、倉庫、穿脫、買賣。
- `engine/combatant.ts`、`engine/battle.ts`、`engine/skills.ts`、`engine/scaling.ts`：戰鬥中的衍生屬性、敵人的深度屬性、特效。
- `engine/game.ts`、`engine/dungeon/run.ts`、`engine/events.ts`、`data/weights.ts`、`data/materials.ts`：掉落、重量、精英、寶庫、頭目。
- `engine/compare.ts`（新）：換裝比較與物品說明。
- UI：
  - `ui2/scenes/equip.ts`、`statusTabs.ts`、`status.ts`、`shop.ts`、`gate.ts`、`battle.ts`、`dungeon.ts`、`event.ts`；
  - `ui2/lootFx.ts`（新）、`ui2/input.ts`、`ui2/scene.ts`、`audio/SoundManager.ts`；
  - `src/styles/_starlantern-ui.scss`。
- 平衡與 e2e：`engine/sim.ts`、`engine/balance.test.ts`、`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 等級模組與屬性模型

**Files:**
- Create：`engine/levels.ts`、`engine/stats.ts`、`engine/stats.test.ts`
- Modify：
  - `engine/scaling.ts`：把 `depthLevel` 搬到 levels.ts，這裡改成 `export { depthLevel } from './levels'`。
  - `engine/types.ts`
  - `data/characters.ts`
  - `data/data.test.ts`：新增 affinity 的測試。

**Interfaces:**
- Produces（`engine/levels.ts`）：
  - `export const depthLevel = (depth: number): number => 2 + 4 * (depth - 1)`
  - 只 import `./types`，這樣它就是最底層，不會形成循環依賴。
- Produces（`engine/types.ts`）：
  - `export type PrimaryKey = 'str' | 'int' | 'agi' | 'wil'`
  - `export type SecondaryKey`，一共 25 個鍵：
    - 攻擊：`crit`、`critDmg`、`vuln`、`eliteDmg`、`multi`
    - 防禦：`armor`、`evasion`、`block`、`meleeDR`、`rangedDR`
    - 元素：`fireRes`、`iceRes`、`thunderRes`、`fireDmg`、`iceDmg`、`thunderDmg`、`poisonRes`、`sleepRes`
    - 資源：`tpRegen`、`tpCost`、`gauge`、`heal`
    - 其他：`goldFind`、`matFind`、`expBonus`
  - `export type AnyStat = StatKey | PrimaryKey | SecondaryKey`，一共 36 個鍵。
  - `export type Sheet = Record<AnyStat, number>`
  - `CharacterDef` 新增 `affinity: PrimaryKey`。
  - `EnemyDef` 新增 `sec?: Partial<Record<SecondaryKey, number>>`。
  - 百分比屬性存成百分點；`armor`、`evasion`、`tpRegen` 存成點數。
- Produces（`engine/stats.ts`）：
  - `PRIMARY_KEYS`、`SECONDARY_KEYS`
  - `type StatCategory = 'primary' | 'attack' | 'defense' | 'element' | 'resource' | 'other'`
  - `STAT_CATEGORIES: { id: StatCategory; keys: AnyStat[] }[]`
    - primary：str、int、agi、wil
    - attack：atk、mag、crit、critDmg、vuln、eliteDmg、multi、spd
    - defense：hp、def、res、armor、evasion、block、meleeDR、rangedDR
    - element：三種元素的抗性與傷害、poisonRes、sleepRes
    - resource：tp、tpRegen、tpCost、gauge、heal
    - other：goldFind、matFind、expBonus
  - `emptySheet(): Sheet`
  - `naturalPrimary(def: CharacterDef, level: number): Record<PrimaryKey, number>`
  - `convertPrimary(p: Partial<Record<PrimaryKey, number>>, affinity: PrimaryKey): Partial<Sheet>`
  - `PARTY_BASE = { critDmg: 50 }`
  - `CAPS: Partial<Record<SecondaryKey, number>>`、`capSheet(s: Sheet): Sheet`
  - `armorReduction(armor: number, attackerLevel: number): number`
  - `evadeChance(rating: number, attackerLevel: number): number`
  - `enemySecondary(depthLv: number, homeLv: number, trait: RegionDef['trait']): Partial<Record<SecondaryKey, number>>`
  - `compensation(sec: Partial<Record<SecondaryKey, number>>): Partial<Record<StatKey, number>>`

**本任務固定的數值**（以下都是 (implementer's call → fixed here)）：
- **自然主屬性**（只顯示，也用來算負重上限）：
  - 力量 = 基礎加成長的 atk
  - 智力 = mag
  - 敏捷 = spd
  - 意志 = round(tp ÷ 2)
- **換算**（每 1 點；角色的 affinity 那一項乘 1.5）：
  - 力量：atk +1、armor +2
  - 智力：mag +1，三種元素抗性各 +0.5
  - 敏捷：crit +0.2、spd +0.5
  - 意志：tp +1、heal +1
- **affinity**：noel int、chizuru str、liz agi、sylvie agi、scarlet str、selene wil、safira agi、bobby int。
- **上限 CAPS**：
  - crit 60、multi 50、block 50、meleeDR 50、rangedDR 50
  - 三種元素抗性各 75
  - poisonRes 80、sleepRes 80
  - tpCost 50
  - goldFind、matFind、expBonus 各 100
- **收益遞減**：
  - 減傷 = armor ÷ (armor + 50 × 攻擊者等級)，最多 0.75。
  - 閃避 = evasion ÷ (evasion + 50 × 攻擊者等級)，最多 0.5。
- **敵人的深度屬性**：令 `over = max(0, depthLv − homeLv)`。
  - crit = min(15, 0.25 × over)
  - evasion = min(12, 0.2 × over)，這是直接的百分比。
  - 三種元素抗性 = min(30, 0.5 × over)
  - trait 是 `evasive` 時，crit 和 evasion 再各加 5。
- **補償 `compensation`**：
  - hp 乘以 (1 − evasion ÷ 100) × (1 − 0.3 × 元素抗性 ÷ 100)。
  - atk 與 mag 除以 (1 + crit ÷ 100 × 0.5)。

- [ ] **Step 1: 寫失敗的測試**
  - `stats.test.ts`：
    - `natural primaries mirror the old stats and do not convert`：scarlet Lv1 是 `{ str: 13, int: 6, agi: 7, wil: 7 }`。
    - `primaries from gear convert, the affinity at 1.5x`：
      - `convertPrimary({ str: 10 }, 'str')` 等於 `{ atk: 15, armor: 30 }`；
      - affinity 換成 `'int'` 時，等於 `{ atk: 10, armor: 20 }`。
    - `armor and evasion have diminishing returns and caps`：
      - `armorReduction(100, 2)` 等於 0.5；
      - `armorReduction(1e9, 2)` 等於 0.75；
      - armor 依序是 0、100、200、400 時，數值單調上升，而且每一步增加的量越來越少。
    - `enemy secondaries are zero at home and grow with depth level`：
      - `enemySecondary(2, 2, null)` 的每一項都是 0；
      - `enemySecondary(38, 2, null).crit` 等於 9；
      - `enemySecondary(500, 2, 'evasive').crit` 等於 20。
    - `compensation keeps finite multipliers at the caps`。
    - Review Focus 2：`capSheet holds every cap and stays finite at 1e6`。
  - `data.test.ts`：`every character has an affinity`。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/stats.test.ts src/scripts/games/starlantern/data`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - 原因：scaling.ts 的 export 有變。
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): level module and primary/derived stat model`

### Task 2: 裝備資料與 25 件底材

**Files:**
- Create：`data/gear.ts`、`data/gear.test.ts`
- Modify：
  - `data/equipment.ts`、`engine/types.ts`、`render/artPaths.ts`
  - `data/weights.ts`：改用 `SLOT_WEIGHT`。
  - `data/data.test.ts`：底材數量從 15 改成 25，並新增欄位與物品等級的測試。
  - `engine/town.ts`、`engine/save.ts`：改用過渡用的 `legacySlot`。
  - `ui2/scenes/equip.ts`、`ui2/scenes/shop.ts`：同上。
  - `engine/game.test.ts`：第 527 行 `weightOf('moss-charm')` 從 2 改成 3。

**Interfaces:**
- Produces（`engine/types.ts`）：
  - `Rarity = 'common' | 'magic' | 'rare' | 'legendary' | 'unique' | 'set'`
  - `GearSlot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'neck' | 'ring'`
  - `EquipDef` 改成 `{ id; name; slot: GearSlot; ilvl: number; price; bonus: Partial<Stats>; unlock? }`。
  - `ItemInstance { uid: number; base: string; rarity: Rarity; ilvl: number; affixes: { key: AnyStat; value: number }[]; special?: string; enhance: number; junk?: boolean }`
    - `enhance` 一律是 0。
- Produces（`data/equipment.ts`）：
  - `legacySlot(g: GearSlot): 'weapon' | 'armor' | 'accessory'` 是過渡用的工具：
    - weapon 對到 weapon；
    - body、offhand、head、hands、feet 對到 armor；
    - neck、ring 對到 accessory。
  - Task 4 會把它和所有呼叫點一起刪掉。
- Produces（`data/gear.ts`）：
  - `GEAR_SLOTS: GearSlot[]`：順序同上。
  - `RARITIES: Rarity[]`
  - `RARITY_RANK`：common 0、magic 1、rare 2、legendary 3、unique 4、set 5。
  - `AFFIX_COUNT = { magic: [1, 2], rare: [3, 4], legendary: [3, 3] }`
  - `ROLL_FLOOR = { common: 0, magic: 0, rare: 0.25, legendary: 0.5, unique: 0.9, set: 0.75 }`
  - `AFFIX_SCALE = 1`：唯一的全域倍率，只有 Task 18 可以調整。
  - `AffixDef { slots: GearSlot[]; lo: [number, number]; hi: [number, number] }`：括號裡是物品等級 1 與 50 時的值。
  - `AFFIXES: Record<AnyStat, AffixDef>`
  - `affixRange(key, ilvl): [number, number]`
    - 在兩點之間線性內插，超過 50 照同一條線往外延伸；
    - 最後乘上 `AFFIX_SCALE`。
  - `SLOT_WEIGHT: Record<GearSlot, number>`
  - `SkillMod { hits?; target?; powerPct?; element?; hpCost?; turns?; chance?; extra?: Effect[] }`
  - `PowerDef { id; skill: string; text: string; mod: SkillMod }`、`POWERS`
  - `SpecialDef { id; name; rarity: 'legendary' | 'unique' | 'set'; slot: GearSlot; region: RegionId | null; source: 'any' | 'elite' | 'boss'; power?: string; fixed?: AnyStat[]; set?: string; lore: string }`、`SPECIALS`
  - `SetDef { id; name; region: RegionId; pieces: string[]; two: Partial<Sheet>; four: Partial<Sheet> }`、`SETS`
  - `regionSpecials(region: RegionId): SpecialDef[]`：該地區的傳說與獨特，不含套裝部件。
  - `generalLegendaries(): SpecialDef[]`：`region === null` 的傳說，一共 8 件。
  - `codexName(id: string): string`：特殊物品 id 或套裝 id 都可以查名稱。查不到時回傳 id 本身。

**底材**（以下都是 (implementer's call → fixed here)，全部是普通級）：
- 原本的 15 件：id、名稱、加成、價格、解鎖條件都不變，只改欄位並補上物品等級。
  - 武器：wooden-staff、iron-sword、hunter-bow 都是 Lv1；thorn-spear 5；crystal-blade 7；frost-staff 7；star-saber 10。
  - 原本 armor 的改成 body：cloth-robe 1、leather-vest 1、scale-mail 7、dusk-mantle 10。
  - 原本 accessory 的改成 neck：moss-charm 2、bat-earring 3、crystal-pendant 7。
  - gear-ring 改成 ring，物品等級 10。
- 新增 10 件（id／名稱／欄位／物品等級／加成／價格／解鎖）：

| id | 名稱 | 欄位 | 物品等級 | 加成 | 價格 | 解鎖 |
|---|---|---|---|---|---|---|
| wooden-buckler | 木圓盾 | offhand | 1 | def 2 | 30 | — |
| crystal-aegis | 晶盾 | offhand | 8 | def 5、res 3 | 150 | crystal-shell ×4 |
| leather-cap | 皮帽 | head | 1 | def 1、res 1 | 25 | — |
| scale-helm | 鱗盔 | head | 7 | def 4、res 2 | 140 | lizard-scale ×4 |
| cloth-gloves | 布手套 | hands | 1 | atk 1、def 1 | 25 | — |
| thorn-gauntlets | 荊棘臂甲 | hands | 5 | atk 3、def 2 | 100 | thorn-fang ×6 |
| straw-sandals | 草鞋 | feet | 1 | spd 1 | 25 | — |
| bat-boots | 蝠翼靴 | feet | 4 | spd 3、def 1 | 90 | bat-wing ×6 |
| copper-ring | 銅戒 | ring | 1 | hp 8 | 30 | — |
| star-ring | 星紋戒 | ring | 10 | atk 4、mag 4 | 260 | star-stone ×5 |

**欄位重量**：weapon 6、offhand 5、head 4、body 8、hands 4、feet 4、neck 3、ring 3。

**詞綴池**：欄位縮寫是 W 武器、O 副手、H 頭、B 身、G 手、F 腳、N 項鍊、R 戒指。每列寫「Lv1 時的 lo–hi → Lv50 時的 lo–hi」。

| 詞綴 | 欄位 | 數值 |
|---|---|---|
| str、int、agi、wil | 全部 8 個欄位 | 1–2 → 10–18 |
| atk | W G R | 1–2 → 12–20 |
| mag | W O N R | 1–2 → 12–20 |
| hp | O H B F N | 5–10 → 60–110 |
| def | O H B G F | 1–2 → 10–16 |
| res | O H B N | 1–2 → 10–16 |
| spd | G F N | 1–1 → 4–7 |
| tp | O H N R | 2–4 → 12–20 |
| crit | W G N R | 1–2 → 4–7 |
| critDmg | W G R | 5–10 → 20–35 |
| vuln | W N | 3–6 → 10–18 |
| eliteDmg | W O R | 3–6 → 10–18 |
| multi | W G | 2–4 → 6–10 |
| armor | O H B G F | 4–8 → 150–250 |
| evasion | H G F N | 4–8 → 150–250 |
| block | O | 3–6 → 10–16 |
| meleeDR | O B | 2–3 → 6–10 |
| rangedDR | H B | 2–3 → 6–10 |
| 三種元素抗性 | O H B F N R | 3–6 → 12–20 |
| 三種元素傷害 | W N R | 3–6 → 12–20 |
| poisonRes、sleepRes | H F N | 5–10 → 20–35 |
| tpRegen | N R | 1–1 → 2–3 |
| tpCost | H N | 3–5 → 8–12 |
| gauge | B N R | 3–6 → 10–16 |
| heal | W O N | 3–6 → 10–18 |
| goldFind | H N R | 5–10 → 20–35 |
| matFind | G N R | 5–10 → 20–35 |
| expBonus | N R | 2–4 → 6–10 |

**特效 POWERS 與特殊物品 SPECIALS**（名稱都是 spec 的暫定名）：
- **SkillMod 的套用規則**
  - `powerPct` 套用在三種地方：傷害的 power、治療的 power、增益的 pct，結果取整數。
  - `hits`、`target`、`element`、`turns`、`chance` 直接覆寫原值。
  - `hpCost` 用 `??` 判斷，所以 0 也算有效值。
  - `extra` 接在原本效果的後面。
- **8 件通用傳說**（`region: null`、`source: 'any'`）：

| id | 名稱 | 欄位 | 特效 |
|---|---|---|---|
| lg-noel | 群星之戒 | ring | 火之星彈改為打全體，威力 70% |
| lg-chizuru | 雙月槍 | weapon | 橫掃打 2 次，威力 65% |
| lg-liz | 三叉刃 | weapon | 雙刃改為 3 段 |
| lg-sylvie | 破甲箭袋 | offhand | 瞄準射擊額外使目標防禦 −20%，持續 3 回合 |
| lg-scarlet | 挑戰者紋章 | neck | 挑釁額外使自己防禦 +25%，持續 3 回合 |
| lg-selene | 滿月頭冠 | head | 月光改為治療全體，威力 60% |
| lg-safira | 四拍舞靴 | feet | 刃舞改為 4 段 |
| lg-bobby | 長效齒輪手套 | hands | 砲台持續 5 回合 |

- **地區限定**：每個地區 1 件傳說、1 件獨特。獨特物品寫的是固定詞綴。

| 地區 | 物品 | 欄位 | 內容 |
|---|---|---|---|
| 熾焰 | 灼心之劍（傳說） | weapon | 爆炎斬的 HP 消耗變成 0 |
| 熾焰 | 餘燼指環（獨特） | ring | fireDmg、fireRes、atk |
| 霜凍 | 永冬權杖（獨特） | weapon | mag、iceDmg、int |
| 霜凍 | 霜華頸鍊（傳說） | neck | 冰之星彈改為打全體，威力 70% |
| 雷鳴 | 疾雷之弓（傳說） | weapon | 瞄準射擊改為雷屬性，威力 120% |
| 雷鳴 | 迅雷之靴（獨特） | feet | spd、agi、evasion |
| 腐毒 | 瘴氣面具（獨特） | head | poisonRes、hp、armor |
| 腐毒 | 沼語手套（傳說） | hands | 衰弱咒的中毒機率變成 1 |
| 暗影 | 無聲之刃（傳說，source 'elite'） | weapon | 三連刃改為 4 段 |
| 暗影 | 夜鴉披風（獨特） | body | evasion、agi、crit |
| 鋼鐵 | 不破之盾（獨特，source 'boss'） | offhand | block、armor、meleeDR |
| 鋼鐵 | 鐵壁胸甲（傳說） | body | 鐵壁改為作用全體，威力 50% |

  - 物品 id 依序是：`blaze-heart-sword`、`blaze-ember-ring`、`frost-winter-staff`、`frost-bloom-neck`、`storm-thunder-bow`、`storm-swift-boots`、`mire-miasma-mask`、`mire-whisper-gloves`、`shade-silent-blade`、`shade-raven-cloak`、`iron-unbroken-shield`、`iron-bulwark-plate`。
- **套裝**：每套 4 件。
  - 部件 id 是 `${setId}-${slot}`。
  - 部件名稱是「套裝詞幹 + 欄位名詞」。欄位名詞：weapon 之刃、offhand 之盾、head 之冠、body 之鎧、hands 之手甲、feet 之靴、neck 之鍊、ring 之戒。
  - 固定詞綴：weapon 與 body 拿 3 個主題詞綴，其他欄位拿前 2 個。
  - 固定詞綴不受欄位詞綴池的限制。
  - 套裝加成只用百分比和小數值，不會隨物品等級變大。

| 套裝 | 名稱 | 欄位 | 主題詞綴 | 2 件 | 4 件 |
|---|---|---|---|---|---|
| set-blaze | 焰紋套裝 | weapon、body、hands、ring | fireDmg、atk、str | fireDmg +15 | crit +8、fireDmg +20 |
| set-frost | 霜語套裝 | weapon、head、neck、ring | iceDmg、mag、int | iceDmg +15 | tpCost +15、iceRes +20 |
| set-storm | 雷鳴套裝 | weapon、hands、feet、ring | thunderDmg、spd、agi | thunderDmg +15 | multi +12、spd +5 |
| set-mire | 沼行套裝 | head、body、feet、neck | poisonRes、hp、wil | poisonRes +30 | heal +20、tpRegen +2 |
| set-shade | 夜幕套裝 | weapon、head、hands、feet | evasion、crit、agi | crit +6 | critDmg +30、vuln +15 |
| set-iron | 鐵壁套裝 | offhand、head、body、feet | armor、def、str | meleeDR +10 | block +15、rangedDR +10 |

- [ ] **Step 1: 寫失敗的測試**
  - `gear.test.ts`：
    - `each slot's affix pool matches the table exactly`：從 `AFFIXES` 反推每個欄位的鍵集合，和上方詞綴表逐一 `toEqual`。表格在測試裡寫成常數。
    - `affixRange interpolates, extrapolates and scales`：
      - `affixRange('atk', 1)` 等於 `[1 * AFFIX_SCALE, 2 * AFFIX_SCALE]`；
      - 物品等級 50 時是 `[12, 20]` 乘上 `AFFIX_SCALE`；
      - 物品等級 198 時是有限數字，而且大於 50 時的值。
    - `each region has one legendary, one unique and a four-piece set; mainline has none`。
    - `generalLegendaries lists the eight character legendaries`。
    - `every power names a real skill; hpCost 0 is kept`：用 `SKILLS` 檢查技能是否存在。
    - `set pieces cover four distinct slots and point back at their set`。
    - `codexName names specials and sets, and falls back to the id`。
  - `data.test.ts`：
    - 底材數量改成 25；
    - `every base has a known GearSlot and an ilvl >= 1`。
  - `game.test.ts:527`：期望值從 2 改成 3，因為 neck 的重量是 3；第 524 行的總重不變。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/data`
- [ ] **Step 3: 實作**
  - `town.ts` 的 `equip` 和 `unequip`、`save.ts:36` 的欄位檢查、`equip.ts` 的候選清單、`shop.ts` 的 describe，都改用 `legacySlot(EQUIPMENT[id].slot)`。
  - 過渡期間，新欄位的底材會出現在舊的 3 格裡。這是刻意的，Task 4 會移除。
  - 10 個新底材的 id 加進 `NO_ICON_YET`。
- [ ] **Step 4: 執行全套，確認全部通過**
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
  - `town.test.ts:56-61` 用 `'accessory'` 卸下 moss-charm 的測試，因為有 `legacySlot`，維持原樣也會通過。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): gear data — rarities, affix pool, specials, sets and 25 bases`

### Task 3: 擲物品與掉落表

**Files:**
- Create：`engine/loot/item.ts`、`engine/loot/item.test.ts`、`engine/loot/drops.ts`、`engine/loot/drops.test.ts`
- Modify：
  - `data/conditions.ts`
  - `data/materials.ts`
  - `data/data.test.ts`：第 18 行的素材數量從 16 改成 18。
  - `render/artPaths.ts`：把 `star-tear`、`king-scale` 加進 `NO_ICON_YET`。

**Interfaces:**
- Consumes：
  - Task 1：`depthLevel`，只從 `engine/levels.ts` 引入。
  - Task 2：`AFFIXES`、`affixRange`、`AFFIX_COUNT`、`ROLL_FLOOR`、`SPECIALS`、`SETS`、`generalLegendaries`、`regionSpecials`、`SLOT_WEIGHT`、`GEAR_SLOTS`、`EQUIPMENT`。
- Produces（`engine/loot/item.ts`）：
  - `type DropSource = 'monster' | 'chest' | 'elite' | 'vault' | 'boss'`
  - `itemLevel(depth, source)`：等於 `depthLevel(depth)` 加上來源加成。
    - monster 0、chest 0、elite 2、vault 2、boss 4。
    - (implementer's call → fixed here)
  - `baseFor(rng, slot, ilvl): string`：
    - 候選是這個欄位裡 `ilvl` ≤ 物品等級的底材；
    - 取等級最高的 2 件抽一件；只有 1 件就直接用它；
    - 一件都沒有時，用這個欄位等級最低的底材。
  - `rollItem(rng, o: { uid: number; ilvl: number; rarity: Rarity; slot?: GearSlot; base?: string; special?: string }): ItemInstance`
    - 欄位的決定順序：`base` 的欄位 → `special` 的欄位 → `o.slot` → 從 `GEAR_SLOTS` 平均抽。
    - 底材的決定順序：`o.base` → 特殊物品用該欄位等級最高的底材 → `baseFor`。
    - 詞綴：
      - 普通、魔法、稀有、傳說：從該欄位的詞綴池抽，不重複，數量依 `AFFIX_COUNT`。
      - 獨特與套裝：用 `fixed` 裡的鍵。
      - 數值一律用 Global Constraints 的擲值公式。
  - `implicitStats(it): Partial<Stats>`：等於 `round(bonus × (1 + 0.04 × max(0, it.ilvl − base.ilvl)))`。
  - `itemStats(it): Partial<Sheet>`：`implicitStats` 加上所有詞綴。
  - `itemName(it)`、`itemSlot(it): GearSlot`、`itemWeight(it)`（等於 `SLOT_WEIGHT[itemSlot]`）
  - `sellPrice(it)`：`round((10 + 2 × ilvl) × m)`，m 依稀有度如下。(implementer's call → fixed here)
    - common 1、magic 2、rare 4、legendary 10、unique 10、set 8。
- Produces（`engine/loot/drops.ts`）：
  - `type Tier = 'common' | 'magic' | 'rare' | 'legendaryTier'`
  - `rarityWeights(source, depthLv, cond, bossRepeat = false): Record<Tier, number>`
  - `GEAR_CHANCE = { monster: 0.08, chest: 0.35 }`
  - `BOSS_LEGENDARY = { first: 0.2, repeat: 0.1 }`
  - `DropCtx { uid: () => number; depth; region; condition; source; bossRepeat? }`
  - `rollGear(rng, ctx): ItemInstance`
  - `rollBossGear(rng, ctx): ItemInstance[]`
    - 回傳 2 件：第 1 件用 boss 權重，第 2 件用 elite 權重。
  - `RARE_MATERIALS = ['star-tear', 'ancient-gear', 'king-scale']`、`rollRareMaterial(rng)`
- `data/conditions.ts`：新增 `rarityMul`，bounty 1.5、fierce 1.25，其他都是 1。(implementer's call → fixed here)
- `data/materials.ts`：新增 `star-tear` 星燈之淚（80 G）、`king-scale` 王者之鱗（100 G）。

**稀有度權重**（L 是深度等級，c 是 `rarityMul`；(implementer's call → fixed here)）：
- **monster**：
  - common 70
  - magic 24 × (1 + L/40)
  - rare 5.5 × (1 + L/20) × c
  - legendaryTier 0.5 × (1 + L/20) × c
- **chest**：同 monster，但 rare 與 legendaryTier 再乘 1.5。
- **elite**：common 0；rare 與 legendaryTier 再乘 3。
- **vault**：common 0、magic 0；legendaryTier 再乘 3。
- **boss**：common 0、magic 0、rare 1 − p、legendaryTier p。
  - p 是 `BOSS_LEGENDARY.first`；`bossRepeat` 時改用 `.repeat`。
  - 頭目權重不受深度和本次狀況影響。
- **抽到 legendaryTier 之後：**
  - mainline：從 `generalLegendaries()` 抽。
  - 隨機地區：
    - 50% 傳說：其中 40% 是地區傳說，60% 是通用傳說；
    - 25% 地區獨特；
    - 25% 地區套裝的隨機部件。
  - `source` 不符合時，改成通用傳說。`'elite'` 的物品，精英和頭目都可以掉。

- [ ] **Step 1: 寫失敗的測試**
  - `item.test.ts`：
    - `same seed, same item`。
    - `affix counts follow the rarity`：每種稀有度跑 500 個種子。
    - `random affixes stay in their slot pool and never repeat`：只測 common、magic、rare、legendary 這四種，跑 2000 個種子。
    - `uniques and set pieces carry exactly their fixed affixes`：用 `SPECIALS[id].fixed` 和套裝的主題比對。
    - `values follow the roll formula`：
      - 每個值都在 `[round(lo + (hi − lo) × floor), round(hi)]` 之間；
      - 獨特與套裝的值也要 ≥ floor 那一點，證明 `ROLL_FLOOR` 有作用。
    - `rare averages above magic`。
    - `base option picks that base`。
    - `baseFor with no fitting base takes the lowest`：neck、物品等級 1，得到 `moss-charm`。
    - `baseFor with exactly one candidate takes it`：offhand、物品等級 3，得到 `wooden-buckler`。
    - `implicit grows with item level`：物品等級 42 的 star-saber，`implicitStats` 的 atk 等於 34。
    - Review Focus 2：`itemLevel(50, 'boss') is 202 and its items are finite integers`。
  - `drops.test.ts`：機率檢驗用 N = 20000，容許誤差 4σ。
    - `monster rarity matches rarityWeights at depth 1 and 10`。
    - `deeper, elite and bounty raise rare odds`。
    - `elites never common; vaults and bosses never below rare`。
    - `a repeat boss halves the legendary-tier chance`：約 0.2 和 0.1。
    - `region-only gear never drops in the mainline`：只會出現 `lg-*`。
    - `boss-only gear drops only from bosses`。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/loot src/scripts/games/starlantern/data`
- [ ] **Step 3: 實作**
  - `item.ts` 不可以 import `scaling.ts` 或 `party.ts`。
- [ ] **Step 4: 執行，確認通過**
  - 同一個指令，外加 `npx vitest run src/scripts/games/starlantern/render`。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): seeded item rolls and drop tables`

### Task 4: 角色改穿物品實體，倉庫與 9 個欄位（原 4a）

這次是一次性的資料形狀翻轉，所以會一起改到所有讀寫 `Member.equip` 的地方。其他狀態欄位，以及城鎮的買賣，留到 Task 5 與 Task 6。

**Files:**
- Create：`engine/loot/bag.ts`、`engine/loot/bag.test.ts`
- Modify：
  - `engine/types.ts`、`engine/party.ts`、`engine/party.test.ts`
  - `engine/state.ts`：只加 `bag`、`nextUid`，並把 `SAVE_VERSION` 改成 4。
  - `engine/save.ts`、`engine/save.test.ts`：驗證裝備與背包。
  - `engine/town.ts`、`engine/town.test.ts`：`equip`、`unequip`、`mintUid`。
  - `data/equipment.ts`：刪掉 `legacySlot`。
  - 讀取端的最小改動：
    - `ui2/scenes/statusTabs.ts`：裝備分頁改用 `itemName`、`itemStats`。
    - `ui2/scenes/equip.ts`：候選清單改從 `bag` 取，`wear` 改用 uid。
    - `ui2/scenes/shop.ts`：describe 改用 `statsOf` 加上一件暫時的普通實體。
  - 測試夾具：
    - `ui2/scenes/equip.test.ts`、`ui2/scenes/status.test.ts`、`ui2/scenes/guild.test.ts`：把「放進 `inventory`」改成「在 `bag` 放一件實體」。
    - 斷言 `equip.weapon === 'iron-sword'` 的地方，改成 `equip.weapon?.base === 'iron-sword'`。
  - `data/text.zh-TW.ts`：`T.slot` 改成 9 格。

**Interfaces:**
- Consumes：Task 1 的 `naturalPrimary`、`convertPrimary`、`capSheet`、`emptySheet`、`PARTY_BASE`；Task 3 的 `rollItem`、`itemStats`、`itemSlot`；Task 2 的 `SETS`、`SPECIALS`、`RARITY_RANK`、`GEAR_SLOTS`。
- Produces（`engine/types.ts`）：
  - `Slot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'neck' | 'ring1' | 'ring2'`
  - `Member.equip: Partial<Record<Slot, ItemInstance>>`
- Produces（`engine/party.ts`）：
  - `SLOTS: Slot[]`
  - `slotsFor(g: GearSlot): Slot[]`
  - `defaultSlotFor(m: Member, it: ItemInstance): Slot`
    - 戒指規則只寫在這裡一個地方：先放第一個空的戒指格；兩格都滿時放 ring1。
    - 其他物品就放自己的欄位。
  - `type StatSource = 'base' | 'growth' | 'gear' | 'set' | 'primary'`
  - `statSources(m): { source: StatSource; stats: Partial<Sheet> }[]`
    - base 包含 `PARTY_BASE` 與自然主屬性。
  - `sheetOf(m): Sheet`：加總所有來源後再套用 `capSheet`。
  - `statsOf(m): Stats`：簽名不變，改成從 `sheetOf` 取值，整數一律無條件捨去。
  - `setCounts(m): Record<string, number>`：同一個 `special` 只算 1 件。
  - `powersOf(m): string[]`
- Produces（`engine/loot/bag.ts`）：
  - `BAG_SIZE = 60`
  - `type AutoJunk = 'off' | 'common' | 'magic'`
  - `sortBag(bag, by: 'rarity' | 'slot' | 'ilvl')`：穩定排序。
    - slot 依 `GEAR_SLOTS` 的順序；rarity 和 ilvl 都由高到低。
  - `applyAutoJunk(it, mode)`：傳說、獨特、套裝永遠不會被標記。
- Produces（`engine/state.ts`）：`GameState` 新增 `bag: ItemInstance[]`、`nextUid: number`。
  - 背包只放裝備；素材和消耗品照舊放在 `inventory`。(implementer's call → fixed here)
- Produces（`engine/town.ts`）：
  - `TownResult` 的失敗原因新增 `'full'`。
  - `mintUid(s): number`：回傳目前的 `s.nextUid`，然後把它加 1。
  - `equip(s, memberId, uid: number, slot?: Slot): TownResult`
    - 物品從 `bag` 取出；沒有指定 `slot` 時用 `defaultSlotFor`；換下的物品放回 `bag`。
    - 欄位不合時回傳 `'invalid'`。
  - `unequip(s, memberId, slot)`：背包滿時回傳 `'full'`。
- `ui/dom.ts` 的 `itemName(id: string)` 不改。同一個檔案同時需要兩種名稱時，把 loot 的 `itemName` import 成 `gearName`。

- [ ] **Step 1: 寫失敗的測試**
  - `party.test.ts`：
    - 第 13、23 行改成穿一件 iron-sword 的普通實體，期望值不變（13 + 4）。
    - `no gear means the same numbers as before`：對每位角色，在 Lv1 與 Lv20 都成立。
    - `gear primaries convert and show as their own source`。
    - `two pieces give the two-piece bonus, four give both`。
    - Review Focus 3：`the same set piece twice counts once`。
    - `defaultSlotFor fills the first empty ring slot, then ring1`。
  - `bag.test.ts`：`sorts by rarity, slot and item level, stable`、`auto junk never marks legendary, unique or set`。
  - `town.test.ts`：
    - 第 50–61 行改寫：用 `bag` 裡的 moss-charm 實體，`unequip(..., 'neck')`；HP 被壓回上限的期望值（48）不變。
    - `equip swaps through the bag; rings use defaultSlotFor unless a slot is given`。
    - Review Focus 3：`one uid cannot be worn twice`。
    - Review Focus 1：`a full bag refuses unequip`。
  - `save.test.ts`：
    - `rejects a duplicate uid, an unknown base, an unknown affix key, a ring in the weapon slot, a bag over 60, and nextUid not above every uid`；
    - `a version-3 save reports version`。
  - UI 測試：照 Files 的說明修改夾具，現有斷言一條都不刪。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
  - 再執行 `git grep -n -e "'accessory'" -e legacySlot -- src/scripts/games/starlantern`，結果必須是空的。
  - 注意：`'armor'` 現在是屬性鍵，不在這次檢查的範圍內。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): members wear item instances in nine slots, bag of 60`

### Task 5: 存檔 v4 的其餘欄位，以及城鎮的買賣（原 4b）

**Files:**
- Modify：`engine/state.ts`、`engine/save.ts`、`engine/save.test.ts`、`engine/town.ts`、`engine/town.test.ts`

**Interfaces:**
- Consumes：Task 3 的 `rollItem`（帶 `base`）、`sellPrice`；Task 4 的 `mintUid`、`BAG_SIZE`、`sortBag`、`AutoJunk`。
- Produces：
  - `GameState` 新增 `codex: string[]`、`autoJunk: AutoJunk`；`DungeonProgress` 新增 `bossKills: Record<string, number>`，鍵的格式是 `${region}:${depth}`。
  - `buy(s, id)`：
    - id 是底材時，呼叫 `rollItem(rng, { uid: mintUid(n), ilvl: EQUIPMENT[id].ilvl, rarity: 'common', base: id })`，結果放進 `bag`。
    - 普通級不會擲詞綴，所以 rng 傳 `mulberry32(0)` 即可。
    - 背包滿時回傳 `'full'`。
  - `sellGear(s, uids: number[])`：賣價依 `sellPrice`。賣掉的裝備不計入 `sold`。
  - `toggleJunk(s, uid)`、`setAutoJunk(s, mode)`、`sortBagIn(s, by)`：回傳型別都是 `TownResult`。
- 存檔驗證：`codex` 裡的每一項都要能被 `codexName` 查到；`bossKills` 是計數；`autoJunk` 必須是三個合法值之一。

- [ ] **Step 1: 寫失敗的測試**
  - `save.test.ts`：
    - Review Focus 4：`round-trips codex, auto junk and boss kills`。這個「存讀後擊殺次數仍在」的測試只在這裡寫一次。
    - `rejects an unknown codex id, a negative boss kill count, a bad auto-junk mode`。
  - `town.test.ts`：
    - `buying a base puts a common item of that base and level in the bag`。
    - Review Focus 1：`a full bag refuses buying`。
    - `selling gear pays sellPrice and does not count toward unlocks`。
    - `junk toggles; sorting reorders the bag`。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/save.test.ts src/scripts/games/starlantern/engine/town.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - 原因：`GameState` 的形狀有變。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): save v4 with codex, boss kills and junk; buy and sell gear`

### Task 6: 介面跟上新的資料形狀（原 4c）

**Files:**
- Modify：
  - `ui2/scenes/shop.ts`、`ui2/scenes/shop.test.ts`
  - `ui2/scenes/statusTabs.ts`、`ui2/scenes/status.test.ts`
  - `ui2/scenes/equip.ts`、`ui2/scenes/equip.test.ts`
  - `data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 5 的 `buy`、`'full'`；Task 4 的 `SLOTS`、`defaultSlotFor`、`equip`。
- 商店：
  - 買底材後放進 `bag`。
  - 失敗原因是 `'full'` 時，說「背包已滿（60 件）」。
  - 購買數量的上限，同時受金幣和背包剩餘格數限制。
- 狀態頁的裝備分頁：照 `SLOTS` 列出 9 格，名稱加上 `.slx-rarity-${r}`。
- 裝備頁（保持舊的版面）：
  - 候選清單是 `bag` 裡符合所選欄位的物品；
  - 選戒指格時，穿到玩家選的那一格。
  - 新版面留到 Task 14。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `shop.test.ts`：
    - `buying a base adds it to the bag and the full bag is announced`；
    - `the quantity box caps at the free bag slots`。
  - `status.test.ts`：`the gear page lists nine slots with rarity classes`。
  - `equip.test.ts`：`a ring goes to the chosen ring slot`。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行 ui2 測試，確認通過**
  - `npx vitest run src/scripts/games/starlantern/ui2`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): shop, sheet and equip screens read the bag`

### Task 7: 戰鬥傷害公式（原 5a）

**Files:**
- Modify：
  - `engine/combatant.ts`、`engine/combatant.test.ts`
  - `engine/battle.ts`、`engine/battle.test.ts`
  - `engine/skills.ts`
  - `engine/testing.ts`
  - `ui2/battleText.ts`、`ui2/battleText.test.ts`
  - `data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 1 的 `armorReduction`、`evadeChance`；Task 4 的 `sheetOf`、`powersOf`；`scaling.ts` 的 `homeLevel`。
- Produces：
  - `Combatant` 新增 `x: Partial<Record<SecondaryKey, number>>`、`level: number`、`powers: string[]`。
  - `battle.ts` 裡建立戰鬥單位的私有函式：
    - `fromMember(m, cell)`：`level = m.level`；`x` 取自 `sheetOf(m)` 的衍生屬性；`powers = powersOf(m)`。
    - `fromEnemy(d, key, name, tint, level)`：`x` 取自 `d.sec ?? {}`；`powers` 是空陣列。
    - 敵人等級由 `createBattle` 傳入：有 `sc` 時是 `depthLevel(sc.depth)`，否則是 `homeLevel(d)`。
  - `engine/testing.ts` 的 `makeCombatant` 預設 `x: {}`、`level: 1`、`powers: []`。
  - `calcDamage(a, t, spec, rng)` 回傳 `{ amount; mult; crit: boolean; miss: boolean }`。
  - `BattleEvent`：damage 事件新增 `crit?: boolean`；另外新增 `{ type: 'miss'; target: string }`。
  - `applyEffect`：命中失敗時記錄 `miss`；`multi` 有機率多打 1 段，只對 `hits` 是 1 或沒寫的效果。
- **calcDamage 的順序：**
  1. 閃避：隊員用 `evadeChance(t.x.evasion, a.level)`；敵人用 `t.x.evasion ÷ 100`。
  2. 原本的基礎傷害與弱點／抗性倍率。
  3. 元素加成：攻擊方的 `${el}Dmg`、受擊方的 `${el}Res`；phys 兩者都不吃。
  4. `vuln`：只在打中弱點時生效。
  5. `eliteDmg`：目標是 boss，或是 `tint === 'elite'`。
  6. 暴擊：機率是 `crit ÷ 100`，傷害乘以 (1 + critDmg ÷ 100)；敵人一律用 50。
  7. 物理傷害吃 `armorReduction(t.x.armor, a.level)`。
  8. 物理傷害吃格擋：機率是 `block ÷ 100`，擋下時減半。
  9. 近戰吃 `meleeDR`，其他吃 `rangedDR`。
  10. 最後套用原本的防禦減半。
- **亂數規則**：只有在機率 > 0 時才抽亂數。因此沒有這些屬性的戰鬥，抽到的序列和現在完全相同。

- [ ] **Step 1: 寫失敗的測試**
  - `combatant.test.ts`：
    - `zero secondaries consume exactly one random number, as before`：用一個會計數的 rng 確認。
    - `crit multiplies by 1 + critDmg`。
    - `an evaded hit deals nothing and logs miss`。
    - `armor only reduces physical damage, with diminishing returns`。
    - `fire bonus and resistance multiply; physical ignores both`。
    - `vuln only on weakness hits; eliteDmg only on elites and bosses`。
    - Review Focus 2：`damage stays finite with capped stats at level 198`。
  - `battle.test.ts`：
    - `members fight with their sheet's secondaries and level; enemies with the fight's depth level`。
    - `multi adds one hit only to single-hit effects`。
  - `battleText.test.ts`：`a crit and a miss are worded`。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine src/scripts/games/starlantern/ui2/battleText.test.ts`
- [ ] **Step 3: 實作**
  - 新增文案：
    - `T.log.miss(who)`：「${who} 閃過了攻擊」
    - `T.log.crit`：「（暴擊）」
- [ ] **Step 4: 執行全套，確認全部通過**
  - `balance.test.ts` 第 1–9 項的數字不可以變：沒穿裝備時，不會多抽亂數。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): crits, evasion, armor, block and elemental modifiers in damage`

### Task 8: 敵人的深度屬性與補償（原 5b）

**Files:**
- Modify：`engine/scaling.ts`、`engine/scaling.test.ts`、`engine/balance.test.ts`（只執行，不修改）

**Interfaces:**
- Consumes：Task 1 的 `enemySecondary`、`compensation`。
- Produces：
  - `scaleEnemy` 回傳的 `EnemyDef` 帶上 `sec`。
  - 能力值在原本的倍率之後，再乘上 `compensation(sec)`。
  - 刪除 `TRAIT.evasive`（spd ×1.15 的替代品）以及它的說明註解，因為現在已經有真正的閃避與暴擊。
- **對平衡的影響**：
  - 暗影地區的怪少了 15% 速度，多了 evasion +5 與 crit +5。這兩項會被補償，所以 HP 和攻擊會略低。
  - 整體可能稍微變簡單。第 7 項暗影的 hpLoss 下限 0.1 是需要觀察的點。

- [ ] **Step 1: 寫失敗的測試**
  - `scaling.test.ts`：
    - `depth 1 mainline enemies are unchanged`：保留現有測試，並加上「`sec` 每一項都是 0」。
    - `a depth 10 wolf has crit 9 and compensated hp`：
      - hp 等於 `round(舊 hp × (1 − 0.072) × (1 − 0.3 × 0.18))`；
      - 舊 hp 是現在 `scaleEnemy` 在第 10 層的結果，在測試裡先計算出來。
    - `shade monsters gain evasion and crit instead of the old speed stand-in`。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/scaling.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - `balance.test.ts` 第 1–9 項必須全部通過，門檻不可以放寬。
  - 第 7、8 項如果因為雜訊或暗影的變化掉出範圍，只能調 `compensation` 裡的 0.3 和 0.5。調整後的值要寫在 commit 訊息裡。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): deep enemies crit, evade and resist, compensated`

### Task 9: 傳說特效、其他戰鬥鉤子，以及戰鬥畫面與模擬改讀實際技能（原 5c）

**Files:**
- Modify：
  - `engine/skills.ts`、`engine/skills.test.ts`
  - `engine/battle.ts`、`engine/battle.test.ts`
  - `engine/sim.ts`
  - `ui2/scenes/battle.ts`、`ui2/scenes/battle.test.ts`

**Interfaces:**
- Consumes：Task 2 的 `POWERS`、`SkillMod`；Task 7 的 `Combatant.powers`、`x`。
- Produces：
  - `patchSkill(def: SkillDef, mod: SkillMod): SkillDef`，放在 `engine/skills.ts`。
  - `skillFor(c: Combatant, id: string): SkillDef`，放在 `engine/battle.ts`：依序套上這個角色身上、指向這個技能的特效。
  - `skillCost(c: Combatant, id: string): number`，放在 `engine/battle.ts`：
    - 計算 `ceil(tp × (1 − tpCost ÷ 100))`；
    - 原本 TP > 0 的技能，最少要 1。
  - `perform` 的 skill 分支改用 `skillFor` 和 `skillCost`。
  - `ui2/scenes/battle.ts` 第 174、181 行，以及 `engine/sim.ts` 的 `choose()`，目標與 TP 都改讀 `skillFor` 和 `skillCost`，不再直接讀 `SKILLS`。
  - 其他鉤子：
    - `tpRegen`：每回合結束時回復 TP。
    - `gauge`：每次累積的絕技量表乘以 (1 + gauge ÷ 100)，結果無條件捨去。
    - `heal`：治療量乘以 (1 + heal ÷ 100)。
    - `poisonRes`、`sleepRes`：中毒、睡眠機率乘以 (1 − res ÷ 100)。
  - `rewards(s, rng, dropBoost, dropMul)` 簽名不變。在函式內加總存活隊員的 goldFind、matFind、expBonus，每項最多 100：
    - 金幣與經驗乘以 (1 + 加總 ÷ 100)，四捨五入；
    - 素材機率乘以 (1 + matFind ÷ 100)。

- [ ] **Step 1: 寫失敗的測試**
  - `skills.test.ts`：
    - `patchSkill applies every SkillMod field; hpCost 0 is kept`。
    - `a member wearing 雙月槍 sweeps twice at power 52`。
  - `battle.test.ts`：
    - `tpRegen restores TP at the end of the round`。
    - `tpCost lowers the cost but never to zero`。
    - `gold and exp find raise rewards`。
    - `sleep resistance lowers the chance`：用 `constRng`，觀察結果是否跨過門檻。
  - `ui2/scenes/battle.test.ts`：
    - `a legendary that makes 月光 hit all allies skips the target pick`。
    - `the skill list shows the reduced TP cost and greys by it`。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine src/scripts/games/starlantern/ui2/scenes/battle.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): legendary powers and resource hooks, read by screen and sim`

### Task 10: 掉落接進迷宮（引擎，原 6a）

**Files:**
- Modify：
  - `engine/game.ts`、`engine/game.test.ts`
  - `engine/dungeon/run.ts`、`engine/dungeon/run.test.ts`
  - `engine/events.ts`、`engine/events.test.ts`
  - `engine/loot/drops.ts`：`lootRng` 與 `chestHasGear` 放在這裡。
  - `data/weights.ts`
  - `ui2/scenes/event.test.ts`：
    - 第 161 行改成斷言 `RARE_MATERIALS` 裡有某一項 ≥ 1；
    - 第 205–222 行改用 `chestHasGear` 為假的寶箱，其餘斷言不變。

**Interfaces:**
- Consumes：Task 3 的 `rollGear`、`rollBossGear`、`rollRareMaterial`、`GEAR_CHANCE`、`itemWeight`；Task 4 的 `BAG_SIZE`、`applyAutoJunk`、`mintUid`、`sheetOf`；Task 5 的 `codex`、`bossKills`、`autoJunk`。
- Produces：
  - `Run` 的變動：
    - `loot` 新增 `gear: ItemInstance[]`；
    - 新增 `gearRolls: Record<string, ItemInstance | null>`：寶箱和寶庫的裝備，第一次擲出後就固定；
    - 新增 `lootDraws: number`。
  - `lootRng(run: Run): Rng`，放在 `engine/loot/drops.ts`：
    - 回傳 `mulberry32(hash(run.seed, run.lootDraws++))`；
    - 迷宮裡所有與裝備有關的亂數都從這裡拿，不碰 `game.rng`。
  - `chestHasGear(run: Run, depth: number, at: Pos): boolean`：
    - 依「種子＋深度＋座標」雜湊，對 `GEAR_CHANCE.chest` 做判斷；
    - 純函式，不會改變任何狀態。
  - `BattleEnd` 新增 `gear: ItemInstance[]`、`gearLeft: ItemInstance[]`。
  - `MoveResult` 的變動：
    - `chest` 新增 `gear?: ItemInstance`；
    - `vault` 新增 `gear: ItemInstance[]`；
    - `full` 新增 `gear?: ItemInstance` 與 `bag?: boolean`。
  - `Game.discardGear(uid): boolean`。
  - `Game.mintUid(): number`：包裝 `mintUid(this.state)`，給 e2e 的除錯介面使用。
  - `data/weights.ts`：
    - `capacity(party)` = 40 + 上陣成員的 `sheetOf(m).str` 合計 × 0.5。
    - `carried(state, run)` 加上冒險背包裡裝備的 `itemWeight` 合計。身上穿著的裝備不計入。
    - `weightOf(id)` 刪掉讀 `EQUIPMENT` 的那個分支。
  - 「放得下」的條件：沒有超重，而且 `bag.length + run.loot.gear.length < BAG_SIZE`。
- **規則：**
  - 一般戰鬥：每打倒 1 隻怪，有 `GEAR_CHANCE.monster` 的機率掉一件，來源是 monster。
  - 精英：必掉 1 件來源是 elite 的裝備，再加 1 個 `rollRareMaterial`。完成後刪掉 `game.ts:343` 的 TODO。
  - 頭目：
    - 呼叫 `rollBossGear`，`bossRepeat = bossKills[key] > 0`，然後把 `bossKills[key]` 加 1；
    - 本道第 3 層的劇情頭目也要計數。
  - 寶箱：
    - 素材照舊從 `rollChest` / `run.rolls` 來，維持原樣；
    - `chestHasGear` 為真時，另外加一件來源是 chest 的裝備，存在 `gearRolls`；
    - 是否放得下，要把素材重量和 `itemWeight` 加在一起算。
  - 寶庫：
    - 素材部分是 `rollChest` 的 3 倍，只有素材乘 3；
    - 刪掉 `VAULT_PLACEHOLDER`，改給 1 個稀有素材，再加 1 件來源是 vault 的裝備；
    - 同時刪掉 `events.ts:51-53` 與 `game.ts:262` 的 TODO。
  - 撿起來的裝備，套用 `applyAutoJunk(it, state.autoJunk)`。
  - `toTown`：
    - 判斷要不要入庫時，`loot.gear` 也要算進去；
    - 裝備併入 `bag`；
    - 特殊物品的 id 與套裝 id 加進 `codex`，不重複；
    - `banked` 新增 `gear` 欄位。
  - 全滅：裝備也一起失去，`codex` 不變。

- [ ] **Step 1: 寫失敗的測試，並更新被影響的測試**
  - `game.test.ts`：
    - 第 148–160、418、474–478、503–509 行：原本斷言寶箱精確結果的測試，改成挑一個 `chestHasGear` 為假的寶箱，斷言內容不變。
    - 第 520–528 行改寫：冒險背包的裝備放進 `run.loot.gear`，各件重量用 `itemWeight` 計算。
    - `an elite always drops magic-or-better gear and one rare material`。
    - `a boss drops rare-or-better; the same region and depth again passes bossRepeat`。
    - `a chest with gear gives its materials and the item; weight counts both`。
    - `a vault triples materials only and adds a rare material and a rare-or-better item`。
    - `gear waits in the run pack and is banked, specials and sets into the codex`。
    - `a gear-only run still banks`。
    - Review Focus 4：`a wipe loses run gear and leaves the codex untouched`。
    - Review Focus 1：`a full bag (60 with the run pack) keeps the chest shut and reports full with bag: true; discarding makes room`。
    - `capacity rises by 5 when a member wears str +10`。這個測試在 capacity 還讀 atk 時會失敗。
    - `gear randomness does not touch game.rng`：開箱前後各取一次 `game.rng()`，和對照組相同。
  - `events.test.ts` 第 215–226 行：改成斷言「素材 = 寶箱的 3 倍」、「恰好 1 個 `RARE_MATERIALS` 裡的素材」、「`gear` 有一件稀有以上」。
  - `run.test.ts`：`lootRng advances and is reproducible from the seed`；`chestHasGear is pure and hits about 35% over 2000 spots`。
  - `ui2/scenes/event.test.ts`：照 Files 的說明修改。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): monsters, chests, elites, vaults and bosses drop gear`

### Task 11: 掉落顯示在畫面上（介面，原 6b）

**Files:**
- Modify：
  - `ui2/scenes/battle.ts`、`ui2/scenes/battle.test.ts`
  - `ui2/scenes/dungeon.ts`、`ui2/scenes/dungeon.test.ts`
  - `ui2/scenes/event.ts`、`ui2/scenes/event.test.ts`
  - `data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 10 的 `BattleEnd.gear` / `gearLeft`、`MoveResult` 的 `gear` 和 `bag`、`Game.discardGear`；Task 3 的 `itemName`。
- 畫面：
  - 戰鬥結果、寶箱、寶庫的訊息都列出裝備名稱，每一行加上 `.slx-rarity-${r}`；
  - 放不下的裝備顯示「背包已滿，留下了 X」。
- `fullLayer` 遇到 `bag: true` 時：
  - 標題是「背包已滿（60 件）」；
  - 清單列出冒險背包裡的裝備，選一件就呼叫 `discardGear`，再呼叫 `pickUpHere`。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `battle.test.ts`：`won gear is listed with its rarity class; gear left behind is named`。
  - `dungeon.test.ts`：`a chest with gear names the item in its rarity colour`。
  - `event.test.ts`：
    - `the vault lists its gear`；
    - `a full bag offers run-pack gear to discard and then picks up`。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): show dropped gear by rarity and let a full bag make room`

### Task 12: 換裝比較與物品說明

**Files:**
- Create：`engine/compare.ts`、`engine/compare.test.ts`
- Modify：`data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 4 的 `sheetOf`、`setCounts`；Task 3 的 `implicitStats`、`itemSlot`；Task 2 的 `SPECIALS`、`POWERS`、`SETS`。
- Produces：
  - `compareDelta(m: Member, slot: Slot, item: ItemInstance | null): Partial<Record<AnyStat, number>>`：只回傳不為 0 的差值。
  - `ItemLine { kind: 'implicit' | 'affix' | 'power' | 'set' | 'lore'; text: string; active?: boolean }`
  - `itemLines(it: ItemInstance, wearer?: Member): ItemLine[]`：底材加成那一行用 `implicitStats`。
  - `specialLines(id: string): ItemLine[]`：傳入特殊物品 id 或套裝 id，回傳特效、故事或套裝加成。給圖鑑卡片用，不需要物品實體。
  - 文案 `T.gear`：
    - `rarity: Record<Rarity, string>`
    - `statName: Record<AnyStat, string>`
    - `affix(key, value)`：百分比屬性顯示「%」，點數屬性顯示數字。
    - `ilvl(n)`、`setBonus(n, text)`、`junk`、`weight(w)`

- [ ] **Step 1: 寫失敗的測試**
  - `the delta of a better sword is positive in attack only`
  - `comparing a ring uses the given ring slot`
  - `unequipping shows the loss`
  - `set lines mark the bonuses the wearer has reached`
  - `percent stats read as percent, points as points`
  - `specialLines works from an id alone`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/compare.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): gear comparison and item lines`

### Task 13: Tab 鍵與切換動作

**Files:**
- Modify：`ui2/input.ts`、`ui2/input.test.ts`

**Interfaces:**
- Produces：
  - `UiAction` 新增 `'swap'`；
  - `KEYS` 新增 `Tab: 'swap'`，並在 `bindUiInput` 裡對 Tab 呼叫 `preventDefault`，避免瀏覽器移動焦點。
  - 其他場景收到 `'swap'` 時都忽略。

- [ ] **Step 1: 寫失敗的測試**
  - `Tab maps to swap and does not move browser focus`。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/input.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - 原因：`UiAction` 的形狀有變。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): Tab swaps focus areas`

### Task 14: 裝備頁（人形配置、背包格、物品詳情、排序、自動標記）

**Files:**
- Modify：`ui2/scenes/equip.ts`、`ui2/scenes/equip.test.ts`、`data/text.zh-TW.ts`、`src/styles/_starlantern-ui.scss`

**Interfaces:**
- Consumes：
  - Task 4 的 `equip`、`unequip`、`defaultSlotFor`、`BAG_SIZE`；
  - Task 5 的 `toggleJunk`、`setAutoJunk`、`sortBagIn`；
  - Task 12 的 `compareDelta`、`itemLines`；
  - Task 13 的 `'swap'`。
- **版面**（由左到右）：
  - `.slx-bag`：10 欄 × 6 列的 `.slx-bag-cell`。
  - `.slx-doll`：3 × 3 的格子，每格是 `.slx-doll-slot[data-slot]`：
    - 第 1 列：項鍊、頭、副手；
    - 第 2 列：武器、身、手；
    - 第 3 列：戒指 1、腳、戒指 2。
  - `.slx-item-detail`：名稱、欄位、物品等級、`itemLines`、比較列。
  - 每一格只顯示文字（欄位名稱，或物品名稱的前 4 個字），顏色和外框來自 `.slx-rarity-*`。
- **鍵盤**（規則只寫這一次）：
  - 方向鍵只在目前的區域裡移動，到邊緣就停住。只有下面兩個邊緣例外：
    - 在人形格最左那一欄按「左」，焦點換到背包，停在同一列的最右格；
    - 在背包最右那一欄按「右」，焦點換到人形格，停在同一列的最左格。
  - `swap`（Tab）在兩個區域之間切換，游標停在各自上次的位置。
  - 在人形格按 Enter：把這一格設成「目標格」，焦點換到背包，不符合的物品變暗。
  - 在背包按 Enter：
    - 穿到目標格，前提是物品符合目標格；
    - 否則穿到 `defaultSlotFor` 決定的格子。
    - 穿上後清掉目標格。
  - `menu`（C）打開背包選單：
    - 排序：依稀有度、欄位、物品等級；
    - 自動標記：關閉、普通、普通與魔法；
    - 標記或取消標記目前這件。
  - `Q` / `E` 換人；Esc 先清掉目標格，再按一次才離開畫面。
  - 滑鼠點任一格，等同把游標移到那裡再按 Enter。
- 比較列沿用 `.slx-cmp-row`、`.slx-up`、`.slx-down`。已標記的物品加上 `.slx-junk`。
- SCSS：
  - 新增 `$slx-rarity` 對照表：common #e8e8e8、magic #6f9cff、rare #ffd84a、legendary #ff9a3c、unique #d4af37、set #5fd068。
  - 用 `@each` 產生 `.slx-rarity-*`。
  - (implementer's call → fixed here)

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `nine slots in the figure order and sixty bag cells`
  - `arrows stay inside the figure; Left from its left column and Tab go to the bag; Right from the bag's right column comes back`
  - `Enter on a slot then a bag item equips into that slot, the old item returns to the bag`
  - `a ring picked from the bag with no target goes to defaultSlotFor`
  - `the detail shows affixes and up/down comparison rows`
  - `the bag menu sorts and sets auto junk; marked items are greyed`
  - `no element carries a style attribute`
  - 現有的換人、取消、滑鼠測試，改寫後都要通過。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/scenes/equip.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行 ui2 測試，確認通過**
  - `npx vitest run src/scripts/games/starlantern/ui2`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): paper-doll equipment page with bag, detail and comparison`

### Task 15: 狀態頁的「能力」分頁（分類摺疊、來源、列游標）

**Files:**
- Modify：`ui2/scenes/statusTabs.ts`、`ui2/scenes/status.ts`、`ui2/scenes/status.test.ts`、`data/text.zh-TW.ts`、`src/styles/_starlantern-ui.scss`

**Interfaces:**
- Consumes：
  - Task 1 的 `STAT_CATEGORIES`、`StatCategory`；
  - Task 4 的 `statSources`、`sheetOf`；
  - Task 12 的 `T.gear.statName`（36 個屬性的名稱）與 `itemLines`（裝備分頁用）。
- Produces：
  - 每個分類是一個 `section.slx-stat-cat[data-cat]`：
    - 標題是 `.slx-stat-cat-head`，帶有 `aria-expanded`；
    - 內容是一張表，每個來源一欄，最後一欄是合計。表格寫法和現在一樣，所以 `.slx-${source}` 不變。
  - 有一個列游標 `.slx-row-cur`，可以停在分類標題和看得到的資料列上：
    - `onAction('up' | 'down')` 移動游標，並呼叫 `scrollIntoView({ block: 'nearest' })`，讓游標保持在畫面內；
    - Enter 停在標題上時，摺疊或展開該分類；
    - 其他按鍵回傳 false。
  - 摺疊狀態和游標位置存在模組裡，換人時保留。預設只展開 primary 與 attack。(implementer's call → fixed here)
  - `status.ts` 的 `render()`：只有切換分頁或換人時才把 `scrollTop` 歸零。同一個分頁重畫時，保留原本的捲動位置。
  - `T.ui2.status.sources` 新增 `set: '套裝'`、`primary: '主屬性'`；`T.ui2.status.cats` 是 6 個分類名稱。
  - 合計為 0 的列加上 `.slx-zero`。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `six collapsible categories; rows show base, growth, gear, set and primary sources`：scarlet 戴一件 str 物品時，`[data-stat=atk] .slx-primary` 的文字符合 `/^\+\d+$/`。
  - `up/down move the row cursor across headers and rows and keep it in view`：happy-dom 沒有 `scrollIntoView`，在原型上 stub，再斷言有被呼叫。
  - `folding keeps the scroll position`：先設 `bodyEl.scrollTop = 120`，按 Enter 摺疊後重畫，`scrollTop` 仍然是 120。
  - `other tabs still scroll the body with up/down`
  - `fold state survives paging to another member`
  - 現有的 `.slx-total` 和 `.slx-gear` 斷言繼續通過。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/scenes/status.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): character sheet groups stats by category with sources`

### Task 16: 商店的比較與賣裝備

**Files:**
- Modify：`ui2/scenes/shop.ts`、`ui2/scenes/shop.test.ts`、`data/text.zh-TW.ts`

**Interfaces:**
- Consumes：
  - Task 5 的 `sellGear`；
  - Task 3 的 `rollItem`（用 `base`，產生暫時的實體來預覽）、`sellPrice`、`itemName`；
  - Task 12 的 `compareDelta`；
  - Task 4 的 `defaultSlotFor`。
- 購買清單：
  - 25 件底材都加上 `.slx-rarity-common`；
  - 說明欄顯示每位上陣成員穿上之後的 `compareDelta`；
  - 鎖住的底材照舊顯示「需要 素材×N」。
- 販賣分成「素材」和「裝備」兩頁：
  - 裝備頁的右欄顯示 `sellPrice`；
  - 第一列是「賣出全部已標記（N 件）」，沒有已標記的物品時停用。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `selling six thorn fangs unlocks thorn-gauntlets`
  - `the base preview lists per-member deltas`
  - `selling gear pays its price; sell all marked sells only marked items`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/scenes/shop.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): shop compares bases and buys back gear`

### Task 17: 掉落光柱與音效

**Files:**
- Create：`ui2/lootFx.ts`、`ui2/lootFx.test.ts`、`audio/SoundManager.test.ts`
- Modify：
  - `audio/SoundManager.ts`、`ui2/scene.ts`
  - `ui2/scenes/battle.ts`、`ui2/scenes/battle.test.ts`
  - `ui2/scenes/dungeon.ts`、`ui2/scenes/dungeon.test.ts`
  - `ui2/scenes/event.ts`、`ui2/scenes/event.test.ts`
  - `src/styles/_starlantern-ui.scss`

**Interfaces:**
- Consumes：Task 10 的 `BattleEnd.gear` 與 `MoveResult` 的 `gear`；Task 14 的 `$slx-rarity`。
- Produces：
  - `showPillar(host: HTMLElement, rarity: Rarity, fast: boolean): HTMLElement | null`
    - 普通級回傳 null；
    - 會加上 `.slx-pillar.slx-rarity-${r}`，傳說另外加 `.slx-pillar-legend`；
    - `fast` 時不設定計時器；否則 1200 ms 後移除，傳說是 2000 ms。
  - `SoundManager.loot(rarity: Rarity)`：(implementer's call → fixed here)
    - magic：660 Hz；
    - rare：660 Hz 再接 990 Hz；
    - legendary、unique、set：523、784、1047 Hz 三和弦；傳說另外加一段 noise。
    - 有效音量是 0 時，直接 return，不呼叫 `ensure()`。
  - `SceneCtx.sfx` 的 `Partial<Pick<…>>` 加上 `'loot'`。
- 觸發時機：每次掉落只觸發一次，用最高稀有度的那件。觸發點有三個：戰鬥結果、寶箱、寶庫。
- 光柱是程式效果（漸層加上 CSS 動畫），已經裁定通過。

- [ ] **Step 1: 寫失敗的測試**
  - `lootFx.test.ts`：
    - `a pillar per rarity, none for common, a special one for legendary`
    - Review Focus 5：`fast mode leaves no timers`：用 `vi.getTimerCount()` 確認是 0。
  - `SoundManager.test.ts`：Review Focus 5：`muted loot makes no audio nodes`。
    - stub `window.AudioContext`，計算 `createOscillator` 被呼叫的次數；
    - `setVolume(0)` 時是 0 次，`setVolume(1)` 時大於 0。
  - `battle.test.ts`、`dungeon.test.ts`、`event.test.ts`：`the best drop raises one pillar and plays loot once`。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
  - `npx vitest run src/scripts/games/starlantern/ui2 src/scripts/games/starlantern/audio`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): light pillars and chimes for drops by rarity`

### Task 18: 傳送門卡片上的限定裝備

**Files:**
- Modify：`ui2/scenes/gate.ts`、`ui2/scenes/gate.test.ts`、`data/text.zh-TW.ts`、`src/styles/_starlantern-ui.scss`

**Interfaces:**
- Consumes：
  - Task 2 的 `regionSpecials`、`generalLegendaries`、`SETS`、`codexName`；
  - Task 12 的 `specialLines`；
  - Task 5 的 `state.codex`。
- `.slx-portal-gear` 改成一份清單：
  - 地區卡片列出 2 件特殊物品和 1 套套裝；
  - 本道卡片列出 `generalLegendaries()`。
- 清單的每一項：
  - 外層是 `.slx-codex-item[data-special]`，加上 `.slx-rarity-*`；
  - 名稱用 `codexName`；
  - 還沒取得的，加上 `.slx-codex-unknown`，文字是「名稱（未取得）」；
  - 已經取得的，附上 `specialLines(id)` 的第一行。
- 剪影：只有 `ctx.art.has(art.icon(id))` 為真時，才放 `<img class="slx-codex-silhouette">`，用 SCSS 的 `filter: brightness(0)` 做成剪影。5a 沒有圖示，所以只會有文字。

- [ ] **Step 1: 寫失敗的 DOM 測試**
  - `a regional card lists two specials and its set, unknown until obtained`
  - `an obtained special shows its first line`
  - `the mainline card lists the general legendaries`
  - `no silhouette image without art`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/scenes/gate.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): portal cards show region-only gear`

### Task 19: 平衡模擬加入隨機裝備的期望值

**Files:**
- Modify：`engine/sim.ts`、`engine/balance.test.ts`

**Interfaces:**
- Consumes：
  - Task 3 的 `rollItem`、`rarityWeights`、`itemLevel`、`generalLegendaries`；
  - Task 4 的 `SLOTS`、`slotsFor`。
- Produces：
  - `kitParty(level: number, depth: number, seed: number, rarity?: Rarity): Party`
    - 以 `partyAt(level)` 為基礎；
    - 每位成員的 9 格，各放一件 `rollItem` 擲出的物品；
    - 物品等級是 `itemLevel(depth, 'monster')`，rng 是 `mulberry32(seed)`；
    - `uid` 從 1 開始依序遞增；`slot` 從對應的 `GearSlot` 取得。
    - 沒有指定 `rarity` 時：
      - 依 `rarityWeights('monster', depthLevel(depth), CONDITIONS.plain)` 擲出 tier；
      - 擲到 legendaryTier 時，算成稀有。因為特效不是能力值，不算入期望值。(implementer's call → fixed here)
  - `winRate(level, groups, boss, seeds, scale, altar, kitSeed?)`：有 `kitSeed` 時，改用 `kitParty(level, scale?.depth ?? 1, kitSeed)`。
- 第 1–9 項仍然是沒穿裝備的隊伍。

- [ ] **Step 1: 寫失敗的測試**
  - `10. random gear in expectation keeps the bands`
    - d 取 4、6、8、10；region 取 mainline 與 blaze；
    - kitSeed 1–5，每個各跑 8 場，取平均；
    - 勝率 ≥ 0.85，hpLoss 介於 0.1 與 0.45 之間。
  - `11. a full rare kit does not one-round a boss`
    - 用 `simBattle(kitParty(depthLevel(d), d, seed, 'rare'), ['lanterneater'], true, seed, { depth: d, region: 'mainline' })`；
    - d 取 5 與 10，seed 取 1–20；
    - 每一場的 `rounds` 都 ≥ 3。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/balance.test.ts --testTimeout=20000`
  - 預期：失敗，原因是找不到 `kitParty`。
- [ ] **Step 3: 實作**
  - 第 10 或第 11 項沒過時，只能調整 `AFFIX_SCALE`。
  - Task 2 與 Task 3 的測試都是依 `AFFIX_SCALE` 計算的，所以改了之後仍會通過。
- [ ] **Step 4: 執行全套，確認全部通過**
  - 第 1–11 項全部通過。
- [ ] **Step 5: commit**
  - 訊息：`test(starlantern): balance with the expected value of random gear`
  - 有調過 `AFFIX_SCALE` 的話，要寫出最後的值。

### Task 20: 端對端、全套測試、截圖與審查

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`

- [ ] **Step 1：e2e `gear drops, comes home and is worn`**
  - 出發後，在頁面裡用 `g.mintUid()` 取得 uid，組出一件傳說，推進 `g.run.loot.gear`；
  - 用歸還之燈回城，回城訊息要列出這件；
  - 到公會的「裝備」：在人形格選武器，再在背包選這件；
  - 比較列出現 `.slx-up`；
  - 「狀態」的「能力」分頁有「主屬性」分類與來源欄；
  - 全程沒有 console error；
  - 最後在旅館存檔，重新整理後選「繼續」，存檔仍然有效，表示 uid 和 `nextUid` 一致。
- [ ] **Step 2：e2e `a rare chest drop raises a pillar`**
  - 用 `g.mintUid()` 做一件稀有，放進某個寶箱的 `g.run.gearRolls[key]`，再走上那個寶箱；
  - 畫面出現 `.slx-pillar.slx-rarity-rare`。
- [ ] **Step 3：全套測試與截圖**
  - 執行 `npx vitest run --testTimeout=20000`，以及 e2e 全套；
  - 截圖：各稀有度的物品、比較畫面、能力分類、光柱、傳送門卡片。
- [ ] **Step 4：審查**
  - 派一個沒參與開發的 opus 代理，用 `~/.claude/skills/review-pr/SKILL.md` 審查本計畫的 diff，並處理它提出的問題。
- [ ] **Step 5：commit**
  - 訊息：`test(starlantern): loot core end-to-end`

---

## 已裁定的 spec 衝突（見 progress.md）
1. 不限地區的只有傳說；獨特與套裝全部是地區限定。
2. 自然主屬性只顯示，不換算。
3. 自動分解在 5c 之前只做標記。
4. 光柱是程式效果。
5. 剪影要等 5d 的圖示。
6. 傳說特效綁定現有的技能 id，5b 要接手處理。
7. 易傷等於打中弱點時的加成。
8. 稀有素材的 id 現在先建立。
9. 敵人的新屬性加上補償。
10. commit 署名用 Claude Opus 5.5。
