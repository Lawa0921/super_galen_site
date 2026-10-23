# 星燈迷宮 劇情打磨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修掉玩家看得到的劇情破損（招募台詞埋在戰果清單裡、相遇句提前叫出名字、缺字與錯名），改寫文風聖經與文風守門，讓台詞是自然的句子、「……」有預算、每個人的聲音分得開；然後照遊玩順序分段改寫全部劇情、修好稽核列出的連續性問題、統一用字。戰鬥的每一個量測值逐位元不動。

**Architecture:**
- **招募場景走對話框**：`ui2/story.ts` 新增 `playLines`，用和 `playScene` 同一套名牌、立繪、左右站位，只是播一串 `ScriptLine`、取消時不出摘要。戰鬥結算按「繼續」後依序播：她的 `after` 台詞 →「加入了隊伍」→ 回憶 → 符文教學 → 離開。結算清單只剩戰利品。
- **文風守門集中在一個模組**：`data/story/voiceGates.ts` 放可以測的文風規則：電報句偵測、「……」的預算、語尾助詞的預算、呼格與插話詞清單、輕重場景分類，還有從 `story.test.ts` 搬過來的 `storyTexts()`。`data/story/voice.test.ts` 用它檢查 `POLISHED` 清單裡的鍵。每一段改寫把自己的鍵加進 `POLISHED`，加進去的那一刻測試會紅，改寫完才綠。收尾時 `POLISHED` 必須涵蓋全部的鍵。
- **用字守門**：`data/terms.test.ts` 掃描星燈迷宮 `data/`、`ui2/`、`engine/` 底下所有非測試的 `.ts` 原始碼，抓錯名和禁用寫法；另外檢查過去的人物對女性說話用「妳」。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、Git Bash。

**Spec:** 稽核報告 `C:\msys64\tmp\claude\C--Users-bag57\2c248522-7150-4161-8ef7-00e1a1e771a9\scratchpad\story-audit\story-audit.md`，同一資料夾裡有 `choppy-lines.txt`、`missing-glyphs.txt`。使用者核准方向：「可以，照這個方向全面改」（看過稽核與 §4 的八段樣稿之後）。原始抱怨：「目前的劇情看起來還要打磨，看起來有點尷尬，而且似乎有缺字的現象」。還要讀 `docs/superpowers/story/starlantern-style-bible.md`（Task 3 會改寫它）和 `docs/superpowers/story/starlantern-lore-ledger.md`。**範圍外**：字級與整數縮放（另一份易讀性計畫會做 12／24px）、新的美術、戰鬥數值。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/`、`.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄是 `.superpowers/sdd/2026-10-23-starlantern-story-polish/`，下稱 SDD。行號只用來定位，動手時一律用內容找。

## 計畫裁定

標「設計者裁定」的是稽核沒寫死、由本計畫決定的細節。故事秘密的走向由控制者決定（使用者授權），每條附一行理由。

1. **設計者裁定：招募的順序**。按「繼續」之後，結算視窗收起，依序是：(1) 她的 `STORY.meet[id].after` 在戰鬥畫面的對話框播放，有名牌和立繪，第一個開口的人站左邊；(2) 旁白一句 `T.ui2.rescue.joined`（或 `benched`），這一句永遠播；(3) 回憶；(4) 符文教學；(5) 離開。她說話時按取消，會跳過她剩下的台詞，直接到第 (2) 句。結算清單不再有加入的那一行，也不再有她的台詞；`T.battle.saidBy` 刪除。她的 `after` 台詞不管劇情播放設定（全部／主線／不播）是什麼，一律播放，和地城裡的 `before` 一樣。理由：她要先開口說要加入，「加入了隊伍」才有意義。加入是狀態變化，不能被跳過。
   - **只走一次**：`pick` 第一行就檢查並設定 `picked`，已經設過就直接 return。從那一刻起，招募對話（她的台詞和加入那一句）在播的期間，`onAction` 一律交給 `ui2/rescue.ts` 回傳的 handle，做法和 `playing`、`tutoring` 一樣，所以確定鍵不會掉回 `result.onAction`。在加入那一句上按取消，效果和確定一樣。
2. **設計者裁定：相遇之前，她的名牌寫「？？？」**。`FOUND_LINE`＝「有人被怪物圍住了！」不帶名字（`T.ui2.rescue.found` 刪除，dungeon 的測試改用 `FOUND_LINE`）。在 `before` 的台詞裡，她的名牌是 `T.ui2.rescue.stranger`＝「？？？」。在 `after` 的台詞裡，名牌一直是「？？？」，直到她第一次說出自己名字的那一句（`introIndex(id)`）；從那一句起才顯示她的名字。每一場相遇都必須有這一句（測試檢查）。理由：稽核 A2 說「名字比自我介紹早出現」，名牌也是一種提早叫名字。
   - **莉茲**：目前她的名字只出現在旁白裡（`story.zh-TW.ts` 約 1617 行），`introIndex('liz')` 會是 `-1`；`after` 最多四句。Task 1 把她的 `after` 定成下面四句（逐字照抄；洛恩那句拿掉，「金幣不用」的意思併進她的話，乾糧那一拍留在旁白，終幕「老大在寶庫遞給我的那塊乾糧」照樣接得上）：
     1. 旁白：「洛恩遞過乾糧。她兩口就吞了下去，連膝上的碎屑都撿起來吃掉。」
     2. 莉茲（`smile`）：「活過來了！我是莉茲，尋寶獵人。金幣真的不要？你們這群怪人。」
     3. 莉茲（`hushed`）：「我是來把錢帶回家的。……可是家人的臉，一張也想不起來了。」
     4. 莉茲（`scheming`）：「好啦，不說這個。老大，讓我跟著你們吧，分紅好商量。」
   - 其他七位若也算出 `-1`，照同樣的做法改她第一次開口的那一句，仍是四句以內，並在報告裡逐句列出。
3. **設計者裁定：退休「還有。」**。凜的口癖「還有。」讀起來像錯字（稽核 S2），整份劇本不再出現「還有。」（帶句號的寫法）。「還有，」當普通連接詞可以用，但凜在選擇之前仍然不說「還有」。凜的冷面改成「完整但短的句子＋多餘的精準數字」，一個詞的判決只能自己成為一整句台詞（「吵。」可以，「退路。三條。」不行）。
4. **設計者裁定：「……」的預算**（Task 3 寫進聖經 §2.3，`voice.test.ts` 檢查）：
   - 每一句：最多一個；不放在句首。唯一的例外是整句只有「……」（沉默的一拍），這種句子一場最多一句。
   - 輕的場景（照實際播出的每一種讀法）：整場最多一個（不變）。
   - 重的場景：帶「……」的台詞不超過 `max(1, floor(說話句數 / 4))`。原本是一半。
   - 每一位說話者在整份劇本裡：帶「……」的台詞不超過 `max(1, floor(句數 / 6))`。分子和分母都算整份劇本，不只算 `POLISHED` 裡的；某位說話者的台詞全部都在 `POLISHED` 底下之後，才開始檢查她，Task 16 起檢查全部。
   - 手冊、摘要、吸收台詞（`summary`、`people`、`truths`、`absorb`）：一個都不用。
   - 整份劇本：帶「……」的字串不超過 8%。現在是 182／約 940。
5. **設計者裁定：語尾助詞與聲音的預算**（`VOICE`，`voice.test.ts` 檢查）：
   - 波比的「喔」：最多佔她台詞的三分之一，重的場景裡一個都沒有。
   - 瑟蕾的「呢」：最多佔她台詞的三分之一，一場最多一個。
   - 莉茲的「啦」：最多三分之一。
   - 凜：任何時候都不用「呢」（那是瑟蕾的）。選擇之後可以用「吧」，可以說「我們」「洛恩」。
   - 希爾薇：完全不用語尾助詞（既有規則）。
   - 絲嘉蕾、千鶴：不用「喔、啦、唷、呀、耶、嘛」。
   - 整句只有兩個字以內的台詞，只屬於凜、多蘭和插話詞；希爾薇只有「不用。」這一句。
   - 不用「洛恩。」開頭（呼格加句號）。用「洛恩，」開頭的台詞一場最多一句。
   - 「一起回來」整份劇本最多三句；終幕裡「交給燈」最多三句。
   - 閒聊裡的「你」只能對洛恩說；「你們」不算。
