# 星燈迷宮 劇情結構（階段 L）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 回憶改在回城的夜晚播（一晚一到三段，隨積壓變動；洛恩與凜的必需回憶在需要它們的主線之前先播，不算在上限裡；終幕前有「下潛前的那一夜」補播；其餘在手冊標新），迷宮只留一行字幕；第二、三、四幕之後各加一場群戲，佔掉那一次回城的閒聊位置；希爾薇、千鶴重新定聲；終幕八句回呼群戲；分歧讀法減量。戰鬥模擬逐位元不動。

**Architecture:**
- **先引擎，後寫作**。
- **拾取與播放分開**：
  - `takePieces` 照舊加片數（戰鬥讀得到的效果全部留在拾取時）；
  - 回憶改記在 `story.untold`；
  - 純函式 `engine/story/nights.ts` 的 `planNight` 依到站決定今晚播哪幾段，寫進 `story.tonight`，讓重新讀檔播的還是同一批。必需回憶先播，其餘一到三段隨積壓變動，兩段之間插一拍，終幕前補播「下潛前的那一夜」（【控制者裁定 2026-10-23】）。
- **「已說」取代「持有」**：夥伴的 `full`／`pieces` 閘門與台詞條件改讀「已說的片數」（`storyPieces`）；洛恩、凜照舊讀持有。
- **反應槽**：
  - `arrivalScenes` 在主線之後找第一場到期的群戲（`nextReaction`）；
  - 有群戲的那一次回城，不播回城對話與閒聊；
  - 群戲由註冊表 `REACTIONS` 決定，寫作任務寫好一場才註冊一場；引擎任務用注入的表測試。
- **寫作任務**的驗收除了測試，還要一位沒讀過設計文件的全新讀者冷讀。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-23-starlantern-story-structure-design.md`（下稱 spec §）。另外要讀：
- 診斷：`C:\msys64\tmp\claude\C--Users-bag57\50dcf669-8aa8-4bb5-ac8e-fe7a03cde69f\scratchpad\story-diagnosis.md`；
- `docs/superpowers/story/starlantern-style-bible.md`（下稱聖經）；
- `docs/superpowers/story/starlantern-lore-ledger.md`（下稱帳本）；
- 深度 spec `docs/superpowers/specs/2026-10-23-starlantern-story-depth-design.md` §3、§4.2。

**範圍外**：
- 掉落與數值；
- 新美術；
- 字級；
- 舊存檔相容（使用者裁定不需要）。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/`、`.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄是 `.superpowers/sdd/2026-10-23-starlantern-story-structure/`，下稱 SDD。行號是 `b08d75191` 的位置，只用來定位，動手時一律用內容找。

## 計畫裁定

規則本身已經在 spec 裡定死。這裡只寫 spec 沒寫、由本計畫決定的細節，標「設計者裁定」。

1. **設計者裁定：測試用的「已說」輔助**：
   - `engine/testing.ts` 新增 `withTold(s: GameState, c: CharacterId, n: number): GameState`：
     - 把 `c` 的持有片數設成至少 `n`；
     - 把 `mem:c:1` 到 `mem:c:n` 放進 `seen`；
     - 其他欄位不動，回傳新的狀態。
   - Task 1 起，凡是「給她片數、期待閘門打開」的既有測試，都改用它。理由：這些測試釘的是閘門，不是持有與已說的差別。
2. **設計者裁定：Task 1 的腳本**：
   - `engine/story/events.test.ts` 的 `scriptedPlay`（約 958 行）在 Task 1 先把每一片持有的碎片當成立刻說過。這是 L 之前的行為（迷宮裡播）。
   - 這樣 Task 1 量到的收尾閒聊時間不會變。
   - Task 6 再換成真的夜晚排程。
3. **設計者裁定：夜晚的地點卡**：
   - `data/story.zh-TW.ts` 匯出 `NIGHT_PLACE = PL.innNight`（「月影旅館・夜」，`night: true`）。
   - `ui2/story.ts` 的 `playScene`／`playAndRecord` 多一個選用參數 `{ place?: Place }`：場景開始時先設這張卡；場景自己的 `place` 照樣覆蓋。
4. **設計者裁定：字幕**：
   - `T.ui2.memory.recalled: (name: string) => string`，結果是「〇〇想起了什麼。」。
   - `fragmentLines`（`ui2/battleText.ts:60`）對 `piece` 一人只出一行。
   - `T.ui2.memory.piece` 在沒有任何呼叫者之後刪除。
5. **設計者裁定：群戲的閘門資料先到**：
   - `GROUP_GATE`（三場的閘門，只有 `met` 與第三幕的 `beforeChoice`；過期由 `story.reacts` 管，spec §5.2）在 Task 1 就寫好；
   - `REACTIONS`（已經寫好劇本、可以播的群戲）在 Task 9–11 逐一註冊。
6. **設計者裁定：任務順序**（審查修正 2026-10-23，第 10 項：Task 2、3 拆開）：
   - 引擎依序做：
     - Task 1；
     - Task 2a、2b；
     - Task 3a、3b、3c、3d；
     - Task 4、5、6。
   - 寫作依序做：
     - Task 7 到 13；
     - Task 13b；
     - Task 14、15、16。
   - Task 14（終幕）要等三場群戲都寫完。
7. **【控制者裁定 2026-10-23】夜晚的段數與補播**：取代第一版的固定上限（spec §4.3、§4.4.1、§4.8、§13）。
   - **上限**：`cap = min(3, max(1, ceil(backlog / 3)))`，`backlog` 是扣掉必需回憶之後的 `untold` 段數。
   - **疲勞保護**：
     - 同一人不連播；
     - 播三段時，候選裡有 `warm` 的就至少一段 `warm`；
     - 收尾的碎片放最後。
   - **兩段之間的一拍**：取自 `NIGHT_BEATS` 台詞池，四十句，用游標 `story.beat` 輪流，在 Task 8 寫（審查修正第 13 項）。
   - **必需回憶**（審查修正第 6、11 項）：
     - 三幕、鐘守的那一天：洛恩、凜未說的碎片；
     - 揭露、坦白的那一天：只有凜的；
     - 隊列有 `hero-alone` 時：洛恩到第九片為止未說的。
     - 不受上限限制，先播。
   - **下潛前的那一夜**（審查修正第 2 項）：
     - 一場出發時播的戲 `finale-eve`：凜選擇之後，本道最深 ≥ 26 的第一次出發；
     - 沒播到時，是終幕清單的第一項。
   - **Task 6 的驗收數字**：未說的段數在終幕之後：每層回城 ≤ 3、每兩層 ≤ 8、每三層 ≤ 15；沒有一晚超過三段；沒有必需回憶遲到。達不到就停下回報。
8. **設計者裁定：下潛快照**（審查修正第 9 項）：
   - 模擬閘門不建 `Game`，所以 Task 0 另外錄一份 `Game` 的下潛快照，`engine/__fixtures__/story-l/dive.json`；
   - 測試是 `engine/storyL.dive.test.ts`；
   - 每個任務的收尾 G 都要跑它，必須通過。
9. **停止規則**：
   - 任何改動要動到掉落、數值，或模擬閘門變成不是 `identical`，停下來回報 BLOCKED；
   - 要改帳本裡既有的 I 條目或揭露時機，停下來回報 NEEDS_CONTEXT；
   - 新增的設定（千鶴的祭典歌、諾艾兒藏起的碎晶、希爾薇睡門邊、莉茲的錢袋）只能新增條目。
10. **【控制者裁定 2026-10-24】Task 6 第一次實測之後**（報告 `task-4-6-report.md`）：
   - **出發前的清晨**（spec §4.8.1）：
     - 出發時 `untold` 還有 4 段以上，就在出發前播剛好一段，用同一套排序，先挑 `warm` 的，不挑前一夜最後一段的主人；
     - 回城時挑好，存在 `story.dawn`；
     - 下潛前的那一夜自己那一次出發不播它；
     - 夜晚的上限公式不變。
   - **門檻**：不變，仍是 3／8／15。每三層的玩家若仍超過，只要 ≤ 20 就接受（他選擇少回城，剩下的回憶在手冊標新）。不調其他規則。
   - **每兩層的收尾閒聊測試**：裁定 9 真正保證的是「六段收尾閒聊在終幕後前三次回城之內播完」，這一條保留為硬性斷言。終幕前播了幾段只是量出來的釘子，改釘新的數字並寫進報告。保證本身不成立就停下回報。
   - **本道優先錯過群戲**：接受。一般路線仍要三場都播；錯過的要乾淨地過期，並寫測試證明。
   - Task 6 在加了清晨之後，連同新數字一起 commit。

## Global Constraints

**使用者的方向（最高依據）**
- 「劇情本身還是很尷尬」。
- 「你應該要作為專業編劇編寫適當的劇情，並且驅動他們各自的人性，讓他們在故事當中有衝突和掙扎」。
- 不動的前提：凜來殺洛恩、守燈人、全女性夥伴、碎片掉落節奏、可選一位的戀愛結局、世界的秘密。
- 日常輕快、有梗、日系 RPG；沉重留給回憶；「……」少用。
- 每個人都有慾望、缺點、衝突與掙扎；每位夥伴至少和另外兩位有真的摩擦。

**分支與基準**
- 新的 worktree `C:\Users\bag57\.codex\worktrees\starlantern-story-l`，分支 `feat/starlantern-story-l`，從 `origin/master` 開出（寫計畫時是 `b08d75191`）。
- 基準提交 `<BASE>` 記在 SDD `baseline.md`。
- 開工前跑 `git status`。要改的檔案若有別人未提交的修改，停下來回報 NEEDS_CONTEXT。

**模擬閘門**
- 指令：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-0 > <SDD>/gate-<N>.stdout`。
- 檢查：
  - 最後一行必須是 `gate: identical`（Task 0 的 `gate-0` 不比對）；
  - `cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
- 時機：Task 0、2a、2b、3b、3d、5、16 各跑一次。
- 不覆寫 `engine/__fixtures__/`。
- 不加任何新的亂數抽取，不用 `Math.random`。

**測試與檢查**
- **TDD**：先寫失敗的測試，確認它因正確的理由失敗，再實作。
- **vitest**：
  - 單檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`。
  - 全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。
  - 不可以用 `npm run test`。
