import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Golden Thread)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
  });

  test('should display Hero Section', async ({ page }) => {
    await expect(page.locator('#sec-hero h1')).toContainText('連結者 SPJ');
    await expect(page.locator('.hero-avatar')).toBeVisible();
  });

  test('should display Interconnected Sections', async ({ page }) => {
    // Scroll to Intro to trigger animation
    await page.evaluate(() => document.getElementById('sec-intro')?.scrollIntoView());
    await page.waitForTimeout(1000); // Wait for animation

    // Check Intro
    await expect(page.locator('#sec-intro h2')).toContainText('創世協議');
    // Check Connector Line existence (might be width 0 initially, check attached)
    await expect(page.locator('#sec-intro .connector-line')).toBeAttached();

    // Check Guild
    await expect(page.locator('#sec-guild h2')).toContainText('靈魂網絡');
  });

  test('should display Projects', async ({ page }) => {
    const projects = page.locator('.project-item');
    await expect(projects).toHaveCount(3);
    await expect(projects.first()).toContainText('文字小鎮');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
