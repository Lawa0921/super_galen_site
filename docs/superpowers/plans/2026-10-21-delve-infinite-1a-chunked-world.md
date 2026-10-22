# DELVE 無限世界 1a：分區塊世界、海、船、傳送碑、地圖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 世界改成以區塊座標存取、左右（含負 x）無限、上下維持 `WORLD_H`；舊 41 階段生成器照舊產生中央 x∈[0, width)，外圍由新的分區塊生成器 v0 產生（海灘外先是一片海，再來是四種生態的基本地形）；玩家附近按需生成、遠處卸載；存檔以區塊座標為鍵（舊存檔讀得進來、第一次存檔前先備份）；可合成的船、傳送碑、只畫探索過地方的大地圖 / 小地圖。

**Architecture:** 先在現有（扁平陣列）`World` 上做出「與儲存方式無關」的存取 API（座標鍵、getter、`window()` 批次讀取、每欄函式），把約 220 處 `*width` 寫法全部改用它（Task 1–4，行為逐格不變，golden 守住）；再把 `World` 內部換成「區塊欄」（32 格寬 × 全高的欄，常駐 / 停放 / 卸載）並把舊扁平類別改名 `GenGrid` 只給舊生成器用（Task 5）；之後是迷霧與存檔（6）、生成器 v0（7）、引擎與畫面解除寬度限制（8、9）、船（10）、傳送碑（11）、地圖（12）。

**Tech Stack:** TypeScript、vitest（happy-dom）、Playwright、Canvas2D。不加 npm 套件。

**Spec:** `docs/superpowers/specs/2026-10-21-delve-infinite-world-design.md`（本計畫只做 §6 C1 的第 1 段 1a）。連線設計 `docs/superpowers/specs/2026-10-20-delve-coop-design.md` 之後依本計畫的區塊 API 改寫（spec C11）。

## 使用者裁定（rulings，不可改）

- **R1** 1a =（a）世界儲存改成區塊座標鍵（`CHUNK = 32`），水平無限含負 x、垂直維持 `WORLD_H = 1200`；每個活著的玩家周圍按需生成、遠處且未改動就卸載；（b）現有 4200 寬生成器照舊產生新舊世界的中央 x∈[0, 4200)，座標不變、舊存檔有效；（c）中央以外由新的確定性分區塊生成器 v0 產生：海灘外先是一片海（船要開幾十秒），再來是用四種現有生態的基本地形，有洞穴、礦、深度層（天空 / 地表 / 泥土 / 岩層 / 洞穴層 / 熔岩深淵）；內容只由（seed, x, y）決定、與載入順序無關；品質在 1a 可以陽春（1b 拉高），但**不能留下任何固定寬度的假設**；（d）所有依賴固定寬度的系統都轉換（isSolid 左右邊界、鏡頭邊界、每欄陣列 → 每欄惰性計算 / 快取的函式、液體、探索迷霧按區塊、光照、刷怪棲地、bgBlend、天氣、霜、發現、NPC 尋路、小地圖 / 大地圖）；（e）存檔格式升版：改過的區塊以區塊座標為鍵，舊存檔遷移一次（沿用現有備份做法）；（f）前期材料就做得出來、能在水上用的船；（g）傳送碑：出生點附近一顆，外圍地形每隔一段距離生成一顆，碰過就解鎖；解鎖紀錄**存在世界上、所有玩家共用**；任兩顆已解鎖的之間可以傳送；（h）大地圖只畫探索過的地方、可拖曳縮放、標出已解鎖的傳送碑；小地圖也只畫探索過的地方。
- **R2** 舊世界烘焙進存檔、刪除舊生成器都移到 **1b**（spec 讓計畫決定 1a / 1b 怎麼切；只有刪掉舊生成器之後才需要烘焙）。1a 的中央區照舊由種子重算。
- **R3** 水平硬邊界 ±1,000,000 格（spec C6）。
- **R4** x∈[0, 4200) 內的單機行為逐格不變：`engine/actor.golden.test.ts` 的 GOLDEN / GOLDEN2 **原封不動**要過；另加一個測試證明固定種子的中央區 tile 與舊扁平陣列輸出相同。
- **R5** 效能：熱路徑（物理、光照、畫面、液體）不可以每次讀格子都查一次 Map；存取策略見 B3，預算見 Task 1 / Task 5 的效能測試。
- **連線**：區塊以座標存取，是之後網路層能「按區塊座標要求」的形狀；多個相隔很遠的玩家各自保有自己周圍載入的區域。

## Builder decisions（Claude 代為決定，使用者可推翻）

- **B1 座標鍵（相容舊鍵）。** `engine/coords.ts`：中央格 `tileKey = y*width + x`（0 ≤ x < width）、中央 chunk `chunkKey = cy*chunksX + cx`（0 ≤ cx < chunksX）——與今天的 tile index / chunk index 完全相同；其他座標落在 `T_BASE = 2**25` / `C_BASE = 2**20` 以上的另一段（`T_BASE + (x + 2**21)*4096 + y`、`C_BASE + (cx + 2**16)*128 + cy`）。這是 (cx, cy) ↔ 數字的雙射，所以「以區塊座標為鍵」成立，而存檔與角色檔裡既有的每個 tile / chunk 鍵（箱子、金寶箱、冰洞、結冰 / 半格差分、地標、`levels.placed`…）都不用改寫。`width` 不是 4200 的倍數時，chunk 131（x 4192..4223）用舊鍵，但它的 x ≥ 4200 格用外圍 tile 鍵——鍵只是鍵，見 Task 6 的補零規則。
- **B2 儲存單位 = 區塊欄（Column）。** 32 格寬 × `height` 格高，每層一個 `Uint8Array(32*height)`，索引 `(y << 5) | (x & 31)`；一個 chunk 剛好是欄內連續的 1024 bytes（`subarray(cy*1024, (cy+1)*1024)`），網路層要一個 chunk 就是一段 subarray。載入 / 卸載以欄為單位。1a 的中央欄**固定常駐（pinned）**（舊生成器沒辦法單獨重算一欄；記憶體與今天相同，約 35 MB），1b 烘焙後才放開。
- **B3 存取策略（R5）。** ① 點查詢（物理、液體、互動）：`World` 的 getter 走「上一次用到的欄」快取（一次整數比較，命中就不查 Map）；② 批次讀取（光照、chunk 烘焙、光影、液體繪製、地圖、房屋 / 據點 / 家具掃描、霜）：`world.window(x0, y0, w, h, out?)` 把矩形逐欄逐列以 `TypedArray.set(subarray)` 複製進可重用的扁平暫存，原本的扁平迴圈以 `win.w` 當寬度照跑；③ 液體模擬的 inQ / kill 旗標：`TileFlags`（每個 chunk 一塊惰性配置的 `Uint8Array(1024)` + 上一個 chunk 快取）。
- **B4 順序：先換呼叫端、後換儲存。** Task 1–4 在仍是扁平陣列的 `World` 上做出 B3 的 API 並換掉所有呼叫端；Task 5 才換儲存。每個 task 結束都全綠（和使用者舉例的「先做區塊版 World」順序相反：那樣第一個 task 就得一次改完 220 處）。
- **B5 世界邊界。** `World.xMin / xMax`（xMax 不含）。`bounds: 'infinite'` → ±`X_LIMIT`（R3）；`bounds: 'legacy'` → [0, width)，左右邊界照舊是實心牆。預設 `defaultBounds(w, h) = (w === WORLD_W && h === WORLD_H) ? 'infinite' : 'legacy'`：正式遊戲的世界一律無限；指定小尺寸的測試世界（包括 golden 的 160×100 競技場與 format-9 fixture）維持有界——同一套程式碼，只是邊界數字不同。
- **B6 golden 位元組不變。** golden hash 的是 `encodeSave(snapshotGame(g, 0))`（format-9 形狀的中介資料）。`snapshotGame` 的輸出形狀不變，新欄位只在「不是預設值」時才寫（無限世界才有 `bounds` / `outerGen`；有外圍迷霧才有 `exploredOuter`；有解鎖傳送碑才有 `stones`）。真正寫進 IndexedDB 的世界檔 `WORLD_FORMAT` 10 → 11。
- **B7 沒載入的欄**：讀到 = 實心 `T.STONE`、牆 0、沒液體（同今天的世界邊界）；寫入被丟掉（回傳 false）。載入半徑：每個 actor（活著或死亡等待重生）左右各 `LOAD_COLS = 6` 欄同步載入（192 格 > `DESPAWN.x` 110）、`PREFETCH_COLS = 8` 內每刻最多預先生成 1 欄、離**所有** actor 都超過 `UNLOAD_COLS = 11` 欄才卸載、每 `UNLOAD_EVERY = 60` 刻檢查一次。據點爐心範圍所在的欄常駐（居民在那裡活動）。`teleport()` / 重生 / 傳送碑先載入目的地再放人。
- **B8 停放（parking）**：卸載的欄若有改過的 chunk（`modifiedChunks ∪ liquidModified`），把那些 chunk 的六層 payload 留在記憶體（`parked`），存檔照樣寫出；重新載入時先由生成器重算整欄、再蓋上 parked。沒改過的欄直接丟掉、回來時重算（確定性保證相同）。箱子內容本來就在全域 `chests` Map，不跟著卸載。
- **B9 生成器 v0 版面**（spec §8 留給 builder）：海寬 `SEA_W = 480` 格（船速 270 px/s ≈ 17 格/秒 → 約 28 秒；游泳要久得多）；水面 = 該側中央邊欄地表 + 1；海床平均深 46 格、靠岸兩端各 100 格內斜坡、底下的洞穴 / 深層 / 熔岩照常（spec C10）。海之後是生態段：`SEG_W = 900 ± 120` 格（約 80 秒路程），四種現有生態依（seed, 側, 段號）雜湊挑、不連續重複、海後第一段是森林；深度層以中央的 `cavernY / moltenY` 為基準加雜訊；洞穴與礦只用 `engine/noise.ts` 的值雜訊（沒有跨欄的隨機漫步）→ 任一格只由（seed, x, y）決定。`OUTER_GEN_VERSION = 1` 寫進存檔（1b 換生成器時判斷用）。海上小島、地區之間的海、距離難度加成（C12）、驚喜密度（C2）都是 1b。生態段帶 `culture: null` 欄位，替第 2 段的文化地區預留（spec C1）。
- **B10 傳送碑（`傳送碑`；「傳送石」已經是 `recall_stone` 道具的名字）** 是世界物件、**不是 tile**：舊世界中央區一格都不會變（反目標 2）。出生點那顆 id 0、在 `spawn.x + 7` 的生成地表上、永遠是解鎖的（不存）；外圍每側從海後 200 格起每 `STONE_EVERY = 1600` 格一顆（±150 抖動，落在水上就往陸地推），id = 側 × k（東 +k、西 −k）。解鎖集合是世界層級（`DelveGame.stonesUnlocked`，世界檔 `stones`），任何 actor 碰到就全世界解鎖。
- **B11 船（`boat`「小木船」）**：工作台、木板 18 + 繩索 4；像坐騎一樣**不消耗**；`BOAT_SPEED = 270` px/s；在船上不耗氣、不減速、不能挖 / 用道具；按跳下船；狀態不存檔（讀檔後在水裡就是游泳）。
- **B12 地圖**：改成「地圖頁」（8×8 個 chunk = 256×256 px 一張 canvas，LRU 上限 96 頁）；只有含已探索 chunk 的頁才會建立。沒載入但探索過的 chunk 用 `world.peekColumn(cx)`（暫時生成、不註冊、蓋上 parked）在每幀預算內補畫。「已探索 %」只算中央區（外圍無限，百分比沒有意義）。
- **B13 外圍的「發現」**：每個 v0 生態段與兩片海各是一個地區（cat `land`），惰性建立，id = `OUTER_REGION_BASE (2**30) + zigzag(段號, 側)`；會跳「發現：○○」橫幅並存進 `discovery.regions`，但不算進日誌的總數與完成度。
- **B14 型別檢查**：Task 1 Step 0 先錄 `npx tsc --noEmit -p tsconfig.json` 中 `src/scripts/games/delve` 與 `tests/e2e/delve.spec.ts` 的錯誤清單當基準；之後每個 task 結束都要求「沒有新增錯誤」（vitest 不做型別檢查，Task 5 刪掉扁平欄位時靠這一步抓漏網的呼叫端）。

