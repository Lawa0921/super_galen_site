# 星燈迷宮 計畫 5a：打寶核心（屬性、稀有度、詞綴、掉落、裝備介面）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把固定的 3 格商店裝備換成會掉落的 9 格「物品實體」：有主屬性與衍生屬性、六種稀有度、通用詞綴池、地區限定的傳說／獨特／套裝、掉落光柱，以及能比較增減的人形裝備頁與 60 格背包。

**Architecture:**
- 屬性分兩層。舊的 7 項（`Stats`）照舊是底層，戰鬥公式仍讀它。新增主屬性與衍生屬性，合起來稱為 `Sheet`。
  - 角色自然成長的主屬性不再換算，因為它已經算在舊 7 項裡了；只有裝備和套裝給的主屬性會換算成衍生屬性。這樣「沒穿裝備的隊伍」數值與現在完全相同，現有的平衡測試不會動。
- 物品是純資料 `ItemInstance`。產生、掉落、背包都是純函式，放在 `engine/loot/`，輸入裡一定有 `Rng`。
  - `Game` 只負責把結果放進冒險背包或倉庫，並在回城時入庫。
- 介面沿用 ui2 的 `MenuView`、`win`、`STATUS_TABS`。物品沒有圖示美術（留給 5d），一律是文字，再用 SCSS 依稀有度上色、加外框。

**Tech Stack:** TypeScript、Vitest、Pixi.js 8（這次不動 Pixi）、DOM 介面加 SCSS、Web Audio 合成音效、Playwright e2e。

**Spec:**
- `docs/superpowers/specs/2026-10-16-starlantern-progression-design.md`（§3、§4、§5、§8 的裝備部分、§9）
- 接點：`docs/superpowers/specs/2026-10-16-starlantern-roguelike-dungeon-design.md`（§3.1 重量、§3.3 寶箱／精英／寶庫、§3.7 深度等級）

> 路徑寫法：沒有以 `src/` 或 `tests/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。

## Global Constraints
- 測試只能用 `npx vitest run <路徑>`。全套用 `npx vitest run --testTimeout=20000`。不可以用 `npm run test`，它是 watch 模式，會卡住。
- e2e 用 `E2E_PORT=4352 npx playwright test tests/e2e/starlantern --project=chromium`。這個參數是篩選字串，會對到 `tests/e2e/starlantern.spec.ts`。不可以用 4321 埠。
- 本專案沒有 prettier、eslint，也沒有 type-check 腳本，不要去跑。
- SCSS 禁用 `!important`。禁止行內樣式，包括 JS 的 `element.style`。
- 保留每個檔案原本的換行格式。例如 `engine/party.ts`、`engine/battle.ts`、`engine/state.ts` 是 CRLF；`ui2/scenes/equip.ts` 與 `src/styles/_starlantern-ui.scss` 是 LF；`data/text.zh-TW.ts` 混用兩種。改檔前先用 `git ls-files --eol <檔案>` 確認。
- commit 一律寫出明確路徑，不可以用 `git add -A`。commit 訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 繁體中文文案一律放在 `data/text.zh-TW.ts`。
- 所有隨機都用帶種子的 `Rng`（`engine/rng.ts` 的 `mulberry32`），不可以用 `Math.random`。音效的白噪音是唯一例外，因為現有寫法就是這樣。
- `engine/balance.test.ts` 的門檻一律不可放寬。
- 美術：不可以做假圖示，不可以用 CSS 形狀畫物品。5d 之前，物品顯示為文字，加上 SCSS 的稀有度顏色與外框。
  - 新的底材 id 與稀有素材 id 都要加進 `render/artPaths.ts` 的 `NO_ICON_YET`。因為 `allArtUrls()` 的數量（`artPaths.test.ts` 寫的是 219）和 registry 比對都不可以改變。
- 存檔版本從 3 變成 4，舊檔直接重置（使用者已同意）。

## Review Focus
1. **背包或負重已滿時，裝備絕不能悄悄消失**：撿不起來就留在原地並回報 `full`；倉庫滿 60 格時，卸下裝備或購買都要被拒絕。由 Task 4 與 Task 6 測試。
2. **極深的樓層**：第 50 層的物品等級約 198。詞綴值、`sheetOf` 和戰鬥傷害都必須是有限數字，百分比屬性不可超過上限，減傷不超過 75%，閃避不超過 50%。由 Task 1、Task 2、Task 5 測試。
3. **兩個戒指格**：同一個 `uid` 不能同時戴在 ring1 與 ring2；兩格都滿時，要換掉玩家指定的那一格；同一件套裝部件出現兩次，只算 1 件。由 Task 4 測試。
4. **全滅與重複頭目**：全滅時，這趟撿到的裝備要全部失去，而且不能記進圖鑑；「重複打倒」依「地區＋深度」分開計算，而且存檔重讀後仍然記得。由 Task 6 測試。
5. **靜音**：音量設為 0 時，掉落音效不可以建立任何音訊節點，但光柱照常顯示；`fast` 模式下光柱不留計時器。由 Task 11 測試。

---

## File Structure
- `engine/types.ts`：新增屬性鍵、稀有度、9 個欄位、`ItemInstance`，並改 `Member.equip`。
- `engine/stats.ts`（新）：屬性分類、主屬性換算、上限、收益遞減公式，以及敵人依深度得到的暴擊、閃避和元素抗性。
- `data/equipment.ts`：25 件普通底材。原本的 15 件改到新的欄位，另外新增 10 件。
- `data/gear.ts`（新）：稀有度、詞綴池、欄位重量、傳說特效、獨特與套裝。
- `engine/loot/item.ts`（新）：物品等級、產生物品、物品給的數值、賣價、名稱。
- `engine/loot/drops.ts`（新）：稀有度權重、各來源的掉落、地區限定、頭目保底、稀有素材。
- `engine/loot/bag.ts`（新）：背包上限、排序、自動標記。
- `engine/party.ts`：`statSources` 和 `sheetOf` 改讀物品實體，並計入套裝與主屬性換算。
- `engine/combatant.ts`、`engine/battle.ts`、`engine/skills.ts`：衍生屬性進入戰鬥，以及傳說特效。
- `engine/scaling.ts`：敵人依深度得到的衍生屬性，並補償難度。
- `engine/state.ts`、`engine/save.ts`、`engine/town.ts`：存檔 v4、倉庫、穿脫、買賣。
- `engine/game.ts`、`engine/dungeon/run.ts`、`engine/events.ts`、`data/weights.ts`、`data/materials.ts`：掉落進冒險背包、重量、精英與寶庫。
- `engine/compare.ts`（新）：換裝增減與物品說明行。
- `ui2/scenes/equip.ts`、`ui2/scenes/statusTabs.ts`、`ui2/scenes/shop.ts`、`ui2/scenes/gate.ts`、`ui2/lootFx.ts`（新）、`audio/SoundManager.ts`、`ui2/scene.ts`。
- `data/text.zh-TW.ts`、`src/styles/_starlantern-ui.scss`、`render/artPaths.ts`。
- `engine/sim.ts`、`engine/balance.test.ts`、`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 屬性模型（主屬性、衍生屬性、收益遞減、敵人的深度屬性）

**Files:**
- Create: `engine/stats.ts`, `engine/stats.test.ts`
- Modify: `engine/types.ts`, `data/characters.ts`

**Interfaces:**
- Produces（`engine/types.ts`）：
  - `export type PrimaryKey = 'str' | 'int' | 'agi' | 'wil'`
  - `export type SecondaryKey = 'crit' | 'critDmg' | 'vuln' | 'eliteDmg' | 'multi' | 'armor' | 'evasion' | 'block' | 'meleeDR' | 'rangedDR' | 'fireRes' | 'iceRes' | 'thunderRes' | 'fireDmg' | 'iceDmg' | 'thunderDmg' | 'poisonRes' | 'sleepRes' | 'tpRegen' | 'tpCost' | 'gauge' | 'heal' | 'goldFind' | 'matFind' | 'expBonus'`
  - `export type AnyStat = StatKey | PrimaryKey | SecondaryKey`
  - `export type Sheet = Record<AnyStat, number>`
  - `CharacterDef` 新增 `affinity: PrimaryKey`
  - `EnemyDef` 新增 `sec?: Partial<Record<SecondaryKey, number>>`
  - 百分比屬性一律存成「百分點」，例如暴擊 5 代表 5%。`armor`、`evasion`、`tpRegen` 是點數，不是百分比。
- Produces（`engine/stats.ts`）：
  - `export const PRIMARY_KEYS: PrimaryKey[]`、`export const SECONDARY_KEYS: SecondaryKey[]`
  - `export type StatCategory = 'primary' | 'attack' | 'defense' | 'element' | 'resource' | 'other'`
  - `export const STAT_CATEGORIES: { id: StatCategory; keys: AnyStat[] }[]`，內容如下：
    - primary：str、int、agi、wil
    - attack：atk、mag、crit、critDmg、vuln、eliteDmg、multi、spd
    - defense：hp、def、res、armor、evasion、block、meleeDR、rangedDR
    - element：fireRes、iceRes、thunderRes、fireDmg、iceDmg、thunderDmg、poisonRes、sleepRes
    - resource：tp、tpRegen、tpCost、gauge、heal
    - other：goldFind、matFind、expBonus
  - `export function emptySheet(): Sheet`：全部是 0。
  - `export function naturalPrimary(def: CharacterDef, level: number): Record<PrimaryKey, number>`
  - `export function convertPrimary(p: Partial<Record<PrimaryKey, number>>, affinity: PrimaryKey): Partial<Sheet>`
  - `export const PARTY_BASE: Partial<Record<SecondaryKey, number>> = { critDmg: 50 }`：暴擊時的傷害是 ×1.5。
  - `export const CAPS: Partial<Record<SecondaryKey, number>>`
  - `export function capSheet(s: Sheet): Sheet`
  - `export function armorReduction(armor: number, attackerLevel: number): number`：回傳 0 到 0.75。
  - `export function evadeChance(rating: number, attackerLevel: number): number`：回傳 0 到 0.5。
  - `export function enemySecondary(depthLv: number, homeLv: number, trait: RegionDef['trait']): Partial<Record<SecondaryKey, number>>`
  - `export function compensation(sec: Partial<Record<SecondaryKey, number>>): Partial<Record<StatKey, number>>`：回傳能力值的倍率。

