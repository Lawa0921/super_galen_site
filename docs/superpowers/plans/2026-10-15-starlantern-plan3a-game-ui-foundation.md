# 《星燈迷宮》計畫三 A：遊戲介面地基與試玩樣本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一頁可以試玩的新介面樣本：固定 640×360 遊戲畫面、像素字型、選單與輸入系統、遊戲視窗、標題畫面與城鎮選單，並產出 7 張美術樣張給使用者核准風格。

**Architecture:** 新介面先放在獨立的預覽頁 `/games/starlantern-next`（noindex），現有可玩的 `/games/starlantern` 不動，等計畫三後段把所有畫面做完再切換。畫面是一個 640×360 的容器，用 CSS 媒體查詢做整數倍放大（不寫行內樣式）；裡面是 DOM 遊戲視窗，畫面邏輯拆成純邏輯的選單模型、輸入對應與 scene。

**Tech Stack:** TypeScript、Astro、SCSS、Vitest（happy-dom）、Playwright、Python 美術工具（計畫二的 `sl_art.py`、`batch.py`）。

**Spec:** `docs/superpowers/specs/2026-10-15-starlantern-game-ui-design.md`（本計畫涵蓋第 10 節步驟 1–2）。

## Global Constraints

- 邏輯解析度 640×360（16:9）；整數倍放大、最少 1 倍；比 640×360 小時等比例縮小；多出的部分補黑邊置中。
- 網頁只剩黑底和遊戲畫面；不會捲動；沒有網站頁首或頁尾；保留 `noindex`。
- 字型「俐方體 11 號」（Cubic 11，SIL Open Font License 1.1），放在站內 `public/assets/fonts/`，附 OFL 授權檔；內文 12 px、行高 16 px。
- 操作：方向鍵／WASD 移動，Z／Enter／空白確認，X／Esc／Backspace 取消，C 開迷宮選單，A 全員攻擊，F11 全螢幕；滑鼠指到選項就移動游標、點擊確認，右鍵取消。
- 游標跳過不能選的項目、到頭繞回；游標、確認、取消、錯誤各有一種合成音效，遵循 `__arcadeAudio`。
- 不使用網頁按鈕外觀與 `<select>`；選項是有 `role="option"` 的清單項目。
- SCSS 禁 `!important`、禁行內樣式（含 JS 設定 `element.style`）。無 prettier/eslint。
- 美術全部由 codex 生成，經使用者核准才發布；不抄《世界樹迷宮》的圖、字型或框線紋飾；可翻譯文字不烘焙進圖（遊戲標題 logo 除外）。
- 測試：`npx vitest run`；e2e `E2E_PORT=4352 npx playwright test <spec> --project=chromium`；Python `python -m pytest art-factory/starlantern/tools -q`。瀏覽器 headless 並加 `--mute-audio`。
- 不 push、不 merge；commit 署名 `Co-Authored-By: Claude <noreply@anthropic.com>`。

## Review Focus

1. 視窗很小（手機直向 390×844）或很大（2560×1440）：畫面要完整可見、比例正確、沒有捲軸。→ Task 7 e2e 測三種視窗大小。
2. 字型下載失敗：退回系統字型，文字仍可讀、不錯位。→ Task 1 的字型宣告帶 fallback，Task 7 e2e 攔截字型請求驗證畫面仍出現。
3. 連按確認（或按住）讓對話框和選單重入：不能跳過兩層或重複進入場景。→ Task 4 對話框測試、Task 5 場景切換中忽略輸入的測試。
4. 選單全部項目都不能選：游標不能卡死或無限迴圈。→ Task 2 測試。
5. 滑鼠和鍵盤混用：滑鼠移到別的選項後按 Enter，要確認滑鼠指的那項。→ Task 3/4 測試。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `public/assets/fonts/cubic-11/Cubic_11.woff2`、`OFL.txt` | 像素字型與授權 |
| `src/pages/games/starlantern-next.astro` | 新介面預覽頁：黑底、`#sl-screen`（內含 `#sl-ui`） |
| `src/styles/_starlantern-ui.scss` | 新介面樣式：畫面縮放、字型、視窗、選單、對話框、場景 |
| `src/scripts/games/starlantern/ui2/menu.ts` | 選單模型（純邏輯） |
| `src/scripts/games/starlantern/ui2/input.ts` | 按鍵與指標轉成動作 |
| `src/scripts/games/starlantern/ui2/widgets.ts` | 視窗、選單視圖、對話框、確認框（DOM） |
| `src/scripts/games/starlantern/ui2/scene.ts` | `Scene` 介面與場景路由（淡出淡入、切換中忽略輸入） |
| `src/scripts/games/starlantern/ui2/scenes/title.ts`、`town.ts` | 標題畫面、城鎮選單 |
| `src/scripts/games/starlantern/ui2/main.ts` | 預覽頁進入點 |
| `src/scripts/games/starlantern/audio/SoundManager.ts` | 新增 `cursor()`、`confirm()`、`cancel()`、`error()` |
| `src/scripts/games/starlantern/data/text.zh-TW.ts` | 新增 `T.ui2` 文字（標題選單、設施、城鎮台詞） |
| `src/scripts/games/starlantern/render/artPaths.ts` | 新增 `art.scene()`、`art.npc()`、`art.logo`、`art.window`、`art.cursor` |
| `tests/e2e/starlantern-next.spec.ts` | 預覽頁 e2e |

新程式放在 `ui2/`，與現行 `ui/` 並存；計畫三後段完成所有畫面時再整併並刪除舊 `ui/`。

---

### Task 1: 字型、預覽頁與畫面縮放

**Files:** Create `public/assets/fonts/cubic-11/Cubic_11.woff2`、`public/assets/fonts/cubic-11/OFL.txt`、`src/pages/games/starlantern-next.astro`、`src/styles/_starlantern-ui.scss`、`src/scripts/games/starlantern/ui2/main.ts`；Test `tests/e2e/starlantern-next.spec.ts`。

**Interfaces:**
- Produces：頁面結構 `body.slx-body > main#sl-screen.slx-screen > div#sl-ui.slx-ui`；CSS class 前綴 `slx-`；`mountNext(): Promise<void>`（`ui2/main.ts`）。

- [ ] **Step 1: 下載字型與授權**

```bash
mkdir -p public/assets/fonts/cubic-11
curl -fsSL -o public/assets/fonts/cubic-11/Cubic_11.woff2 https://raw.githubusercontent.com/ACh-K/Cubic-11/main/fonts/web/Cubic_11.woff2
curl -fsSL -o public/assets/fonts/cubic-11/OFL.txt https://raw.githubusercontent.com/ACh-K/Cubic-11/main/OFL.txt
ls -la public/assets/fonts/cubic-11
```
Expected: `Cubic_11.woff2` 約 400 KB；`OFL.txt` 開頭為 `Copyright`，內含 `SIL OPEN FONT LICENSE Version 1.1`。

- [ ] **Step 2: 寫失敗的 e2e**

`tests/e2e/starlantern-next.spec.ts`：