## Global Constraints

- 確定性：生成禁用 `Math.random`；超越函數（`Math.sin / cos / pow / exp / log / sqrt / hypot`）照現有 worldgen 的做法不用在生成裡，只用整數雜湊與四則運算（`engine/noise.ts`），避免跨瀏覽器差異（spec §7、連線風險 R4）。
- 任何一格的生成內容只由（seed, 座標）決定，不依賴玩家先走過哪裡（spec C8）。
- 存檔相容：現有 `GEN_VERSION 7` 的世界直接打開；`SAVE_FORMAT 9` 合併檔與 `WORLD_FORMAT 10` 世界檔都讀得進來；遷移成功前不覆寫原本的存檔（沿用 `split.ts` 的 `backupSlot` 做法）。
- 效能（spec §7）：記憶體只保留玩家附近的區塊（連線時是所有玩家附近）；遠處未改動的區塊卸載後可重算，改過的寫回存檔；讀檔時間不隨走過的距離明顯增加。
- 水平硬邊界 `X_LIMIT = 1_000_000`（R3）；垂直固定 `WORLD_H = 1200`。
- 美術全部程式繪製（Canvas2D），比照現有像素風、調色盤與 1 px 描邊；不加 npm 套件。
- 文字繁體中文寫死（delve 不走 i18n），程式註解比照周圍用繁體中文；禁 `!important`、禁行內樣式（樣式寫在 `src/pages/games/delve.astro` 的 `<style is:global>`）。
- 測試：`npx vitest run <path>`（絕不用 `npm test`，那是 watch 模式）；每個 task 結束前 `npx vitest run` 全套綠 + `npx playwright test tests/e2e/delve.spec.ts --project=chromium` 全綠。GOLDEN / GOLDEN2 每個 task 都不改一字地通過。
- 行尾維持各檔原樣。CRLF 檔（本計畫會動到的）：`engine/game.ts`、`engine/world.ts`、`engine/worldgen.ts`、`engine/inventory.ts`、`render/renderer.ts`、`render/model.ts`、`render/model.test.ts`、`render/session.ts`、`render/textures.ts`、`render/main.ts`、`render/journal.ts`、`render/background.ts`、`save/serialize.ts`、`save/serialize.test.ts`、`save/legacyFixture.ts`、`save/character.ts`、`tests/e2e/delve.spec.ts`。新檔用 LF。
- Conventional Commits，訊息最後一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 路徑：以下 `engine/…`、`render/…`、`save/…` 都在 `src/scripts/games/delve/` 底下。

## Review Focus

1. **舊 4200 世界的最後一個中央 chunk（cx 131）**：舊存檔 payload 在 x ≥ 4200 是補 0（空氣）——讀進無限世界時不可以把新地形 / 海挖成空氣 → Task 6 的補零測試。
2. **兩個玩家相距很遠**（例如一人在 x = −3000、一人在 x = +9000）：兩邊的地形都在、液體 / 怪物各自運作，中間的欄卸載；任一人走開後自己的區域照規則卸載 → Task 8 的雙 actor 串流測試。
3. **改過的遠方欄**：挖了洞、走遠（欄被停放）、存檔、讀檔、走回來 → 洞還在；沒改過的遠方欄回來時逐格與第一次生成相同 → Task 5（停放）+ Task 8（存讀檔往返）。
4. **撞到硬邊界**：走路 / 坐船 / 傳送到 ±1,000,000 → 實心牆、不當機、鍵值合法、地圖不能拖過界 → Task 8、Task 12。
5. **傳送 / 重生到沒載入的遠方**（傳送碑、床在遠方、死在遠方回出生點）：落點的欄先載入，不會掉進「沒載入 = 石頭」裡卡住 → Task 8（teleport / respawn）+ Task 11（傳送碑）。

---

### Task 1：座標鍵與「與儲存無關」的 World 存取 API（仍是扁平儲存）

**Files:**
- Create: `engine/coords.ts`、`engine/coords.test.ts`、`engine/world.central.test.ts`、`engine/world.perf.test.ts`
- Modify: `engine/world.ts`（只加方法，不改既有欄位）、`engine/world.test.ts`

**Interfaces — Produces:**

```ts
// engine/coords.ts
export const X_LIMIT = 1_000_000;
export const T_BASE = 2 ** 25, T_OFF = 2 ** 21, T_Y = 4096;   // 外圍 tile 鍵
export const C_BASE = 2 ** 20, C_OFF = 2 ** 16, C_Y = 128;    // 外圍 chunk 鍵
export function tileKey(width: number, x: number, y: number): number;
export function tileXY(width: number, k: number): { x: number; y: number };
export function chunkKey(chunksX: number, cx: number, cy: number): number;
export function chunkXY(chunksX: number, k: number): { cx: number; cy: number };
export function isOuterChunkKey(k: number): boolean;
export type WorldBounds = 'legacy' | 'infinite';
export function defaultBounds(width: number, height: number): WorldBounds;
```

`World` 新增（扁平實作，Task 5 換成欄實作，簽名不變）：`xMin: number; xMax: number`（此 task 恆為 0 / width）；`idx(x, y)` 改呼叫 `tileKey`（中央結果不變）；`tileXY(k)`；`chunkIndex(cx, cy)` / `chunkCoords(k)` 改呼叫 `chunkKey` / `chunkXY`；`isFrozen(x, y): boolean`、`setFrozen(x, y, on: boolean): void`（不標 dirty）；`variantAt(x, y): number`；`setLiquidRaw(x, y, amount, type): void`（不標 dirty，熱路徑用）；`touchLiquidAt(x, y): void`（`touchLiquid(i)` 保留、改用 `tileXY`）；`layers: GenLayers | null` 與 `layersAt(x): { rock: number; deep: number; molten: number }`（中央陣列，越界夾到邊欄——Task 7 接外圍）；`surfaceAt` / `biomeAt` 不變；`window(x0, y0, w, h, out?: TileWindow): TileWindow`；`forEachChunk(fn: (cx: number, cy: number) => void): void`（常駐 chunk，cy 外層、cx 內層，同 `markAllDirty` 的順序）；`liquidTotal()` 不變。

```ts
export interface TileWindow {
  x0: number; y0: number; w: number; h: number;
  fg: Uint8Array; wall: Uint8Array; liquid: Uint8Array; liquidType: Uint8Array;
  frozen: Uint8Array; half: Uint8Array; variant: Uint8Array;   // 長度 ≥ w*h，索引 (y-y0)*w + (x-x0)
}
```

`window` 對邊界外的格填 `fg = T.STONE`、其餘 0（`variant` 照座標雜湊）；`out` 夠大就重用不配置。

