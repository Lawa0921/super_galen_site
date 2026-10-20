# 星燈迷宮 計畫 5g：史詩與星輝（更多裝備稀有度） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一個稀有度「史詩」（`epic`，紫色，介於稀有與傳說之間），以及傳說級掉落的變體「星輝」（`starlit`，詞綴全滿＋多一條、青白星光外觀）。兩者在所有依稀有度分支的地方都有正確行為，平衡帶全部維持在凍結的門檻內，舊存檔原樣讀入，沒有美術時優雅退回、不放任何佔位圖。

**Architecture:**
- **史詩是一個真正的 `Rarity`**，從現有的「稀有」權重切出一份（`EPIC_SHARE`），排在 `rollTier` 的 rare 與 legendaryTier 之間。仍然是同一次 `rng()`，而且累積邊界只在原本 rare 區段的尾端移動，所以原本抽到 common／magic／legendaryTier 的每一次，結果完全不變。
- **星輝不是稀有度，是 `ItemInstance` 上的旗標 `starlit?: true`**，只會出現在傳說、獨特、套裝的掉落上。機率由新的加鹽串流決定：`mulberry32(mix(run.seed ^ STARLIT_SALT, item.uid))`，和 `chestHasGear`（`engine/loot/drops.ts:106-108`）一樣是以種子與 uid 為鍵的無狀態雜湊，所以 `game.rng`、`lootRng`、`memoryRng`、`fillRooms` 的 rng 一次都不會多抽，`Run` 也不用新增計數器（不影響存檔）。
- **美術只定義鍵**：外框 `ui-rarity-epic`、光暈 `ui-glow-starlit`。沒發布前不請求任何圖片；史詩用現有的非美術格子樣式（稀有度顏色混色邊框），星輝用文字青白光暈與它本身稀有度的外觀。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、SCSS。

**Spec:** 本文件的「使用者原話」與「設計裁定」兩節就是規格（使用者 2026-10-20 的決定，經控制者轉述）。

> 沒有以 `src/`、`tests/`、`docs/`、`art-factory/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄：`.superpowers/sdd/2026-10-20-starlantern-plan5g-rarity/`。行號是 2026-10-20 在 HEAD `f6c3f5f6` 讀到的，只供定位；動手時一律用內容（函式名、字串）找。

## 控制者裁定（2026-10-20，覆蓋本文中衝突的部分）

與 `2026-10-20-starlantern-plan5d-addendum2.md`（美術幾何的權威）對齊：

1. **星輝美術鍵改名改幾何**：本文所有 `ui-glow-starlit`／`ui:glow-starlit`／`ui/glow-starlit.png`／`art.starlitGlow`／`.slx-rglow-starlit` 一律改為 **`ui-starlit`／`ui:starlit`／`/assets/games/starlantern/ui/starlit.png`／`art.starlitOverlay`／`.slx-rstarlit`**。它是**疊層**（四角四芒星＋稀疏星點），16×16、slice 5，畫在格內、外框之上，不是向格外延伸的 20×20 光暈。
2. **傳說光暈幾何**依補遺 2：16×16、slice 5、格內、圖示下層；border-image 重複用 `repeat`（不是 `round`）。本文若寫 20×20／slice 7／`round`，以補遺 2 為準。
3. **史詩顏色**：外框美術色 `#8a5cff`（補遺 2，洋紅去背限制，色相 250–272°）；UI 文字色可用本文的 `#b36bff`（色相約 271°，深底可讀）。兩者並存，不必相同。
4. `ui-rarity-epic` → `/assets/games/starlantern/ui/rarity-epic.png`、`art.rarityFrame('epic')` 與補遺 2 一致，維持。

## 使用者原話
- 「裝備的稀有度可以有更多種」
- 選項：「加史詩＋星輝」

## 設計裁定（含理由）

### 1. 史詩 `epic`
| 項目 | 值 | 理由 |
|---|---|---|
| 排序 | `RARITIES = ['common','magic','rare','epic','legendary','unique','set']`；`RARITY_RANK` 依此 0–6 | 介於稀有與傳說之間（使用者指定）。`lootFx.bestRarity` 與 `sortBag` 都靠這個順序，不用另外改規則。 |
| 詞綴數 | `AFFIX_COUNT.epic = [4, 5]` | 比稀有（3–4）多一條；傳說是 3 條＋威力。 |
| 擲值下限 | `ROLL_FLOOR.epic = 0.5` | 控制者建議約 0.5；稀有 0.25、傳說 0.5。重調時可往下調（裁定 4）。 |
| 中文 | 「史詩」 | 標籤「鐵劍・史詩」，照 `T.gearLabel`。 |
| 顏色 | `#b36bff`（色相約 269°） | 紫色，和魔法藍 `#6f9cff` 的 RGB 距離約 84（>60），在深色窗底可讀。 |
| 賣價倍率 | `SELL_MUL.epic = 6` | 介於稀有 4 與套裝 8 之間。 |
| 分解 | `DISMANTLE.epic = { 'essence-rare': 2 }` | 不新增精華（新精華要新素材、新圖示、新用途，YAGNI）。價值 60 G，介於稀有（42）與傳說（110）。 |
| 重鑄精華 | `ESSENCE_OF.epic = 'essence-rare'` | 同上；不需要星燈之淚（只有傳說需要，`cost.ts:81`）。 |
| 合成 | **不能合成**：`FUSE_NEXT` 不變（稀有 ×3 仍然直接變傳說），三件史詩合成回 `invalid` | 改成「稀有→史詩→傳說」會讓合成傳說的門檻變 3 倍，是使用者沒要求的削弱；`economy.test.ts` 的價值不變式也不用重算。史詩和獨特、套裝一樣只能分解或賣。（見回報的「開放問題」1。） |
| 自動垃圾 | 永遠不標（`JUNK_AT` 不變） | 和傳說同等珍貴。 |
| 鍛造的「珍貴」確認 | 史詩算珍貴（`ui2/scenes/forge.ts:120`） | 分解前警告文字加上史詩。 |

### 2. 星輝 `starlit`
- **模型：`ItemInstance.starlit?: true`，不是新的 `Rarity`。** 理由：
  1. 星輝不是獨立的物品池：同一件「雙月槍」可以是普通傳說或星輝傳說；它保留特殊物品的威力、套裝與圖鑑身分。做成新 `Rarity` 會讓 `item.rarity === 'legendary'` 的十幾處判斷（威力、`rerollCost` 的星燈之淚、`precious`、`LEGEND` 光柱、圖鑑稀有度）全部要改成「legendary 或 starlit-legendary」，而且失去「是獨特還是套裝」的資訊。
  2. 存檔：舊程式讀新存檔時，未知的欄位會被忽略（`isItem` 不檢查多餘欄位），新的 `Rarity` 值則會讓整份存檔變成 corrupt。旗標是向下相容的。
  3. `SpecialDef.rarity` 的型別是 `'legendary' | 'unique' | 'set'`，保持不動。
- **數值**：每條詞綴都是該物品等級的最大值 `maxValue(key, ilvl) = Math.max(1, Math.round(hi))`（和 `rollValue` 的上限、`rerollRange` 的上限相同）；另外多一條該欄位合法、而且物品上還沒有的詞綴，也是最大值。傳說 3→4 條；獨特、套裝的固定詞綴＋1 條。
- **只出現在掉落**（`rollGear` 的 legendaryTier）：合成的傳說與製作的套裝永遠不是星輝。理由：鍛造的結果由 `forgeRng` 決定、可以重複嘗試；只讓迷宮掉落有星輝，維持「深處、頭目才有」的稀有感。
- **機率表**（`STARLIT_CHANCE`，可被測試暫時改寫的物件，照 `FORCED_GLIMMERS` 的先例）：`starlitChance(source, depth) = Math.min(cap, base + perDepth × (max(1, depth) − 1))`

  | 來源 | 鍵 | base | perDepth | cap | 第 1 層 | 第 10 層 | 封頂於 |
  |---|---|---|---|---|---|---|---|
  | 一般怪物、寶箱 | `drop` | 0.03 | 0.002 | 0.08 | 3% | 4.8% | 第 26 層 |
  | 菁英、寶庫 | `elite` | 0.05 | 0.003 | 0.12 | 5% | 7.7% | 第 24 層 |
  | 頭目（第一件） | `boss` | 0.08 | 0.004 | 0.16 | 8% | 11.6% | 第 21 層 |

  頭目的第二件照 `rollBossGear` 本來就以 `source: 'elite'` 擲，所以用 `elite` 列。這是「傳說級掉落之中」的條件機率。
