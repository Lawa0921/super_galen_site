# 星燈迷宮 計畫 8e：符文資料與引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 技能深化 spec §17 的第 ⑤ 步：符文（輔助寶石）的資料、標籤與相容規則、存檔欄位與拆裝、以及戰鬥引擎裡每一個符文的效果；模擬的隊伍沒有符文，所以普通難度的每一個量測值逐位元不動。

**Architecture:**
- **資料一處、規則一處**：`data/runes.ts` 放 32 個符文（26 一般＋6 傳說）的名稱、群組、需要的標籤、每階數字表與一句話範本；`engine/runes.ts` 放標籤推導、相容判斷與「把符文套到招式上」（`applyRunes`）。拆裝與存檔規則在 `engine/sockets.ts`。
- **符文分兩層**：靜態改寫（目標、段數、屬性、威力、TP、附加效果）在 `skillFor` 裡、傳說威力之後一次套完，所以戰鬥選單、野外施放、技能頁的數字自動是對的；戰鬥中才有的行為（命中異常、彈射、雙重詠唱、觸發、常駐、同步、回聲）由招式上的欄位帶進戰鬥，交給 `applyEffect` 的每一擊與新的機制模組 `engine/mechanics/runes.ts`。
- **沒有符文就是同一條路**：成員沒有 `sockets` 時 `Combatant.runes` 不存在、招式物件與 8d 完全相同、沒有任何新的亂數抽取，所以每個任務的閘門都必須 `identical`。

**Tech Stack:** TypeScript、Vitest（happy-dom）、PixiJS、Playwright e2e、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-20-starlantern-skill-builds-design.md`（使用者 2026-10-20 核准，細節授權）。本計畫實作 §6.1–§6.7、§6.6 全部規則、§9 的護盾沿用、§11 的引擎部分、§12.2、§13 第 3 點的模擬掛鉤（只做「裝上固定的一套符文」）、§14 的符文欄位與驗證。不做：§6.5 的掉落、道具店、合成、賣出（第 ⑥ 步）、§6.8 技能工坊與預覽 UI（第 ⑦ 步）、§12.4 的符文平衡帶與 §16 建議 build、行動策略、「自動」（第 ⑧ 步）、美術（第 ⑨ 步）。前置：計畫 8d 完成（含最終修正輪），`engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 已提交。必讀：SDD ledger `.superpowers/sdd/2026-10-20-starlantern-plan8-skills/progress.md`（所有控制者裁定有約束力）。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄：`.superpowers/sdd/2026-10-21-starlantern-plan8e-rune-engine/`（下稱 SDD）。行號只供定位，動手時一律用內容找。

## 計畫裁定（spec 留給實作者、spec 與程式碼不一致之處）

標「設計者裁定」的是 spec 沒寫死、由本計畫決定的細節（使用者授權：「技能設計由你決定細節」「可參考流亡暗道的作法」），每條附一行理由。

1. **符文欄位以可省略欄位加入，不升版本**（8d 裁定 9，已核准）：`GameState.runes?`、`Member.sockets?`；省略＝空。`SAVE_VERSION` 維持 9，`migrate8to9` 不碰符文。
2. **設計者裁定：沒有數字的符文，階級加「效果」**：屬性符文（灼焰、寒霜、雷鳴）、餘波、除厄、破甲本身沒有可以分階的數字，各階的好處統一是「這招的威力與效果」100／105／110／115%（100% 時一句話裡不寫這一段）。理由：spec §6.7「階級只改好處、代價不變，玩家只記一件事：越高越好用」。
3. **設計者裁定：每個一般符文都有代價**：spec §4 反目標要求「每個符文都有代價」，但 §6.4 的餘波、除厄、吸血沒寫代價：餘波 TP +1、除厄 TP +2、吸血 TP +1。傳說符文照 spec 原文（同步、化盾、回聲沒有代價；稀有本身就是代價），**例外是星燈輪轉 TP +1**：它和灼焰、寒霜、雷鳴同一個屬性群組，同群組同價（「換屬性要 1 TP」只有一條規則）；記在 SDD 的偏離清單。
4. **設計者裁定：TP 倍率全部相加**：雙重詠唱的「TP ×2」算 TP +100%，和節流、蓄力、破甲一起相加再乘（spec §6.6 第 3 點），所以三者任意順序結果相同。TP 計算 ＝ `max(1, round(tp × (100 + Σ%) / 100) + Σ固定值)`，原本 0 TP 的招永遠 0（「免費的招仍免費」，同 `tpDelta`）；之後才套 `tpCost`（`skillCost` 照舊）。
5. **設計者裁定：可交換的實作方式**：一招的所有威力倍率與效果倍率各自先排序再相乘（浮點乘法的順序因此固定），最後只呼叫一次 `patchSkill`（只四捨五入一次）。符文加上去的清單（`onHit`、`inflict`／`cure` 效果）一律依 `RUNES` 的鍵順序排列，不依插槽順序，所以亂數的抽取順序也和插槽無關。插槽順序換了，結果逐位元相同（排列測試，含同群組的組合）。
6. **設計者裁定：「增益」標籤包含結界**：spec §6.2 寫「對我方的 buff」，但 §16 的「不動結界」是守之結界＋常駐，而程式裡結界是 `barrier` 效果，不是 `buff`。所以「增益」＝我方的 `buff`（pct > 0）或 `barrier`；「減益」＝`buff`（pct < 0）或 `expose`。理由：不這樣做，spec 自己的建議 build 裝不上。
7. **設計者裁定：結構性的不相容理由**（標籤之外，各一句話）：擴散不能用在復活（`deadAlly` 沒有「全體倒下的人」這種目標）；擴散、集中、彈射不能用在隨機目標的招（`scatter`）；共享只能用在「只有增益」的自身招；常駐只能用在「只有增益或結界」的招；化盾需要真的有回復效果（只有復活不算）。
8. **設計者裁定：彈射的下一個目標不抽亂數**：彈到「隊列中下一個活著、這次還沒被打到的敵人」（依 `s.enemies` 順序、從原目標往後繞）。spec §11 把彈射目標列在「用戰鬥 rng 抽」的清單裡；改成固定規則更好預測（「彈到旁邊那隻」），而且少一個抽取點。每彈一次威力是原本的 `100 − d × n`%（魔法階 70%、40%），不是連乘。
9. **設計者裁定：同一種異常取最高機率**（spec §6.6 第 3 點的落實）：符文之間同一種異常只留最高的那個；招式本身（基礎、變招、傳說威力的 `extra`）已經會附帶同一種異常時，把那個附加拿掉，改成符文的每段命中、機率取兩者較高。異常符文在命中時不再看這一擊的屬性（相容性只在裝的時候看）。
10. **設計者裁定：星燈輪轉屬於屬性群組**，和灼焰、寒霜、雷鳴互斥，而且**不**滿足異常符文的屬性需求（§6.2 的例外只給三個屬性符文；輪轉每次屬性不同，「點燃需要火」就說不清楚了）。輪轉的順序每位角色每招各自計數，從火開始。
11. **設計者裁定：觸發**：觸發只由「她自己的行動」裡的一擊引起（技能、普通攻擊、絕技、「還有。」的追加行動）；裝置、結界雷擊、持續傷害、贖火反擊、回聲、殘響、觸發出來的施放都不會引起。受擊觸發只算敵人行動裡**命中**她的一擊（閃避不算）。觸發出來的施放排隊，在引起它的那個行動（含「還有。」）結束後、或那個敵人行動（含 `afterFoe`）結束後依序施放；施放者倒下、凍結或睡著就取消。同一位角色同一個條件每回合一次；她有兩招裝了同一種觸發時，只有學會順序較前的那招會動。「學會順序」＝ `learnedSkills` 的順序（天生的招在最前）。觸發出來的施放：不耗 TP、不跑機制的 `castDef`／`payMech`／`afterAction`／`extraAction`、不加絕技量表、不被殘響記錄、威力與效果 ×觸發%；深淵加成照 `perform` 一樣套；施放期間 `ctx.cast` 是這招的 id；輪轉用目前的屬性但不前進；每段的符文照常作用，每次施放的符文（雙重詠唱、彈射、回聲、同步）不作用，也不會再引起觸發。它的單體目標是「被暴擊／被擊倒／打她的那個敵人」，那個敵人已倒下就改打第一個活著的敵人（不抽亂數）。
12. **設計者裁定：雙重詠唱的第二次**：立刻接著施放，TP 只在第一次付（已經是兩倍）；目標重新決定、都不抽亂數：單體敵人打同一個、倒下就改打第一個活著的敵人；單體隊友給同一位、倒下就照 `resolveTargets` 的預設（HP 比例最低的活人）；復活招給另一位倒下的人、沒有就什麼都不做；全體、自身照常。第二次不彈射（彈射只跟第一次）；整招算一個行動（機制的 `afterAction` 一次）。凜的熟記（暗記 TP 上限）和雙重詠唱同時在時，**熟記的上限贏**：順序是符文 → `tpCost` → 機制的 `castCost`，熟記在最後取小；暗記兩次打同一個目標本來就沒有額外好處，所以不會變成白賺。
13. **設計者裁定：常駐**：常駐的增益不佔增益格，存在 `Combatant.auras`，和同一屬性同方向的一般增益**取較強的一個**計算（延續 spec §9「增益取最強」）；常駐增益整場不消失，倒下也不消失。目標是「一名隊友」的增益技常駐時給施放者自己。常駐的結界在戰鬥開始時架好、不會自己倒數；被解放、被新的結界取代就用掉（**包含再施放同一招**；解放把它算成這招原本的回合數），結界招的常駐說明多接一句「再施放一次會換掉它」，畫面的字寫「常駐」代替回合數。TP 保留在 `createBattle` 套到 `max.tp`（無條件捨去），超過的 TP 削到上限。
14. **設計者裁定：同步**沿用莎菲拉雙人舞的做法：下一位**不是她**的隊員這回合施放的技能威力 ×（100 + 30）%，用掉即刪，回合末沒用也刪。**回聲**：目標是這次施放真的打中的那個敵人（`ctx.lastHit.target`；一擊都沒中就沒有回聲）；下一回合結束時（`roundEnd`），施放者還站著、目標還活著，才對它再打一次這招的傷害效果（威力 50%）。
15. **設計者裁定：重置技能樹不吃掉符文**：重置（旅館、遷移後的免費重置）之後不再會的招，它的符文回到袋子；還會的招保留。袋子的上限 99 算「袋子＋鑲嵌中」同一種同一階的總數（掉落時檢查，第 ⑥ 步），所以拆下永遠不會超過。
16. **設計者裁定：插槽**：插槽裝在「已學會、不是被動」的技能上（含凜的天生暗記）；絕技、普通攻擊、道具沒有。Lv5 起 1 槽、Lv20 起 2 槽、Lv35 起 3 槽（spec §6.5）。裝進有符文的槽＝交換，舊的回袋子。
17. **控制者裁定：殘響**（洛恩重現隊友的招）照「她施放時的樣子」保留**每一擊與改寫類**的符文（形狀、段數、施放時的屬性、威力與效果、異常、吸血、回氣、破甲、除厄、化盾、延長、共享），拿掉**每次施放類**：雙重詠唱、彈射、回聲、同步、血之代價，以及觸發、常駐、輪轉（輪轉已經定成那一次的屬性）。殘響付的 TP 是這招「不算血之代價與雙重詠唱」的價錢：`applyRunes` 在這兩個符文生效時寫 `runeRules.plain = { tp, hpCost? }`（不含它們的 TP 與 HP 消耗），記錄的 `cost` ＝ `max(1, ceil(plain.tp × (100 − tpCost) / 100))`（設計者裁定：機制的折扣不再算一次），記錄的招 `tp`／`hpCost` 換回 `plain` 的值；沒有這兩個符文時照 8d 用 `ctx.paid`。殘響的施放不會引起任何觸發（spec §8.10），`perform` 的 `echo` 分支也不跑雙重詠唱與彈射。
18. **設計者裁定：延長看招式自己的效果**：延長的 needs 用不含 `extra` 的標籤判斷（`runeFits` 的 `core`），因為 `patchSkill` 的 `turnsDelta` 不會改到 `extra`（例：`lg-sylvie` 附加的降防）；否則它裝得上卻沒有作用。
19. **設計者裁定：壞掉的符文欄位修好，不判損毀**（8d「只有技能樹壞掉的版本 8 存檔照樣修好」的先例）：讀檔時 `repairRuneFields` 先修再驗證：不是物件的 `runes`／`sockets` 整個拿掉；袋子裡不存在的鍵、非整數或負數拿掉；插槽裡不是合法 `RuneRef` 的格子清掉；合法的符文放錯地方（不會的招、被動技、超過插槽數、同招同 id 或同互斥群組的後一個、讓保留超過 90% 的常駐）放回袋子；同一鍵總數超過 99 時從袋子削到 99。存檔照樣 `ok`。

