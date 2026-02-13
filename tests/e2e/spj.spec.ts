import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Cinematic RPG)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Go to page
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
  });

  test('should display Hero Card with Stats', async ({ page }) => {
    await expect(page.locator('.hero-card')).toBeVisible();
    await expect(page.locator('.class-label')).toContainText('Materialization Alchemist');
    await expect(page.locator('.stat-label').first()).toBeVisible();
  });

  test('should display Archive Log', async ({ page }) => {
    await expect(page.locator('.log-title')).toContainText('THE ARCHIVES');
    await expect(page.locator('.log-content')).toContainText('軟體工程師');
  });

  test('should display Quest Cards', async ({ page }) => {
    const quests = page.locator('.quest-card');
    await expect(quests).toHaveCount(3);
    await expect(quests.first()).toContainText('文字小鎮');
    await expect(quests.first().locator('.quest-rank')).toContainText('RANK S');
  });

  test('should have Torch Light overlay', async ({ page }) => {
    await expect(page.locator('#torch-light')).toBeVisible();
  });
});
