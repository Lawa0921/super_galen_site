# 星燈迷宮 故事深度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把故事深度設計落地。先做引擎與資料：新的閘門形狀、句子條件、新的重大場景與它們的時段、舊存檔、閒聊排程。然後照遊玩順序，分段寫完全部劇情，每段都走朗讀審查。戰鬥與引擎的每一個數值都不動。

**Architecture:**
- **閘門統一成 `StoryGate`**（`data/story/scenes.ts`）。回城對話與閒聊共用這個形狀，`events.ts` 用同一個 `gateOpen` 檢查。`beforeChoice` 在凜選擇之後會「過期」：它不擋同一串後面的編號，自己也不會播。
- **句子條件**：加 `if.seen`／`if.notSeen`。`LineWhen.seen` 由 `ui2/story.ts` 從存檔帶入。
- **新的重大場景**：
  - `rin-confess`：獨播，在回城的晚飯。
  - `hero-alone`：在出發時播。這是一個新的播放點：`Game.departScene` 加上 `gate.ts` 的出發流程。
  - `epilogue`：終幕後第一次回城，排第一。
  - 一次回城最多播一場重的重大場景，其餘的留在佇列。
- ~~**舊存檔**：在 `Game.boot` 依序整理。換掉的閒聊編號用 `RENUMBERED` 加上 `story.ids` 版次處理，每份存檔只丟一次。~~（**使用者裁定，Task 4 之後：遊戲還沒上線，舊存檔不必相容。本條作廢**）同一輪遊戲裡讀檔的一致性照舊要顧（例如 `settleBellkeeper` 在選擇與坦白之間不動存檔）。
- **寫作**：沿用劇情打磨計畫的 R1–R8 與文風守門。設計稿的句子先由引擎任務原樣貼進資料，讓資料完整；之後由寫作任務照聖經定稿。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、Git Bash。

**Spec:**
- 主文件：`docs/superpowers/specs/2026-10-23-starlantern-story-depth-design.md`，下稱「設計 §」。
- 裁定：plan 8 帳本最後幾條。帳本在 `C:\Users\bag57\.codex\worktrees\4182\super_galen_site\.superpowers\sdd\2026-10-20-starlantern-plan8-skills\progress.md`，包括 (a)–(d) 與三個待定問題的裁定。
- 機制與規則沿用：`docs/superpowers/plans/2026-10-23-starlantern-story-polish.md`，下稱「打磨計畫」。它的 Task 1–7 已完成；**Task 8–16 由本計畫取代**。
- 動手前還要讀：
  - `docs/superpowers/story/starlantern-style-bible.md`，下稱「聖經」；
  - `docs/superpowers/story/starlantern-lore-ledger.md`，下稱「帳本」；
  - `docs/superpowers/specs/2026-10-18-starlantern-affinity-expressions-design.md`，下稱「好感 spec」。

> 路徑沒有以 `src/`、`tests/`、`docs/`、`scripts/`、`.superpowers/` 開頭的，都在 `src/scripts/games/starlantern/` 底下。
> SDD 紀錄目錄是 `.superpowers/sdd/2026-10-23-starlantern-story-depth/`（新的），下稱 SDD。打磨計畫的 SDD 是 `.superpowers/sdd/2026-10-23-starlantern-story-polish/`，下稱「舊 SDD」。
> 行號只用來定位，動手時一律用內容找。

## 計畫裁定

控制者已經裁定的，照帳本執行。下面標「設計者裁定」的，是設計與裁定都沒寫死、由本計畫決定的細節，每條附理由。

1. **控制者裁定（照抄）**：
   - 十片記憶的機制全部保留（屬性加成、深淵解鎖），終幕的代價只在敘事上。
   - `hero-alone` 用新的出發播放點。
   - `epilogue` 進主線，好感 spec §8.5 的句數預算跟著改。
2. **設計者裁定：舊 Task 8 的草稿（`舊 SDD/task-8-wip.patch`）拆開沿用**。
   - **閘門的改動採用**：助詞比例改成「某位說話者的台詞全部在 `POLISHED` 底下之後，才檢查她整份劇本的比例」，和「……」的說話者比例同一套（打磨計畫裁定 4）。不這樣做的話，客串的一兩句就會決定比例。舊 Task 8 就是被波比在千鶴對話裡的一句擋住的。
   - **草稿的自我測試第二則要改寫**：它斷言「全劇本範圍內波比的『喔』超過三分之一」，那是現在的資料。Task 10 改寫波比之後，它會自己翻掉。改成與資料無關的寫法（見 Task 1）。
   - **劇本的部分**（瑟蕾、千鶴的打磨，以及 `meet.selene` 的釘子放寬）當成 Task 8 的起點。只有 `mem:selene:5` 的那一段丟掉，因為設計 §7.4 整段改寫它。
   - 理由：閘門的改動是對的，只是自我測試綁在一次性的資料上；文字草稿已經過一輪打磨，丟掉是浪費。
3. ~~**設計者裁定：換編號只丟一次**~~（**使用者裁定，Task 4 之後：遊戲還沒上線，舊存檔不必相容。本條作廢**）。
   - `StoryState` 加一個可選欄位 `ids?: number`（劇情編號的版次）。`STORY_IDS = 2`，新遊戲就帶這個值。
   - 讀檔時，`(story.ids ?? 1) < STORY_IDS` 才把 `RENUMBERED` 從 `seen`、`fresh`、`queue` 拿掉，然後設成 `STORY_IDS`。
   - 理由：只照設計寫「讀檔就丟」，玩家聽過新的 `rin-sylvie:1` 之後，每次讀檔都會再丟一次、再重播一次。
   - 這不是存檔版本升級：沒有遷移，`isStory` 只多檢查「沒有，或是整數」。
4. ~~**設計者裁定：舊存檔的整理順序**~~（**使用者裁定，Task 4 之後：遊戲還沒上線，舊存檔不必相容。本條作廢**）（只保留第一點：`settleBellkeeper` 的防護，已在 Task 3 做好）。原本是 `settleLoneMorning(settleRenumbered(settleConfess(settleBellkeeper(settleOpening(state)))))`（`settleLoneMorning` 見裁定 6）。
   - `settleBellkeeper` 加一道防護：佇列裡有 `rin-confess`，就不動。新的流程裡，坦白播完才排鐘守。
   - `settleConfess`：凜已選擇，而 `rin-confess` 不在 `seen` 也不在 `queue`，這一定是舊存檔：把它算成看過，並標「新」。
   - 設計 §9.3 第 6 點的「過了選擇、鐘守還沒排入 → 正常排入坦白」在這個順序下不會發生：`settleBellkeeper` 先把那種存檔的鐘守算成看過了。在 `settleConfess` 的註解裡寫明。
5. **設計者裁定：回城時播什麼**（`arrivalScenes`）。
   - **獨播**：`ALONE = ['rin-reveal', 'rin-confess']`。佇列裡有其中一場，那一次只播它（揭露優先），回城對話與閒聊都延到下一次。
   - **一次一場重戲**：`HEAVY_MAJORS = act2、act3、act4、bellkeeper-arrives、epilogue`。排序後只留第一場，其餘留在佇列，下一次再播。回城對話與閒聊的規則不變（`HEAVY_ARRIVAL` 照舊擋閒聊）。
   - **幕要播過才算數**（審查 I2）：`storyStage` 只算「不在佇列裡」的幕節點。被延後、還在佇列的幕，不讓回城對話、閒聊、城鎮的今日一句、招呼、公會的線索提早換到下一幕。理由：`onReturn` 在幕播出之前就把節點寫進 `nodes`，一次一場重戲的規則會讓幕在佇列裡多等一次。改在 `storyStage` 本身，所有讀它的地方一起跟上，`town.ts` 不必改。手冊的真相頁本來就要求幕已看過，不受影響。
   - **重的那一次，回城對話優先給輕的**（設計 §7.7 規則 2）：清單裡有任何重場景（`isHeavyArrival`，包括 `mem:hero:9` 這種收尾片，也就是第九片那一次回城）時，回城對話先從不是重場景的對話裡挑（`heavyScene` 為 false 的，也就是不挑 `chat:rin:2`–`4`、`chat:hero:2`–`4`）；一個都沒有時才照舊挑。
   - **`hero-alone` 永遠不在回城時播**，只在出發時播。
   - 排序：`rin-confess` 是 3.4，`epilogue` 是 −0.5（排在佇列第一）。
6. **設計者裁定：`hero-alone` 何時排入**。
   - 條件：
     - `mem:hero:9` 已看過或已在佇列；
     - 凜已選擇；
     - `hero-alone` 沒看過，也沒排入；
     - 終幕還沒過。
   - 理由：第九片在第二十五層的頭目戰補給，會排進佇列，回城才播。只看 `seen` 的話，`hero-alone` 要再晚一次回城才排入；設計要的是「第九片之後的那一次出發」。
   - **能不能播，由 `departScene` 再把一次關**（審查 I1）。三個條件都成立才回傳 `hero-alone`：
     - `mem:hero:9` 與 `bellkeeper-arrives` 都已看過；
     - 佇列裡沒有 `ALONE` 的場景。
     - 不成立時，它留在佇列，等之後的出發。這樣它不會跑到第九片、或鐘守來到鎮上之前。
   - ~~**舊存檔**：已經看過第九片、條件都成立、卻沒排入的存檔，由 `Game.boot` 的 `settleLoneMorning` 排入。~~（**使用者裁定，Task 4 之後：遊戲還沒上線，舊存檔不必相容。本條作廢**）
7. **設計者裁定：出發的流程**。
   - `Game.departCheck(portal, startDepth)` 從 `depart` 抽出原本的三道檢查。`depart` 改用它，行為不變。
   - `gate.ts` 在玩家確定出發後：
     1. 先問 `departCheck`；
     2. 通過，而且 `departScene()` 有場景，就用 `FacilityScene.play` 播它；
     3. 播完才 `depart`。
   - 出發被拒絕時，場景留在佇列。
   - 劇情播放設定是「不播」時，照 `playAndRecord` 的規則算成自動跳過（看過，並標「新」）。
8. **設計者裁定：終幕前欠著的**。
   - `finalePieces` 的順序：欠著的幕 → `rin-confess`（還在佇列時）→ `bellkeeper-arrives` → 洛恩的回憶。
   - 佇列裡有 `bellkeeper-arrives`，或有 `rin-confess` 時，鐘守都排進去。後者的情況，是坦白播完時 `sceneDone` 才把鐘守排進佇列，這一場終幕自己會把它播掉。
   - `hero-alone` 若還在佇列，就直接算看過並標「新」：終幕已經回答了它；標「新」，是讓玩家在手冊裡讀得到。
9. **設計者裁定：閒聊的優先順序**。
   - **已開頭的配對**：自己有至少一段在 `seen` 裡。這種配對中有可播的下一段時，它優先於還沒開頭的配對。同一層級裡，照舊比「聽過最少」，再比 `BANTER_PAIRS` 的順序。
   - **過期的那一段**：照設計算進 `heard`，但不算「已開頭」。
   - **安靜的回城**播兩段，條件全部成立時才算：
     - 排序過濾後，佇列是空的；
     - 沒有回城對話；
     - 不是 `afterFinale`；
     - 有下一段可播的配對至少三組。
     - 第二段的挑法，當作第一段已經看過。
   - **預先授權一次退路**：Task 6 的腳本測試若有收尾段落不到第三十層之前，可以把「播兩段」放寬到有回城對話的非重回城，再跑一次。還是不行，就停下來回報 NEEDS_CONTEXT，附上每個收尾段的閘門打開的那一次回城、實際播出的那一次。
   - 原因若是某條記憶鏈在第三十層前根本集不滿（`memoryPace` 太短），那不是排程的問題：直接回報 NEEDS_CONTEXT，不改 `CHAINS`。
