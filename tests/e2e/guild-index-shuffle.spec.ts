import { test, expect } from '@playwright/test';

/**
 * 公會首頁（/guild/）— 重新抽取卡堆動畫回歸測試
 *
 * Bug：按「重新抽取」後，卡堆（#card-stack）會在重組動畫的前段
 * 於 X 軸左右鏡像（向右展開的牌堆瞬間變成向左、牌面反轉），
 * 之後才轉正。根因是 `@keyframes stack-reform` 的起始幀使用了
 * `rotateY(180deg)`，使 X 軸縮放分量（DOMMatrix.m11）變為負值。
 *
 * 此測試直接檢查重組動畫起始幀的 transform：m11 必須 >= 0
 * （不得在 X 軸鏡像）。用 computed animationName 取得實際 keyframes
 * 名稱，避免受 Astro scoped style 對名稱雜湊化的影響。
 */

const BASE_URL = '/guild/';

test.describe('公會首頁 — 重新抽取卡堆動畫', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#card-stack').waitFor({ state: 'attached' });
  });

  test('重組動畫（stack-reform）起始幀不得在 X 軸鏡像（m11 >= 0）', async ({ page }) => {
    const m11 = await page.evaluate(() => {
      const container = document.getElementById('card-stack-container');
      const stack = document.getElementById('card-stack');
      if (!container || !stack) return null;

      // 套用重組狀態以取得實際生效的 keyframes 名稱（避開 Astro scoping）
      container.classList.remove('hidden');
      container.classList.add('reforming');
      const animName = getComputedStyle(stack).animationName;
      container.classList.remove('reforming');
      if (!animName || animName === 'none') return null;

      // 在所有 stylesheet 中尋找該 @keyframes 規則
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // 跨來源 stylesheet 無法讀取，略過
        }
        for (const rule of Array.from(rules)) {
          if (
            rule.type === CSSRule.KEYFRAMES_RULE &&
            (rule as CSSKeyframesRule).name === animName
          ) {
            const kf = rule as CSSKeyframesRule;
            const start = kf.findRule('0%') || kf.findRule('from');
            const transform = start ? start.style.transform : '';
            // DOMMatrix.m11 < 0 代表 X 軸被鏡像（例如 rotateY(180deg)）
            return new DOMMatrix(transform).m11;
          }
        }
      }
      return null;
    });

    expect(m11, '找不到 stack-reform 重組動畫起始幀，或無法解析其 transform').not.toBeNull();
    expect(
      m11,
      '重組動畫起始幀在 X 軸鏡像（rotateY 越過 90°），會造成「重新抽取」後卡堆左右相反'
    ).toBeGreaterThanOrEqual(0);
  });
});

test.describe('公會首頁 — 冒險者搜尋與鍵盤操作', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('可從完整名冊搜尋姓名，並處理清除與無結果狀態', async ({ page }) => {
    const search = page.locator('#guild-search-input');
    await expect(search).toBeVisible();

    await search.fill('1庭');
    await expect(page.locator('#card-stack-container')).toBeHidden();
    await expect(page.locator('#guild-showcase')).toBeVisible();
    await expect(page.locator('#guild-members-grid .guild-member-card')).toHaveCount(1);
    await expect(page.locator('#guild-members-grid .member-name')).toContainText('1庭');
    await expect(page.locator('#guild-members-grid .member-link')).toBeVisible();
    await expect(page.locator('#guild-members-grid .member-link')).toHaveAttribute(
      'href',
      '/guild/1tingrealty'
    );

    await search.fill('民主教育');
    const resultCard = page.locator('#guild-members-grid .guild-member-card');
    await expect(resultCard).toHaveCount(1);
    await expect(page.locator('#guild-members-grid .member-name')).toContainText('Regina');
    await expect.poll(
      () => resultCard.evaluate((card) => getComputedStyle(card).opacity),
      { message: '搜尋結果卡片應完成入場狀態' }
    ).toBe('1');
    const resultBox = await resultCard.boundingBox();
    expect(resultBox).not.toBeNull();
    expect(resultBox!.x).toBeGreaterThanOrEqual(0);

    await search.fill('查無此冒險者-zzzz');
    await expect(page.locator('#guild-members-grid .guild-member-card')).toHaveCount(0);
    await expect(page.locator('#guild-no-results')).toBeVisible();

    await search.fill('');
    await expect(page.locator('#guild-no-results')).toBeHidden();
    await expect(page.locator('#guild-members-grid .guild-member-card')).toHaveCount(10);
  });

  test('抽卡入口可用 Enter 操作，並揭露可聚焦的成員連結', async ({ page }) => {
    const stack = page.locator('#card-stack-container');
    await expect(stack).toHaveAttribute('role', 'button');
    await expect(stack).toHaveAttribute('tabindex', '0');
    await expect(stack).toHaveAttribute('aria-expanded', 'false');

    await stack.focus();
    await expect(stack).toBeFocused();
    await stack.press('Enter');

    await expect(stack).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#guild-showcase')).toBeVisible();
    await expect(page.locator('#guild-members-grid .member-link')).toHaveCount(10);
    await page.locator('#guild-members-grid .member-link').first().focus();
    await expect(page.locator('#guild-members-grid .member-link').first()).toBeFocused();
  });

  test('390px 手機寬度仍可完整操作搜尋欄', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL);

    const search = page.locator('#guild-search-input');
    await expect(search).toBeVisible();
    const box = await search.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });

  test('多語頁搜尋結果保留語言前綴', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/guild/');
    const search = page.locator('#guild-search-input');
    await search.fill('Renee Chen');

    await expect(page.locator('#guild-members-grid .guild-member-card')).toHaveCount(1);
    await expect(page.locator('#guild-members-grid .member-link')).toHaveAttribute(
      'href',
      '/en/guild/1tingrealty'
    );
  });

  test('抽卡動畫期間輸入姓名，動畫結束仍保留搜尋結果', async ({ page }) => {
    const stack = page.locator('#card-stack-container');
    const search = page.locator('#guild-search-input');
    const resultCard = page.locator('#guild-members-grid .guild-member-card');

    await stack.click();
    await search.fill('1庭');
    await page.waitForTimeout(1200);

    await expect(resultCard).toHaveCount(1);
    await expect(resultCard.locator('.member-name')).toContainText('1庭');
  });

  test('重新抽取期間再次搜尋，動畫結束仍顯示單一結果', async ({ page }) => {
    const search = page.locator('#guild-search-input');
    const resultCard = page.locator('#guild-members-grid .guild-member-card');

    await search.fill('1庭');
    await expect(resultCard).toHaveCount(1);
    await page.locator('#guild-refresh-btn').click();
    await search.fill('民主教育');
    await page.waitForTimeout(2400);

    await expect(resultCard).toHaveCount(1);
    await expect(resultCard.locator('.member-name')).toContainText('Regina');
    await expect(page.locator('#guild-showcase')).toBeVisible();
  });
});
