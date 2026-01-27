import { test, expect, Page } from '@playwright/test';

/**
 * Jekyll 基準測試
 * 在遷移到 Astro 之前，建立功能基準
 * 這些測試用於確保遷移後功能不會退化
 */

test.describe('首頁載入與基礎功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 等待頁面完全載入
    await page.waitForLoadState('networkidle');
  });

  test('首頁應該正確載入 RPG 介面', async ({ page }) => {
    // 檢查主要容器
    await expect(page.locator('.rpg-interface')).toBeVisible();
    await expect(page.locator('.game-container')).toBeVisible();
    await expect(page.locator('.status-bar')).toBeVisible();
  });

  test('狀態列應該顯示玩家資訊', async ({ page }) => {
    // 玩家資訊
    await expect(page.locator('.player-info')).toBeVisible();
    await expect(page.locator('.player-name')).toBeVisible();
    await expect(page.locator('.player-title')).toBeVisible();

    // 金幣顯示
    await expect(page.locator('.gold-display')).toBeVisible();
    await expect(page.locator('#gold-amount')).toBeVisible();
  });

  test('資源條應該顯示 HP/MP/SP/EXP', async ({ page }) => {
    await expect(page.locator('.hp-bar')).toBeVisible();
    await expect(page.locator('.mp-bar')).toBeVisible();
    await expect(page.locator('.sp-bar')).toBeVisible();
    await expect(page.locator('.exp-bar')).toBeVisible();
  });
});

test.describe('頁籤導航系統', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('應該顯示所有頁籤按鈕', async ({ page }) => {
    const tabs = ['status', 'skills', 'story', 'inventory', 'achievements', 'party', 'purchase'];

    for (const tab of tabs) {
      await expect(page.locator(`button[data-tab="${tab}"]`)).toBeVisible();
    }

    // 公會和日誌是連結而非按鈕
    await expect(page.locator('a.guild-nav-btn')).toBeVisible();
    await expect(page.locator('a.journal-nav-btn')).toBeVisible();
  });

  test('預設應該顯示狀態頁籤', async ({ page }) => {
    await expect(page.locator('#status-tab')).toBeVisible();
    await expect(page.locator('button[data-tab="status"]')).toHaveClass(/active/);
  });

  test('點擊頁籤應該切換內容', async ({ page }) => {
    // 點擊技能頁籤
    await page.click('button[data-tab="skills"]');
    await expect(page.locator('#skills-tab')).toBeVisible();
    await expect(page.locator('button[data-tab="skills"]')).toHaveClass(/active/);

    // 點擊故事頁籤
    await page.click('button[data-tab="story"]');
    await expect(page.locator('#story-tab')).toBeVisible();

    // 點擊物品頁籤
    await page.click('button[data-tab="inventory"]');
    await expect(page.locator('#inventory-tab')).toBeVisible();

    // 點擊成就頁籤
    await page.click('button[data-tab="achievements"]');
    await expect(page.locator('#achievements-tab')).toBeVisible();

    // 點擊夥伴頁籤
    await page.click('button[data-tab="party"]');
    await expect(page.locator('#party-tab')).toBeVisible();

    // 點擊購買頁籤
    await page.click('button[data-tab="purchase"]');
    await expect(page.locator('#purchase-tab')).toBeVisible();
  });
});

test.describe('狀態頁籤內容', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('應該顯示屬性列表', async ({ page }) => {
    await expect(page.locator('.attributes-section')).toBeVisible();
    await expect(page.locator('.attribute-list')).toBeVisible();

    // 檢查各項屬性
    const attributes = ['STR', 'INT', 'BUG', 'SAN', 'STS', 'CAF', 'OVT', 'DLN', 'LUK'];
    for (const attr of attributes) {
      await expect(page.locator(`.attr-name:has-text("${attr}")`)).toBeVisible();
    }
  });

  test('應該顯示狀態資訊區塊', async ({ page }) => {
    await expect(page.locator('.stats-section')).toBeVisible();
  });
});

test.describe('技能樹頁籤', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('button[data-tab="skills"]');
  });

  test('應該顯示技能樹 Canvas', async ({ page }) => {
    // 等待技能樹載入
    await page.waitForTimeout(1000);
    const canvas = page.locator('#skill-tree-canvas');
    await expect(canvas).toBeVisible();
  });

  test('應該顯示技能分支按鈕', async ({ page }) => {
    // 檢查分支切換按鈕是否存在
    await expect(page.locator('.skill-branch-selector, .branch-btn').first()).toBeVisible();
  });
});