## Global Constraints

**使用者的方向（最高依據）**
- 「所以不裝符文頂多過普通」：普通難度的驗收＝預設配點、沒有符文的模擬。`engine/balance*.test.ts` 的門檻與種子凍結；本計畫沒有任何任務可以移動任何量測值。
- 「不夠直覺的話我可能會懶的研究 build」：一個符文只做一件事、一句話講完（`。` 只出現在句尾一次，可以有一個「；」）、句子裡寫出這一階的數字（由範本從數字表產生）；插槽少（最多 3）。不相容就寫出一行原因（`runeWhy`）。預覽 UI 是第 ⑦ 步，本計畫只提供它要的函式。

**分支與基準**
- `feat/starlantern-story`，在 8d 最終修正輪的提交之後。開工前 `git status`：本計畫要改的檔案有別人未提交的修改，停下來回報 NEEDS_CONTEXT。
- 閘門 `against` 鏈：Task 1 對「8d 最終閘門」`.superpowers/sdd/2026-10-21-starlantern-plan8d-tree-rework/gate-10`（523a7045：gate-10 與錄 `contribution.8d-final.160.json` 的 gate-9 相同）；Task 1 Step 0 用 `cmp` 確認它的 `contribution.json` 與那張表相同。之後每個任務對前一個任務在 SDD 的 `gate-<N>`。**每個任務的閘門都必須 `gate: identical`**；不同就是 bug，停下來回報 BLOCKED，不准重錄夾具。
- 戰力對等：本計畫不改任何角色的招式，所以不錄新的 `contribution.*.160.json`，`PARITY_TASK` 整個計畫維持 8d 留下的 `between plans`（`prev: 'contribution.8d-final.160.json'`、`changed: []`）。閘門 `identical` 時 `contribution.json` 與這張表逐位元相同。
- 不覆寫 `engine/__fixtures__/` 底下任何既有檔案。

**亂數（決定性）**
- 不可以 `Math.random`。舊路徑一次都不多抽；機率 0 的事不抽（`combatant.roll`）。`game.rng`、`lootRng` 等串流一次都不多抽。
- 只有這些新東西抽戰鬥的 `rng`，而且只在裝了對應符文時：命中異常（每段一次 `inflictAilment`）、淬毒與凍結（每次施放每個目標一次）、餘波（暴擊時一次）、連擊多出來的那段與彈射每一彈的 `rollHit`、雙重詠唱第二次施放的全部抽取、觸發出來的施放的全部抽取、回聲那一擊的 `rollHit`。破甲的一擊不抽格擋骰（只在裝破甲時）。彈射、雙重詠唱、觸發的目標選擇、輪轉、同步、常駐、吸血、回氣都不抽。

**測試與檢查**
- TDD：先寫失敗的測試，確認它因正確的理由失敗，再實作。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`。
- 閘門：`rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-21-starlantern-plan8e-rune-engine/gate-<N> <against>`。
- tsc：`rtk proxy npx tsc --noEmit -p .`；starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個（repo 原本約 43 個與本專案無關）。
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`；headless、靜音；只用 4352，絕不用 4354，不結束任何程序。
- **重的工作（閘門、e2e）之前**：PowerShell `Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory` 確認可用記憶體 ≥ 6 GB（`FreePhysicalMemory` 單位是 KB，≥ 6291456）；不足就等，不要硬跑。一次只跑一套重的測試。
- 本專案沒有 prettier、eslint，不要跑。
- 一次性的探測程式不放在 `src/` 底下過夜：要用 vitest 跑的片段，跑完立刻刪掉，絕不 commit。
- **每個任務的收尾（下稱「收尾 G」）**：(1) 全套全綠、tsc 0；(2) 記憶體 ≥ 6 GB 後跑閘門，必須 `gate: identical`；(3) 本任務 Files 列了 e2e 時跑 e2e 全綠；(4) 報告：新增的測試名、閘門最後兩行、全套的兩行、偏離本計畫的地方（含理由）。

**換行（逐檔保留）**：改檔前 `git ls-files --eol <檔案>`；改完 `git diff --stat`，整檔被改寫就是換行壞了。CRLF 檔不可以用 `sed -i`。已知：CRLF：`engine/types.ts`、`engine/state.ts`、`engine/save.ts`、`engine/sim.ts`、`engine/party.ts`、`data/skills.ts`；LF：`data/gear.ts`、`engine/ailments.ts`、`engine/field.ts`、`engine/ledger.ts`、`engine/mech.ts`、`engine/progression.ts`、`engine/mechanics/*.ts`、`ui2/battleText.ts`；混用（新行照相鄰行）：`engine/battle.ts`、`engine/combatant.ts`、`engine/skills.ts`、`engine/game.ts`、`engine/town.ts`、`data/text.zh-TW.ts`。新檔一律 LF。

**git**：完整路徑 add，不可以 `git add -A`／`git add .`。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。絕對不可以 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。不 push。

**介面與文字**
- 本計畫不做任何畫面（第 ⑦ 步）；唯一的畫面變化是戰鬥訊息多兩種行（觸發、回聲，Task 5、6）與結界字樣「常駐」（Task 7）。不新增圖片、假圖示，不用 CSS 畫形狀。SCSS 禁 `!important`、禁行內樣式。
- 符文的名稱與一句話放在 `data/runes.ts`（和技能名稱一樣是資料）；理由、訊息行等介面文字放 `data/text.zh-TW.ts` 的 `T.rune`。全形標點、不用「……」；數字一律由範本從 `RUNE_NUMBERS` 產生（每階的好處與固定的代價都在這張表），`data/runes.ts` 的字串字面值不准手寫「數字＋%」或「數字＋回合」（守門測試）。

**測試修改規則**：各任務 Files 列出已知會紅的既有測試。全套跑出沒列到的紅燈，而它斷言的正是本任務改的型別形狀（例如 `skillFor` 的參數型別、`BattleEvent` 的聯集），可以照新形狀改並在報告列出；其他紅燈停下來回報 NEEDS_CONTEXT。`it.fails`、`it.skip`、`.only`、`.todo` 不可以出現在 commit。

**子代理**：實作者不派子代理。

## Review Focus
1. **現有的版本 9 存檔（沒有 `runes`、`sockets`）照舊讀進來、照舊玩，存回去也不多出空欄位；有符文欄位的存檔來回一次逐欄相同。** 測試：Task 2 `a version 9 save without rune fields loads and saves unchanged` 與 `rune fields survive a save and a load`。
2. **重置技能樹不會讓任何符文消失**：不再會的招的符文回袋子，存檔仍合法、總數不變。測試：Task 2 `a respec sends the runes of forgotten skills back to the bag`。
3. **換掉讓符文成立的傳說裝備或變招，符文留在原位、失效、完全不改招式；換回來就恢復。** 測試：Task 3 `a rune that stops fitting stays put and changes nothing`。
4. **雙重詠唱與觸發的目標在第一擊後倒下**：改打第一個活著的敵人、不多抽亂數；沒有敵人站著就什麼都不做、不出錯。測試：Task 5 `the second cast moves on when its foe falls`、Task 6 `a trigger with no foe standing does nothing`。
5. **血之代價在低 HP 時不會打死自己、也不會因為 `tpCost` 或 TP 不足而施放失敗。** 測試：Task 5 `blood price leaves her at 1 HP and pays no TP`。

---

