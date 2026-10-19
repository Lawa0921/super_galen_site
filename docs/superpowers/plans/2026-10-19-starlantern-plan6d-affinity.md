# 星燈迷宮 計畫 6d：好感度引擎（羈絆、送禮、選項、終幕之後、戀愛） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出好感度（`bond`）的整套引擎：9 位夥伴各自 0–100 的好感度與 5 個階段、四種來源（對話選項、送禮、記憶碎片、同隊探索與戰鬥）、1–4% 的小幅戰鬥加成與第 21 項平衡帶、旅館的「談心」「送禮」「星燈祭之夜」、終幕之後的星燈祭與後日談、一經選定不能改的戀愛結局，以及介面上的顯示。所有羈絆文字都是 `bondPh()` 暫定文案，留給 6e 寫。

**Architecture:**
- **好感度是紀錄，不是分數。** `Member.bond` 只存三樣東西：對話分（`talk`）、同隊分（`field`）、收下的禮物（`gifts`）。總分由純函式 `bondPoints(m)` 從紀錄和 `memoriesOf(m)` 推出來，所以舊存檔不必補值，四種來源各有上限，「刷一種來源到頂」在資料結構上就不可能。
- **不用任何亂數。** 每一分都是已發生事件的純函式（下樓、戰鬥旗標、送了什麼、選了哪個語氣）。`bond draws nothing` 測試鎖住：開關好感度的累積，`game.rng`、`lootRng`、`memoryRng` 的抽取次數與掉落逐一相同。
- **存檔不升版本。** 新欄位全部可選：`Member.bond?`、`StoryState.gifted? talked? romance? heard?`。版本 8 的存檔原樣可讀，讀到的好感度 = 10 ＋ 3 × 已找回的碎片。
- **加成是一個新的屬性來源 `bond`。** 只看她的天生數值（`base` ＋ `growth`），只加 `hp atk def mag res`。平衡模擬的 `partyAt` 不帶 `bond`，所以第 1–20 項逐位元不變；新檔 `engine/balance.bond.test.ts` 的第 21 項用「全員心契」重跑同樣的門檻，紅了只能調低 `BOND_PCT`。
- **羈絆場景不進回城佇列。** 玩家在旅館「談心」主動開啟，每次回城最多一段；每段剛好一個選項，沒有錯的答案。終幕之後：星燈祭排在回城佇列第一，後日談佔回城對話的名額，戀愛由「星燈祭之夜」明確選擇。
- **文字與引擎分家。** 新檔 `data/bond.zh-TW.ts` 放羈絆場景、送禮反應、戀愛後的城鎮台詞，帶自己的 `BOND_PLACEHOLDERS`；`buildScenes` 把它的場景併進 `STORY.scenes`，所以 6c 的全部文字閘門（字數、用字、說話者、劇透位置）自動套到 6e 要寫的文字上。`data/story.zh-TW.ts` 的 `PLACEHOLDERS.size === 0` 不受影響。
- **順手修 6c 留下的重看問題。** 手冊重看改用「第一次播放時」的條件讀法（`StoryState.heard`），歐里克的重逢不再在重看時出現兩次（Task 6.5）。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e。

**Spec:**
- `docs/superpowers/specs/2026-10-18-starlantern-affinity-expressions-design.md`（下稱「spec §」）：全文，約束力最高；§11.2 是本計畫的任務表，§12.2 是驗收。
- `docs/superpowers/specs/2026-10-19-starlantern-monster-roster-design.md`（下稱「名冊 spec §」）：§7.4（`GIFTABLE` 由 `kind` 推導）、§12.3（和 6d 的檔案順序）。
- 前一份計畫：`docs/superpowers/plans/2026-10-18-starlantern-plan6c-writing.md`；SDD 紀錄 `.superpowers/sdd/2026-10-18-starlantern-plan6c-writing/progress.md`（接手項見文末「6c 接手項的處理」）。
- 文風與設定：`docs/superpowers/story/starlantern-style-bible.md`、`docs/superpowers/story/starlantern-lore-ledger.md`（本計畫不寫劇情，只在 Task 1 的審查時對照喜好表）。

> 沒有以 `src/`、`tests/`、`docs/`、`tmp/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。本計畫的 SDD 紀錄目錄是 `.superpowers/sdd/2026-10-19-starlantern-plan6d-affinity/`。

## Global Constraints

**開工條件**
- 6c 的 Task 15 已經合併（6d 要改 `ScriptLine`、`linesWhen`、`SceneId` 與 `story.test.ts`，這些是 6c 寫作期間的共用檔，spec §11.5）。
- 名冊計畫 7a 改 `battle.ts`、`game.ts`、`dungeon/run.ts` 的 Task 2、3、5–8 已經合併；沒有的話，7a 暫停到本計畫 Task 4 合併之後（名冊 spec §12.3）。見文末「跨計畫錨點」。

**分支與基準**
- `feat/starlantern-story`。工作樹裡有別人沒提交的檔案（例如 `docs/superpowers/plans/2026-10-17-starlantern-plan5d-art.md`、美術檔），一律不碰、不 add。

**測試與檢查**
- TDD：每個任務先寫失敗的測試，確認它因為正確的理由失敗，再實作。
- 單檔：`rtk proxy npx vitest run src/scripts/games/starlantern/<路徑>`。
- 全套：`rtk proxy npx vitest run --testTimeout=20000`，讀輸出的「Test Files」與「Tests」兩行。不可以用 `npm run test`（watch 模式會卡住）。
- 平衡：`BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.test.ts src/scripts/games/starlantern/engine/balance.lineups.test.ts src/scripts/games/starlantern/engine/balance.deep.test.ts src/scripts/games/starlantern/engine/balance.pace.test.ts src/scripts/games/starlantern/engine/balance.bond.test.ts --testTimeout=300000`
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。**只用 4352 埠**；4354 是使用者的開發伺服器，4321 屬於別的 worktree，兩個都不可以碰。
- tsc：`npx tsc --noEmit`。repo 原本就有的錯誤（astro:content、bomber、tetris、hp-click）不算；完成條件是 starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個錯誤。
- 本專案沒有 prettier、eslint，不要去跑。
- 瀏覽器一律 headless 加 `--mute-audio`，絕不接管使用者的桌面。

**決定性**
- 好感度不使用任何 rng。禁止 `Math.random`；禁止為了好感度多抽 `game.rng`、`lootRng`、`memoryRng` 或任何由 `run.seed` 衍生的串流（spec §4.6）。
- 城鎮台詞池加入戀愛台詞時，只是池子變大，`game.rng()` 的抽取次數不變。

**存檔**
- `SAVE_VERSION` 維持 8，不觸發 `save-reset`。舊存檔（沒有任何新欄位）必須讀成 `ok`。所有新欄位都經過有預設值的存取函式讀（`bondOf`、`giftedOf`、`talkedOf`、`heardOf`），`loadGame` 不補值。

**平衡（凍結）**
- `engine/balance.test.ts`、`balance.lineups.test.ts`、`balance.deep.test.ts`、`balance.pace.test.ts` 一個字都不改；第 1–20 項的報告數字在本計畫前後逐位元相同。
- `ENEMY_POWER`（含 ramp）、`DEEP_ENEMIES`、`PARTY_SCALE`、`GROUP_CAP`、`FIRST_DEPTH_CAP`、`BOSS_PARTY_SCALE`、`FINALE_BOSS`、`MEMORY_SCALE`、記憶的價值、每一個門檻：一律不動。
- 第 21 項紅了，**只能調低 `BOND_PCT`**（spec §5.3）。平衡只對照預設配點（使用者規則）；`data/hero.test.ts` 的峰值護欄必須綠。
- `it.fails`、`it.skip`、`.only`、`.todo` 一律不可以出現在任何 commit。

**文字**
- 本計畫**不寫**任何羈絆場景、送禮反應、選項、後日談、星燈祭、戀愛文字。全部用 `bondPh(label)` 暫定文案（Task 5 建立），6e 取代。
- 暫定文案也要通過 6c 的文字閘門：全形標點、沒有英文與阿拉伯數字（用 `numeral()`）、每句 ≤ `MAX_LINE_CHARS`。
- 介面文字（指令名、標籤、階段名稱、數字）只放 `data/text.zh-TW.ts`，可以用阿拉伯數字。
- 不改 6c 已經寫好的任何劇情字串。**終幕剛好 12 句，不改、不加條件。**
- 程式裡好感度一律叫 `bond`，不可以用 `affinity`（那是主屬性取向，spec §2.1 第 4 點）。

**美術**：不新增任何圖片、假圖示、假頭像，也不用 CSS 畫形狀。`allArtUrls()` 維持 246（`render/artPaths.test.ts`），`render/artPaths.ts` 不改。沒有立繪的表情照 6c Task 7.5 的規則顯示 `normal`。

**樣式**：不新增 `!important`、行內樣式或 JS 的 `element.style`；新的介面一律用既有元件（`MenuView`、`Dialogue`、`confirmBox`、`win`、手冊的清單與 `slx-fresh`）。需要新 class 時加進既有的 SCSS partial。

**換行**
- 改檔前用 `git ls-files --eol <檔案>` 確認；改完看 `git diff --stat`，整檔重寫代表換行壞了，要修好。CRLF 檔不可以用 `sed -i`。新檔一律 LF。
- 本計畫會碰到的檔案（寫計畫時量的）：
  - LF：`data/story.zh-TW.ts`、`data/story/scenes.ts`、`data/story/story.test.ts`、`engine/dungeon/run.ts`、`engine/dungeon/run.test.ts`、`engine/story/events.ts`、`engine/story/events.test.ts`、`engine/story/handbook.ts`、`engine/story/handbook.test.ts`、`ui2/story.ts`、`ui2/story.test.ts`、`ui2/scenes/handbook.ts`、`ui2/scenes/handbook.test.ts`、`ui2/scenes/statusTabs.ts`、`engine/sim.test.ts`、`tests/e2e/starlantern.spec.ts`
  - CRLF：`engine/types.ts`、`engine/state.ts`、`engine/save.ts`、`engine/party.ts`、`engine/sim.ts`、`engine/game.test.ts`、`engine/battle.test.ts`、`ui2/scenes/town.ts`、`ui2/scenes/status.test.ts`
  - 混用（照每一行原本的格式，新行跟著上下文）：`engine/game.ts`、`engine/battle.ts`、`engine/combatant.ts`、`engine/save.test.ts`、`engine/party.test.ts`、`data/text.zh-TW.ts`、`ui2/scenes/inn.ts`、`ui2/scenes/inn.test.ts`、`ui2/scenes/town.test.ts`
  - 新檔（LF）：`data/story/bond.ts`、`data/story/bond.test.ts`、`engine/story/bond.ts`、`engine/story/bond.test.ts`、`data/bond.zh-TW.ts`、`data/bond.test.ts`、`engine/balance.bond.test.ts`

**git**
- 一律寫出完整路徑，不可以用 `git add -A` 或 `git add .`。
- Conventional Commits，訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 絕對不可以執行 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`（有沒有帶路徑都一樣）。要撤回自己的修改，就再改一次檔案。
- 不可以 push；不可以碰 `.env`、智能合約、`public/` 或 `art-factory/`。截圖放 `tmp/`，絕不 commit。

**子代理**：實作者不派任何子代理。

**定位程式碼**：一律用內容（函式名、測試名、字串）找要改的地方，不用行號。

**測試修改規則**：某個任務會弄壞的每一個測試檔都列在該任務的 Files 裡，並寫明怎麼改。全套跑出沒列到的紅燈時，先停下來回報 NEEDS_CONTEXT，不可以自行改寫該測試的意圖。

