import { test, expect, type Page } from '@playwright/test';

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
    await page.locator('[data-mode="online"]').click();
    await page.locator('#online-create').click();
    await expect(page.locator('#online-lobby')).toBeVisible({ timeout: 12000 });
    await expect(page.locator('#lobby-code')).not.toHaveText('·····');
    await expect(page.locator('#lobby-copy')).toBeVisible();
    await expect(page.locator('#lobby-cancel')).toBeVisible();
  });
});
