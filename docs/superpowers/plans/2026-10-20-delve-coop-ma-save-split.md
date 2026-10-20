# DELVE Co-op M-A：角色／世界存檔拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把單一存檔拆成「角色檔 `DelveCharacter`（cformat 1）」與「世界檔 format 10（含每角色 `visits`）」，舊存檔（format ≤ 9）讀檔時自動遷移並先留 `main.v9.bak`，單機玩法行為不變。

**Architecture:** 不重寫還原邏輯：存檔 = 現行 `snapshotGame()`（format 9 的完整 header）→ `splitSnapshot()` 切成世界 + 角色；讀檔 = `joinSplit()` 把世界 + 角色拼回 format-9 形狀的 `SaveData` → 交給現行 `restoreGame()`。遷移和平常存檔走同一個切分函式，所以「遷移後 == 再存一次」由構造保證。IDB 的讀寫順序（先備份、兩個 store 同一個 transaction）抽成可注入的 `SplitStore` 介面，用記憶體假實作做單元測試，真 IDB 用 e2e 驗。

**Tech Stack:** TypeScript、IndexedDB、CompressionStream（gzip）、vitest（happy-dom）、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-20-delve-coop-design.md`（只實作 §5.1 與 §6 的 M-A；不含 M-B 多 actor 引擎、不含網路）

所有路徑相對 `src/scripts/games/delve/`，除非以 `tests/` / `docs/` 開頭。

### 規格與程式碼的差異（程式碼為準）

- 規格說「現有約 70 個測試檔依賴 `restoreGame`」：實際引用 `restoreGame`／`serializeGame` 的測試檔是 **16 個**。結論不變（仍要保留舊路徑）。
- 規格引 `buffOn` 在 `game.ts:3282`：實際在 `engine/game.ts:3289`（`giveBuff` 在 `:3291`）；`game.ts` 現為 3779 行（規格寫 3765）。
- 規格把 `vitals` 整包列為玩家欄位：實際 `VitalsSave`（`save/serialize.ts:103`）裡還夾著 `undying`（不滅冷卻）。本計畫：`undying` → 角色 `undyingCd`；`breath/burning/honey` → `visits[charId].vitals`。
- `header.extra`（`serialize.ts:187-196`）是混合欄位：`fishLog`、`codex` 屬角色；`minedIce`、`rng` 屬世界。
- `folk.buffs` 存的是世界時間絕對值（`serialize.ts:161-162`、`game.ts:3292`）—— 與規格一致，角色檔改存剩餘秒數。
- `useBed` 會清 `settle.spawnCore`（`game.ts:1377`），`setSpawnCore` 會清 `bed`（`game.ts:3106`）：兩者互斥，都搬進 visit。
- `storage.ts` 註明「只做瀏覽器 I/O，不做單元測試」，`package.json` 也沒有 `fake-indexeddb`：IDB 層不寫單元測試，改用注入介面 + e2e（見 Architecture）。
- 規格分支基準寫 `feat/delve-races @ 6322fb3a`：種族已併進 `feat/delve-coop`（`Appearance.race` 存在），R9 已滿足。
- 已核對無誤：`SAVE_FORMAT = 9`（`serialize.ts:72`）、header `:105-158`、`encodeSave` `:502-520`、`encodeLiquidRle` `:271`、`DB_NAME/DB_VERSION/STORE` `storage.ts:4-6`、`onupgradeneeded` `:91-94`、`AUTOSAVE_INTERVAL_MS` `:7`、`SLOT = 'main'` `session.ts:25`、`__delveDebug` `session.ts:189`、`settle.spawnCore` `settlement.ts:210`。

### 本計畫的建造者決定（擁有者可推翻）

- **D1** `SAVE_FORMAT` 維持 9，`serializeGame`／`restoreGame` 原封保留為「舊版合併格式」讀寫器（既有 16 個測試檔零修改）；新常數 `WORLD_FORMAT = 10`。
- **D2** 開「新世界」= 新世界 + **新角色**（與現在一樣從頭開始，單機行為不變）。舊角色檔留在 `characters` store，不刪。「帶現有角色進新世界」的選擇 UI 留到 M-C 角色選單。
- **D3** 標題畫面不加新控制項：「繼續」摘要第二行最前面顯示暱稱（`旅人 · 等級 3 · …`），這就是「自動選中唯一角色」的可見部分。v1 只有一個世界槽 `main`，它記著上次玩它的 `charId`。
- **D4** 匯出 `.delve` = format-10 世界檔，header 內嵌 `character`（只有匯出檔有）。匯入接受 format ≤ 9（走遷移）或內嵌角色的 format 10。
- **D5** 某筆 `visits` 壞掉 → 只丟那一筆（該角色在這個世界從出生點重來），不判整個世界損毀。
- **D6** 「繼續」時角色檔不見或損毀 → 顯示訊息、不開局、不寫任何東西（世界與角色記錄都不動）。
- **D7** 備份存在 `saves` store 的 `main.v9.bak` 記錄（整筆記錄複製，壓縮後的 bytes 逐位元相同）；`listSlots` 不列 `.bak`。
- **D8** id 用 `crypto.randomUUID()`；不存在時（例如手機用 `http://192.168.x.x:4321` 測，非安全情境）退回 `crypto.getRandomValues` 組 v4 UUID。不加依賴。
- **待擁有者確認** `LevelsJSON.placed`／`chests`（`engine/levels.ts:139-140`，防刷用的 tile index）其實是「某個世界」的資料，但規格把 `levels` 整包放角色檔。M-A 照規格整包帶走（單一世界時無差別）；跨世界時這兩個清單會指到別的世界的格子（最壞情況：某格挖礦／開箱少給一次 XP）。建議 M-B 搬進 visit。

## Global Constraints

- 角色檔：`cformat: 1`；`nick` 預設 `旅人`，最多 16 字（`MAX_NICK = 16`）；`id` 為 UUID。
- 世界檔：`format: 10`；新增 `worldId`（UUID）、`worldName`（v1 = seed）、`visits: { [charId]: { pos, bed, spawnCore, explored, markers, discovery, vitals, lastSeen } }`，最多 `MAX_VISITS = 8` 筆，超過以 `lastSeen` 最舊者淘汰（LRU）。
- `bossesDefeated`、`kills`、`peaceful`、任務、NPC 好感度、`scoutMarks`／`perkDays`／`scouted` 留在世界檔；`settle.spawnCore` 在世界檔一律寫 `null`，改存 `visits[charId].spawnCore`。
- IDB：`DB_VERSION` 1 → 2，新增 object store `characters`（keyPath `id`）；`saves` store 不動。
- 遷移：**先**把舊記錄原封複製到 `main.v9.bak`，**再**寫新格式；`restoreGame` 繼續接受 format ≤ 9；`restoreSplit(world, character)` 為主路徑。
- 所有自動存檔／手動存檔／回到標題都同時寫角色與世界（同一個 IDB transaction）。
- UI 文案一律繁體中文、直接寫在 delve 程式裡（delve 不走站台 i18n：`src/scripts/games/delve/` 內無任何 i18n 引用，`session.ts`／`titleModel.ts` 的文案都是寫死中文）。
- 測試：`npx vitest run`（禁用 `npm test`／`npm run test`，watch 模式會掛住）。delve 子集：`npx vitest run src/scripts/games/delve`。E2E：`npx playwright test tests/e2e/delve.spec.ts --project=chromium`。
- 已知無關 flake：`src/scripts/games/tetris/render/ffaLayout.test.ts` 在全套負載下可能逾時；單獨重跑通過即可。
- TDD：先寫失敗測試。Conventional Commits，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 禁 `!important`、禁行內樣式；不新增依賴。