- **tsc**：`rtk proxy npx tsc --noEmit -p .`。
  - `src/scripts/games/starlantern/` 與 `tests/e2e/starlantern*.ts` 底下必須是 0 個；
  - 全 repo 總數不可以多於 `baseline.md` 記下的數字（master 約 773 個，都在本專案之外）。
- **e2e**：`E2E_PORT=4352 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。
  - 一律 headless、靜音；
  - 只用 4352，絕不用 4354；
  - 不結束任何程序。
- **重的工作（閘門、e2e、全套）之前**：
  - PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` 必須 ≥ 6291456（KB），不足就等；
  - 一次只跑一套重的工作。
- 本專案沒有 prettier、eslint。一次性的探測程式跑完就刪，絕不 commit。
- **測試修改規則**：
  - 每個任務的 Files 列出已知會紅的既有測試，只照新的行為改；
  - 不放寬門檻、不刪斷言、不加 `skip`／`only`／`todo`／`it.fails`；
  - 全套跑出沒列到的紅燈，停下來回報 NEEDS_CONTEXT；
  - `data/story/story.test.ts` 裡 `expect(` 的數量不可以比 `baseline.md` 記下的少（`grep -o "expect(" src/scripts/games/starlantern/data/story/story.test.ts | wc -l`）；
  - 改到被釘死的整句時，用 `pinBeat`（`data/story/voiceGates.ts:243`）釘情節要點。

**文字**
- 劇情只放 `data/story.zh-TW.ts`，介面文字只放 `data/text.zh-TW.ts`。
- 每句 ≤ `MAX_LINE_CHARS`＝60；場景照最壞情況播出的句數計，不超過 `lineCap(id)`。
- 全形標點，對白「」，引號裡用『』，省略號「……」，破折號「──」；劇情文字不出現英文字母與阿拉伯數字（`numeral()`）。
- 台灣用語；過去的人物對女性說話用「妳」。
- 立繪、表情只用 `moodsFor(說話者)` 已有的。沒有新美術、沒有佔位圖。
- SCSS 預期不改；真的要改只能改 `src/styles/_starlantern-ui.scss`。禁 `!important`、禁行內樣式。字級只有 12／24px，行高 ≥ 14。

**換行**（改檔前 `git ls-files --eol <檔>`，改完 `git diff --stat`；整檔被改寫就是換行壞了；CRLF 與混用檔不可以用 `sed -i`；新檔一律 LF）
- LF：
  - `data/story.zh-TW.ts`、`data/story/{scenes,story.test,voice.test,voiceGates}.ts`；
  - `engine/dungeon/run.ts`、`engine/story/{events,events.test,handbook,handbook.test,memories}.ts`；
  - `ui2/story.ts`、`ui2/battleText.ts`、`ui2/scenes/{dungeon,dungeon.test,handbook,handbook.test}.ts`；
  - `tests/e2e/starlantern.spec.ts`、`docs/superpowers/story/*.md`。
- CRLF：`engine/game.test.ts`、`engine/save.ts`、`engine/state.ts`、`ui2/scenes/town.ts`。
- 混用（新行照相鄰行）：`data/text.zh-TW.ts`、`engine/game.ts`、`engine/save.test.ts`、`ui2/scenes/{battle,battle.test,town.test}.ts`。

**git**
- 用完整路徑 add，不可以 `git add -A`／`git add .`。
- Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不可以 `git checkout`、`restore`、`reset`、`stash`、`clean`；要撤回就再改一次檔案。不 push。

**收尾 G（每個任務）**
1. 全套全綠（含 `engine/storyL.dive.test.ts`：下潛快照不變，計畫裁定 8）；tsc 符合上面的條件。
2. 動到 `ui2/` 或 `tests/e2e/`，或改到的字串在 `tests/e2e/starlantern.spec.ts` 裡逐字出現（先 grep）時，跑 e2e 並全綠。
3. 報告：
   - 新增與修改的測試名；
   - 全套的兩行、tsc 數字、e2e 結果（沒跑就寫理由）；
   - 閘門結果（該跑的任務）；
   - 改了哪些既有斷言；
   - 偏離本計畫的地方與理由。

**子代理**：實作者不派子代理。冷讀審查由控制者另派全新脈絡的讀者，模型照使用者偏好用 Opus 5.5。

## 寫作任務的固定步驟（Task 8 到 Task 15 的 W1–W8）

- [ ] **W1 紅**：
  - 寫本任務列出的新測試或釘子；新的鍵加進 `data/story/voice.test.ts` 的 `POLISHED`；
  - 跑 `voice.test.ts`、`story.test.ts`、`data/terms.test.ts`；
  - 失敗清單存成 SDD `task-<N>-red.txt`。
- [ ] **W2 改寫前的朗讀稿**：`STORY_DUMP=<SDD>/task-<N>-before.md STORY_DUMP_KEYS='<前綴,…>' rtk proxy npx vitest run src/scripts/games/starlantern/data/story/readAloud.test.ts`。新場景沒有改寫前的稿，就跳過這一步。
- [ ] **W3 寫**：照 spec 與 Task 7 之後的聖經寫。
  - 意思與揭露時機照 spec；
  - 想像自己出聲念一遍；
  - 帳本需要新條目的，同一個 commit 一起加。
- [ ] **W4 釘子**：被改到的釘死整句改用 `pinBeat`。
- [ ] **W5 綠**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern` 全綠，然後做收尾 G。
- [ ] **W6 改寫後的朗讀稿**：
  - 同 W2，輸出 `task-<N>-after.md`；
  - 另外輸出一份 `task-<N>-blind.md`（`STORY_DUMP_BLIND=1`，Task 7 加的無名牌模式）。
- [ ] **W7 commit**：`feat(starlantern): story L — <段落名>`，只 add 本任務改到的檔案。
- [ ] **W8 冷讀**（控制者派讀者，實作者不自審）：
  - **讀者拿到什麼**：只有 `task-<N>-after.md` 與 `task-<N>-blind.md`；群戲任務另外加上前一幕的朗讀稿。**不給** spec、聖經、帳本、診斷，也不說設計意圖。
  - **固定題目**：
    1. 出聲念。逐句標出讓你出戲的台詞：翻譯腔、說明書、口號、像少字、不像台灣人講的話。
    2. （群戲）用你自己的話寫出每個人想要什麼、和誰對立、結尾留下了什麼東西。
    3. （第三幕群戲）讀完你確定凜是誰了嗎？你猜她是什麼人？
    4. （聲音任務）`blind` 稿裡標了號的十句，各是誰說的？
    5. 哪一句最好、哪一句最差，各一句理由。
  - **及格**（控制者對照 spec 判定）：
    - 第 1 題沒有未處理的標記；
    - 第 2 題每個人的慾望都和 spec §6 對得上；
    - 第 3 題用對照組判定（審查修正第 17 項）：另一位全新的讀者只讀第三幕（`scenes.act3.` 的朗讀稿），回答同一題。只有在群戲讀者說出「她是來殺他的」而對照讀者沒有時，才算群戲不及格；
    - 第 4 題至少答對八句。
  - **不及格的處理**：實作者照讀者的清單修改，重跑 W5，commit `fix(starlantern): story L — <段落名>（冷讀）`，再由同一位讀者只複審改過的句子。最多兩輪；之後仍有意見，交給控制者裁定。

## Review Focus

1. **夜晚播到一半重新讀檔**：讀檔後只播今晚剩下的，不多、不少、不重挑。→ Task 3b `a reload mid-night plays the rest of tonight, no more`。
2. **用歸還之燈回城，或全滅被抬回城，身上帶著未說的碎片**：那一晚照樣播。→ Task 3b `a lamp return and a wipe have a night too`。
3. **在迷宮裡打開手冊，先讀了一片未說的回憶，然後回城**：那一晚跳過它，不補別人，也不重播。→ Task 4 `a piece told early in the handbook is skipped that night`。
4. **劇情播放設定是「只播主線」或「不播」**：
   - 今晚的回憶記成自動略過（手冊標新）；
   - 群戲在「只播主線」時照播。
   - → Task 3c `the story setting skips the night but keeps it new`；Task 5 `a group scene plays under major only`。
5. **同一趟下潛拿到凜的第六、七片就回城**：揭露那一晚先依序播兩片，再播揭露；洛恩與其他人一段也不播。
   - → Task 3a `Rin's untold pieces all play before her reveal, beyond the cap; Lorne's wait`。
   - 從第四層一路下到第十層才回城：第二幕的群戲在第三幕那一次到站直接過期。→ Task 5 `a group scene's second chance is lost when the next act plays`。

