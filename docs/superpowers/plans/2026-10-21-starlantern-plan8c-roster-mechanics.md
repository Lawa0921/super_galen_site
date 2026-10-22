# 星燈迷宮 計畫 8c：名冊收斂與角色核心機制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 技能深化 spec §17 的第 ② 步：每位夥伴得到一個看得到的核心機制（熱度、結界、銅板、瞄準、餘燼、月相、拍子、裝置、暗記與「還有。」），洛恩得到「殘響」指令；夥伴的 84 招收斂成「保留 54／改 15／換 15」，每個概念只屬於一個人；模擬玩家照預設策略使用新機制；每一步都通過戰力對等與凍結的平衡帶。

**Architecture:**
- **先擴帳本，再動名冊**：Task 1 只擴充貢獻帳本（挑釁的決定性計分、結界與護盾的計分）與戰力對等的比較規則，舊名冊上逐位元不變（閘門證明）。之後每個任務 2–3 位角色，各自交付「引擎＋畫面文字＋名冊資料＋預設策略＋測試＋平衡帶＋戰力對等」。
- **機制集中在 `engine/mechanics/`**：一個分派檔（`index.ts`）提供固定幾個掛鉤（施放前改寫、付出、命中、行動後、回合末、畫面文字），每種機制一個小檔。`battle.ts`、`skills.ts`、`sim.ts` 只呼叫分派檔；沒有機制的戰鬥者走的每一條路和現在相同。
- **被「換」掉的招用新的 id**（美術以 id 對應圖示，舊 id 的 G3 圖示不會被誤用）；舊存檔的技能樹靠讀檔時的 id 改名表保持合法，直到第 ④ 步的遷移取代它。

