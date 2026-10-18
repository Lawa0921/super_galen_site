# 星燈迷宮 計畫 6c：寫故事（記憶節奏、文風核准、全部劇情文字） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先把記憶碎片的節奏調成「每 3～5 層一片新的」，再寫完 spec §17 的全部劇情文字：序章、各幕、57 段回憶、凜的揭露、終幕、相遇、回城對話、鎮民、各階段的城鎮台詞與招呼、吸收台詞、手冊的人物與真相、記憶關鍵天賦的文字。`PLACEHOLDERS` 最後是空的。

**Architecture:**
- **先定節奏，再寫字。** 回憶在哪一層播，決定了它能說什麼、不能說什麼。所以 Task 1 先加「記憶節奏帶」，只調記憶掉落的旋鈕，把每一片的落點定下來。之後的寫作任務都照這張落點表寫。
- **能機械檢查的，都寫成測試。** 文字沒辦法像程式一樣 TDD，所以每個寫作任務的「紅燈」是閘門：
  - 把這個任務負責的類別加進 `story.test.ts` 的 `WRITTEN`，這時類別裡還有 `ph()`，測試就紅；
  - 寫完之後，下面這些都要綠：句數上限（以最壞情況下真的會播出的句數計）、單句字數、說話者與表情、沒遇見的人不開口、每段有摘要、沒有空字串、劇透詞的位置。
  - 機械檢查不了的（語氣是否像這個人、劇情事實是否出自 spec、揭露順序是否正確），由每個任務的審查者對照文風聖經與設定帳本檢查。
- **先核准文風，再大量寫。** Task 4 寫出文風聖經、設定帳本，以及序章與凜的整條記憶線的正式文字。控制者在這裡停下，把樣稿交給使用者核准。這是本計畫唯一為使用者停下的地方。
- **程式只動三處，都在寫字之前。**
  - Task 1：節奏帶與記憶旋鈕。
  - Task 2：資料層的閘門，以及兩種新的條件台詞。
  - Task 3：寫作需要的幾個掛勾：對話的階段門檻、凜選擇之後的城鎮台詞、鐘守、相遇戰後台詞的說話者、鎖住的記憶關鍵天賦不洩底、流浪商人的兩個版本。
  - 之後的任務只改文字、帳本與 `story.test.ts` 的清單。
- **寫作任務建議派最強的模型**，因為文字品質本身就是交付物。審查一律是沒參與寫作的新代理。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e。

**Spec:**
- `docs/superpowers/specs/2026-10-17-starlantern-story-world-design.md`：全文。世界、人物、背景、語氣、記憶線與 §17 的文字類別都以它為準。
- 前一份計畫：`docs/superpowers/plans/2026-10-18-starlantern-plan6b-story.md`，特別是「交給 6c 的接口」與「本計畫裁定的 spec 衝突」。
- 6b 封存：`.superpowers/sdd/carry/6b-archive/`（`progress.md`、`final-review.md`、`task-21-report.md`、`constraints.md`、`balance-baseline.md`）。
- 接手清單：`.superpowers/sdd/carry/plan6b-carry.md`。最後一節是使用者在 6b 之後的兩個新決定（逐條處理見文末）。

