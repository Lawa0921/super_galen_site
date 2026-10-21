# DELVE 連線 M-B2：編輯日誌、`exec` 指令匯流排、`tossSlot` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 世界上每一格的編輯都以 chunk 鍵記進日誌、每個 chunk 帶 rev；玩家每一個會改世界或背包的離散動作都經過 `exec(pid, cmd)`，本地 UI 也一樣；新增「丟出背包格」`tossSlot`。單機行為與存檔逐位元組不變。

**Architecture:** `engine/edits.ts` 的 `EditJournal` 掛在 `World` 上，在 `World` 內部唯一的 tile 變動點 `touch()` 記錄「改完之後的狀態」。網路用的液體 dirty 是另一份集合（`drainNetLiquid`）。`engine/commands.ts` 定義指令型別、結果型別與網路輸入驗證 `validCmd`。`DelveGame.exec` 用 `withActor` 切到該 actor，再分派到既有的公開方法，所以既有方法和測試都不用改。`act(cmd)` 是本地玩家的捷徑，`render/` 與 `input/` 只透過它改狀態，由掃描測試把關。

**Tech Stack:** TypeScript、vitest（happy-dom）、Playwright。純引擎加少量 UI 改線；沒有網路。

**Spec:** `docs/superpowers/specs/2026-10-20-delve-coop-design.md` §5.2（編輯日誌、指令匯流排；2026-10-21 已依無限世界修訂成 chunk 鍵）、§5.7（`tossSlot`）、§6 M-B、§7 R11、§10 D1/D5。前一段：`docs/superpowers/plans/2026-10-21-delve-coop-mb1-multi-actor.md`。世界模型：`docs/superpowers/plans/2026-10-21-delve-infinite-1a-chunked-world.md` B1–B8。M-B3 才做 LoopbackNet、NetHost／NetGuest、`snapshotWorld`、checkpoint、興趣範圍過濾、`sum`／`chunk` 同步。

## Global Constraints

- 單機逐 tick 不變：`engine/actor.golden.test.ts` 的 GOLDEN／GOLDEN2 與 `engine/world.central.test.ts` **一字不改**地通過。既有測試零修改，或只有機械性修改。存檔格式與 `snapshotGame` 的輸出形狀不變（日誌、owner 都不寫進存檔）。
- 既有的公開 mutator（`craft`、`takeChestSlot`…）保留原簽名；引擎測試、`save/legacyFixture.ts`、golden 照舊直接呼叫。
- 不加 npm 套件；UI 文字與程式註解用繁體中文，比照周圍；禁 `!important`、禁行內樣式。
- 測試：`npx vitest run <path>`（絕不用 `npm test`）。每個 task 結束前：`npx vitest run` 全套綠，`npx playwright test tests/e2e/delve.spec.ts --project=chromium` 全綠，`npx tsc --noEmit -p tsconfig.json` 在 `src/scripts/games/delve` 與 `tests/e2e/delve.spec.ts` 沒有**新增**錯誤（先在 Task 1 Step 0 錄基準）。
- 行尾維持各檔原樣。本計畫會碰到的 CRLF 檔：`engine/game.ts`、`engine/world.ts`、`render/main.ts`、`render/session.ts`、`render/model.ts`、`input/mapping.ts`、`tests/e2e/delve.spec.ts`。其餘（`engine/entities.ts`、`render/hud.ts`、`render/folkUi.ts`、`render/settleUi.ts`、`render/levelsUi.ts`、`render/mapView.ts`、`render/waystoneUi.ts`、`input/controls.ts`）是 LF；新檔用 LF。
- 路徑：`engine/…`、`render/…`、`input/…`、`save/…` 都在 `src/scripts/games/delve/` 底下。
- Conventional Commits，最後一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Builder decisions（Claude 代為決定，使用者可推翻）