**Tech Stack:** TypeScript、Vitest（happy-dom）、PixiJS、SCSS、Playwright e2e、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-20-starlantern-skill-builds-design.md`（使用者 2026-10-20 核准「可以」，細節授權：「技能設計由你決定細節」）。本計畫實作 §8（全部）、§9 中名冊用到的部分（特斯拉線圈的感電）、§10.1、§10.2 的 `blueprint` 說法、§10.3、§11、§12.3 第 1–2 步、§12.5 的預設策略、§12.6 的帳本擴充、§15 的「沒有圖就不請求」、§17 ②。前置：計畫 8a、8b 已合併（HEAD `36ff2dd4` 或之後）。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄：`.superpowers/sdd/2026-10-21-starlantern-plan8c-roster-mechanics/`（下稱 SDD）。行號只供定位，動手時一律用內容找。

## 計畫裁定（spec 留給實作者、spec 與程式碼不一致之處）

1. **「換」的招用新 id，舊存檔靠改名表。** `data/trees.ts` 新增 `LEGACY_NODE_IDS: Readonly<Record<string, string>>`（舊節點 id → 新節點 id）；`engine/save.ts` 的 `loadGame` 在 `dropUnknownBanters` 旁邊呼叫 `upgradeTreeIds(data)`：每位成員的 `tree` 裡，舊 id 改名成新 id（只在新 id 不存在時；兩者都在就不動，交給驗證）。不升 `SAVE_VERSION`、不碰其他欄位。新節點保留舊節點的位置與 `maxRank`，所以點數與 `validBuild` 的重播完全一樣。`LEGACY_LEARN_LEVEL` 的 `triple-slash` 鍵同步改名（預設配點的順序不變）。第 ④ 步的 `migrate8to9` 會重置技能樹，屆時由它決定是否刪掉這張表。
2. **「改」的招沿用 id 與圖示**（spec §8.11）。15 個新 id 加進 `render/artPaths.ts` 的 `NO_ICON_YET_IDS`，所以 `allArtUrls()` 不請求任何不存在的圖。唯一有已發布圖示而被刪掉的是 `triple-slash`：它的 URL 隨著 id 離開 `SKILLS` 而離開 `allArtUrls()`（數量 −1）；圖檔本身不刪，交給第 ⑨ 步的 G3 重整（刪檔是破壞性操作，不在本計畫）。
3. **指向被換掉的招的強化節點**：節點 id、位置、`maxRank` 不變（存檔合法），`skill` 改指向替代的招，`mods` 換成對新招有意義、同樣長度的數字（逐一列在各任務）。第 ③ 步會把全部強化節點換成變招節點。
4. **「保留」＝同一個概念、名字與數字不變**；機制需要的標記可以加：`turret` 的效果改寫成裝置形式（同威力、同回合）、`heaven-spear` 與 `crimson-end` 多一個 `mech` 標記、`desc` 可以補一句。守門測試只比對 `name`、`owner`、`tp`、`hpCost`、`target`、`effects`，並列出 `turret` 這一個例外。
5. **「（終極）」指技能樹第 4 層的招**（`shadow-flurry`、`storm-volley`、`fortress`、`sanctuary`、`sirocco`、`emergency-repair`、`tesla-coil` 的位置），不是絕技量表的絕技。絕技（`data/ultimates.ts`）一個字都不改。
6. **只作用在隊伍或施放者身上的效果只算一次**：`barrier`、`barrier-boost`、`moon`、`device`、`overclock`、`tune-up` 這幾種效果，`applyEffect` 只在「目標就是施放者」時執行（技能的目標寫 `self`；全面整備因為要淨化全隊寫 `allies`，施放者在其中所以剛好一次）。
7. **`EffectContext.battle?: BattleState`**：`resolveRound` 建立 ctx 時放進去；結界、月相、裝置、殘響這類效果在沒有它時（單元測試的裸 ctx、野外施放）什麼都不做。
8. **挑釁的計分（控制者裁定 1）**：被挑釁（或之後的「挑戰」）轉到挑釁者身上的單體行動，不論敵人原本的意圖，一律以「敵人能打到的其他活著的成員」（`reachable` 扣掉挑釁者）為池子，用這一擊同一組 `HitRolls` 逐一重算，取 `lossOf` 的平均，減掉實際損失，`max(0, …)` 記給挑釁者。池子是空的記 0；範圍攻擊照舊記 0。代受的池子是被代受的那一位。取代 8a 裁定 6–7 的「意圖目標」算法。
9. **結界的計分（控制者裁定 1）**：守之結界不是增益（不佔 `MAX_BUFFS`、不走「取最強」）：`syncWards(s)` 把 `s.barriers` 中守之結界的防禦、魔防百分比抄到每位活著成員的 `Combatant.ward = { def, res, src }`，`stat()` 把它加進百分比加總。`creditPrevented` 多一個因素：拿掉 `ward` 重算，差額記給 `ward.src`（＝`Barrier.src`）。
10. **護盾的計分（控制者裁定 1）**：`Combatant.shield = { amount, src }`；`dealDamage` 先扣護盾再扣 HP（持續傷害也一樣），被吸收的量記給 `src` 的 `shield`，並記 `{ type: 'shield' }` 事件。防止量的各因素仍以「護盾之前」的傷害量計算（`lossOf` 不看護盾），兩者互不扣抵。整場吸收完全的一擊仍然算命中（會叫醒睡眠）。
11. **戰力對等的新規則（控制者裁定 2）**：基準改成 `engine/__fixtures__/sim-gate/contribution.8b.json`。每格每位受測者：`|現在 − 基準| ≤ max(10% × 自己的基準, 2% × 該格整隊的基準)`；每位受測者在同一支隊伍的五個等級「每回合貢獻」加總：`±10%`，沒有下限放寬（「strict」解讀為不套 2% 的放寬，邊界含等號）；整隊每格 `±5%`，沒有放寬。
12. **調整的範圍**：只能調「本任務的機制常數」「本任務改／換的招的數字（威力、TP、回合、機率）」「本任務角色的預設策略參數（門檻、技能順序）」。保留的招、其他角色、門檻、敵人、`engine/balance*.test.ts` 一律不動。調不進平衡帶或戰力對等就停下來回報 BLOCKED（附 `retune.md`），不放寬、不改別的數字。
13. **熱度**：只有她的技能移動熱度，以施放後的技能第一個傷害效果的屬性判斷（火、雷 +1；冰 −2；沒有傷害的招 0）；熱度 `n` 使她技能的傷害威力 `100 + 8n` %；熱度滿（5）時施放的技能是「暴走」：威力改為 200%（取代熱度加成，不疊乘），之後熱度歸 0，她失去最大 HP 15%（反噬不會讓她倒下，最低 1；不記帳、不叫醒、不累積量表）。絕技與普通攻擊不吃熱度。
14. **「還有。」**：本引擎一回合的指令在回合開始前就全部決定，沒有回合中的輸入。凜在她的行動中擊倒任何敵人（行動前活著、行動後倒下），且這回合還沒用過，就立刻**重複同一個指令**：原目標倒下時改打第一個活著的敵人；技能付不起 TP、或原指令不是攻擊或技能時，改為普通攻擊。這一次行動不累積量表，記 `{ type: 'mech', cue: 'again' }`，畫面跳「還有。」。
15. **隱匿的長度**：「1 回合內」＝施放的這一回合剩下的時間，加上下一整個回合（`veil = 2`，回合末 −1；敵人在回合末計畫時她已經被排除）。
16. **月相**：只有瑟蕾在隊上才有月相，每場從上弦開始；順序 上弦 → 滿月 → 下弦 → 新月，每回合末前進一格。效果只給瑟蕾的技能：滿月回復威力 ×1.3；新月睡眠機率 ×1.3（上限 1）；上弦 TP ×0.7（無條件進位，最低 1）；下弦冰傷威力 ×1.3。「收回」把月相倒退一格並結束「滿月之夜」；本回合末照常前進，所以實際效果是「這一格多留一回合」。
17. **瞄準**：每一次「單體」行動（普通攻擊或目標為 `enemy` 的技能）之後結算：打的是瞄準目標就 +1（上限 3），否則換成新目標、層數 1；目標倒下歸 0。加成看行動**之前**的層數（第一箭沒有加成）。範圍、散射不改變瞄準。鎖定（獵人標記）期間，對其他目標的行動不改變瞄準、也不吃加成。
18. **裝置**：同時最多 2 個；再放同一種是改良（等級 +1，上限 3，回合重置為技能的回合）；滿了又放新的一種，取代剩餘回合最少的那個（同樣少取最舊的）。等級 `L` 的效果 ×`(1 + 0.25 × (L − 1))`，`blueprint` 再 ×1.3。波比倒下時裝置全部消失（和舊的砲台一樣）。舊的 `turret` 效果種類與 `Combatant.turret` 在 Task 6 移除（砲台改走裝置，只留一條路）。
19. **優先順序**（spec §10.3）：挑釁 > 挑戰（盾擊）> 代受 > 原本的目標；隱匿中的凜不會被單體行動選中，除非能打到的成員全部在隱匿。
20. **殘響**：只記錄夥伴（不含洛恩）施放的、效果只有 `damage`、`heal`、`buff`、`inflict`、`cure`、`revive`、`taunt` 的招；記下施放當下的完整 `SkillDef`（含她的機制改寫）與她付的 TP。只有這一回合或上一回合的紀錄可用。洛恩付同樣的 TP，威力（傷害、回復）70%。模擬玩家從不使用殘響。
21. **莉茲的銅板換金幣**：勝利時剩下的每枚 2 金幣（起始值），加在 `rewards()` 的 `gold`，並回傳 `coinGold` 給結算畫面顯示一行；`rewards` 的亂數抽取不變。
22. **§16 只用到「標準」build**：本計畫的預設策略就是 `data/policies.ts` 的 `DEFAULT_POLICIES`（8a 裁定 11）；其他建議 build 屬於第 ⑧ 步。雷之結界、重結界等機制節點屬於第 ③ 步。

## 控制者裁定（2026-10-21，覆蓋本文衝突處）

1. **保留招式可調數字**：「保留」= 名稱、目標、效果種類、屬性、標籤不變；威力、TP、回合、機率等數字可為了該角色的戰力對等而調整，每次調整寫進 `retune.md`（舊值→新值與理由）。名冊快照測試對保留招式比對名稱／目標／效果種類／屬性，不比數字。
2. **規格數字是起始提案**：§8 標【起始提案】的數字（熱度每層 +8%、瞄準每層 +50%、過載 ×2 等）是起點，執行者可在規格規則內調低或調整，以通過平衡帶與戰力對等；調整同樣寫進 `retune.md`。仍不可放寬任何門檻；若調到機制失去意義（例如加成低到看不出差別）仍過不了，停下回報。
3. **開工前提**：8b 的小修（異常文字單行＋「+N」、血條上移量）必須先提交並通過審查；工作樹有他人未提交的修改時停下回報。

## Global Constraints

**使用者的方向（最高依據）**
- 「不裝符文頂多過普通」：普通難度的驗收＝預設配點、沒有符文的模擬。`engine/balance*.test.ts` 的全部門檻凍結，只准收緊。平衡只對照預設配點（記憶「星燈迷宮必須配點」）。
- 「不夠直覺的話我可能會懶的研究 build」：每個機制一句話講得完、畫面上看得到（spec §4、§8 規則）。

**分支與基準**
- `feat/starlantern-story`，HEAD `36ff2dd4`（8b 完成與小修之後）或之後。開工前 `git status`：本計畫要改的檔案有別人未提交的修改，停下來回報 NEEDS_CONTEXT。
- 閘門的 `against` 鏈：Task 1 對 8b 的最後快照 `.superpowers/sdd/2026-10-20-starlantern-plan8b-ailments-buffs/gate-6`；之後每個任務對前一個任務在 SDD 的快照（`gate-1` … `gate-6`）。**不覆寫** `engine/__fixtures__/sim-gate/` 底下任何既有檔案。

**測試與檢查**
- TDD：每個任務先寫失敗的測試，確認它因為正確的理由失敗，再實作。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`。全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`。
- 平衡帶＋閘門（8a 的腳本）：`rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-21-starlantern-plan8c-roster-mechanics/gate-<N> <against>`。它跑四個平衡檔與 `engine/parity.test.ts`。一次只跑一套重的測試。
- tsc：`rtk proxy npx tsc --noEmit -p .`；完成條件是 starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個（repo 原本約 43 個與本專案無關）。
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。headless、靜音；只用 4352，絕不用 4354，不可以結束任何程序。
- 本專案沒有 prettier、eslint，不要跑。
- **名冊任務的收尾（Task 2–6 共用，下稱「收尾 R」）**：(1) 全套全綠、tsc 0；(2) 閘門輸出 `gate-<N>`、`against` 用前一個快照：預期 DIFFERENT，要求四個平衡檔與 `parity.test.ts` 的 Tests **全部通過**（`BALANCE_REPORT=1` 下的 soft failure 也算失敗）；(3) 把報告的每一個不同行、`actions.json` 變了的測試名、每位角色每格的戰力對等數字（`checkParity` 的 rows），寫進 SDD 的 `retune.md` 該任務一節，連同每一次調整（改了哪個常數、前後數字）；(4) e2e 全綠；(5) 過不了就照裁定 12 停下來回報 BLOCKED。

**換行（逐檔保留）**：改檔前 `git ls-files --eol <檔案>`；改完 `git diff --stat`，整檔被改寫就是換行壞了。CRLF 檔不可以用 `sed -i`。已知：CRLF：`data/skills.ts`、`engine/types.ts`、`engine/sim.ts`、`engine/save.ts`、`render/artPaths.ts`、`engine/testing.ts`、`engine/battle.test.ts`、`engine/combatant.test.ts`；LF：`data/trees.ts`、`data/gear.ts`、`data/policies.ts`、`data/talents.ts`、`engine/ledger*.ts`、`engine/mech.ts`、`engine/policy.ts`、`engine/parity*.ts`、`ui2/battleText.ts`；混用：`engine/battle.ts`、`engine/combatant.ts`、`engine/skills.ts`、`data/text.zh-TW.ts`、`ui2/partyBar.ts`、`ui2/scenes/battle.ts`、`render/BattleView.ts`。新檔一律 LF。

**亂數**：不可以 `Math.random`。新機制只在這些地方抽戰鬥的 `rng`，依固定順序：散射與一擲千金每一段的目標（`pick`）、砲台的目標（`pick`）、特斯拉線圈的感電（`inflictAilment`）、贖火反擊與裝置傷害的命中（`rollHit`）、隱匿使已計畫的目標失效時的重選（`pick`）。熱度、暗記、結界、月相、拍子、銅板、瞄準、餘燼、代受、挑戰、殘響的記錄一次都不抽。`game.rng`、`lootRng` 等串流一次都不多抽。

**git**：一律寫出完整路徑 add，不可以 `git add -A`／`git add .`。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。由控制者 commit 時照各任務最後一步的訊息。絕對不可以執行 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。不 push。

**介面與文字**
- 不新增任何圖片、假圖示，不用 CSS 畫圖示或形狀；機制一律是「文字＋顏色」，樣式沿用 8b 的 `.slx-ail`（文字＋`currentColor` 細框）。SCSS 禁 `!important`；禁行內樣式（含 `element.style`）。
- 名稱用 spec §8 寫的（例：淨之結界、破邪突、順手牽羊、一擲千金、大手筆、估價、破甲箭、散射、暴雨箭、代受、贖火、收回、滿月之夜、拍手、蜃樓步、修理無人機、全面整備、護盾產生器、暗記、守之結界）。spec 寫死的字照抄：「還有。」「這一步踩空了呀。」。
- 技能說明（`desc`）一句話、全形標點、照《文風聖經》§3 該角色的語氣（例：莉茲可以「成交」、凜用短句、諾艾兒「哼」、瑟蕾的「呢」「吧」、絲嘉蕾不省略、莎菲拉的節拍）；**不用「……」**、不用驚嘆號（諾艾兒、波比、莎菲拉、莉茲例外，最多一個）；數字寫進說明（「3 回合」）。介面文字放 `data/text.zh-TW.ts` 的 `T.mech`、`T.log`。
- 手機寬度（390）下成員面板上方的文字列不溢出（8b 的 e2e 寫法）。

**測試修改規則**：各任務的 Files 列出已知會紅的既有測試。若全套跑出沒列到的紅燈，而它斷言的正是本任務改／換的那一招的舊內容（id、名稱、數字），可以照新內容改，並在報告列出；其他紅燈停下來回報 NEEDS_CONTEXT。`it.fails`、`it.skip`、`.only`、`.todo` 不可以出現在 commit。

**子代理**：實作者不派子代理。

## Review Focus
1. **舊存檔帶著被換掉的招（含強化節點的點數）照樣讀得進來，點數一點不少。** 測試：Task 3 的 `a save that holds old node ids loads with them renamed`（之後每個換招的任務各加一筆改名，同一個測試逐筆覆蓋）。
2. **每場戰鬥從乾淨的機制開始；機制狀態不進存檔。** 熱度 0、銅板 0、月相上弦、沒有結界與裝置。測試：Task 2 的 `every fight starts from a fresh mechanic`，Task 3、4、5、6 各自把自己的機制加進同一個測試的斷言。
3. **主人倒下或目標倒下時，機制不留殘渣、不當機。** 暗記、瞄準跟著目標消失；裝置跟著波比消失；代受跟著絲嘉蕾結束；結界留到回合用完（千鶴倒下也照常運作，計分仍給她）。測試：各任務的 `when its owner or its target falls` 一則。
4. **沒有新機制的戰鬥，亂數序列與現在逐位相同；機制只在「亂數」一節列出的地方抽。** 測試：Task 1 的閘門 `identical`；Task 2–6 各自的 `<機制> draws nothing`（計數 rng，同一場戰鬥有沒有該機制的行動，抽取次數只差列出的那幾次）。
5. **多個轉向來源同時存在時照優先順序，而且敵人永遠有人可打。** 挑釁 > 挑戰 > 代受 > 原目標；全隊都在隱匿時照樣能被選中。測試：Task 2 的 `veil hides rin unless everyone in reach is veiled`、Task 5 的 `taunt beats challenge beats cover beats the first target`。

---

## File Structure
- `engine/ledger.ts`、`engine/combatant.ts`（`ward`、`shield`、`dealDamage` 的 opts）、`engine/battle.ts`（挑釁池、`syncWards`）、`engine/parity.ts`、`engine/parity.test.ts`、`engine/mech.ts`（`Barrier` 欄位）：Task 1。
- `engine/__fixtures__/roster-8b.json`（新，Task 1 錄）＋ `data/roster.test.ts`（新）：保留的招與絕技不變的守門，Task 7 再加「一個概念一個人」。
- `engine/mechanics/index.ts`（新，Task 2）：掛鉤分派與畫面文字；每種機制一個檔：`heat.ts`、`mark.ts`（Task 2）、`barrier.ts`、`moon.ts`（Task 3）、`coins.ts`、`aim.ts`（Task 4）、`embers.ts`、`beat.ts`（Task 5）、`devices.ts`、`echo.ts`（Task 6）；測試 `engine/mechanics/<同名>.test.ts`。
- `engine/types.ts`（`Effect` 新種類、`SkillDef.mech`）、`engine/skills.ts`（`applyEffect` 新分支、`patchSkill` 新種類）、`engine/battle.ts`（`perform` 掛鉤、轉向、`resolveRound`）、`engine/sim.ts`（`castPower`、`choose` 用 `castCost`）：各任務依需要。
- `data/skills.ts`、`data/trees.ts`、`data/gear.ts`、`data/policies.ts`、`data/talents.ts`、`render/artPaths.ts`：名冊資料。
- `data/text.zh-TW.ts`、`ui2/battleText.ts`、`ui2/partyBar.ts`、`ui2/scenes/battle.ts`、`render/BattleView.ts`、`render/mechStyle.ts`（新）、`src/styles/_starlantern-ui.scss`：畫面文字。
- `engine/save.ts`（`upgradeTreeIds`，Task 3）。

---

### Task 1: 帳本擴充與新的戰力對等規則（舊名冊逐位元不變）

**Files:**
- Modify：`engine/ledger.ts`（`creditPrevented` 的轉向參數、`ward` 因素）、`engine/skills.ts`（`EffectContext.redirect` 型別、`dealDamage` 傳 ledger／log）、`engine/battle.ts`（`perform` 的挑釁池、毒傷傳 ledger／log、`syncWards`）、`engine/combatant.ts`（`ward?`、`shield?`、`stat` 加 ward、`dealDamage` opts、`BattleEvent` 的 `shield`）、`engine/ailments.ts`（跳傷傳 ledger／log）、`engine/mech.ts`（`Barrier`）、`engine/parity.ts`、`engine/parity.test.ts`、`data/text.zh-TW.ts`／`ui2/battleText.ts`（`shield` 一句）
- Create：`engine/__fixtures__/roster-8b.json`、`data/roster.test.ts`
- Modify（會紅的既有測試）：`engine/ledger.test.ts` 的 `a hit turned by a taunt credits the taunter with what the first target was spared`（換成本任務的新測試）；`engine/policy.test.ts` 裡的 `Barrier` 字面值加 `kind: 'guard', power: 30`；`engine/parity.test.ts` 的 `checkParity bands`（換成新規則）
- Test：`engine/ledger.test.ts`、`engine/parity.test.ts`、`engine/combatant.test.ts`、`data/roster.test.ts`

**Interfaces:**
- Consumes：8a 的 `Ledger`、`credit`、`lossOf`、`hitAmount`、`HitRolls`；8b 的 `tickAilments`。
- Produces：
  - `mech.ts`：`export type BarrierKind = 'guard' | 'purify'`；`Barrier` 加 `kind: BarrierKind; power: number; boost?: number`（`boost` 缺＝1）。
  - `combatant.ts`：`Combatant.ward?: { def: number; res: number; src: string }`；`Combatant.shield?: { amount: number; src: string }`；`stat(c, s)` 的百分比加總多 `+ (s === 'def' ? ward.def : s === 'res' ? ward.res : 0)`（沒有 ward 時加 0）；`dealDamage(t, amount, opts: { dot?: true; ledger?: Ledger; log?: BattleEvent[] } = {})`：先扣護盾（`absorbed = min(shield.amount, amount)`，記帳、記 `{ type: 'shield', target, amount: absorbed }`，用完刪欄位），剩下照舊；回傳仍是 HP 的實際損失；倒下時清 `shield`、`ward`。
  - `BattleEvent` 加 `{ type: 'shield'; target: string; amount: number }`；`T.log.shield(who, n)` →「{who}的護盾擋下了 {n} 傷害」。
  - `skills.ts`：`EffectContext.redirect?: { pool: Combatant[] }`；`EffectContext.battle?: BattleState`（裁定 7，本任務只宣告並在 `resolveRound` 放進去）。
  - `ledger.ts`：`creditPrevented(l, a, t, spec, r, amount, redirect?: { pool: Combatant[] })`：裁定 8 的平均；新增 `t.ward` 因素（`stat` 屬性依 `spec.scale`：`atk` → `def`，`mag` → `res`，百分比 > 0 才算）。
  - `battle.ts`：`export function syncWards(s: BattleState): void`（裁定 9；守之結界的百分比 ＝ `power × (boost ?? 1)`；沒有守之結界時刪掉每個人的 `ward`）；`resolveRound` 在每個行動之後與 `endOfRound` 之後呼叫它。
  - `parity.ts`：`PARITY_MEMBER_PCT = 10`、`PARITY_FLOOR_PCT = 2`、`PARITY_SUM_PCT = 10`、`PARITY_PARTY_PCT = 5`；`ParityRow` 加 `rule: 'cell' | 'sum' | 'party'` 與 `allowed: number`（允許的絕對差）；`checkParity(now, base)` 照裁定 11。`parity.test.ts` 的基準改讀 `contribution.8b.json`。
  - `roster-8b.json`：HEAD 的 `SKILLS`（全部）、`ULTIMATES`、`RIN_DAWN`、`HERO_ULTIMATES`、`POWERS`，以及每棵樹的形狀 `trees: Record<CharacterId, { id: string; maxRank: number }[][]>`（支 × 層），`JSON.stringify(x, null, 2) + '\n'`。

- [ ] **Step 1：先寫失敗的測試**
  - `ledger.test.ts`：
    - `a taunt is credited with the average loss over the others the foe could reach`：前排絲嘉蕾（`taunt: 2`）、前排諾艾兒、後排瑟蕾；近戰敵人普通攻擊（意圖寫諾艾兒）：池子只有諾艾兒，絲嘉蕾的防止量 ＝ `max(0, lossOf(諾艾兒, hitAmount(e, 諾艾兒, spec, r).amount) − 實際損失)`（`r` 用同一支 `constRng` 從 `rollHit` 取得）；同一場改成遠程敵人：池子是諾艾兒與瑟蕾，期望值是兩者 `lossOf` 的平均減實際損失。
    - `a taunt already in place when the foe planned still earns its credit`：意圖直接寫絲嘉蕾，防止量和上一則相同（不再是 0）。
    - `an area hit or a lone taunter credits nothing`：`row` 技能轉向記 0；能打到的只有挑釁者時記 0。
    - `a guard barrier's share goes to whoever raised it`：隊友 `ward: { def: 30, res: 30, src: 'chizuru' }`，物理一擊：`stat(t, 'def')` ＝ `Math.floor(20 × 1.3)`；chizuru 的防止量 ＝ `lossOf(t, hitAmount(e, { ...t, ward: undefined }, spec, r).amount) − 實際損失`；法術一擊改看 `res`；`ward` 和 `{ def +30, src: 'hero' }` 的增益同時在時，兩者各自重算、互不扣抵。
    - `syncWards mirrors the guard barrier on every living member`：`barriers: [{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru' }]` → 每位活著的成員 `ward` 為 `{ def: 30, res: 30, src: 'chizuru' }`、倒下的沒有；`boost: 2` → 60；`kind: 'purify'` 或空陣列 → 沒有人有 `ward`。
    - `a shield takes the hit first and is credited to who gave it`：`shield: { amount: 30, src: 'bobby' }` 的隊友 `dealDamage(t, 50, { ledger, log })` → 回傳 20、HP −20、`shield` 消失、bobby 的 `shield` 記 30、log 有 `{ type: 'shield', target, amount: 30 }`；`dealDamage(t, 10, …)` → 回傳 0、HP 不變、剩 20；`sleep: 2` 的目標被完全吸收的一擊叫醒，`{ dot: true }` 的跳傷不叫醒。
    - 既有的 `the ledger never changes the fight`、`the ledger reconciles with the fight` 不改，必須維持綠。
  - `parity.test.ts` 的 `checkParity bands`（手寫表，`rounds: 1`）：整隊基準 1000、某人基準 20：現在 39.9 通過、40.1 失敗（允許 20 ＝ 2% × 1000）；某人基準 500：549 通過、551 失敗；某人五個等級基準各 20、現在 `[38, 20, 20, 20, 20]` → 每格通過、`sum` 那列 +18% 失敗；整隊 1000 → 1050 通過、1051 失敗；缺格失敗。
  - `data/roster.test.ts`：`the 54 kept companion skills, the hero's 21 and every ultimate stay as they were`：`KEPT`（spec §8 的 54 個保留 id，逐一寫出）與洛恩的 21 招，`{ name, owner, tp, hpCost, target, effects }` 等於 `roster-8b.json`；例外只有 `turret` 的 `effects`（Task 6 起等於 `[{ kind: 'device', device: 'turret', power: 70, turns: 3 }]`，用一個 `KEPT_EFFECT_EXCEPTIONS` 表寫死）；`ULTIMATES`、`RIN_DAWN`、`HERO_ULTIMATES` 整個相等。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/ledger.test.ts src/scripts/games/starlantern/engine/parity.test.ts src/scripts/games/starlantern/data/roster.test.ts`。預期：池子算法還是舊的、`ward`／`shield` 不存在、`checkParity` 沒有 `rule`、夾具不存在。
- [ ] **Step 3：實作**（照 Interfaces；先用一支一次性的 vitest 片段在 HEAD 錄 `roster-8b.json`，片段不 commit）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠；全套全綠；tsc 0。
- [ ] **Step 5：閘門**：`… gate-1 .superpowers/sdd/2026-10-20-starlantern-plan8b-ailments-buffs/gate-6`，必須 `gate: identical`（舊名冊的模擬從不挑釁、沒有結界與護盾）。不同就停下來回報 BLOCKED。
- [ ] **Step 6：commit**：`feat(starlantern): ledger credits taunts by the average over reach, barriers by their raiser, shields by what they absorb; parity floor rule`。

### Task 2: 機制的骨架、諾艾兒「熱度」、凜「暗記」與「還有。」

**Files:**
- Create：`engine/mechanics/index.ts`、`engine/mechanics/heat.ts`、`engine/mechanics/mark.ts`、`engine/mechanics/heat.test.ts`、`engine/mechanics/mark.test.ts`、`render/mechStyle.ts`
- Modify：`engine/mech.ts`（`mark.again?: true`）、`engine/types.ts`（`Effect` 加 `expose`、`mark`、`veil`）、`engine/combatant.ts`（`exposed?`、`veil?`、`nextCrit?`；`elementMult`／`vuln`／`weak-tp` 改用 `isWeak`；`rollHit` 的暗記與 `nextCrit` 必定暴擊；`BattleEvent` 的 `mech`）、`engine/skills.ts`（新效果、`patchSkill` 的 `expose`／`veil` 回合）、`engine/battle.ts`（`createBattle` 末呼叫 `initMechs`；`perform` 的技能分支用 `castDef`／`castCost`／`payMech`、之後 `afterAction`；隱匿的選目標；「還有。」；`endOfRound` 的 `exposed`／`veil` 倒數）、`engine/sim.ts`（`castPower` 讀 `castDef`；`choose` 用 `castCost`）、`data/skills.ts`（`hex`、`rin-veil`、`rin-mark`）、`data/trees.ts`（`noel-hex-up`、`rin-veil-up`、`rin-mark-up`）、`data/gear.ts`（`mire-whisper-gloves`）、`data/text.zh-TW.ts`（`T.mech`、`T.log.mech`）、`ui2/battleText.ts`、`ui2/partyBar.ts`（`BarMember.mech`、`cue`）、`ui2/scenes/battle.ts`（技能選單的 TP 用 `castCost`；成員與敵人的文字；播放時的 cue）、`render/BattleView.ts`（`showAilments` 的 `marks`）、`src/styles/_starlantern-ui.scss`（`$slx-mech`、`.slx-mech-*`、`.slx-pm-cue`）
- Modify（可能會紅的既有測試）：`engine/progression.test.ts`、`engine/field.test.ts`、`ui2/scenes/status.test.ts`、`engine/compare.test.ts`（斷言衰弱咒的舊內容）、`data/rin.test.ts`（隱匿、標記）
- Test：上列新測試、`engine/battle.test.ts`、`engine/sim.test.ts`、`ui2/partyBar.test.ts`、`ui2/scenes/battle.test.ts`、`render/BattleView.test.ts`、`ui2/rarity.test.ts`（色表）、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 1 的 `EffectContext.battle`；8a 的 `MechState`、`applyPolicy`；8b 的 `inflictAilment`、`AilmentChip`、`showAilments`。
- Produces（`engine/mechanics/index.ts`）：
  - `export interface MechModule { init?(s: BattleState, c: Combatant): void; castDef?(s: BattleState, c: Combatant, def: SkillDef): SkillDef; castCost?(s: BattleState, c: Combatant, cost: number): number; pay?(s: BattleState, c: Combatant, def: SkillDef, ctx: EffectContext): void; onHit?(actor: Combatant, target: Combatant, ctx: EffectContext): void; after?(s: BattleState, c: Combatant, act: Action, def: SkillDef | null, ctx: EffectContext): void; roundEnd?(s: BattleState, ctx: EffectContext, rng: Rng): void; words?(s: BattleState, c: Combatant): MechWord[]; foeWords?(s: BattleState, e: Combatant): MechWord[]; fieldWords?(s: BattleState): MechWord[] }`；`const MODULES: MechModule[]`（每個任務加自己的模組）。
  - 分派函式（依 `MODULES` 順序，沒有模組作用時原樣回傳）：`initMechs(s)`；`castDef(s, c, def): SkillDef`（純函式、不抽亂數、不改 `def`）；`castCost(s, c, id): number`（`skillCost` 再交給模組）；`payMech(s, c, def, ctx)`（付完 TP、HP 之後，效果之前）；`onLandedHit(actor, target, ctx)`（`applyEffect` 每一下命中之後）；`afterAction(s, c, act, def, ctx)`（`resolveRound` 每個隊伍行動之後，`def` 是這次施放的 `castDef` 結果，非技能為 null）；`mechRoundEnd(s, ctx, rng)`（`endOfRound` 的最前面）；`memberWords(s, c)`、`foeWords(s, e)`、`fieldWords(s)`。
  - `export type MechTone`（本任務：`'heat' | 'expose' | 'mark' | 'veil'`，之後的任務加）；`export interface MechWord { tone: MechTone; text: string }`；`export type MechCue`（本任務：`'overload' | 'again'`）。
  - `export const MECH_OF: Partial<Record<CharacterId, () => MechState>>`：本任務 `noel: () => ({ kind: 'heat', heat: 0 })`、`rin: () => ({ kind: 'mark', marks: [], cap: 1 })`。`initMechs` 只給 `side === 'party'` 且有條目的人。
  - `BattleEvent` 加 `{ type: 'mech'; actor: string; cue: MechCue; amount?: number }`。
  - `combatant.ts`：`export function isWeak(t: Combatant, el: Element): boolean`（`t.weak.includes(el)`，或 `t.exposed > 0` 且 `el !== 'phys'`）；`elementMult`、`hitAmount` 的 `vuln`、`skills.ts` 的 `weak-tp` 都改用它（沒有 `exposed` 時結果逐位相同）。
  - `heat.ts`：`export const HEAT = { max: 5, pctPer: 8, overloadPct: 200, backlashPct: 15, iceCool: 2 } as const`；行為照裁定 13。
  - `mark.ts`：`Effect` `{ kind: 'mark' }`：施放者 `mech.marks` 變成 `[目標]`（`cap` 1 時取代）；`rollHit`：攻擊者 `mech.kind === 'mark'` 且目標在 `marks`，或攻擊者有 `nextCrit`，暴擊為真且不抽暴擊骰（同 `crit: 'always'`）；`nextCrit` 在她下一次命中後刪掉。`{ kind: 'veil'; turns: number }`：施放者 `veil = turns`、`nextCrit = true`。「還有。」照裁定 14（`resolveRound` 在 `perform` 前後比對活著的敵人；每回合開始時清 `again`）。暗記的目標倒下就從 `marks` 移除。
  - 隱匿的選目標（`battle.ts`）：敵方行動的 `foePool` 排除 `veil > 0` 的成員，除非排除後是空的；已計畫的目標是隱匿中的她時，`pickTarget` 從池子重選（抽一次 `pick`）。
  - `{ kind: 'expose'; turns: number }`：目標 `exposed = max(exposed, turns)`；回合末 −1。
  - 畫面：`T.mech.heat(n)` →「熱度{n}」、`T.mech.expose(n)` →「弱點{n}」、`T.mech.mark` →「暗記」、`T.mech.veil` →「隱匿」、`T.mech.cue.overload` →「暴走！」、`T.mech.cue.again` →「還有。」；`T.log.mech(who, cue, n?)`：overload →「{who}的魔力暴走了！反噬 {n}」、again →「{who}：還有。」。`BarMember.mech?: MechWord[]` 畫在 `.slx-pm-ail` 列的最前面（`<span class="slx-mech slx-mech-<tone>">`），和異常共用一列，兩者都空才 `hidden`；成員的文字照 8b 的 `before` 快照方式隨播放更新。`PartyBar.cue(key: string, w: MechWord): void`：和 MISS 一樣往上飄的一個字（`slx-pm-cue slx-mech-<tone>`），播放到 `mech` 事件時呼叫。`BattleView.showAilments(byKey, marks: Record<string, MechWord[]> = {})`：敵人的機制文字排在異常前面、同一排、同樣的 Pixi `Text` 規格，`fill` 取 `MECH_FILL`。
  - 顏色：`$slx-mech`（SCSS）與 `MECH_FILL: Record<MechTone, number>`（`render/mechStyle.ts`）同值；每一色對 `rgb(10, 14, 34)` 對比 ≥ 4.5:1，機制色彼此 RGB 距離 > 40。
- 名冊（本任務）：
  - `hex`「衰弱咒」改：`tp: 5, target: 'enemy', effects: [{ kind: 'expose', turns: 3 }]`，說明寫「3 回合內火、冰、雷都變成弱點」（諾艾兒的語氣）。降攻、中毒拿掉。
  - `rin-veil`「隱匿」改：`tp: 4, target: 'self', effects: [{ kind: 'veil', turns: 2 }]`（裁定 15）。`rin-mark` 改名「暗記」：`tp: 4, target: 'enemy', effects: [{ kind: 'mark' }]`。
  - 強化節點：`noel-hex-up` → `turns(4, 5, 6)`「弱點延長」；`rin-veil-up` → `tp(-1, -2, -3)`「隱匿節流」；`rin-mark-up` → `tp(-1, -2, -3)`「暗記節流」。
  - `POWERS['mire-whisper-gloves']`：`skill: 'rin-venom-needle'`、`text: '毒針必定使目標中毒（頭目減半）'`、`mod: { chance: 1 }`。
  - 預設策略：`rin` 照舊 `ensure-mark 'rin-mark'`；`noel` 沒有規則。

- [ ] **Step 1：先寫失敗的測試**
  - `heat.test.ts`（`makeBattle`／`makeCombatant`，諾艾兒 `mech: { kind: 'heat', heat }`）：
    - `fire and thunder heat her up, ice cools her down`：火之星彈後 1、雷之星彈後 2、冰之星彈後 0（不低於 0）；上限 5；衰弱咒不變。
    - `each point of heat is +8% spell power`：`castDef(s, noel, 火之星彈)` 的威力在熱度 0／3 時是 140／174（`pctOf(140, 124)`）；普通攻擊、絕技的傷害和沒有熱度時相同。
    - `at five she overloads: double power, then backlash`：熱度 5 施放火之星彈 → 威力 280、之後熱度 0、HP 少 `floor(maxHp × 0.15)`、記 `{ type: 'mech', actor: 'noel', cue: 'overload', amount }`；HP 只剩 5 時反噬後是 1；反噬不改變 `limit`、不叫醒、不記帳。
    - `hex makes fire, ice and thunder weak points for three rounds`：目標 `exposed === 3`；火一擊的 `mult` 是 1.5（原本抗火的目標也是 1.5）；物理照舊；`vuln` 與 `weak-tp` 也成立；三個回合末之後沒有 `exposed`。
    - `heat draws nothing`：用計數 rng，同一場一次全打火之星彈、一次全打冰之星彈，兩者 rng 呼叫次數相同。
  - `mark.test.ts`：
    - `rin's hits on her mark always crit and draw no crit roll`：目標在 `marks`、`x.crit: 0`：命中必暴擊，rng 呼叫次數比不在 `marks` 時少一次（沒有暴擊骰）。
    - `marking moves the mark`：對 e0 施放暗記 → `marks: ['e0']`；再對 e1 → `['e1']`；e1 倒下 → `[]`。
    - `a kill brings 還有。: the same command again, once a round`：凜的技能擊倒 e0 → 同一回合她對第一個活著的敵人再施放一次同一招，記 `cue: 'again'`；第二次又擊倒也不再追加；`limit` 只加一次 `LIMIT_PER_ACTION`；TP 不夠時改為普通攻擊。
    - `veil hides rin unless everyone in reach is veiled`：凜 `veil: 2`、敵人意圖寫凜 → 實際打到別人；全隊只剩凜 → 照樣打她；`veil` 兩個回合末之後消失；她下一次命中必暴擊、之後 `nextCrit` 消失。
    - `when its owner or its target falls`：暗記的目標倒下 → `marks` 清空；凜倒下 → 不再追加行動。
  - `engine/battle.test.ts`：`every fight starts from a fresh mechanic`：`createBattle` 的諾艾兒 `mech` 是 `{ kind: 'heat', heat: 0 }`、凜是 `{ kind: 'mark', marks: [], cap: 1 }`，其他人沒有 `mech`；連打兩場（同一個 `Party`），第二場仍是初始值。
  - `engine/sim.test.ts`：`castPower reads the cast as she would cast it now`：熱度 3 的諾艾兒，`castPower` 對火之星彈是 174。
  - `data/gear.test.ts`：`mire-whisper-gloves now poisons through rin's needle`：`skillFor({ powers: ['mire-whisper-gloves'] }, 'rin-venom-needle')` 的中毒機率是 1；`hex` 不再被任何 `POWERS` 指到。
  - 畫面：`partyBar.test.ts` `shows mechanic words before the ailments`（`mech: [{ tone: 'heat', text: '熱度3' }]`、`ailments: [burn 2]` → 列中依序「熱度3」「灼燒2」，class 對；兩者都空時 `hidden`；`cue` 加一個 `slx-pm-cue` 元素、過一會兒移除）；`BattleView.test.ts` `marks come first in an enemy's row`；`scenes/battle.test.ts` `skill costs in the menu are the cost she pays now`（`castCost` 等於 `skillCost` 的情形）與 `a mech event pops its word over the member`；`rarity.test.ts`（色表）`$slx-mech matches MECH_FILL, reads on the window, and no two tones look alike`。
  - e2e `heat and the mark show on the battle screen (plan 8c)`：照 8b 的 `ailments show as coloured words…` 寫法進戰鬥，`game(...)` 設諾艾兒 `mech.heat = 3`，全員防禦一回合後她的面板含「熱度3」；390 寬時該列 `scrollWidth <= clientWidth`；沒有 console 錯誤、沒有 404 圖片請求。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/heat.test.ts src/scripts/games/starlantern/engine/mechanics/mark.test.ts src/scripts/games/starlantern/engine/battle.test.ts src/scripts/games/starlantern/engine/sim.test.ts src/scripts/games/starlantern/data/gear.test.ts src/scripts/games/starlantern/ui2/partyBar.test.ts src/scripts/games/starlantern/ui2/scenes/battle.test.ts src/scripts/games/starlantern/render/BattleView.test.ts src/scripts/games/starlantern/ui2/rarity.test.ts`。預期：`engine/mechanics` 不存在。
- [ ] **Step 3：實作**（照 Interfaces 與裁定 13–15）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠。
- [ ] **Step 5：收尾 R**（`gate-2`，against `gate-1`）。機制常數與衰弱咒的數字是本任務能調的；`retune.md` 的「Task 2」一節。
- [ ] **Step 6：commit**：`feat(starlantern): mechanics core — Noel's heat and overload, Rin's mark and 還有。`（內文：移動最大的五行報告、諾艾兒與凜每個等級的戰力對等）。

### Task 3: 千鶴「結界」、瑟蕾「月相」、舊 id 改名

**Files:**
- Create：`engine/mechanics/barrier.ts`、`engine/mechanics/moon.ts`、對應 `.test.ts`
- Modify：`engine/types.ts`（`Effect` 加 `barrier`、`barrier-boost`、`moon`；`SkillDef.mech?: SkillMechTag`，本任務 `'release'`）、`engine/battle.ts`（`BattleState.moon?`）、`engine/skills.ts`（新效果、`patchSkill` 的 `barrier` 威力與回合）、`engine/progression.ts`（`pctMod` 把 `barrier` 算作有威力的效果）、`engine/mechanics/index.ts`（註冊、`fieldWords`）、`data/skills.ts`、`data/trees.ts`（`LEGACY_NODE_IDS`、節點）、`data/policies.ts`、`engine/save.ts`（`upgradeTreeIds`）、`render/artPaths.ts`、`data/text.zh-TW.ts`、`ui2/scenes/battle.ts`（場面列）、SCSS
- Modify（會紅的既有測試）：`data/data.test.ts`（野外施放的清單拿掉 `sacred-sake`；`sanctuary` 那一行）、`engine/policy.test.ts`（`ensure-barrier` 的技能清單）
- Test：上列新測試、`engine/save.test.ts`、`ui2/scenes/battle.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 1 的 `Barrier`、`syncWards`；Task 2 的掛鉤。
- Produces：
  - `Effect`：`{ kind: 'barrier'; barrier: BarrierKind; power: number; turns: number }`（新結界取代舊的；`src` ＝施放者）；`{ kind: 'barrier-boost'; mul: number; turns: number }`（目前的結界 `boost = mul`、回合 +turns；沒有結界時什麼都不做，記一句 log）。`SkillMechTag = 'release'`：施放時若有結界，傷害威力 `100 + 10 × 剩餘回合` %（`castDef`），`payMech` 移除結界。
  - `barrier.ts`：`export const BARRIER = { releasePct: 10 } as const`；`roundEnd`：淨之結界對每位活著的成員做一次 `heal`（威力 `power × boost`，用結界主人的 combatant 當施放者，所以回復記給她），再清中毒；之後所有結界 −1 回合、到 0 移除（主人倒下也照常運作）。`MECH_OF.chizuru = () => ({ kind: 'barrier' })`。
  - `moon.ts`：`export type MoonPhase = 'first' | 'full' | 'waning' | 'new'`；`export const MOON = { order: ['first', 'full', 'waning', 'new'], healPct: 130, icePct: 130, sleepMul: 1.3, tpMul: 0.7 } as const`；`BattleState.moon?: { phase: MoonPhase; hold?: { turns: number } }`（`init`：瑟蕾在隊上才建立，`phase: 'first'`）；`Effect` `{ kind: 'moon'; step?: -1; hold?: number }`（`step: -1` 倒退一格並刪 `hold`；`hold: n` 把月相設成滿月並保持 n 回合）；`roundEnd`：有 `hold` 就 −1（到 0 刪掉）且不前進，否則前進一格；`castDef`／`castCost` 照裁定 16，只對瑟蕾。
  - 場面列：`fieldWords(s)` →「守之結界3」（加倍時「守之結界・加倍3」）、「淨之結界2」、「月相：上弦→滿月」；`ui2/scenes/battle.ts` 在戰鬥畫面上方一個 `<div class="slx-fieldbar" role="status">`，沒有字時 `hidden`，每回合播放完更新。
  - `LEGACY_NODE_IDS`（本任務）：`{ 'sacred-sake': 'purify-ward', 'thunder-thrust': 'exorcism-thrust', blessing: 'moon-recall', sanctuary: 'full-moon-night' }`；`export function upgradeTreeIds(d: Record<string, unknown>): void`（`engine/save.ts`；不是物件就不動）。
