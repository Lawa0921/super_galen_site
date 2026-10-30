# 星燈迷宮 劇情 v6 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**：照 v6 spec（`docs/superpowers/specs/2026-10-30-starlantern-story-v6-design.md`）改寫星燈迷宮的劇情。內容包括：

- 淘金鎮、一切是謎；
- 只有洛恩與凜失憶；
- 夥伴的回憶改成坦白，四位改在鎮上加入；
- 靜鐘會重新設定；
- 碎片聽力；
- 洛恩的心聲；
- 活俠傳式對話。

**Architecture**：

- **大部分是文字**：`data/story.zh-TW.ts`、`data/bond.zh-TW.ts`、`data/bestiary.zh-TW.ts`。
- **程式只動五塊**：
  1. 心聲的台詞類型與畫面；
  2. 瑪莎的碎片先掉、碎片聽力的呈現；
  3. 鎮上加入的場景種類 `join:*`；
  4. 「現在的目標」一行；
  5. 守門測試的規則。
- 戰鬥、掉落數值、存檔版本都不動。

**Tech Stack**：TypeScript、vitest、Astro 靜態站；文字照文風聖經與設定帳本。

**SDD 目錄**：`.superpowers/sdd/2026-10-30-starlantern-story-v6/`。
- 每個任務的紅燈清單、朗讀稿、冷讀報告都放這裡。
- 閘門輸出放 `gate-<N>/`。

---

## 分期與 PR

| PR | 分支 | 內容 | 任務 | sim gate | 美術 |
|---|---|---|---|---|---|
| **1** 文件 | `docs/starlantern-story-v6` | v6 spec、文風聖經、設定帳本、本計畫 | （本 commit） | 不跑（只動 `docs/`） | 0 |
| **2** 碎片聽力與瑪莎的發現 | `feat/starlantern-story-v6-hearing` | 2.0 心聲的台詞類型與畫面；2.1 守門規則的新版；2.2 瑪莎的碎片先掉；2.3 吸收、撿取、賣出的呈現；2.4 瑪莎的發現場景與第一幕的公眾知識 | 2.0–2.4（5） | identical | 0 |
| **3** 鎮上加入 | `feat/starlantern-story-v6-join` | 3.1 `join:*` 場景種類與觸發；3.2 線索分兩種；3.3 四段 `join:*` 的文字；3.4 四段迷宮相遇的改寫 | 3.1–3.4（4） | identical | 0 |
| **4** 幕節點與靜鐘會 | `feat/starlantern-story-v6-society` | 4.1 `SPEC_QUOTES` 與教義；4.2 序章、`prologue-inn`、`first-return`；4.3 第二到四幕節點；4.4 凜的回憶、`rin-reveal`、`rin-confess`；4.5 鐘守 | 4.1–4.5（5） | identical | 0 |
| **5** 夥伴的坦白 | `feat/starlantern-story-v6-confess` | 5.0 提示字串與手冊分頁名；5.1–5.4 四十段坦白，每任務兩位 | 5.0–5.4（5） | identical | 0 |
| **6** 配套 | `feat/starlantern-story-v6-support` | 6.1 「現在的目標」；6.2 送禮與羈絆；6.3 圖鑑；6.4 手冊人物頁、真相頁、摘要 | 6.1–6.4（4） | identical | 0 |
| **7** 語氣改版其餘 | `feat/starlantern-story-v6-voice` | 7.1 回城對話；7.2 閒聊；7.3 招呼與城鎮每日台詞；7.4 夜晚的一拍改兩句；7.5 鎮民交還與歸鄉、春祭 | 7.1–7.5（5） | identical | 0 |
| **8** 終幕解凍 | `feat/starlantern-story-v6-finale` | 8.1 解凍與終幕、星燈祭改寫 | 8.1（1） | identical | 0 |
| 附錄（選配，不在本輪） | — | 坦白的信任門檻（好感度階段才開口；要先跑模擬） | — | — | — |

**和 v6 spec §9.5、impact 草案的偏離**：心聲的台詞類型與守門規則原本排在 PR 7。因為 PR 2 起的每一段文字都要用到它們，所以提前到 PR 2 的 2.0、2.1。PR 7 只剩「把其餘文字改寫成新語氣」。

**公會委託 PR C（委託文字，`docs/superpowers/plans/2026-10-29-starlantern-guild-quests.md`）**：
- 等本計畫的 PR 1 合併之後再寫，照新的文風聖經 §1.6 到 §1.8 與 v6 的人物卡。
- 安娜不推論；鎮民繞著自己的洞說話；夥伴的一句話可以說她的公開目標。

---

## Global Constraints

**使用者的方向（最高依據）**：v6 spec §0.1 的七句原話；「繼續吧」核准 v6 方向。
- 只有畫風與重大取捨找使用者。劇情、數值、技術規格由控制者決定。
- 終幕解凍是編劇裁定（v6 spec R14）。

**分支與基準**
- 每個 PR 的分支從開工時的 `origin/master` 開出。若本計畫的 PR 1 還沒合併，先 cherry-pick 它的 commit。
- 開工前 `git status` 乾淨；要改的檔案有別人未提交的修改，就 NEEDS_CONTEXT。

**模擬閘門與逐位元證據**
- 每一個碰到 `engine/`、`data/` 的任務都跑閘門；每個 PR 的第一個任務錄 `gate-0`。
- 指令：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-0 > <SDD>/gate-<N>.stdout`。
- 每一個任務：
  - 最後一行必須是 `gate: identical`；
  - `cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
