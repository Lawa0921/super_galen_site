import { test, expect } from '@playwright/test';

// 深度比較 Jekyll 和 Astro 的行為差異
test.describe('深度 Jekyll vs Astro 比較', () => {

  test('比較 Console 錯誤', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(3000);

    // 點擊所有頁籤觸發可能的錯誤
    const tabs = ['status', 'skills', 'story', 'inventory', 'achievements', 'party', 'purchase'];
    for (const tab of tabs) {
      await page.click(`[data-tab="${tab}"]`);
      await page.waitForTimeout(500);
    }

    console.log('Console errors:', errors);
    // 不應該有嚴重錯誤（忽略 network 404 等）
    const criticalErrors = errors.filter(e => 
      !e.includes('404') && 
      !e.includes('favicon') &&
      !e.includes('net::ERR')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('比較狀態頁籤樣式', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(2000);

    // 狀態頁籤應該是預設激活的
    const statusPanel = await page.locator('#status-tab');
    await expect(statusPanel).toHaveClass(/active/);

    // 檢查屬性條存在
    const attrBars = await page.locator('.attr-bar').count();
    console.log('Attribute bars count:', attrBars);
    expect(attrBars).toBeGreaterThan(0);

    // 檢查 buff/debuff 區域
    const buffSection = await page.locator('.buffs-section, .status-effects').count();
    console.log('Buff section count:', buffSection);
  });

  test('比較技能頁籤 Canvas 渲染', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(2000);

    await page.click('[data-tab="skills"]');
    await page.waitForTimeout(2000);

    // 檢查 Canvas 尺寸
    const canvasSize = await page.evaluate(() => {
      const canvas = document.querySelector('#skill-tree-canvas') as HTMLCanvasElement;
      return {
        width: canvas?.width,
        height: canvas?.height,
        clientWidth: canvas?.clientWidth,
        clientHeight: canvas?.clientHeight,
      };
    });
    console.log('Canvas size:', canvasSize);
    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);

    // 檢查技能樹是否繪製了內容
    const hasContent = await page.evaluate(() => {
      const canvas = document.querySelector('#skill-tree-canvas') as HTMLCanvasElement;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return false;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let nonTransparentPixels = 0;
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] > 0) nonTransparentPixels++;
      }
      return nonTransparentPixels;
    });
    console.log('Non-transparent pixels:', hasContent);
    expect(hasContent).toBeGreaterThan(100);
  });

  test('比較故事頁籤書本翻頁', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(2000);

    await page.click('[data-tab="story"]');
    await page.waitForTimeout(3000);

    // 檢查書本結構
    const bookStructure = await page.evaluate(() => {
      return {
        hasBookContainer: !!document.querySelector('.book-container'),
        hasBook: !!document.querySelector('.book'),
        hasBookSpine: !!document.querySelector('.book-spine'),
        hasPages: document.querySelectorAll('.book-page').length,
        hasPageContent: !!document.querySelector('.page-content'),
      };
    });
    console.log('Book structure:', bookStructure);
    expect(bookStructure.hasBookContainer).toBe(true);
    expect(bookStructure.hasBook).toBe(true);
  });

  test('比較物品欄拖放區域', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(2000);

    await page.click('[data-tab="inventory"]');
    await page.waitForTimeout(1000);

    // 檢查物品欄結構
    const inventoryStructure = await page.evaluate(() => {
      return {
        hasEquipmentSlots: document.querySelectorAll('.equipment-slot').length,
        hasBackpackSlots: document.querySelectorAll('.backpack-slot, .grid-slot').length,
        hasMultiSlotItems: document.querySelectorAll('.multi-slot-item').length,
        hasPotions: document.querySelectorAll('.multi-slot-item.potion').length,
        hasTooltips: document.querySelectorAll('.item-tooltip').length,
      };
    });
    console.log('Inventory structure:', inventoryStructure);
    expect(inventoryStructure.hasMultiSlotItems).toBe(49);
    expect(inventoryStructure.hasPotions).toBe(38);
  });

  test('比較成就頁籤動畫', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(2000);

    await page.click('[data-tab="achievements"]');
    await page.waitForTimeout(2000);

    // 檢查成就系統結構
    const achievementsStructure = await page.evaluate(() => {
      return {
        hasHall: !!document.querySelector('.achievements-hall'),
        hasDoors: document.querySelectorAll('.door').length,
        hasBookshelf: !!document.querySelector('.achievement-bookshelf'),
        hasHotspots: document.querySelectorAll('area.achievement-hotspot').length,
        hasGoldenEffect: !!document.querySelector('.golden-burst-effect'),
      };
    });
    console.log('Achievements structure:', achievementsStructure);
    expect(achievementsStructure.hasHotspots).toBe(14);
  });

  test('比較夥伴頁籤召喚系統', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(2000);

    await page.click('[data-tab="party"]');
    await page.waitForTimeout(1000);

    // 檢查召喚系統結構
    const summonStructure = await page.evaluate(() => {
      return {
        hasSummonSystem: !!document.querySelector('.summon-system'),
        hasSummonSection: !!document.querySelector('.summon-section'),
        hasPortalContainer: !!document.querySelector('.summon-portal-container'),
        hasPortalInteractive: !!document.querySelector('.portal-interactive-area'),
        hasCompanionGrid: !!document.querySelector('.companion-grid'),
        hasCompanionCollection: !!document.querySelector('.companion-collection'),
        hasSummonVideo: !!document.querySelector('#summonVideo'),
        hasResultModal: !!document.querySelector('.summon-result-modal'),
      };
    });
    console.log('Summon structure:', summonStructure);
    expect(summonStructure.hasSummonSystem).toBe(true);
    expect(summonStructure.hasPortalInteractive).toBe(true);
  });

  test('比較購買頁籤 Web3 介面', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(2000);

    await page.click('[data-tab="purchase"]');
    await page.waitForTimeout(1000);

    // 檢查購買介面結構
    const purchaseStructure = await page.evaluate(() => {
      return {
        hasInnerTabs: document.querySelectorAll('.inner-tab-btn').length,
        hasIntroTab: !!document.querySelector('#intro-tab, [data-inner-tab="intro"]'),
        hasBuyTab: !!document.querySelector('#buy-tab, [data-inner-tab="buy"]'),
        hasWalletSection: !!document.querySelector('.wallet-section, .wallet-connect'),
        hasTokenInfo: !!document.querySelector('.token-info, .sgt-core-info'),
        hasServicesSection: !!document.querySelector('.services-section'),
      };
    });
    console.log('Purchase structure:', purchaseStructure);
    expect(purchaseStructure.hasInnerTabs).toBeGreaterThan(0);
  });

  test('比較遊戲狀態 Cookie 存取', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(2000);

    // 檢查 Cookie 和 GameState
    const gameState = await page.evaluate(() => {
      const gs = (window as any).GameState;
      return {
        hasGameState: !!gs,
        hp: gs?.state?.hp,
        mp: gs?.state?.mp,
        sp: gs?.state?.sp,
        gold: gs?.state?.gold,
        hasCookie: document.cookie.includes('gameState'),
      };
    });
    console.log('Game state:', gameState);
    expect(gameState.hasGameState).toBe(true);
  });

  test('比較 i18n 翻譯完整性', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(2000);

    // 檢查是否有未翻譯的 key（顯示 key 而不是翻譯文字）
    const untranslated = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-i18n]');
      const missing: string[] = [];
      elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = el.textContent?.trim();
        // 如果文字等於 key，可能是未翻譯
        if (text === key || text?.startsWith('navigation.') || text?.startsWith('ui.')) {
          missing.push(key || '');
        }
      });
      return missing;
    });
    console.log('Potentially untranslated keys:', untranslated);
    // 應該沒有未翻譯的 key
    expect(untranslated.length).toBe(0);
  });

  test('比較頁尾和版權資訊', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay');
      if (overlay) overlay.remove();
    });
    await page.waitForTimeout(2000);

    // 檢查頁尾結構
    const footerStructure = await page.evaluate(() => {
      return {
        hasFooter: !!document.querySelector('footer, .site-footer'),
        hasCopyright: !!document.querySelector('.copyright, footer'),
        hasSocialLinks: document.querySelectorAll('.social-link, .social-icon, footer a[href*="github"], footer a[href*="discord"]').length,
      };
    });
    console.log('Footer structure:', footerStructure);
    expect(footerStructure.hasFooter).toBe(true);
  });
});
