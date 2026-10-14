import { test, expect } from '@playwright/test';

test.describe('Tetris 觸控裝置入口', () => {
  test.skip(({ isMobile }) => !isMobile, 'Desktop play controls are covered in games-tetris-menu.spec.ts');

  for (const query of ['', '?mode=solo', '?mode=ai&diff=insane', '?mode=online']) {
    test(`${query || '主選單'} 保留鍵盤提示與資訊分頁，不啟動遊戲`, async ({ page }) => {
      await page.goto(`/games/tetris${query}`);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await expect(page.locator('#touch-notice')).toBeVisible();
      await expect(page.locator('#touch-notice')).toContainText('電腦鍵盤');
      await expect(page.locator('#mode-select')).toBeHidden();
      await expect(page.locator('#online-panel')).toBeHidden();
      await expect(page.locator('#handling-open')).toBeHidden();

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
});
