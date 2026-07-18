# 《商隊與劍》M1：引擎地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立《商隊與劍》的可測試引擎地基——種子化 RNG、d20 檢定、版本化存檔——以及可玩的遊戲外殼頁（標題畫面→開新檔→城鎮畫面雛形），並註冊進遊戲廳。

**Architecture:** 純 TS 引擎模組（`src/scripts/games/caravan/`）與 DOM UI 分離；所有隨機經種子化 RNG（測試可重現）；存檔 localStorage 版本化＋遷移表。UI 是 Astro 頁內 DOM/CSS，不用 Pixi。

**Tech Stack:** TypeScript、Astro 頁（`src/pages/games/caravan.astro`）、vitest（happy-dom）、Playwright e2e。

**Milestone 地圖（本計畫只含 M1；M2–M5 於前一里程碑完成後依同流程展開）：**
M1 引擎地基（本檔）→ M2 隊伍骰子戰鬥 → M3 遠征事件鏈＋迷宮 → M4 經濟＋傭兵團＋城鎮完整 UI → M5 內容資料 40 事件＋動漫平塗美術＋整合 e2e。

## Global Constraints

- 敘事與 UI 文字：繁體中文（可保留 HP/DC/Lv 等英文術語）；**不接** i18n 五語系統（spec §1）。
- 所有隨機必須經 `createRng(seed)` 產生的實例，禁止直接 `Math.random()`（spec §4.2）。
- 存檔 key：`caravan-save-v1`；schema 帶 `version` 欄位（spec §4.3）。
- UI 為 DOM/HTML+CSS，不用 Pixi/Canvas（spec §4.1）；樣式放頁內（本 repo 遊戲頁既有慣例），站級 SCSS 禁 `!important`／行內樣式規則照舊。
- 測試指令一律 `npx vitest run <path>`（`npm run test` 是 watch 會掛住）；e2e：`npx playwright test <spec> --project=chromium`。
- TDD：每個功能先寫失敗測試。Conventional Commits，署名 `Co-Authored-By: Claude <noreply@anthropic.com>`。

## File Structure（M1 鎖定）

```
src/scripts/games/caravan/
├── types.ts        # 共用型別：Stat/StatBlock（M1 最小集，後續里程碑擴充）
├── rng.ts          # 種子化 RNG（mulberry32）＋骰子/抽選 helpers
├── rng.test.ts
├── check.ts        # d20 檢定結算（nat1/nat20 規則）
├── check.test.ts
├── save.ts         # 版本化存檔/讀取/遷移/匯出匯入
└── save.test.ts
src/pages/games/caravan.astro   # 標題畫面→城鎮雛形；頁內 <style>
src/pages/games/index.astro     # 遊戲廳卡片註冊（modify）
tests/e2e/caravan.spec.ts       # 外殼流程 smoke
```

---

### Task 1: types.ts + rng.ts（種子化 RNG）

**Files:**
- Create: `src/scripts/games/caravan/types.ts`
- Create: `src/scripts/games/caravan/rng.ts`
- Test: `src/scripts/games/caravan/rng.test.ts`

**Interfaces:**
- Consumes: 無（首個任務）
- Produces:
  - `type Stat = 'str' | 'dex' | 'int' | 'cha' | 'con'`
  - `interface StatBlock { str: number; dex: number; int: number; cha: number; con: number }`
  - `interface Rng { next(): number; roll(sides: number): number; d20(): number; pick<T>(arr: readonly T[]): T; weightedPick<T>(items: ReadonlyArray<{ weight: number; value: T }>): T }`
  - `function createRng(seed: number): Rng`

- [ ] **Step 1: 寫失敗測試**

```ts
// src/scripts/games/caravan/rng.test.ts
import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng（種子化隨機）', () => {
  it('同種子產生相同序列（測試可重現的基石）', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('不同種子產生不同序列', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect([a.next(), a.next()]).not.toEqual([b.next(), b.next()]);
  });

  it('next() 落在 [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('roll(6) 產生 1..6 整數且六面都出現過', () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      const v = rng.roll(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('d20() 等同 roll(20)', () => {
    const a = createRng(5);
    const b = createRng(5);
    expect(a.d20()).toBe(b.roll(20));
  });

  it('pick 從陣列取元素且分布覆蓋全部', () => {
    const rng = createRng(11);
    const arr = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(rng.pick(arr));
    expect(seen).toEqual(new Set(['a', 'b', 'c']));
  });

  it('weightedPick 尊重權重（權重 0 永不出現、高權重壓倒性勝出）', () => {
    const rng = createRng(13);
    let heavy = 0;
    for (let i = 0; i < 1000; i++) {
      const v = rng.weightedPick([
        { weight: 0, value: 'never' },
        { weight: 1, value: 'rare' },
        { weight: 99, value: 'common' },
      ]);
      expect(v).not.toBe('never');
      if (v === 'common') heavy++;
    }
    expect(heavy).toBeGreaterThan(900);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/caravan/rng.test.ts`
