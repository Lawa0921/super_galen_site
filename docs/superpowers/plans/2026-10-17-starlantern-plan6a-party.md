# 星燈迷宮 計畫 6a：隊伍重整（主角、凜、兩人開局、相遇、人數補正） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增主角洛恩（`hero`）與凜（`rin`）；新遊戲只有這兩人，其餘 8 人在迷宮的求救房遇見後加入；主角永遠在場；公會從「招募」改成「召回」；敵人依出戰人數補正；平衡模擬可以指定成員與主角流派，並依 2／3／4／5 人重排平衡帶。

**Architecture:**
- **成長規則改成每個角色可覆寫。** `CharacterDef.rules`（只有 `hero` 設定）決定點數曲線、分支數、可持有的終極數、天賦盤欄數、關鍵天賦上限。規則仍然只寫在 `engine/progression.ts` 與 `data/talents.ts` 的既有判斷函式裡，讀 `rulesOf(id)`，不另寫一套。
- **主角的特殊之處都是純函式。**
  - 流派配點 `heroTree`／`heroTalents`；
  - 深淵終極的解鎖看「主角記憶片數」參數 `memories`。6a 沒有碎片系統，正常遊玩一律傳 0，所以正常遊玩拿不到深淵終極，也就不會產生讀不回來的存檔。6b 改成傳 `state.memories.hero`。
  - 普通攻擊的近戰／遠程與計算屬性看武器的 `weaponKind`；
  - 絕技形態看投入最多點數的分支（`ultimateFor`）。
- **相遇不需要新的存檔欄位。** 規則是「同伴還沒遇見 ⇔ 該地區該深度的樓層一定有求救房」。
  - 出發時把本趟的相遇表存進 `Run.rescues`；`floorOf` 在 `fillRooms` 之後，用另一個種子放求救房，所以其他房間的內容與現有種子測試完全不變。
  - `recruited` 不改名，意思改成「已遇見」。
- **人數補正**在 `createBattle` 算好，寫進 `BattleState.partyScale`。係數與每組敵人上限都是「依人數查表」，2、3、4、5 人各自一格，可以分開調整；5 人那格固定是 1，現有戰鬥逐位元不變。
- **平衡模擬**改用 `partyWith(ids)` 組隊。
  - `kitParty` 依固定的舊順序替成員抽裝備（舊的 8 人在前，凜、主角在後），所以新增角色不會移動舊成員的亂數序列；主角的固定武器照樣先抽一件再丟掉。
  - Task 11 先讓預設維持舊的 5 人，平衡不動；Task 19a 才換成新的標準滿編，19b、19c 再調整。這樣兩人開局（Task 12a、12b）不會動到任何平衡帶。
  - 在 Task 19a 之前，平衡測試的每一個數字都不可以變；Task 3 起有一個測試釘住這一點。
- **存檔**：6a 把版本從 6 升到 7（新角色、兩人開局、主角必須在場）。6b 的故事狀態是另外的欄位，由 6b 再升到 8。

**Tech Stack:** TypeScript、Vitest（happy-dom）、DOM 介面加上 SCSS、Playwright e2e。

**Spec:**
- `docs/superpowers/specs/2026-10-17-starlantern-story-world-design.md`：§4（主角）、§5 的戰鬥部分、§6 的相遇地區與深度、§9（開局與招募重整）、§10 的隊伍部分、§13、§16 的隊伍部分。
- 前兩份計畫：`docs/superpowers/plans/2026-10-17-starlantern-plan5b-skills-talents.md`、`docs/superpowers/plans/2026-10-17-starlantern-plan5c-forge.md`。本計畫沿用它們的技能樹規則（`TIER_GATE`、免費節點、`patchSkill` 的順序）與點數公式。
- 後續計畫：6b 故事系統（碎片、場景佇列、手冊、`story.act1Cleared`、存檔 v8）、6c 全部文字、6d 主角與凜的立繪。

> 沒有以 `src/`、`tests/` 或 `docs/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。

## Global Constraints
- **單元測試**
  - 單檔：`rtk proxy npx vitest run src/scripts/games/starlantern/<路徑>`。
  - 本遊戲全套：`rtk proxy npx vitest run src/scripts/games/starlantern --testTimeout=20000`；整個專案：`rtk proxy npx vitest run --testTimeout=20000`。
  - 不可以用 `npm run test`，它是 watch 模式，會卡住。
- **e2e**：`E2E_PORT=4352 npx playwright test tests/e2e/starlantern --project=chromium`。不可以用 4321 埠。
- **工具**：本專案沒有 prettier、eslint，也沒有 type-check 腳本，不要去跑。
- **SCSS**：禁止 `!important`；禁止行內樣式，包括 JS 的 `element.style`；不可以用 `::before`／`::after` 做裝飾。
- **換行**：保留每個檔案原本的換行格式。改檔前先用 `git ls-files --eol <檔案>` 確認。新檔一律用 LF。已知的格式如下：
  - LF：`data/regions.ts`、`data/talents.ts`、`data/trees.ts`、`data/ultimates.ts`、`engine/dungeon/rooms.ts`、`engine/dungeon/run.ts`、`engine/progression.ts`、`engine/scaling.ts`、`engine/stats.ts`、`render/markers.ts`、`ui2/scenes/dungeon.ts`、`ui2/scenes/equip.ts`、`ui2/scenes/statusTabs.ts`
  - CRLF：`data/characters.ts`、`data/equipment.ts`、`data/skills.ts`、`engine/map.ts`、`engine/party.ts`、`engine/portals.ts`、`engine/save.ts`、`engine/sim.ts`、`engine/state.ts`、`engine/testing.ts`、`engine/types.ts`、`render/artPaths.ts`、`ui2/scenes/formation.ts`、`ui2/scenes/guild.ts`、`ui2/scenes/status.ts`
  - 混用：`data/text.zh-TW.ts`、`engine/balance.test.ts`、`engine/battle.ts`、`engine/combatant.ts`、`engine/game.ts`、`render/MapView.ts`、`render/battleCues.ts`、`ui2/scenes/battle.ts`
- **git**
  - 一律寫出完整路徑，不可以用 `git add -A`。
  - 訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
  - 絕對不可以執行 `git checkout`、`git restore`、`git reset`、`git stash`、`git clean`。
- **文案**
  - 介面文字放在 `data/text.zh-TW.ts`。技能、節點名稱與說明照 5b 的做法放在資料檔。
  - 相遇場景的台詞屬於 6c。本計畫只建立真正的文案鍵 `T.meet[id].before`／`T.meet[id].after`，內容先用通用的一句話（Task 16）。不可以留空字串或「TODO」。
- **美術**
  - 主角與凜的立繪、站姿圖屬於 6d。6a 不新增任何圖片，不可以做假圖示、假頭像，也不可以用 CSS 形狀畫。
  - 沒有圖時沿用現有的 `art.has(...)` 判斷，只顯示名字；地圖的求救房用文字標記「救」。
  - `allArtUrls()` 不列 `hero`、`rin`，`render/artPaths.test.ts` 裡的 url 總數維持不變。
- **亂數**：一律用帶種子的 `Rng`。求救房的位置用 `mulberry32(floorSeed ^ RESCUE_SALT)`，不從 `fillRooms` 的 rng 取數；新的傷害效果只在需要時抽數（必定暴擊不抽暴擊數）。
- **平衡**
  - `engine/balance.test.ts` 的門檻一律不可以放寬。Task 19a 依 spec §9.4 重排的平衡帶，以本計畫寫出的數字為準（見「本計畫裁定的 spec 衝突」第 3 點）。
  - 會影響戰力的任務，驗證時一律跑本遊戲全套，包括 balance。
  - 紅了只能依 Task 19b、19c、20 各自列出的旋鈕與順序調整，並在 commit 訊息寫出最後的值。任何組合都調不過時，停下來回報，絕不放寬。
  - Task 9 的峰值測試是硬性護欄：Task 19b、19c、20 不可以把主角的回復、守護、`abyss-sword` 等數值調過 Task 9 的上限。某一帶需要這樣做才過，就停下來回報。
  - 使用者規則照舊：平衡以預設配點為準；完全不投點的隊伍被輾壓是預期內的事。
- **定位程式碼**：Task 12b 之後的任務，一律用內容（函式名、測試名、字串）找要改的地方，不用行號，因為前面的任務會讓行號位移。本計畫裡出現的行號，只是 base 82830584 時的參考。
- **中間版本的存檔**：Task 3 到 Task 12a 之間，舊的 v6 存檔會被讀成 `corrupt`（roster 少了新角色），而不是 `version`；Task 12a 到 Task 13 之間寫出的存檔，在 Task 13 之後也可能讀成 `corrupt`。兩者都只影響中間版本，結果一樣是顯示重置通知。完成後的計畫裡，正常遊玩不會寫出讀不回來的存檔。
- **測試寫法**
  - 預期值一律透過常數算出來：`PARTY_SCALE`、`ACTIVE_RANK_PCT`、`ABYSS`、`ABYSS_UNLOCK`、`HERO_PEAK_SHARE`、`WEAPON_MASTERY_PCT`、`ALL_AFFINITY_SHARE`、`AFFINITY_MUL`、`TALENT_PER`、`TALENT_SCALE`、`MEETINGS`、`depthLevel`。
  - 因為亂數序列改變而受影響的測試，改成斷言行為，不可以寫死新的數字。
- **測試修改規則**
  - 某個任務會弄壞的每一個測試檔，都列在該任務的 Files 裡，並寫明怎麼改。
  - 改動共用資料形狀的任務，驗證步驟一律跑全套。
  - 全套跑出本表沒列到的紅燈時，先停下來回報，不可以自行改寫該測試的意圖。
- **惡意存檔**：存檔驗證遇到任何不合法的值，一律回報 `corrupt`，不可以丟出例外。
- **城鎮動作**：會改變存檔的城鎮動作（編隊、召回、投點）一律經過 `Game` 的方法，在城鎮執行後立刻存檔。介面不可以直接改 `game.state.party`。
- **存檔可讀**：正常遊玩的任何路徑都不可以寫出讀不回來的存檔。例如：主角在 6a 拿不到深淵終極；加入的同伴只有免費的 1 級，其餘配點是空的，`validBuild` 一定通過。

## Review Focus
1. **把主角換下場。** 在編隊畫面移除主角、把他換進預備、或是讀到一個陣型裡沒有主角的存檔：前兩者回傳 `no-hero`，什麼都不改；存檔回報 `corrupt`。主角那一格不顯示「移除」。測試在 Task 13。
2. **滿編時救人，以及救援失敗。**
   - 出戰已有 5 人時救下同伴：她進預備，陣型不變。
   - 救援戰逃跑或全滅：她沒有遇見，下一趟再到那一層，求救房還在。
   - 已經遇見的同伴，永遠不會再生成她的求救房。
   - 測試在 Task 14、Task 15b。
3. **陣型已滿時召回。** 必須指定一位換下的人，而且不可以是主角；召回已經在場上的人、還沒遇見的人、主角本人，都回傳 `invalid`，什麼都不改；成功後立刻存檔。測試在 Task 17。
4. **加入等級的邊界。**
   - 深度等級減 2 高於出戰成員的最高等級時，以最高等級為準；
   - 結果不低於 1、不高於 `MAX_LEVEL`；
   - 出戰成員全倒時，仍以陣型上所有成員計算。
   - 測試在 Task 14。
5. **人數補正的邊界。**
   - `n` 是陣型上的人數，不論 HP，所以倒下的成員不會讓敵人變弱。
   - 表格只有 2–5 人；只有主角 1 人上陣時，照 2 人那一格查。
   - 5 人時與補正前逐位元相同：同一個種子，整場戰鬥的 log 與結果都和改動前記下的基準相同。
   - 頭目戰同樣套用 HP、攻擊、魔力的補正，但不裁減。
   - 測試在 Task 10。

---

## File Structure
- `engine/types.ts`：`CharacterId` 加入 `'rin'`（Task 3）、`'hero'`（Task 4）；`GrowthRules`；`CharacterDef.rules`、`weaponMaster`，`affinity` 可為 `'all'`；`Effect` 的 damage 新增 `crit`、`execute`、`wounded`；`SkillDef.abyss`；`EquipDef.weaponKind`、`WeaponKind`。
- `data/characters.ts`：凜與主角的定義、`DEFAULT_RULES`、`rulesOf`、`CHARACTER_IDS` 的順序。
- `data/hero.ts`（新）：`HeroBuild`、`HERO_BUILDS`、`ABYSS`、`ABYSS_UNLOCK`、`HERO_PEAK_SHARE`。
- `data/meetings.ts`（新）：相遇表 `MEETINGS`、`rescuesFor`、`favouredRegions`。
- `data/trees.ts`、`data/skills.ts`、`data/talents.ts`、`data/ultimates.ts`、`data/equipment.ts`：兩人的技能樹、技能、天賦盤、絕技、武器種類。
- `engine/progression.ts`：點數曲線、終極上限、深淵解鎖、流派配點、`ultimateFor`、`pctMod`。
- `engine/stats.ts`：`'all'` 取向的換算。
- `engine/combatant.ts`、`engine/skills.ts`、`engine/battle.ts`：新傷害效果、主角普攻、武器專精、深淵加成、人數補正。
- `engine/scaling.ts`：`PARTY_SCALE`、`GROUP_CAP`、`FIRST_DEPTH_CAP`（依人數查表）、`partyScale`、`groupCap`、`abyssPct`；`mul` 改成 export。
- `engine/party.ts`：`partyWith`、`STANDARD_LINEUP`、`LEGACY_LINEUP`、兩人開局、`no-hero`、`meet`、`joinLevel`、`placeInGrid`；Task 17 刪掉 `recruit`。
- `engine/state.ts`、`engine/save.ts`：存檔 v7、回復藥 5 瓶、主角必須在場。
- `engine/dungeon/run.ts`、`engine/dungeon/rooms.ts`、`engine/map.ts`、`engine/portals.ts`：求救房、傳送門權重。
- `engine/game.ts`：救援戰流程、`setFormation`、`recall`、深淵加成的傳遞。
- `engine/sim.ts`、`engine/balance.test.ts`、`engine/balance.lineups.test.ts`（新）：可指定成員、主角流派、固定的 kit 抽取順序、重排的平衡帶。
- `.superpowers/sdd/2026-10-17-starlantern-plan6a-party/balance-baseline.md`（新）：Task 19a 起的實測數字與 sweep 紀錄。
- `render/artPaths.ts`、`render/battleCues.ts`、`render/markers.ts`、`render/MapView.ts`：沒有圖的角色、依武器的特效、求救房標記。
- UI：`ui2/scenes/guild.ts`、`formation.ts`、`status.ts`、`statusTabs.ts`、`equip.ts`、`dungeon.ts`、`battle.ts`；`src/styles/_starlantern-ui.scss`。
- 文案：`data/text.zh-TW.ts`。
- e2e：`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 成長規則可以依角色覆寫

