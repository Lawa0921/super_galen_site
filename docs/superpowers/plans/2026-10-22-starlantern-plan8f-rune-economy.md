# 星燈迷宮 計畫 8f：符文掉落、道具店、合成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 技能深化 spec §17 的第 ⑥ 步：符文從怪物、寶箱、菁英、頭目掉落；歐里克的道具店賣四種普通階符文並收購符文；鍛造屋把三個同名同階的符文合成高一階。普通難度的每一個量測值逐位元不動。

**Architecture:**
- **一條獨立的亂數串流**：所有符文掉落都從 `RUNE_SALT` 加鹽的串流抽（spec §6.5），照 `applyStarlit`／`chestHasGear` 的做法 `mulberry32(mix(seed ^ RUNE_SALT, key))`。戰鬥用 `run.runeDraws` 計數、寶箱與寶庫用位置當鍵。`game.rng`、`lootRng`（`run.lootDraws`）、`memoryRng`（`run.memoryDraws`）一次都不多抽，所以既有的掉落、商店、戰鬥序列不變。
- **閘門為什麼不動**：平衡帶與戰力對等只跑 `engine/sim.ts`（`simBattle`、`kitParty`），從不建 `Game`、不開寶箱、不進商店。本計畫只改 `Game` 的戰鬥結算、寶箱與寶庫、城鎮的商店與鍛造屋，所以每個任務的閘門都必須 `identical`。
- **經濟只有一張表**：掉率、階級權重、買價、賣價、合成的金幣與精華都在 `data/runeEconomy.ts`。純函式在 `engine/loot/runes.ts`（掉落）與 `engine/runeTrade.ts`（買、賣、合成），`Game` 只負責接線與存檔；畫面只是第 ⑦ 步之前「看得到、用得到」的最小版本。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-20-starlantern-skill-builds-design.md`（使用者 2026-10-20 核准，細節授權）。本計畫實作 §6.5 的取得（掉落、道具店、合成、賣出）與 §13 第 4 點（階級權重的難度倍率參數，本次固定 1）。不做：技能工坊、拆裝畫面、預覽、首次掉落的教學（第 ⑦ 步，裁定 6）；建議 build 與符文平衡帶（第 ⑧ 步）；符文圖示（第 ⑨ 步）。前置：計畫 8e 完成（HEAD `1fb746dff` 或之後）。必讀：SDD ledger `.superpowers/sdd/2026-10-20-starlantern-plan8-skills/progress.md` 尾段（8e 的所有裁定）、`.superpowers/sdd/2026-10-21-starlantern-plan8e-rune-engine/task-8-report.md`（交給 ⑥ 的介面）。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄：`.superpowers/sdd/2026-10-22-starlantern-plan8f-rune-economy/`（下稱 SDD）。行號只供定位，動手時一律用內容找。

## 現有的介面（8e 實作，本計畫照用）
- `data/runes.ts`：`RuneId`（`RUNE_IDS` 的 32 個）、`RuneTier`、`RUNE_TIERS`（普通到史詩）、`tiersOf(id)`（傳說群組只有 `legendary`）、`RUNES[id].group`、`RUNE_STACK = 99`、`runeKey`、`parseRuneKey`。
- `engine/sockets.ts`：`bagCount(s, r)`、`socketRune`、`unsocketRune`、`validRuneFields`、`repairRuneFields`（讀檔時修，絕不判損毀）；袋子 `GameState.runes?: Record<string, number>`，鍵 `runeKey`，數到 0 就刪鍵。上限 `RUNE_STACK` 算「袋子＋鑲嵌」（8e 裁定 15：在增加的那一刻檢查——本計畫的責任）。
- `engine/loot/drops.ts`：`rarityWeights(source, depthLv, cond, bossRepeat)`、`rollTier`、`mix`、`STARLIT_SALT` 與 `chestHasGear` 的加鹽寫法；`DropSource` ＝ `monster | chest | elite | vault | boss`。
- `engine/game.ts`：`submitRound` → `battleGear(b, elite)`；`openChest`、寶庫（`kind: 'vault'`）；`BattleEnd`、`MoveResult`；`wipe()` 丟掉 run pack。`data/forge.ts`：`ESSENCE_IDS`（common、magic、rare、legendary 四種精華）。

## 計畫裁定（spec 留給實作者、spec 與程式碼不一致之處）

標「設計者裁定」的是 spec 沒寫死、由本計畫決定的細節（使用者授權：「技能設計由你決定細節」），每條附一行理由。

1. **掉落照 spec 的起始值**（§6.5）：一般怪每隻 3%、寶箱 10%、菁英 25%（菁英戰的護衛照一般怪各 3%）、頭目必掉 1 個。傳說符文只從菁英與頭目掉：這一個符文是傳說的機率菁英 2%、頭目 8%，傳說的話六種平均抽一種。其他時候階級用 `rarityWeights(row, depthLevel(depth), condition)` 的前四階（普通、魔法、稀有、史詩，丟掉 `legendaryTier`）重新正規化後抽，再從 26 種一般符文平均抽一種。**控制者裁定：頭目的一般符文用 `elite` 那一列**（`row` ＝ 頭目時 `'elite'`，其他照來源），照 `rollBossGear` 第二件用菁英權重的先例：`boss` 那一列沒有普通、魔法，也不隨深度變，用它會讓頭目永遠只掉稀有／史詩、深度沒有意義；菁英那一列沒有普通、魔法、稀有隨深度變多。**偏離 spec**：spec 說傳說機率「沿用 `rarityWeights` 形狀」，本計畫用固定的 2%／8%（不隨深度、不吃 `rarityMul`），理由：一個固定的數字好記，傳說符文只有六種、不需要深度曲線；記在 SDD 的偏離清單。抽哪一種的順序固定：一般符文是 `RUNE_IDS` 的順序去掉傳說群組（26 個），傳說是 `RUNE_IDS` 裡傳說群組的順序（6 個）。
2. **設計者裁定：符文的掉率不吃任何加成**：尋寶直覺（`dropBoost`）、`matFind`、地城狀態的 `dropMul` 都不改掉率；階級權重照 spec 用 `rarityWeights`（所以 `rarityMul` 會影響階級）。理由：掉率是一個固定的數字，玩家記得住；加成留給素材與裝備。
3. **設計者裁定：寶庫照寶箱的 10%**，階級權重用 `vault` 那一列（沒有普通、魔法）。spec 只寫了寶箱；寶庫是更好的寶箱，不給它掉符文會讓玩家困惑。
4. **設計者裁定：符文不進 run pack，直接進符文袋，團滅也不會掉**。理由：符文沒有重量（spec「符文袋不佔裝備背包的格子」），也不是要帶回城的素材；8e 的引擎已經允許在迷宮的野外拆裝（`Game.socketRune` 的 `map` 階段），所以第 ⑦ 步的工坊一做好，撿到的符文就能在迷宮裡當場裝上；spec §6.5 的精神是「玩家不敢實驗就是失敗」。和其他戰利品一樣，只有回城存檔之後才寫進存檔（中途關掉遊戲就像整趟沒發生）。
5. **設計者裁定：「符文開放」是一個存檔旗標**：`GameState.runesOpen?: true`。spec 說「第一位頭目被擊倒之後才開始掉符文，那一場必掉一個魔法階擴散」。旗標不存在時，任何一場在迷宮裡贏下的頭目戰都會：把這一場頭目的那一個符文換成魔法階擴散、設下旗標；之後才開始一般掉落，道具店才開始賣符文。理由：舊存檔（已經打過頭目）也會在下一次打倒頭目時拿到同一個起點（spec「保證每個存檔都有同一個起點」），不需要遷移。
6. **控制者裁定：首次掉落的教學延到第 ⑦ 步，用它自己的旗標**。spec §6.5 要「那一場播一次教學」，但教的是怎麼裝符文，而裝符文的技能工坊是第 ⑦ 步才有的畫面。本計畫只在戰鬥結算多一行「得到符文：擴散（魔法）」；第 ⑦ 步加 `runeTutorialSeen` 旗標決定要不要播（不看 `runesOpen`：開放與看過教學是兩件事）。**第 ⑥ 步和第 ⑦ 步一起上線**：本計畫做完之前玩家拿得到符文卻沒有裝的畫面，所以 ⑥ 不單獨發布給使用者。
7. **設計者裁定：99 個的上限**：一種符文的同一階（袋子＋鑲嵌）已經 99 個時，新掉落的那一個當場照收購價換成金幣，**直接進 `state.gold`**（控制者裁定：和符文本身一樣團滅也不會掉；戰鬥、寶箱、寶庫都一樣，不算進 `run.loot.gold`，也不算進 `BattleEnd.gold`），結算多一行「擴散（魔法）已經 99 個，換成 60 G」。道具店買不下去（`full`）；合成出來的那一階滿了就不能合成（`full`）。理由：戰利品不會憑空消失，店與合成是玩家主動選的，拒絕比較好懂。
8. **設計者裁定：價格**（spec「價格依階級」）：

   | 階級 | 道具店賣價 | 道具店收購 |
   |---|---|---|
   | 普通 | 100 G | 25 G |
   | 魔法 | — | 60 G |
   | 稀有 | — | 150 G |
   | 史詩 | — | 350 G |
   | 傳說 | — | 500 G |

   道具店只賣 spec 寫的四種普通階：擴散、連擊、節流、延長，數量不限，`runesOpen` 之後才出現。買價照道具店既有的折扣（歐里克的碎片 `shop-discount`），收購價不打折。鑲嵌中的符文不能賣（先拆）。
9. **設計者裁定：合成的價錢**（spec「付金幣與一份精華」）：普通→魔法 30 G＋`essence-common` 1；魔法→稀有 80 G＋`essence-magic` 1；稀有→史詩 200 G＋`essence-rare` 1（金幣沿用裝備合成 `FUSE_GOLD` 的三個數字）。史詩與傳說不能合成。合成不抽亂數。
10. **經濟不會變成印鈔機**（守門測試）：任何一階，三個收購價＋合成的金幣都高於高一階的收購價（25×3＋30 > 60；60×3＋80 > 150；150×3＋200 > 350），買來就賣一定虧（100 > 25）。所以玩家不會發現「合成再賣」比較賺，只會在想要更強的符文時合成。
11. **設計者裁定：難度倍率**（spec §13 第 4 點）：`runeTierWeights(source, depthLv, cond, difficultyMul = 1)` 與 `rollRune(…, difficultyMul = 1)`，魔法、稀有、史詩的權重乘上 `difficultyMul`，普通不變；本計畫所有呼叫都用預設 1，有一則測試證明 1 的時候和 `rarityWeights` 的前四階相同。
12. **設計者裁定：抽取的順序固定**：一場戰鬥只開一條符文串流（`runeRng(run)`，`run.runeDraws` +1），依 `b.enemies` 的順序每隻抽「掉不掉」，掉的那隻接著抽「傳說嗎（菁英、頭目才有這一步）」「階級」「哪一種」；頭目戰的頭目不抽「掉不掉」，**頭目戰裡其他的敵人不抽**（設計者裁定：頭目戰的戰利品就是頭目那一個，和 `battleGear` 一樣；現在的頭目戰只有頭目一隻，這條只是先寫清楚）。逃跑、團滅、存活戰裡沒倒的敵人不抽。`runesOpen` 不存在的戰鬥（含開放它的那一場頭目戰）不開串流、`runeDraws` 不動。寶箱與寶庫不用計數，用 `mix(mix(mix(seed ^ RUNE_SALT, depth), x), y)` 當種子（同一個位置永遠是同一個結果，被重量擋住、之後再開也一樣）。
13. **設計者裁定：「持有」算全部**：`ownedCount(s, r)` ＝ 袋子＋整個隊伍（含不在場上的成員）鑲嵌中的同名同階數量，就是 99 上限算的那個數。畫面上「持有 n」一律顯示它（玩家想知道的是「我有幾個」，不是「袋子裡有幾個」）；能賣、能合成的只有袋子裡的，數量框與說明欄寫「袋子 m」，有鑲嵌中的時候說明欄多一句「其中 k 個鑲嵌中，先拆下才能賣或合成」。
14. **設計者裁定：城鎮以外一律 `'phase'`**：`Game.buyRune`／`sellRune`／`fuseRune` 在 `phase !== 'town'` 時回 `{ ok: false, reason: 'phase' }`，和鍛造屋的 `forgeAct` 一樣（本計畫三個動作只用這一個理由，不用 `'invalid'`）。

## Global Constraints

**使用者的方向（最高依據）**
- 「所以不裝符文頂多過普通」：普通難度的驗收＝預設配點、沒有符文的模擬。`engine/balance*.test.ts` 的門檻與種子凍結；本計畫沒有任何任務可以移動任何量測值。
- 「不夠直覺的話我可能會懶的研究 build」：經濟只有「掉落、買四種普通、賣、三合一」四件事；價格與掉率是固定的數字，畫面上直接寫出來（合成寫「3 個擴散（普通）＋30 G＋普通精華 → 擴散（魔法）」）。

**分支與基準**
- `feat/starlantern-story`，HEAD `1fb746dff` 或之後。開工前 `git status`：本計畫要改的檔案有別人未提交的修改，停下來回報 NEEDS_CONTEXT。
- 閘門 `against` 鏈：Task 1 對 8e 的最終閘門 `.superpowers/sdd/2026-10-21-starlantern-plan8e-rune-engine/gate-9`；之後每個任務對前一個任務在 SDD 的 `gate-<N>`。**每個任務的閘門都必須 `gate: identical`**；不同就是 bug，停下來回報 BLOCKED，不准重錄夾具。Task 6 另跑一次對 8d 最終閘門 `.superpowers/sdd/2026-10-21-starlantern-plan8d-tree-rework/gate-10`，也必須 `identical`。
- 戰力對等：`engine/parity.test.ts` 的 `PARITY_TASK` 整個計畫維持 `between plans`（`prev: 'contribution.8d-final.160.json'`、`changed: []`）；本計畫不錄新表。
- 不覆寫 `engine/__fixtures__/` 底下任何既有檔案。

**亂數（決定性）**
- 不可以 `Math.random`。`game.rng`、`lootRng`／`run.lootDraws`、`memoryRng`／`run.memoryDraws`、`forgeDraws`、戰鬥的 `rng` 一次都不多抽。所有新抽取都在 `RUNE_SALT` 串流裡（裁定 12）。
- `RUNE_SALT = 0x5be0cd19`（SHA-256 的第八個初始值，和其他鹽的取法相同；其他七個裡五個已被 `RESCUE_SALT`、`GLIMMER_SALT`、`ABSORB_SALT`、`MEMORY_SALT`、`STARLIT_SALT` 與 `chestHasGear` 用掉，`0x5be0cd19` 與 `0xbb67ae85` 沒人用；Task 1 用 `grep` 再確認一次）。

**測試與檢查**
- TDD：先寫失敗的測試，確認它因正確的理由失敗，再實作。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套：`rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`。
- 閘門：`rtk proxy bash scripts/starlantern-sim-gate.sh .superpowers/sdd/2026-10-22-starlantern-plan8f-rune-economy/gate-<N> <against>`。
- tsc：`rtk proxy npx tsc --noEmit -p .`；starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個（repo 原本約 43 個與本專案無關）。
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`；headless、靜音；只用 4352，絕不用 4354，不結束任何程序。
- **重的工作（閘門、e2e）之前**：PowerShell `Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory` 確認可用記憶體 ≥ 6 GB（≥ 6291456 KB）；不足就等。一次只跑一套重的測試。
- 本專案沒有 prettier、eslint，不要跑。
- 一次性的探測程式不放在 `src/` 底下過夜：要用 vitest 跑的片段，跑完立刻刪掉，絕不 commit。
- **每個任務的收尾（下稱「收尾 G」）**：(1) 全套全綠、tsc 0；(2) 記憶體 ≥ 6 GB 後跑閘門，必須 `gate: identical`；(3) 跑 e2e 全綠（每個任務都跑：本計畫每個任務都碰到存檔或畫面）；(4) 報告：新增的測試名、閘門最後兩行、全套的兩行、e2e 結果、偏離本計畫的地方（含理由）。

