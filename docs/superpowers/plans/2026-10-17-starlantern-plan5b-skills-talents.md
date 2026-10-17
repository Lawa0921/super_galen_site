# 星燈迷宮 計畫 5b：技能樹、天賦盤、重置與升級節奏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 升級不再自動學技能，改成每位角色自己點技能樹與天賦盤；旅館可以付費重置；清完一層深度後，等級大約追上下一層的建議等級。

**Architecture:**
- **節奏**：`depthLevel` 不動，改成「下樓時給一筆深度踏破經驗」。
  - `depthLevel` 就是平衡測試第 4、7–11 項驗證「勝率在範圍內」的那個等級。也就是 spec §6「大約深度等級和角色等級相當時，勝率落在設計範圍內」裡的深度等級。
  - 縮小每層 +4 的級距，等於讓第 2 層的怪（為 Lv6 調的，見第 4 項）掛上較低的建議等級。牆還在，只是標示變錯了。
  - 每場戰鬥的經驗不能改：第 2–3、7 項把「每 4 級 10–18 場」釘死了。
  - 實測一次清完一層大約只有 6–8 場戰鬥（見 Task 1），所以缺的經驗改由「踏破」一次補上。
- **技能樹**：資料在 `data/trees.ts`。
  - 每位角色 3 條分支，每條是 5 個階層的直鏈，共 15 個節點。
  - 主動節點的 id 就是技能 id，所以 5a 的傳說特效（`POWERS[*].skill`）不用搬。
  - 強化節點用 5a 已有的 `SkillMod`／`patchSkill` 改寫技能。順序是：先套技能樹，再套身上的特效。
- **天賦盤**：資料在 `data/talents.ts`，用一個共用的 6×4 樣板加上每位角色 6 個屬性。
  - 一般節點的加值走 `statSources` 的新來源 `talent`，狀態頁會自動多一欄。
  - 7 種關鍵天賦是戰鬥鉤子。沒有點關鍵天賦時，不會多抽任何亂數。
- **規則**只寫在 `engine/progression.ts` 的 `canRaiseNode`／`canRaiseTalent`。
  - 預設配點、存檔驗證、介面都透過它們判斷，不另外再寫一套。
  - `progression.ts` 只依賴資料檔和 types，不依賴 `party`。
  - 成員多兩個欄位：`tree`、`talents`，內容是節點 id 對應等級。存檔版本 5。

**Tech Stack:** TypeScript、Vitest（happy-dom）、DOM 介面加上 SCSS、Playwright e2e。

**Spec:**
- `docs/superpowers/specs/2026-10-16-starlantern-progression-design.md`：§6、§8 的技能樹與天賦部分、§9、§10、§11。
- 前一份計畫：`docs/superpowers/plans/2026-10-16-starlantern-plan5a-loot-core.md`。它的裁決 6「傳說特效綁定現有的技能 id，5b 要接手」，由本計畫的 Task 2、3、6、8 處理。
- 預檢結果：`.superpowers/sdd/2026-10-17-starlantern-plan5b-skills-talents/preflight.md`。本版已經修正表中全部 22 項。

> 沒有以 `src/` 或 `tests/` 開頭的路徑，都在 `src/scripts/games/starlantern/` 底下。

## Global Constraints
- **單元測試**
  - 只能用 `npx vitest run <路徑>`；全套用 `npx vitest run --testTimeout=20000`。
  - 不可以用 `npm run test`，它是 watch 模式，會卡住。
- **e2e**
  - 用 `E2E_PORT=4352 npx playwright test tests/e2e/starlantern --project=chromium`。
  - 這個參數是篩選字串，會對到 `tests/e2e/starlantern.spec.ts`。
  - 不可以用 4321 埠。
- **工具**：本專案沒有 prettier、eslint，也沒有 type-check 腳本，不要去跑。
- **SCSS**：禁止 `!important`；禁止行內樣式，包括 JS 的 `element.style`。
- **換行**：保留每個檔案原本的換行格式（CRLF、LF 或混用）。改檔前先用 `git ls-files --eol <檔案>` 確認。
  - 例如 `data/skills.ts`、`engine/party.ts` 是 CRLF，`data/text.zh-TW.ts` 是混用，`ui2/scenes/statusTabs.ts` 與 `src/styles/_starlantern-ui.scss` 是 LF。