- **本計畫沒有任何任務可以重錄 sim gate。** 文字任務一定是 identical；程式任務（2.0、2.2、2.3、3.1、6.1）也必須 identical，因為它們不碰戰鬥。
- `engine/parity.test.ts` 的 `PARITY_TASK` 維持 `between plans`。
- **既有的雜湊與快照一律不重錄**（`frozenScenes.test.ts` 在 PR 8 解凍是唯一的例外），每個碰 `engine/`、`data/` 的任務都跑。任何一個紅就 BLOCKED：
  - `engine/legacyFights.test.ts`
  - `engine/floors.snapshot.test.ts`
  - `engine/storyL.dive.test.ts`（`STORY_L_RECORD` 不准設）
  - `engine/guild.legacy.test.ts`
- 不用 `Math.random`、不讀 `Date`；不為新內容多抽任何既有的亂數串流。

**測試與檢查**
- **TDD**：先寫失敗的測試，確認它因為正確的理由失敗，再實作。寫作任務照下面的 W1 到 W7。
- **vitest**：
  - 單檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；
  - 全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。
  - 不准用 `npm run test`（那是 watch 模式）。
- **tsc**：`rtk proxy npx tsc --noEmit -p .`。`src/scripts/games/starlantern/` 與 `tests/e2e/starlantern*.ts` 底下要 0 個錯；全 repo 總數不多於 PR 開工時 `baseline.md` 記的值。
- **e2e**：`E2E_PORT=4353 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts --project=chromium --project=chromium-dpr125 --project=chromium-dpr150`。
  - 一律 headless、靜音。**絕不用 4354**，不結束任何程序。
  - **不用 Playwright MCP 或任何瀏覽器 MCP 工具**：`mcp__plugin_playwright_*`、Claude in Chrome、內建瀏覽器、computer-use。
- **重的工作**（閘門、e2e、全套）：
  - 之前先照控制者當時指定的 `heavy.lock` 規則；沒有指定時，PowerShell 的 `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` 要 ≥ 6291456（KB）。
  - 一次只跑一套。模擬器（LDPlayer）在跑時先問控制者。
- 本專案沒有 prettier、eslint。一次性的探測程式跑完就刪，絕不 commit。
- **測試修改規則**：
  - 每個任務的「已知會紅」列出既有測試與改法。
  - 只能照本計畫的「規則表」改門檻；不刪斷言；不加 `skip`、`only`、`todo`、`it.fails`。
  - 全套出現沒列到的紅燈，就 NEEDS_CONTEXT。

**存檔**
- `SAVE_VERSION` 不升、不寫遷移。
- 新欄位只有 `GameState.story.goals?: Record<string, number>`（6.1）。`engine/save.ts` 修復時遇到形狀不對就丟掉這個欄位。

**平衡（凍結）**
- `balance*.test.ts`、`builds.bands.*.test.ts`、`tierBands*.test.ts`、`tierBands.ts`、`buildBands.ts`、`legacyFights.test.ts` 一個字都不改。
- 不動任何數值旋鈕（含 `SHARD_*`、`TOWN_DROP`、`BOND_*`、店價、碎片價）。

**文字**
- 劇情文字在 `data/story.zh-TW.ts`、`data/bond.zh-TW.ts`、`data/bestiary.zh-TW.ts`；介面字串在 `data/text.zh-TW.ts`。
- 照文風聖經（v6 改版）與設定帳本（I-229 到 I-257）。新的小設定在同一個 commit 登記到帳本，從 I-258 起。
- `data/terms.test.ts`、`data/glyphs.test.ts` 照舊。每一個新字都要在字型裡；不用 ▶ ◀ ▸ ▾。
- 字級只有 12px 與 24px；SCSS 只改 `src/styles/_starlantern-ui.scss`，禁 `!important`、行內樣式、`element.style`。

**換行**
- 改檔前先跑 `git ls-files --eol <檔>`。
- 改完之後，`git diff --stat` 必須等於 `git diff --stat --ignore-cr-at-eol`；整檔被改寫就是換行壞了，立刻再改一次修回。
- CRLF 與混用的檔不可以用 `sed -i`；新檔一律 LF。
- 2026-10-30 量到的：
  - **LF**：`data/story.zh-TW.ts`、`data/story/*.ts`、`docs/superpowers/**/*.md`。
  - 其他檔（例如 `engine/{state,game,save}.ts`、`ui2/scenes/*.ts`、`data/text.zh-TW.ts`）照 guild 計畫的清單，動手前再量一次。

**git**
- 用完整路徑 `git add`，不可以 `git add -A` 或 `git add .`。
- Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不可以用 `git checkout -- <path>`、`restore`、`reset`、`stash`、`clean`、`worktree remove --force`；要撤回就再改一次檔案。
- 不 push，由控制者驗收後決定。不碰 `.env`。

**收尾 G（每個任務都做）**
1. 全套全綠；tsc 符合上面的條件。
2. 碰到 `engine/`、`data/` 時，跑閘門與 `cmp`，以及四個逐位元測試檔。
3. 動到 `ui2/`、`render/`、`src/styles/`、`tests/e2e/` 時，或改到的字串在 `tests/e2e/starlantern.spec.ts` 裡逐字出現時（先 grep），跑 e2e 三個專案並全綠。
4. 換行檢查。
5. 報告：
   - 新增與修改的測試名；
   - 全套兩行、tsc 數字、閘門與 e2e 結果（沒跑要寫理由）；
   - 改了哪些既有斷言；
   - 偏離本計畫的地方與理由。