- **加鹽串流**：`STARLIT_SALT = 0xa54ff53a`（SHA-256 初始值中未被使用的一個；已用的有 `0x6a09e667` RESCUE、`0x3c6ef372` 寶箱、`0x510e527f` MEMORY、`0x9b05688c` GLIMMER、`0x1f83d9ab` ABSORB，另有 FORGE `0x2f6b1d3a`）。每件物品一條串流：第一個數決定是否星輝，之後的數挑多出來的詞綴。`rollGear` 傳入的 `rng` 抽的次數，和沒有星輝時**完全相同**（先照常 `rollItem`，再後處理）。
- **重鑄**：星輝物品的「重抽數值」一律拒絕（`invalid`），介面把那一列停用並說明「星輝詞綴已是最大值」；「換成其他詞綴」（只限傳說）換到的新詞綴也是最大值，而且不抽數值（只抽一次鍵）。理由：「詞綴全滿」是星輝的定義，不能被重鑄降下來。
- **賣價**：`sellPrice × STARLIT_SELL_MUL`（2）。分解與強化和同稀有度相同。
- **名稱**：稀有度字前加「星輝」：「雙月槍・星輝傳說」「餘燼指環・星輝獨特」「焰紋之刃・星輝套裝」。詳情多一行「星輝：所有詞綴皆為最大值，另多一條詞綴」。
- **外觀**：名稱保持原稀有度的顏色（傳說橘、獨特金、套裝綠仍可辨認），加上青白光暈 `#bff6ff`（色相約 188°）。光柱改成青白色、走傳說級的演出；音效是傳說三和弦再加一個高音閃光。排序時，同稀有度的星輝排在前面；一次掉落裡只要有星輝，它就是這次的光柱與音效。

### 3. 掉落權重（史詩從稀有切出來）
- `rarityWeights` 照現在算完 `rare`（含狀況倍率、寶箱 ×1.5、菁英 ×3），再切：`epic = rare × EPIC_SHARE[source]`，`rare -= epic`。頭目：`rare = (1 − p)` 之後同樣切。
- 起始值 `EPIC_SHARE = { monster: 0.2, chest: 0.2, elite: 0.3, vault: 0.3, boss: 0.3 }`（重調可改，見裁定 4）。
- `rollTier` 的順序：`['common', 'magic', 'rare', 'epic', 'legendaryTier']`。因為 epic 緊接在縮小後的 rare 後面，每一個累積邊界都不動，只有原本落在 rare 區段最後 `EPIC_SHARE` 比例的那些抽籤變成 epic（Task 2 有逐抽比對的測試）。
- 狀況（`CONDITIONS.rarityMul`）乘在切之前，所以豐收、兇暴照比例提高史詩。

### 4. 平衡（凍結，只准收緊）
- `engine/sim.ts` 的 `kitParty`（`sim.ts:93-113`）用 `rarityWeights('monster', …, 'plain')` 與 `rollTier`，而且把 legendaryTier 當成 rare（`sim.ts:104`）。所以：
  - **史詩會進入模擬**（第 10、10 記憶期望、19a、19b 項的隨機配裝），必須重調。
  - **星輝不會進入模擬**：它只附在 legendaryTier 上，而模擬把 legendaryTier 換成 rare，且 `kitParty` 不呼叫 `rollGear`。星輝機率不是平衡旋鈕；Task 3 有守門測試保證 `sim.ts` 不會開始用到它。
- 門檻一律不放寬。第 10 項（記憶期望）本道第 8 層的下限 .094（使用者 2026-10-19 核准，`balance.test.ts:147`）目前量到約 .0946，餘裕只有 .0006，最可能被史詩推過線。
- 重調旋鈕，**依序**使用，前一個用盡才用下一個（Task 2 Step 6）：
  1. `EPIC_SHARE.monster` 與 `EPIC_SHARE.chest`（兩者同值）：0.2 → 0.15 → 0.10 → 0.05。只有 monster 進入模擬；elite／vault／boss 不影響任何平衡帶，維持起始值。
  2. `ROLL_FLOOR.epic`：0.5 → 0.45 → 0.40（必須 > 稀有的 0.25）。
  3. `AFFIX_COUNT.epic`：`[4, 5]` → `[4, 4]`。
  4. `AFFIX_SCALE`（`data/gear.ts:15`，全部裝備共用）：**不自行調整**。走到這一步就停下來回報 NEEDS_CONTEXT，附上每一組試過的設定與每個平衡帶的數字。理由：它會移動所有裝備的數值，`engine/game.test.ts` 的「two elite fights pay the gear recorded before the memory rng existed」這類寫死的回歸紀錄都會變，重錄它們等於改測試的用意，需要控制者決定。
- 只對預設配點量（記憶「星燈迷宮必須配點」）。

### 5. 存檔
- `SAVE_VERSION` 維持 8，**不升版**。`loadGame` 沒有任何遷移：版本不同直接回 `version`（`engine/save.ts:171`）。新增的只有一個新的 `Rarity` 值與一個可省略的旗標，舊存檔裡都沒有，所以原樣讀入。
- `isItem`（`engine/save.ts:63-71`）：`epic` 經由 `RARITIES` 自動被接受；新增一條規則：`starlit` 存在時必須是 `true`，而且物品的稀有度在 `STARLIT_RARITIES` 內、帶有 `special`，否則整份存檔 corrupt。
- 已知限制（不處理，記在交接）：新存檔被**更舊的部署**讀到時，史詩物品會讓它判成 corrupt（舊程式的 `RARITIES` 沒有 epic，而且會把原檔備份到 `BACKUP_KEY`）。升版也解決不了這件事。

### 6. 美術鍵契約（交給美術計畫；本計畫不畫任何東西）
沿用 5d 的命名（`contract.md:127-128`、5d Task 5／6），不另立 `frame-epic` 之類的新命名：

| 登錄表 id | runtime 路徑 | 規格 | 執行期掛鉤 |
|---|---|---|---|
| `ui-rarity-epic` | `/assets/games/starlantern/ui/rarity-epic.png` | 九宮格 16×16、slice 5、中央透明，紫色細框（同其他稀有度外框） | `art.rarityFrame('epic')`；CSS `.slx-rframe-epic`（5d Task 6 的 `@each` 走 `FRAMED_RARITIES`，自動含 epic）；`NO_ICON_YET` 鍵 `ui:rarity-epic` |
| `ui-glow-starlit` | `/assets/games/starlantern/ui/glow-starlit.png` | 九宮格 20×20、slice 7、中央透明，青白硬邊階梯色帶（同 `glow-legendary` 的做法，換色） | `art.starlitGlow`；CSS `.slx-rglow.slx-rglow-starlit`；`NO_ICON_YET` 鍵 `ui:glow-starlit` |

**沒有美術時的退回（確切行為）**
- **史詩**：沒有 `.slx-rframe`，格子沿用現在所有稀有度共用的非美術樣式：`[class*='slx-rarity-']` 的 `currentColor` 混色邊框與底色（`_starlantern-ui.scss:688-691`；5d 之後是 `:not(:has(.slx-rframe))` 那條），顏色是史詩紫，加上名稱的「史詩」二字。**不借用**稀有的黃框或傳說的橘框：顏色是稀有度的主要提示，借框等於告訴玩家錯的稀有度。
- **星輝**：它本身稀有度的外觀照舊（5d 之後就是該稀有度的外框，加上傳說光暈 `glow-legendary`，若已發布）；`glow-starlit` 發布後改用 `.slx-rglow-starlit` 取代傳說光暈。名稱文字一律加 `.slx-starlit` 的青白 `text-shadow`。這是文字樣式，不是外框；不用 CSS、`box-shadow`、`::before`／`::after` 畫任何框或光圈。
- 沒發布的圖不會被請求：所有外框與光暈的 `<span>` 只有在 `ctx.art.has(url)` 為真時才建立（5d Task 6 的規則），而 `url` 不在 `allArtUrls()` 之前，`art.has` 永遠為假。

---

## Global Constraints

**使用者的方向（最高依據）**
- 「裝備的稀有度可以有更多種」；選擇「加史詩＋星輝」。
- 平衡以預設配點為準。

**分支與基準**
- `feat/starlantern-story`，基準 HEAD `f6c3f5f6`（或之後）。開工前 `git status`：`engine/balance*.test.ts`、`engine/sim.ts`、`data/story/chains.ts`、`engine/story/expect.ts` 若有別人未提交的修改，停下來回報 NEEDS_CONTEXT。
- 工作樹裡別人未提交的檔（例如 5d 的美術工作檔、`art-factory/starlantern/work/`）一律不碰、不 add。
- 若開工時 `engine/balance.bond.test.ts`（計畫 6d）存在，平衡指令要把它一起跑；before 與 after 必須在同一個基底上量。

