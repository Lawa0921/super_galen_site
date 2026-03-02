import { test, expect, Page } from '@playwright/test';

/**
 * NEKOPAPAYA 公會頁面 E2E 測試
 * 測試燈塔與船主題互動效果
 */

async function waitForPageReady(page: Page): Promise<void> {
  // 等待載入動畫完成（intro fade-out 4s）
  await page.waitForTimeout(5000);
  // 處理 vite overlay
  const viteOverlay = page.locator('vite-error-overlay');
  if (await viteOverlay.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

test.describe('NEKOPAPAYA Guild Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guild/nekopapaya', { waitUntil: 'domcontentloaded', timeout: 60000 });
  });

  test('should have correct page title', async ({ page }) => {
    await expect(page).toHaveTitle(/NEKOPAPAYA/i);
  });

  test('should display lighthouse intro animation', async ({ page }) => {
    const intro = page.locator('#lighthouse-intro');
    await expect(intro).toBeVisible({ timeout: 5000 });
  });

  test('should show navigation back link', async ({ page }) => {
    await waitForPageReady(page);
    const navLink = page.locator('.nav-fixed').first();
    await expect(navLink).toBeVisible();
  });

  test('should display hero section with avatar', async ({ page }) => {
    await waitForPageReady(page);
    const avatar = page.locator('.avatar-container img');
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveAttribute('alt', /NEKOPAPAYA/i);
  });

  test('should display hero title', async ({ page }) => {
    await waitForPageReady(page);
    const heroTitle = page.locator('.hero-section h1').first();
    await expect(heroTitle).toBeVisible();
    await expect(heroTitle).toContainText('避風港');
  });

  test('should display about section', async ({ page }) => {
    await waitForPageReady(page);
    const aboutSection = page.locator('#about');
    await expect(aboutSection).toBeVisible();
  });

  test('should display activities section', async ({ page }) => {
    await waitForPageReady(page);
    const activitiesSection = page.locator('#activities');
    await expect(activitiesSection).toBeVisible();
  });

  test('should display interests section', async ({ page }) => {
    await waitForPageReady(page);
    const interestsSection = page.locator('#interests');
    await expect(interestsSection).toBeVisible();
  });

  test('should display philosophy section', async ({ page }) => {
    await waitForPageReady(page);
    const philosophySection = page.locator('#philosophy');
    await expect(philosophySection).toBeVisible();
  });

  test('should display contact section with social links', async ({ page }) => {
    await waitForPageReady(page);
    const contactSection = page.locator('#contact');
    await expect(contactSection).toBeVisible();

    const threadsLink = page.locator('a[href*="threads.net/@nekopapaya"]');
    await expect(threadsLink).toBeVisible();

    const instaLink = page.locator('a[href*="instagram.com/nekopapaya"]');
    await expect(instaLink).toBeVisible();
  });

  test('should have custom cursor elements', async ({ page }) => {
    await waitForPageReady(page);
    const cursorDot = page.locator('.cursor-dot');
    const cursorRing = page.locator('.cursor-ring');
    await expect(cursorDot).toBeAttached();
    await expect(cursorRing).toBeAttached();
  });

  test('should have ripple canvas for click effects', async ({ page }) => {
    await waitForPageReady(page);
    const rippleCanvas = page.locator('#ripple-canvas');
    await expect(rippleCanvas).toBeAttached();
  });

  test('should have WebGL background container', async ({ page }) => {
    await waitForPageReady(page);
    const webglContainer = page.locator('#webgl-container');
    await expect(webglContainer).toBeAttached();
  });

  test('should show scroll indicator on hero', async ({ page }) => {
    await waitForPageReady(page);
    const scrollIndicator = page.locator('.scroll-indicator');
    await expect(scrollIndicator).toBeVisible();
  });

  test('should reveal sections on scroll', async ({ page }) => {
    await waitForPageReady(page);
    await page.evaluate(() => window.scrollTo(0, window.innerHeight));
    await page.waitForTimeout(1500);
    const aboutBlock = page.locator('#about .text-block').first();
    await expect(aboutBlock).toBeVisible();
  });

  test('should have p5 ocean canvas', async ({ page }) => {
    await waitForPageReady(page);
    const p5Ocean = page.locator('#p5-ocean');
    await expect(p5Ocean).toBeAttached();
  });

  test('should have p5 fireflies canvas', async ({ page }) => {
    await waitForPageReady(page);
    const p5Fireflies = page.locator('#p5-fireflies');
    await expect(p5Fireflies).toBeAttached();
  });

  test('should display services section with 4 cards', async ({ page }) => {
    await waitForPageReady(page);
    const servicesSection = page.locator('#services');
    await expect(servicesSection).toBeVisible();
    const serviceCards = page.locator('.service-card');
    await expect(serviceCards).toHaveCount(4);
  });

  test('should display floating photos scattered across sections', async ({ page }) => {
    await waitForPageReady(page);
    const floatingPhotos = page.locator('.floating-photo');
    const count = await floatingPhotos.count();
    expect(count).toBeGreaterThanOrEqual(8);
    const firstImg = page.locator('.floating-photo img').first();
    await expect(firstImg).toBeAttached();
  });

  test('should display stats bar with 3 items', async ({ page }) => {
    await waitForPageReady(page);
    const statItems = page.locator('.stat-item');
    await expect(statItems).toHaveCount(3);
  });

  test('should display voyage log timeline with 5 entries', async ({ page }) => {
    await waitForPageReady(page);
    const voyageSection = page.locator('#voyage-log');
    await expect(voyageSection).toBeVisible();
    const timelineItems = page.locator('.timeline-item');
    await expect(timelineItems).toHaveCount(5);
  });

  test('social links should open in new tab', async ({ page }) => {
    await waitForPageReady(page);
    const threadsLink = page.locator('a[href*="threads.net/@nekopapaya"]');
    await expect(threadsLink).toHaveAttribute('target', '_blank');
  });
});
