# 星燈迷宮 劇情 v6 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**：照 v6 spec（`docs/superpowers/specs/2026-10-30-starlantern-story-v6-design.md`，下稱 v6 spec）改寫星燈迷宮的劇情。內容包括：

- 淘金鎮、一切是謎；
- 只有洛恩與凜失憶；
- 夥伴的回憶改成坦白，四位改在鎮上加入；
- 靜鐘會重新設定；
- 碎片聽力；
- 洛恩的心聲；
- 活俠傳式對話。

**Architecture**：

- **大部分是文字**：`data/story.zh-TW.ts`、`data/bond.zh-TW.ts`、`data/bestiary.zh-TW.ts`。
- **程式只動六塊**：
  1. 心聲的台詞類型與畫面；
  2. 發現之前的介面字串；
  3. 鎮民碎片在瑪莎之前「認不出」的呈現與交還層；
  4. 碎片聽力的呈現；
  5. 鎮上加入的場景種類 `join:*`；
  6. 「現在的目標」一行，以及守門測試的規則。
- 戰鬥、掉落（`lootFragments`、`engine/story/expect.ts`）、數值、存檔版本都不動。

**Tech Stack**：TypeScript、vitest、Astro 靜態站；文字照文風聖經與設定帳本。

**語氣的校準錨點**：`docs/superpowers/story/v6-sample.md`（使用者看過的 v6 樣稿，R37）。寫手在 W2 讀；冷讀者在 W7 拿它當範例。

**SDD 目錄**：`.superpowers/sdd/2026-10-30-starlantern-story-v6/`。
- 每個任務的紅燈清單、朗讀稿、冷讀報告都放這裡。
- 閘門輸出放 `gate-<N>/`。

---

## 分期與 PR

| PR | 分支 | 內容 | 任務 | sim gate | 美術 |
|---|---|---|---|---|---|
| **1** 文件 | `docs/starlantern-story-v6` | v6 spec、文風聖經、設定帳本、本計畫、樣稿 | （文件 commit） | 不跑（只動 `docs/`） | 0 |
| **2** 碎片聽力 | `feat/starlantern-story-v6-hearing` | 2.0 心聲的台詞類型與畫面；2.1 守門規則的新版；2.2 發現之前的介面字串；2.3 鎮民碎片在瑪莎之前認不出；2.4 聽見的呈現；2.5 認出瑪莎與第二幕的牆 | 2.0–2.5（6） | identical | 0 |
| **3** 鎮上加入 | `feat/starlantern-story-v6-join` | 3.1 `join:*` 與觸發；3.2 線索分兩種；3.3 四段 `join:*` 的文字；3.4 四段迷宮相遇的改寫 | 3.1–3.4（4） | identical | 0 |
| **4** 幕節點與靜鐘會 | `feat/starlantern-story-v6-society` | 4.1 `SPEC_QUOTES` 與教義；4.2 序章、`prologue-inn`、`first-return`；4.3 第二到四幕節點與群戲；4.4 凜的回憶與揭露；4.5 鐘守 | 4.1–4.5（5） | identical | 0 |
| **5** 夥伴的坦白 | `feat/starlantern-story-v6-confess` | 5.0 提示字串與手冊條目名；5.1–5.4 四十段坦白 | 5.0–5.4（5） | identical | 0 |
| **6** 配套 | `feat/starlantern-story-v6-support` | 6.1 「現在的目標」；6.2 送禮與羈絆；6.3 圖鑑的門檻；6.4 手冊人物頁、真相頁、摘要 | 6.1–6.4（4） | identical | 0 |
| **7a** 回城對話 | `feat/starlantern-story-v6-chat` | 7a.1 夥伴的回城對話；7a.2 洛恩與鎮民的回城對話 | 7a.1–7a.2（2） | identical | 0 |
| **7b** 其餘的日常 | `feat/starlantern-story-v6-daily` | 7b.1 閒聊；7b.2 招呼、線索與城鎮每日台詞；7b.3 夜晚的一拍改兩句；7b.4 鎮民交還、歸鄉、春祭 | 7b.1–7b.4（4） | identical | 0 |
| **8** 終幕解凍 | `feat/starlantern-story-v6-finale` | 8.1 解凍與終幕、星燈祭改寫 | 8.1（1） | identical | 0 |
| 附錄（選配，不在本輪） | — | 坦白的信任門檻 | — | — | — |

**和草稿的偏離**（v6 草稿的 impact §9；R35、R36）：
- 心聲的台詞類型與守門規則原本排在最後，提前到 PR 2 的 2.0、2.1，因為 PR 2 起的每一段文字都要用到它們。
- PR 7 拆成 7a（回城對話）與 7b（其餘日常）。
- 夥伴的 `chat:*` 只在 7a 改，不在 5.x。

---

## Global Constraints

**使用者的方向（最高依據）**：v6 spec §0.1 的七句原話；「繼續吧」核准 v6 方向；控制者的裁定 R1 到 R41（v6 spec §0.2、§0.3）。
- 只有畫風與重大取捨找使用者。劇情、數值、技術規格由控制者決定。
- 終幕解凍是編劇裁定（R14）。

**分支與基準**
- 每個 PR 的分支從開工時的 `origin/master` 開出。若 PR 1 還沒合併，先 cherry-pick 它的 commit。
- 開工前 `git status` 乾淨；要改的檔案有別人未提交的修改，就 NEEDS_CONTEXT。

**模擬閘門與逐位元證據**
- 每一個碰到 `engine/`、`data/` 的任務都跑閘門；每個 PR 的第一個任務錄 `gate-0`。
- 指令：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-0 > <SDD>/gate-<N>.stdout`。
- 每一個任務：
  - 最後一行必須是 `gate: identical`；
  - `cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
- **本計畫沒有任何任務可以重錄 sim gate。** 文字任務與程式任務一律 identical，因為都不碰戰鬥與掉落。
- `engine/parity.test.ts` 的 `PARITY_TASK` 維持 `between plans`。
- **既有的雜湊與快照一律不重錄**（`frozenScenes.test.ts` 在 PR 8 解凍是唯一的例外），每個碰 `engine/`、`data/` 的任務都跑。任何一個紅就 BLOCKED：
  - `engine/legacyFights.test.ts`
  - `engine/floors.snapshot.test.ts`
  - `engine/storyL.dive.test.ts`（`STORY_L_RECORD` 不准設）
  - `engine/guild.legacy.test.ts`
- 不用 `Math.random`、不讀 `Date`；不為新內容多抽任何既有的亂數串流；`lootFragments` 與 `engine/story/expect.ts` 一個字都不改（R23）。

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
  - 只能照本計畫的規則表改門檻；不刪斷言；不加 `skip`、`only`、`todo`、`it.fails`。
  - 全套出現沒列到的紅燈，就 NEEDS_CONTEXT。