**本任務固定的數值（全部是 (implementer's call → fixed here)）**
- **自然主屬性**：直接取舊屬性的基礎加成長。
  - 力量 = atk；智力 = mag；敏捷 = spd；意志 = round(tp ÷ 2)。
  - 這些自然值不換算，只用來顯示，以及計算負重上限。
- **主屬性換算**（每 1 點；角色的 `affinity` 那一項 ×1.5）：
  - 力量：atk +1、armor +2
  - 智力：mag +1；火、冰、雷抗性各 +0.5
  - 敏捷：crit +0.2、spd +0.5
  - 意志：tp +1、heal +1
- **affinity**：noel int、chizuru str、liz agi、sylvie agi、scarlet str、selene wil、safira agi、bobby int。
- **上限 `CAPS`**：
  - crit 60、multi 50、block 50
  - meleeDR 50、rangedDR 50
  - 火、冰、雷抗性 75
  - poisonRes 80、sleepRes 80
  - tpCost 50、goldFind 100、matFind 100、expBonus 100
- **收益遞減**（照 spec §3 的公式，敵人等級用深度等級）：
  - 減傷 = armor ÷ (armor + 50 × 攻擊者等級)，最多 0.75。
  - 閃避 = evasion ÷ (evasion + 50 × 攻擊者等級)，最多 0.5。
- **敵人的衍生屬性**：令 `over = max(0, depthLv − homeLv)`。
  - crit = min(15, 0.25 × over)
  - evasion = min(12, 0.2 × over)：敵人的閃避直接就是百分比，不經過遞減公式。
  - 火、冰、雷抗性 = min(30, 0.5 × over)
  - 地區 `evasive`（暗影）再加 crit +5、evasion +5。
- **難度補償 `compensation`**：讓同一深度等級、沒穿裝備的隊伍，勝率和現在一樣。破解這些新屬性要靠裝備。
  - hp × (1 − evasion ÷ 100) × (1 − 0.3 × 元素抗性 ÷ 100)
  - atk 與 mag ÷ (1 + crit ÷ 100 × 0.5)

- [ ] **Step 1: 寫失敗的測試** `engine/stats.test.ts`
  - `natural primaries mirror the old stats and do not convert`：scarlet Lv1 的 `naturalPrimary` 是 `{ str: 13, int: 6, agi: 7, wil: 7 }`。
  - `primaries from gear convert, with the affinity at 1.5x`：
    - `convertPrimary({ str: 10 }, 'str')` 等於 `{ atk: 15, armor: 30 }`；
    - `convertPrimary({ str: 10 }, 'int')` 等於 `{ atk: 10, armor: 20 }`。
  - `armor and evasion have diminishing returns and caps`：
    - `armorReduction(100, 2)` 等於 0.5；
    - `armorReduction(1e9, 2)` 等於 0.75；
    - `evadeChance(0, 10)` 等於 0；
    - 對 armor 0、100、200、400，數值單調遞增，但每次的增量越來越小。
  - `enemy crit, evasion and resistances grow with depth level and are zero at home`：
    - `enemySecondary(2, 2, null)` 等於 `{}`，或全部是 0；
    - `enemySecondary(38, 2, null).crit` 等於 9；
    - `enemySecondary(500, 2, 'evasive').crit` 等於 20（上限 15，加暗影的 5）。
  - Review Focus 2：`caps hold and nothing is NaN at depth level 198`：用 1e6 的數值餵 `capSheet`，每個鍵都是有限數字，而且不超過上限。
  - 在 `data/data.test.ts` 加一項：`every character has an affinity`。
- [ ] **Step 2: 執行測試，確認失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/engine/stats.test.ts`
  - Expected：FAIL，原因是找不到 `./stats`。
- [ ] **Step 3: 實作 `engine/stats.ts`，並在 `data/characters.ts` 補上 `affinity`**
- [ ] **Step 4: 執行測試，確認通過**
  - 同一個指令，外加 `npx vitest run src/scripts/games/starlantern/data`。
- [ ] **Step 5: commit**
  - 只 `git add` 本任務 Files 列出的檔案（完整路徑）。
  - 訊息：`feat(starlantern): primary and derived stats with diminishing returns`

### Task 2: 裝備資料（9 個欄位、25 件底材、稀有度、詞綴池、特效、獨特與套裝）

**Files:**
- Create: `data/gear.ts`, `data/gear.test.ts`
- Modify: `data/equipment.ts`, `engine/types.ts`, `data/data.test.ts`, `render/artPaths.ts`

**Interfaces:**
- Produces（`engine/types.ts`）：
  - `export type Rarity = 'common' | 'magic' | 'rare' | 'legendary' | 'unique' | 'set'`
  - `export type GearSlot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'neck' | 'ring'`
  - `EquipDef` 改成 `{ id; name; slot: GearSlot; ilvl: number; price; bonus: Partial<Stats>; unlock? }`
  - `export interface ItemInstance { uid: number; base: string; rarity: Rarity; ilvl: number; affixes: { key: AnyStat; value: number }[]; special?: string; enhance: number; junk?: boolean }`
    - `enhance` 一律是 0，留給 5c。
  - 本任務還不改 `Slot` 和 `Member`；那些在 Task 4。
- Produces（`data/gear.ts`）：
  - `export const RARITIES: Rarity[]`：順序就是 spec 表格的順序。
  - `export const RARITY_RANK: Record<Rarity, number>`：common 0、magic 1、rare 2、legendary 3、unique 4、set 5。
  - `export const AFFIX_COUNT = { magic: [1, 2], rare: [3, 4], legendary: [3, 3] } as const`
  - `export const ROLL_FLOOR = { magic: 0, rare: 0.25, legendary: 0.5, unique: 0.9, set: 0.75 } as const`
  - `export const AFFIX_SCALE = 1`：整個詞綴池唯一的總倍率。Task 13 的平衡測試沒過時，只能調這一個數，並把最後的值寫進 commit 訊息。
  - `export interface AffixDef { slots: GearSlot[]; lo: [number, number]; hi: [number, number] }`
    - `lo` 和 `hi` 都寫成 `[物品等級 1 時的值, 物品等級 50 時的值]`。
  - `export const AFFIXES: Record<AnyStat, AffixDef>`
  - `export function affixRange(key: AnyStat, ilvl: number): [number, number]`：在兩點之間線性內插；超過 50 時照同一條線往外延伸。
  - `export const SLOT_WEIGHT: Record<GearSlot, number>`
  - `export interface SkillMod { hits?: number; target?: Target; powerPct?: number; element?: Element; hpCost?: number; turns?: number; chance?: number; extra?: Effect[] }`
  - `export interface PowerDef { id: string; skill: string; text: string; mod: SkillMod }`
  - `export const POWERS: Record<string, PowerDef>`
  - `export interface SpecialDef { id: string; name: string; rarity: 'legendary' | 'unique' | 'set'; slot: GearSlot; region: RegionId | null; source: 'any' | 'elite' | 'boss'; power?: string; fixed?: AnyStat[]; set?: string; lore: string }`
  - `export const SPECIALS: Record<string, SpecialDef>`
  - `export interface SetDef { id: string; name: string; region: RegionId; pieces: string[]; two: Partial<Sheet>; four: Partial<Sheet> }`
  - `export const SETS: Record<string, SetDef>`
  - `export function regionSpecials(region: RegionId): SpecialDef[]`：只回傳傳說與獨特，不含套裝部件。

**底材（`data/equipment.ts`，共 25 件，全部是普通級）** (implementer's call → fixed here)
- 原本的 15 件：id、名稱、加成和解鎖條件都不變，只改欄位並補上物品等級。
  - 武器：wooden-staff、iron-sword、hunter-bow 是 Lv1；thorn-spear 5；crystal-blade 7；frost-staff 7；star-saber 10。
  - armor 改成 body：cloth-robe 1、leather-vest 1、scale-mail 7、dusk-mantle 10。
  - accessory 改成 neck：moss-charm 2、bat-earring 3、crystal-pendant 7。
  - accessory 改成 ring：gear-ring 10。
- 新的 10 件（格式：id 名稱 欄位 物品等級 加成 價格 解鎖）：
  - `wooden-buckler` 木圓盾 offhand 1 `{def:2}` 30
  - `crystal-aegis` 晶盾 offhand 8 `{def:5,res:3}` 150，解鎖 crystal-shell×4
  - `leather-cap` 皮帽 head 1 `{def:1,res:1}` 25
  - `scale-helm` 鱗盔 head 7 `{def:4,res:2}` 140，解鎖 lizard-scale×4
  - `cloth-gloves` 布手套 hands 1 `{atk:1,def:1}` 25
  - `thorn-gauntlets` 荊棘臂甲 hands 5 `{atk:3,def:2}` 100，解鎖 thorn-fang×6
  - `straw-sandals` 草鞋 feet 1 `{spd:1}` 25
  - `bat-boots` 蝠翼靴 feet 4 `{spd:3,def:1}` 90，解鎖 bat-wing×6
  - `copper-ring` 銅戒 ring 1 `{hp:8}` 30
  - `star-ring` 星紋戒 ring 10 `{atk:4,mag:4}` 260，解鎖 star-stone×5

**欄位重量 `SLOT_WEIGHT`** (implementer's call → fixed here)
- weapon 6、offhand 5、head 4、body 8、hands 4、feet 4、neck 3、ring 3。
- 都落在迷宮設計 §3.1 的 3–8 之間：武器與身體最重，戒指與項鍊最輕。

**詞綴池 `AFFIXES`** (implementer's call → fixed here)
- 格式：鍵：可出現的欄位｜Lv1 時的 lo–hi → Lv50 時的 lo–hi。
- 欄位縮寫：W 武器、O 副手、H 頭、B 身、G 手、F 腳、N 項鍊、R 戒指。
- str、int、agi、wil：全部欄位｜1–2 → 10–18
- atk：W G R｜1–2 → 12–20
- mag：W O N R｜1–2 → 12–20
- hp：O H B F N｜5–10 → 60–110
- def：O H B G F｜1–2 → 10–16
- res：O H B N｜1–2 → 10–16
- spd：G F N｜1–1 → 4–7
- tp：O H N R｜2–4 → 12–20
- crit：W G N R｜1–2 → 4–7
- critDmg：W G R｜5–10 → 20–35（spec 的例子：暴擊傷害只出現在武器、手、戒指）
- vuln：W N｜3–6 → 10–18
- eliteDmg：W O R｜3–6 → 10–18
- multi：W G｜2–4 → 6–10
- armor：O H B G F｜4–8 → 150–250
- evasion：H G F N｜4–8 → 150–250
- block：O｜3–6 → 10–16
- meleeDR：O B｜2–3 → 6–10
- rangedDR：H B｜2–3 → 6–10
- fireRes、iceRes、thunderRes：O H B F N R｜3–6 → 12–20
- fireDmg、iceDmg、thunderDmg：W N R｜3–6 → 12–20
- poisonRes、sleepRes：H F N｜5–10 → 20–35
- tpRegen：N R｜1–1 → 2–3
- tpCost：H N｜3–5 → 8–12
- gauge：B N R｜3–6 → 10–16
- heal：W O N｜3–6 → 10–18
- goldFind、matFind：R N，再各加 H／G｜5–10 → 20–35
- expBonus：N R｜2–4 → 6–10

**傳說特效 `POWERS` 與特殊物品 `SPECIALS`** (implementer's call → fixed here；名稱沿用 spec 的暫定名)
- `SkillMod` 的規則：
  - `powerPct` 同時套用在傷害的 power、治療的 power，以及增益的 pct（取整數）；
  - `hits` 和 `target` 會覆寫原值；
  - `extra` 會接在效果清單的最後面。
- 不限地區的傳說，每位角色 1 件，`region: null`、`source: 'any'`：
  - `lg-noel` 群星之戒 ring：火之星彈改成打全體，威力 70%。（target 'enemies'，powerPct 70）
  - `lg-chizuru` 雙月槍 weapon：橫掃改成打兩次，威力 65%。這是 spec 的例子。
  - `lg-liz` 三叉刃 weapon：雙刃改成 3 段。
  - `lg-sylvie` 破甲箭袋 offhand：瞄準射擊另外讓目標防禦 −20%，持續 3 回合。（用 extra）
  - `lg-scarlet` 挑戰者紋章 neck：挑釁另外讓自己防禦 +25%，持續 3 回合。（用 extra，target 是 self）
  - `lg-selene` 滿月頭冠 head：月光改成治療全體，威力 60%。
  - `lg-safira` 四拍舞靴 feet：刃舞改成 4 段。
  - `lg-bobby` 長效齒輪手套 hands：砲台持續 5 回合。
- 地區限定：每個地區 1 件傳說、1 件獨特、1 套套裝。
  - 熾焰：傳說 `blaze-heart-sword` 灼心之劍 weapon，爆炎斬不再消耗 HP（hpCost 0）；獨特 `blaze-ember-ring` 餘燼指環 ring，固定詞綴 [fireDmg, fireRes, atk]。
  - 霜凍：獨特 `frost-winter-staff` 永冬權杖 weapon，[mag, iceDmg, int]；傳說 `frost-bloom-neck` 霜華頸鍊 neck，冰之星彈打全體，威力 70%。
  - 雷鳴：傳說 `storm-thunder-bow` 疾雷之弓 weapon，瞄準射擊變成雷屬性，威力 120%；獨特 `storm-swift-boots` 迅雷之靴 feet，[spd, agi, evasion]。
  - 腐毒：獨特 `mire-miasma-mask` 瘴氣面具 head，[poisonRes, hp, armor]；傳說 `mire-whisper-gloves` 沼語手套 hands，衰弱咒的中毒機率變成 100%（chance 1）。
  - 暗影：傳說 `shade-silent-blade` 無聲之刃 weapon，`source: 'elite'`，三連刃改成 4 段；獨特 `shade-raven-cloak` 夜鴉披風 body，[evasion, agi, crit]。
  - 鋼鐵：獨特 `iron-unbroken-shield` 不破之盾 offhand，`source: 'boss'`，[block, armor, meleeDR]；傳說 `iron-bulwark-plate` 鐵壁胸甲 body，鐵壁改成作用全體，威力 50%。
- 套裝：每套 4 件。部件 id 是 `${setId}-${slot}`；名稱是套裝名的詞幹加欄位名詞。
  - 欄位名詞：weapon 之刃、offhand 之盾、head 之冠、body 之鎧、hands 之手甲、feet 之靴、neck 之鍊、ring 之戒。例如「焰紋之刃」。
  - 部件的固定詞綴：weapon 與 body 拿主題的 3 個鍵，其他欄位拿前 2 個。
  - 固定詞綴不受一般的欄位限制，因為這些是專屬物品。

| 套裝 id | 名稱 | 欄位 | 主題詞綴 | 2 件 | 4 件 |
|---|---|---|---|---|---|
| set-blaze | 焰紋套裝 | weapon body hands ring | fireDmg atk str | fireDmg +15 | crit +8、fireDmg +20 |
| set-frost | 霜語套裝 | weapon head neck ring | iceDmg mag int | iceDmg +15 | tpCost +15、iceRes +20 |
| set-storm | 雷鳴套裝 | weapon hands feet ring | thunderDmg spd agi | thunderDmg +15 | multi +12、spd +5 |
| set-mire | 沼行套裝 | head body feet neck | poisonRes hp wil | poisonRes +30 | heal +20、tpRegen +2 |
| set-shade | 夜幕套裝 | weapon head hands feet | evasion crit agi | crit +6 | critDmg +30、vuln +15 |
| set-iron | 鐵壁套裝 | offhand head body feet | armor def str | meleeDR +10 | block +15、rangedDR +10 |

- 套裝加成只用百分比與小數值，不會隨物品等級變大。這是刻意的：套裝的價值在於固定詞綴會隨物品等級成長。

- [ ] **Step 1: 寫失敗的測試** `data/gear.test.ts`
  - `crit damage only rolls on weapons, hands and rings`：`AFFIXES.critDmg.slots` 剛好是 `['weapon', 'hands', 'ring']`。
  - `every slot can roll at least four affixes`。
  - `affixRange interpolates and extrapolates`：
    - `affixRange('atk', 1)` 等於 `[1, 2]`；
    - `affixRange('atk', 50)` 等於 `[12, 20]`；
    - 第 198 級的值是有限數字，而且大於第 50 級。
  - `each region has one legendary, one unique and a four-piece set`：mainline 沒有限定物品。
  - `every power names a real skill and every special points at a real slot`：用 `SKILLS` 檢查。
  - `set pieces cover four distinct slots and point back at their set`。
  - 修改 `data/data.test.ts`：
    - 把 `toHaveLength(15)` 改成 25；
    - 加上 `every base has a known slot and an ilvl of at least 1`。
- [ ] **Step 2: 執行測試，確認失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/data`
- [ ] **Step 3: 實作**
  - 把 10 件新底材的 id 加進 `render/artPaths.ts` 的 `NO_ICON_YET`。
- [ ] **Step 4: 執行測試，確認通過**
  - 同時執行 `npx vitest run src/scripts/games/starlantern/render`：`artPaths.test.ts` 的 219 不變。
  - 注意：本任務之後，`engine/party.ts` 的 `SLOTS` 仍然讀 `'armor'` 和 `'accessory'`。Vitest 不做型別檢查，所以現有測試會照樣通過；Task 4 會換掉這些。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): gear data — nine slots, rarities, affix pool, specials and sets`

### Task 3: 產生物品與掉落表

**Files:**
- Create: `engine/loot/item.ts`, `engine/loot/item.test.ts`, `engine/loot/drops.ts`, `engine/loot/drops.test.ts`
- Modify: `data/conditions.ts`, `data/materials.ts`, `render/artPaths.ts`

**Interfaces:**
- Consumes：Task 2 的 `AFFIXES`、`affixRange`、`AFFIX_COUNT`、`ROLL_FLOOR`、`AFFIX_SCALE`、`SPECIALS`、`SETS`、`EQUIPMENT`；`engine/scaling.ts` 的 `depthLevel`。
- Produces（`engine/loot/item.ts`）：
  - `export type DropSource = 'monster' | 'chest' | 'elite' | 'vault' | 'boss'`
  - `export function itemLevel(depth: number, source: DropSource): number`
    - (implementer's call → fixed here) 公式是 `depthLevel(depth)`，再依來源加：monster 0、chest 0、elite 2、vault 2、boss 4。
  - `export function baseFor(rng: Rng, slot: GearSlot, ilvl: number): string`：在這個欄位裡，從物品等級 ≤ ilvl 的底材中，取等級最高的 2 件，二選一。
  - `export function rollItem(rng: Rng, o: { uid: number; ilvl: number; rarity: Rarity; slot?: GearSlot; special?: string }): ItemInstance`
    - 沒指定欄位時，從 8 種欄位平均抽一種。
    - 普通、魔法、稀有、傳說：從該欄位允許的詞綴裡抽，不重複，數量照 `AFFIX_COUNT`。
    - 數值 = `round((lo + (hi − lo) × (floor + (1 − floor) × u)) × AFFIX_SCALE)`，最小是 1。其中 `floor` 是 `ROLL_FLOOR[rarity]`，`u = rng()`。
    - 傳說、獨特、套裝都要指定 `special`，`special` 存它的 id；底材用該特殊物品欄位裡等級最高的底材。
    - 傳說另外加 3 個隨機詞綴。
    - 獨特與套裝：詞綴就是 `fixed` 的鍵，`u` 固定是 1，所以數值就是 `floor` 那一點。
  - `export function itemStats(it: ItemInstance): Partial<Sheet>`
    - 底材加成會隨物品等級放大：`round(bonus × (1 + 0.04 × max(0, it.ilvl − base.ilvl)))`；
    - 再加上所有詞綴。
  - `export function itemName(it: ItemInstance): string`：特殊物品用 `SPECIALS[id].name`，否則用底材名稱。
  - `export function itemSlot(it: ItemInstance): GearSlot`
  - `export function itemWeight(it: ItemInstance): number`：等於 `SLOT_WEIGHT[itemSlot(it)]`。
  - `export function sellPrice(it: ItemInstance): number`
    - (implementer's call → fixed here) 公式是 `round((10 + 2 × ilvl) × m)`。
    - m 依稀有度：common 1、magic 2、rare 4、legendary 10、unique 10、set 8。
- Produces（`engine/loot/drops.ts`）：
  - `export type Tier = 'common' | 'magic' | 'rare' | 'legendaryTier'`
  - `export function rarityWeights(source: DropSource, depthLv: number, cond: ConditionDef): Record<Tier, number>`
  - `export const GEAR_CHANCE = { monster: 0.08, chest: 0.35 }`：每打倒 1 隻怪，以及每開 1 個寶箱。
  - `export const BOSS_LEGENDARY = { first: 0.2, repeat: 0.1 }`
  - `export interface DropCtx { uid: () => number; depth: number; region: RegionId; condition: ConditionId; source: DropSource; bossRepeat?: boolean }`
  - `export function rollGear(rng: Rng, ctx: DropCtx): ItemInstance`：一定回傳 1 件；要不要掉，由呼叫的人判斷。
  - `export function rollBossGear(rng: Rng, ctx: DropCtx): ItemInstance[]`：回傳 2 件。
    - 第 1 件至少是稀有；它的傳說級機率照 `BOSS_LEGENDARY` 決定，重複打倒時減半。
    - 第 2 件照 elite 的權重抽。
  - `export const RARE_MATERIALS = ['star-tear', 'ancient-gear', 'king-scale']`
  - `export function rollRareMaterial(rng: Rng): string`
- Modify `data/conditions.ts`：`ConditionDef` 新增 `rarityMul: number`。
  - (implementer's call → fixed here) bounty 1.5、fierce 1.25，其他都是 1。
- Modify `data/materials.ts`：新增 `{ id: 'star-tear', name: '星燈之淚', price: 80 }` 和 `{ id: 'king-scale', name: '王者之鱗', price: 100 }`。
  - `ancient-gear` 已經存在，直接沿用。
  - 這些素材的用途由 5c 補上。
  - 兩個新 id 都要加進 `NO_ICON_YET`。

**稀有度權重** (implementer's call → fixed here)，令 L = 深度等級、c = `rarityMul`：
- monster：
  - common 70
  - magic 24 × (1 + L/40)
  - rare 5.5 × (1 + L/20) × c
  - legendaryTier 0.5 × (1 + L/20) × c
- chest：和 monster 一樣，但 rare 與 legendaryTier 再 ×1.5。
- elite：common 是 0，所以至少是魔法級；rare 與 legendaryTier 再 ×3。
- vault：common 和 magic 都是 0，所以至少是稀有級；legendaryTier 再 ×3。
- **抽到 legendaryTier 之後**：
  - mainline：一律是不限地區的傳說。
  - 隨機地區：
    - 50% 是傳說；其中 40% 是該地區的傳說，60% 是不限地區的傳說；
    - 25% 是該地區的獨特；
    - 25% 是該地區套裝中隨機的一件。
  - 如果抽到的特殊物品 `source` 不符合（例如普通怪抽到 `boss` 限定的物品），就改成不限地區的傳說。
  - `elite` 限定的物品，精英和頭目都可以掉。

- [ ] **Step 1: 寫失敗的測試**
  - `item.test.ts`：
    - `same seed, same item`：同樣的參數呼叫兩次，結果 `toEqual`。
    - `affix counts follow the rarity`：每種稀有度各跑 500 個種子。common 0 個；magic 1–2 個；rare 3–4 個；legendary 剛好 3 個，而且有 `special`。
    - `affixes respect the slot pool and never repeat`：跑 2000 個種子，每個詞綴的 key 都在 `AFFIXES[key].slots` 裡含有 `itemSlot(it)`。
    - `values stay in range and rarer sits higher`：rare 的每個值 ≥ 區間的 25% 那一點；同一個 ilvl 下，rare 的平均值 > magic 的平均值。
    - `uniques and set pieces carry their fixed affixes`。
    - `implicit grows with item level`：ilvl 42 的 star-saber，atk 等於 `round(15 × (1 + 0.04 × 32))`，也就是 34。
    - Review Focus 2：`depth 50 items are finite`：`itemLevel(50, 'boss')` 等於 `2 + 4 × 49 + 4`，也就是 202；這個等級的物品，每個值都是有限整數。
  - `drops.test.ts`：機率檢驗用 N = 20000，容許誤差 4σ，也就是 `4 × sqrt(p(1 − p) / N)`。
    - `monster rarity matches the weights at depth 1 and 10`：觀察到的比例對 `rarityWeights` 算出的期望值。
    - `deeper, elite and bounty raise rare odds`：rare 的權重比例 depth 10 > depth 1；elite > monster；bounty > plain。
    - `elites never drop common; vaults never below rare; a boss's first item is at least rare`。
    - `a repeat boss halves the legendary-tier chance`：觀察到的比例約 0.2 對 0.1，各在 4σ 內。
    - `region-only gear never drops elsewhere`：跑 mainline 2000 次，`special` 只會是 `lg-*`。
    - `boss-only gear drops only from bosses`：鋼鐵地區的 monster 與 elite 跑 20000 次，都不會出現 `iron-unbroken-shield`。