10. **設計者裁定：引擎任務原樣貼設計稿，寫作任務負責定稿**。
    - Task 2、Task 4 把設計 §7、§8 寫好的句子原樣貼進資料，這樣每個場景都有台詞，`written()` 與句數上限的測試都成立。
    - 搬到新編號的四段閒聊逐字不動。
    - 引擎任務不潤稿。設計稿裡會被守門擋下的句子，列在對應的寫作任務裡。
11. **設計者裁定：代價只在敘事上**。
    - 手冊的回憶標題、能重看與否、任何數值都不改。
    - 代價由 `finale` 的那一句與 `truths.after` 說出來。
    - 設計 §9.2 待定一提到的「標題改成（交給了燈）」不做，因為控制者裁定只在敘事上。
12. **設計者裁定：手冊放在哪裡**。
    - 凜的人物頁依序是 `prologue-inn`、`first-return`、`rin-reveal`、`rin-confess`、`bellkeeper-arrives`、`hero-alone`，然後是回城對話、閒聊。
    - 真相頁 `after` 依序重看 `finale`、`epilogue`。
13. **設計者裁定：終幕的句數**。
    - 打磨計畫裁定 7「終幕每一種讀法正好十二句」作廢。改成上限 16，最壞情況 15。
    - 「……」照重場景的預算：`max(1, floor(說話句數 / 4))`。
    - 打磨計畫 Task 14 的測試 `the finale's turn is said…` 由 Task 16 的新測試取代。
    - 打磨計畫裁定 7 裡「鐘守的高潮由他自己說」照舊。
14. **設計者裁定：只在選擇之後播的場景**。
    - `AFTER_CHOICE = finale、rin-confess、bellkeeper-arrives、hero-alone、epilogue`。這些場景的讀法固定 `oath: true`，`voiceGates.sceneReadings` 與 `story.test.ts` 的句數上限測試共用這組。
    - 揭露的 `rinSecretAllowed` 放行這些場景。
    - 閘門一致性：
      - 帶 `seen: ['rin-confess']` 的閘門必須同時有 `oath: true`；
      - `beforeChoice` 不和 `oath`、`full` 同時出現。
15. **設計者裁定：「一起回來」的三句**分別是 `rin-reveal`、`chat:rin:4`、`finale`。新場景一律不用這四個字（`voice.test.ts` 既有的守門會抓）。
16. **停止規則（取代打磨計畫的版本）**：
    - 劇情事實、揭露時機、帳本 I 條目，只能照設計 §7 的表格與裁定 (a)–(d) 改。
    - 其他任何事實改動，一律停下來回報 NEEDS_CONTEXT。
    - 心契不告白；凜不寫成預設的女主角；不加新的說話者與表情。

## Global Constraints

**使用者的方向（最高依據）**
- 原話：「現在人物之間的瓜葛和背後設定可能不夠深刻，造成演出很奇怪」，「作為專業編劇編寫適當的劇情，並且驅動他們各自的人性，讓他們在故事當中有衝突和掙扎」。
- 已核准的聲音：
  - 日常輕快、有梗、日系 RPG 的味道；沉重的留給記憶與揭露。
  - 「……」少用。
  - 台灣繁體用語。
- 戀愛中立：心契不告白；凜不是預設的女主角；九位的份量相同（設計 §3、§4.3）。

**不動的東西**
- 戰鬥與引擎的數值：
  - 不改 `CHAINS`、掉落、屬性加成、深淵解鎖；
  - 不改 `ui2/scenes/battle.ts`；
  - 不用 `Math.random`，不加新的亂數抽取（城鎮抽句仍是一次 `game.rng()`，只是池子大小變了）。
- 沒有新的美術；表情只用 `moodsFor(說話者)` 已有的。
- 字級在範圍外。
- `T.rune`、`T.cmd`、`T.build`、`T.ui2.workshop`、`T.ui2.tree`，以及 SDD `off-limits.md` 列的每一個鍵，屬於平行的 8h 分支，不碰。
- 凜的技能名「還有。」保留（plan 8 帳本裁定），只有台詞和旁白不再用這個口癖。

**戰鬥閘門**
- 每次跑閘門：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<名> > <SDD>/gate-<名>.stdout`。
- 跑完 `cmp <SDD>/gate-<名>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json`，必須沒有輸出（逐位元相同）。
- 什麼時候跑：Task 1 Step 0 跑 `gate-0`，Task 6 跑 `gate-engine`，Task 20 跑 `gate-final`。
- 不覆寫 `engine/__fixtures__/`。

**分支、git、換行**
- worktree：`C:\Users\bag57\.codex\worktrees\starlantern-polish`，分支 `fix/starlantern-story-polish`。
- 開工前跑 `git status`。本計畫要改的檔若有別人未提交的修改，停下來回報 NEEDS_CONTEXT。
- git：
  - 用完整路徑 add，不可以 `git add -A`／`git add .`。
  - Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
  - 不可以 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。
  - 不 push。
- 換行要逐檔保留：
  - 改檔前跑 `git ls-files --eol <檔>`，改完跑 `git diff --stat`；整檔被改寫就是換行壞了。
  - CRLF 檔不可以用 `sed -i`。
  - LF：`data/story.zh-TW.ts`、`data/story/*.ts`、`engine/story/*.ts`、`ui2/story.ts`、`ui2/scenes/handbook.ts`、`ui2/scenes/gate.test.ts`、`tests/e2e/starlantern.spec.ts`、`docs/**/*.md`。
  - CRLF：`engine/state.ts`、`engine/save.ts`、`engine/game.test.ts`、`ui2/scenes/town.ts`。
  - 混用（新行照相鄰行）：`engine/game.ts`、`engine/save.test.ts`、`ui2/scenes/gate.ts`、`ui2/scenes/town.test.ts`、`data/text.zh-TW.ts`。
  - 新檔一律 LF。
- **和 `feat/starlantern-builds`（8h）的合併風險**：
  - 本計畫不改 `battle.ts`。
  - `game.ts` 只改 `depart`、`sceneDone`、`finalePieces`、`boot` 四處；`gate.ts` 只改 `askDepart`。
  - `ui2/scenes/town.ts` 的約 83–92 行，8h 也改過：本計畫只改 `const keeper = …` 這一行，其他新程式放到別的檔。
  - `engine/save.ts` 只在 `isStory` 加一行檢查，在 `engine/state.ts` 加一個欄位。
  - 介面文字：Task 1 Step 0 先跑 `git diff $(git merge-base HEAD feat/starlantern-builds) feat/starlantern-builds -- src/scripts/games/starlantern/data/text.zh-TW.ts`，把 8h 動過的每一個 `T` 鍵列進 SDD `off-limits.md`。這些鍵、`T.rune`、`T.cmd`、`T.build`、`T.ui2.workshop`、`T.ui2.tree`，本計畫一律不改。
  - 新的 e2e 測試插在相關的既有測試後面，不接在檔尾。
  - 最後合併的那一條分支，合併後要重跑 `data/terms.test.ts` 與 `data/story/voice.test.ts`。

**測試與檢查**
- TDD：先寫失敗的測試，確認它因為正確的理由失敗，再實作。改寫段落的「紅」，是把鍵加進 `POLISHED`，或者寫新的 `pinBeat`。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`。
- 全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不用 `npm run test`。
- tsc：`rtk proxy npx tsc --noEmit -p .`。
  - 星燈迷宮底下與 `tests/e2e/starlantern.spec.ts` 必須是 0 個。
  - 全 repo 不可以多於基準（master 大約 773，都在本專案之外）。
- e2e：`E2E_PORT=4356 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。
  - headless（設定檔的預設，絕不加 `--headed`），靜音。
  - 只用 4356，絕不用 4354；不結束任何程序。
- **重的工作（閘門、e2e、全套）之前**：
  - PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` 必須 ≥ 6291456 KB（6 GB），不足就等。
  - 拿重工作鎖 `C:\msys64\tmp\claude\C--Users-bag57\2c248522-7150-4161-8ef7-00e1a1e771a9\scratchpad\heavy.lock`：
    - 拿：`(set -o noclobber; echo "story-depth Task <N> $(date -Is)" > <鎖>)`；
    - 已經存在就等；
    - 跑完立刻刪掉。
  - 控制者若另有鎖的規矩，照控制者的。
- 本專案沒有 prettier、eslint，不要跑。一次性的探測程式跑完就刪，絕不 commit。
- 收尾 G（每個任務）：
  1. 全套全綠，tsc 符合上面的條件。
  2. 動到 `ui2/`、`engine/game.ts`、`tests/e2e/`，或改到的字串在 e2e 裡逐字出現（先 grep），就跑 e2e，必須全綠。
  3. 報告寫：新增與修改的測試名、全套的兩行、tsc 數字、e2e 結果（沒跑就寫理由）、改了哪些釘子、`story.test.ts` 的 `expect(` 數、偏離本計畫的地方與理由。
- **`expect(` 的下限**：`grep -o "expect(" src/scripts/games/starlantern/data/story/story.test.ts | wc -l`。
  - 每個任務結束時，不可以少於它開始時的數字，也不可以少於 806。
  - 釘子照打磨計畫裁定 11 改成 `pinBeat`，只釘情節要點，不釘字句。
- **測試修改規則**：
  - 各任務列出已知會紅的既有測試，只照新的形狀補。
  - 全套跑出沒列到的紅燈，就停下來回報 NEEDS_CONTEXT。
  - commit 裡不可以出現 `it.fails`、`it.skip`、`.only`、`.todo`。

**文字**
- 劇情只放在 `data/story.zh-TW.ts`，介面只放在 `data/text.zh-TW.ts`。
- 每句 ≤ 60 字；場景照最壞情況播出的句數，不超過 `lineCap(id)`。
- 全形標點；對白用「」，裡面的引號用『』；劇情文字不出現英文字母與阿拉伯數字。
- 聖經的全部預算照舊：
  - 「……」：每句最多一個、不放句首；輕的場景一場最多一個；重的場景 `max(1, floor(說話句數/4))`；每位說話者 1/6；整份劇本 8%。
  - 語尾助詞照 `VOICE`。
  - 驚嘆號。
  - 「洛恩。」不當開頭；「洛恩，」開頭的台詞一場最多一句。
  - 「一起回來」整份劇本最多三句；終幕「交給燈」最多三句。
  - 閒聊裡的「你」只能對洛恩說。
- 絲嘉蕾的稱呼：集滿之前一律「洛恩閣下」，集滿以後（第五片起）是「洛恩」（`story.test.ts` 既有測試）。

**子代理**：實作者不派子代理。朗讀審查由控制者另派全新脈絡的審查者（Opus 5.5）。

## 改寫任務的固定步驟（Task 7 到 Task 19）

照打磨計畫「改寫任務的固定步驟」的 R1–R8，只有下面這些不同：
- 朗讀稿與紅燈清單存到本計畫的 SDD：`task-<N>-red.txt`、`task-<N>-before.md`、`task-<N>-after.md`。
- **R1 紅**：
  - 本任務的鍵前綴已經在 `POLISHED` 裡時（Task 7），紅燈改由本任務列出的新 `pinBeat` 測試提供。
  - 每段改寫都要先寫它列出的 `pinBeat` 測試。