---

## 檔案結構

**新增**：
- `engine/story/nights.ts`（＋`nights.test.ts`）：今晚的回憶怎麼挑、必需回憶、拍子、下潛前的那一夜。純函式，沒有 DOM，沒有亂數。
- `data/story/tone.ts`（＋`tone.test.ts`）：回憶的調性。
- `engine/storyL.dive.test.ts`、`engine/__fixtures__/story-l/dive.json`：`Game` 的下潛快照。

**修改**：
- 引擎：
  - `data/story/scenes.ts`：群戲 id、`finale-eve`、`StoryGate.met`、`GROUP_GATE`、`REACTIONS`、`lineCap`／`heavyScene`、`DEPARTURE_SCENES`。
  - `engine/story/events.ts`：`storyPieces`、閘門、`onReturn`、`sceneDone`、`nextReaction`、`arrivalScenes`。
  - `engine/state.ts`、`engine/save.ts`：`untold`、`tonight`、`reacts`、`beat`。
  - `engine/story/memories.ts`：`FragmentGain` 刪掉 `play`。
  - `engine/dungeon/run.ts`：刪掉 `played`。
  - `engine/game.ts`：`takePieces`、`arrive`、`boot`、`night`、`tellEarly`、`nextBeat`、`departScenes`、`finalePieces`、`sceneDone`。
  - `engine/story/handbook.ts`：未說的碎片、已說的段落數。
  - `engine/testing.ts`：`withTold`。
- 介面：
  - `ui2/scenes/{dungeon,battle,town,handbook,gate,clear}.ts`；
  - `ui2/battleText.ts`；
  - `ui2/story.ts`（`place` 選項、`linesOf`）。
- 文字：
  - `data/text.zh-TW.ts`（字幕）；
  - `data/story.zh-TW.ts`（群戲、夜晚化、聲音、終幕、減量、`NIGHT_PLACE`、`GROUP_TITLES`）。
- 寫作守門：`data/story/{voiceGates,voice.test,readAloud,readAloud.test,story.test}.ts`。
- 文件：`docs/superpowers/story/{starlantern-style-bible,starlantern-lore-ledger}.md`。
- e2e：`tests/e2e/starlantern.spec.ts`。

---

### Task 0：基準與下潛快照

**Files:**
- Create: `engine/storyL.dive.test.ts`、`engine/__fixtures__/story-l/dive.json`
- SDD：`baseline.md`

**Interfaces:**
- Produces：`engine/storyL.dive.test.ts` › `a seeded dive is what it was before story L`。
  - 只用公開的 `Game` API 與 `engine/game.test.ts` 那幾個輔助的寫法（`stepOnto`、`downstairs`、`plantGlimmer`；複製進新檔，不從測試檔匯入）。
  - 流程：
    - `Game.fresh(mulberry32(0x5eed), null)`，從本道第一層出發；
    - 每一層：
      - 在一格放一個沒有指定主人的光點，踩上去；
      - 放一隻菁英，踩上去；戰鬥用 `submitRound({})` 一回合一回合打完，不用 `killAll`，讓戰鬥紀錄真的跑過；
      - 下樓；
    - 走到第六層。
  - 記下：
    - 每人的 `memoriesOf`、凜的 `oath`；
    - `run.memoryDraws`、`story.pity`；
    - 所有戰鬥的 `log` 串起來的 SHA-256（`node:crypto`）。
  - 環境變數 `STORY_L_RECORD=1` 時寫 `dive.json`，否則與它比對（`toEqual`）。

- [ ] **Step 1**：
  - 開 worktree 與分支（Global Constraints）。`git status` 乾淨。
  - `baseline.md` 記下：
    - `git rev-parse HEAD`；
    - tsc 總數；
    - 全套兩行；
    - `story.test.ts` 的 `expect(` 數；
    - `grep -c "if: {" src/scripts/games/starlantern/data/story.zh-TW.ts`（寫計畫時是 123）。
- [ ] **Step 2：快照**：
  - 寫 `storyL.dive.test.ts`；
  - 用 `STORY_L_RECORD=1` 跑一次錄下 `dive.json`；
  - 再不帶變數跑一次，必須通過。
  - 再跑一次，`dive.json` 沒有被改（`git diff --stat` 為空）。
- [ ] **Step 3**：
  - 閘門錄 `gate-0`。vitest 必須通過，`cmp` 必須沒有輸出；有輸出就停下回報 BLOCKED。
  - e2e 跑一次，把通過數與失敗的測試名記進 `baseline.md`。
- [ ] **Step 4**：記錄 e2e 裡期待在迷宮或結算播回憶的地方。
  - 在 `tests/e2e/starlantern.spec.ts` 用 Grep 找 `找回了`、`記憶（第`、`slx-memory`、`mem:`；
  - 結果記進 `baseline.md`，Task 2b 要改它們。
- [ ] **Step 5**：commit `baseline.md`、`storyL.dive.test.ts`、`dive.json`，訊息 `test(starlantern): story L baseline and a seeded dive snapshot`。

---

### Task 1：「已說」的片數、`met` 閘門、群戲 id

**Files:**
- Modify:
  - `data/story/scenes.ts:20-24`（`SceneId`）、`:105-113`（`sceneKind`）、`:118-127`（`lineCap`）、`:140-149`（`StoryGate`）、`:225-228`（`heavyScene`）；
  - `engine/story/events.ts:98-118`、`:55-59`（`onReturn` 的歸鄉）；
  - `ui2/story.ts:99-105`（`linesOf`）；
  - `engine/story/handbook.ts:63-68`；
  - `engine/testing.ts`。
- Test：
  - `engine/story/events.test.ts`、`engine/story/handbook.test.ts`、`ui2/story.test.ts`；
  - `data/story/story.test.ts`（`position` 一類讀片數的輔助）。
- 已知會紅（照裁定 1 改用 `withTold`）：
  - `events.test.ts`：`a gate holds a banter back…`（:586）、`a gate opens on each of its kinds`（:619）、`a homecoming waits for her last piece…`（:109）、兩個 `scriptedPlay`（照裁定 2）；
  - `handbook.test.ts`：`people pages unlock with the pieces`（:65）。

**Interfaces:**
- Produces：
  - `type GroupScene = \`group:${ActNode}\``；`SceneId` 加上 `GroupScene`；`groupScene(node: ActNode): GroupScene`；
  - `SceneKind` 加 `'group'`；`lineCap` 對 `group` 回傳 12；`GROUP_MIN_LINES = 8`；`heavyScene` 對 `group` 回傳 `true`；
  - `StoryGate` 加 `met?: CharacterId[]`；
  - `GROUP_GATE: Record<GroupScene, StoryGate>`（spec §5.2 的表）；
  - `REACTIONS: Partial<Record<ActNode, GroupScene>> = {}`；
  - `toldCount(s: GameState, c: CharacterId): number`；
  - `storyPieces(s: GameState, c: CharacterId): number`：洛恩、凜回傳 `memoriesOf`，夥伴回傳 `toldCount`；
  - `withTold(s: GameState, c: CharacterId, n: number): GameState`（裁定 1）。
- 注意：`SCENE_IDS` 這時**不**加群戲 id。`isSceneId` 照舊只認寫好的場景。

- [ ] **Step 1：寫失敗的測試**（`events.test.ts` 新增 `describe('story L: told pieces and the met gate (Task 1)')`）
  - `a companion's full and pieces read the pieces told, not held`：
    - 莎菲拉持有 2、說過 1 時，`gateOpen(s, { pieces: { safira: 2 } })` 是 `false`；
    - 說過 2 時是 `true`；
    - `full` 同理。
  - `the hero and Rin read the pieces held`：洛恩持有 10、說過 9，`gateOpen(s, { full: 'hero' })` 是 `true`。
  - `the reveal still queues once Rin holds all seven, some untold`（審查修正第 9 項，`events.ts:54`）：凜持有 7、說過 5，`onReturn` 把 `rin-reveal` 排進隊列。
  - `a met gate opens once every one named is met`。
  - `toldCount counts her memory scenes in seen, in any order`：`seen` 有 `mem:noel:1`、`mem:noel:3` 時是 2。
  - `group ids are kind group, capped at twelve, heavy`。
  - `GROUP_GATE matches the cast table`：逐項等於 spec §5.2。
  - `ui2/story.test.ts` › `linesOf reads a companion's full from the pieces told`：用 `chat:sylvie:2`，持有 5、說過 4 時是「未集滿」的那一句。
  - `handbook.test.ts` › `a person's page opens by the pieces told`。
- [ ] **Step 2：執行**。新測試因為沒有這些函式或型別而失敗。
- [ ] **Step 3：實作**。
  - `gateOpen` 的 `full`／`pieces` 改用 `storyPieces`；`met` 用 `s.party.recruited`。
  - `onReturn` 的歸鄉、`linesOf` 的 `full`、手冊的段落數都改用 `storyPieces`。
  - 揭露（`events.ts:54`）照舊讀 `memoriesOf`，不改。
