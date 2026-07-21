import { test, expect } from '@playwright/test';

test.describe('商隊與劍：外殼流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/caravan/play');
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
    await page.click('#btn-create-confirm'); // 創角：預設劍士＋0 配點＝舊版主角
    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#screen-title')).toBeHidden();
    await expect(page.locator('#town-gold')).toHaveText('200');
  });

  test('開新檔後重新整理 → 「繼續旅程」可見且回到城鎮', async ({ page }) => {
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm'); // 創角：預設劍士＋0 配點＝舊版主角
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#btn-continue')).toBeVisible();
    await page.click('#btn-continue');
    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#town-gold')).toHaveText('200');
  });

  test('遊戲廳旗艦卡連到獨立入口 landing，開始旅程進入遊戲', async ({ page }) => {
    await page.goto('/games');
    const flagship = page.locator('a.card-flagship[href="/caravan"]');
    await expect(flagship).toBeVisible();
    await flagship.click();
    await expect(page).toHaveURL(/\/caravan\/?$/);
    await page.locator('a.cv-btn-primary[href="/caravan/play"]').first().click();
    await expect(page.locator('#screen-title')).toBeVisible();
  });
});

test.describe('商隊與劍：獨立入口 landing', () => {
  test('內容量數字帶與 CTA 齊備；有存檔時顯示繼續旅程', async ({ page }) => {
    await page.goto('/caravan');
    // 數字帶六項且數字 > 0（build 時從 data 實算）
    const stats = page.locator('.cv-stat b');
    await expect(stats).toHaveCount(6);
    for (const text of await stats.allTextContents()) {
      expect(Number(text)).toBeGreaterThan(0);
    }
    // 無存檔：僅開始旅程
    await expect(page.locator('#cv-continue')).toBeHidden();
    // 造一份存檔 → 繼續旅程出現
    await page.evaluate(() => localStorage.setItem('caravan-save-v1', '{"v":5}'));
    await page.reload();
    await expect(page.locator('#cv-continue')).toBeVisible();
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
  });

  test('舊網址 /games/caravan 轉址到 /caravan', async ({ page }) => {
    await page.goto('/games/caravan');
    await expect(page).toHaveURL(/\/caravan\/?$/);
    await expect(page.locator('.cv-title')).toBeVisible();
  });
});