## File Structure
- `data/runes.ts`（新）：`RuneId`、`RuneTier`、`RuneGroup`、`Tag`、`RuneRef`、`RuneMod`、`RuneDef`、`RUNES`、`RUNE_NUMBERS`、`runeKey`／`parseRuneKey`、`tiersOf`、常數。只有資料與範本。
- `engine/runes.ts`（新）：`skillTags`、`runeFits`、`runeWhy`、`runeStates`、`applyRunes`、`bounceNext`、`runeNote`。純函式，不碰戰鬥狀態。
- `engine/sockets.ts`（新）：`socketCount`、`socketable`、`bagCount`、`socketRune`、`unsocketRune`、`returnOrphanRunes`、`reservedTpPct`（拆裝上限）、`validRuneFields`、`repairRuneFields`。
- `engine/mechanics/runes.ts`（新）：戰鬥中的符文行為（輪轉、同步、回聲、觸發佇列、常駐）的 `MechModule`，以及 `noteHit`、`runTriggers`、`applyLasting`、`lastingTargets`、`battleReservePct`。
- 修改：`engine/types.ts`（`Member.sockets`、`SkillDef.runeRules`、`damage` 效果的符文欄位）、`engine/state.ts`（`GameState.runes`）、`engine/save.ts`（讀檔時修復）、`engine/town.ts`（重置退回符文）、`engine/game.ts`（拆裝）、`engine/battle.ts`（`fromMember`、`skillFor`、`perform`、`resolveRound`、`createBattle`）、`engine/skills.ts`（`EffectContext`、`applyEffect` 的每一擊）、`engine/combatant.ts`（`Combatant` 欄位、`stat`、`rollHit`／`hitAmount` 的破甲、`BattleEvent`）、`engine/ledger.ts`（常駐增益的防止量）、`engine/mechanics/index.ts`（模組清單）、`engine/mechanics/barrier.ts`（常駐結界）、`engine/mechanics/echo.ts`（殘響拿掉的符文規則）、`engine/sim.ts`（`Lineup.runes`）、`engine/field.ts`（雙重詠唱）、`engine/mech.ts`（`Barrier.lasting`）、`ui2/battleText.ts`、`data/text.zh-TW.ts`。
- 測試：`data/runes.test.ts`、`engine/runes.test.ts`、`engine/sockets.test.ts`、`engine/runes.battle.test.ts`、`engine/mechanics/runes.test.ts`、`engine/runes.guard.test.ts`（新），加上 `engine/save.test.ts`、`engine/town.test.ts`、`engine/game.test.ts`、`engine/field.test.ts`、`engine/ledger.test.ts`、`engine/mechanics/echo.test.ts`、`engine/mechanics/barrier.test.ts`、`ui2/battleText.test.ts`、`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 符文目錄、標籤、相容規則

**Files:**
- Create：`data/runes.ts`、`engine/runes.ts`（本任務只放 `skillTags`、`runeFits`、`runeWhy`、`runeStates`）
- Modify：`data/text.zh-TW.ts`（`T.rune.tag`、`T.rune.why`）
- Test：`data/runes.test.ts`、`engine/runes.test.ts`

**Interfaces:**
- Consumes：`SkillDef`、`Effect`、`Element`、`AilmentId`（`engine/types.ts`、`engine/ailments.ts`）；`SKILLS`、`POWERS`。
- Produces（`data/runes.ts`）：
  - `export type RuneTier = 'common' | 'magic' | 'rare' | 'epic' | 'legendary'`（沿用 `Rarity` 的字串）；`export const RUNE_TIERS: readonly RuneTier[] = ['common', 'magic', 'rare', 'epic']`。
  - `export type RuneGroup = 'shape' | 'hits' | 'element' | 'ailment' | 'trigger' | 'economy' | 'support' | 'legendary'`；`export const EXCLUSIVE_GROUPS: readonly RuneGroup[] = ['shape', 'hits', 'element', 'trigger']`。
  - `export type Tag = 'damage' | 'heal' | 'buff' | 'debuff' | 'ailment' | 'device' | 'single' | 'all' | 'self' | 'multi' | 'melee' | 'ranged' | 'attack' | 'spell' | 'phys' | 'fire' | 'ice' | 'thunder' | 'tp'`（`T.rune.tag`：傷害、治療、增益、減益、異常、裝置、單體、全體、自身、多段、近戰、遠程、武技、法術、物理、火、冰、雷、消耗 TP）。
  - `export type RuneId`：見下表的 id；`export interface RuneRef { id: RuneId; tier: RuneTier }`。
  - `export interface RuneMod { shape?: 'spread' | 'focus' | 'share'; power?: number; effect?: number; hits?: 'plus1' | 'one'; element?: Element | 'wheel'; onHit?: { status: AilmentId; chance: number }; inflict?: { status: AilmentId; chance: number }; aftermath?: true; trigger?: { on: 'crit' | 'kill' | 'struck'; pct: number }; tpPerHit?: number; drainPct?: number; armorBreak?: true; cure?: true; turns?: number; lasting?: { pct: number; reservePct: number }; bounce?: { bounces: number; dropPct: number }; twice?: true; bloodPct?: number; sync?: number; overflowPct?: number; reprise?: number; tpPct?: number; tpFlat?: number }`（`power`：只乘威力；`effect`：乘威力與增益／減益百分比；兩者都是百分比因子，100 ＝ 不變；常駐的 mod **只有** `lasting`，不帶 `effect`，所以能施放的那一招完全不變，60% 只在戰鬥開始時套一次，Task 7）。
  - `export interface RuneDef { id: RuneId; name: string; group: RuneGroup; needs: Tag[][]; text: (tier: RuneTier) => string; mod: (tier: RuneTier) => RuneMod }`；`export const RUNES: Record<RuneId, RuneDef>`；`export function tiersOf(id: RuneId): readonly RuneTier[]`（傳說群組只有 `['legendary']`）。
  - `export const RUNE_STACK = 99`、`export const RUNE_SLOT_LEVELS = [5, 20, 35] as const`、`export const RESERVE_CAP = 90`。
  - `export const runeKey = (r: RuneRef): string => \`${r.id}@${r.tier}\``；`export function parseRuneKey(k: string): RuneRef | null`（不存在的 id、不合法的階 → null）。
- Produces（`engine/runes.ts`）：
  - `export function skillTags(def: SkillDef): Tag[]`（spec §6.2，加上裁定 6；`tp` ＝ `def.tp > 0`；多段 ＝ 任一傷害 `hits ≥ 2`；`deadAlly` 算單體；固定順序：上面 `Tag` 的順序、不重複）。
  - `export type RuneMiss = { kind: 'needs'; needs: Tag[][]; hint?: true } | { kind: 'group'; other: RuneId } | { kind: 'same' } | { kind: 'revive' } | { kind: 'scatter' } | { kind: 'pure' } | { kind: 'no-heal' }`。
  - `export function runeFits(def: SkillDef, rune: RuneId, others: readonly RuneId[], core: SkillDef = def): RuneMiss | null`：`def` 是「裝符文之前」的招（tree、精通、傳說威力、`extra` 都在）；`core` 是同一招不含 `extra` 的部分；`others` 是同一招其他槽的符文。檢查順序：same → group → 結構（裁定 7）→ needs。needs 一律看 `skillTags(def)`，**延長例外看 `skillTags(core)`**（裁定 18）。異常群組的 needs 可以由 `others` 裡的灼焰／寒霜／雷鳴提供火／冰／雷（裁定 10：輪轉不提供），它們的 needs 不成立時回 `hint: true`。
  - `export function runeWhy(m: RuneMiss): string`：`T.rune.why`：needs →「需要：單體＋傷害」（多組用「或」接：「需要：單體＋傷害，或單體＋治療」；`hint` 時屬性標籤後面接「（可由屬性符文提供）」：點燃 →「需要：火（可由屬性符文提供）＋傷害」，spec §6.2）；group →「已有同類符文：{名稱}」；same →「同一招不能裝兩個{名稱}」；revive →「不能用在復活」；scatter →「隨機目標的招不能改形狀」；pure →「只能用在只有增益的招」；no-heal →「需要：回復效果」。
  - `export function runeStates(def: SkillDef, refs: readonly RuneRef[], core: SkillDef = def): { ref: RuneRef; miss: RuneMiss | null }[]`：每個符文對「其他所有已裝符文」判斷（失效的屬性符文不提供屬性：先判屬性群組，再判其他）。

**符文表**（`needs` 外層「或」、內層「且」；「—」＝任何招；`RUNE_NUMBERS` 是每階的好處數字，代價寫在「固定」欄）：

| id | 名稱 | 群組 | needs | 每階（普通／魔法／稀有／史詩） | 固定 | 一句話範本 |
|---|---|---|---|---|---|---|
| `spread` | 擴散 | shape | 單體＋傷害；單體＋治療 | power 55/60/65/70 | — | 「改為對全體，威力 {p}%。」 |
| `focus` | 集中 | shape | 全體＋傷害；全體＋治療 | power 160/170/180/190 | — | 「改為對單體，威力 {p}%。」 |
| `bounce` | 彈射 | shape | 單體＋傷害 | dropPct 35/30/25/20 | bounces 2 | 「命中後彈到另一個敵人，最多彈 {n} 次，每彈一次威力 −{d}%。」 |
| `multistrike` | 連擊 | hits | 傷害 | 每段 power 70/75/80/85 | 段數 +1 | 「段數 +1，每段威力 {p}%。」 |
| `heavy` | 重擊 | hits | 多段 | 合計 110/115/120/125 | 改 1 段（每個傷害效果：`power × 原段數` 之後乘合計%，見 Task 3） | 「改成一段，威力是原本全部段數合計的 {p}%。」 |
| `flame`／`rime`／`thunderclap` | 灼焰／寒霜／雷鳴 | element | 傷害 | effect 100/105/110/115 | TP +1 | 「屬性改為火（冰、雷）{，威力 p%}；TP +1。」 |
| `ignite`／`jolt`／`tear` | 點燃／感電／撕裂 | ailment | 火＋傷害／雷＋傷害／物理＋傷害 | 每段 30/35/40/45% | — | 「每段命中 {c}% 機率灼燒（感電、流血）。」 |
| `frostbite` | 凍結 | ailment | 冰＋傷害 | 每次 20/25/30/35% | — | 「每次施放 {c}% 機率凍結目標（頭目改冰緩）。」 |
| `venom` | 淬毒 | ailment | 傷害 | 每次 25/30/35/40% | — | 「每次施放 {c}% 機率中毒。」 |
| `aftermath` | 餘波 | ailment | 傷害 | effect 100/105/110/115 | TP +1 | 「暴擊時附帶該屬性的異常（物理是流血，頭目減半、抗性照算）{，威力 p%}；TP +1。」 |
| `on-crit`／`on-kill` | 暴擊觸發／擊倒觸發 | trigger | 傷害；增益 | 觸發威力 50/60/70/80 | — | 「她的任何一擊暴擊時（擊倒敵人時），自動施放這招（威力 {p}%，不耗 TP）。」 |
| `on-struck` | 受擊觸發 | trigger | — | 同上 | — | 「她受到攻擊後，自動施放這招（威力 {p}%，不耗 TP）。」 |
| `regain` | 回氣 | economy | 傷害 | tpPerHit 1/1/1/2；power 80/85/90/90 | — | 「每段命中回復 {n} TP；威力 {p}%。」 |
| `thrift` | 節流 | economy | 消耗 TP | effect 75/80/85/90 | TP −35% | 「TP −35%；威力與效果 {p}%。」 |
| `charge` | 蓄力 | economy | 消耗 TP | effect 130/140/150/160 | TP +60% | 「TP +60%；威力與效果 {p}%。」 |
| `drain` | 吸血 | economy | 傷害 | drainPct 6/8/10/12 | TP +1 | 「造成傷害的 {p}% 回復自己的 HP；TP +1。」 |
| `extend` | 延長 | support | 增益；減益；裝置 | turns 1/2/3/4 | TP +2 | 「持續 +{n} 回合；TP +2。」 |
| `share` | 共享 | support | 自身＋增益（結構：只有增益） | effect 40/50/60/70 | — | 「改為對我方全體，效果 {p}%。」 |
| `lasting` | 常駐 | support | 增益（結構：只有增益或結界） | lasting.pct 50/60/70/80（不是 effect） | 保留 30% | 「戰鬥開始時自動生效且整場不消失，效果 {p}%；保留這名角色 30% 的 TP 上限。」（結界招另接「再施放一次會換掉它」，見 Task 7） |
| `dispel` | 除厄 | support | 治療；增益 | effect 100/105/110/115 | TP +2 | 「額外解除目標的所有異常{，效果 p%}；TP +2。」 |
| `armor-break` | 破甲 | support | 物理＋傷害 | effect 100/105/110/115 | TP +20% | 「無視目標的護甲與格擋{，威力 p%}；TP +20%。」 |
| `twin-cast` | 雙重詠唱 | legendary | 消耗 TP | — | TP +100% | 「這招連續施放兩次；TP 兩倍。」 |
| `starwheel` | 星燈輪轉 | legendary（屬性群組，裁定 10） | 傷害 | — | TP +1 | 「每次施放，屬性依火、冰、雷輪替；TP +1。」 |
| `blood-price` | 血之代價 | legendary | 消耗 TP | bloodPct 3 | — | 「不消耗 TP，改為消耗「TP×{p}%」的最大 HP。」 |
| `sync` | 同步 | legendary | — | sync 30 | — | 「施放後，下一位施放技能的隊友本回合技能威力 +{p}%。」 |
| `spill-shield` | 化盾 | legendary | 治療（結構：要有回復效果） | overflowPct 30 | — | 「超出最大 HP 的回復量變成護盾（最多最大 HP 的 {p}%）。」 |
| `reprise` | 回聲 | legendary | 單體＋傷害 | reprise 50 | — | 「下一回合結束時，對同一目標再打一次（威力 {p}%）。」 |

