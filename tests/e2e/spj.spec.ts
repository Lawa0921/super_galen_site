import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Tavern Hearth)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
    await page.waitForTimeout(2000);
  });

  test('should display Hero Title', async ({ page }) => {
    await expect(page.locator('.hero-title')).toContainText('THE ETERNAL TAVERN');
  });

  test('should display Dialogue Box', async ({ page }) => {
    await expect(page.locator('.dialogue-container')).toBeVisible();
    await expect(page.locator('.speaker-name')).toContainText('Innkeeper SPJ');
    // Initial text check might fail if animation not started, wait for it
    await page.waitForTimeout(1000);
    await expect(page.locator('#dialogue-text')).toContainText('歡迎光臨');
  });

  test('should update Dialogue on Scroll', async ({ page }) => {
    // Scroll to 50%
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.5)");
    await page.waitForTimeout(1000);
    // Check for middle content (Text Town / Crystal phase)
    await expect(page.locator('#dialogue-text')).toContainText('天書系統');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