- 名冊：
  - `ward` 改名「守之結界」：`tp: 6, target: 'self', effects: [{ kind: 'barrier', barrier: 'guard', power: 30, turns: 3 }]`。
  - `purify-ward`「淨之結界」（取代 `sacred-sake` 的節點，第 1 支第 2 層，`maxRank 3`）：`tp: 8, target: 'self', effects: [{ kind: 'barrier', barrier: 'purify', power: 30, turns: 3 }]`；不再是野外技能。
  - `great-barrier`「大結界」改：`tp: 12, target: 'self', effects: [{ kind: 'barrier-boost', mul: 2, turns: 3 }]`。
  - `exorcism-thrust`「破邪突」（取代 `thunder-thrust`）：`tp: 6, target: 'enemy', mech: 'release', effects: [{ kind: 'damage', power: 150, element: 'phys', scale: 'atk', melee: true }]`。`heaven-spear` 加 `mech: 'release'`，說明補「可解放結界」。
  - `moon-recall`「收回」（取代 `blessing`，第 1 支第 3 層）：`tp: 0, target: 'self', effects: [{ kind: 'moon', step: -1 }]`。`full-moon-night`「滿月之夜」（取代 `sanctuary`，第 1 支第 4 層）：`tp: 14, target: 'self', effects: [{ kind: 'moon', hold: 3 }]`。
  - 強化節點：`chizuru-ward-up` 照舊（回合作用在結界上）；`chizuru-sake-up` → `skill: 'purify-ward'`，`pct(115, 130, 150)`「淨結強化」；`chizuru-thrust-up` → `skill: 'exorcism-thrust'`，`pct(115, 130, 150)`「破邪強化」。
  - `NO_ICON_YET_IDS` 加 `purify-ward`、`exorcism-thrust`、`moon-recall`、`full-moon-night`。
  - 預設策略：`chizuru: [{ kind: 'ensure-barrier', skills: ['ward', 'purify-ward'] }]`；瑟蕾沒有規則。

