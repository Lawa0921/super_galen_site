import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Interactive Tavern)', () => {
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
    await page.mouse.wheel(0, 100); // Trigger update
    await page.waitForTimeout(1000);
    // Note: The text is "嘿，你來了...", but contains "快進來" which implies welcome context.
    // Let's check for "嘿" or "暖暖身子" which is in the first script line.
    await expect(page.locator('#dialogue-text')).toContainText('嘿');
  });

  test('should display Skill Board on Scroll', async ({ page }) => {
    // Scroll to Beat 2 (Menu) -> ~20-30%
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.25)");
    await page.waitForTimeout(2000);

    // Check if opacity is 1 (visible)
    const board = page.locator('#skill-board');
    await expect(board).toHaveCSS('opacity', '1');
    await expect(board).toContainText('SPECIALS');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
