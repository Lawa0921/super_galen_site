import { test, expect, type Page } from '@playwright/test';

test.skip(({ isMobile }) => isMobile, 'Tetris gameplay requires a physical keyboard');

const ready = async (page: Page) => {
  await expect(page.locator('#tetris-canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as unknown as { __tetrisDebug?: unknown }).__tetrisDebug), { timeout: 15000 });
};

test.describe('SOLO 結束畫面 + 重玩', () => {
  test('top-out → GAME OVER 覆蓋層 → 再玩一次回到遊戲', async ({ page }) => {
    await page.goto('/games/tetris?mode=solo');
    await ready(page);
    await page.waitForTimeout(600);
    // 不左右移動、狂硬降 → 中央堆滿 → top out
    for (let i = 0; i < 60; i++) {
      if (await page.locator('#result-menu').isVisible()) break;
      await page.keyboard.press('Space');
      await page.waitForTimeout(80);
    }
    await expect(page.locator('#result-menu')).toBeVisible();
    await expect(page.locator('#result-title')).toHaveText('GAME OVER');
    await page.locator('#result-again').click();
    await expect(page.locator('#result-menu')).toBeHidden();
    // 重玩後盤面回到 playing
    const status = await page.evaluate(() => (window as unknown as { __tetrisDebug?: { game?: { getState(): { status: string } } } }).__tetrisDebug?.game?.getState().status);
    expect(status).toBe('playing');
  });
});

test.describe('線上 lobby', () => {
  test('建立房間 → lobby 顯示房號 + 複製 + 取消', async ({ page }) => {
    await page.goto('/games/tetris');
    const supportsWebRtc = await page.evaluate(() => typeof RTCPeerConnection !== 'undefined');
    await page.locator('[data-mode="online"]').click();
    await page.locator('#online-create').click();
    await expect(page.locator('#online-lobby')).toBeVisible({ timeout: 12000 });
    if (!supportsWebRtc) {
      await expect(page.locator('#lobby-wait')).toContainText('連線失敗');
      await page.locator('#lobby-cancel').click();
      await expect(page.locator('#mode-select')).toBeVisible();
      return;
    }
    await expect(page.locator('#lobby-code')).not.toHaveText('·····');
    await expect(page.locator('#lobby-copy')).toBeVisible();
    await expect(page.locator('#lobby-cancel')).toBeVisible();
  });

  test('WebRTC 初始化失敗仍顯示錯誤與可用的取消入口', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, value: undefined });
    });
    await page.goto('/games/tetris');
    await page.locator('[data-mode="online"]').click();
    await page.locator('#online-create').click();
    await expect(page.locator('#online-lobby')).toBeVisible();
    await expect(page.locator('#lobby-wait')).toContainText('連線失敗');
    await page.locator('#lobby-cancel').click();
    await expect(page.locator('#mode-select')).toBeVisible();
  });
});
