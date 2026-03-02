import { test, expect } from '@playwright/test';

/**
 * Guild Member: Bèbè Liu 頁面 Footer E2E 測試
 * 驗證 footer 區域：
 * - footer 元素存在
 * - 包含回到 /guild 的 credit 連結
 * - 包含 credit 文字
 */

const BASE_URL = '/guild/bebe_liu';

test.describe('Bèbè Liu 頁面 Footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('footer 元素應存在', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeAttached();
  });

  test('footer credit 應包含 SuperGalen 連結指向 /guild/', async ({ page }) => {
    const creditLink = page.locator('footer .footer-credit a[href="/guild/"]');
    await expect(creditLink).toContainText(/SuperGalen/i);
  });

  test('footer 應包含 credit 文字', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toContainText(/Made with/i);
  });
});
