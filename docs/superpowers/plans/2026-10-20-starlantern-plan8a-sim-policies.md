# 星燈迷宮 計畫 8a：模擬玩家的行動策略、舊名冊閘門與貢獻帳本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 技能深化 spec §17 的第 ⓪ 步：把模擬玩家 `choose` 改成「依角色的行動策略」（只認新機制的純規則），加上決定性的貢獻帳本（傷害＋回復＋防止的傷害），並用「舊名冊閘門」證明這些工具本身沒有移動任何一個數字；同時在舊名冊上錄下每位角色、每支隊伍的貢獻基準夾具，給之後的名冊改動做戰力對等。**本計畫不移動任何平衡數字。**

**Architecture:**
- **先錄再改**：Task 1 在動任何模擬行為之前，於 HEAD 錄下兩種夾具：四個平衡檔 `BALANCE_REPORT=1` 的全部 `[balance]`／`[lineups]`／`[deep]`／`[pace]` 行（排序後），以及每個平衡測試裡「每一場模擬、每一回合的行動」的雜湊鏈。之後每個任務都跑同一支閘門腳本，輸出必須和夾具逐位元相同。
- **帳本只讀不抽**：`EffectContext` 多一個可選的 `ledger`，只有模擬會傳。為了讓「如果沒有」的重算重用這一擊已經抽好的亂數，`calcDamage` 拆成「抽骰」`rollHit` 與「純公式」`hitAmount` 兩段（Task 2，純重構）。帳本本身不抽任何亂數。
- **規則只認新機制**：策略規則讀 `Combatant.mech` 與 `BattleState.barriers`；舊名冊上這兩個欄位永遠不存在，所以沒有任何一條規則成立，`choose` 的每一個輸出和現在相同。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-20-starlantern-skill-builds-design.md`（使用者 2026-10-20 核准「可以」），本計畫實作 §12.1、§12.3 第 0 步、§12.5、§12.6、§11「模擬玩家 `choose`」、§17 ⓪。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄：`.superpowers/sdd/2026-10-20-starlantern-plan8a-sim-policies/`。行號是 2026-10-20 在 HEAD `72385e4b` 讀到的，只供定位；動手時一律用內容（函式名、字串）找。

## 計畫裁定（spec 留給實作者、或 spec 與程式碼不一致之處）

1. **報告逐位元相同＝排序後的行逐位元相同。** 四個平衡檔平行執行，行與行之間的先後不固定，所以和計畫 5g 一樣，抽出 `^\[(balance|lineups|deep|pace)\] ` 開頭的行後 `LC_ALL=C sort` 再比。
2. **行動逐位元相同用雜湊鏈證明。** 每個平衡測試（以 vitest 的測試名為鍵）記錄 `{ battles, rounds, hash }`：`hash` 是 FNV-1a 32 位元，依序吃進每一回合 `JSON.stringify(actions)` 與每一場結束的 `JSON.stringify({ outcome, rounds, hpLoss })`。夾具是 JSON（LF、兩格縮排、結尾換行）。
3. **滿量表的絕技仍然排在策略規則之前**（spec §12.5 寫「規則 → 絕技 → 補 → 傷害 → 攻擊」）。理由：`alternate` 只要莎菲拉有拍子機制就永遠成立，照字面排會讓她永遠放不出絕技；舊名冊上兩種順序結果相同（沒有規則成立）。順序定為：絕技（量表滿）→ 策略規則 → 有人半血以下就補 → 最強傷害技 → 普通攻擊。
4. **`dealDamage` 的回傳值不改。** spec §12.6 說它回傳「實際損失（不含溢出）」，實際上非不死目標回傳的是整個傷害量（`engine/combatant.ts:155`），量表與戰鬥紀錄都依賴它。帳本自己用 `lossOf(t, amount)` 算封頂後的損失。
5. **回復的計入**：`gainHp` 的回傳（治療、道具）記給施放者；關鍵天賦 `regen` 的回合末回復（不走 `gainHp`，`battle.ts:356-359`）記給持有者本人；復活不計（它不是回復事件，模擬也不施放）。對帳的基準是「目標為我方的 `heal` 事件加總」。
6. **防止傷害的封頂**：每個因素的防止量 ＝ `max(0, lossOf(目標, 反事實傷害) − 實際損失)`；挑釁轉向時，反事實的目標是原本的目標（用它自己的 HP 封頂）。只對單體轉向計算（普通攻擊、`target: 'enemy'` 的敵人技能）；`row`／`column`／`cross` 的範圍轉向不計（形狀中心改變，沒有便宜的反事實）。
7. **挑釁的「原本目標」**：敵人計畫時若挑釁已經在場，`pickTarget` 不抽亂數就直接指向挑釁者（`battle.ts:184`），這時沒有「原本的目標」，防止量記 0。只有計畫之後才開始的挑釁會被計入。
8. **中毒的來源**：第一個成功使目標中毒的人；中毒中再被毒不換來源；解除或倒下時清除。
9. **戰力對等的情境**：等級 5／10／20／35／50 的深度取 `parityDepth(L) = Math.floor((L − 2) / 4) + 1`（1／3／5／9／13；`depthLevel` 只產生 2、6、10…，spec 的等級不是深度等級），本道（`mainline`）的 `encounterTable` 每一組＋燈喰之獸頭目戰，種子 `k × 7919`（k = 1…20）；隊伍穿 `kitParty(level, depth, 1, undefined, expectedEnhance(depth), { ids, expect: true })`。每回合貢獻 ＝ 該格所有戰鬥的貢獻總和 ÷ 回合總和（一般戰與頭目戰合計）。
10. **戰力對等的比較對象**：標準隊伍量五人；其他五位夥伴各自在「洛恩＋凜＋她＋千鶴＋瑟蕾」中只量她本人；整隊總和每一支隊伍都量。夾具存整數總和（傷害、回復、防止、護盾、回合數），不存小數。
11. **策略資料的位置**：本計畫用 `data/policies.ts` 的 `DEFAULT_POLICIES`；之後的建議 build（§16）改成從 build 資料讀「標準」策略時，內容必須和這份相同。
12. **§12.2 的「鑲嵌符文數為 0」守門測試不在本計畫**：`Member.sockets` 還不存在，歸符文計畫（§17 ⑤）。

---

## Global Constraints

**使用者的方向（最高依據）**
- 「不裝符文頂多過普通」；普通難度的驗收＝預設配點、沒有符文的模擬（spec §12.1）。
- 平衡只對照預設配點（記憶「星燈迷宮必須配點」）。`engine/balance*.test.ts` 的全部門檻凍結，只准收緊；本計畫一個數字都不能動。

**分支與基準**
- `feat/starlantern-story`，基準 HEAD `72385e4b`（或之後）。開工前 `git status`：`engine/sim.ts`、`engine/battle.ts`、`engine/combatant.ts`、`engine/skills.ts`、`engine/balance*.test.ts` 若有別人未提交的修改，停下來回報 NEEDS_CONTEXT。
- 本計畫必須在任何名冊、異常、變招改動之前合併（spec §12.3 第 0 步）。

**測試與檢查**
- TDD：每個任務先寫失敗的測試，確認它因為正確的理由失敗，再實作。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`。
- 全套：`rtk proxy npx vitest run --testTimeout=20000`（目前 3391 個，全綠）。讀「Test Files」與「Tests」兩行。不可以用 `npm run test`。
- 閘門（Task 1 建立，Git Bash 語法）：`rtk proxy bash scripts/starlantern-sim-gate.sh <輸出目錄>`，輸出目錄放在 SDD 目錄底下。結束碼 0 且最後印出「gate: identical」才算通過。一次只跑一套重的測試。
- tsc：`rtk proxy npx tsc --noEmit -p .`。repo 原本有 43 個錯誤（astro:content、bomber、tetris、hp-click）；完成條件是 starlantern 底下 0 個。
- e2e（只在 Task 5 收尾跑一次）：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。headless、靜音；只用 4352，絕不用 4354，不可以結束任何程序。
- 本專案沒有 prettier、eslint，不要跑。

