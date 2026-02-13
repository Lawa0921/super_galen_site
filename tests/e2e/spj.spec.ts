import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Void Alchemist)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Go to page
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
  });

  test('should display Hero Section with Void Theme', async ({ page }) => {
    // Check for new class names
    await expect(page.locator('.hero-title')).toContainText('具現化系');
    await expect(page.locator('.hero-title')).toContainText('鍊金術師');
    // Check avatar
    const avatar = page.locator('.avatar-img');
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveAttribute('src', '/assets/img/guild/spj/avatar.webp');
  });

  test('should display Narrative Content', async ({ page }) => {
    await expect(page.locator('#intro h2')).toContainText('起源代碼 (ORIGIN)');
    await expect(page.locator('#dream h2')).toContainText('公會協議 (PROTOCOL)');
  });

  test('should display Project Cards (Grid)', async ({ page }) => {
    const cards = page.locator('.project-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText('文字小鎮');
    await expect(cards.first().locator('.project-rank')).toContainText('S-CLASS');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