```ts
import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--mute-audio'] } });

const box = (page: Page) => page.locator('#sl-screen').boundingBox();

test.describe('starlantern next ui', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'chromium only');

  for (const [w, h, scale] of [[1280, 720, 2], [1366, 768, 2], [2560, 1440, 4], [390, 844, 390 / 640]] as const) {
    test(`fits a ${w}x${h} window without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/games/starlantern-next');
      await expect(page.locator('#sl-screen')).toBeVisible();
      const b = (await box(page))!;
      expect(b.width).toBeCloseTo(640 * scale, 0);
      expect(b.height).toBeCloseTo(360 * scale, 0);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      const scroll = await page.evaluate(() => ({ x: document.documentElement.scrollWidth, y: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight }));
      expect(scroll.x).toBeLessThanOrEqual(scroll.w);
      expect(scroll.y).toBeLessThanOrEqual(scroll.h);
    });
  }

  test('uses the pixel font and still renders when it fails to load', async ({ page }) => {
    await page.goto('/games/starlantern-next');
    await page.waitForFunction(() => document.fonts.check('12px "Cubic 11"'));
    await page.route('**/Cubic_11.woff2', (r) => r.abort());
    await page.goto('/games/starlantern-next');
    await expect(page.locator('#sl-ui')).toBeVisible();
  });
});
```

- [ ] **Step 3: 確認失敗**

Run: `E2E_PORT=4352 npx playwright test tests/e2e/starlantern-next.spec.ts --project=chromium`
Expected: FAIL（頁面 404，`#sl-screen` 不存在）。

- [ ] **Step 4: 建立頁面、樣式與進入點**

`src/pages/games/starlantern-next.astro`：

```astro
---
import '../../styles/_starlantern-ui.scss';
---
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex" />
    <title>星燈迷宮 Starlantern</title>
    <link rel="preload" href="/assets/fonts/cubic-11/Cubic_11.woff2" as="font" type="font/woff2" crossorigin />
  </head>
  <body class="slx-body">
    <main id="sl-screen" class="slx-screen" aria-label="星燈迷宮">
      <div id="sl-ui" class="slx-ui"></div>
    </main>
    <script>
      import { mountNext } from '../../scripts/games/starlantern/ui2/main';
      void mountNext();
    </script>
  </body>
</html>
```

`src/styles/_starlantern-ui.scss`（縮放全用媒體查詢，不寫行內樣式）：

```scss
@font-face {
  font-family: 'Cubic 11';
  src: url('/assets/fonts/cubic-11/Cubic_11.woff2') format('woff2');
  font-display: swap;
}

$slx-w: 640px;
$slx-h: 360px;
$slx-ink: #f1ead8;
$slx-dim: #b7ae9a;
$slx-gold: #e8c46a;
$slx-win: rgba(10, 14, 34, 0.86);

html:has(.slx-body), .slx-body { height: 100%; margin: 0; overflow: hidden; background: #000; }
.slx-body { display: grid; place-items: center; }

.slx-screen {
  position: relative;
  width: $slx-w;
  height: $slx-h;
  overflow: hidden;
  background: #05060c;
  color: $slx-ink;
  font: 12px/16px 'Cubic 11', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
  image-rendering: pixelated;
  transform-origin: center;
  user-select: none;
}
.slx-ui { position: absolute; inset: 0; }

// Integer scales when the window has room; below 640x360 shrink proportionally.
@each $k in 2, 3, 4, 5, 6 {
  @media (min-width: $slx-w * $k) and (min-height: $slx-h * $k) {
    .slx-screen { transform: scale($k); }
  }
}
@media (max-width: $slx-w - 1px), (max-height: $slx-h - 1px) {
  .slx-screen { transform: scale(min(calc(100vw / 640px), calc(100vh / 360px))); }
}
```

註：最後一條的 `calc(100vw / 640px)` 需要 CSS 型別除法；若 chromium 測試在 390×844 時沒有縮小（Step 6 的 e2e 會抓到），改用 `@each $k in 0.95, 0.9, …, 0.5` 的寬度媒體查詢逐級縮小，並把 e2e 的期望值改成那一級的倍數，在 ledger 記一條 Ruling。

`src/scripts/games/starlantern/ui2/main.ts`：

```ts
export async function mountNext(): Promise<void> {
  const ui = document.getElementById('sl-ui');
  if (!ui) return;
  ui.dataset.ready = 'true';
}
```

- [ ] **Step 5: 在 `src/styles/` 的進入點登記新檔**

找到其他 `_starlantern.scss` 被引用的方式（`grep -rn "_starlantern" src/pages src/styles`）：遊戲頁是在 astro 裡直接 import，所以新頁面 Step 4 的 import 已足夠，不用改全站樣式。

- [ ] **Step 6: 確認通過**

Run: `E2E_PORT=4352 npx playwright test tests/e2e/starlantern-next.spec.ts --project=chromium`
Expected: 5 passed。

- [ ] **Step 7: Commit**

```bash
git add public/assets/fonts/cubic-11 src/pages/games/starlantern-next.astro src/styles/_starlantern-ui.scss src/scripts/games/starlantern/ui2/main.ts tests/e2e/starlantern-next.spec.ts
git commit -m "feat(starlantern): game screen preview page with pixel font and scaling

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 選單模型

**Files:** Create `src/scripts/games/starlantern/ui2/menu.ts`；Test `src/scripts/games/starlantern/ui2/menu.test.ts`。

**Interfaces:**
- Produces：`interface MenuItem { id: string; label: string; disabled?: boolean; note?: string }`；`class Menu { readonly items: MenuItem[]; cursor: number; constructor(items: MenuItem[], start?: number); move(delta: 1 | -1): boolean; setCursor(i: number): boolean; current(): MenuItem | null }`。

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, expect, it } from 'vitest';
import { Menu } from './menu';

const items = (...ids: (string | [string, boolean])[]) => ids.map((x) => (Array.isArray(x) ? { id: x[0], label: x[0], disabled: x[1] } : { id: x, label: x }));

describe('Menu', () => {
  it('starts on the first enabled item', () => {
    expect(new Menu(items(['a', true], 'b', 'c')).current()!.id).toBe('b');
  });

  it('moves, skips disabled items and wraps both ways', () => {
    const m = new Menu(items('a', ['b', true], 'c'));
    expect(m.move(1)).toBe(true); expect(m.current()!.id).toBe('c');
    expect(m.move(1)).toBe(true); expect(m.current()!.id).toBe('a');
    expect(m.move(-1)).toBe(true); expect(m.current()!.id).toBe('c');
  });

  it('does not move or loop forever when nothing can be chosen', () => {
    const m = new Menu(items(['a', true], ['b', true]));
    expect(m.current()).toBeNull();
    expect(m.move(1)).toBe(false);
    expect(m.current()).toBeNull();
  });

  it('reports no movement when only one item is enabled', () => {
    const m = new Menu(items(['a', true], 'b'));
    expect(m.move(1)).toBe(false);
    expect(m.current()!.id).toBe('b');
  });

  it('lets the pointer pick enabled items only', () => {
    const m = new Menu(items('a', ['b', true], 'c'));
    expect(m.setCursor(1)).toBe(false); expect(m.current()!.id).toBe('a');
    expect(m.setCursor(2)).toBe(true); expect(m.current()!.id).toBe('c');
    expect(m.setCursor(9)).toBe(false);
  });

  it('honours a requested start position when it is enabled', () => {
    expect(new Menu(items('a', 'b', 'c'), 2).current()!.id).toBe('c');
    expect(new Menu(items('a', ['b', true], 'c'), 1).current()!.id).toBe('c');
  });
});
```