- **R3 改寫**：照下面的規則寫。
  - 人物：聖經聲音表，加上設計 §3 的人物表（慾望、缺點、摩擦對象）。
  - 摩擦：閒聊的刺不放最後（設計 §4.3）；斷裂的那一拍放在重大場景，或回憶裡「現在」的那一半。
  - 設計稿是要點，不是定稿：每一句都要過守門。本任務列出已知會被擋下的設計稿句子。
  - 樣稿一、二是「定稿品質」，意思與畫面不變，字句可以為了守門小修，修了要在報告裡逐句列出。
- **R7 commit**：`fix(starlantern): story depth — <段落名>`。R8 之後的修正，commit 訊息加「（朗讀審查）」。
- **R8 朗讀審查**：照打磨計畫的 R8，審查最多兩輪，另外多查三點：
  - (f) 摩擦：笑點底下的刺是不是真的在，最後一句是不是小笑點或小溫暖，有沒有說教腔或「選」。
  - (g) 戀愛中立：有沒有偏向凜或任何一位。
  - (h) 前後呼應：本段回收的伏筆（設計 §6 的編號）有沒有接上。
- **帳本與聖經邊寫邊改**：本任務動到的 I 條目，在同一個 commit 裡改。新條目從 I-167 往後編，寫作時先 grep 最後一個編號。

## Review Focus

1. ~~**舊存檔停在第四幕中段**~~（**使用者裁定，Task 4 之後：遊戲還沒上線，舊存檔不必相容。本條作廢**） （凜已選擇，鐘守已看過或已排入）：讀檔後不補播坦白；手冊凜的頁面有「凜的坦白」標「新」；`rin-scarlet:2` 照常開放。測試：Task 5 的 `an old save past her choice counts the confession as seen and new, and opens the seventh night`。
2. **存檔停在揭露與坦白之間**（同一輪遊戲的讀檔，照舊要顧）：讀檔不可以把鐘守算成看過，坦白與鐘守都要照順序在之後播。測試：Task 3 的 `an old save past her choice counts the bellkeeper's arrival as seen…`（最後兩個斷言：坦白排入、鐘守排入時都原樣回傳）。
3. **出發被拒絕，或劇情設定是「不播」**：
   - 隊伍全倒、樓層沒解鎖：`hero-alone` 不播，留在佇列。
   - 設定「不播」：算看過，並標「新」，照常出發。
   - 測試：Task 3 的 `a refused departure keeps the lone morning waiting` 與 `the lone morning auto-plays when the story is off`。
4. **還欠著坦白就打贏終幕**（揭露那一夜之後沒再回城就一路下到第三十層）：終幕前依序播坦白與鐘守；終幕之後佇列裡沒有任何一場重戲。測試：Task 3 的 `the finale plays the owed confession and the keeper before itself`。
5. ~~**聽過新的 `rin-sylvie:1` 之後再讀檔好幾次**~~（**使用者裁定，Task 4 之後：遊戲還沒上線，舊存檔不必相容。本條作廢**） ：它不會再被丟掉、不會重播。測試：Task 5 的 `the renumbered ids are dropped once per save`。

---

## File Structure

- `data/story/scenes.ts`：
  - `StoryGate`；新的 `SceneId`、`MajorScene`；
  - 句數上限表、`ALONE`、`HEAVY_MAJORS`、`DEPARTURE_SCENES`；
  - ~~`RENUMBERED`、`STORY_IDS`~~（作廢：舊存檔不必相容）；
  - 新的閒聊數量與閘門、凍結註解。
- `data/story.zh-TW.ts`：`ScriptLine.if.seen/notSeen`、`LineWhen.seen`、`KeeperLine`、新場景與全部改寫。
- `data/story/voiceGates.ts`、`readAloud.ts`：讀法加入 `seen`、`AFTER_CHOICE`、重場景名單、助詞比例。
- `engine/story/events.ts`：
  - `gateOpen`／`gateExpired`；
  - 閒聊排程、到達與獨播、觸發；
  - ~~`settleConfess`、`settleRenumbered`~~（作廢）。
- `engine/state.ts`：`StoryState.ids?`。
- `engine/save.ts`：`isStory` 接受 `ids`。
- `engine/game.ts`：`departCheck`、`departScene`、`sceneDone` 的 due、`finalePieces`、`boot`。
- `engine/story/handbook.ts`：凜的頁面、`after` 真相頁。
- `ui2/story.ts`：`seen` 帶入 `LineWhen`。
- `ui2/scenes/gate.ts`：出發時播。
- `engine/story/keeper.ts`（新）：`bellkeeperPool`。
- `ui2/scenes/town.ts`：只改 `const keeper` 那一行。
- 文件：
  - 好感 spec §8.5 與 §8 的句數表；
  - 聖經、帳本。
- 測試：
  - `data/story/story.test.ts`、`voice.test.ts`、`readAloud.test.ts`；
  - `engine/story/events.test.ts`、`handbook.test.ts`；
  - `engine/save.test.ts`、`engine/game.test.ts`；
  - `engine/story/keeper.test.ts`（新）；
  - `ui2/story.test.ts`、`ui2/scenes/gate.test.ts`；
  - `tests/e2e/starlantern.spec.ts`。

---

## 第一部分：引擎與資料（TDD）

### Task 1：基準；閘門形狀；句子條件；守門跟上

**Files:**
- Modify: `data/story/scenes.ts`、`engine/story/events.ts`、`data/story.zh-TW.ts`（只改型別與 `linesWhen`）、`data/story/voiceGates.ts`、`data/story/readAloud.ts`、`ui2/story.ts`
- Test: `engine/story/events.test.ts`、`data/story/story.test.ts`、`data/story/voice.test.ts`、`data/story/readAloud.test.ts`、`ui2/story.test.ts`

**Interfaces:**
- Produces:
  - `scenes.ts`：
    ```ts
    export interface StoryGate {
      stage?: Stage;
      oath?: true;
      full?: CharacterId;
      beforeChoice?: true;
      pieces?: Partial<Record<CharacterId, number>>;
      seen?: SceneId[];
    }
    ```
    - 加上 `export type BanterGate = StoryGate`，保留舊名。
    - `CHAT_GATE`、`BANTER_GATE` 都是 `Partial<Record<SceneId, StoryGate>>`。
  - `events.ts`：
    - `export function gateOpen(s: GameState, g: StoryGate | undefined): boolean`：
      - `stage` 照舊；`oath` 照舊；`full` 用 `memoriesOf`；
      - `beforeChoice`：凜還沒選擇；
      - `pieces`：每個人 `memoriesOf ≥ n`；
      - `seen`：都在 `s.story.seen` 裡。
    - `export function gateExpired(s: GameState, g: StoryGate | undefined): boolean`：`g?.beforeChoice && !!s.party.roster.rin?.oath`。
    - `chatOpen`、`banterOpen` 改用 `gateOpen`。`banterOpen` 仍要求兩人都已相遇。
    - `nextChat`、`nextBanter` 碰到過期的編號：
      - 當作已經跳過：算進 `heard`，不擋同一串的下一段；
      - 它自己永遠不會被回傳；
      - 不寫進 `story.seen`。
  - `story.zh-TW.ts`：
    - `ScriptLine.if` 加 `seen?: SceneId; notSeen?: SceneId`。
    - `LineWhen` 加 `seen?: SceneId[]`。沒有給的時候當成 `[]`。
    - 理由：做成可選，既有幾十個測試裡的 `LineWhen` 字面值不用改；執行期只有 `ui2/story.ts` 一個呼叫點，那裡一定會帶。
  - `voiceGates.ts`：`readingsOf` 加一種條件 `{ kind: 'seen'; id: SceneId }`，開與關兩種讀法都產生。
  - `readAloud.ts`：讀法標籤印出 `看過 <id>`／`沒看過 <id>`。

- [ ] **Step 0：基準**（寫進 SDD `baseline.md`）：
  - `git status` 乾淨（只有本計畫檔可以是未追蹤）；記下 `git rev-parse HEAD` 當作 `<BASE>`。
  - 記下全套的兩行；記下 tsc 總數與星燈迷宮底下的數量（必須是 0）。
  - 記下 `expect(` 數（寫計畫時是 806）。
  - 記憶體與鎖照 Global Constraints，跑 `gate-0` 並 cmp。cmp 已經不同，就停下來回報 BLOCKED。
  - 跑 e2e，記下通過數（打磨 Task 7 時是 63）。
  - 把 8h 動過的介面鍵列進 SDD `off-limits.md`（Global Constraints 的合併風險一節）。
- [ ] **Step 1：寫失敗的測試**
  - `events.test.ts` `a gate opens on each of its kinds (story depth)`：用自訂的 `gates` 參數呼叫 `banterOpen`、`chatOpen`。
    - `beforeChoice`：選擇前開，選擇後關。
    - `pieces: { noel: 1 }`：0 片關，1 片開。
    - `pieces: { bobby: 3, chizuru: 3 }`：只有一人到三片時關。
    - `seen: ['rin-confess']`：沒看過時關。
    - 既有的 `stage`、`oath`、`full` 照舊。
  - `events.test.ts` `an expired banter neither plays nor holds back the next of its pair`：
    - 自訂 `count = { 'rin-sylvie': 2 }`、`gates = { ':1': { beforeChoice: true }, ':2': { oath: true } }`。
    - 選擇前：`nextBanter` 是 `:1`。
    - 選擇後、`:1` 沒聽過：`nextBanter` 是 `:2`，而且 `s.story.seen` 不含 `:1`。
  - `story.test.ts` `linesWhen reads seen and notSeen`：
    - 一句 `if: { seen: 'banter:rin-sylvie:1' }`、一句 `if: { notSeen: … }`。
    - `seen` 有、沒有、沒給（undefined），各播哪一句。
  - `voice.test.ts` `readings cover a seen condition`：`readingsOf` 對上面兩句產生兩種讀法，各一句。
  - `readAloud.test.ts` `labels a seen reading`：輸出含 `看過 banter:rin-sylvie:1` 與 `沒看過 banter:rin-sylvie:1`。
  - `ui2/story.test.ts` `a scene line waits on a scene the save has seen`：
    - 暫時把一場場景的台詞換成兩句帶 `seen`／`notSeen` 的，再還原。
    - 存檔的 `story.seen` 有那個 id 時播第一句，沒有時播第二句。
  - `voice.test.ts`（裁定 2，草稿 `particleBreaks` 的改動；自我測試改寫）`a particle share is checked over all of a speaker's lines, once they are all in scope`：
    - 範圍只有 `['scenes.chat:chizuru:']` 時，結果沒有 `bobby:` 開頭的比例訊息。
    - 範圍是「波比的所有鍵扣掉一個」時，也沒有她的比例訊息。
    - 範圍是全劇本時：
      - 測試自己先算出波比的「喔」比例：`storyTexts()` 裡 `speakerOf` 是她的台詞，符合 `VOICE.bobby.mark` 的比例；
      - 比例超過 `maxShare` 時，結果有 `bobby: n of m lines` 這一條，沒超過就沒有。
      - 這樣不管資料改成怎樣都成立。
- [ ] **Step 2：跑上面的測試**：
  ```
  rtk proxy npx vitest run --testTimeout=20000 \
    src/scripts/games/starlantern/engine/story/events.test.ts \
    src/scripts/games/starlantern/data/story/story.test.ts \
    src/scripts/games/starlantern/data/story/voice.test.ts \
    src/scripts/games/starlantern/data/story/readAloud.test.ts \
    src/scripts/games/starlantern/ui2/story.test.ts
  ```
  預期失敗原因：缺 `beforeChoice`、`pieces`、`seen`、`linesWhen` 的新條件，以及 `particleBreaks` 的形狀。
