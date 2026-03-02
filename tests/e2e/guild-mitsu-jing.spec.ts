import { test, expect, Page } from '@playwright/test';

/**
 * Guild Member: Mitsu Jing (小靜) 頁面 E2E 測試
 * 驗證效能優化與互動效果：
 * - 無外部函式庫 (Tailwind, Font Awesome, GSAP, Three.js, p5.js)
 * - 圖示改為 inline SVG
 * - Canvas 2D 背景取代 Three.js
 * - 圖片 CLS 優化
 * - Loading 進場畫面
 * - 自訂游標效果
 * - 捲動動畫
 * - 各內容區段完整性
 */

const BASE_URL = '/guild/mitsu_jing';

/** 跳過 Loading 畫面：等待自動隱藏 */
async function dismissLoader(page: Page) {
  // Wait for the loader to auto-dismiss (adds class "hidden" after window.load + 1200ms)
  await page.waitForFunction(() => {
    const el = document.getElementById('loader');
    return !el || el.classList.contains('hidden');
  }, { timeout: 15000 }).catch(() => {});
  // Wait for CSS opacity transition (0.8s) to complete
  await page.waitForTimeout(1000);
}

// ─── 基礎載入 ───

test.describe('Mitsu Jing 頁面基礎載入', () => {
  test('頁面應該正確載入（HTTP 200）', async ({ page }) => {
    const response = await page.goto(BASE_URL);
    expect(response?.status()).toBe(200);
  });

  test('頁面標題應包含 Mitsu Jing 或 Jing', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Jing/i);
  });
});

// ─── 無外部函式庫 ───

test.describe('Mitsu Jing 頁面不載入外部函式庫', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('不應載入 Tailwind CDN', async ({ page }) => {
    const twScript = page.locator('script[src*="tailwindcss"]');
    await expect(twScript).toHaveCount(0);
  });

  test('不應載入 Font Awesome CDN', async ({ page }) => {
    const faLink = page.locator('link[href*="font-awesome"]');
    await expect(faLink).toHaveCount(0);
  });

  test('不應載入 GSAP script', async ({ page }) => {
    const gsapScript = page.locator('script[src*="gsap"]');
    await expect(gsapScript).toHaveCount(0);
  });

  test('不應載入 Three.js script', async ({ page }) => {
    const threeScript = page.locator('script[src*="three"]');
    await expect(threeScript).toHaveCount(0);
  });

  test('不應載入 p5.js script', async ({ page }) => {
    const p5Script = page.locator('script[src*="p5"]');
    await expect(p5Script).toHaveCount(0);
  });

  test('不應載入 ScrollTrigger script', async ({ page }) => {
    const scrollTriggerScript = page.locator('script[src*="ScrollTrigger"]');
    await expect(scrollTriggerScript).toHaveCount(0);
  });
});

// ─── Inline SVG 圖示 ───

test.describe('Mitsu Jing 頁面圖示為 inline SVG', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('不應有任何 Font Awesome <i> 元素', async ({ page }) => {
    const faIcons = page.locator('i[class*="fa-"]');
    await expect(faIcons).toHaveCount(0);
  });

  test('社交連結應使用 inline SVG', async ({ page }) => {
    const socialSvgs = page.locator('.social-links a svg, .social-link svg');
    const count = await socialSvgs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('導航列返回按鈕應使用 inline SVG', async ({ page }) => {
    const navBackSvg = page.locator('.nav-back svg, a[href*="guild"] svg');
    await expect(navBackSvg.first()).toBeAttached();
  });

  test('Footer 愛心應使用 inline SVG', async ({ page }) => {
    const footerSvg = page.locator('footer svg');
    await expect(footerSvg.first()).toBeAttached();
  });
});

// ─── Loading 進場畫面 ───

test.describe('Mitsu Jing Loading 進場畫面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('應有 Loading 畫面', async ({ page }) => {
    const loader = page.locator('#loader');
    await expect(loader).toBeAttached();
  });

  test('Loading 畫面應有進度條', async ({ page }) => {
    const loaderBar = page.locator('#loader-bar');
    await expect(loaderBar).toBeAttached();
  });
});

// ─── Hero 區段 ───

test.describe('Mitsu Jing Hero 區段', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應顯示名稱 JING 或 小靜', async ({ page }) => {
    const heroName = page.locator('#hero');
    const text = await heroName.textContent();
    expect(text).toMatch(/JING|小靜/i);
  });

  test('應有社交連結（Instagram + Threads）', async ({ page }) => {
    const igLinks = page.locator('a[href*="instagram.com/mitsu27"]');
    const threadsLinks = page.locator('a[href*="threads.net"]');
    const igCount = await igLinks.count();
    const threadsCount = await threadsLinks.count();
    expect(igCount).toBeGreaterThanOrEqual(1);
    expect(threadsCount).toBeGreaterThanOrEqual(1);
  });

  test('應有職業標籤', async ({ page }) => {
    const heroSection = page.locator('#hero');
    const text = await heroSection.textContent();
    expect(text).toMatch(/Insurance|保險|Guardian|Explorer|Fashion/i);
  });
});

// ─── Stats / Bio 區段 ───