- [ ] **Step 4：改已知會紅的測試**（裁定 1、2），跑全套。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): story L — lines and gates read the memories told, and the group scenes have ids and gates`。

---

### Task 2a：拾取記成「未說」（引擎與存檔）

**Files:**
- Modify:
  - `engine/state.ts:29-47`；
  - `engine/save.ts:89-101`、`:141` 附近；
  - `engine/game.ts:137`、`:341-361`、`:1191-1204`；
  - `engine/story/events.ts:60-64`（第九片）、`:312-336`（`sceneDone`）。
- Test：`engine/game.test.ts`、`engine/save.test.ts`、`engine/story/events.test.ts`。
- 已知會紅（改成新的行為）：
  - `game.test.ts`：
    - :2349 `the first trip down the main road finds Rin's first memory`；
    - :2401 `the second memory on a floor waits in the handbook`；
    - :2473、:2484（深度 25 的補片）；
    - :3298 `a dungeon memory is done from pending…`；
    - :3319 `a pending memory is dropped…`；
    - :3686 `a queued piece of someone else stays queued`。

**Interfaces:**
- Consumes：Task 1 的 `toldCount`。
- Produces：
  - `StoryState.untold?: SceneId[]`、`StoryState.tonight?: SceneId[]`（選用，缺少讀成 `[]`）；
  - `Game.tellEarly(id: SceneId): boolean`：`id` 在 `untold` 裡時，把它寫進 `seen`（不寫 `fresh`），從 `untold` 與 `tonight` 拿掉，在城裡就存檔，回傳 `true`；否則回傳 `false`，什麼都不改。
  - 介面暫時不動：`FragmentGain.play` 這時一律是 `false`，所以迷宮與結算什麼都不播；欄位在 Task 2b 刪掉。

- [ ] **Step 1：寫失敗的測試**
  - **`game.test.ts`**（新 `describe('story L: pieces wait to be told (Task 2a)')`）：
    - `every piece taken goes to untold in pickup order, and none is pending`：
      - 一個光點拿到凜的一片、首領拿到洛恩的一片；
      - `story.untold` 依序是兩者；
      - `pending` 沒有 `mem:`；`seen`、`queue`、`fresh` 都沒有它們。
    - `a piece still counts at once: memoriesOf and the memory stats rise at pickup`：拾取前後比較 `memoriesOf` 與 `memoryStats`（`engine/party.ts:71`）。
    - `the depth-25 top-up waits in untold, in piece order`。
    - `the finale fight's hero pieces are the finale's; anyone else's waits in untold`。
    - `tellEarly tells an untold piece: seen, not new, out of untold and tonight; anything else is refused`。
  - **`save.test.ts`**：
    - `untold and tonight save and load; absent reads as empty`。
    - `a save is refused when untold repeats, is seen, is queued, is not a memory, or is past what she holds; or tonight is outside untold`：六種壞資料各一筆。
  - **`events.test.ts`**：
    - `sceneDone takes a memory out of untold and tonight`。
    - `the lone morning counts a ninth piece still untold`。
- [ ] **Step 2：執行**。失敗的理由是欄位與函式不存在。
- [ ] **Step 3：實作**。
  - `takePieces`：保留 `finale && hero` 的分支，其餘一律 `(story.untold ??= []).push(scene)`，`play: false`。刪掉 `run.played` 的讀寫（欄位本身留到 2b）。
  - `Game.pending` 只收 `town:`。
  - `isValid` 檢查 `untold` 的 `k ≤ memoriesOf(c)`，而且 c 已相遇。
- [ ] **Step 4：執行**全套（含下潛快照）、閘門 `gate-2a`。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): story L — a memory piece waits to be told; its effects still land at pickup`。

---

### Task 2b：迷宮與結算只留字幕（介面與 e2e）

**Files:**
- Modify:
  - `engine/story/memories.ts:15-18`（刪 `play`）；
  - `engine/dungeon/run.ts:51-52`、`:61`（刪 `played`）；
  - `ui2/scenes/dungeon.ts:64-65`、`:103`、`:271`、`:280-332`；
  - `ui2/scenes/battle.ts:580-600`、`:668-677`；
  - `ui2/battleText.ts:60-67`；
  - `data/text.zh-TW.ts:274-278`。
- Test：`ui2/scenes/dungeon.test.ts`、`ui2/scenes/battle.test.ts`、`tests/e2e/starlantern.spec.ts`（Task 0 Step 4 記下的地方）。
- 已知會紅：
  - `dungeon.test.ts`：:676、:727、:746。
  - `battle.test.ts`：:354、:1016、:1032、:1041、:1052、:1117。

**Interfaces:**
- Produces：
  - `FragmentGain` 的 `piece` 是 `{ kind: 'piece'; id: CharacterId; n: number }`；
  - `T.ui2.memory.recalled(name: string): string`（裁定 4）。

- [ ] **Step 1：寫失敗的測試**
  - **`dungeon.test.ts`**：
    - `a glimmer's piece shows one caption and plays no scene`：畫面上出現「凜想起了什麼。」，沒有 `slx-memory`，`sceneDone` 沒有被呼叫。
    - `leaving the floor waits for no memory`。
  - **`battle.test.ts`**：
    - `a won fight lists one caption for each one who remembered`：洛恩一次拿三片，只有一行。
    - `the result leaves at once with no memory, or after the rescue and the rune tutorial`。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**。
  - 迷宮刪掉 `memory`、`waitingMemories`、`flushPending`；`beforeLeaving` 直接 `go()`。
  - 結算刪掉 `memoriesToPlay`、`playMemories`；招募 → 符文教學 → 離開。
  - `fragmentLines` 依裁定 4 輸出字幕。
- [ ] **Step 4：e2e**：Task 0 Step 4 記下的期待改成字幕。再新增 e2e `a memory found in the labyrinth shows its caption and the map stays (story L)`，插在 `two start, meet Selene, recall her`（約 3202 行）後面。
- [ ] **Step 5：執行**全套、e2e、閘門 `gate-2b`。
- [ ] **Step 6：收尾 G，commit**：`feat(starlantern): story L — a memory found in the labyrinth is a caption`。

---

### Task 3a：今晚怎麼挑（`nights.ts` 與調性）

**Files:**
- Create：
  - `engine/story/nights.ts`、`engine/story/nights.test.ts`；
  - `data/story/tone.ts`、`data/story/tone.test.ts`。
- Modify：
  - `ui2/story.ts:47`（`HAPPY` 改成從 `tone.ts` 匯入）；
  - `data/story.zh-TW.ts`（`NIGHT_BEATS` 的型別，內容由 Task 8 寫，這裡是空池）。

**Interfaces:**
- Consumes：
  - Task 1 的 `storyPieces`、`gateOpen`；
  - Task 2a 的 `untold`；
  - 既有的 `nextChat`、`nextBanter`、`CHAT_GATE`、`BANTER_GATE`、`BANTER_COUNT`、`CLOSING_PIECES`。
- Produces（`data/story/tone.ts`）：
  - `WARM_MOODS: ReadonlySet<StoryMood>`（同 `HAPPY`）；
  - `memoryTone(id: SceneId): 'warm' | 'heavy'`：任何讀法裡有一句的 `mood` 在 `WARM_MOODS`，而且 `id` 不在 `CLOSING_PIECES`，就是 `warm`。
- Produces（`engine/story/nights.ts`；spec §4.3、§4.4、§4.4.1）：
  - `interface NightPlan { before: SceneId[]; night: SceneId[] }`：`before` 是必需回憶，放在白天清單的最前面。
  - `owedPieces(s: GameState, day: SceneId[]): SceneId[]`：照 spec §4.3 的表，依拾取順序，洛恩與凜交錯：
    - `day` 有 `act2`、`act3`、`act4`、`bellkeeper-arrives` 時：洛恩與凜所有未說的；
    - `day` 有 `rin-reveal`、`rin-confess` 時：只有凜的；
    - `story.queue` 有 `hero-alone` 時：再加上洛恩片號 ≤ 9 的未說碎片；
    - 都沒有就回傳 `[]`。
  - `nightCap(backlog: number): number`：`backlog` 是 0 時回傳 0，否則 `Math.min(3, Math.max(1, Math.ceil(backlog / 3)))`。
  - `continuing(s: GameState, c: CharacterId, day: SceneId[]): boolean`：spec §4.4 第二層的兩個條件。
  - `pickMemories(s: GameState, day: SceneId[], n: number, exclude?: SceneId[]): SceneId[]`：照 §4.4 的三層順序與 §4.3 的疲勞保護，挑最多 `n` 段。
  - `planNight(s: GameState, day: SceneId[]): NightPlan`：
    - `before = owedPieces(s, day)`；
    - `day` 有 `rin-reveal` 或 `rin-confess` 時，`night = []`；
    - 否則 `night = pickMemories(s, day, nightCap(backlog), before)`，`backlog = untold.length - before.length`。
  - `restoreNight(s: GameState, day: SceneId[]): NightPlan`：讀 `story.tonight` 裡還沒在 `seen` 的；符合 `owedPieces` 規則的放 `before`，其他放 `night`。
  - `type NightBeats = { lines: ScriptLine[] }`：依 spec §4.4.1 的固定順序排好的一列；`NIGHT_BEATS` 預設空。
  - `nextBeat(s: GameState, prev: SceneId, next: SceneId, pool?: NightBeats): { line: ScriptLine; at: number } | null`：從 `story.beat ?? 0` 往後找第一句符合的，回傳它與它的位置；池是空的就回傳 `null`。
  - `eveMemories(s: GameState): SceneId[]`：`pickMemories(s, [], 3)`，只挑夥伴的碎片。

