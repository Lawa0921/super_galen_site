# WITCH RUN v2 玩法擴充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 落實 spec v2 四方向：彈幕語言大改版、十二響時限＋Boss 強化、道具＋中型機、遺物深化（15 種＋稀有度）。

**Architecture:** 全部建立在 v1 引擎介面上（80 tests 既有）。TDD：每個行為先寫測試。v1 計畫的程式碼風格與測試慣例為基準（同目錄 .test.ts、行為導向斷言、種子化 RNG）。

**Spec:** `docs/superpowers/specs/2026-06-11-witchrun-bullet-hell-design.md` §10–13

**測試指令:** `npx vitest run src/scripts/games/witchrun`（基線 80 全綠，任何任務不得破壞）

---

## Task F1: 子彈反彈/變速 + 新彈幕原語 + 敵人彈幕語言

**Files:** `engine/types.ts`、`engine/bullet.ts(+test)`、`engine/pattern.ts(+test)`、`engine/enemy.ts(+test)`、`engine/game.ts(+test 只改呼叫點)`

### F1.1 types.ts
- `EnemyBullet` 加 `bounces: number`（剩餘左右牆反射次數）
- `Enemy` 加 `beamAim?: number`（angel 預警鎖定角）與 `elite?: boolean`（F3 用，先加欄位）
- `WitchEvent` 加 `{ kind: 'telegraph'; x1: number; y1: number; x2: number; y2: number; durMs: number }`、`{ kind: 'eliteKill'; x: number; y: number }`、`{ kind: 'badEnd' }`
- `WitchState` 加 `drops: Drop[]`（F3 用，先加型別）：`export interface Drop { x: number; y: number; vy: number; kind: 'power' | 'bomb'; active: boolean; }`

### F1.2 bullet.ts
- `SpawnSpec` 加 `bounces?: number`；spawn 帶入（預設 0）
- `step(dtMs: number, speedMult = 1)`：位移與 turnRate/加速度全部乘 speedMult（=0 即凍結；turnRate 凍結時也不轉）
- step 內：x 出左右界且 `bounces > 0` → `vx = -vx; bounces--`，x 鉗回界內，不回收
- 行為測試：反射一次後第二次出界即回收；speedMult=0 完全凍結；speedMult=1.15 位移等比放大

### F1.3 pattern.ts 新原語（全部回傳 SpawnSpec[]）
```typescript
/** 同方向多發不同速彈鏈。 */
export function burst(o: { x: number; y: number; aim: number; speeds: number[]; kind: BulletKind }): SpawnSpec[]
/** 迴旋鏢：朝 aim 出發、反向加速度減速折返（ay = -decel 沿 aim 方向）。 */
export function boomerang(o: { x: number; y: number; aim: number; speed: number; decel: number; kind: BulletKind }): SpawnSpec[]
/** 慢速彈雲：以 angles[]（呼叫端用 rng 產生）放射極慢彈。 */
export function cloud(o: { x: number; y: number; angles: number[]; speed: number; kind: BulletKind }): SpawnSpec[]
/** 沿固定角度的高速彈柱（雷射感）：n 顆同向、速度由 vFrom 線性遞增到 vTo。 */
export function beamLine(o: { x: number; y: number; aim: number; n: number; vFrom: number; vTo: number; kind: BulletKind }): SpawnSpec[]
```
- boomerang 的加速度：`ax = -cos(aim)*decel, ay = -sin(aim)*decel`
- 行為測試：burst 各速；boomerang 速度向量隨時間反向（積分驗證）；beamLine 同角不同速；cloud 角度一致

### F1.4 enemy.ts 一敵一語言
- `EnemyDef.fire` 型態改為 `'burst3' | 'drift' | 'fan5' | 'spinRing' | 'boomerang' | 'bounce' | 'beam' | 'dustCloud' | 'waveRing'`，並加 `deathBurst?: boolean`（chime true）
- `stepEnemy(e, dtMs, target, rng: () => number)` 簽名加 rng；回傳型別改：
```typescript
export interface EnemyStepResult { spawns: SpawnSpec[]; telegraph?: { x1: number; y1: number; x2: number; y2: number; durMs: number }; }
```
- 各 fire 實作（speed 數值微調保持可讀彈幕，elite 開火間隔 ×0.6 在 F3 處理）：
  - `burst3`: `burst({ speeds: [160, 200, 240] })` 朝 aim
  - `drift`: aimed 慢彈（90），spawn 後加 `ax = (rng()-0.5)*60`
  - `fan5`: fan n=5 spread π/3 speed 110
  - `spinRing`: ring n=8 offset = `e.t / 900`（隨存活時間旋轉）
  - `boomerang`: 朝 aim、speed 260、decel 180、kind page
  - `bounce`: fan n=3 spread π/2 speed 150 kind gear、每顆 `bounces: 1`
  - `beam`: 兩段式——`e.beamAim` 為空：鎖定 aim、回傳 telegraph（x1,y1=自身，x2,y2=沿 aim 延伸 800px，durMs 700）、`fireCdMs = 700`；`e.beamAim` 已存在：`beamLine({ aim: e.beamAim, n: 8, vFrom: 320, vTo: 480 })`、清除 beamAim、fireCdMs = interval
  - `dustCloud`: `cloud({ angles: 10 個 rng()*2π, speed: 40, kind: 'wisp' })`
  - `waveRing`: ring n=8 speed 130 kind wave
