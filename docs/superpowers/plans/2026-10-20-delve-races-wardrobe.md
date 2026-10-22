# DELVE 種族與造型擴充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 DELVE 加入五種族（外觀＋小被動）、8 套新服裝、4 髮型、4 頭飾，修正紙娃娃調色盤 snap bug 並做一輪畫質修整，放大外觀預覽。

**Architecture:** 外觀仍是純索引資料（`engine/appearance.ts`），新增 `race` 欄位；種族被動放新檔 `engine/race.ts`（純函式），由 `game.ts` 既有的數值計算點讀取。美術全部程式繪製：種族耳 / 角在 `render/avatarHead.ts`，尾巴在 `render/avatarArt.ts` 的 back 層，矮人重用 `render/folkArt.ts dwarfify()`。

**Tech Stack:** TypeScript、Canvas2D、自製 `Bmp`（`render/pixel.ts`）、vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-20-delve-races-wardrobe-design.md`

所有路徑相對 `src/scripts/games/delve/`，除非以 `tests/` / `src/pages/` 開頭。

## Global Constraints

- 美術只用程式繪製；新顏色必須加進 `PALETTE_HEX` 或 `AVATAR_*_HEX`（否則 `avatarArt.test.ts clean()` 失敗）；不得有 alpha < 255 的像素。
- `race` 缺值或壞值 → 0（人類）；`SAVE_FORMAT` 維持 9。
- 種族被動數值（逐字）：human `xpPct: 10`；elf `light: 1`；dwarf `mineMul: 1.15`；catfolk `safeFall: 6, jumpMul: 1.08`；dragonkin `burnMul: 0.5, lavaMul: 0.75`；其餘欄位為中性值（0 或 1）。
- 種族被動加在 `SKILL_CAPS` 之外（不吃技能上限）。
- 單元測試：`npx vitest run src/scripts/games/delve`；e2e：`npx playwright test tests/e2e/delve.spec.ts --project=chromium`。`npm test` 是 watch 模式，禁用。
- 樣式禁 `!important`、禁行內樣式。
- Commit：Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. 舊 localStorage `delve.appearance`（無 `race`）與舊存檔 `header.appearance` → 人類、其他欄位不變（Task 2 測試）。
2. 每個帽子 / 頭盔 × 每個種族：帽緣上方不露耳 / 角、眼口不被遮（Task 4 測試，擴充 `avatarArt.test.ts:185/:203` 迴圈）。
3. 矮人 × 手持物：`faceGuard` 仍讓武器不蓋臉（Task 4 測試）。
4. 面向左（鏡像）時尾巴在身後側、耳朵左右對稱（Task 4 測試）。
5. 遊戲中途在選單換種族 → 被動立即生效（Task 3 測試）。

---

### Task 1: 修正 snap 把 avatar 專用色錯映射

**Files:**
- Modify: `render/pixel.ts:106`（`snap()`）
- Test: `render/pixel.test.ts`（若不存在則建立）

**Interfaces:**
- Produces: `snap(c)` 對 `inPalette(c)` 為真的顏色原樣回傳。

- [ ] **Step 1: 寫失敗測試** `snap keeps avatar-only colours`：`snap(hex('#5a2a4a'))`（櫻粉髮外框）等於原值；`snap(hex('#8a4038'))`（膚色外框）等於原值；`toCanvas(dollPreview(預設女外觀...))` 讀回的像素中含 `#5a2a4a` 且不含 `#423f54`。
- [ ] **Step 2:** `npx vitest run src/scripts/games/delve/render/pixel.test.ts` → FAIL。
- [ ] **Step 3:** `snap()` 開頭加 `if (inPalette(c)) return c;`。
- [ ] **Step 4:** 跑整個 delve 測試套件 → PASS（注意 `sprites.ts:483/518` 手臂顏色會隨之改變，相關測試若斷言舊色要更新並說明原因）。
- [ ] **Step 5: Commit** `fix(delve): keep avatar-only colours when snapping (no grey ghost ring on hair)`

### Task 2: 種族資料模型與被動表

**Files:**
- Modify: `engine/appearance.ts`（`Appearance` 加 `race: number`；`RACES`；`BODY_DEFAULTS` 兩筆加 `race: 0`；`APPEARANCE_FIELDS` 在 `body` 後插入 `{ key: 'race', label: '種族', kind: 'list', options: RACES, group: 'body' }`；`appearanceKey` 加 `a.race`；`randomAppearance` 隨機種族）
- Create: `engine/race.ts`
- Test: `engine/appearance.test.ts`、`engine/race.test.ts`、`save/serialize.appearance.test.ts`

