import { test, expect, type Page } from '@playwright/test';

/**
 * Dungeon Bomber 線上對戰雙頁籤端到端：開兩個 context，host 建房、guest 以房號加入，
 * 透過 dev server 單程序的記憶體 signaling（/api/signal）+ 同機 WebRTC loopback 連線，
 * 兩端 ready/start 後進入鎖步 versus，驗證雙方都到 status==='playing' 且 2 名玩家。
 * BONUS：跑幾幀後驗證鎖步雙向同步（共同幀上兩端 stateHash 一致）。
 * WebRTC 需 chromium。
 */
test.describe('Dungeon Bomber — online battle', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebRTC requires chromium');
  test.setTimeout(120_000);

  test('two browsers connect by room code and enter a synced versus match', async ({ browser }) => {
    const ctxHost = await browser.newContext();
    const ctxGuest = await browser.newContext();
    const host = await ctxHost.newPage();
    const guest = await ctxGuest.newPage();

    try {
      // 深連結直達 ONLINE 大廳入口（繞過選角；?online=1 → openOnline）。
      await host.goto('/games/bomber?online=1');
      await guest.goto('/games/bomber?online=1');

      // online entry 區塊（CREATE / JOIN）就緒
      await expect(host.locator('#online-create')).toBeVisible({ timeout: 20000 });
      await expect(guest.locator('#online-join-btn')).toBeVisible({ timeout: 20000 });

      // Host 建房 → 大廳出現大字房號
      await host.locator('#online-create').click();
      const room = await readRoom(host);
      expect(room).toMatch(/^[A-Z0-9]{5}$/);

      // Guest 以房號加入
      await guest.locator('#online-room-input').fill(room);
      await guest.locator('#online-join-btn').click();

      // Host 端等到 guest 連上（START 需 connectedGuests >= 1；以 START 鈕變 enabled 為信號）。
      // 先 host READY（START enable 條件：localReady && connectedGuests>=1）。
      await host.locator('#lobby-ready').click();
      await waitStartEnabled(host);

      // Host 開局：resolveStart → 兩端握手組 roster、廣播 init → bootOnline → startVersusOnline。
      await host.locator('#lobby-start').click();

      // 兩端都進入 versus（startVersusOnline 後才掛 __bomberVersusDebug.match）。
      await waitVersus(host);
      await waitVersus(guest);

      // ── 核心斷言：兩端都到 versus、2 名玩家、status==='playing' ──
      const h0 = await readMatch(host);
      const g0 = await readMatch(guest);
      expect(h0.players).toBe(2);
      expect(g0.players).toBe(2);
      expect(h0.status).toBe('playing');
      expect(g0.status).toBe('playing');

      // ── BONUS：驅動雙向輸入後，鎖步維持決定性同步 ──
      // 注意：故意「不」在尾端要求 status==='playing'——2 人小場放炸彈本來就可能分出勝負而
      // finished。鎖步的同步證明在於「共同確認幀上兩端 stateHash 一致」（含 status/winnerId），
      // 無論最終 playing 或 finished 皆成立。先讓鎖步空跑一下確認兩端推進。
      await host.waitForTimeout(800);

      // focus 各自 canvas（確保 keydown 抵達 window handler，並滿足 audio gesture）
      await host.locator('#bomber-canvas').click({ position: { x: 5, y: 5 } }).catch(() => {});
      await guest.locator('#bomber-canvas').click({ position: { x: 5, y: 5 } }).catch(() => {});

      // 雙向輸入：各放一顆炸彈再走開（host=KeyD、guest=KeyA），用 in-page dispatch 確保可靠
      // 觸達 window keydown handler。輕量輸入避免立刻自爆，讓鎖步多跑幾十幀可採樣到共同幀。
      await dispatchKey(host, 'Space');
      await dispatchKey(guest, 'Space');
      await dispatchKey(host, 'KeyD');
      await dispatchKey(guest, 'KeyA');
      await host.waitForTimeout(300);
      await dispatchKeyUp(host, 'KeyD');
      await dispatchKeyUp(guest, 'KeyA');

      // 讓鎖步把輸入消化掉、兩端追平
      await host.waitForTimeout(800);

      const h1 = await readMatch(host);
      const g1 = await readMatch(guest);

      // 鎖步持續推進、兩端確認幀接近（同機 loopback → 偏移很小）
      expect(h1.frame).toBeGreaterThan(30);
      expect(g1.frame).toBeGreaterThan(30);
      expect(Math.abs(h1.frame - g1.frame)).toBeLessThanOrEqual(8);

      // 決定性鎖步：找共同確認幀，兩端 stateHash 必須一致（無論 playing/finished）。
      const synced = await assertHashSyncAtCommonFrame(host, guest);
      expect(synced.matchedFrame).toBeGreaterThan(30);
      expect(synced.hostHash).toBe(synced.guestHash);
    } finally {
      await ctxHost.close();
      await ctxGuest.close();
    }
  });
});