**測試與檢查**
- TDD：每個任務先寫失敗的測試，確認它因為正確的理由失敗，再實作。
- 單檔或數檔：`rtk proxy npx vitest run --testTimeout=20000 <檔案…>`（路徑寫完整，例如 `src/scripts/games/starlantern/engine/loot/drops.test.ts`）。
- 全套：`rtk proxy npx vitest run --testTimeout=20000`。要讀「Test Files」與「Tests」兩行。不可以用 `npm run test`（watch 模式會卡住）。
- 平衡（Git Bash 語法）：`BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.test.ts src/scripts/games/starlantern/engine/balance.lineups.test.ts src/scripts/games/starlantern/engine/balance.deep.test.ts src/scripts/games/starlantern/engine/balance.pace.test.ts --testTimeout=300000`。一次只跑一套重的測試。
- tsc：`rtk proxy npx tsc --noEmit -p .`。repo 原本有 43 個錯誤（astro:content、bomber、tetris、hp-click）；完成條件是 starlantern 與 `tests/e2e/starlantern.spec.ts` 底下 0 個錯誤。
- e2e：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。只用 4352；不用 4321、4354。headless、`--mute-audio`，不接管使用者桌面。
- 本專案沒有 prettier、eslint，不要跑。

**換行（逐檔保留）**
- 改檔前用 `git ls-files --eol <檔案>` 確認；改完看 `git diff --stat`，整檔被改寫就是換行壞了，要修。CRLF 檔不可以用 `sed -i`。新檔一律 LF。
- 2026-10-20 量到的（本計畫會碰的檔）：
  - LF：`data/gear.ts`、`data/gear.test.ts`、`data/forge.ts`、`data/forge.test.ts`、`engine/loot/item.ts`、`engine/loot/item.test.ts`、`engine/loot/drops.ts`、`engine/loot/drops.test.ts`、`engine/loot/bag.ts`、`engine/loot/bag.test.ts`、`engine/forge/cost.ts`、`engine/forge/forge.ts`、`engine/forge/forge.test.ts`、`engine/forge/uses.ts`、`engine/forge/uses.test.ts`、`engine/compare.ts`、`engine/compare.test.ts`、`engine/sim.test.ts`、`audio/SoundManager.test.ts`、`ui2/loot.ts`、`ui2/lootFx.ts`、`ui2/lootFx.test.ts`、`ui2/rarity.test.ts`、`ui2/scenes/equip.ts`、`ui2/scenes/equip.test.ts`、`ui2/scenes/event.ts`、`ui2/scenes/forge.ts`、`ui2/scenes/statusTabs.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`
  - CRLF：`engine/types.ts`、`engine/save.ts`、`engine/game.test.ts`、`render/artPaths.ts`、`render/artPaths.test.ts`（有 1 行 LF，照原樣）、`ui2/scenes/shop.ts`、`art-factory/starlantern/contract.md`
  - **混用**（每一行照原本的格式，新增的行跟著上下文那幾行）：`data/text.zh-TW.ts`、`engine/game.ts`、`audio/SoundManager.ts`、`ui2/scenes/battle.ts`、`ui2/scenes/forge.test.ts`、`engine/save.test.ts`

**git**
- 一律寫出完整路徑 add，不可以 `git add -A`／`git add .`。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 絕對不可以執行 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`；要撤回就再改一次檔案。不 push；不碰 `.env`、合約、`public/`、`art-factory/` 底下除了 `contract.md` 以外的檔案。

**亂數**：不可以呼叫 `Math.random`。不可以從 `game.rng`、`lootRng`、`memoryRng`、`fillRooms` 的 rng 多抽任何一次。星輝只用 `STARLIT_SALT` 串流。

**平衡**：不改 `engine/sim.ts`、任何 `engine/balance*.test.ts`、敵人與技能數值、任何門檻。`it.fails`、`it.skip`、`.only`、`.todo` 不可以出現在 commit。重調只用裁定 4 的旋鈕、依序。

**介面**：SCSS 禁 `!important`；禁行內樣式（含 `element.style`）。不新增任何圖片、假圖示，不用 CSS 畫外框或形狀。`allArtUrls()` 的數量不變（`artPaths.test.ts` 目前釘 246）。介面文字只放 `data/text.zh-TW.ts`，繁體中文、全形標點。

**子代理**：實作者不派子代理。

**測試修改規則**：某任務會弄壞的既有測試，都列在該任務的 Files 與步驟裡，寫明怎麼改。全套跑出沒列到的紅燈，先停下來回報 NEEDS_CONTEXT。

## Review Focus
1. **舊存檔原樣讀入，壞的星輝旗標被拒。** 沒有 epic／starlit 的 v8 存檔照舊 `ok`；`starlit: false`、`starlit: 'yes'`、稀有或史詩物品帶 `starlit`、沒有 `special` 的星輝，都是 `corrupt`。測試：Task 4。
2. **星輝不偷抽亂數。** 同一個 `rng` 擲 `rollGear`，有沒有 `seed`（有沒有星輝），之後的下一個數相同；遊戲層的 `game.rng` 呼叫次數、`lootDraws`、`memoryDraws` 不變；同一個（種子、uid）永遠得到同一個結果。測試：Task 3。
3. **每個依稀有度分支的地方都認得 epic 與 starlit。** 以 `RARITIES` 逐一跑：賣價、分解、精華、文字、SCSS 色表、音效、光柱、排序都有值而且不丟錯；`ui2/` 底下沒有任何地方自己拼 `slx-rarity-${…rarity}`（只准 `ui2/loot.ts` 的 `rarityClass`）。測試：Task 1、Task 6、Task 7。
4. **鍛造不能讓星輝變差、不能合成史詩。** 星輝的重抽數值被拒、換詞綴得到最大值；`rerollRange` 是 `[max, max]`；三件史詩合成回 `invalid`；合成與製作的結果永遠不是星輝。測試：Task 5。
5. **沒有美術時不請求圖片、不畫假框。** `allArtUrls()` 不含 `rarity-epic.png`、`glow-starlit.png`；e2e 中沒有對這兩個網址的請求，也沒有 console 錯誤；史詩格子用既有的混色邊框。測試：Task 8、Task 9。

---

## File Structure
- `engine/types.ts`：`Rarity` 加 `'epic'`；`ItemInstance.starlit?: true`（Task 1）。
- `data/gear.ts`：`RARITIES`、`RARITY_RANK`、`AFFIX_COUNT`、`ROLL_FLOOR` 加 epic；`STARLIT_RARITIES`（Task 1）。
- `engine/loot/item.ts`：`SELL_MUL.epic`（Task 1）；`maxValue`、`starlitItem`、`STARLIT_SELL_MUL`、`sellPrice` 的星輝倍率（Task 3）。
- `data/forge.ts`：`ESSENCE_OF.epic`、`DISMANTLE.epic`（Task 1）。
- `data/text.zh-TW.ts`：`RARITY.epic`（Task 1）；`starlitWord`、`T.gear.starlitLine`（Task 6）；`T.ui2.forge.warnPrecious`、`T.ui2.forge.starlitMaxed`（Task 6）。
- `src/styles/_starlantern-ui.scss`：色表加 epic（Task 1）；`$slx-starlit`、`.slx-starlit`、`.slx-line-starlit`（Task 6）；光柱 epic 尺寸與 `.slx-pillar-starlit`（Task 7）。
- `engine/loot/drops.ts`：`Tier` 加 `'epic'`、`EPIC_SHARE`、`rarityWeights`、`rollTier`（Task 2）；`STARLIT_SALT`、`STARLIT_CHANCE`、`starlitChance`、`applyStarlit`、`DropCtx.seed`、`rollGear`（Task 3）。
- `engine/game.ts`：`dropCtx` 帶 `seed: run.seed`（Task 3）。
- `engine/save.ts`：`isItem` 的星輝規則（Task 4）。
- `engine/loot/bag.ts`：`sortBag` 的星輝排序（Task 5）。
- `engine/forge/cost.ts`、`engine/forge/forge.ts`、`engine/forge/uses.ts`：星輝重鑄、史詩的用途（Task 5）。
- `engine/compare.ts`：`ItemLine.kind` 加 `'starlit'`（Task 6）。
- `ui2/loot.ts`：`gearLabel` 的星輝字、`rarityClass`（Task 6）。
- `ui2/scenes/battle.ts`、`equip.ts`、`event.ts`、`forge.ts`、`shop.ts`、`statusTabs.ts`：改用 `rarityClass`；鍛造頁的珍貴判斷與星輝重鑄列（Task 6）。
- `audio/SoundManager.ts`、`ui2/lootFx.ts`：史詩與星輝的音效、光柱、`bestDrop`（Task 7）。
- `render/artPaths.ts`、`art-factory/starlantern/contract.md`：美術鍵（Task 8）。
- `tests/e2e/starlantern.spec.ts`：兩個新測試（Task 9）。

不改：`engine/sim.ts`（`Tier` 加 epic 後，它原本的 `tier === 'legendaryTier' ? 'rare' : tier` 自動把 epic 交給 `rollItem`）、`engine/events.ts`、`data/conditions.ts`、`data/materials.ts`、`engine/forge/craft.ts`、`ui2/scenes/handbook.ts`、`ui2/scenes/gate.ts`、`ui2/scenes/forgeCraft.ts`（它們只碰特殊物品的稀有度或與物品稀有度無關，見回報）。

---

### Task 1: 史詩稀有度進入資料、文字與色表（尚未掉落）

**Files:**
- Modify：`engine/types.ts:77`（`Rarity`）、`engine/types.ts:85-88`（`ItemInstance` 加 `/** Plan 5g: a legendary-tier drop with every affix at its maximum and one more (engine/loot/drops.ts applyStarlit). */ starlit?: true;`）
- Modify：`data/gear.ts:5-9`、`engine/loot/item.ts:12`、`data/forge.ts:6-19`、`data/text.zh-TW.ts:20`、`src/styles/_starlantern-ui.scss:544`
- Modify（會紅的既有測試）：`data/gear.test.ts:77-80`、`ui2/rarity.test.ts:36-37`、`ui2/rarity.test.ts:43`
- Test：`data/gear.test.ts`、`data/forge.test.ts`、`engine/loot/item.test.ts`、`ui2/rarity.test.ts`
- Create：`.superpowers/sdd/2026-10-20-starlantern-plan5g-rarity/balance-before.txt`

**Interfaces:**
- Produces：`Rarity` 含 `'epic'`；`RARITIES`（7 個，epic 在 rare 與 legendary 之間）；`RARITY_RANK.epic = 3`（legendary 4、unique 5、set 6）；`AFFIX_COUNT.epic = [4, 5]`；`ROLL_FLOOR.epic = 0.5`；`export const STARLIT_RARITIES: readonly Rarity[] = ['legendary', 'unique', 'set']`（`data/gear.ts`）；`ItemInstance.starlit?: true`；`T.rarity.epic === '史詩'`；SCSS `$slx-rarity` 的 `epic: #b36bff`。

