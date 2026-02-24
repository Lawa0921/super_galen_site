import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Authentic Tavern)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
    await page.waitForTimeout(2000);
  });

  test('should display Door Overlay initially', async ({ page }) => {
    await expect(page.locator('#door-overlay')).toBeVisible();
    await expect(page.locator('.door-hint')).toHaveText('CLICK TO ENTER');
  });

  test('should Enter Tavern on Click', async ({ page }) => {
    // Click door
    await page.click('#door-overlay');
    await page.waitForTimeout(2500); // Wait for zoom animation

    // Check UI visibility
    await expect(page.locator('#ui-layer')).toHaveCSS('opacity', '1');
    await expect(page.locator('.char-container')).toBeVisible();
  });

  test('should display Footer Socials at end', async ({ page }) => {
    // Enter first
    await page.click('#door-overlay');
    await page.waitForTimeout(2000);

    // Scroll
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(1000);

    await expect(page.locator('#footer-socials')).toHaveCSS('opacity', '1');
  });
});