- [ ] **Step 1：先寫失敗的測試**
  - `barrier.test.ts`：
    - `one barrier at a time; a new one replaces the old`：守之結界 → `barriers` 一個、每位成員 `ward.def === 30`；再放淨之結界 → 只剩淨之結界、`ward` 消失。
    - `the purifying barrier heals and cures at round end, credited to Chizuru`：成員中毒、HP 半滿 → 回合末回復量等於同威力 `heal` 效果的公式、中毒解除；帳本的 chizuru `healing` 增加同量；千鶴倒下後同一回合末仍然回復、仍記給她。
    - `the great barrier doubles the barrier and adds three rounds`：守之結界剩 2 → 大結界後 `boost: 2`、剩 5、`ward.def === 60`；沒有結界時施放 → 什麼都沒變、TP 照扣。
    - `release spends the barrier for ten percent a round left`：守之結界剩 3 → `castDef` 的破邪突威力 195；施放後沒有結界；沒有結界時 150。
    - `barriers draw nothing`：計數 rng 下，有沒有結界的同一場戰鬥，rng 次數相同。
  - `moon.test.ts`：
    - `the moon turns each round, from the first quarter`：瑟蕾在隊上：第 0 回合 `first`，之後依序 `full`、`waning`、`new`、`first`；瑟蕾不在隊上 → `moon` 不存在。
    - `each phase helps only Selene`：滿月時她的月光威力 156（`pctOf(120, 130)`），別人的回復不變；下弦時她的月影箭威力 169；新月時夢境機率 0.78；上弦時她的月光雨 `castCost` ＝ `ceil(9 × 0.7)` ＝ 7。
    - `recall steps the moon back and ends a held full moon`：滿月時收回 → `first`，回合末 → `full`；滿月之夜 → `full` 保持 3 個回合末，第 4 個回合末前進到 `waning`；保持中收回 → `hold` 消失。
  - `engine/save.test.ts`：`a save that holds old node ids loads with them renamed`：一份合法的版本 8 存檔（千鶴 `tree` 有 `sacred-sake: 2`、`chizuru-sake-up: 1`，瑟蕾有 `blessing: 1`）→ `status: 'ok'`，千鶴 `tree['purify-ward'] === 2`、沒有 `sacred-sake`、`chizuru-sake-up` 不變，瑟蕾 `moon-recall: 1`；金幣、背包、記憶、好感度、故事狀態逐欄相同。
  - `engine/battle.test.ts` 的 `every fight starts from a fresh mechanic` 加：千鶴 `mech: { kind: 'barrier' }`、沒有 `barriers`、`moon.phase === 'first'`。
  - `render/artPaths.test.ts` 既有的 `NO_ICON_YET_IDS` 測試必須維持綠（新 id 都是真的技能、都不在 `allArtUrls()`）。
  - `scenes/battle.test.ts`：`the field bar shows the barrier and the moon`：狀態有守之結界剩 3、月相滿月 → 列中有「守之結界3」「月相：滿月→下弦」；兩者都沒有 → `hidden`。
  - e2e `the barrier and the moon show above the battle (plan 8c)`：標準隊伍進戰鬥，`game(...)` 設 `barriers` 與 `moon`，防禦一回合後 `.slx-fieldbar` 可見且含「守之結界」「月相」。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/barrier.test.ts src/scripts/games/starlantern/engine/mechanics/moon.test.ts src/scripts/games/starlantern/engine/save.test.ts src/scripts/games/starlantern/engine/battle.test.ts src/scripts/games/starlantern/ui2/scenes/battle.test.ts`。預期：`engine/mechanics/barrier`、`moon` 不存在；舊 id 的存檔被判為損毀。
- [ ] **Step 3：實作**（照 Interfaces 與相關裁定）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠。
- [ ] **Step 5：收尾 R**（`gate-3`，against `gate-2`）。千鶴與瑟蕾在每支隊伍裡，任何一格的整隊 ±5% 都要看。
- [ ] **Step 6：commit**：`feat(starlantern): Chizuru's barriers and release, Selene's moon phases; old node ids renamed on load`。

### Task 4: 莉茲「銅板」、希爾薇「瞄準」

**Files:**
- Create：`engine/mechanics/coins.ts`、`engine/mechanics/aim.ts`、對應 `.test.ts`
- Modify：`engine/mech.ts`（`aim.lock?: number`）、`engine/types.ts`（`Effect` 加 `coins`、`appraise`、`delay`、`aim-lock`；`damage` 加 `scatter?: true`；`SkillMechTag` 加 `'coin-power' | 'coin-hits' | 'consume-aim'`）、`engine/combatant.ts`（`appraised?: string`、`delay?: number`；`hitAmount` 的瞄準加成、`rollHit` 的瞄準暴擊）、`engine/battle.ts`（散射的逐段目標、`turnOrder(cs, rng, round = 0)` 把 `delay === round` 的排最後、`rewards` 的 `coinGold`）、`engine/skills.ts`、`data/skills.ts`、`data/trees.ts`、`data/gear.ts`（`shade-silent-blade`）、`data/policies.ts`、`render/artPaths.ts`、`data/text.zh-TW.ts`、結算畫面（顯示 `coinGold` 的那一行；用 `rewards` 回傳值的既有畫面檔）
- Modify（會紅的既有測試）：`data/trees.test.ts`、`engine/battle.test.ts`、`engine/policy.test.ts`、`engine/progression.test.ts`、`engine/save.test.ts`（用到 `triple-slash`、`shadow-flurry`、`fortune-strike` 的舊內容）、`render/artPaths.test.ts`（若斷言 `allArtUrls()` 的數量：−1，裁定 2）
- Test：上列新測試、`engine/sim.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Produces：
  - `coins.ts`：`export const COINS = { cap: 10, coinPowerPct: 15, gold: 2 } as const`；`MECH_OF.liz = () => ({ kind: 'coins', coins: 0 })`；`onHit`：莉茲每一下命中 +1（上限）；`Effect` `{ kind: 'coins'; amount: number }`（施放者 +amount）；`'coin-power'`：威力 `100 + 15 × coins` %；`'coin-hits'`：該招第一個傷害效果的 `hits` ＝ 銅板數（0 枚時 0 段、`castPower` 0）；兩者都在 `payMech` 把銅板歸 0（所以招本身的命中重新賺銅板）。`{ kind: 'appraise' }`：目標 `appraised = 施放者 key`，並把它的弱點全部寫進 `revealed`；被估價的敵人倒下（任何原因）時，估價者的銅板 ×2（上限）。`rewards(s, …)` 回傳多一個 `coinGold`（勝利時每位有銅板機制的成員 `coins × 2` 的總和，已加進 `gold`；不抽亂數）。
  - `damage.scatter`：`perform` 遇到帶 `scatter` 的傷害效果時，不照目標清單，而是做 `hits` 次：每次從活著的敵人中 `pick` 一個，打一段（`hits: 1` 的複本）；沒有活著的敵人就停。
  - `aim.ts`：`export const AIM = { cap: 3, dmgPct: 15, critPct: 10, consumePct: 50 } as const`；`MECH_OF.sylvie = () => ({ kind: 'aim', target: null, stacks: 0 })`；`after` 照裁定 17；`hitAmount`：攻擊者 `mech.kind === 'aim'`、`mech.target === t.key` 時 ×`(1 + 15 × stacks / 100)`；`rollHit`：同條件時暴擊機率加 `10 × stacks` 個百分點；`'consume-aim'`：威力 `100 + 50 × stacks` %，`payMech` 把層數歸 0（目標保留）；`{ kind: 'aim-lock'; turns: number }`：施放者 `{ target: 目標, stacks: 3, lock: turns }`，回合末 `lock` −1；`{ kind: 'delay' }`：目標 `delay = s.round + 1`。
  - 畫面：成員「銅板{n}」；敵人「估價」、「瞄準{n}」（鎖定時「瞄準{n}・鎖定」）、`delay` 的敵人「最後行動」。
  - `LEGACY_NODE_IDS` 加 `{ 'triple-slash': 'pickpocket', 'shadow-flurry': 'jackpot', 'venom-edge': 'appraise', 'snare-shot': 'sunder-arrow', 'fire-arrow': 'scatter-shot', 'storm-volley': 'deluge-volley' }`；`LEGACY_LEARN_LEVEL` 的 `triple-slash` 鍵改 `pickpocket`（值 6 不變）。
