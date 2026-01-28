import { test, expect } from '@playwright/test';

/**
 * Astro 網站 E2E 測試
 * 確保遷移後功能正常運作
 */

test.describe('首頁載入與基礎功能', () => {
  test.beforeEach(async ({ page }) => {
    // Astro 使用 URL 路由 i18n，根路徑會重定向到 /zh-TW/
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');
  });

  test('首頁應該正確載入 RPG 介面', async ({ page }) => {
    await expect(page.locator('.rpg-interface')).toBeVisible();
    await expect(page.locator('.game-container')).toBeVisible();
  });

  test('應該顯示網站標題', async ({ page }) => {
    await expect(page.locator('.site-title')).toBeVisible();
    await expect(page.locator('.site-title')).toContainText(/SuperGalen/);
  });

  test('應該顯示狀態列', async ({ page }) => {
    await expect(page.locator('.status-bar')).toBeVisible();
  });
});

test.describe('頁籤導航系統', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');
  });

  test('應該顯示遊戲頁籤', async ({ page }) => {
    await expect(page.locator('.game-tabs')).toBeVisible();
  });

  test('預設應該顯示狀態頁籤', async ({ page }) => {
    await expect(page.locator('#status-tab')).toBeVisible();
  });

  test('點擊頁籤應該切換內容', async ({ page }) => {
    // 點擊技能頁籤
    await page.click('[data-tab="skills"]');
    await expect(page.locator('#skills-tab')).toBeVisible();

    // 點擊物品頁籤
    await page.click('[data-tab="inventory"]');
    await expect(page.locator('#inventory-tab')).toBeVisible();

    // 點擊成就頁籤
    await page.click('[data-tab="achievements"]');
    await expect(page.locator('#achievements-tab')).toBeVisible();

    // 點擊購買頁籤
    await page.click('[data-tab="purchase"]');
    await expect(page.locator('#purchase-tab')).toBeVisible();
  });
});

test.describe('狀態頁籤內容', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');
  });

  test('應該顯示屬性網格', async ({ page }) => {
    await expect(page.locator('.attributes-grid')).toBeVisible();
  });

  test('應該顯示屬性項目', async ({ page }) => {
    // 檢查至少有一個屬性項目
    const attributeItems = page.locator('.attribute-item');
    await expect(attributeItems.first()).toBeVisible();

    // 應該有多個屬性
    const count = await attributeItems.count();
    expect(count).toBeGreaterThan(5);
  });

  test('屬性應該有進度條', async ({ page }) => {
    await expect(page.locator('.attr-bar').first()).toBeVisible();
    await expect(page.locator('.attr-fill').first()).toBeVisible();
  });
});

test.describe('技能樹頁籤', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');
    await page.click('[data-tab="skills"]');
  });

  test('應該顯示技能樹 Canvas', async ({ page }) => {
    await page.waitForTimeout(500);
    const canvas = page.locator('#skill-tree-canvas');
    await expect(canvas).toBeVisible();
  });

  test('應該顯示縮放控制', async ({ page }) => {
    await expect(page.locator('.zoom-controls')).toBeVisible();
  });
});

test.describe('物品欄頁籤', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');
    await page.click('[data-tab="inventory"]');
  });

  test('應該顯示物品欄介面', async ({ page }) => {
    await expect(page.locator('.inventory-panel')).toBeVisible();
  });

  test('應該顯示裝備區和背包區', async ({ page }) => {
    await expect(page.locator('.equipment-section')).toBeVisible();
    await expect(page.locator('.bag-section')).toBeVisible();
  });

  test('應該有裝備格子', async ({ page }) => {
    const equipmentSlots = page.locator('.equipment-slot');
    const count = await equipmentSlots.count();
    expect(count).toBeGreaterThan(0);
  });

  test('應該有背包格子', async ({ page }) => {
    const bagSlots = page.locator('.bag-slot');
    const count = await bagSlots.count();
    expect(count).toBeGreaterThan(20);
  });
});

test.describe('成就系統頁籤', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');
    await page.click('[data-tab="achievements"]');
  });

  test('應該顯示成就面板', async ({ page }) => {
    await expect(page.locator('.achievements-panel')).toBeVisible();
  });

  test('應該顯示成就統計', async ({ page }) => {
    await expect(page.locator('.achievements-stats')).toBeVisible();
  });

  test('應該顯示成就卡片', async ({ page }) => {
    const achievementCards = page.locator('.achievement-card');
    await expect(achievementCards.first()).toBeVisible();
  });
});

