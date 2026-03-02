import { test, expect } from '@playwright/test';

/**
 * Guild Member: Bèbè Liu RWD 測試
 * 驗證手機版 section 不重疊、lightbox 可開啟
 */

const BASE_URL = '/guild/bebe_liu';

test.describe('Bèbè Liu 手機版 section 不重疊', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('所有相鄰 section 不應重疊', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    const overlaps = await page.evaluate(() => {
      const sections = document.querySelectorAll('.section');
      const results: { from: string; to: string; overlap: number }[] = [];
      for (let i = 0; i < sections.length - 1; i++) {
        const curr = sections[i].getBoundingClientRect();
        const next = sections[i + 1].getBoundingClientRect();
        const currBottom = curr.top + window.scrollY + curr.height;
        const nextTop = next.top + window.scrollY;
        const gap = nextTop - currBottom;
        if (gap < 0) {
          results.push({
            from: sections[i].id,
            to: sections[i + 1].id,
            overlap: Math.round(-gap)
          });
        }
      }
      return results;
    });

    expect(overlaps, `Sections overlap: ${JSON.stringify(overlaps)}`).toHaveLength(0);
  });
});

test.describe('Bèbè Liu Gallery Lightbox', () => {
  test('點擊 gallery 圖片應開啟 lightbox', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    const firstPolaroid = page.locator('.polaroid').first();
    await firstPolaroid.scrollIntoViewIfNeeded();
    await firstPolaroid.click();

    const lightbox = page.locator('.lightbox');
    await expect(lightbox).toBeVisible();
  });

  test('lightbox 應顯示被點擊的圖片', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    const firstPolaroid = page.locator('.polaroid').first();
    await firstPolaroid.scrollIntoViewIfNeeded();
    await firstPolaroid.click();

    const lightboxImg = page.locator('.lightbox img');
    await expect(lightboxImg).toBeVisible();
    await expect(lightboxImg).toHaveAttribute('src', /gallery_01/);
  });

  test('點擊 lightbox 背景應關閉 lightbox', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    const firstPolaroid = page.locator('.polaroid').first();
    await firstPolaroid.scrollIntoViewIfNeeded();
    await firstPolaroid.click();

    const lightbox = page.locator('.lightbox');
    await expect(lightbox).toBeVisible();

    await lightbox.click({ position: { x: 10, y: 10 } });
    await expect(lightbox).not.toBeVisible();
  });
});