test.describe('商隊與劍：訓練場戰鬥', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/caravan/play?seed=42');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm'); // 創角：預設劍士＋0 配點＝舊版主角
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
    await page.goto('/caravan/play?seed=5');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm'); // 創角：預設劍士＋0 配點＝舊版主角
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
  // seed=91（臨水道，M5 內容擴充後重新掃描——42 張事件卡擴大了加權池，
  // 原 seed=30 的路線通用事件序列已隨之改變，故重新挑選）：
  // leg1=ev_traveling_bard（遊唱詩人的請求）首選項擲骰失敗；
  // leg2=ev_rare_wandering_swordsaint（流浪劍聖切磋，稀有事件）首選項擲骰失敗；
  // leg3=ev_river_crossing（湍急的溪流）首選項擲骰成功；
  // leg4=ev_wolf_howl（遠方的狼嚎）首選項擲骰失敗觸發 enc_wolf_pair 戰鬥，
  // 玩家一路用預設目標（不手動選標）打到分出勝負後獲勝；
  // 結算 goldGained=25、xpGained=45、無戰利品物品。
  // seed=2（廢棄礦坑）：第 1 層房卡固定為 fight/treasure/rest，選 treasure 得 70 金；
  // 第 2 層房卡 fight/rest，選 fight 進入 enc_mine_spiders 後立即撤退；
  // 結算 goldGained=35（70 折半無條件捨去）、xpGained=30。
  async function newGameWithSeed(page: import('@playwright/test').Page, seed: number): Promise<void> {
    await page.goto(`/caravan/play?seed=${seed}`);
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm'); // 創角：預設劍士＋0 配點＝舊版主角
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

  test('完整路線遠征（seed=91）：事件卡→擲骰→戰鬥→結算，金幣寫回城鎮', async ({ page }) => {
    await newGameWithSeed(page, 91);
    await page.click('#btn-quest-board');
    await page.click('.quest-item[data-location-id="riverside-road"]');
    await expect(page.locator('#screen-expedition')).toBeVisible();
    await expect(page.locator('#exp-progress')).toHaveText('第 1/4 段');

    // leg1：ev_traveling_bard（遊唱詩人的請求），首選項可用，擲骰失敗
    await expect(page.locator('#event-title')).toHaveText('遊唱詩人的請求');
    await expect(page.locator('.event-opt[data-opt-index="0"]')).toBeEnabled();
    await page.click('.event-opt[data-opt-index="0"]');
    await expect(page.locator('#check-result')).toBeVisible();
    await expect(page.locator('#check-result')).toContainText('失敗');
    await page.click('#btn-exp-continue');

    // leg2：ev_rare_wandering_swordsaint（流浪劍聖切磋，稀有事件），首選項擲骰失敗
    await expect(page.locator('#exp-progress')).toHaveText('第 2/4 段');
    await expect(page.locator('#event-title')).toHaveText('流浪劍聖切磋');
    await page.click('.event-opt[data-opt-index="0"]');
    await expect(page.locator('#check-result')).toContainText('失敗');
    await page.click('#btn-exp-continue');

    // leg3：ev_river_crossing（湍急的溪流），首選項擲骰成功
    await expect(page.locator('#exp-progress')).toHaveText('第 3/4 段');
    await expect(page.locator('#event-title')).toHaveText('湍急的溪流');
    await page.click('.event-opt[data-opt-index="0"]');
    await expect(page.locator('#check-result')).toContainText('成功');
    await page.click('#btn-exp-continue');

    // leg4：ev_wolf_howl（遠方的狼嚎），檢定失敗觸發戰鬥
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

    // 結算畫面：seed=91 模擬得出 goldGained=25、xpGained=45、無戰利品物品
    await expect(page.locator('#screen-settlement')).toBeVisible();
    await expect(page.locator('#settle-gold')).toHaveText('25');
    await expect(page.locator('#settle-xp')).toHaveText('45');
    await expect(page.locator('#settle-items li')).toHaveText('（無）');
    await expect(page.locator('#settle-log')).toContainText('順利完成');

    await page.click('#btn-settle-back');
    await expect(page.locator('#screen-town')).toBeVisible();
    await expect(page.locator('#town-gold')).toHaveText('225');
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
    await page.goto(`/caravan/play?seed=${seed}`);
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm'); // 創角：預設劍士＋0 配點＝舊版主角
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

  test('市集買賣：扣款與 UI 標價一致、賣出回收標示價，金幣與庫存精確同步', async ({ page }) => {
    await newGameWithSeed(page, 101);
    // M7 行情波動後價格隨 marketSeed 浮動——改從 UI 標價動態驗證（意圖不變：標價=實扣=庫存同步）。
    const bandageRow = page.locator('.market-row[data-item-id="bandage"]');
    const buyPriceNow = Number((await bandageRow.locator('.buy-btn').textContent())!.match(/\d+/)![0]);
    expect(buyPriceNow).toBeGreaterThan(0);
    await bandageRow.locator('.buy-btn').click();
    await bandageRow.locator('.buy-btn').click();
    const afterBuy = 200 - buyPriceNow * 2;
    await expect(page.locator('#market-gold')).toHaveText(String(afterBuy));
    await expect(page.locator('#town-gold')).toHaveText(String(afterBuy));
    await expect(bandageRow.locator('.market-name')).toContainText('持有 2');

    const sellPriceNow = Number((await bandageRow.locator('.sell-btn').textContent())!.match(/\d+/)![0]);
    await bandageRow.locator('.sell-btn').click();
    await expect(page.locator('#market-gold')).toHaveText(String(afterBuy + sellPriceNow));
    await expect(page.locator('#town-gold')).toHaveText(String(afterBuy + sellPriceNow));
    await expect(bandageRow.locator('.market-name')).toContainText('持有 1');
  });

  test('招募與薪餉：雇用扣 UI 標示的 hireCost，出發扣（旅況修正後的）薪餉', async ({ page }) => {
    await newGameWithSeed(page, 102);
    await page.click('.town-tab[data-town-tab="tavern"]');
    const firstRecruit = page.locator('.recruit-card').first();
    await expect(firstRecruit).toBeVisible();
    // M7 特質影響雇用費/薪餉——從招募卡讀實際數字驗證扣款一致（意圖不變）
    const infoText = (await firstRecruit.locator('.recruit-info').textContent())!;
    const [hire, wage] = infoText.match(/\d+/g)!.map(Number);
    await firstRecruit.locator('.hire-btn').click();
    await expect(page.locator('#town-gold')).toHaveText(String(200 - hire));

    await page.click('.town-tab[data-town-tab="roster"]');
    await expect(page.locator('.roster-card')).toHaveCount(2);

    await page.click('#btn-quest-board');
    const goldBeforeDepart = (await readSave(page)).gold;
    expect(goldBeforeDepart).toBe(200 - hire);
    await page.click('.quest-item[data-location-id="riverside-road"]');
    await expect(page.locator('#screen-expedition')).toBeVisible();
    const goldAfterDepart = (await readSave(page)).gold;
    // M8 旅況可能讓薪餉打折（festival ×0.5）——期望值照引擎同式計算
    const conditionWageFactor = await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('caravan-save-v1')!);
      return save.expedition?.conditionId === 'festival' ? 0.5 : 1;
    });
    expect(goldBeforeDepart - goldAfterDepart).toBe(Math.round(wage * conditionWageFactor));

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
    const firstRecruit = page.locator('.recruit-card').first();
    // M7 特質影響雇用費/薪餉——讀卡上實際數字（守門用未打折的全額薪餉判定）
    const infoText = (await firstRecruit.locator('.recruit-info').textContent())!;
    const [hire, wage] = infoText.match(/\d+/g)!.map(Number);
    await firstRecruit.locator('.hire-btn').click();
    await expect(page.locator('#town-gold')).toHaveText(String(200 - hire));

    await page.click('.town-tab[data-town-tab="market"]');
    await buyUntilGoldBelow(page, 'bandage', wage);

    const saveBeforeClick = await readSave(page);
    expect(saveBeforeClick.gold).toBeLessThan(wage);

    await page.click('#btn-quest-board');
    await page.click('.quest-item[data-location-id="riverside-road"]');
    await expect(page.locator('#quest-wage-warning')).toBeVisible();
    await expect(page.locator('#quest-wage-warning')).toContainText(String(wage));
    await expect(page.locator('#screen-quest')).toBeVisible();
    await expect(page.locator('#screen-expedition')).toBeHidden();
  });

  test('押貨貿易（seed=91）：買 6 礦石押運臨水道，河灣鎮賣光，貿易收入精確且淨利為正', async ({ page }) => {
    // 種子與流程完全沿用既有「完整路線遠征（seed=91）」案例的已驗證結果（見上方
    // 遠征系統 describe，M5 內容擴充後重新掃描的種子）：市集買賣與押貨出發都不消耗
    // rng，事件/戰鬥序列逐位元組相同（一次性 scratch 腳本已用真引擎重跑確認，未進 git）。
    await newGameWithSeed(page, 91);
    const goldAtStart = (await readSave(page)).gold;
    expect(goldAtStart).toBe(200);

    const oreRow = page.locator('.market-row[data-item-id="ore"]');
    // M7 行情：礦石買價隨 marketSeed 浮動，從 UI 標價動態計算
    const orePrice = Number((await oreRow.locator('.buy-btn').textContent())!.match(/\d+/)![0]);
    for (let i = 0; i < 6; i++) {
      await oreRow.locator('.buy-btn').click();
    }
    const goldBeforeDepart = (await readSave(page)).gold;
    expect(goldBeforeDepart).toBe(goldAtStart - orePrice * 6);

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

    // M10 異鎮採購區：河灣鎮 stock 含裝備（鹽鍛鎖甲）→ 採購區應顯示 icon 與買入鈕
    for (let i = 0; i < 200; i++) {
      if (await page.locator('#screen-trade').isVisible().catch(() => false)) break;
      const progressed = await stepExpedition(page);
      if (!progressed) await page.waitForTimeout(150);
    }
    await expect(page.locator('#trade-buy-section')).toBeVisible();
    const buyRow = page.locator('#trade-buy-list .market-row[data-item-id="saltforged-mail"]');
    await expect(buyRow.locator('.gear-icon')).toBeVisible();
    const gearPrice = Number((await buyRow.locator('.buy-btn').textContent())!.match(/\d+/)![0]);
    const goldBeforeGear = (await readSave(page)).gold;
    await buyRow.locator('.buy-btn').click();
    const saveAfterGear = await readSave(page);
    expect(goldBeforeGear - saveAfterGear.gold).toBe(gearPrice);
    expect(saveAfterGear.inventory['saltforged-mail']).toBe(1);

    await advanceToSettlement(page, { sellAll: true });
    await expect(page.locator('#screen-settlement')).toBeVisible();
    // seed=91 臨水道已知確定結果：loot.gold=25、無戰利品物品、勝利未撤退。
    // M7 行情：異鎮賣價浮動——貿易收入從結算畫面讀出後驗算帳一致與淨利為正。
    await expect(page.locator('#settle-gold')).toHaveText('25');
    const tradeGold = Number(await page.locator('#settle-trade-gold').textContent());
    expect(tradeGold).toBeGreaterThan(0);

    await page.click('#btn-settle-back');
    await expect(page.locator('#screen-town')).toBeVisible();
    const finalGold = (await readSave(page)).gold;
    expect(finalGold).toBe(goldBeforeDepart + 25 + tradeGold - gearPrice); // 含 M10 採購支出
    expect(finalGold + gearPrice, '押貨淨利（不計裝備投資）應為正').toBeGreaterThan(goldAtStart);
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

  test('M12 晉階：聲望 58 完成遠征 +5 跨過 60 → 結算出現「商會重鎮」晉階橫幅', async ({ page }) => {
    await newGameWithSeed(page, 55);
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('caravan-save-v1')!);
      data.reputation = 58;
      localStorage.setItem('caravan-save-v1', JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-continue');
    await page.click('#btn-quest-board');
    await page.click('.quest-item[data-location-id="riverside-road"]');
    await advanceToSettlement(page);

    await expect(page.locator('#rankup-banner')).toBeVisible();
    await expect(page.locator('#rankup-name')).toHaveText('商會重鎮');
    await expect(page.locator('#settle-goal')).toContainText('距「商會之主」');
  });
});