- [ ] **Step 3：實作**
  - 照 Interfaces 做。
  - `ui2/story.ts:62` 帶入 `seen: s.story.seen`。
  - `particleBreaks` 照草稿 `voice.test.ts` 裡 `@@ -86,7` 那一個 hunk 手動改（`git apply` 不能只挑一個 hunk）。草稿的 `POLISHED` 那一行（留給 Task 8）與它的自我測試（Step 1 已經改寫）**不要**抄進來。
  - `story.test.ts` 的 `no scene plays more lines than its cap`：對每個場景，台詞裡提到的 `seen`／`notSeen` id 的每一種組合都要跑。
- [ ] **Step 4：跑 Step 2 的指令，全綠**。
- [ ] **Step 5：收尾 G**（動到 `ui2/story.ts`，所以跑 e2e）。
- [ ] **Step 6：commit** `feat(starlantern): story gates by pieces, seen scenes and before her choice; lines that wait on a scene`。

### Task 2：三場新的重大場景、句數上限、手冊、測試的位置規則

**Files:**
- Modify:
  - `data/story/scenes.ts`：`SceneId`、`MajorScene`、`MAJOR_SCENES`、`lineCap`、`HEAVY_ARRIVAL`。
  - `data/story.zh-TW.ts`：`MAJOR_TITLES`、`SCRIPT` 的三場草稿。
  - `engine/story/handbook.ts`。
  - `data/story/voiceGates.ts`：`HEAVY_SCENES`、`AFTER_CHOICE`、`sceneReadings`。
  - 好感 spec §8.5、§8 的句數表（約 355、389 行）。
- Test: `data/story/story.test.ts`、`data/story/voice.test.ts`、`engine/story/handbook.test.ts`
- 已知會紅、照新形狀補：
  - `story.test.ts` 約 152 行 `expect(lineCap('bellkeeper-arrives')).toBe(6)`；
  - 列出全部 `MAJOR_SCENES` 的斷言；
  - `handbook.test.ts` 裡凜頁面的場景清單。

**Interfaces:**
- Produces:
  - `SceneId`、`MajorScene` 加 `'rin-confess' | 'hero-alone' | 'epilogue'`。
  - `MAJOR_SCENES` 的順序：`[…, 'act4', 'rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'hero-alone', 'finale', 'epilogue']`。
  - `lineCap`：
    - `act1-after` 3；`prologue-inn`、`first-return` 10；
    - `bellkeeper-arrives` 10；`rin-confess` 12；`hero-alone` 10；
    - `finale` 16；`epilogue` 16；
    - 其他重大場景 12。
    - `BELLKEEPER_CAP` 換成一張 `MAJOR_CAPS: Partial<Record<MajorScene, number>>`。
  - `MAJOR_TITLES`：`'rin-confess': '凜的坦白'`、`'hero-alone': '一個人的清晨'`、`epilogue: '星燈祭'`。
  - `HEAVY_ARRIVAL` 加 `'rin-confess'`、`'hero-alone'`；`epilogue` 已經在裡面，現在它是真的 `SceneId`。
  - `voiceGates.ts`：
    - `export const AFTER_CHOICE: ReadonlySet<SceneId>`（裁定 14）；
    - `sceneReadings` 對這組場景固定 `oath: true`；
    - `HEAVY_SCENES` 加這三場。
  - `handbook.ts`：凜的 `own` 照裁定 12；`after` 真相頁的 `scenes` 是 `entries(['finale', 'epilogue'])`。
- 草稿（裁定 10，原樣貼）：
  - `rin-confess`：設計 §8 樣稿二，逐字照抄，包括條件：
    - `〔met: scarlet〕` → `if: { met: 'scarlet' }`；
    - `〔met: sylvie, seen: …〕` → `if: { met: 'sylvie', seen: 'banter:rin-sylvie:1' }`；其他同理。
    - 表情照樣稿；瑪莎沒有表情。
  - `hero-alone`：設計 §7.4 那一列的九拍，第 6 拍的五種讀法用 `met`／`notMet`／`seen`／`notSeen`／`full`／`notFull` 組合，第 9 拍兩句。
  - `epilogue`（設計 §7.5 的核心六句，沒有逐字的拍子先用下面這幾句）：
    1. 旁白：「終幕之後的第一個晚上，鎮上第一次辦了星燈祭。廣場掛滿了燈。」
    2. 瑪莎：「洛恩，坐下。今天的日記，我念給你聽。」
    3. 瑪莎：「第一頁：兩個孩子倒在門口。名字是安娜取的。」
    4. 瑪莎：「每一頁最上面那一行，都一樣：回來了。」
    5. 旁白：「安娜從公會抱來一疊登記表，翻開最上面那一張。最後一欄填著：回來了。」
    6. 洛恩（`smile`）：「以前的每一輪，我一句也不記得。這一輪，有人念給我聽。」
  - 三場的 `summary` 各一句，照劇情寫，不用「……」。

- [ ] **Step 1：寫失敗的測試**
  - `story.test.ts` `the depth design's line caps`：上面每一個上限，逐一斷言。
  - `story.test.ts` `the new major scenes are titled and placed`：
    - 三個標題。
    - `MAJOR_SCENES` 的順序。
    - `position()`：`rin-confess` 是 `rinSeventh()`，`hero-alone` 是 `'act4'`，`epilogue` 是 `'after'`。
    - `rinSecretAllowed` 放行 `rin-confess`、`hero-alone` 的鍵。
  - `story.test.ts` `rin-confess plays every one of its readings within its cap, and Scarlet's and Sylvie's lines only with them`：
    - 用 `sceneReadings('rin-confess')`。
    - 每種讀法都 ≤ 12 句。
    - 只有凜的隊伍時，正好六句（控制者裁定，Task 2：「沒有人動」那句旁白是刻意的一拍；設計 §8 樣稿二寫的「五句」漏算了它）。
    - 絲嘉蕾沒遇見時，沒有她的台詞；希爾薇兩種讀法互斥。
  - `voice.test.ts` `the scenes after her choice read only after it`：`AFTER_CHOICE` 每一場的每一種讀法 `when.oath === true`；`heavyScene` 對三場都是 true。
  - `handbook.test.ts` `Rin's page replays her confession and the lone morning once seen; the after page replays the festival`：
    - 看過之前不列。
    - 看過之後照裁定 12 的順序列。
    - `after` 真相頁依序是 `finale`、`epilogue`。
- [ ] **Step 2：跑測試**（`story.test.ts`、`voice.test.ts`、`handbook.test.ts`），預期因為 id 不存在而失敗。
- [ ] **Step 3：實作**
  - 照 Interfaces 做。
  - `position()` 補三場；`rinSecretAllowed` 放行 `AFTER_CHOICE`；句數上限測試的 oath 組合改讀 `AFTER_CHOICE`。
  - 好感 spec §8.5：
    - 「最壞情況 12 句：開場 1、夥伴 9、結尾 2」改成「主線核心六句（故事深度設計 §7.5）＋至多十句（夥伴各一句與安娜、瑪莎的交還條件句），上限 16」。
    - 句數表與 §8 那一行 `epilogue：12` 改成 16。
    - 加一行註明 `epilogue` 已經從 6e 提前到主線（控制者裁定 d）。
- [ ] **Step 4：跑 Step 2 的指令，全綠**。
- [ ] **Step 5：收尾 G**。
- [ ] **Step 6：commit** `feat(starlantern): Rin's confession, the lone morning and the lantern festival as major scenes; caps for the longer ones`。

### Task 3：時段與觸發：獨播、一次一場重戲、出發播放點、終幕前補播

**Files:**
- Modify: `engine/story/events.ts`、`data/story/scenes.ts`（`ALONE`、`HEAVY_MAJORS`、`DEPARTURE_SCENES`；`heavyScene` 與 `HEAVY_SCENES` 從 `voiceGates.ts` 搬過來）、`data/story/voiceGates.ts`（改成 re-export）、`engine/game.ts`（`depart`、`sceneDone`、`finalePieces`）、`ui2/scenes/gate.ts`（`askDepart`）
- Test: `engine/story/events.test.ts`、`engine/game.test.ts`、`ui2/scenes/gate.test.ts`
- 已知會紅、照新形狀補：
  - `events.test.ts` 裡斷言「`sceneDone('rin-reveal')` 排入 `bellkeeper-arrives`」的測試；
  - 斷言同一次回城播兩場幕（例：`act2`、`act3`）的測試；
  - `game.test.ts` 裡終幕的 `finale.pieces`；
  - 在 `onReturn` 之後、幕還沒播之前就斷言 `storyStage` 的測試（裁定 5 的「幕要播過才算數」）。
  - 逐則列在報告裡。

**Interfaces:**
- Consumes：Task 2 的 `SceneId`。
- Produces:
  - `scenes.ts`：
    - `export const ALONE: readonly SceneId[] = ['rin-reveal', 'rin-confess']`；
    - `export const HEAVY_MAJORS: ReadonlySet<SceneId>`（act2、act3、act4、bellkeeper-arrives、epilogue）；
    - `export const DEPARTURE_SCENES: readonly SceneId[] = ['hero-alone']`。
  - `events.ts`：
    - `sceneDone`：`rin-reveal` → 設 oath，排入 `rin-confess`；`rin-confess` → 排入 `bellkeeper-arrives`。都只在沒看過、沒排入時排。
    - `onReturn`：`hero-alone` 照裁定 6 排入；`finaleCleared` 而且 `epilogue` 沒看過、沒排入時排入 `epilogue`。
    - `rank`：`rin-confess` 3.4、`epilogue` −0.5。
    - `arrivalScenes` 照裁定 5，並且先把 `DEPARTURE_SCENES` 從清單拿掉。
  - `game.ts`：
    - `departCheck(portal: Portal, startDepth: number): 'locked' | 'party-down' | 'phase' | null`；
    - `departScene(): SceneId | null`：在城鎮，佇列裡有 `DEPARTURE_SCENES` 的第一個，而且裁定 6 的條件都成立時回傳它：`mem:hero:9`、`bellkeeper-arrives` 都看過，佇列沒有 `ALONE`；
    - `events.ts` 的 `storyStage` 照裁定 5 只算不在佇列裡的幕節點；
    - `sceneDone` 的 due 加上 `id === this.departScene()`；
    - `finalePieces` 照裁定 8。
    - **控制者裁定（Task 2 審查後）**：欠著的 `rin-confess` 在第三十層由 `finalePieces` 補播時，不是「回城那天的晚飯」，需要它自己的時間詞。Task 3 不寫台詞；報告裡寫明那種讀法在 `LineWhen` 能分辨的狀態（若沒有，提出最小的條件），交給 Task 14 寫。