- [ ] **Step 1：量平衡基準。** 確認「分支與基準」的前提，在目前 HEAD 跑平衡指令，把 `[balance]` 與 `[deep]` 開頭的行排序後存成 `balance-before.txt`，同時記下 Test Files／Tests 兩行與 HEAD。第 10 項（記憶期望）`mainline depth 8 with gear` 的 hpLoss 應約 .0946；不是的話停下來回報，基底不對。
- [ ] **Step 2：先寫失敗的測試**
  - `data/gear.test.ts` 的 `matches the spec constants`：把四行改成新值：`RARITIES` 為 `['common','magic','rare','epic','legendary','unique','set']`；`RARITY_RANK` 為 `{ common: 0, magic: 1, rare: 2, epic: 3, legendary: 4, unique: 5, set: 6 }`；`AFFIX_COUNT` 為 `{ magic: [1, 2], rare: [3, 4], epic: [4, 5], legendary: [3, 3] }`；`ROLL_FLOOR` 為 `{ common: 0, magic: 0, rare: 0.25, epic: 0.5, legendary: 0.5, unique: 0.9, set: 0.75 }`。另加 `expect(STARLIT_RARITIES).toEqual(['legendary', 'unique', 'set'])`。
  - `data/forge.test.ts`：本地的 `RARITIES` 清單（第 13 行）改成從 `./gear` import，讓 `essences cover every rarity…` 自動涵蓋 epic；新增 `it('an epic dismantles into two rare essences and rerolls with a rare essence')`：`DISMANTLE.epic` 等於 `{ 'essence-rare': 2 }`、`ESSENCE_OF.epic` 等於 `'essence-rare'`。
  - `engine/loot/item.test.ts`：本地 `rarities`（第 11 行）加 `'epic'`；`affix counts follow the rarity` 的型別斷言改成 `AFFIX_COUNT[rarity as keyof typeof AFFIX_COUNT]`；第 37 行的 `rarities[seed % 4]` 改成 `rarities[seed % rarities.length]`。新增 `it('every rarity has a sell price, and an epic sells between rare and legendary')`：對 `RARITIES` 每一個（unique、set 帶一個對應的 special）`sellPrice` 是正整數；同一 ilvl 下 rare < epic < legendary；`ilvl 10` 的 epic 等於 `Math.round(30 * 6)`。
  - `ui2/rarity.test.ts`：色表測試的清單加上 `epic`，期望值加 `'b36bff'`（放在 `'ffd84a'` 與 `'ff9a3c'` 之間）；`T.rarity` 的期望加 `epic: '史詩'`。新增 `it('epic is a purple clearly apart from magic blue')`：`hue(colourOf('epic'))` 介於 260 與 290；和 `magic` 的 RGB 距離 > 60；和 `rare`、`legendary` 的距離 > 60。新增 `it('every rarity has a word and a colour')`：對 `RARITIES` 每一個，`T.rarity[r]` 非空、`colourOf(r)` 不丟錯。
- [ ] **Step 3：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/data/gear.test.ts src/scripts/games/starlantern/data/forge.test.ts src/scripts/games/starlantern/engine/loot/item.test.ts src/scripts/games/starlantern/ui2/rarity.test.ts`。預期失敗原因：常數沒有 epic、`STARLIT_RARITIES` 不存在、`no colour for epic`。
- [ ] **Step 4：實作**：照 Interfaces 修改 `types.ts`、`gear.ts`、`item.ts`（`SELL_MUL.epic = 6`）、`data/forge.ts`（`ESSENCE_OF.epic`、`DISMANTLE.epic`）、`text.zh-TW.ts` 的 `RARITY`（照 `RARITIES` 的順序）、SCSS 色表（順序同上）。`item.ts:53` 的 `?? AFFIX_COUNT.rare` 退路保留。
- [ ] **Step 5：確認通過**：Step 3 的指令全綠；`rtk proxy npx tsc --noEmit -p .` 的 starlantern 錯誤為 0（每一個 `Record<Rarity, …>` 都已補上 epic）。
- [ ] **Step 6：平衡不動的檢查**：epic 還不會掉落，所以平衡指令的 `[balance]`／`[deep]` 行排序後必須和 `balance-before.txt` 逐位元相同。不同就停下來回報 BLOCKED。
- [ ] **Step 7：commit**：`feat(starlantern): the epic rarity in data, words and colours`（只 add 上列檔案）。

### Task 2: 史詩掉落（從稀有切出）與平衡重調

**Files:**
- Modify：`engine/loot/drops.ts:10`（`Tier`）、`drops.ts:22-50`（`rarityWeights`、`rollTier`）
- Modify（會紅的既有測試）：`engine/loot/drops.test.ts:12`（`tierOf`）、`:31-37`、`:39-55`、`:65-75`、`:180-188`
- Test：`engine/loot/drops.test.ts`、`engine/sim.test.ts`（不改，只跑）
- Create：`.superpowers/sdd/2026-10-20-starlantern-plan5g-rarity/balance-after.txt`、`retune.md`（每一輪設定與數字）

**Interfaces:**
- Consumes：Task 1 的 `'epic'`。
- Produces：`export type Tier = 'common' | 'magic' | 'rare' | 'epic' | 'legendaryTier'`；`export const EPIC_SHARE: Record<DropSource, number>`（起始 `{ monster: 0.2, chest: 0.2, elite: 0.3, vault: 0.3, boss: 0.3 }`）；`rarityWeights` 回傳含 `epic`；`rollTier` 的順序 `['common','magic','rare','epic','legendaryTier']`。

- [ ] **Step 1：先寫失敗的測試**（`drops.test.ts`）
  - `tierOf` 改成：`r === 'common' || r === 'magic' || r === 'rare' || r === 'epic' ? r : 'legendaryTier'`。
  - `matches the monster formula`：`w.rare + w.epic` ≈ `5.5 * 1.5`；`w.epic` ≈ `5.5 * 1.5 * EPIC_SHARE.monster`；其餘不變。
  - `applies chest, elite, vault and boss adjustments`：rare 的比較都改成 `rare + epic`；頭目兩行改成 `{ common: 0, magic: 0, rare: 0.8 * (1 - EPIC_SHARE.boss), epic: 0.8 * EPIC_SHARE.boss, legendaryTier: 0.2 }` 用 `toBeCloseTo` 逐鍵比；repeat 那行同理（0.9、0.1）。
  - `monster rarity matches rarityWeights at depth 1 and 10`：`total` 與 tier 清單加 `epic`。
  - 第 180–188 行菁英的 tier 統計：`tiers` 物件與 `total` 加 `epic`。
  - 新增 `it('the epic share comes out of rare only, per source')`：對每個 `DropSource`，深度等級 1 與 20，`epic / (rare + epic)` ≈ `EPIC_SHARE[source]`；`common`、`magic`、`legendaryTier` 等於把 `EPIC_SHARE` 全設 0 時的值（測試暫時改寫物件，`finally` 還原）。
  - 新增 `it('bounty and fierce raise epic in proportion')`：`rarityWeights('monster', 10, 'bounty').epic` ≈ `1.5 *` plain 的 epic。
  - 新增 `it('one draw: only a draw that was rare can become epic')`：對 seed 1–20000 與來源 monster、elite、boss，`a = rollTier(mulberry32(s), w)`、`b = rollTier(mulberry32(s), { ...w, rare: w.rare + w.epic, epic: 0 })`；`a === b`，或 `b === 'rare' && a === 'epic'`；並且 `a` 為 epic 的次數 > 0。兩邊各只呼叫一次 `rng`（用一個計數的 rng 包起來，斷言計數都是 1）。
  - 新增 `it('an epic drop has four or five affixes at the epic floor')`：用 `vault` 來源抽 3000 件，epic 物品的詞綴數在 `[4, 5]`，每個值 ≥ `ROLL_FLOOR.epic` 對應的下限。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/loot/drops.test.ts`。預期失敗：`EPIC_SHARE` 不存在、`epic` 為 undefined。