**存檔**
- `SAVE_VERSION` 不升、不寫遷移。
- 新欄位只有 `GameState.story.goals?: Record<string, number>`（6.1）。`engine/save.ts` 修復時遇到形狀不對就丟掉這個欄位。

**平衡（凍結）**
- `balance*.test.ts`、`builds.bands.*.test.ts`、`tierBands*.test.ts`、`tierBands.ts`、`buildBands.ts`、`legacyFights.test.ts` 一個字都不改。
- 不動任何數值旋鈕（含 `SHARD_*`、`TOWN_DROP`、`TOWN_FRAGMENTS` 的地區與深度、`BOND_*`、店價、碎片價）。

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
| T1 | 句數上限 `lineCap` | `data/story/scenes.ts:201-216`（`MAJOR_CAPS` 在 `:130`） | 回城對話 3、閒聊 4、歸鄉 4、交還 8、群戲 14、羈絆 6／10、季節 10、回憶 5（洛恩第九、十片與凜第七片 12） | 回城對話 8、閒聊 10、歸鄉 8、交還 16、群戲 26、羈絆第一到三段 10、第四段 14、季節 14；新種類 `join` 24；**夥伴的坦白 `mem:<c>:n` 14；洛恩與凜的回憶 8，`mem:hero:9`、`mem:hero:10`、`mem:rin:7` 14**（R30）；`finale` 20、`epilogue` 16（PR 8 再定） |
| T2 | 相遇句數 | `data/story/story.test.ts:738-771` | 被救前 1–4、被救後 1–5，開頭必須是 `FOUND_LINE` | 被救前 1–6、被救後 1–12；開頭改成每人一句的發現句（`FOUND_LINES[id]`）；鎮上加入的四位改測 `join:*` |
| T3 | 「！」 | `story.test.ts:2141-2148`、`:2312-2316`、`banterBreaks`（`:2375-2469`）；`data/bond.test.ts:148-154` | 輕場景每段 ≤3，只給 `LOUD` | 上限 `max(3, ⌈台詞句數 ÷ 4⌉)`；非 `LOUD` 的人每段最多 1 個；凜選擇前 0；心聲 0；`bond.test.ts` 的 `LOUD` 補上 `orik` |
| T4 | 兩字台詞與碎句 | `data/story/voice.test.ts:479-491`；`telegraphBreaks`（`voiceGates.ts:136-164`） | 兩字台詞只給凜、多蘭與插話詞 | **另立 `SHORT_REPLIES` 表**（「為什麼？」「真的？」「哪個？」「然後呢？」「等一下──」「什麼？」）：回應上一句的短問句或打斷，任何人都可以。不加進 `INTERJECTIONS`，所以 `WORD_LISTS_AT_TASK3`（`voiceGates.ts:93`）不變（R30） |
| T5 | 必含詞配額（**放寬**，R30） | `voice.test.ts:544-558`（希爾薇 `SYLVIE_WORLD` ≥1/3）、`:612-618`（千鶴 `ERA` ≥1/3）；`story.test.ts:2318-2333`（設施固定梗 ≥5 或 6 個階段、歐里克每句推銷詞） | 比例 | **放寬成**：希爾薇、千鶴每段至少一句；設施固定梗每個階段至少一句；歐里克每個階段至少一句推銷詞 |
| T6 | 群戲的形狀 | `voiceGates.ts:282-297`（`groupShapeBreaks`） | 8–14 句、最後一句是旁白 | 8–26 句；最後一句是旁白或心聲；第一句帶地點照舊 |
| T7 | 閒聊裡的洛恩 | `story.test.ts:2375-2469`、`:2668-2672` | 洛恩最多一句、最後一句不是洛恩 | 洛恩（台詞＋心聲）最多佔三分之一；最後一句不限 |
| T8 | 莎菲拉的矛盾 | `story.test.ts:3604-3625` 與 `:2266-2274` | 夜晚一拍禁「唷」「～」；閒聊至少一個「唷」或「呀」 | 夜晚一拍那條刪掉，統一用閒聊那條（7b.3 做） |
| T9 | 「洛恩，」開頭 | `voice.test.ts:470-477` | 一場一句 | 每六句一句（無條件取整，最少一句） |
| T10 | 稱呼與武俠腔 | `story.test.ts:2203-2218`；`data/terms.test.ts` | 千鶴「〇〇姑娘」 | 千鶴「〇〇小姐」；`terms.test.ts` 加禁用：千鶴與歐里克的台詞不准有「姑娘」，全劇本不准有「一刻鐘」「時辰」（替代說法「一會兒」「煮一壺湯的時間」，R38） |
| T11 | 心聲 | 新：`voice.test.ts` | — | `inner` 只准 `who: 'hero'`、不准在 `ChoiceLine` 裡；有心聲的段落 1–3 句；≤30 字；不准「！」；計入 `lineCap`；受 `SPOILERS` 與主角片數門檻約束；文字以（開頭、）結尾 |
| T12 | 新的劇透測試（R18、R22、R30） | 新：`story.test.ts` | — | 見下方「T12 的四條」 |
| T13 | 資訊邊界（R30） | 新：`voice.test.ts` | — | 見下方「T13 的兩半」 |
| T14 | `SPEC_QUOTES` | `story.test.ts:473-487` | 含「從深處走出來的，不是人」 | 移除這一句；加入「讓他休息，燈就會熄」（4.1 做） |
| T15 | 終幕快照 | `data/story/frozenScenes.test.ts:14-30`、`data/story/__fixtures__/frozen-scenes.json`；`data/bond.test.ts:257-258` | 不准重錄 | 8.1 用 `FROZEN_SCENES_RECORD=1` 重錄一次，commit 訊息寫「v6 spec R14：編劇裁定解凍」；之後重新凍結 |
| T16 | 句型綁定 | 例：`story.test.ts:2233-2255`（`meet:liz`）與各段的 `it` 釘子 | 綁定舊字句 | 每個改寫任務同步改自己那一段的釘子，只保留和揭露門檻有關的那一半；列在任務的「已知會紅」 |
| T17 | `GUEST_NEVER`、`REVEALED`、`UNDONE` | `story.test.ts:994-1047`、`:2082-2086` | 夥伴「想不起」的詞 | 詞表大多保留（語意改成「還不肯說」）。新增：莉茲的「爸爸」在 `mem:liz:3` 之後解鎖（只對洛恩、不在歐里克面前）。`LABYRINTH_HERE`（`voice.test.ts:405-424`）照舊適用坦白的「現在」那一半 |

### T12 的四條