- [ ] **Step 2: 執行測試，確認失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/engine/loot`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行測試，確認通過**
  - 外加 `npx vitest run src/scripts/games/starlantern/data src/scripts/games/starlantern/render`。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): seeded item rolls and drop tables`

### Task 4: 物品實體進入角色、倉庫與存檔 v4

**Files:**
- Create: `engine/loot/bag.ts`, `engine/loot/bag.test.ts`
- Modify:
  - `engine/types.ts`, `engine/party.ts`, `engine/party.test.ts`
  - `engine/state.ts`, `engine/save.ts`, `engine/save.test.ts`
  - `engine/town.ts`, `engine/town.test.ts`
  - `data/text.zh-TW.ts`
  - `ui2/scenes/statusTabs.ts`, `ui2/scenes/equip.ts`, `ui2/scenes/equip.test.ts`, `ui2/scenes/status.test.ts`, `ui2/scenes/shop.ts`, `ui2/scenes/shop.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `naturalPrimary`、`convertPrimary`、`capSheet`、`emptySheet`、`PARTY_BASE`；Task 3 的 `rollItem`、`itemStats`、`itemSlot`、`itemName`、`sellPrice`；Task 2 的 `SETS`、`SPECIALS`。
- Produces（`engine/types.ts`）：
  - `export type Slot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'neck' | 'ring1' | 'ring2'`
  - `Member.equip: Partial<Record<Slot, ItemInstance>>`
- Produces（`engine/party.ts`）：
  - `export const SLOTS: Slot[]`：照上面的順序，取代原本私有的 `SLOTS`。
  - `export function slotsFor(g: GearSlot): Slot[]`：ring 對應 `['ring1', 'ring2']`，其他對應自己。
  - `export type StatSource = 'base' | 'growth' | 'gear' | 'set' | 'primary'`
  - `export function statSources(m: Member): { source: StatSource; stats: Partial<Sheet> }[]`
    - base 與 growth：舊 7 項，加上自然主屬性；base 還要含 `PARTY_BASE`。
    - gear：所有已穿物品的 `itemStats` 加總。
    - set：已達到 2 件或 4 件的套裝加成。
    - primary：gear 與 set 的主屬性用 `convertPrimary` 換算出的結果。
  - `export function sheetOf(m: Member): Sheet`：把各來源加總，再 `capSheet`。
  - `statsOf(m): Stats`：簽名不變，改成從 `sheetOf` 取舊的 7 項。整數屬性一律無條件捨去。
  - `export function setCounts(m: Member): Record<string, number>`：同一件套裝部件（同一個 `special`）只算 1 次。
  - `export function powersOf(m: Member): string[]`：已穿傳說的 `POWERS` id。
- Produces（`engine/loot/bag.ts`）：
  - `export const BAG_SIZE = 60`
  - `export type AutoJunk = 'off' | 'common' | 'magic'`：'magic' 代表普通和魔法都標記。
  - `export function sortBag(bag: ItemInstance[], by: 'rarity' | 'slot' | 'ilvl'): ItemInstance[]`
    - 穩定排序。rarity 依 `RARITY_RANK` 由高到低；slot 依 `SLOTS` 的順序；ilvl 由高到低。
  - `export function applyAutoJunk(it: ItemInstance, mode: AutoJunk): ItemInstance`：傳說、獨特、套裝永遠不標記。
- Produces（`engine/state.ts`）：
  - `GameState` 新增 `bag: ItemInstance[]`、`nextUid: number`、`codex: string[]`、`autoJunk: AutoJunk`。
  - `DungeonProgress` 新增 `bossKills: Record<string, number>`，鍵是 `${region}:${depth}`。
  - `SAVE_VERSION = 4`。
  - 背包只放裝備。素材與消耗品照舊放在 `inventory` 的數量表。(implementer's call → fixed here)
- Produces（`engine/town.ts`）：
  - `TownResult` 的 reason 新增 `'full'`。
  - `export function mintUid(s: GameState): number`：回傳 `s.nextUid`，然後把它加 1。
  - `buy(s, id)`：如果 id 是底材，就產生一件普通級實體，物品等級是 `EQUIPMENT[id].ilvl`，放進 `bag`。背包滿了回傳 `'full'`。
  - `equip(s, memberId, uid: number, slot?: Slot): TownResult`：從 `bag` 拿出物品。
    - 戒指沒指定格子時，放進第一個空的戒指格；兩格都滿時，放 ring1。
    - 換下來的物品回到 `bag`。
    - 欄位不符合時回傳 `'invalid'`。
  - `unequip(s, memberId, slot)`：背包滿了回傳 `'full'`。
  - `export function sellGear(s: GameState, uids: number[]): TownResult`：照 `sellPrice` 給金幣。不計入 `sold`，因為解鎖只看素材。
  - `export function toggleJunk(s: GameState, uid: number): TownResult`
  - `export function setAutoJunk(s: GameState, mode: AutoJunk): TownResult`
  - `export function sortBagIn(s: GameState, by: 'rarity' | 'slot' | 'ilvl'): TownResult`
- `ui/dom.ts` 的 `itemName(id)` 不改，仍然只接受字串 id。物品實體的名稱用 `engine/loot/item.ts` 的 `itemName`。
  - 同一個檔案需要兩者時，把 loot 的那個 import 成 `gearName`，避免撞名。

- [ ] **Step 1: 寫失敗的測試**
  - `party.test.ts`：
    - `no gear means the same numbers as before`：對每位角色、Lv 1 和 Lv 20，`statsOf` 都等於「base + growth × (level − 1)」，也就是現有的公式。
    - `gear primaries convert and show as their own source`：穿上一件有 `str: 10` 的物品後，scarlet 的 `statSources` 有 `primary` 這一列，內容是 atk +15、armor +30。
    - `two pieces of a set give the two-piece bonus, four give both`。
    - Review Focus 3：`the same set piece twice counts once`：ring1 和 ring2 都戴同一件套裝戒指部件時，`setCounts` 等於 1。
  - `bag.test.ts`：
    - `sorts by rarity, slot and item level, stable`；
    - `auto junk marks common (and magic) but never legendary, unique or set`。
  - `town.test.ts`：
    - `buying a base puts a common item of its level in the bag`；
    - `equip swaps through the bag, rings fill the first empty ring slot, then the chosen one`；
    - Review Focus 3：`one uid cannot be worn twice`：同一個 `uid` 已經在 ring1，再對 ring2 呼叫 `equip`，要失敗（它已經不在背包裡了），而且狀態不變；
    - Review Focus 1：`a full bag refuses unequip and buying`：60 件時都回傳 `'full'`，狀態不變；
    - `selling gear pays sellPrice and does not count toward unlocks`。
  - `save.test.ts`：
    - `round-trips bag, equipped instances, codex and boss kills`；
    - `rejects a duplicate uid, an unknown base, an affix key that does not exist, a ring in the weapon slot, a bag over 60, and nextUid not above every uid`；
    - `a version-3 save reports version`。
  - UI 測試只做最小的改寫，讓現有斷言保持通過：
    - 把 `inventory['iron-sword'] = 1` 改成在 `bag` 放一件實體；
    - 把 `equip.weapon === 'iron-sword'` 改成 `equip.weapon?.base === 'iron-sword'`。
    - 不可以刪測試，也不可以降低斷言。
- [ ] **Step 2: 執行測試，確認失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/engine src/scripts/games/starlantern/ui2`
- [ ] **Step 3: 實作**
  - `T.slot` 改成 9 格：武器、副手、頭部、身體、手部、腳部、項鍊、戒指 1、戒指 2。
  - `statusTabs.ts` 的 `SLOT_ORDER` 改用 `SLOTS`。
  - `equip.ts` 和 `shop.ts` 只換成新的資料存取方式；版面在 Task 8 和 Task 10 才改。