- [ ] **Step 1：寫失敗的測試**（`nights.test.ts`；審查修正第 1 項：每個期待兩段的情境，積壓至少 4；每個期待三段的情境，積壓至少 7。每則都寫出積壓的段數）
  - `Lorne and Rin first`：
    - `untold` 依序是 `mem:selene:2`、`mem:hero:3`、`mem:rin:4`、`mem:safira:2`、`mem:noel:1`（積壓 5，上限 2）；
    - 平常的回城播 `['mem:hero:3', 'mem:rin:4']`。
  - `with a backlog of three, only Lorne plays`：只有前三片時（上限 1），播 `['mem:hero:3']`。
  - `a companion in today's chat, banter or group scene goes ahead of one who waited longer`（積壓 ≥ 4）。
  - `a companion whose next piece opens her next banter goes ahead`（積壓 ≥ 4）：諾艾兒說過 2、`mem:noel:3` 未說、`banter:noel-selene:2` 的閘門是 `pieces: { noel: 3 }`；她排在等更久的莎菲拉前面。
  - `waited longest is pickup order, then roster order`。
  - `nightCap follows the backlog`：0→0、1→1、3→1、4→2、6→2、7→3、30→3。
  - `the cap leaves out the owed pieces`：未說的有洛恩兩片、夥伴五片，白天有 `act3`：`before` 是洛恩兩片，`night` 是兩段（積壓 5）。
  - `owed pieces play before the act that needs them, Lorne and Rin interleaved`。
  - `Rin's untold pieces all play before her reveal, beyond the cap; Lorne's wait`（審查修正第 6 項）：凜兩片、洛恩一片、夥伴四片未說，白天是 `['rin-reveal']`：`before` 是凜兩片，`night` 是 `[]`，洛恩那一片還在 `untold`。
  - `the confession day owes only Rin's, and plays nothing else`。
  - `while the lone morning is queued, Lorne's ninth is owed on any arrival`（審查修正第 11 項）：白天只有一段閒聊，`mem:hero:9` 在 `before`。
  - `never the same one twice in a row; a companion once a night; Lorne or Rin at most twice, apart`（積壓 ≥ 7）。
  - `three a night hold a warm one when a warm candidate exists`（積壓 ≥ 7）：前三名都是 `heavy`、第四名是 `warm` 時，第三段換成它。
  - `a closing piece plays last`（積壓 ≥ 4）。
  - `a beat is the first fitting line from the cursor: never a memory's owner, an unmet one skipped, narration always fits; the cursor wraps`。
  - `a beat is the same after a reload`：同樣的 `story.beat` 與前後 id，同樣的一句。
  - `eveMemories picks up to three companions' pieces by the night order`（積壓 ≥ 7）。
  - `planNight is pure: the same state gives the same plan, nothing written, no rng`（比較 `JSON.stringify(s)` 前後）。
  - **`tone.test.ts`**：
    - `a memory with a glad face is warm, unless it closes a chain`；
    - `every memory has a tone`（掃 `SCENE_IDS` 裡的 `mem:`）。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**。
  - 演算法照 spec §4.3、§4.4：
    - 候選：每人最小片號的那一片；洛恩、凜再加一片相鄰的。
    - 依（層級、`untold` 的位置、`CHARACTER_IDS` 的位置）排序。
    - 逐一放進今晚，跳過同一位夥伴的第二段，以及洛恩、凜的第三段。
    - 滿三段而沒有 `warm` 時，第三段換成排名最前的 `warm`。
    - 收尾的碎片移到最後；同一人相鄰時，和下一個不同人的那一段交換。
  - `continuing` 的第二條：用 `{ ...s, story: { ...s.story, seen: [...seen, 她的這一片] } }` 重算 `nextChat`／`readyPairs` 的閘門。不要另寫一套閘門。
- [ ] **Step 4：執行**單檔與全套。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): story L — the night planner, by backlog, owed pieces first`。

---

### Task 3b：把今晚接進 `Game`，以及重新讀檔

**Files:**
- Modify：
  - `engine/state.ts`（`beat?: number`）、`engine/save.ts`（`beat` 的檢查）；
  - `engine/game.ts:139`、`:165-195`（`boot`、`fresh`）、`:1191-1204`、`:1217-1221`（`arrive`）、`:1239-1258`（`finalePieces`）。
- Test：`engine/game.test.ts`、`engine/save.test.ts`。
- 已知會紅：`game.test.ts` :3508 `memories still queued from depth 25 play before the finale`，改成「未說的洛恩碎片進終幕清單」。

**Interfaces:**
- Consumes：Task 3a 的 `planNight`、`restoreNight`、`nextBeat`。
- Produces（`Game`）：
  - `night: SceneId[]`（不存檔）；
  - `arrive`：
    - 先寫 `story.tonight = [...before, ...night]`；
    - 再設 `arrival = [...before, ...day]` 與 `night`；
  - `boot` 用 `restoreNight`；
  - `sceneDone` 把 `night` 也當作到期；
  - `takeBeat(prev: SceneId, next: SceneId): ScriptLine | null`：呼叫 `nextBeat`，把 `story.beat` 移到下一句，在城裡存檔。
  - `finalePieces`：把 `untold` 裡的 `mem:hero:` 併進 `queued`，從 `untold` 與 `tonight` 拿掉。

- [ ] **Step 1：寫失敗的測試**（`game.test.ts` 新 `describe('story L: the night in the game (Task 3b)')`）
  - `a return plans the night and saves it in tonight`。
  - `a reload mid-night plays the rest of tonight, no more`：播完第一段後存檔，`Game.boot` 的 `night` 只剩後面的。
  - `a new return replaces tonight; what was not played stays untold`。
  - `a lamp return and a wipe have a night too`。
  - `owed pieces lead the arrival, ahead of the act`。
  - `untold hero pieces join the finale's list in piece order and leave untold`。
  - `takeBeat moves the cursor and saves it; a reload gives the next line, not the same one`。
  - `save.test.ts` › `beat saves and loads; a cursor past the pool is refused`。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**。
- [ ] **Step 4：執行**全套、閘門 `gate-3b`。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): story L — each return plans its night and a reload keeps it`。

---

### Task 3c：城裡的夜晚（介面與 e2e）

**Files:**
- Modify：
  - `ui2/story.ts:122-212`（`place` 選項）；
  - `ui2/scenes/town.ts:80-104`；
  - `data/story.zh-TW.ts:115-127`（匯出 `NIGHT_PLACE`）。
- Test：`ui2/scenes/town.test.ts`、`ui2/story.test.ts`、`tests/e2e/starlantern.spec.ts`。
- 已知會紅：`town.test.ts` :285 `arrival scenes play before the menu`，多了夜晚，順序改成白天 → 通知與當天的一句 → 夜晚。

**Interfaces:**
- Consumes：Task 3b 的 `Game.arrival`、`Game.night`、`Game.takeBeat`。
- Produces：
  - `playScene(talk, id, ctx, o?: { place?: Place })`、`playAndRecord(talk, id, ctx, o?: { place?: Place })`；
  - `NIGHT_PLACE: Place`。

- [ ] **Step 1：寫失敗的測試**
  - **`town.test.ts`**：
    - `the night plays after the day's lines, under the night card`：
      - 順序是白天場景 → 通知 → 當天的一句 → 夜晚；
      - 夜晚期間 `.slx-place` 是「月影旅館・夜」，暗幕在。
    - `a beat sits between two night memories, with its speaker's plate`。
    - `owed pieces play first under the night card, then the act with its own card`。
    - `the reveal's night: Rin's pieces, then the reveal, then the day's line`。
    - `the story setting skips the night but keeps it new`：`mode: 'major'` 時今晚的回憶是 `auto`，`fresh` 有它。
  - **`ui2/story.test.ts`**：`a place given to playScene shows from the first line, and a line's own place replaces it`。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作 `TownScene.arrive`**：
  - `game.arrival` 播完（必需回憶用 `NIGHT_PLACE`）；
  - `says` 播完（改成 `await`）；
  - `game.night` 逐一用 `playScene(id, { place: NIGHT_PLACE })` 播（群戲用它自己的地點卡，見 Task 5），兩段回憶之間說 `game.takeBeat` 的那一句（有名牌與頭像，旁白沒有）。
- [ ] **Step 4：e2e** 新增，插在 Task 2b 那一則後面：
  - `a memory found in the labyrinth is told that night in town, under the night card (story L)`：
    - 用 debug 鉤子給凜一片未說的碎片，再用歸還之燈回城；
    - 斷言：回憶的文字出現時 `.slx-place` 是「月影旅館・夜」；播完才看得到城鎮選單。
  - 同一則在 390×844 觸控側置（`asPhone`）也跑一次：每一句 `.slx-talk .slx-text` 的 `scrollHeight <= clientHeight + 1`。
- [ ] **Step 5：執行**全套、e2e。
- [ ] **Step 6：收尾 G，commit**：`feat(starlantern): story L — memories are told at night in town, under the night card`。

---

### Task 3d：下潛前的那一夜

