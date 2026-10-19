# 星燈迷宮 計畫 6f：迷宮中的換裝、站位與回復技能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 回應使用者的兩個要求：
1. 「在地城中要可以換裝」：在迷宮裡，出戰成員可以穿上這趟撿到的裝備（冒險背包裡的），也可以換下身上的裝備放回冒險背包。也可以調整出戰成員的站位（前、中、後排）。
2. 「沒有在戰鬥中應該也要可以使用一些回復技能」：不在戰鬥時，學會了回復技能的出戰成員可以花 TP 施放。這些技能在資料上標 `field: true`。

本計畫不改動任何平衡數值，也不升 `SAVE_VERSION`。

（第 3 個要求「裝備要有圖示」由美術計畫 5d 負責，見 `docs/superpowers/plans/2026-10-19-starlantern-plan5d-addendum.md`。）

**Architecture:**
- **規則放在引擎，畫面沿用城鎮的場景。** 新檔 `engine/field.ts` 只放純函式：迷宮施法 `castField`，以及冒險背包換裝 `packEquip`、`packUnequip`。`Game` 再包一層，檢查 `phase === 'map'`、身上有沒有 run、重量與背包格數，並把結果寫回。
- **場景用「模式」重用，不另做新場景。** `EquipScene` 與 `FormationScene` 用 `ctx.game.phase === 'map'` 判斷自己是不是在迷宮裡：
  - 裝備頁：背包格顯示冒險背包，換人只輪出戰成員，選單只剩「卸下」。
  - 編隊頁：挑人的清單只列出戰成員，沒有「移出隊伍」。
  - 迷宮的野外選單（C）新增三項：「技能」「裝備」「隊形」。返回的路線照狀態頁的做法：`ctx.go('equip')`，關閉後回到 `ctx.from`，也就是 `dungeon`。
- **迷宮施法和戰鬥用同一套算法，但不擲骰。** 施法者由 `fromMember` 轉成 combatant，技能經過 `skillFor`（技能樹、武器專精、傳說威力），TP 由 `skillCost` 計算，效果交給 `applyEffect` 套用。
  - 只套用 `heal`、`revive`、`restore` 三種效果。這三種都不抽亂數。
  - 傳入的 `rng` 是一個一被呼叫就丟錯的函式 `noDraw`。所以迷宮施法在結構上不可能從 `game.rng`、`lootRng`、`memoryRng` 或 `fillRooms` 的 rng 多抽任何一次。
- **平衡模擬不需要、也不可以模擬迷宮回復。** 理由見「平衡裁定」。本計畫不碰 `engine/sim.ts` 與任何 balance 檔。驗收方式：開工前與收尾時各跑一次平衡指令，`[balance]` 報告排序後必須逐位元相同。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、SCSS。

**依據：**
- 使用者原話：「在地城中要可以換裝 / 另外沒有在戰鬥中應該也要可以使用一些回復技能 / 裝備應該要有對應的 icon 不是只有一個文字」。
- 使用者的長期規定：「任何隊伍組成都要可以用」（見「為什麼不會讓治療者變成必帶」）。
- 讀過的程式碼：`ui2/scenes/dungeon.ts`（野外選單 `openMenu`、`itemList`、`statusList`）、`ui2/scenes/equip.ts`、`ui2/scenes/formation.ts`、`ui2/scenes/status.ts`、`engine/game.ts`（`setFormation`、`raiseNode` 在 `map` 階段的規則、`toTown`、`wipe`、`grant`、`shortBy`、`bagHasRoom`）、`engine/town.ts`（`equip`、`unequip`、`useFieldItem`、`clampToMax`）、`engine/battle.ts`（`fromMember`、`skillFor`、`skillCost`、`perform` 的 `skill` 分支）、`engine/skills.ts`（`applyEffect`）、`data/skills.ts`、`data/items.ts`、`data/weights.ts`、`engine/sim.ts`、`engine/balance*.test.ts`。

