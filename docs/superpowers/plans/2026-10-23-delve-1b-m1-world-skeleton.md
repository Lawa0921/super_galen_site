# DELVE 1b M1「世界骨架」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在開發旗標後面做出新生成器 gen2 的世界骨架（大陸 / 海 / 島 / tier / 地區 API / OCEAN、地形與洞穴與礦與靜態液體、結構藍圖槽位、版本鎖），並讓舊世界（genVersion 7）能在旗標下烘焙升級；旗標關閉時遊戲行為不變。

**Architecture:** gen2 是 `engine/gen2/` 裡一個純 (seed, x, y) 的 `ColumnSource`：`Layout`（地塊序列）→ `Profile2`（每欄地表 / 水面 / 層線，含地區混合）→ `fill`（材質、洞穴、主坑道、礦、海與熔岩線）→ `BlueprintIndex`（槽位格算出的結構藍圖，蓋進每個相交的欄）。`World` 新增「沒有中央陣列」模式：gen2 世界與烘焙過的舊世界都讓 source 產生每一欄（含 0..4200），中央不常駐、不 pin；烘焙世界的中央 4200 格存成「改過的區塊」，每欄資料與舊生成器的附帶資料存成 `LegacyMeta`。舊生成器（`worldgen.ts`、`gen/*`、`chunkgen/` v1）搬到 `engine/legacy/`，M1 仍靜態 import（旗標關閉的預設路徑還在用它）。

**Tech Stack:** TypeScript、Vitest、Playwright、Canvas2D 程式化像素美術（`render/pixel.ts` 色票）、IndexedDB + gzip 存檔、WebRTC 連線（`net/`）。

**Spec:** `docs/superpowers/specs/2026-10-23-delve-infinite-1b-cultures-design.md`（§4、§5、§8、§9 M1 列為本計畫的約束）；背景：`docs/superpowers/specs/2026-10-21-delve-infinite-world-design.md`、`docs/superpowers/plans/2026-10-21-delve-infinite-1a-chunked-world.md`。

---

## 關鍵架構決定（作者決定，附理由）

1. **gen2 世界的 x ∈ [0, 4200) 一律由 ColumnSource 按需產生，沒有中央陣列、不 pin。** `World` 加 `WorldOptions.central: 'arrays' | 'source'`（預設 `'arrays'` = 現況）。`'source'` 模式：建構時不建任何欄、`isPinned` 不含中央、`build()` 讓 source 填整欄、`surfaceAt / biomeAt / layersAt / regionAt` 一律問 source。`width = 4200` 保留，只當 tile / chunk 鍵的算術（`coords.ts` 的中央 row-major 鍵不變），所以存檔鍵、迷霧點陣、`TileFlags` 都不用改。理由：使用者要「客人不必一次算整張家鄉」——現在中央 132 欄在建構子就整張生成並恆常駐；改成按需之後，客人與房主都只生成角色周圍 ±6 欄。
2. **烘焙過的舊世界也用 `'source'` 模式**：中央 5016 個 chunk 全部寫成「改過的區塊」（`modifiedChunks` + `liquidModified`）存進世界檔，讀檔時停放、走近才蓋回；中央每欄資料（地表 / 生態 / 層線）與舊生成器的附帶資料（地城、村莊、地標、石碑、珍寶、泉水、陶罐鑰匙、區域清單）存成 `LegacyMeta`。`BakedSource` 對中央只回 meta、不寫格子（停放的 chunk 一定會蓋上）。理由：spec §5「烘焙過的區塊就是改過的區塊，走現有按區塊同步」，且讀檔不必再跑 41 階段生成器。
3. **舊外圍 v1（OuterGen）在舊世界的範圍內「不存成 chunk」，繼續由 `engine/legacy/chunkgen` 即時生成**（作者對 spec §5 步驟 3 的解讀，見文末「規格模糊處」）。v1 本來就是純 (seed, x, y) 的分區塊生成器，重算結果逐格相同；把它烘焙成 chunk 會讓存檔與記憶體隨探索距離線性變大（走到 30,000 格 ≈ 7 萬個 chunk ≈ 400 MB 停放資料，遠超 4 MB 目標）。「已知最遠點」照 spec 決定舊範圍的終點（接縫位置）。
4. **gen2 的版本號在 M1 是 `GEN2_VERSION = 0`（未發佈，輸出可變）**；`genVersion 8` 代表「gen2 或烘焙世界」，`header.outerGen` 寫 gen2 版本號；每片已進入的地塊在存檔記 `[side, i, ver, culture]`。M2 開旗標時改成 1 並凍結。
5. **旗標**：`localStorage['delve.gen2'] === '1'` 或網址 `?gen2=1`（`?gen2=0` 清掉）；只控制「新世界用 gen2」與「讀到 v7 舊世界時烘焙升級」。讀 genVersion 8 的存檔不看旗標（程式碼在、資料自足）。測試走 `DelveOptions.worldGen`。
6. **只有正式尺寸（4200×1200）的舊世界會烘焙**；200×100 的小測試世界（`__fixtures__/format9.delve`、`format10.delve`）判定為不適用、照舊載入。另在 Task 1 凍結一份正式尺寸的 format 11 / v7 fixture 給烘焙測試用。（spec §5 已依裁決 P15a 修訂。）
7. **中間狀態（裁決 P16）**：Task 3 → Task 4 之間旗標關閉的 v1 海遠景會暫時混成叢林（`NB` 夾值）、Task 17 → Task 18 之間旗標開啟的連線會建錯副本；兩者只存在於分支中間的 commit，分支整條合併，接受。若要拆開合併，這兩對必須一起進。

## Global Constraints

- 測試一律 `npx vitest run <path>`（`npm test` / `npm run test` 是 watch 模式會掛住）；完成前 `npx vitest run` 全套綠。
- 型別檢查 `rtk proxy npx tsc --noEmit -p .`：總數維持 773（基準），`games/delve` 路徑 0 個錯誤（`rtk proxy npx tsc --noEmit -p . 2>&1 | grep "games/delve"` 必須沒有輸出）。
- Commit 用 Conventional Commits，訊息最後一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- CRLF 檔案編輯後保持 CRLF（動手前 `file <path>` 確認）。本計畫會改到的 CRLF 檔：`engine/game.ts`、`engine/world.ts`、`engine/worldgen.ts`（搬移）、`render/background.ts`、`render/journal.ts`、`render/model.ts`、`render/renderer.ts`、`render/session.ts`、`save/serialize.ts`、`tests/e2e/delve.spec.ts`。新檔一律 LF。
- DELVE 介面文字寫死繁體中文（不走 i18n）。
- 美術程式化像素，顏色只取 `render/pixel.ts` 的 `PALETTE_HEX`；禁 `!important`、禁行內樣式。
- 不准用裸的 `git stash`（要用就 `git stash push -u -m "<tag>"` 並以 SHA apply）。
- 測試本體不得只有註解：計畫裡寫成 `/* 描述 */` 的地方都要寫成具體斷言（裁決 P9）；空本體、吞例外、對純函式量 store 寫入次數這類永遠不會失敗的測試，審查一律退回。
- 確定性：`engine/gen2/**`、`engine/genPrims.ts` 與 `engine/legacy/chunkgen/` 的非測試檔不得出現 `Math.random`、`Math.sin/cos/pow/exp/log/sqrt/hypot`、`**`（註解也不行，用 `//`）；隨機一律走 `engine/noise.ts` 的整數雜湊。
- tile id 只能附加、上限 256（M1 不新增 tile）。
- 旗標關閉時：新世界寫 `genVersion 7`、走舊生成器；舊世界照舊載入、不烘焙。
- 版面數值（spec §4.1 / §8，原文）：海寬 480–1200，第一道海 480–700，每道海 1–3 座島、島寬 40–160；大陸 2400–5200，由 2–4 個地區組成、地區寬 700–1500；家鄉約 4200、出生點 x ≈ 2100；海面每 300 格一個槽位、每槽必有一點。
- 效能（spec §4.3，有約束力）：32×32 區塊生成中位數 ≤ 現有 OuterGen 的 2 倍、最壞 ≤ 8 ms；客人加入不需生成家鄉整片。自動測試的門檻放寬到 3×（機器負載容忍），但 2× 由 Task 12 報告裡的閒置機器實測把關（裁決 P5）。
- gen2 程式碼的版本閘門慣例：新功能寫 `if (ver >= N)`；改既有功能保留舊分支（M1 期間 ver 0 尚未凍結）。

## Review Focus

1. **旗標關閉的預設路徑被改到**：OCEAN 與 World 模式改動後，舊世界外圍 v1 的 chunk 位元組、新世界的 genVersion、載入舊檔的結果都要與現在相同 → Task 3 的 v1 海欄位元組釘選測試、Task 17 的「預設新世界仍是 genVersion 7」測試。
2. **搜刮過的 gen2 結構寶箱在卸載 / 存讀後被重新填滿（或沒搜過的寶箱消失）**：玩家最常碰到的物件 bug → Task 9 的卸載 / 重載測試、Task 15 的存讀測試。
3. **烘焙途中失敗或備份失敗**：原 v7 檔必須原封不動、下次能重試 → Task 16 的失敗注入測試（`onStage` 真的丟錯、store 備份 / 寫入丟錯）與 Task 17 的 `upgradeSlot` 失敗後重試測試。
4. **接縫位置漏掉玩家知道的地方**：玩家站在 v1 海上、剛好在段落邊界、在西側負 x、或只有迷霧 / 傳送碑在遠處時，接縫不能切進已知範圍 → Task 16 的 `legacyRange` 邊界測試。
5. **較新或不認得的生成器版本存檔**：必須明確拒絕並給中文訊息，絕不靜默用目前的生成器疊舊改動（spec §5）→ Task 15 的版本比對測試。

## 基準紀錄（Task 1 執行時填）

- LiquidSim 基準（舊世界、出生點 ±200 欄全醒、120 步）：每步中位數 0.126–0.272 ms（兩次量測，機器負載不同；120 步、門檻 50 ms）、每步處理格數 324（最後一步 `liquids.stats.processed`）。
- OuterGen v1 每欄 fill 中位數：約 2.58–2.94 ms（Task 12 三次量測，同機 gen2 中位數 2.43–3.13 ms，比值 0.83–1.21，中位 0.98；測試內即時重量）。

---

## 檔案結構

| 路徑 | 職責 |
|------|------|
| `engine/legacy/worldgen.ts`、`engine/legacy/gen/*`、`engine/legacy/chunkgen/*` | 搬來的舊生成器（輸出不變；v1 `OuterGen` 加 `regionAt`、海區 biome 改 OCEAN（Task 3）、共用 primitives 改從 `engine/genPrims.ts` import（Task 8，雜湊釘住）） |
| `engine/genPrims.ts` | v1 與 gen2 共用的生成 primitives（`ColNoise`、洞穴 / 礦噪聲取樣、樹 / 仙人掌繪製）；不含任何材質 / 礦種規則（裁決 P10） |
| `engine/regionInfo.ts` | `RegionInfo` / `Side` / `RegionKind` / `CultureId` 型別（World 與 gen2 共用、無相依） |
| `engine/gen2/index.ts` | `Gen2Source`、`GEN2_VERSION`、`GEN2_MIN_VERSION` |
| `engine/gen2/layout.ts` | 地塊序列、地區、海的島與槽位、文化指派、tier |
| `engine/gen2/locks.ts` | `LockTable`（每片地塊的 ver + culture） |
| `engine/gen2/cultures.ts` | 文化池（依版本）、霧竹之國命名池（M1 只放名字） |
| `engine/gen2/profile.ts` | `Profile2`：每欄地表 / 水面 / 生態 / 層線（欄快取） |
| `engine/gen2/fill.ts`、`engine/gen2/caves.ts` | 材質層、噪聲洞穴、主坑道、礦、海水、熔岩線、樹 |
| `engine/gen2/hrng.ts` | 整數雜湊亂數（藍圖用） |
| `engine/gen2/blueprint.ts` | `Blueprint`、`stamp`、`BlueprintIndex`（地區槽位格 + 海槽位） |
| `engine/gen2/structures/{cabin,ruin,shipwreck,crate,lakes}.ts` | 各藍圖產生函式 |
| `engine/worldBoot.ts` | `WorldContent` / `WorldGenSpec`：DelveGame 建構時的世界內容（legacy / gen2 / baked） |
| `engine/bakedSource.ts` | 烘焙世界的組合 ColumnSource（中央 meta + v1 + gen2） |
| `save/genCheck.ts` | 讀檔 / 匯入 / 連線共用的生成器版本比對 |
| `save/legacyMeta.ts` | `LegacyMeta` 編解碼與驗證 |
| `save/bake.ts` | `farthestKnown`、`legacyRange`、`bakeApplies`、`bakeWorld` |
| `render/gen2Flag.ts` | 旗標讀取 |

（路徑都相對於 `src/scripts/games/delve/`。）

---

### Task 1: 基準、carry 項目與正式尺寸 v7 fixture

**Files:**
- Create: `engine/liquid.perf.test.ts`
- Modify: `save/serialize.ts:335-353`（`decodeLiquidRle`）
- Test: `save/serialize.liquid.test.ts`
- Create: `save/worldSave.v11v7.freeze.test.ts`、`save/__fixtures__/format11-v7.delve`、`save/legacyFixture11.ts`

**Interfaces:**
- Produces: `buildLegacyFixture11(): DelveGame`（正式尺寸、seed `'fixture-v11'`）；`FIXTURE11_PATH`、`FIXTURE11_WHO`、`FIXTURE11_WHERE`（同 `worldSave.v10.freeze.test.ts` 的形狀）；`FIXTURE11_EDITS: { dug: [x: number, y: number][]; planks: [x: number, y: number][]; chest: { x: number; y: number; items: Stack[] } }`（下面 Step 7 那些改動的確切座標與內容，Task 16 用它驗「改動保留」）。

- [ ] **Step 1: 寫 LiquidSim 基準測試**

```ts
// engine/liquid.perf.test.ts
it('LiquidSim 基準：舊世界出生點 ±200 欄全醒，120 步', () => {
  const g = new DelveGame({ seed: 'liq-perf' });          // 正式尺寸、舊生成器
  const sx = g.spawn.x;
  g.liquids.wakeRect(sx - 200, 0, sx + 200, g.world.height);
  const t: number[] = [];
  for (let k = 0; k < 120; k++) { const t0 = performance.now(); g.liquids.step(); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b);
  console.info('[liquid baseline] median ms/step', t[60].toFixed(3));
  expect(t[60]).toBeLessThan(50);
}, 60_000);
```

- [ ] **Step 2: 跑基準，把數字填進本計畫「基準紀錄」**

Run: `npx vitest run src/scripts/games/delve/engine/liquid.perf.test.ts`
Expected: PASS，輸出 `[liquid baseline] median ms/step …`。

- [ ] **Step 3: 寫 decodeLiquidRle 失敗測試**

```ts
it('decodeLiquidRle 先加總 run 長度再配置：總長不符直接丟 SaveFormatError、不先配置 n 大小的緩衝', () => {
  const rle4 = encodeLiquidRle(new Uint8Array(4), new Uint8Array(4));        // run 總長 4
  expect(() => decodeLiquidRle(rle4, 50_000_000)).toThrow(SaveFormatError);
  expect(() => decodeLiquidRle(rle4, 2 ** 33)).toThrow(SaveFormatError);    // 現在：new Uint8Array(2 ** 33) 先丟 RangeError
});
```
（裁決 P8：不用 spy、不用 try / catch——那種寫法在 spy 沒有靜態 `.from` 時會吞掉錯誤而空過。）

- [ ] **Step 4: 跑它確認失敗** — Run: `npx vitest run src/scripts/games/delve/save/serialize.liquid.test.ts`；Expected: FAIL，第二個斷言收到 `RangeError: Invalid typed array length`（不是 SaveFormatError）。

- [ ] **Step 5: 實作** — `decodeLiquidRle(bytes, n)` 先掃一遍 varint 長度與欄位合法性並加總，總和 ≠ n 就丟 `SaveFormatError`，確認後才配置兩個 `Uint8Array(n)` 並第二遍填值。錯誤訊息沿用現有字串。

- [ ] **Step 6: 跑測試** — 同上命令；Expected: PASS（含原有液體測試）。

- [ ] **Step 7: 凍結正式尺寸 v7 fixture**

`save/legacyFixture11.ts` 的 `buildLegacyFixture11()`：`new DelveGame({ seed: 'fixture-v11', peaceful: true })`，然後確定地做這些改動（全部常數，不用亂數）：中央 x=2050..2060、y=surface−3..surface 挖空並放一個箱子（放兩組物品）；東外圍 x=4200+SEA_W+300（v1 陸地段）放 5 格木板；西外圍 x=−700 挖一格；解鎖傳送碑 1 與 −1；玩家傳送到 x=4200+SEA_W+310 走 30 步（讓那段地區被發現）。`worldSave.v11v7.freeze.test.ts` 比照 `worldSave.v10.freeze.test.ts`：只在 `DELVE_FREEZE_FIXTURE=1` 時用 `saveSplitGame` 寫 `__fixtures__/format11-v7.delve`，並 `expect(WORLD_FORMAT).toBe(11)`、`expect(GEN_VERSION).toBe(7)` 防呆。

Run: `DELVE_FREEZE_FIXTURE=1 npx vitest run src/scripts/games/delve/save/worldSave.v11v7.freeze.test.ts`
Expected: PASS，產生 fixture 檔（< 2 MB）。

- [ ] **Step 8: Commit**

```bash
git add src/scripts/games/delve/engine/liquid.perf.test.ts src/scripts/games/delve/save/serialize.ts src/scripts/games/delve/save/serialize.liquid.test.ts src/scripts/games/delve/save/legacyFixture11.ts src/scripts/games/delve/save/worldSave.v11v7.freeze.test.ts src/scripts/games/delve/save/__fixtures__/format11-v7.delve docs/superpowers/plans/2026-10-23-delve-1b-m1-world-skeleton.md
git commit -m "test(delve): liquid baseline, v11/v7 fixture; fix(delve): decodeLiquidRle sums runs before allocating"
```

---

### Task 2: 舊生成器搬到 engine/legacy/

**Files:**
- Move（`git mv`，含同資料夾的測試）：`engine/worldgen.ts` → `engine/legacy/worldgen.ts`；`engine/gen/` → `engine/legacy/gen/`；`engine/chunkgen/` → `engine/legacy/chunkgen/`；`engine/worldgen.*.test.ts` → `engine/legacy/`
- Modify：所有 import 這些路徑的檔（`engine/world.ts`、`engine/game.ts`、`engine/discovery.ts`、`engine/waystones.ts`、`engine/index.ts`、`render/session.ts`、`render/titleModel.ts`、`net/host.ts`、`net/guest.ts`、`net/testRig.ts` 及測試；以 `tsc` 錯誤清單為準）
- Modify: `engine/legacy/chunkgen/chunkgen.test.ts:261-270`（grep 測試的資料夾路徑）
- Modify: `engine/flatAccess.test.ts:20`（`excluded()` 的豁免路徑；字串路徑 tsc 抓不到，裁決 P1）

**Interfaces:**
- Produces：舊模組的新路徑（`engine/legacy/worldgen`、`engine/legacy/gen/*`、`engine/legacy/chunkgen`），匯出名稱不變。不留轉接檔（re-export shim）。

- [ ] **Step 1: `git mv` 三組檔案**（`worldgen.ts` 是 CRLF，`git mv` 保留位元組）。
- [ ] **Step 2: 修 import** — 依 `rtk proxy npx tsc --noEmit -p . 2>&1 | grep "games/delve"` 逐一修到沒有輸出；`legacy/` 內部的相對路徑（`'../world'` → `'../../world'` 等）一起修。`chunkgen.test.ts` 的 `join(... 'engine', 'chunkgen')` 改成 `'engine', 'legacy', 'chunkgen'`。`flatAccess.test.ts` 的 `rel === 'engine/worldgen.ts' || rel.startsWith('engine/gen/')` 改成 `rel.startsWith('engine/legacy/')`（其他豁免不動）。最後 `grep -rn "engine/worldgen\|engine/gen/\|engine/chunkgen" src/scripts/games/delve` 只能剩註解。
- [ ] **Step 3: 全套測試** — Run: `npx vitest run src/scripts/games/delve`；Expected: 全綠（含 `flatAccess.test.ts`「扁平存取清零」）、測試數與搬移前相同。
- [ ] **Step 4: tsc** — Run: `rtk proxy npx tsc --noEmit -p .`；Expected: 773 個錯誤、`games/delve` 0 個。
- [ ] **Step 5: Commit** — `refactor(delve): move legacy generators into engine/legacy`。說明：M1 的預設路徑仍靜態 import 它們（旗標關閉時新世界照舊用），M2 才改動態 import。

