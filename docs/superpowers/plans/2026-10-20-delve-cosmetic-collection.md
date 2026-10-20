# DELVE 外觀收集制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建角只決定身體與種族；14 套服裝、9 個頭飾、眼鏡全部變成可收集的時裝物品（製作 / 打怪 / 寶箱），每件衣服記自己的顏色；梳妝台改身體特徵與配色；種族只能用轉生之藥換；舊角色外觀一次性轉成物品且看起來不變。

**Architecture:** 在 `Stack` 上加第二種實例資料 `tint`（時裝物品專用，和 `gear` 並列），一路穿過背包 / 箱子 / 掉落 / 時裝欄 / 存檔 / 繪製。時裝欄加第 5 格 `acc`。衣櫥 `Wardrobe` 加「模式」只顯示部分欄位（不刪 `APPEARANCE_FIELDS` 列——刪了會把存檔欄位夾成 0）。舊角色在 `applyCharacter`（唯一有活 game 的載入點）裡依 `cformat` 一次性轉換。

**Tech Stack:** TypeScript、Canvas2D（全程式繪製）、vitest（jsdom）、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-20-delve-cosmetic-collection-design.md`

## Global Constraints

- 文字繁體中文寫死；禁 `!important`、禁行內樣式（`style=`、`el.style.x =`）；不加 npm 套件。
- `engine/appearance.ts` 的選項陣列、`engine/tiles.ts` 的 tile id 都只能 append 在末尾。
- 不得從 `APPEARANCE_FIELDS` 刪列（`countOf` 會把舊存檔欄位夾成 0）；要隱藏欄位用衣櫥模式。
- NPC（`folkDefs.ts:195-210`、`npcs.ts:69`）照舊直接讀 Appearance 的 outfit / acc / glasses，不受時裝物品化影響。
- 現有 21 件時裝道具與商店來源全部保留；`miner_helmet` 仍只在商店。
- 每件外觀至少一個來源；只靠打怪的必須另有寶箱或製作來源（和平模式不生怪）。
- 測試：`npx vitest run <path>`（絕不 `npm test`）；e2e `npx playwright test tests/e2e/delve.spec.ts --project=chromium`；`tests/e2e/delve.spec.ts` 與 `save/character.ts`、`render/session.ts` 為 CRLF，維持各檔原行尾。
- Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Builder decisions（plan 層，Claude 代為決定）

- P1 `Stack.tint?: [number, number]`（`CLOTH_COLORS` index 的主色 / 副色）。只允許出現在有 `vanity` 的物品上（`validStack` 對其他物品帶 tint → 丟 `SaveFormatError`，比照 `strictGear`）。沒有 tint = 該款式原色。時裝物品 `maxStack: 1`，所以不涉及疊堆。
- P2 物品圖示（atlas，依 item id 烘一次）維持原色；穿在身上、時裝欄格子、hover 預覽才顯示實際顏色。時裝欄格子的重畫簽章要含 tint。
- P3 一套服裝 = 身體 + 腿兩件（沿用現有 sailor_top + pleated_skirt 等做法）。現有 6 套已有對應件；新增 ninja、mage、knight、qipao、pirate、idol、priest、gothic 共 8 套 × 2 = 16 件。look 字串沿用 `outfit:<id>`。
- P4 第 5 格 `acc`（標籤「飾品」）：9 個頭飾 + 眼鏡共 10 件新物品，look `acc:<ACCESSORIES id>` 與 `acc:glasses`。繪製：飾品格有東西時取代 Appearance 的 `acc` / `glasses`；頭部有帽子 / 頭盔時照現有規則隱藏髮飾（眼鏡不隱藏）。
- P5 基本布衣：`OUTFITS` append `plain`（「布衣」），預設色取樸素的兩個 CLOTH_COLORS。新角色 `outfit = plain`、`acc = none(0)`、`glasses = 0`。
- P6 衣櫥模式：`'create'` = body、race、hair、hairColor、ahoge、eyes、eyeShape、skin、blush、color1、color2（後兩者染布衣）；`'mirror'` = 同上去掉 race，並把 color1 / color2 換成「身上每件時裝的主色 / 副色」列（每件一組）＋布衣的兩列。`'full'`（舊行為）不再對玩家開放，可保留給內部 / 測試。
- P7 梳妝台：新 tile `VANITY_TABLE`（append）＋ 物品 `vanity_table`。它不是合成站，`FURNITURE` role 選 furniture.ts 現有非 station 類中最接近的（裝飾 / 舒適）。配方：workbench，planks 6 + gel 2（若專案已有玻璃類物品，可改成 planks + 玻璃，仍須是開局一小時內拿得到的材料）。互動：`isInteractive` 納入、`interact` 推 `mirror` 事件 → `render/main.ts` 開衣櫥 `'mirror'` 模式，離開範圍自動關（比照箱子）。
- P8 轉生之藥 `rebirth_potion`：`use: 'rebirth'` 新種類 → 推 `rebirth` 事件 → 開種族選單（重用衣櫥 race 列 + RACE_BLURB，單列模式）；確定才 `takeFromSlot` 並 `setAppearance`；取消不消耗。來源：`lantern_warden` 對該角色首殺（`killEnemy` 內 `!this.levels.bosses.has(kind)`）必掉 1；非首殺 15%；`relic` / `treasure` 寶箱 4%。
- P9 舊角色轉換：`CHARACTER_FORMAT = 2`；`validateCharacter` 接受 1 和 2。`applyCharacter` 收到 cformat 1 時執行 `migrateWardrobe(game)`（spec C6 規則，含護甲露出則放背包、背包滿則 `dropAtTile` 帶 tint）；寫回一律 2。轉換是純函式核心 `planWardrobeMigration(appearance, vanity, equipment) → { appearance, equip: {slot, stack}[], give: Stack[] }`＋薄的 game 套用層。
- P10 角色列表預覽要顯示時裝：`CharacterRecord.preview` 增加 `look`（已解析的 doll 外觀所需資料：appearance + 各時裝欄 look / tint）；舊記錄沒有就照舊只畫 appearance。

## Review Focus

1. 帶 tint 的衣服經過「放箱子 → 取出 → 丟地上 → 撿起 → 存檔 → 讀檔 → 合成其他東西（craft 的 fromJSON 來回）」顏色不掉 → Task 1 測試 `tint survives every move`。
2. 舊角色（cformat 1，穿哥德洋裝＋自訂顏色＋蝴蝶結＋眼鏡、身上有鐵胸甲）讀檔後：外觀與轉換前同（胸甲照露、蝴蝶結在飾品格、洋裝和眼鏡在背包且帶原色）；再存再讀不會再發一次 → Task 7。
3. 和平模式世界：每一件外觀都存在非打怪來源 → Task 3 測試 `every cosmetic obtainable without enemies`。
4. 角色列表預覽在轉換後仍穿著原本的衣服（不是布衣）→ Task 7。
5. 轉生之藥打開選單後取消、或選同一個種族 → 不消耗 → Task 6。

---

### Task 1: 時裝物品的實例顏色（tint）

**Files:** `engine/inventory.ts`、`engine/entities.ts`（DroppedItem / DropList）、`engine/game.ts`（take/deposit chest、pickup、giveOrDrop、dropAtTile）、`engine/crafting.ts`（craft 來回）、`engine/vanity.ts`（VanityJSON 加 `tint`）、`save/serialize.ts`（validStack / validDrops / chests）、`engine/doll.ts`（pieceOf / dollKey 帶 tint）、`render/avatarArt.ts`（wearOf 用 tint）、`render/hud.ts`（paintStack 簽章）。Test：`engine/inventory.test.ts`、`engine/doll.test.ts`、`save/` 相關、新 `engine/tint.test.ts`。

**Interfaces — Produces:** `Stack.tint?: [number, number]`；`Inventory.add(item, n, gear?, tint?)`；`DropSave.tint?`；`VanityJSON.tint: Record<slot, [number,number]|null>`；`DollPiece.tint?`；`giveOrDrop(item, gear?, tint?)`；`dropAtTile(item, n, tx, ty, tint?)`；`isTintable(item): boolean`（有 vanity 的物品）。

- [ ] **Step 1: 失敗測試**：`tint survives every move`（背包 → 箱子 → 取回 → 丟成掉落物 → 撿回 → 時裝欄穿上 → 脫下 → craft 一個無關配方 → 存檔 JSON 來回，最後 tint 仍 `[3, 7]`）；`validStack rejects tint on non-vanity item`；`dollKey differs by tint`；`wearOf uses tint over outfit defaults`（同款不同 tint 的 pieceBmp 像素不同；無 tint 時等於現在的原色輸出）。
- [ ] **Step 2:** 跑 → FAIL。 **Step 3:** 實作。 **Step 4:** `npx vitest run src/scripts/games/delve` 全綠。
- [ ] **Step 5: Commit** `feat(delve): per-item colours for fashion items`

### Task 2: 新時裝物品、第 5 格飾品欄、基本布衣

**Files:** `engine/appearance.ts`（OUTFITS append `plain`）、`engine/items.ts`（16 件服裝 + 10 件飾品）、`engine/vanity.ts`（`acc` 槽；`VANITY_SLOTS` 加 `'acc'`，fromJSON 相容舊 4 槽資料）、`engine/doll.ts`（`DollLook.acc`、`acc:` look）、`render/avatarHead.ts` / `avatarArt.ts`（飾品格取代 Appearance acc/glasses、帶 tint 顏色）、`render/fashionIcon.ts` / `textures.ts`（新圖示）、`render/hud.ts` + `src/pages/games/delve.astro`（第 5 格 UI 與樣式）。Test：`doll.test.ts`、`avatarArt.test.ts`、`icons.test.ts`、`appearance.test.ts`。

**Interfaces — Produces:** item ids：`<outfit>_top` / `<outfit>_bottom` 形式給 8 套新服裝（名稱繁中，如「忍者上衣」「忍者褲」）；飾品 `acc_ribbon`、`acc_catears`、`acc_clip`、`acc_hood`、`acc_flower`、`acc_crown`、`acc_headphones`、`acc_foxmask`、`acc_hairpin`、`acc_glasses`（繁中名比照 ACCESSORIES 標籤＋「眼鏡」）；`OUTFIT_ITEMS: Record<outfitId, [bodyItem, legsItem]>`（含現有 6 套的對應）；`ACC_ITEMS: Record<accId|'glasses', ItemId>`；`OUTFIT_PLAIN` index。

- [ ] **Step 1: 失敗測試**：每個 OUTFITS（除 plain）都在 `OUTFIT_ITEMS` 有兩件、穿上兩件時 doll 與「Appearance 直接選該 outfit + 同色」的 doll 像素相同；每個 ACCESSORIES（除 none）+ glasses 在 `ACC_ITEMS`、穿在飾品格的繪製等於 Appearance 直接設該 acc / glasses 的繪製；`Vanity.fromJSON` 讀舊 4 槽 JSON 不丟錯、acc 為 null；新圖示通過 `icons.test.ts` 規則；`plain` 存在且 append 在最後。
- [ ] **Step 2–4:** 同上流程，`npx vitest run src/scripts/games/delve` 全綠。
- [ ] **Step 5: Commit** `feat(delve): fashion items for every outfit and accessory`

### Task 3: 取得來源表

**Files:** `engine/crafting.ts`、`engine/enemies.ts`（drops）、`engine/loot.ts`（chestFashion 池）、`engine/game.ts`（BOSS_DROPS 或 boss 專屬時裝）、`engine/doll.test.ts`（來源規則改寫）、新 `engine/cosmeticSources.test.ts`。並把最終分配表寫進本 plan 檔末的「Source table」節（同一個 commit）。

**Interfaces — Produces:** `cosmeticSources(item): ('craft'|'enemy'|'chest'|'boss'|'shop')[]`（測試用的彙整函式，讀 RECIPES / ENEMIES / 寶箱池 / BOSS_DROPS / 商店表）。

規則（來自 spec C8）：約 1/3 可製作；至少 1 件只用開局材料（wood / planks / gel / dirt / stone / mushroom / feather）在 workbench 做得出來；主題怪掉主題款（例：bone_knight → knight，ember_imp → 某紅色系，dusk_owl → 某羽毛 / 帽類，cursed_skull → gothic 等，builder 定）；小皇冠、偶像舞台裝、哥德洋裝類放 lantern_warden / treasure / relic；怪物掉率個位數百分比；現有來源不移除；原 `doll.test.ts:140-154` 的「crafted XOR loot-only」規則改為下列測試。

- [ ] **Step 1: 失敗測試**：`every cosmetic has a source`；`every cosmetic obtainable without enemies`（只看 craft / chest / shop；boss 可召喚於和平模式但不算）；`at least one cosmetic craftable from starter materials`；`existing sources kept`（快照現有 21 件的來源集合，新集合必須是超集合）。
- [ ] **Step 2–4:** 同上。 **Step 5: Commit** `feat(delve): where to find every outfit and accessory`

### Task 4: 衣櫥模式與建角流程

**Files:** `render/wardrobe.ts`（`WardrobeOpen.mode`）、`render/session.ts`（新角色用 `'create'`；移除 `#delve-look-menu` 的處理）、`src/pages/games/delve.astro`（移除 `#delve-look-menu`）、`engine/appearance.ts`（`createLook(a)`：outfit=plain、acc=0、glasses=0）、`render/titleUi.ts`（新角色預覽）。Test：新 `render/wardrobe.test.ts`（jsdom 下 build 出的列）或 `appearance.test.ts`。