**換行（逐檔保留）**：改檔前 `git ls-files --eol <檔案>`；改完 `git diff --stat`，整檔被改寫就是換行壞了。CRLF 檔不可以用 `sed -i`。已知：CRLF：`engine/state.ts`、`engine/save.ts`、`ui2/scenes/shop.ts`；LF：`data/runes.ts`、`data/forge.ts`、`engine/sockets.ts`、`engine/loot/drops.ts`、`engine/dungeon/run.ts`、`ui2/scenes/forge.ts`、`ui2/scenes/dungeon.ts`；混用（新行照相鄰行）：`engine/game.ts`、`engine/town.ts`、`ui2/scenes/battle.ts`、`data/text.zh-TW.ts`。新檔一律 LF。

**git**：完整路徑 add，不可以 `git add -A`／`git add .`。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。絕對不可以 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。不 push。

**介面與文字**
- 符文在畫面上一律寫「名稱（階級）」，階級字用既有的 `T.gear.rarity`（普通、魔法、稀有、史詩、傳說），顏色用既有的 `slx-rarity-<階級>` class。沒有符文圖示（第 ⑨ 步），不放佔位圖、不用 CSS 畫形狀。SCSS 禁 `!important`、禁行內樣式（含 `element.style`）。
- 介面文字放 `data/text.zh-TW.ts` 的 `T.rune`；價格、數量一律由數字表產生，不寫死在字串裡。全形標點、不用「……」。
- 手機寬度 390 下，道具店與鍛造屋的符文列不溢出（e2e 量 `scrollWidth <= clientWidth`）。

