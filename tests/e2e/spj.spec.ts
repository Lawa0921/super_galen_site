import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (Lively Tavern)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Go to page
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }
  });

  test('should display Enhanced Content (Skills, Status)', async ({ page }) => {
    // Check for new skill content
    await expect(page.locator('.form-field').filter({ hasText: '技能 Skills' })).toContainText('代碼合成 (Synthesis)');
    // Check for new status content
    await expect(page.locator('.form-field').filter({ hasText: '狀態 Status' })).toContainText('正在將咖啡轉化為魔力');
  });

  test('should display Expanded Narrative', async ({ page }) => {
    // Intro
    await expect(page.locator('#intro-note')).toContainText('深夜裡將創意冶煉成現實');
    // Dream
    await expect(page.locator('#dream-note')).toContainText('疲憊的冒險者（開發者、創作者）');
  });

  test('should display Correct Footer', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toContainText("Made with 🍺 by SuperGalen's Dungeon");
    // Should NOT contain copyright year (unless part of the standard template, but request said remove)
    // The previous implementation had copyright year, this one removed it.
    await expect(footer).not.toContainText('© 2024');

    // Check social link
    const threadsLink = page.locator('a[href*="threads.net/@spj.story"]');
    await expect(threadsLink).toBeVisible();
  });

  test('should have Lantern Glow overlay', async ({ page }) => {
    await expect(page.locator('#lantern-glow')).toBeVisible();
  });
});
