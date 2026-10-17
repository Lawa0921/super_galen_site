# 星燈迷宮 計畫 6b：故事系統（記憶碎片、劇情狀態、回城佇列、冒險者手冊） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓記憶碎片成為完整的系統：夥伴碎片、鎮民碎片、無主碎片都有來源、掉落規則與保底；找回的記憶變成能力（`memory` 屬性來源、記憶關鍵天賦、「燈鑰・天燈」、凜的「破鐘・黎明之刃」與誓約關鍵天賦）；劇情狀態與回城場景佇列只看深度推進；對話框能帶立繪、能跳過；冒險者手冊能重看；絲嘉蕾的劇情戰；平衡帶加上「記憶期望」與深層帶。所有劇情文字先用登記過的暫定文案，6c 再寫。

**Architecture:**
- **資料、引擎、畫面三層分開。**
  - 碎片串、鎮民碎片、場景目錄是 `data/story/` 底下的純資料；劇情文字集中在 `data/story.zh-TW.ts`，每一句暫定文案都經過 `ph()` 登記進 `PLACEHOLDERS`，6c 寫完後這個集合必須是空的。
  - 掉落、保底、回城佇列、手冊內容都是 `engine/story/` 底下的純函式，輸入狀態與種子，輸出結果；`Game` 只負責呼叫它們、存檔。
  - 畫面只負責播放：`ui2/story.ts` 的 `playScene` 播一段場景，城鎮、迷宮、通關畫面、手冊都用它。
- **記憶片數跟著成員走，只有一個來源。** `Member.memories` 是這位角色自己那一串已找回的片數，`memoriesOf(m)` 是唯一的讀法（不合法的值一律當 0、超過片數就取片數）。技能樹的深淵門檻、存檔的 `validBuild`、屬性來源、絕技形態、模擬的 `partyAt` 都讀它，所以不必把 `GameState` 傳進 33 個 `statsOf` 呼叫點（見衝突第 1 點）。
- **劇情只看深度。** 幕的節點看 `dungeon.reached.mainline`；碎片晚到時在撿到的當下播自己的回憶，不擋任何節點。唯一跟碎片綁在一起的是凜的揭露，而她的第 7 片本身由本道深度排程。
- **掉落用自己的亂數流。** 碎片掉落用 `memoryRng(run)`（`Run.memoryDraws` 計數），微光的位置用 `GLIMMER_SALT` 的樓層種子，都不從 `lootRng` 或 `fillRooms` 的亂數取數，所以現有的裝備、寶箱、房間內容逐位元不變。
- **存檔升到 v8**，沿用 `save-reset` 通知。故事狀態的形狀在 Task 2 一次定好；成員的記憶欄位在 Task 3 加上。
- **平衡**：記憶在 Task 7 起才有能力值。Task 7、12、13 可能讓「10 片記憶」的平衡帶變紅，照 6a 19a 的做法暫時標成 `it.fails`，由 Task 20b 調回；Task 20a 才加入「記憶期望」與深層帶。

**Tech Stack:** TypeScript、Vitest（happy-dom）、DOM 介面加上 SCSS、Playwright e2e。

**Spec:**
- `docs/superpowers/specs/2026-10-17-starlantern-story-world-design.md`：§2 反目標、§3、§5.2–5.3、§6、§7、§8、§9.4 第 7–9 點、§10、§11、§12、§13、§16 的故事部分。spec 在 6a 期間修訂過，以標「6a 實作時修訂」的段落為準。
- 前一份計畫：`docs/superpowers/plans/2026-10-17-starlantern-plan6a-party.md`，特別是「交給 6b 的接口」與「本計畫裁定的 spec 衝突」。
- 接手清單：`.superpowers/sdd/carry/plan6b-carry.md`（逐條的處理見文末「接手清單的處理」）。
- 後續：6c 寫全部文字（本計畫的 `PLACEHOLDERS` 由 6c 清空）；美術計畫補記憶背景、碎片圖示、NPC 立繪等（見文末）。6d（主角與凜的立繪，含 `rin-oath`）已完成。

> 沒有以 `src/`、`tests/`、`docs/` 或 `.superpowers/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。

## Global Constraints
- **分支與基準**：`feat/starlantern-story`，base `aa242bf2`。
- **TDD**：先寫失敗的測試，確認它因為正確的理由失敗，再實作。
- **單元測試**
  - 單檔：`rtk proxy npx vitest run src/scripts/games/starlantern/<路徑>`。
  - 全套：`rtk proxy npx vitest run --testTimeout=20000`，讀輸出的「Test Files」與「Tests」兩行；rtk 的摘要可能藏住載入失敗的測試檔。
  - 不可以用 `npm run test`，它是 watch 模式，會卡住。
- **e2e**：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern.spec.ts --project=chromium`。不可以用 4321 埠。
- **工具**：本專案沒有 prettier、eslint，也沒有 type-check 腳本，不要去跑。
- **SCSS**：禁止 `!important`；禁止行內樣式，包括 JS 的 `element.style`；不可以用 `::before`／`::after` 做裝飾。
- **換行**：保留每個檔案原本的換行格式，改檔前用 `git ls-files --eol <檔案>` 確認；改完看 `git diff --stat`，整檔重寫代表換行壞了，要修好。CRLF 檔案不可以用 `sed -i`。新檔一律 LF。本計畫會碰到的檔案：
  - LF：`data/forge.ts`、`data/hero.ts`、`data/meetings.ts`、`data/talents.ts`、`data/trees.ts`、`data/ultimates.ts`、`data/weights.ts`、`engine/balance.lineups.test.ts`、`engine/dungeon/rooms.ts`、`engine/dungeon/run.ts`、`engine/events.ts`、`engine/forge/craft.ts`、`engine/loot/drops.ts`、`engine/progression.ts`、`engine/scaling.ts`、`engine/stats.ts`、`render/markers.ts`、`ui2/scenes/dungeon.ts`、`ui2/scenes/equip.ts`、`ui2/scenes/event.ts`、`ui2/scenes/forge.ts`、`ui2/scenes/settings.ts`、`ui2/scenes/statusTabs.ts`、`ui2/settings.ts`、`src/styles/_starlantern-ui.scss`、`tests/e2e/starlantern.spec.ts`
  - CRLF：`data/characters.ts`、`data/enemies.ts`、`data/equipment.ts`、`data/items.ts`、`data/skills.ts`、`engine/balance.test.ts`、`engine/party.ts`、`engine/portals.ts`、`engine/save.ts`、`engine/sim.ts`、`engine/state.ts`、`engine/testing.ts`、`engine/types.ts`、`render/artPaths.ts`、`ui/art.ts`、`ui/dom.ts`、`ui2/menu.ts`、`ui2/scenes/clear.ts`、`ui2/scenes/formation.ts`、`ui2/scenes/guild.ts`、`ui2/scenes/shop.ts`、`ui2/scenes/status.ts`、`ui2/scenes/town.ts`
  - 混用（照每一行原本的格式，新行跟著上下文）：`data/text.zh-TW.ts`、`engine/battle.ts`、`engine/combatant.ts`、`engine/game.ts`、`engine/skills.ts`、`engine/town.ts`、`render/BattleView.ts`、`render/MapView.ts`、`ui2/input.ts`、`ui2/main.ts`、`ui2/partyBar.ts`、`ui2/scenes/battle.ts`、`ui2/scenes/facility.ts`、`ui2/scenes/gate.ts`、`ui2/scenes/inn.ts`、`ui2/scenes/title.ts`、`ui2/widgets.ts`
- **git**
  - 一律寫出完整路徑，不可以用 `git add -A` 或 `git add .`（工作樹裡有別的代理沒提交的美術檔）。
  - Conventional Commits，訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`，即使自己的 session 建議別的模型名稱。
  - 絕對不可以執行 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`。要撤回自己的修改，就再改一次檔案。
  - 不可以 push；不可以碰 `.env`、智能合約、`public/` 或 `art-factory/` 底下的美術檔。
- **子代理**：實作者不派任何子代理。
- **瀏覽器**：一律 headless 加上 `--mute-audio`，絕不接管使用者的桌面。測試必須靜音、無頭。
- **文案**
  - 介面文字放在 `data/text.zh-TW.ts`。
  - 劇情文字（場景台詞、摘要、各階段的城鎮台詞與招呼、回城對話、吸收台詞、手冊條目、鎮民碎片的故事）放在 `data/story.zh-TW.ts`。本計畫只寫暫定文案，而且每一句都經過 `ph()`；不可以留空字串、「TODO」或任何沒經過 `ph()` 的假台詞。spec 已經逐字寫出的句子（例如凜的「……沒什麼。」）照抄，也經過 `ph()`，讓 6c 決定去留。
  - 暫定文案必須符合 §8.2 的長度上限（`lineCap`）。
- **美術**：本計畫不新增任何圖片，不做假圖示、假頭像，也不用 CSS 畫形狀。
  - 地圖上的微光用文字標記「憶」；沒有立繪的說話者只顯示名字。
  - 可以用現有的圖：主角與凜的 smile／sad 表情、`rin-oath` 的整套立繪、絲嘉蕾的站姿圖（她在劇情戰裡當敵人時用）、燈喰之獸的圖（終幕頭目）。
  - 回憶場景的暗角與淡色調是 SCSS class（`slx-talk--memory`），不是圖；剪影是現有站姿圖加上 SCSS 的 `filter`（`slx-silhouette`）。
  - `allArtUrls()` 不列任何不在磁碟上的圖；`render/artPaths.test.ts` 的 url 總數只能因為「不再列出」而變少，不能變多。
- **亂數**：一律用帶種子的 `Rng`，引擎裡不可以用 `Math.random`。碎片掉落用 `memoryRng(run)`；微光位置用 `mulberry32(floorSeed ^ GLIMMER_SALT)`；吸收用 `absorbRng(state)`。不可以從 `lootRng`、`fillRooms` 的 rng 或 `game.rng` 多取數（畫面挑台詞照舊用 `game.rng`，那是既有做法）。
- **平衡**
  - 平衡只以預設配點為準；完全不投點的隊伍被輾壓是預期內的事（使用者規則）。
  - `engine/balance*.test.ts` 的門檻一律不可以放寬。新增的帶（第 19 項）門檻以本計畫寫的數字為準。
  - 會影響戰力的任務，驗證時一律跑全套，包括 balance。
  - `it.fails` 只可以出現在 Task 7 到 Task 20d 之間，而且每一個都要在註解寫明負責的任務（`// 6b Task 20b` 之類），並記進 `.superpowers/sdd/2026-10-18-starlantern-plan6b-story/balance-baseline.md`。Task 21 確認沒有任何 `it.fails`。
  - `ENEMY_POWER.ramp` 凍結（接手清單 M3/M4）：任何任務都不可以動它。`PARTY_SCALE`、`GROUP_CAP`、`FIRST_DEPTH_CAP`、`BOSS_PARTY_SCALE` 也不是本計畫的旋鈕。
  - 6a Task 9 的峰值測試仍是硬性護欄：主角任何技能、絕技（含天燈）都不可以調過上限。
  - 紅了只能依 Task 20b、20c、20d 各自列出的旋鈕與順序調整，並在 commit 訊息寫出最後的值；任何組合都調不過時停下來回報，絕不放寬。
- **定位程式碼**：一律用內容（函式名、測試名、字串）找要改的地方，不用行號。
- **惡意存檔**：存檔驗證遇到任何不合法的值，一律回報 `corrupt`，不可以丟出例外。
- **城鎮動作**：會改變存檔的城鎮動作（販售、吸收、交還、場景看過、手冊已讀、重抽傳送門）一律經過 `Game` 的方法，在城鎮執行後立刻存檔，失敗時 `notice = 'save-failed'`。介面不可以直接改 `game.state`。
- **存檔可讀**：正常遊玩的任何路徑都不可以寫出讀不回來的存檔。
- **劇情不擋遊玩**（spec §2 反目標）：每一段劇情都能一鍵跳過、跳過算看過、可以在手冊重看；回城佇列永遠不阻擋再次出發；劇情節點只看深度，不看碎片數量。
- **測試寫法**
  - 預期值一律透過常數算出來：`CHAINS`、`chainLength`、`HERO_TOPUP`、`MEMORY_PITY`、`ELITE_PIECE_CHANCE`、`GLIMMER_CHANCE`、`MEMORY_SCALE`、`SHARD_PRICE`、`SHARD_DROP`、`TOWN_DROP`、`ABSORB_CAP`、`ABSORB_GAIN`、`TOWN_FRAGMENTS`、`PERKS`、`FRAGMENT_WEIGHT`、`ACT_DEPTHS`、`FINALE_DEPTH`、`CHAT_COUNT`、`lineCap`、`MEMORY_KEYSTONE_VALUES`、`SKY_LANTERN`、`STORY_FIGHT_ROUNDS`、`FINALE_BOSS`、`ABYSS_UNLOCK`、`depthLevel`。
  - 因為亂數序列改變而受影響的測試，改成斷言行為，不可以寫死新的數字。
- **測試修改規則**：某個任務會弄壞的每一個測試檔都列在該任務的 Files 裡，並寫明怎麼改；全套跑出沒列到的紅燈時，先停下來回報，不可以自行改寫該測試的意圖。

## Review Focus
1. **被竄改的記憶與故事欄位。** 存檔裡主角的 `memories` 是 `null`（JSON 的 NaN）、負數、小數、字串或超過片數；凜在第 7 片之前就有 `oath`；`story.queue` 裡有不存在的場景、重複的場景、或已經看過的場景：一律 `corrupt`，絕不丟例外，也絕不讓 NaN 打開深淵門檻。測試在 Task 2、Task 3。
2. **一次掉落遇到多串。** 同一個頭目同時符合主角、凜、兩位夥伴：只給一片（第 25、30 層的補齊除外），故事串先給、保底久的先給、平手時凜先；沒輪到的保底照常加；同一片不會給兩次、不會跳號。測試在 Task 4。
3. **凜揭露的那次回城。** 取得第 7 片後全滅回城、或回城後沒住宿就重新整理：揭露仍然是下一次抵達城鎮時唯一播放的場景，其他場景延到再下一次；跳過算看過，之後照常出發，不會重播。測試在 Task 15。
4. **背包已滿或超重時撿到碎片。** 鎮民碎片與無主碎片像素材一樣受重量限制，放不下就留在原地（頭目、精英的掉落記在 `left`）；全滅時跟著冒險背包一起失去；夥伴碎片沒有重量、撿到就算找回，全滅也不失去。測試在 Task 5、Task 6。
5. **「不自動播放」與跳過。** 劇情播放設成「不自動播放」時，回城佇列、迷宮裡的回憶、終幕前的補齊回憶全部視同自動跳過：算看過、在手冊標「新」，畫面上不出現任何台詞，城鎮選單立刻可用；「只播重大場景」只播序章、各幕、凜的揭露與終幕。測試在 Task 10、Task 16、Task 17。

---

