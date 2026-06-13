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