Expected: FAIL（`Cannot find module './rng'`）

- [ ] **Step 3: 最小實作**

```ts
// src/scripts/games/caravan/types.ts
/** 五屬性：力量/敏捷/智力/魅力/體質 */
export type Stat = 'str' | 'dex' | 'int' | 'cha' | 'con';

export interface StatBlock {
  str: number;
  dex: number;
  int: number;
  cha: number;
  con: number;
}
```

```ts
// src/scripts/games/caravan/rng.ts
export interface Rng {
  /** [0, 1) */
  next(): number;
  /** 1..sides 整數骰 */
  roll(sides: number): number;
  d20(): number;
  pick<T>(arr: readonly T[]): T;
  weightedPick<T>(items: ReadonlyArray<{ weight: number; value: T }>): T;
}

/** mulberry32：小而夠用的種子化 PRNG，遊戲全部隨機都走這裡（禁直接 Math.random） */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const roll = (sides: number): number => Math.floor(next() * sides) + 1;
  return {
    next,
    roll,
    d20: () => roll(20),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weightedPick: (items) => {
      const total = items.reduce((sum, it) => sum + it.weight, 0);
      let cursor = next() * total;
      for (const it of items) {
        cursor -= it.weight;
        if (cursor < 0) return it.value;
      }
      return items[items.length - 1].value;
    },
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/caravan/rng.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/caravan/types.ts src/scripts/games/caravan/rng.ts src/scripts/games/caravan/rng.test.ts
git commit -m "feat(caravan): 種子化 RNG 與共用型別（M1）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: check.ts（d20 檢定結算）

**Files:**
- Create: `src/scripts/games/caravan/check.ts`
- Test: `src/scripts/games/caravan/check.test.ts`

**Interfaces:**
- Consumes: `Rng`（Task 1）、`Stat`（Task 1）
- Produces:
  - `interface CheckInput { stat: Stat; dc: number; modifier: number; bonus?: number }`
  - `interface CheckResult { die: number; total: number; dc: number; success: boolean; critical: 'success' | 'failure' | null }`
  - `function resolveCheck(rng: Rng, input: CheckInput): CheckResult`
  - 規則：total = die + modifier + (bonus ?? 0)；nat20 必成功（critical:'success'）、nat1 必失敗（critical:'failure'），其餘 total >= dc 成功。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/scripts/games/caravan/check.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCheck } from './check';
import type { Rng } from './rng';

/** 固定骰值的假 RNG——檢定測試只關心規則，不關心隨機 */
function fixedDie(value: number): Rng {
  return {
    next: () => 0,
    roll: () => value,
    d20: () => value,
    pick: (arr) => arr[0],
    weightedPick: (items) => items[0].value,
  };
}

describe('resolveCheck（d20 檢定）', () => {
  it('total >= dc 成功', () => {
    const r = resolveCheck(fixedDie(12), { stat: 'dex', dc: 14, modifier: 2 });
    expect(r).toEqual({ die: 12, total: 14, dc: 14, success: true, critical: null });
  });

  it('total < dc 失敗', () => {
    const r = resolveCheck(fixedDie(10), { stat: 'dex', dc: 14, modifier: 2 });
    expect(r.success).toBe(false);
    expect(r.critical).toBeNull();
  });

  it('bonus 疊加進 total', () => {
    const r = resolveCheck(fixedDie(10), { stat: 'cha', dc: 14, modifier: 2, bonus: 2 });
    expect(r.total).toBe(14);
    expect(r.success).toBe(true);
  });

  it('nat20 即使 total 不足也必成功', () => {
    const r = resolveCheck(fixedDie(20), { stat: 'str', dc: 99, modifier: 0 });
    expect(r.success).toBe(true);
    expect(r.critical).toBe('success');
  });

  it('nat1 即使 total 足夠也必失敗', () => {
    const r = resolveCheck(fixedDie(1), { stat: 'str', dc: 2, modifier: 10 });
    expect(r.success).toBe(false);
    expect(r.critical).toBe('failure');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/caravan/check.test.ts`
