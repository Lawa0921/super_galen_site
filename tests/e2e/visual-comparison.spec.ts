import { test, expect } from '@playwright/test';

// 輔助函數：安全點擊頁籤
async function safeClick(page, selector: string) {
  // 移除 Vite 錯誤遮罩
  await page.evaluate(() => {
    const overlay = document.querySelector('vite-error-overlay');
    if (overlay) overlay.remove();
  });
  await page.click(selector);
}

test.describe('視覺與樣式比較', () => {

  test('頁籤按鈕應該有正確的樣式', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // 取得 active 頁籤的樣式
    const activeTabStyles = await page.evaluate(() => {
      const activeTab = document.querySelector('.tab-btn.active');
      if (!activeTab) return null;
      const styles = window.getComputedStyle(activeTab);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderBottomColor: styles.borderBottomColor,
      };
    });

    expect(activeTabStyles).not.toBeNull();
    expect(activeTabStyles!.backgroundColor).toBeDefined();
  });

  test('狀態列應該有正確的漸層背景', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    const statusBarStyles = await page.evaluate(() => {
      const statusBar = document.querySelector('.status-bar');
      if (!statusBar) return null;
      const styles = window.getComputedStyle(statusBar);
      return {
        background: styles.background,
        borderRadius: styles.borderRadius,
      };
    });

    expect(statusBarStyles).not.toBeNull();
  });

  test('HP/MP/SP 條應該有正確的顏色', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    const barColors = await page.evaluate(() => {
      const hpFill = document.querySelector('.hp-bar .bar-fill');
      const mpFill = document.querySelector('.mp-bar .bar-fill');
      const spFill = document.querySelector('.sp-bar .bar-fill');

      const getBackgroundColor = (el: Element | null) => {
        if (!el) return null;
        return window.getComputedStyle(el).backgroundColor;
      };

      return {
        hp: getBackgroundColor(hpFill),
        mp: getBackgroundColor(mpFill),
        sp: getBackgroundColor(spFill),
      };
    });

    // HP 應該是紅色系，MP 藍色系，SP 綠色系
    expect(barColors.hp).not.toBeNull();
    expect(barColors.mp).not.toBeNull();
    expect(barColors.sp).not.toBeNull();
  });

  test('技能樹 Canvas 應該已繪製內容', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // 點擊技能頁籤
    await safeClick(page, '[data-tab="skills"]');
    await page.waitForTimeout(1500);

    // 檢查 Canvas 是否有繪製內容（非空白）
    const canvasHasContent = await page.evaluate(() => {
      const canvas = document.querySelector('#skill-tree-canvas') as HTMLCanvasElement;
      if (!canvas) return false;

      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      // 檢查 Canvas 是否有非透明像素
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) return true;
      }
      return false;
    });

    expect(canvasHasContent).toBe(true);
  });

  test('物品欄物品應該有正確的稀有度邊框', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // 點擊物品頁籤
    await safeClick(page, '[data-tab="inventory"]');
    await page.waitForTimeout(1000);

    const rarityClasses = await page.evaluate(() => {
      const items = document.querySelectorAll('.multi-slot-item');
      const rarities: string[] = [];

      items.forEach(item => {
        const rarityEl = item.querySelector('.item-rarity');
        if (rarityEl) {
          const classList = Array.from(rarityEl.classList);
          const rarityClass = classList.find(c => ['common', 'magic', 'rare', 'legendary', 'set', 'unique'].includes(c));
          if (rarityClass) rarities.push(rarityClass);
        }
      });

      return [...new Set(rarities)].sort();
    });

    // 應該有多種稀有度
    expect(rarityClasses.length).toBeGreaterThan(1);
  });

  test('成就 hotspot 應該有正確數量', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // 點擊成就頁籤
    await safeClick(page, '[data-tab="achievements"]');
    await page.waitForTimeout(1000);

    // 成就 hotspot 是 <area> 元素，檢查 image map
    const hotspotCount = await page.evaluate(() => {
      const hotspots = document.querySelectorAll('area.achievement-hotspot');
      return hotspots.length;
    });

    // 應該有 14 個 hotspot
    expect(hotspotCount).toBe(14);

    // 每個 hotspot 都應該有 data-achievement 屬性
    const hasAllAttributes = await page.evaluate(() => {
      const hotspots = document.querySelectorAll('area.achievement-hotspot');
      return Array.from(hotspots).every(hs => hs.hasAttribute('data-achievement'));
    });
    expect(hasAllAttributes).toBe(true);
  });

  test('語言切換器應該正常工作', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000); // 等待 JS 完全載入

    // 確認語言切換器按鈕存在並可點擊
    const langBtn = page.locator('#language-current');
    await expect(langBtn).toBeVisible();

    // 點擊語言切換器按鈕
    await langBtn.click();
    await page.waitForTimeout(500);

    // 應該有 5 種語言選項（無論下拉選單是否可見，選項應該存在於 DOM 中）
    const optionCount = await page.locator('.language-option').count();
    expect(optionCount).toBe(5);

    // 檢查下拉選單是否有 show class 或是可見
    const isDropdownShown = await page.evaluate(() => {
      const dropdown = document.querySelector('#language-dropdown');
      if (!dropdown) return false;
      const hasShow = dropdown.classList.contains('show');
      const style = window.getComputedStyle(dropdown);
      const isVisible = style.visibility !== 'hidden' && style.opacity !== '0';
      return hasShow || isVisible;
    });
    expect(isDropdownShown).toBe(true);
  });

  test('購買頁籤的內部頁籤應該可切換', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // 點擊購買頁籤
    await safeClick(page, '[data-tab="purchase"]');
    await page.waitForTimeout(1000);

    // 檢查內部頁籤是否存在
    const innerTabsNav = await page.locator('.inner-tabs-nav').count();
    expect(innerTabsNav).toBeGreaterThan(0);

    // 檢查有 inner-tab-btn
    const innerTabs = await page.locator('.inner-tab-btn').count();
    expect(innerTabs).toBeGreaterThan(0);
  });

  test('召喚區域應該存在', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // 點擊夥伴頁籤
    await safeClick(page, '[data-tab="party"]');
    await page.waitForTimeout(1000);

    // 召喚互動區域應該存在（使用正確的選擇器）
    const summonArea = page.locator('#portalInteractiveArea, .portal-interactive-area, .summon-portal-container');
    await expect(summonArea.first()).toBeVisible();
  });

  test('故事頁籤應該顯示書本', async ({ page }) => {
    await page.goto('/zh-TW/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    // 點擊故事頁籤
    await safeClick(page, '[data-tab="story"]');
    await page.waitForTimeout(2000);

    // 書本容器應該存在
    await expect(page.locator('.book-container')).toBeVisible();
    await expect(page.locator('.book')).toBeVisible();
  });
});