- 名冊：
  - `pickpocket`「順手牽羊」：`tp: 5, target: 'enemy', effects: [{ damage 120 phys atk melee }, { kind: 'coins', amount: 2 }]`。
  - `jackpot`「一擲千金」（第 0 支第 4 層）：`tp: 12, target: 'enemies', mech: 'coin-hits', effects: [{ damage 40 phys atk melee, hits: 1, scatter: true }]`。
  - `fortune-strike` 改名「大手筆」：`tp: 10, target: 'enemy', mech: 'coin-power', effects: [{ damage 200 phys atk melee }]`。
  - `appraise`「估價」：`tp: 3, target: 'enemy', effects: [{ kind: 'appraise' }]`。
  - `starfall-arrow`「星墜一矢」改：`tp: 13, mech: 'consume-aim', effects: [{ damage 260 phys atk ranged }]`。
  - `pin-shot`「釘足箭」改：`effects: [{ damage 90 phys atk ranged }, { kind: 'delay' }]`（減速拿掉）。
  - `sunder-arrow`「破甲箭」：`tp: 5, target: 'enemy', effects: [{ damage 80 phys atk ranged }, { kind: 'buff', stat: 'def', pct: -30, turns: 3 }]`。
  - `hunters-mark`「獵人標記」改：`tp: 10, effects: [{ damage 100 }, { buff def -40 turns 4 }, { kind: 'aim-lock', turns: 4 }]`。
  - `scatter-shot`「散射」：`tp: 7, target: 'enemies', effects: [{ damage 70 phys atk ranged, hits: 3, scatter: true }]`。
  - `deluge-volley`「暴雨箭」（第 2 支第 4 層）：`tp: 15, target: 'enemies', effects: [{ damage 85 phys atk ranged, hits: 2 }]`。
  - 強化節點：`liz-triple-up` → `pickpocket`，`pct` 不變「順手強化」；`liz-venom-up` → `appraise`，`tp(-1, -2, -3)`「估價節流」；`sylvie-pin-up` → `pct(110, 120, 135)`「釘足強化」；`sylvie-snare-up` → `sunder-arrow`，`deepen` 不變「破甲強化」；`sylvie-fire-up` → `scatter-shot`，`pct` 不變「散射強化」。
  - `POWERS['shade-silent-blade']`：`skill: 'rin-needle'`、`text: '飛針改為 3 段'`、`mod: { hits: 3 }`。
  - `NO_ICON_YET_IDS` 加六個新 id。
  - 預設策略：`liz: [{ kind: 'spend-at', gauge: 'coins', min: 6, skill: 'jackpot' }, { kind: 'spend-at', gauge: 'coins', min: 6, skill: 'fortune-strike' }]`；`sylvie` 照舊。

