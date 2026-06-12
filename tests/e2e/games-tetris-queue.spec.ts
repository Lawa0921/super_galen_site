import { test, expect, type Page } from '@playwright/test';

/**
 * 快速配對隊列端到端（Q5）：
 *  ① 兩 context 都按 QUICK MATCH → 撮合 1v1 → 自動 host/join → 鎖步開打
 *  ② 三 context → 撮合 FFA → host autoStart 人到齊自動開局 → 三端 ffaLockstep 同步
 *  ③ 排隊後取消 → 面板關閉、可再正常進線上面板
 *  ④ 空池等滿閾值（?queueAiMs= 注入縮短）→ AI 提示出現 → 點擊轉 vs-AI
 *
 * 撮合窗 10 秒（最早者等滿 10s 才成局）＋ 3s poll → 成局約 10-13s，預算給足。
 * 隊列是 dev server 全域共用狀態 → serial 模式避免測試間玩家互相混配。
 * WebRTC 需 chromium。
 */
test.describe('Dungeon Arcade — quick match queue', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebRTC requires chromium');
  test.setTimeout(150_000);

  test('two players press QUICK MATCH and auto-match into a 1v1 lockstep game', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    try {
      await a.goto('/games/tetris');
      await b.goto('/games/tetris');

      const t0 = Date.now();
      await a.locator('#quick-match').click();
      await b.locator('#quick-match').click();

      // 排隊面板出現、秒數開始走
      await expect(a.locator('#queue-panel')).toBeVisible();
      await expect(b.locator('#queue-panel')).toBeVisible();

      // 撮合（10s 窗 + 3s poll）→ 自動 host/join → 1v1 鎖步建立
      await waitLockstep(a);
      await waitLockstep(b);
      console.log(`[queue-e2e] 1v1 matched+connected in ${Date.now() - t0}ms`);

      // 雙方 confirmedFrame 推進（鎖步同步證明）
      await expect.poll(() => readConfirmedFrame(a), { timeout: 25_000 }).toBeGreaterThan(10);
      await expect.poll(() => readConfirmedFrame(b), { timeout: 25_000 }).toBeGreaterThan(10);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('three players press QUICK MATCH and auto-match into an FFA game (host auto-start)', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const p3 = await ctx3.newPage();
    try {
      await p1.goto('/games/tetris');
      await p2.goto('/games/tetris');
      await p3.goto('/games/tetris');

      const t0 = Date.now();
      // 三人都在 10s 撮合窗內入隊 → ≥3 人成 FFA
      await p1.locator('#quick-match').click();
      await p2.locator('#quick-match').click();
      await p3.locator('#quick-match').click();

      // 撮合 → host autoStart（人到齊自動開局，無人按 START）→ 三端 ffaLockstep
      await waitFfaLockstep(p1);
      await waitFfaLockstep(p2);
      await waitFfaLockstep(p3);
      console.log(`[queue-e2e] FFA matched+connected in ${Date.now() - t0}ms`);

      // 三端 playerIds 一致且為 3 人
      const ids1 = await readFfaPlayerIds(p1);
      const ids2 = await readFfaPlayerIds(p2);
      const ids3 = await readFfaPlayerIds(p3);
      expect(ids1.length).toBe(3);
      expect(ids2).toEqual(ids1);
      expect(ids3).toEqual(ids1);

      // 三端 confirmedFrame 推進
      await expect.poll(() => readFfaConfirmedFrame(p1), { timeout: 25_000 }).toBeGreaterThan(10);
      await expect.poll(() => readFfaConfirmedFrame(p2), { timeout: 25_000 }).toBeGreaterThan(10);
      await expect.poll(() => readFfaConfirmedFrame(p3), { timeout: 25_000 }).toBeGreaterThan(10);
    } finally {
      await ctx1.close();
      await ctx2.close();
      await ctx3.close();
    }
  });

  test('cancel leaves the queue and returns to mode select (online panel still reachable)', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('#quick-match').click();
    await expect(page.locator('#queue-panel')).toBeVisible();

    await page.locator('#queue-cancel').click();
    await expect(page.locator('#queue-panel')).toBeHidden();
    await expect(page.locator('#quick-match')).toBeVisible(); // 模式選單已還原

    // 仍可正常進線上面板
    await page.locator('[data-mode="online"]').click();
    await expect(page.locator('#online-create')).toBeVisible();
  });

  test('empty queue shows AI offer after threshold and clicking starts vs-AI', async ({ page }) => {
    // 注入縮短閾值：1.5 秒就出 AI 提示（預設 60s）
    await page.goto('/games/tetris?queueAiMs=1500');
    await page.locator('#quick-match').click();
    await expect(page.locator('#queue-panel')).toBeVisible();
    await expect(page.locator('#queue-ai-offer')).toBeHidden(); // 未到閾值前不出現

    // 閾值後提示出現
    await expect(page.locator('#queue-ai-offer')).toBeVisible({ timeout: 10_000 });

    // 點擊 → 離隊並轉 vs-AI（aiMain 掛 __tetrisDebug.run / match）
    await page.locator('#queue-ai-offer').click();
    await expect(page.locator('#queue-panel')).toBeHidden();
    await page.waitForFunction(
      () => {
        const dbg = (window as unknown as { __tetrisDebug?: { run?: unknown; match?: unknown } }).__tetrisDebug;
        return Boolean(dbg?.run ?? dbg?.match);
      },
      undefined,
      { timeout: 20_000 },
    );
  });
});

/** 等 1v1 鎖步建立（netMain runGame 後掛 __tetrisDebug.lockstep）。 */
async function waitLockstep(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __tetrisDebug?: { lockstep?: unknown } }).__tetrisDebug?.lockstep),
    undefined,
    { timeout: 60_000 },
  );
}

function readConfirmedFrame(page: Page): Promise<number> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { lockstep?: { confirmedFrame?: number } } }).__tetrisDebug;
    return dbg?.lockstep?.confirmedFrame ?? 0;
  });
}

/** 等 FFA 鎖步建立（runFfaGame 後掛 __tetrisDebug.ffaLockstep）。 */
async function waitFfaLockstep(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __tetrisDebug?: { ffaLockstep?: unknown } }).__tetrisDebug?.ffaLockstep),
    undefined,
    { timeout: 60_000 },
  );
}

function readFfaPlayerIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { ffaLockstep?: { playerIds?: string[] } } }).__tetrisDebug;
    return dbg?.ffaLockstep?.playerIds ?? [];
  });
}

function readFfaConfirmedFrame(page: Page): Promise<number> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __tetrisDebug?: { ffaLockstep?: { confirmedFrame?: number } } }).__tetrisDebug;
    return dbg?.ffaLockstep?.confirmedFrame ?? 0;
  });
}
