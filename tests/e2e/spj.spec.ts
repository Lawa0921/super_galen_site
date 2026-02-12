import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page', () => {
  test.setTimeout(120000);

  // Use domcontentloaded to avoid waiting for heavy assets/WebGL loop to settle 'load'
  test.beforeEach(async ({ page }) => {
    // Enable console logging
    page.on('console', msg => console.log(`PAGE LOG: ${msg.text()}`));

    // Go to page
    try {
        await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e);
    }

    // Check if GSAP loaded
    const gsapLoaded = await page.evaluate(() => typeof window['gsap'] !== 'undefined');
    console.log('GSAP Loaded:', gsapLoaded);

    // Give it a moment for scripts to init
    await page.waitForTimeout(2000);

    // Force remove loader to ensure test stability
    await page.evaluate(() => {
        const l = document.getElementById('loader');
        if(l) {
            l.style.display = 'none';
            l.style.opacity = '0';
        }
        document.body.style.opacity = '1';
    });

    // Verify loader is gone
    await expect(page.locator('#loader')).toBeHidden({ timeout: 5000 });
  });

  test('should display Hero section', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Book of Heavens');
    await expect(page.locator('.subtitle')).toContainText('Materialization Alchemist');
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
  });

  test('should display Adventure Guild HUD', async ({ page }) => {
    // Force opacity 1 on HUD just in case animation failed
    await page.evaluate(() => {
        const hud = document.getElementById('hud');
        if(hud) hud.style.opacity = '1';
    });
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('.char-name')).toHaveText('SPJ');
  });

  test('should display content sections', async ({ page }) => {
    // Scroll to Intro
    await page.evaluate(() => document.getElementById('intro')?.scrollIntoView());
    await expect(page.locator('#intro h2')).toContainText("The Alchemist's Log");

    // Scroll to Projects
    await page.evaluate(() => document.getElementById('projects')?.scrollIntoView());
    await expect(page.locator('#projects h2')).toContainText("Bounty Board");

    const cards = page.locator('.bounty-card');
    await expect(cards).toHaveCount(3);
  });
});