> 沒有以 `src/`、`tests/`、`docs/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。本計畫的 SDD 紀錄目錄是 `.superpowers/sdd/2026-10-19-starlantern-plan6f-field/`。

## 現況（讀過程式碼）
- **野外選單已經存在。** 按 C、Esc、右鍵，或點畫面上的「選單」鈕（`slx-menu-btn`），會打開 `openMenu`。目前有這些項目：隊伍狀態、道具、歸還之燈、本次狀況、手冊、設定、關閉。
  - 「道具」已經能在迷宮裡使用回復藥、TP 藥與復活羽毛（`useFieldItem`）。只能解除狀態的道具會被濾掉，因為戰鬥之間不會帶著毒或睡眠。
  - 「隊伍狀態」會打開 `status` 場景。技能點與天賦點在 `map` 階段也能花（`Game.raiseNode` 與 `raiseTalent` 接受 `map`，不存檔，回城後才存）。
- **背包（`state.bag`）是城鎮的倉庫，不在身上。** `carried()` 不計入背包。這趟撿到的裝備放在 `run.loot.gear`（冒險背包）。冒險背包會計入重量，平安回城時才放進背包；全滅就遺失。`bagHasRoom` 確保背包加上冒險背包不會超過 `BAG_SIZE`（60）。
- **換裝只在城鎮做得到。** 引擎的 `equip`／`unequip` 只是操作 `state.bag` 的純函式，本身不檢查階段；但迷宮的介面沒有路線可以進入裝備頁。
- **編隊。** `Game.setFormation` 在 `map` 階段也接受，但目前迷宮裡沒有入口。而且它允許把待命的夥伴換上場，可是待命的夥伴在城鎮的公會（`guild.ts` 的 `waiting()`、`recall` 只能在城鎮做）。
- **資源。** 我方只有 TP，沒有 MP。TP 是一個跨戰鬥保留的池（`roster[id].tp`，由 `writeBack` 寫回），只有旅館、TP 藥與泉水能補回來。只在戰鬥中累積的資源有兩種：
  - 必殺量表 `limit`：每次行動與受傷時增加；
  - 戰鬥中的 TP 回補：`x.tpRegen`、`crit-tp`／`weak-tp`／`kill-tp` 關鍵天賦。
  迷宮施法不碰以上任何一個。
- **回復類技能**（有 `heal` 或 `revive` 效果，而且對象是我方）：
  - 洛恩：`hero-mend`、`hero-prayer`、`abyss-light`；
  - 瑟蕾：`moonlight`、`moon-rain`、`full-moon`、`rebirth`；
  - 千鶴：`sacred-sake`；
  - 波比：`repair-kit`、`emergency-repair`。
  只能解除狀態的 `cleanse`、`hero-purify`，以及增益加解除狀態的 `sanctuary`，在戰鬥外沒有作用。
- **既有的小問題。** `dungeon.ts` 的 `itemList` 列出 `p.recruited`，所以人在城鎮公會的待命夥伴，也能在迷宮裡被餵藥。本計畫順便改成只列出戰成員（Task 5，有回歸測試）。

## Global Constraints

**使用者的方向（原話，最高依據）**
- 「在地城中要可以換裝」「沒有在戰鬥中應該也要可以使用一些回復技能」。
- 「任何隊伍組成都要可以用」：沒有任何組成可以因為本計畫變成必帶。新內容不可以假設迷宮裡有人會回復技能。
- 平衡以預設配點為準（記憶「星燈迷宮必須配點」）。

**分支與基準**
- `feat/starlantern-story`。開工前跑 `git status`：如果 `data/story/chains.ts` 或 `engine/balance.pace.test.ts` 仍有別人沒提交的修改，就停下來回報 NEEDS_CONTEXT。這兩個檔案由另一個代理負責，本計畫一律不碰、不 add。平衡基準要等它們提交之後才量。
- 工作樹裡別人沒提交的檔案（例如 `docs/superpowers/plans/2026-10-17-starlantern-plan5d-art.md`、美術檔）一律不碰、不 add。

**測試與檢查**
- TDD：每個任務先寫失敗的測試，確認它因為正確的理由失敗，再實作。
- 單檔：`rtk proxy npx vitest run src/scripts/games/starlantern/<路徑>`。
- 全套：`rtk proxy npx vitest run --testTimeout=20000`。要讀輸出的「Test Files」與「Tests」兩行，因為 rtk 的摘要可能藏住載入失敗的測試檔。不可以用 `npm run test`（watch 模式會卡住）。
- 平衡：`BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.test.ts src/scripts/games/starlantern/engine/balance.lineups.test.ts src/scripts/games/starlantern/engine/balance.deep.test.ts src/scripts/games/starlantern/engine/balance.pace.test.ts --testTimeout=300000`
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。只用 4352 埠。使用者的 dev server 在 4354，不可以使用；也不可以用 4321。
- tsc：`npx tsc --noEmit`。repo 原本就有 43 個錯誤（astro:content、bomber、tetris、hp-click）。完成的條件是 starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個錯誤。
- 本專案沒有 prettier、eslint，不要去跑。
- 瀏覽器一律 headless 並加 `--mute-audio`，絕不接管使用者的桌面。

**換行**
- 改檔前用 `git ls-files --eol <檔案>` 確認。改完看 `git diff --stat`，如果整檔都被改寫，代表換行壞了，要修好。CRLF 檔案不可以用 `sed -i`。新檔一律 LF。
- 本計畫會碰到的檔案：
  - LF：`ui2/scenes/dungeon.ts`、`ui2/scenes/dungeon.test.ts`、`ui2/scenes/equip.ts`、`ui2/scenes/equip.test.ts`、`ui2/scenes/formation.test.ts`、`ui2/scenes/statusTabs.ts`、`tests/e2e/starlantern.spec.ts`、`src/styles/_starlantern-ui.scss`
  - CRLF：`data/skills.ts`、`data/data.test.ts`、`engine/types.ts`、`engine/game.test.ts`、`ui2/scenes/formation.ts`、`ui2/scenes/status.test.ts`
  - 混用（照每一行原本的格式，新行跟著上下文）：`engine/game.ts`、`engine/battle.ts`、`data/text.zh-TW.ts`
  - 新檔（LF）：`engine/field.ts`、`engine/field.test.ts`

**git**
- 一律寫出完整路徑，不可以用 `git add -A` 或 `git add .`。
- Conventional Commits，訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 絕對不可以執行 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`。要撤回自己的修改，就再改一次檔案。
- 不可以 push；不可以碰 `.env`、智能合約、`public/`、`art-factory/` 底下的檔案。

**子代理**：實作者不派任何子代理。

**亂數**：不可以呼叫 `Math.random`。不可以從 `game.rng`、`lootRng`、`memoryRng` 或 `fillRooms` 的 rng 多抽任何一次。迷宮施法與換裝完全不抽亂數（Task 2 的 `noDraw` 與測試）。

**平衡（凍結）**
- 不可以動 `engine/sim.ts`、任何 `engine/balance*.test.ts`、`ENEMY_POWER`（含 ramp）、`DEEP_ENEMIES`、`PARTY_SCALE`、`GROUP_CAP`、`FIRST_DEPTH_CAP`、`BOSS_PARTY_SCALE`、技能的數值（`power`、`tp`、`pct`、`turns`），以及每一個平衡帶的門檻。門檻絕不放寬。
- `it.fails`、`it.skip`、`.only`、`.todo` 一律不可以出現在任何 commit。

**存檔**：`SAVE_VERSION` 維持 8。本計畫不新增任何存檔欄位。換裝、HP 與 TP 本來就在 `GameState` 裡，`Run` 本來就不存檔。

**介面**
- SCSS 禁用 `!important`；禁止行內樣式，包含 JS 的 `element.style`。只用 class。
- 不新增任何圖片、假圖示，也不用 CSS 畫形狀。`allArtUrls()` 維持剛好 246 個 url。
- 介面文字只放 `data/text.zh-TW.ts`。繁體中文、台灣用語、全形標點。

**定位程式碼**：一律用內容（函式名、測試名、字串）找要改的地方，不用行號。

**測試修改規則**：某個任務會弄壞的測試檔，都列在該任務的 Files 裡，並寫明怎麼改。全套跑出沒列到的紅燈時，先停下來回報 NEEDS_CONTEXT，不可以自行改寫該測試的意圖。

## 裁定（含理由）

### 1. 怎麼打開：鍵盤與滑鼠
- 沿用現有的野外選單，不新增按鍵：
  - 鍵盤：C 或 Esc（`menu`／`cancel`）；
  - 滑鼠：右鍵，或點畫面上的「選單」鈕。
- 選單的順序：隊伍狀態、**技能**、道具、**裝備**、**隊形**、歸還之燈、本次狀況、手冊、設定、關閉。
- 「技能」與「道具」放在一起，因為兩者都是回復手段。「裝備」與「隊形」接在後面，都是整備。
- 理由：`input.ts` 的按鍵表已經滿了（Q/E/R/F/Tab 在裝備頁另有用途）。再加一個全域熱鍵，就要多一條「哪個場景吃這個鍵」的規則。從選單進入，滑鼠、鍵盤與觸控都只要學一種方法。

### 2. 能換哪些裝備：只有冒險背包，背包（城鎮倉庫）不行
- 可以穿上的，只有這趟撿到、放在 `run.loot.gear` 的裝備。換下來的裝備放回冒險背包。
- 不能取用城鎮的背包（`state.bag`）。理由：
  1. 它不在身上：`carried()` 不計入它，遊戲文字也稱它為「背包」（城鎮的）、稱冒險背包為「帶在身上」。
  2. 如果能在迷宮裡取用倉庫，重量上限、回城的理由、「帶什麼出發」這個決定，都會一起失去意義。
  3. 整理、垃圾標記、鍛造、販賣都只在城鎮做；這條線維持不變。
