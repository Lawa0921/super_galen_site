# 星燈迷宮 計畫 8g：技能工坊與「之前 → 之後」預覽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 技能深化 spec §17 的第 ⑦ 步：玩家在「技能工坊」把符文裝上、拆下、移到別人身上，裝之前就看到這一招「之前 → 之後」的每一個數字和不能裝的原因；首次拿到符文時播一次教學；戰鬥選單與技能樹的變招也用同一張卡的數字。普通難度的每一個量測值逐位元不動。

**Architecture:**
- **一張卡、一個模型**：`ui2/skillCard.ts` 是純函式：從「這名角色、這一招、這組插槽」算出卡片（目標、段數、屬性、威力、回復、效果、回合、TP、HP 消耗、戰鬥 TP 上限，加上「附加」清單），全部經過引擎自己的 `skillFor`／`skillCost`／`treeCost`／`battleReservePct`，所以預覽就是裝上去之後的樣子。工坊、狀態頁、戰鬥選單、技能樹的變招預覽都讀它。
- **工坊是自己的畫面**：照裝備的先例（狀態頁「裝備」分頁唯讀、`EquipScene` 才能換），狀態頁「技能」分頁變成唯讀總覽（插槽小點、符文行），按 Enter／點一下進 `WorkshopScene`：左邊技能清單、中間卡片、右邊插槽與符文清單。公會與迷宮的野外選單也有入口。
- **引擎只加唯讀的小零件**：`runeView`（裝符文之前的招與每個符文是否生效，和 `applyRunes` 同一套判斷）、`moveRune`（拆下＋裝上，一次成功或完全不變）、`lastingBarrierLoss`、`runeTutorialSeen` 旗標，以及招式說明跟著符文改字。模擬從不碰它們，所以每個任務的閘門都必須 `identical`。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、SCSS、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-20-starlantern-skill-builds-design.md`（使用者 2026-10-20 核准，細節授權）。本計畫實作 §6.8 全部、§6.5 的「移動」與首次教學、§6.6 第 4 點（失效不拆，畫面上變灰寫原因）與第 6 點（戰鬥外顯示被保留的 TP 上限）、§6.2 的「需要：火（可由屬性符文提供）」在畫面上的呈現。不做：建議 build、一鍵套用、跟隨、遊戲內「自動」、符文平衡帶（第 ⑧ 步）；符文與技能圖示（第 ⑨ 步）；難度分級。前置：計畫 8f 完成（HEAD `93fef1bab` 之後，含 8f 的小修正輪）。必讀：SDD ledger `.superpowers/sdd/2026-10-20-starlantern-plan8-skills/progress.md` 的 8e、8f 各行（尤其交給 ⑦ 的清單）、`.superpowers/sdd/2026-10-21-starlantern-plan8e-rune-engine/task-8-report.md`、`.superpowers/sdd/2026-10-22-starlantern-plan8f-rune-economy/task-6-report.md`。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄：`.superpowers/sdd/2026-10-22-starlantern-plan8g-skill-workshop/`（下稱 SDD）。行號只供定位，動手時一律用內容找。

## 現有的介面（8e、8f 實作，本計畫照用）
- `engine/runes.ts`：`skillTags(def)`、`runeFits(def, rune, others, core)`、`runeStates(def, refs, core)`、`runeWhy(miss)`、`applyRunes(core, extra, refs)`（`HIT_WORDS` 改段數的字）、`runeNote(def, id)`（目前只有常駐＋結界一句）。
- `engine/battle.ts`：`fromMember(m, cell)`（`runesOf` 抄進 `Combatant.runes`）、`skillFor(c, id)`、`skillCost(c, id)`；`engine/progression.ts`：`treeCost(m, skill, cost)`、`learnedSkills`、`canRaiseNode`、`raiseNode`、`swapPair`。
- `engine/sockets.ts`：`socketCount(level)`、`socketable(m)`、`bagCount`、`ownedCount`、`reservedTpPct`（**算進未生效的**，只給上限檢查用）、`socketRune`／`unsocketRune`（`SocketFail` ＝ `invalid | none | slot | same | group | reserve`）、`validRuneFields`／`repairRuneFields`。
- `engine/mechanics/runes.ts`：`battleReservePct(c)`（戰鬥裡真正保留的，只算生效中的常駐）、`applyLasting`；`engine/mechanics/barrier.ts`：`raiseBarrier`。
- `engine/game.ts`：`canSocketRune`、`socketRune`、`unsocketRune`（`town`、`map` 可以，其他 `invalid`；城鎮立刻存檔，迷宮等下次回城）、`runesMoved`。
- `data/runes.ts`：`RUNE_IDS`、`RUNES`、`RUNE_TIERS`、`tiersOf`、`RUNE_SLOT_LEVELS`、`RESERVE_CAP`、`runeKey`；`data/text.zh-TW.ts` 的 `T.rune`（`label`、`why`、`fail`、`bag`、`socketedNote`…）。
- 畫面：`ui2/scenes/equip.ts`（三欄、Tab 換區、Q/E 換人、滑過預覽、觸控第一下選第二下做）、`ui2/scenes/statusTabs.ts`（`StatusTab`、`cueFrame`）、`ui2/widgets.ts`（`MenuView`、`Dialogue`）、`ui2/menu.ts`（`MenuItem`）。

## 計畫裁定（spec 留給實作者、spec 與程式碼不一致之處）

標「設計者裁定」的是 spec 沒寫死、由本計畫決定的細節（使用者授權：「技能設計由你決定細節」；spec §17「技能工坊……的版面交給實作者」），每條附一行理由。

1. **設計者裁定：工坊是自己的畫面，不塞進狀態頁的分頁**。spec §6.8 說「狀態頁的技能分頁改成技能工坊」；程式碼裡狀態頁的分頁區只有約 364px 寬（640×360 的舞台、左邊 250px 是立繪），放不下「技能清單＋卡片＋符文清單」。照裝備的先例：狀態頁「技能」分頁維持唯讀總覽（多了插槽小點與符文行），按 Enter 或點一招就進 `WorkshopScene`，全寬三欄。理由：三樣東西同時看得到，才不用記「剛剛那個數字是多少」。
2. **設計者裁定：工坊三欄**：左「技能」（`socketable(m)` 的順序；每招名稱後面是插槽小點：`◆` 生效、`◇` 空或未生效——未生效的什麼都不做，所以和空的同一個形狀，插槽欄寫出它的名字與原因；未開的槽不畫）；中「卡片」（之前／之後兩欄，變了的列標亮）；右「插槽」，在一個槽上按 Enter，右欄換成那個槽的「符文清單」。標題列：成員名牌（◀ ▶）與戰鬥 TP 上限那一行。理由：從左到右就是「選招 → 看 → 選槽 → 選符文」的順序。
3. **設計者裁定：裝上、拆下、移動都是按一下就好，不再問一次**：戰鬥外免費、可以馬上拆回來（spec §6.5），而預覽已經先給看了。理由：問兩次只會讓人不想試。
4. **設計者裁定：工坊不讓人裝上不會生效的符文**。引擎的 `socketRune` 允許（spec §6.6 第 4 點：換了裝備後失效的符文要能留在原位）；工坊的符文清單把不相容的排在後面、變灰、寫一行原因，游標仍可停在上面讀（照 8f 鍛造屋的先例），按 Enter 只播錯誤音並說原因。理由：「一個符文一件事」——裝上去什麼都沒發生是最不直覺的結果。已經裝著、後來失效的照樣留著，顯示「未生效：需要『單體』」。
5. **設計者裁定：符文清單也列出裝在別處的符文**（spec §6.5「可以從任何角色的任何技能移到任何角色」）：槽裡有符文時第一列是「拆下」；然後是袋子區段（每種每階一列，右欄「袋子 n」）；最後是標題「從別人身上移過來」之下的區段，每一個裝在別人（或自己別招）槽裡的符文一列（右欄寫成員名），選了就是一次 `moveRune`。兩個區段內各自排序：能裝的在前 → 會改變的列數多的在前 → `RUNE_IDS` 順序 → 階級高的在前。游標停在移過來的一列時，卡片多一行「諾艾兒・火之星彈：全體 → 單體」（給出者那一招會少掉什麼），移完的訊息寫出給出者。理由：按一下絕不能在玩家沒看到的情況下拿走隊友的符文，所以它們永遠不排在最上面。
6. **設計者裁定：卡片的列**（spec 的範例卡片是起點）：目標一定有；有傷害才有段數、屬性、威力；有回復（含復活）才有回復；有增益、減益、結界、裝置才有效果與回合；TP 一定有；有 HP 消耗才有；兩邊任何一邊有常駐保留時才有「戰鬥 TP 上限」。多個傷害效果的數字不同時用「／」並列。目標是全體時威力寫「84（每個目標）」。數字四捨五入成整數，只為了顯示。「附加」不是兩欄，是清單：新多的前面標「＋」、拿掉的標「−」並劃線、兩邊都有的照常。理由：異常、觸發這種一句話放不進一格。
7. **設計者裁定：「附加」寫的是這一招實際的狀態**，不是符文的句子：每段命中異常、每次施放異常（同一種取最高機率，寫出合併後的數字）、餘波（寫出這一招屬性對應的異常：「暴擊時必定灼燒」）、吸血、回氣、破甲、除厄、化盾、觸發、雙重詠唱、彈射、回聲、同步、常駐、星燈輪轉。數字全部讀 `SkillDef` 的欄位（`onHit`、`inflict`、`drainPct`、`runeRules`…），不讀符文表、不寫死。
8. **設計者裁定：「持有／袋子」**（8f 裁定 13 延續）：符文清單的右欄寫「袋子 n」（能拿來裝的就是袋子裡的）；游標停在一種符文上時，卡片下面寫「持有 n（袋子 m，鑲嵌中 k）」。
9. **控制者裁定落實：「戰鬥中被保留」一律用 `battleReservePct(fromMember(m, 0))`**，不用 `reservedTpPct`（後者算進未生效與未學會的槽，只拿來擋上限）。工坊標題列與狀態頁「能力」的 TP 那一行都顯示「戰鬥中上限 c」；上限被擋時的原因用既有的 `T.rune.fail.reserve(RESERVE_CAP)`。
10. **控制者裁定落實：兩個常駐結界要警告**（8e m5）：預覽或現狀裡，她的常駐結界在戰鬥開始時會有被換掉的（`lastingBarrierLoss > 0`，照引擎的 `raiseBarrier` 算，所以有「雙結界」機制節點時兩種不同的結界不算），卡片下面一行警告：被換掉的那個照樣保留 TP 上限。引擎不改。
11. **設計者裁定：觸控照本專案的慣例，不做長按**（spec §6.8「手機長按」）：滑鼠滑過就預覽、點一下就做；觸控第一下只移游標並預覽，同一列再點一下才做（`equip.ts` 的 `armed` 做法）。理由：同一個遊戲裡兩種觸控規則會讓人困惑。
12. **設計者裁定：戰鬥選單的「符文小圖示」先用文字**：圖示是第 ⑨ 步；名稱後面依生效中的符文數畫 `◆`（未生效的不畫，戰鬥裡只有會作用的才重要），說明列前面加一段卡片摘要「全體・威力 84・火」，右欄維持 TP。殘響的說明也改用被重現那一招的卡片摘要（8d 留下的「殘響的變招說明整段照抄」順手解決）。
13. **控制者裁定落實：教學用自己的旗標 `runeTutorialSeen`**（不看 `runesOpen`）：第一次在戰鬥結算拿到符文的那一場，結算與記憶播完之後播；若玩家已經有符文卻沒看過（例：在 8f 期間拿到的），第一次打開工坊時播。只有拿到過符文才播；在迷宮裡看過的，下一次回城存檔才寫進存檔。教學裡的數字（Lv 5／20／35）從 `RUNE_SLOT_LEVELS` 產生。
14. **設計者裁定：招式說明跟著符文改字**（8e 延到 ⑦ 的文字項目）：`applyRunes` 在目標真的改變時，照「舊目標 → 新目標」那一組改說明裡的目標字，只動那一組的字（`enemy>enemies`：單體→全體、一名敵人→全體敵人、牠→牠們；`ally>allies`：一名隊友→我方全體、單體→全體；`enemies>enemy`：全體敵人／敵方全體→一名敵人、全體→單體、牠們→牠；`allies>ally`：我方全體／全隊→一名隊友、全體→單體；`self>allies`：自身→我方全體），屬性真的改變時改「X屬性」，段數真的改變時照現有的「n 段／次／枚」改；用中文數字寫段數的說明（目前只有順手牽羊「手一晃、二晃、三晃，輕輕三下」）整句由 `data/skills.ts` 的 `HIT_DESC[id](hits)` 重寫，前後一致（不會出現「三晃……四下」）。合併的異常機率、餘波的實際異常不改說明，改由卡片的「附加」與符文旁的註記說清楚（`runeNotes`，裁定 15）。理由：說明裡寫「全體」、卡片寫「單體」是最直接的矛盾。
15. **設計者裁定：`runeNote` 擴成 `runeNotes(def, id, others)`**，回傳這個符文放在這一招上要多說的句子：常駐＋結界（既有那句）、這一招本來就有同一種異常（「這招本來就有 30% 中毒，取較高的一個」）、餘波（「這招是火屬性：暴擊時必定灼燒」，屬性看 `others` 裡生效的屬性符文，否則看招式本身）。數字都從 `def` 讀。
16. **設計者裁定：變招也用同一張卡**（spec §6.8「裝符文、選變招都用同一張卡」）：技能樹的說明區在「一對變招中空的那一邊」或「還沒點、現在可以點的變招」上，多一行只寫有變的列「段數 1 → 2・威力 140 → 70」（同一個 `compareCards`，`before` 是現在、`after` 是換邊或點下去之後）。理由：樹的說明區放不下整張卡；只列變的列就是這張卡的重點。
17. **設計者裁定：入口**：公會指令在「技能樹」後面加「技能工坊」；迷宮野外選單在「裝備」後面加「技能工坊」；狀態頁「技能」分頁 Enter 開第一招、點一招開那一招。從狀態頁進來的，返回時回到狀態頁的技能分頁、同一名成員（狀態頁的 `arg` 多一種 `tab:skills:<成員>`）；狀態頁從工坊回來後按返回，依 `phase` 回公會或迷宮（不回工坊）。還沒有符文時工坊照樣能開，符文清單寫哪裡拿得到（`runesOpen` 之前用 `T.rune.fail.closed`）。
18. **spec 的小問題順手修**（spec §6.8 末段）：「能力」各分類的表格欄位對齊（`table-layout: fixed`，每張表同一組欄寬）；洛恩 5 條分支的標題不再被省略號截斷（寬版標題分兩行：名稱一行、點數一行；兩段都切自既有的 `T.ui2.tree.branch(name, n)`，不另寫一份字）。
19. **`T.rune.fail.invalid`**（8e 延到 ⑦）：「現在不能換符文」；另加 `empty`「這個槽是空的」。

## Global Constraints

**使用者的方向（最高依據）**
- 「不夠直覺的話我可能會懶的研究 build」：一個符文一件事；裝之前就給看「之前 → 之後」（目標、TP、威力、段數、附加效果、為什麼裝不上）；插槽少（最多 3）；原因寫成一行人話。「更有深度」和「更好懂」衝突時選好懂（spec §1、§4）。
- 「所以不裝符文頂多過普通」：`engine/balance*.test.ts` 的門檻與種子凍結；本計畫沒有任何任務可以移動任何量測值。

**分支與基準**
- `feat/starlantern-story`，在 8f 小修正輪的提交之後。開工前 `git status`：本計畫要改的檔案有別人未提交的修改，停下來回報 NEEDS_CONTEXT。
- 閘門 `against` 鏈：Task 1 對 8f 的最後一個閘門（`.superpowers/sdd/2026-10-22-starlantern-plan8f-rune-economy/` 底下編號最大的 `gate-*`，`gate-6final` 除外；8f 小修正輪若錄了新的就用新的）；之後每個任務對前一個任務在 SDD 的 `gate-<N>`。**每個任務的閘門都必須 `gate: identical`**；不同就是 bug，停下來回報 BLOCKED，不准重錄夾具。Task 9 另跑一次對 8d 最終閘門 `.superpowers/sdd/2026-10-21-starlantern-plan8d-tree-rework/gate-10`，並 `cmp` 它的 `contribution.json` 與 `engine/__fixtures__/sim-gate/contribution.8d-final.160.json`。
- 戰力對等：`engine/parity.test.ts` 的 `PARITY_TASK` 整個計畫維持 `between plans`（`prev: 'contribution.8d-final.160.json'`、`changed: []`）；不錄新表。不覆寫 `engine/__fixtures__/` 底下任何既有檔案。
- 亂數：不可以 `Math.random`；本計畫沒有任何新的抽取（工坊、卡片、教學都不抽）。

**測試與檢查**
- TDD：先寫失敗的測試，確認它因正確的理由失敗，再實作。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`。
- 閘門：`rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-22-starlantern-plan8g-skill-workshop/gate-<N> <against> > .superpowers/sdd/2026-10-22-starlantern-plan8g-skill-workshop/gate-<N>.stdout`（stdout 不寫進閘門自己的 log）。
- tsc：`rtk proxy npx tsc --noEmit -p .`；starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個（repo 原本約 43 個與本專案無關）。
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`；headless、靜音；只用 4352，絕不用 4354，不結束任何程序。
- **重的工作（閘門、e2e）之前**：PowerShell `Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory` 確認 ≥ 6291456 KB（6 GB）；不足就等。一次只跑一套重的測試。
- 本專案沒有 prettier、eslint，不要跑。一次性的探測程式跑完立刻刪，絕不 commit。
- **每個任務的收尾（下稱「收尾 G」）**：(1) 全套全綠、tsc 0；(2) 記憶體 ≥ 6 GB 後跑閘門，必須 `gate: identical`；(3) 跑 e2e 全綠；(4) 有畫面的任務把 1280×720、844×390、390×844 的截圖存 scratchpad 附在報告；(5) 報告：新增的測試名、閘門最後兩行、全套的兩行、e2e 結果、偏離本計畫的地方（含理由）。

**換行（逐檔保留）**：改檔前 `git ls-files --eol <檔案>`；改完 `git diff --stat`，整檔被改寫就是換行壞了。CRLF 檔不可以用 `sed -i`。已知：CRLF：`engine/state.ts`、`engine/save.ts`、`ui2/menu.ts`、`ui2/scenes/status.ts`、`ui2/scenes/guild.ts`（`data/skills.ts` 動手前先 `git ls-files --eol`）；LF：`engine/runes.ts`、`engine/sockets.ts`、`engine/mechanics/runes.ts`、`ui2/scenes/statusTabs.ts`、`ui2/scenes/dungeon.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`；混用（新行照相鄰行）：`engine/battle.ts`、`engine/game.ts`、`data/text.zh-TW.ts`、`ui2/widgets.ts`、`ui2/scene.ts`、`ui2/main.ts`、`ui2/scenes/battle.ts`、`ui2/scenes/facility.ts`。新檔一律 LF。

**git**：完整路徑 add，不可以 `git add -A`／`git add .`。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。絕對不可以 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。不 push。

**介面與文字**
- 星燈迷宮的字只放 `data/text.zh-TW.ts`：工坊的放新的 `T.ui2.workshop`，符文的放 `T.rune`。**字串裡不手打數字**：階級數字、Lv、百分比、上限一律由資料傳入（Task 9 有掃描守門）。全形標點、不用「……」。符文一律寫「名稱（階級）」（`T.rune.label`），顏色用 `slx-rarity-<階級>`。
- SCSS 只在 `src/styles/_starlantern-ui.scss`；禁 `!important`、禁行內樣式（含 `element.style`、`style` 屬性）。
- 沒有新的美術：沒有符文、技能圖示（第 ⑨ 步），不放佔位圖、不用 CSS 畫形狀當圖示；`◆◇` 是文字。已發布的技能圖示照 `skillIco` 的做法有就顯示。
- 選單、按鍵、滑鼠照其他 ui2 畫面：↑↓ 移動、Enter 確定、Esc／右鍵返回、Tab 換區、Q/E 換人、滑過移游標、`[inert]` 底下的東西不接受點擊；返回控制用 `backControl`。
- 版面：1280×720、844×390、390×844 下，工坊每一個視窗都在舞台裡，每一列 `scrollWidth <= clientWidth`（e2e 量）；長的清單用游標捲動，不出現原生捲軸。

**測試修改規則**：各任務 Files 列出已知會紅的既有測試，只照新形狀補（不改其他斷言）並在報告逐則列出；全套跑出沒列到的紅燈就停下來回報 NEEDS_CONTEXT。`it.fails`、`it.skip`、`.only`、`.todo` 不可以出現在 commit。

**子代理**：實作者不派子代理。

## Review Focus
1. **預覽和裝上去的結果不一樣**：玩家看到「之後 84」，裝上去卻是別的數字。測試：Task 3 `the preview is the result`（每一個符文、每一招、袋子與移動——含同一人兩招之間——都比；預覽本身就是在狀態副本上跑引擎的拆裝）。
2. **換了裝備或變招，已經裝著的符文失效**：不會被拆、不會讓畫面出錯，技能清單的小點變成 `◇`、插槽欄與狀態頁寫「未生效：需要…」。測試：Task 4a `a rune that stopped working stays, with its reason`。
3. **從別人身上移過來被拒絕**（同群組、常駐上限）：兩邊都和原來一樣，原因寫出來。測試：Task 1 `a refused move changes nothing on either side`、Task 4b `a refused move says why`。
4. **袋子裡最後一個被裝走、換成員、換招**：清單變短後游標仍在範圍內，不出錯。測試：Task 4b `the cursor stays in the list when it shrinks`。
5. **在迷宮的野外換符文**：當場生效、下一次回城才存；戰鬥中打不開（說「現在不能換符文」）。測試：Task 1 `runes move in the field and are saved at the next town save`、`a battle refuses with invalid`。

---

## File Structure
- `ui2/skillCard.ts`（新）：卡片模型、比較、符文清單、插槽狀態、戰鬥摘要、TP 上限行。純函式，不碰 DOM。
- `ui2/scenes/workshop.ts`（新）：`WorkshopScene`。
- 修改：`engine/battle.ts`（`runeView`，`skillFor` 改用共用的 `skillBase`）、`engine/runes.ts`（說明改字、`runeNotes`）、`engine/sockets.ts`（`SocketAt`、`moveRune`；`runeTutorialSeen` 的驗證與修復）、`engine/state.ts`（`runeTutorialSeen?`）、`engine/mechanics/runes.ts`（`lastingBarrierLoss`）、`engine/game.ts`（`canMoveRune`、`moveRune`、`seeRuneTutorial`）、`ui2/scene.ts`＋`ui2/main.ts`（`'workshop'`）、`ui2/menu.ts`＋`ui2/widgets.ts`（`MenuItem.badge`）、`ui2/scenes/statusTabs.ts`、`ui2/scenes/status.ts`、`ui2/scenes/guild.ts`、`ui2/scenes/facility.ts`、`ui2/scenes/dungeon.ts`、`ui2/scenes/battle.ts`、`data/skills.ts`（`HIT_DESC`）、`data/text.zh-TW.ts`、`src/styles/_starlantern-ui.scss`。
- 測試：`ui2/skillCard.test.ts`、`ui2/scenes/workshop.test.ts`、`engine/workshop.guard.test.ts`（新），加上既有的 `engine/runes.test.ts`、`engine/sockets.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`、`engine/battle.test.ts`、`engine/runes.battle.test.ts`、`engine/mechanics/barrier.test.ts`、`ui2/scenes/status.test.ts`、`ui2/scenes/guild.test.ts`、`ui2/scenes/facility.test.ts`、`ui2/scenes/dungeon.test.ts`、`ui2/scenes/battle.test.ts`、`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 引擎的唯讀零件：`runeView`、`moveRune`、教學旗標、結界警告、`fail.invalid`

