# 星燈迷宮 計畫 8b：新的異常狀態與「增益取最強」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 技能深化 spec §17 的第 ① 步：引擎支援灼燒、凍結（頭目改冰緩）、感電、流血四種新異常（§9），持續傷害不再叫醒睡眠，同屬性同方向的增益改為「留下比較強的、回合取較長的」，異常機率依抗性計算，戰鬥畫面用文字與顏色標籤顯示每個戰鬥者的異常與剩餘回合。凍結的平衡帶全部維持在門檻內。

**Architecture:**
- **異常是 `Combatant` 上的可選欄位**（`burn?`、`bleed?`、`shock?`、`frozen?`、`freezeGuard?`、`chill?`），沒有異常的戰鬥者物件和現在完全一樣。規則集中在新檔 `engine/ailments.ts`（機率、施加、回合末跳傷與倒數、清除、畫面用的標籤清單）；`applyEffect`、`endOfRound`、回合迴圈只呼叫它。
- **本計畫不新增任何會造成新異常的內容**（spec §9「異常不會自動發生」、§10.3 普通難度的敵人不新增異常）。新異常的來源（名冊、變招、符文）在之後的計畫。所以會移動普通難度量測值的只有兩條規則：持續傷害不叫醒睡眠（Task 3）、增益取最強（Task 4）。這兩條是 spec 寫死的規則，沒有可以調的數字：任何平衡帶過不了就停下來回報，不放寬、不改別的數字。
- **畫面先用文字標籤**：每個異常一個短字＋回合數（例「灼燒3」「流血×2」「凍結」），顏色依異常；我方顯示在頭像面板（DOM），敵人顯示在血條下方（Pixi 文字）。美術計畫（§15、§17 ⑨）交付異常圖示後，在標籤前面加圖示；在那之前不請求任何圖片、不畫任何形狀。

