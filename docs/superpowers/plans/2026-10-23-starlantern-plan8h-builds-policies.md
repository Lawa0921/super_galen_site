# 星燈迷宮 計畫 8h：建議 build、各 build 的行動策略與「自動」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 技能深化 spec §17 的第 ⑧ 步：每位角色「標準」＋兩套符文 build（洛恩：標準＋HERO_BUILDS 四種＋殘響），一鍵套用、缺什麼寫出來、可以跟隨；每套 build 的行動策略同時驅動模擬量測與戰鬥的「自動」；量出「魔法階建議 build ≥ 標準 +20%」與三條新平衡帶；把 8c–8g 留給 ⑧ 的平衡項目逐條裁定。普通難度的每一個量測值逐位元不動。

**Architecture:**
- **一份 build 資料、三個用途**（spec §16）：`data/builds.ts` 每套 build 一筆（樹的順序與選邊、天賦、每招建議符文、行動策略、專長情境）。「標準」build 就是現在的 `defaultTree`／`defaultTalents`／`DEFAULT_POLICIES`（相等測試），所以模擬、平衡帶、戰力對等的輸入一個位元都不變。
- **新東西只走普通模擬不走的路**：新的策略規則只出現在符文 build 的策略裡；延後項目的引擎修正（同步、觸發、回氣、常駐雷擊、殘響）只作用在有符文的戰鬥。每個任務的閘門都必須 `identical`；需要移動任何閘門表就是 bug（BLOCKED）。
- **符文帶在自己的檔案**：`engine/builds.bands.test.ts`（不叫 `balance*`：8e 的守門禁止平衡檔出現 `runes:`，閘門夾具也不能動），用 `Lineup.build` 穿上 build、同一本貢獻帳本量。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、SCSS、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-20-starlantern-skill-builds-design.md`（使用者 2026-10-20 核准，細節授權）。本計畫實作 §16 全部、§12.4 的四條新平衡帶、§13 掛鉤 1–3（4 已在 8f 做成 `difficultyMul`，5 不需新欄位）、§11「自動」與 `choose` 讀 build 策略。不做：美術（第 ⑨ 步）、噩夢／地獄地城本身。前置：計畫 8g 完成（HEAD `4b212ce20` 或之後）。必讀：SDD ledger `.superpowers/sdd/2026-10-20-starlantern-plan8-skills/progress.md`（全部控制者裁定有約束力，尤其 8c–8g 留給 ⑧ 的各行）、`.superpowers/sdd/2026-10-22-starlantern-plan8g-skill-workshop/summary.md`。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄：`.superpowers/sdd/2026-10-23-starlantern-plan8h-builds-policies/`（下稱 SDD）。行號只供定位，動手時一律用內容找。

## 現有的介面（本計畫照用）
- `engine/policy.ts`：`PolicyRule`（`ensure-barrier`、`ensure-device`、`ensure-mark`、`alternate`、`spend-at`、`heal-below`、`strongest-damage`）、`PolicyTable`、`applyPolicy`；`data/policies.ts` `DEFAULT_POLICIES`。
- `engine/sim.ts`：`Lineup`（已有 `policies`、`runes`）、`partyAt`、`kitParty`、`choose(s, party, policies?)`、`castPower`、`simBattle(…, opts: { ledger, policies })`、`winRate`、`SimTrace`／`setSimTrace`；`engine/parity.ts`：`parityDepth`、`parityLineups`、`measureParity`；`engine/ledger.ts`：`credit`、`lossOf`、`creditPrevented`。
- `engine/progression.ts`：`defaultTree`、`heroTree`、`defaultTalents`、`heroTalents`、`canRaiseNode`、`learnedSkills`、`DEFAULT_FIRST`；`data/trees.ts`：`TREES`、`DEFAULT_CAPSTONE`、`tierNodes`、`NODES`；`data/hero.ts`：`HERO_BUILDS`、`HeroBuild`；`data/talents.ts`：`DEFAULT_KEYSTONES`。
- `engine/sockets.ts`：`socketCount`、`socketable`、`socketRune`、`unsocketRune`、`returnOrphanRunes`、`validRuneFields`／`repairRuneFields`；`engine/runes.ts`：`runeFits`、`runeStates`、`runeWhy`；`data/runes.ts`：`RUNES`、`RUNE_IDS`、`RUNE_NUMBERS`、`tiersOf`；`data/runeEconomy.ts`：`RUNE_STOCK`。
- `engine/mechanics/runes.ts`：`runes.castDef`（同步加成）、`runTriggers`、`applyLasting`、`battleReservePct`；`engine/mechanics/echo.ts`：`echoOf`、`echoDef`、`PLAIN`、`ECHO`；`engine/mechanics/barrier.ts`（雷之結界 `barrierThunder`）。
- `engine/town.ts`：`respecPrice`、`hasSpent`；`engine/party.ts`：`awardExp`；`engine/game.ts`：`respec`、`raiseNode`、`swapPair`、`raiseTalent`、`socketRune`、`runesMoved`。
- 畫面：`ui2/skillCard.ts`（`battleLine`）、`ui2/scenes/workshop.ts`、`ui2/scenes/inn.ts`、`ui2/scenes/statusTabs.ts`、`ui2/scenes/battle.ts`（`'auto'` ＝ 全員攻擊）。

## 計畫裁定（spec 留給實作者、spec 與程式碼不一致之處、ledger 留給 ⑧ 的項目）

標「設計者裁定」的是本計畫決定的細節（使用者授權：「技能設計由你決定細節」），每條附一行理由。

1. **控制者規則落實：本計畫不移動任何閘門表。** 標準 build ＝ 預設配點／天賦／策略（Task 3 相等測試）；新規則與引擎修正只在符文或 build 策略存在時作用。所以 `report.txt`、三個 `actions.json`、`contribution.json` 每個任務都 `identical`，`PARITY_TASK` 整個計畫維持 `between plans`，不錄新的戰力對等表。理由：使用者「不裝符文頂多過普通」——⑧ 沒有任何東西應該碰普通難度。某個修正非移動閘門不可，就停下來回報 BLOCKED，不准重錄夾具。
2. **設計者裁定：「跟隨」預設是不跟隨**（spec 衝突，見文末）。spec §16 說「預設跟隨標準，所以現在的玩家感覺不到改變」，但程式碼升級從不自動配點（`engine/party.ts` `gainExp`：「Points are never spent here」），預設跟隨反而會改變現在的玩家。跟隨只由「套用」開始；手動投點、換邊、投天賦、旅館重置都會結束跟隨（並告知）。理由：跟隨中的樹永遠等於 `buildTree(等級)`，升級補點才有唯一正解。
3. **設計者裁定：洛恩的 build**：標準（balanced，無符文）、劍技（sword）、星術（mage）、祈光（healer）、守護（tank）各帶建議符文、殘響（balanced 的樹＋殘響策略＋符文）。balanced 不另做一套帶符文的版本。理由：spec「標準無符文」與「五種各自補符文」對 balanced 不能同時成立；帶符文的 balanced 就是標準＋工坊。
4. **設計者裁定：build 資料**（`data/builds.ts`）：`BuildDef` 見 Task 3。名稱與一句話是內容，跟招式名稱一樣放資料檔，不手打數字；**策略句子由規則產生**（`policyText`），不另寫一份，卡片與「自動」永遠和資料一致。
5. **設計者裁定：新的策略規則種類**（Task 1，spec §16「build 可以多用幾條」）：`ensure-taunt`、`ensure-cover`、`release-at`、`at-phase`、`execute-below`、`cast-unless-last`、`cast-when`（通用的「可施放就放」，給自身／全隊招：蜃樓步、超頻、全面整備、贖火）、`echo`，`spend-at` 加 `of: 'maxHp'`，`strongest-damage` 加 `aoe`。全部純函式、不抽亂數、只讀戰鬥狀態；`DEFAULT_POLICIES` 一條都不用（所以舊名冊閘門照舊成立）。
6. **設計者裁定：build 策略的傷害排序看打到幾個**：`strongest-damage { aoe: true }` 用 `castPower × reach`（`reach`：`enemies` ＝ 活著的敵人數；帶彈射 ＝ `1 + Σ_{n=1..min(彈射次數, 敵人數−1)} (100 − dropPct·n)/100`；其他 1）。預設的排序（`castPower`）不變。理由：不看目標數，模擬玩家會因為擴散降了單體威力就不放它，量出來的符文價值是錯的。
7. **設計者裁定：「符文有價值」帶（spec §12.4）的量法**：等級 35 與 50（三個槽都開）；量的是 build 主人的每回合貢獻（同一本帳本）；隊伍 ＝ 她在 `parityLineups()` 的那一支，其他人一律標準；對照 ＝ 同一支隊伍、她用標準（無符文、`DEFAULT_POLICIES`）。專長情境：`boss` ＝ 該深度的燈喰之獸（`parityDepth(L)`），種子 `k × 7919`、k = 1…40；`crowd` ＝ 該深度本道 `encounterTable` 的每一組，每組 10 個種子；`long` ＝ 同樣每一組、每組第一隻是菁英（`scale.elite = g[0]`，同第 8 項），每組 10 個種子。條件：兩個等級都 `build ÷ 標準 ≥ 1.20`，而且整隊勝率 `≥` 標準。另外報告「同一套 build 不裝符文」的數字（只報告），讓人看得出多少來自符文。
8. **設計者裁定：「符文的天花板」帶**：每一套符文 build 在它的隊伍裡用史詩階，隊伍其他人各自穿自己的第一套符文 build（史詩階；洛恩當隊友時穿 `sword`），稀有套裝 `+ENHANCE_MAX`（第 14 項的穿法），深度 5 與 10 的頭目，種子 1…20：每一場 `rounds ≥ 2`。第 14 項有兩種跑法，兩種都跑：不帶記憶，以及 `DEEP`（十段記憶＋深淵到上限，`balance.test.ts` 的同一個 `Lineup`；洛恩照 `DEEP.heroBuild` 換成他對應的 build 時改穿那一套）。理由：「最強的那一套」要先定義才量得到；全部都量就不用定義，而「全隊都穿 build」才是真的天花板。等級低於 35 時插槽較少，只鑲每招前 `socketCount` 顆（和一鍵套用同一個規則）。
9. **控制者裁定落實：「沒有唯一正解」帶的量法**（spec 衝突，見文末）：「一招的期望輸出」量成**這一招每次施放的貢獻**：帳本多一個以 `ctx.cast` 為鍵的分項（`Ledger.bySkill?: Record<string, Contribution & { casts: number }>`，只有帶 `bySkill` 的帳本才記；觸發、殘響、回聲的貢獻不算進這一招）。每一套符文 build、它的第一招（`runes` 的第一個鍵）、每一種裝得上的符文（一般符文魔法階、傳說符文本階）：同一套 build、同一份策略、同一批戰鬥（Lv 50、`parityDepth(50)` 的本道每一組＋頭目、每場 10 個種子），只差這一招有沒有這一顆；比 `這一招的貢獻 ÷ 施放次數`：比值 ≤ 1.6。兩邊都必須至少施放一次（施放 0 次就是策略沒用到這一招，算失敗並回報）。理由：比整個人的貢獻會被其他招稀釋；直接數威力，擴散對三隻就是 1.8 倍；帳本扣掉溢傷才是「期望」。
10. **設計者裁定：「異常不洗版」**：所有符文帶的戰鬥裡，頭目從不出現 `frozen`（規則保證：頭目改冰緩），用 `SimTrace` 檢查每一回合。
11. **ledger 延後項目的裁定**（Task 2；全部只在有符文的戰鬥發生，閘門不動）：
    - a. **殘響不複製同步**：殘響記下的是「沒有同步加成」的那一招（和 8e 的回聲裁定 (a) 同一條：從同步之前的效果建）。**雙人舞的加成照留**（8d 裁定：殘響「照施放時的樣子」），只拿掉同步。
    - b. **觸發出來的施放「不花也不拿」**：只打出一般效果（殘響的 `PLAIN`：傷害、治療、增益、異常、解除、復活、挑釁），機制種類的效果（結界、裝置、暗記、月相、銅板、餘燼、瞄準追加、量表）不出現；這一擊的命中也不讓施放者的機制前進——要擋的是現在真的會漏的地方：`coins.onHit`（每段銅板）、`aim.onHit`（層數與目標）、`mark.onHit`（用掉 `nextCrit`）。帳務照舊：`pruneMarks`（暗記目標倒下的清理）與擊倒時的 `payAppraisal`（估價加倍）在觸發的一擊上照樣做，因為那是「目標倒下」的結算，不是她的收益。（熱度、拍子、`last` 在 `castDef`／`pay`／`after` 裡，`runTriggers` 本來就不跑，不另寫。）觸發符文因此只裝得上「有一般效果」的招，不然變灰（新的 `RuneMiss` `'plain'`）。理由：spec §6.6「觸發不耗 TP、不累積絕技量表」的精神是「白拿的一擊什麼都不帶」；和殘響同一條規則，玩家只要記一次。
    - c. **回氣最多回到這一招付的 TP**：一個行動（含雙重詠唱的第二次）回氣回復的 TP 總和 ≤ `ctx.triggered ? 0 : (ctx.paid ?? 0)`（`ctx.paid` 在觸發期間是前一個行動留下的舊值，所以觸發要明寫 0）；殘響施放時設 `ctx.paid = rec.cost`；血之代價付的是 HP，`paid` 為 0，所以回氣不回（設計者裁定：付 HP 換來的招不倒回 TP）。符文的那一句話加上這個上限。理由：多段的便宜招配回氣（不需要雙重詠唱）就會不花錢；「不會倒賺」是一句話講得完的規則。
    - d. **常駐的結界，雷擊也是常駐的效果**：雷之結界從常駐結界打出的雷擊，威力乘上常駐的效果百分比（魔法階 60%）。常駐結界與手動架的結界同時在場時（重結界），每回合只雷擊一次、取兩者中**較高**的百分比（手動的是 100%）。理由：符文寫「效果 60%」，結界帶來的每一件事都算；同時在場不該比只架手動的更弱。量：千鶴「不動結界」的符文帶。
    - e. **同步的給予者有貢獻**：被同步加成的那一擊或那一次回復，帳本把「有加成 − 沒加成」記給給予者，其餘記給施放者；總和不變。「沒加成」用**加成之前的原始威力**（`castDef` 留下的未加成效果）以同一組抽骰重算，不從加成後的威力除回去（`pctOf` 會四捨五入）。雙人舞不改：莎菲拉的機制節點在標準配點裡，改它的歸屬會移動凍結的戰力對等表（記給難度專案）。
    - f. **兩個常駐結界照舊只警告**（8e m5、8g 裁定 10）：引擎不改；守門：沒有任何一套 build 讓同一人兩個結界招都裝常駐，一鍵套用也不會造出這個情況。
    - g. **殘響不帶深淵加成**：加成屬於洛恩的五個深淵絕技本身（`def.abyss`），殘響重現的是夥伴的招，從來沒有這個加成；選單的說明已經照戰鬥寫。只加一則釘住的測試。
    - h. **戰鬥選單的摘要用施放時的樣子**（8g「battleLine 漏了諾艾兒的熱度」）：戰鬥中 `battleLine` 吃 `castDef(s, actor, def)`（熱度、銅板、結界解放、拍子、月相、同步都在裡面）；工坊（戰鬥外，沒有戰鬥狀態）照舊。Task 8。
    - i. **拍手・安可維持在只改數字的白名單**（8d 裁定「符文來了再看」）：「祭典指揮」build 的 `sides`／`first` 學安可、策略施放拍手，量到它的價值（Task 5a 報告、Task 5b 斷言）；白名單的理由改寫成這件事，守門檢查資料與施放，不檢查字串（Task 5b）。
    - j. **波比的標準策略不改**（頭目／菁英才架，8c 裁定）：改了會移動閘門；他的兩套 build 在每一場都維持裝置。
    - k. **8c／8d 留下「模擬從不施放」的節點**（代受、贖火、拍手、蜃樓步、護盾產生器、超頻、全面整備、收回、滿月之夜、一擲千金、赤心）：由各 build 的策略施放（自身／全隊招用 `cast-when`）並在 `rune-value.md` 記下每次施放的貢獻；沒有任何 build 施放的，只能是「沒有 build 選這條絕技分支」的絕技，列在例外表並寫理由。這條是 Task 5b 的斷言（調整時一起處理），Task 9 只掃例外表的形狀。
12. **設計者裁定：一鍵套用**（spec §16）：只在城鎮（`phase === 'town'`），和旅館重置一樣立刻存檔。步驟：樹與天賦換成 `buildTree`／`buildTalents`；費用 ＝ `respecPrice`，但只有在她已經投過點（`hasSpent`）而且結果和現在不同時才收（重複套用來補符文是免費的），用掉 `freeRespec`；**她自己**插槽裡的符文全部回到袋子，再照 build 的順序、每招前 `socketCount` 個槽，從袋子挑同名最高階鑲上；**隊友身上的一顆都不拿**（8g 裁定 5：按一下不能在玩家沒看到時拿走隊友的符文）；設定跟隨。回傳 `missing`（袋子沒有：寫出哪裡拿得到）與 `later`（槽還沒開或招還沒學：寫出等級）。樹一律用 `buildTree(id, level, b, memoriesOf(m))`（套用與跟隨都一樣）。**套用要確認**（8g 裁定 3 不適用：它花金幣、覆寫整棵樹）：費用 > 0 或樹／天賦會改變時，用旅館重置的 `confirmBox` 問一次，句子寫出費用、「技能樹與天賦會照這套重新分配」、「她身上其他的符文會回到袋子」；兩者都不變（只是補符文）時直接做。
13. **設計者裁定：跟隨中升級**：樹與天賦換成新等級的 `buildTree`／`buildTalents`（跟隨中兩者必然相等，裁定 2）；新開的槽照 build 從袋子補，已經裝著的一顆都不動。板凳上升級的成員也一樣。
14. **設計者裁定：畫面**：新場景 `BuildsScene`（`'builds'`）：旅館多一個「建議配點」、狀態頁技能樹分頁多一個入口（城鎮可以套用；迷宮裡唯讀，寫「回城後才能套用」）。沒在跟隨、而且還有沒投的技能點或天賦點時，技能樹分頁多一行提示「不想自己配？旅館的『建議配點』可以一鍵套用」。工坊標題列下面一行「跟隨：暴走流星——<策略第一句>」；選了一招、她跟隨的 build 對這一招還有沒裝上的建議符文時，符文清單上面一行「缺：點燃（打怪、寶箱掉落）」。理由：8g 留的掛鉤，兩處都只多一行。
15. **設計者裁定：戰鬥的「自動」**：指令列在「全員攻擊」前面加「自動」（`id: 'policy'`），這一回合每位還沒下指令的成員照 `choose(state, party, partyPolicies(party))`（跟隨的 build 的策略，否則標準）；已經下的保留。游標停在「自動」上時，說明列寫出這一回合每個人會做什麼（「諾艾兒：火之星彈（全體・威力 84・火）」；絕技量表滿的人寫「絕技：<名稱>」——量表滿就先放絕技），和按下去的結果是同一個函式。全員攻擊不變。
16. **§13 掛鉤**：`BattleScale.difficulty?: Difficulty`（`'normal' | 'nightmare' | 'hell'`，引擎不讀，`createBattle` 帶或不帶結果逐位元相同）；`engine/bands.ts` `BANDS: Record<Difficulty, readonly string[]>`，`normal` 列出四個平衡檔與 `builds.bands.test.ts`，另兩個空（守門：每個 `balance*.test.ts` 都在 `normal`）；`Lineup.build`（Task 5a）。不改測試名稱（閘門以測試名為鍵）。
17. **控制者裁定落實：調整的範圍與上限（Task 5b）**：槓桿照順序：build 的符文種類、裝在哪一招、順序 → `first`／`sides`／`capstone`／天賦 → 策略規則與門檻 → 專長情境（必須和一句話介紹一致）→ 不在 spec §6.7 表上的符文數字（記 `retune.md`，改釘住它的測試並列出）。不准動：§6.7 的數字、平衡帶、`DEFAULT_POLICIES`、標準樹、模擬會走到的招式與節點數字。**上限**：每套 build 最多 3 輪調整（一輪 ＝ 改一次、跑一次符文帶）；每位夥伴最多換掉 1 套 build（同角色、同精神，記下）；之後還過不了 → BLOCKED 回報。**洛恩的五套由 spec 指定**（HERO_BUILDS 四種＋殘響）：不換；3 輪後「+20%」仍不過就只報告（`it` 照樣跑，但洛恩的列進報告、不進斷言），寫進 `rune-value.md` 給控制者。天花板、單一符文、凍結三條帶任何一條只能靠改 §6.7 的數字才過 → BLOCKED，交回控制者，不自行改。

## Global Constraints

**使用者的方向（最高依據）**
- 「不夠直覺的話我可能會懶的研究 build」：建議 build 一鍵套用、缺什麼直接寫出來（哪一顆、哪裡拿）、策略寫成一兩句人話、「自動」照 build 的正確打法走。「更有深度」和「更好懂」衝突時選好懂（spec §1、§4）。
- 「所以不裝符文頂多過普通」：`engine/balance*.test.ts` 的門檻與種子凍結；普通難度的驗收＝預設配點、沒有符文的模擬；本計畫沒有任何任務可以移動任何量測值（裁定 1）。
- 「任何隊伍組成都要可以用」：build 只改那一位；量測的隊伍其他人一律標準；第 18 項（奇怪隊伍）照舊在閘門裡。
- 「基本上是必須要配點的吧」：平衡只對照預設配點；「符文有價值」帶的對照是標準 build，不是不配點。

**分支與基準**
- `feat/starlantern-story`，HEAD `4b212ce20` 或之後。開工前 `git status`：本計畫要改的檔案有別人未提交的修改，停下來回報 NEEDS_CONTEXT。
- 閘門 `against` 鏈：Task 1 對 `.superpowers/sdd/2026-10-22-starlantern-plan8g-skill-workshop/gate-9c`（8g 最後一個任務閘門）；之後每個任務對前一個任務的 `gate-<N>`。**每個任務都必須 `gate: identical`**，不同就停下來回報 BLOCKED，不准重錄夾具。Task 9 另跑一次對 8d 最終閘門 `.superpowers/sdd/2026-10-21-starlantern-plan8d-tree-rework/gate-10`，並 `cmp` 它的 `contribution.json` 與 `engine/__fixtures__/sim-gate/contribution.8d-final.160.json`。
- 戰力對等：`engine/parity.test.ts` 的 `PARITY_TASK` 維持 `between plans`（`prev: 'contribution.8d-final.160.json'`、`changed: []`）。不覆寫 `engine/__fixtures__/` 底下任何既有檔案；`scripts/starlantern-sim-gate.sh` 不改。
- 亂數：不可以 `Math.random`。策略規則、build 樹、套用、跟隨、「自動」一次都不抽。符文帶的戰鬥用戰鬥自己的 `rng`（新的量測，不是既有的路徑）；`game.rng`、`lootRng` 等串流一次都不多抽。

**測試與檢查**
- TDD：先寫失敗的測試，確認它因正確的理由失敗，再實作。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`。
- 閘門：`rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-23-starlantern-plan8h-builds-policies/gate-<N> <against> > .superpowers/sdd/2026-10-23-starlantern-plan8h-builds-policies/gate-<N>.stdout`（stdout 不寫進閘門自己的 log）。
- 符文帶：`BALANCE_REPORT=1 rtk proxy npx vitest run --testTimeout=3000000 src/scripts/games/starlantern/engine/builds.bands.test.ts > .superpowers/sdd/2026-10-23-starlantern-plan8h-builds-policies/bands-<N>.stdout`（Task 5a 起每個任務的收尾跑一次）。它也在全套裡；整檔超過 6 分鐘就回報，不自己減種子。
- tsc：`rtk proxy npx tsc --noEmit -p .`；starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個（repo 原本約 43 個與本專案無關）。
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`；headless、靜音；只用 4352，絕不用 4354，不結束任何程序。
- **重的工作（閘門、符文帶、e2e）之前**：PowerShell `Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory` 確認 ≥ 6291456 KB（6 GB）；不足就等。一次只跑一套重的測試。
- 本專案沒有 prettier、eslint，不要跑。一次性的探測程式跑完立刻刪，絕不 commit。
- **每個任務的收尾（下稱「收尾 G」）**：(1) 全套全綠、tsc 0；(2) 記憶體 ≥ 6 GB 後跑閘門，必須 `gate: identical`；(3) Task 5a 起跑符文帶（5a 只報告；5b 起必須全綠）；(4) e2e 全綠；(5) 有畫面的任務把 1280×720、844×390、390×844 的截圖存 scratchpad；(6) 報告：新增的測試名、閘門最後兩行、全套的兩行、e2e 結果、偏離本計畫的地方（含理由）。

**換行（逐檔保留）**：改檔前 `git ls-files --eol <檔案>`；改完 `git diff --stat`，整檔被改寫就是換行壞了。CRLF 檔不可以用 `sed -i`。已知：CRLF：`engine/state.ts`、`engine/save.ts`、`engine/types.ts`、`engine/sim.ts`、`ui2/menu.ts`、`ui2/scenes/status.ts`、`ui2/scenes/guild.ts`、`data/skills.ts`；LF：`engine/policy.ts`、`data/policies.ts`、`data/trees.ts`、`engine/progression.ts`、`engine/mech.ts`、`engine/mechanics/*.ts`、`engine/runes.ts`、`engine/sockets.ts`、`ui2/scenes/statusTabs.ts`、`ui2/scenes/workshop.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`；混用（新行照相鄰行）：`engine/battle.ts`、`engine/skills.ts`、`engine/combatant.ts`、`engine/game.ts`、`data/text.zh-TW.ts`、`ui2/widgets.ts`、`ui2/scene.ts`、`ui2/main.ts`、`ui2/scenes/battle.ts`、`ui2/scenes/inn.ts`。其他檔動手前先查。新檔一律 LF。

**git**：完整路徑 add，不可以 `git add -A`／`git add .`。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。絕對不可以 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。不 push。

**介面與文字**
- 介面字放 `data/text.zh-TW.ts`（新的 `T.build`、`T.ui2.builds`）；build 的名稱與一句話放 `data/builds.ts`（同招式名稱的先例）。**字串裡不手打數字**：等級、百分比、價錢一律由資料傳入（Task 9 掃描守門）。全形標點、不用「……」；名稱與一句話照 spec §16 的角色語氣（《文風聖經》§3）。符文一律寫「名稱（階級）」或只寫名稱（缺的時候不指定階級）。
- SCSS 只在 `src/styles/_starlantern-ui.scss`；禁 `!important`、禁行內樣式（含 `element.style`、`style` 屬性）。
- 沒有新的美術：不放佔位圖、不用 CSS 畫形狀當圖示；`◆○` 是文字（第 ⑨ 步才換圖示）。
- 選單、按鍵、滑鼠照其他 ui2 畫面：↑↓、Enter、Esc／右鍵、Tab、Q/E 換人、滑過移游標、觸控第一下選第二下做（`equip.ts` 的 `armed`）、`backControl`；`[inert]` 底下不接受點擊。
- 版面：1280×720、844×390、390×844 下每一個視窗都在舞台裡，每一列 `scrollWidth <= clientWidth + 0.5`（e2e 量）；長清單用游標捲動，不出現原生捲軸。

**測試修改規則**：各任務 Files 列出已知會紅的既有測試，只照新形狀補並在報告逐則列出；全套跑出沒列到的紅燈就停下來回報 NEEDS_CONTEXT。`it.fails`、`it.skip`、`.only`、`.todo` 不可以出現在 commit。

**子代理**：實作者不派子代理。

## Review Focus
1. **套用時袋子不夠、或那顆在隊友身上**：只鑲袋子裡有的，隊友的一顆都不動，缺的每一顆寫出哪裡拿；同一套重複套用不再收錢。測試：Task 6 `apply takes only from the bag and names what is missing`、`applying the same build again is free`。
2. **跟隨中手動改點、或升級跨過開槽的等級**：手動改一點就結束跟隨；跟隨中升級的樹等於 `buildTree(新等級)`，新槽從袋子補、舊的不動；板凳成員也照做。測試：Task 6 `a manual point ends following`、`following spends the points and fills new slots at a level-up`。
3. **「自動」遇到已下指令、被凍結、睡著、沒有可重現的招的洛恩、TP 不夠**：已下的保留；整場用「自動」打完，日誌沒有任何 `no-tp`／`no-skill`。測試：Task 8 `auto keeps chosen commands and never picks what the engine refuses`。
4. **舊存檔沒有 `build`、或寫著不存在的 build**：讀得進來、不跟隨、不判損毀。測試：Task 6 `an unknown build id is dropped, not corrupt`。
5. **低等級套用**（Lv 5–19 只有一個槽、招還沒學）：只鑲學會的招的開著的槽，其他的列在 `later` 寫等級，不算「缺」。測試：Task 6 `a low-level apply lists later slots apart from missing runes`。

---

## File Structure
- 新：`data/builds.ts`（build 資料）、`engine/builds.ts`（樹、天賦、插槽、策略表、自動、套用、跟隨、策略句子）、`engine/buildBands.ts`（符文帶的量測）、`engine/bands.ts`（§13 分組）、`ui2/scenes/builds.ts`（`BuildsScene`）。
- 修改：`engine/policy.ts`（新規則）、`engine/sim.ts`（`Lineup.build`／`runeTier`、`lineupPolicies`、`choose` 回傳殘響）、`engine/progression.ts`（`defaultTree`／`defaultTalents` 抽出共用的 `treeFor`／`talentsFor`）、`engine/mechanics/{runes,echo,barrier,index}.ts`、各機制模組的命中收益（觸發不拿）、`engine/skills.ts`（回氣上限、同步帳）、`engine/ledger.ts`、`engine/runes.ts`（`'plain'`）、`data/runes.ts`（回氣句子）、`engine/battle.ts`（`BattleScale.difficulty`）、`engine/types.ts`（`Member.build`）、`engine/save.ts`、`engine/game.ts`、`ui2/scene.ts`＋`ui2/main.ts`、`ui2/scenes/{inn,statusTabs,workshop,battle}.ts`、`ui2/skillCard.ts`、`data/text.zh-TW.ts`、`src/styles/_starlantern-ui.scss`。
- 測試：`engine/policy.test.ts`、`engine/builds.test.ts`、`data/builds.test.ts`、`engine/builds.bands.test.ts`、`engine/buildBands.test.ts`、`engine/builds.guard.test.ts`、`ui2/scenes/builds.test.ts`（新），加上既有的 `engine/runes.battle.test.ts`、`engine/runes.test.ts`、`engine/ledger.test.ts`、`engine/mechanics/*.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`、`engine/sim.test.ts`、`ui2/scenes/{battle,workshop,inn,status}.test.ts`、`ui2/skillCard.test.ts`、`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 策略規則的新種類

**Files:**
- Modify：`engine/policy.ts`、`engine/sim.ts`（`choose` 把規則給的 `echo` 行動原樣交出）
- Test：`engine/policy.test.ts`

**Interfaces:**
- Consumes：`applyPolicy`、`castPower`、`echoOf`／`echoDef`、`MoonPhase`、`Combatant.taunt`／`cover`、`BattleState.barriers`／`moon`。
- Produces（`PolicyRule` 加這些成員；全部純函式、不抽、條件不成立就往下一條）：
  - `{ kind: 'ensure-taunt'; skill: string }`：`c.taunt <= 1` 且可施放 → 施放（不指定目標）。
  - `{ kind: 'ensure-cover'; skill: string }`：她沒有 `cover` 且可施放 → 對「除了她之外、活著、HP 比例最低」的隊友（同分照隊伍順序）施放。
  - `{ kind: 'release-at'; min: number; skill: string }`：`s.barriers` 有 `src === c.key` 而且（`lasting` 或 `turns >= min`）的結界、技能可施放 → 對第一個活著的敵人施放。
  - `{ kind: 'at-phase'; phase: MoonPhase; skill: string }`：`s.moon?.phase === phase` 且可施放 → 施放；目標：單體敵方招給第一個活著的敵人，單體我方招給 HP 比例最低的隊友，其他不指定。
  - `{ kind: 'execute-below'; pct: number; skill: string }`：活著、`hp × 100 < max.hp × pct` 的敵人，先挑她暗記中的、再照順序 → 對它施放。
  - `{ kind: 'cast-unless-last'; skill: string }`：`c.mech?.kind === 'beat'` 而且 `last !== skill`、可施放 → 施放（目標規則同 `at-phase`）。
  - `{ kind: 'cast-when'; skill: string; big?: true; once?: true }`：可施放就施放（目標規則同 `at-phase`）；`big`：只在頭目或菁英還站著時；`once`：這一場她已經施放過這招就不成立（看 `s.log` 裡她的 `act` 事件是否有這招的名稱開頭，或實作者選的等價判斷，不抽、不加狀態欄位）。給蜃樓步、超頻、全面整備、贖火這些自身／全隊招。
  - `{ kind: 'echo' }`：只有洛恩；`rec = echoOf(s, s.round + 1)`（和戰鬥選單的 `echoItem` 同一個），`rec` 有傷害效果、`c.tp >= rec.cost`，而且 `castPower(s, c, echoDef(rec)) × reach` ≥ 他可施放傷害技中同一個量的最大值 → `{ kind: 'echo', rec, target: 第一個活著的敵人 }`。
  - `spend-at` 多一個可省略的 `of: 'maxHp'`：量表值換成 `量表 × 100 / c.max.hp` 再和 `min` 比（給餘燼用）。
  - `strongest-damage` 多一個可省略的 `aoe: true`：排序用 `castPower × reach`（裁定 6，`export function reach(s: BattleState, def: SkillDef): number` 放在 `policy.ts`）。
- [ ] **Step 1：先寫失敗的測試**（`engine/policy.test.ts`，狀態用 `makeBattle`／`makeCombatant` 直接寫欄位）
  - 每一種新規則一個成立、一個不成立的例子（數值寫死）：`ensure-taunt`（`taunt: 2` → null，`taunt: 1` → 施放）；`ensure-cover`（兩位隊友 HP 30%／60% → 目標是 30% 那位；她自己 10% 也不選自己；已有 `cover` → null）；`release-at`（`turns: 2`、`min: 3` → null；`turns: 3` → 施放；別人的結界不算；`lasting` 永遠算）；`at-phase`（滿月 → 施放、上弦 → null、沒有 `moon` → null）；`execute-below`（兩隻 HP 20%，第二隻被暗記 → 打第二隻）；`cast-unless-last`（`last: 'clap'` → null）；`cast-when`（可施放 → 施放；`big` 而場上沒有頭目菁英 → null；`once` 而這場已施放過 → null）；`echo`（紀錄是 70% 之後比他最強的招強 → `{ kind: 'echo', rec }`；比較弱、TP 不夠、沒有紀錄、不是洛恩 → null）；`spend-at of maxHp`（餘燼 40／最大 HP 100、`min: 40` → 施放，39 → 扣住）。
  - `reach counts the foes a cast meets`：`enemies` 對三隻 → 3；單體 → 1；帶彈射（2 次、−30%）對三隻 → 1 + 0.7 + 0.4；對一隻 → 1。
  - `aoe ranks by reach, the default does not`：火之星彈＋擴散 vs 冰之星彈對三隻：`aoe` 選前者；同一個狀態的 `choose(s, party)`（預設策略）結果和本任務之前相同（逐一寫死）。
  - `no new rule is in the default policies`：`DEFAULT_POLICIES` 的每一條 `kind` 都在 8a 的七種裡、沒有 `aoe`／`of`。
  - 既有的 `no rule fires without a mechanic`、`rules draw nothing` 保持綠。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/policy.test.ts`。
- [ ] **Step 3：實作**（照 Interfaces；`choose` 的 `out[c.key] = action` 原樣接受 `echo`）。
- [ ] **Step 4：確認通過**：Step 2 加 `engine/sim.test.ts`、`engine/battle.test.ts` 全綠。
- [ ] **Step 5：收尾 G**（`gate-1`，against 8g `gate-9c`）。
- [ ] **Step 6：commit**：`feat(starlantern): policy rules for builds — taunt, cover, release, moon phase, execute, beat, cast-when, echo, and ranking by reach`。

### Task 2: ⑧ 的平衡項目：殘響、觸發、回氣、常駐雷擊、同步的帳

**Files:**
- Modify：`engine/mechanics/runes.ts`（`runTriggers` 只打一般效果、`castDef` 留下未加成的效果）、`engine/mechanics/echo.ts`、`engine/mechanics/{coins,aim,mark}.ts`（各自的 `onHit`：觸發的一擊不拿）、`engine/battle.ts`（殘響設 `ctx.paid`）、`engine/skills.ts`（回氣上限；`EffectContext.triggered`、`EffectContext.lift`）、`engine/ledger.ts`、`engine/mechanics/barrier.ts`＋`engine/mech.ts`（`Barrier.lastingPct`）、`engine/runes.ts`（`RuneMiss` 加 `'plain'`）、`data/runes.ts`（回氣的句子）、`data/text.zh-TW.ts`（`T.rune.why.plain`「需要：傷害、治療或增益這類一般效果（觸發不會打出結界、裝置這些機制）」、回氣句子的上限）
- Modify（會紅的既有測試）：`engine/runes.battle.test.ts` 裡觸發施放「機制招不花資源」那幾則（改成「機制效果不出現」）、觸發符文裝在結界／裝置招上的例子；`engine/runes.test.ts`／`data/runes.test.ts` 釘住回氣整句的斷言。
- Test：`engine/runes.battle.test.ts`、`engine/ledger.test.ts`、`engine/mechanics/echo.test.ts`、`engine/mechanics/barrier.test.ts`、`engine/runes.test.ts`

**Interfaces:**
- Consumes：`PLAIN`（`echo.ts`，改成 export）、`creditPrevented` 的「同一組抽骰重算」做法、`ctx.paid`。
- Produces：
  - 裁定 11a：`echoOf(s)?.def` 的效果等於「同一次施放沒有同步」的效果（雙人舞的加成留著）；做法由實作者決定（例：`castDef` 在 `runeRules` 留同步之前的效果，`echo.after` 用它）。
  - 裁定 11b：`runTriggers` 施放 `def` 的 `PLAIN` 效果；`EffectContext.triggered?: true` 在觸發施放期間成立（施放完清掉）；`coins.onHit` 不加銅板、`aim.onHit` 不動層數與目標、`mark.onHit` 不用掉 `nextCrit`——但 `pruneMarks` 與擊倒時的 `payAppraisal` 照做；`runeFits` 對觸發群組：招式沒有任何 `PLAIN` 效果（看裝符文之前的 `def`）→ miss `'plain'`。
  - 裁定 11c：一個行動裡回氣回復的總和不超過 `ctx.triggered ? 0 : (ctx.paid ?? 0)`（雙重詠唱兩次合計）；`perform` 的 `echo` 分支設 `ctx.paid = rec.cost`；血之代價的 `paid` 是 0。
  - 裁定 11d：`Barrier.lastingPct?: number`（`applyLasting` 寫入常駐的效果百分比）；雷之結界的回合末雷擊一次，威力 × 在場結界中最高的百分比（`lastingPct ?? 100`）／100。
  - 裁定 11e：`EffectContext.lift?: { by: string; pct: number; raw: Effect[] }`：被同步加成的那一次施放期間成立，`raw` 是加成之前的效果；帳本對每一擊／每一次回復，給予者記 `loss(有加成) − loss(用 raw 的威力、同一組 HitRolls 重算)`，施放者記其餘。沒有帳本時什麼都不算。
  - 裁定 9 的帳本分項：`Ledger.bySkill?`（`newLedger({ bySkill: true })` 才有）：玩家方一般施放（`ctx.cast` 有值、不在觸發、殘響、回聲裡）的傷害／回復／防止／護盾記到 `bySkill[ctx.cast]`，`perform` 的 `skill` 分支每施放一次 `casts += 1`。沒有它時帳本與之前逐位元相同。
- [ ] **Step 1：先寫失敗的測試**
  - `the echo does not copy a sync`（`echo.test.ts`）：A 帶同步施放，B 的火之星彈被加成 30%；`echoOf(s).def` 的威力等於 B 沒被加成時的威力；洛恩殘響打出的傷害 ＝ 那個 ×70%（寫死數字）。`the echo keeps a duet`：B 的招被雙人舞加成時，紀錄留著那個加成。
  - `a triggered cast takes nothing and gives nothing`（`runes.battle.test.ts`；每一則先確認在本任務之前是紅的）：觸發的順手牽羊：沒有「多拿 2 枚」、每段命中也不加銅板（`coins.onHit`）；希爾薇觸發的箭打到別的敵人：瞄準層數與目標不變（`aim.onHit`）；凜有 `nextCrit` 時觸發的一擊：`nextCrit` 還在（`mark.onHit`）；觸發的挑釁・高喊：有挑釁、沒有餘燼（機制種類的效果）。帳務照舊：觸發的一擊擊倒暗記目標 → 暗記照樣清掉（`pruneMarks`）；擊倒被估價的敵人 → 估價加倍照付（`payAppraisal`）。手動施放同一招照舊會拿（回歸）。
  - `regain refunds nothing for a free cast`：觸發的施放（前一個行動付過 TP，`ctx.paid` 還留著）→ 回氣回 0；血之代價＋回氣 → 回 0；殘響重現帶回氣的招 → 回的總和 ≤ `rec.cost`。
  - `a trigger rune needs a plain effect`（`runes.test.ts`）：受擊觸發裝在設置砲台、收回 → miss `'plain'`，`runeWhy` 是 `T.rune.why.plain`；裝在炎環斬 → 生效。
  - `regain never pays more than the cast cost`：每一位角色 Lv 50 每一招能裝回氣的，各配（回氣）、（回氣＋連擊）、（回氣＋雙重詠唱）、（回氣＋連擊＋雙重詠唱），史詩階，對三隻、`constRng` 必中：行動後 TP ≤ 行動前；一段、4 TP 的招配回氣照舊回 1（回歸）。
  - `a lasting barrier's thunder is at the lasting percent`（`barrier.test.ts`）：千鶴有雷之結界、守之結界裝常駐（魔法）→ 回合末雷擊威力 ＝ 節點值 × 60%；手動架的結界照舊 100%；重結界下常駐與手動同時在場 → 只雷擊一次、100%。
  - `a sync's giver is credited with its lift`（`ledger.test.ts`）：給予者的 `damage` ＝ 有加成與用原始威力重算的損失差（同一組抽骰，數字由公式算出；挑一個 `pctOf` 會四捨五入的威力，證明不是除回去）；兩人合計 ＝ 敵人實際損失；回復同理；沒有同步的戰鬥帳本與之前逐位元相同。
  - `the ledger can split by skill`：`newLedger({ bySkill: true })`：一場戰鬥裡 `bySkill` 各項加總 ≤ 成員合計（差的是觸發、殘響、回聲、普通攻擊、絕技），`casts` 等於日誌裡那一招的施放次數；不帶時帳本物件沒有 `bySkill`。
  - `the echo never carries the abyss bonus`：`s.abyss = 20`，殘響的傷害等於紀錄 ×70%（無加成）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/runes.battle.test.ts src/scripts/games/starlantern/engine/ledger.test.ts src/scripts/games/starlantern/engine/mechanics/echo.test.ts src/scripts/games/starlantern/engine/mechanics/barrier.test.ts src/scripts/games/starlantern/engine/runes.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**；`engine/workshop.guard.test.ts`、`ui2/skillCard.test.ts` 也綠（觸發符文的變灰原因、回氣的句子出現在卡片）。
- [ ] **Step 5：收尾 G**（`gate-2`，against `gate-1`）。
- [ ] **Step 6：commit**：`fix(starlantern): rune balance from step ⑧ — the echo skips a sync, a triggered cast neither pays nor gains, regain never profits, a lasting barrier's thunder is lasting, a sync's giver is credited, the ledger can split by skill`。

### Task 3: build 的資料模型、樹、天賦、策略表與策略句子

**Files:**
- Create：`data/builds.ts`（型別、`BUILDS` 只有每位的「標準」）、`engine/builds.ts`、`engine/builds.test.ts`
- Modify：`engine/types.ts`（`Member.build?: string` 只加型別與註解；Task 6 之前沒有任何東西寫它）、`engine/progression.ts`（`defaultTree` → `treeFor(id, level, memories, opts)` 的包裝；`defaultTalents` → `talentsFor(id, level, opts)` 的包裝）、`data/text.zh-TW.ts`（`T.build.rule`：每一種規則一個句子範本；`T.build.standard`「標準」與它的一句話）
- Test：`engine/builds.test.ts`

**Interfaces:**
- Consumes：Task 1 的規則型別；`DEFAULT_POLICIES`、`HERO_BUILDS`、`DEFAULT_CAPSTONE`、`DEFAULT_FIRST`、`DEFAULT_KEYSTONES`、`socketCount`、`socketable`、`learnedSkills`。
- Produces：
  - `data/builds.ts`：`export type BuildScenario = 'boss' | 'crowd' | 'long'`；`export interface BuildDef { key: string; owner: CharacterId; name: string; intro: string; hero?: HeroBuild; first?: string[]; sides?: string[]; capstone?: number; talents?: AnyStat[]; keystones?: KeystoneId[]; runes: Readonly<Record<string, readonly RuneId[]>>; policy: readonly PolicyRule[]; scenario?: BuildScenario }`（`first`：先學的節點；`sides`：取代 A 邊的 B 邊節點；`capstone`：絕技分支；`runes`：每招的建議符文，依槽的順序；`hero`：洛恩用哪個 `HERO_BUILDS` 的樹與天賦）；`export const BUILDS: Record<CharacterId, readonly BuildDef[]>`（第一筆一定是 `key: 'standard'`、`runes: {}`、`policy: DEFAULT_POLICIES[id] ?? []`，洛恩的 `hero: 'balanced'`）；`export function buildOf(id: CharacterId, key: string): BuildDef | undefined`。
  - `engine/progression.ts`：`treeFor(id, level, memories, opts: { first?: string[]; sides?: string[]; capstone?: number })`：`defaultTree` 的同一套順序（到期舊招 → `opts.first` 再接 `DEFAULT_FIRST` → 升級 → 新節點 → 提早的舊招），候選清單裡 `sides` 的 B 邊取代它那一格的 A 邊，絕技分支用 `opts.capstone ?? DEFAULT_CAPSTONE`；`defaultTree(id, level, memories) === treeFor(id, level, memories, {})`。`talentsFor(id, level, opts: { talents?: AnyStat[]; keystones?: KeystoneId[] })`：關鍵天賦 `opts.keystones ?? DEFAULT_KEYSTONES[id]`，一般節點先挑 `talents` 的最低（同 `heroTalents` 的 `lean`），沒有就最低。
  - `engine/builds.ts`：`buildTree(id: CharacterId, level: number, b: BuildDef, memories = 0): Record<string, number>`（洛恩：`heroTree(level, b.hero ?? 'balanced', memories)`）；`buildTalents(id, level, b)`（洛恩：`heroTalents(level, b.hero ?? 'balanced')`）；`buildSockets(m: Member, b: BuildDef, tier: RuneTier): Record<string, (RuneRef | null)[]>`（只取 `socketable(m)` 裡的招、每招前 `socketCount(m.level)` 顆；傳說符文用它唯一的階）；`policyOf(m: Member): readonly PolicyRule[]`（`m.build` 指到的 build，否則 `DEFAULT_POLICIES[m.id] ?? []`）；`partyPolicies(p: Party): PolicyTable`；`policyText(b: BuildDef): string[]`（每條規則一句，`T.build.rule[kind](…)` 帶入技能名、門檻、月相名；空策略是「沒有特別的規則：補血優先，其他時候放最強的招」）。
- [ ] **Step 1：先寫失敗的測試**（`engine/builds.test.ts`）
  - `the standard build is the default build`：每一位角色、等級 1…50：`buildTree(id, L, BUILDS[id][0]) toEqual defaultTree(id, L)`、`buildTalents` 等於 `defaultTalents`；洛恩記憶 0…10 等於 `heroTree(L, 'balanced', m)`；`BUILDS[id][0].policy` `toBe` `DEFAULT_POLICIES[id]`（同一個物件，或兩者都不存在時是 `[]`）。
  - `hero builds follow HERO_BUILDS`：`hero: 'sword'` 的 build 等於 `heroTree(L, 'sword', m)`／`heroTalents(L, 'sword')`。
  - `sides and capstone shape the tree`：諾艾兒 `sides: ['noel-star-heavy']` Lv 50 → 有重星、沒有連星；`capstone: 2` → 有 `judgement`、沒有 `inferno`；每一點都經過 `canRaiseNode`（`validBuild` 為真）。
  - `talents lean as asked`：`talents: ['int']` → 一般節點先吃 int 的；`keystones` 照給的。
  - `sockets fit the level`：Lv 5 → 每招最多 1 顆；沒學會的招不出現；Lv 35 → 照 `runes` 全部。
  - `policy words come from the rules`：一套含 `spend-at`（熱度 4、業火）的 build → 句子含「熱度」「4」「業火」（數字來自資料）；空策略 → 固定那一句。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/builds.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**；`engine/progression.test.ts` 全綠。
- [ ] **Step 5：收尾 G**（`gate-3`，against `gate-2`；`treeFor` 的抽出由閘門證明沒有改變任何標準樹）。
- [ ] **Step 6：commit**：`feat(starlantern): build data — the standard build is the default tree, talents and policy; trees, talents and sockets by build`。

### Task 4: 建議 build 的內容與資料守門

**Files:**
- Modify：`data/builds.ts`（每位兩套符文 build；洛恩五套）
- Create：`data/builds.test.ts`
- Test：`data/builds.test.ts`

**Interfaces:**
- Consumes：Task 3 全部；`runeStates`、`battleReservePct`、`lastingBarrierLoss`、`RUNE_STOCK`、`NODES`、`fromMember`。
- Produces：`BUILDS` 的內容。起點（spec §16 的起始提案，對到現在的招式；Task 5b 可以照裁定 17 改，改了記下）：

| 角色 | key／名稱 | 情境 | 建議符文（招：符文…） | 策略 |
|---|---|---|---|---|
| 諾艾兒 | `meteor` 暴走流星 | crowd | fire-star：spread、ignite、multistrike | spend-at heat 4 inferno；strongest-damage aoe |
| | `cycle` 冰火循環 | boss | ice-star：regain、**multistrike**；fire-star：charge、ignite | spend-at heat 4 ice-star；strongest-damage aoe |
| 千鶴 | `steady` 不動結界 | long | ward：lasting、extend；sweep：multistrike | heal-below 40；strongest-damage aoe |
| | `exorcist` 破邪神槍（`capstone: 2`、雷之結界） | boss | pierce：thunderclap、jolt、**multistrike**；heaven-spear：charge | ensure-barrier [ward]；release-at 3 heaven-spear；strongest-damage aoe |
| 莉茲 | `jackpot` 一擲千金 | crowd | twin-slash：multistrike、regain | spend-at coins 8 jackpot；strongest-damage aoe |
| | `bleed` 撕裂快刀 | boss | twin-slash：tear、multistrike；pickpocket：tear | strongest-damage aoe |
| 希爾薇 | `heart` 一箭穿心 | boss | heart-shot：charge、armor-break；**aimed-shot：thrift** | spend-at aim 3 starfall-arrow；strongest-damage aoe |
| | `wildfire` 燎原箭雨（`capstone: 2`） | crowd | arrow-rain：flame、ignite、multistrike | strongest-damage aoe |
| 絲嘉蕾 | `riposte` 反擊之壁（`capstone: 2`） | long | blaze-ring：on-struck、flame…（依 fit）；provoke：extend | ensure-taunt provoke；cast-when atoning-flame big；strongest-damage aoe |
| | `ember` 紅蓮餘燼（熾心、回禮、赤心） | boss | crimson-end：charge；cover：extend | ensure-cover cover；spend-at embers 40 of maxHp crimson-end；strongest-damage aoe |
| 瑟蕾 | `fullmoon` 滿月聖女（`capstone: 1`） | long | moonlight：spread、dispel | cast-when full-moon-night big once；at-phase waning moon-recall；at-phase full full-moon；heal-below 60；strongest-damage aoe |
| | `nightmare` 新月夢魘（`capstone: 2`） | crowd | dream：venom、extend | at-phase new dream；strongest-damage aoe |
| 莎菲拉 | `fourbeat` 四拍劍舞（`capstone: 2`） | boss | blade-dance：tear、multistrike | cast-when mirage-step once；alternate repeat；strongest-damage aoe |
| | `festival` 祭典指揮（`capstone: 1`、`first` 含 `safira-clap-encore`） | long | war-dance：lasting；clap：extend…（依 fit） | cast-unless-last clap；alternate repeat |
| 波比 | `factory` 砲台工廠 | long | turret：multistrike、extend | ensure-device [turret]；cast-when overclock big；strongest-damage aoe |
| | `grid` 電網（`capstone: 2`） | crowd | tesla-coil：extend；shock-mine：extend | ensure-device [tesla-coil, shock-mine, barrier]；strongest-damage aoe |
| 凜 | `silent` 無聲處決 | boss | rin-needle：on-kill、multistrike；rin-execute：charge | ensure-mark rin-mark；execute-below 35 rin-execute；strongest-damage aoe |
| | `venom` 千針毒（`capstone: 0`） | crowd | rin-storm：venom、tear、**multistrike** | strongest-damage aoe |
| 洛恩 | `sword`／`mage`／`healer`／`tank`（`hero`＝同名） | boss／crowd／long／long | 各自的主招：sword hero-slash：multistrike、tear；mage hero-flare：spread、ignite；healer hero-mend：spread、dispel；tank hero-guard：extend、share | 各自 strongest-damage aoe（healer 先 heal-below 60；tank 先 ensure-taunt） |
| | `echo` 殘響（`hero: 'balanced'`） | boss | hero-slash：regain、**multistrike** | echo；strongest-damage aoe |

（「依 fit」：表上那顆裝不上時換成同精神、裝得上的一顆並記下。一句話介紹照 spec §16 的句子改寫成角色語氣，不寫數字。）

**設計者裁定（店裡賣的那一顆，粗體）**：冰火循環的冰之星彈加連擊（多一段就多回一次氣，冷卻更快）；破邪神槍的貫槍加連擊（多一段就多一次感電的機會）；一箭穿心在瞄準射擊加節流（便宜地疊瞄準，留 TP 給穿心箭與星墜一矢）；千針毒的千針加連擊（多一段就多一次撕裂）；殘響的劍技加連擊（自己出手時多段回氣，留 TP 給殘響）。理由：每套都要有一顆在歐里克的店買得到（Task 4 守門、文末衝突 2），而這四顆裡挑和這套精神一致的那顆。
**設計者裁定（無聲處決的一句話）**：觸發在「還有。」之後才結算，所以介紹不能承諾「觸發接著還有。」；寫成「先暗記，處決收尾；倒下的時候，飛針會自己追出去。」這類只講擊倒觸發本身的句子。
**涵蓋 8c／8d 沒量到的招**（裁定 11k）：贖火（反擊之壁）、收回與滿月之夜（滿月聖女）、蜃樓步（四拍劍舞）、拍手與安可（祭典指揮）、超頻（砲台工廠）、護盾產生器（電網）、代受與赤心（紅蓮餘燼）、一擲千金（一擲千金）；全面整備是波比沒有 build 選的絕技分支，列例外表。
- [ ] **Step 1：先寫失敗的測試**（`data/builds.test.ts`）
  - `every character has a standard and two rune builds`：夥伴各 3 筆、洛恩 6 筆；`key` 在同一人內唯一；只有 `standard` 的 `runes` 是空的、沒有 `scenario`；其他每一筆都有 `scenario`。
  - `every suggested rune works where it goes`：每一套符文 build，Lv 35 與 50 的 `fromMember`（`buildTree`／`buildSockets(…, 'magic')`）：每一顆的 `runeStates` miss 都是 null；`sides`／`first` 都是本人的節點、`sides` 都是 B 邊；`capstone` 在範圍內；策略裡每一個技能 id 都在這套 build Lv 35 學會的招裡。
  - `the TP held for battle stays in reach`：每一套的 `battleReservePct ≤ RESERVE_CAP`；`lastingBarrierLoss === 0`（裁定 11f）。
  - `every rune build can start from the shop`：每一套符文 build 至少一顆在 `RUNE_STOCK`（spec §6.5，見文末衝突）。
  - `each build's words`：`name`、`intro` 非空、不含阿拉伯數字；`policyText` 每句非空。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/builds.test.ts`。
- [ ] **Step 3：實作**（填表；不相容就照「依 fit」換）。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-4`，against `gate-3`）。
- [ ] **Step 6：commit**：`feat(starlantern): two suggested rune builds per character, five for the hero, each with its runes and its way to fight`。

### Task 5a: 模擬穿上 build、§13 掛鉤、量測與報告（不斷言）

**Files:**
- Modify：`engine/sim.ts`（`Lineup.build?: Partial<Record<CharacterId, string>>`、`Lineup.runeTier?: RuneTier`；`partyAt` 穿 build；`export function lineupPolicies(l: Lineup): PolicyTable | undefined`；`winRate` 用它）、`engine/battle.ts`（`export type Difficulty`、`BattleScale.difficulty?`）
- Create：`engine/buildBands.ts`、`engine/bands.ts`、`engine/builds.bands.test.ts`（本任務只有量測與報告的 `it`）；SDD `rune-value.md`
- Test：`engine/sim.test.ts`、`engine/buildBands.test.ts`（新）

**Interfaces:**
- Consumes：Task 2 的 `Ledger.bySkill`；Task 3、4；`kitParty`、`simBattle`、`newLedger`、`totalOf`、`parityDepth`、`parityLineups`、`encounterTable`、`expectedEnhance`、`ENHANCE_MAX`、`setSimTrace`、`balance.test.ts` 的 `DEEP` 那一組 `Lineup`（抽成可匯入的常數或照抄同值，抄的話加一則相等測試）。
- Produces：
  - `partyAt`：`lineup.build?.[id]` 有值時，樹 ＝ `buildTree`、天賦 ＝ `buildTalents`、`sockets` ＝ `buildSockets(m, b, lineup.runeTier ?? 'magic')`；同時給了 `lineup.runes[id]` 時，插槽以 `runes` 為準（單一符文探測用）；洛恩的列與武器照 `HERO_BUILDS[b.hero]`（呼叫端把 `heroBuild` 設成 `b.hero`）。`lineupPolicies`：`lineup.policies` 優先；否則有 `build` 時 ＝ `DEFAULT_POLICIES` 覆上各人 build 的策略；都沒有 → undefined。
  - `engine/buildBands.ts`：`export const BUILD_LEVELS = [35, 50] as const`；`export const BUILD_SEEDS = { boss: 40, crowd: 10, long: 10 } as const`；`export const RUNE_VALUE_PCT = 20`；`export const ONE_RUNE_MAX = 1.6`；`export interface BuildRun { perRound: number; rate: number; rounds: number; bySkill: Record<string, { total: number; casts: number }>; minBossRounds: number; bossFrozen: number }`；`export function scenarioFights(s: BuildScenario | 'general', level: number): { enemyIds: string[]; boss: boolean; scale: BattleScale; seeds: number }[]`（裁定 7；`general` ＝ 戰力對等的那一格：本道每一組＋頭目、每場 10 個種子）；`export function measureBuild(owner: CharacterId, lineup: Lineup, s: BuildScenario | 'general', level: number, seen?: Set<string>): BuildRun`（`kitParty(level, depth, 1, undefined, expectedEnhance(depth), { ...lineup, ids, expect: true })`，一本帶 `bySkill` 的帳本，主人每回合貢獻；`SimTrace` 數頭目被凍結的回合；給了 `seen` 就把每一回合 `kind: 'skill'` 的技能 id 與 `'echo'` 加進去）；`export function measureCeiling(owner, key, depth, lineup: 'plain' | 'deep'): number[]`（裁定 8，每個種子的回合數）；`export function buildLineup(owner, key, tier?): Lineup`（她的 `parityLineups` 那一支、`build: { [owner]: key }`、洛恩的 `heroBuild`）。
  - `engine/bands.ts`：`export const BANDS: Record<Difficulty, readonly string[]>`（裁定 16）。
  - 報告行（`BALANCE_REPORT=1`）：`[builds] <owner>/<key> Lv<L> <情境> standard <x> build <y> (+p%) bare <z> win <a>/<b>`、`[builds] ceiling <owner>/<key> d<D> <plain|deep> min <n>`、`[builds] one-rune <owner>/<key> <skill>+<rune> <ratio> casts <a>/<b>`、`[builds] uncast <skill ids>`。
- [ ] **Step 1：先寫失敗的測試**
  - `engine/sim.test.ts`：`a lineup wears a build`：`partyAt(35, buildLineup('noel', 'meteor'))` 的諾艾兒樹 ＝ `buildTree`、火之星彈插槽 ＝ 三顆魔法階；`lineupPolicies` 的 noel 是那套策略、其他人是 `DEFAULT_POLICIES`；沒有 `build` 的 `partyAt` 與本任務之前逐欄相同。`difficulty is carried and read by no one`：`createBattle` 帶 `difficulty: 'nightmare'` 與不帶，`JSON.stringify` 相同。`every balance file is a normal band`：`readdirSync` 的每個 `balance*.test.ts` 都在 `BANDS.normal`。
  - `engine/buildBands.test.ts`（小規模，寫死）：`scenarioFights` 對 Lv 35 的三種情境與 `general` 給出的組數、`elite`、種子數；`measureBuild` 對一套 build 跑兩次結果相同（決定性）、`bySkill` 的 `casts` 等於 trace 裡那一招的施放數。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/sim.test.ts src/scripts/games/starlantern/engine/buildBands.test.ts`。
- [ ] **Step 3：實作**；`builds.bands.test.ts` 本任務只放 `it('reports every rune band number')`：跑全部量測、印報告行、只斷言「每套 build 每個等級都量到了」（不比門檻）。
- [ ] **Step 4：確認通過**；跑符文帶到 `bands-5a.stdout`，把每一行抄進 SDD `rune-value.md`（每套 build × 等級：標準、build、不裝符文、勝率；天花板兩種跑法每一場的最少回合；單一符文每一個比值與兩邊施放次數；凍結次數；沒被施放的招；裁定 11k 那些招的施放次數與每次的貢獻；裁定 11i 安可的數字）。這一份是調整前的基準，給控制者看。
- [ ] **Step 5：收尾 G**（`gate-5a`，against `gate-4`）。
- [ ] **Step 6：commit**：`test(starlantern): the sim wears a suggested build; rune band measurements, reported (plan 8h)`（內文附 `rune-value.md` 的摘要表）。

### Task 5b: 符文帶的斷言與調整

**Files:**
- Modify：`engine/builds.bands.test.ts`（斷言）、`data/builds.ts`（調整）、必要時 `data/runes.ts`（裁定 17 的最後一個槓桿）；SDD `retune.md`、`rune-value.md`
- Test：`engine/builds.bands.test.ts`

**Interfaces:**
- Consumes：Task 5a 全部。
- [ ] **Step 1：先寫斷言**（`engine/builds.bands.test.ts`，timeout 3_000_000）
  - `a suggested build at magic is worth a fifth more in its own fight`（spec §12.4）：每一套夥伴的符文 build、每個 `BUILD_LEVELS`：`build.perRound ≥ standard.perRound × (100 + RUNE_VALUE_PCT) / 100`、`build.rate ≥ standard.rate`；失敗訊息列出全部數字。洛恩的五套照裁定 17：量、報告，不斷言（`REPORT_ONLY` 清單只能放洛恩的 key，守門一則）。
  - `the strongest builds still never one-round a boss`（裁定 8；兩種跑法）。
  - `no single rune is the one right answer`（裁定 9；兩邊施放次數都 > 0）。
  - `a boss is never frozen`（裁定 10）。
  - `every node 8c and 8d left unmeasured is cast by some build`（裁定 11k）：每一套符文 build 在自己的情境、Lv 50 跑 `measureBuild(…, seen)`；清單 `cover, atoning-flame, clap, mirage-step, barrier, overclock, emergency-repair, moon-recall, full-moon-night, jackpot`，另加赤心（`flame-burst` 在學了 `scarlet-burst-heart` 的 build 裡被施放）：每一個都在 `seen` 裡，或在 `UNCAST` 例外表裡（每一條必須是本人沒有任何 build 選的絕技分支的絕技，附一句理由）。
  - `安可 is measured by its build`（裁定 11i）：祭典指揮的 `sides`／`first` 含 `safira-clap-encore`、它的 `buildTree(35)` 學會了它，且 `seen` 含 `clap`。
- [ ] **Step 2：執行，看哪些紅**：`BALANCE_REPORT=1 rtk proxy npx vitest run --testTimeout=3000000 src/scripts/games/starlantern/engine/builds.bands.test.ts > …/bands-5b-0.stdout`。
- [ ] **Step 3：調整到全綠**：照裁定 17 的順序與上限（每套最多 3 輪、每位夥伴最多換 1 套；洛恩只報告；天花板、單一符文、凍結只能靠 §6.7 才過 → BLOCKED）。每一輪記 `retune.md`（改了什麼、前後數字），`rune-value.md` 更新為最後的數字。
- [ ] **Step 4：確認通過**：符文帶全綠；`data/builds.test.ts` 仍綠（改過的 build 仍要有店裡賣的那一顆）。
- [ ] **Step 5：收尾 G**（`gate-5b`，against `gate-5a`；符文帶 `bands-5b.stdout`）。
- [ ] **Step 6：commit**：`test(starlantern): rune bands — a suggested build is worth a fifth more, the ceiling holds, no rune is the one answer, no boss freezes, every unmeasured node is cast`。

### Task 6: 存檔欄位、一鍵套用、跟隨

**Files:**
- Modify：`engine/save.ts`（`Member.build` 的驗證與修復；型別在 Task 3）、`engine/builds.ts`（`applyBuild`、`followUp`、`runeSource`）、`engine/game.ts`（`canApplyBuild`、`applyBuild`、`stopFollowing`；`raiseNode`／`swapPair`／`raiseTalent`／`respec` 結束跟隨；戰鬥結算的經驗之後跑 `followUp`）、`data/text.zh-TW.ts`（`T.build.from`：`shop`「道具店有賣」、`drop`「打怪、寶箱掉落」、`legendary`「菁英、頭目掉落」；`T.build.missing(name, from)`「缺：{name}（{from}）」；`T.build.later(name, lv)`「{name}：Lv {lv} 起」；`T.build.followEnded(name)`）
- Test：`engine/builds.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`

**Interfaces:**
- Consumes：Task 3；`respecPrice`、`hasSpent`、`returnOrphanRunes`、`socketRune`、`unsocketRune`、`bagCount`、`tiersOf`、`RUNE_STOCK`、`awardExp`。
- Produces：
  - `export interface MissingRune { skill: string; id: RuneId; from: 'shop' | 'drop' | 'legendary' }`；`export interface LaterRune { skill: string; id: RuneId; level: number }`；`export function runeSource(id: RuneId): MissingRune['from']`。
  - `export function applyBuild(s: GameState, id: CharacterId, key: string): { ok: true; state: GameState; cost: number; placed: RuneRef[]; missing: MissingRune[]; later: LaterRune[] } | { ok: false; reason: 'invalid' | 'gold' }`（裁定 12；不改 `s`；`later` 的等級：槽沒開 → 下一個 `RUNE_SLOT_LEVELS`，招沒學 → 這套 build 第一次學會它的等級）。
  - `export function followUp(s: GameState, ids: readonly CharacterId[]): GameState`（裁定 13；樹用 `buildTree(id, level, b, memoriesOf(m))`，套用也一樣；不跟隨的成員原封不動，沒有變化時傳回同一個物件）。
  - 存檔：`build` 存在時必須是本人 `BUILDS` 裡的 `key`（不含 `standard` 以外的限制）；不合法 → 修復時刪掉（不判損毀），照 `repairRuneFields` 的做法。`SAVE_VERSION` 不變（可省略欄位，同 8e 的符文欄位）。
  - `Game.applyBuild(id, key)`：`phase !== 'town'` → `invalid`；成功立刻存檔（同 `respec`）。`Game.canApplyBuild(id, key): { cost: number; reason: 'invalid' | 'gold' | null }`。`Game.stopFollowing(id)`。
- [ ] **Step 1：先寫失敗的測試**
  - `apply takes only from the bag and names what is missing`：Lv 35 的諾艾兒、袋子有擴散（普通）與擴散（稀有）、凜身上有點燃：套用暴走流星 → 擴散（稀有）在槽 0、袋子剩擴散（普通）；點燃在 `missing`（`from: 'drop'`）、凜的點燃沒動；連擊 `from: 'shop'`；她原本槽裡的符文先回袋子（被這套用上的就再鑲回）。
  - `applying the same build again is free`：第一次收 `respecPrice`（有 `freeRespec` 時 0 並用掉）；再套用同一套 → `cost: 0`、金幣不變；沒投過點的成員 → 0。
  - `a low-level apply lists later slots apart from missing runes`：Lv 10 → 每招只鑲第一顆，其他在 `later`（`level: 20`／`35`），不在 `missing`。
  - `a manual point ends following`（`game.test.ts`）：套用後 `build === 'meteor'`；`raiseNode`／`swapPair`／`raiseTalent`／`respec` 任一成功 → `build` 不見、`notice` 是 `followEnded`。
  - `following spends the points and fills new slots at a level-up`：跟隨中從 Lv 19 升到 20：樹 ＝ `buildTree(20)`、天賦 ＝ `buildTalents(20)`、新開的槽從袋子鑲上建議的那顆、原本的不動；袋子沒有就空著；板凳成員（半份經驗）升級也一樣；不跟隨的成員一點都沒有被花。
  - `an unknown build id is dropped, not corrupt`（`save.test.ts`）：`build: 'nope'` 或別人的 key → 讀得進來、`build` 不見；沒有 `build` 的舊存檔逐欄不變。
  - `apply is town only`：`map`、`battle` → `invalid`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/builds.test.ts src/scripts/games/starlantern/engine/save.test.ts src/scripts/games/starlantern/engine/game.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-6`，against `gate-5b`）。
- [ ] **Step 6：commit**：`feat(starlantern): apply a suggested build in one step — tree, talents and the runes in the bag; what is missing says where to find it; follow it at level-ups`。

### Task 7: 建議配點的畫面、工坊的兩行

**Files:**
- Create：`ui2/scenes/builds.ts`、`ui2/scenes/builds.test.ts`
- Modify：`ui2/scene.ts`＋`ui2/main.ts`（`'builds'`）、`ui2/scenes/inn.ts`（指令「建議配點」接在「重置配點」後）、`ui2/scenes/statusTabs.ts`（技能樹分頁的入口與提示）、`ui2/scenes/workshop.ts`（標題列下的跟隨行、符文清單上的「缺」行）、`data/text.zh-TW.ts`（`T.ui2.builds`：標題、`following`、`follow`、`stopFollow`、`apply(cost)`、`applyFree`、`applied`、`townOnly`「回城後才能套用」、`askApply(name, build, cost)`（確認句：費用或「免費」、「技能樹與天賦會照這套重新分配」、「她身上其他的符文會回到袋子」）、`scenario`（三種情境的字）、`have`／`lack` 記號說明、`unspentHint`「不想自己配？旅館的『建議配點』可以一鍵套用」；`T.ui2.inn.builds`；`T.ui2.workshop.following(name, line)`）、`src/styles/_starlantern-ui.scss`（`.slx-builds` 一節）、`tests/e2e/starlantern.spec.ts`
- Modify（會紅的既有測試）：`ui2/scenes/inn.test.ts` 的指令清單。
- Test：`ui2/scenes/builds.test.ts`、`ui2/scenes/inn.test.ts`、`ui2/scenes/status.test.ts`、`ui2/scenes/workshop.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 3 的 `BUILDS`、`policyText`；Task 6 的 `Game.applyBuild`／`canApplyBuild`／`stopFollowing`、`applyBuild` 的 `missing`／`later`（預覽在狀態副本上跑，同 8g `previewOf` 的做法）；`nodeName`、`T.rune.label`。
- Produces：
  - `BuildsScene`（`ctx.arg` ＝ 成員 id；Q/E 換人，城鎮 `recruited`、迷宮 `activeIds`）：左欄 build 清單（跟隨中的那套名稱後面「跟隨中」）；右欄卡片：名稱、一句話、情境、策略句子（`policyText`）、樹的重點（選邊的節點與絕技分支名稱）、每招的建議符文一行（`◆` 已鑲或袋子有、`○` 缺並寫 `T.build.missing`、槽未開寫 `T.build.later`）、費用行；底部「套用」（城鎮；在迷宮變灰並寫 `townOnly`）、跟隨中的那套是「停止跟隨」。套用照裁定 12：費用 > 0 或樹／天賦會改變時先 `confirmBox(askApply…)`（旅館重置的做法），否則直接做；結果訊息寫鑲了幾顆、缺幾顆。Esc 回來處。
  - 狀態頁技能樹分頁：不跟隨而且 `skillPointsLeft > 0` 或 `talentPointsLeft > 0` 時多一行 `unspentHint`（裁定 14）。
  - 工坊：成員跟隨某套 build 時，標題列下一行 `following(名稱, policyText 第一句)`；選了一招、而那套 build 對這一招還有沒鑲上的建議符文時，符文清單上面一行 `T.build.missing(…)`（多顆用「、」接）。
- [ ] **Step 1：先寫失敗的測試**
  - `ui2/scenes/inn.test.ts`：`the inn opens the suggested builds`。
  - `ui2/scenes/builds.test.ts`：`the card says what the build does and what is missing`（Lv 35 諾艾兒、袋子只有擴散 → 擴散 `◆`、點燃 `○` 加「打怪、寶箱掉落」、策略句子含業火）；`apply in town, read-only in the labyrinth`（城鎮 Enter：會改樹或收錢 → 先出確認框，句子含費用與「回到袋子」，選否什麼都不變、選是 → `game.applyBuild` 被叫、訊息、跟隨中；只補符文（樹不變、免費）→ 不問直接做；`map` → 按鈕變灰、`townOnly`、Enter 只播錯誤音）；`stop following`；`Q/E and Esc`。
  - `ui2/scenes/status.test.ts`：`unspent points point to the suggested builds`：不跟隨、有點數 → 有提示；跟隨中或點數用完 → 沒有。
  - `ui2/scenes/workshop.test.ts`：`the workshop names the followed build and the missing runes`：跟隨暴走流星、火之星彈缺點燃 → 標題下有那一行、符文清單上有「缺：點燃（…）」；不跟隨 → 兩行都沒有。
  - e2e `a suggested build applies from the inn, then the workshop shows what is still missing (plan 8h)`：存檔 Lv 35 的諾艾兒、袋子擴散（魔法）；旅館 → 建議配點 → 暴走流星 → 套用 → 確認框選是；`sockets['fire-star'][0]` 是擴散；工坊打開火之星彈看到「缺：」；三種尺寸每個視窗在舞台裡、每一列不溢出；沒有 console 錯誤。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/builds.test.ts src/scripts/games/starlantern/ui2/scenes/inn.test.ts src/scripts/games/starlantern/ui2/scenes/workshop.test.ts`。
- [ ] **Step 3：實作**（版面照工坊的格線與字級，e2e 決定成敗）。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-7`，against `gate-6`；三種尺寸截圖，含最長的 build 卡片）。
- [ ] **Step 6：commit**：`feat(starlantern): the suggested builds screen — what each does, what is missing, apply and follow; the workshop names the build and the runes it still lacks`。

### Task 8: 戰鬥的「自動」與施放時的摘要

**Files:**
- Modify：`engine/builds.ts`（`autoActions`）、`ui2/scenes/battle.ts`（指令 `policy`；`noteOf` 與 `echoItem` 的摘要吃 `castDef`）、`ui2/skillCard.ts`（`battleLine` 不變；新增 `autoLine(s, party, who): string`）、`data/text.zh-TW.ts`（`T.cmd.policy`「自動」、`T.cmd.policyNote(parts)`、`T.cmd.policyPart(name, what)`「{name}：{what}」）
- Modify（會紅的既有測試）：`ui2/scenes/battle.test.ts` 斷言指令清單的地方；斷言諾艾兒有熱度時摘要數字的地方（若有）。
- Test：`engine/builds.test.ts`、`ui2/scenes/battle.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：`choose`、Task 3 的 `partyPolicies`、`battleLine`、`castDef`、`echoDef`。
- Produces：
  - `export function autoActions(s: BattleState, p: Party, who: readonly string[]): Record<string, Action>`：`choose(s, p, partyPolicies(p))` 只留 `who` 的鍵。
  - 戰鬥指令：「自動」在「全員攻擊」前；選了 → 還沒下指令的 `actors()` 用 `autoActions` 補上（已下的保留），然後送出；說明列 ＝ `autoLine`：每位還沒下指令的人一段「名字：招名（`battleLine(castDef(…))`）」或「攻擊」「殘響：招名」「絕技：名稱」（量表滿的人，`choose` 先放絕技）。
  - `noteOf(sk)`：摘要用 `castDef(this.state, actor, this.withAbyss(sk))`（裁定 11h）。
- [ ] **Step 1：先寫失敗的測試**
  - `engine/builds.test.ts`：`auto keeps chosen commands and never picks what the engine refuses`：標準隊伍每人跟隨第一套符文 build、Lv 35、本道深度 9 第一組＋頭目：每回合先手動給第一位一個指令，其他用 `autoActions`，`resolveRound` 打完整場：日誌沒有 `no-tp`、`no-skill`；第一位的指令照用；洛恩沒有紀錄時不選殘響。`auto is the build's policy`：跟隨 `meteor` 的諾艾兒熱度 4 → 業火；不跟隨 → 和 `choose(s, p)` 相同。
  - `ui2/scenes/battle.test.ts`：`auto plays the round as the note said`：游標停在「自動」→ 說明列的每一段和 `autoActions` 一致（量表滿的那位寫「絕技：…」）；按下 → 送出的 `actions` 等於它，第一位已選的保留；「全員攻擊」照舊只攻擊。`the summary counts heat`：諾艾兒熱度 3 → 火之星彈摘要的威力 ＝ `castPower` 算出的數（寫死）；熱度 0 → 原本的數。
  - e2e：既有的戰鬥 e2e 加一則 `auto fights a round by each member's build (plan 8h)`：按「自動」，一回合結束、沒有 console 錯誤；844×390 與 390×844 下說明列不溢出。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/builds.test.ts src/scripts/games/starlantern/ui2/scenes/battle.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-8`，against `gate-7`；截圖含「自動」的說明列）。
- [ ] **Step 6：commit**：`feat(starlantern): 自動 fights a round the way each member's build says, and the battle menu's numbers count heat, coins and the barrier`。

### Task 9: 守門與整體驗收

**Files:**
- Create：`engine/builds.guard.test.ts`
- Modify：`data/trees.test.ts`（或白名單所在的檔）只改拍手・安可那一條的理由，改成「由祭典指揮 build 量到（plan 8h Task 5b）」（裁定 11i）
- Test：`engine/builds.guard.test.ts`

**Interfaces:**
- Consumes：Task 1–8 全部（涵蓋與安可的斷言已在 Task 5b）。
- [ ] **Step 1：先寫測試**（`engine/builds.guard.test.ts`）
  - `the Normal bands never wear a build`：`balance*.test.ts`、`parity.ts`、`data/policies.ts` 的原始碼不含 `build:`、`runeTier`、`autoActions`；`partyAt`／`kitParty` 不帶 `build` 時每位成員沒有 `build` 欄位；`engine/builds.ts`、`engine/buildBands.ts`、`ui2/scenes/builds.ts` 不含 `Math.random`。
  - `the build words write no number by hand`：`data/text.zh-TW.ts` 的 `build:`、`builds:` 區塊與 `data/builds.ts` 的 `name`／`intro` 字串常值沒有阿拉伯數字（樣板 `${…}` 除外）。
  - `the uncast list only names ultimates no build takes`：`UNCAST`（Task 5b）的每一條：是本人某一條分支第 4 層的絕技，而本人沒有任何 build（含標準）的 `capstone`（或預設絕技分支）是那一條；理由字串非空。
- [ ] **Step 2：執行**：`rtk proxy npx vitest run --testTimeout=3000000 src/scripts/games/starlantern/engine/builds.guard.test.ts`。不成立 → 回到負責的任務修（不是改測試）；修不了就停下來回報。
- [ ] **Step 3：整體驗收**：全套全綠、tsc 0、閘門 `gate-9`（against `gate-8`，`identical`）、`gate-9final` against `plan8d-tree-rework/gate-10`（`identical`，`cmp gate-9final/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出）、`PARITY_CLOSEOUT=1 rtk proxy npx vitest run --testTimeout=3000000 src/scripts/games/starlantern/engine/parity.test.ts` 全綠、符文帶 `bands-9.stdout` 全綠、e2e 全綠。建議配點畫面、工坊兩行、戰鬥「自動」在 1280×720 與 390×844 的截圖附在報告。報告列出本計畫每一個偏離 spec 的地方與根據（裁定 2、3、7、9、11、12、14、15 與文末的衝突），以及 `rune-value.md` 的摘要表。
- [ ] **Step 4：commit**：`test(starlantern): build guards — the Normal bands wear none, their words write no number, only an ultimate no build takes may go uncast`。

---

## spec 與程式碼／spec 內部的衝突（本計畫的處理）
1. **§16「預設跟隨標準」vs 程式碼沒有自動配點**：照裁定 2，預設不跟隨（保住「現在的玩家感覺不到改變」這個目的）。
2. **§6.5「道具店保證每一套建議 build 至少能用普通階湊齊」vs §16 的符文清單**：道具店只賣擴散、連擊、節流、延長，§16 的 build 幾乎都要點燃、蓄力、常駐、撕裂等。處理：每一套符文 build 至少一顆是店裡賣的（Task 4 守門），其他的「缺」寫出哪裡拿；§13 噩夢「每人湊得出魔法階 build」的假設仍靠掉落＋合成（spec §13 自己也這樣寫）。
3. **§16 洛恩「標準無符文」vs「五種各自補上建議符文」**：照裁定 3。
4. **§16 的 build 句子指向 8c／8d 之前的名冊**（千鶴「雷之結界」已是讓任何結界雷擊的機制節點、天之逆鉾與千針是絕技分支）：照現在的名冊對應，Task 4 的表是起點。
5. **§12.4「一招的期望輸出 1.6 倍」**：照裁定 9 量成這一招每次施放的帳本貢獻（同一批戰鬥、同一份策略）；直接數施放威力，spec 自己的擴散範例就會失敗。

## 交給之後計畫的介面（摘要）
- **難度專案**：`BattleScale.difficulty`、`BANDS`、`Lineup.build`／`runeTier`、`buildLineup`、`measureBuild`、`scenarioFights` 可以直接拿來量「噩夢＋魔法階」「地獄＋稀有／史詩」；**本計畫把 spec §6.5 的「道具店保證每套 build 湊得齊」放寬成「每套只要一顆是店裡賣的」**（衝突 2），噩夢「每人湊得出魔法階 build」的假設因此靠掉落與合成，難度專案要重新確認；`runeTierWeights(…, difficultyMul)` 已在 8f。留給它的：雙人舞的給予者貢獻（裁定 11e）、結界在長戰鬥的價值（8c）。
- **第 ⑨ 步（美術）**：建議配點卡片的 `◆○` 與工坊、戰鬥的符文記號一起換成圖示（資料不變）。