---

### Task 3: BIOME.OCEAN（引擎端）

**驗證過的事實（寫進 commit 說明）：** v1 `OuterProfile.info()` 海區（`ZONE_SEA`）目前 `biome = FOREST`。`OuterFiller.column()` 對海欄只看 `I.kind === ZONE_SEA`（表層沙），`plants()` 跳過 `kind !== ZONE_LAND`，沙灘用的是陸地段的生態——所以把海欄的 biome 改成 OCEAN **不改變任何 fill 位元組**；`save/`、`net/` 完全沒有存或傳 biome（grep `biome` 0 筆）；`outerRegions` 與 `Waystones` 看的是 `zoneAt` 不是 biome；外圍結冰只標重畫、讀檔依日期重算。只有 `biomeAt` 的消費者行為會變，而那正是要修的「海上遠景是森林」。

**Files:**
- Modify: `engine/world.ts:21`（`BIOME`）、`engine/legacy/chunkgen/profile.ts:155-160`（海區 biome）、`engine/spawn.ts:96-104,146-165`、`render/model.ts:281`（`BIOME_NAMES`）、`engine/fishing.ts`（`OCEAN_FISH` 海洋表）
- Test: `engine/legacy/chunkgen/chunkgen.test.ts`、`engine/spawn.test.ts`、`engine/weather.test.ts`、`engine/frost.test.ts`（`freezeSeason` 在 `engine/calendar.ts`）、`engine/fishing.test.ts`、`render/ambient.test.ts`、`render/model.test.ts`

**Interfaces:**
- Produces: `BIOME.OCEAN = 4`（`BiomeId` 自動含 4）；`biomeLabel(4) === '海洋'`。
- Produces（`fishing.ts`，裁決 P15c）：`export const OCEAN_FISH: readonly ItemId[] = ['silver_minnow', 'moonlit_eel', 'thunder_ray', 'mistfin', 'petal_koi']`——M1 的海洋表 = 現有、海上釣得到的魚種（不限生態的水魚），不新增物品；`FISH` 條目不改。

- [ ] **Step 1: 寫 v1 海欄位元組釘選測試（改動前的行為）**

```ts
it('OCEAN 不改變 v1 fill：海與沙灘欄的位元組雜湊固定', () => {
  const gen = new OuterGen('ocean-pin', F);
  let h = 0x811c9dc5;
  for (const cx of [131, 132, 133, 140, 145, 146, 147, -1, -5, -15, -16, -17]) h = fnv1a(bytes(filled(gen, cx)), h);
  expect(h).toBe(V1_SEA_HASH); // 先放 0，跑一次取得現值再貼上（現值 = 改動前的行為）
});
```
（`fnv1a(bytes, h)` 從 `net/codec` import；`bytes` / `filled` 是 chunkgen.test.ts 既有的輔助函式。）

- [ ] **Step 2: 跑一次取現值、貼成 `V1_SEA_HASH` 常數，再跑一次確認 PASS**（這時還沒改任何程式）。
- [ ] **Step 3: 寫 OCEAN 失敗測試**

```ts
// chunkgen.test.ts
expect(BIOME.OCEAN).toBe(4);
expect(gen.biomeAt(4200 + 10)).toBe(BIOME.OCEAN); expect(gen.biomeAt(-10)).toBe(BIOME.OCEAN);
expect(gen.biomeAt(4200 + SEA_W + 50)).not.toBe(BIOME.OCEAN);
// spawn.test.ts
expect(spawnTable(hab({ zone: 'surface', biome: BIOME.OCEAN, water: false }))).toEqual([]);           // 海面上沒有陸怪
expect(spawnTable(hab({ zone: 'surface', biome: BIOME.OCEAN, water: true })).map((e) => e.kind)).toEqual(['razor_fin']);
// weather / frost / fishing / ambient / model
expect(localWeather('rain', BIOME.OCEAN)).toBe('rain'); expect(localWeather('fog', BIOME.OCEAN)).toBe('fog');
for (let d = 0; d < 112; d++) expect(freezeSeason(d, BIOME.OCEAN, 0.5)).toBe(false);
const items = catchCandidates({ ...ctx, biome: BIOME.OCEAN, zone: 'surface' }).map((c) => c.item);
for (const fresh of ['reed_perch', 'brook_trout', 'frost_char', 'oasis_koi', 'mud_whisker', 'sun_bream', 'ember_salmon', 'old_whiskers']) expect(items).not.toContain(fresh);
expect(items).toContain('silver_minnow');
// 海洋表：所有季節 × 時段 × 天氣、釣力 100、大水池的聯集 = OCEAN_FISH ∪ 垃圾 ∪ 木箱
const union = new Set(allCombos(ctx).flatMap((c) => catchCandidates({ ...c, biome: BIOME.OCEAN, zone: 'surface', power: 100, pool: 200 }).map((e) => e.item)));
expect([...union].sort()).toEqual([...OCEAN_FISH, 'soggy_boot', 'wood', 'wooden_crate', 'iron_crate', 'golden_crate'].sort());
expect(ambientKind({ ...amb, outdoors: true, biome: BIOME.OCEAN, sky: 0.2 })).toBeNull();
expect(biomeLabel(BIOME.OCEAN)).toBe('海洋');
```
（`hab(o)` / `ctx` / `amb` = 各測試檔裡的最小建構輔助：`Habitat` / `CatchCtx` / `AmbientContext` 的預設值再蓋上 o；`allCombos(ctx)` = 4 季 × 全部時段 × 全部天氣的 `CatchCtx` 清單，寫在 fishing.test.ts 內。）

- [ ] **Step 4: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine src/scripts/games/delve/render/ambient.test.ts src/scripts/games/delve/render/model.test.ts`；Expected: FAIL（`BIOME.OCEAN` undefined）。
- [ ] **Step 5: 實作** — `BIOME` 加 `OCEAN: 4`；v1 `info()` 海區 `biome = BIOME.OCEAN`；`surfaceTable` 開頭 `if (biome === BIOME.OCEAN) return;`；`aquaticTable` 在叢林判斷之後加 `else if (h.biome === BIOME.OCEAN && h.zone === 'surface') out.push({ kind: 'razor_fin', weight: 6, group: [2, 4] })`；`BIOME_NAMES` 加 `'海洋'`。`fishing.ts` 加 `OCEAN_FISH`（只是命名現有條目、`FISH` 不動）。天氣、結冰、釣魚、環境粒子不需改其他碼（現有分支對 4 的行為就是上面斷言的），測試把行為釘住。海洋表在 M1 交付（spec §8 已依 P15c 修訂）：沿用現有海上魚種、不新增物品；海洋專屬魚種要新物品與美術，留 M2。
- 中間狀態（P16）：這個 commit 到 Task 4 之前，旗標關閉時 v1 海的遠景暫時混成叢林（`BiomeField` 把 4 夾成 3）；接受，Task 3 與 Task 4 必須一起合併。
- [ ] **Step 6: 跑測試** — 同 Step 4；Expected: PASS，`V1_SEA_HASH` 仍 PASS。
- [ ] **Step 7: Commit** — `feat(delve): BIOME.OCEAN; v1 sea columns report OCEAN (fill bytes unchanged)`。

---

### Task 4: OCEAN（畫面端）：海的遠景組、混合、地下主題

**Files:**
- Modify: `render/background.ts:397-414`（三張色表加 `4`）、`:566`（`SKY_TINT[4]`）、`:621-624`（`sets[4]`）；`render/bgBlend.ts:17`（`NB = 5`）；`render/underground.ts:18,61-62`
- Test: `render/background.sun.test.ts`（或新 `render/background.ocean.test.ts`）、`render/bgBlend.test.ts`、`render/underground.test.ts`

**Interfaces:**
- Produces: `buildSeaHorizon(seed: number): IndexedLayer`（遠：海平線 + 2–4 座遠方島影）、`buildSwells(seed: number): IndexedLayer`（中：低浪帶）、`buildSeaNear(seed: number): IndexedLayer`（近：浪頂碎白），都在 `background.ts`；測試用的 `Background.layerFor(biome: number, k: number): IndexedLayer` 與 `export` 的 `BIOME_DAY / BIOME_LITE / BIOME_DARK / SKY_TINT`。
- 本 Task 結束 Task 3 開出的中間狀態（P16）。

- [ ] **Step 1: 寫失敗測試**

```ts
// bgBlend.test.ts
const f = new BiomeField((x) => (x < 1000 ? 0 : 4), -1e6, 1e6);
expect(f.weights(5000, 104)).toHaveLength(5);
expect(f.pair(5000, 104)).toEqual({ left: 4, right: 4, u: 0 });
// background.ocean.test.ts（fakeCanvas）
const bg = new Background(7);
expect(bg.layerFor(4, 0)).not.toBe(bg.layerFor(0, 0));          // 海有自己的剪影
for (const t of [BIOME_DAY, BIOME_LITE, BIOME_DARK]) for (const c of t[4]) expect(PALETTE_HEX).toContain(c);
expect(SKY_TINT[4].every((c) => PALETTE_HEX.includes(c))).toBe(true);
// underground.test.ts
const bands = ugColumnBands({ ...col, biomeAt: () => BIOME.OCEAN });
expect(bands.find((b) => !b.fade && !b.overlay && b.y0 < col.rockY)!.theme).toBe(UG.SAND);
expect(bands.find((b) => !b.overlay && b.y0 >= col.rockY && b.y1 <= col.deepY)!.theme).toBe(UG.ROCK);
```
（`layerFor(biome, k)` 是給測試的唯讀存取：回 `this.sets[biome]?.[k] ?? this.sets[0][k]`；`BIOME_DAY` 等三張表與 `SKY_TINT` 加 `export` 供測試。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/render/bgBlend.test.ts src/scripts/games/delve/render/background.ocean.test.ts src/scripts/games/delve/render/underground.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** — `NB = 5`；三個新剪影產生函式（照現有 `buildMountains` / `buildDunes` 的 `IndexedLayer` 寫法、索引 1 基色 2 受光 3 暗面；近層 `deep = true`）；`sets[4] = [buildSeaHorizon(seed + 11), buildSwells(seed + 12), buildSeaNear(seed + 13)]`；色表 `4` 取色票裡的藍綠 / 灰藍（`#…` 必須在 `PALETTE_HEX`）。地下：新增 `LOWER_THEME: Record<number, number> = { 4: UG.ROCK }`，`lower(b) = LOWER_THEME[b] ?? BIOME_THEME[b] ?? UG.ROCK`；`BIOME_THEME` 加 `4: UG.SAND`。
- [ ] **Step 4: 跑測試** — 同 Step 2；Expected: PASS。再跑 `npx vitest run src/scripts/games/delve/render`，Expected: 全綠。
- [ ] **Step 5: Commit** — `feat(delve): ocean backdrop set, 5-way biome blend, ocean underground theme`。

---

### Task 5: World 的「沒有中央陣列」模式、地區 API、生成物件登錄

**Files:**
- Create: `engine/regionInfo.ts`
- Modify: `engine/world.ts`（`WorldOptions`、建構子 138-155、`isPinned` / `pinnedSet` 225-236、`ensureColumn` 241-255、`unloadColumn` 257-275、`build` 364-384、`surfaceAt / biomeAt / layersAt` 402-423）、`engine/column.ts:56-67`（`ColumnSource` 選用方法）、`engine/legacy/chunkgen/index.ts`（v1 `regionAt`）
- Modify（中央判斷改走 `isLegacyCentral`）：`engine/frost.ts:33`、`engine/game.ts:931`、`render/colCache.ts:14`、`render/hud.ts:708`
- Test: `engine/world.source.test.ts`（新）、`engine/legacy/chunkgen/chunkgen.test.ts`

**Interfaces:**
- Produces（`engine/regionInfo.ts`）：
  ```ts
  export type Side = -1 | 0 | 1;
  export type RegionKind = 'home' | 'culture' | 'wild' | 'sea' | 'island';
  export type CultureId = 'mistbamboo';
  export interface RegionInfo { landmass: number; side: Side; tier: number; kind: RegionKind; culture: CultureId | null; variant: number; biome: number; index: number; x0: number; x1: number; }
  ```
- Produces（`column.ts`）：`interface GenChest { x: number; y: number; slots: (Stack | null)[] }`；`ColumnSource` 加選用 `regionAt?(x: number): RegionInfo` 與 `objectsIn?(x0: number, x1: number): GenChest[]`。
- Produces（`world.ts`）：`WorldOptions.central?: 'arrays' | 'source'`；`World.centralArrays: boolean`；`World.isLegacyCentral(x: number): boolean`；`World.regionAt(x: number): RegionInfo`。
- Produces（v1）：`OuterGen.regionAt(x)`：海 → `{ landmass: 1, side, tier: 0, kind: 'sea', biome: OCEAN, index: 0, x0, x1 }`；陸地段 k → `{ landmass: 2, side, tier: 0, kind: 'wild', biome: seg.biome, index: k, x0: seg.x0, x1: seg.x1 }`；variant 0、culture null。舊世界中央的後備值：`{ landmass: 0, side: 0, tier: 0, kind: 'home', culture: null, variant: 0, biome: biomeAt(x), index: 0, x0: 0, x1: width }`。

- [ ] **Step 1: 寫失敗測試**

```ts
// world.source.test.ts — 用 HashSource（net/testRig 的那種，複製一份最小版）並加 objectsIn 回一個箱子
it('source 模式：建構時沒有常駐欄、中央不 pin、中央欄整欄由 source 填', () => {
  const w = new World(4200, 1200, { bounds: 'infinite', source: src, central: 'source' });
  expect(w.residentColumns()).toEqual([]); expect(w.isPinned(10)).toBe(false); expect(w.centralArrays).toBe(false);
  w.ensureColumn(10);
  for (let x = 320; x < 352; x++) expect(w.getFg(x, 500)).toBe(src.expectFg(x, 500));
  expect(w.surfaceAt(330)).toBe(src.surfaceAt(330)); expect(w.biomeAt(330)).toBe(src.biomeAt(330));
  expect(w.isLegacyCentral(330)).toBe(false);
  expect(w.unloadColumn(10)).toBe(true);
});
it('生成物件：載入時登錄沒改過 chunk 的箱子；改過就不蓋；卸載時丟掉沒改過的', () => {
  w.ensureColumn(10); const k = w.idx(330, 400);
  expect(w.chests.get(k)).toEqual(src.chestSlots);
  w.chests.get(k)![0] = null; w.touchChest(330, 400);            // 搜刮 → chunk 已修改
  w.unloadColumn(10); w.ensureColumn(10);
  expect(w.chests.get(k)![0]).toBeNull();                         // 停放蓋回，沒被重新填滿
  w2.ensureColumn(10); w2.unloadColumn(10); expect(w2.chests.has(k)).toBe(false); // 沒改過 → 卸載就丟
  w2.ensureColumn(10); expect(w2.chests.get(k)).toEqual(src.chestSlots);        // 再載入一樣
});
it('regionAt：source 有就問 source；舊世界中央回 home', () => {
  expect(w.regionAt(330)).toEqual(src.regionAt(330));
  const legacy = new World(100, 100);
  expect(legacy.regionAt(50)).toMatchObject({ kind: 'home', landmass: 0, tier: 0, x0: 0, x1: 100 });
  expect(legacy.isLegacyCentral(50)).toBe(true); expect(legacy.isLegacyCentral(100)).toBe(false);
});
// chunkgen.test.ts
expect(gen.regionAt(4210)).toMatchObject({ kind: 'sea', side: 1, biome: BIOME.OCEAN, x0: 4200, x1: 4200 + SEA_W });
expect(gen.regionAt(-1 - SEA_W - 5)).toMatchObject({ kind: 'wild', side: -1, index: 0 });
```

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/world.source.test.ts src/scripts/games/delve/engine/legacy/chunkgen/chunkgen.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** — `'source'` 模式：建構子不建欄、`surface` / `biome` 配長度 0；`isPinned(cx) = (centralArrays && 0 ≤ cx < chunksX) || pinned.has(cx)`、`pinnedSet` 同理；`build` 在 `'source'` 模式直接 `src.fill(col, x0, x1)` 整段（不扣中央）；`surfaceAt / biomeAt / layersAt` 在 `'source'` 模式一律問 source。`ensureColumn` 在蓋完停放 chunk 後呼叫私有 `registerObjects(cx)`：對 `source.objectsIn?.(x0, x1)` 的每個箱子，若所在 chunk 不在 `modifiedChunks`、`chests` 沒有這個鍵、且該格是箱子 tile，就放進 `chests` 並記進 `genChests: Map<cx, number[]>`；`unloadColumn` 把 `genChests.get(cx)` 中所在 chunk 沒改過的箱子刪掉。`isLegacyCentral(x) = centralArrays && x >= 0 && x < width`。四個中央判斷點換成 `w.isLegacyCentral(x)`（`colCache.horizonSurfaceAt` 的 `Pick` 型別加 `'isLegacyCentral'`）。`World.regionAt` = `source?.regionAt?.(x)`，source 沒有或 x 是舊中央時回後備值。
- [ ] **Step 4: 跑測試** — 同 Step 2，再跑 `npx vitest run src/scripts/games/delve`；Expected: 全綠（預設 `'arrays'` 模式行為不變）。
- [ ] **Step 5: Commit** — `feat(delve): World source-only central mode, regionAt, generated chest registration`。

---

### Task 6: gen2 版面（Layout）、文化池、版本鎖表

**Files:**
- Create: `engine/gen2/layout.ts`、`engine/gen2/locks.ts`、`engine/gen2/cultures.ts`
- Test: `engine/gen2/layout.test.ts`、`engine/gen2/locks.test.ts`

**Interfaces:**
- Consumes: `RegionInfo`、`Side`、`CultureId`（Task 5）。
- Produces（`locks.ts`）：
  ```ts
  export interface LandLock { ver: number; culture: CultureId | null }
  export type LockJSON = [side: Side, i: number, ver: number, culture: CultureId | null][];
  export class LockTable {
    constructor(opts?: { frozen?: boolean });            // frozen = 客人副本：lock() 不記
    get(side: Side, i: number): LandLock | undefined;
    lock(side: Side, i: number, l: LandLock): boolean;   // 新加的回 true
    toJSON(): LockJSON;                                  // 依 (side, i) 排序
    static fromJSON(v: unknown, opts?: { frozen?: boolean }): LockTable;  // 壞資料丟 RangeError
  }
  ```