- [ ] **Step 2: 確認失敗**

Run: `npx vitest run src/scripts/games/starlantern/ui2/menu.test.ts`
Expected: FAIL，`Failed to resolve import "./menu"`。

- [ ] **Step 3: 實作**

```ts
export interface MenuItem { id: string; label: string; disabled?: boolean; note?: string }

/** Cursor over a list: skips disabled items, wraps at both ends, never loops when nothing is selectable. */
export class Menu {
  cursor = -1;

  constructor(readonly items: MenuItem[], start = 0) {
    const n = items.length;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (!items[i].disabled) { this.cursor = i; break; }
    }
  }

  current(): MenuItem | null {
    return this.cursor >= 0 ? this.items[this.cursor] : null;
  }

  move(delta: 1 | -1): boolean {
    if (this.cursor < 0) return false;
    const n = this.items.length;
    for (let k = 1; k < n; k++) {
      const i = (this.cursor + delta * k + n * k) % n;
      if (!this.items[i].disabled) { this.cursor = i; return true; }
    }
    return false;
  }

  setCursor(i: number): boolean {
    if (i < 0 || i >= this.items.length || this.items[i].disabled || i === this.cursor) return i === this.cursor && i >= 0;
    this.cursor = i;
    return true;
  }
}
```

- [ ] **Step 4: 確認通過**

Run: `npx vitest run src/scripts/games/starlantern/ui2/menu.test.ts`
Expected: 6 passed。

- [ ] **Step 5: Commit**：`feat(starlantern): menu model for the game ui`。

---

### Task 3: 輸入對應與介面音效

**Files:** Create `src/scripts/games/starlantern/ui2/input.ts`；Modify `src/scripts/games/starlantern/audio/SoundManager.ts`；Test `src/scripts/games/starlantern/ui2/input.test.ts`。

**Interfaces:**
- Produces：`type UiAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu' | 'auto'`；`uiActionFor(key: string): UiAction | null`；`bindUiInput(target: Window, handler: (a: UiAction) => void): () => void`（`F11` 交給 `toggleFullscreen(el)`；`contextmenu` 轉成 `cancel` 並阻止選單）；`toggleFullscreen(el: HTMLElement): Promise<void>`；`SoundManager.cursor()`、`confirm()`、`cancel()`、`error()`。

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, expect, it, vi } from 'vitest';
import { bindUiInput, uiActionFor } from './input';

describe('uiActionFor', () => {
  it('maps the documented keys', () => {
    for (const [k, a] of [['ArrowUp', 'up'], ['w', 'up'], ['S', 'down'], ['a', 'left'], ['ArrowRight', 'right'], ['z', 'confirm'], ['Enter', 'confirm'], [' ', 'confirm'],
      ['x', 'cancel'], ['Escape', 'cancel'], ['Backspace', 'cancel'], ['c', 'menu'], ['C', 'menu'], ['q', null]] as const) {
      expect(uiActionFor(k), k).toBe(a);
    }
  });
});

describe('bindUiInput', () => {
  it('turns keys into actions, ignores key repeat for confirm and prevents the browser default', () => {
    const handler = vi.fn();
    const off = bindUiInput(window, handler);
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    window.dispatchEvent(down);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', cancelable: true }));
    expect(handler.mock.calls.map((c) => c[0])).toEqual(['down', 'confirm']);
    expect(down.defaultPrevented).toBe(true);
    off();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('treats a right click as cancel', () => {
    const handler = vi.fn();
    const off = bindUiInput(window, handler);
    const e = new MouseEvent('contextmenu', { cancelable: true });
    window.dispatchEvent(e);
    expect(handler).toHaveBeenCalledWith('cancel');
    expect(e.defaultPrevented).toBe(true);
    off();
  });
});
```

- [ ] **Step 2: 確認失敗**：`npx vitest run src/scripts/games/starlantern/ui2/input.test.ts` → `Failed to resolve import "./input"`。

- [ ] **Step 3: 實作**

```ts
export type UiAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu' | 'auto';

const KEYS: Record<string, UiAction> = {
  ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
  Enter: 'confirm', ' ': 'confirm', z: 'confirm', Z: 'confirm',
  Escape: 'cancel', Backspace: 'cancel', x: 'cancel', X: 'cancel', c: 'menu', C: 'menu',
};
const REPEATABLE = new Set<UiAction>(['up', 'down', 'left', 'right']);

export function uiActionFor(key: string): UiAction | null {
  return KEYS[key] ?? null;
}

export async function toggleFullscreen(el: HTMLElement): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  } catch (err) {
    console.warn('[starlantern] fullscreen unavailable', err);
  }
}

/** Keyboard and right-click to UI actions. Held confirm/cancel keys do not repeat, so a held key cannot skip dialogue. */
export function bindUiInput(target: Window, handler: (a: UiAction) => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'F11') { e.preventDefault(); void toggleFullscreen(document.getElementById('sl-screen') ?? document.documentElement); return; }
    const a = uiActionFor(e.key);
    if (!a) return;
    e.preventDefault();
    if (e.repeat && !REPEATABLE.has(a)) return;
    handler(a);
  };
  const onContext = (e: MouseEvent) => { e.preventDefault(); handler('cancel'); };
  target.addEventListener('keydown', onKey);
  target.addEventListener('contextmenu', onContext);
  return () => { target.removeEventListener('keydown', onKey); target.removeEventListener('contextmenu', onContext); };
}
```

註：`a`／`A` 在選單裡是「左」；戰鬥中的「全員攻擊」在計畫三後段的戰鬥 scene 另外處理（例如在指令視窗按住 Shift+A），屆時再擴充對應表。本計畫不使用 `auto`。

`SoundManager.ts` 在 `lose()` 前加：

```ts
  cursor(): void { this.blip(880, 28, 'square', 0.04); }
  confirm(): void { this.blip(660, 50, 'square', 0.07, 990); }
  cancel(): void { this.blip(440, 60, 'square', 0.06, 300); }
  error(): void { this.blip(140, 140, 'sawtooth', 0.08); }
