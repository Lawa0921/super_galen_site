# 星燈迷宮 難度分級（噩夢、地獄） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在同一座迷宮、同一層、同一個建議等級上加兩個難度：噩夢（主線第 10 層解鎖）與地獄（結局後＋噩夢第 25 層頭目）。敵人多出異常、詞綴、更高的發動率與溫和的數值倍率，換來更好的掉落；建議 build 的符文是「裝了才打得過」的理由。普通難度逐位元不變。

**Architecture:**
- **一張表、一個入口**：所有倍率在 `data/difficulty.ts` 的 `TIERS`；程式一律經過 `tierOf(d)`，它對 `'normal'`／缺省回傳 `null`，呼叫端 `if (t)` 才走新路。所以普通既不乘 1、也不多抽一次亂數。
- **難度跟著 `BattleScale` 走**：`scale.difficulty` 與 `scale.affixes` 由呼叫端決定（遊戲：這一趟的 `Run.difficulty`、詞綴串流；模擬：直接指定），`createBattle`／`scaleEnemy` 只套用不抽籤。劇情戰建立時不帶難度。
- **平衡帶在自己的檔案**：`engine/tierBands.ts`（量法）＋選擇性執行的 `tierBands.{nightmare,hell}.test.ts`，登記在 `BANDS`；sim gate 的檔案與夾具一個位元都不動。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e（chromium＋dpr125／dpr150）、Pixi.js v8、SCSS、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-23-starlantern-difficulty-design.md`（使用者 2026-10-23 核准，§9 四題都選建議答案；技術細節授權自行決定）。上位：`docs/superpowers/specs/2026-10-20-starlantern-skill-builds-design.md` §13。前置：HEAD 含 plan 8h（builds、`buildBands.ts`、`BANDS`）與易讀性計畫（12／24px、`pixelText`、`@sweep`）。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄：`.superpowers/sdd/2026-10-23-starlantern-difficulty/`（下稱 SDD，已被 .gitignore 排除）。行號只供定位，動手時一律用內容找。

## 現有的介面（本計畫照用）
- `engine/battle.ts`：`Difficulty`、`BattleScale { depth; region; elite?; condition?; difficulty? }`、`createBattle(o)`（`sc` 存在才 `scaleEnemy`；之後 `empower`、`power = k × bossPower × deepPower`）、`chooseEnemyActions`（每招 `rng() < chance` 依序抽）。
- `engine/scaling.ts`：`scaleEnemy(def, depth, region, elite, condition)`（成長 → 區域特性 → 菁英 → 狀況攻擊 → 補償；`skills` 接上區域招；`exp`／`gold` 在這裡乘）、`mul`、`encounterTable`、`regionTint`。
- `engine/ailments.ts`：`inflictAilment`（`t.boss` 的凍結改冰緩）、`ailmentChance`、`ailmentChips`、`AILMENT`。
- `engine/loot/{runes,drops,item}.ts`：`runeTierWeights(…, difficultyMul = 1)`、`rollRune`、`runeRng`、`spotRuneRng`、`rarityWeights`、`rollGear`、`rollBossGear`、`BOSS_LEGENDARY`、`starlitChance`、`applyStarlit`、`DropCtx`、`itemLevel`、`mix`；`data/runeEconomy.ts`：`RUNE_DROP`、`RUNE_LEGENDARY`。
- `engine/game.ts`：`depart`、`departCheck`、`startBattle(enemyIds, boss, scaled, elite?, extra, opts)`、`isFinaleFight`、`isStoryDepth`、`battleGear`（`bossKills` 鍵 `${region}:${depth}`）、戰鬥符文掉落、`spotRune`、`dropCtx`、`chooseTier` 不存在（本計畫新增）。
- `engine/dungeon/run.ts`：`Run`、`newRun(seed, region, condition, startDepth, rescues)`；`engine/state.ts`：`DungeonProgress`、`SAVE_VERSION = 9`；`engine/save.ts`：`isBossKey`、`dungeon` 驗證。
- 模擬：`engine/sim.ts` `Lineup`（`build`、`runeTier`、`heroBuild`、`expect`）、`kitParty`、`simBattle`、`lineupPolicies`、`groupExp`、`ODD_LINEUPS`、`setSimTrace`；`engine/buildBands.ts`；`data/builds.ts` `BUILDS`、`buildOf`、`BuildDef.scenario`／`minLevel`；`data/forge.ts` `expectedEnhance`；`engine/bands.ts` `BANDS`；`scripts/starlantern-bands.mjs`（`BANDS=1`）。
- 畫面：`ui2/scenes/gate.ts`（`PortalCards`、`chooseDepth`、`askDepart`、`FacilityScene.greet`）、`ui2/scenes/dungeon.ts`（`floorName`、`conditionBadge`）、`ui2/scenes/battle.ts`（`onSubMoved` → `showNote`）、`render/BattleView.ts`（`showAilments`）、`render/pixelText.ts`、`ui2/scenes/handbook.ts`（`TABS`）、`tests/e2e/starlantern-legibility.ts`（`SWEEP`、`go`）。

## 計畫裁定

使用者授權技術規格自行決定；標「計畫裁定」的是本計畫的決定，附一行理由。spec 已同步標記【計畫裁定】的幾條（檔名、`dungeon.tier`、Q／E、不染色、手冊分頁）。

1. **普通不走新分支**：`tierOf(undefined | 'normal') === null`；每一個新行為都寫成 `const t = tierOf(…); if (t) …`。純函式的新參數一律可省略，省略時函式本體走原本那一行（不是乘 1）。守門：Task 1 的「缺省與 `'normal'` 逐欄相同、抽取次數相同」，加上每個碰 `engine/` 的任務 `gate: identical`＋`cmp` contribution。理由：使用者要求，而且浮點乘 1 也是新路徑。
2. **`TIERS` 的形狀**：`Record<Difficulty, TierDef>`，`normal` 是恆等列（只給測試與手冊讀，程式不讀它）。起始數字照 spec §5.0；Task 5b 只准改 `nightmare`／`hell` 兩列與 `AFFIXES` 的數字。
3. **發動率**：`chance' = max(chance, min(cap, chance × chanceMul))`，只套在怪物自己的招與區域招；詞綴招用表上的發動率，不再乘。理由：上限不能把本來就高的招壓低；詞綴本來就只在高難度。
4. **詞綴招排在最前面**：`skills = [...詞綴招, ...原本的招, 區域招]`。理由：`findIndex` 依序抽，排最後的招在高發動率下幾乎不出手；詞綴是菁英與頭目在高難度的特色，要看得到。
5. **詞綴落在誰身上**：`scale.affixes` 套在菁英（`scale.elite` 的第一隻）；頭目戰（`o.boss`）套在每一隻 `def.boss` 的敵人。`Combatant.affixes?` 只在非空時寫入（畫面讀它）。
6. **詞綴串流**：`AFFIX_SALT = 0xbb67ae85`（SHA-256 第二個初始值，engine 裡沒人用過）；`rollAffixes(run, depth, n)` ＝ `mulberry32(mix(mix(run.seed ^ AFFIX_SALT, depth), run.affixDraws++))`，不放回地抽 `n` 個。`Run.affixDraws` 只在有難度的 `Run` 上存在。
7. **我方永遠不被凍結**：`inflictAilment` 的凍結分支改成 `t.boss || t.side === 'party'` → 冰緩；`ailmentChance` 對 `side === 'party'` 也不看 `freezeGuard`（同頭目）。普通的 no-op 證明：守門測試列舉 `ENEMIES`、`REGIONS` 的每一個 `inflict`，普通沒有任何 `freeze`；我方技能只對敵人施加；`gate: identical`。
8. **區域附帶**：`REGION_RIDER: Partial<Record<RegionId, 'burn' | 'freeze' | 'shock' | 'bleed'>>`（熾焰 burn、霜凍 freeze、雷鳴 shock、暗影 bleed、鋼鐵 bleed；腐毒、主線沒有）；高難度時在區域招的 `effects` 後面接 `{ kind: 'inflict', status, chance: t.rider }`。
9. **經驗與金幣**：`scaleEnemy` 的 `exp`／`gold` 在 `t` 存在時再乘 `t.reward`（四捨五入一次）。`groupExp` 讀 `scale.difficulty`，所以第 12 條平衡帶（只量普通）不受影響。
10. **掉落的純函式**（Task 4）：`rarityWeights(…, bossRepeat, tier?)`、`runeTierWeights` 不改簽名（`difficultyMul` 由呼叫端給 `t.runeTierMul`）、`rollRune(…, difficultyMul = 1, legendaryMul?)`、`starlitChance(source, depth, tier?)`、`tierItemLevel(depth, source, tier)`。物品等級加成只加在「由 `itemLevel` 算出來」的地方（`rollGear` 沒有 `ctx.ilvl` 時、`rollBossGear` 一次），所以頭目第二件不會加兩次。
11. **spec §5.5 的「期望傳說級 ≥ 普通 1.3 倍」改成「每個來源、每個深度都嚴格多於普通」**：權重相乘後要重新正規化，菁英、寶庫的稀有權重很大，傳說占比的比值算出來只有 1.08–1.25，1.3 倍在這個公式下到不了。測試寫死比值的下限 1.05、上限 `rarityMul`，頭目恰好是 `min(cap, p × rarityMul) / p`；Task 5b 不以掉落為調整對象。
12. **平衡帶的隊伍**（`tierLineup`）：標準五人，每人選自己 `BUILDS` 裡第一套「`scenario` 等於格子情境、`minLevel ?? 0 ≤ 等級`」的符文 build，沒有就選第一套 `minLevel` 合格的符文 build，都沒有就穿標準；洛恩同理並把 `heroBuild` 設成那套的 `hero`。群戰與菁英格的情境是 `crowd`，頭目格是 `boss`。裝備 ＝ `kitParty(min(50, depthLevel(d)), d, 1, undefined, expectedEnhance(d), { …lineup, expect: true })`（同第 19a 帶，**不**吃高難度掉落）。
13. **「普通同格」**＝同一支 `tierLineup`、同一批種子、`difficulty` 缺省、沒有詞綴。理由：回合倍率要量的是難度本身，不是 build 的差。
14. **平衡帶不叫 `balance*`**：`tierBands.nightmare.test.ts`、`tierBands.hell.test.ts`，`describe.skipIf(process.env.BANDS !== '1')`，用 `npm run test:starlantern:bands -- tierBands` 跑。理由：三則既有守門把每個 `balance*.test.ts` 當普通帶（不穿 build、不裝符文、必須在 `BANDS.normal`）。
15. **劇情戰強制普通**：`startBattle` 的 `opts.story?: true` → `scale` 不帶 `difficulty`、不抽詞綴。用在終局戰、救援房間（含絲嘉蕾的劇情戰）；第 3 層劇情頭目本來就不帶 scale。故事進度（碎片、閃光、救援房間）照舊，不讀難度。
16. **難度的選擇**：`Game.tier(): Difficulty`（`dungeon.tier ?? 'normal'`）；`Game.chooseTier(t)`：只在城鎮、`t` 已解鎖才成功，寫入 `dungeon.tier`（含 `'normal'`）並立刻存檔（同旅館重置）。`depart` 讀 `this.tier()`，不加參數；所以 `departCheck` 與 UI 呼叫不變。
17. **解鎖**：`engine/tiers.ts` `NIGHTMARE_DEPTH = 10`、`HELL_BOSS_DEPTH = 25`、`tierUnlocked(s, t)`：`normal` 恆真；`nightmare` ＝ `reached.mainline ≥ NIGHTMARE_DEPTH`；`hell` ＝ `story.finaleCleared && (bossKills[bossKey('nightmare', 'mainline', HELL_BOSS_DEPTH)] ?? 0) > 0`。全部推導，不存旗標。
18. **頭目擊殺鍵**：`bossKey(tier, region, depth)`：普通 `${region}:${depth}`（不變），其他 `${tier}:${region}:${depth}`；`isBossKey` 接受可省略的 `(nightmare|hell):` 前綴。高難度頭目有自己的首殺機率。
19. **`dungeon.tier`**：`Difficulty` 三值皆可存；缺省＝玩家還沒看過難度列。載入時不是三值之一、或指向未解鎖的難度 → 損毀（`validSave` 回 false）。`SAVE_VERSION` 不變。
20. **葛倫的一句話**：`GateScene.greet` 覆寫：`tierUnlocked(s, 'nightmare') && s.dungeon.tier === undefined` → 說 `STORY.tierUnlock`（問候的抽籤照抽，`game.rng` 不受影響），說完 `game.chooseTier('normal')`。地獄解鎖不另加台詞（spec §4.4）。
21. **畫面**：難度列在 `PortalCards` 上方（`.slx-tier-row`），Q／E（`prev`／`next`）或點一下切換；鎖住的那格寫條件、選它只播錯誤音；選中的那格前面加「→」並有色條（粗細一律 normal）。迷宮的難度徽章只在 `run.difficulty` 存在時出現。戰鬥：Pixi 在菁英／頭目名字下一行詞綴名（`pixelText` 12px，以「・」接）；選目標的說明列逐行寫詞綴的一句話。手冊新分頁 `tiers`（噩夢解鎖後才出現）。
22. **美術**：沒有新圖、不依難度染色（spec §7.3）；難度與詞綴全用文字與現有 UI 元件。

