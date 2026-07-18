import { test, expect } from '@playwright/test';

/**
 * 靜態頁面效能守則：鎖住共用層的載入方式，防止回退。
 * 背景：/[lang]/ 首頁曾內嵌 81KB 翻譯 blob、eager 載入 5 支 tab 專用腳本；
 * BaseLayout 曾載入全站無人使用的 GSAP；favicon 曾是 984KB 的 1024px PNG。
 */
test.describe('靜態頁面效能守則', () => {
  test('非預設語言首頁：無內嵌翻譯 blob、tab 腳本懶載入、i18n 正常', async ({ page }) => {
    await page.goto('/en/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.game-tabs', { state: 'visible', timeout: 10000 });

    // 1. 不得有把整包翻譯 inline 進 HTML 的 adapter script
    const hasInlineAdapter = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script:not([src])')).some(
        (s) => (s.textContent || '').includes('window.i18n = {')
      )
    );
    expect(hasInlineAdapter, '不應存在 inline i18n adapter blob').toBe(false);

    // 2. 五支 tab 專用腳本不得 eager 載入（由 LazyLoader 按需載入）
    const eagerSrcs: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src]')).map(
        (s) => s.getAttribute('src') || ''
      )
    );
    for (const banned of [
      'book.js',
      'achievements.js',
      'sgt-purchase-manager.js',
      'cyber-terminal.js',
      'cyber-audio.js',
    ]) {
      expect(
        eagerSrcs.filter((s) => s.includes(banned)),
        `${banned} 不應 eager 載入`
      ).toHaveLength(0);
    }

    // 3. i18n manager 正常接管（移除 inline adapter 後翻譯仍可用）
    await page.waitForFunction(
      () => {
        const i18n = (window as unknown as { i18n?: { currentTranslations?: unknown } }).i18n;
        return !!i18n?.currentTranslations;
      },
      undefined,
      { timeout: 10000 }
    );

    // 4. story tab 經懶載入後仍正常運作
    await page.click('.game-tabs [data-tab="story"]');
    await expect(page.locator('#story-tab')).toBeVisible();
    await page.waitForFunction(
      () => !!document.querySelector('script[src*="book.js"]'),
      undefined,
      { timeout: 10000 }
    );

    // 5. purchase tab 經懶載入後仍正常運作
    await page.click('.game-tabs [data-tab="purchase"]');
    await expect(page.locator('#purchase-tab')).toBeVisible();
    await page.waitForFunction(
      () => !!document.querySelector('script[src*="sgt-purchase-manager.js"]'),
      undefined,
      { timeout: 10000 }
    );
  });

  test('BaseLayout 不載入未被使用的 GSAP', async ({ page }) => {
    await page.goto('/en/');
    await page.waitForLoadState('domcontentloaded');
    const gsapTags: number = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('script[src]')).filter((s) =>
          (s.getAttribute('src') || '').includes('gsap')
        ).length
    );
    expect(gsapTags).toBe(0);
  });

  test('favicon 應為輕量檔案', async ({ page }) => {
    await page.goto('/en/');
    const size: number = await page.evaluate(async () => {
      const res = await fetch('/favicon.ico');
      return (await res.blob()).size;
    });
    expect(size).toBeLessThan(60_000);
  });
});