- [ ] **Step 1：先寫失敗的測試**
  - `coins.test.ts`：
    - `every landed hit is a coin, up to ten`：雙刃兩段都中 → 2；被閃避的一段不算；從 9 開始 → 10。
    - `pickpocket takes two more`：命中一段 → 3 枚。
    - `the big spender is +15% a coin and spends them all`：7 枚 → `castDef` 威力 410（`pctOf(200, 205)`）；施放後銅板 = 這一擊賺到的 1 枚。
    - `the jackpot throws one hit per coin at random foes`：5 枚、三個敵人 → 5 段，目標依序是 `pick` 的結果（用固定序列的 rng 寫死）；0 枚 → 不出手、`castPower` 0。
    - `an appraised foe doubles her coins when it falls`：估價 e0 → `revealed` 含 e0 的弱點；4 枚時 e0 被別人擊倒 → 8。
    - `left-over coins become gold`：勝利且 6 枚 → `rewards` 的 `coinGold === 12`、`gold` 多 12；逃跑或失敗沒有；`rewards` 的 rng 呼叫次數不變。
    - `the sim waits for six coins`：5 枚時 `choose` 不選一擲千金與大手筆（即使它們最強）；6 枚時選一擲千金。
    - `coins draw nothing`（散射與一擲千金的 `pick` 除外）。
  - `aim.test.ts`：
    - `aim builds on the same target and resets on another`：對 e0 兩次 → 2；換 e1 → 1；e1 倒下 → 0；箭雨不改變。
    - `each stack is +15% damage and +10% crit on that target`：2 層時對 e0 的 `hitAmount` 等於 0 層時的算式 ×1.3（寫死數字）；`x.crit: 0` 時暴擊門檻 0.2（用 `constRng(0.19)` 暴擊、`constRng(0.21)` 不暴擊）；對 e1 沒有加成。
    - `starfall spends the stacks for 50% each`：3 層 → 威力 650；施放後 0 層、目標不變。
    - `the hunter's mark locks three stacks for four rounds`：施放後對它 3 層、`lock: 4`；鎖定中打 e1 → 瞄準不變、對 e1 沒有加成；四個回合末之後恢復一般規則。
    - `a pinned foe acts last next round`：釘足箭命中 e0 → 下一回合 `turnOrder` 中 e0 排最後；rng 呼叫次數和沒有 `delay` 時相同。
    - `scatter shot fires three hits at random foes`。
  - `engine/battle.test.ts` 的 `every fight starts from a fresh mechanic` 加莉茲、希爾薇。
  - `engine/save.test.ts` 的改名測試加：莉茲 `triple-slash: 3`、`liz-triple-up: 1`、`shadow-flurry: 1` → `pickpocket: 3`、`jackpot: 1`。
  - `data/gear.test.ts`：`the silent blade now gives rin's needle three hits`；`POWERS` 不再指向任何不存在的技能（`SKILLS[p.skill]` 都存在）。
  - e2e `coins and aim show on the battle screen (plan 8c)`：莉茲在隊上（「洛恩＋凜＋莉茲＋千鶴＋瑟蕾」）設 `coins: 7`，面板含「銅板7」。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/coins.test.ts src/scripts/games/starlantern/engine/mechanics/aim.test.ts src/scripts/games/starlantern/engine/save.test.ts src/scripts/games/starlantern/engine/battle.test.ts src/scripts/games/starlantern/data/gear.test.ts`。預期：`engine/mechanics/coins`、`aim` 不存在。
- [ ] **Step 3：實作**（照 Interfaces 與相關裁定）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠。
- [ ] **Step 5：收尾 R**（`gate-4`，against `gate-3`）。
- [ ] **Step 6：commit**：`feat(starlantern): Liz's coins and Sylvie's aim; their converged rosters`。

### Task 5: 絲嘉蕾「餘燼」與代受、莎菲拉「拍子」

**Files:**
- Create：`engine/mechanics/embers.ts`、`engine/mechanics/beat.ts`、對應 `.test.ts`
- Modify：`engine/types.ts`（`Effect` 加 `cover`、`riposte`、`challenge`、`gauge`；`SkillMechTag` 加 `'ember-power' | 'clap' | 'cue-finale'`）、`engine/combatant.ts`（`cover?`、`riposte?`、`challenged?`；`dealDamage` 的餘燼累積）、`engine/battle.ts`（`perform` 的 HP 消耗改呼叫 `payHp`；轉向的優先順序與帳本池子；贖火反擊）、`engine/skills.ts`、`data/skills.ts`、`data/trees.ts`、`render/artPaths.ts`、`data/text.zh-TW.ts`
- Modify（會紅的既有測試）：`engine/skills.test.ts`（`guardian-roar`、`shield-bash` 的舊內容）、`ui2/scenes/status.test.ts:506-519`（用 `guardian-roar` 當有圖示的樹技能：改用 `blaze-ring`）、`engine/battle.test.ts`（`provoke` 的情境若受轉向順序影響）
- Test：上列新測試、`engine/ledger.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Produces：
  - `embers.ts`：`export const EMBER = { sharePct: 50, capPct: 50 } as const`；`MECH_OF.scarlet = () => ({ kind: 'embers', embers: 0 })`；`dealDamage`：她實際失去的 HP 的 50% 存成餘燼（無條件捨去），上限 `floor(maxHp × 0.5)`（持續傷害也算）；`export function payHp(c: Combatant, def: SkillDef): void`（`battle.ts` 的技能分支用它取代原本那一行）：消耗 ＝ `floor(maxHp × hpCost)`，先用餘燼付，不夠的才扣 HP（最低 1）；`'ember-power'`：付完 HP 消耗之後剩下的餘燼，每 1% 最大 HP 加 1% 威力（`castDef` 用同樣的扣法預先算），`payMech` 把剩下的歸 0。
  - 轉向（`battle.ts`）：`export function forcedTarget(s: BattleState, enemy: Combatant, act: EnemyAction): { to: Combatant; pool: Combatant[] } | null`：只看單體行動；依序 挑釁（池子＝能打到的其他成員）→ `enemy.challenged`（`round === s.round` 且挑戰者活著；池子同挑釁）→ 原目標正被某位活著的成員代受（池子＝[原目標]）。`perform` 與 `chooseEnemyActions`（挑戰）用它；`ctx.redirect = { pool }` 只在有帳本時設。
  - `Effect`：`{ kind: 'cover'; turns: number }`（目標 `ally`，施放者 `cover = { ally: 目標, turns }`；回合末 −1；她倒下就刪掉）；`{ kind: 'riposte'; power: number; turns: number }`（施放者 `riposte`；敵人的一個行動有任何一段命中她之後，她以火、`atk`、近戰、該威力對那個敵人反擊一次；反擊不會再觸發任何東西，記 `cue: 'counter'`）；`{ kind: 'challenge' }`（目標 `challenged = { by: 施放者, round: s.round + 1 }`）。
  - `beat.ts`：`export const BEAT = { max: 4, pctPer: 10 } as const`；`MECH_OF.safira = () => ({ kind: 'beat', beat: 0, last: null })`；`after`：招式代號 ＝ 技能 id、`'attack'`、`'defend'`、`'item'`、`'ultimate'`；行動前 `beat === 4` → 這次是終幕，之後 `beat = 1`；否則和 `last` 不同 → +1（上限 4），相同 → 0（踩空，`cue: 'misstep'`）；`'clap'` 再 +1；`'cue-finale'` 直接設 4；最後寫 `last`。`castDef`（只對她的技能）：傷害威力與增益百分比 ×`(100 + 10 × beat)` %；終幕時另外：增益的目標從 `self`／`ally` 改為 `allies` 且每個持續效果 +1 回合、每個傷害效果 `hits` +1（記 `cue: 'finale'`）。`{ kind: 'gauge'; amount: number }`：目標的 `limit` 加 amount（上限 100）。
  - 畫面：成員「餘燼{n}」、「代受：{名字}」、「贖火{n}」、「拍子{n}」（4 時「拍子4・終幕」）；cue：`misstep` →「這一步踩空了呀。」（log 同一句，前面加名字與冒號）、`finale` →「終幕」、`counter` →「贖火」。
  - `LEGACY_NODE_IDS` 加 `{ 'guardian-roar': 'cover', fortress: 'atoning-flame', 'veil-dance': 'clap', sirocco: 'mirage-step' }`。
