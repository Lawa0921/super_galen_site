import { test, expect, type Page } from '@playwright/test';

// 注意：`.mode-select`（PLAY 分頁內的模式選單）是 position:absolute; inset:0 的全螢幕
// 覆蓋層，會蓋在 tab 列上方並攔截指標事件，導致直接 .click() tab 中心點打到模式按鈕。
// tab 切換的 click handler 直接綁在 .mm-tab 元素上，因此這裡用原生 dispatch click
// 觸發真實的 switchTab 行為（僅測試層處理覆蓋層幾何，未更動產品行為）。
async function clickTab(page: Page, label: string): Promise<void> {
  await page.evaluate((text) => {
    const tab = Array.from(document.querySelectorAll<HTMLElement>('.mm-tab')).find(
      (t) => t.textContent?.includes(text),
    );
    tab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, label);
}

test.describe('Tetris 主選單三分頁', () => {
  test('預設顯示 PLAY 分頁與模式按鈕', async ({ page }) => {
    await page.goto('/games/tetris');
    await expect(page.locator('.mm-tab', { hasText: 'PLAY' })).toHaveClass(/is-active/);
    await expect(page.locator('[data-mode="solo"]')).toBeVisible();
  });

  test('切到 LEADERBOARD 顯示清單容器（空狀態或資料）', async ({ page }) => {
    await page.goto('/games/tetris');
    await clickTab(page, 'LEADERBOARD');
    await expect(page.locator('#panel-leaderboard')).toBeVisible();
    await expect(page.locator('#lb-list')).toBeVisible();
    await expect(page.locator('#lb-list')).not.toContainText('載入中…', { timeout: 5000 });
  });

  test('切到 PROFILE 訪客顯示連錢包 CTA', async ({ page }) => {
    await page.goto('/games/tetris');
    await clickTab(page, 'PROFILE');
    await expect(page.locator('#profile-guest')).toBeVisible();
    await expect(page.locator('#profile-wallet')).toBeVisible();
  });

  test('?mode=solo 仍直接開局（選單移除）', async ({ page }) => {
    await page.goto('/games/tetris?mode=solo');
    await expect(page.locator('#main-menu')).toHaveCount(0);
    await expect(page.locator('#tetris-canvas')).toBeVisible();
  });
});
