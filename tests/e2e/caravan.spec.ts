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

test.describe('商隊與劍：遠征系統', () => {
  // 種子挑選原則（見 scratch-seed-scan.ts 的一次性模擬，已刪除）：
  // 用「每一步都點第一個可用選項／房卡，戰鬥用第一招打到分出勝負」的固定策略
  // 對種子做模擬，找出「首事件確定、首選項可用、結果確定」且能驗證完整流程的種子。
  // seed=30（臨水道）：leg1=ev_wolf_howl 首選項可用且擲骰成功；leg2=ev_wounded_traveler
  // 首選項因缺藥草被 disable；leg4 擲骰失敗觸發 enc_wolf_pair 戰鬥，玩家一路用預設目標
  // （不手動選標）打到 6 回合後獲勝；結算 goldGained=9、xpGained=45、無戰利品物品。
  // seed=2（廢棄礦坑）：第 1 層房卡固定為 fight/treasure/rest，選 treasure 得 70 金；
  // 第 2 層房卡 fight/rest，選 fight 進入 enc_mine_spiders 後立即撤退；
  // 結算 goldGained=35（70 折半無條件捨去）、xpGained=30。
  async function newGameWithSeed(page: import('@playwright/test').Page, seed: number): Promise<void> {
    await page.goto(`/games/caravan?seed=${seed}`);
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await expect(page.locator('#screen-town')).toBeVisible();
  }

  test('委託板：顯示 2 條路線＋1 迷宮，隱藏地點提示存在，巢穴不在列', async ({ page }) => {
    await newGameWithSeed(page, 1);
    await page.click('#btn-quest-board');
    await expect(page.locator('#screen-quest')).toBeVisible();
    await expect(page.locator('.quest-item[data-location-id]')).toHaveCount(3);
    await expect(page.locator('.quest-item[data-location-id="riverside-road"]')).toBeVisible();
    await expect(page.locator('.quest-item[data-location-id="blackwood-trail"]')).toBeVisible();
    await expect(page.locator('.quest-item[data-location-id="abandoned-mine"]')).toBeVisible();
    await expect(page.locator('.quest-item[data-location-id="goblin-den"]')).toHaveCount(0);
    await expect(page.locator('.quest-hidden-hint')).toBeVisible();
    await expect(page.locator('.quest-hidden-hint')).toContainText('？');
  });

  test('完整路線遠征（seed=30）：事件卡→擲骰→戰鬥→結算，金幣寫回城鎮', async ({ page }) => {
    await newGameWithSeed(page, 30);
    await page.click('#btn-quest-board');
    await page.click('.quest-item[data-location-id="riverside-road"]');
    await expect(page.locator('#screen-expedition')).toBeVisible();
    await expect(page.locator('#exp-progress')).toHaveText('第 1/4 段');

    // leg1：ev_wolf_howl，首選項可用，第 2 個選項因缺火把被 disable
    await expect(page.locator('#event-title')).toHaveText('遠方的狼嚎');
    await expect(page.locator('.event-opt[data-opt-index="0"]')).toBeEnabled();
    await expect(page.locator('.event-opt[data-opt-index="1"]')).toBeDisabled();
    await page.click('.event-opt[data-opt-index="0"]');
    await expect(page.locator('#check-result')).toBeVisible();
    await expect(page.locator('#check-result')).toContainText('成功');
    await page.click('#btn-exp-continue');

    // leg2：ev_wounded_traveler，首選項因缺藥草被 disable，改點第 2 個
    await expect(page.locator('#exp-progress')).toHaveText('第 2/4 段');
    await expect(page.locator('#event-title')).toHaveText('路遇傷者');
    await expect(page.locator('.event-opt[data-opt-index="0"]')).toBeDisabled();
    await page.click('.event-opt[data-opt-index="1"]');
    await expect(page.locator('#check-result')).toContainText('失敗');
    await page.click('#btn-exp-continue');

    // leg3：ev_broken_wheel，首選項可用，檢定失敗但無戰鬥
    await expect(page.locator('#exp-progress')).toHaveText('第 3/4 段');
    await expect(page.locator('#event-title')).toHaveText('車輪斷裂');
    await page.click('.event-opt[data-opt-index="0"]');
    await expect(page.locator('#check-result')).toContainText('失敗');
    await page.click('#btn-exp-continue');

    // leg4：ev_wolf_howl 再次出現，檢定失敗觸發戰鬥
    await expect(page.locator('#exp-progress')).toHaveText('第 4/4 段');
    await expect(page.locator('#event-title')).toHaveText('遠方的狼嚎');
    await page.click('.event-opt[data-opt-index="0"]');
    await expect(page.locator('#check-result')).toContainText('失敗');
    await page.click('#btn-exp-continue');

    // 進入戰鬥：enc_wolf_pair，兩隻敵人存活時應顯示多目標選擇
    await expect(page.locator('#screen-combat')).toBeVisible();
    await expect(page.locator('#combat-enemies .combat-unit')).toHaveCount(2);
    await expect(page.locator('#combat-targets .target-btn[data-target-id]')).toHaveCount(2);

    // 用預設目標（不手動選標）打到分出勝負，維持種子預先模擬的決定性結果
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
    await expect(page.locator('#combat-result')).toContainText('勝利');
    await page.click('#btn-combat-back');

    // 結算畫面：seed=30 模擬得出 goldGained=9、xpGained=45、無戰利品物品
    await expect(page.locator('#screen-settlement')).toBeVisible();
    await expect(page.locator('#settle-gold')).toHaveText('9');
    await expect(page.locator('#settle-xp')).toHaveText('45');
    await expect(page.locator('#settle-items li')).toHaveText('（無）');
    await expect(page.locator('#settle-log')).toContainText('順利完成');

    await page.click('#btn-settle-back');
    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#town-gold')).toHaveText('209');
  });

  test('遠征中重整頁面 → 城鎮出現「繼續遠征」→ 回到同一張事件卡', async ({ page }) => {
    await newGameWithSeed(page, 30);
    await page.click('#btn-quest-board');
    await page.click('.quest-item[data-location-id="riverside-road"]');
    await expect(page.locator('#screen-expedition')).toBeVisible();
    const titleBefore = await page.locator('#event-title').textContent();
    const progressBefore = await page.locator('#exp-progress').textContent();

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#btn-continue')).toBeVisible();
    await page.click('#btn-continue');
    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#btn-resume-expedition')).toBeVisible();

    await page.click('#btn-resume-expedition');
    await expect(page.locator('#screen-expedition')).toBeVisible();
    await expect(page.locator('#event-title')).toHaveText(titleBefore ?? '');
    await expect(page.locator('#exp-progress')).toHaveText(progressBefore ?? '');
  });

  test('迷宮（seed=2）：房卡選擇、選 treasure 房入 loot、戰鬥中撤退、結算', async ({ page }) => {
    await newGameWithSeed(page, 2);
    await page.click('#btn-quest-board');
    await page.click('.quest-item[data-location-id="abandoned-mine"]');
    await expect(page.locator('#screen-expedition')).toBeVisible();
    await expect(page.locator('#exp-progress')).toHaveText('第 1/4 層');

    // 第 1 層房卡固定為 fight/treasure/rest（seed=2 模擬確認）
    await expect(page.locator('#room-choices .room-btn[data-room]')).toHaveCount(3);
    await expect(page.locator('.room-btn[data-room="treasure"]')).toBeVisible();

    await page.click('.room-btn[data-room="treasure"]');
    await expect(page.locator('#check-result')).toBeVisible();
    await expect(page.locator('#check-result')).toContainText('70');
    await page.click('#btn-exp-continue');

    // 第 2 層房卡為 fight/rest，選 fight 進入戰鬥
    await expect(page.locator('#exp-progress')).toHaveText('第 2/4 層');
    await expect(page.locator('#room-choices .room-btn[data-room]')).toHaveCount(2);
    await page.click('.room-btn[data-room="fight"]');
    await expect(page.locator('#check-result')).toContainText('戰鬥');
    await page.click('#btn-exp-continue');

    // 戰鬥：enc_mine_spiders，兩隻敵人存活，驗證多目標選擇可操作
    await expect(page.locator('#screen-combat')).toBeVisible();
    await expect(page.locator('#combat-targets .target-btn[data-target-id]')).toHaveCount(2);
    await page.locator('#combat-targets .target-btn').nth(1).click();
    await expect(page.locator('#combat-targets .target-btn').nth(1)).toHaveClass(/target-selected/);

    await page.click('#btn-retreat');
    await expect(page.locator('#combat-result')).toBeVisible();
    await expect(page.locator('#combat-result')).toContainText('撤');
    await page.click('#btn-combat-back');

    // 結算：撤退折半（70/2=35），xp 依 step=2 計算為 30
    await expect(page.locator('#screen-settlement')).toBeVisible();
    await expect(page.locator('#settle-gold')).toHaveText('35');
    await expect(page.locator('#settle-xp')).toHaveText('30');
    await expect(page.locator('#settle-log')).toContainText('鎩羽而歸');

    await page.click('#btn-settle-back');
    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#town-gold')).toHaveText('235');
  });
});