**(a) 碎片與主人**
- 範圍：可能在 `town:marta` 看過之前播的字串。包括洛恩以外的說話者、旁白、摘要、手冊與圖鑑的旁白，以及 2.2 起的介面字串。
- 禁止：同一句把「碎片」和「記憶、主人、誰的、還給、交還」放在一起；也不准說「某個人的記憶」「誰的記憶」。
- 例外：只會在 `town:marta` 之後播的字串，要帶 `if.seen: 'town:marta'`，或屬於測試裡白名單的場景（例如 `mem:noel:5` 之後才可能播的 `merchant.found`）。
- **2.1 已知會紅**（全部在 2.1 改完，不延後）：
  - `S:455`（`group:act2` 旁白「找不到主人的碎片」）→ 改成「布上攤著十一片碎片」；
  - `S:1122`（`mem:noel:5` 旁白「裹著老師記憶的碎片」）→ 改成「那一頁和那片碎片」；
  - `S:1853`（`banter:liz-scarlet:2` 絲嘉蕾「那是某個人的記憶。請交還。」）→ 改成「上面刻著名字，就是有主人的東西。請交出去。」；
  - `S:1857`（同段摘要）→ 拿掉「交還」；
  - `S:2367`（`greet.guild.act1` 第二句「主人是誰，我一個一個問到底」）→ 改成不提主人的版本，另寫一句帶 `if.seen: 'town:marta'` 的版本放在同一池；
  - `data/bestiary.zh-TW.ts:79`（「記憶碎片也照撿不誤」）→ 改成「亮晶晶的碎片也照撿不誤」。
- **2.2 再加的介面字串紅燈**：見 Task 2.2。

**(b) 燈與迷宮（分說話者）**
- 鎮民（安娜、歐里克、瑪莎、葛倫、多蘭、商人）**在終幕之前**不准在同一句把「燈」和「迷宮」連在一起。
- 夥伴在 `act2` 看過之前不准。
- 洛恩、鐘守、旁白不受這一條限制，但旁白受 (a) 與寫作守則約束。
- **2.1 已知會紅**：`S:405`（安娜「山上那道光只是燈罩，燈芯在迷宮最底下」）→ 醉話改成旁白轉述公會角落的老酒鬼（v6 spec §1.1），安娜只說她擦了二十年的基座紋路。

**(c) 安娜的禁詞**
- 安娜不准說「燈芯」「燈快乾」「燈壞了」。
- **2.1 已知會紅**：
  - `S:405`（同上）；
  - `S:406`（「燈芯要是好好的……」）→ 刪掉；
  - `S:442`（「霧濃是燈快乾了。……」）→ 刪掉。這一句也是 I-37 的事實改動，第四幕的那一行在 4.3 再補成新教義。

**(d) 帶燈的教義**
- 帶燈的教義片語（「被燈燒」「燈就會熄」「燈自然熄」「讓燈熄」）只准出現在：凜第六片以後、帶 `if.oath: true` 的句子、`AFTER_CHOICE` 場景、鐘守的句子。
- 不帶燈的「讓他休息」最早從凜第四片起。
- 2.1 已知會紅：無。現行文字還沒有這些片語。

### T13 的兩半

**失憶那一半（洛恩、凜）**
1. 洛恩與凜在自己的 `mem:*` 以外的台詞與心聲，終幕之前不准出現「小時候」「老家」「我家」「我們那裡」「那時候我」。回憶裡回想過去一輪是合法的，所以 `mem:hero:*`、`mem:rin:*` 不受限。
2. 輕場景之中，`chat`、`banter`、`join`、`meet`、`prologue-inn`、`first-return` 這幾種，只要洛恩或凜說了三句以上（不算選項），至少要有一句台詞或心聲帶失憶標記：「不記得」「想不起」「醒來」「手自己」「自己動」「為什麼會」「葛倫說」。
- **2.1 已知會紅**：無。
  - 第 1 條：`S:580` 在 `mem:hero:8` 裡，不受限。
  - 第 2 條：`prologue-inn` 有「我什麼都不記得」，`first-return` 有「身體自己動的」。
  - 2.1 開工時跑出來確認；若有紅，就在 2.1 改。

**夥伴那一半（只管「她不知道家鄉在下面」）**
- 在 v6 spec §6.3 的發現之前：
  - 莎菲拉（`mem:safira:5` 之前）不准把「沙漠」和「火」或「熾焰」放在同一句；
  - 希爾薇（`mem:sylvie:1` 之前）不准說「林子」；
  - 千鶴（`mem:chizuru:4` 之前）不准把「神社」或「山」和「霜凍」或「冰」放在同一句；
  - 絲嘉蕾在加入時就發現，不受限。
- 她「還不肯說」的秘密照舊由 T17 的詞表管。
- **2.1 已知會紅**：無（以 2.1 開工時跑出來的為準）。

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
  - 語氣的校準錨點 `docs/superpowers/story/v6-sample.md`；
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
  - **給他的**：`after.md`、`blind.md`；語氣範例 `docs/superpowers/story/v6-sample.md` 與使用者核准的 `C:\Users\bag57\projects\story\notes\序章試寫\v7-談家教.md`，只用來校準語氣，不比劇情。
  - **不給他的**：聖經、帳本、spec。
  - **題目**：
    1. **這是人在對話嗎？** 出聲念，標出像旁白、像格言、像在寫作文、翻譯腔、說明書腔、缺字感的句子。
    2. 每一場：誰想要什麼？誰擋著？讀完之後，你更清楚誰在乎什麼了嗎？
    3. 接話測試：標出沒有接上一句的台詞。
    4. **你說得出每個人的目標與進度嗎？** 逐人寫一行。
    5. 這一場洛恩想要什麼、在想什麼、做了什麼決定？
    6. **誰知道得太多了？** 挑出「這個人現在不可能知道」或「她現在還不會說」的句子；以及「鎮上的人是不是比該有的更懂迷宮、燈、碎片」。
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

## PR 2：碎片聽力

### Task 2.0：心聲的台詞類型與畫面

**Files**
- Modify: `data/story.zh-TW.ts:21-44`（`ScriptLine` 加 `inner?: true`）與檔案前段的寫作小幫手（加 `H(text)`）。
- Modify: `ui2/story.ts`（台詞框：`inner` 不顯示名牌或顯示「心聲」，加 class）；`src/styles/_starlantern-ui.scss`（心聲的顏色與斜體，沿用既有色票）。
- Modify: `engine/story/handbook.ts` 的回放（同樣的樣式）；`data/story/readAloud.ts`（朗讀稿標「洛恩（心聲）」）。
- Test: `data/story/voice.test.ts`（T11）、`ui2/story.test.ts`、`data/story/readAloud.test.ts`。
- 已知會紅：無（只新增）。

**Steps**
- [ ] 在 `voice.test.ts` 寫 T11 的規則，用測試用的假場景驗證：只接受洛恩、拒絕選項裡的 `inner`、拒絕「！」、拒絕超過三十字。
- [ ] 在 `ui2/story.test.ts` 寫「`inner` 的一句畫出心聲的 class、沒有名牌」。跑，確認紅。
- [ ] 實作型別、`H()`、畫面、回放、朗讀稿。
- [ ] 跑綠；e2e（`ui2/`、`src/styles/` 有動）；收尾 G。
- [ ] Commit：`feat(starlantern): hero inner-voice line type`