**Interfaces:**
- Produces:
  - `export const RACES: readonly AppearanceOption[]` = `human 人類 / elf 精靈 / dwarf 矮人 / catfolk 貓族 / dragonkin 龍裔`（索引 0..4，順序固定）
  - `export type RaceId = 'human' | 'elf' | 'dwarf' | 'catfolk' | 'dragonkin'`
  - `export function raceId(a: Appearance): RaceId`（在 appearance.ts）
  - `export interface RaceMods { xpPct: number; light: number; mineMul: number; safeFall: number; jumpMul: number; burnMul: number; lavaMul: number }`
  - `export function raceMods(race: number): RaceMods`（壞索引 → human）
  - `export const RACE_BLURB: Record<RaceId, string>`（外觀畫面一行說明，例：`'矮人：挖掘速度 +15%'`）

- [ ] **Step 1: 失敗測試**：
  - `normalizeAppearance({...舊外觀無 race})` → `race === 0`，其他欄位不變；`race: 7` → 0；`race: 3` → 3。
  - `appearanceKey` 只改 race 時 key 不同（既有 `:135` 迴圈會自動涵蓋新欄位，確認之）。
  - `raceMods(2).mineMul === 1.15`；`raceMods(4).burnMul === 0.5 && lavaMul === 0.75`；`raceMods(3)` 的 `safeFall === 6`、`jumpMul === 1.08`；`raceMods(1).light === 1`；`raceMods(0).xpPct === 10`；`raceMods(99)` 深等於 `raceMods(0)`。
  - serialize：沒有 `race` 的舊 header 讀回 race 0。
- [ ] **Step 2:** 跑測試 → FAIL。
- [ ] **Step 3:** 實作上述介面。
- [ ] **Step 4:** delve 全套 → PASS（`npcs.ts:209 validIdent` / `settlement.ts:664` 吃 normalize，舊 settler 應自動得 race 0）。
- [ ] **Step 5: Commit** `feat(delve): race field and race passive table`

### Task 3: 種族被動接進遊戲數值

**Files:**
- Modify: `engine/game.ts`（`currentPick()` :1209 乘 `mineMul`；`moveStats()` :1236 `jumpMul` 乘上；`updateFall()` :2145 安全格數 +`safeFall`；`updateLiquid()` :2179 燃燒 `BURN_DMG` 乘 `burnMul`（四捨五入、至少 1）、岩漿傷害 :2209 乘 `lavaMul`；`heldLights()` :1745 night 項加 `light`；`addXp` :3604 或 `levels.ts:189 gain()` 乘 `(1 + xpPct/100)`）
- Test: `engine/race.game.test.ts`

**Interfaces:**
- Consumes: `raceMods(race)`（Task 2）。
- Produces: `DelveGame.raceMods(): RaceMods`（讀當前 `appearance.race`，每次呼叫即時算，不快取 → 中途換種族立即生效）。

- [ ] **Step 1: 失敗測試**（用既有 game 測試的建構方式建 `DelveGame`，同 seed 比較）：
  - 矮人挖同一格石頭所需 tick 數 < 人類。
  - 貓族從 26 格高落下不受傷，人類受傷（`SAFE_FALL_TILES = 24`）。
  - 龍裔站岩漿 1 秒受傷 < 人類。
  - 人類 `addXp(100)` 得到的經驗 > 精靈。
  - `setAppearance({...app, race: 2})` 後下一次 `raceMods().mineMul === 1.15`。
- [ ] **Step 2:** FAIL。
- [ ] **Step 3:** 在各計算點乘 / 加入種族值。
- [ ] **Step 4:** delve 全套 PASS。
- [ ] **Step 5: Commit** `feat(delve): race passives affect mining, jump, fall, burn, lava, light and xp`

### Task 4: 種族外觀美術