6. **設計者裁定：電報句守門**（`telegraphBreaks`）只抓三種機器抓得到的寫法：
   - 「還有。」
   - 一句台詞裡出現兩個以上的極短句：去掉標點後兩個字以內，而且不是插話詞。
   - 逗號把兩個字以內的短語切出來，而這個短語不是插話詞、連接詞或呼格；或者逗號緊接在 `一直｜也｜就｜都｜還｜才｜再｜又｜先` 後面，把副詞和動詞切開。

   讀起來自然的主題句（例：樣稿七「新芽，我看過了。」）登記在 `TELEGRAPH_OK`，最多十句，而且每一句都必須還在劇本裡。理由：用機器擋住會回頭的寫法，其他的交給朗讀審查。
   - **切分規則**（`telegraphBreaks` 照這個做，Task 3 的自我測試逐條驗證）：
     - 說話的台詞：去掉最外層的「」，剩下的是一段話。
     - 旁白：每一個「…」引文各自算一段話；引文以外的旁白（引文挖掉）也算一段。
     - 『』：拿掉括號，內容留著。
     - 句子：遇到 `。！？` 就切。
     - 子句：句子再遇到 `，、；：` 或「──」就切。結尾是「──」的子句是被打斷的話，不算在第三種寫法裡。
     - 「……」：不切，量長度前先拿掉。
     - 長度：拿掉 `「」『』……──～` 與空白之後，數 `[...s].length`。
   - **清單的上限**：`INTERJECTIONS`、`CONNECTIVES`、`VOCATIVES` 在 Task 3 定稿之後，整個計畫合計最多只能再加十個詞。每加一個，在程式碼裡附一行註解 `// +<詞>：Task <N>，<理由>`，報告裡也列出來。超過十個就停下來回報 NEEDS_CONTEXT：那表示守門的設計錯了，不是要繼續加詞。
7. **設計者裁定：連續性修正**（稽核 LG，控制者授權的劇情決定；每一條都寫進帳本）：
   - **公會的債**：序章裡安娜給藥與燈時說「先記在公會的帳上」，旅館那一夜的「欠公會的帳」才有著落。這仍在第一幕之前，不違反安娜的禁區。
   - **葛倫的說法**：洛恩走了三步就倒下了，昏過去之後手還扣著她的手腕，葛倫掰了很久才掰開。旅館那一夜的旁白改成和這個一致，不再寫「直到洛恩昏了過去」。
   - **莉茲第五片（歐里克已交還的讀法）**：照帳本 I-75 的「記憶成真」，回憶裡的聲音仍是現在的歐里克；但他的話要從現在說，例如「妳出門那天掛在門後的紅帽子，爸爸到現在都沒收」，不再像是回憶當下帽子已經掛在那裡。兩種讀法都維持四句。
   - **第二幕的推論**：安娜的結論改成從畫面推得出來：牆跟著灰掉（壞掉）的那幾條光長，所以迷宮是燈壞了以後才長出來的。
   - **終幕的轉折**：每一種讀法都正好播十二句（`lineCap('finale')`），不能加句。結構固定為：洛恩一句、八位夥伴各一句（或洛恩替還沒遇見的她說的那句）、旁白一句、鐘守一句、凜一句。
     - 洛恩的第一句除了「這一輪的日子就是燈芯」，再加上鋪陳「燈裡的光，一段一段帶著名字亮起來」，讓還沒遇見的夥伴被他叫出名字有前提。
     - 波比那一句（以及沒遇見她時洛恩代說的那一句）負責「閥」。
     - 現在約 1060 行那句旁白（51 字）改成因果加結果，60 字以內：閥扣上了，燈芯接住大家交出的記憶、不再要他的日子；凜的手疊上他的手；燈穩了，暮霧散了；天亮時沒有人鬆開手。參考寫法：「閥扣上了。燈芯接住大家交出的記憶，不再要他的日子。凜的手疊上他的手，燈穩了，暮霧散了。天亮時，沒有人鬆開手。」（54 字）
     - 「光回到每一個弄丟它的人身上」移到終幕的 `summary`。
   - **設計者裁定：鐘守的高潮改由他自己說**（稽核約 1062 行的那一點）。約 1062 行那句旁白改成 `who: 'bellkeeper'` 的台詞，用他念經的口氣，60 字以內：先說最後這一聲由他來敲，再說「吾等殺的一直是守燈人」，最後是「靜鐘會，散了」。凜把敲平的鐘交給他這個動作，改進他自己的話裡（例：「這口被敲平的鐘……」）。這樣說話的台詞是十一句，重場景的「……」上限是 `floor(11 / 4)` = 2。理由：一場戲最重的一句不該是旁白的轉述。終幕現有釘住旁白的斷言，照裁定 11 改。
   - **第三幕的碑文**：改成文白相間、念得出口的兩句以內，其餘交給旁白或洛恩讀。
   - **兩個壓在沉重回憶上的笑點**：諾艾兒第四片「是這裡的雨太大了」（迷宮裡沒有雨）換成合乎地點的笑點；莎菲拉第五片「團長那一推……」刪掉，因為她的玩笑不碰舞團（聖經禁區）。
8. **設計者裁定：用字**（Task 4）：
   - 精英改成菁英，恢復改成回復。
   - 過去的人物對女性說話一律用「妳」。`SPEC_QUOTES` 的兩句跟著改：「妳不是盾，妳是我的朋友。活下去。」「妳要繼續跳。」
   - 場景標題與回憶通知用國字：「瑟蕾・第一片」「・對話一」「・閒聊一」「（第二片）」；樓層與 Lv 照介面慣例保留阿拉伯數字。
   - 城鎮的每日台詞是旁白，不掛「露米亞」的名牌。
9. **設計者裁定：任務順序**。S3 用字（Task 4）排在改寫之前，讓每一段改寫從一開始就在用字守門底下寫，不必回頭再改一次。
10. **規格引文的偏離**：樣稿三把揭露那句改成「洛恩，我是被派來殺你的。可是我不殺了──這是我自己決定的。」（使用者已核准）。`SPEC_QUOTES` 改成釘「我是被派來殺你的」「這是我自己決定的」，spec 文件不動，帳本記一條「2026-10-22 使用者核准樣稿，偏離 spec 原句」。人物頁第四段那句跟著改。
11. **釘子的處理規則**：`story.test.ts` 約有 118 處釘死整句的斷言。改到被釘住的句子時，改用 `pinBeat(scene, reading, re)`（Task 3 寫進 `voiceGates.ts`）釘住**情節要點**：在那一場、那一種讀法裡，**正好一句**符合 `re`，而 `re` 至少要有一個關鍵名詞或事實。不釘新的字句；`SPEC_QUOTES` 照第 10 條處理。
    - 還沒有 `pinBeat` 的 Task 1、Task 2 改到的釘子，也照這個意思改，Task 3 再換成 `pinBeat`。
    - `story.test.ts` 裡 `expect(` 的數量不可以比 `baseline.md` 記下的少（`grep -o "expect(" src/scripts/games/starlantern/data/story/story.test.ts | wc -l`）。每個任務的報告附上這個數字。
    - 每個任務的報告逐條列出改了哪些釘子。帳本裡逐字引用的台詞，同一個 commit 跟著改。

## Global Constraints

**使用者的方向（最高依據）**
- 「目前的劇情看起來還要打磨，看起來有點尷尬，而且似乎有缺字的現象」→「可以，照這個方向全面改」。
- 已核准的聲音：日常輕快、有梗、日系 RPG 的味道，每個人個性分明；沉重的留給記憶碎片；「……」少用。台灣繁體用語（菁英、回復；女性用「妳」）。全隊除了主角洛恩都是女性。
- 意思和劇情要點不變。只有稽核列出的連續性修正（裁定 7）可以改內容。故事秘密照既定的走向，揭露表與 `SPOILERS`、`REVEALED`、`UNDONE` 守門一律不鬆。