### Task 2.1：守門規則的新版（T1–T10、T12、T13、T17）

**Files**
- Modify: `data/story/scenes.ts`、`data/story/voiceGates.ts`、`data/story/voice.test.ts`、`data/story/story.test.ts`、`data/bond.test.ts`、`data/terms.test.ts`。
- Modify（把紅燈改到合規，最小改法）：`data/story.zh-TW.ts`、`data/bond.zh-TW.ts`、`data/bestiary.zh-TW.ts`。
- **已知會紅，全部在本任務改完**：
  - T10：千鶴的「姑娘」在 `S:1638`、`S:1677`、`S:1690`、`S:1953`，以及 `data/bond.zh-TW.ts:314`、`:333`、`:371`、`:923`、`:988` 一帶（含「一刻鐘」「時辰」）；「一刻鐘」在 `S:1907-1911`。
  - T12(a)、(b)、(c)：照上面「T12 的四條」列出的句子。
  - T13：無。
  - T1–T7、T9 是放寬或新增上限，不會讓現有文字紅。

**Steps**
- [ ] W1：先寫 T10、T12、T13 的新守門與 T1–T7、T9 的放寬，跑，確認新守門因為上面列的句子紅、放寬的測試照舊綠。
- [ ] 改上面列的句子；登記帳本（若有新的小事實）。
- [ ] W4、W5；收尾 G（閘門）。
- [ ] Commit：`test(starlantern): v6 voice and boundary gates`

### Task 2.2：發現之前的介面字串（R24）

**Files**
- Modify: `data/story/fragments.ts:57-62`（`fragmentName` 加一個參數或包裝：`town:marta` 看過之前，鎮民碎片叫「認不出的聲音」）。
- Modify: `data/text.zh-TW.ts`：
  - `:352` 撿取提示 `memory.town`；
  - `:1041-1042`、`:1051` 交易所的「交還鎮民碎片」「沒有可以交還的碎片。」與交還失敗訊息；
  - `:438` 「找回全部 n 片記憶後覺醒」（夥伴改成「聽完她的全部 n 段心事後覺醒」）；
  - `:591` 「需要 n 片記憶」（只用在洛恩時照舊，用在夥伴時換說法）。
- Modify: `ui2/battleText.ts:77`、`ui2/scenes/event.ts:86`、`ui2/scenes/guild.ts:249`（用新的名字；`town:marta` 之前交還那一項不出現）。
- Modify: 手冊的「鎮民」分頁（`ui2/scenes/handbook.ts`；`T.ui2.handbook.tabs.town`、`status`）與 `STORY.town.*.lost`。發現之前只寫鎮民的名字與「？？？」。
- Modify: `data/bestiary.zh-TW.ts:54`（空殼獵人：「霧把好幾位冒險者的記憶塞進了同一副身體」）。改寫成不提記憶，或綁 `seen: town:marta`。
- 開工時先 grep 其他字串，清單存成 `<SDD>/task-2.2-inventory.md`：`記憶碎片`、`的記憶`、`交還`、`主人`、`物歸原主`，範圍是 `data/`、`ui2/`、`engine/` 的非測試檔。
- Test: `data/story/story.test.ts`（T12(a) 的掃描範圍加上這些介面字串：在 `seen` 不含 `town:marta` 時算出來的字串）、`ui2/battleText.test.ts`、`ui2/scenes/guild.test.ts`、`ui2/scenes/handbook.test.ts`、`ui2/scenes/event.test.ts`。
- 已知會紅：上面每一個字串的既有斷言（照新字串改），以及 `tests/e2e/starlantern.spec.ts` 裡逐字出現的字串（先 grep）。

**Steps**
- [ ] 清點；寫 T12(a) 的介面掃描與各畫面的測試（`town:marta` 前後兩種）；確認紅。
- [ ] 實作。
- [ ] 跑綠；e2e；收尾 G。
- [ ] Commit：`feat(starlantern): shards have no names until lorne knows a voice`

### Task 2.3：鎮民碎片在瑪莎之前認不出（R21、R23）

**Files**
- Modify: 交還層。`engine/story/fragments.ts:71` 的 `returnFragment`：`town:marta` 看過之前，除了瑪莎以外一律回 `{ ok: false, reason: 'unknown' }`。瑪莎的交還改由 `town:marta` 場景完成：撿到之後的第一次回城，場景排入佇列（`engine/story/events.ts`），播完就算交還，給報酬與 `inn-meal`。
- **不改**：`lootFragments`、`townFragmentEligible`、`engine/story/expect.ts`、`TOWN_FRAGMENTS`、`TOWN_DROP`。
- Test: `engine/story/fragments.test.ts`、`engine/story/events.test.ts`，以及**閘門 identical 的斷言**：
  1. 新增 `engine/story/fragments.drops.test.ts`：開工時從 `origin/master` 錄一份一千個種子的 `lootFragments` 結果到 `__fixtures__`，之後必須逐筆相同。這是本任務唯一允許錄的新快照，它保護的是「不改掉落」。
  2. 閘門 `gate: identical` 與四個逐位元測試檔。
- 已知會紅：`engine/story/fragments.test.ts` 裡在公會交還其他鎮民碎片的測試，前置條件改成先看過 `town:marta`。

**Steps**
- [ ] 寫測試：
  - `town:marta` 前，交還安娜的碎片失敗；
  - 撿到瑪莎的碎片後回城，`town:marta` 進佇列，播完瑪莎算交還；
  - 之後交還其他人成功；
  - 掉落快照相同。
- [ ] 確認紅，實作，跑綠；收尾 G。
- [ ] Commit：`feat(starlantern): marta's voice is the first lorne knows`

### Task 2.4：聽見的呈現（只動顯示；R21）

**Files**
- Modify: 吸收台詞的呈現處（帳本 I-108；`ui2/scenes/guild.ts` 用 `STORY.absorb` 的地方，先 grep）。改成「洛恩聽見：「……」」。
- Add: `data/story.zh-TW.ts` 的撿取心聲池 `STORY.pickupInner`（約二十句，第一句固定「（……它在說話？）」）與賣出心聲池 `STORY.sellInner`（約八句）。
- 顯示位置：撿取用既有的撿取提示（`ui2/battleText.ts`、`ui2/scenes/event.ts`）；賣出用交易所的結果訊息。
- **挑句子**：用確定性的索引（例如已撿取的碎片數取餘數），**不抽任何亂數**。
- Test: 對應的 `ui2/` 測試；`story.test.ts`（池子的守門：T11、T12、長度）。
- 已知會紅：撿取與吸收的既有畫面斷言（多了一行）；e2e 裡逐字出現的字串（先 grep）。