- **B1 兩個入口。** 世界和背包的變動只有兩個入口。(a) `input(pid)` 驅動的 `stepActor` 持續動作：挖、打、放、用、互動、釣魚，本地與遠端同一條路（M-B1 已有）。(b) `exec(pid, cmd)` 的離散指令：面板、按鍵、對話、技能。`render/` 與 `input/` 不直接呼叫 mutator（Task 4 的掃描測試）。輸入類 setter（`setMoveX`…`selectSlot`、`setAim`）屬於 (a)，不進匯流排。
- **B2 `exec` 是薄分派。** `exec` 做的是 `withActor(actor(pid), () => runCmd(cmd))`，分派到既有方法，不加新規則，因此單機等價。三個會強制切回本地的包裝（`talkNearest`、`talkAtPx`、`useSkill`）在 `runCmd` 裡改叫它們的 `…Cur` 版本。M-B3 只在 `exec` 加 replica 分支（送給房主），UI 不必再改。
- **B3 `place` 指令**（spec §5.5）。M-B2 就做，給 M-B3 的客人和測試用：選格、`tryPlace(x, y)`。單機本地照舊走按住使用的輸入路徑。客人到底用 `ps.use` 還是 `place`，留給 M-B3 決定。建議做法：手上是可放置物時，客人遮掉 `ps.use`，改送 `place`。
- **B4 日誌形狀**（spec §10 D5）。記改完之後的 `[x, y, fg, wall, half]`；同一批裡同一格只留一筆，順序是第一次被改的順序。`rev(chunk)` 每記一次就加 1，單調遞增，drain 不歸零，0 表示沒改過。上限 `EDIT_CAP = 4096` 筆格子：滿了以後，被改到的 chunk 改標 `full`（丟掉它的格子清單，rev 照加）。日誌永遠開著、讀檔不清。M-B3 的房主在開房時 drain 一次，當作基準。
- **B5 液體與結冰不進日誌。** `World` 另加 `netLiquid` 集合：`touchLiquidAt`、`markLiquidDirty`、`writeChunk` 會加入，`unloadColumn` 會刪除，`drainNetLiquid()` 取走。它跟 renderer 的 `drainLiquidDirty` 互不影響。
- **B6 箱子。** 箱子內容和 `unlocked` 的變動改呼叫 `World.touchChest(x, y)`，等於 `markModified` 再記一筆箱子項目（tile 鍵）。`game.ts` 現有 5 處 `markModified`（約 2202、2243、2270、2284、3629 行）全部換掉。箱子的建立和刪除由 tile 項目隱含：replica 套 `setFg` 時會做同樣的事。
- **B7 `tossSlot(slot, n?)`**（spec §5.7）。作用在 cur。n 省略時丟整格，上限是該格數量。掉落物從玩家中心往 `facing` 方向偏 10 px 生成，初速 `vx = facing * TOSS_VX`（200 px/s）、`vy = -TOSS_VY`（150 px/s）。丟的人 `TOSS_OWNER_DELAY = 1.5` 秒內撿不回來，其他人立刻可以撿（U6）。帶 owner 的堆不跟 owner 不同的堆合併。owner 與倒數不存檔。鎖定的裝備不能丟，提示原因 `lockedtoss`。死亡、空格、n 不合法時回 `false`。事件 `{ type: 'toss', item, n, x, y }` 是公開的（不進 `PRIVATE_EVENTS`）。
- **B8 G 鍵**（Q 已經是衝刺 dash，T 是對話；G 未使用——controller 裁定）（`KeyAction 'toss'`）丟出整個選中的快捷欄格。背包面板不加新操作（YAGNI）。
- **B9 `validCmd(v: unknown): Cmd | null`** 是給 M-B3 收到的網路 JSON 用的。它建立**新物件**，只拷貝已知欄位，所以 `__proto__` 和多餘欄位都會丟掉。整數欄位用 `Number.isSafeInteger` 檢查並限制範圍；字串長度 1–64；列舉欄位對照現有表格。語意檢查（配方存不存在、錢夠不夠）交給既有方法，它們本來就會回失敗。
- **B10 M-B1 遺留修正。** `settle.spawnLink`（game.ts 約 791 行）讀寫的是 `this.local.spawnCore`，改成 `this.cur.spawnCore`。step 外 `cur` 等於 `local`，所以單機等價；改完以後 `exec('b', spawnCore)` 才會設到 B 身上。

## Review Focus

1. **單機逐 tick 不變**：GOLDEN／GOLDEN2／central 不改一字；另外用同一段腳本分別「直接呼叫方法」和「透過 `act`」跑，快照位元組與事件序列要完全相同 → Task 2。
2. **非本地 actor 的指令碰到本地玩家**（包裝裡寫死 `this.local` 的方法：說話、技能、重生點）：`exec('b', …)` 只改 B 的狀態，事件帶 B 的 pid → Task 2。
3. **客人送來的垃圾指令**：未知 op、NaN／小數／超出範圍的格號、超長字串、`__proto__` 欄位、不是物件 → `validCmd` 回 `null`，不拋例外 → Task 2。
4. **沒人取的日誌**（單機玩很久）：10 萬次編輯後，待取格子數不超過 `EDIT_CAP`，其餘 chunk 變成 `full`。外圍負 x 的 chunk 鍵正確；寫進沒常駐的欄不記；停放後蓋回來的欄不產生日誌 → Task 1。
5. **丟出與撿起的數量守恆**：兩人一起時，A 丟出 10 個，任何時刻「A 背包 + B 背包 + 地上」的總數都不變；A 在 1.5 秒內撿不回來、B 立刻撿得到；撿的人背包滿時東西留在地上 → Task 3。

---

### Task 1：`EditJournal` 與 World 掛鉤