- [ ] **Step 3：實作**：`EPIC_SHARE` 放在 `BOSS_LEGENDARY` 旁邊，註解寫「Plan 5g: the share of the rare weight that rolls epic instead; tuned against balance band 10 (only `monster` reaches the sim)」。`rarityWeights` 的兩個分支在最後切出 epic（裁定 3）。`rollTier` 的 tiers 加 epic。
- [ ] **Step 4：確認通過**：Step 2 的檔加上 `engine/sim.test.ts`、`engine/loot/item.test.ts` 全綠（`kitParty draw order` 用同一個公式，不需要改）。
- [ ] **Step 5：量平衡**：跑平衡指令，排序後存成 `balance-after.txt`，和 `balance-before.txt` 逐行對照，寫進 `retune.md`（設定、Test Files／Tests、每一個不同的行）。全部斷言通過（沒有 soft failure）就跳到 Step 7。
- [ ] **Step 6：重調（只在 Step 5 有斷言失敗時）**：照裁定 4 的順序一次只改一個旋鈕、一次一格，每改一次重跑平衡指令、記進 `retune.md`，直到全部通過。旋鈕 1–3 都用盡仍有失敗，停下來回報 NEEDS_CONTEXT（附 `retune.md`），不可以碰 `AFFIX_SCALE`、不可以放寬門檻。改了 `ROLL_FLOOR.epic` 或 `AFFIX_COUNT.epic`，Task 1 的 `gear.test.ts` 期望值與本任務 Step 1 的最後一個測試一起改成新值。
- [ ] **Step 7：全套**：`rtk proxy npx vitest run --testTimeout=20000` 全綠；`tsc` starlantern 0 錯。例外只有一種：某個固定種子的測試原本釘住一件「稀有」掉落，而那一抽正好落在被切出的區段、現在是「史詩」（可用 Step 1 的逐抽比對確認）。這是設計上的改變：只改那個釘住的稀有度與它的詞綴字面值，在 commit 內文逐一列出（測試名、舊值→新值）。其他任何紅燈照「測試修改規則」停下來回報。
- [ ] **Step 8：commit**：`feat(starlantern): epic drops carved from the rare weight, bands held`（訊息內文寫最後的 `EPIC_SHARE`、`ROLL_FLOOR.epic`、`AFFIX_COUNT.epic`，以及第 10 項記憶期望本道第 8 層的 before→after）。

### Task 3: 星輝：加鹽串流、詞綴全滿、只在掉落

**Files:**
- Modify：`engine/loot/item.ts`（`maxValue`、`starlitItem`、`STARLIT_SELL_MUL`、`sellPrice`）、`engine/loot/drops.ts`（`DropCtx`、`STARLIT_*`、`applyStarlit`、`rollGear`）、`engine/game.ts:690-693`（`dropCtx`）
- Test：`engine/loot/item.test.ts`、`engine/loot/drops.test.ts`、`engine/game.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `STARLIT_RARITIES`、`ItemInstance.starlit`；`mix`（`drops.ts:91-98`）、`mulberry32`、`pick`。
- Produces：
  - `item.ts`：`export function maxValue(key: AnyStat, ilvl: number): number`（`Math.max(1, Math.round(affixRange(key, ilvl)[1]))`）；`export function starlitItem(it: ItemInstance, rng: Rng): ItemInstance`（新物件：每條詞綴換成 `maxValue`，再加一條 `AFFIXES` 中該欄位合法、物品上沒有的詞綴，鍵用 `pick(rng, 候選)`，候選依 `Object.keys(AFFIXES)` 的順序；沒有候選就不加；`starlit: true`；不改 uid、base、rarity、ilvl、special、enhance）；`export const STARLIT_SELL_MUL = 2`；`sellPrice` 乘上它（`it.starlit` 時）。
  - `drops.ts`：`DropCtx` 加 `/** The run seed: keys the starlit stream (plan 5g). Without it nothing is ever starlit. */ seed?: number`；`export const STARLIT_SALT = 0xa54ff53a`；`export const STARLIT_CHANCE: Record<'drop' | 'elite' | 'boss', { base: number; perDepth: number; cap: number }>`（裁定 2 的表，物件可被測試暫時改寫）；`export function starlitChance(source: DropSource, depth: number): number`（monster、chest → `drop`；elite、vault → `elite`；boss → `boss`）；`export function applyStarlit(it: ItemInstance, ctx: Pick<DropCtx, 'seed' | 'source' | 'depth'>): ItemInstance`（`seed` 未給、或 `it.rarity` 不在 `STARLIT_RARITIES` → 原物件；否則 `r = mulberry32(mix(ctx.seed ^ STARLIT_SALT, it.uid))`，`r() < starlitChance(...)` 時回傳 `starlitItem(it, r)`）。
  - `rollGear`：legendaryTier 分支在 `rollItem` 之後回傳 `applyStarlit(item, ctx)`；其他分支不呼叫它。
  - `game.ts` 的 `dropCtx`：加 `seed: run.seed`。

- [ ] **Step 1：先寫失敗的測試**
  - `item.test.ts`：
    - `maxValue is the top of the roll range`：對每個 `AFFIXES` 鍵與 ilvl 1、25、50，`maxValue` 等於 `rollValue` 在 rng 恆回 `0.999999` 時的值，且 ≥ 任何 seed 的 `rollValue`。
    - `a starlit item has every affix at max and one more`：對每個 `SPECIALS`（ilvl 30，`rollItem` 後 `starlitItem(it, mulberry32(9))`）：詞綴數 = 原本 + 1（候選非空時）；每個值 = `maxValue`；前面的鍵順序與原本相同；新鍵合法且不重複；`starlit === true`；`uid`、`special`、`rarity` 不變。
    - `starlitItem leaves its input alone and is deterministic`：輸入物件沒有被改；同一個 rng 種子兩次結果 `toEqual`。
    - `a starlit piece sells for twice its rarity`：同一件物品 `sellPrice({ ...it, starlit: true }) === 2 * sellPrice(it)`。
  - `drops.test.ts`：
    - `the starlit chance table`：`starlitChance('monster', 1) === 0.03`、`('chest', 10)` ≈ 0.048、`('monster', 40) === 0.08`、`('vault', 1) === 0.05`、`('elite', 10)` ≈ 0.077、`('boss', 1) === 0.08`、`('boss', 10)` ≈ 0.116、`('boss', 30) === 0.16`；深度 0 與 1 相同。
    - `applyStarlit is keyed by seed and uid only`：同一個 `(seed, uid)` 結果相同；`seed` 未給時永遠回傳同一個物件（`toBe`）；稀有、史詩、魔法物品即使 `STARLIT_CHANCE` 被暫時設成 1 也不變。
    - `applyStarlit hits its chance`：一件傳說物品，uid 1–20000，`seed = 12345`，`source: 'boss', depth: 10`，星輝的比例和 `starlitChance('boss', 10)` 相差 < `tol(p)`。
    - `the starlit stream takes no draw from the loot rng`：seed 1–2000、`source: 'boss'`：`a = mulberry32(s)`、`b = mulberry32(s)`；`rollGear(a, ctxFor({ source: 'boss', seed: 777 }))` 與 `rollGear(b, ctxFor({ source: 'boss' }))`；之後 `a() === b()`；兩件物品去掉 `affixes` 與 `starlit` 後 `toEqual`；至少有一件是星輝（必要時在測試內把 `STARLIT_CHANCE.boss` 暫時設成 `{ base: 0.5, perDepth: 0, cap: 0.5 }`，`finally` 還原）。
    - `only labyrinth drops are starlit: rollItem alone never is`：`rollItem` 的結果沒有 `starlit` 鍵。
  - `game.test.ts`（照第 863 行用 `vi.mocked(rollBossGear)` 的寫法）：
    - `labyrinth drops carry the run seed for the starlit stream`：打倒一個頭目後，`vi.mocked(rollBossGear).mock.calls.at(-1)![1]` 符合 `{ seed: g.run!.seed }`。
    - `a starlit boss drop takes no draw from game.rng, lootRng or memoryRng`：照第 2644 行的計數 rng 寫法打兩次同一個頭目戰（同種子），一次把 `BOSS_LEGENDARY.first` 暫時設 1、`STARLIT_CHANCE.boss` 設 `{ base: 1, perDepth: 0, cap: 1 }`，另一次只設 `BOSS_LEGENDARY.first = 1`、`STARLIT_CHANCE.boss` 設全 0（`finally` 全部還原）。斷言：第一次 `end.gear[0].starlit === true`、第二次沒有；兩次的 `game.rng` 呼叫數、`lootDraws` 增量、`memoryDraws` 增量相同。
    - 既有的 `gear randomness does not touch game.rng` 不改，必須維持綠。
  - 守門（`drops.test.ts`）：`it('the sim never reaches the starlit stream')`：讀 `engine/sim.ts` 原始碼，不含 `applyStarlit`、`rollGear`、`STARLIT`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/loot/item.test.ts src/scripts/games/starlantern/engine/loot/drops.test.ts src/scripts/games/starlantern/engine/game.test.ts`。預期失敗：`maxValue`／`starlitItem`／`applyStarlit` 不存在、`seed` 不在 drop ctx。