**Tech Stack:** TypeScript、Vitest（happy-dom）、PixiJS、SCSS、Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-10-20-starlantern-skill-builds-design.md`（使用者 2026-10-20 核准「可以」），本計畫實作 §9（全部）、§11「決定性」「戰鬥紀錄」中異常的部分、§12.4「異常不洗版」、§17 ①、§17 第 5 點的抗性公式。**前置：計畫 8a 已合併**（`docs/superpowers/plans/2026-10-20-starlantern-plan8a-sim-policies.md`）。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄：`.superpowers/sdd/2026-10-20-starlantern-plan8b-ailments-buffs/`。行號是 2026-10-20 在 HEAD `72385e4b`（8a 之前）讀到的，只供定位；動手時一律用內容找。

## 計畫裁定

1. **機率公式**（spec §17 的建議）：`ailmentChance(t, status, chance) = chance × (t.boss && status !== 'freeze' ? 0.5 : 1) × (1 − res / 100)`，`res`：中毒 `poisonRes`、睡眠 `sleepRes`、灼燒 `fireRes`、凍結 `iceRes`、感電 `thunderRes`、流血 0。中毒與睡眠的值和現在的算式（`engine/skills.ts:147`）逐位元相同（同樣的乘法順序）。凍結對頭目**不減半**：spec §9 的頭目欄對凍結只寫「改為冰緩」。處於凍結保護期（`freezeGuard > 0`）的非頭目，凍結機率是 0。
2. **抽骰**：新的四種用 `roll(p, rng)`（機率 ≤ 0 不抽，spec §11）；**中毒與睡眠維持現在的「永遠抽一次」**（`ctx.rng() < p`）。spec §11 說「機率為 0 的事不抽」，但改掉舊的兩種會移動既有的亂數序列。
3. **灼燒、流血的基準是「造成它的那一擊」**：同一次行動裡，施放者對這個目標最後一次命中的傷害（`dealDamage` 回傳、記在 `ctx.lastHit`）。沒有這一擊（例如單純的異常技）就不施加、不抽骰；資料守門測試保證所有灼燒、流血的 `inflict` 都排在同一張效果清單的某個 `damage` 後面。跳傷 ＝ `max(1, floor(那一擊 × 35% 或 20%))`，之後不再套抗性與護甲（spec：流血「護甲不擋」；灼燒的那一擊已經套過火抗）。
4. **灼燒只留一個**：新的跳傷比較大就換成新的（含來源），否則保留舊的；回合數取兩者較長的（和增益同一條規則，玩家只要記一件事）。
5. **流血最多 3 層**：未滿就加一層；滿了而新的一層比最弱的一層強，就取代最弱的那層（同強度取剩餘回合最少的）；否則不加。每層各自跳傷、各自倒數。
6. **感電**：被感電的目標受到的每一擊（`hitAmount`，放在 `defending` 那一行之後）與每一次跳傷（中毒、灼燒、流血）都 ×1.2。
7. **凍結**：輪到被凍結的戰鬥者時，這次行動直接跳過（先於睡眠判斷，睡眠回合數不動），解除凍結並設 `freezeGuard = 3`；回合末 `freezeGuard` −1。效果是解凍的那一回合剩下的時間＋之後 2 回合不會再被凍結（spec「解除後 2 回合內」）。凍結不會因為受傷而解除。敵人被凍結時，`planEnemies` 照常計畫（亂數照抽），意圖欄顯示「凍結中」，輪到它時跳過。
8. **冰緩**（頭目的凍結）：`chill = max(chill, 2)`，速度 −30%（在 `stat(c, 'spd')` 的百分比加總中加 −30）。頭目永遠不會有 `frozen`（spec §12.4「異常不洗版」由規則保證）。
9. **回合末的順序**：每個戰鬥者依現在的順序：中毒跳傷 → 灼燒跳傷 → 流血各層跳傷 →（原本的 `regen`、TP 回復）→ 增益倒數 → 灼燒、流血、感電、冰緩、凍結保護期各 −1，到 0 就刪掉欄位。
10. **清除**：倒下時清掉所有異常（含 `freezeGuard`）；`cure` 效果清掉中毒、睡眠、灼燒、流血、感電、凍結、冰緩（不清保護期）。
11. **帳本**（8a）：灼燒、流血的跳傷記給該層的 `src`；感電多出來的傷害自然記給出手的人；凍結與冰緩是控制，不計（spec §12.6）。
12. **增益取最強**：同屬性、同方向時比 `|pct|`：新的比較強就換成新的（`pct`、`src`），否則保留舊的；`turns` 一律取兩者較長的。上限 3 個、滿了丟最舊的，不變。
13. **存檔**：戰鬥狀態不存檔（`saveGame` 只寫 `GameState`，`engine/save.ts:137`；`Game.battle` 只在記憶體），所以不需要升版或遷移；Task 1 用測試釘住這件事。
14. **平衡基準**：8a 的夾具是舊規則下的 HEAD。本計畫 Task 3、4 會移動數字，所以每個任務的閘門 `against` 用前一個任務在 SDD 目錄的快照（第一個任務用 8a 的夾具 `engine/__fixtures__/sim-gate/`），**不覆寫 8a 的夾具**。戰力對等的基準也不重錄：`engine/parity.test.ts`（±10%／±5%，對 8a 的舊名冊基準）必須在每個任務之後仍然通過。

---

## 控制者裁定（2026-10-20，覆蓋本文衝突處）

1. **戰力對等基準在 ① 之後重錄**：⓪ 錄的基準是舊規則下的舊名冊。本計畫合併前，最後一個任務在新規則（增益取最強、持續傷害不叫醒睡眠、新異常）下重錄舊名冊的每人／全隊貢獻基準，放到 `engine/__fixtures__/sim-gate/` 的新檔（舊檔保留），② 名冊步驟只和這份比，才能只量到名冊本身的變化。重錄的差異寫進報告，交審查。
2. **「灼燒」撞名**：新異常沿用「灼燒」；地區特性 `burn` 的顯示名改為「酷熱」（`data/text.zh-TW.ts:536` 及所有引用處），併進任務 5，附測試確認兩者顯示名不同。

## Global Constraints

**使用者的方向（最高依據）**
- 「不裝符文頂多過普通」：普通難度的驗收＝預設配點、沒有符文的模擬；`engine/balance*.test.ts` 的全部門檻凍結，只准收緊。平衡只對照預設配點（記憶「星燈迷宮必須配點」）。
- 本步會移動普通難度的量測值：**每個任務都跑完整平衡帶**。門檻不動；只能在 spec 的規則內調整新內容的數字——本計畫沒有新內容，所以任何平衡帶或戰力對等過不了，就停下來回報 BLOCKED（附數字），絕不放寬。

**分支與基準**
- `feat/starlantern-story`，計畫 8a 合併之後的 HEAD。開工前 `git status`：`engine/battle.ts`、`engine/combatant.ts`、`engine/skills.ts`、`engine/sim.ts`、`engine/balance*.test.ts`、`ui2/scenes/battle.ts`、`render/BattleView.ts` 若有別人未提交的修改，停下來回報 NEEDS_CONTEXT。

**測試與檢查**
- TDD：每個任務先寫失敗的測試，確認它因為正確的理由失敗，再實作。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`。
- 全套：`rtk proxy npx vitest run --testTimeout=20000`（8a 之後的數量，全綠）。讀「Test Files」與「Tests」兩行。不可以用 `npm run test`。
- 完整平衡帶＋閘門（8a 的腳本，Git Bash 語法）：`rtk proxy bash scripts/starlantern-sim-gate.sh <輸出目錄> <against 目錄>`。它同時跑四個平衡檔與 `engine/parity.test.ts`，印出 Test Files／Tests，並比對行動雜湊、排序後的報告行與貢獻表。一次只跑一套重的測試。
- tsc：`rtk proxy npx tsc --noEmit -p .`。repo 原本有 43 個錯誤；完成條件是 starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個。
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。headless、靜音；只用 4352，絕不用 4354，不可以結束任何程序。
- 本專案沒有 prettier、eslint，不要跑。