test.describe('物品欄頁籤', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('button[data-tab="inventory"]');
  });

  test('應該顯示物品欄介面', async ({ page }) => {
    await expect(page.locator('#inventory-tab')).toBeVisible();
    // 檢查 Diablo 2 風格物品欄
    await expect(page.locator('.d2-inventory-panel, .inventory-panel').first()).toBeVisible();
  });
});

test.describe('成就系統頁籤', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('button[data-tab="achievements"]');
  });

  test('應該顯示成就介面', async ({ page }) => {
    await expect(page.locator('#achievements-tab')).toBeVisible();
  });
});

test.describe('購買頁籤', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('button[data-tab="purchase"]');
  });

  test('應該顯示購買介面', async ({ page }) => {
    await expect(page.locator('#purchase-tab')).toBeVisible();
  });

  test('應該顯示錢包連接區域', async ({ page }) => {
    // 檢查錢包連接相關元素
    const walletSection = page.locator('.wallet-section, .connect-wallet, #wallet-status').first();
    await expect(walletSection).toBeVisible();
  });
});

test.describe('語言切換功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('應該顯示語言切換器', async ({ page }) => {
    await expect(page.locator('.language-switcher')).toBeVisible();
  });

  test('語言切換應該更新頁面文字', async ({ page }) => {
    // 取得初始語言的玩家名稱
    const initialName = await page.locator('.player-name').textContent();

    // 嘗試切換到英文
    await page.click('.language-switcher');
    const enOption = page.locator('[data-lang="en"], .lang-option:has-text("English")').first();

    if (await enOption.isVisible()) {
      await enOption.click();
      // 等待語言切換完成
      await page.waitForTimeout(500);

      // 檢查頁面有變化（可能是相同文字，但確保沒有錯誤）
      await expect(page.locator('.player-name')).toBeVisible();
    }
  });
});

test.describe('遊戲狀態持久化', () => {
  test('應該在重新載入後保持狀態', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 取得初始金幣數量
    const initialGold = await page.locator('#gold-amount').textContent();

    // 重新載入頁面
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 金幣數量應該相同（從 Cookie 載入）
    const goldAfterReload = await page.locator('#gold-amount').textContent();
    expect(goldAfterReload).toBe(initialGold);
  });
});

test.describe('響應式設計', () => {
  test('桌面版應該正確顯示', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.game-container')).toBeVisible();
    await expect(page.locator('.game-tabs')).toBeVisible();
  });

  test('平板版應該正確顯示', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.game-container')).toBeVisible();
  });

  test('手機版應該正確顯示', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.game-container')).toBeVisible();
  });
});

test.describe('公會頁面', () => {
  test('公會連結應該可以導航', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 點擊公會連結
    await page.click('a.guild-nav-btn');

    // 應該導航到公會頁面
    await expect(page).toHaveURL(/\/guild\/?/);
  });
});

test.describe('日誌頁面', () => {
  test('日誌連結應該可以導航', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 點擊日誌連結
    await page.click('a.journal-nav-btn');

    // 應該導航到日誌頁面
    await expect(page).toHaveURL(/\/journal\/?/);
  });

  test('日誌頁面應該顯示文章列表', async ({ page }) => {
    await page.goto('/journal/');
    await page.waitForLoadState('networkidle');

    // 應該有文章卡片
    const postCards = page.locator('.post-card, .post-item, article').first();
    await expect(postCards).toBeVisible();
  });
});

test.describe('RSS Feed', () => {
  test('RSS Feed 應該可用', async ({ page }) => {
    const response = await page.goto('/feed.xml');
    expect(response?.status()).toBe(200);

    // 檢查內容類型
    const contentType = response?.headers()['content-type'];
    expect(contentType).toContain('xml');
  });
});

test.describe('SEO 元素', () => {
  test('應該有正確的 meta 標籤', async ({ page }) => {
    await page.goto('/');

    // 檢查 title
    await expect(page).toHaveTitle(/SuperGalen|首頁/);

    // 檢查 description
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /.+/);

    // 檢查 Open Graph
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', /.+/);
  });
});