## File Structure
- `data/story/chains.ts`（新）：十串夥伴碎片的地區、深度、每片提升；保底、機率、`when`。
- `data/story/fragments.ts`（新）：無主碎片的等級、價格、掉落率、吸收表；鎮民碎片表、報酬與回報。
- `data/story/scenes.ts`（新）：場景 id、種類、長度上限、幕的深度、階段。
- `data/story.zh-TW.ts`（新）：全部劇情文字（暫定），`ph()` 與 `PLACEHOLDERS`。
- `engine/story/memories.ts`（新）：夥伴碎片的資格、優先序、保底、補齊、`memoryRng`。
- `engine/story/fragments.ts`（新）：鎮民與無主碎片的掉落、販售、吸收、交還與回報。
- `engine/story/events.ts`（新）：階段、回城時的節點與揭露、抵達時要播的場景、看過與已讀。
- `engine/story/expect.ts`（新）：平衡用的「記憶期望」。
- `engine/story/handbook.ts`（新）：手冊五個分頁的內容。
- `engine/types.ts`、`engine/state.ts`、`engine/save.ts`：`Member` 的記憶欄位、`StoryState`、存檔 v8。
- `engine/progression.ts`、`engine/party.ts`：`memoriesOf`、`memory` 屬性來源、記憶關鍵天賦、絕技形態。
- `engine/battle.ts`、`engine/combatant.ts`、`engine/skills.ts`：關鍵天賦效果、天燈、黎明之刃、劇情戰。
- `engine/dungeon/run.ts`、`engine/dungeon/rooms.ts`、`engine/map.ts`：微光。
- `engine/game.ts`：掉落、保底、回城佇列、交易所、交還、終幕。
- `engine/town.ts`、`engine/forge/craft.ts`、`data/weights.ts`：回報（折扣、料理、配方）與碎片重量。
- `engine/sim.ts`、`engine/balance.test.ts`、`engine/balance.lineups.test.ts`、`engine/balance.deep.test.ts`（新）、`engine/scaling.ts`：記憶期望、深層帶、第三段敵人強度。
- `.superpowers/sdd/2026-10-18-starlantern-plan6b-story/balance-baseline.md`（新）：Task 7 起的實測數字與 sweep 紀錄。
- 畫面：`ui/art.ts`、`ui2/widgets.ts`、`ui2/story.ts`（新）、`ui2/settings.ts`、`ui2/scenes/`（`town`、`facility`、`guild`、`gate`、`shop`、`inn`、`dungeon`、`battle`、`clear`、`settings`、`status`、`statusTabs`、`handbook`（新））、`render/markers.ts`、`render/MapView.ts`、`render/BattleView.ts`、`render/artPaths.ts`、`src/styles/_starlantern-ui.scss`。
- e2e：`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 故事資料表（記憶串、碎片、場景目錄、暫定文案）

**Files:**
- Create：`data/story/chains.ts`、`data/story/fragments.ts`、`data/story/scenes.ts`、`data/story.zh-TW.ts`、`data/story/story.test.ts`

**Interfaces:**
- Produces（`data/story/chains.ts`）：
  - `type MoonPhase = 'new' | 'waxing' | 'full' | 'waning'`；`type Season = 'spring' | 'summer' | 'autumn' | 'winter'`
  - `interface When { moon?: MoonPhase[]; time?: 'day' | 'night'; season?: Season[] }`；`whenHolds(w?: When): boolean`，第 4 項上線前一律回傳 true（spec §11.1）。
  - `type FragmentSource = 'boss' | 'elite' | 'glimmer' | 'chest' | 'vault' | 'gather'`（`gather` 是第 5 項的接口，本計畫沒有來源會用到）。
  - `interface PieceDef { regions: RegionId[]; minDepth: number; bossOnly?: true; when?: When }`
  - `interface ChainDef { pieces: PieceDef[]; gain: Partial<Record<PrimaryKey, number>>; key: boolean }`（`key` 是故事關鍵串：主角、凜）
  - `CHAINS: Record<CharacterId, ChainDef>`；`chainLength(id: CharacterId): number`
  - `HERO_TOPUP: { depth: number; to: number }[] = [{ depth: 25, to: 9 }, { depth: 30, to: 10 }]`
  - `MEMORY_PITY = 3`、`ELITE_PIECE_CHANCE = 0.35`、`GLIMMER_CHANCE = 0.25`、`MEMORY_SCALE = 1`（spec §12：`memory` 要能單獨縮放；implementer's call → fixed here）
- 各串的值（spec §7.3；implementer's call → fixed here）：
  - hero：`mainline`；minDepth `[4, 6, 9, 12, 15, 18, 21, 24, 25, 30]`，第 9、10 片 `bossOnly`；gain `{ str: 1, int: 1, agi: 1, wil: 1 }`；key。
  - rin：`mainline`；minDepth `[1, 3, 4, 6, 8, 10, 15]`；gain `{ agi: 2 }`；key。
  - selene `['mainline', 'frost']` wil 2；chizuru `['frost', 'mainline']` str 2；safira `['blaze']` agi 2；sylvie `['mire']` agi 2；noel `['storm']` int 2；bobby `['mainline', 'iron']` int 2；liz `['shade']` agi 2；scarlet `['iron']` str 2。
  - 8 位夥伴的 minDepth 都是 `[1, 1, 1, 6, 6]`（§7.3：第 4、5 片只在第 6 層以後）。
  - selene 的 `when`：第 2、4 片 `{ moon: ['full'] }`，第 5 片 `{ moon: ['new'] }`（§11.1）。
- Produces（`data/story/fragments.ts`）：
  - `type ShardGrade = 'dim' | 'clear' | 'vivid'`；`SHARD_IDS = { dim: 'shard-dim', clear: 'shard-clear', vivid: 'shard-vivid' }`；`SHARD_NAMES = { dim: '微光的碎片', clear: '清晰的碎片', vivid: '鮮明的碎片' }`
  - `SHARD_PRICE = { dim: 30, clear: 80, vivid: 200 }`；`SHARD_DROP = { boss: 1, elite: 0.5, chest: 0.08, vault: 0.5 }`（boss 的 1 表示必掉 1 片）
  - `shardGrade(depth: number, roll: number): ShardGrade`：`vivid` 的份額 `clamp((depth − 10) / 20, 0, 0.5)`，`clear` 的份額 `clamp((depth − 2) / 10, 0, 0.6)`；`roll < vivid` 是 vivid，`roll < vivid + clear` 是 clear，其餘 dim。
  - `ABSORB_CAP = 20`；`ABSORB_GAIN: Record<ShardGrade, Record<StatKey, number>>`：dim `{ hp: 6, tp: 2, atk: 1, def: 1, mag: 1, res: 1, spd: 1 }`，clear 是 dim 的 2 倍，vivid 是 3 倍。
  - `type TownFragmentId = 'orik' | 'marta' | 'anna' | 'glen' | 'doran'`；`type TownPerk = 'shop-discount' | 'inn-meal' | 'shard-price' | 'portal-reroll' | 'set-recipe'`
  - `interface TownFragmentDef { id: TownFragmentId; item: string; npc: string; regions: RegionId[] | 'any'; minDepth: number; reward: { gold?: number; items?: Record<string, number> }; perk: TownPerk; questHook: string }`，`item` 是 `` `tf-${id}` ``。
  - `TOWN_FRAGMENTS`（spec §7.5）：
    - orik：道具店歐里克，`['shade']` 4，`{ gold: 300 }`，shop-discount，`'orik-hat'`
    - marta：旅館瑪莎，`['mainline']` 5，`{ items: { phoenix: 2 } }`，inn-meal，`'marta-diary'`
    - anna：公會長安娜，`'any'` 8，`{ items: { 'star-tear': 1 } }`，shard-price，`'anna-name'`
    - glen：傳送門的葛倫，`['mainline']` 15，`{ gold: 500 }`，portal-reroll，`'glen-first'`
    - doran：鍛造屋多蘭，`['iron']` 4，`{ items: { 'king-scale': 1 } }`，set-recipe，`'doran-master'`
  - `TOWN_DROP = { boss: 0.25, elite: 0.15, chest: 0.03, vault: 0.2 }`
  - `PERKS = { shopDiscountPct: 10, meal: { stat: 'def' as BuffStat, pct: 5 }, shardPriceMul: 1.25, setRecipeLess: 2 }`
  - `FRAGMENT_WEIGHT = 0.5`；`isFragmentItem(id: string): boolean`；`fragmentName(id: string): string | undefined`（鎮民碎片是 `` `${npc}的記憶碎片` ``）
- Produces（`data/story/scenes.ts`）：
  - `type ActNode = 'act2' | 'act3' | 'act4'`；`ACT_DEPTHS: Record<ActNode, number> = { act2: 4, act3: 10, act4: 16 }`；`FINALE_DEPTH = 30`
  - `type Stage = 'prologue' | 'act1' | 'act2' | 'act3' | 'act4' | 'after'`；`STAGES: Stage[]`
  - `type SceneId = 'prologue' | 'act1-after' | ActNode | 'rin-reveal' | 'finale' | `mem:${CharacterId}:${number}` | `chat:${CharacterId}:${number}` | `town:${TownFragmentId}``
  - `memScene(id: CharacterId, n: number): SceneId`；`CHAT_COUNT: Record<CharacterId, number>`（hero 4、rin 4、其他 2）
  - `SCENE_IDS: SceneId[]`（全部，固定順序）；`isSceneId(v: unknown): v is SceneId`
  - `type SceneKind = 'major' | 'memory' | 'chat' | 'town'`；`sceneKind(id)`；`MAJOR_SCENES: SceneId[] = ['prologue', 'act1-after', 'act2', 'act3', 'act4', 'rin-reveal', 'finale']`
  - `lineCap(id: SceneId): number`（§8.2、§17）：major 12，但 `act1-after` 3；memory 4，但 `mem:hero:9`、`mem:hero:10`、`mem:rin:7` 是 12；chat 3；town 8。
- Produces（`data/story.zh-TW.ts`）：
  - `type NpcId = 'anna' | 'orik' | 'marta' | 'glen' | 'doran' | 'merchant' | 'bellkeeper'`；`NPC_NAMES: Record<NpcId, string>`（安娜、歐里克、瑪莎、葛倫、多蘭、流浪商人、鐘守）
  - `type Speaker = CharacterId | NpcId | 'narrator'`
  - `interface ScriptLine { who: Speaker; mood?: Mood | ExtraMood; text: string; if?: { met?: CharacterId; notMet?: CharacterId; returned?: TownFragmentId } }`
  - `PLACEHOLDERS: Set<string>`；檔內的 `ph(text: string): string` 把 text 加進集合後原樣回傳。
  - `STORY`：
    - `scenes: Record<SceneId, { title: string; lines: ScriptLine[]; summary: string }>`。暫定文案：每段 1 句，例如 mem 是 `{ who: id, text: ph(\`（${名字}想起了第 ${n} 段記憶。）\`) }`，摘要 `ph(\`${名字}找回了一段記憶。\`)`；title 是介面字（例如「凜・第 3 片」「第二幕」），不經過 `ph`。
    - `townLines: Record<Stage, string[]>`：每階段至少 3 句，初值是目前的 `T.ui2.town.lines`（經過 `ph`）。
    - `rinLines: Partial<Record<Stage, string[]>>`：act2 起的伏筆，初值 `[ph('……沒什麼。')]`。
    - `greet: Record<'guild' | 'shop' | 'inn' | 'gate' | 'forge', Record<Stage, string[]>>`：每階段至少 2 句，初值是目前各設施的 greet。
    - `absorb: string[]`：吸收台詞，至少 1 句（6c 補到 30 句以上）。
    - `people: Record<CharacterId, string[]>`：3 段人物簡介。
    - `truths: Record<Stage, string>`：真相頁 6 條。
    - `town: Record<TownFragmentId, { lost: string; after: string }>`
  - spec §3–§6 的人物、地點、組織名稱照用；台詞內容一律 `ph`。

- [ ] **Step 1: 寫失敗的測試**（`data/story/story.test.ts`）
  - `every chain is as long as the spec says`：`chainLength('hero')` 10、`chainLength('rin')` 7、其他 8 位各 5，總和 57。
  - `the story chains open in the spec's order of depth`：hero 的 minDepth 等於上面的陣列，第 9、10 片 `bossOnly`，`HERO_TOPUP` 的深度等於第 9、10 片的 minDepth；rin 的陣列相同，而且第 7 片的 minDepth 大於 `ACT_DEPTHS.act3`。
  - `a companion's last two pieces wait for depth 6`：每位夥伴第 4、5 片 minDepth ≥ 6，第 1–3 片是 1。
  - `the hero and Rin drop only on the main road; every chain names a real region`
  - `when always holds before the calendar exists`：selene 第 2、4 片的 `when.moon` 是 `['full']`、第 5 片是 `['new']`，`whenHolds` 對它們都是 true。
  - `the catalogue covers 57 memories, the acts, Rin, the finale, chats and returns`：`mem:` 開頭的 id 有 57 個；`chat:` 的數量等於 `CHAT_COUNT` 總和；`town:` 5 個；`prologue`、`act1-after`、`act2`–`act4`、`rin-reveal`、`finale` 都在。
  - `isSceneId rejects what the catalogue lacks`：`'mem:hero:11'`、`'mem:rin:0'`、`'chat:noel:3'`、`'town:x'`、`'nope'`、`3`、`null` 都是 false。
  - `every scene has a title, a summary and lines within its cap`：對 `SCENE_IDS`，`lines.length` 介於 1 與 `lineCap(id)`；沒有任何空字串或含 `TODO` 的字串；每一句的 `who` 是 `CharacterId`、`NpcId` 或 `'narrator'`。
  - `every town fragment has a person, a story, a result and a quest hook`（spec §2 反目標「純收集任務」）：`reward` 有 gold 或至少一種 item，`STORY.town[id].lost`、`.after` 不是空的，`questHook` 不是空的，`town:${id}` 在目錄裡；item 的 id 都在 `ITEMS` 或 `MATERIALS` 裡。
  - `every stage has town lines and every facility greets in every stage`：lines ≥ 3、greet ≥ 2。
  - `shards deepen with depth`：`shardGrade(1, r)` 對 r = 0、0.5、0.99 都是 dim；`shardGrade(40, 0)` 是 vivid；`shardGrade(8, 0.1)` 是 clear。
  - `placeholders are registered`：`PLACEHOLDERS.size > 0`，而且 `STORY.scenes.prologue.lines[0].text` 在集合裡（6c 會把這一項改成 `size === 0`）。
- [ ] **Step 2: 執行，確認失敗**：`rtk proxy npx vitest run src/scripts/games/starlantern/data/story`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行 `data/` 的測試，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): story data — memory chains, fragments, scenes, draft copy`

### Task 2: 故事狀態、第一幕旗標、存檔 v8

**Files:**
- Modify：
  - `engine/state.ts`：`SAVE_VERSION = 8`；`DungeonProgress` 刪掉 `bossDefeated`；新增 `StoryState`、`newStory`；`GameState.story`；`newGame` 放進 `newStory()`。
  - `engine/save.ts`：刪掉 `bossDefeated` 的檢查；新增 `isStory`。
  - `engine/game.ts`：`map()` 與 `submitRound` 改讀寫 `story.act1Cleared`；`isStoryDepth` 的註解改成「beating it ends Act 1」；新增 `cleared`；打倒時把 `'act1-after'` 加進 `story.queue`。
  - `data/text.zh-TW.ts`：`T.clear.title = '第一幕　星燈重新亮起'`、`T.clear.back = '繼續'`（spec §8.5 逐字）；`body` 不變。
- Test（會壞的檔案與改法）：
  - `engine/game.test.ts`：所有 `bossDefeated`（spec §8.5 列出的那幾處）改成 `story.act1Cleared`；斷言通關畫面文字的地方改用 `T.clear.title`。
  - `ui2/scenes/clear.test.ts`：新的標題與「繼續」。
  - `engine/save.test.ts`：版本號；所有寫 `dungeon.bossDefeated` 的 fixture 改成 `story`。
  - 其他引用 `bossDefeated` 的測試：`grep -rn "bossDefeated" src/scripts/games/starlantern tests/e2e` 找出來，照上面改。

**Interfaces:**
- Produces（`engine/state.ts`）：
  ```ts
  export interface StoryState {
    act1Cleared: boolean; finaleCleared: boolean;
    /** Scenes played, skipped or auto-skipped. */ seen: SceneId[];
    /** Seen but not yet opened in the handbook (the 新 mark). */ fresh: SceneId[];
    /** Scenes waiting for the next arrival in town, in play order. */ queue: SceneId[];
    nodes: ActNode[];
    /** Pity per memory chain (spec §7.2). */ pity: Partial<Record<CharacterId, number>>;
    returned: TownFragmentId[];
    /** Marta's meal waits for the next departure (Task 9). */ fed: boolean;
  }
  ```
  `newStory(): StoryState` 的 `queue` 是 `['prologue']`，其他都是空的或 false。
- `isStory(v)`：
  - 兩個旗標與 `fed` 是 boolean；`finaleCleared` 為真時 `act1Cleared` 也必須為真；
  - `seen`、`fresh`、`queue` 是 `isSceneId` 的陣列，各自不重複，`fresh ⊆ seen`，`queue` 與 `seen` 沒有交集；
  - `nodes` 是 `ActNode` 的陣列且不重複；`pity` 的鍵是 `CharacterId`、值是 0 到 999 的整數；`returned` 是 `TownFragmentId` 的陣列且不重複。
- `Game.cleared: 'act1' | 'finale' | null`：進入 `clear` 階段時設定，`restartAfterClear` 清掉。本任務只會設 `'act1'`；`'finale'` 在 Task 17。

- [ ] **Step 1: 寫失敗的測試**
  - `save.test.ts`：
    - `a v7 save reports version`
    - `a fresh game's story round-trips`：`newGame()` 存檔後讀回是 `ok`，`story` 相同。
    - `a broken story is corrupt`：表格逐項測試：`story` 缺少；`act1Cleared: 'yes'`；`finaleCleared: true` 而 `act1Cleared: false`；`seen: ['nope']`；`seen: ['act2', 'act2']`；`fresh: ['act2']` 而 `seen: []`；`queue: ['act2']` 而 `seen: ['act2']`；`nodes: ['act9']`；`pity: { hero: -1 }`；`pity: { ghost: 1 }`；`pity: { rin: 1.5 }`；`returned: ['orik', 'orik']`；`fed: 1`。每一項都是 `corrupt`，而且不丟例外。
  - `game.test.ts`：
    - `beating the depth-3 boss ends Act 1`：`story.act1Cleared` 為真、`phase` 是 clear、`cleared` 是 act1、`'bossDefeated' in g.state.dungeon` 是 false、`story.queue` 含 `'act1-after'`。
    - `after Act 1 the third floor holds stairs`
    - `a new game queues the prologue`
  - `clear.test.ts`：`the clear card is Act 1's`：標題是 `T.clear.title`，唯一的按鈕是「繼續」。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作，並依 Files 修正會壞的測試**
- [ ] **Step 4: 執行全套，確認全部通過**（存檔形狀有變）
- [ ] **Step 5: commit**：`feat(starlantern): story state, Act 1 instead of the game's end, save v8`

### Task 3: 成員的記憶片數：單一來源與 6a 的接手項

**Files:**
- Modify：
  - `engine/types.ts`：`Member` 新增選填欄位 `memories?: number`、`absorbed?: AbsorbGain[]`、`oath?: true`；新增 `interface AbsorbGain { stat: StatKey; amount: number }`。
  - `engine/progression.ts`：`memoriesOf`；`canRaiseNode`／`raiseNode` 的 `memories` 預設值改成 `memoriesOf(m)`。
  - `engine/save.ts`：`validBuild(..., memoriesOf(m))`；驗證三個新欄位。
  - `engine/game.ts`：`raiseNode` 不再傳 0（刪掉「6b changes this」的註解）。
  - `engine/sim.ts`：`partyAt` 把 `lineup.memories ?? 0` 寫進主角的 `memories`，`heroTree` 改傳 `memoriesOf(主角)`。
- Test：`engine/progression.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`、`engine/sim.test.ts`、`ui2/scenes/status.test.ts`

**Interfaces:**
- `memoriesOf(m: Pick<Member, 'id' | 'memories'>): number`：不是有限數或小於 0 時是 0；否則 `min(chainLength(m.id), floor(m.memories))`。這是整個遊戲讀記憶片數的唯一方法（接手清單第 1、2 條）。
- `canRaiseNode(m, node, memories = memoriesOf(m))`、`raiseNode(m, node, memories = memoriesOf(m))`。`statusTabs` 的三個呼叫點本來就沒傳，所以自動改用主角自己的片數，不必改。
- 存檔驗證（每一位成員）：
  - `memories` 是 undefined，或 0 到 `chainLength(id)` 的整數；
  - `absorbed` 是 undefined，或長度 ≤ `ABSORB_CAP` 的陣列，每一項的 `stat` 是 7 項底層數值之一，`amount` 等於某個等級的 `ABSORB_GAIN[grade][stat]`；
  - `oath` 是 undefined，或 `true` 而且 id 是 rin、`memories === chainLength('rin')`。
- `partyAt(level, lineup)`：主角的 `memories = lineup.memories ?? 0`，tree 是 `heroTree(level, build, memoriesOf(主角))`；其他人的 `memories` 是 0。模擬的數字不變。

- [ ] **Step 1: 寫失敗的測試**
  - `progression.test.ts`：
    - `memoriesOf clamps a hostile count`：NaN、Infinity、−3、undefined 是 0；2.7 是 2；99 是 `chainLength(id)`（hero 與 rin 各測一次）。
    - `the hero's own memories open his abyss node`：主角 Lv50、劍技階層 0–3 點滿，`memories = ABYSS_UNLOCK[0]` 時 `canRaiseNode(m, 'abyss-sword')` 是 null；`ABYSS_UNLOCK[0] − 1` 與 NaN 時是 `'abyss'`。
  - `save.test.ts`：
    - `a saved capstone loads when the hero's memories allow it`：tree 含 `abyss-sword`，`memories: 2` 是 ok，`memories: 1` 是 corrupt。
    - `hostile memories are corrupt`：`null`、−1、1.5、`'3'`、`chainLength('hero') + 1` 都是 corrupt。
    - `only Rin with all seven may hold her oath`：rin 6 片加 `oath` 是 corrupt；7 片是 ok；hero 加 `oath` 是 corrupt。
    - `absorbed gains must come from the table`：`{ stat: 'atk', amount: ABSORB_GAIN.dim.atk }` 是 ok；amount 999、stat `'crit'`、超過 `ABSORB_CAP` 項都是 corrupt。
  - `game.test.ts`：`raiseNode reads the hero's memories and the save loads back`：主角 Lv50、劍技點滿、`memories = 2`，在城鎮 `raiseNode('hero', 'abyss-sword')` 成功，存檔讀回是 ok。
  - `sim.test.ts`：`partyAt puts the lineup's memories on the hero`：`partyAt(50, { memories: 6 })` 的主角 `memories` 是 6，tree 等於 `heroTree(50, 'balanced', 6)`；凜是 0。
  - `status.test.ts`：`the abyss node opens with the hero's memories`：主角 `memories = 2`、劍技階層 0–3 有點，技能樹上 `abyss-sword` 那一列沒有「深淵尚未甦醒」。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**（balance 必須全綠而且數字不變：本任務只搬移記憶的來源）
- [ ] **Step 5: commit**：`feat(starlantern): one source for memories, the hero's abyss reads it`

### Task 4: 夥伴碎片的掉落規則（純函式）

**Files:**
- Create：`engine/story/memories.ts`、`engine/story/memories.test.ts`

**Interfaces:**
- `type Pity = Partial<Record<CharacterId, number>>`
- `type FragmentGain = { kind: 'piece'; id: CharacterId; n: number; play: boolean } | { kind: 'shard'; grade: ShardGrade } | { kind: 'town'; id: TownFragmentId }`（`play` 由 Task 5 填，本任務一律 false）
- `interface PieceCtx { region: RegionId; depth: number; source: FragmentSource; who?: CharacterId }`
- `nextPiece(p: Party, id: CharacterId): number | null`：`memoriesOf + 1`，超過片數時 null。
- `eligible(p: Party, id: CharacterId, ctx: PieceCtx): boolean`：
  - 已遇見（在 `recruited` 裡）；有下一片；`ctx.region` 在那片的 `regions` 裡；`ctx.depth ≥ minDepth`；`whenHolds(when)`；
  - `bossOnly` 的片只在 `source === 'boss'` 時成立。
- `pieceDrops(p: Party, pity: Pity, ctx: PieceCtx, rng: Rng): CharacterId[]`（spec §7.2 的順序）：
  1. 有 `ctx.who`（保底或凜的第一片的微光）：`eligible` 就回傳 `[who]`，否則 `[]`。
  2. 本道的頭目、主角有資格，而且 `ctx.depth` 達到某個 `HERO_TOPUP` 的深度：回傳 `'hero'` 重複 `to − memoriesOf(主角)` 次（取符合的最大 `to`）。這是「一次只給一片」唯一的例外。
  3. `candidates` = 所有 `eligible` 的人；沒有人時回傳 `[]`。
  4. 精英怪：主角不在 `candidates` 裡時，`rng() < ELITE_PIECE_CHANCE` 才給，否則 `[]`。頭目、微光一定給。
  5. 挑一位：候選中有故事串（`key`）時只看故事串，保底最大的先，平手時凜先；否則保底最大的夥伴，平手時依 `CHARACTER_IDS` 的順序排好，`pick(rng, 平手的人)`。
  6. 回傳 `[那一位]`。
- `pityAfterFloor(p: Party, pity: Pity, region: RegionId, depth: number, dropped: CharacterId[]): Pity`：在這一層 `eligible`（`source` 當成 `'glimmer'`）的每一串，沒掉的 +1，掉了的歸 0；其他串不變。回傳新的物件。
- `forcedGlimmers(p: Party, pity: Pity, region: RegionId, depth: number): CharacterId[]`：
  - 保底 ≥ `MEMORY_PITY` 而且在這一層 `eligible` 的串；
  - 凜還沒有第 1 片、而且 `region === 'mainline'` 時，凜也在內（spec §7.3「第一趟的第一處微光必得」；見衝突第 16 點）；
  - 依 `CHARACTER_IDS` 的順序，最多 2 位。
- `applyPieces(p: Party, ids: CharacterId[]): { party: Party; gained: { id: CharacterId; n: number }[] }`：依序把各人的 `memories` 加 1，回傳新的隊伍與每一片的編號；原本的 party 不變。

- [ ] **Step 1: 寫失敗的測試**（隊伍用 `fullParty()` 或 `newParty()` 再 `meet`）
  - `only the next piece of a met companion`：沒遇見的 sylvie 在 mire 永遠不合格；遇見後 mire depth 1 合格；`memories = 3` 時 mire depth 5 不合格、depth 6 合格；`memories = 5` 時 `nextPiece` 是 null。
  - `the hero's pieces wait for their depth on the main road`：`memories = 0` 時 mainline depth 3 不合格、depth 4 合格；blaze depth 10 不合格。
  - `the story chains come first, then the longest wait`：本道第 10 層頭目，主角、凜、瑟蕾都合格：
    - pity `{ hero: 1, rin: 1, selene: 5 }` 給 rin；`{ hero: 2, rin: 1 }` 給 hero；
    - 只有瑟蕾與千鶴合格、pity 相同：結果是兩人之一，同一個種子結果相同，各試 50 個種子兩人都出現過。
  - `one piece per boss`：一般頭目的結果長度是 1。
  - `the depth-25 and depth-30 bosses top the hero up`：`memories = 5` 時第 25 層頭目給 4 次 hero；`memories = 9` 時第 30 層給 1 次；`memories = 2` 時第 30 層給 8 次；第 26 層的精英怪不給第 9 片。
  - `an elite always pays the hero and the rest by chance`：主角合格時給 hero；只有瑟蕾合格時，1000 個種子的給出比例在 `ELITE_PIECE_CHANCE ± 0.05`。
  - `a forced glimmer holds its own chain's piece`：`who: 'noel'` 合格時是 `['noel']`，不合格時是 `[]`。
  - `pity grows on floors cleared without a piece and resets on one`
  - `pity forces a glimmer for that chain only where it can drop`：瑟蕾 pity 是 `MEMORY_PITY` 時，mainline depth 2 的 `forcedGlimmers` 含 selene，blaze 不含。
  - `Rin's first piece waits in a glimmer on the main road`
  - `the same inputs draw the same pieces`
  - `applyPieces never skips or repeats`：`applyPieces(p, ['rin', 'rin'])` 的 gained 是 n 1、2；原本的 p 不變。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行 `engine/story` 的測試，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): memory piece drops, priority and pity`

### Task 5: 微光與夥伴碎片接進遊戲

**Files:**
- Modify：
  - `engine/map.ts`：`Tile` 加入 `'glimmer'`。
  - `engine/dungeon/rooms.ts`：`Content.kind` 加入 `'glimmer'`；`Content.owner?: CharacterId`（保底微光指定的串）；把 `placeRescue` 的選房與選格抽成 `placeSpecial(f, g, rng, content)`，`placeRescue` 改呼叫它，行為不變。
  - `engine/dungeon/run.ts`：`Run.glimmers: Record<number, CharacterId[]>`、`Run.memoryDraws: number`、`Run.dropped: Record<number, CharacterId[]>`、`Run.played: number[]`；`floorOf` 放微光。
  - `engine/story/memories.ts`：`memoryRng(run)`。
  - `engine/game.ts`：見下方 Interfaces。
  - `render/markers.ts`、`render/MapView.ts`：`'glimmer'` 的標記，照 6a 的 `'rescue'` 做法（`MARKER_GLYPH.glimmer = '憶'`、`LIVE`、`ON_FLOOR`、不查貼圖）。
  - `ui2/scenes/dungeon.ts`：`case 'glimmer'`：照 `'key'` 的做法 `say` 出找到的東西（真正的回憶場景在 Task 17）。
  - `ui2/scenes/battle.ts`：戰果的 `lines` 在加入隊伍那一行之後，列出 `end.fragments`。
  - `data/text.zh-TW.ts`：`T.ui2.memory = { piece: (name, n) => \`找回了${name}的記憶（第 ${n} 片）。\`, shard: (name) => \`撿到了${name}。\`, town: (name) => \`撿到了${name}。\`, nothing: '微光消散了。' }`。
- Test：`engine/dungeon/run.test.ts`、`engine/dungeon/rooms.test.ts`、`engine/game.test.ts`、`render/MapView.test.ts`、`ui2/scenes/dungeon.test.ts`、`ui2/scenes/battle.test.ts`
  - 斷言某個種子的 `floorOf(...).contents` 完整清單的現有測試，比較前先濾掉 `kind === 'glimmer'`（`placeSpecial` 只用內容是空的房間，其他內容不會動）。

**Interfaces:**
- `memoryRng(run: Run): Rng = mulberry32(mix(run.seed ^ MEMORY_SALT, run.memoryDraws++))`，`MEMORY_SALT = 0x510e527f`。
- `floorOf`：照原本的順序產生、放求救房之後：
  - `GLIMMER_SALT = 0x9b05688c`，`const r = mulberry32(seed ^ GLIMMER_SALT)`；`r() < GLIMMER_CHANCE` 時放一處沒有 owner 的微光；
  - 再依序為 `run.glimmers[depth]` 的每一位放一處 `owner` 是她的微光（同一個 `r`）。
- `Game`：
  - `depart` 與 `changeFloor` 在產生該層之前（`this.map()` 之前），若該層還沒產生，設 `run.glimmers[floor] = forcedGlimmers(party, story.pity, region, floor)`。
  - `move` 踩到 `'glimmer'`：`pieceDrops(party, pity, { region, depth, source: 'glimmer', who: c.owner }, memoryRng(run))`，`applyPieces`，記進 `run.dropped[floor]`；格子變成 floor、content 移除；回傳 `{ kind: 'glimmer'; gained: FragmentGain[] }`。沒有任何碎片時 `gained` 是空的（Task 6 補上無主碎片）。
  - 頭目、精英怪勝利：`submitRound` 在 `awardExp` 與 `meet` 之後呼叫 `pieceDrops`（source `boss` 或 `elite`），套用並記進 `run.dropped`；`BattleEnd.fragments?: FragmentGain[]`。
  - `play`：這一層 `run.played` 還沒有記錄時，第一片的 `play` 是 true，並把該層加進 `run.played`；其他片 `play` 是 false，場景 id 加進 `story.seen` 與 `story.fresh`（spec §8.2「同一層已播過一次，之後的改成在手冊標新」）。
    - 例外：第 25 層補齊的主角碎片全部 `play: false`，場景 id 依序加進 `story.queue`（不進 seen）；第 30 層的補齊由 Task 17 處理，本任務先照一般規則。
  - `descend`：換層之前 `story.pity = pityAfterFloor(party, pity, region, floor, run.dropped[floor] ?? [])`。
  - 全滅：`memories` 與 `pity` 都留著（記憶不是戰利品）。
- `MoveResult` 新增 `{ kind: 'glimmer'; gained: FragmentGain[] }`。

- [ ] **Step 1: 寫失敗的測試**
  - `run.test.ts`：
    - `a glimmer may lie on a floor, decided by the floor's own seed`：找出一個有、一個沒有的種子；同一個種子結果相同；濾掉微光後其他 content 與沒有微光的版本完全相同。
    - `forced glimmers carry their owner`：`run.glimmers[2] = ['selene']`，第 2 層有一處 owner 是 selene 的微光，與入口相連（BFS 可達）。
  - `rooms.test.ts`：`placeRescue still lands where it did`：抽出 `placeSpecial` 前後，同一個種子的求救房位置相同（先在改動前記下位置）。
  - `game.test.ts`：
    - `the first trip down the main road finds Rin's first memory`：`Game.fresh` 後出發本道第 1 層，`floorOf(run, 1).contents` 有 owner 是 rin 的微光；站到旁邊再走上去，`gained` 是 `[{ kind: 'piece', id: 'rin', n: 1, play: true }]`，凜的 `memories` 是 1，格子變成 floor。
    - `a main-road boss pays the next piece of a story chain`：主角合格的第 5 層頭目，`BattleEnd.fragments` 含 hero 第 1 片，主角 `memories` 是 1。
    - `the second memory on a floor waits in the handbook`：同一層第二片的 `play` 是 false，`story.fresh` 含它的場景 id。
    - `descending raises the pity of the chains that found nothing`
    - `a wipe keeps the memories found`
    - `the depth-25 boss queues the hero's top-up memories`：`memories = 5`，打倒後 `memories` 是 9，`story.queue` 依序含 `mem:hero:6` 到 `mem:hero:9`。
    - `memory draws leave the loot rolls alone`：同一個種子的同一場精英戰，掉落的裝備與改動前記下的相同。
  - `MapView.test.ts`：`a seen glimmer shows the 憶 marker and asks for no art`（照 6a 的 rescue 測試，含證明 spy 接對路徑的 altar）。
  - `dungeon.test.ts`：`stepping on a glimmer says what was found`
  - `battle.test.ts`（ui2）：`a won fight lists the memories found`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作，並依 Files 修正會壞的測試**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): glimmers and memory pieces in the labyrinth`

### Task 6: 鎮民碎片與無主碎片的掉落

**Files:**
- Create：`engine/story/fragments.ts`、`engine/story/fragments.test.ts`
- Modify：
  - `data/weights.ts`：`weightOf` 對 `isFragmentItem` 回傳 `FRAGMENT_WEIGHT`。
  - `ui/dom.ts`：`itemName` 認得碎片（`fragmentName`）。
  - `engine/game.ts`：頭目、精英的戰利品；寶箱、寶庫；空的微光。
- Test：`engine/story/fragments.test.ts`、`engine/game.test.ts`、`data/data.test.ts`（或現有的 weights 測試所在處）

**Interfaces:**
- `townFragmentEligible(s: GameState, run: Run | null, id: TownFragmentId, region: RegionId, depth: number): boolean`：地區符合（`'any'` 都符合）、深度 ≥ minDepth、不在 `story.returned`、不在 `inventory`、不在 `run.loot.items`。
- `lootFragments(s: GameState, run: Run, ctx: { region; depth; source: 'boss' | 'elite' | 'chest' | 'vault' }, rng: Rng): FragmentGain[]`：
  - 無主碎片：頭目必掉 1 片；其他來源 `rng() < SHARD_DROP[source]` 時 1 片；等級是 `shardGrade(depth, rng())`。
  - 鎮民碎片：合格的鎮民碎片依 `TOWN_FRAGMENTS` 的順序排好，`rng() < TOWN_DROP[source]` 時給第一個合格的；一次最多一片。
  - rng 是 `memoryRng(run)`。
- `Game`：
  - 頭目、精英：`lootFragments` 的碎片照素材的方式進冒險背包（`grant`），放不下的記在 `BattleEnd.left`；也列在 `BattleEnd.fragments`。
  - 寶箱、寶庫：碎片併入那個點的戰利品，第一次擲出後記在 `run.rolls`（鍵 `` `frag:${spotId}` ``），所以放不下再回來時結果相同；重量照現有的 `shutFor` 規則。`MoveResult` 的 `chest`、`vault` 新增 `fragments?: FragmentGain[]`。
  - 沒有夥伴碎片的微光：給 1 片無主碎片（`shardGrade(depth, rng())`），重量不夠時微光留在原地，回傳 `{ kind: 'full', item, qty: 1, need }`。
  - 回城：碎片照素材的方式存進 `inventory`，`bankedLine` 自然列出名字；全滅：跟著冒險背包一起失去。

- [ ] **Step 1: 寫失敗的測試**
  - `fragments.test.ts`：
    - `a town fragment waits for its place and depth`：orik 在 shade 4 合格、shade 3 與 mainline 4 不合格；anna 在任何地區第 8 層合格。
    - `a fragment held, carried or returned never drops again`
    - `a boss always leaves one ownerless shard`：1000 個種子都至少有 1 片 shard。
    - `the same seed loots the same fragments`
  - `game.test.ts`：
    - `fragments ride in the run pack and are lost on a wipe`
    - `a full pack leaves the shard behind`：把背包塞到剩不到 `FRAGMENT_WEIGHT`，頭目的 shard 記在 `left`。
    - `an empty glimmer gives a shard, or waits when the pack is full`
    - `a chest that was too heavy rolls the same fragments when the party comes back`
    - `fragments come home with the run`：回城後 `inventory` 有它們，`banked.items` 列出。
  - 重量：`fragments weigh FRAGMENT_WEIGHT, memory pieces weigh nothing`：`weightOf(SHARD_IDS.dim)`、`weightOf('tf-orik')` 是 `FRAGMENT_WEIGHT`；撿到夥伴碎片前後 `carried` 不變。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): townsfolk and ownerless fragments as loot`