**測試修改規則**：各任務 Files 列出已知會紅的既有測試。全套跑出沒列到的紅燈，而它斷言的正是本任務改的形狀（`BattleEnd`、`MoveResult` 多了可省略的欄位、鍛造屋多一個分頁、道具店多一個指令、`newRun` 多 `runeDraws`），**或是一場頭目勝利現在會在沒有旗標的存檔上給擴散並設 `runesOpen`（例如 `engine/game.test.ts` 約 439–516 行的故事頭目測試，整個比較 `state` 或 `BattleEnd` 的地方）**，可以照新形狀補上這些欄位（不改其他斷言）並在報告逐則列出；其他紅燈停下來回報 NEEDS_CONTEXT。`it.fails`、`it.skip`、`.only`、`.todo` 不可以出現在 commit。

**子代理**：實作者不派子代理。

## Review Focus
1. **舊存檔（已經打過頭目、沒有 `runesOpen`）下一次打倒頭目，拿到魔法階擴散並開放符文；之後的頭目照常掉。** 測試：Task 2 `an old save past its first boss opens runes on its next boss`。
2. **符文掉落不改任何既有的抽取**：同一個種子、同一條路線，加入符文前後的裝備、素材、記憶碎片、經驗、金幣完全相同（只多了符文）。測試：Task 2 `rune drops leave every other drop as it was`。
3. **同一個寶箱被重量擋住、清出空間再開，符文和第一次看到的一樣，而且只給一次。** 測試：Task 2 `a chest's rune is fixed by its spot and paid once`。
4. **到 99 個時不會吞掉戰利品**：換成金幣並說出來。測試：Task 1 `a rune past the stack turns into its sell price`、Task 2 `a boss rune past 99 pays gold`。
5. **鑲嵌中的符文不能被賣掉、也不會被拿去合成**（只用袋子裡的）。測試：Task 4 `socketed runes are not for sale`、Task 5 `fusion takes from the bag only`。

---

