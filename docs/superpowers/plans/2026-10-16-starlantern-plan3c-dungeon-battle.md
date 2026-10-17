# 《星燈迷宮》計畫三 C：迷宮與戰鬥畫面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓新介面 `/games/starlantern-next` 從迷宮入口出發，走迷宮、遇敵、戰鬥、結算、回城，到打倒頭目的通關畫面，全部在 640×360 遊戲畫面內，用鍵盤或滑鼠都能玩完；完成後把 `/games/starlantern` 換成新介面。

**Architecture:** 預覽頁的遊戲畫面裡加一層 Pixi 畫布（640×360），沿用現有的 `MapView` 與 `BattleView` 畫地圖、敵人、特效與碎裂；其上是 DOM 遊戲視窗。新增四個 scene：`dungeon`、`battle`、`result`（併在 battle 內）、`clear`。戰鬥指令、目標選擇、訊息逐條播放與結算都是新寫的 DOM 視窗，沿用 `MenuView`、`Dialogue`、`FacilityScene` 同一套「只有最上層視窗吃滑鼠」的 inert 規則。引擎只新增迷宮中使用道具。

**Tech Stack:** TypeScript、PixiJS 8、SCSS、Vitest（happy-dom）、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-15-starlantern-game-ui-design.md` 第 5 節第 6–10 點、第 7 節。前兩段：plan3a、plan3b。

## Global Constraints

- 沿用計畫三 A／B：640×360、俐方體 11 號、`slx-` 前綴、禁 `!important` 與行內樣式（含 `element.style`）、不用 `<button>`／`<select>`、只有最上層視窗吃滑鼠、對話可點擊推進、右上「返回」。
- 迷宮：上方 296 px 地圖、下方 64 px 隊伍狀態列；左上樓層名、右上遇敵指示燈；事件用對話框；選單有隊伍狀態、道具、歸還之燈、關閉；觸控有畫面內十字鍵。
- 戰鬥：上方訊息列逐條播放；下方 5 格狀態列，輪到誰那格亮起；左下指令視窗（攻擊、技能、防禦、道具、絕技〔量表滿才出現〕、逃跑、全員攻擊）；選敵人時箭頭在敵人頭上；結算視窗。
- 全滅：「全滅……」並回到上次住宿的狀態；通關：通關畫面與「回到標題」。
- 測試：`npx vitest run`；`E2E_PORT=4352 npx playwright test tests/e2e/starlantern-next.spec.ts --project=chromium`。瀏覽器 headless 並加 `--mute-audio`。

## Review Focus

1. 戰鬥播放中按鍵或點擊：不能送出第二輪指令、不能重入。→ Task 4 測試。
2. 目標選擇時目標已死（同回合前面的人打倒）：引擎會改選，畫面不能卡住。→ Task 4 測試沿用引擎行為，介面只需要能送出。
3. 沒有可用的技能或道具：子選單不能開成空清單卡住。→ Task 4 測試。
4. 迷宮中連按方向鍵進入戰鬥：遇敵後的方向鍵不能讓隊伍在背後移動。→ Task 3 測試。
5. 視窗縮放：Pixi 畫布固定 640×360，不隨視窗重算。→ Task 2 以畫布尺寸測試。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `engine/town.ts` | 新增 `useFieldItem(state, itemId, targetId)` |
| `ui2/stage.ts` | 在 `#sl-screen` 建立 Pixi 畫布、`MapView`、`BattleView`，提供 `show('map' | 'battle' | null)` |
| `ui2/partyBar.ts` | 下方 5 格隊伍狀態列（頭貼依狀態、名字、HP／TP 條、絕技量表、亮起與受擊） |
| `ui2/battleText.ts` | 把戰鬥事件轉成一行行文字（從舊 `ui/battleMenu.ts` 的 `log()` 搬來） |
| `ui2/scenes/dungeon.ts` | 迷宮 |
| `ui2/scenes/battle.ts` | 戰鬥、目標選擇、播放、結算 |
| `ui2/scenes/clear.ts` | 通關 |
| `ui2/scene.ts` | `SceneName` 加 `'dungeon' | 'battle' | 'clear'`；`SceneCtx` 加選填 `stage` |
| `ui2/scenes/gate.ts`、`town.ts`、`main.ts` | 接上出發、全滅提示、場景建立 |
| `src/pages/games/starlantern.astro` | Task 7 改成新介面 |