**子代理**
- 實作者不派子代理。
- 冷讀與審查由控制者另派全新脈絡的代理，模型 Opus。
- 子代理一律不准用瀏覽器 MCP 或 computer-use。

---

## 規則表（守門測試怎麼改；2.1 一次做完，其餘任務只引用）

| # | 規則 | 位置 | 現在 | 改成 |
|---|---|---|---|---|
| T1 | 句數上限 `lineCap` | `data/story/scenes.ts:201-216`（`MAJOR_CAPS` 同檔） | 回城對話 3、閒聊 4、歸鄉 4、交還 8、群戲 14、羈絆 6／10、季節 10 | 回城對話 8、閒聊 10、歸鄉 8、交還 16、群戲 26、羈絆第一到三段 10、第四段 14、季節 14；新種類 `join` 24；`finale` 20、`epilogue` 16（PR 8 再定） |
| T2 | 相遇句數 | `data/story/story.test.ts:738-771` | 被救前 1–4、被救後 1–5，開頭必須是 `FOUND_LINE` | 被救前 1–6、被救後 1–12；開頭改成每人一句的發現句（`FOUND_LINES[id]`），鎮上加入的四位改測 `join:*` |
| T3 | 「！」 | `story.test.ts:2141-2148`、`:2312-2316`、`banterBreaks`（`:2375-2469`）；`data/bond.test.ts:148-154` | 輕場景每段 ≤3，只給 `LOUD` | 上限 `max(3, ⌈台詞句數 ÷ 4⌉)`；非 `LOUD` 的人每段最多 1 個；凜選擇前 0；心聲 0；`bond.test.ts` 的 `LOUD` 補上 `orik` |
| T4 | 兩字台詞與碎句 | `data/story/voice.test.ts:479-491`；`data/story/voiceGates.ts:74-79`（`INTERJECTIONS`）；`telegraphBreaks`（`:136-164`） | 兩字台詞只給凜、多蘭與插話詞 | `INTERJECTIONS` 加「為什麼、真的、等一下、什麼、然後呢、哪個」（計數符合 `WORD_LISTS_AT_TASK3` 的 ≤10 規則，`voiceGates.ts:93`；超過就同步改那個數字並寫理由） |
| T5 | 必含詞配額 | `voice.test.ts:544-558`（希爾薇 `SYLVIE_WORLD` ≥1/3）、`:612-618`（千鶴 `ERA` ≥1/3）；`story.test.ts:2318-2333`（設施固定梗 ≥5 或 6 個階段、歐里克每句推銷詞） | 比例 | 希爾薇、千鶴：**每段至少一句**；設施固定梗：每個階段至少一句；歐里克：每個階段至少一句推銷詞 |
| T6 | 群戲的形狀 | `voiceGates.ts:282-297`（`groupShapeBreaks`） | 8–14 句、最後一句是旁白 | 8–26 句；最後一句是旁白或心聲；第一句帶地點照舊 |
| T7 | 閒聊裡的洛恩 | `story.test.ts:2375-2469`、`:2668-2672` | 洛恩最多一句、最後一句不是洛恩 | 洛恩（台詞＋心聲）最多佔三分之一；最後一句不限 |
| T8 | 莎菲拉的矛盾 | `story.test.ts:3604-3625` 與 `:2266-2274` | 夜晚一拍禁「唷」「～」；閒聊至少一個「唷」或「呀」 | 夜晚一拍那條刪掉，統一用閒聊那條（7.4 做） |
| T9 | 「洛恩，」開頭 | `voice.test.ts:470-477` | 一場一句 | 每六句一句（無條件取整，最少一句） |
| T10 | 稱呼 | `story.test.ts:2203-2218` | 千鶴「〇〇姑娘」 | 千鶴「〇〇小姐」；`terms.test.ts` 加禁用：千鶴與歐里克的台詞不准有「姑娘」，全劇本不准有「一刻鐘」「時辰」 |
| T11 | 心聲 | 新：`voice.test.ts` | — | `inner` 只准 `who: 'hero'`、不准在 `ChoiceLine` 裡；每段 1–3 句（有心聲的段落）；≤30 字；不准「！」；計入 `lineCap`；受 `SPOILERS` 與主角片數門檻約束；文字以（開頭、）結尾 |
| T12 | 新的劇透測試（v6 spec §10.3） | 新：`story.test.ts` | — | (a) 看過瑪莎發現場景之前，洛恩以外的人不准同一句說「碎片」與「記憶」；(b) `act2` 看過之前，洛恩以外的人不准同一句說「燈」與「迷宮」；(c) 安娜的禁詞「燈芯、燈快乾、燈壞了」；(d) 「讓他休息」「被燈燒」只准出現在凜第六片以後、帶 `oath` 的句子、`AFTER_CHOICE` 場景、鐘守的句子 |
| T13 | 資訊邊界（保底） | 新：`voice.test.ts` | — | 夥伴的輕場景句子出現「我以前」「小時候」「我家」時，必須帶該人的片數條件（`full` 或 `seen: mem:<c>:n`）；洛恩或凜在場的輕場景，至少一句含失憶標記（「不記得」「醒來」「想不起」「手自己」「為什麼會」，或心聲） |
| T14 | `SPEC_QUOTES` | `story.test.ts:473-487` | 含「從深處走出來的，不是人」 | 移除這一句；加入「讓他休息，燈就會熄」（4.1 做） |
| T15 | 終幕快照 | `data/story/frozenScenes.test.ts:14-30`、`data/story/__fixtures__/frozen-scenes.json`；`data/bond.test.ts:257-258` | 不准重錄 | 8.1 用 `FROZEN_SCENES_RECORD=1` 重錄一次，commit 訊息寫「v6 spec R14：編劇裁定解凍」；之後重新凍結 |
| T16 | 句型綁定 | 例：`story.test.ts:2233-2255`（`meet:liz`）與各段的 `it` 釘子 | 綁定舊字句 | 每個改寫任務同步改自己那一段的釘子，只保留和揭露門檻有關的那一半；列在任務的「已知會紅」 |
| T17 | `GUEST_NEVER`、`REVEALED`、`UNDONE` | `story.test.ts:994-1047`、`:2082-2086` | 夥伴「想不起」的詞 | 詞表大多保留（語意改成「還不肯說」）；新增：莉茲的「爸爸」在 `mem:liz:3` 之後解鎖（只對洛恩、不在歐里克面前）；`LABYRINTH_HERE`（`voice.test.ts:405-424`）照舊適用坦白的「現在」那一半 |