## File Structure
- `data/runeEconomy.ts`（新）：`RUNE_DROP`、`RUNE_LEGENDARY`、`RUNE_STOCK`、`RUNE_BUY`、`RUNE_SELL`、`RUNE_FUSE`。只有數字。
- `engine/loot/runes.ts`（新）：`RUNE_SALT`、`NORMAL_RUNES`、`LEGENDARY_RUNES`、`runeTierWeights`、`rollRune`、`runeRng`、`spotRuneRng`、`grantRune`。掉落與入袋，純函式。
- `engine/runeTrade.ts`（新）：`runeStock`、`runeBuyPrice`、`runeBuyMax`、`runeSellPrice`、`runeSellMax`、`buyRune`、`sellRunes`、`fuseRunes`、`fuseCostOf`。城鎮的買、賣、合成，純函式。
- 修改：`data/runes.ts`（`export` 既有的 `RUNE_IDS`）、`engine/state.ts`（`runesOpen?`）、`engine/sockets.ts`（`ownedCount`；`validRuneFields`／`repairRuneFields` 認得 `runesOpen`）、`engine/dungeon/run.ts`（`runeDraws`）、`engine/game.ts`（戰鬥、寶箱、寶庫的符文，`buyRune`／`sellRune`／`fuseRune`）、`ui2/scenes/battle.ts`（結算行）、`ui2/scenes/dungeon.ts`（寶箱、寶庫的訊息行）、`ui2/scenes/shop.ts`（符文指令）、`ui2/scenes/forge.ts`（符文合成分頁）、`data/text.zh-TW.ts`。
- 測試：`data/runeEconomy.test.ts`、`engine/loot/runes.test.ts`、`engine/runeTrade.test.ts`（新），加上 `engine/game.test.ts`、`engine/sockets.test.ts`、`engine/save.test.ts`、`ui2/scenes/battle.test.ts`、`ui2/scenes/dungeon.test.ts`、`ui2/scenes/shop.test.ts`、`ui2/scenes/forge.test.ts`、`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 經濟數字表、掉落的純函式、入袋與上限、`runesOpen` 旗標

**Files:**
- Create：`data/runeEconomy.ts`、`engine/loot/runes.ts`
- Modify：`data/runes.ts`（`RUNE_IDS` 加 `export`，內容與順序不動）、`engine/state.ts`（`GameState.runesOpen?: true`）、`engine/sockets.ts`（`ownedCount`；`runesOpen` 只能是 `true` 或省略；修復時其他值刪掉）
- Test：`data/runeEconomy.test.ts`、`engine/loot/runes.test.ts`、`engine/sockets.test.ts`、`engine/save.test.ts`

**Interfaces:**
- Consumes：`rarityWeights`、`rollTier` 的權重形狀、`mix`、`mulberry32`、`pick`；`RUNE_IDS`／`RUNES`、`tiersOf`、`runeKey`、`RUNE_STACK`；`bagCount`。
- Produces（`data/runeEconomy.ts`；物件不凍結，測試可以暫時改值再還原，同 `STARLIT_CHANCE`）：
  - `export const RUNE_DROP: Record<'monster' | 'chest' | 'vault' | 'elite', number> = { monster: 0.03, chest: 0.10, vault: 0.10, elite: 0.25 }`（頭目必掉，不在表裡）。
  - `export const RUNE_LEGENDARY: Record<'elite' | 'boss', number> = { elite: 0.02, boss: 0.08 }`。
  - `export const RUNE_STOCK: readonly RuneId[] = ['spread', 'multistrike', 'thrift', 'extend']`（全部普通階）。
  - `export const RUNE_BUY: Partial<Record<RuneTier, number>> = { common: 100 }`；`export const RUNE_SELL: Record<RuneTier, number> = { common: 25, magic: 60, rare: 150, epic: 350, legendary: 500 }`。
  - `export const RUNE_FUSE: Record<'common' | 'magic' | 'rare', { to: RuneTier; gold: number; essence: string }> = { common: { to: 'magic', gold: 30, essence: 'essence-common' }, magic: { to: 'rare', gold: 80, essence: 'essence-magic' }, rare: { to: 'epic', gold: 200, essence: 'essence-rare' } }`。
- Produces（`engine/loot/runes.ts`）：
  - `export const RUNE_SALT = 0x5be0cd19`。
  - `export function runeTierWeights(source: DropSource, depthLv: number, cond: ConditionId, difficultyMul = 1): Record<'common' | 'magic' | 'rare' | 'epic', number>`：`rarityWeights(source === 'boss' ? 'elite' : source, depthLv, cond)` 的前四階（裁定 1），魔法、稀有、史詩 ×`difficultyMul`。
  - `export const NORMAL_RUNES: readonly RuneId[]`（`RUNE_IDS` 順序、去掉傳說群組，26 個）、`export const LEGENDARY_RUNES: readonly RuneId[]`（`RUNE_IDS` 順序的傳說群組，6 個）。
  - `export function rollRune(rng: Rng, source: DropSource, depthLv: number, cond: ConditionId, difficultyMul = 1): RuneRef`：抽取順序（裁定 12 的後半）：`source` 是 `elite` 或 `boss` 時先一次 `rng() < RUNE_LEGENDARY[source]` → 傳說，`pick(rng, LEGENDARY_RUNES)`；否則一次加權抽階級（`runeTierWeights` 四階正規化，同 `rollTier` 的走法），再 `pick(rng, NORMAL_RUNES)`。「掉不掉」不在這裡（呼叫的人先抽）。
  - `export function runeRng(run: Run): Rng`：`mulberry32(mix(run.seed ^ RUNE_SALT, run.runeDraws++))`。`export function spotRuneRng(run: Run, depth: number, at: Pos): Rng`：`mulberry32(mix(mix(mix(run.seed ^ RUNE_SALT, depth), at.x), at.y))`，不改 `run`。
  - `export function grantRune(s: GameState, r: RuneRef): { state: GameState; gold: number }`：`ownedCount(s, r) >= RUNE_STACK` → 不入袋、`gold = RUNE_SELL[tier]` 並加進回傳的 `state.gold`（裁定 7）；否則入袋、`gold = 0`。純函式，不改 `s`；`runes` 欄位不存在時建立。
  - `engine/sockets.ts`：`export function ownedCount(s: Pick<GameState, 'runes' | 'party'>, r: RuneRef): number`：袋子＋`party.roster` 每一位成員 `sockets` 裡同名同階的數量（裁定 13）。
  - `engine/dungeon/run.ts`：`Run.runeDraws: number`（`newRun` 為 0）。
- [ ] **Step 1：先寫失敗的測試**
  - `data/runeEconomy.test.ts`：
    - `the numbers are the spec's and the plan's`：`RUNE_DROP`、`RUNE_LEGENDARY`、`RUNE_STOCK`、`RUNE_BUY`、`RUNE_SELL`、`RUNE_FUSE` 各自 `toEqual` 上面的值。
    - `no money loop`（裁定 10）：每一個 `RUNE_FUSE` 的階 t：`3 × RUNE_SELL[t] + RUNE_FUSE[t].gold > RUNE_SELL[RUNE_FUSE[t].to]`；`RUNE_BUY.common > RUNE_SELL.common`；`RUNE_FUSE[t].essence` 都在 `ESSENCE_IDS`。
  - `engine/loot/runes.test.ts`：
    - `the salt is new`：`RUNE_SALT` 不等於 `STARLIT_SALT`、`MEMORY_SALT`、`ABSORB_SALT`、`GLIMMER_SALT`、`FORGE_SALT`，也不等於 `chestHasGear` 的 `0x3c6ef372` 與 `RESCUE_SALT` 的 `0x6a09e667`；`engine/` 底下非測試原始碼裡 `0x5be0cd19` 只出現在 `loot/runes.ts`（`readFileSync` 掃描）。
    - `tier weights are the gear's first four`：`runeTierWeights('monster', 10, 'plain')` 等於 `rarityWeights('monster', 10, 'plain')` 去掉 `legendaryTier`；`runeTierWeights('boss', d, 'plain')` 對 d ＝ 2、40 都 `toEqual` `runeTierWeights('elite', d, 'plain')`；菁英那一列 `common` 是 0、`magic` > 0，`rare / (magic + rare + epic)` 在 d 40 比 d 2 大；`difficultyMul 2` 時魔法、稀有、史詩加倍、普通不變。
    - `legendary runes come from elites and bosses only`（`constRng` 從 `engine/testing.ts` 匯入，它是 `(v) => () => v`）：`rollRune(constRng(0), 'monster', …)` 不是傳說；`'elite'` 用 `constRng(0)` → `{ id: LEGENDARY_RUNES[0], tier: 'legendary' }`；`constRng(0.999)` 的一般符文是 `NORMAL_RUNES[25]`；`NORMAL_RUNES.length === 26`、`LEGENDARY_RUNES` 是 `twin-cast`、`starwheel`、`blood-price`、`sync`、`spill-shield`、`reprise`；`'elite'`、`'boss'` 用 `constRng(0)` → 傳說；用 `constRng(0.5)` → 一般。
    - `a roll draws the same count every time`：計數 rng：`monster` 的 `rollRune` 抽 2 次，`elite`／`boss` 一般 3 次、傳說 2 次。
    - `the odds come out as written`：`mulberry32(1)` 抽 20000 次 `rollRune(…, 'elite', 20, 'plain')`：傳說比例在 2% ± 0.5%；每種一般符文都出現；`'boss'` 沒有普通，深度 40 的稀有＋史詩比例高於深度 2；`difficultyMul 2` 傳進 `rollRune` 時，魔法以上的比例比 1 高。
    - `the rune streams never touch the loot stream`：`runeRng(run)` 後 `run.lootDraws`、`run.memoryDraws` 不變、`run.runeDraws` +1；`spotRuneRng` 什麼都不改，同一個位置兩次給同一串數字。
    - `a rune past the stack turns into its sell price`：袋子 `spread@magic: 98`、鑲嵌 1 → `grantRune` 給 `gold 60`、回傳的 `state.gold` 多 60、袋子不變；袋子 97、鑲嵌 1 → 入袋、`gold 0`；沒有 `runes` 欄位的存檔 → 建立欄位。
    - `ownedCount counts the bag and every member's sockets`：袋子 2、諾艾兒鑲嵌 1、不在場上的莉茲鑲嵌 1 → 4；別的階不算。
  - `engine/sockets.test.ts`：`runesOpen is true or absent`：`validRuneFields` 對 `true`、省略為 true，對 `false`、`1`、`'yes'` 為 false；`repairRuneFields` 把它們刪掉、`true` 不動。
  - `engine/save.test.ts`：`runesOpen survives a save and a load`；`a junk runesOpen is dropped, the save loads`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/runeEconomy.test.ts src/scripts/games/starlantern/engine/loot/runes.test.ts src/scripts/games/starlantern/engine/sockets.test.ts src/scripts/games/starlantern/engine/save.test.ts`。預期：模組不存在。
- [ ] **Step 3：實作**（照 Interfaces）。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-1`，against 8e `gate-9`）。
- [ ] **Step 6：commit**：`feat(starlantern): the rune economy table and drop rolls — a stream of their own, a stack that pays out at 99`。