**Files:**
- Create: `engine/edits.ts`、`engine/edits.test.ts`、`engine/world.edits.test.ts`
- Modify: `engine/world.ts`（`touch` 約 741 行、`writeChunk` 294、`unloadColumn` 247、`touchLiquidAt` 677、`markLiquidDirty` 685，新增 `edits`、`touchChest`、`drainNetLiquid`）、`engine/game.ts`（5 處箱子的 `markModified` → `touchChest`）

**Interfaces — Produces:**

```ts
// engine/edits.ts
export const EDIT_CAP = 4096;
/** 一個 chunk 這一批的編輯；tiles 每 5 個數字一組 [x, y, fg, wall, half]（改完後的狀態，同格一筆） */
export interface EditBatch { chunk: number; rev: number; tiles: number[]; chests: number[]; full: boolean; }
export class EditJournal {
  constructor(cap?: number);                       // 預設 EDIT_CAP
  record(chunk: number, x: number, y: number, fg: number, wall: number, half: number): void;
  chest(chunk: number, tileKey: number): void;     // 同一 tile 鍵一批只留一次
  markFull(chunk: number): void;
  rev(chunk: number): number;                      // 0 = 沒改過
  pending(): number;                               // 待取的 chunk 數
  drain(): EditBatch[];                            // chunk 依第一次被改的順序；取完清空（rev 保留）
}
// World 新增
readonly edits: EditJournal;
touchChest(x: number, y: number): void;            // markModified + edits.chest(chunkIndex, idx(x, y))；沒常駐 = 什麼都不做
drainNetLiquid(): number[];
```

同一格合併：每個待取 chunk 用一個 `Map<number, number>`，從格子鍵（`(x + 2**21) * 4096 + y`，對 ±X_LIMIT、y < 4096 是單射）對到 tiles 裡的位置。`touch(x, y)` 在現有的 dirty／modified 標記之後，從欄位讀回 fg／wall／half 再呼叫 `record`。`setFg`、`setWall`、`setHalf` 都會經過 `touch`，`setFrozen`、`setFlag`、`writeChunkPayload` 不經過（讀檔還原與結冰不進日誌，B5）。

- [ ] **Step 0：錄型別基準**：`npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/scripts/games/delve|tests/e2e/delve.spec.ts" > tsc-base.txt`（寫在 session 的 scratchpad 目錄，不要放進 repo），之後每個 task 比對，不能新增。
- [ ] **Step 1：寫失敗測試** `engine/edits.test.ts`：
  - `record 兩次同格 → 一筆最後狀態、rev 2`：`j.record(7, 1, 2, 3, 0, 0); j.record(7, 1, 2, 4, 5, 1)` → `drain()` 等於 `[{ chunk: 7, rev: 2, tiles: [1, 2, 4, 5, 1], chests: [], full: false }]`；`j.rev(7) === 2`；再 `drain()` 是 `[]`，`rev(7)` 仍是 2。
  - `兩個 chunk 依第一次被改的順序`：先記 chunk 9 再記 chunk 3 → `drain().map(b => b.chunk)` 等於 `[9, 3]`。
  - `超過 cap 改標 full`：`new EditJournal(4)`；chunk 1 記 3 格、chunk 2 記 2 格 → chunk 1 `{ full: false, tiles.length: 15 }`，chunk 2 `{ full: true, tiles: [] , rev: 2 }`；drain 之後再記 4 格都不會 full。
  - `chest 去重`：同一 tile 鍵記兩次 → `chests` 只有一個，rev 2。
  - `十萬次編輯有上限`：預設 cap，在 1000 個 chunk 裡記 100 000 格（不同格）→ 所有 batch 的 `tiles.length / 5` 總和 ≤ `EDIT_CAP`，`full` 的 chunk 數加上沒 full 的 chunk 數等於 1000。