**Files:**
- Modify：
  - `engine/types.ts`：新增 `GrowthRules`；`CharacterDef` 新增選填的 `rules?: Partial<GrowthRules>`。
  - `data/characters.ts`：`DEFAULT_RULES`、`rulesOf`。
  - `data/trees.ts`：`ACTIVE_RANK_PCT` 延伸到 5 級；`TreeNode.maxRank` 改成 `1 | 2 | 3 | 4 | 5`；`DEFAULT_CAPSTONE` 的型別改成 `Record<CharacterId, number>`。
  - `data/talents.ts`：`talentBlocker` 的關鍵天賦上限改讀 `rulesOf(owner).maxKeystones`；`MAX_KEYSTONES` 改成 `DEFAULT_RULES.maxKeystones` 的別名。
  - `engine/progression.ts`：點數曲線、終極上限。
  - `data/text.zh-TW.ts`：第 211、212、231 行用到 `MAX_KEYSTONES` 的三個字串改成函式，參數是上限。
  - `ui2/scenes/statusTabs.ts`：呼叫上面三個函式時傳 `rulesOf(m.id).maxKeystones`。
- Test：`engine/progression.test.ts`、`data/trees.test.ts`、`data/talents.test.ts`；`ui2/scenes/status.test.ts` 若斷言了關鍵天賦的文字，改成呼叫新函式算預期值。

**Interfaces:**
- Produces（`engine/types.ts`）：`interface GrowthRules { curve: 'companion' | 'hero'; branches: 3 | 5; capstones: number; boardCols: number; maxKeystones: number }`
- Produces（`data/characters.ts`）：
  - `DEFAULT_RULES: GrowthRules = { curve: 'companion', branches: 3, capstones: 1, boardCols: 4, maxKeystones: 2 }`
  - `rulesOf(id: CharacterId): GrowthRules`：`{ ...DEFAULT_RULES, ...CHARACTERS[id].rules }`。
