# 角色 / 世界分選（Terraria 式）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 標題畫面改成「先選角色、再選世界」：角色與世界各自有列表、可新增、可刪除，任何角色都能進任何世界，帶著自己的背包裝備等級進去、離開時寫回自己的角色檔。

**Architecture:** 存檔層（M-A 已完成）早就把角色（`characters` store）與世界（`saves` store）分開；這次補上「多個世界 slot」「列出 / 刪除角色與世界」「用指定角色載入指定世界」三個存檔 API，再把 `session.ts` 從寫死的 `'main'` 改成「目前選的 slot + 目前選的角色」，最後重做標題畫面的 DOM 面板。新世界也走同一條路：生成世界 → 丟掉生成時附帶的空白角色 → 用選定的角色 `restoreSplit(..., {freshVisit})` 進場。

**Tech Stack:** Astro 7、TypeScript、Canvas2D、IndexedDB、vitest（jsdom）、Playwright。

**Spec:** 使用者在對話中的要求（2026-10-20）：「世界與角色應該是可以分開的 / 世界是世界 / 角色是角色 / 進入其他玩家的世界時 可以帶著原本的角色狀態進入」＋「照 Terraria 的做法直接開始」。連線總體設計見 `docs/superpowers/specs/2026-10-20-delve-coop-design.md`（:225 角色選單、:234 M-A 範圍）；前一份計畫 `docs/superpowers/plans/2026-10-20-delve-coop-ma-save-split.md`。

## Global Constraints

- 文字一律繁體中文，直接寫在 `delve.astro` / `session.ts` / `titleUi.ts`（delve 不走 i18n 雙檔制）。
- 禁 `!important`、禁行內樣式（`style=` 屬性、`el.style.x =` 皆禁；用 class / data-attribute）。
- 不加新 npm 套件。
- 測試用 `npx vitest run <path>`，絕不用 `npm test`；e2e 用 `npx playwright test tests/e2e/delve.spec.ts --project=chromium`。
- `tests/e2e/delve.spec.ts` 是 CRLF 行尾，編輯後必須維持 CRLF（`git diff --stat` 不可出現整檔改動）。
- 角色 / 世界數量不設上限。暱稱上限 `MAX_NICK = 16`，空白 → `旅人`；世界名上限 32（沿用 `#delve-seed` 的 maxlength），空白 → `rollWorldName()`。
- 舊有的 `'main'` slot 名稱保留不改名；新世界的 slot 名一律 `w-<uuid>`（`newWorldSlot()`）。`*.bak` 永不出現在列表、刪除世界時不碰備份。
- Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Builder decisions（Claude 代為決定，使用者可推翻）

- B1 「繼續冒險」= 最近存檔的世界 slot ＋ 該 slot 記錄的 `charId`（`putSplit` 早已把最後進場的角色寫在世界記錄上），不另存 last-played。
- B2 新角色在建立當下就寫入 `characters` store（完整 `DelveCharacter`，初始背包等同新遊戲），不等第一次進世界。
- B3 刪世界只刪該 slot，不刪 `*.v9.bak`；刪角色只刪角色記錄，世界裡該角色的 visit 留著（無害，超過 8 個會被 LRU 擠掉）。刪除一律經 `#delve-confirm` 確認。
- B4 匯入世界檔永遠新增一個 slot（不再覆蓋 `'main'`）。附帶的角色：角色庫沒有同 id → 新增；已有同 id → 只有匯入檔 `rev` 較大才覆蓋，否則保留現有。匯入的舊格式（format 9）檔 → `commitMigration` 進新 slot、`backup:false`。
- B5 標題上若 `'main'` 仍是未轉換的舊存檔，按「開始遊戲」或「繼續冒險」時先轉換（沿用 `commitMigration`，含備份）再顯示列表，列表永遠只有新格式。
- B6 「角色外觀」移出主選單，改在「新角色」面板裡（體型＋衣櫥＋預覽）；已建立角色的外觀在遊戲內衣櫥改（現有功能）。`delve.appearance` 仍當作新角色面板的預設外觀。
- B7 「和平模式」屬於世界，留在「新世界」面板；「體型」屬於角色，移到「新角色」面板。
- B8 世界匯出移到世界列表每一列的「匯出」按鈕（嵌入該世界最後進場的角色，同現行格式）；主選單只留「匯入存檔」。

## Review Focus

