import { test, expect } from '@playwright/test';

test.use({ trace: 'retain-on-failure' });

// 保留偶發啟動失敗的事件證據，不改動點擊、等待或重試行為。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const events: unknown[] = [];
    (window as any).__tetrisMenuEvents = events;
    const addListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (this instanceof HTMLElement && this.id === 'handling-open' && type === 'click') {
        events.push({ type: 'registered', at: performance.now() });
      }
      return addListener.call(this, type, listener, options);
    };
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      document.addEventListener(type, (event) => {
        const target = event.target as HTMLElement | null;
        events.push({ type, target: target?.id || target?.tagName, at: performance.now() });
      }, true);
    }
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as HTMLElement;
        if (target.id === 'handling-panel') events.push({
          type: 'panel-hidden', oldValue: record.oldValue, hidden: target.hidden, at: performance.now(),
        });
      }
    }).observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden'] });
  });
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const evidence = await page.evaluate(() => ({
    url: location.href, ready: document.readyState, events: (window as any).__tetrisMenuEvents,
    expanded: document.getElementById('handling-open')?.getAttribute('aria-expanded'),
    hidden: (document.getElementById('handling-panel') as HTMLElement | null)?.hidden,
  })).catch(error => ({ error: String(error) }));
  await info.attach('tetris-menu-events', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});

// tab 必須能被真實使用者點擊（不被 PLAY 分頁的模式選單覆蓋層攔截），故用真實 .click()。
test.describe('Tetris 主選單三分頁', () => {
  test('預設顯示 PLAY 分頁與模式按鈕', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Touch devices show the keyboard requirement instead of play controls');
    await page.goto('/games/tetris');
    await expect(page.locator('.mm-tab', { hasText: 'PLAY' })).toHaveClass(/is-active/);
    await expect(page.locator('[data-mode="solo"]')).toBeVisible();
    // AI 難度四級：INSANE 超級模式按鈕（紫紅警示）也要在選單上
    await expect(page.locator('[data-mode="ai"][data-diff="insane"]')).toBeVisible();
    await expect(page.locator('[data-mode="ai"][data-diff="insane"]')).toContainText('INSANE');
  });

  test('切到 LEADERBOARD 顯示清單容器（空狀態或資料）', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('.mm-tab', { hasText: 'LEADERBOARD' }).click();
    await expect(page.locator('#panel-leaderboard')).toBeVisible();
    await expect(page.locator('#lb-list')).toBeVisible();
    await expect(page.locator('#lb-list')).not.toContainText('載入中…', { timeout: 5000 });
  });

  test('切到 PROFILE 訪客顯示連錢包 CTA', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('.mm-tab', { hasText: 'PROFILE' }).click();
    await expect(page.locator('#profile-guest')).toBeVisible();
    await expect(page.locator('#profile-wallet')).toBeVisible();
  });

  test('?mode=solo 仍直接開局（選單移除）', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Tetris gameplay requires a physical keyboard');
    await page.goto('/games/tetris?mode=solo');
    await expect(page.locator('#main-menu')).toHaveCount(0);
    await expect(page.locator('#tetris-canvas')).toBeVisible();
  });

  test('左上「← ARCADE」連結回到遊戲廳（不被選單層擋住）', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('.tetris-back').click();
    await expect(page).toHaveURL(/\/games\/?$/);
  });

  test('aria-selected 隨分頁切換更新', async ({ page }) => {
    await page.goto('/games/tetris');
    await expect(page.locator('.mm-tab[data-tab="play"]')).toHaveAttribute('aria-selected', 'true');
    await page.locator('.mm-tab', { hasText: 'PROFILE' }).click();
    await expect(page.locator('.mm-tab[data-tab="profile"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.mm-tab[data-tab="play"]')).toHaveAttribute('aria-selected', 'false');
  });

  test('點過「線上對戰」後切回 PLAY → SOLO/AI 仍可選（回退修正）', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Touch devices do not expose online gameplay controls');
    await page.goto('/games/tetris');
    await page.locator('[data-mode="online"]').click();        // 進線上面板（隱藏模式選單）
    await expect(page.locator('#online-panel')).toBeVisible();
    await page.locator('.mm-tab', { hasText: 'LEADERBOARD' }).click(); // 離開 PLAY
    await page.locator('.mm-tab', { hasText: 'PLAY' }).click();        // 切回 PLAY
    await expect(page.locator('[data-mode="solo"]')).toBeVisible();    // 模式選單已還原
    await expect(page.locator('#online-panel')).toBeHidden();
  });
});

// G4：HANDLING 手感設定（DAS/ARR/SDF 滑桿，localStorage `tetris-handling`，下一局生效）
// 開關鈕在面板底部，dev server 的 astro-dev-toolbar 會攔截 pointer events（僅 dev 存在）→ 先移除。
async function removeDevToolbar(page: import('@playwright/test').Page): Promise<void> {
  await page
    .locator('astro-dev-toolbar')
    .evaluate((el) => el.remove(), undefined, { timeout: 3000 })
    .catch(() => {}); // production build 無 toolbar
}

test.describe('Tetris HANDLING 手感設定', () => {
  test.skip(({ isMobile }) => isMobile, 'Keyboard handling controls are hidden on touch devices');
  test('開面板 → 調 DAS → localStorage 反映且重載後保留', async ({ page }) => {
    await page.goto('/games/tetris');
    await removeDevToolbar(page);
    await page.locator('#handling-open').click();
    await expect(page.locator('#handling-panel')).toBeVisible();
    await page.locator('#handling-das').fill('250');
    await expect(page.locator('#handling-das-val')).toHaveText('250ms');
    const stored = await page.evaluate(() => localStorage.getItem('tetris-handling'));
    expect(JSON.parse(stored ?? '{}')).toEqual({ das: 250, arr: 35, sdf: 30 });
    await page.reload();
    await removeDevToolbar(page);
    await page.locator('#handling-open').click();
    await expect(page.locator('#handling-das')).toHaveValue('250');
  });

  test('恢復預設回 150/35/30，「完成」收合面板', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.evaluate(() => localStorage.setItem('tetris-handling', JSON.stringify({ das: 80, arr: 0, sdf: 0 })));
    await removeDevToolbar(page);
    await page.locator('#handling-open').click();
    await expect(page.locator('#handling-das')).toHaveValue('80'); // 開啟時同步現值
    await page.locator('#handling-reset').click();
    await expect(page.locator('#handling-das')).toHaveValue('150');
    const stored = await page.evaluate(() => localStorage.getItem('tetris-handling'));
    expect(JSON.parse(stored ?? '{}')).toEqual({ das: 150, arr: 35, sdf: 30 });
    await page.locator('#handling-done').click();
    await expect(page.locator('#handling-panel')).toBeHidden();
  });
});
