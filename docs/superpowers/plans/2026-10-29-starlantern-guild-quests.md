# 星燈迷宮 公會委託（Guild Quests）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 冒險者公會多一面布告欄。每次從迷宮回來，五位鎮民在上面留 3–5 張紙條：討伐、掃蕩、懸賞、探路、收購；接下、下去做、回來回報，拿金幣、素材、碎片、符文與功績，功績升公會評等（見習到四燈）。之後五位鎮民在交還碎片之後各有一則指名委託。開關關著或第一幕結束之前，遊戲逐位元不變。

**Architecture:**
- **一道開關**：`GUILD_LIVE`（`data/guild.ts`），PR D 之前是 `false`。關著：沒有指令、不貼布告、不寫 `GameState.guild`。開著但 `story.act1Cleared` 為假：多一個指令與一句台詞，不寫狀態（spec §0 第 15、16 條）。
- **進度全部由既有狀態推導**：圖鑑 `felled`、`dungeon.reached`、`inventory`。接下時記基準（`base`），進度是差值。戰鬥、移動、掉落的程式一行都不改；`submitRound`（`noteFelled` 之後）與 `changeFloor` 只多做一次純函式的比較，給介面顯示「委託達成」。
- **一條新串流**：`guildRng(state, day) = mulberry32(mix(state.forgeSalt ^ GUILD_SALT, day))`，`GUILD_SALT = 0xb5c0fbcf`，只在貼布告時用。報酬在貼布告時就算好、存在委託裡；接下、放棄、回報一個亂數都不抽。`game.rng`、`lootRng`、`memoryRng`、`trophyRng`、`runeRng`、`spotRuneRng`、`forgeRng`、`absorbRng`、`affixRng` 的抽取次數一次都不變。
- **先引擎、再介面、再文字、最後上線**：PR A（資料、引擎、存檔、經濟）→ PR B（介面）→ PR C（文字與冷讀）→ PR D（打開開關與 e2e）→ PR E（指名委託）。PR F（評等章與種類小圖示）等使用者核准風格樣本，和其他 PR 無關。

**Tech Stack:** TypeScript、Vitest（happy-dom）、Playwright e2e、Python（Pillow／numpy，只在 PR F）、codex 圖片生成（`codex_still.py`，只在 PR F）、Git Bash。

**Spec:** `docs/superpowers/specs/2026-10-29-starlantern-guild-quests-design.md`（下稱 spec §）。**spec §0 是定案紀錄；本計畫的「計畫裁定」和 spec 正文衝突時，以裁定為準，並在同一個 PR 抄回 spec §0。** 另外要讀：
- `docs/superpowers/plans/2026-10-26-starlantern-roster.md`：Global Constraints、閘門、W1–W7、收尾 G 的寫法（本計畫照抄並改小）；
- `docs/superpowers/specs/2026-10-17-starlantern-story-world-design.md` §3.1、§3.5、§11.3；`docs/superpowers/plans/2026-10-18-starlantern-plan6c-writing.md:562-565`；
- `docs/superpowers/story/starlantern-lore-ledger.md`（帳本）§3、I-72、I-88、I-89、I-117、I-126、I-135、I-182；`docs/superpowers/story/starlantern-style-bible.md`（聖經）§2.3–§2.5、§3（安娜、歐里克、瑪莎、葛倫、多蘭；千鶴、莎菲拉、希爾薇、諾艾兒、莉茲、絲嘉蕾）；
- `docs/superpowers/plans/2026-10-23-starlantern-story-structure.md:187-217`（W8 冷讀的題目與盲測）；
- `engine/forge/economy.test.ts`（價值的定義）；`engine/runeEconomy.guard.test.ts`（掃原始碼的守門寫法）；`engine/bestiary.ts`（`repairBestiary` 的修復寫法）。

**範圍外**：採集、難度限定裝備、NPC 立繪、劇情美術（只留 spec §12 的接口）；一趟之內的限制條件；高難度專屬委託；好感度的新來源；舊存檔遷移；任何既有劇情場景、招呼、城鎮台詞的修改；任何平衡旋鈕與凍結檔。