```

- [ ] **Step 4: 確認通過**：`npx vitest run src/scripts/games/starlantern/ui2/input.test.ts src/scripts/games/audio-sfx-volume.test.ts` → 全過。

- [ ] **Step 5: Commit**：`feat(starlantern): ui input mapping and menu sound cues`。

---

### Task 4: 遊戲視窗元件（視窗、選單視圖、對話框、確認框）

**Files:** Create `src/scripts/games/starlantern/ui2/widgets.ts`；Modify `src/styles/_starlantern-ui.scss`；Test `src/scripts/games/starlantern/ui2/widgets.test.ts`。

**Interfaces:**
- Consumes：`Menu`、`MenuItem`（Task 2）、`UiAction`（Task 3）。
- Produces：
  - `win(cls: string, children?: Node[]): HTMLElement`（`div.slx-win.<cls>`）
  - `class MenuView { readonly el: HTMLElement; constructor(menu: Menu, on: { pick(item: MenuItem): void; moved?(): void; cancel?(): void }); onAction(a: UiAction): boolean; render(): void }`（清單 `ul[role=listbox] > li[role=option]`；選中 `aria-selected="true"` 與 class `slx-sel`；滑鼠 `pointerenter` 移游標並呼叫 `moved`、`click` 選取）
  - `class Dialogue { readonly el: HTMLElement; constructor(charsPerSecond: number); say(name: string, text: string): Promise<void>; onAction(a: UiAction): boolean; busy(): boolean }`（打字中按確認 → 一次顯示全部；顯示完再按確認 → resolve 並隱藏）
  - `confirmBox(question: string, on: (yes: boolean) => void): { el: HTMLElement; view: MenuView }`

- [ ] **Step 1: 寫失敗測試**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from './menu';
import { Dialogue, MenuView, confirmBox } from './widgets';

const mk = () => new Menu([{ id: 'a', label: '冒險者公會' }, { id: 'b', label: '道具店', disabled: true }, { id: 'c', label: '旅館' }]);

describe('MenuView', () => {
  it('renders options, moves with keys, picks with confirm', () => {
    const pick = vi.fn(); const moved = vi.fn();
    const v = new MenuView(mk(), { pick, moved });
    const opts = [...v.el.querySelectorAll('[role=option]')];
    expect(opts.map((o) => o.textContent)).toEqual(['冒險者公會', '道具店', '旅館']);
    expect(opts[1].getAttribute('aria-disabled')).toBe('true');
    expect(v.onAction('down')).toBe(true);
    expect(v.el.querySelector('[aria-selected=true]')!.textContent).toBe('旅館');
    expect(moved).toHaveBeenCalledTimes(1);
    v.onAction('confirm');
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    expect(v.el.querySelector('button, select')).toBeNull();
  });

  it('follows the pointer, so Enter confirms the hovered option', () => {
    const pick = vi.fn();
    const v = new MenuView(mk(), { pick });
    const opts = v.el.querySelectorAll('[role=option]');
    opts[2].dispatchEvent(new Event('pointerenter'));
    v.onAction('confirm');
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    opts[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('passes cancel to its owner', () => {
    const cancel = vi.fn();
    const v = new MenuView(mk(), { pick: vi.fn(), cancel });
    expect(v.onAction('cancel')).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('Dialogue', () => {
  afterEach(() => vi.useRealTimers());

  it('types out, completes on the first confirm and closes on the second', async () => {
    vi.useFakeTimers();
    const d = new Dialogue(20);
    const done = vi.fn();
    void d.say('露米亞', '暮霧又濃了些。').then(done);
    expect(d.el.hidden).toBe(false);
    expect(d.el.querySelector('.slx-name')!.textContent).toBe('露米亞');
    await vi.advanceTimersByTimeAsync(100);
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('暮霧');
    expect(d.onAction('confirm')).toBe(true);
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('暮霧又濃了些。');
    expect(done).not.toHaveBeenCalled();
    d.onAction('confirm');
    await vi.runAllTimersAsync();
    expect(done).toHaveBeenCalledTimes(1);
    expect(d.el.hidden).toBe(true);
    expect(d.busy()).toBe(false);
  });

  it('ignores input when idle and shows text at once when the speed is instant', async () => {
    const d = new Dialogue(Infinity);
    expect(d.onAction('confirm')).toBe(false);
    void d.say('', '立即');
    expect(d.el.querySelector('.slx-text')!.textContent).toBe('立即');
  });
});

describe('confirmBox', () => {
  it('answers yes or no and treats cancel as no', () => {
    const on = vi.fn();
    const box = confirmBox('要花 120 G 住宿嗎？', on);
    expect(box.el.textContent).toContain('要花 120 G 住宿嗎？');
    box.view.onAction('confirm');
    expect(on).toHaveBeenLastCalledWith(true);
    box.view.onAction('cancel');
    expect(on).toHaveBeenLastCalledWith(false);
  });
});
```

- [ ] **Step 2: 確認失敗**：`npx vitest run src/scripts/games/starlantern/ui2/widgets.test.ts` → `Failed to resolve import "./widgets"`。

- [ ] **Step 3: 實作 `widgets.ts`**

```ts
import { el } from '../ui/dom';
import type { UiAction } from './input';
import { Menu, type MenuItem } from './menu';

export function win(cls: string, children: Node[] = []): HTMLElement {
  return el('div', { class: `slx-win ${cls}` }, children);
}

export class MenuView {
  readonly el: HTMLElement;
  private list: HTMLElement;

  constructor(readonly menu: Menu, private on: { pick(item: MenuItem): void; moved?(): void; cancel?(): void }) {
    this.list = el('ul', { class: 'slx-menu', attrs: { role: 'listbox' } });
    this.el = this.list;
    this.render();
  }

  render(): void {
    this.list.replaceChildren(...this.menu.items.map((item, i) => {
      const li = el('li', { class: i === this.menu.cursor ? 'slx-opt slx-sel' : 'slx-opt', text: item.label, attrs: {
        role: 'option', 'aria-selected': String(i === this.menu.cursor), 'aria-disabled': String(!!item.disabled), 'data-id': item.id,
      } });
      li.addEventListener('pointerenter', () => { if (this.menu.setCursor(i) && i === this.menu.cursor) { this.render(); this.on.moved?.(); } });
      li.addEventListener('click', () => { if (!item.disabled && this.menu.setCursor(i)) { this.render(); this.on.pick(item); } });
      return li;
    }));
  }

  onAction(a: UiAction): boolean {
    if (a === 'up' || a === 'down') {
      if (this.menu.move(a === 'down' ? 1 : -1)) { this.render(); this.on.moved?.(); }
      return true;
    }
    if (a === 'confirm') { const it = this.menu.current(); if (it) this.on.pick(it); return true; }
    if (a === 'cancel' && this.on.cancel) { this.on.cancel(); return true; }
    return false;
  }
}

export class Dialogue {
  readonly el: HTMLElement;
  private name = el('b', { class: 'slx-name' });
  private text = el('span', { class: 'slx-text' });
  private full = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private resolve: (() => void) | null = null;

  constructor(private charsPerSecond: number) {
    this.el = win('slx-talk', [this.name, this.text]);
    this.el.hidden = true;
    this.el.setAttribute('aria-live', 'polite');
  }

  busy(): boolean { return this.resolve !== null; }

  say(name: string, text: string): Promise<void> {
    this.stop();
    this.full = text;
    this.name.textContent = name;
    this.name.hidden = !name;
    this.el.hidden = false;
    if (!Number.isFinite(this.charsPerSecond)) this.text.textContent = text;
    else {
      let n = 0;
      this.text.textContent = '';
      this.timer = setInterval(() => {
        n += 1;
        this.text.textContent = [...this.full].slice(0, n).join('');
        if (n >= [...this.full].length) this.stop();
      }, 1000 / this.charsPerSecond);
    }
    return new Promise((r) => { this.resolve = r; });
  }

  onAction(a: UiAction): boolean {
    if (!this.resolve || a !== 'confirm') return false;
    if (this.timer) { this.stop(); this.text.textContent = this.full; return true; }
    const r = this.resolve;
    this.resolve = null;
    this.el.hidden = true;
    r();
    return true;
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function confirmBox(question: string, on: (yes: boolean) => void): { el: HTMLElement; view: MenuView } {
  const view = new MenuView(new Menu([{ id: 'yes', label: '是' }, { id: 'no', label: '否' }]), {
    pick: (it) => on(it.id === 'yes'),
    cancel: () => on(false),
  });
  return { el: win('slx-confirm', [el('p', { text: question }), view.el]), view };
}
```