**Files:**
- Modify：`engine/battle.ts`、`engine/sockets.ts`、`engine/state.ts`、`engine/mechanics/runes.ts`、`engine/game.ts`、`data/text.zh-TW.ts`
- Test：`engine/battle.test.ts`（或 `engine/runes.battle.test.ts`）、`engine/sockets.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`、`engine/runes.battle.test.ts`

**Interfaces:**
- Consumes：`applyRunes`、`runeStates`、`socketRune`、`unsocketRune`、`raiseBarrier`、`knobOf`、`runesMoved`。
- Produces：
  - `engine/battle.ts`：`export function runeView(c: Pick<Combatant, 'powers' | 'ranks' | 'weaponKind'>, id: string, refs: readonly RuneRef[]): { def: SkillDef; states: { ref: RuneRef; miss: RuneMiss | null }[] } | undefined`：`def` ＝ `skillFor` 不帶符文的結果（含 `extra`、`knobWords`）；`states` ＝ `runeStates({ ...core, effects: [...core.effects, ...extra] }, refs, core)`，和 `applyRunes` 的判斷是同一份。做法：把 `skillFor` 裡「樹、精通、傳說威力」那一段抽成私有的 `skillBase(c, id): { core: SkillDef; extra: Effect[] } | undefined`，`skillFor` 與 `runeView` 都用它（行為不變，閘門證明）。
  - `engine/sockets.ts`：`export interface SocketAt { id: CharacterId; skill: string; slot: number }`；`export function moveRune(s: GameState, from: SocketAt, to: SocketAt): { ok: true; state: GameState } | { ok: false; reason: SocketFail | 'empty' }`：`from` 與 `to` 相同 → `invalid`；`unsocketRune(from)` 失敗就回它的理由；在那個結果上 `socketRune(to, 拆下來的那一個)`，失敗就回理由而且**傳回的是原本的 `s`**（兩邊都不動）；不改 `s`。
  - `engine/state.ts`：`GameState.runeTutorialSeen?: true`（註解：第一次拿到符文後播過的教學，裁定 13）。`validRuneFields`：存在時必須是 `true`；`repairRuneFields`：其他值刪掉（同 `runesOpen`）。
  - `engine/mechanics/runes.ts`：`export function lastingBarrierLoss(c: Combatant): number`：她生效中的常駐結界（`lastingSkills` 裡有 `barrier` 效果的，依學會順序）在一個只有 `barriers: []` 的暫存戰鬥狀態上逐一 `raiseBarrier`，回傳「架起來的個數 − 最後還在的個數」。不抽亂數、不改 `c`。
  - `engine/game.ts`：`canMoveRune(from: SocketAt, to: SocketAt): SocketFail | 'empty' | null`、`moveRune(from, to): { ok: true } | { ok: false; reason: SocketFail | 'empty' }`：`phase` 不是 `town`／`map` → `invalid`；成功走 `runesMoved`（城鎮立刻存、迷宮等回城）。`seeRuneTutorial(): void`：設 `runeTutorialSeen = true`；城鎮立刻存檔（存檔失敗只留 `save-failed`），其他時候等下次回城存檔。
  - `data/text.zh-TW.ts`：`T.rune.fail.invalid`「現在不能換符文」、`T.rune.fail.empty`「這個槽是空的」。
