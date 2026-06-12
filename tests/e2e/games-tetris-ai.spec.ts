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

    // 輪詢到 AI（B 側）真的自行落子（盤面有格或已消行）——比固定等待穩定，
    // 避免開場倒數 + 多支 e2e 同跑資源吃緊時誤判。
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const m = (window as unknown as { __tetrisDebug: { match: any } }).__tetrisDebug.match;
            const b = m.b.getState();
            return (b.board as Array<Array<unknown>>).flat().filter(Boolean).length + (b.lines as number);
          }),
        { timeout: 20000, intervals: [300, 500, 800] },
      )
      .toBeGreaterThan(0);
  });

  test('deep link ?diff=insane starts the god-mode AI (80ms think delay)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebGL Pixi game smoke runs on chromium only');

    await page.goto('/games/tetris?mode=ai&diff=insane');
    await expect(page.locator('#main-menu')).toHaveCount(0);
    await expect(page.locator('#tetris-hint')).toContainText('INSANE');
    await page.waitForFunction(
      () => Boolean((window as unknown as { __tetrisDebug?: { match?: unknown } }).__tetrisDebug?.match),
      undefined,
      { timeout: 20000 },
    );
    // insane = 原 hard 神級參數（80ms 思考延遲、零失誤）
    const interval = await page.evaluate(
      () => ((window as unknown as { __tetrisDebug: { ai: unknown } }).__tetrisDebug.ai as { intervalMs: number }).intervalMs,
    );
    expect(interval).toBe(80);
  });
});