Expected: FAIL（`Cannot find module './check'`）

- [ ] **Step 3: 最小實作**

```ts
// src/scripts/games/caravan/check.ts
import type { Rng } from './rng';
import type { Stat } from './types';

export interface CheckInput {
  stat: Stat;
  dc: number;
  /** 屬性調整值 */
  modifier: number;
  /** 情境/隊伍加成 */
  bonus?: number;
}

export interface CheckResult {
  die: number;
  total: number;
  dc: number;
  success: boolean;
  critical: 'success' | 'failure' | null;
}

export function resolveCheck(rng: Rng, input: CheckInput): CheckResult {
  const die = rng.d20();
  const total = die + input.modifier + (input.bonus ?? 0);
  const critical = die === 20 ? 'success' : die === 1 ? 'failure' : null;
  const success = die === 20 ? true : die === 1 ? false : total >= input.dc;
  return { die, total, dc: input.dc, success, critical };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/caravan/check.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/caravan/check.ts src/scripts/games/caravan/check.test.ts
git commit -m "feat(caravan): d20 檢定結算——nat1/nat20 規則（M1）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: save.ts（版本化存檔）

**Files:**
- Create: `src/scripts/games/caravan/save.ts`
- Test: `src/scripts/games/caravan/save.test.ts`

**Interfaces:**
- Consumes: 無引擎依賴（獨立於 RNG）
- Produces:
  - `const SAVE_KEY = 'caravan-save-v1'`
  - `interface SaveDataV1 { version: 1; createdAt: number; gold: number; flags: Record<string, boolean> }`（M1 最小欄位；M2+ 里程碑透過遷移表擴充，不清玩家檔）
  - `function saveGame(data: SaveDataV1, storage?: Storage): void`
  - `function loadGame(storage?: Storage): SaveDataV1 | null`（無檔/毀損回 null；舊版本自動跑遷移表）
  - `function exportSave(data: SaveDataV1): string` / `function importSave(encoded: string): SaveDataV1 | null`（base64）
  - `function newGame(now?: number): SaveDataV1`（初始金幣 200）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/scripts/games/caravan/save.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SAVE_KEY, saveGame, loadGame, exportSave, importSave, newGame } from './save';

// happy-dom 提供 localStorage；每案例清空
beforeEach(() => localStorage.clear());

describe('save（版本化存檔）', () => {
  it('newGame 給出 v1 初始檔（金幣 200、無旗標）', () => {
    const s = newGame(1000);
    expect(s).toEqual({ version: 1, createdAt: 1000, gold: 200, flags: {} });
  });

  it('saveGame 後 loadGame 取回相同資料', () => {
    const s = newGame(1000);
    s.gold = 350;
    s.flags['met_guildmaster'] = true;
    saveGame(s);
    expect(loadGame()).toEqual(s);
  });

  it('無存檔時 loadGame 回 null', () => {
    expect(loadGame()).toBeNull();
  });

  it('毀損 JSON 回 null 而不是丟例外', () => {
    localStorage.setItem(SAVE_KEY, '{not json');
    expect(loadGame()).toBeNull();
  });

  it('缺 version 欄位視為毀損回 null', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ gold: 5 }));
    expect(loadGame()).toBeNull();
  });

  it('export → import 往返相等', () => {
    const s = newGame(1000);
    s.gold = 999;
    const roundTrip = importSave(exportSave(s));
    expect(roundTrip).toEqual(s);
  });

  it('import 垃圾字串回 null', () => {
    expect(importSave('not-base64!!!')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/caravan/save.test.ts`
Expected: FAIL（`Cannot find module './save'`）

- [ ] **Step 3: 最小實作**

