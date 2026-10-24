# DELVE 1b M2b「切換到 gen2、刪舊、凍結 v1」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新世界一律用 gen2；舊世界（genVersion 7、M1 開發版烘焙出的 genVersion 8、v0 的 gen2 開發世界）打開時以同一個種子整個重新產生（世界資料捨棄、角色檔保留、回到出生點、一次性繁中通知）；刪掉舊生成器、烘焙、`BakedSource`、`LegacyMeta` 與旗標；做完凍結前必做清單後把 gen2 定為版本 1 並凍結。

**Architecture:** 先在 gen2 v0 上收尾凍結前清單（Task 1–2），再把「重新產生」做成存檔層的純函式（Task 3），接著分兩步把測試從舊生成器搬走：小尺寸世界改用新的平地建構器 `flat`、正式尺寸改用 gen2（Task 4–6）；然後切換遊戲（Task 7）、刪掉 legacy（Task 8）、凍結 v1（Task 9）。每個 task 之後預設遊戲都能玩：Task 7 之前預設仍是舊生成器，Task 7 起是 gen2。

**Tech Stack:** TypeScript、Vitest、Playwright、IndexedDB + gzip 存檔、WebRTC 連線（`net/`）。

**Spec:** `docs/superpowers/specs/2026-10-23-delve-infinite-1b-cultures-design.md`（§5 開頭 2026-10-24 使用者決定、§5 版本鎖 / 雜湊鎖 / genBlocker、§9 M2 列與「M2 追加」為約束）；前置計畫 `docs/superpowers/plans/2026-10-24-delve-1b-m2a-home-structures.md`（必須已合併）；memory `delve-infinite-1b-carry` 的「M2 凍結 gen2 v0→v1 前必做」清單。

---

## 關鍵架構決定（作者決定，附理由）

1. **重新產生是存檔層的事、只在打開世界時做一次。** `save/regen.ts` 判斷一份世界標頭要不要重生（`regenReason`）並產生新的世界檔；session 打開世界時先問它，要的話重生 → 立刻寫回同一個存檔槽 → 開局 → 顯示通知 → 再存一次（清掉通知旗標）。匯入舊檔只存不重生（打開時才重生）。理由：打開世界是唯一的入口（`openSplit` / `openLegacy` / 沒有 IndexedDB 的 `openImported`），一處判斷就涵蓋舊合併存檔、匯入、M1 的烘焙世界與 v0 開發世界。
2. **保留的世界資料只有身分**：`worldId`、`worldName`、seed、peaceful、建立時間；地形、建物、箱子、液體、迷霧、地區發現、傳送碑、時間 / 季節、BOSS 擊敗、好感度、委託、每個角色的 visit 全部捨棄（spec §5 使用者決定）。角色檔一個欄位都不碰。不備份舊世界記錄（使用者決定刪掉 `.v7.bak` 流程；舊碼刪掉後備份也無法還原）。
3. **小尺寸世界（測試與「建立角色」用的暫存世界）改用平地建構器 `flat`。** 有界、中央 arrays 模式、地表在 `floor(height × 0.4)`（草 1 + 泥土到 +6 + 石頭）、全森林、出生點在中央、沒有結構；`genVersion = GEN_VERSION_FLAT = 0`、`genKind 'flat'`。正式尺寸（4200×1200）的預設改成 gen2。理由：122 個測試用的舊世界中 ~106 個是 160×100 之類的小世界（agent 調查），gen2 只有正式尺寸；`createCharacter`（`save/character.ts:134`）每次建角色都生成一個 160×100 舊世界只為了拿初始玩家狀態。平地世界不會上線（session 一律建 gen2），genVersion 0 只出現在測試與連線測試台。
4. **測試遷移先於刪除：Task 4–6 讓所有測試不再依賴舊生成器的輸出，Task 8 才刪檔。** 測試主題還存在的（村民、地城玩法、探索、存檔格式）改寫到 gen2 / flat；主題就是舊生成器的（`world.central`、legacy 的 worldgen 測試、烘焙、v1 雜湊）在 Task 8 隨程式一起退役，每一個在 commit 說明寫「退役理由 + 意圖由哪個 gen2 測試承接」。理由：一次刪除會讓幾十個測試同時紅，無法判斷是遷移錯還是功能壞。
5. **`actor.golden` 拆成「行為」與「存檔快照」兩半。** 行為（getState、怪物雜湊、事件序列）在換建構器前後必須逐值相同；存檔快照的雜湊含世界資料（地區清單、生成器附帶資訊），換建構器必然改變，依 spec §5 重錄並寫明原因。理由：spec 要求「改用固定建構器並重錄（說明原因）」，但重錄不能掩蓋 PlayerActor 行為的改變。
6. **凍結 = `GEN2_VERSION = GEN2_MIN_VERSION = 1`。** v0 從未發佈：v0 的鎖或 outerGen 0 的存檔走重新產生（不是拒絕）。雜湊鎖重錄 v1 一筆、欄位涵蓋家鄉地城 / 村莊與外圍各種結構；版本閘門慣例寫進 `engine/gen2/index.ts` 檔頭與 `docs/claude/architecture.md`。理由：spec §5「M1–M2 期間之前的輸出不必相容」、「每個 gen2 版本要有固定種子的區塊雜湊測試鎖住」。

## Global Constraints

- 路徑都相對於 `src/scripts/games/delve/`（e2e 在 repo 根的 `tests/e2e/`）。
- 測試一律 `npx vitest run <path>`（不用 `npm test`）；每個 task commit 前跑涉及的資料夾，Task 4、5、8、10 跑全套 `npx vitest run`。
- 型別檢查 `rtk proxy npx tsc --noEmit -p .`：總數維持 773，`games/delve` 0 個錯誤。
- Commit：Conventional Commits，最後一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- CRLF 檔編輯後保持 CRLF（`git ls-files --eol`）。本計畫會改到的 CRLF 檔：`engine/game.ts`、`engine/world.ts`、`render/session.ts`、`render/main.ts`、`render/journal.ts`、`save/serialize.ts`、`save/character.ts`、`save/serialize.test.ts`、`save/migrate.test.ts`、`engine/game.balance.test.ts`、`engine/game.tools.test.ts`、`tests/e2e/delve.spec.ts`。新檔一律 LF。
- DELVE 介面文字寫死繁體中文；美術只用 `PALETTE_HEX`；禁 `!important`、禁行內樣式；不准裸 `git stash`。
- 確定性規則同 M2a（`engine/gen2/**`、`engine/genPrims.ts`）。tile id 只能附加、上限 256（本計畫不新增）。保留 `BIOME.OCEAN` 與它的所有消費者（v1 刪掉後 OCEAN 仍由 gen2 使用）。
- 重的測試寫明逾時；測試本體不得只有註解或永遠會過。
- **不得悄悄放寬斷言**：遷移時失敗的測試要嘛改寫成對新世界同樣嚴格的斷言、要嘛退役並寫明理由與承接測試；把門檻調鬆到會過、或把 `expect` 拿掉，審查一律退回。
- **gen2 v0 在 Task 9 之前仍可變**：改到 gen2 輸出的 task 重錄 `GEN2_HASHES[0]`；Task 9 之後 v1 的輸出不得再變。
- spec 原文約束：「世界名稱與種子保留，玩家回到出生點」、「角色檔（等級、背包、裝備、技能、外觀）……照舊保留」、「每片大陸鎖版本、版本雜湊鎖、genBlocker 拒絕更新版存檔這些規則照舊」、「新世界一律 gen2，gen2 版本在 M2 定為 1 並凍結」。

## Review Focus