## Review Focus
1. **舊存檔與中斷。** 版本 8、沒有任何新欄位的存檔讀成 `ok`，好感度 = 10 ＋ 3 × 碎片；`heard` 不存在時重看照舊用當下狀態。羈絆場景播到一半關掉遊戲：不加分、`talked` 不變、下次還能看；選了戀愛對象之後、戀愛結局播完之前重新載入：`romance` 已定、場景在佇列裡，下次回城播。測試：Task 2（舊檔）、Task 7（中斷的談心）、Task 8（中斷的戀愛）。
2. **好感度永遠不下降。** 全滅、坐冷板凳、婉拒、跳過、選非偏好的語氣、集滿記憶（口味痊癒）之後，分數都不變少；已收下的素材口味永不改變。測試：Task 5 的性質測試（任意一串操作，`bondPoints` 單調不減），Task 1 的列舉（每位夥伴 × 每種素材，痊癒前後收下過的素材值相同）。
3. **同一件事只計一次。** 同一段羈絆場景的選項（`bondChoice` 呼叫兩次、手冊重看）、同一層的下樓、一場戰鬥同時是精英又救命（兩項各自加，但都受這一趟的 4 分上限）、每趟上限在全滅與歸還之燈之後重新計算。測試：Task 4、Task 6。
4. **戀愛的份量。** 只有明確選擇才會成立；選了之後指令消失、`chooseRomance` 再呼叫回傳失敗、值不變；「和大家一起」不寫任何東西、下次回城指令還在；沒有人有資格時指令不出現。測試：Task 8。
5. **終幕之後的順序。** 終幕之後第一次回城，星燈祭排第一（在任何主角回憶與一般對話之前）；後日談從下一次回城開始、依 `CHARACTER_IDS` 輪流、佔掉回城對話的那一段；好感度 0 的人也輪得到；終幕之後才集滿的人也輪得到。測試：Task 8。

---

## File Structure
- `data/story/bond.ts`（新）：好感度的全部常數與表（`BOND_*`、`GIFTABLE`、`GIFT_TASTE`、`GIFT_MOOD`、`TONE_PREF`、`ROMANCEABLE`、`BOND_GATE`、`COMPANIONS`、型別 `Companion`、`BondTier`、`Tone`、`Taste`）。只有資料，沒有邏輯（Task 1）。
- `engine/story/bond.ts`（新）：好感度的純函式：推導（Task 1）、加成與 `maxBondRecord`（Task 3）、同隊加分（Task 4）、送禮與反應句索引（Task 5）、對話分（Task 6）、場景閘門與終幕之後的候選（Task 7、8）。
- `engine/types.ts`：`BondRecord`、`GiftId`、`Member.bond?`（Task 1）。
- `engine/state.ts`、`engine/save.ts`：`StoryState` 的可選欄位與 `validBond`、故事欄位的驗證（Task 2）。
- `engine/party.ts`、`engine/sim.ts`、`engine/balance.bond.test.ts`（新）：屬性來源 `bond`、`Lineup.bond`、第 21 項（Task 3）。
- `engine/combatant.ts`、`engine/battle.ts`、`engine/dungeon/run.ts`、`engine/game.ts`：`danger` 旗標、`Run.bond`、同隊加分（Task 4）；`game.give`（Task 5）、`bondChoice`（Task 6）、`openBond`（Task 7）、終幕之後（Task 8）、升階紀錄（Task 9）。
- `data/bond.zh-TW.ts`（新）、`data/bond.test.ts`（新）：`bondPh`、`BOND_PLACEHOLDERS`、`BOND_TEXT`（送禮反應、戀愛後台詞）、`BOND_SCENES`、`BOND_GUESTS`（Task 5、6、8）。
- `data/story.zh-TW.ts`、`data/story/scenes.ts`、`data/story/story.test.ts`：劇本格式（`ChoiceLine`、`if.tier`、`if.seen`）、新的 `SceneId`、`lineCap`、閘門擴充（Task 6）。
- `engine/story/events.ts`：`whenOf`、`sceneDone` 記下 `heard`（Task 6、6.5）；星燈祭與後日談（Task 8）。
- `ui2/story.ts`：重看用首播讀法（Task 6.5）；選項的播放（Task 7）。
- `ui2/scenes/inn.ts`、`ui2/scenes/town.ts`、`data/text.zh-TW.ts`：「談心」「送禮」、旅館的「新」（Task 7）；「星燈祭之夜」、戀愛台詞進城鎮池（Task 8）；升階的那一行（Task 9）。
- `engine/story/handbook.ts`、`ui2/scenes/handbook.ts`、`ui2/scenes/statusTabs.ts`：顯示（Task 9）。
- `tests/e2e/starlantern.spec.ts`：Task 10。

---

### Task 1: 好感度的資料與推導

**Files:**
- Create：`data/story/bond.ts`、`data/story/bond.test.ts`、`engine/story/bond.ts`、`engine/story/bond.test.ts`
- Modify：`engine/types.ts`（`GiftId`、`BondRecord`、`Member.bond?`）
- Read：spec §3、§4.1–§4.6、§6.1–§6.3、§7.2、§8.3、§9.1；名冊 spec §7.4；`data/materials.ts`、`engine/progression.ts`（`memoriesOf`）、`data/story/chains.ts`（`chainLength`）。

**Interfaces:**
- Produces（`engine/types.ts`）：
  - `type GiftId = string`（素材 id；哪些可以送由 `GIFTABLE` 決定）。
  - `interface BondRecord { talk: number; field: number; gifts: Partial<Record<GiftId, number>>; refused?: GiftId[] }`：`refused` 是她婉拒過的素材（只為了手冊顯示「婉拒」；不影響分數，見文末衝突第 3 點）。
  - `Member.bond?: BondRecord`，註解照 spec §4.1：洛恩永遠沒有；沒有欄位 = 還沒得到任何分。
- Produces（`data/story/bond.ts`；數值是 spec 的提案值，§13 的護欄內可以調，但本任務照抄）：
  - `type Companion = Exclude<CharacterId, 'hero'>`；`COMPANIONS: Companion[]` = `CHARACTER_IDS` 去掉 `hero`，順序不變。
  - `type BondTier = 0 | 1 | 2 | 3 | 4`；`BOND_TIER_AT = [0, 20, 40, 60, 85]`。
  - `BOND_MAX = 100`、`BOND_START = 10`、`BOND_PER_PIECE = 3`、`BOND_CAP = { talk: 12, gift: 30, field: 40 }`、`BOND_RUN_CAP = 4`。
  - `BOND_PCT: Record<BondTier, number> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 }`（百分比）；`BOND_SCALE = 1`。
  - `FIELD_POINTS = { floor: 1, strong: 2, saved: 2 }`、`DANGER_PCT = 30`。
  - `type Taste = 'loved' | 'liked' | 'neutral' | 'declined'`；`GIFT_VALUE = { loved: 4, liked: 2, neutral: 1 }`、`GIFT_REPEAT_FULL = 2`。
  - `type Tone = 'ask' | 'stay' | 'promise'`；`TALK_POINTS = { preferred: 3, other: 2, skipped: 2 }`。
  - `GIFT_KINDS: MaterialKind[] = ['monster', 'junk', 'rare', 'region']`；**`GIFTABLE: GiftId[]` 由 `MATERIALS` 依 `kind ∈ GIFT_KINDS` 推導，不寫死清單**（名冊 spec §7.4、§12.3：7b 新增的 `monster` 素材自動可送；`trophy` 等新種類不在 `GIFT_KINDS` 裡，自動不可送，7b 自己決定哪幾件戰利品打開）。今天推導出來剛好是 spec §6.1 的 18 種。
  - `GIFT_TASTE: Record<Companion, { loved: GiftId[]; liked: GiftId[]; declined: GiftId[]; healed: Partial<Record<GiftId, 'liked' | 'neutral'>> }>`，照 spec §6.2（沒列的是 neutral）：

    | 夥伴 | loved | liked | declined | healed |
    |---|---|---|---|---|
    | rin | dusk-cloth, thorn-fang | shade-crystal, star-tear | king-scale | ── |
    | selene | star-tear, crystal-shell | moss, ice-crystal, star-stone | old-coin | old-coin → liked |
    | chizuru | old-coin, moss | star-stone, crystal-shell | ice-crystal, frost-heart | ── |
    | safira | lizard-scale, king-scale | star-stone, bat-wing | blaze-core | blaze-core → liked |
    | sylvie | moss, thorn-fang | bat-wing, lizard-scale | mire-gland | mire-gland → neutral |
    | noel | storm-stone, crystal-shell | king-scale, star-tear | star-stone | star-stone → liked |
    | bobby | ancient-gear, iron-shard | star-stone, crystal-shell, storm-stone | mire-gland | ── |
    | liz | old-coin, king-scale | star-tear, ancient-gear | shade-crystal | shade-crystal → neutral |
    | scarlet | blaze-core, dusk-cloth | king-scale, star-stone | iron-shard | iron-shard → liked |

  - `GIFT_MOOD: Record<Companion, Record<Taste, StoryMood>>`：最愛 `smile`、喜歡 `smile`、普通 `normal`、婉拒 `sad`；最愛的覆寫：rin `averted`、noel `smug`、bobby `excited`、liz `scheming`、scarlet `serious`（spec §6.4）。
  - `TONE_PREF: Record<Companion, Tone>`：ask = safira、noel、bobby；stay = rin、sylvie、scarlet；promise = selene、chizuru、liz（spec §7.2）。
  - `ROMANCEABLE: Companion[] = COMPANIONS`（spec §9.1，保留這個名字當出處）。
  - `BOND_GATE: Record<Companion, Record<1 | 2 | 3 | 4, { tier: BondTier; pieces?: number; oath?: true }>>`（spec §8.3）：夥伴 `1: {tier 1, pieces 1}`、`2: {tier 2, pieces 3}`、`3: {tier 3, pieces 4}`、`4: {tier 4, pieces: chainLength(c)}`；凜 `1: {tier 1, pieces 2}`、`2: {tier 2, pieces 4}`、`3: {tier 3, oath}`、`4: {tier 4, oath}`。
- Produces（`engine/story/bond.ts`）：
  - `bondOf(m: Member): BondRecord`：沒有欄位時 `{ talk: 0, field: 0, gifts: {} }`。
  - `isHealed(m: Member): boolean` = `memoriesOf(m) >= chainLength(m.id)`。
  - `tasteOf(c: Companion, mat: GiftId, healed: boolean): Taste | null`：不在 `GIFTABLE` 是 `null`；declined 且 healed 且 `healed[mat]` 有值時回傳那個值。
  - `giftPoints(m: Member): number`：每種素材 `n` 份，`v = GIFT_VALUE[taste]`，得 `v × min(n, GIFT_REPEAT_FULL) + max(0, n − GIFT_REPEAT_FULL)`；**未封頂**。
  - `bondPoints(m: Member): number`：洛恩 0；其他 `clamp(BOND_START + BOND_PER_PIECE × memoriesOf(m) + min(talk, cap) + min(giftPoints, BOND_CAP.gift) + min(field, cap), 0, BOND_MAX)`。
  - `tierAt(points: number): BondTier`、`bondTier(m: Member): BondTier`（洛恩 0）。