`{，威力 p%}` 這類大括號段只在 p ≠ 100 時出現。「固定」欄的數字（TP +1、−35%、+60%、+20%、+100%、保留 30%、彈 2 次）也放在 `RUNE_NUMBERS[id].fixed`，範本從那裡取，不寫死在字串裡。星燈輪轉的 `group` 是 `'legendary'`，但互斥判斷把它當屬性群組（`runeFits` 用 `exclusiveGroupOf(id)`：`starwheel` → `'element'`）。

- [ ] **Step 0：基準**：`cmp .superpowers/sdd/2026-10-21-starlantern-plan8d-tree-rework/gate-10/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 必須沒有輸出；`engine/parity.test.ts` 的 `PARITY_TASK` 必須是 `{ name: 'between plans', changed: [], prev: 'contribution.8d-final.160.json' }`（8d 最終修正輪 523a7045 留下的；本計畫沒有改角色招式的任務，所以**整個計畫都不動它**）。任一不符就停下來回報 NEEDS_CONTEXT。寫進 SDD `progress.md` 第一行。
- [ ] **Step 1：先寫失敗的測試**
  - `data/runes.test.ts`：
    - `every rune says one sentence with its own numbers`：每個符文每一個 `tiersOf` 的階：`text(tier)` 以「。」結尾、只有一個「。」、沒有「……」；`RUNE_NUMBERS` 這一階的每個好處數字都出現在句子裡（100% 的 effect 例外：句子裡沒有「100%」）；相鄰兩階不同的數字，前一階的值不出現在後一階。
    - `the magic tier says what the spec says`：擴散「改為對全體，威力 60%。」、集中「改為對單體，威力 170%。」、連擊「段數 +1，每段威力 75%。」、點燃「每段命中 35% 機率灼燒。」、蓄力「TP +60%；威力與效果 140%。」、常駐「戰鬥開始時自動生效且整場不消失，效果 60%；保留這名角色 30% 的 TP 上限。」。
    - `data/runes.ts writes no number by hand`：原始碼（`readFileSync`）裡所有字串字面值都不符合 `/\d+\s*(%|回合)/`。
    - `rune keys round-trip and refuse junk`：每個符文每個合法階 `parseRuneKey(runeKey(r))` 等於 `r`；`'spread@legendary'`、`'twin-cast@magic'`、`'nope@magic'`、`'spread'`、`'spread@'` → null。
    - `32 runes, 6 legendary, groups as the table`：`Object.keys(RUNES).length === 32`；`tiersOf` 傳說群組只有 legendary、其他四階。
    - `rune names and ids collide with nothing`：每個符文的 `name` 不等於任何 `SKILLS[*].name`、任何變招的 `label` 或 `nodeName`、任何機制節點的 `nodeName`（掃 `NODES`）；每個符文 id 不是 `SKILLS` 的鍵。改名的四個（彈射、除厄、化盾、`armor-break`）各斷言一次。
  - `engine/runes.test.ts`：
    - `tags come from the skill as it is`：`skillTags(SKILLS['fire-star'])` ＝ `['damage','single','ranged','spell','fire','tp']`；`twin-slash` 含 `multi`、`melee`、`attack`、`phys`；`ward` ＝ `['buff','self','tp']`；`hex` 含 `debuff`；`turret` 含 `device`、`self`；`moonlight` 含 `heal`、`single`；`rebirth` 含 `heal`、`single`；裝了 `lg-noel` 的火之星彈（用 `skillFor({ powers: ['lg-noel'] }, 'fire-star')`）含 `all`、不含 `single`；`lg-sylvie` 的瞄準射擊含 `debuff`。
    - `fit: needs, groups, the element exception`：火之星彈：擴散 null；集中 `{ kind: 'needs' }`；`others = ['spread']` 再裝集中 → `{ kind: 'group', other: 'spread' }`；再裝擴散 → `same`；瞄準射擊（物理）單獨裝點燃 → needs；`others = ['flame']` 時點燃 null；`others = ['starwheel']` 時點燃仍是 needs；寒霜＋星燈輪轉 → group。
    - `fit: the structural reasons`：月之再生＋擴散 → `revive`；`scatter-shot`（散射）＋集中 → `scatter`；鐵壁＋共享 null、挑釁（裝 `lg-scarlet`，有增益附加）＋共享 → `pure`；守之結界＋常駐 null、守之結界＋共享 → `pure`；月之再生＋化盾 → `no-heal`。
    - `runeStates: a lost element takes its ailment with it`：瞄準射擊裝 `[flame, ignite]` → 兩個都 null；瞄準射擊裝 `[rime, ignite]` → `ignite` 是 needs。
    - `the reason reads in one line`：`runeWhy({ kind: 'needs', needs: [['single','damage'],['single','heal']] })` ＝「需要：單體＋傷害，或單體＋治療」；group ＝「已有同類符文：擴散」；`runeWhy(runeFits(SKILLS['aimed-shot'], 'ignite', [])!)` ＝「需要：火（可由屬性符文提供）＋傷害」。
    - `extend looks at the skill's own effects`：瞄準射擊穿 `lg-sylvie`（附加 −20% 防禦）＋延長 → needs（`core` 沒有增益、減益或裝置）；獵人標記（本身就降防）＋延長 → null。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/runes.test.ts src/scripts/games/starlantern/engine/runes.test.ts`。預期：模組不存在。