## Global Constraints

**使用者的方向（最高依據）**
- 「所以不裝符文頂多過普通」：普通逐位元不變；`engine/balance*.test.ts` 的門檻與種子凍結；新的反向帶證明預設配點不裝符文在噩夢明顯打不過。
- 「任何隊伍組成都要可以用」：噩夢有 `ODD_LINEUPS` 帶。
- Q1–Q4：噩夢第 10 層開、地獄結局後＋噩夢第 25 層頭目；同一層加難、深度與捷徑共用；第一版沒有限定掉落；沒有難度劇情，劇情戰永遠普通，故事與好感度不分難度。
- 直覺：難度在廣場、選層、確認、樓層名旁、戰鬥詞綴都寫出來。

**分支與基準**
- 從含本計畫的 commit 開一條 `feat/starlantern-difficulty`。開工前 `git status`：要改的檔案有別人未提交的修改 → 停下來回報 NEEDS_CONTEXT。
- **sim gate 鏈**：Task 0 的 `gate-0` 對預設夾具（最後一行可以是 `DIFFERENT`，但 vitest 必須通過）；之後每個任務的 `gate-<N>` 對前一個任務的 gate 目錄，**必須** `gate: identical`。每一次都 `cmp <gate>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json`，**必須沒有輸出**。不同就停下來回報 BLOCKED，不准重錄夾具、不准改 `scripts/starlantern-sim-gate.sh`、不准覆寫 `engine/__fixtures__/` 底下任何既有檔案。
- **碰到 `engine/` 的任務都要跑 gate**（Task 0–6b 全部；7a／7b 若 diff 含 `engine/` 也要）。`engine/balance.test.ts` 等普通平衡帶一個數字都不改。
- 亂數：不可以 `Math.random`。普通難度下 `game.rng`、`lootRng`、`runeRng`、`memoryRng` 等串流抽取次數不變；詞綴只走自己的串流。

