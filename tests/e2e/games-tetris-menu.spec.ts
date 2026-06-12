import { test, expect } from '@playwright/test';

// tab 必須能被真實使用者點擊（不被 PLAY 分頁的模式選單覆蓋層攔截），故用真實 .click()。
test.describe('Tetris 主選單三分頁', () => {
  test('預設顯示 PLAY 分頁與模式按鈕', async ({ page }) => {
    await page.goto('/games/tetris');
    await expect(page.locator('.mm-tab', { hasText: 'PLAY' })).toHaveClass(/is-active/);
    await expect(page.locator('[data-mode="solo"]')).toBeVisible();
  });

  test('切到 LEADERBOARD 顯示清單容器（空狀態或資料）', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('.mm-tab', { hasText: 'LEADERBOARD' }).click();
    await expect(page.locator('#panel-leaderboard')).toBeVisible();
    await expect(page.locator('#lb-list')).toBeVisible();
    await expect(page.locator('#lb-list')).not.toContainText('載入中…', { timeout: 5000 });
  });

  test('切到 PROFILE 訪客顯示連錢包 CTA', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('.mm-tab', { hasText: 'PROFILE' }).click();
    await expect(page.locator('#profile-guest')).toBeVisible();
    await expect(page.locator('#profile-wallet')).toBeVisible();
  });

  test('?mode=solo 仍直接開局（選單移除）', async ({ page }) => {
    await page.goto('/games/tetris?mode=solo');
    await expect(page.locator('#main-menu')).toHaveCount(0);
    await expect(page.locator('#tetris-canvas')).toBeVisible();
  });

  test('左上「← ARCADE」連結回到遊戲廳（不被選單層擋住）', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('.tetris-back').click();
    await expect(page).toHaveURL(/\/games\/?$/);
  });

  test('aria-selected 隨分頁切換更新', async ({ page }) => {
    await page.goto('/games/tetris');
    await expect(page.locator('.mm-tab[data-tab="play"]')).toHaveAttribute('aria-selected', 'true');
    await page.locator('.mm-tab', { hasText: 'PROFILE' }).click();
    await expect(page.locator('.mm-tab[data-tab="profile"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.mm-tab[data-tab="play"]')).toHaveAttribute('aria-selected', 'false');
  });

  test('點過「線上對戰」後切回 PLAY → SOLO/AI 仍可選（回退修正）', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('[data-mode="online"]').click();        // 進線上面板（隱藏模式選單）
    await expect(page.locator('#online-panel')).toBeVisible();
    await page.locator('.mm-tab', { hasText: 'LEADERBOARD' }).click(); // 離開 PLAY
    await page.locator('.mm-tab', { hasText: 'PLAY' }).click();        // 切回 PLAY
    await expect(page.locator('[data-mode="solo"]')).toBeVisible();    // 模式選單已還原
    await expect(page.locator('#online-panel')).toBeHidden();
  });
});

// G4：HANDLING 手感設定（DAS/ARR/SDF 滑桿，localStorage `tetris-handling`，下一局生效）
// 開關鈕在面板底部，dev server 的 astro-dev-toolbar 會攔截 pointer events（僅 dev 存在）→ 先移除。
async function removeDevToolbar(page: import('@playwright/test').Page): Promise<void> {
  await page
    .locator('astro-dev-toolbar')
    .evaluate((el) => el.remove(), undefined, { timeout: 3000 })
    .catch(() => {}); // production build 無 toolbar
}

test.describe('Tetris HANDLING 手感設定', () => {
  test('開面板 → 調 DAS → localStorage 反映且重載後保留', async ({ page }) => {
    await page.goto('/games/tetris');
    await removeDevToolbar(page);
    await page.locator('#handling-open').click();
    await expect(page.locator('#handling-panel')).toBeVisible();
    await page.locator('#handling-das').fill('250');
    await expect(page.locator('#handling-das-val')).toHaveText('250ms');
    const stored = await page.evaluate(() => localStorage.getItem('tetris-handling'));
    expect(JSON.parse(stored ?? '{}')).toEqual({ das: 250, arr: 35, sdf: 30 });
    await page.reload();
    await removeDevToolbar(page);
    await page.locator('#handling-open').click();
    await expect(page.locator('#handling-das')).toHaveValue('250');
  });

  test('恢復預設回 150/35/30，「完成」收合面板', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.evaluate(() => localStorage.setItem('tetris-handling', JSON.stringify({ das: 80, arr: 0, sdf: 0 })));
    await removeDevToolbar(page);
    await page.locator('#handling-open').click();
    await expect(page.locator('#handling-das')).toHaveValue('80'); // 開啟時同步現值
    await page.locator('#handling-reset').click();
    await expect(page.locator('#handling-das')).toHaveValue('150');
    const stored = await page.evaluate(() => localStorage.getItem('tetris-handling'));
    expect(JSON.parse(stored ?? '{}')).toEqual({ das: 150, arr: 35, sdf: 30 });
    await page.locator('#handling-done').click();
    await expect(page.locator('#handling-panel')).toBeHidden();
  });
});