- [ ] **Step 1：先寫失敗的測試**
  - `runeView tells what applyRunes uses`：希爾薇戴 `lg-sylvie`（瞄準射擊的 `extra` 降防）、瞄準射擊帶延長：`runeView(...).states[0].miss` 是 `needs`（延長只看不含 `extra` 的標籤，8e 裁定 18），而 `skillFor` 的結果也沒有多回合；千鶴的守之結界帶延長 → `miss` 為 null、回合真的多了；`def` 等於 `skillFor({ ...c, runes: undefined }, id)`；沒有任何改寫的招（沒有階級改寫、精通、傳說威力、符文），`skillFor(c, id)` 仍然 `toBe(SKILLS[id])`（同一個物件）；有改寫的與改之前 `toEqual`。
  - `a rune moves from one member to another`：諾艾兒的火之星彈槽 0 有擴散（魔法）→ `moveRune` 到希爾薇的瞄準射擊槽 0：諾艾兒那招沒有符文了、希爾薇有、袋子不變。
  - `a refused move changes nothing on either side`：目標那招已經有集中 → `group`，傳回的 `state` 就是原本的物件；常駐移到已經保留 90% 的人 → `reserve`；從空槽移 → `empty`；`from === to` → `invalid`。
  - `runes move in the field and are saved at the next town save`（`engine/game.test.ts`）：`map` 階段 `moveRune` 成功、`storage` 沒被寫；回城存檔後存檔裡有新的位置；`battle` 階段 → `invalid`（`a battle refuses with invalid`）。
  - `the tutorial flag is true or absent`（`engine/sockets.test.ts`）：`validRuneFields` 對 `true`、省略為 true，對 `false`、`1` 為 false；`repairRuneFields` 刪掉它們。`engine/save.test.ts`：`runeTutorialSeen survives a save and a load`。`engine/game.test.ts`：`seeRuneTutorial saves in town, waits in the labyrinth`。
  - `two lasting barriers: one is lost`（`engine/runes.battle.test.ts`）：千鶴兩個結界招都裝常駐 → `lastingBarrierLoss` 1；只有一個 → 0；有「雙結界」機制節點、兩種不同的結界 → 0；和 `createBattle` 開場後實際剩下的結界數一致。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/sockets.test.ts src/scripts/games/starlantern/engine/save.test.ts src/scripts/games/starlantern/engine/game.test.ts src/scripts/games/starlantern/engine/runes.battle.test.ts src/scripts/games/starlantern/engine/battle.test.ts`。
- [ ] **Step 3：實作**（照 Interfaces）。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-1`，against 8f 的最後一個閘門）。
- [ ] **Step 6：commit**：`feat(starlantern): a rune can move between members in one step; the rune tutorial gets its own flag`。