- 規則：
  - 只限出戰成員。待命的夥伴人在公會。
  - 穿上：冒險背包少一件、身上多一件；原本那一格的裝備放回冒險背包。冒險背包的件數不變，或者少一件。
  - 卸下（不換新的）：冒險背包多一件。要檢查 `bag.length + pack.length + 1 ≤ BAG_SIZE`，否則拒絕（`full`）。理由：放不進去的裝備，回城時會被當成溢出而遺失。
  - 重量：穿在身上的裝備不計重量，冒險背包裡的裝備照 `itemWeight` 計重；換裝也可能讓力量改變，連帶改變 `capacity`。規則是：換完之後超重，而且比換之前更超重，就拒絕（`heavy`）。超重本身只會讓隊伍撿不了東西，所以不需要更嚴格。
  - HP 與 TP 會照新的上限截斷（沿用 `clampToMax`），和城鎮的換裝一樣。
- **全滅時（暫定，見文末問題 1）**：已經穿在身上的裝備會保留，因為全滅只會丟掉冒險背包。被換下、放回冒險背包的那一件會跟著遺失。
  - 理由：「穿上身就是自己的」最直覺。這也沒有讓全滅的風險憑空消失：換裝只是在「哪一件冒險」之間做選擇；只有空的欄位能真正多保住一件，最多 9 格。
  - Task 3 用測試把這個行為固定下來，之後要改也只改這一處。

### 3. 隊形：只能調整站位，不能換人
- 迷宮裡的編隊頁只能在現有的出戰成員之間調整站位（前、中、後排，以及同一排的格子）。
- 不能把待命的夥伴換上場，也不能讓人下場。理由是待命的人在城鎮。
- 引擎要擋住：在 `map` 階段，`Game.setFormation` 會比較新舊的出戰名單（集合），不同就拒絕（`lineup`）。這同時補上「引擎在 `map` 階段允許換人」的漏洞。

### 4. 哪些技能可以在迷宮裡用：資料旗標 `field: true`
- `SkillDef` 加上 `field?: true`。標上的是 10 個技能：
  - `hero-mend`、`hero-prayer`、`abyss-light`；
  - `moonlight`、`moon-rain`、`full-moon`、`rebirth`；
  - `sacred-sake`；
  - `repair-kit`、`emergency-repair`。
- 不標的技能與理由：
  - `cleanse`、`hero-purify`：戰鬥之間沒有毒與睡眠，在迷宮裡沒有作用。
  - `sanctuary`、所有增益與傷害技能：增益只在戰鬥中存在。
- 不變式（Task 1 的資料測試）：一個技能標了 `field`，**若且唯若**它有 `heal` 或 `revive` 效果、對象是 `ally`／`allies`／`deadAlly`、不是被動、沒有 `hpCost`。這樣之後新增的回復技能，不會忘了標。
- 必殺技（`ULTIMATES`）不能在迷宮裡用：它們吃只在戰鬥中累積的 `limit` 量表。

### 5. 迷宮施法的成本與效果
- TP 成本與戰鬥完全相同：`skillCost(fromMember(m), id)`，含天賦與技能樹的 `tpDelta`、`teachers-gift` 的 `tpCost`、傳說威力。
  - 理由：同一個池、同一個價格，就不會出現「在迷宮裡補血比較划算」，也不需要新的資源。
- 威力與戰鬥相同，經過 `skillFor`：技能樹的等級與強化節點、勇者的武器專精、傳說威力（例如 `lg-selene` 把月光改成全體）。
  - 治療量照 `applyEffect` 的公式，含施法者的 `x.heal` 與 `moon-promise`。
  - 深淵技能（`abyss-light`）的加成照戰鬥的算法：用 `abyssPct(game.floor)`，因為迷宮裡沒有「戰鬥的深度」，所在的這一層就是同一個深度。
- 只套用 `heal`、`revive`、`restore`。`cure`、`buff`、`taunt`、`turret`、`damage`、`inflict` 一律略過。修改後的技能如果出現非我方的對象，就拒絕（`invalid`）。
- HP 上限用 `statsOf(m).hp`。迷宮裡沒有祭壇加成：祭壇只在 `createBattle` 加在戰鬥內的上限上。
  - **絕不降低 HP**：如果某人戰鬥後的 HP 高於 `statsOf` 的上限（祭壇留下的），迷宮治療不會把它壓低。寫回時取 `max(原本的 HP, 治療後的 HP)`。
  - 既有的 `useFieldItem` 也有同樣的壓低問題，但它不在本計畫的範圍，記在交接。
- 如果沒有任何對象會回復 HP 或被復活，就拒絕（`no-effect`），不扣 TP。理由：避免玩家誤按，把 TP 浪費在滿血的人身上。
- 必殺量表、TP 回補、關鍵天賦的 TP 獎勵，一律不動。
- 施法者必須是活著的出戰成員，而且學會了該技能（`skillRank(m.tree, id) > 0`，和戰鬥的判斷相同）。
- 不存檔。行為和迷宮裡的配點一樣：馬上生效，回城時隨進度一起存。

### 6. 平衡裁定
- **模擬怎麼看待戰鬥之間的 HP：完全不看。** `partyAt` 與 `kitParty` 讓每一場模擬戰鬥都從滿 HP、滿 TP 開始（`p.roster[id] = { ...m, hp: s.hp, tp: s.tp }`）。每一個帶量的都是「從滿狀態開始的一場戰鬥」：勝率、hpLoss、回合數，以及第 13、15–18 項的少人隊伍。
- 迷宮回復只能把戰鬥之間的 HP 往「滿」推，而模擬本來就假設是滿的。所以凍結的帶在數學上不會動。**不模擬迷宮回復**：它的上限正是模擬的起點，模擬它只會讓模擬變複雜，量到的數字卻相同。
- 它真正改變的是「一趟要喝幾瓶藥、什麼時候回城」的消耗節奏。這個節奏目前沒有任何平衡帶。本計畫用三件事把它壓住，而不是新增平衡帶：
  1. 和戰鬥同一個 TP 池、同一個價格（裁定 5）。
  2. 不新增 TP 的來源。
  3. 不改藥、泉水、旅館的數值。
- **測試義務**
  1. Task 1 開工前跑一次平衡指令，把 `[balance]` 行排序後存成 `.superpowers/sdd/2026-10-19-starlantern-plan6f-field/balance-before.txt`。Task 6 再跑一次，`balance-after.txt` 必須逐位元相同。不同就停下來回報 BLOCKED，不可以調任何數值。
  2. Task 2 的守門測試：`engine/sim.ts`、`engine/battle.ts`、`engine/balance*.test.ts` 的原始碼都不 import `./field`。這樣模擬永遠不會「順手」用上迷宮回復。
  3. 第 18 項（任何隊伍組成都可以用，`ODD_LINEUPS.noHeal` 等）維持綠，不改。