/** 建房後房號顯示在大廳的大字房號 #lobby-code。 */
async function readRoom(page: Page): Promise<string> {
  const code = page.locator('#lobby-code');
  await expect(code).toContainText(/[A-Z0-9]{5}/, { timeout: 30000 });
  const text = (await code.textContent()) ?? '';
  return text.match(/[A-Z0-9]{5}/)?.[0] ?? '';
}

/** Host START 鈕在 (localReady && connectedGuests>=1) 時 enabled——以此為「guest 已連上」信號。 */
async function waitStartEnabled(page: Page): Promise<void> {
  const start = page.locator('#lobby-start');
  await expect(start).toBeVisible({ timeout: 30000 });
  await expect(start).toBeEnabled({ timeout: 45000 });
}

/** startVersusOnline 後才掛 __bomberVersusDebug.match。 */
async function waitVersus(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __bomberVersusDebug?: { match?: unknown } }).__bomberVersusDebug?.match),
    undefined,
    { timeout: 45000 },
  );
}

function readMatch(page: Page) {
  return page.evaluate(() => {
    const dbg = (window as unknown as {
      __bomberVersusDebug: {
        match: { getState(): { status: string; players: unknown[] }; stateHash(): string };
        lockstep?: { confirmedFrame: number };
      };
    }).__bomberVersusDebug;
    const s = dbg.match.getState();
    return {
      status: s.status,
      players: s.players.length,
      frame: dbg.lockstep?.confirmedFrame ?? 0,
      hash: dbg.match.stateHash(),
    };
  });
}

/** in-page dispatch keydown（確保可靠觸達 window keydown handler，與 bomber solo spec 一致）。 */
async function dispatchKey(page: Page, code: string): Promise<void> {
  await page.evaluate(
    (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })),
    code,
  );
}
async function dispatchKeyUp(page: Page, code: string): Promise<void> {
  await page.evaluate(
    (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true })),
    code,
  );
}

/**
 * 鎖步同步證明：在一段輪詢視窗內，各端記錄 {frame: hash}，找出兩端都採樣到的最高共同
 * confirmedFrame，回傳該幀兩端的 stateHash。決定性鎖步下兩者必相等。
 * （hash 只在「相同已確認幀」可比；同機 loopback 兩端 confirmedFrame 可能差幾幀，故取交集。）
 */
async function assertHashSyncAtCommonFrame(
  host: Page,
  guest: Page,
): Promise<{ matchedFrame: number; hostHash: string; guestHash: string }> {
  const sampleOnce = (page: Page) =>
    page.evaluate(() => {
      const dbg = (window as unknown as {
        __bomberVersusDebug: {
          match: { stateHash(): string };
          lockstep?: { confirmedFrame: number };
        };
      }).__bomberVersusDebug;
      return { frame: dbg.lockstep?.confirmedFrame ?? 0, hash: dbg.match.stateHash() };
    });

  const hostByFrame = new Map<number, string>();
  const guestByFrame = new Map<number, string>();

  // 採樣 ~3s（兩端鎖步持續推進；每輪兩端各取一次，記錄該幀的 hash）。
  for (let i = 0; i < 30; i++) {
    const [h, g] = await Promise.all([sampleOnce(host), sampleOnce(guest)]);
    hostByFrame.set(h.frame, h.hash);
    guestByFrame.set(g.frame, g.hash);
    await host.waitForTimeout(100);
  }

  // 取兩端都採樣到的最高共同幀。
  let matchedFrame = -1;
  for (const f of hostByFrame.keys()) {
    if (guestByFrame.has(f) && f > matchedFrame) matchedFrame = f;
  }
  if (matchedFrame < 0) {
    throw new Error(
      `no common confirmed frame sampled — host frames [${[...hostByFrame.keys()].join(',')}], ` +
        `guest frames [${[...guestByFrame.keys()].join(',')}]`,
    );
  }
  return {
    matchedFrame,
    hostHash: hostByFrame.get(matchedFrame)!,
    guestHash: guestByFrame.get(matchedFrame)!,
  };
}