- [ ] **Step 3：實作**（照 Interfaces 與符文表；每個範本由 `RUNE_NUMBERS` 取數字）。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-1`，against 8d 最終閘門）。
- [ ] **Step 6：commit**：`feat(starlantern): the rune catalogue — 32 runes, tags derived from the skill, one-line reasons when a rune does not fit`。

### Task 2: 存檔欄位、插槽、拆裝、重置退回

**Files:**
- Create：`engine/sockets.ts`
- Modify：`engine/types.ts`（`Member.sockets?: Record<string, (RuneRef | null)[]>`）、`engine/state.ts`（`GameState.runes?: Record<string, number>`）、`engine/save.ts`（`loadGame` 在 `isValid` 之前呼叫 `repairRuneFields`）、`engine/town.ts`（`respec` 之後 `returnOrphanRunes`）、`engine/game.ts`（`socketRune`、`unsocketRune`、`canSocketRune`）、`data/text.zh-TW.ts`（`T.rune.fail`）
- Test：`engine/sockets.test.ts`、`engine/save.test.ts`、`engine/town.test.ts`、`engine/game.test.ts`、`tests/e2e/starlantern.spec.ts`（只跑，不加）

**Interfaces:**
- Consumes：Task 1 的 `RUNES`、`RuneRef`、`runeKey`、`parseRuneKey`、`tiersOf`、`runeFits`、`RESERVE_CAP`、`RUNE_STACK`、`RUNE_SLOT_LEVELS`、`EXCLUSIVE_GROUPS`；`learnedSkills`、`SKILLS`。
- Produces（`engine/sockets.ts`）：
  - `export function socketCount(level: number): number`（Lv<5 → 0；5–19 → 1；20–34 → 2；≥35 → 3）。
  - `export function socketable(m: Member): string[]`：`learnedSkills(m)` 裡 `!SKILLS[id].passive` 的。
  - `export function bagCount(s: Pick<GameState, 'runes'>, r: RuneRef): number`（沒有欄位或沒有鍵 → 0）。
  - `export type SocketFail = 'invalid' | 'none' | 'slot' | 'same' | 'group' | 'reserve'`；`export function socketRune(s: GameState, id: CharacterId, skill: string, slot: number, r: RuneRef): { ok: true; state: GameState } | { ok: false; reason: SocketFail }`：成員已招募、`skill` 在 `socketable`（否則 `invalid`）；`0 ≤ slot < socketCount(level)`（否則 `slot`）；袋子裡有（否則 `none`）；同一招其他槽有同 id（`same`）、同互斥群組（`group`）；常駐使這名成員的保留超過 `RESERVE_CAP`（`reserve`）。標籤不相容**可以**裝（失效而不拆除，spec §6.6 第 4 點；第 ⑦ 步的清單會把它變灰）。成功：袋子 −1（到 0 刪鍵）、槽裡原有的符文回袋子、陣列補 `null` 到 `slot`。純函式，不改 `s`。
  - `export function unsocketRune(s: GameState, id: CharacterId, skill: string, slot: number): { ok: true; state: GameState } | { ok: false; reason: 'invalid' | 'empty' }`：回袋子；陣列尾端的 `null` 修掉、空陣列刪鍵、空物件刪 `sockets`。
  - `export function returnOrphanRunes(s: GameState, id: CharacterId): GameState`：`sockets` 裡不在 `socketable(m)` 的技能，符文全部回袋子並刪鍵（裁定 15）；什麼都沒有時回傳同一個物件。
  - `export function reservedTpPct(m: Member): number`：這名成員**已鑲嵌**的 `lasting` 保留相加，不管相不相容——只用在拆裝的上限（`reserve`）與存檔修復；戰鬥裡實際保留多少是 Task 7 的 `battleReservePct`（只算生效的）。
  - `export function validRuneFields(d: Record<string, unknown>): boolean`：`runes` 省略或物件、每個鍵 `parseRuneKey` 成功、值是 ≥ 0 的整數；每位成員 `sockets` 省略或物件：鍵在 `socketable`、值是長度 ≤ `socketCount(level)` 的陣列、每格 `null` 或合法 `RuneRef`、沒有同 id、互斥群組各最多一個、保留 ≤ `RESERVE_CAP`；同一個 `runeKey` 的袋子數＋鑲嵌數 ≤ `RUNE_STACK`。
  - `export function repairRuneFields(d: Record<string, unknown>): void`：照裁定 19 就地修好，修完 `validRuneFields(d)` 一定是 true；欄位都合法時一個位元都不改。成員的 `level`、`tree` 不合法時不碰那位成員（交給 `isValid`）。
- Produces（`engine/game.ts`）：`socketRune(id, skill, slot, ref)`、`unsocketRune(id, skill, slot)`：`phase` 限 `town`／`map`（否則 `{ ok: false, reason: 'invalid' }`），成功時城鎮立即存檔、失敗只留 `save-failed` 通知（同 `swapVariant`）；`canSocketRune(...)` 回同樣的理由或 null，不改任何東西。
- `T.rune.fail`：none「袋子裡沒有這個符文」、slot「這一招還沒有這個插槽」、same、group（同 `runeWhy`）、reserve「常駐保留的 TP 上限已經到 {cap}%」（函式，`cap` 由 `RESERVE_CAP` 傳入，不寫死 90）。

- [ ] **Step 1：先寫失敗的測試**
  - `engine/sockets.test.ts`：
    - `slots open at Lv5, 20 and 35`：`socketCount` 對 1、4、5、19、20、34、35、50 → 0、0、1、1、2、2、3、3。
    - `passives and unlearned skills take no rune`：莉茲的 `stealth` 不在 `socketable`；凜的 `rin-mark`（天生）在。
    - `socketing takes from the bag and swaps out what was there`：Lv20 諾艾兒、袋子 `spread@magic: 1`、`ignite@magic: 1`：裝擴散到火之星彈第 0 槽 → 袋子沒有擴散；再把點燃裝到同一槽 → 擴散回袋子、槽裡是點燃；原 state 物件沒有被改。
    - `socketing refuses with a reason`：袋子空 → `none`；Lv10 裝第 1 槽 → `slot`；同一招第二個擴散 → `same`；已有擴散再裝集中 → `group`；四招各裝常駐（`lasting` 30% × 4）時第四個 → `reserve`；被動技 → `invalid`。
    - `unsocketing tidies up`：拆掉唯一的符文後成員沒有 `sockets` 欄位、袋子 +1。
    - `a rune that does not fit can still be socketed`：瞄準射擊（物理）裝點燃 → ok（失效由 `runeStates` 表示）。
  - `engine/save.test.ts`：
    - `a version 9 save without rune fields loads and saves unchanged`：`newGame()` 存檔 → 讀回 `ok`，`state.runes` 與每位成員的 `sockets` 都是 `undefined`；`JSON.stringify` 讀前讀後相同。
    - `rune fields survive a save and a load`：袋子三種、諾艾兒 Lv35 火之星彈兩槽 → 存檔讀回逐欄相同。
    - `rune fields that break the rules are repaired, not refused`（各自一份存檔，讀回都是 `ok`）：袋子的 `'nope@magic': 1`、`'spread@legendary': 1`、`'spread@magic': 1.5`、`'spread@magic': -1` → 那個鍵消失；`runes: 5` → 欄位消失；諾艾兒 `sockets` 指向不會的招／被動技 `stealth` → 那個鍵消失、符文進袋子；Lv10 裝在第 1 槽 → 第 1 槽清掉、符文進袋子；同招兩個擴散 → 後一個進袋子；擴散＋集中 → 集中進袋子；四個常駐 → 第四個（學會順序最後的那招）進袋子；`spread@magic` 袋子 99＋鑲嵌 1 → 袋子 98；`sockets` 一格是 `'x'` → 清成 `null` 並修掉尾端；每一份修完 `validRuneFields` 為 true。
    - `a clean rune field is left byte for byte`：合法的欄位讀回 `JSON.stringify` 相同。
  - `engine/town.test.ts`：`a respec sends the runes of forgotten skills back to the bag`：諾艾兒 Lv35，`ice-star`（非免費節點）與 `fire-star`（第 0 支第 0 層，免費節點）各裝一個符文 → 旅館重置後 `fire-star` 的符文還在、`ice-star` 的回袋子；袋子＋鑲嵌總數不變；存檔讀回 `ok`。
  - `engine/game.test.ts`：`runes move in town and the field, never in battle`（`town` 成功並存檔、`battle` → `invalid`、`map` 成功不存檔）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/sockets.test.ts src/scripts/games/starlantern/engine/save.test.ts src/scripts/games/starlantern/engine/town.test.ts src/scripts/games/starlantern/engine/game.test.ts`。
- [ ] **Step 3：實作**（照 Interfaces；`loadGame` 在 `dropUnknownBanters` 之後、`isValid` 之前呼叫 `repairRuneFields`，`isValid` 不另外檢查符文欄位）。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-2`，against `gate-1`；跑 e2e）。
- [ ] **Step 6：commit**：`feat(starlantern): rune bag and sockets in the save — optional fields, slots by level, a respec hands runes back`。

### Task 3: 符文改寫招式：`applyRunes` 與 `skillFor`

**Files:**
- Modify：`engine/runes.ts`（`applyRunes`）、`engine/types.ts`（`damage` 效果加 `onHit?`、`aftermath?`、`armorBreak?`、`drainPct?`、`tpPerHit?`；`SkillDef.runeRules?: RuneRules`）、`engine/combatant.ts`（`Combatant.runes?`）、`engine/battle.ts`（`fromMember` 抄 `sockets`、`skillFor` 套符文）、`engine/skills.ts`（`patchSkill` 的說明註解：第 5 步之後是符文）、`engine/mechanics/echo.ts`（裁定 17：拿掉每次施放類與觸發、常駐、輪轉，價錢用 `runeRules.plain`）
- Modify（會紅的既有測試）：直接呼叫 `skillFor(...)` 而型別多了 `runes` 的測試照新型別補（不改斷言）。
- Test：`engine/runes.test.ts`、`engine/field.test.ts`、`engine/mechanics/echo.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `RUNES`、`runeStates`、`skillTags`；Task 2 的 `Member.sockets`。
- Produces：
  - `engine/types.ts`：`damage` 效果加 `onHit?: { status: AilmentId; chance: number }[]; aftermath?: true; armorBreak?: true; drainPct?: number; tpPerHit?: number`；`export interface RuneRules { bounce?: { bounces: number; dropPct: number }; trigger?: { on: 'crit' | 'kill' | 'struck'; pct: number; rune: RuneId }; twice?: true; wheel?: true; sync?: number; reprise?: number; lasting?: { pct: number; reservePct: number }; plain?: { tp: number; hpCost?: number } }`（`plain`：雙重詠唱或血之代價生效時，這招不算這兩個符文的 TP 與 HP 消耗，殘響用）；`SkillDef.runeRules?: RuneRules`。
  - `Combatant.runes?: Record<string, RuneRef[]>`：`fromMember` 只在成員有任何非 `null` 的符文時寫（去掉 `null`，保留槽序）；沒有就不寫這個鍵（舊物件逐位相同）。
  - `export function applyRunes(core: SkillDef, extra: Effect[], refs: readonly RuneRef[]): SkillDef`（`engine/runes.ts`）：
    1. `runeStates({ ...core, effects: [...core.effects, ...extra] }, refs, core)`，只留 `miss === null` 的，再依 `RUNES` 的鍵順序排好（裁定 5）；沒有就回 `extra.length ? patchSkill(core, { extra }) : core`（和 8d 的 `skillFor` 結果逐位元相同）。
    2. 合併所有 `RuneMod`（裁定 4、5、9）：`power`、`effect` 各自排序後相乘；`tpPct` 相加、`tpFlat` 相加；`turns` 相加；同一種異常取最高機率；其他欄位各自只有一個來源（互斥群組保證）。
    3. 一次 `patchSkill(core, mod)`：`shape: 'spread'` → `enemy` 改 `enemies`、`ally` 改 `allies`；`focus` 反之；`share` → `self` 改 `allies`；`hits: 'plus1'` → 每個傷害效果 `hits = (hits ?? 1) + 1`；`'one'` → 每個傷害效果先把 `power` 乘上它自己的原段數（整數，精確）、`hits = 1`，合計%（例：115）放進威力因子（雙刃 60 × 2 段 → 120，再 ×115% ＝ 138）；`element`（非 wheel）→ 每個傷害效果；`powerPct` ＝ 所有 power 與 effect 因子之積；`buffPct` ＝ 所有 effect 因子之積；`turnsDelta` ＝ `turns`；TP 照裁定 4 直接寫 `out.tp`。
    4. 每段的東西寫到每個傷害效果：`onHit`、`aftermath`、`armorBreak`、`drainPct`、`tpPerHit`。`inflict` 符文加一個 `{ kind: 'inflict', status, chance }`；`cure` 加 `{ kind: 'cure' }`；`overflowPct` 寫到每個 `heal` 效果（已有就取大）。招式（`core` 或 `extra`）已經有同一種異常的 `inflict`：拿掉它，並把它的機率併進符文的機率（取大）。
    5. `bloodPct`：`hpCost = (round((hpCost ?? 0) × 100) + tp × bloodPct) / 100`、`tp = 0`（`tp` 是第 3 點算完的）。
    6. 其他寫進 `runeRules`（`trigger` 帶自己的 `rune` id；`lasting` 只寫進 `runeRules`，不改任何數字）；雙重詠唱或血之代價生效時，用同一套算法但不含這兩個符文再算一次 `tp`／`hpCost`，寫進 `runeRules.plain`；最後接上 `extra`（沒有被第 4 點拿掉的）。
  - `skillFor(c: Pick<Combatant, 'powers' | 'ranks' | 'weaponKind' | 'runes'>, id)`：照舊算出 tree、精通、傳說威力（`core`，`extra` 另外收集），有 `c.runes?.[id]` 時 `applyRunes(core, extra, c.runes[id])`，沒有時照 8d 原樣；`knobWords` 照舊包在最外面。深淵加成照舊在 `perform` 裡（spec §6.6 第 1 點的順序成立：深淵在符文之後）。
  - `echo.ts`：記錄時 `runeRules` 只留下 `plain` 以外什麼都不留（`twice`、`bounce`、`reprise`、`sync`、`trigger`、`lasting`、`wheel` 全拿掉）；有 `plain` 時記錄的 `tp`／`hpCost` 換成 `plain` 的值、`cost` 照裁定 17 算，然後刪掉 `plain`。每一擊的欄位與改寫照留。