- Produces（`cultures.ts`）：`CULTURE_POOL: Readonly<Record<number, readonly (CultureId | null)[]>> = { 0: ['mistbamboo', null] }`；`poolFor(ver: number)`（取 ≤ ver 的最新一組）；`CULTURES.mistbamboo = { name: '霧竹之國', prefixes: [...8 個], suffixes: ['山', '谷', '之里'] }`。
- Produces（`layout.ts`）：
  ```ts
  export const HOME_X0 = 0, HOME_X1 = 4200, SPAWN_X = 2100, SEA_SLOT_W = 300;
  export const VARIANT = { PLAIN: 0, HILLS: 1, HIGH: 2, BEACH: 3, SPAWN: 4, ISLAND: 5, SEA: 6 } as const;
  export interface SideOrigin { x: number; start: 'sea' | 'continent'; seaY: number; shore: number }
  export interface LayoutOrigin { home: { x0: number; x1: number } | null; east: SideOrigin; west: SideOrigin }
  export interface IslandInfo { x0: number; x1: number; slot: number }
  export interface SeaSlot { k: number; x0: number; x1: number; poi: 'island' | 'shipwreck' | 'crate' }
  export interface Landmass { side: Side; i: number; kind: 'home' | 'continent' | 'sea'; x0: number; x1: number; tier: number; culture: CultureId | null; ver: number; regions: RegionInfo[]; islands: IslandInfo[]; slots: SeaSlot[] }
  export function newWorldOrigin(seaY: number, shore: number): LayoutOrigin;
  export class Layout {
    constructor(seed: string, origin: LayoutOrigin, locks: LockTable, latestVer: number);
    landmassAt(x: number): Landmass | null;              // null = 不屬 gen2（烘焙世界的舊範圍）
    landmass(side: 1 | -1, i: number): Landmass;
    regionAt(x: number): RegionInfo | null;
  }
  ```
  東側 gen2 涵蓋 `x ≥ east.x`、西側涵蓋 `x < west.x`；新世界 `east.x = 4200`、`west.x = 0`、兩側 `start = 'sea'`、`home = [0, 4200)`。每側地塊序號 i = 1, 2, …，從 `start` 開始海 / 大陸交替；家鄉是 `(0, 0)`。
- **海與島的 RegionInfo 由 Layout 產生（裁決 P12，唯一擁有者）**：海地塊的 `regions = [海本身, 島 1, 島 2, …]`。海本身 `{ kind: 'sea', variant: SEA, biome: OCEAN, index: 0, x0: m.x0, x1: m.x1 }`；第 j 座島 `{ kind: 'island', variant: ISLAND, biome: FOREST, index: j, x0: 島.x0, x1: 島.x1 }`；兩者的 landmass / side / tier / culture 取該海地塊（culture null）。`regionAt(x)` 在島範圍內回島、否則回海本身。`slots` 是同一道海的槽位清單（`SeaSlot`，依 x 排序、`k` 從 0 起）。後續 Task 只讀這些，不自己再造。

**版面規則（凍結對象，M2 起不得改輸出）：**
- 海寬：該側第一道 gen2 海 480–700；第 k 道（k ≥ 2）480–`min(1200, 700 + 100(k−1))`。槽位數 `ceil(海寬 / 300)`，均分（最後一槽吃餘數）。島數 1–`min(3, 槽位數)`，挑不同槽；島寬 40–`min(160, 槽寬 − 80)`，置中 ± `floor(槽寬 / 10)`。其他槽的 `poi` 依雜湊 50% `shipwreck`、50% `crate`（`reef`、`sea_ruin` 留 M2）。
- 大陸：地區數 2–4；總寬 T 取 `[max(2400, 700n), min(5200, 1500n)]`；切成 n 段、每段 700–1500、總和 = T（演算法自訂，測試釘不變量）。
- 生態：荒野與 M1 的文化大陸都是 4 種基礎生態、相鄰地區不重複；variant 取 PLAIN / HILLS / HIGH。
- 家鄉 [0, 4200)：兩端各 70 格 BEACH（biome FOREST）；出生森林 [1680, 2520) 為 SPAWN；一側雪原（寬 420–546）、另一側叢林（504–630）；沙漠（315–420）隨機在一側、與該側外圍生態之間至少 84 格森林；其餘補 FOREST（PLAIN / HILLS）。家鄉地區不受 700–1500 限制。
- 文化（第 c 片大陸，c 從 1 起算）：c = 1 時由 `hash2` 決定哪一側是 `'mistbamboo'`、另一側荒野；c ≥ 2 時在 `poolFor(ver)` 中排除第 c−1 片的文化後依雜湊均勻挑（池只有兩項 → 交替，比例 1:1）。已鎖的地塊用鎖裡的文化；前一片的文化以鎖為準再往後推。
- tier：家鄉 0；大陸 = c；海與島 = 往外下一片大陸的 c。
- 版本：地塊的 ver = 鎖裡的 ver，沒鎖用 `latestVer`；寬度規則以該地塊的 ver 選分支（M1 只有 ver 0）。

- [ ] **Step 1: 寫失敗測試**

```ts
const L = (seed: string, locks = new LockTable()) => new Layout(seed, newWorldOrigin(341, 334), locks, 0);
it('交替、寬度範圍、地區鋪滿', () => {
  for (const seed of SEEDS20) for (const side of [1, -1] as const) {
    const lay = L(seed);
    for (let i = 1; i <= 12; i++) {
      const m = lay.landmass(side, i), w = m.x1 - m.x0;
      expect(m.kind).toBe(i % 2 ? 'sea' : 'continent');
      if (m.kind === 'sea') { expect(w).toBeGreaterThanOrEqual(480); expect(w).toBeLessThanOrEqual(i === 1 ? 700 : 1200); }
      else {
        expect(w).toBeGreaterThanOrEqual(2400); expect(w).toBeLessThanOrEqual(5200);
        expect(m.regions.length).toBeGreaterThanOrEqual(2); expect(m.regions.length).toBeLessThanOrEqual(4);
        m.regions.forEach((r, k) => { expect(r.x1 - r.x0).toBeGreaterThanOrEqual(700); expect(r.x1 - r.x0).toBeLessThanOrEqual(1500);
          expect(r.x0).toBe(k ? m.regions[k - 1].x1 : m.x0); if (k) expect(r.biome).not.toBe(m.regions[k - 1].biome); });
        expect(m.regions.at(-1)!.x1).toBe(m.x1);
      }
      if (i > 1) expect(side === 1 ? m.x0 : m.x1).toBe(side === 1 ? lay.landmass(side, i - 1).x1 : lay.landmass(side, i - 1).x0);
    }
  }
});
it('海的島與槽位、海 / 島的 RegionInfo', () => { for (const seed of SEEDS20) for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7]) {
  const m = L(seed).landmass(side, i), n = Math.ceil((m.x1 - m.x0) / 300);
  expect(m.slots).toHaveLength(n); expect(m.slots[0].x0).toBe(m.x0); expect(m.slots.at(-1)!.x1).toBe(m.x1);
  m.slots.forEach((s, k) => { expect(s.k).toBe(k); expect(s.x1 - s.x0).toBeLessThanOrEqual(300); if (k) expect(s.x0).toBe(m.slots[k - 1].x1); });
  expect(m.islands.length).toBeGreaterThanOrEqual(1); expect(m.islands.length).toBeLessThanOrEqual(Math.min(3, n));
  for (const d of m.islands) { const s = m.slots[d.slot]; expect(d.x1 - d.x0).toBeGreaterThanOrEqual(40); expect(d.x1 - d.x0).toBeLessThanOrEqual(160);
    expect(d.x0).toBeGreaterThanOrEqual(s.x0); expect(d.x1).toBeLessThanOrEqual(s.x1); expect(s.poi).toBe('island'); }
  expect(m.slots.filter((s) => s.poi === 'island')).toHaveLength(m.islands.length);
  expect(m.regions[0]).toMatchObject({ kind: 'sea', index: 0, x0: m.x0, x1: m.x1, biome: BIOME.OCEAN, variant: VARIANT.SEA });
  m.islands.forEach((d, j) => { expect(m.regions[j + 1]).toMatchObject({ kind: 'island', index: j + 1, x0: d.x0, x1: d.x1, variant: VARIANT.ISLAND, tier: m.tier });
    expect(L(seed).regionAt((d.x0 + d.x1) >> 1)!.kind).toBe('island'); });
  const free = m.slots.find((s) => s.poi !== 'island'); if (free) expect(L(seed).regionAt(free.x0 + 1)!.kind).toBe('sea'); } });
it('文化：第一片東西大陸恰一片霧竹、20 個種子兩側都出現過；之後相鄰大陸文化不同；tier', () => {
  const sides = new Set<number>();
  for (const seed of SEEDS20) { const lay = L(seed), e = lay.landmass(1, 2), w = lay.landmass(-1, 2);
    expect([e.culture, w.culture].filter((c) => c === 'mistbamboo')).toHaveLength(1);
    sides.add(e.culture === 'mistbamboo' ? 1 : -1);
    for (let i = 4; i <= 12; i += 2) expect(lay.landmass(1, i).culture).not.toBe(lay.landmass(1, i - 2).culture);
    expect(lay.landmass(1, 1).tier).toBe(1); expect(lay.landmass(1, 2).tier).toBe(1); expect(lay.landmass(1, 3).tier).toBe(2);
    expect(e.kind === 'continent' && e.regions.every((r) => r.kind === (e.culture ? 'culture' : 'wild'))).toBe(true); }
  expect(sides.size).toBe(2);
});
it('家鄉：[0,4200)、出生森林、兩端海灘、四種生態都在', () => { for (const seed of SEEDS20) { const lay = L(seed), h = lay.landmassAt(SPAWN_X)!;
  expect(h).toMatchObject({ side: 0, i: 0, kind: 'home', x0: 0, x1: 4200, tier: 0 });
  expect(lay.regionAt(SPAWN_X)).toMatchObject({ variant: VARIANT.SPAWN, x0: 1680, x1: 2520, biome: BIOME.FOREST });
  expect(lay.regionAt(0)).toMatchObject({ variant: VARIANT.BEACH, x1: 70 }); expect(lay.regionAt(4199)).toMatchObject({ variant: VARIANT.BEACH, x0: 4130 });
  expect(new Set(h.regions.map((r) => r.biome))).toEqual(new Set([0, 1, 2, 3])); expect(h.regions.every((r) => r.kind === 'home')).toBe(true); } });
it('鎖覆寫文化並往後推', () => { const locks = new LockTable(); const free = L('s');
  const c1 = free.landmass(1, 2).culture; locks.lock(1, 2, { ver: 0, culture: c1 ? null : 'mistbamboo' });
  const lay = L('s', locks); expect(lay.landmass(1, 2).culture).toBe(c1 ? null : 'mistbamboo');
  expect(lay.landmass(1, 4).culture).not.toBe(lay.landmass(1, 2).culture); });
it('regionAt 與 landmassAt 一致、與查詢順序無關、跨實例相同', () => { const xs: number[] = []; for (let x = -60_000; x < 60_000; x += 97) xs.push(x);
  const a = L('ord'), b = L('ord'), fa = xs.map((x) => a.regionAt(x)), fb = [...xs].reverse().map((x) => b.regionAt(x)).reverse();
  expect(fb).toEqual(fa);
  xs.forEach((x, k) => { const m = a.landmassAt(x)!, r = fa[k]!; expect(r.x0).toBeLessThanOrEqual(x); expect(r.x1).toBeGreaterThan(x);
    expect(m.regions).toContainEqual(r); expect([r.side, r.landmass]).toEqual([m.side, m.i]); }); });
it('烘焙原點：東側從大陸開始時第一片是 tier 1 的大陸', () => {
  const lay = new Layout('s', { home: null, east: { x: 10_000, start: 'continent', seaY: 345, shore: 340 }, west: { x: -1_000, start: 'sea', seaY: 331, shore: 320 } }, new LockTable(), 0);
  expect(lay.landmass(1, 1)).toMatchObject({ kind: 'continent', x0: 10_000, tier: 1 }); expect(lay.landmassAt(5_000)).toBeNull();
});
// locks.test.ts
it('LockTable', () => { const t = new LockTable();
  expect(t.lock(1, 3, { ver: 0, culture: null })).toBe(true); expect(t.lock(-1, 2, { ver: 0, culture: 'mistbamboo' })).toBe(true); expect(t.lock(1, 3, { ver: 0, culture: null })).toBe(false);
  expect(t.toJSON()).toEqual([[-1, 2, 0, 'mistbamboo'], [1, 3, 0, null]]);
  expect(LockTable.fromJSON(t.toJSON()).toJSON()).toEqual(t.toJSON());
  for (const bad of ['x', [[2, 1, 0, null]], [[1, 1, -1, null]], [[1, 1, 0.5, null]], [[1, 1, 0, 'atlantis']]]) expect(() => LockTable.fromJSON(bad)).toThrow(RangeError);
  const f = LockTable.fromJSON([], { frozen: true }); expect(f.lock(1, 1, { ver: 0, culture: null })).toBe(false); expect(f.get(1, 1)).toBeUndefined(); });
```

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: FAIL（模組不存在）。
- [ ] **Step 3: 實作** — 每側的地塊邊界用前綴和惰性延伸並快取（陣列）；`landmassAt` 二分搜尋；延伸到 ±`X_LIMIT` 為止。地區、島、槽位都只用 `hash2(i, k, seedInt(seed, 'g2-…'))`。
- [ ] **Step 4: 跑測試** — 同 Step 2；Expected: PASS。
- [ ] **Step 5: Commit** — `feat(delve): gen2 layout — continents, seas, islands, cultures, tiers, locks`。

---

### Task 7: gen2 每欄側寫（Profile2）

**Files:**
- Create: `engine/gen2/profile.ts`
- Test: `engine/gen2/profile.test.ts`

**Interfaces:**
- Consumes: `Layout`、`Landmass`、`VARIANT`、`SideOrigin`、海 / 島的 `RegionInfo`（Task 6）；`vnoise1` / `hash2` / `seedInt`（`engine/noise.ts`，不 import legacy）。
- Produces：
  ```ts
  export const SEA_Y = 341, CAVERN_BASE = 560, MOLTEN_BASE = 1010, LAVA_Y = MOLTEN_BASE + 40;
  export const BLEND_W = 40, SHORE_RAMP = 100, BEACH_W = 40, SEA_DEPTH = 46, ISLAND_RAMP = 20, SPAWN_FLAT = 60, SPAWN_RAMP = 40;
  export const AMP: Readonly<Record<number, number>>;   // 鍵 = VARIANT 的每一個值（7 個），見下
  export const COL_SEA = 0, COL_BEACH = 1, COL_LAND = 2, COL_ISLAND = 3;
  export interface ColInfo2 { kind: 0 | 1 | 2 | 3; surface: number; waterTop: number; biome: number; rock: number; deep: number; molten: number; region: RegionInfo }
  export class Profile2 {
    constructor(seed: string, layout: Layout, height: number);
    info(x: number): ColInfo2;          // 32 欄一段快取（最多 64 段）
    surfaceAt(x: number): number; waterTopAt(x: number): number | null; biomeAt(x: number): number;
    layersAt(x: number): ColumnLayers; regionAt(x: number): RegionInfo | null;
  }
  ```
- 規則：陸地地表 = `seaY − 7 − round(RELIEF[biome] × AMP[variant] × n(x))`，`n` 同 v1 的兩層 `engine/noise.ts` `vnoise1`；`RELIEF` 沿用 v1（森林 14、沙漠 8、雪 28、叢林 12）；地區交界 `BLEND_W` 內振幅與基準線性內插。
- `AMP` 對 Task 6 會產生的**每一個** variant 都有值（裁決 P3）：`{ PLAIN: 0.5, HILLS: 1, HIGH: 1.8, SPAWN: 0.5, BEACH: 0.3, ISLAND: 0, SEA: 0 }`（島與海的地形走下面的專用規則，0 只是讓查表不會 undefined）。
- 出生平地（P3）：`|x − SPAWN_X| ≤ SPAWN_FLAT` 振幅 0；`SPAWN_FLAT < |x − SPAWN_X| ≤ SPAWN_FLAT + SPAWN_RAMP` 振幅從 0 線性升到 `AMP.SPAWN`；之外照常。這樣 ±60 邊緣也滿足相鄰欄差 ≤ 4。
- 海：水面 `seaY`、海床 `seaY + SEA_DEPTH ± 8`，離岸 `SHORE_RAMP` 內線性爬升到岸邊地表；陸地離水 `BEACH_W` 內是沙灘。島：台地 `seaY − (3..10)`，兩側 `ISLAND_RAMP` 斜到海床（島欄的形狀在這裡；島的表層材質與樹歸 Task 11，P12）。`seaY` / 岸高取 `SideOrigin`（新世界兩側都是 `SEA_Y`）。
- 接縫（P13，烘焙世界專用）：`start: 'sea'` → 第一道海從 `shore`（v1 陸地內側一格的地表）斜下到海床。`start: 'continent'` → 第一片大陸緊貼 v1 的海：從 `x = origin.x` 起 `SHORE_RAMP` 格內地表從 `shore`（= v1 接縫內側一格的海床）線性爬升到陸地地表，地表在 `seaY` 以下的欄 `waterTop = seaY`（延續 v1 的海、深度與 v1 海床相接）、`kind = SEA`；之後 `BEACH_W` 格沙灘、再來才是陸地。
- 層線比照 v1（rock = surface + 18 ± 8、deep = CAVERN_BASE ± 16、molten = MOLTEN_BASE ± 12，夾住順序）。
- `ColInfo2.region` 不可為 null：`info(x)` 只對 gen2 範圍內的 x 呼叫，範圍外丟 RangeError；`regionAt(x)` 才回 `RegionInfo | null`。

- [ ] **Step 1: 寫失敗測試**

```ts
const P = (seed = 'p') => new Profile2(seed, new Layout(seed, newWorldOrigin(SEA_Y, SEA_Y - 7), new LockTable(), 0), 1200);
it('層線順序與範圍', () => { for (let x = -40000; x < 40000; x += 97) { const i = P().info(x);
  expect(i.surface).toBeGreaterThanOrEqual(1); expect(i.surface).toBeLessThan(i.rock); expect(i.rock).toBeLessThan(i.deep);
  expect(i.deep).toBeLessThan(i.molten); expect(i.molten).toBeLessThan(1200); } });
it('出生點 ±60 平坦、±100 內相鄰差 ≤ 4', () => { for (const seed of SEEDS20) { const p = P(seed), s = p.surfaceAt(SPAWN_X);
  for (let x = SPAWN_X - 60; x <= SPAWN_X + 60; x++) expect(p.surfaceAt(x)).toBe(s);
  for (let x = SPAWN_X - 101; x <= SPAWN_X + 100; x++) expect(Math.abs(p.surfaceAt(x + 1) - p.surfaceAt(x))).toBeLessThanOrEqual(4); } });
it('AMP 涵蓋每個 variant', () => { for (const v of Object.values(VARIANT)) expect(AMP[v]).toBeTypeOf('number'); });
it('相鄰欄地表差 ≤ 4（洞穴不會從側面挖到水）', () => { const p = P(); for (let x = -30000; x < 30000; x++) expect(Math.abs(p.surfaceAt(x + 1) - p.surfaceAt(x))).toBeLessThanOrEqual(4); });
it('海：水面 = seaY、海床在水面下 ≥ 2；島台地在水面上；biome', () => { const lay = new Layout('p', newWorldOrigin(SEA_Y, SEA_Y - 7), new LockTable(), 0), p = new Profile2('p', lay, 1200); let isl = 0;
  for (const side of [1, -1] as const) for (const i of [1, 3, 5]) { const m = lay.landmass(side, i);
    for (let x = m.x0; x < m.x1; x++) { const c = p.info(x);
      if (c.kind === COL_SEA) { expect(c.waterTop).toBe(SEA_Y); expect(c.surface).toBeGreaterThanOrEqual(SEA_Y + 2); expect(p.biomeAt(x)).toBe(BIOME.OCEAN); }
      if (c.kind === COL_ISLAND) { isl++; expect(c.surface).toBeLessThan(SEA_Y); expect(c.biome).toBe(BIOME.FOREST); expect(c.region.kind).toBe('island'); } } }
  expect(isl).toBeGreaterThan(0); });
it('沙灘：陸地離水 40 格內 kind = BEACH', () => { const p = P();
  for (let x = 0; x < 40; x++) expect(p.info(x).kind).toBe(COL_BEACH); for (let x = 4160; x < 4200; x++) expect(p.info(x).kind).toBe(COL_BEACH);
  expect(p.info(200).kind).toBe(COL_LAND); });
it('快取不改變結果', () => { const a = P('c'), b = P('c'); const xs = [...Array(3000)].map((_, k) => ((k * 7919) % 60000) - 30000);
  for (const x of xs) expect(a.info(x)).toEqual(b.info(x)); for (const x of [...xs].reverse()) expect(a.info(x)).toEqual(b.info(x)); });
const PO = (east: SideOrigin) => new Profile2('o', new Layout('o', { home: null, east, west: { x: -1000, start: 'sea', seaY: 331, shore: 320 } }, new LockTable(), 0), 1200);
it('烘焙原點（海開始）：第一道海從 shore 高度斜下', () => { const p = PO({ x: 9000, start: 'sea', seaY: 346, shore: 330 });
  expect(Math.abs(p.surfaceAt(9000) - 330)).toBeLessThanOrEqual(2); expect(p.waterTopAt(9050)).toBe(346);
  for (let x = 9000; x < 9000 + SHORE_RAMP; x++) expect(Math.abs(p.surfaceAt(x + 1) - p.surfaceAt(x))).toBeLessThanOrEqual(4); });
it('烘焙原點（大陸開始，P13）：從 v1 海床爬升、延續水面、接沙灘再接陸地', () => { const p = PO({ x: 9000, start: 'continent', seaY: 346, shore: 392 });
  expect(Math.abs(p.surfaceAt(9000) - 392)).toBeLessThanOrEqual(2); expect(p.waterTopAt(9000)).toBe(346); expect(p.info(9000).kind).toBe(COL_SEA);
  for (let x = 9000; x < 9000 + SHORE_RAMP + BEACH_W; x++) expect(Math.abs(p.surfaceAt(x + 1) - p.surfaceAt(x))).toBeLessThanOrEqual(4);
  const firstDry = [...Array(SHORE_RAMP + BEACH_W)].map((_, k) => 9000 + k).find((x) => p.waterTopAt(x) === null)!;
  expect(p.info(firstDry).kind).toBe(COL_BEACH); expect(p.info(9000 + SHORE_RAMP + BEACH_W + 5).kind).toBe(COL_LAND);
  expect(p.regionAt(9000)!.kind).toMatch(/^(wild|culture)$/); });
```
（`SEEDS20` 同 Task 6。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/profile.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** — 如上規則；`info` 以 `x >> 5` 為鍵整段算 32 欄存進 `Int16Array` / `Uint8Array`（region 物件另存陣列），Map 超過 64 段整個清掉。
- [ ] **Step 4: 跑測試** — 同上；Expected: PASS。
- [ ] **Step 5: Commit** — `feat(delve): gen2 column profile — relief blending, shores, islands, layers`。