### Task 7: 屬性來源 `memory` 與狀態頁的欄位

**Files:**
- Create：`.superpowers/sdd/2026-10-18-starlantern-plan6b-story/balance-baseline.md`
- Modify：
  - `engine/party.ts`：`StatSource` 加入 `'memory'`；`memoryStats`；`statSources` 在 `talent` 之後、`primary` 之前加入 `memory`；`primary` 的換算池加入記憶的主屬性。
  - `data/text.zh-TW.ts`：`T.ui2.status.sources.memory = '記憶'`。
  - `engine/balance.test.ts`、`engine/balance.lineups.test.ts`：只在變紅時改成 `it.fails`（見 Step 4）。
- Test：`engine/party.test.ts`、`ui2/scenes/status.test.ts`

**Interfaces:**
- `memoryStats(m: Member, scale = MEMORY_SCALE): Partial<Sheet>`：
  - 主屬性 = `CHAINS[m.id].gain` 的每一項 × `memoriesOf(m)` × scale；
  - 加上 `absorbed` 每一項的 `amount × scale`（加在它的 `stat` 上）；
  - scale 是 0 時回傳 `{}`。
- `statSources` 的 `memory` 欄就是 `memoryStats(m)`；記憶的主屬性和裝備、套裝、天賦的主屬性一起經 `convertPrimary(..., def.affinity)` 進 `primary` 欄（spec §7.3「透過現有的主屬性換算變成衍生屬性」）。