**Interfaces — Produces:** `type WardrobeMode = 'create' | 'mirror' | 'full'`；`WardrobeOpen.mode?: WardrobeMode`（預設 `'full'` 以免破壞內部呼叫）；`WardrobeOpen.tints?: { slot: VanitySlot; tint: [number,number] }[]` 與 `onTints?(t)`（給 Task 5 的 mirror 用；本 task 只需讓 create 模式可用，mirror 列在 Task 5 補）；`createLook(a: Appearance): Appearance`。

- [ ] **Step 1: 失敗測試**：`create` 模式列 = P6 清單（無 outfit / acc / glasses 列）；`createLook` 結果 outfit === OUTFIT_PLAIN、acc 0、glasses 0；用 create 模式建出的角色 `createCharacter` 外觀是布衣。
- [ ] **Step 2–4:** 同上；另跑相關 e2e `-g "外觀"` 確認哪些舊測試預期失敗（Task 8 修，不在此改 e2e）。
- [ ] **Step 5: Commit** `feat(delve): character creation picks body and race only`

### Task 5: 梳妝台

**Files:** `engine/tiles.ts`（`VANITY_TABLE` append）、`engine/items.ts`（`vanity_table`）、`engine/furniture.ts`、`engine/crafting.ts`（配方）、`engine/game.ts`（isInteractive / interact → `mirror` 事件、離開範圍關閉、`recolorWorn(slot, tint)`、`setBodyLook(a)`（拒絕改 race））、`render/main.ts`（事件 → 開衣櫥 mirror）、`render/wardrobe.ts`（mirror 列：每件身上時裝的兩色列 + 布衣兩色）、`render/buildArt.ts`（家具圖）、`render/textures.ts`（圖示）。Test：`game.furniture.test.ts`、`buildArt.test.ts`、新 `engine/mirror.test.ts`。

