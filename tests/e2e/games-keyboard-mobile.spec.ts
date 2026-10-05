import { test, expect } from '@playwright/test';

test.describe('鍵盤遊戲的觸控裝置入口', () => {
  test.skip(({ isMobile }) => !isMobile, 'Covers the coarse-pointer mobile contract');

  for (const query of ['', '?mode=solo', '?mode=ai&diff=insane', '?mode=online']) {
    test(`Tetris ${query || '主選單'} 保留提示與資訊分頁，不啟動遊戲`, async ({ page }) => {
      await page.goto(`/games/tetris${query}`);
      await expect(page.locator('#touch-notice')).toBeVisible();
      await expect(page.locator('#touch-notice')).toContainText('電腦鍵盤');
      await expect(page.locator('#mode-select')).toBeHidden();
      await expect(page.locator('#online-panel')).toBeHidden();

      await page.getByRole('tab', { name: 'LEADERBOARD' }).click();
      await expect(page.locator('#panel-leaderboard')).toBeVisible();
      await expect(page.locator('#lb-list')).not.toContainText('載入中…');
      await page.getByRole('tab', { name: 'PROFILE' }).click();
      await expect(page.locator('#profile-guest')).toBeVisible();
      await page.getByRole('tab', { name: 'PLAY' }).click();
      await expect(page.locator('#touch-notice')).toBeVisible();
      await expect(page.locator('#mode-select')).toBeHidden();
      expect(await page.evaluate(() => '__tetrisDebug' in window)).toBe(false);

      await page.locator('.tetris-back').click();
      await expect(page).toHaveURL(/\/games\/?$/);
    });
  }

  for (const query of ['', '?mode=solo', '?mode=hotseat', '?online=1']) {
    test(`Bomber ${query || '主選單'} 阻擋開局並可返回遊戲廳`, async ({ page }) => {
      await page.goto(`/games/bomber${query}`);
      await expect(page.locator('#touch-notice')).toBeVisible();
      await expect(page.locator('#touch-notice')).toContainText('KEYBOARD REQUIRED');
      await expect(page.locator('#mode-select')).toHaveCount(0);
      await expect(page.locator('#online-screen')).toHaveCount(0);
      expect(await page.evaluate(() =>
        '__bomberDebug' in window || '__bomberVersusDebug' in window,
      )).toBe(false);

      await page.locator('#touch-notice').getByRole('link', { name: 'ARCADE' }).click();
      await expect(page).toHaveURL(/\/games\/?$/);
    });
  }
});