---

### Task 1: 迷宮中使用道具（引擎）

**Interfaces:** Produces `useFieldItem(s: GameState, itemId: string, targetId: CharacterId): TownResult`——只接受 `ITEMS[itemId].target` 為 `ally` 或 `deadAlly` 的道具；效果用 `heal`、`restore`、`cure`、`revive` 四種（照 `ITEMS` 的 effects），套在 `party.roster[targetId]`；數量減一；`deadAlly` 只能對 HP 0 的人、`ally` 只能對 HP > 0 的人；否則 `invalid`；沒有庫存 `stock`。

- [ ] **Step 1: 失敗測試**（`engine/town.test.ts` 末尾）

```ts
describe('useFieldItem', () => {
  it('heals a living member and uses one item', () => {
    const s = newGame();
    s.party.roster.liz.hp = 5;
    const r = useFieldItem(s, 'potion', 'liz');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.party.roster.liz.hp).toBeGreaterThan(5);
    expect(r.state.party.roster.liz.hp).toBeLessThanOrEqual(statsOf(r.state.party.roster.liz).hp);
    expect(r.state.inventory.potion).toBe(2);
  });
  it('revives only the fallen and refuses the wrong target or an empty stock', () => {
    const s = newGame();
    s.inventory.phoenix = 1;
    expect(useFieldItem(s, 'phoenix', 'liz')).toEqual({ ok: false, reason: 'invalid' });
    s.party.roster.liz.hp = 0;
    const r = useFieldItem(s, 'phoenix', 'liz');
    expect(r.ok && r.state.party.roster.liz.hp > 0).toBe(true);
    expect(useFieldItem(s, 'potion', 'liz')).toEqual({ ok: false, reason: 'invalid' });
    expect(useFieldItem({ ...s, inventory: {} }, 'potion', 'noel')).toEqual({ ok: false, reason: 'stock' });
    expect(useFieldItem(s, 'return-lamp', 'noel')).toEqual({ ok: false, reason: 'invalid' });
  });
});
```

- [ ] **Step 2: 實作**（`engine/town.ts`）：讀 `ITEMS[itemId].effects`，`heal` 用 `power` 當固定回復量（與戰鬥相同的計算若需要施放者數值，迷宮中以 `power` 直接回復）、`restore` 加 `hp`／`tp`、`cure` 清掉 `poison`（成員資料沒有 poison 時略過）、`revive` 設為 `max(1, floor(maxHp * hpPct / 100))`；HP、TP 都夾在 `statsOf` 上限內。`structuredClone` 後回傳。
- [ ] **Step 3: 通過**、Commit：`feat(starlantern): use recovery items in the labyrinth`。

### Task 2: 遊戲畫面裡的 Pixi 舞台

**Interfaces:** Produces `class Stage { readonly mapView: MapView; readonly battleView: BattleView; constructor(screen: HTMLElement, bank: TextureBank, fast: boolean); ready(): Promise<boolean>; show(which: 'map' | 'battle' | null): void; size(): { width: 640; height: 360 } }`；畫布 `canvas#sl-canvas.slx-canvas` 插在 `#sl-ui` 之前，固定 640×360（不跟視窗縮放，交給 CSS transform 放大）；`createApp` 失敗時 `ready()` 回 `false`，遊戲照常可玩（地圖退回文字提示）。`SceneCtx` 加 `stage: Stage | null`。