- [ ] **Step 1: 寫失敗的測試**
  - `data/story/bond.test.ts`：
    - `GIFTABLE is every monster, junk, rare and region material`：等於 spec §6.1 的 18 個 id（排序後比對）；不含任何 `essence-*`、消耗品、碎片物品。
    - `GIFTABLE follows kind, not a list`：暫時往一份 `MATERIALS` 的拷貝加一個 `kind: 'monster'` 的假素材，用和 `GIFTABLE` 相同的推導函式（匯出 `giftableOf(materials)`）算，結果含它；加 `kind: 'essence'` 的不含。
    - `the taste table`：每位夥伴剛好 2 個 loved；每個鍵都在 `GIFTABLE`；同一個素材在同一人身上只出現在一格；`healed` 的鍵都在她的 `declined` 裡；表格逐格等於上面的表（寫成測試裡的字面值）。
    - `tone preferences, romance and gates`：`TONE_PREF` 三種語氣各 3 人；`ROMANCEABLE` 等於 9 位夥伴、不含 `hero`；`BOND_GATE` 逐列等於 spec §8.3（凜的 3、4 帶 `oath`）。
  - `engine/story/bond.test.ts`：
    - `bondTier thresholds`：`tierAt` 19→0、20→1、39→1、40→2、59→2、60→3、84→3、85→4、100→4。
    - `the hero has no bond`：`bondPoints(hero) === 0`、`bondTier(hero) === 0`。
    - `Rin starts at ten`：`newMember('rin')` 是 10；3 片記憶是 19。
    - `bondPoints follows the formula`：一組手算的紀錄（talk 7、field 13、gifts 兩種）得出手算值；超過各自上限的欄位被各自截斷；總和超過 100 截成 100。
    - `bond caps keep every single source and every pair below 心契`（spec §4.4、§12.2）：對凜與一位夥伴，四種來源各自加滿時 `bondTier ≤ 2`；任兩種加滿時 `bondPoints < 85`；四種全滿時 `bondPoints === 100`。「記憶加滿」用 `memories: chainLength(id)`，「送禮加滿」用填到 30 的紀錄。
    - `gift repeats fall to one`：最愛的同一種 1、2、3、4 份 = 4、8、9、10；普通的 3 份 = 3。
    - `a gift already taken never changes value`（Review Focus 2）：列舉每位夥伴 × `GIFTABLE` 每一種素材：只要那個素材在痊癒前可以收下（`tasteOf(c, mat, false) !== 'declined'`），`tasteOf(c, mat, false) === tasteOf(c, mat, true)`。
- [ ] **Step 2: 執行，確認失敗**（模組不存在）
- [ ] **Step 3: 實作** 上面的型別、常數與函式。`data/story/bond.ts` 只放資料與 `giftableOf`；邏輯全在 `engine/story/bond.ts`。
- [ ] **Step 4: 執行這四個測試檔與 `npx tsc --noEmit`，確認通過**
- [ ] **Step 5: commit**：`feat(starlantern): bond data and the score it derives`（訊息寫明「GIFTABLE is derived from material kind」，名冊 7b 以此為錨）

### Task 2: 存檔驗證（不升版本）

**Files:**
- Modify：`engine/state.ts`（`StoryState` 的可選欄位）、`engine/save.ts`（`validBond`、`isStory` 擴充、`romance` 的跨欄位檢查）、`engine/story/bond.ts`（存取函式）
- Test：`engine/save.test.ts`、`engine/story/bond.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `BondRecord`、`GIFTABLE`、`BOND_CAP`、`tasteOf`、`isHealed`、`ROMANCEABLE`、`COMPANIONS`。
- Produces（`engine/state.ts`，全部可選，`newStory()` 不改）：
  - `gifted?: Companion[]`：這次回城已經收過禮的人（出發時清空，Task 5）。
  - `talked?: boolean`：這次回城已經談過心（出發時清空，Task 7）。
  - `romance?: Companion`：戀愛對象，一經寫入永不改變（Task 8）。
  - `heard?: Partial<Record<SceneId, number[]>>`：場景第一次結束時真的播出（或會播出）的句子索引，只記有條件句的場景（Task 6.5）。
- Produces（`engine/story/bond.ts`）：`giftedOf(s: StoryState): Companion[]`、`talkedOf(s: StoryState): boolean`。
- Produces（`engine/save.ts`）：`validBond(id: CharacterId, m: Record<string, unknown>): boolean`，接在 `validMemory` 之後：
  - `hero` 有 `bond` 就是 false；
  - `talk` 是 0..`BOND_CAP.talk` 的整數，`field` 是 0..`BOND_CAP.field` 的整數；
  - `gifts` 是物件，鍵都在 `GIFTABLE`，值是 1..999 的整數，而且 `tasteOf(id, 鍵, isHealed(m)) !== 'declined'`；
  - `refused` 沒有或是不重複、都在 `GIFTABLE` 的陣列。
- `isStory` 加：`gifted` 沒有或是不重複的 `COMPANIONS` 清單；`talked` 沒有或是布林；`romance` 沒有或在 `ROMANCEABLE` 裡且 `finaleCleared` 為真；`heard` 沒有或是物件，每個鍵 `isSceneId` 而且在 `seen` 裡，每個值是遞增、不重複、0..199 的整數陣列。
- `isValid` 加（需要 party）：`romance` 存在時必須在 `party.recruited` 裡。

- [ ] **Step 1: 寫失敗的測試**（`save.test.ts`，沿用它既有的「做一份合法存檔再改一個欄位」的寫法）
  - `the save version stays 8`：`SAVE_VERSION === 8`。
  - `a version-8 save without bond fields loads, and bond reads from its memories`：讀回 `ok`；凜 4 片 → `bondPoints === 22`；一位已遇見、0 片的夥伴 → 10。
  - `a save with every bond field loads`：凜 `bond: { talk: 5, field: 12, gifts: { 'dusk-cloth': 2 }, refused: ['king-scale'] }`、`gifted: ['rin']`、`talked: true`、終幕已過的 `romance: 'rin'`、`heard: { prologue: [0, 1] }`（`prologue` 在 `seen`）→ `ok`。
  - 各自判為 `corrupt`：`hero.bond`；`talk: 13`；`field: 41`；`field: 1.5`；`gifts` 有 `essence-common`；`gifts` 值 0；凜收下 `king-scale`；瑟蕾沒集滿卻收下 `old-coin`（集滿時同一份存檔是 `ok`）；`refused` 重複；`gifted: ['hero']`；`gifted` 重複；`talked: 1`；`romance` 在 `finaleCleared` 為假時；`romance: 'hero'`；`romance` 是沒遇見的人；`heard` 的鍵不在 `seen`；`heard` 的值不遞增。
  - `bond.test.ts`：`giftedOf` 與 `talkedOf` 在欄位不存在時回傳 `[]` 與 `false`。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行 `engine/save.test.ts`、`engine/story/bond.test.ts`、全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): bond in the save, version unchanged`

### Task 3: 屬性來源 `bond` 與第 21 項平衡帶

**Files:**
- Modify：`engine/party.ts`（`StatSource` 加 `'bond'`，`statSources` 在 `memory` 之後加 `{ source: 'bond', stats: bondStats(m) }`）、`engine/story/bond.ts`（`bondStats`、`maxBondRecord`、`BOND_SWITCH`）、`engine/sim.ts`（`Lineup.bond`、`partyAt`）、`data/text.zh-TW.ts`（狀態頁屬性來源的欄名 `bond: '羈絆'`，和 `memory: '記憶'` 同一個物件）
- Create：`engine/balance.bond.test.ts`
- Test：`engine/party.test.ts`、`engine/sim.test.ts`、`ui2/scenes/status.test.ts`（若它斷言欄位的數量或順序，改成從 `statSources` 推導，斷言的意圖不變）

**Interfaces:**
- Produces（`engine/story/bond.ts`）：
  - `BOND_SWITCH = { earn: true, scale: BOND_SCALE }`：測試用的開關，和 6c 的 `FORCED_GLIMMERS` 同一種做法。`earn` 關掉同隊加分（Task 4 的 `bond draws nothing`），`scale` 是加成倍率（0 = 整個關掉，給終局連線，spec §5.5）。正式程式碼不改它。
  - `bondStats(m: Member, scale = BOND_SWITCH.scale): Partial<Sheet>`：洛恩、`scale === 0`、階段 0 時回傳 `{}`；否則對 `hp atk def mag res` 每一項 `Math.floor((def.base[k] + def.growth[k] × (m.level − 1)) × BOND_PCT[tier] × scale / 100)`，`def = CHARACTERS[m.id]`。不加 `spd`、`tp`、暴擊、量表（spec §5.1）。每一項取整數，所以 spec 的例子成立：Lv30 絲嘉蕾心契 HP +10、攻擊 +2。
  - `maxBondRecord(id: Companion): BondRecord` = `{ talk: 12, field: 40, gifts: { [loved[0]]: 9, [loved[1]]: 9 } }`：`giftPoints` 剛好 30，不靠碎片就是 92 分、心契。
- Produces（`engine/sim.ts`）：`Lineup.bond?: 'max'`；`partyAt` 在 `lineup.bond === 'max'` 時給每一位夥伴 `bond: maxBondRecord(id)`，洛恩不給。沒有 `bond` 的 `Lineup` 產生的 `Member` 和現在逐欄相同。
- Produces（`engine/balance.bond.test.ts`，第 21 項；門檻全部照抄原帶，**不 import `balance.test.ts` 的輔助函式**，在本檔重寫，因為原檔凍結）。`MAX: Lineup = { bond: 'max' }`；每一項把它併進原帶的 `lineup` 參數（`winRate`、`kitParty`、`simBattle` 的最後一個 lineup 參數）：
  - `21a`（第 4 項）：第 1、2、3 層，Lv 2、6、9，`winRate(...)` 的勝率 ≥ 0.85、HP 損失 0.10–0.45。
  - `21b`（第 10 項的記憶期望版）：`{ expect: true, heroBuild: 'balanced', bond: 'max' }`，第 4、6、8、10 層 × mainline、blaze，5 個 kitSeed 平均，勝率 ≥ 0.85、HP 損失 0.10–0.45。
  - `21c`（第 11、14 項的「記憶＋深淵上限」版）：`{ memories: 10, abyss: ABYSS.cap, heroBuild: 'balanced', bond: 'max' }`；第 11 項：第 5、10 層頭目每個 seed 回合數 ≥ 3；第 14 項：照 `balance.test.ts` 的 `bossFalls` 原樣的斷言（實作者先讀它，逐條照抄門檻）。
  - `21d`（第 18d 項「任何組成都能用」的天花板，見文末衝突第 1 點）：`ODD_LINEUPS` 加標準五人 × 5 種主角流派 × 第 4、8 層，每一格加 `bond: 'max'`，60 格的 HP 損失都 ≥ 0.10。
  - `21 measures something`：標準五人在第 10 層，`bond: 'max'` 與不帶時，`statsOf` 至少一位夥伴的 `hp` 不同，而且一場 `simBattle` 的結果不同。
  - `21p pace reference`（spec §12.2.1，參考測試，門檻是本計畫訂的）：在測試檔裡寫一個不跑戰鬥的算術模型：本道第 1 到 30 層、每趟 5 層、每趟帶固定 4 位（凜＋瑟蕾＋千鶴＋諾艾兒），每層下樓 +1、每 5 層一場頭目 +2、每趟受 `BOND_RUN_CAP` 限制；每次回城給 8 位各送一份她的 liked[0]；碎片照 `memoryPace(id)` 在第 30 層的數量。斷言：常帶的 3 位夥伴與凜在「羈絆」以上；另外 4 位在「同行」到「羈絆」；沒有任何人只靠一種來源到「心契」。`BALANCE_REPORT` 時印出每一位的分數。
- 紅燈處理：第 21a–21d 任何一項紅，只能把 `BOND_PCT` 的高階往下調（例如 4 → 3），每一輪記進 SDD 目錄的 `bond-baseline.md`；`21p` 紅時可以在 spec §13 的護欄內調提案數字（`FIELD_POINTS`、`GIFT_VALUE`、`BOND_TIER_AT`），但 Task 1 的 `bond caps keep…` 必須維持綠。最多 4 輪；調不過就回報 BLOCKED，附每一輪的表。

