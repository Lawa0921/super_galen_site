import { test, expect, type Page } from '@playwright/test';

/**
 * 中離續行（Stage A）端到端：3 context（host + g1 + g2）開 FFA 對局進 playing 後，
 * 直接 `ctxG2.close()` 模擬玩家關閉分頁中離，驗證：
 *  1. host 與 g1 都觀測到 g2 被判敗（placement = 3，3 人局第一個淘汰者墊底）
 *  2. 對局未凍結——host 與 g1 的 confirmedFrame 持續推進（forfeit 後缺幀由補空輸入吸收）
 *  3. 驅動 g1 狂硬降 topout → 對局分出勝負：兩端 phase='result'、standings 一致、
 *     中離者（g2）墊底（standings[2] === g2 的 playerId）
 *
 * 偵測路徑：context.close() 會關閉 DataChannel → host 走 channel close 快速路徑（秒級）；
 * 若 headless 下 close 事件不發，則退靜默逾時（SILENCE_TIMEOUT_MS=10s）兜底，
 * 故判敗 poll timeout 給 30s。WebRTC 需 chromium。
 */
test.describe('Dungeon Arcade — FFA guest-leave forfeit continuation', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebRTC requires chromium');
  test.setTimeout(120_000);

  test('closing a guest context forfeits them and the match continues to a result', async ({ browser }) => {
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

      // Host 建房，兩 guest 依序加入（避免 index race）
      await host.locator('#online-create').click();
      const room = await readRoom(host);
      expect(room).toMatch(/^[A-Z0-9]{5}$/);

      await g1.locator('#online-room').fill(room);
      await g1.locator('#online-join-btn').click();
      await waitLobbyJoined(host, 2);

      await g2.locator('#online-room').fill(room);
      await g2.locator('#online-join-btn').click();
      await waitLobbyJoined(host, 3);

      // Host 按開始 → 三端 lockstep 建立、進 playing
      await host.locator('#lobby-start').click();
      await waitFfaReady(host);
      await waitFfaReady(g1);
      await waitFfaReady(g2);
      for (const p of [host, g1, g2]) {
        await expect.poll(() => readPhase(p), { timeout: 20_000 }).toBe('playing');
      }

      // 對局確實在跑（confirmedFrame > 20）後才中離，避免握手期 close 干擾
      await expect.poll(() => readConfirmedFrame(host), { timeout: 25_000 }).toBeGreaterThan(20);
      await expect.poll(() => readConfirmedFrame(g1), { timeout: 25_000 }).toBeGreaterThan(20);
      await expect.poll(() => readConfirmedFrame(g2), { timeout: 25_000 }).toBeGreaterThan(20);

      // 關閉前先記下 g2 的 playerId（之後要驗證它墊底）
      const g2Id = await readLocalId(g2);
      expect(g2Id).not.toBe('');

      // === 1. 模擬關閉分頁中離 ===
      const closedAt = Date.now();
      await ctxG2.close();

      // === 2. host 與 g1 都觀測到 g2 被判敗：placement = 3（3 人局第一個淘汰）===
      // close 快速路徑應為秒級；若退靜默逾時（10s）也要能過 → timeout 30s。
      await expect.poll(() => readPlacementOf(host, g2Id), { timeout: 30_000 }).toBe(3);
      const detectMs = Date.now() - closedAt;
      await expect.poll(() => readPlacementOf(g1, g2Id), { timeout: 30_000 }).toBe(3);
      // 觀測用：close 路徑（秒級）vs 靜默逾時路徑（>10s）。不斷言路徑，只記錄耗時。
      console.log(`[forfeit-e2e] host observed forfeit after ${detectMs}ms (${detectMs < 8000 ? 'channel-close path' : 'silence-timeout path'})`);

      // === 3. 對局未凍結：host 與 g1 的 confirmedFrame 持續推進 ===
      const cfHost = await readConfirmedFrame(host);
      const cfG1 = await readConfirmedFrame(g1);
      await expect.poll(() => readConfirmedFrame(host), { timeout: 20_000 }).toBeGreaterThan(cfHost);
      await expect.poll(() => readConfirmedFrame(g1), { timeout: 20_000 }).toBeGreaterThan(cfG1);

      // === 4. 驅動 g1 狂硬降 topout → 分出勝負（剩 host 一人 → victory → result）===
      for (let i = 0; i < 150; i++) {
        await g1.keyboard.press('Space');
        if (i % 10 === 0 && (await readPhase(g1)) === 'result') break;
      }
      await expect.poll(() => readPhase(host), { timeout: 30_000 }).toBe('result');
      await expect.poll(() => readPhase(g1), { timeout: 30_000 }).toBe('result');

      // === 5. standings 一致且中離者墊底 ===
      const stHost = await readStandings(host);
      const stG1 = await readStandings(g1);
      expect(stHost.length).toBe(3);
      expect(stG1).toEqual(stHost);
      expect(stHost[2]).toBe(g2Id); // 中離者（g2）墊底
    } finally {
      await ctxHost.close();
      await ctxG1.close();
      await ctxG2.close(); // 已關閉時為 no-op
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

function readConfirmedFrame(page: Page): Promise<number> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { ffaLockstep?: { confirmedFrame?: number } } }).__tetrisDebug;
    return dbg?.ffaLockstep?.confirmedFrame ?? 0;
  });
}

function readLocalId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { ffaLockstep?: { localId?: string } } }).__tetrisDebug;
    return dbg?.ffaLockstep?.localId ?? '';
  });
}

/** 讀某 playerId 在 match placement 中的名次；尚未定名次回 0。 */
function readPlacementOf(page: Page, id: string): Promise<number> {
  return page.evaluate((pid) => {
    const dbg = (window as unknown as { __tetrisDebug?: { match?: { getPlacement?: () => Map<string, number> } } }).__tetrisDebug;
    const pl = dbg?.match?.getPlacement?.();
    return pl?.get(pid) ?? 0;
  }, id);
}

function readStandings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { match?: { getStandings?: () => string[] } } }).__tetrisDebug;
    return dbg?.match?.getStandings?.() ?? [];
  });
}