**換行（逐檔保留）**
- 改檔前用 `git ls-files --eol <檔案>` 確認；改完看 `git diff --stat`，整檔被改寫就是換行壞了。CRLF 檔不可以用 `sed -i`。新檔一律 LF。
- 2026-10-20 量到的：CRLF：`engine/types.ts`、`engine/combatant.test.ts`、`engine/battle.test.ts`、`engine/testing.ts`、`data/skills.ts`、`data/enemies.ts`。LF：`ui2/battleText.ts`、`ui2/battleText.test.ts`、`ui2/rarity.test.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`。**混用**（新增的行跟著上下文那幾行）：`engine/battle.ts`、`engine/combatant.ts`、`engine/skills.ts`、`engine/skills.test.ts`、`engine/save.test.ts`、`data/text.zh-TW.ts`、`ui2/partyBar.ts`、`ui2/partyBar.test.ts`、`ui2/scenes/battle.ts`、`ui2/scenes/battle.test.ts`、`render/BattleView.ts`、`render/BattleView.test.ts`。8a 新增的檔是 LF。

**亂數**：不可以呼叫 `Math.random`。新的機率只用戰鬥的 `rng`、依固定順序、機率為 0 不抽（裁定 2 的例外除外）。`game.rng`、`lootRng`、`memoryRng`、`fillRooms` 的 rng 一次都不多抽。

**git**
- 一律寫出完整路徑 add，不可以 `git add -A`／`git add .`。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。由控制者 commit 時照各任務最後一步的訊息。
- 絕對不可以執行 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。不 push。不覆寫 `engine/__fixtures__/sim-gate/` 底下的任何檔。

**介面**：SCSS 禁 `!important`；禁行內樣式（含 `element.style`）。不新增任何圖片、假圖示，不用 CSS 畫圖示或形狀（標籤沿用 `.slx-pm-row` 那種「文字＋`currentColor` 細框」的既有樣式）。`allArtUrls()` 的數量不變。新的介面文字放 `data/text.zh-TW.ts`（唯一例外：`intentLabel` 的「凍結中」跟著同函式既有的字面值），繁體中文、全形標點，語氣照現有的戰鬥紀錄（《文風聖經》）。

**測試修改規則**：某任務會弄壞的既有測試，都列在該任務的 Files 與步驟裡。全套跑出沒列到的紅燈，先停下來回報 NEEDS_CONTEXT。`it.fails`、`it.skip`、`.only`、`.todo` 不可以出現在 commit。

**子代理**：實作者不派子代理。

## Review Focus
1. **睡著又中毒（或灼燒、流血）的目標撐過回合末還在睡，被打一下才醒；砲台的一擊也算「命中」。** 測試：Task 3 的 `a sleeper keeps sleeping through every tick` 與 `a turret hit still wakes a sleeper`。
2. **頭目從來不會被凍結、不會被跳過；保護期內的凍結嘗試一次亂數都不抽。** 測試：Task 1 的 `a boss is chilled, never frozen` 與 `freeze draws nothing while the guard holds`，Task 2 的 `a frozen boss does not exist: its turn is never skipped`。
3. **倒下、復活、淨化之後身上乾乾淨淨；被凍結的我方成員不會出現在指令輪替裡。** 測試：Task 2 的 `death and cure clear every ailment`，Task 5 的 `a frozen member is skipped when choosing commands`。
4. **弱的增益不會蓋掉強的，但會延長它；負的減益比較「強」的是更負的那個。** 測試：Task 4 的四個 `addBuff` 測試。
5. **手機寬度下異常很多時不爆版。** 一位成員同時有五種異常、敵人有三層流血：面板內換行不溢出、敵人只有一個「流血×3」。測試：Task 5 的 `partyBar` 測試與 e2e 的 390 寬截圖檢查。

---

## File Structure
- `engine/ailments.ts`（新）：常數、型別、機率、施加、回合末、清除、標籤清單（Task 1、2）。
- `engine/types.ts`：`inflict` 的 `status` 加四種（Task 1）。
- `engine/combatant.ts`：`Combatant` 的異常欄位（Task 1）；`stat` 的冰緩、`hitAmount` 的感電（Task 2）；`dealDamage` 的 `dot` 選項（Task 3）；`addBuff` 取最強（Task 4）；`BattleEvent` 新類型（Task 1、2）。
- `engine/skills.ts`：`inflict`、`cure`、`ctx.lastHit`（Task 1、2）。
- `engine/battle.ts`：回合迴圈的凍結、`endOfRound` 的跳傷與倒數、`intentLabel` 的「凍結中」（Task 2、5）。
- `data/text.zh-TW.ts`、`ui2/battleText.ts`：異常名稱、標籤、紀錄文字（Task 2、5）。
- `ui2/partyBar.ts`、`ui2/scenes/battle.ts`、`render/BattleView.ts`、`src/styles/_starlantern-ui.scss`：異常標籤（Task 5）。
- `tests/e2e/starlantern.spec.ts`：一個新測試（Task 5）。

---

### Task 1: 異常的狀態、機率與施加（還沒有回合效果）