- [ ] **Step 1：寫失敗的測試**
  - `events.test.ts`：
    - `her choice queues the confession; the confession queues the keeper`。
    - `the confession plays alone at its arrival, and the chat and banter wait`：佇列有 `rin-confess`、`home:sylvie`，`arrivalScenes(chat: true)` 是 `['rin-confess']`。
    - `one heavy major scene an arrival; the rest wait in the queue`：
      - 佇列 `['act3', 'act4', 'home:sylvie']` → `['act3', 'home:sylvie', …chat]`，而且 `act4` 還在 `s.story.queue`。
      - `chat: false` 的時候同樣只播一場。
    - `a heavy arrival gives the chat slot to a light chat`：佇列 `['act4']`，`chat:rin:3` 與 `chat:sylvie:2` 都可播、凜聽過的比較少，挑到的是 `chat:sylvie:2`；沒有輕的對話時才挑 `chat:rin:3`。`nextChat` 加一個可選參數 `light?: boolean`，由 `arrivalScenes` 傳入；`heavyScene` 從 `data/story/voiceGates.ts` 搬到 `data/story/scenes.ts`（`voiceGates` 改成 re-export），引擎不依賴測試工具。
    - `the lone morning is queued after the ninth piece, never played on arrival`：
      - `mem:hero:9` 在佇列 + oath → `onReturn` 排入 `hero-alone`，`arrivalScenes` 不含它。
      - 沒有 oath，或終幕已過：不排。
    - `an act waiting in the queue does not move the stage`：
      - `reached.mainline = ACT_DEPTHS.act4`，佇列 `['act3', 'act4']`，`nodes` 有兩幕；
      - `storyStage` 是 `act2`（假設 `act2` 已看過）；`act3` 播完是 `act3`，`act4` 播完是 `act4`；
      - 只開放到 `act4` 的回城對話（`chat:hero:4`），在 `act4` 播完之前，`nextChat` 不挑它；
      - 沒有佇列的舊存檔（`nodes` 有、`queue` 沒有），照舊算數。
    - `the festival is the first scene after the finale`：`finaleCleared` → `onReturn` 排入 `epilogue`；排序後在 `home:*` 前面。
  - `game.test.ts`：
    - `departing with the lone morning queued: departScene names it, and it is due`：
      - `game.departScene()` 是 `'hero-alone'`；
      - `game.sceneDone('hero-alone', 'played')` 回傳 true；之後 `departScene()` 是 null。
    - `the lone morning waits for the ninth piece and the keeper`：
      - 佇列有 `hero-alone`，`mem:hero:9` 還在佇列（沒看過）：`departScene()` 是 null；
      - `mem:hero:9` 看過、`bellkeeper-arrives` 還在佇列：null；
      - 兩個都看過、佇列有 `rin-confess`：null；
      - 兩個都看過、沒有 `ALONE`：`'hero-alone'`。
    - `a refused departure keeps the lone morning waiting`：
      - 全員倒下時 `departCheck` 回傳 `'party-down'`；
      - `departScene()` 仍然是 `'hero-alone'`，佇列裡還有它。
    - `the finale plays the owed confession and the keeper before itself`：
      - 佇列 `['rin-confess']`，打贏第三十層的終幕；
      - `game.finale.pieces` 依序含 `'rin-confess'`、`'bellkeeper-arrives'`；
      - 照順序 `sceneDone` 它們和 `finale` 之後，`story.queue` 沒有任何 `HEAVY_MAJORS` 也沒有 `ALONE`。
    - `a lone morning still owed at the finale counts as seen and new`。
  - `gate.test.ts`：
    - `confirming a departure with the lone morning queued plays it at the gate, then goes to the dungeon`：
      - 確定出發後，傳送門卡片、樓層選單與確認框都已收起，對話框播出 `hero-alone` 的第一句；
      - 逐句確定到最後，`ctx.go` 收到 `'dungeon'`，`story.seen` 有 `hero-alone`。
    - `the lone morning auto-plays when the story is off`：`settings.story = 'none'`，直接進迷宮，`fresh` 有 `hero-alone`。
    - `a refused departure plays nothing`：全員倒下，沒有播任何台詞，出現既有的失敗訊息。
- [ ] **Step 2：跑測試**（`events.test.ts`、`game.test.ts`、`gate.test.ts`），預期因為觸發與方法不存在而失敗。
- [ ] **Step 3：實作**
  - `gate.ts` 的 `askDepart` 在 `yes` 之後：
    1. `departCheck`，不通過就照舊 `fail`；
    2. 有 `departScene()` 就先 `popAll()`（不讓對話框壓在傳送門卡片或樓層選單底下），再 `await this.play(id)`；
    3. 然後 `depart`、`go('dungeon')`。
  - 改動限在 `askDepart` 這一段。
- [ ] **Step 4：跑 Step 2 的指令，全綠**。
- [ ] **Step 5：收尾 G**，含 e2e。
- [ ] **Step 6：commit** `feat(starlantern): the confession plays alone at dinner, the lone morning at the gate, one heavy scene a return, owed scenes before the finale`。

### Task 4：新的閒聊編號、回城對話、鐘守的條件句

**Files:**
- Modify:
  - `data/story/scenes.ts`：`BANTER_COUNT`、`BANTER_GATE`、`CHAT_COUNT`、`CHAT_GATE`、`RENUMBERED`、`STORY_IDS`，以及約 46 行的凍結註解。
  - `data/story.zh-TW.ts`：搬移、草稿、`KeeperLine`、`bellkeeper.oath`。
  - `ui2/scenes/town.ts`（CRLF）：只改 `const keeper = …` 這一行（8h 改過約 83–92 行）。
  - 帳本：每一條新閘門一列，附理由。
- Create: `engine/story/keeper.ts`、`engine/story/keeper.test.ts`
- Test: `data/story/story.test.ts`、`engine/story/events.test.ts`、`engine/story/keeper.test.ts`
- 已知會紅、照新形狀補（審查 I6）：
  - `story.test.ts` 約 2304 行 `said('banter:noel-selene:2', 'selene')` 的「不收回」：內容搬到 `:3`，所以改指 `banter:noel-selene:3`，斷言的內容不變。
  - `handbook.test.ts` 約 17 行的 `RIN_BANTERS`：加上 `rin-sylvie:2`、`rin-selene:1`、`rin-selene:2`、`rin-scarlet:2`、`rin-scarlet:3`、`chizuru-rin:2`。
  - `events.test.ts` 約 555 行，含 `banter:safira-sylvie:2` 的那份清單：照新的編號與閘門改。
  - 其他斷言舊閒聊編號或舊閘門（`BANTER_GATE` 的 `toEqual`、`CHAT_COUNT.hero` 是 4）的測試，照新形狀補，逐則列在報告裡。

**Interfaces:**
- Produces:
  - `BANTER_COUNT`：
    - 新增 `chizuru-noel: 2`、`rin-selene: 2`；
    - 改成 `rin-scarlet: 3`、`rin-sylvie: 2`、`safira-sylvie: 3`、`safira-scarlet: 2`、`liz-scarlet: 3`、`noel-selene: 3`、`bobby-chizuru: 2`、`bobby-sylvie: 2`、`chizuru-rin: 2`；
    - `liz-selene` 維持 1。
  - `BANTER_GATE`（設計 §7.2–7.4）：

    | 編號 | 閘門 |
    |---|---|
    | `chizuru-noel:1` | `{ pieces: { noel: 1 } }` |
    | `liz-scarlet:2` | `{ stage: 'act2', pieces: { scarlet: 2 } }` |
    | `safira-sylvie:2` | `{ pieces: { safira: 2 } }` |
    | `rin-sylvie:1` | `{ stage: 'act3', beforeChoice: true }` |
    | `rin-selene:1` | `{ stage: 'act3', beforeChoice: true }` |
    | `safira-scarlet:2` | `{ stage: 'act3' }` |
    | `noel-selene:2` | `{ pieces: { noel: 3 } }` |
    | `bobby-chizuru:2` | `{ pieces: { bobby: 3, chizuru: 3 } }` |
    | `bobby-sylvie:2` | `{ stage: 'act3' }` |
    | `rin-scarlet:2` | `{ oath: true, seen: ['rin-confess'] }` |
    | `rin-scarlet:3` | `{ full: 'scarlet', seen: ['banter:rin-scarlet:2'] }` |
    | `rin-selene:2` | `{ oath: true, full: 'selene' }` |
    | `rin-sylvie:2` | `{ oath: true }` |
    | `chizuru-rin:2` | `{ oath: true }` |
    | `chizuru-noel:2` | `{ full: 'noel' }` |
    | `safira-sylvie:3` | `{ stage: 'act3', full: 'safira' }` |
    | `liz-scarlet:3` | `{ stage: 'act3', full: 'scarlet' }` |
    | `noel-selene:3` | `{ stage: 'act3', full: 'selene' }` |

    - 既有的 `liz-noel:1 { stage: 'act3' }`、`noel-rin:2 { oath: true }` 不變。
    - 舊的 `safira-sylvie:2`、`liz-scarlet:2`、`noel-selene:2`、`rin-sylvie:1` 的閘門，由上表取代。
  - 搬移（內容逐字不動，裁定 10）：

    | 舊編號 | 新編號 |
    |---|---|
    | `safira-sylvie:2` | `safira-sylvie:3` |
    | `liz-scarlet:2` | `liz-scarlet:3` |
    | `noel-selene:2` | `noel-selene:3` |
    | `rin-sylvie:1` | `rin-sylvie:2` |

  - 草稿：其餘的新內容，照設計 §7.2–§7.4 與 §8 樣稿一原樣貼。
  - ~~`RENUMBERED: readonly SceneId[]`：上面四個舊編號。`STORY_IDS = 2`。~~（Task 4 做了，Task 5 取消時拿掉：沒有任何程式讀它們。）
  - 凍結註解改成設計 §9.3 第 11 點那一句：「發佈之前編號可以重排；重排的舊編號列進 `RENUMBERED`，讀檔時丟掉它們的看過紀錄。發佈之後，一個配對只往後加。」
  - `CHAT_COUNT.hero = 5`、`CHAT_GATE['chat:hero:5'] = { stage: 'act4' }`。草稿是設計 §7.4 的三句（安娜、洛恩、安娜）。
  - `story.zh-TW.ts`：
    - `export interface KeeperLine { text: string; if?: { returned?: TownFragmentId } }`；
    - `STORY.bellkeeper.oath: KeeperLine[]`：既有五句變成 `{ text }`，再加設計 §7.4 的兩句，「指路的少年」那一句帶 `if: { returned: 'glen' }`。
    - `after` 仍是字串陣列。
  - `engine/story/keeper.ts`（新）：`export function bellkeeperPool(s: GameState): string[]`。鐘守來過才有句子。終幕之後是 `after`；否則是 `oath` 過濾 `returned` 之後的 `text`。
  - `town.ts`：只把 `const keeper = …` 那一行改成 `const keeper = bellkeeperPool(game.state);`，加一行 import。後面組池子的程式不動，抽一次亂數，次數不變。

- [ ] **Step 1：寫失敗的測試**
  - `story.test.ts` `the depth design's banters, gates and the hero's fifth chat`：
    - 照上表斷言 `BANTER_COUNT` 與 `BANTER_GATE`（`toEqual`）；
    - ~~`RENUMBERED` 正好是四個舊編號，而且每一個都還是 `isSceneId`；~~（作廢）
    - `CHAT_COUNT.hero === 5`。
  - `story.test.ts` `gates agree with her choice`：
    - 帶 `seen` 含 `rin-confess` 的閘門都有 `oath: true`；
    - `beforeChoice` 不和 `oath`、`full` 同時出現；
    - 每一個 `pieces` 的數字 ≤ 該角色的 `chainLength`。
  - `story.test.ts` `the moved banters keep their beats`：
    - `pinBeat('banter:rin-sylvie:2', { oath: true }, /貓/)`；
    - 另外三段各釘一個舊內容的關鍵名詞，名詞由實作者從舊內容挑，寫在註解裡。
  - `story.test.ts`：`position()` 認得 `pieces`、`seen`、`beforeChoice`。
    - `pieces`：主角與凜用 `stageOf(第 n 片的 minDepth)`，夥伴用 `metStage`。
    - `seen`：取 `later(位置, 那些場景的位置)`。
    - `beforeChoice`：位置不變。
    - 凜選擇前的規則（`PRE_OATH_RIN`）套用到 `beforeChoice` 的閒聊；帶 `oath` 或 `seen: ['rin-confess']` 的算選擇之後。
    - 斷言：`position('scenes.banter:rin-scarlet:2.lines.0.text') === rinSeventh()`；`position('scenes.chat:hero:5.lines.0.text') === 'act4'`。
  - `keeper.test.ts` `the bellkeeper's line about the boy at the gate waits for Glen's piece`：
    - 鐘守來過、`returned` 不含 `glen` 時，`bellkeeperPool` 不含「指路的少年」那一句；含 `glen` 時有。
    - 終幕之後是 `after` 的四句。
  - `events.test.ts` `the seventh night opens after the confession, with Scarlet met`：用真的 `BANTER_GATE`，`rin-confess` 沒看過時 `banterOpen(…rin-scarlet:2)` 是 false，看過、有 oath 而且絲嘉蕾已遇見時是 true。
