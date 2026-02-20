import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Bright Interactive)', () => {
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
  });

  test('should display Dialogue Box', async ({ page }) => {
    await expect(page.locator('.dialogue-box')).toBeVisible();
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(1000);
    // Use partial text match for robustnes
    await expect(page.locator('#dialogue-text')).toContainText('嘿');
  });

  test('should display Footer Socials on Scroll End', async ({ page }) => {
    // Scroll to end
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(2000); // Wait for fade in

    await expect(page.locator('#footer-socials')).toHaveCSS('opacity', '1');
    const threadsLink = page.locator('#footer-socials a[href*="threads.net"]');
    await expect(threadsLink).toBeVisible();
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