- **commit**
  - 一律寫出完整路徑，不可以用 `git add -A`。
  - 訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **文案**
  - 介面文字一律放在 `data/text.zh-TW.ts`。
  - 技能、節點、關鍵天賦的名稱與說明，照 `data/skills.ts`、`data/gear.ts` 現有的做法放在資料檔。(implementer's call → fixed here)
- **亂數**：一律用帶種子的 `Rng`，也就是 `engine/rng.ts` 的 `mulberry32`。
  - 唯一的例外是 SoundManager 現有的白噪音。
- **平衡**
  - `engine/balance.test.ts` 第 1–11 項的門檻一律不可以放寬。
  - 每個會影響戰力的任務，都要跑全套，包括 balance。
  - 紅了只能調該任務列出的旋鈕，旋鈕所在的檔案都已經列在該任務的 Files：
    - Task 6：新技能的 `power`／`tp`（`data/skills.ts`），以及預設配點的花點順序（`data/trees.ts` 的 `DEFAULT_CAPSTONE`、`progression.ts` 的同分排序）。舊的 27 個技能不能動。
    - Task 8：`ACTIVE_RANK_PCT[1]`、`ACTIVE_RANK_PCT[2]` 與強化節點的數值（`data/trees.ts`）。`ACTIVE_RANK_PCT[0]` 固定是 100，不是旋鈕。
    - Task 9：`TALENT_SCALE`（`data/talents.ts`）。
    - Task 10：`KEYSTONE_VALUES`（`data/talents.ts`）。
  - 調過的話，commit 訊息要寫出最後的值。
  - **測試不可以寫死旋鈕的值**：預期值一律透過常數算出來（`ACTIVE_RANK_PCT`、`NODES[id].node.mods`、`TALENT_PER`、`TALENT_SCALE`、`KEYSTONE_VALUES`），這樣調旋鈕時，旋鈕自己的測試不會壞。
- **美術**
  - 技能樹與天賦盤用文字節點，套現有的視窗樣式（`win`、`.slx-skill` 的列樣式）。
  - 不可以做假圖示，也不可以用 CSS 形狀畫連線或節點，包括 `::before`／`::after` 的裝飾。
  - 節點狀態只用文字標籤和字色表示。
- **存檔**：版本從 4 變成 5，舊檔直接重置。使用者已同意。
- **測試修改規則**
  - 某個任務會弄壞的每一個測試檔，都要列在該任務的 Files 裡，並寫明怎麼改。
  - 改動共用資料形狀的任務，驗證步驟一律跑全套。
  - 因為亂數序列改變而受影響的測試，改成斷言行為，不可以寫死新的數字。

## Review Focus
1. **點數不夠、已經滿級、還沒解鎖時投點，必須被拒絕，而且狀態完全不變。** 介面上必須按兩次 Enter 才會投點，而且只投 1 點。
   - 測試在 Task 5、Task 9、Task 13。
2. **手改或舊版存檔裡的配點。**
   - 未知節點、等級超過上限、點數超支、缺少免費技能、兩個終極、三個關鍵天賦、天賦不相鄰，都要當成壞檔。
   - v4 的存檔要回報 version。
   - 測試在 Task 5 與 Task 11。
3. **重置會讓上限下降。**
   - 重置後 HP／TP 要壓回新的上限。
   - 金幣不夠、沒有點過任何點時，必須拒絕，而且不扣錢。
   - 測試在 Task 12。
4. **傳說特效與還沒學會的技能。**
   - 技能在角色的樹裡、但還沒學會時，特效顯示「尚未習得」，而且不標成「無法發動」。
   - 戰鬥中，就算手動組出一個行動，也不能施放還沒學會的技能。
   - 測試在 Task 6 與 Task 8。
5. **Lv50 與極深的樓層。**
   - Lv50 時技能點是 26（不含免費的 1 級）、天賦點是 23；滿級後不再給點。
   - `depthClearExp(1000)` 是有限的數字；在 Lv50 下樓不會出錯。
   - 測試在 Task 1 與 Task 5。

---

## File Structure
- `data/trees.ts`（新）：技能樹的型別、8 棵樹、`NODES` 索引、`ACTIVE_RANK_PCT`、`TIER_GATE`、`DEFAULT_CAPSTONE`、`LEGACY_LEARN_LEVEL`。
- `data/talents.ts`（新）：天賦盤樣板、每位角色的屬性組合、關鍵天賦目錄與數值、`BOARDS`、`TALENT_NODES`。
- `data/skills.ts`：新增 47 個主動技能；Task 7 刪掉 `learnLevel`。
- `data/characters.ts`：Task 7 刪掉 `skills`。
- `engine/progression.ts`（新）：點數、投點規則、預設配點、驗證、重置，以及技能樹給技能的改寫。
- `engine/party.ts`：`hasPassive`、`gainExp`、`statSources` 的天賦來源，以及 `newMember`。
- `engine/skills.ts`、`engine/battle.ts`、`engine/combatant.ts`：等級與強化節點的改寫、關鍵天賦、未學會的技能不能施放。
- `engine/scaling.ts`、`engine/game.ts`、`engine/sim.ts`：深度踏破經驗、節奏測試、預設配點的模擬隊伍。
- `engine/save.ts`、`engine/state.ts`、`engine/town.ts`：存檔 v5、重置。
- UI：
  - `ui2/scenes/statusTabs.ts`、`status.ts`、`guild.ts`、`inn.ts`、`battle.ts`、`dungeon.ts`、`equip.ts`；
  - `ui2/battleText.ts`、`ui2/spendPress.ts`（新）、`engine/compare.ts`；
  - `src/styles/_starlantern-ui.scss`。
- 平衡與 e2e：`engine/balance.test.ts`、`tests/e2e/starlantern.spec.ts`。

---

### Task 1: 深度踏破經驗與節奏測試

**Files:**
- Modify：
  - `engine/scaling.ts`、`engine/game.ts`、`engine/sim.ts`；
  - `engine/party.ts`：只是替現有形狀取名 `LevelUp`。
  - `ui2/battleText.ts`、`ui2/scenes/battle.ts`、`data/text.zh-TW.ts`；
  - `ui2/scenes/dungeon.ts`：`say()` 改成回傳 promise，見下方。
- Test：
  - `engine/scaling.test.ts`：新增。
  - `engine/balance.test.ts`：新增第 12 項，第 1–11 項不動。
  - `engine/game.test.ts`：
    - 第 199、210、361、375、672 行的 `toEqual({ kind: 'floor', … })` 改成 `toMatchObject`，因為結果多了 `clear`；
    - 另外新增下面的測試。
  - `ui2/scenes/dungeon.test.ts`：新增。
  - `tests/e2e/starlantern.spec.ts`：`a portal run reaches depth 2 and banks the loot`（第 298–301 行）在 `floor` 變成 2 之後，先用 `w.closeTalk()` 關掉層名，斷言出現「踏破獎勵：經驗值 +」，再關掉它，才呼叫 `lampHome`。

**Interfaces:**
- Produces（`engine/party.ts`）：`export type LevelUp = { id: CharacterId; levels: number; learned: string[] }`。這就是 `awardExp` 的 results 元素，`BattleEnd.levelUps` 改用這個名字。
- Produces（`engine/scaling.ts`）：
  - `export const DEPTH_CLEAR_SHARE = 0.6` (implementer's call → fixed here)
  - `export function depthClearExp(depth: number): number`
    - 等於 `Math.round(DEPTH_CLEAR_SHARE × need(depthLevel(depth), depthLevel(depth) + 4))`，`need` 是檔內現有的那個。
- Produces（`engine/game.ts`）：
  - `MoveResult` 的 `floor` 改成 `{ kind: 'floor'; floor: number; clear?: { exp: number; levelUps: LevelUp[] } }`。
  - `descend()` 先算經驗，再呼叫 `changeFloor`：
    - `exp = Math.round(depthClearExp(this.floor) × CONDITIONS[run.condition].expMul)`，`this.floor` 是離開的那一層；
    - 用 `awardExp(party, exp, 站在場上而且 hp > 0 的成員)` 發給大家：候補拿一半，倒下的拿 0，跟戰鬥一樣；
    - `clear.levelUps` 只列出 `levels > 0` 的成員。
- Produces（`engine/sim.ts`）：
  - `clearFights(depth: number, seed: number, route: 'rooms' | 'direct'): number`
  - `depthPace(depth: number, route: 'rooms' | 'direct'): number`：回傳清完一層後的等級。
- Produces（`ui2/battleText.ts`）：`levelUpLines(ups: LevelUp[], party: Party): { text: string; cls: 'slx-levelup' }[]`
  - 內容從 `ui2/scenes/battle.ts` 第 467–471 行搬過來；戰鬥結果改呼叫它。
- Produces（`ui2/scenes/dungeon.ts`）：
  - `private say(text: string | Rich): Promise<void>`：回傳 `this.talk.say('', text)` 的 promise。`syncInert()` 照舊在呼叫之後執行。
  - 現有的呼叫端不用改，`event.ts` 的介面型別 `say(text): void` 也接受它。
  - `descend()`：先說層名（第一則，和現在一樣）；有 `clear` 時，等第一則的 promise 完成後，再說第二則：`T.map.cleared(exp)` 加上 `levelUpLines`，用換行串起來。
- 文案：`T.map.cleared(exp: number)` 等於 `踏破獎勵：經驗值 +${exp}`。

`clearFights` 的走法（測試數字依賴它，所以寫死）：
- 地圖用 `genFloor(seed, { depth, boss: false })`；遇敵率用 `FLOORS[terrainOf('mainline', depth) − 1].rate`；亂數是 `mulberry32(seed)`。
- `rooms`：從入口出發，每次走到「BFS 距離最近、還沒到過的房間中心」，同距離時取 room id 小的；全部走完後，再走到 `map.down`。
  - 房間中心是 `(x + ⌊w/2⌋, y + ⌊h/2⌋)`。
- `direct`：從入口直接用 BFS 走到 `map.down`。
- 每走 1 格呼叫一次 `advance(v, rng, rate)`，modifier 是 1；回傳遇敵的次數。
- BFS 只排除 `wall`。

`depthPace` 的算法：
- 起點等級：深度 1 是 1，其餘是 `depthLevel(depth)`。
- 場數取 k = 1…40 時 `clearFights(depth, k × 7919, route)` 的平均。
- 每場經驗取 `encounterTable('mainline', depth)` 各組 `groupExp(g, { depth, region: 'mainline' })` 的平均。
- 經驗 = `round(場數 × 每場經驗) + depthClearExp(depth)`。
- 結果是 `gainExp({ ...newMember('noel'), level: 起點 }, 經驗).member.level`。

**實測依據**（DEPTH_CLEAR_SHARE = 0.6 時算出來的，寫在這裡供對照）：

| 深度 | 下一層建議 | 清房間的場數 | 直線的場數 | 沒有踏破經驗時 | 清房間後的等級 | 直線後的等級 |
|---|---|---|---|---|---|---|
| 1 | 6 | 6.1 | 2.7 | 3 | 5 | 5 |
| 2 | 10 | 5.8 | 2.6 | 7 | 9 | 9 |
| 3 | 14 | 6.8 | 3.0 | 11 | 13 | 13 |
| 4 | 18 | 6.1 | 2.6 | 15 | 17 | 17 |
| 6 | 26 | 7.7 | 3.3 | 24 | 27 | 25 |
| 10 | 42 | 8.1 | 3.3 | 39 | 42 | 41 |

- [ ] **Step 1: 寫失敗的測試**
  - `scaling.test.ts`：
    - `depthClearExp is DEPTH_CLEAR_SHARE of four levels at the depth level`：
      - `depthClearExp(1)` 等於 `Math.round(DEPTH_CLEAR_SHARE × (expToNext(2) + expToNext(3) + expToNext(4) + expToNext(5)))`；
      - `depthClearExp(10)` 大於 `depthClearExp(4)`。
    - Review Focus 5：`depthClearExp stays finite at depth 1000`。
  - `game.test.ts`：
    - `descending pays the depth-clear exp: full to the standing, half to the bench, none to the downed`
      - 先 `recruit` sylvie（候補）；selene 的 hp 設成 0；然後下樓。
      - `r.clear.exp` 等於 `depthClearExp(1)`；
      - scarlet 從 Lv1 升級，而且出現在 `clear.levelUps`；
      - sylvie 拿到 `Math.floor(exp / 2)`；selene 的 exp 和等級都不變。
    - `the fierce condition multiplies the clear exp`
      - `r.clear.exp` 等於 `Math.round(depthClearExp(1) × CONDITIONS.fierce.expMul)`。
    - Review Focus 5：`descending at Lv50 grants nothing and does not throw`
      - 全隊 level 設成 `MAX_LEVEL`，下樓後 level 不變、exp 是 0。
  - `balance.test.ts`：`12. one clear of a depth lands near the next depth's level`
    - d 取 1、2、3、4、5、6、8、10；
    - `depthPace(d, 'rooms')` 介於 `depthLevel(d + 1) − 1` 與 `depthLevel(d + 1) + 1` 之間；
    - `depthPace(d, 'direct')` ≥ `depthLevel(d + 1) − 2`。
  - `dungeon.test.ts`：`after the floor name, a second message pays the clear exp`
    - 第 49、85 行的斷言保持原樣，第一則訊息仍然只有層名；
    - 關掉第一則後，第二則包含「踏破獎勵：經驗值 +」，也包含「升到 Lv」。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/scaling.test.ts src/scripts/games/starlantern/engine/game.test.ts src/scripts/games/starlantern/ui2/scenes/dungeon.test.ts`
  - 預期：失敗，原因是 `depthClearExp` 未定義。
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套與 e2e，確認全部通過**
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
  - `E2E_PORT=4352 npx playwright test tests/e2e/starlantern --project=chromium`
  - 第 12 項的數字要對得上上面的表。
  - 對不上的話，先檢查 `clearFights` 是否完全照上面的走法；只有在走法正確時，才可以調 `DEPTH_CLEAR_SHARE`。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): a depth-clear exp grant on the stairs so one clear reaches the next depth's level`

### Task 2: 技能樹資料（型別與前四位角色）

**Files:**
- Create：`data/trees.ts`、`data/trees.test.ts`
- Modify：
  - `data/skills.ts`：新增技能。新技能不寫 `learnLevel`。
  - `engine/types.ts`：`SkillDef.learnLevel` 暫時改成選填，Task 7 會刪掉。
  - `data/gear.ts`：`SkillMod` 新增 `tpDelta?: number`。
  - `engine/skills.ts`：`patchSkill` 處理 `tpDelta`。
- Test：
  - `engine/skills.test.ts`：新增。
  - `data/data.test.ts`：第 46–49 行的 `only Selene heals or revives` 會壞，因為千鶴有了御神酒。改成：
    - `only Selene revives`：revive 技能的擁有者只有 selene；
    - `heals belong to the healers`：heal 技能的擁有者 ⊆ `{ selene, chizuru }`。Task 3 會加上 bobby。

**Interfaces:**
- Produces（`data/trees.ts`）：
  - `interface TreeNode { id: string; kind: 'active' | 'mod'; skill: string; maxRank: 1 | 2 | 3; name?: string; desc?: string; mods?: SkillMod[] }`
    - 主動節點：`id === skill`，沒有 `name`、`desc`、`mods`。
    - 強化節點：`mods.length === maxRank`，`mods[r − 1]` 是第 r 級的完整改寫，不會和前一級疊加。
  - `interface TreeBranch { name: string; nodes: TreeNode[] }`：5 個節點，陣列索引就是階層 0–4；階層 4 是終極節點。
  - `interface TreeDef { branches: TreeBranch[] }`
  - `TREES: Partial<Record<CharacterId, TreeDef>>`：本任務先放 noel、chizuru、liz、sylvie，Task 3 補齊後改成 `Record`。
  - `NODES: Record<string, { node: TreeNode; owner: CharacterId; branch: number; tier: number }>`
  - `ACTIVE_RANK_PCT = [100, 110, 120]`：主動節點第 1–3 級的威力倍率。第 1 級固定是 100，也就是原本的技能。(implementer's call → fixed here)
  - `TIER_GATE = [0, 0, 2, 4, 7]`：點階層 t 的節點前，同分支要先投入的點數。(implementer's call → fixed here)
  - `LEGACY_LEARN_LEVEL: Record<string, number>`：舊技能原本的學習等級，從現有的 `learnLevel` 抄過來。本任務先放前四位角色的 14 個，Task 3 補齊 27 個。Task 6 的預設配點與 Task 7 刪欄位之後的測試都會用到它。
  - `nodeName(id: string): string`、`nodeDesc(id: string): string`：主動節點讀 `SKILLS`。
- Produces（`engine/skills.ts`）：`patchSkill` 遇到 `tpDelta` 時：
  - 原本 `tp > 0` 的技能，新的 tp 是 `max(1, tp + tpDelta)`；
  - `tp` 是 0 的技能，維持 0。

**技能樹規則**（全部都是 implementer's call → fixed here；只寫在這裡，Task 5 照著實作）：
- 每棵樹 3 條分支 × 5 個節點，共 15 個，落在 spec 的 12–16 之內。
- 前置條件：階層 t ≥ 1 的節點，需要同分支階層 t − 1 的節點至少 1 級。
- 分支門檻：要點階層 t 的節點，同分支「階層低於 t 的節點」的等級總和必須 ≥ `TIER_GATE[t]`。
  - **免費的那 1 級不算。** 也就是分支 0 階層 0 的等級要先減 1 再加總。
- 終極：每位角色最多只有 1 個終極節點有等級。
- 分支 0、階層 0 是免費技能，也就是原本 Lv1 學會的那一招。
- 威力倍率影響不到的主動技能（挑釁、淨化、復活、夢境、被動），最高 1 級；終極節點一律 1 級。

**表格記法：**
- `A3` 表示主動、最高 3 級；`M3` 表示強化、最高 3 級。
- 新技能寫成「目標／TP／效果」。
  - 傷害寫成「屬性 計算方式 威力」，例如「火 mag 70」。
  - 有寫「近戰」的才是 `melee: true`。
  - buff 寫成「屬性 ±% 回合」。
- 強化節點寫成「→ 被強化的技能：第 1／2／3 級的值」。

**noel 諾艾兒**（分支：火、冰、雷咒）
- 火：
  - `fire-star` A3（免費）
  - → `noel-fire-up` 火星強化 M3 → fire-star：powerPct 110／120／135
  - → `flame-wave` 炎之波 A3：enemies／7／火 mag 70
  - → `noel-wave-up` 炎波節流 M3 → flame-wave：tpDelta −1／−2／−3
  - → `inferno` 業火 A1：enemies／14／火 mag 130
- 冰：
  - `ice-star` A3
  - → `noel-ice-up` 冰星強化 M3 → ice-star：powerPct 110／120／135
  - → `frost-bind` 冰縛 A3：enemy／5／冰 mag 90，加上 spd −30 3 回合
  - → `noel-bind-up` 寒縛強化 M3 → frost-bind：powerPct 115／130／150
  - → `blizzard` 暴風雪 A1：enemies／13／冰 mag 110，加上 spd −20 3 回合
- 雷咒。衰弱咒當根，這樣它在舊的 Lv4 學得到，不必先學舊 Lv6 的雷之星彈：
  - `hex` A3
  - → `thunder-star` A3
  - → `noel-hex-up` 劇毒咒 M3 → hex：chance 0.6／0.7／0.8
  - → `noel-thunder-up` 雷星強化 M3 → thunder-star：powerPct 115／130／150
  - → `judgement` 天雷 A1：enemy／12／雷 mag 260

**chizuru 千鶴**（分支：槍舞、結界、突刺）
- 槍舞：
  - `sweep` A3（免費）
  - → `chizuru-sweep-up` 橫掃強化 M3 → sweep：powerPct 110／120／135
  - → `spiral-spear` 旋槍 A3：enemies／8／物 atk 100 近戰
  - → `chizuru-spiral-up` 旋槍節流 M3 → spiral-spear：tpDelta −1／−2／−3
  - → `thousand-spear` 千本槍 A1：enemies／14／物 atk 75 近戰 ×2
- 結界：
  - `ward` A3
  - → `chizuru-ward-up` 結界延長 M3 → ward：turns 4／5／6
  - → `sacred-sake` 御神酒 A3：allies／8／heal 50
  - → `chizuru-sake-up` 神酒強化 M3 → sacred-sake：powerPct 115／130／150
  - → `great-barrier` 大結界 A1：allies／12／def +40 4 回合，加上 res +40 4 回合
- 突刺：
  - `pierce` A3
  - → `chizuru-pierce-up` 貫槍強化 M3 → pierce：powerPct 110／120／135
  - → `thunder-thrust` 雷神突 A3：enemy／6／雷 atk 150 近戰
  - → `chizuru-thrust-up` 雷突強化 M3 → thunder-thrust：powerPct 115／130／150
  - → `heaven-spear` 天之逆鉾 A1：enemy／13／物 atk 330 近戰

**liz 莉茲**（尋寶獵人；分支：雙刃、尋寶、身法）
- 雙刃。三連刃放在階層 1，這樣它在舊的 Lv6 之前就能學到：
  - `twin-slash` A3（免費）
  - → `triple-slash` A3
  - → `liz-twin-up` 雙刃強化 M3 → twin-slash：powerPct 110／120／135
  - → `liz-triple-up` 三連刃強化 M3 → triple-slash：powerPct 115／130／150
  - → `shadow-flurry` 影刃亂舞 A1：enemy／14／物 atk 45 近戰 ×6
- 尋寶：
  - `stealth` A1
  - → `treasure-sense` A1
  - → `smoke-bomb` 煙霧彈 A3：enemies／6／atk −20 3 回合
  - → `liz-smoke-up` 濃煙 M3 → smoke-bomb：powerPct 120／140／160
  - → `fortune-strike` 幸運一擊 A1：enemy／10／物 atk 260 近戰
- 身法：
  - `quickstep` 疾步 A3：self／3／spd +30 3 回合
  - → `liz-quick-up` 疾步延長 M3 → quickstep：turns 4／5／6
  - → `venom-edge` 毒刃 A3：enemy／5／物 atk 90 近戰，加上 poison 0.5
  - → `liz-venom-up` 劇毒刃 M3 → venom-edge：chance 0.6／0.75／0.9
  - → `phantom-step` 幻影步 A1：self／10／spd +60 4 回合，加上 atk +30 4 回合

**sylvie 希爾薇**（分支：狙擊、牽制、箭雨）
- 狙擊：
  - `aimed-shot` A3（免費）
  - → `sylvie-aim-up` 瞄準強化 M3 → aimed-shot：powerPct 110／120／135
  - → `heart-shot` 穿心箭 A3：enemy／8／物 atk 210
  - → `sylvie-heart-up` 穿心節流 M3 → heart-shot：tpDelta −1／−2／−3
  - → `starfall-arrow` 星墜一矢 A1：enemy／13／物 atk 340
- 牽制：
  - `pin-shot` A3
  - → `sylvie-pin-up` 釘足延長 M3 → pin-shot：turns 4／5／6
  - → `snare-shot` 絆索箭 A3：enemy／5／物 atk 80，加上 atk −25 3 回合
  - → `sylvie-snare-up` 絆索強化 M3 → snare-shot：powerPct 115／130／150
  - → `hunters-mark` 獵人標記 A1：enemy／10／物 atk 100，加上 def −40 4 回合
- 箭雨：
  - `arrow-rain` A3
  - → `sylvie-rain-up` 箭雨強化 M3 → arrow-rain：powerPct 110／120／135
  - → `fire-arrow` 火矢雨 A3：enemies／7／火 atk 70
  - → `sylvie-fire-up` 火矢強化 M3 → fire-arrow：powerPct 115／130／150
  - → `storm-volley` 雷霆箭雨 A1：enemies／15／雷 atk 85 ×2

新技能的 `desc` 自己寫一句，格式照現有技能，例如「火屬性全體魔法攻擊」。

- [ ] **Step 1: 寫失敗的測試**
  - `data/trees.test.ts`，每一項都對 `Object.keys(TREES)` 逐一檢查：
    - `each tree has 3 branches of 5 nodes and node ids are unique across trees`
    - `active nodes are skills of their owner; mod nodes name an active node of the same tree`
    - `mod nodes carry one mod per rank and powerPct rises with rank`：這是 spec 的「每級加成遞增」，Task 8 調旋鈕時也要遵守。
    - `an active above rank 1 has an effect that powerPct scales (damage, heal, buff, turret)`
    - `branch 0 tier 0 is a non-passive skill (the free one) and every tier-4 node has maxRank 1`
    - `every tier is reachable`：對每一條分支和每一個 t，階層 0 到 t − 1 的 `maxRank` 總和（分支 0 減 1，因為免費的那 1 級不算）≥ `TIER_GATE[t]`。
    - `the old kit is in the tree at its old level`：
      - `CHARACTERS[id].skills` 的每一個都是這棵樹的主動節點；
      - `LEGACY_LEARN_LEVEL[s] === SKILLS[s].learnLevel`。
      - Task 7 會改寫這一項。
    - `ACTIVE_RANK_PCT[0] is 100`
    - `every legendary power names an active node of a tree`：只檢查 `POWERS` 裡 `skill` 的擁有者已經有樹的那些。
  - `skills.test.ts`：`tpDelta never takes a TP skill below 1 and leaves a free skill free`
    - `patchSkill(SKILLS['flame-wave'], { tpDelta: −99 }).tp` 等於 1；
    - `patchSkill(SKILLS.stealth, { tpDelta: −1 }).tp` 等於 0。
  - `data.test.ts`：照 Files 改寫第 46–49 行。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/data src/scripts/games/starlantern/engine/skills.test.ts`
- [ ] **Step 3: 實作**
  - 用 `A(skill, maxRank)`、`M(id, name, skill, desc, mods)` 兩個小函式寫資料。
- [ ] **Step 4: 執行全套，確認全部通過**
  - 原因：`SkillDef` 的形狀有變。
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): skill-tree data for noel, chizuru, liz and sylvie`

### Task 3: 技能樹資料（後四位角色）

**Files:**
- Modify：`data/trees.ts`（`TREES` 改成 `Record<CharacterId, TreeDef>`；`LEGACY_LEARN_LEVEL` 補齊 27 個）、`data/skills.ts`
- Test：
  - `data/trees.test.ts`
  - `data/data.test.ts`：`heals belong to the healers` 的集合改成 `{ selene, chizuru, bobby }`，因為加了修理包與緊急維修。

**Interfaces:**
- Consumes：Task 2 的型別、規則與 `A`／`M`。
- Produces：`DEFAULT_CAPSTONE: Record<CharacterId, 0 | 1 | 2>`，表示預設配點走哪一條分支的終極。
  - scarlet 是 1，也就是紅蓮終焉；其他角色都是 0。(implementer's call → fixed here)

**scarlet 絲嘉蕾**（分支：守護、烈焰、鐵壁）
- spec 舉的「反擊分支」需要新的戰鬥機制，所以不做，見文末的衝突 3。
- 守護：
  - `provoke` A1（免費）
  - → `scarlet-provoke-up` 挑釁延長 M3 → provoke：turns 4／5／6
  - → `guardian-roar` 守護咆哮 A3：allies／6／def +20 3 回合
  - → `scarlet-roar-up` 咆哮強化 M3 → guardian-roar：powerPct 120／140／160
  - → `unbreakable` 不屈 A1：self／10／taunt 4，加上 def +60 4 回合
- 烈焰：
  - `flame-burst` A3
  - → `scarlet-burst-up` 爆炎強化 M3 → flame-burst：powerPct 110／120／135
  - → `blaze-ring` 炎環斬 A3：enemies／5／hpCost 0.1／火 atk 85 近戰
  - → `scarlet-ring-up` 炎環節制 M3 → blaze-ring：hpCost 0.08／0.06／0.04
  - → `crimson-end` 紅蓮終焉 A1：enemy／8／hpCost 0.3／火 atk 380 近戰
- 鐵壁：
  - `iron-wall` A3
  - → `scarlet-wall-up` 鐵壁延長 M3 → iron-wall：turns 4／5／6
  - → `shield-bash` 盾擊 A3：enemy／4／物 atk 120 近戰，加上 atk −20 3 回合
  - → `scarlet-bash-up` 盾擊強化 M3 → shield-bash：powerPct 115／130／150
  - → `fortress` 要塞 A1：allies／12／def +45 4 回合，加上 res +30 4 回合

**selene 瑟蕾**（分支：月光、祈禱、夢境）
- 月光：
  - `moonlight` A3（免費）
  - → `selene-moon-up` 月光強化 M3 → moonlight：powerPct 110／120／135
  - → `moon-rain` 月光雨 A3：allies／9／heal 60
  - → `selene-rain-up` 月光雨強化 M3 → moon-rain：powerPct 115／130／150
  - → `full-moon` 滿月之癒 A1：allies／18／heal 120，加上 cure
- 祈禱：
  - `cleanse` A1
  - → `rebirth` A1
  - → `selene-rebirth-up` 再生節流 M3 → rebirth：tpDelta −2／−4／−5
  - → `blessing` 祝福 A3：allies／7／res +30 3 回合，加上 def +15 3 回合
  - → `sanctuary` 聖域 A1：allies／14／def +35 4 回合、res +35 4 回合，加上 cure
- 夢境：
  - `dream` A1
  - → `selene-dream-up` 安眠節流 M3 → dream：tpDelta −1／−2／−3
  - → `moon-arrow` 月影箭 A3：enemy／5／冰 mag 130
  - → `selene-arrow-up` 月影強化 M3 → moon-arrow：powerPct 115／130／150
  - → `lunar-eclipse` 月蝕 A1：enemies／15／冰 mag 120，加上 sleep 0.4

**safira 莎菲拉**（分支：刃舞、戰舞、幻步）
- 刃舞：
  - `blade-dance` A3（免費）
  - → `safira-dance-up` 刃舞強化 M3 → blade-dance：powerPct 110／120／135
  - → `sand-cyclone` 沙暴旋舞 A3：enemies／9／物 atk 55 近戰 ×2
  - → `safira-cyclone-up` 旋舞強化 M3 → sand-cyclone：powerPct 115／130／150
  - → `thousand-shadows` 千影刃 A1：enemy／14／物 atk 45 近戰 ×7
- 戰舞：
  - `war-dance` A3
  - → `safira-war-up` 戰舞強化 M3 → war-dance：powerPct 115／130／150
  - → `veil-dance` 紗之舞 A3：allies／6／def +20 3 回合
  - → `safira-veil-up` 紗舞延長 M3 → veil-dance：turns 4／5／6
  - → `desert-festival` 沙漠祭典 A1：allies／16／atk +35 4 回合，加上 spd +35 4 回合
- 幻步：
  - `mirage` A3
  - → `safira-mirage-up` 幻步延長 M3 → mirage：turns 4／5／6
  - → `shadow-step` 影步斬 A3：enemy／6／物 atk 160 近戰
  - → `safira-shadow-up` 影步強化 M3 → shadow-step：powerPct 115／130／150
  - → `sirocco` 熱風 A1：enemies／13／火 atk 100

**bobby 波比**（技師、砲台；分支：砲台、整備、護盾）
- 砲台：
  - `turret` A3（免費）
  - → `bobby-turret-up` 砲台強化 M3 → turret：powerPct 110／120／135
  - → `cannon` 加農砲 A3：enemy／7／物 mag 170
  - → `bobby-cannon-up` 加農強化 M3 → cannon：powerPct 115／130／150
  - → `twin-turret` 雙砲台 M1 → turret：`{ powerPct: 160, turns: 4 }`。這是唯一的強化型終極。
- 整備：
  - `tinker` A1
  - → `repair-kit` 修理包 A3：ally／5／heal 90
  - → `bobby-repair-up` 修理強化 M3 → repair-kit：powerPct 115／130／150
  - → `overclock` 超頻 A3：allies／7／spd +25 3 回合
  - → `emergency-repair` 緊急維修 A1：allies／15／heal 80，加上 cure
- 護盾：
  - `barrier` A3
  - → `bobby-barrier-up` 護盾延長 M3 → barrier：turns 4／5／6
  - → `shock-mine` 電擊地雷 A3：enemies／7／雷 mag 70
  - → `bobby-mine-up` 地雷強化 M3 → shock-mine：powerPct 115／130／150
  - → `tesla-coil` 特斯拉線圈 A1：enemies／15／雷 mag 110

- [ ] **Step 1: 寫失敗的測試**
  - `trees.test.ts`：
    - `every character has a tree`
    - `every skill in SKILLS is an active node of exactly one tree, its owner's`
    - `every legendary power names an active node of its owner's tree`：檢查全部 `POWERS`，包括 lg-bobby 綁 turret、iron-bulwark-plate 綁 iron-wall。
    - `LEGACY_LEARN_LEVEL lists all 27 old skills`
  - `data.test.ts`：照 Files 修改。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/data`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
  - `npx vitest run src/scripts/games/starlantern/data`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): skill-tree data for scarlet, selene, safira and bobby`

### Task 4: 天賦盤資料

**Files:**
- Create：`data/talents.ts`、`data/talents.test.ts`

**Interfaces:**
- Produces（`data/talents.ts`）：
  - `type KeystoneId = 'crit-tp' | 'kill-tp' | 'weak-tp' | 'last-stand' | 'opening-gauge' | 'regen' | 'taunt-guard'`
  - `KEYSTONES: Record<KeystoneId, { name: string; desc: string }>`
  - `KEYSTONE_VALUES = { critTp: 2, killTp: 3, weakTp: 1, lastStandHp: 0.3, lastStandPct: 25, openingGauge: 25, regenPct: 3, tauntGuardPct: 20 }`
  - `TALENT_SCALE = 1`
  - `TALENT_PER: Partial<Record<AnyStat, number>>`：每 1 級的加值，實際加值還要再乘 `TALENT_SCALE`。
  - `BOARD_ROWS = 6`、`BOARD_COLS = 4`
  - `TEMPLATE: number[][]`：6 列 × 4 欄，每格是調色盤的索引。
  - `PALETTES: Record<CharacterId, AnyStat[]>`：每位角色 6 個屬性。
  - `CHAR_KEYSTONES: Record<CharacterId, KeystoneId[]>`：每位角色 3 個。
  - `DEFAULT_KEYSTONES`：取 `CHAR_KEYSTONES` 的前 2 個。
  - `interface TalentNode { id: string; row: number; col: number; maxRank: 1 | 5; stat?: AnyStat; keystone?: KeystoneId }`
  - `BOARDS: Record<CharacterId, TalentNode[]>`：用樣板產生。
    - 一般節點 24 個，id 是 `${char}-t${row}${col}`，`maxRank` 5；
    - 關鍵天賦 3 個，放在第 6 列、第 0–2 欄，id 是 `${char}-k${i}`，`maxRank` 1。
  - `TALENT_NODES: Record<string, { node: TalentNode; owner: CharacterId }>`
  - `KEYSTONE_GATE = 12`
  - `MAX_KEYSTONES = 2`：這是 spec 的值。

**天賦盤規則**（全部都是 implementer's call → fixed here；只寫在這裡，Task 9 照著實作）：
- 一般節點：
  - 第 0 列隨時可以點；
  - 第 r 列第 c 欄，需要第 r − 1 列第 c − 1、c、c + 1 欄之中有一格至少 1 級。
- 關鍵天賦**不受相鄰規則限制**。只有兩個條件：
  - 同一張盤的一般節點已經投入 ≥ `KEYSTONE_GATE` 點；
  - 已經點的關鍵天賦少於 `MAX_KEYSTONES` 個。

**數值**（全部都是 implementer's call → fixed here）：
- `TEMPLATE`：
  - `[[0,1,2,3],[4,5,0,1],[2,3,4,5],[0,1,2,3],[4,5,0,1],[2,3,4,5]]`
  - 每個屬性剛好出現 4 次。
- `TALENT_PER`：

| 屬性 | 每級 |
|---|---|
| str、int、agi、wil | 2 |
| atk、mag、def、res | 2 |
| hp | 10 |
| tp | 3 |
| spd | 1 |
| crit | 1 |
| critDmg | 4 |
| vuln | 3 |
| multi | 2 |
| armor、evasion | 12 |
| block | 2 |
| fireDmg、iceDmg、thunderDmg | 3 |
| heal | 3 |
| tpRegen | 0.2 |
| gauge | 3 |
| matFind | 5 |

- `PALETTES`：
  - noel：int、mag、fireDmg、iceDmg、thunderDmg、tp
  - chizuru：str、atk、hp、def、res、crit
  - liz：agi、atk、crit、critDmg、evasion、matFind
  - sylvie：agi、atk、crit、critDmg、vuln、spd
  - scarlet：str、hp、def、armor、block、fireDmg
  - selene：wil、mag、heal、tp、res、tpRegen
  - safira：agi、atk、multi、evasion、spd、crit
  - bobby：int、mag、tp、def、gauge、thunderDmg
- `CHAR_KEYSTONES`（前 2 個就是預設配點會點的）：
  - noel：weak-tp、opening-gauge、last-stand
  - chizuru：crit-tp、taunt-guard、opening-gauge
  - liz：crit-tp、kill-tp、last-stand
  - sylvie：weak-tp、crit-tp、kill-tp
  - scarlet：taunt-guard、regen、last-stand
  - selene：regen、opening-gauge、crit-tp
  - safira：kill-tp、crit-tp、opening-gauge
  - bobby：opening-gauge、weak-tp、regen
- `KEYSTONES` 的名稱與說明：
  - crit-tp：心眼，暴擊時回復 2 TP
  - kill-tp：乘勝，擊倒敵人時回復 3 TP
  - weak-tp：看破，打中弱點時回復 1 TP
  - last-stand：背水，HP 低於 30% 時，造成的傷害 +25%
  - opening-gauge：先機，戰鬥開始時絕技量表 +25
  - regen：再生，每回合結束時回復最大 HP 的 3%
  - taunt-guard：堅守，挑釁中受到的傷害 −20%
  - 說明裡的數字要從 `KEYSTONE_VALUES` 組出來，不要寫死。

- [ ] **Step 1: 寫失敗的測試**
  - `talents.test.ts`：
    - `each board has 24 normal nodes at rank 5 and 3 keystones at rank 1, ids unique across boards`
    - `every palette stat has a positive TALENT_PER value and appears 4 times on its board`
    - `keystones come from the catalogue, 3 distinct per character, and the descriptions show KEYSTONE_VALUES`：預期字串用 `KEYSTONE_VALUES` 組。
    - `normal nodes sit on the 6x4 grid and keystones on row 6`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/data/talents.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): talent-board data and the keystone catalogue`

### Task 5: 技能樹規則與成員欄位

**Files:**
- Create：`engine/progression.ts`、`engine/progression.test.ts`
- Modify：
  - `engine/types.ts`：`Member` 新增 `tree: Record<string, number>; talents: Record<string, number>`，兩個都必填。
  - `engine/party.ts`：`newMember` 填入 `tree: newTree(id)` 與 `talents: {}`。
  - `engine/state.ts`：`SAVE_VERSION = 5`。
- Test：`engine/save.test.ts`：新增一項。

**Interfaces:**
- Consumes：Task 2–3 的 `TREES`、`NODES`、`TIER_GATE`、`DEFAULT_CAPSTONE`、`LEGACY_LEARN_LEVEL`，以及 Task 2 的技能樹規則。
- Produces（`engine/progression.ts`，只 import 資料檔與 `./types`）：
  - 點數依裁定（見文末衝突 1）：
    - Lv2–4 每升一級給 1 個技能點；
    - 從 Lv5 起，每升一級剛好給 1 點：奇數級給技能點（5、7、…、49），偶數級給天賦點（6、8、…、50）。
  - `skillPoints(level: number): number`：`level ≤ 4` 時是 `level − 1`，否則是 `3 + ⌊(level − 3) / 2⌋`。Lv50 是 26。
  - `talentPoints(level: number): number`：`level < 6` 時是 0，否則是 `⌊(level − 4) / 2⌋`。Lv50 是 23。
  - 對任何 `level ≥ 1`，`skillPoints(level) + talentPoints(level) === level − 1`。
  - 每棵樹可投的點數（不含免費的 1 級；終極只算 1 個）：
    - noel、chizuru、sylvie、safira 是 36；scarlet、bobby 是 34；liz 是 32；selene 是 30。
    - Lv50 的填滿比例依序是 72%、76%、81%、87%。每棵樹在 Lv50 都填不滿。
  - `freeNode(id: CharacterId): string`、`newTree(id: CharacterId): Record<string, number>`，後者等於 `{ [freeNode]: 1 }`。
  - `nodeRank(m: Member, node: string): number`
  - `skillPointsLeft(m: Member): number`，等於 `skillPoints(level) − (等級總和 − 1)`。
  - `type RaiseFail = 'unknown' | 'max' | 'points' | 'req' | 'gate' | 'capstone'`
  - `canRaiseNode(m: Member, node: string): RaiseFail | null`：照 Task 2 的規則，檢查的順序就是這個型別的順序：
    - 不是這位角色的節點：unknown
    - 已經最高級：max
    - 沒有點數：points
    - 前一階層的節點是 0 級：req
    - 分支門檻不夠（免費的那 1 級不算）：gate
    - 已經有別條分支的終極：capstone
  - `raiseNode(m: Member, node: string): { ok: true; member: Member } | { ok: false; reason: RaiseFail }`：不會改動傳進來的成員。
  - `defaultTree(id: CharacterId, level: number): Record<string, number>`
    - 從 `newTree(id)` 開始，一級一級模擬：L 從 2 到 `level`，在 L 級投入 `skillPoints(L) − skillPoints(L − 1)` 點。
    - 每 1 點依下面的優先順序，取第一個 `canRaiseNode === null` 的節點。各類裡都依 (目前等級, 階層, 分支) 由小到大；一律不含 `DEFAULT_CAPSTONE` 以外分支的終極。
      1. **到期的舊技能**：`LEGACY_LEARN_LEVEL` 裡這位角色、還是 0 級、而且 `legacyDue(skill) ≤ L` 的技能，舊等級小的先。
         - `legacyDue(skill)` 是「≤ 舊等級、而且 `skillPoints(L) > skillPoints(L − 1)`」的最大等級 L。
         - 這樣隊伍在舊等級時，技能組合和以前一樣。
      2. **已學技能的升級**：已經 ≥ 1 級的主動節點，或「被強化的技能已經學會」的強化節點。
      3. **新節點**：其餘節點，但不含還沒到期的舊技能。
      4. **提早學舊技能**：只有前三類都沒有可點的節點時，才可以學還沒到期的舊技能，舊等級小的先。
    - 沒有候選時就停下。
    - (coordinator ruling；同分排序與 `DEFAULT_CAPSTONE` 是 Task 6 的平衡旋鈕，四個類別的順序不是)

**預設配點學會舊技能的等級**（依上面的公式與順序算出；每一個都是 `legacyDue`，也就是「≤ 舊等級、而且有技能點」的最大等級）：

| 角色 | 技能（現在／舊等級） |
|---|---|
| noel | ice-star 2／2、hex 4／4、thunder-star 5／6 |
| chizuru | ward 3／3、pierce 5／5 |
| liz | stealth 2／2、treasure-sense 4／4、triple-slash 5／6 |
| sylvie | pin-shot 3／3、arrow-rain 5／6 |
| scarlet | flame-burst 3／3、iron-wall 5／5 |
| selene | cleanse 2／2、dream 4／4、rebirth 5／6 |
| safira | war-dance 3／3、mirage 5／5 |
| bobby | tinker 2／2、barrier 4／4 |

- 舊 Lv6 的四個技能（thunder-star、triple-slash、arrow-rain、rebirth）在 Lv5 學會。
  - 原因：點數公式在 Lv6 給的是天賦點，Lv5 是 ≤ 6 而且有技能點的最後一級。
  - 這樣隊伍到 Lv6 時，技能組合和以前一樣。
- 這四個技能的前置都在 Lv5 以前學會（hex、twin-slash、無、cleanse），而且階層 0–1 的門檻是 0，所以都不受分支門檻影響。
- 沒有角色在同一級有兩個舊技能到期，Lv5 的 1 點一定夠用。
- 為了讓這張表成立：noel 的雷咒分支改成 hex 當根、thunder-star 在階層 1（見 Task 2）；liz 的三連刃在階層 1。兩者都已經核准。
- 免費技能都是 Lv1。
- 沒有任何舊技能比 `legacyDue` 更早學會：每位角色在舊技能之間的點數，都有已學技能的升級或強化節點可以點。

- [ ] **Step 1: 寫失敗的測試**
  - `progression.test.ts`：
    - `skill points on every level to 4, then odd levels for skills and even levels for talents`
      - `skillPoints` 在 1、2、4、5、6、7、50 級分別是 0、1、3、4、4、5、26；
      - `talentPoints` 在 5、6、7、8、50 級分別是 0、1、1、2、23；
      - 等級 1–50，`skillPoints + talentPoints === level − 1`。
    - `no tree fills by Lv50`
      - 對每位角色：可投總數 > `skillPoints(50)`；
      - 填滿比例 `skillPoints(50) / 可投總數` 介於 0.6 與 0.9 之間。
    - `a new member knows only the free first skill`
      - `newMember('noel').tree` 等於 `{ 'fire-star': 1 }`，`talents` 等於 `{}`；
      - `skillPointsLeft` 是 0。
    - `raising spends a point and is refused without points, past max, without the previous node, under the gate`（每一點都用新的成員）：
      - noel Lv2 點 ice-star：成功，剩 0 點；再點一次是 `points`。
      - noel Lv10、還沒點 ice-star 時點 noel-ice-up：`req`。
      - noel Lv10：ice-star 1 級、noel-ice-up 1 級之後，點 frost-bind 成功（2 ≥ `TIER_GATE[2]`）；接著點 noel-bind-up 是 `gate`（3 < `TIER_GATE[3]`）。
      - noel Lv10：fire-star 點到 3 級後再點：`max`。
      - noel 點 sweep：`unknown`。
    - `the free rank does not count toward the branch gate`（邊界）：
      - noel Lv10 只有免費的 fire-star 時，點 noel-fire-up 成功（`TIER_GATE[1]` 是 0）；
      - 這時點 flame-wave 是 `gate`（低階層 0 + 1 = 1 < 2）；
      - fire-star 再升 1 級後，點 flame-wave 成功（1 + 1 = 2）。
    - `only one capstone per character`
      - noel Lv50 先點到 inferno，再把雷咒分支點到門檻，去點 judgement：`capstone`。
    - `a refused raise changes nothing and raiseNode never mutates its input`
      - 用 `structuredClone` 前後比對。
    - `defaultTree spends every point it legally can`
      - 8 位角色 × 等級 1、2、3、5、10、20、38、50；
      - 投入的點數等於 `min(skillPoints(level), 可投總數)`；
      - 終極最多 1 個，而且在 `DEFAULT_CAPSTONE` 那條分支；
      - 從 `newTree` 依 (分支, 階層) 的順序，用 `raiseNode` 一級一級重放，全部都會成功。
    - `defaultTree learns every old skill at its old level, or at the first level with a skill point after it`
      - 對每個 `LEGACY_LEARN_LEVEL` 的技能：第一個 `defaultTree(owner, L)[skill] ≥ 1` 的等級 L，等於上表的「現在」；
      - 而且 L ≤ `LEGACY_LEARN_LEVEL[skill]`，同時 L 等於 `legacyDue(skill)`，也就是「≤ 舊等級、而且 `skillPoints(L) > skillPoints(L − 1)`」的最大等級。舊 Lv6 的技能因此是 Lv5。
    - `early points go to upgrades, not to old skills ahead of time`
      - noel Lv3：`defaultTree('noel', 3)` 有 noel-fire-up 或 noel-ice-up 至少 1 級，而且 hex 與 thunder-star 都是 0 級。
    - Review Focus 5：`at Lv50 the default tree spends all 26 points and still has an open node`
  - `save.test.ts`：`a version-4 save reports version`，寫法同第 126 行。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/progression.test.ts src/scripts/games/starlantern/engine/save.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - 原因：`Member` 的形狀有變。
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): skill-tree rules, member tree and talents fields, save v5`

### Task 6: 所有讀取端改用技能樹（6a，舊欄位暫時保留）

**Files:**
- Modify：
  - `engine/progression.ts`：新增 `learnedSkills`、`treeSkills`。
  - `engine/party.ts`：刪掉 `learnedSkills(id, level)`；`hasPassive` 與 `gainExp` 改寫。
  - `engine/game.ts`：`BattleEnd.levelUps` 跟著 `LevelUp` 的新形狀。
  - `engine/compare.ts`：`ItemLine` 新增 `learned?: boolean`。
  - `engine/sim.ts`：`partyAt` 套用 `defaultTree`；`choose` 改用 `learnedSkills(m)`。
  - `ui2/scenes/battle.ts`：技能清單改用 `learnedSkills(m)`。
  - `ui2/battleText.ts`：`levelUpLines` 改成顯示點數。
  - `ui2/scenes/statusTabs.ts`：
    - 「技能」分頁只列已學會的技能，並顯示等級；
    - 「裝備」分頁的特效行，`usable && learned === false` 時顯示「尚未習得」（第 207 行附近）。
  - `ui2/scenes/equip.ts`：顯示「尚未習得」。
  - `data/text.zh-TW.ts`：
    - 新增 `T.battle.points(name, skill, talent)`、`T.ui2.status.rank(r, max)`、`T.gear.notLearned`；
    - 刪掉 `T.battle.learned`、`T.ui2.status.at`、`T.ui2.status.learned`。它們唯一的讀取者是 `battle.ts:470` 與 `statusTabs.ts:231`，本任務都會改掉。
  - 平衡旋鈕：`data/skills.ts`（新技能的 `power`／`tp`）、`data/trees.ts`（`DEFAULT_CAPSTONE`）。
- Test（會壞的，以及要怎麼改）：
  - `engine/party.test.ts`：
    - 第 139–144 行：`r.learned` 改成 `expect(r.points).toEqual({ skill: 2, talent: 0 })`，測試名稱的 `learns skills` 改成 `gains points`；
    - 第 175–184 行：改成依技能樹，見下面的新測試。
  - `engine/game.test.ts`：第 218 行的 `liz.level = 2` 改成 `liz.tree = { 'twin-slash': 1, stealth: 1 }`。
  - `ui2/scenes/battle.test.ts`：第 142–144 行的 `scarlet.level = 5` 改成 `scarlet.tree = { provoke: 1, 'iron-wall': 1 }`，註解跟著改。
  - `engine/battle.test.ts`：第 296–301 行（sim 的莉茲 Lv6）不用改，但要確認仍然通過：
    - `defaultTree('liz', 6)` 有 twin-slash 與 triple-slash（Lv5 學會），三連刃 165 仍然勝過雙刃 120；
    - 戴上 lg-liz 後，雙刃 180 勝出。
  - `engine/compare.test.ts`、`ui2/scenes/status.test.ts`、`ui2/scenes/equip.test.ts`：新增，見下面。
  - 開工前先跑 `grep -rn "learnedSkills\|\.learned\b\|T.battle.learned\|status.at(" src/scripts/games/starlantern tests/e2e`，找到的其他地方一併改，並加進上面的清單與這次的 commit。

**Interfaces:**
- Consumes：Task 5 的 `defaultTree`。
- Produces（`engine/progression.ts`）：
  - `learnedSkills(m: Member): string[]`：主動節點（含被動技能）中至少 1 級的技能 id，依樹的順序（分支 0 的階層 0–4，再到分支 1、分支 2）。
  - `treeSkills(id: CharacterId): string[]`：這棵樹全部主動節點的技能 id。
- Produces（`engine/party.ts`）：
  - `LevelUp` 改成 `{ id: CharacterId; levels: number; points: { skill: number; talent: number } }`。
  - `gainExp` 回傳 `{ member, levels, points }`，其中 `points` = 新等級的點數減掉舊等級的點數。
  - `hasPassive(p, passive)`：上場、hp > 0，而且 `learnedSkills(m)` 裡有那個被動技能。
- Produces（`engine/compare.ts`）：有 wearer 時，特效行帶：
  - `usable: treeSkills(wearer.id).includes(power.skill)`：spec 說的「學會或可學的樹技能」；
  - `learned: learnedSkills(wearer).includes(power.skill)`。
  - 介面上：`usable === false` 時照舊顯示「此角色無法發動」；`usable && learned === false` 時顯示 `T.gear.notLearned`「（尚未習得）」，而且不調暗。
- 文案：`T.battle.points(name, skill, talent)`
  - 輸出 `${name} 獲得技能點 ${skill}`；
  - `talent > 0` 時，後面再接 `、天賦點 ${talent}`；
  - `skill` 是 0、`talent > 0` 時，只輸出 `${name} 獲得天賦點 ${talent}`。

- [ ] **Step 1: 寫失敗的測試**
  - `progression.test.ts`：
    - `learnedSkills follows the tree, in tree order`
      - `learnedSkills(newMember('liz'))` 等於 `['twin-slash']`；
      - tree 是 `{ 'twin-slash': 1, stealth: 1, quickstep: 2 }` 時，等於 `['twin-slash', 'stealth', 'quickstep']`。
    - `treeSkills('noel') has the 4 old skills and 5 new ones`：一共 9 個。
  - `party.test.ts`：
    - `hasPassive needs the learned node, not the level`：liz Lv10 沒點 stealth 是 false；點了是 true；倒下時是 false。
    - `gainExp reports the points gained`
      - Lv4 升到 Lv6 時是 `{ skill: 1, talent: 1 }`；
      - Lv50 時是 `{ skill: 0, talent: 0 }`。
    - `partyAt gives each member the default tree`：`partyAt(10).roster.noel.tree` 等於 `defaultTree('noel', 10)`。
  - `compare.test.ts`：`a power in the tree but not learned is usable and marked not learned`
    - frost-bloom-neck（綁 ice-star）給新的 noel：`usable` 是 true，`learned` 是 false；
    - lg-bobby 給新的 bobby：兩個都是 true；給 scarlet：`usable` 是 false。
  - `status.test.ts`：
    - `the skills tab lists only learned skills with their rank`：noel 有「火之星彈」與「1／3」，沒有「冰之星彈」。
    - `the gear tab marks a power the member has not learned as 尚未習得`
  - `equip.test.ts`：`a power the wearer has not learned yet shows 尚未習得 and is not dimmed`
  - `ui2/scenes/battle.test.ts`：`the result lists the points a level-up brings`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/progression.test.ts src/scripts/games/starlantern/engine/party.test.ts src/scripts/games/starlantern/engine/compare.test.ts src/scripts/games/starlantern/ui2/scenes/status.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過，包括 balance**
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
  - balance 紅了，只能調這個任務的旋鈕：新技能的 `power`／`tp`、`DEFAULT_CAPSTONE`、`defaultTree` 的同分排序。
  - 舊技能的學習等級表（Task 5）必須仍然成立。
  - **平衡風險：**
    - 在每個舊等級，隊伍的舊技能組合都和以前一樣。唯一的差別是：舊 Lv6 的四個技能在 Lv5 就有了，比以前早 1 級。balance 沒有任何一項是在 Lv5 測的。
    - 所以第 4 項（Lv2、Lv6、Lv9）、第 5 項（Lv4 在第 3 層的勝率 ≤ 0.6）與第 6 項（Lv11 頭目）面對的舊技能組合，都和以前相同。
    - 差異只來自 Lv5 以後多學的新技能，以及強化節點與等級（要到 Task 8 才有效果）。
    - 如果某一項變紅，而新技能數值、`DEFAULT_CAPSTONE` 與同分排序都調不回來，就停下來回報。不可以為了平衡改動 Task 5 的四個類別順序，也不可以改動 `legacyDue`。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): skills come from the tree; level-ups bring skill and talent points`

### Task 7: 刪掉舊的學習欄位（6b）

**Files:**
- Modify：
  - `engine/types.ts`：刪掉 `SkillDef.learnLevel` 與 `CharacterDef.skills`。
  - `data/skills.ts`：刪掉 27 個 `learnLevel`。
  - `data/characters.ts`：刪掉 `skills`。
- Test：
  - `data/data.test.ts`：第 24–35 行的 `gives every character 3–4 owned skills with one usable at level 1` 刪掉，因為 `trees.test.ts` 已經涵蓋。
  - `data/trees.test.ts`：`the old kit is in the tree at its old level` 改成「`LEGACY_LEARN_LEVEL` 的每個技能都是擁有者那棵樹的主動節點；等級 1 的就是 `freeNode`」。
  - `engine/skills.test.ts`：第 84、165 行的 fixture 刪掉 `learnLevel: 1`。
- 開工前先跑 `grep -rn "learnLevel\|\.skills\b" src/scripts/games/starlantern`。除了敵人的 `def.skills`／`EnemyDef.skills`，不可以還有其他讀取者；有的話，表示 Task 6 漏改，要在這裡一起改並列出。

- [ ] **Step 1: 改寫測試**
  - 照 Files 修改。
- [ ] **Step 2: 執行，確認在刪欄位之前就能通過**
  - `npx vitest run src/scripts/games/starlantern/data src/scripts/games/starlantern/engine/skills.test.ts`
- [ ] **Step 3: 刪除欄位**
- [ ] **Step 4: 執行全套，確認全部通過**
  - `npx vitest run src/scripts/games/starlantern --testTimeout=20000`
- [ ] **Step 5: commit**
  - 訊息：`refactor(starlantern): drop learnLevel and CharacterDef.skills now the tree decides`

### Task 8: 技能等級與強化節點改寫技能

**Files:**
- Modify：
  - `engine/progression.ts`：新增 `treeMods`。
  - `engine/battle.ts`：`skillFor`、`skillCost`、`fromMember`，以及 `'skill'` 行動的檢查。
  - `engine/combatant.ts`：`Combatant` 新增 `ranks?: Record<string, number>`。
  - `ui2/scenes/statusTabs.ts`：「技能」分頁的 caster 帶上 `ranks`。
  - 平衡旋鈕：`data/trees.ts`（`ACTIVE_RANK_PCT[1..2]` 與強化節點的數值）。
- Test：`engine/skills.test.ts`、`engine/battle.test.ts`

**Interfaces:**
- Consumes：Task 2 的 `NODES`、`ACTIVE_RANK_PCT`；Task 6 的 `learnedSkills`。
- Produces：
  - `treeMods(ranks: Record<string, number>, skill: string): SkillMod[]`
    - 先放主動節點本身的等級：倍率不是 100 時，放 `{ powerPct: ACTIVE_RANK_PCT[rank − 1] }`；
    - 再依樹的順序，放每一個 `skill` 是它、而且至少 1 級的強化節點的 `mods[rank − 1]`。
  - `skillFor(c: Pick<Combatant, 'powers' | 'ranks'>, id: string): SkillDef | undefined`
    - 先套 `treeMods`，再套身上的特效，`extra` 照舊最後才加。
    - 沒有任何改寫時，回傳 `SKILLS[id]` 本身。現有的 `toBe(SKILLS.pierce)` 測試靠這一點。
  - `skillCost(c: Pick<Combatant, 'x' | 'powers' | 'ranks'>, id: string): number`：改讀 `skillFor(c, id)?.tp`，其餘規則不變。
  - `fromMember` 設定 `ranks: { ...m.tree }`。敵人和測試用的 combatant 沒有 `ranks`。
  - `'skill'` 行動：`actor.ranks` 存在、而且 `(actor.ranks[act.skill] ?? 0) === 0` 時，什麼都不做，也不寫 log。(implementer's call → fixed here)

測試裡的 `mod(id, r)` 是 `NODES[id].node.mods![r − 1]`，預期值一律從它和 `ACTIVE_RANK_PCT` 算。

- [ ] **Step 1: 寫失敗的測試**
  - `skills.test.ts`：
    - `an active's rank scales its power by ACTIVE_RANK_PCT`
      - ranks 是 `{ 'fire-star': 3 }` 時，威力是 `Math.round(140 × ACTIVE_RANK_PCT[2] / 100)`；
      - 1 級時 `toBe(SKILLS['fire-star'])`。
    - `a modifier node rewrites its skill at its rank`
      - `{ 'fire-star': 1, 'noel-fire-up': 2 }` 時，威力是 `Math.round(140 × mod('noel-fire-up', 2).powerPct / 100)`；
      - `{ 'flame-wave': 1, 'noel-wave-up': 3 }` 時，`skillCost` 是 `Math.max(1, SKILLS['flame-wave'].tp + mod('noel-wave-up', 3).tpDelta)`。
    - `the tree applies before worn powers`
      - `{ 'fire-star': 2 }` 加上 lg-noel：
        - 威力是 `Math.round(Math.round(140 × ACTIVE_RANK_PCT[1] / 100) × POWERS['lg-noel'].mod.powerPct / 100)`；
        - 目標是 enemies。
    - `hpCost and the turret capstone come through`
      - `{ 'blaze-ring': 1, 'scarlet-ring-up': 3 }` 時，`hpCost` 等於 `mod('scarlet-ring-up', 3).hpCost`；
      - `{ turret: 1, 'twin-turret': 1 }` 時：
        - turret 的 power 是 `Math.round(70 × mod('twin-turret', 1).powerPct / 100)`；
        - turns 是 `mod('twin-turret', 1).turns`。
  - `battle.test.ts`：
    - Review Focus 4：`a member cannot cast a skill whose node is unlearned`
      - noel 只有 fire-star，送出 `{ kind: 'skill', skill: 'ice-star' }`；
      - 結果 TP 不變，log 裡沒有 noel 的 `act`。
    - `a combatant without ranks still casts any skill`：保護現有測試的寫法。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/skills.test.ts src/scripts/games/starlantern/engine/battle.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過，包括 balance**
  - 只能調 `ACTIVE_RANK_PCT[1..2]` 與強化節點的數值，而且要保持「每級加成遞增」。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): skill ranks and modifier nodes rewrite skills, before legendary powers`

### Task 9: 天賦規則、屬性來源與預設天賦

**Files:**
- Modify：
  - `engine/progression.ts`
  - `engine/party.ts`：`StatSource` 新增 `'talent'`；`statSources` 的順序改成 base、growth、gear、set、talent、primary。
    - 天賦給的主屬性，和裝備、套裝一樣會換算。(implementer's call → fixed here)
  - `engine/sim.ts`：`partyAt` 也套用 `defaultTalents`。
  - `data/text.zh-TW.ts`：`T.ui2.status.sources.talent` 是「天賦」。
  - 平衡旋鈕：`data/talents.ts`（`TALENT_SCALE`）。
- Test：
  - `engine/progression.test.ts`、`engine/party.test.ts`：新增。
  - `ui2/scenes/status.test.ts`：第 179 行的欄位清單改成 `['', '基礎', '成長', '裝備', '套裝', '天賦', '主屬性', '上限', '合計']`。

**Interfaces:**
- Consumes：Task 4 的 `BOARDS`、`TALENT_NODES`、`TALENT_PER`、`TALENT_SCALE`、`KEYSTONE_GATE`、`MAX_KEYSTONES`、`DEFAULT_KEYSTONES`，以及 Task 4 的天賦盤規則。
- Produces：
  - `talentPointsLeft(m: Member): number`
  - `type TalentFail = 'unknown' | 'max' | 'points' | 'adjacent' | 'gate' | 'keystones'`
  - `canRaiseTalent(m: Member, node: string): TalentFail | null`：照 Task 4 的規則，檢查的順序就是這個型別的順序。
    - `adjacent` 只檢查一般節點；關鍵天賦只檢查 `gate` 與 `keystones`。
  - `raiseTalent(m: Member, node: string): { ok: true; member: Member } | { ok: false; reason: TalentFail }`：不會改動傳進來的成員。
  - `talentStats(m: Member): Partial<Sheet>`：每個一般節點加上 `stat` × `TALENT_PER[stat]` × `TALENT_SCALE` × 等級。
  - `keystonesOf(m: Member): KeystoneId[]`
  - `defaultTalents(id: CharacterId, level: number): Record<string, number>`
    - 一共投 `talentPoints(level)` 次；
    - 每次先看 `DEFAULT_KEYSTONES` 裡有沒有可以點的，有就點；
    - 沒有的話，在可以點的一般節點裡，依 (目前等級, 列, 欄) 由小到大，取第一個。

測試裡的 `per(stat)` 是 `TALENT_PER[stat]! × TALENT_SCALE`。

- [ ] **Step 1: 寫失敗的測試**
  - `progression.test.ts`：
    - `row 0 is open; a lower row needs a raised node diagonally or straight above`
      - noel Lv6（1 點）點 noel-t10：`adjacent`；點 noel-t00：成功。
      - Lv8（還剩 1 點）點 noel-t13：`adjacent`；再點 noel-t10：成功。
    - `a normal node stops at 5`
    - `keystones need 12 board points and nothing else`（邊界）：
      - 一般節點 11 點時，點 noel-k0 是 `gate`；12 點時成功；
      - 這 12 點全部放在第 0–1 列（第 5 列是空的）時，一樣成功，表示關鍵天賦不受相鄰規則限制。
    - `at most 2 keystones, and only the character's own`
      - 第 3 個是 `keystones`；點 chizuru-k0 是 `unknown`。
    - `talentStats multiplies per-rank values`
      - noel-t00 是 int；3 級時，`talentStats` 等於 `{ int: 3 × per('int') }`。
    - `defaultTalents spends every point legally with at most the 2 default keystones`
      - 8 位角色 × 等級 4、5、6、20、30、38、50；
      - 投入的點數等於 `talentPoints(level)`；
      - 從空的天賦開始，一般節點依 (列, 欄) 的順序、關鍵天賦放最後，用 `raiseTalent` 一級一級重放，全部都會成功。
  - `party.test.ts`：`talent primaries convert like gear`
    - noel 在 noel-t00 點 3 級後，`sheetOf(...).mag` 比點之前多 `3 × per('int') × 1.5`；1.5 是 5a 的 affinity 倍率。
    - `statSources` 有一欄 `source: 'talent'`。
  - `status.test.ts`：照 Files 修改第 179 行。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/progression.test.ts src/scripts/games/starlantern/engine/party.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過，包括 balance**
  - 只能調 `TALENT_SCALE`。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): talent rules, a talent stat source and default talents in the sim`

### Task 10: 關鍵天賦的戰鬥效果

**Files:**
- Modify：
  - `engine/combatant.ts`：`Combatant` 新增 `keystones: KeystoneId[]`；在 `calcDamage` 裡處理 last-stand 與 taunt-guard。
  - `engine/battle.ts`：`fresh()` 給 `keystones: []`；`fromMember` 用 `keystonesOf(m)`；opening-gauge 寫在 `createBattle`；regen 寫在 `endOfRound`。
  - `engine/skills.ts`：在 `applyEffect` 的 damage 分支裡，處理 crit-tp、kill-tp、weak-tp。
  - `engine/testing.ts`：`makeCombatant` 預設 `keystones: []`。
  - 平衡旋鈕：`data/talents.ts`（`KEYSTONE_VALUES`）。
- Test：`engine/combatant.test.ts`、`engine/skills.test.ts`、`engine/battle.test.ts`

**Interfaces:**
- Consumes：Task 4 的 `KEYSTONE_VALUES`；Task 9 的 `keystonesOf`。
- 各效果的實作（`V` 是 `KEYSTONE_VALUES`）：
  - **last-stand**：`a.hp < a.max.hp × V.lastStandHp` 時，`mult *= 1 + V.lastStandPct / 100`。
  - **taunt-guard**：`t.taunt > 0` 時，`mult *= 1 − V.tauntGuardPct / 100`。
  - **crit-tp**、**weak-tp**、**kill-tp**：每一下命中各自結算，TP 不超過上限，記一個 `{ type: 'tp' }` 事件。
  - **opening-gauge**：開戰時，`limit = min(LIMIT_MAX, limit + V.openingGauge)`。
  - **regen**：每回合結束時，活著的成員回復 `floor(max.hp × V.regenPct / 100)`，記一個 heal 事件。
  - 這些效果都不會多抽亂數。

- [ ] **Step 0: 記錄改動前的基準**（在改任何程式之前）
  - 寫一個暫時的腳本或測試，跑下面這場戰鬥：
    - `party = partyAt(20)`：Lv20 的天賦點是 8，不到 `KEYSTONE_GATE`，所以沒有關鍵天賦；
    - `createBattle({ party, enemyIds: ['golem', 'shade'], inventory: {}, revealed: {}, scale: { depth: 5, region: 'mainline' } })`；
    - rng 是包住 `mulberry32(7919)`、會計數的函式；
    - 每回合用 `choose(s, party)`，最多 60 回合。
  - 記下：結局、回合數、rng 被呼叫的次數、每位成員最後的 hp。
  - 把這四個值寫進下面的基準測試，當作改動前的錄影。
- [ ] **Step 1: 寫失敗的測試**（用 `makeCombatant` 的預設值 atk 20、def 20，`constRng(0.5)`，一下是 20 點）
  - `combatant.test.ts`：
    - `last-stand: below the threshold a hit deals lastStandPct more`
      - hp 比 `V.lastStandHp × 100` 少 1 時，是 `Math.floor(20 × (1 + V.lastStandPct / 100))`；
      - hp 剛好等於門檻時是 20；沒有關鍵天賦時是 20。
    - `taunt-guard: a taunting member takes tauntGuardPct less`：是 `Math.floor(20 × (1 − V.tauntGuardPct / 100))`。
  - `skills.test.ts`：
    - `crit-tp, kill-tp and weak-tp refill TP, held to the maximum`
      - crit 100 的攻擊者 +`V.critTp`；擊倒 +`V.killTp`；打中弱點 +`V.weakTp`；TP 已滿時是 +0。
  - `battle.test.ts`：
    - `opening-gauge starts the gauge at +openingGauge, held to 100`
    - `regen heals regenPct of max HP at the end of each round`
    - `a fight with no keystones replays the pre-change baseline`
      - 跑 Step 0 的同一場戰鬥，結局、回合數、rng 呼叫次數、最後的 hp 都等於 Step 0 記下的值。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/combatant.test.ts src/scripts/games/starlantern/engine/skills.test.ts src/scripts/games/starlantern/engine/battle.test.ts`
  - 預期：關鍵天賦的測試失敗，基準測試通過。
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過，包括 balance 與基準測試**
  - 只能調 `KEYSTONE_VALUES`。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): keystone talents in battle`

### Task 11: 存檔驗證配點

**Files:**
- Modify：`engine/progression.ts`、`engine/save.ts`
- Test：`engine/progression.test.ts`、`engine/save.test.ts`

**Interfaces:**
- Produces：`validBuild(id: CharacterId, level: number, tree: unknown, talents: unknown): boolean`
  - 形狀檢查：
    - 兩個都必須是物件；值必須是 ≥ 1 的整數；
    - 鍵必須是這位角色的節點；
    - 免費節點至少 1 級。
  - 其餘的規則**不重寫**，用重放的方式交給 `canRaiseNode`／`canRaiseTalent`：
    - 從 `newTree(id)` 與空的天賦開始，成員等級設成 `level`；
    - 反覆掃過輸入裡「還沒到目標等級」的節點，只要 `canRaiseNode` 回傳 null 就升 1 級；
    - 直到一輪都沒有進展為止；
    - 天賦也一樣，用 `canRaiseTalent`。
  - 最後兩邊都和輸入完全相同，才是合法的。
  - 規則都是單調的（多點一點不會讓別的節點變得不能點，終極與關鍵天賦的上限除外，而超過上限本來就不合法），所以重放的順序不影響結果。
- `save.ts` 的 `isValid`：每位成員都要通過 `validBuild(id, m.level, m.tree, m.talents)`。

- [ ] **Step 1: 寫失敗的測試**
  - `progression.test.ts`：`validBuild accepts every default build`：8 位角色 × 等級 1、10、30、50。
  - `save.test.ts`：
    - `a member built at Lv20 round-trips`：用 `defaultTree` 與 `defaultTalents`。
    - Review Focus 2：`save validation rejects a broken build`，以下每一種都回報 corrupt：
      - 未知節點；
      - 等級 4；
      - 等級 0；
      - 超支（Lv2 除了免費節點，還有兩個節點各 1 級）；
      - 缺少免費節點；
      - 兩個終極；
      - 天賦不相鄰；
      - 三個關鍵天賦；
      - 沒有 tree 欄位。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/progression.test.ts src/scripts/games/starlantern/engine/save.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行全套，確認全部通過**
  - `save.test.ts:63`（`liz.level = 35` 仍然是 ok）不用改：在上限內少點是合法的。
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): save v5 validates every member's skill tree and talents`

