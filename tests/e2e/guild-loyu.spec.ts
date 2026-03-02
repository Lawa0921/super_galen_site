import { test, expect, Page } from '@playwright/test';

/**
 * Guild Member: Lo Yu 羅玉 頁面 E2E 測試
 * 主題：招募官 / 溝通師（Personnel Dossier 風格）
 * 測試進場動畫、區塊可見性、互動效果、內容正確呈現
 */

const BASE_URL = '/guild/loyu';

/** 跳過進場動畫：點擊覆蓋層並等待過渡完成 */
async function dismissIntro(page: Page) {
  const overlay = page.locator('#intro-overlay');
  if (await overlay.isVisible({ timeout: 3000 }).catch(() => false)) {
    await overlay.click();
    await page.waitForTimeout(2500);
  }
}

test.describe('Lo Yu 頁面基礎載入', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('頁面應該正確載入（HTTP 200）', async ({ page }) => {
    const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
  });

  test('應該載入物理背景 canvas', async ({ page }) => {
    await expect(page.locator('#physics-canvas')).toBeAttached();
  });

  test('應該顯示噪點背景層', async ({ page }) => {
    await expect(page.locator('.noise-bg')).toBeAttached();
  });
});

test.describe('Lo Yu 進場動畫 (Personnel File Access)', () => {
  test('頁面載入時應顯示進場覆蓋層', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const overlay = page.locator('#intro-overlay');
    await expect(overlay).toBeVisible();
  });

  test('進場動畫應包含人物主題的終端文字', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const overlay = page.locator('#intro-overlay');
    await expect(overlay).toContainText('LO YU');
  });

  test('進場動畫應包含照片框元素', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const photoFrame = page.locator('#intro-photo-frame');
    await expect(photoFrame).toBeAttached();
    const img = photoFrame.locator('img');
    await expect(img).toBeAttached();
  });

  test('進場動畫期間應鎖定頁面滾動', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const bodyOverflow = await page.evaluate(() => {
      return window.getComputedStyle(document.body).overflowY;
    });
    expect(bodyOverflow).toBe('hidden');
  });

  test('點擊進場覆蓋層應觸發關閉過渡', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const overlay = page.locator('#intro-overlay');
    await overlay.click();
    await page.waitForTimeout(2500);

    await expect(overlay).not.toBeVisible();
  });

  test('進場結束後 Hero 區塊應該可見', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    await page.locator('#intro-overlay').click();
    await page.waitForTimeout(2500);

    await expect(page.locator('.hero-block')).toBeVisible();
  });
});

