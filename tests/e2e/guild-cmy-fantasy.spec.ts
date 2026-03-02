import { test, expect, Page } from '@playwright/test';

/**
 * Guild Member: CMY Fantasy (原色⭐︎ふぁんたじー) 頁面 E2E 測試
 * 日系偶像團體風格頁面 - 測試結構、互動效果、內容呈現
 */

const BASE_URL = '/guild/cmy_fantasy';

/** 跳過進場動畫：透過 JS 點擊覆蓋層並等待過渡完成 */
async function dismissEntrance(page: Page) {
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

test.describe('CMY Fantasy 頁面基礎載入', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('頁面應該正確載入（HTTP 200）', async ({ page }) => {
    const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
  });

  test('頁面標題應包含團體名稱', async ({ page }) => {
    const title = await page.title();
    expect(title).toMatch(/CMY|原色|ふぁんたじー|Fantasy/i);
  });

  test('應該有返回公會大廳的導航連結', async ({ page }) => {
    const backLink = page.locator('a[href*="/guild"]').first();
    await expect(backLink).toBeAttached();
  });
});

test.describe('CMY Fantasy 進場動畫', () => {
  test('應該顯示進場覆蓋層', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const overlay = page.locator('#entrance-overlay');
    await expect(overlay).toBeAttached();
  });

  test('點擊後進場覆蓋層應該消失', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const overlay = page.locator('#entrance-overlay');
    // Use JS to dismiss - overlay may auto-dismiss or be intercepted
    await page.evaluate(() => {
      const el = document.getElementById('entrance-overlay');
      if (el && !el.classList.contains('hidden')) el.click();
    });
    await page.waitForTimeout(3000);
    // Overlay is removed from DOM after dismiss transition completes
    await expect(overlay).not.toBeAttached();
  });
});

test.describe('CMY Fantasy 游標互動效果', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('應該有自訂游標追蹤元素', async ({ page }) => {
    const cursor = page.locator('#custom-cursor');
    await expect(cursor).toBeAttached();
  });

  test('應該有游標軌跡 canvas', async ({ page }) => {
    const trail = page.locator('#cursor-trail');
    await expect(trail).toBeAttached();
  });
});

test.describe('CMY Fantasy Hero 區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('Hero 區塊應該存在', async ({ page }) => {
    await expect(page.locator('.hero')).toBeAttached();
  });

  test('Hero 應該顯示團體名稱', async ({ page }) => {
    const heroText = await page.locator('.hero').textContent();
    expect(heroText).toMatch(/CMY|FANTASY|原色|ふぁんたじー/i);
  });

  test('Hero 應該有背景圖片', async ({ page }) => {
    const heroImg = page.locator('.hero img, .hero [style*="background"]').first();
    await expect(heroImg).toBeAttached();
  });
});

test.describe('CMY Fantasy 成員介紹區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('應該有成員區塊', async ({ page }) => {
    const memberSection = page.locator('#member, .member-section, [data-section="member"]');
    await expect(memberSection).toBeAttached();
  });

  test('應該顯示筱喵的資料', async ({ page }) => {
    const pageText = await page.textContent('body');
    expect(pageText).toContain('筱喵');
  });

  test('應該顯示婷婷的資料', async ({ page }) => {
    const pageText = await page.textContent('body');
    expect(pageText).toContain('婷婷');
  });

  test('應該有成員照片', async ({ page }) => {
    const memberPhotos = page.locator('.member-card img, .member-photo img');
    const count = await memberPhotos.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

test.describe('CMY Fantasy 新聞區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('應該有新聞區塊', async ({ page }) => {
    const newsSection = page.locator('#news, .news-section').first();
    await expect(newsSection).toBeAttached();
  });

  test('新聞項目應該有日期標記', async ({ page }) => {
    const dates = page.locator('.news-date');
    const count = await dates.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('CMY Fantasy 影片區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('應該有影片區塊', async ({ page }) => {
    const videoSection = page.locator('#video, .video-section').first();
    await expect(videoSection).toBeAttached();
  });

  test('應該有 YouTube 播放清單嵌入', async ({ page }) => {
    const iframes = page.locator('.video-section iframe[src*="youtube"]');
    const count = await iframes.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('CMY Fantasy 關於區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('應該有關於/概念區塊', async ({ page }) => {
    const aboutSection = page.locator('#about, #concept, .about-section, .concept-section');
    await expect(aboutSection).toBeAttached();
  });

  test('關於區塊應該包含團體介紹文字', async ({ page }) => {
    const pageText = await page.textContent('body');
    expect(pageText).toMatch(/高雄|偶像|Cosplay|舞台/);
  });
});

test.describe('CMY Fantasy Gallery 區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('應該有 Gallery 區塊', async ({ page }) => {
    const photoBreak = page.locator('.photo-break, .gallery-item').first();
    await expect(photoBreak).toBeAttached();
  });

  test('Gallery 應該至少有 4 張圖片', async ({ page }) => {
    const images = page.locator('.photo-break img, .gallery-item img');
    const count = await images.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

test.describe('CMY Fantasy 社群連結與 Footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('應該有 Instagram 連結', async ({ page }) => {
    const igLink = page.locator('a[href*="instagram.com/cmy_fantasy"]');
    await expect(igLink).toBeAttached();
  });

  test('應該有 Threads 連結', async ({ page }) => {
    const threadsLink = page.locator('a[href*="threads.com"]');
    await expect(threadsLink).toBeAttached();
  });

  test('應該有 YouTube 連結', async ({ page }) => {
    const ytLink = page.locator('a[href*="youtube.com/@cmy_fantasy"]');
    await expect(ytLink).toBeAttached();
  });

  test('社群連結應該在新分頁開啟', async ({ page }) => {
    const socialLinks = page.locator('.social-card[href*="instagram"], .social-card[href*="threads"], .social-card[href*="youtube"]');
    const count = await socialLinks.count();
    for (let i = 0; i < count; i++) {
      const target = await socialLinks.nth(i).getAttribute('target');
      expect(target).toBe('_blank');
    }
  });
});

test.describe('CMY Fantasy 導航功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('導航列應該有區塊連結', async ({ page }) => {
    const navLinks = page.locator('header a[href^="#"], nav a[href^="#"]');
    const count = await navLinks.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('導航列應該固定在頂部', async ({ page }) => {
    const header = page.locator('header').first();
    const position = await header.evaluate(el => getComputedStyle(el).position);
    expect(position).toBe('fixed');
  });
});

test.describe('CMY Fantasy 滾動互動效果', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissEntrance(page);
  });

  test('應該有 GSAP ScrollTrigger 動畫元素', async ({ page }) => {
    const animatedElements = page.locator('.fade-up, .slide-in, [data-animate]');
    const count = await animatedElements.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('頁面應該可以正常滾動到底部', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  });
});