**換行（逐檔保留）**
- 改檔前用 `git ls-files --eol <檔案>` 確認；改完看 `git diff --stat`，整檔被改寫就是換行壞了，要修。CRLF 檔不可以用 `sed -i`。新檔一律 LF（含夾具）。
- 2026-10-20 量到的：CRLF：`engine/sim.ts`、`engine/balance.test.ts`、`engine/battle.test.ts`、`engine/combatant.test.ts`、`engine/types.ts`、`engine/testing.ts`、`data/skills.ts`。LF：`engine/sim.test.ts`、`engine/balance.lineups.test.ts`、`engine/balance.deep.test.ts`、`engine/balance.pace.test.ts`、`engine/progression.ts`。**混用**（新增的行跟著上下文那幾行）：`engine/battle.ts`、`engine/combatant.ts`、`engine/skills.ts`、`engine/skills.test.ts`。

**亂數**：不可以呼叫 `Math.random`。策略規則與帳本一次都不抽亂數；`game.rng`、`lootRng`、`memoryRng`、`fillRooms` 的 rng 一次都不多抽。戰鬥 `rng` 的抽取順序與次數不變（閘門證明）。

**git**
- 一律寫出完整路徑 add，不可以 `git add -A`／`git add .`。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。由控制者 commit 時照各任務最後一步的訊息。
- 絕對不可以執行 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。不 push。

**介面與美術**：本計畫不碰 UI。SCSS 禁 `!important`、禁行內樣式；zh-TW 介面文字照《文風聖經》；不放佔位美術（本計畫用不到）。

**測試修改規則**：某任務會弄壞的既有測試，都列在該任務的 Files 與步驟裡。全套跑出沒列到的紅燈，先停下來回報 NEEDS_CONTEXT。`it.fails`、`it.skip`、`.only`、`.todo` 不可以出現在 commit。

**子代理**：實作者不派子代理。

## Review Focus
1. **舊名冊上一條規則都不成立。** 沒有 `mech`、沒有 `barriers` 的戰鬥，`choose(s, party)` 與 `choose(s, party, {})` 對每一個狀態輸出相同；`spend-at` 在沒有對應量表時不會把技能「扣住」。測試：Task 4 的 `no rule fires without a mechanic`，加上每個任務的閘門。
2. **致命一擊與不死目標的帳本封頂。** 30 HP 的敵人吃 100 傷害只記 30；不死目標只記到剩 1 HP；溢補不算回復。測試：Task 3 的 `credits only what was really lost or gained`。
3. **同一擊上有多個防護因素時互不扣抵、和順序無關。** 兩個增益加一個減益，各自的防止量等於「只拿掉它」的重算，把 `buffs` 陣列反轉後結果相同。測試：Task 3 的 `each protective factor is credited on its own`。
4. **閃避、裝死的一擊與沒有帳本的戰鬥不改變亂數。** 被閃避的一擊防止量 0；同一場戰鬥有沒有帳本，每回合狀態 JSON 相同、rng 呼叫次數相同。測試：Task 3 的 `the ledger never changes the fight`。
5. **閘門本身是決定性的。** 同一個 commit 連跑兩次閘門，輸出目錄逐位元相同；夾具是 LF。測試：Task 1 Step 6。

