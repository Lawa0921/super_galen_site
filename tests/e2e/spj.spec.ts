import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Golden Core)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
    // Wait for loader
    await page.waitForTimeout(1000);
  });

  test('should display Hero Section', async ({ page }) => {
    await expect(page.locator('#hero h1')).toContainText('塞趴卷 SPJ');
    await expect(page.locator('.avatar-img')).toBeVisible();
  });

  test('should display Intro Content', async ({ page }) => {
    // Scroll to Intro
    await page.evaluate("document.getElementById('intro').scrollIntoView()");
    await expect(page.locator('#intro h2')).toContainText('起源代碼');
  });

  test('should display Project Grid', async ({ page }) => {
    await page.evaluate("document.getElementById('projects').scrollIntoView()");
    const projects = page.locator('.project-item');
    await expect(projects).toHaveCount(3);
    await expect(projects.first()).toContainText('文字小鎮');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
