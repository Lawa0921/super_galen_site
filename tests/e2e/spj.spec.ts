import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Grand Archive)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
  });

  test('should display Hero with Expanded Role', async ({ page }) => {
    await expect(page.locator('.hero-pre')).toContainText('THE GRAND ARCHITECT');
    await expect(page.locator('.hero-role')).toContainText('weave reality');
  });

  test('should display Chapter I (Narrative)', async ({ page }) => {
    // Check for drop cap content
    await expect(page.locator('#chapter-1')).toContainText('數位荒原的邊境');
    // Check for stats
    await expect(page.locator('.stats-grid')).toContainText('CODE SYNTHESIS');
  });

  test('should display Chapter II (Text Town)', async ({ page }) => {
    await expect(page.locator('#chapter-2')).toContainText('具現化：天書系統');
    await expect(page.locator('#chapter-2')).toContainText('一座漂浮的黃金酒館'); // Specific phrase check
  });

  test('should display Chapter III (Guild)', async ({ page }) => {
    await expect(page.locator('#chapter-3')).toContainText('聖域：塞趴卷公會');
    await expect(page.locator('#chapter-3')).toContainText('吟遊詩人');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