### 7. 為什麼不會讓治療者變成必帶（「任何隊伍組成都要可以用」）
- 平衡帶不計入迷宮回復（裁定 6）。所以不帶治療者的隊伍，每一場戰鬥的難度和本計畫之前完全相同；`noHeal` 這條帶照舊量它。
- 迷宮回復不是治療者獨有：
  - 洛恩永遠在場（`no-hero` 規則），任何隊伍都可以走他的「祈光」分支；
  - 千鶴、波比也有；
  - 回復藥、復活羽毛、泉水、歸還之燈對任何組成都一樣。
  - 預設配點（`balanced`）的洛恩沒有走祈光，平衡也照舊是對著預設配點量。
- 它只是把 TP 換成 HP 的方便，換算率和戰鬥裡一樣，所以不會產生「沒有它就打不過」的內容。
- 約束（寫進 Review Focus）：之後的任何內容（例如名冊的怪物、懸賞）都不可以假設隊伍能在迷宮裡回復技能，也不可以設計只有迷宮回復才解得開的消耗。

### 8. 存檔
`SAVE_VERSION` 維持 8。沒有新的存檔欄位：裝備、HP、TP 本來就在 `GameState`，冒險背包在不存檔的 `Run` 裡。迷宮裡的改動和現在的配點一樣，回城後隨下一次存檔寫入。

## Review Focus
1. **不抽亂數。** 迷宮施法與換裝之後，`game.rng` 被呼叫 0 次，`run.lootDraws` 與 `run.memoryDraws` 不變。測試：Task 2、Task 3。
2. **HP 只升不降，TP 只扣成本。** 祭壇留下的超量 HP 不會被治療壓低；`no-effect` 時不扣 TP；`limit` 不變。測試：Task 2。
3. **裝備不會憑空消失或複製。** 每一次換裝，前後「身上＋冒險背包」的 uid 集合相同；卸下時，背包加冒險背包的件數不會超過 `BAG_SIZE`；超重而且更重就拒絕。全滅時穿著的保留、冒險背包裡的遺失。測試：Task 3。
4. **待命的人碰不到。** 迷宮裡的道具、施法、換裝、隊形，都只對出戰成員有效；迷宮裡的 `setFormation` 不能換人。測試：Task 3、Task 5。
5. **城鎮限定的事仍然是城鎮限定。** 迷宮裡的裝備頁不能整理背包、不能改自動垃圾、不能標記垃圾；鍛造、召回、旅館照舊。測試：Task 4。
6. **平衡逐位元相同。** 測試：Task 6 的 before／after 比對，以及 Task 2 的守門測試。

---

## File Structure
- `engine/types.ts`：`SkillDef.field?: true`（Task 1）。
- `data/skills.ts`：10 個技能加上 `field: true`（Task 1）。
- `data/data.test.ts`：`field` 的不變式（Task 1）。
- `engine/battle.ts`：只把 `function fromMember` 改成 `export function fromMember`，行為不變（Task 2）。
- `engine/field.ts`（新）：`noDraw`、`fieldSkills`、`fieldTargets`、`castField`（Task 2）；`packEquip`、`packUnequip`（Task 3）。
- `engine/field.test.ts`（新）：Task 2、Task 3 的引擎測試，以及守門測試。
- `engine/game.ts`：`castInField`（Task 2）；`equipFromPack`、`unequipToPack`、`setFormation` 的站位規則（Task 3）。
- `engine/game.test.ts`：Game 層的階段、亂數、全滅測試（Task 2、Task 3）。
- `data/text.zh-TW.ts`：`T.reasons` 的新原因；`T.ui2.dungeon`、`T.ui2.equip`、`T.ui2.formation`、`T.ui2.status` 的新字串（Task 3–5）。
- `ui2/scenes/equip.ts`、`ui2/scenes/equip.test.ts`：迷宮模式（Task 4）。
- `ui2/scenes/formation.ts`、`ui2/scenes/formation.test.ts`：迷宮模式（Task 4）。
- `ui2/scenes/statusTabs.ts`、`ui2/scenes/status.test.ts`：技能頁的「迷宮中可用」標記（Task 4）。
- `ui2/scenes/dungeon.ts`、`ui2/scenes/dungeon.test.ts`：選單的三個新項目、施法流程、道具只列出戰成員（Task 5）。
- `src/styles/_starlantern-ui.scss`：只在需要時加迷宮模式的 class（Task 4、Task 5）。
- `tests/e2e/starlantern.spec.ts`：一個新的 e2e 測試（Task 6）。

---

### Task 1: 資料旗標 `field` 與平衡基準

**Files:**
- Modify：`engine/types.ts`（`SkillDef` 加上 `/** Castable outside battle from the labyrinth's field menu (plan 6f): heals and revives only. */ field?: true;`）、`data/skills.ts`
- Test：`data/data.test.ts`
- Create：`.superpowers/sdd/2026-10-19-starlantern-plan6f-field/balance-before.txt`（不進 git 也可以；有進就只 add 這個檔）

**Read:** `data/skills.ts` 全部、`engine/types.ts` 的 `SkillDef` 與 `Effect`、`data/data.test.ts` 的既有寫法。

**Interfaces:**
- Produces：`SkillDef.field?: true`；`FIELD_SKILL_IDS` 不另外匯出（由 `Object.values(SKILLS).filter((s) => s.field)` 推出，避免兩份清單）。

- [ ] **Step 1：量平衡基準。** 確認 `git status` 沒有 `data/story/chains.ts` 與 `engine/balance.pace.test.ts` 的未提交修改（有就停下來回報 NEEDS_CONTEXT）。執行平衡指令，把 `[balance]` 開頭的行排序後存成 `balance-before.txt`，並記下 Test Files／Tests 兩行。
- [ ] **Step 2：先寫失敗的測試**（`data/data.test.ts`）
  - `field skills are exactly the party heals and revives`：對每個 `SKILLS` 項目，`!!s.field === (!s.passive && !s.hpCost && ['ally', 'allies', 'deadAlly'].includes(s.target) && s.effects.some((e) => e.kind === 'heal' || e.kind === 'revive'))`。
  - `the field list is the ten recovery skills`：`field` 的 id 集合等於上面那 10 個（寫死，當作清單的護欄）。
  - `cure-only skills are not field skills`：`cleanse`、`hero-purify`、`sanctuary` 沒有 `field`。
- [ ] **Step 3：執行，確認失敗**：預期 2 個測試失敗，原因是沒有任何技能帶 `field`。第 3 個測試這時會通過，這是對的。
- [ ] **Step 4：實作**：在 10 個技能的物件上加 `field: true`。不改任何其他欄位。
- [ ] **Step 5：確認通過**：`data/data.test.ts`、`engine/skills.test.ts`、`engine/battle.test.ts` 全綠（`field` 不影響戰鬥）。
- [ ] **Step 6：commit**：`feat(starlantern): mark the recovery skills that work outside battle`

