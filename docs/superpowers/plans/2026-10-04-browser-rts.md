# 曦境戰紀 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans，主代理整合；獨立窄模組可在其他 worktree TDD 後交回。使用者已指示「直接開始」，計畫與可逆實作連續執行，不另要求啟動確認。

**Goal:** 在現有網站交付原創人類王國 3D RTS：完整科技樹、AI 對戰、兩圖與可商用模型。
**Architecture:** 純 TypeScript 固定步進模擬；玩家／AI 共用命令驗證；Three.js 僅顯示可见狀態。資產獨立製作、QA 與組裝審核。
**Tech Stack:** Astro 7、Three.js 0.182、TypeScript、Vitest 4、Playwright、Blender 5.2.1。
**Spec:** `docs/superpowers/specs/2026-10-04-browser-rts-design.md`

**2026-10-05 交付狀態：** Tasks 1–5 已實作並驗證；Task 6 的技術結果、原始證據與全站限制以 `docs/games/rts-progress.md` 為準。使用者對整體美術的接受仍待實際預覽。

## Global Constraints

- 原創人類王國、三階科技、七種可玩單位、兩張 96×96 地圖；保留 spec 全部驗收。
- 20 Hz 固定步進；30 分鐘有效時間終局；不依賴渲染 FPS；隨機具 seed。
- 一般單位人口預留、佇列取消退款、建築摧毀全損、英雄唯一與復活保留經驗。
- 不改其他遊戲、合約、既有字型；不 push、部署或合併。
- 正式視覺不可用佔位幾何冒充；候選模型的來源、動畫、LOD、近照與遊戲尺度 QA 各自驗證。

## Review Focus

1. 惡意／失效／重複命令不扣費或控制敵方；Task 2 測 rejected command 與 replay ID。
2. 工人死亡、工地中斷、礦枯竭仍能恢復；Task 2 測接續與重新選礦。
3. 建築佔地或隊形使橋被堵，不能穿牆；Task 1 測半徑、no-build 與可達性。
4. 迷霧不可洩漏敵人到 renderer、DOM 或 AI；Task 3 測 team view。
5. 暫停／切分頁／重開不得快轉或累積資源與監聽；Task 5 測 clock 與 dispose。

## Task 1：地圖與導航（獨立 worktree）

**Files:** `src/scripts/games/rts/maps.ts`, `navigation.ts`, `navigation.test.ts`。
**Interfaces:** `Vec2={x:number,z:number}`；`Footprint={x,z,width,depth}`；`RtsMap={id:'river'|'pass',name,width,height,blocked:Uint8Array,noBuild:Uint8Array,spawns:[Vec2,Vec2],resources:Array<Vec2 & {id:string,kind:'gold'|'wood',amount:number}>,camps:Vec2[]}`。所有格點採中心 x+0.5、z+0.5。
**Produces:** `createMap(id):RtsMap`、`findPath(map,start,goal,obstacles=[],radius=0.45):Vec2[]|null`、`isWalkable(map,p,obstacles=[],radius=0.45):boolean`、`canPlace(map,footprint,obstacles=[]):boolean`。findPath 含起終點，無路 null；canPlace 驗證地形、重疊、必經路與出生點／資源周邊可達。

- [x] RED：測 `findPath(createMap('river'),spawn0,spawn1)` 有路且每段可走；河上非橋點不可走；封閉目標 null；斜角不可切角；狹橋不可蓋。
- [x] 跑 `node node_modules/vitest/vitest.mjs run src/scripts/games/rts/navigation.test.ts`，確認因缺行為失敗。
- [x] 實作鏡像資源、河兩橋／隘口三路、格網 A*、半徑／動態矩形膨脹、放置 flood-fill。
- [x] 同命令 GREEN，回傳 commit 與實跑數，主代理抽驗地圖遮擋及效能。

```ts
const map = createMap('river');
expect(findPath(map, map.spawns[0], map.spawns[1])).not.toBeNull();
expect(canPlace(map, {x:48,z:28,width:6,depth:6})).toBe(false);
```

## Task 2：科技、命令與經濟（主代理）

**Files:** `types.ts`, `catalog.ts`, `state.ts`, `commands.ts`, `economy.ts`, `simulation.ts`, `economy.test.ts`。
**Consumes:** Task 1 地圖與導航；測試初期可使用完整通行的測試 RtsMap，正式模擬預設呼叫 createMap。
**Produces:** `createGame(mapId='river',seed=1):GameState`、`issueCommand(state,team,command):CommandResult`、`stepGame(state,dt=0.05):void`。命令 union 含 gather/build/train/research/upgrade/cancel/move/attack/stop/hold/learn/cast/surrender；結果 `{ok:true}|{ok:false,reason:string}`。team=0|1，neutral=-1；無效 command 不產生部分 mutation。state 以 entities、resources、teams、events、projectiles、visibility 表示。

