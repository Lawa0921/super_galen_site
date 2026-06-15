import { test, expect } from '@playwright/test';

/**
 * WITCH RUN — 縱向彈幕射擊遊戲 E2E 煙霧測試。
 * Pixi 需 WebGL；headless 下僅 chromium 穩定，故其餘瀏覽器跳過。
 */
test.describe('witchrun', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL Pixi game smoke runs on chromium only');

  test('標題 → 選角 → 開局', async ({ page }) => {
    await page.goto('/games/witchrun');
    await expect(page.locator('#witch-title')).toBeVisible();
    await page.click('#witch-start');
    // 進入選角畫面（不直接開遊戲）
    await expect(page.locator('#witch-select')).toBeVisible();
    await page.click('#select-confirm');
    await expect(page.locator('#witch-title')).toHaveCount(0);
    // 引擎掛上 debug 鉤
    await page.waitForFunction(
      () => Boolean((window as unknown as { __witchDebug?: { game?: unknown } }).__witchDebug?.game),
      undefined,
      { timeout: 20000 },
    );
  });

  test('選角切到 Frost → 開局起始命為 4', async ({ page }) => {
    await page.goto('/games/witchrun');
    await page.click('#witch-start');
    await expect(page.locator('#witch-select')).toBeVisible();
    // mira → gale → frost（兩次 next）
    await page.click('#select-next');
    await page.click('#select-next');
    await expect(page.locator('#select-name')).toHaveText('FROST');
    await page.click('#select-confirm');
    await page.waitForFunction(
      () => Boolean((window as unknown as { __witchDebug?: { game?: unknown } }).__witchDebug?.game),
      undefined,
      { timeout: 20000 },
    );
    const lives = await page.evaluate(() =>
      (window as unknown as { __witchDebug: { game: any } }).__witchDebug.game.getState().player.lives,
    );
    expect(lives).toBe(4);
  });

  test('autostart=1 直接開局且狀態為 playing', async ({ page }) => {
    await page.goto('/games/witchrun?autostart=1');
    await page.waitForFunction(
      () => Boolean((window as unknown as { __witchDebug?: { game?: unknown } }).__witchDebug?.game),
      undefined,
      { timeout: 20000 },
    );
    const status = await page.evaluate(() =>
      (window as unknown as { __witchDebug: { game: any } }).__witchDebug.game.getState().status,
    );
    expect(status).toBe('playing');
  });

  test('Boss 擊破打開遺物三選一 overlay', async ({ page }) => {
    await page.goto('/games/witchrun?autostart=1');
    await page.waitForFunction(
      () => Boolean((window as unknown as { __witchDebug?: { game?: unknown } }).__witchDebug?.game),
      undefined,
      { timeout: 20000 },
    );
    await page.evaluate(() => {
      const g = (window as unknown as { __witchDebug: { game: any } }).__witchDebug.game;
      g.debugSkipToBoss();
      g.step(16);
      g.boss.damage(999999);
      g.step(16);
    });
    // 若 overlay 沒及時出現，用 waitForSelector 等待
    await page.waitForSelector('#witch-draft:not([hidden])', { timeout: 10000 });
    await expect(page.locator('#witch-draft')).toBeVisible();
    await page.click('[data-relic-slot="0"]');
    await expect(page.locator('#witch-draft')).toBeHidden();
    const stage = await page.evaluate(() =>
      (window as unknown as { __witchDebug: { game: any } }).__witchDebug.game.getState().stage,
    );
    expect(stage).toBe(2);
  });

  test('遊戲廳卡片可導向 witchrun', async ({ page }) => {
    await page.goto('/games');
    await page.click('a[href="/games/witchrun"]');
    await expect(page).toHaveURL(/witchrun/);
  });
});