### Task 2: 戰鬥、寶箱、寶庫的符文（引擎）；第一位頭目開放符文

**Files:**
- Modify：`engine/game.ts`（`battleRunes`、`openChest`、`openVault`、`BattleEnd.runes?`／`runeGold?`、`MoveResult` 的 `chest`／`vault` 加 `rune?`／`runeGold?`）
- Modify（會紅的既有測試）：`engine/game.test.ts` 裡對 `BattleEnd`、寶箱或寶庫結果整個 `toEqual` 的測試，**只**在那場戰鬥本來就在 `runesOpen` 之後時才會多出欄位；照新形狀補欄位，不改其他斷言。
- Test：`engine/game.test.ts`

**Interfaces:**
- Consumes：Task 1 的全部。
- Produces：
  - `private battleRunes(b: BattleState, elite: boolean): { runes: RuneRef[]; gold: number }`（`submitRound` 在 `battleGear` 之後呼叫；`win` 才呼叫）：
    - 頭目戰且沒有 `runesOpen`：給 `{ id: 'spread', tier: 'magic' }`、設 `runesOpen = true`，**不開**串流（裁定 5、12）。
    - 沒有 `runesOpen`：什麼都不做。
    - 其他：一條 `runeRng(run)`；頭目：`rollRune(rng, 'boss', …)` 一個；菁英戰：第一隻 `rng() < RUNE_DROP.elite` 才 `rollRune(rng, 'elite', …)`，其餘每隻照 `monster`；一般戰：每隻 `rng() < RUNE_DROP.monster` 才 `rollRune(rng, 'monster', …)`；存活戰裡沒倒的敵人跳過（同 `battleGear`）。深度用 `depthLevel(this.floor)`、條件用 `run.condition`。
    - 每個符文用 `grantRune` 入袋；換成金幣的直接進 `state.gold`（裁定 7，不進 `run.loot.gold`、不改 `BattleEnd.gold`），並記在 `runeGold`。
    - `BattleEnd.runes?: RuneRef[]`（入袋的，有才有）、`BattleEnd.runeGold?: { rune: RuneRef; gold: number }[]`（換錢的，有才有）。
  - 寶箱（`openChest`）：箱子真的打開時（重量沒擋住），`runesOpen` 在時用 `spotRuneRng(run, this.floor, this.pos)` 抽一次 `rng() < RUNE_DROP.chest`，中了 `rollRune(rng, 'chest', …)` 並 `grantRune`；結果加 `rune?: RuneRef` 或 `runeGold?: { rune: RuneRef; gold: number }`（金幣進 `state.gold`）。寶庫（`openVault(at)`）同樣，位置用它的參數 `at`（不是 `this.pos`），用 `RUNE_DROP.vault` 與 `'vault'`（裁定 3）。已經開過的箱子、寶庫（`run.opened`）不再給。