---

## 寫作任務的固定步驟（W1–W7）

- [ ] **W1 紅**：
  - 在 `data/story/story.test.ts`（或任務指定的測試檔）寫本任務的釘子：
    - 每一段的鍵存在；
    - 本任務的 v6 事實出現，例如瑪莎的「說兩次」、凜的「還差」；
    - 舊的事實不再出現，例如「迷宮的意志」、安娜的「燈快乾」。
  - 跑本任務相關的測試檔。失敗清單存成 `<SDD>/task-<N>-red.txt`，確認它們因為正確的理由紅。
- [ ] **W2 讀**：
  - v6 spec 的相關段落；
  - 文風聖經 §1.6 到 §1.8、§2.3 到 §2.5、§3（本任務每一位說話者的 v6 條與聲音表）；
  - 帳本 §3 揭露表與本任務相關的 I-條目（含被標成 v6 的舊條目）；
  - `data/story.zh-TW.ts` 本任務要改的原文。
- [ ] **W3 寫**：
  - 先寫**場次表**，存成 `<SDD>/task-<N>-beats.md`：每一場誰和誰、各自的目標、誰擋著、場面結束時讀者多知道了什麼、誰的進度往前走、洛恩想要什麼、失憶或秘密在哪裡被看見。
  - 再寫台詞，照聖經 §1.6 的對話規則與 v6 spec §2.4 的檢查清單。
  - 新的小設定登記帳本（I-258 起），放在同一個 commit。