- Produces（`engine/progression.ts`）：
  - `skillPoints(level: number, curve: GrowthRules['curve'] = 'companion'): number`。companion 照舊。hero 是 `(L − 1) + ⌊(L − 1) / 2⌋`，Lv50 是 73（spec §4.4）。
  - `talentPoints(level: number, curve = 'companion'): number`。companion 照舊。hero 是 `max(0, L − 5)`：Lv6 拿到第 1 點，Lv50 是 45。(implementer's call → fixed here)
  - 成員用的地方（`pointsLeft`、`talentPointsLeft`、`defaultTree`、`defaultTalents`、`party.ts` 的 `gainExp`）一律傳 `rulesOf(id).curve`。
  - `check()` 的終極規則改成：其他終極節點已持有的數量 ≥ `rulesOf(id).capstones` 時，回傳 `'capstone'`。
- `ACTIVE_RANK_PCT = [100, 110, 120, 130, 140]`。(implementer's call → fixed here；spec §4.4 說延伸到 130%、140%)

- [ ] **Step 1: 寫失敗的測試**
  - `progression.test.ts`：
    - `hero curve: skill points are one per level plus one every second level`：`skillPoints(50, 'hero')` 等於 73，`skillPoints(1, 'hero')` 是 0，`skillPoints(3, 'hero')` 是 3。
    - `hero curve: talent points from Lv6`：`talentPoints(5, 'hero')` 是 0，`talentPoints(6, 'hero')` 是 1，`talentPoints(50, 'hero')` 是 45。
    - `companion curve is unchanged`：對 L = 1…50，`skillPoints(L)` 等於 `skillPoints(L, 'companion')`，Lv50 仍是 26 與 23。
  - `trees.test.ts`：`ACTIVE_RANK_PCT has five ranks, starts at 100 and rises`。
  - `talents.test.ts`：`every companion reads the default rules`：只對 8 位同伴（寫成 `COMPANIONS = CHARACTER_IDS.filter((id) => id !== 'hero')`，所以 Task 5 加入主角後不會變紅），`rulesOf(id)` 等於 `DEFAULT_RULES`。
- [ ] **Step 2: 執行，確認失敗**
  - `rtk proxy npx vitest run src/scripts/games/starlantern/engine/progression.test.ts src/scripts/games/starlantern/data`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**（共用資料形狀有變）
- [ ] **Step 5: commit**：`feat(starlantern): per-character growth rules`

### Task 2: 傷害效果的必定暴擊、處決、背刺

**Files:**
- Modify：`engine/types.ts`（`Effect` 的 damage）、`engine/combatant.ts`（`DamageSpec`、`calcDamage`）、`engine/skills.ts`（`patchSkill` 保留新欄位）
- Test：`engine/combatant.test.ts`、`engine/skills.test.ts`

**Interfaces:**
- Produces：damage 效果與 `DamageSpec` 新增三個選填欄位：
  - `crit?: 'always'`：必定暴擊，而且不抽暴擊的亂數。
  - `execute?: number`：百分比。傷害乘上 `1 + execute / 100 × (1 − t.hp / t.max.hp)`，在扣血之前計算。
  - `wounded?: number`：百分比。目標 `hp < max.hp` 時，傷害乘上 `1 + wounded / 100`。這就是「背刺：對已被我方攻擊過的目標加傷」，用「已經受傷」代表「被攻擊過」，不需要新的戰鬥狀態。(implementer's call → fixed here)

- [ ] **Step 1: 寫失敗的測試**（`combatant.test.ts`；用一個會計數的 rng）
  - `crit always crits and draws no crit roll`：攻擊方 `x = { crit: 0, critDmg: 50 }`（critDmg 不可以是 0，否則漏掉暴擊倍率也測不出來），結果 `crit` 為真；傷害等於沒有 `crit` 時的傷害乘以 `1 + 50 / 100`（誤差在 floor 之內），而且嚴格大於沒有 `crit` 時的傷害；抽數比 `x.crit = 50` 的同一擊少 1。
  - `execute scales with the target's missing HP`：同一個 rng 下，目標半血時的傷害約等於滿血時的 `1 + execute / 200` 倍（誤差在 floor 之內）。
  - `wounded adds only when the target is hurt`：滿血時傷害不變；少 1 HP 時乘上 `1 + wounded / 100`。
  - `skills.test.ts`：`patchSkill keeps crit, execute and wounded`。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**：三個乘數都放在 `calcDamage` 現有的乘數鏈裡，位置在元素加成之後、暴擊之前。
- [ ] **Step 4: 執行 `engine/` 的測試，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): always-crit, execute and wounded damage`

### Task 3: 凜（第九位角色，尚未加入隊伍）

**Files:**
- Modify：
  - `engine/types.ts`：`CharacterId` 加入 `'rin'`。
  - `data/characters.ts`：`CHARACTERS.rin`；`CHARACTER_IDS` 改成 `['rin', 'noel', 'chizuru', 'liz', 'sylvie', 'scarlet', 'selene', 'safira', 'bobby']`。
  - `data/skills.ts`、`data/trees.ts`（`TREES.rin`、`DEFAULT_CAPSTONE.rin = 1`）、`data/talents.ts`（`PALETTES.rin`、`CHAR_KEYSTONES.rin`）、`data/ultimates.ts`
  - `render/artPaths.ts`：新增 `export const NO_ART_YET = new Set<CharacterId>(['rin'])`（Task 5 加入 `hero`）與 `export const ART_CHARACTER_IDS = CHARACTER_IDS.filter((id) => !NO_ART_YET.has(id))`；`allArtUrls` 改用 `ART_CHARACTER_IDS`。
  - `data/text.zh-TW.ts`：`T.ui2.guild.roles.rin`：「靜默的短刃使。暗器牽制，對受傷的敵人背刺，處決殘血的目標。」
  - `engine/sim.ts`：`kitParty` 不再依 roster 的鍵順序抽裝備，改依 `KIT_ORDER`（見下方 Interfaces）。
- Test：
  - `data/data.test.ts`：角色數 8 → 9；絕技 id 不重複的數量改成 `CHARACTER_IDS.length`；affinity 表加上 `rin: 'agi'`。
  - `data/trees.test.ts`：`toHaveLength(8)`（base 第 16 行）改成 `CHARACTER_IDS.length`；「除了 scarlet 以外的 `DEFAULT_CAPSTONE` 都是 0」（base 第 29 行）改成「除了 scarlet 與 rin 以外」，rin 是 1。
  - `engine/party.test.ts`：roster 長度 8（base 第 129 行）改成 `CHARACTER_IDS.length`。
  - `render/artPaths.test.ts`：第 28 行改成對 `ART_CHARACTER_IDS` 逐一檢查；url 總數不變。
  - `ui2/scenes/guild.test.ts`：如果斷言招募清單的長度，加 1。
  - `engine/sim.test.ts`：新增下方的 kit 順序測試。
  - 新增 `data/rin.test.ts`。

**Interfaces:**
- `engine/sim.ts`：`KIT_ORDER: CharacterId[]` = `LEGACY_KIT_ORDER`，接著 `CHARACTER_IDS` 裡其他不是 `hero` 的新角色，`hero` 永遠排在最後（Task 5 之前清單裡沒有他）；其中 `LEGACY_KIT_ORDER = ['noel', 'chizuru', 'liz', 'sylvie', 'scarlet', 'selene', 'safira', 'bobby']`，也就是改動前 `CHARACTER_IDS` 的順序。`kitParty` 依 `KIT_ORDER` 逐一替 roster 的成員抽裝備，新角色一律排在舊的 8 人之後。

**凜的數值**（spec §9.4 第 3 點：HP 與防禦比前排高約 15%，速度全隊最高；implementer's call → fixed here）
- `title: '失憶的短刃使'`、`name: '凜'`、`row: 'front'`、`melee: true`、`affinity: 'agi'`
- base `s(46, 16, 13, 12, 4, 7, 15)`；growth `s(6.7, 2, 2, 1.8, 1, 1, 2)`

**凜的技能樹**（分支：暗器、背刺、處決；記法同 5b）
- 暗器：
  - `rin-needle` 飛針 A3（免費）：enemy／3／物 atk 70 ×2
  - → `rin-needle-up` 飛針強化 M3 → rin-needle：powerPct 110／120／135
  - → `rin-fan` 扇形針 A3：enemies／6／物 atk 60
  - → `rin-venom-needle` 毒針 A3：enemy／5／物 atk 70，加上 poison 0.5
  - → `rin-storm` 千針 A1：enemies／13／物 atk 60 ×2
- 背刺：
  - `rin-backstab` 背刺 A3：enemy／4／物 atk 120 近戰，wounded 50
  - → `rin-backstab-up` 背刺強化 M3 → rin-backstab：powerPct 110／120／135
  - → `rin-veil` 隱匿 A3：self／4／spd +30 3 回合
  - → `rin-veil-up` 隱匿延長 M3 → rin-veil：turns 4／5／6
  - → `rin-shadowless` 無影 A1：enemy／12／物 atk 200 近戰，wounded 80
- 處決：
  - `rin-mark` 標記 A3：enemy／4／def −25 3 回合
  - → `rin-mark-up` 標記加深 M3 → rin-mark：buffPct 120／140／160
  - → `rin-execute` 處決 A3：enemy／8／物 atk 110 近戰，execute 150，crit always
  - → `rin-execute-up` 處決強化 M3 → rin-execute：powerPct 115／130／150
  - → `rin-deathblow` 斷命 A1：enemy／14／物 atk 160 近戰，execute 200，crit always
- 天賦盤 `PALETTES.rin = ['agi', 'atk', 'crit', 'critDmg', 'spd', 'evasion']`；`CHAR_KEYSTONES.rin = ['crit-tp', 'kill-tp', 'last-stand']`。誓約關鍵天賦屬於 6b。
- 絕技 `ult-rin` 無聲一刺：enemy／物 atk 300 近戰，crit always；說明「無聲的一刺，必定暴擊」。第二形態屬於 6b。

- [ ] **Step 1: 寫失敗的測試**（`data/rin.test.ts`；`FRONT = ['chizuru', 'liz', 'scarlet', 'safira']`）
  - `rin's HP and DEF are about 15% above the front line`：base 與 growth 的 hp、def，各自介於前排平均值的 1.1 到 1.25 倍。
  - `rin is the fastest`：她的 base spd 嚴格大於其他每一位角色。
  - `rin's kit has her execution and backstab`：她的樹裡至少有一個 `crit: 'always'`、一個 `execute`、一個 `wounded`。
  - `sim.test.ts`：`new characters never shift the old members' kit draws`：
    - 測試裡自己用 `mulberry32(seed)`，依 `LEGACY_KIT_ORDER`、每人依 `SLOTS` 的順序，照 `kitParty` 原本的寫法（`rollTier` 再 `rollItem`，uid 從 1 起）重抽一次；
    - 斷言 `kitParty(depthLevel(4), 4, seed, undefined, expectedEnhance(4))` 裡舊的 8 人身上每一件，與重抽的結果完全相同；
    - seed 取 1–5。
    - 這個測試先在改 `CHARACTER_IDS` 之前寫好並確認是綠的（釘住現狀），改動之後必須仍然是綠的。
  - 加上 Files 列出的測試修改。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**（`CHARACTER_IDS` 有變；balance 必須全綠，kit 順序測試保證第 10、11、14 項的裝備沒有改變）
- [ ] **Step 5: commit**：`feat(starlantern): add Rin, the knife from the bell tower`

### Task 4: 主角的定義、全能取向與技能樹

**Files:**
- Create：`data/hero.ts`（本任務先放 `HERO_PEAK_SHARE`；Task 6、7 補上其餘）、`data/hero.test.ts`
- Modify：
  - `engine/types.ts`：`CharacterId` 加入 `'hero'`；`CharacterDef.affinity: PrimaryKey | 'all'`；`CharacterDef.weaponMaster?: true`。
  - `data/characters.ts`：`CHARACTERS.hero`。本任務**不**放進 `CHARACTER_IDS`。
  - `engine/stats.ts`：export `AFFINITY_MUL`；新增 `ALL_AFFINITY_SHARE = 0.8`；`convertPrimary(p, affinity: PrimaryKey | 'all')`。
  - `data/skills.ts`、`data/trees.ts`（`TREES.hero`、`DEFAULT_CAPSTONE.hero = 0`）
  - `ui2/scenes/statusTabs.ts`「能力」分頁：目前沒有任何介面顯示取向。在主屬性那一區的標題後面加一行取向：`'all'` 顯示新文字 `T.ui2.status.affinityAll = '全能'`；其他角色顯示該主屬性在「能力」分頁裡已有的名稱（str／int／agi／wil 那一列用的同一個文字）。
  - `data/text.zh-TW.ts`：`T.ui2.status.affinityAll`，以及這一行的格式 `T.ui2.status.affinity: (label: string) => \`取向：${label}\``。
- Test：
  - `data/trees.test.ts`：第一項的「3 branches」改成 `rulesOf(id).branches`。
  - `ui2/scenes/status.test.ts`：新增 `the stats tab shows the affinity`：noel 顯示 `T.ui2.status.affinity(int 的名稱)`。主角的「全能」要等他進入 roster，測試在 Task 5。

**主角的定義**（spec §4.4；implementer's call → fixed here）
- `title: '歸來者'`、`name: '洛恩'`、`row: 'front'`、`melee: true`、`affinity: 'all'`、`weaponMaster: true`
- `rules: { curve: 'hero', branches: 5, capstones: 2, boardCols: 6, maxKeystones: 3 }`
- base `s(44, 20, 12, 10, 9, 8, 10)`；growth `s(6.3, 3, 2, 1.8, 2, 1.5, 1.5)`
- `'all'` 的換算：四個主屬性的倍率都是 `AFFINITY_MUL × ALL_AFFINITY_SHARE`（1.2）。

**主角的技能樹**（記法同 5b；A5／M5 表示最高 5 級；`abyss` 表示 Task 6 的深淵技能）
- 劍技：
  - `hero-slash` 斬擊 A5（免費）：enemy／3／物 atk 130 近戰
  - → `hero-sword-up` 劍技精通 M5 → hero-slash：powerPct 104／108／112／116／120
  - → `hero-cleave` 迴旋斬 A5：enemies／6／物 atk 70 近戰
  - → `hero-sunder` 破甲斬 A5：enemy／7／物 atk 120 近戰，加上 def −15 3 回合
  - → `abyss-sword` 深淵・劍 A1 abyss：enemy／14／物 atk 250 近戰
- 守護：
  - `hero-guard` 守勢 A5：self／4／taunt 3，加上 def +25 3 回合
  - → `hero-guard-up` 堅守精通 M5 → hero-guard：buffPct 104／108／112／116／120
  - → `hero-aegis` 庇護 A5：allies／7／def +18 3 回合
  - → `hero-rally` 鼓舞 A5：allies／6／res +18 3 回合
  - → `abyss-guard` 深淵・守 A1 abyss：allies／12／def +25 4 回合，加上 res +25 4 回合
- 星術：
  - `hero-flare` 星火 A5：enemy／4／火 mag 110
  - → `hero-frost` 星霜 A5：enemies／7／冰 mag 55
  - → `hero-star-up` 星術精通 M5 → hero-frost：powerPct 104／108／112／116／120
  - → `hero-spark` 星雷 A5：enemy／5／雷 mag 110
  - → `abyss-star` 深淵・星 A1 abyss：enemies／14／雷 mag 95
- 祈光：
  - `hero-mend` 治癒 A5：ally／5／heal 90
  - → `hero-light-up` 祈光精通 M5 → hero-mend：powerPct 103／106／109／112／115
  - → `hero-prayer` 祈禱 A5：allies／9／heal 50
  - → `hero-purify` 淨光 A1：ally／3／cure
  - → `abyss-light` 深淵・光 A1 abyss：allies／16／heal 85，加上 cure
- 枷鎖：
  - `hero-shackle` 枷鎖 A5：enemy／4／atk −20 3 回合
  - → `hero-slow` 遲緩 A5：enemies／6／spd −15 3 回合
  - → `hero-expose` 破綻 A5：enemy／5／def −20 3 回合
  - → `hero-sleep` 沉眠 A1：enemy／5／sleep 0.5
  - → `abyss-chain` 深淵・鎖 A1 abyss：enemies／13／atk −20 4 回合，加上 def −20 4 回合
- 容量 97 點；Lv50 有 73 點加上免費的 1 級，可以點滿約 76%（見衝突第 10 點）。
- 本任務的 `SkillDef` 先不加 `abyss` 欄位，Task 6 再加。
- `PALETTES`、`CHAR_KEYSTONES`、`ULTIMATES`、`T.ui2.guild.roles` 的 `hero` 鍵由 Task 5 補上。在那之前只是型別缺口：`hero` 不在 `CHARACTER_IDS`，執行期不會讀到它們。

- [ ] **Step 1: 寫失敗的測試**（`data/hero.test.ts`；`EIGHT` 是 8 位原有同伴）
  - `hero base and growth are at least the companions' median on every stat`
  - `hero HP and DEF growth are 90% of the companions' best`：用 `toBeCloseTo`。
  - `hero growth total is the highest of every character`：與 `CHARACTER_IDS` 的每一位比較。
  - `'all' converts every primary at AFFINITY_MUL × ALL_AFFINITY_SHARE`：`convertPrimary({ str: 10, int: 10 }, 'all')` 的 atk 與 mag，透過 `CONVERT`／常數算出預期值。
  - `hero tree has 5 branches covering the five roles, tier 4 of each is an abyss node`：分支名稱依序是 `['劍技', '守護', '星術', '祈光', '枷鎖']`，階層 4 的 id 以 `abyss-` 開頭。
  - `hero tree fills between 60% and 80% at Lv50`：`(skillPoints(50, 'hero') + 1) / 容量` 介於 0.6 與 0.8 之間。
  - `no hero skill revives, always crits, executes or backstabs`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**（`TREES`、`NODES` 有變）
- [ ] **Step 5: commit**：`feat(starlantern): the hero's definition and five-branch tree`

### Task 5: 主角的天賦盤、關鍵天賦與「燈鑰」，加入角色清單

**Files:**
- Modify：
  - `data/talents.ts`：`PALETTES.hero`、`CHAR_KEYSTONES.hero`；盤面依 `rulesOf(c).boardCols` 建立；新增 `templateOf(c)`；`DEFAULT_KEYSTONES` 改成取前 `rulesOf(c).maxKeystones` 個。
  - `data/ultimates.ts`：`HERO_ULTIMATES`（5 種形態，依分支順序）；`ULTIMATES.hero = HERO_ULTIMATES[0]`。
  - `engine/progression.ts`：`heroMainBranch`、`ultimateFor`。
  - 改用 `ultimateFor` 的地方：`engine/battle.ts:267`（`actor.defId`、`actor.ranks`）、`ui2/scenes/battle.ts:126` 與 `:176`、`ui2/scenes/statusTabs.ts:658`（`m.id`、`m.tree`）。
  - `data/characters.ts`：`CHARACTER_IDS` 改成 `['hero', 'rin', ...]`，原本 8 人的順序不變。
  - `render/artPaths.ts`：`NO_ART_YET` 加入 `'hero'`。
  - `data/text.zh-TW.ts`：`T.ui2.guild.roles.hero`：「從迷宮深處走出來的人。什麼都能學，五條分支任意組合。」
- Test：
  - `data/talents.test.ts`：
    - 「24 normal nodes」改成 `BOARD_ROWS × rulesOf(c).boardCols`；
    - 「3 keystones」改成 `CHAR_KEYSTONES[c].length`；
    - `all.size` 改成逐一加總；
    - 「PALETTES has 6」改成同伴 6、主角 9；
    - 「6x4 grid」改成 `templateOf(c)` 與各自的欄數；
    - `DEFAULT_KEYSTONES` 改成 `slice(0, rulesOf(c).maxKeystones)`。
  - `data/data.test.ts`：角色數 9 → 10；affinity 表加上 `hero: 'all'`，允許的值加上 `'all'`。
  - `data/trees.test.ts`：`DEFAULT_CAPSTONE` 那一項把 hero 也列為例外（hero 是 0，本來就符合，確認即可）；長度已在 Task 3 改成 `CHARACTER_IDS.length`。
  - `engine/party.test.ts`：只要是對 `CHARACTER_IDS` 迴圈的測試，主角都會跟著跑，預期值照常由函式算出，不必改；roster 長度已在 Task 3 改成 `CHARACTER_IDS.length`。
  - `ui2/scenes/status.test.ts`：新增 `the hero's affinity reads 全能`：把 `'hero'` 加進 `recruited` 並換進陣型，「能力」分頁顯示 `T.ui2.status.affinity(T.ui2.status.affinityAll)`。
  - `engine/sim.test.ts`：Task 3 的 kit 順序測試必須仍然是綠的（主角排在 `KIT_ORDER` 最後）。

**Interfaces:**
- `PALETTES.hero = ['str', 'hp', 'atk', 'wil', 'def', 'res', 'int', 'mag', 'agi']`
- `templateOf(c)`：主角是 6×6，第 r 列第 c 欄的值是 `(6r + c) % 9`，所以每個屬性正好出現 4 次；同伴照舊是 `TEMPLATE`。
- `CHAR_KEYSTONES.hero = ['regen', 'taunt-guard', 'last-stand', 'crit-tp', 'opening-gauge']`，關鍵天賦所在的列仍是 `BOARD_ROWS`。
- `HERO_ULTIMATES`：都低於對應同伴的絕技（Task 9 會測）。
  - 劍技 `ult-hero-sword` 燈鑰・斬：enemy／物 atk 340 近戰
  - 守護 `ult-hero-guard` 燈鑰・守：allies／def +30、res +30 4 回合
  - 星術 `ult-hero-star` 燈鑰・星：enemies／雷 mag 190
  - 祈光 `ult-hero-light` 燈鑰・光：allies／heal 180，加上 cure
  - 枷鎖 `ult-hero-chain` 燈鑰・鎖：enemies／atk −25、def −25 4 回合
  - 「燈鑰・天燈」的升級屬於 6b。
- `heroMainBranch(ranks: Record<string, number>): number`：主角每條分支持有的等級總和（免費的 1 級也算）最多的那條；同分取索引小的。
- `ultimateFor(id: CharacterId, ranks?: Record<string, number>): UltimateDef`：主角回傳 `HERO_ULTIMATES[heroMainBranch(ranks ?? {})]`，其他人回傳 `ULTIMATES[id]`。

- [ ] **Step 1: 寫失敗的測試**
  - `talents.test.ts`：`the hero's board is 6x6 with 5 keystones and holds 3`：`raiseTalent` 可以拿到第 3 個關鍵天賦，第 4 個回傳 `keystones`；同伴的第 3 個仍回傳 `keystones`。
  - `progression.test.ts`：`the hero's ultimate follows his deepest branch`：
    - 新主角（只有免費的斬擊）是劍技形態；
    - 祈光投 3 點後是祈光形態；
    - 劍技與祈光同分時是劍技形態。
  - `engine/battle.test.ts`：`the hero's ultimate is the form of his ranks`：主角 `ranks` 偏向星術時，log 的 `ultimate` 是 `ult-hero-star`。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): the hero's talent board and Lantern Key, on the roster`

### Task 6: 深淵終極：碎片解鎖、兩個終極、深度加成

**Files:**
- Modify：
  - `data/hero.ts`：`ABYSS`、`ABYSS_UNLOCK`。
  - `engine/types.ts`：`SkillDef.abyss?: true`。
  - `data/skills.ts`：5 個 `abyss-*` 技能加上 `abyss: true`。
  - `engine/progression.ts`：`RaiseFail` 新增 `'abyss'`；`check`／`canRaiseNode`／`raiseNode`／`validBuild` 新增 `memories` 參數；`rankMod` 的換算抽成 `pctMod`。
  - `engine/scaling.ts`：`abyssPct`。
  - `engine/battle.ts`：`createBattle` 的選項 `abyss`、`BattleState.abyss`；施放深淵技能時套用。
  - `engine/game.ts`：`raiseNode` 傳 `memories = 0`，加上註解「6b 改成 `state.memories.hero`」；`startBattle` 傳 `depth: this.floor`。
  - `data/text.zh-TW.ts`：技能樹不能投點的理由加上 `abyss: (n: number) => \`深淵尚未甦醒（需要 ${n} 片記憶）\``。
  - `ui2/scenes/statusTabs.ts`：顯示 `'abyss'` 理由時，傳入 `ABYSS_UNLOCK[分支]`。
- Test：`engine/progression.test.ts`、`engine/battle.test.ts`、`engine/save.test.ts`

**Interfaces:**
- `ABYSS = { perDepth: 1, cap: 30 }`（百分比；spec §4.2：每層 +1%，最多 +30%）
- `ABYSS_UNLOCK = [2, 4, 6, 8, 10]`：依分支順序（劍技、守護、星術、祈光、枷鎖）解鎖深淵終極所需的主角記憶片數。(implementer's call → fixed here)
- `RaiseFail = 'unknown' | 'max' | 'req' | 'gate' | 'abyss' | 'capstone' | 'points'`：`'abyss'` 只用在主角的階層 4 節點，條件是 `memories < ABYSS_UNLOCK[branch]`。
- `canRaiseNode(m, node, memories = 0)`、`raiseNode(m, node, memories = 0)`、`validBuild(id, level, tree, talents, memories = 0)`
- `pctMod(skill: string, pct: number): SkillMod | undefined`：就是現在 `rankMod` 裡「傷害、回復、砲台用 powerPct；純增益用 buffPct」的那段規則；`rankMod` 改成呼叫它。
- `abyssPct(depth: number): number = min(ABYSS.cap, ABYSS.perDepth × max(0, depth))`
- `createBattle({ ..., depth?: number; abyss?: number })`：深淵的預設值只在這裡算一次，`abyss ?? abyssPct(depth ?? scale?.depth ?? 1)`，寫進 `BattleState.abyss?: number`。`depth` 給不帶 `scale` 的戰鬥用（本道第 3 層的劇情頭目）；`abyss` 只給模擬用來強制上限。
- `Game.startBattle` 只傳 `depth: this.floor`，不自己呼叫 `abyssPct`。
- 施放技能時，如果 `def.abyss` 而且 `s.abyss > 0`，就在 `skillFor` 之後再套用 `pctMod(def.id, 100 + s.abyss)`。

- [ ] **Step 1: 寫失敗的測試**
  - `progression.test.ts`：
    - `an abyss node waits for its memories`：主角 Lv50，劍技階層 0–3 都有點；`memories = ABYSS_UNLOCK[0] − 1` 時回傳 `abyss`，等於 `ABYSS_UNLOCK[0]` 時回傳 null。
    - `the hero holds two ultimates, not three`：`memories = 10`，第 3 個回傳 `capstone`。
    - `a companion still holds one`：現有的測試保留。
  - `save.test.ts`：`a hero capstone without memories is corrupt`：主角從 Task 5 起就在 roster 裡，所以把存檔裡的主角設成 Lv50，tree 是 `{ 'hero-slash': 5, 'hero-sword-up': 5, 'hero-cleave': 5, 'hero-sunder': 5, 'abyss-sword': 1 }`，回報 `corrupt`；另外斷言同一份 tree 的 `validBuild('hero', 50, tree, {}, 10)` 為真。
  - `battle.test.ts`：
    - `an abyss skill grows with depth and stops at the cap`：同一個 rng 下，`abyss: 10` 的傷害是 `abyss: 0` 的 `1 + 10 / 100` 倍（誤差在 floor 之內）；`createBattle` 在 depth 50 時，`abyss` 等於 `ABYSS.cap`。
    - `abyss leaves other skills alone`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): abyss capstones gated by the hero's memories`

### Task 7: 主角的流派配點

**Files:**
- Modify：`data/hero.ts`（`HeroBuild`、`HERO_BUILDS`）、`engine/progression.ts`（`heroTree`、`heroTalents`；`defaultTree`／`defaultTalents` 遇到 `hero` 時改呼叫它們）
- Test：`engine/progression.test.ts`

**Interfaces:**
- `type HeroBuild = 'balanced' | 'sword' | 'mage' | 'healer' | 'tank'`
- `HERO_BUILDS: Record<HeroBuild, { branches: number[]; talents: AnyStat[]; row: Row; weapon: string }>`（spec §4.5；implementer's call → fixed here）
  - balanced：`[0, 1, 3]`、`['str', 'wil']`、front、`iron-sword`
  - sword：`[0]`、`['str', 'atk']`、front、`iron-sword`
  - mage：`[2]`、`['int', 'mag']`、back、`wooden-staff`
  - healer：`[3]`、`['wil', 'hp']`、back、`wooden-staff`
  - tank：`[1]`、`['hp', 'def']`、front、`thorn-spear`
- `heroTree(level: number, build: HeroBuild = 'balanced', memories = 0): Record<string, number>`
  - 一次投 1 點，順序是：流派的分支輪流投（分支內取 (等級, 階層) 最低、目前可以投的節點），階層 4 也算在內；
  - 流派的分支都投不下時，依分支索引順序投其他分支；
  - 每一點都用 `check(..., memories)` 判斷，所以深淵終極自然只在記憶足夠時才會點。
- `heroTalents(level: number, build: HeroBuild = 'balanced'): Record<string, number>`
  - 可以拿的話，先拿 `DEFAULT_KEYSTONES.hero`；
  - 否則取屬性在 `build.talents` 裡、可以投的一般節點中 (等級, 列, 欄) 最低的；
  - 都沒有時，取任何可以投的一般節點中最低的。
- `defaultTree('hero', L)` 等於 `heroTree(L, 'balanced', 0)`；`defaultTalents('hero', L)` 等於 `heroTalents(L, 'balanced')`。

- [ ] **Step 1: 寫失敗的測試**
  - `balanced spreads over sword, guard and light`：Lv20 時，分支 0、1、3 的投入（不含免費的 1 級）兩兩相差不超過 1，分支 2、4 是 0。
  - `a pure build stays in its branch until it is full`：
    - 測試先算出 `cap2` = 分支 2 階層 0–3 的 `maxRank` 總和（目前是 20），再取 `L` = 滿足 `skillPoints(L, 'hero') ≤ cap2` 的最大等級（目前是 Lv14，19 點；Lv15 是 21 點會溢出）；
    - 斷言 mage 在 `L` 時只有分支 2 有點（另有免費的斬擊 1 級）；
    - 再斷言 mage 在 `L + 1` 時溢出的點數落在分支 0（索引最小的其他分支）。
  - `no capstone without memories; a build takes its own with them`：balanced 在 Lv50、`memories = 0` 時沒有任何 `abyss-*`；`memories = 10` 時剛好持有 2 個，而且都在分支 0、1、3 之內。
  - `every build is a legal build`：五種流派在 L = 1、10、30、50 時，`validBuild('hero', L, tree, talents, memories)` 都為真。
  - `balanced talents lean on STR and WIL`：Lv30 時，投在 str 與 wil 節點的點數至少占一般節點點數的一半。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): hero builds for the default and the simulation`

### Task 8: 武器種類、主角的普通攻擊與武器專精

**Files:**
- Modify：
  - `engine/types.ts`：`WeaponKind`；`EquipDef.weaponKind?: WeaponKind`。
  - `data/equipment.ts`：7 把武器加上種類；`WEAPON_KINDS`、`WEAPON_MASTERY_PCT`。
  - `engine/combatant.ts`：`Combatant` 新增 `attackScale?: 'atk' | 'mag'`、`weaponKind?: WeaponKind`。
  - `engine/battle.ts`：`fromMember` 為 `weaponMaster` 的角色依武器設定 `melee`、`attackScale`、`weaponKind`；普通攻擊用 `actor.attackScale ?? 'atk'`；`skillFor` 加上專精。
  - `render/artPaths.ts`：`effectFor(ev, actorDefId, weaponKind?)`。
  - `render/battleCues.ts`：把出手者的 `weaponKind` 傳進 `effectFor`。
- Test：`data/data.test.ts`、`engine/battle.test.ts`、`render/artPaths.test.ts`

**Interfaces:**
- `type WeaponKind = 'sword' | 'spear' | 'dagger' | 'bow' | 'staff' | 'tome' | 'scimitar' | 'wrench'`
- 底材：`iron-sword` sword、`crystal-blade` dagger、`star-saber` scimitar、`thorn-spear` spear、`hunter-bow` bow、`wooden-staff` staff、`frost-staff` staff。魔導書與扳手沒有底材（見衝突第 5 點）。
- `WEAPON_KINDS: Record<WeaponKind, { melee: boolean; scale: 'atk' | 'mag'; fx: FxKey; mastery: number[] }>`（spec §4.3；implementer's call → fixed here）
  - sword：近戰、atk、slash、`[0]`
  - scimitar：近戰、atk、slash、`[0]`
  - dagger：近戰、atk、slash、`[0, 4]`
  - spear：近戰、atk、pierce、`[1]`
  - wrench：近戰、atk、strike、`[1]`
  - bow：遠程、atk、pierce、`[4]`
  - staff：遠程、mag、fire、`[2, 3]`
  - tome：遠程、mag、thunder、`[2, 3]`
- `WEAPON_MASTERY_PCT = 10`
- 沒拿武器的主角：近戰、atk、沒有專精。同伴一律維持 `CharacterDef.melee`，沒有 `attackScale`、`weaponKind`。
- `skillFor(c: Pick<Combatant, 'powers' | 'ranks' | 'weaponKind'>, id)`：技能的節點屬於 `hero`，而且 `WEAPON_KINDS[c.weaponKind].mastery` 含有該節點的分支時，在樹的改寫之後、身上特效之前，加上 `pctMod(id, 100 + WEAPON_MASTERY_PCT)`。
- `effectFor`：`weaponKind` 有值、而且是物理傷害時，回傳 `WEAPON_KINDS[weaponKind].fx`；其他情況照舊。

- [ ] **Step 1: 寫失敗的測試**
  - `data.test.ts`：`every weapon base has a kind and every kind grants the hero mastery somewhere`。
  - `battle.test.ts`：
    - `the hero with a staff attacks from range with MAG`：主角在後排拿 `wooden-staff`，`createBattle` 後 `melee` 為 false、`attackScale` 是 mag；普通攻擊造成的傷害與他的 mag 成正比（把 mag 加倍，傷害約加倍）。
    - `the hero with a sword attacks in melee with ATK`
    - `companions ignore their weapon`：noel 拿 `iron-sword`，`melee` 仍然是 false，沒有 `attackScale`。
    - `mastery adds WEAPON_MASTERY_PCT to the matching branch only`：拿 staff 時，`skillFor` 的 `hero-mend` 威力是沒拿武器時的 `1 + WEAPON_MASTERY_PCT / 100` 倍；`hero-slash` 不變。
  - `artPaths.test.ts`：`the hero's hit effect follows his weapon`：spear → pierce，staff → fire，沒有武器 → slash。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): weapon kinds, the hero's attack and weapon mastery`

### Task 9: 夥伴不被取代：峰值比較

**Files:**
- Modify：`data/hero.ts`：`HERO_PEAK_SHARE = 0.85`（已在 Task 4 建立，這裡只確認沒被改）。
- Test：`data/hero.test.ts`（新增下列各項）

**測試方法**（只寫在這裡，測試照著做）：
- `maxed(id)`：該角色技能樹每個節點都在最高等級的 ranks。
- `peak(id, measure)`：對該角色樹裡的每個主動技能，取 `skillFor({ powers: [], ranks: maxed(id), weaponKind }, skill)` 的 `measure` 最大值。
  - 主角對 `WEAPON_KINDS` 的每一種（含沒有武器）都算一次，取最大值，所以專精已經算在內；
  - 深淵的深度加成不算在內（spec §4.6：上限來自深淵）。
- 度量：
  - 單體回復（target `ally` 的 heal）、全體回復（target `allies` 的 heal）；
  - 全隊防禦提升（target `allies` 的 def buff pct）、自身防禦提升（target `self` 的 def buff pct）；
  - 魔法傷害，單體與全體分開算（scale `mag`，`power × hits`）；
  - 弱化幅度（打在敵方的負 buff 的絕對值）；
  - 物理單體傷害（scale `atk`、target `enemy`，`power × hits`）。

- [ ] **Step 1: 寫測試**
  - `the hero's best heal is at most HERO_PEAK_SHARE of Selene's, single and all, and he never revives`
  - `the hero's guard is at most HERO_PEAK_SHARE of Scarlet's, self and allies`
  - `the hero's spells are at most HERO_PEAK_SHARE of Noel's, single and all`
  - `the hero's debuffs are at most HERO_PEAK_SHARE of Noel's`
  - `the hero's single physical hit is at most HERO_PEAK_SHARE of the best of Sylvie's and Chizuru's`
  - `the hero learns no companion's skill`：`NODES` 裡擁有者是 `hero` 的節點，`skill` 也都屬於 `hero`；`HERO_ULTIMATES` 的 id 不在 `ULTIMATES` 的其他角色之中。
  - `every Lantern Key form is below its companion's ultimate`：劍技 < `ULTIMATES.sylvie` 的威力；星術 < noel；祈光的回復 < selene；守護的 buff pct < safira 的最大 buff pct；枷鎖的弱化幅度 < safira 的最大 buff pct。