```ts
// src/scripts/games/caravan/save.ts
export const SAVE_KEY = 'caravan-save-v1';

export interface SaveDataV1 {
  version: 1;
  createdAt: number;
  gold: number;
  flags: Record<string, boolean>;
}

const CURRENT_VERSION = 1;

/** 逐版遷移表：M2+ 擴充 schema 時在此補 (v) => v+1 的轉換，玩家不清檔 */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {};

export function newGame(now: number = Date.now()): SaveDataV1 {
  return { version: 1, createdAt: now, gold: 200, flags: {} };
}

export function saveGame(data: SaveDataV1, storage: Storage = localStorage): void {
  storage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function loadGame(storage: Storage = localStorage): SaveDataV1 | null {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    let parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') return null;
    while ((parsed.version as number) < CURRENT_VERSION) {
      const migrate = MIGRATIONS[parsed.version as number];
      if (!migrate) return null;
      parsed = migrate(parsed);
    }
    return parsed as unknown as SaveDataV1;
  } catch {
    return null;
  }
}

export function exportSave(data: SaveDataV1): string {
  return btoa(encodeURIComponent(JSON.stringify(data)));
}

export function importSave(encoded: string): SaveDataV1 | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(atob(encoded))) as SaveDataV1;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/caravan/save.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: 跑 caravan 全模組測試確認無互相破壞**

Run: `npx vitest run src/scripts/games/caravan/`
Expected: PASS（19 tests：rng 7 + check 5 + save 7）

- [ ] **Step 6: Commit**

```bash
git add src/scripts/games/caravan/save.ts src/scripts/games/caravan/save.test.ts
git commit -m "feat(caravan): 版本化存檔——遷移表/毀損防護/匯出匯入（M1）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 遊戲外殼頁 + 遊戲廳註冊 + e2e

**Files:**
- Create: `src/pages/games/caravan.astro`
- Modify: `src/pages/games/index.astro`（GAMES 陣列加一項；先讀該檔找到現有 tetris/bomber/witchrun 項目的確切結構後照格式加）
- Test: `tests/e2e/caravan.spec.ts`

**Interfaces:**
- Consumes: `newGame`/`saveGame`/`loadGame`（Task 3）
- Produces: 頁面 DOM 合約（e2e 與 M2+ 沿用）——`#screen-title`（標題畫面）、`#btn-new-game`、`#btn-continue`（無存檔時 `hidden` 屬性）、`#screen-town`（城鎮畫面，初始 `hidden`）、`#town-gold`（金幣數字文字）。

- [ ] **Step 1: 寫失敗 e2e**

```ts
// tests/e2e/caravan.spec.ts
import { test, expect } from '@playwright/test';

test.describe('商隊與劍：外殼流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/games/caravan');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('標題畫面載入：無存檔時「繼續旅程」隱藏', async ({ page }) => {
    await expect(page.locator('#screen-title')).toBeVisible();
    await expect(page.locator('#btn-new-game')).toBeVisible();
    await expect(page.locator('#btn-continue')).toBeHidden();
  });

  test('開新檔 → 城鎮畫面顯示初始金幣 200', async ({ page }) => {
    await page.click('#btn-new-game');
    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#screen-title')).toBeHidden();
    await expect(page.locator('#town-gold')).toHaveText('200');
  });

  test('開新檔後重新整理 → 「繼續旅程」可見且回到城鎮', async ({ page }) => {
    await page.click('#btn-new-game');
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#btn-continue')).toBeVisible();
    await page.click('#btn-continue');
    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#town-gold')).toHaveText('200');
  });

  test('遊戲廳有 CARAVAN & SWORD 卡片並連到遊戲', async ({ page }) => {
    await page.goto('/games');
    const card = page.locator('a[href="/games/caravan"]');
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.locator('#screen-title')).toBeVisible();
  });
});
```

- [ ] **Step 2: 跑 e2e 確認失敗**

Run: `npx playwright test tests/e2e/caravan.spec.ts --project=chromium --workers=1`
Expected: FAIL（/games/caravan 404）

- [ ] **Step 3: 建頁面（最小外殼）**

先 `Read src/pages/games/index.astro` 找 GAMES 陣列現有項目格式，照格式加入 `{ id: 'caravan', title: 'CARAVAN & SWORD', href: '/games/caravan', active: true, art: <暫用既有佔位圖或 null，照該檔其他項目的欄位慣例> }`。