- [ ] **Step 1: 量基準**：改任何東西之前跑平衡指令，把 `[balance]` 與 `[lineups]` 的報告存成 `.superpowers/sdd/2026-10-19-starlantern-plan6d-affinity/bond-baseline.md` 的「6d 前」一節。
- [ ] **Step 2: 寫失敗的測試**
  - `party.test.ts`：`bond adds a share of her natural stats`：Lv30 絲嘉蕾帶 `maxBondRecord` → `bondStats` 是 `{ hp: 10, atk: 2, ... }`（其他三項照公式手算寫死）；沒有 `spd`、`tp`。`no bond, no column value`：沒有 `bond` 的成員 `bondStats` 是 `{}`，`sheetOf` 和加 `bond` 欄位之前相同。`the hero never has bond stats`。`scale zero switches it off`。
  - `sim.test.ts`：`partyAt with bond max gives every companion 心契 and the hero nothing`；`partyAt without bond is unchanged`（每位成員沒有 `bond` 欄位）。
  - `balance.bond.test.ts`：上面的全部。
- [ ] **Step 3: 執行，確認失敗**
- [ ] **Step 4: 實作**
- [ ] **Step 5: 執行平衡指令**：第 1–20 項的報告與 Step 1 的基準逐行相同（排序後 `diff` 沒有差異，寫進 baseline 的「6d 後」）；第 21 項全綠；`data/hero.test.ts` 綠。紅了照上面的紅燈處理。
- [ ] **Step 6: 執行全套，確認通過**
- [ ] **Step 7: commit**：`balance(starlantern): bond as a stat source, and band 21 — a maxed bond crushes nothing`（訊息寫 `BOND_PCT` 的最後值、第 21 項的報告摘要）

### Task 4: 同隊探索與戰鬥

**Files:**
- Modify：`engine/combatant.ts`（`Combatant.danger?: true`）、`engine/battle.ts`（標記 `danger`）、`engine/dungeon/run.ts`（`Run.bond`）、`engine/story/bond.ts`（`addField`）、`engine/game.ts`（`descend`、`submitRound` 的勝利分支、出發時的快照留給 Task 9）
- Test：`engine/battle.test.ts`、`engine/dungeon/run.test.ts`、`engine/story/bond.test.ts`、`engine/game.test.ts`

**Interfaces:**
- Produces：
  - `Combatant.danger?: true`：我方戰鬥者在這場戰鬥裡曾經倒下，或 `hp × 100 ≤ max.hp × DANGER_PCT`。`resolveRound` 在每一個行動結算之後與回合結束的狀態結算（毒、再生）之後檢查，設上就不拿掉。**只記錄**：不讀它的程式碼不可以因為它改變任何結果，不抽亂數。
  - `Run.bond: Partial<Record<CharacterId, number>>`：這一趟每人已經拿到的同隊分；`newRun` 給 `{}`；不存檔（`Run` 本來就不存）。
  - `addField(party: Party, run: Run, ids: CharacterId[], pts: number): { party: Party; gained: Partial<Record<Companion, number>> }`（`engine/story/bond.ts`，純函式）：`BOND_SWITCH.earn` 為假時原樣回傳；對每一位夥伴（洛恩略過），`add = min(pts, BOND_RUN_CAP − (run.bond[id] ?? 0), BOND_CAP.field − bondOf(m).field)`，大於 0 就寫進 `Member.bond.field` 與 `run.bond[id]`（`run` 就地加，`party` 回傳新的）。
- `engine/game.ts` 的規則（spec §4.3）：
  - `descend()`：`activeIds` 裡 `hp > 0` 的夥伴 `+FIELD_POINTS.floor`。寫在既有的 exp 之後、`changeFloor` 之前。
  - `submitRound` 勝利時（`fled`、`lose` 不加分；**救援戰整場不加分**，`rescue` 不為 null 時略過）：在 exp 與相遇之後，先 `strong`：`b.boss || elite` 時，`b.party` 裡的每一位夥伴（倒下的也算，她在陣上）`+FIELD_POINTS.strong`；再 `saved`：`b.party` 裡 `danger && alive` 的夥伴 `+FIELD_POINTS.saved`。兩項都經過 `addField`，所以共享每趟 4 分的上限。終幕那一戰也照算。
  - 分數直接寫進 `Member.bond.field`，所以全滅保留（spec §4.3）。

- [ ] **Step 1: 寫失敗的測試**
  - `battle.test.ts`：`danger marks a member who fell or dipped to thirty percent`：一位夥伴被打到 30% 以下，回合後 `danger` 為真；31% 時沒有；倒下的有；敵人永遠沒有。`danger changes nothing else`：同一個 rng 種子、同一組行動，把前一回合的 `danger` 手動拿掉再結算，下一回合的結果（除了 `danger` 本身）逐欄相同。
  - `run.test.ts`：`a new run holds no bond yet`。
  - `bond.test.ts`（`addField`）：每趟 4 分的上限（4 個 +2 只加到 4）；終身 40 的上限（39 分時 +2 只加 1）；洛恩不加；`BOND_SWITCH.earn = false` 時不變（`finally` 改回 true）。
  - `game.test.ts`：
    - `going down the stairs bonds whoever goes along`：出戰的夥伴 +1；坐冷板凳的、倒下的不加。
    - `a boss or an elite bonds everyone in the fight`：+2；不在陣上的不加。
    - `saved means she was in danger and stood at the end`：+2；在危險中但最後倒下的不加。
    - `a rescue fight and a flight give nothing`。
    - `four a run, and a wipe keeps what was earned`：同一趟拿滿 4 之後不再加；全滅之後 `field` 不變；下一趟重新從 0 計算。
    - `bond draws nothing`（spec §4.6、§12.2）：兩個 `Game`，同一個種子、同一份狀態，`BOND_SWITCH.scale = 0`（加成不改變戰鬥），一個 `earn = true`、一個 `false`；`rng` 包一層計數器。跑同一串操作：出發到本道第 3 層、走到第一場戰鬥並用固定行動打完、下樓兩次、打第 3 層的頭目。斷言兩邊的 `game.rng` 呼叫次數、`run.lootDraws`、`run.memoryDraws` 相同，每一場 `BattleEnd` 的 `drops`、`gear`、`fragments` 深度相等；`earn = true` 的那一邊至少一位夥伴 `field > 0`（證明真的有量到）。`finally` 把開關改回。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套與平衡指令**（第 1–21 項與 Task 3 結束時相同：`danger` 不影響模擬）
- [ ] **Step 5: commit**：`feat(starlantern): bond from going down and fighting together`

### Task 5: 送禮

**Files:**
- Create：`data/bond.zh-TW.ts`、`data/bond.test.ts`
- Modify：`engine/story/bond.ts`（`giveGift`、`giftLine`）、`engine/game.ts`（`give`；`depart` 清空 `gifted` 與 `talked`）
- Test：`engine/story/bond.test.ts`、`engine/game.test.ts`

**Interfaces:**
- Produces（`data/bond.zh-TW.ts`，本任務先建立送禮的部分）：
  - `BOND_PLACEHOLDERS: ReadonlySet<string>`、`bondPh(label: string): string`：回傳 `（暫定）${label}`，並把結果加進集合（同一個 label 不可以出現兩次，重複時丟錯）。label 用中文與 `numeral()`，例如 `凜・最愛・二`。
  - `BOND_TEXT.gift: Record<Companion, { loved: string[]; liked: string[]; neutral: string[]; declined: Partial<Record<GiftId, string>>; healed: Partial<Record<GiftId, string>> }>`：loved 2 句、liked 2 句、neutral 1 句、她的每一個 declined 素材 1 句、每一個 healed 素材 1 句，全部 `bondPh(...)`（spec §6.4）。
  - 檔頭註解：這個檔只有 6e 寫正式文字；寫之前讀 spec §6.2 的語氣樣本、文風聖經與帳本。
- Produces（`engine/story/bond.ts`）：
  - `type GiveResult = { ok: true; taste: Taste; healed: boolean; count: number; gained: number } | { ok: false; reason: 'hero' | 'unmet' | 'today' | 'none' | 'ungiftable' }`。
  - `giveGift(s: GameState, c: CharacterId, mat: GiftId): { state: GameState; result: GiveResult }`（純函式）：
    - 失敗：`hero`；沒遇見（`unmet`）；今天已經收過（`today`，`giftedOf` 含她）；`state.inventory[mat]` 不到 1（`none`）；不在 `GIFTABLE`（`ungiftable`）。
    - 婉拒（`tasteOf` 是 declined）：`ok: true, taste: 'declined', count: 0, gained: 0`；**不消耗、不寫 `gifts`、不進 `gifted`**，只把 mat 加進 `refused`（不重複）。
    - 收下：素材 −1、`gifts[mat] + 1`、`gifted` 加她；`count` 是收下後的份數；`gained` 是 `min(giftPoints, cap)` 的實際增加量（滿了是 0，照樣收）；`healed` 是這份口味來自痊癒（`GIFT_TASTE[c].healed[mat]` 有值且 `isHealed`）。
  - `giftLine(c: Companion, mat: GiftId, r: Extract<GiveResult, { ok: true }>): { pool: 'loved' | 'liked' | 'neutral' | 'declined' | 'healed'; index: number }`：婉拒 → `declined`、index 0；`healed` 為真而且 `count === 1` → `healed`、index 0；其他 → `taste` 的池、`(count − 1) % 池的長度`（spec §4.6，不抽亂數）。
- Produces（`engine/game.ts`）：`give(c: CharacterId, mat: GiftId): GiveResult | { ok: false; reason: 'phase' }`：只在城鎮；成功就套用並 `saveInTown()`。`depart` 把 `story.gifted`、`story.talked` 刪掉（不是設成空值，維持舊存檔的形狀）。

- [ ] **Step 1: 寫失敗的測試**
  - `data/bond.test.ts`：
    - `every gift cell has its reaction`：每位夥伴 loved ≥ 2、liked ≥ 2、neutral ≥ 1；`declined` 的鍵剛好等於她的 declined 素材；`healed` 的鍵剛好等於她的 healed 素材。
    - `bond copy follows the story typography`：`BOND_TEXT` 的每一個字串（遞迴收集）≤ `MAX_LINE_CHARS`、不是空字串、沒有 `[A-Za-z0-9]`、ASCII 引號、`...`、半形 `,!?:;`。
    - `drafts are registered`：目前每一個字串都在 `BOND_PLACEHOLDERS` 裡；`BOND_PLACEHOLDERS.size > 0`（6e 結束時改成 0）。
    - `bondPh refuses a label twice`。
  - `bond.test.ts`（`giveGift`）：
    - 每一種失敗理由各一個。
    - `a loved gift`：+4、素材 −1、`gifted` 有她；第二份同一天是 `today`。
    - `a declined gift is handed back`：素材數不變、`gifts` 不變、`gifted` 不變、`refused` 有它、`bondPoints` 不變。
    - `healed tastes wait for the last piece`：瑟蕾 4 片送 `old-coin` 是婉拒；5 片是 liked、`healed: true`、`giftLine` 是 `healed`；第二份是 `liked` 池。
    - `the gift cap`：已經 30 分時照樣收、`gained: 0`、`count` 加一。
    - `giftLine cycles by count`：loved 池 2 句時 count 1、2、3 → index 0、1、0。
    - `bond never falls`（Review Focus 2，性質測試）：用固定的種子 `mulberry32(1)` 產生 200 串、每串 30 步的隨機操作（送任一素材給任一人、加 `field`、加 `talk`、加一片記憶、把 `gifted` 清空），每一步之後每位夥伴的 `bondPoints` 都不比前一步小。這裡的 rng 只在測試裡產生操作序列。
  - `game.test.ts`：`gifts only in town, once a return`：地圖上 `give` 是 `phase`；城鎮裡送一份成功並存檔；`depart` 之後 `gifted` 與 `talked` 不存在；`give` 不呼叫 `game.rng`（計數器）。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認通過**