## Review Focus

1. **遷移寫到一半被中斷**（備份寫好、新格式還沒寫就關分頁）→ 下次開啟仍是舊格式，重新遷移成功，備份內容仍是原始 bytes。（Task 6：`commitMigration` 第一次 `putSplit` 丟錯的測試）
2. **非安全情境沒有 `crypto.randomUUID`**（手機用區網 IP 測）→ 照樣產生合法 UUID，不會開局就丟例外。（Task 2：stub 掉 `randomUUID` 的測試）
3. **世界記錄指向的角色不見或損毀** → 清楚訊息、世界 bytes 與角色記錄都沒被寫。（Task 6：`planContinue` 兩個錯誤分支 + 寫入計數 0）
4. **M-A 之前匯出的舊 `.delve` 檔**（format 9，未壓縮或 gzip）→ 匯入後遷移成角色 + 世界，內容相等。（Task 3：`decodeAnySave` 認出 legacy；Task 5 驗收測試走同一條路）
5. **buff 帶到時間較早的另一個世界** → 剩餘秒數不變，不會因為新世界的 `time` 比較小而變成 1000 秒以上或直接消失。（Task 4：跨世界 buff 測試）

---

### Task 1: 凍結 format-9 fixture（在任何格式改動之前）

**Files:**
- Create: `save/legacyFixture.ts`（測試用場景，比照 `engine/houseFixture.ts` 的定位）
- Create: `save/legacyFixture.freeze.test.ts`（只在環境變數開啟時寫檔）
- Create: `save/__fixtures__/format9.delve`（未壓縮的 `DLVS` bytes，二進位檔入庫）
- Create: `save/legacyFixture.test.ts`（守門：fixture 內容如預期）

**Interfaces:**
- Produces: `buildLegacyFixtureGame(): DelveGame`；`FIXTURE_NOW = 1_760_000_000_000`；`FIXTURE_SEED = 'fixture-v9'`；`FIXTURE_SIZE = { width: 200, height: 100 }`；`FIXTURE_CHEST = { x: 56, y: 58 }`；`readLegacyFixture(): Uint8Array`（`readFileSync(new URL('./__fixtures__/format9.delve', import.meta.url))`）。

- [ ] **Step 1: 寫 `buildLegacyFixtureGame()`**

照 `engine/game.settle.test.ts:17-41` 的 `arena()`／`village()` 做法（`GROUND = 60`、清液體與泉水、`setDate({ hour: 12 })`），`peaceful: true`，然後依序放進每一種要拆分的欄位（全部確定值，不用 `Math.random`）：
- 角色：`setAppearance({ ...appearance, race: 3 })`（貓族）；`giveGear('gold_sword', 4, { affixes: [{id:'blazing',tier:5,value:30}], plus: 3 })` 並 `toggleLock`；`giveGear('iron_chestplate', 2, …)` 後 `equipFromInventory`；`give('torch', 23)`；`vanity.set('body', 'sailor_top')`；`levels.gain(500)`；`giveBuff('bless')`；`fishLog = { silver_minnow: 3 }`；`observeGear()`（codex 非空）；`undyingCd = 42`；`hp = 63.5`。
- 世界：`buildHouse(w, 50, 54, 8, 5)`；在 `(60, 59)` 放 `hearth` 成立據點並 `setSpawnCore(cores[0].id)`；`FIXTURE_CHEST` 放 `T.CHEST`，`chests.set` 第 0 格 `{ item: 'copper_coin', count: 37 }`、第 1 格 `silver_bow` 帶 gear `{ rarity: 3, ilvl: 3, plus: 1, affixes: [{ id: 'keen', tier: 3, value: 12 }] }`；`kills = { gel_blob: 4 }`；`bossesDefeated` 不動。
- visit：`toggleMarker(70, 50)`、`toggleMarker(80, 40)`；`explored.revealDisc(100, 50, 12)`；`breath` 設為 `MAX_BREATH - 3`；`teleport(64, 59)`。

- [ ] **Step 2: 寫凍結測試**

```ts
it.runIf(process.env.DELVE_FREEZE_FIXTURE === '1')('freeze format-9 fixture', () => {
  expect(SAVE_FORMAT).toBe(9); // 防呆：格式變了就不准再凍結
  writeFileSync(fixtureUrl, serializeGame(buildLegacyFixtureGame(), FIXTURE_NOW));
});
```

- [ ] **Step 3: 產生並檢查 fixture**

Run（PowerShell）：`$env:DELVE_FREEZE_FIXTURE='1'; npx vitest run src/scripts/games/delve/save/legacyFixture.freeze.test.ts; Remove-Item Env:DELVE_FREEZE_FIXTURE`
Expected：1 passed，`save/__fixtures__/format9.delve` 存在、開頭 4 bytes 為 `DLVS`。

- [ ] **Step 4: 寫守門測試 `legacyFixture.test.ts`**

```ts
it('fixture 是 format 9、每個要拆的欄位都有值', () => {
  const d = decodeSave(readLegacyFixture());
  expect(d.header.format).toBe(9);
  expect(d.header.seed).toBe('fixture-v9');
  expect(d.header.settle!.spawnCore).not.toBeNull();
  expect(Object.keys(d.header.folk!.buffs)).toEqual(['bless']);
  expect(d.header.vitals!.undying).toBe(42);
  expect(d.header.extra!.fishLog).toEqual({ silver_minnow: 3 });
  expect(d.header.markers).toHaveLength(2);
  expect(d.header.appearance!.race).toBe(3);
  expect(d.header.chests!.find((c) => c.i === 58 * 200 + 56)!.slots[0]).toEqual({ item: 'copper_coin', count: 37 });
});
it('fixture 用 restoreGame 讀得回來', () => { expect(restoreGame(readLegacyFixture()).ok).toBe(true); });
```

- [ ] **Step 5: 跑測試**

Run：`npx vitest run src/scripts/games/delve/save/legacyFixture`
Expected：守門 2 passed、凍結 1 skipped。

- [ ] **Step 6: Commit**

```bash
git add src/scripts/games/delve/save/legacyFixture.ts src/scripts/games/delve/save/legacyFixture.freeze.test.ts src/scripts/games/delve/save/legacyFixture.test.ts src/scripts/games/delve/save/__fixtures__/format9.delve
git commit -m "test(delve): freeze a format-9 save fixture for the co-op save split"
```

---

### Task 2: 角色檔 `DelveCharacter`（格式、驗證、編解碼）