### Task 2: 招式說明跟著符文改字；符文放在這一招上的註記

**Files:**
- Modify：`engine/runes.ts`（`applyRunes` 的說明改字、`runeNote` → `runeNotes`）、`data/skills.ts`（`HIT_DESC`）、`data/text.zh-TW.ts`（`T.rune.notes`）
- Modify（會紅的既有測試）：`engine/mechanics/barrier.test.ts` 約 226–228 行的 `runeNote`（改成 `runeNotes`：結界＋常駐是那一句的陣列，其他是 `[]`）；斷言符文改寫後整段 `desc` 的地方（只在新規則確實改了那段字時）。
- Test：`engine/runes.test.ts`

**Interfaces:**
- Consumes：`applyRunes` 既有的 `HIT_WORDS` 改字、`RUNES`、`AILMENT` 名稱（`T` 裡既有的異常名）。
- Produces：
  - `applyRunes` 的 `out.desc`：裁定 14 的三組改字，每組只在那件事真的改變時套用（`def.target` 真的變了、屬性真的變了、每一個傷害效果的段數都從同一個數變成同一個數），替換全部出現的地方。目標的改字表放在 `engine/runes.ts`：`TARGET_WORDS: Partial<Record<string, [string, string][]>>`，鍵是「舊目標>新目標」（例 `'enemy>enemies'`），只套那一組（長的字先換）；屬性用「火屬性」這種「X屬性」字組。`data/skills.ts`：`export const HIT_DESC: Partial<Record<string, (hits: number) => string>>`，現在只有 `pickpocket`，`HIT_DESC.pickpocket(3) === SKILLS.pickpocket.desc`；`applyRunes` 在段數改變、而且 `desc === HIT_DESC[id](舊段數)` 時整句換成 `HIT_DESC[id](新段數)`（不再套 `HIT_WORDS`）。
  - `export function runeNotes(def: SkillDef, id: RuneId, others: readonly RuneId[] = []): string[]`：取代 `runeNote`（呼叫的地方一起改）。`def` 是裝符文之前的招（`runeView().def`）。句子：常駐＋結界（`T.rune.lastingBarrier`，既有）；異常符文的那一種異常這一招本來就有（`inflict` 或傷害效果的 `onHit`）→ `T.rune.notes.merged(pct, 異常名)`「這招本來就有 {pct}% {異常}，取較高的一個」；餘波 → `T.rune.notes.aftermath(屬性名, 異常名)`「這招是{屬性}屬性：暴擊時必定{異常}」（屬性看 `others` 裡的灼焰／寒霜／雷鳴，否則看 `def` 第一個傷害效果；物理是流血、冰是凍結，頭目的字已經在符文句子裡）。
- [ ] **Step 1：先寫失敗的測試**（`engine/runes.test.ts`）
  - `words follow the target`：每一位角色 Lv 50，走過她每一對變招的兩邊（`swapPair`）與每一個指向她招式的傳說威力（`Combatant.powers` 直接放 `POWER_LIST` 的 id）：每一招的 `skillFor` 結果加上擴散／集中／共享中能生效的那一個，若裝之前的 `desc` 含這一組「舊>新」改字表的任何一個舊字，裝之後的 `desc` 含對應的新字、不含那個舊字（斷言的是「目標字被換了」，不是「全體」兩個字不見）；不含的，`desc` 不變。釘死的例子：橫掃＋集中 →「攻擊一名敵人」；回復一名隊友＋擴散 →「回復我方全體 HP」；單體強力突刺＋擴散 →「全體強力突刺」。
  - `words follow the element`：每一招 × 灼焰／寒霜／雷鳴中能生效且真的改了屬性的：`desc` 不再含原屬性的「X屬性」；例：火之星彈＋寒霜 →「冰屬性魔法攻擊」。
  - `順手牽羊's whole phrase counts with 連擊`：`HIT_DESC.pickpocket(3)` 等於原本的說明；順手牽羊＋連擊 →「手一晃、二晃、三晃、四晃，輕輕四下就摸走 2 枚銅板。成交。」；＋重擊 →「手一晃，輕輕一下就摸走 2 枚銅板。成交。」（逐字 `toBe`）；原本的「連砍 2 次」照舊變「連砍 3 次」；「12 次」不受影響（既有測試保留）；守門：`SKILLS` 裡任何說明用中文數字接「下／段／次」寫段數的，都必須在 `HIT_DESC` 裡。
  - `no rune, no rewrite`：沒有生效的符文時 `desc` 與 8f 逐字相同（全部招式）。
  - `notes say what the rune does here`：毒針（`rin-venom-needle`，本來會中毒）＋淬毒 → 一句含技能本身的機率數字；冰之星彈＋餘波 →「這招是冰屬性：暴擊時必定凍結」；物理招＋餘波 → 流血；火之星彈＋寒霜＋餘波（`others` 帶 `rime`）→ 冰；守之結界＋常駐 → 既有那句；其他 → `[]`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/runes.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-2`，against `gate-1`）。
- [ ] **Step 6：commit**：`fix(starlantern): a skill's words follow its runes — target, element and hit counts; notes for merged ailments and 餘波`。

### Task 3: 卡片模型 `ui2/skillCard.ts`

**Files:**
- Create：`ui2/skillCard.ts`、`ui2/skillCard.test.ts`
- Modify：`data/text.zh-TW.ts`（`T.ui2.workshop` 的列名、附加句、摘要、TP 上限行、警告、持有行）