- ENEMY_DEFS 對應更新（bat burst3 / wisp drift / fairy fan5 / tome spinRing / blade boomerang / gear bounce / angel beam / moth dustCloud / chime waveRing+deathBurst）
- 行為測試：每種 fire 至少一個（burst3 三發同向不同速；beam 第一次回 telegraph 不出彈、第二次出 8 顆同向；dustCloud 用固定 rng 可重現；deathBurst 旗標存在）
- **game.ts 呼叫點**：`stepEnemy(...)` 改解構 `{ spawns, telegraph }`；telegraph → push WitchEvent；`damageEnemy` 內敵人死亡且 def.deathBurst → 從死亡位置 spawn `ring({ n: 8, speed: 130, kind: 'wave' })`

Commit: `feat(witchrun): v2 彈幕語言——一敵一語言九種開火型態`

---

## Task F2: 全局十二響 + Boss 強化

**Files:** `engine/constants.ts`、`engine/game.ts(+test)`、`engine/boss.ts(+test)`

### F2.1 constants.ts 追加
```typescript
export const BELL_TOLL_INTERVAL_MS = 75_000;  // 全局亡鐘每響間隔
export const BELL_TOLL_MAX = 12;              // 敲滿即 Bad End
export const BELL_SURGE_MS = 5_000;           // 鐘響後彈速增幅持續
export const BELL_SURGE_MULT = 1.15;
export const BOSS_DASH_CD_MS = 6_000;
export const BOSS_DASH_DUR_MS = 600;
export const CANCEL_COIN_CAP = 40;            // 清彈轉星屑上限
```

### F2.2 game.ts 十二響
- 私有 `tollTimerMs`（init = BELL_TOLL_INTERVAL_MS）、`tollCount = 0`、`surgeMs = 0`、`freezeMs = 0`（F4 時停用，先加）
- step 中遞減：tollTimer 到 0 → `tollCount++`、`surgeMs = BELL_SURGE_MS`、事件 `bellToll`（count = tollCount）、重置 timer；tollCount 達 12 → 事件 `badEnd` + `gameover`（status）
- `enemyBullets.step(dtMs, speedMult)`：`speedMult = freezeMs > 0 ? 0 : surgeMs > 0 ? BELL_SURGE_MULT : 1`
- `WitchState.bellTolls` 改回傳全局 `tollCount`（deadbell 鐘波計數不再對外）
- draft 期間（status==='draft'）鐘響計時**暫停**（選遺物不該吃時間壓力）——計時只在 status==='playing' 的 step 內走，天然成立
- continueRun **不重置**鐘響（時限是整局的，續關不洗白；測試固定此行為）
- 測試：75 秒觸發鐘響事件與 surge；surge 期間彈速放大（用一顆已知彈位移驗證）；12 響 → badEnd + gameover；continueRun 後 tollCount 保留

### F2.3 boss.ts 強化
- `BossRunner.step` 加衝刺：私有 `dashCdMs`（init 6000）、`dashMs = 0`、`dashFromX/dashToX`；dashCd 到 0 → 鎖定 `target.px`（鉗在 [80, FIELD_W-80]）、`dashMs = BOSS_DASH_DUR_MS`；dash 中 x 以 easeOut lerp，dash 結束恢復正常漂移（漂移基準改成 dash 終點：`this.def = {...}` 不可變——改為私有 `homeX`，init = def.x，dash 後更新 homeX = dashToX，漂移 = `homeX + sin(...)*70` 並鉗制在界內）
- `damage()` 切 phase 時回傳值已有 true；新增公開 getter `pendingSummon: boolean`——phase 切換時設 true，game.ts 讀取後呼叫 `consumeSummon()` 清掉
- game.ts：bossPhase 事件處理處——`consumeSummon()` → 從本關 STAGES squad 敵種挑 2 隻 spawn（x = 0.3/0.7 * FIELD_W, y = -20, path 'sine'）；**清彈轉星屑**：phase 切換與 onBossDefeated 時，把場上 active 敵彈前 CANCEL_COIN_CAP 顆的位置轉成金幣再 clearAll
- 測試：dash 後 boss.x 接近目標 x；phase 切換 pendingSummon=true；game 整合——phase 切換後 enemies +2、金幣數 = min(原彈數, 40)

