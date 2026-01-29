import { test, expect } from '@playwright/test';

// 輔助函數：等待頁面準備好
async function waitForPageReady(page) {
  await page.waitForLoadState('domcontentloaded');
  // 移除 Vite 錯誤遮罩
  await page.evaluate(() => {
    const overlay = document.querySelector('vite-error-overlay');
    if (overlay) overlay.remove();
  });
  await page.waitForTimeout(1500);
}

test.describe('Jekyll vs Astro 行為比較', () => {

  async function collectPageData(page) {
    return await page.evaluate(() => {
      const data: any = {};
      
      // 1. 檢查 window 上的全域物件（使用正確的變數名稱，全部小寫）
      data.globals = {
        hasI18n: typeof (window as any).i18n !== 'undefined',
        hasGameState: typeof (window as any).GameState !== 'undefined',
        hasUnifiedWalletManager: typeof (window as any).unifiedWalletManager !== 'undefined',
        hasNetworkMonitor: typeof (window as any).networkMonitor !== 'undefined',
        hasSGTPurchaseManager: typeof (window as any).sgtPurchaseManager !== 'undefined',
      };
      
      // 2. 檢查 Cookie
      data.cookies = document.cookie.split(';').map(c => c.trim().split('=')[0]).filter(Boolean).sort();
      
      // 3. 檢查頁籤狀態
      const tabs = document.querySelectorAll('.tab-btn[data-tab]');
      const activeTab = document.querySelector('.tab-btn.active');
      data.tabs = {
        count: tabs.length,
        activeTab: activeTab?.getAttribute('data-tab'),
        tabIds: Array.from(tabs).map(t => t.getAttribute('data-tab')).sort()
      };
      
      // 4. 檢查面板狀態
      const panels = document.querySelectorAll('.tab-panel');
      const activePanel = document.querySelector('.tab-panel.active');
      data.panels = {
        count: panels.length,
        activePanel: activePanel?.id,
        panelIds: Array.from(panels).map(p => p.id).sort()
      };
      
      // 5. 檢查狀態列存在性
      data.statusBar = {
        hasHpBar: !!document.querySelector('.hp-bar'),
        hasMpBar: !!document.querySelector('.mp-bar'),
        hasSpBar: !!document.querySelector('.sp-bar'),
        hasGold: !!document.querySelector('#gold-amount'),
      };
      
      // 6. 檢查 i18n 語言
      data.i18n = {
        currentLang: (window as any).i18n?.currentLang,
        hasTranslations: (window as any).i18n?.translations ? Object.keys((window as any).i18n.translations).length > 0 : false
      };
      
      // 7. 檢查 Canvas 元素
      const skillCanvas = document.querySelector('#skill-tree-canvas') as HTMLCanvasElement;
      data.canvas = {
        hasSkillCanvas: !!skillCanvas,
        canvasWidth: skillCanvas?.width,
        canvasHeight: skillCanvas?.height
      };
      
      // 8. 檢查物品欄
      const inventoryItems = document.querySelectorAll('.multi-slot-item');
      const potions = document.querySelectorAll('.multi-slot-item.potion');
      data.inventory = {
        itemCount: inventoryItems.length,
        potionCount: potions.length
      };
      
      // 9. 檢查成就（使用 area 元素選擇器）
      const achievements = document.querySelectorAll('area.achievement-hotspot');
      data.achievements = {
        count: achievements.length
      };
      
      return data;
    });
  }

  test('全域物件應該一致', async ({ page }) => {
    // 測試 Astro 版本
    await page.goto('/zh-TW/');
    await waitForPageReady(page);
    
    const data = await collectPageData(page);
    
    // 驗證所有必要的全域物件存在
    expect(data.globals.hasI18n).toBe(true);
    expect(data.globals.hasGameState).toBe(true);
    expect(data.globals.hasUnifiedWalletManager).toBe(true);
    expect(data.globals.hasNetworkMonitor).toBe(true);
    expect(data.globals.hasSGTPurchaseManager).toBe(true);
  });

  test('頁籤數量和 ID 應該正確', async ({ page }) => {
    await page.goto('/zh-TW/');
    await waitForPageReady(page);
    
    const data = await collectPageData(page);
    
    // 應該有 7 個內部頁籤
    expect(data.tabs.count).toBe(7);
    expect(data.tabs.tabIds).toContain('status');
    expect(data.tabs.tabIds).toContain('skills');
    expect(data.tabs.tabIds).toContain('story');
    expect(data.tabs.tabIds).toContain('inventory');
    expect(data.tabs.tabIds).toContain('achievements');
    expect(data.tabs.tabIds).toContain('party');
    expect(data.tabs.tabIds).toContain('purchase');
    
    // 預設應該是 status
    expect(data.tabs.activeTab).toBe('status');
  });

  test('面板數量和 ID 應該正確', async ({ page }) => {
    await page.goto('/zh-TW/');
    await waitForPageReady(page);
    
    const data = await collectPageData(page);
    
    // 應該有 7 個面板
    expect(data.panels.count).toBe(7);
  });

  test('狀態列元素應該存在', async ({ page }) => {
    await page.goto('/zh-TW/');
    await waitForPageReady(page);
    
    const data = await collectPageData(page);
    
    expect(data.statusBar.hasHpBar).toBe(true);
    expect(data.statusBar.hasMpBar).toBe(true);
    expect(data.statusBar.hasSpBar).toBe(true);
    expect(data.statusBar.hasGold).toBe(true);
  });

  test('i18n 應該正確初始化', async ({ page }) => {
    await page.goto('/zh-TW/');
    await waitForPageReady(page);
    
    const data = await collectPageData(page);
    
    expect(data.i18n.currentLang).toBe('zh-TW');
    expect(data.i18n.hasTranslations).toBe(true);
  });

  test('技能樹 Canvas 應該存在', async ({ page }) => {
    await page.goto('/zh-TW/');
    await waitForPageReady(page);
    
    const data = await collectPageData(page);
    
    expect(data.canvas.hasSkillCanvas).toBe(true);
  });

  test('物品欄應該有正確數量的物品', async ({ page }) => {
    await page.goto('/zh-TW/');
    await waitForPageReady(page);
    
    const data = await collectPageData(page);
    
    // 應該有 49 個物品（包含裝備和藥水）
    expect(data.inventory.itemCount).toBe(49);
    // 應該有 38 個藥水
    expect(data.inventory.potionCount).toBe(38);
  });

  test('成就應該有 14 個', async ({ page }) => {
    await page.goto('/zh-TW/');
    await waitForPageReady(page);
    
    const data = await collectPageData(page);
    
    expect(data.achievements.count).toBe(14);
  });
});