---

## File Structure
- `scripts/starlantern-sim-gate.sh`（新）：閘門腳本（Task 1）。
- `engine/simGate.ts`（新，只給測試用）：`fnv1a`、`installSimGate`（Task 1）。
- `engine/__fixtures__/sim-gate/`（新）：`balance.actions.json`、`lineups.actions.json`、`deep.actions.json`、`report.txt`（Task 1）；`contribution.json`（Task 5）。
- `engine/sim.ts`：`SimTrace`、`setSimTrace`（Task 1）；`choose` 改用策略、`castPower`、`SimOpts`、`Lineup.policies`、`simBattle`／`winRate` 傳遞（Task 4）；帳本傳遞（Task 3）。
- `engine/balance.test.ts`、`engine/balance.lineups.test.ts`、`engine/balance.deep.test.ts`：各加一行 `installSimGate(...)`（Task 1）。門檻一個字都不改。
- `engine/combatant.ts`：`HitRolls`、`rollHit`、`hitAmount`、`Buff.src`、`Combatant.poisonSrc`、`Combatant.mech`（Task 2、4）。
- `engine/skills.ts`、`engine/battle.ts`：來源記錄（Task 2）；帳本記帳、`EffectContext.ledger`／`redirect`、`resolveRound` 的第四個參數（Task 3）。
- `engine/ledger.ts`（新）：帳本型別與記帳函式（Task 3）。
- `engine/mech.ts`（新）：機制狀態型別、`mechGauge`（Task 4）；`BattleState.barriers`（`engine/battle.ts`，Task 4）。
- `engine/policy.ts`（新）：策略規則與 `applyPolicy`（Task 4）。`data/policies.ts`（新）：`DEFAULT_POLICIES`（Task 4）。
- `engine/parity.ts`（新）、`engine/parity.test.ts`（新）：戰力對等的量測與比較（Task 5）。

---

### Task 1: 閘門：在 HEAD 錄下報告與每回合行動

**Files:**
- Create：`scripts/starlantern-sim-gate.sh`、`engine/simGate.ts`、`engine/simGate.test.ts`、`engine/__fixtures__/sim-gate/{balance,lineups,deep}.actions.json`、`engine/__fixtures__/sim-gate/report.txt`
- Create（SDD）：`.superpowers/sdd/2026-10-20-starlantern-plan8a-sim-policies/balance-head.txt`
- Modify：`engine/sim.ts:150-158`（`simBattle` 迴圈）、`engine/balance.test.ts`（import 區與 `describe` 之前一行）、`engine/balance.lineups.test.ts`、`engine/balance.deep.test.ts`（同上）
- Test：`engine/simGate.test.ts`、`engine/sim.test.ts`（不改，只跑）

**Interfaces:**
- Produces：
  - `sim.ts`：`export interface SimTrace { round(actions: Record<string, Action>): void; end(r: { outcome: Outcome; rounds: number; hpLoss: number }): void }`；`export function setSimTrace(t: SimTrace | null): void`。`simBattle` 在每次 `resolveRound` 之前呼叫 `round(本回合的 actions)`，回傳前呼叫 `end(結果)`；沒有安裝時什麼都不做。
  - `simGate.ts`：`export function fnv1a(s: string, h?: number): number`（32 位元，逐一吃進字串的 UTF-8 位元組，初值 `0x811c9dc5`、乘數 `0x01000193`（`Math.imul`），回傳無號整數）；`export function installSimGate(tag: 'balance' | 'lineups' | 'deep'): void`：只有 `process.env.SIM_GATE_OUT` 有值時才用 vitest 的 `beforeAll`／`beforeEach`／`afterAll` 安裝 trace，依目前測試名（`beforeEach` 的 `ctx.task.name`）累計 `{ battles, rounds, hash }`，`afterAll` 寫出 `${SIM_GATE_OUT}/${tag}.actions.json`（`hash` 寫成 8 位小寫十六進位字串；鍵依測試執行順序）並 `setSimTrace(null)`。
  - `scripts/starlantern-sim-gate.sh <out-dir> [<against-dir>]`：`against` 預設 `src/scripts/games/starlantern/engine/__fixtures__/sim-gate`；以 `SIM_GATE_OUT=<out-dir> BALANCE_REPORT=1 npx vitest run <四個平衡檔> [engine/parity.test.ts，存在時] --testTimeout=300000` 執行，完整輸出存到 `<out-dir>.log`（目錄外面）；把報告行排序寫成 `<out-dir>/report.txt`；印出 Test Files／Tests 兩行；再 `git diff --no-index --exit-code <against-dir> <out-dir>`；相同時印 `gate: identical` 並以 0 結束，不同時印出差異並以 1 結束。

