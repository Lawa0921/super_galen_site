import { test, expect, Page } from '@playwright/test';

/**
 * Guild Member: VIC NAIL 東東老師 頁面 E2E 測試
 * 炫彩美甲主題頁面 - 測試載入、互動效果、區塊可見性、內容呈現
 */

const BASE_URL = '/guild/vic';

/** 跳過進場動畫：透過 JS 直接關閉 loader */
async function dismissIntro(page: Page) {
  await page.evaluate(() => {
    const loader = document.getElementById('gel-loader');
    if (loader) {
      loader.classList.add('hidden');
    }
  });
  await page.waitForTimeout(2000);
}

// ─── Phase 0: 基礎載入 ───

test.describe('VIC NAIL 頁面基礎載入', () => {
  test('頁面應該正確載入（HTTP 200）', async ({ page }) => {
    const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
  });

  test('頁面標題應包含 VIC NAIL', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    expect(title).toContain('VIC NAIL');
  });

  test('應顯示進場動畫載入畫面', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const loader = page.locator('#gel-loader');
    await expect(loader).toBeAttached();
  });
});

// ─── Phase 1: 導航列 ───

test.describe('VIC NAIL 導航列', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('應該顯示返回公會按鈕', async ({ page }) => {
    const navBack = page.locator('.nav-back');
    await expect(navBack).toBeVisible();
  });

  test('返回按鈕應連結到 /guild/', async ({ page }) => {
    const navBack = page.locator('.nav-back');
    const href = await navBack.getAttribute('href');
    expect(href).toContain('/guild/');
  });

  test('應該顯示品牌名稱', async ({ page }) => {
    const brand = page.locator('.nav-brand');
    await expect(brand).toBeVisible();
    await expect(brand).toContainText('VIC');
  });
});

// ─── Phase 2: Hero 區塊 ───

test.describe('VIC NAIL Hero 區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('Hero 區塊應該存在', async ({ page }) => {
    const hero = page.locator('#hero');
    await expect(hero).toBeAttached();
  });

  test('應該顯示主標題', async ({ page }) => {
    const title = page.locator('.hero-title');
    await expect(title).toBeVisible();
  });

  test('應該顯示副標題包含東東Vic', async ({ page }) => {
    const subtitle = page.locator('.hero-subtitle');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText('東東Vic');
  });

  test('應該顯示頭像圖片', async ({ page }) => {
    const avatar = page.locator('.hero-avatar img');
    await expect(avatar).toBeAttached();
    const src = await avatar.getAttribute('src');
    expect(src).toContain('avatar');
  });
});

// ─── Phase 3: Canvas 背景 ───

test.describe('VIC NAIL Canvas 背景', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('Canvas 背景元素應該存在', async ({ page }) => {
    const canvas = page.locator('#three-container');
    await expect(canvas).toBeAttached();
  });
});

// ─── Phase 4: 教學哲學區塊 ───

test.describe('VIC NAIL 教學哲學區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('哲學區塊應該存在', async ({ page }) => {
    const section = page.locator('#philosophy');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test('應該顯示三步驟教學法', async ({ page }) => {
    const section = page.locator('#philosophy');
    await section.scrollIntoViewIfNeeded();
    const steps = page.locator('.philosophy-step');
    const count = await steps.count();
    expect(count).toBe(3);
  });
});

// ─── Phase 5: 作品集區塊 ───

