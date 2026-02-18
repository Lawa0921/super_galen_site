import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Visual Novel)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
    await page.waitForTimeout(2000);
  });

  test('should display Character Sprite', async ({ page }) => {
    await expect(page.locator('.char-container')).toBeVisible();
    await expect(page.locator('.speaker-tag')).toHaveText('SPJ');
  });

  test('should display Dialogue Box', async ({ page }) => {
    await expect(page.locator('.dialogue-box')).toBeVisible();
    // Trigger scroll slightly to ensure GSAP updates
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(1000);
    // Initial text (might be typing, check substring)
    await expect(page.locator('#dialogue-text')).toContainText('歡迎來到我的酒館');
  });

  test('should trigger Project Panels on Scroll', async ({ page }) => {
    // Scroll to middle (around Text Town beat)
    // 6 beats total. Text Town is index 2 -> ~33-50%
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.4)");
    await page.waitForTimeout(2000); // Wait for type + panel fade

    await expect(page.locator('#panel-texttown')).toBeVisible();
    await expect(page.locator('#dialogue-text')).toContainText('文字小鎮');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
