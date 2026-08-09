import { expect, test } from '@playwright/test';

test.describe('雙羽任務所', () => {
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

  test('像素冒險介面提供 HUD 與任務開始過場', async ({ page }) => {
    await expect(page.locator('.pixel-hero-hud')).toContainText('APPLE');
    await expect(page.locator('.pixel-hero-hud')).toContainText('039');
    await expect(page.locator('#hero-pixel-art')).toHaveClass(/is-rendered/);
    await expect(page.locator('#scout-portrait-pixel')).toHaveClass(/is-rendered/);
    await page.getByRole('button', { name: '進入今日任務' }).click();
    await expect(page.locator('#quest-warp')).toHaveClass(/is-visible/);
    await expect(page.locator('#quest-warp')).toContainText('QUEST START!');
    await expect(page.locator('#quest-chain-count')).toHaveText('0 / 5');
  });

  test('孩子可以切換角色並回報生活任務', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '雙羽星光任務所' })).toBeVisible();
    await expect(page.getByTestId('scout-name')).toContainText('林芮羽 Apple');
    await expect(page.getByTestId('scout-rank')).toContainText('初級偵查兵');
    await expect(page.getByTestId('star-count')).toHaveText('39');
    await expect(page.getByTestId('scout-portrait')).toHaveAttribute('src', /apple-scout/);

    await page.getByRole('button', { name: '完成：整理自己的物品' }).click();
    await expect(page.getByRole('status')).toContainText('任務完成回報');
    await expect(page.getByTestId('star-count')).toHaveText('40');
    await expect(page.getByTestId('scout-rank')).toContainText('中級偵查兵');
    await expect(page.getByTestId('ability-responsibility')).toContainText('責任');
    await expect(page.getByTestId('ability-responsibility')).toHaveClass(/is-just-grown/);
    await expect(page.locator('.star-wallet')).toHaveClass(/is-rewarded/);
    await expect(page.locator('#mission-win')).toHaveClass(/is-visible/);
    await expect(page.locator('#mission-win-stars-before')).toHaveText('39');
    await expect(page.locator('#mission-win-stars-after')).toHaveText('40 ★');
    await expect(page.locator('#quest-chain-count')).toHaveText('1 / 5');
    await expect(page.locator('#quest-chain-track .is-lit')).toHaveCount(1);
    await expect(page.locator('#scout-reaction-text')).toContainText('星星和能力都變強了');
    await expect(page.locator('#ability-level-up')).toHaveClass(/is-visible/);
    await expect(page.locator('#mini-star-trail .is-lit')).toHaveCount(0);
    await expect(page.getByText('已回報', { exact: true })).toBeVisible();

    const rankUp = page.getByRole('dialog', { name: '升階成功' });
    await expect(rankUp).toBeVisible();
    await expect(rankUp).toContainText('第 4 階');
    await expect(rankUp).toContainText('中級偵查兵');
    await expect(rankUp).toContainText('能準備自己的小裝備');
    await rankUp.getByRole('button', { name: '收下新軍階' }).click();
    await expect(rankUp).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('star-count')).toHaveText('40');

    await page.getByRole('tab', { name: /Amy/ }).click();
    await expect(page.getByTestId('scout-name')).toContainText('林彥羽 Amy');
    await expect(page.getByTestId('scout-rank')).toContainText('小兵');
    await expect(page.getByTestId('star-count')).toHaveText('11');
    await expect(page.getByTestId('scout-portrait')).toHaveAttribute('src', /amy-scout/);
  });

  test('完成五個任務會開啟今日全破寶箱', async ({ page }) => {
    await page.getByRole('tab', { name: /Amy/ }).click();
    for (let index = 0; index < 5; index += 1) {
      await page.locator('.mission-complete:not(:disabled)').first().click();
    }

    await expect(page.locator('#quest-chain-count')).toHaveText('5 / 5');
    await expect(page.locator('#quest-chain-hud')).toHaveClass(/is-perfect/);
    const dailyClear = page.getByRole('dialog', { name: '今日任務全破' });
    await expect(dailyClear).toBeVisible();
    await expect(dailyClear).toContainText('Amy 今日全破');
    await dailyClear.getByRole('button', { name: '查看今天成長的能力' }).click();
    await expect(dailyClear).toBeHidden();
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
    const rankJourney = page.getByRole('region', { name: '升階旅程' });
    await expect(rankJourney).toContainText('500 星・50 階成長地圖');
    await expect(rankJourney.locator('[data-rank-stars]')).toHaveCount(50);
  });

  test('角色切換與任務卡具有清楚的動態操作狀態', async ({ page }) => {
    await expect(page.locator('.family-missions')).toHaveAttribute('data-motion-ready', 'true');
    await page.getByRole('tab', { name: /Amy/ }).click();
    await expect(page.locator('.scout-story-card')).toHaveClass(/is-switching/);
    await expect(page.locator('.mission-card').first()).toHaveClass(/is-entering/);

    const completeButton = page.getByRole('button', { name: '完成：玩具回家任務' });
    await expect(completeButton).toHaveAttribute('data-reward-preview', '責任 +1、任務星 +1');
  });

  test('任務口訣、能力軌道與成長地圖可以展開探索', async ({ page }) => {
    const missionCard = page.locator('.mission-card').first();
    const missionGuideButton = missionCard.getByRole('button', { name: /三步任務口訣/ });
    await missionGuideButton.click();
    await expect(missionGuideButton).toHaveAttribute('aria-expanded', 'true');
    await expect(missionCard.locator('.mission-guide')).toHaveAttribute('aria-hidden', 'false');
    await expect(missionCard.locator('.mission-guide li')).toHaveCount(3);

    const responsibility = page.getByTestId('ability-responsibility');
    const abilityButton = responsibility.getByRole('button', { name: /成長軌道/ });
    await abilityButton.click();
    await expect(abilityButton).toHaveAttribute('aria-expanded', 'true');
    await expect(responsibility.locator('.ability-ladder span')).toHaveCount(21);

    const currentChapter = page.locator('.rank-chapter.is-current');
    await expect(currentChapter).toHaveClass(/is-open/);
    await expect(currentChapter.getByRole('button', { name: /五個軍階/ })).toHaveAttribute('aria-expanded', 'true');
  });
});