- [ ] 測試：happy-dom 無 WebGL，`ready()` 應回 `false` 且不丟錯；`size()` 永遠是 640×360；`show()` 切換 `mapView.root.visible`、`battleView.root.visible`。
- [ ] 實作：`render/app.ts` 的 `createApp` 目前 `resizeTo: parent`；`Stage` 改呼叫新函式 `createFixedApp(canvas, 640, 360)`（`width/height` 固定、`autoDensity: false`、`resolution: 1`、`antialias: false`），在 `render/app.ts` 新增並保留舊函式給舊頁面。
- [ ] Commit：`feat(starlantern): pixi stage inside the game screen`。

### Task 3: 隊伍狀態列與迷宮畫面

**Interfaces:**
- `class PartyBar { readonly el: HTMLElement; constructor(art: ArtIndex); update(members: { key: string; name: string; hp: number; maxHp: number; tp: number; maxTp: number; limit: number; alive: boolean }[], active?: string | null): void; pulse(key: string, mood: 'attack' | 'hit'): void }`（每格 `.slx-pm[data-key]`，含頭貼〔`portraitImg` 依 HP 選表情〕、名字、`.slx-bar-hp`、`.slx-bar-tp`、`.slx-bar-limit`；`active` 那格 class `slx-pm-active`；倒下 `slx-pm-down`；條用 `<meter>`，無行內樣式）。
- `class DungeonScene implements Scene`：進入時 `stage.show('map')`、畫地圖、建立狀態列、樓層名、指示燈、十字鍵（觸控與滑鼠可點）、「返回」不顯示（迷宮用選單）。方向動作 → `game.move(dir)`：
  - `blocked`：`sfx.bump`；`moved`／`entrance`：`sfx.step`，在回城點顯示確認「要回到城鎮嗎？」；
  - `floor`：`sfx.stairs` 並說「第 N 層 名稱」；`chest`：`sfx.chest` 並說「打開寶箱：X ×n」；
  - `battle`／`boss`：`sfx.encounter`，**立刻鎖住輸入**再 `go('battle')`；
  - `menu`（C）或 `cancel`：開迷宮選單「隊伍狀態、道具、歸還之燈（×n）、關閉」；道具清單只列 `ally`／`deadAlly` 且有庫存的道具，選人後 `useFieldItem`；歸還之燈 → `useReturnLamp()` → `go('town')`。
- 測試（`ui2/scenes/dungeon.test.ts`，`stage: null`）：
  1. 進入後顯示樓層名、指示燈 class `slx-lamp-green`、5 格狀態列。
  2. 往牆走播放 bump、位置不變；往地板走 `game.pos` 改變。
  3. 走到遇敵（`constRng` 安排遇敵）時呼叫 `go('battle')`，之後的方向鍵不再改變 `game.pos`。
  4. 在入口確認「是」→ `go('town')`；開選單用歸還之燈 → `go('town')` 且燈數減一。
  5. 道具：HP 不滿時用回復藥，成員 HP 增加、藥水減一；沒有可用道具時選單項目為不可選。
- Commit：`feat(starlantern): labyrinth screen with party bar, events and field menu`。

### Task 4: 戰鬥畫面

