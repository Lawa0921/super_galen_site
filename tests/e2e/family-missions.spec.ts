import { expect, test } from '@playwright/test';

test.describe('雙羽任務所行為回饋循環', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/family-missions');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test('任務頁維持隱藏且不出現在主站導覽', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href="/family-missions"]')).toHaveCount(0);
    await page.goto('/family-missions');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i);
  });

  test('任務、成長與收藏拆成三個清楚畫面', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '今天的任務地圖' })).toBeVisible();
    await expect(page.getByRole('region', { name: '能力花園' })).toBeHidden();
    await page.getByRole('tab', { name: /成長手冊/ }).click();
    await expect(page.getByRole('region', { name: '能力花園' })).toBeVisible();
    await expect(page.getByText('萌芽 1', { exact: true }).first()).toBeVisible();
    await page.getByRole('tab', { name: /收藏地圖/ }).click();
    await expect(page.getByRole('region', { name: '升階旅程' })).toBeVisible();
  });

  test('孩子必須先接取、回報感受，再等待家長確認', async ({ page }) => {
    const card = page.locator('.mission-card').first();
    await expect(card).toContainText('主線');
    await card.getByRole('button', { name: /接下這個任務/ }).click();
    await expect(card.getByRole('button', { name: /我回來了/ })).toBeVisible();
    await expect(page.getByTestId('star-count')).toHaveText('39');

    await card.getByRole('button', { name: /我回來了/ }).click();
    const report = page.getByRole('dialog', { name: /回報：整理自己的物品/ });
    await report.getByRole('radio', { name: '我自己完成' }).click();
    await report.getByRole('button', { name: /投入星光信箱/ }).click();

    await expect(card).toContainText('等待家長確認');
    await expect(page.getByTestId('star-count')).toHaveText('39');
    await expect(page.locator('#parent-pending-count')).toHaveText('1');
  });

  test('家長確認後才加榮譽星與能力成長', async ({ page }) => {
    const card = page.locator('.mission-card').first();
    await card.getByRole('button', { name: /接下這個任務/ }).click();
    await card.getByRole('button', { name: /我回來了/ }).click();
    await page.getByRole('radio', { name: '我自己完成' }).click();
    await page.getByRole('button', { name: /投入星光信箱/ }).click();

    await page.getByRole('button', { name: /家長基地/ }).click();
    await page.locator('#parent-pin-input').fill('0921');
    await page.getByRole('button', { name: '進入家長基地' }).click();
    await expect(page.getByText('可以這樣說：')).toBeVisible();
    await page.getByRole('button', { name: /確認完成/ }).click();

    await expect(page.getByTestId('star-count')).toHaveText('40');
    await expect(page.locator('#mission-win')).toHaveClass(/is-visible/);
    await expect(page.locator('#mission-win-praise')).toContainText('自己完成了');
    await expect(page.getByTestId('ability-responsibility')).toContainText('熟悉 3');
  });

  test('還差一小步不判定失敗，任務回到進行中', async ({ page }) => {
    const card = page.locator('.mission-card').first();
    await card.getByRole('button', { name: /接下這個任務/ }).click();
    await card.getByRole('button', { name: /我回來了/ }).click();
    await page.getByRole('radio', { name: '有點難，我有試' }).click();
    await page.getByRole('button', { name: /投入星光信箱/ }).click();

    await page.getByRole('button', { name: /家長基地/ }).click();
    await page.locator('#parent-pin-input').fill('1234');
    await page.getByRole('button', { name: '進入家長基地' }).click();
    await page.getByRole('button', { name: /還差一小步/ }).click();

    await expect(card).toContainText('最後一條線索');
    await expect(card).toContainText('回頭檢查桌面和地板');
    await expect(card.getByRole('button', { name: /我回來了/ })).toBeVisible();
    await expect(page.getByTestId('star-count')).toHaveText('39');
  });

  test('同一能力每天最多成長一次，自由挑戰不增加榮譽星', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('supergalen-family-parent-pin', '0921');
    });

    const completeAndConfirm = async (cardIndex: number) => {
      const card = page.locator('.mission-card').nth(cardIndex);
      await card.getByRole('button', { name: /接下這個任務/ }).click();
      await card.getByRole('button', { name: /我回來了/ }).click();
      await page.getByRole('radio', { name: '有人幫我' }).click();
      await page.getByRole('button', { name: /投入星光信箱/ }).click();
      await page.getByRole('button', { name: /家長基地/ }).click();
      await page.locator('#parent-pin-input').fill('0921');
      await page.getByRole('button', { name: '進入家長基地' }).click();
      await page.getByRole('button', { name: /這次一起完成/ }).click();
    };

    await completeAndConfirm(0);
    await completeAndConfirm(1);
    await expect(page.getByTestId('star-count')).toHaveText('40');
    await expect(page.getByTestId('ability-responsibility')).toContainText('熟悉 3');

    await completeAndConfirm(3);
    await expect(page.getByTestId('star-count')).toHaveText('40');
    await expect(page.locator('#mission-win-star-note')).toContainText('基地收藏');
  });
});