- [ ] **Step 3：實作**：照 Interfaces。`game.ts` 是混用換行，只改 `dropCtx` 那一行，照該行原本的換行。
- [ ] **Step 4：確認通過**：Step 2 的指令全綠，再加 `engine/sim.test.ts`、`engine/forge/economy.test.ts`。
- [ ] **Step 5：平衡不動的檢查**：平衡指令排序後和 Task 2 最後的 `balance-after.txt` 逐位元相同（星輝不進模擬）。不同就停下來回報 BLOCKED。
- [ ] **Step 6：commit**：`feat(starlantern): starlit legendary-tier drops from their own salted stream`。

### Task 4: 存檔：舊檔原樣讀入、星輝旗標驗證

**Files:**
- Modify：`engine/save.ts:63-71`（`isItem`）、`engine/save.ts:4` 的 import 加 `STARLIT_RARITIES`
- Test：`engine/save.test.ts`（混用換行；新增一個 `describe('save v8 epic and starlit gear (plan 5g)', …)` 放在檔尾，新行照最後那個 describe 的換行）

**Interfaces:**
- Consumes：Task 1 的 `STARLIT_RARITIES`。
- Produces：`isItem` 多一條：`v.starlit !== undefined` 時，必須 `v.starlit === true && v.special !== undefined && STARLIT_RARITIES.includes(v.rarity)`，否則 `false`。`SAVE_VERSION` 不變（8）。

- [ ] **Step 1：先寫失敗的測試**
  - `an old v8 save with no epic or starlit gear loads unchanged`：用 `newGame()` 放一件 `plainItem` 與一件傳說 `lg-chizuru`（不帶 `starlit`）進背包，存檔再讀，`toEqual({ status: 'ok', state: g })`；`SAVE_VERSION` 仍是 8。
  - `epic and starlit gear round-trip`：背包放一件 epic（4 條詞綴）、一件星輝傳說、一件星輝套裝（`set-blaze-ring`），並讓一位成員穿上一件星輝獨特；存讀後 `toEqual`，`starlit` 保留。
  - `a bad starlit flag makes the save corrupt`：對下列每一種，各自寫入原始 JSON 後 `loadGame(...).status === 'corrupt'`：`starlit: false`；`starlit: 'yes'`；`starlit: 1`；稀有物品帶 `starlit: true`；史詩物品帶 `starlit: true`；傳說物品帶 `starlit: true` 但沒有 `special`。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/save.test.ts`。預期：前兩個通過（epic 已在 `RARITIES`、多餘欄位被忽略），第三個失敗（壞旗標被接受）。
- [ ] **Step 3：實作**：在 `isItem` 的 `junk` 檢查之後加那一條（CRLF 檔）。
- [ ] **Step 4：確認通過**：同一指令全綠，再加 `engine/game.test.ts`。
- [ ] **Step 5：commit**：`feat(starlantern): saves validate the starlit flag; old saves load unchanged`。

### Task 5: 鍛造與背包規則（引擎）

**Files:**
- Modify：`engine/forge/forge.ts:54-81`（`reroll`）、`engine/forge/cost.ts:86-92`（`rerollRange`）、`engine/forge/uses.ts:7-28`、`engine/loot/bag.ts:26-31`（`sortBag`）
- Modify（會紅的既有測試）：`engine/loot/bag.test.ts:44-50`（`all` 改成 `RARITIES`，測試名不變）
- Test：`engine/forge/forge.test.ts`、`engine/forge/uses.test.ts`、`engine/loot/bag.test.ts`

**Interfaces:**
- Consumes：Task 3 的 `maxValue`。
- Produces：
  - `reroll`：在 `affixLocked` 檢查之後，`it.starlit && !o.swap` → `{ ok: false, reason: 'invalid' }`；swap 時新值為 `it.starlit ? maxValue(key, ilvl) : rollValue(...)`（星輝的 swap 只抽一次：鍵）。函式註解的拒絕順序加上這一條。
  - `rerollRange`：星輝回傳 `[max, max]`（`max = maxValue(affix.key, it.ilvl)`）。
  - `uses.ts`：`MaterialUse` 的 `reroll.tier` 型別加 `'epic'`；`const REROLL_TIERS = ['magic', 'rare', 'epic', 'legendary'] as const` 給重鑄迴圈；`const FUSE_TARGETS = ['magic', 'rare', 'legendary'] as const` 給 `fuseSlot` 迴圈（`FUSE_SLOT_COST` 沒有 epic，共用一份清單會讀到 undefined）。
  - `sortBag` 的 rarity 鍵：`-(RARITY_RANK[it.rarity] * 2 + (it.starlit ? 1 : 0))`。

- [ ] **Step 1：先寫失敗的測試**
  - `forge.test.ts`：
    - `a starlit value reroll is refused and changes nothing`：背包一件星輝傳說，`reroll(s, uid, 0, { swap: false })` 回 `{ ok: false, reason: 'invalid' }`；金錢、素材、`forgeDraws` 不變。
    - `a starlit swap lands at the maximum`：同一件，`swap: true`，結果 `after.value === maxValue(after.key, ilvl)`；`forgeDraws` 只加 1。
    - `a starlit unique or set cannot be rerolled at all`：數值與 swap 都回 `invalid`。
    - `three epics do not fuse`：`fuse(s, [三件 epic 的 uid])` 回 `{ ok: false, reason: 'invalid' }`。
    - `fusion and set crafting never make a starlit piece`：合成稀有 ×3 跑 200 個 `forgeSalt`、`craftSet` 跑 50 次，結果沒有 `starlit`。
    - `an epic dismantles into DISMANTLE.epic`。
  - `cost.test.ts`（或 `forge.test.ts` 內）：`rerollRange` 對星輝物品回 `[max, max]`；對同一件非星輝物品照舊。
  - `uses.test.ts`：`it('the rare essence rerolls rare and epic gear')`：`materialUses('essence-rare')` 依序含 `{ kind: 'reroll', tier: 'rare' }` 與 `{ kind: 'reroll', tier: 'epic' }`；`T.forge.use({ kind: 'reroll', tier: 'epic' })` 是 `重鑄史詩裝備`；沒有任何 `fuseSlot` 的 target 是 epic。
  - `bag.test.ts`：
    - `all` 改成 `RARITIES`，期望不變（epic 不會被自動標記）。
    - `epic sorts between rare and legendary; a starlit piece leads its rarity`：背包含 rare、epic、legendary、星輝 legendary、set，`sortBag(bag, 'rarity')` 為 set、星輝 legendary、legendary、epic、rare（同鍵維持原順序）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/engine/forge src/scripts/games/starlantern/engine/loot/bag.test.ts`。
- [ ] **Step 3：實作**：照 Interfaces。
- [ ] **Step 4：確認通過**：同一指令全綠，再加 `engine/town.test.ts`、`ui2/scenes/forge.test.ts`。
- [ ] **Step 5：commit**：`feat(starlantern): forge and bag rules for epic and starlit gear`。

### Task 6: 名稱、顏色與詳情（介面）

**Files:**
- Modify：`ui2/loot.ts`、`engine/compare.ts:12`、`engine/compare.ts:48-59`、`data/text.zh-TW.ts`（`gearLabel` 附近、`T.gear`、`T.ui2.forge.warnPrecious`（約第 416 行）、`T.ui2.forge` 加 `starlitMaxed`）、`src/styles/_starlantern-ui.scss`（第 768 行之後）
- Modify（改用 `rarityClass`）：`ui2/scenes/battle.ts:520`、`ui2/scenes/equip.ts:378`、`:394`、`:453`、`:474`、`ui2/scenes/event.ts:221`、`ui2/scenes/forge.ts:55`、`:127`、`ui2/scenes/shop.ts:209`、`ui2/scenes/statusTabs.ts:220`
- Modify：`ui2/scenes/forge.ts:120`（`precious` 加 epic）、`ui2/scenes/forge.ts:378-392`（星輝的「重抽數值」列停用）
- Test：`ui2/rarity.test.ts`、`engine/compare.test.ts`、`ui2/scenes/equip.test.ts`、`ui2/scenes/forge.test.ts`