- [ ] **Step 2: 執行**：`rtk proxy npx vitest run src/scripts/games/starlantern/data/hero.test.ts`
  - 預期直接通過，因為 Task 4、5 的數字就是照這個上限定的。
  - 紅了只能下修主角那一項技能或絕技的數值，不可以改 `HERO_PEAK_SHARE`，也不可以動同伴的數值。
  - 本任務的測試是之後所有調整的硬性護欄。目前餘裕很小（單體回復約 160／上限 165、自身守護約 46／51、物理單體約 275／289）：Task 19b、19c、20 不可以為了平衡帶把 `hero-mend`、`hero-light-up`、`hero-guard`、`hero-guard-up`、`abyss-sword` 或其他主角技能調過這裡的上限；需要這樣才過的帶，停下來回報。
- [ ] **Step 3: commit**：`test(starlantern): the hero never outdoes a specialist`

### Task 10: 依出戰人數補正敵人

**Files:**
- Modify：`engine/scaling.ts`（`PARTY_SCALE`、`GROUP_CAP`、`FIRST_DEPTH_CAP`、`partyScale`、`groupCap`；把現有的 `mul` 改成 `export`）、`engine/battle.ts`（`createBattle` 的選項 `extra`、`BattleState.partyScale`）、`engine/game.ts`（`startBattle` 新增 `extra = 0`）
- Test：`engine/scaling.test.ts`、`engine/battle.test.ts`

