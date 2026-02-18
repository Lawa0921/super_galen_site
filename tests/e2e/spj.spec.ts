import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Materialization Engine)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
  });

  test('should display Hero Section', async ({ page }) => {
    // Initial state (Hero) should be visible or fading in
    await expect(page.locator('#sec-hero h1')).toContainText('塞趴卷 SPJ');
    await expect(page.locator('.brand')).toContainText('GUILD_HALL');
  });

  test('should display Intro', async ({ page }) => {
    // Scroll to Intro (25% of height approx)
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.2)");
    await page.waitForTimeout(1000);

    await expect(page.locator('#sec-intro h2')).toContainText('起源代碼');
  });

  test('should display Projects', async ({ page }) => {
    // Scroll to end
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(1000);

    await expect(page.locator('#sec-projects')).toContainText('具現化紀錄');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
