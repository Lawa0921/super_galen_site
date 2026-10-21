# 星燈迷宮 計畫 8d：技能樹改版（變招與機制節點）＋存檔遷移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 技能深化 spec §17 的第 ③＋④ 步：55 個只改數字的強化節點全部換成「變招」（同一招的另一個版本，部分是二選一）與「機制」（改寫角色核心機制的規則）節點；每位夥伴的核心機制在預設配點裡早到普通難度量得到；舊存檔以 `SAVE_VERSION` 8 → 9 的第一個遷移步驟讀進來（技能樹重套標準配點、一次免費重置）。

**Architecture:**
- **先換骨架、不換內容**：Task 1 把樹的資料模型改成 `active | variant | mech` 三種節點、加上「一對」（`TreeNode.pair`）與二選一規則、免費換邊、機制旋鈕（`mechKnob`）、標準配點的「先學」清單；舊的 55 個強化節點原封不動轉成 `variant`（同 id、同數字），所以閘門逐位元相同。Task 2 做存檔遷移（與內容無關）。之後每個任務換 2 位角色的節點內容，各自過平衡帶與戰力對等。
- **變招走 `SkillMod`**：變招每一階是一個完整的 `SkillMod`（沿用 `patchSkill` 的疊加順序：基礎 → 主動節點階級 → 變招 → 洛恩的武器精通 → 傳說威力 → `extra`）。新規則放在 `SkillMod.rules`／`SkillDef.rules`，由機制模組讀取；名稱與說明由 `SkillMod.notes` 接在後面（「火之星彈・連星」）。
- **機制節點是旋鈕**：機制節點每一階是一個數字（`values[r - 1]`），模組用 `mechKnob(c.ranks, owner, knob) ?? 常數` 讀；沒有點數時一律回到 8c 的常數，所以沒持有節點的戰鬥逐位相同。