- [ ] **Step 0：基準**：記下 `npx tsc --noEmit -p tsconfig.json` 中 delve 相關錯誤清單（存成 scratchpad 檔，之後每個 task 比對）。
- [ ] **Step 1：失敗測試 `coords.test.ts`**：`tileKey(4200, 5, 7) === 7*4200 + 5`；`tileKey(4200, -1, 0) >= T_BASE`、`tileKey(4200, 4200, 0) >= T_BASE`；對 x ∈ {−X_LIMIT, −33, −32, −1, 0, 31, 4199, 4200, 4223, X_LIMIT−1}、y ∈ {0, 1199} 都有 `tileXY(tileKey(x, y)) = {x, y}`；同理 `chunkXY(chunkKey(cx, cy))` 對 cx ∈ {−31250, −1, 0, 131, 132, 31249}、cy ∈ {0, 37}；不同座標的鍵兩兩不同（抽樣 10⁴ 點）；負數座標的 chunk 是 `x >> 5`、局部座標是 `x & 31`（−1 → chunk −1、local 31）；`defaultBounds(4200, 1200) === 'infinite'`、`defaultBounds(160, 100) === 'legacy'`。
- [ ] **Step 2：失敗測試 `world.test.ts` 新增**：`window` 讀到的每格等於 getter（含跨 chunk、跨左右邊界的矩形，邊界外是 STONE）；`isFrozen / setFrozen`、`setLiquidRaw` 不標 dirty、`touchLiquidAt` 標液體 dirty；`layersAt` 夾邊；`forEachChunk` 的順序等於舊 `markAllDirty`。
- [ ] **Step 3：R4 中央相同測試 `world.central.test.ts`（在任何實作改動之前錄）**：seed `'infinite-1a'`、預設尺寸跑 `generateWorld`，對 `gen.world` 的 fg / wall / liquid / liquidType / half 各算 FNV-1a，另算 `surface`、`biome`、chests（鍵 + 內容 JSON）的 hash，**用目前的程式碼跑一次、把值寫死**成 `CENTRAL_FINGERPRINT`；再對 `new DelveGame({ seed, gen })` 建構完的 `world` 用 **getter** 逐格讀中央區（x∈[0, width)、y∈[0, height)）算同一組 hash，寫死成 `GAME_FINGERPRINT`（建構子可能會動到格子，所以兩組分開錄）。斷言：(a) 生成器輸出 = `CENTRAL_FINGERPRINT`（守住舊生成器不被動到）；(b) DelveGame 的世界經 getter 讀出 = `GAME_FINGERPRINT`（Task 5 換儲存後這條才真正比到新儲存）。timeout 60 s。註解寫明：不准為了讓測試過而重錄。
- [ ] **Step 4：效能測試 `world.perf.test.ts`（R5）**：P1 點查詢——在 96×96 範圍內隨機漫步 2,000,000 次 `isSolid` + `getFg`，與測試檔內一份「舊 World 扁平實作」參考迴圈（`Uint8Array`、`y*W+x`、同樣的邊界判斷）比，取 5 次中位數，**比值 ≤ 2.0**；P2 批次讀取——`window(…, 200, 140)` 500 次 vs 參考的逐列 `set(subarray)`，**比值 ≤ 2.5**；P3 光照——`LightEngine.compute` 在生成世界地表附近 130×75 視窗、預設 margin，20 次中位數；P4 液體——120×60 的湖放水（挖掉一側堤）後 `step()` 600 刻。P3 / P4 在本 task 量出基準，`ceiling = 2 × 量到的值（往上取整 ms）` 寫死進測試並在 commit 訊息內記錄量到的數字。整個 describe 可用 `DELVE_SKIP_PERF=1` 跳過（慢機器）。
- [ ] **Step 5：跑測試確認 FAIL**：`npx vitest run src/scripts/games/delve/engine/coords.test.ts src/scripts/games/delve/engine/world.test.ts` → 新斷言 FAIL；`world.central.test.ts` 與 golden 通過。
- [ ] **Step 6：實作** `coords.ts` 與上列 `World` 方法（扁平實作）。
- [ ] **Step 7：全套**：`npx vitest run` 全綠（含 golden、central、perf）；delve e2e 全綠；tsc 沒有新增錯誤。
- [ ] **Step 8：Commit** `refactor(delve): coordinate keys and storage-agnostic world access`

### Task 2：液體與霜改走存取 API（熱路徑）

**Files:**
- Create: `engine/tileFlags.ts`、`engine/tileFlags.test.ts`
- Modify: `engine/liquid.ts`、`engine/frost.ts`、`engine/gen/liquids.ts`（只有型別）、`engine/liquid.test.ts`、`engine/liquid.drain.test.ts`、`engine/liquid.springs.test.ts`、`engine/frost.test.ts`、`engine/game.liquid.test.ts`（機械性改寫）

**Interfaces — Consumes:** Task 1 的 `idx / tileXY / getFg / getLiquid / getLiquidType / setLiquidRaw / touchLiquidAt / isFrozen / setFrozen / xMin / xMax / height / window`。
**Produces:**

```ts
// engine/tileFlags.ts —— 每 chunk 一塊 Uint8Array(1024)，惰性配置，上一個 chunk 快取
export class TileFlags {
  constructor(chunksX: number);
  get(x: number, y: number): number;
  set(x: number, y: number, v: number): void;
  dropColumn(cx: number): void;   // Task 8 卸載時用
}
// engine/liquid.ts
export interface LiquidWorld {   // World（Task 5 後的欄實作）與 GenGrid（舊扁平類別）都要滿足
  readonly width: number; readonly height: number; readonly chunksX: number; xMin: number; xMax: number;
  inBounds(x: number, y: number): boolean; idx(x: number, y: number): number; tileXY(k: number): { x: number; y: number };
  getFg(x: number, y: number): number; getLiquid(x: number, y: number): number; getLiquidType(x: number, y: number): number;
  isFrozen(x: number, y: number): boolean; setLiquidRaw(x: number, y: number, a: number, t: number): void;
  touchLiquidAt(x: number, y: number): void; onTileChange: ((x: number, y: number) => void) | null;
  window(x0: number, y0: number, w: number, h: number, out?: TileWindow): TileWindow;
}
export class LiquidSim { constructor(world: LiquidWorld, opts?: LiquidOptions); forgetColumn(cx: number): void; /* 其餘公開 API 不變 */ }
export function updateFreeze(w: World, sim: LiquidSim | null, dayIndex: number, blocked?: (x: number, y: number) => boolean,
  keepOpen?: Set<number>, cols?: Iterable<number>): { frozen: number; thawed: number };   // cols 省略 = [xMin, xMax) 內所有欄
```

規則：`LiquidSim` 內部從扁平 index 改成 (x, y)：佇列存 `idx(x, y)` 鍵（`Queue.buf` 改 `Float64Array`，外圍鍵超過 int32），取出時 `tileXY` 一次；鄰格一律用座標讀寫（原本 `i ± 1`、`i ± W` 的邊界守衛 `x > 0`、`x < W − 1`、`y + 1 < height` 改成「讀 getter，越界 = 實心」，結果相同）；`inQ / kill` 改 `TileFlags`；`setSprings` 的 `i / drains` 存鍵；`wakeRect` 夾在 `[xMin, xMax)`；處理順序、整數運算、預算一個字都不變（golden 與 `world.central` 的指紋——舊生成器的液體靜置也跑這段——會抓任何偏差）。`updateFreeze` 改用 getter / `window`，迴圈 x 由小到大（與現在相同順序）。

- [ ] **Step 1：失敗測試**：`tileFlags.test.ts`——負座標、跨 chunk、`dropColumn` 後讀回 0、不同 chunk 互不干擾；`liquid.test.ts` 新增：在 `xMin = 0` 的世界最左欄放水，不會「繞到上一列最右邊」（舊 `i − 1` 的陷阱）；鄰格在邊界外視為實心。
- [ ] **Step 2：** 跑 → 新斷言 FAIL（`TileFlags` 不存在）。
- [ ] **Step 3：實作**；既有液體 / 霜測試把 `w.liquid[i]`、`w.frozen[i]` 這類直接存取機械性改成 getter / setter（斷言值不變）。
- [ ] **Step 4：** `npx vitest run src/scripts/games/delve` 全綠，golden、central、perf P4 都通過；delve e2e 全綠；tsc 無新增。
- [ ] **Step 5：Commit** `refactor(delve): liquids and frost use coordinate access`

### Task 3：其餘引擎呼叫端與「每欄函式」

**Files:**
- Modify: `engine/lighting.ts`、`engine/spawn.ts`、`engine/npcPath.ts`、`engine/housing.ts`、`engine/settlement.ts`、`engine/folk.ts`、`engine/discovery.ts`、`engine/houseFixture.ts`、`engine/game.ts`（約 20 處：`game.ts:797, 1100, 1128, 1168, 1952, 1969-1972, 2814, 3080, 3125, 3139, 3473, 3674-3679, 4083` 一帶）、`engine/world.ts`（`layers` 由 DelveGame 建構時設定）
- Test: `engine/lighting.test.ts`、`engine/spawn.test.ts`、`engine/npcPath.test.ts`、`engine/discovery.test.ts`、`engine/housing.test.ts`、`engine/game.season.test.ts` 等（新增斷言 + 機械性改寫）

**Interfaces — Consumes:** Task 1。**Produces:**
- `LightEngine.compute(world, view, opts)` 簽名不變；內部以 `world.window` 取 `[max(xMin, x0−margin), min(xMax, x1+margin))` 的矩形；`depthSurface(surfaceAt: (x: number) => number, x0: number, w: number, out: Int32Array)`、`depthSurfaceAt(surfaceAt, x)`（原本吃陣列）。
- `HabitatSource` 改為 `{ world: World; night: boolean }`（`layers` 拿掉，改 `world.layersAt(x)`）；`homeNear` 用 `window`。
- `findPath` 的鍵改 `w.idx`；`settlement` / `housing` 的掃描用 `window`、夾邊用 `xMin / xMax`。
- `Discovery` 的格網鍵改 `(gx + 2**15) * 64 + gy`（負 gx 不再撞到別列）。
- `DelveGame` 內所有 `this.layers[…][x]` 改 `this.world.layersAt(x)`；`i % width` 改 `world.tileXY(i)`；`Math.min(world.width − 1, …)` 這類夾邊改 `world.xMin / xMax`。