**Interfaces:**
- Consumes：Task 1–5。
- Produces：
  - `text.zh-TW.ts`：`starlitWord: (word: string) => \`星輝${word}\``（放在 `gearLabel` 下一行）；`T.gear.starlitLine: '星輝：所有詞綴皆為最大值，另多一條詞綴'`；`T.ui2.forge.starlitMaxed: '星輝詞綴已是最大值'`；`warnPrecious` 改為 `'裡面有史詩、傳說、獨特、套裝、已強化或有重鑄鎖定詞綴的裝備，分解後無法復原。'`。
  - `ui2/loot.ts`：`gearLabel` 的稀有度字在 `it.starlit` 時是 `T.starlitWord(T.rarity[it.rarity])`；`export const rarityClass = (it: Pick<ItemInstance, 'rarity' | 'starlit'>): string`（`slx-rarity-${r}`，星輝時再加 ` slx-starlit`）；`gearPart` 改用它。
  - `compare.ts`：`ItemLine.kind` 加 `'starlit'`；`itemLines` 在詞綴之後、威力之前，星輝物品推一行 `{ kind: 'starlit', text: T.gear.starlitLine }`。`equip.ts` 照既有的 `slx-line-${l.kind}` 畫出，不需要另寫分支；`statusTabs.ts` 只挑 implicit／affix／power，不受影響。
  - SCSS：`$slx-starlit: #bff6ff;`；在傳說光暈規則（第 692–693、767–768 行）之後加 `.slx-starlit, .slx-bag-cell.slx-starlit, .slx-doll-slot.slx-starlit, .slx-gear-drop.slx-starlit, .slx-loot-gear.slx-starlit { text-shadow: 0 0 3px $slx-starlit, 0 0 6px rgba(191, 246, 255, 0.55); }` 與 `.slx-line-starlit { color: $slx-starlit; }`。只有文字樣式，不加 `border`、`box-shadow`、偽元素。
  - 鍛造頁重鑄方法：星輝物品的 `row('value', …)` 變成 `{ id, label, disabled: true, right: F.starlitMaxed, note: F.starlitMaxed }`（照第 382 行停用列的寫法）。

- [ ] **Step 1：先寫失敗的測試**
  - `rarity.test.ts`：
    - `a starlit piece reads 星輝 before its rarity word`：`gearLabel` 對星輝 `lg-chizuru`（`thorn-spear`）回 `'雙月槍・星輝傳說'`，`+2` 時 `'雙月槍 +2・星輝傳說'`；對 epic `iron-sword` 回 `'鐵劍・史詩'`。
    - `rarityClass adds slx-starlit only to starlit gear`。
    - `starlit glows cyan-white, after the legend glow`：SCSS 有 `$slx-starlit: #bff6ff;`，`hue` 介於 180 與 200；`.slx-loot-gear.slx-starlit` 規則出現在 `.slx-loot-gear.slx-rarity-set` 規則之後（`indexOf` 比較）；`.slx-starlit` 相關規則裡沒有 `border`、`box-shadow`、`::before`、`::after`。
    - `only ui2/loot.ts builds a rarity class`：用 `node:fs` 遞迴讀 `src/scripts/games/starlantern/ui2` 下所有非測試 `.ts`，`/slx-rarity-\$\{(it|worn)\.rarity\}/` 只在 `ui2/loot.ts` 出現。
  - `compare.test.ts`：`a starlit piece has a starlit line after its affixes and before its power`；非星輝物品沒有這一行。
  - `equip.test.ts`：`a starlit bag cell carries its rarity class and slx-starlit; the detail shows the starlit line`；`an epic cell carries slx-rarity-epic and reads 史詩 in its label`（`aria-label`）。
  - `forge.test.ts`（UI，混用換行）：`a starlit item's value reroll row is disabled with the starlit note`；`dismantling an epic asks first and warns it is precious`（確認框含新的 `warnPrecious`）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2/rarity.test.ts src/scripts/games/starlantern/engine/compare.test.ts src/scripts/games/starlantern/ui2/scenes/equip.test.ts src/scripts/games/starlantern/ui2/scenes/forge.test.ts`。
- [ ] **Step 3：實作**：照 Interfaces；10 個 class 位置一律改成 `rarityClass(it)`（`forge.ts:55` 的 junk 版本是 `` `${rarityClass(it)} slx-junk` ``；`equip.ts:474` 用 `rarityClass(worn)`）。`forge.ts:522` 的合成結果字（只有稀有度、沒有物品）維持原樣。
- [ ] **Step 4：確認通過**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/ui2 src/scripts/games/starlantern/engine/compare.test.ts` 全綠；`tsc` starlantern 0 錯。
- [ ] **Step 5：commit**：`feat(starlantern): epic and starlit names, colours and detail lines`。

### Task 7: 掉落演出：音效與光柱

**Files:**
- Modify：`audio/SoundManager.ts:119-139`（混用換行）、`ui2/lootFx.ts`、`src/styles/_starlantern-ui.scss:782`、`:809` 附近
- Modify（會紅的既有測試）：無（既有呼叫都還是兩個參數）
- Test：`audio/SoundManager.test.ts`、`ui2/lootFx.test.ts`

**Interfaces:**
- Produces：
  - `loot(rarity: Rarity, delayMs = 0, starlit = false): void`：`case 'epic'`：三個 sine `660`、`990`、`1320`（間隔 110 ms，沒有 noise）；傳說級照舊，`starlit` 時再加 `blip(2093, 640, 'sine', 0.07, undefined, d + 210)` 與第二個 `noise(...)`（`d + 260`）。註解同步更新。
  - `lootFx.ts`：`showPillar(host, rarity, fast, starlit = false)`：星輝時 class 加 `slx-pillar-legend slx-pillar-starlit`、有 burst、計時用 `LEGEND_MS`；`export function bestDrop<T extends { rarity: Rarity; starlit?: true }>(items: readonly T[]): T | null`（星輝優先，其次 `RARITIES` 順序；同級取先出現的）；`bestRarity` 保留（改成 `bestDrop(items)?.rarity ?? null`）；`dropMoment` 的 items 型別改成 `readonly { rarity: Rarity; starlit?: true }[]`，用 `bestDrop`；呼叫音效時**只有星輝才傳第三個參數**：`starlit ? sfx.loot?.(r, LOOT_DELAY_MS, true) : sfx.loot?.(r, LOOT_DELAY_MS)`（既有測試斷言 `toHaveBeenCalledWith('rare', LOOT_DELAY_MS)`）。
  - SCSS：`.slx-pillar.slx-rarity-epic { --slx-pillar-w: 60px; --slx-pillar-h: 168px; }`；`.slx-pillar.slx-pillar-starlit { color: $slx-starlit; }`（兩個 class，勝過 `.slx-rarity-*` 的顏色）。光柱本來就是漸層效果（`_starlantern-ui.scss:773-774` 的既有做法），不是物品或外框圖。