**Files:**
- Create: `save/character.ts`
- Modify: `save/serialize.ts`（只加 `export`：`validInventory`、`validStack`、`validLevels`、`isNum`，以及從 `validExtra` 抽出的 `validFishLog(v: unknown): Partial<Record<ItemId, number>>`；行為不變）
- Test: `save/character.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CHARACTER_FORMAT = 1;
  export const DEFAULT_NICK = '旅人';
  export const MAX_NICK = 16;
  export interface DelveCharacter {
    cformat: 1; id: string; nick: string; createdAt: number; savedAt: number; rev: number;
    appearance: Appearance; vanity: VanityJSON; inventory: InventoryJSON;
    equipment: EquipmentJSON; equipGear: EquipmentGearJSON;
    combat: { hp: number; baseMaxHp: number; mana: number };
    levels: LevelsJSON; codex: CodexJSON; fishLog: Partial<Record<ItemId, number>>;
    undyingCd: number; buffsLeft: Partial<Record<BuffKind, number>>;
  }
  export interface CharIdentity { id: string; nick: string; createdAt: number; rev: number }
  export function newId(): string;
  export function newIdentity(now: number): CharIdentity;          // nick = DEFAULT_NICK, rev = 0
  export function validateCharacter(raw: unknown): DelveCharacter; // 丟 SaveFormatError
  export function encodeCharacter(c: DelveCharacter): Uint8Array;  // UTF-8 JSON（gzip 在 storage 做）
  export function decodeCharacter(bytes: Uint8Array): DelveCharacter;
  ```
- 驗證規則（嚴格 = 丟 `SaveFormatError('character: <欄位>')`；寬鬆 = 正規化）：
  - 嚴格：`cformat !== 1`；`id` 不符 `/^[A-Za-z0-9-]{1,64}$/`；`rev` 不是 ≥ 0 整數；`inventory`（`validInventory`，含 gear 驗證）；`equipment`／`equipGear` 不是物件；`combat.hp/baseMaxHp/mana` 不是有限數；JSON 解析失敗。
  - 寬鬆：`nick`（trim 後空或超過 16 字 → `旅人`）；`createdAt/savedAt`（非有限數 → 0）；`appearance`（`normalizeAppearance`）；`vanity`（`Vanity.fromJSON`）；`levels`（`validLevels`）；`codex`（非物件 → 空）；`fishLog`（`validFishLog`）；`undyingCd`（非數或 < 0 → 0）；`buffsLeft`（只留 `BUFFS` 裡的 kind 且為 > 0 有限數）。

- [ ] **Step 1: 寫失敗測試**

```ts
const good = (): DelveCharacter => ({ cformat: 1, id: 'abc-123', nick: '小明', createdAt: 1, savedAt: 2, rev: 3,
  appearance: normalizeAppearance({ race: 3 }), vanity: new Vanity().toJSON(),
  inventory: { slots: [{ item: 'torch', count: 5 }], selected: 0 }, equipment: new Equipment().toJSON(),
  equipGear: new Equipment().gearJSON(), combat: { hp: 80, baseMaxHp: 120, mana: 20 },
  levels: new Progression().toJSON(), codex: new Codex().toJSON(), fishLog: { silver_minnow: 3 },
  undyingCd: 12, buffsLeft: { bless: 90 } });
it('encode → decode 往返完全相等', () => expect(decodeCharacter(encodeCharacter(good()))).toEqual(good()));
it.each([
  ['cformat 2', { cformat: 2 }], ['沒有 id', { id: '' }], ['壞背包', { inventory: { slots: [{ item: 'nope', count: 1 }] } }],
  ['背包 gear 不合法', { inventory: { slots: [{ item: 'torch', count: 1, gear: { rarity: 9 } }] } }],
  ['hp 是字串', { combat: { hp: '80', baseMaxHp: 120, mana: 20 } }], ['rev 負數', { rev: -1 }],
])('壞角色檔被拒：%s', (_, patch) => expect(() => validateCharacter({ ...good(), ...patch })).toThrow(SaveFormatError));
it('不是 JSON → SaveFormatError', () => expect(() => decodeCharacter(new Uint8Array([1, 2, 3]))).toThrow(SaveFormatError));
it('暱稱空白或太長 → 旅人；未知 buff 丟掉', () => {
  const c = validateCharacter({ ...good(), nick: '   ', buffsLeft: { bless: 5, nope: 3, ward: -1 } });
  expect(c.nick).toBe('旅人'); expect(c.buffsLeft).toEqual({ bless: 5 });
  expect(validateCharacter({ ...good(), nick: 'x'.repeat(17) }).nick).toBe('旅人');
});
it('newId 是 UUID v4；沒有 randomUUID 時也是', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  expect(newId()).toMatch(re);
  const real = globalThis.crypto; vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) }); // 沒有 randomUUID
  expect(newId()).toMatch(re); expect(newId()).not.toBe(newId()); vi.unstubAllGlobals();
});
it('newIdentity：暱稱旅人、rev 0', () => expect(newIdentity(7)).toMatchObject({ nick: '旅人', createdAt: 7, rev: 0 }));
```

- [ ] **Step 2: 跑測試確認失敗**

Run：`npx vitest run src/scripts/games/delve/save/character.test.ts`
Expected：FAIL（`./character` 不存在）

- [ ] **Step 3: 實作 `save/character.ts` 與 `serialize.ts` 的 export**

`newId`：`crypto.randomUUID?.()`，否則 16 bytes `getRandomValues`、設 version 4／variant 位元後格式化。

- [ ] **Step 4: 跑測試確認通過，並確認既有存檔測試沒壞**

Run：`npx vitest run src/scripts/games/delve/save`
Expected：全部 PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(delve): add the portable DelveCharacter save format"
```

---

### Task 3: 世界檔 format 10（純資料：切分、拼回、編解碼、LRU）

**Files:**
- Create: `save/worldSave.ts`
- Modify: `save/serialize.ts`（只加 `export`：其餘 `valid*` 驗證函式、`validateChunk`、`toBase64/fromBase64`；把 `encodeSave` 的容器寫法抽成 `encodeContainer(headerJson: unknown, order: readonly number[], chunks: Map<number, ChunkPayload>): Uint8Array`，`decodeSave` 的前半抽成 `readContainer(bytes): { raw: unknown; body: number }` 與 `readChunks(bytes, body, order): Map<number, ChunkPayload>`；`encodeSave`／`decodeSave` 改呼叫它們，行為不變）
- Test: `save/worldSave.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `DelveCharacter`、`CharIdentity`、`validateCharacter`。
- Produces:
  ```ts
  export const WORLD_FORMAT = 10;
  export const MAX_VISITS = 8;
  export interface VisitSave {
    pos: PlayerSave; bed: { x: number; y: number } | null; spawnCore: number | null;
    explored?: string; markers: MapMarker[]; discovery?: DiscoveryJSON;
    vitals: { breath: number; burning: number; honey: number }; lastSeen: number;
  }
  export type VisitMap = Record<string, VisitSave>;
  export interface WorldHeader {
    format: 10; genVersion: number; seed: string; width: number; height: number;
    time: number; tick: number; savedAt: number; worldId: string; worldName: string;
    chunks: number[]; chests: ChestSave[]; unlocked: number[]; keysUsed: number;
    combat: { bosses: string[]; kills: Partial<Record<EnemyKind, number>>; peaceful: boolean };
    liquids?: LiquidSave; drops: DropSave[]; bossActive: EnemyKind | null; env?: EnvSave;
    extra: { minedIce: number[]; rng?: { loot?: RngState; fish?: RngState } };
    settle?: SettlementJSON; halves?: number[]; folk?: Omit<FolkSave, 'buffs'>;
    visits: VisitMap;
    /** 只有匯出檔有（D4） */
    character?: DelveCharacter;
  }
  export interface WorldData { header: WorldHeader; chunks: Map<number, ChunkPayload> }
  export interface WorldIdentity { worldId: string; worldName: string; visits: VisitMap }
  export function splitSnapshot(data: SaveData, who: CharIdentity, where: WorldIdentity, now: number): { world: WorldData; character: DelveCharacter };
  export function joinSplit(world: WorldData, character: DelveCharacter): { data: SaveData; freshVisit: boolean };
  export function upsertVisit(visits: VisitMap, charId: string, v: VisitSave, max?: number): VisitMap; // 不改輸入
  export function encodeWorld(w: WorldData): Uint8Array;
  export function decodeWorld(bytes: Uint8Array): WorldData;       // 丟 SaveFormatError
  export type AnySave = { kind: 'legacy'; data: SaveData } | { kind: 'world'; data: WorldData };
  export function decodeAnySave(bytes: Uint8Array): AnySave;       // 依 header.format 分流（≤ 9 → decodeSave）
  ```