### Task 12: 旅館重置

**Files:**
- Modify：
  - `engine/progression.ts`：新增 `resetBuild`。
  - `engine/town.ts`：新增 `respecCost`、`respec`。
  - `ui2/scenes/inn.ts`
  - `data/text.zh-TW.ts`：`T.ui2.inn.respec`、`askRespec`、`respecDone`、`nothingToReset`。
- Test：
  - `engine/town.test.ts`：新增。
  - `ui2/scenes/inn.test.ts`：新增測試。檔案裡沒有指令清單的測試（現有的在第 21、34、53、61 行），所以這裡是新增，不是修改。

**Interfaces:**
- Produces：
  - `resetBuild(m: Member): Member`，等於 `{ ...m, tree: newTree(m.id), talents: {} }`。
  - `respecCost(level: number): number`，等於 `25 × level`。(implementer's call → fixed here)
  - `respec(s: GameState, memberId: CharacterId): TownResult`
    - 技能樹和天賦一起重置；
    - 金幣不夠時是 `gold`；
    - 沒有點過任何點（tree 等於 `newTree`、talents 是空的）或沒有這位成員時，是 `invalid`；
    - 成功時用 `clampToMax`（town.ts 裡的私有函式）把 hp、tp 壓回新的上限。
- 旅館指令新增「重置配點」：
  - 選單列出已招募的成員，右欄是費用；
  - 選了之後跳確認框，預設游標在「否」；
  - 用 `game.apply` 套用，成功後顯示 `T.ui2.inn.respecDone(name)`；
  - 只在旅館才有，地城裡不能重置。(implementer's call → fixed here)

- [ ] **Step 1: 寫失敗的測試**
  - `town.test.ts`：
    - `respec costs 25 G per level and refunds every point`
      - Lv10、金幣 300 時：金幣變成 `300 − respecCost(10)`，tree 等於 `newTree`，talents 是 `{}`。
    - Review Focus 3：`respec clamps HP and TP to the lower maximum`
      - 先點 hp 天賦並補滿 HP，重置後 `hp === statsOf(m).hp`。
    - Review Focus 3：`respec is refused without gold or with nothing spent, and costs nothing then`
  - `inn.test.ts`：
    - `the inn offers 休息, 復活 and 重置配點`
    - `重置配點 lists members with their price and resets after a yes`
    - `no leaves everything as it was`
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/engine/town.test.ts src/scripts/games/starlantern/ui2/scenes/inn.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): reset skill trees and talents at the inn for gold`

### Task 13: 共用的兩段式投點，以及狀態頁「技能樹」分頁

**Files:**
- Create：`ui2/spendPress.ts`、`ui2/spendPress.test.ts`
- Modify：
  - `ui2/scenes/statusTabs.ts`：新增 `tree` 分頁，放在 skills 與 ultimate 之間；export `resetTreeView`。
  - `data/text.zh-TW.ts`：`T.ui2.status.tabs.tree` 是「技能樹」；以及 `T.ui2.tree.*`、`T.ui2.status.hintTree`。
  - `src/styles/_starlantern-ui.scss`
- Test：`ui2/scenes/status.test.ts`
  - 現有的 `switches tabs with left/right and the mouse`（第 52–63 行）：分頁變成 5 個，從 ultimate 回到「能力」要按 4 次 left（原本 3 次）。最後一次 left 照舊繞回「絕技」。

**Interfaces:**
- Produces（`ui2/spendPress.ts`）：兩個分頁共用的兩段式投點。(implementer's call → fixed here)
  - `interface SpendState { pending: string | null }`
  - `pressSpend(state: SpendState, key: string, can: () => string | null, raise: () => void, sfx: Pick<SceneCtx['sfx'], 'cursor' | 'confirm' | 'error'>): 'armed' | 'raised' | { refused: string }`
    - `can()` 回傳原因時：清掉 pending，播 `sfx.error`，回傳 `{ refused: 原因 }`。**不能點的節點第一次按 Enter 就直接顯示原因，不會先進入待確認。**
    - 可以點、而且 `pending === key` 時：呼叫 `raise()`，清掉 pending，播 `sfx.confirm`，回傳 `'raised'`。
    - 可以點、但還沒待確認時：`pending = key`，播 `sfx.cursor`，回傳 `'armed'`。
  - `cancelSpend(state: SpendState): void`
- 技能樹分頁的版面：
  - 第一行：`T.ui2.tree.left(n)`「剩餘技能點 n」。
  - 下面 3 欄，每欄一條分支。欄位標題是分支名稱，加上這條分支已投入的點數。
  - 每個節點是一列文字（`.slx-tree-node[data-node]`）：名稱、`r／max`、種類標籤（主動／強化／被動／終極），再加上狀態標籤：
    - 已學：`slx-node-learned`
    - 可投：`slx-node-open`
    - 未解鎖：`slx-node-locked`，標籤寫出原因，原因文字是 `T.ui2.tree.reason[RaiseFail]`。
  - 底部是說明區：
    - 主動節點：目標、TP（用 `skillCost`，帶 ranks 與特效）、說明，以及「下一級：威力 a% → b%」，數字取自 `ACTIVE_RANK_PCT`；
    - 強化節點：`desc`，再加上目前與下一級的改寫摘要。摘要用 `T.ui2.tree.mod(mod)` 組出來，例如「威力 120%」「TP −2」「持續 5 回合」「毒機率 70%」「HP 消耗 6%」。
    - 待確認時顯示 `T.ui2.tree.pending`「再按一次 Enter 投入 1 點」；被拒絕時顯示原因。
- 操作：(implementer's call → fixed here)
  - ↑↓ 依「分支 0 的階層 0–4，再到分支 1、分支 2」移動游標，並呼叫 `cancelSpend`。
  - ←→ 不攔截，所以照舊切換分頁。
  - Enter 呼叫 `pressSpend`，其中 `can = () => canRaiseNode(m, node)`、`raise = () => 用 raiseNode 的結果寫回 roster`。
  - 換人時取消待確認。
  - 滑鼠：點一個節點會把游標移過去；再點同一個節點，等於按 Enter。
  - `hint` 是 `T.ui2.status.hintTree`。
- 樣式：
  - 3 欄用 CSS grid；列沿用 `.slx-skill` 的邊線；狀態只改字色。
  - 不用任何 `::before`／`::after`，也不畫連線。

- [ ] **Step 1: 寫失敗的測試**
  - `spendPress.test.ts`（只在這裡測一次）：
    - `first press arms, second press on the same key raises once`
    - `a press on another key re-arms instead of raising`
    - `a refused key reports the reason at once, plays error and clears pending`
    - `cancelSpend clears pending`
  - `status.test.ts`：
    - `the tabs read 能力 裝備 技能 技能樹 絕技`
    - `the tree tab shows three branches, the points left and each node's rank`
      - noel Lv2：分支標題有「火」「冰」「雷咒」，顯示「剩餘技能點 1」；
      - fire-star 那一列有「1／3」，而且是 `slx-node-learned`。
    - Review Focus 1：`Enter twice spends one point; then Enter on the same node is refused at once`
      - 游標移到 ice-star，按 Enter 一次：rank 還是 0，畫面顯示待確認；
      - 再按一次：rank 變 1，剩 0 點；
      - 再按一次：rank 仍然是 1，`sfx.error` 被呼叫，說明區顯示「點數不足」那個原因。
    - `moving the cursor cancels a pending raise`
    - `left and right still switch tabs on the tree tab`
    - `a click moves the cursor and a second click raises`
  - 現有的 `switches tabs` 測試照 Files 修改。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/spendPress.test.ts src/scripts/games/starlantern/ui2/scenes/status.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
  - `npx vitest run src/scripts/games/starlantern/ui2`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): a skill-tree tab on the status screen, with a shared two-press spend`

### Task 14: 狀態頁「天賦」分頁

**Files:**
- Modify：
  - `ui2/scenes/statusTabs.ts`：新增 `talent` 分頁，放在 tree 之後；export `resetTalentView`。
  - `data/text.zh-TW.ts`：`T.ui2.status.tabs.talent` 是「天賦」；以及 `T.ui2.talent.*`。
  - `src/styles/_starlantern-ui.scss`
- Test：`ui2/scenes/status.test.ts`
  - `switches tabs`：分頁變成 6 個，left 從 4 次改成 5 次。
  - `the tabs read …`：改成「能力 裝備 技能 技能樹 天賦 絕技」。

**Interfaces:**
- Consumes：Task 9 的 `canRaiseTalent`、`raiseTalent`、`talentPointsLeft`、`keystonesOf`；Task 13 的 `pressSpend`、`cancelSpend`。
- 版面：
  - 第一行：「剩餘天賦點 n」，以及「關鍵天賦 k／2」。
  - 6 列 × 4 欄的格子（`.slx-talent-node[data-node]`）。每格是文字：屬性名稱（`T.gear.statName`）、「+每級值／級」、`r／5`。
  - 第 6 列是 3 個關鍵天賦，顯示名稱與說明。
  - 狀態的 class 和原因文字，比照 Task 13，原因文字是 `T.ui2.talent.reason[TalentFail]`。
- 操作：
  - ↑↓ 依列優先的順序（第 0 列的第 0–3 欄、第 1 列……，最後是關鍵天賦）移動游標。
  - Enter 用 Task 13 的 `pressSpend`，其中 `can = () => canRaiseTalent(m, node)`。不另外寫一套待確認的邏輯。
  - 滑鼠與 ←→ 和 Task 13 相同。
- 說明區：一般節點顯示「智力 +2／級（目前 +4）」；關鍵天賦顯示 `desc`。

- [ ] **Step 1: 寫失敗的測試**
  - `status.test.ts`：
    - `the talent tab draws the 6x4 board and the keystone row`：一般節點 24 格，關鍵天賦 3 格。
    - Review Focus 1：`Lv5 has no talent points: Enter shows the reason at once and changes nothing`
    - `Lv6: Enter twice on a row-0 node raises it to 1／5 and the stats tab shows it in the 天賦 column`
      - 先記下 noel 的 int 那一列，天賦欄是「—」；
      - 在 noel-t00 按兩次 Enter 後切到「能力」：int 那一列的天賦欄（`.slx-talent`）是 `T.signed(TALENT_PER.int × TALENT_SCALE)`。
    - `a keystone stays locked under 12 board points, with the reason shown`
  - 照 Files 修改 `switches tabs` 與 `the tabs read …`。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/scenes/status.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
  - `npx vitest run src/scripts/games/starlantern/ui2`
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): a talent-board tab on the status screen`