- [ ] **Step 1: 寫失敗的測試**
  - `party.test.ts`：
    - `memory pieces add their chain's primaries`：凜 3 片時 memory 欄的 agi 是 `3 × CHAINS.rin.gain.agi`；主角 5 片時 str、int、agi、wil 各 5；瑟蕾 2 片時 wil 4。
    - `memory primaries convert like gear primaries`：有與沒有記憶時 `sheetOf` 的 atk 差，等於 `convertPrimary(gain × n, affinity).atk`（誤差 1e-9）。
    - `absorbed gains add to the memory column`
    - `scale zero switches memory off`：`memoryStats(m, 0)` 是 `{}`。
    - `a member without memories has an empty memory column`
  - `status.test.ts`：`the stats tab shows a 記憶 column`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套**
  - 預期只有帶著 `memories: 10` 的帶會變（`10 (memories)`、`11 (memories, abyss cap)`、`14 (memories, abyss cap)`、`the memories variants measure something`、`18e`），因為其他帶的成員都沒有記憶。
  - 用 `BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.test.ts src/scripts/games/starlantern/engine/balance.lineups.test.ts --testTimeout=300000` 記下每一項的數字，寫進 `balance-baseline.md`。
  - 紅的項目改用 `it.fails(...)`，斷言照寫，註解 `// 6b Task 20b`；綠的不動。上面以外的帶紅了，停下來回報。
- [ ] **Step 5: commit**：`feat(starlantern): the memory stat source`，訊息列出 `it.fails` 的清單。

### Task 8: 碎片交易所：販售與吸收（引擎）

**Files:**
- Modify：`engine/story/fragments.ts`、`engine/game.ts`
- Test：`engine/story/fragments.test.ts`、`engine/game.test.ts`

**Interfaces:**
- `shardPrice(s: GameState, grade: ShardGrade): number`：`SHARD_PRICE[grade]`，安娜的碎片交還後乘 `PERKS.shardPriceMul` 並四捨五入（Task 9 的 `hasPerk`；本任務先寫成讀 `story.returned.includes('anna')`，Task 9 改成 `hasPerk`）。
- `sellShards(s: GameState, grade: ShardGrade, qty: number): TownResult`：qty 是正整數且持有足夠；付 `shardPrice × qty`；不計入 `sold`（碎片不解鎖商品）。
- `absorbRng(s: GameState): Rng = mulberry32(mix(s.forgeSalt ^ ABSORB_SALT, 全隊 absorbed 的總項數))`，`ABSORB_SALT = 0x1f83d9ab`。存檔立刻寫入，所以讀檔不能重擲。
- `absorb(s: GameState, id: CharacterId, grade: ShardGrade): { ok: true; state: GameState; gain: AbsorbGain; line: string } | { ok: false; reason: 'invalid' | 'stock' | 'cap' }`：
  - id 必須已遇見（`invalid`）；持有該等級的碎片（`stock`）；`absorbed` 未滿 `ABSORB_CAP`（`cap`）；
  - rng 先抽 stat（7 項底層數值等機率），再抽台詞 `STORY.absorb` 的一句；
  - gain 是 `{ stat, amount: ABSORB_GAIN[grade][stat] }`，加在成員的 `absorbed` 最後；碎片少 1。
- `Game.sellShards(grade, qty)`、`Game.absorb(id, grade)`：只在 town 有效，成功後立刻存檔。

- [ ] **Step 1: 寫失敗的測試**
  - `fragments.test.ts`：
    - `selling shards pays their price and unlocks nothing`
    - `absorbing gives a seeded gain from the grade's table`：gain 的 amount 等於 `ABSORB_GAIN[grade][gain.stat]`；同一個狀態算兩次結果相同；`line` 是 `STORY.absorb` 裡的一句。
    - `a member stops at ABSORB_CAP`：已有 `ABSORB_CAP` 項時是 `cap`，狀態不變。
    - `absorbing needs the shard and a member who was met`
  - `game.test.ts`：`selling and absorbing work only in town and save at once`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): the fragment exchange sells and absorbs`

### Task 9: 鎮民碎片的交還與回報（引擎）

**Files:**
- Modify：
  - `engine/story/fragments.ts`：`returnFragment`、`hasPerk`；`shardPrice` 改用 `hasPerk`。
  - `engine/town.ts`：`priceOf`；`buy` 用它；`rest` 在瑪莎的回報生效時設 `story.fed = true`。
  - `engine/forge/craft.ts`：`craftSet` 的地區素材數改讀 `setRecipeOf(s)`。
  - `engine/game.ts`：`returnFragment`；`depart` 吃掉料理；`rerollPortals`。
  - `ui2/scenes/shop.ts`：價格改顯示 `priceOf`。
  - `ui2/scenes/gate.ts`：葛倫的回報生效、本次抵達還沒重抽時，多一個指令「重抽傳送門」。
  - `ui2/scenes/forge.ts`：套裝配方顯示 `setRecipeOf`。
  - `data/text.zh-TW.ts`：`T.ui2.gate.reroll = '重抽傳送門'`。
- Test：`engine/story/fragments.test.ts`、`engine/town.test.ts`、`engine/forge/craft.test.ts`、`engine/game.test.ts`、`ui2/scenes/shop.test.ts`、`ui2/scenes/gate.test.ts`

**Interfaces:**
- `hasPerk(s: GameState, perk: TownPerk): boolean`：擁有這個回報的鎮民碎片在 `story.returned` 裡。
- `returnFragment(s: GameState, id: TownFragmentId): TownResult`：`inventory` 有 `TOWN_FRAGMENTS[id].item`（否則 `stock`）；移除它；`story.returned` 加上 id；付 `reward` 的金錢與道具（`addItem`）。
- `priceOf(s: GameState, id: string): number | undefined`：`ITEMS` 或 `EQUIPMENT` 的價格；`shop-discount` 生效時 `ceil(price × (100 − PERKS.shopDiscountPct) / 100)`。
- `setRecipeOf(s: GameState): typeof SET_RECIPE`：`set-recipe` 生效時 `regionQty` 減 `PERKS.setRecipeLess`。
- 料理：`rest` 在 `inn-meal` 生效時設 `story.fed = true`；`Game.depart` 在 `fed` 時把 `PERKS.meal` 加進 `run.altarBuffs` 並設回 false（計入祭壇的上限，見衝突第 10 點）。
- `Game.returnFragment(id)`：town 才有效，成功後立刻存檔；場景的播放在 Task 11。
- `Game.rerollPortals(): boolean`：town、`portal-reroll` 生效、本次抵達還沒重抽時，`rollPortals(this.rng, favouredRegions(...))`，記下已重抽，立刻存檔；`toTown`、`wipe`、`boot` 把記號歸零。

- [ ] **Step 1: 寫失敗的測試**
  - `fragments.test.ts`：
    - `returning a fragment pays its reward and records it`：金錢、道具與 `reward` 相符；`story.returned` 含它；`inventory` 沒有它了。
    - `a returned fragment never drops again`
    - `Anna's return raises the shard price`
  - `town.test.ts`：
    - `Orik's return takes PERKS.shopDiscountPct off the shop`：同一件商品，`priceOf` 前後與 `buy` 扣的錢都相符。
    - `Marta feeds the party who rest at the inn`
  - `craft.test.ts`：`Doran's master lowers the set recipe`
  - `game.test.ts`：
    - `a fed party sets out with the meal and is hungry again`：`run.altarBuffs` 含 `PERKS.meal`；`story.fed` 回到 false。
    - `Glen rerolls the portals once per arrival`：第二次回傳 false；回城後又可以。
    - `returnFragment works only in town and saves at once`
  - `shop.test.ts`：`the shop shows the discounted price`
  - `gate.test.ts`：`the reroll command appears only with Glen's perk`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): townsfolk fragments go home and change the town`

### Task 10: 對話框的立繪、場景播放、跳過與「劇情播放」設定

**Files:**
- Create：`ui2/story.ts`、`ui2/story.test.ts`
- Modify：
  - `ui2/widgets.ts`：`Dialogue.say` 新增選填的立繪參數；`Dialogue.setStyle`。
  - `ui/art.ts`：`artIdOf`。
  - `ui2/settings.ts`：`Settings.story`。
  - `ui2/scenes/settings.ts`：新的一列。
  - `data/text.zh-TW.ts`：`T.ui2.settings.story = '劇情播放'`、`T.ui2.settings.storyModes = { all: '全部播放', major: '只播重大場景', none: '不自動播放' }`、`T.ui2.story.skipped = (summary: string) => \`（略過）${summary}\``。
  - `src/styles/_starlantern-ui.scss`：`.slx-talk-face`（左右兩種位置）、`.slx-talk--memory`（暗角與淡色調，用既有的色彩變數）。
