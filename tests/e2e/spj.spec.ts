import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Infinite Board)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Go to page
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }

    // There is no preloader in this version, but let's wait a moment for Three.js init
    await page.waitForTimeout(2000);
  });

  test('should display Hero Wanted Poster', async ({ page }) => {
    // Check for the "WANTED" text
    await expect(page.locator('#hero-poster h2')).toContainText('WANTED');
    await expect(page.locator('.wanted-title')).toHaveText('SPJ');
    // Check avatar image source
    const avatar = page.locator('#hero-poster img');
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveAttribute('src', '/assets/img/guild/spj/avatar.webp');
  });

  test('should display Intro Diary', async ({ page }) => {
    await expect(page.locator('#intro-page h2')).toContainText('鍊金術師');
    await expect(page.locator('#intro-page p').first()).toContainText('軟體工程師');
  });

  test('should display Dream Blueprint', async ({ page }) => {
    // It's far off screen initially, but should be in DOM
    await expect(page.locator('#dream-blueprint h2')).toContainText('公會藍圖');
    await expect(page.locator('#dream-blueprint')).toBeAttached();
  });

  test('should display Project Sticky Notes', async ({ page }) => {
    const notes = page.locator('.sticky-note');
    await expect(notes).toHaveCount(3);
    await expect(notes.first()).toContainText('文字小鎮');
  });

  test('should have a Three.js canvas overlay', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
