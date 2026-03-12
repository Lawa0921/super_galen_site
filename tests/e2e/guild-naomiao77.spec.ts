import { test, expect, Page } from '@playwright/test';

/**
 * Guild - naomiao77 Enhanced Page E2E Tests
 * Tests for the naomiao77 guild member page enhancements:
 * back navigation, footer, social links, magic cards, cat collection, entrance overlay, console errors
 */

const BASE_URL = '/guild/naomiao77/';

/** Dismiss entrance overlay via JS click and wait for transition */
async function dismissEntrance(page: Page): Promise<void> {
  const dismissed = await page.evaluate(() => {
    const overlay = document.getElementById('entrance-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
      overlay.click();
      return true;
    }
    return false;
  });
  if (dismissed) {
    await page.waitForTimeout(2500);
  }
}

test.describe('Guild - naomiao77 Enhanced Page', () => {
  test.describe('Back navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await dismissEntrance(page);
    });

    test('should have a link back to /guild/ with text containing ARCHIVE', async ({ page }) => {
      const backLink = page.locator('a[href*="/guild/"]').filter({ hasText: /ARCHIVE/i });
      await expect(backLink).toBeAttached();
      const href = await backLink.getAttribute('href');
      expect(href).toContain('/guild/');
    });
  });

  test.describe('Footer credits', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await dismissEntrance(page);
    });

    test('should contain "Made with" text', async ({ page }) => {
      const madeWith = page.getByText('Made with');
      await expect(madeWith).toBeAttached();
    });

    test('should contain "SuperGalen" text', async ({ page }) => {
      const superGalen = page.getByText("SuperGalen's Dungeon");
      await expect(superGalen).toBeAttached();
    });
  });

  test.describe('Social links', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await dismissEntrance(page);
    });

    test('should have a link to threads.net', async ({ page }) => {
      const link = page.locator('a[href*="threads.net"]').first();
      await expect(link).toBeAttached();
    });

    test('should have a link to instagram.com', async ({ page }) => {
      const link = page.locator('a[href*="instagram.com"]').first();
      await expect(link).toBeAttached();
    });

    test('should have a link to portaly.cc', async ({ page }) => {
      const link = page.locator('a[href*="portaly.cc"]').first();
      await expect(link).toBeAttached();
    });

    test('should have a link to vocus.cc', async ({ page }) => {
      const link = page.locator('a[href*="vocus.cc"]').first();
      await expect(link).toBeAttached();
    });
  });

  test.describe('Magic cards section', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await dismissEntrance(page);
    });

    test('should have a section with class "magic-cards"', async ({ page }) => {
      const magicCards = page.locator('.magic-cards');
      await expect(magicCards).toBeAttached();
    });

    test('should contain flippable card elements', async ({ page }) => {
      const cards = page.locator('.magic-cards .card, .magic-cards .magic-card, .magic-cards .magic-card-wrapper');
      await expect(cards.first()).toBeAttached({ timeout: 10000 });
    });
  });

  test.describe('Cat collection game', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await dismissEntrance(page);
    });

    test('should have a cat counter element with id "cat-counter"', async ({ page }) => {
      const catCounter = page.locator('#cat-counter');
      await expect(catCounter).toBeAttached();
    });
  });

  test.describe('Entrance overlay', () => {
    test('should have entrance overlay present on page load', async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      const overlay = page.locator('#entrance-overlay');
      await expect(overlay).toBeAttached();
    });

    test('should hide entrance overlay after click', async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      const overlay = page.locator('#entrance-overlay');
      await expect(overlay).toBeAttached();

      await page.evaluate(() => {
        const el = document.getElementById('entrance-overlay');
        if (el && !el.classList.contains('hidden')) el.click();
      });
      await page.waitForTimeout(3000);

      // After clicking, the overlay should be hidden or removed
      const isVisible = await overlay.isVisible().catch(() => false);
      expect(isVisible).toBe(false);
    });
  });

  test.describe('Scroll-to-top button', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await dismissEntrance(page);
    });

    test('should have a scroll-to-top button', async ({ page }) => {
      const btn = page.locator('#scroll-to-bottom');
      await expect(btn).toBeAttached();
    });

    test('should scroll to top when clicked', async ({ page }) => {
      // Scroll down to trigger button visibility
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(500);

      const btn = page.locator('#scroll-to-bottom');
      await expect(btn).toBeVisible({ timeout: 5000 });

      await btn.click();
      await page.waitForTimeout(2000);

      // Should be back at the top
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeLessThan(50);
    });
  });

  test.describe('No console errors for MotionPathPlugin', () => {
    test('should not have MotionPathPlugin errors after page load', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      const motionPathErrors = consoleErrors.filter((msg) =>
        msg.toLowerCase().includes('motionpathplugin')
      );
      expect(motionPathErrors).toHaveLength(0);
    });
  });
});