---

### Task 8: gen2 填格與 Gen2Source（材質、洞穴、主坑道、礦、海、熔岩線、樹）

**Files:**
- Create: `engine/genPrims.ts`（裁決 P10：v1 與 gen2 共用的 primitives）、`engine/gen2/fill.ts`、`engine/gen2/caves.ts`、`engine/gen2/index.ts`
- Modify: `engine/legacy/chunkgen/fill.ts`（`ColNoise`、洞穴 / 入口 / 礦噪聲取樣、樹 / 仙人掌繪製改從 `engine/genPrims.ts` import；v1 的材質與礦種規則留在原檔；輸出由 `V1_FILL_HASH` 釘住）
- Modify: `engine/legacy/chunkgen/chunkgen.test.ts:261-270`（禁用 API 測試延伸到 `engine/gen2/**` 與 `engine/genPrims.ts`；新增 `V1_FILL_HASH`）
- Test: `engine/gen2/fill.test.ts`、`engine/gen2/testUtil.ts`（測試共用，後面的 Task 都用：`fillCol(src: ColumnSource, cx: number): Column`、`bytes(c: Column): Uint8Array`、`worldOf(src: ColumnSource): World`（4200×1200、infinite、`central: 'source'`）、`loadColumns(w: World, x0: number, x1: number): void`、`sampleRegions(src: Gen2Source, o: { home: boolean; perSide: number }): RegionInfo[]`（陸地地區）、`bfsReachesDepth(w, x, y, deepAt: (x: number) => number, xLo: number, xHi: number): boolean`（4 鄰空氣 BFS）、`liquidInvariant(w: World, x0: number, x1: number): { x: number; y: number }[]`（違規格））

**Interfaces:**
- Consumes: `Profile2`、`Layout`、`LockTable`（Task 6、7）。
- Produces（`index.ts`）：
  ```ts
  export const GEN2_VERSION = 0, GEN2_MIN_VERSION = 0;
  export interface Gen2Options { origin?: LayoutOrigin; locks?: LockTable; recordLocks?: boolean; latestVer?: number }
  export class Gen2Source implements ColumnSource {
    readonly version: number;                          // = GEN2_VERSION
    readonly layout: Layout; readonly profile: Profile2; readonly locks: LockTable;
    constructor(seed: string, opts?: Gen2Options);
    fill(col: Column, x0: number, x1: number): void;   // 支援任意子範圍；先把涉及的地塊上鎖（recordLocks 預設 true）
    surfaceAt(x: number): number; biomeAt(x: number): number; layersAt(x: number): ColumnLayers;
    waterTopAt(x: number): number | null; regionAt(x: number): RegionInfo; objectsIn(x0: number, x1: number): GenChest[];
    isEntrance(x: number): boolean;
  }
  ```
  `regionAt` 在 gen2 範圍外丟 RangeError（只會被 `BakedSource` 在範圍內呼叫）。
- Produces（`caves.ts`）：`shaftX(seed: number, r: RegionInfo): number`——離兩端至少 `margin = min(120, floor((r.x1 − r.x0) / 4))` 格、離 SPAWN_X ≥ 100（裁決 P4）；BEACH 地區、海與島地區回 NaN；`shaftOffset(seed: number, r: RegionInfo, y: number): number`（三角波：每列水平移 1、振幅 12）。
- Produces（`engine/genPrims.ts`，P10）：`class ColNoise`（從 v1 原樣搬來，不是複製）、`spagHit(n: ColNoise, y, depthFrac): boolean` / `cavernHit(...)` / `entranceHit(...)`（v1 的門檻常數跟著搬）、`oreNoise(x, y, s): number`（只回噪聲值，不決定礦種）、`plantTree(col, x, groundY, biome, rng)` / `plantCactus(...)`。v1 `OuterFiller` 與 gen2 `Filler2` 都 import 這一份；兩邊各自保留自己的材質表與「哪個噪聲值換成哪種礦、能替換哪些格」的規則。

**填格規則：** 表層材質（gen2 自己的表，數值與 v1 相同）：森林草 + 泥、沙漠沙 6 + 砂岩、雪 5、叢林叢林草 + 泥巴；海床沙 3、沙灘沙 4；岩層 / 深層岩 / 玄武岩與牆同 v1；噪聲洞穴用 `genPrims` 的義大利麵 + 大洞窟取樣，地表下 6 格內不挖（海與島的欄 8 格）、地表入口欄除外；主坑道：每個**非沙灘的陸地地區**一條（P4：沙灘只有 70 格寬，豁免），從 `surface(shaftX) − 1` 到 `deep + 12`，坑道中心 `shaftX + shaftOffset(y)`，每列挖寬 2（中心與 +1）、高 4 的空氣（之字形坡道，走得下去），底端挖半徑 6 的圓室；礦用 `oreNoise` 與 v1 的門檻 / 深度帶，但**只替換石頭類格**（石、深層岩），海床與沙灘的沙一律不換成礦（P10：不帶過 v1「銅換掉海床沙」的 carry bug）；海水 = 水面到海床前一格滿格靜止；熔岩：`y ≥ LAVA_Y` 的空氣格填滿熔岩（全世界同一條水平線 → 不會有階梯狀熔岩）；樹 / 仙人掌用 `genPrims` 繪製、只長在陸地欄，出生點 ±3 不長樹。島欄在本 Task 只填與海床相同的底層材質（沙 / 石），島的表層材質與樹歸 Task 11（P12）。`fill` 依地塊的 ver（鎖 / latestVer）傳進每個 pass（`ctx.ver`），M1 沒有版本分支。

- [ ] **Step 1: 先釘住 v1 輸出（抽 primitives 之前，P10）**

```ts
// chunkgen.test.ts
it('v1 fill 位元組雜湊固定（陸地 + 海 + 沙灘 + 西側）', () => { const gen = new OuterGen('v1-pin', F); let h = 0x811c9dc5;
  for (const cx of [131, 132, 140, 146, 147, 150, 160, 200, 260, -1, -5, -16, -17, -40, -90]) h = fnv1a(bytes(filled(gen, cx)), h);
  expect(h).toBe(V1_FILL_HASH); });   // 先放 0、跑一次取現值貼上、再跑 PASS
```
然後把 `ColNoise` 等 primitives 從 `legacy/chunkgen/fill.ts` 搬到 `engine/genPrims.ts`、v1 改 import；`V1_FILL_HASH` 與 `V1_SEA_HASH`（Task 3）都必須仍 PASS 才進 Step 2。

- [ ] **Step 2: 寫失敗測試**

```ts
const CXS = [...range(-400, -360), ...range(60, 71), ...range(131, 151)];
it('確定性與順序無關：正序 / 倒序 / 另一實例位元組相同；子範圍分段填 = 整欄', () => {
  const a = new Gen2Source('det'), b = new Gen2Source('det'), fwd = CXS.map((cx) => bytes(fillCol(a, cx)));
  expect([...CXS].reverse().map((cx) => bytes(fillCol(b, cx))).reverse()).toEqual(fwd);
  for (const cx of [-380, 65, 140]) { const parts = new Column(cx, 1200); a.fill(parts, cx * 32, cx * 32 + 11); a.fill(parts, cx * 32 + 11, cx * 32 + 32);
    expect(bytes(parts)).toEqual(bytes(fillCol(a, cx))); } });
it('主坑道：每個非沙灘的陸地地區都有、且從地表走得到洞穴層（P4）', () => {
  const src = new Gen2Source('shaft'); const w = worldOf(src); const s = seedInt('shaft', 'g2-shaft');
  const regs = sampleRegions(src, { home: true, perSide: 3 });
  for (const r of regs.filter((q) => q.variant === VARIANT.BEACH)) expect(shaftX(s, r)).toBeNaN();
  for (const r of regs.filter((q) => q.variant !== VARIANT.BEACH)) {
    const sx = shaftX(s, r), m = Math.min(120, Math.floor((r.x1 - r.x0) / 4));
    expect(Number.isFinite(sx)).toBe(true); expect(sx).toBeGreaterThanOrEqual(r.x0 + m); expect(sx).toBeLessThan(r.x1 - m);
    loadColumns(w, sx - 20, sx + 20);
    expect(bfsReachesDepth(w, sx, src.surfaceAt(sx) - 1, (x) => src.layersAt(x).deep, sx - 20, sx + 20)).toBe(true);
    for (let y = src.surfaceAt(sx); y < src.layersAt(sx).deep; y++) expect(Math.abs(shaftOffset(s, r, y + 1) - shaftOffset(s, r, y))).toBeLessThanOrEqual(1);
  }
});
it('礦在對的層：陸地銅 / 鐵 / 銀 / 金都出現、各在自己的深度帶', () => { const src = new Gen2Source('ore'), seen = new Set<number>();
  for (let cx = 160; cx < 230; cx += 7) { const col = fillCol(src, cx); for (let x = cx * 32; x < cx * 32 + 32; x++) { const L = src.layersAt(x);
    for (let y = 0; y < 1200; y++) { const t = col.fg[li(x, y)]; if (!ORES.has(t)) continue; seen.add(t);
      expect(y).toBeGreaterThanOrEqual(ORE_BAND[t](L)[0]); expect(y).toBeLessThan(ORE_BAND[t](L)[1]); } } }
  expect(seen).toEqual(ORES); });
it('海床與沙灘的沙不會被換成礦（P10）', () => { const src = new Gen2Source('sand'), sea = src.layout.landmass(1, 1);
  for (let x = sea.x0; x < sea.x1; x += 3) { if (src.profile.info(x).kind !== COL_SEA) continue; const col = fillCol(src, x >> 5), s = src.surfaceAt(x);
    for (let y = s; y < s + 3; y++) expect(col.fg[li(x, y)]).toBe(T.SAND); } });
it('靜態液體不變量：海與熔岩格的下方與左右都是實心或液體（水 / 熔岩各自滿格）', () => {
  const w = worldOf(new Gen2Source('liq')); loadColumns(w, 4150, 4200 + 1400);
  expect(liquidInvariant(w, 4150, 4200 + 1400)).toEqual([]);          // 回傳違規格清單
});
it('熔岩表面在 LAVA_Y：LAVA_Y 以下沒有空氣、LAVA_Y 以上沒有熔岩（不會有階梯）', () => { const src = new Gen2Source('lava');
  for (const cx of [20, 70, 140, 190, -50]) { const col = fillCol(src, cx); for (let x = cx * 32; x < cx * 32 + 32; x++) for (let y = 0; y < 1200; y++) {
    if (y >= LAVA_Y) expect(col.fg[li(x, y)] !== T.AIR || col.liquidType[li(x, y)] === LIQ.LAVA).toBe(true);
    else expect(col.liquidType[li(x, y)]).not.toBe(LIQ.LAVA); } } });
it('出生點站得住：腳下實心、上方 2 格空氣、±3 沒有樹幹（P9）', () => { for (const seed of SEEDS5) { const src = new Gen2Source(seed), s = src.surfaceAt(SPAWN_X), col = fillCol(src, SPAWN_X >> 5);
  expect(isSolidTile(col.fg[li(SPAWN_X, s)])).toBe(true);
  expect(col.fg[li(SPAWN_X, s - 1)]).toBe(T.AIR); expect(col.fg[li(SPAWN_X, s - 2)]).toBe(T.AIR);
  for (let x = SPAWN_X - 3; x <= SPAWN_X + 3; x++) for (let y = s - 12; y < s; y++) expect(col.fg[li(x, y)]).not.toBe(T.TREE); } });
it('版本鎖：fill 過的地塊被鎖成 ver 0；recordLocks: false 不鎖', () => {
  const src = new Gen2Source('lk'); fillCol(src, 140);
  expect(src.locks.get(1, 1)).toEqual({ ver: 0, culture: null }); expect(src.locks.get(0, 0)).toBeUndefined();
  const rep = new Gen2Source('lk', { recordLocks: false }); fillCol(rep, 140); expect(rep.locks.toJSON()).toEqual([]);
});
// chunkgen.test.ts (6)：再掃 engine/gen2 底下（遞迴）所有非 .test.ts 的 .ts 與 engine/genPrims.ts，banned regex 不得命中；gen2 檔案數 ≥ 5
// 同一個測試再加：engine/gen2/** 沒有一個檔 import 'legacy/'（expect(hits).toEqual([])）
```
（`fillCol` 填的 cx = 140 在第一道東海，涉及 `(1, 1)`；家鄉 `(0, 0)` 只在填到 [0, 4200) 時才鎖。`range(a, b)`、`SEEDS5`、`ORES = new Set([T.COPPER_ORE, T.IRON_ORE, T.SILVER_ORE, T.GOLD_ORE])`、`ORE_BAND[t](layers) → [yMin, yMax)`（照 v1 的深度帶寫成表）、`isSolidTile` 寫在 `testUtil.ts` 或測試檔內；tile 名稱以 `engine/tiles.ts` 實際名稱為準。）

- [ ] **Step 3: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2 src/scripts/games/delve/engine/legacy/chunkgen`；Expected: gen2 測試 FAIL、`V1_FILL_HASH` / `V1_SEA_HASH` PASS。
- [ ] **Step 4: 實作** `fill.ts`（`Filler2.fill(col, x0, x1, ver)`，import `engine/genPrims.ts`，不 import legacy）、`caves.ts`、`index.ts`（組 Layout / Profile2 / Filler2；`objectsIn` 先回 `[]`，Task 9 接上）。`index.ts` 檔頭註解寫清楚版本閘門慣例。
- [ ] **Step 5: 跑測試** — 同 Step 3；Expected: 全 PASS（含兩個 v1 雜湊）。
- [ ] **Step 6: Commit** — `feat(delve): gen2 fill — shared gen primitives, materials, caves, per-region main shaft, ores, static sea and lava line`（說明 v1 只換 import、雜湊釘住）。

---

### Task 9: 結構藍圖與槽位格；小屋、遺跡

**Files:**
- Create: `engine/gen2/hrng.ts`、`engine/gen2/blueprint.ts`、`engine/gen2/structures/cabin.ts`、`engine/gen2/structures/ruin.ts`
- Modify: `engine/gen2/fill.ts`（蓋藍圖、樹避開外框）、`engine/gen2/index.ts`（`objectsIn`）
- Test: `engine/gen2/blueprint.test.ts`、`engine/gen2/structures.test.ts`

**Interfaces:**
- Produces（`hrng.ts`）：`class HRng { constructor(s: number, id: number); next(): number; int(lo: number, hi: number): number; chance(n: number): boolean }`（`hash2(id, counter++, s)`）。
- Produces（`blueprint.ts`）：
  ```ts
  export type BpKind = 'cabin' | 'ruin' | 'shipwreck' | 'crate' | 'lake' | 'cave_lake' | 'lava_pool';
  export const BP_SURFACE = 0, BP_UNDER = 1, BP_DEEP = 2, LAND_SLOT_W = 340, KEEP = -1;
  export interface Blueprint {
    id: number; kind: BpKind; layer: 0 | 1 | 2; x: number; y: number; w: number; h: number;
    cells: Int32Array;                       // 每格 5 個數：x, y, fg|KEEP, wall|KEEP, liq|KEEP（liq = amount << 8 | type）；依序蓋
    chests: { x: number; y: number; kind: ChestKind }[];
  }
  export interface BpCtx { seed: string; s: number; id: number; slotX0: number; slotX1: number; region: RegionInfo; profile: Profile2; ver: number }
  export function structureId(side: Side, i: number, region: number, slot: number, layer: 0 | 1 | 2): number;
  // 陸地：region = 地區 index、slot = 陸地槽序號；海（P12）：region = 0（海本身）、slot = SeaSlot.k、layer = BP_SURFACE
  export function slotOf(id: number, layout: Layout): { x0: number; x1: number; region: RegionInfo; layer: 0 | 1 | 2 };  // structureId 的反查；陸地槽與海槽都要能反查（Task 11 的藍圖也走這裡）
  export function depthFrac(p: Profile2, x: number, y: number): number;
  export function stamp(col: Column, bp: Blueprint, x0: number, x1: number): void;
  export class BlueprintIndex {
    constructor(seed: string, layout: Layout, profile: Profile2);
    overlapping(x0: number, x1: number): Blueprint[];   // 依 (layer, id) 排序；LRU 256 份
  }
  ```
- Produces（structures）：`buildCabin(c: BpCtx, o?: { force?: boolean }): Blueprint | null`、`buildRuin(c: BpCtx, o?: { force?: boolean }): Blueprint | null`（`force` 時不回 null，P11）。

**槽位規則：** 每個陸地地區（kind `home` / `wild` / `culture`；海與島地區**不進**陸地槽位格，P12）切成寬 `LAND_SLOT_W` 的槽（最後一槽吃餘數）；每槽各層至多一份藍圖，外框必須在 `[slotX0 + 8, slotX1 − 8)` 內（外框寬含小屋兩側坑道；所以只要看與 [x0, x1) 相交的槽）。表層：遺跡 30%、湖 15%（Task 10）、其他空；地下層：小屋 40%、地下湖 15%（Task 10）；深層：熔岩池 20%（Task 10）。含 `shaftX` 的槽表層與地下層都空；家鄉含 `SPAWN_X ± 80` 的槽全空。
**保證槽（裁決 P11）：** 每片**非家鄉**的大陸保證 ≥ 1 間小屋與 ≥ 1 座遺跡。做法：大陸的合格槽（不含 shaftX、地區非 BEACH）依 x 排序，起點 `g = hash2(side, i, s) % 合格槽數`；小屋的保證槽 = 從 g 往後第一個 `buildCabin` 不回 null 的槽、遺跡的保證槽 = 從 g + 1 往後第一個 `buildRuin` 不回 null 的槽（各自在槽內依序試 3 個候選 x：置中、±槽寬 / 4）；全部合格槽都失敗時改用 `force: true` 放在 g 槽（遺跡無視起伏 / 雪原門檻、地基補土整平；小屋無視其他回 null 的條件）。保證槽的那一層不再擲機率；其他槽照上面的機率。家鄉不保證。**小屋**（照舊生成器的形狀、但不用 tileRunner）：寬 9–15、高 6–8，y ∈ [surface + 26, molten − 30]，木板外殼 + 木板牆、兩端 3 格高門洞、兩側各一條 14–30 格長的 3 格高直坑道、工作台、箱子（`'cabin'`）、火把、蜘蛛網、陶罐。**遺跡**：寬 12–18、高 7–9，底 = 寬度內地表平均，起伏 > 5 或雪原就不放（回 null）；石磚殘屋一側坍塌、上方清空、下方補該生態的土、箱子（`'ruin'`）、陶罐。`fill` 在材質 / 洞穴 / 礦 / 液體之後依序 `stamp`，樹根落在任何表層藍圖外框內就不長。`objectsIn(x0, x1)` = 相交藍圖中 x ∈ [x0, x1) 的箱子，內容 `chestLoot(seed, x, y, kind, depthFrac)`，`depthFrac = clamp((y − surface) / (height − surface))`。

- [ ] **Step 1: 寫失敗測試**

```ts
const src = new Gen2Source('bp'), HOME = src.layout.landmassAt(SPAWN_X)!;
const idx = new BlueprintIndex('bp', src.layout, src.profile);
const all = idx.overlapping(-40_000, 40_000);
it('藍圖格都在外框內、外框在槽內；同 id 兩次算出相同藍圖', () => {
  for (const b of all) { for (let k = 0; k < b.cells.length; k += 5) { expect(b.cells[k]).toBeGreaterThanOrEqual(b.x); expect(b.cells[k]).toBeLessThan(b.x + b.w);
    expect(b.cells[k + 1]).toBeGreaterThanOrEqual(b.y); expect(b.cells[k + 1]).toBeLessThan(b.y + b.h); }
    const slot = slotOf(b.id, src.layout); expect(b.x).toBeGreaterThanOrEqual(slot.x0 + 8); expect(b.x + b.w).toBeLessThanOrEqual(slot.x1 - 8); }
  expect(new BlueprintIndex('bp', src.layout, src.profile).overlapping(-40_000, 40_000)).toEqual(all);
});
it('stamp 分段蓋 = 整欄蓋（跨欄藍圖）', () => { const b = all.find((q) => q.x >> 5 !== (q.x + q.w - 1) >> 5)!; const cx = b.x >> 5;
  const whole = fillCol(src, cx), parts = new Column(cx, 1200); src.fill(parts, cx * 32, b.x + 1); src.fill(parts, b.x + 1, cx * 32 + 32);
  expect(bytes(parts)).toEqual(bytes(whole)); });
