import { test, expect, Page } from '@playwright/test';

/**
 * Guild Member: Meizhuan 頁面 E2E 測試
 * 測試滾動行為、區塊可見性、內容正確呈現
 */

const BASE_URL = '/guild/meizhuan';

/** 跳過進場動畫：點擊覆蓋層並等待過渡完成 */
async function dismissIntro(page: Page) {
  const overlay = page.locator('#intro-overlay');
  if (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) {
    await overlay.click();
    await page.waitForTimeout(2000);
  }
}

test.describe('Meizhuan 頁面基礎載入', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissIntro(page);
  });

  test('頁面應該正確載入（HTTP 200）', async ({ page }) => {
    const response = await page.goto(BASE_URL);
    expect(response?.status()).toBe(200);
  });

  test('應該顯示返回公會大廳的導航按鈕', async ({ page }) => {
    await expect(page.locator('.nav-back')).toBeVisible();
  });

  test('應該載入 Three.js canvas 容器', async ({ page }) => {
    await expect(page.locator('#canvas-container')).toBeAttached();
  });

  test('應該顯示 HUD 速度表', async ({ page }) => {
    await expect(page.locator('#hud-container')).toBeAttached();
    await expect(page.locator('#speed-text')).toBeAttached();
    await expect(page.locator('#gear-text')).toBeAttached();
  });
});

test.describe('Meizhuan Hero 區塊', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissIntro(page);
  });

  test('Hero 區塊應該顯示頭像', async ({ page }) => {
    await expect(page.locator('.avatar-img')).toBeAttached();
    const src = await page.locator('.avatar-img').getAttribute('src');
    expect(src).toContain('avatar');
  });

  test('Hero 區塊應該顯示名字「石專豆頁」', async ({ page }) => {
    const heroCard = page.locator('#section-hero .hud-card');
    await expect(heroCard).toBeVisible();
    await expect(heroCard).toContainText('石專豆頁');
  });

  test('Hero 區塊應該顯示副標題', async ({ page }) => {
    await expect(page.locator('.subtitle')).toBeVisible();
    await expect(page.locator('.subtitle')).toContainText('ENGINEER');
  });
});

test.describe('Meizhuan 所有區塊在滾動後應該可見', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissIntro(page);
  });

  test('Identity 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-identity');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const card = section.locator('.hud-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('IDENTITY_LOG');
  });

  test('Stats 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-stats');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const card = section.locator('.hud-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('ATTRIBUTE_MATRIX');
  });

  test('Skills 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-skills');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const card = section.locator('.hud-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('SKILL_TREE');
  });

  test('Equipment 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-equip');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const card = section.locator('.hud-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('EQUIPMENT_LOADOUT');
  });

  test('Hobbies 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-hobbies');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const card = section.locator('.hud-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('INTEREST_DB');
  });

  test('Personal 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-personal');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const card = section.locator('.hud-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('MAINTENANCE_LOG');
  });

  test('Quest Log 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-quest');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const card = section.locator('.hud-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('QUEST_LOG');
  });

  test('Achievements 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-achievements');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const card = section.locator('.hud-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('ACHIEVEMENT');
  });

  test('Goal 區塊應該在滾動到時可見', async ({ page }) => {
    const section = page.locator('#section-goal');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const card = section.locator('.hud-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('DREAM_ROUTE');
  });
});

test.describe('Meizhuan 進度條與互動元素', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissIntro(page);
  });

  test('Stats 區塊的進度條應該有寬度', async ({ page }) => {
    const section = page.locator('#section-stats');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);

    const progressBars = section.locator('.progress-fill');
    const count = await progressBars.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('Equipment 區塊應該有裝備格子', async ({ page }) => {
    const section = page.locator('#section-equip');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const equipSlots = section.locator('.equip-slot');
    const count = await equipSlots.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('Goal 區塊應該有社群連結', async ({ page }) => {
    const section = page.locator('#section-goal');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const socialLinks = section.locator('.social-link');
    const count = await socialLinks.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Meizhuan 新增內容區塊驗證', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissIntro(page);
  });

  test('Quest Log 區塊應該包含任務列表', async ({ page }) => {
    const section = page.locator('#section-quest');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const questItems = section.locator('.quest-item');
    const count = await questItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('Achievements 區塊應該包含成就項目', async ({ page }) => {
    const section = page.locator('#section-achievements');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const achievementItems = section.locator('.achievement-item');
    const count = await achievementItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

test.describe('Meizhuan 進場動畫 (Engine Ignition Intro)', () => {
  test('頁面載入時應顯示全螢幕啟動序列覆蓋層', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const overlay = page.locator('#intro-overlay');
    await expect(overlay).toBeVisible();
  });

  test('啟動序列應包含角色主題的終端文字', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const overlay = page.locator('#intro-overlay');
    await expect(overlay).toContainText('MEIZHUAN');
  });

  test('啟動序列應包含引擎轉速表元素', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const rpmGauge = page.locator('#intro-rpm-gauge');
    await expect(rpmGauge).toBeAttached();
  });

  test('啟動序列期間應鎖定頁面滾動', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const bodyOverflow = await page.evaluate(() => {
      return window.getComputedStyle(document.body).overflowY;
    });
    expect(bodyOverflow).toBe('hidden');
  });

  test('不點擊時覆蓋層不應自動消失', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // 等待 8 秒，覆蓋層仍應存在
    await page.waitForTimeout(8000);

    const overlay = page.locator('#intro-overlay');
    await expect(overlay).toBeVisible();
  });

  test('點擊啟動序列應觸發平滑關閉過渡', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const overlay = page.locator('#intro-overlay');
    await overlay.click();
    // 等待平滑過渡完成（內容淡出 + 覆蓋層淡出）
    await page.waitForTimeout(2500);

    await expect(overlay).not.toBeVisible();
  });

  test('啟動序列結束後 Hero 區塊應該可見', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // 點擊跳過
    await page.locator('#intro-overlay').click();
    await page.waitForTimeout(2500);

    const heroCard = page.locator('#section-hero .hud-card');
    await expect(heroCard).toBeVisible();
  });
});

test.describe('Meizhuan 響應式設計', () => {
  test('手機版應該正確顯示所有卡片', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissIntro(page);

    // Hero card 應可見
    const heroCard = page.locator('#section-hero .hud-card');
    await expect(heroCard).toBeVisible();

    // 滾動到 goal 確認可以到底
    const goalSection = page.locator('#section-goal');
    await goalSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const goalCard = goalSection.locator('.hud-card');
    await expect(goalCard).toBeVisible();
  });

  test('桌面版應該顯示左右交替排列', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await dismissIntro(page);

    // Identity 是 align-left
    const identitySection = page.locator('#section-identity');
    await expect(identitySection).toHaveClass(/align-left/);

    // Stats 是 align-right
    const statsSection = page.locator('#section-stats');
    await expect(statsSection).toHaveClass(/align-right/);
  });
});