- [ ] **Step 2：跑測試**（`story.test.ts`、`events.test.ts`、`keeper.test.ts`、`handbook.test.ts`），預期失敗。
- [ ] **Step 3：實作**
  - 照 Interfaces 做。
  - 搬移之後跑 `git diff -M --stat` 與 `git diff`，確認四段的台詞逐字相同（只有 key 變了），報告附上這一段 diff。
  - 帳本 §5 的閘門表，每一條新閘門加一列，寫上理由。
- [ ] **Step 4：跑 Step 2 的指令，全綠**。
- [ ] **Step 5：收尾 G**，含 e2e（動到 `town.ts`）。
- [ ] **Step 6：commit** `feat(starlantern): friction banters and the moved ones, the hero's fifth chat, the bellkeeper's line that waits for Glen`。

### Task 5：舊存檔：坦白、換編號（**取消**）

> **使用者裁定（Task 4 之後）**：「舊存檔的問題不用管，我們根本還沒上線」。本任務整個不做：不加 `settleConfess`、`settleRenumbered`、`settleLoneMorning`、`story.ids`。Task 4 加的 `RENUMBERED`、`STORY_IDS` 已拿掉（沒有任何程式讀它們）。保留的是同一輪遊戲裡讀檔的一致性：`settleBellkeeper` 在坦白還在佇列時原樣回傳（Task 3）。計畫中既有的舊存檔整理（`settleOpening`、`settleBellkeeper`、`dropUnknownBanters`）早於本計畫，不動。下面的內容只留作紀錄。


**Files:**
- Modify: `engine/story/events.ts`、`engine/state.ts`（CRLF）、`engine/save.ts`（CRLF）、`engine/game.ts`（`boot` 一行）
- Test: `engine/story/events.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`

**Interfaces:**
- Consumes：Task 4 的 `RENUMBERED`、`STORY_IDS`。
- Produces:
  - `StoryState.ids?: number`；`newStory()` 帶 `ids: STORY_IDS`。
  - `isStory`：`ids` 必須是 undefined，或 ≥ 1 的整數。
  - `events.ts`：
    - `export function settleConfess(s: GameState): GameState`（裁定 4）；
    - `export function settleRenumbered(s: GameState): GameState`（裁定 3）；
    - `settleBellkeeper` 在佇列有 `rin-confess` 時原樣回傳。
    - `export function settleLoneMorning(s: GameState): GameState`（裁定 6 的舊存檔）：`mem:hero:9` 已看過、凜已選擇、終幕未過，而且 `hero-alone` 不在 `seen` 也不在 `queue` 時，把它排入佇列；其他情況原樣回傳。
  - `Game.boot`：`settleLoneMorning(settleRenumbered(settleConfess(settleBellkeeper(settleOpening(r.state)))))`。

- [ ] **Step 1：寫失敗的測試**
  - `events.test.ts`：
    - `an old save past her choice counts the confession as seen and new, and opens the seventh night`：
      - oath、`bellkeeper-arrives` 看過、絲嘉蕾已遇見、`rin-confess` 不在任何地方；
      - 整理之後，`seen`、`fresh` 都有 `rin-confess`；
      - `nextBanter` 可以挑到 `banter:rin-scarlet:2`（其他配對都先設成聽過）。
    - `an old save whose keeper still waits keeps him queued, and its confession counts as seen`。
    - `a save between her choice and her confession keeps both waiting`：佇列 `['rin-confess']`，兩個 settle 都原樣回傳。
    - `a save before her choice is untouched`。
    - `an old save past the ninth piece queues the lone morning at once`：`mem:hero:9` 看過、oath、終幕未過 → `hero-alone` 在佇列；終幕已過，或已經看過，就原樣回傳。
    - `the renumbered ids are dropped once per save`：
      1. `ids` undefined，`seen` 有 `banter:rin-sylvie:1` 與 `banter:safira-sylvie:2`（也在 `fresh`），`queue` 有 `banter:noel-selene:2`；
      2. 整理之後三個都不見了，`ids === 2`；
      3. 再把 `banter:rin-sylvie:1` 放回 `seen`，再整理一次：它還在。
  - `save.test.ts`：
    - `a story ids field must be a whole number`：`ids: 1.5` 是 corrupt；沒有 `ids` 是 ok。
    - `a new game saves its story ids`。
  - `game.test.ts` `boot brings an old save up to the confession and the new ids`：
    - 用 `MemoryStorage` 存一份沒有 `ids`、oath、鐘守看過、`seen` 有 `banter:rin-sylvie:1` 的存檔；
    - `Game.boot` 之後：`rin-confess` 在 `seen` 與 `fresh`，`banter:rin-sylvie:1` 不在 `seen`，`ids === 2`，`arrival` 不含 `rin-confess`。
- [ ] **Step 2：跑測試**（`events.test.ts`、`save.test.ts`、`game.test.ts`），預期失敗。
- [ ] **Step 3：實作**：照 Interfaces 做。註解寫上裁定 3、4 的理由。
- [ ] **Step 4：跑 Step 2 的指令，全綠**。
- [ ] **Step 5：收尾 G**，含 e2e（動到 `game.ts`）。
- [ ] **Step 6：commit** `feat(starlantern): old saves past her choice read the confession in the handbook; renumbered banter ids are dropped once`。

### Task 6：閒聊排程：先收尾、安靜的回城播兩段；收尾段在第三十層前播完

**Files:**
- Modify: `engine/story/events.ts`
- Test: `engine/story/events.test.ts`、`tests/e2e/starlantern.spec.ts`
- 已知會紅、照新形狀補（審查 I5）：
  - `events.test.ts` 約 458 行 `one banter per return, after the chat, behind every light story scene a return can bring`：改成「有回城對話時一段」，安靜的回城另由新測試管。
  - e2e 約 3004 行：斷言這次到達正好一段閒聊、最後一個是它的那一則。讓那一次回城有回城對話（或可播的配對不到三組），斷言照舊成立；做不到就照新規則改斷言。
  - 逐則列在報告裡。

**Interfaces:**
- Produces:
  - `nextBanter` 的優先順序照裁定 9：已開頭的配對 → 聽過最少 → `BANTER_PAIRS` 的順序。簽名不變。
  - `export function openPairs(s: GameState, gates?, count?): number`：現在有下一段可播的配對數。
  - `arrivalScenes` 照裁定 9 的條件，播一段或兩段。

- [ ] **Step 1：寫失敗的測試**（`events.test.ts`）
  - `a pair already started goes ahead of one not started`：自訂三組配對，其中一組已聽過 `:1`，`nextBanter` 回傳它的 `:2`。
  - `an expired banter does not start its pair`：`rin-sylvie:1` 過期、`:2` 開放，另一組沒開頭的配對照順序排在前面時，挑到的是那一組。
  - `a quiet return plays two banters when more than two pairs are ready`：
    - 佇列空、沒有回城對話、三組可播 → 兩段，而且是兩組不同的配對；
    - 兩組可播 → 一段；
    - 有重戲 → 零段；
    - `afterFinale` → 零段。
  - `scripted play: every payoff banter plays before the finale`：
    - 用 `base()`，從 t = 1 到 29，每個 t 是一次回城：
      - `reached.mainline = t`；
      - 每一位夥伴在 t ≥ 她 `MEETINGS` 的深度時相遇；
      - 每個人的 `memories` = `memoryPace(id)` 裡 ≤ t 的片數（主角、凜也一樣）；
      - **主角第九片照 `takePieces` 的做法**：t = 25 時把 `'mem:hero:9'` 推進 `story.queue`，不是當成在迷宮裡播過。它是收尾片，那一次回城不播閒聊；`hero-alone` 也由它在同一次 `onReturn` 排入；
      - 回城時 `onReturn`，接著 `arrivalScenes(chat: true)` 裡的每一場依序 `sceneDone(…, 'played')`；
      - 接著，若佇列有 `hero-alone`，而且裁定 6 的 `departScene` 條件成立（`mem:hero:9`、`bellkeeper-arrives` 都看過，沒有 `ALONE` 排著），也 `sceneDone`。
    - 斷言：第 29 次回城結束時，`rin-scarlet:3`、`rin-selene:2`、`safira-sylvie:3`、`liz-scarlet:3`、`noel-selene:3`、`chizuru-noel:2` 都在 `seen`。
    - 失敗訊息印出每一段的閘門打開的 t，以及實際播出的 t。
    - 用不到 `Game`，只用 `events.ts` 的純函式。
- [ ] **Step 2：跑測試**，預期優先順序與兩段的測試失敗，腳本測試可能失敗。
- [ ] **Step 3：實作**：照 Interfaces 做。腳本測試還是紅的話，照裁定 9 的退路處理一次；再不行，或原因是記憶鏈的進度，就停下來回報 NEEDS_CONTEXT。
- [ ] **Step 4：跑 `events.test.ts`，全綠**。
- [ ] **Step 5：收尾 G**，加上**引擎階段收尾**：
  - 全套；tsc；e2e。
  - `gate-engine` 跑完後 cmp 必須沒有輸出。
  - `git diff <BASE> --stat -- src/scripts/games/starlantern/ui2/scenes/battle.ts` 必須是空的。
- [ ] **Step 6：commit** `feat(starlantern): banters finish what they start, a quiet return plays two, every payoff lands before the finale`。

---

## 第二部分：寫作（照遊玩順序；每段 R1–R8）

### Task 7：Tasks 1–7 寫好的部分要改的（揭露、鐘守來到鎮上、第三幕、手冊、名單）

照 R1–R8。範圍是設計 §7.2 的 `mem:rin:4`、§7.3 的 `act3`、§7.4 的 `rin-reveal` 表與 `bellkeeper-arrives`、§7.5 的 `truths.after`。
- 這些鍵已經在 `POLISHED` 裡，所以 R1 的紅是下面這些 `pinBeat`（`story.test.ts`）。
- **`rin-reveal`**：
  - 正好十二句，順序照設計表。
  - 釘子：
    - 第 3 句旁白 `/繃帶/`；
    - 凜 `/收刀的.*是我/`；
    - 洛恩 `/一直沒問.*走/`，表情 `sad`；
    - 最後一句是洛恩的 `/明天也一起回來吧/`。
  - 沒有任何一句符合 `/像是早就知道/`。
  - `SPEC_QUOTES` 的四條不動。
  - 三個「自己」那一點交給 R8：念起來說教的話，第 8 句改成旁白轉述（設計 §9.2 已經允許）。
- **`bellkeeper-arrives`**：
  - 每種讀法 ≤ 10 句。
  - 釘子：凜 `/師父/`；鐘守 `/市集/`；鐘守 `/站在目標身後一步/`；洛恩 `/我叫洛恩/`；最後一句旁白 `/沒有再看他一眼/`。
  - 鐘守不和解（裁定 a）。
- **`act3`**：
  - 仍是十二句。
  - 釘子：旁白 `/按住了.*銅鐘/`；安娜 `/每隔幾十年/`。
  - 凜那一句在選擇前後都成立，不寫避開視線。