**分支與基準**
- worktree `C:\Users\bag57\.codex\worktrees\starlantern-polish`，分支 `fix/starlantern-story-polish`，從 master 開出。基準提交 `<BASE>` 是 Task 1 Step 0 用 `git rev-parse HEAD` 讀到的值（寫計畫時是 `d1183e608`），記在 SDD `baseline.md`；本計畫凡是說到基準的地方，都用這個值。不碰 plan 8h 的 worktree。
- **和 8h 分支並行**：8h 會加新的介面字串。最後合併的那一條分支，合併後要重跑 `data/terms.test.ts` 與 `data/story/voice.test.ts`，因為兩者也會掃到 8h 的新字串。為了少一點衝突：招募的流程放在新檔 `ui2/rescue.ts`，`battle.ts` 只改 `pick`／`renderResult` 約十行和一行 import；Task 15 不碰 `T.rune`、`T.cmd`、`T.build`；新的 e2e 測試插在相關的既有測試後面，不接在檔尾。
- **停止規則**：任何不在裁定 7 裡的改動，只要改到事實、揭露時機或帳本的 I 條目，一律停下來回報 NEEDS_CONTEXT，不自行決定。
- 開工前跑 `git status`。本計畫要改的檔案若有別人未提交的修改，停下來回報 NEEDS_CONTEXT。
- 戰鬥閘門：Task 1 錄 `gate-0`，Task 16 錄 `gate-final` 對 `gate-0`，結果必須是 `gate: identical`；兩次都 `cmp <gate>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。若 `gate-0` 的 cmp 已經不同，就停下來回報 BLOCKED（基準不是本計畫造成的）。不覆寫 `engine/__fixtures__/`。劇情文字不可以影響戰鬥。
- 不可以用 `Math.random`；本計畫不加任何新的亂數抽取。

**測試與檢查**
- TDD：先寫失敗的測試，確認它因正確的理由失敗，再實作。改寫段落的「紅」就是把鍵加進 `POLISHED`。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`。全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`。
- tsc：`rtk proxy npx tsc --noEmit -p .`。`src/scripts/games/starlantern/` 與 `tests/e2e/starlantern.spec.ts` 底下必須是 0 個；全 repo 的總數記在 SDD 的基準（master 大約 773 個，都在本專案之外），不可以變多。
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。headless、靜音；只用 4352，絕不用 4354；不結束任何程序。
- **重的工作（閘門、e2e）之前**：PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` 必須 ≥ 6291456（KB，也就是 6 GB），不足就等。一次只跑一套重的測試。
- 本專案沒有 prettier、eslint，不要跑。一次性的探測程式跑完立刻刪，絕不 commit。
- **收尾 G**（每個任務）：(1) 全套全綠、tsc 符合上面的條件；(2) 動到 `ui2/`、`tests/e2e/`，或改到的字串在 `tests/e2e/starlantern.spec.ts` 裡逐字出現（先 grep）時，跑 e2e 並全綠；(3) 報告：新增與修改的測試名、全套的兩行、tsc 數字、e2e 結果（沒跑就寫理由）、改了哪些釘子、偏離本計畫的地方（含理由）。

**換行（逐檔保留）**：改檔前跑 `git ls-files --eol <檔案>`，改完跑 `git diff --stat`；整檔被改寫就是換行壞了。CRLF 檔不可以用 `sed -i`。
- LF：`data/story.zh-TW.ts`、`data/gear.ts`、`data/conditions.ts`、`data/story/story.test.ts`、`data/story/scenes.ts`、`ui2/story.ts`、`ui2/story.test.ts`、`ui2/scenes/dungeon.ts`、`ui2/scenes/dungeon.test.ts`、`ui2/scenes/handbook.test.ts`、`tests/e2e/starlantern.spec.ts`、`docs/superpowers/story/*.md`。
- CRLF：`ui2/scenes/town.ts`。
- 混用（新行照相鄰行）：`data/text.zh-TW.ts`、`ui2/scenes/battle.ts`、`ui2/scenes/battle.test.ts`、`ui2/scenes/town.test.ts`。
- 新檔一律 LF。

**git**：用完整路徑 add，不可以 `git add -A`／`git add .`。用 Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。絕對不可以 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。不 push。

**文字與介面**
- 劇情文字只放 `data/story.zh-TW.ts`，介面文字只放 `data/text.zh-TW.ts`，裝備的傳說文字只放 `data/gear.ts`。符文與技能的字串裡不手打數字，一律由資料傳入（既有的 `engine/workshop.guard.test.ts` 會掃描）。
- 每一句 ≤ `MAX_LINE_CHARS`＝60 字；場景照最壞情況播出的句數計，不超過 `lineCap(id)`。台詞變自然、變長時，用拆成兩句或刪掉贅字來守住這兩條，不調整上限。
- 全形標點；對白用「」，引號裡的引號用『』；省略號「……」；破折號「──」；劇情文字不出現英文字母與阿拉伯數字（`numeral()`）。
- SCSS：本計畫預期不改。若真的要改，只能改 `src/styles/_starlantern-ui.scss`；禁 `!important`、禁行內樣式（含 `element.style`）。**字級一律不動**。
- 沒有新的美術；立繪、表情只用 `moodsFor(說話者)` 已有的。

**測試修改規則**：各任務的 Files 列出已知會紅的既有測試，只照新的形狀補，不改其他斷言，並在報告裡逐則列出。全套跑出沒列到的紅燈，就停下來回報 NEEDS_CONTEXT。commit 裡不可以出現 `it.fails`、`it.skip`、`.only`、`.todo`。

**子代理**：實作者不派子代理。朗讀審查由控制者另派全新脈絡的審查者（模型照使用者偏好：Opus 5.5）。

## 改寫任務的固定步驟（Task 5 到 Task 14 的 R1–R8）

每個改寫任務列出自己的**鍵前綴**（`storyTexts()` 的鍵，例：`scenes.prologue.`、`meet.selene.`、`people.selene.`）、要修的問題，以及要逐字照抄的定稿。步驟如下：

- [ ] **R1 紅**：把本任務的鍵前綴加進 `data/story/voice.test.ts` 的 `POLISHED`，然後跑 `voice.test.ts` 與 `data/terms.test.ts`。把失敗清單存成 SDD `task-<N>-red.txt`。一個都沒紅也照實記錄，並在報告裡說明。
- [ ] **R2 改寫前的朗讀稿**：`STORY_DUMP=.superpowers/sdd/2026-10-23-starlantern-story-polish/task-<N>-before.md STORY_DUMP_KEYS='<前綴,前綴>' rtk proxy npx vitest run src/scripts/games/starlantern/data/story/readAloud.test.ts`。
- [ ] **R3 改寫**：照 Task 3 之後的聖經改寫。要求：
  - 意思和要點不變；揭露的時機不變。
  - 每一個人照她的聲音表：助詞預算、稱呼、語域、凜選擇前後的差別。
  - 輕的場景至少有一個真的笑點；重的那一拍要留在最後一句。
  - 想像自己出聲念一遍：念起來像少了字、像翻譯、像口號的，就重寫。
  - 本任務列出的連續性修正照裁定 7 做；帳本裡逐字引用的句子，同一個 commit 一起改。
  - 停止規則（Global Constraints）：要改到事實、揭露時機或帳本 I 條目，而不在裁定 7 裡的，停下來回報 NEEDS_CONTEXT。