- Test：`ui2/widgets.test.ts`、`ui2/settings.test.ts`、`ui2/scenes/settings.test.ts`

**Interfaces:**
- `Dialogue.say(name: string, text: string | Rich, face?: { src: string; side: 'left' | 'right' }): Promise<void>`：有 face 時框內加一張 `<img class="slx-talk-face slx-talk-face--left|right">`，沒有時沒有 img。
- `Dialogue.setStyle(style: 'plain' | 'memory'): void`：切換 `slx-talk--memory`。
- `artIdOf(m: Pick<Member, 'id' | 'oath'>): string`：凜有 `oath` 時是 `'rin-oath'`，其他是 id。
- `ui2/story.ts`：
  - `type StoryMode = 'all' | 'major' | 'none'`；`shouldPlay(id: SceneId, mode: StoryMode): boolean`：all 一律 true；major 只有 `MAJOR_SCENES`；none 一律 false。
  - `speakerOf(who: Speaker, s: GameState, index: ArtIndex, mood: Mood | ExtraMood = 'normal'): { name: string; face?: string }`：
    - 角色：名字是 `CHARACTERS[id].name`；圖是 `art.portrait(artIdOf(成員), mood)`，沒有那個表情時，smile 退回 normal、sad 退回 down、再退回 normal；連 normal 都沒有就不給圖。
    - 安娜、歐里克、瑪莎、葛倫、多蘭：`art.npc(對應的設施, 'normal')`（有圖才給）；流浪商人、鐘守只有名字；narrator 是空名字、沒有圖。
  - `linesOf(id: SceneId, s: GameState): ScriptLine[]`：`STORY.scenes[id].lines` 去掉 `if` 不成立的行（`met`、`notMet` 看 `recruited`，`returned` 看 `story.returned`）。
  - `playScene(talk: Dialogue, id: SceneId, ctx: SceneCtx): { done: Promise<'done' | 'skipped'>; onAction(a: UiAction): void }`：
    - memory 種類的場景用 `setStyle('memory')`，結束後回到 plain；
    - 第一位說話者在左，其他說話者在右；
    - 呼叫者在播放期間把每一個 `onAction` 轉給回傳的 `onAction`：`confirm` 交給 `Dialogue`；`cancel`（Esc、X、右鍵）時停止，`say` 一句 `T.ui2.story.skipped(summary)`，確認後 `done` 以 `'skipped'` 結束；全部播完以 `'done'` 結束。
- `Settings.story: StoryMode`，`DEFAULT_SETTINGS.story = 'all'`；`loadSettings` 不合法時用預設值。

- [ ] **Step 1: 寫失敗的測試**
  - `widgets.test.ts`：
    - `a line can carry a face on either side`
    - `a line without a face shows no image`
    - `memory style marks the box`
  - `story.test.ts`（ui2）：
    - `a scene plays its lines in order and ends done`
    - `cancel skips the rest and shows the summary`：第一句時按 cancel，下一個畫面是 `T.ui2.story.skipped(summary)`，結果是 skipped。
    - `lines whose condition fails are left out`：用一段測試自己定義的 lines（`vi.spyOn` 或傳入假的 STORY 項目），`notMet: 'bobby'` 的行在波比遇見後消失。
    - `a speaker without art shows only a name`：鐘守沒有 img；narrator 沒有名字。
    - `Rin speaks with the rin-oath face after her oath`
    - `a missing story face falls back to normal`：用沒有 smile 的角色要 smile，src 是 normal。
    - `shouldPlay follows the mode`
  - `settings.test.ts`：`story playback defaults to all and rejects junk`
  - `ui2/scenes/settings.test.ts`：`the story row cycles all, major and none`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套與 e2e，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): faces in dialogue, skippable scenes, story playback setting`

### Task 11: 公會的碎片交易所介面

**Files:**
- Modify：
  - `ui2/scenes/guild.ts`：新指令「碎片交易所」（id `exchange`），子選單：販售、吸收、交還鎮民碎片。
  - `data/text.zh-TW.ts`：`T.ui2.exchange = { title: '碎片交易所', sell: '販售無主碎片', absorb: '吸收無主碎片', give: '交還鎮民碎片', who: '要讓誰吸收？', count: (n: number, cap: number) => \`已吸收 ${n}／${cap}\`, full: '已經吸收不了更多了。', none: '沒有可以交還的碎片。' }`。
- Test：`ui2/scenes/guild.test.ts`

**Interfaces:**
- 販售：依等級列出持有的無主碎片，價格是 `shardPrice`；選了之後用現有的 `QtyView`；呼叫 `game.sellShards`。
- 吸收：選等級 → 選成員（清單是 `recruited`，右邊顯示 `T.ui2.exchange.count(n, ABSORB_CAP)`，滿了的反灰）→ 確認 → `game.absorb`；成功後 `say` 兩句：吸收的那一句陌生人台詞，與得到的提升（「atk +2」這類，用 `T.ui2.status` 既有的屬性名稱）。
- 交還：列出 `inventory` 裡的鎮民碎片 → 確認 → `game.returnFragment` → 用 `playScene` 播 `town:${id}`（照設定，`none` 時視同自動略過）→ `say` 報酬。播放結果用 `game.sceneDone(...)` 記錄的部分在 Task 15 補上；本任務的交還場景播完不記錄（Task 15 的測試會補）。
- 三個子選單都空的時候，該項反灰；「碎片交易所」本身永遠可選。

- [ ] **Step 1: 寫失敗的測試**（`guild.test.ts`）
  - `the exchange sells shards for their price`
  - `absorbing shows the count and the cap, and refuses a full member`
  - `absorbing says a stranger's line and the gain`
  - `giving back a fragment plays its return and pays the reward`
  - `empty lists are disabled`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): the guild's fragment exchange`

### Task 12: 記憶關鍵天賦（含凜的誓約）

**Files:**
- Modify：
  - `data/talents.ts`：`KeystoneId` 加入 9 個記憶關鍵天賦；`KEYSTONES` 的名稱與說明；`MEMORY_KEYSTONES`、`MEMORY_KEYSTONE_VALUES`。`CHAR_KEYSTONES` 與 `KEYSTONE_VALUES` 不動（6a 凍結）。
  - `engine/progression.ts`：`keystonesOf` 加上記憶關鍵天賦。
  - `engine/battle.ts`、`engine/combatant.ts`、`engine/skills.ts`：效果。
  - `ui2/scenes/statusTabs.ts`：天賦分頁在關鍵天賦那一區之後加一行記憶關鍵天賦。
  - `data/text.zh-TW.ts`：`T.ui2.talent.memoryKeystone = (name: string) => \`記憶關鍵天賦：${name}\``、`T.ui2.talent.memoryLocked = (n: number) => \`找回全部 ${n} 片記憶後覺醒\``、`T.ui2.talent.oathLocked = '在她做出選擇之後覺醒'`。
- Test：`data/talents.test.ts`、`engine/progression.test.ts`、`engine/battle.test.ts`、`engine/skills.test.ts`、`ui2/scenes/status.test.ts`

**Interfaces:**
- `MEMORY_KEYSTONES: Record<Exclude<CharacterId, 'hero'>, KeystoneId>`（spec §7.3、§5.3；效果與數值 implementer's call → fixed here；名稱 6c 可改）：
  - selene `'moon-promise'` 我想看見：她施放的回復 +`moonHealPct`（20）%。
  - chizuru `'small-shrine'` 小小的祠：戰鬥開始時，全隊 def +`shrineDefPct`（15）%，`shrineTurns`（3）回合。
  - safira `'troupe-step'` 你要繼續跳：她施放的增益多持續 `troupeTurns`（1）回合。
  - sylvie `'carried-out'` 先把人帶出去：對滿血目標的傷害 +`fullHpPct`（30）%。
  - noel `'teachers-gift'` 老師的書：她的技能 TP 消耗 −`tpCostPct`（20）%（加進 `x.tpCost`）。
  - bobby `'blueprint'` 修好的構造圖：砲台威力 +`turretPct`（30）%。
  - liz `'fathers-face'` 父親的臉：`matFind` +`matFind`（20）（加進 `x.matFind`）。
  - scarlet `'not-a-shield'` 不是盾，是朋友：挑釁中受到的傷害再 −`friendGuardPct`（20）%。
  - rin `'unrung-bell'` 不再鳴響的鐘：主角倒下時，凜立刻對第一個活著的敵人普通攻擊一次，並得到 atk +`bellAtkPct`（50）%，`bellTurns`（2）回合。
- `MEMORY_KEYSTONE_VALUES = { moonHealPct: 20, shrineDefPct: 15, shrineTurns: 3, troupeTurns: 1, fullHpPct: 30, tpCostPct: 20, turretPct: 30, matFind: 20, friendGuardPct: 20, bellAtkPct: 50, bellTurns: 2 }`
- `keystonesOf(m)`：天賦盤上持有的關鍵天賦，接著：
  - 夥伴 `memoriesOf(m) ≥ chainLength(m.id)` 時加上 `MEMORY_KEYSTONES[m.id]`；
  - 凜要 `m.oath` 為真才有（她的記憶關鍵天賦就是誓約）；
  - 主角永遠沒有（spec §4.6：主角學不到記憶關鍵天賦）。
  - 不經過 `talentBlocker`，所以不佔 `maxKeystones`，也不花天賦點。
- 凜的鐘：在 `resolveRound` 裡，每一次行動與回合結束的傷害之後，主角從活著變成倒下、凜活著而且持有 `'unrung-bell'` 時觸發；每次倒下觸發一次。

- [ ] **Step 1: 寫失敗的測試**
  - `talents.test.ts`：`memory keystones never sit on a board`：`BOARDS` 裡沒有任何 `MEMORY_KEYSTONES` 的值。
  - `progression.test.ts`：
    - `a companion awakens her memory keystone with every piece`：瑟蕾 4 片沒有、5 片有。
    - `memory keystones never count against the cap`：夥伴持有 2 個天賦盤關鍵天賦加上記憶關鍵天賦，`keystonesOf` 長度 3；第 3 個天賦盤關鍵天賦仍回傳 `keystone-cap`；`talentPointsLeft` 不變。
    - `Rin's keystone waits for her oath, not her seventh piece`
    - `the hero has no memory keystone`：主角 10 片時 `keystonesOf` 不含任何 `MEMORY_KEYSTONES` 的值。
  - `battle.test.ts`／`skills.test.ts`：每一個效果各一項，用同一個 rng 比較有無關鍵天賦（倍率透過 `MEMORY_KEYSTONE_VALUES` 算出）：
    - `moon-promise heals more`、`small-shrine guards the party at the start`、`troupe-step buffs last longer`、`carried-out hits a full-HP target harder`、`teachers-gift costs less TP`、`blueprint turrets hit harder`、`fathers-face finds more materials`、`not-a-shield takes less while taunting`
    - `the unrung bell answers the hero's fall`：主角被擊倒的那一次行動之後，log 立刻有凜的攻擊，凜身上有 atk 的增益；主角沒倒下時沒有。
  - `status.test.ts`：`the talent tab shows the memory keystone, locked or awake`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套**（平衡帶的夥伴都沒有記憶，預期不變；變了就停下來回報）
- [ ] **Step 5: commit**：`feat(starlantern): memory keystones and Rin's oath`

### Task 13: 「燈鑰・天燈」與「破鐘・黎明之刃」，凜選擇後的外觀

**Files:**
- Modify：
  - `engine/types.ts`：`UltimateDef.follow?: { who: 'allies' | 'hero'; effects: Effect[] }`、`UltimateDef.refundOnKill?: number`。
  - `data/ultimates.ts`：`SKY_LANTERN`、`skyForm`、`RIN_DAWN`。
  - `data/characters.ts`：`OATH_TITLE = '破鐘刺客'`、`titleOf`。
  - `engine/progression.ts`：`ultimateFor` 新增第三個參數。
  - `engine/combatant.ts`：`Combatant.memories?: number`、`Combatant.oath?: true`、`Combatant.artId?: string`；`engine/battle.ts` 的 `fromMember` 填入；`perform` 的 ultimate 處理 `refundOnKill` 與 `follow`。
  - 改用 `ultimateFor(id, ranks, 成員)` 的地方：`engine/battle.ts`（`perform`）、`ui2/scenes/battle.ts` 兩處、`ui2/scenes/statusTabs.ts`（絕技分頁）。
  - 改用 `artIdOf`／`titleOf` 的地方：`ui2/partyBar.ts`、`ui2/scenes/battle.ts`（切入與頭像）、`ui2/scenes/status.ts`、`ui2/scenes/guild.ts`、`ui2/scenes/formation.ts`、`ui2/scenes/equip.ts`（用 `grep -n "art.portrait(\|art.standee(\|standeeImg(\|portraitImg(\|\.title"` 找）。
- Test：`engine/progression.test.ts`、`data/hero.test.ts`、`engine/battle.test.ts`、`ui2/scenes/status.test.ts`、`ui2/partyBar.test.ts`

