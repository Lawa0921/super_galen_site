import { test, expect } from '@playwright/test';

/**
 * 遊戲廳 + 模式選單煙霧測試。啟動遊戲需 WebGL，故 chromium-only。
 */
test.describe('Dungeon Arcade — hall & mode select', () => {

  test('hall lists only the four available games', async ({ page }) => {
    await page.goto('/games');
    await expect(page.getByText('DUNGEON ARCADE')).toBeVisible();
    await expect(page.locator('.card-wall a.card')).toHaveCount(4);
    for (const game of ['tetris', 'bomber', 'cs', 'delve']) {
      await expect(page.locator(`.card-wall a[href="/games/${game}"]`)).toBeVisible();
    }
    await expect(page.locator('a[href="/games/witchrun"], a[href="/games/defense"]')).toHaveCount(0);
  });

  test('hall does not list the unreleased RTS, which stays reachable by URL', async ({ page }) => {
    await page.goto('/games');
    await expect(page.locator('a[href="/games/tetris"]')).toBeVisible();
    await expect(page.locator('a[href^="/games/rts"]')).toHaveCount(0);
    await expect(page.locator('.card-wall')).not.toContainText('曦境戰紀');
    const response = await page.goto('/games/rts');
    expect(response?.status()).toBe(200);
  });
  for (const game of ['witchrun', 'defense']) {
    test(`removed game ${game} returns 404 for direct links`, async ({ request }) => {
      for (const path of [`/games/${game}`, `/games/${game}/`]) {
        const response = await request.get(path);
        expect(response.status(), path).toBe(404);
      }
    });
  }

  test('mode-select appears with no param and starts vs-AI on pick', async ({ page, browserName, isMobile }) => {
    test.skip(!isMobile && browserName !== 'chromium', 'Keyboard gameplay smoke runs on desktop Chromium only');
    await page.goto('/games/tetris');
    if (isMobile) {
      await expect(page.locator('#touch-notice')).toBeVisible();
      await expect(page.locator('#mode-select')).toBeHidden();
      await page.locator('.mm-tab[data-tab="leaderboard"]').click();
      await expect(page.locator('#panel-leaderboard')).toBeVisible();
      await page.locator('.mm-tab[data-tab="profile"]').click();
      await expect(page.locator('#panel-profile')).toBeVisible();
      await page.locator('a.tetris-back[href="/games"]').click();
      await expect(page).toHaveURL(/\/games\/?$/);
      return;
    }
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

  test('deep link ?mode=solo skips the menu and starts solo', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'Keyboard gameplay smoke runs on desktop Chromium only');
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