**Interfaces:**
- `type PartySize = 2 | 3 | 4 | 5`；`sizeOf(n: number): PartySize = clamp(n, 2, 5)`。只有主角 1 人上陣時，照 2 人那一格查。
- `PARTY_SCALE: Record<PartySize, number> = { 2: 0.64, 3: 0.76, 4: 0.88, 5: 1 }`：初值就是 spec §9.4 第 1 點的 `0.4 + 0.12n`。每一格各自是旋鈕，`PARTY_SCALE[5]` 固定是 1，不是旋鈕。
- `GROUP_CAP: Record<PartySize, number> = { 2: 3, 3: 4, 4: 5, 5: 6 }`：初值就是 spec §9.4 第 2 點的 `n + 1`。
- `FIRST_DEPTH_CAP: Partial<Record<PartySize, number>> = {}`：只在 depth 1 生效、覆寫 `GROUP_CAP` 的那一格；初值是空的，Task 19b 可以用它把 2 人在第 1 層的上限調低。
- `partyScale(n: number): number = PARTY_SCALE[sizeOf(n)]`
- `groupCap(n: number, depth: number): number = (depth === 1 ? FIRST_DEPTH_CAP[sizeOf(n)] : undefined) ?? GROUP_CAP[sizeOf(n)]`
- `createBattle`：
  - `n` 是 `activeIds(o.party).length`，不論 HP。
  - 非頭目戰時，`enemyIds` 先截成前 `groupCap(n, depth) + (o.extra ?? 0)` 隻；`depth` 是 `o.depth ?? o.scale?.depth ?? 1`（Task 6 的同一個值）。`extra` 只有救援戰傳 1（見衝突第 9 點）。
  - 每隻敵人在 `empower` 之後，hp、atk、mag 乘上 `k = partyScale(n)`，用 export 出來的 `mul`；`k === 1` 時完全不動。
  - 寫進 `BattleState.partyScale?: number`。
  - 經驗值與金錢不補正。

- [ ] **Step 1: 寫失敗的測試**
  - `scaling.test.ts`：
    - `the party-size tables`：`PARTY_SCALE[5]` 是 1；每一格都在 (0, 1]，而且人數越多不會越小；`partyScale(1)` 等於 `partyScale(2)`；`partyScale(9)` 等於 `partyScale(5)`。
    - `groupCap reads the first-depth override only at depth 1`：暫時把 `FIRST_DEPTH_CAP[2]` 設成 2（測試結束還原），depth 1 是 2、depth 2 是 `GROUP_CAP[2]`。
  - `battle.test.ts`：
    - `a full party fights exactly as before`：
      - Step 1 先在**改動前**的程式上，用 `partyAt(depthLevel(4))`（此時就是舊的 5 人）、種子 1–3，對本道 depth 4 的每一組遇敵，照 `simBattle` 的寫法在測試裡自己跑 `createBattle` 加 `resolveRound`／`choose` 的迴圈打完整場；記下每場的 `outcome`、回合數，以及整場 `log` 的 `JSON.stringify` 經測試檔裡的 `hash(s: string)` 算出的值。
      - 把這些基準寫進測試；改動之後，同樣的戰鬥必須逐項相同。
    - `two members face weaker enemies`：每隻敵人的 hp、atk、mag 等於 5 人時的值經 `mul(..., { hp: k, atk: k, mag: k })`，`k = partyScale(2)`。
    - `a downed member still counts`：2 人中 1 人 hp 0，`partyScale` 仍是 `partyScale(2)`。
    - `the group is trimmed to groupCap`：2 人時 4 隻的一組只剩 `GROUP_CAP[2]` 隻；`extra: 1` 時多 1 隻。
    - `a boss fight is scaled but never trimmed`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**（包括 balance；目前模擬都是 5 人，必須全綠而且數字不變）
- [ ] **Step 5: commit**：`feat(starlantern): enemies scale with the party's size`

### Task 11: 模擬可以指定成員與主角流派（預設維持舊的 5 人）

**Files:**
- Modify：
  - `engine/party.ts`：`STANDARD_LINEUP`、`LEGACY_LINEUP`、`partyWith`、`placeInGrid`。
  - `engine/sim.ts`：`Lineup`；`partyAt`、`kitParty`、`simBattle`、`winRate` 接受成員設定。
  - `engine/testing.ts`：`fullParty(ids = STANDARD_LINEUP)`，回傳 `partyWith(ids)`，給 Task 12a、12b 修測試用。
- Test：`engine/sim.test.ts`、`engine/party.test.ts`

**Interfaces:**
- `STANDARD_LINEUP: CharacterId[] = ['hero', 'rin', 'chizuru', 'noel', 'selene']`（spec §9.4 第 6 點）
- `LEGACY_LINEUP: CharacterId[] = ['scarlet', 'chizuru', 'liz', 'noel', 'selene']`
- `placeInGrid(grid: (CharacterId | null)[], id: CharacterId, row: Row): (CharacterId | null)[]`：在一份複本上，把 id 放進該排第一個空格；該排滿了，依序找中排、另一排。調用的人負責先確認上陣不到 5 人。
- `partyWith(ids: CharacterId[], heroRow: Row = 'front', grid?: (CharacterId | null)[]): Party`：`roster` 是全部角色的 `newMember`，`recruited = [...ids]`；有給 `grid` 就照用，否則依 ids 的順序呼叫 `placeInGrid`；主角的排是 `heroRow`，其他人是 `CHARACTERS[id].row`。
- `LEGACY_GRID = ['scarlet', 'chizuru', 'liz', null, null, null, 'noel', null, 'selene']`：舊 `newParty()` 的陣型。只要 ids 是 `LEGACY_LINEUP`、沒有指定 grid，`partyWith`、`partyAt`、`fullParty` 一律用它，讓縱列、十字範圍攻擊打到的人和以前一樣，平衡逐位元不變。
- `interface Lineup { ids?: CharacterId[]; heroBuild?: HeroBuild; heroRow?: Row; memories?: number; abyss?: number }`
- `partyAt(level, lineup: Lineup = {})`：
  - 隊伍是 `partyWith(ids ?? LEGACY_LINEUP, heroRow ?? HERO_BUILDS[heroBuild ?? 'balanced'].row)`；
  - roster 的每一個人都設成該等級，同伴用 `defaultTree`／`defaultTalents`，主角用 `heroTree(level, build, memories ?? 0)`／`heroTalents(level, build)`。
- `kitParty(level, depth, seed, rarity?, enhance = 0, lineup: Lineup = {})`：
  - 仍依 Task 3 的 `KIT_ORDER` 替 roster 的每一位抽裝備，抽數與順序不變；
  - 主角的武器欄照常先抽一件（`rollTier` 加 `rollItem`，消耗同樣的亂數），然後丟掉，換成 `rollItem(同一個 rng, { 同樣的 uid、ilvl、rarity, slot: 'weapon', base: HERO_BUILDS[build].weapon })`。主角排在 `KIT_ORDER` 的最後，所以這次多抽的亂數不會影響任何其他成員。
- `simBattle(party, enemyIds, boss, seed, scale?, altar?, ai = 'skill', abyss?: number)`：`abyss` 傳給 `createBattle`。
- `winRate(..., kitEnhance = 0, lineup: Lineup = {})`：把 `lineup` 傳給 `partyAt`／`kitParty`，`lineup.abyss` 傳給 `simBattle`。

- [ ] **Step 1: 寫失敗的測試**
  - `party.test.ts`：
    - `partyWith puts each member on their own row`：`STANDARD_LINEUP` 的 hero、rin、chizuru 在前排，noel、selene 在後排；`activeIds` 依序是 ids 的排列結果。
    - `placeInGrid spills to the middle row`：前排已滿時，第四位前排角色進中排。
    - `the legacy five stand where they always stood`：`partyWith(LEGACY_LINEUP)` 的 `grid` 等於 `LEGACY_GRID`，`recruited` 與 roster 等於目前的 `newParty()`。
  - `sim.test.ts`：
    - `the default simulation party is the legacy five`：`partyAt(6).recruited` 等於 `LEGACY_LINEUP`。
    - `a lineup and a hero build are honoured`：`partyAt(10, { ids: STANDARD_LINEUP, heroBuild: 'mage' })` 的主角在後排，tree 等於 `heroTree(10, 'mage', 0)`。
    - `kitParty arms the hero for his build`：mage 的主角武器底材是 `wooden-staff`。
    - `the hero's fixed weapon moves nobody else's kit`：同一個 seed，`kitParty(..., { heroBuild: 'mage' })` 與 `kitParty(...)`（balanced）比較，除了主角之外每一位身上的每一件都相同；Task 3 的 kit 順序測試仍然是綠的。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**（balance 必須不變：預設仍是舊的 5 人，而且 kit 的抽數不變）
- [ ] **Step 5: commit**：`feat(starlantern): simulate any lineup and hero build`

### Task 12a: 兩人開局（遊戲入口）、存檔 v7、回復藥 5 瓶

本任務讓玩家的新遊戲變成兩人開局，但 `newParty()`／`newGame()` 的**預設值**仍是舊的 5 人，所以其餘約 30 個測試檔在本任務維持原狀；Task 12b 才翻轉預設值並遷移那些測試。

**Files:**
- Modify：
  - `engine/party.ts`：`START_LINEUP: CharacterId[] = ['hero', 'rin']`；`newParty(start: CharacterId[] = LEGACY_LINEUP): Party` 改成 `partyWith(start)`；刪掉 `STARTING_RECRUITS`。
  - `engine/state.ts`：`SAVE_VERSION = 7`；`START_ITEMS = { potion: 5, 'return-lamp': 1 }`；`newGame(rng, forgeSalt, start: CharacterId[] = LEGACY_LINEUP)`。
  - `engine/game.ts`：建構子新增參數 `start?: CharacterId[]` 傳給 `newGame`；`Game.boot`（沒有可用存檔時）與 `Game.fresh` 一律傳 `START_LINEUP`。
  - `engine/save.ts`：`recruited` 不可以有重複；`validBuild` 傳 `memories = 0`，加註「6b 改成存檔裡的主角記憶片數」。
- Test（會壞的檔案與改法）：
  - `engine/game.test.ts`：呼叫 `Game.boot`（空存檔）或 `Game.fresh` 的測試，若依賴舊的 5 人，改成斷言兩人開局或在建立後設 `g.state.party = fullParty(LEGACY_LINEUP)`；`g.state.inventory = { potion: 3, moss: 10 }` 這類自己設定的 fixture 不用改。
  - `ui2/scenes/shop.test.ts`：「`potion` 是 `3 + 5`」改成 `START_ITEMS.potion + 5`。
  - `ui2/scenes/forge.test.ts`：「`potion` 是 3」改成 `START_ITEMS.potion`。
  - `engine/save.test.ts`：版本號。
  - `ui2/scenes/title.test.ts`：若斷言新遊戲的隊伍，改成兩人。

