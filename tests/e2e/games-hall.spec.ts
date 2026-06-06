import { test, expect } from '@playwright/test';

/**
 * 遊戲廳 + 模式選單煙霧測試。啟動遊戲需 WebGL，故 chromium-only。
 */
test.describe('Dungeon Arcade — hall & mode select', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL Pixi game smoke runs on chromium only');

  test('hall lists Battle Tetris and links into the game', async ({ page }) => {
    await page.goto('/games');
    await expect(page.getByText('DUNGEON ARCADE')).toBeVisible();
    await expect(page.locator('a[href="/games/tetris"]')).toBeVisible();
  });

  test('mode-select appears with no param and starts vs-AI on pick', async ({ page }) => {
    await page.goto('/games/tetris');
    await expect(page.locator('#mode-select')).toBeVisible();

    await page.locator('[data-mode="ai"][data-diff="hard"]').click();
    await expect(page.locator('#mode-select')).toHaveCount(0); // overlay removed
    await page.waitForFunction(
      () => Boolean((window as unknown as { __tetrisDebug?: { match?: unknown } }).__tetrisDebug?.match),
      undefined,
      { timeout: 20000 },
    );
  });

  test('deep link ?mode=solo skips the menu and starts solo', async ({ page }) => {
    await page.goto('/games/tetris?mode=solo');
    await expect(page.locator('#mode-select')).toHaveCount(0);
    await page.waitForFunction(
      () => Boolean((window as unknown as { __tetrisDebug?: { game?: unknown } }).__tetrisDebug?.game),
      undefined,
      { timeout: 20000 },
    );
  });

  test('hall links to leaderboard; leaderboard page loads and fetches the API', async ({ page }) => {
    await page.goto('/games');
    await expect(page.locator('a[href="/games/leaderboard"]')).toBeVisible();

    await page.goto('/games/leaderboard');
    await expect(page.getByText('LEADERBOARD')).toBeVisible();
    // fetch 完成後不應停在「載入中」（證明 /api/leaderboard 有回應）
    await expect(page.locator('#lb-board')).not.toContainText('載入中', { timeout: 10000 });
  });
});