**Interfaces — Consumes:** Task 1 tint、Task 4 WardrobeMode。**Produces:** 事件 `{ type: 'mirror' }`；`game.recolorWorn(slot: VanitySlot, tint: [number,number]): boolean`；`game.setBodyLook(a: Appearance): void`（保留原 race、保留 outfit/acc/glasses 欄位原值）。

- [ ] **Step 1: 失敗測試**：靠近放置的梳妝台按使用 → 推 `mirror` 事件；走出範圍 → 關閉事件；`setBodyLook` 嘗試改 race → race 不變；`recolorWorn('body', [1,2])` 改的是穿在身上那件的 tint、dollKey 隨之改變；梳妝台配方在 workbench 可做。
- [ ] **Step 2–4:** 同上。 **Step 5: Commit** `feat(delve): vanity table to restyle hair and recolour clothes`

### Task 6: 轉生之藥

**Files:** `engine/items.ts`（`rebirth_potion`, `use: 'rebirth'`）、`engine/game.ts`（use dispatch 推 `rebirth` 事件；`rebirth(race): boolean` 才消耗；killEnemy 首殺必掉 / 非首殺 15%）、`engine/loot.ts`（treasure / relic 4%）、`render/main.ts` + `render/wardrobe.ts`（種族單列模式 `'race'`）、圖示。Test：新 `engine/rebirth.test.ts`。