**測試與檢查**
- TDD：先寫失敗的測試，確認它因正確的理由失敗，再實作。測試 headless、靜音。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`（watch 模式）。
- 閘門：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-<N-1> > <SDD>/gate-<N>.stdout`（stdout 進檔案），然後 `cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json`。
- 難度帶（Task 5a 起）：`BALANCE_REPORT=1 rtk proxy npm run test:starlantern:bands -- tierBands.nightmare > <SDD>/bands-<N>-nightmare.stdout`，`hell` 同理。不在預設全套裡（`BANDS=1` 才跑）。單檔超過 20 分鐘就回報，不自己減種子。
- tsc：`rtk proxy npx tsc --noEmit -p .`；全 repo 總數不可以多於 Task 0 記下的基準；`src/scripts/games/starlantern/`、`tests/e2e/starlantern*.ts` 底下 0 個。
- e2e：`E2E_PORT=4352 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts --project=chromium --project=chromium-dpr125 --project=chromium-dpr150`；只用 4352，絕不用 4354；絕不加 `--headed`；不結束任何程序。
- **重的工作（閘門、難度帶、e2e、全套）之前**：PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` ≥ 6291456（KB）；不足就等。拿鎖 `C:\msys64\tmp\claude\C--Users-bag57\2c248522-7150-4161-8ef7-00e1a1e771a9\scratchpad\heavy.lock`：`(set -o noclobber; echo "difficulty Task <N> $(date -Is)" > <鎖>)`；已存在就等，跑完立刻刪自己的鎖。一次只跑一套重的。
- 本專案沒有 prettier、eslint。一次性的探測程式跑完就刪，絕不 commit。
- **收尾 G（每個任務）**：(1) 全套全綠、tsc 符合；(2) 碰到 `engine/` 就跑閘門＋`cmp`；(3) Task 5a 起跑兩個難度帶（5a 只報告，5b 起必須全綠）；(4) 碰到 `engine/game.ts`、`ui2/`、`render/`、`src/styles/`、`tests/e2e/` 就跑 e2e（三個專案）；(5) 有畫面的任務用 `SL_SHOTS=<SDD>/shots-task<N>` 跑 `--grep @sweep` 存三種尺寸截圖；(6) 報告：新增與修改的測試名、全套兩行、tsc 數字、閘門最後兩行與 `cmp` 結果、e2e 結果、偏離本計畫的地方與理由。

**換行（逐檔保留）**：改檔前 `git ls-files --eol <檔>`，改完 `git diff --stat`；整檔被改寫就是換行壞了。CRLF：`engine/save.ts`、`engine/state.ts`、`engine/sim.ts`；LF：`engine/{ailments,scaling,bands,buildBands}.ts`、`engine/dungeon/run.ts`、`engine/loot/{runes,drops,item}.ts`、`engine/sim.test.ts`、`data/{regions,story.zh-TW}.ts`、`ui2/scenes/{dungeon,handbook}.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/{starlantern.spec,starlantern-legibility}.ts`；混用（新行照相鄰行）：`engine/battle.ts`、`engine/game.ts`、`data/text.zh-TW.ts`、`render/BattleView.ts`、`ui2/scenes/{battle,gate}.ts`。其他檔動手前先查。新檔一律 LF。CRLF 與混用檔不可以用 `sed -i`。

**git**：完整路徑 add，不可以 `git add -A`／`git add .`。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。不可以 `git checkout`、`restore`、`reset`、`stash`、`clean`；要撤回就再改一次檔案。不 push。

**介面與文字**
- 文字只用 12px 或 24px（本計畫的新元件全部 12px）、行高 ≥ 14、粗細 normal；`ui2/typeScale.test.ts` 與 `tests/e2e/starlantern-legibility.ts` 的 afterEach 守門必須通過；新畫面加進 `SWEEP`。
- 介面字放 `data/text.zh-TW.ts`（`T.ui2.tier`、`T.tier`）；詞綴名稱與一句話放 `data/affixes.ts`；葛倫的台詞放 `data/story.zh-TW.ts`（`STORY.tierUnlock`）。**字串裡不手打數字**：深度、倍率由常數傳入。全形標點、不用「……」；`data/story/voice.test.ts`、`data/terms.test.ts`（`voiceGates.ts` 的規則）必須綠。每個詞綴一句話講完。
- SCSS 只在 `src/styles/_starlantern-ui.scss`；禁 `!important`、禁行內樣式（含 `el.style`、`setProperty`）。
- 沒有新的美術、不依難度染色、不畫幾何佔位圖示（`AGENTS.md` Game Art Asset Policy）。
- 版面：1280×720、844×390、390×844（觸控側置）每個視窗在舞台裡、每一列 `scrollWidth <= clientWidth + 0.5`。

**測試修改規則**：各任務 Files 列出已知會紅的既有測試，只照新形狀改並在報告逐則列出；不可以放寬門檻、刪斷言、加 `skip`。全套跑出沒列到的紅燈 → 停下來回報 NEEDS_CONTEXT。`it.fails`、`it.skip`、`.only`、`.todo` 不可以出現在 commit。

**子代理**：實作者不派子代理。

## Review Focus
1. **噩夢裡走到救援房間、結局戰、第 3 層劇情頭目**：都照普通打（沒有詞綴、數值同普通），故事照常推進。測試：Task 6a `story fights are Normal on every tier`。
2. **我方已經冰緩、剛解凍、睡著時又被霜凍附帶或霜縛打中**：只會刷新冰緩，從不 `frozen`，冰緩照常可以淨化。測試：Task 2 `the party is chilled, never frozen`；Task 5b HX。
3. **存檔寫著 `tier: 'hell'` 卻沒有噩夢第 25 層的擊殺、或寫著不存在的難度；沒有 `tier` 的舊存檔**：前兩者判損毀；舊存檔照常讀，噩夢已解鎖時葛倫只說一次。測試：Task 6b `a tier the save has not unlocked is corrupt`、`Glen speaks once`（Task 7a）。
4. **噩夢全滅或中途回城，之後換普通出發；普通與噩夢各打一次同一層頭目**：下一趟用 `dungeon.tier` 選的難度；兩邊各有首殺機率，互不降成重複。測試：Task 6a `first kills are counted per tier`、`a wipe keeps the chosen tier`。
5. **最長的名字加兩個詞綴、鎖住的地獄條件**：`★深層・熾焰・荊棘狼` 下面兩個詞綴、390×844 的難度列寫滿條件，都不溢出。測試：Task 7a、7b 的 e2e 與 `@sweep`。

---

## File Structure
- 新：`data/difficulty.ts`（`TierDef`、`TIERS`、`tierOf`）、`data/affixes.ts`（六個詞綴）、`engine/tiers.ts`（`AFFIX_SALT`、`rollAffixes`、`tierUnlocked`、`bossKey`、常數）、`engine/tierBands.ts`（隊伍挑選與量測）、`engine/tierBands.test.ts`（小規模單元）、`engine/tierBands.baseline.test.ts`、`engine/tierBands.nightmare.test.ts`、`engine/tierBands.hell.test.ts`（選擇性）、`engine/__fixtures__/tiers/baseline.normal.txt`（新檔）、`engine/tiers.test.ts`、`data/difficulty.test.ts`、`data/affixes.test.ts`。
- 修改：`engine/battle.ts`、`engine/scaling.ts`、`engine/ailments.ts`、`engine/combatant.ts`（`affixes?`）、`engine/sim.ts`（`groupExp`）、`engine/loot/{runes,drops,item}.ts`、`engine/game.ts`、`engine/dungeon/run.ts`、`engine/state.ts`、`engine/save.ts`、`engine/bands.ts`、`data/regions.ts`（`REGION_RIDER`）、`data/text.zh-TW.ts`、`data/story.zh-TW.ts`、`ui2/scenes/{gate,dungeon,battle,handbook}.ts`、`render/BattleView.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/{starlantern.spec,starlantern-legibility}.ts`。

---

### Task 0: 基準與量測骨架

**Files:**
- Create：`engine/tierBands.ts`、`engine/tierBands.test.ts`、`engine/tierBands.baseline.test.ts`、`engine/__fixtures__/tiers/baseline.normal.txt`；SDD `baseline.md`
- Test：`engine/tierBands.test.ts`

**Interfaces:**
- Consumes：`BUILDS`、`buildOf`、`kitParty`、`simBattle`、`lineupPolicies`、`setSimTrace`、`encounterTable`、`expectedEnhance`、`depthLevel`、`STANDARD_LINEUP`、`MAX_LEVEL`。
- Produces（`engine/tierBands.ts`，純量測，不改任何戰鬥行為）：
  - `export type CellKind = 'crowd' | 'elite' | 'boss'`；`export const TIER_SEEDS = 40`；`export const TIER_DEPTHS = { nightmare: [10, 15, 20, 25], hell: [20, 25, 30] } as const`。
  - `export function tierLineup(level: number, kind: CellKind, runeTier: RuneTier | 'bare', ids?: CharacterId[]): Lineup`（裁定 12；`'bare'` ＝ 不穿 build、不裝符文；`elite` 用 `crowd` 的情境）。
  - `export interface TierCell { depth: number; region: RegionId; kind: CellKind; groups: string[][]; difficulty?: Difficulty; affixes?: readonly AffixId[]; lineup: Lineup; seeds?: number }`（`AffixId` 在 Task 3 才有；本任務先用 `readonly string[]`，Task 3 收窄）。
  - `export interface TierRun { rate: number; hpLoss: number; rounds: number; minRounds: number; partyFrozen: number; fights: number }`。
  - `export function measureCell(c: TierCell): TierRun`：每組 × 種子 `k × 7919`（k = 1…`seeds ?? TIER_SEEDS`），隊伍 ＝ `kitParty(min(MAX_LEVEL, depthLevel(d)), d, 1, undefined, expectedEnhance(d), { …lineup, expect: true })`，`scale = { depth, region, elite: kind === 'elite' ? g[0] : undefined, difficulty, affixes }`（本任務 `difficulty`／`affixes` 照傳，引擎還不讀），策略 `lineupPolicies(lineup)`；卡在 60 回合上限算輸；`SimTrace` 數我方任一成員 `frozen` 的回合。
- [ ] **Step 1：基準紀錄**：`git rev-parse HEAD`、tsc 總數記在 SDD `baseline.md`；記憶體與鎖之後跑 `gate-0`（against 預設夾具，`DIFFERENT` 可以），`cmp` 必須沒有輸出；e2e 跑一次記通過數。
- [ ] **Step 2：先寫失敗的測試**（`engine/tierBands.test.ts`）
  - `tierLineup picks each member's build for the cell`：Lv 38 `crowd` magic：諾艾兒不選 `minLevel: 40` 的暴走流星、改選下一套合格的；每位穿的 build 的 `scenario` 是 `crowd`，或她沒有 `crowd` 的合格 build；洛恩的 `heroBuild` 等於那套的 `hero`；`'bare'` → `build` 與 `runeTier` 都不存在。
  - `measureCell is deterministic and counts the cap as a loss`：同一格跑兩次 `toEqual`；`seeds: 2` 的群戰格 `fights === groups.length × 2`；一個打不完的格子（`groups: [['lanterneater']]`、Lv 1）`rate === 0`。