`_starlantern-ui.scss` 追加視窗、選單、對話框、確認框的樣式（邊框先用 CSS 暫代，Task 6 的視窗邊框圖核准後換成 `border-image`）：

```scss
.slx-win {
  position: absolute;
  background: $slx-win;
  border: 2px solid #c9a35a;
  box-shadow: inset 0 0 0 1px #6e5a2e, 0 2px 8px rgba(0, 0, 0, 0.5);
  border-radius: 3px;
  padding: 6px 8px;
  animation: slx-open 0.12s ease-out;
}
@keyframes slx-open { from { transform: scaleY(0.2); opacity: 0; } to { transform: none; opacity: 1; } }
.slx-menu { list-style: none; margin: 0; padding: 0; }
.slx-opt { position: relative; padding: 2px 8px 2px 16px; cursor: pointer; }
.slx-opt[aria-disabled='true'] { color: #6f6a5c; cursor: default; }
.slx-sel { color: $slx-gold; background: linear-gradient(90deg, rgba(232, 196, 106, 0.2), transparent); }
.slx-sel::before { content: '▶'; position: absolute; left: 3px; font-size: 8px; animation: slx-nudge 0.6s steps(2) infinite; }
@keyframes slx-nudge { 50% { transform: translateX(2px); } }
.slx-talk { left: 12px; right: 12px; bottom: 10px; min-height: 52px; padding: 10px 12px 8px; }
.slx-name { position: absolute; top: -9px; left: 10px; padding: 0 6px; background: $slx-win; border: 1px solid #c9a35a; color: $slx-gold; font-weight: normal; }
.slx-confirm { left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: 200px; text-align: center; }
.slx-confirm p { margin: 0 0 6px; }
@media (prefers-reduced-motion: reduce) { .slx-win, .slx-sel::before { animation: none; } }
```

- [ ] **Step 4: 確認通過**：`npx vitest run src/scripts/games/starlantern/ui2` → 全過。

- [ ] **Step 5: Commit**：`feat(starlantern): game windows, menu view, dialogue and confirm box`。

---

### Task 5: 場景路由、標題畫面、城鎮選單

**Files:** Create `ui2/scene.ts`、`ui2/scenes/title.ts`、`ui2/scenes/town.ts`；Modify `ui2/main.ts`、`data/text.zh-TW.ts`、`render/artPaths.ts`、`_starlantern-ui.scss`；Test `ui2/scene.test.ts`、`ui2/scenes/title.test.ts`、`ui2/scenes/town.test.ts`。

**Interfaces:**
- Consumes：`Game`（`engine/game.ts`）、`TextureBank`／`ArtIndex`（`render/textures.ts`）、`SoundManager`、Task 2–4。
- Produces：
  - `type SceneName = 'title' | 'town'`（計畫三後段擴充）
  - `interface Scene { enter(root: HTMLElement): void; exit(): void; onAction(a: UiAction): void }`
  - `interface SceneCtx { game: Game; art: ArtIndex; sfx: Pick<SoundManager, 'cursor' | 'confirm' | 'cancel' | 'error'>; go(name: SceneName): void; hasSave(): boolean; newGame(): void }`
  - `class Router { constructor(root: HTMLElement, make: (name: SceneName, ctx: SceneCtx) => Scene, ctx: Omit<SceneCtx, 'go'>, fadeMs?: number); go(name: SceneName): Promise<void>; onAction(a: UiAction): void; current(): SceneName | null }`（切換期間的輸入一律忽略）
  - `art.scene(id: 'title' | 'town' | 'guild' | 'shop' | 'inn' | 'gate')`、`art.npc(id: 'guild' | 'shop' | 'inn' | 'gate', mood: 'normal' | 'happy')`、`art.logo`、`art.window`、`art.cursor`
  - `T.ui2`：`title: { newGame, cont, settings, overwrite }`、`town: { place, facilities: { guild, shop, inn, gate, settings }, lines: string[], soon: (name: string) => string }`

- [ ] **Step 1: 寫失敗測試**

`ui2/scene.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { Router, type Scene } from './scene';

const fake = (log: string[], name: string): Scene => ({
  enter: (root) => { log.push(`enter ${name}`); root.append(document.createElement('div')); },
  exit: () => log.push(`exit ${name}`),
  onAction: (a) => log.push(`${name}:${a}`),
});

describe('Router', () => {
  it('switches scenes, routes actions to the current one and ignores input while fading', async () => {
    const log: string[] = [];
    const root = document.createElement('div');
    const r = new Router(root, (n) => fake(log, n), {} as never, 0);
    await r.go('title');
    r.onAction('down');
    const switching = r.go('town');
    r.onAction('confirm');
    await switching;
    r.onAction('up');
    expect(log).toEqual(['enter title', 'title:down', 'exit title', 'enter town', 'town:up']);
    expect(r.current()).toBe('town');
    expect(root.childElementCount).toBe(1);
  });
});
```

`ui2/scenes/title.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { TitleScene } from './title';

const ctx = (hasSave: boolean) => ({
  game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() },
  go: vi.fn(), hasSave: () => hasSave, newGame: vi.fn(),
});

describe('TitleScene', () => {
  it('disables continue without a save and starts a new game straight away', () => {
    const c = ctx(false); const root = document.createElement('div');
    const s = new TitleScene(c); s.enter(root);
    const opts = [...root.querySelectorAll('[role=option]')];
    expect(opts.map((o) => o.textContent)).toEqual(['新遊戲', '繼續', '設定']);
    expect(opts[1].getAttribute('aria-disabled')).toBe('true');
    s.onAction('confirm');
    expect(c.newGame).toHaveBeenCalled();
    expect(c.go).toHaveBeenCalledWith('town');
  });

  it('starts on continue when a save exists and asks before overwriting it', () => {
    const c = ctx(true); const root = document.createElement('div');
    const s = new TitleScene(c); s.enter(root);
    expect(root.querySelector('[aria-selected=true]')!.textContent).toBe('繼續');
    s.onAction('up');       // 新遊戲
    s.onAction('confirm');
    expect(root.textContent).toContain('覆蓋');
    expect(root.querySelector('.slx-confirm [aria-selected=true]')!.textContent).toBe('否');
    s.onAction('confirm');  // 否 is the default, so a double press cannot overwrite the save
    expect(c.newGame).not.toHaveBeenCalled();
    expect(root.querySelector('.slx-confirm')).toBeNull();
    s.onAction('confirm');  // 新遊戲 again
    s.onAction('up');       // 是
    s.onAction('confirm');
    expect(c.newGame).toHaveBeenCalledTimes(1);
    expect(c.go).toHaveBeenCalledWith('town');
  });

  it('continues into town', () => {
    const c = ctx(true); const root = document.createElement('div');
    const s = new TitleScene(c); s.enter(root);
    s.onAction('confirm');
    expect(c.go).toHaveBeenCalledWith('town');
    expect(c.newGame).not.toHaveBeenCalled();
  });
});
```