```astro
---
// src/pages/games/caravan.astro
import BaseLayout from '@components/layout/BaseLayout.astro';

const pageTitle = '商隊與劍 | CARAVAN & SWORD';
---

<BaseLayout title={pageTitle} description="文字跑團 RPG：經營商隊與傭兵團，擲骰決定命運" lang="zh-TW">
  <main class="caravan-root">
    <!-- 標題畫面 -->
    <section id="screen-title" class="screen">
      <h1 class="game-title">商隊與劍</h1>
      <p class="game-subtitle">CARAVAN &amp; SWORD</p>
      <div class="title-actions">
        <button id="btn-new-game" class="caravan-btn">新的旅程</button>
        <button id="btn-continue" class="caravan-btn" hidden>繼續旅程</button>
      </div>
    </section>

    <!-- 城鎮畫面（M1 雛形；M4 完整化） -->
    <section id="screen-town" class="screen" hidden>
      <h2 class="town-name">啟程之鎮</h2>
      <p class="town-status">金幣 <span id="town-gold">0</span> G</p>
      <p class="town-hint">（城鎮功能將在後續里程碑開放）</p>
    </section>
  </main>
</BaseLayout>

<script>
  import { newGame, saveGame, loadGame } from '@scripts/games/caravan/save';

  const titleScreen = document.getElementById('screen-title')!;
  const townScreen = document.getElementById('screen-town')!;
  const btnNew = document.getElementById('btn-new-game')!;
  const btnContinue = document.getElementById('btn-continue')!;
  const goldEl = document.getElementById('town-gold')!;

  function showTown(gold: number): void {
    goldEl.textContent = String(gold);
    titleScreen.hidden = true;
    townScreen.hidden = false;
  }

  const existing = loadGame();
  if (existing) btnContinue.hidden = false;

  btnNew.addEventListener('click', () => {
    const save = newGame();
    saveGame(save);
    showTown(save.gold);
  });

  btnContinue.addEventListener('click', () => {
    const save = loadGame();
    if (save) showTown(save.gold);
  });
</script>

<style>
  .caravan-root {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f0e6; /* 淡色紙質底（動漫平塗配套的乾淨文庫基調） */
    color: #2b2620;
    font-family: 'Noto Serif TC', serif;
  }
  .screen { text-align: center; padding: 2rem; }
  .game-title { font-size: 3rem; letter-spacing: 0.3em; margin-bottom: 0.25rem; }
  .game-subtitle { letter-spacing: 0.5em; color: #8a7f6d; margin-bottom: 2.5rem; }
  .title-actions { display: flex; flex-direction: column; gap: 0.75rem; align-items: center; }
  .caravan-btn {
    font: inherit;
    padding: 0.6rem 2.5rem;
    border: 1px solid #2b2620;
    background: transparent;
    cursor: pointer;
    letter-spacing: 0.2em;
  }
  .caravan-btn:hover { background: #2b2620; color: #f5f0e6; }
  .town-name { font-size: 1.8rem; margin-bottom: 0.5rem; }
  .town-status { font-size: 1.1rem; }
  .town-hint { margin-top: 1.5rem; color: #8a7f6d; font-size: 0.9rem; }
</style>
```

- [ ] **Step 4: 跑 e2e 確認通過**

Run: `npx playwright test tests/e2e/caravan.spec.ts --project=chromium --workers=1`
Expected: PASS（4 tests）。若 dev server 4002 有快取異常，先重跑一次再照 `docs/claude/verify.md` 排查。

- [ ] **Step 5: 全套 vitest 確認無迴歸**

Run: `npx vitest run > /tmp/claude-vitest.log 2>&1; tail -5 /tmp/claude-vitest.log`
Expected: 全綠（既有 1176 + caravan 19）

- [ ] **Step 6: Commit**

```bash
git add src/pages/games/caravan.astro src/pages/games/index.astro tests/e2e/caravan.spec.ts
git commit -m "feat(caravan): 遊戲外殼頁——標題/開新檔/繼續/城鎮雛形＋遊戲廳註冊（M1）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## M1 完成判準（照 docs/claude/verify.md）

- [ ] `npx vitest run` 全套綠（不是只跑新增）
- [ ] `npx playwright test tests/e2e/caravan.spec.ts --project=chromium` 綠
- [ ] 實跑：dev server 開 `/games/caravan` 走一遍 新檔→城鎮→重整→繼續
- [ ] 回覆尾端附本地驗收 URL
- [ ] diff 只含本里程碑改動

## M2 預告（下一份計畫的輸入，非本計畫範圍）

M2 隊伍骰子戰鬥將消費：`Rng`/`resolveCheck`/`StatBlock`、存檔遷移表（v1→v2 加 roster 欄位）、`#screen-town` DOM 合約。屆時以同流程（writing-plans → 執行）展開。
