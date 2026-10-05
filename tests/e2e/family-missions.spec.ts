import { expect, test } from '@playwright/test';

test.describe('雙羽任務所', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/family-missions');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test('主站不公開任務入口，直接網址仍可進入', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href^="/family-missions"]')).toHaveCount(0);
    const response = await page.goto('/family-missions');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: /^雙羽星光\s*任務所$/ })).toBeVisible();
  });

  test('孩子可以切換角色並回報生活任務', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /^雙羽星光\s*任務所$/ })).toBeVisible();
    await expect(page.getByTestId('scout-name')).toContainText('林芮羽 Apple');
    await expect(page.getByTestId('scout-rank')).toContainText('初級偵查兵');
    await expect(page.getByTestId('star-count')).toHaveText('80');
    await expect(page.getByTestId('scout-portrait')).toHaveAttribute('src', /apple-scout/);

    await page.getByRole('button', { name: '完成：整理自己的物品' }).click();
    await expect(page.getByRole('status')).toContainText('任務完成回報');
    await expect(page.getByTestId('star-count')).toHaveText('82');
    await expect(page.getByTestId('ability-responsibility')).toContainText('責任');
    const reportedMission = page.getByRole('button', { name: '已回報：整理自己的物品', exact: true });
    await expect(reportedMission).toBeVisible();
    await expect(reportedMission).toBeDisabled();

    await page.reload();
    await expect(page.getByTestId('star-count')).toHaveText('82');

    await page.getByRole('tab', { name: /Amy/ }).click();
    await expect(page.getByTestId('scout-name')).toContainText('林彥羽 Amy');
    await expect(page.getByTestId('scout-rank')).toContainText('小兵');
    await expect(page.getByTestId('star-count')).toHaveText('0');
    await expect(page.getByTestId('scout-portrait')).toHaveAttribute('src', /amy-scout/);
  });

  test('任務與屬性以圖文並茂的靜態內容呈現', async ({ page }) => {
    await expect(page.getByRole('img', { name: /雙羽小小偵查員/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: '今天的任務地圖' })).toBeVisible();
    await expect(page.locator('.mission-card')).toHaveCount(5);

    const abilityGarden = page.getByRole('region', { name: '能力花園' });
    await expect(abilityGarden).toBeVisible();
    await expect(abilityGarden.locator('.ability-card')).toHaveCount(6);
    await expect(abilityGarden).toContainText('國文');
    await expect(abilityGarden).toContainText('數學');
    await expect(abilityGarden).toContainText('英文');
    await expect(abilityGarden).toContainText('禮儀');
    await expect(abilityGarden).toContainText('友善');
    await expect(abilityGarden).toContainText('責任');

    await expect(page.getByRole('region', { name: '成長徽章' })).toContainText('自理小達人');
    await expect(page.getByRole('region', { name: '升階旅程' })).toContainText('中級偵查兵');
  });
});