**Interfaces — Produces:** `WardrobeMode` 加 `'race'`；`game.rebirth(race: number): boolean`（同種族或無藥 → false 不消耗）。

- [ ] **Step 1: 失敗測試**：使用藥水只推事件、不消耗；`rebirth(其他族)` 消耗 1 並改 race、`raceMods` 跟著變；`rebirth(同族)` → false 不消耗；首殺 lantern_warden 掉 1 瓶（固定 RNG）、角色已有該王紀錄時改走 15%；寶箱表含藥水且機率 4%。
- [ ] **Step 2–4:** 同上。 **Step 5: Commit** `feat(delve): rebirth potion to change race`

### Task 7: 舊角色轉換與列表預覽

**Files:** `save/character.ts`（CHARACTER_FORMAT 2、接受 1）、`save/serialize.ts`（`applyCharacter` 依 cformat 呼叫轉換）、新 `engine/wardrobeMigration.ts`（純函式 `planWardrobeMigration`）、`engine/game.ts`（套用層：穿上 / 給背包 / 掉地上帶 tint）、`save/storage.ts`（preview.look）、`render/titleUi.ts`（列表預覽畫時裝）。Test：新 `engine/wardrobeMigration.test.ts`、`save/character.test.ts`（cformat 2 接受、1 仍接受、3 拒絕）、`save/migrate.test.ts`（format 9 fixture 經轉換後外觀不變）。