**Files:**
- Create：`engine/ailments.ts`、`engine/ailments.test.ts`
- Modify：`engine/types.ts:29`（`inflict.status`）、`engine/combatant.ts:9-43`（欄位）、`:45-68`（`BattleEvent` 的 `status` 欄位型別）
- Modify：`engine/skills.ts:7`（`EffectContext.lastHit?`）、damage 分支（每次命中後設 `ctx.lastHit`）、`:144-155`（`inflict` 改呼叫 `inflictAilment`）
- Modify：`engine/battle.ts` `perform` 開頭（每次行動先清 `ctx.lastHit`）
- Modify：`data/text.zh-TW.ts:154`（`T.log.status` 的參數型別改成 `AilmentShown`，新增五句）、`ui2/battleText.ts:22`（不變，只吃新型別）
- Test：`engine/ailments.test.ts`、`engine/skills.test.ts`、`engine/save.test.ts`、`ui2/battleText.test.ts`

**Interfaces:**
- Consumes：8a 的 `roll`、`EffectContext`（含 `ledger`）。
- Produces（`engine/ailments.ts`）：
  - `export type AilmentId = 'poison' | 'sleep' | 'burn' | 'freeze' | 'shock' | 'bleed'`；`export type AilmentShown = AilmentId | 'chill'`。
  - `export const AILMENT = { burnPct: 35, burnTurns: 3, bleedPct: 20, bleedTurns: 3, bleedMax: 3, shockPct: 20, shockTurns: 2, freezeGuard: 3, chillSpdPct: -30, chillTurns: 2, bossMul: 0.5 } as const`（`freezeGuard: 3` 見裁定 7）。
  - `export interface Dot { tick: number; turns: number; src: string }`；`Combatant` 加 `burn?: Dot; bleed?: Dot[]; shock?: number; frozen?: true; freezeGuard?: number; chill?: number`。
  - `export function ailmentChance(t: Combatant, status: AilmentId, chance: number): number`（裁定 1）。
  - `export function inflictAilment(actor: Combatant, t: Combatant, status: AilmentId, chance: number, ctx: EffectContext): void`：中毒、睡眠照舊（永遠抽、`status`／`resist` 事件、中毒來源照 8a）；新的四種用 `roll`，成功時依裁定 3–5、7、8 施加並記 `{ type: 'status', target, status }`（頭目的凍結記 `status: 'chill'`），失敗記 `resist`；機率 0（保護期、沒有基準的一擊）時什麼都不記、不抽。
  - `EffectContext.lastHit?: { target: string; amount: number }`。
  - `T.log.status(who, s: AilmentShown)`：`burn` →「{who}燒起來了」、`freeze` →「{who}被凍住了」、`chill` →「{who}的動作變慢了」、`shock` →「{who}觸電了」、`bleed` →「{who}開始流血了」；中毒、睡眠照舊。