it('overlapping 回傳所有與範圍相交的藍圖', () => { for (const [a, z] of [[4100, 4300], [-3000, -2900], [2000, 2032]]) expect(idx.overlapping(a, z)).toEqual(all.filter((b) => b.x < z && b.x + b.w > a)); });
it('保證槽（P11）：每片非家鄉大陸 ≥ 1 小屋 + ≥ 1 遺跡（5 個種子、確定）；排除區', () => { for (const seed of SEEDS5) {
  const g = new Gen2Source(seed), bps = new BlueprintIndex(seed, g.layout, g.profile).overlapping(-40_000, 40_000);
  for (const side of [1, -1] as const) for (const i of [2, 4, 6]) { const m = g.layout.landmass(side, i), in_ = bps.filter((b) => b.x >= m.x0 && b.x < m.x1);
    expect(in_.filter((b) => b.kind === 'cabin').length).toBeGreaterThanOrEqual(1); expect(in_.filter((b) => b.kind === 'ruin').length).toBeGreaterThanOrEqual(1); } }
  expect(all.filter((b) => b.x < SPAWN_X + 80 && b.x + b.w > SPAWN_X - 80)).toEqual([]);
  const s = seedInt('bp', 'g2-shaft');
  for (const b of all.filter((q) => q.layer !== BP_DEEP)) { const r = slotOf(b.id, src.layout); const sx = shaftX(s, r.region);
    if (Number.isFinite(sx)) expect(sx >= r.x0 && sx < r.x1).toBe(false); }
  for (const b of all.filter((q) => ['cabin', 'ruin'].includes(q.kind))) expect(['home', 'wild', 'culture']).toContain(slotOf(b.id, src.layout).region.kind); });
it('主坑道在蓋上結構後仍走得到洞穴層', () => { const w = worldOf(src), s = seedInt('bp', 'g2-shaft');
  for (const r of sampleRegions(src, { home: true, perSide: 3 }).filter((q) => q.variant !== VARIANT.BEACH)) { const sx = shaftX(s, r);
    loadColumns(w, sx - 20, sx + 20); expect(bfsReachesDepth(w, sx, src.surfaceAt(sx) - 1, (x) => src.layersAt(x).deep, sx - 20, sx + 20)).toBe(true); } });
it('objectsIn：箱子在箱子 tile 上、內容 = chestLoot', () => { const b = all.find((q) => q.kind === 'cabin')!, c = b.chests[0], col = fillCol(src, c.x >> 5);
  expect(col.fg[li(c.x, c.y)]).toBe(T.CHEST);
  expect(src.objectsIn((c.x >> 5) * 32, (c.x >> 5) * 32 + 32).find((o) => o.x === c.x && o.y === c.y)!.slots).toEqual(chestLoot('bp', c.x, c.y, 'cabin', depthFrac(src.profile, c.x, c.y))); });
it('世界整合：搜刮過的小屋箱子卸載再載入不會被重新填滿；沒搜過的卸載再載入內容相同', () => {
  const w = worldOf(src); const c = all.find((q) => q.kind === 'cabin')!.chests[0], cx = c.x >> 5, k = w.idx(c.x, c.y);
  w.ensureColumn(cx); const orig = structuredClone(w.chests.get(k)!);
  w.chests.get(k)![0] = null; w.touchChest(c.x, c.y); w.unloadColumn(cx); w.ensureColumn(cx);
  expect(w.chests.get(k)![0]).toBeNull();
  const w2 = worldOf(src); w2.ensureColumn(cx); w2.unloadColumn(cx); expect(w2.chests.has(k)).toBe(false); w2.ensureColumn(cx); expect(w2.chests.get(k)).toEqual(orig);
});
```

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。
- [ ] **Step 4: 跑測試** — 同上；Expected: PASS（Task 8 的測試仍綠）。
- [ ] **Step 5: Commit** — `feat(delve): gen2 blueprints and slot grid; cabin and ruin`。

---

### Task 10: 靜態液體藍圖：地表湖、地下湖、熔岩池

**Files:**
- Create: `engine/gen2/structures/lakes.ts`
- Modify: `engine/gen2/blueprint.ts`（槽位表接上三種）
- Test: `engine/gen2/lakes.test.ts`

**Interfaces:**
- Produces: `buildLake(c: BpCtx): Blueprint | null`、`buildCaveLake(c: BpCtx): Blueprint | null`、`buildLavaPool(c: BpCtx): Blueprint | null`。

**形狀規則（生成時就是靜止形狀，不跑 `LiquidSim.settle`）：** 地表湖：寬 20–60、深 6–12；水位 `level = max(surface(x0 − 1), surface(x1))`（y 大 = 低：兩岸都不低於水面）；湖內每欄挖到 `level + depth × 盆形(x)`，`y ≥ level` 的空格滿水，盆底與兩壁 2 格強制成該生態的土（蓋過洞穴）；不平（兩岸差 > 8）就不放。地下湖：橢圓 rx 12–30、ry 6–12，中心 y ∈ [rock + 20, deep − 20]，下 60% 滿水、平頂，外圍 2 格石殼。熔岩池：橢圓 rx 8–20、ry 4–8，中心 y ∈ [molten + 10, LAVA_Y − 14]，下半滿熔岩，外圍 2 格玄武岩殼。

- [ ] **Step 1: 寫失敗測試**

```ts
const src = new Gen2Source('lake'), liq = new BlueprintIndex('lake', src.layout, src.profile).overlapping(-25_000, 25_000).filter((b) => ['lake', 'cave_lake', 'lava_pool'].includes(b.kind));
it('三種液體藍圖都會出現', () => { for (const k of ['lake', 'cave_lake', 'lava_pool']) expect(liq.some((b) => b.kind === k)).toBe(true); });
it('靜態液體不變量：含湖 / 地下湖 / 熔岩池的欄全部通過 liquidInvariant', () => { const w = worldOf(src);
  for (const b of liq.slice(0, 30)) { loadColumns(w, b.x - 4, b.x + b.w + 4); expect(liquidInvariant(w, b.x - 4, b.x + b.w + 4)).toEqual([]); } });
it('喚醒後不動：液體整片喚醒、LiquidSim.step 300 次，液體格不變', () => { const w = worldOf(src), sim = new LiquidSim(w);
  for (const b of liq.slice(0, 8)) { loadColumns(w, b.x - 4, b.x + b.w + 4); const before = snapshotLiquid(w, b); sim.wakeRect(b.x - 2, b.y - 2, b.x + b.w + 2, b.y + b.h + 2);
    for (let k = 0; k < 300; k++) sim.step(); expect(snapshotLiquid(w, b)).toEqual(before); } });
it('每份液體藍圖的水面 / 熔岩面是一條水平線', () => { for (const b of liq) { const tops = new Set<number>();
  for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 4] > 0 && !hasLiquidCellAbove(b, b.cells[k], b.cells[k + 1])) tops.add(b.cells[k + 1]);
  expect(tops.size).toBe(1); } });
```
（`snapshotLiquid(w, b)` = 外框內 liquid / liquidType 的複本、`hasLiquidCellAbove(b, x, y)` = 藍圖在 (x, y − 1) 有液體格；兩者寫在測試檔內。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/lakes.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上，並在槽位表加上三種的機率。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: PASS。
- [ ] **Step 5: Commit** — `feat(delve): gen2 static liquids — lakes, cave lakes, lava pools as still shapes`。

---

### Task 11: 海上點位：島、沉船、漂流箱

**Files:**
- Create: `engine/gen2/structures/shipwreck.ts`、`engine/gen2/structures/crate.ts`
- Modify: `engine/gen2/blueprint.ts`（海的槽位：`SeaSlot.poi` → 藍圖；`BlueprintIndex` 走海槽，id 用 Task 9 的海槽 `structureId`，`slotOf` 反查海槽）、`engine/gen2/fill.ts`（島的表層與樹——本 Task 是島地形的唯一擁有者，裁決 P12）
- Test: `engine/gen2/sea.test.ts`

**Interfaces:**
- Consumes: `SeaSlot`、`IslandInfo`、海 / 島 `RegionInfo`（Task 6）；海槽版 `structureId` / `slotOf`（Task 9）；`plantTree`（`engine/genPrims.ts`）。
- Produces: `buildShipwreck(c: BpCtx): Blueprint`、`buildCrate(c: BpCtx): Blueprint`（`BpCtx.slotX0/slotX1` 用海槽的範圍、`region` = 海本身）。

**規則：** 島 = Profile2 的島欄形狀（Task 7）+ 本 Task 填的表層：離水 4 格內沙灘沙、其餘台地草 + 泥、照森林規則用 `plantTree` 長樹（Task 8 對島欄只填底層）。沉船：寬 18–26、半埋在海床（船底在海床下 2 格），船殼 `T.PLANKS` + `T.BEAM` 桅杆殘段、牆 `W.DARK_PLANK_WALL`，船內格保留水（liq = KEEP），一個箱子（M1 用 `'ruin'` 戰利品）；置中於槽 ± `floor(槽寬 / 10)`。漂流箱：水面上一列 3 格 `T.PLANKS`（y = waterTop − 1）+ 上面一個箱子（`'cabin'` 戰利品，M1 沿用；專用「少量物資」表留 M2）。珊瑚礁、海底遺跡、燈塔 / 隱士 / 沉船島三種有建物的島留 M2（spec §9 M2「島種類」）。

- [ ] **Step 1: 寫失敗測試**

```ts
it('每道海的每個槽恰有一個點', () => { for (const seed of SEEDS5) { const src = new Gen2Source(seed), idx = new BlueprintIndex(seed, src.layout, src.profile);
  for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7]) { const sea = src.layout.landmass(side, i);
    for (const s of sea.slots) { const bps = idx.overlapping(s.x0, s.x1).filter((b) => b.x >= s.x0 && b.x < s.x1);
      if (s.poi === 'island') { expect(bps).toEqual([]); expect(sea.islands.some((d) => d.slot === s.k)).toBe(true); }
      else { expect(bps).toHaveLength(1); expect(bps[0].kind).toBe(s.poi); } } } } });
it('沉船在水面下、有箱子；漂流箱的木板在 waterTop − 1、箱子在 waterTop − 2', () => { const src = new Gen2Source('wreck'), bps = new BlueprintIndex('wreck', src.layout, src.profile).overlapping(-40_000, 40_000);
  const sw = bps.find((b) => b.kind === 'shipwreck')!, wt = src.waterTopAt(sw.x)!;
  expect(sw.y).toBeGreaterThan(wt); expect(sw.chests).toHaveLength(1); expect(slotOf(sw.id, src.layout).region.kind).toBe('sea');
  const cr = bps.find((b) => b.kind === 'crate')!, c = cr.chests[0], top = src.waterTopAt(c.x)!, col = fillCol(src, c.x >> 5);
  expect(c.y).toBe(top - 2); expect(col.fg[li(c.x, top - 2)]).toBe(T.CHEST);
  expect([-1, 0, 1].map((d) => col.fg[li(c.x + d, top - 1)])).toEqual([T.PLANKS, T.PLANKS, T.PLANKS]); });
it('海上的靜態液體不變量（含沉船與漂流箱的欄）', () => { const src = new Gen2Source('sea'), w = worldOf(src), sea = src.layout.landmass(1, 1);
  loadColumns(w, sea.x0, sea.x1); expect(liquidInvariant(w, sea.x0, sea.x1)).toEqual([]); });
it('島：台地在水面上、表層有草或沙、regionAt.kind = island；多數島有樹', () => { const src = new Gen2Source('isl'); let treed = 0, n = 0;
  for (const i of [1, 3, 5]) for (const d of src.layout.landmass(1, i).islands) { n++; const x = (d.x0 + d.x1) >> 1, col = fillCol(src, x >> 5);
    expect(src.waterTopAt(x)).toBeNull(); expect(src.surfaceAt(x)).toBeLessThan(SEA_Y);
    expect([T.GRASS, T.SAND]).toContain(col.fg[li(x, src.surfaceAt(x))]); expect(src.regionAt(x).kind).toBe('island');
    const w = worldOf(src); loadColumns(w, d.x0, d.x1); if (rangeHas(w, d.x0, d.x1, T.TREE)) treed++; }
  expect(treed).toBeGreaterThan(n / 2); });
it('slotOf 反查海槽（P12）', () => { const src = new Gen2Source('sid'), bps = new BlueprintIndex('sid', src.layout, src.profile).overlapping(4200, 4200 + 3000);
  for (const b of bps.filter((q) => q.kind === 'shipwreck' || q.kind === 'crate')) { const s = slotOf(b.id, src.layout);
    expect(s.region.kind).toBe('sea'); expect(b.x).toBeGreaterThanOrEqual(s.x0); expect(b.x + b.w).toBeLessThanOrEqual(s.x1); } });
```
（漂流箱的箱子在三格木板的中間；`rangeHas(w, x0, x1, tile)` = 範圍內地表以上有沒有該 tile，寫在測試檔內。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/sea.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine/gen2`；Expected: PASS。
- [ ] **Step 5: Commit** — `feat(delve): gen2 sea points — islands, shipwrecks, floating crates`。

---

### Task 12: gen2 版本雜湊鎖與效能測試

**Files:**
- Create: `engine/gen2/gen2.lock.test.ts`、`engine/gen2/gen2.perf.test.ts`

**Interfaces:**
- Consumes: `Gen2Source`（`latestVer` 選項）、`OuterGen`（v1，當效能分母）、`fnv1a`（`net/codec`）。

- [ ] **Step 1: 寫雜湊鎖測試**

```ts
// 每個 gen2 版本的固定種子輸出：發佈後不得再變。M1 期間 GEN2_VERSION = 0 尚未發佈，可以重錄；M2 把 GEN2_VERSION 改成 1 時一併重錄並從此凍結。
const GEN2_HASHES: Record<number, number> = { 0: 0 /* 跑一次取值 */ };
const COLS = [-300, -40, -8, -1, 0, 30, 65, 100, 131, 132, 140, 160, 220, 400];
for (let v = GEN2_MIN_VERSION; v <= GEN2_VERSION; v++) it(`gen2 v${v} 區塊雜湊`, () => {
  const src = new Gen2Source('gen2-lock', { latestVer: v });
  let h = 0x811c9dc5; for (const cx of COLS) h = fnv1a(bytes(fillCol(src, cx)), h);
  expect(h).toBe(GEN2_HASHES[v]);
});
it('每個版本都有雜湊', () => { for (let v = GEN2_MIN_VERSION; v <= GEN2_VERSION; v++) expect(GEN2_HASHES[v]).toBeTypeOf('number'); });
```

- [ ] **Step 2: 跑一次取得雜湊、貼上，再跑確認 PASS** — Run: `npx vitest run src/scripts/games/delve/engine/gen2/gen2.lock.test.ts`。
- [ ] **Step 3: 寫效能測試（寬鬆門檻、輸出實際比值）**

```ts
it('每欄 fill：中位數 ≤ 3 × v1（負載容忍；spec 的 2× 由 Step 4 實測把關）、最壞 ≤ 40 ms（38 個 chunk 一欄 → 每 chunk 遠低於 8 ms）', () => {
  const v1 = new OuterGen('perf', F), g2 = new Gen2Source('perf');
  const time = (src: ColumnSource, cxs: number[]) => { for (const cx of cxs.slice(0, 10)) fillCol(src, cx);   // 暖機
    return cxs.map((cx) => { const t0 = performance.now(); fillCol(src, cx); return performance.now() - t0; }).sort((a, b) => a - b); };
  const t1 = time(v1, range(160, 200)), t2 = time(g2, [...range(160, 200), ...range(20, 60)]);
  const m1 = t1[t1.length >> 1], m2 = t2[t2.length >> 1], worst = t2.at(-1)!;
  console.info('[gen2 perf] median ratio', (m2 / m1).toFixed(2), 'worst ms', worst.toFixed(2));
  expect(m2).toBeLessThanOrEqual(3 * m1); expect(worst).toBeLessThanOrEqual(40);
});
```

- [ ] **Step 4: 閒置機器實測（裁決 P5，有約束力）** — 關掉 dev server 與其他重負載後 Run: `npx vitest run src/scripts/games/delve/engine/gen2/gen2.perf.test.ts` 三次；取三次 `median ratio` 的中位數，連同機器狀態寫進 Task 報告與 commit 說明。**該值必須 ≤ 2.00、`worst ms` 換算每 chunk ≤ 8 ms，否則 Task 12 判定失敗**：先查 `Profile2` 快取命中與藍圖 LRU、改到達標，不能只回報了事。（自動測試的 3× 只是避免 CI / 忙碌機器誤判。）
- [ ] **Step 5: Commit** — `test(delve): gen2 per-version chunk hash lock and perf budget`。

---

### Task 13: DelveGame 的世界開機（legacy / gen2）、傳送碑抽象

**Files:**
- Create: `engine/worldBoot.ts`
- Modify: `engine/game.ts:97-115`（`DelveOptions.worldGen`）、`:524-540`（`dungeonZone` / `layers` 可為 null、`genVersion`、`genKind`）、`:810-899`（建構子改吃 `WorldContent`）、`:832`（傳送碑用 `surfaceAt`）；`engine/waystones.ts`（`LandQuery`）；`engine/constants.ts`（`GEN_VERSION_V2 = 8`）；`engine/discovery.ts`（裁決 P2：`setOuter` 改吃回傳陣列的函式、`outerRegions` 包成陣列；`visit` 逐一處理陣列——從 Task 14 移來，讓本 Task 單獨就能編譯）；`engine/game.ts` 的 `outerRegion` 型別
- Test: `engine/game.gen2.test.ts`（新）、`engine/waystones.test.ts`、`engine/discovery.test.ts`