**Files:**
- Modify：
  - `data/story/scenes.ts`（`finale-eve`：`MajorScene`、`MAJOR_SCENES`、`MAJOR_CAPS` 2、`DEPARTURE_SCENES`）；
  - `data/story.zh-TW.ts`（`MAJOR_TITLES['finale-eve']` 是「下潛前的那一夜」；`SCRIPT['finale-eve']` 一句框架旁白，由 Task 8 定稿，這裡先寫 spec §4.8 的例句）；
  - `engine/story/events.ts:60-65`（`onReturn` 排進 `finale-eve`）；
  - `engine/game.ts:228-237`（`departScene` → `departScenes`）、`:149`、`:1239-1258`（`finalePieces` 的退路）；
  - `ui2/scenes/gate.ts:273`（依序播出發的戲）；
  - `ui2/scenes/clear.ts`（退路時的一拍）。
- Test：`engine/story/events.test.ts`、`engine/game.test.ts`、`ui2/scenes/gate.test.ts`、`ui2/scenes/clear.test.ts`、`data/story/story.test.ts`。
- 已知會紅：`game.test.ts` :222、:232、:3646（`departScene` 改名；`hero-alone` 的規則不變）。

**Interfaces:**
- Consumes：Task 3a 的 `eveMemories`；Task 3b 的 `Game.takeBeat`。
- Produces：
  - `Game.departScenes(): SceneId[]`：取代 `departScene`。
    - `finale-eve` 在隊列、在城裡、沒有 `ALONE` 在等時，它排第一；
    - 接著是 `hero-alone`（原本的條件）。
  - `Game.eve: SceneId[]`（不存檔）：`finale-eve` 說完時由 `eveMemories` 算出，並從 `untold`、`tonight` 拿掉；`sceneDone` 把它們當作到期。
  - `finalePieces`：`finale-eve` 還沒說過時，回傳 `['finale-eve', ...eveMemories, ...acts, ...confess, ...keeper, ...hero pieces]`，接著才是 `finale`。

- [ ] **Step 1：寫失敗的測試**
  - **`events.test.ts`**：
    - `the eve is queued once her choice is made and the main road reaches twenty-six, never on an arrival`；
    - `not before her choice, nor below twenty-six`。
  - **`game.test.ts`**：
    - `the first departure after it is queued plays the eve, then up to three companions' memories, under the night card`；
    - `the eve comes before the lone morning when both are owed`；
    - `a reload after the eve's line: it does not play again, and its unplayed memories stay untold`；
    - `the finale falls back to the eve first, then the acts, the confession and the keeper, then Lorne's pieces, then the finale`。
  - **`gate.test.ts`**：`departing plays each departure scene in order under its card, then leaves`。
  - **`clear.test.ts`**：`the fallback eve has a beat between two memories`。
  - **`story.test.ts`**：`the eve is one narration line, titled 下潛前的那一夜`。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**。
- [ ] **Step 4：執行**全套、e2e、閘門 `gate-3d`。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): story L — the night before the descent, on the last departure`。

---

### Task 4：手冊的「新」與提早讀

**Files:**
- Modify：
  - `engine/story/handbook.ts:17`、`:52-61`；
  - `ui2/scenes/handbook.ts:113-133`、`:279-300`。
- Test：`engine/story/handbook.test.ts`、`ui2/scenes/handbook.test.ts`。
- 已知會紅：
  - `handbook.test.ts` :291 `a piece is replayable only when it is found and seen…`；
  - `ui2/scenes/handbook.test.ts` :85 `a found piece still waiting in the queue is not replayable…`。
  - 兩則都改成「未說的也可以讀，而且標新」。

**Interfaces:**
- Consumes：Task 2a 的 `Game.tellEarly`；Task 3a 的 `restoreNight`。
- Produces：`PiecePage` 加 `untold: boolean`。可播的條件是 `seen || untold`；新的條件是 `fresh || untold`。

- [ ] **Step 1：寫失敗的測試**
  - `handbook.test.ts` › `an untold piece is playable and new; a character row is new while any is`。
  - `ui2/scenes/handbook.test.ts`：
    - `playing an untold piece tells it: seen, not new, out of untold`；
    - `a piece told early in the handbook is skipped that night`：在迷宮裡讀了 `tonight` 的第一段，回城後 `night` 只剩後面的（用 `restoreNight`）。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**。重播一段未說的回憶後呼叫 `tellEarly`；一段已說的，照舊 `markRead`。
- [ ] **Step 4：執行**全套、e2e。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): story L — the handbook marks untold memories new and lets them be read early`。

---

### Task 5：反應槽

**Files:**
- Modify：
  - `engine/state.ts`、`engine/save.ts`（`reacts`）；
  - `engine/story/events.ts:45-74`（`onReturn` 推進 `reacts`）、`:256-274`（`arrivalScenes`）、`:312-336`（`sceneDone` 寫入與刪除 `reacts`）；
  - `engine/game.ts:1217-1221`（`arrive` 把群戲移到夜晚的第一項）；
  - `ui2/story.ts:25-30`（`shouldPlay` 在 `major` 時也播群戲）；
  - `ui2/scenes/town.ts`（群戲用自己的地點卡，不套 `NIGHT_PLACE`）。
- Test：`engine/story/events.test.ts`、`engine/game.test.ts`、`engine/save.test.ts`、`engine/story/nights.test.ts`、`ui2/story.test.ts`、`ui2/scenes/town.test.ts`。

**Interfaces:**
- Consumes：Task 1 的 `GROUP_GATE`、`REACTIONS`、`gateOpen`、`gateExpired`；Task 3a 的 `continuing`。
- Produces：
  - `StoryState.reacts?: Partial<Record<GroupScene, 0 | 1>>`（spec §5.2、§11）；
  - `nextReaction(s: GameState, day: SceneId[], reactions?: Partial<Record<ActNode, GroupScene>>, gates?: Record<GroupScene, StoryGate>): GroupScene | null`：
    - 依 `ACT_NODES` 的順序；
    - 候選：它那一幕在 `day` 裡，或它在 `story.reacts` 裡；
    - 跳過：已說的、`gateExpired` 的（第三幕的 `beforeChoice`）；
    - 跳過：`day` 裡有它那一幕的**下一幕**的（spec §5.2 的規則）；
    - 閘門要成立。
  - `arrivalScenes(s, o)` 的 `o` 多一個 `reactions?`（測試注入用）：
    - 有群戲時，回傳 `[...list, group]`，沒有回城對話也沒有閒聊；
    - `ALONE` 的到站不填反應槽；
    - `chat: false` 也填。
  - `sceneDone`：
    - 一幕說完，`reactions` 裡有它的群戲時，寫入 `reacts[group] = 0`；
    - 群戲說完，刪掉它。
  - `onReturn`：`reacts` 裡的 0 改成 1，1 刪掉。
  - `Game.arrive`：清單最後若是群戲，把它移到 `night` 的第一項（spec §4.5）。

- [ ] **Step 1：寫失敗的測試**（全部注入 `reactions = { act2: 'group:act2', act3: 'group:act3', act4: 'group:act4' }`）
  - `group:act2 plays on the arrival act2 plays, its cast met, and takes the chat and banter`。
  - `a group scene waits for its cast one more return, then expires`。
  - `a group scene's second chance is lost when the next act plays`：用注入的 `day` 清單測（審查修正第 12 項：主線一次到站只播一幕，所以不測兩幕同一次到站）。
  - `group:act3 expires on Rin's choice`。
  - `no reaction on a reveal or a confession arrival, and that arrival spends a chance`。
  - `a reload fills the reaction slot but no chat`。
  - `the finale's list never holds a group scene`。
  - `the group scene is the night's first item, after the day's notices`（`game.test.ts` 與 `town.test.ts`；審查修正第 7 項）。
  - `a group scene's companions are continuing that night`（`nights.test.ts`）。
  - `save.test.ts` › `reacts saves and loads; a seen or unknown group, or a value other than 0 and 1, is refused`。
  - `ui2/story.test.ts` › `a group scene plays under major only`。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**。
- [ ] **Step 4：執行**全套、e2e、閘門 `gate-5`。
- [ ] **Step 5：收尾 G，commit**：`feat(starlantern): story L — a reaction slot after each act, two chances, the first thing of the night`。

---

### Task 6：腳本實測

**Files:** Modify `engine/story/events.test.ts:950-1040`（`scriptedPlay`）。

- [ ] **Step 1：改寫 `scriptedPlay`**：
  - 拿掉裁定 2 的「立刻說過」；
  - 改成每次回城：`onReturn` → `arrivalScenes`（注入三場群戲的 `reactions`）→ `planNight` → 依序 `sceneDone`；
  - 出發時照 `Game.departScenes` 的規則播 `finale-eve`（加上 `eveMemories`）與 `hero-alone`；
  - 碎片照 `memoryPace` 進 `untold`（依深度與 `CHARACTER_IDS` 排）；
  - 洛恩深度 25 的補片也進 `untold`；
  - 新參數 `route: 'all' | 'mainline-first'`：
    - `'all'`（原本的行為）：每位夥伴在她的 `MEETINGS` 深度相遇；
    - `'mainline-first'`：只有本道的瑟蕾、波比在她們的深度相遇；其他人在本道到第十六層之後的第一次回城才一起相遇，模擬先把本道走到第四幕的玩家（審查修正第 3 項）。
  - 每一拍呼叫 `nextBeat`，記錄拍數。