- [ ] **Step 1：先寫失敗的測試**（`engine/game.test.ts`；用既有的建 run／打 boss 的測試輔助）
  - `no rune drops before the first boss, and none of their draws`：沒有 `runesOpen` 的一般戰勝利 → `end.runes` 不存在、`run.runeDraws` 為 0。
  - `the first boss gives a magic spread and opens runes`：第一次打倒頭目 → `end.runes` ＝ `[{ id: 'spread', tier: 'magic' }]`、`state.runes['spread@magic'] === 1`、`state.runesOpen === true`、`run.runeDraws === 0`。
  - `an old save past its first boss opens runes on its next boss`：`bossKills` 已有紀錄、沒有 `runesOpen` 的存檔 → 下一場頭目勝利照上一則；再下一場頭目 → `end.runes` 長度 1、`run.runeDraws === 1`。
  - `rune drops leave every other drop as it was`：同一個種子、同一串動作，`runesOpen` 有與沒有的兩個 `Game` 跑同樣的幾場戰鬥與一個寶箱：每一場的 `exp`、`gold`、`run.loot.gold`、`drops`、`gear`（逐欄）、`fragments`、`run.lootDraws`、`run.memoryDraws`、之後 `game.rng` 抽出的下一個數都相同。
  - `ordinary fights roll each foe once, elites at their own rate`：把 `RUNE_DROP` 在測試裡暫時改成 1（測完還原）→ 三隻怪的一般戰 `end.runes` 長度 3；菁英戰的第一隻用菁英的權重（沒有普通階）。
  - `a chest's rune is fixed by its spot and paid once`：`RUNE_DROP.chest` 暫時 1：一個寶箱被重量擋住（`full`）→ 沒有符文入袋；清出空間再開 → 符文與 `rollRune(spotRuneRng(run, depth, at), 'chest', …)` 相同，只入袋一次；再踩一次 → 不再給。
  - `a boss rune past 99 pays gold`：袋子已有 99 個將要掉的那一種（先用同一個種子算出會掉什麼）→ `end.runeGold` 一筆、`state.gold` 立刻多了收購價、`end.gold` 與 `run.loot.gold` 和沒有上限時相同、袋子仍是 99；接著團滅 → 這筆錢還在（只扣既有的四分之一）。
  - `a vault's rune comes from its own spot`：`RUNE_DROP.vault` 暫時 1，`openVault(at)` 的符文等於 `rollRune(spotRuneRng(run, depth, at), 'vault', …)`，`at` 與玩家位置不同時也一樣。
  - `a wipe keeps the runes found`（裁定 4）：撿到符文之後團滅 → 袋子裡還在。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/game.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-2`，against `gate-1`）。
- [ ] **Step 6：commit**：`feat(starlantern): runes drop from foes, chests, vaults and bosses; the first boss opens them with a magic spread`。

### Task 3: 戰利品畫面：結算與迷宮訊息寫出符文

**Files:**
- Modify：`ui2/scenes/battle.ts`（結算行）、`ui2/scenes/dungeon.ts`（寶箱、寶庫的訊息行）、`data/text.zh-TW.ts`（`T.rune.label(id, tier)`「{名稱}（{階級}）」、`T.rune.got`「得到符文：{label}」、`T.rune.overStack`「{label}已經 {n} 個，換成 {g} G」，`n` 由 `RUNE_STACK` 傳入）
- Test：`ui2/scenes/battle.test.ts`、`ui2/scenes/dungeon.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 2 的 `BattleEnd.runes`／`runeGold`、`MoveResult` 的 `rune`／`runeGold`。
- Produces：結算畫面每個 `runes` 一行 `T.rune.got`、每個 `runeGold` 一行 `T.rune.overStack`，排在裝備之後、class `slx-loot-rune slx-rarity-<tier>`；迷宮訊息：寶箱、寶庫結果有 `rune` 時多一行 `T.rune.got`，有 `runeGold` 時多一行 `T.rune.overStack`。
- [ ] **Step 1：先寫失敗的測試**
  - `ui2/scenes/battle.test.ts`：`the result names each rune found`：`end.runes` 有擴散（魔法）→ 結算有一行「得到符文：擴散（魔法）」、class 含 `slx-rarity-magic`；`runeGold` 一筆擴散（魔法）60 G → 「擴散（魔法）已經 99 個，換成 60 G」。
  - `ui2/scenes/dungeon.test.ts`：`a chest or vault with a rune says so`：寶箱結果帶 `rune: { id: 'bounce', tier: 'rare' }` → 訊息有「得到符文：彈射（稀有）」；寶庫帶 `runeGold` → 有換成金幣的那一行。
  - e2e：既有的「打倒第一個頭目」那一則（若沒有，就在已有的頭目 e2e 裡）加一個斷言：結算畫面有「得到符文：擴散（魔法）」，該列 `scrollWidth <= clientWidth`（390 寬）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/scenes/battle.test.ts src/scripts/games/starlantern/ui2/scenes/dungeon.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-3`，against `gate-2`）。
- [ ] **Step 6：commit**：`feat(starlantern): the battle result and the labyrinth say which rune was found`。

### Task 4: 道具店：買四種普通階符文、收購符文

**Files:**
- Create：`engine/runeTrade.ts`（本任務放買賣）
- Modify：`engine/game.ts`（`buyRune`、`sellRune`，城鎮限定、成功就存檔）、`ui2/scenes/shop.ts`（第三個指令「符文」）、`data/text.zh-TW.ts`（`T.ui2.shop.runes`「符文」、`T.rune.fail`：`closed`「打倒第一位頭目之後才有符文」、`full`「這個符文已經 99 個了」、`stock`「袋子裡沒有這麼多」、`gold` 沿用既有的金幣不足字；`T.rune.socketedNote(k)`）
- Modify（會紅的既有測試）：`ui2/scenes/shop.test.ts` 裡斷言道具店只有兩個指令的地方。
- Test：`engine/runeTrade.test.ts`、`engine/game.test.ts`、`ui2/scenes/shop.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 1 的 `RUNE_STOCK`、`RUNE_BUY`、`RUNE_SELL`、`ownedCount`；`hasPerk`、`PERKS.shopDiscountPct`；`bagCount`。
- Produces（`engine/runeTrade.ts`）：
  - `export type RuneTradeFail = 'closed' | 'invalid' | 'gold' | 'full' | 'stock' | 'essence'`（`essence` 只有合成用，Task 5）。
  - `export function runeBuyMax(s: GameState, r: RuneRef): number`：`min(floor(s.gold ÷ runeBuyPrice), RUNE_STACK − ownedCount(s, r))`，不在店裡為 0；`export function runeSellMax(s: GameState, r: RuneRef): number` ＝ `bagCount`。
  - `export function runeStock(s: GameState): RuneRef[]`：`runesOpen` 時 `RUNE_STOCK` 的普通階，否則 `[]`。
  - `export function runeBuyPrice(s: GameState, r: RuneRef): number | undefined`：在 `runeStock` 裡才有；打折照 `priceOf` 的算法（`Math.ceil(price × (100 − PERKS.shopDiscountPct) / 100)`）。
  - `export function buyRune(s: GameState, r: RuneRef, qty = 1): { ok: true; state: GameState } | { ok: false; reason: RuneTradeFail }`：`qty` 不是正整數 `invalid`；沒開放 `closed`；不在店裡 `invalid`；`ownedCount + qty > RUNE_STACK` → `full`（不換錢：玩家主動買，拒絕）；錢不夠買 `qty` 個 `gold`；成功扣錢、入袋 `qty` 個。
  - `export function runeSellPrice(r: RuneRef): number`（`RUNE_SELL[tier]`，不打折）。
  - `export function sellRunes(s: GameState, r: RuneRef, qty: number): { ok: true; state: GameState } | { ok: false; reason: RuneTradeFail }`：`qty` 是正整數（否則 `invalid`）；只賣袋子裡的（`bagCount < qty` → `stock`）；不需要 `runesOpen`（袋子裡有就能賣）。