- [ ] **Step 2：寫失敗測試** `engine/world.edits.test.ts`：
  - `setFg 記在 chunkIndex 底下`：`new World(64, 64)`；`setFg(5, 40, T.DIRT)` → `edits.drain()` 等於 `[{ chunk: w.chunkIndex(0, 1), rev: 1, tiles: [5, 40, T.DIRT, 0, 0], chests: [], full: false }]`。
  - `setWall、setHalf 合併成同一筆`：`setFg(5, 40, T.STONE); setWall(5, 40, W.STONE_WALL); setHalf(5, 40, true)` → 一筆 `[5, 40, T.STONE, W.STONE_WALL, 1]`，rev 3。
  - `沒變化不記`：對同一個 id 再 `setFg` → `pending() === 0`。
  - `外圍負 x`：`new World(64, 64, { bounds: 'infinite' })`，`ensureColumn(-3)`，`setFg(-90, 10, T.STONE)`（沒有 source 的外圍欄是空氣）→ batch.chunk 等於 `w.chunkIndex(-3, 0)`，且 `isOuterChunkKey(batch.chunk)`。
  - `沒常駐的欄寫入不記`：infinite world 對 `cx = 40` 沒有 ensure，`setFg(40 * 32 + 1, 5, T.DIRT)` → 回傳 `false`，`pending() === 0`。
  - `停放後蓋回來不產生日誌`：infinite world，`ensureColumn(-3)` → `setFg` → `drain()` → `unloadColumn(-3)` → `ensureColumn(-3)` → `pending() === 0`，而且那格仍是改過的值。
  - `writeChunk 標 full`：`writeChunk(0, 0, readChunk(0, 0)!)` → batch `{ full: true }`，rev 加 1。
  - `touchChest`：`setFg(3, 3, T.CHEST); edits.drain(); touchChest(3, 3)` → batch `chests` 等於 `[w.idx(3, 3)]`，`tiles` 是 `[]`；而且 `modifiedChunks` 含該 chunk。
  - `netLiquid 與 renderer 的液體 dirty 各自獨立`：`setLiquid(5, 5, 100, LIQ.WATER)` → `drainLiquidDirty()` 含該 chunk，之後 `drainNetLiquid()` 也含；第二次 `drainNetLiquid()` 是 `[]`。infinite world 裡改外圍欄的液體再 `unloadColumn` → `drainNetLiquid()` 不含該 chunk。
  - 遊戲層（`DelveGame({ seed: 'edits', width: 160, height: 100 })`，arena 寫法同 `engine/actors.test.ts`）：`mineInstant` 一格泥土 → 有一筆 fg 是 `T.AIR` 的項目；放箱子、`interact` 打開、`depositToChest(i)` → 那個 chunk 的 batch `chests` 含箱子的 tile 鍵。
- [ ] **Step 3：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/engine/edits.test.ts src/scripts/games/delve/engine/world.edits.test.ts`。預期 FAIL，原因是 `./edits` 不存在或 `edits` 未定義。
- [ ] **Step 4：實作** `engine/edits.ts` 與 World 掛鉤（B4–B6），並把 `game.ts` 的 5 處箱子 `markModified` 換成 `touchChest`。
- [ ] **Step 5：跑測試確認通過**：上面兩個檔 PASS；`npx vitest run src/scripts/games/delve/engine/actor.golden.test.ts src/scripts/games/delve/engine/world.central.test.ts src/scripts/games/delve/engine/world.perf.test.ts` PASS（perf 守住液體熱路徑多一次 `Set.add` 的成本）；接著全套 vitest、delve e2e、tsc 沒有新增錯誤。
- [ ] **Step 6：Commit**：`git add` 上述檔案 → `feat(delve): chunk-keyed world edit journal`

### Task 2：指令型別、`validCmd`、`exec` / `act`

**Files:**
- Create: `engine/commands.ts`、`engine/commands.test.ts`、`engine/exec.test.ts`
- Modify: `engine/game.ts`（`input(pid)` 約 997 行之後加 `exec` / `act` / 私有 `runCmd`；`spawnLink` 約 791 行，B10）

**Interfaces — Consumes:** M-B1 的 `withActor`、`actors`、`localPid`、`Pid`。**Produces:**

```ts
// engine/commands.ts（只 import type，避免和 game.ts 循環）
export type Cmd =
  | { op: 'craft'; recipe: string } | { op: 'swap'; a: number; b: number }
  | { op: 'place'; x: number; y: number; slot: number } | { op: 'toss'; slot: number; n?: number }
  | { op: 'chestTake'; slot: number } | { op: 'chestTakeAll' } | { op: 'chestDeposit'; slot: number } | { op: 'chestClose' }
  | { op: 'equip'; slot: number; to?: EquipSlot } | { op: 'unequip'; slot: EquipSlot }
  | { op: 'equipVanity'; slot: number; to?: VanitySlot } | { op: 'unequipVanity'; slot: VanitySlot }
  | { op: 'hideArmor'; slot: HideSlot; hide: boolean } | { op: 'recolor'; slot: VanitySlot; tint: [number, number] }
  | { op: 'bodyLook'; look: Appearance } | { op: 'mirrorClose' } | { op: 'rebirth'; race: number }
  | { op: 'lock'; at: GearAt } | { op: 'salvage'; at: GearAt } | { op: 'salvageAll'; maxRarity: number }
  | { op: 'reroll'; at: GearAt; affix: number } | { op: 'upgrade'; at: GearAt } | { op: 'ascend'; at: GearAt }
  | { op: 'deepforge'; at: GearAt; key: string }
  | { op: 'buy'; npc: NpcKind; i: number } | { op: 'sell'; npc: NpcKind; item: ItemId; n: number }
  | { op: 'service'; npc: NpcKind } | { op: 'residentService'; npc: NpcKind; svc: FolkService }
  | { op: 'folkBuy'; key: string; i: number } | { op: 'folkSell'; key: string; item: ItemId; n: number }
  | { op: 'folkService'; key: string; svc: FolkService }
  | { op: 'acceptQuest'; key: string; id: string } | { op: 'turnInQuest'; id: string } | { op: 'refreshQuests' }
  | { op: 'learnSkill'; id: SkillId } | { op: 'respec' } | { op: 'skill'; skill: ActiveSkill }
  | { op: 'talk' } | { op: 'talkAt'; px: number; py: number }
  | { op: 'travel'; to: number } | { op: 'travelStone'; to: number } | { op: 'spawnCore'; id: number }
  | { op: 'marker'; x: number; y: number };
