import { test, expect, type Page } from '@playwright/test';

/**
 * 真・線上對戰端到端驗證：開兩個瀏覽器 context，一邊建房、一邊以房號加入，
 * 透過 dev server 單程序的記憶體 signaling + 同機 WebRTC loopback 連線，
 * 再驗證鎖步雙向同步（host 的輸入出現在 guest 的 A 盤、guest 的輸入出現在 host 的 B 盤）。
 * WebRTC 需 chromium。
 */
test.describe('Dungeon Arcade — online battle', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebRTC requires chromium');
  test.setTimeout(90_000);

  test('two browsers connect by room code and stay in lockstep sync', async ({ browser }) => {
    const ctxHost = await browser.newContext();
    const ctxGuest = await browser.newContext();
    const host = await ctxHost.newPage();
    const guest = await ctxGuest.newPage();

    try {
      await host.goto('/games/tetris?mode=online');
      await guest.goto('/games/tetris?mode=online');

      // Host 建房
      await host.locator('#online-create').click();
      const room = await readRoom(host);
      expect(room).toMatch(/^[A-Z0-9]{5}$/);

      // Guest 加房
      await guest.locator('#online-room').fill(room);
      await guest.locator('#online-join-btn').click();

      // 兩端都連上（runGame 連上後才掛 __tetrisDebug.match）
      await waitConnected(host);
      await waitConnected(guest);

      // 讓鎖步跑一下
      await host.waitForTimeout(1200);

      // Host = A 方；硬降幾塊
      for (let i = 0; i < 4; i++) { await host.keyboard.press('Space'); await host.waitForTimeout(140); }
      // Guest = B 方；硬降幾塊
      for (let i = 0; i < 4; i++) { await guest.keyboard.press('Space'); await guest.waitForTimeout(140); }
      await host.waitForTimeout(1000);

      const h = await readState(host);
      const g = await readState(guest);

      // 鎖步推進中、兩端幀數接近
      expect(h.cf).toBeGreaterThan(30);
      expect(g.cf).toBeGreaterThan(30);
      expect(Math.abs(h.cf - g.cf)).toBeLessThanOrEqual(6);

      // 雙向同步：host 的輸入讓 guest 的 A 盤也有方塊；guest 的輸入讓 host 的 B 盤也有方塊
      expect(h.aFilled).toBeGreaterThan(0);
      expect(g.aFilled).toBeGreaterThan(0); // host→guest 同步
      expect(g.bFilled).toBeGreaterThan(0);
      expect(h.bFilled).toBeGreaterThan(0); // guest→host 同步
    } finally {
      await ctxHost.close();
      await ctxGuest.close();
    }
  });
});

async function readRoom(page: Page): Promise<string> {
  const status = page.locator('#online-status');
  await expect(status).toContainText(/[A-Z0-9]{5}/, { timeout: 20000 });
  const text = (await status.textContent()) ?? '';
  return text.match(/[A-Z0-9]{5}/)?.[0] ?? '';
}

async function waitConnected(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __tetrisDebug?: { match?: unknown } }).__tetrisDebug?.match),
    undefined,
    { timeout: 30000 },
  );
}

function readState(page: Page) {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug: { match: any; lockstep?: { confirmedFrame: number } } }).__tetrisDebug;
    const m = dbg.match;
    const count = (side: 'a' | 'b') => (m[side].getState().board as Array<Array<unknown>>).flat().filter(Boolean).length;
    return { cf: dbg.lockstep?.confirmedFrame ?? 0, aFilled: count('a'), bFilled: count('b') };
  });
}