- [ ] **Step 5: commit**：`feat(starlantern): gifts — tastes, repeats, once a return, nothing taken back`

### Task 6: 劇本格式、新的場景與 `bondChoice`

**Files:**
- Modify：
  - `data/story/scenes.ts`：`SceneId`、`SCENE_IDS`、`MAJOR_SCENES`、`SceneKind`、`sceneKind`、`lineCap`、`bondScene(c, n)`。
  - `data/story.zh-TW.ts`：`Choice`、`ChoiceLine`、`SceneLine`、`CHOICE_MAX_CHARS`、`isChoice`、`worstCount`；`ScriptLine.if` 加 `tier`、`seen`、`notSeen`；`LineWhen` 加 `tiers`、`seen`；`linesWhen` 改成泛型；`buildScenes` 併入 `BOND_SCENES`；`MAJOR_TITLES` 加 `epilogue`；新場景的標題。**不改任何已寫好的劇情字串。**
  - `data/bond.zh-TW.ts`：`BOND_SCENES`（全部暫定）、`BOND_GUESTS`。
  - `engine/story/events.ts`：`whenOf(s)`。
  - `engine/story/bond.ts`：`talkPoints`。
  - `engine/game.ts`：`bondChoice`。
  - `ui2/story.ts`：`linesOf` 改呼叫 `whenOf`（選項的播放在 Task 7）。
  - `data/story/story.test.ts`：見下。
- Test：`data/story/story.test.ts`、`data/bond.test.ts`、`ui2/story.test.ts`、`engine/story/events.test.ts`、`engine/game.test.ts`、`engine/story/bond.test.ts`

**Interfaces:**
- Produces（`data/story/scenes.ts`）：
  - `SceneId` 加 `` `bond:${CharacterId}:${number}` ``、`` `ending:${CharacterId}` ``、`` `romance:${CharacterId}` ``、`'epilogue'`、`'festival'`。`SCENE_IDS` 只列出真的存在的：每位夥伴 `bond:c:1`–`4`、`ending:c`、`romance:c`，以及 `epilogue`、`festival`。
  - `MajorScene` 與 `MAJOR_SCENES` 加 `epilogue`（spec §8.4）。
  - `SceneKind` 加 `'bond' | 'ending' | 'romance'`；`festival` 歸在 `'romance'`。
  - `lineCap`：`bond:c:1`–`3` 是 6、`bond:c:4` 是 10、`ending` 是 6、`romance:c` 是 12、`festival` 是 3、`epilogue` 是 12。
  - `bondScene(c: Companion, n: 1 | 2 | 3 | 4): SceneId`。
- Produces（`data/story.zh-TW.ts`，型別照 spec §7.3）：
  - `Choice { tone: Tone; text: string; reply: ScriptLine[] }`、`ChoiceLine { who: 'hero'; choices: Choice[] }`、`SceneLine = ScriptLine | ChoiceLine`、`CHOICE_MAX_CHARS = 30`、`isChoice(l: SceneLine): l is ChoiceLine`。`Tone` 從 `data/story/bond.ts` re-export。
  - 場景的 `lines` 型別變成 `SceneLine[]`。
  - `ScriptLine.if` 加 `tier?: { who: Companion; min: BondTier }`、`seen?: SceneId`、`notSeen?: SceneId`（`seen` 是 6e 的掛勾，見文末「交給 6e」）。`LineWhen` 加 `tiers: Partial<Record<Companion, BondTier>>`、`seen: SceneId[]`。
  - `linesWhen<L extends SceneLine>(lines: L[], w: LineWhen): L[]`：`ChoiceLine` 一律留下；選項的 `reply` 不帶條件（測試鎖住）。
  - `worstCount(lines: SceneLine[]): number`：一般句各 1；選項算 1 ＋ 最長的 `reply`（spec §7.3 的最壞路徑）。
  - `buildScenes`：`SCRIPT[id] ?? BOND_SCENES[id]`；標題：`${name}・羈絆 ${n}`、`${name}・後日談`、`${name}・星燈祭之夜`、`星燈祭`（epilogue）、`星燈祭之夜・和大家一起`（festival）。標題是介面標籤，可以有數字。
- Produces（`data/bond.zh-TW.ts`）：
  - `BOND_SCENES: Partial<Record<SceneId, { lines: SceneLine[]; summary: string }>>`，全部 `bondPh`，形狀就是 6e 要填的骨架：
    - `bond:c:1`–`3`：她 1 句、洛恩 1 句、選項（ask、stay、promise 三個，各 1 句 reply 由她說）、她 1 句 = 最壞 5 句。
    - `bond:c:4`：同上，前後各多 1 句 = 最壞 7 句。
    - `ending:c`：旁白 1 句、她 1 句、她 1 句帶 `if.tier: { who: c, min: 3 }`（spec §8.5）。
    - `romance:c`：旁白 1 句、她 1 句、洛恩 1 句、旁白 1 句（其他夥伴出現的那一句由 6e 寫，帶 `if.met`）。
    - `epilogue`：旁白 1 句、每位夥伴 1 句（`if.met: c`，她說）、旁白 2 句 = 最壞 12 句。
    - `festival`：旁白 1 句、洛恩 1 句。
    - 每段一句摘要。說話者用自己的表情規則（`moodAllowed`）。
  - `BOND_GUESTS: Partial<Record<SceneId, Speaker[]>> = {}`：羈絆、後日談、戀愛場景裡，除了本人、洛恩、凜、旁白以外可以開口的鎮民（6e 每加一人要在帳本記理由；見「交給 6e」）。
- Produces（`engine/story/events.ts`）：`whenOf(s: GameState): LineWhen`：`met`、`full`、`returned`、`oath` 照現在 `ui2/story.ts` 的 `linesOf` 算；`tiers` 是每位已遇見夥伴的 `bondTier`；`seen` 是 `s.story.seen`。`ui2/story.ts` 的 `linesOf` 改成 `linesWhen(STORY.scenes[id].lines, whenOf(s))`。
- Produces：`talkPoints(c: Companion, tone: Tone | null): 2 | 3`（`engine/story/bond.ts`）：`tone === TONE_PREF[c]` 是 3，其他與 `null` 是 2。
- Produces（`engine/game.ts`）：`bondChoice(id: SceneId, tone: Tone | null): boolean`：`id` 是 `bond:` 場景、在 `this.pending` 裡（Task 7 由 `openBond` 放進去）、而且**不在 `story.seen`**（同一段只計一次）時，把 `talkPoints` 加進她的 `bond.talk`（不超過 `BOND_CAP.talk`），回傳 true；其他情況什麼都不做、回傳 false。在 `sceneDone` 之前呼叫（spec §7.4）。
- `data/story/story.test.ts` 的修改（它是 6c 的文字閘門，原意不變，只是看得到新格式）：
  - `storyTexts()`：遞迴時把 `tone` 加進略過的鍵（和 `who`、`mood`、`if` 一樣）；選項的 `text` 與 `reply` 的字串照樣收集。
  - 讀「場景的每一句」的閘門（說話者與表情、沒遇見的人不開口、回憶的說話者、劇透）改用一個本檔的 `flatLines(lines)`：一般句原樣；選項展開成「洛恩說的 `text`」加上每一個 `reply`。
  - `no scene plays more lines than its cap, in any party`：句數改用 `worstCount(linesWhen(...))`；組合多加兩維：`tiers` 是全 0 或全 4，`seen` 是空的或 `SCENE_IDS` 全部。
  - `position(key)`：`bond:c:n` = 它閘門碎片的位置（夥伴：她相遇的階段，和她的回憶相同；凜：`stageOf(CHAINS.rin.pieces[k − 1].minDepth)`，`oath` 閘門用凜第 7 片的階段）；`ending:*`、`romance:*`、`epilogue`、`festival` 是 `after`（spec §8.3）。`SPOILERS` 與 `RIN_SECRET_TERMS` 不放寬。
  - `nobody unmet speaks` 的「本人的場景」加上 `bond:c:*`、`ending:c`、`romance:c`；鎮民只有在 `BOND_GUESTS[id]` 或 `town:`、既有的規則允許時才可以開口。

- [ ] **Step 1: 寫失敗的測試**
  - `story.test.ts`（新增）：
    - `every bond scene holds exactly one choice, and nothing else does`：`bond:*` 剛好一個 `ChoiceLine`；其他場景沒有。
    - `choices are two or three ways to say it`：2–3 個、語氣不重複、`text` ≤ `CHOICE_MAX_CHARS` 字、`reply` 1–2 句而且不帶 `if`。
    - `Rin keeps his name and 我們 to herself before her choice`：`bond:rin:1`、`bond:rin:2` 裡說話者是凜的句子（含 reply）不含「洛恩」「我們」（帳本 I-20）。
    - `the epilogue speaks of no romance`：`epilogue` 沒有任何 `romance` 的條件；說話者是夥伴的句子都帶 `if.met` 指向她。
    - `the finale is untouched`：`finale` 沒有任何一句帶 `tier`、`seen`、`notSeen`；`worstCount` 的最大值仍是 12。
  - `bond.test.ts`（`data/bond.test.ts`）：`every bond scene is drafted`：`BOND_SCENES` 的鍵剛好等於 `SCENE_IDS` 裡 `bond`、`ending`、`romance`、`epilogue`、`festival` 的全部；所有字串都在 `BOND_PLACEHOLDERS`。
  - `ui2/story.test.ts`：`tier and seen conditions pick the right lines`：一段假場景帶 `if.tier: { who: 'selene', min: 3 }`、`if.seen`、`if.notSeen`，在三種狀態下留下的句子正確；`a choice line always stays`。
  - `events.test.ts`：`whenOf reads tiers and seen`。
  - `engine/story/bond.test.ts`：`talk points never miss`（spec §12.2）：每位夥伴每個語氣的分數 ∈ {2, 3}、最大減最小 ≤ 1、`null` 是 2、偏好的是 3。
  - `game.test.ts`：`a choice counts once`：`pending` 有 `bond:selene:1` → `bondChoice('promise')` +3；再呼叫一次（還沒 `sceneDone`）也只算第一次（實作：同一個 `pending` 項目只接受一次，用一個不存檔的 `Set` 記下）；`sceneDone` 之後再呼叫是 false；`null` +2；talk 已經 11 時 +3 只加到 12；不在 `pending` 的是 false。
  - 測試要能抓到錯：commit 之前暫時把一段羈絆場景的選項拿掉、把一個 reply 改成 3 句、把凜的 `bond:rin:1` 加一個「我們」，確認對應的測試紅了，再改回來。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**，並依上面改寫 `story.test.ts` 的輔助與既有閘門
- [ ] **Step 4: 執行全套，確認通過**（`PLACEHOLDERS.size === 0` 仍綠：羈絆的暫定文案在另一個集合）
- [ ] **Step 5: commit**：`feat(starlantern): the bond script — choices, tier and seen conditions, the scenes after the finale`

### Task 6.5: 手冊重看用第一次播放時的讀法（6c 接手項）

**Files:**
- Modify：`engine/story/events.ts`（`sceneDone` 記下 `heard`；`heardOf`）、`ui2/story.ts`（`linesOf` 的重看模式、`playScene` 的選項參數）、`ui2/scenes/handbook.ts`（`replay` 傳重看模式）
- Test：`engine/story/events.test.ts`、`ui2/story.test.ts`、`ui2/scenes/handbook.test.ts`

