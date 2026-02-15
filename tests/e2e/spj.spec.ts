import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Spirit Tavern)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
    // Wait for loader to vanish
    await page.waitForTimeout(2000);
  });

  test('should display Hero Section', async ({ page }) => {
    await expect(page.locator('#panel-hero h1')).toContainText('塞趴卷');
    await expect(page.locator('.hero-subtitle')).toContainText('THE GUILD ARCHITECT');
  });

  test('should display Origin Panel', async ({ page }) => {
    // It's off-screen initially, but exists in DOM
    await expect(page.locator('#panel-origin h2')).toContainText('代碼鍊金術');
  });

  test('should display Project Cards', async ({ page }) => {
    const cards = page.locator('.project-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText('文字小鎮');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
