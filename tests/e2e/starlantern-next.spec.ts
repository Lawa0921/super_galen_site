import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--mute-audio'] } });

const box = (page: Page) => page.locator('#sl-screen').boundingBox();

test.describe('starlantern next ui', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'chromium only');

  for (const [w, h, scale] of [[1280, 720, 2], [1366, 768, 2], [2560, 1440, 4], [390, 844, 0.6]] as const) {
    test(`fits a ${w}x${h} window without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/games/starlantern-next');
      await expect(page.locator('#sl-screen')).toBeVisible();
      const b = (await box(page))!;
      expect(b.width).toBeCloseTo(640 * scale, 0);
      expect(b.height).toBeCloseTo(360 * scale, 0);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      const scroll = await page.evaluate(() => ({ x: document.documentElement.scrollWidth, y: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight }));
      expect(scroll.x).toBeLessThanOrEqual(scroll.w);
      expect(scroll.y).toBeLessThanOrEqual(scroll.h);
    });
  }

  test('uses the pixel font and still renders when it fails to load', async ({ page }) => {
    await page.goto('/games/starlantern-next');
    // A face only downloads once something asks for it; load it explicitly, then confirm it resolved.
    expect(await page.evaluate(async () => (await document.fonts.load('12px "Cubic 11"')).length)).toBeGreaterThan(0);
    await page.route('**/Cubic_11.woff2', (r) => r.abort());
    await page.goto('/games/starlantern-next');
    await expect(page.locator('#sl-ui')).toBeVisible();
  });

  test('plays title → town with the keyboard only', async ({ page }) => {
    await page.goto('/games/starlantern-next');
    await page.evaluate(() => localStorage.removeItem('starlantern-save'));
    await page.reload();
    await expect(page.locator('.slx-title [aria-selected=true]')).toHaveText('新遊戲');
    await expect(page.locator('.slx-title [role=option]').nth(1)).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await expect(page.locator('.slx-town')).toBeVisible();
    await expect(page.locator('.slx-place')).toHaveText('邊境小鎮 露米亞');
    // the greeting types out: the first confirm completes it, the next closes it
    for (let i = 0; i < 4 && (await page.locator('.slx-talk').isVisible()); i++) await page.keyboard.press('z');
    await expect(page.locator('.slx-talk')).toBeHidden();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.slx-town [aria-selected=true]')).toHaveText('道具店');
    await page.keyboard.press('Escape');
    await expect(page.locator('.slx-title')).toBeVisible();
    expect(await page.locator('#sl-screen button, #sl-screen select').count()).toBe(0);
  });
});