- [ ] **Step 1：失敗測試**：`discovery.test.ts`——一個 x ∈ [−200, −100) 的地區與一個 x ∈ [0, 64) 的地區，`regionsAt(-150, 10)` 只回前者、`regionsAt(10, 10)` 只回後者；`lighting.test.ts`——`depthSurface` 吃函式時結果等於吃陣列（同一組資料）；`spawn.test.ts`——`habitatAt({ world, night })` 在中央的結果與舊介面相同（同一個世界、50 個點）。
- [ ] **Step 2：** FAIL。
- [ ] **Step 3：實作**；測試裡直接讀 `w.fg[…]` / `w.width` 算 index 的地方機械性改 getter。
- [ ] **Step 4：** 全套綠 + golden + perf P3；delve e2e；tsc 無新增。
- [ ] **Step 5：Commit** `refactor(delve): engine systems read the world through coordinates`

### Task 4：畫面與存檔呼叫端 + 扁平存取清零

**Files:**
- Modify: `render/renderer.ts`（chunk 烘焙 523-525、樹 621、植物 642、673-693、生態 396、1065）、`render/lightShade.ts`、`render/liquidDraw.ts`、`render/mapModel.ts`（`paintMapChunk` 改吃 `window`）、`render/mapView.ts`（仍是中央整張 canvas，只把讀取改走 API；Task 12 重做）、`render/model.ts`（`chunksTouchRect(cis, world, …)` 用 `world.chunkCoords`）、`render/weatherFx.ts`、`render/settleDraw.ts`、`render/journal.ts`、`save/serialize.ts`（`readChunk` / `writeChunk` / `readLiquids` / 還原液體 / `restoreChests` / 結冰與半格差分 / 掉落物邊界）、`save/legacyFixture.ts`、`tests/e2e/delve.spec.ts`（`worldHash` 改成 getter 逐格讀中央區；3433 行那個沒用到的 `world.fg.subarray` 拿掉）
- Test: `render/*.test.ts` 與 `save/*.test.ts` 中直接讀扁平陣列的地方（機械性）

**Interfaces — Consumes:** Task 1–3。**Produces:** `World.readChunkPayload(cx, cy): ChunkPayload`（fg / wall 各 1024，邊界外補 0——與今天 `readChunk` 位元組相同）、`World.writeChunkPayload(cx, cy, p: ChunkPayload, maxX?: number): void`（`maxX` 省略 = 整塊；Task 6 用它做補零規則）、`World.readChunkLiquids(cx, cy, outAmount: Uint8Array, outType: Uint8Array, offset: number): void`、`World.flaggedTiles(layer: 'frozen' | 'half'): number[]`（升冪的 tile 鍵，給差分編碼）。`serialize.ts` 的 `readChunk(world, ci)` / `writeChunk(world, ci, data)` 改成呼叫上面的方法（簽名保留給既有測試）。

- [ ] **Step 1：失敗測試**：`save/serialize.test.ts` 新增「`readChunkPayload` 與舊 `readChunk` 對 chunk 0 / 最後一欄 / 最後一列位元組相同」「`flaggedTiles('frozen')` 等於舊的掃描結果」；並加一個**扁平存取清零**測試（`engine/flatAccess.test.ts`，用 `node:fs` 讀 `src/scripts/games/delve/**/*.ts`，排除 `engine/world.ts`、`engine/worldgen.ts`、`engine/gen/**`、`*.test.ts`、`render/genSection.ts`），設 `R = (?:world|w|this\.world|game\.world|g\.world)`，下列樣式一個都不能出現：① `\bR\.(fg|wall|liquid|liquidType|frozen|half|variant)\b`（直接讀扁平層）；② `\{[^}]*\b(fg|wall|liquid|liquidType|frozen|half|variant)\b[^}]*\}\s*=\s*R\b`（解構取層）；③ `[*%/]\s*R\.width\b`（`y * w.width`、`i % w.width` 這類 index 算術）；④ `R\.width\s*-\s*\d`、`Math\.min\(\s*R\.width`、`R\.width\s*\*\s*(S|TILE_SIZE)\b`（拿中央寬當左右邊界）；⑤ `=\s*R\.width\s*[,;]`（把寬度存進別名再拿去算）。`w.width * w.height` 這種面積、測試 fixture 裡 `x < w.width` 的迴圈不在禁止之列。
- [ ] **Step 2：** FAIL（清零測試列出剩下的檔案）。
- [ ] **Step 3：實作**到清零測試通過。
- [ ] **Step 4：** 全套綠；golden（存檔位元組靠 `readChunkPayload` 與舊 `readChunk` 相同）；format-9 fixture 測試；delve e2e；tsc 無新增。
- [ ] **Step 5：Commit** `refactor(delve): render and save read the world through coordinates`

### Task 5：換儲存——區塊欄、常駐 / 停放 / 卸載、`GenGrid`

**Files:**
- Create: `engine/column.ts`、`engine/gen/grid.ts`（`GenGrid` = 現在的扁平 `World` 類別整份搬過去 + Task 1 的 API，給舊生成器用）、`engine/column.test.ts`、`engine/world.stream.test.ts`
- Modify: `engine/world.ts`（內部換成欄）、`engine/worldgen.ts` 與 `engine/gen/*.ts`（`World` → `GenGrid`，只有型別 / `new`）、`engine/game.ts`（`this.world = World.fromGen(gen, …)`）、`render/genSection.ts`（`peek` 的型別）、`engine/index.ts`、`engine/world.perf.test.ts`（P1 / P2 的參考改成 `GenGrid`）、生成器相關測試的 `new World` → `new GenGrid`

**Interfaces — Consumes:** Task 1–4。**Produces:**

```ts
// engine/column.ts
export class Column {
  readonly cx: number; readonly height: number;
  readonly fg: Uint8Array; readonly wall: Uint8Array; readonly liquid: Uint8Array; readonly liquidType: Uint8Array;
  readonly frozen: Uint8Array; readonly half: Uint8Array; readonly variant: Uint8Array;   // 長度 32*height
  constructor(cx: number, height: number);   // variant 用與今天相同的座標雜湊
}
export const li = (x: number, y: number): number => (y << 5) | (x & 31);
export interface ColumnLayers { rock: number; deep: number; molten: number; }
export interface ColumnSource {
  readonly version: number;
  /** 寫入第 col.cx 欄中 world x ∈ [x0, x1) 的格（呼叫端已排除中央區） */
  fill(col: Column, x0: number, x1: number): void;
  surfaceAt(x: number): number; biomeAt(x: number): number; layersAt(x: number): ColumnLayers;
}
export interface ChunkData { fg: Uint8Array; wall: Uint8Array; liquid: Uint8Array; liquidType: Uint8Array; frozen: Uint8Array; half: Uint8Array; }
// engine/world.ts
export interface WorldOptions { bounds?: WorldBounds; source?: ColumnSource | null; }
class World {
  constructor(width: number, height: number, opts?: WorldOptions);   // 中央欄全部建立（空氣）並 pinned
  static fromGen(grid: GenGrid, layers: GenLayers, opts?: WorldOptions): World;   // 複製中央、chests / potDrops / unlocked、surface / biome、rockY…
  readonly bounds: WorldBounds;
  columnAt(x: number): Column | null;   // 常駐才回；上一欄快取
  isResident(cx: number): boolean; residentColumns(): number[];
  ensureColumn(cx: number): Column;      // 生成（source；沒有 source = 空氣）+ 蓋上 parked；中央欄恆常駐
  unloadColumn(cx: number): boolean;     // pinned 的拒絕；有改過的 chunk → 停放
  peekColumn(cx: number): Column;        // 常駐就回常駐的；否則暫時生成 + parked，不註冊（地圖用）
  pin(cx: number): void; unpin(cx: number): void;
  readChunk(cx: number, cy: number): ChunkData | null;    // 常駐或停放（網路層 / 存檔用）
  writeChunk(cx: number, cy: number, d: ChunkData): void; // 標為已修改；欄沒常駐就先 ensure
  parkedChunks(): number[];              // 停放中的 chunk 鍵
  drainColumnEvents(): { loaded: number[]; unloaded: number[] };
}
```

規則：getter / setter 先比 `x` 是否在 `[xMin, xMax)`、y 是否在 `[0, height)`，再走上一欄快取 → `col.fg[li(x, y)]`；沒常駐 → B7 的預設值。`touch()` 的鄰 chunk dirty 改用 `chunkKey(cx ± 1, …)`，夾在邊界內（有界世界結果與今天相同）。`markAllDirty` / `forEachChunk` 走常駐欄。`window` 逐欄 `set(subarray)` 複製列段。建構 / `fromGen` 時，中央欄裡 x ≥ width 的格（width 不是 32 的倍數時最後一欄的右半）在有 source 時由 `source.fill` 填。`variant` 不再是全世界陣列。**扁平欄位 `fg / wall / liquid / liquidType / frozen / half / variant` 從 `World` 刪除**（`GenGrid` 保留）；`surface / biome / layers` 保留為中央每欄陣列（golden 競技場會寫 `w.surface[x]`、`w.biome[x]`）。此 task 結束時所有正式世界仍是 `legacy` 有界（`defaultBounds` 的切換在 Task 8）。

- [ ] **Step 1：失敗測試 `column.test.ts` / `world.stream.test.ts`**：用一個測試用 `ColumnSource`（`fill` 依 `hash(x, y)` 寫 STONE / DIRT / AIR）建 `bounds: 'infinite'` 的小世界：`ensureColumn(-3)` 後 `getFg(-90, 40)` 等於 source 的值；沒常駐的欄讀回 STONE、`isSolid` 為真、`setFg` 回 false；改一格 → `unloadColumn` → `parkedChunks()` 含那個 chunk → `ensureColumn` 回來那格還在、其他格等於 source；沒改過的欄卸載再載入逐格相同；`readChunk` → 另一個同 source 的世界 `writeChunk` → 兩邊該 chunk 每層相同（網路層的形狀）；`peekColumn` 不改變 `residentColumns()`；中央欄 `unloadColumn` 回 false；**載入順序無關**：兩個世界分別以 [−5..5] 正序與亂序 ensure，所有常駐欄位元組相同。
- [ ] **Step 2：** FAIL。
- [ ] **Step 3：實作**（`GenGrid` 搬移 + 欄儲存 + `fromGen`）。
- [ ] **Step 4：** `world.central.test.ts` 的 (b) 這時才真正比到新儲存——要過；golden；perf P1 ≤ 2.0、P2 ≤ 2.5（參考 = `GenGrid`）、P3 / P4 在 Task 1 寫死的上限內；全套綠；delve e2e；tsc 無新增（這一步會抓出漏改的扁平存取）。
- [ ] **Step 5：Commit** `feat(delve): chunk-column world storage with parking`