**Files:**
- Modify: `render/avatarHead.ts`（`HeadOpts` :24 加 `race: RaceId`；精靈耳、貓耳畫在頭兩側 / 頂；龍角畫在前層；`o.gear` 有帽子時：貓耳 / 龍角不畫，精靈耳照畫但不超出帽緣下方規則）
- Modify: `render/avatarArt.ts`（尾巴：貓族 / 龍裔在 back 層、隨走路幀擺動；矮人：玩家也走 `dwarfify()`，男性體型帶 `beardRamp(hairColor)` 鬍子，女性不帶）
- Modify: `render/heldLayout.ts:25`（`faceGuard` 加種族頭部位移參數 `headDy`）
- Modify: `render/avatarPalette.ts`（龍角 / 鱗色若需新色）
- Test: `render/avatarArt.test.ts`、`render/avatarFit.test.ts`、`render/heldLayout.test.ts`（若有）

**Interfaces:**
- Consumes: `raceId(app)`（Task 2）、`dwarfify(frame, beard, shrink, skin)`（`folkArt.ts:65`）。
- Produces: `export function raceHeadDy(race: RaceId): number`（在 `avatarArt.ts`；dwarf → 2，其餘 0）。

- [ ] **Step 1: 失敗測試**：
  - 五種族的 idle 第 0 幀兩兩剪影差 ≥ 30 px（同 `avatarFit.test.ts:183` 的比法）。
  - 精靈頭部寬度 > 人類頭部寬度（耳朵突出）。
  - 貓族 / 龍裔：面向右時尾巴像素的平均 x < 身體中心 `CX`；鏡像後 > `CX`。
  - 走路 8 幀中尾巴像素至少出現 2 種不同位置（會擺）。
  - 把 `avatarArt.test.ts:185`（帽緣上方無髮）與 `:203`（帽子不遮眼口）、`avatarFit.test.ts:37`（每幀 ≥1px 邊距）的 `looks()` 迴圈擴充為 × 五種族。
  - 矮人 idle 頭頂比人類低 2 px；`faceGuard` 在矮人時仍讓所有 `heldLayout` 既有案例不蓋臉。
  - 矮人男有鬍子（下巴下方出現 `beardRamp` 顏色）、矮人女沒有。
- [ ] **Step 2:** FAIL。
- [ ] **Step 3:** 實作美術。耳 / 角 / 尾巴用該部位的 ramp 三階明暗＋ `selOutline`。
- [ ] **Step 4:** delve 全套 PASS（含烘焙 < 250 ms，`avatarArt.test.ts:277`）。
- [ ] **Step 5: Commit** `feat(delve): elf ears, cat ears and tail, dragon horns and tail, dwarf player body`

### Task 5: 4 髮型 + 4 頭飾

**Files:**
- Modify: `engine/appearance.ts`（`HAIR_STYLES` 末尾加 `lowpony 低馬尾`、`wolf 狼尾`、`wavy 大波浪捲`、`sidepart 側分長瀏海`；`ACCESSORIES` 末尾加 `crown 小皇冠`、`headphones 耳機`、`foxmask 狐狸面具`、`hairpin 髮簪`——**只能加在末尾**，舊索引不變）
- Modify: `render/avatarHead.ts`（`HAIR` :86 表、back paint :432-459、`sideAcc` :542）
- Modify: `engine/folkDefs.ts:199-200`（`rng.int(0,9)` / `rng.int(0,6)` 改為 `HAIR_STYLES.length` / `OUTFITS.length`）
- Test: 既有迴圈會自動涵蓋；`engine/appearance.test.ts:27` 最低數量改為 hair ≥ 13、acc ≥ 10。

- [ ] **Step 1:** 改最低數量測試 → FAIL。
- [ ] **Step 2:** 實作；既有測試（髮型兩兩剪影 ≥30px、帽緣、邊距、`clean()`、互不相同）自動驗證新項目。
- [ ] **Step 3:** delve 全套 PASS。
- [ ] **Step 4: Commit** `feat(delve): four hairstyles and four head accessories`

### Task 6: 8 套新服裝

**Files:**
- Modify: `engine/appearance.ts`（`OUTFITS` 末尾依序加：`ninja 忍者裝束 [black, red]`、`mage 魔導長袍 [purple, khaki]`、`knight 騎士罩袍 [navy, white]`、`qipao 旗袍 [red, orange]`、`pirate 海盜外套 [brown, white]`、`idol 偶像舞台裝 [pink, sky]`、`priest 神官袍 [white, khaki]`、`gothic 哥德洋裝 [black, purple]`）
- Modify: `render/avatarArt.ts`（`legStyle()` :126、`lowerFront()` :234、`topFront()` :280、`avatarArm()` :349 / `armSleeve()` :365 各加分支）
- Test: `engine/appearance.test.ts:27` outfit ≥ 14；新增 `every outfit torso uses ≥3 shades of its cloth ramps`（idle 第 0 幀、軀幹列範圍內，計數屬於 `clothRamp(color1)` ∪ `clothRamp(color2)` 的不同色）。