- [ ] **Step 1：先寫失敗的測試**
  - `ailments.test.ts`：
    - `the chance formula`：`chance 0.4` 對一般敵人 `fireRes 25` 的灼燒 ＝ 0.3；頭目 ＝ 0.15；流血無視任何抗性；頭目的凍結 `iceRes 0` ＝ 0.4（不減半）；`freezeGuard: 2` 的一般敵人凍結 ＝ 0。中毒、睡眠對 20 組隨機的（chance、boss、res）和 `chance * (boss ? 0.5 : 1) * (1 - res / 100)` 逐位元相同。
    - `burn and bleed take the hit that caused them`：先一擊造成 80 傷害（`ctx.lastHit`）再施加灼燒（`constRng(0)`）→ `burn` 為 `{ tick: 28, turns: 3, src: 施放者 }`；流血 → `bleed` 為 `[{ tick: 16, turns: 3, src }]`；同一次行動裡沒有命中這個目標 → 什麼都不加、rng 呼叫 0 次。
    - `only the strongest burn stays, for the longer time`：已有 `{ tick: 28, turns: 1 }`，再加 tick 20 → `{ tick: 28, turns: 3, src: 舊的 }`；再加 tick 40 → `{ tick: 40, turns: 3, src: 新的 }`。
    - `bleed stacks to three, then replaces only a weaker stack`：連加 16、10、12 → 三層；再加 11 → 取代 10 那層；再加 9 → 不變。
    - `a boss is chilled, never frozen`：頭目被凍結成功 → `frozen` 為 undefined、`chill === 2`，事件 `status: 'chill'`；一般敵人 → `frozen === true`。
    - `freeze draws nothing while the guard holds`：`freezeGuard: 1` 的一般敵人，計數 rng 呼叫 0 次、沒有任何事件。
    - `shock lasts two rounds`：成功後 `shock === 2`；頭目機率減半。
    - `poison and sleep still draw once, even at chance 0`：`chance: 0` 的中毒仍然呼叫 rng 一次。
    - `elemental hits alone never inflict anything`：火、冰、雷、物理的 `damage` 效果各打一次，目標沒有任何異常欄位。
    - `every burn and bleed in the data rides on a hit`：`SKILLS`、`ENEMIES[*].skills`、`REGIONS[*].skill`、所有絕技（`ultimateFor` 讀的資料）的每一張效果清單，`inflict` 的 `status` 是 `burn` 或 `bleed` 時，前面必須有 `damage` 效果（現在 0 個，測試照樣成立，守住之後的內容）。
  - `skills.test.ts`：既有的中毒、睡眠測試不改，必須維持綠。
  - `save.test.ts`（檔尾新的 `describe('battle state is never saved (plan 8b)')`）：戰鬥中（`g.battle` 有一個 `burn`、`frozen` 的敵人）呼叫 `saveGame`，存下的 JSON 沒有 `battle` 鍵、字串不含 `"burn"`、`"frozen"`；讀回 `status: 'ok'`。
  - `battleText.test.ts`：五句新的 `status` 文字逐字斷言。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/ailments.test.ts src/scripts/games/starlantern/engine/skills.test.ts src/scripts/games/starlantern/engine/save.test.ts src/scripts/games/starlantern/ui2/battleText.test.ts`。預期：`engine/ailments` 不存在、`status` 型別不接受新值。
- [ ] **Step 3：實作**（照 Interfaces；每個窮舉 `BattleEvent` 或 `inflict.status` 的 `switch` 由 tsc 找出來補齊）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠；全套全綠；tsc starlantern 0 錯。
- [ ] **Step 5：完整平衡帶＋閘門**：`rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-20-starlantern-plan8b-ailments-buffs/gate-1 src/scripts/games/starlantern/engine/__fixtures__/sim-gate`，必須 `gate: identical`（沒有內容用到新異常）。不同就停下來回報 BLOCKED。
- [ ] **Step 6：commit**：`feat(starlantern): burn, freeze, shock and bleed — state, chance against resistance, and infliction`。

### Task 2: 異常的回合效果：跳傷、凍結跳過、感電、冰緩、清除

**Files:**
- Modify：`engine/ailments.ts`（`tickAilments`、`ageAilments`、`clearAilments`、`ailmentChips`）
- Modify：`engine/combatant.ts:73-76`（`stat` 的冰緩）、`hitAmount`（感電，`defending` 那一行之後）、`dealDamage` 倒下的分支（`clearAilments`）、`BattleEvent`（`dot-tick`、`frozen`）
- Modify：`engine/skills.ts:137-143`（`cure` 清所有異常）
- Modify：`engine/battle.ts:339-370`（`endOfRound`：中毒跳傷乘感電、之後 `tickAilments`、倒數時 `ageAilments`）、`:405-407`（回合迴圈：凍結先於睡眠）
- Modify：`data/text.zh-TW.ts`（`T.log.dot`、`T.log.frozen`）、`ui2/battleText.ts`（兩個新事件）
- Test：`engine/ailments.test.ts`、`engine/battle.test.ts`、`engine/ledger.test.ts`、`ui2/battleText.test.ts`

**Interfaces:**
- Produces：
  - `export function tickAilments(c: Combatant, ctx: EffectContext): void`：灼燒、流血各層依序跳傷（`dealDamage`，感電時 ×1.2 取 floor，至少 1），每一下記 `{ type: 'dot-tick', target, amount, status: 'burn' | 'bleed' }`，倒下記 `ko`；帳本記給該層 `src`（`lossOf` 在扣血前算）。
  - `export function ageAilments(c: Combatant): void`：裁定 9 的 −1 與刪欄位。
  - `export function clearAilments(c: Combatant, opts?: { keepGuard?: boolean }): void`（倒下全清；`cure` 用 `keepGuard: true`，另外照舊清 `poison`、`sleep`）。
  - `export interface AilmentChip { id: AilmentShown; turns?: number; stacks?: number }`；`export function ailmentChips(c: Combatant): AilmentChip[]`：固定順序 中毒、睡眠、灼燒、流血、感電、凍結、冰緩；中毒沒有回合數；睡眠的 `turns` 是 `sleep`；流血的 `stacks` 是層數、`turns` 是各層最長的；凍結沒有回合數。
  - `BattleEvent` 加 `{ type: 'dot-tick'; target: string; amount: number; status: 'burn' | 'bleed' }`、`{ type: 'frozen'; actor: string }`。
  - `T.log.dot(who, s: 'burn' | 'bleed', n)` →「{who} 因灼燒受到 {n} 傷害」／「{who} 因流血受到 {n} 傷害」；`T.log.frozen(who)` →「{who} 被凍住了，動彈不得」。

- [ ] **Step 1：先寫失敗的測試**
  - `battle.test.ts`（照既有的 `P`／`E`／`makeBattle` 寫法）：
    - `burn and bleed tick at round end, then wear off`：敵人 `burn: { tick: 12, turns: 3, src: 'p' }`、`bleed: [{ tick: 5, turns: 1, src: 'p' }]`，雙方都防禦：第 1 回合末敵人少 17 HP、`dot-tick` 兩個事件依序 burn、bleed，之後 `bleed` 消失、`burn.turns === 2`；第 3 回合末之後 `burn` 消失。
    - `shock raises every hit and every tick by 20%`：同一個 `constRng` 的一擊，目標 `shock: 2` 的傷害 ＝ 沒有感電時的 `Math.floor(base × mult × 1.2 × variance)` 那條算式（寫死數字）；中毒跳傷 100 HP 的 10% ＝ 10 → 12。
    - `a frozen foe loses its next action, then is guarded for two rounds`：敵人 `frozen: true` → 這回合記 `frozen` 事件、沒有攻擊、`frozen` 消失、回合末 `freezeGuard === 2`；接下來第 2、3 回合對它施加凍結（機率 1）都不成立且 rng 呼叫數不變；第 4 回合可以再凍結。
    - `the freeze takes the turn before sleep does`：`frozen: true, sleep: 2` → 這回合只記 `frozen`，`sleep` 仍是 2。
    - `chill slows a boss by 30%`：頭目 `spd 20`、`chill: 2` → `stat(boss, 'spd') === 14`；兩回合後 `chill` 消失。
    - `a frozen boss does not exist: its turn is never skipped`：頭目被凍結施加（機率 1）後，同一回合輪到它照常行動。
    - `death and cure clear every ailment`：帶全部異常的戰鬥者倒下 → 欄位全部不存在；`cure` → 全部不存在但 `freezeGuard` 保留。
  - `ledger.test.ts`：`burn and bleed ticks go to who caused them`：兩層流血來源不同，各自記給自己的 `src`。
  - `ailments.test.ts`：`ailment chips in a fixed order`：帶全部異常的戰鬥者 → `[poison, sleep(2), burn(3), bleed(×2, 3), shock(2), freeze, chill(2)]` 逐項 `toEqual`；沒有異常 → `[]`。
  - `battleText.test.ts`：`dot-tick`、`frozen` 的文字逐字斷言。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/battle.test.ts src/scripts/games/starlantern/engine/ailments.test.ts src/scripts/games/starlantern/engine/ledger.test.ts src/scripts/games/starlantern/ui2/battleText.test.ts`。
