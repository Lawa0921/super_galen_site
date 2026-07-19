import { test, expect } from '@playwright/test';

test.describe('dungeon defense', () => {
  test('載入 → 建塔 → 開波 → 狀態 wave、無錯誤', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('/games/defense');
    await page.waitForFunction(() => !!(window as any).__td?.game, null, { timeout: 15000 });

    const init = await page.evaluate(() => (window as any).__td.game.getState().status);
    expect(init).toBe('building');

    const r = await page.evaluate(() => {
      const g = (window as any).__td.game;
      const ok = g.build(g.getState().slots[0].id, 'arrow');
      g.startWave();
      return { ok, status: g.getState().status, towers: g.getState().towers.length };
    });
    expect(r.ok).toBe(true);
    expect(r.towers).toBe(1);
    expect(r.status).toBe('wave');
    expect(errs).toEqual([]);
  });

  test('遊戲廳卡片可導向 defense', async ({ page }) => {
    await page.goto('/games');
    await expect(page.locator('a[href="/games/defense"]')).toBeVisible();
  });

  test('速度切換 / 下一波預覽 / 賣塔', async ({ page }) => {
    await page.goto('/games/defense');
    await page.waitForFunction(() => !!(window as any).__td?.game, null, { timeout: 15000 });
    // 備戰時顯示下一波組成（含敵人 icon）
    await expect(page.locator('#td-next')).toBeVisible();
    await expect(page.locator('#td-next-list img').first()).toBeVisible();
    // 速度切換 ×1 → ×2
    await page.click('#td-speed');
    await expect(page.locator('#td-speed')).toHaveText(/×2/);
    // 賣塔退 70%
    const r = await page.evaluate(() => {
      const g = (window as any).__td.game;
      g.build(g.getState().slots[0].id, 'arrow');
      const before = g.getState().gold;
      const ok = g.sell(g.getState().towers[0].id);
      return { ok, delta: g.getState().gold - before };
    });
    expect(r.ok).toBe(true);
    expect(r.delta).toBe(35);
  });
});
