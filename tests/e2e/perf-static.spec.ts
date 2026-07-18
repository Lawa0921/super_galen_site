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

/**
 * journal / guild 列表頁沒有 RPG 介面，改用 GlobalScriptsMinimal——
 * 不得載入 RPG 模組腳本（~259KB），header 功能（主題/行動選單/語言切換）必須照常。
 */
test.describe('journal / guild 列表頁腳本瘦身', () => {
  const bannedScripts = [
    'skill-tree-hierarchical.js',
    'inventory.js',
    'inventory-responsive.js',
    'summon.js',
    'summon-state-machine.js',
    'summon-animation-controller.js',
    'gamestate.js',
    'cheat.js',
    'arcade-transition.js',
    'security-utils.js',
    'debug-utils.js',
  ];

  async function assertNoBannedScripts(page: import('@playwright/test').Page) {
    const srcs: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src]')).map(
        (s) => s.getAttribute('src') || ''
      )
    );
    for (const banned of bannedScripts) {
      expect(
        srcs.filter((s) => s.includes(`/scripts/${banned}`)),
        `${banned} 不應載入`
      ).toHaveLength(0);
    }
  }

  test('journal 列表頁：無 RPG 腳本、console 無錯誤、header 功能正常', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/journal/');
    await page.waitForLoadState('domcontentloaded');
    await assertNoBannedScripts(page);

    // 主題切換正常（main.js initThemeToggle；checkbox 被樣式蓋住，點外層 slider）
    const themeBefore = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    await page.click('#shared-theme-switch .slider');
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.getAttribute('data-theme'))
      )
      .not.toBe(themeBefore);

    // 語言切換器下拉開合正常（i18n-manager initLanguageSwitcher）
    await page.click('#language-current');
    await expect(page.locator('#language-dropdown')).toHaveClass(/show/);

    // 精簡後不得有 JS 錯誤（原本 skill-tree 會在無 RPG DOM 頁面拋 TypeError）
    // 濾掉 Vite dev 依賴重新優化的暫態 504（環境雜訊，非應用錯誤）
    const realErrors = errors.filter((e) => !e.includes('Outdated Optimize Dep'));
    expect(realErrors, `console 錯誤：${realErrors.join(' | ')}`).toHaveLength(0);
  });

  test('journal 列表頁：行動版選單開合正常', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/journal/');
    await page.waitForLoadState('domcontentloaded');
    await page.click('#mobile-menu-toggle');
    await expect(page.locator('#mobile-menu')).toBeVisible();
    await page.click('#mobile-menu-close');
    await expect(page.locator('#mobile-menu')).not.toBeVisible();
  });

  test('journal 文章頁：無 RPG 腳本', async ({ page }) => {
    await page.goto('/journal/');
    await page.waitForLoadState('domcontentloaded');
    const firstPost = page.locator('.post-item-title a').first();
    await firstPost.click();
    await page.waitForLoadState('domcontentloaded');
    await assertNoBannedScripts(page);
    await expect(page.locator('.post-content')).toBeVisible();
  });

  test('guild 列表頁：無 RPG 腳本、成員卡渲染正常', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/guild/');
    await page.waitForLoadState('domcontentloaded');
    await assertNoBannedScripts(page);

    // 頁面設計：先出現卡疊，點擊後成員卡才 render 進 #guild-members-grid
    await expect(page.locator('#card-stack-container')).toBeVisible({ timeout: 10000 });
    await page.click('#card-stack-container');
    await expect
      .poll(async () =>
        page.evaluate(() => document.querySelectorAll('#guild-members-grid > *').length)
      , { timeout: 10000 })
      .toBeGreaterThan(0);

    const realErrors = errors.filter((e) => !e.includes('Outdated Optimize Dep'));
    expect(realErrors, `console 錯誤：${realErrors.join(' | ')}`).toHaveLength(0);
  });

  test('首頁（RPG 介面）仍載入完整腳本組', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const srcs: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src]')).map(
        (s) => s.getAttribute('src') || ''
      )
    );
    for (const required of ['skill-tree-hierarchical.js', 'inventory.js', 'summon.js', 'gamestate.js']) {
      expect(
        srcs.some((s) => s.includes(`/scripts/${required}`)),
        `首頁必須載入 ${required}`
      ).toBe(true);
    }
  });
});