**Interfaces:**
- Consumes：Task 1 的 `runeView`、`moveRune`、`SocketAt`、`lastingBarrierLoss`；`socketRune`、`unsocketRune`；Task 2 的 `runeNotes`；`fromMember`、`skillFor`、`skillCost`、`treeCost`、`battleReservePct`、`statsOf`、`socketable`、`socketCount`、`socketRune`、`bagCount`、`ownedCount`、`skillTags`、`runeWhy`。
- Produces（全部純函式，不改傳入的物件）：
  - `export type CardKey = 'target' | 'hits' | 'element' | 'power' | 'heal' | 'effect' | 'turns' | 'tp' | 'hp' | 'tpMax'`。
  - `export interface Card { name: string; tags: string[]; rows: { key: CardKey; text: string }[]; adds: string[]; tpPlain: string }`（`tpPlain`：`statsOf(m).tp` 的字，比較時給沒有 `tpMax` 列的那一邊用）。
  - `export function cardOf(m: Member, skill: string): Card | undefined`：她現在的插槽，`fromMember(m, 0)` 當施放者。**預覽一律先在狀態的副本上跑引擎的拆裝，再對結果裡的成員呼叫 `cardOf`**（`previewOf`），所以同一人兩招之間的移動不會把常駐保留、戰鬥 TP 上限或變化數算兩次。`def = skillFor`、TP ＝ `treeCost(m, skill, skillCost(caster, skill))`、`tags` ＝ `skillTags(runeView(...).def)` 的 `T.rune.tag` 字、列照裁定 6、`adds` 照裁定 7、`tpMax` 列只在 `battleReservePct(caster) > 0` 時出現，值是 `Math.floor(statsOf(m).tp × (100 − pct) / 100)`（和 `applyLasting` 同一條算式）。
  - `export interface CardLine { key: CardKey; label: string; before: string; after: string; changed: boolean }`；`export function compareCards(before: Card, after: Card): { lines: CardLine[]; added: string[]; removed: string[]; kept: string[]; changes: number }`：列取兩邊的聯集，依 `CardKey` 的順序；一邊沒有的那一列，`tpMax` 寫那一邊的 `tpPlain`，其他寫「—」；`changes` ＝ 變了的列數＋`added`＋`removed`。
  - `export type RuneAction = { kind: 'bag'; ref: RuneRef } | { kind: 'move'; from: SocketAt } | { kind: 'remove' }`；`export function previewOf(s: GameState, at: SocketAt, act: RuneAction): { ok: true; state: GameState } | { ok: false; reason: SocketFail | 'empty' }`：在 `s` 上（不改它）跑 `socketRune(at, ref)`／`moveRune(from, at)`／`unsocketRune(at)`，回傳引擎的結果。
  - `export type RuneSource = { kind: 'bag'; ref: RuneRef; count: number } | { kind: 'socket'; ref: RuneRef; at: SocketAt }`；`export interface RuneChoice { source: RuneSource; section: 'bag' | 'move'; why: string | null; changes: number; notes: string[]; owned: { all: number; bag: number; socketed: number }; giver?: string }`；`export function runeChoices(s: GameState, at: SocketAt): RuneChoice[]`：裁定 5 的區段與排序。每一列先 `previewOf`：拒絕 → `why` ＝ `T.rune.fail[reason]`（`reserve` 傳 `RESERVE_CAP`）；接受了但結果裡 `at` 那一格的 `slotStates` 是 `off` → `why` ＝ 它的原因（`runeWhy`）。`changes` ＝ `compareCards(cardOf(s 的成員), cardOf(結果的成員)).changes`。`notes` ＝ `runeNotes(裝之前的 def, id, 結果裡同招其他生效的符文)`，結果的 `lastingBarrierLoss` 比現在大時再加 `T.ui2.workshop.barrierClash`。`move` 區段的 `giver` ＝ `T.ui2.workshop.giver(給出者名, 那一招名, 變了的列「全體 → 單體」用「・」接起來)`，比的是給出者那一招在 `s` 與結果裡的卡片（同一人時也一樣，從同一個結果讀）。**快取**：`WeakMap<GameState, Map<string, RuneChoice[]>>`，鍵是 `${at.id}:${at.skill}:${at.slot}`；狀態一變就是新物件，舊的自然失效。
  - `export function slotStates(m: Member, skill: string): { state: 'on' | 'off' | 'empty'; ref?: RuneRef; why?: string }[]`：長度 ＝ `socketCount(m.level)`；`off` 帶 `runeWhy`。
  - `export function battleLine(def: SkillDef): string`：「全體・威力 84・火」：目標字、第一個傷害效果的威力（有傷害才有）、屬性（有傷害才有）；回復招寫「回復 n」；其他只有目標。
  - `export function reserveLine(m: Member): string | null`：`battleReservePct > 0` 時 `T.ui2.workshop.reserve(max, battleMax, pct)`，否則 null。
- [ ] **Step 1：先寫失敗的測試**（`ui2/skillCard.test.ts`）
  - `the spec's card: 火之星彈 with 擴散（魔法）`：Lv 5 的諾艾兒、預設配點、袋子有擴散（魔法）：`const r = previewOf(s, { id: 'noel', skill: 'fire-star', slot: 0 }, { kind: 'bag', ref: { id: 'spread', tier: 'magic' } })`，`compareCards(cardOf(m, 'fire-star'), cardOf(r.state.party.roster.noel, 'fire-star'))`：目標「單體」→「全體」、威力「140」→「84（每個目標）」、TP「4」→「4」；只有目標與威力 `changed`；`changes === 2`。（spec 的範例卡片 TP 寫 4→5、附加寫灼燒，是範例混了別的符文；本測試照 §6.7 的表。）
  - `the preview is the result`：Lv 35 的諾艾兒、希爾薇、千鶴、莎菲拉、凜，袋子裡每一種一般符文的魔法階各 1 個與六種傳說各 1 個，另外在別人與同一人別招的槽裡各放幾顆：每一招的每一個開著的槽、每一個 `why === null` 的 `RuneChoice`，照它做一次真的 `Game.socketRune`／`moveRune` 之後，`cardOf(成員, skill)` 與預覽用的卡片 `toEqual`，給出者那一招的卡片也和 `giver` 說的一致；`why !== null` 的，真的做要嘛被拒、要嘛那一格變 `off`。必須涵蓋：同一人兩招之間移動常駐（戰鬥 TP 上限只算一次）、凜的暗記與熟記的 TP 上限（`treeCost`）、莎菲拉戰舞＋常駐、鄰格已經有東西的槽（冰之星彈槽 1 有灼焰時槽 0 的點燃；同群組衝突；常駐保留到上限）。
  - `misfits say why, and an element rune can make an ailment fit`：火之星彈＋集中 →「需要：全體＋傷害，或全體＋治療」；冰之星彈＋點燃 → 含「（可由屬性符文提供）」；冰之星彈槽 1 已有灼焰時，槽 0 的點燃 `why === null`。
  - `the bag first, then what others hold`：所有 `section: 'bag'` 在所有 `'move'` 之前；兩個區段內各自是能裝的在前、變化多的在前；`move` 那一列的 `source.at` 指對位置、`giver` 寫出給出者那一招少掉什麼。
  - `choices are cached per state and slot`：同一個 `state` 物件、同一格呼叫兩次 → 同一個陣列物件；`socketRune` 之後的新狀態 → 重新算。
  - `the cards say what was added and taken away`：毒針＋淬毒：`kept` 有合併後的機率那一句（數字是兩者的最大值，由資料算出）；拆掉擴散的預覽（`previewOf(…, { kind: 'remove' })`）`removed` 為空、目標回到單體；觸發符文 → `added` 一句含觸發威力。
  - `held TP shows only when 常駐 works`：莎菲拉學會戰舞、裝常駐 → `tpMax` 列等於 `applyLasting` 之後的 `c.max.tp`（建一場戰鬥比）；同一顆常駐裝在她沒學會的招（直接寫進 `sockets`）→ 沒有 `tpMax` 列，`reserveLine` 為 null（`reservedTpPct` 仍是 30，證明沒用錯函式）。
  - `two lasting barriers warn`：千鶴守之結界已有常駐，另一個結界招的常駐選項 `notes` 含 `barrierClash`。
  - `slots tell what works`：裝著、但換掉傳說裝備後不再相容的符文 → `off` 與原因；Lv 4 → 長度 0；Lv 20 → 2。
  - `the battle line`：火之星彈＋擴散 →「全體・威力 84・火」；回復一名隊友 →「單體・回復 n」（n 讀資料）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/skillCard.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-3`，against `gate-2`）。
- [ ] **Step 6：commit**：`feat(starlantern): one card model for a skill before and after a rune — the numbers the engine will use`。

### Task 4a: 技能工坊畫面：版面、按鍵、從袋子裝上與拆下、公會入口

**Files:**
- Create：`ui2/scenes/workshop.ts`、`ui2/scenes/workshop.test.ts`
- Modify：`ui2/scene.ts`（`SceneName` 加 `'workshop'`）、`ui2/main.ts`（`case 'workshop'`）、`ui2/scenes/guild.ts`（指令 `workshop` 接在 `tree` 後面，`ctx.go('workshop')`；e2e 從這裡進來）、`ui2/scenes/facility.ts`（約 15 行的 `RETURNING` 加 `'workshop'`：從工坊回公會不再打招呼、不抽 `game.rng()`）、`data/text.zh-TW.ts`（`T.ui2.guild.workshop`「技能工坊」；`T.ui2.workshop` 的畫面字：標題、欄名、`slot(i)`、`slotEmpty`、`slotLocked(lv)`、`noSlots(lv)`、`remove`、`pick(i)`、`owned(all, bag, socketed)`、`off(why)`、`emptyBag`、`socketed(label, skill)`、`removed(label)`、`backToBag(label)`「，{label}回到袋子」、`hint`）、`src/styles/_starlantern-ui.scss`（`.slx-workshop` 一節）、`tests/e2e/starlantern.spec.ts`
- Modify（會紅的既有測試）：`ui2/scenes/guild.test.ts` 斷言公會指令清單的地方。
- Test：`ui2/scenes/workshop.test.ts`、`ui2/scenes/guild.test.ts`、`ui2/scenes/facility.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 3 的全部（`runeChoices` 的 `bag` 區段）；`Game.socketRune`／`unsocketRune`；`MenuView`、`backControl`、`win`、`cueFrame`、`updateCues`。
- Produces：
  - `export class WorkshopScene implements Scene`，`ctx.arg` ＝ `'<成員>'`、`'<成員>:<技能>'` 或省略（洛恩，沒有就第一位招募的；第一個可裝的技能）。Q/E 換人照裝備畫面：城鎮是 `state.party.recruited`，迷宮（`phase === 'map'`）只有場上的成員（`activeIds`），跳過板凳。
  - 版面（640×360 舞台）：標題列（名牌 ◀ 名稱 Lv ▶、`reserveLine`）；左 `.slx-ws-skills`（技能名＋`slotStates` 小點：`◆` 生效、`◇` 空或未生效——未生效的不做效果，所以和空的同一個形狀，插槽欄寫出它的名字與「未生效：…」）；中 `.slx-ws-card`：卡片本體（名稱、標籤、`compareCards` 的列、附加清單、游標所在符文的一句話 `RUNES[id].text(tier)`、`notes`、`owned`、給出者那一行）放在 `cueFrame` 裡（▲▼，R／F 也能捲，照裝備畫面的說明區），下面固定的 `.slx-ws-foot` 放 `why` 與最後一個動作的訊息（`role=status`），永遠看得到；右 `.slx-ws-slots`（槽列；選了槽之後是 `.slx-ws-runes` 符文清單）；底部提示。沒有在選符文時，卡片只有「現在」一欄（`before` 與 `after` 相同時不畫第二欄）。
  - 按鍵（寫在類別註解，唯一定義處）：↑↓ 在目前那一欄移動；Tab 或 →／← 在技能、插槽兩欄之間切換；技能上 Enter → 插槽欄，**這一招只有一個槽時直接進那個槽的符文清單**（Esc 回技能欄）；槽上 Enter → 符文清單（未開的槽不能選）；符文上 Enter → 照那一列做（`why` 有值：`sfx.error`、底欄寫原因、什麼都不變）、「拆下」→ 拆下；成功後回到插槽欄（一槽的回技能欄）、游標留在同一個槽，訊息是 `socketed`／`removed`，原本槽裡的符文回到袋子時後面接 `backToBag`；R／F 捲卡片；Esc：符文清單 → 插槽欄 → 技能欄 → 離開；Q/E 換成員（游標回到第一招、焦點回技能欄）。離開：從狀態頁來的回 `ctx.go('status', 'tab:skills:<成員>')`，其他回 `ctx.from ?? 'guild'`。
  - 點擊（滑鼠）：技能欄點一招＝選它並把焦點移到插槽欄（同 Enter，一槽的直接開符文清單）；插槽欄點一個已開的槽＝選它並開符文清單（同 Enter）；符文清單見 Task 4b。