- [ ] **Step 1：在 HEAD 量基準（不改任何檔）。** `BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.test.ts src/scripts/games/starlantern/engine/balance.lineups.test.ts src/scripts/games/starlantern/engine/balance.deep.test.ts src/scripts/games/starlantern/engine/balance.pace.test.ts --testTimeout=300000`，把 `^\[(balance|lineups|deep|pace)\] ` 的行 `LC_ALL=C sort` 存成 `balance-head.txt`；記下 HEAD 與 Test Files／Tests 兩行（全部通過）。第 10 項（記憶期望）`mainline depth 8 with gear` 的 hpLoss 應約 .0946；不是的話停下來回報，基底不對。
- [ ] **Step 2：先寫失敗的測試**（`engine/simGate.test.ts`）
  - `fnv1a matches the published FNV-1a vectors`：`fnv1a('') === 0x811c9dc5`、`fnv1a('a') === 0xe40c292c`、`fnv1a('foobar') === 0xbf9cf968`；`fnv1a('b', fnv1a('a'))` 等於 `fnv1a('ab')`。
  - `the sim trace sees every round, then the end, and changes nothing`：用 `partyAt(6)` 打 `['slime','bat']`（種子 7919，`{ depth: 2, region: 'mainline' }`）兩次：一次不裝 trace、一次裝一個記錄用的 trace；兩次 `simBattle` 的回傳 `toEqual`；trace 收到的 `round` 次數等於回傳的 `rounds`，`end` 恰好一次且內容等於回傳值，每次 `round` 的鍵是那一回合活著的成員。`finally` 裡 `setSimTrace(null)`。
- [ ] **Step 3：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/simGate.test.ts`。預期：`simGate`、`setSimTrace` 不存在。
- [ ] **Step 4：實作** `setSimTrace`（`simBattle` 迴圈裡先把 `ai === 'attack' ? attackAll(s) : choose(s, party)` 存成變數，再 trace、再 `resolveRound`，運算順序不變）、`simGate.ts`、閘門腳本；三個平衡檔各加 `installSimGate('balance'|'lineups'|'deep')`（`balance.pace.test.ts` 不打模擬戰，不加）。
- [ ] **Step 5：確認通過**：Step 3 的指令與 `engine/sim.test.ts` 全綠；全套全綠；tsc starlantern 0 錯。
- [ ] **Step 6：錄夾具並證明閘門決定性。** `rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-20-starlantern-plan8a-sim-policies/gate-rec` 第一次會因為夾具目錄不存在而失敗——把 `gate-rec/` 底下的四個檔複製進 `engine/__fixtures__/sim-gate/`；確認 `report.txt` 與 Step 1 的 `balance-head.txt` 逐位元相同（`cmp`），不同就停下來回報 BLOCKED（安裝 trace 改變了量測）；再跑一次閘門到 `gate-1`，必須印 `gate: identical`；`git ls-files --eol` 之前先用 `file` 確認夾具是 LF。
- [ ] **Step 7：commit**：`test(starlantern): sim gate — HEAD balance report and per-round action hashes as fixtures`（只 add 上列檔案，不 add SDD 目錄）。

### Task 2: 傷害公式拆成「抽骰」與「純公式」，增益與中毒記下來源

**Files:**
- Modify：`engine/combatant.ts:7`（`Buff`）、`:9-43`（`Combatant` 加 `poisonSrc?`）、`:110-148`（`calcDamage`）、`:154-167`（`dealDamage` 倒下時清 `poisonSrc`）
- Modify：`engine/skills.ts:93-109`（damage 改用 `rollHit` + `hitAmount`）、`:137-143`（cure 清 `poisonSrc`）、`:144-155`（inflict 記中毒來源）、`:156-163`（buff 帶 `src`）
- Modify：`engine/battle.ts:122-124`（`small-shrine` 的增益帶持有者）、`:377-387`（`ringBell` 的增益帶 `src: 'rin'`）
- Modify（會紅的既有測試）：`engine/skills.test.ts:82`（期望加 `src: <施放者 key>`）
- Test：`engine/combatant.test.ts`、`engine/skills.test.ts`、`engine/battle.test.ts`

**Interfaces:**
- Produces：
  - `export interface HitRolls { variance: number; crit: boolean; blocked: boolean }`
  - `export function rollHit(a: Combatant, t: Combatant, spec: DamageSpec, rng: Rng): HitRolls | null`：依原本的順序抽：閃避（`roll`，命中閃避回 `null`）→ 變異（永遠抽）→ 暴擊（`spec.crit === 'always'` 不抽）→ 格擋（只有物理才 `roll`）。
  - `export function hitAmount(a: Combatant, t: Combatant, spec: DamageSpec, r: HitRolls): { amount: number; mult: number; crit: boolean }`：原本 `calcDamage` 閃避之後的全部算式，**乘法順序逐項不變**，不抽亂數。
  - `calcDamage` 改成兩者的組合，簽章與回傳不變。
  - `Buff.src?: string`（施放者的 combatant key）；`Combatant.poisonSrc?: string`（裁定 8）。

- [ ] **Step 1：先寫失敗的測試**
  - `combatant.test.ts` `calcDamage is rollHit then hitAmount, draw for draw`：以 `mulberry32(i)`（i = 1…2000）產生攻守雙方（隨機的 atk／def／mag／res、`x` 的 crit／critDmg／block／armor／evasion／meleeDR／fireRes、正負增益、`defending`、`taunt` 搭配 `taunt-guard`、`boss`），各用一支計數 rng 跑 `calcDamage` 與 `rollHit`→`hitAmount`：結果相同（閃避時 `miss: true` 對 `null`）、rng 呼叫次數相同。
  - `hitAmount draws nothing`：傳一支一被呼叫就丟錯的 rng 進不去（簽章沒有 rng），並且同一組輸入兩次結果相同。
  - `skills.test.ts` `a buff remembers who cast it`：千鶴對隊友施放 `ward` 的效果後，目標的增益是 `{ stat: 'def', pct: 30, turns: 3, src: 'chizuru' }`。
  - `skills.test.ts` `poison remembers its first poisoner until it ends`：A 毒成功 → `poisonSrc === 'A'`；B 再毒成功仍是 `'A'`；`cure` 後 `poisonSrc` 為 undefined；`dealDamage` 致死後也是 undefined。
  - `battle.test.ts` `small-shrine and the unrung bell credit their holder`：持有 `small-shrine` 的成員開戰，全隊的防禦增益 `src` 是她的 key；`unrung-bell` 的攻擊增益 `src === 'rin'`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/combatant.test.ts src/scripts/games/starlantern/engine/skills.test.ts src/scripts/games/starlantern/engine/battle.test.ts`。預期：`rollHit` 不存在、`src`／`poisonSrc` 是 undefined。
