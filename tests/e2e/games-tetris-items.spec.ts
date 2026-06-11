import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 4 T7 — 道具接線基本流（T8 會擴充 perk 三選一）。
 * Pixi 需 WebGL；headless 下僅 chromium 穩定。
 * 注意：page.evaluate 內不可引用 Node 端變數，window 存取一律 inline。
 */

interface RunDebug {
  energy: number;
  energyRequired: number;
  canActivate(): boolean;
  onLineClear(count: number, combo: number, tSpin: boolean): void;
}
interface ItemsDebug {
  run?: RunDebug;
  game?: { getState(): { board: unknown[][] } };
  match?: { shield: { A: number; B: number } }; // TS private、runtime 可讀（e2e 斷言用）
}
declare global {
  interface Window {
    __tetrisDebug?: ItemsDebug;
  }
}

async function waitRun(page: Page): Promise<void> {
  await expect(page.locator('#tetris-canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__tetrisDebug?.run), undefined, { timeout: 20000 });
}

const readEnergy = (page: Page) => page.evaluate(() => window.__tetrisDebug!.run!.energy);
const readCanActivate = (page: Page) => page.evaluate(() => window.__tetrisDebug!.run!.canActivate());
const filledCount = (page: Page) =>
  page.evaluate(() => window.__tetrisDebug!.game!.getState().board.flat().filter(Boolean).length);
/** 直接餵 run 能量：TETRIS 70 ×2 → cap 100。 */
const fillEnergy = (page: Page) =>
  page.evaluate(() => {
    window.__tetrisDebug!.run!.onLineClear(4, 0, false);
    window.__tetrisDebug!.run!.onLineClear(4, 0, false);
  });

test.describe('Dungeon Arcade — items (skill pick + energy + V key)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL Pixi game smoke runs on chromium only');

  test('深連結 ?mode=solo&skill=bomb 直接開局：run 掛載且 energy=0', async ({ page }) => {
    await page.goto('/games/tetris?mode=solo&skill=bomb');
    await expect(page.locator('#main-menu')).toHaveCount(0); // 深連結不出選擇步
    await waitRun(page);
    expect(await readEnergy(page)).toBe(0);
    expect(await readCanActivate(page)).toBe(false);
  });

  test('充能至 100 → 按 V 發動炸彈 → 底行被清、能量歸零', async ({ page }) => {
    await page.goto('/games/tetris?mode=solo&skill=bomb');
    await waitRun(page);

    // 先堆幾塊讓底行有格子可炸
    for (let i = 0; i < 3; i++) await page.keyboard.press('Space');
    const before = await filledCount(page);
    expect(before).toBeGreaterThan(0);

    await fillEnergy(page);
    expect(await readEnergy(page)).toBe(100);

    await page.keyboard.press('v'); // KeyV 發動
    await expect.poll(() => readEnergy(page), { timeout: 5000 }).toBe(0);
    // 底 2 行被清（clearBottomRows 只移除不新增 → 格數必減）
    await expect.poll(() => filledCount(page), { timeout: 5000 }).toBeLessThan(before);
  });

  test('UI 流程：點 SOLO → 技能選擇步出現（無 shield）→ 選 bomb → 開局', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('[data-mode="solo"]').click();
    await expect(page.locator('#skill-select')).toBeVisible();
    await expect(page.locator('.ss-card[data-skill="shield"]')).toBeHidden(); // shield 僅 vs-AI
    await page.locator('.ss-card[data-skill="bomb"]').click();
    await expect(page.locator('#main-menu')).toHaveCount(0);
    await waitRun(page);
    // 帶了 bomb：灌滿能量後可發動
    await fillEnergy(page);
    expect(await readCanActivate(page)).toBe(true);
  });

  test('vs-AI 帶 shield：充能後按 V → 玩家側護盾 +8、能量歸零', async ({ page }) => {
    await page.goto('/games/tetris?mode=ai&diff=easy&skill=shield');
    await waitRun(page);
    await fillEnergy(page);
    expect(await readEnergy(page)).toBe(100);
    // 開場 READY/FIGHT 倒數約 2.65s 內 V 無效 → poll 重按直到發動成功
    await expect
      .poll(
        async () => {
          await page.keyboard.press('v');
          return page.evaluate(() => window.__tetrisDebug!.match!.shield.A);
        },
        { timeout: 15000, intervals: [400, 600, 800] },
      )
      .toBe(8);
    expect(await readEnergy(page)).toBe(0);
  });

  test('深連結 ?mode=solo（無 skill）：不出選擇步、直接開局且永不可發動', async ({ page }) => {
    await page.goto('/games/tetris?mode=solo');
    await expect(page.locator('#main-menu')).toHaveCount(0); // 既有深連結合約
    await waitRun(page);
    await fillEnergy(page); // skill=null → 即使灌滿也不可發動
    expect(await readCanActivate(page)).toBe(false);
  });
});