- [ ] **Step 1：先寫失敗的測試**（`ui2/scenes/workshop.test.ts`，照 `status.test.ts` 的 `setup` 建 `Game`）
  - `ui2/scenes/guild.test.ts`：`the guild opens the workshop`：指令在「技能樹」之後有「技能工坊」，選它 → `go('workshop')`。`ui2/scenes/facility.test.ts`（或 `guild.test.ts`）：`coming back from the workshop does not greet again`：`from: 'workshop'` 進公會 → 沒有招呼的對話、`game.rng` 沒被呼叫（spy），游標停在「技能工坊」。
  - `opens on the member and skill it was given`：`arg 'noel:fire-star'` → 名牌是諾艾兒、左欄游標在火之星彈、小點數 ＝ `socketCount`。
  - `socket a rune with the keys, seeing before and after first`：Lv 20 的諾艾兒、袋子擴散（魔法）1：Enter、Enter 進符文清單 → 中欄有「之前／之後」兩欄、目標列標亮、「84（每個目標）」；Enter → `sockets['fire-star']` 有它、袋子沒了、訊息 `socketed`、回到插槽欄；小點變 `◆`。
  - `one slot goes straight to the runes`：Lv 5 的諾艾兒：技能上 Enter → 直接是符文清單；Esc → 技能欄。
  - `a swap sends the old rune to the bag and says so`：槽裡有連擊，裝上擴散 → 連擊回袋子、訊息含 `backToBag(連擊（…）)`；「拆下」→ 回袋子、訊息 `removed`。
  - `a misfit can be read but not socketed`：集中那一列有原因、游標可以停上去、Enter → `sfx.error` 被叫、狀態與存檔都沒變、底欄寫原因。
  - `a rune that stopped working stays, with its reason`：換掉讓擴散失效的傳說裝備 → 左欄那一格是 `◇`、插槽欄寫「擴散（魔法）」與 `off(原因)`，符文仍在 `sockets`。
  - `no slots yet, no runes yet`：Lv 4 的成員 → 插槽欄寫 `noSlots(RUNE_SLOT_LEVELS[0])`；沒有 `runesOpen` 的存檔 → 符文清單寫 `T.rune.fail.closed`；開放後袋子空 → `emptyBag`。
  - `Esc walks back out`：符文清單 → 插槽 → 技能 → `go` 被叫（從狀態頁來的是 `('status', 'tab:skills:noel')`）。
  - `Q/E in the labyrinth passes over the bench`：`map` 階段，Q/E 只在 `activeIds` 之間；城鎮在 `recruited` 之間。
  - `clicks pick a skill and a slot`：點技能 → 焦點到插槽欄；點已開的槽 → 符文清單；點未開的槽 → 什麼都不做。
  - e2e `the skill workshop sockets a rune, after showing what it changes (plan 8g)`：存檔：`runesOpen`、Lv 20 的諾艾兒、袋子擴散（魔法）1；公會 →「技能工坊」→ Q/E 到諾艾兒、↓ 到火之星彈；鍵盤裝上擴散；卡片「單體 → 全體」；1280×720、844×390、390×844 下 `.slx-workshop .slx-win` 都在 `.slx-screen` 裡、`.slx-workshop [role=option], .slx-ws-card p, .slx-ws-card td, .slx-ws-foot p` 每一個 `scrollWidth <= clientWidth + 0.5`；沒有 console 錯誤、沒有 404；Esc 回公會沒有新的招呼；回城存檔後存檔裡有這顆符文。
  - e2e `the workshop card stays inside the stage at its fullest (plan 8g)`：Lv 35 的千鶴，守之結界三個槽都有符文（含常駐，另一個結界招也常駐：會出警告）、袋子還有一顆會加附加的符文、游標停在它上面：1280×720 與 390×844 下每一個 `.slx-win` 都在舞台裡、`.slx-ws-foot` 整個看得到；卡片本體放不下時 ▼ 可見，點 ▼（與按 F）後 `scrollTop` 變大、▲ 出現。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/workshop.test.ts src/scripts/games/starlantern/ui2/scenes/guild.test.ts src/scripts/games/starlantern/ui2/scenes/facility.test.ts`。
- [ ] **Step 3：實作**（三欄的寬度與字級由實作者在 640×360 裡排，e2e 決定成敗；長名稱的列用省略號、全名在卡片裡）。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-4a`，against `gate-3`；三種尺寸的截圖，含最滿的那張卡）。
- [ ] **Step 6：commit**：`feat(starlantern): the skill workshop, from the guild — pick a slot, see before and after, socket or remove a rune`。

### Task 4b: 技能工坊：從別人身上移過來、滑鼠與觸控、清單變短

**Files:**
- Modify：`ui2/scenes/workshop.ts`、`data/text.zh-TW.ts`（`T.ui2.workshop.fromOthers`「從別人身上移過來」、`moved(label, who, skill)`「從{who}・{skill}移過來：{label}」、`giver(who, skill, changes)`「{who}・{skill}：{changes}」）、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`
- Test：`ui2/scenes/workshop.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 3 的 `runeChoices`（`move` 區段、`giver`）；Task 1 的 `Game.moveRune`／`canMoveRune`。
- Produces：
  - 符文清單：「拆下」（槽裡有符文時）→ 袋子區段 → 標題列 `fromOthers`（不接受游標）→ 移過來的區段（右欄寫給出者的名字）。游標停在移過來的一列時，卡片下面寫 `giver` 那一行（給出者那一招會少掉什麼，來自 `RuneChoice.giver`）；Enter → `Game.moveRune`，訊息 `moved` 寫出給出者，原本槽裡的符文回袋子時接 `backToBag`。
  - 滑鼠與觸控（符文清單）：滑過一列就移游標並預覽；滑鼠點一下＝移游標＋Enter；觸控（`pointerType === 'touch'`）第一下只移游標並預覽，同一列第二下才做（裁定 11，`equip.ts` 的 `armed`）；任何其他動作清掉 `armed`。
  - 清單在動作後重建：游標夾在新清單的範圍內（同一列還在就留在它上面）。