test.describe('VIC NAIL 作品集', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('Gallery 區塊應該存在', async ({ page }) => {
    const gallery = page.locator('#gallery');
    await expect(gallery).toBeAttached();
  });

  test('應該有至少 3 張美甲作品圖片', async ({ page }) => {
    const gallery = page.locator('#gallery');
    await gallery.scrollIntoViewIfNeeded();
    const items = page.locator('.gallery-item');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('作品圖片應有 alt 屬性', async ({ page }) => {
    const images = page.locator('.gallery-item img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute('alt');
      expect(alt).toBeTruthy();
    }
  });
});

// ─── Phase 5.5: 課綱區塊 ───

test.describe('VIC NAIL 課綱區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('課綱區塊應該存在', async ({ page }) => {
    const section = page.locator('#curriculum');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test('應該有 10 個課綱項目', async ({ page }) => {
    const section = page.locator('#curriculum');
    await section.scrollIntoViewIfNeeded();
    const items = page.locator('.curriculum-item');
    const count = await items.count();
    expect(count).toBe(10);
  });

  test('應該有課綱資訊標籤', async ({ page }) => {
    const badges = page.locator('.curriculum-badge');
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ─── Phase 6: 人生經歷區塊 ───

test.describe('VIC NAIL 人生經歷', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('經歷區塊應該存在', async ({ page }) => {
    const section = page.locator('#journey');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test('應該有至少 5 個經歷項目', async ({ page }) => {
    const section = page.locator('#journey');
    await section.scrollIntoViewIfNeeded();
    const nodes = page.locator('.journey-node');
    const count = await nodes.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

// ─── Phase 7: 貓咪區塊 ───

test.describe('VIC NAIL 貓咪區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('貓咪區塊應該存在', async ({ page }) => {
    const section = page.locator('#cats');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test('應該有貓咪圖片', async ({ page }) => {
    const section = page.locator('#cats');
    await section.scrollIntoViewIfNeeded();
    const catImages = page.locator('#cats img');
    const count = await catImages.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── Phase 8: 技能區塊 ───

test.describe('VIC NAIL 技能區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('技能區塊應該存在', async ({ page }) => {
    const section = page.locator('#skills');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test('應該顯示多個技能項目', async ({ page }) => {
    const section = page.locator('#skills');
    await section.scrollIntoViewIfNeeded();
    const skills = page.locator('.skill-gauge');
    const count = await skills.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

// ─── Phase 9: Footer ───

test.describe('VIC NAIL Footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('Footer 應該存在', async ({ page }) => {
    const footer = page.locator('.site-footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
  });

  test('Footer 應包含連結', async ({ page }) => {
    const footer = page.locator('.site-footer');
    await footer.scrollIntoViewIfNeeded();
    const links = page.locator('.site-footer a');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Footer 應包含社群連結（Instagram, Facebook, Threads）', async ({ page }) => {
    const footer = page.locator('.site-footer');
    await footer.scrollIntoViewIfNeeded();
    const igLink = page.locator('.site-footer a[aria-label="Instagram"]');
    const fbLink = page.locator('.site-footer a[aria-label="Facebook"]');
    const threadsLink = page.locator('.site-footer a[aria-label="Threads"]');
    await expect(igLink).toBeAttached();
    await expect(fbLink).toBeAttached();
    await expect(threadsLink).toBeAttached();
  });
});

// ─── Phase 10: 互動效果 ───

test.describe('VIC NAIL 互動效果', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('滾動進度條應該存在', async ({ page }) => {
    const progress = page.locator('#scroll-progress');
    await expect(progress).toBeAttached();
  });

  test('自訂游標元素應該存在', async ({ page }) => {
    const cursor = page.locator('#custom-cursor');
    await expect(cursor).toBeAttached();
  });

  test('點擊時應產生特效元素', async ({ page }) => {
    await page.click('body', { position: { x: 400, y: 400 } });
    await page.waitForTimeout(100);
    const sparkle = page.locator('.click-sparkle');
    const count = await sparkle.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('應有視差效果元素', async ({ page }) => {
    const parallaxElements = page.locator('[data-parallax]');
    const count = await parallaxElements.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── Phase 11: 響應式設計 ───

test.describe('VIC NAIL 響應式設計', () => {
  test('在手機視窗下應正常顯示', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
    const hero = page.locator('#hero');
    await expect(hero).toBeVisible();
  });

  test('在平板視窗下應正常顯示', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
    const hero = page.locator('#hero');
    await expect(hero).toBeVisible();
  });
});

// ─── Phase 12: 圖片優化 ───

test.describe('VIC NAIL 圖片優化', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('所有圖片應有 width 和 height 屬性防止 CLS', async ({ page }) => {
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const width = await img.getAttribute('width');
      const height = await img.getAttribute('height');
      expect(width, `Image ${i} missing width`).toBeTruthy();
      expect(height, `Image ${i} missing height`).toBeTruthy();
    }
  });
});