`ui2/scenes/town.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/game';
import { constRng } from '../../engine/testing';
import { NO_ART } from '../../render/textures';
import { TownScene } from './town';

describe('TownScene', () => {
  it('shows place, gold and the facility menu with a greeting', () => {
    const game = new Game(constRng(0.5), null);
    const root = document.createElement('div');
    const s = new TownScene({ game, art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go: vi.fn(), hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    expect(root.querySelector('.slx-place')!.textContent).toBe('邊境小鎮 露米亞');
    expect(root.querySelector('.slx-gold')!.textContent).toBe('150 G');
    expect([...root.querySelectorAll('[role=option]')].map((o) => o.textContent)).toEqual(['冒險者公會', '道具店', '旅館', '迷宮入口', '設定']);
    expect(root.querySelector('.slx-talk .slx-text')!.textContent!.length).toBeGreaterThan(0);
  });

  it('answers a facility with a not-yet line, closes it with confirm, and returns to title on cancel', () => {
    const go = vi.fn();
    const root = document.createElement('div');
    const s = new TownScene({ game: new Game(constRng(0.5), null), art: NO_ART, sfx: { cursor: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), error: vi.fn() }, go, hasSave: () => false, newGame: vi.fn() }, Infinity);
    s.enter(root);
    s.onAction('confirm');               // greeting closes
    s.onAction('confirm');               // 冒險者公會
    expect(root.querySelector('.slx-talk .slx-text')!.textContent).toContain('冒險者公會');
    s.onAction('down');                  // dialogue open: menu must not move
    s.onAction('confirm');               // close line
    expect(root.querySelector('[aria-selected=true]')!.textContent).toBe('冒險者公會');
    s.onAction('cancel');
    expect(go).toHaveBeenCalledWith('title');
  });
});
```

- [ ] **Step 2: 確認失敗**：`npx vitest run src/scripts/games/starlantern/ui2` → 三個新檔找不到模組。

- [ ] **Step 3: 實作**

`text.zh-TW.ts` 在 `T` 物件末端加：

```ts
  ui2: {
    title: { newGame: '新遊戲', cont: '繼續', settings: '設定', overwrite: '已有存檔，開始新遊戲會覆蓋它。要繼續嗎？' },
    town: {
      place: '邊境小鎮 露米亞',
      facilities: { guild: '冒險者公會', shop: '道具店', inn: '旅館', gate: '迷宮入口', settings: '設定' },
      lines: ['暮霧又濃了些。冒險者們，今天要往哪裡去？', '聽說迷宮深處有星燈的光。', '補給品記得在出發前備齊。'],
      soon: (name: string) => `${name}的新介面正在製作中，下一階段開放。`,
    },
  },
```

`artPaths.ts`：在 `art` 物件加入：

```ts
  scene: (id: 'title' | 'town' | 'guild' | 'shop' | 'inn' | 'gate') => `${ART_BASE}/scene/${id}.png`,
  npc: (id: 'guild' | 'shop' | 'inn' | 'gate', mood: 'normal' | 'happy') => `${ART_BASE}/npc/${id}${mood === 'happy' ? '-happy' : ''}.png`,
  logo: `${ART_BASE}/ui/logo.png`,
  window: `${ART_BASE}/ui/window.png`,
  cursor: `${ART_BASE}/ui/cursor.png`,
```

（`allArtUrls` 與登錄表在 Task 6 一起擴充。）

`ui2/scene.ts`：

```ts
import type { Game } from '../engine/game';
import type { SoundManager } from '../audio/SoundManager';
import type { ArtIndex } from '../render/textures';
import type { UiAction } from './input';

export type SceneName = 'title' | 'town';
export interface Scene { enter(root: HTMLElement): void; exit(): void; onAction(a: UiAction): void }
export interface SceneCtx {
  game: Game; art: ArtIndex; sfx: Pick<SoundManager, 'cursor' | 'confirm' | 'cancel' | 'error'>;
  go(name: SceneName): void; hasSave(): boolean; newGame(): void;
}

/** One scene at a time; fades out and in, and drops input while switching so held keys cannot skip a screen. */
export class Router {
  private scene: Scene | null = null;
  private name: SceneName | null = null;
  private switching = false;

  constructor(private root: HTMLElement, private make: (name: SceneName, ctx: SceneCtx) => Scene, private ctx: Omit<SceneCtx, 'go'>, private fadeMs = 300) {}

  current(): SceneName | null { return this.name; }

  async go(name: SceneName): Promise<void> {
    this.switching = true;
    this.root.classList.add('slx-fade');
    await this.wait();
    this.scene?.exit();
    this.root.replaceChildren();
    this.scene = this.make(name, { ...this.ctx, go: (n) => { void this.go(n); } });
    this.name = name;
    this.scene.enter(this.root);
    this.root.classList.remove('slx-fade');
    await this.wait();
    this.switching = false;
  }

  onAction(a: UiAction): void {
    if (!this.switching) this.scene?.onAction(a);
  }

  private wait(): Promise<void> {
    return this.fadeMs > 0 ? new Promise((r) => setTimeout(r, this.fadeMs / 2)) : Promise.resolve();
  }
}
```

`ui2/scenes/title.ts`：

```ts
import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { MenuView, confirmBox, win } from '../widgets';

export class TitleScene implements Scene {
  private view!: MenuView;
  private ask: MenuView | null = null;
  private root!: HTMLElement;

  constructor(private ctx: SceneCtx) {}

  enter(root: HTMLElement): void {
    this.root = root;
    const t = T.ui2.title;
    const menu = new Menu([
      { id: 'new', label: t.newGame }, { id: 'cont', label: t.cont, disabled: !this.ctx.hasSave() }, { id: 'settings', label: t.settings, disabled: true },
    ], this.ctx.hasSave() ? 1 : 0);
    this.view = new MenuView(menu, { pick: (it) => this.pick(it.id), moved: () => this.ctx.sfx.cursor() });
    const bg = this.ctx.art.has(art.scene('title')) ? [el('img', { class: 'slx-bg', attrs: { src: art.scene('title'), alt: '' } })] : [];
    const logo = this.ctx.art.has(art.logo) ? el('img', { class: 'slx-logo', attrs: { src: art.logo, alt: '星燈迷宮' } }) : el('h1', { class: 'slx-logo-text', text: '星燈迷宮' });
    root.append(el('div', { class: 'slx-scene slx-title' }, [...bg, logo, win('slx-title-menu', [this.view.el])]));
  }

  exit(): void {}

  onAction(a: UiAction): void {
    if (this.ask) { this.ask.onAction(a); return; }
    this.view.onAction(a);
  }

  private pick(id: string): void {
    this.ctx.sfx.confirm();
    if (id === 'cont') { this.ctx.go('town'); return; }
    if (id !== 'new') return;
    if (!this.ctx.hasSave()) { this.ctx.newGame(); this.ctx.go('town'); return; }
    const box = confirmBox(T.ui2.title.overwrite, (yes) => {
      box.el.remove();
      this.ask = null;
      if (yes) { this.ctx.newGame(); this.ctx.go('town'); } else this.ctx.sfx.cancel();
    });
    box.view.menu.setCursor(1);
    box.view.render();
    this.ask = box.view;
    this.root.append(box.el);
  }
}
```