- 切分規則（`splitSnapshot`，輸入是 `snapshotGame` 產生的完整 format-9 header）：
  - 角色：`inventory`、`appearance`、`vanity`、`levels`、`combat.{equipment,equipGear}`、`combat.hp/mana`、`baseMaxHp = combat.maxHp`、`codex = extra.codex`、`fishLog = extra.fishLog`、`undyingCd = vitals.undying ?? 0`、`buffsLeft[k] = folk.buffs[k] - time`（只留 > 0）、`savedAt = now`、身分欄位照抄 `who`。
  - visit：`pos = player`、`bed`、`spawnCore = settle.spawnCore`、`explored`、`markers`、`discovery`、`vitals = {breath, burning, honey}`、`lastSeen = now`；以 `upsertVisit(where.visits, who.id, …)` 放進 `visits`。
  - 世界：其餘欄位；`settle.spawnCore` 改寫 `null`；`folk` 去掉 `buffs`；`combat` 只留 `bosses/kills/peaceful`；`extra` 只留 `minedIce/rng`；`format = 10`、`worldId/worldName` 照抄 `where`。
- 拼回規則（`joinSplit`）：反向組出 `format: SAVE_FORMAT` 的 header；`folk.buffs[k] = world.time + buffsLeft[k]`（`world.folk` 不存在時以 `{ world: {}, quests: {}, scoutMarks: [], perkDays: { guide: -1, healer: -1 }, scouted: [] }` 補）；`vitals = { ...(visit?.vitals ?? { breath: MAX_BREATH, burning: 0, honey: 0 }), undying: character.undyingCd }`；`settle.spawnCore = visit?.spawnCore ?? null`；沒有 visit 時 `freshVisit: true`、`player = { x: 0, y: 0, vx: 0, vy: 0 }`（佔位，Task 4 會跳過）。
- `decodeWorld` 驗證：重用 serialize 的驗證函式；`worldId` 不符 `/^[A-Za-z0-9-]{1,64}$/` → 損毀；`worldName` 非字串或 > 64 字 → 退回 `seed`；`visits` 非物件 → 損毀，但單筆 visit 不合法 → 丟掉該筆（D5）；超過 8 筆 → 只留 `lastSeen` 最新 8 筆；`character` 有值時過 `validateCharacter`。

- [ ] **Step 1: 寫失敗測試**（用 Task 1 fixture，不必生成世界：`decodeSave(readLegacyFixture())` 就是完整 header）

```ts
const legacy = () => decodeSave(readLegacyFixture());
const who = { id: 'c1', nick: '旅人', createdAt: 5, rev: 1 }, where = { worldId: 'w1', worldName: 'fixture-v9', visits: {} };
it('切分：角色拿到玩家欄位、世界不再有玩家欄位', () => {
  const { world, character } = splitSnapshot(legacy(), who, where, 99);
  const h = world.header as unknown as Record<string, unknown>;
  for (const k of ['player', 'inventory', 'appearance', 'vanity', 'levels', 'explored', 'markers', 'discovery', 'bed', 'vitals']) expect(h[k]).toBeUndefined();
  expect(world.header.settle!.spawnCore).toBeNull();
  expect(world.header.folk).not.toHaveProperty('buffs');
  expect(world.header.extra).not.toHaveProperty('codex');
  expect(world.header.visits.c1.spawnCore).toBe(legacy().header.settle!.spawnCore);
  expect(world.header.visits.c1.lastSeen).toBe(99);
  expect(character.undyingCd).toBe(42);
  expect(character.buffsLeft.bless).toBeCloseTo(legacy().header.folk!.buffs.bless! - legacy().header.time, 6);
});
it('世界檔 encode → decode 往返相等', () => {
  const { world } = splitSnapshot(legacy(), who, where, 99);
  const back = decodeWorld(encodeWorld(world));
  expect(back.header).toEqual(world.header);
  expect([...back.chunks.keys()]).toEqual(world.header.chunks);
});
it('切分再拼回 = 原本的 header（buff 允許 1e-6 誤差）', () => {
  const src = legacy().header;
  const { world, character } = splitSnapshot(legacy(), who, where, 99);
  const { data, freshVisit } = joinSplit(world, character);
  expect(freshVisit).toBe(false);
  const { folk, savedAt, ...rest } = data.header; const { folk: f0, savedAt: s0, ...rest0 } = src;
  expect(rest).toEqual(rest0);
  expect(folk!.buffs.bless).toBeCloseTo(f0!.buffs.bless!, 6);
});
it('沒有這個角色的 visit → freshVisit', () => {
  const { world, character } = splitSnapshot(legacy(), who, where, 99);
  expect(joinSplit(world, { ...character, id: 'other' }).freshVisit).toBe(true);
});
it('visits LRU：第 9 個角色擠掉最久沒來的', () => {
  let v: VisitMap = {};
  for (let i = 0; i < 9; i++) v = upsertVisit(v, `c${i}`, { ...visit0, lastSeen: 100 + i });
  expect(Object.keys(v)).toHaveLength(8); expect(v.c0).toBeUndefined(); expect(v.c8).toBeDefined();
});
it('壞的單筆 visit 被丟掉，世界照讀；worldId 壞掉 → 損毀', () => { /* 改 header JSON 後 encode，見 Interfaces 驗證規則 */ });
it('decodeAnySave：format 9 → legacy、format 10 → world、亂碼 → SaveFormatError', () => {
  expect(decodeAnySave(readLegacyFixture()).kind).toBe('legacy');
  expect(decodeAnySave(encodeWorld(splitSnapshot(legacy(), who, where, 1).world)).kind).toBe('world');
  expect(() => decodeAnySave(new Uint8Array(10))).toThrow(SaveFormatError);
});
it('restoreGame 收到 format 10 bytes → format 錯誤（不會被誤讀）', () => {
  expect(restoreGame(encodeWorld(splitSnapshot(legacy(), who, where, 1).world))).toMatchObject({ ok: false, error: 'format' });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run：`npx vitest run src/scripts/games/delve/save/worldSave.test.ts`
Expected：FAIL（`./worldSave` 不存在）

- [ ] **Step 3: 實作 serialize.ts 的抽取與 `save/worldSave.ts`**

- [ ] **Step 4: 跑 save 目錄全部測試**

Run：`npx vitest run src/scripts/games/delve/save`
Expected：全部 PASS（既有 `serialize.*.test.ts` 不改一行）

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(delve): add world save format 10 with per-character visits"
```

