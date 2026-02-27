import { test, expect, Page } from '@playwright/test';

/**
 * Guild Member: Nick 頁面 E2E 測試
 * 驗證效能優化後的各項需求：
 * - 無外部函式庫 (Font Awesome, GSAP, Three.js)
 * - 圖示改為 inline SVG
 * - Canvas 2D 背景取代 Three.js
 * - Noise overlay 已移除
 * - 圖片 CLS 優化
 */

const BASE_URL = '/guild/nick';

/** 跳過 INSERT COIN 畫面：點擊並等待過渡完成 */
async function dismissCoinScreen(page: Page) {
  const coinScreen = page.locator('#coinScreen');
  if (await coinScreen.isVisible({ timeout: 3000 }).catch(() => false)) {
    await coinScreen.click();
    await page.waitForTimeout(800);
  }
}

// ─── Phase 0a: 基礎載入 ───

test.describe('Nick 頁面基礎載入', () => {
  test('頁面應該正確載入（HTTP 200）', async ({ page }) => {
    const response = await page.goto(BASE_URL);
    expect(response?.status()).toBe(200);
  });

  test('INSERT COIN 畫面應正常運作', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    const coinScreen = page.locator('#coinScreen');
    await expect(coinScreen).toBeVisible();
    await expect(page.locator('.coin-prompt')).toContainText('INSERT COIN');

    // Click to start game
    await coinScreen.click();
    await page.waitForTimeout(800);

    const pageWrapper = page.locator('#pageWrapper');
    await expect(pageWrapper).toHaveClass(/is-visible/);
  });
});

// ─── Phase 0b: 無外部函式庫 ───

test.describe('Nick 頁面不載入外部函式庫', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('不應載入 Font Awesome CDN', async ({ page }) => {
    const faLink = page.locator('link[href*="font-awesome"]');
    await expect(faLink).toHaveCount(0);
  });

  test('不應載入 GSAP script', async ({ page }) => {
    const gsapScript = page.locator('script[src*="gsap"]');
    await expect(gsapScript).toHaveCount(0);
  });

  test('不應載入 ScrollTrigger script', async ({ page }) => {
    const scrollTriggerScript = page.locator('script[src*="ScrollTrigger"]');
    await expect(scrollTriggerScript).toHaveCount(0);
  });
});

// ─── Phase 0c: Inline SVG 圖示 ───

test.describe('Nick 頁面圖示為 inline SVG', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissCoinScreen(page);
  });

  test('不應有任何 Font Awesome <i> 元素', async ({ page }) => {
    const faIcons = page.locator('i[class*="fa-"]');
    await expect(faIcons).toHaveCount(0);
  });

  test('導航列返回按鈕應使用 inline SVG', async ({ page }) => {
    const navBackSvg = page.locator('.nav-back svg');
    await expect(navBackSvg).toBeAttached();
  });

  test('導航列社交連結應使用 inline SVG', async ({ page }) => {
    const navLinksSvgs = page.locator('.nav-links a svg');
    const count = await navLinksSvgs.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('聯絡按鈕應使用 inline SVG', async ({ page }) => {
    const contactBtnSvgs = page.locator('.contact-btn svg');
    const count = await contactBtnSvgs.count();
    expect(count).toBe(4);
  });

  test('Footer 愛心應使用 inline SVG', async ({ page }) => {
    const footerSvg = page.locator('.site-footer svg');
    await expect(footerSvg).toBeAttached();
  });
});

// ─── Phase 0d: Canvas 背景 ───

test.describe('Nick 頁面 Canvas 背景', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissCoinScreen(page);
  });

  test('Canvas 背景元素應該存在', async ({ page }) => {
    const canvas = page.locator('#webgl');
    await expect(canvas).toBeAttached();
  });
});

// ─── Phase 0e: Noise overlay 已移除 ───

test.describe('Nick 頁面 Noise overlay 已移除', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('不應存在 noise-overlay 元素', async ({ page }) => {
    const noiseOverlay = page.locator('.noise-overlay');
    await expect(noiseOverlay).toHaveCount(0);
  });
});

// ─── Phase 0f: 圖片 CLS 優化 ───

test.describe('Nick 頁面圖片 CLS 優化', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissCoinScreen(page);
  });

  test('所有圖片應有 width 和 height 屬性', async ({ page }) => {
    const images = page.locator('img');
    const count = await images.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const width = await img.getAttribute('width');
      const height = await img.getAttribute('height');
      const src = await img.getAttribute('src');
      expect(width, `img[src="${src}"] missing width`).toBeTruthy();
      expect(height, `img[src="${src}"] missing height`).toBeTruthy();
    }
  });
});

// ─── Phase 0g: 捲動動畫正常觸發 ───

test.describe('Nick 頁面捲動動畫', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissCoinScreen(page);
  });

  test('Timeline nodes 應在捲動後顯示', async ({ page }) => {
    const firstNode = page.locator('[data-anim="timeline"]').first();
    await firstNode.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await expect(firstNode).toHaveClass(/visible/);
  });

  test('Project cards 應在捲動後顯示', async ({ page }) => {
    const firstCard = page.locator('[data-anim="project"]').first();
    await firstCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await expect(firstCard).toHaveCSS('opacity', '1');
  });

  test('Achievement rows 應在捲動後顯示', async ({ page }) => {
    const firstAchievement = page.locator('[data-anim="achievement"]').first();
    await firstAchievement.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await expect(firstAchievement).toHaveCSS('opacity', '1');
  });

  test('Stat cards 應在捲動後顯示', async ({ page }) => {
    const firstStatCard = page.locator('.stat-card').first();
    await firstStatCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await expect(firstStatCard).toHaveCSS('opacity', '1');
  });
});