- [x] RED：初始雙方 500金200木、5工人1主城、人口5/10；訓練立即扣50金預留人口、6秒後出生；不足資源及人口滿不扣費；工人真實搬運才入庫；施工需到達且工人存活；未達前置不能升階；重複研究拒絕；取消進行中按比例退，敵方摧毀不退但釋放人口。
- [x] 跑 `node node_modules/vitest/vitest.mjs run src/scripts/games/rts/economy.test.ts`，先確認紅燈，再實作獨立規則。
- [x] 完成上述測試與完整經濟至 III 階生產攻城車整合測試。
- [x] GREEN 後 commit；跑全套 baseline 差異核對，記入 ledger。

```ts
const s = createGame('river');
const hall = s.entities.find(e => e.team===0 && e.kind==='townhall')!;
expect(issueCommand(s,0,{type:'train',buildingId:hall.id,unit:'worker'})).toEqual({ok:true});
expect(s.teams[0].gold).toBe(450);
expect(s.teams[0].reservedSupply).toBe(1);
```

## Task 3：戰鬥、英雄、迷霧、AI（主代理）

**Files:** `combat.ts`, `visibility.ts`, `ai.ts`, `combat.test.ts`, `ai.test.ts`；擴充共用 types／simulation。
**Produces:** `stepCombat(state,dt)`, `updateVisibility(state)`, `getTeamView(state,team)`, `stepAI(state,team)`；AI 只經命令操作。

- [x] RED：不可見敵軍不能瞄準；遠程命中有飛行時間；同 tick 雙方最後建築死亡和局；英雄唯一、XP/點數/魔力/冷卻/範圍；營地回巢與一次獎勵；30分鐘和局與暫停不計時。
- [x] RED：AI 3分鐘內有採集、建造與軍隊；多 seed 不透支、不免費刷兵；自然升 III 階、進攻、回防；兩图完整自然通關。
- [x] 實作空間查詢、傷害事件、投射物 snapshot、技能、視野探索記憶、局勢驅動 AI；tests 用真實 step，不修改資源或結果取代完整通關。
- [x] `node node_modules/vitest/vitest.mjs run src/scripts/games/rts` GREEN 後 commit。

```ts
const s=createGame('river');
for(let i=0;i<3600;i++) stepGame(s);
expect(s.teams[1].stats.gatheredGold).toBeGreaterThan(0);
expect(s.entities.some(e=>e.team===1&&e.kind==='barracks')).toBe(true);
```

## Task 4：正式模型與 HUD 資產工廠

**Files:** `art-factory/rts/{contracts,manifests,runs,tools}/`、`public/assets/games/rts/`；source truth 為 spec 美術章節。
**Interface:** asset id 與 catalog kind 對應；GLB + `.blend` + animation clips（idle/walk/attack/hurt/death 及工作／技能）；registry 記錄來源、hash、QA、publish 狀態。

- [x] 先生成戰場 UI mockup、衛兵與主城概念稿；契約定義實際尺寸、角色視角與材質，保存原始來源。
- [x] 依本機條件選原創生成／建模來源；不用未取得權利的來源。Blender 本機清理、UV、PBR、骨架、動畫、LOD 與 GLB。
- [x] 試點多角度／遊戲尺度 QA 通過後擴充全部單位、三階主城、其他建築與兩地圖環境。
- [x] 機械驗證 metadata、bounds、法線、貼圖、骨架權重、片段及 glTF validator；組裝圖交付審核，拒絕資產不進 runtime。

## Task 5：可玩的網站整合

**Files:** `scene.ts`, `models.ts`, `input.ts`, `hud.ts`, `main.ts`, `clock.ts`, `clock.test.ts`, `src/pages/games/rts.astro`, `src/styles/_rts.scss`, `src/pages/games/index.astro`, `tests/e2e/games-rts.spec.ts`。
**Consumes:** GameState 只讀 view；所有操作透過 issueCommand，模型只使用 registry 中通過 QA 的資產。

- [x] RED：Playwright 進入選圖、選兩圖、載入後資源／人口可見、真實選工人採集／建造、訓練軍隊、命令／英雄技能／科技樹、暫停／投降／換圖；載入錯誤可重試。
- [x] RED：clock 暫停不累積、不一次補算背景時間；dispose 後事件不能再改 state。
- [x] 實作 3D 光影／材質、單位動畫、地圖、射線選取、框選、相機、快捷鍵、小地圖、HUD、音效與結算。
- [x] Chromium 實際操作並保存選圖／兩圖實戰／模型近照；重開三次確認不漏 listener／renderer。

## Task 6：完整交付驗證

- [x] 已跑全套 Vitest、production build 及 test:all 的兩個階段。全站 E2E 遇5個未修改模組的失敗後停止；具體結果記於執行紀錄，不宣稱全站全綠。
- [x] 兩圖玩家自然勝利／AI 自然勝利、迷霧不洩漏、80單位20建築性能量測。
- [x] fresh consultant 唯讀全差異 review，主流程 TDD 修正可信 findings。
- [ ] 使用者整體美術組裝審核：可點 preview、截圖、來源與 QA 已備妥；尚未收到使用者對最終商業美術品質的接受。