**Interfaces:**
- Consumes：Task 2 的 `StoryState.heard`；Task 6 的 `whenOf`、`linesWhen`。
- Produces（`engine/story/events.ts`）：
  - `heardOf(s: StoryState, id: SceneId): number[] | null`：沒有紀錄時 `null`。
  - `sceneDone(s, id, how)`：場景的 `lines` 有任何一句帶 `if` 時，第一次結束（不論 played、skipped、auto）就把 `linesWhen(lines, whenOf(s))` 在原陣列裡的索引寫進 `story.heard[id]`；已經有紀錄就不覆寫。沒有條件句的場景不寫（存檔不會變大）。
- Produces（`ui2/story.ts`）：
  - `linesOf(id: SceneId, s: GameState, o: { replay?: boolean } = {}): SceneLine[]`：`replay` 而且有 `heard` 時，用紀錄的索引（超出陣列的略過；結果是空的就退回當下讀法）；其他情況照 Task 6 的當下讀法。
  - `playScene(talk, id, ctx, o: { replay?: boolean } = {})`；手冊的 `replay` 傳 `{ replay: true }`。
- 為什麼這樣做（取代 6c progress 第 136 行「deferred to 6d」的裁定）：重看應該是「回想那一次」，不是「用現在的眼光重讀」；只記索引，不記整份狀態，所以存檔只多幾十個小陣列，劇本改動時最多退回當下讀法，不會讓存檔壞掉。6d 之前就看過的場景沒有紀錄，照舊用當下讀法（無法重建，寫進 handbook 的註解）。

- [ ] **Step 1: 寫失敗的測試**
  - `events.test.ts`：
    - `a scene remembers how it was first heard`：`town:orik` 在莉茲沒集滿時結束，`heard` 不含重逢句的索引；之後莉茲集滿，紀錄不變。
    - `a scene with no conditions writes nothing`：`prologue` 結束後 `heard` 沒有它。
    - `auto and skipped are remembered too`。
  - `ui2/story.test.ts`：`a replay reads the first hearing`（Orik 的例子：首播在前、莉茲集滿在後，`linesOf('town:orik', s, { replay: true })` 沒有重逢句，`linesOf('town:orik', s)` 有）；`an old save replays as it reads now`（沒有 `heard` 時兩者相同）；`a stale record falls back`（紀錄裡的索引全部超出範圍時退回當下讀法）。
  - `handbook.test.ts`：`the handbook replays the first hearing`：手冊重看 `town:orik` 時，對話框沒有出現重逢的那一句（用 `STORY.scenes['town:orik']` 找出帶 `if.full: 'liz'` 的句子，斷言它不在播出的文字裡）。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認通過**
- [ ] **Step 5: commit**：`fix(starlantern): the handbook replays a scene as it was first heard`

### Task 7: 播放：選項、旅館的「談心」「送禮」、城鎮的「新」

**Files:**
- Modify：
  - `engine/story/bond.ts`：`nextBond`、`bondOpen`。
  - `engine/game.ts`：`openBond`；`sceneDone` 對 `bond:` 場景設 `story.talked = true`（在 `engine/story/events.ts` 的純函式 `sceneDone` 裡做）。
  - `engine/story/events.ts`：同上。
  - `ui2/story.ts`：`playScene` 播 `ChoiceLine`；`chosen()`；`playAndRecord` 對 `bond:` 場景先 `bondChoice` 再 `sceneDone`。
  - `ui2/scenes/inn.ts`：指令 `talk`（談心）、`gift`（送禮）。
  - `ui2/scenes/town.ts`：旅館的「新」。
  - `data/text.zh-TW.ts`：`T.ui2.inn` 與 `T.ui2.bond` 的介面文字。
- Test：`engine/story/bond.test.ts`、`engine/story/events.test.ts`、`engine/game.test.ts`、`ui2/story.test.ts`、`ui2/scenes/inn.test.ts`、`ui2/scenes/town.test.ts`

**Interfaces:**
- Produces（`engine/story/bond.ts`）：
  - `nextBond(s: GameState, c: Companion): SceneId | null`：她已遇見；她的第一段沒看過的 `bond:c:n`，前一段已看過（不跳號），而且 `BOND_GATE[c][n]` 成立（`bondTier ≥ tier`、`memoriesOf ≥ pieces`、`oath` 時凜有 `oath`）。
  - `bondOpen(s: GameState): Companion[]`：`nextBond` 不是 null 的人，依 `CHARACTER_IDS`。
- Produces（`engine/game.ts`）：`openBond(c: Companion): SceneId | null`：城鎮、`!talkedOf(story)`、`nextBond` 不是 null 時，把場景放進 `this.pending` 並回傳；否則 null。
- `sceneDone`（純函式）：`id` 以 `bond:` 開頭時，`story.talked = true`。跳過也算看過、+2（spec §8.2）。
- Produces（`ui2/story.ts`）：
  - `playScene` 遇到 `ChoiceLine`：對話框顯示洛恩的名牌與立繪（`speakerOf('hero', …)`），在對話框上方開 `MenuView`（每個選項一列，文字是 `text`）；確認後播那一個的 `reply` 再繼續；在選單上按取消 = 跳過整段（照現在的跳過：顯示摘要），選擇記成 `null`。
  - 回傳的物件加 `chosen(): Tone | null`。
  - `playAndRecord`：`sceneKind(id) === 'bond'` 時，在 `sceneDone` 之前呼叫 `ctx.game.bondChoice(id, p.chosen())`；`auto`（不播）時呼叫 `bondChoice(id, null)`。
- 旅館（`ui2/scenes/inn.ts`；現有指令順序之後加，`festival` 在 Task 8）：
  - 「談心」：已經談過 → `say(T.ui2.inn.talkedToday)`；`bondOpen` 是空的 → `say(T.ui2.inn.nobodyToTalk)`；否則列出 `bondOpen` 的人（右欄 `新`，class `slx-fresh`）；選一位 → `openBond` → `playAndRecord(talk, id, { ...storyCtx(ctx), mode: 'all' })`（玩家主動開的，不看劇情播放設定）。
  - 「送禮」：列出已遇見的夥伴（洛恩不列），今天收過的灰掉、右欄 `T.ui2.inn.giftedToday`；選一位 → 列出持有的 `GIFTABLE`（`itemName(id)`、右欄是已知的口味：`gifts` 或 `refused` 有它才顯示 `T.ui2.bond.taste[taste]`，否則空白）；沒有可送的 → `say(T.ui2.inn.nothingToGive)`；選一項 → `confirmBox(T.ui2.inn.askGift(name, item))`，預設「否」→ `game.give` → 用 `Dialogue` 讓她說 `BOND_TEXT.gift[c][giftLine(...).pool]` 的那一句，立繪用 `speakerOf(c, state, art, GIFT_MOOD[c][taste])`。
- 城鎮（`ui2/scenes/town.ts`）：選單的 `inn` 在 `bondOpen` 不是空的而且 `!talkedOf` 時帶右欄 `T.ui2.handbook.fresh`（class `slx-fresh`，和手冊同一個元件）。
- `T.ui2.inn`（新增）：`talk: '談心'`、`gift: '送禮'`、`talkedToday`、`nobodyToTalk`、`giftedToday: '今天已經收過了'`、`nothingToGive`、`askGift(name, item)`。`T.ui2.bond`（新增）：`tiers: ['相識', '同行', '信賴', '羈絆', '心契']`、`taste: { loved: '最愛', liked: '喜歡', neutral: '普通', declined: '婉拒' }`。

- [ ] **Step 1: 寫失敗的測試**
  - `bond.test.ts`：`BOND_GATE opens in order`：每一列的門檻（階段夠、碎片不夠 → null；都夠 → 那一段）；看過第 1 段才開第 2 段；凜的第 3 段沒有 `oath` 不開。
  - `events.test.ts`：`a bond scene marks the day's talk`；`arrivalScenes is unchanged without bond content`（spec §12.2 回歸）：一份沒有任何好感度欄位的存檔，`arrivalScenes` 的結果和本任務之前相同（寫死期望值）；`bond scenes never enter the arrival queue`：`onReturn` 與 `arrivalScenes` 的結果裡沒有 `bond:`。
  - `game.test.ts`：`one talk a return`：`openBond` 成功一次、播完之後第二次是 null；出發之後又可以；地圖上是 null。`a talk cut short counts nothing`（Review Focus 1）：`openBond` 之後沒有 `sceneDone`，模擬重新載入（用同一份存檔建新的 `Game`）：`talked` 不存在、`bond.talk` 不變、`openBond` 再次成功。
  - `ui2/story.test.ts`：`a choice plays its reply`：選 `stay`，播出的文字包含那一個的 `reply`、不包含另外兩個；`chosen()` 是 `stay`。`cancel on the choice skips the scene`：顯示摘要，`chosen()` 是 null。`a bond scene records the choice before it is done`（`playAndRecord` 先呼叫 `bondChoice` 再 `sceneDone`：用假的 game 記錄呼叫順序）。
  - `inn.test.ts`：「談心」的三種情況（今天談過、沒人、有人 → 播完 `talked`）；「送禮」：灰掉今天收過的、只列持有的可送素材、婉拒之後素材數不變而且第二次打開清單時那一項的右欄是「婉拒」、送出最愛之後她說的是 `BOND_TEXT.gift[c].loved[0]`。
  - `town.test.ts`：`the inn shows 新 while a bond scene waits`：有 → 右欄是「新」；談過之後沒有。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**（介面文字用 grep 確認沒有和既有的鍵撞名）
- [ ] **Step 4: 執行全套與 e2e，確認通過**（e2e 若有斷言旅館指令的數量，列進回報，在 Task 10 改成結構斷言；本任務不改 e2e）
- [ ] **Step 5: commit**：`feat(starlantern): the inn's talks and gifts, and choices on screen`

### Task 8: 終幕之後：星燈祭、後日談、星燈祭之夜與戀愛

**Files:**
- Modify：
  - `engine/story/events.ts`：`onReturn` 排入 `epilogue`；`rank`；`nextEnding`；`arrivalScenes`。
  - `engine/story/bond.ts`：`romanceCandidates`。
  - `engine/game.ts`：`festivalOpen`、`chooseRomance`、`festivalTogether`、`festivalAsked`。
  - `ui2/scenes/inn.ts`：「星燈祭之夜」。
  - `ui2/scenes/town.ts`：戀愛台詞進城鎮台詞池；旅館的「新」也看 `festivalOpen`。
  - `data/bond.zh-TW.ts`：`BOND_TEXT.romanceLines`（每人 2 句，`bondPh`）。
  - `data/text.zh-TW.ts`：`T.ui2.inn.festival`、`together`、`askRomance(name)`。
- Test：`engine/story/events.test.ts`、`engine/story/bond.test.ts`、`engine/game.test.ts`、`ui2/scenes/inn.test.ts`、`ui2/scenes/town.test.ts`、`data/bond.test.ts`

