# WITCH RUN（像素縱向彈幕射擊）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/games/witchrun` 上線 Dungeon Arcade 第三款遊戲：Mira 主演的縱向捲軸彈幕射擊，含擦彈超載與層間遺物系統。

**Architecture:** 完全沿用 bomber 模式——純 TS 引擎（`engine/`，每模組配 `.test.ts`，TDD、可離線測試、種子化 RNG）＋ PixiJS 渲染層（`render/`）＋鍵盤/觸控輸入（`input/`）＋ Web Audio 合成音效（`audio/`）。引擎以 `step(dtMs)` 推進、`drainEvents()` 吐事件給渲染層消費。座標系：邏輯場域 480×640（直式），單位 px、浮點連續座標（非格子制）。

**Tech Stack:** TypeScript、Vitest（`npm run test`，happy-dom）、PixiJS（既有依賴，含 ParticleContainer）、Astro 頁面殼、Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-06-11-witchrun-bullet-hell-design.md`

---

## File Structure

```
src/scripts/games/witchrun/
├── engine/
│   ├── types.ts        # 全部共用型別（先寫，無測試）
│   ├── constants.ts    # 場域/速度/判定/超載/計分常數
│   ├── rng.ts          # mulberry32（自 bomber 複製，含測試）
│   ├── player.ts       # 移動鉗制、低速模式、被彈、無敵幀
│   ├── bullet.ts       # 子彈池 + 運動積分（vx/vy/加速度/轉向率）
│   ├── collision.ts    # 圓對圓、雙半徑（被彈/擦彈）判定
│   ├── graze.ts        # OVERDRIVE 槽：累積/引爆/計時/被彈清空
│   ├── pattern.ts      # 彈幕產生器：ring/fan/aimed/spiral/bellWave
│   ├── relics.ts       # 9 種遺物定義、三選一抽選、效果聚合
│   ├── scoring.ts      # 擊破分、金幣、擦彈連鎖倍率
│   ├── enemy.ts        # 道中敵：路徑模型 + 射擊節奏
│   ├── boss.ts         # Boss 階段機（血量閾值切 phase + 彈幕時間軸）
│   ├── stage.ts        # 關卡腳本：4 關波次時間軸資料 + StageRunner
│   └── game.ts         # WitchGame 總狀態機（playing/draft/gameover/cleared）
├── render/
│   ├── PixiStage.ts    # 圖層包裝（自 bomber 複製改層名）
│   ├── assets.ts       # 紋理載入（v1 先程式產生佔位紋理）
│   ├── BackgroundView.ts # 直式無縫捲動背景
│   ├── BulletView.ts   # ParticleContainer 子彈渲染（池對應）
│   ├── EntityView.ts   # 自機/敵機/Boss/特效
│   ├── HudView.ts      # 超載槽/殘機/爆炎/分數/Boss 血條
│   └── main.ts         # startWitchrun(canvas)：掛載、輸入、事件→音效特效
├── input/
│   ├── keymap.ts       # KeyboardEvent.code -> InputAction
│   └── touch.ts        # 拖曳相對移動 + 雙指低速 + 畫面按鈕
└── audio/
    └── SoundManager.ts # Web Audio 合成 SFX

src/pages/games/witchrun.astro   # 頁面殼：標題畫面、遺物三選一 DOM、gameover overlay
src/pages/games/index.astro      # 第三張 COMING SOON 卡換成 WITCH RUN（Modify）
tests/e2e/witchrun.spec.ts       # Playwright E2E
public/assets/games/witchrun/    # 產圖素材（後期任務）
```

**測試指令**：單一檔案 `npx vitest run src/scripts/games/witchrun/engine/<file>.test.ts`；全部 `npm run test`。

**Commit 規範**：Conventional Commits，每則訊息末尾加 `Co-Authored-By: Claude <noreply@anthropic.com>`（以下 commit 步驟省略此行，實作時必加）。

---

### Task 1: 型別、常數、RNG

**Files:**
- Create: `src/scripts/games/witchrun/engine/types.ts`
- Create: `src/scripts/games/witchrun/engine/constants.ts`
- Create: `src/scripts/games/witchrun/engine/rng.ts`
- Test: `src/scripts/games/witchrun/engine/rng.test.ts`

- [ ] **Step 1: 寫 types.ts（純型別，無測試）**

```typescript
// types.ts
export interface Vec { x: number; y: number; }

/** 敵彈外觀種類（渲染層挑紋理用；判定半徑見 constants.BULLET_R） */
export type BulletKind = 'rune' | 'wave' | 'page' | 'gear' | 'wisp' | 'bell';

export interface EnemyBullet {
  x: number; y: number;
  vx: number; vy: number;          // px/s
  ax: number; ay: number;          // px/s^2
  turnRate: number;                // rad/s，旋轉速度向量（螺旋彈用）
  kind: BulletKind;
  r: number;                       // 被彈判定半徑
  grazed: boolean;                 // 每顆只計一次擦彈
  active: boolean;
}

export interface PlayerBullet {
  x: number; y: number; vx: number; vy: number;
  dmg: number; active: boolean;
}

export type StageId = 1 | 2 | 3 | 4;

export type EnemyKind =
  | 'bat' | 'wisp' | 'fairy'        // S1 墓園
  | 'tome' | 'blade'                // S2 藏書螺旋
  | 'gear' | 'angel'                // S3 鐘匠工坊
  | 'moth' | 'chime';               // S4 鐘樓頂

/** 道中敵路徑模型 */
export type PathKind = 'descend' | 'sine' | 'swoopL' | 'swoopR' | 'hover';

export interface Enemy {
  id: number; kind: EnemyKind;
  x: number; y: number;
  hp: number; alive: boolean;
  path: PathKind; t: number;        // t = 出生後累計 ms
  baseX: number;                    // sine/hover 的錨點
  fireCdMs: number;                 // 下次開火倒數
}

export type BossId = 'gargoyle' | 'grimoire' | 'bellwright' | 'deadbell';

export type RelicId =
  | 'split'      // 裂變魔彈
  | 'familiar'   // 影子使魔
  | 'magnet'     // 貪婪磁石
  | 'moonlight'  // 月光護符
  | 'feather'    // 咒速羽毛
  | 'catalyst'   // 爆炎觸媒
  | 'echo'       // 回音鈴
  | 'pact'       // 血色契約
  | 'stardust';  // 星屑掃帚

export interface RelicDef { id: RelicId; name: string; desc: string; }

/** 遺物效果聚合後的修正值（engine 各處讀這個，不各自查遺物） */
export interface Modifiers {
  splitShot: boolean;        // 命中後分裂
  familiar: boolean;         // 僚機 50% 攻擊
  magnet: boolean;           // 吸金範圍擴大
  speedMult: number;         // 移速倍率
  hitboxMult: number;        // 被彈判定倍率（<1 縮小）
  fireField: boolean;        // 爆炎留火場
  overdriveDurMult: number;  // OVERDRIVE 時長倍率
  atkMult: number;           // 攻擊倍率
  lifeCapDelta: number;      // 殘機上限增減
  focusGrazeBonus: number;   // 低速模式擦彈累積加成（0.3 = +30%）
}

export interface Coin { x: number; y: number; vy: number; active: boolean; }

export interface PlayerState {
  x: number; y: number;
  lives: number; bombs: number;
  power: number;                    // 火力等級 1..4
  focus: boolean;
  invulnMs: number;
  fireCdMs: number;
  alive: boolean;
}

export type GameStatus = 'title' | 'playing' | 'draft' | 'gameover' | 'cleared';

export interface BossState {
  id: BossId; x: number; y: number;
  hp: number; maxHp: number; phase: number; alive: boolean;
}

export interface WitchState {
  status: GameStatus;
  stage: StageId;
  player: PlayerState;
  playerBullets: PlayerBullet[];
  enemyBullets: EnemyBullet[];
  enemies: Enemy[];
  coins: Coin[];
  boss: BossState | null;
  score: number;
  grazeChain: number;               // 擦彈連鎖（被彈歸零）
  overdrive: { gauge: number; activeMs: number };  // gauge 0..100
  relics: RelicId[];
  draftChoices: RelicId[];          // status==='draft' 時的三選一
  bellTolls: number;                // 亡鐘已敲響數（敘事 HUD 用）
}

export type WitchEvent =
  | { kind: 'shoot' }
  | { kind: 'graze'; x: number; y: number }
  | { kind: 'overdrive' }                       // 引爆
  | { kind: 'inferno' }                         // 爆炎術
  | { kind: 'enemyKill'; x: number; y: number }
  | { kind: 'playerHit' }
  | { kind: 'coin' }
  | { kind: 'bossSpawn'; id: BossId }
  | { kind: 'bossPhase'; id: BossId; phase: number }
  | { kind: 'bossDefeat'; id: BossId }
  | { kind: 'bellToll'; count: number }         // 亡鐘鐘波
  | { kind: 'draftOpen'; choices: RelicId[] }
  | { kind: 'relicPicked'; id: RelicId }
  | { kind: 'stageStart'; stage: StageId }
  | { kind: 'gameover' }
  | { kind: 'cleared' };

export type InputAction = 'up' | 'down' | 'left' | 'right' | 'focus' | 'bomb' | 'overdrive';
```

- [ ] **Step 2: 寫 constants.ts**

```typescript
// constants.ts
/** 邏輯場域（直式 3:4）。渲染層等比縮放置中。 */
export const FIELD_W = 480;
export const FIELD_H = 640;

/** 自機。 */
export const PLAYER_SPEED = 240;        // px/s
export const FOCUS_SPEED = 120;         // 低速模式 px/s
export const PLAYER_HIT_R = 3;          // 被彈判定半徑
export const GRAZE_R = 18;              // 擦彈判定半徑
export const PLAYER_SPAWN = { x: 240, y: 560 } as const;
export const START_LIVES = 3;
export const LIFE_CAP = 5;
export const START_BOMBS = 3;
export const BOMB_CAP = 5;
export const INVULN_MS = 2000;
export const HIT_CLEAR_R = 160;         // 被彈後自動小清屏半徑（防連死）

/** 自機火力：power 1..4；每級子彈道數。 */
export const POWER_MAX = 4;
export const FIRE_INTERVAL_MS = 100;
export const PLAYER_BULLET_SPEED = 720;
export const PLAYER_BULLET_DMG = 1;

/** 子彈池上限。 */
export const MAX_ENEMY_BULLETS = 600;
export const MAX_PLAYER_BULLETS = 96;
export const BULLET_CULL_MARGIN = 32;   // 出界 margin 後回收

/** OVERDRIVE。 */
export const OVERDRIVE_MAX = 100;
export const GRAZE_GAIN = 2.5;          // 每次擦彈 +2.5
export const OVERDRIVE_DURATION_MS = 3000;

/** 爆炎術。 */
export const INFERNO_INVULN_MS = 1200;  // 放爆炎附帶短無敵
export const INFERNO_DMG = 30;          // 對全場敵人傷害

/** 敵彈判定半徑（依外觀種類）。 */
export const BULLET_R: Record<'rune' | 'wave' | 'page' | 'gear' | 'wisp' | 'bell', number> =
  { rune: 4, wave: 6, page: 5, gear: 7, wisp: 4, bell: 6 };