1. **重新產生途中失敗或關頁**：原世界記錄必須原封不動、角色檔永遠不被這條路徑寫入；重生後通知只出現一次（顯示後立刻存檔），重新整理不再出現 → Task 3 的失敗注入測試、Task 7 的 e2e。
2. **各種舊來源都要走重生、不能卡在錯誤訊息**：舊合併存檔（format ≤ 9 的 'main'）、匯入的 v7 世界檔、200×100 的 format9 / format10 小 fixture、正式尺寸 format11-v7 fixture、M1 烘焙出的 v8、v0 的 gen2 開發世界、COMPAT_GEN 的舊 genVersion 4 → Task 3（純函式）與 Task 9（v0）的測試。
3. **連線版本**：新房主（gen2 v1）配舊版客人、新客人配舊房主（genVersion 7 welcome）都要明確結束並顯示中文，不能建出錯的副本；Task 5 起正式尺寸預設是 gen2，連到舊房主的客人副本必須明確指定 legacy → Task 5、7 的連線測試。
4. **遷移把仍有意義的測試刪掉或放寬** → Task 4、5、8 的 commit 說明附「退役 / 改寫清單」，Task 10 的驗收 agent 逐條對照。
5. **凍結後輸出還會變**：雜湊鎖只涵蓋少數欄時，家鄉地城 / 村莊或外圍結構的改動不會被抓到；凍結後 `homeContent` 依賴的錨點規則被改 → Task 9 的雜湊欄位守衛斷言與錨點快照。

---

### Task 1: 凍結前必做（一）：分割測試補齊、主坑道底部夾在熔岩線之上

**Files:**
- Modify: `engine/gen2/caves.ts:59-71`（`shaftOf` 的 bottom）
- Test: `engine/gen2/split.test.ts`（新）、`engine/gen2/fill.test.ts`

**Interfaces:**
- `shaftOf(...)` 的 `bottom = min(deep(sx) + BOTTOM_BELOW, LAVA_Y − ROOM_R − 2)`（底端圓室整個在熔岩線上方 2 格以上）。
- carry 清單對應：「補分割測試：樹、主坑道、液體藍圖、海 / 島」「主坑道底部夾在 LAVA_Y 之上」。

- [ ] **Step 1: 寫失敗測試**

```ts
// split.test.ts：「任意一段 fill = 整欄 fill」對每一種跨欄的東西各找一個實例（5 個種子內搜尋，找不到 = 測試失敗）
const KINDS = ['tree', 'shaft', 'lake', 'cave_lake', 'lava_pool', 'hive', 'sea_shore', 'island', 'shipwreck', 'reef', 'sea_ruin', 'village', 'dungeon', 'keep'] as const;
for (const k of KINDS) it(`分段填 = 整欄填：${k}`, () => { const { src, x } = crossingInstance(k);       // x = 該實例跨過的一條欄界（x % 32 ≠ 0 的切點）
  const cx = x >> 5, whole = fillCol(src, cx);
  for (const cut of [x, cx * 32 + 1, cx * 32 + 31]) { const parts = new Column(cx, 1200); src.fill(parts, cx * 32, cut); src.fill(parts, cut, cx * 32 + 32); expect(bytes(parts)).toEqual(bytes(whole)); } }, 60_000);
// fill.test.ts
it('主坑道底端圓室在 LAVA_Y − 2 以上（50 個種子 × 家鄉 + 每側 3 片大陸）', () => { for (const seed of SEEDS50) { const src = new Gen2Source(seed), s = seedInt(seed, 'g2-shaft');
  for (const r of sampleRegions(src, { home: true, perSide: 3 })) { const sh = shaftOf(s, r, (x) => src.surfaceAt(x), (x) => src.layersAt(x).deep);
    if (sh) expect(sh.bottom + 6, `${seed} ${r.index}`).toBeLessThan(LAVA_Y - 2); } } });
```
（`crossingInstance(kind)` 寫在 `split.test.ts`：tree = 樹冠跨欄的樹根欄、shaft = 坑道某列跨欄、sea_shore = 海岸爬坡跨欄、其餘 = 外框跨欄的藍圖。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/split.test.ts src/scripts/games/delve/engine/gen2/fill.test.ts`；Expected: 坑道測試 FAIL（現在只看 deep + 12）；分割測試若有 FAIL 就是真 bug，照 Step 3 修。
- [ ] **Step 3: 實作** — 夾住 bottom；分割測試抓到的不一致修在對應的 pass（常見原因：觸及範圍 `FILL_REACH` 不夠、藍圖格依欄索引時漏掉）。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: PASS（重錄 `GEN2_HASHES[0]`）。
- [ ] **Step 5: Commit** — `fix(delve): clamp gen2 shaft bottom above the lava line; split-fill tests for every cross-column feature`。

---

### Task 2: 凍結前必做（二）：湖欄地表與傳送碑、外圍寶箱存讀、gen2 regionAt 的 tier 實值

**Files:**
- Modify: `engine/gen2/structures/lakes.ts`（地表湖設 `ground` = 盆底第一個實心格、新增水面資訊）、`engine/gen2/index.ts`（`waterTopAt` 含地表湖的水面）、`engine/waystones.ts:79-113`（`gen2LandQuery.isLand` 排除有水的欄）
- Test: `engine/gen2/lakes.test.ts`、`engine/waystones.test.ts`、`save/serialize.gen2.test.ts`、`engine/gen2/layout.test.ts`

**Interfaces:**
- `Blueprint` 加選填 `water?: { x0: number; tops: Int16Array }`（該欄水面 y；地表湖用）；`Gen2Source.waterTopAt(x)` = 海（profile）或地表湖（藍圖 `water`），都沒有 → null。
- `gen2LandQuery(src).isLand(x)` = 地區是 `wild` / `culture`（M1）**且** `src.waterTopAt(x) === null`。
- carry 對應：「湖欄的 Profile2.surfaceAt ≠ 實際地形，傳送碑會浮在湖上」「補外圍範圍的寶箱保存測試」「v1 regionAt 的 landmass / tier 是佔位值，M3 距離難度會讀到」（v1 在 Task 8 刪除；這裡證明 gen2 的值是真的）。

- [ ] **Step 1: 寫失敗測試**

```ts
// lakes.test.ts
it('地表湖：每欄 surfaceAt = 盆底第一個實心格、waterTopAt = 水面', () => { const src = new Gen2Source('lake2'), w = worldOf(src);
  for (const b of surfaceLakes(src, -20_000, 20_000).slice(0, 10)) { loadColumns(w, b.x, b.x + b.w); for (let x = b.x; x < b.x + b.w; x++) { if (!hasWater(w, x)) continue;
    expect(src.surfaceAt(x)).toBe(firstSolid(w, x)); expect(src.waterTopAt(x)).toBe(firstWater(w, x)); } } }, 60_000);
// waystones.test.ts
it('gen2 傳送碑（±1..±6，30 個種子）不在有水的欄、腳下實心、上方 2 格空氣', () => { for (const seed of SEEDS30) { const g = new DelveGame({ seed, worldGen: { kind: 'gen2' } });
  for (const id of [1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5, -6]) { const s = g.waystones.byId(id)!; g.world.ensureColumn(s.x >> 5);
    expect(g.world.source!.waterTopAt!(s.x), `${seed} ${id}`).toBeNull(); expect(isSolidTile(g.world.getFg(s.x, s.y + 1))).toBe(true);
    expect(g.world.getFg(s.x, s.y)).toBe(T.WAYSTONE); expect(g.world.getFg(s.x, s.y - 1)).toBe(T.AIR); } } }, 300_000);
// serialize.gen2.test.ts
it('外圍大陸的寶箱：搜過的存讀後仍是空的、沒搜過的存讀後內容相同（卸載 / 重載 / 存檔三種都驗）', () => { const g = new DelveGame({ seed: 'outer-chest', worldGen: { kind: 'gen2' } });
  const [a, b] = outerChests(g, 2), ka = g.world.idx(a.x, a.y), kb = g.world.idx(b.x, b.y);
  g.teleport(a.x, a.y - 1); g.step(FIXED_DT); g.world.chests.get(ka)![0] = null; g.world.touchChest(a.x, a.y); const fullB = structuredClone(g.world.chests.get(kb) ?? outerChestSlots(g, b));
  const h = (restoreGame(decodeSave(encodeSave(snapshotGame(g, 1)))) as RestoreOk).game; h.world.ensureColumn(a.x >> 5); h.world.ensureColumn(b.x >> 5);
  expect(h.world.chests.get(ka)![0]).toBeNull(); expect(h.world.chests.get(kb)).toEqual(fullB); }, 60_000);