- [ ] **Step 3：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/tierBands.test.ts`。
- [ ] **Step 4：實作**；`tierBands.baseline.test.ts`（`BANDS=1` 才跑）：主線第 10、15、20、25、30 層，`bare`／`magic`／`rare` 三種隊伍，群戰與頭目格，`difficulty` 缺省，印 `[tiers-base] d<D> <bare|magic|rare> <crowd|boss> rate <a> loss <b> rounds <c> min <m>`。
- [ ] **Step 5：確認通過**；跑 `BALANCE_REPORT=1 rtk proxy npm run test:starlantern:bands -- tierBands.baseline > <SDD>/baseline.stdout`，把 `[tiers-base]` 行排序後存成 `engine/__fixtures__/tiers/baseline.normal.txt`（新檔，調數字的起點）。
- [ ] **Step 6：收尾 G**（`gate-0` 已在 Step 1；本任務再跑 `gate-0b` against `gate-0`，必須 identical）。
- [ ] **Step 7：commit**：`test(starlantern): tier band measurement — lineups by build and cell, and the Normal baseline at depths 10-30`。

### Task 1: 難度接線

**Files:**
- Create：`data/difficulty.ts`、`data/difficulty.test.ts`
- Modify：`engine/scaling.ts`（`scaleEnemy` 第六個參數）、`engine/battle.ts`（`createBattle` 讀 `sc.difficulty`；更新 `Difficulty`／`BattleScale` 的註解：不再是「read by no one」）、`engine/sim.ts`（`groupExp` 把 `tierOf(scale.difficulty)` 傳給 `scaleEnemy`）
- Modify（會紅的既有測試）：`engine/sim.test.ts` 的 `difficulty is carried and read by no one`（改成 Step 1 的兩則）。
- Test：`engine/scaling.test.ts`、`engine/battle.test.ts`、`engine/sim.test.ts`、`data/difficulty.test.ts`

**Interfaces:**
- Produces：
  - `data/difficulty.ts`：`export interface TierDef { hp: number; atk: number; chanceMul: number; chanceCap: number; rider: number; eliteAffixes: number; bossAffixes: number; reward: number; runeDrop: number; runeTierMul: number; runeLegendary: number; rarityMul: number; bossLegendaryCap: number; ilvl: number; starlitMul: number }`；`export const TIERS: Record<Difficulty, TierDef>`，起始值（spec §5.0）：nightmare `hp 1.35, atk 1.2, chanceMul 1.5, chanceCap 0.6, rider 0.25, eliteAffixes 1, bossAffixes 1, reward 1.25, runeDrop 1.25, runeTierMul 1.5, runeLegendary 1.5, rarityMul 1.3, bossLegendaryCap 0.5, ilvl 4, starlitMul 1.5`；hell `1.8, 1.4, 2, 0.75, 0.4, 2, 2, 1.5, 1.5, 3, 2, 1.6, 0.5, 8, 2`；normal 恆等列（倍率 1、其他 0）。`export function tierOf(d: Difficulty | undefined): TierDef | null`。
  - `scaleEnemy(def, depth, region, elite, condition = CONDITIONS.plain, tier: TierDef | null = null)`：`tier` 存在時，狀況之後、補償之前 `mul(stats, { hp: tier.hp, atk: tier.atk, mag: tier.atk })`；怪物自己的招與區域招的 `chance` 照裁定 3；`exp`／`gold` 再乘 `tier.reward`（裁定 9）。`tier` 為 null 時走原本那一行。
  - `createBattle`：`const t = sc ? tierOf(sc.difficulty) : null`，只在 `t` 存在時把它傳給 `scaleEnemy`（否則呼叫形狀與現在相同）。
- [ ] **Step 1：先寫失敗的測試**
  - `data/difficulty.test.ts`：`the normal row is the identity`（每個倍率欄 1、`rider`／詞綴數／`ilvl` 0）；`tierOf gives null for Normal`（`undefined`、`'normal'` → null；`'nightmare'` → `TIERS.nightmare`）；`higher tiers only ever ask more`（hell 的每一欄 ≥ nightmare ≥ normal）。
  - `engine/scaling.test.ts`：`a tier scales hp, atk and mag, not def, mdf or spd`（同一隻荊棘狼第 10 層：nightmare 的 hp ＝ 普通的路徑在補償前乘 1.35 再補償，寫死數字；def、mdf、spd 與普通相同）；`a tier raises skill chances to its cap, never lowers one`（0.3 → 0.45；0.5 → 0.6；0.7 → 0.7）；`a tier pays more exp and gold`（`exp`、`gold` ＝ 普通 × 1.25 四捨五入）；`no tier is the old enemy`（`scaleEnemy(…, plain)` 與 `scaleEnemy(…, plain, null)` `toEqual`）。
  - `engine/battle.test.ts`：`Normal and no difficulty are the same fight`：同一組（主線第 10 層一組＋一隻菁英、腐毒第 5 層一組、頭目第 10 層），`difficulty` 缺省與 `'normal'`：`createBattle` 的結果 `JSON.stringify` 相同；用計數的 rng 包裝跑完整場 `resolveRound`（`choose` 下指令），抽取次數相同、最後狀態相同。
  - `engine/sim.test.ts`：`Nightmare is read and Normal is not`（取代舊的那則：`'nightmare'` 的 `createBattle` 敵人 HP 與缺省不同；`'normal'` 與缺省相同）；`groupExp reads the tier`（nightmare 的 `groupExp` ＝ 每隻 `scaleEnemy(…, TIERS.nightmare).exp` 的和）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/difficulty.test.ts src/scripts/games/starlantern/engine/scaling.test.ts src/scripts/games/starlantern/engine/battle.test.ts src/scripts/games/starlantern/engine/sim.test.ts`。
- [ ] **Step 3：實作**（照 Interfaces）。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-1` against `gate-0b`＋`cmp`）。
- [ ] **Step 6：commit**：`feat(starlantern): a fight reads its difficulty — Nightmare and Hell scale hp, attack, skill odds, exp and gold; Normal takes no new path`。

### Task 2: 敵方異常與「我方永遠不被凍結」

**Files:**
- Modify：`data/regions.ts`（`export const REGION_RIDER`，裁定 8）、`engine/scaling.ts`（`tier` 存在時接上附帶）、`engine/ailments.ts`（裁定 7；檔頭註解改寫）
- Test：`engine/ailments.test.ts`、`engine/scaling.test.ts`、`engine/battle.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `TierDef.rider`、`scaleEnemy(…, tier)`。
- Produces：`REGION_RIDER: Partial<Record<RegionId, 'burn' | 'freeze' | 'shock' | 'bleed'>>`；高難度的區域招 `effects` ＝ 原本的 ＋ `{ kind: 'inflict', status: REGION_RIDER[region], chance: tier.rider }`（有附帶的區域才加）。
- [ ] **Step 1：先寫失敗的測試**
  - `engine/scaling.test.ts`：`each region's skill carries its rider on a higher tier`：熾焰／霜凍／雷鳴／暗影／鋼鐵在 nightmare 的區域招最後一個效果是對的異常、`chance` 0.25（hell 0.4）；腐毒與主線沒有；普通（`tier` null）的區域招 `toEqual` `REGIONS[r].skill`。
  - `engine/ailments.test.ts`：`the party is chilled, never frozen`：對 `side: 'party'` 施加 freeze（`constRng(0)`）→ `chill === AILMENT.chillTurns`、`frozen` 不存在、日誌 `status: 'chill'`；已經冰緩 → 刷新回滿；`freezeGuard > 0` 的隊員照樣冰緩（不是 0 機率）；睡著的隊員也只得冰緩；敵方（非頭目）照舊 `frozen`。
  - `engine/ailments.test.ts`：`Normal never freezes the party`：列舉 `ENEMIES` 每一招與 `REGIONS` 每一個區域招的 `effects`，沒有任何 `status: 'freeze'`（守門：普通走不到新分支）。
  - `engine/battle.test.ts`：`a rider lands in a Nightmare fight`：霜凍第 10 層一組，nightmare，固定種子，跑到第一次凜冬吐息：命中的隊員之中至少一位冰緩（`ailmentChance` 依抗性；種子挑一個會中的，寫死）；同一場普通：沒有任何隊員有 `chill`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/ailments.test.ts src/scripts/games/starlantern/engine/scaling.test.ts src/scripts/games/starlantern/engine/battle.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**；`ui2/partyBar.test.ts` 綠（冰緩字串在隊伍欄照舊顯示）。