test.describe('Mitsu Jing Stats 區段', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應有 Stats 區段', async ({ page }) => {
    const stats = page.locator('#stats');
    await expect(stats).toBeAttached();
  });

  test('應有至少 3 個能力條', async ({ page }) => {
    const statBars = page.locator('.stat-bar-fill, [data-width]');
    const count = await statBars.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('應有 BIO 文字區塊', async ({ page }) => {
    const bio = page.locator('#stats');
    const text = await bio.textContent();
    expect(text).toMatch(/肉肉女孩|保險|台南/);
  });
});

// ─── Fashion 區段 ───

test.describe('Mitsu Jing Fashion 區段', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應有 Fashion 區段', async ({ page }) => {
    const fashion = page.locator('#fashion');
    await expect(fashion).toBeAttached();
  });

  test('Fashion 區段應有至少 4 張圖片', async ({ page }) => {
    const images = page.locator('#fashion img');
    const count = await images.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

// ─── Travel 區段 ───

test.describe('Mitsu Jing Travel 區段', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應有 Travel 區段', async ({ page }) => {
    const travel = page.locator('#travel');
    await expect(travel).toBeAttached();
  });

  test('Travel 區段應有旅遊圖片', async ({ page }) => {
    const images = page.locator('#travel img');
    const count = await images.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ─── Hobby / Collection 區段 ───

test.describe('Mitsu Jing Collection 區段', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應有 Hobby 區段', async ({ page }) => {
    const hobby = page.locator('#hobby');
    await expect(hobby).toBeAttached();
  });

  test('Hobby 區段應有至少 4 個收藏卡片', async ({ page }) => {
    const cards = page.locator('#hobby .collection-card, #hobby [class*="card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

// ─── Canvas 背景 ───

test.describe('Mitsu Jing Canvas 背景', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('Canvas 背景元素應該存在', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas.first()).toBeAttached();
  });
});

// ─── 圖片 CLS 優化 ───

test.describe('Mitsu Jing 圖片 CLS 優化', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
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

// ─── 捲動動畫 ───

test.describe('Mitsu Jing 捲動動畫', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('Stats 能力條應在捲動後填滿', async ({ page }) => {
    const firstBar = page.locator('.stat-bar-fill, [data-width]').first();
    await firstBar.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    const style = await firstBar.getAttribute('style');
    expect(style).toContain('width');
  });
});

// ─── 自訂游標 ───

test.describe('Mitsu Jing 自訂游標', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('應有自訂游標元素', async ({ page }) => {
    const cursorDot = page.locator('.cursor-dot');
    const cursorOutline = page.locator('.cursor-outline');
    await expect(cursorDot).toBeAttached();
    await expect(cursorOutline).toBeAttached();
  });
});

// ─── Footer ───

test.describe('Mitsu Jing 頁尾', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應有頁尾', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeAttached();
  });

  test('頁尾應有公會連結', async ({ page }) => {
    const guildLink = page.locator('footer a[href*="guild"], a[href*="guild"]');
    await expect(guildLink.first()).toBeAttached();
  });
});

// ─── Marquee Strip ───

test.describe('Mitsu Jing Marquee Strip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應有跑馬燈區域', async ({ page }) => {
    const marquee = page.locator('.marquee-strip');
    await expect(marquee).toBeAttached();
  });

  test('跑馬燈應包含人物標籤關鍵字', async ({ page }) => {
    const marquee = page.locator('.marquee-inner');
    const text = await marquee.textContent();
    expect(text).toMatch(/FASHION|TAINAN|INSURANCE/i);
  });
});

// ─── Food 區段 ───

test.describe('Mitsu Jing Food 區段', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應有 Food 區段', async ({ page }) => {
    const food = page.locator('#food');
    await expect(food).toBeAttached();
  });

  test('Food 區段應有美食標籤', async ({ page }) => {
    const tags = page.locator('#food .food-tag');
    const count = await tags.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ─── Beauty Review 區段 ───

test.describe('Mitsu Jing Beauty Review 區段', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應有 Beauty 區段', async ({ page }) => {
    const beauty = page.locator('#beauty');
    await expect(beauty).toBeAttached();
  });

  test('Beauty 區段應有美妝圖片', async ({ page }) => {
    const images = page.locator('#beauty img');
    const count = await images.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Beauty 區段應有品牌標籤', async ({ page }) => {
    const brands = page.locator('#beauty .beauty-brand');
    const count = await brands.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ─── Couple / Daily Life 區段 ───

test.describe('Mitsu Jing Daily Life 區段', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應有 Couple 區段', async ({ page }) => {
    const couple = page.locator('#couple');
    await expect(couple).toBeAttached();
  });

  test('Daily Life 區段應有至少 3 張圖片', async ({ page }) => {
    const images = page.locator('#couple img');
    const count = await images.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ─── Social Stats 區段 ───

test.describe('Mitsu Jing Social Stats 區段', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissLoader(page);
  });

  test('應有 Social 區段', async ({ page }) => {
    const social = page.locator('#social');
    await expect(social).toBeAttached();
  });

  test('Social 區段應有計數器', async ({ page }) => {
    const counters = page.locator('#social .counter-num, #social [data-count]');
    const count = await counters.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('Social 區段應有社群標籤', async ({ page }) => {
    const tags = page.locator('#social .social-tags span');
    const count = await tags.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

// ─── Noise Overlay 已移除 ───

test.describe('Mitsu Jing Noise overlay 已移除', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('不應存在 noise-overlay 元素', async ({ page }) => {
    const noiseOverlay = page.locator('.noise-overlay');
    await expect(noiseOverlay).toHaveCount(0);
  });
});