// layout.test.ts
it('regionAt 的 landmass / tier / side 是真值（M3 距離難度會讀）', () => { const lay = L('tier'); for (const side of [1, -1] as const) for (let i = 1; i <= 9; i++) { const m = lay.landmass(side, i);
  const r = lay.regionAt((m.x0 + m.x1) >> 1)!; expect([r.side, r.landmass, r.tier]).toEqual([side, i, m.tier]); expect(m.tier).toBe(Math.ceil(i / 2)); } });
```
（`surfaceLakes`、`hasWater`、`firstWater`、`outerChests(g, n)`（東側第一片大陸裡的前 n 個藍圖箱子）、`outerChestSlots` 寫在測試檔內；`T.WAYSTONE` 以 `tiles.ts` 名稱為準。tier 公式以 M1 Layout 的規則為準：海與島屬朝外下一片大陸的 tier，從海開始時第 i 片的 tier = ceil(i / 2)。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/lakes.test.ts src/scripts/games/delve/engine/waystones.test.ts src/scripts/games/delve/save/serialize.gen2.test.ts src/scripts/games/delve/engine/gen2/layout.test.ts`；Expected: 湖與傳送碑 FAIL。
- [ ] **Step 3: 實作** 如上。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine src/scripts/games/delve/save`；Expected: PASS（重錄 `GEN2_HASHES[0]` 若有改到）。
- [ ] **Step 5: Commit** — `fix(delve): gen2 lake columns report real ground and water; waystones avoid water; outer chest persistence test`。

---

### Task 3: 舊世界重新產生（存檔層）與一次性通知

**Files:**
- Create: `save/regen.ts`、`save/regen.test.ts`
- Modify: `save/worldSave.ts`（`WorldHeader.regenNotice?: true`、編解碼、`snapshotGame` 系列不寫它）

**Interfaces:**
- Produces（`save/regen.ts`）：
  ```ts
  export type RegenReason = 'legacy' | 'baked' | 'gen2-old';
  export function regenReason(h: { format: number; genVersion: number; width: number; height: number; outerGen?: number; gen2?: Gen2Save }): RegenReason | null;
  //  genVersion 1..7（含 COMPAT_GEN 的 4、任何尺寸）→ 'legacy'；genVersion 8 且 gen2.bake 存在 → 'baked'；
  //  genVersion 8 且（outerGen < GEN2_MIN_VERSION 或任一鎖 ver < GEN2_MIN_VERSION）→ 'gen2-old'；genVersion 0（flat，Task 4）與其他 → null
  export const REGEN_NOTICE = '地圖產生器已全面更新：這個世界已用原本的種子重新產生，地形、建築、箱子與探索紀錄都是新的。你的角色（等級、背包、裝備、技能、外觀）完整保留，並回到出生點。';
  export const REGEN_FAILED_MSG = '世界重新產生失敗，原本的存檔沒有改動：';
  export function regenerateWorld(old: WorldHeader, now: number): WorldData;
  //  new DelveGame({ seed: old.seed, peaceful: old.peaceful, worldGen: { kind: 'gen2' } }) → 世界檔（沒有任何 visit / held）；
  //  worldId、worldName、建立時間沿用 old；header.regenNotice = true
  export function regenerateLegacyMain(data: SaveData, now: number): { world: WorldData; character: DelveCharacter };
  //  舊合併存檔（format ≤ 9）：角色 = splitSnapshot(data, newIdentity(now), whereOf-等價, now).character（不生成舊世界）；世界 = regenerateWorld
  export function regenerateSlot(store: SplitStore, slot: string, character: DelveCharacter, now: number, regen?: typeof regenerateWorld):
    Promise<{ ok: true; game: DelveGame; session: SplitSession } | { ok: false; message: string }>;
  //  讀 slot 的世界檔 → regen → restoreSplit(新世界, character)（角色第一次來 = 出生點）成功後才 putWorld；任何丟錯 → { ok: false, message: REGEN_FAILED_MSG + 原因 }，store 一筆都不寫；永遠不寫角色記錄
  ```
- `DelveGame.regenNotice: boolean`（restore 時從 header 帶入；`snapshotGame` 永遠不寫 `regenNotice`，所以通知後的第一次存檔就清掉）。
- carry 對應：「寫明版本 0 的烘焙存檔在 M2 怎麼處理，並提供 .v7.bak 還原路徑」——裁決：v0 的烘焙存檔（`'baked'`）與 v7 一樣重生；`.v7.bak` 還原路徑依使用者 2026-10-24 決定**不提供**（舊碼刪除後無法還原；M1 期間只在開發版產生過），留下的 `*.bak` 記錄本來就不列出（`save/storage.ts:205`，下面加測試）。

- [ ] **Step 1: 寫失敗測試**

```ts
it('regenReason 真值表', () => { const base = { format: 11, width: 4200, height: 1200 };
  expect(regenReason({ ...base, genVersion: 7 })).toBe('legacy'); expect(regenReason({ ...base, genVersion: 7, width: 200, height: 100 })).toBe('legacy');
  expect(regenReason({ format: 5, genVersion: 4, width: 4200, height: 1200 })).toBe('legacy');
  expect(regenReason({ ...base, genVersion: 8, outerGen: GEN2_VERSION, gen2: { locks: [], bake: BAKE_STUB } as Gen2Save })).toBe('baked');
  expect(regenReason({ ...base, genVersion: 8, outerGen: GEN2_VERSION, gen2: { locks: [] } })).toBeNull();
  expect(regenReason({ ...base, genVersion: 0, width: 160, height: 100 })).toBeNull(); expect(regenReason({ ...base, genVersion: 9 })).toBeNull(); });
it('舊世界檔（format10、format11-v7 正式尺寸）與 M1 烘焙世界：regenReason ≠ null、重生後是正式尺寸 gen2、身分保留、沒有 visit；format9 合併存檔的標頭也判定要重生', () => {
  expect(regenReason(fixture9Data.header)).toBe('legacy');
  for (const f of [fixture10World, fixture11World, bakedWorldStub]) { expect(regenReason(f.header)).not.toBeNull(); const n = regenerateWorld(f.header, 5);
    expect([n.header.genVersion, n.header.width, n.header.height, n.header.bounds]).toEqual([8, 4200, 1200, 'infinite']);
    expect([n.header.worldId, n.header.worldName, n.header.seed]).toEqual([f.header.worldId, f.header.worldName, f.header.seed]);
    expect(Object.keys(n.header.visits ?? {})).toEqual([]); expect(n.header.regenNotice).toBe(true); expect(regenReason(n.header)).toBeNull(); } }, 120_000);
it('regenerateSlot：成功 → 新世界寫入同一槽、角色在出生點、等級 / 背包 / 裝備 / 外觀不變、角色記錄沒被寫；失敗 → 一筆都不寫', async () => {
  const store = fakeSplitStore({ slots: { 'w-1': fixture11Bytes } }), char = structuredClone(CHAR);
  const bad = await regenerateSlot(store, 'w-1', char, 1, () => { throw new Error('boom'); });
  expect(bad).toEqual({ ok: false, message: REGEN_FAILED_MSG + 'boom' }); expect(store.putCalls).toBe(0); expect(store.slot('w-1')).toEqual(fixture11Bytes);
  const ok = await regenerateSlot(store, 'w-1', char, 2); if (!ok.ok) throw new Error(ok.message);
  expect(ok.game.genKind).toBe('gen2'); expect(ok.game.regenNotice).toBe(true); expect(ok.game.player.x).toBeCloseTo(ok.game.spawn.x, 0);
  expect(characterOf(ok.game)).toMatchObject(pick(CHAR, ['levels', 'inventory', 'equipment', 'appearance', 'vanity']));
  expect(store.characterPuts).toBe(0); expect(regenReason(decodeWorld(store.slot('w-1')!).header)).toBeNull();
  const again = restoreSplit(saveSplitGame(ok.game, whoOf(char), whereOf(decodeWorld(store.slot('w-1')!).header), 3).world, char);
  expect((again as RestoreOk).game.regenNotice).toBe(false); }, 120_000);
it('舊合併存檔（format9 main）：角色從存檔拆出（不生成舊世界）、世界重生', () => { const { world, character } = regenerateLegacyMain(fixture9Data, 7);
  expect(character.levels).toEqual(fixture9Data.header.levels); expect(world.header.genVersion).toBe(8); expect(world.header.regenNotice).toBe(true); });