Commit: `feat(witchrun): v2 全局十二響時限與 Boss 衝刺/召喚/清彈轉星屑`

---

## Task F3: 道具 Drop + 中型機 elite

**Files:** `engine/constants.ts`、`engine/stage.ts(+test)`、`engine/enemy.ts(+test)`、`engine/game.ts(+test)`

### F3.1 constants.ts 追加
```typescript
export const POWER_DROP_EVERY = 7;     // 每擊破 7 隻掉 P
export const DROP_FALL_SPEED = 70;
export const ELITE_HP_MULT = 10;
export const ELITE_FIRE_CD_MULT = 0.6;
```
- 移除 `POWER_COINS`（金幣回歸純計分）——game.ts stepCoins 刪掉升火力邏輯

### F3.2 stage.ts
- `WaveEntry` 加 `elite?: true`；每關 ~50 秒處插入一隻該關代表敵兵 elite（S1 fairy / S2 tome / S3 gear / S4 chime，x 0.5、path 'hover'）
- `StageSpawn` 透傳 elite
- 測試：每關恰一筆 elite、時間在 45–60 秒間

### F3.3 enemy.ts
- `makeEnemy(id, kind, x, y, path, elite = false)`：elite 時 `hp ×ELITE_HP_MULT`、`e.elite = true`
- `stepEnemy` 開火間隔：elite 用 `d.fireIntervalMs * ELITE_FIRE_CD_MULT`
- 測試：elite hp 與開火間隔

### F3.4 game.ts
- 私有 `drops: Drop[] = []`、`killCount = 0`
- `damageEnemy` 擊殺：`killCount++`；`killCount % POWER_DROP_EVERY === 0` → push P drop；e.elite → 額外 5 金幣 + P + B drop、事件 `eliteKill`、強震屏由渲染層處理
- `onBossDefeated` → push B drop（出現在 boss 位置）
- 新私有 `stepDrops(dtMs)`（仿 stepCoins）：下落、出界回收、拾取（半徑同金幣含磁石）→ power: `gainPower`；bomb: `bombs = min(BOMB_CAP, +1)`；事件沿用 `coin`？不——加事件 `{ kind: 'drop'; drop: 'power' | 'bomb' }`（types.ts 補）
- `getState()` 暴露 `drops`；continueRun 清空 drops 與 killCount 不重置（killCount 保留無妨，重置亦可——**定為清空**，與清場一致）
- 測試：第 7 殺掉 P；拾取 P 升火力；elite 擊破掉落組合與事件；continueRun 清空 drops

Commit: `feat(witchrun): v2 道具掉落（P/B）與每關中型機 elite`

---

## Task F4: 遺物深化（15 種 + 稀有度）

**Files:** `engine/types.ts`、`engine/relics.ts(+test)`、`engine/game.ts(+test)`

### F4.1 types.ts
- `RelicId` 加 `'pierce' | 'homing' | 'chronos' | 'pendulum' | 'starshard' | 'bloodmoon'`
- `RelicDef` 加 `rarity: 'common' | 'rare'`
- `Modifiers` 加：`pierce: boolean; homingFamiliar: boolean; freezeOnOverdrive: boolean; infernoInvulnBonus: number; grazeCoinEvery: number; critChance: number;`
- `PlayerBullet` 加 `pierceLeft: number`（spawn 時 = mod.pierce ? 1 : 0）

### F4.2 relics.ts
- 9 既有 relic 加 `rarity: 'common'`；6 新 relic `rarity: 'rare'`：
  - pierce 貫通魔彈：彈可穿透 1 個敵人
  - homing 追蹤使魔：使魔彈自動瞄準最近敵人（無使魔時同時給予使魔效果：`m.familiar = true; m.homingFamiliar = true`）
  - chronos 時停懷錶：OVERDRIVE 引爆時全場敵彈凍結 1.5 秒
  - pendulum 鐘擺護符：爆炎無敵 +1200ms
  - starshard 星之碎片：每 5 次擦彈噴 1 金幣（grazeCoinEvery = 5）
  - bloodmoon 血月之眼：critChance = 0.1
- `draftRelics(rng, owned)` 改稀有度抽選：每 slot 先 roll `rng() < 0.25` 決定 rare/common 池，該池抽完則 fallback 另一池；維持「不重複、排除已持有、最多 3 個」
- BASE_MODIFIERS 補新欄位預設
- 測試：15 種 id 唯一、rarity 標記正確；computeModifiers 新欄位逐一；draftRelics 在 rng 固定下可重現且無重複；rare 池抽空 fallback