- [ ] **Step 4: 執行測試，確認通過**
  - Run：`npx vitest run src/scripts/games/starlantern`，全部通過。
  - 再用 grep 確認 `starlantern/` 底下已經沒有 `'armor'` 或 `'accessory'` 當作欄位使用。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): gear as item instances in nine slots, bag of 60, save v4`

### Task 5: 衍生屬性進入戰鬥，敵人依深度變強，以及傳說特效

**Files:**
- Modify:
  - `engine/combatant.ts`, `engine/combatant.test.ts`
  - `engine/battle.ts`, `engine/battle.test.ts`
  - `engine/skills.ts`, `engine/skills.test.ts`
  - `engine/scaling.ts`, `engine/scaling.test.ts`
  - `engine/testing.ts`
  - `data/text.zh-TW.ts`
  - `ui2/battleText.ts`, `ui2/battleText.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `armorReduction`、`evadeChance`、`enemySecondary`、`compensation`；Task 4 的 `sheetOf`、`powersOf`；Task 2 的 `POWERS`、`SkillMod`。
- Produces：
  - `Combatant` 新增：
    - `x: Partial<Record<SecondaryKey, number>>`
    - `level: number`：隊員是自己的等級；敵人是深度等級，沒有強化時用 `homeLevel(def)`。
    - `powers: string[]`
  - `makeCombatant` 的預設：`x: {}`、`level: 1`、`powers: []`。
  - `calcDamage(a, t, spec, rng)` 回傳 `{ amount: number; mult: number; crit: boolean; miss: boolean }`。
  - `BattleEvent` 的 damage 新增 `crit?: boolean`，另外新增 `{ type: 'miss'; target: string }`。
  - `export function patchSkill(def: SkillDef, mod: SkillMod): SkillDef`（`engine/skills.ts`）
  - `export function skillFor(c: Combatant, id: string): SkillDef`（`engine/battle.ts`）：把這位隊員身上 `powers` 指向這個技能的特效，依序套上。
  - `scaleEnemy` 回傳的 `EnemyDef` 帶有 `sec`（`enemySecondary`）。能力值除了原本的倍率，再乘上 `compensation(sec)`。
  - `rewards(s, rng, dropBoost, dropMul)` 簽名不變。在裡面讀存活隊員的 `x.goldFind`、`x.matFind`、`x.expBonus` 加總（各自上限 100）：
    - 金幣與經驗各乘以 (1 + 加總 ÷ 100)，四捨五入；
    - 素材的掉落機率乘以 (1 + matFind ÷ 100)。