**Interfaces — Consumes:** Task 1、Task 2 的 `OUTFIT_ITEMS` / `ACC_ITEMS`。**Produces:** `planWardrobeMigration(app, vanity: VanityJSON, equipVisible: Record<'head'|'body'|'legs', boolean>): { appearance: Appearance; equip: { slot: VanitySlot; stack: Stack }[]; give: Stack[] }`。

- [ ] **Step 1: 失敗測試**（全部用 doll 像素或 dollKey 比對「外觀不變」）：
  - 穿哥德 + 自訂色、時裝欄空、無護甲 → 身體 / 腿兩件穿上且帶原色；外觀相同。
  - 同上但身上有露出的鐵胸甲 → 上衣進背包、褲子（腿無護甲時）穿上；外觀相同。
  - 蝴蝶結 + 眼鏡 → 蝴蝶結進飾品格、眼鏡進背包。
  - 時裝欄身體格已有水手服上衣 → 轉出的上衣進背包。
  - 背包滿 → 掉在玩家腳邊（掉落物帶 tint）。
  - 轉換後再 snapshot → cformat 2；再讀不再發物品。
  - format 9 fixture 走 migrate 後外觀與 fixture 原外觀相同。
  - 角色列表預覽（`preview.look`）畫出的是穿著衣服的樣子。
- [ ] **Step 2–4:** 同上。 **Step 5: Commit** `feat(delve): convert existing outfits into owned fashion items`

### Task 8: e2e 更新與新增

**Files:** `tests/e2e/delve.spec.ts`（CRLF）。

- [ ] **Step 1:** 跑全套 delve e2e，列出因 Task 4–7 改變而失敗的測試（`#delve-look-menu`、`openNewLook` 期待的列、2200-2242 時裝欄測試等），逐一改成新行為，不削弱斷言。
- [ ] **Step 2: 新增**：
  - `new character wears plain clothes and sees no outfit rows`。
  - `vanity table restyles hair and recolours worn clothes`（放梳妝台 → 使用 → 改髮型、改上衣顏色 → 存檔重整後仍在；種族列不存在）。
  - `rebirth potion changes race; cancel keeps the potion`。
  - `old character keeps its look after conversion`（以 v1 角色記錄種子：哥德 + 自訂色 + 蝴蝶結 + 眼鏡 → 進遊戲後時裝欄 / 背包內容符合 spec、角色列表預覽非布衣）。
  - `fashion item colour survives chest and reload`。