> 沒有以 `src/`、`tests/`、`docs/`、`scripts/`、`art-factory/`、`public/`、`.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。SDD 紀錄目錄是 `.superpowers/sdd/2026-10-29-starlantern-guild/<PR 代號>/`，下稱 SDD（已被 `.gitignore` 排除）。行號只用來定位，動手時一律用內容找。

---

## 對照報告：spec 各節 × 2026-10-29 的程式碼

| spec | 接到哪裡 | 位置 | 備註 |
|---|---|---|---|
| §0.1 指令 | `GuildScene.commands()` 最後一項 | `ui2/scenes/guild.ts:49-52` | `guild.test.ts:46-49` 逐字釘住清單：開關關著不變；D1 打開時改 |
| §0.2 貼布告的時機 | `arrive()` 推進日子之後 | `engine/game.ts:1511` | `arrive` 本身不存檔；下一個城鎮動作存 |
| §0.4 討伐、掃蕩、懸賞的進度 | `state.bestiary[id].felled` | `engine/bestiary.ts:38-40`；`engine/game.ts:741` | 召喚的算、幻影與逃走的不算（圖鑑本來的規則） |
| §0.4 探路 | `dungeon.reached[r]` | `engine/game.ts:1608` | `MAX_REACHED = 250` |
| §0.4 收購 | `state.inventory[mat]` | `engine/town.ts:20`（`addItem`） | 背包裡的不算，`toTown` 存進倉庫才算 |
| §0.5 見過 | `bestiary[id].seen ≥ 1`、`listedEnemy` | `data/monsters.ts:62` | 2026-10-29 的 `ROSTER_LIVE` 到 L3b 為止（腐毒、暗影、鋼鐵在 L4，進行中）；本計畫一律讀 `listedEnemy`，不假設哪一波已上線，測試用 `withRosterLive`／`withRosterOnly` 造情境 |
| §0.6 排除 | `remnant`、`lore`、`story`、`rank: 'part'`、`lantern-mother` | `engine/types.ts:252-321`；名冊計畫裁定 6 | |
| §0.13 鹽 | `GUILD_SALT = 0xb5c0fbcf` | `engine/loot/drops.ts:195-197` | 加進名冊的 `salts are distinct`（`data/monsters.test.ts`） |
| §0.14 存檔 | `isValid`、`repairBestiary` 之後 | `engine/save.ts:199`、`:332` | `SAVE_VERSION` 9 |
| §5.1 委託深度 | `BAND_DEPTHS` | `engine/story/handbook.ts:168` | A2 export |
| §5.3 懸賞的表 | `MAINLINE_BOSSES`、`REGION_BOSSES`、`MAINLINE_WARDENS`、`REGION_WARDENS` | `data/monsters.ts:166-185` | `hauntsOf` 用的同一張（`engine/story/handbook.ts:171-186`，A2 export） |
| §5.4 出發深度 | `startDepths` | `engine/dungeon/run.ts:94-99` | 頭目懸賞要求那一層 ≤ `reached` |
| §6.1 碎片等級 | `shardGrade(depth, roll)` | `data/story/fragments.ts:13` | 純函式，`roll` 由 `guildRng` 給 |
| §6.1 符文 | `state.runes`、`RUNE_STACK`、`RUNE_SELL` | `data/runeEconomy.ts`；`data/runes.ts:11-13` | 入袋用既有的加符文函式（A4 找出它的名字；沒有就照 `grant` 的符文分支） |
| §8.1 「新」 | 旅館列的 `right`／`rightClass` | `ui2/scenes/town.ts:134-138`；scss:723 | `.slx-town .slx-fresh` 已有 |
| §8.4 回報的存檔 | 照 `Game.returnFragment` | `engine/game.ts:1237-1247` | |
| §8.5 戰鬥結果 | `lines` | `ui2/scenes/battle.ts:686-747` | `end` 是 `submitRound` 的回傳（`engine/game.ts:832`） |
| §8.5 探路 | `descend` 的第二行 | `ui2/scenes/dungeon.ts:359-371` | |
| §8.5 迷宮選單 | 第 12 項 | `ui2/scenes/dungeon.ts:42`、`:430-459` | `dungeon.test.ts:909` 逐字釘住 id：D1 改 |
| §8.5 回城 | `bondUps` 之前 | `ui2/scenes/town.ts:98-131` | |
| §7.3 文字的檢查 | `storyTexts()` 併入、`POLISHED` | `data/story/voiceGates.ts:16-36`；`data/story/voice.test.ts:15-63` | 照好感度的 `BOND_SCENES` |
| §9.5 逐位元 | sim gate、`legacyFights.test.ts`、`floors.snapshot.test.ts`、`storyL.dive.test.ts` | `scripts/starlantern-sim-gate.sh`；`engine/legacyFights.test.ts` | 新增城鎮快照 `engine/guild.legacy.test.ts`（A0） |

## 計畫裁定

spec 是控制者授權的設計者草案；下面是 spec 沒寫細的地方，全部是「計畫裁定」，同時抄進 spec §0。

1. **分期與 PR**：照「分期與 PR」表。開工條件：B 要 A 已合併；C 要 B 已合併（文字要放進 B 的畫面與註冊表測試）；D 要 A、B、C；E 要 D；F 只要使用者核准 F2 的風格樣本，和 A–E 都不衝突（F4 的介面接線要 B 已合併）。每個 PR 的第一個任務錄自己的 `gate-0`。
2. **檔名**：`data/guild.ts`（開關、鹽、評等、權重、報酬、委託人、能交的貨的種類）、`data/guild.test.ts`、`data/guild.zh-TW.ts`（`GUILD_TEXT`）、`engine/guild.ts`（純函式）、`engine/guild.test.ts`、`engine/guild.economy.test.ts`、`engine/guild.guard.test.ts`、`engine/guild.legacy.test.ts`、`engine/__fixtures__/guild/town.before.json`、`ui2/scenes/board.ts`（布告的 layer 與詳細欄，由 `GuildScene` 開；不是獨立的 `SceneName`）、`ui2/scenes/board.test.ts`。
3. **`engine/guild.ts` 的介面**（A2–A4 各自實作一部分）：
   - `guildRng(s, day): Rng`；`GUILD_SALT` 在 `data/guild.ts`。
   - `huntPool(s)`、`sweepPool(s)`、`bountyPool(s, rank)`、`scoutPool(s)`、`deliverPool(s)`：候選，排序固定（`ENEMIES`、`MATERIALS`、`REGIONS` 的鍵順序），不抽亂數。
   - `postBoard(s): GameState`：`guild.day === dayOf(s)` 就原樣回傳（冪等）；否則換掉 `offers`、保留 `active`，寫 `guild.day`。第一次（`guild` 不存在）建立 `{ day, offers, active: [], merit: 0, paid: 0 }`。
   - `progressOf(s, q): { have: number; need: number; done: boolean }`。
   - `accept(s, offerId)`、`abandon(s, questId)`、`turnIn(s, questId)`：回傳 `TownResult`（`engine/town.ts:15-18` 的形狀），失敗原因 `locked`（未開放）、`full`（手上滿了）、`stock`（貨不夠）、`invalid`（找不到、未達成、已回報）。`turnIn` 成功時另外回傳 `{ reward, rankUps: number[], remark?: CharacterId }` 給介面說話。
   - `rankOf(merit)`、`rankUps(before, after)`、`questsNewlyDone(before: GameState, after: GameState): string[]`（介面用；只比較 `active`）。
   - `knownMaterial(s, id)`、`questDepth(kind, target, s)`。
4. **`Game` 的方法**（A7）：`board(): GuildState | null`（開關或未解鎖回 `null`）、`openBoard()`（補貼＋寫 `viewed`、`intro`，存檔）、`acceptQuest(id)`、`abandonQuest(id)`、`turnInQuest(id)`；每一個成功都 `saveInTown`（照 `returnFragment`，`engine/game.ts:1237-1247`）。`get questsReady(): number`（進行中而且達成的件數）。`submitRound` 的回傳 `end` 加 `quests?: string[]`；`changeFloor` 之後在 `Game` 上留 `scoutDone?: string[]`，`ui2/scenes/dungeon.ts` 讀完就清。全部在 `GUILD_LIVE && act1Cleared` 之下；否則什麼都不做、不讀。
5. **貼布告的抽法**（A3，寫進 `engine/guild.ts` 的註解）：每一格依序：
   1. 第 0 格：評等 ≥ 一燈而且懸賞候選非空時固定懸賞；四燈時第 1 格也固定懸賞。其餘格子抽種類：`pickWeighted(rng, WEIGHTS × 是否開放 × 候選是否非空)`。
   2. 抽目標：`pick(rng, pool)`；同一張布告已有同種類同目標就重抽，最多 8 次，抽不到這一格留空（`offers` 變短，不補）。
   3. 探路多抽一次 `k = randInt(rng, 3, 5)`。
   4. 懸賞多抽兩次碎片等級（`shardGrade(d, rng())`），二燈以上而且 `runesOpen` 再抽一次符文 id（`pick(rng, GUILD_RUNES)`）。
   5. `variant = day % 2`；委託人由種類決定；報酬由 `data/guild.ts` 的公式算。
   - 抽的總次數不固定；但每一格的抽取只依賴前面的格子與 `state`，所以同一個 `(forgeSalt, day, state)` 永遠是同一張布告。
6. **符文池**：`GUILD_RUNES`（`data/guild.ts`）是 `data/runes.ts` 裡一般符文的 id 清單（不含傳說、不含 `RUNE_STOCK` 的四種商店符文），A3 從資料產生後寫死成字面值，另加一條測試確認每個 id 都存在於符文資料。
7. **委託深度**（`questDepth`）：照 spec §5。燈喰之獸（`lanterneater`，預設頭目）取 5。不在任何表的頭目（理論上沒有）取 `reached.mainline`。
8. **「認得」的素材**（`knownMaterial`）：`monster`／`trophy`：存在一個 `felled ≥ 1` 的物種，它的 `drops` 有這個素材；`region`：`REGIONS` 裡以它為 `material` 的地區 `reached ≥ 2`。
9. **掃蕩的凍結清單**：接下時寫 `ids`（那個地區的原生、`listedEnemy`、非殘影、沒有 `lore` 的物種，依 `ENEMIES` 的順序），`base = Σ felled(ids)`。
10. **頭目懸賞的可達**：頭目在 `bossFor` 表上的深度 `d`，要求 `d ≤ reached[r]`；本道第 3 層的劇情頭目與終幕不算（它們不在 `MAINLINE_BOSSES`）。
11. **賀禮**：`RANKS[i].gift`（`data/guild.ts`）；`turnIn` 依序補發 `paid + 1 … rankOf(merit)`，寫 `paid`。
12. **夥伴的一句話**：`turnIn` 算 `remark`：委託的地區（掃蕩、探路是 `target`；討伐是物種的 `home`；懸賞是表上的地區；收購的地區素材是那個地區；其他沒有）→ `MEETINGS` 裡那個地區的夥伴 → 她 `recruited` 而且在 `party.grid`。本道沒有。
13. **`hauntsOf`、`BAND_DEPTHS` export**（A2）：只加 `export`，內容不動；`engine/story/handbook.test.ts` 照舊綠。
14. **介面的位置**：布告是 `GuildScene` 推的一個 layer（照碎片交易所），程式放 `ui2/scenes/board.ts`（`openBoard(scene)` 與 `BoardLayer` 類別），讓 `guild.ts` 不再變長。左右鍵由 `BoardLayer.onAction` 先處理。
15. **城鎮快照**（A0）：`engine/guild.legacy.test.ts` 的腳本只用 `Game` 的公開方法與 `engine/testing.ts` 既有的工具；每一步存檔字串的 SHA-256 寫進 `engine/__fixtures__/guild/town.before.json`。`GUILD_RECORD=1` 時寫、否則讀；fixture 不存在時失敗。本計畫任何任務都不可以重錄它。A7、D1 加兩個情境：開關開著但 `act1Cleared` 被擋（測試把腳本裡的第三層頭目換成不給 `act1Cleared` 的路線，或在每一步後檢查 `state.guild === undefined` 並比對雜湊——A0 實作時二擇一，寫進 baseline）；開著而且解鎖，刪掉 `guild` 欄位後比對。
16. **文字併進檢查**：C1 把 `GUILD_TEXT` 併進 `storyTexts()`（照 `BOND_SCENES`，`data/story/voiceGates.ts:16-36`），前綴 `guild.` 加進 `POLISHED`；`position()`（`data/story/story.test.ts:366-425`）加 `guild` 的位置：一般委託 `act1`，`guild.personal.<id>` 是「那位鎮民交還之後」。名冊 A5 的名字掃描清單抽成 `data/guild.test.ts` 也能用的常數（若它是 `monsters.test.ts` 裡的區域變數，C1 把它移到 `data/monsters.ts` 旁的測試共用檔，不改內容）。
17. **介面字串與故事字串分開**：`T.ui2.board`（`data/text.zh-TW.ts`，B1）只放分頁名、種類名、格式函式、按鈕、空狀態、評等名；所有鎮民與夥伴說的話在 `GUILD_TEXT`（C2、C3）。B 的介面測試用 `GUILD_TEXT` 的註冊表鍵（C1 之前是空的物件，B 的測試以「有字串就顯示、沒有就不說」寫；C 補上字串後 D 的 e2e 檢查真的有說）。**介面不顯示任何佔位文字**：B 合併時 `GUILD_LIVE` 仍是 `false`。
18. **e2e**：D2 起。e2e 的種子與存檔用既有的 `w.*` 工具；解鎖路線用 e2e 既有的「第一幕結束」流程（先 grep 有沒有；沒有就以 `localStorage` 注入一份測試存檔，照 e2e 既有的存檔注入寫法）。
19. **PR F 的美術**：照 `art-factory/starlantern/contract.md` 新增兩列（`guild-rank`、`quest-kind`）；風格樣本由使用者核准（`approve --batch g0 --by "<使用者原話> <YYYY-MM-DD>"`）之後，其餘照名冊裁定 21 的「機械 QA＋全新脈絡的獨立代理審核」發布。codex Plus 額度用完改用 codex credits，兩者都用完才暫停回報；絕不用佔位美術。

## 分期與 PR

| PR | 分支 | 內容 | 任務 | sim gate | 美術 |
|---|---|---|---|---|---|
| **A** 骨架 | `feat/starlantern-guild-a` | 城鎮快照、開關與資料、候選、貼布告、進度與回報、存檔、經濟測試、`Game` 接線 | A0–A7（8） | identical | 0 |
| **B** 介面 | `feat/starlantern-guild-b` | 介面字串、指令與鎖、布告 layer、接下／放棄／回報／升級、評等頁、迷宮與城鎮的提示 | B1–B5（5） | identical | 0 |
| **C** 文字 | `feat/starlantern-guild-c` | 文字註冊表與守門、紙條與回信、安娜與夥伴的台詞；帳本 | C1–C3（3） | identical | 0 |
| **D** 上線 | `feat/starlantern-guild-live` | 打開 `GUILD_LIVE`、既有清單測試改寫、e2e | D1–D2（2） | identical | 0 |
| **E** 指名委託 | `feat/starlantern-guild-personal` | 五則指名委託的資料、引擎、評等頁、文字與冷讀 | E1–E3（3） | identical | 0 |
| **F** 美術（等使用者） | `feat/starlantern-guild-art` | 評等章 ×5（16／48 px）、種類小圖示 ×5（14 px）：契約、風格樣本、生成與發布、介面接線 | F1–F4（4） | 不跑（F4 只動 `ui2/`、`render/`） | 15 張（章 10、圖示 5） |

合計 6 個 PR、25 個任務。每一個任務的普通帶報告都是 `gate: identical`（委託不碰戰鬥）；沒有任何任務可以重錄 sim gate。

---

## Global Constraints

**使用者的方向（最高依據）**
- 「先把遊戲本身做好」：內容、功能、玩家體驗；平衡不是優先（`starlantern-balance-not-priority`）。
- 只有畫風與重大取捨找使用者；技術規格、數值、劇情由控制者決定。本計畫唯一要使用者的是 PR F 的風格樣本（spec §14）。
- 日系 RPG 的輕快、有梗；沉重留給回憶；這個功能一個「……」都不用（spec §7.3）。

**分支與基準**
- 計畫與 spec 定案在 `docs/starlantern-guild-quests`（本 commit）。每個 PR 的實作分支從開工時的 `origin/master` 開出，先 cherry-pick 本計畫的 commit（若還沒合併）。
- 開工前 `git status` 乾淨；要改的檔案有別人未提交的修改，NEEDS_CONTEXT。

**模擬閘門**（每一個碰到 `engine/`、`data/` 的任務都跑；每個 PR 的第一個任務錄 `gate-0`）
- 指令：`rtk proxy bash scripts/starlantern-sim-gate.sh <SDD>/gate-<N> <SDD>/gate-0 > <SDD>/gate-<N>.stdout`。
- 每一個任務：最後一行必須是 `gate: identical`；`cmp <SDD>/gate-<N>/contribution.json src/scripts/games/starlantern/engine/__fixtures__/sim-gate/contribution.8d-final.160.json` 沒有輸出。
- `engine/parity.test.ts` 的 `PARITY_TASK` 維持 `between plans`；本計畫不錄任何 `contribution.*.json`。
- **逐位元的其他證據**（每個碰 `engine/`、`data/` 的任務都跑，一律不重錄）：`engine/legacyFights.test.ts`（釘子不變）、`engine/floors.snapshot.test.ts`、`engine/storyL.dive.test.ts`、`engine/guild.legacy.test.ts`（A0 起）。任何一個紅就 BLOCKED。
- 不用 `Math.random`、不讀 `Date`；不為舊內容多抽任何既有串流。
- **和名冊 L4 的關係**：L4 合併會改 `ROSTER_LIVE` 與 sim gate 的報告。本計畫的任何 PR 在 L4 合併之後 rebase，就重錄自己的 `gate-0`（從新的 `origin/master`）再跑；A2、A3 的一千種子測試照當下的 `ROSTER_LIVE` 跑，不釘上線的物種數。

**測試與檢查**
- **TDD**：先寫失敗的測試，確認它因正確的理由失敗，再實作。寫作任務照 W 步驟。美術任務照工具測試先行。
- **vitest**：單檔 `rtk proxy npx vitest run --testTimeout=20000 <完整路徑…>`；全套 `rtk proxy npx vitest run --testTimeout=20000`，讀「Test Files」「Tests」兩行。不可以用 `npm run test`（watch 模式）。
- **tsc**：`rtk proxy npx tsc --noEmit -p .`。`src/scripts/games/starlantern/` 與 `tests/e2e/starlantern*.ts` 底下 0 個；全 repo 總數不多於 PR 開工時 `baseline.md` 記的值。
- **e2e**：`E2E_PORT=4353 rtk proxy npx playwright test tests/e2e/starlantern.spec.ts --project=chromium --project=chromium-dpr125 --project=chromium-dpr150`。一律 headless、靜音（不可以拿掉 `--mute-audio`）。**絕不用 4354**；不結束任何程序。**不用 Playwright MCP 或任何瀏覽器 MCP 工具**（`mcp__plugin_playwright_*`、Claude in Chrome、內建瀏覽器、computer-use）。
- **重的工作**（閘門、e2e、全套、生成）之前：照控制者當時指定的 `heavy.lock` 規則（檔案已存在就等，絕不結束程序）；沒有指定時 PowerShell `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory` ≥ 6291456（KB），一次只跑一套重的工作；瑪奇的模擬器在跑時先問控制者（`heavy-tests-yield-to-emulators`）。
- 本專案沒有 prettier、eslint。一次性的探測程式跑完就刪，絕不 commit。
- **測試修改規則**：每個任務的 Files 列出已知會紅的既有測試與改法；不放寬門檻、不刪斷言、不加 `skip`／`only`／`todo`／`it.fails`；全套出現沒列到的紅燈就 NEEDS_CONTEXT。

**決定性**
- `engine/guild.ts` 只用 `guildRng`；接下、放棄、回報、打開布告、算進度都不抽任何亂數（`engine/guild.guard.test.ts` 掃原始碼、`Game` 層的計數測試）。
- 布告以 `(forgeSalt, day, state)` 決定；同一天貼兩次相同。
- 所有清單與候選依資料表的鍵順序；不依 `Object.keys` 以外的任何不穩定順序（例如 `Set` 的插入順序要和資料表一致）。

**存檔**：新欄位只有 `GameState.guild?`（spec §9.3）；`SAVE_VERSION` 維持 9；不寫遷移。

**平衡（凍結）**
- `balance*.test.ts`、`builds.bands.*.test.ts`、`tierBands*.test.ts`、`tierBands.ts`、`buildBands.ts`、`legacyFights.test.ts` 一個字都不改。
- 不動任何既有旋鈕（`ENEMY_POWER`、`ELITE`、`GEAR_CHANCE`、`BOSS_LEGENDARY`、`TIERS`、`AFFIXES`、`BOND_*`、`SHARD_*`、`TOWN_DROP`、`RUNE_*`、`PERKS`、店價、賣價）。委託只「加」報酬，不改既有的任何一個數字。
- 委託報酬的數字（`data/guild.ts`）是【起始提案】；`engine/guild.economy.test.ts` 的上限紅了只調一次公式，還紅就具名例外加待辦，不卡上線（`starlantern-balance-not-priority`）。正確性的經濟測試（spec §10 第 1–5、7 條）不准放寬。

**文字**
- 介面字串在 `data/text.zh-TW.ts` 的 `T.ui2.board`；鎮民與夥伴說的話在 `data/guild.zh-TW.ts`（spec §7.3）。先 grep 確認不撞名。
- 「冒險者公會」不寫成「冒險公會」、「菁英」不寫成「精英」、「回復」不寫成「恢復」（`data/terms.test.ts:96-101`）。
- 每一個新字都要在 Cubic 11 裡（`data/glyphs.test.ts`，它會走遍 `data/`、`ui2/`、`engine/` 的非測試檔；新檔自動被掃，B1、C1 確認）。不用 ▶ ◀ ▸ ▾（字型裡沒有）。
- 字級只有 12／24px（`ui2/typeScale.test.ts`）；新介面只用既有元件（`MenuView`、`win`、`confirmBox`、手冊式的分頁、召回的清單＋詳細欄）；SCSS 只改 `src/styles/_starlantern-ui.scss`，禁 `!important`、行內樣式、`element.style`。

**換行**（改檔前 `git ls-files --eol <檔>`，改完 `git diff --stat` 必須等於 `git diff --stat --ignore-cr-at-eol`；整檔被改寫就是換行壞了，立刻再改一次修回；CRLF 與混用檔不可以用 `sed -i`；新檔一律 LF。2026-10-29 量到的：）
- LF：`data/monsters.test.ts`、`data/story/{readAloud,voiceGates,voice.test,story.test}.ts`、`engine/bestiary.ts`、`engine/forge/economy.test.ts`、`engine/loot/runes.test.ts`、`engine/story/handbook.ts`、`ui2/lateArtScenes.test.ts`、`ui2/scenes/{dungeon,dungeon.test}.ts`、`docs/superpowers/**/*.md`。
- CRLF：`engine/{state,testing,game.test}.ts`、`render/artPaths.ts`、`ui2/scenes/{guild,guild.test,town}.ts`、`art-factory/starlantern/contract.md`。
- 混用（新行照相鄰行）：`data/text.zh-TW.ts`、`engine/{game,save,save.test}.ts`、`ui2/scenes/{battle,battle.test,town.test}.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`。
- 上面沒列到的檔，動手前一律先 `git ls-files --eol` 量。

**git**
- 用完整路徑 add，不可以 `git add -A`／`git add .`。
- Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不可以 `git checkout -- <path>`、`restore`、`reset`、`stash`、`clean`、`worktree remove --force`；要撤回就再改一次檔案。不 push（控制者在驗收後決定）。不碰 `.env`、智能合約、部署腳本。

**收尾 G（每個任務）**
1. 全套全綠；tsc 符合上面的條件。
2. 碰到 `engine/`、`data/` 時跑閘門（`gate-<N>`）與 `cmp`，以及「逐位元的其他證據」四個測試檔。
3. 動到 `ui2/`、`render/`、`src/styles/`、`tests/e2e/` 時，或改到的字串在 `tests/e2e/starlantern.spec.ts` 裡逐字出現時（先 grep），跑 e2e 三個專案並全綠。
4. 換行檢查（`git diff --stat` 兩種寫法相同）。
5. 報告：新增與修改的測試名；全套兩行、tsc 數字、閘門與 e2e 結果（沒跑寫理由）；改了哪些既有斷言；偏離本計畫的地方與理由。

**子代理**：實作者不派子代理。冷讀、審查、美術的視覺檢查由控制者另派全新脈絡的代理，模型 Opus；子代理一律不准用瀏覽器 MCP 或 computer-use。

## 寫作任務的固定步驟（C2、C3、E2 的 W1–W7）

- [ ] **W1 紅**：在 `data/guild.test.ts` 寫本任務的註冊釘子（本任務的每一個鍵都存在、非空、變體數對）；插槽測試（每一則紙條用**最長**的名字與 `numeral(8)` 填好後 ≤ 60 字、插槽都被替換）；守門（spec §7.3 的禁字、`SPOILERS`、鎮民的禁字表、夥伴的 `REVEALED` 詞）。跑 `data/guild.test.ts`、`data/story/voice.test.ts`、`data/story/story.test.ts`、`data/terms.test.ts`、`data/glyphs.test.ts`；失敗清單存成 SDD `task-<N>-red.txt`。
- [ ] **W2 讀**：帳本 §3 與 I-72、I-88、I-89、I-117、I-126、I-182；聖經 §2.3–§2.5、§3（本任務每一位說話者的聲音表與禁區）；spec §7 全部；E2 另讀 `data/story.zh-TW.ts` 的 `TOWN_SCENES`（:1440-1520）與星燈祭（`epilogue`）裡鎮民的句子。
- [ ] **W3 寫**：照 spec §7.2 的數量與 §7.3 的規則。每一位的固定梗要在、每次換一點（同一位的兩個變體不共用 4 字以上的子句，照 `story.test.ts` 的 V3 `a running bit comes back changed`）；歐里克每一則換一個收購名目；多蘭每一則 ≤ 28 字。新的小設定登記帳本（I-228 起）在同一個 commit。
- [ ] **W4 守門**：W1 的守門全綠；`voice.test.ts` 的 `POLISHED` 涵蓋、`telegraphBreaks`、語尾助詞預算、兩字台詞、驚嘆號的 `LOUD` 規則全綠。
- [ ] **W5 綠**：`rtk proxy npx vitest run --testTimeout=20000 src/scripts/games/starlantern` 全綠，然後做收尾 G。
- [ ] **W6 朗讀稿**：`GUILD_DUMP=<SDD>/task-<N>-after.md rtk proxy npx vitest run src/scripts/games/starlantern/data/guild.test.ts`（C1 加的匯出：每一則紙條用一組真的目標填好、回信、安娜的台詞、夥伴的一句話，標出說話者與觸發條件）；`GUILD_DUMP_BLIND=1` 另出 `task-<N>-blind.md` 與 `.key.md`（名牌換成「？」，固定種子挑十句編號，照 `data/story/readAloud.ts:162-217`）。
- [ ] **W7 冷讀**：控制者派一位沒讀過設計文件的全新讀者（Opus），只給 `after.md` 與 `blind.md`。題目：
  1. 朗讀，標出每一句出戲的地方（翻譯腔、說明書腔、口號、缺字感、不像台灣人說的話）；
  2. 每一則紙條：誰要什麼、為什麼；
  3. 盲測：十句各是誰說的；
  4. 最好與最差的一句，各附理由；
  5. 有沒有哪一句讓你覺得「這個人背後藏著什麼」（E2 不問：指名委託本來就在交還之後）。
  - 及格：第 1 題沒有未解決的標記；第 2 題和 spec §7.1 的「為什麼是他」一致；第 3 題至少八句對；第 5 題沒有一句指向鎮民的秘密（帳本 §3）；全篇沒有「……」。
  - 不及格：回到 W3，修完重跑 W5，commit `fix(starlantern): ...（冷讀）`；同一位讀者只複查改過的句子；最多兩輪，之後控制者裁定。

## Review Focus

1. **關著或沒解鎖就是今天的遊戲**：`GUILD_LIVE` 為假、或 `act1Cleared` 為假時，存檔逐字相同、沒有 `guild` 欄位、閘門 identical、四個快照不動。→ A0、A7、D1。
2. **不從舊串流多抽**：`engine/guild.guard.test.ts`；`Game` 層的計數測試；`forgeDraws` 不變；潛行快照在 D1 開關打開後不重錄。→ A3、A4、A7、D1。
3. **不劇透**：目標只取見過的；殘影與 `lore` 物種不出現；文字沒有閘門也安全（鎮民的禁字表、`SPOILERS`、夥伴的 `REVEALED`）。→ A2 的一千種子測試、C1–C3、E2。
4. **沒有無限循環**：能交的貨買不到、做不出、拆不出；報酬餵不回委託；一則一次、一天一張、一級一份賀禮。→ A6。
5. **讀檔一致**：同一天的布告相同；在迷宮裡重新整理回到城裡的存檔，進度與布告一起回去；回報、接下、放棄立刻存檔。→ A3、A5、A7。
6. **介面只用既有元件**：`MenuView`、`win`、`confirmBox`、手冊式分頁；12／24 px；沒有行內樣式；晚到的圖不畫佔位。→ B 系列。
7. **文字好聽**：W7 冷讀及格；整個功能零個「……」。→ C2、C3、E2。

---

## 檔案結構

**新增**：`data/guild.ts`、`data/guild.test.ts`、`data/guild.zh-TW.ts`、`engine/guild.ts`、`engine/guild.test.ts`、`engine/guild.economy.test.ts`、`engine/guild.guard.test.ts`、`engine/guild.legacy.test.ts`、`engine/__fixtures__/guild/town.before.json`、`ui2/scenes/board.ts`、`ui2/scenes/board.test.ts`；PR F：`art-factory/starlantern/tools/guild_art.py`、`test_guild_art.py`。

**修改**：
- 資料：`data/text.zh-TW.ts`（`T.ui2.board`）、`data/monsters.test.ts`（`salts are distinct` 加 `GUILD_SALT`）、`data/story/voiceGates.ts`（`storyTexts()` 併入）、`data/story/voice.test.ts`（`POLISHED`）、`data/story/story.test.ts`（`position()` 加 `guild`）、`data/story/readAloud.ts`（若匯出共用它）。
- 引擎：`engine/state.ts`（`GameState.guild?`）、`engine/save.ts`（`isGuild`、`repairGuild`）、`engine/game.ts`（方法、`arrive`、`submitRound`、`changeFloor`）、`engine/story/handbook.ts`（兩個 export）、`engine/testing.ts`（`withGuildLive`）。
- 介面：`ui2/scenes/guild.ts`（指令）、`ui2/scenes/town.ts`（「新」與回城那一句）、`ui2/scenes/dungeon.ts`（樓層名的第二行、迷宮選單）、`ui2/scenes/battle.ts`（結果的那一行）、`ui2/lateArtScenes.test.ts`、`src/styles/_starlantern-ui.scss`。
- 文件：帳本（I-228 起）、spec §0（計畫裁定抄回）。
- e2e：`tests/e2e/starlantern.spec.ts`（D2、E3）。
- 美術（PR F）：`art-factory/starlantern/{contract.md,registry.json}`、`render/artPaths.ts`、`render/artPaths.test.ts`、`public/assets/games/starlantern/icon/`、manifest。
- **不改**：凍結的平衡檔、`data/story.zh-TW.ts`（劇本）、`data/story/scenes.ts`、`data/bond.zh-TW.ts`、`engine/battle.ts`、`engine/loot/*.ts`、`engine/dungeon/*.ts`、`engine/forge/*.ts`（`economy.test.ts` 也不改，委託的經濟測試另開檔）、`engine/__fixtures__/sim-gate/`、`engine/__fixtures__/roster/`、`engine/__fixtures__/story-l/`。

---

# PR A：骨架（資料、引擎、存檔；開關關著）

### Task A0：基準與城鎮快照

**Files:**
- SDD `A/baseline.md`。
- Create：`engine/guild.legacy.test.ts`、`engine/__fixtures__/guild/town.before.json`。

- [ ] **Step 1**：`git status` 乾淨；`baseline.md` 記下 `git rev-parse HEAD`、tsc 總數與 starlantern 底下的數字、全套兩行、`Object.keys(MATERIALS).length`、`legacyFights.test.ts` 的兩個釘子值、`guild.test.ts:46-49` 與 `dungeon.test.ts:909` 的現行清單（D1 要改的兩個）。
- [ ] **Step 2：城鎮快照**。新檔 `engine/guild.legacy.test.ts`：測試名 `the town as it was before the guild board`。腳本（種子固定、`memoryStorage()`）：新遊戲 → 本道出發、走到第三層打倒頭目、通過第一幕結束 → 回城 → 住宿一晚 → 賣一種素材 → 交還一片鎮民碎片（測試直接放進倉庫）→ 出發一個地區、走兩層 → 用歸還之燈回城 → 打開公會（`GuildScene` 不用，只呼叫 `Game` 的城鎮方法）。每一步之後 `saveGame` 的字串取 SHA-256，整串寫進 fixture；`GUILD_RECORD=1` 時寫、否則讀它 `toEqual`；fixture 不存在時失敗（不是略過）。錄：`GUILD_RECORD=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/guild.legacy.test.ts`；驗：不帶變數再跑兩次都綠（證明腳本本身是決定性的）。腳本若用到 `Date` 或 `Math.random` 的路徑（例如 `Game.boot`），改用 `engine/testing.ts` 既有的固定種子工具；做不到就 NEEDS_CONTEXT。
- [ ] **Step 3**：閘門錄 `gate-0`（第一次對自己比），`cmp` 沒有輸出；四個快照測試（`legacyFights`、`floors.snapshot`、`storyL.dive`、新的 `guild.legacy`）全綠。
- [ ] **Step 4**：e2e 三個專案各跑一次，通過數記進 `baseline.md`。
- [ ] **Step 5**：commit 快照測試與 fixture：`test(starlantern): snapshot the town before the guild board`。

### Task A1：開關、評等與資料表

**Files:**
- Create：`data/guild.ts`、`data/guild.test.ts`。
- Modify：`engine/testing.ts`（`withGuildLive(f)`，照 `withRosterLive`：`finally` 還原）、`data/monsters.test.ts`（`salts are distinct` 加 `GUILD_SALT`）。
- 已知會紅：預期沒有。

**Interfaces（`data/guild.ts`）：**
- `GUILD_SWITCH: { live: boolean } = { live: false }`（照 `BOND_SWITCH`，`engine/story/bond.ts:29`；本計畫與 spec 寫的 `GUILD_LIVE` 一律指 `GUILD_SWITCH.live`；`withGuildLive` 在 `finally` 把它設回原值）、`GUILD_SALT = 0xb5c0fbcf`。
- `QuestKind`、`GiverId`、`KIND_GIVER`（`deliver` 依素材種類分歐里克／多蘭）、`DELIVER_KINDS = ['monster', 'region', 'trophy']`。
- `RANKS: { id, merit, offers, cap, kinds: QuestKind[], bossBounty, runeBounty, personal, doubleBounty, gift }[]`（spec §6.3 的五列，字面值）；`GUILD_MAX = 1e9`；`BOARD_MAX = 5`、`ACTIVE_MAX = 4`。
- `WEIGHTS`、`HUNT_N`、`SWEEP_N = 8`、`SCOUT_K = [3, 5]`、`DELIVER_MUL = 1.6`、`deliverQty(price, kind)`、`REWARD`（spec §6.1 的公式，純函式）、`MERIT`、`BOARD_CAP(d)`。
- `GUILD_RUNES`：A3 才填（A1 先放空陣列並在註解寫 A3）。

- [ ] **Step 1：寫失敗的測試**（`data/guild.test.ts`）：
  - `the switch is off`（`GUILD_LIVE === false`；`withGuildLive` 之內為真、之後還原，丟例外也還原）；
  - `ranks climb`：門檻嚴格遞增、從 0 開始、五級；`offers` 非遞減且 ≤ `BOARD_MAX`；`cap` 非遞減且 ≤ `ACTIVE_MAX`；每一級的 `kinds` 包含前一級的；
  - `gifts pay only reward goods`：賀禮的每一個道具 id 存在於 `ITEMS` 或 `MATERIALS`，而且不是 `DELIVER_KINDS` 的素材（spec §10 第 2 條的資料面）；
  - `rewards follow the table`：spec §6.1 每一列在 `d = 1, 14, 15, 29, 30, 60, 61` 的字面值（`lv` 在 60 封頂）；
  - `deliveries pay for the goods`：每一個 `DELIVER_KINDS` 的素材，`deliverQty` 在 2–8（戰利品 2），金幣是 `round(1.6 × Q × price)`。
  - `data/monsters.test.ts`：`salts are distinct` 加 `GUILD_SALT`。
- [ ] **Step 2**：執行，確認紅（模組不存在）。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門 identical、四個快照。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): guild board switch, ranks and reward tables, all off`。

### Task A2：候選（只取見過的）

**Files:**
- Create：`engine/guild.ts`（候選與輔助函式）、`engine/guild.test.ts`。
- Modify：`engine/story/handbook.ts`（`export` `hauntsOf`、`BAND_DEPTHS`，內容不動）。
- 已知會紅：預期沒有。

**Interfaces**：`huntPool`、`sweepPool`、`bountyPool(s, rank)`、`scoutPool`、`deliverPool`、`knownMaterial`、`questDepth`、`excluded(id)`（殘影、`lore`、`story`、部件、`lantern-mother`）。

- [ ] **Step 1：寫失敗的測試**（`engine/guild.test.ts`）：
  - `a new game offers nothing to hunt`（圖鑑空的：五個候選裡只有探路的本道非空）；
  - `only what was seen`：注入圖鑑（`seen` 與 `felled` 各種組合），討伐與懸賞的候選恰好是 `seen ≥ 1` 的、非排除的；收購的候選恰好是 `knownMaterial`；
  - `remnants and companions' pasts never come up`：全部見過、全部擊倒時，候選裡沒有任何 `remnant`、`lore`、`story`、部件、`lantern-mother`（逐一列舉名冊計畫裁定 6 的 13 個殘影 id）；
  - `a boss bounty waits for the road`：頭目在表上的深度 > `reached` 時不在候選；= 時在；
  - `bosses wait for two lamps`：評等 < 二燈時懸賞候選只有守關者；
  - `a sweep needs two natives seen and the fourth floor`；
  - `a scout stops short of the finale`：本道 `reached` 27、`finaleCleared` 為假時，探路的 `D` 上限 29（候選是地區＋上限，`k` 在 A3 抽）；
  - `delivered goods are only dropped goods`：`deliverPool` 的每一個素材 `kind` ∈ `DELIVER_KINDS`；
  - `quest depth`：spec §5 每一條的字面值（舊怪 2、各帶、地區原生 4、懸賞的表、燈喰之獸 5、掃蕩 `min(reached, 30)`）；
  - `the pools are in table order`（同一個狀態兩次呼叫逐一相等、順序是資料表的鍵順序）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作；`engine/story/handbook.ts` 只加兩個 `export`。
- [ ] **Step 4**：這些測試檔、`engine/story/handbook.test.ts`、全套、tsc、閘門、四個快照。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): guild pools, only what the party has seen`。

### Task A3：貼布告（新串流）

**Files:**
- Modify：`engine/guild.ts`（`guildRng`、`postBoard`）、`data/guild.ts`（`GUILD_RUNES` 字面值）、`engine/guild.test.ts`。
- Create：`engine/guild.guard.test.ts`。
- Modify：`engine/state.ts`（`GuildState`、`QuestOffer`、`ActiveQuest`、`QuestReward` 型別與 `GameState.guild?`；只加型別，`newGame` 不寫它）。
- 已知會紅：預期沒有（`newGame` 不變；存檔驗證在 A5）。

- [ ] **Step 1：寫失敗的測試**
  - `engine/guild.test.ts`：
    - `one day, one board`：同一個狀態、同一天 `postBoard` 兩次逐一相等；換一天就不同（一千個種子裡至少 99% 不同）；
    - `the board keeps what was taken`：`active` 原樣保留，`offers` 換掉；
    - `the first slot is a bounty from the first lamp`、`two bounties at four lamps`；
    - `no twice the same`：同一張布告沒有同種類同目標；
    - `as many as the rank allows`：則數 ≤ `RANKS[rank].offers`；候選不夠時變短，不補；
    - `a thousand boards spoil nothing`：一千個種子 × 四個存檔情境（剛解鎖、只見過舊怪、見過一半、全部見過），每一則的目標都在 A2 的候選裡、收購 `knownMaterial`、懸賞的碎片等級合法、符文 id 在 `GUILD_RUNES` 而且只在二燈以上與 `runesOpen` 時出現；
    - `rewards are written on the note`：每一則的 `reward` 等於 `data/guild.ts` 的公式（碎片與符文以外）；
    - `GUILD_RUNES are real runes`：每個 id 存在於符文資料、不是傳說、不在 `RUNE_STOCK`。
  - `engine/guild.guard.test.ts`（照 `engine/runeEconomy.guard.test.ts` 讀原始碼文字）：`engine/guild.ts` 不出現 `this.rng`、`lootRng`、`memoryRng`、`trophyRng`、`runeRng`、`spotRuneRng`、`forgeRng`、`absorbRng`、`affixRng`、`Math.random`、`Date`；`mulberry32(` 恰好出現一次，而且在 `guildRng` 裡。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作，照計畫裁定 5 的順序；`GUILD_RUNES` 從資料產生後寫成字面值。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門、四個快照。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): the guild posts its board from a stream of its own`。

### Task A4：接下、進度、放棄、回報、評等

**Files:**
- Modify：`engine/guild.ts`（`accept`、`abandon`、`turnIn`、`progressOf`、`rankOf`、`rankUps`、`questsNewlyDone`、`remarkFor`）、`engine/guild.test.ts`。
- 已知會紅：預期沒有。

- [ ] **Step 1：寫失敗的測試**（`engine/guild.test.ts`）：
  - `accepting records where the count stood`：討伐的 `base` 是當下的 `felled`（沒有紀錄是 0）；掃蕩的 `ids` 與 `base` 照計畫裁定 9；接下之後 `offers` 少那一則、`active` 多那一則；
  - `the cap holds`：滿了回 `full`；
  - `progress reads the state`：討伐、掃蕩、懸賞跟著 `felled` 走；探路跟著 `reached`；收購跟著 `inventory`（減少也跟著減少）；
  - `a sweep counts only the frozen kinds`：接下之後才加進同地區的物種（測試注入）不算；
  - `turning in pays what the note said`：金幣、道具、碎片、符文（`RUNE_STACK` 滿了改付金幣，照既有規則）、功績；收購扣 Q 個、`sold` 不變；回報之後那一則從 `active` 消失；
  - `not done, not paid`：未達成回 `invalid`；收購貨不夠回 `stock`；
  - `ranks and gifts`：跨一級發一份、跨兩級依序發兩份、`paid` 寫對；功績在 `GUILD_MAX` 停住；
  - `abandoning costs nothing and returns nothing`：放棄之後 `active` 少一則、`offers` 不變、功績不變；
  - `a companion speaks for her own land`：計畫裁定 12 的每一條（她不在場、沒遇過、本道、兩人同時符合取 `MEETINGS` 順序第一位）；
  - `newly done`：`questsNewlyDone(before, after)` 只列「之前未達成、之後達成」的；
  - `none of it draws`：上面每一個動作前後 `forgeDraws`、`story`、`bestiary` 不變，而且回傳的新狀態是 `structuredClone`（原狀態沒被改）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作；符文入袋用既有的函式（先 grep `runes[` 的寫入點；沒有共用函式就在 `engine/guild.ts` 內照 `grant` 的符文分支寫，並在報告註明）。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門、四個快照。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): take, track, drop and turn in guild quests; the lamp ranks`。

### Task A5：存檔

**Files:**
- Modify：`engine/save.ts`（`isValid` 裡檢查 `guild`；`loadGame` 在 `repairBestiary` 之後呼叫 `repairGuild`）、`engine/guild.ts`（`isGuild`、`repairGuild`）、`engine/save.test.ts`。
- 已知會紅：預期沒有。

- [ ] **Step 1：寫失敗的測試**（`engine/save.test.ts` 新 `describe('the guild board in the save (guild quests plan Task A5)')`）：
  - `the save version stays 9`；
  - `a board round-trips`（`saveGame(memoryStorage())` → `loadGame` `toEqual`）；
  - `a save without one loads without one`；
  - `bad shapes are corrupt`：壞值表（負的功績、小數、`offers` 6 則、`active` 5 則、未知的種類與委託人、`paid` 5、`reward.items` 的 0 或負數、`base` 是字串、`ids` 不是陣列）各自 `'corrupt'`，寫法照 :1569 的 `bestiary` 區塊；
  - `an unknown target is dropped, not corrupt`：目標 id 不在 `ENEMIES`／`MATERIALS`／`REGIONS` 的委託被丟掉；報酬裡不存在的道具丟掉那一項；不合法的 `rune` 丟掉那一項；其餘照舊。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門、四個快照。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): the guild board in the save, version 9, unknown targets dropped`。

### Task A6：經濟（不會無限循環）

**Files:**
- Create：`engine/guild.economy.test.ts`。
- Modify：只有測試紅了、而且是資料錯時才改 `data/guild.ts`（列進報告）。
- 已知會紅：預期沒有。
- Read：`engine/forge/economy.test.ts` 全檔（`matValue`、`gearValue`、`rich`、`spent` 的寫法，照抄成本檔的輔助函式，不 import 它的私有函式）。

- [ ] **Step 1：寫測試**（spec §10 的七條，各一個 `describe`）：
  1. `nothing the board asks for can be bought or made`：`DELIVER_KINDS` 的每一個素材不在店的商品裡（`ITEMS`、`EQUIPMENT` 的可買清單、道具店的符文 `RUNE_STOCK`）、不是 `CONSUMABLE_RECIPES` 的產出、不是 `DISMANTLE` 任何稀有度的精華、不是 `BASE_RECIPES`／`SET_RECIPE`／`OWN_RECIPE`／融合的產出（逐一列舉產出的種類，斷言沒有一個是素材）；另外真的跑一次：`rich()` 狀態下 `buy` 每一個可買的東西、`craftItem` 每一個消耗品、`dismantle` 每一種稀有度，新增的 `inventory` 鍵沒有一個是能交的貨。
  2. `rewards never feed a request`：`REWARD`、賀禮、`GUILD_RUNES` 產出的每一個道具 id 都不是能交的貨（碎片、精華、稀有素材、歸還之燈、復活羽毛、符文）；E1 之前沒有例外。
  3. `a delivery pays for goods, not gold`：每一個能交的貨 × 它的 Q，報酬只有金幣、等於 `round(1.6 × Q × price)`；報酬裡沒有素材。
  4. `a note pays once`：同一則回報兩次第二次 `invalid`；放棄之後 `accept` 同一個 id 回 `invalid`；同一天再 `postBoard`，`offers`、`active` 不變。
  5. `a gift pays once a lamp`：升級發一次；同一狀態再 `turnIn` 別的委託、或 `saveGame`→`loadGame` 之後再升，不重發；功績在上限停住。
  6. `a board has a ceiling`（寬鬆）：一千個種子 × 深度 1–60 的情境，一張布告所有報酬的價值（金幣＋素材的賣價＋符文的 `RUNE_SELL`）≤ `BOARD_CAP(d)`。
  7. `taking, dropping and turning in draw nothing`：`forgeDraws`、`story.pity`、`bestiary` 不變。
- [ ] **Step 2**：執行。第 1–5、7 條預期綠（A1–A4 已經照規則寫）；紅了就是實作錯，修實作。第 6 條紅了：調 `data/guild.ts` 的公式**一次**，還紅就在測試裡以 `BOARD_CAP_EXCEPTIONS` 具名放過（理由、最大值），加一條待辦到 SDD `A/carry.md`。
- [ ] **Step 3**：全套、tsc、閘門、四個快照。
- [ ] **Step 4**：收尾 G，commit：`test(starlantern): the guild board makes no loop`。

### Task A7：`Game` 接線（開關仍關著）

**Files:**
- Modify：`engine/game.ts`（計畫裁定 4 的方法；`arrive()` 在日子推進之後 `postBoard`；`submitRound` 在 `noteFelled` 之後算 `questsNewlyDone`，放進 `end.quests`；`changeFloor` 之後算探路的達成，放進 `scoutDone`）、`engine/game.test.ts`、`engine/guild.legacy.test.ts`（加兩個情境）。
- 已知會紅：預期沒有。

- [ ] **Step 1：寫失敗的測試**
  - `engine/game.test.ts`（新 `describe('the guild board in the game (guild quests plan Task A7)')`）：
    - `off, nothing at all`：開關關著，整段腳本之後 `state.guild === undefined`，新方法全部 `{ ok: false, reason: 'locked' }`，`end.quests` 不存在；
    - `on, locked until the first act`：`withGuildLive`、`act1Cleared` 假：回城不貼、`board()` 是 `null`、`openBoard` 不寫狀態；
    - `on and open`：解鎖後回城就有布告、`guild.day === dayOf(state)`；住一晚不換；再出發回來就換；
    - `the board posts on the way home and draws nothing`：注入計數的 `game.rng`，`arrive` 前後與「同一段腳本但開關關著」的計數相同；
    - `a win that finishes a hunt says so`：接下討伐、打到第 N 隻那一場 `end.quests` 有它，下一場沒有；
    - `a scout finishes on the floor it reaches`；
    - `turning in saves`：回報後 `memoryStorage` 的字串含新狀態；
    - `a reload in the labyrinth loses the run and keeps the board`：接下 → 出發 → 打幾場 → 不回城直接 `loadGame` → 布告與進度回到出發前。
  - `engine/guild.legacy.test.ts`：計畫裁定 15 的兩個情境（開著但未解鎖：雜湊逐一相等；開著而且解鎖：刪掉 `guild` 後逐一相等）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。所有新程式都在 `if (GUILD_LIVE && this.state.story.act1Cleared)` 之內（或對應的早退）；`submitRound`、`changeFloor` 裡只**讀**狀態、算差異，不改任何既有的回傳欄位（只加 `quests?`）。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門 identical、四個快照（城鎮快照的原情境不重錄）。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): the game posts and settles guild quests, switch still off`。

**PR A 收尾**：控制者派全新脈絡的審查者（Opus）看整個分支的 diff。重點：開關關著時的逐位元（A0、A7）、守門與計數測試（A3、A7）、候選的排除（A2）、經濟（A6）、存檔的壞值表（A5）。

---

# PR B：介面（開關仍關著；測試用 `withGuildLive`）

### Task B1：介面字串、指令與鎖

**Files:**
- Modify：`data/text.zh-TW.ts`（`T.ui2.board`：`title`、`tabs`、`kinds`、`row(kind, …)` 格式函式、`progress(…)`、`ready`、`reward(parts)`、`merit(n)`、`rank(name)`、`rankNames`、`acceptAsk`、`abandonAsk`、`turnIn`、`emptyBoard`、`emptyActive`、`depthAt(place, d)`、`held(n, q)`、`deepest(r, d)`、`personalLocked`、`questsReady(n)`、`fieldNote`）、`ui2/scenes/guild.ts`（`GUILD_LIVE` 時指令列最後加 `{ id: 'board', label: T.ui2.board.title }`；`onCommand('board')`：未解鎖時 `say(GUILD_TEXT.anna.locked)`（C 之前 `GUILD_TEXT` 是空的，就不說話、只播 `sfx.error`），解鎖時 `openBoard(this)`）、`ui2/scenes/guild.test.ts`。
- Create：`data/guild.zh-TW.ts`（`GUILD_TEXT` 的型別與空的註冊表：鍵都在、值是空陣列或 `undefined`，型別讓 C 填）。
- 已知會紅：預期沒有（開關關著時指令清單不變）。

- [ ] **Step 1：寫失敗的測試**（`ui2/scenes/guild.test.ts`）：
  - `the board is not on the guild's list while the switch is off`（清單等於 :46-49 的那一份）；
  - `with the switch on, the board comes last before leaving`（`withGuildLive`）；
  - `locked before the first act: one line, nothing written`（`state.guild` 仍 `undefined`、沒有 layer、`sfx.error` 被呼叫一次；`GUILD_TEXT.anna.locked` 有字時對話框顯示它）；
  - `opening the board draws no greeting`（注入計數的 `game.rng`，按「委託」前後計數相同）。
  - `data/text.zh-TW.ts` 的新字串由既有的 `data/terms.test.ts`、`data/glyphs.test.ts` 檢查（不必另寫）。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作；`openBoard` 在 B2 才有，本任務先 import 一個只推空 layer 的 stub（同一個 PR 的 B2 取代，不留到合併）。
- [ ] **Step 4**：這些測試檔、`data/terms.test.ts`、`data/glyphs.test.ts`、全套、tsc、閘門（碰了 `data/`）、四個快照、e2e 三個專案（碰了 `ui2/`）。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): the guild board's words and its place on the guild's list`。

### Task B2：布告 layer：分頁、清單、詳細欄

**Files:**
- Create：`ui2/scenes/board.ts`（`openBoard(scene)`、`BoardLayer`）、`ui2/scenes/board.test.ts`。
- Modify：`ui2/scenes/guild.ts`（換掉 B1 的 stub）、`src/styles/_starlantern-ui.scss`（`.slx-board`、`.slx-board-info`、`.slx-board-head`、`.slx-quest`，spec §8.3 的起點位置）、`ui2/lateArtScenes.test.ts`（加布告的畫面）。
- 已知會紅：預期沒有。

- [ ] **Step 1：寫失敗的測試**（`ui2/scenes/board.test.ts`，fake ctx 照 `guild.test.ts:22-45`，cps `Infinity`，`withGuildLive`，注入一份有布告的狀態）：
  - `three tabs, left and right turn them`（`left`／`right`／`prev`／`next` 與點擊；`.slx-tab-sel`）；
  - `a row for every note`：`label` 與 `right` 照 spec §8.2；收購與探路、掃蕩的列有圖示（`lateArt`，`NO_ART` 時沒有 `img`），討伐、懸賞沒有；
  - `the detail follows the cursor`：委託人、紙條（`GUILD_TEXT` 有字時）、目標、出沒、報酬、功績；
  - `a foe is drawn only once its art lands`（`NO_ART` 時詳細欄沒有敵人圖；`has` 為真時有，`slx-hb-foe` 照手冊的放大規則）；
  - `the giver's face only once it lands`；
  - `empty states`：布告空、進行中空各一列停用的字；
  - `the head shows the rank and the merit`；
  - `no inline style`（`root.querySelectorAll('[style]').length === 0`，照 `forge.test.ts:518-526`）；
  - `the longest name fits`：用名冊最長的敵人名與素材名，列與詳細欄的文字寬度（照 `render/BattleView.test.ts:805-808` 的量法）不超過 spec §8.3 的寬度。
  - `ui2/lateArtScenes.test.ts`：布告加進畫面清單。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作；SCSS 只用 12px、偶數行高，不用 `!important`；位置照 spec §8.3，量完字寬再調並在報告寫實際值。
- [ ] **Step 4**：這些測試檔、`ui2/typeScale.test.ts`、全套、tsc、e2e 三個專案。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): the guild board, its tabs, notes and details`。

### Task B3：接下、放棄、回報、升級、評等頁

**Files:**
- Modify：`ui2/scenes/board.ts`、`ui2/scenes/board.test.ts`。
- 已知會紅：預期沒有。

- [ ] **Step 1：寫失敗的測試**：
  - `taking a note`：確認框游標預設「是」→ `game.acceptQuest` 被呼叫一次、那一列移到進行中、`saveInTown` 寫了；
  - `a full hand says so and stays put`：`sfx.error`、狀態不變；
  - `dropping asks twice`：小選單「放棄」→ 確認框游標預設「否」；選「否」不變；選「是」移除；
  - `turning in`：已達成的列「可回報」→ 回報 → 依序：委託人的回信（有字時）、夥伴的一句話（有她、有字時，`speakAs`）、報酬一句、升級時燈印的一句與賀禮一句；最後清單更新；
  - `not enough goods`：收購貨不夠時小選單沒有「回報」；
  - `the rank tab`：目前評等、功績、下一級門檻與新開的東西；四燈時寫「已是最高」；指名委託的列在 E 之前不顯示（E1 加）；
  - `nothing draws`：整段流程 `game.rng` 計數不變。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作；對話一律用 `FacilityScene` 的 `say`／`sayThen`／`speakAs`，名牌照公會（安娜）；鎮民的回信以「〇〇留了話：」前綴（`T.ui2.board.note(giver)`）。
- [ ] **Step 4**：這些測試檔、全套、tsc、e2e 三個專案。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): take, drop and turn in at the board; the lamp ranks on the card`。

### Task B4：迷宮與城鎮的提示

**Files:**
- Modify：`ui2/scenes/battle.ts`（結果的 `lines` 加 `end.quests` 的每一則，`cls: 'slx-quest'`，掉落之後、升級之前）、`ui2/scenes/dungeon.ts`（`scoutDone` 接在樓層名後；迷宮選單加唯讀的「委託」頁，`GUILD_LIVE` 時才加）、`ui2/scenes/town.ts`（公會列的「新」；回城在帶回來的東西那一句之後、`bondUps` 之前說 `T.ui2.board.questsReady(n)`）、對應的 `*.test.ts`、`src/styles/_starlantern-ui.scss`（`.slx-guild .slx-fresh` 若布告頁也用，`.slx-quest` 的金色）。
- 已知會紅：預期沒有（全部在 `GUILD_LIVE` 之下；`dungeon.test.ts:909` 的清單在開關關著時不變）。

- [ ] **Step 1：寫失敗的測試**：
  - `ui2/scenes/battle.test.ts`：`a finished quest gets a line in the spoils`（`withGuildLive`，`end.quests` 有一則時多一行、位置對；沒有時和今天相同）；
  - `ui2/scenes/dungeon.test.ts`：`a scout's goal follows the floor name`；`the field menu shows the quests read-only with the switch on`（12 項、`FIELD_MENU_ROWS` 剛好；開關關著時 :909 照舊）；
  - `ui2/scenes/town.test.ts`：`the guild is marked new when a quest is ready or the board is unread`；`coming home tells how many are ready, before the bonds`；開關關著時兩者都沒有。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作。
- [ ] **Step 4**：這些測試檔、全套、tsc、e2e 三個專案。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): quest news in the labyrinth and on the way home`。

### Task B5：介面收尾檢查

**Files:**
- Modify：只有檢查紅了才改對應的檔案。
- 已知會紅：預期沒有。

- [ ] **Step 1**：`ui2/typeScale.test.ts`、`data/glyphs.test.ts`、`data/terms.test.ts`、`ui2/lateArtScenes.test.ts`、`ui2/rarity.test.ts`（`!important` 的掃描）全綠；grep `ui2/scenes/board.ts` 沒有 `.style.`、`setAttribute('style'`。
- [ ] **Step 2**：以 `withGuildLive` 寫一個 `ui2/scenes/board.test.ts` 的整段流程測試：解鎖 → 第一次打開 → 接下 → （直接改圖鑑模擬打倒）→ 回報 → 升級。
- [ ] **Step 3**：全套、tsc、e2e 三個專案（開關關著：和 A0 的通過數相同）。
- [ ] **Step 4**：收尾 G，commit：`test(starlantern): the guild board end to end, switch still off`。

**PR B 收尾**：控制者派全新脈絡的審查者看 diff（重點：只用既有元件、不抽亂數、開關關著時畫面與今天相同、沒有佔位文字或圖）。

---

# PR C：文字（委託人、安娜、夥伴）

### Task C1：文字的註冊表、守門與匯出

**Files:**
- Modify：`data/guild.zh-TW.ts`（型別定稿：`notes[kind][variant]`，收購分 `deliverMonster`、`deliverRegion`、`deliverTrophy`，懸賞分 `bountyWarden`、`bountyBoss`；`thanks[giver][2]`；`anna.{locked,intro[3],full,empty,rank[4]}`；`remarks[companion]`；`personal`（E 用，先空））、`data/guild.test.ts`、`data/story/voiceGates.ts`（`storyTexts()` 併入 `GUILD_TEXT`，照 `BOND_SCENES`）、`data/story/voice.test.ts`（`POLISHED` 加 `guild.`）、`data/story/story.test.ts`（`position()` 加 `guild`：一般 `act1`、`personal.<id>` 交還之後）、`data/story/readAloud.ts`（若匯出要共用它的盲測函式）。
- 已知會紅與改法：`data/story/voice.test.ts` 的 `the polish covers the whole script`：`GUILD_TEXT` 還是空的所以不紅；若 `storyTexts()` 的總數被某個測試釘住，照實際值更新並列進報告（意圖不變：涵蓋整份劇本）。

- [ ] **Step 1：寫失敗的測試**（`data/guild.test.ts`）：
  - `every slot the board needs is registered`（spec §7.2 的數量：紙條 16、回信 10、安娜 10、夥伴 6；C1 的斷言寫「鍵存在」，C2、C3 的 W1 把「非空」加上去）；
  - `slots fill`：每一則紙條的插槽只有 `{target}`、`{place}`、`{n}`，`fillNote(note, offer)` 全部替換；
  - `the town's own words stay out`：spec §7.3 的鎮民禁字表，套在那一位的紙條與回信；
  - `no secret in a note`：`SPOILERS`、`RIN_SECRET_TERMS`、無條件字串的禁字、名冊 A5 的名字掃描清單、`欠(公會|著|的|錢|帳)`、`求救|求助|呼救|訊號|救命`，掃全部 `GUILD_TEXT`（`personal` 只掃 `SPOILERS` 與別人的秘密，自己的已揭露）；
  - `a companion keeps her own pieces`：`remarks[c]` 不含 `REVEALED[c]` 的任何詞（`story.test.ts:1009-1047` 的表抽成可共用的常數，內容不改）；
  - `not one 「……」`；
  - `GUILD_DUMP` 與 `GUILD_DUMP_BLIND` 的匯出（沒設環境變數時不寫檔）。
- [ ] **Step 2**：執行，確認紅（註冊表的型別與函式不存在）。
- [ ] **Step 3**：實作；所有字串仍是空的。
- [ ] **Step 4**：`data/story`、`data/guild.test.ts`、`data/terms.test.ts`、全套、tsc、閘門、四個快照。
- [ ] **Step 5**：收尾 G，commit：`test(starlantern): the guild's words are registered and guarded`。

### Task C2：紙條與回信（W1–W7）

**Files:**
- Modify：`data/guild.zh-TW.ts`（`notes`、`thanks`）、`data/guild.test.ts`、`docs/superpowers/story/starlantern-lore-ledger.md`（新的小設定，I-228 起；例如歐里克的收購名目若變成固定的店規、葛倫說的門那頭的事）。
- Read：spec §7.1–§7.3；聖經 §3 的安娜、歐里克、瑪莎、葛倫、多蘭；`data/story.zh-TW.ts` 的 `greet`（:2362 起）與城鎮台詞（避免和既有的句子撞子句）。

照「寫作任務的固定步驟」W1–W7。本任務的 W3 細則：
- 紙條 16 則：每位委託人的兩個變體，一則偏日常、一則帶一個笑點；紙條以委託人的口吻寫，最後一句是要求（「〇〇隻，越快越好。」這種）。
- 回信 10 則：一句謝、一句他的固定梗；不提這一趟發生了什麼（回信不知道玩家怎麼做到的）。
- 懸賞的紙條用「吞得特別多」「這一隻吃了不少人的東西」這類 story-world §3.1 的說法，不寫數值、不寫詞綴。
- 歐里克每一則一個新的收購名目；多蘭每一則 ≤ 28 字；葛倫的「別逞強」在他的四則裡最多出現兩次、每次變奏。

- [ ] **W1–W7**（見上）。commit：`feat(starlantern): the townsfolk's notes on the guild board`；冷讀修正另一個 commit。

### Task C3：安娜的台詞與夥伴的一句話（W1–W7）

**Files:**
- Modify：`data/guild.zh-TW.ts`（`anna`、`remarks`）、`data/guild.test.ts`、帳本（如有新設定）。
- Read：聖經 §3 的安娜與六位夥伴的聲音表、`voiceGates.ts` 的 `VOICE`（語尾助詞預算）、`SYLVIE_WORLD`、`CHIZURU_ARCHAIC`、`CHIZURU_NEVER`；帳本 I-135（安娜的領路已經在第一次拜訪說話，委託的說明不要和它搶同一個框）。

W3 細則：
- 安娜：未解鎖一句（「先站穩腳步」的意思，不提第三層的頭目是什麼）；第一次打開三句（布告、手上上限、評等；用紅筆與打勾的梗）；滿了、空了各一句；升級四句，每一句是她在登記表角落蓋一個燈印，**一燈到四燈各不相同**，四燈那一句可以溫暖一點但不回呼她的過去（她的交還在指名委託才碰）。
- 夥伴六句：她看到那個地區的委託回來時的反應，現在式、輕；遵守她的稱呼、語尾助詞預算、`LOUD` 規則；希爾薇至少碰一個 `SYLVIE_WORLD` 的詞（食物、天氣、風、足跡）；千鶴用她的舊式敬語、不用 `CHIZURU_NEVER`。

- [ ] **W1–W7**。commit：`feat(starlantern): Anna at the board, and a word from whoever knows the land`。

**PR C 收尾**：W7 都及格；控制者派全新脈絡的審查者看 diff（重點：守門、帳本、沒有改到任何既有劇本）。

---

# PR D：上線

### Task D1：打開開關

**Files:**
- Modify：`data/guild.ts`（`GUILD_LIVE = true`）、`ui2/scenes/guild.test.ts`（:46-49 的清單最後、「離開」之前加 `T.ui2.board.title`）、`ui2/scenes/dungeon.test.ts`（:909 的 id 清單加 `board`）、`data/guild.test.ts`（`the switch is off` 改成 `the switch is on`）、spec §0（計畫裁定抄回）。
- 已知會紅與改法（意圖不變）：上面三個清單測試；`engine/guild.legacy.test.ts` 的原情境**不改**：開關打開之後，它的腳本在 `act1Cleared` 之前的每一步仍必須逐一相同，解鎖之後的每一步在刪掉 `guild` 欄位後逐一相同（A7 已經有這兩個情境；D1 把原情境的斷言改成「刪掉 `guild` 後比對」，雜湊值一個都不重錄）；任何其他紅燈 NEEDS_CONTEXT。

- [ ] **Step 1**：開關打開前跑一次閘門與四個快照：全部 identical（證明樹是乾淨的）。
- [ ] **Step 2**：打開開關，改三個清單測試。
- [ ] **Step 3**：全套、tsc、閘門 identical、`cmp`、`legacyFights`、`floors.snapshot`、`storyL.dive`（**不重錄**：貼布告不抽 `game.rng`）、`guild.legacy`（照上面的改法）。
- [ ] **Step 4**：收尾 G，commit：`feat(starlantern): the guild board goes up`。

### Task D2：e2e

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`。
- 已知會紅：預期沒有（既有的步驟都用 Enter 選第一個指令或 `data-id` 點擊）。

- [ ] **Step 1：寫失敗的 e2e**：`the guild board: take a note, go down, come back, turn it in`：用注入的測試存檔（第一幕已結束、見過幾種舊怪、倉庫有幾個素材）→ 公會「委託」→ 接下一則收購（貨已夠）與一則討伐 → 出發本道 → 打倒目標（e2e 既有的遇敵工具；做不到固定就改用探路：走兩層）→ 勝利結果有「委託達成」或樓層名有探路的那一行 → 回城有「可以回報」的那一句、公會列有「新」→ 回報兩則 → 報酬的那一句出現、功績增加；重新整理頁面之後布告與進行中和重新整理前相同。
- [ ] **Step 2**：執行，確認紅（D1 之前的分支）或綠（D1 之後）；在 D1 之後的分支上綠。
- [ ] **Step 3**：e2e 三個專案全綠；全套、tsc。
- [ ] **Step 4**：收尾 G，commit：`test(starlantern): e2e for the guild board`。

**PR D 收尾**：控制者派全新脈絡的審查者看 diff，並請控制者在 4321 開一次給使用者看（附可點的網址，`CLAUDE.md` 的鐵則；代理自己不開瀏覽器）。

---

# PR E：指名委託

### Task E1：資料、引擎與評等頁

**Files:**
- Modify：`data/guild.ts`（`PERSONAL`：五列，spec §7.5 的目標與報酬）、`engine/guild.ts`（`personalOpen(s, giver)`、`acceptPersonal`、`turnInPersonal`；進度沿用 `progressOf`，基準記在 `personalBase`）、`engine/state.ts`（`GuildState.personal?`、`personalBase?` 若 A3 未加）、`engine/save.ts`（形狀檢查）、`engine/game.ts`（方法）、`ui2/scenes/board.ts`（評等頁的指名委託列與「？？？」）、`ui2/scenes/facility.ts`（`speakNpc`；動手前先量換行）、`engine/guild.test.ts`、`engine/guild.economy.test.ts`（第 2 條加安娜那一則的具名例外與「只能完成一次」）、`engine/save.test.ts`、`ui2/scenes/board.test.ts`。
- 已知會紅與改法：`engine/guild.economy.test.ts` 第 2 條（`rewards never feed a request`）在安娜那一則收碎片時會紅 → 加具名例外，**另加**斷言它只能完成一次、而且不在布告的候選裡（spec §10 第 2 條）。

- [ ] **Step 1：寫失敗的測試**：
  - `open once returned and at two lamps`：五位各自的條件；
  - `a personal quest neither fills the hand nor leaves with the board`；
  - `done once`：完成之後 `personal[g] === 'done'`，不能再接；
  - `Glen's road is the least walked`：計畫裁定的地區選法（同分取 `REGIONS` 順序）；
  - `Marta's road is five floors on`；
  - `the rank tab locks the unknown`：未交還的委託人顯示「？？？的委託」、詳細欄不寫名字；
  - 存檔：形狀與未知委託人。
- [ ] **Step 2**：執行，確認紅。
- [ ] **Step 3**：實作；文字欄位先空（E2 寫）。完成時的對話在公會逐句播：`FacilityScene` 新增 `speakNpc(who, text)`（名牌是那位鎮民、臉照 `ui2/story.ts:41-43` 的 `NPC_FACILITY` 經 `lateArt`，沒有就不畫），旁白用既有的 `narrate`；不建 `SceneId`。
- [ ] **Step 4**：這些測試檔、全套、tsc、閘門、四個快照、e2e。
- [ ] **Step 5**：收尾 G，commit：`feat(starlantern): personal requests from the townsfolk, once their memories are home`。

### Task E2：指名委託的文字（W1–W7）

**Files:**
- Modify：`data/guild.zh-TW.ts`（`personal[g]`：紙條 2 句、完成時 4–6 句，`who` 是那位鎮民或旁白）、`data/guild.test.ts`、帳本（I-228 之後接續）。
- Read：W2 的清單，另加 spec §7.5 的表與「和既有結局的關係」；`data/story.zh-TW.ts` 的 `TOWN_SCENES`（:1448-1520）與 `epilogue` 裡瑪莎、安娜的句子。

W3 細則：
- 每一則照 spec §7.5 的「內容」與「寫作的界線」；完成時的對話是「交還之後的下一步」：輕、具體、有一個小笑點，最後一句是一個小溫暖。
- 不回答開放的線索（瑪莎的丈夫、安娜的同伴、歐里克與女兒的近況、葛倫的那個年輕人）。
- 第 5 題（「背後藏著什麼」）不問；改問「這一段像不像那位鎮民交還之後的人」。

- [ ] **W1–W7**。commit：`feat(starlantern): the townsfolk's personal requests, written`。

### Task E3：e2e 與收尾

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`。

- [ ] **Step 1**：e2e：`a personal request after a returned memory`（注入存檔：歐里克已交還、二燈、倉庫有暮影布 ×3 → 評等頁接下 → 回報 → 完成的對話出現、那一列標「完成」）。
- [ ] **Step 2**：e2e 三個專案、全套、tsc、閘門。
- [ ] **Step 3**：收尾 G，commit：`test(starlantern): e2e for a personal request`。

**PR E 收尾**：控制者派全新脈絡的審查者看 diff；W7 及格。

---

# PR F：美術（評等章與種類小圖示；要使用者先核准風格樣本）

開工條件：使用者對 spec §14 回答「要做」。沒有核准之前，F2 之後的任務不開工；評等與種類照舊只用文字（不是缺陷）。

### Task F1：契約與工具

**Files:**
- Modify：`art-factory/starlantern/contract.md`（新增兩列：`guild-rank`（16 px 小章、48 px 大章，各五枚；燈的數量表現評等，不放字）、`quest-kind`（14 px，五個；照 `mechIcon` 的尺寸與 QA））、`art-factory/starlantern/registry.json`。
- Create：`art-factory/starlantern/tools/guild_art.py`、`test_guild_art.py`（照名冊 `roster_art.py` 的 `plan-json`、`gen`、`qa`、`approve`、`publish` 子命令；洋紅去背、alpha 與殘留的機械 QA 用 5d／名冊既有的函式）。

- [ ] **Step 1**：`test_guild_art.py` 先寫（尺寸、去背、殘留、`approve` 沒有風格核准就拒絕 `gen --batch g1`）；`rtk proxy python -m pytest art-factory/starlantern/tools -q` 紅。
- [ ] **Step 2**：實作；pytest 綠。
- [ ] **Step 3**：commit：`feat(starlantern): art contract and tools for guild ranks and quest kinds`。

### Task F2：風格樣本（使用者核准）

- [ ] **Step 1**：`codex_still.py generate` 產一張樣本表：五枚章（大）＋五個種類小圖示，兩種方向各一版；機械 QA 全過。
- [ ] **Step 2**：放到使用者打得開的網址（控制者處理，`CLAUDE.md` 的鐵則），等使用者選。
- [ ] **Step 3**：使用者核准後 `approve --batch g0 --by "<使用者原話> <YYYY-MM-DD>"`；registry 寫 `guild_style_approved`、`guild_style_anchor`。commit：`chore(starlantern): guild art style approved`。

### Task F3：生成、審核、發布

- [ ] **Step 1**：`gen --batch g1`（十五張）；機械 QA 全過；被淘汰的不進 runtime 路徑。
- [ ] **Step 2**：控制者派全新脈絡的獨立代理（Opus，不准用瀏覽器工具）審核；通過才 `approve`、`publish`（名冊裁定 21 的做法）。
- [ ] **Step 3**：`render/artPaths.ts` 加 `art.guildRank(rank, size)`、`art.questKind(kind)`；`render/artPaths.test.ts` 的 `allArtUrls` 總數照當下實際值＋15 重算；manifest 與 `render/published.test.ts` 綠。
- [ ] **Step 4**：收尾 G，commit：`feat(starlantern): publish the guild's rank badges and quest-kind icons`。

### Task F4：介面接線

**Files:**
- Modify：`ui2/scenes/board.ts`（列的種類圖示、清單頁首與評等頁的章，全部經 `lateArt`；沒到就只有文字）、`ui2/scenes/board.test.ts`、`src/styles/_starlantern-ui.scss`。

- [ ] **Step 1：寫失敗的測試**：`badges and kind icons once they land`（`NO_ART` 時和 F 之前完全相同；`has` 為真時有 `img`、尺寸 class 對）。
- [ ] **Step 2**：實作；e2e 三個專案、全套、tsc。
- [ ] **Step 3**：收尾 G，commit：`feat(starlantern): the guild board wears its badges`。