- [ ] **Step 1: 寫失敗的測試**
  - `party.test.ts`：`the starting lineup is the hero and Rin at the front`：`newParty(START_LINEUP)` 的 `recruited` 與 `activeIds` 都是 `['hero', 'rin']`，roster 有 `CHARACTER_IDS` 的每一位。
  - `game.test.ts`：`a fresh game starts with two and carries START_ITEMS`：`Game.fresh(...)` 的 `recruited` 是 `START_LINEUP`，inventory 等於 `START_ITEMS`，`START_ITEMS.potion` 是 5。
  - `save.test.ts`：
    - `a v6 save reports version`
    - `a repeated recruit is corrupt`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作，並依 Files 修正會壞的測試**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): a new game starts with the hero and Rin`

### Task 12b: 預設值改成兩人，遷移依賴舊開局的測試

**Files:**
- Modify：`engine/party.ts`（`newParty` 的預設值改成 `START_LINEUP`）、`engine/state.ts`（`newGame` 的預設值改成 `START_LINEUP`）
- Test（會壞的檔案與改法）：
  - 原則：測試的主題**不是**開局隊伍時，fixture 改成 `s.party = fullParty()`（或 `game.state.party = fullParty()`）。原本點名 scarlet 或 liz 的地方，改成 `STANDARD_LINEUP` 裡職能相同的人：scarlet → hero，liz → rin；或用 `fullParty(LEGACY_LINEUP)` 保留原本的人。不可以改測試的意圖。用內容找要改的地方，以下行號是 base 82830584 時的參考。
  - `engine/party.test.ts`：依賴開局 5 人的測試（招募、`awardExp` 分經驗，base 第 139–150、184–189 行）改成先 `fullParty(LEGACY_LINEUP)`。
  - `engine/save.test.ts`：「六人上陣」（base 第 61 行）的 fixture 改成先 `fullParty()`。
  - `engine/game.test.ts`：base 第 686、1103、1132–1144、1225、1263 行，以及其他依賴 `recruited[0]`、`scarlet`、`liz` 的地方。
  - `engine/battle.test.ts`：base 第 22、36、184、218、310、319 行（scarlet、liz、noel 不再在場上），改用 `fullParty(LEGACY_LINEUP)`。
  - `engine/skills.test.ts`：base 第 134、140 行（chizuru），同上。
  - `engine/scaling.test.ts`：base 第 192、291 行，兩人的 `newParty()` 現在會吃到 `partyScale(2)`；改用 `fullParty(LEGACY_LINEUP)`，讓它們繼續測 5 人、沒有補正的敵人。
  - `engine/town.test.ts`：base 第 256、284–286 行。
  - `engine/events.test.ts`：base 第 40 行（若斷言人數，改用 `fullParty()`）。
  - `engine/forge/cost.test.ts`、`craft.test.ts`、`economy.test.ts`、`forge.test.ts`、`engine/loot/bag.test.ts`：凡是讀 `recruited[0]` 或假設有 5 人的。
  - `ui2/scenes/status.test.ts`：翻頁順序（base 第 95–99 行）改成 `fullParty(LEGACY_LINEUP)` 的 recruited 順序。
  - `ui2/scenes/forge.test.ts`：base 第 39、53、256、385–416、754–779 行。
  - `ui2/scenes/formation.test.ts`、`guild.test.ts`、`inn.test.ts`、`gate.test.ts`、`event.test.ts`、`dungeon.test.ts`、`equip.test.ts`、`battle.test.ts`、`town.test.ts`、`shop.test.ts`、`facility.test.ts`、`clear.test.ts`、`title.test.ts`、`settings.test.ts`、`render/MapView.test.ts`、`ui2/minimap.test.ts`：跑全套找出紅的，套用上面的原則。
  - `tests/e2e/starlantern.spec.ts`：要翻到諾艾兒或絲嘉蕾的測試（用「諾艾兒」「絲嘉蕾」「`roster.noel`」找；base 第 467–472、540–557、575–581、621 行），先用 debug hook 把 `recruited` 設成 `LEGACY_LINEUP` 加上主角與凜、`grid` 設成主角加上舊的前排與後排，再翻頁；翻頁迴圈的上限 8 改成 `recruited.length`。base 第 839–842 行已經自己設定 recruited，不用改。

- [ ] **Step 1: 改預設值，執行全套，列出紅的測試**
- [ ] **Step 2: 依 Files 的原則逐檔修正**；全套出現本表沒列到的紅燈時，照 Global Constraints 停下來回報。
- [ ] **Step 3: 執行全套與 e2e，確認全部通過**
- [ ] **Step 4: commit**：`test(starlantern): fixtures no longer lean on the old starting five`

### Task 13: 主角固定在場，編隊經過 Game 存檔

**Files:**
- Modify：
  - `engine/party.ts`：`setFormation` 新增理由 `'no-hero'`。
  - `engine/save.ts`：`recruited` 必須含有 `hero`，`grid` 必須含有 `hero`。
  - `engine/game.ts`：`setFormation`。
  - `ui2/scenes/formation.ts`：改呼叫 `game.setFormation`；主角那一格不加「移除」選項。
  - `data/text.zh-TW.ts`：`T.reasons['no-hero'] = '洛恩必須出戰'`；`'not-recruited'` 的文字改成「尚未遇見」。
- Test：
  - `engine/party.test.ts`、`engine/save.test.ts`、`engine/game.test.ts`、`ui2/scenes/formation.test.ts`：新增下方的測試。
  - Task 12b 改用 `fullParty(LEGACY_LINEUP)`（沒有主角）的測試，凡是會存檔後讀回、或呼叫 `setFormation` 的，現在會得到 `corrupt` 或 `no-hero`：改用 `fullParty()`（標準滿編，含主角），或在 `LEGACY_LINEUP` 的 fixture 裡用主角換掉 scarlet。用 `grep -rn "LEGACY_LINEUP" src/scripts/games/starlantern --include=*.test.ts` 找出候選，跑全套確認。

**Interfaces:**
- `export type SetFormationFail = 'size' | 'not-recruited' | 'duplicate' | 'empty' | 'too-many' | 'no-hero'`，`setFormation` 的失敗型別改用它。
- `setFormation(p, grid)`：檢查順序是 `size`、`not-recruited`、`duplicate`、`empty`、`too-many`，最後才是 `no-hero`：陣型裡沒有 `hero` 就回傳 `{ ok: false, reason: 'no-hero' }`。所以現有的 empty 與 too-many 測試照舊成立，不用改。
- `Game.setFormation(grid): { ok: true } | { ok: false; reason: SetFormationFail | 'invalid' }`
  - 只在 town 與 map 階段有效，其他回傳 `invalid`；
  - 在 town 成功後立刻存檔，失敗時 `notice = 'save-failed'`；在 map 不存檔（照 `raiseNode` 的做法）。

- [ ] **Step 1: 寫失敗的測試**
  - `party.test.ts`：
    - `the hero cannot leave the field`：從 `fullParty()` 出發，把主角移除、換成預備的人，都回傳 `no-hero`。
    - `empty and too-many still win over no-hero`：全空的陣型仍回傳 `empty`；六人而且沒有主角的陣型仍回傳 `too-many`。現有的 empty、too-many 測試保持原樣。
  - `save.test.ts`：`a save without the hero on the field, or not recruited, is corrupt`
  - `game.test.ts`：`setFormation saves in town`：用 `memoryStorage`，成功後存檔裡的 grid 就是新的；`no-hero` 時存檔不變。
  - `formation.test.ts`：
    - `the hero's cell offers no remove`
    - `a refused formation shows the reason`：用 debug 的方式送出沒有主角的陣型，訊息是 `T.reasons['no-hero']`。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): the hero always takes the field`

### Task 14: 相遇表、加入等級與 `meet`

**Files:**
- Create：`data/meetings.ts`、`data/meetings.test.ts`
- Modify：`engine/party.ts`（`joinLevel`、`meet`）
- Test：`engine/party.test.ts`

**Interfaces:**
- `MEETINGS: { id: CharacterId; region: RegionId; depth: number }[]`（spec §6）：
  - selene mainline 2、chizuru frost 3、safira blaze 3、sylvie mire 4、noel storm 4、bobby mainline 6、liz shade 6、scarlet iron 8
- `rescuesFor(region: RegionId, met: CharacterId[]): Record<number, CharacterId>`：該地區、還沒遇見的人，以深度為鍵。
- `favouredRegions(met: CharacterId[]): RegionId[]`：有還沒遇見的人、而且不是 mainline 的地區。
- `joinLevel(p: Party, depth: number): number`（spec §9.2；implementer's call → fixed here）
  - `levels` 是陣型上每一位的等級（不論 HP）；
  - `clamp(min(max(levels), max(round(平均), depthLevel(depth) − 2)), 1, MAX_LEVEL)`。
- `meet(p: Party, id: CharacterId, level: number): Party`
  - 已經在 `recruited` 裡就原樣回傳。
  - 否則 roster 的她換成 `{ ...newMember(id), level, tree: newTree(id), talents: {} }`，hp、tp 是該等級的上限；
  - `recruited` 加在最後；
  - 上陣不到 `MAX_ACTIVE` 人時，用 `placeInGrid` 放進她自己的排；否則留在預備。
  - 技能點與天賦點不自動分配。

- [ ] **Step 1: 寫失敗的測試**
  - `meetings.test.ts`：
    - `the eight companions are each met once, in a real region`
    - `rescuesFor drops whoever is met`：`rescuesFor('mainline', ['hero', 'rin'])` 是 `{ 2: 'selene', 6: 'bobby' }`；加入 selene 後只剩 `{ 6: 'bobby' }`。
  - `party.test.ts`：
    - `joinLevel averages the field, at least the depth level less two`
    - `joinLevel never passes the field's best`：兩人都是 Lv3，depth 8 時是 3。
    - `joinLevel stays within 1 and MAX_LEVEL`
    - `meet places her on the field while there is room, else on the bench`：兩人時她上陣；5 人時她只在 `recruited`，grid 不變。
    - `meet gives the free rank only and full HP`：`validBuild` 為真；`skillPointsLeft` 等於 `skillPoints(level)`。
    - `meeting someone already met changes nothing`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行 `engine/` 與 `data/` 的測試，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): meeting table, join level and meet`

### Task 15a: 求救房與傳送門的權重

**Files:**
- Modify：
  - `engine/map.ts`：`Tile` 加入 `'rescue'`。
  - `engine/dungeon/rooms.ts`：`Content.kind` 加入 `'rescue'`，`Content.who?: CharacterId`；`placeRescue`。
  - `engine/dungeon/run.ts`：`Run.rescues`；`newRun` 新增參數；`floorOf` 放求救房。
  - `engine/portals.ts`：`rollPortals(rng, favoured: RegionId[] = [])`。
  - `engine/state.ts`：`newGame` 傳 `favouredRegions(該局的開局成員)`。
  - `engine/game.ts`：`depart` 傳 `rescuesFor(...)`；`toTown`、`wipe` 傳 `favouredRegions(...)`。本任務踩到 `'rescue'` 格時，`move` 先當成一般地板（`walk()`），救援戰在 Task 15b。
- Test：`engine/dungeon/run.test.ts`、`engine/dungeon/rooms.test.ts`、`engine/portals.test.ts`、`engine/game.test.ts`

**Interfaces:**
- `newRun(seed, region, condition, startDepth, rescues: Record<number, CharacterId> = {})`
- `placeRescue(f: RunFloor, g: GenFloor, rng: Rng, who: CharacterId): void`
  - 在 `fillRooms` 之後呼叫，只改 `f`；
  - 房間的順序：沒有任何 content 的候選房間（不是入口也不是出口）優先，其次任何候選房間；在房間裡的 `'floor'` 格中用 rng 挑一格；
  - 沒有候選房間時（固定地圖的退路），取地圖上第一個 `'floor'` 格（逐列、由左到右）；
  - 放上 `'rescue'` 格與 `{ kind: 'rescue', at, room, who }`。
- `floorOf`：`run.rescues[depth]` 有值時，呼叫 `placeRescue(f, g, mulberry32(seed ^ RESCUE_SALT), who)`，`RESCUE_SALT = 0x6a09e667`。
- `Game.depart`：`newRun(..., rescuesFor(portal.region, this.state.party.recruited))`。
- `rollPortals(rng, favoured)`：
  - `favoured` 裡的地區權重 2，其他 1；
  - 所有候選的權重都相等時，必須沿用原本的 `Math.floor(rng() × others.length)`，讓現有的種子測試抽到同樣的結果；
  - 權重不等時：`r = rng() × 總權重`，依序扣掉。

- [ ] **Step 1: 寫失敗的測試**
  - `run.test.ts`：
    - `a rescue room waits on the meeting depth`：`newRun(seed, 'mainline', 'plain', 1, { 2: 'selene' })`，第 2 層有一個 `rescue` content，`who` 是 selene，格子是 `'rescue'`，與入口相連（BFS 可達）。
    - `same seed, same spot`：兩個相同參數的 run，求救房位置相同。
    - `the rest of the floor is untouched`：同一個種子下，有沒有求救房，其他 content 的種類與位置完全相同。
    - `no rescue for an empty table`
  - `rooms.test.ts`：`placeRescue falls back to the first floor tile on a roomless map`
  - `portals.test.ts`：
    - `equal weights draw exactly as before`：用同一個種子，`rollPortals(rng)` 與 `rollPortals(rng, 全部六個地區)` 結果相同。
    - `a favoured region turns up about twice as often`：只偏好 iron，抽 2000 次，iron 出現的次數介於其他地區平均值的 1.6 到 2.4 倍。
  - `game.test.ts`：
    - `a run carries the rescues of the companions not yet met`：兩人開局出發本道，`run.rescues` 是 `{ 2: 'selene', 6: 'bobby' }`；`meet` selene 之後再出發，只剩 `{ 6: 'bobby' }`。
    - `a met companion's room never comes back`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): rescue rooms and portals that favour the unmet`

### Task 15b: 救援戰

**Files:**
- Modify：`engine/game.ts`：`move` 踩到 `'rescue'` 時開戰；`submitRound`；`wipe`；`MoveResult` 新增 `{ kind: 'rescue'; who: CharacterId }`；`BattleEnd.met`。
- Test：`engine/game.test.ts`