### Task 2: 引擎：迷宮施法 `castField`

**Files:**
- Modify：`engine/battle.ts`（只在 `function fromMember` 前加 `export`）、`engine/game.ts`
- Create：`engine/field.ts`、`engine/field.test.ts`
- Test：`engine/game.test.ts`

**Read:** `engine/battle.ts` 的 `fromMember`、`skillFor`、`skillCost`、`perform` 的 `skill` 分支（深淵加成那兩行）；`engine/skills.ts` 的 `applyEffect`（`heal`、`revive`、`restore`）；`engine/progression.ts` 的 `skillRank`、`pctMod`、`learnedSkills`；`engine/scaling.ts` 的 `abyssPct`；`engine/game.ts` 的 `raiseNode`（`map` 階段不存檔的寫法）。

**Interfaces:**
- Produces（`engine/field.ts`）：
  - `export const noDraw: Rng`：一被呼叫就 `throw new Error('field actions never draw')`。
  - `export type FieldFail = 'invalid' | 'down' | 'not-learned' | 'tp' | 'no-effect';`
  - `export interface FieldGain { id: CharacterId; hp: number; revived: boolean }`
  - `export function fieldSkills(m: Member): string[]`：`learnedSkills(m)` 裡帶 `SKILLS[id].field` 的 id，照 `learnedSkills` 的順序。
  - `export function fieldTargets(p: Party, caster: CharacterId, skill: string): CharacterId[]`：單體技能的可選對象，順序照 `activeIds(p)`。
    - `ally`：活著的出戰成員；
    - `deadAlly`：倒下的出戰成員；
    - `allies`／`self`：回傳空陣列（不必選對象）。
    - 對象由 `skillFor(fromMember(...), skill).target` 決定，所以傳說把技能改成全體時，這裡也跟著變。
  - `export function castField(s: GameState, o: { caster: CharacterId; skill: string; target?: CharacterId; depth: number }): { ok: true; state: GameState; gains: FieldGain[]; cost: number } | { ok: false; reason: FieldFail }`。純函式，用 `structuredClone`；規則照「裁定 5」：
    1. 施法者是出戰成員，否則 `invalid`；HP > 0，否則 `down`。
    2. `SKILLS[skill]?.field`，否則 `invalid`；`skillRank(m.tree ?? {}, skill) > 0`，否則 `not-learned`。
    3. 從 `p.grid` 為每個出戰成員建立 `fromMember(m, cell)`。`def = skillFor(caster, skill)`；如果 `def.abyss` 而且 `abyssPct(depth) > 0`，`def = patchSkill(def, pctMod(def.id, 100 + abyssPct(depth)))`。`cost = skillCost(caster, skill)`；`caster.tp < cost` 就回 `tp`。
    4. 對象：
       - `ally`：`target` 必須在 `fieldTargets` 裡；
       - `deadAlly`：同上；
       - `allies`：全部活著的出戰成員，如果效果含 `revive` 也包含倒下的；
       - `self`：施法者；
       - 其他：`invalid`。
    5. 每個對象依序套用 `heal`／`revive`／`restore`，`ctx = { rng: noDraw, itemBoost: false, revealed: {}, log: [] }`。
    6. 結算：HP 比原本高的人，或被復活的人，記成 `FieldGain`。沒有任何一個就回 `no-effect`。
    7. 寫回 clone：對象的 `hp = Math.max(原本的 hp, combatant.hp)`；被復活的人取 combatant 的 hp。施法者的 `tp -= cost`；有 `hpCost` 就照戰鬥的算法扣 HP，至少留 1。`limit` 與對象的 TP 不寫。
- Produces（`engine/game.ts`）：`castInField(caster: CharacterId, skill: string, target?: CharacterId): ReturnType<typeof castField> | { ok: false; reason: 'phase' }`。
  - `phase !== 'map'` 或沒有 run 時回 `phase`。
  - 成功時 `this.state = r.state`，不存檔（和 `raiseNode` 在 `map` 階段相同）。
  - `depth` 傳 `this.floor`。

- [ ] **Step 1：先寫失敗的測試**（`engine/field.test.ts`；夥伴用 `fullParty()` 或 `partyWith` 加上手設的 `tree`，例如 `tree: { moonlight: 1 }`）
  - `a learned heal restores HP by the battle formula and costs its battle TP`：瑟蕾學會月光，自己 HP 一半。期望值用 `applyEffect` 與 `skillCost` 對同一個 combatant 算一次（不可以抄 field 的輸出）。
  - `a revive raises a fallen member on the field`：`rebirth` 讓 HP 0 的出戰成員回到 `floor(max × 0.3)`，`revived: true`。
  - `the whole-party heal skips nobody standing and lowers nobody`：`moon-rain`。其中一人的 HP 高於 `statsOf` 的上限（模擬祭壇留下的），結果 HP 不變，也不出現在 `gains`。
  - `a worn power that turns moonlight on the whole party is honoured`：穿上 `lg-selene`（`special: 'lg-selene'` 的頭冠），`fieldTargets` 回傳空陣列，`castField` 不帶 `target` 就能補全體。
  - `refusals spend nothing`：每個失敗情境都斷言 `state` 沒變（`toEqual` 原本的 clone）：沒學會（`not-learned`）、TP 不足（`tp`）、全員滿血（`no-effect`）、施法者倒下（`down`）、施法者是待命成員（`invalid`）、對象是待命成員（`invalid`）、技能不是 `field`（例如 `hex`，`invalid`）。
  - `the gauge and the targets' TP are untouched`：`limit` 與對象的 `tp` 前後相同。
  - `the abyss light grows with the depth like in battle`：`abyss-light` 在深度 1 與深度 30 的治療量，各自等於戰鬥以 `abyssPct` 算出的值。
  - `field actions never draw`：`castField` 成功的路徑不丟錯（`noDraw` 沒被呼叫）。
  - 守門：`neither the simulation nor battle imports the field module`：用 `fs.readFileSync` 讀 `engine/sim.ts`、`engine/battle.ts`，以及 `engine/` 底下每一個 `balance*.test.ts` 的原始碼，斷言都不含 `from './field'`。
- [ ] **Step 2：先寫失敗的測試**（`engine/game.test.ts`）
  - `casting in the field works on the map only, draws nothing and is not saved`：
    - 用 `memoryStorage` 的 Game 出發，把 `rng` 包成會計數的 spy；
    - `castInField` 成功，spy 被呼叫 0 次，`run.lootDraws`、`run.memoryDraws` 不變；
    - storage 沒有被寫入（比對 `map` 的內容）；
    - 回城之後，`castInField` 回 `phase`。
- [ ] **Step 3：執行，確認失敗**：預期原因是 `engine/field.ts` 不存在，以及 `castInField is not a function`。
- [ ] **Step 4：實作**：`battle.ts` 加 `export`，並跑 `git diff --stat` 確認只有那一行；實作 `field.ts` 與 `Game.castInField`。
- [ ] **Step 5：確認通過**：`engine/field.test.ts`、`engine/game.test.ts`、`engine/battle.test.ts`、`engine/skills.test.ts` 全綠。
- [ ] **Step 6：commit**：`feat(starlantern): recovery skills can be cast outside battle, at their battle TP, with no draw`