- [ ] **Step 1：先寫失敗的測試**（`engine/runes.test.ts`，用 `skillFor({ powers: [], runes: { [id]: refs } }, id)`，`m` ＝ magic）
  - `spread, focus and the spec's examples`：火之星彈＋擴散 → `target 'enemies'`、威力 84、TP 4；瞄準射擊＋擴散＋灼焰＋點燃 → `enemies`、`element 'fire'`、威力 `pctOf(160, 63)` = 101、TP 6、`onHit [{ status: 'burn', chance: 0.35 }]`；月光雨（`allies`）＋集中 → `ally`、威力 `pctOf(月光雨威力, 170)`。
  - `hits: one more, or one big`：雙刃＋連擊 → `hits 3`、威力 45；雙刃＋重擊 → `hits 1`、威力 138。
  - `TP adds percents, then flat, then floors at 1; a free skill stays free`：刃舞（5）＋節流＋蓄力 → 6；再加雙重詠唱 → 11；火之星彈＋節流 → 3、威力 112；`applyRunes({ ...SKILLS['war-dance'], tp: 0 }, [], [{ id: 'extend', tier: 'magic' }]).tp === 0`（免費的招仍免費）。
  - `blood price turns TP into HP`：火之星彈 → `tp 0`、`hpCost 0.12`；爆炎斬（3 TP、0.2）→ `hpCost 0.29`（嚴格等於）。
  - `the order of the slots never matters`：在這幾招 `fire-star`、`twin-slash`、`aimed-shot`、`moonlight`、`war-dance`、`iron-wall`、`blade-dance` 上，每一組「三個彼此相容」的符文（由測試從 `RUNES` 列舉，魔法階，含同一個非互斥群組的組合：異常、經濟、輔助、傳說），六種排列的 `skillFor` 結果 `toEqual` 第一種；另外寫死三組：火之星彈 `[thunderclap, ignite, jolt]`（`onHit` 依鍵順序 `ignite`、`jolt`，六種排列相同）、瞄準射擊 `[regain, drain, thrift]`、月光 `[dispel, spill-shield, thrift]`；組數 > 0 且寫在測試名稱旁的註解裡。
  - `a lasting rune leaves the castable skill alone`：戰舞＋常駐 → `skillFor` 的增益仍是 25%、TP 7，`runeRules.lasting` ＝ `{ pct: 60, reservePct: 30 }`。
  - `a rune that stops fitting stays put and changes nothing`：瞄準射擊裝 `[jolt]`、穿 `storm-thunder-bow`（雷）→ `onHit` 感電；脫掉 → 結果 `toEqual` 沒有符文的 `skillFor`；再穿上 → 感電回來。
  - `an ailment the skill already has is merged, highest chance`：炎之波裝 `noel-wave-burn` 1 點（`extra inflict burn 0.3`）＋點燃（魔法 0.35）→ 沒有 `inflict burn` 效果、`onHit` 機率 0.35；點燃普通（0.30）＋延燒 3 點（0.5）→ `onHit` 0.5。
  - `no runes, the very same skill`：所有角色所有招 `skillFor({ powers: [], ranks: defaultTree(id, 50) }, sk)` 與加上 `runes: {}` 的結果 `toEqual`。
  - `field.test.ts`：`a spread moonlight heals the whole party in the field`：瑟蕾月光裝擴散 → `fieldTargets` 為 `[]`、`castField` 讓每位站著的隊員都回復 `healAmount(..., 72)`。
  - `echo.test.ts`：
    - `echo keeps her runes but not her trigger`：隊友的火之星彈裝 `[spread, on-crit]` 施放後，`s.echo.def.target === 'enemies'`、`runeRules?.trigger` 不存在。
    - `echo pays the plain price of a blood-price skill`：諾艾兒（`tpCost` 0）的火之星彈裝血之代價施放後，`s.echo.cost === 4`、`s.echo.def.tp === 4`、`s.echo.def.hpCost` 為 `undefined`、`runeRules` 沒有 `plain`；洛恩殘響它 → TP −4、HP 不變。
    - `echo of a twin-cast skill is one cast at the single price`：火之星彈裝雙重詠唱（她付 8）→ `s.echo.cost === 4`、`runeRules?.twice` 不存在。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/runes.test.ts src/scripts/games/starlantern/engine/field.test.ts src/scripts/games/starlantern/engine/mechanics/echo.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-3`，against `gate-2`）。
- [ ] **Step 6：commit**：`feat(starlantern): runes rewrite the skill after the legendary powers — any slot order, the same skill`。

### Task 4: 每一擊的符文：命中異常、餘波、破甲、吸血、回氣、彈射

**Files:**
- Modify：`engine/skills.ts`（`applyEffect` 的 `damage` 迴圈、彈射）、`engine/combatant.ts`（`DamageSpec.armorBreak`；`rollHit` 有 `armorBreak` 不抽格擋；`hitAmount` 有 `armorBreak` 不算護甲與格擋）、`engine/battle.ts`（`perform` 在單體傷害招之後跑彈射）
- Test：`engine/runes.battle.test.ts`

**Interfaces:**
- Consumes：Task 3 的效果欄位與 `runeRules.bounce`。
- Produces：
  - 每一擊（`applyEffect` `damage`，一擊命中之後、`onLandedHit` 之後）：`drainPct` → 施放者回復 `floor(lost × drainPct / 100)`（> 0 才回、記帳本 `healing`、記 `heal` 事件）；`tpPerHit` → 施放者 TP +n（到上限、記 `tp` 事件）；`onHit` 每項 `inflictAilment(actor, target, status, chance, ctx)`（`ctx.lastHit` 已是這一擊）；`aftermath` 且這一擊暴擊 → `inflictAilment(actor, target, ELEMENT_AILMENT[element], 1, ctx)`，`ELEMENT_AILMENT = { phys: 'bleed', fire: 'burn', ice: 'freeze', thunder: 'shock' }`。順序：吸血 → 回氣 → 命中異常 → 餘波。
  - 彈射（`perform` 的 `skill` 分支，主目標的效果全部套完之後）：`runeRules.bounce` 存在、主目標只有一個時，依裁定 8 找下一個目標，對它套「每個傷害效果、威力 `pctOf(power, 100 − dropPct × n)`」，最多 `bounces` 次；每一彈照常抽 `rollHit`。`export function bounceNext(enemies: Combatant[], from: string, hit: ReadonlySet<string>): Combatant | undefined`（`engine/runes.ts`，純函式）。
- [ ] **Step 1：先寫失敗的測試**（`engine/runes.battle.test.ts`，用 `makeCombatant`／`makeBattle`／計數 rng）
  - `a rune ailment rolls once per landed hit`：雙刃＋撕裂對一個敵人：計數 rng 的抽取次數比沒有符文時多 2；`constRng(0.3)` 時兩段都流血、`bleed` 兩層，每層 tick ＝ `floor(該擊損失 × 20 / 100)`；閃避的那一段不抽異常。
  - `aftermath rides on a crit only`：`crit: 'always'` 的火之星彈裝餘波 → 目標灼燒；物理 → 流血；冰 → 非頭目凍結、頭目冰緩；沒有暴擊（敵人 crit 0、沒有 `always`）→ 不多抽。
  - `armor break ignores armor and block, and rolls no block`：目標 `armor 200`、`block 50`：裝破甲的一擊傷害 ＝ 同一組變異值下 `armor 0`、`block 0` 的傷害；計數 rng 少一次。
  - `drain and regain pay back`：損失 100 → 施放者 HP +8、帳本 `healing` +8；三段命中兩段 → TP +2，不超過上限。
  - `a bounce goes down the line and skips the fallen`：e0、e1、e2，e1 已倒：火之星彈＋彈射打 e0 → e2 受 `pctOf(140, 70)` = 98 威力的一擊；只有兩個敵人時只彈一次；`bounceNext` 從最後一個繞回第一個。
  - `no rune fields, no new draws`：同一場固定種子的戰鬥，成員沒有 `runes` 與 `runes: {}` 兩種跑法，計數 rng 的次數與 `s.log` 都相同。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/runes.battle.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-4`，against `gate-3`）。
- [ ] **Step 6：commit**：`feat(starlantern): runes on every hit — ailments, aftermath, armor break, drain, regain, bounce`。

### Task 5: 每一次施放的符文：雙重詠唱、星燈輪轉、同步、回聲、血之代價

**Files:**
- Create：`engine/mechanics/runes.ts`（`runes: MechModule`，加在 `modules()` 清單最後）
- Modify：`engine/mechanics/index.ts`、`engine/battle.ts`（`perform` 的雙重詠唱；`BattleState.sync?`、`BattleState.reprises?`）、`engine/combatant.ts`（`Combatant.wheel?: Record<string, number>`）、`ui2/battleText.ts`、`data/text.zh-TW.ts`（`T.rune.again`「{招}（第二次）」、`T.rune.reprise`「{招}的回聲」）
- Modify：`engine/field.ts`（雙重詠唱）
- Test：`engine/mechanics/runes.test.ts`、`engine/field.test.ts`、`ui2/battleText.test.ts`

**Interfaces:**
- Consumes：Task 3 的 `runeRules`、`hpCost`；8c 的 `payHp`、`MechModule`。
- Produces：
  - 雙重詠唱（`perform`，`skill` 分支）：效果套完一次（含彈射）後，`runeRules.twice` 時再對「重新決定的目標」套一次（裁定 12 的四種目標，全部不抽亂數；第二次不彈射），前面記 `act` 事件 `T.rune.again(def.name)`；TP、HP、`payMech` 只在第一次之前付；`afterAction` 照舊一次。`perform` 的 `echo` 分支不跑雙重詠唱與彈射。TP 的順序：`skillCost`（符文 → `tpCost`）→ 機制的 `castCost`（熟記在這裡取小，裁定 12）。
  - 輪轉：`castDef` 時 `runeRules.wheel` → 每個傷害效果的 `element` ＝ `['fire','ice','thunder'][(c.wheel?.[def.id] ?? 0) % 3]`；`after` 時這招真的施放了才把計數 +1。選單（`castDef` 也走這裡）顯示的就是下一次的屬性。
  - 同步：`after` 時 `runeRules.sync` → `s.sync = { pct, by: c.key }`；`castDef`：`s.sync` 存在且 `c.key !== s.sync.by` → 每個傷害、治療效果威力 ×`(100 + pct)%`（`pctOf`）；`after`：那位隊友施放了技能 → 刪 `s.sync`；`roundEnd` → 刪。
  - 回聲：`after` 時 `runeRules.reprise` 且這次施放有命中（`ctx.lastHit` 存在，`target` ＝ `ctx.lastHit.target`）→ `s.reprises.push({ by, target, round: s.round + 1, effects })`（`effects` ＝ 這次施放的傷害效果、威力 `pctOf(power, reprise)`）；`roundEnd` 時把 `round === s.round` 的取出，施放者活著且目標活著才記 `act` 事件 `T.rune.reprise(名稱)` 並套用（照常 `rollHit`）；其他留下。
  - 血之代價不需要新程式：Task 3 已把 `tp` 改 0、`hpCost` 加上去，`payHp` 照舊（最低 1 HP、餘燼先付）。
  - 野外施放（`engine/field.ts` `castField`）：`runeRules.twice` 時效果套兩次（TP 已是兩倍，不能只施放一次）；輪轉、同步、回聲在野外不作用（spec §6.6 第 7 點：野外只吃靜態改寫）。