- [ ] **Step 3:** 全套 delve e2e 綠（flake 單獨重跑並記錄）；`npx vitest run` 全套。
- [ ] **Step 4: Commit** `test(delve): e2e for collectible outfits`

## Source table

Task 3 定案（`engine/cosmeticSources.ts` 彙整、`engine/cosmeticSources.test.ts` 鎖規則）。讀法：

- 配方 `材料 n @合成站`；怪物 `怪物 id 百分比`（每件獨立擲，未計幸運加成，幸運 × (1 + luck%)）。
- 箱子 `種類 百分比` = 該種箱子開出這一件的機率 = 箱子開出時裝的機率（一般 cabin / mineshaft / ruin / cavern / sky 10%、dungeon / secret / relic 30%、treasure 80%）÷ 該種箱子池子件數。箱子內容在建世界時就生成，新池子只影響**新世界**。
- 首領：燈脈守望者每次擊敗必掉一件時裝，從 `BOSS_FASHION` 五件裡抽（每件 20%）。和平模式也能召喚，但規則「和平模式拿得到」不把它算進去。
- **一套服裝的上身與下身來源完全相同**（同一隻怪、同機率、同幾種箱子；配方材料下身較少），兩件各自擲。
- 新物品 26 件中可製作 8 件（≈31%）；全部 47 件中 22 件可製作。開局材料就做得出：草帽（舊）、小花（新）。