- [ ] **Step 3：實作**（照 Interfaces；`skills.test.ts:82` 加上 `src`）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠；全套全綠；tsc starlantern 0 錯。
- [ ] **Step 5：閘門**：`rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-20-starlantern-plan8a-sim-policies/gate-2`，必須 `gate: identical`。不同就停下來回報 BLOCKED（公式的乘法順序或抽骰順序變了）。
- [ ] **Step 6：commit**：`refactor(starlantern): split calcDamage into rollHit and hitAmount; buffs and poison remember their source`。

### Task 3: 貢獻帳本

**Files:**
- Create：`engine/ledger.ts`、`engine/ledger.test.ts`
- Modify：`engine/skills.ts:7`（`EffectContext`）、damage／heal／restore 分支
- Modify：`engine/battle.ts:270-274`（敵人被挑釁轉向時設 `ctx.redirect`）、`:339-370`（毒傷與 `regen` 記帳）、`:389-394`（`resolveRound` 第四個參數）
- Modify：`engine/sim.ts:150-158`（`simBattle` 的 `opts.ledger` 傳給 `resolveRound`；`SimOpts` 先只有 `ledger`）
- Test：`engine/ledger.test.ts`

**Interfaces:**
- Consumes：Task 2 的 `rollHit`、`hitAmount`、`Buff.src`、`Combatant.poisonSrc`。
- Produces：
  - `ledger.ts`：`export interface Contribution { damage: number; healing: number; prevented: number; shield: number }`；`export interface Ledger { by: Record<string, Contribution> }`；`export function newLedger(): Ledger`；`export function credit(l: Ledger | undefined, key: string | undefined, kind: keyof Contribution, n: number): void`（`l`、`key` 缺或 `n <= 0` 時不做事）；`export function totalOf(c: Contribution): number`；`export function lossOf(t: Combatant, amount: number): number`（不死：`max(0, min(amount, hp − 1))`；否則 `min(amount, hp)`；在扣血**之前**呼叫）。`shield` 本計畫沒有來源，給之後的護盾用。
  - `EffectContext.ledger?: Ledger`；`EffectContext.redirect?: { from: Combatant }`（只有被挑釁轉向的單體敵人行動才設，行動結束清掉）。
  - `resolveRound(prev: BattleState, actions: Record<string, Action>, rng: Rng, ledger?: Ledger): BattleState`。
  - `sim.ts`：`export interface SimOpts { ledger?: Ledger }`；`simBattle(..., bossPower?: number, opts: SimOpts = {})`。
- 記帳規則（spec §12.6，裁定 4–8）：
  - 傷害：我方對敵方的每一擊 `lossOf` 記給出手者（砲台、`ringBell` 照 `applyEffect` 的 actor 自然歸屬）；敵方的毒傷記給 `poisonSrc`。
  - 回復：我方對我方的 `gainHp` 回傳記給施放者（`heal`、`restore`）；`regen` 記給持有者。
  - 防止：敵方打我方且沒有被閃避時，對下列每一個因素各自用同一組 `HitRolls` 重算「只拿掉它」的 `hitAmount`：目標身上 `pct > 0` 且屬性為 `def`（物理）／`res`（法術）的增益 → 記給它的 `src`；攻擊者身上 `pct < 0` 且屬性為 `spec.scale` 的減益 → 記給它的 `src`；目標 `defending`、目標的 `taunt-guard`（挑釁中）、目標的 `not-a-shield`（挑釁中）→ 記給目標本人；`ctx.redirect` 存在且目標是挑釁者 → 以 `redirect.from`（還活著時）為目標重算，記給挑釁者。