- [ ] **Step 1：先寫失敗的測試**（`engine/mechanics/runes.test.ts`）
  - `twin-cast casts twice for one doubled price`：火之星彈（4 TP）＋雙重詠唱：TP −8 一次、e0 兩次 `damage` 事件、`act` 事件第二個是「火之星彈（第二次）」；莎菲拉的拍子只 +1（`afterAction` 一次）。
  - `the second cast moves on when its foe falls`：第一次就打倒 e0 → 第二次打 e1，計數 rng 和「直接選 e1」的那一擊抽取次數相同（目標選擇不抽）；兩個敵人都倒了 → 第二次什麼都不做、不出錯；月光（單體隊友）裝雙重詠唱 → 兩次都補同一位；月之再生裝雙重詠唱、兩人倒下 → 兩人都站起來，只有一人倒下 → 第二次什麼都不做；火之星彈裝 `[bounce, twin-cast]` 打 e0（三個打不倒的敵人）→ `damage` 事件的目標依序 e0、e1、e2、e0（第二次不彈射）。
  - `熟記 caps a twin-cast mark`：凜的暗記（6 TP）裝雙重詠唱、熟記 1 點（上限 5）→ `castCost === 5`、施放後 TP −5；沒有熟記 → 12。
  - `the hero's echo of a twin-cast skill strikes once at the single price`：隊友火之星彈裝雙重詠唱施放後，洛恩殘響 → TP −4、e0 只有一次 `damage` 事件、沒有「（第二次）」的 `act`。
  - `the starwheel turns fire, ice, thunder`：同一招連放四次的 `damage` 事件屬性 fire、ice、thunder、fire；另一招的計數獨立；TP 不足沒施放時不轉。
  - `sync lifts the next ally's skill once`：諾艾兒（同步）先動、凜接著用技能 → 威力 ×1.3；再下一位不加；凜改用普通攻擊時同步留給下一位放技能的人；回合末刪除。
  - `reprise strikes again at the next round's end`：第 1 回合放回聲 → 第 1 回合末沒有、第 2 回合末 e0 受到威力 70 的一擊；第 2 回合中 e0 倒下或施放者倒下 → 什麼都沒有；指定 e0 但 e0 已倒、實際打中 e1 → 回聲打 e1；整次閃避 → 沒有回聲。
  - `blood price leaves her at 1 HP and pays no TP`：諾艾兒 HP 10/200、TP 0、`x.tpCost 20`、裝了血之代價的火之星彈：`castCost` 0、施放成功、HP 1、TP 0；HP 100 → 76。
  - `field.test.ts`：`a twin-cast heal heals twice in the field`（瑟蕾月光裝雙重詠唱：TP 付 10、目標回復兩次 `healAmount`，HP 不超過上限）。
  - `ui2/battleText.test.ts`：`battle lines for the new acts`：`battleLines([{ type: 'act', actor: 'noel', label: T.rune.again('火之星彈') }, { type: 'act', actor: 'noel', label: T.rune.reprise('火之星彈') }], nameOf)` ＝ `[T.log.act('諾艾兒', '火之星彈（第二次）'), T.log.act('諾艾兒', '火之星彈的回聲')]`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/runes.test.ts src/scripts/games/starlantern/engine/field.test.ts src/scripts/games/starlantern/ui2/battleText.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-5`，against `gate-4`）。
- [ ] **Step 6：commit**：`feat(starlantern): runes on every cast — twin-cast, starwheel, sync, reprise, blood price`。

### Task 6: 觸發符文

**Files:**
- Modify：`engine/mechanics/runes.ts`（`noteHit`、`noteStruck`、`runTriggers`）、`engine/skills.ts`（`EffectContext.acting?: string`；`damage` 迴圈在每一擊之後呼叫 `noteHit`）、`engine/battle.ts`（`resolveRound` 在每個行動區塊之後呼叫 `runTriggers`；`perform` 的 `echo` 分支清掉 `ctx.acting`；`BattleState.triggers?`）、`engine/combatant.ts`（`Combatant.fired?: Partial<Record<'crit' | 'kill' | 'struck', number>>`；`BattleEvent` 加 `{ type: 'trigger'; actor: string; skill: string; rune: RuneId }`）、`ui2/battleText.ts`、`data/text.zh-TW.ts`（`T.log.trigger`「{名字}的{符文}：{招}！」）
- Test：`engine/mechanics/runes.test.ts`、`ui2/battleText.test.ts`

**Interfaces:**
- Consumes：Task 3 的 `runeRules.trigger`、`applyRunes`；Task 5 的模組。
- Produces：
  - `ctx.acting`：`resolveRound` 在 `perform`（含「還有。」的追加行動）期間設成行動者的 key，結束就刪；`endOfRound`、`afterFoe`、觸發的施放、回聲期間不存在。
  - `export function noteHit(actor: Combatant, target: Combatant, crit: boolean, ctx: EffectContext): void`：`ctx.acting === actor.key` 時：我方 `actor` 暴擊 → 排 `crit`、擊倒敵人 → 排 `kill`；敵方 `actor` 命中我方 `target` → 對 `target` 排 `struck`。排入條件：該角色有一招裝了這個條件且生效的觸發（`learnedSkills` 順序的第一招，天生的招在最前），`fired[on] !== s.round`；排入時就寫 `fired[on] = s.round`。佇列項目 `{ by, skill, on, foe }`（`foe`：暴擊／擊倒時被打的敵人、受擊時打她的敵人）。
  - `export function runTriggers(s: BattleState, ctx: EffectContext, rng: Rng): void`：依序取出；施放者倒下、`frozen` 或 `sleep > 0` 就丟掉；招式 ＝ `skillFor` 但符文清單拿掉這個觸發符文，深淵加成照 `perform`（`def.abyss && s.abyss`），再 `patchSkill(def, { powerPct: pct, buffPct: pct })`，然後拿掉 `runeRules` 的 `twice`、`bounce`、`reprise`、`sync`；輪轉的招用 `(c.wheel?.[id] ?? 0) % 3` 的屬性、計數不前進；施放期間 `ctx.cast = def.id`，完了刪；記 `trigger` 事件；目標照裁定 11（單體敵人：`foe` 活著就是它，否則第一個活著的敵人；沒有就整個取消）；`resolveTargets` 照常；施放期間 `ctx.acting` 不存在（所以不會再觸發）；不扣 TP、不加量表、不跑 `castDef`／`payMech`／`afterAction`／`extraAction`、不寫 `s.echo`。
  - `resolveRound`：每個行動者的區塊結束時（`afterFoe` 之後、或「還有。」的迴圈之後），在 `ringBell` 之前 `runTriggers`。
- [ ] **Step 1：先寫失敗的測試**
  - `a crit sets off the crit trigger after the action, at 60%, for free`：凜（`nextCrit`）普通攻擊 e0，她的飛針裝暴擊觸發（魔法）→ 攻擊之後記 `trigger` 事件、飛針打 e0 威力 `pctOf(飛針威力, 60)`；TP 不變；`limit` 只多一次 `LIMIT_PER_ACTION`。
  - `once a round, and a triggered cast sets off nothing`：同一回合兩次暴擊只觸發一次；觸發出來的飛針自己暴擊不再觸發；下一回合可以再觸發。
  - `a kill and a blow set off theirs`：擊倒觸發在她擊倒敵人時；受擊觸發（挑釁裝受擊觸發）在敵人命中她之後、那個敵人行動結束時；閃避的一擊不觸發；被凍結或睡著時不觸發。
  - `only her own blows count`：她的裝置、持續傷害、贖火反擊、回聲、殘響（洛恩重現她的招）打出的暴擊或擊倒都不觸發。
  - `a trigger with no foe standing does nothing`：觸發排入後全部敵人倒下 → 沒有事件、不出錯；被暴擊的敵人倒下但還有別人 → 打第一個活著的，計數 rng 和直接指定目標相同。
  - `two skills with one condition: the first learned fires`：凜的暗記（天生）與飛針都裝暴擊觸發，她暴擊 → 這回合恰好一個 `trigger` 事件、`skill === 'rin-mark'`。
  - `a triggered cast is the plain skill`：觸發的火之星彈另裝雙重詠唱與彈射 → 只有一次施放、不彈射；另裝星燈輪轉 → 屬性是目前輪到的、`c.wheel` 不變；深淵戰鬥（`abyss 20`）裡深淵招的觸發威力 ＝ `pctOf(pctOf(power, 120), 60)`。
  - `battleText`：`trigger` 事件一行「凜的暴擊觸發：飛針！」。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/runes.test.ts src/scripts/games/starlantern/ui2/battleText.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-6`，against `gate-5`；跑 e2e）。
- [ ] **Step 6：commit**：`feat(starlantern): trigger runes — her crit, her kill or a blow on her casts the skill once a round`。

### Task 7: 常駐符文：常駐增益、常駐結界、TP 保留

**Files:**
- Modify：`engine/runes.ts`（`runeNote`）、`engine/mechanics/runes.ts`（`init` 階段之後的 `applyLasting(s)`、`battleReservePct`、`lastingTargets`）、`engine/battle.ts`（`createBattle` 在 `initMechs` 之後呼叫）、`engine/combatant.ts`（`Combatant.auras?: Buff[]`；`stat` 同屬性同方向取較強）、`engine/mech.ts`（`Barrier.lasting?: true`）、`engine/mechanics/barrier.ts`（常駐結界不倒數、解放算原回合、字樣「常駐」）、`engine/ledger.ts`（`creditPrevented` 對每個常駐增益做邊際計算）、`data/text.zh-TW.ts`（`T.mech.lasting`「常駐」）
- Test：`engine/mechanics/runes.test.ts`、`engine/mechanics/barrier.test.ts`、`engine/ledger.test.ts`、`engine/sockets.test.ts`

