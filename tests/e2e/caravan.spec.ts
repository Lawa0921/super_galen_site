import { test, expect } from '@playwright/test';

test.describe('商隊與劍：外殼流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/games/caravan');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('標題畫面載入：無存檔時「繼續旅程」隱藏', async ({ page }) => {
    await expect(page.locator('#screen-title')).toBeVisible();
    await expect(page.locator('#btn-new-game')).toBeVisible();
    await expect(page.locator('#btn-continue')).toBeHidden();
  });

  test('開新檔 → 城鎮畫面顯示初始金幣 200', async ({ page }) => {
    await page.click('#btn-new-game');
    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#screen-title')).toBeHidden();
    await expect(page.locator('#town-gold')).toHaveText('200');
  });

  test('開新檔後重新整理 → 「繼續旅程」可見且回到城鎮', async ({ page }) => {
    await page.click('#btn-new-game');
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#btn-continue')).toBeVisible();
    await page.click('#btn-continue');
    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#town-gold')).toHaveText('200');
  });

  test('遊戲廳有 CARAVAN & SWORD 卡片並連到遊戲', async ({ page }) => {
    await page.goto('/games');
    const card = page.locator('a[href="/games/caravan"]');
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.locator('#screen-title')).toBeVisible();
  });
});

test.describe('商隊與劍：訓練場戰鬥', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/games/caravan?seed=42');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await expect(page.locator('#screen-town')).toBeVisible();
  });

  test('訓練場開戰：戰鬥畫面、敵我單位與意圖預告可見', async ({ page }) => {
    await page.click('#btn-training');
    await expect(page.locator('#screen-combat')).toBeVisible();
    await expect(page.locator('#combat-enemies .combat-unit')).toHaveCount(2);
    await expect(page.locator('#combat-party .combat-unit')).toHaveCount(1);
    await expect(page.locator('#combat-enemies .unit-intent').first()).not.toBeEmpty();
    await expect(page.locator('#combat-log p').first()).toContainText('戰鬥開始');
  });

  test('打到分出勝負：點招式推進、log 累積、結果面板出現、可返回城鎮', async ({ page }) => {
    await page.click('#btn-training');
    await expect(page.locator('#screen-combat')).toBeVisible();
    for (let i = 0; i < 40; i++) {
      const result = page.locator('#combat-result');
      if (await result.isVisible()) break;
      const move = page.locator('#combat-actions .move-btn').first();
      if (await move.isVisible().catch(() => false)) {
        await move.click();
      }
      await page.waitForTimeout(250);
    }
    await expect(page.locator('#combat-result')).toBeVisible();
    const logCount = await page.locator('#combat-log p').count();
    expect(logCount).toBeGreaterThan(3);
    await page.click('#btn-combat-back');
    await expect(page.locator('#screen-town')).toBeVisible();
  });

  test('撤退：點撤退鈕出現撤退結果', async ({ page }) => {
    await page.click('#btn-training');
    await expect(page.locator('#screen-combat')).toBeVisible();
    await page.locator('#btn-retreat').click();
    await expect(page.locator('#combat-result')).toBeVisible();
    await expect(page.locator('#combat-result')).toContainText('撤');
  });

  test('快速撤退後立即重開：舊戰鬥的敵方 timer 不得污染新戰鬥', async ({ page }) => {
    // 本案例改用獨立的 seed=5（覆寫本 describe beforeEach 的 seed=42），
    // 因為 seed=42 訓練場首回合永遠輪到玩家、敵方 timer 從未排入——
    // 對「舊戰鬥敵方 timer 污染新戰鬥」的修復沒有鑑別力（還原修復仍會過，是假保護）。
    // seed=5 下訓練場開戰瞬間就輪到敵方 goblin-scout-1 先攻，敵方 timer 立即排入。
    await page.goto('/games/caravan?seed=5');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await expect(page.locator('#screen-town')).toBeVisible();
    await page.click('#btn-training');
    await expect(page.locator('#screen-combat')).toBeVisible();
    // 立即撤退（遠低於 600ms），趕在舊戰鬥敵方 timer 觸發前——
    // 此時舊 timer 仍懸在事件佇列中，撤退/返回城鎮都不會清除它。
    await page.locator('#btn-retreat').click();
    await expect(page.locator('#combat-result')).toBeVisible();
    await page.click('#btn-combat-back');
    await page.click('#btn-training');
    await expect(page.locator('#screen-combat')).toBeVisible();
    const logsBefore = await page.locator('#combat-log p').count();
    // 讓新戰鬥自身合法的敵方 timer（600ms）與（若有污染）舊戰鬥殭屍 timer 都有機會觸發。
    await page.waitForTimeout(1500);
    const logsAfter = await page.locator('#combat-log p').count();
    const enemyActionLines = await page.locator('#combat-log p', { hasText: '哥布林斥候' }).count();
    // seed=5 下新戰鬥的自然流程：goblin-scout-2 先攻，600ms 後自動行動一次即輪到玩家，
    // 自動連鎖到此為止（等玩家操作）——合法情況至多 1 次敵方行動、+1 行 log。
    // 殭屍 timer 若污染會額外強制 goblin-scout-1 行動，疊加成 2 次、+2 行。
    expect(enemyActionLines).toBeLessThanOrEqual(1);
    expect(logsAfter - logsBefore).toBeLessThanOrEqual(1);
    await expect(page.locator('#screen-combat')).toBeVisible();
  });
});