- [ ] **R4 釘子**：`story.test.ts` 等測試釘死的舊句子，照裁定 11 改。
- [ ] **R5 綠**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern`，必須全綠；然後做收尾 G。
- [ ] **R6 改寫後的朗讀稿**：同 R2，輸出 `task-<N>-after.md`。檔頭由 `readAloud` 印出本段的「……」數、各說話者的助詞數；報告附上改寫前→改寫後的對照。
- [ ] **R7 commit**：`fix(starlantern): story polish — <段落名>`，只 add 本任務改到的檔案。
- [ ] **R8 朗讀審查**（控制者派全新脈絡的審查者，實作者不自審）：審查者讀 `task-<N>-after.md`、`git diff <本任務 commit>~1..<本任務 commit> -- src/scripts/games/starlantern/data/story.zh-TW.ts src/scripts/games/starlantern/data/story/story.test.ts docs/superpowers/story/starlantern-lore-ledger.md`、聖經 §1–§3、帳本，逐句檢查：
  - (a) 出聲念：台灣人會這樣說嗎？像少字、翻譯腔、口號、說明書的都標出來。
  - (b) 聲音：符不符合聲音表；凜和希爾薇是否分得開；助詞是不是被當成拐杖。
  - (c) 意思：和舊句比，要點有沒有掉；有沒有提前揭露；連續性。
  - (d) 輕重：輕的場景好不好笑；重的那一拍是不是最後一句。
  - (e) 釘子：改過的斷言還有沒有釘住要點（`pinBeat` 的 `re` 是否還有關鍵名詞或事實；`expect(` 數量沒有變少）；帳本的改動是否只在裁定 7 的範圍內（停止規則）。

  審查者交出一份清單：鍵、問題、建議的寫法。實作者照修，重跑 R5，再 commit 一次 `fix(starlantern): story polish — <段落名>（朗讀審查）`。審查者只複審有改的句子。審查最多兩輪（第一次審查加一次複審）；第二輪之後還有沒解決的意見，就交給控制者裁定，不再開第三輪。

## Review Focus
1. **按取消跳過她的招募台詞，或把對話按得太快**：「加入了隊伍」一定會出現，而且在她最後一句之後；回憶與教學照樣接上，畫面不會卡住；在加入那一句上連按確定，也只會離開一次。測試：Task 1 的 `cancel during her words goes straight to the join line, then the memories` 與 `confirm on the join line leaves exactly once`。
2. **候補的招募**（隊伍滿了，`benched`）：最後一句是 `benched` 的那一句，不是 `joined`。測試：Task 1 的 `a benched rescue ends on the bench line`。
3. **同一個場景有兩種讀法**（`if.oath`、`full`、`returned`）：每一種實際播出的讀法都要守句數上限、「……」預算和助詞預算，改寫不能讓其中一種讀法超過。測試：Task 3 的 `every reading of a polished scene keeps its budget`（用 `linesWhen` 跑過全部的條件組合）。
4. **變自然之後的長句**：沒有一句超過 60 字；手機寬度下對話框放得下。測試：既有的 `no line is longer than MAX_LINE_CHARS`，以及 Task 16 的 e2e `the polished story reads inside the dialogue box, desktop and phone`（每一句 `.slx-talk .slx-text` 的 `scrollHeight <= clientHeight + 1`）。
5. **錯名或禁用寫法從介面、裝備文字溜回來**，不只在劇情裡。測試：Task 2／Task 4 的 `terms.test.ts` 掃描 `data/`、`ui2/`、`engine/` 全部非測試的原始碼。

---

## File Structure
- `data/story/voiceGates.ts`（新）：可以測的文風規則與預算，以及 `storyTexts()`。純函式，沒有 DOM。
- `data/story/voice.test.ts`（新）：新聖經的守門，用 `POLISHED` 決定檢查範圍。
- `data/story/readAloud.ts`（新）＋`readAloud.test.ts`（新）：把場景照實際播出的讀法印成朗讀稿，給改寫者與審查者用。
- `data/terms.test.ts`（新）：錯名、禁用寫法、「妳」的守門。
- `ui2/rescue.ts`（新）＋`ui2/rescue.test.ts`（新）：招募對話的播放（她的台詞、名牌規則、加入那一句）與相遇名牌的規則；`battle.ts`、`dungeon.ts` 都用它。
- 修改：
  - `ui2/story.ts`：`playLines`。
  - `ui2/scenes/battle.ts`：只在 `onAction`、`pick`、`renderResult` 改約十行，加一行 import。
  - `ui2/scenes/dungeon.ts`：「？？？」名牌。
  - `ui2/scenes/town.ts`：每日台詞不掛名牌。
  - `data/story.zh-TW.ts`：`FOUND_LINE`、`introIndex`、國字標題，以及全部劇情。
  - `data/text.zh-TW.ts`：`rescue.stranger`、刪掉 `rescue.found` 與 `battle.saidBy`、用字、回憶通知、介面句子。
  - `data/gear.ts`、`data/conditions.ts`。
  - `data/story/story.test.ts`：`storyTexts` 改成 import、退休「還有。」的測試、`SPEC_QUOTES`、釘子。
  - `docs/superpowers/story/starlantern-style-bible.md`、`docs/superpowers/story/starlantern-lore-ledger.md`。
  - 既有測試：`ui2/story.test.ts`、`ui2/scenes/battle.test.ts`、`ui2/scenes/dungeon.test.ts`、`ui2/scenes/town.test.ts`、`tests/e2e/starlantern.spec.ts`。

---

### Task 1：基準，以及招募場景進對話框（S1 A1、A2）

**Files:**
- Create: `ui2/rescue.ts`、`ui2/rescue.test.ts`
- Modify: `ui2/story.ts`、`ui2/scenes/battle.ts`（只改 `onAction` 開頭、`pick`、`renderResult` 的 `end.met` 兩段，加一行 import，合計約十行，以減少和 8h 分支的衝突）、`ui2/scenes/dungeon.ts`（約 352 行的 `meeting`，改用 `meetingPlate`）、`data/story.zh-TW.ts`（約 1515 行的 `foundLine`、`MEET`）、`data/text.zh-TW.ts`（約 79 行的 `rescueFound`、約 273 行的 `rescue`、約 168 行的 `saidBy`）、`docs/superpowers/story/starlantern-lore-ledger.md`（新的一條：相遇名牌）
- Test: `ui2/story.test.ts`、`ui2/scenes/battle.test.ts`、`ui2/scenes/dungeon.test.ts`、`data/story/story.test.ts`、`tests/e2e/starlantern.spec.ts`
- 已知會紅、照新形狀補：
  - `battle.test.ts`：`a won rescue lists who joined`、`a meeting's after-lines show who speaks`、`a won fight lists the memories found`（`joined` 不再在清單的第 0 行，後面三行改成從第 0 行算起）。
  - `dungeon.test.ts` 約 543、801 行（`T.ui2.rescue.found(...)` 改成 `FOUND_LINE`）。
  - e2e `two start, meet Selene, recall her`：約 2855 行（`.slx-talk .slx-text` 含「瑟蕾」：相遇句不再帶名字，改成等於 `FOUND_LINE`）、約 2861 行的名牌斷言、約 2874 行；`prologue, Rin's first memory, Selene, …` 約 3266 行。

**Interfaces:**
- Produces:
  - `export const FOUND_LINE: string`（`data/story.zh-TW.ts`），值是 `'有人被怪物圍住了！'`。
  - `export function introIndex(id: Meetable): number`：`STORY.meet[id].after` 裡，第一句由她說、而且內容含她名字的句子的索引；沒有這一句就回傳 `-1`。
  - `T.ui2.rescue.stranger: string`，值是 `'？？？'`。
  - `export function playLines(talk: Dialogue, lines: ScriptLine[], ctx: StoryCtx, plate?: (line: ScriptLine, i: number) => string | undefined): { done: Promise<'done' | 'skipped'>; onAction(a: UiAction): void }`（`ui2/story.ts`）：`plate` 回傳字串時，用它取代名牌（立繪照舊）；確定翻頁；取消時停下並回傳 `'skipped'`，不出摘要。
  - `export function meetingPlate(id: Meetable, part: 'before' | 'after', i: number, line: ScriptLine): string | undefined`（`ui2/rescue.ts`）：她的句子，在 `before`，或在 `after` 且 `i < introIndex(id)` 時，回傳 `T.ui2.rescue.stranger`；其他情況回傳 `undefined`。
  - `export function playRescue(talk: Dialogue, met: { id: Meetable; level: number; benched: boolean }, ctx: StoryCtx): { done: Promise<void>; onAction(a: UiAction): void }`（`ui2/rescue.ts`）：用 `playLines` 加 `meetingPlate` 播 `after`，然後用旁白說加入那一句；`done` 在加入那一句被確定或取消之後才解析。不看劇情播放設定。
  - `battle.ts` 的 `rescue: ReturnType<typeof playRescue> | null` 與 `picked: boolean` 兩個欄位。

- [ ] **Step 0：基準**（寫進 SDD `baseline.md`）：
  - 把稽核的三個檔（`story-audit.md`、`choppy-lines.txt`、`missing-glyphs.txt`）複製到 SDD `audit/`，scratchpad 可能會被清掉。
  - `git status` 必須是乾淨的（只有本計畫檔可以是未追蹤）。記下 `git rev-parse HEAD`，就是 `<BASE>`。
  - 記下全套的兩行；記下 tsc 總數與星燈迷宮底下的數量（必須是 0）。
  - 記下 `story.test.ts` 裡 `expect(` 的數量（裁定 11）。
  - 記憶體 ≥ 6 GB 後跑 `rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-23-starlantern-story-polish/gate-0 > .superpowers/sdd/2026-10-23-starlantern-story-polish/gate-0.stdout`。它用的是預設的對照目錄，最後一行可能是 `DIFFERENT`，這一次可以接受；但 vitest 必須通過，而且 `cmp gate-0/contribution.json …/contribution.8d-final.160.json` 沒有輸出。
  - 跑 e2e，記下結果。基準就已經紅的，列出來，回報給控制者。
- [ ] **Step 1：寫失敗的測試**
  - `ui2/story.test.ts` `playLines plays each line with its plate and face, the first speaker on the left`：兩句（凜、洛恩），斷言 `talk.say` 收到的名牌是 `['凜','洛恩']`；`plate` 對第 0 句回傳 `'？？？'` 時，名牌變成 `['？？？','洛恩']`。
  - `ui2/story.test.ts` `cancel stops playLines with skipped and no summary`：`done` 解析為 `'skipped'`，沒有說出 `T.ui2.story.skipped(...)`。
  - `battle.test.ts` `a won rescue keeps the result list to the spoils`：`.slx-result-lines p` 不含 `T.ui2.rescue.joined(...)`，也不含任何一句 after 台詞。
  - `battle.test.ts` `her words play in the dialogue box after 繼續, her plate once she has said her name, then the join line`：把 `STORY.meet.selene.after` 暫時換成「謝謝你們。」（瑟蕾）、「她收起了劍。」（旁白）、「我是瑟蕾。」（瑟蕾），再還原。按「繼續」後逐句確定，名牌依序是 `['？？？','','瑟蕾','']`，最後一句的文字是 `T.ui2.rescue.joined('瑟蕾', 4)`，結算視窗是 `hidden`。
  - `battle.test.ts` `a benched rescue ends on the bench line`：最後一句是 `T.ui2.rescue.benched('瑟蕾', 4)`。
  - `battle.test.ts` `cancel during her words goes straight to the join line, then the memories`：有一片 `play: true` 的回憶；在第一句按 `cancel`，接下來的文字是 `joined`；再確定，對話框的樣式變成 `memory`；播完後 `ctx.go` 收到 `'dungeon'`。
  - `battle.test.ts` `confirm on the join line leaves exactly once`：沒有回憶、沒有教學；在加入那一句上連按五次 `confirm`，再對結算的選單按一次 `confirm`；`ctx.go` 正好被呼叫一次，參數是 `'dungeon'`。
  - `battle.test.ts` `her words play whatever the story setting`：`ctx.settings` 的 `story` 設成 `'none'`，她的台詞與加入那一句照樣播。
  - `ui2/rescue.test.ts` `meetingPlate hides her name until she says it`：
    - `before` 裡她的句子回傳 `'？？？'`，凜的句子回傳 `undefined`。
    - `after` 在 `introIndex` 之前回傳 `'？？？'`，從 `introIndex` 起回傳 `undefined`。
    - 旁白一律回傳 `undefined`。
  - `dungeon.test.ts` `the found line names nobody, and her plate reads ？？？ before the fight`：第一句的文字等於 `FOUND_LINE`；她的每一句 `before`，名牌都是 `T.ui2.rescue.stranger`；凜那一句的名牌是「凜」。
  - `story.test.ts` `every meeting opens on FOUND_LINE, names her nowhere before she says it, and has her self-introduction`：
    - 對每一位 `MEETINGS`：`before[0].text === FOUND_LINE`；`FOUND_LINE` 不含任何 `CHARACTERS[*].name`；`introIndex(c) >= 0`。
    - `before` 的每一句，以及 `after` 在 `introIndex` 之前的每一句，都不含她的名字。
    - `STORY.meet.liz.after` 逐字等於裁定 2 的四句。
  - e2e（修改 `two start, meet Selene, recall her`）：
    - 相遇時收集到的名牌含「？？？」，不含「瑟蕾」。
    - 勝利後 `.slx-result` 不含「加入了隊伍」。
    - 按繼續後，`.slx-battle .slx-talk .slx-name` 出現「瑟蕾」，而且那一句的立繪 `img` 看得見。
    - 繼續按，最後的文字符合 `/瑟蕾（Lv\d+）加入了隊伍！/`，之後回到 `.slx-dungeon`。
    - 第二場相遇（約 3266 行）照同樣的形狀斷言 join line。
    - 這些都是修改既有的測試；本計畫新增的 e2e 測試，插在相關的既有測試後面，不接在檔尾（8h 也在改這個檔）。
- [ ] **Step 2：跑新的測試**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/story.test.ts src/scripts/games/starlantern/ui2/rescue.test.ts src/scripts/games/starlantern/ui2/scenes/battle.test.ts src/scripts/games/starlantern/ui2/scenes/dungeon.test.ts src/scripts/games/starlantern/data/story/story.test.ts`。預期因為 `playLines`、`FOUND_LINE`、`introIndex`、`rescue.stranger` 不存在而失敗，或者因為 join line 還在清單裡而失敗。
- [ ] **Step 3：實作**：
  - `playLines`：從 `playScene` 抽出共用的「說一句」，`playScene` 的行為不變，既有的測試要照樣綠。
  - `ui2/rescue.ts`：`meetingPlate`、`playRescue`。流程的邏輯都放在這裡，不放在 `battle.ts`。
  - `battle.ts`：
    - `onAction` 第一行：`rescue` 存在就交給它。
    - `pick` 開頭：`picked` 已經是 true 就 return，否則設成 true；有 `end.met` 時，先 `playRescue`，接著回憶、教學、離開。
    - `renderResult`：拿掉 `end.met` 的那兩段。
  - `dungeon.ts`：`meeting` 的名牌用 `meetingPlate(who, 'before', i, line) ?? sp.name`。
  - 莉茲的 `after` 照裁定 2 改成定稿的四句。其他人若 `introIndex` 是 `-1`，照裁定 2 的做法改，報告裡逐句列出。
  - 改到被釘死的舊句，照裁定 11 改斷言。
  - 刪掉 `rescueFound`、`T.ui2.rescue.found`、`T.battle.saidBy`。
- [ ] **Step 4：跑 Step 2 的指令，全綠**。
- [ ] **Step 5：收尾 G**，含 e2e；另外存兩張截圖到 SDD，1280×720 與 390×844 下她在戰鬥對話框說話的畫面（跑 e2e 時加 `SL_SHOTS`）。
- [ ] **Step 6：commit** `fix(starlantern): a rescued companion speaks in the dialogue box and joins after her last line; the found line names nobody`。

### Task 2：S1 文字修正與已核准的樣稿（稽核 A3–A10，以及錯名）

**Files:**
- Modify: `data/story.zh-TW.ts`、`data/gear.ts`（約 129、136 行）、`data/story/story.test.ts`（`SPEC_QUOTES`、被釘死的舊句）、`docs/superpowers/story/starlantern-lore-ledger.md`（I-75、第 289 行附近的 `MEMORY_GUESTS` 那一列、揭露表裡莉茲第五片「好像在哪裡看過」那一格，以及裁定 10 的偏離紀錄）
- Create: `data/terms.test.ts`
- Test: `data/terms.test.ts`、`data/story/story.test.ts`

**Interfaces:**
- Produces: `data/terms.test.ts` 裡的 `sourceTexts(): { file: string; text: string }[]`（測試檔內部使用，Task 4、Task 15 會在同一檔加測試）。它讀取 `src/scripts/games/starlantern/{data,ui2,engine}` 底下所有不是 `*.test.ts` 的 `.ts` 檔。

**定稿（逐字照抄；出自稽核 §4，使用者已核准）**
1. `prologue-inn` 旁白：「她手腕上還留著一圈發青的指痕。」（只換這一句，同一行後半由 Task 5 處理）。凜：「我什麼都不記得，你是我唯一的線索。另外，你說了三次夢話。很吵。」
2. `prologue-inn` 凜（原「吵是吵。……反正，我也只剩下面了。」）：「吵是吵。反正我能去的地方，也只剩迷宮了。」
3. `rin-reveal` 凜（原「洛恩。我被派來殺你。我現在選擇不要。」）：「洛恩，我是被派來殺你的。可是我不殺了──這是我自己決定的。」
4. `mem:bobby:4` 波比：「這些機兵，是我家的人造的。每修好一台，就像替祖先道一次歉。」；`chat:bobby:2` 波比（A3）：「嘿嘿，彈簧上得太緊，它自己從鍋子裡轉出去了！瑪莎阿姨，再一次，一下下就好喔！」
5. `mem:hero:9` 洛恩：「被殺了那麼多次，還是一直往上走。原來我一直都想回來。」
6. `chat:scarlet:2` 絲嘉蕾：「洛恩閣下，盾本來就是用來受傷的，替人擋刀也是騎士的職責。只是總覺得……我還欠著某個人。」
7. `chat:sylvie:2` 希爾薇（`full` 讀法，A8）：「新芽，我看過了。今晚我睡床。換你守窗。」
8. `mem:liz:5` 莉茲（`notReturned` 讀法，A10）：「想起來了，是爸爸！……奇怪，這張臉，我最近好像在鎮上見過？」

- [ ] **Step 1：寫失敗的測試**：
  - `data/terms.test.ts` `names are spelled as CHARACTERS and NPC_NAMES spell them`：`NAME_TYPOS` 包含 `諾艾爾`、`鮑比`、`波波`、`莉絲`、`莉姿`、`絲佳蕾`、`絲嘉麗`、`希爾維`、`席爾薇`、`莎菲娜`、`沙菲拉`、`賽蕾`、`塞蕾`、`羅恩`、`洛因`、`葛蘭`、`多朗`、`瑪沙`、`歐力克`。每一個都不能等於真正的名字（自我檢查），而且都不可以出現在 `sourceTexts()` 裡。失敗時列出檔名與錯字。
  - `story.test.ts`：`SPEC_QUOTES` 的 `rin-reveal` 那一條換成裁定 10 的兩條。
  - `story.test.ts` `the S1 lines read whole (story polish Task 2)`：定稿一到八逐字在它們的場景裡；`mem:liz:5` 的 `returned` 讀法裡，歐里克那句不含「還掛在門後，等妳回來戴」；兩種讀法仍各四句。
- [ ] **Step 2：跑測試**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/terms.test.ts src/scripts/games/starlantern/data/story/story.test.ts`。預期名字測試抓到 `gear.ts` 的兩處，S1 測試因為定稿還不存在而失敗。
- [ ] **Step 3：實作**：
  - 照抄定稿；`gear.ts` 的兩個錯名改正。
  - A9（`prologue-inn` 第一句）照稽核的意思寫成通順的兩句：凜還醒著、臉朝著他的床，不確定他在哪裡，她就睡不著。
  - `mem:liz:5` `returned` 讀法裡歐里克的那句，照裁定 7 從現在說。
  - 帳本 I-75 等處的引文同步改；記錄裁定 10。
  - 人物頁 `people.rin` 第四段裡「現在選擇不要」的回音，照定稿三的意思改。
- [ ] **Step 4：跑 Step 2 的指令，全綠**。
- [ ] **Step 5：收尾 G**（`gear.ts` 的字串有沒有逐字出現在 e2e，先 grep）。
- [ ] **Step 6：commit** `fix(starlantern): the lines that read as missing words, the approved sample rewrites, and two misspelt names`。

### Task 3：文風聖經改版、新的文風守門、朗讀工具

**Files:**
- Modify: `docs/superpowers/story/starlantern-style-bible.md`（§1.1、§1.4、§2.3、§2.5、§3、§4.1；檔頭加一段「2026-10-22 打磨改版」與使用者原話）、`data/story/story.test.ts`（`storyTexts` 改從 `voiceGates` import；Task 1、2 改過的釘子換成 `pinBeat`；刪掉約 1771 行「還有。」的那一則；約 2266 行的 `/[呢吧]|我們|洛恩/` 改成 `/吧|我們|洛恩/`）
- Create: `data/story/voiceGates.ts`、`data/story/voice.test.ts`、`data/story/readAloud.ts`、`data/story/readAloud.test.ts`

**Interfaces:**
- Produces（`data/story/voiceGates.ts`）：
  - `export interface Text { key: string; text: string; line?: ScriptLine }`；`export function storyTexts(): Text[]`，從 `story.test.ts` 原封不動搬過來。
  - `export const dots = (t: string): number`、`export const opensOnDots = (t: string): boolean`（整句只有「……」或「……。」的不算）。
  - `export const INTERJECTIONS`、`CONNECTIVES`、`VOCATIVES: ReadonlySet<string>`：
    - `VOCATIVES` 是 `CHARACTERS` 的名字、`NPC_NAMES`，再加上 小洛、小希、凜凜、老大、松鼠、小魔女、丫頭、孩子、小子、客人、年輕人、師父、老師、團長。
    - `CONNECTIVES` 有 另外、還有、可是、不過、所以、而且、然後、只是、反正、其實、但是、因為、如果、結果、總之、對了、那麼、何況、再說、畢竟、至少、當然、雖然、原來、難怪、果然、看來、好像。
    - `INTERJECTIONS` 有 嗯、好、喂、是、不、啊、咦、哼、欸、哈、嘿嘿、唔、噢、哦、哎、是嗎、對、沒事、奇怪、吵、可以、不要、不行、不用、服、不服、早、說、放著。時間詞（明天、今晚）刻意不收，「明天，大家也……」這種寫法要被抓到。
    - 清單只能加這三類的詞，每加一個都要寫在報告裡。
  - `export const TELEGRAPH_OK: readonly string[]`：最多十句；一開始只有定稿七。
  - `export function telegraphBreaks(text: string): string[]`：照裁定 6，回傳原因字串；`TELEGRAPH_OK` 裡的句子回傳 `[]`。
  - `export function heavyScene(id: SceneId): boolean`：`memory`、`town` 兩類，加上 `prologue`、`act2`、`act3`、`act4`、`rin-reveal`、`bellkeeper-arrives`、`finale`、`chat:rin:2`–`4`、`chat:hero:2`–`4`。
  - `export const ELLIPSIS = { lightPerScene: 1, heavyShare: 1 / 4, speakerShare: 1 / 6, scriptShare: 0.08 } as const`。
  - `export const VOICE: Partial<Record<Speaker, { mark?: RegExp; maxShare?: number; perScene?: number; heavyNone?: boolean; never?: RegExp }>>`：照裁定 5。
  - `export const SENTENCE_PARTICLE = (p: string): RegExp`：助詞後面接 `[。！？～」，]`。
  - `export function pinBeat(scene: SceneId, reading: Partial<LineWhen>, re: RegExp): void`：在 `linesWhen(STORY.scenes[scene].lines, { met: [...CHARACTER_IDS], full: [], returned: [], oath: false, ...reading })` 裡，正好一句符合 `re`，否則丟出錯誤並寫明場景、讀法與符合的句數（裁定 11）。
- Produces（`data/story/readAloud.ts`）：`export function readAloud(prefixes: string[]): string`。
  - 依 `SCENE_IDS` 的順序，再接上非場景的池子（`townLines`、`greet`、`rinLines`、`rinOath`、`bellkeeper`、`merchant`、`leads`、`absorb`、`people`、`truths`、`town`），印出前綴底下的每一個場景。
  - 每一種不同的實際讀法印一次，每一行是 `名牌：台詞`。名牌照遊戲顯示：相遇照裁定 2 用「？？？」，旁白空白。
  - 場景標 `［重］` 或 `［輕］`。
  - 檔頭是本範圍的「……」字串數與比例，以及各說話者的助詞數。
- Consumes：Task 1 的 `introIndex`、`FOUND_LINE`。

- [ ] **Step 1：寫失敗的測試**（`voice.test.ts`；`const POLISHED: string[] = []`，從 Task 5 起每一段改寫自己加；在那之前，範圍內的守門沒有東西可以檢查，靠下面的守門自我測試證明它們能抓到問題）：
  - 守門本身：
    - `telegraphBreaks flags the audit's choppy forms and passes natural ones`：會被抓的有 `'「那就，下次也拜託了。」'`、`'「原來我一直，想回來。」'`、`'「退路。三條。」'`、`'「還有。你說夢話。吵。」'`、`'「人，我都帶出去了。」'`；回傳 `[]` 的有樣稿一、二、三、五、七，以及 `'「吵。」'`、`'「洛恩，後面有三隻。」'`。
    - `TELEGRAPH_OK has ten lines at most, each still in the script`。
    - `telegraphBreaks segments as the plan says`：裁定 6 的每一條切分規則都有一個例子。例如：旁白裡的引文「人，我都帶出去了。」被抓到，而引文外的旁白不受影響；「你走前面。──算了，並排走。」不被抓；「……後面。……三隻。」照兩個極短句算。
    - `pinBeat passes on exactly one match`：符合零句、符合兩句都丟出錯誤，符合一句通過。
  - 在 `POLISHED` 範圍內：
    - `polished lines are whole sentences`（`telegraphBreaks` 是空的）。
    - `no polished line opens on 「……」 or carries two`。
    - `every reading of a polished scene keeps its budget`：輕的場景照 `lightPerScene`；重的場景照 `heavyShare`，`max(1, …)`；用 `linesWhen` 跑過全部的條件組合，做法同 `no scene plays more lines than its cap`。
    - `handbook, summary and absorb text spends no 「……」`。
    - `each speaker keeps to their share of 「……」`：照裁定 4，算整份劇本；只檢查台詞全部都在 `POLISHED` 底下的說話者。
    - `each speaker keeps their particle budget`：照 `VOICE`；重的場景用 `heavyScene`；`never` 對應全部的台詞。
    - `「還有。」 is retired`：比對全部的 `storyTexts()`，不受 `POLISHED` 限制。這一則在 Task 3 就要綠，所以 Task 3 要把剩下的三處「還有。」（`prologue-inn` 的「還有。你走路的樣子……」、`first-return` 的「還有。那個繃帶……」、`chat:rin:1` 旁白裡的「還有。指甲……」）照定稿一的做法改成「另外，」或併進前一句，意思不變。凜在選擇之前仍然不說「還有」。
    - `no line opens on 「洛恩。」, and one 「洛恩，」 opener a scene at most`。
    - `two-character lines belong to Rin, Doran and the interjections`。
    - `「一起回來」 three times at most, 「交給燈」 three times at most in the finale`。
    - `in banter, 你 goes only to the hero`：先把「你們」拿掉；剩下還含「你」的台詞，必須同時含 洛恩、小洛、老大、洛恩哥、閣下、大人、歸來者、先生 其中之一。
  - `readAloud.test.ts`：
    - `prints a scene's readings with plates`：`readAloud(['scenes.prologue-inn.'])` 含 `［輕］`，含 `凜：「我什麼都不記得`，旁白的行沒有名牌前綴。
    - `prints a meeting with the stranger plate`：`readAloud(['meet.selene.'])` 含 `？？？：`。
    - `writes the dump when STORY_DUMP is set`：環境變數存在時，把 `readAloud(STORY_DUMP_KEYS.split(','))` 寫到那個路徑；沒有設就什麼都不寫。
- [ ] **Step 2：跑測試**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/story/voice.test.ts src/scripts/games/starlantern/data/story/readAloud.test.ts`。預期因為 `voiceGates`、`readAloud` 不存在而失敗。
- [ ] **Step 3：實作 `voiceGates.ts`、`readAloud.ts`，改寫聖經**：
  - §1.1：「一句一個畫面」改成「寫完整、念得出口的句子；一句可以有動作和它的結果；拆句是為了念起來更好，不是規定」。保留：旁白只寫看得見的、潛台詞、不解釋世界觀、字數。
  - §1.4、§2.3：換成裁定 4 的預算；刪掉「用句號斷句」「還有。」這兩種替代寫法；寫明由 `voice.test.ts` 的哪幾則檢查。
  - §2.5：口癖的稀少規則改成指向 `VOICE`。
  - §3：每個人加一張「聲音表」：一句話說明節奏、助詞與預算、稱呼、凜選擇前／後、希爾薇（土、具體、動物與天氣、命令句）對上凜（冷、精準、數字、判決）、示範兩句（示範不得用舊的電報句）。
  - §4.1 加上用字一節（菁英、回復、妳、國字標題），指向 `terms.test.ts`。
  - 還有效的規則全部保留：明暗表、輕重分流、驚嘆號預算、配對表、專有名詞表。
- [ ] **Step 4：跑 Step 2 的指令與 `src/scripts/games/starlantern/data/story/story.test.ts`，全綠**。另外對 Task 2 的八段定稿各跑一次 `telegraphBreaks`：除了定稿七（已經在 `TELEGRAPH_OK` 裡），任何一段被抓到，就表示守門太嚴，要修守門，不是改定稿。在報告裡說明。
- [ ] **Step 5：收尾 G**。
- [ ] **Step 6：commit** `docs(starlantern): style bible — whole sentences, an ellipsis budget, a voice sheet each; test(starlantern): voice gates and a read-aloud dump`。

### Task 4：S3 用字（菁英、回復、妳、國字標題、城鎮不當說話者）

**Files:**
- Modify:
  - `data/conditions.ts`（約 20 行）、`data/text.zh-TW.ts`（約 45、75、767 行；`T.ui2.memory.piece` 用 `numeral`，從 `./story.zh-TW` import）。
  - `data/story.zh-TW.ts`：`buildScenes` 的三種標題，以及約 597、665、1005、1482 行和約 965 行註解裡過去人物對她說的「你」。
  - `ui2/scenes/town.ts`（約 97 行；同時改上方 `townLines` 的說明註解）、`data/story/story.test.ts`（`SPEC_QUOTES` 的兩條「妳」）、`docs/superpowers/story/starlantern-lore-ledger.md`（I-96 附近「城鎮自己的名字」的寫法）。
- Test: `data/terms.test.ts`、`data/story/story.test.ts`、`ui2/scenes/town.test.ts`、`ui2/scenes/battle.test.ts`（`T.ui2.memory.piece` 是用參照比對的，應該不用改）。

- [ ] **Step 1：寫失敗的測試**：
  - `terms.test.ts` `banned forms stay out of the game text`：
    - `BANNED` 包括聖經 §4.2「不要寫成」那一欄的每一個詞，加上 精英、恢復、視頻、信息、質量、土豆、靠譜、給力、大丈夫。
    - 掃描 `sourceTexts()`，失敗時列出檔名與詞。
    - `燈守` 會撞到「點燈守夜」這種組合，所以改用正規表示式 `/(?<!點)燈守(?!夜)/`。
  - `terms.test.ts` `past figures speak to her as 妳`：女性的回憶 `mem:<c>:*`（c ≠ hero）裡旁白轉述的「」，以及 `people.<c>`（c ≠ hero）的「」裡，都沒有「你」。
  - `story.test.ts` `scene titles carry no Arabic digits`：每一個 `STORY.scenes[*].title` 都不符合 `/[0-9]/`；`STORY.scenes['mem:selene:1'].title` 是 `'瑟蕾・第一片'`；`chat:selene:1` 的標題以 `'・對話一'` 結尾。
  - `story.test.ts` `the memory notice counts in Chinese numerals`：`T.ui2.memory.piece('凜', 2)` 是 `'找回了凜的記憶（第二片）。'`。
  - `town.test.ts` `the town's own day line is narration, with no name plate`：用 `game.rng` 固定抽到 `townLines` 的第 0 句；`.slx-talk .slx-name` 是空的或隱藏，文字等於那一句。
- [ ] **Step 2：跑以上測試**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/terms.test.ts src/scripts/games/starlantern/data/story/story.test.ts src/scripts/games/starlantern/ui2/scenes/town.test.ts`。預期抓到 精英 三處、恢復 一處、四處「你」、標題的數字、`town.ts` 的名牌。
- [ ] **Step 3：實作**：先 grep 全部的命中，一處一處改；命中的若是 id 或不會顯示的字，回報 NEEDS_CONTEXT，不要硬改。
- [ ] **Step 4：跑 Step 2 的指令，全綠**。
- [ ] **Step 5：收尾 G**，含 e2e（手冊標題、城鎮台詞的名牌都在畫面上）。
- [ ] **Step 6：commit** `fix(starlantern): 菁英 and 回復, 妳 in the past's words, Chinese numerals in scene titles, the town's day line as narration`。

### Task 5：改寫一，開場與第一次回城

照 R1–R8。**鍵前綴**：`scenes.prologue.`、`scenes.prologue-inn.`、`scenes.first-return.`、`scenes.act1-after.`、`scenes.chat:hero:1.`、`scenes.chat:rin:1.`、`act1Card.`。
- 連續性：公會的債、葛倫的說法（裁定 7）。帳本 I-81 到 I-86 一起看。
- 凜在選擇之前的規則一條都不鬆（`PRE_OATH_RIN`、既有的 V1 測試）。
- Task 2 的定稿一、二逐字保留；這一段的其他句子要接得上它們。
- 序章的 e2e 會播這幾場，所以收尾 G 一定要跑 e2e。

### Task 6：改寫二，凜的線

照 R1–R8。**鍵前綴**：`scenes.mem:rin:`、`scenes.chat:rin:2.`、`scenes.chat:rin:3.`、`scenes.chat:rin:4.`、`scenes.rin-reveal.`、`scenes.bellkeeper-arrives.`、`rinLines.`、`rinOath.`、`people.rin.`。
- 揭露之前和之後的聲音照聲音表：之前冷、精準，不用助詞；之後學著說想要什麼、會逗他、用「吧」不用「呢」（約 1724 行的 `rinOath`）。
- 定稿三逐字保留。
- `averted`、`guarded` 的位置規則不變（`avertedAllowed`）。
- 「一起回來」的預算和 Task 14 終幕共用，總數最多三句，本段最多用兩句，最後一句留給終幕。

### Task 7：改寫三，洛恩的回憶與各幕

照 R1–R8。**鍵前綴**：`scenes.mem:hero:1.` 到 `scenes.mem:hero:9.`、`scenes.chat:hero:2.`、`scenes.chat:hero:3.`、`scenes.chat:hero:4.`、`scenes.act2.`、`scenes.act3.`、`scenes.act4.`、`people.hero.`、`truths.`。
- 第二幕的推論、第三幕的碑文照裁定 7。
- 定稿五逐字保留。
- 洛恩是安靜的吐槽役。主題詞「回來」只留給要緊的地方，本段最多三句帶「回來」。
- 帳本寫進第二幕的新前提，用一個新的 I 編號。

### Task 8：改寫四，瑟蕾與千鶴

照 R1–R8。**鍵前綴**：`meet.selene.`、`meet.chizuru.`、`scenes.mem:selene:`、`scenes.mem:chizuru:`、`scenes.chat:selene:`、`scenes.chat:chizuru:`、`scenes.home:chizuru.`、`people.selene.`、`people.chizuru.`。
- 瑟蕾的個性不能只靠「呢」撐，要靠月相預報、推給月亮、說完收回。助詞預算照裁定 5。
- 千鶴偏文言，句子完整，不要讀成翻譯腔。
- 相遇的 `introIndex` 規則照 Task 1。

### Task 9：改寫五，莎菲拉與希爾薇

照 R1–R8。**鍵前綴**：`meet.safira.`、`meet.sylvie.`、`scenes.mem:safira:`、`scenes.mem:sylvie:`、`scenes.chat:safira:`、`scenes.chat:sylvie:`、`scenes.home:safira.`、`scenes.home:sylvie.`、`people.safira.`、`people.sylvie.`。
- 莎菲拉第五片的玩笑照裁定 7 刪掉。
- 希爾薇和凜要分得開：她用土的、具體的、動物與天氣的說法，句子可以短，但是是完整的命令句或陳述句（「退路。三條。」這種要改寫）。
- 定稿七逐字保留。
- `home:sylvie` 的「林子，從這裡再長」照電報守門改寫，意思不變。

### Task 10：改寫六，諾艾兒與波比

照 R1–R8。**鍵前綴**：`meet.noel.`、`meet.bobby.`、`scenes.mem:noel:`、`scenes.mem:bobby:`、`scenes.chat:noel:`、`scenes.chat:bobby:`、`people.noel.`、`people.bobby.`。
- 諾艾兒第四片的「雨」照裁定 7 處理。
- 波比的「喔」在她的回憶裡一個都不留；日常的精力改由「一下下」、被新發現打斷、齒輪的比喻帶出來。
- 定稿四逐字保留。

### Task 11：改寫七，莉茲與絲嘉蕾

照 R1–R8。**鍵前綴**：`meet.liz.`、`meet.scarlet.`、`scenes.mem:liz:`、`scenes.mem:scarlet:`、`scenes.chat:liz:`、`scenes.chat:scarlet:`、`scenes.home:liz.`、`people.liz.`、`people.scarlet.`、`survived`。
- 定稿六、八，以及 Task 2 改好的歐里克那句，逐字保留。
- 揭露表裡「歐里克」只出現在指定讀法裡的規則不變。
- 絲嘉蕾正式但念得出口，不用分號，也不用公文式的對仗。

### Task 12a：改寫八之一，鎮上的日常

照 R1–R8。**鍵前綴**：`townLines.`、`greet.`、`town.`、`leads.`、`merchant.`、`absorb.`。
- 鎮民的固定梗每次回來都要變奏。
- 招呼與城鎮台詞的既有 V3 規則照舊。
- 城鎮台詞已經是旁白（Task 4），所以要讀起來像旁白：鎮民的話放在「」裡。

### Task 12b：改寫八之二，鎮民的交還與鐘守

照 R1–R8。**鍵前綴**：`scenes.town:`、`bellkeeper.`。
- 交還的場景（`town:*`）是苦中帶甜的重場景，照重的預算。帳本 I-87 到 I-93 的事實與順序表一字不動（停止規則）。
- 鐘守照聲音表念經的口氣；`bellkeeper.after` 可以有一點溫度。他在終幕的那一句屬於 Task 14。

### Task 13：改寫九，閒聊

照 R1–R8。**鍵前綴**：`scenes.banter:`。
- 每一段至少一個笑點，兩個人的聲音要分得出來（只看台詞、不看名牌也猜得到是誰）。
- 凜選擇之後的那一段，照新的規則用「吧」，不用「呢」。
- 「你」只能對洛恩說（Task 3 的守門）。

### Task 14：改寫十，終幕

照 R1–R8。**鍵前綴**：`finaleWait.`、`scenes.mem:hero:10.`、`scenes.finale.`、`endingTitle`、`finaleBossName`。
- 終幕的轉折、還沒遇見的夥伴、鐘守的那一句，照裁定 7 的固定結構。不加句：`lineCap('finale')` 是 12，每一種讀法都正好播 12 句（旁白一句，說話十一句）。
- 「……」照重的預算：`floor(11 / 4)` = 2，每一種讀法最多兩句帶「……」（原本 23 句裡有 21 句）。
- 測試：`story.test.ts` 加 `the finale's turn is said: the valve and the given memories, not his days`：每一種讀法，旁白那一句同時符合 `/閥/` 與 `/記憶/`，而且 `who` 為 `bellkeeper` 的正好一句。
- 「交給燈」最多三句，其他夥伴各用自己的說法交出記憶。
- 最後一句仍然是凜，仍然呼應揭露那一夜（控制者裁定）。「一起回來」在這裡用掉全劇本最後的那一次。
- `bobby` 的閥那一句：不帶「喔」，重的場景。

### Task 15：介面、教學與裝備的文字

**Files:**
- Modify: `data/text.zh-TW.ts`（有句號的句子：提示、通知、事件文字、戰鬥訊息）、`data/gear.ts`（傳說文字）。**不碰 `T.rune`、`T.cmd`、`T.build`**：8h 分支正在改這幾塊，符文教學也在 `T.rune` 底下。它們若有念起來不順的句子，列在報告裡，留給 8h 合併之後處理。
- Task 16 找到不屬於任何改寫任務的鍵時，會把它加進本任務的範圍。
- Test: `data/terms.test.ts`，以及會釘到改動字串的既有測試（先 grep）。

- [ ] **Step 1：寫失敗的測試**：`terms.test.ts` `interface sentences open on no 「……」 and say no 「還有。」`。掃描 `text.zh-TW.ts` 與 `gear.ts` 的原始碼：不可以有 `/「……/`、開頭就是「……」的字串常值，也不可以有「還有。」。若一開始就綠，照實記錄。
- [ ] **Step 2：產生朗讀稿**：把 `T` 與 `SPECIAL_LIST` 裡含句號的字串印到 SDD `task-15-before.md`（一次性探測，跑完刪掉），交給改寫。
- [ ] **Step 3：改寫**：只改念起來不自然的句子（翻譯腔、少字、長串名詞），意思和數字來源不變。字串裡不手打數字（`engine/workshop.guard.test.ts`）；不碰 `T.rune`、`T.cmd`、`T.build`。
- [ ] **Step 4：跑測試**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern`，必須全綠。
- [ ] **Step 5：收尾 G**，含 e2e。
- [ ] **Step 6：commit** `fix(starlantern): interface, tutorial and gear lore read naturally`。
- [ ] **Step 7：朗讀審查**，同 R8，讀改寫前後的對照。

### Task 16：收尾

**Files:**
- Modify: `data/story/voice.test.ts`（`POLISHED` 涵蓋全部）、`tests/e2e/starlantern.spec.ts`（截圖測試）

- [ ] **Step 1：寫失敗的測試**：
  - `voice.test.ts` `the polish covers the whole script`：`storyTexts()` 的每一個鍵都以 `POLISHED` 的某一個前綴開頭，而且整份劇本的「……」比例 ≤ `ELLIPSIS.scriptShare`。
  - e2e `the polished story reads inside the dialogue box, desktop and phone (story polish)`：
    - 用 `__starlanternDebug` 把以下場景加進 `story.seen`：`prologue`、`prologue-inn`、`first-return`、`chat:sylvie:2`、`mem:liz:5`、`rin-reveal`、`banter:safira-sylvie:1`、`finale`；並準備終幕需要的狀態（凜選擇之後）。
    - 在 1280×720 與 390×844 下，從手冊重看每一場。每一句都等打字結束後，斷言 `.slx-talk .slx-text` 的 `scrollHeight <= clientHeight + 1`、名牌不溢出、沒有 console 錯誤、沒有 404。
    - 有 `SL_SHOTS` 時，每一場存第一句與最長一句的截圖。
- [ ] **Step 2：跑測試**。預期 `POLISHED` 漏掉的鍵會讓第一則紅。還沒改寫的鍵，回到它所屬的任務補完，不在這裡改字；不屬於任何任務的鍵，加進 Task 15 的範圍，照 R1–R8 做完再回來。e2e 的截圖測試插在 `prologue, Rin's first memory, …` 那一則後面，不接在檔尾。
- [ ] **Step 3：讓它綠**：補齊 `POLISHED`。截圖測試若抓到溢出，回報 NEEDS_CONTEXT，不改字級。
- [ ] **Step 4：整體驗收**：
  - 全套全綠；tsc 符合 Global Constraints 的條件（星燈迷宮底下 0 個，總數不超過基準）。
  - 記憶體 ≥ 6 GB 後跑 `gate-final` 對 `gate-0`：`rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-23-starlantern-story-polish/gate-final .superpowers/sdd/2026-10-23-starlantern-story-polish/gate-0 > .superpowers/sdd/2026-10-23-starlantern-story-polish/gate-final.stdout`，最後一行必須是 `gate: identical`；`cmp gate-final/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
  - e2e 全綠，加上 `SL_SHOTS=<scratchpad>/story-polish-shots` 存截圖：招募對話（Task 1 的兩張）、上面八場、1280 與 390 兩種寬度。
  - 報告附上整份劇本前後的數字（`readAloud` 全劇本的檔頭）：「……」字串數與比例、各說話者的助詞數、`「洛恩。」` 開頭的句數、「還有。」的次數。
- [ ] **Step 5：commit** `test(starlantern): the polish covers the whole script; the story reads inside the box on desktop and phone`。
- [ ] **Step 6：全分支審查**：控制者派一位全新脈絡的審查者，看整條分支對 `<BASE>` 的差異，用 `superpowers:requesting-code-review` 的做法。審查重點：玩家流程（招募、取消、候補）、守門有沒有被放寬、釘子有沒有被改成什麼都不釘、連續性修正與帳本是否一致。截圖交給使用者看。