- [ ] **Step 1：先寫失敗的測試**（`ledger.test.ts`，用 `makeCombatant`、`makeBattle`、`constRng`）
  - `credits only what was really lost or gained`：30 HP 的敵人吃一擊（算出的量 > 30）→ 出手者 `damage === 30`；`undying` 目標 100 HP 吃 150 → 記 99；HP 95/100 的隊友被治療 20 → 記 5。
  - `poison ticks go to the first poisoner, turrets to their builder`：敵人中毒（`poisonSrc: 'noel'`），回合末毒傷 10% 記給 noel；`turret` 的砲擊記給砲台的主人。
  - `each protective factor is credited on its own`：敵人（帶 `{ stat: 'atk', pct: -20, src: 'scarlet' }`）打一位帶 `{ def +30, src: 'chizuru' }`、`{ def +25, src: 'hero' }`、`defending: true` 的隊友；chizuru 的防止量等於 `lossOf(t, hitAmount(a, 拿掉 chizuru 那個增益的 t, spec, r)) − 實際損失`，hero、scarlet、隊友本人（防禦）同理逐一斷言；把 `buffs` 陣列反轉後重跑，四個數字相同。
  - `a hit turned by a taunt credits the taunter with what the first target was spared`：狀態的 `intents` 寫 `{ e0: { kind: 'attack', target: 'selene' } }`，絲嘉蕾 `taunt: 2`（意圖決定之後才挑釁的情形）；斷言 scarlet 的防止量 ＝ `max(0, lossOf(瑟蕾, 對瑟蕾重算) − 絲嘉蕾的實際損失)`；計畫時挑釁已在場（意圖已指向絲嘉蕾）時記 0；`row` 技能轉向時記 0。
  - `an evaded hit prevents nothing`：隊友 `evasion` 讓閃避成立（`constRng(0)`），所有防止量都是 0，沒有傷害記帳。
  - `the ledger never changes the fight`：標準隊伍 `partyAt(10)`、深度 3 的第一組敵人與燈喰之獸各一場（種子 7919），用計數 rng 手動 `resolveRound` 到結束，一次帶帳本一次不帶：每回合 `JSON.stringify(state)` 相同、rng 呼叫次數相同。
  - `the ledger reconciles with the fight`：同上兩場（帶帳本），所有成員的 `damage` 加總 ＝ 每個敵人 `max.hp − 最後 hp` 的加總；`healing` 加總 ＝ 每回合 `log` 中目標是我方的 `heal` 事件 `amount` 加總。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/ledger.test.ts`。預期：`engine/ledger` 不存在。
- [ ] **Step 3：實作**（照 Interfaces；防止量的重算只在 `ctx.ledger` 存在時進行；帳本不碰任何戰鬥狀態）。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠；全套全綠；tsc starlantern 0 錯。
- [ ] **Step 5：閘門**：輸出到 `gate-3`，必須 `gate: identical`。
- [ ] **Step 6：commit**：`feat(starlantern): a contribution ledger for the sim — damage, healing and damage prevented, drawing nothing`。

### Task 4: 行動策略：只認新機制的優先順序規則

**Files:**
- Create：`engine/mech.ts`、`engine/policy.ts`、`engine/policy.test.ts`、`data/policies.ts`
- Modify：`engine/combatant.ts:9-43`（`mech?: MechState`）、`engine/battle.ts:30-44`（`barriers?: Barrier[]`）
- Modify：`engine/sim.ts:51`（`Lineup.policies?`）、`:115-135`（`choose`）、`:146-148`（`power` → `castPower`）、`:150-172`（`SimOpts.policies`，`winRate` 把 `lineup.policies` 傳下去）
- Test：`engine/policy.test.ts`、`engine/battle.test.ts:300-320`（既有的 `choose` 測試不改，必須維持綠）

**Interfaces:**
- Produces：
  - `mech.ts`：`export type MechGauge = 'heat' | 'coins' | 'aim' | 'embers'`；`export interface Device { skill: string; level: number; turns: number }`；`export interface Barrier { skill: string; turns: number; src: string }`；
    `export type MechState = { kind: 'heat'; heat: number } | { kind: 'coins'; coins: number } | { kind: 'aim'; target: string | null; stacks: number } | { kind: 'embers'; embers: number } | { kind: 'beat'; beat: number; last: string | null } | { kind: 'devices'; devices: Device[]; cap: number } | { kind: 'mark'; marks: string[]; cap: number } | { kind: 'barrier' }`（`beat.last` 是上一回合的技能 id、`'attack'`、`'defend'` 或 `'ultimate'`）；
    `export function mechGauge(c: Combatant, g: MechGauge): number | undefined`（`aim` 回傳 `stacks`；機制種類不符回 undefined）。名冊計畫可以在各型別上**加**欄位，不可以改名或改語意。
  - `policy.ts`：
    `export type PolicyRule = { kind: 'ensure-barrier'; skills: string[] } | { kind: 'ensure-device'; skills: string[] } | { kind: 'ensure-mark'; skill: string } | { kind: 'alternate' } | { kind: 'spend-at'; gauge: MechGauge; min: number; skill: string } | { kind: 'heal-below'; pct: number } | { kind: 'strongest-damage' }`；
    `export type PolicyTable = Readonly<Partial<Record<CharacterId, readonly PolicyRule[]>>>`；
    `export function applyPolicy(s: BattleState, c: Combatant, castable: SkillDef[], rules: readonly PolicyRule[], power: (def: SkillDef) => number): { action: Action | null; hold: string[] }`：由上往下，第一條成立的規則給出 `action`；`hold` 是 `spend-at` 量表未到門檻時要扣住的技能 id（只在該量表存在時）。
  - 規則語意（spec §12.5；全部不抽亂數；`castable` 是「學會、非被動、付得起」的技能，和現在 `choose` 的清單相同）：
    - `ensure-barrier`：`c.mech?.kind === 'barrier'`，而且 `s.barriers` 沒有任何一個 `turns > 1`，而且 `skills` 中有可施放的 → 施放清單中第一個可施放的（不指定目標）。
    - `ensure-device`：`c.mech?.kind === 'devices'`；某個裝置 `turns <= 1` 且它的技能可施放 → 施放它（改良）；否則 `devices.length < cap` 時，施放清單中第一個可施放、場上還沒有的裝置。
    - `ensure-mark`：`c.mech?.kind === 'mark'`，活著的暗記目標數 < `cap`，技能可施放 → 對第一個活著、未被暗記的敵人施放。
    - `alternate`：`c.mech?.kind === 'beat'` → 可施放的傷害技依 `power` 由大到小（同分保持原順序），第一個 id ≠ `last` 的；沒有就 `attack`。目標都是第一個活著的敵人。
    - `spend-at`：`mechGauge(c, gauge)` 有值時：≥ `min` 且技能可施放 → 施放（`aim` 的目標是 `mech.target`，它還活著時；否則第一個活著的敵人）；< `min` → 不成立，並把 `skill` 放進 `hold`。量表不存在 → 不成立、不扣住。
    - `heal-below`：有活著的隊友 `hp < max.hp × pct / 100`，而且有可施放的回復技 → 對 HP 最低的那位（和現在 `choose` 的 `hurt` 同一個排序）施放第一個回復技。
    - `strongest-damage`：可施放傷害技中 `power` 最大的（同分保持原順序），沒有就 `attack`。
  - `data/policies.ts`：`export const DEFAULT_POLICIES: PolicyTable = { chizuru: [{ kind: 'ensure-barrier', skills: ['ward'] }], bobby: [{ kind: 'ensure-device', skills: ['turret'] }], rin: [{ kind: 'ensure-mark', skill: 'rin-mark' }], safira: [{ kind: 'alternate' }], liz: [{ kind: 'spend-at', gauge: 'coins', min: 6, skill: 'fortune-strike' }], sylvie: [{ kind: 'spend-at', gauge: 'aim', min: 3, skill: 'starfall-arrow' }] }`（spec §12.5 的起始提案；名冊計畫換招時改這裡）。
  - `sim.ts`：`export function castPower(s: BattleState, c: Combatant, def: SkillDef): number`（本計畫等於原本的 `power(def)`：傷害效果 `power × hits` 的總和；名冊計畫讓它讀銅板、結界）；`export function choose(s: BattleState, party: Party, policies: PolicyTable = DEFAULT_POLICIES): Record<string, Action>`，順序依裁定 3；`Lineup.policies?: PolicyTable`；`SimOpts.policies?: PolicyTable`。

- [ ] **Step 1：先寫失敗的測試**（`policy.test.ts`；狀態用 `makeBattle`／`makeCombatant`，`mech` 與 `barriers` 直接寫進狀態）
  - `no rule fires without a mechanic`：對每一條 `DEFAULT_POLICIES` 規則，在沒有 `mech`、沒有 `barriers` 的狀態下 `applyPolicy` 回傳 `{ action: null, hold: [] }`。另外：`partyAt(10)` 打深度 3 第一組，`resolveRound` 跑完整場，每一回合 `choose(s, party)` `toEqual` `choose(s, party, {})`。
  - `ensure-barrier`：`mech: { kind: 'barrier' }`、沒有結界 → `{ kind: 'skill', skill: 'ward' }`；`barriers: [{ skill: 'ward', turns: 2, src: 'chizuru' }]` → null；`turns: 1` → 施放；TP 不夠 → null。
  - `ensure-device`：空的裝置格 → 施放 `turret`；`turret` 在場 `turns: 1` → 再施放 `turret`；`turns: 3` 且 `cap` 已滿 → null。
  - `ensure-mark`：`marks: []` → 對第一個活著的敵人施放 `rin-mark`；`marks: ['e0']` 且 e0 活著、`cap: 1` → null；e0 倒下 → 對 e1 施放。
  - `alternate`：`last: 'fire-star'` 而最強的是火之星彈 → 選第二強的傷害技；`last: 'attack'` 而沒有可施放的傷害技 → `attack`。
  - `spend-at holds the skill below its threshold`：`coins: 3` → action null、`hold` 含 `'fortune-strike'`，而且 `choose` 這一回合沒有選它（即使它是最強的傷害技）；`coins: 6` → 施放它；`aim` 有效目標時目標是 `mech.target`。
  - `heal-below` 與 `strongest-damage`：各一個成立、一個不成立的例子，數值寫死。
  - `a full gauge still comes first`：`limit: 100`、`mech: { kind: 'beat', beat: 0, last: null }` 的莎菲拉 → `ultimate`。
  - `the default policies name real skills of their owners`：`DEFAULT_POLICIES` 裡每一個技能 id 都在 `SKILLS`，而且 `owner` 是那一位角色。
  - `rules draw nothing`：`applyPolicy` 的簽章沒有 rng；`choose` 前後戰鬥 rng 的呼叫次數不變（用計數 rng 包住整場，對照 Task 3 的同一場）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/policy.test.ts`。預期：`engine/policy` 不存在。