export type CmdOp = Cmd['op'];
/** 每個 op 的回傳 = 對應既有方法的回傳型別（craft → CraftResult、chestTakeAll → number、lock → boolean | null、
 *  salvage → Cost | null、salvageAll → { count; shard; dust }、reroll/upgrade/ascend/deepforge → ForgeResult、
 *  residentService/folkService → { ok: boolean; msg: string }、learnSkill → LearnFail | null、respec → respecSkills 的回傳、
 *  marker → 'added' | 'removed' | 'full'、chestClose/mirrorClose/hideArmor/bodyLook/refreshQuests → void、其餘 → boolean） */
export interface CmdResults { craft: CraftResult; swap: boolean; /* …每個 op 一個鍵… */ }
export const CMD_OPS: readonly CmdOp[];            // 全部 op，順序同上
export function validCmd(v: unknown): Cmd | null;  // B9
// engine/game.ts（DelveGame）
exec<C extends Cmd>(pid: Pid, cmd: C): CmdResults[C['op']];   // 沒有這個 pid → throw Error('delve: no actor …')
act<C extends Cmd>(cmd: C): CmdResults[C['op']];               // = exec(this.localPid, cmd)
```

`runCmd(cmd: Cmd)` 是一個 `switch (cmd.op)`，每個 case 呼叫一個既有方法（`swap` → `this.inventory.swap(a, b)`；`place` → `selectOf(cur, slot)` 再 `tryPlace(x, y)`；`toss` 在 Task 3 接上，這個 task 先回 `false`；`talk`／`talkAt`／`skill` → `talkNearestCur`／`talkAtPxCur`／`useSkillCur`）。`exec` 在回傳時做型別轉換。`validCmd` 的範圍：背包格 0 ≤ v < `INV_SIZE`；箱子格 < `CHEST_SLOTS`；`x`／`to`／`id`／`race`／`affix`／`maxRarity`／`i` 用 `Number.isSafeInteger`，|x| ≤ `X_LIMIT`，0 ≤ y < 4096；`n` 是 1–9999 的整數；`px`／`py` 是有限數；`item` 用 `isItemId`；`npc` 用 `NPC_KINDS`；`EquipSlot` 用 `EQUIP_SLOTS`；`VanitySlot` 用 `VANITY_SLOTS`；`HideSlot` 是 `head|body|legs`；`ActiveSkill` 是 `dash|slam|pulse`；`SkillId` 要在 `SKILLS` 的 id 裡；`FolkService` 沒有匯出的清單，就在 commands.ts 定義 `FOLK_SERVICES`（`satisfies readonly FolkService[]`）；`GearAt` 是背包格或 `EquipSlot`；`tint` 是兩個 0–255 的整數；`look` 先過 `normalizeAppearance`；`hide` 必須是 boolean。

- [ ] **Step 1：寫失敗測試** `engine/commands.test.ts`：
  - `合法指令原樣通過`：`validCmd({ op: 'craft', recipe: 'planks' })` 等於 `{ op: 'craft', recipe: 'planks' }`；`validCmd({ op: 'toss', slot: 3 })` 等於 `{ op: 'toss', slot: 3 }`（沒有 `n` 鍵）；`CMD_OPS` 每個 op 都至少有一個合法樣本通過（表格測試）。
  - `垃圾一律 null、不拋`：`null`、`42`、`'craft'`、`{}`、`{ op: 'nuke' }`、`{ op: 'swap', a: 0.5, b: 1 }`、`{ op: 'swap', a: NaN, b: 1 }`、`{ op: 'chestTake', slot: 20 }`、`{ op: 'equip', slot: 40 }`、`{ op: 'unequip', slot: 'hat' }`、`{ op: 'sell', npc: 'merchant', item: 'no_such', n: 1 }`、`{ op: 'craft', recipe: 'x'.repeat(65) }`、`{ op: 'place', x: 2e6, y: 0, slot: 0 }`、`{ op: 'hideArmor', slot: 'head', hide: 'yes' }`。
  - `只拷貝已知欄位`：`validCmd(JSON.parse('{"op":"respec","__proto__":{"polluted":1},"extra":2}'))` 等於 `{ op: 'respec' }`，而且 `({} as Record<string, unknown>).polluted === undefined`。
- [ ] **Step 2：寫失敗測試** `engine/exec.test.ts`（arena 與 `hero()` 同 `engine/actors.test.ts`）：
  - `act 和直接呼叫等價`：兩個 arena 用同一段腳本，一個直接呼叫方法，一個透過 `act`。腳本內容：`give('wood', 3)` → craft `planks` → swap 0↔5 → 給 `iron_chestplate` 並 equip → unequip `body` → toggleLock 那件 → 放箱子、`interact`、chestDeposit、chestTakeAll、chestClose → `learnSkill('b_vigor')`（先 `addXp(2200)`）→ 每步之間 `step` 30 次。比對：`encodeSave(snapshotGame(g, 0))` 位元組相同，`drainAll()` 的事件 JSON 相同。
  - `exec('b') 用 B 的背包`：`addActor('b', hero(), { x: 50, y: 59 })`；`input('b')` 不動；B 背包給 `wood`；`exec('b', { op: 'craft', recipe: 'planks' })` 回 `{ ok: true }`；B 有 4 planks，本地沒有；craft 事件出現在 `drainEvents('b')`，不在 `drainEvents('h')`。
  - `exec('b') 的箱子`：在 (52, 59) 放 `T.CHEST`，`g.withActor(b, () => g.interact(52, 59))` 打開；`exec('b', { op: 'chestDeposit', slot })` 改的是 B 的背包，本地 `openChest` 維持 `null`；`exec('b', { op: 'chestClose' })` 之後 B 的 `openChest === null`。
  - `說話、技能、重生點不會落到本地`：本地站 (40, 59)，B 站 (120, 59)；`g.withActor(b, () => g.debugEncounter('peddler', 2))` → `exec('b', { op: 'talk' })` 回 `true`，talk 事件帶 `pid: 'b'`，而且本地 `g.talkNearest()` 回 `false`。`g.withActor(b, () => g.addXp(2200))` 之後依序 `exec('b', learnSkill 'b_vigor')`、`exec('b', learnSkill 'b_dash')`、`exec('b', { op: 'skill', skill: 'dash' })` 回 `true`，B 的 `skillCd.dash > 0`，本地是 0。B 附近放一個爐心並 found（`withActor(b, …)` 加 `tryPlace`）→ `exec('b', { op: 'spawnCore', id: g.settle.cores[0].id })` 之後 `actors.get('b')!.spawnCore` 等於該 id，本地的 `spawnCore` 不變（B10）。
  - `place`：B 在 (50, 59)，背包第 1 格放 10 個 `dirt`；`exec('b', { op: 'place', x: 52, y: 59, slot: 1 })` 回 `true`，那格變 `T.DIRT`，B 的 dirt 剩 9；`{ x: 70, y: 59 }`（超出 `REACH_TILES = 6`）→ `false`，`drainEvents('b')` 有 `{ type: 'blocked', reason: 'reach' }`。
  - `沒有這個 pid 會拋`：`expect(() => g.exec('zz', { op: 'respec' })).toThrow(/no actor/)`。
- [ ] **Step 3：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/engine/commands.test.ts src/scripts/games/delve/engine/exec.test.ts`。預期 FAIL，原因是 `./commands` 不存在或 `exec` 不是函式。
- [ ] **Step 4：實作** `engine/commands.ts`、`exec`／`act`／`runCmd` 與 B10。
- [ ] **Step 5：跑測試確認通過**：上面兩檔 PASS；golden、central、全套 vitest、delve e2e PASS；tsc 沒有新增錯誤。
- [ ] **Step 6：Commit** `feat(delve): exec command bus for player actions`