- **公式順序**（在 `calcDamage` 裡）：
  1. 閃避：隊員用 `evadeChance(t.x.evasion, a.level)`；敵人直接用 `t.x.evasion ÷ 100`。
  2. 原本的基礎傷害、弱點與抗性倍率。
  3. 攻擊方的 `${element}Dmg`；目標的 `${element}Res`。phys 不吃這兩項。
  4. `vuln`：只在打中弱點（倍率 > 1）時生效。(implementer's call → fixed here：遊戲裡沒有「易傷」狀態，所以用「打中弱點」代替。)
  5. `eliteDmg`：目標是 `boss`，或 `tint === 'elite'` 時生效。
  6. 暴擊：機率是 `a.x.crit`；暴擊時 ×(1 + `a.x.critDmg` ÷ 100)。敵人的 critDmg 一律是 50。
  7. phys 傷害吃目標的 `armorReduction(t.x.armor, a.level)`。
  8. phys 傷害吃 `block`：機率 = block ÷ 100，擋下時減半。
  9. melee 吃 `meleeDR`，否則吃 `rangedDR`。
  10. 最後是原本的防禦姿態 ×0.5。
- **其他鉤子**：
  - `multi`：只對 `hits` 是 1 或沒寫的傷害效果；有 `multi ÷ 100` 的機率多打 1 段。
  - `tpCost`：技能消耗變成 `ceil(tp × (1 − tpCost ÷ 100))`；原本 > 0 的技能最少要 1。
  - `tpRegen`：每回合結束時，存活的隊員回復這麼多 TP。
  - `gauge`：每次行動和受傷累積的絕技量表 ×(1 + gauge ÷ 100)，無條件捨去。
  - `heal`：治療量 ×(1 + heal ÷ 100)。
  - `poisonRes`、`sleepRes`：中毒與睡眠的機率 ×(1 − res ÷ 100)。
- **亂數規則**：只有機率 > 0 時才抽亂數，包括閃避、暴擊、格擋、多段。
  - 這樣沒有這些屬性的戰鬥，抽到的亂數序列和現在完全相同，現有的種子測試與平衡數字都不會改變。

- [ ] **Step 1: 寫失敗的測試**
  - `combatant.test.ts`：
    - `zero secondaries consume no extra randomness`：用一個會計數的 rng，x 是空的時候，`calcDamage` 只呼叫 rng 1 次，和現在一樣。
    - `crit multiplies by 1 + critDmg`：`constRng(0)`，crit 100 → `crit: true`。
    - `an evaded hit deals nothing and logs miss`。
    - `armor only reduces physical damage, with diminishing returns`。
    - `fire damage bonus and fire resistance multiply; physical ignores both`。
    - Review Focus 2：`damage stays finite with capped stats at level 198`。
  - `battle.test.ts`：
    - `tpRegen restores TP at the end of the round`；
    - `tpCost lowers the cost but never to zero`；
    - `gold and exp find raise rewards`。
  - `skills.test.ts`：
    - `patchSkill applies hits, target, power, element, hpCost, turns, chance and extra`；
    - `a member wearing 雙月槍 sweeps twice`：`skillFor` 回傳的 `sweep` 是 `hits: 2`、`power: 52`（80 × 65%）。
  - `scaling.test.ts`：
    - `depth 1 mainline enemies are unchanged`：現有的測試要繼續通過；`sec` 是空的，或全部是 0。
    - `deep enemies gain crit, evasion and resistances, compensated in hp and attack`：第 10 層的狼 `sec.crit` 等於 9；hp 等於「舊的值 × (1 − 0.072) × (1 − 0.3 × 0.18)」，四捨五入。
  - `battleText.test.ts`：`a crit and a miss are worded`。
- [ ] **Step 2: 執行測試，確認失敗**
- [ ] **Step 3: 實作**
  - 這幾個檔案都是 CRLF（見 Global Constraints）。
  - 文案加到 `T.log`：`miss: (who) => \`${who} 閃過了攻擊\``；`crit: '（暴擊）'`，接在傷害那一行後面。
- [ ] **Step 4: 執行測試，確認通過**
  - Run：`npx vitest run src/scripts/games/starlantern/engine --testTimeout=20000`
  - `balance.test.ts` 第 1–9 項必須全部通過，不可放寬門檻。
  - 第 7、8 項如果因為亂數雜訊掉出範圍，可以調的只有 `compensation` 的 0.3 和 0.5 這兩個係數。調整後在 commit 訊息寫明新的值。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): crits, evasion, armor, resistances and legendary powers in battle`

### Task 6: 掉落接進迷宮（冒險背包、重量、精英、寶庫、頭目、圖鑑）

**Files:**
- Modify:
  - `engine/game.ts`, `engine/game.test.ts`
  - `engine/dungeon/run.ts`, `engine/dungeon/run.test.ts`
  - `engine/save.test.ts`
  - `engine/events.ts`, `engine/events.test.ts`
  - `data/weights.ts`
  - `ui2/scenes/battle.ts`, `ui2/scenes/dungeon.ts`, `ui2/scenes/event.ts`
  - `data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 3 的 `rollGear`、`rollBossGear`、`rollRareMaterial`、`GEAR_CHANCE`、`itemWeight`；Task 4 的 `BAG_SIZE`、`applyAutoJunk`、`mintUid`、`sheetOf`。