**Interfaces:**
- `SKY_LANTERN = { heal: 25, memories: 10 }`（spec §4.6：保留原效果並追加全隊少量回復；implementer's call → fixed here）。
- `skyForm(u: UltimateDef): UltimateDef = { ...u, id: \`${u.id}-sky\`, name: '燈鑰・天燈', desc: \`${u.desc}，並為全隊點亮少量回復\`, follow: { who: 'allies', effects: [{ kind: 'heal', power: SKY_LANTERN.heal }] } }`
- `RIN_DAWN: UltimateDef`（spec §5.3）：`{ id: 'ult-rin-dawn', owner: 'rin', name: '破鐘・黎明之刃', target: 'enemy', desc: '必定暴擊的一刺；擊倒目標時返還一半量表，這場戰鬥中洛恩受到的傷害降低', effects: [{ kind: 'damage', power: 320, element: 'phys', scale: 'atk', melee: true, crit: 'always' }], refundOnKill: 50, follow: { who: 'hero', effects: [{ kind: 'buff', stat: 'def', pct: 30, turns: 99 }] } }`
- `ultimateFor(id: CharacterId, ranks?: Record<string, number>, m?: { memories?: number; oath?: true }): UltimateDef`（戰鬥傳 combatant，畫面傳成員）：
  - 主角：`HERO_ULTIMATES[heroMainBranch]`，`memoriesOf({ id, memories: m?.memories }) ≥ SKY_LANTERN.memories` 時套 `skyForm`；
  - 凜：`m?.oath` 時 `RIN_DAWN`，否則 `ULTIMATES.rin`；其他照舊。
- `perform` 的 ultimate：對目標套用效果；`refundOnKill` 有值而且單一目標被擊倒時，`actor.limit = LIMIT_MAX × refundOnKill / 100`；之後有 `follow` 時，對 `allies`（活著的隊友）或 `hero`（活著的主角）套用。
- `titleOf(m: Pick<Member, 'id' | 'oath'>): string`：凜有 `oath` 時是 `OATH_TITLE`，否則 `CHARACTERS[id].title`。

- [ ] **Step 1: 寫失敗的測試**
  - `progression.test.ts`：
    - `the Lantern Key lights up with every memory`：9 片時是原形態；10 片時 id 是 `${原形態 id}-sky`、名字是「燈鑰・天燈」、effects 與原形態相同、follow 的回復是 `SKY_LANTERN.heal`；五種形態都測。
    - `Rin's dawn blade waits for her oath`
  - `hero.test.ts`：`every sky form stays below its companion's ultimate`：照 6a Task 9 的比較，祈光的天燈把原回復加上 follow 的回復一起算，仍低於瑟蕾。
  - `battle.test.ts`：
    - `the dawn blade always crits and gives back half the gauge on a kill`
    - `the dawn blade guards the hero for the fight`：之後主角有 def 的增益、turns ≥ 99；主角倒下時沒有 follow。
    - `the sky lantern heals the party after its blow`
  - `status.test.ts`：`after her oath Rin wears the rin-oath standee and the title 破鐘刺客`
  - `partyBar.test.ts`：`after her oath Rin's face is rin-oath`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套**；帶著 `memories: 10` 的帶照 Task 7 的做法處理（新紅的改 `it.fails`，註解 `// 6b Task 20b`，記進 baseline），其他帶紅了停下來回報。
- [ ] **Step 5: commit**：`feat(starlantern): the Sky Lantern and the dawn blade`

### Task 14: 絲嘉蕾的劇情戰（撐過 3 回合）

**Files:**
- Modify：
  - `engine/types.ts`：`EnemyDef.story?: true`、`EnemyDef.look?: CharacterId`、`EnemyDef.undying?: true`。
  - `data/enemies.ts`：`scarlet-foe`。
  - `engine/scaling.ts`：`NORMAL_ENEMIES` 排除 `story`。
  - `engine/combatant.ts`：`Combatant.undying?: true`；`dealDamage` 不讓 undying 低於 1 HP。
  - `engine/battle.ts`：`createBattle` 的選項 `survive?: number`；`BattleState.survive`；`resolveRound` 撐過後勝利；`rewards` 在 survive 戰只算倒下的敵人。
  - `engine/game.ts`：救援戰的對象是 scarlet 時改開劇情戰。
  - `render/artPaths.ts`：`enemyArt(id)`；`allArtUrls` 不列有 `look` 的敵人。`render/BattleView.ts` 改用 `enemyArt`。
  - `ui2/scenes/battle.ts`：survive 戰的提示行。
  - `data/text.zh-TW.ts`：`T.ui2.battle.survive = (left: number) => \`撐過去！還有 ${left} 回合\``、`T.ui2.battle.survived = '她收起了劍。'`。
- Test：`engine/battle.test.ts`、`engine/game.test.ts`、`render/artPaths.test.ts`、`engine/scaling.test.ts`、`ui2/scenes/battle.test.ts`

**Interfaces:**
- `STORY_FIGHT_ROUNDS = 3`（`engine/battle.ts`）
- `scarlet-foe`（spec §6；數值 implementer's call → fixed here）：`{ id: 'scarlet-foe', name: '絲嘉蕾', floor: 3, story: true, look: 'scarlet', undying: true, stats: s(300, 40, 26, 10, 18, 9), weak: ['ice'], resist: ['fire'], exp: 0, gold: 0, drops: [], skills: [{ name: '紅蓮斬', chance: 0.4, target: 'enemy', effects: [{ kind: 'damage', power: 130, element: 'fire', scale: 'atk', melee: true }] }] }`
- `enemyArt(id: string): string`：`look` 有值時是 `art.standee(look)`，否則 `art.enemy(id)`。
- `Game.move` 踩到求救房、`who === 'scarlet'`：`startBattle(['scarlet-foe', ...group], false, true, undefined, 1, { survive: STORY_FIGHT_ROUNDS })`；其他人照舊。
- `createBattle({ ..., survive })`：寫進 `BattleState.survive`；survive 戰裡我方每一位與 `undying` 的敵人都是 undying（spec「她不會死、也不會讓隊伍全滅」；見衝突第 11 點）。
- `resolveRound`：回合結束後 `s.survive && s.round ≥ s.survive && s.outcome === 'ongoing'` 時 `outcome = 'win'`，log 加 `{ type: 'survived' }`。可以逃跑；逃跑時她沒有遇見，求救房還在（照 6a）。

- [ ] **Step 1: 寫失敗的測試**
  - `battle.test.ts`：
    - `a survive fight ends in a win after its rounds`：第 `STORY_FIGHT_ROUNDS` 回合結束時 outcome 是 win，之前是 ongoing。
    - `nobody falls in a survive fight`：給敵人極高的攻擊，我方每一位 hp ≥ 1，scarlet-foe 也 ≥ 1。
    - `a survive win pays only for the enemies knocked out`
  - `game.test.ts`：
    - `Scarlet's rescue is her story fight`：第 8 層 iron 的求救房，戰鬥有 `scarlet-foe` 與 `survive`；撐過之後她加入（`BattleEnd.met`）。
    - `fleeing Scarlet's fight leaves her waiting`
  - `artPaths.test.ts`：`an enemy with a look uses that standee and is not listed as art of its own`
  - `scaling.test.ts`：`story enemies are not ordinary monsters`
  - `ui2/scenes/battle.test.ts`：`a survive fight shows how many rounds are left`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): Scarlet's story fight`

### Task 15: 劇情觸發與回城佇列（引擎）

**Files:**
- Create：`engine/story/events.ts`、`engine/story/events.test.ts`
- Modify：`engine/game.ts`；`ui2/scenes/guild.ts`（交還場景播完後呼叫 `sceneDone`）
- Test：`engine/story/events.test.ts`、`engine/game.test.ts`、`ui2/scenes/guild.test.ts`

**Interfaces:**
- `storyStage(s: GameState): Stage`：`finaleCleared` → after；否則 nodes 含 act4 → act4、act3 → act3、act2 → act2；否則 `act1Cleared` 或 `reached.mainline ≥ 2` → act1；否則 prologue。
- `onReturn(s: GameState): StoryState`（回城、全滅、通關後回城都呼叫）：
  - 每個 `ActNode` 在 `reached.mainline ≥ ACT_DEPTHS[node]` 而且還沒在 `nodes` 時，加進 `nodes` 與 `queue`；
  - 凜 `memoriesOf ≥ chainLength('rin')`、沒有 `oath`、`'rin-reveal'` 不在 seen 也不在 queue 時，加進 queue；
  - 不看任何夥伴碎片的數量（spec §2）。
- `QUEUE_ORDER`：`queue` 一律排成 `act1-after`、`act2`、`act3`、`act4`、`mem:hero:n`（n 由小到大）、其他（依加入順序）。`rin-reveal` 不參與排序。
- `nextChat(s: GameState): SceneId | null`：候選是 `chat:${id}:${n}`，條件是 id 已遇見、沒看過、而且 n 是 1 或 `chat:${id}:${n − 1}` 已看過；挑「已看過的對話最少」的那位，平手依 `CHARACTER_IDS`。
- `arrivalScenes(s: GameState): SceneId[]`：queue 含 `rin-reveal` 時只有 `['rin-reveal']`（spec §5.2：同一次回城的其他場景延到下一次）；否則是排好的 queue，最後加上 `nextChat`（若有；每次最多 1 段）。
- `sceneDone(s: GameState, id: SceneId, how: 'played' | 'skipped' | 'auto'): GameState`：從 queue 移除；加進 seen（已在就不重複）；`auto` 時也加進 fresh；`rin-reveal` 時凜得到 `oath`（spec §5.3 的回報從她的選擇之後開始；見衝突第 21 點）。
- `markRead(s: GameState, id: SceneId): GameState`：從 fresh 移除。
- `Game`：
  - `arrival: SceneId[]`（不存檔）：`toTown`、`wipe`、`restartAfterClear` 先 `story = onReturn(state)` 再設 `arrival = arrivalScenes(state)`；`boot`、`fresh` 也設。
  - `sceneDone(id, how)`：id 必須在 `arrival` 裡、或是 Task 17 的迷宮回憶與終幕場景、或是 Task 11 的交還場景；否則回傳 false。town 時立刻存檔；從 `arrival` 移除。
  - `markRead(id)`：town 與 map 都可以；town 時立刻存檔。
  - `depart` 不看 `arrival`：佇列永遠不擋出發。

- [ ] **Step 1: 寫失敗的測試**
  - `events.test.ts`：
    - `act nodes fire by depth alone`：所有人 0 片記憶，`reached.mainline = 4` 時 queue 有 act2；`10` 時再加 act3；同一個節點不會加第二次。
    - `the queue plays in story order`：加入順序是 `[mem:hero:7, act3, act1-after]`，`arrivalScenes` 是 `[act1-after, act3, mem:hero:7]`。
    - `Rin's reveal plays alone on the first return after her seventh piece`：queue `[act2, rin-reveal]` 時是 `['rin-reveal']`；`sceneDone` 之後再回城，是 `[act2, ...]`。
    - `the reveal gives Rin her oath, played, skipped or auto`
    - `skipping counts as seen; auto also marks it new`
    - `one chat per return, from whoever has said least, met only`
    - `the stage follows the acts`
    - `the story is a pure function of the state`：同一個狀態呼叫兩次，結果相同，輸入不變。
  - `game.test.ts`：
    - `the new game's first arrival is the prologue`
    - `a wipe enqueues like a safe return`
    - `the reveal survives a reload and a wipe`：凜 7 片、全滅回城，`arrival` 是 `['rin-reveal']`；不呼叫 `sceneDone`，存檔後 `boot`，`arrival` 仍是 `['rin-reveal']`；`sceneDone('rin-reveal', 'skipped')` 之後存檔讀回不再出現。
    - `departure is never blocked by the queue`：`arrival` 還有場景時 `depart` 成功。
    - `sceneDone refuses scenes that are not due`
  - `guild.test.ts`：`a played return is recorded as seen`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): story triggers and the arrival queue`

### Task 16: 城鎮：回城場景、序章、依階段的台詞

**Files:**
- Modify：
  - `ui2/scenes/town.ts`：進場時先播 `game.arrival`，播完才顯示通知或日常台詞；日常台詞改讀 `STORY.townLines[stage]`，凜已遇見而且 `rinLines[stage]` 有值時，也從那裡挑（說話者是凜）。
  - `ui2/scenes/facility.ts`：招呼改讀 `STORY.greet[設施][stage]`。
  - `data/text.zh-TW.ts`：刪掉被取代的 `T.ui2.town.lines` 與各設施的 `greet`（內容已在 Task 1 搬進 `STORY`）。
- Test：`ui2/scenes/town.test.ts`、`ui2/scenes/facility.test.ts`；會壞的測試：
  - 用 `Game.fresh`／`Game.boot` 建立遊戲、然後斷言城鎮第一句話的單元測試，現在會先遇到序章：在建立後設 `game.arrival = []`，或傳入 `settings` 的 `story: 'none'`。
  - `tests/e2e/starlantern.spec.ts`：在開新遊戲的共用步驟之前，用 `page.addInitScript` 把 `starlantern-settings` 寫成含 `story: 'none'` 的設定（其他欄位用預設值），讓現有的流程不被序章擋住。本任務新增的 e2e 不設。

**Interfaces:**
- `TownScene.enter`：
  - 選單與返回鍵先 `inert`；
  - 依序處理 `game.arrival` 的每一個 id：`shouldPlay(id, mode)` 時 `playScene`，結果是 done → `sceneDone(id, 'played')`，skipped → `sceneDone(id, 'skipped')`；不播時 `sceneDone(id, 'auto')`，畫面上不出任何台詞；
  - 全部處理完才照原本的邏輯顯示 `banked`、`notice` 或日常台詞，並解除 `inert`。
  - 播放中的 `onAction` 交給目前場景的 handler。
- 序章：`Game.fresh` 之後的第一次進城就是 `arrival = ['prologue']`，播完直接是城鎮（spec §9.2）。
- 第一幕：打倒燈喰之獸 → 通關畫面（Task 2）→「繼續」→ 回城時 `act1-after`（「三天後」）在佇列裡（spec §8.5）。

- [ ] **Step 1: 寫失敗的測試**
  - `town.test.ts`：
    - `arrival scenes play before the menu`：選單 `inert`，序章的第一句在畫面上；確認到底之後選單可用、`story.seen` 含 prologue。
    - `cancel skips a scene and the next one plays`
    - `story set to none plays nothing and marks every scene new`：畫面上沒有任何場景台詞，選單立刻可用，`fresh` 含全部。
    - `major only plays the reveal but not a chat`
    - `town lines follow the stage`：act2 時的那句來自 `STORY.townLines.act2` 或 `rinLines.act2`。
    - `Rin's foreshadowing joins the town lines from act 2`：用固定的 rng，讓挑到的是凜的伏筆，說話者是凜。
  - `facility.test.ts`：`greetings follow the stage`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作，並依 Files 修正會壞的測試**