---

### Task 4: `restoreSplit` 與跨世界行為

**Files:**
- Modify: `save/serialize.ts:213-219`（`RestoreOptions` 加 `freshVisit?: boolean`）、`:817-831`（`freshVisit` 時跳過玩家位置、探索、標記、發現、床這幾行，保留建構子給的出生點狀態）
- Modify: `save/worldSave.ts`（加 `restoreSplit`、`saveSplitGame`）
- Create: `save/expectSameGame.ts`（測試輔助：逐欄比較兩個 `DelveGame`）
- Test: `save/worldSave.restore.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `joinSplit`、`splitSnapshot`、`decodeWorld`。
- Produces:
  ```ts
  export type SplitRestoreResult =
    | { ok: true; game: DelveGame; world: WorldHeader; freshVisit: boolean }
    | Extract<RestoreResult, { ok: false }>;
  export function restoreSplit(world: Uint8Array | WorldData, character: DelveCharacter, opts?: RestoreOptions): SplitRestoreResult;
  // = splitSnapshot(snapshotGame(game, now), who, where, now)
  export function saveSplitGame(game: DelveGame, who: CharIdentity, where: WorldIdentity, now: number): { world: WorldData; character: DelveCharacter };
  // save/expectSameGame.ts
  export function expectSameGame(a: DelveGame, b: DelveGame, o?: { visit?: boolean }): void;
  ```
- `expectSameGame` 比較（`visit: false` 時跳過最後一組）：`inventory.toJSON()`、`equipment.toJSON()`＋`gearJSON()`、`vanity.toJSON()`、`appearance`、`levels.toJSON()`、`codex.toJSON()`、`fishLog`、`hp`、`baseMaxHp`、`mana`、`maxHp()`、`undyingCd`、`activeBuffs()` 的 kind 與 `left`（`toBeCloseTo` 6 位）、`world.fg`／`world.wall`／`world.half`／`world.liquid`／`world.liquidType` 整個陣列、`[...world.chests]`、`world.unlocked`、`world.keysUsed`、`drops.list` 的 item/count/gear、`bossesDefeated`、`kills`、`peaceful`、`time`、`tick`、`settle.toJSON()`、`folk.toJSON()`、`quests.toJSON()`、`scoutMarks`、`perkDays`、`[...scouted]`、`[...minedIce]`、`rngState()`；visit 組：`player.x/y`、`bed`、`settle.spawnCore`、`explored.encode()`、`markers`、`discovery.toJSON()`、`breath`、`burning`、`honeyT`。

- [ ] **Step 1: 寫失敗測試**

```ts
const fixtureGame = () => { const r = restoreGame(readLegacyFixture()); if (!r.ok) throw new Error(r.message); return r.game; };
it('角色 + 世界往返：restoreSplit 的遊戲與原遊戲逐欄相等', () => {
  const a = fixtureGame();
  const { world, character } = saveSplitGame(a, who, where, 99);
  const r = restoreSplit(encodeWorld(world), decodeCharacter(encodeCharacter(character)));
  expect(r.ok).toBe(true); if (!r.ok) return;
  expect(r.freshVisit).toBe(false);
  expectSameGame(a, r.game);
});
it('同一個角色進另一個世界：物品／裝備／等級都在，visit 是新的', () => {
  const a = fixtureGame();
  const { character } = saveSplitGame(a, who, where, 99);
  const other = new DelveGame({ seed: 'other-world', width: 200, height: 100, peaceful: true });
  const { world: w2 } = saveSplitGame(other, { ...who, id: 'someone-else' }, { worldId: 'w2', worldName: 'other-world', visits: {} }, 50);
  const r = restoreSplit(w2, character);
  expect(r.ok).toBe(true); if (!r.ok) return;
  expect(r.freshVisit).toBe(true);
  expect(r.game.inventory.toJSON()).toEqual(a.inventory.toJSON());
  expect(r.game.equipment.gearJSON()).toEqual(a.equipment.gearJSON());
  expect(r.game.levels.toJSON()).toEqual(a.levels.toJSON());
  expect(r.game.feetTile()).toEqual(other.feetTile());          // 出生點
  expect(r.game.markers).toEqual([]); expect(r.game.bed).toBeNull(); expect(r.game.settle.spawnCore).toBeNull();
  expect(r.game.explored.count).toBe(other.explored.count);       // 只有出生點周圍揭露
});
it('buff 帶到時間較早的世界：剩餘秒數不變', () => {
  const a = fixtureGame(); const leftA = a.activeBuffs()[0].left;
  const { character } = saveSplitGame(a, who, where, 99);
  const other = new DelveGame({ seed: 'early', width: 200, height: 100 }); other.time = 10;
  const r = restoreSplit(saveSplitGame(other, { ...who, id: 'x' }, { worldId: 'w3', worldName: 'early', visits: {} }, 1).world, character);
  if (!r.ok) throw new Error();
  expect(r.game.activeBuffs()[0].left).toBeCloseTo(leftA, 6);
});
it('死亡中存檔：visit 存重生點（據點爐心旁）、角色滿血', () => {
  const a = fixtureGame(); a.hurtPlayer(9999, 0); expect(a.dead).toBe(true);
  const { world, character } = saveSplitGame(a, who, where, 99);
  expect(character.combat.hp).toBe(a.maxHp());
  const r = restoreSplit(world, character); if (!r.ok) throw new Error();
  expect(r.game.feetTile()).toEqual(a.respawnPoint());
});
it('兩個角色各自的重生核心互不影響', () => { /* 角色 c1 有 spawnCore、c2 的 visit 是 null → 各自 restoreSplit 後 settle.spawnCore 分別為 id / null */ });
```

- [ ] **Step 2: 跑測試確認失敗**

Run：`npx vitest run src/scripts/games/delve/save/worldSave.restore.test.ts`
Expected：FAIL（`restoreSplit` 未定義）

- [ ] **Step 3: 實作**

`restoreSplit`：bytes 先 `decodeWorld`（`SaveFormatError` → `{ ok: false, error: 'format' }`），`joinSplit` 後呼叫 `restoreGame(data, { ...opts, freshVisit })`，成功時回傳附上 `world.header`。

- [ ] **Step 4: 跑 delve 全部單元測試**

Run：`npx vitest run src/scripts/games/delve`
Expected：全部 PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(delve): restore games from a world plus a character"
```