- [ ] **W4 守門**：W1 的釘子全綠；規則表 T1 到 T17 的守門全綠。
- [ ] **W5 綠**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern` 全綠，然後做收尾 G。
- [ ] **W6 朗讀稿**：
  - `STORY_DUMP=<SDD>/task-<N>-after.md rtk proxy npx vitest run src/scripts/games/starlantern/data/story/readAloud.test.ts`；
  - `STORY_DUMP_BLIND=1` 另出 `task-<N>-blind.md` 與 `.key.md`（`data/story/readAloud.ts`）。
  - 朗讀稿要把心聲標成「洛恩（心聲）」。2.0 會給 `readAloud.ts` 加上這個標記。
- [ ] **W7 冷讀**：控制者派一位沒讀過設計文件的全新讀者（Opus）。
  - **給他的**：`after.md`、`blind.md`，以及使用者核准的對話範例 `C:\Users\bag57\projects\story\notes\序章試寫\v7-談家教.md`，只用來校準語氣，不比劇情。
  - **不給他的**：聖經、帳本、spec。
  - **題目**：
    1. **這是人在對話嗎？** 出聲念，標出像旁白、像格言、像在寫作文、翻譯腔、說明書腔、缺字感的句子。
    2. 每一場：誰想要什麼？誰擋著？讀完之後，你更清楚誰在乎什麼了嗎？
    3. 接話測試：標出沒有接上一句的台詞。
    4. **你說得出每個人的目標與進度嗎？** 逐人寫一行。
    5. 這一場洛恩想要什麼、在想什麼、做了什麼決定？
    6. **誰知道得太多了？** 挑出「這個人現在不可能知道」或「她現在還不會說」的句子；以及「鎮上的人是不是比該有的更懂迷宮」。
    7. 盲測：十句各是誰說的。
    8. 最好與最差的一句，各附理由。
    9. 劇透：讀完這一批，你確定了誰的什麼秘密？碰到揭露門檻的任務照 W8 的對照組作法，另派只讀前一批的讀者，只有實驗組說出秘密時才算不及格。
  - **及格**：
    - 第 1、3 題的標記全部處理（改寫或寫明保留的理由）；
    - 第 2、4、5 題每場、每人都答得出具體的東西；
    - 第 6 題零句；
    - 第 7 題至少八句對；
    - 第 9 題沒有提前猜中的秘密。
  - 最多兩輪，第三輪由控制者裁定。讀者標出的句子附在任務報告裡，給使用者抽看。

---

## PR 2：碎片聽力與瑪莎的發現

### Task 2.0：心聲的台詞類型與畫面

**Files**
- Modify: `data/story.zh-TW.ts:21-44`（`ScriptLine` 加 `inner?: true`）與檔案前段的寫作小幫手（加 `H(text)`）。
- Modify: `ui2/story.ts`（台詞框：`inner` 不顯示名牌或顯示「心聲」，加 class）；`src/styles/_starlantern-ui.scss`（心聲的顏色與斜體，沿用既有色票）。
- Modify: `engine/story/handbook.ts` 的回放（同樣的樣式）；`data/story/readAloud.ts`（朗讀稿標「洛恩（心聲）」）。
- Test: `data/story/voice.test.ts`（T11）、`ui2/story.test.ts`、`data/story/readAloud.test.ts`。

**Steps**
- [ ] 在 `voice.test.ts` 寫 T11 的規則，用一段測試用的假場景驗證（它只接受洛恩、拒絕選項裡的 `inner`、拒絕「！」、拒絕超過三十字）。在 `ui2/story.test.ts` 寫「`inner` 的一句畫出心聲的 class、沒有名牌」。跑，確認紅。
- [ ] 實作型別、`H()`、畫面、回放、朗讀稿。
- [ ] 跑綠；e2e（`ui2/`、`src/styles/` 有動）；收尾 G。
- [ ] Commit：`feat(starlantern): hero inner-voice line type`

### Task 2.1：守門規則的新版（規則表 T1–T7、T9、T10、T12、T13、T17）

**Files**
- Modify: `data/story/scenes.ts`、`data/story/voiceGates.ts`、`data/story/voice.test.ts`、`data/story/story.test.ts`、`data/bond.test.ts`、`data/terms.test.ts`。
- 已知會紅：沒有現有文字會因為**放寬**而紅。新的 T10、T12、T13 會讓現有文字紅：
  - 千鶴的「姑娘」：`S:1638`、`S:1677`、`S:1690`、`S:1953`，以及羈絆檔（`data/bond.zh-TW.ts:314`、`:333`、`:371`、`:923`、`:988` 一帶，含「一刻鐘」「時辰」）；
  - 「一刻鐘」：`S:1907-1911` 與羈絆檔；
  - 安娜的 `act2`、`act4`（`S:405-406`、`S:441-442`）；
  - 第一幕以前把碎片說成記憶的句子（`truths.act1` `S:2461`、`greet.guild.act1` `S:2367`）。
- 這一個任務**同時把這些句子改到合規**，用最小的改法：
  - 換稱呼、換「一杯茶的時間」；
  - 安娜那兩句照 v6 spec §7.2 移給洛恩或刪掉；
  - `greet.guild.act1` 加 `if.seen` 等瑪莎的發現（2.4 寫好之前，先條件化到一個不存在的鍵會讓它不播，所以這一句等到 2.4 一起改）。

**Steps**
- [ ] W1：先寫 T10、T12、T13 的新守門與 T1–T7、T9 的放寬，跑，確認新守門因為上面列的句子紅、放寬的測試照舊綠。
- [ ] 改上面列的句子；登記帳本（若有新的小事實）。
- [ ] W4、W5；收尾 G（閘門）。
- [ ] Commit：`test(starlantern): v6 voice and boundary gates`

### Task 2.2：瑪莎的碎片一定第一個掉

**Files**
- Modify: `engine/story/fragments.ts:35`（`townFragmentEligible`）或掉落挑選處。
- Test: `engine/story/fragments.test.ts`。
- **硬性約束**：亂數的抽取次數與順序不准變。
  - 做法是「替換」：瑪莎還沒交還時，第一個本來會掉的鎮民碎片換成瑪莎的；其他鎮民的資格與抽取照舊。
  - 不是「過濾」，過濾會改變抽取。
  - 跑 `storyL.dive.test.ts`、`floors.snapshot.test.ts` 與閘門。任何一個動了就 BLOCKED，回報控制者。

**Steps**
- [ ] 寫測試：
  - 瑪莎還沒交還時，任何地區、任何深度第一個掉的鎮民碎片都是她的；
  - 交還之後照舊；
  - 抽取次數相同：用計數包裝的亂數比較改前、改後。
- [ ] 確認紅，實作，跑綠；逐位元四檔；收尾 G。
- [ ] Commit：`feat(starlantern): marta's fragment drops first`

### Task 2.3：吸收、撿取、賣出的呈現（只動顯示）

**Files**
- Modify: 吸收台詞的呈現處（帳本 I-108；`ui2/` 裡用 `STORY.absorb` 的地方，先 grep）。改成「洛恩聽見：「……」」。
- Add: `data/story.zh-TW.ts` 的撿取心聲池 `STORY.pickupInner`（約二十句）與賣出心聲池 `STORY.sellInner`（約八句，第一幕以後）。
- 顯示位置：撿取用既有的撿取提示；賣出用交易所的結果訊息。
- Test: 對應的 `ui2/` 測試；`story.test.ts`（池子的守門：T11、長度、不提任何人的揭露詞）。
- **約束**：
  - 挑哪一句用既有的非戰鬥亂數，或用確定性的索引（例如已撿取數取餘數）；**不准**多抽戰鬥或掉落的串流。
  - 先查 `engine/story/fragments.ts:100-113` 的 `absorbRng` 用法；若沒有可用的串流，就用確定性索引。