- [ ] **Step 4: 執行全套與 e2e，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): the town plays the story on arrival`

### Task 17: 迷宮裡的回憶、相遇對話與終幕

**Files:**
- Modify：
  - `engine/game.ts`：終幕頭目；`finale` 欄位。
  - `engine/battle.ts`：`createBattle` 的選項 `names?: Record<string, string>`、`bossPower?: number`。
  - `data/enemies.ts` 或 `data/story/scenes.ts`：`FINALE_BOSS = { base: 'lanterneater', name: '燈喰之母', power: 1 }`（`power` 是 Task 20c 的旋鈕）。
  - `ui2/scenes/dungeon.ts`：微光的 `play` 片用 `playScene`；相遇台詞改用帶立繪的說話者（她本人）。
  - `ui2/scenes/battle.ts`：戰果視窗關閉後，播 `fragments` 裡 `play` 為真的那一片。
  - `ui2/scenes/clear.ts`：`cleared === 'finale'` 時先播補齊的回憶與 `finale`，再顯示終幕卡片。
  - `data/text.zh-TW.ts`：`T.ending = { title: '終幕　點燈', back: '繼續' }`；卡片的內文讀 `STORY.scenes.finale.summary`（劇情文字，6c 改寫）。
- Test：`engine/game.test.ts`、`engine/battle.test.ts`、`ui2/scenes/dungeon.test.ts`、`ui2/scenes/battle.test.ts`、`ui2/scenes/clear.test.ts`

**Interfaces:**
- 迷宮裡播回憶：`gained`／`fragments` 裡 `play` 為真的片，`shouldPlay(id, mode)` 時 `playScene`，結果記 `sceneDone(id, 'played' | 'skipped')`；不播時 `sceneDone(id, 'auto')`。`play` 為假的片在 Task 5 已經記成看過與「新」。
- 終幕（spec §8.4）：
  - 本道第 `FINALE_DEPTH` 層的頭目、`finaleCleared` 為假時：`startBattle([FINALE_BOSS.base], true, true)` 並傳 `names: { [FINALE_BOSS.base]: FINALE_BOSS.name }`、`bossPower: FINALE_BOSS.power`；`bossPower` 在補正之後乘上 hp、atk、mag。終幕之後照一般頭目。
  - 打倒之後：照常給碎片（第 30 層的補齊），但補齊的片 `play` 一律 false、也不記看過；`story.finaleCleared = true`；`phase = 'clear'`、`cleared = 'finale'`；`Game.finale = { pieces: SceneId[] }` 是這次補齊的回憶，依片號排好。
  - `ClearScene`（finale）：依序處理 `finale.pieces` 與 `'finale'`，每一個都照 `shouldPlay` 播放或 `auto`，並呼叫 `sceneDone`；之後顯示 `T.ending` 的卡片；「繼續」→ `restartAfterClear` → 城鎮。
- 不需要碎片數量也不需要遇見全部夥伴：沒遇見的人、還沒遇見的波比，由 `ScriptLine.if` 決定念哪一句（6c 寫）。

- [ ] **Step 1: 寫失敗的測試**
  - `game.test.ts`：
    - `the depth-30 boss is the lantern's mother until the finale`：戰鬥中的敵人名字是 `FINALE_BOSS.name`。
    - `beating her clears the finale and brings the hero to ten`：主角 2 片時打倒，`memories` 是 10，`finale.pieces` 是 `mem:hero:3` 到 `mem:hero:10`，`phase` 是 clear、`cleared` 是 finale。
    - `the finale needs no memories and no full party`：只有主角與凜、所有人 0 片也能觸發。
    - `after the finale the depth-30 boss is an ordinary boss`
  - `battle.test.ts`：`names and boss power change only that fight`
  - `dungeon.test.ts`：`the first memory of a floor plays as a memory scene`（`slx-talk--memory` 出現）；`story none records it without a line`
  - `battle.test.ts`（ui2）：`a played memory follows the result window`
  - `clear.test.ts`：`the finale plays the hero's last memories, then the finale, then the ending card`；`skipping each one still reaches the card`；`with story none the finale shows only the card and records every scene new`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): memories in the labyrinth and the finale`

### Task 18: 冒險者手冊（內容）

**Files:**
- Create：`engine/story/handbook.ts`、`engine/story/handbook.test.ts`

**Interfaces:**
```ts
export interface PiecePage { n: number; scene: SceneId; found: boolean; fresh: boolean; hint: string }
export interface MemoryPage { id: CharacterId; met: boolean; pieces: PiecePage[] }
export interface PersonPage { id: CharacterId; met: boolean; title: string; segments: string[] }
export interface TownPage { id: TownFragmentId; status: 'unknown' | 'held' | 'returned'; lines: string[] }
export interface CodexPage { specials: string[]; sets: string[]; monsters: { id: string; name: string; weak: Element[] | null }[] }
export interface TruthPage { stage: Stage; unlocked: boolean; text: string | null }
export interface Handbook { memories: MemoryPage[]; people: PersonPage[]; town: TownPage[]; codex: CodexPage; truths: TruthPage[] }
export function handbook(s: GameState): Handbook
```
- memories：依 `CHARACTER_IDS`；`found` 是 `n ≤ memoriesOf`；`hint` 是 `` `${地區名稱用「、」相連}・${minDepth ≥ 6 ? '深處' : '淺層'}` ``（spec §7.6 的例子「熾焰之地・深處」）；沒遇見的人 `met` 為假（畫面只顯示剪影）。
- people：`segments` 是 `STORY.people[id]` 的前 k 段，k 依片數：遇見時 1 段，`ceil(片數 / 2)` 片時 2 段，全部找回時 3 段；`title` 是 `titleOf`。
- town：`held` 是 inventory 有它；`returned` 是 `story.returned` 有它；`lines` 在 held 時是 `[lost]`，returned 時是 `[lost, after]`，unknown 時是空的。
- codex：`specials`、`sets` 照 `codex`；`monsters` 是不含 `story` 的 `ENEMIES`，`weak` 在 `revealed` 有記錄時是那些元素，否則 null。
- truths：prologue 一律解鎖；act1 看 `act1Cleared`；act2–act4 看 `nodes`；after 看 `finaleCleared`。

- [ ] **Step 1: 寫失敗的測試**
  - `the memory pages show what was found and hint at the rest`
  - `a companion not yet met is a silhouette`
  - `people pages unlock with the pieces`
  - `townsfolk pages follow the fragment`
  - `the codex lists every ordinary monster and its known weaknesses`
  - `truths unlock with the acts and the finale`
  - `fresh scenes carry the new mark`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行 `engine/story` 的測試，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): the adventurer's handbook, its pages`

### Task 19: 冒險者手冊（介面）

**Files:**
- Create：`ui2/scenes/handbook.ts`、`ui2/scenes/handbook.test.ts`
- Modify：
  - `ui2/scene.ts`：`SceneName` 加入 `'handbook'`；`ui2/main.ts` 的場景表。
  - `ui2/scenes/town.ts`：`FACILITIES` 在 `settings` 之前加入 `'handbook'`（spec §7.6）。
  - `ui2/scenes/guild.ts`：指令清單加入「冒險者手冊」（spec §3.5、§11.3）。
  - `ui2/scenes/dungeon.ts`：迷宮選單在 `settings` 之前加入「冒險者手冊」，`go('handbook', 'dungeon')`。
  - `data/text.zh-TW.ts`：`T.ui2.handbook = { title: '冒險者手冊', tabs: { memories: '記憶', people: '人物', town: '鎮民', codex: '圖鑑', truths: '真相' }, unknown: '？？？', fresh: '新', status: { unknown: '尚未找到', held: '持有中', returned: '已交還' } }`；`T.ui2.town.facilities.handbook`、`T.ui2.dungeon.handbook`。
  - `src/styles/_starlantern-ui.scss`：`.slx-silhouette { filter: brightness(0); }` 與手冊版面。
- Test：`ui2/scenes/handbook.test.ts`、`ui2/scenes/town.test.ts`、`ui2/scenes/guild.test.ts`、`ui2/scenes/dungeon.test.ts`

**Interfaces:**
- 版面沿用狀態頁的分頁做法（`prev`／`next` 換分頁，清單用 `MenuView`），不另做框架。
- 記憶分頁：選角色 → 片的清單（找到的顯示 `STORY.scenes[...].title` 與「新」；沒找到的顯示 `unknown` 與 hint）→ 選一片 → `playScene` 重看，結束後 `game.markRead(id)`。重看不呼叫 `sceneDone`，不改任何進度。
- 人物分頁：遇見的顯示站姿圖（`artIdOf`）、title 與 segments；沒遇見的顯示 `standeeImg` 加上 `slx-silhouette` 與 `unknown`，沒有站姿圖時只顯示 `unknown`。
- 從迷宮打開（`arg === 'dungeon'`）時唯讀：只能看與重看；返回回到迷宮。

- [ ] **Step 1: 寫失敗的測試**
  - `handbook.test.ts`：
    - `the five tabs are there in order`
    - `replaying a memory changes no progress but clears the new mark`
    - `a companion not yet met shows a silhouette and ？？？`
    - `opened from the labyrinth it goes back to the labyrinth`
  - `town.test.ts`：`the town menu opens the handbook`
  - `guild.test.ts`：`the guild opens the handbook`
  - `dungeon.test.ts`：`the labyrinth menu opens the handbook`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套與 e2e，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): the adventurer's handbook`

### Task 20a: 平衡帶：記憶期望、深層帶、法系主角帶武器（量測，不調整）

**Files:**
- Create：`engine/story/expect.ts`、`engine/story/expect.test.ts`、`engine/balance.deep.test.ts`
- Modify：
  - `engine/sim.ts`：`Lineup.expect?: boolean`、`Lineup.armHero?: boolean`；`partyAt(level, lineup = {}, depth = 1)`；`kitParty` 與 `winRate` 把 depth 傳給 `partyAt`；`simBattle` 新增最後一個參數 `bossPower?: number`。
  - `engine/scaling.ts`：`ENEMY_POWER` 新增 `from3: 42, amount3: 0, ramp3: 0`；`enemyPower` 在 `level > from3` 時再加 `amount3 + ramp3 × (level − from3)`。初值讓曲線完全不變。
  - `engine/balance.test.ts`、`engine/balance.lineups.test.ts`：見下方。
  - `.superpowers/sdd/2026-10-18-starlantern-plan6b-story/balance-baseline.md`
- Test：`engine/story/expect.test.ts`、`engine/sim.test.ts`、`engine/scaling.test.ts`

**Interfaces:**
- `EXPECT_ELITE_EVERY = 3`、`EXPECT_SEED = 0x6b`（`engine/story/expect.ts`）
- `expectedMemories(depth: number, ids: CharacterId[]): Record<CharacterId, { memories: number; absorbed: AbsorbGain[]; oath: boolean }>`（spec §9.4 第 7 點的「記憶期望」；模型是 implementer's call → fixed here）：
  - 一支只有 `ids` 的隊伍（都算遇見），pity 從 `{}` 開始；
  - 地區依序是 mainline，再加上 `ids` 的碎片串提到的其他地區（依 `REGIONS` 的順序、不重複）；每個地區從第 1 層走到 `depth`：
    - 每一層先處理 `forcedGlimmers` 與「`d % round(1 / GLIMMER_CHANCE) === 0` 時一處自然微光」；
    - `d % EXPECT_ELITE_EVERY === 0` 時一隻精英怪；`isBossDepth(region, d)` 時頭目；
    - 都用真的 `pieceDrops`、`lootFragments`（只取無主碎片；傳一個合成的 `GameState` 與 `newRun(EXPECT_SEED, 地區, 'plain', 1)`）與 `pityAfterFloor`，rng 是 `mulberry32(mix(mix(EXPECT_SEED, 地區的索引), d))`；
  - 得到的無主碎片依 `ids` 的順序輪流吸收（真的 `absorb` 規則與上限），沒有吸收台詞；
  - 凜 7 片時 `oath` 為真（她的揭露在下一次回城播放）。
- `partyAt`：
  - `lineup.expect` 時，每一位成員套用 `expectedMemories(depth, ids)` 的結果；`lineup.memories` 有值時仍覆寫主角的片數（第 11、14、18e 項的「10 片記憶」）。
  - `lineup.armHero` 時，主角的流派武器是 `mag` 系（`WEAPON_KINDS[weaponKindOf].scale === 'mag'`）就裝上那把底材：`{ uid: 0, base, rarity: 'common', ilvl: EQUIPMENT[base].ilvl, affixes: [], enhance: 0 }`；其他流派不裝（接手清單 M9）。
- `balance.test.ts`：
  - 第 7 項（勝負）多跑一次 `{ expect: true }`，標籤 `7 (記憶期望)`。
  - `10 (memories)` 改成 `10 (記憶期望)`，lineup 是 `{ expect: true }`（spec §9.4 第 7 點；見衝突第 4 點）。門檻不變。
  - `the memories variants measure something` 改成：記憶期望在 depth 10 時主角至少 `ABYSS_UNLOCK[0]` 片、而且與沒有記憶的版本結果不同；`DEEP` 的那一半照舊。
  - 第 11、14 項的 DEEP 版本、`18e` 照舊。
- `balance.deep.test.ts`（新的第 19 項；門檻是本計畫訂的）：
  - `19a the deep road`：depth 15、20、25，mainline，等級 `min(MAX_LEVEL, depthLevel(d))`，`kitParty(level, d, kitSeed 1–5, undefined, expectedEnhance(d), { expect: true })`，該層的 `encounterTable`，每組 8 個種子：勝率 ≥ 0.85，HP 損失 0.10–0.45。
  - `19b the finale is a real fight`：depth 30，同樣的隊伍（kitSeed = 戰鬥種子），`lanterneater` 加 `bossPower: FINALE_BOSS.power`，種子 1–40：勝率 0.30–0.85，每場回合數 ≥ 3。
  - 整個檔案的 timeout 是 300_000，`BALANCE_REPORT` 的寫法照另外兩個檔。
- `balance.lineups.test.ts`：矩陣的 lineup 加上 `armHero: true`。

- [ ] **Step 1: 寫測試**
  - `expect.test.ts`：
    - `the expectation grows with depth and stays within every chain`
    - `the expectation follows the real drop rules`：depth 10 的主角片數，等於用 `pieceDrops` 手算本道 1–10 層頭目與精英的結果（測試裡重算一次）。
    - `the elite rate behind EXPECT_ELITE_EVERY is honest`：200 個種子、本道第 1–12 層，`floorOf` 的平均精英數介於 `1 / (EXPECT_ELITE_EVERY + 1)` 與 `1 / (EXPECT_ELITE_EVERY − 1)`。
    - `the same depth always expects the same`
  - `sim.test.ts`：`partyAt applies the expectation for its depth`；`armHero arms only a caster`
  - `scaling.test.ts`：`the third step leaves every level up to from3 as it was`（記下改動前 L = 1…42 的 `enemyPower`，改動後相同）；`enemyPower never falls`（L = 1…250 非遞減）。
- [ ] **Step 2: 執行**：`BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.test.ts src/scripts/games/starlantern/engine/balance.lineups.test.ts src/scripts/games/starlantern/engine/balance.deep.test.ts --testTimeout=300000`，每一項的數字寫進 `balance-baseline.md`。
- [ ] **Step 3: 本任務不調任何旋鈕。** 紅的項目改用 `it.fails`，註解負責的任務：記憶期望與 DEEP 的帶 `// 6b Task 20b`，第 19 項 `// 6b Task 20c`，第 18 項 `// 6b Task 20d`。
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`balance(starlantern): memory expectation, the deep road and armed casters, measured`，訊息附上基準數字與 `it.fails` 的清單。

### Task 20b: 調整記憶的帶（限時）

**Files:**
- Modify：`engine/balance.test.ts`、`engine/balance.lineups.test.ts`（`// 6b Task 20b` 的 `it.fails` 改回 `it`）；旋鈕所在的檔案：`data/story/chains.ts`、`data/story/fragments.ts`、`data/talents.ts`、`data/ultimates.ts`
- Test：`data/hero.test.ts`（6a 的峰值與 Task 13 的天燈）必須維持綠。

**旋鈕與順序**（紅了才調；每一步都重跑三個 balance 檔）
1. `CHAINS` 的每片提升（主角每項 1、夥伴 2；可以降到主角 0.5、夥伴 1，或改成只提升一部分主屬性）。
2. `ABSORB_GAIN`、`ABSORB_CAP`。
3. `MEMORY_KEYSTONE_VALUES`。
4. `SKY_LANTERN.heal`、`RIN_DAWN` 的 power、`refundOnKill`、follow 的 pct。
- 不是旋鈕：`ENEMY_POWER` 的任何欄位、人數補正表、6a 的主角與凜的數值、`expectedMemories` 的模型與常數（它要描述真的掉落，不能為了過帶而改）。
- 第 10 項的 HP 損失下限（0.10）與第 18b 項是已知的緊繃組合（接手清單 M3/M4）：記憶的帶只能用上面的旋鈕解，不可以動 `ENEMY_POWER.ramp`。