### Task 15: 公會入口

**Files:**
- Modify：
  - `ui2/scenes/guild.ts`：新增 `tree`、`talent` 指令。
  - `ui2/scenes/status.ts`：`enter` 讀取 `tab:` 開頭的 arg。
  - `data/text.zh-TW.ts`：`T.ui2.guild.tree` 是「技能樹」，`talent` 是「天賦」。
- Test：
  - `ui2/scenes/guild.test.ts`：第 31 行的清單改成 `['編隊', '招募', '裝備', '狀態', '技能樹', '天賦', '離開']`。
  - `ui2/scenes/status.test.ts`：新增。

**Interfaces:**
- 公會的指令依序是：編隊、招募、裝備、狀態、技能樹、天賦，最後是原本就有的離開。
  - 技能樹：`ctx.go('status', 'tab:tree')`
  - 天賦：`ctx.go('status', 'tab:talent')`
  - (implementer's call → fixed here)
- `StatusScene.enter`：
  - arg 是 `tab:<id>` 時，打開那個分頁，成員是 `activeIds(p)[0] ?? p.recruited[0]`；
  - arg 是成員 id 時，照舊。

- [ ] **Step 1: 寫失敗的測試**
  - `guild.test.ts`：`技能樹 and 天賦 open the status screen on their tab`：`go` 被呼叫，參數是 `('status', 'tab:tree')` 與 `('status', 'tab:talent')`。
  - `status.test.ts`：`a tab: arg opens that tab on the first active member`：`setup('tab:talent')` 的目前分頁是「天賦」，名牌是絲嘉蕾（第一位上場的成員）。
- [ ] **Step 2: 執行，確認失敗**
  - `npx vitest run src/scripts/games/starlantern/ui2/scenes/guild.test.ts src/scripts/games/starlantern/ui2/scenes/status.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 執行，確認通過**
- [ ] **Step 5: commit**
  - 訊息：`feat(starlantern): skill-tree and talent entries in the guild`

### Task 16: 端對端、全套測試、截圖與審查

**Files:**
- Modify：`tests/e2e/starlantern.spec.ts`

- [ ] **Step 1：e2e `spends skill and talent points, then resets them at the inn`**
  - 在頁面裡用 debug hook，把 noel 的 level 設成 7（技能點 5、天賦點 1）、金幣設成 1000。
  - 公會 →「技能樹」：畫面開在絲嘉蕾，按 `.slx-status-next` 翻頁，直到 `.slx-status-name` 包含「諾艾兒」。
  - 點兩下 `[data-node=ice-star]`：那一列出現「1／3」。
  - 切到「天賦」：點兩下 `[data-node=noel-t00]`，出現「1／5」；「能力」分頁 int 那一列的天賦欄有值。
  - 旅館 →「重置配點」→ 諾艾兒 →「是」：金幣少 `25 × 7`；回到公會的技能樹（翻到諾艾兒），ice-star 是「0／3」。
  - 全程沒有 console error。
  - 最後在旅館存檔，重新整理後選「繼續」，存檔仍然有效。
- [ ] **Step 2：全套測試與截圖**
  - 執行 `npx vitest run --testTimeout=20000`，以及 e2e 全套。下樓的踏破訊息已經由 Task 1 的 e2e 涵蓋。
  - 截圖：技能樹分頁（含待確認與未解鎖原因）、天賦盤、旅館重置的確認框、下樓的踏破訊息。
- [ ] **Step 3：審查**
  - 派一個沒參與開發的 opus 代理，用 `~/.claude/skills/review-pr/SKILL.md` 審查本計畫的 diff，並處理它提出的問題。
- [ ] **Step 4：commit**
  - 訊息：`test(starlantern): skill trees, talents and respec end-to-end`

---

## 本計畫裁定的 spec 衝突
1. **§6 的點數算術對不起來（已裁定）。**
   - 「每升 1 級 1 點」到 Lv50 是 49 點。但「約 14 節點 × 3 級 ≈ 42 點，Lv50 約可點滿七成」需要約 60 點的容量，在 12–16 個節點、每個最多 3 級的限制下做不到。
   - **Ruling: one point per level-up, alternating skill/talent after Lv5 — spec intent '必須取捨' outranks '每升 1 級 1 點' — cost: fewer skill points than the spec's literal line**
   - 公式：
     - `skillPoints(level)`：`level ≤ 4` 時是 `level − 1`，否則是 `3 + ⌊(level − 3) / 2⌋`；
     - `talentPoints(level)`：`level < 6` 時是 0，否則是 `⌊(level − 4) / 2⌋`。
   - Lv50 時，技能點 26（另有免費的 1 級），天賦點 23，合計 49。
   - 每棵樹在 Lv50 的填滿比例：
     - noel、chizuru、sylvie、safira 72%；
     - scarlet、bobby 76%；
     - liz 81%；
     - selene 87%。
   - liz 和 selene 高於 60–75% 的目標，因為她們的樹裡有只能點 1 級的舊技能（被動、淨化、復活、夢境）。不過所有樹在 Lv50 都填不滿，所以仍然要取捨。測試的範圍是 0.6–0.9。
   - 天賦點 23 和 spec 相符。
2. **派工說明說莉茲是帶砲台的技師，和程式碼不符。**
   - 程式碼裡莉茲是尋寶獵人（雙刃、潛行），帶砲台的技師是波比（bobby）。
   - 另外，角色共有 8 位，不是 5 位。
   - 本計畫依程式碼與公會的角色說明，為 8 位角色各做一棵樹。
3. **spec 舉例絲嘉蕾有「反擊分支」，但反擊需要新的戰鬥機制。**
   - 本計畫改成守護、烈焰、鐵壁三條分支，只用現有的效果種類。
4. **§6 說「等級上限從 20 提高到 50」，但 `MAX_LEVEL` 早就是 50。** 本計畫只調經驗節奏。
5. **5a 的 Global Constraints 說「繁中文案一律放 text.zh-TW.ts」，但技能名與特效文字原本就放在資料檔。** 本計畫沿用資料檔的做法，介面文字才放進 text 檔。