### Task 6：迷霧按區塊 + 存檔格式 11（舊存檔一次遷移、先備份）

**Files:**
- Create: `save/__fixtures__/format10.delve`（由 freeze 測試在升版**之前**產生）、`save/worldSave.v10.freeze.test.ts`、`save/worldSave.v11.test.ts`
- Modify: `engine/explore.ts`、`engine/explore.test.ts`、`engine/game.ts`（`ExploredMap` 建構）、`save/serialize.ts`、`save/worldSave.ts`、`save/split.ts`、`save/storage.ts`（只有列表濾掉 `.v10.bak`，原本就濾 `*.bak`——確認即可）、`render/mapView.ts`（`chunkHasExplored` 改 `ex.chunkBits`）、`render/journal.ts`（探索 % 改 `centralCount`）

**Interfaces — Consumes:** Task 5（`readChunk`、`parkedChunks`、`flaggedTiles`、`bounds`、`ColumnSource`）。**Produces:**

```ts
// engine/explore.ts —— 儲存改成每 chunk 128 bytes（bit = ly*32 + lx），API 語意不變、x 可為任何合法座標
export interface OuterBitsSave { chunks: number[]; data: string /* base64(encodeRle(依序串接的 1024-bit 區塊)) */ }
class ExploredMap {
  constructor(width: number, height: number, bits?: Uint8Array);   // width / height = 中央框（舊 RLE 用）
  count: number; centralCount(): number;
  has(x, y); reveal(x, y); revealDisc(cx, cy, r); revealLit(L, view, t);   // 不再夾在 [0, width)
  drainDirty(): number[];                 // chunk 鍵
  chunkBits(cx: number, cy: number): Uint8Array | undefined;
  exploredChunks(): number[];
  encode(): Uint8Array;                   // 中央區 row-major RLE——與舊 encode 位元組相同
  encodeOuter(): OuterBitsSave | undefined;   // 任何「含中央框外已探索格」的 chunk，整塊 1024 bit
  static decode(bytes: Uint8Array, width: number, height: number, outer?: OuterBitsSave): ExploredMap;   // outer 以 OR 疊上
}
// save/serialize.ts
export interface SaveHeader { /* 既有欄位 */ bounds?: 'infinite'; outerGen?: number; exploredOuter?: OuterBitsSave; }
export interface RestoreOptions { /* 既有 */ bounds?: WorldBounds; source?: ColumnSource; }   // 測試用覆寫
export function validChunkKeys(keys: unknown, h: Pick<SaveHeader, 'width' | 'height' | 'bounds'>): number[];
export function validTileKey(k: number, h: Pick<SaveHeader, 'width' | 'height' | 'bounds'>): boolean;
// save/worldSave.ts
export const WORLD_FORMAT = 11;
export const V10_BACKUP_SUFFIX = '.v10.bak';
export interface WorldHeader { format: 10 | 11; /* 既有 */ bounds?: 'infinite'; outerGen?: number; }
export interface VisitSave { /* 既有 */ exploredOuter?: OuterBitsSave; }
// save/split.ts
class SplitSession { /* 既有 */ pendingBackup: string | null; }   // fromLoaded 讀到 format 10 → V10_BACKUP_SUFFIX
```

規則：`snapshotGame`：`chunks` = 常駐 + 停放的已修改 chunk 鍵（數字升冪；外圍鍵排在中央之後）；chests / unlocked / minedIce / 結冰與半格差分都可以含外圍 tile 鍵；`bounds: 'infinite'` 與 `outerGen` **只在無限世界才寫**；`exploredOuter` 只在非空才寫（B6）。讀檔：`bounds` 有值 → 外圍鍵合法、chunk payload 整塊 32 欄寫入；沒有 `bounds`（format ≤ 10 的舊檔）→ 只接受中央範圍的鍵（同今天的 `restoreBlocker`），**payload 只寫 x < width 的格（補零規則）**。`new DelveGame({ …, bounds: opts.bounds ?? h.bounds ?? defaultBounds(h.width, h.height), columnSource: opts.source })`——`DelveOptions` 加 `bounds?: WorldBounds` 與 `columnSource?: ColumnSource`（測試注入；正式來源在 Task 8 接）。`decodeWorld` 接受 10 與 11；`splitSnapshot` 一律寫 11；`joinSplit` 原樣帶上新欄位。`saveSplit`：`s.pendingBackup` 有值 → 先 `store.backupSlot(slot, slot + V10_BACKUP_SUFFIX)`，成功才 `putSplit`，成功後清空；備份丟錯就整個丟出、原檔不動。舊合併檔（≤ 9）的遷移路徑照舊（寫出的是 11）。

- [ ] **Step 1：先凍結 format-10 fixture（升版前）**：`worldSave.v10.freeze.test.ts`（`DELVE_FREEZE_FIXTURE=1` 才寫，比照 `legacyFixture.freeze.test.ts`）用 `buildLegacyFixtureGame()`（200×100：200 不是 32 的倍數，chunk 6 = x 192..223 跨出中央）存成世界檔，寫入 `__fixtures__/format10.delve` 並 commit 進這個 task。
- [ ] **Step 2：失敗測試 `explore.test.ts`**：負 x 揭露後 `has` 為真、`drainDirty` 給外圍鍵；中央 `encode()` 與舊實作位元組相同（在測試裡用一份舊扁平實作當參考，揭露同一組點）；`encodeOuter` → `decode` 往返相同；只揭露中央時 `encodeOuter()` 是 `undefined`。
- [ ] **Step 3：失敗測試 `worldSave.v11.test.ts`**：(a) **補零規則（Review Focus 1）**：讀 `format10.delve`、`RestoreOptions { bounds: 'infinite', source: 填 STONE 的測試來源 }` → chunk 6（中央欄、常駐，存檔裡是改過的 chunk）的 x 200..223 是 STONE（不是 payload 補的空氣），x < 200 與 fixture 相同；(b) 無限世界：在 x = −40 與 x = 5000 各挖一格、外圍揭露迷霧、有一個外圍箱子、一格結冰、一格半格 → `saveSplitGame` → `restoreSplit` → 全部回來、`header.format === 11`；(c) 欄被停放時存檔也包含那個 chunk；(d) `SplitSession.fromLoaded` 吃 format 10 → 第一次 `saveSplit` 先呼叫 `backupSlot(slot, slot + '.v10.bak')`、再 `putSplit`；第二次不再備份；`backupSlot` 丟錯 → `putSplit` 沒被呼叫；(e) format 10 檔裡出現外圍鍵 → `restoreBlocker` 回 `size`；(f) golden 與 format-9 fixture 測試不改一字通過。
- [ ] **Step 4：** FAIL。
- [ ] **Step 5：實作**。
- [ ] **Step 6：** 全套綠 + golden；delve e2e（存讀檔相關的那幾個 test 特別看）；tsc 無新增。
- [ ] **Step 7：Commit** `feat(delve): per-chunk fog and world save format 11`

### Task 7：外圍生成器 v0

**Files:**
- Create: `engine/chunkgen/profile.ts`、`engine/chunkgen/fill.ts`、`engine/chunkgen/index.ts`、`engine/chunkgen/chunkgen.test.ts`
- Modify: `engine/world.ts`（`surfaceAt / biomeAt / layersAt` 在中央外改問 source）

**Interfaces — Consumes:** Task 5 的 `Column`、`ColumnSource`、`ColumnLayers`、`li`；`engine/noise.ts`（`seedInt`、`hash2`、`vnoise1`、`vnoise2`、`fbm2`）。**Produces:**

```ts
// engine/chunkgen/profile.ts —— 全部是 (seed, x) 的純函式
export const SEA_W = 480, SEG_W = 900, SEG_JITTER = 120, SEA_DEPTH = 46, SHORE_RAMP = 100;
export interface CentralFrame { width: number; height: number; edgeL: number /* surface[0] */; edgeR: number /* surface[width-1] */; cavernY: number; moltenY: number; }
export function frameOf(w: { width: number; height: number; surface: Int16Array; cavernY: number; moltenY: number }): CentralFrame;
export interface OuterSegment { side: 1 | -1; k: number; x0: number; x1: number; biome: BiomeId; culture: string | null /* 1a 恆 null */; }
export type OuterZone = { kind: 'central' } | { kind: 'sea'; side: 1 | -1; d: number } | { kind: 'land'; side: 1 | -1; d: number; seg: OuterSegment };
export class OuterProfile {
  constructor(seed: string, frame: CentralFrame);
  zoneAt(x: number): OuterZone;   // d = 離中央邊欄的距離（東：x − width；西：−1 − x）
  surfaceAt(x: number): number; waterTopAt(x: number): number | null; biomeAt(x: number): BiomeId;
  layersAt(x: number): ColumnLayers; segmentAt(x: number): OuterSegment | null;
}
// engine/chunkgen/index.ts
export const OUTER_GEN_VERSION = 1;
export class OuterGen implements ColumnSource { constructor(seed: string, frame: CentralFrame); readonly profile: OuterProfile; }
```

