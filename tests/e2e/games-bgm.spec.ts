import { test, expect } from '@playwright/test';

const BASE = '/games';

test.describe('Dungeon Arcade BGM', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.removeItem('arcade-bgm'); } catch {} });
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
  });

  test('toggle 預設關閉、音訊暫停', async ({ page }) => {
    const btn = page.locator('.arcade-bgm-toggle');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(await page.locator('.arcade-bgm-audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  });

  test('點擊 → 播放 + 寫入 localStorage on', async ({ page }) => {
    const btn = page.locator('.arcade-bgm-toggle');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('arcade-bgm'))).toBe('on');
    await expect.poll(() => page.locator('.arcade-bgm-audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
  });

  test('再點擊 → 關閉 + localStorage off', async ({ page }) => {
    const btn = page.locator('.arcade-bgm-toggle');
    await btn.click();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => localStorage.getItem('arcade-bgm'))).toBe('off');
  });

  test('BGM 音檔可載入（200 + audio mime）', async ({ page, request }) => {
    const src = await page.locator('.arcade-bgm-audio').getAttribute('src');
    expect(src).toBeTruthy();
    const res = await request.get(src as string);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/audio|mpeg|octet-stream/);
    // 真實 BGM 約 700KB，檢查 byte 數以擋空檔 / pointer / 截斷檔
    const body = await res.body();
    expect(body.length).toBeGreaterThan(100000);
  });
});

for (const [name, p] of [['tetris', '/games/tetris'], ['bomber', '/games/bomber'], ['witchrun', '/games/witchrun']] as const) {
  test(`${name} 頁有 BGM toggle 且預設關閉`, async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.removeItem('arcade-bgm'); } catch {} });
    await page.goto(p);
    await page.waitForLoadState('domcontentloaded');
    const btn = page.locator('.arcade-bgm-toggle');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    const src = await page.locator('.arcade-bgm-audio').getAttribute('src');
    expect(src).toContain(`/assets/games/bgm/${name}.mp3`);
  });
}