**Steps**
- [ ] W1：寫守門與畫面測試，確認紅。
- [ ] 實作。
- [ ] W3：寫兩個池子。每句是洛恩的心聲，好笑或擔心，不知道說話的是誰。
- [ ] W4 到 W7。
- [ ] Commit：`feat(starlantern): lorne hears the shards`

### Task 2.5：認出瑪莎與第二幕的牆（R21）

**Files**
- Modify: `data/story.zh-TW.ts` 的 `TOWN_SCENES.marta`（`S:1463-1474`）。
  - 改成認出版，地點改成旅館廚房，範本見 `v6-sample.md` (1)。
  - 原稿的資訊全部保留：說了兩次、日記是寫給他的、復活羽毛、多添一道菜。
- Modify: `act2`（`S:397-413`）牆的那幾句，分兩種讀法（`if.seen: 'town:marta'`／`notSeen`）：
  - 已認出：他知道那是「很多人的某一天」；
  - 還沒：他只聽見很多人在說話。
  - 「迷宮是燈壞掉之後才長出來的」由洛恩說；安娜只說基座的紋路。
- Modify: `truths.act1`、`truths.act2`（`S:2461-2462`），改成洛恩當時知道的程度。
- 退路（v6 spec §9.1 第 4 點）：始終沒拿到瑪莎的碎片時，其他鎮民的碎片一直認不出；第二幕牆照「還沒」的讀法；星燈祭照現行 `notReturned`。寫一條測試：沒有 `town:marta` 的存檔能從頭播到 `epilogue`，不卡、不出現被禁的字。
- Test: `story.test.ts`（瑪莎場景與牆的兩種讀法的釘子；T12 全綠）。

**Steps**
- [ ] W1 到 W7。冷讀另加一題：「讀完這一場，你覺得碎片是什麼？鎮上的人知道嗎？」
- [ ] Commit：`feat(starlantern): marta's day, the first voice lorne knows`

---

## PR 3：鎮上加入

### Task 3.1：`join:*` 與觸發（R29）

**Files**
- Modify: `data/meetings.ts`（`MEETINGS` 加 `how: 'dungeon' | 'town'`）、`data/story/scenes.ts`（`SceneKind` 加 `join`、`lineCap` 24、`SCENE_IDS`、`POLISHED`）。
- Modify: `engine/story/events.ts`（回城佇列）：
  - 莎菲拉、希爾薇、莉茲：她的地區的門**第一次被擲出之後的第一次回城**，排入 `join:<c>`；
  - 波比：本道到第五層之後的第一次回城；
  - 播完把她加入隊伍。
- Modify: `ui2/rescue.ts`（只給迷宮四位）；`ui2/scenes/event.ts:106` 樓梯的「這層好像還有別人。」對鎮上四位的那一格關掉。
- **迷宮裡那一格**：
  - `rescuesFor` 照舊回傳鎮上四位的相遇房位置，地圖生成與亂數不變；
  - 房裡的內容改成普通地板，沒有人、沒有戰鬥。
- **`favouredRegions` 不准變**：照舊把還沒加入的人的地區算進去，這樣她的門會早點擲出。
- Test:
  - `engine/story/events.test.ts`、`ui2/rescue.test.ts`、`ui2/scenes/event.test.ts`。
  - **新增 `engine/meetings.hash.test.ts`**：`floors.snapshot` 不涵蓋相遇，這一條補上。固定一組種子與深度，對每個地區產生地圖，把相遇房的位置與房間形狀做雜湊；開工時從 `origin/master` 錄，之後必須相同。
  - 跑 `floors.snapshot.test.ts`、`storyL.dive.test.ts`（本道第六層原本是波比的相遇房）、閘門。任何一個動了就 BLOCKED。
- 已知會紅：`ui2/rescue.test.ts` 與 `dungeon.test.ts` 裡鎮上四位在迷宮被救的測試，改成迷宮四位，鎮上四位改測 `join:*`。

**Steps**
- [ ] 寫測試：
  - 熾焰之地的門第一次擲出後回城，`join:safira` 進佇列；
  - 播完她在隊伍裡；
  - 迷宮裡她那一格是普通地板、樓梯不提示；
  - 相遇房的雜湊不變。
- [ ] 確認紅，實作，跑綠；e2e；收尾 G。
- [ ] Commit：`feat(starlantern): companions who join in town`

### Task 3.2：線索分兩種

**Files**
- Modify: `engine/story/leads.ts:15-33`；`data/story.zh-TW.ts` 的 `LEADS`（鎮上四位改成公會的介紹或鎮上的傳聞）；`ui2/scenes/gate.ts`（傳送門上的標記：鎮上四位不標「目擊」）。
- Test: `ui2/scenes/gate.test.ts`、`engine/story/leads.test.ts`。
- 已知會紅：`story.test.ts:2356-2368` 的固定畫面釘子（鎮上四位那四則）、`gate.test.ts` 的線索標記。

**Steps**
- [ ] W1 到 W7（文字部分）。
- [ ] Commit：`feat(starlantern): guild introductions for town joins`

### Task 3.3：四段 `join:*` 的文字

**Files**
- Modify: `data/story.zh-TW.ts`（新的 `JOIN`：莎菲拉、希爾薇、莉茲、波比）。莎菲拉、莉茲的範本見 `v6-sample.md`。
- 每段要讓玩家看到：
  - 她的公開目標與進度起點；
  - 她的秘密露出的那一角；
  - 洛恩為什麼接受、她為什麼需要洛恩；
  - 洛恩與凜的失憶至少一次（T13）。
- 莉茲那一段歐里克在場：他的禁詞照舊，「好像在哪見過」是固定梗（R26）。
- Test: `story.test.ts`（每段的釘子；`introIndex` 的規則延伸到 `join:*`：她的名字出現在她自己的台詞）。
- 已知會紅：無（新內容）。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): four town joins`

### Task 3.4：四段迷宮相遇的改寫

**Files**
- Modify: `MEET.selene`、`MEET.chizuru`、`MEET.noel`、`MEET.scarlet`（`S:2085-2212`）；`FOUND_LINE` 改成 `FOUND_LINES[id]`（每人一句，例如「冰裡有人。」「前面有人在亂放雷。」）。
- 已知會紅：`story.test.ts:738-771`（T2）、`ui2/rescue.test.ts`、`ui2/scenes/dungeon.test.ts` 裡釘住瑟蕾的發現句（帳本 I-64）。照 T2 改。

**Steps**
- [ ] W1 到 W7。
  - 瑟蕾認出洛恩但不說；
  - 千鶴報出自己是誰，以為這裡是山上的洞窟（R41）；
  - 諾艾兒嘴硬，發現自己一個人到不了；
  - 絲嘉蕾認出城門。
- [ ] Commit：`feat(starlantern): dungeon meetings with their own reasons`

---

## PR 4：幕節點與靜鐘會

### Task 4.1：`SPEC_QUOTES` 與教義（R9、R22）

**Files**
- Modify: `story.test.ts:473-487`（T14）。
- Modify: `data/story.zh-TW.ts`：
  - `mem:rin:4`（`S:343-352`）只放不提燈的碎句「鐘響了，有人走上來。讓他休息。」；
  - `mem:rin:6`（`S:362-370`）放完整教義與「他已經被燒了幾十次。讓他休息吧。」。
- 已知會紅：`SPEC_QUOTES` 的舊句、`mem:rin:4` 的釘子、T12(d)（完整教義只准第六片起）。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): the society's doctrine, rewritten`