**Tech Stack:** TypeScript、Vitest（happy-dom）、PixiJS、SCSS、Playwright e2e、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-20-starlantern-skill-builds-design.md`（使用者 2026-10-20 核准，細節授權）。本計畫實作 §7、§8 各角色的「變招」一行、§14（不含符文欄位，見裁定 9）、§17 ③④。前置：計畫 8c 完成（HEAD `309c4ecb` 或之後）。必讀：SDD ledger `.superpowers/sdd/2026-10-20-starlantern-plan8-skills/progress.md`（所有控制者裁定有約束力）、`.superpowers/sdd/2026-10-21-starlantern-plan8c-roster-mechanics/retune.md` 與 `parity-8c.md`。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄：`.superpowers/sdd/2026-10-21-starlantern-plan8d-tree-rework/`（下稱 SDD）。行號只供定位，動手時一律用內容找。

## 計畫裁定（spec 留給實作者、spec 與程式碼不一致之處）

1. **③ 與 ④ 合併成一個計畫。** 節點 id 一換，`validBuild` 會把所有舊存檔判成損毀；8c 的改名表（`LEGACY_NODE_IDS`）救不了「強化節點變成二選一」。所以遷移和新樹同一個計畫交付：Task 2 先把遷移做好（遷移只重套標準配點，和樹的內容無關），之後的內容任務不用再管舊存檔。`upgradeTreeIds` 與 `LEGACY_NODE_IDS` 在 Task 2 刪除（8c 交接已寫明由 `migrate8to9` 取代；版本 8 的樹整棵重置，改名已無意義）。
2. **資料結構：一對＝ A 節點帶一個 `pair`（B 節點）。** `TreeBranch.nodes` 仍是「一層一格」（index ＝ 層），二選一的 B 節點掛在 A 節點的 `pair` 上；兩者同層、同種類、同 `maxRank`。所以每棵樹的點數容量公式不變（一對只算一格），所有讀 `b.nodes` 的程式只要改用 `tierNodes`／`branchNodes` 就看得到 B。
3. **二選一規則**：一對之中只能有一邊有點數（`canRaiseNode` 多一個理由 `'pair'`）。戰鬥外（城鎮、迷宮的野外，和投點相同的 `phase`）可以免費「改選」：把另一邊的點數整個搬過來（`swapPair`），不需要旅館。上一層的「需要」改成「這一層任何一個節點有點數」，所以換邊後上面的節點仍然合法。`validBuild` 的重播自動拒絕兩邊都有點數的存檔。
4. **容量與節奏不變**：每格的 `maxRank` 照舊（夥伴 3、洛恩 5、波比第 0 支第 4 層 1），`TIER_GATE`、`skillPoints`、`DEFAULT_CAPSTONE` 不動。每個角色的容量等於 `engine/__fixtures__/roster-8b.json` 量出的值（守門測試）。變招與機制第 1 階給規則，第 2、3（洛恩到 5）階只加深這條規則自己的數字。
5. **標準配點（預設配點）怎麼選**：一對之中，標準配點只走 A 邊（B 邊永遠不被 `defaultTree`／`heroTree` 選）。機制節點和變招一樣算「已學會的升級」（它的上一層有點數就算）。新增 `DEFAULT_FIRST`：標準配點在「到期的舊招」之後、其他升級之前，先學的節點清單。A／B 的順序與 `DEFAULT_FIRST` 是各任務可調的平衡槓桿（裁定 12）。
6. **核心機制早到量得到（ledger 的待辦）**：
   - **凜**：`DEFAULT_FIRST.rin = ['rin-mark']`（第 2 支第 0 層本來就隨時可學），暗記從 Lv21 提早到 Lv2；暗記的變招一對（不眨眼／轉印）在第 2 支第 1 層。
   - **莉茲**：重排她的樹：大手筆移到新的第 2 支「花錢」第 0 層、`DEFAULT_FIRST.liz = ['fortune-strike']`（Lv3 學會），預設策略 `spend-at` 從此真的會施放；幻影步移到第 1 支第 4 層，估價移到第 2 支第 4 層（見裁定 10 的待裁定）。
   - **瑟蕾**：月相是被動，從 Lv1 就在模擬裡（8c 已量）。收回移到第 1 支第 2 層（Lv5 起可學），但標準配點不追它：模擬沒有規則會施放 0 TP 的收回與滿月之夜，學了只是浪費點數；這兩招與一擲千金、代受等「模擬從不施放」的招一樣，交給第 ⑧ 步各 build 的行動策略量（8c 關切 2 的裁定）。
   - 其他人的機制已在 8c 的預設配點裡（熱度、結界 Lv3、瞄準、餘燼、拍子、裝置 Lv1 都是被動或早學）。
7. **新規則欄位的位置**：只作用在整招上的放 `SkillDef.rules`（例：`heat`、`aimPct`、`releaseKeep`）；作用在某一個效果上的，由 `patchSkill` 從 `rules` 抄到該效果（`markCritPct`／`markHops` → `mark` 的 `critPct`／`hops`；`deviceHits`／`deviceTwin`／`deviceCures`／`deviceShock` → `device` 的 `hits`／`twin`／`cures`／`shock`；`phase` → `moon`；`wake` → `barrier`；`keep` → `cover`；`steady` → `taunt`；`overflowPct` → `heal`）。睡眠的回合是例外：沿用 `SkillMod.turns`，`patchSkill` 的 `lasting` 寫到 `inflict.turns`。`stackMods` 對 `rules` 逐鍵取代、對 `notes` 串接。
8. **說明文字從數字推導**：每個變招與機制節點用一個 `say` 範本產生第 r 階的一句話（數字從 `mods[r - 1]`／`values[r - 1]` 取）；`data/trees.ts` 的字串裡不准手寫數字＋單位（守門測試，照 8c `constants.test.ts` 的掃描法）。變招會改到基礎說明裡寫的數字時（例：分期改「每枚威力多 15%」），把該欄位加進 `patchSkill` 的 `NAMED_NUMBERS` 與 `progression.test.ts` 的 `named`。
9. **符文欄位不在 9 版**：spec §14 第 3 點（`runes: {}`、`sockets`）交給第 ⑤ 步，以「可省略、省略＝空」的欄位加入，不需要再升版本。理由：本計畫沒有任何東西讀它（YAGNI），第 ⑤ 步的驗證規則和欄位一起寫才完整。
10. **與 spec §8 變招清單的差異**（§17 授權替換，每個仍是一句話、改規則、看得到）：冷靜／反噬無效、雷之結界／重結界、不眨眼／轉印 做成一對二選一；「雷之結界」改為「有結界時每回合末雷擊全體」（不新增第三種結界與它的施放招）；「預報」（只改顯示、不改規則）與「超頻・過熱」（波比沒有空格）不做；瑟蕾的機制節點改為「盈月」（月相加成 30% → 40/50/60%）；「新月之夜」是滿月之夜的變招。spec 點名、只改數字的五個變招（久護、深鑿、深眠、殺價、速射）保留，列在守門測試的白名單，交控制者確認。
11. **變招名稱**：施放中的技能名稱接上變招名（`火之星彈・連星`），戰鬥選單、技能頁、日誌都一樣；說明在原本的說明後接一句變招規則。
12. **調整的範圍（每個內容任務）**：本任務兩位角色的節點數字、A／B 順序、`DEFAULT_FIRST`、她們的機制常數、預設策略參數、她們的招式數字（8c 控制者裁定 1、2）。門檻、其他角色、敵人、`engine/balance*.test.ts` 不動。調不進平衡帶或戰力對等就停下來回報 BLOCKED（附 `retune.md`），不放寬、不改別的數字；若只能把規則調到看不出差別才過，也停下來回報。

## 控制者裁定（2026-10-21）

計畫者提出的 6 項全部採用（使用者已授權細節由我們決定）：符文存檔欄位延到第 ⑤ 步、以可省略欄位加入；莉茲的樹重排；對 spec §8 清單的偏離（雷之結界、略過預報與超頻・過熱、盈月、新月之夜改為變招）；只改數字的變招白名單（久護、深鑿、深眠、殺價、速射）；變招名稱接在技能名後；遷移時洛恩一律用 balanced（另送免費重置）。③④ 合併為本計畫。

## Global Constraints

**使用者的方向（最高依據）**
- 「不裝符文頂多過普通」：普通難度的驗收＝預設配點、沒有符文的模擬。`engine/balance*.test.ts` 的門檻凍結，只准收緊。平衡只對照預設配點（記憶「星燈迷宮必須配點」）。
- 「不夠直覺的話我可能會懶的研究 build」：每個節點一句話講完規則、看得到（spec §4、§7、§17）。

**分支與基準**
- `feat/starlantern-story`，HEAD `309c4ecb` 或之後。開工前 `git status`：本計畫要改的檔案有別人未提交的修改，停下來回報 NEEDS_CONTEXT。
- 閘門 `against` 鏈：Task 1 對 `.superpowers/sdd/2026-10-21-starlantern-plan8c-roster-mechanics/gate-8`；之後每個任務對前一個任務在 SDD 的快照。不覆寫 `engine/__fixtures__/` 底下任何既有檔案。
- 戰力對等規則照 8a 裁定 2（8c 裁定 11）：基準 `engine/__fixtures__/sim-gate/contribution.8b.json`；每格每位 `max(10% × 自己的基準, 2% × 該格整隊)`；每位五個等級加總 ±10%；整隊每格 ±5%。

**測試與檢查**
- TDD：先寫失敗的測試，確認它因正確的理由失敗，再實作。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`。
- 平衡帶＋閘門：`rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-21-starlantern-plan8d-tree-rework/gate-<N> <against>`（四個平衡檔＋`engine/parity.test.ts`）。一次只跑一套重的測試。
- tsc：`rtk proxy npx tsc --noEmit -p .`；starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個（repo 原本約 43 個與本專案無關）。
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`；headless、靜音；只用 4352，絕不用 4354，不結束任何程序。
- 本專案沒有 prettier、eslint，不要跑。
- 一次性的探測程式不放在 `src/` 底下過夜：要用 vitest 跑的片段，跑完立刻刪掉，絕不 commit。
- **內容任務的收尾（Task 3、5–8，下稱「收尾 R」）**：(1) 全套全綠、tsc 0；(2) 閘門預期 DIFFERENT，四個平衡檔與 `parity.test.ts` 的 Tests 全部通過（`BALANCE_REPORT=1` 的 soft failure 也算失敗）；(3) 報告每一個不同行、`actions.json` 變了的測試名、兩位角色每格的戰力對等（`checkParity` rows）、每一次調整（常數、前後數字），寫進 SDD 的 `retune.md` 該任務一節；(4) e2e 全綠；(5) 過不了照裁定 12 停下來回報。

**換行（逐檔保留）**：改檔前 `git ls-files --eol <檔案>`；改完 `git diff --stat`，整檔被改寫就是換行壞了。CRLF 檔不可以用 `sed -i`。已知：CRLF：`engine/save.ts`、`engine/state.ts`、`engine/types.ts`、`data/skills.ts`、`engine/sim.ts`；LF：`data/trees.ts`、`data/gear.ts`、`data/policies.ts`、`engine/progression.ts`、`ui2/scenes/statusTabs.ts`、`engine/mech.ts`、`engine/mechanics/*.ts`；混用：`engine/skills.ts`、`engine/game.ts`、`engine/town.ts`、`engine/battle.ts`、`engine/combatant.ts`、`data/text.zh-TW.ts`。新檔一律 LF。

**亂數**：不可以 `Math.random`。機制旋鈕一律不抽。只有這些新東西抽戰鬥的 `rng`（依既有的固定順序）：變招加的段數（每段照舊抽）、變招附加的 `inflict`（`inflictAilment`，機率 0 不抽）、雷之結界每回合末對每個敵人一次 `rollHit`、雙管每下一次 `rollHit`、雙砲台第二座的目標 `pick`。`game.rng`、`lootRng` 等串流一次都不多抽。

**git**：完整路徑 add，不可以 `git add -A`／`git add .`。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。絕對不可以 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。不 push。

**介面與文字**
- 不新增圖片、假圖示，不用 CSS 畫形狀；機制節點沒有技能圖示，只顯示文字（不放佔位圖）。SCSS 禁 `!important`、禁行內樣式（含 `element.style`）。
- 節點的一句話：全形標點、照《文風聖經》§3 該角色語氣；不用「……」；數字一律由 `say` 從數字產生。介面文字放 `data/text.zh-TW.ts`。
- 手機寬度 390 下，技能樹的一對、技能選單的變招名稱不溢出（e2e 量 `scrollWidth <= clientWidth`）。

**測試修改規則**：各任務 Files 列出已知會紅的既有測試。全套跑出沒列到的紅燈，而它斷言的正是本任務換掉的節點（id、名稱、數字）或舊樹形狀，可以照新內容改並在報告列出；其他紅燈停下來回報 NEEDS_CONTEXT。`it.fails`、`it.skip`、`.only`、`.todo` 不可以出現在 commit。

**子代理**：實作者不派子代理。

## Review Focus
1. **舊的版本 8 存檔（有強化節點點數、穿著傳說裝備）讀得進來，變成合法的版本 9，除了技能樹以外一欄不差，且每位成員有一次免費重置。** 測試：Task 2 `a version 8 save loads as version 9 with standard trees and one free respec`。
2. **一對永遠只有一邊有點數**，不論是投點、改選、讀進手改的存檔、還是遷移。測試：Task 1 `a pair holds points on one side only`（投點被拒 `'pair'`、`validBuild` 拒絕兩邊都有、`swapPair` 搬完另一邊是 0）。
3. **改選之後，上面幾層照樣合法、點數一點不少。** 測試：Task 1 `swapping a side keeps the nodes above it and every point`。
4. **傳說威力和變招落在同一招時兩者都生效、名稱說明都對。** 測試：Task 3 `a legendary power and a variant on the same skill both apply`（`lg-noel` 全體 70% ＋ 連星 2 段）。
5. **標準配點仍在舊等級學會舊招，而核心機制的招早到**（凜 Lv2 暗記、莉茲 Lv3 大手筆）。測試：Task 3、Task 6 的 `the standard build learns <招> by Lv<N>`，加上既有的 `defaultTree learns every old skill at its old level` 維持綠。

---

## File Structure
- `data/trees.ts`：節點種類、`pair`、`V`／`K`／`P` 建構、`tierNodes`／`branchNodes`、`nodeText`、`DEFAULT_FIRST`、`MechKnob`、全部樹內容。
- `engine/progression.ts`：`check`（`'pair'`、同層的 req、gate）、`swapPair`、`mechKnob`、`nodeMods`、`ranksHeld`、`defaultTree`、`heroTree`。
- `engine/types.ts`（`SkillRules`、`SkillDef.rules`、`Member.freeRespec`、效果的新欄位）、`data/gear.ts`（`SkillMod.notes`／`rules`）、`engine/skills.ts`（`patchSkill`、`stackMods`、`NAMED_NUMBERS`）。
- `engine/mechanics/*.ts`、`engine/mech.ts`：各任務讀自己的旋鈕與規則欄位。
- `engine/save.ts`、`engine/state.ts`、`engine/town.ts`、`engine/game.ts`、`ui2/scenes/inn.ts`：Task 2 的遷移與免費重置；`engine/game.ts` 的 `swapVariant`：Task 1。
- `ui2/scenes/statusTabs.ts`、`data/text.zh-TW.ts`、`src/styles/_starlantern-ui.scss`：Task 4 的樹頁。
- 測試：`data/trees.test.ts`（樹形狀與文字守門）、`engine/progression.test.ts`、`engine/save.test.ts`、`engine/mechanics/<機制>.test.ts`、`ui2/scenes/status.test.ts`、`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 樹的新骨架（一對、變招、機制旋鈕、先學清單），舊內容原封不動

**Files:**
- Modify：`data/trees.ts`、`engine/progression.ts`、`data/gear.ts`、`engine/types.ts`、`engine/skills.ts`、`engine/game.ts`、`data/text.zh-TW.ts`（`reason.pair`）
- Modify（會紅的既有測試）：`data/roster.test.ts` 的 `every tree node still stands where it stood`（換成本任務的形狀守門）、`data/hero.test.ts`／`data/trees.test.ts` 裡斷言 `kind: 'mod'` 的地方改 `'variant'`
- Test：`engine/progression.test.ts`、`data/trees.test.ts`、`engine/skills.test.ts`、`engine/game.test.ts`

**Interfaces:**
- Consumes：8c 的 `patchSkill`、`stackMods`、`treeMods`、`validBuild`、`roster-8b.json` 的 `trees`。
- Produces：
  - `data/trees.ts`：`export type NodeKind = 'active' | 'variant' | 'mech'`；`export type MechKnob = 'heatMax' | 'overloadSafePct' | 'markCap' | 'barrierThunder' | 'barrierPair' | 'moonPct' | 'coinRefund' | 'coinCap' | 'aimCap' | 'aimKeep' | 'emberCap' | 'coverEmbers' | 'misstepLoss' | 'duetPct' | 'deviceLevelCap' | 'deviceCap'`；`TreeNode = { id; kind: NodeKind; maxRank; skill?: string; name?: string; label?: string; mods?: SkillMod[]; knob?: MechKnob; values?: number[]; say?: (r: number) => string; pair?: TreeNode; rank?: 'turns' }`（`skill` 只有 active／variant 有）。
  - 建構：`V(id: string, skill: string, label: string, mods: SkillMod[], say: (m: SkillMod) => string): TreeNode`（`mods[r-1]` 自動帶上 `notes: [{ label, text: say(mods[r-1]) }]`）；`K(id: string, name: string, knob: MechKnob, values: number[], say: (v: number) => string): TreeNode`；`P(a: TreeNode, b: TreeNode): TreeNode`（回傳 `{ ...a, pair: b }`）；`V0(id, name, skill, desc, mods)`：本任務把 8c 的 `M(...)` 原樣改名而來（`kind: 'variant'`、沒有 `notes`），Task 8 結束時已經沒有任何 `V0`，Task 9 刪掉它。
  - `export function tierNodes(b: TreeBranch, tier: number): TreeNode[]`（`[A]` 或 `[A, B]`）；`export function branchNodes(b: TreeBranch): { node: TreeNode; tier: number }[]`（層序，每層 A 先 B 後）；`NODES[id]` 多 `pair?: string`（對方的 id），B 節點也登錄。
  - `export function nodeText(id: string, rank: number): string`（variant／mech 第 r 階的一句話；active 回 `''`）；`nodeName(id)`：variant ＝ `${SKILLS[skill].name}・${label}`（`V0` 沿用 `name`），mech ＝ `name`。
  - `export const DEFAULT_FIRST: Partial<Record<CharacterId, string[]>> = {}`。
  - `data/gear.ts`：`SkillMod.notes?: { label: string; text: string }[]`、`SkillMod.rules?: Partial<SkillRules>`。`engine/types.ts`：`export interface SkillRules {}`（之後各任務加欄位）；`SkillDef.rules?: Partial<SkillRules>`。
  - `engine/skills.ts`：`patchSkill` 把 `notes` 接到名稱（`・label`）與說明（接在最後）、把 `rules` 逐鍵合併進 `def.rules`（裁定 7 的「抄到效果」由各任務在同一處加）；`stackMods` 串接 `notes`、逐鍵合併 `rules`。
  - `engine/progression.ts`：`RaiseFail` 加 `'pair'`（順序 `unknown, max, pair, req, gate, abyss, capstone, points`）；`check` 的 req ＝ `tierNodes(branch, t - 1)` 任何一個有點數，gate ＝ 較低各層所有節點的點數和；`ranksHeld`、`nodeMods`（含 B）、`defaultTree`、`heroTree` 改用 `branchNodes`；`export function swapPair(m: Member, node: string): { ok: true; member: Member } | { ok: false; reason: 'unknown' | 'empty' }`（`node` 不在一對裡或不是這位成員的 → `'unknown'`；對方 0 點 → `'empty'`；否則 `node` 得到對方的點數、對方刪除）；`export function mechKnob(ranks: unknown, owner: CharacterId, k: MechKnob): number | undefined`（該角色持有 `knob === k` 的機制節點時回 `values[min(rank, maxRank) - 1]`，讀法同 `rankIn`）。
  - `defaultTree` 的種類順序：1. 到期的舊招；2. `DEFAULT_FIRST[id]` 中第一個可投的；3. 升級（已學主動的階、已學技能的 variant、上一層有點數的 mech）；4. 其他新節點；5. 提早的舊招。B 節點永遠不選。
  - `engine/game.ts`：`swapVariant(id: CharacterId, node: string): { ok: true } | { ok: false; reason: 'unknown' | 'empty' | 'invalid' }`（`phase` 限 `town`／`map`、成員已招募；城鎮中立即存檔，失敗只留 `save-failed` 通知，同 `raiseNode`）。
  - `T.ui2.tree.reason.pair`：「已選另一個版本」。

- [ ] **Step 1：先寫失敗的測試**
  - `data/trees.test.ts`：
    - `every tree keeps its 8b capacity and shape`：每個角色，支數與每支 5 層等於 `roster-8b.json`；每層 A 的 `maxRank` 等於 8b 那一格；有 `pair` 的格，B 與 A 同 `kind`、同 `maxRank`、B 沒有自己的 `pair`；`capacity(id)`（第 0–3 層每格 `maxRank` 和 − 1 免費 ＋ 1 終極，一對只算一格）等於同一個公式套在 `roster-8b.json` 的 `trees` 上的值（不寫死數字，兩邊用同一個函式）。
    - `every node is reachable through branchNodes and NODES knows its pair`：`NODES` 的鍵集合等於所有 `branchNodes` 的 id；有 pair 時 `NODES[a].pair === b` 且 `NODES[b].pair === a`、兩者 `tier` 相同。
  - `engine/progression.test.ts`：
    - `a pair holds points on one side only`：用一棵測試用的樹（以 `vi.mock` 或在測試裡對 `TREES`／`NODES` 加一對假節點，測完還原）：A 有 1 點時 `canRaiseNode(B) === 'pair'`；`validBuild` 對兩邊都有點數的樹回 false；A、B 都 0 時兩邊都可投。
    - `swapping a side keeps the nodes above it and every point`：A 2 點、上一層有 1 點 → `swapPair(m, B)` 成功，B 2、沒有 A，上一層照舊，`skillPointsLeft` 不變，`validBuild` true；`swapPair(m, A)` 時 B 為 0 → `'empty'`；不在一對裡的節點 → `'unknown'`。
    - `mechKnob reads the held rank of a mechanic node`：假機制節點 `values: [6, 7, 8]`：0 點 → undefined；2 點 → 7；手改的 9 點 → 8；別人的旋鈕 → undefined。
    - `the standard build never takes a B side and takes DEFAULT_FIRST before upgrades`：假樹上 `defaultTree` 從不出現 B；`DEFAULT_FIRST` 指到第 0 層節點時，它在第一個不是「到期舊招」的點就被學會。
    - 既有的 `every rank of every node counts` 改寫：`others` 排除自己與自己的 pair；`kind === 'mech'` 的節點改比 `mechKnob` 的值每一階都不同。既有的 `defaultTree learns every old skill at its old level`、`defaultTree spends every point it legally can` 不改、必須維持綠。
  - `engine/skills.test.ts`：`notes name the variant and add its rule; rules merge key by key`：`patchSkill(fire-star, { notes: [{ label: '連星', text: '改為 2 段。' }], hits: 2 })` → 名稱「火之星彈・連星」、說明以「改為 2 段。」結尾；`stackMods([{ notes: [a] }, { notes: [b] }])` 的 `notes` 是 `[a, b]`；`rules` 後者蓋前者同鍵、保留其他鍵。
  - `engine/game.test.ts`：`swapVariant works in town and the field, never in battle`（用假的一對：`town` 成功並存檔、`battle` 回 `invalid`）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/trees.test.ts src/scripts/games/starlantern/engine/progression.test.ts src/scripts/games/starlantern/engine/skills.test.ts src/scripts/games/starlantern/engine/game.test.ts`。預期：`tierNodes`、`swapPair`、`mechKnob` 不存在。
- [ ] **Step 3：實作**（照 Interfaces；55 個 `M(...)` 改成 `V0(...)`，id、數字一字不改）。
- [ ] **Step 4：確認通過**：Step 2 全綠；全套全綠；tsc 0。
- [ ] **Step 5：閘門**：`… gate-1 .superpowers/sdd/2026-10-21-starlantern-plan8c-roster-mechanics/gate-8`，必須 `gate: identical`。不同就停下來回報 BLOCKED。
- [ ] **Step 6：commit**：`refactor(starlantern): skill-tree nodes become active, variant or mechanic; pairs, free side swap, mechanic knobs, first-learned list`。

### Task 2: 存檔 8 → 9：標準配點重套、一次免費重置、讀檔說明

**Files:**
- Modify：`engine/state.ts`（`SAVE_VERSION = 9`）、`engine/types.ts`（`Member.freeRespec?: true`）、`engine/save.ts`（`migrate8to9`、驗證 `freeRespec`、刪 `upgradeTreeIds`）、`data/trees.ts`（刪 `LEGACY_NODE_IDS`）、`engine/town.ts`（`respecPrice`、重置清旗標）、`engine/game.ts`（`Notice` 加 `'tree-reworked'`）、`ui2/scenes/inn.ts`（價格欄用 `respecPrice`，0 顯示「免費」）、`data/text.zh-TW.ts`
- Modify（會紅的既有測試）：`engine/save.test.ts` 的 `a save that holds old node ids loads with them renamed` 與「舊 id 和新 id 都在」那則（刪除，由本任務的遷移測試取代）、斷言版本 8 的幾則（`SAVE_VERSION` 現在是 9）；`data/roster.test.ts` 裡讀 `LEGACY_NODE_IDS` 的斷言（改成測試裡寫死的 15 筆改名表，只檢查舊 id 已不在 `SKILLS`）
- Test：`engine/save.test.ts`、`engine/town.test.ts`、`engine/game.test.ts`、`ui2/scenes/inn.test.ts`（沒有就加在既有的 inn 場景測試檔）、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 1 的 `defaultTree`、`heroTree`、`memoriesOf`。
- Produces：
  - `export function migrate8to9(d: Record<string, unknown>): void`（`engine/save.ts`）：`d.party.roster` 每個成員（物件、`id` 是已知角色、`level` 是 1..`MAX_LEVEL` 的整數）：`tree = id === 'hero' ? heroTree(level, 'balanced', memoriesOf(m)) : defaultTree(id, level)`、`freeRespec = true`；天賦、裝備、記憶、好感度、其他欄位不碰；最後 `d.version = 9`。不合格的成員不碰（交給 `isValid` 判損毀）。
  - `loadGame`：`version === 8` → `migrate8to9`，然後照舊 `dropUnknownBanters` → `isValid`；其他不是 9 的版本照舊備份並回 `'version'`。`LoadResult` 的 ok 多 `migrated?: true`。遷移前的原文照舊寫進 `BACKUP_KEY`（同「版本不符」的備份），玩家可以回復。
  - 驗證：`freeRespec` 只能是 `undefined` 或 `true`。
  - `engine/town.ts`：`export function respecPrice(m: Member): number`（`m.freeRespec ? 0 : respecCost(m.level)`）；`respec` 用它扣金幣、重置後刪 `freeRespec`。
  - `Game.boot`：`r.status === 'ok' && r.migrated` → `notice = 'tree-reworked'`。`T.notices['tree-reworked']`：「技能樹改版了，技能點已依標準配點重新分配；下一次旅館重置免費。」（spec §14 原文）。

- [ ] **Step 1：先寫失敗的測試**
  - `engine/save.test.ts`：
    - `a version 8 save loads as version 9 with standard trees and one free respec`：`newGame()` 招募全部角色，各設等級（洛恩 30、記憶 4；諾艾兒 20；其他 12），樹寫成 8b 形狀的舊配點（id 取自 `roster-8b.json` 的 `trees`：每支第 0 層 1 點＋第 1 層 1 點，含強化節點 id），諾艾兒穿一件 `lg-noel` 傳說武器（`power`），`version: 8`，存檔 → `loadGame` 回 `ok`、`migrated: true`、`version === 9`；每位成員 `tree` 等於 `defaultTree(id, level)`（洛恩等於 `heroTree(30, 'balanced', 4)`）、`freeRespec === true`、`validBuild` true；`gold`、`inventory`、`bag`、`story`、`codex`、`dungeon`，以及每位成員除 `tree`／`freeRespec` 外的欄位，逐欄等於存檔前；`BACKUP_KEY` 是原文。
    - `versions other than 8 and 9 are still refused`：7、10 → `'version'` 並備份。
    - `freeRespec must be true or absent`：`false`、`1`、`'yes'` → `'corrupt'`。
    - `a version 9 save is not migrated again`：`migrated` 不存在、樹不被改。
  - `engine/town.test.ts`：`the first respec after the rework is free, the next one is not`：`freeRespec` 的成員重置後金幣不變、旗標消失；再投點再重置付 `25 × level`。
  - `engine/game.test.ts`：`booting a version 8 save says the tree was reworked`（`notice === 'tree-reworked'`）。
  - inn 場景：`the respec list says free for a member who has one`（右欄「免費」，其他人 `${25 × level} G`）。
  - e2e `an old save opens with the rework notice and a free respec (plan 8d)`：`localStorage` 放一份版本 8 存檔（同上的建法，序列化成 JSON 字面值），開遊戲 → 畫面有通知原文；到旅館重置清單看到「免費」；沒有 console 錯誤。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/save.test.ts src/scripts/games/starlantern/engine/town.test.ts src/scripts/games/starlantern/engine/game.test.ts`。預期：版本 8 回 `'version'`。
- [ ] **Step 3：實作**（照 Interfaces）。
- [ ] **Step 4：確認通過**：Step 2 全綠；全套全綠；tsc 0；e2e 全綠。
- [ ] **Step 5：閘門**：`… gate-2 …/gate-1`，必須 `identical`（模擬不讀存檔）。
- [ ] **Step 6：commit**：`feat(starlantern): save version 9 — old trees respent on the standard build, one free respec, a notice on load`。

### Task 3: 諾艾兒與凜的節點；凜的暗記提早

**Files:**
- Modify：`data/trees.ts`（兩棵樹、`DEFAULT_FIRST.rin`）、`engine/types.ts`（`SkillRules.heat`、`again`；`mark` 效果的 `critPct?`、`hops?`）、`engine/skills.ts`（`patchSkill` 抄到 `mark` 效果）、`engine/mechanics/heat.ts`、`engine/mechanics/mark.ts`、`engine/combatant.ts`（暗記目標的暴擊傷害加成）
- Modify（會紅的既有測試）：`engine/progression.test.ts`、`data/rin.test.ts`、`ui2/scenes/status.test.ts` 裡斷言 `noel-*-up`、`rin-*-up` 的地方
- Test：`engine/mechanics/heat.test.ts`、`engine/mechanics/mark.test.ts`、`engine/progression.test.ts`、`data/gear.test.ts`

**節點**（A 為標準；r1/r2/r3 為每階數字；「一句話」是 `say` 的範本，`{}` 由數字填）：

| 角色・格（8c 的節點） | 新節點 | 種類 | 一句話 | r1/r2/r3 |
|---|---|---|---|---|
| 諾艾兒 0-1（noel-fire-up） | A `noel-star-twin` 連星 ／ B `noel-star-heavy` 重星 | 變招一對（火之星彈） | A「改為 2 段，每段威力 {p}%。」 B「威力 {p}%，每次熱度 +2。」 | A `hits 2`、`powerPct` 55/60/65；B `powerPct` 130/140/150、`rules.heat 2` |
| 諾艾兒 0-3（noel-wave-up） | A `noel-wave-burn` 延燒 ／ B `noel-wave-focus` 聚焰 | 變招一對（炎之波） | A「命中時 {c}% 使目標灼燒。」 B「改為打單體，威力 {p}%。」 | A `extra inflict burn` 0.3/0.4/0.5；B `target 'enemy'`、`powerPct` 170/180/190 |
| 諾艾兒 1-1（noel-ice-up） | A `noel-calm` 冷靜 ／ B `noel-safe` 反噬無效 | 機制一對 | A「熱度上限 {v}。」 B「暴走不再傷到自己，但暴走威力只有 {v}%。」 | A `heatMax` 6/7/8；B `overloadSafePct` 160/170/180 |
| 諾艾兒 1-3（noel-bind-up） | `noel-bind-freeze` 冰封 | 變招（冰縛） | 「命中時 {c}% 使目標凍結（頭目改冰緩）。」 | `extra inflict freeze` 0.3/0.4/0.5 |
| 諾艾兒 2-2（noel-hex-up） | `noel-hex-wide` 擴咒 | 變招（衰弱咒） | 「改為對全體，弱點 {t} 回合。」 | `target 'enemies'`、`turns` 2/3/4 |
| 諾艾兒 2-3（noel-thunder-up） | `noel-thunder-double` 雙響 | 變招（雷之星彈） | 「改為 2 段，每段威力 {p}%。」 | `hits 2`、`powerPct` 60/65/75 |
| 凜 0-1（rin-needle-up） | `rin-needle-three` 三連 | 變招（飛針） | 「改為 3 段，每段威力 {p}%。」 | `hits 3`、`powerPct` 74/80/90 |
| 凜 1-1（rin-backstab-up） | `rin-backstab-bleed` 影縫 | 變招（背刺） | 「命中時 {c}% 使目標流血。」 | `extra inflict bleed` 0.3/0.4/0.5 |
| 凜 1-3（rin-veil-up） | `rin-names` 名單 | 機制 | 「可以同時暗記 {v} 個目標。」 | `markCap` 2/3/4 |
| 凜 2-1（rin-mark-up） | A `rin-mark-steady` 不眨眼 ／ B `rin-mark-hop` 轉印 | 變招一對（暗記） | A「打暗記的目標，暴擊傷害 +{v}%。」 B「暗記的目標倒下時，暗記跳到下一個敵人（每場最多 {v} 次）。」 | A `rules.markCritPct` 30/40/50；B `rules.markHops` 1/2/3 |
| 凜 2-3（rin-execute-up） | `rin-execute-chase` 追命 | 變招（處決） | 「處決擊倒暗記的目標時，這回合的「還有。」多 {v} 次。」 | `rules.again` 1/2/3 |

`DEFAULT_FIRST.rin = ['rin-mark']`。

**Interfaces:**
- Consumes：Task 1 的 `V`／`K`／`P`、`mechKnob`、`SkillRules`；8c 的 `HEAT`、`castDef`、`mark` 模組。
- Produces：`SkillRules` 加 `heat?: number; markCritPct?: number; markHops?: number; again?: number`；`mark` 效果加 `critPct?: number; hops?: number`（`patchSkill` 從 `rules` 抄）；`MechState` 的 `mark` 加 `crit?: number; hops?: number`（施放暗記時寫入，轉印每用一次 −1）；heat 模組：上限 ＝ `mechKnob(...,'heatMax') ?? HEAT.max`，暴走看上限；持有 `overloadSafePct` 時暴走威力用它、不反噬；技能有 `rules.heat` 時熱度改加這個數。「還有。」的次數 ＝ 1 ＋ 這次擊倒所用技能的 `rules.again ?? 0`（每回合）。暗記上限 ＝ `mechKnob(...,'markCap') ?? 1`（`cap` 在 `init` 寫入）。

- [ ] **Step 1：先寫失敗的測試**
  - `heat.test.ts`：
    - `calm raises the heat cap and overload waits for it`：持有 `noel-calm` 2 點：熱度可到 7、威力 `100 + 8 × 7` = 156%；熱度 7 才暴走；沒有節點時照舊 5。
    - `no backlash: overload is 160% and costs no HP`：`noel-safe` 1 點、熱度 5 → 火之星彈威力 `pctOf(140, 160)` = 224、HP 不變、熱度歸 0；記 `cue: 'overload'` 且沒有 `amount`。
    - `the heavy star heats by two`：`noel-star-heavy` 1 點 → 一次火之星彈後熱度 2、威力 182。
  - `mark.test.ts`：
    - `rin can mark as many as her list allows`：`rin-names` 1 點 → 對 e0、e1 施放後 `marks` 兩個；第三個取代最舊的。
    - `steady: crits on the mark hit harder`：`rin-mark-steady` 1 點：對暗記目標的暴擊傷害是沒有節點時的 1.3 倍（同一組 `HitRolls`）。
    - `hop: the mark jumps to the next foe, as many times as the rank`：`rin-mark-hop` 1 點、e0 倒下 → `marks: ['e1']`；e1 倒下 → `[]`。
    - `chase: an execute that fells the mark brings 還有。 twice`：`rin-execute-chase` 1 點：同一回合最多兩次追加，`cue: 'again'` 記兩次。
  - `engine/progression.test.ts`：
    - `the standard build learns the mark by Lv2`：`defaultTree('rin', 2)['rin-mark'] === 1`；`defaultTree('rin', 5)` 含 `rin-mark`。
    - `noel and rin hold no B side and no 8c node`：`defaultTree` 的 Lv5／10／20／35／50 不含任何 B id、不含任何 `-up` id。
  - `data/gear.test.ts`：`a legendary power and a variant on the same skill both apply`：`skillFor({ powers: ['lg-noel'], ranks: { 'fire-star': 1, 'noel-star-twin': 1 } }, 'fire-star')` → `target 'enemies'`、`hits 2`、威力 `pctOf(pctOf(140, 55), 70)` = 54、名稱「火之星彈・連星」。
  - 每個節點的 `say`：`data/trees.test.ts` 的 `node words name their own numbers`（本任務先涵蓋諾艾兒與凜，Task 9 擴到全部）：每個 variant／mech 節點每一階的 `nodeText` 含該階 mod／value 的每個數字（百分比、段數、回合、機率 ×100）；某個數字在相鄰兩階不同時，前一階的值不出現在後一階的文字裡。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/heat.test.ts src/scripts/games/starlantern/engine/mechanics/mark.test.ts src/scripts/games/starlantern/engine/progression.test.ts src/scripts/games/starlantern/data/gear.test.ts src/scripts/games/starlantern/data/trees.test.ts`。
- [ ] **Step 3：實作**（照表與 Interfaces；兩棵樹的 `V0` 全部換掉）。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 R**（`gate-3`，against `gate-2`）。凜在每一支量測隊伍裡，每格的整隊 ±5% 都要看；`retune.md` 寫明暗記在 Lv5／Lv10 的頭目戰實際被施放的次數（用 `setSimTrace` 數）。
- [ ] **Step 6：commit**：`feat(starlantern): Noel's and Rin's variant and mechanic nodes; the standard build marks from Lv2`。

### Task 4: 技能樹頁：一對、改選、變招與機制的說明

**Files:**
- Modify：`ui2/scenes/statusTabs.ts`、`data/text.zh-TW.ts`、`src/styles/_starlantern-ui.scss`
- Modify（會紅的既有測試）：`ui2/scenes/status.test.ts` 裡斷言 `kind.mod`「強化」、`t.mod(...)` 文字的地方
- Test：`ui2/scenes/status.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 1 的 `branchNodes`、`tierNodes`、`nodeText`、`nodeName`、`canRaiseNode`（`'pair'`）、`Game.swapVariant`；Task 3 的諾艾兒一對。
- Produces：
  - `T.ui2.tree.kind`：`{ active: '主動', variant: '變招', mech: '機制', passive: '被動', ultimate: '終極' }`（刪 `mod`）；`T.ui2.tree.pairTag: '二選一'`、`swapOpen: '可改選（免費）'`、`swapPending: '再按一次改選'`、`swapped: '已改選'`。
  - 一對畫成同一層的兩列（A 在上），中間一行 `pairTag`；`treeOrder` 依 `branchNodes`。
  - 游標在一對中沒有點數的那一邊、而對方有點數（`canRaiseNode === 'pair'`）：狀態 `slx-node-swap`、腳註 `swapOpen`；按下走同一套兩段式（第一下 `swapPending`、第二下 `ctx.game.swapVariant`，成功 `swapped`）。
  - 說明區：variant／mech 顯示「目前：{nodeText(id, rank)}」（0 點顯示「未投入」）與「下一級：{nodeText(id, rank + 1)}」；機制節點沒有圖示（`skillIco` 只給有 `skill` 的節點）。
- [ ] **Step 1：先寫失敗的測試**
  - `status.test.ts`：
    - `a pair sits on one tier with its tag`：諾艾兒第 0 支第 1 層有兩列 `data-node="noel-star-twin"`、`noel-star-heavy`，之間有「二選一」。
    - `pressing the other side twice swaps for free`：連星 2 點 → 游標到重星：腳註「可改選（免費）」；按一下訊息「再按一次改選」、點數不變；再按一下 → 重星 2、連星 0、金幣與剩餘技能點不變、訊息「已改選」。
    - `variant and mechanic notes say the rule now and next`：冷靜 1 點 → 「目前：熱度上限 6。」「下一級：熱度上限 7。」；冷靜沒有 `img`。
  - e2e `the tree shows pairs and swaps a side (plan 8d)`：城鎮狀態頁技能樹，替諾艾兒投連星、改選重星；390 與 1280 寬：一對兩列 `scrollWidth <= clientWidth`；技能頁與戰鬥選單的「火之星彈・重星」不溢出；沒有 console 錯誤、沒有 404 圖片請求。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/status.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠；全套全綠；tsc 0；e2e 全綠；1280 與 390 截圖存 scratchpad 附在報告。
- [ ] **Step 5：閘門**：`gate-4`（against `gate-3`），必須 `identical`。
- [ ] **Step 6：commit**：`feat(starlantern): the tree page shows variant pairs and swaps a side for free`。

### Task 5: 千鶴與瑟蕾的節點；瑟蕾的第 1 支重排

**Files:**
- Modify：`data/trees.ts`、`engine/types.ts`（`barrier` 效果 `wake?`、`moon` 效果 `phase?`、`inflict` 效果 `turns?`；`SkillRules.releaseKeep`、`wake`、`phase`）、`engine/skills.ts`、`engine/ailments.ts`（`inflict` 的 `turns` 覆寫睡眠回合）、`engine/mechanics/barrier.ts`、`engine/mechanics/moon.ts`、`engine/battle.ts`（`syncWards` 讀兩個結界）
- Modify（會紅的既有測試）：`engine/progression.test.ts`、`ui2/scenes/status.test.ts` 裡斷言 `chizuru-*-up`、`selene-*-up` 與瑟蕾第 1 支順序的地方
- Test：`engine/mechanics/barrier.test.ts`、`engine/mechanics/moon.test.ts`、`engine/ailments.test.ts`、`engine/progression.test.ts`

**節點：**

| 角色・格 | 新節點 | 種類 | 一句話 | r1/r2/r3 |
|---|---|---|---|---|
| 千鶴 0-1（sweep-up） | `chizuru-sweep-twin` 雙月 | 變招（橫掃） | 「改為 2 段，每段威力 {p}%。」 | `hits 2`、`powerPct` 55/60/68 |
| 千鶴 0-3（spiral-up） | A `chizuru-thunder-ward` 雷之結界 ／ B `chizuru-twin-ward` 重結界 | 機制一對 | A「有結界時，每回合結束對全體敵人雷擊（威力 {v}）。」 B「可以同時有兩種結界，後放的那個效果 {v}%。」 | A `barrierThunder` 20/30/40；B `barrierPair` 60/80/100 |
| 千鶴 1-1（ward-up） | `chizuru-ward-long` 久護 | 變招（守之結界，白名單） | 「守之結界持續 {t} 回合。」 | `turns` 4/5/6 |
| 千鶴 1-3（sake-up） | `chizuru-purify-wake` 祓 | 變招（淨之結界） | 「也解除睡眠；回復威力 {p}%。」 | `rules.wake`、`powerPct` 100/115/130 |
| 千鶴 2-1（pierce-up） | `chizuru-pierce-twin` 連突 | 變招（貫槍） | 「改為 2 段，每段威力 {p}%。」 | `hits 2`、`powerPct` 55/60/68 |
| 千鶴 2-3（thrust-up） | `chizuru-release-keep` 連解 | 變招（破邪突） | 「解放後結界不消失，只少 {v} 回合。」 | `rules.releaseKeep` 3/2/1 |
| 瑟蕾 0-1（moon-up） | A `selene-moon-bright` 凝光 ／ B `selene-moon-wide` 群照 | 變招一對（月光） | A「回復威力 {p}%，TP +1。」 B「改為對我方全體，威力 {p}%。」 | A `powerPct` 125/135/150、`tpDelta 1`；B `target 'allies'`、`powerPct` 55/60/65 |
| 瑟蕾 0-3（rain-up） | `selene-tide` 盈月 | 機制 | 「月相的好處由 30% 變成 {v}%。」 | `moonPct` 40/50/60 |
| 瑟蕾第 1 支 | `cleanse` t0、`rebirth` t1、`moon-recall` t2（`maxRank 3`、`rank: 'turns'`）、`selene-new-night` t3、`full-moon-night` t4 | 重排（rebirth-up 刪） | — | — |
| 瑟蕾 1-3 | `selene-new-night` 新月之夜 | 變招（滿月之夜） | 「改停在新月，停 {t} 回合。」 | `rules.phase 'new'`、`turns` 3/4/5 |
| 瑟蕾 2-1（dream-up） | `selene-dream-deep` 深眠 | 變招（夢境，白名單） | 「睡眠持續 {t} 回合。」 | `turns` 4/5/6（抄到 `inflict.turns`） |
| 瑟蕾 2-3（arrow-up） | `selene-arrow-freeze` 寒月 | 變招（月影箭） | 「命中時 {c}% 使目標凍結（頭目改冰緩）。」 | `extra inflict freeze` 0.25/0.35/0.45 |

**Interfaces:**
- Produces：barrier 模組：雷之結界在 `beforeTicks` 之後、照 8c 結界的回合末順序，對每個活著的敵人一次 `rollHit`＋雷傷（威力 `values`，記給結界主人；`fieldWords` 的結界字尾加「・雷」）；重結界：`s.barriers` 最多兩個不同種類，同種取代同種，後放的那個效果 ×`barrierPair%`；`syncWards` 加總所有守之結界。`releaseKeep`：解放時結界回合 −N（到 0 移除）而不是移除。moon 模組：四個月相的加成都改用 `p = mechKnob(...,'moonPct') ?? 30`（回復、冰傷 `100 + p` %、睡眠 ×`(1 + p/100)`、TP ×`(1 − p/100)` 無條件進位最低 1）；`MOON` 常數改成以 `pct: 30` 推導，`constants.test.ts` 的釘值同步。`moon` 效果的 `phase: 'new'` 讓 hold 停在新月。`inflict.turns` 覆寫睡眠回合（其他異常照 8b 的回合）。
- [ ] **Step 1：先寫失敗的測試**
  - `barrier.test.ts`：`the thunder ward strikes every foe at round end`（守之結界在、`chizuru-thunder-ward` 1 點 → 每個敵人受一次雷傷，帳本記給千鶴；沒有結界時不抽 rng，用計數 rng 驗證）；`two kinds at once with the twin ward`（守之＋淨之並存，後放的威力 ×0.6；再放守之 → 取代舊的守之）；`release keeps the barrier with 連解`（剩 5 回合、1 點 → 剩 2）；`祓 wakes the sleeping`（淨之結界回合末解除睡眠，回復威力 100% 時與沒有節點相同）。
  - `moon.test.ts`：`the tide deepens every phase`（`selene-tide` 1 點：滿月月光 168 ＝ `pctOf(120, 140)`；新月夢境 0.84；上弦月光雨 TP `ceil(9 × 0.6)` = 6；下弦月影箭 182）；`the new-moon night holds the new moon`。
  - `ailments.test.ts`：`deep sleep lasts as the variant says`（`turns: 5` 的睡眠 5 回合；沒有 `turns` 照舊 3）。
  - `progression.test.ts`：`selene's prayer branch: recall at tier 2, open from Lv5`（`canRaiseNode` 對 Lv5、cleanse 1＋rebirth 1 的瑟蕾 `moon-recall` 為 null）；`chizuru and selene hold no B side and no 8c node`（同 Task 3 的寫法）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/barrier.test.ts src/scripts/games/starlantern/engine/mechanics/moon.test.ts src/scripts/games/starlantern/engine/ailments.test.ts src/scripts/games/starlantern/engine/progression.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 R**（`gate-5`，against `gate-4`）。千鶴與瑟蕾在每支隊伍裡，每格整隊 ±5% 都要看。
- [ ] **Step 6：commit**：`feat(starlantern): Chizuru's and Selene's variant and mechanic nodes; recall moves down Selene's prayer branch`。

### Task 6: 莉茲與希爾薇的節點；莉茲的樹重排、大手筆提早

**Files:**
- Modify：`data/trees.ts`（含 `DEFAULT_FIRST.liz`）、`engine/types.ts`（`SkillRules.coinSpendPct`、`coinPowerPct`、`aimPct`；`Effect` 加 `{ kind: 'aim-add'; n: number }`）、`engine/skills.ts`（`aim-add`、`NAMED_NUMBERS` 的每枚威力）、`engine/mechanics/coins.ts`、`engine/mechanics/aim.ts`、`engine/mech.ts`
- Modify（會紅的既有測試）：`engine/progression.test.ts`（莉茲的 `treeSkills` 順序、舊 id）、`ui2/scenes/status.test.ts`、`engine/policy.test.ts`（若斷言莉茲的技能清單）
- Test：`engine/mechanics/coins.test.ts`、`engine/mechanics/aim.test.ts`、`engine/progression.test.ts`

**莉茲的樹（重排）**：第 0 支「雙刃」：`twin-slash` | `pickpocket` | 一對 | 找零 | `jackpot`。第 1 支「尋寶」：`stealth` | `treasure-sense` | `smoke-bomb` | 嗆鼻 | `phantom-step`（自第 2 支第 4 層移來）。第 2 支「花錢」：`fortune-strike`（自第 1 支第 4 層移來，`maxRank 3`）| 分期 | `quickstep`（`maxRank 3`）| 金庫 | `appraise`（`maxRank 1`）。容量等於 8b（第 0–3 層：12＋8＋12，Task 1 的守門測試）。`DEFAULT_CAPSTONE.liz` 仍是 0。

**節點：**

| 角色・格 | 新節點 | 種類 | 一句話 | r1/r2/r3 |
|---|---|---|---|---|
| 莉茲 0-2（twin-up） | A `liz-twin-quick` 快手 ／ B `liz-twin-haggle` 殺價 | 變招一對（雙刃；B 白名單） | A「改為 3 段，每段威力 {p}%。」 B「TP −2，威力 {p}%。」 | A `hits 3`、`powerPct` 75/80/87；B `tpDelta −2`、`powerPct` 85/90/95 |
| 莉茲 0-3（triple-up） | `liz-change` 找零 | 機制 | 「用掉銅板的招之後，退還 {v} 枚。」 | `coinRefund` 2/3/4 |
| 莉茲 1-3（smoke-up） | `liz-smoke-choke` 嗆鼻 | 變招（煙霧彈） | 「另使敵人速度降低 {v}%，3 回合。」 | `extra buff spd` −15/−20/−25、3 回合 |
| 莉茲 2-1 | `liz-fortune-split` 分期 | 變招（大手筆） | 「只花一半的銅板（進位），每枚威力多 {v}%。」 | `rules.coinSpendPct 50`、`rules.coinPowerPct` 18/21/24 |
| 莉茲 2-3 | `liz-vault` 金庫 | 機制 | 「銅板上限 {v} 枚。」 | `coinCap` 12/14/16 |
| 希爾薇 0-1（aim-up） | A `sylvie-aim-one` 一擊 ／ B `sylvie-aim-rapid` 速射 | 變招一對（瞄準射擊；B 白名單） | A「這一箭的瞄準每層 +{v}%。」 B「TP −2，威力 {p}%。」 | A `rules.aimPct` 20/25/30；B `tpDelta −2`、`powerPct` 90/95/100 |
| 希爾薇 0-3（heart-up） | `sylvie-patience` 獵人的耐心 | 機制 | 「瞄準上限 {v} 層。」 | `aimCap` 4/5/6 |
| 希爾薇 1-1（pin-up） | `sylvie-shift` 轉移 | 機制 | 「換目標時保留 {v} 層瞄準。」 | `aimKeep` 1/2/3 |
| 希爾薇 1-3（snare-up） | `sylvie-sunder-deep` 深鑿 | 變招（破甲箭，白名單） | 「降防持續 {t} 回合。」 | `turns` 5/6/7 |
| 希爾薇 2-1（rain-up） | `sylvie-rain-cover` 覆蓋 | 變招（箭雨） | 「命中後，她瞄準的目標瞄準 +{v} 層。」 | `extra { kind: 'aim-add', n }` 1/2/3 |
| 希爾薇 2-3（fire-up） | `sylvie-scatter-more` 多矢 | 變招（散射） | 「改為 {h} 支箭。」 | `hits` 4/5/6 |

`DEFAULT_FIRST.liz = ['fortune-strike']`。

**Interfaces:**
- Produces：coins 模組：上限 ＝ `mechKnob(...,'coinCap') ?? COINS.cap`；`coin-power`／`coin-hits` 的花費 ＝ `ceil(銅板 × (rules.coinSpendPct ?? 100) / 100)`、每枚威力 `rules.coinPowerPct ?? COINS.coinPowerPct`；花完之後退還 `mechKnob(...,'coinRefund') ?? 0`（不超過上限）。`castDef`／`unusable`／模擬的 `power()` 都讀同一個「這次會花幾枚」，0 枚時照 8c 變灰。aim 模組：上限 `aimCap ?? AIM.cap`；換目標（含目標倒下後的下一次單體行動）時新目標層數 ＝ `min(舊層數, aimKeep ?? 0)`，再照 8c 的 +1 規則；技能有 `rules.aimPct` 時這一擊每層用它取代 `AIM.dmgPct`；`aim-add`：她的瞄準目標（沒有時改為第一個被命中的敵人）+n，不超過上限，不抽 rng。
- [ ] **Step 1：先寫失敗的測試**
  - `coins.test.ts`：`the split spends half, rounded up`（7 枚 → 花 4、威力 `200 × (1 + 4 × 0.18)` 照 `castDef`、剩 3）；`change hands coins back`（`liz-change` 1 點：大手筆後剩 2）；`the vault holds more`（`liz-vault` 1 點：上限 12）；`a spender with no coin stays greyed`（8c 的規則在分期下照舊）。
  - `aim.test.ts`：`patience raises the cap`（`aimCap` 4）；`shift keeps stacks across a switch`（3 層、`sylvie-shift` 2 點 → 換目標後 2 層、這一擊之後 3）；`one shot makes each stack count double`（3 層、`sylvie-aim-one` 1 點 → 加成 60%）；`cover adds stacks without a draw`（計數 rng：箭雨有沒有 `aim-add` 抽取次數相同）。
  - `progression.test.ts`：`the standard build learns fortune-strike by Lv3`（Lv2 是 `stealth`、Lv3 `fortune-strike === 1`，`defaultTree learns every old skill at its old level` 維持綠）；`liz's tree keeps its capacity with fortune-strike at the foot of 花錢`；`liz and sylvie hold no B side and no 8c node`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/coins.test.ts src/scripts/games/starlantern/engine/mechanics/aim.test.ts src/scripts/games/starlantern/engine/progression.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 R**（`gate-6`，against `gate-5`）。`retune.md` 寫明大手筆在莉茲隊伍各格被施放的次數；band 18b（`allPhys`，8c Task 4 的卡點）的數字逐格列出。
- [ ] **Step 6：commit**：`feat(starlantern): Liz's and Sylvie's variant and mechanic nodes; Liz spends coins from Lv3`。

### Task 7: 絲嘉蕾與莎菲拉的節點

**Files:**
- Modify：`data/trees.ts`、`engine/types.ts`（`Effect` 加 `{ kind: 'embers'; pct: number }`、`cover` 效果 `keep?`；`SkillRules.emberPaidPct`、`beats`、`keep`）、`engine/skills.ts`、`engine/mechanics/embers.ts`、`engine/mechanics/beat.ts`、`engine/battle.ts`（代受可同時兩人；雙人舞的下一位隊友加成）、`engine/mech.ts`
- Modify（會紅的既有測試）：`engine/progression.test.ts`、`ui2/scenes/status.test.ts` 裡的 `scarlet-*-up`、`safira-*-up`
- Test：`engine/mechanics/embers.test.ts`、`engine/mechanics/beat.test.ts`、`engine/progression.test.ts`

**節點：**

| 角色・格 | 新節點 | 種類 | 一句話 | r1/r2/r3 |
|---|---|---|---|---|
| 絲嘉蕾 0-1（provoke-up） | `scarlet-provoke-shout` 高喊 | 變招（挑釁） | 「挑釁時，存下最大 HP {v}% 的餘燼。」 | `extra { kind: 'embers', pct }` 10/15/20 |
| 絲嘉蕾 0-3（roar-up） | `scarlet-cover-both` 雙肩 | 變招（代受） | 「可以同時代受兩人；持續 {t} 回合。」 | `rules.keep`（抄到 `cover.keep`）、`turns` 3/4/5 |
| 絲嘉蕾 1-1（burst-up） | `scarlet-burst-heart` 赤心 | 變招（爆炎斬） | 「HP 消耗全部用餘燼付清時，威力多 {v}%。」 | `rules.emberPaidPct` 30/40/50 |
| 絲嘉蕾 1-3（ring-up） | `scarlet-ring-blaze` 燎原 | 變招（炎環斬） | 「命中時 {c}% 使目標灼燒。」 | `extra inflict burn` 0.3/0.4/0.5 |
| 絲嘉蕾 2-1（wall-up） | `scarlet-ardent` 熾心 | 機制 | 「餘燼上限是最大 HP 的 {v}%。」 | `emberCap` 60/70/80 |
| 絲嘉蕾 2-3（bash-up） | `scarlet-thanks` 回禮 | 機制 | 「代受擋下一擊，另存最大 HP {v}% 的餘燼。」 | `coverEmbers` 5/8/10 |
| 莎菲拉 0-1（dance-up） | `safira-dance-four` 四拍 | 變招（刃舞） | 「改為 4 段，每段威力 {p}%。」 | `hits 4`、`powerPct` 82/90/100 |
| 莎菲拉 0-3（cyclone-up） | `safira-improv` 即興 | 機制 | 「同一招連用不再踩空，拍子只少 {v}。」（v = 0 說「拍子不變」） | `misstepLoss` 2/1/0 |
| 莎菲拉 1-1（war-up） | `safira-war-heat` 熱場 | 變招（戰舞） | 「另使全隊速度提升 {v}%。」 | `extra buff spd` 10/15/20、3 回合 |
| 莎菲拉 1-3（veil-up） | `safira-clap-encore` 安可 | 變招（拍手） | 「拍手給的量表變成 {p}%。」 | `powerPct` 150/175/200（量表） |
| 莎菲拉 2-1（mirage-up） | `safira-duet` 雙人舞 | 機制 | 「終幕之後，下一個行動的隊友那一招威力多 {v}%。」 | `duetPct` 20/30/40 |
| 莎菲拉 2-3（shadow-up） | `safira-shadow-sync` 切分音 | 變招（影步斬） | 「這一招讓拍子 +{v}。」 | `rules.beats` 2/3/4 |

**Interfaces:**
- Produces：embers 模組：上限 `emberCap ?? EMBER.capPct`；`embers` 效果直接加（不超過上限）；`emberPaidPct`：施放前餘燼 ≥ 這招的 HP 消耗時（`castDef` 判斷，付款在 `payMech`），威力 ×`(100 + v)%`；代受成功擋下一擊時另加 `coverEmbers%` 最大 HP。`cover.keep`：施放時不清掉她另一個代受，最多兩人；畫面的「受護」照 8c 規則，兩人都顯示。beat 模組：連用時 `beat = max(0, beat − (misstepLoss ?? 全部))`，`misstepLoss` 0 時不記「踩空」；`rules.beats` 取代 +1；終幕觸發後，`BattleState.duet = { pct, by: 'safira' }`，下一個不是她的隊伍成員的傷害行動 `castDef` 威力 ×`(100 + pct)%`，用掉即刪，回合末仍未用也刪；帳本照常（增加的傷害記給出手的人）。
- [ ] **Step 1：先寫失敗的測試**
  - `embers.test.ts`：`a shout stores embers`；`ardent raises the cap`（`scarlet-ardent` 1 點：上限 60%）；`heart: paid in embers, the blow is 30% stronger`（餘燼夠 → 威力 `pctOf(220, 130)` = 286；不夠 → 220 且照 8c 扣 HP）；`thanks: a covered blow adds embers`；`both shoulders cover two at once`（兩名隊友都「受護」、兩個單體攻擊都轉到她）。
  - `beat.test.ts`：`improv: a repeat costs two beats, not all`（拍子 3、`safira-improv` 1 點、連用 → 1，不記踩空；3 點 → 3）；`syncopation adds beats`；`a duet lifts the next ally's blow once`（終幕後下一位隊友的威力 ×1.2，再下一位不加；計數 rng 不多抽）。
  - `progression.test.ts`：`scarlet and safira hold no B side and no 8c node`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/embers.test.ts src/scripts/games/starlantern/engine/mechanics/beat.test.ts src/scripts/games/starlantern/engine/progression.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 R**（`gate-7`，against `gate-6`）。
- [ ] **Step 6：commit**：`feat(starlantern): Scarlet's and Safira's variant and mechanic nodes`。

### Task 8: 波比與洛恩的節點

**Files:**
- Modify：`data/trees.ts`、`engine/types.ts`（`device` 效果 `hits?`、`twin?`、`cures?: AilmentId[]`、`shock?`；`taunt` 效果 `steady?`；`heal` 效果 `overflowPct?`；`SkillRules.deviceHits`、`deviceTwin`、`deviceCures`、`deviceShock`、`steady`、`overflowPct`）、`engine/skills.ts`、`engine/mechanics/devices.ts`、`engine/combatant.ts`（`steady`：守勢期間不被暴擊、不抽暴擊骰）、`engine/mech.ts`
- Modify（會紅的既有測試）：`data/hero.test.ts`（`hero-*-up` 的數字表）、`engine/progression.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`、`ui2/scenes/status.test.ts`（寫死 `hero-sword-up` 的樹）、`engine/mechanics/devices.test.ts`（`twin-turret`）
- Test：`engine/mechanics/devices.test.ts`、`engine/skills.test.ts`、`data/hero.test.ts`、`engine/progression.test.ts`

**節點**（洛恩 `maxRank 5`，數字五個一組）：

| 角色・格 | 新節點 | 種類 | 一句話 | 每階 |
|---|---|---|---|---|
| 波比 0-1（turret-up） | `bobby-turret-twin` 雙管 | 變招（設置砲台） | 「砲台每次打 2 下，每下威力 {p}%。」 | `rules.deviceHits 2`、`powerPct` 55/60/68 |
| 波比 0-3（cannon-up） | `bobby-mass` 量產 | 機制 | 「裝置最多改良到 {v} 級。」 | `deviceLevelCap` 4/5/6 |
| 波比 0-4（twin-turret） | `bobby-turret-pair` 雙砲台 | 變招（設置砲台，終極格，`maxRank 1`） | 「可以同時架兩座砲台（第二座不算改良）。」 | `rules.deviceTwin` |
| 波比 1-2（repair-up） | `bobby-drone-aid` 急救 | 變招（修理無人機） | 「也解除{list}。」 | `rules.deviceCures` 中毒／中毒・灼燒・流血／全部異常 |
| 波比 2-1（barrier-up） | `bobby-bench` 工作檯 | 機制 | 「裝置最多同時 {v} 個。」 | `deviceCap` 3/4/5 |
| 波比 2-3（mine-up） | `bobby-mine-chain` 連鎖 | 變招（電擊地雷） | 「每次 {c}% 使敵人感電。」 | `rules.deviceShock` 0.2/0.3/0.4 |
| 洛恩 0-1（hero-sword-up） | `hero-slash-twin` 連斬 | 變招（斬擊） | 「改為 2 段，每段威力 {p}%。」 | `hits 2`、`powerPct` 52/54/56/58/60 |
| 洛恩 1-1（hero-guard-up） | `hero-guard-steady` 不動 | 變招（守勢） | 「守勢期間不會被暴擊；防禦提升效果 {p}%。」 | `rules.steady`、`buffPct` 104/108/112/116/120 |
| 洛恩 2-2（hero-star-up） | `hero-frost-chill` 凍原 | 變招（星霜） | 「命中時 {c}% 使目標凍結（頭目改冰緩）。」 | `extra inflict freeze` 0.10/0.12/0.14/0.16/0.18 |
| 洛恩 3-1（hero-light-up） | `hero-mend-overflow` 滿溢 | 變招（治癒） | 「溢出的回復變成護盾，最多最大 HP 的 {v}%。」 | `rules.overflowPct` 6/8/10/12/14 |

**Interfaces:**
- Produces：devices 模組：裝置上限 `deviceCap ?? DEVICE.cap`（`init` 寫入 `mech.cap`）、改良上限 `deviceLevelCap ?? DEVICE.maxLevel`；`device.hits` 每下一次 `rollHit`；`twin`：只有一座砲台時再放砲台＝新的一座（目標各自 `pick`），兩座都在時才是改良（改良剩餘回合最少的那座）；`cures`：無人機回復後解除列出的異常；`shock`：地雷每次對每個命中的敵人 `inflictAilment(shock, c)`。`steady`：`taunt` 帶 `steady` 時，施放者在挑釁期間被命中不抽暴擊骰、不暴擊。`heal.overflowPct`：溢出的量（`gainHp` 回傳之外的部分）變成護盾，上限最大 HP 的 v%，與 8c 護盾規則相同、記給施放者的 `shield`。
- [ ] **Step 1：先寫失敗的測試**
  - `devices.test.ts`：`a twin barrel fires twice`（兩下各一次 `rollHit`，威力 `pctOf(38, 55)`）；`mass production upgrades past three`；`the bench holds three`；`two turrets with the pair node`（第二次放砲台得到第二座、第三次改良其中剩餘回合最少的）；`the aid drone cures`（1 點只解中毒、3 點解全部）；`the chain mine shocks`（`constRng(0.19)` 感電、`0.21` 不感電）。
  - `skills.test.ts`：`a steady guard is never crit`（計數 rng：被命中時少一次暴擊骰）；`overflow becomes a shield up to the cap`（HP 差 10、回復 50、`hero-mend-overflow` 1 點、最大 HP 200 → 護盾 12）。
  - `data/hero.test.ts`：四個洛恩變招的數字表（照上表）取代舊的 `hero-*-up` 表；既有的 `HERO_PEAK_SHARE` 守門維持綠。
  - `status.test.ts`：`a turret with both variants keeps its name whole`（雙管＋雙砲台 → 名稱「設置砲台・雙管・雙砲台」，技能頁該列有長名稱 class）；e2e 在 Task 4 那則加一段：波比兩個變招都投點後，390 寬戰鬥選單的這一列 `scrollWidth <= clientWidth`。
  - `progression.test.ts`：`bobby and the hero hold no 8c node`；`every V0 is gone`（`TREES` 裡沒有 `V0` 建的節點：每個 variant 都有 `label` 與 `say`）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/mechanics/devices.test.ts src/scripts/games/starlantern/engine/skills.test.ts src/scripts/games/starlantern/data/hero.test.ts src/scripts/games/starlantern/engine/progression.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 R**（`gate-8`，against `gate-7`）。洛恩在每支隊伍裡；`hero` 的平衡帶 18（任何組成）與 `HERO_PEAK_SHARE` 都要列。
- [ ] **Step 6：commit**：`feat(starlantern): Bobby's and the hero's variant and mechanic nodes; every 8c strengthening node is gone`。

### Task 9: 守門與整體驗收

**Files:**
- Modify：`data/trees.ts`（刪 `V0`）、`data/trees.test.ts`、`engine/progression.test.ts`
- Create（SDD）：`parity-8d.md`（每個等級、每支隊伍、每位受測者：8b 基準 → 8c → 8d 的每回合貢獻四項與合計、`rule`、`allowed`、用掉的比例）
- Test：`data/trees.test.ts`、`engine/progression.test.ts`

- [ ] **Step 1：先寫測試**
  - `data/trees.test.ts`：
    - `no 8c strengthening node is left`：`roster-8b.json` 裡 `kind` 不是 active 的 55 個 id 都不在 `NODES`；每格的種類只有 active、variant、mech。
    - `every variant changes a rule`：每個 variant 第 1 階的 mod 至少有一個規則欄位（`hits`、`target`、`element`、`extra`、`rules` 的任何鍵）；只改數字（`powerPct`、`buffPct`、`tpDelta`、`turns`、`turnsDelta`、`hpCost`、`chance`、`powerDelta`）的只能是白名單 `['chizuru-ward-long', 'sylvie-sunder-deep', 'selene-dream-deep', 'liz-twin-haggle', 'sylvie-aim-rapid']`，而且後兩個都是一對的 B 邊。
    - `every mechanic knob is read by the engine`：`MechKnob` 的每個值在 `engine/` 底下非測試的 `.ts` 原始碼裡至少出現一次（`readFileSync` 掃描），且在 `TREES` 裡恰好一個節點用它。
    - `node words name their own numbers`（擴到全部節點，同 Task 3 的寫法）；`data/trees.ts writes no number by hand`：原始碼裡所有字串字面值都不符合 `/\d+\s*(%|段|回合|次|層|枚|支)/`。
    - `each companion has one or two mechanic nodes`（spec §7；`kind === 'mech'` 的節點數，一對的兩邊都算：凜、瑟蕾 1，其他夥伴 2；洛恩 0）。
  - `engine/progression.test.ts`：`every rank of every node counts`（Task 1 的版本）全部節點綠；`each core mechanic is in the standard build by Lv5`：諾艾兒有火之星彈、千鶴 `ward`、莉茲 `fortune-strike`、希爾薇 `aimed-shot`、絲嘉蕾 `flame-burst`、莎菲拉 `blade-dance`、波比 `turret`、凜 `rin-mark`；瑟蕾不需要技能（月相是被動，測試內註明 spec §8.6）。
- [ ] **Step 2：執行**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/trees.test.ts src/scripts/games/starlantern/engine/progression.test.ts`。任何一條不成立 → 回到負責的任務修（不是改測試）；修不了就停下來回報。
- [ ] **Step 3：整體驗收**：全套全綠、tsc 0、閘門 `gate-9`（against `gate-8`，必須 `identical`）、e2e 全綠；寫 `parity-8d.md`；報告列出本計畫每一個偏離 spec 的地方與根據（裁定 10 的清單＋各任務 `retune.md` 的調整）。
- [ ] **Step 4：commit**：`test(starlantern): the reworked trees — every node a rule, every knob read, every core mechanic in the standard build`。

---

## 交給之後計畫的介面（摘要）
- 樹：`NodeKind`、`TreeNode.pair`、`tierNodes`／`branchNodes`、`swapPair`、`Game.swapVariant`、`nodeText`、`DEFAULT_FIRST`。第 ⑧ 步的 build 資料用「節點順序＋選邊」，選邊就是 `swapPair` 之後的樹；標準 build ＝ `defaultTree`／`heroTree`（A 邊＋`DEFAULT_FIRST`）。
- 機制旋鈕：`MechKnob`、`mechKnob(ranks, owner, k)`；規則欄位：`SkillRules`（`patchSkill` 抄到效果的清單見裁定 7）。第 ⑤ 步的符文在 `rules` 之後套（spec §6.6），標籤從套完變招的技能推導。
- 第 ⑦ 步的「之前 → 之後」卡：變招的「之後」＝ `skillFor` 加上該節點；機制節點的「之後」＝ `nodeText`。
- 存檔：`SAVE_VERSION = 9`、`migrate8to9`、`Member.freeRespec`、`respecPrice`；第 ⑤ 步以可省略欄位加 `runes`／`sockets`（裁定 9），不升版本。