內容（B9）：海——`waterTopAt = edge + 1`，海床 `edge + SEA_DEPTH ± 8`、兩端 `SHORE_RAMP` 格內線性升到岸邊，海床 3 格沙；水是滿格（255）`LIQ.WATER`、生成即靜止。陸地——地表 = 該側 `edge − 6 −` 生態起伏（森林 14、沙漠 8、雪原 28、叢林 12 格振幅，段界 40 格內線性混合），離海 40 格內是沙灘斜坡；表層：森林草 + 泥土、沙漠沙 6 格 + 砂岩、雪原雪 5 格、叢林叢林草 + 泥巴；`rock = surface + 18 ± 8`、`deep = cavernY ± 16`、`molten = moltenY ± 12`；方塊 / 背景牆對照沿用 `worldgen.ts` 1353 行的 `natural` 對照（泥土 / 石頭 / 深層岩 / 玄武岩 + 各自的牆）。洞穴——岩層以下「義大利麵」：`|vnoise2(x, y, 48, s) − 0.5| < 0.035`（越深越寬），洞穴層大洞窟 `fbm2(x, y, 64, s) > 0.68`，地表下 6 格內不挖（`vnoise1(x, 40, s) > 0.85` 的地方開入口）；熔岩深淵的洞底 40 格以下填熔岩。礦——每種礦一個 `vnoise2(x, y, 6, s_ore)` 門檻，限定深度層：銅（泥土 / 岩層上半）、鐵（岩層）、銀（岩層下半 / 洞穴層）、金（洞穴層以下）。樹——森林 / 叢林地表依 `hash2(x, 0, s)` 決定樹根（間距 ≥ 4），樹冠用 `WOOD / LEAVES`，畫一欄時掃 `[x0 − 3, x1 + 3)` 的樹根所以跨欄樹冠一致；沙漠仙人掌同理。全部不用 `Math.random` 與超越函數。

- [ ] **Step 1：失敗測試 `chunkgen.test.ts`**：(1) **確定性 / 與順序無關**：同一個 `OuterGen` 對欄 [−40..−20] ∪ [140..160] 正序、倒序、交錯各 fill 一次，位元組全部相同；兩個獨立實例也相同；(2) **接縫**：對 width 4200 的框，x = 4200..4240 與 x = −1..−41 每欄 `waterTopAt === edge + 1`、水面以下到海床都是水、`zoneAt` 為 sea；海寬 = `SEA_W`；(3) **層次**：x ∈ [−20000, 20000) 每 97 格抽一欄，`surfaceAt < layers.rock < layers.deep < layers.molten < height`；(4) **多樣性**：每側前 8 段四種生態都出現、相鄰段不同、第 0 段是森林；`segmentAt(x).culture === null`；(5) **內容**：陸地每 10 欄裡銅 / 鐵 / 銀 / 金各至少 1 格出現在對的層；岩層空氣比例在 3%–30%；(6) **禁用 API**：以 `node:fs` 讀 `engine/chunkgen/*.ts`（排除 test），不得出現 `Math.random|Math.sin|Math.cos|Math.pow|Math.exp|Math.log|Math.sqrt|Math.hypot|\*\*`；(7) **效能**：height 1200 的 `fill` 20 欄中位數 ≤ 8 ms。
- [ ] **Step 2：** FAIL。
- [ ] **Step 3：實作**；`World.surfaceAt / biomeAt / layersAt` 在 `x ∉ [0, width)` 時問 `source`（沒有 source → 夾到邊欄，同今天）。
- [ ] **Step 4：** 全套綠 + golden；tsc 無新增。
- [ ] **Step 5：Commit** `feat(delve): outer chunk generator v0 (sea, four biomes, caves, ores)`

### Task 8：引擎解除寬度限制——無限邊界、各玩家的載入區、邊界上的系統

**Files:**
- Create: `engine/streaming.ts`、`engine/streaming.test.ts`、`engine/game.infinite.test.ts`
- Modify: `engine/game.ts`（建構、`step` 開頭、`teleport`、重生、據點 pin、外圍發現）、`engine/world.ts`、`engine/liquid.ts`（載入欄時喚醒）、`engine/frost.ts`（`freezeColumns`）、`engine/discovery.ts`（外圍地區）、`engine/folk.ts`（旅人生成夾邊 395 行改 `xMin / xMax`）、`engine/settlement.ts`（核心 → pin）、`save/serialize.ts`（`validDiscovery` 接受外圍地區 id）、`render/session.ts`（無）

**Interfaces — Consumes:** Task 5–7。**Produces:**

```ts
// engine/streaming.ts（純函式）
export const LOAD_COLS = 6, PREFETCH_COLS = 8, UNLOAD_COLS = 11, UNLOAD_EVERY = 60;
export interface StreamPlan { load: number[]; prefetch: number | null; unload: number[]; }
export function planStreaming(actorTileXs: readonly number[], resident: ReadonlySet<number>, pinned: ReadonlySet<number>,
  bounds: { xMin: number; xMax: number }, tick: number): StreamPlan;   // load / unload 升冪；prefetch = 最近的一欄
// engine/game.ts
interface DelveOptions { /* 既有 */ bounds?: WorldBounds; columnSource?: ColumnSource; }
class DelveGame { updateLoadedArea(): void; ensureAround(x: number): void; }
// engine/frost.ts
export function freezeColumns(w: World, sim: LiquidSim | null, dayIndex: number, cols: Iterable<number>, blocked?, keepOpen?): void;
// engine/discovery.ts
export const OUTER_REGION_BASE = 2 ** 30;
class Discovery { setOuter(fn: ((x: number, y: number) => Region | null) | null): void; }
```

規則：`DelveGame` 建構：`bounds = opts.bounds ?? defaultBounds(width, height)`；無限世界的 source = `opts.columnSource ?? new OuterGen(seed, frameOf(gen))`，`World.fromGen` 帶上。`step()` 第一件事 `updateLoadedArea()`（不碰任何 RNG → 單機有界世界什麼都不做，golden 不變）：依 `planStreaming(所有 actor 的 tile x, …)` ensure / 預生成 / 卸載；卸載時 `liquids.forgetColumn(cx)`。`drainColumnEvents().loaded` 的每欄：`liquids.wakeRect` 該欄 ± 1 格（接縫處的海會流進來——spec C9 接受）、`freezeColumns` 依今天日期、停放蓋回來的 chunk 全部喚醒。每日 `updateFreeze` 只跑常駐欄（x 升冪）。`teleport(x, y)` 先 `ensureAround(x)`（同步載入 `LOAD_COLS`），重生與 Task 11 的傳送都經過它。據點核心建立 / 讀檔時 pin 範圍內的欄、拆除時 unpin。外圍發現：`discovery.setOuter` 用 `OuterProfile.zoneAt` 回傳每段生態 / 每片海的惰性地區（名字：海 = 「西方大海」/「東方大海」；陸地 = `「東境・」/「西境・」+` 從 `NAMES[biome]` 依（seed, 側, 段號）雜湊挑），id 見 B13；`load` 接受外圍 id；`stats()` 不算外圍。`isSolid` / 物理 / 刷怪 / 尋路 / 光照在 `[xMin, xMax)` 外照舊是牆（硬邊界）。

- [ ] **Step 1：失敗測試 `streaming.test.ts`**：單一 actor 在 cx 10 → load = 4..16 中沒常駐的；actor 移到 cx 30 → 4..18 在下一個 `tick % 60 === 0` 被列進 unload、pinned 永不 unload；兩個 actor 在 cx −100 與 cx 280 → 兩段都 load、中間的不 load（**Review Focus 2**）；邊界：actor 在 `xMax` 旁 → load 不超出 `floor((xMax − 1) / 32)`。
- [ ] **Step 2：失敗測試 `game.infinite.test.ts`**（預設尺寸、seed 固定；為了速度可以 `gen` 共用一次生成）：(a) 新世界 `world.bounds === 'infinite'`、`xMin === −1_000_000`；(b) `teleport(4300, …)` 後腳下是海、`getLiquidType` 是水，`step` 60 刻不丟例外；(c) **Review Focus 3**：`teleport(-3000, surface)` 挖一格 → `teleport(spawn)` 跑到卸載 → 那欄在 `parkedChunks` → `saveSplitGame` / `restoreSplit` → `teleport(-3000, …)` → 那格還是空氣，旁邊沒改過的格等於第一次生成；(d) **Review Focus 2**：`addActor('b')` 放在 x = 9000、本地在 x = −3000，跑 120 刻 → 兩邊附近的欄都常駐、兩人之間（中央以外）的欄沒有常駐；在 B 旁邊 `spawnEnemy` 一隻怪 → 120 刻內沒被 despawn、位置有變（遠方玩家周圍的模擬照常）；(e) **Review Focus 4**：`teleport(X_LIMIT − 3, y)` 往右走 120 刻 → x 不超過 `X_LIMIT − 1`、不丟例外；`teleport(−X_LIMIT, y)` 同理；(f) **Review Focus 5**：床設在 x = −3000、在 x = 6000 死亡 → 重生後腳下兩格內有實心、不在石頭裡（`overlapsSolid` 為假）；(g) 走進外圍第一段陸地 → 跳出外圍地區的 `discover` 事件、`discovery.stats()` 的總數不變；(h) 據點核心建在 x = −2000 → 主角走到 x = 3000 後那幾欄仍常駐；(i) 記憶體：主角從東海灘起每次 teleport 64 格、每次之後跑 60 刻，往東 6,400 格 → 全程 `residentColumns().length ≤ 中央欄數 + 2 × UNLOAD_COLS + 3`、`parkedChunks().length === 0`（沒改任何東西）。
- [ ] **Step 3：** FAIL。
- [ ] **Step 4：實作**。
- [ ] **Step 5：** 全套綠 + golden + central + perf；delve e2e（中央區的單機流程都不該變）；tsc 無新增。
- [ ] **Step 6：Commit** `feat(delve): unbounded world with per-player streaming`

