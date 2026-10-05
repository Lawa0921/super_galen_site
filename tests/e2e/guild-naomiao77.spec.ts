import { test, expect, Page } from '@playwright/test';

/**
 * Guild - naomiao77 Enhanced Page E2E Tests
 * Tests for the naomiao77 guild member page enhancements:
 * back navigation, footer, social links, magic cards, cat collection, entrance overlay, console errors
 */

const BASE_URL = '/guild/naomiao77/';

/** Enter through the visible overlay and wait until it stops blocking the page. */
async function dismissEntrance(page: Page): Promise<void> {
  const overlay = page.locator('#entrance-overlay');
  await overlay.click();
  await expect(overlay).toBeHidden();
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
      await dismissEntrance(page);
    });

    test('stalled entrance animation still reveals usable content', async ({ page }) => {
      await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.clock.pauseAt(new Date('2026-10-05T01:00:00Z'));
      await page.evaluate(() => {
        const animation = (window as any).gsap;
        document.getElementById('entrance-overlay')!.click();
        // 模擬低幀率或背景頁面：停止動畫，再由瀏覽器時鐘推進 fallback 計時。
        animation.ticker.sleep();
        animation.ticker.wake = () => {};
      });
      await page.clock.fastForward(5000);
      await expect(page.locator('#entrance-overlay')).toBeHidden({ timeout: 5000 });
      await expect(page.locator('#main-content')).toHaveCSS('opacity', '1');
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
      await page.evaluate(() => window.scrollTo(0, 500));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
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

  test.describe('Paint cinema (scroll-scrub painting)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await dismissEntrance(page);
    });

    test('should have a #paint-cinema section with 8 painting frames', async ({ page }) => {
      const section = page.locator('#paint-cinema');
      await expect(section).toBeAttached();
      const frames = page.locator('#paint-cinema .paint-frame');
      await expect(frames).toHaveCount(8);
    });

    test('should have a final reveal with the real artwork and a caption element', async ({ page }) => {
      await expect(page.locator('#paint-final')).toBeAttached();
      await expect(page.locator('#paint-final img[src*="cat-on-whale"]')).toBeAttached();
      await expect(page.locator('#paint-caption')).toBeAttached();
    });

    test('should advance frames when scrolling through the pinned section', async ({ page }) => {
      const lastFrame = page.locator('#paint-cinema .paint-frame').last();
      // Before scrolling, the last frame is hidden
      const opacityBefore = await lastFrame.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
      expect(opacityBefore).toBeLessThan(0.5);

      // Scroll deep into the pinned section (instant — the page sets scroll-behavior: smooth)
      await page.evaluate(() => {
        const section = document.getElementById('paint-cinema');
        if (section) {
          const top = section.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top: top + 3600, behavior: 'instant' });
        }
      });
      await page.waitForTimeout(2000);

      const opacityAfter = await lastFrame.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
      expect(opacityAfter).toBeGreaterThan(0.5);
    });
  });

  test.describe('Hero cat shopkeeper', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await dismissEntrance(page);
    });

    test('should have the SVG cat and the stall sign', async ({ page }) => {
      await expect(page.locator('#hero-cat')).toBeAttached();
      await expect(page.locator('#stall-sign')).toBeAttached();
    });

    test('should show a speech bubble when the cat is poked', async ({ page }) => {
      await page.evaluate(() => {
        document.getElementById('hero-cat-wrap')?.click();
      });
      await page.waitForTimeout(500);
      const bubble = page.locator('#hero-cat-bubble');
      await expect(bubble).toHaveClass(/show/);
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
