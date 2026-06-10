import { test, expect } from '@playwright/test';

/**
 * Dungeon Arcade: Dungeon Bomber — solo 頁面煙霧測試。
 * Pixi 需 WebGL；headless 下僅 chromium 穩定，故其餘瀏覽器跳過。
 */
test.describe('Dungeon Arcade — Dungeon Bomber', () => {
  test('solo page loads, inits engine, and responds to input', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebGL Pixi game smoke runs on chromium only');

    // 1. 收集 console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 導向 solo 模式（繞過模式選單）
    await page.goto('/games/bomber?mode=solo');
    await expect(page.locator('#bomber-canvas')).toBeVisible();

    // 2. 等待 Pixi 初始化 + __bomberDebug hook 掛上（最多 20s）
    await page.waitForFunction(
      () => Boolean((window as unknown as { __bomberDebug?: { game?: unknown } }).__bomberDebug?.game),
      undefined,
      { timeout: 20000 },
    );

    const readState = () =>
      page.evaluate(() => {
        const g = (window as unknown as { __bomberDebug: { game: any } }).__bomberDebug.game;
        const s = g.getState();
        return {
          status: s.status as string,
          character: s.character as string,
          lives: (s.player as { lives: number }).lives,
          x: (s.player as { x: number }).x,
          y: (s.player as { y: number }).y,
          bombsLen: (s.bombs as unknown[]).length,
          enemiesLen: (s.enemies as unknown[]).length,
        };
      });

    // 3. 驗證初始狀態
    const initial = await readState();
    expect(initial.status).toBe('playing');
    // ?mode=solo 預設啟動 lena（命數 4）；驗證角色感知的初始狀態
    expect(initial.character).toBe('lena');
    expect(initial.lives).toBeGreaterThan(0);
    expect(initial.enemiesLen).toBeGreaterThan(0);

    // 先 focus canvas 以確保鍵盤事件送達 window handler（也滿足 audio gesture）
    await page.locator('#bomber-canvas').click({ position: { x: 5, y: 5 } }).catch(() => {});

    // 4. 放炸彈 — 用 in-page dispatchEvent 確保可靠觸達 window keydown handler
    await page.evaluate(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })),
    );
    // 等一個動畫幀讓引擎處理
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    const afterBomb = await readState();
    expect(afterBomb.bombsLen).toBe(1);

    // 5. 移動玩家向右 — 用 in-page setHeld + step 確保可靠移動
    const startX = afterBomb.x;
    await page.evaluate(() => {
      const g = (window as unknown as { __bomberDebug: { game: any } }).__bomberDebug.game;
      g.setHeld('right', true);
      // 推進幾個 tick，讓移動冷卻時間過去（每格約 200ms，給 300ms 的 dt）
      g.step(100);
      g.step(100);
      g.step(100);
      g.setHeld('right', false);
    });

    const afterMove = await readState();
    // 玩家 x 不能倒退（向右走應該增加，或卡牆維持原位）
    expect(afterMove.x).toBeGreaterThanOrEqual(startX);

    // 6. 確認無 console errors
    expect(consoleErrors).toHaveLength(0);
  });
});
