import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (High-Vis Tavern)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
    await page.waitForTimeout(2000);
  });

  test('should display Cinematic Intro', async ({ page }) => {
    await expect(page.locator('#intro-overlay')).toBeVisible();
    await expect(page.locator('.intro-text')).toHaveText('CLICK TO ENTER THE TAVERN');
  });

  test('should Enter and Show Indicator', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(2500); // Wait for zoom

    await expect(page.locator('#book-indicator')).toHaveCSS('opacity', '1');
    await expect(page.locator('#book-indicator')).toHaveText('CLICK ME!');
  });

  test('should Open Quest Parchment', async ({ page }) => {
    await page.evaluate("window.openScroll()");
    await page.waitForTimeout(1000);
    await expect(page.locator('#quest-parchment')).toBeVisible();
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