**時間上限**：最多 6 輪「調整 → 三個檔全跑」。收斂不了就停下來回報 sweep 的數字，不 commit。

- [ ] **Step 1: 依順序 sweep**，每一組值的結果記進 `balance-baseline.md`。
- [ ] **Step 2: `// 6b Task 20b` 的 `it.fails` 全部改回 `it`，執行全套，確認全部通過**
- [ ] **Step 3: commit**：`balance(starlantern): tune what memories are worth`，訊息寫出旋鈕最後的值與各帶的實測數字。

### Task 20c: 調整深層帶（限時）

**Files:**
- Modify：`engine/balance.deep.test.ts`（`// 6b Task 20c` 的 `it.fails` 改回 `it`）；旋鈕所在的檔案：`engine/scaling.ts`（`ENEMY_POWER.from3`、`amount3`、`ramp3`）、`FINALE_BOSS.power` 所在的檔案
- Test：`engine/scaling.test.ts` 的兩項（from3 以下不變、非遞減）必須維持綠；其他 balance 檔必須維持綠。

**旋鈕與順序**
1. `ramp3`，再 `amount3`（只影響 Lv42 以上的敵人，也就是 depth 11 以後；現有每一項帶的敵人都在 Lv38 以下）。`from3` 只可以往上調，不可以低於 42。
2. `FINALE_BOSS.power`（只影響第 19b 項）。
- `enemyPower` 必須非遞減；`amount3` 可以是負數，只要曲線仍然非遞減。

**時間上限**：最多 6 輪。收斂不了就停下來回報：這代表 Lv50 的隊伍在預期裝備與記憶下走不到第 30 層，是使用者要決定的遊戲方向（見文末「需要使用者決定的事」第 1 點），不可以自行放寬或刪掉這一帶。

- [ ] **Step 1: 依順序 sweep**，結果記進 `balance-baseline.md`。
- [ ] **Step 2: 改回 `it`，執行全套，確認全部通過**
- [ ] **Step 3: commit**：`balance(starlantern): the deep road to the finale`，訊息寫出最後的值與實測數字。

### Task 20d: 第 18 項的法系主角帶武器（限時，或裁定不做）

**Files:**
- Modify：`engine/balance.lineups.test.ts`（`// 6b Task 20d` 的 `it.fails` 改回 `it`）；旋鈕所在的檔案：`data/hero.ts`（`HERO_BUILDS.mage`、`HERO_BUILDS.healer` 的 `branches`、`talents`、`nodes`）
- Test：`engine/progression.test.ts` 的流派測試必須維持綠。

**旋鈕**：只有 mage 與 healer 的流派定義。其他一律不動。

**時間上限**：最多 3 輪。
- 收斂：保留 `armHero: true`，commit：`balance(starlantern): band 18 arms its casters`。
- 收斂不了：把矩陣的 `armHero` 拿掉、刪掉本任務的 `it.fails` 標記讓第 18 項回到 Task 20a 之前的樣子，在 `balance-baseline.md` 記下矩陣與理由，commit：`balance(starlantern): band 18 keeps unarmed casters (M9 ruled out)`，並回報給使用者。

- [ ] **Step 1: 依旋鈕 sweep**，結果記進 `balance-baseline.md`。
- [ ] **Step 2: 照上面兩種結果之一收尾，執行全套，確認全部通過**
- [ ] **Step 3: commit**（訊息照上面）

### Task 21: 端對端、全套測試、截圖與審查

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`

- [ ] **Step 1：e2e `prologue, Rin's first memory, Selene, recall, handbook`**（spec §16 的流程；本測試不預設 `story: 'none'`）
  - 新遊戲 → 序章出現，確認鍵逐句播完 → 城鎮選單。
  - 再開一次新遊戲 → 序章第一句時按 Esc → 出現略過摘要 → 城鎮選單。
  - 出發本道第 1 層，用 debug hook 讀出 owner 是凜的微光位置，站到旁邊再走上去 → 回憶場景（`slx-talk--memory`）→ 地圖。
  - 用 debug hook 讓兩人 Lv4、到第 2 層救下瑟蕾（照 6a 的做法）。
  - 回城 → 編隊把瑟蕾移到預備 → 公會「召回」→ 她回到陣型。
  - 城鎮選單「冒險者手冊」→「記憶」→ 凜 → 第 1 片 → 重看 → 返回；手冊不再標「新」。
  - 全程沒有 console error；旅館存檔、重新整理、選「繼續」，存檔有效，凜的 `memories` 是 1。
- [ ] **Step 2：全套測試與截圖**
  - `rtk proxy npx vitest run --testTimeout=20000` 與 e2e 全套。
  - `grep -rn "it.fails" src/scripts/games/starlantern` 沒有結果。
  - `BALANCE_REPORT=1` 跑三個 balance 檔，數字記進 `balance-baseline.md`。
  - 截圖（spec §16）：序章、帶立繪的對話框、回憶場景、地圖上的「憶」、公會的碎片交易所（吸收時的上限）、冒險者手冊的五個分頁、凜的揭露場景（用 debug hook 讓凜 7 片後回城）、狀態頁的「記憶」欄、絲嘉蕾的劇情戰。存到 `tmp/starlantern/t21-6b/`。
- [ ] **Step 3：審查**：派一個沒參與開發的 opus 代理，用 `~/.claude/skills/review-pr/SKILL.md` 審查本計畫的 diff，並處理它提出的問題。
- [ ] **Step 4：commit**：`test(starlantern): the story end-to-end`

---

## 交給 6c 的接口
- `data/story.zh-TW.ts` 的 `STORY`：57 段回憶、各幕、凜的揭露、終幕、`act1-after`、回城對話（`CHAT_COUNT`）、5 段交還、各階段的城鎮台詞與五個設施的招呼、凜的伏筆、吸收台詞（30 句以上）、人物簡介 3 段、真相 6 條、鎮民的 lost／after、每段場景的 summary。
- 長度上限是 `lineCap`；條件台詞用 `ScriptLine.if`（終幕裡沒遇見的夥伴、波比還沒遇見時由主角代為說明、莉茲與歐里克的重逢看 `returned`）；說話者是 `Speaker`，表情可以用 `smile`、`sad`（主角與凜有圖，其他人自動退回 normal、down）。
- 6c 必須把每一句 `ph(...)` 換成真正的文字，並把 `story.test.ts` 的 `placeholders are registered` 改成 `expect(PLACEHOLDERS.size).toBe(0)`。
- 相遇台詞仍是 6a 的 `T.meet[id].before`／`after`（Task 17 已改成帶立繪播放）。
- 記憶關鍵天賦的名稱與說明在 `data/talents.ts` 的 `KEYSTONES`，6c 可以改寫文字，不可以改數值。

## 交給美術計畫的接口
- 記憶背景（`art.memoryBg(id)`，每人 1 張）：本計畫沒有新增這個路徑；回憶場景目前只用 `slx-talk--memory` 的色調。
- 微光的地圖圖示（目前是文字「憶」，加進 `EventTileKey` 後 `MapView` 自動改用圖）、三種無主碎片與鎮民碎片的物品圖示。
- 絲嘉蕾作為敵人的圖（目前用她的站姿圖，`EnemyDef.look`）、燈喰之母（目前用燈喰之獸的圖）。
- NPC 立繪與 `sad` 表情（spec §11.4）、終幕與序章的 CG、城鎮背景的變化版。
- 人物分頁的剪影目前是 CSS 的 `filter`。

## 接手清單的處理（`.superpowers/sdd/carry/plan6b-carry.md`）
- `validBuild` 用存檔的主角記憶、非有限數當 0：Task 3（存檔驗證拒收；`memoriesOf` 再保險一次）。
- `game.ts` 與 `statusTabs` 的單一記憶來源：Task 3（`memoriesOf(m)` 是 `canRaiseNode`／`raiseNode` 的預設值）。
- 模擬傳入該深度的期望記憶：Task 3（`partyAt` 寫進主角）、Task 20a（`expectedMemories`）。
- 「記憶期望」的平衡帶：Task 20a、20b。
- 絲嘉蕾的劇情戰、天燈、凜的第二絕技、`memory` 屬性來源：Task 14、13、13、7。
- M3/M4 緊繃組合：`ENEMY_POWER.ramp` 凍結；記憶的帶用記憶的旋鈕解（Task 20b），深層用第三段（Task 20c）。第 16 項的四人組合與 `BOSS_PARTY_SCALE[4]` 不動，人數補正表不是本計畫的旋鈕。
- 深層曲線、沒有第 10 層以下的帶：Task 20a 的第 19 項、Task 20c。
- M9（第 18 項的法系主角沒帶武器）：Task 20a 量測、Task 20d 限時調整，收斂不了就明確裁定不做。
- 6a Task 21 延後的 7 項：第 1 項即上面的 Task 3；`sizeOf` 的 `Math.round`、`party.test.ts` 第 6 行的 CRLF、第 11／14 項 `say` 的順序，三項維持原狀（沒有行為差別，改了只增加雜訊）；第 16 項四人組合與 ramp 的緊繃組合同上；`ENEMY_POWER` 的紀錄更正由 Task 20a 的實測取代。

## 本計畫裁定的 spec 衝突
1. **記憶片數放在成員身上，不放在 `GameState.memories`。** spec §10 列了 `memories`、`absorbed` 與「凜是否已選擇」三個 `GameState` 欄位。本計畫把它們放在 `Member.memories`、`Member.absorbed`、`Member.oath`：能力值要經過 33 個 `statsOf` 呼叫點與戰鬥、模擬，放在成員身上才是真正的單一來源（接手清單第 2 條），也不必把整個狀態傳進每一個呼叫點。spec 與 6a 計畫寫的 `state.memories.hero` 就是 `memoriesOf(state.party.roster.hero)`。
2. **存檔版本是 v8。** spec §13 寫 6 → 7；6a 已經用了 v7，6b 再升一次，照樣用 `save-reset` 通知。
3. **文字。** spec §2、§17 要求本項寫完全部文字；使用者把文字拆給 6c。6b 只放經過 `ph()` 登記的暫定文案，6c 必須清空 `PLACEHOLDERS`。
4. **第 10 項的記憶版本。** 6a 用「主角 10 片記憶」當最壞情況，暫代 spec §9.4 第 7 點的「記憶期望」。Task 20a 把它換成真正的記憶期望（依深度、依真的掉落規則）；「10 片記憶加深淵上限」保留在第 11、14、18e 項，負責「頭目不會一回合倒下」的上限檢查。門檻不變。
5. **`ENEMY_POWER.ramp` 不動。** 接手清單 M3/M4 指出第 18b 項與第 10 項記憶版本在 depth 8 拉扯同一個 ramp。本計畫用兩個互不相干的旋鈕取代它：記憶的帶調記憶的價值（Task 20b），深層帶調 Lv42 以上的第三段（Task 20c）。
6. **夥伴的圓滿結局沒有另外的場景。** spec §6 描述的結局，由她的最後一片回憶與鎮上的變化承擔；§17 的文字類別裡也沒有獨立的結局。莉茲與歐里克的重逢放在歐里克的交還場景，用 `if.met`／`returned` 的條件台詞。
7. **鎮民碎片的交還在公會當場播放。** spec §8.2 把「鎮民交還」列在回城佇列。交還是玩家在公會主動做的事，當場播放不會打斷任何東西，所以不進佇列。
8. **多蘭的「新配方」。** 新配方需要新物品與圖示，本計畫不新增美術；改成「師父的手法」：套裝配方的地區素材少 `PERKS.setRecipeLess` 個。
9. **公會不賣無主碎片。** spec §3.2 說公會也把無主碎片賣給冒險者。用錢買碎片會繞過依深度計算的吸收期望（第 7、10 項），所以 6b 只收購；第 2 項可以再加。
10. **瑪莎的料理算一個祭壇增益**，計入 `ALTAR_STAT_CAP_PCT`；不另做一套增益系統。
11. **絲嘉蕾的劇情戰。** spec 說「她不會死、也不會讓隊伍全滅」：本計畫讓這場戰鬥裡我方每一位與她都不會低於 1 HP，撐過 `STORY_FIGHT_ROUNDS` 回合就勝利，只結算被打倒的敵人；她的戰鬥圖用現有的站姿圖。
12. **終幕頭目「燈喰之母」** 是燈喰之獸改名並乘上 `FINALE_BOSS.power`，沿用燈喰之獸的圖；新敵人的圖屬於美術計畫。
13. **剪影與回憶背景。** spec 的剪影用現有站姿圖加 CSS 濾鏡；`art.memoryBg` 延到美術計畫，回憶場景只用色調區分。
14. **吸收的種子**用 `forgeSalt` 與已吸收的總數，與鍛造相同的理由：在城鎮立刻存檔，讀檔不能重擲。
15. **spec 留給實作者的數值與效果在本計畫定下**：每片提升、保底 N = 3、精英給片的機率 0.35、自然微光 0.25、無主碎片的等級曲線與價格、吸收表與上限 20、鎮民碎片的報酬與回報、9 個記憶關鍵天賦的效果、天燈與黎明之刃的數值、絲嘉蕾的數值。都必須通過 Task 20b。
16. **凜的第 1 片。** spec 說「第一趟的第一處微光必得」。本計畫改成：凜還沒有第 1 片時，本道的每一層都有一處屬於她的微光。意思相同，而且第一趟錯過也不會永遠錯過（spec §2 反目標）。
17. **幕的門檻**照 spec 的提案：第二幕 4、第三幕 10、第四幕 16、終幕 30。
18. **不做替主角改名**（spec §15 留給實作者，沒有需求）。
19. **`when` 條件**照 spec，第 4 項上線前一律成立；瑟蕾的月相只記在資料裡。
20. **手冊的入口**在城鎮選單（§7.6）、公會（§3.5、§11.3）與迷宮選單（§7.6，唯讀）都有。
21. **凜的回報從她的選擇開始。** 第二形態絕技與誓約關鍵天賦在揭露場景結束時（播完、跳過或自動略過都算）生效，而不是撿到第 7 片的當下；spec §16 寫的是「之後絕技與記憶關鍵天賦正確切換」。
22. **第 19 項（深層帶）是新的帶**，門檻是本計畫訂的：一般遇敵照標準帶（≥ 0.85、0.10–0.45），終幕頭目照第 6 項的「真正的戰鬥」（0.30–0.85）。

## 需要使用者決定的事
1. **深層的難度。** 等級上限是 50，本道第 15 層的敵人已是 Lv58、第 30 層是 Lv118。第 19 項假設「預期裝備、預期記憶、深淵加成」的 Lv50 隊伍能走完本道並打一場真正的終幕。如果 Task 20c 在時間內調不過，就代表這個假設不成立，要由使用者決定：放慢敵人在深處的成長、提高等級上限，或接受終幕需要更多打寶。
2. **衝突第 1 點**：使用者與 spec 都寫了 `state.memories`；本計畫改放在成員身上。行為相同，只是位置不同；若使用者堅持欄位位置，要另外接受 33 個呼叫點傳入狀態的改動。
3. **衝突第 8、9 點**（多蘭的配方、公會不賣碎片）屬於遊戲設計的取捨，使用者可能想要原本的寫法。