- Produces（`engine/game.ts`）：`buyRune(r, qty)`、`sellRune(r, qty)`：`phase !== 'town'` → `{ ok: false, reason: 'phase' }`（裁定 14，同 `forgeAct`）；成功立即存檔，存檔失敗只留 `save-failed` 通知。
- 畫面（最小版）：道具店指令「符文」打開一張清單：上半是店裡的四種（`runesOpen` 之前這半段只有一行灰的 `T.rune.fail.closed`），右欄「100 G　持有 n」；下半是袋子裡有的每一種（依 `RUNE_IDS` 再依階級排序），右欄「收購 25 G　持有 n」。「持有 n」一律是 `ownedCount`（裁定 13）。說明欄：該符文這一階的一句話（`RUNES[id].text(tier)`）、「袋子 m」，有鑲嵌中的再加 `T.rune.socketedNote(k)`「其中 {k} 個鑲嵌中，先拆下才能賣或合成」。**數量框**：既有的 `askQty` 只認道具與裝備，所以新增 `private askRuneQty(r: RuneRef, mode: 'buy' | 'sell', after: () => void)`，用同一個 `QtyView`：買的上限 `runeBuyMax`（0 時照錢或上限給 `gold`／`full` 的訊息、不開框），賣的上限 `runeSellMax`（0 時給 `stock`）；確定後呼叫 `Game.buyRune`／`sellRune`。沒有鑲嵌、預覽（第 ⑦ 步）。
- [ ] **Step 1：先寫失敗的測試**
  - `engine/runeTrade.test.ts`：
    - `the shop sells four commons once runes are open`：沒開放 → `runeStock` 為 `[]`、`buyRune` 為 `closed`；開放 → 四種、順序同 `RUNE_STOCK`、都是 `common`；`buyRune({ id: 'spread', tier: 'magic' })` → `invalid`；`buyRune({ id: 'bounce', tier: 'common' })` → `invalid`。
    - `buying costs its price, with Orik's discount`：金幣 150 → 買擴散後 50、袋子 1；`qty 3`、金幣 300 → 金幣 0、袋子 3；有 `shop-discount` 時價格照 `priceOf` 的折扣算；金幣 99 → `gold`；總數 98 時 `qty 2` → `full`、`qty 1` 成功。
    - `the quantity box stops at the gold and the stack`：金幣 450、擁有 0 → `runeBuyMax` 4；金幣 10000、擁有 97（袋子 90＋鑲嵌 7）→ 2；`runeSellMax` 是袋子的 90。
    - `selling pays by tier and leaves the stack tidy`：擴散（魔法）3 個賣 2 → +120 G、剩 1；賣完 → 鍵消失；`qty` 0、1.5、−1 → `invalid`。
    - `socketed runes are not for sale`：袋子 0、鑲嵌 1 → `sellRunes(…, 1)` 為 `stock`。
  - `engine/game.test.ts`：`runes are traded in town only`（`map`、`battle` → `phase`；`town` 成功並存檔）。
  - `ui2/scenes/shop.test.ts`：`the rune list shows the stock and the bag`：開放的存檔、袋子有稀有階彈射 1 → 清單有四行店裡的符文（「擴散（普通）」右欄「100 G」）、一行「彈射（稀有）」右欄「收購 150 G　持有 1」；諾艾兒另鑲嵌一個稀有彈射 → 右欄「持有 2」、說明欄有「袋子 1」與「其中 1 個鑲嵌中，先拆下才能賣或合成」；選擴散 → 數量框上限等於 `runeBuyMax`；沒開放 → 第一行是「打倒第一位頭目之後才有符文」且不能選。
  - e2e `the shop sells and buys runes (plan 8f)`：`localStorage` 放一份開放了符文、金幣 500、袋子 `bounce@rare: 1` 的存檔；道具店 →「符文」→ 買一個擴散（金幣 400）、賣掉彈射（金幣 550）；390 與 1280 寬清單每一列 `scrollWidth <= clientWidth`；沒有 console 錯誤、沒有 404 圖片請求。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/runeTrade.test.ts src/scripts/games/starlantern/engine/game.test.ts src/scripts/games/starlantern/ui2/scenes/shop.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-4`，against `gate-3`；1280 與 390 截圖存 scratchpad 附在報告）。
- [ ] **Step 6：commit**：`feat(starlantern): Orik sells four common runes and buys any rune back`。

### Task 5: 鍛造屋：符文合成

**Files:**
- Modify：`engine/runeTrade.ts`（Task 4 建的檔，加合成）、`engine/game.ts`（`fuseRune`）、`ui2/scenes/forge.ts`（`FORGE_TABS` 加第六個分頁 `runes`「符文合成」）、`data/text.zh-TW.ts`（`T.ui2.forge.tabs.runes`、`T.rune.fuseLine`「3 個{名稱}（{階}）＋{g} G＋{精華} → {名稱}（{高一階}）」、`T.rune.fail.top`「這一階不能再合成」、`T.rune.fail.essence(name)`「缺少{精華名稱}」）
- Modify（會紅的既有測試）：`ui2/scenes/forge.test.ts` 裡斷言鍛造屋只有五個分頁的地方；`tests/e2e/starlantern.spec.ts` 的鍛造屋版面檢查：`pages` 清單（約 1867 行）加 `['runes', []]`，重疊巡檢（約 1937 行起的 `tab(…)`／`walk(…)` 序列）加一次 `await tab('runes'); await whole('runes'); await walk('runes'); await back();`（存檔裡要有一種可合成的符文，讓清單不是空的）。
- Test：`engine/runeTrade.test.ts`、`engine/game.test.ts`、`ui2/scenes/forge.test.ts`、`tests/e2e/starlantern.spec.ts`

**Interfaces:**
- Consumes：Task 1 的 `RUNE_FUSE`、`RUNE_STACK`；`MATERIALS` 的精華名稱；`addItem`。
- Produces（`engine/runeTrade.ts`）：
  - `export function fuseCostOf(r: RuneRef): { to: RuneRef; gold: number; essence: string } | undefined`：史詩、傳說 → undefined。
  - `export function fuseRunes(s: GameState, r: RuneRef): { ok: true; state: GameState; made: RuneRef } | { ok: false; reason: RuneTradeFail | 'top' }`：`fuseCostOf` 沒有 → `top`；袋子不到 3 → `stock`；金幣不夠 → `gold`；精華不夠 → `essence`（設計者裁定：說得出缺哪一種精華，不和「符文不夠」混在一起）；高一階的總數已 99 → `full`；成功：袋子 −3、金幣與精華扣掉、高一階 +1。不需要 `runesOpen`（有符文就能合）。不抽亂數、不碰 `forgeDraws`。
- Produces（`engine/game.ts`）：`fuseRune(r)`：走 `forgeAct`（城鎮以外 `'phase'`，裁定 14）、成功存檔。
- 畫面（最小版）：分頁「符文合成」列出袋子裡每一種「同名同階 ≥ 1 個、而且能再合成」的符文，一列一種：左邊「擴散（普通）　持有 4」（`ownedCount`），說明欄是 `T.rune.fuseLine`、「袋子 m」、有鑲嵌中時 `T.rune.socketedNote`、高一階的一句話；不到 3 個（看袋子）、缺錢、缺精華的列變灰並在右欄寫原因（`stock`、`gold`、`essence` 會寫出精華名稱）。按下 → 兩段確認（照鍛造屋其他分頁的做法）→ 合成。袋子沒有可合的符文時，頁面一行說明 `T.rune.fuseEmpty`「三個同名同階的符文可以合成高一階」。
- [ ] **Step 1：先寫失敗的測試**
  - `engine/runeTrade.test.ts`：
    - `three of a kind make one of the next tier`：擴散（普通）4、金幣 100、`essence-common` 2 → 成功：擴散（普通）1、擴散（魔法）1、金幣 70、精華 1；稀有 → 史詩付 200 G 與 `essence-rare`。
    - `fusion refuses with a reason`：史詩、傳說 → `top`；2 個 → `stock`；缺錢 → `gold`；缺精華 → `essence`；高一階已 99 → `full`；每一種失敗都不改存檔。
    - `fusion takes from the bag only`：袋子 2、鑲嵌 1 → `stock`。
    - `fusion draws nothing`：`forgeDraws` 與 `forgeSalt` 不變；同一個存檔合兩次結果相同。
  - `engine/game.test.ts`：`runes are fused in town only`（`map` → `phase`；`town` 成功並存檔）。
  - `ui2/scenes/forge.test.ts`：`the rune tab lists what can be fused`：袋子擴散（普通）3、彈射（魔法）1、雙重詠唱（傳說）1、精華足夠 → 兩列（擴散、彈射；傳說不列），彈射那列灰、右欄「袋子裡沒有這麼多」；精華用完時擴散那列灰、右欄「缺少普通精華」；擴散那列說明是「3 個擴散（普通）＋30 G＋普通精華 → 擴散（魔法）」。
  - e2e `the forge fuses three runes into one (plan 8f)`：存檔帶擴散（普通）3、金幣 100、普通精華 1 → 鍛造屋「符文合成」→ 合成 → 擴散（魔法）1、金幣 70；390 寬不溢出；沒有 console 錯誤。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/runeTrade.test.ts src/scripts/games/starlantern/engine/game.test.ts src/scripts/games/starlantern/ui2/scenes/forge.test.ts`。