**Steps**
- [ ] W1 寫守門與畫面測試，確認紅。
- [ ] 實作。
- [ ] W3 寫兩個池子：每句是洛恩的心聲，好笑或擔心，不碰揭露詞。
- [ ] W4 到 W7。
- [ ] Commit：`feat(starlantern): lorne hears the shards`

### Task 2.4：瑪莎的發現場景與第一幕的公眾知識

**Files**
- Modify: `data/story.zh-TW.ts` 的 `TOWN_SCENES.marta`（`S:1463-1474`）。
  - 改成發現版，範本見 v6 樣稿；地點改成旅館廚房。
  - 原稿的資訊全部保留：說了兩次、日記是寫給他的、復活羽毛、多添一道菜。
- Modify: `greet.guild.act1`（加 `if.seen: 'town:marta'`，並給沒看過時的版本）、`truths.act1`、其他第一幕以前把碎片說成記憶的字串（T12-a 會抓）。
- Test: `story.test.ts`（瑪莎場景的釘子；T12-a 全綠）。

**Steps**
- [ ] W1 到 W7。冷讀另加一題：「讀完這一場，你覺得碎片是什麼？鎮上的人知道嗎？」
- [ ] Commit：`feat(starlantern): marta's day, the first shard heard`

---

## PR 3：鎮上加入

### Task 3.1：`join:*` 場景種類與觸發

**Files**
- Modify: `data/meetings.ts`（`MEETINGS` 加 `how: 'dungeon' | 'town'`）、`data/story/scenes.ts`（`SceneKind` 加 `join`、`lineCap` 24、`SCENE_IDS`、`POLISHED`）、`engine/story/events.ts`（回城佇列：門第一次出現或本道到第五層，就排入 `join:<c>`；播完把她加入隊伍）。
- Modify: `ui2/rescue.ts`（只給迷宮四位）。
- Test: `engine/story/events.test.ts`、`data/meetings` 相關測試、`ui2/rescue.test.ts`。
- **硬性約束**：
  - **地圖生成不准變**：`rescuesFor` 對鎮上四位照舊產生那一格相遇房的位置與內容，房裡只是沒有人加入。
  - **`favouredRegions` 不准變**：照舊把還沒遇見的人的地區算進去，這樣她的門會早點出現，觸發她的加入。
  - 跑 `floors.snapshot.test.ts`、`storyL.dive.test.ts`（本道第六層原本是波比的相遇房）、閘門。任何一個動了就 BLOCKED。

**Steps**
- [ ] 寫測試：
  - 門第一次出現後回城，`join:safira` 進佇列；
  - 播完她在隊伍裡；
  - 迷宮裡她的那一格不再觸發相遇；
  - 地圖雜湊不變。
- [ ] 確認紅，實作，跑綠；e2e；收尾 G。
- [ ] Commit：`feat(starlantern): companions who join in town`

### Task 3.2：線索分兩種

**Files**
- Modify: `engine/story/leads.ts:15-33`；`data/story.zh-TW.ts` 的 `LEADS`（鎮上四位改成公會的介紹或鎮上的傳聞）；`ui2/scenes/gate.ts`（傳送門上的標記：鎮上四位不標「目擊」）。
- Test: `gate.test.ts`、`engine/story/leads.test.ts`；`story.test.ts:2356-2368` 的固定畫面釘子同步改。

**Steps**
- [ ] W1 到 W7（文字部分）。
- [ ] Commit：`feat(starlantern): guild introductions for town joins`

### Task 3.3：四段 `join:*` 的文字

**Files**
- Modify: `data/story.zh-TW.ts`（新的 `JOIN`：莎菲拉、希爾薇、莉茲、波比）。莎菲拉、莉茲的範本見 v6 樣稿。
- 每段要讓玩家看到：
  - 她的公開目標與進度起點；
  - 她的秘密露出的那一角；
  - 洛恩為什麼接受、她為什麼需要洛恩；
  - 洛恩與凜的失憶至少一次。
- 莉茲的那一段同時有歐里克在場（他的禁詞照舊）。
- Test: `story.test.ts`（每段的釘子；`introIndex` 的規則延伸到 `join:*`：她的名字出現在她自己的台詞）。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): four town joins`

### Task 3.4：四段迷宮相遇的改寫

**Files**
- Modify: `MEET.selene`、`MEET.chizuru`、`MEET.noel`、`MEET.scarlet`（`S:2085-2212`）；`FOUND_LINE` 改成 `FOUND_LINES[id]`（每人一句，例：「冰裡有人。」「前面有人在亂放雷。」）。
- 已知會紅：`story.test.ts:738-771`（T2）、`ui2/rescue.test.ts`、`dungeon.test.ts` 裡釘住瑟蕾的發現句（帳本 I-64）。照 T2 改。

**Steps**
- [ ] W1 到 W7。瑟蕾要認出洛恩但不說；千鶴報出自己是誰；諾艾兒嘴硬、發現自己一個人到不了；絲嘉蕾認出城門。
- [ ] Commit：`feat(starlantern): dungeon meetings with their own reasons`

---

## PR 4：幕節點與靜鐘會

### Task 4.1：`SPEC_QUOTES` 與教義

**Files**
- Modify: `story.test.ts:473-487`（T14）；`data/story.zh-TW.ts` 的 `mem:rin:4`（`S:343-352`，新教義句）、`mem:rin:6`（`S:362-370`，交刀的那一句；句數上限若不夠就照 T1 的回憶上限加一句並寫理由）。
- 已知會紅：`SPEC_QUOTES` 舊句、`mem:rin:4` 的釘子。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): the society's doctrine, rewritten`