### Task 4.2：序章、`prologue-inn`、`first-return`

**Files**
- Modify: `S:264-313`。
  - 序章開場的散文旁白改掉。
  - 洛恩醒來念「我答應過要回去」（葛倫轉述）。
  - 葛倫看見他從門裡走上來、拖著凜、劍是亮的（R27）。
  - `prologue-inn`：凜的人情帳第一次說出口。
  - `first-return`：「一次。還差兩次。」
- 心聲：每場一到三句。
- 已知會紅：`story.test.ts` 的序章與 Task 10b 釘子（T16）。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): the opening, with a promise and a debt`

### Task 4.3：第二到四幕節點與群戲

**Files**
- Modify: `act1-after`、`act2` 的其餘部分（牆的兩種讀法已在 2.5）、`act3`、`act4`（`S:389-450`）；`group:act2`、`group:act3`、`group:act4`（`S:453-510`，照 `v6-sample.md` (3) 與 v6 spec §6.2）。
- v6 的重點：
  - 第三幕：登記簿揭露「這些一片空白的人是同一個人」（R27），可以加老冒險者的「合掌」傳聞；
  - 第四幕：登記簿邊上那一行是「從深處走出來的那個人，讓他休息。」，不提燈（R22）；凜選擇之後的句子改寫；
  - 群戲：每個人從自己的目標開口，有人提錯的霧理論。
- 已知會紅：`groupShapeBreaks`（T6 已放寬）、`act4` 凜的句子的釘子、群戲的 `pinBeat` 釘子（`voiceGates.ts:268-272`）。

**Steps**
- [ ] W1 到 W7。冷讀第 6 題特別問：「第四幕讀完，你覺得誰知道燈和霧的關係？」
- [ ] Commit：`feat(starlantern): acts two to four, heard and argued`

### Task 4.4：凜的回憶與揭露

**Files**
- Modify: `mem:rin:1–7` 的「現在」那一半（人情帳與教義碎句）、`rin-reveal`（`S:669-685`，加半句教義）、`rin-confess`（`S:690-712`）、`chat:rin:1–4`、`chat:hero:2–4`。
- Modify: 主角第七片（`S:566-574`）的「他們在怕什麼？」。
- 已知會紅：Task 7、Task 10b 與 V1 的凜的釘子（T16）；選擇前的字詞規則照舊必須綠。

**Steps**
- [ ] W1 到 W7。冷讀加對照組（第 9 題）。
- [ ] Commit：`feat(starlantern): rin's debt and the doctrine she was raised on`

### Task 4.5：鐘守

**Files**
- Modify: `bellkeeper-arrives`（`S:720-736`）、`STORY.bellkeeper.oath` 與 `after`（`S:2321-2340`）。終幕那一句留給 PR 8。
- 寫進他的句子：
  - 「每殺一次，燈就少被點一次」；
  - 他們在等凜動手（R28）。
- 已知會紅：`story.test.ts:2288-2316` 的鐘守守門（「……」與「！」）與 I-94、I-119 的釘子（若有）。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): the bellkeeper pities him`

---

## PR 5：夥伴的坦白

### Task 5.0：提示字串與手冊條目名

**Files**
- Modify: 迷宮裡的「〇〇想起了什麼。」（`data/text.zh-TW.ts:350`、`ui2/battleText.ts:65` 附近）。夥伴改成「〇〇撿起了什麼，收了起來。」，洛恩與凜不變。
- Modify: 手冊「記憶」分頁裡夥伴的條目標題改成「〇〇的心事」（`ui2/scenes/handbook.ts`）；分頁名稱「記憶」不改（R36）。
- Test: `ui2/battleText.test.ts`、`ui2/scenes/handbook.test.ts`、`ui2/scenes/dungeon.test.ts:696` 附近。
- 已知會紅：上面三個測試的既有字串斷言；e2e 先 grep。

**Steps**
- [ ] 寫測試，確認紅，實作，跑綠；e2e；收尾 G。
- [ ] Commit：`feat(starlantern): companions confide, they do not remember`

### Task 5.1–5.4：四十段坦白（每任務兩位）

| 任務 | 人物 | 檔案範圍（只有 `mem:<c>:*`；她們的 `chat:*` 在 7a） |
|---|---|---|
| 5.1 | 瑟蕾、千鶴 | `S:809-859`、`S:878-924` |
| 5.2 | 莎菲拉、希爾薇 | `S:945-993`、`S:1010-1058` |
| 5.3 | 諾艾兒、波比 | `S:1079-1127`、`S:1153-1199` |
| 5.4 | 莉茲、絲嘉蕾 | `S:1216-1269`、`S:1289-1339` |

**規則**
- 照 v6 spec §6.2 的坦白表。資料鍵、`full`／`notFull`／`oath` 的讀法不變；句數上限照 T1（14）。
- 「過去」那一半改成她說的話，或旁白轉述她說的事；「現在」那一半寫出她為什麼今天說。
- 家鄉的中期發現照 §6.3。
- 帳本 I-245 到 I-252 是事實來源。
- 諾艾兒第三段寫成「每念一次燒一點，燒掉最大的一塊是老師」（R31）。
- 已知會紅：
  - 各人的 `it` 釘子（T16）；
  - `GUEST_NEVER`、`REVEALED`、`UNDONE`（T17）；
  - `SPEC_QUOTES` 裡她們的句子保留原字：「妳要繼續跳。」「祖先造錯的東西，我來修好。」「妳不是盾，妳是我的朋友。活下去。」

**Steps**
- [ ] 每個任務做 W1 到 W7；W7 第 6 題特別問「她說的事，她那時候知道嗎、會說嗎」。
- [ ] Commit 範例：`feat(starlantern): selene and chizuru confide`

---

## PR 6：配套

### Task 6.1：「現在的目標」（R25、R40）

**Files**
- Create: `data/story/goals.ts`。
  - 內容是 v6 spec §8 的表。
  - 每一行的 `when` 綁**她自己的坦白片數**（例如莉茲的「爸爸的那一片」要 `seen: mem:liz:3`），用 `linesWhen` 挑。
- Modify: `engine/state.ts`、`engine/save.ts`（`story.goals?`，只加不升版，修復時丟掉形狀不對的值）。
- Modify: `ui2/scenes/status.ts`（頁首一行）、`ui2/scenes/handbook.ts`（人物頁最上面一行）。
- Modify: 劇本裡設定數字的句子（例如莉茲的存款）加一個標記欄位。寫入時機：
  - 場景播放時寫入；
  - 場景被略過時照樣寫入；
  - 劇情設定成關閉（自動）時照樣寫入（R40）。
- Test:
  - `data/story/goals.test.ts`：每人每個條件都有一行；每一行過 T12、T17 與 `REVEALED`；`when` 一定含她自己的片數條件。
  - `engine/save.test.ts`；`ui2/scenes/status.test.ts`、`ui2/scenes/handbook.test.ts`；`engine/story/events.test.ts`（略過與自動時照樣寫入）。
- 已知會紅：`ui2/scenes/status.test.ts` 與 `handbook.test.ts` 的版面斷言（多了一行）。

**Steps**
- [ ] 寫測試，確認紅，實作，跑綠；e2e；收尾 G（閘門必須 identical）。
- [ ] Commit：`feat(starlantern): everyone's current goal`