| item id | 名稱 | 來源 |
|---|---|---|
| sailor_top | 水手服上衣 | 配方 banner 2 + gel 4 @workbench |
| sailor_skirt | 百褶裙 | 配方 banner 2 + gel 2 @workbench |
| miko_robe | 巫女白衣 | 配方 banner 3 @workbench |
| miko_hakama | 緋袴 | 配方 banner 2 + ember 2 @workbench |
| hoodie_top | 寬鬆連帽衫 | 配方 banner 2 + gel 2 + feather 2 @workbench |
| hoodie_shorts | 短褲與褲襪 | 配方 banner 1 + gel 2 @workbench |
| travel_coat | 旅人大衣 | 配方 banner 3 + chitin 2 @workbench；商店 行商（輪替貨，280） |
| coat_trousers | 長褲與長靴 | 配方 banner 2 + chitin 1 @workbench |
| explorer_vest | 探險背心 | 配方 banner 1 + planks 4 @workbench；箱子 cabin / mineshaft 2%、ruin / cavern 1.25%、sky 1.43% |
| explorer_shorts | 探險短褲 | 配方 banner 1 + planks 2 @workbench |
| maid_dress | 女僕洋裝 | 箱子 dungeon 3.75%、treasure 7.27%、secret 3.33%、relic 2.31% |
| maid_skirt | 荷葉圍裙裙 | 箱子 dungeon 3.75%、treasure 7.27%、secret 3.33%、relic 2.31% |
| maid_headdress | 女僕頭飾 | 箱子 dungeon 3.75%、treasure 7.27%、secret 3.33%、relic 2.31% |
| straw_hat | 草帽 | 配方 wood 6 @workbench（開局材料）；箱子 cabin / mineshaft 2%、ruin / cavern 1.25%、sky 1.43% |
| witch_hat | 魔女帽 | 箱子 dungeon 3.75%、treasure 7.27%、secret 3.33%、relic 2.31%；商店 行商（260） |
| beret | 貝雷帽 | 配方 banner 1 + gel 1 @workbench；箱子 cabin / mineshaft 2%、ruin / cavern 1.25%、sky 1.43% |
| flower_crown | 花冠 | 配方 mushroom 2 + glow_mushroom 2 @workbench；箱子 cabin / mineshaft 2%、ruin / cavern 1.25%、sky 1.43%；商店 園丁（150） |
| travel_cape | 旅人斗篷 | 配方 banner 3 + feather 2 @workbench |
| feather_wings | 白羽翅膀 | 箱子 dungeon 3.75%、treasure 7.27%、secret 3.33%、relic 2.31%；商店 行商（700） |
| ribbon_bow | 大蝴蝶結 | 箱子 dungeon 3.75%、treasure 7.27%、secret 3.33%、relic 2.31% |
| miner_helmet | 礦工頭燈盔 | 商店 矮人礦石商（摯友，600）——只在商店 |
| ninja_top | 忍者上衣 | 配方 banner 2 + fang 2 @workbench |
| ninja_bottom | 忍者褲 | 配方 banner 1 + fang 2 @workbench |
| mage_top | 魔導長袍 | 怪物 spore_walker 3%；箱子 cavern 1.25% |
| mage_bottom | 魔導袍下襬 | 怪物 spore_walker 3%；箱子 cavern 1.25% |
| knight_top | 騎士罩袍 | 配方 banner 2 + iron_bar 4 @anvil；怪物 bone_knight 3% |
| knight_bottom | 騎士鎖甲褲 | 配方 banner 1 + iron_bar 3 @anvil；怪物 bone_knight 3% |
| qipao_top | 旗袍上身 | 怪物 ember_imp 3%；箱子 secret 3.33%、relic 2.31% |
| qipao_bottom | 旗袍開衩裙 | 怪物 ember_imp 3%；箱子 secret 3.33%、relic 2.31% |
| pirate_top | 海盜外套 | 怪物 razor_fin 3%；箱子 ruin 1.25%、cavern 1.25% |
| pirate_bottom | 海盜馬褲長靴 | 怪物 razor_fin 3%；箱子 ruin 1.25%、cavern 1.25% |
| idol_top | 偶像舞台上衣 | 首領 lantern_warden 20%；箱子 treasure 7.27%、relic 2.31% |
| idol_bottom | 偶像蓬蓬裙 | 首領 lantern_warden 20%；箱子 treasure 7.27%、relic 2.31% |
| priest_top | 神官袍 | 怪物 night_walker 3%；箱子 sky 1.43% |
| priest_bottom | 神官袍下襬 | 怪物 night_walker 3%；箱子 sky 1.43% |
| gothic_top | 哥德洋裝 | 怪物 cursed_skull 2%；箱子 dungeon 3.75%、treasure 7.27%、relic 2.31%；首領 lantern_warden 20% |
| gothic_bottom | 哥德多層裙 | 怪物 cursed_skull 2%；箱子 dungeon 3.75%、treasure 7.27%、relic 2.31%；首領 lantern_warden 20% |
| acc_ribbon | 蝴蝶結 | 配方 banner 1 + gel 2 @workbench |
| acc_catears | 貓耳髮箍 | 箱子 cabin 2%；商店 村落雜貨商（好感 1，240） |
| acc_clip | 星星髮夾 | 怪物 dusk_owl 4%；箱子 sky 1.43% |
| acc_hood | 兜帽 | 配方 banner 2 + feather 1 @workbench |
| acc_flower | 小花 | 配方 mushroom 2 + gel 1 @workbench（開局材料） |
| acc_crown | 小皇冠 | 首領 lantern_warden 20%；箱子 treasure 7.27%、relic 2.31% |
| acc_headphones | 耳機 | 怪物 cave_bat 3%；箱子 mineshaft 2% |
| acc_foxmask | 狐狸面具 | 怪物 frost_wolf 4%；箱子 ruin 1.25% |
| acc_hairpin | 髮簪 | 怪物 thorn_hornet 4%；箱子 ruin 1.25%、secret 3.33% |
| acc_glasses | 眼鏡 | 配方 glass 2 + copper_bar 1 @workbench |

已知缺口：**舊世界 + 和平模式**（箱子已生成、不生怪）拿不到只靠「怪物 + 新箱子池」的 12 件：mage ×2、qipao ×2、pirate ×2、priest ×2、acc_clip、acc_headphones、acc_foxmask、acc_hairpin；開新世界即可從箱子拿到。新物品中沒有「只在箱子」的款式。