- [ ] **Step 3：實作**（照 Interfaces 與裁定 6–10；本任務的跳傷**仍然**走 `dealDamage` 原本的叫醒行為，叫醒的規則在 Task 3 才改，好讓兩件事分開量）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠；全套全綠；tsc starlantern 0 錯。
- [ ] **Step 5：完整平衡帶＋閘門**：輸出 `gate-2`，`against` 用 `gate-1`，必須 `gate: identical`（新欄位不存在時每一個數字都不變；`cure` 多清的欄位在舊名冊上不存在）。
- [ ] **Step 6：commit**：`feat(starlantern): ailments act at round end — ticks, frozen turns, shock, chill, and clearing`。

### Task 3: 持續傷害不叫醒睡眠

**Files:**
- Modify：`engine/combatant.ts:154-167`（`dealDamage(t, amount, opts?: { dot?: true })`：`dot` 時不清 `sleep`）
- Modify：`engine/battle.ts`（中毒跳傷傳 `{ dot: true }`）、`engine/ailments.ts`（`tickAilments` 傳 `{ dot: true }`）
- Modify（會紅的既有測試）：無預期。`combatant.test.ts` 的 `wakes a sleeper`（`dealDamage` 預設仍會叫醒）與 `battle.test.ts` 的 `skips sleeping actors, and damage wakes them` 必須維持綠。
- Create（SDD）：`retune.md`（本任務與 Task 4 每一次量測的設定、Test Files／Tests、每一個不同的報告行）
- Test：`engine/combatant.test.ts`、`engine/battle.test.ts`

**Interfaces:**
- Produces：`dealDamage(t: Combatant, amount: number, opts?: { dot?: true }): number`。所有持續傷害（中毒、灼燒、流血）一律傳 `{ dot: true }`；命中（技能、普通攻擊、砲台、`ringBell`）不傳。