- [ ] **Step 2：既有的兩則腳本測試**照原門檻跑：
  - `every payoff banter plays before the finale`；
  - `a return every second depth: every payoff by the finale or within three returns after it`，含 `before.length` 與 `[102, 103]` 的釘子。
  - 不放寬。紅了就停下來回報 NEEDS_CONTEXT，附上 `trace`，不改排程規則。
- [ ] **Step 3：新增測試**【控制者裁定 2026-10-23】
  - **三種玩家**：每層回城（1, 2, …, 29）、每兩層（1, 3, …, 29）、每三層（1, 4, …, 28），都走 `'all'`。
    - 最後一次回城之後，照 Game 的終幕，跑 `finalePieces` 的補播（含退路的下潛前的那一夜）。
  - 每種玩家各一則測試：
    - `scripted play (<玩家>): unplayed memories after the finale ≤ <上限>`：上限分別是 3、8、15。
    - `scripted play (<玩家>): no night plays more than three memories beyond the owed ones`。
    - `scripted play (<玩家>): no owed memory is ever late`：
      - 每一次播第二、三、四幕或鐘守時，洛恩與凜持有的每一片都已在 `seen`；
      - 播揭露、坦白時，凜持有的每一片都已在 `seen`；
      - `hero-alone` 播時 `mem:hero:9` 在 `seen`。
  - `scripted play: every group scene plays, each on its act's arrival`（每層回城、`'all'`）。
  - `scripted play (mainline-first): the group scenes played are recorded`：只記錄、不設門檻，寫進報告交給使用者（spec §5.2）。
  - `scripted play (every floor): the beats of one playthrough fit the pool`：拍數 ≤ `NIGHT_BEATS` 的句數（spec §4.4.1；Task 8 之前池是空的，這一則用 spec 的四十句當上限）。
  - 實測的段數、每晚段數的分布、拍數、每一則 `trace` 記進 SDD `task-6-report.md`。
- [ ] **Step 3b：達不到就停**：任何一個門檻沒達到，停下來回報 BLOCKED，附上 `trace` 與實測數字。不改上限公式、不改疲勞保護、不改門檻。
- [ ] **Step 4：收尾 G，commit**：`test(starlantern): story L — scripted plays through the nights, the eve and the reaction slot`。

---

### Task 7：寫作的準備：聖經、帳本、無名牌朗讀稿、群戲的形狀守門

**Files:**
- Modify：
  - `docs/superpowers/story/starlantern-style-bible.md`（§3 希爾薇、千鶴；新增「群戲」一節；§1.3 回憶的「現在」改成夜晚）；
  - `docs/superpowers/story/starlantern-lore-ledger.md`；
  - `data/story/readAloud.ts`、`data/story/readAloud.test.ts`；
  - `data/story/voiceGates.ts:170-177`；
  - `data/story/story.test.ts`；
  - `data/story.zh-TW.ts:96-99`（`GROUP_TITLES`）。

**Interfaces:**
- Produces：
  - 環境變數 `STORY_DUMP_BLIND=1`：名牌一律印成「？：」，每段隨機抽十句說話的台詞編號 `[1]`…`[10]`。抽法用固定種子，不用 `Math.random`。答案另外寫到 `<STORY_DUMP>.key.md`，不給讀者。
  - `GROUP_TITLES: Record<GroupScene, string>`（spec §5.1 的三個標題）。
  - `VOICE.sylvie`：`{ mark: SENTENCE_PARTICLE('[啦欸]'), maxShare: 0.2, heavyNone: true }`，取代 `never`。
  - 測試 `every registered group scene has eight to twelve lines, one reading, three to five speakers with Lorne, all met by its gate`：讀 `REACTIONS`，這時是空的，所以先綠；Task 9 註冊之後才真的檢查。

- [ ] **Step 1：寫失敗的測試**：
  - `readAloud.test.ts` › `the blind dump shows no plate and keeps a key apart`；
  - `voice.test.ts` › `Sylvie may say 啦 or 欸 in a fifth of her lines, none in a heavy scene`（取代原本「完全不用」那則的斷言；自我測試 :229 改成「預算內通過、超過預算失敗」）；
  - 群戲的形狀守門（上面）。
- [ ] **Step 2：執行**，確認紅。
- [ ] **Step 3：實作**，並更新聖經：
  - spec §7 的兩張聲音表，示範句照抄；
  - 群戲一節：spec §2.3 反目標、§6 的共同規則；
  - §1.3：回憶在夜晚播，「現在」那一半不指著迷宮。
- [ ] **Step 4：帳本新增條目**：
  - 群戲與夜晚播放的規則；
  - 「已說」的定義；
  - 新的 `CHAT_GATE` 項目要在加的那個任務寫理由。
- [ ] **Step 5：收尾 G，commit**：`docs(starlantern): story L — the bible's new Sylvie and Chizuru, the group scene rules, a blind read-aloud`。

---

### Task 8：夜晚化：回憶的「現在」那一半，以及夜晚的串場

照 W1–W8。鍵前綴：`scenes.mem:`、`nightBeats.`、`scenes.finale-eve.`（`storyTexts()` 在 W1 收進 `NIGHT_BEATS`）。

**新句數**【控制者裁定 2026-10-23；審查修正第 13 項】：共四十一句。
- `NIGHT_BEATS` 四十句，照 spec §4.4.1 的固定順序排：八位夥伴各四句（依 `CHARACTER_IDS`），最後是旁白八句；
- `finale-eve` 的框架旁白一句（定稿 Task 3d 的例句），照 spec §4.8。
- W1 的新測試 `the night beats: four a companion, eight narrations, light, no memory named, not dawn`：
  - 句數與順序正確；
  - 每句 ≤ 60 字，「……」最多一個、不放句首；
  - 不出現「天亮」「天快亮」「早上」「清晨」（拍子在夜裡）；
  - 不出現任何夥伴回憶的 `REVEALED` 詞；
  - 夥伴的句子照她的 `VOICE`。
- Task 6 的 `the beats of one playthrough fit the pool` 這時改用真的池再跑一次。
- W8 的讀者另外拿到一段「一晚三段回憶加兩拍」的朗讀稿，多答一題：「這一晚太重嗎？中間那兩句有沒有讓你喘一口氣，還是很突兀？」

**範圍**（spec §8；`b08d75191` 的行號）：
- `story:188`（`mem:rin:1`）；
- `story:689`（`mem:chizuru:1`）、`:725`（`mem:chizuru:5`）；
- `story:795`（`mem:safira:5`）；
- `story:822`、`:831`、`:832`、`:841`（希爾薇一到三）；
- `story:905`、`:913`（諾艾兒）；
- `story:1004`（`mem:bobby:5`）；
- `story:1043`（`mem:liz:2`）；
- `story:1114`、`:1145`（絲嘉蕾）。

另外，W2 的朗讀稿交給實作者，逐句檢查其餘約 120 句「現在」的台詞在「月影旅館・夜」念起來成不成立。

- **W1 的新測試**（`voice.test.ts`）`a memory's present lines do not point at the labyrinth (story L Task 8)`：
  - 範圍：`mem:*` 裡不是 `past` 的台詞；
  - 不可以出現 `/這片|這座|腳下|這一層|天頂/`（審查修正第 14 項；「這裡」與千鶴的「此處」不禁）；
  - 另附一則自我測試。
  - 既有的釘子（例：`mem:safira:5` 的 `/火海.*沙漠|沙漠.*火海/`、`mem:sylvie:1` 的 `/沼澤/`、`/林子/`）照樣要過。
- **W8 加一題**：「這些話是在晚上的旅館裡說的。哪一句聽起來像人還站在別的地方？」

---

### Task 9：群戲 `group:act2`「碎片的價錢」

照 W1–W8。照 spec §6.1 寫，八到十二句。

- **W1 紅**：
  - `REACTIONS.act2 = 'group:act2'`，把 `group:act2` 加進 `SCENE_IDS`；
  - `SCRIPT['group:act2']` 還沒寫，所以 `every scene has a title, a summary and lines` 與群戲的形狀守門會紅。
  - 新的釘子（`pinBeat('group:act2', {}, re)`）：
    - `/明天賣/`（凜）；
    - `/銅板/`（瑟蕾）；
    - `/袖/`（諾艾兒藏起一片，旁白）；
    - `/看得見又不說/`（諾艾兒對瑟蕾）；
    - `/自己說/`（洛恩接住銅板）。
  - 新守門 `Lorne keeps no shard in group:act2`：洛恩的台詞不出現「留著」「這一片我」（審查修正第 16 項）。
  - 鍵前綴 `scenes.group:act2.`。
- **W3 的要求**：
  - 第一句帶 `at(PL.innDinner, …)`；
  - 凜照選擇前的規矩；
  - 中段最多一個笑點；
  - 最後一句是旁白的畫面。
- **帳本**：諾艾兒藏起一片碎晶；瑟蕾那份收在瑪莎廚房的抽屜。
- **e2e**：`the depth scenes read inside the box, desktop and phone (story depth)`（約 3916 行）的場景清單加上 `group:act2`。

---

### Task 10：群戲 `group:act3`「問不問」

照 W1–W8。照 spec §6.2 寫。