test.describe('Lo Yu Hero 區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('Hero 區塊應該顯示頭像', async ({ page }) => {
    await expect(page.locator('.hero-img')).toBeAttached();
    const src = await page.locator('.hero-img').getAttribute('src');
    expect(src).toContain('avatar');
  });

  test('Hero 區塊應該顯示名字「LO YU 羅玉」', async ({ page }) => {
    const heroBlock = page.locator('.hero-block');
    await expect(heroBlock).toBeVisible();
    await expect(heroBlock).toContainText('LO YU');
    await expect(heroBlock).toContainText('羅玉');
  });

  test('Hero 區塊應該顯示身份標籤', async ({ page }) => {
    const tags = page.locator('.htag');
    const count = await tags.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

test.describe('Lo Yu 區塊滾動可見性', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('THE STRATEGIST 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('.strat-block');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(section).toBeVisible();
    await expect(section).toContainText('STRATEGIST');
  });

  test('THE WEAVER 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('.weaver-block');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(section).toBeVisible();
    await expect(section).toContainText('WEAVER');
  });

  test('ARTISAN_WORKSHOP 玉子手作區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-artisan');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(section).toBeVisible();
    await expect(section).toContainText('ARTISAN_WORKSHOP');
  });

  test('ARTISAN_WORKSHOP 應包含產品卡片', async ({ page }) => {
    const section = page.locator('#section-artisan');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const productCards = section.locator('.product-card');
    const count = await productCards.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('ARTISAN_WORKSHOP 產品卡片應包含手作圖片', async ({ page }) => {
    const section = page.locator('#section-artisan');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const productImages = section.locator('.prod-img');
    const count = await productImages.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('MISSION_BRIEFING 職涯時間線區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-mission');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(section).toBeVisible();
    await expect(section).toContainText('MISSION_BRIEFING');
  });

  test('MISSION_BRIEFING 應包含職涯時間線項目', async ({ page }) => {
    const section = page.locator('#section-mission');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const timelineItems = section.locator('.timeline-item');
    const count = await timelineItems.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('COMM_PROTOCOL 溝通哲學區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-comm');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(section).toBeVisible();
    await expect(section).toContainText('COMM_PROTOCOL');
  });

  test('SIGNAL_INTERCEPTS 語錄牆區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-quotes');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(section).toBeVisible();
    await expect(section).toContainText('SIGNAL_INTERCEPTS');
  });

  test('SIGNAL_INTERCEPTS 應包含至少 4 張語錄卡片', async ({ page }) => {
    const section = page.locator('#section-quotes');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const quoteCards = section.locator('.quote-card');
    const count = await quoteCards.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('FIELD_REPORT 成就數據區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-field-report');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(section).toBeVisible();
    await expect(section).toContainText('FIELD_REPORT');
  });

  test('BASE_CAMP 宜蘭生活區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-yilan');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(section).toBeVisible();
    await expect(section).toContainText('BASE_CAMP');
  });

  test('PERSONAL_LOGS 興趣區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('.interests-block');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(section).toBeVisible();
  });

  test('興趣區塊應包含至少 3 張卡片', async ({ page }) => {
    const cards = page.locator('.int-card');
    const section = page.locator('.interests-block');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('Footer 區塊應該在滾動到時可見', async ({ page }) => {
    const footer = page.locator('.footer-block');
    await footer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('CONNECT');
  });
});

test.describe('Lo Yu 互動效果', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('自訂游標元素應該存在', async ({ page }) => {
    const cursor = page.locator('#custom-cursor');
    await expect(cursor).toBeAttached();
  });

  test('點擊應產生脈衝效果容器', async ({ page }) => {
    const rippleContainer = page.locator('#click-ripples');
    await expect(rippleContainer).toBeAttached();
  });

  test('DATA CORE 區塊應包含能力進度條', async ({ page }) => {
    const strat = page.locator('.strat-block');
    await strat.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const statBars = strat.locator('.stat-bar-fill');
    const count = await statBars.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('FIELD_REPORT 應包含數據統計卡片', async ({ page }) => {
    const section = page.locator('#section-field-report');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const statCards = section.locator('.field-stat');
    const count = await statCards.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

test.describe('Lo Yu 社群連結', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);
  });

  test('Footer 區塊應該有社群連結按鈕', async ({ page }) => {
    const footer = page.locator('.footer-block');
    await footer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const socialLinks = footer.locator('.s-btn');
    const count = await socialLinks.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('應包含 Threads 連結', async ({ page }) => {
    const threadsLink = page.locator('a[href*="threads.com"]');
    await expect(threadsLink).toBeAttached();
  });

  test('應包含 Instagram 連結', async ({ page }) => {
    const igLink = page.locator('a[href*="instagram.com"]');
    await expect(igLink.first()).toBeAttached();
  });

  test('應包含 JoyToKnow 連結', async ({ page }) => {
    const jtkLink = page.locator('a[href*="joytoknow.com"]');
    await expect(jtkLink).toBeAttached();
  });
});

test.describe('Lo Yu 響應式設計', () => {
  test('手機版應該正確顯示所有區塊', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);

    await expect(page.locator('.hero-block')).toBeVisible();

    const footer = page.locator('.footer-block');
    await footer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(footer).toBeVisible();
  });

  test('桌面版 Hero 應該是雙欄佈局', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissIntro(page);

    const heroBlock = page.locator('.hero-block');
    await expect(heroBlock).toBeVisible();

    const heroImgCol = page.locator('.hero-img-col');
    const heroTextCol = page.locator('.hero-text-col');
    await expect(heroImgCol).toBeVisible();
    await expect(heroTextCol).toBeVisible();
  });
});