- **`truths.after`**：符合 `/十段/` 與 `/筆記/`，沒有「……」。
- **`mem:rin:4`**：第一句符合 `/抄/` 與 `/最後一道/`。
- **帳本**：
  - I-09、I-10 翻案（裁定 a）；
  - 記錄 `rin-reveal` 的偏離（裁定 c）；
  - 新條目：市集那一刀、名單抄自舊書。
- **聖經 §3 鐘守**：加上師父的身分與「不和凜和解」。
- 已知會被守門擋下：設計 `bellkeeper-arrives` 第 8 句「所以吾等才怕。這一回，我不動手」若被電報句守門抓到，就併成一句。

### Task 8：瑟蕾與千鶴

照 R1–R8。範圍是打磨計畫 Task 8 的鍵前綴與要求，再加上設計 §3.9、§3.10、§7.4 的 `mem:selene:5`。
- **起點**：先套舊 SDD `task-8-wip.patch` 裡的這兩個檔：`git apply --3way --include='src/scripts/games/starlantern/data/story.zh-TW.ts' --include='src/scripts/games/starlantern/data/story/story.test.ts' <patch>`。
  - `mem:selene:5` 的 hunk 會跟著套上，沒關係：本任務會整段改寫它。
  - 套不上的 hunk 照意思手動改，在報告裡列出。
  - `voice.test.ts` 的 `POLISHED` 那一行照草稿手動加（R1）。
- **`mem:selene:5`** 照設計 §7.4 那一列改寫：`if.oath` 兩種讀法，各四句。
  - 釘子：
    - `{ oath: true }`：瑟蕾 `/早就看見/`；
    - `{ oath: false }`：旁白 `/什麼也沒有說/`；
    - 兩種讀法都有 `/我想看見/`（`SPEC_QUOTES` 照舊）。
  - 每一種讀法都沒有 `/我不怕了/`。
  - 背影的方向是往上走、在出口前倒下。
- 瑟蕾的缺點（推給月亮）留在日常的笑點裡；她還不能說「是我說的，不是月亮」，那一句屬於 `rin-selene:2`。
- 千鶴：禮數是距離；不要寫成翻譯腔。
- **帳本**：I-60 的新月結局改成「出口前倒下」；新條目：背後的短刃（和凜第七片同一個畫面）。

### Task 9：莎菲拉與希爾薇

照 R1–R8。範圍是打磨計畫 Task 9 的鍵前綴與要求，再加上設計 §3.11、§3.12、§7.6 的 `mem:safira:5`、`mem:sylvie:5`。
- **`mem:sylvie:5`**：
  - 過去兩句照舊；現在兩句：洛恩 `/妳帶出來的/`，希爾薇 `/自己種/`。
  - 「人，我都帶出去了」改成完整的句子；電報句守門會抓舊的寫法。
  - `home:sylvie` 的發芽仍然接得上。
- **`mem:safira:5`**：
  - `SPEC_QUOTES`「妳要繼續跳。」不動。
  - 旁白 `/停下腳步/`；莎菲拉 `/一個一個想一遍/`。
  - 沒有 `/團長那一推/`。
- 定稿七（「新芽，我看過了。…」）逐字保留。
- **帳本**：她們最後一片的那一條，改成在現在做選擇。設計 §9.3 第 13 點列的是 I-63、I-66、I-67、I-78，先 grep 確認哪一條是誰的。

### Task 10：諾艾兒與波比

照 R1–R8。範圍是打磨計畫 Task 10 的鍵前綴與要求，再加上設計 §3.13、§3.14、§7.4 的 `mem:bobby:5`、§7.6 的 `mem:noel:4`、`mem:noel:5`。
- **`mem:noel:4`**：諾艾兒 `/怕我把自己燒光/`；旁白 `/撕下/`；`/親手還給老師/`。沒有 `/雨/`。
- **`mem:noel:5`**：第二句 `/那一頁/`。
- **`mem:bobby:5`**：正好一句 `/閥第一次點火/`，同一句也符合 `/不回來的光/`。`SPEC_QUOTES`「祖先造錯的東西，我來修好。」不動。重場景不用「喔」。
- **已知會被守門擋下（審查 I4）**：`chat:noel:2` 洛恩「好。一起回來。」（約 823 行，`if.notMet: 'liz'`）。全劇本的「一起回來」只留三句（裁定 15），這一句要改寫成不用這四個字，意思不變。
- 波比的「喔」照 `VOICE`；比例由裁定 2 的守門，在她的台詞全部進範圍時檢查（Task 15 之後）。
- **帳本**：I-111 加上「第一段不回來的光」；諾艾兒最後一片的那一條。

### Task 11：莉茲與絲嘉蕾

照 R1–R8。範圍是打磨計畫 Task 11 的鍵前綴與要求，再加上設計 §3.15、§3.16、§7.6 的 `mem:scarlet:5`。
- **`mem:scarlet:5`**：
  - `SPEC_QUOTES`「妳不是盾，妳是我的朋友。活下去。」不動。
  - 釘子：絲嘉蕾 `/撤退的號角/`；旁白 `/站到他旁邊/`。
  - 她第一次叫「洛恩」那一句，用旁白寫出停頓；既有的稱呼測試要成立。
  - 引號裡的「洛恩。從今天起…」若被「不以『洛恩。』開頭」的守門擋下，就寫成「洛恩，從今天起，我站這裡。」
- 定稿六、八，以及打磨 Task 2 改好的歐里克那一句，逐字保留。
- 莉茲的帳本思維（人會走，錢不會）是笑點，也是她的缺點，日常裡要讀得出來；揭露表的規則不變。
- **聖經 §3 絲嘉蕾**：強調新寫的句子也照「集滿前後的稱呼」。

> **控制者裁定（Task 11 審查後），留給之後的任務**：
> - 絲嘉蕾的心契「下次換我站旁邊」和她第 5 片（站到旁邊）重疊：寫羈絆時重新想（6e）。
> - 莉茲在現在要付出代價的選擇與她尖銳的摩擦，落在 `rin-confess`（Task 14）、`liz-scarlet:2`（Task 13）與羈絆三（6e）。
> - 絲嘉蕾的「……」已經用完（整份劇本六個：第 3 片、定稿六、`rin-confess`、`liz-scarlet:1`、`safira-scarlet:2`、`rin-scarlet:3`），之後的任務不能再給她新的。

### Task 12：日常的閒聊（十七段既有的輕閒聊）

照 R1–R8。**鍵前綴**是下面這些編號，每個寫成 `scenes.banter:<id>.`：
- bobby-chizuru:1、bobby-liz:1、bobby-noel:1、bobby-sylvie:1
- chizuru-rin:1、chizuru-safira:1、chizuru-scarlet:1
- liz-noel:1、liz-selene:1、liz-scarlet:1
- noel-rin:1、noel-selene:1
- rin-scarlet:1
- safira-scarlet:1、safira-sylvie:1
- scarlet-selene:1、selene-sylvie:1

要求：
- 打磨計畫 Task 13 的要求照舊：每段至少一個笑點；只看台詞也猜得出是誰；「你」只對洛恩說；凜選擇之前的規則。
- 這些段落裡埋的伏筆不能被改掉：`chizuru-rin:1` 的「另外半句，明天」、`bobby-chizuru:1` 的彈簧大人、`rin-scarlet:1` 的「吵」（設計 §6 的 16、17、樣稿一）。
- 釘子：這三個伏筆各一個 `pinBeat`。

### Task 13：第二、三幕的摩擦閒聊

照 R1–R8。**鍵前綴**：chizuru-noel:1、liz-scarlet:2、safira-sylvie:2、rin-sylvie:1、rin-selene:1、safira-scarlet:2、noel-selene:2、bobby-chizuru:2、bobby-sylvie:2。
- 內容照設計 §7.2、§7.3 的要點：笑點在前，刺在中間，最後一句是小笑點或小溫暖。
- **控制者裁定（Task 10 審查後，「……」的每人預算是硬性的）**：`safira-sylvie:2` 莎菲拉的「……」保留（她整份劇本的四個是第 2、4、5 片與這一句）；寫之前照每人預算再算一次。
- `rin-selene:1` 不提刀（修正一）。
- 釘子，每段一個情節要點：

  | 段落 | 釘子 |
  |---|---|
  | `liz-scarlet:2` | `/門後還有人/` |
  | `safira-sylvie:2` | `/後面的人就會跟/` |
  | `rin-sylvie:1` | `/追獵物/` |
  | `bobby-chizuru:2` | `/生氣一刻鐘/` |
  | `bobby-sylvie:2` | `/背帶/` |
  | `chizuru-noel:1` | `/借而不告/` |
  | `noel-selene:2` | `/少掉一點自己/` |
  | `safira-scarlet:2` | `/追思/` |

- 已知會被守門擋下的設計稿：
  - `noel-selene:2` 諾艾兒（`panic`）「妳、妳怎麼知道──」：結尾是「──」的子句算被打斷，可以；但輕場景的「……」只能一個。
  - 一段裡「本、本小姐」的結巴，最多一處。
- **聖經 §2.5**：加「好笑的場景可以有一句刺，刺不放最後」。
- **帳本**：
  - 新條目「追思日」（新的鎮上習俗）；
  - 莉茲交還有名字的碎片；
  - `rin-sylvie:1` 只在凜選擇前播，錯過就過期。

### Task 14：凜的坦白、一個人的清晨

照 R1–R8。**鍵前綴**：`scenes.rin-confess.`、`scenes.hero-alone.`。
- **`rin-confess`**：
  - 照樣稿二。畫面、每個人那一拍、句數結構都不變。
  - 已知會被守門擋下：
    - 絲嘉蕾「……我明白了。那麼，我有我的做法。」用「……」開頭，改成不在句首；
    - 最壞讀法說話九句，「……」的上限是 2。
  - 釘子：
    - 凜 `/靜鐘會/`；
    - 絲嘉蕾 `/退後三步/`（她已遇見時）；
    - 莉茲 `/欠我們一句實話/`；
    - 洛恩 `/走在我後面/`；
    - 瑪莎 `/這碗是妳的/`；
    - 最後一句旁白 `/喝得很慢/`。
  - 希爾薇的兩種讀法 `/追獵物/` 各一句。
  - **控制者裁定（Task 2 審查後）**：欠著的坦白可能在第三十層、終幕之前由 `finalePieces` 播出（裁定 8），那時不是「回城那天的晚飯」。開場的時間詞要有那種讀法自己的說法（例如用 `if` 條件句，或由 Task 3 提供能分辨的條件），兩種讀法都要過句數上限。
- **`hero-alone`**：
  - 照設計 §7.4 的九拍，每種讀法 ≤ 10 句。
  - 絲嘉蕾那一拍的五種讀法：稱呼照集滿前後；沒遇見她就是旁白。
  - 釘子：
    - 凜 `/得先過我這裡/`；
    - 凜 `/這就是下次/`；
    - 瑪莎 `/先吃了再走/`；
    - 最後一句旁白 `/大家一起下去/`。
  - 葛倫不出場（裁定 b）。
  - 「一起回來」不用（裁定 15）。
  - **控制者裁定（Task 2 審查後）**：
    - 絲嘉蕾引用的那一句要和原句一致：原句是「不必替我擋」（`chat:scarlet:2`），設計稿的『不必替人擋』要改成照原句引用。
    - 給 `hero-alone` 每一句說話台詞配表情（引擎任務貼的草稿沒有表情），只用 `moodsFor(說話者)` 已有的。
- 戀愛中立：凜攔門是她從 `first-return` 起的位置，不寫成告白；其他人的那一拍份量不能輸給她。
- **帳本**：新條目寫這兩場的事實（坦白的晚飯、七個晚上的守夜從這一晚開始、出發的清晨）。

### Task 15：選擇之後的閒聊與收尾