**Interfaces:**
- 星燈祭：`onReturn` 在 `finaleCleared` 而且 `epilogue` 不在 `seen`、`queue` 時把它排入；`rank('epilogue') = −4`（排在所有東西之前）。
- 後日談：`nextEnding(s: GameState): SceneId | null`：`finaleCleared`、`epilogue` 已看過、依 `CHARACTER_IDS` 第一位「已遇見、記憶集滿、`ending:c` 沒看過」的夥伴。**不看好感度**（spec §8.5）。`arrivalScenes` 在 `o.chat` 時用 `nextEnding(s) ?? nextChat(s)`：後日談佔掉這一次的對話名額。星燈祭那一次回城，`epilogue` 還沒看過，所以照舊是一般對話；後日談從下一次開始（見文末衝突第 5 點）。
- 戀愛（spec §9.2、§9.3）：
  - `romanceCandidates(s: GameState): Companion[]`：`finaleCleared`、`epilogue` 已看過、`story.romance` 不存在；她在 `ROMANCEABLE`、已遇見、`bondTier === 4`、`bond:c:4` 已看過。排序：`bondPoints` 高到低，同分依 `CHARACTER_IDS`。
  - `Game.festivalAsked: boolean`（不存檔；`arrive()` 時設回 false）。
  - `festivalOpen(): boolean` = 城鎮 ∧ `!festivalAsked` ∧ `romanceCandidates` 不是空的。
  - `chooseRomance(c: Companion): { ok: true; scene: SceneId } | { ok: false; reason: 'chosen' | 'ineligible' | 'phase' }`：成功時 `story.romance = c`、把 `romance:c` 排進 `story.queue`（中斷時下次回城補播，Review Focus 1）並放進 `pending`、`saveInTown()`。`story.romance` 已存在就是 `chosen`，值不變。
  - `festivalTogether(): boolean`：`festivalOpen()` 時設 `festivalAsked = true`，回傳 true；**不寫任何存檔欄位**。畫面播 `festival` 場景用 `playScene`（不是 `playAndRecord`，不進 `seen`）。
- 旅館：`festivalOpen()` 時才出現「星燈祭之夜」；選單是 `romanceCandidates` 的名字加最後一列「和大家一起」；選一位 → `confirmBox(T.ui2.inn.askRomance(name))`，預設「否」（不能改，所以要確認）→ `chooseRomance` → `playAndRecord(romance:c, mode 'all')`。
- 城鎮台詞池：`story.romance` 存在時，`BOND_TEXT.romanceLines[romance]` 以她的名字加進池子；`game.rng()` 仍只抽一次（spec §4.6）。

- [ ] **Step 1: 寫失敗的測試**
  - `events.test.ts`：
    - `the festival is first after the finale`：終幕已過、佇列裡還有一片主角回憶時，`arrivalScenes` 的第一個是 `epilogue`。
    - `endings take the chat's place, from the next return`：星燈祭那一次是一般對話；看完之後，下一次是第一位符合的 `ending:c`，沒有一般對話；再下一次輪到下一位。
    - `an ending needs no bond`：好感度 10 的夥伴也輪得到。
    - `a late meeting still gets her ending`：終幕之後才遇見並集滿的夥伴輪得到。
    - `no ending before the finale`。
  - `bond.test.ts`：`romance candidates`：四個條件逐一拿掉一個就不在名單；排序決定性（同分依 `CHARACTER_IDS`）；`ROMANCEABLE` 等於 9 位夥伴；沒有人符合時是空的。
  - `game.test.ts`：
    - `the choice is for keeps`：`chooseRomance('liz')` 成功、`story.romance === 'liz'`、`festivalOpen()` 為假；再 `chooseRomance('rin')` 是 `chosen`、值仍是 liz；存檔讀回 `ok` 而且仍是 liz。
    - `a romance cut short plays on the next return`：選了之後不 `sceneDone`，重新載入、回城一次，`arrivalScenes` 有 `romance:liz`；`sceneDone` 之後不在佇列。
    - `together writes nothing`：`festivalTogether()` 之後存檔內容（`JSON.stringify(state)`）不變；`festivalOpen()` 為假；下一次 `arrive` 之後又為真。
    - `nobody eligible, no festival night`。
  - `inn.test.ts`：指令只在 `festivalOpen` 時出現；選單最後一列是「和大家一起」；確認框預設在「否」；選了之後播 `romance:c`。
  - `town.test.ts`：`the romance lines join the town's pool with one draw`：固定 rng 讓挑到池子最後的位置，句子來自 `romanceLines`；`game.rng` 被呼叫的次數和沒有戀愛時相同。
  - `data/bond.test.ts`：`romanceLines` 每人剛好 2 句，都在 `BOND_PLACEHOLDERS`。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認通過**
- [ ] **Step 5: commit**：`feat(starlantern): after the finale — the festival, the endings, and one romance for keeps`

### Task 9: 顯示：狀態頁、手冊人物頁、回城的升階行

**Files:**
- Modify：
  - `ui2/scenes/statusTabs.ts`：夥伴能力頁的標題列加一行好感度。
  - `engine/story/handbook.ts`：`PersonPage.bond`；人物頁的場景清單加入看過的 `bond:c:*`、`ending:c`、`romance:c`。
  - `ui2/scenes/handbook.ts`：人物頁的好感度區塊。
  - `engine/game.ts`：`bondUps`（出發時的階段快照，回城與全滅時比較）。
  - `ui2/scenes/town.ts`：收穫或通知之後，有人升階就多說一行。
  - `data/text.zh-TW.ts`：`T.ui2.bond` 的顯示文字。
- Test：`ui2/scenes/status.test.ts`、`engine/story/handbook.test.ts`、`ui2/scenes/handbook.test.ts`、`engine/game.test.ts`、`ui2/scenes/town.test.ts`

**Interfaces:**
- 狀態頁：夥伴有一行 `T.ui2.bond.line(tierName)`（「好感度　信賴」）；洛恩沒有。class 用既有的 `slx-stat-affinity` 旁邊新增 `slx-stat-bond`（樣式加進同一個 SCSS partial，沒有行內樣式）。屬性來源表的 `bond` 欄在 Task 3 已經自動出現。
- `PersonPage.bond?: { tier: BondTier; points: number; sources: { memory: [number, number]; talk: [number, number]; gift: [number, number]; field: [number, number] }; tastes: { mat: GiftId; taste: Taste }[] }`（`engine/story/handbook.ts`）：洛恩與沒遇見的人沒有。`sources` 的每一格是 `[目前, 上限]`：記憶是 `[BOND_PER_PIECE × 片數, BOND_PER_PIECE × chainLength]`，送禮的目前值是 `min(giftPoints, 30)`。`tastes` 只列 `gifts` 或 `refused` 裡的素材（「送過一次之後才顯示」，spec §4.8），照 `GIFTABLE` 的順序，口味用當下的 `tasteOf`。
- 手冊人物頁：區塊顯示 `T.ui2.bond.score(tierName, points)`（「信賴　45／100」）、四種來源各一行 `T.ui2.bond.source(name, now, cap)`，滿了加 `T.ui2.bond.full`（「已滿」）、已知的喜好清單；場景清單照現在的方式重看（Task 6.5 的首播讀法）；重看羈絆場景可以再選，但不呼叫 `bondChoice`（`replay` 直接用 `playScene`，本來就不經過 `playAndRecord`）。
- `Game.bondUps: { id: Companion; tier: BondTier }[]`（不存檔）：`depart` 記下每位已遇見夥伴的階段；`toTown` 與 `wipe` 比較，升了的人依 `CHARACTER_IDS` 放進來（全滅也算，因為分數保留）。城鎮在收穫、通知那一行之後，依序說 `T.ui2.bond.rose(name, tierName)`（「凜的好感度提升到『信賴』。」），說完清空。

- [ ] **Step 1: 寫失敗的測試**
  - `status.test.ts`：`a companion's page shows her bond, the hero's does not`。
  - `handbook.test.ts`（engine）：`the bond page counts every source against its cap`；`a taste shows only once she has been offered it`（婉拒也顯示）；`bond scenes, endings and the romance are listed once seen`；`no bond page for the hero or the unmet`。
  - `handbook.test.ts`（ui2）：區塊的文字；`a replayed bond scene adds nothing`（重看並選一個選項，`bond.talk` 不變）。
  - `game.test.ts`：`a run that raised a tier says so`：出發時 19 分、下樓 +1 → 回城 `bondUps` 有她、階段 1；`a wipe keeps the news too`；沒升的不列。
  - `town.test.ts`：`the tier line follows the banked line`。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認通過**
- [ ] **Step 5: commit**：`feat(starlantern): bond on the status page, in the handbook and on the way home`