- [ ] **Step 3：實作**。
- [ ] **Step 4：確認通過**：Step 2 全綠。
- [ ] **Step 5：收尾 G**（`gate-5`，against `gate-4`；截圖同 Task 4）。
- [ ] **Step 6：commit**：`feat(starlantern): the forge fuses three runes of a kind into the next tier`。

### Task 6: 守門與整體驗收

**Files:**
- Create：`engine/runeEconomy.guard.test.ts`
- Test：`engine/runeEconomy.guard.test.ts`

**Interfaces:**
- Consumes：Task 1–5 全部。
- [ ] **Step 1：先寫測試**（`engine/runeEconomy.guard.test.ts`）
  - `the sim never meets a rune drop`：`engine/sim.ts`、`engine/parity.ts`、`engine/balance*.test.ts` 的原始碼不含 `runeRng`、`spotRuneRng`、`rollRune`、`grantRune`、`runesOpen`（`readFileSync` 掃描）。
  - `only the rune stream draws for runes`：`engine/loot/runes.ts` 與 `engine/runeTrade.ts` 的原始碼不含 `lootRng`、`memoryRng`、`game.rng`、`this.rng`、`Math.random`；`engine/game.ts` 裡 `rollRune(` 的每一次呼叫，第一個參數都是 `runeRng(` 或 `spotRuneRng(` 建出來的變數（用正則確認同一個函式裡的來源）。
  - `a long run is the same run twice`：同一個種子的 `Game` 走同一串動作（十場戰鬥、兩個寶箱、一個頭目）兩次，最後的 `state.runes`、`state.gold`、`run.runeDraws` 相同。
  - `the economy has no loop`：照裁定 10，再從 `runeTrade` 的函式實際跑一遍：用 `buyRune` 買三個擴散、`fuseRunes`、`sellRunes` 賣掉魔法階，最後金幣少於開始時。
- [ ] **Step 2：執行**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/runeEconomy.guard.test.ts`。任何一條不成立 → 回到負責的任務修（不是改測試）；修不了就停下來回報。
- [ ] **Step 3：整體驗收**：全套全綠、tsc 0、閘門 `gate-6`（against `gate-5`，必須 `identical`）、再跑 `gate-6final` against 8d 最終閘門 `plan8d-tree-rework/gate-10`（必須 `identical`，並 `cmp` 它的 `contribution.json` 與 `contribution.8d-final.160.json`）、`PARITY_CLOSEOUT=1 rtk proxy npx vitest run --testTimeout=3000000 src/scripts/games/starlantern/engine/parity.test.ts` 全綠、e2e 全綠。報告列出本計畫每一個偏離 spec 的地方與根據（裁定 1 的頭目一般符文用菁英列與固定的傳說機率、裁定 2–9、11–14）。
- [ ] **Step 4：commit**：`test(starlantern): rune economy guards — the sim never meets it, its stream draws alone, no money loop`。

---

## 交給之後計畫的介面（摘要）
- **第 ⑦ 步（技能工坊與預覽）**：首次教學用 ⑦ 自己的 `runeTutorialSeen` 旗標（裁定 6，不看 `runesOpen`）；⑥ 與 ⑦ 一起上線；袋子是 `state.runes`，數量 `bagCount`；工坊裡要不要也放「去道具店／鍛造屋」的捷徑由 ⑦ 決定。
- **第 ⑧ 步（建議 build、符文平衡帶）**：spec §13 的「噩夢假設玩家湊得出魔法階」靠：道具店的四種普通（`RUNE_STOCK`）＋合成（`RUNE_FUSE`）；量的時候用 8e 的 `Lineup.runes`，不經過掉落。
- **難度地城（之後的專案）**：`runeTierWeights` 的 `difficultyMul`。
