import { test, expect } from '@playwright/test';

/**
 * 本機雙人對戰煙霧測試。Pixi 需 WebGL；headless 下僅 chromium 穩定。
 */
test.describe('Dungeon Arcade — Local 2P', () => {
  test('two boards init, respond independently, and route attacks', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebGL Pixi game smoke runs on chromium only');

    await page.goto('/games/tetris?mode=2p');
    await expect(page.locator('#tetris-canvas')).toBeVisible();

    await page.waitForFunction(
      () => Boolean((window as unknown as { __tetrisDebug?: { match?: unknown } }).__tetrisDebug?.match),
      undefined,
      { timeout: 20000 },
    );

    // 等開場倒數結束（輸入此後才生效）
    await page.waitForTimeout(3200);

    const read = () =>
      page.evaluate(() => {
        const m = (window as unknown as { __tetrisDebug: { match: any } }).__tetrisDebug.match;
        return {
          phase: m.phase as string,
          ax: m.a.getState().active.x as number,
          bx: m.b.getState().active.x as number,
        };
      });

    const before = await read();
    expect(before.phase).toBe('playing');

    // P1 = WASD（左），P2 = 方向鍵（右）；應各自獨立移動
    await page.keyboard.press('a');
    await page.keyboard.press('a');
    await page.keyboard.press('ArrowRight');
    const after = await read();
    expect(after.ax).toBeLessThan(before.ax); // P1 左移
    expect(after.bx).toBeGreaterThan(before.bx); // P2 右移

    // A 連段消行 → 應送垃圾給 B
    await page.evaluate(() => {
      const m = (window as unknown as { __tetrisDebug: { match: any } }).__tetrisDebug.match;
      m.a.debugFillRowExceptOneAndDrop();
      m.a.debugFillRowExceptOneAndDrop();
      m.a.debugFillRowExceptOneAndDrop();
    });
    await page.waitForTimeout(200);
    const pendingB = await page.evaluate(
      () => (window as unknown as { __tetrisDebug: { match: any } }).__tetrisDebug.match.pendingGarbage('B') as number,
    );
    expect(pendingB).toBeGreaterThan(0);
  });
});