註：確認框預設游標停在「否」，避免連按確認誤覆蓋存檔。

`ui2/scenes/town.ts`：

```ts
import { T } from '../../data/text.zh-TW';
import { art } from '../../render/artPaths';
import { el } from '../../ui/dom';
import type { UiAction } from '../input';
import { Menu } from '../menu';
import type { Scene, SceneCtx } from '../scene';
import { Dialogue, MenuView, win } from '../widgets';

const FACILITIES = ['guild', 'shop', 'inn', 'gate', 'settings'] as const;

export class TownScene implements Scene {
  private view!: MenuView;
  private talk: Dialogue;

  constructor(private ctx: SceneCtx, charsPerSecond = 30) {
    this.talk = new Dialogue(charsPerSecond);
  }

  enter(root: HTMLElement): void {
    const t = T.ui2.town;
    const menu = new Menu(FACILITIES.map((id) => ({ id, label: t.facilities[id] })));
    this.view = new MenuView(menu, { pick: (it) => this.pick(it.label), moved: () => this.ctx.sfx.cursor(), cancel: () => { this.ctx.sfx.cancel(); this.ctx.go('title'); } });
    const bg = this.ctx.art.has(art.scene('town')) ? [el('img', { class: 'slx-bg', attrs: { src: art.scene('town'), alt: '' } })] : [];
    root.append(el('div', { class: 'slx-scene slx-town' }, [
      ...bg,
      win('slx-place', [document.createTextNode(t.place)]),
      win('slx-gold', [document.createTextNode(`${this.ctx.game.state.gold} G`)]),
      win('slx-town-menu', [this.view.el]),
      this.talk.el,
    ]));
    void this.talk.say(t.place.split(' ').pop() ?? '', t.lines[Math.floor(this.ctx.game.rng() * t.lines.length)]);
  }

  exit(): void {}

  onAction(a: UiAction): void {
    if (this.talk.busy()) { this.talk.onAction(a); return; }
    this.view.onAction(a);
  }

  private pick(label: string): void {
    this.ctx.sfx.confirm();
    void this.talk.say('', T.ui2.town.soon(label));
  }
}
```

註：`win('slx-place', …)` 與 `win('slx-gold', …)` 產生 `.slx-win.slx-place`，測試用 `.slx-place`、`.slx-gold` 選取，`textContent` 只有文字節點，符合期望。

`ui2/main.ts` 改為：

```ts
import { SoundManager } from '../audio/SoundManager';
import { Game } from '../engine/game';
import { mulberry32 } from '../engine/rng';
import { SAVE_KEY } from '../engine/save';
import { TextureBank, loadManifest } from '../render/textures';
import { bindUiInput } from './input';
import { Router, type SceneName } from './scene';
import { TitleScene } from './scenes/title';
import { TownScene } from './scenes/town';

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export async function mountNext(): Promise<void> {
  const ui = document.getElementById('sl-ui');
  if (!ui) return;
  const storage = safeStorage();
  let game = Game.boot(mulberry32(Date.now() >>> 0), storage);
  const sfx = new SoundManager();
  const bank = new TextureBank();
  const make = (name: SceneName, ctx: Parameters<ConstructorParameters<typeof Router>[1]>[1]) =>
    name === 'title' ? new TitleScene(ctx) : new TownScene(ctx);
  const ctx = {
    get game() { return game; },
    art: bank, sfx,
    hasSave: () => { try { return !!storage?.getItem(SAVE_KEY); } catch { return false; } },
    newGame: () => { game = new Game(mulberry32(Date.now() >>> 0), storage); },
  };
  const router = new Router(ui, make, ctx);
  bindUiInput(window, (a) => { sfx.ensure(); router.onAction(a); });
  ui.dataset.ready = 'true';
  await router.go('title');
  void loadManifest().then((urls) => bank.preload(urls)).then(() => { void router.go(router.current() ?? 'title'); });
}
```

註：`SAVE_KEY` 已由 `engine/save.ts` export（計畫一 `save.test.ts` 有 import）。`SoundManager.ensure()` 是計畫一既有的方法，用來在第一次使用者操作後建立 AudioContext；若名稱不同，用實際的方法名並記 Ruling。美術載完後重新進入目前的場景，讓背景圖出現。

`_starlantern-ui.scss` 追加場景版面：

```scss
.slx-ui { transition: opacity 0.15s linear; }
.slx-ui.slx-fade { opacity: 0; }
.slx-scene { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 30%, #1d2340, #05060c 70%); }
.slx-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.slx-title .slx-logo { position: absolute; left: 50%; top: 40px; width: 360px; transform: translateX(-50%); }
.slx-title .slx-logo-text { position: absolute; left: 0; right: 0; top: 70px; margin: 0; text-align: center; font-size: 48px; line-height: 56px; color: $slx-gold; font-weight: normal; text-shadow: 0 3px 0 #000; }
.slx-title-menu { left: 50%; top: 220px; transform: translateX(-50%); min-width: 140px; }
.slx-place { left: 12px; top: 10px; font-size: 16px; line-height: 20px; color: $slx-ink; }
.slx-gold { right: 12px; top: 10px; color: $slx-gold; }
.slx-town-menu { left: 12px; top: 48px; min-width: 150px; }
```

- [ ] **Step 4: 確認通過**：`npx vitest run src/scripts/games/starlantern` → 全過；`npx tsc --noEmit -p . 2>&1 | grep -c starlantern` → `0`。

- [ ] **Step 5: e2e 加上鍵盤流程**（附加在 `tests/e2e/starlantern-next.spec.ts`）

```ts
  test('plays title → town with the keyboard only', async ({ page }) => {
    await page.goto('/games/starlantern-next');
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('新遊戲');
    await expect(page.locator('.slx-title [role=option]').nth(1)).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await expect(page.locator('.slx-town')).toBeVisible();
    await expect(page.locator('.slx-place')).toHaveText('邊境小鎮 露米亞');
    await page.keyboard.press('z');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.slx-town [aria-selected=true]')).toHaveText('道具店');
    await page.keyboard.press('Escape');
    await expect(page.locator('.slx-title')).toBeVisible();
    expect(await page.locator('#sl-screen button, #sl-screen select').count()).toBe(0);
  });
```