- [ ] **Step 3：實作**（照 Interfaces；`choose` 的回復與傷害清單改成扣掉 `hold` 之後的清單，排序改用 `castPower`，其他照舊）。
- [ ] **Step 4：確認通過**：Step 2 的指令加 `engine/battle.test.ts`、`engine/sim.test.ts` 全綠；全套全綠；tsc starlantern 0 錯。
- [ ] **Step 5：閘門**：輸出到 `gate-4`，必須 `gate: identical`（這就是 spec §12.5 的舊名冊閘門：擴充後的模擬每一回合的行動與 HEAD 的舊 `choose` 逐一相同）。
- [ ] **Step 6：commit**：`feat(starlantern): the sim player follows per-character policies that only read new mechanics`。

### Task 5: 戰力對等：舊名冊的貢獻基準夾具

**Files:**
- Create：`engine/parity.ts`、`engine/parity.test.ts`、`engine/__fixtures__/sim-gate/contribution.json`
- Test：`engine/parity.test.ts`

**Interfaces:**
- Consumes：Task 3 的 `Ledger`、`newLedger`、`totalOf`、`SimOpts.ledger`；Task 4 的 `choose`（預設策略）。
- Produces（`parity.ts`）：
  - `export const PARITY_LEVELS = [5, 10, 20, 35, 50] as const`；`export const PARITY_SEEDS = 20`；`export const PARITY_MEMBER_PCT = 10`；`export const PARITY_PARTY_PCT = 5`。
  - `export function parityDepth(level: number): number`（裁定 9）。
  - `export function parityLineups(): { measured: CharacterId[]; ids: CharacterId[] }[]`：第一支是 `STANDARD_LINEUP`（`measured` 是全部五人），之後依 `CHARACTER_IDS` 順序、不在標準隊伍的每位夥伴一支 `['hero', 'rin', id, 'chizuru', 'selene']`（`measured: [id]`）。
  - `export interface ParityCell { level: number; depth: number; ids: CharacterId[]; measured: CharacterId[]; rounds: number; by: Partial<Record<CharacterId, Contribution>> }`；`export interface ParityTable { cells: ParityCell[] }`。
  - `export function measureParity(policies?: PolicyTable): ParityTable`（裁定 9；每格一本帳本，`rounds` 是該格所有戰鬥 `simBattle` 回傳的回合數加總）。
  - `export function checkParity(now: ParityTable, base: ParityTable): { ok: boolean; rows: { level: number; ids: string; who: CharacterId | 'party'; base: number; now: number; pct: number }[] }`：依 `(level, ids)` 配對；每回合貢獻 ＝ `totalOf ÷ rounds`；`measured` 的每一人 `|pct| ≤ PARITY_MEMBER_PCT`，整隊（`ids` 全員加總）`|pct| ≤ PARITY_PARTY_PCT`；基準為 0 時現在也必須是 0；缺格算失敗。