- [ ] **Step 1：先寫失敗的測試**（`ui2/scenes/workshop.test.ts`）
  - `move from another member, and the card says what she loses`：希爾薇瞄準射擊槽 0 有彈射：諾艾兒火之星彈的符文清單裡，彈射在 `fromOthers` 標題之下、袋子的符文之後；游標停上去 → 卡片有「希爾薇・瞄準射擊：…」；Enter → 兩邊各自正確、訊息寫「從希爾薇・瞄準射擊移過來」。
  - `a refused move says why`：要移過來的常駐會超過上限 → 底欄是 `T.rune.fail.reserve(RESERVE_CAP)`、兩邊都沒變。
  - `a move into a filled slot sends the old rune to the bag`：訊息含 `backToBag`、袋子多了原本那一顆。
  - `hover previews, a touch needs a second tap`：`pointermove` 到一列 → 卡片「之後」改了、狀態沒變；`pointerType: 'mouse'` 的 click 直接做；`'touch'` 的第一下不做、第二下做；第一下之後按 ↓ 再點原本那列 → 又只是第一下。
  - `the cursor stays in the list when it shrinks`：袋子只有一個、游標在最後一列，裝上後再回符文清單 → 游標在範圍內；移過來之後給出者那一列消失 → 游標在範圍內；Q/E 到技能較少的成員 → 不出錯。
  - e2e `the workshop moves a rune between members, by mouse (plan 8g)`：希爾薇身上有彈射：用滑鼠在諾艾兒的火之星彈把它移過來；兩人的 `sockets` 正確；390×844 不溢出。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/workshop.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-4b`，against `gate-4a`；截圖）。
- [ ] **Step 6：commit**：`feat(starlantern): the workshop moves a rune from a teammate, says what she loses, and works by mouse and touch`。

### Task 5: 其他入口與狀態頁：迷宮、技能分頁、TP 上限、兩個舊問題

**Files:**
- Modify：`ui2/scenes/dungeon.ts`（野外選單 `workshop`，接在 `equip` 後；用 `equip` 那一行的方式離開）、`ui2/scenes/statusTabs.ts`（技能分頁、能力分頁的 TP 行、樹的寬版標題）、`ui2/scenes/status.ts`（`arg` 的 `tab:<分頁>:<成員>`；從工坊回來後的返回）、`data/text.zh-TW.ts`（`T.ui2.dungeon.workshop`「技能工坊」；`T.ui2.status.hintSkills`「Enter／點一招：技能工坊」；`T.ui2.status.tpBattle(n)`「（戰鬥中上限 {n}）」）、`src/styles/_starlantern-ui.scss`
- Modify（會紅的既有測試）：`ui2/scenes/dungeon.test.ts` 約 888 行的野外選單 id 清單；`ui2/scenes/status.test.ts` 對 `.slx-skill-head` 整段文字的斷言（多了小點）；e2e 約 878 行的列選擇器（技能列多了符文行）。
- Test：`ui2/scenes/status.test.ts`、`ui2/scenes/dungeon.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 3 的 `slotStates`、`reserveLine`；Task 4a 的 `'workshop'` 場景與它的 `arg`。
- Produces：
  - 技能分頁：每一招的頭一行在名稱後面加 `.slx-skill-slots`（`slotStates` 的小點，被動技沒有）；每個裝著的符文一行 `.slx-skill-rune`：「擴散（魔法）：改為對全體，威力 60%。」，未生效的加 `slx-line-off` 與 `T.ui2.workshop.off(原因)`；分頁的 `hint` 是 `hintSkills`；`onAction('confirm')` → `ctx.go('workshop', '<成員>:<第一個可裝的技能>')`；點一列（非被動）→ 那一招；↑↓ 照舊捲動。
  - `StatusScene.enter`：`tab:<分頁>` 之外接受 `tab:<分頁>:<成員>`（成員要在 `recruited` 裡）；`ctx.from === 'workshop'` 時返回到 `phase === 'map' ? 'dungeon' : 'guild'`。
  - 能力分頁的事實區：`reserveLine` 不是 null 時，TP 那一行後面接 `tpBattle(c)`。
  - 能力表格：每一張分類表 `table-layout: fixed` 加同一組欄寬（`colgroup` 或 CSS 的 `nth-child` 寬度），讓各分類的同一欄對齊。
  - 樹的寬版（5 條分支）標題：`const full = t.branch(b.name, spent)` 切成兩個 span——`b.name` 與 `full.slice(b.name.length)`——點數那個換行；拿掉 `.slx-tree-wide .slx-tree-branch-name` 的省略號。三條分支的照舊一行。
- [ ] **Step 1：先寫失敗的測試**
  - `ui2/scenes/dungeon.test.ts`：`the field menu opens the workshop`：`equip` 之後是 `workshop`，選它 → `go('workshop')`。
  - `ui2/scenes/status.test.ts`：
    - `the skills page shows slots and runes, and opens the workshop`：Lv 20 的諾艾兒，火之星彈槽 0 擴散（魔法）→ 那一列小點「◆◇」、一行符文句子；換掉讓它失效的裝備後小點是「◇◇」、那一行是 `slx-line-off` 並寫原因；Enter → `go('workshop', 'noel:<第一個可裝的技能>')`；點火之星彈 → `go('workshop', 'noel:fire-star')`；點被動技不跳。
    - `back from the workshop lands on the same member's skills`：`arg 'tab:skills:sylvie'` → 希爾薇、技能分頁；`from: 'workshop'` 時 Esc 在 `town` → `go('guild')`、在 `map` → `go('dungeon')`。
    - `the TP held for battle shows on the stats page`：莎菲拉戰舞＋常駐 → TP 行含 `tpBattle(戰鬥中的上限)`；常駐在沒學會的招上 → 不出現。
  - e2e `the status page: columns line up across categories, the hero's branch names are whole, and the skills page leads to the workshop (plan 8g)`：1280 與 844×390：能力頁打開所有分類後，每一張 `.slx-stat-table` 的第 n 個 `thead th` 的左緣相同（±0.5px）；洛恩的樹每一個 `.slx-tree-branch-name` `scrollWidth <= clientWidth`、沒有省略號；技能分頁點火之星彈進工坊、Esc 回到同一個人的技能分頁、再 Esc 回公會。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/status.test.ts src/scripts/games/starlantern/ui2/scenes/dungeon.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-5`，against `gate-4b`；截圖含能力頁與洛恩的樹）。
- [ ] **Step 6：commit**：`feat(starlantern): the field menu and the skills page lead to the workshop; the sheet shows held TP, aligned columns and whole branch names`。

### Task 6: 第一次拿到符文的教學

**Files:**
- Modify：`ui2/scenes/battle.ts`（結算之後）、`ui2/scenes/workshop.ts`（第一次打開）、`data/text.zh-TW.ts`（`T.rune.tutorial(levels: readonly number[], town: string, field: string): string[]`）
- Test：`ui2/scenes/battle.test.ts`、`ui2/scenes/workshop.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 1 的 `runeTutorialSeen`／`seeRuneTutorial`；`BattleEnd.runes`；戰鬥畫面的 `talk`（`Dialogue`，記憶用的那一個）。
- Produces：
  - `T.rune.tutorial(RUNE_SLOT_LEVELS, T.ui2.guild.workshop, T.ui2.dungeon.workshop)`：三到四頁，每頁一兩句，講：符文改變一招「怎麼打」、插槽在 Lv 5／20／35 開（數字從參數）、到公會或迷宮選單的「技能工坊」裝、裝之前會看到之前 → 之後、隨時免費拆裝不會壞。說話的人用旁白（`who` 空字串，同 `T.notices`）。
  - 戰鬥：結算視窗按「繼續」、這場的記憶都播完之後，`end.runes?.length` 而且 `!state.runeTutorialSeen` → `talk` 播教學，播完 `game.seeRuneTutorial()`，再照原本離開。
  - 工坊：`enter` 時 `!runeTutorialSeen` 而且持有任何符文（袋子或任何人的插槽）→ 先播教學（同樣的 `Dialogue` 疊在工坊上，按鍵先給它），播完 `seeRuneTutorial()`。沒有任何符文時不播、不設旗標。