- [ ] **Step 1:** 寫測試 → FAIL。
- [ ] **Step 2:** 實作 8 套（各自要有辨識特徵：忍者＝圍巾＋綁腿、魔導＝長袍下襬＋寬袖、騎士＝十字罩衫＋腰帶、旗袍＝立領＋側開衩、海盜＝長外套＋寬腰帶＋靴、偶像＝蓬裙＋荷葉邊、神官＝長袍＋披肩、哥德＝多層裙＋蕾絲）。
- [ ] **Step 3:** delve 全套 PASS（服裝兩兩不同、`clean()`、邊距、烘焙時間）。
- [ ] **Step 4: Commit** `feat(delve): eight new outfits`

### Task 7: 既有紙娃娃畫質修整

**Files:**
- Modify: `render/avatarArt.ts`（既有 6 套服裝的 `topFront` / `lowerFront`、`avatarArm`）、`render/avatarHead.ts`（`shadeHair`）
- Test: `render/avatarArt.test.ts`

- [ ] **Step 1: 失敗測試**：
  - Task 6 的「≥3 階明暗」測試改為涵蓋**全部 14 套**（既有 6 套若不足即 FAIL）。
  - `front arm is separated from torso`：idle 第 0 幀，前臂像素與軀幹像素相鄰處至少一側是外框色（`clothRamp(...)[0]` / 膚色 ramp[0] / `INK`）。
  - 每個髮型的前髮至少 3 種 `hairRamp` 階。
- [ ] **Step 2:** FAIL（記錄哪些服裝 / 髮型不合格）。
- [ ] **Step 3:** 補明暗（左上亮、右下與摺痕暗）、手臂外框。
- [ ] **Step 4:** delve 全套 PASS。
- [ ] **Step 5: Commit** `feat(delve): three-tone shading and readable arms on the paper doll`

### Task 8: 外觀畫面：種族列、大預覽、轉向

**Files:**
- Modify: `render/wardrobe.ts`（種族列自動由 `APPEARANCE_FIELDS` 產生；在種族列右側說明區顯示 `RACE_BLURB`；新增 `#delve-wr-turn` 按鈕切換預覽面向，`REEL` 加入 `jump`）
- Modify: `src/pages/games/delve.astro:1096-1131`（預覽桌面改 6×：畫布 56×58 → 內容 336×348；≤ 768px 寬 4×；≤ 480px 3×；維持整數倍）
- Test: `tests/e2e/delve.spec.ts`

- [ ] **Step 1: 失敗 e2e**（加在 `:1449` describe 內）：
  - `wardrobe race row`：開 `#delve-look`，`[data-key="race"]` 存在且在 `[data-key="body"]` 之後；按右鍵三次 → `data-value="3"`；完成後 localStorage `delve.appearance` 的 `race === 3`。
  - `wardrobe preview turns`：點 `#delve-wr-turn` 前後 `#delve-wr-doll` 的 `toDataURL()` 不同。
  - 既有 `:2240 expectCrisp` 不改、需仍通過；另加桌面 viewport 下 `#delve-wr-doll` clientWidth === 336。
- [ ] **Step 2:** `npx playwright test tests/e2e/delve.spec.ts --project=chromium -g "wardrobe"` → FAIL。
- [ ] **Step 3:** 實作。
- [ ] **Step 4:** 整個 `tests/e2e/delve.spec.ts` PASS；delve vitest 全套 PASS。
- [ ] **Step 5: Commit** `feat(delve): race picker, larger turnable wardrobe preview`

### Task 9: 收尾驗證

- [ ] `npx vitest run`（全專案）全綠。
- [ ] `npx playwright test tests/e2e/delve.spec.ts --project=chromium` 全綠。
- [ ] `npm run build` 成功。
- [ ] 產生對照圖頁（scratch，不入庫）：五種族 × 14 服裝 × 2 體型的 idle 縮圖，給使用者用 4330 網址檢視。