**Interfaces:**
- Consumes: `Gen2Source`（Task 8–11）。
- Produces（`worldBoot.ts`）：
  ```ts
  export type WorldGenSpec = { kind: 'legacy' } | { kind: 'gen2'; locks?: LockJSON };   // Task 16 加 'baked'
  export interface WorldContent {
    world: World; spawn: { x: number; y: number }; biomes: BiomeSegment[]; structures: Structure[]; landforms: Landform[];
    dungeonZone: ReservedZone | null; layers: GenLayers | null; dungeon: DungeonInfo | null;
    tablets: { x: number; y: number; id: number }[]; relics: GenResult['relics']; springs: SpringSpec[];
    villages: VillageInfo[]; halls: HallInfo[]; landmarks: LandmarkInfo[];
    regions: Region[] | null;                                   // null = 建構子照舊 buildRegions
    outer: ((x: number, y: number) => Region[]) | null;        // 外圍 / gen2 地區查詢（本 Task：legacy = 包成陣列的 outerRegions、gen2 = null；Task 14 接 gen2）
    land: LandQuery | null;                                     // 傳送碑
  }
  export function bootLegacy(seed: string, gen: GenResult, opts: { bounds: WorldBounds; source: ColumnSource | null }): WorldContent;
  export function bootGen2(seed: string, spec: Extract<WorldGenSpec, { kind: 'gen2' }>, replica: boolean): WorldContent;
  ```
- Produces（`game.ts`）：`DelveOptions.worldGen?: WorldGenSpec`；`readonly genVersion: number`（legacy = `GEN_VERSION` 7、其他 = `GEN_VERSION_V2` 8）；`readonly genKind: 'legacy' | 'gen2' | 'baked'`；`gen2(): Gen2Source | null`（gen2 世界 = world.source；烘焙世界 = `BakedSource.gen2`；舊世界 null）。
- Produces（`waystones.ts`）：`interface LandQuery { width: number; isLand(x: number): boolean; surfaceAt(x: number): number }`；`v1LandQuery(p: OuterProfile): LandQuery`（`isLand = zoneAt(x).kind === 'land'`）；`gen2LandQuery(src: Gen2Source): LandQuery`（`regionAt(x).kind` 是 `wild` / `culture`）。`Waystones` 建構子第三參數改吃 `LandQuery | null`；演算法不變。
- Produces（`discovery.ts`，P2）：`Discovery.setOuter(fn: ((x: number, y: number) => Region[]) | null): void`；`outerRegions(seed, profile)` 改回傳 `(x, y) => Region[]`（0 或 1 個，id / 名字不變）。Task 14 在這之上加 `gen2Regions`。

`bootGen2`：`new World(4200, 1200, { bounds: 'infinite', source, central: 'source' })`，`source = new Gen2Source(seed, { locks: LockTable.fromJSON(spec.locks ?? [], { frozen: replica }), recordLocks: !replica })`；`spawn = { x: SPAWN_X, y: source.surfaceAt(SPAWN_X) − 1 }`；`world.surfaceY = SEA_Y + 30`、`rockY = SEA_Y + 60`、`cavernY = CAVERN_BASE − 16`、`moltenY = MOLTEN_BASE − 12`；其餘內容空陣列 / null、`regions: []`。gen2 世界要求正式尺寸：`opts.width` / `opts.height` 有給且不是 4200 / 1200 → 丟 RangeError。

- [ ] **Step 1: 寫失敗測試**

```ts
it('預設仍是舊世界：genVersion 7、genKind legacy', () => { const g = new DelveGame({ seed: 'd', width: 160, height: 100 }); expect(g.genVersion).toBe(7); expect(g.genKind).toBe('legacy'); });
it('gen2 世界：不建中央、只載入出生點附近、站在地上、genVersion 8', () => {
  const t0 = performance.now(); const g = new DelveGame({ seed: 'g2', worldGen: { kind: 'gen2' } });
  expect(performance.now() - t0).toBeLessThan(1500);
  expect(g.genVersion).toBe(8); expect(g.genKind).toBe('gen2');
  expect(g.spawn.x).toBe(2100); expect(g.world.isSolid(2100, g.spawn.y + 1)).toBe(true);
  expect(g.world.isResident(0)).toBe(false); expect(g.world.residentColumns().length).toBeLessThanOrEqual(2 * 8 + 1);
  for (let k = 0; k < 120; k++) g.step(FIXED_DT);
  expect(g.world.regionAt(2100).kind).toBe('home');
  g.teleport(4200 + 100, SEA_Y - 2); g.step(FIXED_DT); expect(g.world.biomeAt(4300)).toBe(BIOME.OCEAN);
});
it('gen2 世界只接受正式尺寸', () => { expect(() => new DelveGame({ seed: 'x', width: 200, height: 100, worldGen: { kind: 'gen2' } })).toThrow(RangeError); });
// waystones.test.ts
it('改成 LandQuery 後舊世界碑位置不變；gen2 碑落在大陸', () => { const g = new DelveGame({ seed: 'ws' });
  expect([1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5, -6].map((id) => { const s = g.waystones.byId(id)!; return [s.x, s.y]; })).toEqual(WS_BEFORE);   // 改寫前跑一次錄下
  const g2 = new DelveGame({ seed: 'ws', worldGen: { kind: 'gen2' } });
  for (const id of [1, -1, 2, -2]) expect(['wild', 'culture']).toContain(g2.world.regionAt(g2.waystones.byId(id)!.x).kind); });
// discovery.test.ts（P2，從 Task 14 移來）
it('outerRegions 包成陣列後 id / 名字不變', () => { const f = outerRegions('od', profile);
  expect([4210, 4800, 6000, -10, -900].map((x) => f(x, 300).map((r) => [r.id, r.name]))).toEqual(OUTER_BEFORE);   // 改寫前錄下（單一 Region → [[id, name]]、null → []）
  const d = new Discovery([]); d.setOuter(f); expect(d.visit(4800, 300).map((r) => r.id)).toEqual(OUTER_BEFORE[1].map(([id]) => id)); });
```

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/game.gen2.test.ts src/scripts/games/delve/engine/waystones.test.ts src/scripts/games/delve/engine/discovery.test.ts`；Expected: FAIL（`WS_BEFORE` / `OUTER_BEFORE` 要在改碼前先錄、先 PASS）。
- [ ] **Step 3: 實作** — 建構子 821-871 的「生成 → 欄位」搬進 `bootLegacy`（行為逐行不變），`DelveGame` 只讀 `WorldContent`；`worldGen.kind === 'gen2'` 走 `bootGen2`、完全不 import / 呼叫 `generateWorld`；`stoneX` 的 y 改 `this.world.surfaceAt(stoneX) − 1`（舊世界值相同）。
- [ ] **Step 4: 跑測試** — 同 Step 2，再跑 `npx vitest run src/scripts/games/delve`；Expected: 全綠。
- [ ] **Step 5: Commit** — `feat(delve): world boot for legacy and gen2 worlds; waystones take a land query`。

---

### Task 14: gen2 地區的發現與命名

**Files:**
- Modify: `engine/discovery.ts`（`NAMES` 加 `sea` / `island` / `shipwreck`；`load` 接受 gen2 id；新增 `gen2Regions`）、`engine/worldBoot.ts`（`bootGen2.outer`）
- Test: `engine/discovery.test.ts`

**Interfaces:**
- Consumes: 陣列版 `Discovery.setOuter` 與 `outerRegions`（Task 13，P2）；Cabin 藍圖（Task 9）；海 / 島 RegionInfo（Task 6）。
- Produces：`GEN2_REGION_BASE = 2 ** 32`；`gen2RegionId(side: Side, i: number, index: number, sub: number): number` = `BASE + (((i × 2 + (side < 0 ? 1 : 0)) × 64 + index) × 64 + sub)`（sub 0 = 地區本身、1.. = 槽位結構 `slot × 3 + layer + 1`）；`isGen2RegionId(id: number): boolean`（`BASE ≤ id < BASE + 2 ** 26`、整數）；`gen2Regions(seed: string, src: Gen2Source): (x: number, y: number) => Region[]`（先結構、後地區）。
- 命名：家鄉出生森林「家鄉林地」、兩端「西岸沙灘」/「東岸沙灘」、其他照 `NAMES[生態]`；每側第一道 gen2 海「東方大海」/「西方大海」、之後「東境・」/「西境・」+ `NAMES.sea`；島 `NAMES.island`；荒野地區「東境・」/「西境・」+ `NAMES[生態]`；霧竹地區 `CULTURES.mistbamboo.prefixes[h] + suffixes[h]`（例：「雲隱山」「白霧谷」「竹之里」）；小屋 / 遺跡沿用 `NAMES.cabin` / `NAMES.ruin`，沉船 `NAMES.shipwreck`。範圍：地區 = 欄範圍、y < deep(x)；結構 = 外框（`rectHit`）。

- [ ] **Step 1: 寫失敗測試**

```ts
const src = new Gen2Source('rg'), q = gen2Regions('rg', src), q2 = gen2Regions('rg', new Gen2Source('rg'));
it('gen2 地區 id 唯一、在 gen2 範圍內、跨實例穩定；名字確定', () => { const seen = new Map<number, string>();
  for (let x = -30_000; x < 30_000; x += 53) for (const r of q(x, 300)) { expect(isGen2RegionId(r.id)).toBe(true); expect(isOuterRegionId(r.id)).toBe(false);
    if (seen.has(r.id)) expect(seen.get(r.id)).toBe(r.name); else seen.set(r.id, r.name); }
  for (let x = -30_000; x < 30_000; x += 977) expect(q2(x, 300).map((r) => [r.id, r.name])).toEqual(q(x, 300).map((r) => [r.id, r.name]));
  expect(q(SPAWN_X, 300)[0].name).toBe('家鄉林地'); expect(q(5, 300)[0].name).toBe('西岸沙灘'); });
it('在淺層小屋裡 visit：先回小屋、再回所在地區；再 visit 不重複', () => { const cab = shallowCabin(src), d = new Discovery([]); d.setOuter(q);
  const got = d.visit(cab.x + 1, cab.y + 1); expect(got).toHaveLength(2); expect(got[0].kind).toBe('cabin'); expect(got[1].cat).toBe('land');
  expect(d.visit(cab.x + 1, cab.y + 1)).toEqual([]); });
it('load 接受 gen2 id、丟掉亂數 id', () => { const d = new Discovery([]); d.load({ regions: [gen2RegionId(1, 2, 0, 0), 12345678901] } as never); expect([...d.found]).toEqual([gen2RegionId(1, 2, 0, 0)]); });
it('霧竹大陸的地區名用霧竹命名池', () => { const m = [src.layout.landmass(1, 2), src.layout.landmass(-1, 2)].find((l) => l.culture === 'mistbamboo')!;
  for (const r of m.regions) { const n = q(r.x0 + 5, 300).at(-1)!.name; expect(CULTURES.mistbamboo.suffixes.some((s) => n.endsWith(s))).toBe(true); } });
it('海與島的名字', () => { expect(q(4300, 300).at(-1)!.name).toBe('東方大海'); expect(q(-300, 300).at(-1)!.name).toBe('西方大海');
  const d = src.layout.landmass(1, 1).islands[0]; expect(q((d.x0 + d.x1) >> 1, 300).at(-1)!.name).toBe(NAMES.island); });
```
（`shallowCabin(src)` = 依 x 排序的第一份 cabin 藍圖中，整個外框都在地區範圍內（`b.y + b.h ≤ min(deep(x))`，x ∈ [b.x, b.x + b.w)）的那一份的外框，寫在測試檔內（裁決 P14：深層小屋在 `deep` 以下、只會回 1 個 region）。「舊世界外圍地區照舊」的測試已移到 Task 13。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/engine/discovery.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/engine`；Expected: 全綠。
- [ ] **Step 5: Commit** — `feat(delve): gen2 region discovery and naming`。

---

### Task 15: 存檔：genVersion 8、版本鎖持久化、讀檔版本比對

**Files:**
- Create: `save/genCheck.ts`
- Modify: `save/serialize.ts:160-225`（`SaveHeader.gen2`）、`:473-560`（`snapshotGame` 寫實際版本）、`:690-694`、`:786-797`、`:946-962`（`restoreBlocker` 改用 `genBlocker`）、`:1049-1052`（`restoreGame` 傳 `worldGen`）；`save/worldSave.ts`（`WorldHeader.gen2`、`splitSnapshot` / `joinSplit` / `decodeWorld` 帶與驗證）；`save/split.ts:21-24,207-237`（`importWorld` 用 `genBlocker`、`restoreErrorMessage` 較新版訊息）
- Test: `save/serialize.gen2.test.ts`（新）、`save/split.test.ts`

**Interfaces:**
- Consumes: `DelveGame.genVersion / genKind / gen2()`（Task 13）、`LockTable.toJSON / fromJSON`（Task 6）。
- Produces：
  ```ts
  // serialize.ts
  export interface Gen2Save { locks: LockJSON }                       // Task 16 加 bake / legacy
  // SaveHeader / WorldHeader 加 gen2?: Gen2Save（genVersion 8 必有，7 必無）
  export function validGen2(v: unknown): Gen2Save | undefined;        // 壞了 = SaveFormatError
  // genCheck.ts
  export type GenBlock = { error: 'gen_version'; saveGenVersion: number; newer: boolean; message: string };
  export function genBlocker(h: { format: number; genVersion: number; outerGen?: number; bounds?: 'infinite'; gen2?: Gen2Save }, opts?: { allowGenMismatch?: boolean }): GenBlock | null;
  // split.ts
  export const newerGeneratorMsg: string;  // '這個世界是用較新版本的地圖產生器做的，請重新整理頁面更新遊戲後再讀取。'
  ```
- `genBlocker` 規則：`genVersion 7` → `outerGen` 必須是 undefined 或 `OUTER_GEN_VERSION`（1）；`genVersion 8` → `bounds === 'infinite'`、`outerGen ∈ [GEN2_MIN_VERSION, GEN2_VERSION]`、每個鎖的 ver 也在範圍內，大於上限 → `newer: true`；其他版本 → 沿用現行 `COMPAT_GEN` 遷移與 `allowGenMismatch`。`RestoreResult` 的 `gen_version` 錯誤加選填 `newer`，`restoreErrorMessage` 依它選訊息。

- [ ] **Step 1: 寫失敗測試**

```ts
it('gen2 世界存讀往返：genVersion 8、outerGen = GEN2_VERSION、鎖、改過的 chunk、搜刮過的結構箱子都保留；沒改過的 chunk 重算相同', () => {
  const g = new DelveGame({ seed: 'sv', worldGen: { kind: 'gen2' } });
  const cab = new BlueprintIndex('sv', g.gen2()!.layout, g.gen2()!.profile).overlapping(4200, 40_000).find((b) => b.kind === 'cabin')!, c = cab.chests[0];
  g.teleport(c.x, c.y - 1); g.step(FIXED_DT); const k = g.world.idx(c.x, c.y);
  g.world.chests.get(k)![0] = null; g.world.touchChest(c.x, c.y); g.world.setFg(c.x + 2, c.y, T.AIR); g.world.touch(c.x + 2, c.y);
  const data = decodeSave(encodeSave(snapshotGame(g, 1)));
  expect(data.header.genVersion).toBe(8); expect(data.header.outerGen).toBe(GEN2_VERSION);
  expect(data.header.gen2!.locks).toEqual(g.gen2()!.locks.toJSON());
  const r = restoreGame(data); expect(r.ok).toBe(true); const h = (r as RestoreOk).game;
  expect(h.genKind).toBe('gen2'); h.world.ensureColumn(c.x >> 5);
  expect(h.world.getFg(c.x + 2, c.y)).toBe(T.AIR); expect(h.world.chests.get(k)![0]).toBeNull();
  for (const cy of [8, 10, 12]) expect(h.world.readChunk(SPAWN_X >> 5, cy)).toEqual(g.world.readChunk(SPAWN_X >> 5, cy));
});
it('舊世界 v7 的存檔位元組不變（沒有 gen2 欄位、genVersion 7）', () => { const g = new DelveGame({ seed: 'v7', width: 160, height: 100 }), h = snapshotGame(g, 1).header;
  expect(h.genVersion).toBe(7); expect('gen2' in h).toBe(false); expect(fnv1a(encodeSave(snapshotGame(g, 1)), 0x811c9dc5)).toBe(V7_SAVE_HASH); });   // 改動前跑一次錄下
it('genBlocker 真值表', () => { const ok8 = { format: 9, genVersion: 8, outerGen: 0, bounds: 'infinite' as const, gen2: { locks: [] } };
  expect(genBlocker({ format: 9, genVersion: 7, outerGen: 2, bounds: 'infinite' })).toMatchObject({ error: 'gen_version', newer: false });
  expect(genBlocker({ format: 9, genVersion: 7, outerGen: 1, bounds: 'infinite' })).toBeNull();
  expect(genBlocker({ format: 9, genVersion: 7 })).toBeNull();
  expect(genBlocker({ ...ok8, outerGen: 1 })).toMatchObject({ newer: true });
  expect(genBlocker({ ...ok8, gen2: { locks: [[1, 1, 99, null]] } })).toMatchObject({ newer: true });
  expect(genBlocker(ok8)).toBeNull(); expect(genBlocker({ ...ok8, bounds: undefined })).not.toBeNull();
  expect(genBlocker({ format: 5, genVersion: COMPAT_GEN[0] })).toBeNull(); expect(genBlocker({ format: 9, genVersion: 6 })).toMatchObject({ newer: false });
  expect(() => validGen2({ locks: 'x' })).toThrow(SaveFormatError); });
it('restoreErrorMessage：newer → newerGeneratorMsg；舊版 → oldGeneratorMsg', () => {
  expect(restoreErrorMessage({ error: 'gen_version', saveGenVersion: 8, newer: true })).toBe(newerGeneratorMsg);
  expect(restoreErrorMessage({ error: 'gen_version', saveGenVersion: 6 })).toBe(oldGeneratorMsg(6)); });
it('importWorld 接受 v8 世界檔、拒絕較新版本', async () => { const store = fakeSplitStore();
  expect(await importWorld(store, gen2WorldBytes, 1)).toHaveProperty('slot');
  expect(await importWorld(store, gen2WorldBytesWith({ outerGen: 5 }), 1)).toEqual({ error: newerGeneratorMsg }); });
it('世界檔（format 11）的 gen2 欄位經 splitSnapshot / decodeWorld / joinSplit 往返不變', () => { const g = gen2Game();
  const want = snapshotGame(g, 1).header.gen2!, { world, character } = saveSplitGame(g, 1);
  const back = decodeWorld(encodeWorld(world)); expect(back.header.gen2).toEqual(want);
  expect(joinSplit(back, character).header.gen2).toEqual(want); expect(back.header.genVersion).toBe(8); });
```
（`V7_SAVE_HASH` 在改 `snapshotGame` 之前跑一次錄下（`fnv1a` 從 `net/codec`，P9：不貼整串位元組）；`gen2Game()` = 一個已走動、有鎖的 gen2 遊戲；`saveSplitGame` 的回傳形狀、`decodeSave` / `RestoreOk` / `setFg` / `touch` 的確切名稱以 `save/` 與 `engine/world.ts` 實際為準；`fakeSplitStore` 用 `split.test.ts` 既有的假 store；`gen2WorldBytes(With)` = 一個 gen2 遊戲經 `saveSplitGame` + `encodeWorld`，With 版本改寫 header 欄位後再編碼。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/save`；Expected: FAIL。
- [ ] **Step 3: 實作** — `snapshotGame`：`genVersion: game.genVersion`、`outerGen: w.source ? w.source.version : 0`（舊世界照舊）、`genKind !== 'legacy'` 時加 `gen2: { locks }`（B6：舊世界不寫新欄位）。`restoreGame`：`genVersion 8` 時 `worldGen = { kind: 'gen2', locks: h.gen2.locks }`、不傳 `gen`。`restoreBlocker` 的版本段落改呼叫 `genBlocker`，其餘檢查不動。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/save src/scripts/games/delve/net`；Expected: 全綠。
- [ ] **Step 5: Commit** — `feat(delve): genVersion 8 saves, per-landmass locks, generator version checks on load`。