### Task 10: 收尾：全套、平衡、tsc、e2e 與截圖

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`（新的流程；Task 7–9 回報的文案或數量斷言改成結構斷言）
- 截圖（不 commit）：`tmp/starlantern/6d/`

- [ ] **Step 1: 全套與 tsc**：`rtk proxy npx vitest run --testTimeout=20000` 全綠；`npx tsc --noEmit` 在 starlantern 與 e2e spec 底下 0 個錯誤；`grep -rn "it.fails\|it.skip\|\.only(\|\.todo(\|Math.random" src/scripts/games/starlantern` 沒有結果（`Math.random` 在 starlantern 底下本來就不該有；有的話先查是不是本計畫加的）。
- [ ] **Step 2: 平衡**：執行平衡指令；第 1–20 項與 `bond-baseline.md` 的「6d 前」逐行相同，第 21 項全綠；`data/hero.test.ts` 綠；把報告寫進 baseline 的「6d 完成」。
- [ ] **Step 3: e2e（寫失敗的測試，再修到綠）**：用既有的 `setup` 與 debug hook（`window.__starlanternDebug.game`）設定狀態，不寫死任何暫定文案：
  - `gifts: a loved one and a declined one`：凜持有暮影布與王者之鱗；旅館 → 送禮 → 凜 → 暮影布 → 確認：她開口（對話框有她的名字）、暮影布 −1、`bondPoints` +4；同一天再打開時凜是灰的。重新出發回城，送王者之鱗：素材數不變、清單的右欄出現「婉拒」。
  - `a talk with a choice, and a skipped one`：瑟蕾到可以看 `bond:selene:1`；旅館 → 談心 → 瑟蕾：選單出現 3 個選項，選一個，播完之後 `talk` 是 2 或 3、`talked` 為真、旅館的「新」消失。下一次回城看第 2 段時，在選項上按取消：顯示摘要、`talk` 再 +2。
  - `the festival, one romance, and the handbook`：用 debug hook 做一份終幕已過、莉茲心契並看過 `bond:liz:4` 的存檔，回城：星燈祭先播；旅館 → 星燈祭之夜 → 莉茲 → 確認：戀愛結局播完；指令消失；存檔讀回 `romance` 仍是莉茲；手冊 → 人物 → 莉茲：好感度區塊、可以重看戀愛結局。
  - 全部在 `E2E_PORT=4352`、headless、`--mute-audio`。
- [ ] **Step 4: 截圖**（`SL_SHOTS=tmp/starlantern/6d` 或 scratchpad 的腳本，存到 `tmp/starlantern/6d/`）：送禮的兩層清單與反應、談心的選項選單、星燈祭之夜的選單與確認框、手冊的好感度區塊、狀態頁的好感度行、回城的升階行。逐張看：沒有爆框、對話框的名牌與立繪正確（沒有圖的表情顯示 `normal`）、清單右欄對齊。
- [ ] **Step 5: commit**：`test(starlantern): bond end to end — gifts, talks, the festival night`。實作者到這裡結束。
- [ ] **Step 6（控制者的步驟）：整體審查**：派一個沒參與實作的代理，用最強的模型，依 `~/.claude/skills/review-pr/SKILL.md` 審查本計畫的 diff，對照 spec §2 的反目標與下面的審查清單；處理它提出的問題後請它複審受影響的範圍。

---

## 審查清單（每個任務的審查者）
1. **TDD 證據**：回報裡有失敗的輸出（因為正確的理由失敗）與通過的輸出；沒有 `it.skip`、`.only`、`it.fails`、`.todo`。
2. **決定性**：沒有 `Math.random`；好感度的程式碼不呼叫 `game.rng`、`lootRng`、`memoryRng`；`bond draws nothing` 綠。
3. **不下降**：沒有任何一條路徑讓 `talk`、`field`、`gifts` 變少；婉拒不消耗、不寫 `gifts`。
4. **存檔**：`SAVE_VERSION` 仍是 8；新欄位全部可選；舊檔讀成 `ok`；讀取一律經過有預設值的存取函式。
5. **平衡**：凍結的檔案沒有 diff；第 1–20 項的報告逐行相同；第 21 項的調整只往下調 `BOND_PCT`。
6. **文字**：沒有正式的羈絆文字；新的字串都是 `bondPh` 或介面文字；6c 寫好的劇情字串與終幕的 12 句沒有 diff（`git diff` 檢查 `data/story.zh-TW.ts` 只改了型別、`linesWhen`、`buildScenes` 與標題）。
7. **反目標**（spec §2）：沒有錯的選項、沒有扣分、加成不讓任何隊伍變成必帶、沒有人被留在黑暗裡（後日談不看好感度）、凜在揭露前不叫名字不說「我們」。
8. **介面**：沒有 `!important`、行內樣式、`element.style`；沒有新的圖片或 CSS 畫的形狀；`allArtUrls()` 仍是 246。
9. **換行與 git**：`git diff --stat` 沒有整檔重寫；只 add 列出的路徑。

---

## 跨計畫錨點（名冊 spec §12.3 引用的任務編號）
本計畫的任務編號照 spec §11.2 的 1–10，只多了一個 **Task 6.5**（夾在 6 與 7 之間，不改動任何既有編號）。名冊 spec 引用的錨點都成立：

| 名冊 spec 的引用 | 本計畫 | 內容 |
|---|---|---|
| 「6d Task 1 的說明寫明 `GIFTABLE` 由 `kind` 推導」 | Task 1 | `giftableOf(MATERIALS)`、`GIFT_KINDS`；commit 訊息寫明 |
| 「6d Task 2」（7c 的圖鑑狀態排在它之後） | Task 2 | `engine/state.ts`、`engine/save.ts` 的好感度欄位與驗證 |
| 「6d Task 4」（`battle.ts`、`game.ts`、`run.ts`） | Task 4 | `danger`、`Run.bond`、同隊加分。7a 改這三個檔的 Task 2、3、5–8 必須在 6d 開工前合併；否則 7a 暫停到本計畫 Task 4 合併 |
| 「7b 在 6d Task 5 合併後補口味表」 | Task 5 | `giveGift`、`GIFT_TASTE` 的讀法；7b 只能新增 liked 與故事戰利品的「婉拒 → 痊癒喜歡」，不新增 loved（名冊 spec §7.4；Task 1 的 `exactly 2 loved` 測試會擋） |
| 「6d Task 7 改 `text.zh-TW.ts`」 | Task 7 | 另外 Task 3、8、9 也加介面文字（都在 `T.ui2.bond`、`T.ui2.inn` 底下，與 7c 的圖鑑文字不同物件） |
| 「6d Task 9」（7c 的 `handbook.ts` 排在它之後） | Task 9 | 另外 Task 6.5 也改 `ui2/scenes/handbook.ts` 的重看（在 Task 9 之前，所以 7c 排在 Task 9 之後就涵蓋） |
| 「6d 的第 21 項在每次上線切換時一起跑」 | Task 3 | `engine/balance.bond.test.ts`；平衡指令已經把它列進去 |

其他：
- 7a Task 14 改 `data/story/scenes.ts` 的 `FINALE_BOSS.base`；本計畫 Task 6、8 也改這個檔（`SceneId`、`lineCap`），行不重疊，後合併的人重跑 `story.test.ts`。
- 5e（表情美術）與本計畫沒有檔案衝突：本計畫不改 `render/artPaths.ts`、`PUBLISHED_FACES` 與 246。`GIFT_MOOD` 用的表情（`averted`、`smug`、`excited`、`scheming`、`serious`）都在 `MOODS_OF` 裡，美術發佈前顯示 `normal`。

## 交給 6e（羈絆文字）的接口
- **要填的文字**：`data/bond.zh-TW.ts` 的每一個 `bondPh(...)`：`BOND_SCENES`（羈絆 36 段、後日談 9 段、戀愛 9 段、星燈祭、「和大家一起」）、`BOND_TEXT.gift`、`BOND_TEXT.romanceLines`。名冊 spec §7.4 的 18 句故事戰利品反應句也進 `BOND_TEXT.gift`（7b 打開那 8 件之後）。6e 結束時 `data/bond.test.ts` 的 `drafts are registered` 改成 `BOND_PLACEHOLDERS.size === 0`。
- **骨架可以改**：暫定的句數與說話者只是讓閘門有東西檢查；6e 可以照 `lineCap` 與 spec §8 重新安排，只要 `worstCount` 在上限內、每段 `bond:*` 剛好一個選項。
- **掛勾**：
  - `if.tier`：後日談「階段 ≥ 3 多一句」（spec §8.5）。
  - `if.seen` / `if.notSeen`：依「玩家看過哪一段」換句子。**諾艾兒第一次叫「洛恩」**（6c progress 第 94 行）：6c 把它放在 `chat:noel:2`（集滿時）；6e 可以在 `bond:noel:3`（碎片 ≥ 4）寫一句 `{ full: 'noel', notSeen: 'chat:noel:2' }` 的「第一次」，並讓 `chat:noel:2` 已經播過的玩家看到另一個版本。這是讓羈絆場景承擔那一刻、又不重複的掛勾。
  - `if.returned` / `notReturned`（6c 既有）：**歐里克的碎片永遠沒交還時**，莉茲的後日談 `ending:liz` 用 `notReturned: 'orik'` 寫出父女在終幕之後相認（6c progress 第 140 行）。
  - `BOND_GUESTS`：讓鎮民在後日談、星燈祭、戀愛場景開口（每加一人在帳本記理由）。**安娜的三位同伴**、**瑪莎的丈夫**（6c progress 第 137 行）：鎮民沒有好感度、沒有後日談（spec §2 非目標），建議寫在 `epilogue` 的結尾兩句（帶 `if.returned: 'anna-name'`、`'marta-diary'`，旁白或鎮民開口），或某位夥伴的後日談；6e 決定後登記帳本。
  - **公主的下落**（帳本 I-78）：絲嘉蕾的心契場景或後日談（`bond:scarlet:4`、`ending:scarlet`）。
  - **星燈祭的群像**：`epilogue`，排在戀愛選擇之前，不提戀愛；**戀愛之夜**：`romance:c`，至少一句有其他夥伴、沒有人失落（spec §9.5）。
  - 「鎮上記得她們」（帳本 I-117，6c progress 第 162 行）：`epilogue` 的開場或結尾。
- **不可以動的**：終幕的 12 句；6c 寫好的任何字串；`rinOath`、`rinLines`、`townLines`、`greet`、`people` 的格式（見衝突第 9 點）。
- **帳本要登記的發明**（spec §11.3）：喜好表（Task 1 的表就是出處）、星燈祭、可戀愛者皆為成年人、諾艾兒與星紋石、每位夥伴的心契內容、波比的稱呼改不改。

## 6c 接手項的處理
1. **重看用當下狀態，歐里克的重逢重看時出現兩次**（6c progress 第 136 行）：Task 6.5 記下首播的讀法（`StoryState.heard`），重看照它播。6d 之前就看過的場景沒有紀錄，照舊用當下讀法（無法重建）。
2. **`rinOath`、`rinLines`、`townLines`、`greet`、`people` 是純字串，不能帶表情**（6c progress 第 78 行；spec §11.1 想替 `rinOath` 標表情）：**延後，不在 6d 轉格式**。理由：城鎮台詞與招呼在畫面上只有名字、沒有立繪（`ui2/scenes/town.ts` 的 `speak(name, text)`），人物頁是手冊的段落，標了表情畫面也不會變；轉格式等於重碰 6c 寫好的文字（spec §2 非目標）。哪一天城鎮台詞要顯示立繪，由那個計畫一起轉，`romanceLines` 也照同樣的格式。
3. **諾艾兒第一次叫「洛恩」要有羈絆場景的一刻**：Task 6 的 `if.seen` / `notSeen` 是掛勾，文字是 6e 的（見上）。
4. **星燈祭的群像與戀愛之夜**：Task 6 的 `epilogue`、`romance:c` 骨架，Task 8 的播放；文字是 6e 的。**終幕剛好 12 句，不改**：Task 6 的 `the finale is untouched` 與審查清單第 6 點。
5. **未完的故事線**（安娜的三位同伴、瑪莎的丈夫、公主的下落 I-78、歐里克的碎片沒交還時的父女）：6e 用上面的掛勾寫；6d 需要的掛勾（`BOND_GUESTS`、`if.seen`、既有的 `if.returned` / `notReturned`）都在 Task 6。

## 本計畫裁定的 spec 衝突
1. **第 21d 項對照哪一項。** spec §5.3 寫「第 9 項『任何組成都能用』」，但程式裡的第 9 項是「祭壇上限」，「任何組成都能用」是 `balance.lineups.test.ts` 的第 18 項。21d 照它的意思對照第 18d 項（60 格的 HP 損失都 ≥ 10%）。
2. **暫定文案的函式。** 6c 的 `ph()` 已經在 6c Task 14 刪掉，`PLACEHOLDERS` 是常數的空集合，`story.test.ts` 鎖住 `size === 0`。本計畫照 spec §11.2、§11.3 用新檔的 `bondPh()` 與 `BOND_PLACEHOLDERS`，不重新打開 6c 的清單。
3. **婉拒要記下來。** spec §4.7 說婉拒「不會被記錄」在 `gifts`，§4.8 又要手冊顯示「婉拒」。本計畫加 `BondRecord.refused?`，只給手冊用，不影響分數與驗證以外的任何東西。
4. **「和大家一起」需要一個場景 id。** 新增 `festival`（上限 3 句，歸在 `romance` 類），不進 `seen`、不出現在手冊。
5. **後日談從星燈祭之後的那一次回城開始；戀愛也要先看過星燈祭。** spec §9.4 的順序是「星燈祭 → 之後每次回城一段後日談 → 任何一次回城的星燈祭之夜」，§8.5 說星燈祭在戀愛選擇之前。本計畫用「`epilogue` 已看過」當這兩件事的門檻，讓順序在任何情況下成立；星燈祭那一次回城的對話名額照舊給一般對話。
6. **戀愛中斷的補播。** spec 沒說選了之後、場景播完之前關掉遊戲會怎樣。`chooseRomance` 把 `romance:c` 排進存檔的佇列，下次回城補播（Review Focus 1）。
7. **重看的讀法（`StoryState.heard`）** 是 6c 的接手項，不在 spec 裡；它是可選欄位，不升版本。
8. **救援戰。** spec §4.3 說「救援戰（相遇）不算：她在戰後才加入」，§12.2 說「逃跑與救援戰不加分」。本計畫照後者：救援戰整場不給任何人同隊分。
9. **純字串的台詞格式延後**（6c 接手項第 2 點）。
10. **加成取整數。** spec §5.1 的例子（+10 HP、+2 攻擊）是逐項向下取整的結果；`bondStats` 每一項 `Math.floor`，避免和其他來源的小數相加後多出一點。
11. **`danger` 的判定時間。** spec 只說「在 `resolveRound` 裡」；本計畫在每一個行動結算之後與回合結束的狀態結算之後檢查，所以同一回合內掉到 30% 又被補回來也算「救了她一命」。
12. **升階的那一行在全滅之後也說。** spec §4.8 只寫收穫畫面；分數在全滅時保留，所以本計畫在全滅的通知之後也說。
13. **介面上的數字。** spec §4.8 的例子寫「信賴　四十五／一百」，同一段又說介面文字可以用阿拉伯數字；本計畫照既有介面（手冊的碎片數）用阿拉伯數字。

## 需要使用者決定的事
沒有。spec §14 已經記下使用者的兩個決定（全部 9 位可戀愛、戀愛對象不能改）；上面的衝突都是不改變遊玩意圖的實作裁定。