- 名冊：
  - `cover`「代受」（第 0 支第 2 層）：`tp: 5, target: 'ally', effects: [{ kind: 'cover', turns: 3 }]`。
  - `atoning-flame`「贖火」（第 2 支第 4 層）：`tp: 12, target: 'self', effects: [{ kind: 'riposte', power: 80, turns: 4 }]`。
  - `shield-bash`「盾擊」改：`tp: 4, effects: [{ damage 120 phys atk melee }, { kind: 'challenge' }]`（降攻拿掉）。
  - `crimson-end` 加 `mech: 'ember-power'`。
  - `clap`「拍手」（第 1 支第 2 層）：`tp: 0, target: 'allies', mech: 'clap', effects: [{ kind: 'gauge', amount: 10 }]`（說明可以用「掌聲呢？」）。
  - `mirage-step`「蜃樓步」（第 2 支第 4 層）：`tp: 8, target: 'self', mech: 'cue-finale', effects: [{ kind: 'buff', stat: 'spd', pct: 30, turns: 3 }]`。
  - 強化節點：`scarlet-roar-up` → `cover`，`turns(4, 5, 6)`「代受延長」；`scarlet-bash-up` → `pct(115, 130, 150)`「盾擊強化」；`safira-veil-up` → `skill: 'war-dance'`，`turns(4, 5, 6)`「戰舞延長」。
  - `NO_ICON_YET_IDS` 加四個新 id。預設策略：`safira` 照舊 `alternate`；`scarlet` 沒有規則。

- [ ] **Step 1：先寫失敗的測試**
  - `embers.test.ts`：
    - `half of what she takes becomes embers, up to half her HP`：失去 40 → 20；毒傷也算；滿了不再增加。
    - `fire costs are paid from embers first`：餘燼 10、爆炎斬消耗 15 → 餘燼 0、HP −5；餘燼 30 → 餘燼 15、HP 不變。
    - `crimson end burns every ember left`：最大 HP 200、餘燼 100、消耗 60 → 先付 60，剩 40 ＝ 20% → 威力 `pctOf(380, 120)`；施放後 0。
    - `cover takes the single hits meant for her ally`：代受千鶴 → 敵人對千鶴的普通攻擊打到絲嘉蕾，帳本的防止量 ＝ `lossOf(千鶴, 重算) − 實際損失`；範圍攻擊照常打到千鶴；三個回合末之後結束；絲嘉蕾倒下立即結束。
    - `taunt beats challenge beats cover beats the first target`：四種組合各一個斷言（同時挑釁＋代受 → 挑釁者；被盾擊挑戰的敵人 → 挑戰者；代受與原目標 → 代受者；都沒有 → 原目標）。
    - `the atoning flame strikes back once per enemy action`：贖火中被兩段攻擊命中 → 反擊一次、目標是那個敵人、`cue: 'counter'`；反擊被閃避也只一次；被閃避的敵人行動不反擊。
    - `a challenged foe can only strike her next round`：盾擊命中 e0 → 下一回合 e0 的計畫目標是絲嘉蕾（不抽 `pick`）。
  - `beat.test.ts`：
    - `a different move each turn counts the beat`：刃舞、攻擊、影步斬 → 1、2、3；刃舞再刃舞 → 0，記 `cue: 'misstep'`。
    - `each beat is +10% to her skills`：拍子 3 時刃舞每段威力 65（`pctOf(50, 130)`）、戰舞 33（`pctOf(25, 130)`，四捨五入遠離零）。
    - `the fourth beat's move is the finale`：拍子 4 時刃舞 4 段；戰舞（全體）多 1 回合；之後拍子 1；`cue: 'finale'`。
    - `clap raises everyone's gauge by ten and the beat by one more`：拍子 1 → 3；每位活著的成員 `limit` +10（上限 100）。
    - `mirage step cues the finale`：施放後 `beat === 4`、自身速度 +30%。
    - `the sim's alternate rule keeps the beat`：`choose` 連續五個回合沒有踩空（`policy` 的 `alternate`）。
    - `beat draws nothing`。
  - `engine/battle.test.ts` 的 `every fight starts from a fresh mechanic` 加絲嘉蕾、莎菲拉；`engine/save.test.ts` 的改名測試加四筆。
  - e2e `embers and the beat show on the battle screen (plan 8c)`（莎菲拉在隊上，設 `beat: 2` → 面板含「拍子2」）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/embers.test.ts src/scripts/games/starlantern/engine/mechanics/beat.test.ts src/scripts/games/starlantern/engine/save.test.ts src/scripts/games/starlantern/engine/battle.test.ts`。預期：`engine/mechanics/embers`、`beat` 不存在。
- [ ] **Step 3：實作**（照 Interfaces 與相關裁定）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠。
- [ ] **Step 5：收尾 R**（`gate-5`，against `gate-4`）。
- [ ] **Step 6：commit**：`feat(starlantern): Scarlet's embers, cover and atoning flame; Safira's beat and finale`。

### Task 6: 波比「裝置」、洛恩「殘響」

**Files:**
- Create：`engine/mechanics/devices.ts`、`engine/mechanics/echo.ts`、對應 `.test.ts`
- Modify：`engine/mech.ts`（`Device` 加 `kind: DeviceKind; power: number`）、`engine/types.ts`（`Effect` 加 `device`、`overclock`、`tune-up`；**移除** `turret`）、`engine/combatant.ts`（移除 `turret` 欄位與 `turret` 事件）、`engine/battle.ts`（`Action` 加 `echo`；`BattleState.echo?`；移除舊砲台迴圈；`fresh()`）、`engine/skills.ts`（新效果、`patchSkill` 的 `device` 威力與回合，`lg-bobby` 的 `turns: 5` 與 `twin-turret` 的 `powerDelta`／`turnsDelta` 作用在它上面）、`engine/progression.ts`（`pctMod` 的 `turret` → `device`）、`engine/testing.ts`（`makeCombatant` 拿掉 `turret: null`）、`data/skills.ts`、`data/trees.ts`、`data/talents.ts`（`blueprint` 說法）、`data/policies.ts`、`render/artPaths.ts`、`data/text.zh-TW.ts`（`T.log.turret` 改為裝置）、`ui2/battleText.ts`、`ui2/scenes/battle.ts`（洛恩的「殘響」指令）
- Modify（會紅的既有測試，改成裝置寫法）：`engine/battle.test.ts`（含 8b 的 `a turret hit still wakes a sleeper`）、`engine/skills.test.ts`、`engine/ledger.test.ts`（`turrets to their builder`）、`engine/policy.test.ts`（`Device` 字面值加 `kind`、`power`）、`data/trees.test.ts`、`data/data.test.ts`（野外清單拿掉 `repair-kit`、`emergency-repair`）、`data/talents.test.ts`（`blueprint` 文字）、`ui2/battleText.test.ts`
- Test：上列新測試、`data/roster.test.ts`（`turret` 例外生效）、`engine/sim.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Produces：
  - `devices.ts`：`export type DeviceKind = 'turret' | 'drone' | 'shield' | 'mine' | 'coil'`；`export const DEVICE = { cap: 2, maxLevel: 3, levelPct: 25, coilShock: 0.3 } as const`；`MECH_OF.bobby = () => ({ kind: 'devices', devices: [], cap: 2 })`；`Effect` `{ kind: 'device'; device: DeviceKind; power: number; turns: number }`（放置／改良／取代照裁定 18）；`roundEnd`（依裝置順序）：效果量 ＝ `power × (1 + 0.25 × (level − 1))`（`blueprint` 再 ×1.3，四捨五入成整數威力）：`turret` 對 `pick` 的一名敵人 `phys`／`mag`／遠程一擊；`drone` 對 HP 比例最低的活著成員 `heal`；`shield` 對 HP 比例最低的成員給護盾，量 ＝ `heal` 公式的值，已有護盾時取較大者、`src` 換成這次的；`mine` 對全體敵人 `thunder`／`mag` 一擊；`coil` 同 `mine`，每個被命中的敵人再 `inflictAilment(..., 'shock', 0.3)`；每次運作記 `act`（標籤＝裝置名）；之後每個裝置 −1 回合、到 0 移除。`{ kind: 'overclock' }`：每個裝置立刻照上面運作一次（不扣回合）。`{ kind: 'tune-up'; levels: number; turns: number }`：每個裝置等級 +levels（上限 3）、回合 +turns。波比倒下 → `devices` 清空。
  - `echo.ts`：`export const ECHO = { powerPct: 70 } as const`；`BattleState.echo?: { by: string; round: number; def: SkillDef; cost: number }`（`after` 依裁定 20 記錄）；紀錄的 `round` 是施放當下的 `s.round`（`resolveRound` 開頭已經 +1）；`export function echoOf(s: BattleState, round = s.round): NonNullable<BattleState['echo']> | null`：`rec.round >= round − 1` 才回傳紀錄。`perform` 用預設值；指令列在兩回合之間呼叫 `echoOf(s, s.round + 1)`（即將開始的那一回合）；`Action` `{ kind: 'echo'; target?: string }`：只有洛恩；付 `cost` TP（不夠記 `no-tp`），用 `patchSkill(def, { powerPct: 70 })` 從洛恩的立場解析目標並套用，記 `act` 標籤 `殘響・{招名}`，量表照一般行動累積。
  - 畫面：成員「砲台Lv2・3」這種「{裝置名}Lv{等級}・{回合}」、「護盾{n}」；洛恩的指令列多一項 `{ id: 'echo', label: T.cmd.echo(招名) }`（「殘響：火之星彈」），沒有紀錄時「殘響」且 `disabled`；選目標沿用技能的流程（依 `def.target`）。
  - `LEGACY_NODE_IDS` 加 `{ 'repair-kit': 'repair-drone' }`。
