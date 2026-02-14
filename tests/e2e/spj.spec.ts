import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Quest Storm)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Go to page
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }

    // Wait for loader to disappear (simulated by time or style)
    await page.waitForTimeout(2000);
  });

  test('should display Hero Section', async ({ page }) => {
    // Hero is the first section container
    await expect(page.locator('#sec-hero h1')).toContainText('塞趴卷 SPJ');
    await expect(page.locator('#sec-hero')).toBeVisible(); // Might need to check opacity if animated
  });

  test('should display Project List in Quest Section', async ({ page }) => {
    // Scroll to bottom to ensure Projects section is triggered
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(1000);

    const projects = page.locator('.project-item');
    await expect(projects).toHaveCount(3);
    await expect(projects.first()).toContainText('文字小鎮');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