照 R1–R8。**鍵前綴**：rin-scarlet:2、rin-scarlet:3、rin-selene:2、rin-sylvie:2、chizuru-rin:2、chizuru-noel:2、noel-rin:2、safira-sylvie:3、liz-scarlet:3、noel-selene:3。這一段做完，`scenes.banter:` 全部在 `POLISHED` 裡。
- `rin-scarlet:2` 照樣稿一（定稿品質）。`rin-scarlet:3` 不說「選了人，不是命令」（修正五）。
- `rin-selene:2` 的最後一句是瑟蕾「是我說的，不是月亮」：符合 `/是我說的，不是月亮/`。這是伏筆 7 的回收，`pinBeat` 釘它。
- **控制者裁定（Task 8 審查後）**：`rin-selene:2` 的開頭要在 `mem:selene:5` 的兩種讀法之後都成立：沉默的那一種讀法裡，凜不可能知道瑟蕾看見過。寫成凜自己問，例：「瑟蕾，出口前那一刀，妳看見過吧。早一點說，…」。
- 搬過來的三段（`:3`）與 `rin-sylvie:2` 照打磨的標準修，不換內容。
- 已知會被守門擋下：
  - `chizuru-rin:2` 千鶴「……完整了。甚好。」用「……」開頭，而且是兩個短句；
  - `rin-selene:2` 瑟蕾「……對不起。…」用「……」開頭。
- 凜在這裡可以用「吧」，不用「呢」。
- **控制者裁定（Task 10 審查後，「……」的每人預算是硬性的）**：`rin-selene:2` 瑟蕾那一句不帶「……」，寫成「對不起。下一次看見什麼，我會先說。」；`chizuru-rin:2` 千鶴那一句可以留一個（她的預算算過了）。

### Task 16：終幕與星燈祭

照 R1–R8。**鍵前綴**：`finaleWait.`、`scenes.mem:hero:10.`、`scenes.finale.`、`scenes.epilogue.`、`endingTitle`、`finaleBossName`。
- **`finale`**：
  - 照設計 §7.5 的八拍。每種讀法 ≤ 16 句，說話句數另計，「……」照重場景的預算（裁定 13）。
  - 波比那一拍有三種讀法：集滿、遇見未集滿、沒遇見。都負責閥與「不回來的光」。
  - 鐘守一句：`/是我殺的/` 與 `/散了/`。
  - 凜交出鐘只寫旁白，凜沒有台詞。
  - 「交給燈」最多三句；「一起回來」用掉全劇本最後一次。
  - **控制者裁定（Task 10 審查後，「……」的每人預算是硬性的）**：終幕裡夥伴的台詞一個「……」都不用（瑟蕾、千鶴、莎菲拉、諾艾兒、波比等全部）；全場的三個留給凜、鐘守、洛恩。
  - 已知會被守門擋下：凜的最後一句設計稿「……洛恩。明天，大家也一起回來吧。」開頭是「……」，有「洛恩。」，還有「明天，」（電報句守門的自我測試，正好把這種寫法列為要抓的）。重寫時保留 `/一起回來吧/`，以及呼應揭露那一夜。
  - 取代打磨計畫 Task 14 的測試，在 `story.test.ts` 寫 `the finale costs his ten memories, the keeper says it, and Rin speaks last`。每一種讀法：
    - 洛恩正好一句 `/十段/`；
    - `who: 'bellkeeper'` 正好一句；
    - 凜正好一句，而且是最後一句；
    - 至少一句 `/閥/`；
    - 沒有 `/不送/`。
- **`epilogue`**：
  - 核心六句照設計 §7.5，上限 16。
  - **控制者裁定（Task 2 審查後，句數預算）**：鎮民的交還條件句（安娜的同伴、瑪莎的丈夫，好感 spec §8.5）併進瑪莎與安娜的核心那幾拍裡寫，不另外加句；上限維持 16。
  - 釘子：瑪莎 `/日記/`；瑪莎 `/回來了/`；`/登記表/`；最後一句是洛恩的。
  - 不提任何戀愛（好感 spec §8.5）。
- `mem:hero:10`：照打磨的標準修；「要回來」那一句是終幕回收的源頭，`pinBeat` 釘 `/要回來/`。
- **帳本**：
  - I-110、I-111、I-114 照設計 §9.3 第 13 點改；
  - 新條目：十片交給燈、星燈祭的日記。

### Task 17：鎮上的日常

照 R1–R8。**鍵前綴**：`townLines.`、`greet.`、`leads.`、`merchant.`、`absorb.`、`scenes.chat:hero:5.`。
- 照打磨計畫 Task 12a 的要求：固定梗每次回來都要變奏；城鎮台詞是旁白，鎮民的話放在「」裡。
- **加的句子**（設計 §7.3–7.5）：
  - `townLines.act3`：門口的紙、紅筆；酒館與麵包的價錢。
  - `townLines.act4`：三個會員的登記表；歐里克倒酒。
  - `townLines.after`：葛倫與老人並排坐，分半個麵包。
- **已知會被守門擋下（審查 I4）**：`townLines.act4` 那一句「洛恩和凜，總是一起出門，一起回來。瑪莎每晚都把湯，留在他們常坐的那張桌上。」（約 1711 行）。它用掉了「一起回來」（裁定 15），也只寫凜一個人，偏向戀愛線。改寫成全隊的畫面，例：瑪莎的桌子越併越長，不用「一起回來」。
- 第四幕的池子要以輕的為主（設計 §7.7）。加了兩句重的，至少再補一句輕的，或者把一句改輕。
- 釘子：
  - `townLines.act3` 有 `/霧就跟到哪/`、`/紅筆短了一截/`；
  - `townLines.act4` 有 `/登記表/`、`/請你的/`；
  - `townLines.after` 有 `/半個|一半/`；
  - `chat:hero:5` 安娜 `/登記表/`。
- **帳本**：門口的紙、三個會員、歐里克倒酒。

### Task 18：鎮民的交還與鐘守

照 R1–R8。**鍵前綴**：`scenes.town:`、`bellkeeper.`。
- **`town:glen`**：
  - 照設計 §7.3 改寫（裁定 b），≤ 8 句。
  - 釘子：`/穿長袍的年輕人/`；`/天沒亮/`；收尾 `/這一次，我記住了/`。
  - 不說「靜鐘會」。
  - **控制者裁定（Task 4 審查後）**：`town:glen` 要先寫出葛倫「想起來了」（他想起那個穿長袍的年輕人、自己替他指了路），鐘守「守門的那個人想起來了」那一句才接得上。
- **`bellkeeper.oath`**：
  - 設計的兩句定稿：「不准眨眼」那一句是無條件的；「指路的少年」那一句只在 `returned: 'glen'` 時播。
  - 其餘五句照聖經修。
- **`bellkeeper.after`**：保留設計的「那孩子笑起來的樣子」，讀成他遠遠看見她和別人笑，不是她對他笑。他可以提到她，但凜從不跟他說話、也不回應他，也沒有任何一句寫兩人和好（裁定 a）。
- 其他交還的場景：照打磨計畫 Task 12b 的要求（帳本 I-87 到 I-93 的事實與順序不動）。
- **帳本**：I-90（葛倫）加上指路；新條目：長袍的年輕人。

### Task 19：介面與教學的文字

照打磨計畫 Task 15 的 Files 與 Step 1–7，有兩處不同：
- commit 訊息是 `fix(starlantern): interface, tutorial and gear lore read naturally (story depth)`。
- 凜的技能名「還有。」保留（plan 8 帳本裁定）：守門要豁免技能與變體名稱。
- **不碰 SDD `off-limits.md` 列的鍵**（Task 1 Step 0 從 8h 的 diff 列出），也不碰 `T.rune`、`T.cmd`、`T.build`、`T.ui2.workshop`、`T.ui2.tree`。這些地方念起來不順的句子，列在報告裡，留給 8h 合併之後。

---

## 第三部分：收尾

### Task 20：收尾

**Files:**
- Modify: `data/story/voice.test.ts`（`POLISHED` 涵蓋全部）、`tests/e2e/starlantern.spec.ts`（截圖測試，插在 `prologue, Rin's first memory, …` 那一則後面）

- [ ] **Step 1：寫失敗的測試**
  - `voice.test.ts` `the polish covers the whole script`：照打磨計畫 Task 16 Step 1：每一個鍵都在 `POLISHED` 底下；「……」比例 ≤ 8%。
  - e2e `the depth scenes read inside the box, desktop and phone (story depth)`：
    - 用 `__starlanternDebug` 準備狀態：
      - 凜已選擇；全員已遇見；絲嘉蕾集滿；
      - 終幕已過；
      - `story.seen` 加上 `rin-confess`、`hero-alone`、`banter:rin-scarlet:2`、`finale`、`epilogue`。
    - 在 1280×720 與 390×844 下，從手冊重看這五場。
    - 每一句等打字結束後，斷言：
      - `.slx-talk .slx-text` 的 `scrollHeight <= clientHeight + 1`；
      - 名牌不溢出；
      - 沒有 console 錯誤、沒有 404。
    - 有 `SL_SHOTS` 時，每場存一張截圖，檔名 `<場景>-<寬>.png`：
      - `rin-confess` 存瑪莎「這碗是妳的」那一句；
      - `hero-alone` 存「得先過我這裡」；
      - `finale` 存洛恩交出十段記憶的那一句；
      - `banter:rin-scarlet:2` 存第一句；
      - `epilogue` 存瑪莎念日記的那一句。
- [ ] **Step 2：跑測試**。
  - `POLISHED` 漏掉的鍵，回到它所屬的任務補完，不在這裡改字。
  - 不屬於任何任務的鍵，加進 Task 19 的範圍，照 R1–R8 做完再回來。
  - 截圖測試抓到溢出：回報 NEEDS_CONTEXT，不改字級。
- [ ] **Step 3：整體驗收**（每一項的輸出都寫進 SDD `final.md`）：
  - 全套全綠。
  - tsc：總數 ≤ 基準（約 773），星燈迷宮底下 0 個。
  - 記憶體與鎖照規矩，跑 `gate-final`，cmp 沒有輸出。
  - e2e（4356、headless、靜音、重工作鎖）全綠，加上 `SL_SHOTS=.superpowers/sdd/2026-10-23-starlantern-story-depth/shots`。五場 × 兩種寬度共十張，交給使用者。
  - `readAloud` 全劇本的檔頭前後對照：「……」字串數與比例、各說話者的助詞數。
  - `expect(` 數。
  - `git diff <BASE> --stat -- src/scripts/games/starlantern/ui2/scenes/battle.ts src/scripts/games/starlantern/data/story/chains.ts` 是空的。
- [ ] **Step 4：commit** `test(starlantern): the story depth covers the whole script; its scenes read inside the box on desktop and phone`。
- [ ] **Step 5：給使用者的繁中摘要**（寫進 SDD `summary-zh.md`，十行以內，控制者轉交）。內容：
  - 改了什麼：坦白、清晨、終幕的代價、摩擦閒聊、星燈祭；
  - 截圖的路徑；
  - 要使用者看的地方：語氣、戀愛中立、代價重不重；
  - 已知的取捨：裁定 3、9 的退路有沒有用到。
- [ ] **Step 6：全分支審查**：控制者派一位全新脈絡的審查者，看整條分支對 `<BASE>` 的差異，用 `superpowers:requesting-code-review` 的做法。重點：
  - 舊存檔與出發流程；
  - 一次一場重戲有沒有讓任何場景永遠播不到；
  - 守門有沒有被放寬；
  - 釘子有沒有被改成什麼都不釘；
  - 帳本與劇本是否一致；
  - 戀愛中立。