- [ ] **Step 5：收尾 G**（`gate-2` against `gate-1`＋`cmp`）。
- [ ] **Step 6：commit**：`feat(starlantern): higher tiers' region skills burn, chill, shock and bleed; the party is chilled, never frozen`。

### Task 3: 菁英與頭目詞綴

**Files:**
- Create：`data/affixes.ts`、`data/affixes.test.ts`、`engine/tiers.ts`、`engine/tiers.test.ts`
- Modify：`engine/battle.ts`（`BattleScale.affixes?: readonly AffixId[]`；裁定 4、5）、`engine/scaling.ts`（`scaleEnemy` 第七個參數 `affixes?: readonly AffixId[]`）、`engine/combatant.ts`（`affixes?: AffixId[]`）、`engine/dungeon/run.ts`（`Run.affixDraws?: number`、`Run.difficulty?: Difficulty` 型別；`newRun` 本任務不改）、`engine/tierBands.ts`（`TierCell.affixes` 收窄成 `AffixId`）
- Test：`data/affixes.test.ts`、`engine/tiers.test.ts`、`engine/scaling.test.ts`、`engine/battle.test.ts`

**Interfaces:**
- Produces：
  - `data/affixes.ts`：`export type AffixId = 'scorch' | 'frostbind' | 'thunder' | 'rend' | 'tough' | 'swift'`；`export const AFFIX_IDS: readonly AffixId[]`（這個順序）；`export interface AffixDef { name: string; line: string; skill?: EnemySkill; hp?: number; bossHp?: number; spd?: number }`；`AFFIXES`（spec §5.3）：灼熱 `skill { name: '灼擊', chance: 0.35, target: 'enemy', effects: [damage 100 phys atk melee, inflict burn 0.35] }`；霜縛 `{ '霜縛', 0.3, 'row', [damage 60 ice mag, inflict freeze 0.5] }`；雷殛 `{ '雷殛', 0.3, 'cross', [damage 60 thunder mag, inflict shock 0.4] }`；裂刃 `{ '裂刃', 0.35, 'enemy', [damage 90 phys atk melee, inflict bleed 0.5] }`；堅韌 `hp 1.4, bossHp 1.25`；迅捷 `spd 1.25`。`line` 是一句話（例：「會放灼擊，打中時可能灼燒。」），不手打數字。
  - `scaleEnemy(…, tier, affixes)`：`affixes` 非空時，HP／速度倍率與 Task 1 的難度倍率同一處（補償之前；頭目用 `bossHp`），詞綴招照裁定 4 排在最前、不乘發動率。
  - `createBattle`：`sc.affixes` 非空時照裁定 5 套用並寫 `Combatant.affixes`；不抽任何亂數。
  - `engine/tiers.ts`：`export const AFFIX_SALT = 0xbb67ae85`；`export function rollAffixes(run: Run, depth: number, n: number): AffixId[]`（裁定 6；`n === 0` 不碰計數器、回傳 `[]`）。
- [ ] **Step 1：先寫失敗的測試**
  - `data/affixes.test.ts`：`six affixes, each said in one line`：`AFFIX_IDS` 六個、名稱與 spec 相同、`line` 非空、沒有阿拉伯數字、一句（只有一個句號）；每個帶招的詞綴 `inflict` 的異常是 spec 表上那一種。
  - `engine/tiers.test.ts`：`affixes are drawn on their own stream`：同一個 `run.seed`、同一個深度、同一個序號 → 同一組；`n = 2` 一定兩個不同；序號遞增；`game.rng` 等其他串流的狀態不變（`run.lootDraws`、`run.runeDraws` 不動）；`n = 0` 不動 `affixDraws`。`the salt is unused`：`AFFIX_SALT` 不等於 engine 裡任何其他 `_SALT` 常數與 `chestHasGear` 的鹽。
  - `engine/scaling.test.ts`：`affixes as plain fields`：堅韌 → hp 在補償前 ×1.4（頭目 ×1.25），迅捷 → spd ×1.25；灼熱 → `skills[0]` 是灼擊、發動率 0.35，原本的招與區域招在後面。
  - `engine/battle.test.ts`：`affixes land on the elite and the boss only`：菁英戰帶 `['tough']` → 只有 `e0` 有 `affixes`、HP 較高，護衛沒有；頭目戰帶兩個 → 燈喰之獸兩個都有；不帶 `affixes` 的戰鬥任何敵人都沒有這個欄位。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/affixes.test.ts src/scripts/games/starlantern/engine/tiers.test.ts src/scripts/games/starlantern/engine/scaling.test.ts src/scripts/games/starlantern/engine/battle.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-3` against `gate-2`＋`cmp`）。
- [ ] **Step 6：commit**：`feat(starlantern): elite and boss affixes — six, each a line, drawn on their own stream and only applied by the fight`。

### Task 4: 掉落與回報（純函式）

**Files:**
- Modify：`engine/loot/drops.ts`（`DropCtx.difficulty?`、`rarityWeights(…, tier?)`、`starlitChance(…, tier?)`、`rollGear`、`rollBossGear`、`applyStarlit`）、`engine/loot/item.ts`（`tierItemLevel`）、`engine/loot/runes.ts`（`rollRune(…, difficultyMul = 1, legendaryMul?)`；把「always 1 for now」的註解改掉）
- Test：`engine/loot/drops.test.ts`、`engine/loot/runes.test.ts`、`engine/loot/item.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `TierDef`、`tierOf`。
- Produces（裁定 10、11）：
  - `rarityWeights(source, depthLv, cond, bossRepeat = false, tier?: TierDef)`：`tier` 存在時，非頭目的 `rare` 與 `legendaryTier` 在 `carveEpic` 之前乘 `tier.rarityMul`；頭目 `p = min(tier.bossLegendaryCap, p × tier.rarityMul)`。
  - `starlitChance(source, depth, tier?)`：`tier` 存在時 `min(cap × starlitMul, (base + perDepth × (depth − 1)) × starlitMul)`。
  - `tierItemLevel(depth: number, source: DropSource, tier: TierDef): number` ＝ `min(MAX_ILVL, itemLevel(depth, source) + tier.ilvl)`。
  - `rollGear(rng, ctx)`：`const t = tierOf(ctx.difficulty)`；稀有度 `rarityWeights(…, t ?? undefined)`；`ilvl = ctx.ilvl ?? (t ? tierItemLevel(…) : itemLevel(…))`；`applyStarlit` 用 `ctx.difficulty`。`rollBossGear` 的 `ilvl` 同理一次。
  - `rollRune(rng, source, depthLv, cond, difficultyMul = 1, legendaryMul?)`：`legendaryMul` 存在時傳說機率 ＝ `RUNE_LEGENDARY[source] × legendaryMul`。
- [ ] **Step 1：先寫失敗的測試**
  - `drops.test.ts`：`a higher tier only adds rare and legendary weight`（monster／chest／elite／vault，depthLv 38 與 98：nightmare 的 common、magic 權重與普通相同，rare＋epic 與 legendaryTier ×1.3）；`a tier's legendary share is strictly higher, never above its multiplier`（裁定 11：每個來源、兩個深度，占比比值在 [1.05, rarityMul]，失敗訊息印出全部比值）；`a boss's legendary odds rise to the cap`（first 0.2 → nightmare 0.26、hell 0.32；repeat 0.1 → 0.13、0.16；`bossLegendaryCap` 擋住 0.5）；`starlit rises with its cap`（boss 第 30 層：普通 0.16 上限，hell 0.32）；`gear rolls a tier's item level, the boss's second piece too, once`（`rollBossGear` 兩件都是 `itemLevel(d, 'boss') + 4`，不是 +8）；`no tier rolls as before`（同一個種子，`ctx.difficulty` 缺省與 `'normal'` 的 `rollGear`／`rollBossGear` 結果 `toEqual`，抽取次數相同）。
  - `runes.test.ts`：`Hell's monster rune at depth 25 is magic or better three times in four`（`runeTierWeights('monster', depthLevel(25), 'plain', TIERS.hell.runeTierMul)` 的魔法以上占比 ≥ 0.75；普通的同一個數 < 0.75，兩個都印出）；`a tier raises the legendary rune odds`（boss，`legendaryMul` 2 → 0.16，以 `constRng` 驗門檻：0.15 擲中、0.17 沒中）；`no multiplier draws as before`（`rollRune` 不帶第六個參數與現在逐一相同）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/loot/`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**；`engine/runeEconomy.guard.test.ts`、`engine/game.test.ts` 綠。
- [ ] **Step 5：收尾 G**（`gate-4` against `gate-3`＋`cmp`）。
- [ ] **Step 6：commit**：`feat(starlantern): a tier's drops — rarer gear, legendary and rune odds, item level and starlit chance, Normal untouched`。