### F4.3 game.ts 整合
- **pierce**：`resolvePlayerHits` 命中敵人時 `pierceLeft > 0` → `pierceLeft--`、不設 `active = false`（Boss 不可穿透——命中 Boss 仍回收）
- **homing**：autoFire 的 familiar 彈改為瞄準最近 alive 敵人（無敵人時照舊直射）
- **chronos**：useOverdrive 成功時 `freezeMs = 1500`（F2 已建立 freezeMs → speedMult 0）
- **pendulum**：useInferno 的無敵 = `INFERNO_INVULN_MS + mod.infernoInvulnBonus`
- **starshard**：累積擦彈計數，每滿 grazeCoinEvery 在自機位置 spawn 1 金幣
- **bloodmoon**：damageEnemy / boss damage 前 `rng() < critChance` → 傷害 ×2
- 測試：pierce 穿一過二、homing 有目標時方向朝目標、chronos 凍結、pendulum 無敵時長、starshard 噴幣、crit 用固定 seed 驗證期望傷害

Commit: `feat(witchrun): v2 遺物深化——15 種＋稀有度與六個 rare 效果`

---

## Task F5: 渲染/HUD/頁面/音效整合

**Files:** `render/EntityView.ts`、`render/HudView.ts`、`render/BulletView.ts`（不變則略）、`render/main.ts`、`render/assets.ts`、`audio/SoundManager.ts`、`src/pages/games/witchrun.astro`

- **telegraph 預警線**：main.ts 收到 `telegraph` 事件 → fxLayer 加一條 Graphics 線（白→透明、durMs 漸隱、線寬 3、色 0xfff0c0），到時自動 destroy（用簡單陣列管理 + tick 內衰減）
- **drops**：assets.ts 加 `dropPower`/`dropBomb` 紋理（程式產生：圓底 + 'P'（緋紅）/'B'（橙）Text 轉紋理，nearest）；EntityView 仿金幣池渲染 `s.drops`
- **elite**：EntityView 敵兵 sprite——`e.elite` 時 `scale.set(1.6)` 並 tint 微紅 0xffd0d0
- **HUD**：加 `🔔 n/12` 鐘響計數（字型同 HUD，色 0xffd23f，放分數下方）；rare 遺物卡金框——witchrun.astro 加 `.relic-card--rare` 樣式（金色邊框+光暈），main.ts showDraft 依 `RELICS[id].rarity` toggle class
- **Bad End**：witchrun.astro gameover overlay 標題文字由 main.ts 依事件改寫——`badEnd` 時 heading 顯示 `THE BELL TOLLS TWELVE`（DOM id `witch-over-heading` 加上）
- **音效**：SoundManager 加 `toll()`（低沉鐘聲：sine 196Hz 1.2s + 392Hz 衰減）、`drop()`（拾取道具上行三音）；main.ts 事件對應（全局 bellToll → toll + 震屏 6；eliteKill → 震屏 12 + kill 強化；badEnd → gameover 音 + toll）
- **手動驗收**：`?autostart=1` 走完第 1 關（elite 出現、telegraph 線、掉落拾取、鐘響 HUD）
- E2E：`tests/e2e/witchrun.spec.ts` 不需改（流程不變）；跑一次確認無回歸

Commit: `feat(witchrun): v2 前端整合——預警線/道具/elite/鐘響 HUD/rare 金框/Bad End`

---

## Task F6: 收尾

1. `npx vitest run src/scripts/games/witchrun` 全綠（預估 110+ tests）
2. `npm run test` 全站無回歸
3. `npx playwright test tests/e2e/witchrun.spec.ts` 全綠
4. `npm run build` 成功
5. 手動完整遊玩一輪驗收（瀏覽器）
6. 效能抽查：S3 Boss 最終 phase + surge 期間穩 60fps
7. push + PR（涵蓋 v1 + v2）

---

## Self-Review

- spec §10 九種 fire ↔ F1.4 逐一對應；bounces/telegraph ↔ F1.1/F1.2 ✓
- spec §11 75s/12 響/surge ×1.15/Bad End/dash/summon/cancel 轉幣 ↔ F2 ✓（補充決策：draft 暫停計時、續關不重置）
- spec §12 P 每 7 殺/B 來源/elite ×10 ×0.6 ×1.6 ↔ F3 ✓（POWER_COINS 移除）
- spec §13 六 rare + 25% 抽選 + Modifiers 六欄位 ↔ F4 ✓
- 型別一致性：Drop/EnemyStepResult/pierceLeft 等新介面只在本計畫定義一次，後續 task 引用同名 ✓