> 沒有以 `src/`、`tests/`、`docs/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。本計畫的 SDD 紀錄目錄是 `.superpowers/sdd/2026-10-18-starlantern-plan6c-writing/`。

## Global Constraints

**使用者的方向（原話，最高依據）**
- 語氣：「我覺得過程可以沉重晦暗，但最終我喜歡 happy ending。」過程可以沉重、晦暗，結局一定圓滿，沒有人被留在黑暗裡（spec §2 反目標）。
- 「很深度的地城探索 roguelike 遊戲，並且是一個很自由變化很大的打寶遊戲。」劇情不擋遊玩，任何順序都講得通。
- 洛恩是唯一從深處「走出來」的人。凜是刺客，她最後一片記憶顯示她被派來殺他，但她選擇留下。每個角色都有背景。記憶碎片任何人都撿得到，是露米亞（星燈光柱所在的鎮）的經濟基礎。
- 反目標：「單純收集資源，沒有故事也沒有實質意義的任務會比較讓我煩躁。」任何台詞都不可以把碎片寫成單純的收集品；每一片都連著一個人和一個結果。
- 記憶節奏：「收集記憶碎片大概是每 3 ~ 5 層一片新的」（Task 1）。
- 凜的速度：只有基礎能力必須讓她全隊最快。帶著記憶或裝備時，別人比她快是設計上允許的。不新增任何「含記憶或裝備也最快」的測試。

**分支與基準**
- `feat/starlantern-story`，base 是本計畫的 commit（6a、6b 完成於 `abbaaa71`）。
- 工作樹裡有別人沒提交的檔案（例如 `docs/superpowers/plans/2026-10-17-starlantern-plan5d-art.md`、美術檔），一律不碰、不 add。

**測試與檢查**
- TDD：有程式變更的任務，先寫失敗的測試，確認它因為正確的理由失敗，再實作。寫作任務的「紅燈」是 `WRITTEN` 閘門（見「寫作任務的共同步驟」）。
- 單檔：`rtk proxy npx vitest run src/scripts/games/starlantern/<路徑>`。
- 全套：`rtk proxy npx vitest run --testTimeout=20000`，讀輸出的「Test Files」與「Tests」兩行；rtk 的摘要可能藏住載入失敗的測試檔。不可以用 `npm run test`（watch 模式會卡住）。
- 平衡：`BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.test.ts src/scripts/games/starlantern/engine/balance.lineups.test.ts src/scripts/games/starlantern/engine/balance.deep.test.ts src/scripts/games/starlantern/engine/balance.pace.test.ts --testTimeout=300000`
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。不可以用 4321 埠。
- tsc：`npx tsc --noEmit`。repo 原本就有 43 個錯誤（astro:content、bomber、tetris、hp-click），完成的條件是 starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個錯誤。
- 本專案沒有 prettier、eslint，不要去跑。
- 瀏覽器一律 headless 加 `--mute-audio`，絕不接管使用者的桌面；測試必須靜音、無頭。

**換行**
- 改檔前用 `git ls-files --eol <檔案>` 確認；改完看 `git diff --stat`，整檔重寫代表換行壞了，要修好。CRLF 檔案不可以用 `sed -i`。新檔一律 LF。
- 本計畫會碰到的檔案：
  - LF：`data/story.zh-TW.ts`、`data/story/chains.ts`、`data/story/scenes.ts`、`data/story/story.test.ts`、`data/talents.ts`、`data/talents.test.ts`、`engine/story/*.ts`、`engine/dungeon/run.test.ts`、`ui2/story.ts`、`ui2/story.test.ts`、`ui2/scenes/event.ts`、`ui2/scenes/event.test.ts`、`ui2/scenes/statusTabs.ts`、`tests/e2e/starlantern.spec.ts`
  - CRLF：`engine/balance.test.ts`、`engine/game.test.ts`、`ui2/scenes/town.ts`、`ui2/scenes/status.test.ts`
  - 混用（照每一行原本的格式，新行跟著上下文）：`data/text.zh-TW.ts`、`ui2/scenes/battle.ts`、`ui2/scenes/battle.test.ts`、`ui2/scenes/town.test.ts`、`ui2/scenes/facility.ts`
  - 新檔（LF）：`engine/balance.pace.test.ts`、`docs/superpowers/story/starlantern-style-bible.md`、`docs/superpowers/story/starlantern-lore-ledger.md`

**git**
- 一律寫出完整路徑，不可以用 `git add -A` 或 `git add .`。
- Conventional Commits，訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`，即使自己的 session 建議別的模型名稱。
- 絕對不可以執行 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`（有沒有帶路徑都一樣）。要撤回自己的修改，就再改一次檔案。
- 不可以 push；不可以碰 `.env`、智能合約、`public/` 或 `art-factory/` 底下的檔案。

**子代理**：實作者不派任何子代理。

**美術**：不新增任何圖片、假圖示、假頭像，也不用 CSS 畫形狀。`allArtUrls()` 維持剛好 246 個 url（`render/artPaths.test.ts`）。沒有立繪的說話者只顯示名字。

**平衡（凍結）**
- `ENEMY_POWER`（含 ramp）、`DEEP_ENEMIES`、`FINALE_BOSS.power`、`PARTY_SCALE`、`GROUP_CAP`、`FIRST_DEPTH_CAP`、`BOSS_PARTY_SCALE`，以及每一個平衡帶的門檻，一律不可以動。
- 記憶的價值也不動：`CHAINS[*].gain`、`MEMORY_SCALE`、`ABSORB_*`、`SHARD_*`、`TOWN_*`、`MEMORY_KEYSTONE_VALUES`、天燈與黎明之刃的數值。
- 唯一的旋鈕是 Task 1 列出的記憶掉落旋鈕。
- `it.fails`、`it.skip`、`.only`、`.todo` 一律不可以出現在任何 commit。
- 6a Task 9 的峰值測試（`data/hero.test.ts`）是硬性護欄。

**文字**
- 劇情文字只放 `data/story.zh-TW.ts`；介面文字只放 `data/text.zh-TW.ts`。
- 每一個寫作任務結束時，`PLACEHOLDERS.size` 都比開始時小；Task 15 結束時是 0。
- 用字：繁體中文、台灣用語、全形標點。對白引號用「」，引號裡再引用用『』；省略號「……」；破折號「──」。劇情文字裡不出現英文與阿拉伯數字（介面文字照舊）。
- 名稱照用 spec 與資料：`CHARACTERS[*].name`、`NPC_NAMES`、`REGIONS[*].name`、露米亞、星燈、暮霧、傳送門廣場、月影旅館、冒險者公會、鍛造屋、道具店、碎片交易所、靜鐘會、艾斯特拉、燈喰之獸、燈喰之母、守燈人、燈鑰。
- 長度：場景句數不超過 `lineCap(id)`，以最壞情況下真的會播出的句數計（Task 2）；任何一句（含摘要、城鎮台詞、招呼、吸收台詞、手冊條目）不超過 `MAX_LINE_CHARS = 60` 個字元（Task 4 截圖驗證，太長就往下調並記錄）。
- 回憶裡過去的人物（師父、公主、團長、神主、諾艾兒的老師在失憶之前）沒有說話者 id：由 `narrator` 轉述，台詞放在「」裡（spec §11.4：回憶人物不做立繪）。
- **每一個劇情事實都要能追到 spec 的段落。** spec 沒寫的，寫作者可以發明，但每一項發明都要記進設定帳本（`docs/superpowers/story/starlantern-lore-ledger.md`）；之後的任務先讀帳本，不可以和它矛盾。改帳本已有的條目要寫明理由，並檢查所有引用它的文字。
- 記憶關鍵天賦只改文字，不改任何數值或插值（Task 13）。

**定位程式碼**：一律用內容（函式名、測試名、字串）找要改的地方，不用行號。

**測試修改規則**：某個任務會弄壞的每一個測試檔都列在該任務的 Files 裡，並寫明怎麼改。全套跑出沒列到的紅燈時，先停下來回報 NEEDS_CONTEXT，不可以自行改寫該測試的意圖。

## Review Focus
1. **條件台詞的組合。** 終幕、鎮民交還與回憶裡用 `if` 的台詞：在任何一種「誰已遇見、誰已集滿、誰已交還、凜是否已選擇」的組合下，播出的句數都不超過上限、不會是 0 句、沒遇見的人不會開口。莉茲與歐里克的重逢不論誰先誰後都只發生一次，發生在第二件事那裡。測試：Task 2（通用的組合列舉）、Task 11（重逢的兩種順序）、Task 14（終幕念出每一位夥伴）。
2. **凜的揭露在第四幕之前或之後。** 節奏調整後，凜的第 7 片大約落在本道第 19 層以後，第四幕（第 16 層）通常先播；但同一趟潛入跨過兩個門檻時，揭露會先播（佇列規則）。第四幕、終幕與城鎮台詞在兩種順序下都要講得通：提到凜的選擇的句子一律帶 `if.oath`，並配一句沒選擇時的版本。測試：Task 2（劇透詞的位置）、Task 5、Task 14。
3. **長句爆框。** 640×360 的對話框只放得下兩行左右。任何一句超過 `MAX_LINE_CHARS` 就是紅燈；Task 4 與 Task 15 的截圖確認實際畫面不爆框。
4. **被門檻擋住的回城對話不卡住輪替。** 某個人的下一段對話還沒到它的階段時，其他人照常輪到；門檻一過，它就排回來；不會跳號。測試：Task 3。
5. **鎖住的東西不洩底。** 記憶關鍵天賦還沒覺醒時，狀態頁顯示「？？？」，而不是「不再鳴響的鐘」「先把人帶出去」這種名字；鐘守的台詞只在凜選擇之後才進城鎮。測試：Task 3。

---

## File Structure
- `engine/story/expect.ts`：抽出每一層的掉落步驟 `walkFloor`；新增 `memoryPace`（Task 1）。
- `engine/balance.pace.test.ts`（新）：第 20 項平衡帶「記憶節奏」（Task 1）。
- `data/story/chains.ts`、`engine/story/memories.ts`：記憶掉落旋鈕（Task 1）。
- `data/story/scenes.ts`：`CHAT_GATE`（Task 2 宣告，Task 3 讓 `nextChat` 讀它）。
- `data/story.zh-TW.ts`：全部劇情文字；`linesWhen`、`STORY_MOODS`、`MAX_LINE_CHARS`、`MEMORY_GUESTS`；新的鍵 `rinOath`、`bellkeeper`、`merchant`。
- `data/story/story.test.ts`：全部文字閘門（`storyTexts`、`WRITTEN`、`SPOILERS`）。
- `engine/story/events.ts`：`nextChat` 讀 `CHAT_GATE`（Task 3）。
- `ui2/story.ts`：`linesOf` 改呼叫 `linesWhen`（Task 2）。
- `ui2/scenes/town.ts`、`ui2/scenes/battle.ts`、`ui2/scenes/statusTabs.ts`、`ui2/scenes/event.ts`：Task 3 的掛勾。
- `data/talents.ts`：記憶關鍵天賦的名稱與說明（Task 13）。
- `data/text.zh-TW.ts`：`T.battle.saidBy`、`T.ui2.talent` 的鎖住文字；刪掉流浪商人的 `desc`（Task 3）。
- `docs/superpowers/story/starlantern-style-bible.md`（新）：文風聖經。
- `docs/superpowers/story/starlantern-lore-ledger.md`（新）：設定帳本。
- `tests/e2e/starlantern.spec.ts`：招呼的候選池（Task 3）；用結構斷言取代文案斷言（Task 15）。

---

### Task 1: 記憶節奏帶與記憶旋鈕（限時 6 輪）

**Files:**
- Create：`engine/balance.pace.test.ts`
- Modify：
  - `engine/story/expect.ts`：抽出 `walkFloor`，新增 `memoryPace`、`PACE_DEPTH`、`paceHome`。
  - 旋鈕所在的檔案：`data/story/chains.ts`（各串的 minDepth、`MEMORY_PITY`、`ELITE_PIECE_CHANCE`、`GLIMMER_CHANCE`）、`engine/story/memories.ts`（`MAX_FORCED`）。
  - `.superpowers/sdd/2026-10-18-starlantern-plan6c-writing/pace-baseline.md`（新）：每一輪的值與結果、最後的落點表。
- Test（會壞的檔案與改法）：
  - `data/story/story.test.ts`：`the story chains open in the spec's order of depth` 與 `a companion's last two pieces wait for depth 6` 寫死了 spec 提案的深度陣列。改成只斷言固定點與不變式（見下方「固定點」），不再寫死陣列。
  - `engine/story/expect.test.ts`：`the hero's expected pieces follow the drop schedule` 是手算的軌跡。照最後的旋鈕值**重新手算**，每一行用註解寫理由（門檻、保底、優先序），不可以抄程式的輸出；表與模型不符時，先查哪一邊錯。`the expectation grows with depth…`、`a depth's own drops wait…` 斷言的是行為，應該維持綠。
  - `engine/story/memories.test.ts`、`engine/game.test.ts`、`engine/dungeon/run.test.ts`、`engine/story/handbook.test.ts`：寫死舊深度（例如「凜第 2 片在第 3 層」）的地方，改成讀 `CHAINS[id].pieces[i].minDepth`；斷言的行為不變。
- Test（必須維持綠）：三個 balance 檔的每一項、`balance.test.ts` 的 `the memories variants measure something`（記憶期望在第 10 層，主角至少 `ABYSS_UNLOCK[0]` 片）、`data/hero.test.ts`。

**Interfaces:**
- Consumes：`forcedGlimmers`、`pieceDrops`、`pityAfterFloor`、`applyPieces`（`engine/story/memories.ts`）；`isBossDepth`、`newRun`；`MEETINGS`（`data/meetings.ts`）。
- Produces（`engine/story/expect.ts`）：
  - `walkFloor(s: GameState, pity: Pity, region: RegionId, depth: number, run: Run): { state: GameState; pity: Pity; shards: ShardGrade[] }`：`compute` 裡每一層的步驟原樣搬出來（強制微光、每 `round(1 / GLIMMER_CHANCE)` 層一處自然微光、每 `EXPECT_ELITE_EVERY` 層一隻精英、頭目層的頭目、`pityAfterFloor`；rng 照舊是 `mulberry32(mix(mix(EXPECT_SEED, 地區索引), depth))`）。`compute` 改成呼叫它，結果逐位元不變。
  - `PACE_DEPTH = 40`
  - `paceHome(id: CharacterId): RegionId`：主角與凜是 `mainline`；夥伴是她在 `MEETINGS` 的地區（瑟蕾、波比 `mainline`，千鶴 `frost`，莎菲拉 `blaze`，希爾薇 `mire`，諾艾兒 `storm`，莉茲 `shade`，絲嘉蕾 `iron`）。
  - `memoryPace(id: CharacterId): number[]`：在 `paceHome(id)` 從第 1 層走到 `PACE_DEPTH`，回傳第 k 片掉落的那一層（索引 k − 1）；沒集滿時陣列比 `chainLength(id)` 短。
    - 隊伍：主角與凜從第 1 層就算遇見；所有 `paceHome` 等於這個地區的夥伴，從她的相遇深度那一層開始才算遇見（那一層自己的掉落就算數）。
    - 每一層呼叫 `walkFloor`；吸收不模擬。純函式，結果可以快取，快取鍵和 `expectedMemories` 一樣要含旋鈕的當前值。
- Produces（`engine/balance.pace.test.ts`，第 20 項，門檻是本計畫訂的；`BALANCE_REPORT` 時印出每一位的軌跡）：
  - `20a every chain completes on its home road`：10 位都是 `memoryPace(id).length === chainLength(id)`。
  - `20b the first piece comes soon`：`memoryPace(id)[0] − start ≤ 5`，`start` 是 1（主角、凜）或她的相遇深度。
  - `20c a new piece every three to five floors`：相鄰兩片的間隔 `g`，平均值在 3 到 5 之間（含），每一個間隔在 2 到 6 之間（含）。（使用者原話是「大概」，所以平均值照 3～5，單一間隔放寬一層。）
  - 註：平均值 = (最後一片的層 − 第一片的層) / (片數 − 1)。主角第 10 片固定在第 30 層，所以主角的第 1 片必須在第 3 層以前；凜第 1 片固定在第 1 層，所以第 7 片落在第 19 到 31 層之間。這是算術，不是另外的規則。

**固定點**（spec 的硬性要求；Task 1 不可以動，`story.test.ts` 要斷言）
- 主角 10 片；第 9、10 片 `bossOnly`，minDepth 等於 `HERO_TOPUP` 的 25、30（`HERO_TOPUP` 不動）。
- 凜 7 片；第 1 片 minDepth 1（凜還沒有第 1 片時本道每層都有她的微光，這條規則不動）；第 7 片 minDepth 大於 `ACT_DEPTHS.act3`。
- 夥伴各 5 片；第 4、5 片 minDepth ≥ 6（spec §7.3）。
- 每一串的 minDepth 不遞減；只在 `CHAINS` 已列的地區掉落。
- 掉落優先序（spec §7.2：故事串先給、保底久的先給、平手時凜先）不是旋鈕。

**旋鈕、順序與範圍**（紅了才調，依序）
1. 各串不在固定點上的 minDepth（主角第 1–8 片、凜第 2–7 片、夥伴各片）。一整組深度表算一個值。
2. `MEMORY_PITY`：整數 2 到 5。
3. `ELITE_PIECE_CHANCE`：0.15 到 0.5。
4. `GLIMMER_CHANCE`：0.15 到 0.35。
5. `MAX_FORCED`：1 或 2。
- 不是旋鈕：上面「平衡（凍結）」的全部；`EXPECT_ELITE_EVERY`、`EXPECT_SEED` 與期望模型本身（它描述真的掉落，不能為了過帶而改）；`ACT_DEPTHS`、`FINALE_DEPTH`、`MEETINGS`。

**一輪**：設一組旋鈕值，然後跑第 20 項、`expect.test.ts`、`story.test.ts` 與三個 balance 檔，把數字記進 `pace-baseline.md`。

**時間上限與停止規則**：最多 6 輪。
- 收斂：第 20 項與每一個既有的帶都綠，commit。
- 收斂不了，或每一組能讓第 20 項通過的值都會讓別的帶變紅：把旋鈕改回本任務開始時的值（再改一次檔案），不 commit 任何旋鈕變更，回報 BLOCKED，附上每一輪的表。控制者停下整個計畫，問使用者怎麼做（之後的寫作都依賴落點表）。

- [ ] **Step 1: 抽出 `walkFloor`，確認是零變更**：執行上面的平衡指令，`[balance]` 報告排序後與改動前逐位元相同；`expect.test.ts` 全綠。
- [ ] **Step 2: 寫第 20 項的測試，執行，確認失敗**：寫計畫時用 `expectedMemories` 量到的現況（標準五人，抵達深度）是主角 1@6 2@9 3@11 4@13 5@16 6@19 7@22 8@25 9@26 10@31、凜 1@2 2@4 3@5 4@7 5@10 6@13 7@16，夥伴大約在第 9–11 層就集滿 5 片。`memoryPace` 記的是掉落的那一層、只走她的主場，所以數字會不同，但預期凜與夥伴的 `20c` 紅（間隔太短）。記下每一位的軌跡。
- [ ] **Step 3: 依順序 sweep**，每一輪記進 `pace-baseline.md`。
- [ ] **Step 4: 依 Files 改寫寫死舊深度的測試**，`expect.test.ts` 的手算軌跡照最後的值重算。
- [ ] **Step 5: 執行全套與平衡指令，確認全部通過**
- [ ] **Step 6: 在 `pace-baseline.md` 寫出落點表**：每一位、每一片，`memoryPace` 的層數，以及那一層對應的階段（`ACT_DEPTHS`：1 層是序章，2–3 層第一幕，4–9 層第二幕，10–15 層第三幕，16 層以後第四幕；夥伴標「地區・深度」）。Task 4 把它抄進設定帳本。
- [ ] **Step 7: commit**：`balance(starlantern): a new memory every three to five floors`，訊息寫出每一個旋鈕的最後值與第 20 項的軌跡。

### Task 2: 劇本的閘門（資料層）

**Files:**
- Modify：
  - `data/story.zh-TW.ts`：`ScriptLine.if` 新增兩種條件；`linesWhen`；`STORY_MOODS`、`MAX_LINE_CHARS`、`MEMORY_GUESTS`。
  - `data/story/scenes.ts`：宣告 `CHAT_GATE`（初值 `{}`；`position` 要讀它，`nextChat` 在 Task 3 才讀它）。
  - `ui2/story.ts`：`linesOf` 改成組出條件後呼叫 `linesWhen`。
  - `data/story/story.test.ts`：下面全部的閘門。
- Test：`data/story/story.test.ts`、`ui2/story.test.ts`

**Interfaces:**
- Produces（`data/story.zh-TW.ts`）：
  - `ScriptLine.if` 變成 `{ met?: CharacterId; notMet?: CharacterId; returned?: TownFragmentId; full?: CharacterId; oath?: boolean }`。`full`：那個人的記憶已經集滿；`oath`：凜已經做出選擇（`true`）或還沒（`false`）。
  - `interface LineWhen { met: CharacterId[]; full: CharacterId[]; returned: TownFragmentId[]; oath: boolean }`
  - `linesWhen(lines: ScriptLine[], w: LineWhen): ScriptLine[]`：留下每一個條件都成立的句子（沒有條件的一律留下）。
  - `STORY_MOODS: (Mood | ExtraMood)[] = ['normal', 'smile', 'sad', 'down']`
  - `MAX_LINE_CHARS = 60`
  - `MEMORY_GUESTS: Partial<Record<SceneId, Speaker[]>> = { 'mem:liz:5': ['orik'], 'mem:noel:5': ['merchant'] }`：回憶裡除了本人、主角與旁白之外，可以開口的人。寫作任務要加人時，在帳本記一條理由。
- Produces（`data/story/scenes.ts`）：`CHAT_GATE: Partial<Record<SceneId, { stage?: Stage; oath?: true }>> = {}`。寫作任務依內容加門檻，並在帳本記理由。
- `ui2/story.ts` 的 `linesOf(id, s)`：`met` 是 `s.party.recruited`；`full` 是 `memoriesOf(roster[c]) >= chainLength(c)` 的人；`returned` 是 `s.story.returned`；`oath` 是 `!!s.party.roster.rin?.oath`。
- `story.test.ts` 的輔助（只在測試檔裡）：
  - `storyTexts(): { key: string; text: string }[]`：遞迴走過 `STORY`，收集每一個字串葉節點，鍵是用「.」連起來的路徑，例如 `scenes.mem:rin:3.lines.2.text`、`scenes.mem:rin:3.summary`、`greet.inn.act2.1`、`people.hero.0`、`truths.act4`。略過 `who`、`mood`、`if` 底下的值與每段場景的 `title`（場景標題是介面標籤）。
  - `WRITTEN: string[]`：已經寫完的鍵前綴，初值是空陣列；每個寫作任務把自己的前綴加進來。
  - `position(key: string): Stage`：這段文字最早可能在哪個階段被看見。規則：
    - `stageOf(d)`：d ≥ 16 是 act4，≥ 10 是 act3，≥ 4 是 act2，≥ 2 是 act1，其他是 prologue（照 `ACT_DEPTHS`）。
    - 各幕與序章是自己的階段；`act1-after` 是 act1；`finale`、`endingTitle` 是 after；`finaleBossName` 是 act4。
    - `townLines`、`greet`、`rinLines`、`truths` 的鍵是它的階段；`act1Card` 是 act1。
    - 主角與凜的回憶：`stageOf(那一片的 minDepth)`；`rin-reveal`、`rinOath`、`bellkeeper.oath`：`stageOf(凜第 7 片的 minDepth)`；`bellkeeper.after` 是 after。
    - 夥伴的回憶、對話、相遇、`people.<夥伴>`：她相遇的階段（本道相遇：`stageOf(相遇深度)`；其他地區：prologue），對話再取它 `CHAT_GATE` 的階段中較晚的那個。
    - 主角與凜的 `people`、對話：prologue，對話再取 `CHAT_GATE`。
    - `town.<id>`、`scenes.town:<id>`：該碎片地區是本道時 `stageOf(minDepth)`，否則 prologue。`absorb`、`merchant`、`survived` 是 prologue。
  - `SPOILERS: { terms: string[]; allowed: (key: string) => boolean; why: string }[]`：初值兩條（spec §8.4 的揭露順序）：
    - `守燈人`：`position(key)` 在 act4 以後，或鍵屬於 `scenes.mem:hero:9`、`scenes.mem:hero:10`。
    - `靜鐘會`：`position(key)` 在 act3 以後。
    - Task 4 依設定帳本的揭露表加入凜的、以及其他由回憶擁有的秘密；之後的任務只可以加，不可以放寬，放寬要在帳本寫裁定。
- 介面的工作順序：本任務的閘門在 `WRITTEN` 為空時，對暫定文案也要全部成立（暫定文案本來就是一句一段），所以本任務結束時全套是綠的。

- [ ] **Step 1: 寫失敗的測試**
  - `ui2/story.test.ts`：`full and oath conditions pick the right lines`：一段含 `if.full: 'liz'`、`if.oath: true`、`if.oath: false` 的假場景，在四種狀態下留下的句子正確。
  - `story.test.ts`（每一項都對 `SCENE_IDS` 或 `storyTexts()` 全體）：
    - `no scene plays more lines than its cap, in any party`：列舉 8 位夥伴的每一個「已遇見」子集（主角、凜一律遇見）× `full` 是空的或等於 met × `returned` 是空的或全部 × `oath` 真假，`linesWhen` 播出的句數介於 1 與 `lineCap(id)`。
    - `no line is longer than MAX_LINE_CHARS`：每一個 `storyTexts()` 的字串長度（`[...text].length`）≤ `MAX_LINE_CHARS`，而且不是空字串、不含 `TODO`、`TBD`、換行。
    - `speakers and moods are valid`：`who` 是 `CharacterId`、`NpcId` 或 `narrator`；`mood` 沒有或在 `STORY_MOODS` 裡；`narrator` 與 NPC 的句子不帶 `mood`。
    - `nobody unmet speaks`：每一句的說話者若是夥伴（不是主角、凜），而且不是這段場景的本人（`mem:c:*`、`chat:c:*`、`meet.c`），那一句必須帶 `if.met` 或 `if.full` 指向她。
    - `memories are told by their owner`：`mem:c:k` 的說話者只能是 c、主角、旁白，或 `MEMORY_GUESTS[id]` 裡的人；`meet.c` 的說話者只能是 c、主角、凜、旁白。
    - `every scene has a summary`：每段的 `summary` 不是空的。
    - `meetings say one to four lines before and after`：`STORY.meet[c].before`、`.after` 各 1 到 4 句（spec §8.2）。這一項在 Task 8–10 寫完相遇之前會因為 `after` 是空的而紅：本任務先斷言 `before` 1–4、`after` 0–4，Task 10 把 `after` 的下限改成 1。
    - `people and truths are one to three sentences`：`STORY.people[*][*]` 與 `STORY.truths[*]` 以「。！？」結尾的句子數在 1 到 3 之間。
    - `written categories hold no placeholder`：鍵以 `WRITTEN` 任一前綴開頭的字串都不在 `PLACEHOLDERS` 裡（`WRITTEN` 為空時自然成立）。
    - `spoilers stay behind their owner`：對 `SPOILERS` 的每一條，含任一 term 的鍵都通過 `allowed`。
    - 測試要能抓到錯：在 commit 之前，暫時把一句改成 61 字、把一句的說話者改成沒遇見的夥伴、把「守燈人」放進 `townLines.act1`，確認對應的測試紅了，再改回來。
- [ ] **Step 2: 執行，確認失敗**（`linesWhen`、新常數還不存在）
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`test(starlantern): the gates every line of the script must pass`

### Task 3: 寫作需要的掛勾

**Files:**
- Modify：
  - `engine/story/events.ts`：`nextChat` 讀 `CHAT_GATE`（Task 2 宣告）。
  - `data/story.zh-TW.ts`：`STORY.rinOath`、`STORY.bellkeeper`、`STORY.merchant`，暫定文案一律經過 `ph()`。
  - `ui2/scenes/town.ts`：凜選擇之後的台詞池、鐘守的台詞池。
  - `ui2/scenes/battle.ts`、`data/text.zh-TW.ts`：相遇戰後台詞帶說話者（`T.battle.saidBy`）。
  - `ui2/scenes/statusTabs.ts`、`data/text.zh-TW.ts`：鎖住的記憶關鍵天賦不顯示名稱；凜鎖住時的說明改用 `memoryLocked`，刪掉 `oathLocked`。
  - `ui2/scenes/event.ts`、`data/text.zh-TW.ts`：流浪商人的招呼改讀 `STORY.merchant`，刪掉 `T` 裡的 `desc`。
  - `data/text.zh-TW.ts`：`absorbFail.invalid` 改寫成明確的說法（6b Task 21 延後的介面文字；不另外測試）。
  - `tests/e2e/starlantern.spec.ts`：檢查城鎮招呼的候選池加入 `STORY.rinOath` 與 `STORY.bellkeeper` 的兩組。
- Test：`engine/story/events.test.ts`、`ui2/scenes/town.test.ts`、`ui2/scenes/battle.test.ts`、`ui2/scenes/status.test.ts`、`ui2/scenes/event.test.ts`、`data/story/story.test.ts`

**Interfaces:**
- `chatOpen(s: GameState, id: SceneId): boolean`（`engine/story/events.ts`）：沒有門檻時為真；`stage` 時 `STAGES.indexOf(storyStage(s)) >= STAGES.indexOf(stage)`；`oath` 時凜已選擇。`nextChat` 裡，一個人的「下一段」若 `chatOpen` 為假，這個人這次不是候選，她後面的對話也一起等（不跳號）。
- `STORY.rinOath: string[]`：凜選擇之後的城鎮台詞（說話者凜），取代 `rinLines[stage]`。
- `STORY.bellkeeper: { oath: string[]; after: string[] }`：鐘守在城鎮的台詞（說話者 `NPC_NAMES.bellkeeper`）。凜已選擇而且終幕還沒過時，`oath` 加進城鎮的台詞池；終幕之後改成 `after`（spec §5.2、§11.4；鐘守是在凜選擇之後才被派來的）。
- `STORY.merchant: { lost: string; found: string }`：流浪商人事件的招呼。諾艾兒集滿記憶之前是 `lost`，之後是 `found`（spec §11.4「失憶時與恢復後兩版」）。
- `T.battle.saidBy(name: string, text: string): string` → `` `${name}：${text}` ``。戰果視窗的相遇戰後台詞：說話者是 `narrator` 時只顯示 text，否則顯示 `saidBy(speakerOf(...).name, text)`。
- 記憶關鍵天賦沒覺醒時，名稱位置顯示 `T.ui2.handbook.unknown`（「？？？」），說明一律是 `memoryLocked(chainLength(id))`（凜也一樣：她的天賦在第 7 片之後的那次回城覺醒，說「找回全部記憶後」已經夠準，不提前說出「選擇」）。

- [ ] **Step 1: 寫失敗的測試**
  - `events.test.ts`：
    - `a gated chat waits and the others still talk`：凜的 `chat:rin:2` 門檻是 act3，現在是 act1：`nextChat` 給別人；凜後面的對話也不出現；到了 act3，`chat:rin:2` 回到候選。
    - `an oath-gated chat waits for her choice`
    - `no gate, no change`：`CHAT_GATE` 為空時，`nextChat` 的結果和 6b 相同（拿 6b 既有的測試當基準）。
  - `town.test.ts`：
    - `after her choice Rin speaks her oath lines`：固定 rng 讓挑到凜，句子來自 `STORY.rinOath`，不是 `rinLines`。
    - `the bellkeeper speaks only after her choice, and differently after the finale`：凜沒選擇時台詞池沒有鐘守；選擇之後有 `bellkeeper.oath`；`finaleCleared` 之後是 `bellkeeper.after`。
  - `battle.test.ts`（ui2）：`a meeting's after-lines show who speaks`：她的那句前面有她的名字，旁白那句沒有。
  - `status.test.ts`：`a sleeping memory keystone keeps its name to itself`：沒覺醒時畫面上沒有 `KEYSTONES[...].name`，有「？？？」；覺醒後顯示名稱與說明。凜也一樣。
  - `event.test.ts`：`the merchant remembers once Noel does`
  - `story.test.ts`：`storyTexts()` 涵蓋三個新的鍵；`position` 給 `rinOath`、`bellkeeper` 的值照 Task 2 的規則。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**（刪 `T` 的鍵之前，用 grep 找出所有讀取的地方，全部改完才刪）
- [ ] **Step 4: 執行全套與 e2e，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): hooks the script needs (chat gates, the oath and the bellkeeper, sleeping keystones)`

---

## 寫作任務的共同規則（Task 4 到 Task 14）

**每個寫作任務都先讀**
1. 該任務列出的 spec 段落（全文已讀過也要重讀那幾段）。
2. `docs/superpowers/story/starlantern-style-bible.md`（Task 4 之後）。
3. `docs/superpowers/story/starlantern-lore-ledger.md`（Task 4 之後）：發明登記、揭露表、落點表。
4. `data/story.zh-TW.ts` 裡已經寫好的類別：和自己的段落相連的地方（例如寫莉茲之前，讀歐里克已寫的部分）。

**共同步驟**
- [ ] **Step 1：紅燈**：把本任務的前綴加進 `story.test.ts` 的 `WRITTEN`（再加上任務自己的測試），執行 `rtk proxy npx vitest run src/scripts/games/starlantern/data/story`，確認因為「還有 placeholder」而失敗。
- [ ] **Step 2：寫**：在 `data/story.zh-TW.ts` 把本任務的每一個 `ph(...)` 換成真正的文字。spec 逐字寫出的句子照抄（例如凜的「我被派來殺你。我現在選擇不要。」、主角的「明天也一起回來吧。」、公主的「你不是盾，你是我的朋友。活下去。」、團長的「你要繼續跳。」、波比的「祖先造錯的東西，我來修好。」、瑪莎的「現在想記住的事變多了」、凜的「這個名字是我自己決定要用的。」、瑟蕾的「我想看見」）。暫定文案的產生函式（`buildScenes` 的迴圈、`stageEach`、`greetOf` 等）在最後一個使用它的類別寫完時刪掉。
- [ ] **Step 3：帳本**：每一項 spec 沒寫的發明（名字、地點、物件、事件、關係、說話習慣的例外）記進設定帳本的「發明登記」：編號、內容、第一次出現的鍵、任務。秘密記進「揭露表」，需要的話把 term 加進 `SPOILERS`（只能加，不能放寬）。用到 `MEMORY_GUESTS`、`CHAT_GATE` 時也記一條。
- [ ] **Step 4：綠燈**：執行 `data/story` 的測試，再執行全套，確認全部通過。
- [ ] **Step 5：自我檢查**，寫進回報：每一段對照語氣表與揭露表的結果；每一個劇情事實的出處（spec §，或帳本編號）；`PLACEHOLDERS.size` 前後的數字。
- [ ] **Step 6：commit**（訊息照各任務）。

**寫作任務的審查清單**（給每個寫作任務的審查者；審查者沒參與寫作）
1. 閘門全綠，`PLACEHOLDERS.size` 比任務開始時小，而且本任務的前綴已經清空。
2. **出處**：每一個劇情事實都能追到 spec 的段落或帳本的編號；和 spec、帳本矛盾的就是退回。
3. **語氣**：每一句對照文風聖經的語氣表：用詞、口癖、對洛恩的稱呼、句子長短。不像本人的句子逐一列出。
4. **揭露順序**：對照揭露表與落點表，沒有任何一句說出「之後才播的回憶」才揭露的事；條件台詞在每一種組合下都講得通。
5. **語氣曲線**：過程沉重晦暗，結局圓滿；沒有人被留在黑暗裡；沒有任何一句把碎片寫成單純的收集品。
6. **長度與節奏**：沒有為了湊句數的空話；每段摘要讓跳過的人知道發生了什麼，而且不比場景本身說得多。

---

### Task 4: 文風聖經、設定帳本與樣稿（序章、凜的記憶線）

**Files:**
- Create：`docs/superpowers/story/starlantern-style-bible.md`、`docs/superpowers/story/starlantern-lore-ledger.md`
- Modify：`data/story.zh-TW.ts`（`scenes.prologue`、`scenes.mem:rin:1` 到 `mem:rin:7`）、`data/story/story.test.ts`（`WRITTEN`、`SPOILERS`）
- Read：spec 全文；`.superpowers/sdd/2026-10-18-starlantern-plan6c-writing/pace-baseline.md` 的落點表。

**Interfaces:**
- Produces（文風聖經；之後每個寫作任務與審查者都讀它）：
  1. **敘述者的聲音**：人稱、時態、句子長短、描寫的密度；回憶場景與一般場景的差別；旁白轉述過去人物的格式。
  2. **語氣曲線**：序章到終幕之後，六個階段各自的明暗（使用者原話放在最前面）。
  3. **語氣表**：主角、凜、8 位夥伴、安娜、歐里克、瑪莎、葛倫、多蘭、流浪商人（失憶時與恢復後）、鐘守，每人一節：個性與語氣、說話習慣與口癖、自稱、**怎麼稱呼洛恩**（以及稱呼會不會隨劇情改變，例如凜在揭露前後）、她絕對不會說的話、兩句示範台詞。
  4. **用字規範**：Global Constraints 的「文字」一節，加上專有名詞的固定寫法。
- Produces（設定帳本）：
  - **出處對照**：spec 已定的事實，依人物與地點列出 spec 段落。
  - **落點表**：從 `pace-baseline.md` 抄來，每一片回憶的層數與階段。
  - **揭露表**：每一個秘密一列：內容、擁有它的場景（第一次揭露的地方）、可以提到它的鍵、在那之前只能暗示到什麼程度。至少包含：洛恩是從深處走出來的人（序章）；燈芯在深處、迷宮是燈變質長出來的（第二幕）；靜鐘會存在、洛恩被殺過很多次（第三幕）；艾斯特拉的歷史與守燈人的傳說（第四幕）；洛恩就是守燈人、他記得過去的輪迴（主角第 9 片）；劍就是燈鑰（主角第 10 片）；「凜」是靜鐘會給刺客的代號、銅鐘的意義、她的任務、那個人就是洛恩（凜第 6、7 片）；靜鐘會殺的一直是守燈人、每殺一次燈就晚一次點亮（終幕，spec §3.6）；莉茲是歐里克的女兒（莉茲第 5 片或歐里克的交還，看誰後到）；流浪商人是諾艾兒的老師（諾艾兒第 5 片）；葛倫在上一輪見過洛恩（葛倫的交還）；安娜曾經是冒險者（安娜的交還）。
  - **發明登記**：初值是本任務自己的發明。
- `SPOILERS` 新增凜的秘密（term 由本任務依揭露表決定，例如「代號」），`allowed` 只放行凜第 6、7 片、`rin-reveal`、`rinOath`、`bellkeeper`、`finale`、after 階段的文字，以及帶 `CHAT_GATE` 的 `oath` 門檻的凜的對話。

- [ ] **Step 1：讀**：spec 全文、`pace-baseline.md` 的落點表、`data/story.zh-TW.ts`。
- [ ] **Step 2：寫文風聖經與設定帳本**（上面的內容）。
- [ ] **Step 3：紅燈**：`WRITTEN` 加入 `scenes.prologue`、`scenes.mem:rin:`，執行，確認失敗。
- [ ] **Step 4：寫序章**（spec §9.2、§3.3、§4、§5、§8.4 的序章列；最多 12 句）：黎明的傳送門廣場、葛倫發現兩個倒地的人、安娜的失憶登記、替洛恩取名（他只反覆念著「洛……」）、凜看她刀柄上的字、交給他們回復藥與歸還之燈、洛恩是從深處走出來的。摘要一句。
- [ ] **Step 5：寫凜的 7 段回憶**（spec §5、§5.1、§3.6）：第 1–2 片溫暖但有一點怪（鐘樓下的童年、丟針的「遊戲」、冬天很燙的湯）；第 3–5 片冷、讓人起疑（不能眨眼的訓練、被劃掉的名單、師父說「從深處走出來的，不是人」、被派去守一座出口）；第 6–7 片沉重（鐘自己響了、她的任務、追進迷宮、在出口前和那個人一起被暮霧吞沒、那個人就是洛恩）。每一片播放時洛恩都在旁邊。第 1–6 片最多 4 句，第 7 片最多 12 句。每段一句摘要。
- [ ] **Step 6：帳本與 `SPOILERS`**（共同步驟 Step 3）。
- [ ] **Step 7：綠燈**（共同步驟 Step 4）。
- [ ] **Step 8：截圖**：用 headless、`--mute-audio` 的 Playwright（E2E_PORT 4352，腳本放 scratchpad，不 commit），用 6b e2e 的做法（`setup(page, seed, { story: 'all' })`、debug hook 設定狀態、手冊重看）播到序章最長的一句與凜第 7 片最長的一句，各截一張，存到 `tmp/starlantern/6c-style/`。兩行放得下就保留 `MAX_LINE_CHARS`；放不下就把它調到放得下的字數，記進帳本，並修好超過的句子。
- [ ] **Step 9：commit**：`docs(starlantern): style bible, lore ledger and the sample — the prologue and Rin's memories`
- [ ] **Step 10（控制者的步驟，不是實作者的）⛔ 使用者核准文風**
  - 審查通過之後，控制者停下，把下面這些交給使用者：文風聖經的語氣曲線與每人的語氣表（摘要）、序章全文、凜的 7 段回憶全文、兩張截圖。問使用者：語氣、角色的聲音、對洛恩的稱呼、明暗的程度，是不是他要的。
  - 使用者要求修改：控制者把意見原文交給同一位實作者（resume）修改文風聖經與樣稿，重新審查，再給使用者看，直到核准。
  - 核准之後，把使用者的回覆原文記進 SDD 紀錄（`progress.md`），之後照 SDD 連續執行，不再為使用者停下（失敗的停止規則照舊）。
  - **核准之前，不可以派 Task 5 以後的任何任務。**

### Task 5: 各幕的節點與真相頁

**Files:** Modify `data/story.zh-TW.ts`（`scenes.act1-after`、`scenes.act2`、`scenes.act3`、`scenes.act4`、`act1Card`、`truths`）、`data/story/story.test.ts`
**Read：** spec §3.1、§3.3、§3.4、§3.6、§4、§8.4、§8.5、§7.6（真相頁是主角筆記的口吻）、§17。

**Interfaces:**
- `WRITTEN` 加入 `scenes.act1-after`、`scenes.act2`、`scenes.act3`、`scenes.act4`、`act1Card`、`truths`。
- `act1Card.title` 照 spec §8.5 逐字：「第一幕　星燈重新亮起」（`ui2/scenes/clear.test.ts` 斷言它）；`body` 寫霧散去、鎮上第一次看見晨光。
- `act1-after` 最多 3 句：三天後暮霧又回來了，星燈的光比以前更暗。
- 第二幕：燈芯在深處；迷宮是燈變質之後長出來的；凜的記憶開始不對勁（只能從旁觀察，不可以說出她第 3 片以後才有的內容，除非帶條件）。
- 第三幕：靜鐘會存在；洛恩被殺過很多次。不可以把靜鐘會和凜連起來（那是凜第 6、7 片的事）。
- 第四幕：艾斯特拉的歷史、守燈人的傳說與輪迴、靜鐘會的教義建立在誤解上。洛恩就是守燈人在這裡只能是疑問，確認留給主角第 9 片；靜鐘會「每殺一次燈就晚一次點亮」的完整後果留給終幕（spec §3.6）。凜的揭露可能在第四幕之前或之後（Review Focus 2）：提到她的選擇的句子一律帶 `if.oath: true`，並配一句 `if.oath: false` 的版本。
- `truths`：六個階段各 1–3 句，洛恩筆記的口吻，只寫那個階段玩家已經知道的事。

- [ ] **共同步驟 Step 1–6**；本任務的測試另加：`act 4 reads right before and after Rin's choice`：`act4` 裡說話者是凜的句子都帶 `if.oath`，而且 `true`、`false` 兩種都有（第四幕是唯一可能在揭露前或後播放的幕）。
- [ ] **commit**：`story(starlantern): the acts and the truths`

### Task 6: 洛恩（10 段回憶、4 段回城對話、人物頁）

**Files:** Modify `data/story.zh-TW.ts`（`scenes.mem:hero:`、`scenes.chat:hero:`、`people.hero`）、`data/story/scenes.ts`（`CHAT_GATE`，若需要）、`data/story/story.test.ts`
**Read：** spec §4（他特別的地方、真相、萬能的理由）、§3.4、§3.6、§4.6（燈鑰、天燈）、§7.3、§8.4 的終幕段落、帳本的落點表。

**Interfaces:**
- `WRITTEN` 加入 `scenes.mem:hero:`、`scenes.chat:hero:`、`people.hero`。
- 第 1–8 片最多 4 句：過去每一輪留在身體裡的東西（劍技、守護、星術、祈光、枷鎖都學得會的原因）、片段的死亡與醒來、從深處走出來的路。依落點表，每一片只說那個深度可以說的事。
- 第 9 片（本道第 25 層頭目，最多 12 句）：他就是守燈人；他記得點燈、被吐回地面、被鐘的刺客殺死的輪迴。
- 第 10 片（本道第 30 層頭目，在終幕前播放，最多 12 句）：劍就是燈鑰；第一輪他為什麼自願。接到終幕的開頭（第 30 層的頭目已經打倒）。
- 回城對話 4 段、每段最多 3 句：他和凜或鎮上的人。依內容設 `CHAT_GATE`（例如最後一段在 act4 以後）。
- `people.hero` 3 段（遇見時、5 片、10 片），主角筆記的口吻。

- [ ] **共同步驟 Step 1–6**
- [ ] **commit**：`story(starlantern): Lorne's memories, words and page`

### Task 7: 凜（揭露與選擇、回城對話、伏筆、人物頁）

**Files:** Modify `data/story.zh-TW.ts`（`scenes.rin-reveal`、`scenes.chat:rin:`、`people.rin`、`rinLines`、`rinOath`）、`data/story/scenes.ts`（`CHAT_GATE`）、`data/story/story.test.ts`
**Read：** spec §5、§5.1、§5.2、§5.3、§3.6、§8.2（「……沒什麼。」）、文風聖經的凜、已寫好的凜的 7 段回憶。

**Interfaces:**
- `WRITTEN` 加入 `scenes.rin-reveal`、`scenes.chat:rin:`、`people.rin`、`rinLines`、`rinOath`。
- `rin-reveal`（最多 12 句，全遊戲最暗的一場）：月影旅館，洛恩睡著，凜站在床邊、短刃出鞘；刀尖放在他喉嚨上，數他的呼吸，回想一起回城的夜晚；天人交戰後收刀，坐到天亮；他醒來，她說出一切，把裂掉的銅鐘放在桌上：「我被派來殺你。我現在選擇不要。」他早就隱約察覺，不說原諒或不原諒，只說：「明天也一起回來吧。」她留下「凜」這個名字：「這個名字是我自己決定要用的。」
- `rinLines`：act2 起的伏筆（spec §5.1：她開始刻意避開他的視線；「……沒什麼。」可以保留）；第二幕的城鎮台詞要替他「早就察覺」埋伏筆（spec §5.2），可以放在 `townLines.act2` 由 Task 12 寫，這裡在帳本記下需要哪幾句。
- `rinOath`：選擇之後的她，至少 3 句，不再避開他的視線。
- 回城對話 4 段：至少一段在 act2 以後（開始迴避），最後一段 `CHAT_GATE` 是 `{ oath: true }`。
- `people.rin` 3 段：第 3 段在集滿時解鎖，可以寫她的選擇。

- [ ] **共同步驟 Step 1–6**；本任務的測試另加：`Rin's last chat waits for her choice`：`CHAT_GATE['chat:rin:4']` 是 `{ oath: true }`。
- [ ] **commit**：`story(starlantern): Rin's choice, her words and her page`

### Task 8–10: 夥伴（每位：5 段回憶、2 段回城對話、相遇前後、人物頁）

三個任務的格式相同，只有人不同：
- **Task 8**：瑟蕾、千鶴、莎菲拉
- **Task 9**：希爾薇、諾艾兒、波比
- **Task 10**：莉茲、絲嘉蕾，加上 `survived`（絲嘉蕾劇情戰結束時的那句）

**Files:** Modify `data/story.zh-TW.ts`（每位 c 的 `scenes.mem:c:`、`scenes.chat:c:`、`people.c`、`meet.c`）、`data/story/scenes.ts`（`CHAT_GATE`，若需要）、`data/story/story.test.ts`
**Read：** spec §6 的那幾位、§7.3、§7.5（莉茲與歐里克）、§11.1（瑟蕾的月相）、§11.2（希爾薇的種子、千鶴的小祠、莎菲拉的廣場）、`data/talents.ts` 的她的記憶關鍵天賦名稱、帳本的落點表。

**Interfaces（每一位）：**
- `WRITTEN` 加入 `scenes.mem:c:`、`scenes.chat:c:`、`people.c`、`meet.c`。
- 5 段回憶，每段最多 4 句：spec §6 的記憶線，第 5 片是她的圓滿結局（6b 衝突第 6 點：結局由最後一片回憶與鎮上的變化承擔）。
- 相遇：`meet.c.before` 最多 4 句（第一句是旁白的「發現」，接著是她，照 spec §6 的相遇描述）；`meet.c.after` 1 到 4 句（她加入）。說話者只能是她、主角、凜、旁白（Task 2 的閘門）。
- 回城對話 2 段，每段最多 3 句。
- `people.c` 3 段（遇見、3 片、5 片）。
- 個別的要求：
  - 瑟蕾：第 2、4 片是滿月的光明結局，第 5 片是新月的黑暗結局（spec §11.1，月相目前一律成立，但內容照這個分）；最後一片讓她認出預言裡的那群人就是這支隊伍，第一次說「我想看見」。
  - 千鶴：她以為只離開了幾天；神社早就不在；最後一片是神主託她帶走的鈴，她在鎮邊蓋小祠。
  - 莎菲拉：一片一位團員；最後一片是團長把她推出蜃樓：「你要繼續跳。」
  - 希爾薇：她先把林中的人帶出去才回頭；最後一片是發芽的種子。
  - 諾艾兒：星火魔法燒掉施法者的記憶；老師阻止她是為了保護她；最後一片在流浪商人的攤前重逢（`MEMORY_GUESTS` 的 merchant），商人的句子用 `STORY.merchant.found` 的口吻（Task 11 寫，先在帳本記好他恢復後的聲音）。
  - 波比：星燈的構造圖、祖先的愧疚（燈造得什麼記憶都能裝）；最後一片讀懂構造圖，說出「祖先造錯的東西，我來修好。」（她在終幕修燈芯，Task 14 接著寫）。
  - 莉茲：一點一點讓玩家發現她是歐里克的女兒；第 5 片的重逢句子帶 `if.returned: 'orik'`（歐里克先交還時，重逢發生在這裡；否則這片停在她想起父親的臉，Task 11 的交還那邊接住）。
  - 絲嘉蕾：她以為自己臨陣脫逃；最後一片是公主的話：「你不是盾，你是我的朋友。活下去。」相遇是劇情戰（spec §6；她一開始把隊伍當敵人）。`survived` 一句。
- Task 10 另外把 Task 2 的 `meetings say…` 的 `after` 下限從 0 改成 1。

- [ ] **共同步驟 Step 1–6**（每個任務一次）
- [ ] **commit**：Task 8 `story(starlantern): Selene, Chizuru and Safira`；Task 9 `story(starlantern): Sylvie, Noel and Bobby`；Task 10 `story(starlantern): Liz and Scarlet`

### Task 11: 鎮民、流浪商人與鐘守

**Files:** Modify `data/story.zh-TW.ts`（`scenes.town:`、`town`、`merchant`、`bellkeeper`）、`data/story/story.test.ts`
**Read：** spec §3.3、§3.5、§5.2、§7.5、§11.3（`questHook` 的方向）、§11.4、§6 的莉茲與諾艾兒、Task 10 寫的莉茲第 5 片、帳本。

**Interfaces:**
- `WRITTEN` 加入 `scenes.town:`、`town`、`merchant`、`bellkeeper`。
- 5 段交還（每段最多 8 句）：歐里克記得女兒的臉；瑪莎記得丈夫離開的那天，她說還是會寫日記，因為「現在想記住的事變多了」；安娜想起自己進迷宮之前的名字，揭露她曾經是冒險者；葛倫想起他在上一輪也看見過洛恩走出來；多蘭想起師父的鍛造手法。每一位都要有所改變（spec §7.5），台詞要讓玩家看見那個改變與報酬的來由。
- 歐里克的交還：重逢句子帶 `if.full: 'liz'`（莉茲已集滿時，重逢發生在這裡）。
- `town[id].lost`：玩家撿到時手冊上的一句（她失去了什麼）；`town[id].after`：交還後加進設施招呼的一句。
- `merchant.lost`、`.found`：各一句。
- `bellkeeper.oath`：至少 3 句（他是被恐懼與誤解綁住的人，不是壞人；spec §3.6）；`bellkeeper.after`：至少 2 句（結社解散之後）。

- [ ] **共同步驟 Step 1–6**；本任務的測試另加（Review Focus 1）：`father and daughter meet once, in whichever comes second`：
  - `linesWhen(mem:liz:5, 沒交還)` 沒有歐里克的句子；`linesWhen(mem:liz:5, returned: ['orik'])` 有；
  - `linesWhen(town:orik, full: [])` 沒有莉茲的句子；`linesWhen(town:orik, met 與 full 含 liz)` 有。
- [ ] **commit**：`story(starlantern): the townsfolk, the merchant and the bellkeeper`

### Task 12: 城鎮台詞與五個設施的招呼（六個階段）

**Files:** Modify `data/story.zh-TW.ts`（`townLines`、`greet`）、`data/story/story.test.ts`（`every stage has town lines…` 改寫，見下）
**Read：** spec §3.3（「大家都在假裝沒事」）、§8.2、§17、文風聖經的鎮民語氣表、Task 7 帳本裡第二幕要埋的伏筆。

**Interfaces:**
- `WRITTEN` 加入 `townLines`、`greet`。
- `townLines`：六個階段各至少 3 句，依那個階段的進度換新；第二幕埋「洛恩早就察覺凜不對勁」的伏筆（spec §5.2）。
- `greet`：公會（安娜）、道具店（歐里克）、旅館（瑪莎）、傳送門（葛倫）、鍛造屋（多蘭），六個階段各至少 2 句，說話的是那位 NPC。
- 測試修改：`story.test.ts` 的 `every stage has town lines and every facility greets in every stage` 目前寫死 6b 抄來的三句開場白（`TOWN_OPENING`），改成只斷言句數；`TOWN_OPENING` 與 `greetOf` 刪掉。

- [ ] **共同步驟 Step 1–6**；本任務的測試另加：`each stage sounds different`：相鄰兩個階段的 `townLines` 沒有完全相同的句子。
- [ ] **commit**：`story(starlantern): the town's days, stage by stage`

### Task 13: 吸收台詞與記憶關鍵天賦的文字

**Files:** Modify `data/story.zh-TW.ts`（`absorb`）、`data/talents.ts`（只改 9 個記憶關鍵天賦的 `name`、`desc` 的文字部分）、`data/story/story.test.ts`、`data/talents.test.ts`
**Read：** spec §3.1（空殼）、§7.4、§5.3、§6、各夥伴已寫的最後一片。

**Interfaces:**
- `WRITTEN` 加入 `absorb`。
- `absorb`：至少 30 句，每句一行，陌生人的記憶（例如 spec 的「……媽媽，我明天就回來。」）。不提任何有名字的角色，不劇透。
- 記憶關鍵天賦：名稱與說明可以改寫得更貼近她的記憶（例如絲嘉蕾的「不是盾，是朋友」），每一個 `${...}` 插值原樣保留，數值常數一個都不動。棋盤上的 7 個一般關鍵天賦不改。

- [ ] **共同步驟 Step 1–6**；本任務的測試另加：
  - `story.test.ts`：`thirty strangers, no names`：`absorb` 至少 30 句、互不相同，沒有任何一句含 `CHARACTERS[*].name` 或 `NPC_NAMES` 的名字。
  - `talents.test.ts`：`memory keystone texts keep every number`：每一個記憶關鍵天賦的 `desc`，都含有它插值的每一個 `MEMORY_KEYSTONE_VALUES`（或 `V`）的值的字串；名稱不是空的、互不相同。
- [ ] **commit**：`story(starlantern): strangers' memories and the keystones' words`

### Task 14: 終幕與結局

**Files:** Modify `data/story.zh-TW.ts`（`scenes.finale`、`endingTitle`、`finaleBossName`）、`data/story/story.test.ts`
**Read：** spec §8.4 的終幕、§3.4、§3.6、§5.2、§6 的波比、§2 反目標、帳本全部、已寫的主角第 9、10 片與每位夥伴的最後一片。

**Interfaces:**
- `WRITTEN` 加入 `scenes.finale`、`endingTitle`、`finaleBossName`。
- `finaleBossName` 照 spec：「燈喰之母」（不經過 `ph()`）。`endingTitle` 照 6b 的「終幕　點燈」或改寫，在帳本記下。
- `finale`（最壞情況下最多 12 句）：主角準備像每一輪一樣把自己當燈芯；已遇見的夥伴各交出一段「關於他的記憶」（每位一句 `if.met`），沒遇見的由洛恩念出她的名字（每位一句 `if.notMet`，鎮上的人也記得她們）；波比修好的燈芯機構讓燈不再需要一個人燒盡自己（`if.met: 'bobby'`；沒遇見時由洛恩代為說明，`if.notMet: 'bobby'`）；燈穩定、碎片的光回到原主人身上、暮霧散去；凜把銅鐘交給鐘守，鐘守聽完真相，敲最後一次鐘，宣告結社解散（`if.oath: true`；凜還沒選擇時配一句 `if.oath: false` 的版本）；所有人找回自己，並選擇彼此。
- `finale.summary` 是結局卡片的內文（6b Task 17），要能單獨當結局的文字讀。

- [ ] **共同步驟 Step 1–6**；本任務的測試另加（Review Focus 1、2）：
  - `the finale names every companion, met or not`：對每一位夥伴 c，有一句 `if.met: c` 由 c 說；有一句 `if.notMet: c` 由主角說、文字含 `CHARACTERS[c].name`。
  - `the bell is handed over only after her choice`：提到銅鐘的句子都帶 `if.oath`，而且兩種值都有。
  - 既有的 `no scene plays more lines than its cap, in any party` 必須綠（終幕的組合最多）。
- [ ] **commit**：`story(starlantern): the finale`

### Task 15: 收尾：清空暫定文案、全套、e2e、截圖與連續性審查

**Files:**
- Modify：`data/story/story.test.ts`（`placeholders are registered` 改成 `expect(PLACEHOLDERS.size).toBe(0)`；`WRITTEN` 與它的測試刪掉，因為大小為 0 已經涵蓋）、`tests/e2e/starlantern.spec.ts`（依下面的規則）。
- 保留 `ph()` 與 `PLACEHOLDERS`（之後的計畫寫暫定文案還會用到），但 `data/story.zh-TW.ts` 裡不再有任何 `ph(` 的呼叫。

- [ ] **Step 1：紅燈**：改成 `toBe(0)`，執行。若有剩下的 `ph(`，回報是哪一個任務的漏網之魚，交回控制者（不在本任務補寫劇情）。
- [ ] **Step 2：全套與 tsc**：`rtk proxy npx vitest run --testTimeout=20000` 全綠；`npx tsc --noEmit` 在 starlantern 與 e2e spec 底下 0 個錯誤；`grep -rn "it.fails\|it.skip\|\.only(\|\.todo(" src/scripts/games/starlantern` 沒有結果；平衡指令全綠（第 20 項在內），數字記進 `pace-baseline.md`，與 Task 1 結束時相同。
- [ ] **Step 3：e2e**：執行 e2e 全套。文案斷言改成結構斷言：用 class、場景 id、`STORY` 的資料與遊戲狀態，不寫死任何劇情句子。逐句播完場景的地方用「按確認直到城鎮選單可用」的迴圈，不假設句數。若真實文案讓測試變慢，提高個別測試的 timeout，不刪步驟。
- [ ] **Step 4：截圖**（headless、`--mute-audio`，存到 `tmp/starlantern/t15-6c/`）：序章、凜的一段回憶、主角第 9 片、第二幕、凜的揭露、相遇與戰後台詞、一位鎮民的交還、六個階段各一張城鎮招呼、終幕與結局卡片、狀態頁鎖住的記憶關鍵天賦。逐張看：沒有爆框、說話者與立繪正確。
- [ ] **Step 5：commit**：`test(starlantern): the script is whole — no placeholder left`。實作者到這裡結束。
- [ ] **Step 6（控制者的步驟，不是實作者的）：連續性審查**：派一個沒參與寫作的代理，用最強的模型，依 `~/.claude/skills/review-pr/SKILL.md` 審查本計畫的 diff。輸入：spec、文風聖經、設定帳本、`data/story.zh-TW.ts`、`data/talents.ts`、Step 4 的截圖。檢查：
  - 跨任務的連續性（名字、稱呼、時間、物件、誰知道什麼）；
  - 揭露順序在任何遊玩順序下都成立；
  - 語氣曲線（過程沉重晦暗、結局圓滿）與每個人的聲音；
  - spec §2 的反目標；
  - 帳本的每一項發明都沒有和 spec 矛盾。
  控制者處理它提出的問題（修正派給原本寫那一段的任務的實作者，或新的修正代理），再請它複審受影響的範圍。

---

## 交給美術計畫的接口
- 每位角色的記憶背景（`art.memoryBg(id)`）仍未做；回憶場景只用色調區分。
- 鐘守、流浪商人（兩版）、安娜、歐里克、瑪莎、多蘭的立繪與 `sad` 表情（spec §11.4，第 3 項）：本計畫的台詞已經用 `NpcId` 標好說話者，有圖之後自動帶上。
- 城鎮背景的變化版（千鶴的小祠、希爾薇的芽）：文字已經寫了它們出現的時間點（設定帳本）。

## 交給第 2 項（公會任務與懸賞）的接口
- 鎮民的交還與 `questHook`：交還的台詞是一次性的對話；第 2 項把它擴成多步任務時，從設定帳本的鎮民條目接續，不要改寫已經播過的內容。
- 吞了太多記憶的怪物：吸收台詞與真相頁已經用到「空殼」的世界觀，懸賞的文字照帳本的用語。

## 交給第 4 項（季節、日夜、月相）的接口
- 瑟蕾第 2、4、5 片的內容已經照滿月、新月寫好；`when` 上線後內容不必改。
- 凜的揭露寫成夜晚的場景；第 4 項提供「劇情指定時段」後，播放時把時鐘設成夜晚即可。
- 城鎮台詞與招呼目前只依階段分；時段的那一層由第 4 項加。

## 接手清單的處理（`.superpowers/sdd/carry/plan6b-carry.md`）
- 記憶節奏「每 3～5 層一片新的」：Task 1（第 20 項的平衡帶與記憶旋鈕）。它取代 6b 最終審查的 I2（期望值用「抵達時」或「清完時」）：期望值維持 6b 的「抵達時」，節奏帶看每一片掉落的那一層。
- 凜的速度：只看基礎能力（`rin.test.ts` 照舊）；不新增含記憶或裝備的測試。6b 最終審查的 M3 結案。
- 6a、6b 留下的平衡接手項（M3/M4 的 ramp、深層曲線、M9）都已在 6b 處理；本計畫把 `ENEMY_POWER`、`DEEP_ENEMIES`、`FINALE_BOSS.power` 與全部門檻凍結。
- 6b Task 21 延後的 9 項：
  - `absorbFail.invalid` 的文字（T11）：屬於介面文字，Task 3 動到 `text.zh-TW.ts` 時順便改寫成明確的說法，不另外測試。
  - 其餘 8 項維持 6b 的處理（沒有行為差別或屬於凍結的旋鈕）。

## 本計畫裁定的 spec 衝突
1. **記憶的深度門檻。** spec §7.3 的深度是提案（§15 留給實作者），使用者後來決定「每 3～5 層一片新的」。本計畫用第 20 項平衡帶與記憶旋鈕重新定深度，保留 spec 的固定點：主角第 9、10 片在第 25、30 層的頭目；凜第 1 片在第 1 層、第 7 片晚於第三幕；夥伴第 4、5 片在第 6 層以後。
2. **凜的揭露落在第四幕之後（大多數時候）。** 依新的節奏，凜第 7 片最早在第 19 層左右，而第四幕在第 16 層；spec §8.4 原本的順序是揭露（第 15 層）在第四幕之前。本計畫不動 `ACT_DEPTHS`：第四幕寫成不依賴揭露，提到她的選擇的句子都帶條件（Review Focus 2）。若使用者想維持「揭露在第四幕之前」，要把第四幕往深處移（見「需要使用者決定的事」第 2 點）。
3. **靜鐘會的真相在第四幕還是終幕。** spec §3.6 說「他們殺的一直是守燈人」在終幕揭露，§8.4 的表把「靜鐘會的誤解」放在第四幕。本計畫：第四幕揭露他們的教義建立在誤解上；每殺一次燈就晚一次點亮、以及他們停止，留在終幕。
4. **洛恩就是守燈人在哪裡確認。** spec §8.4 把「守燈人」放在第四幕，§4 的燈鑰是「終盤揭露」。本計畫：第四幕講守燈人的傳說，只把「是不是他」留成疑問；主角第 9 片確認；第 10 片揭露劍是燈鑰。
5. **句數上限算播出的句子。** spec §8.2 的上限是「長度」。終幕要替 8 位夥伴各準備已遇見與沒遇見兩種句子，陣列一定超過 12。本計畫以「任何組合下真的會播出的句數」算上限（Task 2）。
6. **回憶裡的過去人物沒有說話者 id。** 師父、公主、團長、神主、失憶之前的老師由旁白轉述，台詞放在「」裡（spec §11.4：回憶人物不做立繪）。
7. **莉茲與歐里克的重逢。** spec §6 說「最後一片和歐里克的鎮民碎片一起交還」，但夥伴碎片撿到就算找回，不會交還。本計畫新增 `if.full`：重逢發生在後到的那一件事裡，只發生一次。
8. **回城對話可以有階段門檻（`CHAT_GATE`）。** spec §8.2 只說每次回城最多一段。沒有門檻的話，凜的 4 段對話可能在本道第 2 層前就說完，無法跟著劇情走。門檻擋住的對話不跳號，其他人照常輪到。
9. **鐘守在凜選擇之後才進城鎮。** spec §11.4 寫「第三幕後出現在城鎮」，§5.2 寫揭露「這場戲之後」派他來。本計畫照 §5.2，因為他是因為她的選擇而來。
10. **流浪商人的兩個版本**用一句招呼承擔（spec §11.4），他的恢復由諾艾兒第 5 片演出。
11. **鎖住的記憶關鍵天賦不顯示名稱**，凜的鎖住說明也不提前說「選擇」。這是介面的改動，不是數值的改動；理由是名稱本身就會劇透她們的最後一片。
12. **相遇台詞、回城對話、人物頁依人分配，不另開類別任務。** 使用者列的類別是例子；同一個人的聲音由同一個任務寫，比較容易一致。各幕的真相頁跟著各幕寫。
13. **台詞的英數。** 劇情文字不用阿拉伯數字（例如「三天後」）；介面文字照舊。
14. **`ph()` 留著。** 本計畫結束時 `PLACEHOLDERS` 是空的，`ph()` 本身保留給之後的計畫寫暫定文案。

## 需要使用者決定的事
1. **文風（Task 4 的檢查點）**：語氣、每個人的聲音、對洛恩的稱呼、明暗的程度。這是本計畫唯一停下來等使用者的地方。
2. **凜的揭露與第四幕的順序**（衝突第 2 點）：預設是不動第四幕的深度，揭露大多落在第四幕之後。若使用者要揭露在前，第四幕要移到第 20 層以後，這會改變第四幕與城鎮台詞的時間點。
3. **記憶節奏調不過時**（Task 1 的停止規則）：若 6 輪內找不到同時讓第 20 項與既有平衡帶都綠的旋鈕，控制者停下整個計畫，帶著每一輪的數字問使用者。