```

- [ ] **Step 3: 寫 rng 失敗測試**

```typescript
// rng.test.ts
import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('同 seed 產生相同序列', () => {
    const a = createRng(42), b = createRng(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
  it('值域在 [0,1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
```

- [ ] **Step 4: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/rng.test.ts`
Expected: FAIL（找不到 `./rng`）

- [ ] **Step 5: 寫 rng.ts（與 bomber 相同實作）**

```typescript
/** mulberry32：32-bit 確定性 PRNG。帶 seed 可完全重現，方便測試。 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/rng.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 7: Commit**

```bash
git add src/scripts/games/witchrun/engine/{types,constants,rng}.ts src/scripts/games/witchrun/engine/rng.test.ts
git commit -m "feat(witchrun): engine 型別、常數與種子化 RNG"
```

---

### Task 2: player.ts — 移動、低速、被彈

**Files:**
- Create: `src/scripts/games/witchrun/engine/player.ts`
- Test: `src/scripts/games/witchrun/engine/player.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// player.test.ts
import { describe, it, expect } from 'vitest';
import { makePlayer, movePlayer, hitPlayer, tickPlayer } from './player';
import { FIELD_W, PLAYER_SPEED, FOCUS_SPEED, INVULN_MS, PLAYER_SPAWN } from './constants';

describe('player', () => {
  it('makePlayer 以出生點與預設資源初始化', () => {
    const p = makePlayer();
    expect(p.x).toBe(PLAYER_SPAWN.x);
    expect(p.lives).toBe(3);
    expect(p.bombs).toBe(3);
    expect(p.power).toBe(1);
    expect(p.alive).toBe(true);
  });

  it('movePlayer 依方向與 dt 位移（一般速度）', () => {
    const p = makePlayer();
    const x0 = p.x;
    movePlayer(p, { dx: 1, dy: 0 }, 1000, 1); // 1 秒、移速倍率 1
    expect(p.x).toBeCloseTo(Math.min(x0 + PLAYER_SPEED, FIELD_W)); // 會被鉗在場內
  });

  it('低速模式速度減半', () => {
    const p = makePlayer();
    p.focus = true;
    const x0 = p.x;
    movePlayer(p, { dx: -1, dy: 0 }, 100, 1);
    expect(x0 - p.x).toBeCloseTo(FOCUS_SPEED * 0.1, 1);
  });

  it('斜向移動做向量正規化（不會 1.414 倍速）', () => {
    const p = makePlayer();
    const x0 = p.x, y0 = p.y;
    movePlayer(p, { dx: 1, dy: 1 }, 100, 1);
    const dist = Math.hypot(p.x - x0, p.y - y0);
    expect(dist).toBeCloseTo(PLAYER_SPEED * 0.1, 1);
  });

  it('位置鉗制在場域內', () => {
    const p = makePlayer();
    p.x = 2; p.y = 2;
    movePlayer(p, { dx: -1, dy: -1 }, 5000, 1);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });

  it('hitPlayer 扣命、降火力、給無敵、回到出生點', () => {
    const p = makePlayer();
    p.power = 3; p.x = 100; p.y = 100;
    hitPlayer(p);
    expect(p.lives).toBe(2);
    expect(p.power).toBe(2);
    expect(p.invulnMs).toBe(INVULN_MS);
    expect(p.x).toBe(PLAYER_SPAWN.x);
  });

  it('火力最低 1，命歸零時 alive=false', () => {
    const p = makePlayer();
    p.power = 1; p.lives = 1;
    hitPlayer(p);
    expect(p.power).toBe(1);
    expect(p.lives).toBe(0);
    expect(p.alive).toBe(false);
  });

  it('無敵期間 hitPlayer 不扣命', () => {
    const p = makePlayer();
    hitPlayer(p);
    const lives = p.lives;
    hitPlayer(p);
    expect(p.lives).toBe(lives);
  });

  it('tickPlayer 遞減無敵與開火冷卻', () => {
    const p = makePlayer();
    p.invulnMs = 500; p.fireCdMs = 80;
    tickPlayer(p, 100);
    expect(p.invulnMs).toBe(400);
    expect(p.fireCdMs).toBe(0); // 不為負
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/player.test.ts`
Expected: FAIL（找不到 `./player`）

- [ ] **Step 3: 寫實作**

```typescript
// player.ts
import type { PlayerState } from './types';
import {
  FIELD_W, FIELD_H, PLAYER_SPEED, FOCUS_SPEED, PLAYER_SPAWN,
  START_LIVES, START_BOMBS, INVULN_MS, POWER_MAX,
} from './constants';

export function makePlayer(): PlayerState {
  return {
    x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y,
    lives: START_LIVES, bombs: START_BOMBS,
    power: 1, focus: false, invulnMs: 0, fireCdMs: 0, alive: true,
  };
}

/** dx/dy ∈ {-1,0,1}；speedMult 來自遺物（咒速羽毛）。 */
export function movePlayer(p: PlayerState, dir: { dx: number; dy: number }, dtMs: number, speedMult: number): void {
  let { dx, dy } = dir;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  dx /= len; dy /= len;
  const speed = (p.focus ? FOCUS_SPEED : PLAYER_SPEED) * speedMult;
  p.x = Math.min(FIELD_W, Math.max(0, p.x + dx * speed * (dtMs / 1000)));
  p.y = Math.min(FIELD_H, Math.max(0, p.y + dy * speed * (dtMs / 1000)));
}

/** 被彈：無敵中無效；扣命降火力、回出生點、給無敵；命盡 alive=false。 */
export function hitPlayer(p: PlayerState): void {
  if (p.invulnMs > 0 || !p.alive) return;
  p.lives -= 1;
  p.power = Math.max(1, p.power - 1);
  p.invulnMs = INVULN_MS;
  p.x = PLAYER_SPAWN.x; p.y = PLAYER_SPAWN.y;
  if (p.lives <= 0) { p.lives = 0; p.alive = false; }
}

export function tickPlayer(p: PlayerState, dtMs: number): void {
  p.invulnMs = Math.max(0, p.invulnMs - dtMs);
  p.fireCdMs = Math.max(0, p.fireCdMs - dtMs);
}

export function gainPower(p: PlayerState): void {
  p.power = Math.min(POWER_MAX, p.power + 1);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/player.test.ts`
Expected: PASS（9 tests）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/witchrun/engine/player.ts src/scripts/games/witchrun/engine/player.test.ts
git commit -m "feat(witchrun): 自機移動/低速/被彈/無敵（TDD）"
```

---

### Task 3: bullet.ts — 子彈池與運動積分

**Files:**
- Create: `src/scripts/games/witchrun/engine/bullet.ts`
- Test: `src/scripts/games/witchrun/engine/bullet.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// bullet.test.ts
import { describe, it, expect } from 'vitest';
import { BulletPool } from './bullet';
import { MAX_ENEMY_BULLETS } from './constants';

describe('BulletPool', () => {
  it('spawn 啟用一顆子彈並設定屬性', () => {
    const pool = new BulletPool(8);
    const b = pool.spawn({ x: 10, y: 20, vx: 0, vy: 100, kind: 'rune' });
    expect(b).not.toBeNull();
    expect(b!.active).toBe(true);
    expect(b!.r).toBeGreaterThan(0); // 依 kind 帶入判定半徑
    expect(pool.countActive()).toBe(1);
  });

  it('池滿時 spawn 回傳 null（不擴池）', () => {
    const pool = new BulletPool(2);
    pool.spawn({ x: 0, y: 0, vx: 0, vy: 1, kind: 'rune' });
    pool.spawn({ x: 0, y: 0, vx: 0, vy: 1, kind: 'rune' });
    expect(pool.spawn({ x: 0, y: 0, vx: 0, vy: 1, kind: 'rune' })).toBeNull();
  });

  it('step 依速度積分位置', () => {
    const pool = new BulletPool(4);
    const b = pool.spawn({ x: 0, y: 0, vx: 100, vy: 50, kind: 'rune' })!;
    pool.step(1000);
    expect(b.x).toBeCloseTo(100);
    expect(b.y).toBeCloseTo(50);
  });

  it('加速度改變速度', () => {
    const pool = new BulletPool(4);
    const b = pool.spawn({ x: 0, y: 0, vx: 0, vy: 100, ay: 100, kind: 'rune' })!;
    pool.step(1000);
    expect(b.vy).toBeCloseTo(200);
  });

  it('turnRate 旋轉速度向量、速率不變', () => {
    const pool = new BulletPool(4);
    const b = pool.spawn({ x: 0, y: 0, vx: 100, vy: 0, turnRate: Math.PI / 2, kind: 'rune' })!;
    pool.step(1000); // 轉 90 度
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(100, 0);
    expect(b.vx).toBeCloseTo(0, 0);
  });

  it('出界（含 margin）自動回收', () => {
    const pool = new BulletPool(4);
    pool.spawn({ x: 240, y: 630, vx: 0, vy: 800, kind: 'rune' });
    pool.step(1000);
    expect(pool.countActive()).toBe(0);
  });

  it('clearAll 回收所有子彈並回傳數量', () => {
    const pool = new BulletPool(8);
    pool.spawn({ x: 1, y: 1, vx: 0, vy: 1, kind: 'rune' });
    pool.spawn({ x: 2, y: 2, vx: 0, vy: 1, kind: 'wave' });
    expect(pool.clearAll()).toBe(2);
    expect(pool.countActive()).toBe(0);
  });

  it('預設池上限為 MAX_ENEMY_BULLETS', () => {
    const pool = new BulletPool();
    expect(pool.capacity).toBe(MAX_ENEMY_BULLETS);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/bullet.test.ts`
Expected: FAIL（找不到 `./bullet`）

- [ ] **Step 3: 寫實作**

```typescript
// bullet.ts
import type { EnemyBullet, BulletKind } from './types';
import { FIELD_W, FIELD_H, MAX_ENEMY_BULLETS, BULLET_CULL_MARGIN, BULLET_R } from './constants';

export interface SpawnSpec {
  x: number; y: number; vx: number; vy: number;
  ax?: number; ay?: number; turnRate?: number;
  kind: BulletKind;
}

/** 固定大小物件池：超量時丟棄新彈（彈幕上限即效能上限）。 */
export class BulletPool {
  readonly capacity: number;
  readonly items: EnemyBullet[];

  constructor(capacity = MAX_ENEMY_BULLETS) {
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, turnRate: 0,
      kind: 'rune' as BulletKind, r: 0, grazed: false, active: false,
    }));
  }

  spawn(s: SpawnSpec): EnemyBullet | null {
    const b = this.items.find((it) => !it.active);
    if (!b) return null;
    b.x = s.x; b.y = s.y; b.vx = s.vx; b.vy = s.vy;
    b.ax = s.ax ?? 0; b.ay = s.ay ?? 0; b.turnRate = s.turnRate ?? 0;
    b.kind = s.kind; b.r = BULLET_R[s.kind];
    b.grazed = false; b.active = true;
    return b;
  }

  step(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const b of this.items) {
      if (!b.active) continue;
      if (b.turnRate !== 0) {
        const a = b.turnRate * dt;
        const cos = Math.cos(a), sin = Math.sin(a);
        const vx = b.vx * cos - b.vy * sin;
        b.vy = b.vx * sin + b.vy * cos;
        b.vx = vx;
      }
      b.vx += b.ax * dt; b.vy += b.ay * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const m = BULLET_CULL_MARGIN;
      if (b.x < -m || b.x > FIELD_W + m || b.y < -m || b.y > FIELD_H + m) b.active = false;
    }
  }

  clearAll(): number {
    let n = 0;
    for (const b of this.items) { if (b.active) { b.active = false; n++; } }
    return n;
  }

  countActive(): number {
    let n = 0;
    for (const b of this.items) if (b.active) n++;
    return n;
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/bullet.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/witchrun/engine/bullet.ts src/scripts/games/witchrun/engine/bullet.test.ts
git commit -m "feat(witchrun): 子彈物件池與運動積分（直線/加速/螺旋）"
```

---

### Task 4: collision.ts — 雙半徑判定

**Files:**
- Create: `src/scripts/games/witchrun/engine/collision.ts`
- Test: `src/scripts/games/witchrun/engine/collision.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// collision.test.ts
import { describe, it, expect } from 'vitest';
import { circleHit, sweepPlayerVsBullets } from './collision';
import { BulletPool } from './bullet';
import { makePlayer } from './player';
import { PLAYER_HIT_R, GRAZE_R } from './constants';

describe('circleHit', () => {
  it('距離小於半徑和時為 true', () => {
    expect(circleHit(0, 0, 5, 8, 0, 4)).toBe(true);
    expect(circleHit(0, 0, 5, 10, 0, 4)).toBe(false);
  });
});

describe('sweepPlayerVsBullets', () => {
  it('子彈進入擦彈圈：計 1 次擦彈並標記 grazed', () => {
    const pool = new BulletPool(4);
    const p = makePlayer();
    const b = pool.spawn({ x: p.x + GRAZE_R - 1, y: p.y, vx: 0, vy: 0, kind: 'rune' })!;
    const r1 = sweepPlayerVsBullets(p, pool, 1);
    expect(r1.hit).toBe(false);
    expect(r1.grazes).toBe(1);
    expect(b.grazed).toBe(true);
    const r2 = sweepPlayerVsBullets(p, pool, 1); // 同顆不重複計
    expect(r2.grazes).toBe(0);
  });

  it('子彈進入被彈圈：hit=true 且該彈回收', () => {
    const pool = new BulletPool(4);
    const p = makePlayer();
    const b = pool.spawn({ x: p.x + PLAYER_HIT_R - 1, y: p.y, vx: 0, vy: 0, kind: 'rune' })!;
    const r = sweepPlayerVsBullets(p, pool, 1);
    expect(r.hit).toBe(true);
    expect(b.active).toBe(false);
  });

  it('hitboxMult 縮小被彈圈（咒速羽毛）', () => {
    const pool = new BulletPool(4);
    const p = makePlayer();
    // 距離放在 0.85 倍判定圈外、1 倍判定圈內
    pool.spawn({ x: p.x + (PLAYER_HIT_R + 4) * 0.9, y: p.y, vx: 0, vy: 0, kind: 'rune' });
    const shrunk = sweepPlayerVsBullets(p, pool, 0.5);
    expect(shrunk.hit).toBe(false);
  });

  it('無敵中不判 hit 但仍可擦彈', () => {
    const pool = new BulletPool(4);
    const p = makePlayer();
    p.invulnMs = 1000;
    pool.spawn({ x: p.x, y: p.y, vx: 0, vy: 0, kind: 'rune' });
    const r = sweepPlayerVsBullets(p, pool, 1);
    expect(r.hit).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/collision.test.ts`
Expected: FAIL（找不到 `./collision`）

- [ ] **Step 3: 寫實作**

```typescript
// collision.ts
import type { PlayerState } from './types';
import type { BulletPool } from './bullet';
import { PLAYER_HIT_R, GRAZE_R } from './constants';

export function circleHit(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

export interface SweepResult { hit: boolean; grazes: number; }

/**
 * 自機 vs 全部敵彈：先判被彈（內圈，命中即回收該彈），再判擦彈（外圈，每彈一次）。
 * 無敵中不判被彈（仍可擦彈累積超載）。
 */
export function sweepPlayerVsBullets(p: PlayerState, pool: BulletPool, hitboxMult: number): SweepResult {
  const hitR = PLAYER_HIT_R * hitboxMult;
  let grazes = 0;
  let hit = false;
  for (const b of pool.items) {
    if (!b.active) continue;
    if (p.invulnMs <= 0 && circleHit(p.x, p.y, hitR, b.x, b.y, b.r)) {
      b.active = false;
      hit = true;
      continue;
    }
    if (!b.grazed && circleHit(p.x, p.y, GRAZE_R, b.x, b.y, b.r)) {
      b.grazed = true;
      grazes++;
    }
  }
  return { hit, grazes };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/collision.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/witchrun/engine/collision.ts src/scripts/games/witchrun/engine/collision.test.ts
git commit -m "feat(witchrun): 雙半徑碰撞判定（被彈/擦彈）"
```

---

### Task 5: graze.ts — OVERDRIVE 槽

**Files:**
- Create: `src/scripts/games/witchrun/engine/graze.ts`
- Test: `src/scripts/games/witchrun/engine/graze.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// graze.test.ts
import { describe, it, expect } from 'vitest';
import { Overdrive } from './graze';
import { OVERDRIVE_MAX, GRAZE_GAIN, OVERDRIVE_DURATION_MS } from './constants';

describe('Overdrive', () => {
  it('擦彈累積槽值，封頂 OVERDRIVE_MAX', () => {
    const od = new Overdrive();
    od.addGraze(2, 0);          // 2 次擦彈、無低速加成
    expect(od.gauge).toBe(GRAZE_GAIN * 2);
    od.addGraze(1000, 0);
    expect(od.gauge).toBe(OVERDRIVE_MAX);
  });

  it('低速加成（星屑掃帚 +30%）', () => {
    const od = new Overdrive();
    od.addGraze(1, 0.3);
    expect(od.gauge).toBeCloseTo(GRAZE_GAIN * 1.3);
  });

  it('未滿槽不能引爆；滿槽引爆後進入 active 並清空槽', () => {
    const od = new Overdrive();
    expect(od.activate(1)).toBe(false);
    od.addGraze(1000, 0);
    expect(od.activate(1)).toBe(true);
    expect(od.gauge).toBe(0);
    expect(od.activeMs).toBe(OVERDRIVE_DURATION_MS);
  });

  it('回音鈴：durMult 延長 active 時間', () => {
    const od = new Overdrive();
    od.addGraze(1000, 0);
    od.activate(1.5);
    expect(od.activeMs).toBe(OVERDRIVE_DURATION_MS * 1.5);
  });

  it('tick 遞減 active 時間；active 中再擦彈不累積', () => {
    const od = new Overdrive();
    od.addGraze(1000, 0);
    od.activate(1);
    od.addGraze(5, 0);
    expect(od.gauge).toBe(0);
    od.tick(1000);
    expect(od.activeMs).toBe(OVERDRIVE_DURATION_MS - 1000);
  });

  it('被彈清空槽並中斷 active', () => {
    const od = new Overdrive();
    od.addGraze(10, 0);
    od.onPlayerHit();
    expect(od.gauge).toBe(0);
    expect(od.activeMs).toBe(0);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/graze.test.ts`
Expected: FAIL（找不到 `./graze`）

- [ ] **Step 3: 寫實作**

```typescript
// graze.ts
import { OVERDRIVE_MAX, GRAZE_GAIN, OVERDRIVE_DURATION_MS } from './constants';

/** OVERDRIVE 槽：擦彈累積 → 滿槽手動引爆 → 限時火力全開。被彈全清。 */
export class Overdrive {
  gauge = 0;       // 0..OVERDRIVE_MAX
  activeMs = 0;    // >0 表示火力全開中

  get isActive(): boolean { return this.activeMs > 0; }
  get isFull(): boolean { return this.gauge >= OVERDRIVE_MAX; }

  /** grazes 次擦彈；focusBonus 為星屑掃帚低速加成（0 或 0.3）。active 中不累積。 */
  addGraze(grazes: number, focusBonus: number): void {
    if (this.isActive) return;
    this.gauge = Math.min(OVERDRIVE_MAX, this.gauge + grazes * GRAZE_GAIN * (1 + focusBonus));
  }

  /** 滿槽才可引爆；durMult 為回音鈴倍率。回傳是否成功。 */
  activate(durMult: number): boolean {
    if (!this.isFull || this.isActive) return false;
    this.gauge = 0;
    this.activeMs = OVERDRIVE_DURATION_MS * durMult;
    return true;
  }

  tick(dtMs: number): void {
    this.activeMs = Math.max(0, this.activeMs - dtMs);
  }

  onPlayerHit(): void {
    this.gauge = 0;
    this.activeMs = 0;
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/graze.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/witchrun/engine/graze.ts src/scripts/games/witchrun/engine/graze.test.ts
git commit -m "feat(witchrun): OVERDRIVE 擦彈超載槽"
```

---

### Task 6: pattern.ts — 彈幕產生器

**Files:**
- Create: `src/scripts/games/witchrun/engine/pattern.ts`
- Test: `src/scripts/games/witchrun/engine/pattern.test.ts`

所有產生器都是純函數：回傳 `SpawnSpec[]`（Task 3 定義），由呼叫端餵進 `BulletPool`。角度慣例：0 = 正下方（朝玩家方向 +y），逆時針為正。

- [ ] **Step 1: 寫失敗測試**

```typescript
// pattern.test.ts
import { describe, it, expect } from 'vitest';
import { ring, fan, aimed, spiral, bellWave } from './pattern';

const SPEED = 120;

describe('pattern', () => {
  it('ring：n 顆等角分佈、速率一致', () => {
    const out = ring({ x: 240, y: 100, n: 8, speed: SPEED, kind: 'rune' });
    expect(out).toHaveLength(8);
    for (const b of out) expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(SPEED);
    // 等角：相鄰兩顆夾角 = 2π/8
    const a0 = Math.atan2(out[0].vy, out[0].vx);
    const a1 = Math.atan2(out[1].vy, out[1].vx);
    expect(Math.abs(a1 - a0)).toBeCloseTo(Math.PI / 4, 5);
  });

  it('ring：offset 旋轉整圈起始角', () => {
    const a = ring({ x: 0, y: 0, n: 4, speed: SPEED, kind: 'rune' });
    const b = ring({ x: 0, y: 0, n: 4, speed: SPEED, kind: 'rune', offset: Math.PI / 4 });
    const angA = Math.atan2(a[0].vy, a[0].vx);
    const angB = Math.atan2(b[0].vy, b[0].vx);
    expect(angB - angA).toBeCloseTo(Math.PI / 4, 5);
  });

  it('fan：以 aim 為中心展開 spread 弧', () => {
    const out = fan({ x: 0, y: 0, n: 3, speed: SPEED, aim: Math.PI / 2, spread: Math.PI / 4, kind: 'page' });
    expect(out).toHaveLength(3);
    const mid = out[1];
    expect(Math.atan2(mid.vy, mid.vx)).toBeCloseTo(Math.PI / 2, 5);
  });

  it('aimed：朝目標點直射', () => {
    const [b] = aimed({ x: 0, y: 0, tx: 100, ty: 0, speed: SPEED, kind: 'rune' });
    expect(b.vx).toBeCloseTo(SPEED);
    expect(b.vy).toBeCloseTo(0);
  });

  it('spiral：依時間旋進、帶 turnRate', () => {
    const a = spiral({ x: 0, y: 0, tMs: 0, armN: 2, speed: SPEED, rate: 1, kind: 'gear' });
    const b = spiral({ x: 0, y: 0, tMs: 500, armN: 2, speed: SPEED, rate: 1, kind: 'gear' });
    expect(a).toHaveLength(2);
    const angA = Math.atan2(a[0].vy, a[0].vx);
    const angB = Math.atan2(b[0].vy, b[0].vx);
    expect(angB).not.toBeCloseTo(angA, 2); // 不同時間發射角不同
  });

  it('bellWave：完整圓環挖出缺口（gapWidth 弧內無子彈）', () => {
    const gapAt = Math.PI / 2, gapWidth = Math.PI / 6;
    const out = bellWave({ x: 240, y: 160, n: 36, speed: SPEED, gapAt, gapWidth });
    expect(out.length).toBeLessThan(36);   // 有挖掉
    expect(out.length).toBeGreaterThan(28);
    for (const b of out) {
      const ang = Math.atan2(b.vy, b.vx);
      let d = Math.abs(ang - gapAt);
      d = Math.min(d, 2 * Math.PI - d);
      expect(d).toBeGreaterThanOrEqual(gapWidth / 2 - 1e-9); // 缺口內沒有彈
    }
    for (const b of out) expect(b.kind).toBe('bell');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/pattern.test.ts`
Expected: FAIL（找不到 `./pattern`）

- [ ] **Step 3: 寫實作**

```typescript
// pattern.ts
import type { BulletKind } from './types';
import type { SpawnSpec } from './bullet';

/** 由角度+速率組 SpawnSpec。 */
function at(x: number, y: number, ang: number, speed: number, kind: BulletKind, turnRate = 0): SpawnSpec {
  return { x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, kind, turnRate };
}

export function ring(o: { x: number; y: number; n: number; speed: number; kind: BulletKind; offset?: number }): SpawnSpec[] {
  const out: SpawnSpec[] = [];
  for (let i = 0; i < o.n; i++) {
    out.push(at(o.x, o.y, (o.offset ?? 0) + (i / o.n) * 2 * Math.PI, o.speed, o.kind));
  }
  return out;
}

export function fan(o: { x: number; y: number; n: number; speed: number; aim: number; spread: number; kind: BulletKind }): SpawnSpec[] {
  const out: SpawnSpec[] = [];
  for (let i = 0; i < o.n; i++) {
    const t = o.n === 1 ? 0.5 : i / (o.n - 1);
    out.push(at(o.x, o.y, o.aim - o.spread / 2 + t * o.spread, o.speed, o.kind));
  }
  return out;
}

export function aimed(o: { x: number; y: number; tx: number; ty: number; speed: number; kind: BulletKind }): SpawnSpec[] {
  return [at(o.x, o.y, Math.atan2(o.ty - o.y, o.tx - o.x), o.speed, o.kind)];
}

/** 多臂螺旋：發射角隨時間旋進（rate rad/s），子彈本身帶微小 turnRate 增曲度。 */
export function spiral(o: { x: number; y: number; tMs: number; armN: number; speed: number; rate: number; kind: BulletKind }): SpawnSpec[] {
  const base = (o.tMs / 1000) * o.rate;
  const out: SpawnSpec[] = [];
  for (let i = 0; i < o.armN; i++) {
    out.push(at(o.x, o.y, base + (i / o.armN) * 2 * Math.PI, o.speed, o.kind, 0.25));
  }
  return out;
}

/** 亡鐘鐘波：完整圓環挖出一個缺口（玩家從缺口穿越）。 */
export function bellWave(o: { x: number; y: number; n: number; speed: number; gapAt: number; gapWidth: number }): SpawnSpec[] {
  const out: SpawnSpec[] = [];
  for (let i = 0; i < o.n; i++) {
    const ang = (i / o.n) * 2 * Math.PI - Math.PI; // [-π, π)
    let d = Math.abs(ang - o.gapAt);
    d = Math.min(d, 2 * Math.PI - d);
    if (d < o.gapWidth / 2) continue;
    out.push(at(o.x, o.y, ang, o.speed, 'bell'));
  }
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/pattern.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/witchrun/engine/pattern.ts src/scripts/games/witchrun/engine/pattern.test.ts
git commit -m "feat(witchrun): 彈幕產生器 ring/fan/aimed/spiral/bellWave"
```

---

### Task 7: relics.ts + scoring.ts — 遺物與計分

**Files:**
- Create: `src/scripts/games/witchrun/engine/relics.ts`
- Create: `src/scripts/games/witchrun/engine/scoring.ts`
- Test: `src/scripts/games/witchrun/engine/relics.test.ts`
- Test: `src/scripts/games/witchrun/engine/scoring.test.ts`

- [ ] **Step 1: 寫 relics 失敗測試**

```typescript
// relics.test.ts
import { describe, it, expect } from 'vitest';
import { RELICS, draftRelics, computeModifiers, BASE_MODIFIERS } from './relics';
import { createRng } from './rng';
import type { RelicId } from './types';

describe('relics', () => {
  it('遺物池共 9 種且 id 唯一', () => {
    const ids = Object.keys(RELICS);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
  });

  it('draftRelics 抽 3 個不重複且排除已持有', () => {
    const rng = createRng(1);
    const owned: RelicId[] = ['split', 'magnet'];
    const picks = draftRelics(rng, owned);
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
    for (const p of picks) expect(owned).not.toContain(p);
  });

  it('剩餘不足 3 個時抽剩餘全部', () => {
    const rng = createRng(1);
    const owned = Object.keys(RELICS).slice(0, 7) as RelicId[];
    expect(draftRelics(rng, owned)).toHaveLength(2);
  });

  it('computeModifiers：無遺物時回傳基準值', () => {
    expect(computeModifiers([])).toEqual(BASE_MODIFIERS);
  });

  it('computeModifiers：效果聚合', () => {
    const m = computeModifiers(['feather', 'pact', 'echo', 'stardust']);
    expect(m.speedMult).toBeCloseTo(1.2);
    expect(m.hitboxMult).toBeCloseTo(0.85);
    expect(m.atkMult).toBeCloseTo(1.5);
    expect(m.lifeCapDelta).toBe(-1);
    expect(m.overdriveDurMult).toBeCloseTo(1.5);
    expect(m.focusGrazeBonus).toBeCloseTo(0.3);
  });

  it('computeModifiers：布林遺物', () => {
    const m = computeModifiers(['split', 'familiar', 'magnet', 'catalyst']);
    expect(m.splitShot).toBe(true);
    expect(m.familiar).toBe(true);
    expect(m.magnet).toBe(true);
    expect(m.fireField).toBe(true);
  });
});
```

- [ ] **Step 2: 寫 scoring 失敗測試**

```typescript
// scoring.test.ts
import { describe, it, expect } from 'vitest';
import { SCORE, chainMultiplier } from './scoring';

describe('scoring', () => {
  it('連鎖倍率：每 10 連鎖 +0.5x，封頂 5x', () => {
    expect(chainMultiplier(0)).toBe(1);
    expect(chainMultiplier(10)).toBeCloseTo(1.5);
    expect(chainMultiplier(40)).toBeCloseTo(3);
    expect(chainMultiplier(999)).toBe(5);
  });

  it('分值常數存在', () => {
    expect(SCORE.enemy).toBeGreaterThan(0);
    expect(SCORE.coin).toBeGreaterThan(0);
    expect(SCORE.graze).toBeGreaterThan(0);
    expect(SCORE.bossBonus).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/relics.test.ts src/scripts/games/witchrun/engine/scoring.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 4: 寫 relics.ts**

```typescript
// relics.ts
import type { RelicId, RelicDef, Modifiers } from './types';

export const RELICS: Record<RelicId, RelicDef> = {
  split:     { id: 'split',     name: '裂變魔彈', desc: '魔彈命中後分裂出 2 顆斜向小彈' },
  familiar:  { id: 'familiar',  name: '影子使魔', desc: '僚機複製本體 50% 攻擊' },
  magnet:    { id: 'magnet',    name: '貪婪磁石', desc: '金幣拾取範圍大幅擴大' },
  moonlight: { id: 'moonlight', name: '月光護符', desc: '殘機 +1（立即生效）' },
  feather:   { id: 'feather',   name: '咒速羽毛', desc: '移速 +20%、被彈判定 -15%' },
  catalyst:  { id: 'catalyst',  name: '爆炎觸媒', desc: '爆炎 +1，爆炎後留下火場' },
  echo:      { id: 'echo',      name: '回音鈴',   desc: 'OVERDRIVE 持續 +50%' },
  pact:      { id: 'pact',      name: '血色契約', desc: '攻擊 +50%，殘機上限 -1' },
  stardust:  { id: 'stardust',  name: '星屑掃帚', desc: '低速模式擦彈累積 +30%' },
};

export const BASE_MODIFIERS: Modifiers = {
  splitShot: false, familiar: false, magnet: false,
  speedMult: 1, hitboxMult: 1, fireField: false,
  overdriveDurMult: 1, atkMult: 1, lifeCapDelta: 0, focusGrazeBonus: 0,
};

/** 從未持有的遺物中抽 3 個（不足則全給）。Fisher–Yates 取前段。 */
export function draftRelics(rng: () => number, owned: RelicId[]): RelicId[] {
  const pool = (Object.keys(RELICS) as RelicId[]).filter((id) => !owned.includes(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

/** 聚合持有遺物為單一修正值物件。moonlight/catalyst 的即時資源效果由 game.ts 在拾取當下處理。 */
export function computeModifiers(owned: RelicId[]): Modifiers {
  const m: Modifiers = { ...BASE_MODIFIERS };
  for (const id of owned) {
    if (id === 'split') m.splitShot = true;
    else if (id === 'familiar') m.familiar = true;
    else if (id === 'magnet') m.magnet = true;
    else if (id === 'feather') { m.speedMult *= 1.2; m.hitboxMult *= 0.85; }
    else if (id === 'catalyst') m.fireField = true;
    else if (id === 'echo') m.overdriveDurMult *= 1.5;
    else if (id === 'pact') { m.atkMult *= 1.5; m.lifeCapDelta -= 1; }
    else if (id === 'stardust') m.focusGrazeBonus += 0.3;
    // moonlight：純即時效果（+1 命），無持續修正
  }
  return m;
}
```

- [ ] **Step 5: 寫 scoring.ts**

```typescript
// scoring.ts
export const SCORE = { enemy: 100, coin: 50, graze: 10, bossBonus: 5000 } as const;

/** 擦彈連鎖倍率：每 10 連鎖 +0.5x，封頂 5x。被彈時連鎖歸零（由 game.ts 處理）。 */
export function chainMultiplier(chain: number): number {
  return Math.min(5, 1 + Math.floor(chain / 10) * 0.5);
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/relics.test.ts src/scripts/games/witchrun/engine/scoring.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 7: Commit**

```bash
git add src/scripts/games/witchrun/engine/{relics,scoring}.ts src/scripts/games/witchrun/engine/{relics,scoring}.test.ts
git commit -m "feat(witchrun): 遺物三選一系統與計分連鎖倍率"
```

---

### Task 8: enemy.ts — 道中敵行為

**Files:**
- Create: `src/scripts/games/witchrun/engine/enemy.ts`
- Test: `src/scripts/games/witchrun/engine/enemy.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// enemy.test.ts
import { describe, it, expect } from 'vitest';
import { ENEMY_DEFS, makeEnemy, stepEnemy } from './enemy';
import { FIELD_H } from './constants';

describe('enemy', () => {
  it('9 種敵兵都有定義（hp/score/速度/開火參數）', () => {
    const kinds = ['bat', 'wisp', 'fairy', 'tome', 'blade', 'gear', 'angel', 'moth', 'chime'] as const;
    for (const k of kinds) {
      const d = ENEMY_DEFS[k];
      expect(d.hp).toBeGreaterThan(0);
      expect(d.fireIntervalMs).toBeGreaterThan(0);
    }
  });

  it('descend 路徑往下移動', () => {
    const e = makeEnemy(1, 'bat', 100, -20, 'descend');
    stepEnemy(e, 1000, { px: 240, py: 560 });
    expect(e.y).toBeGreaterThan(-20);
  });

  it('sine 路徑左右擺、整體下移', () => {
    const e = makeEnemy(1, 'fairy', 200, 0, 'sine');
    const xs: number[] = [];
    for (let i = 0; i < 30; i++) { stepEnemy(e, 100, { px: 240, py: 560 }); xs.push(e.x); }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10); // 有橫向擺動
    expect(e.y).toBeGreaterThan(0);
  });

  it('hover 路徑下降到定點後停住', () => {
    const e = makeEnemy(1, 'tome', 100, -20, 'hover');
    for (let i = 0; i < 100; i++) stepEnemy(e, 100, { px: 240, py: 560 });
    expect(e.y).toBeLessThan(FIELD_H * 0.4); // 停在上半場
  });

  it('開火冷卻歸零時回傳彈幕並重置冷卻', () => {
    const e = makeEnemy(1, 'bat', 240, 100, 'descend');
    e.fireCdMs = 0;
    const out = stepEnemy(e, 16, { px: 240, py: 560 });
    expect(out.length).toBeGreaterThan(0);
    expect(e.fireCdMs).toBe(ENEMY_DEFS.bat.fireIntervalMs);
  });

  it('冷卻未到不開火', () => {
    const e = makeEnemy(1, 'bat', 240, 100, 'descend');
    e.fireCdMs = 5000;
    expect(stepEnemy(e, 16, { px: 240, py: 560 })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/enemy.test.ts`
Expected: FAIL（找不到 `./enemy`）

- [ ] **Step 3: 寫實作**

```typescript
// enemy.ts
import type { Enemy, EnemyKind, PathKind, BulletKind } from './types';
import type { SpawnSpec } from './bullet';
import { aimed, fan, ring } from './pattern';

export interface EnemyDef {
  hp: number;
  speed: number;            // px/s（descend/swoop 的位移速率）
  fireIntervalMs: number;
  firstFireMs: number;      // 出生後首發延遲
  bulletKind: BulletKind;
  bulletSpeed: number;
  /** 開火型態：aimed=瞄準自機 1 發；fan3=朝自機扇形 3 發；ring8=環形 8 發 */
  fire: 'aimed' | 'fan3' | 'ring8';
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  bat:   { hp: 2,  speed: 90,  fireIntervalMs: 1800, firstFireMs: 600,  bulletKind: 'wisp', bulletSpeed: 130, fire: 'aimed' },
  wisp:  { hp: 1,  speed: 60,  fireIntervalMs: 2400, firstFireMs: 900,  bulletKind: 'wisp', bulletSpeed: 110, fire: 'aimed' },
  fairy: { hp: 3,  speed: 70,  fireIntervalMs: 2000, firstFireMs: 700,  bulletKind: 'rune', bulletSpeed: 140, fire: 'fan3' },
  tome:  { hp: 6,  speed: 80,  fireIntervalMs: 2600, firstFireMs: 800,  bulletKind: 'rune', bulletSpeed: 150, fire: 'ring8' },
  blade: { hp: 2,  speed: 130, fireIntervalMs: 1500, firstFireMs: 500,  bulletKind: 'page', bulletSpeed: 180, fire: 'aimed' },
  gear:  { hp: 8,  speed: 50,  fireIntervalMs: 2200, firstFireMs: 600,  bulletKind: 'gear', bulletSpeed: 120, fire: 'ring8' },
  angel: { hp: 4,  speed: 90,  fireIntervalMs: 1700, firstFireMs: 500,  bulletKind: 'rune', bulletSpeed: 160, fire: 'fan3' },
  moth:  { hp: 3,  speed: 100, fireIntervalMs: 1600, firstFireMs: 400,  bulletKind: 'wisp', bulletSpeed: 150, fire: 'fan3' },
  chime: { hp: 5,  speed: 60,  fireIntervalMs: 2000, firstFireMs: 600,  bulletKind: 'wave', bulletSpeed: 130, fire: 'ring8' },
};

export function makeEnemy(id: number, kind: EnemyKind, x: number, y: number, path: PathKind): Enemy {
  return { id, kind, x, y, hp: ENEMY_DEFS[kind].hp, alive: true, path, t: 0, baseX: x, fireCdMs: ENEMY_DEFS[kind].firstFireMs };
}

const HOVER_Y = 140;       // hover 停駐高度
const SINE_AMP = 60;       // sine 擺幅
const SINE_FREQ = 1.2;     // sine 頻率（rad/s 係數）
const SINE_DESCENT = 40;   // sine 整體下移 px/s
const SWOOP_VED = 120;     // swoop 縱向速率

/** 推進路徑與開火冷卻；冷卻到 0 時回傳彈幕 SpawnSpec[] 並重置。 */
export function stepEnemy(e: Enemy, dtMs: number, target: { px: number; py: number }): SpawnSpec[] {
  const d = ENEMY_DEFS[e.kind];
  const dt = dtMs / 1000;
  e.t += dtMs;

  if (e.path === 'descend') {
    e.y += d.speed * dt;
  } else if (e.path === 'sine') {
    e.y += SINE_DESCENT * dt;
    e.x = e.baseX + Math.sin((e.t / 1000) * SINE_FREQ * Math.PI) * SINE_AMP;
  } else if (e.path === 'hover') {
    if (e.y < HOVER_Y) e.y = Math.min(HOVER_Y, e.y + d.speed * dt);
  } else if (e.path === 'swoopL') {
    e.x -= d.speed * dt; e.y += SWOOP_VED * dt;
  } else if (e.path === 'swoopR') {
    e.x += d.speed * dt; e.y += SWOOP_VED * dt;
  }

  e.fireCdMs -= dtMs;
  if (e.fireCdMs > 0) return [];
  e.fireCdMs = d.fireIntervalMs;

  const aim = Math.atan2(target.py - e.y, target.px - e.x);
  if (d.fire === 'aimed') return aimed({ x: e.x, y: e.y, tx: target.px, ty: target.py, speed: d.bulletSpeed, kind: d.bulletKind });
  if (d.fire === 'fan3') return fan({ x: e.x, y: e.y, n: 3, speed: d.bulletSpeed, aim, spread: Math.PI / 5, kind: d.bulletKind });
  return ring({ x: e.x, y: e.y, n: 8, speed: d.bulletSpeed, kind: d.bulletKind });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/enemy.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/witchrun/engine/enemy.ts src/scripts/games/witchrun/engine/enemy.test.ts
git commit -m "feat(witchrun): 道中敵路徑模型與開火節奏"
```

---

### Task 9: boss.ts — Boss 階段機

**Files:**
- Create: `src/scripts/games/witchrun/engine/boss.ts`
- Test: `src/scripts/games/witchrun/engine/boss.test.ts`

Boss 是「血量閾值切 phase、每 phase 有自己的彈幕節奏」的狀態機。亡鐘（deadbell）的鐘波在 phase 內以固定週期發射 `bellWave`，缺口角度由 RNG 決定，並透過 `tolls` 計數供敘事 HUD。

- [ ] **Step 1: 寫失敗測試**

```typescript
// boss.test.ts
import { describe, it, expect } from 'vitest';
import { BOSS_DEFS, BossRunner } from './boss';
import { createRng } from './rng';

const TARGET = { px: 240, py: 560 };

describe('boss', () => {
  it('4 隻 Boss 都有定義；deadbell 有 3 個 phase', () => {
    expect(Object.keys(BOSS_DEFS)).toEqual(['gargoyle', 'grimoire', 'bellwright', 'deadbell']);
    expect(BOSS_DEFS.deadbell.phases).toHaveLength(3);
    for (const id of ['gargoyle', 'grimoire', 'bellwright'] as const) {
      expect(BOSS_DEFS[id].phases.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('runner 初始 phase 0、滿血、活著', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    expect(r.state.phase).toBe(0);
    expect(r.state.hp).toBe(BOSS_DEFS.gargoyle.hp);
    expect(r.state.alive).toBe(true);
  });

  it('step 依 phase 週期吐彈幕', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    let total = 0;
    for (let i = 0; i < 200; i++) total += r.step(50, TARGET).length; // 10 秒
    expect(total).toBeGreaterThan(0);
  });

  it('血量跨過閾值切 phase 並回報 phaseChanged', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    const def = BOSS_DEFS.gargoyle;
    // 打到第二 phase 閾值以下
    const changed = r.damage(def.hp - Math.floor(def.hp * def.phases[1].hpPct) + 1);
    expect(changed).toBe(true);
    expect(r.state.phase).toBe(1);
  });

  it('血量歸零 alive=false', () => {
    const r = new BossRunner('gargoyle', createRng(1));
    r.damage(999999);
    expect(r.state.alive).toBe(false);
    expect(r.state.hp).toBe(0);
  });

  it('deadbell 發射 bellWave 時 tolls 遞增', () => {
    const r = new BossRunner('deadbell', createRng(1));
    for (let i = 0; i < 400; i++) r.step(50, TARGET); // 20 秒
    expect(r.tolls).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/boss.test.ts`
Expected: FAIL（找不到 `./boss`）

- [ ] **Step 3: 寫實作**

```typescript
// boss.ts
import type { BossId, BossState } from './types';
import type { SpawnSpec } from './bullet';
import { ring, fan, aimed, spiral, bellWave } from './pattern';
import { FIELD_W } from './constants';

/** 每 phase：hpPct = 進入此 phase 的血量比例上限；attacks = 週期性攻擊列表。 */
export interface PhaseDef {
  hpPct: number;   // phase i 在 hp/maxHp <= hpPct 時啟用（phase 0 為 1.0）
  attacks: { everyMs: number; pattern: PatternId }[];
}
export type PatternId =
  | 'ring12' | 'ring20' | 'fan5' | 'fan7' | 'aimed3'   // 泛用
  | 'spiral2' | 'spiral4'                              // 螺旋
  | 'bellwave';                                        // 亡鐘專用

export interface BossDef { id: BossId; hp: number; x: number; y: number; phases: PhaseDef[]; }

export const BOSS_DEFS: Record<BossId, BossDef> = {
  gargoyle: {
    id: 'gargoyle', hp: 300, x: FIELD_W / 2, y: 120,
    phases: [
      { hpPct: 1.0, attacks: [{ everyMs: 1600, pattern: 'fan5' }, { everyMs: 2400, pattern: 'aimed3' }] },
      { hpPct: 0.5, attacks: [{ everyMs: 1300, pattern: 'fan7' }, { everyMs: 2000, pattern: 'ring12' }] },
    ],
  },
  grimoire: {
    id: 'grimoire', hp: 420, x: FIELD_W / 2, y: 120,
    phases: [
      { hpPct: 1.0, attacks: [{ everyMs: 1500, pattern: 'ring12' }, { everyMs: 2600, pattern: 'aimed3' }] },
      { hpPct: 0.5, attacks: [{ everyMs: 900, pattern: 'spiral2' }, { everyMs: 2200, pattern: 'fan5' }] },
    ],
  },
  bellwright: {
    id: 'bellwright', hp: 540, x: FIELD_W / 2, y: 120,
    phases: [
      { hpPct: 1.0, attacks: [{ everyMs: 1100, pattern: 'spiral2' }] },
      { hpPct: 0.6, attacks: [{ everyMs: 900, pattern: 'spiral4' }, { everyMs: 2400, pattern: 'ring12' }] },
      { hpPct: 0.25, attacks: [{ everyMs: 800, pattern: 'spiral4' }, { everyMs: 2000, pattern: 'fan7' }] },
    ],
  },
  deadbell: {
    id: 'deadbell', hp: 700, x: FIELD_W / 2, y: 130,
    phases: [
      { hpPct: 1.0, attacks: [{ everyMs: 2600, pattern: 'bellwave' }, { everyMs: 1800, pattern: 'aimed3' }] },
      { hpPct: 0.6, attacks: [{ everyMs: 2200, pattern: 'bellwave' }, { everyMs: 1400, pattern: 'fan5' }] },
      { hpPct: 0.3, attacks: [{ everyMs: 1800, pattern: 'bellwave' }, { everyMs: 1000, pattern: 'spiral2' }] },
    ],
  },
};

export class BossRunner {
  readonly state: BossState;
  tolls = 0;                       // 亡鐘已敲響數
  private def: BossDef;
  private timers: number[];        // 對應目前 phase 各攻擊的倒數
  private tMs = 0;
  private rng: () => number;

  constructor(id: BossId, rng: () => number) {
    this.def = BOSS_DEFS[id];
    this.rng = rng;
    this.state = { id, x: this.def.x, y: this.def.y, hp: this.def.hp, maxHp: this.def.hp, phase: 0, alive: true };
    this.timers = this.def.phases[0].attacks.map((a) => a.everyMs);
  }

  /** 扣血；跨過閾值時切 phase 並回傳 true。 */
  damage(amount: number): boolean {
    if (!this.state.alive) return false;
    this.state.hp = Math.max(0, this.state.hp - amount);
    if (this.state.hp === 0) { this.state.alive = false; return false; }
    const pct = this.state.hp / this.state.maxHp;
    let next = this.state.phase;
    for (let i = this.def.phases.length - 1; i > this.state.phase; i--) {
      if (pct <= this.def.phases[i].hpPct) { next = i; break; }
    }
    if (next !== this.state.phase) {
      this.state.phase = next;
      this.timers = this.def.phases[next].attacks.map((a) => a.everyMs);
      return true;
    }
    return false;
  }

  /** 推進攻擊計時；回傳本 tick 產生的彈幕。Boss 緩慢左右漂移。 */
  step(dtMs: number, target: { px: number; py: number }): SpawnSpec[] {
    if (!this.state.alive) return [];
    this.tMs += dtMs;
    this.state.x = this.def.x + Math.sin(this.tMs / 2400) * 70;

    const out: SpawnSpec[] = [];
    const phase = this.def.phases[this.state.phase];
    for (let i = 0; i < phase.attacks.length; i++) {
      this.timers[i] -= dtMs;
      if (this.timers[i] > 0) continue;
      this.timers[i] = phase.attacks[i].everyMs;
      out.push(...this.emit(phase.attacks[i].pattern, target));
    }
    return out;
  }

  private emit(id: PatternId, target: { px: number; py: number }): SpawnSpec[] {
    const { x, y } = this.state;
    const aim = Math.atan2(target.py - y, target.px - x);
    switch (id) {
      case 'ring12': return ring({ x, y, n: 12, speed: 130, kind: 'rune', offset: this.rng() * Math.PI });
      case 'ring20': return ring({ x, y, n: 20, speed: 140, kind: 'rune', offset: this.rng() * Math.PI });
      case 'fan5':   return fan({ x, y, n: 5, speed: 170, aim, spread: Math.PI / 4, kind: 'page' });
      case 'fan7':   return fan({ x, y, n: 7, speed: 180, aim, spread: Math.PI / 3, kind: 'page' });
      case 'aimed3': return [
        ...aimed({ x: x - 24, y, tx: target.px, ty: target.py, speed: 200, kind: 'wisp' }),
        ...aimed({ x, y, tx: target.px, ty: target.py, speed: 200, kind: 'wisp' }),
        ...aimed({ x: x + 24, y, tx: target.px, ty: target.py, speed: 200, kind: 'wisp' }),
      ];
      case 'spiral2': return spiral({ x, y, tMs: this.tMs, armN: 2, speed: 140, rate: 1.4, kind: 'gear' });
      case 'spiral4': return spiral({ x, y, tMs: this.tMs, armN: 4, speed: 150, rate: 1.8, kind: 'gear' });
      case 'bellwave': {
        this.tolls += 1;
        // 缺口朝玩家附近 ± 隨機偏移：找得到但要移動
        const gapAt = aim + (this.rng() - 0.5) * (Math.PI / 3);
        return bellWave({ x, y, n: 40, speed: 120, gapAt, gapWidth: Math.PI / 5 });
      }
    }
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/boss.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/witchrun/engine/boss.ts src/scripts/games/witchrun/engine/boss.test.ts
git commit -m "feat(witchrun): Boss 階段機與四 Boss 彈幕定義（含亡鐘鐘波）"
```

---

### Task 10: stage.ts — 關卡波次時間軸

**Files:**
- Create: `src/scripts/games/witchrun/engine/stage.ts`
- Test: `src/scripts/games/witchrun/engine/stage.test.ts`

關卡腳本 = 純資料：`{ atMs, kind, x, y, path }[]`，跑完表 → 場上敵清空 → Boss 登場。x 用 0..1 比例（乘 FIELD_W），方便表格閱讀。

- [ ] **Step 1: 寫失敗測試**

```typescript
// stage.test.ts
import { describe, it, expect } from 'vitest';
import { STAGES, StageRunner } from './stage';

describe('stage', () => {
  it('4 關都有波次表與 Boss', () => {
    for (const s of [1, 2, 3, 4] as const) {
      expect(STAGES[s].waves.length).toBeGreaterThan(5);
      expect(STAGES[s].boss).toBeTruthy();
      // 波次表按時間排序
      const times = STAGES[s].waves.map((w) => w.atMs);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it('關卡敵種符合場景語言', () => {
    expect(STAGES[1].waves.every((w) => ['bat', 'wisp', 'fairy'].includes(w.kind))).toBe(true);
    expect(STAGES[2].waves.every((w) => ['tome', 'blade', 'fairy'].includes(w.kind))).toBe(true);
    expect(STAGES[3].waves.every((w) => ['gear', 'angel', 'blade'].includes(w.kind))).toBe(true);
    expect(STAGES[4].waves.every((w) => ['moth', 'chime', 'fairy'].includes(w.kind))).toBe(true);
    expect(STAGES[4].boss).toBe('deadbell');
  });

  it('runner 依時間吐出生成、不重複', () => {
    const r = new StageRunner(1);
    const first = STAGES[1].waves[0];
    expect(r.step(first.atMs - 1)).toHaveLength(0);
    const spawns = r.step(2); // 跨過第一筆
    expect(spawns.length).toBeGreaterThanOrEqual(1);
    expect(spawns[0].kind).toBe(first.kind);
  });

  it('波次跑完 → wavesDone=true', () => {
    const r = new StageRunner(1);
    r.step(10 * 60 * 1000);
    expect(r.wavesDone).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/stage.test.ts`
Expected: FAIL（找不到 `./stage`）

- [ ] **Step 3: 寫實作**

波次表設計原則：每關約 100–120 秒道中、節奏「單兵教學 → 編隊 → 混編壓力 → 收尾喘息（3 秒）→ Boss」。下面是完整資料（x 為 0..1 比例）。

```typescript
// stage.ts
import type { StageId, EnemyKind, PathKind, BossId } from './types';
import { FIELD_W } from './constants';

export interface WaveEntry { atMs: number; kind: EnemyKind; x: number; path: PathKind; }
export interface StageDef { name: string; waves: WaveEntry[]; boss: BossId; }

/** 工具：等間隔編隊展開（建表用）。 */
function squad(atMs: number, kind: EnemyKind, path: PathKind, xs: number[], gapMs = 280): WaveEntry[] {
  return xs.map((x, i) => ({ atMs: atMs + i * gapMs, kind, x, path }));
}

export const STAGES: Record<StageId, StageDef> = {
  1: {
    name: 'GRAVEYARD GATE', boss: 'gargoyle',
    waves: [
      ...squad(2000,  'bat',   'descend', [0.3, 0.5, 0.7]),
      ...squad(8000,  'wisp',  'sine',    [0.25, 0.75]),
      ...squad(14000, 'bat',   'swoopR',  [0.1, 0.1, 0.1]),
      ...squad(20000, 'bat',   'swoopL',  [0.9, 0.9, 0.9]),
      ...squad(27000, 'fairy', 'hover',   [0.35, 0.65]),
      ...squad(34000, 'wisp',  'sine',    [0.2, 0.5, 0.8]),
      ...squad(42000, 'bat',   'descend', [0.15, 0.35, 0.55, 0.75]),
      ...squad(50000, 'fairy', 'hover',   [0.5]),
      ...squad(56000, 'bat',   'swoopL',  [0.85, 0.85]),
      ...squad(56000, 'bat',   'swoopR',  [0.15, 0.15]),
      ...squad(64000, 'wisp',  'sine',    [0.3, 0.7]),
      ...squad(70000, 'fairy', 'hover',   [0.25, 0.75]),
      ...squad(78000, 'bat',   'descend', [0.2, 0.4, 0.6, 0.8]),
      ...squad(86000, 'fairy', 'hover',   [0.5]),
      ...squad(92000, 'wisp',  'sine',    [0.4, 0.6]),
    ].sort((a, b) => a.atMs - b.atMs),
  },
  2: {
    name: 'LIBRARY SPIRE', boss: 'grimoire',
    waves: [
      ...squad(2000,  'blade', 'swoopL',  [0.9, 0.9, 0.9]),
      ...squad(7000,  'blade', 'swoopR',  [0.1, 0.1, 0.1]),
      ...squad(13000, 'tome',  'hover',   [0.5]),
      ...squad(20000, 'fairy', 'sine',    [0.3, 0.7]),
      ...squad(27000, 'tome',  'hover',   [0.25, 0.75]),
      ...squad(35000, 'blade', 'descend', [0.2, 0.4, 0.6, 0.8]),
      ...squad(43000, 'tome',  'hover',   [0.5]),
      ...squad(43000, 'fairy', 'sine',    [0.2, 0.8]),
      ...squad(52000, 'blade', 'swoopL',  [0.95, 0.95]),
      ...squad(52000, 'blade', 'swoopR',  [0.05, 0.05]),
      ...squad(60000, 'tome',  'hover',   [0.35, 0.65]),
      ...squad(70000, 'fairy', 'sine',    [0.25, 0.5, 0.75]),
      ...squad(80000, 'tome',  'hover',   [0.2, 0.5, 0.8]),
      ...squad(92000, 'blade', 'descend', [0.3, 0.5, 0.7]),
    ].sort((a, b) => a.atMs - b.atMs),
  },
  3: {
    name: 'CLOCKWORK FOUNDRY', boss: 'bellwright',
    waves: [
      ...squad(2000,  'gear',  'descend', [0.5]),
      ...squad(8000,  'angel', 'sine',    [0.3, 0.7]),
      ...squad(15000, 'gear',  'descend', [0.3, 0.7]),
      ...squad(23000, 'blade', 'swoopL',  [0.9, 0.9, 0.9]),
      ...squad(30000, 'angel', 'sine',    [0.2, 0.5, 0.8]),
      ...squad(38000, 'gear',  'hover',   [0.5]),
      ...squad(46000, 'angel', 'swoopR',  [0.1, 0.1]),
      ...squad(46000, 'blade', 'swoopL',  [0.9, 0.9]),
      ...squad(55000, 'gear',  'descend', [0.25, 0.75]),
      ...squad(64000, 'angel', 'sine',    [0.35, 0.65]),
      ...squad(72000, 'gear',  'hover',   [0.3, 0.7]),
      ...squad(82000, 'blade', 'descend', [0.2, 0.4, 0.6, 0.8]),
      ...squad(92000, 'angel', 'sine',    [0.3, 0.5, 0.7]),
    ].sort((a, b) => a.atMs - b.atMs),
  },
  4: {
    name: 'THE BELFRY', boss: 'deadbell',
    waves: [
      ...squad(2000,  'moth',  'sine',    [0.3, 0.7]),
      ...squad(8000,  'chime', 'hover',   [0.5]),
      ...squad(15000, 'moth',  'swoopL',  [0.9, 0.9, 0.9]),
      ...squad(21000, 'moth',  'swoopR',  [0.1, 0.1, 0.1]),
      ...squad(28000, 'chime', 'hover',   [0.25, 0.75]),
      ...squad(36000, 'fairy', 'sine',    [0.2, 0.5, 0.8]),
      ...squad(44000, 'moth',  'descend', [0.15, 0.35, 0.55, 0.75]),
      ...squad(52000, 'chime', 'hover',   [0.5]),
      ...squad(52000, 'moth',  'sine',    [0.2, 0.8]),
      ...squad(62000, 'chime', 'hover',   [0.35, 0.65]),
      ...squad(72000, 'moth',  'swoopL',  [0.95, 0.95]),
      ...squad(72000, 'moth',  'swoopR',  [0.05, 0.05]),
      ...squad(82000, 'chime', 'hover',   [0.2, 0.5, 0.8]),
      ...squad(94000, 'fairy', 'sine',    [0.3, 0.7]),
    ].sort((a, b) => a.atMs - b.atMs),
  },
};

export interface StageSpawn { kind: EnemyKind; x: number; path: PathKind; }

export class StageRunner {
  readonly stage: StageId;
  private tMs = 0;
  private idx = 0;

  constructor(stage: StageId) { this.stage = stage; }

  get wavesDone(): boolean { return this.idx >= STAGES[this.stage].waves.length; }

  /** 推進時間，回傳本 tick 到期的生成（x 已換算為 px）。 */
  step(dtMs: number): StageSpawn[] {
    this.tMs += dtMs;
    const out: StageSpawn[] = [];
    const waves = STAGES[this.stage].waves;
    while (this.idx < waves.length && waves[this.idx].atMs <= this.tMs) {
      const w = waves[this.idx++];
      out.push({ kind: w.kind, x: w.x * FIELD_W, path: w.path });
    }
    return out;
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/stage.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/witchrun/engine/stage.ts src/scripts/games/witchrun/engine/stage.test.ts
git commit -m "feat(witchrun): 4 關波次時間軸資料與 StageRunner"
```

---

### Task 11: game.ts — WitchGame 總狀態機

**Files:**
- Modify: `src/scripts/games/witchrun/engine/types.ts`（PlayerBullet 加 `split` 欄位）
- Modify: `src/scripts/games/witchrun/engine/constants.ts`（追加實體判定/金幣常數）
- Create: `src/scripts/games/witchrun/engine/game.ts`
- Test: `src/scripts/games/witchrun/engine/game.test.ts`

- [ ] **Step 1: 修改 types.ts — PlayerBullet 加分裂旗標**

把 `PlayerBullet` 介面改為：

```typescript
export interface PlayerBullet {
  x: number; y: number; vx: number; vy: number;
  dmg: number; active: boolean;
  split: boolean;     // 裂變魔彈產生的子彈不再分裂
}
```

- [ ] **Step 2: 修改 constants.ts — 追加常數（檔尾）**

```typescript
/** 實體判定半徑與金幣。 */
export const ENEMY_R = 14;
export const BOSS_R = 36;
export const COIN_R = 8;
export const COIN_PICKUP_R = 28;
export const COIN_MAGNET_R = 120;       // 貪婪磁石拾取半徑
export const COIN_FALL_SPEED = 90;      // px/s
export const POWER_COINS = 15;          // 每 15 金幣火力 +1
export const MAX_ENEMIES = 32;
export const FIRE_FIELD_MS = 3000;      // 爆炎觸媒火場持續
export const FIRE_FIELD_DPS = 4;        // 火場每秒傷害
export const STEP_CAP_MS = 100;         // 單次 step 上限（分頁切回防爆衝）
```

- [ ] **Step 3: 寫失敗測試**

```typescript
// game.test.ts
import { describe, it, expect } from 'vitest';
import { WitchGame } from './game';
import { STAGES } from './stage';
import { START_LIVES, START_BOMBS, OVERDRIVE_MAX } from './constants';

/** 以固定小步長推進，模擬遊戲時間。 */
function run(g: WitchGame, ms: number, step = 16): void {
  for (let t = 0; t < ms; t += step) g.step(step);
}

describe('WitchGame', () => {
  it('初始狀態：playing、第 1 關、滿資源', () => {
    const g = new WitchGame({ seed: 1 });
    const s = g.getState();
    expect(s.status).toBe('playing');
    expect(s.stage).toBe(1);
    expect(s.player.lives).toBe(START_LIVES);
    expect(s.player.bombs).toBe(START_BOMBS);
    expect(s.relics).toEqual([]);
  });

  it('時間推進後依波次表生成敵人', () => {
    const g = new WitchGame({ seed: 1 });
    run(g, STAGES[1].waves[0].atMs + 100);
    expect(g.getState().enemies.length).toBeGreaterThan(0);
  });

  it('自動射擊產生自機彈，事件含 shoot', () => {
    const g = new WitchGame({ seed: 1 });
    run(g, 300);
    expect(g.getState().playerBullets.length).toBeGreaterThan(0);
    expect(g.drainEvents().some((e) => e.kind === 'shoot')).toBe(true);
  });

  it('drainEvents 清空事件佇列', () => {
    const g = new WitchGame({ seed: 1 });
    run(g, 300);
    g.drainEvents();
    expect(g.drainEvents()).toHaveLength(0);
  });

  it('setHeld 移動自機', () => {
    const g = new WitchGame({ seed: 1 });
    const x0 = g.getState().player.x;
    g.setHeld('left', true);
    run(g, 500);
    expect(g.getState().player.x).toBeLessThan(x0);
  });

  it('爆炎：扣庫存、清敵彈、發 inferno 事件', () => {
    const g = new WitchGame({ seed: 1 });
    run(g, 100);
    g.input('bomb');
    g.step(16);
    const s = g.getState();
    expect(s.player.bombs).toBe(START_BOMBS - 1);
    expect(g.drainEvents().some((e) => e.kind === 'inferno')).toBe(true);
  });

  it('庫存 0 時爆炎無效', () => {
    const g = new WitchGame({ seed: 1 });
    for (let i = 0; i < START_BOMBS; i++) { g.input('bomb'); g.step(2000); }
    g.drainEvents();
    g.input('bomb');
    g.step(16);
    expect(g.drainEvents().some((e) => e.kind === 'inferno')).toBe(false);
  });

  it('OVERDRIVE：未滿不可引爆；滿槽引爆發事件', () => {
    const g = new WitchGame({ seed: 1 });
    g.input('overdrive');
    g.step(16);
    expect(g.drainEvents().some((e) => e.kind === 'overdrive')).toBe(false);
    g.debugFillOverdrive();
    expect(g.getState().overdrive.gauge).toBe(OVERDRIVE_MAX);
    g.input('overdrive');
    g.step(16);
    expect(g.drainEvents().some((e) => e.kind === 'overdrive')).toBe(true);
    expect(g.getState().overdrive.activeMs).toBeGreaterThan(0);
  });

  it('波次跑完且敵清空 → Boss 登場（bossSpawn 事件）', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSkipToBoss();
    g.step(16);
    const s = g.getState();
    expect(s.boss).not.toBeNull();
    expect(s.boss!.id).toBe('gargoyle');
  });

  it('Boss 擊破 → 遺物三選一（draft）→ 選後進下一關', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSkipToBoss();
    g.step(16);
    g.boss!.damage(999999);
    g.step(16);
    const s1 = g.getState();
    expect(s1.status).toBe('draft');
    expect(s1.draftChoices).toHaveLength(3);
    g.pickRelic(s1.draftChoices[0]);
    const s2 = g.getState();
    expect(s2.status).toBe('playing');
    expect(s2.stage).toBe(2);
    expect(s2.relics).toContain(s1.draftChoices[0]);
  });

  it('第 4 關 Boss 擊破 → cleared（不再 draft）', () => {
    const g = new WitchGame({ seed: 1 });
    for (let st = 1; st <= 3; st++) {
      g.debugSkipToBoss(); g.step(16);
      g.boss!.damage(999999); g.step(16);
      g.pickRelic(g.getState().draftChoices[0]);
    }
    g.debugSkipToBoss(); g.step(16);
    g.boss!.damage(999999); g.step(16);
    expect(g.getState().status).toBe('cleared');
  });

  it('命盡 → gameover；continueRun 分數歸零續關', () => {
    const g = new WitchGame({ seed: 1 });
    g.debugSetLives(0);
    g.step(16);
    expect(g.getState().status).toBe('gameover');
    g.continueRun();
    const s = g.getState();
    expect(s.status).toBe('playing');
    expect(s.score).toBe(0);
    expect(s.player.lives).toBe(START_LIVES);
  });
});
```

- [ ] **Step 4: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/engine/game.test.ts`
Expected: FAIL（找不到 `./game`）

- [ ] **Step 5: 寫實作**

```typescript
// game.ts
import type {
  WitchState, WitchEvent, GameStatus, StageId, RelicId, Modifiers,
  Enemy, PlayerBullet, Coin, InputAction,
} from './types';
import {
  FIELD_W, FIELD_H, START_LIVES, START_BOMBS, BOMB_CAP, LIFE_CAP,
  FIRE_INTERVAL_MS, PLAYER_BULLET_SPEED, PLAYER_BULLET_DMG, MAX_PLAYER_BULLETS,
  INFERNO_INVULN_MS, INFERNO_DMG, HIT_CLEAR_R,
  ENEMY_R, BOSS_R, COIN_PICKUP_R, COIN_MAGNET_R, COIN_FALL_SPEED, POWER_COINS,
  MAX_ENEMIES, FIRE_FIELD_MS, FIRE_FIELD_DPS, STEP_CAP_MS,
} from './constants';
import { createRng } from './rng';
import { makePlayer, movePlayer, hitPlayer, tickPlayer, gainPower } from './player';
import { BulletPool } from './bullet';
import { circleHit, sweepPlayerVsBullets } from './collision';
import { Overdrive } from './graze';
import { computeModifiers, draftRelics, BASE_MODIFIERS } from './relics';
import { SCORE, chainMultiplier } from './scoring';
import { makeEnemy, stepEnemy } from './enemy';
import { BossRunner, BOSS_DEFS } from './boss';
import { StageRunner, STAGES } from './stage';

export interface WitchOptions { seed?: number; stage?: StageId; }

export class WitchGame {
  /** 公開給測試與渲染層讀取（damage 由自機彈命中觸發）。 */
  boss: BossRunner | null = null;

  private rng: () => number;
  private status: GameStatus = 'playing';
  private stage: StageId;
  private stageRunner: StageRunner;
  private player = makePlayer();
  private enemyBullets = new BulletPool();
  private playerBullets: PlayerBullet[] = Array.from({ length: MAX_PLAYER_BULLETS }, () => ({
    x: 0, y: 0, vx: 0, vy: 0, dmg: 0, active: false, split: false,
  }));
  private enemies: Enemy[] = [];
  private coins: Coin[] = [];
  private od = new Overdrive();
  private relics: RelicId[] = [];
  private mod: Modifiers = { ...BASE_MODIFIERS };
  private draftChoices: RelicId[] = [];
  private score = 0;
  private grazeChain = 0;
  private coinCount = 0;          // 火力升級計數
  private fireFieldMs = 0;
  private nextEnemyId = 1;
  private bossSpawned = false;
  private held = new Set<'up' | 'down' | 'left' | 'right'>();
  private focusHeld = false;
  private events: WitchEvent[] = [];

  constructor(opts: WitchOptions = {}) {
    this.rng = createRng(opts.seed ?? 1);
    this.stage = opts.stage ?? 1;
    this.stageRunner = new StageRunner(this.stage);
    this.events.push({ kind: 'stageStart', stage: this.stage });
  }

  // ---- 輸入 ----
  setHeld(dir: 'up' | 'down' | 'left' | 'right', down: boolean): void {
    if (down) this.held.add(dir); else this.held.delete(dir);
  }
  setFocus(down: boolean): void { this.focusHeld = down; }

  input(action: InputAction): void {
    if (this.status !== 'playing') return;
    if (action === 'bomb') this.useInferno();
    else if (action === 'overdrive') this.useOverdrive();
  }

  // ---- 遺物 ----
  pickRelic(id: RelicId): void {
    if (this.status !== 'draft' || !this.draftChoices.includes(id)) return;
    this.relics.push(id);
    this.mod = computeModifiers(this.relics);
    const lifeCap = LIFE_CAP + this.mod.lifeCapDelta;
    if (id === 'moonlight') this.player.lives = Math.min(lifeCap, this.player.lives + 1);
    if (id === 'pact') this.player.lives = Math.min(lifeCap, this.player.lives);
    if (id === 'catalyst') this.player.bombs = Math.min(BOMB_CAP, this.player.bombs + 1);
    this.events.push({ kind: 'relicPicked', id });
    this.draftChoices = [];
    this.advanceStage();
  }

  continueRun(): void {
    if (this.status !== 'gameover') return;
    this.score = 0;
    this.grazeChain = 0;
    this.player = makePlayer();
    this.enemyBullets.clearAll();
    this.od = new Overdrive();
    this.status = 'playing';
  }

  // ---- 主迴圈 ----
  step(rawDtMs: number): void {
    if (this.status !== 'playing') return;
    const dtMs = Math.min(STEP_CAP_MS, rawDtMs);

    // 1) 自機
    const dx = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    const dy = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);
    this.player.focus = this.focusHeld;
    movePlayer(this.player, { dx, dy }, dtMs, this.mod.speedMult);
    tickPlayer(this.player, dtMs);
    this.od.tick(dtMs);
    this.fireFieldMs = Math.max(0, this.fireFieldMs - dtMs);
    this.autoFire(dtMs);

    // 2) 關卡生成 / Boss
    if (!this.bossSpawned) {
      for (const s of this.stageRunner.step(dtMs)) {
        if (this.enemies.length >= MAX_ENEMIES) break;
        this.enemies.push(makeEnemy(this.nextEnemyId++, s.kind, s.x, -20, s.path));
      }
      if (this.stageRunner.wavesDone && this.enemies.length === 0) {
        this.boss = new BossRunner(STAGES[this.stage].boss, this.rng);
        this.bossSpawned = true;
        this.events.push({ kind: 'bossSpawn', id: this.boss.state.id });
      }
    } else if (this.boss?.state.alive) {
      const prevTolls = this.boss.tolls;
      for (const spec of this.boss.step(dtMs, { px: this.player.x, py: this.player.y })) {
        this.enemyBullets.spawn(spec);
      }
      if (this.boss.tolls > prevTolls) this.events.push({ kind: 'bellToll', count: this.boss.tolls });
    }

    // 3) 道中敵
    for (const e of this.enemies) {
      if (!e.alive) continue;
      for (const spec of stepEnemy(e, dtMs, { px: this.player.x, py: this.player.y })) {
        this.enemyBullets.spawn(spec);
      }
      if (e.y > FIELD_H + 40 || e.x < -60 || e.x > FIELD_W + 60) e.alive = false; // 出場回收
      if (this.fireFieldMs > 0) this.damageEnemy(e, FIRE_FIELD_DPS * (dtMs / 1000));
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    // 4) 子彈運動
    this.enemyBullets.step(dtMs);
    this.stepPlayerBullets(dtMs);

    // 5) 自機彈 vs 敵 / Boss
    this.resolvePlayerHits();

    // 6) 敵彈 vs 自機（被彈 + 擦彈）
    const sweep = sweepPlayerVsBullets(this.player, this.enemyBullets, this.mod.hitboxMult);
    if (sweep.grazes > 0) {
      this.od.addGraze(sweep.grazes, this.player.focus ? this.mod.focusGrazeBonus : 0);
      this.grazeChain += sweep.grazes;
      this.score += Math.round(SCORE.graze * sweep.grazes * chainMultiplier(this.grazeChain));
      this.events.push({ kind: 'graze', x: this.player.x, y: this.player.y });
    }
    if (sweep.hit) this.onPlayerHit();

    // 7) 金幣
    this.stepCoins(dtMs);

    // 8) Boss 擊破收尾
    if (this.bossSpawned && this.boss && !this.boss.state.alive) this.onBossDefeated();
  }

  // ---- 內部 ----
  private autoFire(dtMs: number): void {
    if (!this.player.alive) return;
    if (this.player.fireCdMs > 0) return;
    this.player.fireCdMs = this.od.isActive ? FIRE_INTERVAL_MS / 2 : FIRE_INTERVAL_MS;
    const dmg = PLAYER_BULLET_DMG * this.mod.atkMult * (this.od.isActive ? 1.5 : 1);
    const n = this.player.power;                 // 1..4 道
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 12;
      this.spawnPlayerBullet(this.player.x + off, this.player.y - 14, 0, -PLAYER_BULLET_SPEED, dmg, false);
    }
    if (this.mod.familiar) {
      this.spawnPlayerBullet(this.player.x - 26, this.player.y, 0, -PLAYER_BULLET_SPEED, dmg * 0.5, false);
      this.spawnPlayerBullet(this.player.x + 26, this.player.y, 0, -PLAYER_BULLET_SPEED, dmg * 0.5, false);
    }
    this.events.push({ kind: 'shoot' });
  }

  private spawnPlayerBullet(x: number, y: number, vx: number, vy: number, dmg: number, split: boolean): void {
    const b = this.playerBullets.find((it) => !it.active);
    if (!b) return;
    b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.dmg = dmg; b.split = split; b.active = true;
  }

  private stepPlayerBullets(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const b of this.playerBullets) {
      if (!b.active) continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -24 || b.x < -24 || b.x > FIELD_W + 24) b.active = false;
    }
  }

  private resolvePlayerHits(): void {
    for (const b of this.playerBullets) {
      if (!b.active) continue;
      // Boss 優先
      if (this.boss?.state.alive && circleHit(b.x, b.y, 2, this.boss.state.x, this.boss.state.y, BOSS_R)) {
        b.active = false;
        const changed = this.boss.damage(b.dmg);
        if (changed) this.events.push({ kind: 'bossPhase', id: this.boss.state.id, phase: this.boss.state.phase });
        this.maybeSplit(b);
        continue;
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (circleHit(b.x, b.y, 2, e.x, e.y, ENEMY_R)) {
          b.active = false;
          this.damageEnemy(e, b.dmg);
          this.maybeSplit(b);
          break;
        }
      }
    }
  }

  private maybeSplit(b: PlayerBullet): void {
    if (!this.mod.splitShot || b.split) return;
    const s = PLAYER_BULLET_SPEED * 0.8;
    this.spawnPlayerBullet(b.x, b.y, -s * 0.4, -s, b.dmg * 0.5, true);
    this.spawnPlayerBullet(b.x, b.y, s * 0.4, -s, b.dmg * 0.5, true);
  }

  private damageEnemy(e: Enemy, dmg: number): void {
    e.hp -= dmg;
    if (e.hp > 0) return;
    e.alive = false;
    this.score += Math.round(SCORE.enemy * chainMultiplier(this.grazeChain) * (this.od.isActive ? 2 : 1));
    this.coins.push({ x: e.x, y: e.y, vy: COIN_FALL_SPEED, active: true });
    this.events.push({ kind: 'enemyKill', x: e.x, y: e.y });
  }

  private stepCoins(dtMs: number): void {
    const dt = dtMs / 1000;
    const pickupR = this.mod.magnet ? COIN_MAGNET_R : COIN_PICKUP_R;
    for (const c of this.coins) {
      if (!c.active) continue;
      c.y += c.vy * dt;
      if (c.y > FIELD_H + 20) { c.active = false; continue; }
      if (circleHit(c.x, c.y, 8, this.player.x, this.player.y, pickupR)) {
        c.active = false;
        this.score += Math.round(SCORE.coin * chainMultiplier(this.grazeChain));
        this.coinCount++;
        if (this.coinCount % POWER_COINS === 0) gainPower(this.player);
        this.events.push({ kind: 'coin' });
      }
    }
    this.coins = this.coins.filter((c) => c.active);
  }

  private useInferno(): void {
    if (this.player.bombs <= 0 || !this.player.alive) return;
    this.player.bombs--;
    this.enemyBullets.clearAll();
    this.player.invulnMs = Math.max(this.player.invulnMs, INFERNO_INVULN_MS);
    for (const e of this.enemies) if (e.alive) this.damageEnemy(e, INFERNO_DMG);
    if (this.boss?.state.alive) {
      const changed = this.boss.damage(INFERNO_DMG);
      if (changed) this.events.push({ kind: 'bossPhase', id: this.boss.state.id, phase: this.boss.state.phase });
    }
    if (this.mod.fireField) this.fireFieldMs = FIRE_FIELD_MS;
    this.events.push({ kind: 'inferno' });
  }

  private useOverdrive(): void {
    if (!this.od.activate(this.mod.overdriveDurMult)) return;
    this.enemyBullets.clearAll();
    for (const e of this.enemies) if (e.alive) this.damageEnemy(e, INFERNO_DMG / 2);
    this.events.push({ kind: 'overdrive' });
  }

  private onPlayerHit(): void {
    this.od.onPlayerHit();
    this.grazeChain = 0;
    hitPlayer(this.player);
    // 防連死：清掉出生點附近的彈
    for (const b of this.enemyBullets.items) {
      if (b.active && circleHit(b.x, b.y, b.r, this.player.x, this.player.y, HIT_CLEAR_R)) b.active = false;
    }
    this.events.push({ kind: 'playerHit' });
    if (!this.player.alive) {
      this.status = 'gameover';
      this.events.push({ kind: 'gameover' });
    }
  }

  private onBossDefeated(): void {
    const id = this.boss!.state.id;
    this.boss = null;
    this.bossSpawned = false;
    this.enemyBullets.clearAll();
    this.score += SCORE.bossBonus;
    this.events.push({ kind: 'bossDefeat', id });
    if (this.stage === 4) {
      this.status = 'cleared';
      this.events.push({ kind: 'cleared' });
      return;
    }
    this.draftChoices = draftRelics(this.rng, this.relics);
    this.status = 'draft';
    this.events.push({ kind: 'draftOpen', choices: this.draftChoices });
  }

  private advanceStage(): void {
    this.stage = (this.stage + 1) as StageId;
    this.stageRunner = new StageRunner(this.stage);
    this.status = 'playing';
    this.events.push({ kind: 'stageStart', stage: this.stage });
  }

  // ---- 對外 ----
  drainEvents(): WitchEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  getState(): WitchState {
    return {
      status: this.status,
      stage: this.stage,
      player: { ...this.player },
      playerBullets: this.playerBullets,
      enemyBullets: this.enemyBullets.items,
      enemies: this.enemies,
      coins: this.coins,
      boss: this.boss ? { ...this.boss.state } : null,
      score: this.score,
      grazeChain: this.grazeChain,
      overdrive: { gauge: this.od.gauge, activeMs: this.od.activeMs },
      relics: [...this.relics],
      draftChoices: [...this.draftChoices],
      bellTolls: this.boss?.state.id === 'deadbell' ? this.boss.tolls : 0,
    };
  }

  // ---- 測試/除錯掛鉤（e2e 也用） ----
  debugFillOverdrive(): void { this.od.addGraze(1000, 0); }
  debugSetLives(n: number): void {
    this.player.lives = n;
    if (n <= 0) { this.player.invulnMs = 0; this.player.lives = 1; hitPlayer(this.player); if (!this.player.alive) { this.status = 'gameover'; this.events.push({ kind: 'gameover' }); } }
  }
  debugSkipToBoss(): void {
    this.stageRunner.step(30 * 60 * 1000);  // 跑完波次表
    this.enemies = [];
    this.enemyBullets.clearAll();
  }
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/engine/game.test.ts`
Expected: PASS（12 tests）

- [ ] **Step 7: 跑全部 witchrun 引擎測試（迴歸）**

Run: `npx vitest run src/scripts/games/witchrun`
Expected: 全部 PASS

- [ ] **Step 8: Commit**

```bash
git add src/scripts/games/witchrun/engine/
git commit -m "feat(witchrun): WitchGame 總狀態機（關卡流程/超載/遺物/續關）"
```

---

### Task 12: 渲染層（PixiJS，佔位紋理先可玩）

**Files:**
- Create: `src/scripts/games/witchrun/render/PixiStage.ts`
- Create: `src/scripts/games/witchrun/render/assets.ts`
- Create: `src/scripts/games/witchrun/render/BackgroundView.ts`
- Create: `src/scripts/games/witchrun/render/BulletView.ts`
- Create: `src/scripts/games/witchrun/render/EntityView.ts`
- Create: `src/scripts/games/witchrun/render/HudView.ts`
- Create: `src/scripts/games/witchrun/render/main.ts`

渲染層不寫單元測試（與 bomber 一致），驗收靠 E2E + 人工。本任務用「程式產生的佔位紋理」先讓遊戲可玩，正式素材在 Task 17 替換。

**佈局**：邏輯場域 480×640 等比縮放置中於 canvas，左右留黑邊放 HUD。換算：`scale = min(W/480, H/640)`、`offsetX = (W - 480*scale)/2`。

- [ ] **Step 1: 寫 PixiStage.ts（自 bomber 複製、改圖層）**

與 `src/scripts/games/bomber/render/PixiStage.ts` 相同骨架（CRT + bloom + shake），圖層改為：

```typescript
// 圖層：bgLayer（捲動背景）→ content[ entityLayer, bulletLayer, fxLayer, hudLayer ]
// bulletLayer 無濾鏡（彈幕數量大、保持銳利與效能）；fxLayer 強 bloom。
readonly bgLayer = new Container();
readonly content = new Container();
readonly entityLayer = new Container();
readonly bulletLayer = new Container();
readonly fxLayer = new Container();
readonly hudLayer = new Container();
```

其餘（`create()`、CRT 參數、`shake()`、`update()`）照抄 bomber 版本，`background` 色改 `'#0a0716'`（靛夜）。entityLayer 套 bomber 的輕 bloom；**bulletLayer 不套任何 filter**。

- [ ] **Step 2: 寫 assets.ts — 佔位紋理產生器**

```typescript
// assets.ts
import { Graphics, Texture, Container, type Renderer } from 'pixi.js';
import type { BulletKind, EnemyKind, BossId } from '../engine/types';

export interface WitchTextures {
  player: Texture;
  playerBullet: Texture;
  bullets: Record<BulletKind, Texture>;
  enemies: Record<EnemyKind, Texture>;
  bosses: Record<BossId, Texture>;
  coin: Texture;
}

function circleTex(renderer: Renderer, r: number, fill: number, line: number): Texture {
  const g = new Graphics().circle(0, 0, r).fill(fill).stroke({ width: 2, color: line });
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}
function diamondTex(renderer: Renderer, r: number, fill: number): Texture {
  const g = new Graphics().poly([0, -r, r, 0, 0, r, -r, 0]).fill(fill);
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

/** v1 佔位紋理（純幾何）。Task 17 改為載入 public/assets/games/witchrun/ 下的正式圖。 */
export function makePlaceholderTextures(renderer: Renderer): WitchTextures {
  const bullets: Record<BulletKind, Texture> = {
    rune: circleTex(renderer, 4, 0xff5a8a, 0xffd0e0),
    wave: circleTex(renderer, 6, 0x9a6bff, 0xe0d0ff),
    page: diamondTex(renderer, 5, 0xf0e6c8),
    gear: circleTex(renderer, 7, 0xd0a040, 0xffe0a0),
    wisp: circleTex(renderer, 4, 0x60c0ff, 0xd0f0ff),
    bell: circleTex(renderer, 6, 0xffd23f, 0xfff0c0),
  };
  const enemyColor: Record<EnemyKind, number> = {
    bat: 0x6a5acd, wisp: 0x87cefa, fairy: 0xba55d3,
    tome: 0x8b4513, blade: 0xc0c0c0, gear: 0xb8860b,
    angel: 0xeee8aa, moth: 0x9370db, chime: 0xdaa520,
  };
  const enemies = Object.fromEntries(
    (Object.keys(enemyColor) as EnemyKind[]).map((k) => [k, diamondTex(renderer, 14, enemyColor[k])]),
  ) as Record<EnemyKind, Texture>;
  const bosses = {
    gargoyle: circleTex(renderer, 36, 0x708090, 0xc0d0e0),
    grimoire: circleTex(renderer, 36, 0x8b0000, 0xffc0c0),
    bellwright: circleTex(renderer, 36, 0xb8860b, 0xffe080),
    deadbell: circleTex(renderer, 40, 0x4b0082, 0xffd23f),
  } satisfies Record<BossId, Texture>;
  return {
    player: diamondTex(renderer, 12, 0xff5a4d),     // Mira 緋紅
    playerBullet: circleTex(renderer, 3, 0xffb0a0, 0xffe0d0),
    bullets, enemies, bosses,
    coin: circleTex(renderer, 6, 0xffd700, 0xfff0a0),
  };
}
```

- [ ] **Step 3: 寫 BackgroundView.ts**

```typescript
// BackgroundView.ts
import { Container, Graphics } from 'pixi.js';

/** v1：純色漸層夜空 + 緩慢下移的星點（捲動感）。Task 17 換成 TilingSprite 正式背景。 */
export class BackgroundView {
  private stars: { g: Graphics; speed: number }[] = [];
  constructor(private layer: Container, private fieldW: number, private fieldH: number) {
    const bg = new Graphics().rect(0, 0, fieldW, fieldH).fill(0x0a0716);
    layer.addChild(bg);
    for (let i = 0; i < 40; i++) {
      const g = new Graphics().circle(0, 0, Math.random() < 0.3 ? 2 : 1).fill(0x6a5a9a);
      g.x = Math.random() * fieldW; g.y = Math.random() * fieldH;
      layer.addChild(g);
      this.stars.push({ g, speed: 30 + Math.random() * 60 });
    }
  }
  update(dtMs: number): void {
    for (const s of this.stars) {
      s.g.y += s.speed * (dtMs / 1000);
      if (s.g.y > this.fieldH) { s.g.y = -2; s.g.x = Math.random() * this.fieldW; }
    }
  }
}
```

- [ ] **Step 4: 寫 BulletView.ts（sprite 池對應引擎子彈池）**

```typescript
// BulletView.ts
import { Container, Sprite } from 'pixi.js';
import type { EnemyBullet, PlayerBullet } from '../engine/types';
import type { WitchTextures } from './assets';

/** 與引擎池等長的 sprite 池：index 對 index，active 控制 visible，零配置零 GC。 */
export class BulletView {
  private enemySprites: Sprite[] = [];
  private playerSprites: Sprite[] = [];

  constructor(private layer: Container, private tex: WitchTextures) {}

  render(enemyBullets: EnemyBullet[], playerBullets: PlayerBullet[]): void {
    this.sync(this.playerSprites, playerBullets.length, () => new Sprite(this.tex.playerBullet));
    this.sync(this.enemySprites, enemyBullets.length, () => new Sprite(this.tex.bullets.rune));
    for (let i = 0; i < playerBullets.length; i++) {
      const b = playerBullets[i], s = this.playerSprites[i];
      s.visible = b.active;
      if (b.active) { s.x = b.x; s.y = b.y; }
    }
    for (let i = 0; i < enemyBullets.length; i++) {
      const b = enemyBullets[i], s = this.enemySprites[i];
      s.visible = b.active;
      if (b.active) { s.texture = this.tex.bullets[b.kind]; s.x = b.x; s.y = b.y; }
    }
  }

  private sync(pool: Sprite[], n: number, make: () => Sprite): void {
    while (pool.length < n) {
      const s = make();
      s.anchor.set(0.5);
      s.visible = false;
      this.layer.addChild(s);
      pool.push(s);
    }
  }
}
```

- [ ] **Step 5: 寫 EntityView.ts**

```typescript
// EntityView.ts
import { Container, Sprite, Graphics } from 'pixi.js';
import type { WitchState } from '../engine/types';
import { GRAZE_R, PLAYER_HIT_R } from '../engine/constants';
import type { WitchTextures } from './assets';

export class EntityView {
  private player: Sprite;
  private hitDot: Graphics;        // 低速模式顯示判定點
  private boss: Sprite | null = null;
  private enemySprites = new Map<number, Sprite>();
  private coinSprites: Sprite[] = [];

  constructor(private layer: Container, private fx: Container, private tex: WitchTextures) {
    this.player = new Sprite(tex.player);
    this.player.anchor.set(0.5);
    layer.addChild(this.player);
    this.hitDot = new Graphics()
      .circle(0, 0, GRAZE_R).stroke({ width: 1, color: 0xff5a4d, alpha: 0.35 })
      .circle(0, 0, PLAYER_HIT_R + 1).fill(0xffffff);
    this.hitDot.visible = false;
    layer.addChild(this.hitDot);
  }

  render(s: WitchState, dtMs: number): void {
    // 自機（無敵中閃爍）
    this.player.x = s.player.x; this.player.y = s.player.y;
    this.player.alpha = s.player.invulnMs > 0 ? (Math.floor(s.player.invulnMs / 100) % 2 ? 0.3 : 0.9) : 1;
    this.hitDot.visible = s.player.focus;
    this.hitDot.x = s.player.x; this.hitDot.y = s.player.y;

    // 道中敵：以 id 同步 Map
    const seen = new Set<number>();
    for (const e of s.enemies) {
      seen.add(e.id);
      let sp = this.enemySprites.get(e.id);
      if (!sp) {
        sp = new Sprite(this.tex.enemies[e.kind]);
        sp.anchor.set(0.5);
        this.layer.addChild(sp);
        this.enemySprites.set(e.id, sp);
      }
      sp.x = e.x; sp.y = e.y;
    }
    for (const [id, sp] of this.enemySprites) {
      if (!seen.has(id)) { sp.destroy(); this.enemySprites.delete(id); }
    }

    // Boss
    if (s.boss && !this.boss) {
      this.boss = new Sprite(this.tex.bosses[s.boss.id]);
      this.boss.anchor.set(0.5);
      this.layer.addChild(this.boss);
    } else if (!s.boss && this.boss) {
      this.boss.destroy(); this.boss = null;
    }
    if (s.boss && this.boss) { this.boss.x = s.boss.x; this.boss.y = s.boss.y; }

    // 金幣（簡單池）
    while (this.coinSprites.length < s.coins.length) {
      const c = new Sprite(this.tex.coin);
      c.anchor.set(0.5);
      this.layer.addChild(c);
      this.coinSprites.push(c);
    }
    for (let i = 0; i < this.coinSprites.length; i++) {
      const sp = this.coinSprites[i], c = s.coins[i];
      sp.visible = !!c?.active;
      if (c?.active) { sp.x = c.x; sp.y = c.y; }
    }
  }
}
```

- [ ] **Step 6: 寫 HudView.ts**

```typescript
// HudView.ts
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { WitchState } from '../engine/types';
import { OVERDRIVE_MAX, FIELD_W } from '../engine/constants';
import { STAGES } from '../engine/stage';

const style = (size: number, fill: number) =>
  new TextStyle({ fontFamily: '"Press Start 2P", monospace', fontSize: size, fill });

export class HudView {
  private score = new Text({ text: '0', style: style(12, 0xeafdff) });
  private lives = new Text({ text: '', style: style(10, 0xff5a4d) });
  private bombs = new Text({ text: '', style: style(10, 0xffa040) });
  private stageName = new Text({ text: '', style: style(8, 0x9a8ac0) });
  private odBar = new Graphics();
  private odLabel = new Text({ text: 'OVERDRIVE', style: style(7, 0x36e6ff) });
  private bossBar = new Graphics();

  constructor(layer: Container) {
    this.score.x = 8; this.score.y = 8;
    this.lives.x = 8; this.lives.y = 30;
    this.bombs.x = 8; this.bombs.y = 48;
    this.stageName.x = 8; this.stageName.y = 66;
    this.odLabel.x = 8; this.odLabel.y = 600;
    layer.addChild(this.score, this.lives, this.bombs, this.stageName, this.odBar, this.odLabel, this.bossBar);
  }

  render(s: WitchState): void {
    this.score.text = String(s.score).padStart(8, '0');
    this.lives.text = '♥'.repeat(Math.max(0, s.player.lives));
    this.bombs.text = '✦'.repeat(Math.max(0, s.player.bombs));
    this.stageName.text = `STAGE ${s.stage} ${STAGES[s.stage].name}`;

    // OVERDRIVE 槽（底部）
    const pct = s.overdrive.activeMs > 0 ? 1 : s.overdrive.gauge / OVERDRIVE_MAX;
    this.odBar.clear()
      .rect(8, 612, 160, 10).stroke({ width: 1, color: 0x36e6ff })
      .rect(9, 613, 158 * pct, 8).fill(s.overdrive.activeMs > 0 ? 0xffd23f : pct >= 1 ? 0xff5a4d : 0x36e6ff);

    // Boss 血條（頂部置中）
    this.bossBar.clear();
    if (s.boss) {
      const w = FIELD_W - 120;
      this.bossBar
        .rect(60, 4, w, 6).stroke({ width: 1, color: 0xff5a8a })
        .rect(61, 5, (w - 2) * (s.boss.hp / s.boss.maxHp), 4).fill(0xff5a8a);
    }
  }
}
```

- [ ] **Step 7: 寫 main.ts — 掛載與事件迴圈**

```typescript
// main.ts
import { Container } from 'pixi.js';
import { WitchGame } from '../engine/game';
import { FIELD_W, FIELD_H } from '../engine/constants';
import { KEYMAP } from '../input/keymap';
import { attachTouch } from '../input/touch';
import { SoundManager } from '../audio/SoundManager';
import { PixiStage } from './PixiStage';
import { makePlaceholderTextures } from './assets';
import { BackgroundView } from './BackgroundView';
import { BulletView } from './BulletView';
import { EntityView } from './EntityView';
import { HudView } from './HudView';
import { RELICS } from '../engine/relics';
import type { RelicId } from '../engine/types';

export interface WitchHandle { game: WitchGame; destroy(): void; }

export async function startWitchrun(canvas: HTMLCanvasElement): Promise<WitchHandle> {
  const stage = await PixiStage.create(canvas);
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const game = new WitchGame({ seed });
  const sound = new SoundManager();

  try {
    await document.fonts.load('14px "Press Start 2P"');
    await document.fonts.ready;
  } catch { /* fallback monospace */ }

  const tex = makePlaceholderTextures(stage.app.renderer);
  const bg = new BackgroundView(stage.bgLayer, FIELD_W, FIELD_H);
  const bullets = new BulletView(stage.bulletLayer, tex);
  const entities = new EntityView(stage.entityLayer, stage.fxLayer, tex);
  const hud = new HudView(stage.hudLayer);

  // 場域等比縮放置中（bgLayer 與 content 同步變換）
  function relayout(): void {
    const scale = Math.min(stage.width / FIELD_W, stage.height / FIELD_H);
    for (const c of [stage.bgLayer, stage.content] as Container[]) {
      c.scale.set(scale);
      c.x = (stage.width - FIELD_W * scale) / 2;
      c.y = (stage.height - FIELD_H * scale) / 2;
    }
  }
  relayout();
  stage.app.renderer.on('resize', relayout);

  // ---- DOM overlays（遺物三選一 / game over / 過關）----
  const draftEl = document.getElementById('witch-draft');
  const draftBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-relic-slot]'));
  const overEl = document.getElementById('witch-over');
  const overStats = document.getElementById('witch-over-stats');
  const clearEl = document.getElementById('witch-clear');
  const clearStats = document.getElementById('witch-clear-stats');

  function showDraft(choices: RelicId[]): void {
    draftBtns.forEach((btn, i) => {
      const id = choices[i];
      btn.hidden = !id;
      if (!id) return;
      btn.dataset.relicId = id;
      const name = btn.querySelector('.relic-name');
      const desc = btn.querySelector('.relic-desc');
      if (name) name.textContent = RELICS[id].name;
      if (desc) desc.textContent = RELICS[id].desc;
    });
    draftEl?.removeAttribute('hidden');
  }
  const onDraftClick = (e: Event): void => {
    const id = (e.currentTarget as HTMLElement).dataset.relicId as RelicId | undefined;
    if (!id) return;
    draftEl?.setAttribute('hidden', '');
    game.pickRelic(id);
    sound.pickup();
  };
  draftBtns.forEach((b) => b.addEventListener('click', onDraftClick));

  document.getElementById('witch-continue')?.addEventListener('click', () => {
    overEl?.setAttribute('hidden', '');
    game.continueRun();
  });

  // ---- 鍵盤 ----
  const DIRS = new Set(['up', 'down', 'left', 'right']);
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyM') { e.preventDefault(); sound.ensure(); sound.toggle(); return; }
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    sound.ensure();
    if (action === 'focus') game.setFocus(true);
    else if (action === 'bomb' || action === 'overdrive') { if (!e.repeat) game.input(action); }
    else if (DIRS.has(action)) game.setHeld(action as 'up' | 'down' | 'left' | 'right', true);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const action = KEYMAP[e.code];
    if (action === 'focus') game.setFocus(false);
    else if (action && DIRS.has(action)) game.setHeld(action as 'up' | 'down' | 'left' | 'right', false);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  const detachTouch = attachTouch(canvas, game, () => sound.ensure());

  // ---- Ticker ----
  const tick = (ticker: { deltaMS: number }): void => {
    const dt = ticker.deltaMS;
    game.step(dt);
    for (const ev of game.drainEvents()) {
      if (ev.kind === 'shoot') { /* 每發都響太吵：射擊聲由 SoundManager 內部節流 */ sound.shoot(); }
      else if (ev.kind === 'graze') sound.graze();
      else if (ev.kind === 'overdrive') { stage.shake(10); sound.overdrive(); }
      else if (ev.kind === 'inferno') { stage.shake(12); sound.inferno(); }
      else if (ev.kind === 'enemyKill') { stage.shake(2); sound.kill(); }
      else if (ev.kind === 'playerHit') { stage.shake(14); sound.hit(); }
      else if (ev.kind === 'coin') sound.coin();
      else if (ev.kind === 'bossSpawn') { stage.shake(8); sound.alarm(); }
      else if (ev.kind === 'bossPhase') { stage.shake(8); sound.alarm(); }
      else if (ev.kind === 'bellToll') { stage.shake(6); sound.bell(); }
      else if (ev.kind === 'bossDefeat') { stage.shake(16); sound.inferno(); }
      else if (ev.kind === 'draftOpen') showDraft(ev.choices);
      else if (ev.kind === 'gameover') {
        sound.gameover();
        if (overStats) overStats.textContent = `STAGE ${game.getState().stage} · SCORE ${game.getState().score}`;
        overEl?.removeAttribute('hidden');
      } else if (ev.kind === 'cleared') {
        sound.clear();
        const s = game.getState();
        const best = Math.max(s.score, Number(localStorage.getItem('witchrun-best') ?? 0));
        localStorage.setItem('witchrun-best', String(best));
        if (clearStats) clearStats.textContent = `SCORE ${s.score} · BEST ${best}`;
        clearEl?.removeAttribute('hidden');
      }
    }
    const s = game.getState();
    bg.update(dt);
    bullets.render(s.enemyBullets, s.playerBullets);
    entities.render(s, dt);
    hud.render(s);
    stage.update(dt);
  };
  stage.app.ticker.add(tick);

  const handle: WitchHandle = {
    game,
    destroy(): void {
      stage.app.renderer.off('resize', relayout);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      detachTouch();
      stage.app.ticker.remove(tick);
      stage.app.destroy();
    },
  };
  (window as unknown as { __witchDebug?: unknown }).__witchDebug = { game, handle, stage };
  return handle;
}
```

- [ ] **Step 8: 型別檢查**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep witchrun || echo OK`
Expected: `OK`（render 檔案無型別錯誤；Task 13/14 的 input/audio 尚未建立會報錯——先建空殼或與 Task 13/14 同批提交）

> 注意：main.ts import 了 Task 13 的 `input/` 與 Task 14 的 `SoundManager` 新方法。實作順序上先完成 Task 13、14 再回來跑本步驟與 commit。

- [ ] **Step 9: Commit（與 Task 13/14 完成後一起）**

```bash
git add src/scripts/games/witchrun/render/
git commit -m "feat(witchrun): PixiJS 渲染層（佔位紋理可玩版）"
```

---

### Task 13: input/ — 鍵盤與觸控

**Files:**
- Create: `src/scripts/games/witchrun/input/keymap.ts`
- Create: `src/scripts/games/witchrun/input/touch.ts`
- Test: `src/scripts/games/witchrun/input/keymap.test.ts`

- [ ] **Step 1: 寫 keymap 失敗測試**

```typescript
// keymap.test.ts
import { describe, it, expect } from 'vitest';
import { KEYMAP } from './keymap';

describe('KEYMAP', () => {
  it('方向鍵與 WASD 對應移動', () => {
    expect(KEYMAP.ArrowUp).toBe('up');
    expect(KEYMAP.KeyW).toBe('up');
    expect(KEYMAP.ArrowLeft).toBe('left');
    expect(KEYMAP.KeyD).toBe('right');
  });
  it('Shift=focus、X/K=bomb、Z/J/Space=overdrive', () => {
    expect(KEYMAP.ShiftLeft).toBe('focus');
    expect(KEYMAP.KeyX).toBe('bomb');
    expect(KEYMAP.KeyK).toBe('bomb');
    expect(KEYMAP.KeyZ).toBe('overdrive');
    expect(KEYMAP.KeyJ).toBe('overdrive');
    expect(KEYMAP.Space).toBe('overdrive');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/witchrun/input/keymap.test.ts`
Expected: FAIL

- [ ] **Step 3: 寫 keymap.ts**

```typescript
// keymap.ts
import type { InputAction } from '../engine/types';

/** KeyboardEvent.code -> 遊戲動作。射擊為自動，無需按鍵。 */
export const KEYMAP: Record<string, InputAction> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'focus', ShiftRight: 'focus',
  KeyX: 'bomb', KeyK: 'bomb',
  KeyZ: 'overdrive', KeyJ: 'overdrive', Space: 'overdrive',
};
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/witchrun/input/keymap.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: 寫 touch.ts（拖曳相對移動 + 第二指低速）**

觸控不走 setHeld（離散方向），直接以相對位移驅動：在 game 上補一個 `nudge(dx, dy)` API——**先在 `engine/game.ts` 加**：

```typescript
  /** 觸控相對位移（px，邏輯座標）。直接鉗制在場內。 */
  nudge(dx: number, dy: number): void {
    if (this.status !== 'playing') return;
    this.player.x = Math.min(FIELD_W, Math.max(0, this.player.x + dx));
    this.player.y = Math.min(FIELD_H, Math.max(0, this.player.y + dy));
  }
```

並在 `game.test.ts` 補測試：

```typescript
  it('nudge 相對移動並鉗制', () => {
    const g = new WitchGame({ seed: 1 });
    const x0 = g.getState().player.x;
    g.nudge(-30, 0);
    expect(g.getState().player.x).toBe(x0 - 30);
    g.nudge(-99999, 0);
    expect(g.getState().player.x).toBe(0);
  });
```

touch.ts：

```typescript
// touch.ts
import type { WitchGame } from '../engine/game';
import { FIELD_W } from '../engine/constants';

/**
 * 單指拖曳=相對移動（1.6 倍增益，拇指不擋機體）；第二指按住=低速模式。
 * 畫面 DOM 按鈕（#witch-btn-bomb / #witch-btn-od）由本模組綁定。
 * 回傳解除函數。
 */
export function attachTouch(canvas: HTMLCanvasElement, game: WitchGame, onGesture: () => void): () => void {
  let lastX = 0, lastY = 0, primaryId: number | null = null;
  const GAIN = 1.6;

  const scale = (): number => {
    const rect = canvas.getBoundingClientRect();
    return FIELD_W / Math.min(rect.width, rect.height * (480 / 640));
  };

  const onStart = (e: TouchEvent): void => {
    e.preventDefault();
    onGesture();
    if (primaryId === null) {
      const t = e.changedTouches[0];
      primaryId = t.identifier; lastX = t.clientX; lastY = t.clientY;
    }
    if (e.touches.length >= 2) game.setFocus(true);
  };
  const onMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== primaryId) continue;
      const k = scale() * GAIN;
      game.nudge((t.clientX - lastX) * k, (t.clientY - lastY) * k);
      lastX = t.clientX; lastY = t.clientY;
    }
  };
  const onEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === primaryId) primaryId = null;
    }
    if (e.touches.length < 2) game.setFocus(false);
  };

  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onEnd);
  canvas.addEventListener('touchcancel', onEnd);

  const bombBtn = document.getElementById('witch-btn-bomb');
  const odBtn = document.getElementById('witch-btn-od');
  const onBomb = (): void => { onGesture(); game.input('bomb'); };
  const onOd = (): void => { onGesture(); game.input('overdrive'); };
  bombBtn?.addEventListener('click', onBomb);
  odBtn?.addEventListener('click', onOd);

  return () => {
    canvas.removeEventListener('touchstart', onStart);
    canvas.removeEventListener('touchmove', onMove);
    canvas.removeEventListener('touchend', onEnd);
    canvas.removeEventListener('touchcancel', onEnd);
    bombBtn?.removeEventListener('click', onBomb);
    odBtn?.removeEventListener('click', onOd);
  };
}
```

- [ ] **Step 6: 跑引擎測試（nudge 迴歸）並 Commit**

Run: `npx vitest run src/scripts/games/witchrun`
Expected: 全部 PASS

```bash
git add src/scripts/games/witchrun/input/ src/scripts/games/witchrun/engine/game.ts src/scripts/games/witchrun/engine/game.test.ts
git commit -m "feat(witchrun): 鍵盤 keymap 與觸控輸入（拖曳+雙指低速）"
```

---

### Task 14: audio/SoundManager.ts — 合成音效

**Files:**
- Create: `src/scripts/games/witchrun/audio/SoundManager.ts`

與 bomber 同骨架（`ensure()`/`toggle()`/`blip()`），不寫單元測試（純 Web Audio 副作用）。射擊聲內建節流（90ms 內不重複），避免 10 發/秒轟炸。

- [ ] **Step 1: 寫實作**

```typescript
// SoundManager.ts
/** Web Audio 合成 SFX；首次手勢 ensure() 解鎖。射擊聲節流。 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private lastShootAt = 0;

  ensure(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  toggle(): boolean { this.muted = !this.muted; return this.muted; }

  private blip(freq: number, durMs: number, type: OscillatorType = 'square', gain = 0.15, freqEnd?: number): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + durMs / 1000);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t); osc.stop(t + durMs / 1000 + 0.03);
  }

  shoot(): void {
    const now = performance.now();
    if (now - this.lastShootAt < 90) return;
    this.lastShootAt = now;
    this.blip(880, 40, 'square', 0.05);
  }
  graze(): void { this.blip(1320, 30, 'sine', 0.08); }
  overdrive(): void { this.blip(220, 500, 'sawtooth', 0.22, 880); this.blip(110, 400, 'triangle', 0.18); }
  inferno(): void { this.blip(90, 420, 'sawtooth', 0.25); this.blip(45, 500, 'triangle', 0.2); }
  kill(): void { this.blip(440, 80, 'square', 0.1, 110); }
  hit(): void { this.blip(140, 300, 'sawtooth', 0.25, 60); }
  coin(): void { this.blip(990, 60, 'square', 0.08); this.blip(1320, 70, 'square', 0.08); }
  alarm(): void { this.blip(660, 180, 'square', 0.15); this.blip(660, 180, 'square', 0.15); }
  bell(): void { this.blip(523, 900, 'sine', 0.2, 392); this.blip(1046, 600, 'sine', 0.08); }
  gameover(): void { this.blip(160, 600, 'sawtooth', 0.22, 50); }
  clear(): void { this.blip(523, 150, 'square', 0.15); this.blip(659, 150, 'square', 0.15); this.blip(784, 300, 'square', 0.15); }
}
```

- [ ] **Step 2: 型別檢查與 Commit（連同 Task 12 的 render）**

Run: `npx tsc --noEmit 2>&1 | grep witchrun || echo OK`
Expected: `OK`

```bash
git add src/scripts/games/witchrun/audio/ src/scripts/games/witchrun/render/
git commit -m "feat(witchrun): 渲染層+合成音效（佔位紋理可玩版）"
```

---

### Task 15: witchrun.astro 頁面 + 入口頁卡片

**Files:**
- Create: `src/pages/games/witchrun.astro`
- Modify: `src/pages/games/index.astro`（第三張卡）

- [ ] **Step 1: 寫 witchrun.astro**

結構：全螢幕 canvas + 標題畫面 overlay（START 鍵/Enter 開局）＋遺物三選一 overlay＋gameover/clear overlay＋觸控按鈕。禁止行內樣式與 `!important`（專案規範）。

```astro
---
/**
 * /games/witchrun — Dungeon Arcade: WITCH RUN
 * Mira 主演縱向彈幕。全螢幕 PixiJS，頁底腳本 code-split 載入。
 */
import BaseLayout from '@components/layout/BaseLayout.astro';
import { defaultLang, type Language } from '@i18n/index';

const lang: Language = defaultLang;
---

<BaseLayout title="Dungeon Arcade — Witch Run" description="像素縱向彈幕：詛咒鐘塔" lang={lang}>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" />

  <main class="witch">
    <canvas id="witch-canvas"></canvas>

    <!-- 標題畫面 -->
    <div class="witch-title" id="witch-title">
      <a class="witch-home" href="/games">← ARCADE</a>
      <h1 class="witch-logo">WITCH RUN</h1>
      <p class="witch-tagline">THE CURSED BELLTOWER</p>
      <p class="witch-story">月蝕之夜，亡鐘自鳴。爆彈魔女 Mira 騎上掃帚——在鐘聲敲滿十二響前，飛抵塔頂封印它。</p>
      <button class="witch-start" id="witch-start" type="button">START</button>
      <p class="witch-keys">MOVE 方向鍵/WASD · FOCUS Shift · BOMB X · OVERDRIVE Z</p>
    </div>

    <!-- 遺物三選一 -->
    <div class="witch-overlay" id="witch-draft" hidden>
      <h2 class="overlay-heading">CHOOSE A RELIC</h2>
      <div class="draft-row">
        <button class="relic-card" type="button" data-relic-slot="0">
          <span class="relic-name"></span><span class="relic-desc"></span>
        </button>
        <button class="relic-card" type="button" data-relic-slot="1">
          <span class="relic-name"></span><span class="relic-desc"></span>
        </button>
        <button class="relic-card" type="button" data-relic-slot="2">
          <span class="relic-name"></span><span class="relic-desc"></span>
        </button>
      </div>
    </div>

    <!-- Game Over -->
    <div class="witch-overlay" id="witch-over" hidden>
      <h2 class="overlay-heading">GAME OVER</h2>
      <p class="overlay-stats" id="witch-over-stats"></p>
      <button class="witch-start" id="witch-continue" type="button">CONTINUE</button>
      <a class="overlay-link" href="/games">BACK TO ARCADE</a>
    </div>

    <!-- 通關 -->
    <div class="witch-overlay" id="witch-clear" hidden>
      <h2 class="overlay-heading">THE BELL IS SEALED</h2>
      <p class="overlay-stats" id="witch-clear-stats"></p>
      <a class="overlay-link" href="/games">BACK TO ARCADE</a>
    </div>

    <!-- 觸控按鈕 -->
    <div class="witch-touch" aria-hidden="true">
      <button class="touch-btn" id="witch-btn-bomb" type="button">BOMB</button>
      <button class="touch-btn touch-btn--od" id="witch-btn-od" type="button">OD</button>
    </div>
  </main>
</BaseLayout>

<style>
  .witch {
    position: fixed;
    inset: 0;
    background: #0a0716;
    font-family: 'Press Start 2P', Consolas, monospace;
  }
  #witch-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

  .witch-title {
    position: absolute; inset: 0; z-index: 10;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
    background:
      radial-gradient(ellipse at 50% 20%, rgba(255, 90, 77, 0.12), transparent 55%),
      linear-gradient(180deg, rgba(10, 7, 22, 0.9), rgba(10, 7, 22, 0.97));
    padding: 24px; text-align: center;
  }
  .witch-home { position: absolute; top: 18px; left: 20px; font-size: 11px; color: #6fa8d8; text-decoration: none; }
  .witch-logo {
    margin: 0; font-size: clamp(24px, 6vw, 52px); letter-spacing: 6px; color: #ff5a4d;
    text-shadow: 0 0 14px rgba(255, 90, 77, 0.8), 0 0 40px rgba(255, 90, 77, 0.4);
  }
  .witch-tagline { margin: 0; font-size: 11px; letter-spacing: 4px; color: #9a8ac0; }
  .witch-story { max-width: 480px; font-size: 10px; line-height: 2; color: #c8bce0; }
  .witch-start {
    font-family: inherit; font-size: 14px; letter-spacing: 3px; color: #0a0716;
    background: #ff5a4d; border: none; border-radius: 8px; padding: 14px 38px; cursor: pointer;
    box-shadow: 0 0 18px rgba(255, 90, 77, 0.6);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .witch-start:hover { transform: translateY(-2px); box-shadow: 0 0 30px rgba(255, 90, 77, 0.9); }
  .witch-keys { font-size: 8px; letter-spacing: 1px; color: #6a5a9a; }

  .witch-overlay {
    position: absolute; inset: 0; z-index: 20;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
    background: rgba(10, 7, 22, 0.88); padding: 24px; text-align: center;
  }
  .witch-overlay[hidden] { display: none; }
  .overlay-heading { margin: 0; font-size: clamp(16px, 4vw, 28px); letter-spacing: 4px; color: #ffd23f; text-shadow: 0 0 12px rgba(255, 210, 63, 0.7); }
  .overlay-stats { font-size: 11px; color: #eafdff; letter-spacing: 2px; }
  .overlay-link { font-size: 10px; color: #6fa8d8; text-decoration: none; letter-spacing: 2px; }

  .draft-row { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
  .relic-card {
    width: 168px; min-height: 150px; display: flex; flex-direction: column; gap: 12px;
    align-items: center; justify-content: center; padding: 14px;
    font-family: inherit; cursor: pointer;
    background: rgba(26, 16, 48, 0.92); border: 2px solid rgba(154, 107, 255, 0.65); border-radius: 10px;
    box-shadow: 0 0 14px rgba(154, 107, 255, 0.3);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .relic-card:hover { transform: translateY(-4px); box-shadow: 0 0 26px rgba(154, 107, 255, 0.7); }
  .relic-name { font-size: 12px; color: #d0baff; letter-spacing: 1px; }
  .relic-desc { font-size: 9px; line-height: 1.8; color: #9a8ac0; }

  .witch-touch { position: absolute; right: 14px; bottom: 18px; z-index: 5; display: none; gap: 12px; }
  .touch-btn {
    width: 72px; height: 72px; border-radius: 50%; font-family: inherit; font-size: 10px;
    color: #ffd0c8; background: rgba(255, 90, 77, 0.25); border: 2px solid rgba(255, 90, 77, 0.7);
  }
  .touch-btn--od { color: #d0f4ff; background: rgba(54, 230, 255, 0.2); border-color: rgba(54, 230, 255, 0.7); }
  @media (pointer: coarse) { .witch-touch { display: flex; } }
</style>

<script>
  const canvas = document.getElementById('witch-canvas') as HTMLCanvasElement | null;
  const titleEl = document.getElementById('witch-title');
  const startBtn = document.getElementById('witch-start');
  let started = false;

  async function start(): Promise<void> {
    if (started || !canvas) return;
    started = true;
    titleEl?.remove();
    const { startWitchrun } = await import('@scripts/games/witchrun/render/main');
    await startWitchrun(canvas).catch((err: unknown) => console.error('[witchrun] start failed', err));
  }

  startBtn?.addEventListener('click', () => void start());
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (started) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void start(); }
  });

  // e2e 自動開局
  if (new URLSearchParams(location.search).get('autostart') === '1') void start();
</script>
```

- [ ] **Step 2: 改 index.astro 第三張卡**

把 `src/pages/games/index.astro` 的 games 陣列第三項：

```typescript
  { id: 'soon-2', title: 'COMING SOON', href: null, active: false, art: '/assets/games/tetris/coming-soon.webp' },
```

改為（卡圖在 Task 17 產出前先沿用 coming-soon 佔位，Task 17 再換 `card-witchrun.webp`）：

```typescript
  { id: 'witchrun', title: 'WITCH RUN', href: '/games/witchrun', active: true, art: '/assets/games/tetris/coming-soon.webp' },
```

- [ ] **Step 3: 開發伺服器人工驗證**

Run: `npm run dev`（背景）後開 http://localhost:4321/games/witchrun?autostart=1
Expected: 佔位幾何圖形版可玩——自機會動、敵人會出、彈幕會飛、HUD 會更新。

- [ ] **Step 4: Commit**

```bash
git add src/pages/games/witchrun.astro src/pages/games/index.astro
git commit -m "feat(witchrun): 遊戲頁面與遊戲廳入口卡片"
```

---

### Task 16: Playwright E2E

**Files:**
- Create: `tests/e2e/witchrun.spec.ts`

先看 `tests/e2e/` 既有 bomber/tetris spec 的寫法（baseURL、啟動方式）再對齊。核心案例：

- [ ] **Step 1: 寫 E2E 測試**

```typescript
// witchrun.spec.ts
import { test, expect } from '@playwright/test';

test.describe('witchrun', () => {
  test('標題畫面載入並可開局', async ({ page }) => {
    await page.goto('/games/witchrun');
    await expect(page.locator('#witch-title')).toBeVisible();
    await page.click('#witch-start');
    await expect(page.locator('#witch-title')).toHaveCount(0);
    // 引擎掛上 debug 鉤
    await page.waitForFunction(() => Boolean((window as any).__witchDebug?.game));
  });

  test('autostart=1 直接開局且狀態為 playing', async ({ page }) => {
    await page.goto('/games/witchrun?autostart=1');
    await page.waitForFunction(() => Boolean((window as any).__witchDebug?.game));
    const status = await page.evaluate(() => (window as any).__witchDebug.game.getState().status);
    expect(status).toBe('playing');
  });

  test('Boss 擊破打開遺物三選一 overlay', async ({ page }) => {
    await page.goto('/games/witchrun?autostart=1');
    await page.waitForFunction(() => Boolean((window as any).__witchDebug?.game));
    await page.evaluate(() => {
      const g = (window as any).__witchDebug.game;
      g.debugSkipToBoss(); g.step(16);
      g.boss.damage(999999); g.step(16);
    });
    await expect(page.locator('#witch-draft')).toBeVisible();
    await page.click('[data-relic-slot="0"]');
    await expect(page.locator('#witch-draft')).toBeHidden();
    const stage = await page.evaluate(() => (window as any).__witchDebug.game.getState().stage);
    expect(stage).toBe(2);
  });

  test('遊戲廳卡片可導向 witchrun', async ({ page }) => {
    await page.goto('/games');
    await page.click('a[href="/games/witchrun"]');
    await expect(page).toHaveURL(/witchrun/);
  });
});
```

> 注意：第 3 個案例依賴 ticker 持續推進——`g.step(16)` 後事件由下一個 ticker tick 消費，若 overlay 沒出現，改用 `page.waitForSelector('#witch-draft:not([hidden])')` 等待。

- [ ] **Step 2: 跑 E2E**

Run: `npx playwright test tests/e2e/witchrun.spec.ts`
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/witchrun.spec.ts
git commit -m "test(witchrun): E2E 開局/遺物/導覽流程"
```

---

### Task 17: 正式美術素材（nanobanana / Gemini 產圖）

**Files:**
- Create: `public/assets/games/witchrun/`（全部素材）
- Modify: `src/scripts/games/witchrun/render/assets.ts`（佔位紋理 → 載圖）
- Modify: `src/scripts/games/witchrun/render/BackgroundView.ts`（星點 → TilingSprite）
- Modify: `src/pages/games/index.astro`（卡圖換 `card-witchrun.webp`）

**執行方式**：用 `nanobanana-image-gen` skill（專案預設產圖管線）。關鍵既有經驗（見 memory）：
- 特效類素材要求「黑底」，再用亮度轉 alpha 去背（additive 流程），避免黑方框。
- 像素風 prompt 要鎖「16-bit pixel art, crisp pixels, no anti-aliasing」與固定調色（深靛藍 `#0a0716` 夜空、月蝕橙紅、Mira 緋紅 `#ff5a4d`）。
- Mira 一致性：用 `--ref public/assets/games/bomber/portraits/mira-full.png` 做參考圖鏈。
- sprite sheet 可先產單幀大圖再用 `convert`（無 magick，sandbox off）縮放裁切。

- [ ] **Step 1: 產自機 sprite（3 幀：直飛/左傾/右傾）**

以 mira-full.png 為 ref，prompt 核心：「16-bit pixel art sprite, top-down view of a young witch riding a broom flying upward, seen from behind-above, crimson witch hat with flame pattern, long orange hair streaming, dark indigo transparent-style black background, crisp pixels」。產出 `public/assets/games/witchrun/player.png`（橫向 3 幀 sheet）。

- [ ] **Step 2: 產敵兵與 Boss sprite**

9 種道中敵各 1 張、4 隻 Boss 各 1 張（deadbell 產 3 個 phase 差分）。檔名：`enemy-bat.png` … `enemy-chime.png`、`boss-gargoyle.png`、`boss-grimoire.png`、`boss-bellwright.png`、`boss-deadbell-p1.png`/`-p2.png`/`-p3.png`。

- [ ] **Step 3: 產直式捲動背景 ×4**

每關一張可垂直無縫平鋪的 480×960 背景（`bg-stage1.webp` … `bg-stage4.webp`）：墓園鐵門與霧、書架螺旋、齒輪熔爐、月蝕鐘樓。prompt 加「seamlessly tileable vertically」並用 `convert` 檢查上下緣接縫。

- [ ] **Step 4: 產子彈圖集與特效**

子彈 6 種（rune/wave/page/gear/wisp/bell）小圖示黑底產出後轉 alpha；爆炎/衝擊波特效黑底 additive。檔名 `bullet-<kind>.png`、`fx-inferno.png`、`fx-shockwave.png`。

- [ ] **Step 5: 產入口卡片與標題 logo**

`card-witchrun.webp`（220×280 直式構圖：Mira 騎掃帚衝向月蝕鐘塔）、`logo-witchrun.webp`。更新 `index.astro` 卡圖路徑。

- [ ] **Step 6: assets.ts 改為載圖**

`makePlaceholderTextures` 改名 `loadWitchTextures`，用 `Assets.load()`（pixi.js）載入上述檔案，回傳同一個 `WitchTextures` 介面（介面不變，呼叫端 `main.ts` 只改函數名）。背景改 `TilingSprite` 依關卡切換 `bg-stage<N>.webp`，`tilePosition.y` 隨時間遞增做捲動。

- [ ] **Step 7: 人工驗收與 Commit**

開 http://localhost:4321/games/witchrun?autostart=1 確認素材顯示正確、像素硬邊（`antialias: false` + `texture.source.scaleMode = 'nearest'`）。

```bash
git add public/assets/games/witchrun/ src/scripts/games/witchrun/render/ src/pages/games/index.astro
git commit -m "feat(witchrun): 正式像素美術素材（Gemini 產圖）"
```

---

### Task 18: 收尾驗證

- [ ] **Step 1: 全測試**

Run: `npm run test`
Expected: witchrun 全部單元測試 PASS、既有測試無回歸

- [ ] **Step 2: E2E 全跑**

Run: `npm run test:e2e`
Expected: PASS

- [ ] **Step 3: 生產編譯**

Run: `npm run build`
Expected: 成功，無型別錯誤

- [ ] **Step 4: 效能抽查**

開 DevTools Performance：第 3 關 Boss spiral4 高峰（200+ 彈）需穩 60fps。若掉幀：bulletLayer 改 `ParticleContainer`、或關 CRT filter 降級。

- [ ] **Step 5: 最終 Commit + PR**

```bash
git push -u origin feat/witchrun-bullet-hell
gh pr create --title "feat(games): WITCH RUN 像素縱向彈幕射擊" --body "..."
```

---

## Self-Review 紀錄

- **Spec 覆蓋**：故事/4 關/Boss 鐘波（Task 9-10）、低速+判定點（Task 2/12）、爆炎（Task 11）、OVERDRIVE（Task 5/11）、遺物 9 種（Task 7/11）、命數/續關/計分/本地紀錄（Task 11/12）、像素美術+產圖（Task 17）、合成音效（Task 14）、觸控（Task 13）、入口卡（Task 15）、E2E（Task 16）——全數對應。
- **型別一致性**：`SpawnSpec`（Task 3）為 pattern/enemy/boss 共用回傳型別；`Modifiers` 欄位與 `computeModifiers` 測試一致；`WitchTextures` 介面在 Task 17 載圖版保持不變。
- **已知簡化**：v1 無難度選擇、無線上榜、僅 Mira（spec YAGNI 區已列）。