### Task 3：`tossSlot` 與丟的人的撿取延遲

**Files:**
- Modify: `engine/entities.ts`（`DroppedItem`、`Picker`、`DropList.spawn`／`step`）、`engine/game.ts`（`tossSlot`、pickers 補 `pid`、`BlockReason` 加 `'lockedtoss'`、`DelveEvent` 加 `toss`、`runCmd` 的 `toss`）、`render/model.ts`（`BLOCKED.lockedtoss` 的文案）、`render/model.test.ts`（新文案的斷言）
- Test: Create `engine/toss.test.ts`

**Interfaces — Consumes:** Task 2 的 `exec`、`Cmd` 的 `toss`。**Produces:**

```ts
// engine/entities.ts
export interface TossOwner { pid: string; delay: number; }
export interface DroppedItem { …; owner?: string; ownerDelay?: number; }   // 只有丟出的才有這兩個鍵
export interface Picker { …; pid?: string; }
spawn(item, count, x, y, vx?, vy?, pickDelay?, gear?, tint?, owner?: TossOwner): DroppedItem | null;
// engine/game.ts
export const TOSS_VX = 200, TOSS_VY = 150, TOSS_OWNER_DELAY = 1.5;
tossSlot(slot: number, n?: number): boolean;      // 作用在 cur（B7）
// DelveEvent 新增：{ type: 'toss'; item: ItemId; n: number; x: number; y: number }
```