1. 角色 A 在世界 1 拿到的物品，換到世界 2 仍在背包；世界 1 的房子不會跑到世界 2 → Task 5 e2e `carries gear between worlds`。
2. 角色 B 第一次進世界 1 → 出生在出生點（freshVisit），不會出現在角色 A 的位置；A 回到世界 1 → 回到 A 自己的位置 → Task 2 unit `planPlay uses the chosen character's visit`。
3. 刪除目前「繼續冒險」指向的世界或角色後，「繼續冒險」要指向下一個仍可玩的組合，或隱藏；不可讀到已刪的角色而報「角色檔不見」→ Task 2 unit `planContinue skips worlds whose character was deleted` ＋ Task 5 e2e。
4. 兩個世界名稱相同（同 seed）→ 兩個獨立 slot，互不覆蓋 → Task 2 unit ＋ Task 5 e2e `same name twice`。
5. 匯入一份角色 rev 比本機舊的世界檔 → 本機角色不被倒退 → Task 2 unit `importWorld keeps newer local character`。

---

### Task 1: 存檔層 — 多 slot、列表、刪除

**Files:**
- Modify: `src/scripts/games/delve/save/split.ts`（`SplitStore` 介面擴充）
- Modify: `src/scripts/games/delve/save/storage.ts`（`idbSplitStore`、`CharacterRecord`、`listSlots`）
- Modify: `src/scripts/games/delve/save/character.ts`（`createCharacter`）
- Test: `src/scripts/games/delve/save/character.test.ts`、`src/scripts/games/delve/save/split.test.ts`（記憶體 store 跟著擴充）

**Interfaces:**
- Produces:
  - `SplitStore` 新增：`listWorlds(): Promise<SlotMeta[]>`（不含 `*.bak`，新到舊）、`listCharacters(): Promise<CharacterMeta[]>`（新到舊）、`deleteWorld(slot: string): Promise<void>`、`deleteCharacter(id: string): Promise<void>`、`putCharacter(c: DelveCharacter): Promise<void>`（只寫角色；同 id 覆蓋）
  - `interface CharacterMeta { id: string; nick: string; savedAt: number; rev: number; level: number; appearance: Appearance }`（`storage.ts` export）
  - `CharacterRecord` 新增選填 `preview?: { level: number; appearance: Appearance }`；`putSplit` 與 `putCharacter` 都寫入；`listCharacters` 遇到沒有 preview 的舊記錄就解碼 `data` 補出來
  - `newWorldSlot(): string` → `'w-' + newId()`（`split.ts` export）
  - `createCharacter(nick: string, appearance: Appearance, now: number): DelveCharacter`（`character.ts`）：`rev: 0`、nick 經同一套截斷 / 空白→旅人 規則；其餘欄位（背包、裝備、血量、魔力、等級…）必須等於全新 `DelveGame` 的玩家初始狀態

- [ ] **Step 1: 寫失敗測試**
  - `character.test.ts` › `createCharacter matches a fresh game's player`：`const c = createCharacter('阿明', look, 1000)`；拿一個全新小世界 `DelveGame` 的 `splitSnapshot(...).character` 當 `ref`；斷言 `c.inventory/equipment/equipGear/combat/levels/codex/fishLog/buffsLeft/undyingCd` 各自 `toEqual(ref.…)`、`c.nick === '阿明'`、`c.appearance` toEqual `look`、`validateCharacter(c)` 不丟錯。
  - `createCharacter('   ', look, 0).nick === '旅人'`；17 字暱稱被截成 16 字。
  - `split.test.ts` 記憶體 store 實作新方法；`listWorlds excludes backups and sorts newest first`、`deleteCharacter removes only that character`、`newWorldSlot is unique and prefixed`（呼叫 100 次無重複、皆 `/^w-[0-9a-f-]{36}$/`）。
- [ ] **Step 2:** `npx vitest run src/scripts/games/delve/save` → 新測試 FAIL。
- [ ] **Step 3: 實作。** `createCharacter` 若引擎沒有獨立的「玩家初始狀態」可取，可在 `character.ts` 以最小世界 `new DelveGame(...)` 取快照再換 identity / appearance——但測試只要求結果相等，選效能可接受的方法（單次 < 200ms）。`idbSplitStore` 的 `deleteWorld` / `deleteCharacter` / `putCharacter` 各用單一 readwrite transaction；`listWorlds` 取代 `listSlots` 的呼叫點（`listSlots` 可保留為別名或刪除，二擇一不留兩套）。
- [ ] **Step 4:** `npx vitest run src/scripts/games/delve` → 全綠。
- [ ] **Step 5: Commit** `feat(delve): list and delete worlds and characters`