---

### Task 5: 遷移驗收測試（format 9 fixture → 角色 + 世界 → 存 → 再讀）

**Files:**
- Test: `save/migrate.test.ts`

**Interfaces:**
- Consumes: Task 1 `readLegacyFixture`；Task 2 `newIdentity`、`encodeCharacter`、`decodeCharacter`；Task 3 `decodeAnySave`、`encodeWorld`、`decodeWorld`；Task 4 `restoreSplit`、`saveSplitGame`、`expectSameGame`。
- Produces: 無新 API（這是 §5.1 第 4 點、§6 M-A 第一條的驗收測試）。

- [ ] **Step 1: 寫測試**

```ts
it('format 9 → 遷移 → 存檔 → 再讀：背包／裝備／等級／房屋 chunk／箱子逐欄相等', () => {
  const any = decodeAnySave(readLegacyFixture()); expect(any.kind).toBe('legacy');
  const old = restoreGame(readLegacyFixture()); if (!old.ok) throw new Error(old.message);
  const who = newIdentity(1), where = { worldId: newId(), worldName: old.game.seed, visits: {} };
  const m = saveSplitGame(old.game, who, where, 2);                       // 遷移
  const r1 = restoreSplit(encodeWorld(m.world), decodeCharacter(encodeCharacter(m.character)));
  if (!r1.ok) throw new Error(r1.message);
  expectSameGame(old.game, r1.game);
  const s = saveSplitGame(r1.game, { ...who, rev: who.rev + 1 }, { ...where, visits: r1.world.visits }, 3); // 再存
  const r2 = restoreSplit(decodeWorld(encodeWorld(s.world)), decodeCharacter(encodeCharacter(s.character)));
  if (!r2.ok) throw new Error(r2.message);
  expectSameGame(old.game, r2.game);
  expect(r2.game.world.getFg(49, 58)).toBe(T.DOOR_CLOSED);               // 房子的門
  expect(r2.game.world.chests.get(58 * 200 + 56)![0]).toEqual({ item: 'copper_coin', count: 37 });
});
it('世界檔壞掉的 chunk → 讀世界失敗，但角色檔照樣讀得到', () => { /* 截斷 encodeWorld bytes → restoreSplit ok:false；decodeCharacter 同一份角色 bytes 成功 */ });
```

- [ ] **Step 2: 跑測試**

Run：`npx vitest run src/scripts/games/delve/save/migrate.test.ts`
Expected：PASS（Task 2–4 已實作；若 FAIL，修的是 Task 3/4 的切分／拼回，不是放寬比較）

- [ ] **Step 3: Commit**

```bash
git commit -m "test(delve): migrate the frozen format-9 save field by field"
```

---

### Task 6: 存讀流程編排 `split.ts`（備份順序、角色缺失／損毀、單一寫入）

**Files:**
- Create: `save/split.ts`
- Test: `save/split.test.ts`（內含記憶體版 `SplitStore`，記錄每次呼叫的順序）

**Interfaces:**
- Consumes: Task 2–4 全部；`SaveSummary`、`SlotMeta`（`save/storage.ts`）。
- Produces:
  ```ts
  export const BACKUP_SUFFIX = '.v9.bak';
  export const CHARACTER_MISSING_MSG = '找不到這個世界的角色檔，沒有讀取也沒有修改任何存檔。';
  export const CHARACTER_CORRUPT_MSG = '角色檔已損毀，沒有讀取也沒有修改任何存檔。';
  export interface SlotRead { bytes: Uint8Array; charId?: string }
  export interface SplitStore {
    getSlot(slot: string): Promise<SlotRead | null>;               // 已解壓
    getCharacter(id: string): Promise<Uint8Array | null>;          // 已解壓的角色 JSON bytes
    backupSlot(from: string, to: string): Promise<void>;           // 整筆記錄原封複製
    putSplit(slot: string, world: { bytes: Uint8Array; seed: string; summary?: SaveSummary }, character: DelveCharacter): Promise<SlotMeta>; // 一個 transaction
  }
  export class SplitSession {
    constructor(who: CharIdentity, where: WorldIdentity);
    static fresh(seed: string, now: number): SplitSession;          // newIdentity + newId，worldName = seed
    static fromLoaded(world: WorldHeader, character: DelveCharacter): SplitSession;
    get charId(): string; get nick(): string;
    /** rev + 1、更新 visits，回傳要寫的兩份資料 */
    snapshot(game: DelveGame, now: number): { world: WorldData; character: DelveCharacter };
  }
  export type ContinuePlan =
    | { kind: 'none' }
    | { kind: 'legacy'; data: SaveData }
    | { kind: 'split'; world: WorldData; character: DelveCharacter }
    | { kind: 'error'; message: string };
  export function planContinue(store: SplitStore, slot: string): Promise<ContinuePlan>;
  export function saveSplit(store: SplitStore, slot: string, s: SplitSession, game: DelveGame, now: number, summary?: SaveSummary): Promise<SlotMeta>;
  /** backup = true：先 backupSlot(slot, slot + BACKUP_SUFFIX) 成功後才 putSplit */
  export function commitMigration(store: SplitStore, slot: string, game: DelveGame, now: number, o: { backup: boolean; summary?: SaveSummary }): Promise<SplitSession>;
  ```
- `planContinue` 錯誤對應：世界 bytes 解不開 → `{ kind: 'error', message: '讀取失敗：這不是有效的 DELVE 存檔，或檔案已損毀 / 不完整。' }`（沿用 `session.ts:412` 的字句）；format 10 但 `charId` 沒有記錄 → `CHARACTER_MISSING_MSG`；角色 bytes `decodeCharacter` 丟錯 → `CHARACTER_CORRUPT_MSG`；`character.id !== charId` → `CHARACTER_CORRUPT_MSG`。

- [ ] **Step 1: 寫失敗測試**

