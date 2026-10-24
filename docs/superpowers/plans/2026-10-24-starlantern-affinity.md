# 星燈迷宮 好感度（羈絆、送禮、選項、後日談、戀愛）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 九位夥伴（凜＋八位）各有一個 0–100 的好感度、五個階段（相識、同行、信賴、羈絆、心契）。四種來源都推得動：記憶碎片、旅館裡羈絆場景的選項、送禮、同隊探索與戰鬥。只刷一種來源到不了頂，好感度永遠不會下降。每升一階就有一段新的羈絆場景，第四段是「心契」；終幕之後每人一段後日談；玩家可以選一位走到戀愛結局，選了就不能改。戰鬥加成是她天生數值的 1–4%，普通難度的 sim gate 逐位元不變。這份計畫合併了舊的 6d（引擎）與 6e（文字）：引擎先做，文字寫好一位才註冊一位，master 上永遠沒有暫定文案。

**Architecture:**
- **好感度是紀錄，不是分數**：`Member.bond` 只存對話分、同隊分、收下的禮物（與婉拒過的素材）。總分由純函式從紀錄與持有的碎片推出；每種來源各有上限。
- **不用任何亂數**：每一分都是已發生事件的純函式。`bond draws nothing` 測試鎖住 `game.rng`、`lootRng`、`memoryRng` 的抽取次數與掉落。
- **戰鬥引擎不改**：「救了她一命」由 `Game.submitRound` 在每回合後判定，`battle.ts` 一行都不動。
- **加成是一個新的屬性來源 `bond`**：模擬的隊伍從來沒有 `bond`，所以普通難度的平衡帶與 sim gate 逐位元不變；加成對真實玩家的影響由新的第 21 項平衡帶量，紅了只能調低 `BOND_PCT`。
- **羈絆不佔任何劇情槽**：羈絆場景由玩家在旅館「夥伴 → 談心」開啟，一天一段；後日談佔既有的回城對話名額；夜晚、清晨、下潛前的那一夜、反應槽、群戲、日曆的春祭一條都不動。
- **一天＝日曆的一天**：送禮、談心的「今天」讀日曆計畫的 `dayOf`。
- **註冊表，不是暫定文案**：羈絆場景、後日談、戀愛、送禮反應、戀愛後的城鎮台詞，都是寫好才註冊（照 L 的 `REACTIONS`）。引擎與介面的測試用注入的表；沒註冊的夥伴不出現在「談心」「送禮」裡。
- **寫作任務**照 L 的 W 步驟做，加全新讀者冷讀與盲聽。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-18-starlantern-affinity-expressions-design.md`（下稱 spec §）。**§0 是 2026-10-24 的定案與決策紀錄，和下文衝突時以 §0 為準。** 另外要讀：
- `docs/superpowers/plans/2026-10-24-starlantern-time-moon.md`（日曆計畫，在 `feat/starlantern-time-moon`；合併之後在 master）：裁定 1（天數）、5（`SCENE_TIME`）、7（春祭）、8（HUD）、12（存檔）；
- `docs/superpowers/specs/2026-10-23-starlantern-story-structure-design.md`（L §）§4、§5、§11；`docs/superpowers/plans/2026-10-23-starlantern-story-structure.md`（L 計畫：格式、收尾 G、W 步驟）；
- `docs/superpowers/specs/2026-10-23-starlantern-story-depth-design.md` §7.5（星燈祭）、§9（閒聊排程）；
- `docs/superpowers/specs/2026-10-23-starlantern-difficulty-design.md` §6（噩夢、地獄的平衡帶）；
- `docs/superpowers/story/starlantern-style-bible.md`（聖經）§2.2–§2.5、§3；`docs/superpowers/story/starlantern-lore-ledger.md`（帳本）I-11、I-20、I-29、I-78、I-88、I-89、I-112、I-113、I-117、I-118、I-121、I-151、I-158 到 I-160、I-195，以及日曆計畫新增的 I-200（春祭）；
- 舊計畫 `docs/superpowers/plans/2026-10-19-starlantern-plan6d-affinity.md`（從未執行）：只當參考，介面以本計畫為準。

**範圍外**：
- 新美術（可選的 Task A 除外，它要使用者看過）；新字級；
- 舊存檔遷移與補值（使用者 2026-10-23：還沒上線）；
- 手冊重看用首播讀法（舊計畫 Task 6.5，spec §0 D17）；
- 改 `epilogue`、終幕、或任何已經寫好的劇情字串（spec §0 D7）；
- 好感度影響戰鬥以外的任何數值（掉落、價錢、經驗）；
- 洛恩與鎮民的好感度。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/`、`art-factory/`、`public/`、`.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄是 `.superpowers/sdd/2026-10-24-starlantern-affinity/`，下稱 SDD。行號只用來定位，動手時一律用內容找。

## 計畫裁定

spec §0 已經定了方向（D1–D20）。這裡只寫 spec 沒寫、由本計畫決定的細節，標「設計者裁定」。

1. **設計者裁定：開工條件與順序**。
   - Task 0、Task 1 只依賴 master，可以先做。
   - **Task 2 起需要日曆計畫已合併進 master**（`engine/calendar.ts` 的 `dayOf`、`MAX_DAY`，`data/story/scenes.ts` 的 `SCENE_TIME`，`SEASON_SCENES`）。開 Task 2 前 `git log origin/master` 找不到日曆計畫的收尾 commit，就停下來回報 NEEDS_CONTEXT，不自己做日曆。
   - 任務依編號順序執行；Task A（美術）和任何任務都不衝突，隨時可以做。
2. **設計者裁定：數值照 spec 的提案**（spec §4、§5、§6.3、§7.2、§13），本計畫不改：`BOND_START 10`、門檻 `0/20/40/60/85`、`BOND_PER_PIECE 3`、`BOND_CAP { talk 12, gift 30, field 40 }`、`BOND_RUN_CAP 4`、同隊 `floor 1 / strong 2 / saved 2`、`DANGER_PCT 30`、`GIFT_VALUE 4/2/1`、`GIFT_REPEAT_FULL 2`、選項 `偏好 3 / 其他 2 / 跳過 2`、`BOND_PCT 0/1/2/3/4 %`、`BOND_SCALE 1`。只有第 21 項紅燈時能動 `BOND_PCT`（只能往下），只有 21p 紅燈時能在 spec §13 的護欄內動提案數字，而且 `bond caps keep every single source and every pair below 心契` 必須維持綠。
3. **設計者裁定：「救了她一命」**（spec §0 D4）：
   - `Game` 有一個不存檔的 `private endangered = new Set<CharacterId>()`，每場戰鬥開始時清空；
   - `submitRound` 每回合結算後，我方每一位 `hp ≤ 0` 或 `hp × 100 ≤ max.hp × DANGER_PCT` 的，加進集合；
   - 打贏時，集合裡、而且戰鬥結束時 `hp > 0` 的夥伴拿 `saved`。
4. **設計者裁定：同隊分寫進哪裡**：直接寫進 `this.state.party.roster[c].bond.field`。迷宮裡沒有存檔：全滅與回城會存，所以分數保留；讀檔回到上一次城裡，這一趟沒存的分數跟著這一趟一起消失，和經驗值一樣。
5. **設計者裁定：加成在測試裡怎麼關**：
   - `BOND_SWITCH = { earn: true, scale: BOND_SCALE }`（`engine/story/bond.ts`），照 `FORCED_GLIMMERS` 的做法，正式程式碼不改它；
   - `engine/testing.ts` 新增 `withBondScale<T>(scale: number, f: () => T): T`（`finally` 改回）；
   - `engine/storyL.dive.test.ts` 在 Task 5 起包在 `withBondScale(0, …)` 裡：它釘的是碎片的拾取路徑，好感度的加成由第 21 項量。**fixture 不重錄**；`scale 0` 下它必須逐位元相同。
   - Task 5 之後，若有既有的 `Game` 測試因為某位夥伴跨過階段、戰鬥結果改變而紅燈，唯一允許的修法是把那個測試包進 `withBondScale(0, …)` 並寫註解；不可以改期望值。每一個都列進報告。
6. **設計者裁定：註冊表**（spec §0 D14）。全部放在 `data/story/scenes.ts`（只有 id，沒有文字，所以沒有循環載入）：
   - `BONDS_WRITTEN: readonly Companion[]`：四段羈絆場景都寫好的夥伴；
   - `ENDINGS_WRITTEN: readonly Companion[]`；
   - `ROMANCES_WRITTEN: readonly Companion[]`；
   - `TOGETHER_WRITTEN: boolean`；
   - 一開始全部是空的（`false`）。`SCENE_IDS` 只收註冊過的 id。
   - 文字放在新檔 `data/bond.zh-TW.ts`：`BOND_SCENES`（場景）、`GIFT_LINES`（送禮反應）、`RIN_OATH_GIFT_LINES`（凜選擇之後的那一組）、`ROMANCE_LINES`（戀愛後的城鎮台詞）。`data/bond.test.ts` 檢查註冊表與文字一一對應。
   - 送禮的註冊：`GIFT_LINES` 有她，才列在「送禮」裡；凜要 `GIFT_LINES.rin` 與 `RIN_OATH_GIFT_LINES` 都在。
   - 引擎與介面的函式都收一個可選的註冊表參數（預設是正式的表），測試注入自己的表與自己的假場景，照 L 計畫 Task 5 對 `REACTIONS` 的做法，`afterEach` 還原。
7. **設計者裁定：載入順序**：`data/story.zh-TW.ts` 的 `buildScenes` 會匯入 `BOND_SCENES`，所以 `data/bond.zh-TW.ts` 從 `data/story.zh-TW.ts` **只能 `import type`**；值（`numeral` 等）從葉模組匯入（`data/numeral.ts` 已存在）。
8. **設計者裁定：場景的種類、上限與輕重**：
   - `sceneKind`：`bond:` → `'bond'`、`ending:` → `'ending'`、`romance:` 與 `together` → `'romance'`；
   - `lineCap`：`bond:c:1`–`3` 是 6，`bond:c:4` 是 10，`ending` 是 6，`romance:c` 是 12，`together` 是 3；
   - `heavyScene`：`bond:c:4` 與 `romance:c` 是重的；`bond:c:1`–`3`、`ending`、`together` 是輕的（聖經 §2.2 的表在 Task 12 登記）；
   - `HEAVY_ARRIVAL` 已經有 `romance:` 前綴，不改；`ending:` 是輕的（既有的註解已經這樣寫）。
9. **設計者裁定：羈絆場景的閘門**（spec §0 D5、D6）：`BOND_GATE: Record<Companion, Record<1 | 2 | 3 | 4, StoryGate & { tier: BondTier }>>`：
   - 八位夥伴：1 `{ tier 1, pieces { c: 1 } }`、2 `{ tier 2, pieces { c: 3 } }`、3 `{ tier 3, pieces { c: 4 } }`、4 `{ tier 4, full: c }`；
   - 凜：1 `{ tier 1, pieces { rin: 2 }, beforeChoice }`、2 `{ tier 2, pieces { rin: 4 }, beforeChoice }`、3 `{ tier 3, oath }`、4 `{ tier 4, oath }`；
   - `pieces`／`full` 由 `gateOpen` 讀 `storyPieces`（夥伴讀已說、凜讀持有），`beforeChoice` 由 `gateExpired` 過期；過期的一段算「略過」，不擋下一段，不寫進 `seen`（和對話、閒聊同一條規則）。
10. **設計者裁定：「今天」**（spec §0 D3）：`StoryState.bondDay?: number`、`gifted?: Companion[]`、`talked?: true`。讀取一律經過 `today(s)`：`bondDay === dayOf(s)` 時回傳 `{ gifted, talked }`，否則 `{ gifted: [], talked: false }`。寫入時把 `bondDay` 設成今天、清掉別天留下的值。出發不清任何欄位。
11. **設計者裁定：終幕之後的回城**：
    - `arrivalScenes` 新增選用的 `o.ending?: (s: GameState) => SceneId | null`：在預設的對話挑選之前先試它，挑到了就佔對話名額；沒挑到照舊（保留 `heavyList` 的「輕的先」規則）。`slot` 參數不動。
    - `Game.arrive` 傳 `ending: nextEnding`。
    - `nextEnding(s, written = ENDINGS_WRITTEN)`：`finaleCleared`、`epilogue` 已看過；依 `CHARACTER_IDS` 第一位已遇見、`storyPieces` 集滿、`ending:c` 沒看過、已註冊，而且 (a) 她若在 `HOME_OWNERS`，`home:c` 已看過；(b) 千鶴：`SEASON_SCENES.spring` 已註冊時，它已看過。**不看好感度**。
12. **設計者裁定：戀愛的流程**（spec §0 D8、§9）：
    - `romanceCandidates(s, written = ROMANCES_WRITTEN)`：`finaleCleared`、`epilogue` 已看過、`story.romance` 不存在；她在 `ROMANCEABLE`、已遇見、已註冊、`bondTier === 4`、`bond:c:4` 已看過。排序：`bondPoints` 高到低，同分依 `CHARACTER_IDS`。
    - `Game.walkAsked`（不存檔，`arrive` 設回 `false`）；`walkOpen()` = 城鎮 ∧ `!walkAsked` ∧ 候選不空。
    - `chooseRomance(c)`：成功時寫 `story.romance`、把 `romance:c` 排進 `story.queue`（中斷時下次回城補播，它是重的，那一次不接閒聊）、放進 `pending`、存檔；已經有 `romance` 回傳 `chosen`，值不變。
    - `walkTogether()`：設 `walkAsked`，**不寫任何存檔欄位**；畫面用 `playScene` 播 `together`（不記錄）。`TOGETHER_WRITTEN` 為假時，「和大家一起」直接設 `walkAsked`、說一句介面文字，不播場景。
    - 已註冊的 `romance:c` 加進日曆計畫的 `SCENE_TIME`（`'night'`）。
13. **設計者裁定：城鎮台詞池**：`story.romance` 存在而且 `ROMANCE_LINES` 有她時，那兩句以她的名字加在池子最後；`game.rng()` 的抽取次數不變（只是池子變長）。
14. **設計者裁定：升階的那一行**：`Game.bondUps`（不存檔）。出發時記下每位已遇見夥伴的階段；回城與全滅時比較，升了的依 `CHARACTER_IDS` 放進來。城鎮在到達的場景播完、收穫或通知那一行之後說「凜的好感度提升到『信賴』。」，不取代當天那一句，不多抽亂數。
15. **設計者裁定：停止規則**：
    - sim gate 不是 `gate: identical`，或 `cmp` 與 `contribution.8d-final.160.json` 有差：BLOCKED。
    - `withBondScale(0)` 下的下潛快照（`engine/storyL.dive.test.ts`）變了：BLOCKED。
    - 第 21 項調 `BOND_PCT` 四輪還紅：BLOCKED，附每一輪的表。
    - 要改 `epilogue`、終幕或任何已經寫好的劇情字串：NEEDS_CONTEXT。
    - 要改帳本既有 I 條目的事實或揭露時機：NEEDS_CONTEXT（新增條目可以直接做）。
    - 全套出現本任務沒列到的紅燈：NEEDS_CONTEXT（照下面的測試修改規則）。

## Global Constraints

**使用者的方向（最高依據）**
- 好感度給的是「劇情為主＋小幅戰鬥加成」，絕不讓某一種隊伍變成必帶（spec §1）。
- 「你應該要作為專業編劇編寫適當的劇情，並且驅動他們各自的人性，讓他們在故事當中有衝突和掙扎」。
- 日常輕快、有梗、日系 RPG；沉重留給回憶與心契、戀愛；「……」少用。
- 只有畫風要找使用者看；技術規格與劇情由我們決定。

**分支與基準**
- 分支 `feat/starlantern-affinity`，從開工時的 `origin/master` 開出（日曆計畫已合併，見裁定 1）。這份計畫與 spec 的定案修訂在 `feat/starlantern-affinity-plan`（計畫用），實作分支 cherry-pick 或 rebase 它們進來。
- 基準提交記在 SDD `baseline.md`。開工前 `git status` 必須乾淨；要改的檔案有別人未提交的修改，NEEDS_CONTEXT。

**模擬閘門**（每一個碰到 `engine/` 的任務都跑；Task 0 錄 `gate-0`）
- 指令：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-0 > <SDD>/gate-<N>.stdout`。
- 最後一行必須是 `gate: identical`；`cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
- `engine/parity.test.ts` 的 `PARITY_TASK` 維持 `between plans`；不錄新表，不覆寫 `engine/__fixtures__/`。
- 不加任何亂數抽取，不用 `Math.random`，不讀 `Date`。

**測試與檢查**
- **TDD**：先寫失敗的測試，確認它因正確的理由失敗，再實作。寫作任務照 W 步驟（紅：註冊表與守門的釘子）。
- **vitest**：單檔 `rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套 `rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`。
- **平衡**：`BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.bond.test.ts --testTimeout=300000`；21e 另加 `BANDS=1`。
- **tsc**：`rtk proxy npx tsc --noEmit -p .`。`src/scripts/games/starlantern/` 與 `tests/e2e/starlantern*.ts` 底下 0 個；全 repo 總數不可以多於 `baseline.md` 記下的數字（寫計畫時 773）。
- **e2e**：`E2E_PORT=4352 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts`，三個專案 `chromium`、`chromium-dpr125`、`chromium-dpr150` 都跑。一律 headless；spec 已經 `--mute-audio`，新測試不可以拿掉。只用 4352，絕不用 4354、4321；不結束任何程序。**不用 Playwright MCP 或任何瀏覽器 MCP 工具。**
- **重的工作**（閘門、e2e、全套、平衡）之前：PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` ≥ 6291456（KB），不足就等；一次只跑一套重的工作。
- 本專案沒有 prettier、eslint。一次性的探測程式跑完就刪，絕不 commit。
- **測試修改規則**：每個任務的 Files 列出已知會紅的既有測試與改法；不放寬門檻、不刪斷言、不加 `skip`／`only`／`todo`／`it.fails`；全套出現沒列到的紅燈就 NEEDS_CONTEXT（裁定 5 的 `withBondScale(0)` 是唯一的例外修法）。`data/story/story.test.ts` 的 `expect(` 數不可以比 `baseline.md` 少。

**決定性**
- 好感度不用任何 rng。禁止 `Math.random`；禁止為了好感度多抽 `game.rng`、`lootRng`、`memoryRng`、`runeRng` 或任何由 `run.seed` 衍生的串流。
- 送禮反應的索引是 `(count − 1) % 池長`；城鎮台詞池只變長，抽取次數不變。

**存檔**（spec §0 D1）
- 新欄位全部可選：`Member.bond?`、`StoryState.bondDay?`、`gifted?`、`talked?`、`romance?`。`SAVE_VERSION` 維持 9。
- 不寫遷移、不為舊檔補值；同一輪遊戲裡，存檔讀回後好感度、今天收過禮的人、戀愛對象都一樣（有測試）。

**平衡（凍結）**
- `balance.test.ts`、`balance.lineups.test.ts`、`balance.deep.test.ts`、`balance.pace.test.ts`、`builds.bands.*.test.ts`、`tierBands.*.test.ts` 一個字都不改。
- 模擬的隊伍沒有 `bond`：`partyAt` 只有在 `Lineup.bond === 'max'` 時給。
- `ENEMY_POWER`、`PARTY_SCALE`、`FINALE_BOSS`、`MEMORY_SCALE`、難度表與任何門檻：一律不動。

**文字**
- 劇情文字只放 `data/bond.zh-TW.ts`（新）；介面文字只放 `data/text.zh-TW.ts`（`T.ui2.bond`、`T.ui2.inn` 底下，先 grep 確認不撞名；送禮失敗用既有的 `stock`，不用 `none`）。
- 每句 ≤ `MAX_LINE_CHARS`＝60；選項 ≤ `CHOICE_MAX_CHARS`＝20；場景照最壞路徑（`worstCount`）不超過 `lineCap`。
- 全形標點，對白「」，引號裡用『』，省略號「……」，破折號「──」；劇情文字沒有英文字母與阿拉伯數字（`numeral()`）；介面文字可以用阿拉伯數字。
- 表情只用 `moodsFor(說話者)` 已有的；重的場景裡每一句角色台詞都要有臉（`ui2/storyFaces.test.ts` 的規則套到新場景）。
- **不寫季節、不寫月相**（spec §0 D11）；不給洛恩一間自己的房間（帳本 I-121）。
- 程式裡好感度一律叫 `bond`，不可以叫 `affinity`（那是主屬性取向）。

**易讀性與樣式**
- 字級只有 12／24px，行高 ≥ 14（`ui2/typeScale.test.ts`）；整數倍縮放，不加 `transform: scale`、不用非整數 `zoom`。
- 新字串的每一個字都要在 Cubic 11 裡（`data/glyphs.test.ts` 自動掃 `data/bond.zh-TW.ts`）；缺字就換一個詞，不改字型。
- 新介面只用既有元件（`MenuView`、`Dialogue`、`confirmBox`、`win`、手冊的清單、`slx-fresh`）。SCSS 只改 `src/styles/_starlantern-ui.scss`；禁 `!important`、行內樣式、`element.style`。清單的列與右欄留在面板內（`8db54d901` 修過的工房清單是範本）。

**換行**（改檔前 `git ls-files --eol <檔>`，改完 `git diff --stat`；整檔被改寫就是換行壞了；CRLF 與混用檔不可以用 `sed -i`；新檔一律 LF。2026-10-24 量到的：）
- LF：`data/story.zh-TW.ts`、`data/story/{scenes,story.test,voice.test,voiceGates,tone}.ts`、`engine/story/{events,events.test,nights,handbook,handbook.test}.ts`、`engine/dungeon/run.ts`、`engine/dungeon/run.test.ts`、`engine/bands.ts`、`engine/tierBands.ts`、`engine/tierBands.test.ts`、`engine/sim.test.ts`、`engine/progression.ts`、`ui2/story.ts`、`ui2/story.test.ts`、`ui2/storyFaces.test.ts`、`ui2/scenes/{handbook,handbook.test,statusTabs}.ts`、`docs/superpowers/story/*.md`。
- CRLF：`engine/{types,state,party,sim,testing,game.test}.ts`、`data/characters.ts`、`ui2/scenes/town.ts`。
- 混用（新行照相鄰行）：`data/text.zh-TW.ts`、`engine/{game,save,save.test,party.test}.ts`、`ui2/widgets.ts`、`ui2/scenes/{inn,inn.test,facility,facility.test,status.test,town.test}.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`。
- 新檔（LF）：`data/story/bond.ts`、`data/story/bond.test.ts`、`engine/story/bond.ts`、`engine/story/bond.test.ts`、`data/bond.zh-TW.ts`、`data/bond.test.ts`、`engine/balance.bond.test.ts`。
- 日曆計畫合併後，它碰過的檔重量一次再動手。

**git**
- 用完整路徑 add，不可以 `git add -A`／`git add .`。
- Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不可以 `git checkout -- <path>`、`restore`、`reset`、`stash`、`clean`；要撤回就再改一次檔案。不 push（控制者在驗收後決定）。

**收尾 G（每個任務）**
1. 全套全綠（含 `engine/storyL.dive.test.ts`）；tsc 符合上面的條件。
2. 碰到 `engine/` 時跑 sim gate（`gate-<N>`）。
3. 動到 `ui2/`、`src/styles/` 或 `tests/e2e/` 時，或改到的字串在 `tests/e2e/starlantern.spec.ts` 裡逐字出現時（先 grep），跑 e2e 三個專案並全綠。
4. 報告：新增與修改的測試名；全套兩行、tsc 數字、閘門與 e2e 結果（沒跑寫理由）；改了哪些既有斷言；偏離本計畫的地方與理由。

**子代理**：實作者不派子代理。冷讀、盲聽、整體審查由控制者另派全新脈絡的讀者，模型照使用者偏好用 Opus 5.5；子代理一律不准用瀏覽器 MCP。

## 寫作任務的固定步驟（Task 13–18 的 W1–W8）

沿用 L 計畫的 W 步驟：
- [ ] **W1 紅**：在 `data/bond.test.ts` 寫本任務的註冊釘子（例：`BONDS_WRITTEN` 含這三位、她們的 `bond:c:1`–`4` 都在 `BOND_SCENES`）；新的鍵加進 `data/story/voice.test.ts` 的 `POLISHED`；跑 `data/bond.test.ts`、`voice.test.ts`、`story.test.ts`、`data/terms.test.ts`、`data/glyphs.test.ts`；失敗清單存成 SDD `task-<N>-red.txt`。
- [ ] **W2 讀**：重讀聖經 §2.2–§2.5 與 §3 她的那一節、帳本她的條目、她的全部回憶、對話、閒聊、歸鄉，以及 Task 12 的 `arcs.md` 她的那一段。
- [ ] **W3 寫**：照 spec 與 `arcs.md` 寫，想像自己出聲念一遍；同時在 `scenes.ts` 註冊。帳本的新條目在同一個 commit 加。
- [ ] **W4 釘子**：每段用 `pinBeat`（`data/story/voiceGates.ts`）釘情節要點（例：選項之前她說出想要的東西），不釘整句。
- [ ] **W5 綠**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern` 全綠，然後做收尾 G。
- [ ] **W6 朗讀稿**：`STORY_DUMP=<SDD>/task-<N>-after.md STORY_DUMP_KEYS='<前綴,…>' rtk proxy npx vitest run src/scripts/games/starlantern/data/story/readAloud.test.ts`（`buildScenes` 已把羈絆場景併進 `STORY.scenes`；送禮反應與城鎮台詞由 Task 7 加進朗讀稿的鍵 `gift:<c>`、`romanceLines`）。
- [ ] **W7 冷讀**：控制者派一位沒讀過設計文件的全新讀者，只給 `task-<N>-after.md`。及格條件：說得出每一段在講什麼、她想要什麼、她的毛病讓她付出了什麼；沒有一句讓他出戲；每一個選項之後的回應都溫暖，看不出哪個是「錯的」；沒有一句提到季節或月亮。不及格回到 W3。
- [ ] **W8 盲聽**（Task 14–16、18）：同一位讀者拿到拿掉名牌的版本，猜每一段是誰；九位裡至少要猜對七位，猜錯的那一位回到 W3 加強口吻。

## Review Focus

1. **好感度永遠不下降**：全滅、坐冷板凳、婉拒、跳過、非偏好的語氣、口味痊癒之後，分數都不變少；已收下的素材口味永不改變。→ Task 1 列舉、Task 6 的性質測試。
2. **只刷一種來源到不了頂**：任一種加滿 ≤ 信賴，任兩種加滿 < 85。→ Task 1 `bond caps keep every single source and every pair below 心契`。
3. **戰鬥與模擬逐位元不變**：`battle.ts` 沒有 diff；sim gate identical、`cmp` 無差；`withBondScale(0)` 下的下潛快照不變；`bond draws nothing`。→ Task 3、5、每個碰引擎的任務的閘門。
4. **加成不碾壓**：第 21 項（普通 21a–d、噩夢與地獄的「沒符文打不過頭目」21e）在全員心契下仍成立；紅了只調低 `BOND_PCT`。→ Task 4。
5. **同一件事只計一次、一天一次**：同一段的選項、同一層的下樓、精英又救命（共享每趟 4 分）、同一天的第二份禮與第二段談心。→ Task 5、6、8。
6. **羈絆不搶劇情槽**：`arrivalScenes` 在沒有終幕之後的內容時與現在完全相同；夜晚、清晨、反應槽、春祭不變；羈絆場景不進佇列。→ Task 8、9 的回歸測試。
7. **沒有人被留在黑暗裡**：後日談不看好感度；終幕之後才遇見或才集滿的人也輪得到；戀愛裡其他夥伴在場、沒有人失落。→ Task 9、17、18。
8. **戀愛的份量**：只有明確選擇才成立；選了不能改；「和大家一起」不寫存檔；中斷的戀愛下次回城補播。→ Task 9。
9. **不劇透**：羈絆文字的位置規則讓 `SPOILERS`、`RIN_SECRET_TERMS` 照樣適用；凜揭露前不叫名字、不說「我們」。→ Task 7 與每個寫作任務。

---

## 檔案結構

**新增**：
- `data/story/bond.ts`（＋`bond.test.ts`）：好感度的全部常數與表；只有資料與 `giftableOf`。
- `engine/story/bond.ts`（＋`bond.test.ts`）：純函式：推導、加成、同隊分、送禮、對話分、閘門、戀愛候選、`today`。
- `data/bond.zh-TW.ts`（＋`data/bond.test.ts`）：羈絆的全部文字與它們的守門。
- `engine/balance.bond.test.ts`：第 21 項。

**修改**：
- 資料：`data/story/scenes.ts`（id、註冊表、種類、上限、輕重）；`data/story.zh-TW.ts`（劇本格式、`buildScenes`、標題）；`data/story/story.test.ts`、`voice.test.ts`、`readAloud.ts`（新格式、位置規則、朗讀稿）；`data/text.zh-TW.ts`（介面文字）。
- 引擎：`engine/types.ts`、`engine/state.ts`、`engine/save.ts`、`engine/party.ts`、`engine/sim.ts`、`engine/tierBands.ts`（只加選用參數）、`engine/bands.ts`、`engine/testing.ts`、`engine/dungeon/run.ts`、`engine/game.ts`、`engine/story/events.ts`、`engine/story/handbook.ts`。
- 介面：`ui2/story.ts`（選項）、`ui2/scenes/facility.ts`（`speakAs`）、`ui2/scenes/inn.ts`（「夥伴」）、`ui2/scenes/town.ts`（「新」、升階行、台詞池）、`ui2/scenes/statusTabs.ts`、`ui2/scenes/handbook.ts`。
- 樣式：`src/styles/_starlantern-ui.scss`。
- 文件：聖經 §2.2 的表、帳本（從日曆計畫用完的下一個編號起；寫計畫時帳本到 I-199，日曆計畫加 I-200，所以預期 I-201 起）。
- e2e：`tests/e2e/starlantern.spec.ts`。
- **不改**：`engine/battle.ts`、`engine/combatant.ts`、`render/artPaths.ts`（Task A 除外）、凍結的平衡檔、`epilogue` 與終幕。

---

### Task 0：基準

**Files:** SDD `baseline.md`。

- [ ] **Step 1**：`git status` 乾淨；`baseline.md` 記下 `git rev-parse HEAD`、tsc 總數與 starlantern 底下的數字、全套兩行、`story.test.ts` 的 `expect(` 數、`SCENE_IDS.length`、`allArtUrls().length`、日曆計畫是否已合併（`engine/calendar.ts` 存不存在）。
- [ ] **Step 2**：閘門錄 `gate-0`；vitest 必須通過、`cmp` 必須沒有輸出，否則 BLOCKED。
- [ ] **Step 3**：e2e 三個專案各跑一次，通過數與失敗的測試名記進 `baseline.md`。
- [ ] **Step 4**：`grep` 確認：`engine/battle.ts`、`engine/combatant.ts` 沒有 `bond`；`T.reasons.stock` 存在；`T.ui2.inn`、`T.ui2.bond` 現有的鍵（避免撞名）；旅館選單現在的列數與面板高度（`ui2/scenes/inn.ts` 的 `commands()`）。
- [ ] **Step 5**：commit `baseline.md`：`chore(starlantern): affinity baseline`。

---

### Task 1：好感度的資料與分數

**Files:**
- Create：`data/story/bond.ts`、`data/story/bond.test.ts`、`engine/story/bond.ts`、`engine/story/bond.test.ts`。
- Modify：`engine/types.ts`（`GiftId`、`BondRecord`、`Member.bond?`）。
- Read：spec §0、§3、§4.1–§4.6、§6.1–§6.3、§7.2、§9.1；`data/materials.ts`、`engine/progression.ts`（`memoriesOf`）、`data/story/chains.ts`（`chainLength`）、帳本每位夥伴的背景。
- 已知會紅：預期沒有。

**Interfaces:**
- `engine/types.ts`：`type GiftId = string`；`interface BondRecord { talk: number; field: number; gifts: Partial<Record<GiftId, number>>; refused?: GiftId[] }`；`Member.bond?: BondRecord`（洛恩永遠沒有；`refused` 只給手冊顯示「婉拒」用）。
- `data/story/bond.ts`：`Companion`、`COMPANIONS`（`CHARACTER_IDS` 去掉 `hero`，順序不變）、`BondTier`、`BOND_TIER_AT`、`BOND_MAX`、`BOND_START`、`BOND_PER_PIECE`、`BOND_CAP`、`BOND_RUN_CAP`、`BOND_PCT`、`BOND_SCALE`、`FIELD_POINTS`、`DANGER_PCT`、`Taste`、`GIFT_VALUE`、`GIFT_REPEAT_FULL`、`Tone`、`TALK_POINTS`、`GIFT_KINDS = ['monster', 'junk', 'rare', 'region']`、`giftableOf(materials)`、`GIFTABLE`（由 `kind` 推導，今天是 spec §6.1 的 18 種）、`GIFT_TASTE`（spec §6.2 的表）、`GIFT_MOOD`（spec §6.4）、`RIN_GIFT_MOOD_BEFORE_OATH = 'normal'`、`TONE_PREF`（spec §7.2）、`ROMANCEABLE = COMPANIONS`、`BOND_GATE`（裁定 9）。
- `engine/story/bond.ts`：
  - `bondOf(m)`：沒有欄位時 `{ talk: 0, field: 0, gifts: {} }`；
  - `tasteOf(c, mat, healed): Taste | null`（不在 `GIFTABLE` 是 `null`；婉拒而且痊癒、`healed[mat]` 有值時回傳那個值）；
  - `giftPoints(m)`：每種素材 `n` 份得 `v × min(n, 2) + max(0, n − 2)`，未封頂。口味用「收下時」的口味：已收下的素材口味永不改變，所以直接用 `tasteOf(c, mat, true)`（下面的列舉測試證明它和 `false` 相同）；
  - `bondPoints(m)`：洛恩 0；其他 `clamp(BOND_START + BOND_PER_PIECE × memoriesOf(m) + min(talk, 12) + min(giftPoints, 30) + min(field, 40), 0, 100)`（spec §0 D2：持有的片數）；
  - `tierAt(points)`、`bondTier(m)`。

- [ ] **Step 1：寫失敗的測試**
  - `data/story/bond.test.ts`：
    - `GIFTABLE is every monster, junk, rare and region material`（18 個 id，排序後比對；不含 `essence-*`、消耗品、碎片物品）；
    - `GIFTABLE follows kind, not a list`（`giftableOf` 對加了假素材的拷貝）；
    - `the taste table`：每位剛好 2 個 loved；每個鍵都在 `GIFTABLE`；同一素材在同一人只出現一格；`healed` 的鍵都在她的 declined 裡；逐格等於字面值；
    - `tone preferences, romance and gates`：三種語氣各 3 人；`ROMANCEABLE` 等於九位、不含 `hero`；`BOND_GATE` 逐格等於裁定 9；每個 `pieces` ≤ `chainLength(c)`；
    - `gift faces belong to her`：`GIFT_MOOD` 每一格 `moodsFor(c).includes(mood)`。
  - `engine/story/bond.test.ts`：
    - `bondTier thresholds`（19→0、20→1、39→1、40→2、59→2、60→3、84→3、85→4、100→4）；
    - `the hero has no bond`；`Rin starts at ten`（3 片是 19）；
    - `bondPoints follows the formula`（手算；各欄位各自截斷；總和截成 100）；
    - `bond caps keep every single source and every pair below 心契`（凜與一位夥伴：任一種加滿 `bondTier ≤ 2`；任兩種加滿 `< 85`；四種全滿 `=== 100`）；
    - `gift repeats fall to one`（最愛 1–4 份 = 4、8、9、10；普通 3 份 = 3）；
    - `a gift already taken never changes value`：每位夥伴 × `GIFTABLE` 每種：痊癒前收得下的，`tasteOf(c, mat, false) === tasteOf(c, mat, true)`。
- [ ] **Step 2**：執行，確認紅（模組不存在）。
- [ ] **Step 3**：實作。**喜好表的審查**（spec §0 D19）：實作者把 spec §6.2 的每一列與帳本她的背景、L 與故事深度改過的設定對照，結果寫進 SDD `tastes.md`（每列：一致／不一致與理由）。不一致的列：改表、改測試的字面值、在帳本新增一條，同一個 commit。
- [ ] **Step 4**：這四個測試檔、全套、tsc。
- [ ] **Step 5**：收尾 G（引擎沒有接上任何東西，閘門照跑一次），commit：`feat(starlantern): bond data and the score it derives`（訊息寫明「GIFTABLE is derived from material kind」與喜好表審查的結果）。

---

### Task 2：存檔欄位與驗證

**開工條件**：日曆計畫已合併（裁定 1）。

**Files:**
- Modify：`engine/state.ts`（`StoryState.bondDay?`、`gifted?`、`talked?`、`romance?`）、`engine/save.ts`（`isStory`、`isValid`、新的 `validBond`）、`engine/story/bond.ts`（`today`）。
- Test：`engine/save.test.ts`、`engine/story/bond.test.ts`。
- 已知會紅：預期沒有。

**Interfaces:**
- `today(s: GameState): { gifted: Companion[]; talked: boolean }`（裁定 10）。
- `validBond(id, m, told)`（`told`：她已說的片數，由 `isValid` 從 `story.seen` 算）：
  - `hero` 有 `bond` 是錯；
  - `talk` 是 0..12 的整數，`field` 是 0..40 的整數；
  - `gifts` 的鍵都在 `GIFTABLE`，值是 1..999 的整數，`tasteOf(id, 鍵, told >= chainLength(id)) !== 'declined'`；
  - `refused` 沒有，或是不重複、都在 `GIFTABLE` 的陣列。
- `isStory`：`bondDay` 是 1..`MAX_DAY` 的整數；`gifted` 是不重複的 `COMPANIONS`，而且只有 `bondDay` 存在時才可以有；`talked` 只能是 `true`，同樣要有 `bondDay`；`romance` 在 `ROMANCEABLE` 裡而且 `finaleCleared`。
- `isValid`：`romance` 必須在 `party.recruited`；`gifted` 的人都已遇見。（`romance:<c>`、`together` 的交叉檢查要等 Task 7 有了 id，寫在 Task 7。）

- [ ] **Step 1：寫失敗的測試**（照 `save.test.ts`「做一份合法存檔再改一個欄位」的寫法）：
  - `the save version stays 9`；
  - `every bond field round-trips`：凜 `bond { talk 5, field 12, gifts { 'dusk-cloth': 2 }, refused ['king-scale'] }`、`bondDay`、`gifted ['rin']`、`talked`、終幕已過的 `romance 'rin'` → 存、讀，逐欄相同；
  - 各自是 `corrupt`：`hero.bond`；`talk 13`；`field 41`；`field 1.5`；`gifts` 有 `essence-common`；`gifts` 值 0；凜收下 `king-scale`；瑟蕾沒說完卻收下 `old-coin`（說完的同一份存檔是 `ok`）；`refused` 重複；`gifted ['hero']`；`gifted` 重複；`gifted` 沒有 `bondDay`；`talked: false`；`bondDay 0`；`romance` 在 `finaleCleared` 為假時；`romance 'hero'`；`romance` 是沒遇見的人；
  - `bond.test.ts`：`today reads only today`（`bondDay` 是昨天 → 空；今天 → 原值；欄位不存在 → 空）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：兩個測試檔、全套、tsc。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): bond in the save, version unchanged`。

---

### Task 3：屬性來源 `bond` 與模擬的掛鉤

**Files:**
- Modify：`engine/party.ts`（`StatSource` 加 `'bond'`；`statSources` 在 `memory` 之後、`primary` 之前加 `{ source: 'bond', stats: bondStats(m) }`）、`engine/story/bond.ts`（`bondStats`、`maxBondRecord`、`BOND_SWITCH`）、`engine/sim.ts`（`Lineup.bond?: 'max'`、`partyAt`）、`engine/testing.ts`（`withBondScale`）、`ui2/scenes/statusTabs.ts`（能力表的新欄）、`data/text.zh-TW.ts`（屬性來源欄名 `bond: '羈絆'`，和 `memory: '記憶'` 同一個物件）。
- Test：`engine/party.test.ts`、`engine/sim.test.ts`、`ui2/scenes/status.test.ts`。
- 已知會紅：`status.test.ts` 裡斷言屬性來源欄數或順序的測試：改成從 `statSources` 推導，斷言的意圖不變；列進報告。

**Interfaces:**
- `bondStats(m, scale = BOND_SWITCH.scale): Partial<Sheet>`：洛恩、`scale 0`、階段 0 回傳 `{}`；否則 `hp atk def mag res` 每一項 `Math.floor((base[k] + growth[k] × (level − 1)) × BOND_PCT[tier] × scale / 100)`，`def = CHARACTERS[m.id]`。不加 `spd`、`tp`、暴擊、量表、主屬性（spec §5.1）。
- `maxBondRecord(c)`：`{ talk: 12, field: 40, gifts: { [loved[0]]: 9, [loved[1]]: 9 } }`：`giftPoints` 剛好 30，不靠碎片就是 92、心契。
- `partyAt`：`lineup.bond === 'max'` 時每位夥伴 `bond: maxBondRecord(id)`，洛恩不給；沒有 `bond` 的 `Lineup` 產生的成員逐欄相同（沒有 `bond` 欄位）。

- [ ] **Step 1：寫失敗的測試**
  - `party.test.ts`：`bond adds a share of her natural stats`（Lv30 絲嘉蕾心契：HP +10、攻擊 +2，其他三項手算寫死；沒有 `spd`、`tp`）；`no bond, no bond stats`（`sheetOf` 與加欄之前相同）；`the hero never has bond stats`；`scale zero switches it off`（用 `withBondScale(0, …)`）。
  - `sim.test.ts`：`partyAt with bond max gives every companion 心契 and the hero nothing`；`partyAt without bond is unchanged`（沒有 `bond` 欄位）；`every balance file is a normal band` 不改、維持綠。
  - `status.test.ts`：`the stat table has a bond column`（欄名「羈絆」；沒有好感度的成員那一欄是空的或 0，照記憶欄的現行顯示）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：全套、tsc、閘門 `gate-3`（必須 identical：沒有任何模擬的隊伍有 `bond`）、e2e（狀態頁動了）。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): bond as a stat source, off in every sim party`。

---

### Task 4：第 21 項平衡帶「心契不碾壓」

**Files:**
- Create：`engine/balance.bond.test.ts`。
- Modify：`engine/bands.ts`（`BANDS.normal` 加 `'balance.bond.test.ts'`，`sim.test.ts` 的守門要求每個 `balance*` 檔都登記；sim gate 腳本只跑四個列名的檔，所以閘門不變）、`engine/tierBands.ts`（`measureBand(band, extra?: Partial<Lineup>)`：把 `extra` 併進每一格的 `lineup`；不給時逐位元同現在）。
- Test：`engine/tierBands.test.ts`（`extra merges into every cell's lineup`，不跑戰鬥，只看組出來的格子）。
- Read：`engine/balance.test.ts`（第 4、10、11、14 項與它們的輔助、`MEMORY_GEAR_FLOOR` 一類的每格下限）、`balance.lineups.test.ts`（18d）、`tierBands.ts`（N4、H3、`SHALLOW_HELL_BARE`）。**不 import 凍結檔的輔助函式**，在本檔重寫。

**Interfaces（本檔的內容；門檻全部照抄原帶）**：
- `MAX: Lineup = { bond: 'max' }`，併進原帶的 lineup 參數：
  - **21a**（第 4 項）：推薦等級的勝率 ≥ .85、HP 損失 .10–.45；
  - **21b**（第 10 項記憶期望版）：照該帶今天的格子與每格下限（含它現有的例外，不加新的例外）；
  - **21c**（第 11、14 項的「記憶＋深淵上限」）：頭目不會一回合倒下，照原斷言；
  - **21d**（第 18d 項）：`ODD_LINEUPS` × 主角流派 × 第 4、8 層，每格 HP 損失 ≥ .10；
  - **21 measures something**：標準五人第 10 層，帶不帶 `MAX`，`statsOf` 至少一位夥伴的 `hp` 不同，而且一場 `simBattle` 的結果不同；
  - **21e**（`describe.skipIf(process.env.BANDS !== '1')`）：`measureBand('N4', MAX)`、`measureBand('H3', MAX)` 與淺層地獄的格子，用 `bandMisses` 的原規則只檢查「沒有符文的頭目」上限（N4 ≤ .70 且比魔法低 .20；H3 ≤ .40；淺層地獄 ≤ .40）；
  - **21p 節奏參考**（spec §12.2.1，參考測試，門檻是本計畫訂的）：不跑戰鬥的算術模型：本道第 1 到 30 層、每趟 5 層、每趟帶凜＋瑟蕾＋千鶴＋諾艾兒，每層 +1、每 5 層一場頭目 +2，受每趟 4 分限制；每天給八位各送一份她的 liked[0]；碎片照 `memoryPace`。斷言：常帶的三位與凜 ≥ 羈絆；另外四位在同行到羈絆之間；沒有人只靠一種來源到心契。`BALANCE_REPORT` 時印出每位的分數。
- 報告行開頭 `[bond]`（sim gate 的 grep 不收它）。

- [ ] **Step 1：量基準**：還沒建檔前跑 `BALANCE_REPORT=1` 的四個普通 balance 檔與 `BANDS=1` 的 N4、H3，存 SDD `bond-baseline.md` 的「之前」。
- [ ] **Step 2：寫測試**（21a–e、21p、measures、`tierBands.test.ts` 的合併測試），確認新檔在 `BOND_PCT` 全 0 時（暫時在測試裡用 `withBondScale(0)` 跑一次）與基準相同，證明它量的是同一個東西。
- [ ] **Step 3：跑**。紅燈處理：21a–e 任何一項紅，只能把 `BOND_PCT` 的高階往下調（例 4 → 3），每一輪記進 `bond-baseline.md`；不可以改任何門檻、例外或凍結的值。21p 紅時可以在 spec §13 的護欄內調提案數字，但 Task 1 的 `bond caps keep…` 必須維持綠。最多四輪，調不過就 BLOCKED。
- [ ] **Step 4**：全套、tsc、閘門 `gate-4`（identical）、`BANDS=1` 的 21e。
- [ ] **Step 5**：收尾 G，commit：`balance(starlantern): band 21 — a maxed bond crushes nothing, Nightmare and Hell included`（訊息寫 `BOND_PCT` 的最後值與報告摘要）。

---

### Task 5：同隊探索與戰鬥

**Files:**
- Modify：`engine/dungeon/run.ts`（`Run.bond: Partial<Record<CharacterId, number>>`，`newRun` 給 `{}`）、`engine/story/bond.ts`（`addField`）、`engine/game.ts`（`descend`、`submitRound`、`endangered`）、`engine/storyL.dive.test.ts`（包進 `withBondScale(0, …)`，裁定 5）。
- Test：`engine/dungeon/run.test.ts`、`engine/story/bond.test.ts`、`engine/game.test.ts`、`engine/storyL.dive.test.ts`。
- 已知會紅：裁定 5 說的戰鬥結果因階段改變的既有 `Game` 測試（照裁定 5 修，列進報告）。

**Interfaces:**
- `addField(party, run, ids, pts): { party; gained }`（純函式）：`BOND_SWITCH.earn` 為假時原樣回傳；每位夥伴（洛恩略過）`add = min(pts, BOND_RUN_CAP − run.bond[id], BOND_CAP.field − field)`，大於 0 就寫進 `bond.field` 與 `run.bond`。
- `Game`（spec §4.3、裁定 3）：
  - `descend()`：出戰陣型裡 `hp > 0` 的夥伴 `+floor`，寫在既有的經驗值之後；
  - `submitRound`：每回合後更新 `endangered`；打贏時（逃跑、全滅不加；**救援戰整場不加**），在經驗值與相遇之後：`boss` 或精英 → 陣上每位夥伴 `+strong`；再 `endangered` 裡、結束時站著的夥伴 `+saved`。終幕那一戰照算。

- [ ] **Step 1：寫失敗的測試**
  - `run.test.ts`：`a new run holds no bond yet`。
  - `bond.test.ts`：每趟 4 分（四個 +2 只加到 4）；終身 40（39 時 +2 只加 1）；洛恩不加；`earn = false` 不變。
  - `game.test.ts`：
    - `going down the stairs bonds whoever goes along`（出戰的 +1；板凳、倒下的不加）；
    - `a boss or an elite bonds everyone in the fight`；
    - `saved means she was in danger and stood at the end`（在危險中但最後倒下的不加）；
    - `a rescue fight and a flight give nothing`；
    - `four a run, and a wipe keeps what was earned`（全滅後 `field` 不變；下一趟從 0 計）；
    - `bond draws nothing`：兩個 `Game`，同一種子與狀態，`scale 0`，一個 `earn` 開、一個關；`rng` 包計數器；同一串操作（出發、一場戰鬥固定行動打完、下樓兩次、打第 3 層頭目）；兩邊的 `game.rng` 呼叫次數、`run.lootDraws`、`run.memoryDraws`、每場 `BattleEnd` 的掉落與碎片深度相等；開的那一邊至少一位 `field > 0`；
    - `the battle engine is untouched`：`git diff --stat <BASE> -- src/scripts/games/starlantern/engine/battle.ts src/scripts/games/starlantern/engine/combatant.ts` 沒有輸出（寫進報告，不是 vitest）。
  - `storyL.dive.test.ts`：包進 `withBondScale(0)` 之後與 fixture 相同。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：全套、tsc、閘門 `gate-5`、第 21 項（不變）。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): bond from going down and fighting together`。

---

### Task 6：送禮（引擎）

**Files:**
- Create：`data/bond.zh-TW.ts`（本任務只放型別與空的 `GIFT_LINES`、`RIN_OATH_GIFT_LINES`）、`data/bond.test.ts`。
- Modify：`engine/story/bond.ts`（`giveGift`、`giftPools`、`giftLine`、`giftMood`）、`engine/game.ts`（`give`）。
- Test：`engine/story/bond.test.ts`、`engine/game.test.ts`、`data/bond.test.ts`。

**Interfaces:**
- `data/bond.zh-TW.ts`：`type GiftPools = { loved: string[]; liked: string[]; neutral: string[]; declined: Partial<Record<GiftId, string>>; healed: Partial<Record<GiftId, string>> }`；`GIFT_LINES: Partial<Record<Companion, GiftPools>>`、`RIN_OATH_GIFT_LINES: GiftPools | null`，一開始是空的。檔頭註解：只放寫好的文字（spec §0 D14），寫之前讀聖經與 spec §6.2、§6.4（§6.4 的語氣樣本早於語氣改版，和聖經衝突時以聖經為準）。
- `GiveResult = { ok: true; taste; healed; count; gained } | { ok: false; reason: 'hero' | 'unmet' | 'today' | 'stock' | 'ungiftable' | 'unwritten' }`。
- `giveGift(s, c, mat, pools = GIFT_LINES, rinOath = RIN_OATH_GIFT_LINES)`（純函式）：
  - 失敗：洛恩；沒遇見；今天收過（`today(s).gifted`）；持有不到 1；不在 `GIFTABLE`；她的反應還沒寫（`unwritten`）。
  - 婉拒：`ok, taste 'declined', count 0, gained 0`；**不消耗、不寫 `gifts`、不進 `gifted`**，只把素材加進 `refused`。
  - 收下：素材 −1、`gifts[mat] + 1`、`gifted` 加她、`bondDay` 設成今天；`count` 是收下後的份數；`gained` 是封頂後的實際增加量（滿了是 0，照樣收）；`healed` 是這份口味來自痊癒（痊癒讀她已說完，spec §0 D2）。
- `giftPools(s, c)`：凜有 `oath` 時是 `RIN_OATH_GIFT_LINES`，否則 `GIFT_LINES[c]`。
- `giftLine(r, pools)`：婉拒 → `declined[mat]`；`healed && count === 1` → `healed[mat]`；其他 → 那個口味的池，索引 `(count − 1) % 長度`。
- `giftMood(c, taste, oath)`：凜沒有 `oath` 時一律 `normal`，其他照 `GIFT_MOOD`。
- `Game.give(c, mat)`：只在城鎮；成功就存檔。

- [ ] **Step 1：寫失敗的測試**（全部用注入的池）
  - `bond.test.ts`：每一種失敗理由；`a loved gift`（+4、素材 −1、`gifted` 有她；同一天第二份是 `today`）；`a new day, a new gift`（`bondDay` 換天就能再送）；`a declined gift is handed back`（素材、`gifts`、`gifted`、`bondPoints` 都不變，`refused` 有它）；`healed tastes wait for the last piece told`；`the gift cap`（30 時照樣收、`gained 0`）；`giftLine cycles by count`；`Rin's gifts read her choice`；`bond never falls`：固定種子 `mulberry32(1)` 產生 200 串、每串 30 步的隨機操作（送任一素材給任一人、加 `field`、加 `talk`、加一片記憶並說掉、換一天），每一步之後每位夥伴的 `bondPoints` 不比前一步小（rng 只在測試裡產生操作）。
  - `game.test.ts`：`gifts only in town, once a day`（地圖上是 `phase`；城鎮送一份成功並存檔；同一天第二份 `today`；`rest` 之後可以再送）；`give draws nothing`（`game.rng` 計數器）。
  - `data/bond.test.ts`：`gift pools are whole once written`（每一位已寫的：loved ≥ 2、liked ≥ 2、neutral ≥ 1、`declined` 的鍵剛好是她的 declined、`healed` 的鍵剛好是她的痊癒素材；凜要兩組都在）——今天兩張表都空，所以只用注入的反例證明它咬得到。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：全套、tsc、閘門 `gate-6`。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): gifts — tastes, repeats, once a day, nothing taken back`。

---

### Task 7：劇本格式、場景 id 與羈絆文字的守門

**Files:**
- Modify：
  - `data/story/scenes.ts`：`SceneId` 加 `` `bond:${CharacterId}:${number}` ``、`` `ending:${CharacterId}` ``、`` `romance:${CharacterId}` ``、`'together'`；註冊表（裁定 6）；`SCENE_IDS` 收註冊的（順序：既有的全部在前，之後 `bond`、`ending`、`romance`、`together`）；`sceneKind`、`lineCap`、`heavyScene`（裁定 8；`switch` 不加 `default`，讓 tsc 檢查窮舉）；`bondScene(c, n)`。
  - `data/story.zh-TW.ts`：`Choice { tone; text; reply: ScriptLine[] }`、`ChoiceLine { who: 'hero'; choices: Choice[] }`、`SceneLine`、`CHOICE_MAX_CHARS = 20`、`isChoice`、`worstCount`；`ScriptLine.if.tier?: { who: Companion; min: BondTier }`；`LineWhen.tiers?`（可選，沒有就是全 0）；`linesWhen` 改成泛型，`ChoiceLine` 一律留下；`buildScenes` 併入 `BOND_SCENES`；新場景的標題（`${name}・羈絆 ${n}`、`${name}・後日談`、`${name}・夜路`、`夜路・和大家一起`；介面標籤可以有數字）。**不改任何已寫好的劇情字串。**
  - `data/bond.zh-TW.ts`：`BOND_SCENES`（空）、`ROMANCE_LINES`（空）。
  - `engine/save.ts`：`together` 不可以出現在 `seen`、`fresh`、`queue`；`romance:<c>` 只能是 `romance:${story.romance}`。
  - `engine/story/bond.ts`：`talkPoints(c, tone | null): 2 | 3`。
  - `engine/game.ts`：`bondChoice(id, tone | null): boolean`（`id` 是 `bond:`、在 `pending`、不在 `seen`、同一個 `pending` 項目只接受一次 → 加分並回傳 true）。
  - `ui2/story.ts`：`linesOf` 填 `tiers`。
  - `data/story/story.test.ts`、`data/story/voice.test.ts`、`data/story/readAloud.ts`：新格式（下面）。
  - `engine/story/handbook.test.ts`：「每個場景剛好在一頁」的期望集合暫時去掉新的四種前綴，註解寫「Task 11 放上頁面」。
- Test：上面每一個測試檔，加 `data/bond.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`、`ui2/story.test.ts`、`engine/story/bond.test.ts`。
- 已知會紅：把 `SCENE_IDS` 長度寫死的測試（註冊表是空的，所以長度不變；若有測試列舉 `SceneKind` 的全部值，加上新的三種）。

**`story.test.ts` 與 `voice.test.ts` 的修改**（原意不變，只是看得到新格式）：
- 收集文字時略過 `tone`；選項的 `text` 與 `reply` 照樣收集。
- 讀「每一句」的閘門（說話者與表情、沒遇見的人不開口、劇透）改用 `flatLines`：選項展開成「洛恩說的 `text`」加每一個 `reply`。
- 句數改用 `worstCount(linesWhen(...))`；讀法多兩維：`tiers` 全 0 或全 4。
- `position(key)`：`bond:c:n` = 她的閘門的位置（夥伴：她相遇的階段，與她的回憶相同；凜：`pieces` 的那一片所在的階段，`oath` 閘門用揭露的位置）；`ending:*`、`romance:*`、`together` 是 `after`。`SPOILERS`、`RIN_SECRET_TERMS` 不放寬。
- `ownerOf`：`bond`、`ending`、`romance` 的本人；鎮民不在這三種裡開口（沒有 `BOND_GUESTS`，spec §0 D7）。
- `readAloud.ts`：朗讀稿可以輸出 `gift:<c>`（她的送禮反應，依池分段）與 `romanceLines`。

**`data/bond.test.ts` 的守門**（每一條附反例證明咬得到，照 L 的「the gate catches what it guards」寫法）：
- `every bond scene holds exactly one choice, and nothing else does`；
- `choices are two or three ways to say it`（2–3 個、語氣不重複、`text` ≤ 20 字、`reply` 1–2 句、不帶 `if`）；
- `registries match the scripts`（`BONDS_WRITTEN` 的人四段都在 `BOND_SCENES`，反過來也一樣；`ENDINGS_WRITTEN`、`ROMANCES_WRITTEN`、`TOGETHER_WRITTEN` 同理；`ROMANCE_LINES` 的人都在 `ROMANCES_WRITTEN`）；
- `bond copy names no season and no moon`（spec §0 D11：`春`、`夏`、`秋`、`冬`、`雪`、`滿月`、`新月`、`上弦`、`下弦`、`月相`、`春祭`、`星燈祭` 都不可以出現；`月亮` 可以——瑟蕾的月亮是她的人，不是日曆）；
- `Rin before her choice`：`bond:rin:1`、`bond:rin:2` 與 `GIFT_LINES.rin` 裡凜的句子沒有「洛恩」「我們」、語尾助詞（呢、吧、啦、喔、囉、嘛、耶）與「！」；表情只用 `normal`、`serious`、`guarded`；
- `who calls him what`（聖經 §3）：莎菲拉從不說「洛恩」；瑟蕾、諾艾兒、絲嘉蕾在不分讀法的送禮反應裡不叫洛恩（她們的稱呼在說完前後不同）；
- `light and heavy`（聖經 §2.2–§2.4）：羈絆、後日談、戀愛場景經 `buildScenes` 併進 `STORY.scenes`，`story.test.ts` 既有的 `lightBreaks`／`heavyBreaks` 閘門自動套用（依 `heavyScene`）；送禮反應與城鎮台詞不是場景，本檔照同樣的輕的規則另檢查：一句最多一個「……」、不以它開頭、「！」只給諾艾兒、波比、莎菲拉、莉茲。需要共用時把那兩個函式搬到 `data/story/voiceGates.ts` 匯出，行為不變；
- `the finale and the festival are untouched`：`finale` 與 `epilogue` 的 `lines` 和 `baseline` 的 JSON 逐字相同（Task 0 存的快照）；
- `no banter holds a choice or a tier`；
- `no room of his own`（I-121 的正規式）；
- `a romance keeps everyone`（每段 `romance:c` 至少一句有另一位夥伴，帶 `if.met`；沒有「吃醋」「離開隊伍」一類的詞，清單寫在測試裡）。

- [ ] **Step 1：寫失敗的測試**：上面的守門（今天表是空的，用注入的假場景與反例）；`save.test.ts` 的兩條 `corrupt`；`ui2/story.test.ts` 的 `tier conditions pick the right lines`、`a choice line always stays`；`bond.test.ts` 的 `talk points never miss`（每位每種語氣 ∈ {2, 3}、差 ≤ 1、`null` 是 2）；`game.test.ts` 的 `a choice counts once`（`promise` +3；第二次呼叫不加；`sceneDone` 之後 false；`null` +2；11 時 +3 只加到 12；不在 `pending` 是 false）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作並改寫上面列出的既有閘門。
- [ ] **Step 4**：全套、tsc、閘門 `gate-7`。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): the bond script — choices, tier conditions, registries and their gates`。

---

### Task 8：談心：閘門、一天一段、選項的播放

**Files:**
- Modify：`engine/story/bond.ts`（`nextBond`、`bondOpen`）、`engine/story/events.ts`（`sceneDone` 對 `bond:` 設 `talked` 與 `bondDay`）、`engine/game.ts`（`openBond`）、`ui2/story.ts`（`playScene` 播 `ChoiceLine`；`chosen()`；`playAndRecord` 先 `bondChoice` 再 `sceneDone`；`auto` 時 `bondChoice(id, null)`）。
- Test：`engine/story/bond.test.ts`、`engine/story/events.test.ts`、`engine/game.test.ts`、`ui2/story.test.ts`。

**Interfaces:**
- `nextBond(s, c, written = BONDS_WRITTEN)`：她已遇見、已註冊；她第一段沒看過、也沒過期的 `bond:c:n`；前一段看過或過期（不跳號）；`gateOpen(s, BOND_GATE[c][n])` 而且 `bondTier ≥ tier`。
- `bondOpen(s, written)`：依 `CHARACTER_IDS`。
- `Game.openBond(c)`：城鎮、`!today(s).talked`、`nextBond` 不是 null → 放進 `pending` 並回傳 id。
- `playScene` 遇到 `ChoiceLine`：對話框顯示洛恩的名牌與臉；在對話框上方開 `MenuView`（每列一個 `text`）；確認後播那一個的 `reply`；在選單上取消 = 跳過整段（照現在的跳過：摘要），選擇記成 `null`。

- [ ] **Step 1：寫失敗的測試**（注入的註冊表與假場景）
  - `bond.test.ts`：`BOND_GATE opens in order`（階段夠、碎片不夠 → null；都夠 → 那一段；第 1 段看過才開第 2 段）；`Rin's first two expire with her choice`（她有 `oath` 之後，第 1、2 段沒看過也不出現，第 3 段照樣能開）；`a companion's gate reads pieces told`（持有 4 片、只說了 2 片 → 第 2 段不開）；`unwritten, not offered`。
  - `events.test.ts`：`a bond scene marks the day's talk`；`arrivalScenes is unchanged by bond`：動手前在現在的程式碼上量三份存檔的 `arrivalScenes`（一份有幕節點、一份只有歸鄉、一份 `chat: false`），寫死 id；實作後同樣三份加上滿滿的 `bond` 紀錄與今天的 `talked`，結果相同；`bond scenes never enter the queue`。
  - `game.test.ts`：`one talk a day`（第二次是 null；`rest` 之後又可以；地圖上是 null）；`a talk cut short counts nothing`（`openBond` 之後不 `sceneDone`，用同一份存檔建新的 `Game`：`talked` 不在、`talk` 不變、`openBond` 再次成功）。
  - `ui2/story.test.ts`：`a choice plays its reply`（選 `stay`，播出的文字有它的 `reply`、沒有另外兩個；`chosen()` 是 `stay`）；`cancel on the choice skips the scene`；`a bond scene records the choice before it is done`（假 game 記錄呼叫順序）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：全套、tsc、閘門 `gate-8`、e2e（`ui2/story.ts` 動了）。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): a talk a day — bond gates and choices on screen`。

---

### Task 9：終幕之後：後日談、夜路、戀愛

**Files:**
- Modify：`engine/story/events.ts`（`nextEnding`；`arrivalScenes` 的 `o.ending`）、`engine/story/bond.ts`（`romanceCandidates`）、`engine/game.ts`（`arrive` 傳 `ending`；`walkAsked`、`walkOpen`、`chooseRomance`、`walkTogether`）、`data/story/scenes.ts`（註冊的 `romance:c` 加進 `SCENE_TIME`）。
- Test：`engine/story/events.test.ts`、`engine/story/bond.test.ts`、`engine/game.test.ts`。

**Interfaces**：裁定 11、12。

- [ ] **Step 1：寫失敗的測試**（每一個寫死的回城清單都寫明結尾的閒聊 id，或明確斷言沒有閒聊）
  - `events.test.ts`：
    - `the festival's return is as it was`：終幕之後第一次回城（`afterFinale`）與現在的程式碼結果相同（動手前量好寫死），沒有後日談；
    - `endings take the chat's place, from the next return`：下一次對話名額是第一位符合的 `ending:c`，後面接寫明 id 的閒聊（`ending:` 是輕的、終幕之後最多三段）；再下一次輪到下一位；
    - `a homecoming and its ending never share an arrival`；
    - `Chizuru's ending waits for the spring festival`（`SEASON_SCENES.spring` 注入已註冊時；沒註冊時不等）；
    - `an ending needs no bond`（好感度 10 也輪得到）；`a late meeting still gets her ending`；`no ending before the finale`；`unwritten endings are passed over`；
    - `a queued romance is heavy`（佇列有 `romance:liz` → 沒有閒聊）；
    - `the night, the dawn and the reactions are untouched`：終幕之後的回城，`planNight`、`dawnMemory`、`nextReaction` 的結果與加 `ending` 之前相同。
  - `bond.test.ts`：`romance candidates`（每個條件拿掉一個就不在名單；排序決定性；沒有人符合是空的）。
  - `game.test.ts`：`the choice is for keeps`（成功、`walkOpen()` 為假；再選別人是 `chosen`、值不變；存檔讀回仍是她）；`a romance cut short plays on the next return`（沒有閒聊；`sceneDone` 之後不在佇列）；`together writes nothing`（`JSON.stringify(state)` 不變；`walkOpen()` 為假；下一次 `arrive` 之後又為真）；`nobody eligible, no night walk`；`a romance is a night scene`（`sceneTime('romance:liz') === 'night'`）；既有的 `the return right after the finale plays no banter` 不改、維持綠。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：全套、tsc、閘門 `gate-9`。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): after the finale — the endings, the night walk, one romance for keeps`。

---

### Task 10：旅館「夥伴」與城鎮

**Files:**
- Modify：`ui2/scenes/facility.ts`（`speakAs(who, text, mood)`：讓夥伴在設施的對話框開口，名牌與臉來自 `speakerOf`，先清掉 `sayThen` 留著的第二個框；`play(id, o)` 加 `o.mode?`（玩家主動開的傳 `'all'`）與 `o.record?: false`（用 `playScene`、不 `sceneDone`））、`ui2/scenes/inn.ts`（「夥伴」）、`ui2/scenes/town.ts`（旅館的「新」、戀愛台詞進池子）、`data/text.zh-TW.ts`（`T.ui2.inn.partners`、`talk`、`gift`、`walk`、`together`、`talkedToday`、`nobodyToTalk`、`giftedToday`、`nothingToGive`、`askGift(name, item)`、`askRomance(name)`、`togetherSaid`；`T.ui2.bond.tiers`、`taste`）、`src/styles/_starlantern-ui.scss`（`.slx-fresh` 在旅館清單與城鎮選單也上色，沿用同一個顏色）。
- Test：`ui2/scenes/inn.test.ts`、`ui2/scenes/town.test.ts`、`ui2/scenes/facility.test.ts`。

**Interfaces：**
- 旅館的指令照舊四項，最後加「夥伴」（spec §0 D9；有談心可看或有夜路可走時右欄是「新」）。打開是一個清單：
  - 「談心」：今天談過 → `say(talkedToday)`；`bondOpen` 空 → `say(nobodyToTalk)`；否則列出（右欄「新」）→ `openBond` → `play(id, { mode: 'all' })`；
  - 「送禮」：列出已遇見、反應已寫的夥伴（今天收過的灰掉，右欄 `giftedToday`）→ 持有的 `GIFTABLE`（`itemName`，右欄是已知的口味：`gifts` 或 `refused` 有它才顯示）→ `confirmBox(askGift)`，預設「否」→ `game.give` → `speakAs(c, line, giftMood(...))`；失敗用 `T.ui2.inn` 自己的句子；
  - 「夜裡走走」：只在 `walkOpen()` 時出現。候選＋最後一列「和大家一起」；選她 → `confirmBox(askRomance)`，預設「否」（不能改）→ `chooseRomance` → `play('romance:c', { mode: 'all' })`；「和大家一起」→ `walkTogether()` → `play('together', { record: false })`，沒註冊時 `say(togetherSaid)`。
- 城鎮選單的「旅館」：`bondOpen` 不空而且今天沒談，或 `walkOpen()` 時，右欄「新」；到達的場景播完時重算。
- 進旅館的招呼照舊抽一次 `game.rng()`；夥伴清單本身不抽。

- [ ] **Step 1：寫失敗的測試**（注入註冊表與池）
  - `inn.test.ts`：「夥伴」在第五列、右欄「新」的條件；「談心」三種情況（播完 `talked`）；「送禮」：灰掉今天收過的、只列持有的可送素材、婉拒後素材數不變、第二次打開時那一項的右欄是「婉拒」、最愛送出後她說的是 `pools.loved[0]` 而名牌是她的名字（不是瑪莎）；凜選擇之前與之後說的池不同；「夜裡走走」只在 `walkOpen` 時出現、最後一列是「和大家一起」、確認框預設「否」、選了之後播 `romance:c`；`sayThen` 的第二個框不會接在她後面。
  - `town.test.ts`：`the inn shows 新 while a talk waits`；`the romance lines join the pool with one draw`（固定 rng 讓挑到池子最後，句子來自 `ROMANCE_LINES`；`game.rng` 次數與沒有戀愛時相同）。
  - `facility.test.ts`：`speakAs`、`play` 的 `mode` 與 `record: false`；公會、回憶、交還的既有測試維持綠。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：全套、tsc、e2e 三個專案（若 e2e 有斷言旅館指令的數量，改成結構斷言並列進報告）。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): the inn's partners — talks, gifts and the night walk`。

---

### Task 11：顯示：狀態頁、手冊、回城的升階行

**Files:**
- Modify：`ui2/scenes/statusTabs.ts`（夥伴能力頁標題列，`slx-stat-affinity` 旁邊加 `slx-stat-bond`「好感度　信賴」；洛恩沒有）、`engine/story/handbook.ts`（`PersonPage.bond`；人物頁的場景清單）、`ui2/scenes/handbook.ts`（人物頁的好感度區塊）、`engine/game.ts`（`bondUps`）、`ui2/scenes/town.ts`（升階行）、`data/text.zh-TW.ts`（`T.ui2.bond.line`、`score`、`source`、`full`、`rose`）、`src/styles/_starlantern-ui.scss`。
- Test：`ui2/scenes/status.test.ts`、`engine/story/handbook.test.ts`、`ui2/scenes/handbook.test.ts`、`engine/game.test.ts`、`ui2/scenes/town.test.ts`。
- 已知會紅：`handbook.test.ts` 的人物頁清單與「每個場景剛好在一頁」：照下面改。

**Interfaces：**
- `PersonPage.bond?: { tier; points; sources: { memory; talk; gift; field }: [now, cap][]; tastes: { mat; taste }[] }`：洛恩與沒遇見的人沒有；記憶是 `[3 × 持有, 3 × chainLength]`；送禮是 `min(giftPoints, 30)`；`tastes` 只列 `gifts` 或 `refused` 裡的，照 `GIFTABLE` 的順序。
- 人物頁的場景（只列看過的）：夥伴 `[...chats, ...bonds, ...banters, ...home, 'season:spring'（千鶴，日曆計畫已放）, 'ending:c', 'romance:c']`；凜照現在的清單，在 `chats` 之後插 `bonds`，最後加 `ending:rin`、`romance:rin`。`together` 不在任何一頁。「每個場景剛好在一頁」的期望改成 `SCENE_IDS` 去掉 `together`。
- 手冊區塊：「信賴　45／100」、四種來源各一行、滿了加「已滿」、已知的喜好；重看羈絆場景可以再選，但不加分（`replay` 用 `playScene`，本來就不經過 `playAndRecord`）。
- `bondUps`：裁定 14。

- [ ] **Step 1：寫失敗的測試**：`a companion's page shows her bond, the hero's does not`；`the bond page counts every source against its cap`；`a taste shows only once she has been offered it`（婉拒也顯示）；`bond scenes, endings and the romance are listed once seen`（凜在選擇前後都對）；`a replayed bond scene adds nothing`；`a run that raised a tier says so`；`a wipe keeps the news too`；`the tier line follows the banked line, with no draw`；`the tabs are there in order` 不改、維持綠。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：全套、tsc、閘門 `gate-11`、e2e 三個專案。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): bond on the status page, in the handbook and on the way home`。

---

### Task 12：寫作的準備：弧線、聖經、帳本

**Files:** SDD `arcs.md`；`docs/superpowers/story/starlantern-style-bible.md`（§2.2 的表）、`docs/superpowers/story/starlantern-lore-ledger.md`。沒有程式碼。

- [ ] **Step 1：九條弧線**（spec §0 D12；編劇的設計，控制者審過才寫句子）。`arcs.md` 每位一節：
  - 她想要的（慾望）與她需要的；她的毛病；毛病讓誰付出代價（洛恩，或點名一位她已經有摩擦的夥伴，照閒聊既有的摩擦，不另造）；
  - 四段各一行：1 慾望露出來（一件小事、一個笑點）；2 毛病付出代價；3 她做了一個違反毛病的小選擇；4 她為什麼留下（只對洛恩說；心動但不告白，沒被選上也成立）；
  - 每段的選項：三種語氣各會讓她怎麼回應，偏好的那一個多了什麼（笑了、多說一句）；
  - 後日談一行（歸鄉之後的日常；階段 ≥ 3 多的那一句是什麼）；戀愛一行（圍繞「回來」，其他夥伴在哪裡）；
  - 凜：第 1、2 段是揭露前的她（不叫名字、不說「我們」），第 3 段提起「那時候沒說的」，過期的玩家也接得上；戀愛裡她第一次主動說想要什麼（spec §9.5）。
  - 不重演閒聊已用掉的梗（I-158 到 I-160），回呼就變奏。
- [ ] **Step 2**：控制者派一位全新讀者讀 `arcs.md`：每一位的慾望與毛病是否清楚、彼此不同、和她的回憶不矛盾；四段是否真的在動。不及格改到及格。
- [ ] **Step 3**：聖經 §2.2 登記輕重（輕：羈絆 1–3、後日談、「和大家一起」、送禮反應、戀愛後的城鎮台詞；重：心契、戀愛）；帳本從下一個編號起登記（預期 I-201）：喜好表（Task 1 的 `tastes.md` 結果）、夜路（戀愛的地點，取代「星燈祭之夜」）、諾艾兒與星紋石、每位的心契內容一行、波比在戀愛裡改不改稱呼（「洛恩哥」是口頭習慣，I-151）。
- [ ] **Step 4**：commit：`docs(starlantern): bond arcs, the bible's weights and the ledger's new entries`。

---

### Task 13：寫作：送禮反應（九位）

**Files:** `data/bond.zh-TW.ts`（`GIFT_LINES` 九位、`RIN_OATH_GIFT_LINES`）、`data/bond.test.ts`、`data/story/voice.test.ts`、帳本。

- 每位：loved 2 句、liked 2 句、neutral 1 句、每種婉拒素材 1 句、每種痊癒素材 1 句；凜選擇之前與之後各一組（同樣的格數）。
- 婉拒不劇透：痊癒前的婉拒只說到相遇已經演出的程度；痊癒那一句可以說。
- 每一句是她一個人的一句對白，輕的；口頭禪、性格、和那個素材的關係要讀得出來。
- [ ] W1–W7（W8 不做：一句太短，盲聽沒有意義）。commit：`feat(starlantern): what each of them says to a gift`。

### Task 14：寫作：羈絆場景（凜、瑟蕾、千鶴）

**Files:** `data/bond.zh-TW.ts`（`BOND_SCENES` 的 12 段）、`data/story/scenes.ts`（`BONDS_WRITTEN` 加這三位）、`data/bond.test.ts`、`data/story/voice.test.ts`、帳本。

- 照 `arcs.md`：第 1–3 段 ≤ 6 句（最壞路徑），第 4 段 ≤ 10 句；每段剛好一個選項；地點卡用既有的 `Place`（白天的地點；不寫季節）；結尾停在一個畫面。
- [ ] W1–W8。commit：`feat(starlantern): bond scenes — Rin, Selene, Chizuru`。

### Task 15：寫作：羈絆場景（莎菲拉、希爾薇、諾艾兒）

同 Task 14。諾艾兒第一次叫「洛恩」的那一刻已經在 `chat:noel:2`；`bond:noel:3` 若要承擔它，用 `if.seen`／`notSeen` 寫兩種讀法（帳本記理由），不重複。希爾薇的 `unguarded` 留給心契。commit：`feat(starlantern): bond scenes — Safira, Sylvie, Noel`。

### Task 16：寫作：羈絆場景（波比、莉茲、絲嘉蕾）

同 Task 14。commit：`feat(starlantern): bond scenes — Bobby, Liz, Scarlet`。

### Task 17：寫作：後日談九段與「和大家一起」

**Files:** `data/bond.zh-TW.ts`、`data/story/scenes.ts`（`ENDINGS_WRITTEN`、`TOGETHER_WRITTEN`）、`data/bond.test.ts`、`voice.test.ts`、帳本。

- `ending:c` ≤ 6 句、輕的；歸鄉之後的日常，不重演歸鄉；階段 ≥ 3 多一句（`if.tier`）；最後一句能當這一次回城的收尾（後面會接閒聊）。
- 帳本 I-78（公主的下落）在 `ending:scarlet`；`ending:liz` 一句 `if.notReturned: 'orik'`：有希望的等待（紅帽子還掛在門後），**不寫相認**（I-113、I-117），整段沒有歐里克開口；凜交出的那枚鐘的去處（I-114）可以在 `ending:rin`。
- 千鶴的後日談在春祭之後（裁定 11），可以站在春祭上，但不寫「春」字（守門）——寫「祭典之後」「祠前的燈」。
- `together` ≤ 3 句：全隊在燈下，輕的。
- [ ] W1–W7。commit：`feat(starlantern): after-stories for all nine, and the walk together`。

### Task 18：寫作：戀愛九段與戀愛後的城鎮台詞

**Files:** `data/bond.zh-TW.ts`（`romance:c`、`ROMANCE_LINES`）、`data/story/scenes.ts`（`ROMANCES_WRITTEN`）、`data/bond.test.ts`、`voice.test.ts`、帳本。

- `romance:c` ≤ 12 句、重的、夜晚的夜路（地點卡 `night: true`，暗幕帶今晚的月色，但文字不寫月相）；洛恩的告白用他自己的方式，圍繞「回來」，不說英雄式宣言；至少一句有其他夥伴（`if.met`），沒有人失落、吃醋、退出；凜第一次主動說想要什麼，呼應「這個名字是我自己決定要用的」；諾艾兒告白時自稱掉回「我」；千鶴可以叫一次「洛恩」。
- `ROMANCE_LINES`：每人 2 句，輕的城鎮台詞。
- [ ] W1–W8。commit：`feat(starlantern): nine romances, one for keeps`。

---

### Task 19：驗收

**Files:** `tests/e2e/starlantern.spec.ts`；SDD `final.md`。

- [ ] **Step 1：e2e（先寫失敗的測試，再修到綠）**：用既有的 `setup` 與 debug hook（`window.__starlanternDebug.game`）設定狀態，不寫死任何劇情字串；進城後先把到達的場景播完（照既有的 `playOut`）；手冊用分頁名字找。
  - `gifts: a loved one and a declined one`：凜持有暮影布與王者之鱗；旅館 → 夥伴 → 送禮 → 凜 → 暮影布 → 確認：對話框是她的名字、暮影布 −1、`bondPoints` +4；同一天凜是灰的。住一晚，送王者之鱗：素材數不變、右欄「婉拒」。
  - `a talk with a choice, and a skipped one`：瑟蕾到 `bond:selene:1`；談心：選單有 3 個選項，選一個，`talk` 是 2 或 3、旅館的「新」消失；隔天看第 2 段時在選項上取消：摘要、`talk` 再 +2。
  - `after the finale: an ending, the night walk, the handbook`：終幕已過、`epilogue` 已看過、莉茲心契並看過 `bond:liz:4` 與 `home:liz`；回城：對話名額是一段 `ending:`，後面有寫明 id 的閒聊；旅館 → 夥伴 → 夜裡走走 → 莉茲 → 確認：戀愛結局播完、夜晚的暗幕在；指令消失；存檔讀回仍是莉茲；手冊 → 人物 → 莉茲：好感度區塊、可以重看。
  - `the inn's list stays inside its panel`：三個專案各量一次旅館與送禮清單的每一列都在面板內。
- [ ] **Step 2：全部的檢查**：全套兩行；tsc（總數 ≤ `baseline.md`、starlantern 0）；`grep -rn "it.fails\|it.skip\|\.only(\|\.todo(\|Math.random" src/scripts/games/starlantern` 沒有本計畫加的；閘門 `gate-19` identical、`cmp` 無差；第 21 項（含 `BANDS=1` 的 21e）綠；`git diff <BASE> --stat -- src/scripts/games/starlantern/engine/battle.ts src/scripts/games/starlantern/engine/combatant.ts` 沒有輸出；e2e 三個專案全綠。
- [ ] **Step 3：整份文字的冷讀**：全部羈絆文字的朗讀稿（依夥伴排）給一位全新讀者，及格條件同 W7，另加：九位讀起來是九個人；沒有一位的弧線停在原地。
- [ ] **Step 4：截圖**（scratchpad 的腳本，headless、靜音，不 commit）：夥伴清單、送禮兩層清單與反應、談心的選項、夜裡走走的選單與確認框、手冊的好感度區塊、狀態頁的好感度行、回城的升階行；三個 DPR 各一張。逐張看：沒有爆框、名牌與臉正確、右欄對齊、字級只有 12／24。
- [ ] **Step 5**：commit e2e：`test(starlantern): bond end to end — gifts, talks, the night walk`。
- [ ] **Step 6（控制者）：整體審查**：派一位沒參與實作的代理（Opus 5.5，不准用瀏覽器 MCP），依 `~/.claude/skills/review-pr/SKILL.md` 審查整個分支，對照 spec §0、§2 的反目標與 Review Focus；處理之後請它複審受影響的範圍。

---

### Task A（可選，需要使用者看過）：表情第 4 波

**範圍**（spec §0 D18）：九位夥伴的 `blush`、凜兩套的 `averted`、希爾薇的 `unguarded`、諾艾兒的 `smug`、波比的 `excited`，共 14 張；用在心契與戀愛最重要的那幾句。**沒有它，遊戲照樣完整**：這些表情今天借用已發佈的臉，沒有一句沒臉。

**Files:** `art-factory/starlantern/`（runs、prompts、registry）、`public/assets/games/starlantern/char/`、`render/artPaths.ts`（`PUBLISHED_FACES`）、`render/artPaths.test.ts`（總數加 14）。

- 流程照 `art-factory/starlantern/contract.md` 與前三波：codex 靜態圖 → `sl_art.py process`（頭貼 `--height 115`、`allow_edge: ["bottom"]`）→ 機械 QA（magenta 殘留 0、半透明 0、只碰底邊）→ 審核頁 → **使用者看過一批說可以** → 發佈與 registry 同一個 commit；退件不留在 runtime。prompt 用 spec §10.5 的句型與表情句。
- 和其他任務沒有檔案衝突；寫作任務不必等它（沒圖時自動借臉，有圖時自動換上）。

---

## 驗收條件（整份計畫）

- 九位夥伴都有：好感度與五個階段、四段羈絆場景（各一個選項）、送禮反應、後日談、戀愛結局與兩句城鎮台詞；`BONDS_WRITTEN`、`ENDINGS_WRITTEN`、`ROMANCES_WRITTEN` 都是九位，`TOGETHER_WRITTEN` 為真，`GIFT_LINES` 九位、`RIN_OATH_GIFT_LINES` 存在。
- 只刷一種來源到不了頂；好感度永遠不下降；一天一份禮、一段談心；選項沒有錯的答案。
- 後日談不看好感度；戀愛只有明確選擇才成立、選了不能改、其他人都在。
- 普通難度的 sim gate identical、`contribution.8d-final.160.json` 用 `cmp` 無差；`battle.ts`、`combatant.ts` 沒有 diff；`withBondScale(0)` 下的下潛快照不變。
- 第 21 項（21a–e）綠，`BOND_PCT` 的最後值記在 commit 與 `bond-baseline.md`。
- 夜晚、清晨、下潛前的那一夜、反應槽、群戲、春祭、`epilogue`、終幕都沒變（回歸測試與 `the finale and the festival are untouched`）。
- master 上沒有任何暫定文案；沒有新圖（Task A 除外，而且要使用者看過）。

## 驗證

| 項目 | 指令 | 通過條件 |
|---|---|---|
| vitest 全套 | `rtk proxy npx vitest run --testTimeout=20000` | 全綠，兩行記進 `final.md` |
| tsc | `rtk proxy npx tsc --noEmit -p .` | 全 repo 總數 ≤ `baseline.md`（寫計畫時 773）；`src/scripts/games/starlantern/`、`tests/e2e/starlantern*.ts` 底下 0 |
| e2e | `E2E_PORT=4352 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts`，`chromium`、`chromium-dpr125`、`chromium-dpr150` | 三個專案全綠；headless、`--mute-audio`；不用瀏覽器 MCP |
| sim gate（普通） | `rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-0`；`cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` | `gate: identical`；`cmp` 無輸出 |
| 加成的平衡 | `BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.bond.test.ts --testTimeout=300000`，再加 `BANDS=1` 跑 21e | 21a–e 綠；紅了只調低 `BOND_PCT`（最多四輪） |
| 下潛快照 | 全套裡的 `engine/storyL.dive.test.ts`（`withBondScale(0)`） | 與 fixture 相同，不重錄 |
| 文字 | W6 朗讀稿、W7 冷讀、W8 盲聽、Task 19 Step 3 | 每一份及格紀錄在 SDD |

**為什麼「小幅加成」不會讓普通的閘門動**：閘門與第 1–20 項只用 `partyAt`／`kitParty` 組的隊伍，它們從來沒有 `bond`（只有 `Lineup.bond === 'max'` 才給，只有第 21 項用），而且戰鬥引擎沒有改。加成對真實玩家是刻意的小幅變強，量法是第 21 項：用全員心契重跑普通的第 4、10、11、14、18d 項與噩夢 N4、地獄 H3 的「沒有符文打不過頭目」上限，門檻一字不改，紅了只能調低 `BOND_PCT`。