test.describe('商隊與劍：裝備系統', () => {
  async function newGameWithSeed(page: import('@playwright/test').Page, seed: number): Promise<void> {
    await page.goto(`/caravan/play?seed=${seed}`);
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm'); // 創角：預設劍士＋0 配點＝舊版主角
    await expect(page.locator('#screen-town')).toBeVisible();
  }

  /** 直接改 localStorage 存檔塞物品進 inventory，重整後用「繼續旅程」重新載入。 */
  async function giveItem(page: import('@playwright/test').Page, itemId: string, qty = 1): Promise<void> {
    await page.evaluate(
      ({ itemId, qty }) => {
        const raw = localStorage.getItem('caravan-save-v1');
        const data = JSON.parse(raw!);
        data.inventory[itemId] = (data.inventory[itemId] ?? 0) + qty;
        localStorage.setItem('caravan-save-v1', JSON.stringify(data));
      },
      { itemId, qty }
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-continue');
    await expect(page.locator('#screen-town')).toBeVisible();
  }

  test('遺寶裝備：塞入巢穴圖騰→roster 飾品欄穿上→生命上限精確變化→卸下→回到市集賣列', async ({ page }) => {
    // den-idol（巢穴圖騰）equip.defense=1／maxHp=3（items.ts M5 終審移交數值）；
    // 主角預設 maxHp=22（save.ts defaultProtagonist）——穿上後應精確為 25，卸下應精確回 22。
    await newGameWithSeed(page, 201);
    await giveItem(page, 'den-idol');

    await page.click('.town-tab[data-town-tab="roster"]');
    const protagonistCard = page.locator('.roster-card[data-member-id="protagonist"]');
    await expect(protagonistCard.locator('.roster-hp')).toHaveText('生命上限 22');

    const trinketSlot = protagonistCard.locator('.equip-slot[data-slot="trinket"]');
    await expect(trinketSlot.locator('.unequip-btn')).toHaveCount(0);
    await trinketSlot.locator('.equip-btn[data-item-id="den-idol"]').click();

    await expect(trinketSlot).toContainText('巢穴圖騰');
    await expect(trinketSlot.locator('.unequip-btn')).toBeVisible();
    await expect(protagonistCard.locator('.roster-hp')).toHaveText('生命上限 25');

    await trinketSlot.locator('.unequip-btn').click();
    await expect(trinketSlot.locator('.unequip-btn')).toHaveCount(0);
    await expect(protagonistCard.locator('.roster-hp')).toHaveText('生命上限 22');

    await page.click('.town-tab[data-town-tab="market"]');
    await expect(page.locator('.market-row[data-item-id="den-idol"] .sell-btn')).toBeVisible();
  });

  test('空欄不渲染卸下鈕：新檔主角三個裝備欄位皆無 .unequip-btn', async ({ page }) => {
    await newGameWithSeed(page, 202);
    await page.click('.town-tab[data-town-tab="roster"]');
    const protagonistCard = page.locator('.roster-card[data-member-id="protagonist"]');
    await expect(protagonistCard.locator('.equip-slot[data-slot="weapon"] .unequip-btn')).toHaveCount(0);
    await expect(protagonistCard.locator('.equip-slot[data-slot="armor"] .unequip-btn')).toHaveCount(0);
    await expect(protagonistCard.locator('.equip-slot[data-slot="trinket"] .unequip-btn')).toHaveCount(0);
  });

  test('穿裝備後進訓練場：戰鬥面板 unit-hp 分母反映 maxHp 提升', async ({ page }) => {
    await newGameWithSeed(page, 203);
    await giveItem(page, 'den-idol');

    await page.click('.town-tab[data-town-tab="roster"]');
    const protagonistCard = page.locator('.roster-card[data-member-id="protagonist"]');
    await protagonistCard.locator('.equip-slot[data-slot="trinket"] .equip-btn[data-item-id="den-idol"]').click();
    await expect(protagonistCard.locator('.roster-hp')).toHaveText('生命上限 25');

    await page.click('#btn-training');
    await expect(page.locator('#screen-combat')).toBeVisible();
    await expect(page.locator('#combat-party .unit-hp')).toHaveText('HP 25/25');
  });

  test('武器裝備：塞入鹽晶劍並升至 Lv2→穿上→roster 招式列出現新招取代原武器招（M5 Task 3 交接）', async ({ page }) => {
    // salt-crystal-blade（鹽晶劍）minLevel=2、equip.move='結晶爆斬'（items.ts M5 內容擴充）；
    // 主角預設 swordsman，未裝備時 moves[0]='重斬'（heavy-slash，jobs.ts）。
    await newGameWithSeed(page, 204);
    await page.evaluate(() => {
      const raw = localStorage.getItem('caravan-save-v1');
      const data = JSON.parse(raw!);
      data.protagonist.level = 2;
      data.inventory['salt-crystal-blade'] = 1;
      localStorage.setItem('caravan-save-v1', JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-continue');
    await expect(page.locator('#screen-town')).toBeVisible();

    await page.click('.town-tab[data-town-tab="roster"]');
    const protagonistCard = page.locator('.roster-card[data-member-id="protagonist"]');
    await expect(protagonistCard.locator('.roster-moves')).toContainText('重斬');
    await expect(protagonistCard.locator('.roster-moves')).not.toContainText('結晶爆斬');

    const weaponSlot = protagonistCard.locator('.equip-slot[data-slot="weapon"]');
    await weaponSlot.locator('.equip-btn[data-item-id="salt-crystal-blade"]').click();

    await expect(weaponSlot).toContainText('鹽晶劍');
    await expect(protagonistCard.locator('.roster-moves')).toContainText('結晶爆斬');
    await expect(protagonistCard.locator('.roster-moves')).not.toContainText('重斬');
  });
});

test.describe('商隊與劍：冒險編年史（M6）', () => {
  test('訓練場勝利寫入敵人圖鑑，landing 顯示收集進度', async ({ page }) => {
    await page.goto('/caravan/play?seed=42');
    await page.evaluate(() => {
      localStorage.removeItem('caravan-save-v1');
      localStorage.removeItem('caravan-chronicle-v1');
    });
    await page.reload();
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm'); // 創角：預設劍士＋0 配點＝舊版主角
    await page.click('#btn-training');
    for (let i = 0; i < 40; i++) {
      if (await page.locator('#combat-result').isVisible()) break;
      const move = page.locator('#combat-actions .move-btn').first();
      if (await move.isVisible().catch(() => false)) await move.click();
      await page.waitForTimeout(250);
    }
    await expect(page.locator('#combat-result')).toContainText('勝利');
    const chron = await page.evaluate(() => JSON.parse(localStorage.getItem('caravan-chronicle-v1') ?? '{}'));
    expect(chron.defeatedEnemies).toContain('哥布林斥候');
    // landing 編年史區
    await page.goto('/caravan');
    await expect(page.locator('#cv-progress')).toBeVisible();
    await expect(page.locator('.cv-progress[data-kind="enemies"] .cv-progress-num')).toHaveText(/^1 \//);
    await page.evaluate(() => localStorage.removeItem('caravan-chronicle-v1'));
  });

  test('傳承點：landing 成就亮起、新旅程起始金幣 +30', async ({ page }) => {
    await page.goto('/caravan');
    await page.evaluate(() => localStorage.setItem('caravan-chronicle-v1', JSON.stringify({
      v: 1, seenEvents: [], defeatedEnemies: [], visitedLocations: [], ownedEquipment: [],
      runs: { started: 3, won: 3 }, legacyPoints: 3, unlockedAchievements: ['first-steps'],
    })));
    await page.reload();
    await expect(page.locator('.cv-achievement[data-ach="first-steps"]')).toHaveClass(/unlocked/);
    await expect(page.locator('#cv-legacy')).toContainText('傳承 3 點');
    // 遊戲標題畫面顯示傳承、新旅程 200+30
    await page.goto('/caravan/play');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await expect(page.locator('#title-legacy')).toContainText('+30 G');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm'); // 創角：預設劍士＋0 配點＝舊版主角
    await expect(page.locator('#town-gold')).toHaveText('230');
    await page.evaluate(() => localStorage.removeItem('caravan-chronicle-v1'));
  });
});

test.describe('商隊與劍：Boss 激怒（M10）', () => {
  test('迷宮 boss 打到半血觸發激怒 log（真實 UI 戰鬥流程）', async ({ page }) => {
    test.setTimeout(180000);
    await page.goto('/caravan/play?seed=71');
    await page.evaluate(() => {
      localStorage.removeItem('caravan-chronicle-v1');
      // 中等輸出＋高生存主角：確保 boss 會經過半血窗口而不被秒殺、玩家也不會先死
      const save = {
        version: 6, createdAt: 1000, gold: 999,
        flags: { 'discovered:goblin-den': true }, // 直入哥布林巢穴（3 層、道中無毒怪、boss 帶 enrage）
        protagonist: {
          id: 'protagonist', name: '你', job: 'swordsman', level: 3, xp: 200,
          // 中庸輸出（磨 boss 必經半血窗口）＋重甲高防
          stats: { str: 12, dex: 12, int: 10, cha: 12, con: 18 }, maxHp: 46, injuredForTrips: 0, trait: 'tough',
          equipment: { weapon: null, armor: 'saltforged-mail', trinket: 'den-idol' },
        },
        companions: [], inventory: {}, expedition: null, wagonLevel: 0,
        tavernSeed: 71, marketSeed: 71, reputation: 0, visitedBossDungeons: [],
      };
      localStorage.setItem('caravan-save-v1', JSON.stringify(save));
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-continue');
    await expect(page.locator('#screen-town')).toBeVisible();
    await page.click('#btn-quest-board');
    await page.click('.quest-item[data-location-id="goblin-den"]');
    await expect(page.locator('#screen-expedition')).toBeVisible();

    // 走完迷宮（同遠征系統 describe 的 stepExpedition 驅動邏輯，此處自帶一份），
    // 收集所有戰鬥 log 找激怒
    let enrageSeen = false;
    for (let i = 0; i < 400; i++) {
      const logs = await page.locator('#combat-log p').allTextContents().catch(() => []);
      if (logs.some((t) => t.includes('激怒'))) { enrageSeen = true; break; }
      if (await page.locator('#screen-settlement').isVisible().catch(() => false)) break;
      if (await page.locator('#screen-town').isVisible().catch(() => false)) break;
      if (await page.locator('#screen-combat').isVisible().catch(() => false)) {
        if (await page.locator('#combat-result').isVisible().catch(() => false)) {
          await page.click('#btn-combat-back');
        } else {
          const move = page.locator('#combat-actions .move-btn').first();
          if (await move.isVisible().catch(() => false)) await move.click();
          await page.waitForTimeout(250);
        }
        continue;
      }
      const eventOpt = page.locator('.event-opt:not([disabled])').first();
      if (await eventOpt.isVisible().catch(() => false)) { await eventOpt.click(); continue; }
      const roomBtn = page.locator('.room-btn').first();
      if (await roomBtn.isVisible().catch(() => false)) { await roomBtn.click(); continue; }
      const cont = page.locator('#btn-exp-continue');
      if (await cont.isVisible().catch(() => false)) { await cont.click(); continue; }
      await page.waitForTimeout(150);
    }
    expect(enrageSeen, 'boss 半血應觸發激怒 log').toBe(true);
  });
});

test.describe('商隊與劍：創角與背包', () => {
  test('創角：選法師＋配點＋特性，主角依選擇建立', async ({ page }) => {
    await page.goto('/caravan/play');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await expect(page.locator('#screen-create')).toBeVisible();

    await page.click('.create-job[data-job="mage"]');
    // 加 2 點智力
    const intRow = page.locator('#create-alloc-rows .alloc-row', { hasText: '智力' });
    await intRow.locator('.alloc-plus').last().click();
    await intRow.locator('.alloc-plus').last().click();
    await expect(page.locator('#create-points')).toHaveText('1');
    // 選博學特性
    await page.locator('.create-trait-chip', { hasText: '博學' }).click();
    await page.click('#btn-create-confirm');

    await expect(page.locator('#screen-town')).toBeVisible();
    const p = await page.evaluate(() => JSON.parse(localStorage.getItem('caravan-save-v1')!).protagonist);
    expect(p.job).toBe('mage');
    expect(p.stats.int).toBe(16); // 法師起始 14 + 2
    expect(p.trait).toBe('learned');
  });

  test('背包分頁：買入的物品顯示於背包（含裝備標籤）', async ({ page }) => {
    await page.goto('/caravan/play');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm');
    await expect(page.locator('#screen-town')).toBeVisible();

    await page.locator('.market-row[data-item-id="herb"] .buy-btn').click();
    await page.locator('.market-row[data-item-id="ridgeleather-vest"] .buy-btn').click();
    await page.click('.town-tab[data-town-tab="backpack"]');

    const herbRow = page.locator('.backpack-row[data-item-id="herb"]');
    await expect(herbRow.locator('.backpack-name')).toHaveText('藥草');
    await expect(herbRow.locator('.backpack-count')).toHaveText('×1');
    const gearRow = page.locator('.backpack-row[data-item-id="ridgeleather-vest"]');
    await expect(gearRow.locator('.backpack-tag')).toHaveText('護甲');
  });
});

test.describe('商隊與劍：M11 RPG 深度', () => {
  test('專精：Lv4 主角選狂戰士 → 力量 +2、血怒斬入列、選後鎖定', async ({ page }) => {
    await page.goto('/caravan/play');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm');
    await expect(page.locator('#screen-town')).toBeVisible();
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('caravan-save-v1')!);
      data.protagonist.level = 4;
      data.protagonist.xp = 210;
      localStorage.setItem('caravan-save-v1', JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-continue');
    await page.click('.town-tab[data-town-tab="roster"]');

    const card = page.locator('.roster-card[data-member-id="protagonist"]');
    await card.locator('.spec-btn').click();
    await expect(page.locator('#spec-panel')).toBeVisible();
    await page.click('.spec-option[data-spec-id="berserker"]');
    await expect(page.locator('#spec-panel')).toBeHidden();

    await expect(card.locator('.roster-xp')).toContainText('專精「狂戰士」');
    await expect(card.locator('.roster-stats')).toContainText('力量 14'); // 12 + 2
    await expect(card.locator('.roster-moves')).toContainText('血怒斬');
    await expect(card.locator('.spec-btn')).toHaveCount(0);
  });

  test('戰鬥道具：買藥草進訓練場 → 道具選單使用 → 背包扣減且寫入戰鬥記錄', async ({ page }) => {
    await page.goto('/caravan/play');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm');
    await expect(page.locator('#screen-town')).toBeVisible();

    await page.locator('.market-row[data-item-id="herb"] .buy-btn').click();
    await page.click('#btn-training');
    await expect(page.locator('#screen-combat')).toBeVisible();

    await page.locator('.combat-item-toggle').click();
    await page.locator('.item-btn[data-item-id="herb"]').click();
    await expect(page.locator('#combat-log')).toContainText('使用藥草');
    const herbLeft = await page.evaluate(
      () => JSON.parse(localStorage.getItem('caravan-save-v1')!).inventory.herb
    );
    expect(herbLeft).toBe(0);
  });

  test('羈絆：bond=5 的旅伴顯示「信賴」且生命上限 +4', async ({ page }) => {
    await page.goto('/caravan/play');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm');
    await expect(page.locator('#screen-town')).toBeVisible();
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('caravan-save-v1')!);
      data.companions.push({
        id: 'bond-ally', name: '老友', job: 'ranger', level: 1, xp: 0,
        stats: { str: 10, dex: 14, int: 10, cha: 10, con: 11 }, maxHp: 20,
        injuredForTrips: 0, trait: null, bond: 5,
        equipment: { weapon: null, armor: null, trinket: null },
      });
      localStorage.setItem('caravan-save-v1', JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-continue');
    await page.click('.town-tab[data-town-tab="roster"]');

    const ally = page.locator('.roster-card[data-member-id="bond-ally"]');
    await expect(ally.locator('.roster-xp')).toContainText('羈絆「信賴」（同行 5 趟）');
    await expect(ally.locator('.roster-hp')).toHaveText('生命上限 24'); // 20 + tier2×2
  });
});

test.describe('商隊與劍：M12 商會目標', () => {
  test('新檔城鎮顯示目標卡：行腳商、下一階見習商人 0/20、HUD 階級章', async ({ page }) => {
    await page.goto('/caravan/play');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm');
    await expect(page.locator('#screen-town')).toBeVisible();

    await expect(page.locator('#goal-rank')).toHaveText('行腳商');
    await expect(page.locator('#goal-next')).toContainText('下一階「見習商人」：聲望 0/20');
    await expect(page.locator('#hud-rank')).toHaveText('行腳商');
    await expect(page.locator('.title-premise')).toBeAttached(); // 標題前提句存在
  });

  test('聲望 45 → 目標卡顯示特許商人、下一階商會重鎮 45/60', async ({ page }) => {
    await page.goto('/caravan/play');
    await page.evaluate(() => localStorage.removeItem('caravan-save-v1'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-new-game');
    await page.click('#btn-create-confirm');
    await expect(page.locator('#screen-town')).toBeVisible();
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('caravan-save-v1')!);
      data.reputation = 45;
      localStorage.setItem('caravan-save-v1', JSON.stringify(data));
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.click('#btn-continue');

    await expect(page.locator('#goal-rank')).toHaveText('特許商人');
    await expect(page.locator('#goal-next')).toContainText('聲望 45/60');
  });
});
