import { test, expect } from '@playwright/test';

/**
 * vs-AI 煙霧測試：完全不給輸入，AI（B 側）應自己下棋。
 * Pixi 需 WebGL；headless 下僅 chromium 穩定。
 */
test.describe('Dungeon Arcade — vs AI', () => {
  test('AI opponent plays on its own (no human input)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebGL Pixi game smoke runs on chromium only');

    await page.goto('/games/tetris?mode=ai&diff=hard');
    await expect(page.locator('#tetris-canvas')).toBeVisible();

    await page.waitForFunction(
      () => Boolean((window as unknown as { __tetrisDebug?: { match?: unknown } }).__tetrisDebug?.match),
      undefined,
      { timeout: 20000 },
    );

    // 開場倒數 + AI 下棋時間
    await page.waitForTimeout(5500);

    const ai = await page.evaluate(() => {
      const m = (window as unknown as { __tetrisDebug: { match: any } }).__tetrisDebug.match;
      const b = m.b.getState();
      return {
        phase: m.phase as string,
        bFilled: (b.board as Array<Array<unknown>>).flat().filter(Boolean).length,
        bLines: b.lines as number,
      };
    });

    // AI 應已自行落子（盤面有格或已消行）
    expect(ai.bFilled + ai.bLines).toBeGreaterThan(0);
  });
});
