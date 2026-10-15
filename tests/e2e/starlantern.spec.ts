import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--mute-audio'] } });

test.describe('starlantern', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL Pixi game smoke runs on chromium only');

  test('城鎮 → 出發 → 戰鬥勝利 → 回城住宿存檔 → 重新載入', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const badArt: string[] = [];
    page.on('response', (r) => { if (r.url().includes('/assets/games/starlantern/') && r.status() >= 400) badArt.push(`${r.status()} ${r.url()}`); });
    await page.goto('/games/starlantern?seed=7&fast=1');
    const root = page.locator('#sl-root');
    await page.waitForFunction(() => Boolean((window as unknown as { __starlanternDebug?: unknown }).__starlanternDebug), undefined, { timeout: 20000 });
    await expect(root).toHaveAttribute('data-phase', 'town');

    await page.click('#sl-tab-guild');
    await expect(page.locator('.sl-formation select')).toHaveCount(5);
    await expect(page.locator('.sl-card .sl-standee').first()).toBeVisible();
    await page.click('#sl-tab-depart');
    await page.click('#sl-depart-1');
    await expect(root).toHaveAttribute('data-phase', 'map');

    for (let i = 0; i < 200 && (await root.getAttribute('data-phase')) === 'map'; i++) {
      await page.keyboard.press(i % 2 === 0 ? 'ArrowRight' : 'ArrowLeft');
    }
    await expect(root).toHaveAttribute('data-phase', 'battle');
    await expect(page.locator('#sl-battle .sl-portrait').first()).toBeVisible();

    for (let i = 0; i < 60 && !(await page.locator('#sl-continue').isVisible()); i++) {
      const auto = page.locator('#sl-auto');
      if (await auto.isVisible()) await auto.click();
      else await page.waitForTimeout(50);
    }
    await expect(page.locator('#sl-result')).toContainText('勝利');
    type Dbg = { __starlanternDebug: { game: { pos: { x: number; y: number }; encounter: number } } };
    const snap = () => page.evaluate(() => {
      const g = (window as unknown as Dbg).__starlanternDebug.game;
      return { pos: { ...g.pos }, encounter: g.encounter };
    });
    const before = await snap();
    for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowLeft']) await page.keyboard.press(k);
    expect(await snap()).toEqual(before);
    await page.click('#sl-continue');
    await expect(root).toHaveAttribute('data-phase', 'map');

    await page.click('#sl-lamp');
    await expect(root).toHaveAttribute('data-phase', 'town');
    await page.click('#sl-tab-inn');
    await page.click('#sl-rest');
    await expect(page.locator('#sl-notice')).toContainText('已存檔');
    const gold = await page.locator('#sl-gold').textContent();

    await page.reload();
    await expect(root).toHaveAttribute('data-phase', 'town');
    await expect(page.locator('#sl-gold')).toHaveText(gold ?? '');
    expect(await page.evaluate(() => localStorage.getItem('starlantern-save'))).not.toBeNull();
    expect(badArt).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('壞掉的存檔會提示並開新檔', async ({ page }) => {
    await page.goto('/games/starlantern');
    await page.evaluate(() => localStorage.setItem('starlantern-save', '{bad'));
    await page.reload();
    await expect(page.locator('#sl-notice')).toContainText('存檔無法讀取');
    expect(await page.evaluate(() => localStorage.getItem('starlantern-save-backup'))).toBe('{bad');
    await expect(page.locator('#sl-gold')).toHaveText('150 G');
  });
});