### Task 2: 存檔層 — 用指定角色進指定世界、繼續、匯入

**Files:**
- Modify: `src/scripts/games/delve/save/split.ts`
- Test: `src/scripts/games/delve/save/split.test.ts`

**Interfaces:**
- Consumes: Task 1 全部。
- Produces:
  - `planPlay(store: SplitStore, slot: string, charId: string): Promise<ContinuePlan>`：讀世界 slot ＋ 指定角色；回傳與 `planContinue` 同型別（`none | legacy | split{world, character} | error{message}`）。角色不存在 → `error{CHARACTER_MISSING_MSG}`。
  - `planContinue(store, slot?)`：不傳 slot 時，依 `listWorlds()` 新到舊找第一個「slot 有 `charId` 且該角色存在」的世界；找不到 → `none`。帶 slot 的舊呼叫方式行為不變。回傳的 split / legacy 結果須附 `slot: string`。
  - `planNewWorld(game: DelveGame, character: DelveCharacter, now: number): { game: DelveGame; session: SplitSession }`：把剛生成的世界拆出來、丟棄其附帶角色、用 `character` 以 `freshVisit` 重組；`session.charId === character.id`，世界的 `worldId` 全新、`worldName === game` 的 seed。
  - `importWorld(store, bytes: Uint8Array, now: number): Promise<{ slot: string } | { error: string }>`：新 slot；角色依 B4（rev 較大才覆蓋）；舊格式走 `commitMigration(store, newSlot, …, {backup:false})`；沒有附角色的 format 10 檔 → `{error: NO_CHARACTER_MSG}`（把現有常數搬進 split.ts 或沿用其位置）。
  - `SplitSession` 新增 `readonly slot: string`（`fresh` / `fromLoaded` / `commitMigration` 都要帶入），`saveSplit` 改用 `s.slot`，移除獨立 `slot` 參數。

- [ ] **Step 1: 寫失敗測試**（`split.test.ts`）
  - `planPlay uses the chosen character's visit`：世界 W 先以角色 A 存檔（A 位置 x=500），再 `planPlay(W, B.id)` → 還原後 B 在出生點、`freshVisit === true`；`planPlay(W, A.id)` → A 的 x === 500。
  - `planPlay with a missing character errors and writes nothing`：store 寫入次數不變。
  - `planContinue skips worlds whose character was deleted`：W1（較新，角色 A）、W2（較舊，角色 B），刪 A → `planContinue(store)` 回傳 W2 / B；再刪 B → `none`。
  - `planNewWorld keeps the character's inventory`：角色背包放入某物品，`planNewWorld` 後 `game` 玩家背包含該物品、世界 `worldId` 與任何既有世界不同。
  - `same world name twice gives two slots`：兩次 `planNewWorld` ＋ `saveSplit` 同 seed → `listWorlds().length === 2`。
  - `importWorld keeps newer local character`：本機 A rev=5、匯入檔 A rev=3 → 匯入後 A.rev 仍 5；反過來 rev=7 → 變 7。
  - `importWorld never touches existing slots`：匯入前後原有 slot bytes 相同。
- [ ] **Step 2:** 跑 → FAIL。
- [ ] **Step 3:** 實作上述介面。
- [ ] **Step 4:** `npx vitest run src/scripts/games/delve` 全綠。
- [ ] **Step 5: Commit** `feat(delve): play any world with any character`

### Task 3: session 流程改成「目前 slot ＋ 目前角色」

**Files:**
- Modify: `src/scripts/games/delve/render/session.ts`、`src/scripts/games/delve/render/titleModel.ts`
- Test: `src/scripts/games/delve/render/titleModel.test.ts`、`src/scripts/games/delve/render/model.test.ts`