### Task 9：畫面解除寬度限制——鏡頭、遠景混合、天氣、chunk 快取

**Files:**
- Modify: `render/model.ts`（`clampCamera` / `followCamera` / `visibleChunks`）、`render/renderer.ts`（鏡頭 348-353、`visibleChunks` 呼叫、卸載欄的 chunk 圖淘汰、沒常駐的 chunk 不烘焙、遠景生態 396-398）、`render/bgBlend.ts`（`BiomeField` 改吃函式）、`render/background.ts`（若有吃 `biomeCols` 陣列）、`render/weatherFx.ts`（`skyTop` 改每欄快取）、`render/hud.ts`（地區名 / 生態名用 `discovery.regionsAt` 與 `biomeAt`）、`tests/e2e/delve.spec.ts`
- Test: `render/model.test.ts`、`render/bgBlend.test.ts`、`render/weatherFx.test.ts`

**Interfaces — Consumes:** Task 8。**Produces:** `clampCamera(x, y, viewW, viewH, worldX0: number, worldX1: number, worldH: number): Cam`（px；有界世界傳 `0, width*S`，結果與今天相同）；`followCamera(prev, focus, vw, vh, worldX0, worldX1, worldH, dt, snap)`；`visibleChunks(camX, camY, viewW, viewH, chunkPx, cxMin, cxMax, chunksY)`；`new BiomeField(biomeAt: (x: number) => number, xMin: number, xMax: number)`，`weights / pair` 簽名不變（視窗內逐欄加總、兩端按小數比例；`half ≤ 128` → 每層每幀最多 257 次 `biomeAt`）；`WeatherFx` 的 `skyTop` 改 `Map<cx, Int16Array(32)>`，dirty chunk 與卸載欄時清掉。

- [ ] **Step 1：失敗測試**：`model.test.ts`——`clampCamera` 在 `worldX0 = −1e6*16` 時可以停在負 px、有界參數下結果與舊版相同（舊測試全留）；`visibleChunks` 回負的 `cx0`；`bgBlend.test.ts`——同一組生態欄位，舊陣列版與函式版在中央視窗的 `pair` 結果相同（把現有期待值改成用函式建構再跑一遍）、視窗跨過 x = 0 往負方向時不夾住；`weatherFx.test.ts`——負 x 的欄能算出 `skyTop`。
- [ ] **Step 2：失敗的 e2e**（`tests/e2e/delve.spec.ts`，CRLF）：`?seed=infinite-e2e&autostart=1&fresh=1` → `__delveDebug.game.teleport(4300, 地表)` → 等 30 幀 → 鏡頭 x > `4200*16 − 視窗寬`、`world.isResident(134)`、畫面上沒有 console error；再 `teleport(-300, …)` → 鏡頭 x < 0。
- [ ] **Step 3：** FAIL。
- [ ] **Step 4：實作**。
- [ ] **Step 5：** 全套綠 + golden；delve e2e 全綠；tsc 無新增；dev server 上目測從東海灘一路走到海上（`http://localhost:4321/games/delve?seed=infinite-e2e&autostart=1&fresh=1`，回報附連結）。
- [ ] **Step 6：Commit** `feat(delve): camera and backdrop follow an unbounded world`

### Task 10：小木船

**Files:**
- Create: `engine/boat.ts`、`engine/boat.test.ts`、`render/boatArt.ts`
- Modify: `engine/items.ts`（`boat`、`use: 'boat'`）、`engine/crafting.ts`（配方）、`engine/actor.ts`（`boating: boolean`）、`engine/game.ts`（使用道具分支 1070 一帶、玩家段在 `boating` 時改走 `stepBoat`、死亡 / 傳送時下船、事件 `boat`、`PRIVATE_EVENTS` 加 `boat`）、`render/textures.ts`（`ICON_ORDER` 加 `'boat'`、`case 'boat'` 圖示）、`render/renderer.ts`（每個 actor `boating` 時在腳下畫船）、`render/sprites.ts` 或 `render/main.ts`（音效 / 提示接 `boat` 事件，比照 `recall`）、`tests/e2e/delve.spec.ts`

**Interfaces — Consumes:** `liquidContact`（`engine/swim.ts`）、`moveBody`（`engine/physics.ts`）。**Produces:**

```ts
// engine/boat.ts
export const BOAT_SPEED = 270, BOAT_ACCEL = 600, BOAT_DRAG = 400, BOAT_DRAFT = 4;   // px/s、px/s²、px
/** 船身中心那欄、腳底上下 2 格內的水面 px y；沒有水 → null */
export function boatWaterline(w: World, b: Body): number | null;
export function canBoard(w: World, b: Body): boolean;   // 身體碰到水（frac > 0）或腳下那格是水面
export function stepBoat(q: SolidQuery, w: World, b: Body, moveX: -1 | 0 | 1, dt: number): { afloat: boolean };
// engine/game.ts 事件
| { type: 'boat'; on: boolean }
```

規則（B11）：配方 `r('boat', 'boat', 1, 'workbench', ['planks', 18], ['rope', 4])`；道具 `boat: { id: 'boat', name: { zh: '小木船', en: 'Boat' }, maxStack: 1, use: 'boat' }`。手持按使用：`canBoard` → `boating = true`、身體貼齊水線（腳底 = 水線 + `BOAT_DRAFT`）、`emit({ type: 'boat', on: true })`；不能上船 → 不做事。`boating` 時：水平往 `moveX × BOAT_SPEED` 加速、放開時 `BOAT_DRAG` 減速、撞到實心停下（`moveBody`、不爬坡）；每刻重貼水線；`afloat === false`（擱淺 / 水沒了）或按跳 → 下船（跳 = 給 `JUMP_SPEED`）並 `emit({ type: 'boat', on: false })`；船上不扣呼吸、不套游泳減速、挖掘 / 使用其他道具忽略。存檔不存 `boating`。船的美術：程式繪製的木船（船身兩色木紋 + 1 px 描邊），寬約 28 px，隨 `clock` 上下 1 px 晃動（只在 render）。

- [ ] **Step 1：失敗測試 `boat.test.ts`**：一池 40 格寬、6 格深的水：`canBoard` 在水面為真、在乾地為假；上船後 `moveX = 1` 跑 1 秒 → `vx ≥ 0.9 × BOAT_SPEED`、身體底部在水線 ± 1 px、沒往下沉；撞岸 → 停、不穿牆；水被抽乾 → `afloat === false`；`game` 層：手持 `boat` 在水面按使用 → `boating`、事件 `boat on`；在船上 10 秒呼吸不變；按跳 → 下船；在工作台旁能合成、背包有木板 18 + 繩索 4 才行；上船不會消耗船。
- [ ] **Step 2：失敗的 e2e**：debug 給 `boat`、`teleport(4300, 水面)`、使用 → HUD 有船（`__delveDebug.game.local.boating === true`）、按住右 2 秒 → x 增加 > 25 格。
- [ ] **Step 3：** FAIL。
- [ ] **Step 4：實作**。
- [ ] **Step 5：** 全套綠 + golden；delve e2e；tsc 無新增；dev server 目測船（附 4321 連結）。
- [ ] **Step 6：Commit** `feat(delve): craftable boat for crossing seas`

### Task 11：傳送碑

**Files:**
- Create: `engine/waystones.ts`、`engine/waystones.test.ts`、`render/waystoneArt.ts`、`render/waystoneUi.ts`
- Modify: `engine/game.ts`（`stonesUnlocked`、每刻碰觸解鎖、使用鍵打開、`travelStone`、事件、`PRIVATE_EVENTS` 加 `stone`）、`save/serialize.ts`（`stones?`）、`save/worldSave.ts`（世界 header `stones?`，split / join 帶過去）、`render/renderer.ts`（畫畫面內的傳送碑）、`render/main.ts`（接事件、開面板、提示「按使用鍵開啟傳送碑」）、`src/pages/games/delve.astro`（面板 DOM + 樣式）、`tests/e2e/delve.spec.ts`

**Interfaces — Consumes:** Task 7 `OuterProfile`、Task 8 `ensureAround / teleport`、`findStandSpot`（`engine/npcPath.ts`）。**Produces:**

```ts
// engine/waystones.ts
export const SPAWN_STONE = 0, STONE_EVERY = 1600, STONE_JITTER = 150, STONE_FIRST = 200;
export interface Waystone { id: number; x: number; y: number /* 底座下方那格的上一格（站立 tile） */; name: string; }
export class Waystones {
  constructor(seed: string, spawnStone: { x: number; y: number }, profile: OuterProfile | null);   // 有界世界 profile = null → 只有出生點那顆
  byId(id: number): Waystone | null;
  near(x0: number, x1: number): Waystone[];   // x 在 [x0, x1) 的碑（算 k，不掃描）
  footprint(s: Waystone): { x: number; y: number; w: 2; h: 3 };   // tile
}
export function validStoneIds(v: unknown, ws: Waystones): number[];
// engine/game.ts
class DelveGame {
  readonly waystones: Waystones;
  readonly stonesUnlocked: Set<number>;          // 世界層級；不含 0（0 恆解鎖）
  unlockedStones(): Waystone[];                   // 含出生點那顆，依 x 排序
  stoneHere(): Waystone | null;                   // cur 的身體在某顆碑的 footprint ± 2 格內
  travelStone(to: number): boolean;
}
// 事件
| { type: 'stone_unlock'; id: number; name: string; x: number; y: number }   // 公開（世界共用）
| { type: 'stone'; phase: 'open' | 'travel'; id: number; to?: number; x: number; y: number }   // 私人
```