### Task 6.2：送禮與羈絆

**Files**
- Modify: `data/bond.zh-TW.ts`：
  - 婉拒的台詞從「想不起」改成「還不想談」；
  - `bond:*:1–4` 照新文風與 v6 人物卡；
  - 第四段拆掉「以前我以為／在這裡」的共用句型；
  - `:974` 諾艾兒那句照 R31 改成「每念一次燒一點，燒掉最大的一塊是老師」；
  - 戀愛與後日談若提到相遇的方式，同步改成加入。
- 已知會紅：`data/bond.test.ts` 的釘子（T16）。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit 若太大就分兩個：`bond:*:1–3` 一個，`4`／後日談／戀愛一個。

### Task 6.3：圖鑑的門檻對到新的揭露時程（R34）

**Files**
- Modify: `data/bestiary.zh-TW.ts`。逐句檢查三十句帶 `after: { seen: ['mem:…'] }` 的句子，以及沒有門檻、卻碰到真相的句子，對到 v6 的揭露時程，必要時換門檻或改字：
  - `:371`（裂口：「千鶴當年要封的，就是這道裂口」）：現綁 `mem:chizuru:2`，但千鶴在第四段才知道霜凍之地是她的山，**改綁 `mem:chizuru:4`**；
  - `:54`（空殼獵人：「霧把好幾位冒險者的記憶塞進了同一副身體」，帳本 I-225 起沒有門檻）：若 2.2 選了改字，這裡確認；若選了門檻，**綁 `seen: town:marta`**；
  - `:79`（已在 2.1 改字）確認；
  - `:301`、`:308`、`:400`（千鶴的神社）：確認綁 `mem:chizuru:1`／`:4` 和新的坦白內容一致；
  - `:429`、`:499`、`:540`（希爾薇）、`:282`、`:345`、`:352`（莎菲拉的沙漠）、`:481`、`:488`、`:526`、`:533`、`:554`（絲嘉蕾）：確認家鄉發現的時程；
  - `:455`、`:462`、`:547`（莉茲）：「她是來替家裡還債的」改成 v6 的說法（她記得、他忘了）；
  - `:327`、`:386`、`:407`、`:408`（諾艾兒）：照 R31。
- 「她想起」改成「她說過」。鍵不動。
- Test: `data/bestiary.test.ts`（加一條：每一句的門檻都在 v6 揭露表允許的位置之後）。
- 已知會紅：`bestiary.test.ts` 裡釘住上述字句的斷言。

**Steps**
- [ ] W1 到 W5；W7 只做第 1、6 題。
- [ ] Commit：`feat(starlantern): bestiary lines on the v6 schedule`

### Task 6.4：手冊人物頁、真相頁、摘要（R39）

**Files**
- Modify: `PEOPLE`（`S:2015-2074`）、`STORY.truths`（`S:2459-2466`；`act1`、`act2` 已在 2.5 改）、每一段的 `summary`。
- **不碰 `finale` 與 `epilogue` 的摘要**，它們留到 PR 8。
- 手冊仍是洛恩的筆記；第一段寫加入時看得到的事；真相頁照 v6 spec §1.3 的階梯。
- Test: `story.test.ts:773-779`（一到三句）與 T12。
- 已知會紅：人物頁的 V2 冷面筆記釘子（帳本 I-153）。

**Steps**
- [ ] W1 到 W5；W7 只做第 1、6 題。
- [ ] Commit：`feat(starlantern): lorne's notes, v6`

---

## PR 7a：回城對話

### Task 7a.1：夥伴的回城對話

**Files**
- Modify: `chat:selene:*`、`chat:chizuru:*`、`chat:safira:*`、`chat:sylvie:*`、`chat:noel:*`、`chat:bobby:*`、`chat:liz:*`、`chat:scarlet:*`（`S:860-1357` 之間的 `chat:` 鍵）。
- 規則：T1 上限 8；每段至少一個目標的進度或秘密的一角；`full`／`notFull` 的讀法照舊。
- 已知會紅：
  - V2 的回城對話釘子（`story.test.ts:2134-2148`）；
  - `chat:chizuru:2` 的 `CHAT_GATE`（`voice.test.ts:605-610`）；
  - `chat:sylvie:*` 的形狀（`voice.test.ts:568-574`）；
  - `chat:noel:2` 的稱呼讀法（帳本 I-208）。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): companion chats with something to want`

### Task 7a.2：洛恩與鎮民的回城對話

**Files**
- Modify: `chat:hero:1`、`chat:hero:5`（`S:621-664`；`chat:hero:2–4` 已在 4.4）。
- 已知會紅：V1 的 `chat:hero:1` 釘子（`story.test.ts:2028-2035`）、`chat:hero:5` 的安娜句子。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): lorne's chats`

---

## PR 7b：其餘的日常

### Task 7b.1：閒聊

**Files**
- Modify: `BANTER`（`S:1600-1960`）三十六段。每段改成兩人的目標互相拉扯，不再是四句短劇。
- 已知會紅：
  - `banterBreaks`（`story.test.ts:2375-2469`；T7 已放寬洛恩的份量）；
  - 各段的 `it` 釘子（帳本 I-158 到 I-160、I-175、I-177、I-180 記的伏筆與回呼）；
  - `「回報」最多兩段`與`「一下下」只屬於波比`（`story.test.ts:2655-2666`）。

**Steps**
- [ ] 每八到十段一個 commit，各自 W1 到 W7。

### Task 7b.2：招呼、線索與城鎮每日台詞

**Files**
- Modify: `greet`（`S:2362-2405`）、`town.*.after`（`S:2472-2492`）、`LEADS` 的迷宮四位（`S:2221-2230`）。
- Modify: `townLines`（`S:2248-2297`）。從旁白散文改成鎮民之間、或鎮民對洛恩的兩句一組。
  - 資料形狀：`TownLine = { lines: [ScriptLine, ScriptLine] }`，舊的字串池保留型別相容；
  - 畫面：`ui2/scenes/town.ts` 的今日一句改成播兩句；
  - **約束**：`game.rng` 的抽取次數不准變。今日一句照舊抽一次，抽到的是一組。
