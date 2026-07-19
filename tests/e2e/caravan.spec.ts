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

test.describe('商隊與劍：經營系統', () => {
  async function newGameWithSeed(page: import('@playwright/test').Page, seed: number): Promise<void> {
    await page.goto(`/games/caravan?seed=${seed}`);
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await expect(page.locator('#screen-town')).toBeVisible();
  }

  /** 直接讀 localStorage 存檔（JSON），比對 UI 沒顯示的中間值（如出發瞬間的金幣）。 */
  async function readSave(page: import('@playwright/test').Page): Promise<Record<string, any>> {
    return page.evaluate(() => {
      const raw = localStorage.getItem('caravan-save-v1');
      return raw ? JSON.parse(raw) : null;
    });
  }

  /** 持續買同一物品直到金幣低於門檻（用於製造「薪餉付不出」情境），buy-btn disabled 就停手。 */
  async function buyUntilGoldBelow(
    page: import('@playwright/test').Page,
    itemId: string,
    threshold: number
  ): Promise<void> {
    const buyBtn = page.locator(`.market-row[data-item-id="${itemId}"] .buy-btn`);
    for (let i = 0; i < 40; i++) {
      const save = await readSave(page);
      if (!save || save.gold < threshold) return;
      if (!(await buyBtn.isEnabled().catch(() => false))) return;
      await buyBtn.click();
    }
  }

  /**
   * 遠征狀態機的單步推進：戰鬥用第一招打到分出勝負、事件點第一個可用選項、
   * 房卡點第一張——寬鬆推進策略，只用於不需要精確斷言金額/xp 的案例
   * （需要精確值的案例改走種子掃描法，見「押貨貿易」案例）。
   */
  async function stepExpedition(page: import('@playwright/test').Page): Promise<boolean> {
    if (await page.locator('#screen-combat').isVisible().catch(() => false)) {
      const result = page.locator('#combat-result');
      if (await result.isVisible().catch(() => false)) {
        await page.click('#btn-combat-back');
      } else {
        const move = page.locator('#combat-actions .move-btn').first();
        if (await move.isVisible().catch(() => false)) {
          await move.click();
        }
        await page.waitForTimeout(250);
      }
      return true;
    }
    const eventOpt = page.locator('.event-opt:not([disabled])').first();
    if (await eventOpt.isVisible().catch(() => false)) {
      await eventOpt.click();
      return true;
    }
    const roomBtn = page.locator('.room-btn').first();
    if (await roomBtn.isVisible().catch(() => false)) {
      await roomBtn.click();
      return true;
    }
    const cont = page.locator('#btn-exp-continue');
    if (await cont.isVisible().catch(() => false)) {
      await cont.click();
      return true;
    }
    return false;
  }

  /** 推進到結算畫面；途中若出現異鎮交易畫面，`sellAll` 決定要不要賣光再繼續。 */
  async function advanceToSettlement(
    page: import('@playwright/test').Page,
    opts: { sellAll?: boolean } = {}
  ): Promise<void> {
    for (let i = 0; i < 200; i++) {
      if (await page.locator('#screen-settlement').isVisible().catch(() => false)) return;
      if (await page.locator('#screen-trade').isVisible().catch(() => false)) {
        if (opts.sellAll) {
          let sellBtn = page.locator('.trade-sell-btn:not([disabled])').first();
          while (await sellBtn.isVisible().catch(() => false)) {
            await sellBtn.click();
            sellBtn = page.locator('.trade-sell-btn:not([disabled])').first();
          }
        }
        await page.click('#btn-trade-done');
        continue;
      }
      const progressed = await stepExpedition(page);
      if (!progressed) await page.waitForTimeout(150);
    }
    throw new Error('advanceToSettlement: 超過 200 步仍未抵達結算畫面');
  }

  test('市集買賣：買 2 繃帶扣款、賣 1 回收半價，金幣與庫存精確同步', async ({ page }) => {
    await newGameWithSeed(page, 101);
    // buyPrice(starting-town, bandage)=round(8×1)=8；sellPrice=round(8×0.5)=4（economy.ts 公式）。
    const bandageRow = page.locator('.market-row[data-item-id="bandage"]');
    await bandageRow.locator('.buy-btn').click();
    await bandageRow.locator('.buy-btn').click();
    await expect(page.locator('#market-gold')).toHaveText('184');
    await expect(page.locator('#town-gold')).toHaveText('184');
    await expect(bandageRow.locator('.market-name')).toContainText('持有 2');

    await bandageRow.locator('.sell-btn').click();
    await expect(page.locator('#market-gold')).toHaveText('188');
    await expect(page.locator('#town-gold')).toHaveText('188');
    await expect(bandageRow.locator('.market-name')).toContainText('持有 1');
  });

  test('招募與薪餉：雇用第一名旅人扣 hireCost，出發扣 totalWage', async ({ page }) => {
    await newGameWithSeed(page, 102);
    await page.click('.town-tab[data-town-tab="tavern"]');
    const firstRecruit = page.locator('.recruit-card').first();
    await expect(firstRecruit).toBeVisible();
    await firstRecruit.locator('.hire-btn').click();
    // 新檔聲望為 0，酒館池首位必為 Lv1（generateRecruitPool 精英門檻聲望≥30 才生效）：
    // hireCost=30+1×20=50、wagePerTrip=8+1×4=12，兩者皆可精確斷言。
    await expect(page.locator('#town-gold')).toHaveText('150');

    await page.click('.town-tab[data-town-tab="roster"]');
    await expect(page.locator('.roster-card')).toHaveCount(2);

    await page.click('#btn-quest-board');
    const goldBeforeDepart = (await readSave(page)).gold;
    expect(goldBeforeDepart).toBe(150);
    await page.click('.quest-item[data-location-id="riverside-road"]');
    await expect(page.locator('#screen-expedition')).toBeVisible();
    const goldAfterDepart = (await readSave(page)).gold;
    expect(goldBeforeDepart - goldAfterDepart).toBe(12);

    await advanceToSettlement(page);
    await page.click('#btn-settle-back');
    await expect(page.locator('#screen-town')).toBeVisible();

    const finalSave = await readSave(page);
    expect(finalSave.gold).toBeGreaterThanOrEqual(0);
    await page.click('.town-tab[data-town-tab="roster"]');
    await expect(page.locator('.roster-card')).toHaveCount(2);
  });

  test('薪餉守門：雇用後把金幣花到不足支付薪餉，出發被擋在委託板', async ({ page }) => {
    await newGameWithSeed(page, 103);
    await page.click('.town-tab[data-town-tab="tavern"]');
    await page.locator('.recruit-card').first().locator('.hire-btn').click();
    await expect(page.locator('#town-gold')).toHaveText('150');

    await page.click('.town-tab[data-town-tab="market"]');
    await buyUntilGoldBelow(page, 'bandage', 12); // wagePerTrip(Lv1)=12

    const saveBeforeClick = await readSave(page);
    expect(saveBeforeClick.gold).toBeLessThan(12);

    await page.click('#btn-quest-board');
    await page.click('.quest-item[data-location-id="riverside-road"]');
    await expect(page.locator('#quest-wage-warning')).toBeVisible();
    await expect(page.locator('#quest-wage-warning')).toContainText('12');
    await expect(page.locator('#screen-quest')).toBeVisible();
    await expect(page.locator('#screen-expedition')).toBeHidden();
  });

  test('押貨貿易（seed=30）：買 6 礦石押運臨水道，河灣鎮賣光，貿易收入精確且淨利為正', async ({ page }) => {
    // 種子與流程完全沿用既有「完整路線遠征（seed=30）」案例的已驗證結果（見上方
    // 遠征系統 describe）：市集買賣與押貨出發都不消耗 rng，事件/戰鬥序列逐位元組
    // 相同（一次性 scratch 腳本已用真引擎重跑確認，見 commit 說明，未進 git）。
    await newGameWithSeed(page, 30);
    const goldAtStart = (await readSave(page)).gold;
    expect(goldAtStart).toBe(200);

    const oreRow = page.locator('.market-row[data-item-id="ore"]');
    for (let i = 0; i < 6; i++) {
      await oreRow.locator('.buy-btn').click();
    }
    const goldBeforeDepart = (await readSave(page)).gold;
    // buyPrice(starting-town, ore)=round(12×1)=12；買 6 個＝72。
    expect(goldBeforeDepart).toBe(goldAtStart - 72);

    await page.click('#btn-quest-board');
    await page.click('.quest-outfit-btn[data-location-id="riverside-road"]');
    await expect(page.locator('#quest-outfit')).toBeVisible();
    const cargoPlus = page.locator('.cargo-plus[data-item-id="ore"]');
    for (let i = 0; i < 6; i++) {
      await cargoPlus.click();
    }
    await expect(page.locator('#cargo-space')).toHaveText('載貨：6/6');
    await page.click('#btn-depart');
    await expect(page.locator('#screen-expedition')).toBeVisible();

    await advanceToSettlement(page, { sellAll: true });
    await expect(page.locator('#screen-settlement')).toBeVisible();
    // seed=30 臨水道已知確定結果：loot.gold=9、無戰利品物品、勝利未撤退——
    // 押貨 6 礦石全額到帳。tradeSellPrice(riverbend-town, ore)=round(12×1.5×0.9)=16，6 個＝96。
    await expect(page.locator('#settle-gold')).toHaveText('9');
    await expect(page.locator('#settle-trade-gold')).toHaveText('96');

    await page.click('#btn-settle-back');
    await expect(page.locator('#screen-town')).toBeVisible();
    const finalGold = (await readSave(page)).gold;
    expect(finalGold).toBe(goldBeforeDepart + 9 + 96);
    expect(finalGold).toBeGreaterThan(goldAtStart);
  });

  test('升級：xp 達 Lv2 門檻後配 2 點力量，卡片顯示 Lv2 與屬性變化', async ({ page }) => {
    await newGameWithSeed(page, 105);
    await page.evaluate(() => {
      const raw = localStorage.getItem('caravan-save-v1');
      const data = JSON.parse(raw!);
      data.protagonist.xp = 60; // XP_TABLE[2]=50，60 足以領取一次升級
      localStorage.setItem('caravan-save-v1', JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-continue');
    await expect(page.locator('#screen-town')).toBeVisible();

    await page.click('.town-tab[data-town-tab="roster"]');
    const protagonistCard = page.locator('.roster-card[data-member-id="protagonist"]');
    await expect(protagonistCard.locator('.levelup-btn')).toBeVisible();
    await protagonistCard.locator('.levelup-btn').click();

    await expect(page.locator('#levelup-panel')).toBeVisible();
    await page.click('.alloc-plus[data-stat="str"]');
    await page.click('.alloc-plus[data-stat="str"]');
    await expect(page.locator('#alloc-total')).toHaveText('已配點數：2 / 2');
    await page.click('#alloc-confirm');
    await expect(page.locator('#levelup-panel')).toBeHidden();

    await expect(protagonistCard.locator('.roster-name')).toContainText('Lv2');
    await expect(protagonistCard.locator('.roster-stats')).toContainText('力量 14');
  });

  test('快照防護：expeditionVersion 不符時遠征記錄丟棄、主檔金幣完好', async ({ page }) => {
    await newGameWithSeed(page, 106);
    await page.evaluate(() => {
      const raw = localStorage.getItem('caravan-save-v1');
      const data = JSON.parse(raw!);
      data.expedition = { expeditionVersion: 1, phase: 'event', locationId: 'riverside-road' };
      localStorage.setItem('caravan-save-v1', JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#btn-continue')).toBeVisible();
    await page.click('#btn-continue');

    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#expedition-expired-note')).toBeVisible();
    await expect(page.locator('#btn-resume-expedition')).toBeHidden();
    await expect(page.locator('#town-gold')).toHaveText('200');
  });
});
