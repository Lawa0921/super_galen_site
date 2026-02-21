import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Parchment Tavern)', () => {
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

  test('should display Dialogue', async ({ page }) => {
    await expect(page.locator('.dialogue-box')).toBeVisible();
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(1000);
    await expect(page.locator('#dialogue-text')).toContainText('嘿');
  });

  test('should open Parchment on Book Interaction (Simulated)', async ({ page }) => {
    // We can't easily click the 3D book in headless without coordinate guessing,
    // but we can call the exposed global function
    await page.evaluate("window.openScroll()");
    await page.waitForTimeout(1000);

    await expect(page.locator('#quest-parchment')).toBeVisible();
    await expect(page.locator('.parchment-header')).toHaveText('QUEST LOG');
    await expect(page.locator('.quest-title').first()).toContainText('Text Town');
  });

  test('should display Footer Socials at end', async ({ page }) => {
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(2000);
    await expect(page.locator('#footer-socials')).toHaveCSS('opacity', '1');
  });
});