- [ ] **Step 1：先寫失敗的測試**
  - `combatant.test.ts` `a tick does not wake a sleeper`：`sleep: 2` 的戰鬥者 `dealDamage(c, 5, { dot: true })` → `sleep` 仍是 2、HP 95。
  - `battle.test.ts` `a sleeper keeps sleeping through every tick`：敵人 `sleep: 3, poison: true, burn: {…}, bleed: [{…}]`，我方防禦：第 1 回合末三種跳傷都發生、`sleep === 2`（只因為它睡掉自己的回合而 −1）。
  - `battle.test.ts` `a turret hit still wakes a sleeper`：我方 `turret: { power: 100, turns: 2 }`、敵人 `sleep: 3` → 回合末砲擊後 `sleep === 0`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/combatant.test.ts src/scripts/games/starlantern/engine/battle.test.ts`。預期：跳傷把 `sleep` 歸零。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠；全套全綠；tsc starlantern 0 錯。
- [ ] **Step 5：完整平衡帶＋閘門**：輸出 `gate-3`，`against` 用 `gate-2`。這一步**預期會移動數字**（史萊姆的酸液、沼澤的瘴氣、暮影法師的搖籃曲會讓我方「睡著又中毒」；毒刃、毒針、月影箭會讓敵人「睡著又中毒」）。要求：
  1. 四個平衡檔與 `parity.test.ts` 的 Tests 全部通過（`BALANCE_REPORT=1` 時是 soft 斷言，任何一個 soft failure 都算失敗）；
  2. 把 `gate-2/report.txt` 與 `gate-3/report.txt` 的每一個不同行、`actions.json` 變了的測試名、`contribution.json` 的變化，寫進 `retune.md`。
  任何一條失敗：停下來回報 BLOCKED，附 `retune.md`。不可以改門檻、不可以改敵人或技能數字、不可以改裁定。
- [ ] **Step 6：commit**：`feat(starlantern): damage over time no longer wakes a sleeper`（內文列出移動最大的五行報告：before → after）。

### Task 4: 增益取最強

**Files:**
- Modify：`engine/combatant.ts:78-83`（`addBuff`）
- Modify（會紅的既有測試）：無預期；`combatant.test.ts` 的 `refresh the same stat and direction instead of stacking`（同強度、回合取長，結果仍是 `{ atk, 25, 3 }`）與 `cap at 3, dropping the oldest` 必須維持綠。
- Test：`engine/combatant.test.ts`、`engine/skills.test.ts`

**Interfaces:**
- Produces：`addBuff(c: Combatant, b: Buff): void`，裁定 12。

- [ ] **Step 1：先寫失敗的測試**（`combatant.test.ts` 的 `describe('buffs')`）
  - `a weaker buff keeps the stronger one and lengthens it`：`{ atk, 30, 1, src: 'a' }` 之後 `{ atk, 20, 3, src: 'b' }` → `[{ atk, 30, 3, src: 'a' }]`。
  - `a stronger buff replaces the weaker one and keeps the longer time`：`{ atk, 20, 3, src: 'a' }` 之後 `{ atk, 30, 1, src: 'b' }` → `[{ atk, 30, 3, src: 'b' }]`。
  - `the deeper debuff wins`：`{ def, -20, 3 }` 之後 `{ def, -40, 2 }` → `{ def, -40, 3 }`；反過來 → `{ def, -40, 3 }`（保留先來的 `src`）。
  - `a buff and a debuff of one stat still sit side by side`：`{ atk, +20 }` 與 `{ atk, -25 }` 兩個都在。
  - `skills.test.ts` `casting a weaker buff over a stronger one keeps the stronger`：千鶴的結界（def 30）之後隊友再吃 def 25 的增益（`hero-guard` 的效果），`stat(t, 'def')` 仍是 30% 的值。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/combatant.test.ts src/scripts/games/starlantern/engine/skills.test.ts`。預期：弱的蓋掉強的。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠；全套全綠；tsc starlantern 0 錯。
- [ ] **Step 5：完整平衡帶＋閘門**：輸出 `gate-4`，`against` 用 `gate-3`。可能移動數字（諾艾兒的冰縛 −30%／暴風雪 −20% 減速、絆索箭與盾擊的降攻疊在同一個敵人上）。要求與 Task 3 Step 5 相同，結果續寫進 `retune.md`；失敗就停下來回報 BLOCKED。
- [ ] **Step 6：commit**：`feat(starlantern): buffs keep the strongest, for the longer time`（內文列出移動的報告行，沒有就寫「量測值未移動」）。

### Task 5: 戰鬥畫面的異常標籤

**Files:**
- Modify：`data/text.zh-TW.ts`（`T.ailment`、`T.ailmentChip`）
- Modify：`engine/battle.ts:434-445`（`intentLabel`：被凍結的敵人回傳「凍結中」；這個函式本來就在引擎裡寫「攻擊」「（全體）」等字面值，新字放在它們旁邊）
- Modify：`ui2/partyBar.ts`（`BarMember.ailments?`、`fillBody` 加一列標籤）、`ui2/scenes/battle.ts:117-127`（`actors()` 排除凍結、`updateBar` 帶 `ailmentChips`）、`:168-171` 與 `:353`（敵人標籤跟著意圖與回合後的 `syncHp` 一起更新）
- Modify：`render/BattleView.ts:68-74`（`Slot.ail`）、`:160-185`（建立）、`:366` 附近（`showAilments`）
- Modify：`src/styles/_starlantern-ui.scss`（`$slx-ailment` 色表、`.slx-pm-ail`、`.slx-ail`、`.slx-ail-<id>`，放在 `.slx-pm-row` 那一段旁邊）
- Create：`render/ailmentStyle.ts`（Pixi 用的同一份顏色）
- Test：`ui2/partyBar.test.ts`、`ui2/scenes/battle.test.ts`、`render/BattleView.test.ts`、`ui2/rarity.test.ts`（照它讀 SCSS 色表的寫法，新增一個 `describe`）、`engine/battle.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 2 的 `AilmentChip`、`ailmentChips`、`AilmentShown`。
- Produces：
  - `T.ailment: Record<AilmentShown, string>` ＝ `{ poison: '中毒', sleep: '睡眠', burn: '灼燒', freeze: '凍結', chill: '冰緩', shock: '感電', bleed: '流血' }`；`T.ailmentChip(c: AilmentChip): string`：名稱＋回合數（「灼燒3」「睡眠2」），流血是「流血×2」，中毒、凍結只有名稱。
  - 顏色（SCSS `$slx-ailment` 與 `render/ailmentStyle.ts` 的 `AILMENT_FILL: Record<AilmentShown, number>` 同值）：中毒 `#b48cff`、睡眠 `#c4c8dc`、灼燒 `#ff8a4a`、凍結 `#8fe8ff`、冰緩 `#8fa8ff`、感電 `#ffe45c`、流血 `#ff5a6e`。
  - 我方：`BarMember.ailments?: AilmentChip[]`；面板在 TP 列之後多一個 `<span class="slx-pm-ail">`，裡面每個異常一個 `<span class="slx-ail slx-ail-<id>">文字</span>`；沒有異常時這個 span 是空的（`hidden`）。面板寬度內換行，不撐開面板。
  - 敵人：`BattleView.showAilments(byKey: Record<string, AilmentChip[]>): void`：每個敵人血條下方一排 Pixi `Text`（字級 11、黑色描邊 3、`fill` 取 `AILMENT_FILL`），以敵人為中心水平排開；再呼叫時整排替換；空陣列清空。
  - 美術交付後的掛法（寫在 `ailmentStyle.ts` 的註解）：異常圖示發布後，在每個標籤的文字前面加圖示（只在 `ctx.art.has(url)` 時）；文字保留。本計畫不定義美術鍵。