---

### Task 16: 舊世界烘焙升級（旗標後面）

**Files:**
- Create: `save/legacyMeta.ts`、`save/bake.ts`、`engine/bakedSource.ts`
- Modify: `engine/worldBoot.ts`（`WorldGenSpec` 加 `'baked'`、`bootBaked`）、`engine/discovery.ts`（`Region.shape` 與 `regionFromJSON`）、`engine/world.ts`（`bakedQuiet`）、`engine/game.ts`（`seamWake` / `columnEvents` 跳過安靜 chunk）、`save/serialize.ts`（`Gen2Save.bake / legacy`、`encodeDeltas` 匯出、`restoreGame` 喚醒跳過安靜 chunk）、`save/worldSave.ts`、`save/split.ts`（`V7_BACKUP_SUFFIX = '.v7.bak'`）
- Test: `save/bake.test.ts`、`save/legacyMeta.test.ts`、`engine/discovery.test.ts`

**Interfaces:**
- Consumes: `restoreSplit`、`splitSnapshot`、`snapshotGame`、`OuterGen` / `OuterProfile`（v1）、`Gen2Source`、`Layout`、`SideOrigin`；`FIXTURE11_EDITS`（Task 1）；`worldOf` / `loadColumns` / `liquidInvariant`（`engine/gen2/testUtil.ts`）。
- Produces：
  ```ts
  // save/bake.ts
  export interface BakeInfo { east: SideOrigin; west: SideOrigin; frame: CentralFrame; quiet: number[] /* 差分編碼的 chunk 鍵 */ }
  export function bakeApplies(h: { genVersion: number; width: number; height: number }): boolean;   // genVersion 7 且 4200×1200
  export function farthestKnown(h: WorldHeader, p: OuterProfile, stones: Waystones): { east: number; west: number };
  export function legacyRange(h: WorldHeader, p: OuterProfile, stones: Waystones): { east: SideOrigin; west: SideOrigin };
  export type BakeStage = 'restore' | 'snapshot' | 'meta' | 'split';
  export function bakeWorld(world: WorldData, character: DelveCharacter, gen: GenResult, now: number, onStage?: (s: BakeStage) => void): WorldData;
  // 純函式：不改 world / character（測試以 structuredClone 前後比對）；onStage 在每段開始前呼叫，給失敗注入用（裁決 P7）
  // save/legacyMeta.ts
  export interface LegacyMeta { frame: CentralFrame; surfaceY: number; rockY: number; cavernY: number; moltenY: number;
    surface: Int16Array; biome: Uint8Array; layers: GenLayers; spawn: { x: number; y: number };
    biomes: BiomeSegment[]; structures: Structure[]; landforms: Landform[]; dungeonZone: ReservedZone; dungeon: DungeonInfo | null;
    tablets: GenResult['tablets']; relics: GenResult['relics']; springs: SpringSpec[]; villages: VillageInfo[]; halls: HallInfo[];
    landmarks: LandmarkInfo[]; potDrops: [number, Drop[]][]; regions: RegionJSON[] }
  export type LegacyMetaJSON = /* 同上，typed array 換成 base64 字串 */;
  export function encodeLegacyMeta(game: DelveGame): LegacyMetaJSON;   // 舊世界遊戲 → JSON
  export function decodeLegacyMeta(v: unknown): LegacyMeta;            // 壞了 = SaveFormatError
  // engine/bakedSource.ts
  export class BakedSource implements ColumnSource {   // version = GEN2_VERSION
    constructor(seed: string, meta: LegacyMeta, bake: BakeInfo, locks: LockTable, recordLocks: boolean);
    readonly gen2: Gen2Source; readonly v1: OuterGen;
    // x ∈ [0, width)：fill 不寫（停放的烘焙 chunk 一定蓋上）、每欄資料讀 meta；[west.x, 0) ∪ [width, east.x)：v1 OuterGen；其他：Gen2Source（origin = bake.east / west、home = null）
  }
  // engine/discovery.ts
  export type RegionShape = { t: 'rect' } | { t: 'ellipse' } | { t: 'cols'; top: 'zero' | 'rock' | 'deep' | 'molten'; bot: 'deep' | 'molten' | 'H' };
  // Region 加選填 shape（buildRegions 填）；RegionJSON = Region 去掉 contains、加 shape；toRegionJSON(r: Region): RegionJSON；regionFromJSON(j, layers, H): Region
  // engine/world.ts
  readonly bakedQuiet: Set<number>;   // 烘焙後沒被碰過的中央 chunk；touch / touchLiquidAt / touchChest / markModified / writeChunk(journal) 會刪鍵
  ```
- `WorldGenSpec` 加 `{ kind: 'baked'; locks?: LockJSON; bake: BakeInfo; meta: LegacyMeta }`；`Gen2Save` 加 `bake?: BakeInfo; legacy?: LegacyMetaJSON`（兩者同時有 = 烘焙世界）。

**烘焙步驟（spec §5 步驟 1–6 對照）：**
1. 備份：不在烘焙時寫任何東西；session 讀到烘焙結果後設 `pendingBackup = V7_BACKUP_SUFFIX`，第一次 `saveSplit` 先 `backupSlot(slot, slot + '.v7.bak')` 成功才寫（沿用 v10 的機制）。
2. 用舊生成器重建：`restoreSplit(world, character, { gen })` 得到舊世界遊戲 L；把中央所有 chunk 標成 `modifiedChunks` + `liquidModified`；`snapshotGame(L)`；`header.chests` 因此含全部中央箱子；附帶資料 → `encodeLegacyMeta(L)`。
3. 舊外圍：`legacyRange` 取「已知最遠點」——世界檔與每個 visit 裡的外圍 chunk 鍵（`chunks`、`liquids.chunks`）的欄範圍、外圍迷霧 chunk、已發現的 v1 外圍地區（`outerRegionId` → 那一段）、已解鎖傳送碑的 x、每個 visit 的位置、地上掉落物——東西兩側各取最遠；點在中央或 v1 海 → 舊範圍到 v1 海的末端、gen2 從 `'continent'` 開始；點在 v1 陸地段 → 舊範圍到那一段末端、gen2 從 `'sea'` 開始。v1 範圍內的 chunk 不存，繼續由 v1 即時生成（決定 3）。
4. 接縫：gen2 的 `SideOrigin.seaY = frame.edgeR + 1`（西側 `edgeL + 1`，與 v1 海平面相同）、`shore = v1 surfaceAt(接縫內側一格)`——`start: 'sea'` 時那是 v1 陸地地表，`start: 'continent'` 時那是 v1 海床；兩種的地形銜接規則在 Task 7（P13），本 Task 的接縫測試兩種都驗。
5. 文化：gen2 從接縫起算第 c = 1 片大陸套同一套指派規則。
6. 依生成順序的 id：區域清單（`RegionJSON`）、村莊 / 地廳順序（NPC 好感鍵）、陶罐鑰匙都存進 `LegacyMeta`，之後不再重算。
- 標頭改成 `genVersion 8`、`outerGen = GEN2_VERSION`、`gen2 = { locks: [], bake, legacy }`；`bake.quiet` = 中央 chunk 中原本不在 `chunks ∪ liquids.chunks` 的鍵（玩家沒碰過 → 液體是生成器靜置後的狀態 → 讀檔 / 載入 / 接縫都不喚醒）；之後每次存檔寫回目前的 `bakedQuiet`。
- 最後 `splitSnapshot(data, who(character), where(world.header), now)` → WorldData。

- [ ] **Step 1: 寫失敗測試（`save/bake.test.ts`；檔案內共用一次 `generateWorld('fixture-v11')`，逾時設 120 s）**

```ts
it('bakeApplies：只有 v7 且正式尺寸', () => { expect(bakeApplies({ genVersion: 7, width: 4200, height: 1200 })).toBe(true);
  expect(bakeApplies({ genVersion: 7, width: 200, height: 100 })).toBe(false); expect(bakeApplies({ genVersion: 8, width: 4200, height: 1200 })).toBe(false); });
const seg = (k: number) => profile.segmentAt(4200 + SEA_W + 1 + k * SEG_W)!;   // v1 東側第 k 段（profile = OuterProfile('fixture-v11', frame)）
it('legacyRange：玩家在 v1 東海 → 東接縫 = 4200 + SEA_W、從大陸開始', () => {
  expect(legacyRange(hdr({ pos: 4300 }), profile, stones).east).toMatchObject({ x: 4200 + SEA_W, start: 'continent' }); });
it('legacyRange：改過的 chunk 在 v1 陸地段中間 / 段末前一格 → 到那一段的末端、從海開始；西側負 x 對稱', () => { const s = seg(2);
  for (const x of [(s.x0 + s.x1) >> 1, s.x1 - 1]) expect(legacyRange(hdr({ chunkAtX: x }), profile, stones).east).toMatchObject({ x: s.x1, start: 'sea' });
  const ws = profile.segmentAt(-SEA_W - 1 - 3 * SEG_W)!;
  expect(legacyRange(hdr({ pos: ws.x0 + 3 }), profile, stones).west).toMatchObject({ x: ws.x0, start: 'sea' }); });
it('legacyRange：只有迷霧 / 只有傳送碑 / 只有已發現地區在遠處，也算進去', () => { const s = seg(4);
  for (const h of [hdr({ fogAtX: s.x0 + 10 }), hdr({ stone: stoneIn(s) }), hdr({ region: outerRegionId(s.k + 1, 1) })]) expect(legacyRange(h, profile, stones).east.x).toBe(s.x1); });
// 檔案層級共用：
const L = (restoreSplit(fixtureWorld, char, { gen }) as RestoreOk).game, B = (restoreSplit(baked, char) as RestoreOk).game;
it('烘焙前後逐格相同', () => {
  for (let cx = 0; cx < 132; cx++) { B.world.ensureColumn(cx); for (let cy = 0; cy < 38; cy++) expect(B.world.readChunk(cx, cy)).toEqual(L.world.readChunk(cx, cy)); }
  expect(sortedChests(B.world)).toEqual(sortedChests(L.world)); expect([...B.world.potDrops]).toEqual([...L.world.potDrops]);
  for (let x = range.west.x; x < range.east.x; x += 7) { expect(B.world.surfaceAt(x)).toBe(L.world.surfaceAt(x)); expect(B.world.biomeAt(x)).toBe(L.world.biomeAt(x)); expect(B.world.layersAt(x)).toEqual(L.world.layersAt(x)); }
  for (const cx of [-3, -10, 140, 150]) { B.world.ensureColumn(cx); L.world.ensureColumn(cx); for (let cy = 0; cy < 38; cy++) expect(B.world.readChunk(cx, cy)).toEqual(L.world.readChunk(cx, cy)); }
  expect(B.regions.map((r) => [r.id, r.name, r.x, r.y, r.w, r.h])).toEqual(L.regions.map((r) => [r.id, r.name, r.x, r.y, r.w, r.h]));
  expect(B.spawn).toEqual(L.spawn); for (const id of [0, 1, -1]) expect(B.waystones.byId(id)).toEqual(L.waystones.byId(id));
  // ±2 在這份 fixture 裡已經過接縫（裁決 P6）：落在 gen2 陸地
  expect(B.waystones.byId(2)!.x).toBeGreaterThanOrEqual(range.east.x); expect(B.waystones.byId(-2)!.x).toBeLessThan(range.west.x);
  for (const id of [2, -2]) expect(['wild', 'culture']).toContain(B.world.regionAt(B.waystones.byId(id)!.x).kind);
  expect(B.villages).toEqual(L.villages); expect(B.halls).toEqual(L.halls);
});
it('玩家的改動保留（fixture 的挖洞、木板、箱子內容）', () => { const E = FIXTURE11_EDITS;
  for (const [x, y] of E.dug) { B.world.ensureColumn(x >> 5); expect(B.world.getFg(x, y)).toBe(T.AIR); }
  for (const [x, y] of E.planks) { B.world.ensureColumn(x >> 5); expect(B.world.getFg(x, y)).toBe(T.PLANKS); }
  expect(B.world.chests.get(B.world.idx(E.chest.x, E.chest.y))!.filter(Boolean)).toEqual(E.chest.items); });
it('接縫外是 gen2', () => { const e = range.east; expect(B.world.regionAt(e.x + (e.start === 'sea' ? 5 : 0)).kind).toMatch(e.start === 'sea' ? /^sea$/ : /^(wild|culture)$/);
  if (e.start === 'sea') expect(B.world.source!.waterTopAt!(e.x + 50)).toBe(frame.edgeR + 1);
  const c1 = [(B.gen2()!).layout.landmass(1, e.start === 'sea' ? 2 : 1), B.gen2()!.layout.landmass(-1, range.west.start === 'sea' ? 2 : 1)];
  expect(c1.filter((m) => m.culture === 'mistbamboo')).toHaveLength(1); });
it('烘焙世界讀檔不必跑舊生成器、genKind baked、存回再讀一樣', () => { const r = restoreSplit(baked, char);   // 不傳 gen
  expect(r.ok).toBe(true); const B1 = (r as RestoreOk).game; expect(B1.genKind).toBe('baked');
  const { world: w2 } = saveSplitGame(B1, 2), B2 = (restoreSplit(decodeWorld(encodeWorld(w2)), char) as RestoreOk).game;
  for (const [cx, cy] of SAMPLE10) { B1.world.ensureColumn(cx); B2.world.ensureColumn(cx); expect(B2.world.readChunk(cx, cy)).toEqual(B1.world.readChunk(cx, cy)); }
  expect(sortedChests(B2.world)).toEqual(sortedChests(B1.world)); });
it('安靜 chunk：讀檔後沒有任何安靜 chunk 被喚醒；在安靜 chunk 挖一格 → 從 bakedQuiet 移除且被喚醒', () => {
  B.step(FIXED_DT); expect(awakeChunks(B).filter((k) => B.world.bakedQuiet.has(k))).toEqual([]);
  const [x, y] = solidInQuietChunk(B), ck = B.world.chunkKeyAt(x, y); B.mine(x, y);
  expect(B.world.bakedQuiet.has(ck)).toBe(false); expect(B.liquids.isAwake(x, y)).toBe(true); });
it('失敗注入（裁決 P7）：烘焙中途丟錯 → 丟出、輸入原封不動；備份或寫入丟錯 → 原 v7 記錄位元組不變', async () => {
  const before = structuredClone(fixtureWorld);
  for (const stage of ['restore', 'snapshot', 'meta', 'split'] as const)
    expect(() => bakeWorld(fixtureWorld, char, gen, 1, (s) => { if (s === stage) throw new Error('inject ' + s); })).toThrow('inject ' + stage);
  expect(fixtureWorld).toEqual(before);
  for (const fail of [{ backupThrows: true }, { putThrows: true }]) {
    const store = fakeSplitStore({ ...fail, slots: { 'w-1': originalBytes } }), s = SplitSession.fromLoaded(baked, char, 'w-1'); s.pendingBackup = V7_BACKUP_SUFFIX;
    await expect(saveSplit(store, s, B, 2)).rejects.toThrow(); expect(store.slot('w-1')).toEqual(originalBytes);
    if (fail.backupThrows) expect(store.putCalls).toBe(0); else expect(store.slot('w-1' + V7_BACKUP_SUFFIX)).toEqual(originalBytes); } });
it('接縫（P13）：兩種接縫都沒有空氣縫、沒有液體牆', () => {
  for (const h of [hdr({ pos: 4300 }), hdr({ chunkAtX: (seg(2).x0 + seg(2).x1) >> 1 })]) { const rg = legacyRange(h, profile, stones);
    const src = new BakedSource('fixture-v11', meta, { ...bakeInfo, east: rg.east, west: rg.west }, new LockTable(), false), w = worldOf(src);
    for (const sx of [rg.east.x, rg.west.x]) { loadColumns(w, sx - 40, sx + 40);
      expect(Math.abs(src.surfaceAt(sx) - src.surfaceAt(sx - 1))).toBeLessThanOrEqual(4);
      expect(liquidInvariant(w, sx - 40, sx + 40)).toEqual([]); } }
  expect(new Set([legacyRange(hdr({ pos: 4300 }), profile, stones).east.start, legacyRange(hdr({ chunkAtX: (seg(2).x0 + seg(2).x1) >> 1 }), profile, stones).east.start])).toEqual(new Set(['continent', 'sea'])); });
it('小尺寸 fixture（format9 / format10）判定不適用，照舊載入', () => { for (const h of [fixture9.header, fixture10.header]) expect(bakeApplies(h)).toBe(false); });
// 測試檔內的輔助：hdr(o) = 以 fixture 的 WorldHeader 為底、只放 o 指定的那一種已知點（pos / chunkAtX / fogAtX / stone / region）的合成標頭；
// stones = 舊世界的 Waystones；stoneIn(s) = 落在段 s 內的碑 id；sortedChests(w) = [...w.chests] 依鍵排序；range = legacyRange(fixture)；
// frame = frameOf(L.world)；fakeSplitStore({ backupThrows, putThrows, slots }) 記錄 putCalls、丟錯時不改任何記錄；fixtureWorld / char / originalBytes = 讀進來的 format11-v7 fixture；
// baked = bakeWorld(fixtureWorld, char, gen, 1)；meta / bakeInfo = baked 標頭裡的 legacy / bake 解碼；SAMPLE10 = 中央 10 個固定 (cx, cy)；
// awakeChunks(g) = g.liquids 目前喚醒格所在的 chunk 鍵；solidInQuietChunk(g) = 第一個安靜 chunk 裡、旁邊有液體的實心格；
// RestoreOk / chunkKeyAt / isAwake / mine 的確切名稱以現有 API 為準。
it('大小量測（回報、不阻擋）', () => { const bytes = gzipSync(encodeWorld(baked)).length; console.info('[bake size] gzip bytes', bytes, 'snapshot ms', ms); expect(bytes).toBeLessThan(16 * 1024 * 1024); });
// legacyMeta.test.ts
it('LegacyMeta 往返與壞資料', () => { const j = encodeLegacyMeta(L), m = decodeLegacyMeta(JSON.parse(JSON.stringify(j)));
  expect(m).toEqual(decodeLegacyMeta(j)); expect(m.surface).toHaveLength(4200); expect(m.regions).toHaveLength(L.regions.length);
  for (const bad of [{ ...j, surface: j.surface.slice(4) }, { ...j, villages: 'x' }, { ...j, frame: null }]) expect(() => decodeLegacyMeta(bad)).toThrow(SaveFormatError); });
// discovery.test.ts
it('Region 經 RegionJSON 往返後 contains 相同', () => { for (const r of L.regions) { const q = regionFromJSON(JSON.parse(JSON.stringify(toRegionJSON(r))), L.layers!, 1200);
  for (let x = 0; x < 4200; x += 13) for (let y = 0; y < 1200; y += 13) if (q.contains(x, y) !== r.contains(x, y)) throw new Error(`${r.id} @ ${x},${y}`);
  expect([q.id, q.name, q.x, q.y, q.w, q.h]).toEqual([r.id, r.name, r.x, r.y, r.w, r.h]); } });
```

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/save/bake.test.ts src/scripts/games/delve/save/legacyMeta.test.ts src/scripts/games/delve/engine/discovery.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。`bootBaked`：`World(central: 'source')` + `BakedSource`；內容取 meta（regions 用 `regionFromJSON`）；`outer` = 舊範圍內 `outerRegions(v1 profile)`、範圍外 `gen2Regions`；`land` = 範圍內 `v1LandQuery`、範圍外 `gen2LandQuery`；`potDrops` 放回 `world.potDrops`；`bakedQuiet` 由 `bake.quiet` 解碼。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/save src/scripts/games/delve/engine`；Expected: 全綠；把 `[bake size]` 的數字記進 commit 說明（> 4 MB 時在報告裡提出做法，例如每 chunk RLE）。
- [ ] **Step 5: Commit** — `feat(delve): bake legacy v7 worlds into genVersion 8 (behind flag)`。

---

### Task 17: 開發旗標與 session 的新世界 / 讀檔路徑

**Files:**
- Create: `render/gen2Flag.ts`、`tests/e2e/delve-gen2.spec.ts`
- Modify: `render/session.ts:595-625`（`generate` 只給舊生成器用）、`:697-714`（`newWorldWith`）、`:783-834`（`openLegacy` / `openSplit` 用 `genBlocker`、v8 不生成、v7 + 旗標 → 烘焙）；`save/bake.ts`（`upgradeSlot`：session 的升級路徑抽成可測的函式，裁決 P7）
- Test: `render/gen2Flag.test.ts`、`save/upgrade.test.ts`（新）

**Interfaces:**
- Produces: `gen2Flag(search: string, store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): boolean`（`?gen2=1` 寫入 `'delve.gen2' = '1'` 並回 true；`?gen2=0` 刪鍵回 false；都沒有 → 看 store；store 丟例外 → false）。
- Produces（`save/bake.ts`，P7）：
  ```ts
  export const UPGRADE_FAILED_MSG = '世界升級失敗，原本的存檔沒有改動：';
  export function upgradeSlot(store: SplitStore, slot: string, character: DelveCharacter, gen: GenResult, now: number, bake?: typeof bakeWorld):
    Promise<{ ok: true; game: DelveGame; session: SplitSession } | { ok: false; message: string }>;
  // 從 store 讀 slot 的世界檔 → bake（預設 bakeWorld）→ restoreSplit；成功時 session.pendingBackup = V7_BACKUP_SUFFIX；任何丟錯都回 { ok: false, message: UPGRADE_FAILED_MSG + 原因 }，且不寫 store
  ```
- Consumes: `bakeApplies`、`bakeWorld`、`V7_BACKUP_SUFFIX`（Task 16）、`genBlocker`（Task 15）、format11-v7 fixture（Task 1）。
- 中間狀態（P16）：本 Task 到 Task 18 之前，旗標開啟時房主仍送 `genVersion 7`、客人會靜默建出舊世界副本；旗標關閉不受影響。接受，Task 17 與 Task 18 必須一起合併。

- [ ] **Step 1: 寫失敗測試**

```ts
it('gen2Flag', () => { const s = fakeStore();
  expect(gen2Flag('', s)).toBe(false); expect(gen2Flag('?gen2=1', s)).toBe(true); expect(gen2Flag('', s)).toBe(true);
  expect(gen2Flag('?gen2=0', s)).toBe(false); expect(gen2Flag('', s)).toBe(false); expect(gen2Flag('', throwingStore())).toBe(false); });