it('*.bak 記錄不列在可繼續的世界', async () => { const s = memSplitStore(); await s.putRaw('w-9.v7.bak', bytesOf(fixture11World));
  expect((await s.listWorlds()).map((m) => m.slot)).not.toContain('w-9.v7.bak'); });
```
（fixture 讀檔用 `save/legacyFixture.ts` 的 `readLegacyFixture` 與 `FIXTURE11_PATH`（只讀位元組，不生成）；`bakedWorldStub` = format11-v7 fixture 的標頭改成 genVersion 8 + `gen2.bake` 的合成標頭；`fakeSplitStore` 加 `characterPuts` 計數；`characterOf` / `pick` / `memSplitStore` / `putRaw` 以 `save/` 既有輔助為準；`fixture9Data.header.levels` 的實際欄位路徑以 SaveData 為準。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/save/regen.test.ts`；Expected: FAIL（模組不存在）。
- [ ] **Step 3: 實作** 如上（只新增，不改 session；預設遊戲行為不變）。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/save`；Expected: PASS。
- [ ] **Step 5: Commit** — `feat(delve): regenerate old worlds with gen2 from the same seed (save layer), one-time notice flag`。

---

### Task 4: 平地建構器、小尺寸世界的預設、建角色不再生成世界、標題畫面改 gen2、actor.golden 拆半

**Files:**
- Create: `engine/flatWorld.ts`、`engine/flatWorld.test.ts`
- Modify: `engine/worldBoot.ts`（`WorldGenSpec` 加 `{ kind: 'flat' }`、`bootFlat`）、`engine/game.ts:119, 831-850`（預設：沒給 `worldGen` / `gen` 且不是 4200×1200 → flat；`genKind` 加 `'flat'`）、`engine/constants.ts`（`GEN_VERSION_FLAT = 0`）、`save/genCheck.ts`（genVersion 0：非正式尺寸放行、正式尺寸擋）、`save/serialize.ts:1041-1047`（`worldGenFor`：0 → flat）、`net/guest.ts:122-134`（`coopGenOk`：genVersion 0 且有界 → true）、`render/titleScene.ts:20, 62, 223-228`（gen2 世界、以 `spawn.x` 為準）、`engine/actor.golden.test.ts`、`net/testRig.ts:112-119`（arena 不再寫 `w.biome[]` 以外的 legacy 假設，見下）
- Test: 全套（失敗的小世界測試逐一處理）

**Interfaces:**
- Produces（`flatWorld.ts`）：`bootFlat(seed: string, width: number, height: number, bounds: WorldBounds): WorldContent`——`World(width, height, { bounds })`（arrays 模式）；`ground = floor(height × 0.4)`：`y = ground` 草、`ground + 1 .. ground + 6` 泥土、以下石頭、`y ≥ ground + 3` 有對應背景牆；`surface[x] = ground`、`biome[x] = FOREST`；`spawn = { x: width >> 1, y: ground − 1 }`；`layers` = 每欄 rock = ground + 7、deep = floor(height × 0.6)、molten = floor(height × 0.85)；其餘清單空、`regions: null`（照舊 `buildRegions`）、`outer: null`、`land: null`。
- `GEN_VERSION_FLAT = 0`（先 `grep -rn "genVersion" src/scripts/games/delve/save/__fixtures__` 與 git 歷史確認 0 從未被用過）。
- `genCheck.GenHeader` 加選填 `width?` / `height?`（genVersion 0 要看尺寸）；`coopGenOk` 的參數型別加 `'bounds'`（`Pick<Welcome, 'genVersion' | 'outerGenVersion' | 'gen2' | 'bounds'>`）。
- `actor.golden.test.ts`：`GOLDEN` 拆成 `GOLDEN_BEHAVIOR`（每 60 tick 的 `getState` 雜湊 + 怪物雜湊 + 事件類型序列）與 `GOLDEN_SAVE`（存檔快照雜湊）。

- [ ] **Step 1: 先在舊建構器上拆 golden（還沒換建構器）** — 把 `actor.golden.test.ts` 改成分別斷言 `GOLDEN_BEHAVIOR` 與 `GOLDEN_SAVE`，兩者的值在**現在的程式**（legacy 160×100 arena）跑出來貼上；原本的合併 `GOLDEN` / `GOLDEN2` 在這一步仍一起斷言（證明拆分沒改行為）。Run: `npx vitest run src/scripts/games/delve/engine/actor.golden.test.ts`；Expected: PASS。Commit：`test(delve): split actor golden into behaviour and save-snapshot halves (recorded on the unchanged legacy arena)`。
- [ ] **Step 2: 寫失敗測試**

```ts
// flatWorld.test.ts
it('平地世界：尺寸、地表、材質、出生點、genVersion 0 / genKind flat、不跑任何生成器', () => { const t0 = performance.now(), g = new DelveGame({ seed: 'f', width: 160, height: 100 });
  expect(performance.now() - t0).toBeLessThan(200); expect([g.genVersion, g.genKind]).toEqual([0, 'flat']);
  expect(g.world.surfaceAt(10)).toBe(40); expect(g.world.getFg(10, 40)).toBe(T.GRASS); expect(g.world.getFg(10, 45)).toBe(T.DIRT); expect(g.world.getFg(10, 60)).toBe(T.STONE);
  expect(g.spawn).toEqual({ x: 80, y: 39 }); expect(g.structures).toEqual([]); });
it('平地世界存讀往返；連線客人建得出同一個平地副本', () => { const g = new DelveGame({ seed: 'f2', width: 200, height: 100 }); g.world.setFg(50, 40, T.AIR); g.world.touch(50, 40);
  const r = restoreGame(decodeSave(encodeSave(snapshotGame(g, 1)))); expect(r.ok).toBe(true); expect((r as RestoreOk).game.world.getFg(50, 40)).toBe(T.AIR);
  expect(coopGenOk({ genVersion: 0, outerGenVersion: -1, bounds: undefined })).toBe(true); expect(coopGenOk({ genVersion: 0, outerGenVersion: -1, bounds: 'infinite' })).toBe(false);
  expect(genBlocker({ format: 11, genVersion: 0, width: 4200, height: 1200 })).not.toBeNull(); expect(genBlocker({ format: 11, genVersion: 0, width: 200, height: 100 })).toBeNull(); });
it('建角色不再生成世界：createCharacter 的輸出（除 id / 時間）與改動前相同、< 50 ms', () => { const t0 = performance.now(), c = createCharacter('甲', defaultLook(), 1);
  expect(performance.now() - t0).toBeLessThan(50); expect(stripIds(c)).toEqual(CHAR_BEFORE); });   // CHAR_BEFORE：改 DelveGame 預設前跑一次錄下
it('標題畫面用 gen2：世界是 genKind gen2、展示角色站在實心地面上、建構 < 1500 ms', () => { const t0 = performance.now(), s = buildTitleScene(TITLE_SEED);
  expect(performance.now() - t0).toBeLessThan(1500); expect(s.game.genKind).toBe('gen2'); for (const a of s.showcase) expect(isSolidTile(s.game.world.getFg(a.x, a.y + 1))).toBe(true); }, 30_000);