- [ ] **Step 1：先寫失敗的測試**
  - `SoundManager.test.ts`：`an epic chimes three rising notes, no shimmer`（`oscs` 為 `[660, 990, 1320]`、`noises` 0）；`a starlit legend adds a high sparkle and a second shimmer`（三種傳說級各一次，排序後 `[523, 784, 1047, 2093]`、`noises` 2）；靜音時 `loot('epic')`、`loot('legendary', 0, true)` 都不建 context。
  - `lootFx.test.ts`：
    - `a pillar per rarity` 的 cases 加 `['epic', false]`；`fast mode leaves no timers` 的清單加 epic。
    - `a starlit pillar is a legend pillar in star-light`：`showPillar(host, 'unique', false, true)` 有 `slx-pillar-legend`、`slx-pillar-starlit`、burst，`LEGEND_MS` 後移除；`skipPillar(host, 'confirm')` 可以結束它。
    - `bestDrop prefers a starlit piece over any plain one`：`[{ rarity: 'set' }, { rarity: 'legendary', starlit: true }, { rarity: 'epic' }]` → 星輝那件；沒有星輝時 epic 勝 rare、set 勝 epic；空陣列 null。
    - `a starlit drop chimes once with the starlit flag`：`dropMoment` 對含星輝的掉落，`loot` 只被呼叫一次，參數 `('legendary', LOOT_DELAY_MS, true)`，host 有 `.slx-pillar-starlit`。
  - 既有的 `toHaveBeenCalledWith('rare', LOOT_DELAY_MS)` 不改，必須維持綠。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/audio/SoundManager.test.ts src/scripts/games/starlantern/ui2/lootFx.test.ts`。
- [ ] **Step 3：實作**：照 Interfaces（`SoundManager.ts` 新行照 `loot` 方法內原本的換行）。
- [ ] **Step 4：確認通過**：同一指令，再加 `ui2/scenes/battle.test.ts`、`ui2/scenes/dungeon.test.ts`、`ui2/scenes/event.test.ts`。
- [ ] **Step 5：commit**：`feat(starlantern): epic and starlit drop chimes and light pillars`。

### Task 8: 美術鍵契約與執行期掛鉤（不畫任何圖）

**Files:**
- Modify：`render/artPaths.ts`（CRLF）、`art-factory/starlantern/contract.md`（CRLF）
- Test：`render/artPaths.test.ts`（CRLF）

**Read:** `docs/superpowers/plans/2026-10-17-starlantern-plan5d-art.md` 的 Task 5（`art.rarityFrame`、`FramedRarity`、`FRAMED_RARITIES`、`art.rarityGlow`）與 Task 6（`ui2/gearArt.ts` 的 `rarityFrame`）、補遺 S8；`contract.md` 第 115–181 行。

**Interfaces:**
- 先判斷 5d Task 5 是否已經合併：`render/artPaths.ts` 有沒有 `rarityFrame`。
  - **沒有（2026-10-20 的狀態）**：照 5d Task 5 的介面原樣加入 `export type FramedRarity = Exclude<Rarity, 'common'>`、`export const FRAMED_RARITIES: FramedRarity[] = RARITIES.filter((r): r is FramedRarity => r !== 'common')`、`art.rarityFrame(r: FramedRarity)` → `${ART_BASE}/ui/rarity-${r}.png`、`art.rarityGlow` → `${ART_BASE}/ui/glow-legendary.png`，再加 `art.starlitGlow` → `${ART_BASE}/ui/glow-starlit.png`。**不推進 `allArtUrls()`**（數量維持；5d Task 5 推外框時一併處理）。
  - **有**：只加 `art.starlitGlow`；確認 `FRAMED_RARITIES` 由 `RARITIES` 推出（含 epic）；若 5d 已把外框推進 `allArtUrls()`，在 `NO_ICON_YET` 加 `'ui:rarity-epic'`、`'ui:glow-starlit'`，並讓推網址的那段同樣受它們控制。
  - 若 `ui2/gearArt.ts` 已存在（5d Task 6 已合併）：`rarityFrame(art, rarity, starlit = false)`：星輝且 `art.has(art.starlitGlow)` 時用 `<span class="slx-rglow slx-rglow-starlit">` 取代傳說光暈，否則照該稀有度原本的結果；SCSS 加 `.slx-rglow-starlit { border-image: url('/assets/games/starlantern/ui/glow-starlit.png') 7 round; }`；`equip.ts` 的呼叫傳 `it.starlit === true`；測試 `a starlit frame uses the starlit glow only when published`。不存在就不做這一點，交給 5d Task 6（見交接）。
- `contract.md`：在「交給 5f 的東西」之後加一節 `## 計畫 5g：史詩外框與星輝光暈（只定義鍵，尚未生成）`，內容是裁定 6 的兩列表格（同 5d 表的欄位）、退回規則三點、以及給美術計畫的待辦：`gear_art.py` 的 `FRAME_DESC` 加 `epic`（紫色細框）與 `glow-starlit`（青白硬邊階梯光暈，`FRAME_SIZE` 為 `(20, 7)`）、工作表與批次由美術計畫決定、發布時刪 `NO_ICON_YET` 的兩個鍵、經使用者在審核頁核准（補遺 S4）。不改 `gear_art.py`、`registry.json`、`gear-plan.json`。

- [ ] **Step 1：先寫失敗的測試**（`artPaths.test.ts`）
  - `epic frame and starlit glow keys`：`art.rarityFrame('epic') === '/assets/games/starlantern/ui/rarity-epic.png'`；`art.starlitGlow === '/assets/games/starlantern/ui/glow-starlit.png'`；`FRAMED_RARITIES` 為 `['magic', 'rare', 'epic', 'legendary', 'unique', 'set']`。
  - `unpublished frames are never listed`：`allArtUrls()` 不含上面兩個網址；長度等於本檔既有測試釘住的數字（現在 246，不另寫一個數字）。
- [ ] **Step 2：執行，確認失敗**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/render/artPaths.test.ts`（預期 `art.rarityFrame is not a function` 或 `art.starlitGlow` undefined）。
- [ ] **Step 3：實作**：照 Interfaces；`contract.md` 照 CRLF。
- [ ] **Step 4：確認通過**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern/render` 全綠（含 `gearArt.test.ts`、`published.test.ts`）。
- [ ] **Step 5：commit**：`feat(starlantern): art keys for the epic frame and the starlit glow (no art yet)`。

### Task 9: e2e 與收尾驗證

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`（LF）
- Create：`.superpowers/sdd/2026-10-20-starlantern-plan5g-rarity/balance-final.txt`

- [ ] **Step 1：先寫 e2e**（照 `gear drops, comes home and is worn` 與 `a rare chest drop raises a pillar` 的寫法，`setup(page, 7)`、`depart`、`lampHome`、`pathTo`）
  - `epic and starlit gear come home, read their words and survive a save`：在 `run.loot.gear` 放一件 epic `iron-sword`（4 條詞綴）與一件星輝 `lg-chizuru`（`thorn-spear`，4 條詞綴、`starlit: true`），uid 用 `g.mintUid()`；回城對話含 `鐵劍・史詩` 與 `雙月槍・星輝傳說`；裝備頁 `.slx-bag-cell[aria-label="雙月槍・星輝傳說"]` 有 `slx-rarity-legendary` 與 `slx-starlit`、`[aria-label="鐵劍・史詩"]` 有 `slx-rarity-epic` 且計算後的 `color` 是 `rgb(179, 107, 255)`；游標移到星輝那格時詳情有 `.slx-line-starlit`；在旅館存檔、重新整理、繼續，兩件仍在、`starlit === true`、`expectSaveLoaded` 通過。
  - `a starlit chest drop raises a star-light pillar`：照寶箱測試把每個寶箱的 `gearRolls` 換成星輝 `lg-chizuru`；打開後有 `.slx-pillar.slx-pillar-starlit`。
  - 兩個測試都斷言 `w.errors` 為空，並且用 `page.on('request')` 收集網址，沒有任何以 `ui/rarity-epic.png` 或 `ui/glow-starlit.png` 結尾的請求。
- [ ] **Step 2：執行**：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。新測試在 Task 1–8 都完成時應直接通過；若失敗，先確認原因是本計畫的缺漏（回到對應任務修），不是測試寫錯。
- [ ] **Step 3：全套**：`rtk proxy npx vitest run --testTimeout=20000` 全綠（讀 Test Files／Tests 兩行）；`rtk proxy npx tsc --noEmit -p .` starlantern 與 e2e 檔 0 錯。
- [ ] **Step 4：平衡收尾**：平衡指令排序後存 `balance-final.txt`，必須和 Task 2 最後的 `balance-after.txt` 逐位元相同（Task 3–8 不碰模擬路徑）；所有斷言通過。
- [ ] **Step 5：用 grep 自查**：`slx-rarity-\$\{` 在 `ui2/` 只剩 `loot.ts`、`forge.ts` 的合成結果字（`target`）、`handbook.ts`、`gate.ts` 的特殊物品稀有度；`Math.random` 在 starlantern 底下 0 個；`it.skip|it.fails|\.only\(|\.todo\(` 0 個。
- [ ] **Step 6：commit**：`test(starlantern): epic and starlit gear end to end`。

---

## 交接（給後續計畫）
- **5d Task 5／6（美術計畫）**：
  - `FRAMED_RARITIES` 現在有 6 個（含 epic）。5d Task 5 推外框網址進 `allArtUrls()` 時，epic 的外框與 `glow-starlit` 用 `NO_ICON_YET` 的 `ui:rarity-epic`、`ui:glow-starlit` 擋住，直到美術計畫發布。
  - 5d Task 6 的 `rarityFrame(art, rarity)` 改成 `rarityFrame(art, rarity, starlit = false)`（規則見 Task 8 Interfaces 的第三點）；SCSS 的 `@each` 走 `FRAMED_RARITIES`，`.slx-rglow-starlit` 用 `glow-starlit.png`、slice 7。
  - 5d 的審核頁 `review_gear.py` 的 `FRAMED` 清單、`rarity_row` 的稀有度清單之後要加 epic（屬美術計畫）。
- **舊部署讀新存檔**：史詩物品會讓舊程式判 corrupt（裁定 5）。若之後要支援回滾，應在讀檔時把未知稀有度降成 rare，而不是升版。
- **平衡**：星輝不在任何平衡帶內（裁定 4）。若之後讓模擬計入傳說級掉落的數值，星輝要一起進來。