test.describe('購買頁籤 (Web3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');
    await page.click('[data-tab="purchase"]');
  });

  test('應該顯示購買面板', async ({ page }) => {
    await expect(page.locator('.purchase-panel')).toBeVisible();
  });

  test('應該顯示錢包連接組件', async ({ page }) => {
    await expect(page.locator('.wallet-connect')).toBeVisible();
  });

  test('應該有連接錢包按鈕', async ({ page }) => {
    await expect(page.locator('#connect-wallet-btn')).toBeVisible();
  });
});

test.describe('語言切換功能', () => {
  test('應該顯示語言切換器', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.language-switcher')).toBeVisible();
  });

  test('點擊語言應該導航到對應路徑', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');

    // 點擊英文連結
    const enLink = page.locator('.language-switcher a[href*="/en/"]');
    if (await enLink.isVisible()) {
      await enLink.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/en\//);
    }
  });

  test('各語言版本應該可用', async ({ page }) => {
    const languages = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];

    for (const lang of languages) {
      const response = await page.goto(`/${lang}/`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('.rpg-interface')).toBeVisible();
    }
  });
});

test.describe('部落格系統', () => {
  test('部落格列表頁應該載入', async ({ page }) => {
    await page.goto('/zh-TW/blog/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.post-list')).toBeVisible();
  });

  test('應該顯示文章卡片', async ({ page }) => {
    await page.goto('/zh-TW/blog/');
    await page.waitForLoadState('networkidle');

    const postItems = page.locator('.post-item');
    const count = await postItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('點擊文章應該導航到文章頁面', async ({ page }) => {
    await page.goto('/zh-TW/blog/');
    await page.waitForLoadState('networkidle');

    // 點擊第一篇文章
    const firstPost = page.locator('.post-link').first();
    await firstPost.click();
    await page.waitForLoadState('networkidle');

    // 應該顯示文章內容
    await expect(page.locator('.blog-post')).toBeVisible();
    await expect(page.locator('.post-content')).toBeVisible();
  });

  test('文章頁面應該有返回連結', async ({ page }) => {
    await page.goto('/zh-TW/blog/');
    await page.waitForLoadState('networkidle');

    const firstPost = page.locator('.post-link').first();
    await firstPost.click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.back-link')).toBeVisible();
  });
});

test.describe('RSS Feed', () => {
  test('各語言 RSS Feed 應該可用', async ({ page }) => {
    const languages = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];

    for (const lang of languages) {
      const response = await page.goto(`/${lang}/rss.xml`);
      expect(response?.status()).toBe(200);

      const contentType = response?.headers()['content-type'];
      expect(contentType).toContain('xml');
    }
  });
});

test.describe('SEO 元素', () => {
  test('首頁應該有正確的 meta 標籤', async ({ page }) => {
    await page.goto('/zh-TW/');

    // 檢查 title
    await expect(page).toHaveTitle(/SuperGalen/);

    // 檢查 description
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /.+/);

    // 檢查 Open Graph
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', /.+/);

    const ogDescription = page.locator('meta[property="og:description"]');
    await expect(ogDescription).toHaveAttribute('content', /.+/);

    // 檢查 Twitter Card
    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveAttribute('content', 'summary_large_image');
  });

  test('應該有 canonical URL', async ({ page }) => {
    await page.goto('/zh-TW/');
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /.+/);
  });

  test('應該有 hreflang 標籤', async ({ page }) => {
    await page.goto('/zh-TW/');

    const hreflangZhTW = page.locator('link[hreflang="zh-TW"]');
    await expect(hreflangZhTW).toHaveAttribute('href', /.+/);

    const hreflangEn = page.locator('link[hreflang="en"]');
    await expect(hreflangEn).toHaveAttribute('href', /.+/);
  });

  test('應該有 JSON-LD 結構化資料', async ({ page }) => {
    await page.goto('/zh-TW/');
    const jsonLd = page.locator('script[type="application/ld+json"]');
    // script 標籤不會是 visible，但應該存在於 DOM 中
    await expect(jsonLd).toHaveCount(1);

    // 驗證 JSON-LD 內容有效
    const content = await jsonLd.textContent();
    expect(content).toBeTruthy();
    const parsed = JSON.parse(content!);
    expect(parsed['@context']).toBe('https://schema.org');
  });
});

test.describe('響應式設計', () => {
  test('桌面版應該正確顯示', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.game-container')).toBeVisible();
    await expect(page.locator('.game-tabs')).toBeVisible();
  });

  test('平板版應該正確顯示', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.game-container')).toBeVisible();
  });

  test('手機版應該正確顯示', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/zh-TW/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.game-container')).toBeVisible();
  });
});

test.describe('根路徑重定向', () => {
  test('根路徑應該重定向到預設語言', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 應該重定向到 /zh-TW/
    await expect(page).toHaveURL(/\/zh-TW\//);
  });
});