```
```ts
// actor.golden.test.ts：arena() 改成不指定生成器（160×100 → flat）
it('換到平地建構器後行為不變', () => { expect(runBehaviour(arena())).toEqual(GOLDEN_BEHAVIOR); });          // Step 1 錄的值，不准重錄
it('存檔快照（含世界資料）', () => { expect(runSave(arena())).toEqual(GOLDEN_SAVE); });                   // 本 Task 重錄，理由見 commit
```
（`stripIds`、`buildTitleScene`（`render/titleScene.ts` 的建構函式，名稱以實際為準；沒有可測的進入點就在本 Task 抽出一個不碰 DOM 的）、`runBehaviour` / `runSave` 寫在各測試檔內。）

- [ ] **Step 3: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/flatWorld.test.ts src/scripts/games/delve/engine/actor.golden.test.ts`；Expected: FAIL（`CHAR_BEFORE` 與 `GOLDEN_BEHAVIOR` 在改碼前已錄、PASS）。
- [ ] **Step 4: 實作** 如上。`GOLDEN_BEHAVIOR` 必須逐值相同；唯一允許的差異是「地區發現」事件（平地世界的地區清單與舊小世界不同）——若事件序列只差在這類事件，把那一類從行為指紋排除並在 commit 寫明；有任何其他差異 = bug，停下來查。`GOLDEN_SAVE` 重錄，commit 說明：「世界改由平地建構器產生，存檔快照含地區清單與生成器附帶資訊，必然改變；PlayerActor 行為由 GOLDEN_BEHAVIOR 證明不變（spec §5 測試處置）」。
- [ ] **Step 5: 全套，處理失敗的小世界測試** — Run: `npx vitest run`。每個失敗的測試：(a) 它測的是玩家 / 物件行為、只是剛好依賴舊小世界的地形 → 在測試裡用 `world.setFg` 畫出需要的地形（或改用 flat 的已知地表），斷言強度不變；(b) 它測的是舊生成器本身（`legacy/**`、`worldgen.steps` 的小世界、`genSection`）→ 明確傳 `worldGen: { kind: 'legacy' }` 讓它在 Task 8 之前照跑。commit 說明附改寫清單（檔名 + 一句原因）。Expected: 全綠。
- [ ] **Step 6: tsc + e2e** — `rtk proxy npx tsc --noEmit -p .`（773 / delve 0）；`npx playwright test tests/e2e/delve.spec.ts --project=chromium`（標題畫面）；Expected: PASS。
- [ ] **Step 7: Commit** — `feat(delve): flat builder for small test worlds; character creation and title scene no longer run the legacy generator`。

---

### Task 5: 正式尺寸預設改 gen2；改寫依賴舊世界內容的單元測試

**Files:**
- Modify: `engine/game.ts:831-850`（沒給 `worldGen` / `gen` 的 4200×1200 → gen2）、`net/guest.ts:137-144`（`defaultReplica`：genVersion 7 的 welcome 明確 `worldGen: { kind: 'legacy' }`）、`save/serialize.ts:1157-1161`（genVersion 7 的 restore 明確 legacy——現在已是，加測試釘住）
- Modify（改寫到 gen2）：`engine/game.dungeon.test.ts`、`engine/game.explore.test.ts`、`engine/game.folk.test.ts`、`engine/game.folk2.test.ts`、`engine/actors.mb3.test.ts`、`engine/discovery.test.ts`（`fixture-v11` 段）、`engine/waystones.test.ts`、`engine/liquid.perf.test.ts`、`engine/world.perf.test.ts`、`engine/lighting.test.ts`、`engine/liquid.drain.test.ts`、`engine/cosmeticSources.peaceful.test.ts`、`engine/game.infinite.test.ts`、`save/serialize.dungeon.test.ts`、`render/colCache.test.ts`、`net/coop.infinite.test.ts`、`net/guest.test.ts`（以實際失敗清單為準）
- Test: 全套

**Interfaces:**
- 改寫原則：測試主題留下的（村民日夜作息、地城鑰匙 / 上鎖門 / 寶箱玩法、探索 / 日誌、傳送碑、液體排水、光照、外觀解鎖來源）→ 用 gen2 世界與 `homeContent` / `sites` 找到對應物件後照原斷言驗；測試主題是舊生成器 / v1 外圍 / 舊中央陣列的 → 明確 `worldGen: { kind: 'legacy' }` 或 `gen`，Task 8 退役。`liquid.perf` 的基準改成 gen2 世界出生點 ±200 欄（M1 基準數字留在 M1 計畫，新數字寫進本計畫 Task 10 報告）。

- [ ] **Step 1: 寫失敗測試（釘住連線 / 讀檔不會被新預設帶偏）**

```ts
// net/guest.test.ts
it('舊房主（genVersion 7 welcome）的客人副本仍是舊生成器（Task 5 起正式尺寸預設是 gen2）', () => {
  const g = defaultReplica({ ...LEGACY_WELCOME, w: 4200, h: 1200, bounds: 'infinite' }, null); expect(g.genKind).toBe('legacy'); }, 120_000);   // defaultReplica 的確切參數以 net/guest.ts:137 為準
// save/serialize.v7.test.ts
it('genVersion 7 的存檔讀回仍是舊世界（Task 7 才改成重生）', () => { const r = restoreGame(v7FullSave, { gen: v7Gen }); expect((r as RestoreOk).game.genKind).toBe('legacy'); }, 120_000);
// engine/game.gen2.test.ts
it('不指定生成器的正式尺寸 DelveGame 是 gen2', () => { expect(new DelveGame({ seed: 'dflt' }).genKind).toBe('gen2'); }, 30_000);
```
- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/net/guest.test.ts src/scripts/games/delve/engine/game.gen2.test.ts`；Expected: 第三個 FAIL（預設仍是 legacy），前兩個 PASS（護欄）。
- [ ] **Step 3: 實作預設切換**，再跑 `npx vitest run`，照上面的原則逐一改寫失敗的測試（斷言強度不降；例：「舊世界 'alpha' 有 3 座村莊、村長晚上回屋」→「gen2 世界家鄉每座村莊的村長晚上回屋」）。
- [ ] **Step 4: 跑測試** — `npx vitest run`；`rtk proxy npx tsc --noEmit -p .`；Expected: 全綠、773 / 0。
- [ ] **Step 5: Commit** — `test(delve): full-size default world is gen2; gameplay tests move off legacy world content`（附改寫清單）。

---

### Task 6: e2e 改在 gen2 世界上跑

**Files:**
- Modify: `tests/e2e/delve.spec.ts`（CRLF；`:19` 的開局網址輔助、`:206-316`、`:469-495`、`:482`、`:503`、`:548`、`:749`、`:829`、`:1448`、`:1511`、`:2246`、`:3564`、`:3638`、`:3646`、`:3666`）、`tests/e2e/delve-online.spec.ts`、`tests/e2e/delve-touch.spec.ts`、`tests/e2e/delve-gen2.spec.ts`、`render/session.ts:320`（除錯鉤子補 gen2 查詢：`homeContent()`、`sites`、`blueprintsIn(x0, x1)`，只讀）

**Interfaces:**
- 所有 e2e 的開局網址統一經 `delveUrl(params)` 輔助（delve / online / touch 三個 spec 共用一份，放 `tests/e2e/support/delve.ts`），本 Task 先加 `&gen2=1`；Task 7 拿掉旗標時只改這一個地方。
- 依賴舊內容的測試改寫：生態固定位置 → 用 `__delveDebug.game.gen2().layout` 的家鄉地區；`dungeonZone` / `g.dungeon` → `homeContent().dungeon`；`structures` 的小屋箱子 → `blueprintsIn` 找 cabin；`villages[0]` → `sites.list('village')[0]`；`landmarks` → `homeContent().landmarks`；過 4200 的 OuterGen 海 → gen2 第一道東海；`w.biome[x]` 直接寫入 → 改成傳送到該生態的家鄉地區；泉水（`:1511`）→ gen2 沒有泉水（M2a `NOT_PORTED`），退役並寫理由；舊版 genVersion 1 存檔（`:548`、`:2246`）→ 保留到 Task 7 改成「重生」的期待。

- [ ] **Step 1: 改寫並跑** — Run: `npx playwright test tests/e2e/delve.spec.ts tests/e2e/delve-online.spec.ts tests/e2e/delve-touch.spec.ts tests/e2e/delve-gen2.spec.ts --project=chromium`；Expected: 全 PASS（記錄 M1 carry 的既有偶發：技能樹衝刺距離 < 3 格——若出現，重跑該測試一次並在報告記錄，不改門檻）。
- [ ] **Step 2: Commit** — `test(delve): e2e runs on gen2 worlds`（附退役清單：泉水測試，理由：gen2 不移植泉水瀑布）。

---

### Task 7: 切換：拿掉旗標、新世界一律 gen2、打開舊世界一律重生 + 通知、連線只收 gen2

**Files:**
- Modify: `render/session.ts:114-115`（刪旗標）、`:599-629`（刪 `generate()`）、`:697-723`（`newWorldWith` 一律 gen2）、`:790-813`（`openLegacy` → `regenerateLegacyMain`）、`:820-844`（`openSplit` → `regenReason` → `regenerateSlot`）、`:1125-1136`（沒有 IndexedDB 的 `openImported`：記憶體內重生）、開局後的通知（`showNotice`）、`net/guest.ts:122-134`（`coopGenOk`：只收 genVersion 8 的 `kind: 'gen2'` 與 genVersion 0 的有界平地世界）、`tests/e2e/support/delve.ts`（拿掉 `&gen2=1`）、`tests/e2e/delve.spec.ts`（舊存檔測試改成重生期待）、`tests/e2e/delve-gen2.spec.ts`（旗標測試改寫）
- Delete: `render/gen2Flag.ts`、`render/gen2Flag.test.ts`
- Test: `net/coop.gen2.test.ts`、`tests/e2e/delve-regen.spec.ts`（新）

**Interfaces:**
- session 的開世界流程（唯一入口）：`regenReason(h)` 非 null → 轉場文字「更新世界中…」→ `regenerateSlot`（失敗 → `say(msgEl, message)`、不開局）→ 開局 → `showNotice(REGEN_NOTICE)` → `saveNow()`（清掉 `regenNotice`）；否則 `genBlocker(h)` → `restoreSplit`（不再生成任何東西）。
- `showNotice(text: string): Promise<void>`——沿用 `askConfirm`（`session.ts:748`）的對話框 DOM 與 SCSS class，只有一顆「知道了」按鈕；標題「世界已更新」。
- `coopGenOk(m)`：`m.genVersion === 8 && m.outerGenVersion === GEN2_VERSION && m.gen2?.kind === 'gen2' && locks 都 ≤ GEN2_VERSION`，或 `m.genVersion === 0 && m.bounds !== 'infinite'`；其他（含 7、`'baked'`）→ false → `END_TEXT.gen`。

- [ ] **Step 1: 寫失敗測試**

```ts
// net/coop.gen2.test.ts
it('新客人連舊房主（genVersion 7 welcome）→ END_TEXT.gen、沒有副本；baked welcome 也一樣', () => {
  for (const tamper of [(m: Welcome) => ({ ...m, genVersion: 7, outerGenVersion: 1, gen2: undefined }), (m: Welcome) => ({ ...m, gen2: { ...m.gen2!, kind: 'baked' as const } })]) {
    const rig = coopRig({ world: 'gen2', tamperWelcome: tamper }); rig.run(2000); expect(rig.guests[0].endText).toBe(END_TEXT.gen); expect(rig.guests[0].game).toBeNull(); } }, 120_000);