- Produces：
  - `Run.loot` 改成 `{ items: Record<string, number>; gold: number; gear: ItemInstance[] }`。
  - `Run.rolls` 的值改成 `{ item: string; qty: number; gear?: ItemInstance }`：寶箱開出的裝備第一次就固定下來，`item` 是底材 id，`qty` 是 1。
  - `BattleEnd` 新增 `gear: ItemInstance[]`（帶走的）和 `gearLeft: ItemInstance[]`（放不下的）。
  - `MoveResult`：
    - `chest` 新增 `gear?: ItemInstance`；
    - `vault` 新增 `gear: ItemInstance[]`；
    - `full` 新增 `gear?: ItemInstance` 和 `bag?: boolean`：`bag` 為 true 代表 60 格滿了，不是超重。
  - `Game.discardGear(uid: number): boolean`：從冒險背包丟掉一件。
  - `data/weights.ts`：
    - `capacity(party)` 改成 `40 + 上陣成員 sheetOf(m).str 合計 × 0.5`。因為自然力量 = atk，沒穿裝備時的數字和現在相同。
    - `carried(state, run)` 再加上 `run.loot.gear` 的 `itemWeight`。
    - 身上穿著的裝備不計重量。(implementer's call → fixed here)
    - `weightOf(id)` 刪掉讀 `EQUIPMENT` 的分支，因為裝備只會以物品實體存在。
  - 「放得下」的規則：重量沒超過上限，而且 `state.bag.length + run.loot.gear.length < BAG_SIZE`。
- **規則**：
  - 一般戰鬥：每打倒 1 隻怪，有 `GEAR_CHANCE.monster` 的機率掉 1 件。來源是 monster；精英那一隻用 elite。
  - 精英：必掉 1 件 elite 來源的裝備，再加 1 個 `rollRareMaterial`。
    - 這就是 `game.ts` 的 `// TODO(plan 5): elites always drop a rare material`，完成後刪掉這行 TODO。
  - 頭目：用 `rollBossGear`，鍵是 `${region}:${depth}`。
    - `bossRepeat` 在 `state.dungeon.bossKills[key] > 0` 時為真；打倒後把它加 1。
    - 本道第 3 層的劇情頭目也記錄。
  - 寶箱：有 `GEAR_CHANCE.chest` 的機率開出 1 件 chest 來源的裝備，取代原本的寶箱內容。
  - 寶庫：維持 3 倍的寶箱量；`VAULT_PLACEHOLDER` 改成 1 個稀有素材，再加 1 件 vault 來源的裝備。
    - 刪掉 `events.ts` 和 `game.ts` 裡指向計畫 5 的 TODO。
  - 撿起時，依 `state.autoJunk` 套上 `applyAutoJunk`。
  - 平安回城時，`run.loot.gear` 併入 `state.bag`。特殊物品的 id，以及套裝的 id，加進 `state.codex`，不重複。
  - 全滅時照舊清空冒險背包，裝備也一起失去，`codex` 不變。
  - `banked` 新增 `gear: ItemInstance[]`。
- 介面只做最小的串接，光柱在 Task 11：
  - 戰鬥結果、寶箱訊息、寶庫訊息，用 `itemName` 列出裝備名稱；
  - 每一行加上 `slx-rarity-${rarity}` 的 class；
  - `fullLayer` 遇到 `bag: true` 時，顯示「背包已滿（60 件）」，並列出冒險背包裡的裝備，讓玩家可以丟。

- [ ] **Step 1: 寫失敗的測試**
  - `game.test.ts`：
    - `an elite always drops gear of magic or better and one rare material`；
    - `a boss drops a rare-or-better item; beating the same boss again halves the legendary chance (keyed by region and depth)`：檢查 `bossKills` 的計數，以及傳給 `rollBossGear` 的 `bossRepeat`。
    - `a vault pays a rare-or-better item and a rare material, not old coins`；
    - `gear waits in the run pack and is banked, adding specials to the codex`；
    - Review Focus 4：`a wipe loses run gear and leaves the codex untouched`；
    - Review Focus 1：`a full bag (60 with the run pack) keeps the chest shut and reports full with bag: true`。重量也一樣：超重時回報 `full`，而且裝備仍留在原地；丟掉一件之後，再踩一次就撿得起來。
    - `capacity uses strength and is unchanged for a party without gear`。
  - `save.test.ts`：Review Focus 4 的 `boss kills survive a save and reload`。
- [ ] **Step 2: 執行測試，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行測試，確認通過**
  - Run：`npx vitest run src/scripts/games/starlantern --testTimeout=20000`，全部通過。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): monsters, chests, elites, vaults and bosses drop gear`

### Task 7: 換裝比較與物品說明

**Files:**
- Create: `engine/compare.ts`, `engine/compare.test.ts`
- Modify: `data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 4 的 `sheetOf`、`slotsFor`、`setCounts`；Task 3 的 `itemStats`、`itemSlot`。
- Produces：
  - `export function compareDelta(m: Member, slot: Slot, item: ItemInstance | null): Partial<Record<AnyStat, number>>`：只回傳不是 0 的差值。`item` 是 null 時代表卸下。
  - `export function defaultSlotFor(m: Member, it: ItemInstance): Slot`
    - (implementer's call → fixed here) 戒指的規則：有空的戒指格就用它；兩格都滿時，用 ring1。
  - `export interface ItemLine { kind: 'implicit' | 'affix' | 'power' | 'set' | 'lore'; text: string; active?: boolean }`
  - `export function itemLines(it: ItemInstance, wearer?: Member): ItemLine[]`
    - 有 wearer 時，套裝的 2 件和 4 件加成要標出 `active`。
- 文案 `T.gear`：
  - `rarity: Record<Rarity, string>`：普通、魔法、稀有、傳說、獨特、套裝；
  - `statName: Record<AnyStat, string>`：主屬性叫「力量／智力／敏捷／意志」，其他照 spec §3 的名稱；
  - `affix(key, value)`：百分比屬性顯示成「暴擊率 +5%」，點數屬性顯示成「護甲 +40」；
  - `ilvl(n)`：「物品等級 n」；
  - `setBonus(n, text)`；
  - `junk`：「已標記」；
  - `weight(w)`。

- [ ] **Step 1: 寫失敗的測試**
  - `the delta of a better sword is positive in attack and zero elsewhere`；
  - `comparing a ring uses the chosen ring slot`；
  - `unequipping shows the loss`；
  - `set lines mark the bonuses the wearer has reached`；
  - `percent stats read as percent, points as points`。
- [ ] **Step 2: 執行測試，確認失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/engine/compare.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行測試，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): gear comparison and item lines`

### Task 8: 裝備頁（9 格人形配置、背包格、物品詳情、排序、自動標記）

**Files:**
- Modify: `ui2/scenes/equip.ts`, `ui2/scenes/equip.test.ts`, `data/text.zh-TW.ts`, `src/styles/_starlantern-ui.scss`

**Interfaces:**
- Consumes：Task 4 的 `equip`、`unequip`、`toggleJunk`、`setAutoJunk`、`sortBagIn`、`BAG_SIZE`；Task 7 的 `compareDelta`、`defaultSlotFor`、`itemLines`。
- **版面**：
  - 左邊是 `.slx-doll`：3 欄的 CSS grid，9 個 `.slx-doll-slot[data-slot]`，排成人形。
    - 第 1 列：項鍊、頭、副手
    - 第 2 列：武器、身、手
    - 第 3 列：戒指 1、腳、戒指 2
  - 中間是 `.slx-bag`：10 × 6 的 `.slx-bag-cell`。
  - 右邊是 `.slx-item-detail`：名稱、欄位、物品等級、說明行，以及比較列。
  - 每格只放文字：欄位名稱，或物品名稱的前 4 個字。外框與文字顏色來自 `.slx-rarity-${r}`。不放任何圖形。
- **操作**：
  - 方向鍵在目前的區域內移動。`Q`／`E` 換人。
  - 在人形格按 Enter：焦點移到背包，背包只亮起符合這一格的物品。
  - 在背包按 Enter：穿上。目標格是剛才選的格子，沒有的話用 `defaultSlotFor`。
  - 背包裡，在人形格按左鍵，或在背包第 1 欄按左鍵，都會切換區域。
  - `C`（menu）打開背包選單：排序（稀有度／欄位／物品等級）、自動標記（關／普通／普通與魔法）、標記或取消標記目前這件。
  - Esc 一層一層退出。
  - 滑鼠：點格子等同移動加 Enter。
- 比較列沿用現有的 `.slx-cmp-row`、`.slx-up`、`.slx-down`，列出 `compareDelta` 的每個鍵。
- 已標記的物品加上 `.slx-junk`，以灰色顯示。

- [ ] **Step 1: 寫失敗的測試** `equip.test.ts`
  - `shows nine slots laid out as a figure and a bag of sixty cells`；
  - `picking a slot then a bag item equips it and the old one returns to the bag`；
  - `the detail shows affixes and a green/red comparison`：比較列有 `.slx-up` 和 `.slx-down`；
  - `rings go to the slot the player chose`；
  - `the bag menu sorts by rarity and sets auto junk`；
  - `each rarity gets its class and no element carries a style attribute`：用 `querySelectorAll('[style]').length === 0` 檢查；
  - 現有的換人、取消、滑鼠測試，改寫後要繼續通過。
- [ ] **Step 2: 執行測試，確認失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/ui2/scenes/equip.test.ts`
- [ ] **Step 3: 實作**
  - SCSS 的稀有度色票放在 `_starlantern-ui.scss` 的變數 `$slx-rarity`：
    - common #e8e8e8
    - magic #6f9cff
    - rare #ffd84a
    - legendary #ff9a3c
    - unique #d4af37
    - set #5fd068
  - 用 `@each` 產生 `.slx-rarity-*` 的文字色與外框色。(implementer's call → fixed here)
- [ ] **Step 4: 執行測試，確認通過**
  - 外加 `npx vitest run src/scripts/games/starlantern/ui2`。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): paper-doll equipment page with bag, detail and comparison`

### Task 9: 狀態頁（「能力」改成分類摺疊並列出來源，「裝備」顯示 9 格）

**Files:**
- Modify: `ui2/scenes/statusTabs.ts`, `ui2/scenes/status.test.ts`, `data/text.zh-TW.ts`, `src/styles/_starlantern-ui.scss`

**Interfaces:**
- Consumes：Task 1 的 `STAT_CATEGORIES`；Task 4 的 `statSources`、`sheetOf`。
- Produces：
  - `stats` 分頁的 `render`：每個分類是一個 `section.slx-stat-cat[data-cat]`。
    - 標題是 `.slx-stat-cat-head`，`role=button`，帶 `aria-expanded`；
    - 內容是現有格式的表格：每個來源一欄，最後是合計。每一列是 `tr[data-stat]`。
  - `stats` 分頁新增 `onAction`：上下鍵移動分類游標；Enter 切換摺疊；其他按鍵回傳 false。
  - 摺疊狀態存在模組層級的 `Set<StatCategory>`，換人時保留。預設只展開 primary 和 attack。(implementer's call → fixed here)
  - `T.ui2.status.sources` 新增 `set: '套裝'`、`primary: '主屬性'`。
  - `T.ui2.status.cats: Record<StatCategory, string>`：主屬性、攻擊、防禦、元素、資源、其他。
  - 加總是 0 的列照樣顯示，但加上 `.slx-zero`，用淡色表示。
  - `gear` 分頁：9 格，名稱依稀有度上色，後面接 `itemLines` 的詞綴摘要。

- [ ] **Step 1: 寫失敗的測試**
  - `the stats page groups stats into six collapsible categories`；
  - `each row shows its sources: base, growth, gear, set and primary`：讓 scarlet 戴一件 str 物品；`[data-stat=atk] .slx-primary` 的文字符合 `/^\+\d+$/`；
  - `Enter folds and unfolds the category under the cursor, and the state survives paging to another member`；
  - `the gear page lists nine slots`；
  - 現有的 `[data-stat=atk] .slx-total`、`.slx-gear` 斷言繼續有效。
- [ ] **Step 2: 執行測試，確認失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/ui2/scenes/status.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行測試，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): character sheet groups stats by category with sources`

