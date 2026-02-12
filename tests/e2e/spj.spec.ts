import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Quest Board)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Go to page
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
  });

  test('should display Header Plaque', async ({ page }) => {
    await expect(page.locator('.header-plaque h1')).toContainText('塞趴卷冒險公會');
  });

  test('should display Registration Form (Hero)', async ({ page }) => {
    await expect(page.locator('#registration-form')).toBeVisible();
    await expect(page.locator('.profile-photo')).toHaveAttribute('src', '/assets/img/guild/spj/avatar.webp');
    await expect(page.locator('.form-details')).toContainText('具現化系鍊金術師');
  });

  test('should display Notices', async ({ page }) => {
    const notices = page.locator('.paper-note');
    // We expect Registration Form (1) + Intro (1) + Dream (1) = 3 paper notes
    // Wait, the selector .paper-note is used for Notices.
    // Intro and Dream use .paper-note.
    // Registration form uses .paper-note.
    await expect(notices).toHaveCount(3);

    await expect(page.locator('#intro-note')).toContainText('鍊金術師日誌');
    await expect(page.locator('#dream-note')).toContainText('公會願景公告');
  });

  test('should display Bounty Board', async ({ page }) => {
    await expect(page.locator('#bounty-board h2')).toContainText('懸賞佈告欄');
    const posters = page.locator('.wanted-poster');
    await expect(posters).toHaveCount(3);
  });

  test('should have a Three.js canvas background', async ({ page }) => {
    await expect(page.locator('#bg-canvas canvas')).toBeVisible();
  });
});
