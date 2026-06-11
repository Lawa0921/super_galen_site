# Dungeon Arcade 階段 4：方塊皮膚 + 道具玩法　實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。每任務 TDD：先寫測試→紅→實作→綠→全套零回歸→commit。
> Spec：`docs/superpowers/specs/2026-06-10-dungeon-arcade-phase4-skins-items-design.md`（先讀）。

**Goal:** 5 款等級解鎖方塊皮膚（PROFILE 皮膚櫃選擇、全模式套用）+ SOLO/vs-AI 道具玩法（開局選 1 充能技能 + SOLO 升級三選一 roguelite perk）。

**Architecture:** 皮膚＝純本地視覺（localStorage 選擇、`loadGameTextures(skinId)` 換貼圖、可選 per-skin 調色盤覆蓋 pieceTint），不進鎖步協定。道具＝引擎新增 default-inactive 方法（`setGravityScale`/`clearBottomRows`/`rerollQueue`/`addShield`，不動既有行為）+ `run.ts` 包裝層（能量/技能/perk，種子化 RNG）+ main/aiMain 接線。線上（1v1/FFA）路徑零觸碰。

**Tech Stack:** TypeScript、PixiJS v8、Vitest、Playwright、nanobanana-image-gen（素材）。

## 🔴 鐵則
1. **引擎既有行為不變**：新方法 default-inactive（scale=1、shield=0 時走原路徑）；全套既有測試零回歸是每個任務的硬性關卡。
2. **禁 `Math.random()`**：道具/perk 抽卡一律顯式種子化 RNG（`createRng`）。
3. 線上路徑（netMain/ffaNetMain/lockstep）**完全不接道具**；皮膚只在渲染層。
4. **技能發動鍵＝KeyV**（KeyC 已被 hold 佔用；對應任務需順手把 spec 的「按 C」改為「按 V」並 commit）。
5. 測試執行紀律：`timeout 90 npx vitest run <file> --testTimeout=8000 --no-file-parallelism`（防卡死）；e2e 用 `expect.poll` 去 flake。