### Task 3: 引擎：迷宮換裝（冒險背包）與站位規則

**Files:**
- Modify：`engine/field.ts`、`engine/game.ts`、`data/text.zh-TW.ts`（`T.reasons` 加上 `heavy`、`lineup`、`tp`、`'no-effect'`、`down`、`'not-learned'`；`full` 已有）
- Test：`engine/field.test.ts`、`engine/game.test.ts`

**Read:** `engine/town.ts` 的 `equip`、`unequip`、`clampToMax`；`engine/game.ts` 的 `shortBy`、`bagHasRoom`、`toTown`、`wipe`、`setFormation`；`data/weights.ts`；`engine/party.ts` 的 `setFormation`、`activeIds`、`defaultSlotFor`、`slotsFor`。

**Interfaces:**
- Produces（`engine/field.ts`）：
  - `export function packEquip(s: GameState, pack: ItemInstance[], member: CharacterId, uid: number, slot?: Slot): { ok: true; state: GameState; pack: ItemInstance[] } | { ok: false; reason: 'invalid' | 'stock' }`：寫法照 `town.equip`，但來源與去處是 `pack`。回傳新的 `state` 與新的 `pack` 陣列（不改傳進來的物件），最後 `clampToMax`。
  - `export function packUnequip(s: GameState, pack: ItemInstance[], member: CharacterId, slot: Slot): { ok: true; state: GameState; pack: ItemInstance[] } | { ok: false; reason: 'invalid' | 'full' }`：`s.bag.length + pack.length + 1 > BAG_SIZE` 時回 `full`。
  - 兩者都要求 `member` 是出戰成員，否則 `invalid`。
- Produces（`engine/game.ts`）：
  - `equipFromPack(member: CharacterId, uid: number, slot?: Slot): { ok: true } | { ok: false; reason: 'phase' | 'invalid' | 'stock' | 'heavy' }`
  - `unequipToPack(member: CharacterId, slot: Slot): { ok: true } | { ok: false; reason: 'phase' | 'invalid' | 'full' | 'heavy' }`
  - 兩者都要 `phase === 'map'` 而且有 run。重量規則：`over = carried(state, run) − capacity(state.party)`，前後各算一次；`after > 0 && after > before` 時回 `heavy`，不寫入。成功時寫回 `this.state` 與 `this.run.loot.gear`（用新的陣列）。不存檔。
  - `setFormation`：`phase === 'map'` 時，新 grid 的出戰集合必須等於目前的出戰集合，否則回 `{ ok: false, reason: 'lineup' }`。型別改成 `SetFormationFail | 'invalid' | 'lineup'`。城鎮的行為不變。

- [ ] **Step 1：先寫失敗的測試**（`engine/field.test.ts`）
  - `wearing from the pack swaps with what was worn`：前後「身上＋pack」的 uid 集合相同；pack 的件數不變（有換下的那一件）或少 1（原本是空格）。
  - `a ring goes to the first empty ring slot like in town`：沿用 `defaultSlotFor`。
  - `taking off puts the piece in the pack, unless the bag and the pack are full`：`bag.length + pack.length === BAG_SIZE` 時回 `full`，`state` 不變。
  - `wearing clamps HP and TP to the new maximum`：換下加 HP 的裝備之後，`hp ≤ statsOf().hp`。
  - `a member on the bench cannot change gear in the field`：`invalid`。
- [ ] **Step 2：先寫失敗的測試**（`engine/game.test.ts`）
  - `gear changes in the field are refused in town and when they make the pack heavier past the limit`：
    - 城鎮回 `phase`；
    - 把冒險背包塞到剛好滿重，卸下一件重的裝備，回 `heavy`，state 與 pack 都不變；
    - 換上一件比較輕的（變輕了）照樣允許，即使仍然超重。
  - `field gear changes draw nothing`：rng spy 被呼叫 0 次，`run.lootDraws` 不變。
  - `a piece worn from the pack survives a wipe; the piece it replaced is lost with the pack`：用 `submitRound` 打輸一場（照這個檔案裡既有全滅測試的做法），回城鎮之後，`roster.hero.equip.weapon.uid` 是新的那一件，`bag` 裡沒有舊的那一件。
  - `in the labyrinth the formation can move people but not change who is out`：
    - 交換兩人的格子：ok；
    - 把待命的人放上場：`lineup`；
    - 讓某人下場：`lineup`；
    - 城鎮裡把待命的人放上場：照舊 ok。
- [ ] **Step 3：執行，確認失敗**：預期原因是 `packEquip`、`equipFromPack` 不存在，以及 `setFormation` 在 `map` 階段接受了換人。
- [ ] **Step 4：實作**，`T.reasons` 加上新原因的文字：
  - `heavy: '太重了，冒險背包裝不下'`
  - `lineup: '迷宮裡只能調整站位，不能換人'`
  - `tp: 'TP 不足'`
  - `'no-effect': '沒有需要回復的人'`
  - `down: '倒下的人不能行動'`
  - `'not-learned': '還沒學會這個技能'`
- [ ] **Step 5：確認通過**：`engine/` 全綠；`ui2/scenes/formation.test.ts` 仍綠（城鎮行為不變）。
- [ ] **Step 6：commit**：`feat(starlantern): change gear from the run pack and move rows in the labyrinth`

### Task 4: 畫面：裝備頁、編隊頁的迷宮模式，以及技能頁的標記

**Files:**
- Modify：`ui2/scenes/equip.ts`、`ui2/scenes/formation.ts`、`ui2/scenes/statusTabs.ts`、`data/text.zh-TW.ts`、`src/styles/_starlantern-ui.scss`（只在需要時）
- Test：`ui2/scenes/equip.test.ts`、`ui2/scenes/formation.test.ts`、`ui2/scenes/status.test.ts`

**Read:** `ui2/scenes/equip.ts` 全部（`bag` getter、`pick`、`takeOff`、`done`、`openMenu`、`menuPick`、`page`、`render`、背景）；`ui2/scenes/formation.ts` 全部；`ui2/scenes/equip.test.ts` 與 `formation.test.ts` 的 setup；`ui2/scenes/statusTabs.ts` 的 `skills` 分頁。

