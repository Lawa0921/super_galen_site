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
    // Phase 4：UI 流程多一步技能選擇（深連結 ?mode= 仍直接開局）
    await expect(page.locator('#skill-select')).toBeVisible();
    await page.locator('.ss-card[data-skill=""]').click(); // 不帶技能直接開局
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

  test('leaderboard page loads and fetches the API', async ({ page }) => {
    // 排行榜入口已移到 Tetris 主選單分頁；獨立頁仍可直接到達（深連結）。
    await page.goto('/games/leaderboard');
    await expect(page.getByText('LEADERBOARD')).toBeVisible();
    // 預設 TETRIS 分頁啟用（保留原本載入行為）
    await expect(page.locator('#lb-tab-tetris')).toHaveAttribute('aria-selected', 'true');
    // fetch 完成後不應停在「載入中」（證明 /api/leaderboard 有回應）
    await expect(page.locator('#lb-board')).not.toContainText('載入中', { timeout: 10000 });
  });

  test('leaderboard BOMBER tab fetches game=bomber and renders', async ({ page }) => {
    await page.goto('/games/leaderboard');
    await expect(page.locator('#lb-tab-bomber')).toBeVisible();

    // 點 BOMBER → 應打 /api/leaderboard?...game=bomber
    const [bomberReq] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/api/leaderboard') && req.url().includes('game=bomber'), {
        timeout: 10000,
      }),
      page.locator('#lb-tab-bomber').click(),
    ]);
    expect(bomberReq.url()).toContain('game=bomber');

    // 分頁狀態切換 + 載入結束（不停在「載入中」）
    await expect(page.locator('#lb-tab-bomber')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#lb-tab-tetris')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#lb-board')).not.toContainText('載入中', { timeout: 10000 });
  });
});