- 民間說法表（帳本 I-230）當日常的梗。
- Test:
  - `story.test.ts`：每組兩句、說話者是鎮民或旁白；
  - `ui2/scenes/town.test.ts`：播兩句，以及用計數包裝的 `game.rng` 驗證抽取次數相同。
- 已知會紅：
  - V3 的招呼守門（`story.test.ts:2288-2350`；T5 已放寬）；
  - `townLines` 的「旁白、不掛名牌」規則（聖經 §4.1）改成兩句一組的規則；
  - `town.test.ts` 的今日一句斷言。

**Steps**
- [ ] 程式部分先寫測試再實作，跑 e2e。
- [ ] 文字部分 W1 到 W7。
- [ ] Commit：`feat(starlantern): the town talks`

### Task 7b.3：夜晚的一拍改兩句

**Files**
- Modify: `NIGHT_BEATS`（`S:184-259`）。
  - 資料形狀：`NightBeat = { lines: [NightLine, NightLine]; tone; moon? }`。第一句是夥伴或旁白，第二句是洛恩的台詞、心聲或旁白。
- Modify: `engine/story/nights.ts` 的 `nextBeat`：游標照舊一次前進一拍，抽取方式不變。
- **兩句一拍的形狀測試規格**（`story.test.ts`，取代 `:3569-3640` 的一句一拍規則）：
  1. 每拍剛好兩句；
  2. 第一句的說話者是夥伴或旁白，第二句是洛恩（台詞或 `inner`）或旁白；
  3. 夥伴那一句照舊不提回憶的內容、不叫其他夥伴的名字、不用會隨片數改變的稱呼；
  4. 洛恩那一句可以用「你」「妳」回她，但不提回憶的內容；
  5. 每拍兩句合計 ≤ 90 字，每句 ≤ 60 字；
  6. `tone` 與 `moon` 標在拍上，規則照舊；
  7. 每位夥伴的拍數照舊（`quiet`、`lively` 的最低數照舊）；
  8. T8：刪掉莎菲拉「禁唷」那一條。
- Test: `engine/story/nights.test.ts`、`events.test.ts` 的「一輪不重複」。
- 已知會紅：`story.test.ts:3569-3640` 的一句一拍規則（照上面的規格改）、`nights.test.ts` 的形狀斷言。

**Steps**
- [ ] 先寫形狀測試，確認紅，改資料形狀與 `nextBeat`，跑綠。
- [ ] 寫文字：W1 到 W7。
- [ ] Commit：`feat(starlantern): night beats as a two-line exchange`

### Task 7b.4：鎮民交還、歸鄉、春祭

**Files**
- Modify: `TOWN_SCENES` 的歐里克、安娜、葛倫、多蘭（`S:1449-1518`；瑪莎已在 2.5）。每位都是來拜託洛恩，照 `v6-sample.md` 的語氣。
- Modify: `HOME`（`S:1527-1568`）、`SEASON`（`S:1575-1592`）。
- 已知會紅：
  - Task 11 的鎮民交還釘子（帳本 I-87 到 I-91、I-186）；
  - `home:liz` 的兩種讀法（I-118）；
  - 春祭的兩種讀法（I-200）。

**Steps**
- [ ] W1 到 W7。
- [ ] Commit：`feat(starlantern): the townsfolk ask for help`

---

## PR 8：終幕解凍

### Task 8.1：終幕與星燈祭

**Files**
- Modify: `finale`（`S:1369-1421`）、`epilogue`（`S:1424-1438`）、`finaleWait`，以及這兩段的 `summary`。
  - 鐘守的最後一句照帳本 I-255。
  - 洛恩聽見燈裡「很擠」。
  - 「燈裡有……」的七句疊句改寫。
  - 夥伴交出的那一段，改成她加入的那一刻或她的目標。
- Modify: `data/story/scenes.ts` 的 `MAJOR_CAPS`（`finale` 20、`epilogue` 16，照 T1）。
- 重錄 `data/story/__fixtures__/frozen-scenes.json`：`FROZEN_SCENES_RECORD=1 rtk proxy npx vitest run src/scripts/games/starlantern/data/story/frozenScenes.test.ts`，只此一次。
- commit 訊息寫「v6 spec R14：編劇裁定解凍；使用者要求拿掉文學腔的終幕」。
- 已知會紅：`frozenScenes.test.ts`（重錄）、終幕的 Task 14 與階段 L Task 14 釘子（T16）。

**Steps**
- [ ] W1：寫終幕的釘子：鐘守的新句、「很擠」、`SPEC_QUOTES`。
- [ ] 確認紅，W2 到 W4。
- [ ] 重錄快照。
- [ ] W5：跑兩次 `frozenScenes.test.ts`，第二次不設環境變數，確認通過。
- [ ] W6、W7：冷讀第 1 題特別問「終幕哪一句像格言」。
- [ ] Commit：`feat(starlantern): the finale without the refrain (v6 R14)`

---

## PR C：公會委託的文字（接在本計畫的 PR 1 之後；R33）

公會計畫 `docs/superpowers/plans/2026-10-29-starlantern-guild-quests.md` 的 PR C（C1–C3），在本計畫的 PR 1 合併之後執行，照新的文風聖經 §1.6 到 §1.8 與 v6 的人物卡寫。

**執行 PR C 時，公會的 spec 要同步修正兩處**（`docs/superpowers/specs/2026-10-29-starlantern-guild-quests-design.md`，和 PR C 同一個 commit）：
1. **懸賞的說明不准讓鎮上知道碎片是記憶**：紙條與回信套用 T12(a)。在 `town:marta` 之前可能貼出的紙條，不准把碎片和記憶、主人連在一起。
2. **夥伴的那一句由她的家鄉地區觸發**，不是她被救的地方（公會 spec 原本照 `MEETINGS` 的相遇地區）。
   - 在家鄉被發現之前（v6 spec §6.3），那一句只說她的公開目標。
   - 沒有家鄉在下面的四位（瑟蕾、諾艾兒、波比、莉茲），照她最常下的地區。

**其他**
- 安娜不推論。
- 鎮民繞著自己的洞說話。
- 夥伴的一句話可以說她的公開目標。
- W7 冷讀加本計畫的新題目（目標、誰知道得太多）。

---

## 附錄：選配的信任門檻（不在本輪）

坦白第 n 段除了撿到，還要好感度到某一階。

- **循環依賴**：`bondPoints` 把片數算進好感度（`engine/story/bond.ts:82`），要先改成算「撿到的遺物數」，或只看送禮與聊天的點數。
- **要先跑模擬**：確認不會卡關。
- 需要控制者另開計畫。