### Task 4.2：序章、`prologue-inn`、`first-return`

**Files**
- Modify: `S:264-313`。
  - 序章開場的散文旁白改掉。
  - 洛恩醒來念「我答應過要回去」（葛倫轉述）。
  - `prologue-inn`：凜的人情帳第一次說出口。
  - `first-return`：「一次。還差兩次。」
- 心聲：每場一到三句。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): the opening, with a promise and a debt`

### Task 4.3：第二到四幕節點

**Files**
- Modify: `act1-after`、`act2`、`act3`、`act4`（`S:389-450`）；`group:act2`、`group:act3`、`group:act4`（`S:453-510`，照 v6 樣稿與 v6 spec §6.2）。
- 已知會紅：`groupShapeBreaks`（T6 已放寬）、`act4` 的凜的句子的釘子、帳本 I-37、I-38 引文的測試（若有）。
- v6 的重點：
  - 第二幕的牆由洛恩聽見；
  - 第三幕可以加老冒險者的「合掌」傳聞；
  - 第四幕的教義換成新句、安娜那句刪掉、凜選擇之後的句子改寫；
  - 群戲每個人從自己的目標開口，有人提錯的霧理論。

**Steps**
- [ ] W1 到 W7。冷讀第 6 題特別問：「第四幕讀完，你覺得誰知道燈和霧的關係？」
- [ ] Commit：`feat(starlantern): acts two to four, heard and argued`

### Task 4.4：凜的回憶、`rin-reveal`、`rin-confess`

**Files**
- Modify: `mem:rin:1–7` 的「現在」那一半（照 v6 的人情帳與教義碎句）、`rin-reveal`（`S:669-685`，加半句教義）、`rin-confess`（`S:690-712`）、`chat:rin:1–4`。
- 主角第七片（`S:566-574`）的「他們在怕什麼？」也在本任務改。

**Steps**
- [ ] W1 到 W7。冷讀加對照組（第 9 題）。
- [ ] Commit：`feat(starlantern): rin's debt and the doctrine she was raised on`

### Task 4.5：鐘守

**Files**
- Modify: `bellkeeper-arrives`（`S:720-736`）、`STORY.bellkeeper.oath` 與 `after`（`S:2321-2340`）。終幕那一句留給 PR 8。
- 已知會紅：`story.test.ts:2288-2316` 的鐘守守門（「……」與「！」）與 I-94、I-119 的釘子（若有）。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): the bellkeeper pities him`

---

## PR 5：夥伴的坦白

### Task 5.0：提示字串與手冊分頁名

**Files**
- Modify: 迷宮裡的「〇〇想起了什麼。」（`data/text.zh-TW.ts:350` 附近與 `ui2/battleText.ts:65` 附近，先 grep）。夥伴改成「〇〇撿起了什麼，收了起來。」，洛恩與凜不變。
- Modify: 手冊的分頁名，夥伴是「心事」（`ui2/scenes/handbook.ts`）。
- Test: `ui2/battleText.test.ts`、`ui2/scenes/handbook.test.ts`、`ui2/scenes/dungeon.test.ts:696` 附近；e2e 先 grep 字串。

**Steps**
- [ ] 寫測試，確認紅，實作，跑綠；e2e；收尾 G。
- [ ] Commit：`feat(starlantern): companions confide, they do not remember`

### Task 5.1–5.4：四十段坦白（每任務兩位）

| 任務 | 人物 | 檔案範圍 |
|---|---|---|
| 5.1 | 瑟蕾、千鶴 | `S:809-944` |
| 5.2 | 莎菲拉、希爾薇 | `S:945-1078` |
| 5.3 | 諾艾兒、波比 | `S:1079-1215` |
| 5.4 | 莉茲、絲嘉蕾 | `S:1216-1360` |

範圍內也包括這兩位的 `chat:*`，因為它們會碰到她們的秘密。

**規則**
- 照 v6 spec §6.2 的坦白表。資料鍵、句數上限、`full`／`notFull`／`oath` 的讀法不變。
- 「過去」那一半改成她說的話，或旁白轉述她說的事；「現在」那一半寫出她為什麼今天說。
- 家鄉的中期發現照 §6.3。
- 帳本 I-245 到 I-252 是事實來源。
- 已知會紅：各人的 `it` 釘子（T16）、`GUEST_NEVER`、`REVEALED`、`UNDONE`（T17），以及 `SPEC_QUOTES` 裡她們的句子。這些句子保留原字，例如「妳要繼續跳。」「祖先造錯的東西，我來修好。」「妳不是盾，妳是我的朋友。活下去。」

**Steps**
- [ ] 每個任務做 W1 到 W7；W7 第 6 題特別問「她說的事，她那時候知道嗎」。
- [ ] Commit 範例：`feat(starlantern): selene and chizuru confide`

---

## PR 6：配套

### Task 6.1：「現在的目標」

**Files**
- Create: `data/story/goals.ts`（v6 spec §8 的表；條件用 `linesWhen`）。
- Modify: `engine/state.ts`、`engine/save.ts`（`story.goals?`，只加不升版，修復時丟掉形狀不對的值）；`ui2/scenes/status.ts`（頁首一行）、`ui2/scenes/handbook.ts`（人物頁最上面一行）；劇本裡設定數字的句子（例如莉茲的存款）加一個標記欄位，由播放場景時寫入。
- Test: `data/story/goals.test.ts`（每人每個條件都有一行、每一行過 T12 與各人的禁詞）、`engine/save.test.ts`、`ui2/scenes/status.test.ts`、`ui2/scenes/handbook.test.ts`。

**Steps**
- [ ] 寫測試，確認紅，實作，跑綠；e2e；收尾 G（閘門必須 identical）。
- [ ] Commit：`feat(starlantern): everyone's current goal`