```
```ts
// save/upgrade.test.ts（P7；fixture = Task 1 的 format11-v7，gen = generateWorld('fixture-v11')，逾時 120 s）
it('烘焙失敗 → 不開局、存檔原封不動；重試成功 → baked，第一次存檔先備份原檔', async () => {
  const store = fakeSplitStore({ slots: { 'w-1': originalBytes } });
  const bad = await upgradeSlot(store, 'w-1', char, gen, 1, () => { throw new Error('boom'); });
  expect(bad).toEqual({ ok: false, message: UPGRADE_FAILED_MSG + 'boom' });
  expect(store.putCalls).toBe(0); expect(store.slot('w-1')).toEqual(originalBytes); expect(store.slot('w-1' + V7_BACKUP_SUFFIX)).toBeUndefined();
  const ok = await upgradeSlot(store, 'w-1', char, gen, 1); if (!ok.ok) throw new Error(ok.message);
  expect(ok.game.genKind).toBe('baked'); expect(ok.session.pendingBackup).toBe(V7_BACKUP_SUFFIX); expect(store.slot('w-1')).toEqual(originalBytes);
  await saveSplit(store, ok.session, ok.game, 2);
  expect(store.slot('w-1' + V7_BACKUP_SUFFIX)).toEqual(originalBytes); expect(store.slot('w-1')).not.toEqual(originalBytes); });
```
```ts
// tests/e2e/delve-gen2.spec.ts（LF）
test('旗標關閉：新世界仍是 genVersion 7', async ({ page }) => {
  await page.goto('/games/delve?seed=e2e-g1&autostart=1&fresh=1&gen2=0');
  await page.waitForFunction(() => window.__delveDebug?.game);
  expect(await page.evaluate(() => window.__delveDebug!.game.genVersion)).toBe(7);
});
test('?gen2=1：新世界走 gen2、能往東走到海', async ({ page }) => {
  await page.goto('/games/delve?seed=e2e-g2&autostart=1&fresh=1&gen2=1');
  await page.waitForFunction(() => window.__delveDebug?.game);
  expect(await page.evaluate(() => window.__delveDebug!.game.genVersion)).toBe(8);
  await page.evaluate(() => { const g = window.__delveDebug!.game; g.teleport(4300, 330); });
  await expect.poll(() => page.evaluate(() => window.__delveDebug!.game.world.biomeAt(4300))).toBe(4);
});
```

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/render/gen2Flag.test.ts src/scripts/games/delve/save/upgrade.test.ts` 與 `npx playwright test tests/e2e/delve-gen2.spec.ts --project=chromium`；Expected: 兩個單元測試 FAIL（flag-off 的 e2e 在 Task 13 之後本來就會過，是護欄）。
- [ ] **Step 3: 實作** — session 啟動時讀一次 `gen2Flag(location.search, safeLocalStorage())`。`newWorldWith`：旗標開 → 不呼叫 `generate`，直接 `new DelveGame({ seed, peaceful, appearance, worldGen: { kind: 'gen2' } })`。`openSplit`：先 `genBlocker`；`genVersion 8` → 不生成、直接 `restoreSplit`；`genVersion 7` 且旗標開且 `bakeApplies` → `generate`（照舊顯示進度，標題文字「升級舊世界中…」）→ `upgradeSlot(idbSplitStore, slot, character, gen, Date.now())`；`ok: false` → `say(msgEl, message)` 並不開局（session 不另寫訊息字串）。旗標關 → 路徑完全照舊。
- [ ] **Step 4: 跑測試** — 同 Step 2，加跑 `npx playwright test tests/e2e/delve.spec.ts --project=chromium`；Expected: 全 PASS。
- [ ] **Step 5: Commit** — `feat(delve): gen2 dev flag for new worlds and legacy upgrade`。

---

### Task 18: 連線：版本描述、gen2 客人不生成家鄉、烘焙世界的 meta

**Files:**
- Modify: `net/protocol.ts:96-99`（`Welcome.gen2`）、`:144-145`（`BulkHead` 加 `{ t: 'legacy' }`）、`net/host.ts:299-305`（送實際版本 + 描述 + legacy bulk）、`net/guest.ts:77,110,417-452`（相容檢查、建副本、等 legacy bulk）、`net/testRig.ts`（rig 加 `world: 'gen2' | 'baked'` 選項，以及測試鉤子 `tamperWelcome(m)`、`deliver: 'bulkFirst' | 'welcomeFirst'`；下面測試裡的 `coopRig` / `rig.guest.endText` 以 testRig 既有的建構函式與結束狀態欄位為準）
- Test: `net/coop.gen2.test.ts`（新）

**Interfaces:**
- Consumes: `WorldGenSpec`、`LockJSON`、`BakeInfo`、`LegacyMetaJSON`、`GEN2_VERSION`。
- Produces：
  ```ts
  export interface WireGen2 { kind: 'gen2' | 'baked'; locks: LockJSON; bake?: BakeInfo }
  // Welcome 加 gen2?: WireGen2；genVersion / outerGenVersion 改送 game.genVersion / world.source?.version（舊世界照舊 7 / OUTER_GEN_VERSION）
  export function coopGenOk(m: Pick<Welcome, 'genVersion' | 'outerGenVersion' | 'gen2'>): boolean;  // net/guest.ts
  ```
  `coopGenOk`：`genVersion 7` → `outerGenVersion === OUTER_GEN_VERSION && !gen2`；`genVersion 8` → `outerGenVersion === GEN2_VERSION`、`gen2` 存在、鎖都 ≤ `GEN2_VERSION`；其他 false。烘焙世界：房主在 welcome 之後、snap 之前送 `encodeBulk({ t: 'legacy' }, utf8(JSON.stringify(legacyMetaJSON)))`；客人在 welcome 時若 `kind === 'baked'`，先在早到的 bulk 裡找 `legacy`，沒有就維持 connecting 等它到了再建副本（`EARLY_BULK_MAX` +1）。副本的 Gen2Source / BakedSource 用 `recordLocks: false`、鎖表 `frozen`。

- [ ] **Step 1: 寫失敗測試**

```ts
it('gen2 世界：客人加入時副本不建中央、genKind gen2、出生點附近的 chunk 與房主相同', async () => {
  const rig = coopRig({ world: 'gen2' }); rig.run(2000); const gg = rig.guests[0].game!;
  expect(gg.genKind).toBe('gen2'); expect(gg.world.isResident(0)).toBe(false);
  rig.run(120 * FRAME); expect(rig.sameTiles(0)).toEqual([]);
  expect(columnSums(gg.world, SPAWN_X >> 5)).toEqual(columnSums(rig.hostGame.world, SPAWN_X >> 5));
});
it('outerGen 不同 → 客人以 END_TEXT.gen 結束', async () => { const rig = coopRig({ world: 'gen2', tamperWelcome: (m) => ({ ...m, outerGenVersion: 9 }) });
  rig.run(2000); expect(rig.guests[0].endText).toBe(END_TEXT.gen); expect(rig.guests[0].game).toBeNull(); });
it('coopGenOk 真值表', () => { const g = { kind: 'gen2' as const, locks: [] };
  expect(coopGenOk({ genVersion: 7, outerGenVersion: 1 })).toBe(true); expect(coopGenOk({ genVersion: 7, outerGenVersion: 2 })).toBe(false);
  expect(coopGenOk({ genVersion: 8, outerGenVersion: 0, gen2: g })).toBe(true); expect(coopGenOk({ genVersion: 8, outerGenVersion: 1, gen2: g })).toBe(false);
  expect(coopGenOk({ genVersion: 8, outerGenVersion: 0 })).toBe(false); expect(coopGenOk({ genVersion: 8, outerGenVersion: 0, gen2: { ...g, locks: [[1, 1, 5, null]] } })).toBe(false); });
it('烘焙世界：legacy bulk 比 welcome 先到 / 後到都能加入；副本 genKind baked；中央 chunk 經同步後與房主相同', async () => {
  for (const order of ['bulkFirst', 'welcomeFirst'] as const) { const rig = coopRig({ world: 'baked', deliver: order }); rig.run(2000 + 120 * FRAME);
    expect(rig.guests[0].game!.genKind).toBe('baked'); expect(columnSums(rig.guests[0].game!.world, 65)).toEqual(columnSums(rig.hostGame.world, 65)); } });
it('舊世界連線不變：Welcome 位元組與改動前相同（P9）', () => { let seen: Welcome | null = null;
  const rig = coopRig({ world: 'real', tamperWelcome: (m) => (seen = m) }); rig.run(2000);
  expect(seen!.genVersion).toBe(7); expect(seen!.outerGenVersion).toBe(OUTER_GEN_VERSION); expect('gen2' in seen!).toBe(false);
  expect(fnv1a(utf8(JSON.stringify(seen)), 0x811c9dc5)).toBe(LEGACY_WELCOME_HASH);   // 改 host.ts 前跑一次錄下
  expect(rig.guests[0].game!.genKind).toBe('legacy'); });
```
（`FRAME`、`sameTiles`、`hostGame`、`guests[i]` 是 testRig 現有成員；`guests[i].game` / `endText` 以 `NetGuest` 實際的公開 getter 為準（`replica` 是 private）；`columnSums` 從 testRig 或 `net/codec` 取；`world: 'baked'` 的房主用 Task 16 的 format11-v7 fixture 烘焙一次、在檔案內共用（逾時 120 s）。現有 coop 測試仍由 Step 4 整個 `net/` 資料夾覆蓋。）

- [ ] **Step 2: 跑確認失敗** — Run: `npx vitest run src/scripts/games/delve/net/coop.gen2.test.ts`；Expected: FAIL。
- [ ] **Step 3: 實作** 如上。
- [ ] **Step 4: 跑測試** — `npx vitest run src/scripts/games/delve/net`；Expected: 全綠。
- [ ] **Step 5: Commit** — `feat(delve): coop carries gen2 descriptor; gen2 guests no longer generate the home map`。

---

### Task 19: 全面驗收

**Files:** 無新增（只跑驗證、更新本計畫的基準紀錄）

- [ ] **Step 1: 全套單元測試** — Run: `npx vitest run`；Expected: 全綠。
- [ ] **Step 2: 型別** — Run: `rtk proxy npx tsc --noEmit -p .`；Expected: 773、`games/delve` 0 個。
- [ ] **Step 3: e2e** — Run: `npx playwright test tests/e2e/delve.spec.ts tests/e2e/delve-gen2.spec.ts tests/e2e/delve-online.spec.ts --project=chromium`；Expected: PASS。
- [ ] **Step 4: 效能回報** — 重跑 `engine/liquid.perf.test.ts`（舊世界，與基準比）與 `engine/gen2/gen2.perf.test.ts`；把 LiquidSim 前後、gen2 比值、烘焙大小 / 存檔耗時寫進交付報告。
- [ ] **Step 5: 給使用者 4321 連結** — 先確認 4321 是這個 worktree 起的 dev server（`docs/claude/verify.md`），附 `http://localhost:4321/games/delve?gen2=1&autostart=1&fresh=1&seed=m1-demo`（新 gen2 世界）與「舊存檔升級」的操作說明（在旗標下讀既有 v7 世界）；說明 M1 外大陸只有小屋 / 遺跡 / 湖 / 沉船 / 漂流箱，家鄉缺村莊與地城是 M2 的事。
- [ ] **Step 6: 派 fresh-context 驗收 agent**（spec §9），清單 = 本計畫 Review Focus 五條 + 規格對照表。

---

## 規格對照（自我檢查）

| spec 要求 | Task |
|-----------|------|
| §4.1 版面、文化指派、tier | 6 |
| §4.2 `regionAt`、`BIOME.OCEAN`、所有 biome 消費者 | 3、4、5、14 |
| §4.3 純 (seed,x,y)、無全域 pass、地區混合、主坑道、靜態液體、槽位藍圖、跨區塊物件由藍圖登錄、確定性 grep | 7–11 |
| §4.3 效能、客人不生成家鄉 | 12、13、18 |
| §4.3 舊生成器搬 legacy | 2 |
| §5 genVersion 8、版本比對、每片地塊鎖版本、版本雜湊測試 | 6、8、12、15 |
| §5 舊世界烘焙 1–6、大小量測、旗標後面 | 16、17 |
| §5 連線版本一致 | 18 |
| §5 carry：`decodeLiquidRle`、LiquidSim 基準、`OuterProfile.info` 快取 | 1；快取見下 |
| §8 OCEAN 遠景、海洋釣魚表、海槽位 300、島 / 沉船 / 漂流箱 | 3、4、6、11 |

## 規格模糊處與作者裁決

1. **「烘焙範圍延伸到已知最遠點所在 v1 段落末端」**：裁決為該範圍決定接縫位置，但 v1 外圍不存成 chunk、繼續由 v1 即時生成（只烘焙中央 4200 格）。理由見決定 3；這讓 legacy/chunkgen 留在舊世界的執行路徑上，M2 若要 bundle 分離需改動態 import。
2. **「相鄰大陸不重複」+「約 1:1」**：裁決為荒野也算池中一項、一律不重複 → 目前兩項池就是嚴格交替（正好 1:1）；之後加文化時改成「排除前一片後均勻挑」。
3. **`OuterProfile.info(x)` 快取「若 v2 沿用」**：v2 不沿用 v1 側寫 → 不改 v1（保持其輸出凍結）；gen2 的 `Profile2` 內建欄快取。
4. **海上點位**：M1 做槽位機制 + 島 + 沉船 + 漂流箱；珊瑚礁、海底遺跡、三種有建物的島、海洋專屬魚種與海鳥留 M2。「每道海至少一座有建物的島」因此 M1 尚未滿足（M2 的島種類）。
5. **小尺寸 fixture 走升級路徑**：format9 / format10 fixture 是 200×100 有界世界，無法烘焙成 4200 寬的 gen2 世界 → 判定不適用並照舊載入；改用 Task 1 凍結的正式尺寸 format 11 / v7 fixture 驗證烘焙。spec §5 已據此修訂（P15a）。
6. **讀 genVersion 8 存檔是否受旗標限制**：裁決為不受限（旗標只管建立與升級）。
7. **「32×32 區塊」效能單位**：World 以 32×1200 欄生成；測試量每欄並與 v1 每欄比（測試門檻 3×），spec 的 2× 由 Task 12 的閒置機器實測把關、不達標 Task 12 失敗（P5）；最壞值換算成每 chunk 遠低於 8 ms。
8. **大地圖畫外圍地區名稱**（spec §4.2 提到的 carry）不在 §9 M1 列 → 留 M2；spec §9 M2 列已加上（P15b）。

## Preflight 裁決（P1–P16，掃描見 `.superpowers/sdd/2026-10-23-delve-1b-m1-world-skeleton/preflight-scan.md`）

- **P1** Task 2 一併改 `engine/flatAccess.test.ts` 的豁免路徑為 `engine/legacy/`（字串路徑 tsc 抓不到）。
- **P2** `Discovery.setOuter` 改吃陣列、`outerRegions` 包陣列移到 Task 13（Task 13 要能單獨編譯），Task 14 只加 gen2。
- **P3** Task 7 出生平地 ±60、外側 40 欄線性升回振幅；`AMP` 對每個 VARIANT 都有值。
- **P4** Task 8 主坑道邊距 `min(120, floor(寬 / 4))`、沙灘地區豁免；測試 = 每個非沙灘陸地地區都有坑道。
- **P5** spec 2× 有約束力：自動測試門檻 3× 並印比值，Task 12 報告必須有 ≤ 2× 的閒置機器實測，否則 Task 12 失敗。
- **P6** Task 16 傳送碑相等只驗 0 / ±1；±2 驗「在接縫外的 gen2 陸地上」。
- **P7** Task 16 失敗注入要真的丟（`bakeWorld` 的 `onStage`、store 備份 / 寫入丟錯）並驗原 v7 位元組不變；Task 17 加 `upgradeSlot` 失敗不動存檔、重試成功的測試。
- **P8** Task 1 的 `decodeLiquidRle` 測試改成 `toThrow(SaveFormatError)`（n = 2 ** 33），不用 spy / try-catch。
- **P9** 計畫中所有只有註解的測試本體都要寫成具體斷言（已在 Task 6–18 寫出）；Task 18「舊世界連線不變」驗 Welcome 雜湊、Task 8「出生點站得住」驗腳下實心 + 上方 2 格空氣。
- **P10** 不把 v1 原樣複製進 gen2：共用 primitives 抽到 `engine/genPrims.ts`、v1 輸出以 `V1_FILL_HASH` 釘住；gen2 的材質 / 礦規則是自己的，不准把海床沙換成銅。
- **P11** Task 9 每片非家鄉大陸保證 ≥ 1 小屋 + ≥ 1 遺跡（保證槽 + 後備放置），其他槽照機率；測試確定。
- **P12** 島的擁有者：Task 6 產生海 / 島 RegionInfo 與海槽清單；Task 9 的 `structureId` / `slotOf` 涵蓋海槽、島不進陸地槽位格；Task 11 擁有島的表層與樹（Task 8 不長島樹）。
- **P13** Task 7 加「大陸緊貼 v1 海」的接縫地形規則；Task 16 加兩種接縫都沒有空氣縫 / 液體牆的測試。
- **P14** Task 14 的小屋 visit 測試用整個外框在地區範圍內的淺層小屋。
- **P15** spec 修訂：(a) §5 format9 / 10 小 fixture 照舊載入、烘焙用正式尺寸 fixture 驗；(b) §9 M2 加大地圖外圍地區名稱；(c) §8 海洋釣魚表留在 M1（Task 3 `OCEAN_FISH`），沿用現有海上魚種、不新增物品。
- **P16** 接受中間狀態 Task 3 → 4（海遠景暫混叢林）與 Task 17 → 18（旗標開啟的連線）；分支整條合併，兩對不可拆開。