### Task 5a: 難度帶的量測與報告（不斷言）

**Files:**
- Modify：`engine/tierBands.ts`（各帶的格子）、`engine/bands.ts`（`nightmare: ['tierBands.nightmare.test.ts']`、`hell: ['tierBands.hell.test.ts']`；註解更新）
- Create：`engine/tierBands.nightmare.test.ts`、`engine/tierBands.hell.test.ts`（本任務只有報告的 `it`）；SDD `tier-bands.md`
- Modify（會紅的既有測試）：`engine/sim.test.ts` `every balance file is a normal band` 的最後一行（`[[], []]` → 兩個檔名，且檔案存在）。
- Test：`engine/tierBands.test.ts`、`engine/sim.test.ts`

**Interfaces:**
- Consumes：Task 0–4；`ODD_LINEUPS`、`RUNES`（`group === 'trigger'` 或 id `'lasting'` 算觸發／常駐）。
- Produces（`engine/tierBands.ts`）：
  - `export function bandCells(band: 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'H1' | 'H2' | 'H3' | 'H4'): TierCell[]`（spec §6.2）：N1 主線 10／15／20／25 每組群戰，magic；N2 第 10、20 層每組的菁英 × 每個詞綴；N3 第 10、20、25 層燈喰之獸 × 每個詞綴；N4 ＝ N1、N3 的格子改 `bare`；N5 ＝ `ODD_LINEUPS` 四組（`ids`，洛恩 `heroBuild: fill`、`heroRow`）各自穿 build、第 15 層、各自的 `regions`；N6 熾焰／霜凍／雷鳴／暗影／鋼鐵第 10、20 層群戰；H1 主線 20／25／30 群戰，rare；H2 第 25、30 層頭目 × 詞綴兩兩組合（15 組）、每組 10 個種子；H3 ＝ H1、H2 的格子改 magic，另一份改 `bare`；H4 ＝ 每位的每套符文 build 輪流當「最強」：全隊 epic、`kitParty(…, ENHANCE_MAX)` 的稀有套裝（第 14 帶的穿法）、第 25、30 層頭目 × 15 組。
  - `export function hasTriggerOrLasting(l: Lineup, level: number): boolean`。
  - `export function normalTwin(c: TierCell): TierCell`（裁定 13：同一格去掉 `difficulty` 與 `affixes`）。
  - 報告行：`[nightmare] <帶> <格子描述> rate <a> loss <b> rounds <c> (normal <c0>, x<r>) min <m> frozen <f>`，`[hell]` 同理。
- [ ] **Step 1：先寫失敗的測試**（`engine/tierBands.test.ts`，小規模）
  - `the band cells are as the spec lists`：每帶的格子數（N2 ＝ 兩個深度的組數 × 6、H2 ＝ 2 × 15、N5 ＝ 4…，寫死）、`kind`、`difficulty`、`runeTier`；N4 的每一格都 `bare`；H 帶的 rare 隊伍 `hasTriggerOrLasting` 為真。
  - `a twin is the same cell on Normal`：`normalTwin` 只少 `difficulty`、`affixes`。
  - `engine/sim.test.ts`：`every balance file is a normal band` 照新形狀。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/tierBands.test.ts src/scripts/games/starlantern/engine/sim.test.ts`。
- [ ] **Step 3：實作**；兩個帶檔 `describe.skipIf(process.env.BANDS !== '1')`，本任務各只有 `it('reports every tier band number')`：跑全部格子與它的普通雙胞胎、印報告行、只斷言每格都量到（`fights > 0`）。
- [ ] **Step 4：確認通過**；跑兩個難度帶到 `bands-5a-*.stdout`，把每一行抄進 SDD `tier-bands.md`，標出照 spec §6.2 門檻會紅的格子。這份是調整前的基準。
- [ ] **Step 5：收尾 G**（`gate-5a` against `gate-4`＋`cmp`）。
- [ ] **Step 6：commit**：`test(starlantern): Nightmare and Hell bands measured and reported, opt-in like the rune bands`（內文附 `tier-bands.md` 的摘要表）。

### Task 5b: 難度帶的斷言與調整

**Files:**
- Modify：`engine/tierBands.{nightmare,hell}.test.ts`（斷言）、`data/difficulty.ts`（nightmare／hell 兩列）、`data/affixes.ts`（數字）；SDD `retune.md`、`tier-bands.md`
- Test：兩個難度帶

**Interfaces:**
- Consumes：Task 5a 全部。
- [ ] **Step 1：先寫斷言**（spec §6.2 的門檻，常數放 `engine/tierBands.ts` 的 `TIER_BANDS`，測試讀它）
  - `N1 Nightmare crowds are won with magic runes`：每格 rate ≥ .85、loss .15–.50、rounds ≤ 普通雙胞胎 × 1.4。
  - `N2 no affix is a death sentence`：每個詞綴 rate ≥ .80，且不低於六個詞綴平均 15 個百分點。
  - `N3 the Nightmare boss`：每格 rate .50–.90、每場 ≥ 3 回合、rounds ≤ 普通雙胞胎 × 1.5。
  - `N4 no runes, no Nightmare`：群戰平均 rate ≤ .60 或 loss ≥ .55；頭目 rate ≤ .35。
  - `N5 odd lineups still work`：每組 rate ≥ .75。
  - `N6 every region's rider is survivable`：每格 rate ≥ .80。
  - `H1`、`H2`、`H3`（magic：群戰 ≤ .60、頭目 ≤ .30；bare：≤ .20）、`H4 no boss falls inside three rounds`（每一場 `rounds ≥ 3`）。
  - `HX the party is never frozen`：兩個帶檔的每一格 `partyFrozen === 0`。
- [ ] **Step 2：執行，看哪些紅**：兩個難度帶到 `bands-5b-0-*.stdout`。
- [ ] **Step 3：調整到全綠**：槓桿照順序——`TIERS` 的 hp／atk → `chanceMul`／`chanceCap` → `rider` → `AFFIXES` 的數字。**不准**動普通的任何常數、`TIERS.normal`、符文、build、角色、掉落欄位；不准改門檻。每一輪（改一次、跑一次兩個帶）記 `retune.md`（改了什麼、前後數字）；最多 4 輪。仍有紅 → 停下來回報 BLOCKED，附全部報告行與建議（交給控制者，不自行改門檻）。
- [ ] **Step 4：確認通過**：兩個難度帶全綠；`data/difficulty.test.ts` 的 `higher tiers only ever ask more` 仍綠。
- [ ] **Step 5：收尾 G**（`gate-5b` against `gate-5a`＋`cmp`；難度帶 `bands-5b-*.stdout`）。
- [ ] **Step 6：commit**：`test(starlantern): tier bands — magic runes beat Nightmare, the bare default does not, odd lineups hold, Hell needs rare and a trigger, no affix is a death sentence, the party never freezes`（內文附 `retune.md` 的最後一列）。

### Task 6a: 這一趟的難度、解鎖、劇情戰、掉落接線

**Files:**
- Modify：`engine/tiers.ts`（`NIGHTMARE_DEPTH`、`HELL_BOSS_DEPTH`、`tierUnlocked`、`bossKey`，裁定 17、18）、`engine/dungeon/run.ts`（`newRun(…, rescues, difficulty?)`：`difficulty` 不是缺省／`'normal'` 時才寫 `difficulty` 與 `affixDraws: 0`）、`engine/state.ts`（`DungeonProgress.tier?: Difficulty`）、`engine/game.ts`（`tier()`、`chooseTier()`、`depart`、`startBattle` 的 `opts.story`、詞綴、`battleGear` 的鍵、戰鬥與寶箱的符文掉落、`dropCtx` 帶 `difficulty`）
- Test：`engine/tiers.test.ts`、`engine/game.test.ts`、`engine/dungeon/run.test.ts`