**Interfaces:**
- `Game.move` 踩到 `'rescue'`：
  - 找出該格的 content，`group = encounterGroup(region, floor, rng)`；
  - `startBattle([...group, group[0]], false, true, undefined, 1)`；
  - 記下 `rescueAt = { at, who }`，回傳 `{ kind: 'rescue', who }`。
- `submitRound` 勝利時：
  - 照常 `awardExp` 之後（新加入的人不分這一場的經驗），`this.state.party = meet(party, who, joinLevel(party, this.floor))`；
  - 該格變成 `'floor'`；
  - `BattleEnd.met?: { id: CharacterId; level: number; benched: boolean }`，`benched` 表示她進了預備。
  - 逃跑、全滅時清掉 `rescueAt`，格子保留。

- [ ] **Step 1: 寫失敗的測試**（`game.test.ts`）
  - `stepping into a rescue room starts a fight with one extra enemy`：戰鬥的敵人數是 `min(group.length, groupCap(n, depth)) + 1`。
  - `winning the rescue meets her at the join level, on the field while there is room`：`BattleEnd.met` 正確；`recruited` 含有她；格子變成 floor。
  - `a full party benches her`
  - `fleeing or wiping leaves her unmet and the room in place`：同一個存檔再出發一次，求救房仍在。
  - Task 15a 的「踩到求救房當成地板」若有測試，改寫成本任務的行為。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): rescue fights`

### Task 16: 求救房的介面

**Files:**
- Modify：
  - `render/markers.ts`：`MarkerKind` 加入 `'rescue'`；`MARKER_GLYPH.rescue = '救'`；`LIVE` 加入 `'rescue'`。
  - `render/MapView.ts`：`ON_FLOOR` 加入 `'rescue'`；畫標記時查貼圖的那一行（`m.kind === 'chest' ? null : this.bank?.get(art.eventTile(m.kind))`），`rescue` 與 `chest` 一樣直接用 null，不呼叫 `bank.get`，改畫文字標記。
  - `data/text.zh-TW.ts`：
    - `T.ui2.rescue = { found: (name) => \`有人被怪物圍住了──是${name}！\`, joined: (name, lv) => \`${name}（Lv${lv}）加入了隊伍！\`, benched: (name, lv) => \`${name}（Lv${lv}）加入了隊伍，在公會待命。\` }`
    - `T.meet: Record<string, { before: string[]; after: string[] }>`：8 位各一筆，`before` 是 `[T.ui2.rescue.found(名字)]`，`after` 是 `[]`。這是 6c 要改寫的文案鍵。
  - `ui2/scenes/dungeon.ts`：`case 'rescue'`：依序 `say` 出 `T.meet[who].before` 的每一句，然後照 `'battle'` 的方式進入戰鬥。
  - `ui2/scenes/battle.ts`：`end.met` 有值時，在戰果的 `lines` 最後加上 `T.meet[id].after` 的每一句，以及 `joined` 或 `benched`。
- Test：`render/markers` 的測試在 `render/MapView.test.ts`；`ui2/scenes/dungeon.test.ts`、`ui2/scenes/battle.test.ts`、`data/data.test.ts`

- [ ] **Step 1: 寫失敗的測試**
  - `MapView.test.ts`：`a seen rescue room shows the 救 marker and asks for no art`：
    - 給 MapView 一個會記錄呼叫的 texture bank（照現有 MapView 測試建立 bank 的方式，包一層 spy）；
    - 斷言 `bank.get` 的參數裡沒有 `art.eventTile('rescue' as never)` 的 url（`/tiles/event-rescue.png`）；
    - 斷言畫出的標記文字含有 `MARKER_GLYPH.rescue`；`markersOf` 有 `rescue`。
    - 同一個測試裡放一個 `altar`，斷言 `bank.get` 有被呼叫 `art.eventTile('altar')`，證明 spy 確實接在真正的路徑上。
  - `dungeon.test.ts`：`stepping into a rescue room says the meeting line, then fights`
  - `battle.test.ts`：`a won rescue lists who joined`：結果視窗含有 `T.ui2.rescue.joined(...)`；進預備時是 `benched`。
  - `data.test.ts`：`every companion has meeting copy`：`MEETINGS` 的每一位都有 `T.meet[id]`，`before` 至少一句，而且沒有空字串。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): rescue rooms on the map and in battle`

### Task 17: 公會的「召回」

**Files:**
- Modify：
  - `engine/game.ts`：`recall`。
  - `engine/party.ts`：刪掉 `recruit`。
  - `ui2/scenes/guild.ts`：指令 `recruit` 改成 `recall`；清單與換人流程。
  - `data/text.zh-TW.ts`：`T.ui2.guild` 的 `recruit`、`ask`、`recruited` 換成：
    - `recall: '召回'`
    - `recallAsk: (name) => \`要讓 ${name} 回到隊伍嗎？\``
    - `swapWho: '要讓誰回公會待命？'`
    - `welcomeBack: (name) => \`歡迎回來，${name}。\``
- Test：
  - 用內容找：`grep -rn "recruit(" src/scripts/games/starlantern --include=*.test.ts`。Task 12b 之後，這些地方可能已經改成 `fullParty(...)`；仍然呼叫 `recruit(` 的，一律改成 `meet(p, id, 1)`。
    - `engine/party.test.ts`：`recruits once` 改成 `meets once`。
    - `engine/game.test.ts`：import 與呼叫 `recruit` 的地方。
    - `ui2/scenes/formation.test.ts`：import 與呼叫 `recruit` 的地方。
  - `ui2/scenes/guild.test.ts`：
    - `lists the guild commands`（斷言指令清單含有「招募」）改成含有 `T.ui2.guild.recall`；
    - `recruits after a confirmation` 改寫成召回。

**Interfaces:**
- `Game.recall(id: CharacterId, out?: CharacterId): { ok: true } | { ok: false; reason: 'invalid' }`
  - 只在 town 階段有效；
  - `id` 必須在 `recruited` 裡、不是 `hero`、不在 grid 上；
  - 上陣不到 5 人時，用 `placeInGrid` 放進她自己的排，`out` 被忽略；
  - 上陣已滿時，`out` 必須在 grid 上而且不是 `hero`，`id` 取代 `out` 的格子；
  - 成功後立刻存檔，失敗時 `notice = 'save-failed'`。
- 公會清單：已遇見、不在 grid 上、不是主角的人；清單是空的時，指令反灰。
  - 選人後確認；陣型已滿時，接著選一位換下的人（清單是 grid 上不是主角的人）；
  - 成功後 `say(T.ui2.guild.welcomeBack(名字), 'happy')`。

- [ ] **Step 1: 寫失敗的測試**
  - `game.test.ts`：
    - `recall fills an empty cell and saves`
    - `a full field needs someone to step out, never the hero`：沒給 `out`、`out` 是 `hero`、`out` 不在 grid 上，都回傳 `invalid`，存檔不變。
    - `recall refuses the unmet, the hero and whoever is already on the field`
    - `recall works only in town`
  - `guild.test.ts`：
    - `recall is disabled when nobody waits`
    - `recall with room asks once and places her`
    - `recall with a full field asks who steps out`
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): the guild recalls companions met in the labyrinth`

### Task 18: 主角的介面：排第一、5 條分支、6×6 天賦盤

**Files:**
- Modify：
  - `ui2/scenes/status.ts`、`ui2/scenes/equip.ts`：找 `activeIds(p)[0] ?? p.recruited[0]`，沒有指定角色時改成預設選 `hero`。
  - `ui2/scenes/statusTabs.ts`：分支數大於 3 時，技能樹容器加上 class `slx-tree-wide`；盤面欄數大於 4 時，天賦盤容器加上 `slx-talent-wide`。
  - `src/styles/_starlantern-ui.scss`：兩個 class 的欄數（5 欄、6 欄），窄螢幕時沿用現有的斷點做法。
- Test：`ui2/scenes/status.test.ts`、`ui2/scenes/equip.test.ts`、`ui2/scenes/battle.test.ts`、`ui2/partyBar.test.ts`

- [ ] **Step 1: 寫失敗的測試**
  - `status.test.ts`：
    - `the hero comes first`：沒有參數時，名字是洛恩；向後翻頁的順序就是 `recruited` 的順序。Task 12b 已經改過的翻頁測試若與此重複，合併成這一項。
    - `the hero's tree shows five branches and ranks out of 5`：`.slx-tree-wide` 存在，`hero-mend` 那一列顯示「0／5」。
    - `the hero's board shows six columns and three keystones`：第 0 列有 6 個節點，關鍵天賦的文字用上限 3。
    - `the hero's ultimate line names his current form`
  - `equip.test.ts`：`the hero comes first`
  - `partyBar.test.ts` 或 `battle.test.ts`：`a member without art shows a name, never a broken image`：主角與凜沒有 `<img>`，名字有出現。
- [ ] **Step 2: 執行，確認失敗**
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`feat(starlantern): the hero leads every party screen`

### Task 19a: 平衡帶依人數重排，記下基準（不調整）

**Files:**
- Modify：
  - `engine/sim.ts`：`partyAt` 的預設 ids 從 `LEGACY_LINEUP` 改成 `STANDARD_LINEUP`。
  - `engine/balance.test.ts`：照下表重排；每一項斷言前，在 `process.env.BALANCE_REPORT` 有值時用 `console.info` 印出標籤與實測的勝率、HP 損失、回合數。
- Create：`.superpowers/sdd/2026-10-17-starlantern-plan6a-party/balance-baseline.md`：19a 實測的每一項數字，給 19b、19c、20 當起點。
- Test：`engine/sim.test.ts`：`the default simulation party is the legacy five` 改成 `STANDARD_LINEUP`。

**平衡帶**（spec §9.4 第 7、8 點；`TWO = ['hero', 'rin']`、`THREE = [...TWO, 'selene']`、`FOUR = [...THREE, 'chizuru']`）
- 第 1–3 項：不變。
- 第 4、5、7、8、9 項：改用標準滿編（預設），門檻不變。
- 第 6 項：標準滿編，門檻不變（Lv11 30–85%，120 場；Lv13 ≥ 70%）。
- 第 10 項：標準滿編，門檻不變，跑兩次：
  - 一次照舊；
  - 一次 `{ memories: 10 }`，深淵依深度計算（spec §9.4 第 8 點）。
- 第 11、14 項：標準滿編，門檻不變；每一項另外用 `{ memories: 10, abyss: ABYSS.cap }` 再跑一次。
- 第 12 項：不變。
- 第 13 項改成「全新的兩人隊伍守得住每個地區的第 1 層」，門檻維持舊帶的嚴格度（見衝突第 3 點）：
  - `TWO`、Lv1、每個地區的 depth 1、沒有裝備：勝率 ≥ 0.85，HP 損失 0.10–0.45；
  - 只攻擊的玩家：勝率 ≥ 0.85。
- 新增第 15 項「三人在本道第 2、3 層」：`THREE`，以 `depthLevel(d)`、mainline 的 `encounterTable`：勝率 ≥ 0.85，HP 損失 0.10–0.45。
- 新增第 16 項「三人的頭目戰」：`THREE` 打 `lanterneater`：Lv11 勝率 0.25–0.85（120 場），Lv13 ≥ 0.65。
- 新增第 17 項「四人在本道第 4 層」：`FOUR`，`depthLevel(4)`：勝率 ≥ 0.85，HP 損失 0.10–0.45。
- 「記憶期望」的版本屬於 6b。

- [ ] **Step 1: 改寫 `balance.test.ts` 與 `sim.test.ts`**，所有成員清單都透過 `winRate` 的 `lineup` 參數傳入。
- [ ] **Step 2: 執行**：`BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.test.ts --testTimeout=300000`，把每一項的數字寫進 `balance-baseline.md`。
- [ ] **Step 3: 本任務不調任何旋鈕。** 紅的項目改用 `it.fails(...)` 包起來（斷言照寫，不可以改門檻），並在 `balance-baseline.md` 標明由 19b 還是 19c 負責。綠的項目維持 `it(...)`。
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`balance(starlantern): restage the bands for two to five members`，訊息附上基準數字與 `it.fails` 的清單。

### Task 19b: 調整兩人帶（第 13 項）

**Files:**
- Modify：`engine/balance.test.ts`（第 13 項的 `it.fails` 改回 `it`）；旋鈕所在的檔案：`engine/scaling.ts`、`data/characters.ts`
- Test：`data/rin.test.ts`、`data/hero.test.ts` 必須維持綠。

**旋鈕與順序**（紅了才調；每一步都重跑 `balance.test.ts`，任何一步都不可以碰門檻）
1. `PARTY_SCALE[2]`：只影響 2 人的戰鬥，不會牽動第 15–17 項。
2. `GROUP_CAP[2]` 與 `FIRST_DEPTH_CAP[2]`：可以把 2 人在第 1 層的每組上限調到 2。
3. 最後才動主角與凜的 base：
   - 凜不可以超過 Task 3 的上限（HP、DEF 為前排平均的 1.25 倍）；主角必須維持 Task 4 的下限與總和規則；
   - base 也會影響第 4、5 項（第 1–3 層，`ENEMY_POWER` 是 1，沒有別的旋鈕能抵銷），所以每次都要確認第 4、5 項沒有被打破。
- 技能數值與 `ENEMY_POWER` 不在本任務的旋鈕裡：只攻擊的玩家不用技能，`ENEMY_POWER` 在 Lv10 以下是 1。
- 任何組合都調不過時，停下來回報 sweep 的數字，不可以放寬，也不可以把第 13 項留在 `it.fails`。

