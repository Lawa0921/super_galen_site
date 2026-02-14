import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Astral Nexus)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Go to page
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
  });

  test('should display Hero Section with Architect Role', async ({ page }) => {
    await expect(page.locator('.role-badge')).toContainText('GUILD ARCHITECT');
    await expect(page.locator('h1')).toContainText('塞趴卷 SPJ');
    await expect(page.locator('p').first()).toContainText('連結者 · 架構師 · 夢想家');
  });

  test('should display Expanded Protocol Content', async ({ page }) => {
    // Check for "Creation Protocol"
    await expect(page.locator('#protocol h2')).toContainText('創世協議');
    // Check for specific expanded text
    await expect(page.locator('#protocol')).toContainText('語言是構築現實的最小單位');
  });

  test('should display Network/Guild Content', async ({ page }) => {
    await expect(page.locator('#network h2')).toContainText('靈魂網絡');
    await expect(page.locator('#network')).toContainText('連結中樞 (Nexus)');
  });

  test('should display Archive Node List', async ({ page }) => {
    const nodes = page.locator('.node-item');
    await expect(nodes).toHaveCount(3);
    await expect(nodes.first()).toContainText('文字小鎮 (Text Town)');
  });

  test('should have Three.js canvas', async ({ page }) => {
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });
});