**Interfaces:**
- Consumes：Task 1–4。
- Produces：
  - `tierUnlocked(s: GameState, t: Difficulty): boolean`；`bossKey(t: Difficulty, region: RegionId, depth: number): string`。
  - `Game.tier(): Difficulty`；`Game.chooseTier(t: Difficulty): { ok: true } | { ok: false; reason: 'invalid' | 'locked' }`（裁定 16：只在城鎮；成功立刻存檔，失敗不改狀態）。
  - `depart`：`newRun(seed, region, condition, startDepth, rescues, this.tier())`；`game.rng` 抽取不變。
  - `startBattle(…, opts: { …; story?: true })`：`const t = this.run?.difficulty && !opts.story ? this.run.difficulty : undefined`；`t` 存在時 `scale.difficulty = t`，菁英戰 `scale.affixes = rollAffixes(run, floor, TIERS[t].eliteAffixes)`、非劇情頭目戰 `bossAffixes`。終局戰、救援房間（兩種）傳 `story: true`。
  - 掉落（`t = tierOf(run.difficulty)`，`t` 存在才走新路）：戰鬥符文 `rng() < RUNE_DROP.x × t.runeDrop`、`rollRune(…, t.runeTierMul, t.runeLegendary)`；寶箱寶庫 `spotRune` 同理；`dropCtx` 加 `difficulty`；`battleGear` 的鍵 ＝ `bossKey(run.difficulty ?? 'normal', region, min(floor, MAX_REACHED))`。
- [ ] **Step 1：先寫失敗的測試**
  - `engine/tiers.test.ts`：`Nightmare opens at main-road depth 10`（`reached.mainline` 9 → false、10 → true；其他區域到 30 也不算）；`Hell needs the finale and the Nightmare depth-25 boss`（只有其中一個 → false；兩個都有 → true；普通的 `mainline:25` 擊殺不算）；`bossKey keeps the Normal key`。
  - `engine/dungeon/run.test.ts`：`a Normal run is the run it always was`：`newRun(…)` 與 `newRun(…, 'normal')` `toEqual`，都沒有 `difficulty`／`affixDraws` 鍵；`'nightmare'` 有兩個。
  - `engine/game.test.ts`：
    - `chooseTier is town-only and needs the unlock`（`map` → invalid；未解鎖 → locked、`dungeon.tier` 不變；成功 → 寫入並存檔一次）。
    - `a departure carries the chosen tier, and Normal draws as before`（同一個存檔，`tier` 缺省與 `'normal'` 出發後 `game.rng` 的下一個值相同、`run` `toEqual`；`'nightmare'` → `run.difficulty === 'nightmare'`）。
    - `an elite on Nightmare wears one affix, on Hell two`（`plantAt(g, 'elite')`＋`stepOnto`：`battle.enemies[0].affixes` 長度 1／2；普通沒有）。
    - `story fights are Normal on every tier`（nightmare 的 run：救援房間、絲嘉蕾的劇情戰、第 30 層結局戰——`isFinaleFight`——的敵人沒有 `affixes`，HP 與同一場普通的相同；第 3 層劇情頭目照舊不帶 scale）。
    - `first kills are counted per tier`（nightmare 打倒第 5 層頭目 → `bossKills['nightmare:mainline:5'] === 1`、`'mainline:5'` 不變；之後普通再打 → 普通仍用首殺機率，`bossRepeat` false）。
    - `a wipe keeps the chosen tier`（nightmare 全滅回城：`dungeon.tier === 'nightmare'`、`run === null`；下一次出發仍是 nightmare）。
    - `Nightmare drops are better and Normal drops are as before`（同一個種子的同一場勝利：普通的 `end` 與本任務之前寫死的期望 `toEqual`；nightmare 的掉落物品等級 ＝ 普通 + 4）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/tiers.test.ts src/scripts/games/starlantern/engine/dungeon/run.test.ts src/scripts/games/starlantern/engine/game.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-6a` against `gate-5b`＋`cmp`；e2e chromium 三專案）。
- [ ] **Step 6：commit**：`feat(starlantern): a run has a tier — chosen in town, unlocked by progress, story fights stay Normal, affixes and better drops on Nightmare and Hell`。

### Task 6b: 存檔欄位與同一輪讀檔一致

**Files:**
- Modify：`engine/save.ts`（`isBossKey` 接受前綴；`dungeon.tier` 的驗證，裁定 19）
- Test：`engine/save.test.ts`、`engine/game.test.ts`

**Interfaces:**
- Consumes：Task 6a 的 `tierUnlocked`、`bossKey`。
- Produces：`validSave` 對 `dungeon.tier`：缺省可；`'normal' | 'nightmare' | 'hell'` 之一而且 `tierUnlocked(該存檔, tier)`；否則損毀。`bossKills` 的鍵 `^(?:(nightmare|hell):)?([a-z]+):(\d{1,4})$`。
- [ ] **Step 1：先寫失敗的測試**
  - `save.test.ts`：`a tier key loads`（`'nightmare:mainline:25'`、`'hell:blaze:10'` 可讀；`'normal:mainline:5'`、`'nightmare:nowhere:5'`、`'nightmare:mainline:0'` 損毀）；`a tier the save has not unlocked is corrupt`（`tier: 'hell'` 沒有噩夢第 25 層擊殺 → 損毀；`tier: 'nightmare'`、`reached.mainline` 9 → 損毀；`tier: 'easy'` → 損毀；`tier: 'normal'` 永遠可讀）；`a save without a tier is as before`（舊形狀的存檔讀進來逐欄不變）。
  - `game.test.ts`：`a reload departs into the same affixes`：存檔字串讀兩次成兩個 `Game`，各自 `chooseTier('nightmare')` 後出發同一扇門同一層，連續三場菁英戰（`plantAt`＋`stepOnto`，打完一場再放下一個）的 `affixes` 逐一相同；`dungeon.tier` 讀檔後與存檔前相同。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/save.test.ts src/scripts/games/starlantern/engine/game.test.ts`。
- [ ] **Step 3：實作**（`SAVE_VERSION` 不變；不寫舊存檔遷移）。
- [ ] **Step 4：確認通過**。
- [ ] **Step 5：收尾 G**（`gate-6b` against `gate-6a`＋`cmp`）。
- [ ] **Step 6：commit**：`feat(starlantern): the save keeps the chosen tier and per-tier boss kills; a tier not yet unlocked is a corrupt save`。

### Task 7a: 傳送門廣場的難度列、選層、確認、葛倫的一句話

**Files:**
- Modify：`ui2/scenes/gate.ts`（`PortalCards` 上方的 `.slx-tier-row`、卡片的難度行、`chooseDepth` 右欄、`askDepart`、`GateScene.greet`）、`data/text.zh-TW.ts`（`T.ui2.tier`）、`data/story.zh-TW.ts`（`STORY.tierUnlock`）、`src/styles/_starlantern-ui.scss`（`.slx-tier-row` 一節，12px／行高 14）、`tests/e2e/starlantern.spec.ts`、`tests/e2e/starlantern-legibility.ts`（`SWEEP` 加 `portals-tier`、`depths-tier`、`confirm-tier`）
- Modify（會紅的既有測試）：`ui2/scenes/gate.test.ts` 斷言 `T.ui2.gate.ask` 參數或卡片子元素數的地方。
- Test：`ui2/scenes/gate.test.ts`、`data/story/voice.test.ts`、`data/terms.test.ts`、`ui2/typeScale.test.ts`、e2e

**Interfaces:**
- Consumes：Task 6a 的 `Game.tier`／`chooseTier`、`tierUnlocked`、`NIGHTMARE_DEPTH`、`HELL_BOSS_DEPTH`。
- Produces：
  - `T.ui2.tier`：`row: '難度'`、`names: Record<Difficulty, string>`（普通／噩夢／地獄）、`locked: { nightmare: (d: number) => string; hell: (d: number) => string }`（「主線第 {d} 層解鎖」、「打通結局，並在噩夢擊敗主線第 {d} 層頭目後解鎖」）、`what: { nightmare: string; hell: string }`（「噩夢：敵人會施加異常、菁英與頭目有詞綴；掉落更好」等）、`suggest: { nightmare: string; hell: string }`（「建議：每人一套魔法階符文」、「建議：稀有階以上的符文，加上觸發或常駐」）、`T.ui2.gate.ask(region, n, cond, tier?: string)`（`tier` 有值時多一行「難度：{tier}」）、`T.ui2.gate.suggest(lv, tier?: string)`。
  - `STORY.tierUnlock: string`：葛倫一句話，說「門後面變得更兇了，符文帶好再進去」的意思，用他的口吻，不手打數字。
  - 難度列：裁定 21；切換呼叫 `game.chooseTier`，鎖住 → `sfx.error()`、不呼叫。普通時卡片、選層、確認的文字與現在完全相同。