- [ ] **Step 1：先寫失敗的測試**
  - `rarity.test.ts`（或新的 `ui2/ailment.test.ts`，沿用它讀 SCSS 的工具）：`$slx-ailment` 有七個鍵且值等於 `AILMENT_FILL`；任兩色 RGB 距離 > 40；每一色對視窗底色 `rgb(10, 14, 34)` 的對比 ≥ 4.5:1。
  - `partyBar.test.ts`：`shows each ailment as a coloured word with its turns`：成員帶 `[burn 3, bleed ×2]` → `.slx-pm-ail` 內兩個 span，class 與文字是 `slx-ail-burn`「灼燒3」、`slx-ail-bleed`「流血×2」；更新成 `[]` 後沒有子元素且 `hidden`；不建立任何 `<img>`。
  - `scenes/battle.test.ts`：`a frozen member is skipped when choosing commands`：第一位成員 `frozen: true` → 指令列從第二位開始；`the bar shows each member's ailments`：`updateBar` 後面板文字含「中毒」。
  - `BattleView.test.ts`：`showAilments draws one coloured label per ailment under the bar, and replaces them`：`{ e0: [shock 2, bleed ×3] }` → e0 的 slot 有兩個 `Text`，文字「感電2」「流血×3」，`fill` 為對應色；再呼叫 `{ e0: [] }` → 沒有。
  - `battle.test.ts`：`a frozen foe shows 凍結中 as its intent`：`intentLabel` 對 `frozen: true` 的敵人回傳「凍結中」。
  - e2e `ailments show as coloured words on the battle screen`：照既有的進戰鬥寫法（`.slx-battle` 可見），用 `game((g) => { const m = g.battle.party[0]; m.poison = true; m.burn = { tick: 5, turns: 3, src: 'e0' }; m.bleed = [{ tick: 3, turns: 3, src: 'e0' }, { tick: 3, turns: 2, src: 'e0' }]; m.shock = 3; m.chill = 3; })`，全員防禦打完一回合：第一位成員的面板依序含「中毒」「灼燒2」「流血×2」「感電2」「冰緩2」；`page.setViewportSize({ width: 390, height: 844 })` 之後 `.slx-pm-ail` 的 `scrollWidth <= clientWidth`；過程中沒有 console 錯誤、沒有 404 的圖片請求。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/partyBar.test.ts src/scripts/games/starlantern/ui2/scenes/battle.test.ts src/scripts/games/starlantern/render/BattleView.test.ts src/scripts/games/starlantern/ui2/rarity.test.ts src/scripts/games/starlantern/engine/battle.test.ts`。
- [ ] **Step 3：實作**（照 Interfaces；SCSS 只用色表與既有的 `.slx-pm-row` 那種文字框，不用 `!important`、不寫行內樣式）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠；全套全綠；tsc starlantern 0 錯；e2e 全綠（含新測試）。
- [ ] **Step 5：完整平衡帶＋閘門**：輸出 `gate-5`，`against` 用 `gate-4`，必須 `gate: identical`（`intentLabel` 與畫面不影響模擬）。
- [ ] **Step 6：commit**：`feat(starlantern): ailments shown as coloured words with turns on the battle screen`。

---

## 交給之後計畫的介面（摘要）
- 施加異常：在效果清單裡寫 `{ kind: 'inflict', status: 'burn' | 'freeze' | 'shock' | 'bleed', chance }`；灼燒、流血必須排在一個 `damage` 後面（守門測試）。逐段命中的異常（符文「點燃」「撕裂」）由符文計畫在 `applyEffect` 的命中迴圈裡呼叫 `inflictAilment`。
- `ailmentChance`、`inflictAilment`、`tickAilments`、`ageAilments`、`clearAilments`、`ailmentChips`、`AILMENT`、`Dot`、`AilmentShown`；`dealDamage(t, amount, { dot: true })` 是所有持續傷害（含之後裝置的跳傷，如果它是持續傷害）的唯一寫法。
- 畫面：`T.ailment`、`T.ailmentChip`、`$slx-ailment`／`AILMENT_FILL`、`BattleView.showAilments`、`BarMember.ailments`。異常圖示由美術計畫在文字前面加上。
- 8b 結束時的平衡快照在 SDD 目錄的 `gate-5/`；之後的名冊計畫以它為「目前」的 `against`，戰力對等仍然對 8a 的舊名冊基準量。