**Interfaces:**
- Consumes：Task 3 的 `runeRules.lasting`（`reservedTpPct` 只用在拆裝，戰鬥不用）。
- Produces：
  - `export function applyLasting(s: BattleState): void`：依 `s.party` 順序，每位成員每個裝了生效常駐的招（`skillFor(c, id)` 的 `runeRules.lasting`）：`buff` 效果 → 目標（`export function lastingTargets(def: SkillDef, c: Combatant, party: Combatant[]): Combatant[]`：`self`／`ally` → `[c]`；`allies` → 每位活著的隊員）`auras` 加 `{ stat, pct: pctOf(pct, lasting.pct), turns: 0, src: c.key }`（同屬性同方向只留較強的）；`barrier` 效果 → `raiseBarrier` 一個 `power: pctOf(power, lasting.pct)`、`lasting: true` 的結界。然後 `c.max.tp = floor(c.max.tp × (100 − battleReservePct(c)) / 100)`、`c.tp = min(c.tp, c.max.tp)`。`export function battleReservePct(c: Combatant): number` ＝ `c.runes` 每招 `skillFor(c, id)?.runeRules?.lasting?.reservePct ?? 0` 的和（只算生效的），上限 `RESERVE_CAP`。不扣 TP、不抽亂數、不記施放事件。
  - `stat(c, s)`：每個方向（正、負）分別取「增益」與「常駐增益」中絕對值較大的一個相加；沒有 `auras` 時與 8d 逐位元相同（每個方向本來就最多一個增益）。
  - 常駐結界：`roundEnd` 的倒數跳過；解放時「剩幾回合」用它原本的 `turns`；`fieldWords` 以 `T.mech.lasting` 代替回合數；被新結界取代（含再施放同一招）、被解放就消失（裁定 13）。
  - `export function runeNote(def: SkillDef, id: RuneId): string | undefined`（`engine/runes.ts`）：常駐裝在有 `barrier` 效果的招上 → `T.rune.lastingBarrier`「再施放一次會換掉它。」；其他 undefined。第 ⑦ 步的卡片把它接在符文的一句話後面。
  - `creditPrevented`：照增益的做法，對 `t.auras` 每一個防禦性的（`def`／`res`，正值）以「只拿掉這一個」重算，差額記給它的 `src`。
- [ ] **Step 1：先寫失敗的測試**
  - `runes.test.ts`：
    - `a lasting war dance lifts the party all fight and reserves her TP`：莎菲拉（max TP 100、TP 100）的戰舞裝常駐（魔法）→ 戰鬥開始每位隊員 `auras` 有 `atk 15`；莎菲拉 `max.tp 70`、`tp 70`；20 回合後仍在；她倒下後仍在。
    - `an aura and a buff: the stronger counts`：`atk` 常駐 15 ＋ 戰舞 25 → `stat` 用 25；戰舞到期後回到 15；`def` 常駐 24 與 −20 的減益 → 兩者都算（不同方向）。
    - `a lasting single-ally buff goes to the caster`：`lastingTargets({ ...SKILLS['war-dance'], target: 'ally' }, safira, party)` ＝ `[safira]`；`target: 'allies'` → 每位活著的隊員；`'self'` → `[safira]`。
    - `a lasting rune that no longer fits reserves nothing`：常駐裝在火之星彈上（Task 2 允許裝、`runeStates` 為 needs）→ `reservedTpPct(member) === 30`，但開戰後諾艾兒 `max.tp` 等於沒裝時、沒有 `auras`。
    - `no lasting rune, no aura and the same TP`：沒有符文的成員 `auras` 不存在、`max.tp` 不變。
  - `barrier.test.ts`：`a lasting ward stands all fight until spent`：千鶴守之結界（30%、3 回合）裝常駐 → 開戰就有 `power 18` 的守之結界、10 回合後仍在；破邪突解放時威力加成照 3 回合算、結界消失；字樣含「常駐」；再施放守之結界 → 換成一般的 3 回合結界（`lasting` 不在了）、3 回合後消失；`runeNote(SKILLS.ward, 'lasting') === '再施放一次會換掉它。'`、`runeNote(SKILLS['war-dance'], 'lasting') === undefined`。
  - `ledger.test.ts`：`a lasting guard is credited what it prevents`：同一個敵人、同一個 `HitRolls`，打兩個一樣的目標：一個帶 `buffs: [{ stat: 'def', pct: 24, turns: 3, src: 'chizuru' }]`、一個帶 `auras: [{ stat: 'def', pct: 24, turns: 0, src: 'chizuru' }]` → 兩本帳的 `by.chizuru.prevented` 相等且 > 0；兩者都帶（同方向）時，拿掉任一個都不變，各記 0。
  - `sockets.test.ts`：`reservedTpPct sums the socketed lasting runes`（一個 30、三個 90）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/runes.test.ts src/scripts/games/starlantern/engine/mechanics/barrier.test.ts src/scripts/games/starlantern/engine/ledger.test.ts src/scripts/games/starlantern/engine/sockets.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-7`，against `gate-6`）。
- [ ] **Step 6：commit**：`feat(starlantern): lasting runes — a buff or barrier all fight for a share of max TP`。

### Task 8: 模擬掛鉤、守門與整體驗收

**Files:**
- Modify：`engine/sim.ts`（`Lineup.runes?: Partial<Record<CharacterId, Record<string, RuneRef[]>>>`，`partyAt` 寫進成員的 `sockets`）
- Create：`engine/runes.guard.test.ts`
- Create（SDD）：`summary.md`（每個任務的 commit、閘門結果、偏離本計畫之處與根據、留給第 ⑥⑦⑧ 步的事）
- Test：`engine/runes.guard.test.ts`、`engine/sim.test.ts`

**Interfaces:**
- Consumes：Task 1–7 全部。
- Produces：`partyAt(level, { runes })`：每位列到的成員 `sockets` ＝ 給的清單（每招補滿 `null` 到 `socketCount(level)` 之內；超過插槽數或招式不會就丟錯，測試用的掛鉤不默默修正）；沒有 `runes` 時與 8d 逐位元相同。`kitParty` 透過 `partyAt` 自動帶上。這是第 ⑧ 步「符文有價值」帶要用的掛鉤（spec §13 第 3 點），本計畫只在測試裡用。
- [ ] **Step 1：先寫測試**
  - `engine/sim.test.ts`：`a lineup can wear a fixed rune set`：`partyAt(35, { runes: { noel: { 'fire-star': [{ id: 'spread', tier: 'magic' }] } } })` 的諾艾兒 `sockets` 對、別人沒有；`simBattle` 同一個種子跑兩次，`setSimTrace` 記下的每回合行動與結果相同；Lv10 裝第二槽 → 丟錯。
  - `engine/runes.guard.test.ts`：
    - `the bands field no runes`（spec §12.2）：`engine/balance*.test.ts`、`engine/parity.ts`、`data/policies.ts` 的原始碼不含 `runes:`；`partyAt`、`kitParty` 不帶 `runes` 時，每個角色、Lv 5／10／20／35／50 的成員都沒有 `sockets`，`fromMember` 沒有 `runes`。
    - `the sim never sets off a rune`：用 `setSimTrace` 跑標準隊伍 Lv35 主線第 9 層的每一組敵人各一個種子：每回合的 `before.party` 沒有 `runes`、沒有 `auras`、`after.log` 沒有 `trigger` 事件、沒有 `T.rune.again`／`T.rune.reprise` 的 `act`。
    - `every rune does its one thing`：每個符文（魔法階；傳說為傳說階）配一招它相容的範例招（測試裡的表，每個符文一列）與一場固定種子的戰鬥：裝上後 `skillFor` 的結果或戰鬥紀錄與沒裝不同（抓「裝了沒作用」的符文）；並且改到的類別（目標、段數、屬性、威力、TP、HP 消耗、附加效果、每段欄位、`runeRules`）都在符文表那一列寫到的範圍內（測試裡的 `TOUCHES[id]`，例：擴散 ＝ 目標＋威力、灼焰 ＝ 屬性＋威力＋TP）——「一個符文只做它說的那件事」；常駐看 `auras`／`max.tp`、觸發看 `trigger` 事件。
    - `rune words name no number the table does not hold`：每個 `text(tier)` 裡的每個數字都在 `RUNE_NUMBERS[id][tier]` 或固定代價裡。
- [ ] **Step 2：執行**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/runes.guard.test.ts src/scripts/games/starlantern/engine/sim.test.ts`。任何一條不成立 → 回到負責的任務修（不是改測試）；修不了就停下來回報。
- [ ] **Step 3：整體驗收**：全套全綠、tsc 0、閘門 `gate-8`（against `gate-7`，必須 `identical`）、再跑一次 `gate-8final` against 8d 最終閘門（必須 `identical`，證明整個計畫沒有移動任何量測值）、e2e 全綠；寫 SDD `summary.md`。
- [ ] **Step 4：commit**：`test(starlantern): rune guards — the bands field none, the sim sets none off, every rune does its one thing`。

---

## 交給之後計畫的介面（摘要）
- **第 ⑥ 步（掉落、道具店、合成、賣出）**：袋子是 `GameState.runes`（鍵 `runeKey`、值數量）；上限 `RUNE_STACK` 算袋子＋鑲嵌（裁定 15），在增加的那一刻檢查；`parseRuneKey`、`tiersOf`（傳說不能合成）。掉落用 spec §6.5 的 `RUNE_SALT` 串流，本計畫沒有建立它。
- **第 ⑦ 步（技能工坊與預覽）**：「之前」＝ `skillFor(c 去掉這招的符文, id)`，「之後」＝ `skillFor(c 換上試裝的清單, id)`；標籤 `skillTags`（`T.rune.tag`）；每個符文的狀態與一行原因 `runeStates`＋`runeWhy`；拆裝 `Game.socketRune`／`unsocketRune`／`canSocketRune`；插槽數 `socketCount`；狀態頁的保留 TP 用 `battleReservePct(fromMember(m, 0))`（只算生效的；`reservedTpPct` 是拆裝上限）；常駐裝在結界招上的補充說明 `runeNote`。屬性符文不改招式說明裡寫的屬性字（例：「火屬性魔法攻擊」），預覽卡的「屬性」列才是準的——第 ⑦ 步決定要不要改說明。
- **第 ⑧ 步（建議 build、符文平衡帶、自動）**：模擬裝符文用 `Lineup.runes`；`choose` 目前不知道觸發與常駐（模擬裡也沒有），各 build 的行動策略在第 ⑧ 步加；spec §12.4 的「符文有價值 +20%」、「沒有唯一正解 1.6 倍」、「天花板」三條帶都在第 ⑧ 步量。
- **戰鬥事件**：新增 `trigger`；雙重詠唱與回聲用 `act` 加標籤；吸血用 `heal`、回氣用 `tp`、異常用既有的 `status`／`resist`。