- [ ] **Step 1: 依順序 sweep**，每一組值的結果記進 `balance-baseline.md`。
- [ ] **Step 2: 第 13 項改回 `it`，執行全套，確認全部通過**
- [ ] **Step 3: commit**：`balance(starlantern): tune the two-member start`，訊息寫出旋鈕最後的值。

### Task 19c: 調整三到五人的帶

**Files:**
- Modify：`engine/balance.test.ts`（其餘 `it.fails` 全部改回 `it`）；旋鈕所在的檔案：`engine/scaling.ts`、`data/skills.ts`、`data/ultimates.ts`、`data/characters.ts`
- Test：`data/hero.test.ts`（含 Task 9 的峰值）、`data/rin.test.ts` 必須維持綠；第 13 項必須維持綠。

**旋鈕與順序**（紅了才調；每一步都重跑 `balance.test.ts`）
1. `PARTY_SCALE[3]`、`GROUP_CAP[3]`（第 15、16 項）；`PARTY_SCALE[4]`、`GROUP_CAP[4]`（第 17 項）。每一格各自調整，`PARTY_SCALE[5]` 固定是 1。
2. 主角與凜的技能 power、tp，以及 `HERO_ULTIMATES`、`ult-rin`（5 人的帶）。Task 9 是硬性護欄：不可以把任何主角數值調過峰值上限。
3. `ENEMY_POWER`：只影響 Lv11 以上的敵人（第 6–11、14 項），影響所有深層的帶。
4. 最後才動主角與凜的 base 與 growth，限制同 19b；動過之後第 13 項也要重跑。
- 任何組合都調不過時，停下來回報 sweep 的數字，不可以放寬。

- [ ] **Step 1: 依順序 sweep**，結果記進 `balance-baseline.md`。
- [ ] **Step 2: 所有 `it.fails` 改回 `it`，執行全套，確認全部通過；`grep -n "it.fails" src/scripts/games/starlantern/engine/balance.test.ts` 沒有結果**
- [ ] **Step 3: commit**：`balance(starlantern): tune the three- to five-member bands`，訊息寫出每個旋鈕最後的值與各帶的實測數字。

### Task 20: 新平衡帶「任何組成都能用」（限時）

**Files:**
- Create：`engine/balance.lineups.test.ts`
- Modify：
  - `engine/sim.ts`：export `ODD_LINEUPS`。
  - `data/hero.ts`：`HERO_BUILDS` 新增選填的 `nodes?: string[]`，也就是流派優先投的節點順序；`heroTree` 有 `nodes` 時先照它投，投不下再照 Task 7 的規則。
  - 旋鈕所在的檔案（見下方）。

**Interfaces:**
- `ODD_LINEUPS: Record<'noHeal' | 'noTank' | 'allMagic' | 'allPhys', { ids: CharacterId[]; fill: HeroBuild; heroRow?: Row; regions: RegionId[] }>`（spec §9.4 第 9 點、§4.5）
  - noHeal：`['hero', 'rin', 'scarlet', 'chizuru', 'safira']`、fill healer、mainline
  - noTank：`['hero', 'noel', 'selene', 'sylvie', 'bobby']`、fill tank、mainline
  - allMagic：同上的 ids，`heroRow: 'front'`、fill sword、mainline（見衝突第 4 點）
  - allPhys：`['hero', 'rin', 'scarlet', 'chizuru', 'liz']`、fill mage、`['iron', 'mire']`
- `BUILDS: HeroBuild[] = ['balanced', 'sword', 'mage', 'healer', 'tank']`

**測試**（depth 4 與 8，`depthLevel(d)`，該地區的 `encounterTable`，每組 20 個種子；先算一次「陣容 × 流派 × 深度 × 地區」的矩陣，再對矩陣斷言）
- `18a fill`：每個陣容配上它的 fill 流派：勝率 ≥ 0.85，HP 損失 0.10–0.45。
- `18b floor`：每個陣容配上 balanced：勝率 ≥ 0.75。
- `18c freedom`：標準滿編配上每一種流派：勝率 ≥ 0.85。
- `18d ceiling`：矩陣的每一格（4 個陣容加上標準滿編，× 5 種流派）HP 損失都 ≥ 0.10。
- `18e no one-round boss`：標準滿編配上每一種流派，`{ memories: 10, abyss: ABYSS.cap }`，depth 5、10，`kitParty(..., 'rare', expectedEnhance(d))` 打 `lanterneater`，種子 1–20，每場回合數 ≥ 3；+`ENHANCE_MAX` 時 ≥ 2。
- 整個檔案的 timeout 設 300_000。

**旋鈕**（依序；每次調整後重跑 `balance.test.ts` 與這個檔案）
1. 流派的定義：`HERO_BUILDS` 的 `branches`、`talents`、`nodes`（每個流派投哪些節點、順序）。這只影響主角在模擬與「一鍵分配」時的配點，不影響其他任何帶的門檻。
2. 19c 的旋鈕 2、3、4，限制相同（Task 9 是硬性護欄）。`PARTY_SCALE`、`GROUP_CAP` 對 5 人陣容沒有作用，不是本任務的旋鈕。

**衝突時誰優先**（18c 要每一種流派都能贏，18d 要每一格都不能太輕鬆，兩者會互相拉扯）
- 優先順序：`18c` > `18a` > `18b` > `18d` > `18e`。勝率的下限永遠優先。
- 某一格太輕鬆（18d 紅），而讓它變難會使任何一項勝率下限（18a、18b、18c）或 balance.test.ts 的任何一項變紅時：不要硬調，停下來回報那一格與 sweep 的數字。不可以放寬 18d，也不可以用 `it.fails` 留著它提交。

**時間上限**：最多 6 輪「調整 → 兩個檔案全跑」。6 輪內收斂不了，就停下來回報矩陣與每一輪的 sweep，不 commit 本任務。

- [ ] **Step 1: 寫測試**
- [ ] **Step 2: 執行**：`rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.lineups.test.ts --testTimeout=300000`，記下矩陣，寫進 `balance-baseline.md`。
- [ ] **Step 3: 紅了依上面的旋鈕與優先順序調整**，在時間上限內收斂，否則停下來回報。
- [ ] **Step 4: 執行全套，確認全部通過**
- [ ] **Step 5: commit**：`balance(starlantern): any lineup works with the right hero build`，訊息附上矩陣與旋鈕最後的值。

### Task 21: 端對端、全套測試、截圖與審查

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`

- [ ] **Step 1：e2e `two start, meet Selene, recall her`**
  - 新遊戲 → 選單、公會的成員清單只有洛恩與凜。
  - 用 debug hook 讓兩人 Lv4、出發本道並直接到第 2 層，走到求救房（用 debug hook 讀出 `floorOf(...).contents` 裡 `rescue` 的位置，再把 `pos` 設在它旁邊一格後按方向鍵）。
  - 地圖上看得到「救」；進房後出現相遇台詞，然後進入戰鬥；用 debug hook 讓敵人 HP 歸零贏下戰鬥；戰果有「瑟蕾（LvN）加入了隊伍！」。
  - 回城 → 編隊把瑟蕾移到預備 → 公會「召回」→ 她回到陣型。
  - 編隊時對洛恩那一格，選單沒有「移除」。
  - 全程沒有 console error；在旅館存檔，重新整理後選「繼續」，存檔有效，瑟蕾仍在 `recruited`。
- [ ] **Step 2：全套測試與截圖**
  - `rtk proxy npx vitest run --testTimeout=20000` 與 e2e 全套。
  - `grep -rn "it.fails" src/scripts/games/starlantern` 沒有結果。
  - 截圖：兩人開局的城鎮、地圖上的「救」、相遇台詞、救援戰果、公會召回（含陣型已滿時的換人）、狀態頁主角的技能樹（5 分支）與天賦盤（6×6）、編隊畫面。
- [ ] **Step 3：審查**：派一個沒參與開發的 opus 代理，用 `~/.claude/skills/review-pr/SKILL.md` 審查本計畫的 diff，並處理它提出的問題。
- [ ] **Step 4：commit**：`test(starlantern): two-person start, rescue and recall end-to-end`

---

## 交給 6b 的接口
- `memories`：`canRaiseNode`、`raiseNode`、`validBuild`、`heroTree`、`Lineup.memories` 都已經有這個參數。6b 在 `Game.raiseNode`、`save.ts` 改傳 `state.memories.hero`，存檔升到 v8。
- 主角的「燈鑰・天燈」、凜的第二形態絕技「破鐘・黎明之刃」與誓約關鍵天賦、各人的記憶關鍵天賦：6b 加在 `HERO_ULTIMATES`／`ultimateFor` 與 `CHAR_KEYSTONES` 的旁邊。
- `StatSource` 的 `memory`、平衡帶的「記憶期望」：6b。
- 絲嘉蕾的劇情戰（撐過 3 回合）：6b 以 `rescueAt` 的戰鬥為基礎加上特例。
- `dungeon.bossDefeated` → `story.act1Cleared`：6b。

## 本計畫裁定的 spec 衝突
1. **存檔版本。** spec §13 把所有新欄位放在一次 v7。6a 的隊伍變更（新角色、兩人開局、主角必須在場）已經讓舊存檔讀不回來，所以 6a 先升到 v7；6b 的故事狀態是另外的欄位，由 6b 升到 v8。兩次都沿用 `save-reset` 通知，舊存檔直接重置。
2. **同伴的點數。** spec §4.4 說同伴到 Lv50 約有 49 點技能點，但 5b 的裁定是技能點 26、天賦點 23（合計 49）。本計畫照 spec 的字面給主角 73 技能點、45 天賦點，所以主角的點數約是同伴的 2.8 倍（技能）與 2 倍（天賦），而不是 spec 推論的 1.5 倍。峰值測試（Task 9）與平衡帶守住上限。如果使用者要按比例，改成技能點約 39、天賦點約 35 即可，只動 `skillPoints`／`talentPoints` 的 hero 曲線。
3. **第 13 項的門檻（已裁定）。** spec §9.4 把它重排成兩人版本，並寫了 HP 損失 15–50%、只攻擊 ≥ 80%，這比舊的 5 人帶（10–45%、只攻擊 ≥ 85%）寬鬆。裁定：兩人版本維持舊帶的嚴格度，勝率 ≥ 85%、HP 損失 10–45%、只攻擊 ≥ 85%（Task 19a）。為了讓它調得動，人數補正與每組上限改成依人數查表、各格獨立（Task 10、19b）；任何組合都調不過時停下來回報，不放寬。
4. **spec 的「沒有坦克」與「全是法系」是同一組人**（諾艾兒、瑟蕾、希爾薇、波比）。本計畫保留兩組，用補位流派區分：沒有坦克配純坦，全是法系配純劍，主角都站前排。
5. **魔導書與扳手沒有底材。** 本計畫只把它們加進 `WeaponKind` 與專精表，不新增底材，因為底材需要圖示、掉落表與鍛造配方。
6. **絲嘉蕾的劇情戰**（撐過 3 回合就結束）是新的戰鬥模式，延到 6b。6a 對 8 位都用一般的救援戰。
7. **傳送門的「已解鎖但還沒遇見」** 沒有定義「解鎖」。本計畫裁定：有還沒遇見的同伴的地區，權重 ×2。
8. **「記憶期望」的平衡帶**（spec §9.4 第 7 點）需要記憶的能力提升，延到 6b。
9. **救援戰的「敵人多 1 隻」與「最多 n + 1 隻」互相抵銷。** 本計畫裁定：救援戰的上限是 n + 2，先套上限再多加 1 隻。
10. **主角技能樹的容量是 97，不是「約 110」。** 因為淨光、沉眠這類威力倍率影響不到的技能只能點 1 級（沿用 5b 的規則）。Lv50 可以點滿約 76%，不是約 2/3。測試的範圍是 0.6–0.8。
11. **深淵終極由主角碎片解鎖，碎片屬於 6b。** 6a 正常遊玩一律傳 `memories = 0`，所以在 6b 上線前，玩家拿不到深淵終極。模擬可以傳入記憶片數，用來測上限。
12. **`recruited` 不改名為 `met`。** 改名要動約 25 個檔案，行為沒有任何差別。意思改成「已遇見」，文字從「尚未招募」改成「尚未遇見」。
13. **兩人帶的回復藥。** spec 說兩人「靠回復藥」撐過，但模擬的玩家不使用道具，所以第 13 項是單場、不喝藥的數字。開局改成 5 瓶照做。
14. **主角拿法杖或魔導書時的「屬性特效」** 沒有指定屬性。本計畫裁定：法杖用火，魔導書用雷。
15. **中間版本的存檔（已接受）。** Task 3 到 Task 12a 之間，舊的 v6 存檔讀成 `corrupt` 而不是 `version`；Task 12a 到 Task 13 之間寫出的 v7 存檔，在 Task 13 加上「主角必須在場」之後也可能讀成 `corrupt`。兩者都只發生在中間版本，畫面上一樣是重置通知；完成後的計畫裡，正常遊玩不會寫出讀不回來的存檔。
16. **人數補正與每組上限的形式。** spec §9.4 寫的是公式 `f(n) = 0.4 + 0.12n` 與 `n + 1`。本計畫改成依人數查表（2–5 人），初值就是公式的值，`f(5) = 1` 固定；這樣兩人帶可以單獨調整，不會連帶放鬆三、四人的帶。只有主角 1 人上陣時照 2 人那一格查。