### Task 10: 商店（普通底材、賣素材解鎖高階底材、賣裝備、一鍵賣出已標記）

**Files:**
- Modify: `ui2/scenes/shop.ts`, `ui2/scenes/shop.test.ts`, `data/text.zh-TW.ts`

**Interfaces:**
- Consumes：Task 4 的 `buy`、`sellGear`、`isUnlocked`；Task 3 的 `sellPrice`、`itemName`；Task 7 的 `compareDelta`、`defaultSlotFor`。
- 購買清單：
  - 道具，加上 25 件底材。底材用 `.slx-rarity-common`，右欄是價格與物品等級。
  - 鎖住的底材照舊顯示「需要 素材×N」。
  - 說明欄改成用 `compareDelta`，算出每位上陣成員換上之後的差值。
- 解鎖訊息照舊用 `T.ui2.shop.unlocked`。
- 販賣：分成「素材」和「裝備」兩頁。
  - 裝備頁列出 `bag`，右欄是 `sellPrice`。
  - 第一列是「賣出全部已標記（N 件）」；沒有標記的物品時，這一列停用。

- [ ] **Step 1: 寫失敗的測試**
  - `buying a base adds a common item to the bag, and a full bag refuses`；
  - `selling materials still unlocks higher bases (thorn-gauntlets after six thorn fangs)`；
  - `selling gear pays its price; sell all marked sells only the marked`。
- [ ] **Step 2: 執行測試，確認失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/ui2/scenes/shop.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行測試，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): shop sells common bases and buys back gear`

### Task 11: 掉落光柱與音效

**Files:**
- Create: `ui2/lootFx.ts`, `ui2/lootFx.test.ts`, `audio/SoundManager.test.ts`
- Modify: `audio/SoundManager.ts`, `ui2/scene.ts`, `ui2/scenes/battle.ts`, `ui2/scenes/battle.test.ts`, `ui2/scenes/dungeon.ts`, `ui2/scenes/dungeon.test.ts`, `ui2/scenes/event.ts`, `src/styles/_starlantern-ui.scss`

**Interfaces:**
- Produces：
  - `export function showPillar(host: HTMLElement, rarity: Rarity, fast: boolean): HTMLElement | null`
    - 在 host 裡加一個 `.slx-pillar.slx-rarity-${rarity}`，傳說另外加 `.slx-pillar-legend`。
    - 普通級不出光柱，回傳 null。
    - fast 為 true 時，直接回傳元素，不設計時器；否則 1200ms 後移除，傳說是 2000ms。
  - `SoundManager.loot(rarity: Rarity): void`：用現有的 `blip` 和 `noise` 合成。
    - (implementer's call → fixed here) 音高依稀有度上升：
      - magic：一聲 660Hz；
      - rare：660 加 990；
      - legendary、unique、set：三和弦 523、784、1047，傳說再接一段 noise 的閃光聲。
    - 有效音量（`sfxVolume × playerVolume`）是 0 時，直接 return，不呼叫 `ensure()`，也不建立任何節點。這就是「尊重靜音設定」：設定頁的音量 0，或全站的 sfxVolume 0。
  - `SceneCtx.sfx` 的 `Partial<Pick<…>>` 加上 `'loot'`。
- 觸發點：一次掉落只觸發 1 次，取這次掉落中稀有度最高的那件。
  - 戰鬥結果顯示時；
  - 迷宮裡寶箱或寶庫開出裝備時。
- 光柱是程式效果：漸層加上 CSS 動畫，和現有狀態頁的 `slx-status-rays` 光芒同一種做法。它不是物品圖示，也不是假美術。(implementer's call → fixed here；見文末「與 spec 的衝突」第 4 點)

- [ ] **Step 1: 寫失敗的測試**
  - `lootFx.test.ts`：
    - `a pillar per rarity, none for common, a special one for legendary`；
    - Review Focus 5：`fast mode leaves no timers`：用 `vi.useFakeTimers()`，確認 `vi.getTimerCount()` 是 0。
  - `SoundManager.test.ts`：
    - Review Focus 5：`muted loot makes no audio nodes`：stub 一個 `window.AudioContext`，計算 `createOscillator` 被呼叫幾次。`setVolume(0)` 之後呼叫 `loot('legendary')`，次數是 0；`setVolume(1)` 之後次數 > 0。
  - `battle.test.ts` 和 `dungeon.test.ts` 各加一項：`the best drop raises one pillar and plays loot once`。
- [ ] **Step 2: 執行測試，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行測試，確認通過**
  - Run：`npx vitest run src/scripts/games/starlantern/ui2 src/scripts/games/starlantern/audio`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): light pillars and chimes for drops by rarity`