### Task 6.2：送禮與羈絆

**Files**
- Modify: `data/bond.zh-TW.ts`：
  - 婉拒的台詞從「想不起」改成「還不想談」；
  - `bond:*:1–4` 照新文風與 v6 人物卡；
  - 第四段拆掉「以前我以為／在這裡」的共用句型；
  - 戀愛與後日談若提到相遇的方式，同步改成加入。
- 已知會紅：`data/bond.test.ts` 的釘子（T16）。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit 若太大就分兩個：`bond:*:1–3` 一個、`4`／後日談／戀愛一個。

### Task 6.3：圖鑑

**Files**
- Modify: `data/bestiary.zh-TW.ts` 裡三十句帶 `after: { seen: ['mem:…'] }` 的句子：「她想起」改成「她說過」。鍵不動。
- Test: `data/bestiary.test.ts`。

**Steps**
- [ ] W1 到 W5。W7 只做第 1、6 題。
- [ ] Commit：`feat(starlantern): bestiary lines, as told`

### Task 6.4：手冊人物頁、真相頁、摘要

**Files**
- Modify: `PEOPLE`（`S:2015-2074`）、`STORY.truths`（`S:2459-2466`）、每一段的 `summary`。
  - 手冊仍是洛恩的筆記；
  - 第一段寫加入時看得到的事；
  - 真相頁照 v6 spec §1.3 的階梯。
- Test: `story.test.ts:773-779`（一到三句）與 T12。

**Steps**
- [ ] W1 到 W5；W7 只做第 1、6 題。
- [ ] Commit：`feat(starlantern): lorne's notes, v6`

---

## PR 7：語氣改版其餘

- **Task 7.1 回城對話**：`chat:*`，凜與洛恩的第二到四段除外，它們在 4.4 已做。
- **Task 7.2 閒聊**：`banter:*` 三十六段。每段改成兩人的目標互相拉扯，不再是四句短劇；T7 已放寬洛恩的份量。
- **Task 7.3 招呼與城鎮每日台詞**：`greet`、`town.*.after`、`townLines`、`leads`。
  - 民間說法表（帳本 I-230）當日常的梗。
  - `townLines` 從旁白散文改成鎮民的兩句對話。這需要一個「兩句一組」的資料形狀與畫面：先寫測試、再實作，跑 e2e。
- **Task 7.4 夜晚的一拍改兩句**：`NIGHT_BEATS` 改成一拍兩句（夥伴一句、洛恩回一句或心聲），T8 在本任務做。
  - 改 `engine/story/nights.ts` 的 `nextBeat` 與 `events.test.ts` 的「一輪不重複」測試，抽取方式不准變（游標照舊一次前進一拍）。
- **Task 7.5 鎮民交還、歸鄉、春祭**：`TOWN_SCENES` 的其他四位（各自來拜託洛恩，照 v6 樣稿的安娜那一段）、`HOME`、`SEASON`。

每個任務都做 W1 到 W7；7.3、7.4 的程式部分先測試再實作，跑 e2e。Commit 一任務一個。

---

## PR 8：終幕解凍

### Task 8.1：終幕與星燈祭

**Files**
- Modify: `finale`（`S:1369-1421`）、`epilogue`（`S:1424-1438`）、`finaleWait`。
  - 鐘守的最後一句照帳本 I-255。
  - 洛恩聽見燈裡「很擠」。
  - 「燈裡有……」的七句疊句改寫。
  - 夥伴交出的那一段，改成她加入的那一刻或她的目標。
- Modify: `data/story/scenes.ts` 的 `MAJOR_CAPS`（`finale` 20、`epilogue` 16，照 T1）。
- 重錄 `data/story/__fixtures__/frozen-scenes.json`：`FROZEN_SCENES_RECORD=1 rtk proxy npx vitest run src/scripts/games/starlantern/data/story/frozenScenes.test.ts`，只此一次。
- commit 訊息寫「v6 spec R14：編劇裁定解凍；使用者要求拿掉文學腔的終幕」。

**Steps**
- [ ] W1：寫終幕的釘子：鐘守的新句、「很擠」、`SPEC_QUOTES`。
- [ ] 確認紅，W2 到 W4。
- [ ] 重錄快照。
- [ ] W5：跑兩次 `frozenScenes.test.ts`，第二次不設環境變數，確認通過。
- [ ] W6、W7：冷讀第 1 題特別問「終幕哪一句像格言」。
- [ ] Commit：`feat(starlantern): the finale without the refrain (v6 R14)`

---

## 附錄：選配的信任門檻（不在本輪）

坦白第 n 段除了撿到，還要好感度到某一階。

- **循環依賴**：`bondPoints` 把片數算進好感度（`engine/story/bond.ts:82`），要先改成算「撿到的遺物數」，或只看送禮與聊天的點數。
- **要先跑模擬**：確認不會卡關。
- 需要控制者另開計畫。
