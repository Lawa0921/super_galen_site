import { test, expect, type Page } from '@playwright/test';

/**
 * Host Migration（中離續行 Stage B）端到端：3 context（host + g1 + g2）開 FFA 對局
 * 進 playing 後，直接 `ctxHost.close()` 模擬 HOST 關閉分頁，驗證：
 *  1. g1 / g2 都完成遷移（`__tetrisDebug.migration.state === 'done'`，gen=1）
 *  2. 舊 host 被判敗：placement = 3（3 人局第一個淘汰者墊底）
 *  3. 對局未凍結——g1 / g2 的 confirmedFrame 在遷移後恢復推進
 *  4. 驅動 g2 狂硬降 topout → 對局分出勝負：兩端 phase='result'、standings 一致、
 *     舊 host 墊底（standings[2] === host 的 playerId）
 *
 * 時間預算：context.close() → DataChannel close 快速路徑（秒級）；headless 下若
 * close 事件不發則退靜默逾時兜底（SILENCE_TIMEOUT_MS=30s，放寬防誤殺切分頁者）。
 * 遷移本身含 ELECTION_GRACE_MS=3s 選舉先手窗 + 真實 WebRTC 重交握，上限
 * MIGRATION_TIMEOUT_MS=20s。故 migration state poll 預算 120s
 * （30s 靜默 + 20s 遷移上限 + 緩衝）。WebRTC 需 chromium。
 */
test.describe('Dungeon Arcade — FFA host-leave migration continuation', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebRTC requires chromium');
  test.setTimeout(240_000);

  test('closing the HOST context migrates to a new host and the match continues to a result', async ({ browser }) => {
    const ctxHost = await browser.newContext();
    const ctxG1 = await browser.newContext();
    const ctxG2 = await browser.newContext();
    const host = await ctxHost.newPage();
    const g1 = await ctxG1.newPage();
    const g2 = await ctxG2.newPage();

    // 遷移失敗時的根因分析素材：收集 guest 端 console（pageerror 與 error/warning log）。
    const guestLogs: string[] = [];
    for (const [name, p] of [['g1', g1], ['g2', g2]] as const) {
      p.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          guestLogs.push(`[${name}][console.${msg.type()}] ${msg.text()}`);
        }
      });
      p.on('pageerror', (err) => guestLogs.push(`[${name}][pageerror] ${err.message}`));
    }

    try {
      await host.goto('/games/tetris?mode=online');
      await g1.goto('/games/tetris?mode=online');
      await g2.goto('/games/tetris?mode=online');

      // 三端都選 3 人（N≥3 → FFA 路徑）
      await selectCount(host, 3);
      await selectCount(g1, 3);
      await selectCount(g2, 3);

      // Host 建房，兩 guest 依序加入（避免 index race；g1 = playerIds[1] = 遷移候選）
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

      // 對局確實在跑（confirmedFrame > 30）後才關 HOST，避免握手期 close 干擾
      await expect.poll(() => readConfirmedFrame(host), { timeout: 25_000 }).toBeGreaterThan(30);
      await expect.poll(() => readConfirmedFrame(g1), { timeout: 25_000 }).toBeGreaterThan(30);
      await expect.poll(() => readConfirmedFrame(g2), { timeout: 25_000 }).toBeGreaterThan(30);

      // 關閉前先記下 host 的 playerId（之後要驗證它被判敗、墊底）
      const hostId = await readLocalId(host);
      expect(hostId).not.toBe('');

      // === 1. 模擬 HOST 關閉分頁 ===
      const closedAt = Date.now();
      await ctxHost.close();

      // === 2. g1 / g2 都完成遷移：migration.state === 'done'（gen=1）===
      // 預算 120s：偵測（close 快速路徑秒級 / 靜默兜底 30s）+ 遷移上限 20s + 緩衝。
      try {
        await expect.poll(() => readMigration(g1), { timeout: 120_000 })
          .toEqual({ gen: 1, state: 'done' });
        await expect.poll(() => readMigration(g2), { timeout: 120_000 })
          .toEqual({ gen: 1, state: 'done' });
      } catch (e) {
        // 遷移未達 done：吐出兩端 migration 狀態與 console log 供根因分析後再丟出。
        const m1 = await readMigration(g1).catch(() => null);
        const m2 = await readMigration(g2).catch(() => null);
        console.log(`[hostmig-e2e] FAILED migration — g1=${JSON.stringify(m1)} g2=${JSON.stringify(m2)}`);
        for (const line of guestLogs) console.log(`[hostmig-e2e] ${line}`);
        throw e;
      }
      const migrateMs = Date.now() - closedAt;
      console.log(`[hostmig-e2e] migration done on both guests after ${migrateMs}ms (host close → state done)`);

      // === 3. 舊 host 被判敗：placement = 3（3 人局第一個淘汰）===
      await expect.poll(() => readPlacementOf(g1, hostId), { timeout: 30_000 }).toBe(3);
      await expect.poll(() => readPlacementOf(g2, hostId), { timeout: 30_000 }).toBe(3);

      // === 4. 對局未凍結：g1 / g2 的 confirmedFrame 恢復推進 ===
      const cfG1 = await readConfirmedFrame(g1);
      const cfG2 = await readConfirmedFrame(g2);
      await expect.poll(() => readConfirmedFrame(g1), { timeout: 20_000 }).toBeGreaterThan(cfG1);
      await expect.poll(() => readConfirmedFrame(g2), { timeout: 20_000 }).toBeGreaterThan(cfG2);

      // === 5. 驅動 g2 狂硬降 topout → 分出勝負（剩 g1 一人 → victory → result）===
      for (let i = 0; i < 150; i++) {
        await g2.keyboard.press('Space');
        if (i % 10 === 0 && (await readPhase(g2)) === 'result') break;
      }
      await expect.poll(() => readPhase(g1), { timeout: 30_000 }).toBe('result');
      await expect.poll(() => readPhase(g2), { timeout: 30_000 }).toBe('result');

      // === 6. standings 一致且舊 host 墊底 ===
      const stG1 = await readStandings(g1);
      const stG2 = await readStandings(g2);
      expect(stG1.length).toBe(3);
      expect(stG2).toEqual(stG1);
      expect(stG1[2]).toBe(hostId); // 中離者（舊 host）墊底
    } finally {
      await ctxHost.close(); // 已關閉時為 no-op
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

/** 讀遷移狀態（{gen, state}）；debug 介面未就緒回 {gen:-1, state:'none'}。 */
function readMigration(page: Page): Promise<{ gen: number; state: string }> {
  return page.evaluate(() => {
    const dbg = (window as unknown as {
      __tetrisDebug?: { migration?: { gen: number; state: string } };
    }).__tetrisDebug;
    const m = dbg?.migration;
    return m ? { gen: m.gen, state: m.state } : { gen: -1, state: 'none' };
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