`DropList.step` 裡，`ownerDelay` 跟 `pickDelay` 一樣每步倒數。挑撿的人時，略過 `pk.pid === d.owner && d.ownerDelay > 0` 的組合；那個人也不能把它吸過去。帶 owner 的堆只跟 owner 相同的堆合併，一般掉落物（owner 為 undefined）照舊互相合併。`render/model.ts` 的文案：`lockedtoss: '鎖定的裝備不能丟（先在背包裡解鎖）'`。

- [ ] **Step 1：寫失敗測試** `engine/toss.test.ts`（arena 同 `engine/actors.test.ts`）：
  - `丟出整格`：`give('dirt', 10)`，選第 0 格 → `act({ op: 'toss', slot: 0 })` 回 `true`；背包 dirt 是 0；`drops.list` 有一堆 `count 10`、`owner 'h'`、`ownerDelay 1.5`，位置在玩家中心朝 `facing` 那一側；事件有 `{ type: 'toss', item: 'dirt', n: 10 }`。
  - `丟出一部分`：`act({ op: 'toss', slot: 0, n: 3 })` → 背包剩 7，地上 3。
  - `丟的人 1.5 秒內撿不回來`：丟出後 `setMoveX(1)` 走 18 步再 `setMoveX(0)`，也就是站到掉落物旁邊；跑到丟出後第 84 步（1.4 秒）→ 背包 0、地上仍有 10；再站 60 步 → 撿回來（背包 10、地上空）。
  - `另一個人立刻撿得到、數量守恆`：本地在 (40, 59)、`facing = 1`，`addActor('b', hero(), { x: 42, y: 59 })`；A 丟 10 dirt；每一步檢查 `A.count + B.count + 地上 dirt 總數 === 10`，跑 120 步；最後 B 有 10。
  - `撿的人背包滿：留在地上`：B 的背包 40 格全部塞滿別的東西 → 120 步後地上仍有 10；A 再 `setMoveX(1)` 走 18 步、停下、站 60 步就撿回。
  - `帶詞條的裝備與時裝原樣丟出`：`giveGear('iron_sword', 2)` 丟出 → 那個掉落物的 `gear` 與丟出前 `deep equal`；鎖定的裝備 → 回 `false`，背包不變，事件 `{ type: 'blocked', reason: 'lockedtoss' }`。
  - `不合法`：空格、`n` 是 0、`n` 大於數量、死亡中 → 都回 `false`，`drops.list` 不變。
  - `存檔形狀不變`：丟出後 `snapshotGame(g, 0).header.drops[0]` 沒有 `owner`／`ownerDelay` 鍵；`restoreGame` 讀回後的掉落物也沒有 owner。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/engine/toss.test.ts`。預期 FAIL：toss 回 `false`、沒有 owner。
- [ ] **Step 3：實作**（B7）。
- [ ] **Step 4：跑測試確認通過**：toss.test PASS；`engine/actors.world.test.ts`（多人撿取）、golden、`render/model.test.ts`、全套 vitest、delve e2e PASS；tsc 沒有新增錯誤。
- [ ] **Step 5：Commit** `feat(delve): toss inventory slots with an owner pickup delay`

### Task 4：UI 全部走 `act`，加上 G 鍵

**Files:**
- Modify: `render/hud.ts`（108 的 `selectSlot` 是輸入，保留不動；169、183、190、194、209、276、287 的 `inventory.swap`、299、302、310、313、322、327、799、810、824、845、849、857）、`render/main.ts`（205 `closeChest`、218 `talkNearest`）、`render/session.ts`（239、250 `closeMirror`；246 `setBodyLook`；247 `recolorWorn`；267 `rebirth`；907、913 的 `setAppearance` 是標題畫面預覽，不改）、`render/folkUi.ts`（294–318）、`render/settleUi.ts`（219、221、339、342、344、348）、`render/levelsUi.ts`（93、146、268、286）、`render/mapView.ts`（265）、`render/waystoneUi.ts`（97）、`input/controls.ts`（148 `talkAtPx`；新增 `toss`）、`input/mapping.ts`（`KeyAction` 加 `'toss'`，`KeyG: 'toss'`）、`input/mapping.test.ts`、`tests/e2e/delve.spec.ts`
- Create: `render/execRoutes.test.ts`

**Interfaces — Consumes:** Task 2 的 `act`、Task 3 的 `toss`。**Produces:** `ControlsOptions` 不變。G 在 `controls.ts` 裡直接呼叫 `game.act({ op: 'toss', slot: game.inventory.selected })`（非重複按鍵，`isBlocked()` 時忽略）。

掃描測試的寫法照 `engine/flatAccess.test.ts`：列出 `render/` 與 `input/` 底下所有不是 `.test.ts` 的檔案，對每個 mutator 名稱找 `\b(?:game|g|this\.game|scene\?\.game)\.(NAME)\(` 的呼叫，另外找 `\.inventory\.swap\(`，命中就以 `檔案:行號` 失敗。mutator 名單：`craft takeChestSlot takeAllFromChest depositToChest closeChest closeMirror equipFromInventory equipVanityFromInventory unequip unequipVanity setHideArmor recolorWorn setBodyLook rebirth toggleLock salvage salvageAll reroll upgrade ascend deepforge buy sell service residentService folkBuy folkSell folkService acceptQuest turnInQuest refreshQuests learnSkill respecSkills useSkill talkNearest talkAtPx travel travelStone setSpawnCore toggleMarker tossSlot tryPlace`。

- [ ] **Step 1：寫失敗測試**：
  - `render/execRoutes.test.ts` → `render/ 與 input/ 不直接呼叫 mutator`：違規清單等於 `[]`。現在會列出上面 Files 裡的每一個行號。
  - `input/mapping.test.ts`：`keyAction('KeyG') === 'toss'`。
  - `tests/e2e/delve.spec.ts` 新增 `按 G 丟出手上的道具`：進遊戲以後 `page.evaluate` 執行 `g.give('torch', 5)`，把它換到第 0 格並選中；`page.keyboard.press('KeyG')` → `expect.poll(() => 背包 torch 數)` 變成 0，`g.drops.list.some(d => d.item === 'torch' && d.count === 5)` 為 true（在 1.5 秒的撿取延遲內檢查）；`errors` 等於 `[]`。
- [ ] **Step 2：跑測試確認失敗**：`npx vitest run src/scripts/games/delve/render/execRoutes.test.ts src/scripts/games/delve/input/mapping.test.ts` FAIL（列出違規行／`null`）；`npx playwright test tests/e2e/delve.spec.ts --project=chromium -g "按 G"` FAIL。
- [ ] **Step 3：改線**：每個呼叫都換成 `game.act({ op: …, … })`，回傳值的用法不變（型別來自 `CmdResults`）。`hud.ts:287` 換成 `act({ op: 'swap', a: this.picked, b: i })`。再加上 G 鍵。
- [ ] **Step 4：跑測試確認通過**：掃描測試、mapping 測試 PASS；全套 vitest PASS；`npx playwright test tests/e2e/delve.spec.ts --project=chromium` 全綠（含新測試與既有的箱子、商店、鍛造、衣櫥、傳送碑流程）；tsc 沒有新增錯誤。
- [ ] **Step 5：實機目測**：在 4321 起 dev server（先確認 4321 是不是被別的 worktree 佔用、服務的是不是本分支），開箱拿取、合成、換裝、買賣、技能樹、傳送碑、G 丟出各試一次，回報時附上 `http://localhost:4321/games/delve`。
- [ ] **Step 6：Commit** `refactor(delve): route UI actions through the exec bus; G tosses the held stack`

---

## Self-review

- **Spec 覆蓋**：§5.2 編輯日誌（chunk 鍵、per-chunk rev、箱子與 `unlocked`、液體另一份 dirty）→ Task 1。§5.2 指令匯流排（白名單、綁 pid、solo／host 直接執行）→ Task 2，replica 分支留給 M-B3（B2）。§5.5 `place` 指令 → Task 2（B3）。§5.7 `tossSlot`（owner、丟的人 1.5 s 撿不回來）→ Task 3。§7 R11（盤點後逐一改線，replica 遇到不在白名單的呼叫就 throw）→ 盤點與改線在 Task 4；throw 屬於 replica 模式，留給 M-B3。§6 M-B 的「丟出的物品被別人撿走，數量守恆」→ Task 3。其餘 §6 M-B 項目（loopback、回滾、按 chunk 同步、30% 丟包）屬於 M-B3。M-B1 留下的項目都不屬於本段，除了 B10（`spawnLink` 寫死本地，會讓 `exec` 出錯）。
- **型別一致**：`EditBatch`、`EditJournal.drain`、`World.touchChest`、`drainNetLiquid` 只在 Task 1 定義；`Cmd`、`CmdResults`、`exec`、`act` 只在 Task 2 定義，Task 3 與 Task 4 使用同樣的名稱；`toss` 的 op 形狀 `{ slot, n? }` 在 Task 2、3、4 一致；`TossOwner`／`owner`／`ownerDelay`／`Picker.pid` 只在 Task 3。
- **Review Focus** 的 5 條都已寫成對應 task 的測試：1 → Task 2 的 act 等價測試；2 → Task 2 的說話／技能／重生點；3 → Task 2 的 `validCmd` 垃圾表；4 → Task 1 的十萬次編輯、外圍、沒常駐、停放；5 → Task 3 的守恆、延遲、背包滿。
- **比例**：沒有函式本體，只有簽名、數值與斷言；`runCmd` 的 switch 由簽名和結果表決定。