**Interfaces:**
- `battleLines(log: BattleEvent[], nameOf: (key: string) => string): string[]`（`ui2/battleText.ts`，文字沿用 `T.log`）。
- `class BattleScene implements Scene`：
  - 進入：`stage.show('battle')`、`battleView.setup(game.battle, stage.size(), game.floor)`；上方 `.slx-msg` 視窗；下方 `PartyBar`；左下指令視窗。
  - 依序替每位能行動的隊員選指令（同舊介面的 actors 規則：活著且沒睡著）；指令「攻擊／技能／防禦／道具／絕技／逃跑」＋「全員攻擊」；子選單：技能（列出已學、非被動，右欄 TP，TP 不足不可選；沒有可用技能時「技能」不可選）、道具（`battle: true` 且有庫存；沒有時不可選）。
  - 目標：`enemy` → 敵人目標選單，同時在畫面上用 `.slx-target` 箭頭標在 `battleView.anchor(key)` 的位置（`BattleView` 新增 `anchor(key): { x: number; y: number } | null`）；`ally`／`deadAlly` → 狀態列亮起候選並用清單選；`enemies`／`allies`／`self` 不用選。
  - 取消：回到上一位隊員的指令（第一位時不動）。
  - 全部選完 → `game.submitRound`，**播放期間鎖輸入**；訊息列逐條顯示 `battleLines`（每條 ~400 ms，fast 模式 0）；同時 `battleView.play(state, sfx, onParty)`，`onParty` 驅動狀態列的攻擊／受擊表情與絕技演出（`playCutIn`，`#sl-cutin` 移進 `#sl-screen`）。
  - 結束：`win` → 結算視窗（經驗、金錢、掉落、升級、新技能，確認後 `go('dungeon')`；頭目 → `go('clear')`）；`fled` → `go('dungeon')`；`lose` → 「全滅……」確認後 `go('town')`（`game.notice === 'wipe'` 由城鎮顯示）。
- 測試（`ui2/scenes/battle.test.ts`，`stage: null`、fast）：
  1. 指令清單內容；量表滿時出現「絕技」。
  2. 依序選完 5 人送出一輪（`game.submitRound` 被呼叫一次），播放期間再按確認不會送第二輪。
  3. 取消回到上一位。
  4. 沒有道具時「道具」不可選。
  5. 「全員攻擊」直接送出。
  6. 打贏後出現結算視窗，確認 → `go('dungeon')`；打輸 → 顯示全滅、確認 → `go('town')`。
- Commit：`feat(starlantern): battle screen with commands, targets, playback and results`。

### Task 5: 通關、出發與全滅提示

- `GateScene` 選樓層 → 確認框「前往第 N 層？」→ `game.depart(n)`；失敗說明原因（例如全員倒下）；成功 `go('dungeon')`。
- `TownScene` 進入時若 `game.notice` 是 `wipe` 或 `save-reset`，先用對話框說明，再清掉 `notice`。
- `ClearScene`：頭目戰背景（`art.bg(3)`）、`T.clear.title`、`T.clear.body`、選單「回到城鎮」（`restartAfterClear()` → `go('town')`）。
- 測試：gate 出發成功與失敗、town 顯示全滅提示、clear 回到城鎮。
- Commit：`feat(starlantern): depart from the gate, wipe notice, clear screen`。

### Task 6: e2e 整趟流程

`tests/e2e/starlantern-next.spec.ts` 加一個測試（`?seed=7&fast=1`）：標題 → 新遊戲 → 迷宮入口 → 第 1 層 → 方向鍵走到遇敵 → 全員攻擊直到結算 → 確認 → 迷宮 → 開選單用歸還之燈 → 城鎮 → 旅館休息存檔 → 重新整理 → 繼續 → 金錢與存檔一致。`main.ts` 需支援 `?seed=` 與 `?fast=1`（同舊頁）。

### Task 7: 正式切換

- `src/pages/games/starlantern.astro` 改成新介面的頁面內容（同 `starlantern-next.astro`）；`starlantern-next.astro` 刪除或改為導向。
- 刪除舊 `ui/town.ts`、`ui/hud.ts`、`ui/battleMenu.ts`、`ui/clear.ts`、`client.ts` 與對應測試；舊 `tests/e2e/starlantern.spec.ts` 改寫為新介面流程（取代 Task 6 的檔案）。
- 全套測試、e2e、tsc、樣式規則掃描、實機截圖；派 fresh-context 審查；給使用者試玩連結。
- Commit：`feat(starlantern): switch the game page to the new game ui`。