```
```ts
// tests/e2e/delve-regen.spec.ts（LF）
test('舊合併存檔（format9）→ 重生：genVersion 8、通知出現一次、角色等級 / 背包保留、在出生點；重新整理後不再通知', async ({ page }) => {
  await injectLegacyMain(page);                                        // 沿用 delve.spec.ts:93 的輔助，搬到 support/delve.ts
  await page.goto(delveUrl({ autostart: 1 })); await page.waitForFunction(() => window.__delveDebug?.game);
  await expect(page.getByText('地圖產生器已全面更新')).toBeVisible(); await page.getByRole('button', { name: '知道了' }).click();
  const s = await page.evaluate(() => { const g = window.__delveDebug!.game; return { v: g.genVersion, lv: g.levels.level, inv: g.inventory.slots.filter(Boolean).length, dx: Math.abs(g.player.x / 16 - g.spawn.x) }; });
  expect(s.v).toBe(8); expect(s.lv).toBe(FIXTURE9_LEVEL); expect(s.inv).toBe(FIXTURE9_ITEMS); expect(s.dx).toBeLessThan(3);
  await page.reload(); await page.waitForFunction(() => window.__delveDebug?.game); await expect(page.getByText('地圖產生器已全面更新')).toHaveCount(0);
});
test('新世界（不帶任何旗標）一律 gen2', async ({ page }) => { await page.goto(delveUrl({ seed: 'e2e-new', autostart: 1, fresh: 1 }));
  await page.waitForFunction(() => window.__delveDebug?.game); expect(await page.evaluate(() => window.__delveDebug!.game.genKind)).toBe('gen2'); });