```ts
it('遷移：先備份、再寫新格式；備份內容 = 原始 bytes', async () => {
  const st = memStore({ main: { bytes: readLegacyFixture() } });
  const plan = await planContinue(st, 'main'); expect(plan.kind).toBe('legacy');
  const s = await commitMigration(st, 'main', fixtureGame(), 5, { backup: true });
  expect(st.log).toEqual(['backupSlot main main.v9.bak', `putSplit main ${s.charId}`]);
  expect(st.slots['main.v9.bak'].bytes).toEqual(readLegacyFixture());
  expect((await planContinue(st, 'main')).kind).toBe('split');
});
it('遷移中斷（putSplit 丟錯）：舊存檔還在，再遷移一次成功', async () => {
  const st = memStore({ main: { bytes: readLegacyFixture() } }, { failPutOnce: true });
  await expect(commitMigration(st, 'main', fixtureGame(), 5, { backup: true })).rejects.toThrow();
  expect((await planContinue(st, 'main')).kind).toBe('legacy');
  await commitMigration(st, 'main', fixtureGame(), 6, { backup: true });
  expect(st.slots['main.v9.bak'].bytes).toEqual(readLegacyFixture());
  expect((await planContinue(st, 'main')).kind).toBe('split');
});
it('角色檔不見 → 錯誤訊息，沒有任何寫入', async () => {
  const st = await migratedStore(); delete st.chars[st.slots.main.charId!]; st.log.length = 0;
  expect(await planContinue(st, 'main')).toEqual({ kind: 'error', message: CHARACTER_MISSING_MSG });
  expect(st.log).toEqual([]);
});
it('角色檔損毀 → 錯誤訊息，世界 bytes 不變', async () => {
  const st = await migratedStore(); const before = st.slots.main.bytes.slice();
  st.chars[st.slots.main.charId!] = new TextEncoder().encode('{"cformat":1,"id":"x","inventory":7}');
  expect(await planContinue(st, 'main')).toEqual({ kind: 'error', message: CHARACTER_CORRUPT_MSG });
  expect(st.slots.main.bytes).toEqual(before);
});
it('saveSplit：每次只呼叫一次 putSplit，rev 遞增，visits 有自己的 lastSeen', async () => { /* 連存兩次：log 兩筆 putSplit、character.rev 1 → 2 */ });
it('匯入舊檔（backup: false）：不寫備份', async () => { /* commitMigration(..., { backup: false }) → log 只有 putSplit */ });
it('空槽 → none', async () => expect(await planContinue(memStore({}), 'main')).toEqual({ kind: 'none' }));
```

- [ ] **Step 2: 跑測試確認失敗**

Run：`npx vitest run src/scripts/games/delve/save/split.test.ts`
Expected：FAIL（`./split` 不存在）

- [ ] **Step 3: 實作 `save/split.ts`**

- [ ] **Step 4: 跑測試確認通過**

Run：`npx vitest run src/scripts/games/delve/save`
Expected：全部 PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(delve): orchestrate split saves with a backup-first migration"
```

---

### Task 7: IndexedDB v2（`characters` store、`SplitStore` 實作、自動存檔介面）

**Files:**
- Modify: `save/storage.ts:5`（`DB_VERSION = 2`）、`:91-94`（`onupgradeneeded` 另建 `characters`，keyPath `id`；`db.onversionchange = () => { db.close(); dbPromise = null; }`，避免舊分頁卡住升級）、`:10-26`（`SaveSummary` 加 `nick?: string`；`SlotMeta` 加 `charId?: string`、`format?: number`）、`:130-134`（`listSlots` 過濾 slot 結尾為 `.bak` 的記錄）、`:161-196`（`AutosaveOptions` 改成 `{ save: () => Promise<SlotMeta>; intervalMs?; onSaved?; onError? }`，`run` 改呼叫 `opts.save()`，`busy` 防重入不變）
- Modify: `save/storage.ts`（新增 `idbSplitStore: SplitStore`）
- Test: `save/storage.test.ts`（只測 `startAutosave`；IDB 本身由 Task 8 的 e2e 驗）

**Interfaces:**
- Consumes: Task 6 `SplitStore`。
- Produces: `export const idbSplitStore: SplitStore`；`CharacterRecord { id: string; nick: string; savedAt: number; rev: number; data: Uint8Array /* gzip(encodeCharacter) */ }`；`startAutosave(opts: AutosaveOptions): () => void`（新簽名）。
- `idbSplitStore` 行為：`getSlot` = 讀 `saves` 記錄 → `decompress`，帶回 `charId`；`getCharacter` = 讀 `characters` → `decompress`；`backupSlot(from, to)` = 在同一個 readwrite transaction 讀 `from` 記錄、以 `{ ...rec, slot: to }` 寫回（`data` 不解壓、不重壓）；`putSplit` = 先 `compress` 兩份，再開 `db.transaction(['saves', 'characters'], 'readwrite')` 一次寫 `SlotRecord { slot, seed, savedAt, bytes, data, summary, charId, format: 10 }` 與 `CharacterRecord`。

- [ ] **Step 1: 寫失敗測試（`startAutosave` 新介面）**

```ts
it('每 intervalMs 與 pagehide 呼叫 save；上一次沒寫完不會重入', async () => {
  vi.useFakeTimers();
  let release!: () => void; const save = vi.fn(() => new Promise<SlotMeta>((r) => { release = () => r(meta); }));
  const stop = startAutosave({ save, intervalMs: 1000 });
  vi.advanceTimersByTime(1000); expect(save).toHaveBeenCalledTimes(1);
  globalThis.dispatchEvent(new Event('pagehide')); expect(save).toHaveBeenCalledTimes(1); // busy
  release(); await vi.runOnlyPendingTimersAsync();
  globalThis.dispatchEvent(new Event('pagehide')); expect(save).toHaveBeenCalledTimes(2);
  stop(); vi.useRealTimers();
});
it('save 丟錯 → onError，之後還能再存', async () => { /* save 第一次 reject → onError 被叫一次；下一個 interval 再呼叫 save */ });
```

- [ ] **Step 2: 跑測試確認失敗**

Run：`npx vitest run src/scripts/games/delve/save/storage.test.ts`
Expected：FAIL（`save` 不是 `AutosaveOptions` 的欄位／`getBytes` 未提供）

- [ ] **Step 3: 實作 storage.ts 改動與 `idbSplitStore`**

`session.ts` 此時會編譯失敗（舊 `startAutosave` 呼叫）：本 task 先把 `session.ts:192-196` 機械改成 `save: () => saveNow().then(…)` 的等價寫法以保持可編譯，真正的拆分接線在 Task 8。

- [ ] **Step 4: 跑測試**

Run：`npx vitest run src/scripts/games/delve`
Expected：全部 PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(delve): add the characters store and a split-save IndexedDB adapter"
```

---

### Task 8: 標題畫面與 session 接線（繼續／新世界／匯入匯出／自動存檔）＋ e2e 遷移驗收

**Files:**
- Modify: `render/titleModel.ts:16-19`（`summarizeGame(g: SummarySource, nick?: string): SaveSummary`，有 `nick` 才加 key）、`:45-59`（`continueLines`：`summary.nick` 為非空字串時 `facts.unshift(nick)`，排在「等級」前）
- Modify: `render/session.ts`（見下方接線表）
- Test: `render/titleModel.test.ts`、`tests/e2e/delve.spec.ts`（新增一個 test）

