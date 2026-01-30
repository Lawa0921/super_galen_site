import { test, expect } from '@playwright/test';

/**
 * Jekyll 完全一致性測試
 * 確保 Astro 版本的行為與 Jekyll 版本完全相同
 */
test.describe('Jekyll 完全一致性測試', () => {

  test.describe('1. 語系切換行為', () => {

    test('切換語系不應該重新播放開場動畫', async ({ page }) => {
      // 先訪問頁面，等待開場動畫結束
      await page.goto('/zh-TW/');
      await page.waitForLoadState('domcontentloaded');

      // 等待開場動畫結束（page-loader 隱藏）
      await page.waitForFunction(() => {
        const loader = document.getElementById('page-loader');
        return !loader || loader.style.display === 'none' || loader.classList.contains('hidden');
      }, { timeout: 15000 });
      await page.waitForTimeout(1000);

      // 記錄 page-loader 的狀態
      const loaderHiddenBefore = await page.evaluate(() => {
        const loader = document.getElementById('page-loader');
        return !loader || loader.style.display === 'none' || loader.classList.contains('hidden');
      });
      expect(loaderHiddenBefore).toBe(true);

      // 點擊語言切換器，切換到英文
      await page.click('#language-current');
      await page.waitForTimeout(500);
      await page.click('[data-lang="en"]');
      await page.waitForTimeout(2000);

      // 開場動畫不應該重新播放（page-loader 應該保持隱藏或不存在）
      const loaderHiddenAfter = await page.evaluate(() => {
        const loader = document.getElementById('page-loader');
        // 如果 loader 不存在或已隱藏，返回 true
        return !loader || loader.style.display === 'none' || loader.classList.contains('hidden');
      });
      expect(loaderHiddenAfter).toBe(true);
    });

    test('左上角標題 SuperGalen\'s Dungeon 不應該隨語系變化', async ({ page }) => {
      // 訪問繁體中文版本
      await page.goto('/zh-TW/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // 獲取標題文字
      const titleZhTW = await page.locator('.site-title').textContent();

      // 訪問英文版本
      await page.goto('/en/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // 獲取標題文字
      const titleEn = await page.locator('.site-title').textContent();

      // 標題應該相同，不應該被翻譯
      expect(titleZhTW?.trim()).toBe("SuperGalen's Dungeon");
      expect(titleEn?.trim()).toBe("SuperGalen's Dungeon");
      expect(titleZhTW).toBe(titleEn);
    });
  });

  test.describe('2. 成就頁籤圖片', () => {

    test('成就頁籤點擊門後圖片應該正確載入', async ({ page }) => {
      await page.goto('/zh-TW/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // 點擊成就頁籤
      await page.click('[data-tab="achievements"]');
      await page.waitForTimeout(1500);

      // 點擊門以觸發開門動畫
      const doorClicked = await page.evaluate(() => {
        const doorContainer = document.querySelector('.door-container');
        if (doorContainer) {
          (doorContainer as HTMLElement).click();
          return true;
        }
        return false;
      });
      expect(doorClicked).toBe(true);

      // 等待開門動畫完成
      await page.waitForTimeout(3000);

      // 檢查成就相關的圖片是否存在且載入成功
      const imageLoadResults = await page.evaluate(async () => {
        const results: { src: string; loaded: boolean; naturalWidth: number }[] = [];

        // 獲取成就面板中的所有圖片
        const achievementPanel = document.querySelector('#achievements-tab');
        if (!achievementPanel) return { error: 'Panel not found', results };

        const images = achievementPanel.querySelectorAll('img');

        for (const img of images) {
          results.push({
            src: img.src,
            loaded: img.complete && img.naturalWidth > 0,
            naturalWidth: img.naturalWidth,
          });
        }

        return { error: null, results };
      });

      console.log('成就頁籤圖片載入結果:', JSON.stringify(imageLoadResults, null, 2));

      // 所有圖片都應該載入成功
      if (imageLoadResults.results.length > 0) {
        const failedImages = imageLoadResults.results.filter(r => !r.loaded);
        expect(failedImages.length).toBe(0);
      }
    });

    test('成就頁籤應該顯示成就大廳', async ({ page }) => {
      await page.goto('/zh-TW/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      await page.click('[data-tab="achievements"]');
      await page.waitForTimeout(1500);

      // 檢查成就大廳是否存在（注意是 achievements-hall 複數）
      const hallExists = await page.evaluate(() => {
        const hall = document.querySelector('.achievements-hall');
        return !!hall;
      });

      console.log('成就大廳存在:', hallExists);
      expect(hallExists).toBe(true);

      // 檢查門容器是否存在（初始應該顯示門）
      const doorVisible = await page.evaluate(() => {
        const door = document.querySelector('.door-container');
        if (!door) return false;
        const style = window.getComputedStyle(door);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      expect(doorVisible).toBe(true);
    });
  });

  test.describe('3. 召喚系統', () => {

    test('夥伴頁籤的召喚應該可以觸發', async ({ page }) => {
      await page.goto('/zh-TW/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // 點擊夥伴頁籤
      await page.click('[data-tab="party"]');
      await page.waitForTimeout(1500);

      // 檢查召喚入口是否存在
      const portalExists = await page.evaluate(() => {
        const portal = document.querySelector('#portalInteractiveArea, .portal-interactive-area');
        return !!portal;
      });
      expect(portalExists).toBe(true);

      // 點擊召喚入口
      await page.click('#portalInteractiveArea, .portal-interactive-area');
      await page.waitForTimeout(2000);

      // 檢查召喚動畫或結果是否出現
      const summonTriggered = await page.evaluate(() => {
        // 檢查是否有召喚相關的 UI 變化
        const summonModal = document.querySelector('.summon-modal, .summon-result, .summon-animation');
        const summonOverlay = document.querySelector('.summon-overlay');
        const collectedArea = document.querySelector('.collected-companions');

        return {
          hasSummonUI: !!summonModal || !!summonOverlay,
          hasCollectedArea: !!collectedArea,
          // 檢查是否有任何召喚相關的動畫元素
          hasAnimation: document.querySelectorAll('[class*="summon"]').length > 0,
        };
      });

      console.log('召喚系統狀態:', summonTriggered);
      // 召喚應該可以觸發
      expect(summonTriggered.hasAnimation || summonTriggered.hasCollectedArea).toBe(true);
    });
  });

  test.describe('4. 公會頁面', () => {

    test('公會頁面應該存在且可訪問', async ({ page }) => {
      const response = await page.goto('/zh-TW/guild/');
      expect(response?.status()).toBe(200);
    });

    test('公會頁面互動應該與 Jekyll 一致', async ({ page }) => {
      // 先檢查 Jekyll 的公會頁面結構
      await page.goto('http://localhost:4000/guild/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      const jekyllGuildStructure = await page.evaluate(() => {
        return {
          hasGuildContainer: !!document.querySelector('.guild-container, .guild-page, .party-container'),
          hasMemberList: !!document.querySelector('.member-list, .guild-members, .party-members'),
          memberCount: document.querySelectorAll('.member-card, .guild-member, .party-member').length,
          hasInteractiveElements: document.querySelectorAll('button, a[href*="guild"]').length,
        };
      });

      console.log('Jekyll 公會頁面結構:', jekyllGuildStructure);

      // 檢查 Astro 的公會頁面結構
      await page.goto('/zh-TW/guild/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      const astroGuildStructure = await page.evaluate(() => {
        return {
          hasGuildContainer: !!document.querySelector('.guild-container, .guild-page, .party-container'),
          hasMemberList: !!document.querySelector('.member-list, .guild-members, .party-members'),
          memberCount: document.querySelectorAll('.member-card, .guild-member, .party-member').length,
          hasInteractiveElements: document.querySelectorAll('button, a[href*="guild"]').length,
        };
      });

      console.log('Astro 公會頁面結構:', astroGuildStructure);

      // 結構應該一致
      expect(astroGuildStructure.hasGuildContainer).toBe(jekyllGuildStructure.hasGuildContainer);
    });
  });

  test.describe('5. 部落格路徑', () => {

    test('日誌頁籤應該正確連結到部落格頁面', async ({ page }) => {
      // 檢查首頁的日誌頁籤連結
      await page.goto('/zh-TW/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      // 在 Astro 版本中，日誌頁籤是一個連結而非頁籤按鈕
      // 檢查日誌連結是否存在並指向正確的 URL
      const journalLink = await page.evaluate(() => {
        // 嘗試找到日誌連結（可能是 data-tab 或直接連結）
        const tabLink = document.querySelector('[data-tab="journal"]');
        const directLink = document.querySelector('a[href*="/blog/"]');
        const navLink = document.querySelector('.tab-btn[href*="/blog/"], .nav-tabs a[href*="/blog/"]');

        if (tabLink) {
          return { type: 'tab', href: tabLink.getAttribute('href') || 'tab' };
        }
        if (navLink) {
          return { type: 'nav', href: navLink.getAttribute('href') };
        }
        if (directLink) {
          return { type: 'link', href: directLink.getAttribute('href') };
        }
        return null;
      });

      console.log('日誌連結:', journalLink);

      // 應該有日誌連結存在
      expect(journalLink).not.toBeNull();

      // 如果是連結，應該指向 blog 頁面
      if (journalLink?.href && journalLink.href !== 'tab') {
        expect(journalLink.href).toContain('/blog');
      }
    });

    test('部落格列表頁應該可訪問', async ({ page }) => {
      // 檢查 Astro 部落格列表頁
      const response = await page.goto('/zh-TW/blog/');
      expect(response?.status()).toBe(200);

      // 應該有文章列表
      const hasArticles = await page.evaluate(() => {
        const articles = document.querySelectorAll('article, .post-card, .blog-post');
        return articles.length > 0;
      });
      expect(hasArticles).toBe(true);
    });
  });
});