**Interfaces:**
- `EquipScene`：
  - `private get field(): boolean { return this.ctx.game.phase === 'map' && !!this.ctx.game.run; }`
  - `bag` getter：迷宮時回 `run.loot.gear`，城鎮時回 `state.bag`。60 格的格子不變：冒險背包最多 `BAG_SIZE − bag.length` 件，一定放得下。
  - `pick`／`takeOff`：迷宮時改呼叫 `game.equipFromPack`／`game.unequipToPack`。
    - `done` 改成接受「已經套用」的 `{ ok: true } | { ok: false; reason }`。城鎮的路徑在呼叫前先 `game.apply`。
    - `full` 在迷宮時顯示 `T.ui2.equip.fullField`。
  - `page`：迷宮時只輪 `activeIds`。`enter` 的預設對象：`arg` 不是出戰成員就用 `hero`。
  - `openMenu`：迷宮時只列「卸下」（有穿東西時）；沒有東西可以卸下時，列一條停用的 `T.ui2.equip.menu.townOnly`。
  - `bagCount`：迷宮時顯示 `T.ui2.equip.pack(n, formatWeight(carried), formatWeight(capacity))`，超重時加 class `slx-weight-full`（沿用既有的顏色 class；只在選擇器不夠用時才新增 SCSS）。
  - 背景：迷宮時不放公會的背景圖。提示文字：迷宮時用 `T.ui2.equip.hintField`。
- `FormationScene`：迷宮時 `openPick` 只列 `activeIds`，不加「移出隊伍」，規則清單用 `T.ui2.formation.fieldRules`，不放公會背景。`place` 照舊呼叫 `game.setFormation`；被拒時顯示 `T.reasons.lineup`。
- `statusTabs.ts` 的技能分頁：帶 `field` 的技能，在技能名稱後面加 `<span class="slx-field-tag">` 顯示 `T.ui2.status.fieldTag`（「迷宮中可用」）。
- 文字（`data/text.zh-TW.ts`）：
  - `T.ui2.equip.pack: (n: number, w: string, cap: string) => \`冒險背包 ${n} 件　重量 ${w}／${cap}\``
  - `T.ui2.equip.hintField`：一行，說明 Enter 穿上或卸下、Q/E 換人、Esc 返回。
  - `T.ui2.equip.fullField: '回城時背包放不下了，不能再卸下'`
  - `T.ui2.equip.menu.townOnly: '整理背包要回城才能做'`
  - `T.ui2.formation.fieldRules: string[]`：例如「迷宮裡只能調整站位」「換人要回公會」。
  - `T.ui2.status.fieldTag: '迷宮中可用'`

- [ ] **Step 1：先寫失敗的測試**（`equip.test.ts`；出發的寫法照 `dungeon.test.ts` 的 `setup`，再用 `new EquipScene` 並傳入 `from: 'dungeon'`）
  - `in the labyrinth the bag shows the run pack, and wearing from it works`：格子數等於 60；有物品的格子數等於 `run.loot.gear.length`；點一下（滑鼠）就穿上，`roster.hero.equip.weapon.uid` 改變。
  - `in the labyrinth the town bag is out of reach`：`state.bag` 有東西，冒險背包是空的；畫面上沒有任何格子帶 rarity class。
  - `in the labyrinth the menu offers only taking off`：沒有 `sort-*`、`auto-*`、`junk` 項目。
  - `in the labyrinth paging skips members on the bench`：E 連按，只輪過 `activeIds`。
  - `a refusal for weight says why`：塞到超重，卸下時 `.slx-equip-notice` 是 `T.reasons.heavy`，並播放錯誤音效。
  - `cancel goes back to the labyrinth`：`go` 被呼叫，參數是 `'dungeon'`。
  - 既有的城鎮測試全部不改，必須維持綠。
- [ ] **Step 2：先寫失敗的測試**（`formation.test.ts`）
  - `in the labyrinth the pick list holds only members on the field and no remove`。
  - `in the labyrinth two members swap cells`：交換後 grid 正確，`go` 沒有被呼叫。
- [ ] **Step 3：先寫失敗的測試**（`status.test.ts`）
  - `the skills tab marks the skills usable in the labyrinth`：瑟蕾學會月光，那一列有 `.slx-field-tag`；學會的 `dream` 沒有。
- [ ] **Step 4：執行，確認失敗**，然後實作。
- [ ] **Step 5：確認通過**：`rtk proxy npx vitest run src/scripts/games/starlantern/ui2` 全綠。
- [ ] **Step 6：commit**：`feat(starlantern): the equipment and formation screens work in the labyrinth`

### Task 5: 畫面：野外選單的「技能」「裝備」「隊形」

**Files:**
- Modify：`ui2/scenes/dungeon.ts`、`data/text.zh-TW.ts`
- Test：`ui2/scenes/dungeon.test.ts`

**Read:** `ui2/scenes/dungeon.ts` 的 `openMenu`、`list`、`itemList`、`statusList`、`say`、`refresh`；`dungeon.test.ts` 的 `setup` 與 `pick`，以及 `uses a potion from the field menu`、`opens the status screen on the member picked from 隊伍狀態`。

**Interfaces:**
- `openMenu` 的項目與順序：`status`、`skills`、`items`、`equip`、`formation`、`lamp`、`condition`、`handbook`、`settings`、`close`。
  - `skills` 在沒有任何活著的出戰成員有 `fieldSkills` 時停用。
  - `equip`、`formation`：`popAll()`、`leaving = true`、`ctx.go('equip')`／`ctx.go('formation')`。
- `skillList()`：三層的清單，都用既有的 `list(...)`。
  1. 施法者：活著、而且有 `fieldSkills` 的出戰成員。標籤是名字，右欄是 `TP 現在／上限`。
  2. 技能：標籤是技能名稱，右欄是 `TP 成本`。TP 不足時，或沒有可選對象時（`ally`／`deadAlly` 而 `fieldTargets` 是空的），停用。
  3. 對象：只有 `fieldTargets` 不是空陣列時才出現。標籤是名字，右欄是 `HP 現在／上限`；`deadAlly` 列倒下的人。全體技能跳過這一層，直接施放。
- 施放：`game.castInField(...)`，然後 `popAll()`。
  - 失敗：播放錯誤音效，`say(T.reasons[reason])`。
  - 成功：`sfx.heal`、`refresh()`，然後 `say` 一則訊息：第一行是 `T.ui2.dungeon.cast(施法者, 技能)`，之後每個 `gain` 一行（`healed(name, n)` 或 `revived(name)`），用 `\n` 連接，和 `descend` 的升級訊息寫法相同。
- `itemList` 的對象清單：`p.recruited` 改成 `activeIds(p)`（回歸修正）。
- 文字（`T.ui2.dungeon`）：
  - `skills: '技能'`、`equip: '裝備'`、`formation: '隊形'`
  - `castWho: '誰要施放技能？'`
  - `castWhat: (name: string) => \`${name}要施放哪個技能？\``
  - `castOn: (skill: string) => \`${skill}要對誰施放？\``
  - `cast: (who: string, skill: string) => \`${who}施放了${skill}。\``
  - `healed: (name: string, n: number) => \`${name}回復了 ${n} HP。\``
  - `revived: (name: string) => \`${name}站起來了！\``
  - `noSkills: '沒有可以在迷宮中使用的技能。'`