**Interfaces:**
- Consumes: Task 6 `SplitSession`、`planContinue`、`saveSplit`、`commitMigration`、`BACKUP_SUFFIX`；Task 7 `idbSplitStore`、`startAutosave`；Task 3 `decodeAnySave`、`encodeWorld`；Task 4 `restoreSplit`。
- `session.ts` 接線（`SLOT = 'main'` 不變）：
  - 狀態：`let split: SplitSession | null`，`begin(game, s: SplitSession)` 設定它。
  - `saveNow()`：`saveSplit(idbSplitStore, SLOT, split, g, Date.now(), summarizeGame(g, split.nick))`。自動存檔：`startAutosave({ save: saveNow… })`。
  - `startFresh`：`begin(game, SplitSession.fresh(seed, Date.now()))`（D2）。
  - `continueGame`：`planContinue(idbSplitStore, SLOT)` → `none` 顯示「找不到存檔」；`error` 顯示 `message`、不開局；`legacy` → 現行 `openSave` 流程（gen + `restoreGame`），成功後 `commitMigration(…, { backup: true })` **完成之後**才 `begin(game, session)`；`split` → gen + `restoreSplit` → `begin(game, SplitSession.fromLoaded(world, character))`。
  - 匯入：`decodeAnySave`；`legacy` → 讀檔後 `commitMigration(…, { backup: false })`；`world` 且有 `header.character` → `restoreSplit(world, character)` 後 `SplitSession.fromLoaded` 再 `saveNow()`；`world` 沒有角色 → 「讀取失敗：這個存檔沒有角色資料。」
  - 匯出（遊戲中與標題）：`encodeWorld({ ...world, header: { ...world.header, character } })` → `exportBlob`（D4）；標題匯出遇到尚未遷移的舊記錄 → 原樣匯出 bytes（現行行為）。
  - `existingSlot()`／`newWorld` 的覆蓋確認不變。

- [ ] **Step 1: 寫失敗的單元測試（titleModel）**

```ts
it('摘要帶暱稱 → 第二行最前面是暱稱', () => {
  const l = continueLines({ seed: 'keepme', savedAt: 0, summary: summarizeGame(g, '旅人') }, 0);
  expect(l[1].startsWith('旅人 · 等級')).toBe(true);
});
it('沒給暱稱 → 摘要沒有 nick 欄位（舊測試的 toEqual 不受影響）', () => expect(summarizeGame(g)).not.toHaveProperty('nick'));
```

- [ ] **Step 2: 寫失敗的 e2e（`tests/e2e/delve.spec.ts`，`test.describe('delve')` 內）**

```ts
test('舊存檔（format 9、DB v1）自動遷移：角色 + 世界 + main.v9.bak，內容不變', async ({ page }) => {
  const legacy = [...readFileSync('src/scripts/games/delve/save/__fixtures__/format9.delve')];
  await page.goto('/');                                            // 同源、不會開 delve DB 的頁面
  await page.evaluate((bytes) => new Promise<void>((ok, bad) => {
    const req = indexedDB.open('delve', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('saves', { keyPath: 'slot' });
    req.onsuccess = () => { const db = req.result, t = db.transaction('saves', 'readwrite');
      t.objectStore('saves').put({ slot: 'main', seed: 'fixture-v9', savedAt: 1, bytes: bytes.length, data: new Uint8Array(bytes) });
      t.oncomplete = () => { db.close(); ok(); }; t.onerror = () => bad(t.error); };
  }), legacy);
  await page.goto('/games/delve'); await pressStart(page);
  await page.click('#delve-continue'); await waitGame(page);
  const g1 = await page.evaluate(() => { const g = window.__delveDebug!.game;
    return { seed: g.seed, sword: g.inventory.count('gold_sword'), torch: g.inventory.count('torch'), lv: g.levels.level,
      door: g.world.getFg(49, 58), coins: g.world.chests.get(58 * 200 + 56)![0] }; });
  expect(g1).toMatchObject({ seed: 'fixture-v9', sword: 1, door: 53 /* T.DOOR_CLOSED */, coins: { item: 'copper_coin', count: 37 } });
  const db = await page.evaluate(() => new Promise((ok) => { const r = indexedDB.open('delve');
    r.onsuccess = () => { const d = r.result, t = d.transaction(['saves', 'characters']);
      const bak = t.objectStore('saves').get('main.v9.bak'), main = t.objectStore('saves').get('main'), n = t.objectStore('characters').count();
      t.oncomplete = () => ok({ v: d.version, bak: [...bak.result.data], fmt: main.result.format, charId: main.result.charId, chars: n.result }); }; }));
  expect(db).toMatchObject({ v: 2, bak: legacy, fmt: 10, chars: 1 });
  // 再讀一次：走 split 路徑，內容一樣，標題顯示暱稱
  await page.evaluate(() => window.__delveDebug!.save());
  await page.goto('/games/delve'); await pressStart(page);
  await expect(page.locator('#delve-continue')).toContainText('旅人');
  await page.click('#delve-continue'); await waitGame(page);
  expect(await page.evaluate(() => { const g = window.__delveDebug!.game;
    return { seed: g.seed, sword: g.inventory.count('gold_sword'), torch: g.inventory.count('torch'), lv: g.levels.level }; }))
    .toEqual({ seed: g1.seed, sword: g1.sword, torch: g1.torch, lv: g1.lv });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run：`npx vitest run src/scripts/games/delve/render/titleModel.test.ts` → FAIL（`summarizeGame` 不收 nick）
Run：`npx playwright test tests/e2e/delve.spec.ts --project=chromium -g "自動遷移"` → FAIL（沒有 `main.v9.bak`／`characters`）

- [ ] **Step 4: 實作 titleModel 與 session 接線**

- [ ] **Step 5: 跑測試確認通過**

Run：`npx vitest run src/scripts/games/delve` → 全部 PASS
Run：`npx playwright test tests/e2e/delve.spec.ts --project=chromium` → 全部 PASS（含既有的「存檔 → 重新整理 → 繼續」與覆蓋確認測試）

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(delve): load and autosave the split character and world from the title screen"
```

---

## 完成驗收（全部 task 之後）

- [ ] `npx vitest run` 全套綠（`ffaLayout.test.ts` 逾時就單獨重跑該檔）。
- [ ] `npx playwright test tests/e2e/delve.spec.ts --project=chromium` 全綠。
- [ ] 手動：用 dev server 開 `http://localhost:4321/games/delve`，在 DevTools → Application → IndexedDB 確認 `delve` v2、`saves` 有 `main` 與 `main.v9.bak`、`characters` 有一筆；把 4321 連結附給擁有者（CLAUDE.md 雷 5），並說明先確認 4321 是不是本 worktree 起的。
- [ ] 派 fresh-context reviewer 對照規格 §5.1／§6 M-A 與本計畫 Review Focus 驗收（不自驗）。

## Self-Review 紀錄

- 規格覆蓋：`DelveCharacter` 欄位（Task 2）；世界 format 10 + `visits` + LRU 8 + spawnCore 每角色（Task 3/4）；世界保留 bosses/kills/peaceful/任務/好感度（Task 3 切分規則）；IDB `characters` + v2（Task 7）；遷移、`.v9.bak` 先寫、`restoreGame` 保留、`restoreSplit` 主路徑（Task 4/6/8）；固定 fixture 逐欄相等（Task 1/5）；角色與世界各自往返（Task 2/3/4）；同角色進別的世界（Task 4）；壞角色檔被拒且世界不受影響（Task 2/6）；e2e 綠（Task 8）；標題最小角色選擇（D3、Task 8）；自動存檔寫兩份（Task 6/7/8）。不含 M-B／網路。
- 型別一致：`CharIdentity`、`WorldIdentity`、`VisitMap`、`WorldData`、`SplitSession`、`SplitStore` 在 Task 2/3/6 定義、後續沿用同名。
- Review Focus 五項都已對應到 Task 2/3/4/6 的測試。