```
（`FIXTURE9_LEVEL` / `FIXTURE9_ITEMS` = format9 fixture 裡角色的等級與背包件數，從 fixture 解碼取得寫成常數；`game.levels.level` 等確切欄位以 `window.__delveDebug` 實際形狀為準。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/net/coop.gen2.test.ts` 與 `npx playwright test tests/e2e/delve-regen.spec.ts --project=chromium`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上；`delve.spec.ts` 的 `seedLegacyV9`（`:66`，用在 `:616`、`:2172`）、`injectLegacyMain`（`:2206`）、genVersion 1 存檔（`:548`、`:2246`）改成「打開後是重生的 gen2 世界、角色保留」。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve`；`npx playwright test tests/e2e/delve.spec.ts tests/e2e/delve-online.spec.ts tests/e2e/delve-touch.spec.ts tests/e2e/delve-gen2.spec.ts tests/e2e/delve-regen.spec.ts --project=chromium`；Expected: 全 PASS。
- [ ] **Step 5: Commit** — `feat(delve)!: every world is gen2; old worlds regenerate from their seed with a one-time notice; drop the gen2 flag`（說明：spec §5 2026-10-24 使用者決定；角色檔保留、世界資料捨棄）。

---

### Task 8: 刪除舊生成器、烘焙、BakedSource、LegacyMeta；退役釘選測試

**Files:**
- Delete: `engine/legacy/**`（全部，含 `oreBaseline.measure.test.ts`、`legacyTiles.measure.test.ts`）、`engine/bakedSource.ts`、`save/bake.ts`、`save/bake.test.ts`、`save/legacyMeta.ts`、`save/legacyMeta.test.ts`、`save/upgrade.test.ts`、`save/legacyFixture.ts`（讀 fixture 位元組的部分搬到 `save/testUtil.ts`）、`save/legacyFixture.freeze.test.ts`、`save/legacyFixture.test.ts`、`save/legacyFixture11.ts`、`save/legacyFixture11.test.ts`、`save/worldSave.v10.freeze.test.ts`、`save/worldSave.v11v7.freeze.test.ts`、`engine/world.central.test.ts`、`render/genSection.ts`、`render/genSection.test.ts`
- Modify: `engine/worldBoot.ts`（只剩 `gen2` / `flat`）、`engine/game.ts`（`DelveOptions.gen`、`'legacy' | 'baked'`、`instanceof BakedSource`、`bakedQuiet` 喚醒例外）、`engine/world.ts`（`bakedQuiet`、`World.fromGen`；arrays 模式與 `isLegacyCentral` 保留給平地世界與直接 `new World(w, h)` 的 33 個測試檔）、`engine/discovery.ts`（`outerRegions`、`OUTER_REGION_BASE` 段、`regionFromJSON` / `toRegionJSON` / `RegionShape`；`Discovery.load` 不再接受 v1 外圍 id）、`engine/waystones.ts`（`v1LandQuery`、`bakedLandQuery`；`SEA_W` 若 gen2 碑仍用就搬成 waystones 自己的常數）、`engine/index.ts`（barrel）、`engine/constants.ts`（`GEN_VERSION` 改名 `LEGACY_GEN_VERSION = 7`，只給 `regenReason` 用）、`save/serialize.ts`（`RestoreOptions.gen`、`worldGenFor` 的 legacy / baked、`gen2Save` 的 bake / legacy、`validGen2` 只認 `bake` 鍵存在與否（給 `regenReason`）、中央 chunk 完整性檢查 `:1147`）、`save/genCheck.ts`（v7 與 baked 分支刪除——它們在 session 先被 `regenReason` 接走；剩 8 / 0 / newer）、`save/split.ts`（`V7_BACKUP_SUFFIX`、`importWorld` 的 genVersion 正規化保留只讀不改）、`net/protocol.ts`（`BulkHead { t: 'legacy' }`、`WireGen2.kind 'baked'`、`bake?`）、`net/host.ts:303-313`、`net/guest.ts`（`waitLegacy`、`isLegacyBulk`、baked 分支、legacy 副本）、`net/testRig.ts`（`realGen`、`bakedGame`、`'real'` / `'baked'` 世界；`'arena'` 改用平地世界）、`render/session.ts`（殘留的生成進度 UI）、`render/titleModel.ts:191-215`（舊階段標籤）、`engine/gen2/gen2.perf.test.ts`（分母改成常數 `V1_COLUMN_MS = 2.9`，M1 基準紀錄的 v1 每欄中位數 2.58–2.94 ms）、`engine/gen2/determinism.test.ts`（加：`engine/legacy` 不存在、全 delve 沒有檔案 import `legacy/`、`bakedSource`、`legacyMeta`、`save/bake`）
- Modify（fixture 測試改寫）：`save/expectSameGame.test.ts`、`save/migrate.test.ts`、`save/split.test.ts`、`save/worldSave.test.ts`、`save/worldSave.restore.test.ts`、`save/worldSave.v11.test.ts`、`save/serialize.gen2.test.ts`（`V7_SAVE_HASH` 段）、`net/coop.gen2.test.ts`（baked 與 `LEGACY_WELCOME_HASH` 段）

**Interfaces:**
- 退役清單（commit 說明逐條寫，驗收 agent 對照）：
  | 退役 | 理由 | 意圖由誰承接 |
  |------|------|------|
  | `world.central.test.ts` | 釘的是舊生成器的中央輸出 | `world.source.test.ts`（source 模式逐格 = 生成器）+ `gen2.lock.test.ts` |
  | `legacy/worldgen*.test.ts`、`legacy/gen/dungeon.test.ts` | 舊生成器刪除 | M2a Task 7–17 的 gen2 測試（`dungeon.test`、`settlements.test`、`underground.test`、`minibiome.test`、`features.test`、`ores.test`、`lore.test`、`home.quality.test`） |
  | `legacy/chunkgen/chunkgen.test.ts`（含 `V1_FILL_HASH` / `V1_SEA_HASH`） | v1 外圍刪除 | `determinism.test.ts`、gen2 的 sea / layout 測試；OCEAN 行為測試搬到 `engine/spawn.test.ts` 等既有檔（M1 Task 3 已在） |
  | `bake.test.ts`、`upgrade.test.ts`、`legacyMeta.test.ts`、fixture freeze 測試 | 使用者決定刪烘焙 | `save/regen.test.ts` |
  | `serialize.gen2` 的 `V7_SAVE_HASH` | 不再寫 v7 存檔 | `regen.test.ts` 的 `regenReason` 真值表 |
  | `coop.gen2` 的 baked / `LEGACY_WELCOME_HASH` | 不再有舊房主 | Task 7 的「新客人連舊房主 → END_TEXT.gen」 |
  | `render/genSection.test.ts` | 生成剖面 UI 只服務舊生成器 | 無（功能移除） |
  | `game.folk.test.ts` 的 `FOLK_BEFORE`（M2a Task 3 錄下的舊世界 'alpha' NPC key / 角色 / 名字）與它的 `it` | 釘的是舊生成器村落 / 地廳的居民；舊生成器刪除（M2a preflight Q19） | M2a Task 3 `siteRegistry.test.ts`（兩種登錄順序同 id、`npcIdFor` 不撞）+ M2a Task 9 `settlements.test.ts`「居民住進去」+ 本計畫 Task 5 改寫到 gen2 的 `game.folk.test.ts` |
- fixture 改寫原則：`format9.delve` / `format10.delve` / `format11-v7.delve` 留著當「舊檔」輸入；讀它們的測試改成驗「解碼格式正確 + `regenReason` 判定 + 重生結果」，不再驗「照舊世界載入」。
- carry 對應（由刪除解決）：「0.3–0.8 s 的烘焙凍結畫面」「改成動態 import legacy」「烘焙世界每次自動存檔都要快照 5016 塊」「v1 regionAt 的 landmass / tier 是佔位值」——commit 說明逐條註明。

- [ ] **Step 1: 寫失敗測試**

```ts
// determinism.test.ts
it('舊生成器與烘焙已刪除：沒有 engine/legacy、沒有任何檔案 import legacy / bakedSource / legacyMeta / save/bake', () => {
  expect(existsSync(join(ENGINE, 'legacy'))).toBe(false);
  const hits = allDelveSources().filter((f) => /from '[^']*(legacy\/|bakedSource|legacyMeta|save\/bake)'/.test(read(f))); expect(hits).toEqual([]); });
// save/serialize.gen2.test.ts
it('存檔只寫 gen2 或平地：genVersion ∈ {8, 0}、gen2 欄位沒有 bake / legacy', () => {
  const g = new DelveGame({ seed: 'only8' }), h = snapshotGame(g, 1).header; expect(h.genVersion).toBe(8); expect(Object.keys(h.gen2!)).toEqual(['locks']); }, 30_000);
```
- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/determinism.test.ts`；Expected: FAIL（legacy 還在）。
- [ ] **Step 3: 刪除與清理** — 依上表刪檔、改檔；`rtk proxy npx tsc --noEmit -p .` 逐一修到 delve 0；`grep -rn "legacy/\|bakedSource\|legacyMeta\|save/bake\|OuterGen\|generateWorld\|GEN_STAGE_COUNT" src/scripts/games/delve tests/e2e` 只能剩註解與 `LEGACY_GEN_VERSION`。
- [ ] **Step 4: 跑測試** — `npx vitest run`；`npx playwright test tests/e2e/delve.spec.ts tests/e2e/delve-online.spec.ts tests/e2e/delve-touch.spec.ts tests/e2e/delve-gen2.spec.ts tests/e2e/delve-regen.spec.ts --project=chromium`；Expected: 全綠；tsc 773 / 0。
- [ ] **Step 5: Commit** — `refactor(delve)!: delete the legacy generator, bake, BakedSource and LegacyMeta; retire tests pinned to them`（附退役清單與 carry 對應）。

---

### Task 9: 凍結 gen2 v1

**Files:**
- Modify: `engine/gen2/index.ts`（`GEN2_VERSION = 1`、`GEN2_MIN_VERSION = 1`、檔頭的版本閘門慣例）、`engine/gen2/cultures.ts`（`CULTURE_POOL = { 1: [null] }`）、`engine/gen2/gen2.lock.test.ts`、`save/regen.ts`（`'gen2-old'` 用新的 MIN）、`docs/claude/architecture.md`（gen2 版本閘門一節）、本計畫基準紀錄
- Create: `engine/gen2/anchors.snapshot.test.ts`
- Test: `engine/gen2/gen2.lock.test.ts`、`save/regen.test.ts`、`net/coop.gen2.test.ts`

**Interfaces:**
- `GEN2_HASHES = { 1: <錄> }`（v0 一筆刪掉——v0 從未發佈）；`COLS` = M1 的 15 欄 + 種子 `'gen2-lock'` 的：家鄉地城塔欄、第一座村莊欄、第一座地廳欄、東側第一座有建物的島欄、第一個珊瑚礁欄、東側第一座小地城欄、西側第一座外圍村莊欄（跑一次查出來寫成常數），每欄附一條守衛斷言（該欄真的與那種藍圖相交）。
- `anchors.snapshot.test.ts`：種子 `'gen2-lock'` 的家鄉錨點與東西各 3 片大陸的錨點清單（kind、region.index、layer、slot）寫成常數；凍結後錨點規則改了這個測試就紅。
- 版本閘門慣例（寫進檔頭與 architecture.md，逐條）：(1) 已發佈版本（≥ 1）的輸出不得改變，由 `GEN2_HASHES[v]` 與錨點快照釘住；(2) 新內容 = `GEN2_VERSION + 1`，在 pass / 藍圖 / 錨點 / 版面裡寫 `if (ctx.ver >= N)`，改既有行為時保留舊分支；(3) 新版本要在 `GEN2_HASHES` 加一筆、`COLS` 涵蓋新內容的欄；(4) 版面（大陸 / 海寬度與邊界、島、海槽）一經發佈凍結，只能加版本分支；(5) 新文化 = 在 `CULTURE_POOL` 加 `{ N: [...] }`、在 `CULTURE_SINCE` 設版本，舊大陸照鎖；(6) `GEN2_MIN_VERSION` 維持 1，除非某版本要停止支援（那時寫遷移）；(7) 存檔的鎖或 outerGen 比程式新 → `genBlocker` 的 newer 訊息（請玩家更新），比 MIN 舊 → `regenReason` 'gen2-old'。

- [ ] **Step 1: 寫失敗測試**

```ts
// regen.test.ts
it('v0 開發世界（outerGen 0 或任一鎖 ver 0）→ gen2-old；v1 → null；比程式新 → genBlocker newer', () => { const base = { format: 11, width: 4200, height: 1200, genVersion: 8 };
  expect(regenReason({ ...base, outerGen: 0, gen2: { locks: [] } })).toBe('gen2-old'); expect(regenReason({ ...base, outerGen: 1, gen2: { locks: [[1, 1, 0, null]] } })).toBe('gen2-old');
  expect(regenReason({ ...base, outerGen: 1, gen2: { locks: [[1, 1, 1, null]] } })).toBeNull();
  expect(genBlocker({ ...base, bounds: 'infinite', outerGen: 2, gen2: { locks: [] } })).toMatchObject({ newer: true }); });
// gen2.lock.test.ts
it('GEN2_VERSION = GEN2_MIN_VERSION = 1，只有 v1 一筆雜湊', () => { expect([GEN2_VERSION, GEN2_MIN_VERSION]).toEqual([1, 1]); expect(Object.keys(GEN2_HASHES)).toEqual(['1']); });
it('雜湊欄位涵蓋家鄉與外圍的每種主要結構', () => { const src = new Gen2Source('gen2-lock'), kinds = new Set<string>();
  for (const cx of COLS) for (const b of src.blueprints.overlapping(cx * 32, cx * 32 + 32)) kinds.add(b.kind);
  for (const k of ['dungeon', 'village', 'hall', 'island', 'reef', 'keep', 'cabin', 'ruin', 'shipwreck', 'minor']) expect(kinds, k).toContain(k); });
// coop.gen2.test.ts
it('outerGen 0（舊版客人眼中的 v0）或 2（更新版）的 welcome → END_TEXT.gen', () => { for (const v of [0, 2]) {
  const rig = coopRig({ world: 'gen2', tamperWelcome: (m) => ({ ...m, outerGenVersion: v }) }); rig.run(2000); expect(rig.guests[0].endText).toBe(END_TEXT.gen); } }, 120_000);
```
- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/gen2.lock.test.ts src/scripts/games/delve/save/regen.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** — 改常數；程式裡「ctx.ver 0 的規則」註解改成「ver 1」；`GEN2_HASHES[1]` 與 `COLS` 錄一次貼上；錨點快照錄一次貼上；寫慣例文件。
- [ ] **Step 4: 跑測試** — `npx vitest run`；Expected: 全綠。
- [ ] **Step 5: Commit** — `feat(delve)!: freeze gen2 version 1 — per-version hash lock, anchor snapshot, version-gate convention documented`。

---

### Task 10: 全面驗收

**Files:** 無新增（只跑驗證、填本計畫基準紀錄）

- [ ] **Step 1: 全套單元測試** — `npx vitest run`；Expected: 全綠。
- [ ] **Step 2: 型別** — `rtk proxy npx tsc --noEmit -p .`；Expected: 773、delve 0。
- [ ] **Step 3: e2e** — `npx playwright test tests/e2e/delve.spec.ts tests/e2e/delve-online.spec.ts tests/e2e/delve-touch.spec.ts tests/e2e/delve-gen2.spec.ts tests/e2e/delve-regen.spec.ts --project=chromium`；Expected: PASS。
- [ ] **Step 4: 效能回報** — 閒置機器跑 `engine/gen2/gen2.perf.test.ts` 三次（比值中位數 ≤ 2.00，分母 = `V1_COLUMN_MS`）、`engine/liquid.perf.test.ts`（gen2 出生點）；壓縮後世界檔大小（新 gen2 世界走 3,000 格後存檔，`gzip` 位元組，目標 ≤ 4 MB）；寫進交付報告。
- [ ] **Step 5: 給使用者 4321 連結** — 確認 4321 是這個 worktree 的 dev server；附 `http://localhost:4321/games/delve?autostart=1&fresh=1&seed=m2-demo`（不必任何旗標）與「打開舊存檔會看到更新通知」的說明；Vercel preview 以 `gh pr checks <PR#>` 確認 build。
- [ ] **Step 6: 派 fresh-context 驗收 agent**（spec §9），清單 = 本計畫 Review Focus 五條 + Task 8 退役清單 + memory carry「M2 凍結前必做」逐條對照（對照表見下）。

---

## 凍結前必做清單對照（memory `delve-infinite-1b-carry`）

| carry 項目 | 落在 |
|-----------|------|
| 補分割測試：樹、主坑道、液體藍圖、海 / 島 | M2b Task 1（加上 M2a 各結構 Task 的跨欄測試） |
| 主坑道底部夾在 LAVA_Y 之上 | M2b Task 1 |
| 結構 id 位元配置不再手抄 | M2a Task 1 |
| 湖欄 surfaceAt ≠ 實際地形、傳送碑浮在湖上 | M2b Task 2 |
| 補外圍範圍的寶箱保存測試 | M2b Task 2 |
| v1 regionAt landmass / tier 佔位值 | M2b Task 2（gen2 真值測試）+ Task 8（v1 刪除） |
| 0.3–0.8 s 的烘焙凍結畫面 | M2b Task 8（烘焙刪除） |
| 版本 0 烘焙存檔怎麼處理 + .v7.bak 還原路徑 | M2b Task 3（重生；依使用者決定不提供還原，`*.bak` 不列出）、Task 9（v0 → gen2-old） |
| 改成動態 import legacy | M2b Task 8（legacy 刪除） |
| 烘焙世界每次自動存檔快照 5016 塊 | M2b Task 8（烘焙刪除） |

## 規格對照（自我檢查）

| spec 要求 | Task |
|-----------|------|
| §5 使用者決定：刪舊生成器與烘焙 | 8 |
| §5 舊世界（v7、開發版 v8）以同種子整個重生、世界資料捨棄、角色保留、名稱與種子保留、回到出生點 | 3、7 |
| §5 版本鎖 / 雜湊鎖 / genBlocker 照舊 | 7、9 |
| §5 測試處置（central、golden、fixture、其餘 worldgen 測試） | 4、5、8 |
| §9 M2 追加：拿掉旗標、新世界一律 gen2、v1 凍結、凍結前清單 | 1、2、7、9 |
| §5 連線版本一致 | 5、7、9 |
| 一次性繁中通知 | 3、7 |

## 規格模糊處與作者裁決

1. **重生時保留哪些「世界」欄位**：spec 只說「世界名稱與種子保留」。裁決：另外保留 `worldId`（存檔槽身分、角色檔裡的 pendingWorld 參照）、peaceful、建立時間；時間 / 季節、BOSS 擊敗、好感度、委託一律重來（它們都屬於被捨棄的世界）。
2. **通知的「一次」**：裁決為「顯示後立刻存檔」，所以只有在顯示前就關頁才會再看到一次；比「下次存檔才清」更貼近一次性。
3. **小尺寸舊世界（200×100 fixture）**：重生成正式尺寸的 gen2 世界（gen2 只有正式尺寸）；真實玩家不會有小世界。
4. **是否備份被重生的舊世界**：不備份——使用者決定刪掉 `.v7.bak` 流程，而且舊碼刪除後備份沒有任何程式能讀。
5. **平地世界的 genVersion 0**：只給測試與建角色的暫存世界；正式尺寸的 genVersion 0 存檔被 `genBlocker` 擋下（不可能由遊戲產生）。
6. **泉水 / 瀑布相關 e2e**：gen2 不移植泉水（M2a 裁決 4），該 e2e 退役。
7. **效能分母**：v1 刪除後，「≤ 現有 OuterGen 2×」改用 M1 基準紀錄的 v1 每欄中位數（2.9 ms，常數 `V1_COLUMN_MS`）當分母。