- [ ] **Step 1：先寫失敗的測試**
  - `ui2/scenes/battle.test.ts`：`the first rune found plays the rune tutorial once`：`end.runes` 有擴散（魔法）、旗標不在 → 繼續之後對話框出現教學第一頁，翻完 `state.runeTutorialSeen === true`；再一場有符文 → 不播；`ctx.fast` 時也播（只是不等動畫）。
  - `ui2/scenes/battle.test.ts`：`no rune, no tutorial`：沒有 `runes` 的勝利 → 不播、旗標不動。
  - `ui2/scenes/workshop.test.ts`：`a player who already has runes sees the tutorial on the first visit`：袋子有符文、旗標不在 → 打開工坊先播；看完設旗標；第二次打開不播；完全沒有符文 → 不播、旗標不動。
  - 教學字的守門：`T.rune.tutorial([5, 20, 35], …)` 的文字含這三個數字；傳 `[6, 21, 36]` 時含新的數字（證明沒有手打）。
  - e2e：既有的 `the first boss names its rune on the result, once, inside a phone screen (plan 8f)` 接著斷言：按繼續後出現教學的第一頁、翻完回到地圖；`__starlanternDebug.game.state.runeTutorialSeen === true`；390×844 時對話框在舞台裡。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/battle.test.ts src/scripts/games/starlantern/ui2/scenes/workshop.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-6`，against `gate-5`）。
- [ ] **Step 6：commit**：`feat(starlantern): the first rune found plays a short tutorial, once, with its own flag`。

### Task 7: 戰鬥選單寫出最後的數字與符文記號

**Files:**
- Modify：`ui2/menu.ts`（`MenuItem.badge?: string`）、`ui2/widgets.ts`（`MenuView` 在標籤後面畫 `<span class="slx-badge">`）、`ui2/scenes/battle.ts`（`skillItems`、`echoItem`）、`data/text.zh-TW.ts`（`T.cmd.runeMark`「◆」、`T.cmd.noteWith(line, desc)`「{line}　{desc}」；既有的 `T.cmd.echoNote` 改成 `(pct: number, line: string) => string`「以 {pct}% 的威力重現：{line}」，第二個參數從說明換成 `battleLine`）、`src/styles/_starlantern-ui.scss`（`.slx-badge`，符文色）
- Modify（會紅的既有測試）：`ui2/scenes/battle.test.ts` 斷言技能項目 `note` 整段等於 `desc` 的地方（改成「以摘要開頭、含 desc」）、殘響說明整段相等的斷言。
- Test：`ui2/scenes/battle.test.ts`、`ui2/menu.test.ts`（或 `widgets.test.ts`）、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 3 的 `battleLine`；`runeView`（只數生效中的符文）。
- Produces：
  - `skillItems`：`badge` ＝ 生效中的符文數個 `T.cmd.runeMark`（沒有就不設）；`note` ＝ `T.cmd.noteWith(battleLine(sk), sk.desc)`；`right` 照舊是 TP。
  - `echoItem`：`note` ＝ `T.cmd.echoNote(ECHO.powerPct, battleLine(echoDef(rec)))`，被拿掉機制時照舊接 `echoDropped`，不再整段照抄被重現那一招的 `desc`（裁定 12）。
- [ ] **Step 1：先寫失敗的測試**
  - `ui2/menu.test.ts`（或 `widgets.test.ts`）：`a badge follows the label`：有 `badge` 的項目在標籤後面多一個 `.slx-badge`，文字相同；沒有就不畫。
  - `ui2/scenes/battle.test.ts`：`the skill menu shows the final numbers and the runes that work`：諾艾兒火之星彈裝擴散（魔法）與一顆失效的符文 → 項目 `badge` 是一個「◆」、`note` 以「全體・威力 84・火」開頭並含原本的說明；沒有符文的招沒有 `badge`。`the echo says what it repeats, in numbers`：殘響的說明以被重現那招的 `battleLine` 開頭、含 `echoNote`，不含那招 `desc` 裡被拿掉的機制句。
  - e2e：既有的「a turret with both variants fits the battle menu (plan 8d Task 8)」那一則再加一顆符文在砲台上，844×390 與 390×844 下技能清單每一列 `scrollWidth <= clientWidth + 0.5`、`.slx-badge` 可見。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/battle.test.ts src/scripts/games/starlantern/ui2/menu.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-7`，against `gate-6`）。
- [ ] **Step 6：commit**：`feat(starlantern): the battle menu shows each skill's final target, power and element, and a mark for each working rune`。

### Task 8: 技能樹的變招用同一張卡預覽

**Files:**
- Modify：`ui2/scenes/statusTabs.ts`（`treeNotes`）、`data/text.zh-TW.ts`（`T.ui2.tree.preview(parts: string[])`、`T.ui2.workshop.change(label, before, after)`「{列名} {之前} → {之後}」）、`src/styles/_starlantern-ui.scss`（`.slx-tree-preview`）
- Test：`ui2/scenes/status.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 3 的 `cardOf`、`compareCards`；`swapPair`、`raiseNode`、`canRaiseNode`。
- Produces：`treeNotes` 在游標停在「一對變招中空的那一邊」（`canRaiseNode === 'pair'`）或「等級 0、`canRaiseNode` 為 null 的變招節點」時，多一行 `.slx-tree-preview`：`compareCards(cardOf(m, skill), cardOf(m', skill))` 裡 `changed` 的列，每列 `change(label, before, after)`，用「・」接起來，接著 `added` 的句子（前面「＋」）；`m'` 是 `swapPair(m, node)` 或 `raiseNode(m, node)` 的成員。沒有任何變化就不畫。其他節點不變（主動節點仍是 `nextRankText`）。
- [ ] **Step 1：先寫失敗的測試**（`ui2/scenes/status.test.ts`）
  - `a variant previews what it changes, with the workshop's card`：諾艾兒的火之星彈・連星可以點時，說明區有一行含「段數 1 → 2」與威力的變化（數字由 `cardOf` 算出，不寫死）；已點連星、游標在另一邊（重星）時，那一行是換邊之後的變化；游標在已學會的節點或機制節點上 → 沒有這一行。
  - e2e：既有的 `the tree shows pairs and swaps a side (plan 8d)` 加斷言：空的那一邊的說明區有 `.slx-tree-preview`，1280 與 844×390 下 `scrollWidth <= clientWidth + 0.5`（文字可以換行，不可以溢出）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/status.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-8`，against `gate-7`）。
- [ ] **Step 6：commit**：`feat(starlantern): a variant on the tree previews its change with the workshop's card`。

### Task 9: 守門與整體驗收

**Files:**
- Create：`engine/workshop.guard.test.ts`
- Test：`engine/workshop.guard.test.ts`

**Interfaces:**
- Consumes：Task 1–8 全部。
- [ ] **Step 1：先寫測試**（`engine/workshop.guard.test.ts`）
  - `the sim never meets the workshop`：`engine/sim.ts`、`engine/parity.ts`、`engine/balance*.test.ts`、`data/policies.ts` 的原始碼不含 `runeView`、`moveRune`、`lastingBarrierLoss`、`runeTutorialSeen`、`skillCard`（`readFileSync` 掃描）；`ui2/skillCard.ts` 與 `ui2/scenes/workshop.ts` 不含 `Math.random`、`rng(`。
  - `the workshop's words write no number by hand`：`data/text.zh-TW.ts` 裡 `workshop:` 區塊、`rune:` 區塊的 `tutorial`、`notes`、`fail` 的字串常值裡沒有阿拉伯數字（樣板的 `${…}` 除外；用正則掃字串常值）。
  - `every rune the bag can hold reads on every skill`：Lv 50 的每一位角色、每一招可裝的技能、每一種符文的每一階：`runeChoices` 不丟例外，每一個 `why` 是非空字串或 null，`cardOf` 的每一列文字非空。
- [ ] **Step 2：執行**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/workshop.guard.test.ts`。不成立 → 回到負責的任務修（不是改測試）；修不了就停下來回報。
- [ ] **Step 3：整體驗收**：全套全綠、tsc 0、閘門 `gate-9`（against `gate-8`，必須 `identical`）、`gate-9final` against `plan8d-tree-rework/gate-10`（必須 `identical`，`cmp gate-9final/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出）、`PARITY_CLOSEOUT=1 rtk proxy npx vitest run --testTimeout=3000000 src/scripts/games/starlantern/engine/parity.test.ts` 全綠、e2e 全綠。工坊、狀態頁技能分頁、戰鬥選單、樹的預覽在 1280×720 與 390×844 的截圖附在報告（給控制者看版面）。報告列出本計畫每一個偏離 spec 的地方與根據（裁定 1、4、5、11、12、13、14、16、17）。
- [ ] **Step 4：commit**：`test(starlantern): workshop guards — the sim never meets it, its words write no number, every rune reads on every skill`。

---

## 交給之後計畫的介面（摘要）
- **第 ⑧ 步（建議 build、一鍵套用、自動）**：一鍵套用鑲符文用 `Game.socketRune`／`moveRune`；「缺：擴散（道具店有賣／菁英、頭目掉落）」放在工坊的符文清單上方最順手；build 卡片的策略句子可以接在工坊標題列下面；`battleLine` 可以給「自動」的說明用。8e 留下的平衡項目（殘響複製同步、觸發出來的機制招白拿資源、回氣＋雙重詠唱自己付錢、常駐＋雷之結界、同步給予者的貢獻）照舊在 ⑧。
- **第 ⑨ 步（美術）**：`MenuItem.badge` 的「◆」、工坊的小點 `◆◇` 換成 14×14／16×16 的符文圖示時，只改畫的地方（`slotStates`、`badge` 的資料不變）。