- [ ] **Step 1：先寫失敗的測試**
  - `gate.test.ts`：`the tier row shows three tiers and what unlocks them`（Lv 1 存檔：普通選中、噩夢與地獄寫條件；`reached.mainline` 10：噩夢可選、地獄寫條件）；`Q and E switch the tier, a locked one only beeps`（`next` → `chooseTier('nightmare')` 被叫、選中的那格有「→」與 `slx-tier-sel`；再 `next` 到地獄（鎖）→ 錯誤音、`dungeon.tier` 不變；點一下同效）；`a Nightmare card says what changes`（選噩夢時每張卡多兩行 `what`、`suggest`；普通時卡片子元素與本任務之前相同）；`the depth list and the confirm name the tier`（右欄「建議 Lv 38・噩夢」、確認框多一行「難度：噩夢」；普通照舊）；`Glen speaks once`（噩夢已解鎖、`tier` 缺省 → 進廣場說 `STORY.tierUnlock`、之後 `dungeon.tier === 'normal'`；再進一次 → 抽到的一般問候；未解鎖 → 一般問候；兩種情況 `game.rng` 都只抽一次）。
  - `voice.test.ts`、`terms.test.ts`：照常跑（新台詞與新介面字要過）。
  - e2e `the portal plaza chooses a tier and departs into Nightmare (difficulty)`：存檔 `reached.mainline` 12；進廣場聽到葛倫那一句；`E` 切到噩夢、地獄寫條件；選主線第 10 層、確認框有「難度：噩夢」；出發後 `__starlanternDebug` 讀到 `run.difficulty === 'nightmare'`；1280×720、844×390、390×844 下難度列每一格在舞台裡、不溢出；沒有 console 錯誤。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/gate.test.ts src/scripts/games/starlantern/data/story/voice.test.ts src/scripts/games/starlantern/data/terms.test.ts`。
- [ ] **Step 3：實作**（`SWEEP` 新增的三個畫面用 e2e 的存檔 setup 進入）。
- [ ] **Step 4：確認通過**；`ui2/typeScale.test.ts` 綠。
- [ ] **Step 5：收尾 G**（e2e 三專案；`@sweep` 截圖 `shots-task7a`）。
- [ ] **Step 6：commit**：`feat(starlantern): the portal plaza picks Normal, Nightmare or Hell — locked tiers say how to open them, Glen says it once`。

### Task 7b: 迷宮徽章、戰鬥詞綴、手冊的「難度」分頁

**Files:**
- Modify：`ui2/scenes/dungeon.ts`（`tierBadge()`，與 `conditionBadge` 同一列）、`render/BattleView.ts`（`showAffixes(byKey: Record<string, string[]>)`，經過 `pixelText`，12px）、`ui2/scenes/battle.ts`（開戰時呼叫 `showAffixes`；選目標的項目 `note` ＝ 詞綴的 `line`，一行一個）、`ui2/scenes/handbook.ts`（`TABS` 加 `tiers`，噩夢解鎖後才列出）、`data/text.zh-TW.ts`（`T.ui2.tier.badge(name)`、`T.ui2.handbook.tabs.tiers: '難度'`、手冊頁的段落）、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`、`tests/e2e/starlantern-legibility.ts`（`SWEEP` 加 `dungeon-tier`、`battle-affix`、`battle-affix-target`、`handbook-tiers`）
- Modify（會紅的既有測試）：`ui2/scenes/handbook.test.ts` 斷言分頁數的地方。
- Test：`ui2/scenes/dungeon.test.ts`、`ui2/scenes/battle.test.ts`、`render/BattleView.test.ts`、`ui2/scenes/handbook.test.ts`、`ui2/typeScale.test.ts`、e2e

**Interfaces:**
- Consumes：Task 3 的 `Combatant.affixes`、`AFFIXES`；Task 6a 的 `run.difficulty`、`tierUnlocked`；`TIERS`（手冊用倍率說明，數字從表帶入）。
- Produces：裁定 21 的畫面；`BattleView.showAffixes` 的文字一律 `pixelText(…, 12)`。
- [ ] **Step 1：先寫失敗的測試**
  - `dungeon.test.ts`：`the floor shows its tier beside the condition`（nightmare 的 run → `.slx-tier-badge` 文字「噩夢」；普通 → 沒有這個元素，DOM 與本任務之前相同）。
  - `BattleView.test.ts`：`affixes are a 12px line under the name`（兩個詞綴 → 一個 Pixi 文字「灼熱・堅韌」，字型 Cubic 11、12px；空清單 → 沒有文字物件）。
  - `battle.test.ts`：`the target note says each affix in a line`（游標停在帶兩個詞綴的菁英上 → 說明列兩行，是兩個 `line`；沒有詞綴的敵人 → 照舊沒有說明）；`a Normal battle shows no affix line`。
  - `handbook.test.ts`：`the tier page opens with Nightmare`（未解鎖 → 沒有 `tiers` 分頁；解鎖 → 有，內容含三個難度的說明、地獄的條件與是否已解鎖、六個詞綴各一句）。
  - e2e `a Nightmare elite shows its affixes and the target says them (difficulty)`：噩夢出發、踩菁英房：Pixi 名字下有詞綴（`__starlanternDebug` 讀 `battle.enemies[0].affixes`），選目標時說明列寫出那一句；樓層名旁有「噩夢」；手冊有「難度」分頁；三種尺寸不溢出（最長名字：熾焰之地第 20 層的菁英＋兩個詞綴，用 hell）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/dungeon.test.ts src/scripts/games/starlantern/ui2/scenes/battle.test.ts src/scripts/games/starlantern/render/BattleView.test.ts src/scripts/games/starlantern/ui2/scenes/handbook.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**；`ui2/typeScale.test.ts`、`data/terms.test.ts` 綠。
- [ ] **Step 5：收尾 G**（e2e 三專案；`@sweep` 截圖 `shots-task7b`）。
- [ ] **Step 6：commit**：`feat(starlantern): the tier beside the floor name, affixes under an elite's name and in the target note, and a handbook page for the tiers`。

### Task 8: 驗收

**Files:**
- Create：SDD `acceptance.md`（只在 SDD，不 commit）
- Test：全部

- [ ] **Step 1：整體檢查**：全套全綠、tsc 符合；`gate-8` against `gate-7b`（或最後一個 gate）identical；另跑 `gate-8final` against 本計畫開工前的 `<SDD>/gate-0`（整個計畫對普通的總帳），identical，`cmp gate-8final/contribution.json …contribution.8d-final.160.json` 沒有輸出；`npm run test:starlantern:bands -- tierBands` 全綠；`npm run test:starlantern:bands`（符文帶）照舊全綠；e2e 三專案全綠。
- [ ] **Step 2：實機走一趟**（4352 的 dev server、headless 截圖，不結束任何程序）：用 debug 存檔走噩夢主線第 10 層（廣場 → 葛倫 → 難度列 → 選層 → 確認 → 迷宮徽章 → 一場群戰 → 一場菁英）與地獄主線第 25 層（頭目戰的兩個詞綴、選目標的說明列）；每一步 1280×720 與 390×844 截圖存 SDD `review/`。
- [ ] **Step 3：fresh-context 審查**：派一個沒看過本計畫實作過程的審查代理（`review-pr` 流程，唯讀），給它 spec、本計畫與 `git diff origin/master...HEAD`；阻擋項回到負責的任務修，修完重跑 Step 1。
- [ ] **Step 4：報告**：每個任務的偏離與理由、`retune.md` 最後的 `TIERS`、難度帶的摘要表、截圖路徑；PR 描述附截圖（PR 由主流程開，本任務不 push）。
- [ ] **Step 5：commit**（若 Step 3 有修正）：照負責任務的 commit 風格。

---

## 交給之後的批次
- **美術批次**（spec §7.3，走 asset factory 的 mockup → 合約 → 生成 → QA → 核准）：廣場的噩夢、地獄徽章；六個詞綴圖示；之後若做難度限定裝備，它的物品圖示。資料與文字不變，換圖時只改畫面。
- **好感度實作**：spec §4.4——好感度的分數不乘難度，每趟上限照舊。