### Task 12: 傳送門卡片顯示地區限定裝備

**Files:**
- Modify: `ui2/scenes/gate.ts`, `ui2/scenes/gate.test.ts`, `data/text.zh-TW.ts`, `src/styles/_starlantern-ui.scss`

**Interfaces:**
- Consumes：Task 2 的 `regionSpecials`、`SETS`；Task 4 的 `state.codex`。
- `.slx-portal-gear` 改成一份清單：該地區的 2 件特殊物品，加上 1 套套裝名。
  - 每項是 `.slx-codex-item[data-special]`，帶上 `.slx-rarity-*`。
  - 還沒取得的：加 `.slx-codex-unknown`，文字是「名稱（未取得）」。
    - 剪影要等 5d 的圖示：`ctx.art.has(art.icon(id))` 為真時，才放 `<img class="slx-codex-silhouette">`，用 SCSS 的 `filter: brightness(0)` 變成剪影。
    - 5a 沒有圖示，所以只有文字。(implementer's call → fixed here)
  - 已取得的：顯示名稱，加上詞綴摘要（`itemLines` 裡的 power 或 lore 那一行）。
- 本道（mainline）顯示「不限地區的傳說」。

- [ ] **Step 1: 寫失敗的測試**
  - `a regional card lists its two specials and its set, unknown until obtained`；
  - `an obtained special shows plainly`；
  - `no silhouette image without art`。
- [ ] **Step 2: 執行測試，確認失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/ui2/scenes/gate.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行測試，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): portal cards show region-only gear`

### Task 13: 平衡模擬加入隨機裝備的期望值

**Files:**
- Modify: `engine/sim.ts`, `engine/balance.test.ts`

**Interfaces:**
- Consumes：Task 3 的 `rollGear`、`itemLevel`；Task 4 的 `SLOTS`、`slotsFor`。
- Produces：
  - `export function kitParty(level: number, depth: number, seed: number, rarity?: Rarity): Party`
    - 以 `partyAt(level)` 為基礎，每位成員的 9 格各穿 1 件 `rollGear` 產生的裝備；
    - 來源 monster，`depth` 照參數，`region: 'mainline'`，rng 是 `mulberry32(seed)`；
    - 如果給了 `rarity`，就強制那個稀有度，給測試 11 用。
  - `winRate(level, groups, boss, seeds, scale, altar, kitSeed?: number)`：有 `kitSeed` 時，改用 `kitParty(level, scale?.depth ?? 1, kitSeed)` 當隊伍。
  - `simBattle` 的簽名不變。
- 第 1–9 項維持沒穿裝備，數字不可改。

- [ ] **Step 1: 寫失敗的測試**
  - 在 `balance.test.ts` 加入：
    - `10. random gear in expectation keeps the bands`：
      - 對 d = 4、6、8、10，region 是 mainline 和 blaze；
      - kitSeed 1–5 各跑 8 個戰鬥種子，取平均；
      - 勝率 ≥ 0.85；hpLoss 在 0.1 到 0.45 之間。
    - `11. a full rare kit does not one-round a boss`：
      - 對深度 5 和 10 的頭目（`scale: { depth, region: 'mainline' }`，敵人 `['lanterneater']`）；
      - 直接呼叫 `simBattle`，隊伍是 `kitParty(depthLevel(d), d, seed, 'rare')`，seed 取 1–20；
      - 每一場的 `rounds` 都 ≥ 3。
  - 這兩項是新的門檻，不是放寬舊的。
- [ ] **Step 2: 執行測試，確認失敗**
  - Run：`npx vitest run src/scripts/games/starlantern/engine/balance.test.ts --testTimeout=20000`
  - Expected：FAIL，原因是 `kitParty` 不存在。
- [ ] **Step 3: 實作 `kitParty`**
  - 測試 10 或 11 如果沒過，可以調的只有 `AFFIX_SCALE`（Task 2）。調整後，Task 3 的詞綴範圍測試要跟著過，因為測試是依 `AFFIX_SCALE` 計算的。
- [ ] **Step 4: 執行測試，確認通過**
  - 第 1–11 項全部通過。
- [ ] **Step 5: commit**
  - 訊息：`test(starlantern): balance with the expected value of random gear`
  - 如果調過 `AFFIX_SCALE`，在訊息裡寫出最後的值。

### Task 14: 端對端、全套測試、截圖與審查

**Files:**
- Modify: `tests/e2e/starlantern.spec.ts`

- [ ] **Step 1: e2e `gear drops, comes home and is worn`**
  - 出發後，用 `__starlanternDebug.game.run.loot.gear.push(...)` 放進一件傳說；
  - 用歸還之燈回城，確認回城訊息列出它；
  - 進公會的「裝備」，在人形格選武器，再從背包選它；
  - 比較列出現 `.slx-up`；
  - 「狀態」的「能力」顯示主屬性分類，並有套裝或主屬性的來源欄；
  - 全程不得有 console error。
- [ ] **Step 2: e2e `a rare chest drop raises a pillar`**
  - 用 debug 在 `run.rolls` 預先放一件稀有物品，再走上寶箱；
  - 畫面出現 `.slx-pillar.slx-rarity-rare`。
- [ ] **Step 3: 跑全套並截圖**
  - 執行 `npx vitest run --testTimeout=20000` 全套，以及 e2e 全套。
  - 截圖：裝備頁（每種稀有度至少各 1 件）、物品比較、能力分類、各稀有度的光柱、傳送門卡片的限定裝備。
- [ ] **Step 4: 審查**
  - 派一個沒參與開發的 opus 代理，用 `~/.claude/skills/review-pr/SKILL.md` 審查本計畫的 diff，並處理它找到的問題。
- [ ] **Step 5: commit**
  - 訊息：`test(starlantern): loot core end-to-end`

---

## 與 spec 的衝突與缺口（實作前請使用者確認）
1. **限定裝備的範圍**：§5 說「只有少數」獨特、傳說、套裝是地區限定，暗示也有不限地區的獨特和套裝；但 spec 只定義了不限地區的傳說。本計畫的作法：不限地區的只有 8 件傳說（每位角色 1 件），獨特與套裝全部是地區限定。
2. **主屬性換算會重複計算**：§3 說主屬性「依角色的係數」換算，但舊的 7 項本來就已經包含成長。本計畫的作法：自然主屬性只顯示、不換算；只有裝備和套裝給的主屬性才換算。
3. **自動分解**：分解要等 5c 的鍛造屋。本計畫的作法是「只標記」，不自動賣掉，理由如下：
   - 標記可以反悔，自動賣掉不能；
   - 撿到之後，玩家還來得及看一眼；
   - 5c 可以直接把「已標記」改成「一鍵分解」，換成精華，不必再改設定的語意。
4. **光柱和美術政策**：§8 要求光柱，美術政策禁止用 CSS 畫物品。本計畫把光柱當成程式效果（漸層加動畫），和現有的 `slx-status-rays` 同類。如果使用者認為光柱也要走美術流程，Task 11 只要改 SCSS。
5. **傳送門的剪影需要圖示**：圖示要等 5d，所以 5a 先用「名稱（未取得）」代替，圖示到位後自動變成剪影。
6. **傳說特效綁的是現有技能 id**：5b 會把技能放進技能樹。如果 5b 改了技能 id，`POWERS` 必須跟著改。
7. **「易傷加成」沒有對應的狀態**：遊戲裡沒有易傷狀態。本計畫定義為「打中弱點時的額外傷害」。
8. **敵人的新屬性會讓深處的戰鬥變難**：§3 要求敵人有暴擊、閃避、元素抗性；§10 要求勝率維持在現有範圍。本計畫的作法：用 `compensation` 降低敵人的 HP 和攻擊，讓沒穿裝備時難度不變。這等於「深處的怪更會閃、更會暴擊，但比較脆」。
9. **稀有素材的歸屬**：素材目錄屬於 5c，但精英的 TODO（`engine/game.ts:343`）和寶庫的佔位（`engine/events.ts:51-53`、`engine/game.ts:262`）現在就需要稀有素材。本計畫先建立 `star-tear` 和 `king-scale` 兩個 id；「每種素材都有用途」的測試由 5c 負責。
10. **commit 署名不一致**：專案 `CLAUDE.md` 寫的是 `Co-Authored-By: Claude <noreply@anthropic.com>`，本計畫照使用者的指示，用 `Claude Opus 5.5`。
