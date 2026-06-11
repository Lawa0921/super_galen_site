import { test, expect } from '@playwright/test';

// PROFILE 分頁皮膚櫃：訪客 level 0、guest key（tetris-skin:guest）。
test.describe('Tetris PROFILE 皮膚櫃', () => {
  test('訪客可見皮膚櫃：5 張卡、neon 使用中、訪客提示', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('.mm-tab', { hasText: 'PROFILE' }).click();
    await expect(page.locator('#skin-rack')).toBeVisible();
    await expect(page.locator('.skin-card')).toHaveCount(5);
    await expect(page.locator('.skin-card[data-skin="neon"]')).toHaveClass(/is-active/);
    await expect(page.locator('#skin-guest-cta')).toBeVisible();
  });

  test('crystal 未解鎖：is-locked，點擊無效（neon 仍使用中）', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('.mm-tab', { hasText: 'PROFILE' }).click();
    const crystal = page.locator('.skin-card[data-skin="crystal"]');
    await expect(crystal).toHaveClass(/is-locked/);
    // aria-disabled 使 Playwright 視為不可點，force 直接派發 click 以驗證 handler 的鎖定防呆
    await crystal.click({ force: true });
    await expect(page.locator('.skin-card[data-skin="neon"]')).toHaveClass(/is-active/);
    await expect(crystal).not.toHaveClass(/is-active/);
    // localStorage 不得被寫入 crystal
    const stored = await page.evaluate(() => localStorage.getItem('tetris-skin:guest'));
    expect(stored).not.toBe('crystal');
  });

  test('localStorage 選了未解鎖皮膚 → 高亮回退 neon（resolveSkin 防呆）', async ({ page }) => {
    // 訪客 level 0 未解鎖 bit8（Lv 2）
    await page.addInitScript(() => localStorage.setItem('tetris-skin:guest', 'bit8'));
    await page.goto('/games/tetris');
    await page.locator('.mm-tab', { hasText: 'PROFILE' }).click();
    await expect(page.locator('.skin-card[data-skin="neon"]')).toHaveClass(/is-active/);
    await expect(page.locator('.skin-card[data-skin="bit8"]')).not.toHaveClass(/is-active/);
    await expect(page.locator('.skin-card[data-skin="bit8"]')).toHaveClass(/is-locked/);
  });
});