- `parity.test.ts`：`process.env.SIM_GATE_OUT` 有值時，把 `measureParity()` 寫成 `${SIM_GATE_OUT}/contribution.json`（`JSON.stringify(table, null, 2) + '\n'`）。

- [ ] **Step 1：先寫失敗的測試**（`parity.test.ts`）
  - `parity scenarios`：`PARITY_LEVELS.map(parityDepth)` 等於 `[1, 3, 5, 9, 13]`；`parityLineups()` 共 6 支，第一支是 `STANDARD_LINEUP`，其餘的 `measured` 依序是 `['liz']`、`['sylvie']`、`['scarlet']`、`['safira']`、`['bobby']`（`CHARACTER_IDS` 中不在標準隊伍者的順序），`ids` 都是 `['hero', 'rin', <她>, 'chizuru', 'selene']`。
  - `checkParity bands`：用手寫的兩張表：某人 +9% 通過、+11% 失敗、−10% 剛好通過；整隊 +6% 失敗、+5% 通過；缺格失敗；`rows` 的 `pct` 數值寫死。
  - `every character holds ±10% and every party ±5% of the old roster`（timeout 300_000）：`checkParity(measureParity(), 夾具).ok === true`，失敗時把不通過的 `rows` 印出來（斷言訊息）。
  - `the measurement is the ledger of the default policies`：`measureParity()` 的每一格 `rounds > 0`，每位 `measured` 的 `totalOf > 0`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/parity.test.ts`。預期：`engine/parity` 不存在。
- [ ] **Step 3：實作** `parity.ts`。
- [ ] **Step 4：錄基準夾具**：`rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-20-starlantern-plan8a-sim-policies/gate-5`（會因為夾具還沒有 `contribution.json` 而印出差異）；把 `gate-5/contribution.json` 複製進 `engine/__fixtures__/sim-gate/`；確認其他四個檔沒有差異。把每個等級、每支隊伍、每位 `measured` 的每回合貢獻（四項與合計）抄進 SDD 目錄的 `parity-baseline.md`，給控制者與名冊計畫看。
- [ ] **Step 5：確認通過**：Step 2 的指令全綠；再跑閘門到 `gate-5b`，必須 `gate: identical`（現在含 `contribution.json`）；全套全綠；tsc starlantern 0 錯；e2e 跑一次全綠（本計畫沒有改 UI，只確認沒有被間接弄壞）。
- [ ] **Step 6：commit**：`test(starlantern): old-roster contribution baseline per character and party for the ±10% / ±5% parity`（內文附 `parity-baseline.md` 的摘要：每個等級標準隊伍的整隊每回合貢獻）。

---

## 交給之後計畫的介面（摘要）
- 閘門：`scripts/starlantern-sim-gate.sh <out> [<against>]`；夾具 `engine/__fixtures__/sim-gate/`（HEAD `72385e4b` 的舊名冊；第一個會移動數字的計畫之後，用 SDD 目錄的快照當 `against`，不要覆寫這份夾具）。
- 帳本：`Ledger`、`Contribution`、`newLedger`、`credit`、`totalOf`、`lossOf`；`EffectContext.ledger`／`redirect`；`resolveRound(prev, actions, rng, ledger?)`；`SimOpts.ledger`。新的持續傷害與護盾要記帳時，照「來源寫在狀態上、扣血前 `lossOf`」的做法。
- 傷害公式：`rollHit`、`hitAmount`（新的乘數放進 `hitAmount`，反事實自動一致）。
- 策略：`MechState`、`Barrier`、`Device`、`mechGauge`、`Combatant.mech`、`BattleState.barriers`、`PolicyRule`、`PolicyTable`、`applyPolicy`、`DEFAULT_POLICIES`、`castPower`、`choose(s, party, policies?)`、`Lineup.policies`、`SimOpts.policies`。
- 戰力對等：`measureParity`、`checkParity`、`PARITY_*`、基準 `engine/__fixtures__/sim-gate/contribution.json`。
