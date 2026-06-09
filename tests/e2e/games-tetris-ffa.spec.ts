import { test, expect, type Page } from '@playwright/test';

/**
 * 真・N 人大亂鬥端到端：開 3 個瀏覽器 context（1 host + 2 guest），
 * host 選人數 3 建房，兩 guest 依房號依序加入（依序避免 index race），
 * host lobby 顯示 3 人到齊後按「開始」，再驗證三端：
 *  - __tetrisDebug.ffaLockstep 存在、match.phase 進 'playing'
 *  - 三端 confirmedFrame 推進、playerIds 一致（星狀中繼鎖步同步證明）
 *  - 驅動其中一人 topout → 其進入 placement、三端 standings/placement 反映
 *
 * 星狀 guest-initiated WebRTC（dev server 單程序記憶體 signaling + 同機 loopback）。
 * WebRTC 需 chromium。連線較慢，timeout 給足。
 */
test.describe('Dungeon Arcade — FFA (N-player) online battle', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebRTC requires chromium');
  test.setTimeout(120_000);

  test('three browsers connect in a star and stay in FFA lockstep sync', async ({ browser }) => {
    const ctxHost = await browser.newContext();
    const ctxG1 = await browser.newContext();
    const ctxG2 = await browser.newContext();
    const host = await ctxHost.newPage();
    const g1 = await ctxG1.newPage();
    const g2 = await ctxG2.newPage();

    try {
      await host.goto('/games/tetris?mode=online');
      await g1.goto('/games/tetris?mode=online');
      await g2.goto('/games/tetris?mode=online');

      // 三端都選 3 人（N≥3 → FFA 路徑）
      await selectCount(host, 3);
      await selectCount(g1, 3);
      await selectCount(g2, 3);

      // Host 建房
      await host.locator('#online-create').click();
      const room = await readRoom(host);
      expect(room).toMatch(/^[A-Z0-9]{5}$/);

      // Guest 依序加入（避免 index race）：先 g1 連上，再 g2。
      await g1.locator('#online-room').fill(room);
      await g1.locator('#online-join-btn').click();
      await waitLobbyJoined(host, 2); // host + g1

      await g2.locator('#online-room').fill(room);
      await g2.locator('#online-join-btn').click();
      await waitLobbyJoined(host, 3); // host + g1 + g2

      // Host 按開始
      await host.locator('#lobby-start').click();

      // 三端 lockstep 建立（runFfaGame 後掛 __tetrisDebug.ffaLockstep）
      await waitFfaReady(host);
      await waitFfaReady(g1);
      await waitFfaReady(g2);

      // 三端 phase 進 playing
      for (const p of [host, g1, g2]) {
        await expect.poll(() => readPhase(p), { timeout: 20_000 }).toBe('playing');
      }

      // 三端 playerIds 一致（順序確定）
      const idsHost = await readPlayerIds(host);
      const idsG1 = await readPlayerIds(g1);
      const idsG2 = await readPlayerIds(g2);
      expect(idsHost.length).toBe(3);
      expect(idsG1).toEqual(idsHost);
      expect(idsG2).toEqual(idsHost);

      // 三端 confirmedFrame 推進（鎖步同步證明）
      await expect.poll(() => readConfirmedFrame(host), { timeout: 25_000 }).toBeGreaterThan(20);
      await expect.poll(() => readConfirmedFrame(g1), { timeout: 25_000 }).toBeGreaterThan(20);
      await expect.poll(() => readConfirmedFrame(g2), { timeout: 25_000 }).toBeGreaterThan(20);

      // 三端 confirmedFrame 接近（木桶鎖步 → 端間偏移小）
      const cf = await Promise.all([readConfirmedFrame(host), readConfirmedFrame(g1), readConfirmedFrame(g2)]);
      const spread = Math.max(...cf) - Math.min(...cf);
      expect(spread).toBeLessThanOrEqual(12);

      // 驅動 g2 狂硬降 → 應最先 topout（盤被疊滿）。三端 placement 反映該 KO。
      for (let i = 0; i < 60; i++) {
        await g2.keyboard.press('Space');
        if (i % 8 === 0) {
          const placed = await readPlacementCount(host);
          if (placed >= 1) break;
        }
      }

      // 三端都看到「至少一人已定名次」（KO 共識：星狀中繼把 g2 的幀同步到全員）
      for (const p of [host, g1, g2]) {
        await expect.poll(() => readPlacementCount(p), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
      }

      // 三端對「誰被淘汰」的名次一致（同一 playerId 進 placement）
      const koHost = await readPlacedIds(host);
      const koG1 = await readPlacedIds(g1);
      const koG2 = await readPlacedIds(g2);
      expect(koHost.length).toBeGreaterThanOrEqual(1);
      expect(koG1.sort()).toEqual(koHost.slice().sort());
      expect(koG2.sort()).toEqual(koHost.slice().sort());
    } finally {
      await ctxHost.close();
      await ctxG1.close();
      await ctxG2.close();
    }
  });
});

async function selectCount(page: Page, n: number): Promise<void> {
  await page.locator(`.pc-btn[data-count="${n}"]`).click();
}

async function readRoom(page: Page): Promise<string> {
  const code = page.locator('#lobby-code');
  await expect(code).toContainText(/[A-Z0-9]{5}/, { timeout: 20_000 });
  const text = (await code.textContent()) ?? '';
  return text.match(/[A-Z0-9]{5}/)?.[0] ?? '';
}

/** 等 host lobby 顯示已加入 n 人（含 host 自己）。 */
async function waitLobbyJoined(page: Page, n: number): Promise<void> {
  await expect.poll(
    async () => {
      const t = (await page.locator('#lobby-joined').textContent()) ?? '0';
      return Number(t);
    },
    { timeout: 40_000 },
  ).toBeGreaterThanOrEqual(n);
}

async function waitFfaReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __tetrisDebug?: { ffaLockstep?: unknown } }).__tetrisDebug?.ffaLockstep),
    undefined,
    { timeout: 40_000 },
  );
}

function readPhase(page: Page): Promise<string> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { match?: { phase?: string } } }).__tetrisDebug;
    return dbg?.match?.phase ?? 'none';
  });
}

function readPlayerIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { ffaLockstep?: { playerIds?: string[] } } }).__tetrisDebug;
    return dbg?.ffaLockstep?.playerIds ?? [];
  });
}

function readConfirmedFrame(page: Page): Promise<number> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { ffaLockstep?: { confirmedFrame?: number } } }).__tetrisDebug;
    return dbg?.ffaLockstep?.confirmedFrame ?? 0;
  });
}

function readPlacementCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { match?: { getPlacement?: () => Map<string, number> } } }).__tetrisDebug;
    const pl = dbg?.match?.getPlacement?.();
    return pl ? pl.size : 0;
  });
}

function readPlacedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { match?: { getPlacement?: () => Map<string, number> } } }).__tetrisDebug;
    const pl = dbg?.match?.getPlacement?.();
    return pl ? Array.from(pl.keys()) : [];
  });
}