**Interfaces:**
- Consumes: Task 1、2。
- Produces（給 Task 4 的 `TitleUi` 呼叫）：session 內的 handler
  - `onPickCharacter(id)`、`onCreateCharacter(nick, appearance) → CharacterMeta`、`onDeleteCharacter(id)`
  - `onPickWorld(slot)`（以目前選定角色開始）、`onCreateWorld(name, peaceful)`、`onDeleteWorld(slot)`、`onExportWorld(slot)`
  - `onContinue()`、`onImport(file)`
  - TitleUi 需提供：`setCharacters(list: CharacterMeta[])`、`setWorlds(list: SlotMeta[], forNick: string)`、`setSave(...)`（現有，繼續冒險摘要）
  - `titleModel.ts`：`worldLine(m: SlotMeta, now: number): string`（世界名 · 遊玩時間 · 深度 / 完成度 · 和平 · 上次遊玩相對時間）、`characterLine(c: CharacterMeta, now: number): string`（暱稱 · Lv · 上次遊玩）

- [ ] **Step 1: 寫失敗測試**：`titleModel.test.ts` 對 `worldLine` / `characterLine` 各給 2 個案例（含和平模式、從未遊玩 / 剛剛）；`model.test.ts` 刪除 `newWorldPlan` 的 'confirm' 案例（新世界不再覆蓋），改測 `autostartPlan` 仍回傳 fresh / continue。
- [ ] **Step 2:** 跑 → FAIL。
- [ ] **Step 3: 實作。** 移除 `const SLOT = 'main'`；`writeSave` 寫 `session.slot`；`startFresh(seed, peaceful)`（autostart / `?fresh=1` 用）= `createCharacter(DEFAULT, defaultLook)` → `putCharacter` → `planNewWorld` → `begin`；`newWorldPlan` 與覆蓋確認流程刪除；`exportSlot` 改收 slot 參數；`openImport` 改呼叫 `importWorld` 後重刷列表（不直接進遊戲）；B5 的舊存檔轉換放在 `onStart`（進角色列表前）與 `onContinue`；`returnToTitle` 回到主選單並重刷「繼續冒險」。刪除的 handler 都先經 `askConfirm(msg)`（把現有 `askOverwrite` 泛化）。這一步 UI 尚未接上沒關係，`?autostart=1&fresh=1` 與「繼續冒險」必須照常可玩。
- [ ] **Step 4:** `npx vitest run src/scripts/games/delve` 全綠；`npx playwright test tests/e2e/delve.spec.ts --project=chromium -g "autostart|continue"` 全綠（只依賴 autostart / 繼續的測試）。
- [ ] **Step 5: Commit** `refactor(delve): drive saves by selected slot and character`

### Task 4: 標題畫面 — 角色列表、世界列表、新角色 / 新世界面板

**Files:**
- Modify: `src/pages/games/delve.astro`（`#delve-tmenu` 與面板 DOM、`<style is:global>` 區）
- Modify: `src/scripts/games/delve/render/titleUi.ts`
- Modify: `src/scripts/games/delve/render/session.ts`（把 Task 3 handler 接上 TitleUi）

**Interfaces:**
- Consumes: Task 3 handlers 與 `worldLine` / `characterLine`。
- Produces（e2e 用的 DOM 契約，Task 5 依賴，名稱固定）：
  - 主選單 `#delve-tmenu`：`#delve-continue`（繼續冒險）、`#delve-start`（開始遊戲）、`#delve-import`（匯入存檔）、`#delve-help-open`、`#delve-settings-btn`、`#delve-back`。移除 `#delve-new`、`#delve-look`、`#delve-export-title`。
  - 角色面板 `#delve-charpanel`（`data-tpanel="chars"`）：標題「選擇角色」；`#delve-charlist` 內每列 `.delve-char-row[data-id]`，含 `<canvas class="delve-char-doll">`、`.delve-char-line`、刪除鈕 `.delve-char-del`；列本身是 button 可聚焦。底部 `#delve-newchar-open`（新角色）、`#delve-chars-back`（返回）。空清單時顯示「還沒有角色，先建立一個吧」。
  - 新角色面板 `#delve-newchar`（`data-tpanel="newchar"`）：`#delve-nick`（maxlength 16，placeholder 旅人）、`#delve-body-f` / `#delve-body-m`、`#delve-new-doll`、`#delve-new-look`（開衣櫥）、`#delve-newchar-create`（建立）、`#delve-newchar-cancel`。建立後直接進世界面板且已選定該角色。
  - 世界面板 `#delve-worldpanel`（`data-tpanel="worlds"`）：標題「選擇世界 — 以 <暱稱> 進入」（`#delve-world-who`）；`#delve-worldlist` 每列 `.delve-world-row[data-slot]`，含 `.delve-world-line`、`.delve-world-export`、`.delve-world-del`；底部 `#delve-new`（新世界）、`#delve-worlds-back`（回角色列表）。空清單時顯示「還沒有世界，建立一個吧」。
  - 新世界面板沿用 `#delve-newpanel`：`#delve-seed`、`#delve-dice`、`#delve-diff-normal` / `#delve-diff-peaceful`、`#delve-create`、`#delve-new-cancel`（回世界面板）。移除體型與外觀（B7）。
  - 刪除確認沿用 `#delve-confirm`，訊息：角色「刪除角色「<暱稱>」？角色的背包、裝備、等級都會消失，無法復原。」；世界「刪除世界「<世界名>」？世界裡的建築和箱子都會消失，無法復原。」確認鈕文字「刪除」。

