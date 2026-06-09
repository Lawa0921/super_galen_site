import { test, expect } from '@playwright/test';

// gameRunning 在 Pixi 載入完成（startTetris resolve）後才為 true；用 __tetrisDebug 當就緒訊號。
async function waitGameReady(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('#tetris-canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as unknown as { __tetrisDebug?: unknown }).__tetrisDebug), { timeout: 15000 });
}

test.describe('遊戲中 ESC 暫停選單', () => {
  test('SOLO：ESC 跳出 PAUSED 選單、繼續可關閉', async ({ page }) => {
    await page.goto('/games/tetris?mode=solo');
    await waitGameReady(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toBeVisible();
    await expect(page.locator('#pause-title')).toHaveText('PAUSED');
    await page.locator('#pause-resume').click();
    await expect(page.locator('#pause-menu')).toBeHidden();
  });

  test('SOLO：離開回到主選單', async ({ page }) => {
    await page.goto('/games/tetris?mode=solo');
    await waitGameReady(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-menu')).toBeVisible();
    await page.locator('#pause-quit').click();
    await expect(page.locator('#main-menu')).toBeVisible();
  });
});
