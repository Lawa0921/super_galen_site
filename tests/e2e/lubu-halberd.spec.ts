import { test, expect } from '@playwright/test';

/**
 * 呂布方天畫戟 3D 模型測試
 * 驗證方天畫戟的材質配色與結構是否符合真實參考圖：
 * - 銀色鋼質桿身
 * - 銀色月牙刃
 * - 金色護手裝飾
 * - 頂端尖刺為銀色
 */

test.describe('呂布方天畫戟 3D 模型', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guild/lubu');
    await page.waitForLoadState('load');
    // 等待 Three.js 場景初始化（CDN 載入 Three.js 可能較慢）
    await page.waitForFunction(() => (window as any).__halberdDebug !== undefined, { timeout: 30000 });
  });

  test('頁面應該載入 WebGL canvas', async ({ page }) => {
    const canvas = page.locator('#webgl-container canvas');
    await expect(canvas).toBeAttached();
  });

  test('桿身應該使用銀色金屬材質', async ({ page }) => {
    const poleColor = await page.evaluate(() => {
      const debug = (window as any).__halberdDebug;
      return debug.poleMaterial.color.getHexString();
    });
    // 銀色/鋼色系 - hex 應接近 aaaaaa ~ cccccc 範圍
    const r = parseInt(poleColor.substring(0, 2), 16);
    const g = parseInt(poleColor.substring(2, 4), 16);
    const b = parseInt(poleColor.substring(4, 6), 16);
    // 銀色特徵：RGB 值相近且偏亮（>= 140）
    expect(r).toBeGreaterThanOrEqual(140);
    expect(g).toBeGreaterThanOrEqual(140);
    expect(b).toBeGreaterThanOrEqual(140);
  });

  test('桿身材質應該是高金屬度', async ({ page }) => {
    const metalness = await page.evaluate(() => {
      const debug = (window as any).__halberdDebug;
      return debug.poleMaterial.metalness;
    });
    expect(metalness).toBeGreaterThanOrEqual(0.8);
  });

  test('月牙刃應該使用銀色材質（非金色）', async ({ page }) => {
    const bladeColor = await page.evaluate(() => {
      const debug = (window as any).__halberdDebug;
      return debug.bladeMaterial.color.getHexString();
    });
    const r = parseInt(bladeColor.substring(0, 2), 16);
    const g = parseInt(bladeColor.substring(2, 4), 16);
    const b = parseInt(bladeColor.substring(4, 6), 16);
    // 銀色特徵：RGB 值相近（差異 < 30）且偏亮
    expect(r).toBeGreaterThanOrEqual(140);
    expect(Math.abs(r - g)).toBeLessThan(30);
    expect(Math.abs(r - b)).toBeLessThan(30);
  });

  test('頂端尖刺應該使用銀色材質', async ({ page }) => {
    const spikeColor = await page.evaluate(() => {
      const debug = (window as any).__halberdDebug;
      return debug.spikeMaterial.color.getHexString();
    });
    const r = parseInt(spikeColor.substring(0, 2), 16);
    const g = parseInt(spikeColor.substring(2, 4), 16);
    const b = parseInt(spikeColor.substring(4, 6), 16);
    expect(r).toBeGreaterThanOrEqual(140);
    expect(Math.abs(r - g)).toBeLessThan(30);
    expect(Math.abs(r - b)).toBeLessThan(30);
  });

  test('護手裝飾應該使用金色材質', async ({ page }) => {
    const guardColor = await page.evaluate(() => {
      const debug = (window as any).__halberdDebug;
      return debug.guardMaterial.color.getHexString();
    });
    // 金色特徵：R 值高，G 中高，B 低
    const r = parseInt(guardColor.substring(0, 2), 16);
    const g = parseInt(guardColor.substring(2, 4), 16);
    const b = parseInt(guardColor.substring(4, 6), 16);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeGreaterThan(120);
    expect(b).toBeLessThan(100);
  });

  test('方天畫戟應該包含正確的組件數量', async ({ page }) => {
    const components = await page.evaluate(() => {
      const debug = (window as any).__halberdDebug;
      return {
        hasSpike: debug.hasSpike,
        hasLeftBlade: debug.hasLeftBlade,
        hasRightBlade: debug.hasRightBlade,
        hasPole: debug.hasPole,
        hasGuard: debug.hasGuard,
        hasCrossGuard: debug.hasCrossGuard,
      };
    });
    expect(components.hasSpike).toBe(true);
    expect(components.hasLeftBlade).toBe(true);
    expect(components.hasRightBlade).toBe(true);
    expect(components.hasPole).toBe(true);
    expect(components.hasGuard).toBe(true);
    expect(components.hasCrossGuard).toBe(true);
  });
});