- **W1 紅**：
  - 同 Task 9，換成 `act3`；
  - 釘子：
    - `/領口/`（希爾薇）；
    - `/不問/`（洛恩）；
    - `/四十二/`（凜）；
    - `/門邊/`（結尾）。
  - 新增守門 `group:act3 never ties the bell to the society, nor says 殺 or 刺客`：同一場不同時出現「鐘」與「靜鐘會」，也不出現「殺」「刺客」。
- **帳本**：希爾薇睡門邊，和凜「一人一半」。
- **W8 的第 3 題是及格條件**，用對照讀者判定（W8 的及格規則）。
- **e2e**：同 Task 9，加上 `group:act3`。

---

### Task 11：群戲 `group:act4`「桌上的錢袋」

照 W1–W8。照 spec §6.3 寫。

- **W1 紅**：
  - 同 Task 9，換成 `act4`；
  - 釘子：
    - `/錢袋/`（莉茲）；
    - `/燈芯，我去/` 或 `/我去/`（絲嘉蕾）；
    - `/自願下行/`（千鶴的歌）；
    - `/一個人的/`（洛恩）；
    - `/坐/`（莎菲拉先坐下）；
    - `/難過/`（莎菲拉對絲嘉蕾，審查修正第 16 項）；
    - `/天亮/`（結尾）。
  - 新增守門 `group:act4 never says he is the keeper`：不出現「你就是守燈人」一類（`/是守燈人/`）。
- **帳本**：千鶴的祭典歌只重述石碑的「自願下行」；莉茲的錢袋留在公會桌上。
- **e2e**：同 Task 9，加上 `group:act4`。

---

### Task 12：希爾薇重新定聲

照 W1–W8。照 spec §7.1。

- **鍵前綴**：
  - `meet.sylvie.`、`scenes.chat:sylvie:`、`scenes.home:sylvie.`；
  - `scenes.banter:bobby-sylvie:`、`scenes.banter:safira-sylvie:`、`scenes.banter:rin-sylvie:`、`scenes.banter:selene-sylvie:`。
- **W1 的新測試**：
  - `Sylvie's light lines talk food, weather, wind, tracks or prey in a third of them`：`SYLVIE_WORLD = /吃|乾糧|湯|餓|雨|風|天氣|冷|熱|腳印|足跡|下風|獵物|兔|鹿|鳥/`，放在 `voiceGates.ts`。
  - `chat:sylvie:2 waits for her memories told whole`：`CHAT_GATE['chat:sylvie:2']` 是 `{ full: 'sylvie' }`。
- **W3**：
  - 床位的鋪陳移到 `chat:sylvie:1`，`chat:sylvie:2` 只剩新芽的讀法；
  - `chat:sylvie:1` 不提波比，沒有 `if`；
  - 帳本寫 `CHAT_GATE` 的理由。
  - 既有的 `REVEALED`、`UNDONE`、「洛恩」稱呼守門照樣要過。
- **W8 第 4 題的十句**：從希爾薇、凜各抽五句。

---

### Task 13：千鶴重新定聲

照 W1–W8。照 spec §7.2。

- **鍵前綴**：
  - `meet.chizuru.`、`scenes.chat:chizuru:`、`scenes.home:chizuru.`；
  - `scenes.banter:bobby-chizuru:`、`scenes.banter:chizuru-rin:`、`scenes.banter:chizuru-safira:`、`scenes.banter:chizuru-scarlet:`、`scenes.banter:chizuru-noel:`；
  - 回憶 `scenes.mem:chizuru:` 只修文言腔。
- **W1 的新測試**：
  - `Chizuru's old-style markers are at most one a line and a quarter of her lines`：`CHIZURU_ARCHAIC = /此處|此物|莫非|甚好|謹以|何方|奉於/`，放在 `voiceGates.ts`。
  - `Chizuru never says 吾等, 謹以 or 奉於`。
  - `before her third piece is told she never says decades`：任何讀法裡，她 `full` 以外、沒有說過第三片的回城對話與閒聊，不出現「幾十年」。
  - `chat:chizuru:2 waits for Bobby`：`CHAT_GATE['chat:chizuru:2']` 是 `{ met: ['bobby'] }`。
- **W3**：
  - 時代落差的笑點（物價、消息、流行、「去年」「最近」）；
  - 被糾正時認為是別人消息慢；
  - 第三片說過以後的那一拍只用動作，不加讀法。
- **W8 第 4 題的十句**：從千鶴、絲嘉蕾各抽五句。

---

### Task 13b：四人盲聽

**Files:** 只寫 SDD。審查修正第 17 項，spec §14 第 4 點。

- [ ] **Step 1**：
  - 用 `STORY_DUMP_BLIND=1` 印一份四人稿：從希爾薇、千鶴、凜、絲嘉蕾的輕場景台詞裡，用固定種子各抽三句（共十二句）；
  - 答案另存 `task-13b-blind.key.md`。
- [ ] **Step 2**：控制者派一位全新的讀者，只給這份稿，請他猜每句是誰說的，並說出理由。
- [ ] **Step 3：及格**：十二句答對至少十句（≥ spec 的八成）。
  - 不及格時，讀者答錯的句子交回 Task 12 或 13 照 W3–W8 修改；
  - 修完之後，換一位新讀者重做一次。最多兩輪，之後交給控制者裁定。
- [ ] **Step 4**：報告附上答對率與答錯的句子，commit SDD 檔案，訊息 `chore(starlantern): story L four-voice blind read`。

---

### Task 14：終幕八句

照 W1–W8。照 spec §9。

- **前提**：Task 9–11 已 commit。
- **鍵前綴**：`scenes.finale.`。
- **W1**：
  - 改寫 `Task 14: the finale` 的 `every party hears sixteen lines…`（`story.test.ts:1617`），讀法改成 A／B／C：
    - 對每位夥伴，三種讀法各正好一句；
    - 組合時仍是十六句。
  - 新釘子：
    - 讀法 A 各一句：`/袖|藏/`（諾艾兒）、`/銅板|自己說/`（瑟蕾）、`/門邊/`（希爾薇）、`/拆/`（波比，而且同一句有 `/閥.*不回來的光/`）、`/錢袋|袋子/`（莉茲）、`/燈芯/`（絲嘉蕾）、`/歌/`（千鶴）、`/坐/`（莎菲拉）；
    - 讀法 B 的波比也要有 `/閥.*不回來的光/`；
    - 「交給燈」全場最多三句（既有規則）。
  - `the finale names every companion, met or not`（:1600）照樣要過。
- **W3**：
  - 讀法 A 的條件是 `{ seen: 'group:actN' }`；
  - 讀法 B 是 `{ met: c, notSeen: 'group:actN' }`，沿用現在「未集滿」那一句，只把稱呼寫掉；
  - 讀法 C 不動。
- **W8**：讀者拿到「三場群戲都看過」與「一場都沒看過」兩份朗讀稿，多答一題：「終幕這八句裡，哪幾句讓你想起前面的哪一場戲？」

---

### Task 15：分歧讀法減量

照 W1–W8。照 spec §10。

- **範圍**：
  - `chat:selene:2`；
  - `chat:scarlet:2`；
  - `hero-alone`；
  - `rin-confess` 的希爾薇那一句。
  - `chat:sylvie:*`、`chat:chizuru:2`、終幕已在 Task 12–14 做完。
- **W1 的新測試** `the script reads fewer ways (story L Task 15)`：
  - 全劇帶 `if` 的台詞 ≤ 102；
  - 逐場等於 spec §10 表的「之後」欄；
  - `chat:noel:2` 沒有 `CHAT_GATE` 項目，「沒遇見莉茲」的讀法還在（審查修正第 8 項）。
- **W3**：
  - 寫掉只為換稱呼的 `full`／`notFull`；
  - `CHAT_GATE` 的新項目寫進帳本；
  - 「任何人的第一段回城對話不設閘門」（`story.test.ts:855`）照樣要過。

---

### Task 16：驗收

**Files:** 只寫 SDD；有修正時照該任務的規則改。

- [ ] **Step 1**：全套、tsc、e2e 全綠。閘門錄 `gate-final`，對 `gate-0` 必須 `gate: identical`，`cmp` 沒有輸出。
- [ ] **Step 2：一整輪的朗讀稿**：
  - 用 Task 6 的每層回城腳本，把每一次到站實際播的場景依序印出（白天、群戲、夜晚），寫到 SDD `playthrough.md`；
  - 只印到第二十層。
- [ ] **Step 3：冷讀**。控制者派一位全新的讀者，只給 `playthrough.md`。題目：
  1. 哪裡讓你出戲？
  2. 每一場群戲之後，你記得誰和誰吵了什麼嗎？
  3. 哪一晚的回憶太多、太重，或放錯了時間？
  4. 到第十層，你確定凜是誰了嗎？
  - 及格條件同 W8。意見交給控制者裁定，修正回到所屬的任務。
- [ ] **Step 4：全分支審查**：控制者派一位全新的審查者，用 `superpowers:requesting-code-review` 的做法看整條分支對 `<BASE>` 的差異。重點：
  - 重新讀檔的一致性；
  - 閘門有沒有被放寬；
  - 戰鬥讀到的東西有沒有被搬到播放時；
  - 帳本與劇本是否一致。
- [ ] **Step 5**：報告附上 Task 6 量到的三種玩家的未說數字與每晚段數的分布（spec §13 風險 1），交給控制者轉告使用者。commit `chore(starlantern): story L acceptance`。