- [ ] **Step 1:** 改 DOM 與樣式（沿用 `.delve-ti` 按鈕外觀，列表可捲動、手機寬 ≥ 40px 高、無水平捲動）。角色列的小人像重用 `titleUi.ts` 畫 `#delve-new-doll` 的同一支函式（抽成共用函式，不複製）。
- [ ] **Step 2:** `titleUi.ts` 接線：方向鍵 / Home / End 在列表與按鈕間移動（沿用 `menuMove`），Esc 逐層返回（新角色→角色列表→主選單；新世界→世界列表→角色列表），Tab 鎖在目前面板，刪除鈕不因方向鍵誤觸。
- [ ] **Step 3:** 手動實跑：`npx astro dev --port 4331 --host 127.0.0.1`，建兩個角色、兩個世界、互換進出各一次，回標題確認「繼續冒險」指向最後的組合。
- [ ] **Step 4:** `npx vitest run src/scripts/games/delve` 全綠。
- [ ] **Step 5: Commit** `feat(delve): Terraria-style character and world select`

### Task 5: e2e 更新與新增

**Files:**
- Modify: `tests/e2e/delve.spec.ts`（維持 CRLF）

**Interfaces:**
- Consumes: Task 4 DOM 契約。
- Produces: helper `newWorldVia(page, seed, {nick?, newChar = true})`：`#delve-start` →（`newChar` 時）`#delve-newchar-open` → 填 `#delve-nick` → `#delve-newchar-create` → `#delve-new` → 填 `#delve-seed` → `#delve-create`；否則點第一列 `.delve-char-row` 再 `#delve-new`。

- [ ] **Step 1:** 把現有走 `#delve-new` → `#delve-create` 的測試（約 54、140、1223、1512、1600、1634、2483 行）改用 `newWorldVia`；覆蓋確認相關斷言（140、1600）改成「舊世界仍在列表」；鍵盤順序測試（1223）改為新主選單順序 continue→start→import→help→settings→back；`#delve-look` 衣櫥測試（1687、1712、1735）改走新角色面板的 `#delve-new-look`；`#delve-export-title` 測試（419）改點 `.delve-world-export`；直接讀 IndexedDB `'main'` 的測試（312、371）維持或改讀 `listWorlds` 等價資料。
- [ ] **Step 2: 新增測試**
  - `carries gear between worlds`：角色 A 進世界「甲」，用 `__delveDebug.game` 給背包一個可辨識物品並放一塊方塊，回標題；A 建世界「乙」→ 背包有該物品、該方塊位置不是玩家放的方塊；回標題，再選 A ＋「甲」→ 方塊仍在。
  - `second character starts fresh in a shared world`：B 進「甲」→ 背包沒有 A 的物品、站在出生點。
  - `delete world and character with confirm`：取消不刪、確認才刪；刪掉「繼續冒險」指向的角色後，繼續冒險改指向剩下的組合或隱藏。
  - `same name twice`：兩個同名世界都在列表。
  - `migrates legacy main before listing`：沿用既有 v1 / format 9 種子 helper，按 `#delve-start` 後角色列表出現 旅人、世界列表出現該世界、`main.v9.bak` 存在。
- [ ] **Step 3:** `npx playwright test tests/e2e/delve.spec.ts --project=chromium` 全綠；`git diff --stat tests/e2e/delve.spec.ts` 行數與實際改動相符（非整檔）。
- [ ] **Step 4:** `npx vitest run` 全套（已知 CPU 忙時逾時的 render/avatarArt、render/lightFill 等單獨重跑通過即可，需在回報中列出）。
- [ ] **Step 5: Commit** `test(delve): e2e for character and world select`