/**
 * 方天畫戟可見度測試
 * 驗證戟的初始位置讓刃部在相機可視範圍內
 */
test.describe('方天畫戟可見度', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guild/lubu');
    await page.waitForLoadState('load');
    await page.waitForFunction(() => (window as any).__halberdDebug !== undefined, { timeout: 30000 });
    // 等待入場動畫完成
    await page.waitForFunction(() => (window as any).__introComplete === true, { timeout: 15000 });
  });

  test('桌面版：戟的刃部 Y 座標應在相機可視範圍內 (±11.5)', async ({ page, isMobile }) => {
    test.skip(!!isMobile, '僅測試桌面版');
    const bladeWorldY = await page.evaluate(() => {
      const debug = (window as any).__halberdDebug;
      const group = debug.halberdGroup;
      // bladeGroup 在 local Y=15，加上 group position 和 rotation
      const pos = group.position;
      const rotZ = group.rotation.z;
      // 世界座標 Y ≈ pos.y + 15 * cos(rotZ)
      return pos.y + 15 * Math.cos(rotZ);
    });
    // 刃部世界 Y 應在 ±11.5 範圍內（相機可視範圍）
    expect(bladeWorldY).toBeLessThanOrEqual(11.5);
    expect(bladeWorldY).toBeGreaterThanOrEqual(-11.5);
  });

  test('桿身材質應該有 emissive 發光避免與背景同色', async ({ page }) => {
    const hasEmissive = await page.evaluate(() => {
      const debug = (window as any).__halberdDebug;
      const mat = debug.poleMaterial;
      // emissive 應該不是全黑 (0x000000)
      return mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0;
    });
    expect(hasEmissive).toBe(true);
  });

  test('桿身顏色應比 0x1a1a1a 更亮', async ({ page }) => {
    const colorHex = await page.evaluate(() => {
      const debug = (window as any).__halberdDebug;
      return debug.poleMaterial.color.getHex();
    });
    // 0x1a1a1a = 1710618，新值應更大（更亮）
    expect(colorHex).toBeGreaterThan(0x1a1a1a);
  });
});

/**
 * 入場動畫效果測試
 * 驗證「方天畫戟破墨而出」的入場互動效果
 */
test.describe('入場動畫效果', () => {
  test('頁面應包含入場遮罩元素', async ({ page }) => {
    await page.goto('/guild/lubu');
    await page.waitForLoadState('load');
    const veil = page.locator('#intro-veil');
    await expect(veil).toBeAttached();
  });

  test('入場動畫完成後遮罩應被移除', async ({ page }) => {
    await page.goto('/guild/lubu');
    await page.waitForLoadState('load');
    // 等待入場動畫完成
    await page.waitForFunction(() => (window as any).__introComplete === true, { timeout: 30000 });
    // 遮罩應已被移除
    const veil = page.locator('#intro-veil');
    await expect(veil).toHaveCount(0);
  });

  test('應該暴露全域 triggerInkBurst 函式', async ({ page }) => {
    await page.goto('/guild/lubu');
    await page.waitForLoadState('load');
    await page.waitForFunction(() => (window as any).__halberdDebug !== undefined, { timeout: 30000 });
    const hasFn = await page.evaluate(() => typeof (window as any).triggerInkBurst === 'function');
    expect(hasFn).toBe(true);
  });

  test('入場動畫完成後 hero 元素應可見', async ({ page }) => {
    await page.goto('/guild/lubu');
    await page.waitForLoadState('load');
    await page.waitForFunction(() => (window as any).__introComplete === true, { timeout: 30000 });
    const title = page.locator('h1.main-title');
    await expect(title).toBeVisible();
  });

  test('__introComplete 標記應在動畫完成後為 true', async ({ page }) => {
    await page.goto('/guild/lubu');
    await page.waitForLoadState('load');
    await page.waitForFunction(() => (window as any).__introComplete === true, { timeout: 30000 });
    const complete = await page.evaluate(() => (window as any).__introComplete);
    expect(complete).toBe(true);
  });
});
