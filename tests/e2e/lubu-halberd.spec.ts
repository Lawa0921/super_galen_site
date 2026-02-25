import { test, expect } from '@playwright/test';

/**
 * 呂布方天畫戟 3D 場景冒煙測試
 * 驗證 Three.js WebGL canvas 正常載入
 */

test.describe('呂布方天畫戟 3D 場景', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guild/lubu');
    await page.waitForLoadState('domcontentloaded');
  });

  test('頁面應該載入 WebGL canvas', async ({ page }) => {
    const canvas = page.locator('#webgl-container canvas');
    await expect(canvas).toBeAttached({ timeout: 15000 });
  });

  test('WebGL canvas 應該有正確的尺寸', async ({ page }) => {
    const canvas = page.locator('#webgl-container canvas');
    await expect(canvas).toBeAttached({ timeout: 15000 });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });
});