Run: `E2E_PORT=4352 npx playwright test tests/e2e/starlantern-next.spec.ts --project=chromium` → 6 passed。

- [ ] **Step 6: 實機截圖**：headless（`--mute-audio`）在 1280×720 截標題與城鎮兩張，看字型、視窗、游標是否正常。

- [ ] **Step 7: Commit**：`feat(starlantern): scene router with playable title and town menu`。

---

### Task 6: 7 張美術樣張（使用者核准關卡）

**Files:** Modify `art-factory/starlantern/tools/seed_registry.py`、`registry.json`（用 `migrate` 方式追加，不重建）、`tools/batch.py`、`contract.md`、`render/artPaths.ts`（`allArtUrls`）、`render/published.test.ts`；Create `art-factory/starlantern/prompts/{scene-title,ui-logo,scene-town,scene-guild,npc-guild,ui-window,ui-cursor}.txt`。

**Interfaces:**
- Produces：登錄表新增 17 個 id（本任務只生成其中 7 個）：`scene-title`、`scene-town`、`scene-guild`、`scene-shop`、`scene-inn`、`scene-gate`、`ui-logo`、`ui-window`、`ui-cursor`、`npc-guild`、`npc-guild-happy`、`npc-shop`、`npc-shop-happy`、`npc-inn`、`npc-inn-happy`、`npc-gate`、`npc-gate-happy`；runtime 路徑同 Task 5 的 `art.*`；`allArtUrls()` 總數 183。

- [ ] **Step 1: 寫失敗測試**
  - `test_sl_art.py` 的 seeded 測試：總數 183，且 `assets['npc-guild-happy']['runtime'] == '/assets/games/starlantern/npc/guild-happy.png'`、`assets['scene-title']['runtime'] == '/assets/games/starlantern/scene/title.png'`。
  - `artPaths.test.ts`：總數 183，並 `expect(urls).toContain(art.window)`。
  - `published.test.ts` 改成：「manifest 的每個 URL 都在 `allArtUrls()` 裡且檔案存在」＋「登錄表中 status 為 published 的每個 runtime 都在 manifest 裡」（不再要求全部已發布）。

  Run 兩邊測試 → seeded 與 artPaths 因數量不符失敗。

- [ ] **Step 2: 實作**
  - `seed_registry.py` 的 `build()` 加：

    ```python
    for s in ['title', 'town', 'guild', 'shop', 'inn', 'gate']: put(f'scene-{s}', 'opaque', f'scene/{s}.png')
    for n in ['guild', 'shop', 'inn', 'gate']:
        put(f'npc-{n}', 'sprite', f'npc/{n}.png'); put(f'npc-{n}-happy', 'sprite', f'npc/{n}-happy.png')
    put('ui-logo', 'sprite', 'ui/logo.png'); put('ui-window', 'sprite', 'ui/window.png'); put('ui-cursor', 'sprite', 'ui/cursor.png')
    ```
  - 用 `python -c` 呼叫 `seed_registry.build()`，把缺的 id 以 `setdefault` 加進現有 `registry.json`，不動既有 166 筆。`ui-window` 加上 `allow_edge: [left, top, right, bottom]`（邊框本來就頂到四邊），NPC 半身像加 `allow_edge: [bottom]`。
  - `artPaths.ts` 的 `allArtUrls()` 末尾加 6 個 scene、8 個 npc、logo、window、cursor。
  - 跑測試 → 全過。

- [ ] **Step 3: 寫 7 份 prompt 並排進 `batch.py`**（風格錨點：已核准的 `bg-f1`、絲嘉蕾立繪；高度：場景 `--block 4` 不透明；NPC 半身 `height 160`；logo `height 90`；cursor `height 12`；視窗框 sprite、不縮放判斷改用 `--block 4`）
  - `scene-title`：暮霧中的邊境小鎮露米亞，遠景是發出星燈光芒的迷宮裂口，16:9 像素風景，無人物、無文字。
  - `scene-town`：露米亞街道全景，石板路、木造屋、遠方的迷宮裂口與暮色，16:9，無人物、無文字。
  - `scene-guild`：冒險者公會室內，木頭櫃台、委託布告欄、吊燈，16:9，畫面右側留空給 NPC，無文字。
  - `npc-guild`：原創角色，公會櫃台小姐，二十多歲、溫和幹練、短髮、制服背心，半身像面向左，magenta 背景。
  - `ui-logo`：「星燈迷宮」四個字的遊戲標題 logo，金色描邊與星燈圖樣，magenta 背景（固定標題可烘焙文字）。
  - `ui-window`：48×48 像素的視窗框，深藍半透明感的框內留純 magenta（中央會去背成透明，由 CSS 填色），金色細框、四角星燈紋飾。
  - `ui-cursor`：12 像素高的金色箭頭游標，朝右，magenta 背景。
  
  執行 `python art-factory/starlantern/tools/batch.py --only=scene-title,ui-logo,scene-town,scene-guild,npc-guild,ui-window,ui-cursor`（背景執行），結果逐張用 Read 檢查。

- [ ] **Step 4: 做審核頁並停下來等使用者核准**：把 7 張和「樣本頁換上這些圖之後的實際截圖」放在同一頁。要拍實機截圖，得先把這 7 張複製到暫存的 runtime 位置，並暫時寫入 manifest；截完圖立刻移除，再確認 runtime 目錄與 manifest 已恢復原狀（未核准的圖不能留在 runtime）。審核頁用 Artifact 發布。問使用者：風格可不可以、要改哪裡。

- [ ] **Step 5: 核准後發布**：`approve` → `publish --approved`；樣本頁的背景、logo、NPC、視窗框（`.slx-win` 改用 `border-image: url(/assets/games/starlantern/ui/window.png) 33% / 8px round`，中間透明、底色沿用 `$slx-win`）、游標（`.slx-sel::before` 改用游標圖）自動生效；跑全部測試與 e2e；Commit：`art(starlantern): ui style samples`。

---

### Task 7: 收尾驗證與交付

- [ ] `npx vitest run`（如遇計畫二已知的 tetris `ffaLayout.test.ts` 在全套負載下逾時，加 `--testTimeout=20000` 重跑並如實回報）。
- [ ] `E2E_PORT=4352 npx playwright test tests/e2e/starlantern-next.spec.ts tests/e2e/starlantern.spec.ts --project=chromium` → 全過（舊遊戲頁不受影響）。
- [ ] `npx tsc --noEmit -p . 2>&1 | grep -c starlantern` → `0`；`grep -rn '!important\|style=' src/styles/_starlantern-ui.scss src/scripts/games/starlantern/ui2 src/pages/games/starlantern-next.astro` 無輸出；`grep -rn '\.style\.' src/scripts/games/starlantern/ui2` 無輸出。
- [ ] 給使用者試玩連結 `http://127.0.0.1:4354/games/starlantern-next` 與截圖，說明這只是地基與城鎮選單，設施、迷宮、戰鬥在計畫三 B 製作。
