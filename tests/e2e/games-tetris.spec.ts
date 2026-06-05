import { test, expect } from '@playwright/test';

/**
 * Dungeon Arcade 俄羅斯方塊 — 單人頁面煙霧測試。
 * Pixi 需 WebGL；headless 下僅 chromium 穩定，故其餘瀏覽器跳過。
 */
test.describe('Dungeon Arcade — Tetris', () => {
  test('single-player page loads, inits engine, and responds to input', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebGL Pixi game smoke runs on chromium only');

    await page.goto('/games/tetris?mode=solo'); // 跳過模式選單直接開單人
    await expect(page.locator('#tetris-canvas')).toBeVisible();

    // 等待 Pixi 初始化 + 素材載入後掛上的 debug hook
    await page.waitForFunction(
      () => Boolean((window as unknown as { __tetrisDebug?: { game?: unknown } }).__tetrisDebug?.game),
      undefined,
      { timeout: 20000 },
    );

    const readState = () =>
      page.evaluate(() => {
        const g = (window as unknown as { __tetrisDebug: { game: any } }).__tetrisDebug.game;
        const s = g.getState();
        return {
          status: s.status as string,
          hasActive: Boolean(s.active),
          score: s.score as number,
          filled: (s.board as Array<Array<unknown>>).flat().filter(Boolean).length,
        };
      });

    const initial = await readState();
    expect(initial.status).toBe('playing');
    expect(initial.hasActive).toBe(true);
    expect(initial.filled).toBe(0);

    // 透過真實鍵盤路徑硬降數次 → 應鎖定方塊並得分
    for (let i = 0; i < 4; i++) await page.keyboard.press('Space');

    const after = await readState();
    expect(after.filled).toBeGreaterThan(0);
    expect(after.score).toBeGreaterThan(0);
  });
});