## 檔案結構
- **render/skins.ts**（NEW）：`SKIN_CATALOG`、`isUnlocked`、`getSelectedSkin`/`setSelectedSkin`、`resolveSkin`、`setSkinTints` 注入。
- **render/assets.ts**（MOD）：`loadGameTextures(skinId?)`。
- **render/layout.ts**（MOD 最小）：`pieceTint` 查注入的皮膚調色盤覆蓋。
- **engine/items.ts**（NEW）＋ **engine/game.ts / match.ts**（MOD 最小）：道具操作。
- **engine/run.ts**（NEW）：`SoloRun`（能量/技能/perk 狀態機，純 TS 無 Pixi）。
- **render/ItemHud.ts**（NEW）：能量條 + 技能槽（Pixi）。
- **render/main.ts / aiMain.ts**（MOD）：技能選擇參數、能量接線、V 鍵、三選一（main 限定）。
- **src/pages/games/tetris.astro**（MOD）：皮膚櫃（PROFILE）、開局技能選擇步。
- **public/assets/games/tetris/skins/**、**icons/**（NEW 素材）。
- e2e：**tests/e2e/games-tetris-items.spec.ts**、**games-tetris-skins.spec.ts**（NEW）。

## 任務（依相依排序）

### T1 皮膚目錄與選擇邏輯（unit, deps:—）
`render/skins.ts`：
```ts
export interface SkinDef { id: string; name: string; unlockLevel: number; blockUrl: string; tints?: Partial<Record<PieceType, number>> }
export const SKIN_CATALOG: SkinDef[]  // neon(0,現有 block.webp)/bit8(2)/rune(4)/holo(6)/crystal(9)
export function isUnlocked(skin: SkinDef, level: number): boolean
export function getSelectedSkin(addr?: string|null): string   // localStorage key: tetris-skin:<addr|guest>；try-catch 回 'neon'
export function setSelectedSkin(id: string, addr?: string|null): void
export function resolveSkin(id: string, level: number): SkinDef // 未解鎖/未知 id → neon
```
測試（~10 例）：目錄 5 款且 neon unlockLevel=0；isUnlocked 邊界（=、<、>）；localStorage 往返與 key 隔離（guest vs addr）；隱私模式（mock throw）回退 neon；resolveSkin 未解鎖回退。
Commit：`feat(render): skin catalog + level-unlock + local selection (skins.ts)`

### T2 貼圖載入參數化＋調色盤覆蓋（unit, deps:T1）
- `assets.ts`：`loadGameTextures(skinId = 'neon')` → block URL 由 `SKIN_CATALOG` 查（其餘貼圖不變）；簽章向後相容（無參數＝現狀）。
- `layout.ts`：`let skinTints: Partial<Record<PieceType, number>> | null`＋`export function setSkinTints(t)`；`pieceTint(type)` 先查覆蓋表。
- 呼叫點（main/aiMain/netMain/ffaNetMain）：開局讀 `getSelectedSkin()`→`resolveSkin`→傳入 loadGameTextures + setSkinTints（netMain/ffaNetMain 只改這兩行，不碰協定）。
測試：URL 對映正確、預設不變、setSkinTints 覆蓋與清除。全套零回歸＋`npm run build` 綠。
Commit：`feat(render): skin-parameterized texture loading + per-skin tint override`

### T3 四款皮膚貼圖產製＋接入（asset, deps:T2）
- nanobanana 產 4 款**單格**貼圖（與 block.webp 同規格、可平鋪）：bit8/rune/holo/crystal；亮度→alpha 或滿版 normal blend 視風格；驗平鋪無縫（3x3 平鋪預覽圖自查）；catalog URL 接上 `public/assets/games/tetris/skins/*.webp`。
- bit8/crystal 附自帶 tints（NES 原色盤/寶石色盤），rune/holo 沿用預設染色。
- Playwright 截 4 款開局畫面自查觀感（盤面上至少 6 塊）；產出截圖到 `design-shots/skins-*.png` 供使用者驗收（提供 4321/4322 URL 看圖方式）。
Commit：`feat(assets): 4 block skins (8bit/rune/holo/crystal) tiled textures + palettes`

### T4 皮膚櫃 UI（ui+e2e, deps:T3）
- tetris.astro PROFILE 分頁內嵌 `#skin-rack`：5 卡（縮圖=皮膚貼圖 3x3 平鋪 div 背景）、使用中高亮、未解鎖灰階+鎖+「Lv N」、點選已解鎖→setSelectedSkin+即時標示；訪客顯示「連錢包升級解鎖」；等級從既有 profile 載入流程取（訪客=0）。
- 樣式進既有 SCSS 結構，禁 inline style/!important（thumbnail 背景圖 URL 用 CSS class per skin id）。
- e2e `games-tetris-skins.spec.ts`：訪客見 5 卡且只 neon 可選；點未解鎖無效；（mock 等級不易則驗 DOM 鎖定狀態與 CTA）。既有 menu/profile e2e 零回歸。
Commit：`feat(ui): skin rack in PROFILE tab (select/locked/guest CTA)`

### T5 引擎道具操作（unit, deps:—，可與 T1 平行）
- `game.ts` 新增（default-inactive）：`setGravityScale(s: number)`（gravity interval ÷ s；s=1 原行為；lock delay 不受影響）、`clearBottomRows(n)`（移除最底 n 行、上方下移；不發 lineClear 事件、不計分、發新事件 `{kind:'itemClear', rows:n}`）、`rerollQueue()`（active piece + next 佇列由內部 bag/rng 重生成，確定性）。
- `match.ts` 新增：`addShield(side, n)`＋`shield: Record<Side,number>`；process 傾倒垃圾前先消 shield（先進先抵），shield=0 走原路徑。
- `engine/items.ts`：薄封裝 `activateSkill(target: TetrisGame|TetrisMatch context, skill: SkillId, opts)`（炸彈行數可加成參數化，供 perk 用）。
測試（~15 例）：每方法前後狀態斷言；scale=1/shield=0 與原行為逐位一致（關鍵零回歸斷言：同 seed 同輸入跑 N 幀 getState JSON 相等）；rerollQueue 同 seed 確定性；clearBottomRows 不發 lineClear/分數不變；shield 抵銷順序。全套（含 1v1/FFA 既有測試）零回歸。
Commit：`feat(engine): default-inactive item ops (gravityScale/clearBottomRows/rerollQueue/shield)`

### T6 Run 層：能量/技能/perk（unit, deps:T5）
`engine/run.ts`（純 TS）：
```ts
export type SkillId = 'bomb'|'slow'|'reroll'|'shield'
export const SKILLS: Record<SkillId, {name:string; desc:string; aiOnly?:boolean}>
export class SoloRun {
  constructor(opts: { skill: SkillId|null; seed: number; mode: 'solo'|'ai' })
  onLineClear(count: number, combo: number, tSpin: boolean): void  // 能量表：10/25/45/70、combo+5/段、T-spin ×1.5、cap 100
  get energy(): number
  get energyRequired(): number        // 100，受「開局重抽」perk -20/層
  canActivate(): boolean
  activate(): SkillActivation|null    // 回傳要對引擎做的操作描述（含 bomb 行數=2+爆破擴大層數、slow 時長=10s+5s/層）
  onLevelUp(): PerkChoice[]|null      // solo 限定：從未滿級 perk 種子化抽 3（帶入技能相關 perk 僅在對應技能時入池）
  pickPerk(id: PerkId): void          // 疊加上限依 spec 表
  perkLevel(id: PerkId): number
  scoreMultiplier(): number           // 分數狂熱 1+0.25/層
}
```
測試（~18 例）：能量表全值（含 combo/T-spin/cap）；activate 歸零與 requirement perk；perk 抽 3 種子化（同 seed 同序列）、池過濾（無 bomb 不出爆破擴大；ai 模式不觸發 onLevelUp）、疊加上限、蓄勢待發即時+50、倖存者觸發條件。
Commit：`feat(engine): SoloRun — energy/skill/perk state machine (seeded, pure)`

### T7 遊戲內接線：技能選擇步＋HUD＋發動（ui, deps:T6,T2）
- tetris.astro：SOLO/AI 開局前插入「選擇技能」卡片步（bomb/slow/reroll＋AI 多 shield＋「不帶技能」）；選擇經 query/參數傳入 startTetris/startAi。
- `render/ItemHud.ts`：能量條（HOLD 下方垂直條）＋技能槽（圖示+`[V]`）＋滿能量發光；`render(energy, required, ready)`。
- main.ts/aiMain.ts：建 `SoloRun`；消費 lineClear 事件餵 onLineClear；KeyV → canActivate→activate→items.activateSkill 對引擎執行＋特效＋音效（新 SoundManager 方法 synth 即可）；分數顯示乘 scoreMultiplier（僅 SOLO 顯示層）。暫停/結算時 V 無效。
- 既有 e2e 零回歸（solo/ai/pause/result）。
Commit：`feat(game): skill pick step + energy HUD + V-key activation in solo/ai`

### T8 SOLO 三選一 perk UI（ui, deps:T7）
- main.ts：level up→`run.onLevelUp()` 有結果→暫停模擬、DOM 覆蓋層三卡（1/2/3 鍵或點選）→pickPerk→恢復。與 ESC 暫停互斥（perk 開啟時 ESC 無效，反之亦然）。reduced-motion 去動畫。
- e2e `games-tetris-items.spec.ts`：帶炸彈開局→`__tetrisDebug` 注能量/或硬降消行→V 發動→底行清除斷言；升級→三選一出現→選 1→繼續且 perkLevel 反映。
Commit：`feat(game): solo roguelite level-up perk picker (3-choice, seeded)`

### T9 道具素材＋特效（asset, deps:T7）
- nanobanana：技能圖示×4（透明霓虹、同 icons/ 風格）、能量條框/技能槽框、爆炸衝擊波/時緩粒子/重抽閃光/護盾符文素材（黑底 additive→alpha）。
- 接入 ItemHud 與發動特效（Effects 加對應方法）；Playwright 截「發動瞬間」對照 brainstorm mockup 自查。
Commit：`feat(assets): skill icons + item HUD frames + activation fx`

### T10 全套自測＋spec 修訂＋PR（manual+e2e, deps:T4,T8,T9）
- spec 「按 C」→「按 V」修訂 commit。
- 全套 vitest ＋ 全部 games e2e ＋ `npm run build` 三綠；4 款皮膚×帶技能開局手動走查（截圖供驗收）；清理 `public/brainstorm/`。
- PR（標題 `feat(games): block skins + item gameplay — Phase 4`，body 含驗收 URL 與測試數字）。
Commit/PR per 慣例。

## 測試計畫匯總
- unit：skins（10）/assets 參數化（5）/items 引擎（15）/run（18）≈ +48 例。
- e2e：skins spec（3-4）＋ items spec（3-4）＋既有全部零回歸。
- 手動：皮膚觀感、特效爽感、AI 帶護盾體感、平鋪接縫。

## 風險
- 貼圖平鋪接縫（T3 自查 3x3 預覽）；KeyV 與瀏覽器衝突低；三選一/ESC 遮罩互斥（T8 顯式測）；`loadGameTextures` 簽章相容（T2 預設參數）；localStorage 隱私模式（T1 try-catch）。