- 名冊：
  - `turret`「設置砲台」：效果改為 `[{ kind: 'device', device: 'turret', power: 70, turns: 3 }]`（威力、回合不變，裁定 4）。
  - `barrier` 改名「護盾產生器」：`tp: 6, target: 'self', effects: [{ kind: 'device', device: 'shield', power: 40, turns: 3 }]`。
  - `repair-drone`「修理無人機」（第 1 支第 1 層）：`tp: 5, target: 'self', effects: [{ kind: 'device', device: 'drone', power: 45, turns: 3 }]`；不是野外技能。
  - `shock-mine`「電擊地雷」改：`tp: 7, target: 'self', effects: [{ kind: 'device', device: 'mine', power: 35, turns: 3 }]`。
  - `tesla-coil`「特斯拉線圈」改：`tp: 15, target: 'self', effects: [{ kind: 'device', device: 'coil', power: 60, turns: 3 }]`。
  - `overclock`「超頻」改：`tp: 7, target: 'self', effects: [{ kind: 'overclock' }]`。
  - `emergency-repair` 改名「全面整備」：`tp: 15, target: 'allies', effects: [{ kind: 'tune-up', levels: 1, turns: 3 }, { kind: 'cure' }]`；拿掉 `field`。
  - 強化節點：`bobby-repair-up` → `repair-drone`，`pct` 不變「無人機強化」；其餘照舊（威力、回合作用在裝置上）。
  - `MEMORY_KEYSTONES.blueprint` 的說明：「……裝置效果 +{M.turretPct}%」（數值鍵名不改）。
  - `NO_ICON_YET_IDS` 加 `repair-drone`。預設策略：`bobby: [{ kind: 'ensure-device', skills: ['turret', 'shock-mine', 'barrier', 'repair-drone'] }]`。洛恩沒有規則；`choose` 從不輸出 `echo`。

- [ ] **Step 1：先寫失敗的測試**
  - `devices.test.ts`：
    - `a device runs at every round end, and a second of the same kind upgrades it`：放砲台 → 回合末砲擊一次、剩 2；再放 → `level: 2`、剩 3，威力 `round(70 × 1.25)`；第三次 → 3；第四次仍 3。
    - `two at most; a third kind replaces the one closest to running out`。
    - `the drone heals, the generator shields, the lowest first`：HP 比例最低的成員得到回復／護盾，量等於同威力 `heal` 的公式；帳本記給波比（`healing`、`shield`）。
    - `the coil shocks at thirty percent`：`constRng(0.29)` 感電、`0.31` 不感電；頭目機率減半（8b 規則）。
    - `overclock runs every device once more; the tune-up raises them all`：兩個裝置 → 超頻後各運作一次、回合不變；全面整備 → 等級 +1、回合 +3、全隊解除異常。
    - `the memory blueprint is +30% to every device`。
    - `legendary and tree rewrites still reach the turret`：`lg-bobby` → 回合 5；只有 `twin-turret` → 威力 112（`powerDelta` 60 → 160%）、回合 4。
    - `when its owner or its target falls`：波比倒下 → 裝置清空、回合末沒有任何運作。
  - `echo.test.ts`：
    - `the hero echoes a companion's last skill at 70%`：這一回合諾艾兒施放熱度 3 的火之星彈（威力 174）→ 洛恩殘響的威力 122（`pctOf(174, 70)`），付同樣的 TP，標籤「殘響・火之星彈」。
    - `only this round's or the last round's, and only plain skills`：兩回合前的紀錄不可用；結界、裝置、月相、銅板這類招不被記錄；洛恩自己的招不被記錄。
    - `the sim never echoes`：整場模擬的每一個 `choose` 輸出都沒有 `kind: 'echo'`。
  - `scenes/battle.test.ts`：`the hero's echo command names what it repeats, greyed when there is nothing`。
  - `engine/battle.test.ts` 的 `every fight starts from a fresh mechanic` 加波比（`devices: []`）與「沒有 `echo`」。
  - e2e `devices and the echo command show on the battle screen (plan 8c)`（波比在隊上，`game(...)` 放一座砲台 → 面板含「砲台Lv1」；洛恩輪到時指令列含「殘響」）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/devices.test.ts src/scripts/games/starlantern/engine/mechanics/echo.test.ts src/scripts/games/starlantern/engine/battle.test.ts src/scripts/games/starlantern/ui2/scenes/battle.test.ts src/scripts/games/starlantern/data/roster.test.ts`。預期：`engine/mechanics/devices`、`echo` 不存在；`turret` 仍是舊的效果種類。
- [ ] **Step 3：實作**（照 Interfaces 與相關裁定）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠。
- [ ] **Step 5：收尾 R**（`gate-6`，against `gate-5`）。
- [ ] **Step 6：commit**：`feat(starlantern): Bobby's devices replace the old turret path; the hero's echo command`。

### Task 7: 名冊收斂的守門與整體驗收

**Files:**
- Modify：`data/roster.test.ts`
- Create（SDD）：`parity-8c.md`（每個等級、每支隊伍、每位受測者：8b 基準 → 8c 的每回合貢獻四項與合計、`rule`、`allowed`）
- Test：`data/roster.test.ts`

**Interfaces:**
- Consumes：Task 1–6 的全部名冊與 `checkParity` 的 rows。

- [ ] **Step 1：先寫測試**（`data/roster.test.ts`，「夥伴」＝ `owner !== 'hero'` 的技能，絕技與天賦不算）
  - `84 companion skills: 54 kept, 15 changed, 15 replaced`：`REPLACED` 15 個舊 id 都不在 `SKILLS`；15 個新 id 都在、`owner` 對、都在 `NO_ICON_YET_IDS`；夥伴技能總數 84；`LEGACY_NODE_IDS` 恰好 15 筆、每個值都是 `NODES` 裡同一個角色的節點。
  - `each concept belongs to one character`：
    - 對我方的正值 `def`／`res` 增益：只有絲嘉蕾的 `self` 技能；`barrier` 效果只有千鶴。
    - `heal` 效果只有瑟蕾；`device` 效果只有波比。
    - 目標 `allies` 的正值 `atk`／`spd` 增益只有莎菲拉；自身 `spd` 增益只有莉茲（疾步、幻影步）與莎菲拉（蜃樓步，終幕機制的一部分，spec §8.7）。
    - 對敵方的負值 `atk` 只有莉茲；負值 `def` 只有希爾薇；`inflict poison` 只有凜；`inflict sleep` 只有瑟蕾；`taunt`、`cover`、`challenge` 只有絲嘉蕾。
    - 傷害屬性只出現在各自的身分屬性：諾艾兒 火冰雷、絲嘉蕾 物理火、瑟蕾 冰、波比 物理雷（裝置的 `mine`／`coil` 算雷）、其他人只有物理。
  - `every legendary power names a living skill`：`POWERS` 的 `skill` 都在 `SKILLS`；`shade-silent-blade` → `rin-needle`、`mire-whisper-gloves` → `rin-venom-needle`；其他 12 個的 `skill` 等於 `roster-8b.json`。
  - `every tree node still stands where it stood`：每個角色、每支、每層，`maxRank` 等於 `roster-8b.json` 的 `trees`；節點 id 等於錄下的 id，或等於 `LEGACY_NODE_IDS[錄下的 id]`。
- [ ] **Step 2：執行**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/roster.test.ts`。任何一條不成立 → 回到負責的任務修（不是改測試）；修不了就停下來回報。
- [ ] **Step 3：整體驗收**：全套全綠、tsc 0、閘門 `gate-7`（against `gate-6`，必須 `identical`：本任務只加測試）、e2e 全綠；寫 `parity-8c.md`。
- [ ] **Step 4：commit**：`test(starlantern): the converged roster — one concept per character, every power and node accounted for`。

---

## 交給之後計畫的介面（摘要）
- 機制掛鉤：`engine/mechanics/index.ts` 的 `MechModule`、`MODULES`、`MECH_OF`、`castDef`、`castCost`、`payMech`、`onLandedHit`、`afterAction`、`mechRoundEnd`、`memberWords`／`foeWords`／`fieldWords`、`MechWord`／`MechTone`／`MechCue`。第 ③ 步的機制節點改這些模組的常數或狀態（例：`HEAT.max` 依節點、`mark.cap` 2、`DEVICE.cap` 3），第 ⑤ 步的符文在 `castDef` 之前改寫（spec §6.6 的順序：傳說威力 → 標籤 → 符文 → 深淵 → 機制改寫在施放時）。
- 帳本：挑釁／挑戰的平均池、代受的單人池（`EffectContext.redirect.pool`）、`ward` 因素、`dealDamage(t, n, { dot, ledger, log })` 的護盾計分。
- 戰力對等：`checkParity` 的 `cell`／`sum`／`party` 三種規則，基準 `contribution.8b.json`。8c 結束時的數字在 SDD 的 `parity-8c.md`、平衡快照在 `gate-7/`。
- 存檔：`LEGACY_NODE_IDS` 與 `upgradeTreeIds`（第 ④ 步的 `migrate8to9` 取代它）。
- 美術：15 個新 id 在 `NO_ICON_YET_IDS`；`triple-slash` 的已發布圖檔留給第 ⑨ 步處理；機制文字的色表 `$slx-mech`／`MECH_FILL`，計數圖示（spec §15）到了以後加在文字前面。
