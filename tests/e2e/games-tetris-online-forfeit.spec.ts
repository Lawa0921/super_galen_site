import { test, expect, type Page } from '@playwright/test';

/**
 * 1v1 對手中離 → 留下者應在偵測窗內看到 forfeit-win（disconnected 旗標 + 橫幅）。
 * headless 突然關 context 不會送達 DataChannel close（與 FFA forfeit e2e 同樣現象），
 * 故偵測依賴 1v1 的 30 秒靜默兜底（SILENCE_TIMEOUT_MS）；poll 預算 55s。
 * 兜底期間（>10s 起）留下者畫面會先出現「N 秒後判離」倒數警示，這裡一併驗證。
 */
test.describe('1v1 — opponent leave forfeit win', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebRTC requires chromium');
  test.setTimeout(180_000);

  test('host sees forfeit win after guest context closes abruptly', async ({ browser }) => {
    const ctxHost = await browser.newContext();
    const ctxGuest = await browser.newContext();
    const host = await ctxHost.newPage();
    const guest = await ctxGuest.newPage();

    try {
      await host.goto('/games/tetris?mode=online');
      await guest.goto('/games/tetris?mode=online');
      await host.locator('.pc-btn[data-count="2"]').click();
      await guest.locator('.pc-btn[data-count="2"]').click();

      await host.locator('#online-create').click();
      const code = host.locator('#lobby-code');
      await expect(code).toContainText(/[A-Z0-9]{5}/, { timeout: 20_000 });
      const room = ((await code.textContent()) ?? '').match(/[A-Z0-9]{5}/)?.[0] ?? '';

      await guest.locator('#online-room').fill(room);
      await guest.locator('#online-join-btn').click();

      // 兩端 1v1 鎖步建立、確實開打（confirmedFrame 推進）
      await waitLockstep(host);
      await waitLockstep(guest);
      await expect.poll(() => readFrame(host), { timeout: 25_000 }).toBeGreaterThan(20);

      // 對手突然關閉（不送 close 的最壞情境）
      await ctxGuest.close();

      // 判離前（靜默 >10s 起）畫面先出現倒數警示「對手連線不穩… N 秒後判離」
      await expect.poll(() => readSilenceWarning(host), { timeout: 20_000 }).toContain('秒後判離');
      expect(await readDisconnected(host)).toBe(false); // 警示階段尚未判離

      // 靜默兜底（30s + 緩衝）內 host 必須進入 forfeit-win
      await expect.poll(() => readDisconnected(host), { timeout: 55_000 }).toBe(true);
      // 判離後倒數警示應消失
      await expect.poll(() => readSilenceWarning(host), { timeout: 5_000 }).toBe('');
    } finally {
      await ctxHost.close();
      await ctxGuest.close().catch(() => {});
    }
  });
});

async function waitLockstep(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __tetrisDebug?: { lockstep?: unknown } }).__tetrisDebug?.lockstep),
    undefined,
    { timeout: 40_000 },
  );
}

function readFrame(page: Page): Promise<number> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { lockstep?: { confirmedFrame?: number } } }).__tetrisDebug;
    return dbg?.lockstep?.confirmedFrame ?? 0;
  });
}

function readDisconnected(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { disconnected?: boolean } }).__tetrisDebug;
    return dbg?.disconnected === true;
  });
}

function readSilenceWarning(page: Page): Promise<string> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { silenceWarning?: string } }).__tetrisDebug;
    return dbg?.silenceWarning ?? '';
  });
}