規則（B10）：出生點那顆在 `(spawn.x + 7, world.surface[spawn.x + 7] − 1)`（中央每欄陣列 = 生成時的地表，玩家挖掘 / 蓋東西都不會讓碑移動）；外圍第 k 顆在 `d = SEA_W + STONE_FIRST + (k − 1) × STONE_EVERY + jitter(seed, 側, k)`，`y = profile.surfaceAt(x) − 1`，落在海上就往遠離中央的方向推到第一個陸地欄；名字：出生點「出生地傳送碑」、外圍「東境第 k 碑」/「西境第 k 碑」。每刻對每個 actor：身體與 `near(x−2, x+3)` 的 footprint 重疊且沒解鎖 → 加進 `stonesUnlocked`、`emit stone_unlock`。按使用時若瞄準的格在某顆碑 footprint 內、伸手距離內 → `emit({ type: 'stone', phase: 'open', … })`（優先於放方塊，比照床 / 箱子）。`travelStone(to)`：`stoneHere()` 存在且已解鎖、目的地已解鎖且不同 → `ensureAround(dest.x)` → `findStandSpot(world, dest.x + 2, dest.y)` → 找不到 → `block('use', 'blockedspot', …)`；找到 → `teleport`、`closeChest`、`emit stone travel`。存檔：`stones` = `[...stonesUnlocked].sort()`，空的不寫（B6）；讀檔用 `validStoneIds` 過濾。面板：`<section class="delve-panel delve-panel--stone" id="delve-stone" hidden aria-label="傳送碑">`，列出 `unlockedStones()`（名字、方向與距離「東 3,240 格」），目前這顆標「你在這裡」不可按；按鈕 `data-stone`；比照 `render/settleUi.ts` 的 travel 列表與關閉行為；樣式只用 class。碑的美術：程式繪製的立石（2×3 格、刻符、未解鎖灰、解鎖後刻符發光 + 小光源）。

- [ ] **Step 1：失敗測試 `waystones.test.ts`**：位置是純函式（兩個實例相同）、`near` 與暴力掃描結果相同（x ∈ [−20000, 20000)）、碑不在水上、相鄰兩顆間距在 `STONE_EVERY ± 2 × STONE_JITTER` 內、有界世界只有 id 0；`game` 層：出生後 `unlockedStones()` 只有出生點那顆；走到東境第 1 碑 → `stone_unlock` 事件、`stonesUnlocked` 有 1；**共用**：`addActor('b')` 碰到西境第 1 碑 → 本地 actor 的 `unlockedStones()` 也有它、事件對兩人都可見；站在出生點碑旁 `travelStone(1)` → 到東境第 1 碑旁、腳下的欄已常駐、不在實心裡（**Review Focus 5**）；目的地沒解鎖 / 不在碑旁 → false；存讀檔後解鎖集合還在；舊存檔（沒有 `stones`）→ 只有出生點那顆；golden 不變（`stones` 空 → 不寫）。
- [ ] **Step 2：失敗的 e2e**：debug 解鎖東境第 1 碑 → 站到出生點碑旁 → 按使用打開面板（`#delve-stone` 可見、有兩個項目）→ 點東境那顆 → 玩家 x > 4200 + `SEA_W`。
- [ ] **Step 3：** FAIL。
- [ ] **Step 4：實作**。
- [ ] **Step 5：** 全套綠 + golden；delve e2e；tsc 無新增；dev server 目測碑與面板（附 4321 連結）。
- [ ] **Step 6：Commit** `feat(delve): waystones shared by the whole world`

### Task 12：只畫探索過的地方的大地圖 / 小地圖（分頁快取）

**Files:**
- Create: `render/mapPages.ts`、`render/mapPages.test.ts`
- Modify: `render/mapView.ts`（`MapCache` 換成 `MapPages`；`Minimap` / `FullMap` 改從頁面畫；傳送碑圖示與名字）、`render/mapModel.ts`（`paintMapChunk(out, src: TileWindow, bits: Uint8Array | undefined, lut)`、`clampView` 改吃探索範圍、`MAP_ICONS` 加 `'waystone'`、`mapIconBmp('waystone')`）、`render/session.ts`（`DelveDebug` 加 `mapPins(): { icon: string; x: number; y: number; name: string }[]`，回傳大地圖目前會畫的圖示，含傳送碑）、`tests/e2e/delve.spec.ts`

**Interfaces — Consumes:** Task 5 `peekColumn / isResident / window`、Task 6 `ExploredMap.exploredChunks / chunkBits / drainDirty`、Task 11 `unlockedStones()`。**Produces:**

```ts
// render/mapPages.ts
export const PAGE_CHUNKS = 8, PAGE_PX = PAGE_CHUNKS * 32, MAX_PAGES = 96, PEEK_PER_FRAME = 2, PAINT_PER_FRAME = 24;
export function pageKey(cx: number, cy: number): number;   // floor(cx / 8), floor(cy / 8) 的打包鍵（可負）
export class MapPages {
  constructor(game: DelveGame);
  version: number;
  markWorld(chunkKeys: readonly number[]): void;   // 已探索 chunk 的 tile 變動
  update(budget?: number): number;                  // 畫 pending chunk；沒常駐的 chunk 每幀最多 PEEK_PER_FRAME 欄 peekColumn
  draw(ctx: CanvasRenderingContext2D, view: MapView, sw: number, sh: number): void;   // 只畫存在的頁；其餘留背景色
  exploredExtent(): { x0: number; x1: number } | null;
}
export function clampView(v: MapView, extent: { x0: number; x1: number } | null, wh: number, sw: number, sh: number): MapView;
```

規則（B12）：頁面只在「有已探索 chunk」時建立；LRU 超過 `MAX_PAGES` 淘汰最久沒畫的頁（之後再用到就重畫）；未探索格畫迷霧色（沿用 `buildMapLut().fog`）；拖曳範圍夾在探索範圍左右各留半個視窗、上下 `[0, height)`，不會拖過 ±`X_LIMIT`（**Review Focus 4**）；大地圖畫 `unlockedStones()` 的圖示與名字（只有解鎖的）；小地圖同樣只畫探索過的格；資訊列「已探索 x%」用 `explored.centralCount() / (width × height)`。

- [ ] **Step 1：失敗測試 `mapPages.test.ts`**（happy-dom canvas 或 stub ctx）：只揭露 x ∈ [−400, −300) 與 [100, 200) → 只有兩組頁面被建立、`exploredExtent = { x0: −400, x1: 200 }`；揭露沒常駐的欄 → 第一次 `update` 最多 `PEEK_PER_FRAME` 欄被 peek、多幀後全部畫完、`world.residentColumns()` 沒變；挖一格（已探索的 chunk）→ `markWorld` 後那頁 `version` 增加；`MAX_PAGES + 10` 頁 → 只保留 `MAX_PAGES`；`clampView` 不讓中心離開探索範圍、extent 為 null 時置中在玩家；`pageKey` 對負座標正確。
- [ ] **Step 2：失敗的 e2e**：teleport 到 x = −600 走幾步 → 開大地圖 → canvas 上玩家附近有非迷霧色像素、拖曳到 x = −700 一帶仍可見；解鎖東境第 1 碑後 `__delveDebug.mapPins()` 含 `icon === 'waystone'`、名字「東境第 1 碑」的那一筆；沒解鎖的碑不在裡面。
- [ ] **Step 3：** FAIL。
- [ ] **Step 4：實作**。
- [ ] **Step 5：** 全套綠 + golden；delve e2e 全綠；tsc 無新增；`npm run test:all` 一次（收尾）；dev server 目測大地圖拖曳縮放、小地圖（附 4321 連結）。
- [ ] **Step 6：Commit** `feat(delve): explored-only paged map for an unbounded world`

---

## Self-review（寫完後對照 spec 與裁定）

1. **覆蓋**：R1(a) → Task 1、5、8；(b) → Task 5（`fromGen`、中央 pinned）+ Task 1 central 指紋；(c) → Task 7；(d) isSolid / 物理 → 5、8，鏡頭 → 9，每欄函式 → 1、3、7，液體 → 2、8，迷霧 → 6，光照 → 3，棲地 → 3、8，bgBlend → 9，天氣 → 3（`biomeAt`）、9（weatherFx），霜 → 2、8，發現 → 3、8，NPC 尋路 → 3，地圖 → 4、12；(e) → Task 6；(f) → 10；(g) → 11；(h) → 12。R2 → 中央照舊由種子重算、烘焙與刪生成器寫在 B2 / R2 為 1b。R3 → coords `X_LIMIT` + Task 8(e)。R4 → golden 每 task 跑、central 指紋 Task 1 錄 / Task 5 真正比對。R5 → B3 + Task 1 / 5 的 perf 測試、Task 7 生成預算。連線 → `readChunk / writeChunk`（Task 5）+ Task 8 雙 actor。spec §7 存檔 / 效能 / 確定性 → Global Constraints + Task 6、7、8(i)。留給 1b 以後：烘焙、刪舊生成器、海上小島、地區間的海、C2 驚喜密度、C12 距離難度、結構分區塊化（spec C1 1b 清單）。
2. **步驟掃描**：每個測試步驟都寫了斷言與數值；實作步驟靠 Interfaces 的簽名與「規則」段；沒有 TBD。
3. **型別一致**：`tileKey / chunkKey / tileXY / chunkXY`（Task 1）→ World `idx / chunkIndex / tileXY / chunkCoords`；`TileWindow`（1）→ 2、3、4、12；`ColumnSource / Column / ColumnLayers / li`（5）→ 7；`ChunkData`（5）→ 6；`OuterProfile / OuterGen / OUTER_GEN_VERSION`（7）→ 8、11；`ensureAround / teleport`（8）→ 11；`ExploredMap.chunkBits / exploredChunks / centralCount`（6）→ 12；`unlockedStones()`（11）→ 12；`forgetColumn`（2）→ 8；`DelveOptions.bounds / columnSource` 在 Task 6 加、Task 8 接正式來源。
4. **Review Focus**：五條都有對應測試（6(a)、8(d)、5 + 8(c)、8(e) + 12、8(f) + 11）。
5. **比例**：沒有函式本體，只有簽名、常數、規則與斷言。