- [ ] **Step 1：先寫失敗的測試**（`dungeon.test.ts`）
  - `the field menu lists skills, equipment and formation in order`：選項的標籤順序和上面相同。
  - `skills is disabled while nobody has learned a field skill`。
  - `casting a heal from the field menu heals and says so`：用 `LEGACY_LINEUP` 的瑟蕾，`prep` 設 `tree.moonlight = 1`、諾艾兒 HP 1。依序點 技能 → 瑟蕾 → 月光 → 諾艾兒；HP 上升，TP 減少，文字含 `T.ui2.dungeon.healed`，`sfx` 的 `heal` 被呼叫（setup 的 sfx 要補上 `heal`）。
  - `a skill short of TP is greyed out`：TP 設成 0，技能那一列帶 `disabled`／`aria-disabled`（照 `MenuView` 既有的標記）。
  - `a whole-party heal casts without asking for a target`：`moon-rain`。
  - `equipment and formation open their screens and come back here`：`go` 依序被呼叫 `'equip'`、`'formation'`。
  - `items reach only the members on the field`（回歸）：待命的人不出現在對象清單裡。原本的 `uses a potion from the field menu` 維持綠。
- [ ] **Step 2：執行，確認失敗**，然後實作。
- [ ] **Step 3：確認通過**：`ui2/` 全綠。
- [ ] **Step 4：commit**：`feat(starlantern): the field menu casts recovery skills and opens equipment and formation`

### Task 6: 收尾：平衡比對、全套、tsc、e2e 與截圖

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`
- Create：`.superpowers/sdd/2026-10-19-starlantern-plan6f-field/balance-after.txt`

**Read:** e2e spec 裡 `gear drops, comes home and is worn` 與 `prologue, Rin's first memory…` 用 debug hook（`__starlanternDebug.game`）的寫法。

- [ ] **Step 1：平衡**：執行平衡指令，`[balance]` 行排序後存成 `balance-after.txt`，和 `balance-before.txt` 用 `diff` 比對，必須沒有差異。有差異就停下來回報 BLOCKED（本計畫不可以動到任何會量到的東西）。
- [ ] **Step 2：全套與 tsc**：全套全綠；tsc 在 starlantern 與 e2e spec 底下 0 個錯誤；`grep -rn "it.fails\|it.skip\|\.only(\|\.todo(\|Math.random" src/scripts/games/starlantern` 沒有新結果（`Math.random` 原本就有的不算，只看本計畫的 diff）。
- [ ] **Step 3：e2e** `in the labyrinth: wear a found piece, move a row and heal with a skill`（4352 埠）：
  1. 出發。
  2. 用 debug hook：在 `run.loot.gear` 放一件 `mintUid()` 的武器；把瑟蕾放上場，設 `tree.moonlight = 1`；把洛恩的 HP 設成 1。
  3. 按 C → 裝備 → 點冒險背包那一件 → 確認人形格的武器名稱改變 → Esc 回到迷宮。
  4. C → 隊形 → 交換兩格 → Esc。
  5. C → 技能 → 瑟蕾 → 月光 → 洛恩 → 確認隊伍列的 HP 上升。
  6. 全程沒有 console error。
  7. 回城，確認穿著的武器還在。
- [ ] **Step 4：截圖**（headless、`--mute-audio`，存到 `tmp/starlantern/t6-6f/`）：野外選單、三層的施法清單、施法後的訊息、迷宮模式的裝備頁（含重量列與拒絕訊息）、迷宮模式的編隊頁、技能頁的「迷宮中可用」標記。逐張看：沒有爆框，640×360 的畫面裡沒有被裁切。
- [ ] **Step 5：commit**：`test(starlantern): plan 6f in the labyrinth end to end`
- [ ] **Step 6（控制者的步驟）：審查**：派一個沒參與開發的代理，依 `~/.claude/skills/review-pr/SKILL.md` 審查本計畫的 diff 與截圖，對照 Review Focus 1–6、「裁定」各節，以及「任何隊伍組成都要可以用」。控制者處理它提出的問題，再請它複審受影響的範圍。

---

## 審查清單（每個任務的審查者）
1. 有沒有新的亂數抽取：搜尋 diff 裡的 `rng(`、`lootRng`、`memoryRng`、`Math.random`。
2. 有沒有改到凍結的東西：`sim.ts`、balance 檔、技能的數值欄位、`SAVE_VERSION`。
3. 迷宮施法有沒有用「城鎮版」的算法，繞過 `skillFor`／`skillCost`。
4. 裝備有沒有可能被複製或遺失：每個換裝路徑前後的 uid 集合。
5. 待命的人有沒有任何路徑碰得到（道具、施法、換裝、隊形）。
6. 介面：沒有 `!important`、沒有 `style=`、沒有 `.style.`；新字串都在 `text.zh-TW.ts`；換行格式正確。
7. 測試的期望值是獨立算出來的，不是抄實作的輸出。

## 交接

**交給 5d（裝備美術）**
- 迷宮模式的裝備頁和城鎮共用同一套格子的繪製（`render()` 的背包格與人形格），所以 5d Task 6 的圖示與外框會自動出現在迷宮裡。
- 5d Task 6 的測試要多一個情境：`phase === 'map'` 時，冒險背包的格子也有 `.slx-gear-ico`。
- 6f 與 5d Task 6 都會改 `equip.ts`，兩者依序合併。後合併的那一個重新跑 `equip.test.ts`。

**交給 6d（好感度）**
- 6d Task 4 也會改 `engine/battle.ts`。6f 在這個檔案只加了一個 `export`，合併時保留。
- 如果 6d 的「同隊探索」要計入行動，迷宮施法不算戰鬥行動，不要計入。

**交給名冊（7a、7b）**
- 如果之後有狀態會留到戰鬥之外（例如詛咒），再回頭檢討 `cleanse`、`hero-purify`、`sanctuary` 的 `field` 旗標與 Task 1 的不變式；現在的不變式要求 `field` 必須有 `heal` 或 `revive`。
- 名冊的內容不可以假設迷宮回復存在（裁定 7）。

**本計畫範圍外，記錄下來**
- `useFieldItem` 用 `Math.min(max, hp + x)`，會把祭壇留下的超量 HP 壓低。這是既有的行為，本計畫沒有改；建議之後照 `castField` 的「只升不降」修正。
- 「迷宮裡和待命的夥伴換人」：本計畫不做，理由見裁定 3。

## 需要使用者決定的事
1. **全滅時，迷宮裡穿上的裝備要保留嗎？**（裁定 2）暫定保留：穿在身上的不算冒險背包，換下來放回冒險背包的那一件才會遺失。如果使用者希望「這趟撿到的，穿上了也一樣，全滅就失去」，就要記錄每件裝備是不是這趟撿到的，全滅時從身上拿掉。這要動到 `wipe` 與一個不存檔的欄位，而 Task 3 的全滅測試要改成反過來的行為。
